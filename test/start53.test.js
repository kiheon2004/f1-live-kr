// v0.53: a car standing far from its grid slot is drawn where the feed has it when it pulls away from that place
// (startplan.js departsFromFeed) – drawn on its slot it snapped 40–200 m as it moved off (35 of 47 races)
import { test } from "node:test";
import assert from "node:assert";
import { departsFromFeed, DEP_CHECK_MS } from "../src/renderer/startplan.js";

// telemetry: standing until 100 s, then 2 m/s² to 30 m/s; samples every 250 ms
function car(until = 200e3) {
  const t = [], v = [];
  for (let ms = 0; ms <= until; ms += 250) { const s = Math.max(0, ms - 100e3) / 1000; t.push(ms); v.push(Math.min(30, 2 * s) * 3.6); }
  return { t, v };
}
const along = (ms) => { const s = Math.max(0, ms - 100e3) / 1000; return s <= 15 ? s * s : 225 + 30 * (s - 15); };

test("departsFromFeed: a feed that moves off from its standing place with the telemetry → true", () => {
  const pos = (ms) => [500 + along(ms), 20];
  assert.strictEqual(departsFromFeed(car(), 60e3, 0, pos), true);
});
test("departsFromFeed: a stale standing place left in one leap → false (the slot keeps it)", () => {
  const pos = (ms) => (ms < 100e3 + 3000 ? [500, 20] : [500 + 180 + along(ms), 20]);
  assert.strictEqual(departsFromFeed(car(), 60e3, 0, pos), false);
});
test("departsFromFeed: no departure in the data, or no positions → null (unknown)", () => {
  const still = { t: [0, 250, 500, 60e3], v: [0, 0, 0, 0] };
  assert.strictEqual(departsFromFeed(still, 100, 0, () => [0, 0]), null);
  assert.strictEqual(departsFromFeed(car(100e3 + DEP_CHECK_MS - 1000), 60e3, 0, () => [0, 0]), null);
  assert.strictEqual(departsFromFeed(car(), 60e3, 0, () => null), null);
  assert.strictEqual(departsFromFeed(null, 0, 0, () => [0, 0]), null);
});
