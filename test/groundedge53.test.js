// v0.53 ground class edges (ground.js edgeFlagged): the shader's raster keeps each texel's class in bits 0–6 and sets bit 7
// exactly where another class lies within 2 texels (brute force agrees); the one-class shortcut is then safe for the
// 5×5 reconstruction. The shader text: 5×5 Gaussian, shortcut on the flag, candidates from the whole 5×5.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const load = () => import("../src/renderer/ground.js");

test("edge flags: classes kept, bit 7 wherever another class is within 2 texels (square), never beyond 3", async () => {
  const { edgeFlagged } = await load();
  const W = 37, H = 29, R = new Uint8Array(W * H);
  let s = 7; const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) R[y * W + x] = y < 0.37 * x + 6 ? 0 : (x - 25) ** 2 + (y - 20) ** 2 < 20 ? 5 : 4;
  for (let k = 0; k < 15; k++) R[Math.floor(rnd() * W * H)] = 6;   // specks
  R[0] = 255;
  const F = edgeFlagged(R, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, c = R[i];
    const near = (r) => { for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) { const xx = x + a, yy = y + b; if (xx >= 0 && yy >= 0 && xx < W && yy < H && R[yy * W + xx] !== c) return true; } return false; };
    assert.strictEqual(F[i] & 127, Math.min(c, 9), `class at ${x},${y}`);
    // (safe: set wherever another class is within 2; never further than 3 – the flag grows from the texels either side
    // of a boundary)
    if (near(2)) assert.ok(F[i] >= 128, `flag at ${x},${y}`);
    if (F[i] >= 128) assert.ok(near(3), `no flag far from an edge: ${x},${y}`);
  }
  // a uniform raster: no flags
  assert.ok(edgeFlagged(new Uint8Array(100).fill(3), 10, 10).every((v) => v === 3));
});

test("the ground shader: 5×5 Gaussian reconstruction, shortcut only on an unflagged texel, candidates from the 5×5", () => {
  const src = fs.readFileSync(require.resolve("../src/renderer/ground.js"), "utf8");
  assert.match(src, /int gClass\(ivec2 i\) \{ return min\(gTexel\(i\) & 127/);
  assert.match(src, /if \(t0 < 128\) col = gSurface/);
  assert.match(src, /for \(int j = 0; j < 5; j\+\+\) for \(int i = 0; i < 5; i\+\+\)/);
  assert.doesNotMatch(src, /else if \(c00 == c10 && c00 == c01 && c00 == c11\) col = gSurface\(c00, w, sat\);\n\s+else if \(gd > 700\.0\)/, "the v0.52 corner shortcut no longer precedes the near path");
});
