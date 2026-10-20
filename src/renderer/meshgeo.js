// Pure mesh geometry on triangle lists (v0.43) – [ax, ay, az, bx, by, bz, cx, cy, cz] each, no three.js: is a point
// inside a closed skin (the vertical line's crossings, made exact on shared edges and corners), how far it is from the
// skin, where two triangle sets cross, the mesh's connected pieces and open edges – and a signed distance field over a
// closed skin. Shared by the cockpit check (cockpitcheck.js, development and tests) and the arms' planner (arms.js:
// the driver's torso as drawn, not a stand-in capsule).
// The mesh's connected pieces (triangles sharing a corner – corners joined within 1 µm), each a list of triangles
export function components(tris) {
  const q = (x) => Math.round(x * 1e6), vid = new Map(), parent = [];
  const id = (x, y, z) => { const k = `${q(x)},${q(y)},${q(z)}`; let v = vid.get(k); if (v === undefined) { vid.set(k, (v = parent.length)); parent.push(v); } return v; };
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  const tv = tris.map((t) => [id(t[0], t[1], t[2]), id(t[3], t[4], t[5]), id(t[6], t[7], t[8])]);
  for (const [a, b, c] of tv) { const ra = find(a); parent[find(b)] = ra; parent[find(c)] = ra; }
  const groups = new Map();
  tris.forEach((t, i) => { const r = find(tv[i][0]); let g = groups.get(r); if (!g) groups.set(r, (g = [])); g.push(t); });
  return [...groups.values()];
}
// A solid from its triangles: a grid over x / z (2 cm) – each cell lists the triangles over it
export function solidOf(name, tris, cell = 0.02) {
  const grid = new Map(), key = (i, j) => i * 100000 + j;
  tris.forEach((t, k) => {
    const i0 = Math.floor(Math.min(t[0], t[3], t[6]) / cell), i1 = Math.floor(Math.max(t[0], t[3], t[6]) / cell), j0 = Math.floor(Math.min(t[2], t[5], t[8]) / cell), j1 = Math.floor(Math.max(t[2], t[5], t[8]) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const kk = key(i, j); let l = grid.get(kk); if (!l) grid.set(kk, (l = [])); l.push(k); }
  });
  return { name, tris, grid, cell, key, closed: true, openEdges: 0 };
}
// How many edges of the mesh aren't shared by exactly two triangles (corners joined where they are within 1 µm; a
// triangle with two equal corners – a loft's pole, a lathe's axis – has no area and no edges)
export function openEdges(tris) {
  const q = (x) => Math.round(x * 1e6), vid = new Map(), edges = new Map();
  const id = (x, y, z) => { const k = `${q(x)},${q(y)},${q(z)}`; let v = vid.get(k); if (v === undefined) vid.set(k, (v = vid.size)); return v; };
  for (const t of tris) {
    const a = id(t[0], t[1], t[2]), b = id(t[3], t[4], t[5]), c = id(t[6], t[7], t[8]);
    if (a === b || b === c || c === a) continue;
    for (const [p, r] of [[a, b], [b, c], [c, a]]) { const k = p < r ? p * 4194304 + r : r * 4194304 + p; edges.set(k, (edges.get(k) || 0) + 1); }
  }
  let open = 0; for (const n of edges.values()) if (n !== 2) open++;
  return open;
}

// The side of the edge (ax, az)–(bx, bz) the moved line (x + ε, z + ε²) passes: +1 left, −1 right, as seen going a → b.
// Worked out from the edge's ends in a fixed (lexicographic) order, then turned for the triangle's direction: both
// triangles of a shared edge get exactly opposite answers – never both "inside" (no number noise between them either).
export function side(ax, az, bx, bz, x, z) {
  let flip = 1;
  if (bx < ax || (bx === ax && bz < az)) { let t = ax; ax = bx; bx = t; t = az; az = bz; bz = t; flip = -1; }
  const e = (bx - ax) * (z - az) - (bz - az) * (x - ax);
  // (on the edge's line: the ε term, −(bz − az); along x, the ε² term, bx − ax – the ends ordered, so never both 0)
  const s = e > 0 ? 1 : e < 0 ? -1 : bz !== az ? (az > bz ? 1 : -1) : bx > ax ? 1 : -1;
  return s * flip;
}
// the height (y) at which the vertical line through (x, z) meets the triangle t, or NaN when the moved line misses it
export function crossing(t, x, z) {
  const s1 = side(t[0], t[2], t[3], t[5], x, z), s2 = side(t[3], t[5], t[6], t[8], x, z); if (s1 !== s2) return NaN;
  const s3 = side(t[6], t[8], t[0], t[2], x, z); if (s3 !== s1) return NaN;
  // (inside: the height from the barycentric weights, held within the triangle's own heights – a face seen nearly edge
  // on has a tiny projected area and the division is poor there)
  const x1 = t[0], z1 = t[2], x2 = t[3], z2 = t[5], x3 = t[6], z3 = t[8], d = (z2 - z3) * (x1 - x3) + (x3 - x2) * (z1 - z3);
  const lo = Math.min(t[1], t[4], t[7]), hi = Math.max(t[1], t[4], t[7]);
  if (d === 0) return (lo + hi) / 2;
  const a = ((z2 - z3) * (x - x3) + (x3 - x2) * (z - z3)) / d, b = ((z3 - z1) * (x - x3) + (x1 - x3) * (z - z3)) / d;
  return Math.max(lo, Math.min(hi, a * t[1] + b * t[4] + (1 - a - b) * t[7]));
}
// how deep (m, measured straight up or down to the skin – an upper bound of the true distance, penetration's nearest
// is the true one) a point is inside a solid; 0 when outside, on the skin, or when the solid isn't closed. The point
// is in the car's frame.
export function insideDepth(S, x, y, z) {
  if (!S.closed) return 0;
  const ids = S.grid.get(S.key(Math.floor(x / S.cell), Math.floor(z / S.cell)));
  if (!ids) return 0;
  let above = 0, nearest = Infinity;
  for (const k of ids) {
    const yh = crossing(S.tris[k], x, z); if (Number.isNaN(yh)) continue;
    const dy = yh - y; if (dy === 0) return 0;   // (on the skin)
    if (dy > 0) above++;
    nearest = Math.min(nearest, Math.abs(dy));
  }
  if (above % 2 === 0) return 0;
  // (a point on a face the line runs along – a vertical wall – is on the skin, not inside: the moved line only decides
  // which side such a point counts on, and on the skin it is neither)
  for (const k of ids) if (triDistance(S.tris[k], x, y, z) < 1e-12) return 0;
  return nearest;
}
// The closest point of triangle t to p (Ericson, Real-Time Collision Detection 5.1.5): the distance
export function triDistance(t, px, py, pz) {
  const ax = t[0], ay = t[1], az = t[2], abx = t[3] - ax, aby = t[4] - ay, abz = t[5] - az, acx = t[6] - ax, acy = t[7] - ay, acz = t[8] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const at = (u, v) => Math.hypot(ax + abx * u + acx * v - px, ay + aby * u + acy * v - py, az + abz * u + acz * v - pz);
  if (d1 <= 0 && d2 <= 0) return at(0, 0);
  const bpx = px - t[3], bpy = py - t[4], bpz = pz - t[5], d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return at(1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 - d3 ? d1 / (d1 - d3) : 0, 0);   // (a zero-length edge: its end)
  const cpx = px - t[6], cpy = py - t[7], cpz = pz - t[8], d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return at(0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 - d6 ? d2 / (d2 - d6) : 0);
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const s = (d4 - d3) + (d5 - d6), w = s ? (d4 - d3) / s : 0; return at(1 - w, w); }
  const sum = va + vb + vc; if (!sum) return Math.min(at(0, 0), at(1, 0), at(0, 1));   // (no area: a corner)
  const den = 1 / sum; return at(vb * den, vc * den);
}
// The signed solid angle of triangle t seen from p (van Oosterom & Strackee 1983), over 4π: a closed skin's sum is 1
// inside and 0 outside; an open one's somewhere between (the generalised winding number)
export function solidAngle(t, px, py, pz) {
  const ax = t[0] - px, ay = t[1] - py, az = t[2] - pz, bx = t[3] - px, by = t[4] - py, bz = t[5] - pz, cx = t[6] - px, cy = t[7] - py, cz = t[8] - pz;
  const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), lc = Math.hypot(cx, cy, cz);
  const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  const den = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (bx * cx + by * cy + bz * cz) * la + (cx * ax + cy * ay + cz * az) * lb;
  return Math.atan2(det, den) / (2 * Math.PI);
}
export function windingNumber(S, x, y, z) { let w = 0; for (const t of S.tris) w += solidAngle(t, x, y, z); return w; }
// A point against a solid: inside or not, the straight-up/down distance to the skin (insideDepth) and the true shortest
// distance to it (nearest: the deepest a point really is – searched over the cells within the vertical distance). An
// open solid: inside by the winding number (> ½), its depth the nearest distance, marked open.
export function penetration(S, x, y, z) {
  let inside, vertical;
  if (S.closed) { vertical = insideDepth(S, x, y, z); inside = vertical > 0; }
  else { inside = windingNumber(S, x, y, z) > 0.5; vertical = NaN; }
  if (!inside) return { inside: false, vertical: 0, nearest: 0, open: !S.closed };
  const r = S.closed ? vertical : 0.2, n = Math.ceil(r / S.cell), i0 = Math.floor(x / S.cell), j0 = Math.floor(z / S.cell), seen = new Set();
  let nearest = S.closed ? vertical : Infinity;
  for (let i = i0 - n; i <= i0 + n; i++) for (let j = j0 - n; j <= j0 + n; j++) {
    const ids = S.grid.get(S.key(i, j)); if (!ids) continue;
    for (const k of ids) { if (seen.has(k)) continue; seen.add(k); nearest = Math.min(nearest, triDistance(S.tris[k], x, y, z)); }
  }
  return { inside: true, vertical, nearest, open: !S.closed };
}

// Does the segment p→q cross triangle t (Möller & Trumbore 1997)? Its parameter along p→q (0..1), or NaN
export function segCross(t, px, py, pz, qx, qy, qz) {
  const e1x = t[3] - t[0], e1y = t[4] - t[1], e1z = t[5] - t[2], e2x = t[6] - t[0], e2y = t[7] - t[1], e2z = t[8] - t[2];
  const dx = qx - px, dy = qy - py, dz = qz - pz;
  const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x, a = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(a) < 1e-15) return NaN;
  const f = 1 / a, sx = px - t[0], sy = py - t[1], sz = pz - t[2], u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return NaN;
  const cx = sy * e1z - sz * e1y, cy = sz * e1x - sx * e1z, cz = sx * e1y - sy * e1x, v = f * (dx * cx + dy * cy + dz * cz);
  if (v < 0 || u + v > 1) return NaN;
  const s = f * (e2x * cx + e2y * cy + e2z * cz);
  return s >= 0 && s <= 1 ? s : NaN;
}
// Where two triangle sets meet (any pair of triangles crossing – between the vertices too: an edge of one through a
// face of the other, both ways): how many edges cross, and one crossing point. A thin part (the rim's 2 cm tube, a
// glove's finger) can pass between a sampled set of vertices; this can't miss it.
export function surfaceCrossings(trisA, S, skip = null) {
  let count = 0, at = null;
  const SB = S, cell = SB.cell;
  const edgesOf = (tris, f) => { for (let k = 0; k < tris.length; k++) { const t = tris[k]; if (skip && skip(k)) continue; f(t[0], t[1], t[2], t[3], t[4], t[5]); f(t[3], t[4], t[5], t[6], t[7], t[8]); f(t[6], t[7], t[8], t[0], t[1], t[2]); } };
  // (A's edges through B's faces, via B's grid)
  edgesOf(trisA, (px, py, pz, qx, qy, qz) => {
    const i0 = Math.floor(Math.min(px, qx) / cell), i1 = Math.floor(Math.max(px, qx) / cell), j0 = Math.floor(Math.min(pz, qz) / cell), j1 = Math.floor(Math.max(pz, qz) / cell), seen = new Set();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const ids = SB.grid.get(SB.key(i, j)); if (!ids) continue;
      for (const k of ids) { if (seen.has(k)) continue; seen.add(k); const s = segCross(SB.tris[k], px, py, pz, qx, qy, qz); if (!Number.isNaN(s)) { count++; at ||= [px + (qx - px) * s, py + (qy - py) * s, pz + (qz - pz) * s]; } } }
  });
  // (B's edges through A's faces, via a grid of A)
  const SA = solidOf("a", skip ? trisA.filter((_, k) => !skip(k)) : trisA, cell);
  edgesOf(SB.tris, (px, py, pz, qx, qy, qz) => {
    const i0 = Math.floor(Math.min(px, qx) / cell), i1 = Math.floor(Math.max(px, qx) / cell), j0 = Math.floor(Math.min(pz, qz) / cell), j1 = Math.floor(Math.max(pz, qz) / cell), seen = new Set();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const ids = SA.grid.get(SA.key(i, j)); if (!ids) continue;
      for (const k of ids) { if (seen.has(k)) continue; seen.add(k); const s = segCross(SA.tris[k], px, py, pz, qx, qy, qz); if (!Number.isNaN(s)) { count++; at ||= [px + (qx - px) * s, py + (qy - py) * s, pz + (qz - pz) * s]; } } }
  });
  return { count, at };
}


// A signed distance field over a mesh made of closed pieces (v0.43: the driver's torso – chest, pelvis and thighs,
// overlapping): every `step` m over its bounds and `pad` m round them, the distance to the skin – negative inside (the
// deepest of the pieces the point is in: inside two overlapping pieces a buried face is no way out), positive outside
// (to the nearest triangle, held at pad). { min, step, n: [nx, ny, nz], pad, d: Float32Array }. Slow-ish (~1 s for a
// few hundred triangles): built off line, for the planner.
export function distanceField(tris, step = 0.01, pad = 0.07) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (let i = 0; i < 9; i++) { lo[i % 3] = Math.min(lo[i % 3], t[i]); hi[i % 3] = Math.max(hi[i % 3], t[i]); }
  const min = lo.map((v) => v - pad), n = hi.map((v, i) => Math.ceil((v + pad - min[i]) / step) + 1), d = new Float32Array(n[0] * n[1] * n[2]);
  const pieces = components(tris).map((c) => solidOf("piece", c)), box = tris.map((t) => [Math.min(t[0], t[3], t[6]), Math.min(t[1], t[4], t[7]), Math.min(t[2], t[5], t[8]), Math.max(t[0], t[3], t[6]), Math.max(t[1], t[4], t[7]), Math.max(t[2], t[5], t[8])]);
  const nearest = (list, bx, x, y, z, cap) => { let best = cap; for (let k = 0; k < list.length; k++) { const b = bx[k], dx = Math.max(b[0] - x, 0, x - b[3]), dy = Math.max(b[1] - y, 0, y - b[4]), dz = Math.max(b[2] - z, 0, z - b[5]); if (dx * dx + dy * dy + dz * dz >= best * best) continue; best = Math.min(best, triDistance(list[k], x, y, z)); } return best; };
  const pieceBox = pieces.map((P) => P.tris.map((t) => [Math.min(t[0], t[3], t[6]), Math.min(t[1], t[4], t[7]), Math.min(t[2], t[5], t[8]), Math.max(t[0], t[3], t[6]), Math.max(t[1], t[4], t[7]), Math.max(t[2], t[5], t[8])]));
  for (let i = 0; i < n[0]; i++) for (let j = 0; j < n[1]; j++) for (let k = 0; k < n[2]; k++) {
    const x = min[0] + i * step, y = min[1] + j * step, z = min[2] + k * step;
    let deep = 0;
    pieces.forEach((P, q) => { if (insideDepth(P, x, y, z) > 0) deep = Math.max(deep, nearest(P.tris, pieceBox[q], x, y, z, Infinity)); });
    d[(i * n[1] + j) * n[2] + k] = deep > 0 ? -deep : nearest(tris, box, x, y, z, pad);
  }
  return { min, step, n, pad, d };
}
// the field's value at (x, y, z) – trilinear; outside its bounds: pad (clear)
export function fieldAt(F, x, y, z) {
  const fx = (x - F.min[0]) / F.step, fy = (y - F.min[1]) / F.step, fz = (z - F.min[2]) / F.step, [nx, ny, nz] = F.n;
  if (fx < 0 || fy < 0 || fz < 0 || fx > nx - 1 || fy > ny - 1 || fz > nz - 1) return F.pad;
  const i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(ny - 2, Math.floor(fy)), k = Math.min(nz - 2, Math.floor(fz)), u = fx - i, v = fy - j, w = fz - k, D = F.d;
  const at = (a, b, c) => D[((i + a) * ny + j + b) * nz + k + c];
  const l = (p, q, t) => p + (q - p) * t;
  return l(l(l(at(0, 0, 0), at(0, 0, 1), w), l(at(0, 1, 0), at(0, 1, 1), w), v), l(l(at(1, 0, 0), at(1, 0, 1), w), l(at(1, 1, 0), at(1, 1, 1), w), v), u);
}
