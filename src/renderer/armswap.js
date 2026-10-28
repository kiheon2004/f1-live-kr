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
//   quicker – both functions of the moments shown, so the same history gives the same arms;
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
