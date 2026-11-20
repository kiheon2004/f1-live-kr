// v0.68: a stretch of a circuit with a width of its own (localwidth.js) – Anderson Bridge's 9 m between the trusses.
const test = require("node:test");
const assert = require("node:assert");

// a straight track along +x, 2 m between samples, its normal +z; 12 m wide, the lap line 1 m off the road's middle
function track(n = 200, L = 7, R = -5) { return Array.from({ length: n }, (_, i) => ({ i, p: { x: i * 2, z: 0 }, nor: { x: 0, z: 1 }, L, R, M: 0 })); }
const id = (p) => p;

test("a corridor: inside it the edges are the corridor's, 9 m apart round its own centre line – not the lap line's", async () => {
  const { applyLocalWidths } = await import("../src/renderer/localwidth.js");
  const S = track();
  // the corridor's centre line runs 1.5 m to the +z side of the lap line at one end and 0.5 m at the other (the lap line wanders in it)
  const n = applyLocalWidths(S, [{ a: [100, 1.5], b: [180, 0.5], w: 9, ease: 20 }], id);
  const at = (x) => S[x / 2];
  assert.ok(Math.abs(at(100).L - 6) < 0.02 && Math.abs(at(100).R + 3) < 0.02, "at its start: 1.5 ± 4.5");
  assert.ok(Math.abs(at(180).L - 5) < 0.02 && Math.abs(at(180).R + 4) < 0.02, "at its end: 0.5 ± 4.5");
  for (let x = 100; x <= 180; x += 2) assert.ok(Math.abs(at(x).L - at(x).R - 9) < 0.01, "9 m wide all along");
  assert.deepStrictEqual([at(70).L, at(70).R, at(210).L, at(210).R], [7, -5, 7, -5], "beyond the run-outs: as measured");
  assert.ok(at(90).L < 7 && at(90).L > 6 && at(90).R > -5 && at(90).R < -3, "in the run-out: between the two");
  for (let i = 1; i < S.length; i++) assert.ok(Math.abs(S[i].L - S[i - 1].L) < 0.35 && Math.abs(S[i].R - S[i - 1].R) < 0.35, "no step in an edge (2 m over a 20 m run-out: at most 0.3 m between samples)");
  assert.ok(n === 60 || n === 61, "the samples from 20 m before the corridor to 20 m past it (x 80 … 200)");
});

test("a corridor never cuts into where the field was seen; other parts of the track near its line are left alone", async () => {
  const { applyLocalWidths } = await import("../src/renderer/localwidth.js");
  const S = track();
  applyLocalWidths(S, [{ a: [100, 0], b: [180, 0], w: 9, ease: 20 }], id, (s) => (s.p.x === 140 ? [-5.2, 3] : [-1.1, 1.1]));
  assert.strictEqual(S[70].R, -5.2, "the field was seen 5.2 m out there: the edge stays outside it");
  assert.strictEqual(S[72].R, -4.5);
  // a second pass of the track 30 m off the corridor's line, and one crossing it
  const far = track().map((s) => ({ ...s, p: { x: s.p.x, z: 30 } })), cross = Array.from({ length: 40 }, (_, i) => ({ i, p: { x: 140, z: i * 2 - 40 }, nor: { x: 1, z: 0 }, L: 6, R: -6 }));
  assert.strictEqual(applyLocalWidths(far, [{ a: [100, 0], b: [180, 0], w: 9 }], id), 0);
  assert.strictEqual(applyLocalWidths(cross, [{ a: [100, 0], b: [180, 0], w: 9 }], id), 0);
  assert.strictEqual(applyLocalWidths(track(), null, id), 0); assert.strictEqual(applyLocalWidths(track(), [{ a: null, b: null, w: 9 }], id), 0);
});

test("Marina Bay's Anderson Bridge is listed: 9 m, a corridor 76 m long in the feed's frame", async () => {
  const { LOCAL_WIDTHS } = await import("../src/renderer/localwidth.js");
  const [W] = LOCAL_WIDTHS[61];
  assert.strictEqual(W.w, 9); assert.ok(Math.abs(Math.hypot(W.b[0] - W.a[0], W.b[1] - W.a[1]) - 76) < 1.5);
  assert.deepStrictEqual(Object.keys(LOCAL_WIDTHS), ["61"], "nowhere else");
});
