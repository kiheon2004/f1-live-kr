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
// wheel) back towards the elbow (v0.34: the arms stayed put while the gloves went round with the wheel)
test("car model: turning the wheel, each forearm still starts at its glove", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js");
  const car = C.makeCar({ teamName: "Ferrari", teamColour: "e8002d", number: 16, season: 2026 }), u = car.userData;
  for (const steer of [0, 0.08, -0.12]) {
    C.setWheels(car, 0, steer); car.updateMatrixWorld(true);
    for (const m of u.arms) {
      const k = m.userData.k, glove = new THREE.Vector3(0.145 * k, -0.005, 0.004).applyMatrix4(u.wheel.matrixWorld);
      // the arm's end nearer the wheel: its centre less half its length along its axis
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(m.getWorldQuaternion(new THREE.Quaternion()));
      const len = m.scale.y + 0.066, c = m.getWorldPosition(new THREE.Vector3());
      const ends = [c.clone().addScaledVector(axis, len / 2), c.clone().addScaledVector(axis, -len / 2)];
      const d = Math.min(...ends.map((e) => e.distanceTo(glove)));
      assert.ok(d < 0.02, `steer ${steer}, arm ${k}: ${d.toFixed(3)} m from the glove`);
    }
  }
});

// v0.36 review: without a date, a spec limited to part of the season was taken (Racing Bulls 2026 → the early airbox)
test("car shapes: the date decides between a season's specs; without one, no part-season spec", async () => {
  const { shapeFor } = await import("../src/renderer/carshapes.js");
  const rb = (d) => shapeFor(2026, "Racing Bulls", d)?.id ?? null;
  assert.deepStrictEqual([rb(null), rb(""), rb("not a date"), rb(undefined)], [null, null, null, null], "no date: the era's car");
  assert.deepStrictEqual([rb("2026-07-24"), rb("2026-07-25"), rb("2026-10-01")], ["vcarb03", "vcarb03b", "vcarb03b"], "the upgrade from its first day");
  assert.strictEqual(shapeFor(2026, "Ferrari", null)?.id, "sf26", "a whole-season spec needs no date");
  // the car's model key follows the shape picked: an earlier session gives the earlier car again
  const C = await import("../src/renderer/car3d.js");
  assert.notStrictEqual(C.profileFor(2026, "Racing Bulls", "2026-05-03").key, C.profileFor(2026, "Racing Bulls", "2026-09-06").key);
  assert.strictEqual(C.profileFor(2026, "Racing Bulls", null).key, "2026");
  // Haas 2026: the sidepods changed at the Canadian GP (v0.36 research: gully top before, ramp and deep undercut after)
  const h = (d) => shapeFor(2026, "Haas F1 Team", d)?.id ?? null;
  assert.deepStrictEqual([h("2026-05-03"), h("2026-05-22"), h("2026-09-06"), h(null)], ["vf26", "vf26b", "vf26b", null]);
});

// v0.38: the halo checked against the head and the driver's eye on every profile – nothing through the helmet or the
// mirrors, the pillar narrower than the eyes are apart where the eye's line meets it, the eye inside the hoop
test("halo: clear of the helmet and mirrors on every profile; the pillar under the eyes' spacing at eye height", async () => {
  const C = await import("../src/renderer/car3d.js");
  for (const [key, P] of Object.entries(C.PROFILES)) {
    const g = C.halo(P), pos = g.attributes.position, [hx, hy, hz] = P.helmet, [sx, sy, sz] = P.helmetSize || [0.13, 0.14, 0.155];
    let inHelmet = 0, inMirror = 0, minE = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const e = Math.hypot((x - hx) / (sx + 0.02), (y - hy) / (sy + 0.02), (z - hz) / (sz + 0.02)); minE = Math.min(minE, e); if (e < 1) inHelmet++;
      if (Math.abs(Math.abs(x) - 0.5) < 0.1 && Math.abs(y - 0.68) < 0.05 && Math.abs(z - 0.52 - (P.ck || 0)) < 0.05) inMirror++;
    }
    assert.strictEqual(inHelmet, 0, `${key}: halo within 2 cm of the helmet (closest ${minE.toFixed(2)})`);
    assert.strictEqual(inMirror, 0, `${key}: halo through a mirror`);
    // the pillar where the eye's horizontal line meets it (the vertices within 1 cm of eye height, ahead of the eye)
    const [, ey, ez] = P.eye, xs = [];
    for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - ey) < 0.01 && pos.getZ(i) > ez + 0.3 && Math.abs(pos.getX(i)) < 0.1) xs.push(pos.getX(i));
    if (xs.length) { const w = Math.max(...xs) - Math.min(...xs); assert.ok(w < 0.063, `${key}: pillar ${w.toFixed(3)} m wide at eye height`); }
    g.computeBoundingBox();
    assert.ok(g.boundingBox.max.y > ey + 0.1, `${key}: the hoop over the eye`);
  }
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
    assert.ok(near <= 45 && mid <= 35, `${season} ${team}: ${near} meshes near, ${mid} mid`);
    assert.ok(tris < 60000, `${season} ${team}: ${Math.round(tris)} triangles`);
    // the wings: 2026 front-wing profiles and endplates within |y| ≤ 0.68 m, rear wing within 0.575 m (C3.10 / C3.11)
    const fw = new THREE.Box3().setFromBufferAttribute(u.fwPivot.children[0].geometry.attributes.position), rw = new THREE.Box3().setFromBufferAttribute(u.rwPivot.children[0].geometry.attributes.position);
    if (P.era === "2026") { assert.ok(fw.max.x <= 0.69 && rw.max.x <= 0.58, `2026 wings ${fw.max.x.toFixed(3)} / ${rw.max.x.toFixed(3)}`); }
    else assert.ok(fw.max.x <= 1.0 && rw.max.x <= 0.52, `2022 wings ${fw.max.x.toFixed(3)} / ${rw.max.x.toFixed(3)}`);
    // the moving flaps' pivots at their leading edges (2022–25: the front flaps never move – their endplates ride with them)
    car.updateMatrixWorld(true);
    for (const pv of P.era === "2026" ? [u.fwPivot, u.rwPivot] : [u.rwPivot]) { const bb = new THREE.Box3().setFromObject(pv.children[0]); assert.ok(Math.abs(bb.max.z - pv.position.z) < 0.1 && Math.abs(bb.min.y - pv.position.y) < 0.1, `pivot ${pv.position.toArray()} vs flap ${bb.max.toArray().map((v) => v.toFixed(3))}`); }
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
