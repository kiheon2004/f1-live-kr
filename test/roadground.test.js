// The ground between two stretches of the lap at different heights and at the shore (roadground.js – v0.44 §3, Monaco's
// "sharp rock-like triangles beside the road"), and the development scans that found them (terrainscan.js).
const test = require("node:test");
const assert = require("node:assert");

// map3d.js's SpatialGrid, as the scenery reads it (cell, map, key, nearest)
class Grid {
  constructor(cell = 40) { this.cell = cell; this.map = new Map(); }
  key(i, j) { return (i + 32768) * 65536 + (j + 32768); }
  add(x, z, v) { const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)); if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push(v); }
  nearest(x, z, rings = 2) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell); let best = null, bd = Infinity;
    for (let i = -rings; i <= rings; i++) for (let j = -rings; j <= rings; j++) for (const s of this.map.get(this.key(cx + i, cz + j)) || []) { const d = (s.p.x - x) ** 2 + (s.p.z - z) ** 2; if (d < bd) { bd = d; best = s; } }
    return [best, best ? Math.sqrt(bd) : Infinity];
  }
}
// Two straight stretches running east side by side, 2 m samples: A at z = 0, y = 0 (samples 0–149) and B at z = gap, y = dy
// (samples 300–449) of a 600-sample lap – Monaco's Beau Rivage climb over the harbour-front road in miniature. Road 9 m wide.
function twoRoads(gap = 30, dy = 20) {
  const S = [], g = new Grid();
  const add = (i, x, z, y) => { const s = { i, p: { x, y, z }, tan: { x: 1, z: 0 }, nor: { x: 0, z: 1 }, L: 4.5, R: -4.5 }; S.push(s); g.add(x, z, s); };
  for (let k = 0; k < 150; k++) { add(k, -150 + k * 2, 0, 0); add(300 + k, -150 + k * 2, gap, dy); }
  return { S, g, n: 600 };
}
const edgeKept = (s) => Math.max(s.L, -s.R) + 2;
const held = (s, d) => (d < edgeKept(s) ? s.p.y - 0.35 : Math.min(s.p.y - 0.35, s.p.y));   // (flat elevation model far = road)

test("v0.44: the old nearest-road ground made a sheer step between two stretches; the joined ground is continuous", async () => {
  const { otherSection, joinHeight } = await import("../src/renderer/roadground.js");
  const { S, g, n } = twoRoads(30, 20);
  const old = (x, z) => { const [s, d] = g.nearest(x, z, 2); return held(s, d); };
  const now = (x, z) => {
    const [s, d] = g.nearest(x, z, 2), y = held(s, d);
    if (d < edgeKept(s)) return y;
    const o = otherSection(g, x, z, s, n, 30); if (!o || Math.abs(o[0].p.y - s.p.y) < 0.5) return y;
    const [s1, d1] = o, e1 = d1 - edgeKept(s1);
    return e1 < 0 ? s1.p.y - 0.35 : joinHeight(y, d - edgeKept(s), held(s1, d1), e1);
  };
  // across the gap every 6.7 m (the Monaco grid's cell): the reproduction – one cell carries the whole 20 m
  const step = (f) => { let worst = 0; for (let z = 0; z + 6.7 <= 30; z += 0.5) worst = Math.max(worst, Math.abs(f(0, z + 6.7) - f(0, z))); return worst; };
  assert.ok(step(old) > 19, `old ground: a ${step(old).toFixed(1)} m step within one cell`);
  // joined: the 20 m spread over the 17 m between the kept bands – at most 1.5× the mean slope (smoothstep), per cell
  assert.ok(step(now) < 20 * (6.7 / 17) * 1.55, `joined ground: ${step(now).toFixed(1)} m per cell`);
  // each road's own band stays at its road's height, nothing above either road beside it
  for (const z of [0, 3, 6.4]) assert.strictEqual(now(0, z), -0.35);
  for (const z of [30, 27, 23.6]) assert.strictEqual(now(0, z), 19.65);
  for (let z = 0; z <= 30; z += 0.25) { const y = now(0, z); assert.ok(y >= -0.35 - 1e-9 && y <= 19.65 + 1e-9); }
  // fine continuity: no jump where the nearest road changes (z = 15)
  assert.ok(Math.abs(now(0, 14.99) - now(0, 15.01)) < 0.1);
});

test("v0.44: joinHeight – each road's height at its edge, symmetric where the nearest road changes", async () => {
  const { joinHeight } = await import("../src/renderer/roadground.js");
  assert.strictEqual(joinHeight(0, 0, 20, 10), 0);
  assert.strictEqual(joinHeight(0, 10, 20, 0), 20);
  assert.strictEqual(joinHeight(0, 5, 20, 5), 10);
  for (const e of [1, 3.3, 7]) assert.ok(Math.abs(joinHeight(0, e, 20, 9) - joinHeight(20, 9, 0, e)) < 1e-9);
});

test("v0.44: otherSection finds the other stretch, not the same bend; stacked roads stay apart", async () => {
  const { otherSection } = await import("../src/renderer/roadground.js");
  const { S, g, n } = twoRoads(14, 9);   // the hairpin's roads: 14 m apart, 9 m apart in height
  const [s0] = g.nearest(10, 2, 2), o = otherSection(g, 10, 2, s0, n, 30);
  assert.ok(o && o[0].i >= 300, "the upper stretch");
  assert.ok(Math.abs(o[1] - 12) < 1.1);
  // samples of the same stretch within `gap` along the lap are never "another stretch"
  const same = otherSection(g, 10, 2, s0, n, 400);
  assert.strictEqual(same, null);
  // wrap-around: sample 599 is 1 from sample 0 along the lap
  const g2 = new Grid(); const a = { i: 0, p: { x: 0, y: 0, z: 0 } }, b = { i: 599, p: { x: 2, y: 0, z: 0 } }; g2.add(0, 0, a); g2.add(2, 0, b);
  assert.strictEqual(otherSection(g2, 1, 0, a, 600, 30), null);
  assert.ok(S.length === 300);
});

// A small grid like the scenery's ((nx + 1) × (nz + 1) vertices, y at pos[k * 3 + 1])
function gridOf(nx, nz, cell, yAt) {
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const k = j * (nx + 1) + i, x = i * cell, z = j * cell; pos[k * 3] = x; pos[k * 3 + 1] = yAt(x, z, i, j); pos[k * 3 + 2] = z; }
  return { pos, G: { x0: 0, z0: 0, W: nx * cell, H: nz * cell, nx, nz } };
}

test("v0.44: clearRoads – no triangle stands over a lower road's tarmac; nothing raised, the rest kept", async () => {
  const { clearRoads, gridTri, roadProbes } = await import("../src/renderer/roadground.js");
  const { pokeThrough } = await import("../src/renderer/terrainscan.js");
  // the spike-making input: a road along z = 20 (y 0, 9 m wide) on a 7 m grid whose vertices from z ≥ 28 are held at an
  // upper road's 10 m – the triangles between rise over the lower road's left half
  const { pos, G } = gridOf(20, 10, 7, (x, z) => (z >= 28 ? 9.65 : -0.35));
  const road = []; for (let k = 0; k < 60; k++) road.push({ i: k, p: { x: 10 + k * 2, y: 0, z: 22 }, nor: { x: 0, z: 1 }, L: 4.5, R: -4.5 });
  const probes = roadProbes(road, (s, side) => (side > 0 ? s.L : s.R));
  const at = (x, z) => gridTri(pos, G, x, z)[0];
  assert.ok(pokeThrough(probes, at).n > 0, "the reproduction: the ground pokes through the road");
  const was = Float32Array.from(pos), before = clearRoads(pos, G, probes);
  assert.ok(before.size > 0);
  assert.strictEqual(pokeThrough(probes, at).n, 0);
  for (let k = 0; k < pos.length; k += 3) assert.ok(pos[k + 1] <= was[k + 1]);           // nothing raised
  for (const [k, y0] of before) assert.strictEqual(y0, was[k * 3 + 1]);
  // the upper ground beyond the triangles touching the road keeps its height
  assert.strictEqual(pos[((10 * 21) + 5) * 3 + 1], was[((10 * 21) + 5) * 3 + 1]);
});

test("v0.44: skirtStrips – a wall from the road's edge down to the ground only where it falls away; none over another road", async () => {
  const { skirtStrips } = await import("../src/renderer/roadground.js");
  const road = []; for (let k = 0; k < 20; k++) road.push({ i: k, p: { x: k * 2, y: 5, z: 0 }, nor: { x: 0, z: 1 }, L: 4, R: -4 });
  const ground = (x, z) => (z > 0 ? 0 : 4.65);   // falls away on the left (+z) only
  const w = skirtStrips(road, (s, side) => (side > 0 ? s.L : s.R), ground);
  assert.strictEqual(w.n, 19);   // one side, every segment (the lap's seam >8 m apart is skipped)
  for (let v = 0; v < w.pos.length; v += 12) {
    assert.ok(Math.abs(w.pos[v + 2] - 4) < 1e-9);                 // at the left edge
    assert.ok(Math.abs(w.pos[v + 1] - 5.06) < 1e-9 && Math.abs(w.pos[v + 4] + 0.3) < 1e-9);   // top on the road, foot under the ground
    assert.ok(Math.abs(w.pos[v + 7] - 5.06) < 1e-9 && Math.abs(w.pos[v + 10] + 0.3) < 1e-9);  // both ends down: no sliver
  }
  const none = skirtStrips(road, (s, side) => (side > 0 ? s.L : s.R), ground, { skip: () => true });
  assert.strictEqual(none.n, 0);
});

test("v0.44: shoreCap – a road-high spit out in the sea comes down to the water; quays, the road's band and inland stay", async () => {
  const { shoreCap } = await import("../src/renderer/roadground.js");
  const { gridSpikes } = await import("../src/renderer/terrainscan.js");
  // sea (y −25 floor) for j ≤ 4, land at the road's 17 m over the water beyond; one land vertex out in the sea at (5, 2)
  const seaY = 0, nx = 10, nz = 10, cell = 7;
  const isSea = (i, j) => j <= 4 && !(i === 5 && j === 2);
  const { pos } = gridOf(nx, nz, cell, (x, z, i, j) => (isSea(i, j) ? -25 : j >= 9 ? 2 : 17));
  const seaV = new Uint8Array(121), keep = new Uint8Array(121);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { if (isSea(i, j)) seaV[j * 11 + i] = 1; if (j === 8 && i === 0) keep[j * 11 + i] = 1; }
  const road = (x, z) => ({ y: 17, d: 0, i: 0 });
  const xz = (i, j) => [i * cell, j * cell];
  assert.ok(gridSpikes(pos, nx, nz, 3, 1, xz, road, { minDev: 2.5 }).some((v) => v.i === 5 && v.j === 2 && v.peak), "the reproduction: a pyramid in the sea");
  const was = Float32Array.from(pos), b = shoreCap(pos, nx, nz, cell, cell, seaV, keep, seaY);
  const y = (i, j) => pos[(j * 11 + i) * 3 + 1];
  assert.ok(y(5, 2) <= seaY + 4 + 1e-6, "the spit: at most 4 m over the water");
  assert.ok(y(3, 5) <= seaY + 4 + 1e-6, "the first ring of land");
  for (let j = 5; j < 9; j++) assert.ok(y(3, j + 1) - y(3, j) <= cell * 1.0 + 1e-6, "a bank no steeper than 45°");
  assert.strictEqual(y(0, 8), 17, "the road's own band is kept");
  assert.strictEqual(y(4, 10), 2, "low land (a quay) left as it is");
  for (let k = 0; k < pos.length; k += 3) assert.ok(pos[k + 1] <= was[k + 1]);
  assert.ok(b.size > 0 && !b.has(8 * 11));
  assert.ok(!gridSpikes(pos, nx, nz, 3, 1, xz, road, { minDev: 2.5 }).some((v) => v.peak && v.y > seaY + 4.01));
});

test("v0.44: terrainscan – triScan flags a steep thin triangle rising over the road and an up-facing triangle turned over", async () => {
  const { triScan, gridSteps } = await import("../src/renderer/terrainscan.js");
  const road = () => ({ y: 0, d: 2, i: 7 });
  const P = Float32Array.from([0, 0, 0, 0.5, 6, 0, 1, 0, 0.2,   0, 0, 0, 1, 0, 0, 0, 0, 1]);   // a spike; a face turned down
  const h = triScan(P, null, road, { upFacing: true });
  assert.deepStrictEqual(h.map((q) => q.flag).sort(), ["down", "spike"]);
  const { pos } = gridOf(4, 4, 7, (x, z, i, j) => (j >= 2 ? 20 : 0));
  assert.strictEqual(gridSteps(pos, 4, 4, 3, 1, (i, j) => [i * 7, j * 7], () => ({ y: 0, d: 0 }), { minStep: 10 }).worst, 20);
});
