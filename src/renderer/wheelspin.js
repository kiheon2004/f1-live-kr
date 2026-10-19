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
export const ODO = { gap: 3000, span: 1000, still: 0.8 };   // ms between samples over which nothing is integrated; the
// standing test: moved less than `still` m/s over the last `span` ms of positions
// v0.41: what the v0.40 odometer got wrong, and the rules now.
//  1. It was built once and never again: a standing verdict (still(t)) taken before the positions for that moment had
//     come in stayed in it for good. t [0, 1000, 2000] at 36 km/h, built with still = false then asked with still =
//     true: 10 m at 1 s from the cache, 0 m from a fresh one. Live this happened at every pit stop: Position and CarData
//     come as separate batches about once a second (4–5 samples over ~0.75 s each; 2025 Monza race stream: median 1.0 s,
//     95 % ≤ 1.3 s), so the newest speed samples were judged on positions up to a second old – a car pulling out of its
//     box still "standing" lost 1–4.5 m per sample (33 samples in the 2025 Monza race fed in arrival order, −45 m in
//     all), and the same data opened afterwards gave other angles. Now the odometer is built from the position track
//     itself (trk) and remembers how far the positions went when each sample was built (o.pt): the samples after that
//     are the unconfirmed span, rebuilt – only they – when newer positions arrive. A sample whose positions have arrived
//     is final: positions are only ever appended (replay.js CarTracks.push drops a sample older than the last), and
//     the standing test and the gap fill below look only backwards from the sample, so later data can't change it.
//     Live confirm policy: a sample is confirmed once the car's positions reach its time. Late correction: until then
//     it is rebuilt each time positions arrive; a sample cut from the live buffer (o.cut, replay.js keeps 1400 samples)
//     is final as it stands. Same confirmed data, same session time → the same distance, whatever was asked before.
//  2. Without speed samples (a hole in CarData, before its first sample, after its last) the wheels went back to the
//     path rules (the lap's s, the lane's u, rolled on) – another origin, a jump in and a jump out. Now the distance
//     goes on by the car's own positions there (trackOdo: the length of its position track, standing time left out):
//     over a hole the odometer adds the positions' distance, so the angle is one measure through every gap and
//     recovery, a pure function of the data and the time (no per-seek offsets). Only a car with neither telemetry nor
//     positions near (an estimated placement) is left to the path rules (stepWheel).
//  3. Live, the newest speed sample is up to ~1 s old (the batches above): odometerAt held its distance until the next
//     batch – the wheels stood for most frames and jumped ~1 s worth (2025 Monza fed live: 95 % of moving frames frozen,
//     jumps to 147 m). Past the newest speed sample it now goes on by the positions where they reach further (and map3d
//     asks at the time the car is drawn – live 0.6 s back), holding only where the car's drawn position holds too.

// the car standing at t by its positions (≤ t only): moved under ODO.still m/s over the ODO.span ms before; never
// standing without positions near t (a gap in them must not stop the wheels)
// (hint: an index at or before the last sample ≤ t – a walk forward from it instead of a search, for the builds' runs)
function standing(trk, t, hint = -1) {
  const n = trk.n ?? trk.t.length; if (!n || trk.t[0] > t) return false;
  let lo = 0, hi = n - 1;
  if (hint >= 0 && hint < n && trk.t[hint] <= t) { lo = hint; while (lo + 1 < n && trk.t[lo + 1] <= t) lo++; }
  else while (lo < hi) { const m = (lo + hi + 1) >> 1; if (trk.t[m] <= t) lo = m; else hi = m - 1; }
  if (t - trk.t[lo] > ODO.span * 2) return false;
  let j = lo; while (j > 0 && trk.t[lo] - trk.t[j - 1] <= ODO.span) j--;
  const dt = (trk.t[lo] - trk.t[j]) / 1000; if (!(dt > 0.2)) return false;
  return Math.hypot(trk.x[lo] - trk.x[j], trk.y[lo] - trk.y[j]) * 0.1 / dt < ODO.still;
}
// (the samples up to just past session time upTo: index bound)
function boundOf(T, n, upTo) {
  if (!(upTo < Infinity) || !n || T[n - 1] <= upTo) return n;
  let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] > upTo) hi = m; else lo = m + 1; }
  return Math.min(n, lo + 2);
}
const newest = (trk) => { const n = trk?.n ?? trk?.t?.length ?? 0; return n ? trk.t[n - 1] : -Infinity; };

// A car's position track's own odometer (replay.js CarTracks: t ms, x / y decimetres, n; live: plain arrays that grow
// and are cut from the front – CarTracks.trim – `grow`): the length of the path (m), standing time left out, per
// sample, kept on the track as odo { c, t (live: the samples' times, to follow the trim), n }; built only as far as
// asked. Each value looks only backwards, so it never changes once built.
export function trackOdo(trk, upTo = Infinity) {
  if (!trk?.t) return null;
  const N = trk.n ?? trk.t.length, grow = Array.isArray(trk.t);
  let o = trk.odo;
  if (!o || (!grow && o.c.length < N)) {
    o = trk.odo = { c: grow ? [] : new Float64Array(trk.t.length), t: grow ? [] : null, n: 0, base: 0 };
    // (live: before CarTracks.trim cuts k samples – built over them first, so the distance they held stays)
    o.cut = (k) => { if (trk.odo === o && k > 0) trackOdo(trk, trk.t[Math.min(k, (trk.n ?? trk.t.length) - 1)]); };
  }
  if (grow && o.n && o.t[0] < trk.t[0]) {           // trimmed: drop what was dropped
    let k = 0; while (k < o.n && o.t[k] < trk.t[0]) k++;
    const last = o.c[o.n - 1]; o.c.splice(0, k); o.t.splice(0, k); o.n -= k;
    if (!o.n) o.base = last;                          // (cut beyond what was built: on from the last distance known)
  }
  const n = boundOf(trk.t, N, upTo);
  for (let i = o.n; i < n; i++) {
    const c = i === 0 ? o.base : o.c[i - 1] + (standing(trk, trk.t[i], i) ? 0 : Math.hypot(trk.x[i] - trk.x[i - 1], trk.y[i] - trk.y[i - 1]) * 0.1);
    if (grow) { o.c[i] = c; o.t[i] = trk.t[i]; } else o.c[i] = c;
  }
  if (n > o.n) o.n = n;
  return o;
}
// the track's distance (m) at session time t – linear between its samples, held before the first and after the last
// (as the car's drawn position is: replay.js CarTracks.at); null without positions
export function trackDist(trk, t) {
  const o = trackOdo(trk, t); if (!o || !o.n) return null;
  const T = trk.t, n = o.n, c = o.c;
  if (t <= T[0]) return c[0];
  let lo = 0, hi = n - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= t) lo = m; else hi = m - 1; }
  if (lo + 1 >= n) return c[lo];
  const h = T[lo + 1] - T[lo];
  return h > 0 ? c[lo] + (c[lo + 1] - c[lo]) * ((t - T[lo]) / h) : c[lo];
}

// v0.40: the angle above changed source with the car's path – the lap's s on the track, the lane's u in the pit lane,
// rolled on elsewhere – and the two have different origins, so a wheel jumped round by up to a turn as a car came into
// the pit lane, left it, went from an estimated placement (a pit-lane starter) to its own positions, or got its
// positions back after a gap. Now, where the car's telemetry has its speed (CarData channel 2, the wheel-speed figure
// the TV graphics show), a wheel's angle is the distance the car has rolled by that speed (an odometer): one measure
// for the whole session whatever path the car is drawn on – continuous through every switch of path, still at a
// pause, the same at any playback speed and after any seek (a function of the session's time only, built once from the
// samples, never from the frames shown). While the car stands by its positions (a stop, the jacks up: the wheel-speed
// figure jumps while the crew turn the wheels) nothing is added.
//   car: the replay's telemetry arrays { t, v (km/h), … } (replay.js carAt) – the odometer is kept on it as odo { d, n }
//   (a typed array for a replay's fixed arrays; a plain one extended as a live feed's samples arrive, cut with them –
//   o.cut(k), before the samples are spliced);
//   trk: the car's position track (replay.js CarTracks car), or null (no positions: the speed is trusted throughout)
// (built only as far as asked – upTo: a session time; the samples up to just past it – so opening a replay doesn't
// integrate 20 cars' whole race in one frame (~160 ms for Monza 2025); the values are the same however far it was built)
export function odometer(car, trk = null, upTo = Infinity) {
  if (!car?.t) return null;
  // (a still(t) function – the v0.40 form, kept for callers that have no track: never rebuilt)
  const still = typeof trk === "function" ? trk : null; if (still) trk = null;
  const T = car.t;
  let o = car.odo;
  if (!o || o.n > T.length || o.trk !== trk || o.still !== still) {
    o = car.odo = { d: ArrayBuffer.isView(T) ? new Float64Array(T.length) : [], n: 0, trk, still, pt: -Infinity, u: 0 };
    // (live: the oldest k samples about to be cut – built first, so nothing they held is lost, then dropped, final)
    o.cut = (k) => { if (car.odo !== o || !Array.isArray(o.d)) return; odometer(car, o.still || o.trk, T[Math.min(k, T.length - 1)]); o.d.splice(0, k); o.n = Math.max(0, o.n - k); o.u = Math.max(1, o.u - k); if (!o.n) car.odo = null; };   // (the new first sample's distance stays: never re-anchored)
  }
  // newer positions: the unconfirmed span (the samples past the positions they were built on) again
  if (trk) { const pt = newest(trk); if (pt > o.pt) { if (o.u < o.n) o.n = o.u; o.pt = pt; } }
  const n = boundOf(T, T.length, upTo), d = o.d;
  let h = -1;   // (where in the positions the last sample was judged: the next starts its walk there)
  for (let i = o.n; i < n; i++) {
    if (i === 0) {
      // (the start where the positions are: a car whose telemetry starts after its positions goes on from their
      // distance – trackDist – without a jump)
      d[0] = trk && newest(trk) >= T[0] && trk.t[0] <= T[0] ? trackDist(trk, T[0]) : 0;
      continue;
    }
    const dt = T[i] - T[i - 1];
    let add = 0;
    if (dt > 0 && dt <= ODO.gap) {
      add = ((Math.max(0, car.v[i - 1] || 0) + Math.max(0, car.v[i] || 0)) / 2 / 3.6) * (dt / 1000);
      if (add && trk) {
        const N = trk.n ?? trk.t.length;
        if (h < 0) h = Math.max(0, boundOf(trk.t, N, T[i]) - 3);
        while (h > 0 && trk.t[h] > T[i]) h--; while (h + 1 < N && trk.t[h + 1] <= T[i]) h++;
        if (standing(trk, T[i], h)) add = 0;
      }
      else if (add && still && still(T[i])) add = 0;
    } else if (dt > ODO.gap && trk) {
      // a hole in the telemetry: the positions' distance over it
      const a = trackDist(trk, T[i - 1]), b = trackDist(trk, T[i]);
      if (a != null && b != null && b > a) add = b - a;
    }
    d[i] = d[i - 1] + add;
  }
  if (n > o.n) o.n = n;
  while (o.u < o.n && !(T[o.u] > o.pt)) o.u++;
  if (!trk) o.u = o.n;
  return o;
}
// the odometer (m) at session time t – linear in the speed between samples (the trapezoid's partial area); over a hole
// in the telemetry, before its first sample and past its last, on by the positions (trackDist); null only with neither
// (no telemetry within ODO.gap of t and no positions: the path rules apply)
export function odometerAt(car, t, trk = null) {
  const still = typeof trk === "function" ? trk : null; if (still) trk = null;
  const has = trk && (trk.n ?? trk.t?.length);
  if (!car?.t?.length) return has ? trackDist(trk, t) : null;
  const o = odometer(car, still || trk, t); if (!o) return null;
  const T = car.t, d = o.d, n = Math.min(T.length, o.n);
  if (!n) return null;
  if (T[0] > t) return has ? d[0] - (trackDist(trk, T[0]) - trackDist(trk, t)) : null;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= t) lo = m; else hi = m - 1; }
  const dt = t - T[lo];
  if (dt <= 0) return d[lo];
  if (lo + 1 >= n) {
    // past the newest sample: on by the positions where they reach further; else held
    if (has && newest(trk) > T[lo]) return d[lo] + Math.max(0, trackDist(trk, t) - trackDist(trk, T[lo]));
    return dt > ODO.gap ? null : d[lo];
  }
  const span = T[lo + 1] - T[lo];
  if (span > ODO.gap) {
    // a hole: the positions' share of what was added over it (it ends exactly on the next sample); their distance
    // taken over ±0.5 s (the raw 4 Hz positions' own spacing and timing make a wheel's speed jump from 11 to 160 km/h
    // between samples – a pit entry at 80 km/h, Monza 2025 – and the average of a rising function still rises)
    if (!has) return dt > ODO.gap ? null : d[lo];
    const a = holeDist(trk, T[lo]), b = holeDist(trk, T[lo + 1]), x = holeDist(trk, t);
    return b > a ? d[lo] + (d[lo + 1] - d[lo]) * Math.min(1, Math.max(0, (x - a) / (b - a))) : d[lo];
  }
  if (!(span > 0) || d[lo + 1] === d[lo]) return d[lo];
  // (the speed linear between the two samples: the distance by time f of the span)
  const v0 = Math.max(0, car.v[lo] || 0) / 3.6, v1 = Math.max(0, car.v[lo + 1] || 0) / 3.6, f = dt / span, s = span / 1000;
  const part = (v0 * f + (v1 - v0) * f * f / 2) * s, full = ((v0 + v1) / 2) * s;
  return d[lo] + (full > 0 ? (d[lo + 1] - d[lo]) * (part / full) : 0);
}

const holeDist = (trk, t) => (trackDist(trk, t - 500) + trackDist(trk, t - 250) + trackDist(trk, t) + trackDist(trk, t + 250) + trackDist(trk, t + 500)) / 5;
// still(t) for odometer() from a car's position track (the v0.40 form; odometer(car, trk) uses the track itself)
export function stillFromTrack(trk) { return trk ? (t) => standing(trk, t) : null; }

// How much the wheel's markings smear on screen: the angle it turns while a camera's shutter is open (rad). The shutter
// here: 1/100 s (a TV camera's usual shutter at 50 fps) × the playback rate – not the frame's own time (a slow frame is not a longer
// exposure: frames taken slowly showed a wheel at 20 km/h smeared into a ring). ω: rad per session second; rate: the
// playback rate (0 paused; F1KR.rate); jumped: the session's time jumped this frame (a seek) – no smear.
export const SHUTTER = 1 / 100;
export function smearOf(omega, rate, jumped = false) { return jumped ? 0 : Math.abs(omega) * Math.max(0, Math.min(32, rate || 0)) * SHUTTER; }
