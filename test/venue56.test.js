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
  assert.ok(files.includes("hun_stand_b.glb") && files.includes("hun_pit_upper_v2.glb") && files.includes("lv_stand_c.glb") && files.includes("lv_pit_upper.glb"));
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
