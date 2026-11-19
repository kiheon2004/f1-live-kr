// v0.56: a circuit's own buildings as model files – a listed grandstand's model takes the built stand's place
// (stands.js `swaps`), a pit building's upper storeys stand on the builder's garages (facilities.js `upper`).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const noop = new Proxy(() => {}, { get: (t, k) => (k === "canvas" ? {} : noop), apply: () => undefined, set: () => true });
global.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };

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
const scene = (model) => ({ areas: [], lines: [],
  buildings: [{ kind: "grandstand", name: "Main", standOf: "Main", h: 14, min: 0, pts: box(-100, 20, 100, 50) }],
  stands: { list: [{ n: "Main", osmAt: [0, 35], roof: 1, perm: 1, ...(model ? { model } : {}) }, { n: "Other", a: [200, -20], b: [300, -20], side: "L", rows: 10 }] } });
const verts = (m) => m.geometry.attributes.position.count;

test("a listed stand with a model of its own is built apart from the shared mesh and can be replaced", async () => {
  const { buildStands } = await import("../src/renderer/stands.js");
  const w = world(), groundAt = () => 0, args = (sc, year) => ({ scene: sc, gf, world: w, groundAt, corridor: corridor(w), street: false, year });
  const plain = buildStands(args(scene(null), 2026)), r = buildStands(args(scene({ file: "x.glb", from: 2025, frontAt: 10 }), 2026));
  assert.strictEqual(plain.swaps.length, 0);
  assert.strictEqual(r.swaps.length, 1);
  const sw = r.swaps[0], own = r.group.children.find((o) => o.name === "stand:Main");
  assert.strictEqual(sw.name, "Main");
  assert.ok(own, "the stand's own mesh");
  assert.strictEqual(verts(r.structure) + verts(own), verts(plain.structure), "nothing lost or doubled: the two meshes together are the shared mesh of a build without the model");
  assert.ok(verts(own) > 100 && verts(r.structure) > 100, "both stands have a mesh");
  assert.strictEqual(r.info.seats, plain.info.seats);
  // where: on the front line's middle, the normal pointing from the track into the stand, as long as the outline
  assert.ok(Math.abs(sw.x) < 1 && sw.z > 7 && sw.z < 30, JSON.stringify([sw.x, sw.z]));
  assert.ok(sw.n[1] > 0.99, "the stand is on the +z side: its rows go back along +z");
  assert.ok(Math.abs(sw.len - 200) < 12, String(sw.len));
  // replaced: its mesh and seats hidden for good – the seats' per-frame distance rule does not bring them back
  const seats = r.group.children.find((o) => o.name === "seats").children;
  sw.replace();
  r.update({ x: 0, y: 5, z: 0 }, 1e6);
  assert.strictEqual(own.visible, false);
  assert.ok(seats.some((im) => im.visible), "the other stand's seats show close by");
  assert.ok(seats.filter((im) => im.userData.off).length > 0 && seats.filter((im) => im.userData.off).every((im) => !im.visible), "the replaced stand's seats stay hidden");
  assert.strictEqual(sw.replaced, true);
});

test("a stand's model applies from its first season on", async () => {
  const { buildStands } = await import("../src/renderer/stands.js");
  const w = world(), groundAt = () => 0;
  const r = buildStands({ scene: scene({ file: "x.glb", from: 2025, frontAt: 10 }), gf, world: w, groundAt, corridor: corridor(w), street: false, year: 2024 });
  assert.strictEqual(r.swaps.length, 0, "2024: the stand as the app builds it");
});

test("the shipped model files: listed, present, and passing the app's own model check", async () => {
  const F = await import("../src/renderer/facilities.js");
  const dir = path.join(__dirname, "..", "src", "data", "models");
  const stands = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "grandstands.json"), "utf8"));
  const files = [];
  for (const c of Object.values(stands.circuits || stands)) for (const s of c?.stands || []) if (s.model) { assert.ok(s.model.file && Number.isFinite(s.model.frontAt), s.n); assert.ok(s.model.src, s.n + ": its source is recorded"); files.push(s.model.file); }
  for (const f of F.FACILITIES) if (f.upper) { assert.strictEqual(f.builder, "pitBuilding", f.id); for (const k of ["garageTop", "front", "length", "depth"]) assert.ok(f.upper[k] > 0, f.id + " " + k); assert.ok(f.sources.some((x) => x.includes(f.upper.file)), f.id + ": the model's source is recorded"); files.push(f.upper.file); }
  for (const [key, u] of Object.entries(F.PIT_UPPERS)) { for (const k of ["garageTop", "front", "length", "depth"]) assert.ok(u[k] > 0, key + " " + k); assert.ok(u.src && u.src.includes(u.file), key + ": the model's source is recorded"); files.push(u.file); }
  // (a facility that is a model of its own – a tower, the team villas: v0.60)
  for (const f of F.FACILITIES) if (f.model?.file) { assert.ok(f.sources.some((x) => x.includes(f.model.file)), f.id + ": the model's source is recorded"); files.push(f.model.file); }
  assert.ok(files.includes("hun_stand_b.glb") && files.includes("hun_pit_upper_v2.glb") && files.includes("lv_stand_c.glb") && files.includes("lv_pit_upper.glb") && files.includes("lus_stand_c.glb") && files.includes("lus_pit_upper.glb"));
  assert.ok(["yas_stand_c.glb", "yas_pit_upper.glb", "yas_tower.glb", "lus_villas.glb"].every((f) => files.includes(f)), "v0.60: Yas Marina and the Lusail villas");
  assert.ok(["bh_dome_big.glb", "bh_dome_small.glb"].every((f) => files.includes(f)), "v0.62: Sakhir's two domes");
  assert.ok(["bh_stand_c.glb", "bh_pit_upper.glb", "bh_tower.glb"].every((f) => files.includes(f)), "Sakhir's main straight");
  assert.ok(files.includes("mel_pit_upper.glb") && F.PIT_UPPERS[10].from === 2028, "Albert Park's new pit building: from 2028");
  for (const f of files) { assert.match(f, /^[a-z0-9_-]+\.glb$/); assert.strictEqual(F.checkGlb(new Uint8Array(fs.readFileSync(path.join(dir, f)))), null, f); }
  assert.deepStrictEqual(fs.readdirSync(dir).filter((n) => n.endsWith(".glb")).sort(), [...new Set(files)].sort(), "no model file ships unused");
});

test("upper storeys on the builder's garages: on their front line, their slab on the garages' top, tilted with the floors, the rest filled", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const F = await import("../src/renderer/facilities.js");
  // garages along +x, their fronts at z = 10, the building behind them towards +z, 100 m long and 18 m deep; the floor rises 1 m over 100 m
  const slots = []; for (let k = 0; k < 10; k++) slots.push({ front: [-45 + k * 10, 10], floor: 5 + (-45 + k * 10) * 0.01, width: 10, inward: [0, 1], along: [1, 0] });
  const r = { garages: { slots, top: 4.8 }, footprint: [[-50, 10], [50, 10], [50, 28], [-50, 28]] };
  const root = new THREE.Group(); root.add(new THREE.Mesh(new THREE.BoxGeometry(140, 14, 26).translate(0, 12, 0), new THREE.MeshStandardMaterial()));
  const g = new THREE.Group(), up = F.addUpper(g, r, root, { file: "t.glb", garageTop: 5, front: 13, length: 140, depth: 26 });
  const h = g.getObjectByName("upperModel");
  assert.ok(Math.abs(h.position.x) < 1e-6 && Math.abs(h.position.z - 23) < 1e-6, "its garage front (13 m towards the track from the origin) on the built front line, its middle on the building's");
  assert.ok(Math.abs(h.position.y - (5 + 4.8 - 5)) < 1e-6, "the model's first slab underside on the garages' top");
  assert.ok(Math.abs(up.info.upperTilt - 1) < 0.01, "tilted as the floors rise: 1 %");
  const fills = []; g.traverse((o) => { if (o.name === "upperFill") fills.push(o); });
  assert.strictEqual(fills.length, 3, "plain walls under what the model covers beyond the built garages: its back and both ends");
  assert.deepStrictEqual(up.info.upperPast, [20, 20, 8]);
  // the facility's footprint is the model's: 140 × 26 m about (0, 23)
  const xs = up.footprint.map((p) => p[0]), zs = up.footprint.map((p) => p[1]);
  assert.ok(Math.abs(Math.min(...xs) + 70) < 1e-6 && Math.abs(Math.max(...xs) - 70) < 1e-6 && Math.abs(Math.min(...zs) - 10) < 1e-6 && Math.abs(Math.max(...zs) - 36) < 1e-6);
  assert.throws(() => F.addUpper(new THREE.Group(), { garages: { slots: [], top: 4.8 }, footprint: r.footprint }, root, { garageTop: 5, front: 13, length: 140, depth: 26 }), /no garages/);
});

// v0.57: Las Vegas – a stand built from its listed ends (or a curved outline) takes a model too; a pit building without
// an entry of its own gets its upper storeys by venue; a model's "…_lit" materials glow at night only.
test("a stand listed by its two ends takes a model as a mapped one does", async () => {
  const { buildStands } = await import("../src/renderer/stands.js");
  const w = world(), groundAt = () => 0;
  const sc = (model, year) => buildStands({ scene: { areas: [], lines: [], buildings: [], stands: { list: [{ n: "Ends", a: [-150, 20], b: [-60, 20], side: "R", rows: 10, ...(model ? { model } : {}) }, { n: "Other", a: [60, -20], b: [150, -20], side: "L", rows: 10 }] } }, gf, world: w, groundAt, corridor: corridor(w), street: false, year });
  const r = sc({ file: "x.glb", from: 2025, frontAt: 10 }, 2026);
  assert.deepStrictEqual(r.swaps.map((s) => s.name), ["Ends"]);
  assert.ok(r.swaps[0].n[1] > 0.99 && r.swaps[0].z > 7, "on the cars' right running east: +z, its rows going back along +z");
  assert.strictEqual(sc({ file: "x.glb", from: 2025, frontAt: 10 }, 2024).swaps.length, 0);
  assert.strictEqual(sc(null, 2026).swaps.length, 0);
});

test("a model's lit parts: materials named …_lit are dark by day; at night 1, or a lamp's own strength above 1", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const F = await import("../src/renderer/facilities.js");
  const mat = (name, extras = {}) => { const m = new THREE.MeshStandardMaterial({ emissive: 0xffffff }); m.name = name; Object.assign(m.userData, extras); return m; };
  const glass = mat("lv_glass_lit", { nightStrength: 0.35 }), lamp = mat("lamp_lit"), strong = mat("flood_lit", { nightStrength: 6 }), wall = mat("wall");
  const root = new THREE.Group(); for (const m of [glass, lamp, strong, wall]) root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m));
  F.nightParts(root);
  assert.deepStrictEqual(glass.userData.nightE, [0, 1], "a strength up to 1 is already in the file's emissive colour"); assert.strictEqual(glass.emissiveIntensity, 0);
  assert.deepStrictEqual(strong.userData.nightE, [0, 6]);
  assert.deepStrictEqual(lamp.userData.nightE, [0, 1]);
  assert.strictEqual(wall.userData.nightE, undefined); assert.strictEqual(wall.emissiveIntensity, 1);
});

test("upper storeys with their own ground-floor ends (fill: false) get no fill walls; Las Vegas' are listed by venue from 2023", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const F = await import("../src/renderer/facilities.js");
  const slots = []; for (let k = 0; k < 10; k++) slots.push({ front: [-45 + k * 10, 10], floor: 5, width: 10, inward: [0, 1], along: [1, 0] });
  const r = { garages: { slots, top: 4.8 }, footprint: [[-50, 10], [50, 10], [50, 28], [-50, 28]] };
  const root = new THREE.Group(); root.add(new THREE.Mesh(new THREE.BoxGeometry(140, 14, 26).translate(0, 13, 0), new THREE.MeshStandardMaterial()));
  const g = new THREE.Group(); F.addUpper(g, r, root, { file: "t.glb", garageTop: 6, front: 13, length: 140, depth: 26, fill: false });
  let fills = 0; g.traverse((o) => { if (o.name === "upperFill") fills++; });
  assert.strictEqual(fills, 0);
  assert.ok(Math.abs(g.getObjectByName("upperModel").position.y - (5 + 4.8 - 6)) < 1e-9, "lowered so its first slab sits on the garages' top");
  const lv = F.PIT_UPPERS[152]; assert.strictEqual(lv.file, "lv_pit_upper.glb"); assert.strictEqual(lv.fill, false); assert.strictEqual(lv.from, 2023);
  // (a terrace behind the body: the facility's footprint reaches as far back as the model – backTo)
  const up = F.addUpper(new THREE.Group(), r, root, { file: "t.glb", garageTop: 4.8, front: 13, length: 140, depth: 26, backTo: 20, fill: false });
  assert.ok(Math.abs(Math.max(...up.footprint.map((p) => p[1])) - (23 + 20)) < 1e-6);
});

// v0.58: hospitality buildings and standing areas an entry asks for (`build`) are built – plain blocks and decks, no
// seats, no share of the circuit's capacity; the others stay unbuilt. `apart`: not merged into the outline next to it.
test("hospitality and standing entries: built only when asked, without seats; `apart` keeps a stand beside an outline its own", async () => {
  const { buildStands } = await import("../src/renderer/stands.js");
  const w = world(), groundAt = () => 0;
  const list = [
    { n: "Seated", a: [-150, 20], b: [-60, 20], side: "R", rows: 10 },
    { n: "Club", a: [60, 20], b: [120, 20], side: "R", type: "hosp", levels: 3, depth: 14, build: 1 },
    { n: "Deck", a: [160, 20], b: [220, 20], side: "R", type: "ga", build: 1 },
    { n: "Old club", a: [240, 20], b: [300, 20], side: "R", type: "hosp" },
    { n: "In a hotel", a: [-300, 20], b: [-240, 20], side: "R", type: "hosp", levels: 2, depth: 10, build: 1, existing: 1 },
  ];
  const r = buildStands({ scene: { areas: [], lines: [], buildings: [], stands: { seats: 5000, list } }, gf, world: w, groundAt, corridor: corridor(w), street: false, year: 2026 });
  const by = Object.fromEntries(r.info.list.map((s) => [s.n, s]));
  assert.deepStrictEqual(Object.keys(by).sort(), ["Club", "Deck", "Seated"]);
  assert.strictEqual(by.Club.kind, "hosp"); assert.strictEqual(by.Club.seats, 0); assert.strictEqual(by.Club.levels, 3); assert.ok(Math.abs(by.Club.depth - 14) < 0.5, String(by.Club.depth));
  assert.strictEqual(by.Deck.kind, "ga"); assert.strictEqual(by.Deck.seats, 0); assert.ok(Math.abs(by.Deck.depth - 6) < 0.5, String(by.Deck.depth));
  assert.strictEqual(r.info.seats, by.Seated.seats, "only the seated stand has seats");
  assert.ok(r.info.skipped.some((t) => /Old club: hospitality/.test(t)) && r.info.skipped.some((t) => /In a hotel: hospitality/.test(t)));
  assert.strictEqual(r.footprints.length, 3);
  // a mapped outline with a listed stand 15 m beside it: merged into it by default, its own with `apart`
  const sc = (apart) => ({ areas: [], lines: [], buildings: [{ kind: "grandstand", name: "Traced", standOf: "Traced", h: 12, min: 0, pts: box(-40, 20, 40, 45) }],
    stands: { list: [{ n: "Traced", osmAt: [0, 30] }, { n: "Beside", a: [55, 20], b: [115, 20], side: "R", rows: 12, ...(apart ? { apart: 1 } : {}) }] } });
  const merged = buildStands({ scene: sc(false), gf, world: w, groundAt, corridor: corridor(w), street: false, year: 2026 });
  const own = buildStands({ scene: sc(true), gf, world: w, groundAt, corridor: corridor(w), street: false, year: 2026 });
  assert.ok(merged.info.skipped.some((t) => /Beside: built as the map outline/.test(t)));
  assert.deepStrictEqual(own.info.list.map((s) => s.n).sort(), ["Beside", "Traced"]);
});

// v0.59: a hospitality entry given by its outline (a building on the map) – its long side nearer the track is its front
test("a hospitality building given by an outline: built from it, facing the track, as deep as the outline", async () => {
  const { buildStands } = await import("../src/renderer/stands.js");
  const w = world(), groundAt = () => 0;
  const list = [{ n: "Seated", a: [-150, 20], b: [-60, 20], side: "R", rows: 10 }, { n: "Club", type: "hosp", poly: box(40, 30, 95, 56), levels: 2, build: 1 }];
  const r = buildStands({ scene: { areas: [], lines: [], buildings: [], stands: { list } }, gf, world: w, groundAt, corridor: corridor(w), street: false, year: 2026 });
  const club = r.info.list.find((s) => s.n === "Club");
  assert.ok(club, JSON.stringify(r.info.skipped));
  assert.strictEqual(club.kind, "hosp"); assert.strictEqual(club.levels, 2);
  assert.ok(Math.abs(club.len - 55) <= 2 && Math.abs(club.depth - 26) < 1.5, JSON.stringify([club.len, club.depth]) + " (the depth in whole rows of 0.8 m)");
  assert.ok(Math.abs(club.c[2] - 30) < 1.2 && club.nrm[1] > 0.99, JSON.stringify([club.c, club.nrm]) + ": its front is the outline's side nearer the track (z = 30), the building behind it – where the outline is, not at the usual distance from the track");
  assert.ok(Math.min(...club.outline.map((q) => q[0])) < 42 && Math.max(...club.outline.map((q) => q[0])) > 93, "along the outline's whole length");
});


// v0.61: a stand's own published seat count (its entry's `seats`) sets its rows; the circuit's total is shared among
// the stands without one. One factor for every outline had halved the stands whose outlines match their seats.
test("a stand's own seat count sets its rows, no deeper than its outline; the circuit's total goes to the others", async () => {
  const { buildStands } = await import("../src/renderer/stands.js");
  const w = world(), groundAt = () => 0;
  // "Deep": an outline 200 × 40 m (drawn with its concourse); "Fit": 80 × 18 m, its outline as deep as its seats
  const sc = (deep, fit, total) => ({ areas: [], lines: [],
    buildings: [{ kind: "grandstand", name: "Deep", standOf: "Deep", h: 14, min: 0, pts: box(-300, 20, -100, 60) }, { kind: "grandstand", name: "Fit", standOf: "Fit", h: 10, min: 0, pts: box(100, 20, 180, 38) }],
    stands: { seats: total, list: [{ n: "Deep", osmAt: [-200, 40], ...(deep ? { seats: deep } : {}) }, { n: "Fit", osmAt: [140, 29], ...(fit ? { seats: fit } : {}) }] } });
  const build = (deep, fit, total) => Object.fromEntries(buildStands({ scene: sc(deep, fit, total), gf, world: w, groundAt, corridor: corridor(w), street: false, year: 2026 }).info.list.map((s) => [s.n, s]));
  const full = build(0, 0, 0), perRowDeep = full.Deep.seats / full.Deep.rows, perRowFit = full.Fit.seats / full.Fit.rows;
  // without counts: one factor – both lose the same share of their rows
  const old = build(0, 0, Math.round((full.Deep.seats + full.Fit.seats) * 0.5));
  assert.ok(old.Fit.rows < full.Fit.rows * 0.75 && old.Deep.rows < full.Deep.rows * 0.75, JSON.stringify([old.Deep.rows, old.Fit.rows, full.Deep.rows, full.Fit.rows]));
  // with counts: Deep half its outline, Fit a little more than its outline holds (kept at the outline's depth)
  const deepSeats = Math.round(perRowDeep * full.Deep.rows * 0.5), fitSeats = Math.round(perRowFit * (full.Fit.rows + 3));
  const r = build(deepSeats, fitSeats, deepSeats + fitSeats);
  assert.ok(Math.abs(r.Deep.rows - full.Deep.rows * 0.5) <= 1, `Deep ${r.Deep.rows} of ${full.Deep.rows}`);
  assert.ok(Math.abs(r.Deep.seats - deepSeats) <= perRowDeep / 2 + 1, "its seats within half a row of the count");
  assert.strictEqual(r.Fit.rows, full.Fit.rows, "no deeper than its outline");
  assert.strictEqual(r.Deep.given, deepSeats);
  // one stand with a count, the other without: the rest of the total is the other's
  const mix = build(deepSeats, 0, deepSeats + Math.round(perRowFit * 10));
  assert.ok(Math.abs(mix.Deep.rows - r.Deep.rows) <= 0 && Math.abs(mix.Fit.rows - 10) <= 1, JSON.stringify([mix.Deep.rows, mix.Fit.rows]));
  // the shipped data: Sakhir's eight stands carry BIC's counts and they add up to the circuit's seats
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "grandstands.json"), "utf8")).circuits.Sakhir;
  assert.strictEqual(data.stands.reduce((a, s) => a + (s.seats || 0), 0), data.seats); assert.strictEqual(data.seats, 34563);
});

// v0.62: a hospitality outline that says it is a dome (Sakhir's two) – a cap over its circle, not a block of storeys
test("a hospitality outline with shape: dome is built as a dome over its circle, a third as high as wide unless it says", async () => {
  const { buildStands } = await import("../src/renderer/stands.js");
  const w = world(), groundAt = () => 2;
  const ring = (cx, cz, r, n = 16) => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((k / n) * Math.PI * 2), cz + r * Math.sin((k / n) * Math.PI * 2)]);
  const list = [{ n: "Seated", a: [-150, 20], b: [-60, 20], side: "R", rows: 10 },
    { n: "Dome", type: "hosp", poly: ring(80, 60, 30), shape: "dome", build: 1, model: { file: "dome.glb", frontAt: 0 } }, { n: "Low dome", type: "hosp", poly: ring(250, 45, 15, 12), shape: "dome", h: 6, build: 1 },
    { n: "Drum", type: "hosp", poly: ring(-250, 45, 15, 12), levels: 2, build: 1 }];
  const r = buildStands({ scene: { areas: [], lines: [], buildings: [], stands: { list } }, gf, world: w, groundAt, corridor: corridor(w), street: false, year: 2026 });
  const by = Object.fromEntries(r.info.list.map((s) => [s.n, s]));
  assert.ok(by.Dome && by["Low dome"] && by.Drum, JSON.stringify(r.info.skipped));
  assert.strictEqual(by.Dome.shape, "dome"); assert.strictEqual(by.Dome.seats, 0); assert.strictEqual(by.Dome.levels, 0);
  assert.ok(Math.abs(by.Dome.len - 60) <= 1 && Math.abs(by.Dome.h - 20) < 0.5, JSON.stringify([by.Dome.len, by.Dome.h]) + ": 60 m across, a third as high");
  assert.ok(Math.abs(by.Dome.c[0] - 80) < 0.5 && Math.abs(by.Dome.c[2] - 60) < 0.5 && Math.abs(by.Dome.c[1] - 22) < 0.5, JSON.stringify(by.Dome.c) + ": its top over the outline's centre, on the ground there (2 m)");
  assert.ok(Math.abs(by["Low dome"].h - 6) < 0.01, "its own height where it gives one");
  assert.ok(!by.Drum.shape && by.Drum.levels === 2, "an outline without the shape stays a block of storeys");
  // a dome with a model of its own: the model's place is the circle's centre on the ground there; the built dome is a
  // mesh of its own (the model replaces it), out of the shared one
  assert.strictEqual(r.swaps.length, 1);
  assert.ok(r.swaps[0].name === "Dome" && Math.abs(r.swaps[0].x - 80) < 0.5 && Math.abs(r.swaps[0].z - 60) < 0.5 && Math.abs(r.swaps[0].y - 2) < 0.01, JSON.stringify([r.swaps[0].x, r.swaps[0].y, r.swaps[0].z]));
  const own = r.group.children.find((o) => o.name === "stand:Dome");
  assert.ok(own && own.visible, "built until the model stands"); r.swaps[0].replace(); assert.ok(!own.visible, "then hidden");
  // the geometry: every vertex of the big dome within its circle, none above its top, the top reached
  const P = own.geometry.attributes.position, near = [];
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); if (Math.hypot(x - 80, z - 60) < 40 && z > 28) near.push([Math.hypot(x - 80, z - 60), y]); }
  assert.ok(near.length > 500, String(near.length));
  assert.ok(Math.max(...near.map((q) => q[0])) < 30.05 && Math.max(...near.map((q) => q[1])) < 22.05 && Math.max(...near.map((q) => q[1])) > 21.9, JSON.stringify([Math.max(...near.map((q) => q[0])), Math.max(...near.map((q) => q[1]))]));
  // a cap, not a drum: halfway out from the centre it is still well above half its height
  const mid = near.filter((q) => Math.abs(q[0] - 15) < 2.5).map((q) => q[1] - 2);
  assert.ok(mid.length && Math.min(...mid) > 13 && Math.max(...mid) < 19, JSON.stringify([Math.min(...mid), Math.max(...mid)]));
});

// v0.62: a standing area that is a grass hill (Yas Marina's Abu Dhabi Hill) – raised over its own outline, wherever the
// track runs round it; not a deck along one stretch
test("a standing-area outline with shape: mound is a grass hill over its outline: rim at the ground, level top, nothing else built on it", async () => {
  const { buildStands } = await import("../src/renderer/stands.js");
  const w = world(), groundAt = (x, z) => 1 + z * 0.01;   // (a slight slope: the hill follows it)
  const hill = [[-60, 40], [40, 40], [80, 90], [40, 150], [-60, 150], [-90, 95]];
  const list = [{ n: "Seated", a: [-250, 20], b: [-160, 20], side: "R", rows: 10 }, { n: "Hill", type: "ga", poly: hill, shape: "mound", h: 5, build: 1 },
    { n: "Towards the hill", a: [-40, 20], b: [30, 20], side: "R", rows: 30 }, { n: "Flat bank", type: "ga", poly: box(150, 30, 230, 50), build: 1 }, { n: "Not asked", type: "ga", poly: box(300, 30, 360, 50), shape: "mound" }];
  const r = buildStands({ scene: { areas: [], lines: [], buildings: [], stands: { list } }, gf, world: w, groundAt, corridor: corridor(w), street: false, year: 2026 });
  const by = Object.fromEntries(r.info.list.map((s) => [s.n, s]));
  assert.ok(by.Hill, JSON.stringify([r.info.skipped, r.info.dropped]));
  assert.strictEqual(by.Hill.kind, "ga"); assert.strictEqual(by.Hill.shape, "mound"); assert.strictEqual(by.Hill.seats, 0); assert.strictEqual(by.Hill.h, 5);
  assert.ok(Math.abs(by.Hill.area - 14850) < 5 && by.Hill.star !== false, JSON.stringify(by.Hill));
  const tw = by["Towards the hill"];
  assert.ok(tw && tw.rows < 30 && Math.max(...tw.outline.map((q) => q[1])) <= 40.5, "a stand in front of the hill stops at its rim (30 rows would reach z = 46): " + JSON.stringify(tw && [tw.rows, Math.max(...tw.outline.map((q) => q[1]))]));
  assert.ok(by["Flat bank"] && !by["Flat bank"].shape, "an outline without the shape stays a deck");
  assert.ok(!by["Not asked"], "one that does not ask to be built stays unbuilt");
  assert.ok(r.footprints.some((f) => f.length === hill.length && f.every((q, i) => q[0] === hill[i][0] && q[1] === hill[i][1])), "its outline keeps trees and buildings off");
  // the geometry: inside the outline, from just under the ground at the rim to 5 m over the ground in the middle
  // (the grass-coloured vertices behind the stands' front boards and away from the flat bank)
  const P = r.group.children[0].geometry.attributes.position, C = r.group.children[0].geometry.attributes.color, on = [];
  for (let i = 0; i < P.count; i++) if (P.getZ(i) > 35 && P.getX(i) < 120 && C.getY(i) > C.getX(i) * 1.3 && C.getY(i) > C.getZ(i) * 1.3) on.push([P.getX(i), P.getY(i) - groundAt(P.getX(i), P.getZ(i)), P.getZ(i)]);
  assert.ok(on.length > 300, String(on.length));
  assert.ok(on.every((q) => q[0] > -90.1 && q[0] < 80.1 && q[2] > 39.9 && q[2] < 150.1), "within the outline's box");
  const hs = on.map((q) => q[1]);
  assert.ok(Math.abs(Math.min(...hs) + 0.4) < 0.01 && Math.abs(Math.max(...hs) - 5) < 0.01, JSON.stringify([Math.min(...hs), Math.max(...hs)]));
  const mid = on.filter((q) => Math.hypot(q[0] - by.Hill.c[0], q[2] - by.Hill.c[2]) < 15).map((q) => q[1]);
  assert.ok(mid.length && Math.min(...mid) > 4.99, "level over its middle: " + Math.min(...mid));
});
