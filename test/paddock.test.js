// The estimated paddock and the pit wall (v0.14 review): units stand flat on their own ground (with a footing where
// it falls away), not at the pit building's floor; a unit that would stand in a neighbouring building or across a
// mapped way is left out (the neighbour stays); what the paddock and wall occupy keeps trees off without counting as
// the building replaced; a team's stand on the wall follows the wall between its samples; the registry says what is
// confirmed, read off photos or the map, or inferred.
const test = require("node:test");
const assert = require("node:assert");

const load = () => import("../src/renderer/facilities.js");
const three = () => import("../src/renderer/vendor/three.module.js");
const LAT0 = 52, LON0 = -1, M_LAT = 111320, M_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const gf = { xz: ([X, Y]) => [X, -Y], fromLL: (lat, lon) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT], toLL: (x, z) => [LAT0 - z / M_LAT, LON0 + x / M_LON] };
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
// a pit building along x (F1 y 0..30 → scene z −30..0), the track at scene z −60, the paddock behind it (scene z > 0)
const pits = () => ({ name: "Pits", kind: "block", cls: "yes", est: 1, pts: rect(-150, 0, 150, 30), min: 0, h: 8 });
const SPEC = (paddock = {}) => ({ id: "p", loc: ["T"], status: "permanent", checked: "t", replaces: { names: /^Pits$/ }, builder: "pitBuilding",
  params: { garages: 30, height: 12, plate: 0.8, overhang: { pit: 2, paddock: 1, end: 1 }, facade: { pit: "pitGlass", paddock: "paddockPanels" },
    pitWall: { height: 1.1, thick: 0.5, fence: 3, walk: 8, deck: 1 },
    paddock: { years: [2026, 2026], margin: 6, street: 20, awning: { d: 4, h: 3.6 }, unit: { w: 18, d: 14, h: 8.5, gap: 4 }, ...paddock } } });
const build = (F, scene, extra = {}) => F.buildFacilities({ scene, gf, groundAt: () => 0, location: "T", year: 2026, trial: true, toTrack: () => [0, -1], alongTrack: () => [1, 0], registry: [SPEC()], ...extra });

test("paddock: units stand flat on their own ground, a footing where it falls away – not at the pit building's floor", async () => {
  const F = await load(), THREE = await three();
  // the paddock rises 3 m behind the building (scene z > 20), and falls 1 m across each unit's depth
  const groundAt = (x, z) => (z > 20 ? 3 + (z - 20) / 14 : 0);
  const r = await build(F, { location: "T", buildings: [pits()] }, { groundAt });
  const walls = r.group.getObjectByName("unitWall");
  assert.ok(walls, "units built");
  const pos = walls.geometry.attributes.position, lowest = new Map();
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i); const k = Math.round(x) + "," + Math.round(z); lowest.set(k, Math.min(lowest.get(k) ?? Infinity, y)); }
  let buried = 0; for (const [k, y] of lowest) { const [x, z] = k.split(",").map(Number); if (y < groundAt(x, z) - 0.05) buried++; }
  assert.strictEqual(buried, 0, "no unit wall starts below the ground it stands on");
  const b = new THREE.Box3().setFromObject(walls);
  assert.ok(b.min.y >= 3 - 0.05, `units on the paddock's ground (${b.min.y.toFixed(2)}), not the building's floor (0)`);
  assert.ok(r.group.getObjectByName("unitFooting"), "a footing under the downhill side");
});

test("paddock: a unit that would stand in a neighbour or across a mapped way is left out – the neighbour stays", async () => {
  const F = await load();
  // a neighbouring building where the first units would go (scene z 20..34 behind the building: F1 y −20..−34)
  const hut = { name: "Hut", kind: "block", cls: "yes", est: 0, pts: rect(-140, -80, -100, -22), min: 0, h: 5 };   // too deep to clear
  const way = { k: "path", w: 2, sub: "footway", pts: [[60, -10], [60, -60]] };
  const shed = { name: null, kind: "shed", cls: "shed", est: 1, pts: rect(15, -30, 20, -25), min: 0, h: 3 };   // unnamed, where a unit would go
  const r = await build(F, { location: "T", buildings: [pits(), hut, shed], lines: [way] });
  const pd = r.info[0].paddock;
  assert.ok(pd.units > 0 && pd.skipped.length >= 2, JSON.stringify(pd));
  assert.ok(pd.skipped.some((s) => /Hut|building/.test(s.why)) && pd.skipped.some((s) => /way|path|road/.test(s.why)));
  assert.strictEqual(r.skip(hut), false, "the neighbour isn't hidden to make room");
  assert.strictEqual(r.skip(shed), false, "nor an unnamed shed in the paddock (it isn't part of the pit building)");
  // what the paddock occupies keeps trees off, without being the building it replaces
  // a lane of the map along the paddock where the street was guessed: the units move back beyond it, none is lost to it
  const lane = { k: "road", w: 4.5, sub: "service", pts: [[-160, -22], [160, -22]] };
  const r2 = await build(F, { location: "T", buildings: [pits()], lines: [lane] });
  assert.ok(r2.info[0].paddock.shifted > 0 && !r2.info[0].paddock.skipped.some((s) => s.what === "unit"), JSON.stringify(r2.info[0].paddock.skipped));
  const unit = r.info[0].paddock.placed[0];
  assert.ok(r.keepOut(unit[0], unit[1]), "no tree in a unit");
});

test("pit wall: a team's stand follows the wall between its samples", async () => {
  const F = await load();
  // the track's edge runs at a slant: 30 m out from the garages at x = −150, 40 m at x = 150
  const trackEdge = (x, z) => z + 60 + ((x + 150) / 300) * 10;
  const r = await build(F, { location: "T", buildings: [pits()] }, { trackEdge });
  const G = r.group.children[0].userData.garages;
  const a = G.wallAt(-30), b = G.wallAt(-27), m = G.wallAt(-28.5);
  for (const k of [0, 2]) assert.ok(Math.abs(m.p[k] - (a.p[k] + b.p[k]) / 2) < 0.05, `between samples it's between them (axis ${k})`);
  assert.ok(Math.abs(G.wallAt(-28.5).p[0] + 28.5) < 0.6, "at the place asked for, not the sample before it");
});

test("registry: what each facility's numbers rest on – confirmed, read off photos or the map, inferred – with dates and licences", async () => {
  const { FACILITIES } = await load();
  for (const f of FACILITIES) {
    const e = f.evidence;
    assert.ok(e && ["confirmed", "photo", "map", "inferred"].every((k) => Array.isArray(e[k])), `${f.id}: evidence by kind`);
    assert.ok(e.confirmed.length + e.photo.length + e.map.length > 0, f.id);
  }
  const pd = FACILITIES.find((f) => f.id === "silverstone-wing").params.paddock;
  assert.ok(pd.basis?.seen && pd.basis.licence && pd.basis.uncertain && pd.basis.kind === "photo estimate", "the 2026 paddock: when seen, licence, what's uncertain");
});
