// Replay positions as per-car typed arrays (archive.flattenTracks) give what the list of samples gave: the same
// positions at any moment, the same lap for drawing the circuit, the same outline (checked on all 54 recorded
// sessions when this was made; here on a generated session).
const test = require("node:test");
const assert = require("node:assert");
const { flattenPositions, flattenTracks } = require("../src/main/archive.js");
const { Replay } = require("../src/renderer/replay.js");

test("positions as typed arrays per car: same positions, lap and outline as the sample list", () => {
  // three cars lapping a 600 m loop at different speeds, two Position messages a second, five samples each
  const lines = [], T0 = Date.parse("2025-07-06T14:00:00Z");
  for (let m = 0; m < 600; m++) {
    const ms = m * 500, list = [];
    for (let k = 0; k < 5; k++) {
      const t = ms - 400 + k * 100, Entries = {};
      for (const [num, v] of [["1", 60], ["44", 58], ["16", 0.5]]) {
        const a = (t / 1000) * (v / 95.5);
        if (num === "16" && t > 150000) continue;   // a car that stops sending
        Entries[num] = { X: Math.round(Math.cos(a) * 955), Y: Math.round(Math.sin(a) * 955), Z: 12 };
      }
      list.push({ Timestamp: new Date(T0 + t).toISOString(), Entries });
    }
    lines.push([ms, { Position: list }]);
  }
  const a = new Replay({ topics: { Position: flattenPositions(lines) }, duration: 300000 });
  const b = new Replay({ topics: { PositionTracks: flattenTracks(lines) }, duration: 300000 });
  for (let t = 0; t <= 300000; t += 3700) assert.deepStrictEqual(b.positionsAt(t), a.positionsAt(t), `at ${t}`);
  assert.ok(a.lapShape()?.length > 30); assert.deepStrictEqual(b.lapShape(), a.lapShape());
  assert.deepStrictEqual(b.trackOutline(), a.trackOutline());
  assert.ok(b.carPoints(1000).length <= 1100 && b.carPoints(1000).length > 500);
});

test("live smoothed tracks: past the last sample a car keeps its place (still) for up to 4 s, as its drawn position does", async () => {
  const { smoothedTracks } = await import("../src/renderer/smooth.js");
  const { CarTracks } = require("../src/renderer/replay.js");
  // a circle of 1 km, samples every metre; the car stands at s ≈ 100 m, positions at 4 Hz
  const R = 1000 / (2 * Math.PI), n = 1000, samples = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    samples.push({ i, p: { x: R * Math.cos(a), y: 0, z: R * Math.sin(a) }, tan: { x: -Math.sin(a), z: Math.cos(a) }, nor: { x: -Math.cos(a), z: -Math.sin(a) }, L: 6, R: -6 });
  }
  const world = { samples, center: { x: 0, y: 0, z: 0 }, grid: { nearest: (x, z) => [samples.reduce((b, q) => ((q.p.x - x) ** 2 + (q.p.z - z) ** 2 < (b.p.x - x) ** 2 + (b.p.z - z) ** 2 ? q : b))] } };
  const a = (100 / n) * 2 * Math.PI, N = 40, t = new Float64Array(N), x = new Float32Array(N), y = new Float32Array(N), z = new Float32Array(N);
  for (let k = 0; k < N; k++) { t[k] = 10000 + k * 250; x[k] = (R * Math.cos(a)) / 0.1; y[k] = -(R * Math.sin(a)) / 0.1; }
  const src = { isLive: true, car: {}, tracks: { cars: { 1: { t, x, y, z, n: N } } } };
  const sm = smoothedTracks(src, world, CarTracks);
  sm.update(1e9);
  const last = t[N - 1] + 600;   // (live state is read 600 ms back)
  const at = sm.state("1", last - 1000);
  assert.ok(at && Math.abs(at.s - 100) < 1.5, "on its place before the last sample");
  const held = sm.state("1", last + 1000);
  assert.ok(held, "held a second past the last sample");
  assert.ok(Math.abs(held.s - at.s) < 0.5 && held.vs === 0);
  assert.strictEqual(sm.state("1", last + 5000), null, "not past 4 s");
});
