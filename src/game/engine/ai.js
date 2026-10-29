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
import * as CMD from "./commands.js";
import { teamModel, publicView, planCandidates, evaluate, scenarios, prepTraffic, trafficHold, toPlan, lapTime, degPart, wearAt, pitLoss, ltOfMu, DRY, WETS } from "./strategy.js";
import { streamFor } from "./rng.js";
import { AI, TEAM_TENDENCY } from "../data/params/ai.js";
import { PIT } from "../data/params/pit.js";
import { WEATHER } from "../data/params/weather.js";

export const AI_STATE_VERSION = 1;

// state for the teams the AI runs (all by default). userTeam: the player's team – the AI runs it too, but hands off
// each car (by order kind) once the player has given that car an order of that kind.
export function newAiState(race, { teams = null } = {}) {
  const S = race.state, all = [...new Set(S.cars.map((c) => c.teamKey))], run = teams || all, out = { v: AI_STATE_VERSION, teams: {}, seen: {}, lastFlag: "green", fcIssue: -1, order: S.order.slice(), passes: 0, passLaps: 0, work: { decisions: 0, events: 0 } };
  for (const team of run) {
    const r = streamFor(S.seed, `ai:tend:${team}`), c = TEAM_TENDENCY[team] || {};
    // tendencies drawn per race around the (shared) centre: no team is always the cautious one or always the quick one
    const tend = { risk: +((c.risk ?? AI.risk) + AI.riskSd * r.normal()).toFixed(3), delay: +Math.max(1, (c.delay ?? AI.delay) + AI.delaySd * r.normal()).toFixed(2), hyst: +Math.max(0.3, (c.hysteresis ?? AI.hysteresis) + AI.hystSd * r.normal()).toFixed(2) };
    const cars = {}; for (const car of S.cars.filter((x) => x.teamKey === team)) cars[car.num] = { lastLap: 0, nextFull: 0, falloff: 0, trafficAt: 0, modes: [], events: 0, wearLn: 0, wearN: 0 };
    out.teams[team] = { tend, est: { g: 1, s: 1, Sdy: 0, Sdd: 0, nWear: 0, off: {}, lane: null, nLane: 0, passDelta: null, stintLife: {} }, cars, pending: [], fcMax: null, evLap: -1, evN: 0, decisions: [] };
  }
  for (const c of S.cars) out.seen[c.num] = { inPit: c.where === "pit", tIn: null };
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
      const st = { num, lap: 0, total: S.totalLaps, cur: null, used: [], sets: 0 };
      // (traffic from the grid: equal pace for everyone before any lap is run – what the team can say before the start)
      const tctx = prepTraffic(M, est, view, num);
      const ev = evaluate(M, est, st, planCandidates(M, est, st, { top: 4 }), scns);
      for (const c of ev) { const stops = []; let lap = 0; for (let i = 0; i < c.stints.length - 1; i++) { lap += c.stints[i].laps; stops.push({ lap, compound: c.stints[i + 1].compound }); } c.hold = trafficHold(tctx, stops); }
      ev.sort((a, b) => a.mean + risk * a.sdRel + a.hold - (b.mean + risk * b.sdRel + b.hold));
      if (ev[0]) plans[num] = { stints: toPlan(st, ev[0]), by: "ai:" + team, modes: ev[0].stints.map((s) => s.mode) };
    }
  }
  return plans;
}

// ---------- the per-step hook ----------
export function aiStep(race) {
  const S = race.state, A = S.ai; if (!A || S.finished || S.phase === "grid") return;
  const t = S.t, flag = S.control?.flag || "green";
  // public observations every step: cars entering / leaving the pit lane (lane times are public), the flag
  for (const c of S.cars) {
    const o = A.seen[c.num], inPit = c.where === "pit";
    if (inPit && !o.inPit) { o.tIn = t; rivalStop(race, c); }
    if (!inPit && o.inPit && o.tIn != null) { const lane = (t - o.tIn) / 1000; for (const team in A.teams) learnLane(A.teams[team].est, lane); o.tIn = null; }
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
      if (flag !== "green") cs.dirty = true;
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

// the lap just finished: lap-time offset (clean laps), wear factor (own wear reading), falloff, passing difficulty
function learnLap(race, team, car) {
  const S = race.state, TS = S.ai.teams[team], cs = TS.cars[car.num], est = TS.est, M = teamModel(race, team);
  if (est.lane == null) est.lane = M.lanePrior;
  const l = car.laps[car.laps.length - 1]; if (!l) return;
  const traffic = car.acct.traffic - cs.trafficAt; cs.trafficAt = car.acct.traffic;
  const dirty = cs.dirty; cs.dirty = false;
  const age = Math.max(0, car.tyre.laps - 1), mode = car.mode.pace;
  if (!l.pit && l.n > 1 && !dirty && traffic < 0.3 && car.tyre.laps >= 2 && l.compound === car.tyre.name) {
    // y: the lap less the model's age-0 lap (fuel included); d: the model's degradation at this age → y ≈ off + s·d
    const y = l.t - lapTime(M, { g: est.g, s: 1 }, car.num, l.compound, mode, 0, 0, l.fuel ?? M.fuelRef), d = degPart(M, est, car.num, l.compound, mode, age + 0.5);
    const off = est.off[car.num], res = y - (est.s ?? 1) * d - (off ?? 0);
    if (Number.isFinite(y) && Math.abs(y - d) < 15) {
      const a = off == null ? y - (est.s ?? 1) * d : off + AI.lapOffGain * res; est.off[car.num] = +a.toFixed(3);
      est.Sdy = (est.Sdy || 0) + d * (y - a); est.Sdd = (est.Sdd || 0) + d * d;
      const lam = AI.priorLaps * 4; est.s = +Math.min(2.5, Math.max(0.2, (lam + est.Sdy) / (lam + est.Sdd))).toFixed(4);
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

const touched = (race, num, kinds) => { const cs = race.state.commands; return cs.log.some((c) => c.by === "player" && c.car === num && kinds.includes(c.type)) || cs.queue.some((c) => c.by === "player" && c.car === num && kinds.includes(c.type)); };
function order(race, team, car, type, args) {
  const S = race.state, id = `ai:${team}:${car?.num ?? "team"}:${type}:${S.t}`;
  return CMD.submit(S.commands, S.t, { id, type, car: car?.num ?? null, team, args, by: "ai:" + team });
}

// ---------- one decision for one car ----------
function decide(race, team, car, why) {
  const S = race.state, TS = S.ai.teams[team], cs = TS.cars[car.num], est = TS.est, M = teamModel(race, team);
  const isUser = S.userTeam === team, handsPlan = isUser && touched(race, car.num, ["pit", "pitCancel", "plan"]);
  if (car.where === "pit" || (car.pit.phase !== "none" && car.pit.phase !== "called") || S.control?.flag === "red") return;
  if (car.lap >= S.totalLaps - 1) return;
  if (est.lane == null) est.lane = M.lanePrior;
  est.stintLife = stintLife(M, est, S.totalLaps);
  const view = publicView(race, team, { forecast: forecastOf(race) });
  const st = { num: car.num, lap: car.lap, total: S.totalLaps, cur: { name: car.tyre.name, age: car.tyre.laps }, used: [...new Set([...car.laps.map((l) => l.compound), car.tyre.name])], sets: 1 + car.pit.stops, fuel: car.energy.fuel };
  const nextStop = (car.plan?.stints || []).find((x) => x.toLap > car.lap && x !== car.plan.stints[car.plan.stints.length - 1]);
  const inWindow = nextStop && nextStop.toLap - car.lap <= AI.window;
  const full = why !== "lap" || inWindow || car.lap >= cs.nextFull || view.water > 0.1 || view.flag !== "green";
  if (!handsPlan && full) {
    cs.nextFull = car.lap + AI.replanEvery; S.ai.work.decisions++;
    const flag = view.flag === "sc" || view.flag === "vsc" ? view.flag : "green";
    let cands = planCandidates(M, est, st, { flag, top: 4 });
    // the present plan as a candidate (continuing it costs nothing to decide)
    const cur = planAsCandidate(car, st, cs.modes); if (cur) cands.push(cur);
    // weather: box now for a wet tyre / back to slicks (the reactive rule decides later laps in the scenarios)
    if (view.water > 0.05 || view.rain > 0.1 || view.forecast.blocks.slice(0, 3).some((b) => b.pRain > 0.3))
      for (const w of [...WETS, ...M.av.dry]) if (w !== car.tyre.name && M.vs[w] && st.total - st.lap > 1) cands.push({ stints: [{ compound: car.tyre.name, laps: 1, mode: car.mode.pace }, { compound: w, laps: st.total - st.lap - 1, mode: "balanced" }], stops: 1, tag: "weather" });
    const scns = scenarios(M, est, view, `${car.num}:${S.t}`);
    let ev = evaluate(M, est, st, cands, scns, { fuel: car.energy.fuel, burn: M.fuelPerLap });
    // traffic over the next laps for each candidate's next stop, and the teammate's box (a queue when both come in together)
    const mate = S.cars.find((o) => o.teamKey === team && o.num !== car.num && o.status === "run");
    const mateStop = mate?.plan?.stints?.find((x) => x.toLap > mate.lap && x !== mate.plan.stints[mate.plan.stints.length - 1])?.toLap ?? null;
    const gapMate = mate ? Math.abs(mate.dist - car.dist) / (race.cache.T.L / view.lapS) : Infinity;
    const tctx = prepTraffic(M, est, view, car.num);
    for (const c of ev) {
      const stops = []; { let lap = st.lap; for (let i = 0; i < c.stints.length - 1; i++) { lap += c.stints[i].laps; stops.push({ lap, compound: c.stints[i + 1].compound }); } }
      const stop = stops[0]?.lap ?? null;
      c.hold = trafficHold(tctx, stops);
      c.queue = stop != null && stop === mateStop && gapMate < PIT.workBase.v + AI.queueMargin + 2 ? Math.max(0, PIT.workBase.v + AI.queueMargin - gapMate * 0.5) : 0;
      c.score = c.mean + TS.tend.risk * c.sdRel + c.hold + c.queue;
    }
    ev.sort((a, b) => a.score - b.score);
    const best = ev[0], now = cur ? ev.find((c) => c.tag === "current") : null;
    const change = best && (!now || (best.tag !== "current" && best.score < now.score - TS.tend.hyst));
    if (change) {
      const plan = toPlan(st, best);
      order(race, team, car, "plan", { stints: plan });
      cs.modes = best.stints.map((s, i) => ({ toLap: plan[i].toLap, mode: s.mode }));
      if (car.pit.phase === "called" && best.stints[0].laps > 1) order(race, team, car, "pitCancel", {});
      // under SC/VSC, box now is called directly (the plan's call would wait for this lap's line)
      if (best.stints[0].laps === 1 && car.pit.phase === "none" && flag !== "green") order(race, team, car, "pit", { compound: best.stints[1].compound });
      TS.decisions.push({ t: S.t, lap: car.lap, num: car.num, why, plan: plan.map((x) => `${x.compound[0]}${x.toLap}`).join("-"), gain: now ? +(now.score - best.score).toFixed(1) : null, hold: +best.hold.toFixed(1),
        alts: ev.slice(0, 4).map((c) => `${c.tag === "current" ? "*" : ""}${c.stints.map((x) => x.compound[0] + x.laps).join("-")} ${(c.mean - best.mean).toFixed(1)}+${c.hold.toFixed(1)}`) });
      if (TS.decisions.length > 60) TS.decisions.shift();
    }
  }
  // pace: the plan's mode for this stint (the DP picked it: manage stretches a stint, attack only pays on short ones)
  if (!(isUser && touched(race, car.num, ["pace"]))) {
    const m = cs.modes.find((x) => x.toLap > car.lap)?.mode || "balanced";
    if (car.mode.pace !== m) order(race, team, car, "pace", { mode: m });
  }
  // energy: harvest when the store is low, push when close behind a car (a pass is possible), else balanced
  if (!(isUser && touched(race, car.num, ["energy"]))) {
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

// the car's present plan as a candidate from the state now (stints still to run; the current stint's in-lap ≥ next lap)
function planAsCandidate(car, st, modes = []) {
  const p = car.plan?.stints; if (!p?.length) return null;
  const rest = p.filter((x) => x.toLap > st.lap); if (!rest.length) return null;
  const stints = []; let lap = st.lap;
  for (let i = 0; i < rest.length; i++) { const to = i === rest.length - 1 ? st.total : Math.max(lap + 1, rest[i].toLap); stints.push({ compound: i === 0 ? car.tyre.name : rest[i].compound, laps: to - lap, mode: modes.find((m) => m.toLap >= to)?.mode || car.mode.pace }); lap = to; if (lap >= st.total) break; }
  if (lap < st.total) stints[stints.length - 1].laps += st.total - lap;
  return { stints, stops: stints.length - 1, tag: "current" };
}
