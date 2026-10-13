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
