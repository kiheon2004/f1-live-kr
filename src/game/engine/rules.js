// Season rules applied (DESIGN §10, request §12): penalties and how they are served, the stewards' procedures (pit-lane
// speeding, unsafe release, false start, VSC / SC infringements, track limits, blue flags), the dry-tyre rule, the
// classification, points. The rules themselves are data (data/rules/<season>.js, with articles and sources); where the
// regulations leave the choice to the stewards the game follows their observed practice (data/params/stewards.js).
//
// Engine hooks (all pure, state in race.state.control.stw and car.pen):
//   stewardsStep(race, T)        – each step after controlStep: race control's reports (false start, minimum-time
//                                  infringements), line crossings (drive-through / stop-and-go deadlines), blue flags,
//                                  pit-lane speed.
//   penalise(race, T, car, kind, why)   kind: "5s" | "10s" | "dt" | "sg" | "dsq" – with the last-three-laps conversion.
//   onPitEntry / pitCtx / onPitExit     – serving: 5/10 s at the next stop before any work; a stop-and-go with no work;
//                                  a drive-through without stopping (DT/S&G not under VSC / after SC deployment unless
//                                  already in the pit entry); within the line crossings the rules give.
//   trackLimits(race, T, car, info)     – a car off the track (incidents.js "wide", or the engine's edge check).
//   yieldRequest(race, car)      – blue flag shown to this car: the faster car it must let by (traffic acts on it).
//   classify(race, T)            – the final classification and points (also the unserved penalties and the tyre rule).
import { STEWARDS } from "../data/params/stewards.js";
import { lapsOf, lapPos, seasonRules, pitLimit } from "./control.js";

const DRY = new Set(["SOFT", "MEDIUM", "HARD", "C0", "C1", "C2", "C3", "C4", "C5", "C6"]);
const WET = new Set(["INTERMEDIATE", "INTER", "WET"]);
const SECS = { "5s": 5, "10s": 10, dt: 0, sg: 10 };
const NAME = { "5s": "5 SECOND TIME PENALTY", "10s": "10 SECOND TIME PENALTY", dt: "DRIVE THROUGH PENALTY", sg: "STOP-AND-GO PENALTY", dsq: "DISQUALIFIED" };

export function ensurePen(car) {
  const p = car.pen || (car.pen = {});
  p.pendingS ??= 0; p.finalS ??= 0; p.serve ??= []; p.dsq ??= null;
  return p;
}
function stw(race) {
  const c = race.state.control;
  return c.stw || (c.stw = { tl: {}, deleted: {}, blue: {}, speeding: {}, n: 0, final: false });
}
function msg(race, text, cars = [], cause = null) {
  const S = race.state, lap = (S.control?.laps?.flags?.length ?? 0) + 1;
  S.control.msgs.push({ t: S.t, lap, text });
  (S.log || (S.log = [])).push({ t: S.t, lap, cars, type: "stewards", cause, effect: text });
}
const leaderLapsDone = (race, T) => Math.max(0, ...race.state.cars.filter((c) => c.status !== "dnf").map((c) => lapsOf(c, T)));
const recalc = (p) => { p.pendingS = p.serve.filter((x) => !x.served && (x.kind === "5s" || x.kind === "10s")).reduce((a, x) => a + SECS[x.kind], 0); };

// ---------- penalties ----------
// Imposed during the last three laps (or after the race) the rules convert them to time added to the result:
// 2024–25 (SR 54.3): 5 s → +5, 10 s → +10, DT → +20, S&G → +30; 2026 (B1.9.5): in the last three laps only DT → +20 and
// S&G → +30 (5/10 s served or added as usual), after the session all four.
export function penalise(race, T, car, kind, why, { at = null } = {}) {
  const S = race.state, ctl = S.control, R = seasonRules(race).penalties.value, p = ensurePen(car), W = stw(race);
  if (kind === "dsq") { p.dsq = why; msg(race, `FIA STEWARDS: CAR ${car.num} DISQUALIFIED – ${why}`, [car.num], why); return { kind }; }
  const after = ctl.phase !== "racing" && ctl.phase !== "grid";
  const last3 = !after && ctl.fin.target - leaderLapsDone(race, T) <= 3;
  const conv = after ? (R.afterSession || R.lastThreeLapsOrAfter) : last3 ? (R.lastThreeLaps || R.lastThreeLapsOrAfter) : null;
  const key = { "5s": "fiveSec", "10s": "tenSec", dt: "driveThrough", sg: "stopGo" }[kind];
  const item = { id: ++W.n, kind, why, given: S.t, lap: lapsOf(car, T) + 1, served: false, crossings: 0, conv: null };
  if (conv && conv[key] != null) { item.conv = conv[key]; item.served = "converted"; p.finalS += conv[key]; }
  p.serve.push(item); recalc(p);
  msg(race, `FIA STEWARDS: ${NAME[kind]} FOR CAR ${car.num} – ${why}${item.conv != null ? ` (+${item.conv} S TO THE RESULT${after ? "" : ": LAST THREE LAPS"})` : ""}`, [car.num], why);
  return item;
}

// The pit visit: what this entry can serve. purpose: the call's (car.pit.call.purpose: "tyres" | "dt" | "sg" | …).
export function onPitEntry(race, T, car) {
  const ctl = race.state.control, p = ensurePen(car), call = car.pit?.call || {};
  // DT / S&G only under green (not VSC, not after SC deployment – SR 54.4b, B1.9.5); entering under the red flag or only
  // following the SC through the pit lane serves nothing (2026 wording; same applied to 2024–25)
  const canServe = ctl.flag === "green" && !call.red;
  const dt = canServe ? p.serve.find((x) => !x.served && x.kind === "dt") : null;
  const sg = canServe ? p.serve.find((x) => !x.served && x.kind === "sg") : null;
  const time = call.red ? [] : p.serve.filter((x) => !x.served && (x.kind === "5s" || x.kind === "10s"));
  const wantsDT = dt && (call.purpose === "dt" || (!call.compound && !sg));
  p.visit = { t: race.state.t, dt: wantsDT ? dt.id : null, sg: sg && !wantsDT ? sg.id : null, time: wantsDT ? [] : time.map((x) => x.id) };
  return p.visit;
}
// inputs to pit.js for this visit: { noBox (drive-through), penaltyS (held before any work), noWork (stop-and-go) }
export function pitCtx(race, car) {
  const p = ensurePen(car), v = p.visit;
  if (!v) return { noBox: false, penaltyS: 0, noWork: false };
  const held = v.time.reduce((a, id) => a + SECS[p.serve.find((x) => x.id === id).kind], 0) + (v.sg ? SECS.sg : 0);
  return { noBox: !!v.dt, penaltyS: held, noWork: !!v.sg };
}
// at the pit exit: mark what was served (a stop happened during this visit → the time penalties / S&G; no stop → the DT)
export function onPitExit(race, T, car) {
  const p = ensurePen(car), v = p.visit; if (!v) return [];
  const stopped = car.pit?.times?.stop != null && car.pit.times.stop >= v.t;
  const done = [];
  for (const x of p.serve) {
    if ((stopped && (v.time.includes(x.id) || v.sg === x.id)) || (!stopped && v.dt === x.id)) { x.served = race.state.t; done.push(x); }
  }
  p.visit = null; recalc(p);
  for (const x of done) msg(race, `FIA STEWARDS: PENALTY SERVED – ${NAME[x.kind]} FOR CAR ${car.num}`, [car.num]);
  return done;
}

// ---------- each step ----------
export function stewardsStep(race, T, P = STEWARDS) {
  const S = race.state, ctl = S.control, W = stw(race);
  // race control's reports
  for (const r of ctl.infr.splice(0)) {
    const car = S.cars.find((c) => c.num === r.num); if (!car) continue;
    if (r.kind === "falseStart") penalise(race, T, car, P.falseStart.v, "FALSE START – MOVING BEFORE SIGNAL");
    else if (r.kind === "vsc" || r.kind === "sc") { if (r.short > P.vscTol.v) penalise(race, T, car, P.vscInfringement.v, `${r.kind === "vsc" ? "VSC" : "SAFETY CAR"} INFRINGEMENT – ${r.short.toFixed(2)} S UNDER THE MINIMUM TIME`); }
  }
  // line crossings: DT / S&G must be served within maxLineCrossings (crossings behind the SC / under the VSC don't count)
  const maxX = seasonRules(race).penalties.value.driveThrough?.maxLineCrossings ?? 2;
  for (const x of ctl.stepCross) {
    const car = S.cars.find((c) => c.num === x.num), p = ensurePen(car);
    for (const it of p.serve) if (!it.served && (it.kind === "dt" || it.kind === "sg") && x.t > it.given && ctl.flag === "green" && !x.pit) {
      it.crossings++;
      if (it.crossings > maxX && !p.dsq) { const k = P.unserved.v; it.served = "failed"; if (k === "dsq") penalise(race, T, car, "dsq", `${NAME[it.kind]} NOT SERVED`); }
    }
  }
  // pit-lane speeding (SR 34.7 / B1.6.3a): over the limit inside the limiter zone, once per visit
  if (T.pit) for (const c of S.cars) {
    if (c.where !== "pit" || c.status !== "run") { if (W.speeding[c.num]) W.speeding[c.num] = false; continue; }
    const u = c.pit.u, v = c.pit.v, lim = pitLimit(race, T) + P.pitSpeedTol.v / 3.6;
    const limited = c.pit.phase === "lane" || c.pit.phase === "approach" || c.pit.phase === "queue" || c.pit.phase === "laneOut";
    if (limited && u >= T.pit.limStart && u <= T.pit.limEnd && v > lim + 1e-9 && !W.speeding[c.num]) {
      W.speeding[c.num] = true; penalise(race, T, c, P.pitSpeeding.v, `SPEEDING IN THE PIT LANE (${(v * 3.6).toFixed(1)} KM/H)`);
    }
  }
  blueFlags(race, T, P);
}

// ---------- blue flags ----------
// A car about to be lapped: a car a lap (or more) ahead in race distance comes up behind it on the track. Inside the
// pre-warning gap (3.0 s) it is told; inside 1.2 s the blue flag is shown and it must let the faster car by at the first
// opportunity (data/rules blueFlags: marshalling-system thresholds). Ignoring it: black-and-white flag, then a penalty.
function blueFlags(race, T, P) {
  const S = race.state, ctl = S.control, W = stw(race), B = seasonRules(race).blueFlags?.value;
  if (!B) return;
  const live = S.cars.filter((c) => c.status === "run" && c.where !== "pit");
  for (const c of live) {
    const pc = lapPos(c, T); let best = null;
    if (ctl.flag === "green" && ctl.phase === "racing") for (const f of live) {
      if (f === c || f.dist < c.dist + T.L / 2) continue;           // f must be (nearly) a lap ahead in the race
      const d = T.ahead(lapPos(f, T), pc); if (d > T.L / 2) continue; // and behind c on the track
      const g = d / Math.max(10, f.v);
      if (g <= B.preWarningGapS && (!best || g < best.g)) best = { f, g };
    }
    const cur = W.blue[c.num];
    if (!best) { if (cur) delete W.blue[c.num]; continue; }
    const blue = best.g <= B.blueGapS;
    if (!cur || cur.by !== best.f.num) W.blue[c.num] = { by: best.f.num, gapS: best.g, blue, since: blue ? S.t : null, warned: false, pen: false };
    else {
      cur.gapS = best.g; cur.blue = blue; if (blue && cur.since == null) cur.since = S.t;
      const shown = cur.since != null ? (S.t - cur.since) / 1000 : 0;
      if (shown > P.blueWarnS.v && !cur.warned) { cur.warned = true; msg(race, `BLACK AND WHITE FLAG FOR CAR ${c.num} – IGNORING BLUE FLAGS`, [c.num]); }
      if (shown > P.bluePenS.v && !cur.pen) { cur.pen = true; penalise(race, T, c, P.bluePenalty.v, "IGNORING BLUE FLAGS"); }
    }
  }
}
// the yield request traffic acts on: { to (the faster car's num), gapS, blue (true = must yield now), sinceS }
export function yieldRequest(race, car) {
  const b = race.state.control.stw?.blue?.[car.num];
  if (!b) return null;
  return { to: b.by, gapS: b.gapS, blue: b.blue, sinceS: b.since != null ? (race.state.t - b.since) / 1000 : 0 };
}

// ---------- track limits ----------
// Each time a car leaves the track (no part on it) its lap time is deleted (SR 33.3 + event notes); the stewards' ladder
// (data/params/stewards.js, from the FIA's own messages): black-and-white flag at the 3rd, 5 s at the 4th and each later.
export function trackLimits(race, T, car, { where = null } = {}, P = STEWARDS) {
  const W = stw(race), n = (W.tl[car.num] = (W.tl[car.num] || 0) + 1), lap = lapsOf(car, T) + 1, L = P.trackLimits.v;
  (W.deleted[car.num] || (W.deleted[car.num] = [])).push(lap);
  msg(race, `CAR ${car.num} TIME DELETED – TRACK LIMITS${where != null ? ` AT ${Math.round(where)} M` : ""} LAP ${lap}`, [car.num]);
  if (n === L.flagAt) msg(race, `BLACK AND WHITE FLAG FOR CAR ${car.num} – TRACK LIMITS`, [car.num]);
  if (n === L.penaltyAt) penalise(race, T, car, L.penalty, "TRACK LIMITS");
  else if (n > L.penaltyAt && L.eachAfter) penalise(race, T, car, L.eachAfter, `TRACK LIMITS (${n}TH OFFENCE)`);
  return { count: n, deletedLap: lap };
}

// ---------- other offences the engine reports ----------
export const onUnsafeRelease = (race, T, car, P = STEWARDS) => penalise(race, T, car, P.unsafeRelease.v, "UNSAFE RELEASE");
export const onCollision = (race, T, car, P = STEWARDS) => penalise(race, T, car, P.collision.v, "CAUSING A COLLISION");
export const onIllegalPass = (race, T, car, why = "OVERTAKING UNDER SAFETY CAR", P = STEWARDS) => penalise(race, T, car, P.scInfringement.v, `SAFETY CAR INFRINGEMENT – ${why}`);

// ---------- the dry-tyre rule ----------
// SR 30.5m / B6.3.6: in a dry race at least two different dry specifications, unless intermediates or wets were used;
// breach → disqualification; if the race was suspended and not resumed → +30 s instead. 2025 Monaco: at least three
// sets of any specification (+30 s for only two, +60 s for one when suspended and not resumed – otherwise DSQ). The
// FIA's "mandatory specification" (30.2c ii) is the scenario's (scenario.tyres.mandatory) – none → any two dry specs.
export function tyresUsed(race, car) {
  const set = new Set([...(car.laps || []).map((l) => l.compound), car.tyre?.compound, car.tyre?.startCompound, ...(car.tyreHist || [])].filter(Boolean).map((x) => String(x).toUpperCase()));
  const sets = 1 + (car.pit?.stops ?? 0) + (race.state.control.red?.changed?.[car.num] ? 1 : 0) + (car.redSets ?? 0);
  return { compounds: [...set], sets };
}
export function tyreRuleCheck(race, car) {
  const M = seasonRules(race).mandatoryDryCompounds?.value; if (!M) return { ok: true };
  const u = tyresUsed(race, car), suspended = !!race.state.control.redEnd;
  if (M.exemptIfInterOrWetUsed && u.compounds.some((c) => WET.has(c))) return { ok: true, why: "intermediate / wet tyres used" };
  const dry = u.compounds.filter((c) => DRY.has(c)), mand = race.scenario?.tyres?.mandatory;
  const monaco = M.monaco && /monaco/i.test(race.scenario?.meta?.event || race.scenario?.meta?.location || "");
  if (monaco && u.sets < M.monaco.minSetsAnySpec) return { ok: false, why: `${u.sets} set(s) used at Monaco (3 required)`, penalty: suspended ? `+${30 * (3 - u.sets)}s` : "dsq" };
  if (new Set(dry).size < M.minDistinctDrySpecs) return { ok: false, why: `only ${[...new Set(dry)].join("/") || "no"} dry specification used`, penalty: suspended ? "+30s" : "dsq" };
  if (mand && mand.length && !dry.some((c) => mand.includes(c))) return { ok: false, why: "no mandatory specification used", penalty: suspended ? "+30s" : "dsq" };
  return { ok: true };
}

// ---------- classification ----------
// SR 62 / B2.5.5: by laps completed, then by the order of crossing the Line – time penalties added to the elapsed time
// (so a penalty can only move a car among those on the same lap); classified with at least 90 % of the winner's laps,
// rounded down; disqualified cars excluded. The race ends with the leader's flag (distance or time limit) or, not resumed
// after a red flag, at the end of the penultimate lap before the suspension lap (SR 58.14 / B5.14.2).
export function finalizePenalties(race, T) {
  const W = stw(race), ctl = race.state.control; if (W.final) return; W.final = true;
  const R = seasonRules(race).penalties.value, conv = R.afterSession || R.lastThreeLapsOrAfter;
  for (const c of race.state.cars) {
    const p = ensurePen(c);
    for (const x of p.serve) if (!x.served) {
      if (x.kind === "5s" || x.kind === "10s") { x.served = "added"; p.finalS += SECS[x.kind]; }       // elected not to stop (SR 54.3a–b)
      else { const k = { dt: "driveThrough", sg: "stopGo" }[x.kind]; x.served = "converted"; x.conv = conv[k]; p.finalS += conv[k]; } // the flag came first (game choice: after-session values)
    }
    recalc(p);
    if (c.status === "fin" || (ctl.redEnd && c.status !== "dnf")) {
      const tr = tyreRuleCheck(race, c);
      if (!tr.ok) { if (tr.penalty === "dsq") penalise(race, T, c, "dsq", `TYRE RULE: ${tr.why}`); else { const s = +tr.penalty.slice(1, -1); p.finalS += s; msg(race, `FIA STEWARDS: +${s} S FOR CAR ${c.num} – TYRE RULE: ${tr.why}`, [c.num]); } }
    }
  }
}

export function classify(race, T) {
  const S = race.state, ctl = S.control, R = seasonRules(race);
  finalizePenalties(race, T);
  const cap = ctl.redEnd ? ctl.redEnd.lap : Infinity;
  const at = {};   // num → { laps, t (ms of its last counted crossing), order (crossing index on that lap) }
  ctl.cross.forEach((row, k) => { if (k + 1 > cap) return; row.forEach(([num, t], i) => { at[num] = { laps: k + 1, t, idx: i }; }); });
  const t0 = ctl.t0 ?? 0;
  const rows = S.cars.map((c) => {
    const a = at[c.num] || { laps: 0, t: Infinity, idx: 1e9 }, p = ensurePen(c);
    const elapsed = a.t === Infinity ? Infinity : a.t - t0;
    return { num: c.num, tla: c.tla, team: c.team, teamKey: c.teamKey, laps: a.laps, elapsedMs: elapsed, penS: p.finalS, totalMs: elapsed + p.finalS * 1000, idx: a.idx,
      status: p.dsq ? "dsq" : ctl.redEnd ? (c.status === "dnf" && a.laps < cap ? "dnf" : "fin") : c.status === "fin" ? "fin" : "dnf", out: c.out || null };
  });
  rows.sort((x, y) => (x.status === "dsq") - (y.status === "dsq") || y.laps - x.laps || x.totalMs - y.totalMs || x.idx - y.idx || String(x.num).localeCompare(String(y.num)));
  const ok = rows.filter((r) => r.status !== "dsq");
  const W = ok.length ? ok[0].laps : 0, frac = R.classification.value.minFracOfWinnerLaps;
  const minLaps = Math.floor(frac * W + 1e-9);
  let pos = 0;
  for (const r of rows) { r.classified = r.status !== "dsq" && r.laps >= minLaps && r.laps > 0; r.pos = r.classified ? ++pos : null; if (!r.classified && r.status !== "dsq") r.status = r.status === "fin" ? "nc" : "dnf"; }
  const win = rows[0];
  for (const r of rows) r.gap = !r.classified ? null : r.laps < win.laps ? { laps: win.laps - r.laps } : { s: (r.totalMs - win.totalMs) / 1000 };
  // points
  const sched = S.totalLaps, leadLaps = W, short = leadLaps < sched;
  let scale = R.points.value.race, why = "full distance";
  if (short && R.pointsShortened) {
    const PS = R.pointsShortened.value, flags = ctl.laps.flags.slice(0, leadLaps), clean = flags.map((m) => !(m & (4 | 8)));
    let green = 0, run = 0, best = 0; for (const x of clean) { run = x ? run + 1 : 0; best = Math.max(best, run); if (x) green++; }
    const greenOk = PS.greenLapsMustBeConsecutive ? best >= PS.minGreenLapsForReducedScale : green >= PS.minGreenLapsForReducedScale;
    const f = leadLaps / sched;
    if (leadLaps < PS.minLeaderLaps || !greenOk) { scale = []; why = leadLaps < PS.minLeaderLaps ? "leader under 2 laps" : "fewer than 2 laps without SC/VSC"; }
    else { const band = PS.bands.filter((b) => f >= b.fracMin).at(-1); scale = band.scale === "full" ? R.points.value.race : band.scale; why = `shortened: ${(f * 100).toFixed(0)} % of the distance`; }
  }
  // dead heat (SR 7.1): points of the tied positions added and shared
  const cl = rows.filter((r) => r.classified);
  for (let i = 0; i < cl.length;) {
    let j = i; while (j + 1 < cl.length && cl[j + 1].laps === cl[i].laps && cl[j + 1].totalMs === cl[i].totalMs) j++;
    const sum = cl.slice(i, j + 1).reduce((a, _, k) => a + (scale[i + k] || 0), 0);
    for (let k = i; k <= j; k++) { cl[k].points = sum / (j - i + 1); if (j > i) cl[k].deadHeat = true; }
    i = j + 1;
  }
  for (const r of rows) r.points ??= 0;
  // fastest lap (valid laps: not deleted for track limits); the 2024 point
  const fl = fastestLap(race, T, cap);
  const FL = R.points.value.fastestLap;
  if (FL && fl && leadLaps / sched >= FL.notIfLeaderBelowFrac) {
    const r = rows.find((x) => x.num === fl.num);
    if (r && r.classified && r.pos <= FL.onlyIfClassifiedInTop && scale.length) { r.points += FL.points; r.fastestLapPoint = true; }
  }
  const res = { rows, leaderLaps: leadLaps, scheduledLaps: sched, minLaps, pointsWhy: why, fastestLap: fl, ended: ctl.redEnd ? "red" : ctl.fin.reason, season: R.season };
  S.results = res;
  return res;
}

export function fastestLap(race, T, cap = Infinity) {
  const ctl = race.state.control, W = stw(race), last = {}, t0 = ctl.t0 ?? 0;
  let best = null;
  ctl.cross.forEach((row, k) => {
    if (k + 1 > cap) return;
    for (const [num, t] of row) {
      const prev = k === 0 ? t0 : last[num]; last[num] = t;
      if (prev == null || k === 0) continue;            // (lap 1 from the grid is not a flying lap)
      if ((W.deleted[num] || []).includes(k + 1)) continue;
      const lt = t - prev; if (!best || lt < best.ms) best = { num, lap: k + 1, ms: lt };
    }
  });
  return best;
}
