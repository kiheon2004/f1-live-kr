// The wheels' angle (wheelspin.js): the distance gone over the axle's radius – from where the car is on the lap or the
// pit lane, not from the screen's frame clock: still at a pause, in step at any playback speed, the same after a seek
const test = require("node:test");
const assert = require("node:assert");
const load = () => import("../src/renderer/wheelspin.js");
const TAU = Math.PI * 2;
const close = (a, b, eps = 1e-9) => Math.abs(((a - b) % TAU + TAU + TAU / 2) % TAU - TAU / 2) < eps;

test("wheels: angle = distance / radius on the lap; a lap is a whole number of turns (no jump at the line)", async () => {
  const { rollAngle, lapRadius } = await load();
  const L = 5412.3, r = 0.36, rr = lapRadius(r, L);
  assert.ok(Math.abs(rr - r) / r < 1e-3, "the radius barely nudged");
  assert.ok(Math.abs(L / (TAU * rr) - Math.round(L / (TAU * rr))) < 1e-9);
  // d and d/r: 1 m → 1/r rad
  assert.ok(close(rollAngle(10, rr, L) - rollAngle(9, rr, L), 1 / rr));
  // over the line: s = L − 0.5 and s = L + 0.5 one metre apart as everywhere
  assert.ok(close(rollAngle(L + 0.5, rr, L) - rollAngle(L - 0.5, rr, L), 1 / rr));
  assert.ok(close(rollAngle(0.5, r, L), rollAngle(L + 0.5, r, L)), "lap 2 at the same place: the same angle");
});

test("wheels: pause, 0.5/1/2/4× playback, seek – the angle follows the car's place only", async () => {
  const { stepWheel } = await load();
  const L = 4300, r = 0.36, v = 70;   // m/s
  for (const rate of [0.5, 1, 2, 4]) {
    const w = { a: null, t: null }; let t = 100000, s = 1000, a;
    for (let f = 0; f < 120; f++) { t += 16.7 * rate; s += (v * 16.7 * rate) / 1000; a = stepWheel(w, { t, r, along: { d: s, L }, speed: v }); }
    const fresh = stepWheel({ a: null, t: null }, { t, r, along: { d: s, L }, speed: v });
    assert.ok(close(a, fresh), "rate " + rate + ": the same angle as a fresh look at that place");
  }
  // paused: time stands, the place stands – the angle stands (whatever the speed says)
  const w = { a: null, t: null };
  const a0 = stepWheel(w, { t: 5000, r, along: { d: 300, L }, speed: v });
  for (let f = 0; f < 30; f++) assert.strictEqual(stepWheel(w, { t: 5000, r, along: { d: 300, L }, speed: v }), a0);
  // a seek back and forth to the same moment: the same angle
  const at = (t, d) => stepWheel(w, { t, r, along: { d, L }, speed: v });
  const x = at(90000, 2222.2); at(10000, 100); at(400000, 3900);
  assert.strictEqual(at(90000, 2222.2), x);
});

test("wheels off the lap: rolled on by the session's time × speed; nothing at a pause, a seek or a teleport", async () => {
  const { stepWheel, SPIN } = await load();
  const r = 0.36, w = { a: null, t: null };
  stepWheel(w, { t: 0, r, speed: 20 });
  const a1 = stepWheel(w, { t: 500, r, speed: 20, moved: 10 });
  assert.ok(close(a1, 10 / r), "0.5 s at 20 m/s: 10 m");
  assert.strictEqual(stepWheel(w, { t: 500, r, speed: 20, moved: 0 }), a1, "paused");
  assert.strictEqual(stepWheel(w, { t: 500 + SPIN.maxStep * 1000 + 1000, r, speed: 20, moved: 40 }), a1, "a seek forward: no turning made up");
  assert.strictEqual(stepWheel(w, { t: 100, r, speed: 20, moved: 2 }), a1, "back in time");
  const a2 = stepWheel(w, { t: 200, r, speed: 20, moved: 2 });
  assert.ok(close(a2, a1 + 2 / r));
  assert.strictEqual(stepWheel(w, { t: 300, r, speed: 20, moved: 300 }), a2, "a jump of 300 m in 0.1 s: a teleport");
  // standing in the pit box (its place on the lane unchanged): no turning, with the jacks up or not
  const p = { a: null, t: null }, b0 = stepWheel(p, { t: 0, r, along: { d: 211.4, L: null } });
  assert.strictEqual(stepWheel(p, { t: 2400, r, along: { d: 211.4, L: null } }), b0);
});

test("wheels: front and rear their own radius; the smear is the frame's turning (0 paused, capped at a seek)", async () => {
  const { rollAngle, smearOf, SHUTTER } = await load();
  assert.ok(!close(rollAngle(100, 0.353), rollAngle(100, 0.355)), "2026: the rear's radius isn't the front's");
  assert.strictEqual(smearOf(200, 0), 0, "paused");
  assert.ok(Math.abs(smearOf(200, 1) - 200 * SHUTTER) < 1e-9);
  assert.ok(Math.abs(smearOf(200, 4) - 4 * smearOf(200, 1)) < 1e-9, "4× playback: 4× the smear");
  assert.strictEqual(smearOf(200, 1, true), 0, "a seek's jump: none");
});
