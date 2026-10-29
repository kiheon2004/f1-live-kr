// Pit stops (DESIGN §11, request §10): a car's way through the pit lane as phases, each with its own speed rule, and the
// team's ONE working box shared by its two cars (a team's garage may have several doors – the box is one place where
// the crew works; the second car of a double stack queues behind it).
//
//   none ─call→ called ─(passes the commit point)→ committed ─(reaches the entry branch sIn)→ entry ─(limiter line)→ lane
//   ─(near its box)→ approach ─(box busy: stops behind it)→ queue ─(box free)→ approach ─(stops at the box)→ penalty?
//   → work ─(work done: new tyres on now, not before)→ release (held while a car comes down the fast lane) → laneOut
//   ─(limiter end)→ exit ─(end of the pit path)→ none (back on the lap at sOut; the merge is traffic's)
//
// A call can be cancelled only while "called" (before the commit point – PIT.commit m before the branch; the driver is
// told on the radio and then is on the entry line); after that it can't. A call that comes too late for this lap's commit
// point stands for the next lap. Orders are made idempotent upstream (commands.js); here a second call while one is
// live just changes the tyres asked for (until the work starts).
//
// Speeds in the lane come from rules: the limiter speed (T.pit.speedLimit, per circuit and season), braking to it before
// the limiter line, slowing into the box, launching out. The work's time is the crew's (per-team measured stationary
// times, a seeded spread, a slow-wheel error whose chance has causes – a double stack, rain). Each phase's start time is
// kept, so the stop's loss is measured, part by part (log.js), not a fixed total.
import { PIT } from "../data/params/pit.js";

const G = 9.81;
export const PHASES = ["none", "called", "committed", "entry", "lane", "approach", "queue", "penalty", "work", "release", "laneOut", "exit"];
export const IN_LANE = new Set(["entry", "lane", "approach", "queue", "penalty", "work", "release", "laneOut", "exit"]);

export function newPitState() { return { phase: "none", call: null, u: 0, v: 0, stopU: null, workEnd: null, holdUntil: null, times: {}, err: null, stops: 0, served: 0 }; }
export function newBoxes(teams) { const b = {}; for (const k of teams) b[k] = { occupant: null, queue: [] }; return b; }

// the commit point on the lap (m, wrapped)
export const commitS = (T, P = PIT) => T.wrap(T.pit.sIn - P.commit.v);

// The player's / AI's call. car: the car's state (needs .pit, .s); returns { ok, why }.
export function pitCall(car, T, { compound, t }, P = PIT) {
  const p = car.pit;
  if (car.status !== "run") return { ok: false, why: `not running (${car.status})` };
  if (p.phase === "called") { p.call.compound = compound || p.call.compound; return { ok: true, why: "tyres changed" }; }
  if (p.phase !== "none") return { ok: false, why: p.phase === "committed" ? "already committed to the pit entry" : "already in the pit lane" };
  // armed: it commits at the next pass of the commit point. Called within callLate of it: not armed – that pass arms it and
  // the one after commits (next lap). Called between the commit point and the branch: armed, and the next pass is next
  // lap's anyway.
  const toCommit = T.ahead(car.s, commitS(T, P)), toEntry = T.ahead(car.s, T.pit.sIn);
  p.phase = "called"; p.call = { compound: compound || null, t, armed: toCommit >= P.callLate.v };
  return { ok: true, why: p.call.armed && toCommit < toEntry ? "for this lap" : "too late for this lap – next lap" };
}

export function pitCancel(car) {
  const p = car.pit;
  if (p.phase === "called") { p.phase = "none"; p.call = null; return { ok: true }; }
  if (p.phase === "none") return { ok: false, why: "no call to cancel" };
  return { ok: false, why: p.phase === "committed" ? "past the commit point – can't be cancelled" : "already in the pit lane" };
}

// On the lap, once a step (before the car moves): crossing the commit point arms or commits the call; reaching the entry
// branch puts the car on the pit path. s0 → s1: the car's lap position before and after this step's move.
export function pitOnLap(car, T, s0, s1, t, P = PIT) {
  const p = car.pit;
  if (p.phase !== "called" && p.phase !== "committed") return null;
  const cs = commitS(T, P), moved = T.ahead(s0, s1);
  const crossed = (x) => moved > 0 && T.ahead(s0, x) <= moved && T.ahead(s0, x) > 0;
  if (p.phase === "called" && crossed(cs)) {
    if (p.call.armed) { p.phase = "committed"; p.times.commit = t; return "committed"; }
    p.call.armed = true;   // (the too-late call: armed from here, it commits at the next pass)
    return null;
  }
  if (p.phase === "committed" && crossed(T.pit.sIn)) {
    p.phase = "entry"; p.u = T.pit.lapToPit(s1) ?? 0; p.v = car.v; p.times.entry = t; p.stopU = null;
    return "entry";
  }
  return null;
}

// the speed cap at the car's place on the pit path (m/s) – the rules and the car's own braking/launch
export function pitCap(car, T, box, P = PIT) {
  const p = car.pit, L = T.pit, lim = L.speedLimit, aIn = P.boxApproach.v * G;
  switch (p.phase) {
    case "entry": { const brake = 2.5 * G; return Math.sqrt(lim * lim + 2 * brake * Math.max(0, L.limStart - p.u)); }
    case "lane": case "approach": case "queue": {
      if (p.stopU == null) return lim;
      return Math.min(lim, Math.sqrt(2 * aIn * Math.max(0, p.stopU - p.u)));
    }
    case "penalty": case "work": case "release": return 0;
    case "laneOut": return lim;
    case "exit": return Infinity;   // (past the limiter end: the car's own acceleration; the merge is traffic's)
    default: return Infinity;
  }
}

// One step of a car on the pit path: phase changes, the box, the work. ctx: { t, dt, team (key), boxes, rng (pit stream of
// the team), wet (bool), others: [{ num, team, phase, u, v }] (the cars in the lane), penaltyS (s to serve at this stop),
// stack (bool: the teammate stopped just before), onWorkDone(car, compound) }. Returns an event string or null.
// Race control's inputs (control.js pitCtx, rules.js): noBox (drive down the fast lane, don't turn into the box – red flag
// queue, drive-through), holdU (stop by this pit-path distance – red-flag queue slot, closed exit light, pit-lane start),
// noWork (stop-and-go: the hold only, no work, no tyres).
export function pitStep(car, T, ctx, P = PIT) {
  const p = car.pit, L = T.pit, box = ctx.boxes[ctx.team], boxU = L.boxes[ctx.team];
  const aIn = P.boxApproach.v * G, aOut = P.launch.v * G;
  let ev = null;
  if (p.phase === "entry" && p.u >= L.limStart) { p.phase = "lane"; p.times.lim = ctx.t; }
  if (p.phase === "lane" && !ctx.noBox && boxU != null && p.u >= boxU - 60) { p.phase = "approach"; }
  if (p.phase === "approach") {
    // the box: free, or ours already → stop in it; the teammate in it → stop behind it and wait
    if (box.occupant == null || box.occupant === car.num) { box.occupant = car.num; p.stopU = boxU; }
    else { p.stopU = boxU - P.queueGap.v; if (!box.queue.includes(car.num)) box.queue.push(car.num); }
    if (p.v < 0.3 && Math.abs(p.u - p.stopU) < 0.6) {
      if (p.stopU === boxU) {
        p.u = boxU; p.v = 0; p.times.stop = ctx.t;
        box.queue = box.queue.filter((n) => n !== car.num);
        if (ctx.penaltyS > 0) { p.phase = "penalty"; p.holdUntil = ctx.t + Math.round(ctx.penaltyS * 1000); ev = "penalty"; }
        else { startWork(car, ctx, P); ev = "work"; }
      } else { p.phase = "queue"; p.times.queue = p.times.queue ?? ctx.t; ev = "queue"; }
    }
  }
  if (p.phase === "queue" && (box.occupant == null || box.occupant === car.num)) { box.occupant = car.num; p.phase = "approach"; p.stopU = boxU; p.times.queueEnd = ctx.t; }
  if (p.phase === "penalty" && ctx.t >= p.holdUntil) {
    p.served += ctx.penaltyS; p.times.penEnd = ctx.t;
    if (ctx.noWork) { p.phase = "release"; p.workEnd = ctx.t; p.times.work = ctx.t; p.times.workEnd = ctx.t; p.stops++; ev = "penaltyServed"; }
    else { startWork(car, ctx, P); ev = "work"; }
  }
  if (p.phase === "work" && ctx.t >= p.workEnd) {
    p.times.workEnd = ctx.t; p.stops++;
    if (p.call?.compound) ctx.onWorkDone?.(car, p.call.compound);   // (new tyres now – not before the work is done)
    p.phase = "release"; ev = "workDone";
  }
  if (p.phase === "release") {
    // safe release: a car in the fast lane coming up from behind within releaseGap seconds holds us – unless the crew
    // misjudges it (chance per such release, seeded): an unsafe release, a rules matter
    const threat = ctx.others.some((o) => o.num !== car.num && (o.phase === "lane" || o.phase === "approach" || o.phase === "laneOut" || o.phase === "entry") && o.u < p.u && o.u > p.u - Math.max(10, o.v * P.releaseGap.v) && o.v > 3);
    let go = !threat;
    if (threat && !p.unsafeRolled) { p.unsafeRolled = true; if (ctx.rng.chance(P.unsafeRelease.v)) { go = true; ev = "unsafeRelease"; } }
    if (go) { p.phase = "laneOut"; p.times.release = ctx.t; p.unsafeRolled = false; if (box.occupant === car.num) box.occupant = null; }
  }
  if ((p.phase === "laneOut" || (ctx.noBox && p.phase === "lane")) && p.u >= L.limEnd) { p.phase = "exit"; p.times.limEnd = ctx.t; }
  // move along the path (the cap above; accelerate at the launch rate, slow at the approach rate)
  if (p.phase !== "penalty" && p.phase !== "work" && p.phase !== "release") {
    const cap = pitCap(car, T, box, P);
    // (exit: past the limiter end the car accelerates to rejoin – bounded here; on the lap the car model takes over)
    let target = p.phase === "exit" ? 80 : cap;
    if (ctx.holdU != null) target = Math.min(target, Math.sqrt(2 * aIn * Math.max(0, ctx.holdU - p.u)));
    if (p.v < target) p.v = Math.min(target, p.v + (p.phase === "exit" ? 1.2 * G : aOut) * ctx.dt);
    else p.v = Math.max(target, p.v - (p.phase === "entry" ? 2.5 * G : aIn) * ctx.dt);
    // (never past the stop point – the last centimetres of the approach)
    if (p.stopU != null && (p.phase === "approach" || p.phase === "queue") && p.u + p.v * ctx.dt > p.stopU) { p.u = p.stopU; p.v = 0; }
    else if (ctx.holdU != null && p.u + p.v * ctx.dt > ctx.holdU) { p.u = Math.max(p.u, ctx.holdU); p.v = 0; }
    else p.u += p.v * ctx.dt;
  }
  if (p.phase === "exit" && p.u >= L.L) {
    p.times.exit = ctx.t; ev = "exit";
    const overshoot = p.u - L.L; p.phase = "none"; p.call = null; p.stopU = null;
    car.s = T.wrap(L.sOut + overshoot); car.v = p.v;
  }
  return ev;
}

function startWork(car, ctx, P) {
  const p = car.pit, crew = ctx.crew || { base: P.workBase.v, sd: P.workSd.v };
  // a clean stop: the crew's base time and its spread (normal, truncated at −2σ: a stop can't be quicker than the crew can be)
  let w = crew.base + crew.sd * Math.max(-2, ctx.rng.normal());
  // a slow wheel: its chance has causes (double stack, rain) – and a size
  const pe = P.errBase.v * (ctx.stack ? P.errStack.v : 1) * (ctx.wet ? P.errWet.v : 1);
  p.err = null;
  if (ctx.rng.chance(pe)) { const [a, b] = P.errDelay.v, d = a + (b - a) * ctx.rng.next(); w += d; p.err = { kind: "slow wheel", add: d, causes: [ctx.stack && "double stack", ctx.wet && "rain"].filter(Boolean) }; }
  p.phase = "work"; p.times.work = ctx.t; p.workEnd = ctx.t + Math.round(w * 1000); p.workS = w;
}

// On the lap: a committed car has to be slow enough at the branch to make the limiter line braking at the entry rate –
// its speed cap there (m/s; Infinity when not committed)
export function lapCapForPit(car, T, P = PIT) {
  if (car.pit.phase !== "committed") return Infinity;
  const L = T.pit, b = 2.5 * G, at0 = L.speedLimit * L.speedLimit + 2 * b * Math.max(0, L.limStart);
  const dist = T.ahead(car.s, L.sIn);
  return dist > T.L / 2 ? Infinity : Math.sqrt(at0 + 2 * b * dist);
}
