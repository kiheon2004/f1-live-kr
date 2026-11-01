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
