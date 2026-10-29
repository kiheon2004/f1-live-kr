// When the lowered arm's elbow swings across (v0.45's regrip, v0.46 with the hand on its grip): per arm, from the wheel's
// angle and the session's time, how far it is from beside the body (q 0 – the plan) to up and across in front of the
// chest (q 1 – arms.js planAcross); arms.js armSwapPose draws any q between (planSwing's path, the hand holding its grip).
// Pure: node-testable, no three.js.
//
// Why history and not the angle alone: the lowered arm's two ways are ~180° of forearm turn apart, and the elbow comes
// from one to the other only across the front of the chest (measured: reports v045 / v046 arms.md) – a swing, not a
// pose for an angle. If it went by the angle alone, a wheel held between the two ways (a long ~45° corner) would hold
// the elbow half way across the chest for as long. So: past SWAP.on it swings across, back inside SWAP.off it swings back
// (hysteresis between), each taking SWAP.ms of the session's time.
// - the swing goes on with the session's time (SWAP.ms) or with the wheel's own travel (SPAN°), whichever is the
//   quicker;
// v0.47 (request §2): swapAt – the swing as a function of the session's steering history alone: the wheel's angle read
//   back over the last WINDOW ms on a grid of STEP ms fixed to the session's clock (not to the frames), the goal at the
//   window's start from the last moment before it outside the band (hysteresis), and the crossing of SWAP.on / SWAP.off
//   placed inside its step. Continuous play at any frame rate, any replay speed, a pause, the car out of close-up
//   (LOD, camera) for a while and a direct seek to the moment all read the same history – the same arms. (stepSwap,
//   below, carried the goal and q from the frame before: 60° and back to 46° gave q 1, a seek straight to 46° q 0, and
//   a 49° → 55° ramp over 100 ms ended at a different q at 60 and 120 Hz – v0.47 test/arms47.test.js.) stepSwap stays
//   for a caller with no history to hand (car3d: no history function given, or none known at that moment – the
//   pit-lane / standing steering that is eased frame to frame in map3d, a known limit); its rules are these:
// - a pause (the session's time standing still): nothing moves; a slower or faster replay: the same swing in session
//   time;
// - a seek, a rewind or a gap (no frame for > JUMP_MS of the session, the car out of close-up): no history to go by –
//   the steady pose for the angle at once (across past SWAP.on, beside the body otherwise);
// - no time at all (t null – a caller outside the replay: v0.41–v0.44's tests and tools): the beside-the-body plan
//   alone, a pure function of the angle (the app always passes the session's time; past ±90° the wheel only turns with
//   a speed given, car3d setWheels).
import { SWAP, swapEase } from "./arms.js";

export const JUMP_MS = 1000;
// how far the wheel turns while the elbow swings, at most (deg; not part of the plans' key – the time course only)
export const SPAN = 8;
export const swapState = () => ({ goal: 0, q: 0, t: null, deg: 0 });
// st: swapState(); deg: the wheel's angle in this arm's own frame (the left arm's: − lowers its hand; the right arm's
// is the mirrored one); t: the session's time (ms) or null. Returns the eased q for
// armSwapPose and keeps st up to date.
export function stepSwap(st, deg, t) {
  if (t == null) { st.goal = 0; st.q = 0; st.t = null; return 0; }
  const low = -deg, steady = low >= SWAP.on ? 1 : 0;
  if (st.t == null || t < st.t || t - st.t > JUMP_MS) { st.goal = steady; st.q = steady; }
  else {
    if (low >= SWAP.on) st.goal = 1; else if (low <= SWAP.off) st.goal = 0;
    // (and no slower than the wheel turns: the swing done within SPAN° of the wheel's travel – past ~55° the beside-
    // the-body pose bends the wrist out of range, v0.46 measured: a fast turn in must not leave the elbow behind)
    const dq = Math.max((t - st.t) / SWAP.ms, Math.abs(deg - st.deg) / SPAN);
    st.q = st.goal > st.q ? Math.min(st.goal, st.q + dq) : Math.max(st.goal, st.q - dq);
  }
  st.t = t; st.deg = deg;
  return swapEase(st.q);
}

// v0.47: the swing from the steering history. degAt(ms): this arm's wheel angle (deg, as stepSwap's deg) at a moment of
// the session, or null where it isn't known (no smoothed track then). STEP: the grid (ms of the session, multiples of it
// – the same samples whatever the frames); WINDOW: how far back the swing is run (≥ 4 × SWAP.ms: any swing begun before
// it is over by its end unless the wheel crossed both thresholds again and again, every < SWAP.ms – no corner does;
// the window's start takes q = its goal); BACK: how far back the band (between SWAP.off and SWAP.on) is followed to
// find which way the arm was (a wheel held in the band longer than that – 30 s, no corner – counts as beside the body).
export const STEP = 10, WINDOW = 2000, BACK = 30000;
const sw = { goal: 0, q: 0, prev: null };
function swStep(d, dt) {
  if (d == null) { sw.prev = null; return; }
  const low = -d;
  // (after a gap in the history: the steady pose for the angle – nothing known says it was crossed)
  if (sw.prev == null) { sw.goal = sw.q = low >= SWAP.on ? 1 : 0; sw.prev = d; return; }
  const low0 = -sw.prev, goal = low >= SWAP.on ? 1 : low <= SWAP.off ? 0 : sw.goal;
  // (the threshold passed inside this step: the swing timed from that moment, linear between the samples)
  let f = 1;
  if (goal !== sw.goal) { const th = goal ? SWAP.on : SWAP.off; f = low !== low0 ? Math.max(0, Math.min(1, (low - th) / (low - low0))) : 1; sw.goal = goal; }
  const dq = Math.max((dt * f) / SWAP.ms, (Math.abs(d - sw.prev) * f) / SPAN);
  sw.q = sw.goal > sw.q ? Math.min(sw.goal, sw.q + dq) : Math.max(sw.goal, sw.q - dq);
  sw.prev = d;
}
// t: the session's time (ms). Returns the eased q (armSwapPose's). Pure: a function of degAt and t only.
export function swapAt(degAt, t) {
  const i1 = Math.floor(t / STEP), i0 = i1 - WINDOW / STEP;
  let goal = 0;
  for (let i = i0, lim = i0 - BACK / STEP; i >= lim; i--) {
    const d = degAt(i * STEP); if (d == null) break;
    if (-d >= SWAP.on) { goal = 1; break; } if (-d <= SWAP.off) break;
  }
  const d0 = degAt(i0 * STEP);
  sw.goal = sw.q = goal; sw.prev = d0;
  for (let i = i0 + 1; i <= i1; i++) swStep(degAt(i * STEP), STEP);
  if (t > i1 * STEP) swStep(degAt(t), t - i1 * STEP);   // (the moment itself, between two steps)
  return sw.prev == null ? 0 : swapEase(sw.q);
}
// The history's samples on the grid kept in a ring (a car's: computed once each, however many frames and arms read
// them – a seek fills the window once): f(ms) → value or null. m.key(k): a new k (another session, rebuilt tracks)
// clears it. Moments between the steps are computed, not kept. Typed arrays: no allocation per call.
export function gridMemo(f, size = 4096) {
  const at = new Float64Array(size).fill(NaN), val = new Float64Array(size); let key;
  const m = (ms) => {
    const g = ms / STEP;
    if (!Number.isInteger(g)) return f(ms);
    const j = ((g % size) + size) % size;
    if (at[j] !== g) { const v = f(ms); at[j] = g; val[j] = v == null ? NaN : v; }
    return Number.isNaN(val[j]) ? null : val[j];
  };
  m.key = (k) => { if (k !== key) { key = k; at.fill(NaN); } return m; };
  return m;
}
