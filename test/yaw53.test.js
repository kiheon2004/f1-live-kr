// v0.53 heading flips at fixed spots (reports/yaw.md): the raw positions' curve running back between samples that go
// forward (replay.js CarTracks.at), and the heading of a raw-drawn car following positions that step back (heading.js).
const test = require("node:test");
const assert = require("node:assert");
const RK = require("../src/renderer/replay.js");

// 2026 Miami's pit entry, car 41 (t≈5802.5): x in decimetres along the lane at ~60 km/h, then the feed's 36 m leap in 0.18 s
const MIAMI41 = [[5801.299, -354.69], [5801.639, -350.09], [5802.039, -347.19], [5802.299, -344.59], [5802.479, -341.59], [5802.899, -338.69], [5803.08, -302.19], [5803.279, -296.09], [5803.559, -292.79]];
function tracksOf(rows) {
  const tr = new RK.CarTracks();
  for (const [t, x] of rows) tr.push("41", Math.round(t * 1000), [x * 10, 0, 0]);
  return tr;
}

test("raw positions: the curve between two samples that go forward never runs back – a leap after them (2026 Miami pit entry)", () => {
  const tr = tracksOf(MIAMI41), out = [0, 0, 0], vel = [0, 0, 0];
  let worstBack = 0, ahead = -Infinity, minVel = Infinity;
  for (let t = 5801300; t <= 5802899; t += 5) {
    tr.at("41", t, out, vel);
    ahead = Math.max(ahead, out[0]); worstBack = Math.max(worstBack, ahead - out[0]); minVel = Math.min(minVel, vel[0]);
  }
  assert.ok(worstBack <= 1e-6, `ran back ${(worstBack / 10).toFixed(2)} m`);
  assert.ok(minVel >= 0, `velocity along the lane down to ${(minVel * 100).toFixed(1)} m/s`);
});

test("raw positions: ordinary samples keep the same curve (the tangents' limit is not reached)", () => {
  // a car at 50 m/s round a 150 m radius bend, 4 Hz: the limited curve is the plain Catmull-Rom one
  const tr = new RK.CarTracks(), R = 150;
  for (let k = 0; k < 40; k++) { const a = (50 * k * 0.25) / R; tr.push("1", 1000 + k * 250, [R * Math.sin(a) * 10, R * (1 - Math.cos(a)) * 10, 0]); }
  const out = [0, 0, 0];
  let worst = 0;
  for (let t = 2000; t < 9000; t += 37) { tr.at("1", t, out); const a = (50 * (t - 1000)) / 1000 / R, x = R * Math.sin(a) * 10, y = R * (1 - Math.cos(a)) * 10; worst = Math.max(worst, Math.hypot(out[0] - x, out[1] - y)); }
  assert.ok(worst < 1, `off the arc by ${(worst / 10).toFixed(3)} m`);
});

test("raw heading: positions stepping back under a car the telemetry has moving on don't turn it round (Monaco 2025 pit exit, China 2025 pit entry)", async () => {
  const { rawYaw } = await import("../src/renderer/heading.js");
  const fwd = Math.atan2(-2.8, -7.6);   // Monaco #22 at the pit exit, heading down the exit road
  // the feed's positions stepping 1.4 m back in 0.28 s at 36 km/h: velocity reversed
  assert.strictEqual(rawYaw(fwd, 3.6, 9.6, 36), fwd, "kept");
  // a car really reversing (telemetry under 20 km/h) – or no telemetry – faces the way it moves
  assert.ok(Math.abs(rawYaw(fwd, 3.6, 9.6, 8) - Math.atan2(3.6, 9.6)) < 1e-9, "reversing");
  assert.ok(Math.abs(rawYaw(fwd, 3.6, 9.6, null) - Math.atan2(3.6, 9.6)) < 1e-9, "no telemetry");
  // ordinary turning (under 90° from the heading) follows the velocity
  const v = Math.atan2(-7.8, -11.5);
  assert.ok(Math.abs(rawYaw(-83 / 57.3, -7.8, -11.5, 180) - v) < 1e-9, "turning into the lane");
});
