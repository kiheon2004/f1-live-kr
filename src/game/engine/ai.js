// Team AI (DESIGN §1 ai.js, request §13): every team's strategist – and the player's team's defaults while the player
// gives no orders for a car. It acts ONLY through the engine's orders (commands.js submit with by "ai:<team>": pace,
// energy, pit, pitCancel, plan, teamOrder – exactly what the player can send), never by editing the race state, and it
// reads only what strategy.js's publicView / the team's own cars give it (no other team's tyre wear, fuel or modes, no
// weather truth beyond now, no future incidents).
//
// Cadence (bounded work):
//   – once a lap per car, when the car crosses the line (the lap just finished is the newest data; a "box this lap"
//     decision there is still before the pit commit point on every fixture circuit): learn from that lap, then a full
//     re-plan if the next stop is within AI.window laps, every AI.replanEvery laps, or when an event is pending –
//     otherwise only pace/energy checks;
//   – events (each after the team's reaction delay): SC/VSC deployed or ended, the forecast's next-hour rain chance
//     jumping, a rival close on the road stopping (undercut threat), the own car's laps falling off the model; at most
//     AI.maxEvents event re-plans per team per lap.
// State: race.state.ai (plain JSON, saved and restored with the race). The team models (strategy.js teamModel) are
// derived data in race.cache, rebuilt identically from the scenario + seed on load.
import { commandAs } from "./engine.js";   // (a cycle engine ↔ ai: only called at run time, both loaded by then)
import { kindOf } from "./commands.js";
import { stockMap, stockOf } from "./inventory.js";
import { teamModel, publicView, planCandidates, evaluate, scenarios, crossoverGains, freshCosts, prepTraffic, trafficHold, toPlan, lapTime, degPart, wearAt, lastClean, pitLoss, ltOfMu, DRY, WETS } from "./strategy.js";
import { streamFor } from "./rng.js";
import { AI, TEAM_TENDENCY } from "../data/params/ai.js";
import { PIT } from "../data/params/pit.js";
import { WEATHER } from "../data/params/weather.js";

export const AI_STATE_VERSION = 1;

// state for the teams the AI runs (all by default). userTeam: the player's team – the AI runs it too, kind by kind
// (pace / energy / plan) as engine.js's ownership says (state.own: an APPLIED player order takes a kind, "delegate"
// gives it back; a refused order changes nothing – v0.50 §3-1).
export function newAiState(race, { teams = null } = {}) {
  const S = race.state, all = [...new Set(S.cars.map((c) => c.teamKey))], run = teams || all, out = { v: AI_STATE_VERSION, teams: {}, seen: {}, lastFlag: "green", fcIssue: -1, order: S.order.slice(), passes: 0, passLaps: 0, work: { decisions: 0, events: 0 } };
  for (const team of run) {
    const r = streamFor(S.seed, `ai:tend:${team}`), c = TEAM_TENDENCY[team] || {};
    // tendencies drawn per race around the (shared) centre: no team is always the cautious one or always the quick one
    const tend = { risk: +((c.risk ?? AI.risk) + AI.riskSd * r.normal()).toFixed(3), delay: +Math.max(1, (c.delay ?? AI.delay) + AI.delaySd * r.normal()).toFixed(2), hyst: +Math.max(0.3, (c.hysteresis ?? AI.hysteresis) + AI.hystSd * r.normal()).toFixed(2) };
    const cars = {}; for (const car of S.cars.filter((x) => x.teamKey === team)) cars[car.num] = { lastLap: 0, nextFull: 0, falloff: 0, trafficAt: 0, modes: [], events: 0, wearLn: 0, wearN: 0 };
    out.teams[team] = { tend, est: { g: 1, s: 1, Sdy: 0, Sdd: 0, nWear: 0, off: {}, lane: null, nLane: 0, passDelta: null, stintLife: {} }, cars, pending: [], fcMax: null, evLap: -1, evN: 0, decisions: [] };
  }
  for (const c of S.cars) out.seen[c.num] = { inPit: c.where === "pit", tIn: null, lap: 0, dirty: false };
  return out;
}

// pre-race plans for the AI teams (start tyre + stints) – computed on a race created for this seed and then handed to
// createRace({ plans }) like the player's pre-race choices
export function aiPrePlans(race, teams = null) {
  const S = race.state, plans = {}, run = teams || [...new Set(S.cars.map((c) => c.teamKey))];
  for (const team of run) {
    const M = teamModel(race, team), r = streamFor(S.seed, `ai:tend:${team}`), risk = AI.risk + AI.riskSd * r.normal();
    const est = { g: 1, off: {}, lane: M.lanePrior, stintLife: {} }, view = publicView(race, team); view.lapS = ltOfMu(M, 0.95 * M.muTrack * M.pace);
    const scns = scenarios(M, est, view, "pre");
    for (const num of M.nums) {
      const carS = S.cars.find((c) => c.num === num), st = { num, lap: 0, total: S.totalLaps, cur: null, used: [], sets: 0, stock: carS?.sets ? Object.fromEntries(Object.entries(stockMap(carS)).map(([k, v]) => [k, v + (carS.sets.some((x) => x.state === "fitted" && x.compound === k) ? 1 : 0)])) : null };
      // (traffic from the grid: equal pace for everyone before any lap is run – what the team can say before the start)
      const tctx = prepTraffic(M, est, view, num), tctx2 = prepTraffic(M, est, view, num, { rivals: "long" });
      const ev = evaluate(M, est, st, planCandidates(M, est, st, { top: 4 }), scns);
      // the teammate's first stop already planned: the same in-lap costs the second car a queue (cars a few places apart
      // on the grid run close early on – the gap guessed from the grid slots, ≈ 0.3 s per place)
      const mate = M.nums.find((n) => n !== num && plans[n]), mateStop = mate ? plans[mate].stints[0].toLap : null;
      const gm = mate ? 0.3 * Math.abs((S.cars.find((c) => c.num === num).grid ?? 20) - (S.cars.find((c) => c.num === mate).grid ?? 20)) : Infinity;
      for (const c of ev) { const stops = []; let lap = 0; for (let i = 0; i < c.stints.length - 1; i++) { lap += c.stints[i].laps; stops.push({ lap, compound: c.stints[i + 1].compound }); } c.hold = (trafficHold(tctx, stops) + trafficHold(tctx2, stops)) / 2;
        c.queue = stops[0]?.lap === mateStop && gm < PIT.workBase.v + AI.queueMargin ? PIT.workBase.v + AI.queueMargin - gm : 0; }
      ev.sort((a, b) => a.mean + risk * a.sdRel + a.hold + a.queue - (b.mean + risk * b.sdRel + b.hold + b.queue));
      if (ev[0]?.queue > 0 && ev[0].stints.length > 1) {   // one lap either side of the clash
        const sh = [-1, 1].map((d) => { const x = ev[0].stints.map((y) => ({ ...y })); x[0].laps += d; x[1].laps -= d; return { stints: x, stops: ev[0].stops }; }).filter((c) => c.stints[0].laps >= 1 && c.stints[1].laps >= 1);
        for (const c of evaluate(M, est, st, sh, scns)) { c.hold = ev[0].hold; c.queue = 0; ev.push(c); }
        ev.sort((a, b) => a.mean + risk * a.sdRel + a.hold + a.queue - (b.mean + risk * b.sdRel + b.hold + b.queue));
      }
      if (ev[0]) plans[num] = { stints: toPlan(st, ev[0]), by: "ai:" + team, modes: ev[0].stints.map((s) => s.mode) };
    }
  }
  return plans;
}

// ---------- the per-step hook ----------
export function aiStep(race) {
  const S = race.state, A = S.ai; if (!A || S.finished || S.phase === "grid") return;
  const t = S.t, flag = S.control?.flag || "green";
  // (a wet track slows every lap: such laps say nothing about tyre degradation – they're left out of the learning like
  // laps under a flag; v0.51: slicks in a shower read as "falloff" and the AI changed 2-lap-old sets, British 2025 seed 4)
  const hl = race.cache.surface?.hLine; let wl = 0; if (hl) { if (t % 1000 === 0 || race.cache.aiWet == null) { for (const x of hl) wl += x; race.cache.aiWet = wl / hl.length > AI.wetLearn; } }
  const wetNow = !!race.cache.aiWet;
  // public observations every step: cars entering / leaving the pit lane (lane times are public), the flag
  for (const c of S.cars) {
    const o = A.seen[c.num], inPit = c.where === "pit";
    if (inPit && !o.inPit) { o.tIn = t; rivalStop(race, c); }
    if (!inPit && o.inPit && o.tIn != null) { const lane = (t - o.tIn) / 1000; for (const team in A.teams) learnLane(A.teams[team].est, lane); o.tIn = null; }
    if (flag !== "green" || wetNow) o.dirty = true;
    // a lap completed by any car: its time, compound and tyre age are public – every team learns the compounds'
    // degradation from the whole field (laps run close behind another car, or under a flag, are left out: held, not slow)
    if (c.lap > (o.lap ?? 0)) {
      o.lap = c.lap; const dirty = o.dirty; o.dirty = false;
      let gapAhead = Infinity; for (const x of S.cars) if (x !== c && x.status === "run" && x.where === "lap" && x.dist > c.dist) gapAhead = Math.min(gapAhead, (x.dist - c.dist) / Math.max(20, c.v));
      if (!dirty && gapAhead > AI.heldGapS) for (const team in A.teams) learnPublic(race, team, c);
    }
    o.inPit = inPit;
  }
  if (flag !== A.lastFlag) { for (const team in A.teams) queue(race, team, { kind: "flag:" + flag }); A.lastFlag = flag; }
  // forecast re-issued → a jump in the next hour's rain chance re-plans
  const issue = Math.floor(t / (WEATHER.fcEvery.v * 60000));
  if (issue !== A.fcIssue) {
    A.fcIssue = issue; const fc = forecastOf(race), pm = Math.max(0, ...fc.blocks.slice(0, 4).map((b) => b.pRain));
    for (const team in A.teams) { const T = A.teams[team]; if (T.fcMax != null && Math.abs(pm - T.fcMax) >= AI.fcJump) queue(race, team, { kind: "forecast" }); T.fcMax = pm; }
  }
  // the lap decisions (own cars crossing the line) and due events
  for (const team in A.teams) {
    const TS = A.teams[team];
    for (const num in TS.cars) {
      const car = S.cars.find((c) => c.num === num), cs = TS.cars[num];
      if (car.status !== "run") continue;
      if (car.lap > cs.lastLap) { cs.lastLap = car.lap; learnLap(race, team, car); decide(race, team, car, "lap"); }
      if (flag !== "green" || wetNow) cs.dirty = true;
    }
    if (TS.pending.length && TS.pending[0].tDue <= t) {
      const due = TS.pending.filter((p) => p.tDue <= t); TS.pending = TS.pending.filter((p) => p.tDue > t);
      if (TS.evLap !== S.leaderLap) { TS.evLap = S.leaderLap; TS.evN = 0; }
      if (TS.evN < AI.maxEvents) { TS.evN++; A.work.events++; for (const num in TS.cars) { const car = S.cars.find((c) => c.num === num); if (car.status === "run") decide(race, team, car, due.map((d) => d.kind).join(",")); } }
    }
  }
  // overtaking seen in the public order (not through the pits) → how hard passing is here
  if (t % 5000 === 0) {
    const run = S.order.filter((n) => { const c = S.cars.find((x) => x.num === n); return c.status === "run" && c.where === "lap"; });
    const prev = new Map(A.order.map((n, i) => [n, i])); let p = 0;
    for (let i = 1; i < run.length; i++) { const a = prev.get(run[i - 1]), b = prev.get(run[i]); if (a != null && b != null && a > b) p++; }
    A.passes += p; A.order = run;
  }
}

const forecastOf = (race) => (race.cache.forecastFn ? race.cache.forecastFn(race) : publicView(race, null).forecast);

function queue(race, team, ev) {
  const TS = race.state.ai.teams[team]; if (!TS) return;
  if (TS.pending.some((p) => p.kind === ev.kind)) return;
  TS.pending.push({ ...ev, tDue: race.state.t + Math.round(TS.tend.delay * 1000) }); TS.pending.sort((a, b) => a.tDue - b.tDue);
}
// a car stopping: every team with a car close on the road to it re-checks its timing (undercut / cover)
function rivalStop(race, c) {
  const S = race.state, A = S.ai, T = race.cache.T, lapS = 90, vRef = T.L / lapS;
  for (const team in A.teams) {
    if (team === c.teamKey) continue;
    const M = race.cache.aiModels?.[team]; const win = (M ? pitLoss(M, A.teams[team].est) : 20) + AI.rivalWin;
    if (S.cars.some((o) => o.teamKey === team && o.status === "run" && Math.abs(o.dist - c.dist) / vRef < win)) queue(race, team, { kind: "rivalStop:" + c.num });
  }
}

function learnLane(est, lane) {
  if (!(lane > 5 && lane < 120)) return;
  // (a stop with a queue or a slow wheel is in the public time too: a median-ish update – weight shrinks on outliers)
  const prior = est.lane; if (prior == null) { est.lane = lane; est.nLane = 1; return; }
  const d = lane - prior, w = AI.laneObsW / (1 + Math.abs(d) / 4);
  est.lane = +(prior + w * d).toFixed(3); est.nLane++;
}

// one public lap of any car → the team's degradation scale per compound (y ≈ α_car + s_c·d: y the lap less the model's
// age-0 lap at that car's estimated fuel, d the model's degradation at its tyre age; α per car, s per compound – ridge
// toward 1 with priorLaps of weight). A rival's fuel and pace mode are not public: fuel from the race distance, mode balanced.
function learnPublic(race, team, c) {
  const S = race.state, TS = S.ai.teams[team], est = TS.est, M = teamModel(race, team), l = c.laps[c.laps.length - 1];
  if (!l || !lastClean(c.laps) || c.tyre.laps < 2 || l.compound !== c.tyre.name || !DRY.includes(l.compound)) return;
  const own = c.teamKey === team, mode = own ? c.mode.pace : "balanced", fuel = own ? (l.fuel ?? M.fuelRef) : Math.max(0, M.fuel0 - M.fuelPerLap * l.n);
  const num = own ? c.num : M.nums[0], age = c.tyre.laps - 0.5;
  const y = l.t - lapTime(M, { g: est.g, s: 1 }, num, l.compound, mode, 0, 0, fuel), d = degPart(M, est, num, l.compound, mode, age);
  if (!Number.isFinite(y) || Math.abs(y - d) > 15) return;
  est.offR ||= {}; est.sdy ||= {}; est.sdd ||= {}; est.sc ||= {};
  const sc = est.sc[l.compound] ?? est.s ?? 1, a0 = est.offR[c.num], a = a0 == null ? y - sc * d : a0 + AI.lapOffGain * (y - sc * d - a0);
  est.offR[c.num] = +a.toFixed(3);
  if (a0 == null) return;   // (the first lap only sets the car's level)
  est.sdy[l.compound] = (est.sdy[l.compound] || 0) + d * (y - a); est.sdd[l.compound] = (est.sdd[l.compound] || 0) + d * d;
  const lam = AI.priorLaps * 4;
  est.sc[l.compound] = +Math.min(2.5, Math.max(0.2, (lam + est.sdy[l.compound]) / (lam + est.sdd[l.compound]))).toFixed(4);
  let sy = 0, sd = 0; for (const k in est.sdy) { sy += est.sdy[k]; sd += est.sdd[k]; } est.s = +Math.min(2.5, Math.max(0.2, (lam + sy) / (lam + sd))).toFixed(4);
}

// the lap just finished: lap-time offset (clean laps), wear factor (own wear reading), falloff, passing difficulty
function learnLap(race, team, car) {
  const S = race.state, TS = S.ai.teams[team], cs = TS.cars[car.num], est = TS.est, M = teamModel(race, team);
  if (est.lane == null) est.lane = M.lanePrior;
  const l = car.laps[car.laps.length - 1]; if (!l) return;
  const traffic = car.acct.traffic - cs.trafficAt; cs.trafficAt = car.acct.traffic;
  const dirty = cs.dirty; cs.dirty = false;
  if (cs.predLap === car.lap && !dirty && !l.pit) { est.trR = +((est.trR || 0) + Math.max(0, traffic)).toFixed(3); est.trP = +((est.trP || 0) + cs.predHold).toFixed(3); }
  const age = Math.max(0, car.tyre.laps - 1), mode = car.mode.pace;
  if (lastClean(car.laps) && !dirty && traffic < 0.3 && car.tyre.laps >= 2 && l.compound === car.tyre.name) {
    // y: the lap less the model's age-0 lap (fuel included); d: the model's degradation at this age → y ≈ off + s·d
    const y = l.t - lapTime(M, { g: est.g, s: 1 }, car.num, l.compound, mode, 0, 0, l.fuel ?? M.fuelRef), d = degPart(M, est, car.num, l.compound, mode, age + 0.5);
    const off = est.off[car.num], res = y - (est.s ?? 1) * d - (off ?? 0);
    if (Number.isFinite(y) && Math.abs(y - d) < 15) {
      const a = off == null ? y - (est.s ?? 1) * d : off + AI.lapOffGain * res; est.off[car.num] = +a.toFixed(3);
      cs.falloff = off != null && res > AI.falloff ? cs.falloff + 1 : 0;
      if (cs.falloff >= 2) { queue(race, team, { kind: "falloff:" + car.num }); cs.falloff = 0; }
    }
  }
  // wear: the team's reading of its own tyre (± its sensor/model error) against what its table says for this age
  const r = streamFor(S.seed, `ai:obs:${team}:${car.num}:${car.lap}`), obs = car.tyre.wear + AI.wearObsSd * r.normal(), a = car.tyre.laps;
  if (a >= 2 && obs > 0.05 && obs < 0.9 && !WETS.includes(car.tyre.name)) {
    const tab = M.vs[car.tyre.name]?.[mode]?.wear; if (tab) { let k = 0; while (k < tab.length - 1 && tab[k + 1] < obs) k++; const f = tab[k + 1] > tab[k] ? (obs - tab[k]) / (tab[k + 1] - tab[k]) : 0, gObs = (k + f) / a;
      if (gObs > 0.2 && gObs < 5) { cs.wearLn += Math.log(gObs); cs.wearN++; } }
    let sl = 0, n = 0; for (const k in TS.cars) { sl += TS.cars[k].wearLn; n += TS.cars[k].wearN; }
    est.g = +Math.exp(sl / (AI.priorLaps + n)).toFixed(4); est.nWear = n;
  }
  // passing: the public order's on-track passes per car-lap so far → the pace margin a pass needs here
  const A = S.ai; if (S.leaderLap >= AI.passLearn) { const rate = A.passes / Math.max(1, S.leaderLap * S.cars.length); const base = M.street ? AI.passDeltaStreet : AI.passDelta; est.passDelta = +(base * Math.min(8, Math.max(0.5, 0.05 / Math.max(0.002, rate)))).toFixed(2); }
}

// typical stint length per compound the team expects (for guessing the rivals' stops): from its own best plan's stints
function stintLife(M, est, total) {
  const out = {}; for (const c of M.av.dry) { let n = 1; for (; n < M.A; n++) if (lapTime(M, est, M.nums[0], c, "balanced", n) - lapTime(M, est, M.nums[0], c, "balanced", 0) > pitLoss(M, est) / Math.max(4, n) * 2) break; out[c] = Math.min(total, n); }
  return out;
}

// does someone other than the team AI decide this kind for this car now? The ownership state (engine.js: only applied
// orders move it); while a player order of that kind waits for its step the AI holds off too (if the engine refuses it,
// the queue empties and the AI carries on). A race from before v0.50 without ownership: its applied player orders.
const HOLD = { pace: ["pace", "goal", "delegate"], energy: ["energy", "goal", "delegate"], plan: ["pit", "pitCancel", "plan", "delegate"] };
function controlled(race, num, kind) {
  const S = race.state, own = S.own?.[num], cs = S.commands;
  if (own) { if (own[kind] !== "ai") return true; }
  else if (cs.log.some((c) => c.by === "player" && c.ok && c.car === num && kindOf(c.type) === kind)) return true;
  return cs.queue.some((c) => c.by === "player" && c.car === num && HOLD[kind].includes(c.type));
}
function order(race, team, car, type, args) {
  const S = race.state, id = `ai:${team}:${car?.num ?? "team"}:${type}:${S.t}`;
  return commandAs(race, { id, type, car: car?.num ?? null, team, args }, "ai:" + team);
}

// ---------- one decision for one car ----------
function decide(race, team, car, why) {
  const S = race.state, TS = S.ai.teams[team], cs = TS.cars[car.num], est = TS.est, M = teamModel(race, team);
  const isUser = S.userTeam === team, handsPlan = isUser && controlled(race, car.num, "plan");
  if (car.where === "pit" || (car.pit.phase !== "none" && car.pit.phase !== "called") || S.control?.flag === "red") return;
  if (car.lap >= S.totalLaps - 1) return;
  if (est.lane == null) est.lane = M.lanePrior;
  est.stintLife = stintLife(M, est, S.totalLaps);
  const view = publicView(race, team, { forecast: forecastOf(race) });
  const st = { num: car.num, lap: car.lap, total: S.totalLaps, cur: { name: car.tyre.name, age: car.tyre.laps }, used: [...new Set([...car.laps.map((l) => l.compound), car.tyre.name])], sets: 1 + car.pit.stops, fuel: car.energy.fuel, stock: car.sets ? stockMap(car) : null };
  const nextStop = (car.plan?.stints || []).find((x) => x.toLap > car.lap && x !== car.plan.stints[car.plan.stints.length - 1]);
  const inWindow = nextStop && nextStop.toLap - car.lap <= AI.window;
  const wetTyre = WETS.includes(car.tyre.name);
  // the water trend this car's team has seen at its lap decisions (the last 3 laps) – the evidence a family switch needs:
  // to wet-weather tyres only while it rains or the water is rising (or the track is properly wet), back to slicks only when
  // it has stopped raining and the water is not rising; and not straight back within AI.familyMinLaps (v0.50 §5-5)
  if (why === "lap" || why.startsWith("lap")) { (cs.wh ||= []).push(+view.water.toFixed(3)); if (cs.wh.length > 3) cs.wh.shift(); }
  const rising = (cs.wh?.length >= 2) && cs.wh[cs.wh.length - 1] > cs.wh[cs.wh.length - 2] + 0.005;
  const famOk = (to) => {
    const toWet = WETS.includes(to); if (toWet === wetTyre) return true;
    const recent = car.lap - (cs.switchLap ?? -99) < AI.familyMinLaps;
    if (toWet) return view.water >= AI.wetNow || (!recent && (view.rain > 0.1 || rising));
    return !recent && view.rain <= 0.1 && !rising;
  };
  // the tyre-family check every lap: box for the other family when a fresh set of it is expected to be clearly faster
  // over the next laps – the water expected there from the forecast scenarios (rain coming → it rises, a dry forecast →
  // it falls), the model corrected by what the field is doing on each compound right now (public lap times: the
  // crossover teams watch). The same rule the scenarios assume for later laps.
  if (!handsPlan && (view.water > 0.02 || view.rain > 0.1 || wetTyre || view.forecast.blocks.slice(0, 2).some((b) => b.pRain > 0.3)) && car.pit.phase === "none" && S.totalLaps - car.lap > 2) {
    const corr = conditionCorr(race, team, M, est, view), K = Math.min(10, S.totalLaps - car.lap - 1);
    // (just switched: switching back needs a further margin – one lap's reading is noisy)
    const need = pitLoss(M, est, view.flag) + AI.switchDelta * (car.lap - (cs.switchLap ?? -9) < 4 ? 3 : 1);
    let best = null, bg = need;
    const gains = crossoverGains(M, est, view, car.num, { name: car.tyre.name, age: car.tyre.laps, fuel: car.energy.fuel }, { K, corr, key: `${car.num}:${car.pit.stops}:w` });
    // (the crossover rule is for a change of FAMILY – slicks ↔ wet-weather tyres; a dry-for-dry change is the planner's,
    // with its minimum stint: v0.51, after a shower the rule boxed soft → medium three laps after the slicks went on)
    for (const c in gains) if (gains[c] > bg && WETS.includes(c) !== wetTyre && famOk(c) && (!car.sets || stockOf(car, c, ["free", "reserved"]) > 0)) { bg = gains[c]; best = c; }
    // a stop the plan makes in the next two laps anyway: no extra stop to pay for – only the right tyre for it
    const ns = nextStopOf(car), imminent = ns && ns.toLap - car.lap <= 2;
    if (imminent && !best) {
      const fc = freshCosts(M, est, view, car.num, { K, corr, key: `${car.num}:${car.pit.stops}:w`, fuel: car.energy.fuel });
      let pick = ns.compound; for (const c in fc) if (fc[c] < (fc[pick] ?? Infinity) - AI.switchDelta && famOk(c) && (!car.sets || stockOf(car, c, ["free", "reserved"]) > 0)) pick = c;
      if (pick !== ns.compound && WETS.includes(pick) !== WETS.includes(ns.compound)) {
        const stints = [{ compound: car.tyre.name, toLap: ns.toLap }, { compound: pick, toLap: S.totalLaps }];
        order(race, team, car, "plan", { stints }); cs.modes = [{ toLap: S.totalLaps, mode: "balanced" }]; cs.nextFull = car.lap + 2; cs.switchLap = ns.toLap; cs.lockLap = ns.toLap + 1;
        TS.decisions.push({ t: S.t, lap: car.lap, num: car.num, why: why + ",plannedStopTyre", plan: `${ns.compound}→${pick}@${ns.toLap}`, water: +view.water.toFixed(3), corr });
        return;
      }
    }
    if (best) {
      order(race, team, car, "plan", { stints: [{ compound: car.tyre.name, toLap: car.lap + 1 }, { compound: best, toLap: S.totalLaps }] });
      cs.modes = [{ toLap: S.totalLaps, mode: "balanced" }]; cs.nextFull = car.lap + 2; cs.switchLap = car.lap + 1; cs.lockLap = car.lap + 2;
      TS.decisions.push({ t: S.t, lap: car.lap, num: car.num, why: why + ",crossover", plan: `→${best}`, gain: +bg.toFixed(1), water: +view.water.toFixed(3), corr });
      return;
    }
  }
  // (a tyre-family switch just ordered stands until its stop is made: a re-plan from an event in between – a rival's stop,
  // a forecast update – would otherwise put the dry plan back before the order is even carried out)
  if (cs.lockLap != null && car.lap < cs.lockLap) return;
  const full = why !== "lap" || inWindow || car.lap >= cs.nextFull || view.water > 0.02 || wetTyre || view.flag !== "green";
  if (!handsPlan && full) {
    cs.nextFull = car.lap + AI.replanEvery; S.ai.work.decisions++;
    const flag = view.flag === "sc" || view.flag === "vsc" ? view.flag : "green";
    const corrNow = view.water > 0.02 || view.rain > 0.1 || wetTyre ? conditionCorr(race, team, M, est, view) : null;
    // dry plans only while on slicks (a wet tyre's plan: stay on it – the crossover check brings the slicks)
    let cands = wetTyre ? [] : planCandidates(M, est, st, { flag, top: 4 });
    // a set of the same family fitted only a few laps ago is not changed again before AI.minStint laps (a family switch is
    // the crossover rule's, above) – v0.51
    if (!wetTyre && car.tyre.laps < AI.minStint) cands = cands.filter((c) => !(c.stints.length > 1 && c.stints[0].laps < AI.minStint - car.tyre.laps));
    // rain likely within the next half hour of the game's forecast: no stop for fresh slicks in the next laps – the stop
    // for wet-weather tyres is coming (v0.51: dry stops three laps before switching to intermediates)
    const pSoon = Math.max(0, ...(view.forecast?.blocks || []).slice(0, 2).map((b) => b.pRain || 0));
    if (!wetTyre && pSoon >= AI.rainHold) cands = cands.filter((c) => !(c.stints.length > 1 && c.stints[0].laps <= 3 && !WETS.includes(c.stints[1].compound)));
    // the present plan as a candidate (continuing it costs nothing to decide)
    const cur = planAsCandidate(car, st, cs.modes); if (cur) cands.push(cur);
    // weather: box now for a wet tyre / back to slicks (the reactive rule decides later laps in the scenarios)
    const scns = scenarios(M, est, view, `${car.num}:${car.pit.stops}`);   // (the same draws for the whole stint: plans compared on common scenarios don't flip on sampling noise)
    // (under SC / VSC: "box now" only on tyres that have done AI.scMinAge laps, once per neutralisation – v0.50 §5-5)
    const scPeriod = flag !== "green" ? `${flag}:${S.control?.sc?.t0 ?? S.control?.vsc?.t0 ?? ""}` : null;
    if (scPeriod && (car.tyre.laps < AI.scMinAge || cs.scStop === scPeriod)) cands = cands.filter((c) => !(c.stints[0].laps === 1 && c.stints.length > 1));
    let ev = evaluate(M, est, st, cands, scns, { fuel: car.energy.fuel, burn: M.fuelPerLap, corr: corrNow });
    if (!ev.length) return;
    // traffic over the next laps for each candidate's next stop, and the teammate's box (a queue when both come in together)
    const mate = S.cars.find((o) => o.teamKey === team && o.num !== car.num && o.status === "run");
    const mateStop = mate?.plan?.stints?.find((x) => x.toLap > mate.lap && x !== mate.plan.stints[mate.plan.stints.length - 1])?.toLap ?? null;
    const gapMate = mate ? Math.abs(mate.dist - car.dist) / (race.cache.T.L / view.lapS) : Infinity;
    // before any rival has stopped their plans are a guess: the forecast averages two (they stop at their tyres' life /
    // they run long to about half distance); after that the "life" guess with each rival's observed tyre age
    const anyStop = view.cars.some((c) => c.team !== team && c.stops > 0);
    const tctx = prepTraffic(M, est, view, car.num), tctx2 = anyStop ? null : prepTraffic(M, est, view, car.num, { rivals: "long" });
    // the traffic forecast calibrated on the team's own cars: the time they really lost in traffic (own data) against what
    // the forecast said for those laps (prior: 5 s of agreement)
    const kHold = Math.min(AI.kHoldMax, Math.max(1 / AI.kHoldMax, (5 + (est.trR || 0)) / (5 + (est.trP || 0))));
    const score = (c) => {
      const stops = []; { let lap = st.lap; for (let i = 0; i < c.stints.length - 1; i++) { lap += c.stints[i].laps; stops.push({ lap, compound: c.stints[i + 1].compound }); } }
      const o = {}, o2 = {}; let h = trafficHold(tctx, stops, o), h1 = o.first ?? 0;
      if (tctx2) { h = (h + trafficHold(tctx2, stops, o2)) / 2; h1 = (h1 + (o2.first ?? 0)) / 2; }
      c.hold = h * kHold; c.hold1 = h1 * kHold;
      // the second car into the box waits for the first one's stop (the team pays it whichever car it is)
      c.queue = stops.length && stops[0].lap === mateStop && gapMate < PIT.workBase.v + AI.queueMargin ? PIT.workBase.v + AI.queueMargin - gapMate : 0;
      c.score = c.mean + TS.tend.risk * c.sdRel + c.hold + c.queue;
      return c;
    };
    ev.forEach(score);
    // a clash with the teammate: the same plan one lap either side, scored the same way
    ev.sort((a, b) => a.score - b.score);
    if (ev[0].queue > 0 && ev[0].stints.length > 1) {
      const sh = [-1, 1].map((d) => { const x = ev[0].stints.map((y) => ({ ...y })); x[0].laps += d; x[1].laps -= d; return { stints: x, stops: ev[0].stops, tag: "shift" }; }).filter((c) => c.stints[0].laps >= 1 && c.stints[1].laps >= 1);
      ev.push(...evaluate(M, est, st, sh, scns, { fuel: car.energy.fuel, burn: M.fuelPerLap, corr: corrNow }).map(score));
    }
    ev.sort((a, b) => a.score - b.score);
    const best = ev[0], now = cur ? ev.find((c) => c.tag === "current") : null;
    // (against flip-flopping – v0.50 §5-5, seen by the game helper: Hungary seed 1 LEC re-planned S49·S → S50·M → S49·S on
    // laps 44–48): a plan the team dropped in the last AI.revertLaps laps, or the same tyres with a stop moved by a lap or
    // two, needs a larger gain than the team's usual hysteresis
    const keyOf = (c) => { const pl = toPlan(st, c); return pl.map((x) => x.compound[0] + x.toLap).join("-"); }, shape = (c) => c.stints.map((x) => x.compound[0]).join("");
    let need = TS.tend.hyst;
    if (best && now && best.tag !== "current") {
      const k = keyOf(best);
      if ((cs.dropped || []).some((d) => d.key === k && car.lap - d.lap <= AI.revertLaps)) need = TS.tend.hyst * AI.revertK;
      else if (shape(best) === shape(now) && best.stints.length > 1 && Math.abs(best.stints[0].laps - now.stints[0].laps) <= 2) need = TS.tend.hyst * AI.tweakK;
    }
    const change = best && (!now || (best.tag !== "current" && best.score < now.score - need));
    if (change && now) { (cs.dropped ||= []).push({ key: keyOf(now), lap: car.lap }); if (cs.dropped.length > 6) cs.dropped.shift(); }
    const run = change ? best : now; if (run) { cs.predHold = +(run.hold1 / kHold).toFixed(3); cs.predLap = car.lap + 1; }
    if (change && corrNow && best.stints.length > 1) {
      // wet or drying: the tyre for the plan's next stop chosen for the water expected then (the dry DP doesn't know it)
      const fc = freshCosts(M, est, view, car.num, { K: Math.min(10, S.totalLaps - car.lap - 1), corr: corrNow, key: `${car.num}:${car.pit.stops}:w`, fuel: car.energy.fuel });
      const want = best.stints[1].compound; let pick = want; for (const c in fc) if (fc[c] < (fc[pick] ?? Infinity) - AI.switchDelta && famOk(c) && (!car.sets || stockOf(car, c, ["free", "reserved"]) > 0)) pick = c;
      if (WETS.includes(pick) !== WETS.includes(want)) best.stints[1].compound = pick;
    }
    if (change) {
      const plan = toPlan(st, best);
      order(race, team, car, "plan", { stints: plan });
      cs.modes = best.stints.map((s, i) => ({ toLap: plan[i].toLap, mode: s.mode }));
      if (car.pit.phase === "called" && best.stints[0].laps > 1) order(race, team, car, "pitCancel", {});
      // under SC/VSC, box now is called directly (the plan's call would wait for this lap's line)
      if (best.stints[0].laps === 1 && car.pit.phase === "none" && flag !== "green") { order(race, team, car, "pit", { compound: best.stints[1].compound }); cs.scStop = scPeriod; }
      TS.decisions.push({ t: S.t, lap: car.lap, num: car.num, why, plan: plan.map((x) => `${x.compound[0]}${x.toLap}`).join("-"), gain: now ? +(now.score - best.score).toFixed(1) : null, hold: +best.hold.toFixed(1),
        alts: ev.slice(0, 4).map((c) => `${c.tag === "current" ? "*" : ""}${c.stints.map((x) => x.compound[0] + x.laps).join("-")} ${(c.mean - best.mean).toFixed(1)}+${c.hold.toFixed(1)}`) });
      if (TS.decisions.length > 60) TS.decisions.shift();
    }
  }
  // pace: the plan's mode for this stint (the DP picked it: manage stretches a stint, attack only pays on short ones)
  if (!(isUser && controlled(race, car.num, "pace"))) {
    const m = cs.modes.find((x) => x.toLap > car.lap)?.mode || "balanced";
    if (car.mode.pace !== m) order(race, team, car, "pace", { mode: m });
  }
  // energy: harvest when the store is low, push when close behind a car (a pass is possible), else balanced
  if (!(isUser && controlled(race, car.num, "energy"))) {
    const soc = car.energy.soc / race.cache.ep.ers.socWindow, ahead = view.cars.find((c) => c.pos === view.cars.find((x) => x.num === car.num).pos - 1);
    const close = ahead && ahead.status === "run" && (view.cars.find((x) => x.num === car.num).gap - ahead.gap) < 1.0;
    const want = soc < 0.2 ? "harvest" : close && soc > 0.5 ? "push" : "balanced";
    if (car.mode.energy !== want) order(race, team, car, "energy", { mode: want });
  }
  // team order: the car behind on fresher tyres stuck behind its teammate → swap; once apart again → free
  if (!isUser) {
    const mate = S.cars.find((o) => o.teamKey === team && o.num !== car.num && o.status === "run");
    const pol = S.teamOrders?.[team]?.policy || "free";
    if (mate && car.dist < mate.dist) {
      const gap = (mate.dist - car.dist) / (race.cache.T.L / view.lapS);
      const dPace = lapTime(M, est, mate.num, mate.tyre.name, mate.mode.pace, mate.tyre.laps) - lapTime(M, est, car.num, car.tyre.name, car.mode.pace, car.tyre.laps);
      if (pol === "free" && gap < 1.0 && dPace > 0.5 && S.totalLaps - car.lap > 5) order(race, team, null, "teamOrder", { policy: "swap", first: car.num });
      else if (pol === "swap" && gap > 3) order(race, team, null, "teamOrder", { policy: "free" });
    }
  }
}

// what the field's latest laps say about each compound in the conditions now: median of (lap − the team's model for that
// compound, age and the water now − the car's usual offset) over cars that finished a clean lap in the last 150 s
function conditionCorr(race, team, M, est, view) {
  const S = race.state, by = {};
  for (const c of S.cars) {
    const l = lastClean(c.laps); if (!l || c.status !== "run" || S.t - (c.lapT0 ?? 0) > 150000 || l.compound !== c.tyre.name) continue;
    const fuel = Math.max(0, M.fuel0 - M.fuelPerLap * l.n), off = est.offR?.[c.num] ?? 0;
    const r = l.t - lapTime(M, { g: est.g, sc: est.sc, s: est.s }, M.nums[0], l.compound, "balanced", Math.max(0, c.tyre.laps - 0.5), view.water, fuel) - off;
    if (Number.isFinite(r)) (by[l.compound] ||= []).push(r);
  }
  const out = {}; for (const k in by) if (by[k].length >= 2) { const a = by[k].sort((x, y) => x - y); out[k] = +a[a.length >> 1].toFixed(2); }
  return out;
}

const nextStopOf = (car) => { const p = car.plan?.stints || []; for (let i = 0; i < p.length - 1; i++) if (p[i].toLap > car.lap) return { toLap: p[i].toLap, compound: p[i + 1].compound }; return null; };

// the car's present plan as a candidate from the state now (stints still to run; the current stint's in-lap ≥ next lap)
function planAsCandidate(car, st, modes = []) {
  const p = car.plan?.stints; if (!p?.length) return null;
  const rest = p.filter((x) => x.toLap > st.lap); if (!rest.length) return null;
  const stints = []; let lap = st.lap;
  for (let i = 0; i < rest.length; i++) { const to = i === rest.length - 1 ? st.total : Math.max(lap + 1, rest[i].toLap); stints.push({ compound: i === 0 ? car.tyre.name : rest[i].compound, laps: to - lap, mode: modes.find((m) => m.toLap >= to)?.mode || car.mode.pace }); lap = to; if (lap >= st.total) break; }
  if (lap < st.total) stints[stints.length - 1].laps += st.total - lap;
  return { stints, stops: stints.length - 1, tag: "current" };
}
