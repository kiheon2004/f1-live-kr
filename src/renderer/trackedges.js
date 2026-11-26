// A circuit's track from surveyed lines. The track's edges are otherwise measured from where the field drives, with the
// circuit's usual width as their floor (map3d.js measureWidth) – and the feed puts every car on one reference line, which
// is not the track's middle (2–3 m off it as a rule, 4–8 m across within one straight: Zandvoort, Monza), so the ribbon
// drawn round it stands metres from the real road and has the wrong width. Where both edges of the real track have been
// read off imagery (the chat-side session's survey: the outer side of the white line each side, section by section), the
// edges are those lines instead – whatever way the lap line wanders between them, or outside them.
//
// The data (trackdata.js TRACKS[venue key], written by tools/track.js – never by hand) is in the FEED's own metres, the
// frame the cars' positions come in: the track is built before the map's fit arrives (and with the map switched off there
// is none), so latitude and longitude are turned into feed metres once, when the data is built, with the circuit's stored
// fit. That fit and the edges belong to one reference line: a session whose lap does not lie on the stored line (the feed's
// frame moved – Suzuka between 2023 and 2025, by about 21 m) gets neither, and is built the old way.
//
// TRACKS[key]: { on, yr: [from, to | null], fit: { centre: [lat, lon], c, s, tx, ty }, ref: [[X, Y] dm …],
//                edges: { left: [[X, Y] m …], right: […], open? }, low: [[from, to] …], marks, src }
//   left[i] and right[i] face each other; both run the way the cars go, left on the cars' left. `open`: a stretch, not
//   the whole lap (its ends are not joined). `low`: sections whose place is not sure (trees, shadow, a bridge) – the
//   measured edges stay there.
import { TRACKS } from "./trackdata.js";
export { TRACKS };

const smooth = (k) => k * k * (3 - 2 * k);

// The circuit's surveyed track for a season, or null (none, switched off, or not that season's layout).
export function trackFor(key, year = null, tracks = TRACKS) {
  const T = tracks?.[key];
  if (!T || !T.on || !T.edges?.left?.length || !T.edges?.right?.length) return null;
  if (year && T.yr && (year < (T.yr[0] ?? 0) || year > (T.yr[1] ?? 9999))) return null;
  return T;
}

// Does this session's lap lie on the stored reference line – is the feed's frame the one the data was made in?
// lap: [[x, y, …] …] feed decimetres (one car's lap); ref: [[X, Y] …] feed decimetres, a closed line a few metres apart.
// The same line a season later lies within 0.1 m (median) and 0.4 m (nine points in ten) of it; a frame moved by 3 m
// shows as about 2 m (median). → { ok, p50, p90, n } (metres).
export function lapOnRef(lap, ref, { p50 = 1, p90 = 2.5 } = {}) {
  if (!Array.isArray(lap) || !Array.isArray(ref) || lap.length < 30 || ref.length < 10) return { ok: false, p50: null, p90: null, n: 0 };
  const n = ref.length, d = [];
  for (const p of lap) {
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const a = ref[i], b = ref[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2)), qx = a[0] + ex * t - p[0], qy = a[1] + ey * t - p[1], q = qx * qx + qy * qy;
      if (q < best) best = q;
    }
    d.push(Math.sqrt(best) / 10);
  }
  d.sort((x, y) => x - y);
  const at = (f) => d[Math.min(d.length - 1, Math.floor(f * (d.length - 1)))], m = at(0.5), h = at(0.9);
  return { ok: m <= p50 && h <= p90, p50: +m.toFixed(2), p90: +h.toFixed(2), n: d.length };
}

// Where the line through a sample along its normal first meets a surveyed line: the offset along the normal (metres,
// signed) and the piece it meets, or null. Only pieces running the way the cars go there (within 60°): another part of
// the track passing near – the other leg of a hairpin – runs the other way or across.
function cast(s, P, closed, reach) {
  const px = s.p.x, pz = s.p.z, nx = s.nor.x, nz = s.nor.z, tx = nz, tz = -nx, m = closed ? P.length : P.length - 1;
  let best = null;
  for (let k = 0; k < m; k++) {
    const a = P[k], b = P[(k + 1) % P.length], ex = b[0] - a[0], ez = b[1] - a[1], wx = a[0] - px, wz = a[1] - pz;
    if (Math.abs(wx) > reach + Math.abs(ex) || Math.abs(wz) > reach + Math.abs(ez)) continue;
    const den = nx * ez - nz * ex; if (Math.abs(den) < 1e-9) continue;
    const t = (wx * nz - wz * nx) / den; if (t < -1e-6 || t > 1 + 1e-6) continue;
    const d = (wx * ez - wz * ex) / den; if (Math.abs(d) > reach) continue;
    if (ex * tx + ez * tz < 0.5 * Math.hypot(ex, ez)) continue;
    if (!best || Math.abs(d) < Math.abs(best.d)) best = { d, k, t };
  }
  return best;
}

// Each sample's offsets to the surveyed lines along its normal: dP to the right edge (the normal's side), dM to the left
// one, raw 1 where both were met a track's width apart and neither piece is marked low; missed: samples that met only one
// line or two that are no track. Or null (no lines). (applyTrackEdges uses it; tools/track.js fits a circuit with it.)
export function edgeOffsets(samples, T, toScene, reach = 30) {
  const E = T?.edges; if (!E?.left || !E?.right || !samples?.length) return null;
  const n = Math.min(E.left.length, E.right.length); if (n < 2) return null;
  const Lp = E.left.slice(0, n).map(toScene), Rp = E.right.slice(0, n).map(toScene), closed = !E.open && n > 2;
  const low = new Uint8Array(n);
  for (const r of T.low || []) for (let i = Math.max(0, r[0]); i <= Math.min(n - 1, r[1]); i++) low[i] = 1;
  const isLow = (k) => low[k] || low[(k + 1) % n];
  const N = samples.length, dP = new Float64Array(N), dM = new Float64Array(N), raw = new Uint8Array(N);
  // (where along each surveyed line a sample meets it: the section's number and how far on to the next – for `broken`)
  const kP = new Float64Array(N).fill(NaN), kM = new Float64Array(N).fill(NaN);
  let missed = 0;
  for (let i = 0; i < N; i++) {
    const s = samples[i], a = cast(s, Rp, closed, reach), b = cast(s, Lp, closed, reach);
    if (!a && !b) continue;
    if (!a || !b || !(a.d - b.d > 3) || a.d - b.d > 45) { missed++; continue; }
    if (isLow(a.k) || isLow(b.k)) continue;
    dP[i] = a.d; dM[i] = b.d; raw[i] = 1; kP[i] = a.k + Math.max(0, Math.min(1, a.t)); kM[i] = b.k + Math.max(0, Math.min(1, b.t));
  }
  return { dP, dM, raw, missed, kP, kM };
}

// samples: [{ p: { x, z }, nor: { x, z }, L, R, M? }] (scene metres; nor to the cars' right; L the edge on the normal's
// side, R the other, both measured from the lap line along the normal – map3d.js); T: a TRACKS entry; toScene([X, Y]
// feed metres) → [x, z]. Sets L and R to the surveyed edges where both were met – eased from the measured ones over
// `ease` metres at the ends of a surveyed stretch –, keeps M between them, and sets s.sv (0 … 1: how far the sample's
// edges are the surveyed ones – the white line and the kerbs are placed by it).
// → { changed, full, missed, outside, folds, width: [min, max] } – missed: samples by the surveyed lines with no usable
// crossing; outside: samples whose lap line lies outside the surveyed track; folds: places where an edge runs backwards
// (its offset greater than the lap line's radius there).
export function applyTrackEdges(samples, T, toScene, { reach = 30, ease = 25 } = {}) {
  const none = { changed: 0, full: 0, missed: 0, outside: 0, folds: 0, width: null };
  const O = edgeOffsets(samples, T, toScene, reach); if (!O) return none;
  const N = samples.length, { dP, dM, raw, missed, kP, kM } = O;
  // how far each surveyed sample is from the nearest one that is not (in samples, round the lap)
  const dist = new Float64Array(N).fill(Infinity);
  let any0 = false;
  for (let i = 0; i < N; i++) if (!raw[i]) { dist[i] = 0; any0 = true; }
  if (any0) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < N; i++) dist[i] = Math.min(dist[i], dist[(i - 1 + N) % N] + 1);
      for (let i = N - 1; i >= 0; i--) dist[i] = Math.min(dist[i], dist[(i + 1) % N] + 1);
    }
  }
  const step = N > 1 ? Math.hypot(samples[1].p.x - samples[0].p.x, samples[1].p.z - samples[0].p.z) || 2 : 2;
  let changed = 0, full = 0, outside = 0, wMin = Infinity, wMax = -Infinity;
  for (let i = 0; i < N; i++) {
    const s = samples[i];
    if (!raw[i]) { if (s.sv) s.sv = 0; continue; }
    const k = any0 ? smooth(Math.min(1, (dist[i] * step) / Math.max(1, ease))) : 1;
    s.L += (dP[i] - s.L) * k; s.R += (dM[i] - s.R) * k; s.sv = k;
    if (Number.isFinite(s.M)) s.M = Math.max(Math.min(s.R + 2, (s.L + s.R) / 2), Math.min(Math.max(s.L - 2, (s.L + s.R) / 2), s.M));
    changed++;
    if (k === 1) { full++; if (s.L < 0 || s.R > 0) outside++; wMin = Math.min(wMin, s.L - s.R); wMax = Math.max(wMax, s.L - s.R); }
  }
  // an edge running backwards between two samples
  let folds = 0;
  for (let i = 0; i < N; i++) {
    const a = samples[i], b = samples[(i + 1) % N]; if (!a.sv || !b.sv) continue;
    const tx = a.nor.z, tz = -a.nor.x;
    for (const key of ["L", "R"]) {
      const ex = b.p.x + b.nor.x * b[key] - (a.p.x + a.nor.x * a[key]), ez = b.p.z + b.nor.z * b[key] - (a.p.z + a.nor.z * a[key]);
      if (ex * tx + ez * tz < 0) folds++;
    }
  }
  // (stretches where the real edge line is broken – a pit entry's mouth: T.broken = { right | left: [[from section, to
  // section, painted m, bare m] …] } – per side a mask of the samples whose edge lies there: 1 + the stretch's number)
  let broken = null;
  for (const [key, K] of [["right", kP], ["left", kM]]) {
    const R = T.broken?.[key]; if (!R?.length) continue;
    const mask = new Uint8Array(N); let any = false;
    for (let i = 0; i < N; i++) { if (!(samples[i].sv >= 1) || !Number.isFinite(K[i])) continue; const j = R.findIndex((r) => K[i] >= r[0] && K[i] <= r[1]); if (j >= 0) { mask[i] = j + 1; any = true; } }
    if (any) (broken ||= {})[key] = { mask, ranges: R };
  }

  return { changed, full, missed, outside, folds, ...(broken ? { broken } : {}), width: full ? [+wMin.toFixed(2), +wMax.toFixed(2)] : null };
}

// Where a surveyed edge steps sideways from one sample to the next – the end of a pit lane's line, past which the track is
// the whole tarmac again (Zandvoort's pit exit: 4.6 m within 5 m): 1 at the samples either side of each such step and at
// the surveyed sample before and after them. No edge line is drawn along a step: the real line ends there and the
// tarmac's own begins further out. (The one sample more each way: a step spread over a few samples begins and ends with
// a small move – 0.5 m – and a line narrowing to nothing over it would end in a hook; narrowing over the sample before
// it, the line ends straight.)
// e: the edge's offset per sample (m); sv: per sample, truthy where it is surveyed; min: metres from one sample to the next
export function edgeSteps(e, sv, min = 1.2) {
  const n = e.length, a = new Uint8Array(n), b = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (sv[i] && sv[j] && Math.abs(e[j] - e[i]) >= min) a[i] = a[j] = 1; }
  for (let i = 0; i < n; i++) b[i] = a[i] || (sv[i] && (a[(i + n - 1) % n] || a[(i + 1) % n])) ? 1 : 0;
  return b;
}

// The painted pieces of a broken line laid along a path of straight pieces: lengths – each piece's length (m), on / off –
// painted and bare metres, beginning painted at the path's start. → [[piece, from, to] …] (from, to: 0 … 1 along that
// piece); a painted stretch running over a joint comes as two.
export function dashPieces(lengths, on, off) {
  const out = [], per = on + off; if (!(on > 0) || !(per > 0)) return out;
  let s0 = 0;
  for (let j = 0; j < lengths.length; j++) {
    const len = lengths[j], s1 = s0 + len; if (!(len > 0)) continue;
    for (let k = Math.floor(s0 / per); k * per < s1; k++) { const a = Math.max(s0, k * per), b = Math.min(s1, k * per + on); if (b - a > 1e-6) out.push([j, (a - s0) / len, (b - s0) / len]); }
    s0 = s1;
  }
  return out;
}
