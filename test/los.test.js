// The chase camera's line of sight (los.js) gives the same first hit as three.js' raycaster – for meshes moved, turned
// and scaled, indexed or not, single- or double-sided, and instanced ones – within the segment's length.
const test = require("node:test");
const assert = require("node:assert");

test("line of sight: the same first hit as three.js' raycaster, a segment at a time", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), { firstHit } = await import("../src/renderer/los.js");
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // a "district": boxes merged into one non-indexed geometry, plus single meshes in several sides and transforms
  const parts = [];
  for (let k = 0; k < 60; k++) { const b = new THREE.BoxGeometry(4 + r() * 20, 3 + r() * 30, 4 + r() * 20); b.translate(r() * 300 - 150, 5, r() * 300 - 150); parts.push(b.toNonIndexed()); }
  const pos = []; for (const p of parts) pos.push(...p.attributes.position.array);
  const chunk = new THREE.BufferGeometry(); chunk.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const meshes = [new THREE.Mesh(chunk, new THREE.MeshStandardMaterial())];
  const turned = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 8), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
  turned.position.set(40, 4, -20); turned.rotation.y = 0.7; turned.scale.set(1.5, 1, 0.8); meshes.push(turned);
  const back = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 8), new THREE.MeshStandardMaterial({ side: THREE.BackSide })); back.position.set(-60, 8, 60); meshes.push(back);
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(5, 5, 5), new THREE.MeshStandardMaterial(), 3);
  for (let i = 0; i < 3; i++) inst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-20 + i * 15, 2, 30)); meshes.push(inst);
  for (const m of meshes) m.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3();
  let hits = 0, clear = 0;
  for (let k = 0; k < 3000; k++) {
    o.set(r() * 340 - 170, r() * 25, r() * 340 - 170); d.set(r() - 0.5, (r() - 0.5) * 0.6, r() - 0.5).normalize();
    const far = 2 + r() * 40;
    rc.set(o, d); rc.far = far;
    const ref = rc.intersectObjects(meshes, false)[0]?.distance ?? null, got = firstHit(meshes, o, d, far);
    if (ref == null) { assert.strictEqual(got, null, `ray ${k}: clear for three.js`); clear++; }
    else { assert.ok(got != null && Math.abs(got - ref) < 1e-4, `ray ${k}: ${got} vs ${ref}`); hits++; }
  }
  assert.ok(hits > 200 && clear > 200, `both cases covered (${hits} hits, ${clear} clear)`);
});

// v0.14 optimisation review: inputs the grid doesn't cover go to three.js (several materials – each group its own
// side, triangles outside the groups not drawn –, a draw range); huge or broken triangles don't blow up the grid; a
// geometry changed after its grid was built is answered from its new shape.
test("line of sight: material arrays, groups and draw ranges answer as three.js does", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), { firstHit } = await import("../src/renderer/los.js");
  let seed = 11; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sides = [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide], mat = (s) => new THREE.MeshBasicMaterial({ side: s });
  const meshes = [];
  // a box with its six faces in three sides (groups), indexed, and the same non-indexed
  const mixed = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20), [0, 1, 2, 0, 1, 2].map((k) => mat(sides[k]))); mixed.position.set(-40, 6, 0); meshes.push(mixed);
  const flat = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20).toNonIndexed(), [0, 1, 2, 0, 1, 2].map((k) => mat(sides[k])));
  flat.geometry.clearGroups(); for (let f = 0; f < 6; f++) flat.geometry.addGroup(f * 6, 6, f % 3); flat.position.set(40, 6, 0); flat.rotation.y = 0.5; meshes.push(flat);
  // groups covering only some triangles; groups empty (nothing drawn with a material array)
  const part = new THREE.BoxGeometry(16, 10, 16); part.clearGroups(); part.addGroup(0, 12, 0); part.addGroup(24, 6, 1);
  const partial = new THREE.Mesh(part, [mat(THREE.FrontSide), mat(THREE.DoubleSide)]); partial.position.set(0, 5, 40); meshes.push(partial);
  const none = new THREE.BoxGeometry(16, 10, 16); none.clearGroups();
  const empty = new THREE.Mesh(none, [mat(THREE.DoubleSide)]); empty.position.set(0, 5, -40); meshes.push(empty);
  // draw ranges: nothing, half
  const g0 = new THREE.BoxGeometry(14, 10, 14); g0.setDrawRange(0, 0);
  const nothing = new THREE.Mesh(g0, mat(THREE.DoubleSide)); nothing.position.set(-40, 5, -40); meshes.push(nothing);
  const g1 = new THREE.BoxGeometry(14, 10, 14); g1.setDrawRange(6, 18);
  const half = new THREE.Mesh(g1, mat(THREE.DoubleSide)); half.position.set(40, 5, 40); half.scale.set(1.3, 1, 0.7); meshes.push(half);
  const g2 = new THREE.BoxGeometry(14, 10, 14).toNonIndexed(); g2.setDrawRange(12, 12);
  const halfFlat = new THREE.Mesh(g2, mat(THREE.FrontSide)); halfFlat.position.set(-40, 5, 40); meshes.push(halfFlat);
  for (const m of meshes) m.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3();
  let hits = 0, clear = 0;
  for (let k = 0; k < 3000; k++) {
    // (from anywhere – inside the boxes too, where only back faces are met)
    o.set(r() * 120 - 60, r() * 14, r() * 120 - 60); d.set(r() - 0.5, (r() - 0.5) * 0.6, r() - 0.5).normalize();
    const far = 2 + r() * 50;
    rc.set(o, d); rc.far = far;
    const ref = rc.intersectObjects(meshes, false)[0]?.distance ?? null, got = firstHit(meshes, o, d, far);
    if (ref == null) { assert.strictEqual(got, null, `ray ${k}: clear for three.js`); clear++; }
    else { assert.ok(got != null && Math.abs(got - ref) < 1e-4, `ray ${k}: ${got} vs ${ref}`); hits++; }
  }
  assert.ok(hits > 200 && clear > 300, `both cases covered (${hits} hits, ${clear} clear)`);
});

test("line of sight: a huge or broken triangle is checked without filling the grid; a changed geometry is seen as changed", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), { firstHit } = await import("../src/renderer/los.js");
  // one triangle 2,000 km across (a model in the wrong units) and one with a coordinate not finite, among small ones
  const pos = [-1e6, 0, -1e6, 1e6, 0, -1e6, 0, 0, 1e6, 0, 5, 0, 1, 5, 0, Infinity, 5, 1];
  for (let k = 0; k < 50; k++) pos.push(k * 3, 2, 0, k * 3 + 2, 2, 0, k * 3, 2, 2);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); m.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  const t0 = performance.now();
  for (const [x, z] of [[500, 700], [-3000, 2000], [1.5, 0.5], [40, 0.4]]) {
    const o = new THREE.Vector3(x, 10, z); rc.set(o, down); rc.far = 20;
    const ref = rc.intersectObject(m, false)[0]?.distance ?? null;
    assert.strictEqual(firstHit([m], o, down, 20), ref, `at ${x}, ${z}`);
  }
  assert.ok(performance.now() - t0 < 500, "the grid stays small (the huge triangle isn't put in ~15 billion cells)");
  // the geometry moved after its grid was built: answered from where it is now
  const box = new THREE.BoxGeometry(4, 4, 4), b = new THREE.Mesh(box, new THREE.MeshBasicMaterial()); b.updateMatrixWorld(true);
  const o = new THREE.Vector3(-10, 0, 0), east = new THREE.Vector3(1, 0, 0);
  assert.ok(Math.abs(firstHit([b], o, east, 30) - 8) < 1e-6);
  box.translate(6, 0, 0);   // (flags the positions as changed)
  box.computeBoundingSphere();
  assert.ok(Math.abs(firstHit([b], o, east, 30) - 14) < 1e-6, "the moved faces, not the grid of the old ones");
  box.setAttribute("position", new THREE.BoxGeometry(2, 2, 2).attributes.position); box.setIndex(new THREE.BoxGeometry(2, 2, 2).index); box.computeBoundingSphere();
  assert.ok(Math.abs(firstHit([b], o, east, 30) - 9) < 1e-6, "a new position attribute");
});

test("chase camera: never behind what's between it and the car – stops short, rises over a low wall, keeps off the ground", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), { chasePlace } = await import("../src/renderer/los.js");
  const box = (w, h, d, x, y, z, side = THREE.FrontSide) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ side })); m.position.set(x, y, z); m.updateMatrixWorld(true); return m; };
  // the car at the origin heading +z: the camera behind it (−z), 10.8 m out, 12.9° up
  const head = new THREE.Vector3(0, 1.1, 0), az = Math.PI, el = Math.atan2(2.4, 10.5), r = Math.hypot(2.4, 10.5);
  const rc = new THREE.Raycaster();
  const clearBetween = (meshes, a, b) => { const d = b.clone().sub(a), len = d.length(); rc.set(a, d.normalize()); rc.far = len; return !rc.intersectObjects(meshes, false).length; };
  // a tall wall (40 m) across the way at 0.5 / 1.5 / 3 / 10 m behind: the camera is in front of it, never past it
  for (const at of [0.5, 1.5, 3, 10]) {
    const wall = [box(30, 40, 0.4, 0, 20, -(at + 0.2), THREE.DoubleSide)];
    const { pos } = chasePlace(wall, head, az, el, r);
    assert.ok(-pos.z < at, `wall at ${at} m: camera ${(-pos.z).toFixed(2)} m behind the car, in front of it`);
    assert.ok(clearBetween(wall, head, pos), `wall at ${at} m: nothing between`);
    // (and whatever lift is asked for, the same)
    for (const lift of [0.35, 0.7, 1.05]) assert.ok(clearBetween(wall, head, chasePlace(wall, head, az, el, r, { lift }).pos), `wall at ${at} m, lift ${lift}`);
  }
  // a low wall (1.8 m) 1.5 m behind: rising over it is asked for, and at that lift the camera is out past it, clear
  const low = [box(30, 1.8, 0.4, 0, 0.9, -1.7)];
  const a = chasePlace(low, head, az, el, r);
  assert.ok(a.lift > 0, "a lift is asked for");
  const b = chasePlace(low, head, az, el, r, { lift: a.lift });
  assert.ok(b.pos.distanceTo(head) > 2.5 && clearBetween(low, head, b.pos), `over the wall (${b.pos.distanceTo(head).toFixed(2)} m out)`);
  // a pillar 0.25 m to the side of the line (the camera's own width would be in it): stopped short too
  const pillar = [box(0.3, 10, 0.3, 0.25 + 0.15, 5, -4)];
  const p = chasePlace(pillar, head, az, el, r);
  assert.ok(-p.pos.z < 4 - 0.15, `stops before the pillar (${(-p.pos.z).toFixed(2)} m)`);
  // nothing in the way: as before, the full distance
  const free = chasePlace([], head, az, el, r);
  assert.ok(Math.abs(free.pos.distanceTo(head) - r) < 1e-9 && free.lift === 0);
  // the ground rising behind (a bank): 1.4 m over it, and still nothing between – with a roof over the bank
  const groundAt = (x, z) => (z < -5 ? 3 : 0);
  const g = chasePlace([], head, az, el, r, { groundAt });
  assert.ok(g.pos.y >= 3 + 1.4 - 1e-9, `over the bank (${g.pos.y.toFixed(2)})`);
  const roof = [box(30, 0.4, 20, 0, 4.9, -16, THREE.DoubleSide)];
  const gr = chasePlace(roof, head, az, el, r, { groundAt });
  assert.ok(clearBetween(roof, head, gr.pos), "lifted off the ground and still in clear view");
});
