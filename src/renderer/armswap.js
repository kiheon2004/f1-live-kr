// When the lowered hand regrips (v0.45): per arm, from the wheel's angle and the session's time, how far it is from
// holding its grip beside the body (q 0 – arms.js plan) to holding it the other way, the elbow up and across in front
// of the chest (q 1 – planSwapPath); arms.js armSwapPose draws any q between (the hand off its grip, planSwapMove).
// Pure: node-testable, no three.js.
//
// Why history and not the angle alone: the two ways of holding the lowered grip are ~180° of forearm turn apart and
// the elbow can't swing from one to the other with the hand on the grip (measured, report v045 arms.md) – so the hand
// lets go for SWAP.ms. If that were a function of the angle alone, a wheel held between the two ways (a long ~45°
// corner) would show the hand off its grip for as long as it is held there. So: past SWAP.on the hand goes over, back
// inside SWAP.off it comes back (hysteresis between), each taking SWAP.ms of the session's time.
// - a pause (the session's time standing still): nothing moves; a slower or faster replay: the same regrip in session
//   time;
// - a seek, a rewind or a gap (no frame for > JUMP_MS of the session, the car out of close-up): no history to go by –
//   the steady pose for the angle at once (over past SWAP.on, beside the body otherwise); between SWAP.off and SWAP.on
//   that is beside the body (clear there: the plan's measured range);
// - no time at all (t null – a caller outside the replay: tools, v0.41–v0.44's tests): the beside-the-body plan alone,
//   a pure function of the angle as before v0.45 (the app always passes the session's time);
// - unwinding faster than the regrip back, the other way's end of it stays where that plan is clean (arms.js
//   armSwapPose: no nearer straight ahead than SWAP.off − 2°) – the hand off its grip comes round to the wheel's grip
//   wherever it is by then.
import { SWAP, swapEase } from "./arms.js";

export const JUMP_MS = 1000;
export const swapState = () => ({ goal: 0, q: 0, t: null });
// st: swapState(); deg: the wheel's angle in this arm's own frame (the left arm's: − lowers its hand; the right arm's
// is the mirrored one); t: the session's time (ms) or null. Returns the eased q for
// armSwapPose and keeps st up to date.
export function stepSwap(st, deg, t) {
  if (t == null) { st.goal = 0; st.q = 0; st.t = null; return 0; }
  const low = -deg, steady = low >= SWAP.on ? 1 : 0;
  if (st.t == null || t < st.t || t - st.t > JUMP_MS) { st.goal = steady; st.q = steady; }
  else {
    if (low >= SWAP.on) st.goal = 1; else if (low <= SWAP.off) st.goal = 0;
    const dq = (t - st.t) / SWAP.ms;
    st.q = st.goal > st.q ? Math.min(st.goal, st.q + dq) : Math.max(st.goal, st.q - dq);
  }
  st.t = t;
  return swapEase(st.q);
}
