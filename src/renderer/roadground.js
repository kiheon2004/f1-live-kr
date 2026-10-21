// The ground where two stretches of the lap pass close by each other at different heights (v0.44 §3 – Monaco's "sharp
// rock-like triangles beside the road").
//
// What was wrong (Map3D.terrainScan, 2025 + 2026 Monaco races): scenery.js held every terrain vertex near the track at
// the height of its NEAREST lap sample. Where two stretches run side by side at different heights – Monaco's Beau Rivage
// climb 25–55 m from the harbour-front road and up to 32 m above it (lap samples ~600–820 vs ~1360–1530), the road down
// from the hairpin 15 m from the one below it and 9–10 m above it (~1000–1050 vs ~1090–1110) – the grid (~7 m cells)
// switched from one road's height to the other's from one vertex to the next. The triangles across the switch stood up
// as a sheer face with a saw-tooth top (the grid's diagonals cutting the switch line), painted with the ground's
// asphalt / concrete classes – jagged grey "rocks" seen from the lower road – and where the switch ran within a cell of
// the lower road, triangles from the upper road's vertices rose over the lower road's own tarmac and edge.
//
// Now: (1) between two stretches the ground goes from one road's held height to the other's smoothly across the gap
// (joinHeight), (2) no drawn triangle may stand above any stretch's tarmac (clearRoads lowers the few vertices whose
// triangles reach over a lower road – the grid cannot draw a step narrower than its cell), and (3) where the ground then
// falls away beside a road's edge, a plain retaining wall stands from the edge down to it (skirtStrips) instead of a
// hole under the road. Real heights stay: nothing is flattened, nothing raised.
//
// Pure functions (no three.js): test/roadground.test.js.

// The nearest lap sample to (x, z) that is at least `gap` samples along the lap from s0 (another stretch of the track,
// not the same bend) – from a SpatialGrid of map3d.js (cell, map, key). → [sample, distance] or null
export function otherSection(grid, x, z, s0, n, gap, rings = 2) {
  const cx = Math.floor(x / grid.cell), cz = Math.floor(z / grid.cell);
  let best = null, bd = Infinity;
  for (let i = -rings; i <= rings; i++) for (let j = -rings; j <= rings; j++) {
    const list = grid.map.get(grid.key(cx + i, cz + j)); if (!list) continue;
    for (const s of list) {
      const di = Math.abs(s.i - s0.i); if (Math.min(di, n - di) < gap) continue;
      const dx = s.p.x - x, dz = s.p.z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = s; }
    }
  }
  return best ? [best, Math.sqrt(bd)] : null;
}

// Height between two roads: y0 held by the nearer one e0 metres beyond its kept edge, y1 by the other e1 metres beyond
// its own. Each road's height at its own edge, eased (flat at both edges, steepest midway) in between – continuous where
// the nearest road changes (e0 = e1 there, whichever is "nearer").
export function joinHeight(y0, e0, y1, e1) {
  const a = Math.max(0, e0), b = Math.max(0, e1);
  if (a + b < 1e-6) return Math.min(y0, y1);
  const t = a / (a + b), k = t * t * (3 - 2 * t);
  return y0 + (y1 - y0) * k;
}

// Points across every lap sample's tarmac (edge to edge, every `step` m, and both edges) with the road's height there.
// edgeOf(s, ±1) = the measured left (+) / right (−) edge offsets. → Float64Array [x, z, y, …]
export function roadProbes(samples, edgeOf, step = 1.5) {
  const out = [];
  for (const s of samples) {
    const L = edgeOf(s, 1), R = edgeOf(s, -1), m = Math.max(1, Math.ceil((L - R) / step));
    for (let k = 0; k <= m; k++) { const o = R + ((L - R) * k) / m; out.push(s.p.x + s.nor.x * o, s.p.z + s.nor.z * o, s.p.y); }
  }
  return Float64Array.from(out);
}

// The drawn height of a regular grid ((nx + 1) × (nz + 1) vertices, y at pos[k * 3 + 1]) at (x, z), and the grid's
// triangle there: a-e-b / b-e-f (a = i,j; b = i+1,j; e = i,j+1; f = i+1,j+1) as scenery.js builds it. → [y, k1, k2, k3]
export function gridTri(pos, G, x, z) {
  const fi = ((x - G.x0) / G.W) * G.nx, fj = ((z - G.z0) / G.H) * G.nz;
  const i = Math.max(0, Math.min(G.nx - 1, Math.floor(fi))), j = Math.max(0, Math.min(G.nz - 1, Math.floor(fj))), u = fi - i, v = fj - j;
  const a = j * (G.nx + 1) + i, b = a + 1, e = a + G.nx + 1, f = e + 1, y = (k) => pos[k * 3 + 1];
  return u + v <= 1 ? [y(a) + (y(b) - y(a)) * u + (y(e) - y(a)) * v, a, b, e] : [y(f) + (y(e) - y(f)) * (1 - u) + (y(b) - y(f)) * (1 - v), f, e, b];
}

// Lowers the grid's vertices whose triangles stand above a road probe (drawn height over road − drop + slack): each
// offending triangle's vertices that are above road − drop come down to it. A few passes (a lowered vertex can leave a
// neighbour's triangle still over another probe). Nothing is raised. Mutates pos; → Map vertex → height before.
export function clearRoads(pos, G, probes, { drop = 0.35, slack = 0.1, passes = 6 } = {}) {
  const before = new Map();
  for (let p = 0; p < passes; p++) {
    let n = 0;
    for (let q = 0; q < probes.length; q += 3) {
      const x = probes[q], z = probes[q + 1], cap = probes[q + 2] - drop;
      if (x < G.x0 || z < G.z0 || x > G.x0 + G.W || z > G.z0 + G.H) continue;
      const [y, ...ks] = gridTri(pos, G, x, z);
      if (y <= cap + slack) continue;
      for (const k of ks) if (pos[k * 3 + 1] > cap) { if (!before.has(k)) before.set(k, pos[k * 3 + 1]); pos[k * 3 + 1] = cap; n++; }
    }
    if (!n) break;
  }
  return before;
}

// Retaining walls along the tarmac's edges where the drawn ground beside the edge (groundAt, at 0.3 and 1.5 m out) lies
// more than `min` below the road: a vertical strip from the road's surface (+ lift) down to `below` under that ground.
// skip(x, z, s): no wall there (a tunnel's own walls; over another stretch's tarmac – a bridge's sides must not wall
// off the road under it). → { pos: number[], nor: number[], idx: number[], n: walls' samples }
export function skirtStrips(samples, edgeOf, groundAt, { min = 0.8, lift = 0.06, below = 0.3, skip = null } = {}) {
  const pos = [], nor = [], idx = [], N = samples.length;
  let count = 0;
  for (const side of [1, -1]) {
    const pts = samples.map((s) => {
      const e = edgeOf(s, side), x = s.p.x + s.nor.x * e, z = s.p.z + s.nor.z * e;
      const g = Math.min(groundAt(s.p.x + s.nor.x * (e + side * 0.3), s.p.z + s.nor.z * (e + side * 0.3)), groundAt(s.p.x + s.nor.x * (e + side * 1.5), s.p.z + s.nor.z * (e + side * 1.5)));
      const top = s.p.y + lift, deep = top - g > min && !(skip && skip(x, z, s));
      return { x, z, top, bot: g - below, deep, nx: s.nor.x * side, nz: s.nor.z * side };
    });
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[(i + 1) % N];
      if (!a.deep && !b.deep) continue;
      if (Math.hypot(b.x - a.x, b.z - a.z) > 8) continue;   // (the lap's seam or a gap in the samples)
      // (both ends down to the ground under them: a wall ending at a shallow end is a plain trapezoid, not a sliver
      // from one end's top to the other's foot)
      const v = pos.length / 3;
      pos.push(a.x, a.top, a.z, a.x, Math.min(a.bot, a.top), a.z, b.x, b.top, b.z, b.x, Math.min(b.bot, b.top), b.z);
      for (const p of [a, a, b, b]) nor.push(p.nx, 0, p.nz);
      idx.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
      count++;
    }
  }
  return { pos, nor, idx, n: count };
}

// The shore. Land vertices of the grid were held at the road's height right up to the first sea vertex – and the sea
// floor lies metres under the surface – so beside a road high over the water (Monaco: the tunnel's sea side and the
// chicane, 17 m over the sea surface the elevation model gives) every land vertex poking out into the sea stood up as a
// sharp triangular peak out of the water, a saw-toothed cliff along a coast running across the grid's diagonals. Now
// land (not the road's own band – keep) rises from just over the water (lift) by at most `slope` per metre away from the
// first ring of land round the sea (a chamfer distance over the grid): a bank, its top the road's height where there's room –
// land up to `free` metres over the water (a quay, a beach, a low pier) is left as it is. Nothing is raised.
// seaV / keep: per vertex flags; far (optional): metres added to a vertex's cap (the scenery: its distance from the track
// beyond 40 m – the shore is the track's surroundings' business; far off, the coast keeps the elevation model's own).
// Mutates pos; → Map vertex → height before.
export function shoreCap(pos, nx, nz, cw, ch, seaV, keep, seaY, { lift = 0.4, slope = 1, free = 4, far = null } = {}) {
  const W = nx + 1, N = W * (nz + 1), D = new Float64Array(N).fill(Infinity), dg = Math.hypot(cw, ch);
  for (let k = 0; k < N; k++) if (seaV[k]) D[k] = 0;
  const relax = (k, k2, c) => { if (D[k2] + c < D[k]) D[k] = D[k2] + c; };
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const k = j * W + i;
    if (i > 0) relax(k, k - 1, cw);
    if (j > 0) { relax(k, k - W, ch); if (i > 0) relax(k, k - W - 1, dg); if (i < nx) relax(k, k - W + 1, dg); }
  }
  for (let j = nz; j >= 0; j--) for (let i = nx; i >= 0; i--) {
    const k = j * W + i;
    if (i < nx) relax(k, k + 1, cw);
    if (j < nz) { relax(k, k + W, ch); if (i < nx) relax(k, k + W + 1, dg); if (i > 0) relax(k, k + W - 1, dg); }
  }
  const before = new Map();
  for (let k = 0; k < N; k++) {
    if (seaV[k] || keep[k] || !Number.isFinite(D[k])) continue;
    // (the first ring of land round the sea at the water's edge: a single land vertex out in the sea – a pier or a
    // breakwater narrower than a cell – is a low spit, not a pyramid standing out of the water)
    const cap = seaY + Math.max(free, lift + slope * Math.max(0, D[k] - Math.min(cw, ch))) + (far ? far[k] : 0);
    if (pos[k * 3 + 1] > cap) { before.set(k, pos[k * 3 + 1]); pos[k * 3 + 1] = cap; }
  }
  return before;
}
