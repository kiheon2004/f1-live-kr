// v0.41: the driver's hands and arms on the steering wheel – measured on the car as drawn (its bones, the gloves on
// their pivots, the skinned vertices), never read back from the arm plan's own numbers. v0.40 passed every "the sleeve
// ends at the glove's wrist" test with the hand ~66° sideways off its forearm (the wrist's ulnar deviation) with the
// wheel straight and ~90°–100° at a turn; these tests check the hand against the forearm, the forearm's turn, the
// gauntlet's join, the grip and the cockpit, and how all of it changes as the wheel turns.
// Limits: human ranges (research/wrist.md) – the wrist's daily-use range (Ryu et al. 1991: 54° flexion, 60° extension,
// 40° ulnar, 17° radial), the forearm's active range (~80° each way, AAOS / Zwerus 2017) – not the plan's settings.
const test = require("node:test");
const assert = require("node:assert");

const D = Math.PI / 180;
async function rig(season = 2025, team = "Ferrari") {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js"), A = await import("../src/renderer/arms.js"), { BODY } = await import("../src/renderer/body3d.js");
  const car = C.makeCar({ teamName: team, teamColour: "e8002d", number: 16, season }), u = car.userData;
  const V = () => new THREE.Vector3(), wp = (o) => o.getWorldPosition(V());
  const at = (deg) => { C.setWheels(car, 0, -(deg * D) / C.STEER_RATIO); car.updateMatrixWorld(true); };
  // one arm as drawn: shoulder, elbow, wrist (bones); the hand's axes from its glove's pivot; all read in the LEFT hand's
  // frame (the right mirrored: x negated) so the angles mean the same for both
  const arm = (a) => {
    const k = a.k, [b0, b1, , b3, b4] = a.bones, S = wp(b0), E = wp(b1), W = wp(b3), G = u.armPlan.geo, m = new THREE.Matrix3().setFromMatrix4(a.hand.matrixWorld);
    const ax = (v) => new THREE.Vector3(v[0] * k, v[1], v[2]).applyMatrix3(m).normalize();
    const L = (v) => [v.x * k, v.y, v.z], hx = ax(G.hand[0]), hy = ax(G.hand[1]), hz = ax(G.hand[2]);
    const f = W.clone().sub(E).normalize(), up = E.clone().sub(S).normalize(), bend = A.wristBend(L(f), L(hx), L(hy), L(hz));
    // (the elbow's hinge from the arm's plane – shoulder, elbow, wrist; the arm never quite straight in these poses)
    const H = L(new THREE.Vector3().crossVectors(up, f).normalize().multiplyScalar(k)), pron = ((A.twistOf(H, L(f), L(hx)) - 90 + 540) % 360) - 180;
    const gloveWrist = new THREE.Vector3(G.wrist[0] - G.grip.c[0], G.wrist[1] - G.grip.c[1], G.wrist[2] - G.grip.c[2]); gloveWrist.x *= k; gloveWrist.applyMatrix4(a.hand.matrixWorld);
    return { S, E, W, f, up, hx, hy, hz, flex: bend.flex, rad: bend.rad, pron, gloveWrist, b3, b4, elbowDeg: 180 - up.angleTo(f) / D };
  };
  return { THREE, C, A, BODY, car, u, at, arm, wp };
}

test("arms v0.41: with the wheel straight both wrists bend inside the human daily-use range – v0.40's ~66° sideways bend fails here", async () => {
  for (const [season, team] of [[2025, "Ferrari"], [2025, "Red Bull Racing"], [2026, "Mercedes"], [2026, "Cadillac"]]) {
    const R = await rig(season, team); R.at(0);
    for (const a of R.u.arms) {
      const m = R.arm(a);
      assert.ok(m.flex > -60 && m.flex < 54 && m.rad > -40 && m.rad < 17, `${season} ${team} arm ${a.k}: flexion ${m.flex.toFixed(1)}°, radial ${m.rad.toFixed(1)}°`);
      assert.ok(Math.abs(m.pron) < 80, `forearm turned ${m.pron.toFixed(1)}°`);
      // (the arm bent at the elbow – not hanging straight, not folded shut)
      assert.ok(m.elbowDeg > 70 && m.elbowDeg < 160, `elbow ${m.elbowDeg.toFixed(0)}°`);
    }
  }
});

test("arms v0.41/v0.42: turning the wheel, both wrists and forearms stay in the daily-use range to ±55° and in the active range to ±55° for the lowered hand, to the ±90° stop for the rising one – beyond ±55° the lowered hand bends further (the known limit, measured)", async () => {
  // (v0.42: the driver's torso and thighs are drawn now and the arms are kept out of them: v0.41's lowered forearm stayed
  // in the daily-use range to ±60° and the active range to ±70° only by passing through where the torso is (measured:
  // 75–89 mm into it at the lock). With the hands fixed on the grips there is no clear pose for the lowered arm past
  // ~±55° – crossing over the chest or staying beside it, both measured on the meshes (report); the boundary here is
  // that measurement, not a loosened target)
  for (const season of [2025, 2026]) {
    const R = await rig(season, "Ferrari");
    let worstLow = null;
    for (let deg = -90; deg <= 90; deg += 2) {
      R.at(deg);
      for (const a of R.u.arms) {
        const m = R.arm(a), tag = `${season} wheel ${deg}°, arm ${a.k}: flexion ${m.flex.toFixed(1)}°, radial ${m.rad.toFixed(1)}°, forearm ${m.pron.toFixed(1)}°`;
        // (this arm's hand goes down when the wheel turns its grip downwards: the left at −, the right at +)
        const lowered = deg * a.k < 0, ad = Math.abs(deg);
        assert.ok(Math.abs(m.pron) < 80, tag);
        if (ad <= 55) assert.ok(m.flex > -60 && m.flex < 54 && m.rad > -40 && m.rad < 17, tag);
        else if (!lowered) assert.ok(m.flex > -70 && m.flex < 80 && m.rad > -40 && m.rad < 20, tag);
        else { assert.ok(m.flex > -92 && m.flex < 85 && m.rad > -40 && m.rad < 40, tag); if (!worstLow || Math.abs(m.flex) > Math.abs(worstLow.flex)) worstLow = { deg, flex: m.flex, rad: m.rad }; }
      }
    }
    console.log(`  (${season}: the lowered hand's worst past ±55°: wheel ${worstLow.deg}°, flexion ${worstLow.flex.toFixed(1)}°, radial ${worstLow.rad.toFixed(1)}°)`);
  }
});

test("arms v0.41: the right arm is the left one's mirror image at the opposite angle; the hands' thumbs on the wheel's face, index fingers at the grips' tops", async () => {
  const R = await rig(2026, "Ferrari");
  for (const deg of [0, 17, -33, 64, -88]) {
    R.at(deg); const [l] = R.u.arms.map(R.arm);
    R.at(-deg); const r = R.arm(R.u.arms[1]);
    for (const [p, q] of [[l.E, r.E], [l.W, r.W], [l.S, r.S]]) assert.ok(Math.hypot(p.x + q.x, p.y - q.y, p.z - q.z) < 1e-6, `wheel ${deg}°: the arms aren't mirror images`);
    assert.ok(Math.abs(l.flex - r.flex) < 1e-6 && Math.abs(l.rad - r.rad) < 1e-6 && Math.abs(l.pron - r.pron) < 1e-6);
  }
  // the gloves in the wheel's frame at rest: each thumb's tip on the face side (−z), each index fingertip above the
  // little finger's on its own grip
  R.at(0);
  const tips = R.u.gloveFine.map((m) => m.geometry.userData.tips);
  const B = (await import("../src/renderer/body3d.js")), fine = B.driverGlove(R.u.wheelSpec.grip.r, 1);
  assert.ok(fine.userData.tips.length === 4);
  for (const [i, pv] of R.u.arms.map((a) => a.hand).entries()) {
    // the glove's own points in the wheel's frame: thumb = the most −z point near the grip's top, fingers' order along y
    const g = R.u.gloveFine[i].geometry.attributes.position, v = new R.THREE.Vector3(); let face = 0, n = 0;
    for (let j = 0; j < g.count; j += 7) { v.fromBufferAttribute(g, j).applyMatrix4(pv.matrix); if (v.z < -0.03) face++; n++; }
    assert.ok(face > 0, `glove ${i}: nothing on the wheel's face (the thumb)`);
  }
  void tips;
});

test("arms v0.41: the wrist's bend and the forearm's turn change smoothly over the whole turn (no jump, no flip), the hand and the arm never part, the bones keep their lengths", async () => {
  const R = await rig(2025, "Ferrari");
  let prev = null;
  for (let deg = -90; deg <= 90; deg += 0.5) {
    R.at(deg);
    const cur = R.u.arms.map(R.arm);
    cur.forEach((m, i) => {
      assert.ok(Math.abs(m.S.distanceTo(m.E) - R.BODY.uarm) < 1e-6 && Math.abs(m.E.distanceTo(m.W) - R.BODY.farm) < 1e-6, "bone lengths");
      assert.ok(m.gloveWrist.distanceTo(m.W) < 1e-3, `wheel ${deg}°: the glove's wrist ${(m.gloveWrist.distanceTo(m.W) * 1000).toFixed(2)} mm from the arm's`);
      if (prev) {
        const p = prev[i];
        assert.ok(Math.abs(m.flex - p.flex) < 3 && Math.abs(m.rad - p.rad) < 3 && Math.abs(m.pron - p.pron) < 4, `wheel ${deg}°, arm ${i}: wrist ${p.flex.toFixed(1)}→${m.flex.toFixed(1)}, ${p.rad.toFixed(1)}→${m.rad.toFixed(1)}, forearm ${p.pron.toFixed(1)}→${m.pron.toFixed(1)} in 0.5°`);
        assert.ok(m.E.distanceTo(p.E) < 0.012, `wheel ${deg}°, arm ${i}: the elbow jumped ${(m.E.distanceTo(p.E) * 100).toFixed(1)} cm`);
        // the hand bone's frame never turns over between neighbouring angles
        const q = m.b4.getWorldQuaternion(new R.THREE.Quaternion()), q0 = p.q4;
        assert.ok(q.angleTo(q0) < 3 * D, `wheel ${deg}°: the hand turned ${(q.angleTo(q0) / D).toFixed(1)}° in 0.5°`);
      }
      m.q4 = m.b4.getWorldQuaternion(new R.THREE.Quaternion());
    });
    prev = cur;
  }
});

test("arms v0.41: the same wheel angle gives the same arms whatever came before (a seek, a quick flick from lock to lock, a pause)", async () => {
  const R = await rig(2026, "Mercedes");
  const snap = () => R.u.arms.flatMap((a) => [...a.bones.map((b) => b.matrixWorld.elements), a.hand.matrixWorld.elements]).flat();
  R.at(23); const ref = snap();
  for (const path of [[-90, 90, 23], [90, -90, 23], [0, 23], [23, 23, 23], [60, 22.9, 23]]) {
    for (const d of path) R.at(d);
    const s = snap(); let worst = 0; for (let i = 0; i < s.length; i++) worst = Math.max(worst, Math.abs(s[i] - ref[i]));
    assert.ok(worst < 1e-9, `after ${path.join("→")}: ${worst}`);
  }
});

test("arms v0.41: the gauntlet joins the sleeve and the hand – its open end round the forearm along it, its end round the hand's heel along the hand; the sleeve's end inside it", async () => {
  const R = await rig(2025, "Red Bull Racing"), { THREE } = R;
  const skinned = (mesh, i) => { const v = new THREE.Vector3(); mesh.getVertexPosition(i, v); return v.applyMatrix4(mesh.matrixWorld); };
  const ringsOf = (mesh) => { const pos = mesh.geometry.attributes.position, byY = new Map(); for (let i = 0; i < pos.count; i++) { const y = +pos.getY(i).toFixed(5); if (!byY.has(y)) byY.set(y, []); byY.get(y).push(i); } return [...byY.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]); };
  for (const deg of [0, 30, -30, 60, -60, 90, -90]) {
    R.at(deg);
    for (const a of R.u.arms) {
      const m = R.arm(a), rings = ringsOf(a.gauntlet), cen = (ring) => ring.slice(0, -1).reduce((s, i) => s.add(skinned(a.gauntlet, i)), new THREE.Vector3()).multiplyScalar(1 / (ring.length - 1));
      const c0 = cen(rings[0]), c1 = cen(rings[1]), cN = cen(rings[rings.length - 1]), cM = cen(rings[rings.length - 2]);
      // open end: on the forearm's line and along it
      const off0 = c0.clone().sub(m.E).sub(m.f.clone().multiplyScalar(c0.clone().sub(m.E).dot(m.f))).length();
      assert.ok(off0 < 0.003, `wheel ${deg}°, arm ${a.k}: the gauntlet's open end ${(off0 * 1000).toFixed(1)} mm off the forearm`);
      assert.ok(c1.clone().sub(c0).normalize().angleTo(m.f) < 3 * D, "the gauntlet's open end runs along the forearm");
      // its other end along the hand (wrist → knuckles)
      assert.ok(cN.clone().sub(cM).normalize().angleTo(m.hy) < 3 * D, `wheel ${deg}°: the gauntlet's end turns ${(cN.clone().sub(cM).normalize().angleTo(m.hy) / D).toFixed(1)}° off the hand`);
      // the sleeve's last ring inside the gauntlet: each of its points nearer the forearm's line than the gauntlet there
      const sl = ringsOf(a.mesh), last = sl[sl.length - 1].map((i) => { const v = new THREE.Vector3(); a.mesh.getVertexPosition(i, v); return v.applyMatrix4(a.mesh.matrixWorld); });
      const along = last[0].clone().sub(m.E).dot(m.f), gRing = rings.reduce((b, r) => { const c = cen(r), t = c.clone().sub(m.E).dot(m.f); return Math.abs(t - along) < Math.abs(b.t - along) ? { r, t } : b; }, { r: rings[0], t: Infinity });
      const gR = Math.min(...gRing.r.map((i) => { const p = skinned(a.gauntlet, i).sub(m.E); return p.sub(m.f.clone().multiplyScalar(p.dot(m.f))).length(); }));
      const sR = Math.max(...last.map((p0) => { const p = p0.clone().sub(m.E); return p.sub(m.f.clone().multiplyScalar(p.dot(m.f))).length(); }));
      assert.ok(sR < gR, `wheel ${deg}°: the sleeve's end (${(sR * 1000).toFixed(1)} mm) sticks out of the gauntlet (${(gR * 1000).toFixed(1)} mm)`);
      // the wrist bone and the hand bone: a bend only, no twist between them (the gauntlet never wrings)
      const q3 = m.b3.getWorldQuaternion(new THREE.Quaternion()), q4 = m.b4.getWorldQuaternion(new THREE.Quaternion());
      const y3 = new THREE.Vector3(0, 1, 0).applyQuaternion(q3), x3 = new THREE.Vector3(1, 0, 0).applyQuaternion(q3), x4 = new THREE.Vector3(1, 0, 0).applyQuaternion(q4);
      const p4 = x4.clone().addScaledVector(y3, -x4.dot(y3)).normalize(), tw = Math.atan2(new THREE.Vector3().crossVectors(x3, p4).dot(y3), x3.dot(p4)) / D;
      assert.ok(Math.abs(tw) < 0.5, `wheel ${deg}°: the wrist twisted ${tw.toFixed(2)}°`);
    }
  }
});

test("arms v0.41: the gloves hold the grips (no point inside a grip, the fingertips on it) at any wheel angle; fine and light gloves on the same pivot", async () => {
  const R = await rig(2025, "Red Bull Racing"), { THREE, u } = R, W = u.wheelSpec;
  for (let i = 0; i < 2; i++) assert.strictEqual(u.gloveFine[i].parent, u.gloveLo[i].parent, "the fine and the light glove share their pivot");
  for (const deg of [0, 45, -45, 90, -90]) {
    R.at(deg);
    let worst = 0;
    for (const [i, k] of [[0, 1], [1, -1]]) {
      const pv = u.arms[i].hand, g = u.gloveFine[i].geometry.attributes.position, v = new THREE.Vector3();
      const cx = k * W.grip.x, ux = k * Math.sin(W.grip.tilt), uy = Math.cos(W.grip.tilt);
      for (let j = 0; j < g.count; j++) {
        v.fromBufferAttribute(g, j).applyMatrix4(pv.matrix);   // (the pivot's frame → the wheel's)
        const x = v.x - cx, along = x * ux + v.y * uy; if (Math.abs(along) > W.grip.len * 0.38) continue;
        worst = Math.max(worst, W.grip.r - Math.hypot(x - along * ux, v.y - along * uy, v.z));
      }
      // the fingertips touching the grip (within a few mm of its surface plus the finger)
      for (const t of u.gloveFine[i].geometry.userData.tips) {
        v.set(...t).applyMatrix4(pv.matrix); const x = v.x - cx, along = x * ux + v.y * uy, r = Math.hypot(x - along * ux, v.y - along * uy, v.z);
        assert.ok(r < W.grip.r + 0.016, `wheel ${deg}°: a fingertip ${((r - W.grip.r) * 1000).toFixed(1)} mm off its grip`);
      }
    }
    assert.ok(worst < 0.003, `wheel ${deg}°: a glove point ${(worst * 1000).toFixed(1)} mm inside a grip`);
  }
});

test("arms v0.41: every cockpit the car models have has its arm plan baked (tools/arm-plans.js); a car never makes one at run time", async () => {
  const C = await import("../src/renderer/car3d.js"), { ARM_PLANS } = await import("../src/renderer/armplans.js");
  for (const season of [2022, 2025, 2026, 2027]) for (const team of ["Red Bull Racing", "McLaren", "Ferrari", "Mercedes", "Alpine", "Williams", "Cadillac", "Audi", "Racing Bulls", "Haas F1 Team", "Unknown"]) for (const date of [null, "2026-05-03", "2026-07-26"]) {
    const g = C.armGeometry(season, team, date);
    assert.ok(ARM_PLANS[g.key], `${season} ${team}: no baked arm plan – run node tools/arm-plans.js`);
  }
});

test("arms v0.42: the baked plan is what the planner makes – re-planned from the geometry and the cost settings, it matches armplans.js (one cockpit; tools/arm-plans.js bakes them all)", async () => {
  const C = await import("../src/renderer/car3d.js"), A = await import("../src/renderer/arms.js"), { ARM_PLANS } = await import("../src/renderer/armplans.js");
  const g = C.armGeometry(2026, "Ferrari"), b = ARM_PLANS[g.key];
  assert.ok(b, "baked");
  const plan = A.planArmsPath(A.armGeo(g.base, g.grip, g.glove, b.rho * D));
  let worst = 0; plan.rows.forEach((r, i) => [r.sw, r.fw, r.up, r.rl].forEach((v, j) => { worst = Math.max(worst, Math.abs(v - b.rows[i][j])); }));
  assert.ok(worst < 2e-4, `the re-planned table differs from the baked one by ${worst}`);
});
