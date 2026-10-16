// What a car in the pit lane is doing, from the data up to the moment shown (a replay never looks ahead), and where
// across the lane it is drawn because of it (pitlane.js crossSection: the fast lane, its box in the inner lane).
//
// What the data gives (2026 Barcelona, Hamilton's stop: InPit set 8 s before the box, the standstill in the
// positions, InPit cleared and PitOut set at the pit exit, the stop's stationary time 0.1 s later, the new tyre stint
// 14 s after the car left): the car is in the pit lane, where along it, how fast, how long it has stood, its team's box
// (pitorder.js – the published order, or the stops seen), a penalty race control has given it and not yet seen served,
// and whether it starts from the pit lane (startplan.js). What it doesn't: which lane it is in (every car is on one
// line), what work is done at a stop (known only after the car has gone), why a car stands where it isn't its box.
// So a car is put in its box only where its team's box is known and it stands, or slows, there; standing anywhere else
// it stays in the fast lane – a queue, a red-flag wait, a car held behind another – and no standstill makes a box.
//
// Each result carries its evidence: which of the inputs it rests on.

export const PIT = {
  near: 30,      // m before its box where a car slowing from the limit starts across to it
  slow: [16, 21.5], // m/s: below the limit (80 km/h = 22.2 m/s) a car near its box is pulling in – at the limit, passing
  atBox: 6,      // m: standing within this of its box's place is standing at its box
  leave: 30,     // m after its box over which a car leaving it goes back to the fast lane
  ends: 40,      // m past either end of the garages' run over which a car goes from / to the feed's line
  still: 0.8,    // m/s: standing
  garage: 20,    // s: standing this long at its own box outside a race – it is wheeled into its garage (practice)
  garageIn: 4,   // s over which it goes in
};

const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// One car. c: { u (m along the garages; null: not in front of them), gStart, gEnd, inPit (the InPit flag),
//   onLane (its raw position on the measured pit path), speed (m/s), stillFor (s it has stood, 0 moving),
//   boxU (its team's box along the garages; null: not known), boxFrom ("order" | "stops" | null), penalty (null |
//   "drive-through" | "stop-go": given by race control, not yet served), pitStart (null | "queue" | "go"), race (bool),
//   teammateInBox (bool), lastBox: { endU, ago } (it left its box `ago` s ago at endU) or null }
// → { state, lane: "feed" | "fast" | "box" | "garage", w (0–1 of the way from the fast lane to the box, or into the
//   garage), evidence: [...] }
export function pitState(c, P = PIT) {
  const ev = [];
  if (c.inPit) ev.push("InPit flag");
  if (!c.inPit && !c.onLane) return { state: "track", lane: "feed", w: 0, evidence: ev };
  if (c.onLane) ev.push("position on the pit path");
  const standing = c.speed <= P.still;
  if (standing) ev.push(`standing ${c.stillFor.toFixed(1)} s`);
  // outside the garages' run: the entry and exit roads – the feed's line (eased to and from the lanes by the caller)
  if (c.u == null || c.u < c.gStart - P.ends || c.u > c.gEnd + P.ends) {
    if (c.pitStart) { ev.push("pit-lane start"); return { state: c.pitStart === "queue" ? "pit start: waiting" : "pit start: going", lane: "feed", w: 0, evidence: ev }; }
    return { state: c.u != null && c.u > c.gEnd ? "exit" : "entry", lane: "feed", w: 0, evidence: ev };
  }
  if (c.pitStart) { ev.push("pit-lane start"); return { state: c.pitStart === "queue" ? "pit start: waiting" : "pit start: going", lane: "fast", w: 0, evidence: ev }; }
  if (c.penalty === "drive-through") { ev.push("drive-through given by race control"); return { state: "drive-through", lane: "fast", w: 0, evidence: ev }; }
  const box = c.boxU != null;
  if (box) ev.push(`box (${c.boxFrom || "?"})`);
  const d = box ? c.u - c.boxU : null;   // + past its box
  if (standing) {
    if (box && Math.abs(d) <= P.atBox) {
      if (!c.race && c.stillFor >= P.garage) { ev.push("standing long outside a race"); return { state: "garage", lane: "garage", w: ss(P.garage, P.garage + P.garageIn, c.stillFor), evidence: ev }; }
      if (c.penalty === "stop-go") { ev.push("stop-and-go given by race control"); return { state: "stop-go", lane: "box", w: 1, evidence: ev }; }
      return { state: "in box", lane: "box", w: 1, evidence: ev };
    }
    // behind its box while a teammate is in it (a double stack): waits in the inner lane, where it stands
    if (box && c.teammateInBox && d < -P.atBox && d > -P.near - 10) { ev.push("teammate in the box"); return { state: "waiting (double stack)", lane: "box", w: 1, evidence: ev }; }
    return { state: box ? "queued" : "standing (no box known)", lane: "fast", w: 0, evidence: ev };
  }
  // leaving its box: back to the fast lane over `leave` m
  if (c.lastBox && c.lastBox.ago < 20 && box && c.u >= c.lastBox.endU - 1 && c.u - c.lastBox.endU < P.leave) {
    ev.push("left its box");
    return { state: "leaving box", lane: "box", w: 1 - ss(0, P.leave, c.u - c.lastBox.endU), evidence: ev };
  }
  // pulling in: before its box, slowing
  if (box && d < P.atBox && d > -P.near && c.penalty !== "drive-through") {
    const w = (1 - ss(0, P.near, -Math.min(0, d))) * (1 - ss(P.slow[0], P.slow[1], c.speed));
    if (w > 0) { ev.push("slowing before its box"); return { state: "to box", lane: "box", w, evidence: ev }; }
  }
  return { state: "fast lane", lane: "fast", w: 0, evidence: ev };
}

// How far across the lane a state puts a car (m out from the garages): the fast lane's centre, its box, between them
// by w; "feed": the feed's own line. Towards the ends of the garages' run the lanes give way to the feed's line.
//   cs: crossSection at the car's place; off: the feed's own offset there
export function laneOffsetOf(s, cs, off, u, gStart, gEnd, P = PIT) {
  if (!cs?.ok && !(cs?.fastC > 0)) return off;
  let want;
  if (s.lane === "feed") want = off;
  else if (s.lane === "garage") want = cs.boxC + (-2.5 - cs.boxC) * s.w;   // (into its garage, 2.5 m inside the front)
  else want = cs.fastC + ((cs.ok ? cs.boxC : cs.fastC) - cs.fastC) * (s.lane === "box" ? s.w : 0);
  const inRun = Math.min(ss(gStart - P.ends, gStart, u), 1 - ss(gEnd, gEnd + P.ends, u));
  return off + (want - off) * inRun;
}

// A team's crew, from its cars' states (crew.js draws it): "work" round the car in its box (not at a stop-and-go:
// no work is allowed), "hold" standing back by the garage at a stop-and-go, "ready" at the box while a car of the team
// comes down the lane to it (FIA 34.13: in the pit lane only just before the work), "back" walking back over the
// first `leave` m after it left; else none (in the garage).
//   cars: [{ num, state: pitState(...), u, boxU, lastBox }]
export function crewPhase(cars, P = PIT) {
  const inBox = cars.find((c) => c.state.state === "in box");
  if (inBox) return { phase: "work", num: inBox.num, f: 1 };
  const sg = cars.find((c) => c.state.state === "stop-go");
  if (sg) return { phase: "hold", num: sg.num, f: 1 };
  const coming = cars.filter((c) => c.boxU != null && ["fast lane", "to box", "entry", "waiting (double stack)"].includes(c.state.state) && c.u != null && c.u < c.boxU + P.atBox)
    .sort((a, b) => b.u - a.u)[0];
  if (coming) return { phase: "ready", num: coming.num, f: 1 - ss(60, 160, coming.boxU - coming.u) };
  const gone = cars.find((c) => c.state.state === "leaving box" || (c.lastBox && c.lastBox.ago < 8));
  if (gone) return { phase: "back", num: gone.num, f: 1 - ss(0, 8, gone.lastBox?.ago ?? 0) };
  return { phase: "none", num: null, f: 0 };
}

// The penalties race control has given and not yet seen served, by t: Map num → "drive-through" | "stop-go".
// rcm: [[t, message]] in time order (startplan.js StartHistory.rcm). The stewards' wording: "DRIVE THROUGH PENALTY
// FOR CAR 63 (RUS)", "10 SECOND STOP/GO PENALTY FOR CAR 87 (BEA)", "STOP AND GO …", and "PENALTY SERVED - …" when done.
export function pendingPenalties(rcm, t) {
  const out = new Map();
  for (const [tm, m] of rcm) {
    if (tm > t) break;
    const car = /FOR CAR (\d+)/.exec(m)?.[1]; if (!car) continue;
    const kind = /DRIVE THROUGH/.test(m) ? "drive-through" : /STOP\s*\/\s*GO|STOP AND GO|STOP-GO/.test(m) ? "stop-go" : null;
    if (!kind) continue;
    if (/PENALTY SERVED/.test(m)) { if (out.get(car) === kind) out.delete(car); }
    else if (!/REVIEWED|NO FURTHER|WITHDRAWN|CANCELLED/.test(m)) out.set(car, kind);
  }
  return out;
}

// From a car's telemetry ({ t: [ms], v: [km/h] }, lag: ms its clock runs ahead of the positions'): how long it has
// stood at t (s, 0 moving), and its last standstill of at least `min` s that ended within `within` s before t
// ({ t0, t1 } ms) – scanned back from t, the same after a seek as after playing up to it.
export function standingFor(car, t, lag = 0, still = 3) {
  if (!car?.t?.length) return 0;
  const T = car.t, V = car.v;
  let lo = 0, hi = T.length - 1;
  if (T[0] - lag > t) return 0;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] - lag <= t) lo = m; else hi = m; }
  let i = T[hi] - lag <= t ? hi : lo;
  if (V[i] > still) return 0;
  let j = i; while (j > 0 && V[j - 1] <= still && t - (T[j - 1] - lag) < 600000) j--;
  return (t - (T[j] - lag)) / 1000;
}
export function lastStand(car, t, lag = 0, within = 25, min = 1.2, still = 3) {
  if (!car?.t?.length) return null;
  const T = car.t, V = car.v;
  let i = T.length - 1; while (i >= 0 && T[i] - lag > t) i--;
  // back over the moving part, then the standstill
  while (i >= 0 && V[i] > still && t - (T[i] - lag) <= within * 1000) i--;
  if (i < 0 || V[i] > still) return null;
  const t1 = T[i] - lag; let j = i; while (j > 0 && V[j - 1] <= still) j--;
  const t0 = T[j] - lag;
  return t1 - t0 >= min * 1000 && t - t1 <= within * 1000 ? { t0, t1 } : null;
}
