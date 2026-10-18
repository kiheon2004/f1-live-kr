// How a building meets the drawn ground (pure functions – scenery.js, buildings.js; test/footing.test.js).
//
// Why: buildings stood on the lowest of their corners' groundAt heights. The terrain under a footprint is rarely level –
// the elevation model is ~7 m pixels (z14) and, near a circuit, groundAt eases the track's own height into it over
// 120 m – so the ground on the high side covered the walls (Monza 2026, Map3D.groundDiag: paddock blocks buried by up to
// 3.6 m on ground that is flat in reality – the research note monza_buildings.md §4: "all circuit ground is essentially
// flat"; a 3 m-high block showed only its roof). Raising each building to its highest point instead floats the low side
// and leaves a step against the roads beside it. So, per building, two things:
//   1. padPlan: the terrain grid's vertices around a footprint are levelled to one height (the middle of the ground under
//      it) – a level yard about one grid cell wide, ramping back to the untouched ground over the next cell – except
//      where the ground must stay as it is (the track and its run-off, the pit lane and other mapped tarmac of the
//      circuit, rivers, the sea: keepOut) – a yard reaching the tarmac is laid at the tarmac's height, flush with it,
//      one reaching water isn't made. Slopes steeper than a yard can take (a real hillside) are left alone.
//   2. footing: on whatever ground is left, the building stays level: its floor at the highest ground under it, but at
//      most `plinth` m over the lowest – a plinth (a concrete base) from just below the lowest point up to the floor
//      closes any gap on the low side – and on steeper ground the uphill walls stand in the slope, as hillside
//      buildings are built.

// heights: drawn-terrain heights sampled over a footprint. → { lo, hi, floor, foot, buried, plinth (m of plinth on
// the low side, 0 when none is needed) }
export function footing(heights, { plinth = 1.2, bury = 0.15, sink = 0.4 } = {}) {
  let lo = Infinity, hi = -Infinity;
  for (const h of heights) if (Number.isFinite(h)) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
  if (!Number.isFinite(lo)) return null;
  // (a few cm of the wall in the ground on the high side: no seam where the floor meets it)
  const floor = Math.max(lo, Math.min(hi - bury, lo + plinth));
  return { lo, hi, floor, foot: lo - sink, buried: Math.max(0, hi - floor), plinth: floor - lo > 0.05 ? floor - lo + sink : 0 };
}

// points to sample a footprint at: its corners, every `step` m along its edges, a `grid` m lattice inside
export function footprintSamples(pts, step = 2, grid = 3) {
  const S = pts.map(([x, z]) => [x, z]);
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], n = Math.ceil(Math.hypot(bx - ax, bz - az) / step);
    for (let k = 1; k < n; k++) S.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (let x = x0 + grid / 2; x < x1; x += grid) for (let z = z0 + grid / 2; z < z1; z += grid) if (inside(x, z, pts)) S.push([x, z]);
  return S;
}

export function inside(x, z, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < ((P[j][0] - P[i][0]) * (z - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  return c;
}
function segDist(x, z, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, l = ex * ex + ez * ez, t = l ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l)) : 0;
  return Math.hypot(x - ax - ex * t, z - az - ez * t);
}
// distance from a point to a polygon's outline (0 inside)
export function polyDist(x, z, P) {
  if (inside(x, z, P)) return 0;
  let d = Infinity;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; d = Math.min(d, segDist(x, z, a[0], a[1], b[0], b[1])); }
  return d;
}

// The level yards. grid: { x0, z0, W, H, nx, nz } (the terrain mesh: (nx+1)·(nz+1) vertices, row-major from x0, z0);
// heightAt(k) → the vertex's height; footprints: [[x, z], …][]; keepOut(x, z) → true where the ground must stay;
// surfaceAt(x, z) → the drawn surface's height (the mesh's triangles), to sample the ground under a footprint.
// → { targets: Map(vertex → height), pads: number of yards, skipped: { flat, steep, kept } }
// A vertex is part of a footprint's yard when it lies within a cell's diagonal of the outline (every triangle over the
// footprint has all three corners in the yard – with three quarters of it, a 29 m-deep block at Monza kept a 2.4 m
// slope from the corners left out). A vertex claimed by two yards takes the level of the nearer building (inside a
// footprint: always its own; at the same distance the lower) – the lower one always winning let a neighbour's yard tilt
// a building's own edge triangles (Monza's Hospitality Building kept a 2.4 m fall that way).
export function padPlan(grid, heightAt, surfaceAt, footprints, keepOut, { flat = 0.35, steep = 6, minArea = 12 } = {}) {
  const { x0, z0, W, H, nx, nz } = grid, cw = W / nx, ch = H / nz, reach = Math.hypot(cw, ch) + 0.01;
  const targets = new Map(), inner = new Map(), skipped = { flat: 0, steep: 0, kept: 0 }, why = [];
  let pads = 0;
  for (const [fi, P] of footprints.entries()) {
    if (P.length < 3) continue;
    let a = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += (P[j][0] + P[i][0]) * (P[j][1] - P[i][1]);
    if (Math.abs(a / 2) < minArea) continue;
    const hs = footprintSamples(P).map(([x, z]) => surfaceAt(x, z)).filter(Number.isFinite).sort((p, q) => p - q);
    if (!hs.length) continue;
    const range = hs[hs.length - 1] - hs[0];
    if (range < flat) { skipped.flat++; why[fi] = "flat"; continue; }
    if (range > steep) { skipped.steep++; why[fi] = "steep"; continue; }
    const level = hs[Math.floor(hs.length / 2)];
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (const [x, z] of P) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }
    const i0 = Math.max(0, Math.floor((bx0 - reach - x0) / cw)), i1 = Math.min(nx, Math.ceil((bx1 + reach - x0) / cw));
    const j0 = Math.max(0, Math.floor((bz0 - reach - z0) / ch)), j1 = Math.min(nz, Math.ceil((bz1 + reach - z0) / ch));
    const mine = [], tarmac = [];
    let blocked = false;
    for (let j = j0; j <= j1 && !blocked; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + i * cw, z = z0 + j * ch;
      if (polyDist(x, z, P) > reach) continue;
      // (inside the footprint itself there's no run-off or lane to keep: keepOut is asked with a narrow margin there)
      const ko = keepOut(x, z, inside(x, z, P)), k = j * (nx + 1) + i;
      // (a yard that would reach a river or the sea isn't made at all – half a yard tilts the ground under the building
      // more than none)
      if (ko && ko !== "tarmac") { blocked = true; break; }
      if (ko) tarmac.push(heightAt(k)); else mine.push([k, polyDist(x, z, P)]);
    }
    if (blocked || !mine.length) { skipped.kept++; why[fi] = blocked ? "water" : "all kept"; continue; }
    // A yard reaching the track or the pit lane is laid at the tarmac's own height there (those vertices stay as they
    // are): the building meets the lane flush, as the pit and paddock buildings do – its middle-of-the-ground height
    // would leave a step or a slope against the tarmac. (Not when the tarmac is far off the ground under it.)
    let lv = level;
    if (tarmac.length) { lv = tarmac.reduce((a, b) => a + b, 0) / tarmac.length; if (Math.abs(lv - level) > steep / 2) { skipped.kept++; why[fi] = "tarmac far off"; continue; } skipped.tarmac = (skipped.tarmac || 0) + 1; }
    for (const [k, d] of mine) { const M = d === 0 ? inner : targets, t = M.get(k); if (t == null || d < t.d - 1e-6 || (Math.abs(d - t.d) <= 1e-6 && lv < t.lv)) M.set(k, { lv, d }); }
    why[fi] = { level: +lv.toFixed(2), mid: +level.toFixed(2), range: +range.toFixed(2), vertices: mine.length, tarmac: tarmac.length };
    pads++;
  }
  // (a vertex inside a footprint takes that building's level over a neighbour's yard round it)
  for (const [k, t] of inner) targets.set(k, t);
  for (const [k, t] of targets) targets.set(k, t.lv);
  // (unchanged vertices – already at the level – aren't kept)
  for (const [k, t] of targets) if (Math.abs(t - heightAt(k)) < 0.01) targets.delete(k);
  return { targets, pads, skipped, why };
}
