// v0.45 (request §8): the lowered arm at a big lock. v0.44 measured – and these tests failed on 05bae1f – the sleeve
// up to 47.7 mm into the torso as drawn and the wrist extended ~88° with the wheel at its ±90° stop: with the hand fixed
// on its grip beside the body there is no clear pose past ~±55°. Measured on the car as drawn (the skinned sleeves,
// the gloves on their pivots, the bones), never read back from the plan's own numbers; the limits are the ones v0.42–
// v0.44's tests hold within ±55° (6 mm into the torso; the wrist's daily-use range, Ryu et al. 1991) – now to the stop.
// The wheel's ±90° stop is not changed (car3d setWheels).
const test = require("node:test");
const assert = require("node:assert");

const D = Math.PI / 180;
async function rig(season, team) {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js"), A = await import("../src/renderer/arms.js"), K = await import("../src/renderer/cockpitcheck.js");
  const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), u = car.userData;
  const at = (deg, t = null) => { C.setWheels(car, 0, -(deg * D) / C.STEER_RATIO, t); car.updateMatrixWorld(true); };
  // the wheel held at an angle in the session's time (as the app shows it after a seek, or held there a while)
  let T = 0; const held = (deg) => at(deg, (T += 10000));
  const V = () => new THREE.Vector3(), wp = (o) => o.getWorldPosition(V());
  // one arm as drawn, in the left arm's frame (the right's x negated): the wrist's bend and the forearm's turn from the
  // bones and the glove's pivot (as test/arms.test.js reads them)
  const arm = (a) => {
    const k = a.k, [b0, b1, , b3] = a.bones, S = wp(b0), E = wp(b1), W = wp(b3), G = u.armPlan.geo, m = new THREE.Matrix3().setFromMatrix4(a.hand.matrixWorld);
    const ax = (v) => new THREE.Vector3(v[0] * k, v[1], v[2]).applyMatrix3(m).normalize(), L = (v) => [v.x * k, v.y, v.z];
    const hx = ax(G.hand[0]), hy = ax(G.hand[1]), hz = ax(G.hand[2]), f = W.clone().sub(E).normalize(), up = E.clone().sub(S).normalize(), bend = A.wristBend(L(f), L(hx), L(hy), L(hz));
    const H = L(new THREE.Vector3().crossVectors(up, f).normalize().multiplyScalar(k)), pron = ((A.twistOf(H, L(f), L(hx)) - 90 + 540) % 360) - 180;
    const gloveWrist = new THREE.Vector3(G.wrist[0] - G.grip.c[0], G.wrist[1] - G.grip.c[1], G.wrist[2] - G.grip.c[2]); gloveWrist.x *= k; gloveWrist.applyMatrix4(a.hand.matrixWorld);
    return { S, E, W, flex: bend.flex, rad: bend.rad, pron, gloveWrist };
  };
  return { THREE, C, A, K, car, u, at, held, arm };
}
const CARS = [[2025, "Mercedes"], [2026, "Ferrari"], [2022, "Red Bull Racing"]];

test("arms v0.45: to the ±90° stop the arms stay out of the torso as drawn (≤ 6 mm, the sleeve's root – as within ±55°) and the wrists in the daily-use range – v0.44: 47.7 mm and ~88° of extension at the stop", async () => {
  for (const [season, team] of CARS) {
    const R = await rig(season, team), torso = R.K.cockpitSolids(R.car, ["torso"]), bad = [];
    for (let deg = -90; deg <= 90; deg += 5) {
      R.held(deg);
      const d = Object.entries(R.K.cockpitClash(R.car, torso, 1, { nearest: true, dense: 0.006 })).filter(([k]) => / in /.test(k)).reduce((m, [, v]) => Math.max(m, v), 0);
      if (d > 0.006) bad.push(`${deg}°: ${(d * 1000).toFixed(1)} mm into the torso`);
      for (const a of R.u.arms) {
        const m = R.arm(a);
        if (!(m.flex > -60 && m.flex < 54 && m.rad > -40 && m.rad < 17 && Math.abs(m.pron) < 80)) bad.push(`${deg}° arm ${a.k}: flexion ${m.flex.toFixed(1)}°, radial ${m.rad.toFixed(1)}°, forearm ${m.pron.toFixed(1)}°`);
      }
    }
    assert.deepStrictEqual(bad, [], `${season} ${team}`);
  }
});

test("arms v0.45: nothing the driver handles in the car's body at any angle to the stop – sleeves and gauntlets within 10 mm of the chassis' skin (v0.42's limit within ±55°, 50 mm beyond it), gloves and wheel clear", async () => {
  for (const [season, team] of CARS) {
    const R = await rig(season, team), solids = R.K.cockpitSolids(R.car, ["chassis", "rim", "headrest"]), bad = [];
    for (let deg = -90; deg <= 90; deg += 5) {
      R.held(deg);
      for (const [k, d] of Object.entries(R.K.cockpitClash(R.car, solids, 1, { nearest: true }))) if (/ in /.test(k) && d > (/^(sleeve|gauntlet)/.test(k) ? 0.01 : 0.001)) bad.push(`${deg}°: ${k} ${(d * 1000).toFixed(1)} mm`);
    }
    assert.deepStrictEqual(bad, [], `${season} ${team}`);
  }
});

// a turn into the stop and back out, at 60 frames a second of the session's time: the wheel's angle (deg) by time (ms)
// (90°/s both ways – v0.45 measured in the app at the Fairmont hairpin (2026 lap 1, car 16; run/arms45_b26.log shot 10): ~75°/s
// into the lock, ~60°/s out of it)
const sweep = (t) => (t < 300 ? 0 : t < 1300 ? -90 * (t - 300) / 1000 : t < 2800 ? -90 : t < 3800 ? -90 + 90 * (t - 2800) / 1000 : 0);
test("arms v0.45: turning into the stop and out again in the session's time – the lowered hand regrips without a jump: the wrist moves < 2.5 m/s, the hand back on its grip after, the bones keep their lengths, the arms clear (≤ 6 mm in the torso, ≤ 10 mm in the chassis)", async () => {
  for (const [season, team] of CARS) {
    const R = await rig(season, team), solids = R.K.cockpitSolids(R.car), bad = [];
    const { BODY } = await import("../src/renderer/body3d.js"), L1 = BODY.uarm, prev = new Map(); let freed = 0, worst = 0;
    for (let t = 0; t <= 4400; t += 1000 / 60) {
      const deg = sweep(t); R.at(deg, t);
      for (const a of R.u.arms) {
        const m = R.arm(a), p = prev.get(a);
        if (p) { const v = m.W.distanceTo(p) / (1 / 60); worst = Math.max(worst, v); if (v > 2.5) bad.push(`${t.toFixed(0)} ms ${deg.toFixed(0)}° arm ${a.k}: the wrist at ${v.toFixed(2)} m/s`); }
        prev.set(a, m.W.clone());
        if (Math.abs(m.S.distanceTo(m.E) - L1) > 1e-4) bad.push(`${t.toFixed(0)} ms: upper arm ${m.S.distanceTo(m.E)}`);
        if (a.pose.free) freed++;
        if (!(m.flex > -60 && m.flex < 54 && m.rad > -40 && m.rad < 17 && Math.abs(m.pron) < 80)) bad.push(`${t.toFixed(0)} ms ${deg.toFixed(0)}° arm ${a.k}: wrist ${m.flex.toFixed(0)} / ${m.rad.toFixed(0)} / ${m.pron.toFixed(0)}`);
      }
      if (Math.round(t) % 50 < 17) {
        for (const [k, d] of Object.entries(R.K.cockpitClash(R.car, solids, 2, { nearest: true }))) if (/ in /.test(k) && d > (/torso/.test(k) ? 0.006 : /^(sleeve|gauntlet)/.test(k) ? 0.01 : 0.002)) bad.push(`${t.toFixed(0)} ms ${deg.toFixed(1)}°: ${k} ${(d * 1000).toFixed(1)} mm`);
      }
    }
    assert.ok(freed > 0, `${season} ${team}: the lowered hand never left its grip`);
    assert.deepStrictEqual(bad.slice(0, 40), [], `${season} ${team} (fastest wrist ${worst.toFixed(2)} m/s)`);
    // back straight: the hands on their grips, both arms as the steady pose has them
    for (const a of R.u.arms) { const m = R.arm(a); assert.ok(!a.pose.free && m.gloveWrist.distanceTo(m.W) < 1e-4, `${season} ${team}: arm ${a.k} back on its grip`); }
  }
});

test("arms v0.45: the regrip goes by the session's time – a pause holds it, a seek shows the steady pose, a corner held between the two ways keeps the way it came in with (hysteresis), the same history gives the same arms", async () => {
  const R = await rig(2025, "Mercedes"), L = R.u.arms[0], pose = () => [...L.pose.E, ...L.pose.W].map((v) => +v.toFixed(6)).join();
  // a seek to −70°: the steady pose – the other way, the elbow up and across; without the session's time (v0.44's callers):
  // beside the body
  R.held(-70); const across = pose(); assert.ok(L.pose.E[0] < 0.12, `at −70° the left elbow is across in front of the chest (x ${L.pose.E[0].toFixed(3)})`);
  R.at(-70); assert.ok(L.pose.E[0] > 0.12 && !L.pose.free, "no time: beside the body");
  R.at(0);
  // play into the corner: 0 → −70° in 200 ms, then pause half way through the regrip
  let t = 1000; for (; t <= 1200; t += 20) R.at(-70 * (t - 1000) / 200, t);
  const mid = pose(); assert.ok(L.pose.free, "the hand off its grip during the regrip");
  for (let i = 0; i < 5; i++) R.at(-70, 1200); assert.strictEqual(pose(), mid, "paused: nothing moves");
  for (; t <= 2000; t += 20) R.at(-70, t); assert.strictEqual(pose(), across, "the regrip done: the steady pose");
  // held at −46° (between SWAP.off and SWAP.on) coming out of the corner: still the other way; coming from straight: beside
  for (; t <= 2400; t += 20) R.at(-46, t); assert.ok(L.pose.E[0] < 0.12 && !L.pose.free, "−46° after the lock: still across");
  R.at(-46, t + 5000); assert.ok(L.pose.E[0] > 0.12, "−46° after a seek: beside the body");
  // the same history twice: the same arms
  const run = () => { R.at(0); const out = []; for (let s = 0; s <= 1500; s += 25) { R.at(sweep(s * 2), s); out.push(pose()); } return out.join("|"); };
  assert.strictEqual(run(), run());
  // a rewind (the session's time going back) is a seek
  R.at(-70, 5000); R.at(-70, 4000); assert.strictEqual(pose(), across);
});

test("arms v0.45: the regrip's state (armswap.js) – hysteresis, session time, a pause, a seek, the regrip back as long as the regrip over", async () => {
  const { stepSwap, swapState } = await import("../src/renderer/armswap.js"), { SWAP } = await import("../src/renderer/arms.js");
  const st = swapState();
  assert.strictEqual(stepSwap(st, -(SWAP.on + 5), 0), 1, "a first frame past SWAP.on: the steady pose, across");
  assert.strictEqual(stepSwap(st, -(SWAP.on + 5), 5000), 1);
  assert.strictEqual(stepSwap(st, -(SWAP.on - 5), 20000), 0, "after a gap, between off and on: beside");
  assert.strictEqual(stepSwap(st, -80, null), 0, "no time: beside the body (v0.44's plan)");
  stepSwap(st, 0, 0); let q = 0;
  for (let t = 0; t <= SWAP.ms / 2; t += 10) q = stepSwap(st, -80, t);
  assert.ok(q > 0.3 && q < 0.7, `half way after SWAP.ms / 2: ${q}`);
  for (let t = SWAP.ms / 2; t <= SWAP.ms * 2; t += 10) q = stepSwap(st, -80, t);
  assert.strictEqual(q, 1);
  // unwinding faster than the regrip back: the regrip back still takes SWAP.ms (armSwapPose keeps its far end clean)
  let t = SWAP.ms * 2; for (let d = -80; d <= 0; d += 8) { t += 10; q = stepSwap(st, d, t); }
  assert.ok(q > 0.5 && q < 1, `100 ms into the regrip back: ${q}`);
  for (let k = 0; k < SWAP.ms / 10; k++) { t += 10; q = stepSwap(st, 0, t); } assert.strictEqual(q, 0);
  // the right arm's frame is the mirrored angle: +80 for it is the rising hand – never a regrip
  const r = swapState(); for (let t2 = 0; t2 <= 2000; t2 += 10) assert.strictEqual(stepSwap(r, 80, t2), 0);
});

test("arms v0.45: every cockpit's baked plan has the other way and the regrip's path (tools/arm-plans.js)", async () => {
  const C = await import("../src/renderer/car3d.js"), { ARM_PLANS } = await import("../src/renderer/armplans.js");
  for (const season of [2022, 2025, 2026]) for (const team of ["Red Bull Racing", "Ferrari", "Mercedes", "Cadillac", "Audi"]) for (const date of [null, "2026-05-03", "2026-07-26"]) {
    const b = ARM_PLANS[C.armGeometry(season, team, date).key];
    assert.ok(b?.swap?.rows?.length && b.swap.move?.paths?.length, `${season} ${team} ${date}: no other way / regrip baked`);
  }
});
