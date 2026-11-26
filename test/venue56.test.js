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
  for (const c of Object.values(stands.circuits || stands)) for (const s of c?.stands || []) if (s.model) { assert.ok(s.model.file && (Number.isFinite(s.model.frontAt) || (Array.isArray(s.model.at) && Number.isFinite(s.model.heading))), s.n + ": on the stand's front line (frontAt) or at a place of its own (at, heading)"); assert.ok(s.model.src, s.n + ": its source is recorded"); files.push(s.model.file);
    for (const a of s.model.also || []) { assert.ok(a.file && Array.isArray(a.at) && Number.isFinite(a.heading), s.n + ": each further piece at a place of its own"); files.push(a.file); } }
  for (const f of F.FACILITIES) if (f.upper) { assert.strictEqual(f.builder, "pitBuilding", f.id); for (const k of ["garageTop", "front", "length", "depth"]) assert.ok(f.upper[k] > 0, f.id + " " + k); assert.ok(f.sources.some((x) => x.includes(f.upper.file)), f.id + ": the model's source is recorded"); files.push(f.upper.file);
    // (upper.also: more files in the model's frame by season; upper.seasons: another file for the building itself in some seasons)
    for (const a of [...(f.upper.also || []), ...(f.upper.seasons || [])]) { assert.ok(f.sources.some((x) => x.includes(a.file)), f.id + ": " + a.file + " – its source is recorded"); files.push(a.file); } }
  for (const [key, u] of Object.entries(F.PIT_UPPERS)) { for (const k of ["garageTop", "length", "depth"]) assert.ok(u[k] > 0, key + " " + k); assert.ok(u.front >= 0, key + " front (0: the model's origin on the garage front line – Madring)"); assert.ok(u.src && u.src.includes(u.file), key + ": the model's source is recorded"); files.push(u.file);
    // (upper.also on a generic pit building: a file in the model's frame – Monza's terrace canopy)
    for (const a of [...(u.also || []), ...(u.seasons || [])]) { assert.ok(u.src.includes(a.file), key + ": " + a.file + " – its source is recorded"); files.push(a.file); } }
  // (a facility that is a model of its own – a tower, the team villas: v0.60)
  for (const f of F.FACILITIES) if (f.model?.file) { assert.ok(f.sources.some((x) => x.includes(f.model.file)), f.id + ": the model's source is recorded"); files.push(f.model.file); }
  assert.ok(files.includes("hun_stand_b.glb") && files.includes("hun_pit_upper_v2.glb") && files.includes("lv_stand_c.glb") && files.includes("lv_pit_upper.glb") && files.includes("lus_stand_c.glb") && files.includes("lus_pit_upper.glb"));
  assert.ok(["yas_stand_c.glb", "yas_pit_upper.glb", "yas_tower.glb", "lus_villas.glb"].every((f) => files.includes(f)), "v0.60: Yas Marina and the Lusail villas");
  assert.ok(["bh_dome_big.glb", "bh_dome_small.glb"].every((f) => files.includes(f)), "v0.62: Sakhir's two domes");
  assert.ok(["bh_stand_c.glb", "bh_pit_upper.glb", "bh_tower.glb"].every((f) => files.includes(f)), "Sakhir's main straight");
  assert.ok(files.includes("mel_pit_upper.glb") && F.PIT_UPPERS[10].from === 2028, "Albert Park's new pit building: from 2028");
  assert.ok(["jed_stand_c.glb", "jed_pit_upper.glb", "suz_stand_c.glb", "suz_wheel.glb"].every((f) => files.includes(f)), "Jeddah's main straight, Suzuka's main stand and wheel");
  assert.ok(files.includes("mia_pit_upper.glb") && files.includes("mia_pit_ext.glb") && F.PIT_UPPERS[151].from === 2023, "Miami's Paddock Club from 2023"); assert.deepStrictEqual(F.FACILITIES.find((f) => f.id === "miami-paddock-club-extension").years, [2027, null], "its extension from 2027");
  assert.ok(["mtl_pit_upper.glb", "mtl_stand_c.glb", "mtl_biosphere.glb"].every((f) => files.includes(f)), "Montréal: the Espace Paddock, Grandstand 1, the Biosphère");
  assert.ok(["mon_stand_k_c.glb", "mon_pool.glb", "mon_casino.glb", "mon_hotel_paris.glb"].every((f) => files.includes(f)), "Monaco: Grandstand K, the pool, the casino, the Hôtel de Paris");
  assert.ok(["mtl_casino.glb", "cat_pit_upper.glb", "cat_stand_c.glb", "cat_rooftop.glb"].every((f) => files.includes(f)), "Montréal's casino; Barcelona: the pit building, the main grandstand, the Rooftop");
  assert.strictEqual(F.PIT_UPPERS[23].front, 15, "Montréal: the second-pass Espace Paddock, its origin 15 m behind the garage fronts"); assert.deepStrictEqual(F.FACILITIES.find((f) => f.id === "barcelona-rooftop").years, [2024, null]);
  assert.ok(!F.FACILITIES.find((f) => f.id === "monaco-hotel-de-paris").replaces.names.test(""), "the hotel's block stays: its model takes no map building away – above all not the unnamed ones");
  assert.ok(["mad_pit_upper.glb", "mad_puerta_sur.glb", "mad_flag.glb"].every((f) => files.includes(f)) && F.PIT_UPPERS[153].front === 0, "Madring: the pit buildings (origin on the garage front line), Puerta Sur, the flag");
  assert.ok(["bak_pit_upper.glb", "bak_government_house.glb", "bak_maiden_tower.glb"].every((f) => files.includes(f)) && F.PIT_UPPERS[144].turned === true, "Baku: the pit building (made the other way round), Government House, the Maiden Tower");
  assert.ok(files.includes("bak_stand_c.glb") && files.includes("bak_old_city_wall_stepped.glb") && !files.includes("bak_old_city_wall.glb"), "Baku: the Absheron grandstand, the Old City wall (the stepped one)");
  assert.ok(["sgp_pit_upper.glb", "sgp_stand_pit_c.glb", "sgp_stand_superpit_c.glb", "sgp_stand_t1_curved_c.glb", "sgp_esplanade.glb", "sgp_fullerton.glb", "sgp_national_gallery.glb", "sgp_anderson_bridge_v2.glb"].every((f) => files.includes(f)) && !files.includes("sgp_stand_t1_c.glb") && !files.includes("sgp_anderson_bridge.glb") && F.PIT_UPPERS[61].turned === true, "Marina Bay: the pit building (made the other way round), three stands (Turn 1 the curved one – the straight file is gone), three landmarks, Anderson Bridge");
  assert.ok(F.FACILITIES.find((f) => f.id === "singapore-national-gallery").replaces.names.test("Old City Hall") && !F.FACILITIES.find((f) => f.id === "singapore-national-gallery").replaces.names.test("Supreme Court of Singapore"), "the gallery takes the old court and city hall, not the new Supreme Court");
  assert.ok(["cota_pit_upper_v2.glb", "cota_stand_main_c.glb", "cota_stand_front_c.glb", "cota_stand_t1_c.glb", "cota_stand_t15_c.glb", "cota_tower.glb", "cota_pylon.glb"].every((f) => files.includes(f)) && F.PIT_UPPERS[9].turned === true && F.PIT_UPPERS[9].front === 12.8 && F.PIT_UPPERS[9].depth === 25.6, "Austin: the pit building (its doors on the built garage front line), the Main Grandstand's building and front bleachers, Turn 1, Turn 15, the tower, the pylon");
  assert.strictEqual((stands.circuits || stands).Austin.stands.find((s) => s.n === "Main Grandstand").roof, 0, "Austin's front bleachers have no roof: it is the building's behind them");
  assert.ok(files.includes("jed_team.glb"), "Jeddah's team building"); assert.strictEqual(F.PIT_UPPERS[149].fillBack, 8, "Jeddah: the ground floor is filled under the long body only – the rear blocks stand from the ground");
  assert.ok(["sha_stand_c.glb", "sha_pit_upper.glb", "sha_wing.glb", "sha_pavilion.glb", "sha_lotus_row.glb"].every((f) => files.includes(f)), "Shanghai's main straight and the canopy rows over H and K");
  assert.strictEqual(F.FACILITIES.filter((f) => /^shanghai-pavilion-\d+$/.test(f.id)).length, 26, "26 team pavilions"); assert.strictEqual(F.FACILITIES.filter((f) => /^shanghai-wing-/.test(f.id)).length, 2);
  assert.ok(files.includes("rbr_pit_upper_2025.glb") && files.includes("sil_wing_upper.glb") && new Set(files.filter((f) => /^sil_/.test(f))).size === 44, "v0.70: Red Bull Ring's pit building up to 2025; Silverstone's 44 files");
  assert.ok(["rbr_open_mitte_abc.glb", "rbr_open_mitte_def.glb", "spo_gantry.glb", ...[1, 2, 3, 4, 5].map((k) => "spo_stand_a_" + k + ".glb")].every((f) => files.includes(f)) && !files.includes("rbr_open_mitte_ne.glb") && !files.includes("rbr_open_mitte_sw.glb"), "v0.70: Mitte's two blocks facing south-west (the first pair is gone); Interlagos' start gantry and sector A in five pieces");
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

test("a listed stand mapped as several outlines: the model stands on the outline it names, the others make way with it", async () => {
  const { swapRoles } = await import("../src/renderer/stands.js");
  const M = { file: "main.glb", on: "V2", covers: ["Front"], frontAt: -3.6 }, other = { file: "other.glb", frontAt: 10 };
  const swaps = [{ name: "V1", model: M }, { name: "V2", model: M }, { name: "Front", model: null }, { name: "Solo", model: other }];
  const roles = swapRoles(swaps);
  assert.deepStrictEqual(roles.map((r) => r.sw.name), ["V2", "Solo"], "V1 places no model of its own, Front has none");
  assert.deepStrictEqual(roles[0].follow.map((o) => o.name), ["V1", "Front"], "the same model's other outline and the covered stand are hidden once the model stands");
  assert.deepStrictEqual(roles[1].follow, [], "a model without `on` or `covers` is its stand's alone");
  assert.deepStrictEqual(swapRoles([{ name: "V1", model: M }, { name: "Front", model: null }]), [], "the named outline is not built: no model, the built stands stay");
  assert.deepStrictEqual(swapRoles(null), []);
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "grandstands.json"), "utf8"));
  const v = data.circuits.Suzuka.stands.find((s) => s.n === "V1/V2 Main");
  assert.strictEqual(v.model.file, "suz_stand_c.glb"); assert.strictEqual(v.model.on, "V2"); assert.deepStrictEqual(v.model.covers, ["V1"]);
});

test("the smallest box round a nearly square outline keeps its sides' direction and size (Hard Rock Stadium's grounds)", async () => {
  const { minBox, hull } = await import("../src/renderer/landmarks.js");
  // the map's outline of the stadium grounds (scene metres): about 261 × 275 m, its sides at 58° / 148°, corners crowding two sides
  const S = [[58, -197], [85, -152], [94, -138], [98, -131], [116, -103], [119, -98], [120, -96], [126, -86], [128, -83], [130, -79], [148, -50], [152, -44], [161, -30], [164, -24], [168, -19], [188, 14], [118, 57], [102, 72], [81, 88], [59, 101], [35, 112], [9, 122], [-46, 156], [-143, -1], [-147, -8], [-175, -54], [-149, -70], [-145, -72], [-131, -81], [-114, -91], [-111, -93], [-108, -96], [-92, -109], [-77, -121], [-58, -133], [-39, -143], [-10, -155], [-6, -158], [31, -180]];
  const o = minBox(S), L = o.u1 - o.u0, W = o.v1 - o.v0;
  assert.ok(L >= W && L > 268 && L < 282 && W > 255 && W < 268, `${L.toFixed(0)} × ${W.toFixed(0)} m (the corner-point method gave 369 × 366)`);
  assert.ok(Math.hypot(o.c[0] - 6, o.c[1] + 20) < 6, "its middle is the box's, by the pitch – not the corner points' mean 40 m off");
  // towards the pit building (its stadium-side wall 122 m along this normal from the scene's origin, the garage fronts at 149 m)
  const n = [0.527, 0.852], reach = Math.sqrt((L * 0.42 * (n[0] * o.u[0] + n[1] * o.u[1])) ** 2 + (W * 0.44 * (n[0] * o.v[0] + n[1] * o.v[1])) ** 2);
  assert.ok(o.c[0] * n[0] + o.c[1] * n[1] + reach * 1.04 < 122 - 10, "the bowl and its canopy stay at least 10 m short of the pit building");
  // the map data has the outline in two halves: taken together (their hull) they give the same box; one half alone does not
  const cut = (keep) => S.filter(([x, z]) => keep(x * 0.527 + z * 0.852)), north = cut((d) => d > -14), south = cut((d) => d <= -14);
  const whole = minBox(hull(north.concat(south)));
  assert.ok(Math.abs(whole.u1 - whole.u0 - L) < 1 && Math.abs(whole.v1 - whole.v0 - W) < 1 && Math.hypot(whole.c[0] - o.c[0], whole.c[1] - o.c[1]) < 1, "two pieces → the same box");
  const half = minBox(hull(north));
  assert.ok(half.c[0] * n[0] + half.c[1] * n[1] > o.c[0] * n[0] + o.c[1] * n[1] + 40, "(one half alone sits 40 m and more towards the pit building – what v0.62 built a second stadium on)");
});

test("an upper-storey model made the other way round (`turned`, +Z to the pit lane – Baku) is turned half round: its marked front ends up on the lane side", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const F = await import("../src/renderer/facilities.js");
  // the same garages as above: fronts at z = 10, the building towards +z
  const slots = []; for (let k = 0; k < 10; k++) slots.push({ front: [-45 + k * 10, 10], floor: 5, width: 10, inward: [0, 1], along: [1, 0] });
  const r = { garages: { slots, top: 4.8 }, footprint: [[-50, 10], [50, 10], [50, 28], [-50, 28]] };
  // a model whose lane face is its +Z side (z = +13): a marker box there, and one at its +X end
  const root = new THREE.Group();
  const lane = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2).translate(0, 8, 13), new THREE.MeshStandardMaterial()); lane.name = "laneMark"; root.add(lane);
  const east = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2).translate(60, 8, 0), new THREE.MeshStandardMaterial()); east.name = "eastMark"; root.add(east);
  const at = (g, name) => { g.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(g.getObjectByName(name)); return b.getCenter(new THREE.Vector3()); };
  const g = new THREE.Group(); F.addUpper(g, r, root, { file: "t.glb", garageTop: 5, front: 13, length: 140, depth: 26, turned: true });
  const p = at(g, "laneMark"), e = at(g, "eastMark");
  assert.ok(Math.abs(p.z - 10) < 1e-6, `its lane face on the garages' front line (z ${p.z.toFixed(2)})`);
  assert.ok(Math.abs(e.x + 60) < 1e-6, "its +X end is on this frame's −X side (turned, not mirrored)");
  const g2 = new THREE.Group(); F.addUpper(g2, r, root, { file: "t.glb", garageTop: 5, front: 13, length: 140, depth: 26 });
  assert.ok(Math.abs(at(g2, "laneMark").z - 36) < 1e-6, "(not turned, the same face stands at the back)");
});

test("replaces.also: a second rule – the unnamed blocks at a model's foot and a named building some way off (Austin's tower and the stage)", async () => {
  const F = await import("../src/renderer/facilities.js");
  const gf = { xz: (p) => p, fromLL: (la, lo) => [lo, la] };
  const sq = (x, z, r) => [[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]];
  const tower = { pts: sq(0, 0, 4), h: 76 }, square = { pts: sq(0, 14, 10), h: 2.6 }, stage = { pts: sq(-30, -40, 15), name: "Some Amphiteater", h: 21 };
  const shed = { pts: sq(40, 40, 5), h: 8 }, other = { pts: sq(-80, 0, 5), name: "Media Center" }, stand = { pts: sq(0, -3, 5), kind: "grandstand" };
  const all = [tower, square, stage, shed, other, stand];
  const got = F.selectReplaced({ replaces: { near: [0, 0], within: 4.5, also: { names: /Amphit/i } } }, all, gf);
  assert.deepStrictEqual(new Set(got), new Set([tower, square, stage]), "the records at the point, and the named one; nothing else, never a grandstand");
  assert.deepStrictEqual(F.selectReplaced({ replaces: { near: [0, 0], within: 4.5 } }, all, gf), [tower, square], "without it: as before");
  const spec = F.FACILITIES.find((f) => f.id === "austin-tower");
  assert.ok(spec.replaces.also.names.test("Germania Insurance Amphiteater") && spec.replaces.within <= 5, "Austin's tower: the map's stage by name, the blocks only at its foot");
  const L = await import("../src/renderer/landmarks.js");
  assert.ok(!/COTA observation tower: 77 m/.test(fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "landmarks.js"), "utf8")) && L.buildLandmarks, "the drawn tower is gone from landmarks.js");
});

test("v0.67: a curved stand model on the front line's middle point (atMid); Baku's wall on the map's plan; Anderson Bridge", async () => {
  const F = await import("../src/renderer/facilities.js");
  const { swapOrigin } = await import("../src/renderer/stands.js");
  const stands = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "grandstands.json"), "utf8"));
  // a front line that bends: its middle point is not the middle of the chord between its ends
  const sw = { x: 0, z: 0, mid: [0, 6], n: [0, -1] };
  assert.deepStrictEqual(swapOrigin(sw, { atMid: true }), [0, 6], "atMid: the origin on the line's middle point");
  assert.deepStrictEqual(swapOrigin(sw, { frontAt: 9.85 }), [0, 0], "without it: the chord's middle, as before");
  assert.deepStrictEqual(swapOrigin({ x: 3, z: 4 }, { atMid: true }), [3, 4], "no middle point known: the chord's middle");
  const sgp = Object.values(stands.circuits || stands).find((c) => (c.stands || []).some((s) => s.model?.file === "sgp_stand_t1_curved_c.glb"));
  const t1 = sgp.stands.find((s) => s.n === "Turn 1").model;
  assert.ok(t1.atMid === true && t1.frontAt === 0 && !("frontFromEdge" in t1), "Marina Bay's Turn 1: the curved model, its origin on the built front line's middle point, no frontFromEdge");
  // Baku's wall: the anchor of the first version, both of the map's strips, a footprint that is the wall's band only
  const wall = F.FACILITIES.find((f) => f.id === "baku-old-city-wall");
  assert.deepStrictEqual(wall.model.anchor, [40.3687928, 49.8366402]); assert.strictEqual(wall.model.heading, 359);
  assert.ok(wall.replaces.near && wall.replaces.also?.near && wall.model.footprint.length >= 8, "both strips (near, also.near); its own footprint");
  const gf = { xz: (p) => p, fromLL: (la, lo) => [lo, la] };
  const sq = (x, z, r) => [[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]];
  const east = { pts: [[-36, -1], [54, -1], [54, 1], [-36, 1]], h: 9.6 }, west = { pts: [[54, -1], [200, -50], [200, -48], [54, 1]], h: 9.6 };
  const house = { pts: sq(60, -30, 5), h: 7 }, bath = { pts: sq(20, -12, 4), name: "Underground Bath" };
  const band = [[-37, 4], [54, 4], [200, -45], [200, -53], [54, -4], [-37, -4]], box = [[-37, 4], [200, 4], [200, -53], [-37, -53]];
  const rule = { replaces: { near: [0, 0], within: 3, also: { near: [-24.5, 127], within: 3 } } };   // (fromLL here: [lat, lon] → [lon, lat])
  assert.deepStrictEqual(new Set(F.selectReplaced(rule, [east, west, house, bath], gf, band)), new Set([east, west]), "the two strips; the house behind the wall and the named bath stay");
  assert.ok(F.selectReplaced(rule, [east, west, house, bath], gf, box).includes(house), "(with the model's box for a footprint the house would have gone)");
  // … and it follows the ground: the street climbs 17 m along it (drape)
  assert.ok(!wall.model.drape && wall.model.file === "bak_old_city_wall_stepped.glb", "the stepped model stands as made: no drape");
  assert.strictEqual(F.FACILITIES.find((f) => f.id === "austin-amphitheatre").model.drape, true, "Austin's amphitheatre still follows the ground");
  const THREE = await import("three");
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 10, 0, 100, 0, 0, 100, 10, 0]), 3)); geo.userData.shared = true;
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial()), holder = new THREE.Group(); holder.add(mesh); holder.position.set(50, 3, 20); holder.rotation.y = Math.PI / 2;
  F.drapeModel(holder, (x, z) => 3 + (20 - z) * 0.07, 3);   // (turned a quarter: the model's +x runs to scene −z; the ground rises 7 % that way)
  const P = mesh.geometry.attributes.position, ys = [0, 1, 2, 3].map((i) => +P.getY(i).toFixed(3));
  assert.deepStrictEqual(ys, [0, 10, 7, 17], "the far end is 7 m higher, foot and top alike: verticals stay vertical");
  assert.ok(mesh.geometry !== geo && !mesh.geometry.userData.shared && geo.attributes.position.getY(2) === 0, "the cache's shared geometry is untouched; the draped copy is the placement's own");
  // Anderson Bridge: nothing makes way; its footprint is the middle truss, not the box across the track
  const br = F.FACILITIES.find((f) => f.id === "singapore-anderson-bridge");
  assert.ok(br && br.model.file === "sgp_anderson_bridge_v2.glb" && br.model.heading === 218.8 && !br.replaces.names.test("") && br.model.footprint.length === 4);
  const lat = br.model.footprint.map((p) => p[0]), lon = br.model.footprint.map((p) => p[1]);
  const wN = (Math.max(...lat) - Math.min(...lat)) * 110574, wE = (Math.max(...lon) - Math.min(...lon)) * 111320;
  assert.ok(Math.hypot(wN, wE) > 60 && Math.hypot(wN, wE) < 80, "a strip the length of the truss");
  // Austin's pylon: off the given place, clear of the track's edge and the pit lane's line
  const py = F.FACILITIES.find((f) => f.id === "austin-pylon");
  const d = Math.hypot((py.model.anchor[0] - 30.13146) * 110574, (py.model.anchor[1] + 97.639057) * 111320 * Math.cos(30.13 * Math.PI / 180));
  assert.ok(d > 0.5 && d < 0.8, "0.65 m across from the given place");
});

test("v0.68: Mexico City – the pit building, Grada 1 (two outlines, two models), Grada 2, the stadium at a place of its own, two landmarks on levelled ground", async () => {
  const F = await import("../src/renderer/facilities.js");
  const { listedEntry } = await import("../src/renderer/stands.js");
  const { padPlan } = await import("../src/renderer/footing.js");
  const stands = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "grandstands.json"), "utf8"));
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "data", "models"));
  assert.ok(["mex_pit_upper.glb", "mex_stand_g1_c.glb", "mex_stand_g2_c.glb", "mex_stand_g1w_c.glb", "mex_stadium_c.glb", "mex_palacio.glb", "mex_harp_helu.glb"].every((f) => files.includes(f)));
  const U = F.PIT_UPPERS[65];
  assert.ok(U.turned === true && U.front === 12.75 && U.depth === 25.5 && U.garageTop === 4.6 && !("maxDepth" in U), "the pit building: its pit-lane face on the built garage front line, the garage level as deep as the map has it");
  const mx = (stands.circuits || stands)["Mexico City"].stands, g1 = mx.filter((s) => s.n === "Grada 1");
  assert.deepStrictEqual(g1.map((s) => s.model.file), ["mex_stand_g1w_c.glb", "mex_stand_g1_c.glb"], "Grada 1: the low west stand and the main body, an entry each");
  assert.ok(g1.every((s) => s.roof === 0) && mx.find((s) => s.n === "Grada 2").roof === 0 && mx.find((s) => s.n === "Grada 2").model.frontAt === 4, "their roofs are the models'");
  // two entries of one name: each outline takes the entry whose osmAt lies in it (not the last of that name)
  const sq = (x, y, r) => [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]];
  const A = { n: "Grada 1", osmAt: [0, 0], model: { file: "west" } }, B = { n: "Grada 1", osmAt: [100, 0], model: { file: "main" } };
  assert.strictEqual(listedEntry([A, B], sq(0, 0, 10)), A); assert.strictEqual(listedEntry([A, B], sq(100, 0, 30)), B);
  assert.strictEqual(listedEntry([A, B], sq(70, 0, 10)), B, "an outline neither point lies in: the nearer one");
  assert.strictEqual(listedEntry([A, B], null), B, "no outline: the last, as a Map by name gave"); assert.strictEqual(listedEntry([A]), A); assert.strictEqual(listedEntry(undefined), undefined);
  // the stadium: one model for both listed stands, at its own place, from the season of its new roof
  const st = mx.find((s) => s.n === "Grada 14 Sur").model;
  assert.ok(st.file === "mex_stadium_c.glb" && st.from === 2024 && Array.isArray(st.at) && st.heading === 180 && st.covers.includes("Grada 15 Norte") && !("frontAt" in st));
  // the landmarks: on the map's own outlines, the ground under them levelled first
  const pal = F.FACILITIES.find((f) => f.id === "mexico-palacio-de-los-deportes"), harp = F.FACILITIES.find((f) => f.id === "mexico-harp-helu");
  assert.ok(pal.model.level && harp.model.level && pal.replaces.names.test("Palacio de los Deportes") && harp.replaces.names.test("Rampa") && !harp.replaces.names.test("Estadio Alfredo Harp Helú"));
  const lv = F.levelledFootprints({ venue: { key: 65 }, location: "Mexico City", year: 2025 });
  assert.strictEqual(lv.length, 2); assert.strictEqual(F.levelledFootprints({ venue: { key: 65 }, location: "Mexico City", year: 2016 }).length, 1, "before the baseball stadium was built: the Palacio only");
  assert.strictEqual(F.levelledFootprints({ venue: { key: 9 }, location: "Austin", year: 2025 }).length, 0);
  // a forced yard: a mound 20 m high under a footprint is levelled to the low ground round it; unforced it is left alone ("steep")
  const nx = 20, nz = 20, grid = { x0: 0, z0: 0, W: 200, H: 200, nx, nz }, hill = (x, z) => Math.max(0, 20 - Math.hypot(x - 100, z - 100) * 0.5);
  const hAt = (k) => hill((k % (nx + 1)) * 10, Math.floor(k / (nx + 1)) * 10), P = sq(100, 100, 30);
  assert.strictEqual(padPlan(grid, hAt, hill, [P], () => false).pads, 0, "a hillside is left alone");
  const forced = sq(100, 100, 30); forced.force = true;
  const plan = padPlan(grid, hAt, hill, [forced], () => false), centre = 10 * (nx + 1) + 10;
  assert.strictEqual(plan.pads, 1); assert.ok(plan.targets.get(centre) < 3, "the middle of the mound comes down to the low ground: " + plan.targets.get(centre));
});

test("v0.68: Interlagos – the pit building on the garages this app builds, three stands, D from 2026, the Hospitality Center on a terrace, the footbridge", async () => {
  const F = await import("../src/renderer/facilities.js");
  const { padPlan } = await import("../src/renderer/footing.js");
  const stands = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "grandstands.json"), "utf8")).circuits["São Paulo"].stands;
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "data", "models"));
  assert.ok(["spo_pit_upper.glb", "spo_stand_b_c.glb", "spo_stand_ps_c.glb", "spo_stand_m_c.glb", "spo_stand_d_c.glb", "spo_hospitality.glb", "spo_footbridge.glb"].every((f) => files.includes(f)));
  // the pit building: door line on the built garage fronts; its 24 bays (23 garages + the link) over the 24 built ones; the
  // Operations Centre past the pit-entry end; no fill boxes; the paddock street's ground laid at the floor
  const U = F.PIT_UPPERS[14];
  assert.ok(U.turned === true && U.front === 9 && U.garageTop === 5 && U.fill === false && U.along === -6.35 && U.platform === 36 && U.backTo === 43.3);
  assert.deepStrictEqual(U.span, [-140, 184.5]); assert.ok(U.span[1] - U.span[0] > U.length, "the model is longer than the garages: the Operations Centre");
  assert.ok(Math.abs((-152.2 + 139.5) / 2 - U.along) < 0.01, "along: the middle of the model's 24 bays (own x −152.2 … +139.5; turned: this frame's x is the other way)");
  // the stands: B at the place given (the app's own front line of its bent outline put it 1.3 m nearer the track), the
  // other two from their outlines' fronts; the models have the roofs
  const by = (n) => stands.find((s) => s.n === n), b = by("B").model, ps = by("Pit Stop Club").model, m = by("M").model, d = by("D").model;
  assert.ok(b.file === "spo_stand_b_c.glb" && Array.isArray(b.at) && b.heading === 75.69 && !("frontAt" in b));
  assert.ok(ps.file === "spo_stand_ps_c.glb" && ps.frontAt === 10.75 && m.file === "spo_stand_m_c.glb" && m.frontAt === 10.2);
  assert.ok(by("B").roof === 0 && by("Pit Stop Club").roof === 0 && by("M").roof === 0);
  // D: the permanent stand of 2026 – before that the builder's own stand; it follows the ground
  assert.ok(d.file === "spo_stand_d_c.glb" && d.from === 2026 && d.heading === 180 && d.drape === true && Array.isArray(d.at) && by("D").roof === 1);
  // the Hospitality Center (2025): its terrace at the middle height of the slope under it; the footbridge follows the ground
  const hc = F.FACILITIES.find((f) => f.id === "interlagos-hospitality-center"), fb = F.FACILITIES.find((f) => f.id === "interlagos-footbridge");
  assert.ok(hc.model.level === "mid" && hc.years[0] === 2025 && fb.model.drape === true && fb.model.footprint.length === 4);
  const lv = F.levelledFootprints({ venue: { key: 14 }, location: "São Paulo", year: 2025 });
  assert.ok(lv.length === 1 && lv[0].mid === true && lv[0].length === hc.model.footprint.length);
  assert.strictEqual(F.levelledFootprints({ venue: { key: 14 }, location: "São Paulo", year: 2024 }).length, 0, "before it was built");
  assert.ok(!F.levelledFootprints({ venue: { key: 65 }, location: "Mexico City", year: 2025 }).some((p) => p.mid), "level: true stays at the low ground");
  // the lawn towers: seven entries of one model file, each at its own place, nothing makes way
  const tw = F.FACILITIES.filter((f) => /^interlagos-lawn-tower-\d$/.test(f.id));
  assert.ok(tw.length === 7 && files.includes("spo_tower.glb") && tw.every((f) => f.model.file === "spo_tower.glb" && f.venue[0] === 14 && !f.model.level && !f.replaces.names.test("B")));
  assert.strictEqual(new Set(tw.map((f) => f.model.anchor.join())).size, 7); assert.strictEqual(new Set(F.FACILITIES.map((f) => f.id)).size, F.FACILITIES.length, "no two entries share an id");
  // a forced yard on a real slope: "mid" lays it at the middle height, plain force at the low end
  const nx = 20, nz = 20, grid = { x0: 0, z0: 0, W: 200, H: 200, nx, nz }, slope = (x) => x * 0.1;
  const hAt = (k) => slope((k % (nx + 1)) * 10), sq = (cx, cz, r) => [[cx - r, cz - r], [cx + r, cz - r], [cx + r, cz + r], [cx - r, cz + r]], centre = 10 * (nx + 1) + 10;
  const low = sq(100, 100, 70); low.force = true; const mid = sq(100, 100, 70); mid.force = "mid";
  assert.strictEqual(padPlan(grid, hAt, slope, [sq(100, 100, 70)], () => false).pads, 0, "14 m of fall under a footprint: left alone unless forced");
  const pl = padPlan(grid, hAt, slope, [low], () => false).targets.get(centre), pm = padPlan(grid, hAt, slope, [mid], () => false).targets.get(centre);
  assert.ok(Math.abs(pm - 10) < 1.2 && pl < 5.5 && pl < pm, `mid ${pm} at the middle of 3 … 17, low ${pl} near the bottom`);
});

// v0.69: Red Bull Ring – the pit building's model with what stands on its roof deck by season (upper.also), a stand of
// several pieces (model.also), the start gantry, every stand of the lap as a model. (v0.70: up to 2025 the building
// before its extension is a model too – upper.seasons; `upper.from` is gone from the entry. Mitte's two blocks face
// south-west, side by side – the first pair of files, back to back, was wrong.)
test("v0.69: Red Bull Ring – the pit building (up to 2025 before its extension, marquees up to 2026, the roof storey from 2027), Start-Ziel in three pieces, the gantry, Nord roofed, ten open stands", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const F = await import("../src/renderer/facilities.js");
  const dir = path.join(__dirname, "..", "src", "data", "models"), files = fs.readdirSync(dir);
  const stands = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "grandstands.json"), "utf8")).circuits.Spielberg.stands;
  const open = ["steiermark", "rb_s", "rb_n", "t3", "t9", "t10", "t8", "mitte_abc", "mitte_def", "schoenberg"].map((k) => "rbr_open_" + k + ".glb");
  assert.ok(["rbr_pit_upper.glb", "rbr_pit_upper_2025.glb", "rbr_pit_tents2026.glb", "rbr_pit_roof2027.glb", "rbr_gantry.glb", "rbr_sz_centre_c.glb", "rbr_sz_east_c.glb", "rbr_sz_west_c.glb", "rbr_nord.glb", ...open].every((f) => files.includes(f)));
  // the pit building: one entry – a model on its garages in every season: up to 2025 the building before its extension
  // (upper.seasons: a file of its own in the same frame), from 2026 the lengthened one
  const pits = F.FACILITIES.find((f) => f.id === "red-bull-ring-pits"), U = pits.upper;
  assert.ok(U.file === "rbr_pit_upper.glb" && !("from" in U) && U.turned === true && U.garageTop === 4.2 && U.front === 12.8 && U.maxDepth === 23.6 && pits.builder === "pitBuilding" && pits.years[0] === 2011);
  assert.deepStrictEqual(U.seasons, [{ to: 2025, file: "rbr_pit_upper_2025.glb", fill: false, span: [-111, 169.5] }]);
  const on = (y) => U.also.filter((a) => F.upperAlsoIn(a, y)).map((a) => a.file);
  assert.deepStrictEqual(on(2026), ["rbr_pit_tents2026.glb"], "2026: the marquees");
  assert.deepStrictEqual(on(2027), ["rbr_pit_roof2027.glb"], "2027: the roof storey"); assert.deepStrictEqual(on(2030), ["rbr_pit_roof2027.glb"]);
  assert.deepStrictEqual(on(null), ["rbr_pit_roof2027.glb"], "no season: the newest state");
  assert.deepStrictEqual(on(2025), ["rbr_pit_tents2026.glb"], "up to 2025 too: the marquees stand on the building before its extension");
  // more files in the upper model's frame: the same origin, turned with it
  const slots = []; for (let k = 0; k < 10; k++) slots.push({ front: [-45 + k * 10, 10], floor: 5, width: 10, inward: [0, 1], along: [1, 0] });
  const r = { garages: { slots, top: 4.8 }, footprint: [[-50, 10], [50, 10], [50, 28], [-50, 28]] };
  const mark = (name, x, y, z) => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2).translate(x, y, z), new THREE.MeshStandardMaterial()); m.name = name; g.add(m); return g; };
  const at = (g, name) => { g.updateMatrixWorld(true); return new THREE.Box3().setFromObject(g.getObjectByName(name)).getCenter(new THREE.Vector3()); };
  const g = new THREE.Group(), up = F.addUpper(g, r, mark("body", 0, 8, 13), { file: "t.glb", garageTop: 5, front: 13, length: 140, depth: 26, turned: true }, [mark("roofMark", 60, 20, 13)]);
  const b = at(g, "body"), e = at(g, "roofMark");
  assert.ok(Math.abs(b.z - 10) < 1e-6 && Math.abs(e.z - 10) < 1e-6 && Math.abs(e.x + 60) < 1e-6, "the further file stands in the model's own frame, turned with it");
  assert.ok(Math.abs(e.y - (20 + 5 + 4.8 - 5)) < 1e-6 && up.top > 20, "at the model's level; the facility's top takes it in");
  const g0 = new THREE.Group(); F.addUpper(g0, r, mark("body", 0, 8, 13), { file: "t.glb", garageTop: 5, front: 13, length: 140, depth: 26, turned: true });
  assert.strictEqual(g0.getObjectByName("roofMark"), undefined, "without one, nothing more");
  // the gantry: a model of its own over the track, no map building makes way
  const gantry = F.FACILITIES.find((f) => f.id === "red-bull-ring-start-gantry");
  assert.ok(gantry.model.file === "rbr_gantry.glb" && gantry.venue[0] === 19 && !gantry.replaces.names.test("Box") && !gantry.replaces.names.test("") && gantry.model.footprint.length === 4);
  // the stands: Start-Ziel is three files, the infield stand two; Nord is roofed; the open stands follow the ground
  const by = (n) => stands.find((s) => s.n === n), sz = by("Start-Ziel").model;
  assert.ok(sz.tilt === 18.5 && sz.also.every((a) => a.tilt === 9.25), "each piece leans with the ground along its front wall");
  // a level model 100 m long on ground that climbs 3 m along it and has a 5 m bump under its middle (its own bulk in the data)
  const long = new THREE.Group(), body = new THREE.Group(); body.add(new THREE.Mesh(new THREE.BoxGeometry(100, 10, 20).translate(0, 5, 0), new THREE.MeshStandardMaterial())); long.add(body);
  long.position.set(200, 99, 50); long.rotation.y = Math.PI / 2;   // (its +X along the scene's −Z, its +Z along the scene's +X)
  const ground = (x, z) => 7 + (50 - z) * 0.03 + (x < 209 ? 5 : 0);   // (the bump lies behind the front wall line at x = 210)
  const fit = F.tiltModel(long, ground, 10, 0);
  assert.ok(Math.abs(fit.slope - 0.03) < 1e-9 && Math.abs(long.position.y - 7) < 1e-9, "its origin on the line through the ground at its front wall – not on the bump");
  const ends = new THREE.Box3().setFromObject(long); assert.ok(Math.abs(ends.min.y - (7 - 50 * Math.sin(Math.atan(0.03)))) < 0.01, "the low end's foot is on the ground there");
  assert.ok(sz.file === "rbr_sz_centre_c.glb" && sz.heading === 344.85 && sz.also.length === 2 && sz.also.every((a) => a.heading === 344.85 && /^rbr_sz_(east|west)_c\.glb$/.test(a.file)) && !sz.drape);
  assert.ok(by("North (Nord)").roof === 1 && by("North (Nord)").model.file === "rbr_nord.glb" && !by("North (Nord)").model.drape);
  const mitte = by("Center (Mitte)").model; assert.ok(mitte.file === "rbr_open_mitte_abc.glb" && mitte.also.length === 1 && mitte.also[0].file === "rbr_open_mitte_def.glb" && mitte.heading === 231.58 && mitte.also[0].heading === 231.58, "one stand of two blocks side by side, both facing south-west (v0.70; the first pair stood back to back)");
  // on a hillside that rises behind it: the ground read along each block's front line (its +Z edge), not under every vertex
  assert.deepStrictEqual([mitte.drape.along, mitte.also[0].drape.along], [[[-31.25, 21.74], [31.25, 21.74]], [[-29.15, 17.01], [29.15, 17.01]]]);
  for (const n of ["Red Bull (T1 end)", "Red Bull (T3 end)", "Steiermark Tribüne", "T3", "Schönberg", "T8", "T9", "T10"]) assert.ok(by(n).model.drape === true && /^rbr_open_/.test(by(n).model.file) && by(n).roof === 0, n);
  assert.deepStrictEqual(by("Schönberg").yr, [2026, null], "Schönberg stays a stand of 2026 and later");
});

// v0.70: Silverstone – the Wing's storeys over the builder's garages (upper.flat; upper.trial on a verified entry), every
// stand of the lap as a model, a stand rebuilt between two seasons as two entries of one name (the Landostand), 23 more
// buildings; Red Bull Ring's pit building before its 2026 extension by season (upper.seasons). A pit building's model along
// the garage fronts (upper.alongFronts); a model following the ground along its own front line (drape: { along }).
test("v0.70: Silverstone – the Wing's upper storeys, 33 stand files, the Landostand one stand from 2026, Farm Curve under its 2027 name, 23 more buildings; Red Bull Ring's pit building up to 2025", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const F = await import("../src/renderer/facilities.js");
  const { buildStands } = await import("../src/renderer/stands.js");
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "data", "models"));
  const sil = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "grandstands.json"), "utf8")).circuits.Silverstone.stands;
  assert.strictEqual(files.filter((f) => /^sil_/.test(f)).length, 44); assert.ok(!files.includes("sil_media_suite.glb"), "the Woodcote Media Suite's model is held back: it was made as the bounding box of the mapped building"); assert.ok(files.includes("rbr_pit_upper_2025.glb"));
  // the Wing: the entry stays verified and the builder's; the model over its garages is a trial of its own
  const wing = F.FACILITIES.find((f) => f.id === "silverstone-wing"), W = wing.upper;
  assert.ok(wing.status === "permanent" && wing.builder === "pitBuilding" && W.file === "sil_wing_upper.glb" && W.turned === true && W.front === 15 && W.garageTop === 4.7 && W.flat === true && W.fill === false && W.trial === true);
  // 23 more entries, each a trial model; the gantry and the two road bridges take no map building away
  const at2 = F.FACILITIES.filter((f) => f.venue?.includes(2));
  assert.strictEqual(at2.length, 24); assert.ok(at2.every((f) => f === wing || (f.status === "trial" && /^sil_[a-z_]+\.glb$/.test(f.model.file))));
  const esc = at2.filter((f) => /^silverstone-escapade-\d+$/.test(f.id));
  assert.ok(esc.length === 14 && esc.every((f) => f.model.file === "sil_escapade_unit.glb" && f.replaces.within === 2 && f.years[0] === 2024) && new Set(esc.map((f) => f.model.anchor.join())).size === 14);
  for (const id of ["silverstone-start-gantry", "silverstone-wellington-bridge", "silverstone-hangar-bridge"]) { const f = at2.find((x) => x.id === id); assert.ok(!f.replaces.names.test("") && !f.replaces.names.test("Silverstone Wing") && f.model.footprint.length === 4, id + ": nothing makes way; its footprint is a leg, not the span over the track"); }
  assert.ok(at2.find((f) => f.id === "silverstone-skybridge").model.footprint.length === 4 && at2.find((f) => f.id === "silverstone-hotel").years[0] === 2022);
  // the stands: each at a place of its own, heading 180 (no frontAt); 33 files; the roofs as listed
  const by = (n) => sil.filter((s) => s.n === n), one = (n) => by(n)[0], withModel = sil.filter((s) => s.model);
  assert.strictEqual(withModel.length, 29);
  assert.ok(withModel.every((s) => !("frontAt" in s.model) && [s.model, ...(s.model.also || [])].every((m) => /^sil_stand_[a-z0-9_]+\.glb$/.test(m.file) && m.heading === 180 && Array.isArray(m.at))));
  assert.strictEqual(new Set(withModel.flatMap((s) => [s.model.file, ...(s.model.also || []).map((a) => a.file)])).size, 33);
  const roofed = ["Hamilton Straight A", "Abbey", "Village B", "International Paddock", "Luffield Corner", "Luffield", "Woodcote A", "Woodcote B", "Jim Clark (BRDC)", "National Pits Straight", "Stirling B", "Copse A", "Copse B", "Copse C", "Becketts", "Club Corner"];
  for (const s of withModel) assert.strictEqual(s.roof, roofed.includes(s.n) ? 1 : 0, s.n);
  // the Landostand: four blocks up to 2025, one stand from 2026 – two entries share the name
  const lando = by("Landostand");
  assert.deepStrictEqual(lando.map((s) => [s.yr, s.model?.file || null]), [[[2018, 2025], null], [[2026, null], "sil_stand_landostand.glb"]]);
  assert.ok(["Landostand (west)", "Landostand (south)", "Landostand (trackside)"].every((n) => by(n).length === 1 && one(n).yr[1] === 2025 && !one(n).model) && lando[1].seats === 16373);
  // 'Hamilton Straight B' is two stands: one entry, a second file; the low rows in front of four stands likewise
  const hb = one("Hamilton Straight B").model; assert.ok(by("Hamilton Straight B").length === 1 && hb.file === "sil_stand_hamilton_b2.glb" && hb.also.length === 1 && hb.also[0].file === "sil_stand_hamilton_b1.glb");
  for (const [n, f] of [["Luffield Corner", "sil_stand_luffield_corner_front.glb"], ["Luffield", "sil_stand_luffield_front.glb"], ["Copse A", "sil_stand_copse_a_front.glb"], ["Copse C", "sil_stand_copse_c_front.glb"]]) assert.strictEqual(one(n).model.also[0].file, f);
  // Farm Curve up to 2026, the George Russell Grandstand from 2027: the same outline and model
  const farm = one("Farm Curve"), gr = one("George Russell Grandstand");
  assert.deepStrictEqual([farm.yr, gr.yr], [[2018, 2026], [2027, null]]); assert.ok(farm.model.file === "sil_stand_farm.glb" && gr.model.file === farm.model.file && gr.model.at.join() === farm.model.at.join() && JSON.stringify(gr.poly) === JSON.stringify(farm.poly));
  // two entries of one name with their own seasons: this season's is the outline's entry, whichever is listed last
  const w = world(), groundAt = () => 0;
  const old = { n: "Lando", poly: box(-60, 20, -20, 35), img: "t", yr: [2018, 2025] }, neu = { n: "Lando", poly: box(-100, 20, 100, 50), img: "t", yr: [2026, null], model: { file: "l.glb", at: [0, 35], heading: 180 } };
  const farmS = { n: "Farm", poly: box(160, 20, 240, 32), img: "t", yr: [2018, 2026], model: { file: "f.glb", at: [200, 26], heading: 180 } }, george = { ...farmS, n: "George", yr: [2027, null] };
  const run = (year, list = [old, neu, farmS, george]) => buildStands({ scene: { areas: [], lines: [], buildings: [], stands: { list } }, gf, world: w, groundAt, corridor: corridor(w), street: false, year });
  const got = (r) => [r.info.list.map((s) => [s.n, Math.round(s.len)]).sort(), r.swaps.map((s) => s.model.file).sort()];
  assert.deepStrictEqual(got(run(2025)), [[["Farm", 80], ["Lando", 40]], ["f.glb"]], "2025: the old block is built (it was skipped as 'not in 2025'), no model");
  assert.deepStrictEqual(got(run(2026)), [[["Farm", 80], ["Lando", 200]], ["f.glb", "l.glb"]]);
  assert.deepStrictEqual(got(run(2027)), [[["George", 80], ["Lando", 200]], ["f.glb", "l.glb"]]);
  assert.deepStrictEqual(got(run(2025, [neu, old]))[0], [["Lando", 40]]);
  // Red Bull Ring: up to 2025 another file in the same frame (upper.seasons – upperFor); from 2026 and without a season the entry's own
  const pits = F.FACILITIES.find((f) => f.id === "red-bull-ring-pits"), U = pits.upper, old25 = F.upperFor(U, 2025);
  assert.ok(old25.file === "rbr_pit_upper_2025.glb" && old25.fill === false && !("to" in old25) && ["garageTop", "front", "length", "depth", "maxDepth", "along", "turned", "also"].every((k) => old25[k] === U[k]));
  assert.deepStrictEqual(old25.span, [-111, 169.5]); assert.ok(old25.span[1] - old25.span[0] < U.length, "shorter: without the 2026 section");
  assert.strictEqual(F.upperFor(U, 2011).file, "rbr_pit_upper_2025.glb"); assert.strictEqual(F.upperFor(U, 2026), U); assert.strictEqual(F.upperFor(U, null), U, "no season: the newest state"); assert.strictEqual(F.upperFor(undefined, 2025), undefined);
  const S = { file: "new.glb", front: 10, seasons: [{ to: 2019, file: "old.glb", fill: false }, { from: 2020, to: 2022, file: "mid.glb" }] };
  assert.deepStrictEqual([2018, 2019, 2020, 2022, 2023, null].map((y) => F.upperFor(S, y).file), ["old.glb", "old.glb", "mid.glb", "mid.glb", "new.glb", "new.glb"]);
  assert.ok(F.upperFor(S, 2021).front === 10 && !("from" in F.upperFor(S, 2021)) && F.upperFor(S, 2019).fill === false && F.upperFor(S, 2021).fill === undefined);
  // a shorter model in the longer one's frame: no fill walls (fill: false); the footprint – the rain cover – is the model
  // (span) and the built garage level beside it, from the garages' front line
  const slots = []; for (let k = 0; k < 10; k++) slots.push({ front: [-45 + k * 10, 10], floor: 5, width: 10, inward: [0, 1], along: [1, 0] });
  const r = { garages: { slots, top: 4.8 }, footprint: [[-50, 10], [50, 10], [50, 28], [-50, 28]] };
  const root = new THREE.Group(); root.add(new THREE.Mesh(new THREE.BoxGeometry(100, 14, 26).translate(20, 12, 0), new THREE.MeshStandardMaterial()));
  const g = new THREE.Group(), up = F.addUpper(g, r, root, { file: "t.glb", garageTop: 5, front: 13, length: 140, depth: 26, fill: false, span: [-30, 70] }), xs = up.footprint.map((p) => p[0]);
  assert.ok(Math.abs(Math.min(...xs) + 50) < 1e-6 && Math.abs(Math.max(...xs) - 70) < 1e-6, "the garages built past the model's end (−50 … −30) are under the cover too");
  const deep = F.addUpper(new THREE.Group(), r, root.clone(true), { file: "t.glb", garageTop: 5, front: 15, length: 100, depth: 20 }).footprint.map((p) => p[1]);
  assert.ok(Math.abs(Math.min(...deep) - 10) < 1e-6, "a model whose box begins behind the garage fronts (front 15, depth 20): the cover from the front line");
  let fills = 0; g.traverse((o) => { if (o.name === "upperFill") fills++; }); assert.strictEqual(fills, 0);
  // every stand file follows the ground: flat as the old airfield is, Vale falls 4 m along its length and the Landostand's
  // origin lies off its body
  assert.ok(withModel.every((s) => [s.model, ...(s.model.also || [])].every((m) => m.drape === true)));
  // the hotel on a terrace at the middle height; the old pits, by the track, on the lowest ground under them
  assert.strictEqual(at2.find((f) => f.id === "silverstone-hotel").model.level, "mid");
  for (const id of ["silverstone-national-pits-west", "silverstone-national-pits-east"]) assert.strictEqual(at2.find((f) => f.id === id).model.ground, "lowest", id);
  // the Wing's model along the garage fronts (upper.alongFronts): garages whose fronts lie on a line turned from their own axis
  assert.strictEqual(W.alongFronts, true);
  const kf = 0.01, sl2 = []; for (let i = 0; i < 20; i++) { const x = -95 + i * 10; sl2.push({ front: [x, 10 + kf * x], floor: 5, width: 10, inward: [0, 1], along: [1, 0] }); }
  const r2 = { garages: { slots: sl2, top: 4.8 }, footprint: [[-100, 9], [100, 11], [100, 30], [-100, 28]] };
  const long = () => { const m = new THREE.Group(); m.add(new THREE.Mesh(new THREE.BoxGeometry(200, 10, 20).translate(0, 10, 0), new THREE.MeshStandardMaterial())); return m; };
  const ua = F.addUpper(new THREE.Group(), r2, long(), { file: "t.glb", garageTop: 5, front: 10, length: 200, depth: 20, alongFronts: true });
  assert.ok(ua.info.upperFronts.every(([, e]) => Math.abs(e) < 0.02) && Math.abs(ua.inward[0] + ua.inward[1] * kf) < 1e-9, "its front line on the garages' fronts from end to end, square to their line");
  const ub = F.addUpper(new THREE.Group(), r2, long(), { file: "t.glb", garageTop: 5, front: 10, length: 200, depth: 20 });
  assert.ok(Math.abs(ub.info.upperFronts[1][1] - ub.info.upperFronts[0][1] - 1.9) < 0.02 && ub.inward[0] === 0, "(along the builder's own axis – as before – the end garages stand 1.9 m apart across the model's front line)");
  // drape: { along } – the ground read on the model's own front line: a bank the ground already holds is not built twice.
  // A block 40 m long and 10 m deep behind its front line, turned a quarter; the ground climbs along it and banks up behind it
  const bank = (x, z) => 20 + (z - 50) * 0.05 + Math.max(0, 100 - x) * 0.5;
  const block = () => { const h = new THREE.Group(); h.add(new THREE.Mesh(new THREE.BoxGeometry(40, 2, 10).translate(0, 1, -5), new THREE.MeshStandardMaterial())); h.position.set(100, 20, 50); h.rotation.y = Math.PI / 2; return h; };
  const span = (h) => { h.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(h); return [b.min.y, b.max.y]; };
  const onLine = block(); F.drapeModel(onLine, bank, 20, [[-20, 0], [20, 0]]);
  assert.ok(Math.abs(span(onLine)[0] - 19) < 1e-6 && Math.abs(span(onLine)[1] - 23) < 1e-6, "it follows the climb along its front (± 1 m) and keeps its own height across");
  const under = block(); F.drapeModel(under, bank, 20);
  assert.ok(Math.abs(span(under)[1] - 28) < 1e-6, "(read under each vertex, its back stands 5 m up the bank)");
  // Interlagos: sector A in five pieces, each following the ground along its own front line; the start gantry over the track
  const spoA = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "grandstands.json"), "utf8")).circuits["São Paulo"].stands.find((s) => s.n === "A").model, pcs = [spoA, ...spoA.also];
  assert.deepStrictEqual(pcs.map((p) => p.file).sort(), [1, 2, 3, 4, 5].map((k) => "spo_stand_a_" + k + ".glb"));
  assert.ok(pcs.every((p) => p.heading === 180 && Array.isArray(p.at) && Array.isArray(p.drape.along) && p.drape.along.length >= 2 && p.drape.along.every((q) => q.length === 2) && !("tilt" in p)));
  const sg = F.FACILITIES.find((f) => f.id === "interlagos-start-gantry");
  assert.ok(sg.model.file === "spo_gantry.glb" && sg.model.heading === 345.77 && sg.venue[0] === 14 && !sg.replaces.names.test("") && sg.model.footprint.length === 4 && !sg.model.level);
});

// v0.70: Spa-Francorchamps – the pit building's storeys over the builder's garages, on the line through the garages that
// stand on the door line (the map's outline, and with it the garages, stands 3 m further out along the middle 78 m); the
// start gantry; 13 stand files, each following the ground along its own front line; the pit-lane roads from surveyed lines
// (pitroads.js – test/pitroads.test.js). Held back: the endurance pits and their footbridge (this app's track runs through
// their place), the pit wall and the three road slabs (built by the app).
test("v0.70: Spa-Francorchamps – the pit building's storeys, the start gantry, 13 stand files on their front lines; a pit model along the garages that stand on one line", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const F = await import("../src/renderer/facilities.js");
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "data", "models"));
  const spa = files.filter((f) => /^spa_/.test(f)).sort();
  assert.strictEqual(spa.length, 15); assert.ok(spa.includes("spa_pit_upper.glb") && spa.includes("spa_gantry.glb")); assert.strictEqual(spa.filter((f) => /^spa_stand_/.test(f)).length, 13);
  for (const f of ["spa_endurance.glb", "spa_footbridge.glb", "spa_pitwall.glb", "spa_pit.glb", "spa_pitlane_entry.glb", "spa_pitlane_main.glb", "spa_pitlane_exit.glb"]) assert.ok(!files.includes(f), f + " is not shipped");
  const readme = fs.readFileSync(path.join(__dirname, "..", "src", "data", "models", "README.md"), "utf8"); for (const f of spa) assert.ok(readme.includes("`" + f + "`"), f);
  // the storeys: made with +Z to the pit lane, set on the garage fronts' line, the garage level cut to the model's depth
  const U = F.PIT_UPPERS[7];
  assert.ok(U.file === "spa_pit_upper.glb" && U.turned === true && U.alongFronts === true && U.fill === false && U.front === 11.75 && U.garageTop === 4.8 && U.maxDepth >= U.depth && !U.from && !U.seasons);
  assert.ok(U.span[0] < 0 && U.span[1] > 0 && Math.abs(U.span[1] - U.span[0] - U.length) < 0.05);
  // the gantry: no map record makes way, its footprint the outer leg only
  const sg = F.FACILITIES.find((f) => f.id === "spa-start-gantry");
  assert.ok(sg.model.file === "spa_gantry.glb" && sg.venue[0] === 7 && sg.kind === "tower" && !sg.replaces.names.test("") && sg.model.footprint.length === 4 && !sg.model.level);
  // the stands: 13 listed stands carry a file – one each –, heading 180, the ground read along their front lines
  const st = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "grandstands.json"), "utf8")).circuits["Spa-Francorchamps"].stands.filter((s) => s.model);
  assert.strictEqual(st.length, 13); assert.strictEqual(new Set(st.map((s) => s.model.file)).size, 13);
  assert.ok(st.every((s) => files.includes(s.model.file) && s.model.heading === 180 && Array.isArray(s.model.at) && Array.isArray(s.model.drape.along) && s.model.drape.along.length >= 2 && s.model.drape.along.every((q) => q.length === 2) && !s.model.also && /made for this app/.test(s.model.src)));
  assert.ok(st.find((s) => s.n === "Gold 7").model.src.includes("GUESS"), "Gold 7's facing is a guess – said so in its source line");
  // upper.alongFronts where a stretch of garages stands further out: 20 garages on one line, the middle five 3 m out in the
  // lane – the model's front on the line through the fifteen, not dragged out by the five
  const kf = 0.01, sl = []; for (let i = 0; i < 20; i++) { const x = -95 + i * 10, out = i >= 8 && i <= 12 ? 3 : 0; sl.push({ front: [x, 10 + kf * x - out], floor: 5, width: 10, inward: [0, 1], along: [1, 0] }); }
  const r = { garages: { slots: sl, top: 4.8 }, footprint: [[-100, 6], [100, 8], [100, 30], [-100, 28]] };
  const long = () => { const m = new THREE.Group(); m.add(new THREE.Mesh(new THREE.BoxGeometry(200, 10, 20).translate(0, 10, 0), new THREE.MeshStandardMaterial())); return m; };
  const ua = F.addUpper(new THREE.Group(), r, long(), { file: "t.glb", garageTop: 5, front: 10, length: 200, depth: 20, alongFronts: true });
  assert.ok(Math.abs(ua.inward[0] + ua.inward[1] * kf) < 1e-9, "square to the fifteen garages' line");
  const off = ua.info.upperFronts.map(([, e]) => e); assert.ok(off.every((e) => Math.abs(e) < 0.02), "the end garages on the model's front line: " + JSON.stringify(off));
  // a start-lights gantry model carries a mark where this app's five lamps hang (model.lights): with it in the scene
  // map3d.js builds no gantry of its own. The four gantries name the face: the grid's side (Red Bull Ring's panel hangs on
  // the far side: its lamps under the beam, looking back)
  const ids = ["spa-start-gantry", "silverstone-start-gantry", "interlagos-start-gantry", "red-bull-ring-start-gantry"].map((id) => F.FACILITIES.find((f) => f.id === id).model.lights);
  assert.ok(ids.every((L) => L && L.y[1] > L.y[0] && L.y[0] > 5 && Math.abs(L.face) === 1)); assert.deepStrictEqual(ids.map((L) => L.face), [1, 1, 1, -1]);
  // a beam from x 0 to 20, turned a quarter (its +Z to scene +x), at (100, 3, 50); the mark on its +Z face 0.9 m out
  const holder = new THREE.Group(); holder.position.set(100, 3, 50); holder.rotation.y = Math.PI / 2;
  const mk = new THREE.Object3D(); mk.position.set(0, 6.5, 0.9 + 0.19); mk.userData = { h: 1.3, face: 1, x0: -0.4, x1: 20.4 }; holder.add(mk); holder.updateMatrixWorld(true);
  const onMid = F.lampsOnModel(mk);
  assert.strictEqual(onMid.pos.length, 5); assert.ok(onMid.pos.every((q) => Math.abs(q[0] - 101.09) < 1e-9 && Math.abs(q[1] - 9.5) < 1e-9));
  assert.ok(Math.abs(onMid.pos[2][2] - 40) < 1e-9 && Math.abs(onMid.pos[1][2] - onMid.pos[2][2]) - 1.4 < 1e-9 && Math.abs(onMid.h - 1.2) < 1e-9, "over the beam's middle, 1.4 m apart: " + JSON.stringify(onMid.pos[2]));
  assert.ok(Math.abs(Math.sin(onMid.yaw) - 1) < 1e-9, "looking along the model's +Z (scene +x)");
  // over the track's middle where that is known – kept 3.6 m inside the beam's ends
  assert.ok(Math.abs(F.lampsOnModel(mk, [80, 44]).pos[2][2] - 44) < 1e-9);
  assert.ok(Math.abs(F.lampsOnModel(mk, [80, 70]).pos[2][2] - (50 + 0.4 - 3.6)) < 1e-9 && Math.abs(F.lampsOnModel(mk, [80, 20]).pos[2][2] - (50 - 20.4 + 3.6)) < 1e-9);
  // the reds come on from the grid's left: on the +Z face the first lamp is at the smaller x (scene z 42.8 here, the beam's
  // +X running to −z), on the −Z face at the larger
  assert.ok(Math.abs(onMid.pos[0][2] - 42.8) < 1e-9 && Math.abs(onMid.pos[4][2] - 37.2) < 1e-9);
  mk.userData.face = -1; const back = F.lampsOnModel(mk); assert.ok(Math.abs(Math.sin(back.yaw) + 1) < 1e-9, "face −1: looking the other way");
  assert.ok(Math.abs(back.pos[0][2] - 37.2) < 1e-9 && Math.abs(back.pos[4][2] - 42.8) < 1e-9, "…and lit from the other end of the beam: the viewers' left");
});

// v0.70: Monza – the Palazzina Box's storeys and the terrace canopy over the builder's garages, the Hospitality
// Building, the Centro Medico, the gantry before the control line, the two towers (the landmarks built in code give way to
// the models), 38 stand files; the cars in the surveyed fast lane (pitroads.js lane.fast).
test("v0.70: Monza – the pit building's storeys with the canopy, five more models, 38 stand files; landmarks built in code give way to a facility's model", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const F = await import("../src/renderer/facilities.js");
  const L = await import("../src/renderer/landmarks.js");
  const { PIT_ROADS } = await import("../src/renderer/pitroads.js");
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "data", "models"));
  const mza = files.filter((f) => /^mza_/.test(f)).sort();
  assert.strictEqual(mza.length, 44); assert.strictEqual(mza.filter((f) => /^mza_stand_/.test(f)).length, 38);
  for (const f of ["mza_podium.glb", "mza_pit.glb", "mza_pitwall.glb", "mza_gantry.glb", "mza_pitlane_entry.glb", "mza_pitlane_main.glb", "mza_pitlane_exit.glb", "mza_stand_trib_p10.glb", "mza_stand_trib_p11.glb", "mza_stand_vedano_n.glb"]) assert.ok(!files.includes(f), f + " is not shipped");
  const readme = fs.readFileSync(path.join(__dirname, "..", "src", "data", "models", "README.md"), "utf8"); for (const f of mza) assert.ok(readme.includes("`" + f + "`"), f);
  const U = F.PIT_UPPERS[39];
  assert.ok(U.file === "mza_pit_upper.glb" && U.turned === true && U.alongFronts === true && U.fill === false && U.front === 12.7 && U.garageTop === 5.0 && U.maxDepth >= U.depth && U.also.length === 1 && U.also[0].file === "mza_pit_canopy.glb" && !U.also[0].to);
  assert.ok(U.span[0] === -U.span[1] && U.span[1] > U.length / 2, "the model reaches past the building's ends: the drums");
  const at = (id) => F.FACILITIES.find((f) => f.id === id);
  for (const id of ["monza-hospitality", "monza-centro-medico", "monza-finish-gantry", "monza-torre-sud", "monza-torre-nord"]) { const f = at(id); assert.ok(f && f.venue[0] === 39 && f.status === "trial" && files.includes(f.model.file) && !f.model.lights && !f.model.level, id); }
  assert.ok(at("monza-hospitality").replaces.names.test("Hospitality Building") && at("monza-centro-medico").replaces.names.test("Centro Medico") && !at("monza-finish-gantry").replaces.names.test("") && !at("monza-torre-sud").replaces.names.test(""));
  assert.strictEqual(at("monza-torre-sud").model.file, at("monza-torre-nord").model.file);
  // the podium's model (deck at 6.0 m) is held back: a 2011 photograph shows the deck level with the roof terrace, as the
  // 9.5 m podium built in code has it – that one stays until a model at 9–10 m comes (its givesWayTo names the id)
  assert.ok(!at("monza-podium"), "no podium model yet");
  // the stands: 38 with a file (24 that were listed, 14 listed for it), each at a place of its own, following the ground
  const st = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "grandstands.json"), "utf8")).circuits.Monza.stands;
  const wm = st.filter((s) => s.model); assert.strictEqual(st.length, 43); assert.strictEqual(wm.length, 38); assert.strictEqual(new Set(wm.map((s) => s.model.file)).size, 38);
  assert.ok(wm.every((s) => files.includes(s.model.file) && s.model.heading === 180 && Array.isArray(s.model.at) && s.model.drape === true && !s.model.also && Array.isArray(s.osmAt)));
  assert.strictEqual(st.filter((s) => s.n === "GF Gradinate Interno Parabolica").length, 9); assert.ok(st.find((s) => s.n === "26A/26B/26C Laterale Destra").model.file === "mza_stand_laterale_destra.glb" && st.find((s) => s.n === "8A/8B Prima Variante Esterna").model.file === "mza_stand_prima_variante.glb");
  // the five Laterale Parabolica blocks keep this list's order (A south … E north): the files are matched by place
  assert.ok(st.find((s) => s.n === "21A Laterale Parabolica").model.file === "mza_stand_lat_parabolica_e.glb" && st.find((s) => s.n === "21E Laterale Parabolica").model.file === "mza_stand_lat_parabolica_a.glb");
  // the cars in the surveyed fast lane (7.5 … 11.5 m from the doors); the wall stays the map's – this app's lane ends at the
  // walkway before it, 11.4 … 12.1 m out, where the surveyed wall stands
  assert.deepStrictEqual(PIT_ROADS[39].lane.fast, [7.5, 11.5]); assert.ok(!("wallAt" in PIT_ROADS[39].lane) && !PIT_ROADS[7].lane.fast);
  // a landmark built in code gives way to the facility's model (landmarks.js givesWayTo → combine)
  const gf = { xz: (p) => p, fromLL: (la, lo) => [lo, la] }, scene = { buildings: [{ name: "Podio", pts: [[0, 0], [10, 0], [10, 10], [0, 10]] }] };
  const mk = () => L.buildLandmarks({ scene, gf, groundAt: () => 0, location: "Monza", venue: { key: 39 }, toTrack: () => [1, 0] });
  const lm = mk(); assert.ok(lm.count > 10 && lm.skip(scene.buildings[0]));
  const marks = new Set(lm.group.children.map((m) => m.userData.givesWayTo)); assert.deepStrictEqual([...marks].sort(), ["monza-podium", "monza-torre-nord", "monza-torre-sud"]);
  const fac = (ids) => ({ group: new THREE.Group(), skip: () => false, keepOut: () => false, count: 0, spots: [], info: ids.map(([id, how]) => ({ id, how })) });
  const all = lm.group.children.length, both = F.combine(lm, fac([["monza-podium", "model"], ["monza-torre-sud", "builder"], ["generic-pits", "builder+model"]]));
  assert.ok(lm.group.children.every((m) => m.userData.givesWayTo !== "monza-podium") && lm.group.children.some((m) => m.userData.givesWayTo === "monza-torre-sud") && lm.group.children.length < all, "the podium went, the towers stand (no model came for them)");
  assert.ok(both.skip(scene.buildings[0]), "what the landmark replaced on the map stays replaced");
  const lm2 = mk(); F.combine(lm2, fac([["monza-podium", "model"], ["monza-torre-sud", "model"], ["monza-torre-nord", "model"]])); assert.strictEqual(lm2.group.children.length, 0);
});

// v0.70: Zandvoort – the pit building's storeys (the old block, the round tower, the 2024 block) over the builder's garages,
// the start gantry carrying the start lamps, 16 stand files on their front lines; the pit-lane roads from surveyed lines
// (the exit road round the inside of the Tarzanbocht). No surveyed wall place: this app's track lies over it.
test("v0.70: Zandvoort – the pit building's storeys, the start gantry with the lamps, 16 stand files; the lane's paint, no wall or fast-lane place", async () => {
  const F = await import("../src/renderer/facilities.js");
  const { PIT_ROADS } = await import("../src/renderer/pitroads.js");
  const files = fs.readdirSync(path.join(__dirname, "..", "src", "data", "models"));
  const zan = files.filter((f) => /^zan_/.test(f)).sort();
  assert.strictEqual(zan.length, 18); assert.strictEqual(zan.filter((f) => /^zan_stand_/.test(f)).length, 16);
  for (const f of ["zan_pit.glb", "zan_pitwall.glb", "zan_pitlane_entry.glb", "zan_pitlane_main.glb", "zan_pitlane_exit.glb"]) assert.ok(!files.includes(f), f + " is not shipped");
  const readme = fs.readFileSync(path.join(__dirname, "..", "src", "data", "models", "README.md"), "utf8"); for (const f of zan) assert.ok(readme.includes("`" + f + "`"), f);
  const U = F.PIT_UPPERS[55];
  assert.ok(U.file === "zan_pit_upper.glb" && U.turned === true && U.alongFronts === true && U.fill === false && U.front === 12.0 && U.garageTop === 4.8 && U.maxDepth >= U.depth && !U.also);
  assert.ok(Math.abs(U.span[1] - U.span[0] - U.length) < 0.05 && U.span[1] > -U.span[0], "the model reaches further at its south end: the annexe");
  const g = F.FACILITIES.find((f) => f.id === "zandvoort-start-gantry");
  assert.ok(g.model.file === "zan_gantry.glb" && g.venue[0] === 55 && !g.replaces.names.test("") && g.model.footprint.length === 4 && g.model.lights.face === 1 && g.model.lights.y[0] > 5, "the start lamps hang on the model's panel");
  const st = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "grandstands.json"), "utf8")).circuits.Zandvoort.stands;
  assert.strictEqual(st.length, 16); assert.ok(st.every((s) => s.model && files.includes(s.model.file) && s.model.heading === 180 && Array.isArray(s.model.at) && Array.isArray(s.model.drape.along) && s.model.drape.along.length >= 2));
  assert.strictEqual(new Set(st.map((s) => s.model.file)).size, 16);
  // the lane: the surveyed fast lane for the cars; no wall place (this app's track lies over the surveyed wall)
  const P = PIT_ROADS[55]; assert.ok(!P.lane.fast && !P.lane.wallAt, "this app's lane is nowhere wide enough for the surveyed fast lane"); assert.deepStrictEqual(P.lane.u, [-36, 223]); assert.strictEqual(P.exit.edgeLine, 0.15); assert.strictEqual(P.edgeLine, 0);
});

