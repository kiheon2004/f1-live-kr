// Driving-model track arrays (DESIGN §4: s, kappa, grade at ds = 2 m) for the physics tools and tests:
//   synthTrack(segments)   a synthetic closed track from straights and arcs (unit tests, sensitivity sweeps)
//   trackFromXYZ(points)   a real lap line (metres) → resampled, Gaussian-smoothed, 3-point-circle curvature
// The game's scenario track (track.js / build-scenario.mjs, data helper) has the same fields; these are for the offline
// tools until/unless that builder is used directly.
const TAU = Math.PI * 2;

function gaussClosed(a, sigmaSamples) {
  const n = a.length, out = new Float64Array(n);
  if (!(sigmaSamples > 0.3)) { out.set(a); return out; }
  const h = Math.ceil(3 * sigmaSamples), w = [];
  let sw = 0; for (let k = -h; k <= h; k++) { const x = Math.exp(-0.5 * (k / sigmaSamples) ** 2); w.push(x); sw += x; }
  for (let i = 0; i < n; i++) { let s = 0; for (let k = -h; k <= h; k++) s += w[k + h] * a[(i + k + n * 8) % n]; out[i] = s / sw; }
  return out;
}

// segments: [{ len (m), R (m, signed: + left; 0 or absent = straight), grade (dz/ds, optional) }]
// The closing error of an arbitrary list doesn't matter for the 1-D model (s, κ, grade); x/y are integrated for plots.
export function synthTrack(segments, { ds = 2, sigma = 10 } = {}) {
  const L0 = segments.reduce((a, g) => a + g.len, 0), n = Math.round(L0 / ds), kap = new Float64Array(n), gr = new Float64Array(n);
  let i = 0, acc = 0;
  for (const g of segments) {
    acc += g.len; const end = Math.min(n, Math.round(acc / ds));
    for (; i < end; i++) { kap[i] = g.R ? 1 / g.R : 0; gr[i] = g.grade || 0; }
  }
  return finish(gaussClosed(kap, sigma / ds), gaussClosed(gr, sigma / ds), ds);
}

function finish(kappa, grade, ds) {
  const n = kappa.length, s = new Float64Array(n), x = new Float64Array(n), y = new Float64Array(n), hdg = new Float64Array(n);
  let h = 0, px = 0, py = 0;
  for (let i = 0; i < n; i++) { s[i] = i * ds; x[i] = px; y[i] = py; hdg[i] = h; h += kappa[i] * ds; px += Math.cos(h) * ds; py += Math.sin(h) * ds; }
  return { n, ds, L: n * ds, s, kappa, grade, x, y, hdg };
}

// points: [[x, y, z], …] metres, one lap in driving order (closed: the last point near the first).
// sigma: Gaussian smoothing (m) for the position error of the feed (1–2 m) – DESIGN §4 says 6–10 m.
export function trackFromXYZ(points, { ds = 2, sigma = 8, zSigma = 20 } = {}) {
  // cumulative length, then resample at ds
  const m = points.length, cum = [0];
  for (let i = 1; i <= m; i++) { const a = points[i - 1], b = points[i % m]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = cum[m], n = Math.round(L / ds), d = L / n, X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = i * d; while (k < m - 1 && cum[k + 1] < t) k++;
    const a = points[k], b = points[(k + 1) % m], f = (t - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]);
    X[i] = a[0] + (b[0] - a[0]) * f; Y[i] = a[1] + (b[1] - a[1]) * f; Z[i] = (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * f;
  }
  const xs = gaussClosed(X, sigma / d), ys = gaussClosed(Y, sigma / d), zs = gaussClosed(Z, zSigma / d);
  const kappa = new Float64Array(n), grade = new Float64Array(n), hdg = new Float64Array(n), s = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, c = (i + 1) % n;
    // signed curvature of the circle through three points: 2·cross / (|ab|·|bc|·|ca|)
    const abx = xs[i] - xs[a], aby = ys[i] - ys[a], bcx = xs[c] - xs[i], bcy = ys[c] - ys[i], cax = xs[a] - xs[c], cay = ys[a] - ys[c];
    const cr = abx * bcy - aby * bcx, den = Math.hypot(abx, aby) * Math.hypot(bcx, bcy) * Math.hypot(cax, cay);
    kappa[i] = den > 1e-9 ? 2 * cr / den : 0;
    grade[i] = (zs[c] - zs[a]) / (2 * d);
    hdg[i] = Math.atan2(ys[c] - ys[a], xs[c] - xs[a]);
    s[i] = i * d;
  }
  return { n, ds: d, L, s, kappa, grade, x: xs, y: ys, z: zs, hdg };
}

// A generic, real-shaped (not real-circuit) 5.0 km test layout: long straight, hairpin, fast sweepers, chicane, mid
// corners, a 2 % climb and drop. Used by tests that need "all corner types" without the session cache.
export const GENERIC_SEGMENTS = [
  { len: 900 }, { len: 45, R: 18 }, { len: 300 }, { len: 160, R: 120 }, { len: 200 }, { len: 260, R: -250, grade: 0.02 },
  { len: 350, grade: 0.02 }, { len: 70, R: 45 }, { len: 50, R: -45 }, { len: 500, grade: -0.0244 }, { len: 120, R: -70 },
  { len: 250 }, { len: 220, R: 400 }, { len: 600 }, { len: 90, R: -30 }, { len: 180 }, { len: 100, R: 60 }, { len: 205 },
];
export const genericTrack = (opts) => synthTrack(GENERIC_SEGMENTS, opts);
export { TAU };
