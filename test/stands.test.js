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
  const list = [{ n: "V1/V2 Main", a: [0, 30], b: [150, 30] }, { n: "Grandstand K", a: [400, 10], b: [500, 10] }];
  const b = (name, cx) => ({ kind: "block", name, h: 8, min: 0, pts: box(cx - 40, 25, cx + 40, 45) });
  const blds = [b("V1", 60), b("V2", 100), b("V1", 900), b("K", 450), b("Hotel", 300), b("Tribuna K", 470), { ...b("V2", 120), min: 6 }];
  standBuildings(blds, list);
  assert.deepStrictEqual(blds.map((x) => x.kind), ["grandstand", "grandstand", "block", "grandstand", "block", "grandstand", "block"],
    "the parts of a listed name, near it; one 800 m away, another name, or a raised part stay buildings");
  assert.strictEqual(blds[0].standOf, "V1/V2 Main");
  // the same outline mapped twice (OSM's and another source's copy): the copy goes with the stand
  const twin = [b("Club B", 60), { ...b("Club B", 60), name: null }];
  standBuildings(twin, [{ n: "Club Corner", osmAt: [60, 35] }]);
  assert.deepStrictEqual(twin.map((x) => [x.kind, x.name, !!x.underTraced]), [["grandstand", "Club Corner", false], ["grandstand", null, true]]);
});

test("v0.70: a map building under a stand's traced plan keeps what it is on the map and the plans' seasons (a plan listed for some seasons swallows it in those only)", () => {
  const { standBuildings } = require("../src/main/scene.js");
  // one stand rebuilt between two seasons: a block up to 2025, the whole stand from 2026 – and a plan without seasons
  const list = [{ n: "Lando", poly: box(0, 20, 40, 40), yr: [2018, 2025] }, { n: "Lando", poly: box(0, 20, 200, 50), yr: [2026, null] }, { n: "Other", poly: box(300, 20, 360, 40) }];
  const b = (name, x0, x1, kind = "block") => ({ kind, name, h: 8, min: 0, pts: box(x0, 22, x1, 38) });
  const blds = [b("Stowe A", 100, 180), b("Stowe C", 5, 35), b("shed", 310, 350, "shed"), b("far", 500, 540)];
  standBuildings(blds, list);
  assert.deepStrictEqual(blds.map((x) => [x.kind, !!x.underTraced, x.kindOwn || null]), [["grandstand", true, "block"], ["grandstand", true, "block"], ["grandstand", true, "shed"], ["block", false, null]]);
  assert.deepStrictEqual(blds[0].underTracedYr, [[[2026, null], 1]], "under the 2026 plan only: in 2025 it is the map's building again (scenery.js)");
  assert.deepStrictEqual(blds[1].underTracedYr.map(([yr, share]) => JSON.stringify(yr) + " " + share).sort(), ["[2018,2025] 1", "[2026,null] 1"], "under both seasons' plans (each counted, not only the first found): never a building");
  assert.deepStrictEqual(blds[2].underTracedYr, [[null, 1]], "a plan without seasons: every season");
  // the rule scenery.js applies with the session's season: the plans of that season cover 0.4 of it or more
  const yrOn = (year) => (yr) => !yr || !year || !(year < yr[0] || (yr[1] != null && year > yr[1]));
  const kindIn = (x, year) => (x.underTracedYr.reduce((a, [yr, share]) => a + (yrOn(year)(yr) ? share : 0), 0) >= 0.4 ? "grandstand" : x.kindOwn);
  assert.deepStrictEqual([2024, 2025, 2026, 2030, null].map((y) => kindIn(blds[0], y)), ["block", "block", "grandstand", "grandstand", "grandstand"]);
  assert.deepStrictEqual([2024, 2026].map((y) => kindIn(blds[1], y)), ["grandstand", "grandstand"]); assert.strictEqual(kindIn(blds[2], 2019), "grandstand");
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

// v0.34: the data's side is the race direction's – the track's normal points to the cars' right (scene x east, z
// south: running east, the right is +z). Up to v0.33 "L" was built on the right (Imola's, Monaco's, Las Vegas' stands
// on the wrong side, or saved by the other-side retry).
test("grandstands: a listed stand's side L / R is left / right in the race's direction", async () => {
  const { buildStands } = await import("../src/renderer/stands.js");
  const w = world(), groundAt = () => 0;
  const scene = { areas: [], lines: [], buildings: [], stands: { list: [
    { n: "Right", a: [-150, 20], b: [-60, 20], side: "R", rows: 10 },
    { n: "Left", a: [60, -20], b: [150, -20], side: "L", rows: 10 },
  ] } };
  const r = buildStands({ scene, gf, world: w, groundAt, corridor: corridor(w), street: false, year: 2026 });
  const zOf = (n) => { const s = r.info.list.find((x) => x.n === n); return s.outline.reduce((a, p) => a + p[1], 0) / s.outline.length; };
  assert.ok(zOf("Right") > 7, "R: on the cars' right (+z running east)");
  assert.ok(zOf("Left") < -7, "L: on their left");
});

// v0.70: stands of one name, each with its own listed entry (and model): an entry marked on its stand's front edge belongs
// to that stand – not to the neighbour whose corner is nearer in degrees (Monza's three 6 Alta Velocità blocks)
test("listedEntry: of several entries with one name, the one marked on (or nearest to) this outline's edge", async () => {
  const { listedEntry } = await import("../src/renderer/stands.js");
  // three stands in a row along a meridian at 45.6° N, each 90 m long (lat) and 12 m deep (lon); each entry marked a metre
  // in front of its stand's front edge, at its middle
  const m = 1 / 111200, mx = 1 / (111320 * Math.cos((45.6 * Math.PI) / 180));
  const stand = (i) => { const la = 45.62 + i * 100 * m; return [[la, 9.28], [la + 90 * m, 9.28], [la + 90 * m, 9.28 + 12 * mx], [la, 9.28 + 12 * mx]]; };
  const entries = [0, 1, 2].map((i) => ({ n: "6 Alta", osmAt: [45.62 + (i * 100 + 45) * m, 9.28 - 1 * mx], id: i }));
  for (const i of [0, 1, 2]) assert.strictEqual(listedEntry(entries, stand(i)).id, i);
  // …and one marked just past its own stand's end, nearer a neighbour's corner in degrees than its own corner
  const e2 = [{ n: "A", osmAt: [45.62 + 45 * m, 9.28 + 18 * mx], id: 0 }, { n: "A", osmAt: [45.62 + 99 * m, 9.28 + 6 * mx], id: 1 }];
  assert.strictEqual(listedEntry(e2, stand(0)).id, 0, "6 m behind its own stand's back edge: nearer than the other's mark 9 m past the end");
  assert.strictEqual(listedEntry(e2, stand(1)).id, 1);
});

