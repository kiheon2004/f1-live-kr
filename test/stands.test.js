// Grandstands (v0.34): a map building under a listed stand's own name is that stand, not an obstacle; outlines – the
// map's or traced from aerial imagery – are built as deep as they are; standing areas and other seasons aren't built.
const test = require("node:test");
const assert = require("node:assert");

// (stands.js paints a lattice texture on a canvas: a canvas that draws nothing is enough here)
const noop = new Proxy(() => {}, { get: (t, k) => (k === "canvas" ? {} : noop), apply: () => undefined, set: () => true });
global.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };

// a straight track along +x (scene metres), 14 m wide, sampled every 2 m; scene x, z = the F1 metres given (gf.xz)
function world(len = 800) {
  const samples = [];
  for (let i = 0; i <= len / 2; i++) samples.push({ i, p: { x: i * 2 - len / 2, z: 0, distanceTo: (q) => Math.hypot(q.x - (i * 2 - len / 2), q.z) }, nor: { x: 0, z: 1 }, tan: { x: 1, z: 0 }, L: 7, R: -7 });
  const nearest = (x, z) => { let best = null, bd = Infinity; for (const s of samples) { const d = Math.hypot(s.p.x - x, s.p.z - z); if (d < bd) { bd = d; best = s; } } return [best, bd]; };
  return { samples, grid: { nearest } };
}
function corridor(w, margin = 3.5) {
  const local = (x, z) => { const [s, d] = w.grid.nearest(x, z); if (!s || d > 50) return null; return { s, l: z, a: x - s.p.x }; };
  return { local, on: (x, z, m = margin) => { const q = local(x, z); return !!q && Math.abs(q.a) < 3 && q.l < 7 + m && q.l > -7 - m; }, clearPolygon: (pts) => pts };
}
const gf = { xz: (p) => [p[0], p[1]] };
const box = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

test("a map building under a listed stand's name (OSM's 'V1' at Suzuka) becomes that stand – only near it", () => {
  const { standBuildings } = require("../src/main/scene.js");
  const list = [{ n: "V1/V2 Main", a: [0, 30], b: [150, 30] }, { n: "Grandstand K", a: [400, -40], b: [500, -40] }];
  const b = (name, cx) => ({ kind: "block", name, h: 8, min: 0, pts: box(cx - 40, 25, cx + 40, 45) });
  const blds = [b("V1", 60), b("V2", 100), b("V1", 900), b("K", 450), b("Hotel", 60), b("Tribuna K", 470), { ...b("V2", 120), min: 6 }];
  standBuildings(blds, list);
  assert.deepStrictEqual(blds.map((x) => x.kind), ["grandstand", "grandstand", "block", "grandstand", "block", "grandstand", "block"],
    "the parts of a listed name, near it; one 800 m away, another name, or a raised part stay buildings");
  assert.strictEqual(blds[0].standOf, "V1/V2 Main");
});

test("grandstands: outlines are built as deep as they are; a stand in the way of a big building says which", async () => {
  const { buildStands, rayCross } = await import("../src/renderer/stands.js");
  assert.deepStrictEqual(rayCross(0, 0, 0, 1, box(-5, 10, 5, 22)), [10, 22]);
  assert.strictEqual(rayCross(0, 0, 0, -1, box(-5, 10, 5, 22)), null);
  const w = world(), groundAt = () => 0;
  // a traced outline 12 m deep along the track; the circuit's (estimated) seats far more than it holds
  const scene = { areas: [], lines: [], buildings: [{ kind: "block", name: "Media centre", h: 20, min: 0, pts: box(150, 12, 260, 60) }, { kind: "block", name: "Pits", h: 10, min: 0, pts: box(150, -60, 260, -12) }],
    stands: { seats: 90000, list: [
      { n: "T", poly: [[-100, 12], [0, 12], [0, 24], [-100, 24]], img: "test imagery" },
      { n: "Blocked", a: [160, 14], b: [250, 14], side: "L", rows: 20 },
      { n: "Lawn", a: [-300, 15], b: [-200, 15], rows: 10, type: "ga" },
      { n: "Old", a: [-300, -15], b: [-200, -15], rows: 10, yr: [2019, 2024] },
    ] } };
  const r = buildStands({ scene, gf, world: w, groundAt, corridor: corridor(w), street: false, year: 2026 });
  const t = r.info.list.find((s) => s.n === "T");
  assert.ok(t, "the traced stand is built");
  assert.strictEqual(t.rows, Math.floor((12 - 1.6) / 0.8), "its rows fill its 12 m – not grown towards the seat total");
  assert.ok(r.info.dead.some((d) => d.startsWith("Blocked") && d.includes("Media centre")), `the obstacle named: ${r.info.dead}`);
  assert.ok(r.info.skipped.includes("Lawn: standing / grass") && r.info.skipped.includes("Old: not in 2026"));
  assert.ok(!r.info.list.some((s) => s.n === "Lawn" || s.n === "Old"));
});
