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

// v0.15 review: an interleaved position attribute (glTF with a byte stride) keeps its version on its shared buffer –
// a change flagged there is seen; so are a new buffer, a new attribute and a plain attribute's change. The bounds are
// this module's own: a geometry changed without its bounding sphere recomputed is still found.
test("line of sight: interleaved positions changed (needsUpdate on the buffer) are seen, as are new buffers and stale bounds", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), { firstHit } = await import("../src/renderer/los.js");
  const d = new THREE.Vector3(0, 0, -1), mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const rcAt = (m, o) => { const rc = new THREE.Raycaster(o, d, 0, 50); return rc.intersectObject(m)[0]?.distance ?? null; };
  // one triangle at z = −5 in an interleaved buffer (x, y, z, pad), drawn whole
  const tri = (dx) => new Float32Array([dx, 0, -5, 9, dx + 10, 0, -5, 9, dx, 10, -5, 9]);
  const ib = new THREE.InterleavedBuffer(tri(0), 4), g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.InterleavedBufferAttribute(ib, 3, 0));
  const m = new THREE.Mesh(g, mat); m.updateMatrixWorld(true);
  assert.strictEqual(firstHit([m], new THREE.Vector3(1, 1, 0), d, 50), 5);
  // moved 200 m in place, flagged on the buffer, bounds recomputed: found there, not where it was – as three.js does
  ib.array.set(tri(200)); ib.needsUpdate = true; g.computeBoundingSphere();
  for (const x of [1, 201]) { const o = new THREE.Vector3(x, 1, 0); assert.strictEqual(firstHit([m], o, d, 50), rcAt(m, o), `x ${x}`); }
  // moved again without the bounds recomputed: three.js' raycaster skips it (stale sphere), the line of sight doesn't
  ib.array.set(tri(400)); ib.needsUpdate = true;
  assert.strictEqual(rcAt(m, new THREE.Vector3(401, 1, 0)), null, "(three.js: stale bounds)");
  assert.strictEqual(firstHit([m], new THREE.Vector3(401, 1, 0), d, 50), 5);
  // a new buffer under a new attribute, and then a plain attribute changed in place
  g.setAttribute("position", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(tri(600), 4), 3, 0));
  assert.strictEqual(firstHit([m], new THREE.Vector3(601, 1, 0), d, 50), 5);
  const plain = new THREE.Float32BufferAttribute([800, 0, -7, 810, 0, -7, 800, 10, -7], 3); g.setAttribute("position", plain);
  assert.strictEqual(firstHit([m], new THREE.Vector3(801, 1, 0), d, 50), 7);
  plain.array.set([900, 0, -3, 910, 0, -3, 900, 10, -3]); plain.needsUpdate = true;
  assert.strictEqual(firstHit([m], new THREE.Vector3(801, 1, 0), d, 50), null);
  assert.strictEqual(firstHit([m], new THREE.Vector3(901, 1, 0), d, 50), 3);
  // an interleaved geometry compared with three.js over random segments (several triangles, moved and scaled mesh)
  let seed = 3; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const box = new THREE.BoxGeometry(20, 8, 12).toNonIndexed(), src = box.attributes.position.array, n = src.length / 3;
  const arr = new Float32Array(n * 5); for (let i = 0; i < n; i++) arr.set([src[i * 3], src[i * 3 + 1], src[i * 3 + 2], 0, 0], i * 5);
  const g2 = new THREE.BufferGeometry(); g2.setAttribute("position", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(arr, 5), 3, 0));
  const m2 = new THREE.Mesh(g2, new THREE.MeshBasicMaterial()); m2.position.set(5, 4, -3); m2.rotation.y = 0.4; m2.scale.set(1.2, 1, 0.9); m2.updateMatrixWorld(true);
  for (let k = 0; k < 500; k++) {
    const o = new THREE.Vector3(r() * 60 - 30, r() * 12 - 2, r() * 60 - 30), dir = new THREE.Vector3(r() - 0.5, (r() - 0.5) * 0.5, r() - 0.5).normalize(), far = 5 + r() * 40;
    const rc = new THREE.Raycaster(o, dir, 0, far), ref = rc.intersectObject(m2)[0]?.distance ?? null, got = firstHit([m2], o, dir, far);
    assert.ok(ref == null ? got == null : got != null && Math.abs(got - ref) < 1e-4, `segment ${k}: ${got} vs ${ref}`);
  }
});

// v0.15 review: the chase camera checked where it ends up, for all three at once – clear line to the car, nothing
// within its own room (0.35 m: the near plane), 1.4 m over the ground – never moved after the check (the old ground
// lift, then pulling it in along the line, left it 6 cm over a bank under a roof).
test("chase camera: where it ends up the line is clear, no surface is within 0.35 m and it's 1.4 m over the ground – or it says not", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), { chasePlace, clearAround } = await import("../src/renderer/los.js");
  const box = (x0, y0, z0, x1, y1, z1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.updateMatrixWorld(true); return m; };
  const head = new THREE.Vector3(0, 1.1, 0), az = Math.PI, el = Math.atan2(2.4, 10.5), r = Math.hypot(2.4, 10.5);
  const rc = new THREE.Raycaster();
  const clearBetween = (meshes, a, b) => { const d = b.clone().sub(a), len = d.length(); rc.set(a, d.normalize()); rc.far = len; return !rc.intersectObjects(meshes, false).length; };
  // the room round a point measured by brute force: the nearest point of every box's surface (inside one: its nearest
  // face – a surface is what the near plane would cut; the line from the car can't get inside without crossing one)
  const toSurface = (b, p) => { if (!b.containsPoint(p)) return b.distanceToPoint(p); return Math.min(p.x - b.min.x, b.max.x - p.x, p.y - b.min.y, b.max.y - p.y, p.z - b.min.z, b.max.z - p.z); };
  const room = (meshes, p) => Math.min(Infinity, ...meshes.map((m) => toSurface(new THREE.Box3().setFromObject(m), p)));
  const holds = (name, meshes, groundAt, opts = {}) => {
    const out = chasePlace(meshes, head, az, el, r, { groundAt, ...opts }), p = out.pos;
    assert.ok(clearBetween(meshes, head, p), `${name}: clear line`);
    assert.ok(room(meshes, p) >= 0.35 - 1e-6, `${name}: ${room(meshes, p).toFixed(3)} m to the nearest surface`);
    if (groundAt) assert.ok(p.y - groundAt(p.x, p.z) >= 1.4 - 1e-6, `${name}: ${(p.y - groundAt(p.x, p.z)).toFixed(3)} m over the ground`);
    assert.strictEqual(out.safe, true, `${name}: said safe`);
    return out;
  };
  // the review's case: a bank 3 m high from 5 m behind, a roof 3.6–3.9 m over it
  const bank = (x, z) => (z < -5 ? 3 : 0);
  holds("bank under a low roof", [box(-20, 3.6, -20, 20, 3.9, -5.2)], bank);
  // ground sloping up behind (1 in 3) and a low roof over it
  const slope = (x, z) => Math.max(0, -z / 3);
  holds("slope under a roof", [box(-20, 4.5, -30, 20, 4.8, -4)], slope);
  // a bank behind a wall
  holds("bank behind a wall", [box(-20, 0, -4.4, 20, 2.5, -4)], (x, z) => (z < -4.4 ? 2 : 0));
  // a narrow passage (walls 1.2 m either side) with a lintel over it
  holds("narrow passage", [box(-1.6, 0, -15, -1.2, 6, 2), box(1.2, 0, -15, 1.6, 6, 2), box(-2, 4, -9, 2, 4.4, -8)], null);
  // a thin pillar (4 cm) right beside where the camera would stand, between the five lines: kept 0.35 m off
  const free = chasePlace([], head, az, el, r).pos;
  holds("thin pillar by the camera", [box(free.x + 0.18, 0, free.z - 0.02, free.x + 0.22, 6, free.z + 0.02)], null);
  // with the lift eased part way (the caller's value), every spot on the way holds too
  for (const lift of [0.1, 0.2, 0.35, 0.5, 0.7]) holds(`low wall, lift ${lift}`, [box(-15, 0, -1.9, 15, 1.8, -1.5)], null, { lift });
  // under a 2.2 m roof a spot 1.4–1.85 m up holds all three
  holds("tunnel 2.2 m high", [box(-3, 2.2, -40, 3, 2.6, 40), box(-3.4, 0, -40, -3, 2.6, 40), box(3, 0, -40, 3.4, 2.6, 40)], () => 0);
  // nowhere holds all three (a roof 1.6 m over the floor: 1.4 m over the ground is within 0.35 m of it): it says so,
  // and the spot it gives keeps the line clear and the surfaces off
  const tunnel = [box(-3, 1.6, -40, 3, 2, 40), box(-3.4, 0, -40, -3, 2, 40), box(3, 0, -40, 3.4, 2, 40)];
  const t = chasePlace(tunnel, head, az, el, r, { groundAt: () => 0 });
  assert.ok(!t.safe, "no spot 1.4 m over the floor and 0.35 m under a 1.6 m roof");
  assert.ok(clearBetween(tunnel, head, t.pos) && room(tunnel, t.pos) >= 0.35 - 1e-6, "the fallback still keeps the line and the surfaces");
  // the room check itself against brute force: random points among random boxes, turned
  let seed = 9; const rr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const boxes = []; for (let k = 0; k < 25; k++) { const b = box(-1, -1, -1, 1, 1, 1); b.scale.set(0.2 + rr() * 4, 0.2 + rr() * 4, 0.2 + rr() * 4); b.position.set(rr() * 40 - 20, rr() * 6, rr() * 40 - 20); b.updateMatrixWorld(true); boxes.push(b); }
  let near = 0;
  for (let k = 0; k < 3000; k++) {
    const p = new THREE.Vector3(rr() * 44 - 22, rr() * 8 - 1, rr() * 44 - 22), want = room(boxes, p) > 0.35;
    if (Math.abs(room(boxes, p) - 0.35) < 1e-4) continue;   // (on the edge: either)
    assert.strictEqual(clearAround(boxes, p, 0.35), want, `point ${k}`); if (!want) near++;
  }
  assert.ok(near > 50, `both cases (${near} near)`);
});
