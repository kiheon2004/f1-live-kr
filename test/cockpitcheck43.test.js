// v0.43: the cockpit check's inside test (cockpitcheck.js). The review's case: a closed unit cube said its own centre
// was outside – the vertical line through (0, 0) met the top face on the diagonal both its triangles share, and each
// counted it. These are synthetic shapes (three.js primitives and hand-made triangles), not car parts.
const test = require("node:test");
const assert = require("node:assert");

const load = async () => ({ THREE: await import("../src/renderer/vendor/three.module.js"), K: await import("../src/renderer/cockpitcheck.js") });
// a stand-in for a car: what cockpitSolids reads (its wheel's place, the chassis' skin)
const fake = (THREE, geos, range = [-10, 10]) => { const g = new THREE.Group(), wheel = new THREE.Group(); g.add(wheel); g.userData = { wheel, bodySkin: geos }; return { g, range }; };
const solid = async (geos) => { const { THREE, K } = await load(), { g, range } = fake(THREE, geos); return K.cockpitSolids(g, ["chassis"], range)[0]; };

test("cockpit check v0.43: a closed cube – inside points anywhere, on the shared diagonals, edges and corners of its faces' triangles", async () => {
  const { THREE, K } = await load(), S = await solid([new THREE.BoxGeometry(1, 1, 1)]);
  assert.ok(S.closed, "the cube is closed");
  // the review's two points: the centre (on both faces' diagonals) and one off them – both 0.5 straight up/down
  assert.strictEqual(K.insideDepth(S, 0, 0, 0), 0.5);
  assert.strictEqual(K.insideDepth(S, 0.01, 0, 0.02), 0.5);
  // on either diagonal of the top and bottom faces, at a corner's x / z, along a face's edge in x / z
  for (const [x, z] of [[0.25, 0.25], [-0.3, -0.3], [0.3, -0.3], [-0.2, 0.2], [0.49, 0.49], [0.49, -0.49], [0, 0.49]]) assert.ok(K.insideDepth(S, x, 0.1, z) > 0, `(${x}, ${z}) inside`);
  // just under the top: the depth is the distance up to it; the true nearest distance the smallest to any face
  assert.ok(Math.abs(K.insideDepth(S, 0, 0.49, 0) - 0.01) < 1e-9);
  const r = K.penetration(S, 0.3, 0.2, -0.3); assert.ok(r.inside && Math.abs(r.vertical - 0.3) < 1e-9 && Math.abs(r.nearest - 0.2) < 1e-9, JSON.stringify(r));
  assert.ok(Math.abs(K.penetration(S, 0.49999, 0, 0.49999).nearest - 1e-5) < 1e-9, "near a side face: the true depth tiny, the vertical one not");
  // outside, on the skin (top face, a side face, an edge, a corner): never inside
  for (const p of [[0, 0.6, 0], [0.6, 0, 0], [0, 0.5, 0], [0.5, 0, 0], [0, 0, 0.5], [-0.5, -0.2, 0.5], [0.5, 0.5, 0.5], [0, -0.5, 0]]) assert.strictEqual(K.insideDepth(S, ...p), 0, `${p} not inside`);
});

test("cockpit check v0.43: a vertical line through a shared corner of many triangles (a fan), equal heights met twice, faces seen almost edge on", async () => {
  const { THREE, K } = await load();
  // a sphere: every pole is a corner shared by a fan of triangles; the line through the axis meets both poles
  const ball = await solid([new THREE.SphereGeometry(0.5, 16, 12)]);
  assert.ok(ball.closed);
  assert.ok(Math.abs(K.insideDepth(ball, 0, 0, 0) - 0.5) < 1e-6, "through both poles: inside");
  assert.ok(K.insideDepth(ball, 0, 0.3, 0) > 0 && K.insideDepth(ball, 0, 0.6, 0) === 0);
  // a cylinder on its side and one standing: its round wall is seen edge on along the line in places
  const lying = new THREE.CylinderGeometry(0.3, 0.3, 1, 24); lying.rotateZ(Math.PI / 2);
  const L = await solid([lying]);
  for (const [x, y, z] of [[0, 0, 0], [0.4, 0, 0.29], [-0.49, 0.1, 0], [0, 0, -0.299]]) assert.ok(K.insideDepth(L, x, y, z) > 0, `lying cylinder (${x}, ${y}, ${z})`);
  for (const [x, y, z] of [[0, 0, 0.31], [0.51, 0, 0], [0, 0.31, 0]]) assert.strictEqual(K.insideDepth(L, x, y, z), 0);
  const C = await solid([new THREE.CylinderGeometry(0.3, 0.3, 1, 24)]);
  for (const [x, z] of [[0, 0], [0.29, 0], [0, -0.29], [0.2, 0.2]]) assert.ok(K.insideDepth(C, x, 0.2, z) > 0, `standing cylinder (${x}, ${z})`);
  // a box tilted to 89.9°: its big faces almost edge on to the line
  const tilt = new THREE.BoxGeometry(0.02, 1, 1); tilt.rotateZ(0.0017); const T = await solid([tilt]);
  assert.ok(K.insideDepth(T, 0, 0.2, 0) > 0 && K.insideDepth(T, 0.011, 0.2, 0.1) === 0 && K.insideDepth(T, -0.011, 0, 0.1) === 0);
});

test("cockpit check v0.43: the same answer wherever the corners fall – a grid of points against a cube made of many small triangles, against the plain answer", async () => {
  const { THREE, K } = await load(), S = await solid([new THREE.BoxGeometry(1, 1, 1, 4, 3, 5)]);
  let checked = 0;
  // (on the grid of the faces' own corners and edges: x and z every eighth – every line passes through shared edges)
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) for (const y of [-0.4, 0, 0.3]) {
    const x = i / 8, z = j / 8, inside = Math.abs(x) < 0.5 && Math.abs(z) < 0.5;
    assert.strictEqual(K.insideDepth(S, x, y, z) > 0, inside, `(${x}, ${y}, ${z})`); checked++;
  }
  assert.ok(checked > 300);
});

test("cockpit check v0.43: overlapping solids are judged one by one; an open mesh is never judged by the count", async () => {
  const { THREE, K } = await load();
  // two cubes overlapping, merged into one mesh (two closed skins – as the torso's chest, pelvis and thighs): a point
  // inside both crosses four times and one count says outside; the check splits a mesh into its connected pieces and
  // judges each – inside either is inside
  const a = new THREE.BoxGeometry(1, 1, 1), b = new THREE.BoxGeometry(1, 1, 1); b.translate(0.3, 0.2, 0);
  const BU = await import("../src/renderer/vendor/BufferGeometryUtils.js"), both = BU.mergeGeometries([a.toNonIndexed(), b.toNonIndexed()]);
  const { g, range } = fake(THREE, [both]), parts = K.cockpitSolids(g, ["chassis"], range);
  assert.strictEqual(parts.length, 2, "two pieces");
  const inAny = (x, y, z) => parts.some((S) => K.insideDepth(S, x, y, z) > 0);
  assert.ok(inAny(0.2, 0.1, 0), "inside both: inside");
  assert.ok(inAny(0.7, 0.1, 0) && inAny(-0.3, 0, 0) && !inAny(0.9, 0.1, 0) && !inAny(-0.3, 0.6, 0));
  // an open box (its top face taken away): marked open, the count never used (insideDepth 0); the winding number
  // still says a point deep in it is mostly enclosed (> ½) and one outside is not
  const box = new THREE.BoxGeometry(1, 1, 1), I = box.index.array, keep = [];
  for (let i = 0; i < I.length; i += 3) { const ys = [0, 1, 2].map((j) => box.attributes.position.getY(I[i + j])); if (!ys.every((y) => y > 0.49)) keep.push(I[i], I[i + 1], I[i + 2]); }
  box.setIndex(keep);
  const O = await solid([box]);
  assert.ok(!O.closed && O.openEdges === 4, `open edges ${O.openEdges}`);
  assert.strictEqual(K.insideDepth(O, 0, -0.3, 0), 0, "an open mesh has no inside for the count");
  const deep = K.penetration(O, 0, -0.3, 0), out = K.penetration(O, 0, 0.8, 0);
  assert.ok(deep.inside && deep.open && Math.abs(deep.nearest - 0.2) < 1e-6, JSON.stringify(deep));
  assert.ok(!out.inside);
  // a closed skin's winding number: 1 inside, 0 outside
  const S = await solid([new THREE.BoxGeometry(1, 1, 1)]);
  assert.ok(Math.abs(K.windingNumber(S, 0.1, 0.2, -0.1) - 1) < 1e-9 && Math.abs(K.windingNumber(S, 2, 0, 0)) < 1e-9);
});

test("cockpit check v0.43: crossings between the vertices – a thin plate through a cube with every vertex outside it is found", async () => {
  const { THREE, K } = await load(), S = await solid([new THREE.BoxGeometry(0.2, 0.2, 0.2)]);
  // a 1 m × 1 m plate through the middle of a 20 cm cube: two triangles, all four corners far outside
  const P = new THREE.PlaneGeometry(1, 1); P.rotateX(-Math.PI / 2);
  const tris = K.trianglesOf([P]);
  for (const t of tris) for (let i = 0; i < 9; i += 3) assert.strictEqual(K.insideDepth(S, t[i], t[i + 1], t[i + 2]), 0, "no vertex inside");
  const r = K.surfaceCrossings(tris, S);
  assert.ok(r.count >= 4, `crossings ${r.count}`);
  // spread over the plate's face, points do land inside
  const P2 = new THREE.PlaneGeometry(1, 1); P2.translate(0, 0, 0.5);
  assert.strictEqual(K.surfaceCrossings(K.trianglesOf([P2]), S).count, 0, "a plate beside the cube: no crossing");
});

test("cockpit check v0.43: the car's solids are closed skins – the rim's tube capped, the chassis' ends facing out (every edge met by its reverse)", async () => {
  const C = await import("../src/renderer/car3d.js"), K = await import("../src/renderer/cockpitcheck.js");
  for (const [season, team] of [[2025, "Ferrari"], [2026, "Aston Martin"], [2027, "Unknown"]]) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season });
    for (const S of K.cockpitSolids(car, ["chassis", "rim", "headrest", "torso"], [-10, 10])) {
      assert.ok(S.closed, `${season} ${team}: ${S.name} closed (${S.openEdges} open edges)`);
      const q = (x) => Math.round(x * 1e6), id = (t, i) => `${q(t[i])},${q(t[i + 1])},${q(t[i + 2])}`, D = new Set();
      let vol = 0;
      for (const t of S.tris) {
        vol += (t[0] * (t[4] * t[8] - t[5] * t[7]) - t[1] * (t[3] * t[8] - t[5] * t[6]) + t[2] * (t[3] * t[7] - t[4] * t[6])) / 6;
        const v = [id(t, 0), id(t, 3), id(t, 6)]; if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
        for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) D.add(v[a] + "|" + v[b]);
      }
      let lone = 0; for (const k of D) { const [a, b] = k.split("|"); if (!D.has(b + "|" + a)) lone++; }
      assert.strictEqual(lone, 0, `${season} ${team}: ${S.name} – ${lone} edges wound the same way on both sides (a face turned in)`);
      assert.ok(vol > 0, `${season} ${team}: ${S.name} faces out (volume ${vol.toFixed(4)})`);
    }
  }
});
