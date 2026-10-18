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
// v0.40: the angle above changed source with the car's path – the lap's s on the track, the lane's u in the pit lane,
// rolled on elsewhere – and the two have different origins, so a wheel jumped round by up to a turn as a car came into
// the pit lane, left it, went from an estimated placement (a pit-lane starter) to its own positions, or got its
// positions back after a gap. Now, where the car's telemetry has its speed (CarData channel 2, the wheel-speed figure
// the TV graphics show), a wheel's angle is the distance the car has rolled by that speed (an odometer): one measure
// for the whole session whatever path the car is drawn on – continuous through every switch of path, still at a
// pause, the same at any playback speed and after any seek (a function of the session's time only, built once from the
// samples, never from the frames shown). While the car stands by its positions (a stop, the jacks up: the wheel-speed
// figure jumps while the crew turn the wheels) nothing is added. Without telemetry the path rules above still apply.
//   car: the replay's telemetry arrays { t, v (km/h), … } (replay.js carAt) – the odometer is kept on it as odo { d, n }
//   (a typed array for a replay's fixed arrays; a plain one extended as a live feed's samples arrive, cut with them);
//   still(t): true while the car stands by its positions (optional)
export const ODO = { gap: 3000, span: 1000, still: 0.8 };   // ms between samples over which nothing is integrated; the
// standing test: moved less than `still` m/s over the last `span` ms of positions
export function odometer(car, still = null) {
  if (!car?.t) return null;
  const n = car.t.length;
  let o = car.odo;
  if (!o || o.n > n) o = car.odo = { d: ArrayBuffer.isView(car.t) ? new Float64Array(n) : [], n: 0 };
  const d = o.d; let i = o.n;
  if (i >= n) return o;
  if (i === 0) { d[0] = 0; i = 1; }
  for (; i < n; i++) {
    const dt = car.t[i] - car.t[i - 1];
    const v0 = Math.max(0, car.v[i - 1] || 0), v1 = Math.max(0, car.v[i] || 0);
    let add = dt > 0 && dt <= ODO.gap ? ((v0 + v1) / 2 / 3.6) * (dt / 1000) : 0;
    if (add && still && still(car.t[i])) add = 0;
    d[i] = d[i - 1] + add;
  }
  o.n = n;
  return o;
}
// the odometer (m) at session time t – linear in the speed between samples (the trapezoid's partial area); null when
// the car has no sample within ODO.gap of t (no telemetry: the path rules apply)
export function odometerAt(car, t, still = null) {
  const o = odometer(car, still); if (!o) return null;
  const T = car.t, d = o.d, n = Math.min(T.length, o.n);
  if (!n || T[0] > t) return null;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= t) lo = m; else hi = m - 1; }
  const dt = t - T[lo];
  if (dt > ODO.gap) return null;
  if (lo + 1 >= n || dt <= 0) return d[lo];
  const span = T[lo + 1] - T[lo];
  if (!(span > 0) || span > ODO.gap || d[lo + 1] === d[lo]) return d[lo];
  // (the speed linear between the two samples: the distance by time f of the span)
  const v0 = Math.max(0, car.v[lo] || 0) / 3.6, v1 = Math.max(0, car.v[lo + 1] || 0) / 3.6, f = dt / span, s = span / 1000;
  const part = (v0 * f + (v1 - v0) * f * f / 2) * s, full = ((v0 + v1) / 2) * s;
  return d[lo] + (full > 0 ? (d[lo + 1] - d[lo]) * (part / full) : 0);
}

// still(t) for odometer(): from a car's position track (replay.js CarTracks: t ms, x / y decimetres, n) – standing when
// its positions moved under ODO.still m/s over the ODO.span ms before t; never standing without positions near t (a gap
// in them must not stop the wheels)
export function stillFromTrack(trk) {
  if (!trk) return null;
  return (t) => {
    const n = trk.n ?? trk.t.length; if (!n || trk.t[0] > t) return false;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (trk.t[m] <= t) lo = m; else hi = m - 1; }
    if (t - trk.t[lo] > ODO.span * 2) return false;
    let j = lo; while (j > 0 && trk.t[lo] - trk.t[j - 1] <= ODO.span) j--;
    const dt = (trk.t[lo] - trk.t[j]) / 1000; if (!(dt > 0.2)) return false;
    return Math.hypot(trk.x[lo] - trk.x[j], trk.y[lo] - trk.y[j]) * 0.1 / dt < ODO.still;
  };
}

// How much the wheel's markings smear on screen: the angle it turns while a camera's shutter is open (rad). The shutter
// here: 1/100 s (a TV camera's usual shutter at 50 fps) × the playback rate – not the frame's own time (a slow frame is not a longer
// exposure: frames taken slowly showed a wheel at 20 km/h smeared into a ring). ω: rad per session second; rate: the
// playback rate (0 paused; F1KR.rate); jumped: the session's time jumped this frame (a seek) – no smear.
export const SHUTTER = 1 / 100;
export function smearOf(omega, rate, jumped = false) { return jumped ? 0 : Math.abs(omega) * Math.max(0, Math.min(32, rate || 0)) * SHUTTER; }
