// Development scan for spiky ground beside the road (v0.44, the user's "sharp rock-like triangles at Monaco"): pure
// functions over vertex arrays, no three.js – Map3D.terrainScan() feeds them the built meshes, test/terrainscan.test.js
// checks them on small made-up grids.
//
// roadAt(x, z) → { y, d, i } of the nearest lap sample: its road height, the distance (m) beyond the tarmac's
// edge (negative on it) and the sample's index – or null when the track is far.

// Vertices of a regular height grid ((nx + 1) × (nz + 1), row-major, y at pos[k * stride + off]) that stand out of
// their 8 neighbours: |y − median of the neighbours| > minDev (m), near the road. A spike is a vertex above (or a pit
// below) all its neighbours by much – what a single wrong sample or a wrongly snapped height makes.
export function gridSpikes(pos, nx, nz, stride, off, xz, roadAt, { maxD = 40, minDev = 2.5 } = {}) {
  const out = [], y = (i, j) => pos[(j * (nx + 1) + i) * stride + off], nb = new Float64Array(8);
  for (let j = 1; j < nz; j++) for (let i = 1; i < nx; i++) {
    const [x, z] = xz(i, j), r = roadAt(x, z);
    if (!r || r.d > maxD) continue;
    let n = 0, lo = Infinity, hi = -Infinity;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if (a || b) { const v = y(i + a, j + b); nb[n++] = v; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const s = Array.from(nb).sort((p, q) => p - q), med = (s[3] + s[4]) / 2, v = y(i, j), dev = v - med;
    if (Math.abs(dev) < minDev) continue;
    // a peak or a pit: beyond every neighbour (a straight slope or a step is not a spike)
    const peak = v > hi, pit = v < lo;
    out.push({ i, j, x, z, y: v, med, dev, peak, pit, road: r.y, above: v - r.y, d: r.d, s: r.i });
  }
  return out.sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev));
}

// Triangles of a mesh (world-space positions, optional index) near the road, measured: height of the highest corner over
// the road, how steep (the normal's y), how thin (longest edge² over twice the area), facing down. `flag` says what
// makes it suspicious: "spike" – steep, thin and reaching more than minRise over the road beside it; "down" – an
// up-facing surface turned over (a fold); "thin" – a sliver more than 30× long as wide that is also steep.
export function triScan(P, index, roadAt, { maxD = 40, minRise = 1.5, upFacing = false } = {}) {
  const n = index ? index.length / 3 : P.length / 9, out = [];
  const v = (t, c) => (index ? index[t * 3 + c] : t * 3 + c) * 3;
  for (let t = 0; t < n; t++) {
    const a = v(t, 0), b = v(t, 1), c = v(t, 2);
    const cx = (P[a] + P[b] + P[c]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3, r = roadAt(cx, cz);
    if (!r || r.d > maxD) continue;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
    const Nx = uy * wz - uz * wy, Ny = uz * wx - ux * wz, Nz = ux * wy - uy * wx, A2 = Math.hypot(Nx, Ny, Nz);
    if (A2 < 1e-9) continue;
    const ny = Ny / A2, e = Math.max(ux * ux + uy * uy + uz * uz, wx * wx + wy * wy + wz * wz, (P[c] - P[b]) ** 2 + (P[c + 1] - P[b + 1]) ** 2 + (P[c + 2] - P[b + 2]) ** 2);
    const top = Math.max(P[a + 1], P[b + 1], P[c + 1]), low = Math.min(P[a + 1], P[b + 1], P[c + 1]), rise = top - r.y, thin = e / A2;
    let flag = null;
    if (upFacing && ny < -0.05) flag = "down";
    else if (rise > minRise && Math.abs(ny) < 0.45 && thin > 4 && top - low > minRise) flag = "spike";
    else if (thin > 30 && Math.abs(ny) < 0.6 && top - low > 0.5) flag = "thin";
    if (flag) out.push({ t, flag, cx, cz, top, low, rise, ny, thin, road: r.y, d: r.d, s: r.i, v: [a, b, c].map((k) => [P[k], P[k + 1], P[k + 2]]) });
  }
  return out;
}

// Road probes ([x, z, roadY, …] – roadground.js roadProbes) where the drawn ground stands above the road less `drop`
// (the ground is laid 0.35 m under the tarmac) by more than `slack`: the terrain poking through the road. → count, worst
export function pokeThrough(probes, heightAt, { drop = 0.35, slack = 0.1 } = {}) {
  let n = 0, worst = 0, at = null;
  for (let q = 0; q < probes.length; q += 3) {
    const over = heightAt(probes[q], probes[q + 1]) - (probes[q + 2] - drop);
    if (over > slack) { n++; if (over > worst) { worst = over; at = [probes[q], probes[q + 1]]; } }
  }
  return { n, worst, at };
}

// Grid edges (row, column and the triangles' diagonal) near the road whose ends differ by more than minStep metres: the
// sheer faces of the terrain. → count, steepest
export function gridSteps(pos, nx, nz, stride, off, xz, roadAt, { maxD = 40, minStep = 5 } = {}) {
  const y = (i, j) => pos[(j * (nx + 1) + i) * stride + off];
  let n = 0, worst = 0, at = null;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const [x, z] = xz(i, j), r = roadAt(x, z);
    if (!r || r.d > maxD) continue;
    for (const [a, b] of [[y(i, j), y(i + 1, j)], [y(i, j), y(i, j + 1)], [y(i + 1, j), y(i, j + 1)]]) {
      const d = Math.abs(a - b);
      if (d > minStep) { n++; if (d > worst) { worst = d; at = [x, z]; } }
    }
  }
  return { n, worst, at };
}
