// Steadier car motion for the 3D view.
// F1's positions come four times a second and are a metre or two off; a curve through every one of them makes
// a car weave on the straights and surge and check along them. Here each car's positions are put into the
// track's own frame – distance along the lap line (s) and offset across it (d) – and the two are treated
// separately, the way a car really moves:
//   d (across)  changes slowly: outliers dropped (median of 5), then a Gaussian of ±0.5 s.
//   s (along)   follows the car's own speed from its telemetry (CarData, ~4 Hz): s = ∫speed dt + a correction
//               that ties it to the positions, smoothed over ±1.5 s (it only absorbs the slow drift between
//               the car's path and the lap line). Without telemetry, a Gaussian of ±0.35 s on s.
// In the pit lane, off the circuit or under a bridge the positions are used as they are.
// Replays are smoothed both ways in time (the whole session is known); live, the last 30 s are redone once
// a second, so the newest moments are smoothed one-sidedly.
// The result has the same interface as ReplayKit's CarTracks: all(t, into, vels) in F1 decimetres.

import { onPitPath } from "./startplan.js";

const DM = 0.1;
const STEP_OUT = 125;          // ms between output samples

// Gaussian smoothing of values v at (uneven) times t, sigma in ms, in place into `out`.
function gauss(t, v, sigma, out = new Float64Array(v.length), weight = null) {
  const n = v.length, w3 = sigma * 3;
  let lo = 0;
  for (let i = 0; i < n; i++) {
    while (t[lo] < t[i] - w3) lo++;
    let sw = 0, sv = 0;
    for (let j = lo; j < n && t[j] <= t[i] + w3; j++) {
      const dt = (t[j] - t[i]) / sigma, w = Math.exp(-0.5 * dt * dt) * (weight ? weight[j] : 1);
      sw += w; sv += w * v[j];
    }
    out[i] = sw > 0 ? sv / sw : v[i];
  }
  return out;
}
const median5 = (v) => { const n = v.length, out = new Float64Array(n), a = new Float64Array(5); for (let i = 0; i < n; i++) { for (let k = -2; k <= 2; k++) a[k + 2] = v[Math.max(0, Math.min(n - 1, i + k))]; a.sort(); out[i] = a[2]; } return out; };

// The lap line as a frame: project (x, z) → { s, d, dist, i } and back.
// The line's samples aren't evenly spaced (0.5–3.7 m apart), so s is the real distance along it.
export function trackFrame(world) {
  const S = world.samples, n = S.length, cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { const a = S[i].p, b = S[(i + 1) % n].p; cum[i + 1] = cum[i] + Math.hypot(b.x - a.x, b.z - a.z); }
  const L = cum[n];
  // [index of the sample at or before s, fraction to the next]
  const locate = (s) => {
    const u = ((s % L) + L) % L;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= u) lo = m; else hi = m; }
    return [lo, (u - cum[lo]) / (cum[lo + 1] - cum[lo] || 1)];
  };
  // The cars' path along the lap line: the samples with their last millimetre-scale wiggles (the reference line
  // F1 matches positions to is made of short straight pieces) smoothed out – at 80 m/s those are a shake – by a
  // Gaussian of ±6 m with its shrinkage taken back (2·G − G∘G, so corners keep their radius), and a cubic
  // through them (Catmull-Rom). Millimetres from the drawn track.
  const G = (v) => { const o = new Float64Array(n); for (let i = 0; i < n; i++) { let a = 0, w = 0; for (let j = -9; j <= 9; j++) { const k = Math.exp(-0.5 * (j / 3) ** 2); a += v[(i + j + n) % n] * k; w += k; } o[i] = a / w; } return o; };
  const unshrunk = (v) => { const g = G(v), gg = G(g); return v.map((_, i) => 2 * g[i] - gg[i]); };
  const QX = unshrunk(Float64Array.from(S, (q) => q.p.x)), QZ = unshrunk(Float64Array.from(S, (q) => q.p.z)), QY = Float64Array.from(S, (q) => q.p.y);
  const pos = (s) => {
    const [i, t] = locate(s), I = (k) => (i + k + n) % n, a = I(-1), b = I(0), c = I(1), e = I(2);
    return [cr(QX[a], QX[b], QX[c], QX[e], t), cr(QY[a], QY[b], QY[c], QY[e], t), cr(QZ[a], QZ[b], QZ[c], QZ[e], t)];
  };
  return {
    L,
    project(x, z, hint) {
      let s0 = null, dd = Infinity;
      if (hint != null) {   // search near the last sample first (cheap, and right at crossings like Suzuka's)
        for (let k = -6; k <= 6; k++) { const q = S[(((hint + k) % n) + n) % n], d = (q.p.x - x) ** 2 + (q.p.z - z) ** 2; if (d < dd) { dd = d; s0 = q; } }
        if (dd > 400) s0 = null;
      }
      if (!s0) { const r = world.grid.nearest(x, z, 3); s0 = r[0]; if (!s0) return null; }
      const a = (x - s0.p.x) * s0.tan.x + (z - s0.p.z) * s0.tan.z, d = (x - s0.p.x) * s0.nor.x + (z - s0.p.z) * s0.nor.z;
      return { s: cum[s0.i] + a, d, i: s0.i, sample: s0 };
    },
    // the sample at or just before s
    sampleAt(s) { return S[locate(s)[0]]; },
    // the racing line's offset at s (samples' .line, metres left of the lap line; 0 without one), cubic
    lineAt(s) {
      const [i, t] = locate(s), v = (k) => S[(i + k + n) % n].line || 0;
      return cr(v(-1), v(0), v(1), v(2), t);
    },
    // position at s (any real, wraps) and offset d: [x, y, z] in scene metres. The lap line is a cubic through
    // its samples, so the path is smooth (no corner at every sample: in a 15 m hairpin those were ~8° each).
    // With `dir` also its unit direction [x, z].
    at(s, d, out, dir) {
      const [x, y, z] = pos(s);
      // the direction across which d is taken: from a chord over ±4 m (the tangent itself flutters a little with
      // the fine wiggles of the lap line, and 5 m out that shows)
      const [xa, , za] = pos(s - 4), [xb, , zb] = pos(s + 4);
      let tx = xb - xa, tz = zb - za;
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      out[0] = x - tz * d;
      out[1] = y;
      out[2] = z + tx * d;
      if (dir) { dir[0] = tx; dir[1] = tz; }
      return out;
    },
  };
}
// Catmull-Rom through p0..p3 at t in [p1, p2]
const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));

// The racing line: an offset from the lap line for every sample (metres, + = left), kept `margin` inside the
// edges (s.L, s.R), that minimises the line's curvature – the classic geometric racing line: out wide before a
// corner, the apex clipped, out wide again on the exit, straight across chicanes where it fits.
// The curvature at point i is the second difference P(i−k) − 2P(i) + P(i+k); for each point in turn the offset that
// minimises the sum of the squared ones it appears in (the bi-Laplacian condition) is taken, half way, and clamped
// to the edges. Coarse spacings first (the overall shape over 100+ m), then finer ones.
// (F1's position feed is now matched to one reference line – every car is on it – so the line can't be read from
// the data; this is the line a driver takes on a clear lap.)
export function racingLine(samples, margin = 0.75) {
  const n = samples.length;
  const px = new Float64Array(n), pz = new Float64Array(n), nx = new Float64Array(n), nz = new Float64Array(n);
  const lo = new Float64Array(n), hi = new Float64Array(n), a = new Float64Array(n);
  samples.forEach((s, i) => {
    px[i] = s.p.x; pz[i] = s.p.z; nx[i] = s.nor.x; nz[i] = s.nor.z;
    const L = (s.L ?? 7) - margin, R = (s.R ?? -7) + margin;
    if (L > R) { lo[i] = R; hi[i] = L; } else lo[i] = hi[i] = ((s.L ?? 7) + (s.R ?? -7)) / 2;
  });
  const X = (i, k) => { const j = (((i + k) % n) + n) % n; return [px[j] + nx[j] * a[j], pz[j] + nz[j] * a[j]]; };
  for (const [k, iters] of [[40, 60], [24, 60], [14, 60], [8, 80], [4, 100], [2, 120]]) {
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < n; i++) {
        const [x1, z1] = X(i, -k), [x2, z2] = X(i, k), [x0, z0] = X(i, -2 * k), [x3, z3] = X(i, 2 * k);
        const tx = (4 * (x1 + x2) - (x0 + x3)) / 6, tz = (4 * (z1 + z2) - (z0 + z3)) / 6;
        const want = (tx - px[i]) * nx[i] + (tz - pz[i]) * nz[i];
        a[i] = Math.min(hi[i], Math.max(lo[i], a[i] + 0.6 * (want - a[i])));
      }
    }
  }
  // the finest scale doesn't fully settle (a point-to-point roughness of a centimetre or so – a car following
  // it flutters): smoothed over ±8 m and clamped again, twice
  const K = 12, W = Array.from({ length: 2 * K + 1 }, (_, j) => Math.exp(-0.5 * ((j - K) / 4) ** 2)), ws = W.reduce((x, y) => x + y, 0);
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float64Array(n);
    for (let i = 0; i < n; i++) { let v = 0; for (let j = -K; j <= K; j++) v += a[(i + j + n) % n] * W[j + K]; b[i] = Math.min(hi[i], Math.max(lo[i], v / ws)); }
    a.set(b);
  }
  return a;
}

// Distance travelled from the speed telemetry: returns S(t) (metres since the first sample), or null.
export function speedIntegral(car, lag = 0) {
  if (!car || !car.t || car.t.length < 20) return null;
  const n = car.t.length, S = new Float64Array(n), T = Float64Array.from(car.t, (t) => t - lag);
  // the speed channel is whole km/h a few times a second: lightly smoothed (±0.18 s) so it has no steps, and the
  // acceleration from a softer copy (±0.3 s), per sample, linear in between
  const V = gauss(T, Float64Array.from(car.v), 180), V2 = gauss(T, V, 250), A = new Float64Array(n);
  for (let i = 0; i < n; i++) { const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), h = (T[i1] - T[i0]) / 1000; A[i] = h > 0 && h < 3 ? (V2[i1] - V2[i0]) / 3.6 / h : 0; }
  for (let i = 1; i < n; i++) { const dt = (T[i] - T[i - 1]) / 1000; S[i] = S[i - 1] + (dt > 0 && dt < 3 ? ((V[i] + V[i - 1]) / 2 / 3.6) * dt : 0); }
  const find = (t) => { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; } return lo; };
  const fn = (t) => {
    if (t <= T[0]) return S[0];
    if (t >= T[n - 1]) return S[n - 1] + (V[n - 1] / 3.6) * Math.min(3, (t - T[n - 1]) / 1000);
    const lo = find(t), hi = lo + 1;
    const dt = (t - T[lo]) / 1000, a = V[lo] / 3.6, b = V[hi] / 3.6, h = (T[hi] - T[lo]) / 1000 || 1;
    return S[lo] + a * dt + ((b - a) / h) * dt * dt / 2;
  };
  // speed (m/s) and acceleration (m/s²) at t – the exact derivative of fn, and the softer acceleration
  fn.v = (t) => { if (t <= T[0]) return V[0] / 3.6; if (t >= T[n - 1]) return V[n - 1] / 3.6; const lo = find(t), f = (t - T[lo]) / (T[lo + 1] - T[lo] || 1); return (V[lo] + (V[lo + 1] - V[lo]) * f) / 3.6; };
  fn.a = (t) => { if (t <= T[0] || t >= T[n - 1]) return 0; const lo = find(t), f = (t - T[lo]) / (T[lo + 1] - T[lo] || 1); return A[lo] + (A[lo + 1] - A[lo]) * f; };
  return fn;
}

// CarData and Position are stamped separately: telemetry can run a few hundred ms ahead of or behind the
// positions. The lag (ms) that best lines up the speed from the positions with the telemetry speed, over a
// sample of cars and moments (median error), is applied to the telemetry.
function telemetryLag(src) {
  const pairs = [];
  for (const [num, c] of Object.entries(src.tracks.cars)) {
    const car = src.car?.[num];
    if (!car || !car.t || car.t.length < 100 || c.n < 200) continue;
    for (let k = 2; k < c.n - 2; k += 7) {
      const dt = c.t[k + 2] - c.t[k - 2];
      if (dt <= 0 || dt > 2500) continue;
      const v = (Math.hypot(c.x[k + 2] - c.x[k - 2], c.y[k + 2] - c.y[k - 2]) * DM) / (dt / 1000) * 3.6;
      if (v > 60 && v < 360) pairs.push([c.t[k], v, car]);
    }
    if (pairs.length > 6000) break;
  }
  if (pairs.length < 300) return 0;
  const speedAt = (car, t) => { const T = car.t; let lo = 0, hi = T.length - 1; if (t <= T[0] || t >= T[hi]) return null; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; } const f = (t - T[lo]) / (T[hi] - T[lo] || 1); return car.v[lo] + (car.v[hi] - car.v[lo]) * f; };
  let best = 0, bestErr = Infinity;
  for (let lag = -2500; lag <= 2500; lag += 50) {
    const err = [];
    for (const [t, v, car] of pairs) { const w = speedAt(car, t + lag); if (w != null) err.push(Math.abs(w - v)); }
    err.sort((a, b) => a - b);
    const med = err[Math.floor(err.length / 2)];
    if (med < bestErr) { bestErr = med; best = lag; }
  }
  return best;
}

// Smooths one car's samples (arrays t, x, y, z in dm, n of them, from index `from`) into output arrays: positions
// (F1 dm) every STEP_OUT ms, and on the track also its track coordinates – s (m along the lap line, continuous
// within a stretch), d (m across), the stretch's id (run; 0 = off the track: pit lane, run-off, under a bridge).
// `snapped`: the positions are matched to one line (every car on it), so across the track the car is put on the
// racing line instead, eased in and out over 1.5 s at the ends of a stretch (the pit entry and exit).
// The measured pit lane's path as 2 m cells (within 3 m of it, 40 m clear of its ends – startplan.js onPitPath's
// test, made once per world): (x, z) → in the lane. One lookup a sample – the precise test over every sample of a
// session would be millions of segment tests.
const laneCellsFor = new WeakMap();
function laneCells(world) {
  const lane = world.pitLane; if (!lane) return () => false;
  let set = laneCellsFor.get(lane);
  if (!set) {
    set = new Set(); const C = 2, key = (i, j) => i * 100003 + j;
    const x0 = Math.min(...lane.pts.map((p) => p.x)) - 6, x1 = Math.max(...lane.pts.map((p) => p.x)) + 6, z0 = Math.min(...lane.pts.map((p) => p.z)) - 6, z1 = Math.max(...lane.pts.map((p) => p.z)) + 6;
    for (let i = Math.floor(x0 / C); i <= Math.ceil(x1 / C); i++) for (let j = Math.floor(z0 / C); j <= Math.ceil(z1 / C); j++)
      if (onPitPath(lane.pts, lane.cum, (i + 0.5) * C, (j + 0.5) * C) != null) set.add(key(i, j));
    set.C = C; set.key = key; laneCellsFor.set(lane, set);
  }
  return (x, z) => set.has(set.key(Math.floor(x / set.C), Math.floor(z / set.C)));
}
function smoothCar(c, from, frame, world, car, out, lag, snapped, runBase) {
  const n = c.n, c0 = world.center, T = c.t;
  const half = (s) => Math.max(s.L ?? 7, -(s.R ?? -7));
  // project every sample; on track = near the lap line (within its edges + 6 m) and at its height
  // (the height tells a bridge from the road under it; a single sample whose height is off – the elevation has
  // the odd spike of 5 m – between two that agree stays on the track: at Suzuka's crossover that cut every lap)
  // (on the measured pit lane's path – startplan.js onPitPath –: in the pit lane, however close the track runs by it –
  // a car in the lane isn't pulled onto the racing line (Barcelona: the lane within the track's edge + 6 m, a car
  // leaving its box was drawn 10 m over towards the track). Tested only off the tarmac, where a pit lane can be.)
  const inLane = laneCells(world);
  const P = [];
  let hint = null;
  for (let k = from; k < n; k++) {
    const x = c.x[k] * DM - c0.x, z = -(c.y[k] * DM - c0.z), y = (c.z[k] || 0) * DM - c0.y;
    const pr = frame.project(x, z, hint);
    const near = !!pr && Math.abs(pr.d) <= half(pr.sample) + 6 && !inLane(x, z), level = !!pr && Math.abs(y - pr.sample.p.y) < 4;
    if (pr) hint = pr.i;
    P.push({ t: T[k], x: c.x[k], y: c.y[k], z: c.z[k], near, level, on: near && level, s: pr?.s, d: pr?.d });
  }
  for (let k = 1; k + 1 < P.length; k++) if (P[k].near && !P[k].level && P[k - 1].on && P[k + 1].near && P[k + 1].level) P[k].on = true;
  const Sv = speedIntegral(car, lag);
  const tmp = [0, 0, 0];
  const emit = (t, x, y, z, s = 0, d = 0, run = 0, vs = NaN, as = 0, w = 0) => { out.t.push(t); out.x.push(x); out.y.push(y); out.z.push(z); out.s.push(s); out.d.push(d); out.run.push(run); out.vs.push(vs); out.as.push(as); out.w.push(w); };
  let k = 0, run = runBase;
  while (k < P.length) {
    if (!P[k].on) { emit(P[k].t, P[k].x, P[k].y, P[k].z); k++; continue; }
    // a run of on-track samples without gaps
    let e = k;
    while (e + 1 < P.length && P[e + 1].on && P[e + 1].t - P[e].t < 4000) e++;
    const m = e - k + 1;
    if (m < 8) { for (let q = k; q <= e; q++) emit(P[q].t, P[q].x, P[q].y, P[q].z); k = e + 1; continue; }
    run++;
    const t = new Float64Array(m), s = new Float64Array(m), d = new Float64Array(m);
    for (let q = 0; q < m; q++) { t[q] = P[k + q].t; s[q] = P[k + q].s; d[q] = P[k + q].d; }
    // unwrap s over the lap (cars go forward; a jump back of more than half a lap is the line being crossed)
    for (let q = 1; q < m; q++) { let ds = s[q] - s[q - 1]; while (ds < -frame.L / 2) { s[q] += frame.L; ds += frame.L; } while (ds > frame.L / 2) { s[q] -= frame.L; ds -= frame.L; } }
    const dS = gauss(t, median5(d), 500);
    // along the track: speed-integrated distance + a slow correction (robust: big misfits weigh less)
    let sAt, vAt = null, aAt = null;
    if (Sv) {
      const bias = new Float64Array(m); for (let q = 0; q < m; q++) bias[q] = s[q] - Sv(t[q]);
      let bS = gauss(t, bias, 1500);
      const w = new Float64Array(m);
      for (let it = 0; it < 2; it++) { for (let q = 0; q < m; q++) { const r = Math.abs(bias[q] - bS[q]); w[q] = r < 3 ? 1 : 3 / r; } bS = gauss(t, bias, 1500, undefined, w); }
      sAt = (tt, q) => { const f = q + 1 < m ? (tt - t[q]) / (t[q + 1] - t[q] || 1) : 0; return Sv(tt) + bS[q] + (q + 1 < m ? (bS[q + 1] - bS[q]) * f : 0); };
      // its exact rate: the telemetry speed plus the correction's slope
      vAt = (tt, q) => Sv.v(tt) + (q + 1 < m ? ((bS[q + 1] - bS[q]) / (t[q + 1] - t[q] || 1)) * 1000 : 0);
      aAt = (tt) => Sv.a(tt);
    } else {
      const sS = gauss(t, s, 350);
      sAt = (tt, q) => { const f = q + 1 < m ? (tt - t[q]) / (t[q + 1] - t[q] || 1) : 0; return sS[q] + (q + 1 < m ? (sS[q + 1] - sS[q]) * f : 0); };
    }
    // dense output every STEP_OUT ms
    const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    let q = 0;
    for (let tt = t[0]; tt <= t[m - 1]; tt += STEP_OUT) {
      while (q + 1 < m && t[q + 1] <= tt) q++;
      const f = q + 1 < m ? (tt - t[q]) / (t[q + 1] - t[q] || 1) : 0;
      const dData = dS[q] + (q + 1 < m ? (dS[q + 1] - dS[q]) * f : 0);
      const ss = sAt(tt, q), w = snapped ? ease(Math.min(tt - t[0], t[m - 1] - tt) / 1500) : 0;
      frame.at(ss, dData * (1 - w) + frame.lineAt(ss) * w, tmp);
      // (d is kept as the data's; the racing line is added back exactly at s when the car is drawn – w)
      emit(tt, (tmp[0] + c0.x) / DM, (c0.z - tmp[2]) / DM, (tmp[1] + c0.y) / DM, ss, dData, run, vAt ? vAt(tt, q) : NaN, aAt ? aAt(tt) : 0, w);
    }
    k = e + 1;
  }
  return run;
}

// Speed along the track (m/s), sideways speed (m/s) and acceleration along it (m/s²) for every output sample of a
// stretch, from the smooth s and d (central differences; the acceleration lightly smoothed, ±0.2 s).
function derive(o) {
  const n = o.t.length;
  o.vd = new Float32Array(n);
  let a = 0;
  while (a < n) {
    if (!o.run[a]) { a++; continue; }
    let b = a; while (b + 1 < n && o.run[b + 1] === o.run[a]) b++;
    const exact = !Number.isNaN(o.vs[a]);
    for (let i = a; i <= b; i++) {
      const i0 = Math.max(a, i - 1), i1 = Math.min(b, i + 1), h = (o.t[i1] - o.t[i0]) / 1000 || 1;
      o.vd[i] = (o.d[i1] - o.d[i0]) / h;
      if (!exact) o.vs[i] = (o.s[i1] - o.s[i0]) / h;
    }
    if (!exact) {   // (no telemetry: the acceleration from the speed, lightly smoothed)
      const tt = o.t.slice(a, b + 1), acc = new Float64Array(b - a + 1);
      for (let i = a; i <= b; i++) { const i0 = Math.max(a, i - 1), i1 = Math.min(b, i + 1), h = (o.t[i1] - o.t[i0]) / 1000 || 1; acc[i - a] = (o.vs[i1] - o.vs[i0]) / h; }
      const sm = gauss(tt, acc, 200);
      for (let i = a; i <= b; i++) o.as[i] = sm[i - a];
    }
    a = b + 1;
  }
}

// F1's positions since 2023 or so are matched to a reference line: all cars sit on it (|d| ≲ 0.3 m at every
// corner). Older or other data has the cars spread across the track. Decided from a sample of on-track points.
function isSnapped(src, frame, world) {
  const c0 = world.center, ds = [];
  for (const c of Object.values(src.tracks.cars)) {
    let hint = null;
    for (let k = 0; k < c.n; k += 13) {
      const pr = frame.project(c.x[k] * DM - c0.x, -(c.y[k] * DM - c0.z), hint); if (!pr) continue; hint = pr.i;
      if (Math.abs(pr.d) < Math.max(pr.sample.L ?? 7, -(pr.sample.R ?? -7))) ds.push(Math.abs(pr.d));
    }
    if (ds.length > 4000) break;
  }
  if (ds.length < 200) return false;
  ds.sort((x, y) => x - y);
  return ds[Math.floor(ds.length * 0.75)] < 0.6;
}

// src: a Replay or LiveSource (tracks: CarTracks, car: telemetry); world: map3d's world.
// Returns { all(t, into, vels), state(num, t, out), update(now), frame, snapped } or null when the lap line isn't there.
//   state: the car's track coordinates at t – { s, d, vs, vd, as, run } (s within its stretch; Hermite between the
//   output samples, so position and speed are continuous) – or null off the track.
export function smoothedTracks(src, world, CarTracks) {
  if (!world?.samples?.length || !src?.tracks?.cars) return null;
  const frame = trackFrame(world);
  let lag = null, snapped = null;
  const build = (fromTime) => {
    if (lag == null) lag = telemetryLag(src);
    if (snapped == null) snapped = isSnapped(src, frame, world);
    const tr = new CarTracks();
    tr.coords = {};
    let runs = 0;
    for (const [num, c] of Object.entries(src.tracks.cars)) {
      if (!c.n) continue;
      let from = 0;
      if (fromTime != null) { while (from < c.n && c.t[from] < fromTime) from++; }
      const out = { t: [], x: [], y: [], z: [], s: [], d: [], run: [], vs: [], as: [], w: [] };
      runs = smoothCar(c, from, frame, world, src.car?.[num], out, lag, snapped, runs);
      const k = out.t.length;
      tr.cars[num] = { t: Float64Array.from(out.t), x: Float32Array.from(out.x), y: Float32Array.from(out.y), z: Float32Array.from(out.z), n: k };
      const o = { t: tr.cars[num].t, s: Float64Array.from(out.s), d: Float32Array.from(out.d), run: Int32Array.from(out.run), vs: Float32Array.from(out.vs), as: Float32Array.from(out.as), w: Float32Array.from(out.w) };
      derive(o);
      tr.coords[num] = o;
    }
    return tr;
  };
  // (hold: live – past the last sample the car stays there for up to 4 s, still, as its drawn position does
  // (CarTracks.at) until the next batch of positions comes in)
  const stateOf = (tr, num, t, out, hold = false) => {
    const o = tr?.coords?.[num]; if (!o) return null;
    const T = o.t, n = T.length;
    if (n >= 2 && hold && t > T[n - 1] && t - T[n - 1] <= 4000 && o.run[n - 1]) {
      out = out || {};
      out.s = o.s[n - 1]; out.d = o.d[n - 1]; out.vs = 0; out.vd = 0; out.as = 0; out.run = o.run[n - 1];
      return out;
    }
    if (n < 2 || t < T[0] || t > T[n - 1]) return null;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
    if (!o.run[lo] || o.run[lo] !== o.run[hi]) return null;
    const h = (T[hi] - T[lo]) / 1000, u = h > 0 ? (t - T[lo]) / 1000 / h : 0, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const d00 = (6 * u2 - 6 * u) / h, d10 = 3 * u2 - 4 * u + 1, d01 = (-6 * u2 + 6 * u) / h, d11 = 3 * u2 - 2 * u;
    out = out || {};
    out.s = h00 * o.s[lo] + h10 * h * o.vs[lo] + h01 * o.s[hi] + h11 * h * o.vs[hi];
    out.d = h00 * o.d[lo] + h10 * h * o.vd[lo] + h01 * o.d[hi] + h11 * h * o.vd[hi];
    out.vs = d00 * o.s[lo] + d10 * o.vs[lo] + d01 * o.s[hi] + d11 * o.vs[hi];
    out.vd = d00 * o.d[lo] + d10 * o.vd[lo] + d01 * o.d[hi] + d11 * o.vd[hi];
    out.as = o.as[lo] + (o.as[hi] - o.as[lo]) * u;
    out.run = o.run[lo];
    // on the racing line (w → 1 away from the ends of a stretch): its offset exactly at s, and its rate
    const w = o.w[lo] + (o.w[hi] - o.w[lo]) * u;
    if (w > 0) {
      const ln = frame.lineAt(out.s), dl = (frame.lineAt(out.s + 0.5) - frame.lineAt(out.s - 0.5)) * out.vs, dw = ((o.w[hi] - o.w[lo]) / h);
      out.vd = out.vd * (1 - w) + dl * w + (ln - out.d) * dw;
      out.d = out.d * (1 - w) + ln * w;
    }
    return out;
  };
  if (!src.isLive) {
    const tr = build(null);
    return { all: (t, into, vels) => tr.all(t, into, vels), state: (num, t, out) => stateOf(tr, num, t, out), update() {}, lag, frame, snapped };
  }
  // live: redo the last 30 s once a second (drawn 0.6 s behind the newest data)
  let tr = null, last = 0;
  return {
    all(t, into, vels) { return (tr || src.tracks).all(t - 600, into, vels); },
    state(num, t, out) { return stateOf(tr, num, t - 600, out, true); },
    update(now) { if (now - last < 1000) return; last = now; const latest = Math.max(0, ...Object.values(src.tracks.cars).map((c) => (c.n ? c.t[c.n - 1] : 0))); tr = build(latest - 30000); },
    frame, get snapped() { return snapped; },
  };
}

// Development: how steady the cars are over [t0, t1] – for every car on the track every 50 ms:
//   lateral: RMS of the across-track position minus its own 2 s average (weaving), metres
//   heading: RMS of (heading − lap line direction) minus its 2 s average (wobble), degrees
//   speed:   RMS of (speed along the track − telemetry speed), km/h
export function steadiness(tracks, src, world, t0, t1, lag = 0) {
  const frame = trackFrame(world), c0 = world.center, res = { lateral: [], heading: [], speed: [] };
  const into = {}, vels = {};
  const series = {};
  for (let t = t0; t <= t1; t += 50) {
    const pos = tracks.all(t, into, vels);
    for (const [num, p] of Object.entries(pos)) {
      const x = p[0] * DM - c0.x, z = -(p[1] * DM - c0.z), pr = frame.project(x, z);
      if (!pr || Math.abs(pr.d) > 15) continue;
      const v = vels[num], vx = v[0] * 100, vz = -v[1] * 100, sp = Math.hypot(vx, vz);
      if (sp < 15) continue;
      const head = Math.atan2(vx, vz) - Math.atan2(pr.sample.tan.x, pr.sample.tan.z), hw = Math.atan2(Math.sin(head), Math.cos(head));
      const tel = src.carAt ? src.carAt(num, t + lag) : null;
      (series[num] || (series[num] = [])).push([t, pr.d, hw, tel ? sp * 3.6 - tel.speed : null]);
    }
  }
  for (const list of Object.values(series)) {
    const t = list.map((r) => r[0]), dS = gauss(t, list.map((r) => r[1]), 700), hS = gauss(t, list.map((r) => r[2]), 700);
    list.forEach((r, i) => { res.lateral.push(r[1] - dS[i]); res.heading.push((r[2] - hS[i]) * 57.3); if (r[3] != null && Math.abs(r[3]) < 80) res.speed.push(r[3]); });
  }
  const rms = (a) => +Math.sqrt(a.reduce((x, y) => x + y * y, 0) / Math.max(1, a.length)).toFixed(3);
  return { lateralM: rms(res.lateral), headingDeg: rms(res.heading), speedKmh: rms(res.speed), samples: res.lateral.length };
}
