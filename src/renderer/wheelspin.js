// How far round the wheels are: from where the car is, not from the frame clock (pure; map3d.js turns the wheels).
// v0.39: the wheels rolled by the screen's frame time × the car's speed – on at a pause (the speed stays), too slow at
// 2× and 4×, and anything after a seek. The feed has no wheel speed: a wheel's angle here is the distance the car has
// gone along the road over its rolling radius – an approximation (no wheelspin, no locking, the lap line's length, not
// the car's own line).
//   On the track: the distance along the lap line (smooth.js s, continuous over the laps) – the same moment always the
//   same angle, at any speed, after any seek. The radius is nudged (≤ 1/2 turn a lap: ~0.01 %) so a lap is a whole
//   number of turns – a car crossing the line keeps its angle.
//   In the pit lane: the distance along the lane (the same rule, its own length).
//   Elsewhere (a run-off, a placement without positions): rolled on from the last angle by the session's time ×
//   speed – nothing at a pause; a jump of the session's time (a seek) or a teleport carries no turning over.

const TAU = Math.PI * 2;
// the radius r (m) made so that a length L (m) is a whole number of turns
export function lapRadius(r, L) {
  if (!(L > 0) || !(r > 0)) return r;
  const turns = Math.max(1, Math.round(L / (TAU * r)));
  return L / (TAU * turns);
}
export const wrapAngle = (a) => ((a % TAU) + TAU) % TAU;
// the angle for a distance d (m) along a path of length L (null: open) with a tyre of radius r
export function rollAngle(d, r, L = null) { return wrapAngle(d / (L ? lapRadius(r, L) : r)); }
// SPIN.maxStep: the most session time (s) rolled over in one step – more is a seek; SPIN.maxJump: a car moved further
// than its speed allows (m) is a teleport
export const SPIN = { maxStep: 1.0, maxJump: 25 };
// One step of a wheel's angle. w: the wheel's state { a (rad), t (session ms) | null } (changed in place);
//   o: { t (session ms now), r (m), along: { d, L } | null (the distance on the lap or the lane – an exact angle),
//        speed (m/s, signed: + forward), moved (m since the last step, optional – a check on teleports) }
// → the angle (rad, 0..2π)
export function stepWheel(w, { t, r, along = null, speed = 0, moved = null }) {
  if (along && Number.isFinite(along.d)) { w.a = rollAngle(along.d, r, along.L); w.t = t; return w.a; }
  const dts = w.t == null ? 0 : (t - w.t) / 1000;
  w.t = t;
  if (w.a == null) w.a = 0;
  if (!(dts > 0) || dts > SPIN.maxStep) return w.a;                                 // paused, back, or a seek
  if (moved != null && moved > Math.abs(speed) * dts + SPIN.maxJump) return w.a;    // a teleport
  w.a = wrapAngle(w.a + (speed * dts) / r);
  return w.a;
}
// How much the wheel's markings smear on screen: the angle it turns while a frame is shown (rad) – what a camera's
// shutter sees (TV: ~1/100 s). ω: rad per session second; dts: the session's time the frame stands for (s: the screen's
// frame time × the playback speed – 0 paused; a seek's jump is not a frame's: capped)
export function smearOf(omega, dts) { return Math.abs(omega) * Math.max(0, Math.min(0.2, dts || 0)); }
