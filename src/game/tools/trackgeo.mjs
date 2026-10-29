// Pure geometry for the scenario builder (node tools only – the engine reads the finished arrays through engine/track.js).
// Coordinates: F1's Position frame converted to metres (x, y in the plane, z up; the feed's decimetres × 0.1), not
// re-centred – the 3D view's own toWorld maps them the same way. Heading hdg = atan2(dy, dx) (rad, counter-clockwise from
// +x); left of travel = (−sin hdg, cos hdg); kappa = d(hdg)/ds (1/m, + = turning left), so lateral offsets d are + left.

export const TWO_PI = Math.PI * 2;
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const wrapS = (s, L) => ((s % L) + L) % L;
export const median = (a) => { const b = Float64Array.from(a).sort(), n = b.length; return n ? (n % 2 ? b[n >> 1] : (b[n / 2 - 1] + b[n / 2]) / 2) : NaN; };
export const quantile = (a, q) => { const b = Float64Array.from(a).sort(), n = b.length; if (!n) return NaN; const f = Math.max(0, Math.min(n - 1, q * (n - 1))), i = Math.floor(f); return b[i] + (b[Math.min(n - 1, i + 1)] - b[i]) * (f - i); };

// cumulative length of a closed polyline: cum[0] = 0 … cum[n] = L (the closing segment included)
export function closedCum(X, Y) {
  const n = X.length, cum = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) { const a = i - 1, b = i % n; cum[i] = cum[i - 1] + Math.hypot(X[b] - X[a], Y[b] - Y[a]); }
  return cum;
}

// A closed polyline resampled to n = round(L / ds) evenly spaced points (linear along the polyline), the first at s = 0
// (the polyline's first point). Returns { x, y, z, n, L, ds } with ds = L / n exactly (so s_i = i·ds and the lap closes).
export function resampleClosed(X, Y, Z, ds = 2) {
  const n0 = X.length, cum = closedCum(X, Y), L = cum[n0], n = Math.max(8, Math.round(L / ds)), step = L / n;
  const x = new Float64Array(n), y = new Float64Array(n), z = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * step;
    while (j < n0 - 1 && cum[j + 1] <= s) j++;
    const a = j, b = (j + 1) % n0, l = cum[j + 1] - cum[j], f = l > 0 ? (s - cum[j]) / l : 0;
    x[i] = X[a] + (X[b] - X[a]) * f; y[i] = Y[a] + (Y[b] - Y[a]) * f; z[i] = Z ? Z[a] + (Z[b] - Z[a]) * f : 0;
  }
  return { x, y, z, n, L, ds: step };
}

// Gaussian smoothing of a cyclic series, σ in samples (kernel cut at 3σ). σ ≤ 0: a copy.
export function smoothClosed(arr, sigma) {
  const n = arr.length, out = new Float64Array(n);
  if (!(sigma > 0)) { out.set(arr); return out; }
  const K = Math.max(1, Math.ceil(sigma * 3)), w = new Float64Array(2 * K + 1);
  let ws = 0; for (let k = -K; k <= K; k++) { w[k + K] = Math.exp(-0.5 * (k / sigma) ** 2); ws += w[k + K]; }
  for (let i = 0; i < n; i++) { let s = 0; for (let k = -K; k <= K; k++) s += arr[(((i + k) % n) + n) % n] * w[k + K]; out[i] = s / ws; }
  return out;
}

// headings (central differences) of a closed, evenly spaced curve
export function headings(x, y) {
  const n = x.length, h = new Float64Array(n);
  for (let i = 0; i < n; i++) { const a = (i - 1 + n) % n, b = (i + 1) % n; h[i] = Math.atan2(y[b] - y[a], x[b] - x[a]); }
  return h;
}
// curvature d(hdg)/ds from headings at spacing ds, then Gaussian σ (m). The heading change between neighbours is
// wrapped, so the lap's one full turn (±2π) never shows as a spike.
export function curvature(hdg, ds, sigmaM = 0) {
  const n = hdg.length, k = new Float64Array(n);
  for (let i = 0; i < n; i++) k[i] = wrapAngle(hdg[(i + 1) % n] - hdg[(i - 1 + n) % n]) / (2 * ds);
  return smoothClosed(k, sigmaM / ds);
}
// the total turning over a lap (rad): ±2π for a simple closed lap (+ counter-clockwise)
export function totalTurn(hdg) { let a = 0; for (let i = 0; i < hdg.length; i++) a += wrapAngle(hdg[(i + 1) % hdg.length] - hdg[i]); return a; }
// gradient dz/ds of a closed series
export function gradient(z, ds) { const n = z.length, g = new Float64Array(n); for (let i = 0; i < n; i++) g[i] = (z[(i + 1) % n] - z[(i - 1 + n) % n]) / (2 * ds); return g; }
// rotate cyclic arrays so that index k becomes 0
export function rotate(arr, k) { const n = arr.length, out = new arr.constructor(n); k = ((k % n) + n) % n; for (let i = 0; i < n; i++) out[i] = arr[(i + k) % n]; return out; }

// Projection onto an evenly spaced closed station line (x, y, hdg, ds): a uniform grid for the first search, then a local
// window around a hint (the station found last time for the same car – keeps a car on its own stretch where the lap
// crosses itself, as at Suzuka, or runs beside itself). → { i (nearest station), s (m along the lap), d (lateral, + left) }
export class StationIndex {
  constructor(x, y, hdg, ds, cell = 25) {
    this.x = x; this.y = y; this.hdg = hdg; this.ds = ds; this.n = x.length; this.L = this.n * ds; this.cell = cell; this.grid = new Map();
    for (let i = 0; i < this.n; i++) { const k = this.key(x[i], y[i]); let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(i); }
  }
  key(x, y) { return Math.floor(x / this.cell) * 1000003 + Math.floor(y / this.cell); }
  // the nearest station within `reach` m (grid search), or −1
  nearestAll(px, py, reach = 60) {
    const cx = Math.floor(px / this.cell), cy = Math.floor(py / this.cell), R = Math.ceil(reach / this.cell);
    let best = -1, bd = reach * reach;
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (const k of this.grid.get((cx + i) * 1000003 + cy + j) || []) {
      const d = (this.x[k] - px) ** 2 + (this.y[k] - py) ** 2; if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  // nearest within ±win stations of a hint (cyclic)
  nearestNear(px, py, hint, win = 40) {
    let best = -1, bd = Infinity;
    for (let o = -win; o <= win; o++) { const k = (((hint + o) % this.n) + this.n) % this.n, d = (this.x[k] - px) ** 2 + (this.y[k] - py) ** 2; if (d < bd) { bd = d; best = k; } }
    return best;
  }
  // full projection: along-track s (m, refined between stations) and lateral d (+ left of travel)
  project(px, py, hint = -1, reach = 60) {
    let i = hint >= 0 ? this.nearestNear(px, py, hint) : -1;
    // (the window's edge: the car moved further than the window since the hint – search everything)
    // (or it is far from every station in the window: off this stretch altogether)
    if (i >= 0 && hint >= 0) { const o = Math.abs(((i - hint + this.n / 2) % this.n + this.n) % this.n - this.n / 2); if (o >= 39 || (this.x[i] - px) ** 2 + (this.y[i] - py) ** 2 > reach * reach) i = -1; }
    if (i < 0) i = this.nearestAll(px, py, reach);
    if (i < 0) return null;
    const c = Math.cos(this.hdg[i]), s = Math.sin(this.hdg[i]), dx = px - this.x[i], dy = py - this.y[i];
    const along = dx * c + dy * s, d = -dx * s + dy * c;
    return { i, s: wrapS(i * this.ds + along, this.L), d, dist: Math.hypot(dx, dy) };
  }
}

// Robust line fit y = a + b·x over binned medians (bins of width `bin` in x, at least `minN` points each), weighted by
// the bin's count. → { a, b, bins: [[x, y, n]], n } | null. Used for "where is the timing line": a message reporting a lap
// (or a sector) arrives δ seconds after the car crossed the line, so the car's place then is s_line + v·δ – the place
// at v = 0 is the line itself (δ the feed's delay, assumed the same for all cars; the fit finds both).
export function binnedFit(xs, ys, bin, minN = 5) {
  const groups = new Map();
  for (let i = 0; i < xs.length; i++) { if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) continue; const k = Math.floor(xs[i] / bin); let g = groups.get(k); if (!g) groups.set(k, (g = { x: [], y: [] })); g.x.push(xs[i]); g.y.push(ys[i]); }
  const bins = [...groups.values()].filter((g) => g.x.length >= minN).map((g) => [median(g.x), median(g.y), g.x.length]);
  if (bins.length < 2) return null;
  let W = 0, mx = 0, my = 0; for (const [x, y, n] of bins) { W += n; mx += x * n; my += y * n; } mx /= W; my /= W;
  let sxx = 0, sxy = 0; for (const [x, y, n] of bins) { sxx += n * (x - mx) ** 2; sxy += n * (x - mx) * (y - my); }
  if (sxx <= 0) return null;
  const b = sxy / sxx, a = my - b * mx;
  let res = 0; for (const [x, y, n] of bins) res += n * (y - a - b * x) ** 2;
  return { a, b, bins, n: W, rms: Math.sqrt(res / W), span: [Math.min(...bins.map((q) => q[0])), Math.max(...bins.map((q) => q[0]))] };
}

// Runs of set flags along a cyclic per-station mask → [[a, b]] in metres (b exclusive; b < a wraps over s = 0)
export function maskRuns(mask, ds) {
  const n = mask.length, out = [];
  if (mask.every((v) => v)) return [[0, n * ds]];
  const i0 = mask.findIndex((v) => !v); if (i0 < 0) return out;
  for (let k = 1; k <= n; k++) {
    const i = (i0 + k) % n; if (!mask[i] || mask[(i - 1 + n) % n]) continue;
    let j = i; while (mask[(j + 1) % n] && (j + 1) % n !== i) j++;
    out.push([i * ds, ((j + 1) % n) * ds]);
  }
  return out.sort((p, q) => p[0] - q[0]);
}
// is s inside the span [a, b) (b < a: across s = 0)?
export const inSpan = (s, a, b) => (a <= b ? s >= a && s < b : s >= a || s < b);

// A racing line estimate from geometry alone: the minimum-curvature path between the edges (a classic first
// approximation to the fastest line – it ignores where a car brakes and accelerates, so it is an estimate, labelled so).
// Offsets d_i (+ left, along the lap line's normal) minimise ∫κ² ds (discrete: Menger curvature through neighbours) with
// lo_i ≤ d_i ≤ hi_i, by coordinate-wise parabolic steps, coarse to fine (steps of `levels` m) so the long bends converge too.
// x, y, hdg: the lap line every ds m (closed); lo, hi: per-sample bounds (m). → Float64Array d (per sample)
export function minCurvatureLine(x, y, hdg, ds, lo, hi, { levels = [32, 16, 8, 4], sweeps = 400, omega = 1 } = {}) {
  const n = x.length;
  let prev = null, prevStep = 0;
  const sampleAt = (arr, f) => { const N = arr.length, i = ((Math.floor(f) % N) + N) % N, j = (i + 1) % N, t = f - Math.floor(f); return arr[i] + (arr[j] - arr[i]) * t; };
  let d = null;
  for (const lv of levels) {
    const step = Math.max(1, Math.round(lv / ds)), m = Math.floor(n / step);
    if (m < 12) continue;
    const cx = new Float64Array(m), cy = new Float64Array(m), nx = new Float64Array(m), ny = new Float64Array(m), l = new Float64Array(m), h = new Float64Array(m), dd = new Float64Array(m);
    for (let k = 0; k < m; k++) {
      const f = (k * n) / m;   // (fractional sample index: the coarse points spread evenly round the whole lap)
      cx[k] = sampleAt(x, f); cy[k] = sampleAt(y, f);
      const i = Math.round(f) % n; nx[k] = -Math.sin(hdg[i]); ny[k] = Math.cos(hdg[i]);
      // a coarse point's bounds: the tightest of the samples it stands for
      let a = -Infinity, b = Infinity; for (let o = -Math.floor(step / 2); o <= Math.floor(step / 2); o++) { const j = ((i + o) % n + n) % n; a = Math.max(a, lo[j]); b = Math.min(b, hi[j]); }
      l[k] = a; h[k] = Math.max(a, b);
      dd[k] = prev ? Math.max(l[k], Math.min(h[k], sampleAt(prev, (f / prevStep)))) : 0;
    }
    const px = new Float64Array(m), py = new Float64Array(m);
    for (let k = 0; k < m; k++) { px[k] = cx[k] + nx[k] * dd[k]; py[k] = cy[k] + ny[k] * dd[k]; }
    // the cost near point k: Σ κ_j² ℓ_j over j = k−1 … k+1 (Menger curvature through three neighbours, ℓ_j half the two
    // chords) – ∫κ² ds, which on a constant bend prefers the larger radius (a plain Σ|second difference|² would also
    // reward the shorter, inner path)
    const kap = (j) => { const a = (j - 1 + m) % m, b = (j + 1) % m, ux = px[j] - px[a], uy = py[j] - py[a], vx = px[b] - px[j], vy = py[b] - py[j], wx = px[b] - px[a], wy = py[b] - py[a];
      const la = Math.hypot(ux, uy), lb = Math.hypot(vx, vy), lc = Math.hypot(wx, wy), cr = ux * vy - uy * vx; return { k: la * lb * lc > 0 ? (2 * cr) / (la * lb * lc) : 0, l: (la + lb) / 2 }; };
    const cost = (k) => { let e = 0; for (const j of [(k - 1 + m) % m, k, (k + 1) % m]) { const q = kap(j); e += q.k * q.k * q.l; } return e; };
    const set = (k, v) => { dd[k] = v; px[k] = cx[k] + nx[k] * v; py[k] = cy[k] + ny[k] * v; };
    const del = Math.max(0.02, lv * 0.01);
    for (let it = 0; it < sweeps; it++) {
      let moved = 0;
      for (let k = 0; k < m; k++) {
        // one parabolic step of the coordinate's own cost, clamped to the bounds
        const d0 = dd[k], e0 = cost(k); set(k, d0 + del); const ep = cost(k); set(k, d0 - del); const em = cost(k);
        const c = (ep + em - 2 * e0) / (del * del);
        let step = c > 0 ? -(ep - em) / (2 * del * c) : ep < em ? del : -del;
        step = Math.max(-4 * del, Math.min(4 * del, step)) * omega;
        const nv = Math.max(l[k], Math.min(h[k], d0 + step));
        set(k, nv);
        if (cost(k) > e0) set(k, d0); else moved = Math.max(moved, Math.abs(nv - d0));
      }
      if (moved < 1e-4) break;
    }
    prev = dd; prevStep = n / m;
    d = { dd, m };
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(lo[i], Math.min(hi[i], sampleAt(d.dd, (i * d.m) / n)));
  return out;
}
