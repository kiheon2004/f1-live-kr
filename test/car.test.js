// The 3D car model's contract (car3d.js): one model per season era (the car of that year, not today's on every race),
// a checked team variant only where there is one, real-size bounds within the era's rules, mounts for the cockpit
// cameras, levels of detail that only hide small parts, and shared parts never freed with one car.
const test = require("node:test");
const assert = require("node:assert");

test("car model: the season picks the era's car; a team's own shape where the season's research has one", async () => {
  const C = await import("../src/renderer/car3d.js");
  const p = (y, t, d) => C.profileFor(y, t, d);
  assert.deepStrictEqual([p(2023, "Red Bull Racing").key, p(2024, "McLaren").key, p(2025, "Red Bull Racing").key, p(2025, "Ferrari").key, p(2026, "Red Bull Racing").key, p(2027, "Audi").key],
    ["2022", "2022", "2022:rb21", "2022:sf25", "2026:rb22", "2026"]);
  // a car changed during the season: by the event's date (Racing Bulls' smaller airbox from the 2026 Hungarian GP)
  assert.deepStrictEqual([p(2026, "Racing Bulls", "2026-05-03").key, p(2026, "Racing Bulls", "2026-07-26").key], ["2026:vcarb03", "2026:vcarb03b"]);
  // what tells the models apart is season and team, not colour
  const a = C.makeCar({ teamName: "Red Bull Racing", teamColour: "3671C6", number: 1, season: 2025 });
  const b = C.makeCar({ teamName: "Red Bull Racing", teamColour: "3671C6", number: 1, season: 2026 });
  assert.notStrictEqual(a.userData.profile.key, b.userData.profile.key);
});

test("car model: real size within the era's rules, wheels where the profile puts them, mounts in the cockpit", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js");
  for (const [season, team, W, WB] of [[2025, "Red Bull Racing", 2.0, 3.6], [2024, "Williams", 2.0, 3.6], [2026, "Ferrari", 1.9, 3.4]]) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), u = car.userData, P = u.profile;
    car.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(car);
    assert.ok(box.max.x - box.min.x <= W + 0.01 && box.max.x - box.min.x > W - 0.08, `${season} width ${(box.max.x - box.min.x).toFixed(3)}`);
    // the bodywork within the era's height (airbox: ~1.0 m in 2026 photos), the T-cam pod and its antennas on top of it
    // (photos: well over the helmet) under 1.2 m
    const body = new THREE.Box3(); car.traverse((o) => { if (o.isMesh && o.material?.map) body.expandByObject(o); });
    assert.ok(body.max.y <= 1.01, `${season} bodywork ${body.max.y.toFixed(3)}`);
    assert.ok(box.max.y <= 1.2 && box.min.y >= -0.001, `${season} height ${box.max.y.toFixed(3)}`);
    assert.ok(Math.abs(P.FZ - P.RZ - WB) < 1e-9, `${season} wheelbase`);
    const len = box.max.z - box.min.z; assert.ok(len > 5.0 && len < 5.75, `${season} length ${len.toFixed(2)}`);
    // the wheels: at the axles, standing on the ground
    for (const [i, w] of u.wheels.entries()) {
      const r = i < 2 ? P.FR : P.RR, z = i < 2 ? P.FZ : P.RZ;
      assert.ok(Math.abs(w.position.y - r) < 1e-9 && Math.abs(w.position.z - z) < 1e-9);
      const wb = new THREE.Box3().setFromObject(u.spins[i]); assert.ok(Math.abs(wb.min.y) < 0.01, `wheel ${i} on the ground (${wb.min.y.toFixed(3)})`);
    }
    // the T-cam over the helmet and behind it; the eyes inside the helmet
    const hb = new THREE.Box3().setFromObject(u.helmet);
    assert.ok(u.mounts.tcam.y > hb.max.y + 0.1 && u.mounts.tcam.z < hb.min.z, "T-cam above and behind the helmet");
    // the T-cam isn't inside its own pod or the airbox: nothing of the car within 3 cm of the lens but the pod's front
    const lens = u.mounts.tcam, near = []; car.traverse((o) => { if (!o.isMesh) return; const b = new THREE.Box3().setFromObject(o); if (b.distanceToPoint(lens) < 0.001) near.push(o); });
    for (const o of near) {
      const g = o.geometry, p = g.attributes.position, w = new THREE.Vector3(); let inside = 0;
      // (a coarse test: the lens inside a closed mesh would have it surrounded on all sides – here: no vertices both above and below within 3 cm straight up/down)
      for (let i = 0; i < p.count; i++) { w.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (Math.abs(w.x - lens.x) < 0.03 && Math.abs(w.z - lens.z) < 0.03 && w.y > lens.y) inside++; }
      assert.strictEqual(inside, 0, `${season}: nothing straight over the lens (${o.name || o.material?.type})`);
    }
    assert.ok(hb.containsPoint(u.mounts.eye), "eyes in the helmet");
    // the eye isn't inside anything else the car draws at the near level but the helmet (its own room: 3 cm)
  }
});

test("car model: levels of detail hide only small parts; wheels steer and roll; flaps open; shared parts survive a dispose", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js"), { disposeGroup } = await import("../src/renderer/dispose.js");
  const car = C.makeCar({ teamName: "McLaren", teamColour: "FF8000", number: 4, season: 2025 });
  const count = () => { let n = 0; car.traverseVisible((o) => { if (o.isMesh) n++; }); return n; };
  const box = () => { car.updateMatrixWorld(true); const b = new THREE.Box3(); car.traverseVisible((o) => { if (o.isMesh) b.expandByObject(o); }); return b; };
  const near = count(), bn = box();
  C.setDetail(car, "mid"); const mid = count();
  C.setDetail(car, "far"); const far = count(), bf = box();
  assert.ok(near > mid && mid > far && far >= 15, `${near} > ${mid} > ${far}`);
  // the silhouette is the same: the far car's bounds are the near car's
  assert.ok(bn.min.distanceTo(bf.min) < 0.02 && bn.max.distanceTo(bf.max) < 0.02, "same outline at every level");
  C.setDetail(car, "near");
  C.setWheels(car, 1.2, 0.2);
  assert.strictEqual(car.userData.wheels[0].rotation.y, 0.2); assert.strictEqual(car.userData.wheels[2].rotation.y, 0);
  assert.strictEqual(car.userData.spins[3].rotation.x, 1.2);
  assert.ok(car.userData.wheel.rotation.z < 0 && car.userData.wheel.rotation.z >= -Math.PI / 2, "the steering wheel turns with them, within ±90°");
  C.setAero(car, 1); assert.ok(car.userData.rwPivot.rotation.x < 0, "DRS open"); assert.strictEqual(car.userData.fwPivot.rotation.x, 0, "2022–25: front flap fixed");
  const c26 = C.makeCar({ teamName: "McLaren", teamColour: "FF8000", number: 4, season: 2026 }); C.setAero(c26, 1); assert.ok(c26.userData.fwPivot.rotation.x < 0, "2026: both wings");
  // freeing one car leaves the shared geometry of its era's template and the shared materials for the others
  const other = C.makeCar({ teamName: "McLaren", teamColour: "FF8000", number: 81, season: 2025 });
  const shared = []; other.traverse((o) => { if (o.isMesh && o.geometry.userData.shared) shared.push(o.geometry); });
  let disposed = 0; for (const g of shared) g.addEventListener("dispose", () => disposed++);
  disposeGroup(car);
  assert.ok(shared.length > 10 && disposed === 0, `${shared.length} shared geometries, ${disposed} freed`);
  const env = new THREE.Texture(); env.userData.shared = true; let envGone = 0; env.addEventListener("dispose", () => envGone++);
  C.setCarEnvironment(other, env, 1); disposeGroup(other); assert.strictEqual(envGone, 0, "the shared reflections stay");
});

// v0.35: every team its own model where its shape is known – the template cache keyed by the shape, so the first team's
// car is never handed to another – and the model contract the same for all (wheels, hubs, mounts, width)
test("car model: teams' shapes are their own templates; wheels, hubs and mounts stay the era's", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js");
  const geo = (car) => car.children.find((o) => o.isMesh).geometry;   // (the painted body and sidepods: the first part added)
  const teams = ["Ferrari", "Aston Martin", "Racing Bulls", "Mercedes", "Cadillac"];
  const cars = teams.map((teamName) => C.makeCar({ teamName, teamColour: "888888", number: 7, season: 2026 }));
  const keys = new Set(cars.map((c) => c.userData.profile.key));
  assert.strictEqual(keys.size, teams.length, `one key per team: ${[...keys]}`);
  const bodies = new Set(cars.map(geo)); assert.strictEqual(bodies.size, teams.length, "a body of their own");
  // the same team twice: the same shared template
  assert.strictEqual(geo(C.makeCar({ teamName: "Ferrari", teamColour: "888888", number: 16, season: 2026 })), geo(cars[0]));
  // the contract: wheel places, tyre sizes and mounts are the era's for every team
  const ref = C.wheelParts(2026, "Ferrari");
  for (const t of teams) {
    const w = C.wheelParts(2026, t);
    assert.deepStrictEqual([w.FR, w.RR, w.FW, w.RW, w.FZ, w.RZ, w.FX, w.RX, w.W], [ref.FR, ref.RR, ref.FW, ref.RW, ref.FZ, ref.RZ, ref.FX, ref.RX, ref.W], t);
  }
  for (const c of cars) {
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c);
    assert.ok(box.max.x - box.min.x <= 1.91, `${c.userData.profile.key} within 1.9 m`);
    assert.deepStrictEqual(c.userData.mounts.eye.toArray?.() ?? c.userData.mounts.eye, cars[0].userData.mounts.eye.toArray?.() ?? cars[0].userData.mounts.eye);
  }
});

// v0.35: the hands stay on the arms when the wheel turns – each forearm runs from its glove (which turns with the
// wheel) back towards the elbow (v0.34: the arms stayed put while the gloves went round with the wheel). v0.41: five
// bones (shoulder, elbow, half way, wrist, hand) – the wrist bone at the glove's wrist; the hand's orientation against
// the forearm is checked in arms.test.js
test("car model: turning the wheel, each arm's skinned sleeve still runs to its glove's wrist, no bone stretches, the elbow inside the cockpit (v0.39; v0.41 five bones)", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js"), { BODY } = await import("../src/renderer/body3d.js");
  const car = C.makeCar({ teamName: "Ferrari", teamColour: "e8002d", number: 16, season: 2026 }), u = car.userData;
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  for (const steer of [0, 0.08, -0.12, 0.2, -0.2]) {
    C.setWheels(car, 0, steer); car.updateMatrixWorld(true);
    for (const a of u.arms) {
      const G = u.armPlan.geo, k = a.k, wrist = new THREE.Vector3((G.wrist[0] - G.grip.c[0]) * k, G.wrist[1] - G.grip.c[1], G.wrist[2] - G.grip.c[2]).applyMatrix4(a.hand.matrixWorld);
      const [b0, b1, b2, b3, b4] = a.bones;
      assert.ok(Math.abs(wp(b0).distanceTo(wp(b1)) - BODY.uarm) < 1e-6 && Math.abs(wp(b1).distanceTo(wp(b3)) - BODY.farm) < 1e-6, "the bones keep their lengths");
      assert.ok(wp(b2).distanceTo(wp(b1).lerp(wp(b3), 0.5)) < 1e-6 && wp(b4).distanceTo(wp(b3)) < 1e-9, "the half-way bone half way, the hand's at the wrist");
      const d = wp(b3).distanceTo(wrist);
      assert.ok(d < 0.001, `steer ${steer}, arm ${a.k}: the arm's wrist ${(d * 1000).toFixed(2)} mm from the glove's`);
      // the skin itself: the sleeve's last ring of vertices (skinned) on the forearm's line, inside the gauntlet's reach
      const pos = a.mesh.geometry.attributes.position, ring = [], v = new THREE.Vector3();
      for (let i = pos.count - 17; i < pos.count; i++) { a.mesh.getVertexPosition(i, v); ring.push(v.clone().applyMatrix4(a.mesh.matrixWorld)); }
      const cen = ring.reduce((t, q) => t.add(q), new THREE.Vector3()).multiplyScalar(1 / ring.length), f = wp(b3).sub(wp(b1)).normalize(), rel = cen.clone().sub(wp(b1));
      assert.ok(rel.clone().sub(f.clone().multiplyScalar(rel.dot(f))).length() < 0.002 && Math.abs(rel.dot(f) - (BODY.farm - 0.045)) < 0.003, `steer ${steer}, arm ${a.k}: the sleeve's end off the forearm`);
      // (the elbow inside the cockpit: below its rim, in its opening, or – the raised arm at a big lock – over the rim)
      const el = car.worldToLocal(wp(b1));
      assert.ok((el.y < 0.56 && Math.abs(el.x) < 0.3) || Math.abs(el.x) < 0.24 || el.y > 0.6, `steer ${steer}, arm ${a.k}: elbow at ${el.toArray().map((q) => q.toFixed(2))}`);
    }
  }
});

test("car model v0.40: the right glove is the left one mirrored (thumbs on the inner side of both grips) – v0.41: each on its own pivot", async () => {
  const C = await import("../src/renderer/car3d.js");
  const car = C.makeCar({ teamName: "Red Bull Racing", teamColour: "3671c6", number: 1, season: 2025 }), u = car.userData;
  C.setCockpit(car, true);
  assert.ok(u.gloveFine.every((m) => m.visible) && u.gloveLo.every((m) => !m.visible), "the fine pair in the cockpit");
  const L = u.gloveFine[0].geometry.attributes.position, Rg = u.gloveFine[1].geometry.attributes.position, n = L.count;
  assert.strictEqual(Rg.count, n);
  // mirrored: every right-glove vertex (its pivot's frame – the mirrored grip's centre) is a left-glove vertex with x negated
  const key = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`, A = new Set();
  for (let i = 0; i < n; i++) A.add(key(-L.getX(i), L.getY(i), L.getZ(i)));
  let miss = 0; for (let i = 0; i < n; i++) if (!A.has(key(Rg.getX(i), Rg.getY(i), Rg.getZ(i)))) miss++;
  assert.ok(miss < n * 0.01, `${miss} of ${n} right-glove points aren't the left's mirror image`);
  assert.ok(Math.abs(u.arms[0].hand.position.x + u.arms[1].hand.position.x) < 1e-9, "the pivots mirrored");
  // (holding the grips without going through them: arms.test.js, at every wheel angle)
});

// v0.39: the cars rebuilt from race photos – the cockpit where hub-aligned side photos put it, the wings within the
// era's rules, the draw calls and triangles within the budget (20+ cars on screen), liveries by season and date
test("cars v0.39: cockpit place, wing spans, draw-call and triangle budget", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js");
  for (const [season, team] of [[2025, "Ferrari"], [2025, "Red Bull Racing"], [2025, "Haas F1 Team"], [2026, "Mercedes"], [2026, "Cadillac"], [2027, "Unknown"]]) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), u = car.userData, P = u.profile;
    // the helmet's middle 1.40–1.65 m behind the front axle (photos: 1.45–1.62 m), the T-cam behind and over it
    const back = P.FZ - P.helmet[2]; assert.ok(back > 1.4 && back < 1.65, `${season} ${team}: helmet ${back.toFixed(2)} m behind the front axle`);
    assert.ok(P.tcam[2] < P.helmet[2] - 0.3 && P.tcam[1] > P.helmet[1] + 0.25, "T-cam behind and over the helmet");
    // draw calls: v0.38 drew 35 meshes close up (33 for 2026), 27 at mid range – at most +30 %; triangles under 60k a car
    let near = 0, tris = 0; car.traverseVisible((o) => { if (o.isMesh) { near++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    C.setDetail(car, "mid"); let mid = 0; car.traverseVisible((o) => { if (o.isMesh) mid++; });
    // (v0.44: 46 – the 2026 front flaps in two halves, each about its own swept axis, C3.10.10)
    assert.ok(near <= 46 && mid <= 35, `${season} ${team}: ${near} meshes near, ${mid} mid`);
    assert.ok(tris < 60000, `${season} ${team}: ${Math.round(tris)} triangles`);
    // the wings: 2026 front-wing profiles and endplates within |y| ≤ 0.68 m, rear wing within 0.575 m (C3.10 / C3.11)
    const fw = new THREE.Box3().setFromBufferAttribute(u.fwPivot.children[0].geometry.attributes.position), rw = new THREE.Box3().setFromBufferAttribute(u.rwPivot.children[0].geometry.attributes.position);
    if (P.era === "2026") { assert.ok(fw.max.x <= 0.69 && rw.max.x <= 0.58, `2026 wings ${fw.max.x.toFixed(3)} / ${rw.max.x.toFixed(3)}`); }
    else assert.ok(fw.max.x <= 1.0 && rw.max.x <= 0.52, `2022 wings ${fw.max.x.toFixed(3)} / ${rw.max.x.toFixed(3)}`);
    // v0.44: the hinges where the rules put them – the 2026 front flaps' axes by their leading edges (C3.10.10 (d): ≤ 25 mm),
    // the 2026 rear flap's in its back half (C3.11.6 (b)), the 2022–25 DRS flap's at its trailing edge (2025 Art. 3.10.10 (b))
    if (P.era === "2026") { const pv = u.fwPivot, bb = new THREE.Box3().setFromBufferAttribute(pv.children[0].geometry.attributes.position); assert.ok(Math.abs(bb.max.z - pv.position.z) < 0.1, `front axis ${pv.position.toArray()} vs flap ${bb.max.toArray().map((v) => v.toFixed(3))}`); }
    { const pv = u.rwPivot, bb = new THREE.Box3().setFromBufferAttribute(pv.children[0].geometry.attributes.position), mid = (bb.max.z + bb.min.z) / 2;
      assert.ok(pv.position.z <= mid + 1e-6 && pv.position.z >= bb.min.z - 0.005 && pv.position.y > bb.min.y && pv.position.y < bb.max.y + 0.005, `rear hinge ${pv.position.toArray()} vs flap ${bb.min.toArray().map((v) => v.toFixed(3))}…${bb.max.toArray().map((v) => v.toFixed(3))}`);
      if (P.era !== "2026") assert.ok(bb.min.z > pv.position.z - 0.03 && bb.max.y < pv.position.y + 0.03, "DRS: by the trailing edge, near the top"); }
  }
});
test("cars v0.39: liveries by season and date; the painted parts' livery mapping stays in the texture", async () => {
  const C = await import("../src/renderer/car3d.js");
  assert.notStrictEqual(C.liveryFor("Ferrari", null, 2025), C.liveryFor("Ferrari", null, 2026), "SF-25 and SF-26 liveries differ");
  assert.strictEqual(C.liveryFor("Ferrari", null, 2025).finish, "matte"); assert.notStrictEqual(C.liveryFor("Ferrari", null, 2026).finish, "matte");
  const cad = (d) => C.liveryFor("Cadillac", null, 2026, d).base;
  assert.notStrictEqual(cad("2026-05-03"), cad("2026-07-05"), "Cadillac's livery changed at the Austrian GP");
  assert.strictEqual(cad(null), cad("2026-03-08"), "no date: the livery the season started with");
  assert.strictEqual(C.liveryFor("Nobody", "123456", 2026).base, "#123456");
  for (const season of [2025, 2026]) {
    const car = C.makeCar({ teamName: "McLaren", teamColour: "FF8000", number: 4, season }), g = car.children[0].geometry, uv = g.attributes.uv.array;
    let bad = 0; for (const v of uv) if (!(v >= 0 && v <= 1)) bad++;
    assert.strictEqual(bad, 0, `${season}: painted UVs outside the texture`);
  }
});
