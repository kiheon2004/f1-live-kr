// car.js – one fixed step of longitudinal dynamics: DT convergence (generic + real track), envelope respected, power
// flows consistent, a car above its envelope (grip just dropped) brakes back under it.
const test = require("node:test");
const assert = require("node:assert");
const { physics, realTrack } = require("./_physics.js");

let X, car, st;
test.before(async () => { X = await physics(); car = X.carsBase.carBase(2025); st = { m: car.m_min + 50, P: car.P_ice + 120e3, rho: 1.18 }; });

// time of the third lap crossing minus the second (flying laps), with the fractional crossing time inside the step
function flyingLap(tr, prof, dt, env = { ...st, mu: prof.mu }, phase = 0) {
  const c = X.car.makeCarState(0, 60); let t = 0; const tc = [];
  if (phase) { X.car.stepCar(c, tr, prof, car, env, phase); t += phase; }
  while (tc.length < 3) { X.car.stepCar(c, tr, prof, car, env, dt); if (c.crossed) tc.push(t + c.tCross); t += dt; }
  return tc[2] - tc[1];
}

test("DT convergence on the generic track: 50 vs 25 ms lap time < 0.02 s, at several step phases", () => {
  const tr = X.lapline.genericTrack(), p = X.profile.computeProfile(tr, car, st);
  for (const ph of [0, 0.0173, 0.031]) {
    const a = flyingLap(tr, p, 0.05, undefined, ph), b = flyingLap(tr, p, 0.025, undefined, ph);
    assert.ok(Math.abs(a - b) < 0.02, `phase ${ph}: ${a} vs ${b}`);
  }
});

test("DT convergence on a real track shape (2025 British GP lap line from the session cache): 50 vs 25 ms < 0.02 s", async (t) => {
  const tr = await realTrack();
  if (!tr) { t.skip("session cache (2025 British GP race) not present – real-track convergence not checked"); return; }
  const p = X.profile.computeProfile(tr, car, st);
  const a = flyingLap(tr, p, 0.05), b = flyingLap(tr, p, 0.025), c = flyingLap(tr, p, 0.0125);
  console.log(`# Silverstone-shaped lap: DT 50 ms ${a.toFixed(4)} s, 25 ms ${b.toFixed(4)} s, 12.5 ms ${c.toFixed(4)} s`);
  assert.ok(Math.abs(a - b) < 0.02, `${a} vs ${b}`);
  assert.ok(Math.abs(b - c) <= Math.abs(a - b) + 0.005, "differences shrink (or stay) as DT halves");
});

test("a free flying lap of the stepped car matches the envelope's reference lap (same integration) within 0.1 %", () => {
  const tr = X.lapline.genericTrack(), p = X.profile.computeProfile(tr, car, st);
  const lap = flyingLap(tr, p, 0.05);
  assert.ok(Math.abs(lap / p.lapTime - 1) < 1e-3, `${lap} vs ${p.lapTime}`);
});

test("speed never exceeds the envelope and never goes negative; tyre accelerations are finite", () => {
  const tr = X.lapline.genericTrack(), p = X.profile.computeProfile(tr, car, st), env = { ...st, mu: p.mu };
  const c = X.car.makeCarState(0, 0);
  for (let k = 0; k < 4000; k++) {
    X.car.stepCar(c, tr, p, car, env);
    // between two samples the car moves at constant acceleration (v² linear) while vlimAt interpolates v linearly: the
    // bound is the larger of the two neighbouring samples
    const i = Math.floor(c.s / tr.ds) % tr.n, lim = Math.max(p.vb[i], p.vb[(i + 1) % tr.n]);
    assert.ok(c.v >= 0 && c.v <= lim + 1e-6, `step ${k}: v ${c.v} lim ${lim}`);
    assert.ok(Number.isFinite(c.aLong) && Number.isFinite(c.aLat));
    assert.ok(c.aLong < 70 && c.aLong > -70, "aLong " + c.aLong);
  }
});

test("power flows: drive power ≤ available; braking power only while slowing; drive energy over a lap ≈ resistances' work", () => {
  const tr = X.lapline.genericTrack(), p = X.profile.computeProfile(tr, car, st), env = { ...st, mu: p.mu };
  const c = X.car.makeCarState(0, 60); let eD = 0, eB = 0, eRes = 0, t = 0, laps = 0;
  const kd = 0.5 * st.rho * car.CdA;
  while (laps < 2) {
    const v0 = c.v;
    X.car.stepCar(c, tr, p, car, env);
    assert.ok(c.pDrive <= st.P * 1.0001 + 1, "drive ≤ P");
    if (c.pBrake > 0) assert.ok(c.limited, "braking power only while held by the envelope");
    if (laps === 1) { eD += c.pDrive * 0.05; eB += c.pBrake * 0.05; const vm = 0.5 * (v0 + c.v); eRes += (kd * vm ** 3 + X.phys.PHYS.Crr * st.m * 9.80665 * vm) * 0.05; }
    if (c.crossed) laps++;
    t += 0.05;
  }
  // over a closed flying lap (same speed at start/end, closed elevation): drive − brake ≈ drag + rolling work
  assert.ok(Math.abs((eD - eB) / eRes - 1) < 0.03, `drive ${eD / 1e6} MJ − brake ${eB / 1e6} MJ vs resistances ${eRes / 1e6} MJ`);
});

test("a car above its envelope (grip just dropped) brakes at capacity (only slows while over), is reported over its limit, and is back under it by the corner exit", () => {
  const tr = X.lapline.genericTrack(), pHi = X.profile.computeProfile(tr, car, st), pLo = X.profile.computeProfile(tr, car, { ...st, muTyre: 0.85 });
  const pLo2 = X.profile.computeProfile(tr, car, { ...st, muTyre: 0.92 });
  const c = X.car.makeCarState(840, 0); c.v = X.profile.vlimAt(pHi, tr, 840); // braking for the hairpin on the good envelope
  let over = 0, maxDec = 0, last = -1, sawOver = false;
  for (let k = 0; k < 160; k++) {
    const v0 = c.v; X.car.stepCar(c, tr, pLo2, car, { ...st, mu: pLo2.mu });
    maxDec = Math.max(maxDec, (v0 - c.v) / 0.05);
    const i = Math.floor(c.s / tr.ds), lim = Math.max(pLo2.vb[i], pLo2.vb[i + 1]);
    if (c.v > lim + 1e-6) { over++; last = k; assert.ok(c.v <= v0 + 1e-9, "while over its limit the car only slows"); }
    if (c.over > 0) sawOver = true;
  }
  assert.ok(sawOver, "the step reports the car over its limit (for incidents)");
  assert.ok(over > 0, "the scenario starts above the lower envelope");
  assert.ok(maxDec <= car.a_brake_max + 15, "deceleration bounded by the brakes (+ drag): " + maxDec);
  assert.ok(last < 120, "back under the envelope by the corner's exit: last step above " + last);
  void pLo;
});

test("no power: the car slows down and stops (rolling + drag), with no NaN", () => {
  const tr = X.lapline.genericTrack(), p = X.profile.computeProfile(tr, car, st);
  const c = X.car.makeCarState(0, 50); let k = 0;
  while (c.v > 0 && k < 20000) { X.car.stepCar(c, tr, p, car, { ...st, P: 0, mu: p.mu }); k++; assert.ok(Number.isFinite(c.s)); }
  assert.strictEqual(c.v, 0); assert.ok(k < 20000);
});

test("step cost: measured (target ≤ 5 µs per car-step, DESIGN §2)", () => {
  const tr = X.lapline.genericTrack(), p = X.profile.computeProfile(tr, car, st), env = { ...st, mu: p.mu }, c = X.car.makeCarState(0, 60);
  for (let i = 0; i < 20000; i++) X.car.stepCar(c, tr, p, car, env);
  const a = process.hrtime.bigint(), N = 200000; for (let i = 0; i < N; i++) X.car.stepCar(c, tr, p, car, env);
  const us = Number(process.hrtime.bigint() - a) / N / 1000;
  console.log(`# car step: ${us.toFixed(3)} µs`);
  assert.ok(us < 5);
});
