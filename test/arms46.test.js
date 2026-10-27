// v0.46 (request §2): both hands stay on the wheel at a big lock and the arms cross, as drivers' do at Monaco's Fairmont
// hairpin (Mercedes-AMG F1: the hairpin "requires 180-degrees of steering lock, with the driver's arms having to cross";
// A. Davidson, Sky Sports 2015-05-19 – v044 research/regrip.md). v0.45's regrip (the lowered hand let go and came round at
// shoulder height) was rejected: no source says drivers let go. On 63210e8 the wheel stops at ±90° whatever the corner,
// and at that stop the lowered arm lies ~48 mm in the torso as drawn – these tests fail there.
// Measured on the car as drawn (bones, skinned sleeves, the gloves on their pivots), never read back from the plan's
// own numbers.
const test = require("node:test");
const assert = require("node:assert");

const D = Math.PI / 180;
// the limits these tests hold (every one stated in reports/arms.md):
// - the wrist and forearm: the daily-use range within ±55° of lock (as v0.41–v0.45), past it and in the swing the
//   human ACTIVE range
//   (AAOS: extension 70°, flexion 80°, radial deviation 20° – flexion held to 66°; Zwerus et al. 2017: supination 85–88°, pronation 78–82°) – a small
//   margin each way
// - the torso as drawn: ≤ 6 mm within ±55° (v0.42's sleeve-root allowance), ≤ TORSO_LOCK beyond (the suit and chest
//   giving under the arm – reports/arms.md §4), ≤ TORSO_SWING while the lowered elbow comes across the chest (2–4 frames:
//   the rigid meshes can't pass clean – measured ~50–85 mm at least, arms.js; a stated allowance, not a fit), and the
//   sleeve ≤ SWING_PADS into the head's side pad then
// - the arms against each other (sleeves, gauntlets and gloves of one inside the other's): ≤ ARMS_MM
const WRIST_DAILY = { flex: [-60, 54], rad: [-40, 17], pron: 80 }, WRIST_ACTIVE = { flex: [-72, 66], rad: [-42, 20], pron: [-87, 82] };
const TORSO_LOCK = 0.010, TORSO_SWING = 0.080, SWING_PADS = 0.025, ARMS_MM = 0.004;
async function rig(season, team) {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js"), A = await import("../src/renderer/arms.js"), K = await import("../src/renderer/cockpitcheck.js");
  const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), u = car.userData;
  // the wheel's own angle (deg, + = its left grip up) from the front wheels' steer at a slow hairpin's speed (13 m/s)
  const at = (deg, t = null, speed = 13) => { C.setWheels(car, 0, -(deg * D) / C.STEER_RATIO, t, speed); car.updateMatrixWorld(true); };
  let T = 0; const held = (deg) => at(deg, (T += 10000));
  const V = () => new THREE.Vector3(), wp = (o) => o.getWorldPosition(V());
  const arm = (a) => {
    const k = a.k, [b0, b1, , b3] = a.bones, S = wp(b0), E = wp(b1), W = wp(b3), G = u.armPlan.geo, m = new THREE.Matrix3().setFromMatrix4(a.hand.matrixWorld);
    const ax = (v) => new THREE.Vector3(v[0] * k, v[1], v[2]).applyMatrix3(m).normalize(), L = (v) => [v.x * k, v.y, v.z];
    const hx = ax(G.hand[0]), hy = ax(G.hand[1]), hz = ax(G.hand[2]), f = W.clone().sub(E).normalize(), up = E.clone().sub(S).normalize(), bend = A.wristBend(L(f), L(hx), L(hy), L(hz));
    const H = L(new THREE.Vector3().crossVectors(up, f).normalize().multiplyScalar(k)), pron = ((A.twistOf(H, L(f), L(hx)) - 90 + 540) % 360) - 180;
    const gloveWrist = new THREE.Vector3(G.wrist[0] - G.grip.c[0], G.wrist[1] - G.grip.c[1], G.wrist[2] - G.grip.c[2]); gloveWrist.x *= k; gloveWrist.applyMatrix4(a.hand.matrixWorld);
    // (the glove's pivot on its grip's centre in the wheel: the hand holds its grip)
    const pivot = a.hand.position, gc = G.grip.c, onGrip = Math.hypot(pivot.x - k * gc[0], pivot.y - gc[1], pivot.z - gc[2]);
    return { S, E, W, flex: bend.flex, rad: bend.rad, pron, gloveWrist, onGrip };
  };
  const wheelDeg = () => u.wheel.rotation.z / D;   // (+ = the left grip up, as at())
  return { THREE, C, A, K, car, u, at, held, arm, wheelDeg };
}
const CARS = [[2025, "Mercedes"], [2026, "Ferrari"], [2022, "Red Bull Racing"]];
const torsoMm = (R, torso) => Object.entries(R.K.cockpitClash(R.car, torso, 1, { nearest: true, dense: 0.006 })).filter(([k]) => / in /.test(k)).reduce((m, [, v]) => Math.max(m, v), 0);
const wristOk = (m, deg, swing = false) => (Math.abs(deg) <= 55 && !swing ? m.flex > WRIST_DAILY.flex[0] && m.flex < WRIST_DAILY.flex[1] && m.rad > WRIST_DAILY.rad[0] && m.rad < WRIST_DAILY.rad[1] && Math.abs(m.pron) < WRIST_DAILY.pron
  : m.flex > WRIST_ACTIVE.flex[0] && m.flex < WRIST_ACTIVE.flex[1] && m.rad > WRIST_ACTIVE.rad[0] && m.rad < WRIST_ACTIVE.rad[1] && m.pron > WRIST_ACTIVE.pron[0] && m.pron < WRIST_ACTIVE.pron[1]);

test("arms v0.46: the steering wheel turns past 90° at a slow hairpin – up to its 140° lock (Mercedes: the Fairmont hairpin takes ~180°; 140° the most the arms keep clear over – reports/arms.md) – at the same 10:1 ratio, and no further than 90° at speed; within ±90° nothing changes", async () => {
  const C = await import("../src/renderer/car3d.js"), car = C.makeCar({ teamName: "Mercedes", teamColour: "888888", number: 7, season: 2025 }), u = car.userData;
  const deg = (steer, speed) => { C.setWheels(car, 0, steer, 0, speed); return -u.wheel.rotation.z / D; };
  assert.ok(Math.abs(deg(0.21, 13) - 120.3) < 0.1, `0.21 rad of front-wheel steer at 13 m/s: ${deg(0.21, 13).toFixed(1)}° of the wheel (10:1)`);
  assert.ok(Math.abs(deg(0.4, 13) - 140) < 0.01, `the lock: ${deg(0.4, 13).toFixed(1)}°`);
  assert.ok(Math.abs(deg(0.3, 40) - 90) < 0.01, `at 40 m/s the wheel stops at 90° as before: ${deg(0.3, 40).toFixed(1)}°`);
  for (const sp of [5, 13, 20, 30, 60]) assert.ok(Math.abs(deg(0.06, sp) - 34.38) < 0.01, "a normal corner's angle is unchanged at any speed");
  // (no speed given – callers before v0.46: the ±90° stop as it was)
  C.setWheels(car, 0, 0.3); assert.ok(Math.abs(-u.wheel.rotation.z / D - 90) < 0.01);
});

// (one side for each car, both for one: the right arm is the left's mirror image) into the 140° lock and out again at 60 frames a second of the session's time: the wheel's angle by time (ms) –
// ~93°/s in and out (faster than the ~60–75°/s v0.45 measured at the hairpin in the app)
const sweep = (s) => (t) => s * (t < 300 ? 0 : t < 1800 ? 140 * (t - 300) / 1500 : t < 3300 ? 140 : t < 4800 ? 140 - 140 * (t - 3300) / 1500 : 0);
test("arms v0.46: through a hairpin to the 140° lock and back, both hands hold their grips every frame, the arms cross without going through each other or deep into the torso, the wrists stay in range, the bones keep their lengths", async () => {
  const all = []; let failed = false;
  for (const [season, team, side] of [[2025, "Mercedes", -1], [2025, "Mercedes", 1], [2026, "Ferrari", -1], [2022, "Red Bull Racing", -1]]) {
    const R = await rig(season, team), solids = R.K.cockpitSolids(R.car, ["chassis", "rim", "headrest"]), torso = R.K.cockpitSolids(R.car, ["torso"]), bad = [];
    const { BODY } = await import("../src/renderer/body3d.js"); let maxDeg = 0, worstT = 0, worstA = 0, worstS = 0;
    for (let t = 0; t <= 5400; t += 1000 / 60) {
      R.at(sweep(side)(t), t); const deg = R.wheelDeg(); maxDeg = Math.max(maxDeg, Math.abs(deg));
      for (const a of R.u.arms) {
        const m = R.arm(a);
        if (a.pose.free || m.onGrip > 1e-6 || m.gloveWrist.distanceTo(m.W) > 1e-4) bad.push(`${t.toFixed(0)} ms ${deg.toFixed(0)}° arm ${a.k}: the hand off its grip (${(m.gloveWrist.distanceTo(m.W) * 1000).toFixed(1)} mm)`);
        if (Math.abs(m.S.distanceTo(m.E) - BODY.uarm) > 1e-4 || Math.abs(m.E.distanceTo(m.W) - BODY.farm) > 1e-4) bad.push(`${t.toFixed(0)} ms: a bone's length`);
        if (!wristOk(m, deg, a.pose.swing)) bad.push(`${t.toFixed(0)} ms ${deg.toFixed(0)}° arm ${a.k}: wrist ${m.flex.toFixed(0)} / ${m.rad.toFixed(0)} / forearm ${m.pron.toFixed(0)}`);
      }
      // (every 200 ms – and every frame of the elbow's swing, which lasts ~0.1–0.4 s)
      const swinging = R.u.arms.some((a) => a.pose.swing);
      if (Math.round(t) % 200 < 17 || swinging) {
        const tm = torsoMm(R, torso), lim = Math.abs(deg) <= 55 && !swinging ? 0.006 : swinging ? TORSO_SWING : TORSO_LOCK;
        worstT = Math.max(worstT, tm); if (swinging) worstS = Math.max(worstS, tm); if (tm > lim) bad.push(`${t.toFixed(0)} ms ${deg.toFixed(0)}°${swinging ? " (swing)" : ""}: ${(tm * 1000).toFixed(1)} mm into the torso`);
        for (const [k, d] of Object.entries(R.K.cockpitClash(R.car, solids, 2, { nearest: true }))) if (/ in /.test(k) && d > (/^(sleeve|gauntlet)/.test(k) ? (swinging && /headrest/.test(k) ? SWING_PADS : 0.01) : 0.002)) bad.push(`${t.toFixed(0)} ms ${deg.toFixed(0)}°: ${k} ${(d * 1000).toFixed(1)} mm`);
        const am = R.K.armsOverlap(R.car); worstA = Math.max(worstA, am.depth); if (am.depth > ARMS_MM) bad.push(`${t.toFixed(0)} ms ${deg.toFixed(0)}°: the arms ${(am.depth * 1000).toFixed(1)} mm into each other (${am.what})`);
      }
    }
    if (!(maxDeg > 139.9)) bad.unshift(`the wheel reached only ${maxDeg.toFixed(1)}°`);
    all.push(`${season} ${team} side ${side}: torso worst ${(worstT * 1000).toFixed(1)} mm (swing ${(worstS * 1000).toFixed(1)}), arms ${(worstA * 1000).toFixed(1)} mm, ${bad.length} faults`, ...bad.slice(0, 12));
    if (bad.length) failed = true;
  }
  console.log(all.join("\n"));
  assert.ok(!failed, all.join("\n"));
});

test("arms v0.46: at the 140° lock the arms are crossed – each hand on the far side of the car's middle, the rising forearm over the lowered one", async () => {
  for (const [season, team] of CARS) {
    const R = await rig(season, team); R.held(140);
    const [L, Rr] = R.u.arms.map((a) => R.arm(a));   // (k +1: the left arm – rising at +140; k −1: the right – lowered)
    assert.ok(L.W.x < -0.03 && Rr.W.x > 0.03, `${season} ${team}: wrists at x ${L.W.x.toFixed(3)} / ${Rr.W.x.toFixed(3)}`);
    // (the forearms' crossing: where they pass each other in x, the rising one is higher – nearer the wheel's top)
    const mid = (m, x) => { const f = (x - m.E.x) / (m.W.x - m.E.x); return m.E.y + (m.W.y - m.E.y) * Math.max(0, Math.min(1, f)); };
    assert.ok(mid(L, 0) > mid(Rr, 0), `${season} ${team}: the rising forearm over the lowered one at the middle (${mid(L, 0).toFixed(3)} vs ${mid(Rr, 0).toFixed(3)})`);
  }
});

test("arms v0.46: the same moment gives the same arms – a pause holds them, a seek or a rewind shows the steady pose for the angle, the same history twice gives the same arms", async () => {
  const R = await rig(2025, "Mercedes"), L = R.u.arms[0], P = R.u.arms[1], pose = () => [...L.pose.E, ...L.pose.W, ...P.pose.E, ...P.pose.W].map((v) => +v.toFixed(6)).join();
  R.held(-120); const steady = pose();
  R.at(-120, 50000); R.at(-120, 49000); assert.strictEqual(pose(), steady, "a rewind: the steady pose");
  const run = () => { R.at(0, 100000); const out = []; for (let s = 0; s <= 5400; s += 1000 / 60) { R.at(sweep(-1)(s), 200000 + s); out.push(pose()); } return out; };
  const A1 = run(), A2 = run(); assert.deepStrictEqual(A1, A2, "the same history, the same arms");
  // a pause in the middle of the lowered elbow's swing: nothing moves
  R.at(0, 300000); let t = 300000, mid = null; for (; t < 302000; t += 1000 / 60) { R.at(Math.max(-140, -(t - 300000) * 0.12), t); if (L.pose.swing || P.pose.swing) { mid = pose(); break; } }
  assert.ok(mid, "the swing seen");
  for (let i = 0; i < 5; i++) R.at(Math.max(-140, -(t - 300000) * 0.12), t); assert.strictEqual(pose(), mid, "paused: nothing moves");
});

test("arms v0.46: normal corners unchanged – within ±45° the arms are the beside-the-body plan's (v0.41–v0.45) in the session's time as without it", async () => {
  const R = await rig(2025, "Mercedes"), pose = () => R.u.arms.map((a) => [...a.pose.E, ...a.pose.W].map((v) => +v.toFixed(6)).join()).join("|");
  for (let deg = -45; deg <= 45; deg += 5) { R.at(deg, null, 30); const a = pose(); R.held(deg); assert.strictEqual(pose(), a, `${deg}°`); }
});

test("cockpit check v0.46: the arms against each other – armsOverlap finds an arm pushed through the other and is clear with them apart", async () => {
  const R = await rig(2025, "Mercedes"); R.held(0);
  assert.ok(R.K.armsOverlap(R.car).depth < 1e-6, "straight ahead: apart");
  // (the right arm's bones moved onto the left's: the meshes overlap)
  const [Lb, Rb] = R.u.arms.map((a) => a.bones); Rb[0].position.x = -Rb[0].position.x + 0.0; for (let i = 0; i < 5; i++) Rb[i].position.copy(Lb[i].position).add(new R.THREE.Vector3(-0.02, 0, 0)); R.car.updateMatrixWorld(true);
  assert.ok(R.K.armsOverlap(R.car).depth > 0.02, `overlapping arms: ${R.K.armsOverlap(R.car).depth}`);
});

test("arms v0.46: every cockpit's baked plan has the rising arm to the 140° lock, the lowered arm's other way and the swing between (tools/arm-plans.js)", async () => {
  const C = await import("../src/renderer/car3d.js"), { ARM_PLANS } = await import("../src/renderer/armplans.js"), A = await import("../src/renderer/arms.js");
  for (const season of [2022, 2025, 2026]) for (const team of ["Red Bull Racing", "Ferrari", "Mercedes", "Cadillac", "Audi"]) for (const date of [null, "2026-05-03", "2026-07-26"]) {
    const b = ARM_PLANS[C.armGeometry(season, team, date).key];
    assert.ok(b?.rise?.length === (A.LOCK_MAX - A.PLAN_MAX) / A.PLAN_STEP && b.across?.length && b.swing?.paths?.length, `${season} ${team} ${date}: no rise / across / swing baked`);
  }
});
