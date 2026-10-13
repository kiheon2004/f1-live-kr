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
