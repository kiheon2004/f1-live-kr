// Buildings on uneven drawn ground: level yards around footprints and a level floor with a plinth (footing.js).
import test from "node:test";
import assert from "node:assert/strict";
const { footing, padPlan, footprintSamples, polyDist } = await import("../src/renderer/footing.js");

test("footing: level ground – floor on it, no plinth", () => {
  const f = footing([2, 2, 2.02, 2.01]);
  assert.ok(Math.abs(f.floor - 2) < 0.05); assert.equal(f.plinth, 0); assert.ok(f.buried < 0.05);
});
test("footing: gentle slope – floor near the high side, plinth to below the low side, nothing floats", () => {
  const f = footing([0, 0.3, 0.6, 0.9]);
  assert.ok(Math.abs(f.floor - 0.75) < 1e-9);          // high side less the 0.15 m seam
  assert.ok(f.foot < 0);                               // the plinth starts under the lowest ground
  assert.ok(f.buried <= 0.15 + 1e-9);
});
test("footing: steep slope – the floor at most a plinth over the low side, never at the top (no floating)", () => {
  const f = footing([0, 2, 4, 6], { plinth: 1.2 });
  assert.equal(f.floor, 1.2); assert.ok(f.buried > 4);   // dug into the slope uphill, as hillside buildings are
  assert.ok(f.floor < f.hi);
});
test("footing: no heights → null", () => { assert.equal(footing([NaN]), null); });

test("footprintSamples covers corners, edges and the inside", () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]], S = footprintSamples(sq);
  assert.ok(S.some(([x, z]) => x === 10 && z === 10));
  assert.ok(S.some(([x, z]) => x > 3 && x < 7 && z > 3 && z < 7));
  assert.ok(S.every(([x, z]) => polyDist(x, z, sq) < 1e-9));
});

// a 10 × 10 grid of 10 m cells on a slope rising 0.1 m per m in x
const grid = { x0: 0, z0: 0, W: 100, H: 100, nx: 10, nz: 10 };
const slope = (x) => x * 0.1;
const hAt = (k) => slope((k % 11) * 10);
const surf = (x, z) => slope(x);
test("padPlan: a building on a slope gets one level yard around it", () => {
  const P = [[42, 42], [58, 42], [58, 58], [42, 58]];
  const r = padPlan(grid, hAt, surf, [P], () => false);
  assert.equal(r.pads, 1); assert.ok(r.targets.size > 0);
  const lv = new Set([...r.targets.values()].map((v) => v.toFixed(3)));
  assert.equal(lv.size, 1);                                         // one height
  const level = [...r.targets.values()][0];
  assert.ok(level > 4.2 && level < 5.8);                            // the middle of the ground under it, not the top or bottom
  for (const k of r.targets.keys()) { const x = (k % 11) * 10, z = Math.floor(k / 11) * 10; assert.ok(polyDist(x, z, P) <= 14.2); }   // only near the footprint (the vertices of the triangles over it)
});
test("padPlan: no yard where it would reach the track (keepOut) or on flat or steep ground", () => {
  const P = [[42, 42], [58, 42], [58, 58], [42, 58]];
  assert.equal(padPlan(grid, hAt, surf, [P], (x) => x >= 60).pads, 0);
  assert.equal(padPlan(grid, () => 1, () => 1, [P], () => false).skipped.flat, 1);
  const cliff = (x) => x * 2;
  assert.equal(padPlan(grid, (k) => cliff((k % 11) * 10), (x) => cliff(x), [P], () => false).skipped.steep, 1);
});
test("padPlan: two yards sharing a vertex outside both footprints – the nearer building's level wins", () => {
  const A = [[22, 42], [38, 42], [38, 58], [22, 58]], B = [[44, 42], [58, 42], [58, 58], [44, 58]];
  const r = padPlan(grid, hAt, surf, [A, B], () => false), ra = padPlan(grid, hAt, surf, [A], () => false);
  const la = [...ra.targets.values()][0];
  const rb = padPlan(grid, hAt, surf, [B], () => false), lb = [...rb.targets.values()][0];
  const XZ = (k) => [(k % 11) * 10, Math.floor(k / 11) * 10];
  for (const k of r.targets.keys()) { const [x, z] = XZ(k), da = polyDist(x, z, A), db = polyDist(x, z, B); if (Math.abs(da - db) > 1e-6) assert.ok(Math.abs(r.targets.get(k) - (da < db ? la : lb)) < 1e-9); }
  assert.ok([...r.targets.values()].some((v) => Math.abs(v - la) < 1e-9));
});
test("padPlan: a yard reaching the tarmac is laid flush at the tarmac's height; one reaching water isn't made", () => {
  const P = [[42, 42], [58, 42], [58, 58], [42, 58]];
  // the tarmac (x ≥ 60) is lower than the middle of the ground under the building
  const r = padPlan(grid, hAt, surf, [P], (x) => (x >= 60 ? "tarmac" : false));
  assert.equal(r.pads, 1);
  const vs = [...r.targets.values()];
  assert.ok(vs.every((v) => Math.abs(v - vs[0]) < 1e-9) && vs[0] >= 6 && vs[0] <= 7);   // the tarmac vertices' mean height (x = 60 / 70 → 6 / 7)
  for (const k of r.targets.keys()) assert.ok((k % 11) * 10 < 60);               // the tarmac itself untouched
  assert.equal(padPlan(grid, hAt, surf, [P], (x) => (x >= 60 ? "water" : false)).pads, 0);
});
test("padPlan: inside a footprint keepOut is asked with the narrow margin (no run-off inside a building)", () => {
  const P = [[42, 42], [58, 42], [58, 58], [42, 58]], asked = [];
  padPlan(grid, hAt, surf, [P], (x, z, inn) => { asked.push(inn); return x >= 50 && !inn ? "tarmac" : false; });
  assert.ok(asked.includes(true) && asked.includes(false));
  const r = padPlan(grid, hAt, surf, [P], (x, z, inn) => (x >= 50 && !inn ? "tarmac" : false));
  assert.ok(r.targets.has(5 * 11 + 5));                                        // the vertex at (50, 50), inside: levelled
});
test("padPlan: a vertex inside a footprint keeps its own building's level over a lower neighbour's yard", () => {
  const A = [[12, 32], [38, 32], [38, 68], [12, 68]], B = [[42, 32], [88, 32], [88, 68], [42, 68]];
  const r = padPlan(grid, hAt, surf, [A, B], () => false), rb = padPlan(grid, hAt, surf, [B], () => false);
  const lb = [...rb.targets.values()][0];
  assert.ok(Math.abs(r.targets.get(4 * 11 + 6) - lb) < 1e-9);    // (60, 40) inside B: B's level, not A's lower one
});
