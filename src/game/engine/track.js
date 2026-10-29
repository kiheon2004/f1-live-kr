// The engine's track model (DESIGN §4, §4.1): a scenario's track (src/game/data/scenario.js) as typed arrays sampled
// every ds ≈ 2 m from the timing line (s = 0), with lookups by s (wrapping), interpolation, distances, zone queries and
// the pit lane path. Pure: no DOM, no clocks, no randomness; nothing here allocates per call except the
// convenience posAt(…, out) without an out object.
//
// Conventions (from the scenario builder, src/game/tools/trackgeo.mjs): x, y, z metres in F1's Position frame; hdg =
// atan2(dy, dx); kappa = dhdg/ds (+ = turning left); lateral offsets d (line, the cars' own) are + to the left of travel;
// wL / wR are distances (≥ 0) from the lap line to the left / right edge.
import { ZONE } from "../data/scenario.js";
export { ZONE };

const COLS = ["x", "y", "z", "hdg", "kappa", "grade", "wL", "wR", "line"];
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function loadTrack(tr) {
  if (!tr || !tr.columns) throw new Error("loadTrack: no track columns");
  const n = tr.n, L = tr.L, ds = tr.ds;
  if (!(n > 2) || !(L > 0) || !(ds > 0) || Math.abs(n * ds - L) > 1e-3 * L) throw new Error(`loadTrack: inconsistent n ${n}, ds ${ds}, L ${L}`);
  const T = { n, L, ds, s: new Float64Array(n), zone: new Uint32Array(n) };
  for (let i = 0; i < n; i++) T.s[i] = i * ds;
  for (const k of COLS) {
    const a = tr.columns[k]; if (!a || a.length !== n) throw new Error(`loadTrack: column ${k} missing or wrong length`);
    T[k] = Float64Array.from(a);
  }
  if (tr.columns.zone) T.zone.set(tr.columns.zone);
  // (optional: the racing line's own curvature – an estimate, see the scenario's meta.estimates; null when absent)
  T.kappaLine = tr.columns.kappaLine && tr.columns.kappaLine.length === n ? Float64Array.from(tr.columns.kappaLine) : null;
  const inv = 1 / ds;

  // [0, L)
  T.wrap = (s) => { s %= L; return s < 0 ? s + L : s; };
  // sample index at or before s (wrapping)
  T.idx = (s) => { const i = Math.floor(T.wrap(s) * inv); return i >= n ? n - 1 : i; };
  // linear interpolation of a per-sample array at s (the last sample interpolates towards the first: the lap is closed)
  T.at = (arr, s) => { const u = T.wrap(s) * inv; let i = Math.floor(u); if (i >= n) i = n - 1; const f = u - i, j = i + 1 === n ? 0 : i + 1; return arr[i] + (arr[j] - arr[i]) * f; };
  // heading at s (interpolated through the shorter angle)
  T.hdgAt = (s) => { const u = T.wrap(s) * inv; let i = Math.floor(u); if (i >= n) i = n - 1; const j = i + 1 === n ? 0 : i + 1; return wrapA(T.hdg[i] + wrapA(T.hdg[j] - T.hdg[i]) * (u - i)); };
  // forward distance from a to b (0 ≤ … < L) and the shorter signed one (b ahead of a: +)
  T.ahead = (a, b) => T.wrap(b - a);
  T.delta = (a, b) => { const d = T.wrap(b - a); return d > L / 2 ? d - L : d; };
  // zone bits at s (the sample's), and one bit
  T.zoneAt = (s) => T.zone[T.idx(s)];
  T.has = (s, bit) => (T.zone[T.idx(s)] & bit) !== 0;
  // which sector s is in: 1, 2, 3
  T.sectorOf = (s) => { s = T.wrap(s); return s < T.zones.sectors[0] ? 1 : s < T.zones.sectors[1] ? 2 : 3; };
  // the world position of (s, d): { x, y, z, hdg } (into `out` when given)
  T.posAt = (s, d = 0, out = {}) => {
    const h = T.hdgAt(s); out.x = T.at(T.x, s) - Math.sin(h) * d; out.y = T.at(T.y, s) + Math.cos(h) * d; out.z = T.at(T.z, s); out.hdg = h; return out;
  };
  // the nearest sample to a point (uniform grid, built on first use) → index, or −1 beyond `reach` m
  let grid = null; const CELL = 25;
  const key = (x, y) => Math.floor(x / CELL) * 1000003 + Math.floor(y / CELL);
  T.nearest = (px, py, reach = 60) => {
    if (!grid) { grid = new Map(); for (let i = 0; i < n; i++) { const k = key(T.x[i], T.y[i]); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i); } }
    const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL), R = Math.ceil(reach / CELL);
    let best = -1, bd = reach * reach;
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) { const a = grid.get((cx + i) * 1000003 + cy + j); if (a) for (const k of a) { const d = (T.x[k] - px) ** 2 + (T.y[k] - py) ** 2; if (d < bd) { bd = d; best = k; } } }
    return best;
  };
  // a point's (s, d) on the lap: { i, s, d } | null
  T.project = (px, py, reach = 60) => {
    const i = T.nearest(px, py, reach); if (i < 0) return null;
    const c = Math.cos(T.hdg[i]), sn = Math.sin(T.hdg[i]), dx = px - T.x[i], dy = py - T.y[i];
    return { i, s: T.wrap(i * ds + dx * c + dy * sn), d: -dx * sn + dy * c };
  };

  const z = tr.zones || {};
  T.zones = {
    drs: (z.drs || []).map((q) => ({ detect: q.detect ?? null, start: q.start, end: q.end })),
    straight: (z.straight || []).map((q) => ({ start: q.start, end: q.end })),
    sectors: (z.sectors || [L / 3, (2 * L) / 3]).slice(0, 2),
    cover: (z.cover || []).map((c) => [c[0], c[1]]),
    brake: (z.brake || []).map((c) => [c[0], c[1]]),
  };
  // is s inside a span [a, b) (b < a: across s = 0)?
  T.inSpan = (s, a, b) => { s = T.wrap(s); return a <= b ? s >= a && s < b : s >= a || s < b; };
  // the zone of a list ({start, end}) that s is in, else null
  T.zoneOf = (list, s) => { for (const q of list) if (T.inSpan(s, q.start, q.end)) return q; return null; };
  // the next zone start ahead of s in a list: { zone, dist } | null
  T.nextZone = (list, s) => { let best = null, bd = Infinity; for (const q of list) { const d = T.ahead(s, q.start); if (d < bd) { bd = d; best = q; } } return best ? { zone: best, dist: bd } : null; };

  T.pit = tr.pit ? loadPit(tr.pit, T) : null;
  return T;
}

function loadPit(p, T) {
  const c = p.columns, n = p.n;
  const P = { n, L: p.L, ds: p.ds, u: Float64Array.from(c.u), x: Float64Array.from(c.x), y: Float64Array.from(c.y), z: Float64Array.from(c.z), hdg: Float64Array.from(c.hdg), sLap: Float64Array.from(c.sLap),
    sIn: p.sIn, sOut: p.sOut, limStart: p.limStart, limEnd: p.limEnd, speedLimit: p.speedLimit ?? null, boxes: { ...(p.boxes || {}) } };
  // forward distance along the lap from the branch, per pit sample (never decreasing): the lap ↔ pit mapping
  const fwd = new Float64Array(n);
  for (let i = 0; i < n; i++) fwd[i] = T.ahead(P.sIn, P.sLap[i]);
  for (let i = 1; i < n; i++) if (fwd[i] < fwd[i - 1]) fwd[i] = fwd[i - 1];
  P.span = T.ahead(P.sIn, P.sOut);
  const clampU = (u) => (u < 0 ? 0 : u > P.L ? P.L : u);
  P.at = (arr, u) => { u = clampU(u) / P.ds; let i = Math.floor(u); if (i >= n - 1) return arr[n - 1]; const f = u - i; return arr[i] + (arr[i + 1] - arr[i]) * f; };
  // lap s → pit path distance u, only on the stretch the pit lane runs beside (branch … merge); null elsewhere
  P.lapToPit = (s) => {
    const f = T.ahead(P.sIn, s); if (f > fwd[n - 1]) return null;
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fwd[m] <= f) lo = m; else hi = m; }
    const df = fwd[hi] - fwd[lo]; return P.u[lo] + (df > 0 ? (f - fwd[lo]) / df : 0) * (P.u[hi] - P.u[lo]);
  };
  // pit path distance u → the lap s it runs beside (approximate: for gaps and the screen)
  P.pitToLap = (u) => T.wrap(P.sIn + P.at(fwd, u));
  P.posAt = (u, out = {}) => { out.x = P.at(P.x, u); out.y = P.at(P.y, u); out.z = P.at(P.z, u); const i = Math.min(n - 1, Math.max(0, Math.round(clampU(u) / P.ds))); out.hdg = P.hdg[i]; return out; };
  P.inLimiter = (u) => u >= P.limStart && u <= P.limEnd;
  return P;
}
