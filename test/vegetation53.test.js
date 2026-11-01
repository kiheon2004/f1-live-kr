// v0.53 vegetation (vegetation.js): seven crown forms, trunk + crown in one geometry with the bark marked; trees stand
// on their base (no crown below the ground, no floating trunk); the species mix sums to 1 at every latitude; stands
// (one form for most trees of a 45 m cell); bark keeps its colour (shader change present); deterministic.
const test = require("node:test");
const assert = require("node:assert");
const load = () => import("../src/renderer/vegetation.js");

test("every form: one geometry with position / normal / colour / bark, base on the ground, sensible size", async () => {
  const { vegGeometries, SPECIES } = await load();
  const V = vegGeometries();
  const tris = {};
  for (const k of SPECIES) {
    const g = V[k]; assert.ok(g, k);
    for (const a of ["position", "normal", "color", "bark"]) assert.ok(g.attributes[a], `${k}: ${a}`);
    const n = g.attributes.position.count; assert.strictEqual(g.attributes.bark.count, n); assert.strictEqual(g.attributes.color.count, n);
    g.computeBoundingBox(); const b = g.boundingBox;
    tris[k] = n / 3;
    // (the instance stands 0.15 m into the ground – scenery.js; a trunk starts at 0, a shrub's lobe a little below)
    assert.ok(b.min.y > -0.6 && b.min.y < 0.3, `${k}: base at the ground (${b.min.y.toFixed(2)})`);
    const h = b.max.y, w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    if (k === "shrub") assert.ok(h < 2.5 && w < 4, `${k} small`);
    else assert.ok(h > 7 && h < 12.5 && w > 1.5 && w < 9, `${k}: ${h.toFixed(1)} m tall, ${w.toFixed(1)} m wide`);
    for (let i = 0; i < n; i++) { const nx = g.attributes.normal.getX(i), ny = g.attributes.normal.getY(i), nz = g.attributes.normal.getZ(i); assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-3, `${k}: unit normals`); }
    // bark only at the bottom (the trunk), crown above it
    let barkTop = -1, crownLow = 99; for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i); if (g.attributes.bark.getX(i) > 0.5) barkTop = Math.max(barkTop, y); else crownLow = Math.min(crownLow, y); }
    if (k !== "shrub") assert.ok(barkTop > 1 && barkTop < 10, `${k}: a trunk`); else assert.strictEqual(barkTop, -1, "shrub: no trunk");
  }
  // the cost stays that of the v0.52 trees (≤ ~100 triangles a tree)
  for (const [k, t] of Object.entries(tris)) assert.ok(t <= 100, `${k}: ${t} triangles`);
  // the crown forms differ (height / width ratio)
  const ratio = (k) => { const b = V[k].boundingBox; return b.max.y / Math.max(b.max.x - b.min.x, b.max.z - b.min.z); };
  assert.ok(ratio("oval") > ratio("round") * 1.3, "oval taller than round");
  assert.ok(ratio("spread") < ratio("round"), "spread flatter than round");
  assert.ok(ratio("slender") > ratio("spruce") * 1.5, "slender narrower than spruce");
});

test("the mix sums to 1 at every latitude; the Mediterranean gets columnar and umbrella trees, the north spruce", async () => {
  const { speciesMix } = await load();
  for (let lat = -60; lat <= 60; lat += 1) { const m = speciesMix(lat); const s = Object.values(m).reduce((a, b) => a + b, 0); assert.ok(Math.abs(s - 1) < 1e-9, `lat ${lat}: ${s}`); for (const v of Object.values(m)) assert.ok(v >= 0); }
  const monza = speciesMix(43.7), spa = speciesMix(50.4), lusail = speciesMix(25.5);
  assert.ok(monza.slender > spa.slender && monza.spread > spa.spread);
  assert.ok(spa.spruce > monza.spruce);
  assert.ok(lusail.palm > 0.5);
});

test("stands: most trees of a cell share its form; a stand's height factor is shared; deterministic", async () => {
  const { speciesAt, speciesMix, standHeight, rand, STAND } = await load();
  const mix = speciesMix(47.6), r = rand(5);
  let same = 0, n = 0, forms = new Set();
  for (let c = 0; c < 40; c++) {
    const x0 = c * STAND * 3 + 1, z0 = 7, seen = new Map();
    for (let i = 0; i < 60; i++) { const k = speciesAt(x0 + r() * (STAND - 2), z0 + r() * (STAND - 2), mix, r(), r()); seen.set(k, (seen.get(k) || 0) + 1); forms.add(k); }
    same += Math.max(...seen.values()); n += 60;
    assert.strictEqual(standHeight(x0, z0), standHeight(x0 + 10, z0 + 10));
  }
  assert.ok(same / n > 0.6, `a cell's main form: ${(same / n * 100).toFixed(0)} %`);
  assert.ok(forms.size >= 4, `several forms across a venue: ${[...forms]}`);
  assert.strictEqual(speciesAt(123.4, 567.8, mix, 0.3, 0.9), speciesAt(123.4, 567.8, mix, 0.3, 0.9));
  for (let i = 0; i < 200; i++) { const h = standHeight(i * 37.1, i * 11.3); assert.ok(h >= 0.85 && h <= 1.15); }
});

test("the material keeps the bark's colour from the instance's tint (shader change in place, one program key)", async () => {
  const { treeMaterial } = await load();
  const m = treeMaterial(), s = { vertexShader: "#include <color_pars_vertex>\nvoid main(){\n#include <color_vertex>\n}" };
  m.onBeforeCompile(s);
  assert.match(s.vertexShader, /attribute float bark;/);
  assert.match(s.vertexShader, /mix\( instanceColor\.rgb, vec3\( 1\.0 \), bark \)/);
  assert.strictEqual(m.customProgramCacheKey(), treeMaterial({ side: 2 }).customProgramCacheKey());
  assert.ok(m.vertexColors);
});

test("near crowns: smooth lobes enclose the far ones (no flicker where both are drawn), 4× the faces, no trunk", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const { vegGeometries, smoothLobe, NEAR_FORMS } = await load();
  const V = vegGeometries();
  for (const f of NEAR_FORMS) {
    const far = V[f], near = V.near[f]; assert.ok(near, f);
    assert.strictEqual(near.attributes.bark.array.every((b) => b === 0), true, `${f}: no trunk in the near crown`);
    const farCrown = far.attributes.bark.array.filter((b) => b === 0).length;
    assert.strictEqual(near.attributes.position.count, farCrown * 4, `${f}: each face in four`);
  }
  // enclosure of one lobe: every far vertex inside the near surface along its ray from the middle
  const lobe = new THREE.IcosahedronGeometry(1, 0), p = lobe.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + (i % 5) * 0.06), p.getY(i) * (0.85 + (i % 5) * 0.06), p.getZ(i) * (0.85 + (i % 5) * 0.06));
  const s = smoothLobe(lobe), ray = new THREE.Raycaster(), mesh = new THREE.Mesh(s, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), v = new THREE.Vector3();
  let worst = Infinity;
  // (points inside each far face – its middle and near its corners and edges; a ray through a corner exactly can slip
  // between the near faces meeting there)
  const W = [[1 / 3, 1 / 3, 1 / 3], [0.9, 0.05, 0.05], [0.05, 0.9, 0.05], [0.05, 0.05, 0.9], [0.48, 0.48, 0.04], [0.04, 0.48, 0.48], [0.48, 0.04, 0.48]];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) for (const [wa, wb, wc] of W) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    v.set(0, 0, 0).addScaledVector(a, wa).addScaledVector(b, wb).addScaledVector(c, wc);
    const L = v.length(); ray.set(new THREE.Vector3(), v.clone().normalize()); const h = ray.intersectObject(mesh)[0];
    assert.ok(h, "the ray meets the near lobe"); worst = Math.min(worst, h.distance - L);
  }
  assert.ok(worst > 0.002, `the near lobe outside the far one everywhere (≥ 2 mm a metre) (${worst.toFixed(4)})`);
});

test("near layer: only broadleaf crowns within the radius, refilled on a 15 m move or a new radius, none at radius 0", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const { nearTreeLayer, NEAR } = await load();
  const entries = [];
  const forms = ["round", "oval", "spread", "spruce", "slender", "palm", "shrub"];
  for (let i = 0; i < 400; i++) { const x = (i % 20) * 25, z = Math.floor(i / 20) * 25; entries.push({ form: forms[i % forms.length], m: new THREE.Matrix4().makeTranslation(x, 0, z), col: new THREE.Color(0.2, 0.4, 0.1) }); }
  const L = nearTreeLayer(entries, new THREE.MeshStandardMaterial());
  const cam = { x: 250, y: 2, z: 250 };
  assert.strictEqual(L.update(cam, 100), true);
  const want = entries.filter((e) => ["round", "oval", "spread", "shrub"].includes(e.form) && Math.hypot(e.m.elements[12] - 250, e.m.elements[14] - 250) <= 100).length;
  assert.strictEqual(L.shown(), want);
  const drawn = L.group.children.reduce((a, m) => a + m.count, 0); assert.strictEqual(drawn, want);
  for (const m of L.group.children) for (let i = 0; i < m.count; i++) { const q = new THREE.Matrix4(); m.getMatrixAt(i, q); assert.ok(Math.hypot(q.elements[12] - 250, q.elements[14] - 250) <= 100); }
  assert.strictEqual(L.update({ x: 255, y: 2, z: 255 }, 100), false, "a small move: kept");
  assert.strictEqual(L.update({ x: 250 + NEAR.move + 1, y: 2, z: 250 }, 100), true, "15 m: refilled");
  assert.strictEqual(L.update({ x: 266, y: 2, z: 250 }, 0), true); assert.strictEqual(L.shown(), 0);
  assert.ok(L.group.children.every((m) => !m.visible && m.count === 0), "radius 0: nothing drawn");
  assert.ok(L.group.children.every((m) => !m.castShadow), "no shadows of their own");
});
