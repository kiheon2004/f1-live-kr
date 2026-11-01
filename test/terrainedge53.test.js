// v0.53 terrain grid reads (scenery.js gridReader): inside the grid the triangles' heights as before; beyond it the edge's
// height, never the edge triangle's slope carried on (buildings at the map's edge stood tens of metres off the ground)
const test = require("node:test");
const assert = require("node:assert");

test("inside: exact on vertices, linear across a triangle; outside: held at the edge", async () => {
  const { gridReader } = await import("../src/renderer/scenery.js");
  const nx = 4, nz = 4, ext = { x0: 0, z0: 0 }, W = 40, H = 40, arr = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) arr[j * (nx + 1) + i] = i * 10 + j;   // a plane: 1 m per m in x, 0.1 in z
  const at = gridReader(arr, 1, 0, ext, W, H, nx, nz);
  for (const [x, z] of [[0, 0], [10, 20], [35, 5], [40, 40], [17.3, 28.1]]) assert.ok(Math.abs(at(x, z) - (x + z / 10)) < 1e-4, `plane at ${x},${z}`);
  assert.ok(Math.abs(at(60, 20) - at(40, 20)) < 1e-6, "beyond +x: the edge's height");
  assert.ok(Math.abs(at(-30, 20) - at(0, 20)) < 1e-6, "beyond −x");
  assert.ok(Math.abs(at(20, 90) - at(20, 40)) < 1e-6, "beyond +z");
  assert.ok(Math.abs(at(-10, -10) - at(0, 0)) < 1e-6, "beyond a corner");
});
