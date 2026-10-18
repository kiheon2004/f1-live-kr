// Monaco's harbour (harbour.js): only Monaco in 2025 / 2026; yachts only on the sea, out of the fairways, never on top of
// each other, along their zones' quays; deterministic; floating on the given sea level
const test = require("node:test");
const assert = require("node:assert");
const load = () => import("../src/renderer/harbour.js");

test("harbour: Monaco 2025 / 2026 only", async () => {
  const { harbourFor } = await load();
  assert.deepStrictEqual([harbourFor(22, 2025), harbourFor(22, 2026), harbourFor(22, 2024), harbourFor(2, 2026), harbourFor(61, 2026)], [true, true, false, false, false]);
});

test("harbour: yachts on the sea only, out of the fairways, apart, the same every time", async () => {
  const { layoutYachts, MONACO_FAIRWAYS } = await load();
  // a flat frame: 1e-5° ≈ 1.1 m; the "land": a band north of 43.7369 and everything east of 7.4310
  const toScene = (la, lo) => [(lo - 7.4245) * 80500, -(la - 43.735) * 111200];
  const isSea = (x, z) => -z / 111200 + 43.735 < 43.7369 && x / 80500 + 7.4245 < 7.431;
  const a = layoutYachts({ toScene, isSea }), b = layoutYachts({ toScene, isSea });
  assert.ok(a.length > 30, `${a.length} yachts`);
  assert.deepStrictEqual(a, b, "deterministic");
  const fair = MONACO_FAIRWAYS.map((P) => P.map(([la, lo]) => toScene(la, lo)));
  const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  for (const y of a) {
    const ux = Math.sin(y.yaw), uz = Math.cos(y.yaw);
    for (const f of [-0.35, 0, 0.5]) { const x = y.x + ux * f * y.L, z = y.z + uz * f * y.L; assert.ok(isSea(x, z), `on land: ${y.zone}`); assert.ok(!fair.some((P) => inPoly(x, z, P)), `in a fairway: ${y.zone}`); }
  }
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) assert.ok(Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z) > Math.min(a[i].B, a[j].B) * 0.9, "two yachts in one place");
  assert.ok(a.every((y) => y.L >= 10 && y.L <= 150 && y.B < y.L / 3));
});

test("harbour: the yachts float on the sea level given (not the ground's height)", async () => {
  const H = await load();
  const y = H.yachtMeshes([{ x: 0, z: 0, yaw: 0, L: 40, B: 8, zone: "t" }], -21.95);
  const m = y.group.children[0], m4 = new (require("../src/renderer/vendor/three.module.js").Matrix4)();
  m.getMatrixAt(0, m4);
  assert.ok(Math.abs(m4.elements[13] + 21.95) < 0.05, `y ${m4.elements[13]}`);
});

// v0.38: hulls at an angle (quays meeting, piers facing each other) – the overlap test takes both hulls' directions
test("harbour: hull overlap by both hulls' axes (oriented rectangles)", async () => {
  const { hullsOverlap } = await load();
  const a = { x: 0, z: 0, yaw: 0, L: 40, B: 8 };
  // perpendicular, the second's bow reaching across the first's side: overlap (the old check, taking it as parallel and
  // side by side 12 m apart, let it through)
  assert.strictEqual(hullsOverlap(a, { x: 12, z: 5, yaw: Math.PI / 2, L: 30, B: 6 }), true);
  assert.strictEqual(hullsOverlap(a, { x: 25, z: 5, yaw: Math.PI / 2, L: 30, B: 6 }), false, "its stern 10 m beyond the side");
  // parallel neighbours 0.5 m apart: apart without margin, together with 0.4 m each side
  const n = { x: 8.5, z: 0, yaw: 0, L: 40, B: 8 };
  assert.deepStrictEqual([hullsOverlap(a, n), hullsOverlap(a, n, 0.4)], [false, true]);
  // a diagonal one near a corner: corner-to-corner clear
  assert.strictEqual(hullsOverlap(a, { x: 26, z: 26, yaw: Math.PI / 4, L: 20, B: 5 }), false);
});

test("harbour: no two hulls overlap in the layout (oriented test, 0.8 m apart)", async () => {
  const { layoutYachts, hullsOverlap } = await load();
  const toScene = (la, lo) => [(lo - 7.4245) * 80500, -(la - 43.735) * 111200];
  const isSea = (x, z) => -z / 111200 + 43.735 < 43.7369 && x / 80500 + 7.4245 < 7.431;
  const a = layoutYachts({ toScene, isSea });
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) assert.ok(!hullsOverlap(a[i], a[j], 0.39), `${a[i].zone} × ${a[j].zone}`);
});
