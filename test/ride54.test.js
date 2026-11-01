// v0.54 (request §3, §4): the car the cockpit cameras ride in follows the road – it never sinks under it on a climb (the
// ground through the cockpit floor) – and only the dip and the lean are steadied.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rideStep } from "../src/renderer/ride.js";

// a car at v m/s up a road whose grade goes 0 → g over 50 m, drawn at fps for secs (the wall's time) at `rate`× playback
function climb(v, g, rate = 1, fps = 60, secs = 4) {
  let S = null, worst = 0, s = 0;
  for (let i = 0; i < fps * secs; i++) {
    s += (v * rate) / fps;
    const grade = g * Math.min(1, s / 50), y = s < 50 ? (g * s * s) / 100 : g * 25 + g * (s - 50), slope = -Math.atan(grade);
    S = rideStep(S, { y, pitch: slope, roll: 0, slope, x: 0, z: s }, 1 / fps);
    // how far the drawn car is under the road at the front of the tub (1.2 m ahead of its middle)
    const roadFront = y + 1.2 * Math.tan(-slope), carFront = S.y - 1.2 * Math.sin(S.p);
    worst = Math.max(worst, roadFront - carFront);
  }
  return worst;
}
test("the ridden car stays on the road up a 6 % grade at 300 km/h, 1× and 10×", () => {
  for (const rate of [1, 10]) assert.ok(climb(83, 0.06, rate) < 0.02, `rate ${rate}: ${climb(83, 0.06, rate)} m under the road (the cockpit floor is 0.16 m over it)`);
});
test("the dip and the lean are steadied (~0.4 s), not dropped", () => {
  let S = rideStep(null, { y: 0, pitch: 0, roll: 0, slope: 0 }, 1 / 60);
  // a 4 Hz twitch of the dip (±0.01 rad) and the lean
  let peak = 0;
  for (let i = 0; i < 240; i++) { const tw = (Math.floor(i / 15) % 2 ? 1 : -1) * 0.01; S = rideStep(S, { y: 0, pitch: tw, roll: tw, slope: 0 }, 1 / 60); if (i > 60) peak = Math.max(peak, Math.abs(S.p), Math.abs(S.r)); }
  assert.ok(peak < 0.004, `twitch passed through: ${peak}`);
  // a steady dip is reached
  for (let i = 0; i < 300; i++) S = rideStep(S, { y: 0, pitch: 0.02, roll: 0, slope: 0 }, 1 / 60);
  assert.ok(Math.abs(S.p - 0.02) < 1e-3);
});
test("same input after a reset → same pose", () => {
  const a = rideStep(null, { y: 1.5, pitch: 0.03, roll: 0.01, slope: 0.02 }, 0.016), b = rideStep(null, { y: 1.5, pitch: 0.03, roll: 0.01, slope: 0.02 }, 0.5);
  assert.deepEqual(a, b);
});
test("the slope is followed over metres of road, the same at 1× and 10×", () => {
  const run = (rate) => { let S = null, s = 0; const out = []; for (let i = 0; i < 120; i++) { s += (40 * rate) / 60; const slope = s > 20 ? -0.05 : 0; S = rideStep(S, { y: 0, pitch: slope, roll: 0, slope, x: 0, z: s }, 1 / 60); out.push([s, S.p]); } return out; };
  const at = (o, m) => o.find((q) => q[0] >= m)[1];
  for (const m of [40, 60]) assert.ok(Math.abs(at(run(1), m) - at(run(10), m)) < 0.006, `at ${m} m: ${at(run(1), m)} ${at(run(10), m)}`);   // (10×: one step a 6.7 m – the place the grade changes falls inside one)
});
