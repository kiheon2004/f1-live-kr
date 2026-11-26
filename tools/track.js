// Development tool (not shipped): a circuit's track from surveyed lines – from the chat-side session's survey file (the
// outer side of the white line each side, [lat, lon], section by section) to src/renderer/trackdata.js, the data the 3D
// view builds the track's edges from (src/renderer/trackedges.js).
//
//   node tools/track.js check <survey.json>
//       the survey's own checks: pairs, order, widths, sections that cross, spacing, the low stretches
//   node tools/track.js ref <cacheDir> <session name> <circuit>
//       the feed's reference line from one session → tools/track/<circuit>.json (ref). <cacheDir>: a CLONE of the app's
//       cache – the archive reader marks the files it reads as used. Never asks the network.
//   node tools/track.js fit0 <circuit>
//       the fit the app makes today (the reference line onto the bundled centreline), as the circuit's stored fit – a
//       starting value until the survey gives a better one → tools/track/<circuit>.json (fit)
//   node tools/track.js fit <circuit> [--survey <file>] [--pit <the chat side's *_pitlane.json>] [--write]
//       the fit from the survey: the reference line kept clear of both edges, the feed's pit path down the fast lane
//   node tools/track.js build [--json <out.json> <circuit>]
//       tools/track/*.json (ref, fit, survey) → src/renderer/trackdata.js; with --json: one circuit's entry as a file (for
//       Map3D.tune({ track }) – a look before it is shipped)
//
// tools/track/<circuit>.json: { venue, location, yr: [from, to | null], on, ref: { from, pts: [[X, Y] dm …] },
//   fit: { centre, c, s, tx, ty, from }, survey: "<file beside it>" }. The fit takes feed metres [X, Y] to metres east and
//   north of the circuit's centre (src/main/geo.js CIRCUITS): [c·X − s·Y + tx, s·X + c·Y + ty].
const fs = require("node:fs");
const path = require("node:path");
const geo = require("../src/main/geo.js");

const DIR = path.join(__dirname, "track");
const hyp = Math.hypot;

// ---------- the survey's own checks ----------
// d: the survey as the chat-side session writes it ({ venue, season, src, edges: { left, right, open? }, marks, low }).
// → { ok, errors, warnings, stats }. Nothing here needs the feed: which way the cars go is checked when it is built.
function checkSurvey(d) {
  const errors = [], warnings = [], E = d?.edges;
  const bad = (m) => { errors.push(m); return { ok: false, errors, warnings, stats: null }; };
  if (!d || typeof d !== "object") return bad("not an object");
  if (!Number.isInteger(d.venue)) errors.push("venue: the circuit's key (a whole number) is missing");
  if (!E || !Array.isArray(E.left) || !Array.isArray(E.right)) return bad("edges.left / edges.right missing");
  if (E.left.length !== E.right.length) return bad(`edges: ${E.left.length} points on the left, ${E.right.length} on the right – they must pair up`);
  let n = E.left.length;
  if (n < (E.open ? 2 : 20)) return bad(`edges: only ${n} sections`);
  const okLL = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
  for (const [name, a] of [["left", E.left], ["right", E.right]]) { const i = a.findIndex((p) => !okLL(p)); if (i >= 0) return bad(`edges.${name}[${i}]: not a [lat, lon]`); }
  const fr = geo.frame(E.left[0]), XY = (p) => fr.toXY(p[0], p[1]);
  let L = E.left.map(XY), R = E.right.map(XY);
  if (L.concat(R).some((p) => hyp(p[0], p[1]) > 15000)) return bad("edges: a point more than 15 km from the first");
  // (a closed lap whose last section repeats the first: taken once)
  const closed = !E.open;
  let repeated = false;
  if (closed && hyp(L[n - 1][0] - L[0][0], L[n - 1][1] - L[0][1]) < 0.5 && hyp(R[n - 1][0] - R[0][0], R[n - 1][1] - R[0][1]) < 0.5) { L = L.slice(0, -1); R = R.slice(0, -1); n--; repeated = true; warnings.push("the last section repeats the first: taken once"); }
  const mid = L.map((l, i) => [(l[0] + R[i][0]) / 2, (l[1] + R[i][1]) / 2]), width = L.map((l, i) => hyp(l[0] - R[i][0], l[1] - R[i][1]));
  const m = closed ? n : n - 1, nx = (i) => (i + 1) % n;
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0], sub = (a, b) => [a[0] - b[0], a[1] - b[1]], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const segX = (p, q, r, s) => { const d1 = cross(sub(q, p), sub(r, p)), d2 = cross(sub(q, p), sub(s, p)), d3 = cross(sub(s, r), sub(p, r)), d4 = cross(sub(s, r), sub(q, r)); return d1 * d2 < 0 && d3 * d4 < 0; };
  let wrongSide = 0, back = 0, crossed = 0, skew = 0, far = 0, len = 0, gapMax = 0, turned = 0;
  const firstOf = {};
  const note = (k, i) => { if (firstOf[k] == null) firstOf[k] = i; };
  let prev = closed ? sub(mid[0], mid[n - 1]) : null;
  for (let i = 0; i < m; i++) {
    const j = nx(i), t = sub(mid[j], mid[i]), l = hyp(t[0], t[1]);
    len += l; gapMax = Math.max(gapMax, l);
    // (from one section to the next the track never turns by more than a right angle: sections out of order do)
    if (prev && dot(prev, t) < 0) { turned++; note("turn", i); }
    prev = t;
    if (l < 0.3) { errors.push(`sections ${i} and ${j} are ${l.toFixed(2)} m apart: the same section twice`); continue; }
    if (l > 25) { far++; note("far", i); }
    // the left edge is on the left of the way the sections run (x east, y north: a positive cross product)
    if (cross(t, sub(L[i], mid[i])) <= 0) { wrongSide++; note("side", i); }
    if (dot(sub(L[j], L[i]), t) <= 0 || dot(sub(R[j], R[i]), t) <= 0) { back++; note("back", i); }
    if (segX(L[i], R[i], L[j], R[j])) { crossed++; note("cross", i); }
    const across = sub(L[i], R[i]), cosA = Math.abs(dot(across, t)) / ((hyp(across[0], across[1]) || 1) * l);
    if (cosA > 0.5) { skew++; note("skew", i); }
  }
  if (turned) errors.push(`the sections' order turns back on itself in ${turned} places (first: at section ${firstOf.turn}) – sections out of order`);
  if (wrongSide > m / 2) errors.push(`left and right are swapped (the left edge is on the right of the way the sections run in ${wrongSide} of ${m})`);
  else if (wrongSide) errors.push(`${wrongSide} sections have their left point on the right (first: ${firstOf.side})`);
  if (back) errors.push(`${back} places where an edge runs backwards between two sections (first: ${firstOf.back})`);
  if (crossed) errors.push(`${crossed} pairs of sections cross each other (first: ${firstOf.cross})`);
  if (skew) warnings.push(`${skew} sections lie more than 30° off square to the track (first: ${firstOf.skew})`);
  if (far) warnings.push(`${far} gaps of more than 25 m between sections (first: after ${firstOf.far}; the longest ${gapMax.toFixed(1)} m)`);
  const wBad = width.map((w, i) => [w, i]).filter(([w]) => w < 3 || w > 45), wOdd = width.map((w, i) => [w, i]).filter(([w]) => (w >= 3 && w < 6) || (w > 30 && w <= 45));
  if (wBad.length) errors.push(`${wBad.length} sections narrower than 3 m or wider than 45 m (first: ${wBad[0][1]}, ${wBad[0][0].toFixed(1)} m)`);
  if (wOdd.length) warnings.push(`${wOdd.length} sections outside 6 … 30 m wide (first: ${wOdd[0][1]}, ${wOdd[0][0].toFixed(1)} m) – right if the track is like that there`);
  // the low stretches
  const low = new Uint8Array(n);
  for (const [k, r] of (d.low || []).entries()) {
    const a = r?.from, b = r?.to;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < a || b > n - 1 + (repeated ? 1 : 0)) { errors.push(`low[${k}]: from ${a} to ${b} is not a range of sections (0 … ${n - 1})`); continue; }
    for (let i = a; i <= Math.min(b, n - 1); i++) low[i] = 1;
  }
  let lowLen = 0; for (let i = 0; i < m; i++) if (low[i] || low[nx(i)]) lowLen += hyp(mid[nx(i)][0] - mid[i][0], mid[nx(i)][1] - mid[i][1]);
  // marks: two points each, across the track near a section
  for (const [k, v] of Object.entries(d.marks || {})) {
    if (!Array.isArray(v) || v.length !== 2 || !v.every(okLL)) { errors.push(`marks.${k}: two [lat, lon] points wanted`); continue; }
    const a = XY(v[0]), b = XY(v[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let best = Infinity; for (const q of mid) best = Math.min(best, hyp(q[0] - c[0], q[1] - c[1]));
    if (best > 30) warnings.push(`marks.${k}: ${best.toFixed(0)} m from the nearest section's middle`);
  }
  if (!d.src) warnings.push("src: where the lines were read from (imagery, date, metres a pixel, expected error) is missing");
  const sorted = [...width].sort((a, b) => a - b);
  const stats = { sections: n, closed, length: +len.toFixed(0), width: { min: +sorted[0].toFixed(2), median: +sorted[n >> 1].toFixed(2), max: +sorted[n - 1].toFixed(2) }, gapMax: +gapMax.toFixed(1), low: { sections: low.reduce((a, b) => a + b, 0), metres: +lowLen.toFixed(0) }, marks: Object.keys(d.marks || {}) };
  return { ok: !errors.length, errors, warnings, stats };
}

// ---------- the fit: feed metres ↔ metres about the circuit's centre ↔ latitude and longitude ----------
// (geo.fitTrack's answer – about its own middle point cs – as the stored form: the shift taken about the feed's origin)
function storedFit(f, centre) {
  if (!f?.ok || f.mirror !== 1) return null;
  const { c, s, tx, ty } = f.T;
  return { centre, c, s, tx: tx - (c * f.cs[0] - s * f.cs[1]), ty: ty - (s * f.cs[0] + c * f.cs[1]) };
}
const feedToLocal = (F, [X, Y]) => [F.c * X - F.s * Y + F.tx, F.s * X + F.c * Y + F.ty];
function localToFeed(F, [ex, ey]) { const k = F.c * F.c + F.s * F.s, x = ex - F.tx, y = ey - F.ty; return [(F.c * x + F.s * y) / k, (-F.s * x + F.c * y) / k]; }
function llToFeed(F, [lat, lon]) { return localToFeed(F, geo.frame(F.centre).toXY(lat, lon)); }
function feedToLL(F, p) { const [ex, ey] = feedToLocal(F, p); return geo.frame(F.centre).toLL(ex, ey); }

// ---------- the reference line from a session ----------
// One car's lap (ReplayKit lapShape) smoothed as the app smooths it, then moved onto where the whole field is (the feed
// puts every car on one line: the median of all cars' offsets, per 10 m) – one car's lap alone is a metre or more off
// that line over 2–4 % of a lap. Only positions within 3.5 m of the lap count: the pit lane beside the track is a line
// of its own, and its slow and standing cars outnumber the track's. → points every 5 m, feed decimetres.
function refLine(lap, cars) {
  const P = [];
  for (const p of lap) { const q = [p[0] / 10, p[1] / 10, (p[2] || 0) / 10]; if (!P.length || hyp(q[0] - P[P.length - 1][0], q[1] - P[P.length - 1][1]) > 3) P.push(q); }
  if (P.length > 3 && hyp(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 15) P.pop();
  const n = P.length, cum = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + hyp(P[i % n][0] - P[i - 1][0], P[i % n][1] - P[i - 1][1]));
  const len = cum[n], m1 = Math.round(len), fine = [];
  for (let k = 0, i = 0; k < m1; k++) { const s = (k * len) / m1; while (cum[i + 1] < s) i++; const t = (s - cum[i]) / (cum[i + 1] - cum[i] || 1), a = P[i], b = P[(i + 1) % n]; fine.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  const gauss = (arr, sig, K) => { const w = Array.from({ length: 2 * K + 1 }, (_, k) => Math.exp(-0.5 * ((k - K) / sig) ** 2)), ws = w.reduce((a, b) => a + b, 0), N = arr.length; return arr.map((_, i) => { const v = arr[0].map(() => 0); for (let k = -K; k <= K; k++) { const q = arr[(i + k + N) % N]; for (let c = 0; c < v.length; c++) v[c] += q[c] * w[k + K]; } return v.map((x) => x / ws); }); };
  const soft = gauss(fine, 4, 12);
  const S = [];
  for (let i = 0; i < m1; i += 2) { const a = soft[(i - 2 + m1) % m1], b = soft[(i + 2) % m1], l = hyp(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l; S.push({ i: S.length, x: soft[i][0], y: soft[i][1], z: soft[i][2], nx: ty, ny: -tx }); }
  // every car's offset from it, per 10 m: the busiest cluster's median
  const cell = 40, grid = new Map(), key = (i, j) => (i + 32768) * 65536 + (j + 32768);
  for (const s of S) { const k = key(Math.floor(s.x / cell), Math.floor(s.y / cell)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); }
  const B = 5, nb = Math.ceil(S.length / B), lat = Array.from({ length: nb }, () => []);
  for (const c of cars) for (let i = 0; i < c.n; i++) {
    const x = c.x[i] / 10, y = c.y[i] / 10, z = c.z[i] / 10, cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    let best = null, bd = 22 * 22;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const s of grid.get(key(cx + a, cy + b)) || []) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = s; } }
    if (!best || Math.abs(z - best.z) > 4) continue;
    const l = (x - best.x) * best.nx + (y - best.y) * best.ny;
    if (Math.abs(l) <= 3.5) lat[Math.floor(best.i / B)].push(l);
  }
  const off = lat.map((v) => { if (v.length < 40) return 0; v.sort((a, b) => a - b); return v[v.length >> 1]; });
  const offS = off.map((_, i) => (off[(i - 1 + nb) % nb] + 2 * off[i] + off[(i + 1) % nb]) / 4);
  const moved = S.map((s) => { const f = s.i / B - 0.5, b0 = Math.floor(f), t = f - b0, o = offS[(b0 + nb) % nb] * (1 - t) + offS[(b0 + 1) % nb] * t; return [s.x + s.nx * o, s.y + s.ny * o]; });
  // every 5 m
  const N = moved.length, c2 = [0]; for (let i = 1; i <= N; i++) c2.push(c2[i - 1] + hyp(moved[i % N][0] - moved[i - 1][0], moved[i % N][1] - moved[i - 1][1]));
  const total = c2[N], k5 = Math.round(total / 5), pts = [];
  for (let k = 0, i = 0; k < k5; k++) { const s = (k * total) / k5; while (c2[i + 1] < s) i++; const t = (s - c2[i]) / (c2[i + 1] - c2[i] || 1), a = moved[i], b = moved[(i + 1) % N]; pts.push([Math.round((a[0] + (b[0] - a[0]) * t) * 10), Math.round((a[1] + (b[1] - a[1]) * t) * 10)]); }
  return { pts, length: +total.toFixed(1), moved: { max: +Math.max(...offS.map(Math.abs)).toFixed(2), over1: +(offS.filter((o) => Math.abs(o) > 1).length / nb).toFixed(3) } };
}

// ---------- the renderer's data from a circuit's file ----------
// C: tools/track/<circuit>.json's content; survey: the chat-side session's file (checked). → the TRACKS entry, in the feed's
// metres, with the lines running the way the cars go and the left edge on their left; and a report.
function buildEntry(C, survey) {
  const F = C.fit, E = survey.edges;
  if (!F || !C.ref?.pts?.length) throw new Error("the circuit's file has no fit or no reference line");
  let n = Math.min(E.left.length, E.right.length), left = E.left.slice(0, n).map((p) => llToFeed(F, p)), right = E.right.slice(0, n).map((p) => llToFeed(F, p));
  let low = (survey.low || []).map((r) => [r.from, r.to]);
  if (!E.open && hyp(left[n - 1][0] - left[0][0], left[n - 1][1] - left[0][1]) < 0.5 && hyp(right[n - 1][0] - right[0][0], right[n - 1][1] - right[0][1]) < 0.5) { left.pop(); right.pop(); n--; low = low.map(([a, b]) => [Math.min(a, n - 1), Math.min(b, n - 1)]); }
  // which way the cars go: the reference line's direction at each section's middle
  const ref = C.ref.pts.map(([x, y]) => [x / 10, y / 10]), rn = ref.length;
  let withCars = 0, against = 0;
  for (let i = 0; i < n - (E.open ? 1 : 0); i += Math.max(1, Math.floor(n / 200))) {
    const j = (i + 1) % n, mx = (left[i][0] + right[i][0]) / 2, my = (left[i][1] + right[i][1]) / 2, tx = (left[j][0] + right[j][0]) / 2 - mx, ty = (left[j][1] + right[j][1]) / 2 - my;
    let b = 0, bd = Infinity; for (let k = 0; k < rn; k++) { const d = (ref[k][0] - mx) ** 2 + (ref[k][1] - my) ** 2; if (d < bd) { bd = d; b = k; } }
    const r = [ref[(b + 1) % rn][0] - ref[(b - 1 + rn) % rn][0], ref[(b + 1) % rn][1] - ref[(b - 1 + rn) % rn][1]];
    if (tx * r[0] + ty * r[1] > 0) withCars++; else against++;
  }
  const reversed = against > withCars;
  // (C.broken: stretches where the real edge line is broken – a pit entry's mouth: { right | left: [[from section, to section,
  // painted m, bare m] …] }, sides and sections as in the survey file)
  let broken = null;
  for (const key of ["left", "right"]) { const R = (C.broken?.[key] || []).filter((r) => Array.isArray(r) && r.length >= 2 && r[0] >= 0 && r[1] > r[0] && r[1] <= n - 1); if (R.length) (broken ||= {})[key] = R.map(([a, b, on = 1, off = 1]) => [a, b, on, off]); }
  if (reversed) { const l = left; left = right.reverse(); right = l.reverse(); low = low.map(([a, b]) => [n - 1 - b, n - 1 - a]); if (broken) { const f = (R) => R.map(([a, b, on, off]) => [n - 1 - b, n - 1 - a, on, off]); broken = { ...(broken.right ? { left: f(broken.right) } : {}), ...(broken.left ? { right: f(broken.left) } : {}) }; } }
  const r2 = (p) => [+p[0].toFixed(2), +p[1].toFixed(2)];
  const marks = {}; for (const [k, v] of Object.entries(survey.marks || {})) marks[k] = v.map((p) => r2(llToFeed(F, p)));
  const entry = { on: !!C.on, yr: C.yr || null, fit: { centre: F.centre, c: F.c, s: F.s, tx: F.tx, ty: F.ty }, ref: C.ref.pts,
    edges: { left: left.map(r2), right: right.map(r2), ...(E.open ? { open: true } : {}) }, low, ...(broken ? { broken } : {}), marks,
    src: { survey: survey.src || null, ref: C.ref.from || null, fit: F.from || null } };
  return { entry, report: { sections: n, reversed, withCars, against } };
}

// what the 3D view makes of an entry on its own reference line (trackedges.js): the lap as 2 m samples
async function tryEntry(entry) {
  const { applyTrackEdges, lapOnRef } = await import("../src/renderer/trackedges.js");
  const R = entry.ref, pts = [];
  for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length], l = hyp(b[0] - a[0], b[1] - a[1]) / 10, m = Math.max(1, Math.round(l / 2)); for (let k = 0; k < m; k++) pts.push([(a[0] + ((b[0] - a[0]) * k) / m) / 10, -(a[1] + ((b[1] - a[1]) * k) / m) / 10]); }
  const n = pts.length, S = pts.map((p, i) => { const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], l = hyp(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l; return { i, p: { x: p[0], z: p[1] }, nor: { x: -tz, z: tx }, L: 7, R: -7, M: 0 }; });
  const r = applyTrackEdges(S, entry, ([X, Y]) => [X, -Y]);
  const inside = S.filter((s) => s.sv === 1), margin = inside.map((s) => Math.min(s.L, -s.R)).sort((a, b) => a - b);
  return { samples: n, ...r, onRef: lapOnRef(R.filter((_, i) => i % 3 === 0), R), margin: margin.length ? { min: +margin[0].toFixed(2), p02: +margin[Math.floor(margin.length * 0.02)].toFixed(2), median: +margin[margin.length >> 1].toFixed(2) } : null,
    insideShare: inside.length ? +(inside.filter((s) => s.L >= 0 && s.R <= 0).length / inside.length).toFixed(4) : null };
}

// ---------- the fit from the survey ----------
// The reference line is a car's path, not the track's middle: what the survey says about the fit is that the line lies
// between the edges – as clear of both as the lap allows (a squared shortfall from `margin` metres, summed round the
// lap) – and, where the pit lane is surveyed, that the feed's pit path runs down the fast lane's middle (the one thing
// that holds the fit sideways on the pit straight). Starting from the circuit's present fit: a shift, a turn and a scale
// about the lap's middle (four numbers), found by a downhill simplex.
// C: the circuit's file content (fit, ref); survey: checked; pit: { lane: [[lat, lon], [lat, lon]] the fast lane's middle
// line, path: [[x, y] dm …] the feed's pit path } or null. → { fit, before, after, moved }.
async function solveFit(C, survey, { pit = null, margin = 2.5, wPit = 4 } = {}) {
  const { edgeOffsets } = await import("../src/renderer/trackedges.js");
  const F0 = C.fit, fr = geo.frame(F0.centre), sc = ([x, y]) => [x, -y];
  // the survey in the map's own metres (x east, z south) – the lines the way the cars go (buildEntry sorts that out)
  const B = buildEntry(C, survey).entry, E = { edges: { left: B.edges.left.map((p) => sc(feedToLocal(F0, p))), right: B.edges.right.map((p) => sc(feedToLocal(F0, p))), ...(B.edges.open ? { open: true } : {}) }, low: B.low };
  const ref = C.ref.pts.map(([x, y]) => [x / 10, y / 10]), n = ref.length;
  const l0 = ref.map((p) => feedToLocal(F0, p)), g = [l0.reduce((a, p) => a + p[0], 0) / n, l0.reduce((a, p) => a + p[1], 0) / n];
  const fitOf = ([dx, dy, dth, dk]) => {
    const k = 1 + dk, ac = Math.cos(dth) * k, as = Math.sin(dth) * k, c = ac * F0.c - as * F0.s, s = as * F0.c + ac * F0.s, ux = F0.tx - g[0], uy = F0.ty - g[1];
    return { centre: F0.centre, c, s, tx: ac * ux - as * uy + g[0] + dx, ty: as * ux + ac * uy + g[1] + dy };
  };
  const samplesOf = (F) => { const P = ref.map((p) => sc(feedToLocal(F, p))); return P.map((p, i) => { const a = P[(i - 1 + n) % n], b = P[(i + 1) % n], l = hyp(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l; return { i, p: { x: p[0], z: p[1] }, nor: { x: -tz, z: tx } }; }); };
  const id = (p) => p;
  const lane = pit?.lane ? pit.lane.map((ll) => fr.toXY(ll[0], ll[1])) : null, laneLen = lane ? hyp(lane[1][0] - lane[0][0], lane[1][1] - lane[0][1]) : 0;
  const pitOff = (F) => {
    if (!lane || !pit.path?.length) return [];
    const ex = (lane[1][0] - lane[0][0]) / laneLen, ey = (lane[1][1] - lane[0][1]) / laneLen, out = [];
    for (const q of pit.path) { const [x, y] = feedToLocal(F, [q[0] / 10, q[1] / 10]), u = (x - lane[0][0]) * ex + (y - lane[0][1]) * ey; if (u > laneLen * 0.1 && u < laneLen * 0.9) out.push((x - lane[0][0]) * -ey + (y - lane[0][1]) * ex); }
    return out;   // metres to the left of the lane's own direction
  };
  const look = (F) => {
    const S = samplesOf(F), O = edgeOffsets(S, E, id, 40), m = [];
    if (O) for (let i = 0; i < n; i++) if (O.raw[i]) m.push([Math.min(O.dP[i], -O.dM[i]), i]);
    return { m, po: pitOff(F), missed: O ? O.missed : n };
  };
  // (a survey of a stretch only – under half the lap: nothing in it holds a turn or a scale, so the shift alone is fitted)
  const cover = look(F0).m.length / n, lock = cover < 0.5, free = (p) => (lock ? [p[0], p[1], 0, 0] : p);
  const cost = (p0) => {
    const p = free(p0), F = fitOf(p), { m, po } = look(F);
    let c = 0; for (const [v] of m) { const h = margin - v; if (h > 0) c += h * h; }
    if (!m.length) return 1e12;
    c /= m.length;
    if (po.length) c += (wPit * po.reduce((a, o) => a + o * o, 0)) / po.length;
    return c + 0.01 * ((p[2] * 1000) ** 2 + (p[3] * 1000) ** 2);   // (a turn or a scale only where the lap asks for it)
  };
  // downhill simplex (Nelder–Mead), started again from where it stops with a smaller simplex (the cost is nearly flat
  // where the line is clear of both edges: one run stops short, and two settings then gave fits a metre apart)
  let X = null, start = [0, 0, 0, 0];
  for (const size of [1, 0.5, 0.25, 0.12]) {
    X = [start, ...[[2, 0, 0, 0], [0, 2, 0, 0], [0, 0, 0.002, 0], [0, 0, 0, 0.001]].map((d) => start.map((v, i) => v + d[i] * size))].map((p) => ({ p, f: cost(p) }));
    for (let it = 0; it < 300; it++) {
      X.sort((a, b) => a.f - b.f);
      if (X[4].f - X[0].f < 1e-9 && it > 60) break;
      const c0 = [0, 1, 2, 3].map((d) => (X[0].p[d] + X[1].p[d] + X[2].p[d] + X[3].p[d]) / 4), mk = (t) => { const p = c0.map((v, d) => v + t * (X[4].p[d] - v)); return { p, f: cost(p) }; };
      const r = mk(-1);
      if (r.f < X[0].f) { const e = mk(-2); X[4] = e.f < r.f ? e : r; }
      else if (r.f < X[3].f) X[4] = r;
      else { const k = mk(r.f < X[4].f ? -0.5 : 0.5); if (k.f < Math.min(r.f, X[4].f)) X[4] = k; else X = X.map((x, i) => (i ? (() => { const p = x.p.map((v, d) => X[0].p[d] + 0.5 * (v - X[0].p[d])); return { p, f: cost(p) }; })() : x)); }
    }
    X.sort((a, b) => a.f - b.f); start = X[0].p;
  }
  const best = free(X[0].p), F = fitOf(best);
  const sum = (Fx) => {
    const { m, po, missed } = look(Fx), v = m.map((x) => x[0]).sort((a, b) => a - b), q = (f) => (v.length ? +v[Math.min(v.length - 1, Math.floor(f * (v.length - 1)))].toFixed(2) : null);
    // stretches of the line outside the track (the reference line's points are 5 m apart)
    const out = []; let cur = null;
    for (const [x, i] of m) { if (x < 0) { if (cur && i - cur.to <= 2) { cur.to = i; cur.worst = Math.min(cur.worst, x); } else out.push((cur = { from: i, to: i, worst: x })); } }
    const po2 = [...po].sort((a, b) => a - b);
    return { samples: m.length, missed, inside: v.length ? +(v.filter((x) => x >= 0).length / v.length).toFixed(4) : null, clearBy1m: v.length ? +(v.filter((x) => x >= 1).length / v.length).toFixed(4) : null,
      margin: { min: q(0), p02: q(0.02), p10: q(0.1), median: q(0.5) }, outside: out.map((o) => ({ fromM: o.from * 5, toM: o.to * 5 + 5, worst: +o.worst.toFixed(2) })),
      pitPath: po.length ? { points: po.length, median: +po2[po2.length >> 1].toFixed(2), min: +po2[0].toFixed(2), max: +po2[po2.length - 1].toFixed(2) } : null };
  };
  const d = ref.map((p) => { const a = feedToLocal(F0, p), b = feedToLocal(F, p); return hyp(a[0] - b[0], a[1] - b[1]); }).sort((a, b) => a - b);
  return { fit: F, cover: +cover.toFixed(3), shiftOnly: lock, before: sum(F0), after: sum(F), moved: { shift: [+best[0].toFixed(2), +best[1].toFixed(2)], turnDeg: +((best[2] * 180) / Math.PI).toFixed(4), scale: +(1 + best[3]).toFixed(5), points: { median: +d[n >> 1].toFixed(2), max: +d[n - 1].toFixed(2) } } };
}

const readJSON = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const circuitFile = (name) => path.join(DIR, name + ".json");

async function main() {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === "check") {
    const r = checkSurvey(readJSON(a[0]));
    console.log(JSON.stringify(r, null, 1)); process.exitCode = r.ok ? 0 : 1;
  } else if (cmd === "ref") {
    const [cache, name, circuit] = a, m = /^(\d{4})_(\d{4}-\d\d-\d\d_.+?)_(\d{4}-\d\d-\d\d_.+)$/.exec(name);
    if (!m || !circuit) throw new Error("ref <cacheDir> <session name as its files begin> <circuit>");
    const { Archive } = require("../src/main/archive.js"), RK = require("../src/renderer/replay.js");
    const ar = new Archive(cache); ar.fetchAuthed = async () => ({ ok: false, status: 404, headers: { get() { return null; } } });
    const r = new RK.Replay(await ar.loadSession(`${m[1]}/${m[2]}/${m[3]}/`)), lap = r.lapShape();
    if (!lap) throw new Error("no lap in that session");
    r.seek(r.startTime());   // (the session's own details are in its state once it is played)
    const info = r.state?.SessionInfo || {}, R = refLine(lap, Object.values(r.tracks.cars));
    const file = circuitFile(circuit), C = fs.existsSync(file) ? readJSON(file) : {};
    Object.assign(C, { venue: C.venue ?? (+info.Meeting?.Circuit?.Key || null), location: C.location ?? info.Meeting?.Location ?? null, yr: C.yr ?? null, on: C.on ?? false, ref: { from: name, pts: R.pts } });
    fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify(C) + "\n");
    console.log(JSON.stringify({ file, venue: C.venue, location: C.location, points: R.pts.length, length: R.length, movedOntoTheField: R.moved }));
  } else if (cmd === "fit0") {
    const file = circuitFile(a[0]), C = readJSON(file), info = geo.circuitInfo(C.location), centre = geo.CIRCUITS[C.location];
    if (!info?.line?.length || !centre) throw new Error("no bundled centreline or centre for " + C.location);
    const fr = geo.frame(centre), line = info.line.map(([lat, lon]) => fr.toXY(lat, lon));
    const f = geo.fitTrack(C.ref.pts.map(([x, y]) => [x, y, 0]), [line.concat([line[0]])], []), F = storedFit(f, centre);
    if (!F) throw new Error("no fit: " + JSON.stringify(f && { ok: f.ok, mirror: f.mirror, inliers: f.inliers }));
    C.fit = { ...F, from: `as the app fits today: ${C.ref.from}'s reference line onto the bundled centreline (rms ${f.rms.toFixed(2)} m, scale ${f.scale.toFixed(5)})` };
    fs.writeFileSync(file, JSON.stringify(C) + "\n");
    console.log(JSON.stringify({ file, fit: C.fit }));
  } else if (cmd === "fit") {
    // fit <circuit> [--survey <file>] [--pit <the chat side's *_pitlane.json>] [--write]
    const opt = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null);
    const file = circuitFile(a[0]), C = readJSON(file), sf = opt("--survey") || (C.survey && path.resolve(DIR, C.survey));
    if (!sf) throw new Error("no survey: --survey <file>");
    const survey = readJSON(sf), chk = checkSurvey(survey);
    if (!chk.ok) throw new Error("the survey fails its checks:\n" + chk.errors.join("\n"));
    let pit = null;
    if (opt("--pit")) {
      const P = readJSON(opt("--pit")), fl = P.lane?.fast_lane, { START_DATA } = await import("../src/renderer/startdata.js");
      const mid = (i) => [(fl[0][i][0] + fl[1][i][0]) / 2, (fl[0][i][1] + fl[1][i][1]) / 2];
      if (fl && START_DATA[C.venue]?.pit?.path) pit = { lane: [mid(0), mid(1)], path: START_DATA[C.venue].pit.path };
    }
    const r = await solveFit(C, survey, { pit });
    console.log(JSON.stringify({ circuit: a[0], pit: !!pit, cover: r.cover, shiftOnly: r.shiftOnly, before: r.before, after: r.after, moved: r.moved, fit: r.fit }, null, 1));
    if (a.includes("--write")) { C.fit = { ...r.fit, from: `the survey ${path.basename(sf)}${pit ? " and the pit lane's fast lane" : ""}: the reference line (${C.ref.from}) kept clear of both edges; moved from the app's own fit by ${r.moved.points.median} m (median)` }; fs.writeFileSync(file, JSON.stringify(C) + "\n"); }
  } else if (cmd === "build") {
    const one = a[0] === "--json" ? { out: a[1], name: a[2] } : null, out = {};
    for (const f of fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort() : []) {
      const name = f.slice(0, -5); if (one && name !== one.name) continue;
      const C = readJSON(path.join(DIR, f)); if (!C.survey) { console.log(name + ": no survey yet – left out"); continue; }
      const survey = readJSON(path.resolve(DIR, C.survey)), chk = checkSurvey(survey);
      if (!chk.ok) { console.log(name + ": the survey fails its checks – left out\n" + chk.errors.join("\n")); process.exitCode = 1; continue; }
      const { entry, report } = buildEntry(C, survey), tried = await tryEntry(entry);
      console.log(JSON.stringify({ circuit: name, venue: C.venue, on: entry.on, ...report, check: chk.stats, warnings: chk.warnings, onItsOwnLine: tried }));
      if (tried.folds && entry.on) { console.log(name + ": an edge runs backwards – not switched on"); entry.on = false; process.exitCode = 1; }
      out[C.venue] = entry;
    }
    if (one) { fs.writeFileSync(one.out, JSON.stringify(out[Object.keys(out)[0]] || null)); return; }
    const head = "// Generated by tools/track.js (build) from tools/track/*.json – do not edit by hand.\n// Each circuit's surveyed track in the feed's own metres, with the fit and the reference line it belongs to\n// (trackedges.js says how it is used).\n";
    const body = Object.keys(out).length ? "export const TRACKS = {\n" + Object.entries(out).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join("\n") + "\n};\n" : "export const TRACKS = {};\n";
    fs.writeFileSync(path.join(__dirname, "..", "src", "renderer", "trackdata.js"), head + body);
  } else console.log("node tools/track.js check <survey.json> | ref <cacheDir> <session> <circuit> | fit0 <circuit> | build [--json <out> <circuit>]");
}
if (require.main === module) main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });

module.exports = { checkSurvey, storedFit, feedToLocal, localToFeed, llToFeed, feedToLL, refLine, buildEntry, tryEntry, solveFit };
