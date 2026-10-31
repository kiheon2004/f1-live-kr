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

import { q5, outLenFrom, inLenTo } from "./pitpath.js";

export const PIT = {
  near: 30,      // m before its box where a car slowing from the limit starts across to it
  slow: [16, 21.5], // m/s: below the limit (80 km/h = 22.2 m/s) a car near its box is pulling in – at the limit, passing
  atBox: 10,     // m: standing within this of its box's place is standing at its box – never more than half the way to
                 // the next team's box (the caller's boxTol: boxes are 17–30 m apart); the measured place of a team's box
                 // can be a car's length off its stops of the day
  creep: 7,      // m/s: slower than this behind its box while the teammate is in it – queueing (a double stack)
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
//   teammateInBox (bool), lastBox: { endU, ago } (it left its box `ago` s ago at endU) or null, retired (bool: the
//   Retired or Stopped flag), retiredFor (s since that flag was set) }
// → { state, lane: "feed" | "fast" | "box" | "garage", w (0–1 of the way from the fast lane to the box, or into the
//   garage), evidence: [...] }
export function pitState(c, P = PIT) {
  const ev = [];
  if (c.inPit) ev.push("InPit flag");
  if (!c.inPit && !c.onLane) return { state: "track", lane: "feed", w: 0, evidence: ev };
  if (c.onLane) ev.push("position on the pit path");

  const standing = c.speed <= P.still || c.stillFor > 0.3;
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
  const tol = Math.min(P.atBox, c.boxTol ?? P.atBox);
  // retired or stopped: nobody works on it. Standing, it is wheeled off the lane into the garage where it stands (along
  // the lane where the feed last had it), eased in over `garageIn` s from the flag or the standstill, whichever came last –
  // an ESTIMATE: the feed says nothing of it, but a retired car isn't left in the lane the others drive and stop in
  // (v0.44: 2025 Monaco, Gasly's car – retired at 1:10:41 – stood for the rest of the race in Williams' box, where both
  // Williams stopped, the feed's position frozen there). Still moving: the fast lane, or its box if it is there.
  if (c.retired) {
    ev.push("retired / stopped (timing)");
    if (standing) { ev.push("wheeled into the garage (estimate)"); return { state: "retired", lane: "garage", w: ss(0, P.garageIn, Math.min(c.retiredFor ?? Infinity, c.stillFor)), evidence: ev }; }
    // (v0.53: moving, on this visit's own way – into its box and out – like any car: v0.52 put it straight in its box
    // or the fast lane by the box's tolerance, a jump across)
    if (c.visit?.ways && box) { const s = visitState(c, d, tol, standing, ev, P); s.state = "retired"; return s; }
    return { state: "retired", lane: box && Math.abs(d) <= tol ? "box" : "fast", w: 1, evidence: ev };
  }
  // v0.53: this pit visit's own stops (c.visit – visitPlan: where it stood in the inner lane, where at its box, from its
  // positions; the record's whole visit in a replay, up to now live) and the ways in and out at its box (pitpath.js
  // boxWays: this circuit's distance across and room to the next boxes)
  if (c.visit?.ways) return visitState(c, d, tol, standing, ev, P);
  if (standing) {
    // behind its box while a teammate is in it (a double stack): waits in the inner lane, where it stands – even within
    // the box's tolerance (the second car stops a car's length or two behind the first: never "in box" with it)
    if (box && c.teammateInBox && d < -2 && d > -P.near - 10) { ev.push("teammate in the box"); return { state: "waiting (double stack)", lane: "box", w: 1, evidence: ev }; }
    if (box && Math.abs(d) <= tol) {
      if (!c.race && c.stillFor >= P.garage) { ev.push("standing long outside a race"); return { state: "garage", lane: "garage", w: ss(P.garage, P.garage + P.garageIn, c.stillFor), evidence: ev }; }
      if (c.penalty === "stop-go") { ev.push("stop-and-go given by race control"); return { state: "stop-go", lane: "box", w: 1, evidence: ev }; }
      return { state: "in box", lane: "box", w: 1, evidence: ev };
    }
    return { state: box ? "queued" : "standing (no box known)", lane: "fast", w: 0, evidence: ev };
  }
  // leaving its box: back to the fast lane over `leave` m
  if (c.lastBox && c.lastBox.ago < 20 && box && c.u >= c.lastBox.endU - 1 && c.u - c.lastBox.endU < P.leave) {
    ev.push("left its box");
    return { state: "leaving box", lane: "box", w: 1 - ss(0, P.leave, c.u - c.lastBox.endU), evidence: ev };
  }
  // creeping up behind its box while a teammate is in it: a double stack too – the real second car seldom stands still,
  // it crawls up at walking pace (Canada 2026 lap 31: Leclerc at 2–5 m/s, 5–11 m behind Hamilton for 4 s)
  if (box && c.teammateInBox && d < -2 && d > -P.near - 10 && c.speed < P.creep) { ev.push("teammate in the box", "creeping behind it"); return { state: "waiting (double stack)", lane: "box", w: 1, evidence: ev }; }
  // pulling in: before its box, slowing
  if (box && d < tol && d > -P.near && c.penalty !== "drive-through") {
    const w = (1 - ss(0, P.near, -Math.min(0, d))) * (1 - ss(P.slow[0], P.slow[1], c.speed));
    if (w > 0) { ev.push("slowing before its box"); return { state: "to box", lane: "box", w, evidence: ev }; }
  }
  return { state: "fast lane", lane: "fast", w: 0, evidence: ev };
}

// v0.53 (§8): the state from the visit's own stops – the way across a function of the place along the lane alone
// (pitpath.js), so it is continuous in place, heading and curvature, and the same place gives the same pose:
//   - before its first stand in the inner lane (its box, or a double stack's queue place behind it): the fast lane, then
//     the way in, which ends where it will stand (the record) – live, where it isn't known yet, at the queue place,
//     once it slows there (as before: no standstill makes a box, a car at the limit passes);
//   - from that stand to the end of its stand at the box: the box lane (creeping up from the queue place too);
//   - after its stand at the box: the way out from where it stood, back in the fast lane by the next team's box –
//     never on along the other teams' working areas. A car standing again on its way out (a held release, the exit
//     light) stands where its way out has it.
// The way's shape is an ESTIMATE: the feed has every car on one line, no lateral position. Its times (when it stood,
// how long, where along the lane) are the record's, untouched. → as pitState, plus path: { kind, … } (pathW: w at
// another place on the same way – the heading)
function visitState(c, d, tol, standing, ev, P) {
  const V = c.visit, W = V.ways, t = c.t, box = V.box, first = V.first;
  const left = box && !box.open && t >= box.t1;
  const out = (state, extra = []) => { const len = outLenFrom(W, box.u), w = c.u <= box.u ? 1 : 1 - q5((c.u - box.u) / len); ev.push("left its box", ...extra, `way out ${len.toFixed(0)} m (estimate)`); return w > 0 ? { state, lane: "box", w, path: { kind: "out", from: box.u, len }, evidence: ev } : null; };
  if (standing) {
    if (left && Math.abs(d) > tol) { const o = out("queued", ["standing on its way out"]); if (o) return o; return { state: "queued", lane: "fast", w: 0, path: { kind: "const", w: 0 }, evidence: ev }; }
    if (c.teammateInBox && d < -2 && d > -P.near - 10) { ev.push("teammate in the box"); return { state: "waiting (double stack)", lane: "box", w: 1, path: { kind: "const", w: 1 }, evidence: ev }; }
    if (Math.abs(d) <= tol) {
      if (!c.race && c.stillFor >= P.garage) { ev.push("standing long outside a race"); return { state: "garage", lane: "garage", w: ss(P.garage, P.garage + P.garageIn, c.stillFor), evidence: ev }; }
      if (c.penalty === "stop-go") { ev.push("stop-and-go given by race control"); return { state: "stop-go", lane: "box", w: 1, path: { kind: "const", w: 1 }, evidence: ev }; }
      return { state: "in box", lane: "box", w: 1, path: { kind: "const", w: 1 }, evidence: ev };
    }
    // (standing in the inner lane where this visit's record has it before its box: its queue place)
    if (first && first !== box && t >= first.t0 && t <= (box ? box.t0 : Infinity) && Math.abs(c.u - first.u) < 3) { ev.push("its stand before its box (record)"); return { state: "waiting (double stack)", lane: "box", w: 1, path: { kind: "const", w: 1 }, evidence: ev }; }
    return { state: "queued", lane: "fast", w: 0, path: { kind: "const", w: 0 }, evidence: ev };
  }
  if (left) { const o = out("leaving box"); if (o) return o; return { state: "fast lane", lane: "fast", w: 0, path: { kind: "const", w: 0 }, evidence: ev }; }
  // between its first stand in the inner lane and its box: up from the queue place in the box lane
  if (first && t >= first.t0) { ev.push(c.teammateInBox ? "teammate in the box" : "up to its box"); return { state: c.teammateInBox ? "waiting (double stack)" : "to box", lane: "box", w: 1, path: { kind: "const", w: 1 }, evidence: ev }; }
  if (c.penalty === "drive-through") return { state: "fast lane", lane: "fast", w: 0, path: { kind: "const", w: 0 }, evidence: ev };
  // the way in: to where it will stand (the record), else the queue place
  const end = first ? Math.min(W.queueU, first.u) : W.queueU, from = end - inLenTo(W, end);
  // (the record's stand ahead: on along the way to it, even where it stands past the box's tolerance on the way – a car
  // creeping up to a stand at the tolerance's edge flicked to the fast lane and back, 6 m, Hungary 2025 car 87)
  if (c.u < from || (!first && d > tol) || (first && c.u > first.u + 3)) return { state: "fast lane", lane: "fast", w: 0, path: { kind: "const", w: 0 }, evidence: ev };
  if (first) { ev.push("its stop ahead (record)", `way in ${(end - from).toFixed(0)} m (estimate)`); const w = c.u >= end ? 1 : q5((c.u - from) / (end - from)); return { state: "to box", lane: "box", w, path: { kind: "in", from, to: end }, evidence: ev }; }
  // live: not known whether it stops – slowing under the limit on the way in (its slowest since the way began: never
  // back out once across, never across while at the limit)
  const k = 1 - ss(P.slow[0], P.slow[1], V.vMin ?? c.speed);
  if (k <= 0) return { state: "fast lane", lane: "fast", w: 0, path: { kind: "const", w: 0 }, evidence: ev };
  ev.push("slowing before its box", `way in ${(end - from).toFixed(0)} m (estimate)`);
  return { state: "to box", lane: "box", w: (c.u >= end ? 1 : q5((c.u - from) / (end - from))) * k, path: { kind: "in", from, to: end, k }, evidence: ev };
}
// w on a state's way at another place u (the same way: the heading from its slope)
export function pathW(path, u) {
  if (!path) return null;
  if (path.kind === "const") return path.w;
  if (path.kind === "in") return (u >= path.to ? 1 : q5((u - path.from) / (path.to - path.from))) * (path.k ?? 1);
  if (path.kind === "out") return u <= path.from ? 1 : 1 - q5((u - path.from) / path.len);
  return null;
}

// A pit visit's standstills from the car's positions over [tA, tB] (ms): [{ t0 (it came to rest – the start of its first
// still step), t1 (its last standing sample), u (where, by uOf(sample index)), i, open (still standing at tB) }] – the
// same still steps as standingForPos (blips bridged)
export function visitStands(c, tA, tB, uOf, still = 0.6) {
  const n = c.n ?? c.t.length, out = [];
  let i = Math.max(1, idxAt(c, tA)), a = -1;
  const mk = (a, b, open) => { const u = uOf(b); if (u != null) out.push({ t0: c.t[a - 1], t1: c.t[b], u, i: b, open }); };
  for (; i < n && c.t[i] <= tB; i++) {
    const s = stepStill(c, i, still);
    if (s && a < 0) a = i; else if (!s && a >= 0) { mk(a, i - 1, false); a = -1; }
  }
  if (a >= 0) mk(a, i - 1, i >= n || c.t[i] > tB);
  return out;
}
// The visit's stand at its box (the last one within tol of boxU – a stop split by a creep forward ends at the last) and
// its first stand in the inner lane (the earliest of the stands from P.near + 10 m behind the box up to it, just before the
// box stand: a double stack's queue place) – or nulls
export function visitPlan(stands, boxU, tol, P = PIT, minS = 0.8) {
  if (boxU == null) return { first: null, box: null };
  let bi = -1;
  stands.forEach((s, i) => { if (Math.abs(s.u - boxU) <= tol && (s.open || s.t1 - s.t0 >= minS * 1000)) bi = i; });
  if (bi < 0) {
    // (live, still queueing behind it: that stand)
    const q = stands[stands.length - 1];
    return q && q.open && q.u - boxU < -2 && q.u - boxU > -P.near - 10 ? { first: q, box: null } : { first: null, box: null };
  }
  let fi = bi;
  for (let i = bi - 1; i >= 0; i--) { const d = stands[i].u - boxU; if (d < -P.near - 10 || d > tol) break; fi = i; }
  return { first: stands[fi], box: stands[bi] };
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
  return off + (want - off) * runBlend(u, gStart, gEnd, P);
}

// in the garages' run (1) – back to the feed's line over `ends` m past either end (0): a quintic (v0.53: the heading's
// turn continuous there too)
export const runBlend = (u, gStart, gEnd, P = PIT) => Math.min(q5((u - (gStart - P.ends)) / P.ends), 1 - q5((u - gEnd) / P.ends));

// v0.49: a car going into its garage (lane "garage": retired and standing, or a long stay outside a race) – where it is at
// w (0 → 1, pitState's), from where it stood in the lane to its own work space's car spot (garages.js garageZones), never
// through a wall: first along the inner lane to in front of its own door, turning to face out (w 0–0.5), then backwards
// straight in through the door to the spot (0.5–1) – the cars are wheeled in tail first (garagespace.js). An ESTIMATE
// throughout: the feed has nothing of it. from: { u, off } where it stands; to: { u, off } its spot (off < 0: inside);
// laneOff: the inner (box) lane's offset there. → { u, off, turn (0: as it stood, 1: facing out) }
export function garagePath(w, from, to, laneOff) {
  const a = ss(0, 0.5, w), b = ss(0.5, 1, w), lane = from.off + (laneOff - from.off) * a;
  return { u: from.u + (to.u - from.u) * a, off: lane + (to.off - laneOff) * b, turn: a };
}

// A team's crew, from its cars' states (crew.js draws it): "work" round the car in its box (not at a stop-and-go:
// no work is allowed), "hold" standing back by the garage at a stop-and-go, "ready" at the box while a car of the team
// comes down the lane to it (FIA 34.13: in the pit lane only just before the work), "back" walking back over the
// first `leave` m after it left; else none (in the garage). Working: `since` – seconds the car has stood (its stop's
// own clock: crew.js plays the work on it); walking back: `ago` – seconds since it left.
//   cars: [{ num, state: pitState(...), u, boxU, lastBox, stillFor }]
export function crewPhase(cars, P = PIT) {
  const inBox = cars.find((c) => c.state.state === "in box");
  if (inBox) return { phase: "work", num: inBox.num, f: 1, since: inBox.stillFor ?? null };
  const sg = cars.find((c) => c.state.state === "stop-go");
  if (sg) return { phase: "hold", num: sg.num, f: 1 };
  const coming = cars.filter((c) => c.boxU != null && ["fast lane", "to box", "entry", "waiting (double stack)"].includes(c.state.state) && c.u != null && c.u < c.boxU + P.atBox)
    .sort((a, b) => b.u - a.u)[0];
  if (coming) return { phase: "ready", num: coming.num, f: 1 - ss(60, 160, coming.boxU - coming.u) };
  const gone = cars.find((c) => c.state.state === "leaving box" || (c.lastBox && c.lastBox.ago < 8));
  if (gone) return { phase: "back", num: gone.num, f: 1 - ss(0, 8, gone.lastBox?.ago ?? 0), ago: gone.lastBox?.ago ?? 0 };
  return { phase: "none", num: null, f: 0 };
}

// A pending time penalty (s) per car – "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 22 (TSU) …" – served at the car's
// next stop: nobody may work on the car until it has stood that long (Sporting Regulations: time penalties served in
// the pit lane). Done once race control says "PENALTY SERVED", or once the car has made a whole pit visit after it was
// given; while it is in its box it is still pending (the crew waits). → Map num → seconds
export function pendingTimePenalties(rcm, t, visits = null) {
  const out = new Map(), given = new Map();
  for (const [tm, m] of rcm) {
    if (tm > t) break;
    const g = /(\d+) SECOND TIME PENALTY FOR CAR (\d+)/.exec(m); if (!g) continue;
    const car = g[2], sec = +g[1];
    if (/PENALTY SERVED/.test(m)) { if (out.get(car) === sec) out.delete(car); }
    else if (!/REVIEWED|NO FURTHER|WITHDRAWN|CANCELLED|REVOKED/.test(m)) { out.set(car, (out.get(car) || 0) + sec); given.set(car, tm); }
  }
  if (visits) for (const [car, tg] of given) if (out.has(car) && (visits(car) || []).some(([a, b]) => a >= tg && b != null && b <= t)) out.delete(car);
  return out;
}

// The end of the standstill a car is in at t (ms, its last sample standing), from its positions after t – the record
// (a replay's): null when the data runs out first or it isn't standing
export function standEndPos(c, t, still = 0.6, within = 300000) {
  let i = idxAt(c, t); if (i < 1 || !stepStill(c, i, still)) return null;
  const n = c.n ?? c.t.length;
  while (i + 1 < n && stepStill(c, i + 1, still) && c.t[i + 1] - t < within) i++;
  return i + 1 < n ? c.t[i] : null;
}

// The start of the next standstill (ms) within `within` ms after t, from the positions (the record: a replay's) – a car
// coming down the lane to its box: when it will stand there. null if it doesn't within that.
export function nextStandPos(c, t, within = 60000, still = 0.6) {
  let i = idxAt(c, t); if (i < 1) return null;
  const n = c.n ?? c.t.length;
  while (i + 1 < n && !stepStill(c, i + 1, still)) { i++; if (c.t[i] - t > within) return null; }
  return i + 1 < n ? c.t[i] : null;
}

// What is done at a stop – what the crew is shown doing (crew.js):
//   "tyres": a new set fitted (played: jacks, guns, wheels off and on); "work": not known – the crew round the car in
//   the usual places, nothing played; "hold": a stop-and-go (no work allowed).
// From: the stop (t0: ms the car stood, t1: its last standing sample when known – the record –, else null), the car's
// new tyre stints with the time each was sent (replay.js TyreLog), the stop's stationary time if F1 sent one (D, s),
// a penalty (stop-go) and a time penalty to serve (s), and the policy:
//   "record"   – a replay: the session's record, also what was sent after the moment shown (a new stint sent up to
//                90 s after the car stood is this stop's; the stop's length from its positions) – a reconstruction
//   "observed" – only what had arrived by the moment shown and before the car left its box (live: a stint is sent ~15 s
//                after the car left, so a live stop's work is never known while it stands; a message that comes late
//                never lifts a car again or puts wheels back)
//   "typical"  – as observed, and a stop with nothing known shown as a typical tyre change (an estimate, said so)
// → { kind, from: "record" | "observed" | "typical" | null, D (s, null unknown), wait (s), compound }
export function stopPlan({ t, t0, t1 = null, tyres = [], stopTime = null, penalty = null, timePen = 0, policy = "observed" }) {
  if (penalty === "stop-go") return { kind: "hold", from: null, D: null, wait: 0, compound: null };
  const wait = timePen || 0;
  const posD = t1 != null && t1 >= t0 ? (t1 - t0) / 1000 + 0.25 : null;   // (positions ~4 a second: it left within the next quarter)
  const known = (e) => e.ms >= t0 - 2000 && (policy === "record" ? e.ms <= t0 + 90000 : e.ms <= t && (t1 == null || e.ms <= t1));
  // (of the records in the window, one still standing before one dropped later; then the latest)
  const cand = tyres.filter((e) => known(e)), set = cand.find((e) => e.gone == null) || cand[cand.length - 1];
  if (set && set.changed !== false) {
    const D = policy === "record" ? posD ?? stopTime : null;
    return { kind: "tyres", from: policy === "record" ? "record" : "observed", D, wait, compound: set.compound || null };
  }
  if (policy === "typical" && !set) return { kind: "tyres", from: "typical", D: null, wait, compound: null };
  return { kind: "work", from: null, D: policy === "record" ? posD ?? stopTime : null, wait, compound: null };
}

// The penalties race control has given and not yet seen served, by t: Map num → "drive-through" | "stop-go".
// rcm: [[t, message]] in time order (startplan.js StartHistory.rcm). The stewards' wording: "DRIVE THROUGH PENALTY
// FOR CAR 63 (RUS)", "10 SECOND STOP/GO PENALTY FOR CAR 87 (BEA)", "STOP AND GO …", and "PENALTY SERVED - …" when done.
//   visits(car) → its pit lane visits ([[tIn, tOut]], tOut null while in): a penalty is also done once the car has made
//   one whole visit after it was given – race control's "served" can come minutes late (Qatar 2025, Bearman: served at
//   his stop at 7231–7268 s, said so at 7627 s, after he had come in again and retired)
export function pendingPenalties(rcm, t, visits = null) {
  const out = new Map(), given = new Map();
  for (const [tm, m] of rcm) {
    if (tm > t) break;
    const car = /FOR CAR (\d+)/.exec(m)?.[1]; if (!car) continue;
    const kind = /DRIVE THROUGH/.test(m) ? "drive-through" : /STOP\s*\/\s*GO|STOP AND GO|STOP-GO/.test(m) ? "stop-go" : null;
    if (!kind) continue;
    if (/PENALTY SERVED/.test(m)) { if (out.get(car) === kind) out.delete(car); }
    else if (!/REVIEWED|NO FURTHER|WITHDRAWN|CANCELLED/.test(m)) { out.set(car, kind); given.set(car, tm); }
  }
  if (visits) for (const [car, tg] of given) if (out.has(car) && (visits(car) || []).some(([a, b]) => a >= tg && b != null && b <= t)) out.delete(car);
  return out;
}
// A car's pit lane visits from its InPit flag's changes ([[t, bool]], startplan.js StartHistory flags) up to t
export function pitVisits(changes, t) {
  const out = []; let open = null;
  for (const [ts, v] of changes || []) { if (ts > t) break; if (v && open == null) open = ts; else if (!v && open != null) { out.push([open, ts]); open = null; } }
  if (open != null) out.push([open, null]);
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

// The same from a car's positions ({ t: [ms], x, y: decimetres, n } – CarTracks), for the pit lane: its telemetry's
// speed is no guide there – while the car stands jacked up in its box the wheel speed jumps (Barcelona 2025, Norris:
// 3.3, 0.3, 5.1 km/h through a 3.9 s stop), splitting one stop into several. Standing: moving under `still` m/s from
// one position to the next (positions come ~4 a second, good to centimetres in the pit lane).
const DMm = 0.1;
function idxAt(c, t) { let lo = 0, hi = c.n - 1; if (!c.n || c.t[0] > t) return -1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c.t[m] <= t) lo = m; else hi = m; } return c.t[hi] <= t ? hi : lo; }
const rawStill = (c, j, still) => { const dt = (c.t[j] - c.t[j - 1]) / 1000; return dt > 0 && dt < 3 && Math.hypot(c.x[j] - c.x[j - 1], c.y[j] - c.y[j - 1]) * DMm / dt < still; };
// v0.41: a blip inside a standstill – one or two steps that moved (0.1–0.45 m at 1–1.7 m/s), still before them and for
// at least BLIP.after steps after – is part of the standstill. Monaco 2025: 14 of 141 stops in 5 races were split that
// way (Bortoleto lap 35: 1.6 s still, 0.3 m in 0.2 s, 0.8 s still; the record says one 2.4 s stop) – the stop's clock
// started again from 0 (jacks, wheels off a second time) and the crew flicked to walking back and out again for a frame
// or two. A car that drives off never stands again within BLIP.after steps, so a departure isn't bridged; live, the
// steps after don't exist yet – nothing is bridged until they do.
export const BLIP = { m: 0.5, steps: 2, after: 2 };
function stepStill(c, j, still) {
  if (rawStill(c, j, still)) return true;
  const n = c.n ?? c.t.length;
  let a = j, b = j;
  while (a > 1 && !rawStill(c, a - 1, still)) { a--; if (j - a + 1 > BLIP.steps) return false; }
  while (b + 1 < n && !rawStill(c, b + 1, still)) { b++; if (b - a + 1 > BLIP.steps) return false; }
  if (b - a + 1 > BLIP.steps || a < 2 || !rawStill(c, a - 1, still)) return false;
  for (let k = 1; k <= BLIP.after; k++) if (b + k >= n || !rawStill(c, b + k, still)) return false;
  for (let k = a; k <= b; k++) { const dt = c.t[k] - c.t[k - 1]; if (!(dt > 0 && dt < 3000)) return false; }
  return Math.hypot(c.x[b] - c.x[a - 1], c.y[b] - c.y[a - 1]) * DMm <= BLIP.m;
}
export function posSpeed(c, t, span = 600) {
  const i = idxAt(c, t); if (i < 1) return 0;
  // (as drawn – standingForPos: the step covering t, when the next sample is there; else the last span's)
  const n = c.n ?? c.t.length;
  if (i + 1 < n && c.t[i + 1] > t && c.t[i + 1] - c.t[i] < 3000) return Math.hypot(c.x[i + 1] - c.x[i], c.y[i + 1] - c.y[i]) * DMm / ((c.t[i + 1] - c.t[i]) / 1000);
  let j = i; while (j > 0 && c.t[i] - c.t[j - 1] <= span) j--;
  const dt = (c.t[i] - c.t[j]) / 1000; return dt > 0 ? Math.hypot(c.x[i] - c.x[j], c.y[i] - c.y[j]) * DMm / dt : 0;
}
// v0.40: standing as the car is drawn – positions are interpolated between the samples on either side of t (replay.js
// CarTracks.at), so a car whose next sample is where its last one was is drawn at rest already: that step counts
// (Monza 2025, Leclerc: the samples 1.2 s apart through the stop – the crew stood idle for 1.1 s beside a car drawn at
// rest, then jumped 1.2 s into its work). Only the step the drawing itself uses; live, no sample after t exists yet.
export function standingForPos(c, t, still = 0.6) {
  let i = idxAt(c, t); if (i < 1) return 0;
  const n = c.n ?? c.t.length;
  if (i + 1 < n && c.t[i + 1] > t && c.t[i + 1] - c.t[i] < 3000) { if (!stepStill(c, i + 1, still)) return 0; i++; }   // (drawn moving off: gone)
  else if (!stepStill(c, i, still)) return 0;
  let j = i; while (j > 1 && stepStill(c, j - 1, still) && t - c.t[j - 1] < 600000) j--;
  return Math.max(0, (t - c.t[j - 1]) / 1000);
}
export function lastStandPos(c, t, within = 25, min = 1.2, still = 0.6) {
  let i = idxAt(c, t); if (i < 1) return null;
  while (i > 1 && !stepStill(c, i, still) && t - c.t[i] <= within * 1000) i--;
  if (i < 1 || !stepStill(c, i, still) || t - c.t[i] > within * 1000) return null;
  if (standingForPos(c, t, still) > 0) return null;   // still standing (as drawn): no last standstill yet
  const t1 = c.t[i]; let j = i; while (j > 1 && stepStill(c, j - 1, still)) j--;
  const t0 = c.t[j - 1];
  return t1 - t0 >= min * 1000 ? { t0, t1, i } : null;
}
