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
