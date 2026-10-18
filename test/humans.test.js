// v0.39: people up close – the skeleton's bones keep their lengths in every pose, feet on the ground, hands on what
// they hold (wheel gun, tyre, jack, flag, pit wall console), a walk's planted foot never skates.
const test = require("node:test");
const assert = require("node:assert");
const C = () => import("../src/renderer/crew.js");
const B = () => import("../src/renderer/body3d.js");
const D26 = { FZ: 1.7, RZ: -1.7, FR: 0.353, RR: 0.355, FW: 0.28, RW: 0.375, FX: 0.81, RX: 0.7625, W: 1.9 };
const D25 = { FZ: 1.8, RZ: -1.8, FR: 0.36, RR: 0.36, FW: 0.305, RW: 0.405, FX: 0.85, RX: 0.8, W: 2.0 };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// the lowest of a figure's soles and knees (from the joints skeleton() returns)
async function lowest(j) {
  const { BODY, JOINT_R } = await B();
  let low = Infinity;
  for (let i = 0; i < 2; i++) {
    const [, ay] = j.ankle[i], p = j.foot[i], c = Math.cos(p), s = Math.sin(p);
    low = Math.min(low, ay + BODY.footFront * s - BODY.ankle * c, ay - BODY.footBack * s - BODY.ankle * c, j.knee[i][1] - JOINT_R.knee);
  }
  return low;
}

test("the body's proportions: Drillis & Contini fractions of a 1.78 m stature (hip joint 0.53 H, shoulders 0.818 H, head's top ~H)", async () => {
  const { skeleton } = await C(), { BODY, STATURE } = await B();
  assert.strictEqual(+(BODY.thigh / STATURE).toFixed(3), 0.245); assert.strictEqual(+(BODY.uarm / STATURE).toFixed(3), 0.186);
  const j = skeleton({ th: [0, 0], sh: [0, 0], lean: 0, arm: [[0, 0, 0], [0, 0, 0]], head: 0 }).joints;
  assert.ok(Math.abs(j.hip / STATURE - 0.53) < 0.005, `hip ${j.hip}`);
  assert.ok(Math.abs(j.shoulder[0][1] / STATURE - 0.818) < 0.01, `shoulder ${j.shoulder[0][1]}`);
  assert.ok(Math.abs((j.head[1] + 0.116) - STATURE) < 0.02, `head's top ${(j.head[1] + 0.116).toFixed(3)}`);
});

test("no pose stretches a bone: thigh, shin, upper arm and forearm the same length in every pose, blend, walk step and reach", async () => {
  const { skeleton, POSES, blendPose, walkPose, LIMB } = await C(), { BODY } = await B();
  const poses = [...Object.values(POSES), blendPose("ready", "kneel", 0.4), blendPose("jack", "jackDown", 0.7)];
  for (let ph = 0; ph < 7; ph += 0.37) poses.push(walkPose(ph));
  const reaches = [null, [[0.4, 0.5, 0.2, 1], [0.2, 1.9, -0.3, 1]], [[1.5, 0.2, 0, 1], null]];
  for (const P of poses) for (const hands of reaches) {
    const j = skeleton(P, null, hands).joints;
    for (let i = 0; i < 2; i++) {
      const hip = [0, j.hip, (i ? -1 : 1) * BODY.hipZ];
      assert.ok(Math.abs(dist(hip, j.knee[i]) - LIMB.thigh) < 1e-6, "thigh");
      assert.ok(Math.abs(dist(j.knee[i], j.ankle[i]) - LIMB.shin) < 1e-6, "shin");
      assert.ok(Math.abs(dist(j.shoulder[i], j.elbow[i]) - LIMB.uarm) < 1e-6, "upper arm");
      assert.ok(Math.abs(dist(j.elbow[i], j.wrist[i]) - LIMB.farm) < 1e-6 && Math.abs(dist(j.elbow[i], j.grip[i]) - LIMB.reach) < 1e-6, "forearm and fist");
    }
  }
});

test("standing, crouching, kneeling, walking: the lowest sole or knee on the ground (y 0); seated: hips on the seat, feet on the footrest", async () => {
  const { skeleton, POSES, walkPose, blendPose } = await C(), { BODY } = await B();
  const list = [...Object.entries(POSES).filter(([, P]) => P.seat == null), ["blend", blendPose("ready", "kneel", 0.5)]];
  for (let ph = 0; ph < 7; ph += 0.5) list.push(["walk " + ph, walkPose(ph)]);
  for (const [name, P] of list) {
    const low = await lowest(skeleton(P).joints);
    assert.ok(Math.abs(low) < 1e-6, `${name}: lowest point at ${low.toFixed(4)}`);
  }
  for (const name of ["sit", "sitLean"]) {
    const j = skeleton(name).joints;
    assert.strictEqual(j.hip, POSES[name].seat);
    for (let i = 0; i < 2; i++) assert.ok(Math.abs(j.ankle[i][1] - BODY.ankle - (POSES[name].footY || 0)) < 1e-3 && Math.abs(j.ankle[i][0] - POSES[name].feet[i]) < 1e-3, `${name}: ankle ${j.ankle[i]}`);
  }
});

test("a walk's planted foot stays put: moving d metres puts the figure walkPhase(d) into its cycle and the foot on the ground doesn't slide", async () => {
  const { skeleton, walkPose, walkPhase, WALK } = await C();
  for (let leg = 0; leg < 2; leg++) {
    let planted = null, worst = 0, n = 0;
    for (let d = 0; d < 3; d += 0.01) {
      const j = skeleton(walkPose(walkPhase(d))).joints, others = j.ankle[1 - leg][1], mine = j.ankle[leg][1];
      const onGround = mine <= others + 1e-9 && mine < j.ankle[1 - leg][1] + 0.001;
      const wx = d + j.ankle[leg][0];                      // the ankle along the ground as the hips move d
      if (onGround) { if (planted == null) planted = wx; worst = Math.max(worst, Math.abs(wx - planted)); n++; } else planted = null;
    }
    assert.ok(n > 50, "the foot is planted for a good part of the walk");
    assert.ok(worst < 0.01, `leg ${leg}: the planted foot slid ${worst.toFixed(3)} m`);
  }
  assert.ok(Math.abs(walkPhase(2 * WALK.step) - 2 * Math.PI) < 1e-9, "two steps a cycle");
});

test("the tyre change: hands on the gun's grips with its socket on the wheel nut, on the tyres' treads, on the jacks' handles (within 3 cm) all through the stop", async () => {
  const { stopChoreo, stopClock, skeleton, gripsToFigure, hubsOf, GUN } = await C();
  for (const d of [D26, D25]) for (const left of [1, -1]) for (const D of [2.0, 2.4, 3.5]) {
    const plan = { wait: 0, D }, { dropAt } = stopClock(plan, 0), H = hubsOf(d);
    for (let s = -0.3; s <= D + 0.5; s += 0.05) {
      const L = stopChoreo(plan, s, d, left);
      for (const [i, [a, b, f, pose, , grips]] of L.figures.entries()) {
        if (!grips) continue;
        const j = skeleton(pose, null, gripsToFigure(grips, a, b, f)).joints;
        assert.ok(Math.max(...j.short) < 0.03, `figure ${i} at ${s.toFixed(2)} s (D ${D}, left ${left}): a hand ${Math.max(...j.short).toFixed(3)} m short`);
      }
      // every gun, wheel off the car and jack has its holder, and the holder's hands are on it
      for (const k of L.kits) assert.ok(L.figures[k.by]?.[5], `${k.kind} held by figure ${k.by}`);
      // a gun on its hub: the socket at the hub's height, just out from the wheel's face
      for (const k of L.kits.filter((x) => x.kind === "gun")) {
        const h = H.find((x) => Math.abs(x.a - k.a) < 0.2 && Math.sign(x.b) === Math.sign(k.b)), hubH = h.r + L.car.lift[h.axle === "front" ? 0 : 1];
        const onHub = Math.abs(k.h - hubH) < 1e-3;
        if (onHub) assert.ok(Math.abs(Math.abs(k.b) - (Math.abs(h.face) + 0.06)) < 0.01, `the gun's socket on the nut at ${s.toFixed(2)}`);
        void GUN;
      }
      const wk = stopClock(plan, s).w;
      // (on the nuts undoing them and doing the new ones up; drawn back off the hub while the wheels change – v0.40)
      if ((wk > 0.3 && wk < 0.42) || (wk > 1.25 && wk < 1.4)) assert.ok(L.kits.filter((x) => x.kind === "gun").some((k) => { const h = H.find((x) => Math.abs(x.a - k.a) < 0.2 && Math.sign(x.b) === Math.sign(k.b)); return Math.abs(k.h - (h.r + L.car.lift[h.axle === "front" ? 0 : 1])) < 1e-3; }), `guns on the hubs mid-stop (${s.toFixed(2)})`);
    }
  }
});

test("walking out and back with the kit: every carrier's hands on what he carries, carried at the waist / hips in front of him", async () => {
  const { changeWalk, skeleton, gripsToFigure } = await C();
  for (const phase of ["ready", "back"]) for (const left of [1, -1]) for (let f = 0.1; f < 0.95; f += 0.2) {
    const L = changeWalk(phase, f, D26, 4.2, left);
    for (const k of L.kits) {
      const [a, b, face, pose, , grips] = L.figures[k.by];
      assert.ok(grips, `${k.kind} carried`);
      const j = skeleton(pose, null, gripsToFigure(grips, a, b, face)).joints;
      assert.ok(Math.max(...j.short) < 0.03, `${phase} ${f.toFixed(1)}: ${k.kind}'s carrier ${Math.max(...j.short).toFixed(3)} m short`);
      // (in front of him: the kit's centre ahead of his hips)
      if (k.kind !== "jack") assert.ok((k.a - a) * Math.cos(face) + (k.b - b) * Math.sin(face) > 0.3, `${k.kind} ahead of its carrier`);
    }
  }
});

test("a flag held: the fist round the pole, the pole up along the forearm; the pit wall's hands reach the console", async () => {
  const { flagHold, flagPose, skeleton } = await C();
  for (const w of [-1, 0, 1]) {
    const { at, axis } = flagHold(flagPose(w)), j = skeleton(flagPose(w)).joints;
    assert.ok(dist(at, j.grip[1]) < 1e-9 && Math.abs(Math.hypot(...axis) - 1) < 1e-9 && axis[1] > 0.5, `pole along the raised arm (w ${w})`);
    assert.ok(at[1] > 1.7, "the flag hand over the head");
  }
  for (const pose of ["sit", "sitLean"]) {
    const j = skeleton(pose, null, [[0.6, 1.11, 0.21, 1, 0, 0, 1], [0.68, 1.11, -0.2, 1, 0, 0, 1]]).joints;
    assert.ok(j.elbow.every((e) => e[1] > 0.9 && e[1] < 1.2), `${pose}: the elbows near the desk's height (${j.elbow.map((e) => e[1].toFixed(2))})`);
    assert.ok(Math.max(...j.short) < 0.01, `${pose}: hands on the console`);
  }
});

test("crew meshes: a figure's parts drawn per LOD – fingers near, mittens mid, no small parts far, one coarse figure beyond – instanced (one mesh per part)", async () => {
  const { crewMeshes, CREW_LOD } = await C();
  const cm = crewMeshes(4), names = (m) => m.geometry.attributes.position.count;
  const at = (dz) => cm.place([{ x: 0, y: 0, z: dz, yaw: 0, colour: "#ff0000", pose: "stand" }], [], { x: 0, y: 1.6, z: 0 });
  const meshes = cm.group.children;
  at(CREW_LOD.near - 4); const near = meshes.filter((m) => m.visible).length;
  at(CREW_LOD.far - 10); const mid = meshes.filter((m) => m.visible).length;
  at(CREW_LOD.far + 20); const far = meshes.filter((m) => m.visible).length;
  const r = at(CREW_LOD.body + 50), body = meshes.filter((m) => m.visible).length;
  assert.ok(near === mid && far < mid && body === 1 && r.people === 1, `parts shown near ${near}, mid ${mid}, far ${far}, beyond ${body}`);
  assert.ok(meshes.every((m) => m.isInstancedMesh));
  void names;
});
