// Facility models (src/renderer/facilities.js): what they replace, when, how they're placed, and that a failure or a
// stale result leaves the map's own buildings standing.
const test = require("node:test");
const assert = require("node:assert");
const { boxGlb } = require("./glb.js");

const load = () => import("../src/renderer/facilities.js");

// a plain frame: F1 metres → scene (x, −y), lat/lon ↔ metres around (52, −1) with no rotation
const LAT0 = 52, LON0 = -1, M_LAT = 111320, M_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const gf = {
  xz: ([X, Y]) => [X, -Y],
  fromLL: (lat, lon) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT],
  toLL: (x, z) => [LAT0 - z / M_LAT, LON0 + x / M_LON],
};
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
// A Wing-like building along X (F1 metres): a high end at x < 0 with a blade block, a folded run, a long low run,
// plus an unnamed shed inside its outline and a named neighbour outside it. The track runs along y = 60.
function wingScene() {
  const W = (pts, min, h, roof = null, rh = null, extra = {}) => ({ name: "Test Wing", kind: "block", cls: "yes", part: 1, est: 0, pts, min, h, roof, rh, ...extra });
  return { location: "Testring", buildings: [
    W(rect(-170, 0, -137, 30), 0, 11.5, "flat"),
    W(rect(-154, 0, -137, 30), 18, 30, "skillion", 12),
    W(rect(-137, 0, -73, 30), 11.5, 23, "skillion", 5), W(rect(-137, 0, -23, 30), 0, 11.5),
    W(rect(-73, 0, -23, 30), 11.5, 27, "skillion", 9),
    W(rect(-23, 0, 15, 30), 0, 27, "skillion", 14),
    W(rect(15, 0, 200, 30), 0, 16, "skillion", 4.5),
    { name: null, kind: "block", cls: "yes", part: 0, est: 1, pts: rect(100, 10, 110, 20), min: 0, h: 6 },       // inside: goes
    { name: "Hotel", kind: "block", cls: "hotel", part: 0, est: 0, pts: rect(-160, -60, -120, -30), min: 0, h: 16 }, // outside: stays
    { name: "Test Wing Stand", kind: "grandstand", pts: rect(0, 70, 50, 90), min: 0, h: 10 },                       // a stand: never
  ] };
}
const SPEC = (over = {}) => ({ id: "test-wing", loc: ["Testring"], years: [2011, null], status: "trial", replaces: { names: /^Test Wing$/ }, builder: "pitBuilding",
  params: { garages: 41, blade: { length: 16.5, angle: 40, tip: 30, depth: 2.18 }, plate: 1.6, overhang: { pit: 3, paddock: 2, end: 2 }, facade: { pit: "pitGlass", paddock: "paddockPanels" } }, ...over });
const toTrack = (x, z) => { const dz = -60 - z; return [0, Math.sign(dz) || 1]; };   // the track is at scene z = −60
const base = (registry, extra = {}) => ({ scene: wingScene(), gf, groundAt: () => 100, location: "Testring", year: 2025, toTrack, registry, ...extra });

test("facility: the builder replaces exactly its map records (named parts, unnamed ones inside it), nothing else", async () => {
  const F = await load();
  const s = wingScene();
  const fresh = await F.buildFacilities({ ...base([SPEC()]), scene: s });
  const gone = s.buildings.filter((b) => fresh.skip(b));
  assert.deepStrictEqual(gone.map((b) => b.name || "unnamed").sort(), [...Array(7).fill("Test Wing"), "unnamed"].sort());
  assert.ok(!gone.some((b) => b.name === "Hotel" || b.kind === "grandstand"));
  assert.strictEqual(fresh.info[0].how, "builder");
  assert.ok(fresh.group && fresh.count === 1);
  // trees keep off it, not off the hotel
  assert.strictEqual(fresh.keepOut(50, -15), true);
  assert.strictEqual(fresh.keepOut(-140, 45), false);
});

test("facility: the folded roofline follows the parts' heights; the blade meets the published geometry", async () => {
  const F = await load();
  const r = await F.buildFacilities(base([SPEC()]));
  const i = r.info[0];
  assert.ok(Math.abs(i.length - 370) < 2, `length ${i.length}`);
  assert.ok(Math.abs(i.bladeRoot - (30 - 16.5 * Math.sin((40 * Math.PI) / 180))) < 0.05);
  const ys = i.profile.map((p) => p[1]);
  assert.ok(Math.max(...ys) <= 27 + 1e-6 && Math.max(...ys) >= 26.9, "peak at the tallest part (27 m)");
  assert.ok(Math.abs(ys[ys.length - 1] - 16) < 0.01 || Math.abs(ys[ys.length - 1] - 11.5) < 0.01, "the low run ends at one of its heights");
  // the roof plate stands where the building is: everything within the footprint's box (+ overhangs, the blade)
  const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, y1: -Infinity };
  r.group.traverse((o) => { if (!o.isMesh) return; const p = o.geometry.attributes.position; for (let k = 0; k < p.count; k++) { box.x0 = Math.min(box.x0, p.getX(k)); box.x1 = Math.max(box.x1, p.getX(k)); box.z0 = Math.min(box.z0, p.getZ(k)); box.z1 = Math.max(box.z1, p.getZ(k)); box.y1 = Math.max(box.y1, p.getY(k)); } });
  assert.ok(box.x0 > -172 && box.x1 < 204, `x ${box.x0}..${box.x1}`);
  assert.ok(box.z0 > -34 && box.z1 < 3, `z ${box.z0}..${box.z1} (the pit side overhangs 3 m towards the track)`);
  assert.ok(Math.abs(box.y1 - 130) < 0.01, "the blade's tip 30 m above the ground (100)");
});

test("folded profile: skillion directions are chosen for the most continuous roofline", async () => {
  const { foldedProfile } = await load();
  // 23/5, then 27/9, then 27/14: the continuous choice is 23→18, 18→27, 27→13
  const p = foldedProfile([{ u0: 0, u1: 60, h: 23, rh: 5 }, { u0: 60, u1: 110, h: 27, rh: 9 }, { u0: 110, u1: 150, h: 27, rh: 14 }], 23);
  const at = (u) => { for (let i = 1; i < p.length; i++) if (u <= p[i][0]) { const [a, ya] = p[i - 1], [b, yb] = p[i]; return ya + ((u - a) / (b - a || 1)) * (yb - ya); } return p[p.length - 1][1]; };
  assert.ok(Math.abs(at(0) - 23) < 0.01 && Math.abs(at(60) - 18) < 0.01 && Math.abs(at(110) - 27) < 0.01 && Math.abs(at(150) - 13) < 0.01, JSON.stringify(p));
  assert.deepStrictEqual(foldedProfile([]), []);
  assert.deepStrictEqual(foldedProfile([{ u0: 0, u1: 10, h: 8, rh: 0 }]), [[0, 8], [10, 8]]);
});

test("facility: a trial one is off with the setting off; a permanent one stays; other circuits and years untouched", async () => {
  const F = await load();
  const off = await F.buildFacilities(base([SPEC()], { trial: false }));
  assert.strictEqual(off.group, null);
  assert.strictEqual(wingScene().buildings.some((b) => off.skip(b)), false);
  assert.strictEqual(off.info[0].how, "off");
  const perm = await F.buildFacilities(base([SPEC({ status: "permanent" })], { trial: false }));
  assert.strictEqual(perm.info[0].how, "builder");
  const other = await F.buildFacilities(base([SPEC()], { location: "Elsewhere" }));
  assert.strictEqual(other.group, null); assert.deepStrictEqual(other.info, []);
  const before = await F.buildFacilities(base([SPEC({ years: [2026, null] })], { year: 2025 }));
  assert.strictEqual(before.group, null); assert.strictEqual(before.info[0].reason, "year");
  const later = await F.buildFacilities(base([SPEC({ years: [2011, 2024] })], { year: 2025 }));
  assert.strictEqual(later.group, null);
});

test("facility: when its model can't be made the map's buildings stay (no gap)", async () => {
  const F = await load();
  // no matching parts at all
  const none = await F.buildFacilities(base([SPEC({ replaces: { names: /^Nothing$/ } })]));
  assert.strictEqual(none.info[0].how, "fallback");
  assert.strictEqual(wingScene().buildings.some((b) => none.skip(b)), false);
  // a model file that fails to load and no builder
  const failing = await F.buildFacilities(base([{ id: "m", loc: ["Testring"], status: "permanent", replaces: { names: /^Test Wing$/, within: 400 }, model: { file: "missing.glb", anchor: [52, -1], heading: 0 } }],
    { readModel: async () => { throw new Error("모델 파일이 없어요"); } }));
  assert.strictEqual(failing.info[0].how, "fallback");
  assert.match(failing.info[0].reason, /없어요/);
  assert.strictEqual(wingScene().buildings.some((b) => failing.skip(b)), false);
  // a model file failing, the builder standing in
  const both = await F.buildFacilities(base([SPEC({ model: { file: "broken.glb", anchor: [52, -1] } })], { readModel: async () => new Uint8Array([1, 2, 3]) }));
  assert.strictEqual(both.info[0].how, "builder");
  assert.match(both.info[0].modelError, /size|glTF/);
});

test("facility: a result for a world that's gone is dropped (null) and nothing is left attached", async () => {
  const F = await load();
  let current = true;
  const r = await F.buildFacilities(base([{ id: "m", loc: ["Testring"], status: "trial", replaces: { names: /^Test Wing$/, within: 400 }, model: { file: "box-a.glb", anchor: [52, -1], heading: 0 } }],
    { readModel: async () => { current = false; return boxGlb({ w: 20, h: 8, d: 10 }); }, isCurrent: () => current }));
  assert.strictEqual(r, null);
});

test("GLB model: checked, placed by latitude/longitude and compass heading, units scaled, set on the ground", async () => {
  const F = await load();
  assert.strictEqual(F.checkGlb(boxGlb()), null);
  assert.match(F.checkGlb(boxGlb({ texture: true, externalImage: true })), /external image/);
  assert.match(F.checkGlb(new Uint8Array(40)), /glTF/);
  // 100 m east and 50 m north of the frame's origin, heading 90° (the model's +Z points east), in centimetres
  const lat = LAT0 + 50 / M_LAT, lon = LON0 + 100 / M_LON;
  const pl = F.placement({ anchor: [lat, lon], heading: 90, units: "cm", scale: 2 }, gf, () => 42);
  assert.ok(Math.abs(pl.position[0] - 100) < 1e-6 && Math.abs(pl.position[2] + 50) < 1e-6 && pl.position[1] === 42);
  assert.ok(Math.abs(Math.sin(pl.rotationY) - 1) < 1e-9, "model +Z → scene +X (east)");
  assert.strictEqual(pl.scale, 0.02);
  assert.throws(() => F.placement({ anchor: [lat, lon], units: "furlong" }, gf, () => 0), /units/);
  // a real GLB through the loader, standing where it should, replacing only the records within reach
  const spec = { id: "box", loc: ["Testring"], status: "trial", replaces: { names: /^Test Wing$/, within: 60 }, model: { file: "box.glb", anchor: [LAT0 + 15 / M_LAT, LON0 + 120 / M_LON], heading: 0, origin: "base-centre" } };
  const scene = wingScene();
  const r = await F.buildFacilities(base([spec], { scene, readModel: async (f) => (f === "box.glb" ? boxGlb({ w: 20, h: 8, d: 10 }) : null) }));
  assert.strictEqual(r.info[0].how, "model");
  const mesh = r.group.getObjectByProperty("isMesh", true);
  mesh.updateMatrixWorld(true);
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const b = new THREE.Box3().setFromObject(r.group);
  assert.ok(Math.abs(b.min.y - 100) < 1e-6 && Math.abs(b.max.y - 108) < 1e-6, "on the ground, 8 m high");
  assert.ok(Math.abs((b.min.x + b.max.x) / 2 - 120) < 1e-6 && Math.abs((b.min.z + b.max.z) / 2 + 15) < 1e-6, "centred on its anchor");
  // within 60 m of the anchor (120, −15): only the long low part it stands in (x 15..200), not the others
  const gone = scene.buildings.filter((x) => r.skip(x));
  assert.deepStrictEqual(gone.map((x) => x.pts[0]), [[15, 0]]);
});

test("GLB model: shared by every placement, never freed by a world's disposal; freed when evicted unused", async () => {
  const F = await load();
  const reads = [];
  const read = async (f) => { reads.push(f); return boxGlb(); };
  const spec = (f) => ({ id: f, loc: ["Testring"], status: "trial", replaces: { names: /^Nope$/ }, model: { file: f, anchor: [52, -1] } });
  const a = await F.buildFacilities(base([spec("shared.glb")], { readModel: read }));
  const b = await F.buildFacilities(base([spec("shared.glb")], { readModel: read }));
  assert.deepStrictEqual(reads, ["shared.glb"], "parsed once");
  const ga = a.group.getObjectByProperty("isMesh", true).geometry, gb = b.group.getObjectByProperty("isMesh", true).geometry;
  assert.strictEqual(ga, gb, "placements share the model's geometry");
  assert.strictEqual(ga.userData.shared, true);
});

test("combine: landmarks and facilities skip, keep out and light as one group named landmarks", async () => {
  const F = await load();
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const lg = new THREE.Group(); lg.name = "landmarks"; lg.add(new THREE.Mesh());
  const lm = { group: lg, skip: (b) => b.name === "L", restyle: (b) => (b.name === "R" ? { glass: true } : null), keepOut: (x) => x < 0, count: 1, spots: [[0, 0, 1]] };
  const fg = new THREE.Group(); fg.name = "facilities";
  const fac = { group: fg, skip: (b) => b.name === "F", keepOut: (x) => x > 100, count: 1, spots: [[5, 5, 1]], info: [{ id: "x" }] };
  const c = F.combine(lm, fac);
  assert.strictEqual(c.group.name, "landmarks"); assert.strictEqual(fg.parent, lg);
  assert.ok(c.skip({ name: "L" }) && c.skip({ name: "F" }) && !c.skip({ name: "Q" }));
  assert.deepStrictEqual(c.restyle({ name: "R" }), { glass: true });
  assert.ok(c.keepOut(-1, 0) && c.keepOut(101, 0) && !c.keepOut(50, 0));
  assert.strictEqual(c.count, 2); assert.strictEqual(c.spots.length, 2);
  const onlyFac = F.combine({ group: null, skip: () => false, restyle: () => null, keepOut: () => false, count: 0, spots: [] }, fac);
  assert.strictEqual(onlyFac.group.name, "landmarks");
  assert.strictEqual(F.combine(lm, null), lm);
});

test("GLB model cache: past its limit, a model no world uses any more is freed (and one in use isn't)", async () => {
  const F = await load(), { disposeGroup } = await import("../src/renderer/dispose.js");
  const spec = (f) => ({ id: f, loc: ["Testring"], status: "trial", replaces: { names: /^Nope$/ }, model: { file: f, anchor: [52, -1] } });
  const read = async () => boxGlb();
  const first = await F.buildFacilities(base([spec("e0.glb")], { readModel: read }));
  const g0 = first.group.getObjectByProperty("isMesh", true).geometry;
  let freed = false; g0.addEventListener("dispose", () => { freed = true; });
  // (each world disposed before the next is built, as the app does: then its models can go)
  disposeGroup(first.group);
  for (let i = 1; i <= 7; i++) disposeGroup((await F.buildFacilities(base([spec(`e${i}.glb`)], { readModel: read }))).group);
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(freed, true, "the oldest unused model is freed");
  const keep = await F.buildFacilities(base([spec("k.glb")], { readModel: read }));
  const gk = keep.group.getObjectByProperty("isMesh", true).geometry;
  let kFreed = false; gk.addEventListener("dispose", () => { kFreed = true; });
  for (let i = 10; i <= 17; i++) await F.buildFacilities(base([spec("k.glb"), spec(`f${i}.glb`)], { readModel: read }));
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(kFreed, false, "a model used by the latest build stays");
});

// ---------- general buildings (buildings.js) ----------
test("buildings: two records on one outline with overlapping heights become one; stacked ones stay two", async () => {
  const { mergeSameOutline } = await import("../src/renderer/buildings.js");
  const P = rect(0, 0, 10, 10), Q = rect(20, 0, 30, 10);
  const a = { pts: P, min: 0, h: 19.2, name: "Raffles Hospital" }, b = { pts: P, min: 0, h: 6.4, roof: "flat" };
  const c = { pts: Q, min: 0, h: 10 }, d = { pts: Q, min: 10, h: 20 };       // stacked
  const { merged, twice } = mergeSameOutline([a, b, c, d]);
  assert.ok(twice.has(b) && !twice.has(a) && !twice.has(c) && !twice.has(d));
  assert.deepStrictEqual([merged.get(a).min, merged.get(a).h, merged.get(a).name], [0, 19.2, "Raffles Hospital"]);
  assert.strictEqual(merged.has(c), false);
});

test("buildings: a roof laid along its data direction; across turns it; near-black data colours become charcoal", async () => {
  const { obbDir, turned, darkFloor } = await import("../src/renderer/buildings.js");
  const pts = [[0, 0], [20, 0], [20, 10], [0, 10]];
  // facing +x (down the slope towards +x): the ridge runs along z, the roof rises towards −x
  const o = obbDir(pts, [1, 0]);
  assert.deepStrictEqual(o.u.map((x) => Math.round(x * 1e9) / 1e9 + 0), [0, 1]);
  assert.deepStrictEqual(o.v, [-1, -0]);
  assert.strictEqual(o.v1 - o.v0, 20);
  const t = turned({ c: [0, 0], u: [1, 0], v: [0, 1], u0: -10, u1: 10, v0: -5, v1: 5 });
  assert.deepStrictEqual([t.u, t.v, t.u1 - t.u0, t.v1 - t.v0], [[0, 1], [-1, -0], 10, 20]);
  assert.strictEqual(darkFloor("#000000"), "#3a3e42");
  assert.strictEqual(darkFloor("#202020"), "#3a3e42");
  assert.strictEqual(darkFloor("#80878D"), "#80878D");
});

test("pit builder: follows the ground along a slope, uses the facility's height where the data guessed, pod at the upstream end", async () => {
  const F = await load();
  const THREE = await import("../src/renderer/vendor/three.module.js");
  // a 350 m building along X whose height the data only guessed (8 m); the ground falls 2.8 % towards +x
  const scene = { location: "Slope", buildings: [{ name: "Pits", kind: "block", cls: "yes", part: 0, est: 1, pts: rect(-175, 0, 175, 40), min: 0, h: 8 }] };
  const spec = { id: "slope-pits", loc: ["Slope"], status: "trial", replaces: { names: /^Pits$/ }, builder: "pitBuilding",
    params: { height: 16.5, garagePitch: 9, balconies: [{ y: 6.8, depth: 2.4 }], plate: 0.9, overhang: { pit: 8, paddock: 1.5, end: 3 }, columns: { spacing: 12, from: 5.6 },
      pod: { end: "upstream", length: 46, y0: 4, y1: 13.5, width: 0.7, out: 6 }, facade: { pit: "pitStand", paddock: "paddockPanels" } } };
  const ground = (x) => 100 - 0.028 * x;
  for (const dir of [1, -1]) {   // cars running towards +x, then towards −x: the pod goes to the upstream end each time
    const r = await F.buildFacilities({ scene, gf, groundAt: (x) => ground(x), location: "Slope", toTrack: (x, z) => [0, -1], alongTrack: () => [dir, 0], registry: [spec] });
    const i = r.info[0];
    assert.strictEqual(i.heightFrom, "facility (the data only guessed it, or counted floors)");
    assert.ok(Math.abs(i.groundFall - 9.8) < 0.3, `ground fall ${i.groundFall}`);
    assert.strictEqual(i.profile[0][1], 16.5);
    const pod = r.group.getObjectByName("pod");
    assert.ok(pod.position.x * dir < -140, `pod at the upstream end (x ${pod.position.x.toFixed(1)})`);
    // the roof stands 16.5 m over the ground at both ends (it steps with the slope)
    const roof = r.group.getObjectByName("roofTop"), p = roof.geometry.attributes.position;
    let lo = null, hi = null;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k); if (x < -170 && (!lo || y > lo)) lo = y; if (x > 170 && (!hi || y > hi)) hi = y; }
    assert.ok(Math.abs(lo - ground(-172) - 16.5) < 0.8 && Math.abs(hi - ground(172) - 16.5) < 0.8, `roof ${lo} / ${hi}`);
    // balconies and columns on the track side (scene z < 0 here: the track is towards −z)
    for (const name of ["slab", "column"]) {
      const g = r.group.getObjectByName(name); assert.ok(g, name);
      const b = new THREE.Box3().setFromObject(g); assert.ok(b.min.z < -40, `${name} reaches out over the pit lane (z ${b.min.z.toFixed(1)})`);
    }
  }
});

test("registry: every facility says where it is, what it replaces, how it's made and from what sources", async () => {
  const { FACILITIES } = await load();
  const ids = new Set();
  for (const f of FACILITIES) {
    assert.ok(/^[a-z0-9-]+$/.test(f.id) && !ids.has(f.id), f.id); ids.add(f.id);
    assert.ok(Array.isArray(f.loc) && f.loc.length, f.id);
    // what it replaces: by name, or by position (a point inside the record, or within some metres of it)
    assert.ok(f.replaces?.names instanceof RegExp || (Array.isArray(f.replaces?.near) && f.replaces.near.length === 2), f.id);
    if (!f.replaces.names) assert.ok(!f.replaces.within || f.replaces.within <= 60, `${f.id}: a position-only selection stays tight`);
    assert.ok(f.builder || f.model?.file, f.id);
    assert.ok(["trial", "permanent"].includes(f.status), f.id);
    assert.ok(Array.isArray(f.sources) && f.sources.length >= 1, `${f.id}: sources`);
    if (f.status === "permanent") assert.ok(f.checked, `${f.id}: a permanent one records how it was checked`);
    if (f.model?.file) assert.ok(/^[a-z0-9][a-z0-9_-]*\.glb$/.test(f.model.file) && f.model.anchor?.length === 2, f.id);
    if (f.years) assert.ok(f.years[0] >= 1950 && (f.years[1] == null || f.years[1] >= f.years[0]), f.id);
  }
  assert.strictEqual(FACILITIES.find((f) => f.id === "silverstone-wing").status, "permanent");
  assert.strictEqual(FACILITIES.find((f) => f.id === "suzuka-pit-building").status, "trial");
});

test("pit builder: a height counted from floors gives way to the facility's; a measured one doesn't", async () => {
  const F = await load();
  const mk = (b) => ({ location: "T", buildings: [{ name: "Box", kind: "block", cls: "garage", part: 0, pts: rect(-120, 0, 120, 18), min: 0, ...b }] });
  const spec = { id: "t", loc: ["T"], status: "trial", replaces: { names: /^Box$/ }, builder: "pitBuilding",
    params: { garages: 32, height: 6.2, plate: 0.5, overhang: { pit: 0.3, paddock: 0.3, end: 0.3 }, facade: { pit: "imolaBox", paddock: "imolaBox" } } };
  const run = (scene) => F.buildFacilities({ scene, gf, groundAt: () => 0, location: "T", toTrack: () => [0, -1], alongTrack: () => [1, 0], registry: [spec] });
  const counted = await run(mk({ h: 3.2, lv: 1, est: 0 }));
  assert.strictEqual(counted.info[0].profile[0][1], 6.2);
  const measured = await run(mk({ h: 3.2, lv: null, est: 0 }));
  assert.strictEqual(measured.info[0].profile[0][1], 3.2);
  assert.strictEqual(measured.info[0].heightFrom, "data");
  assert.ok(Math.abs(counted.info[0].garagePitch - 240 / 32) < 0.01);
});

test("facility selected by position: only the record at that point, not a same-shaped neighbour", async () => {
  const F = await load();
  const A = { name: null, kind: "block", cls: "yes", est: 1, pts: rect(0, 0, 300, 30), min: 0, h: 8 };
  const B = { name: null, kind: "block", cls: "yes", est: 1, pts: rect(0, 60, 300, 90), min: 0, h: 8 };   // 30 m away
  const ll = (X, Y) => [LAT0 + Y / M_LAT, LON0 + X / M_LON];
  const spec = { id: "p", loc: ["T"], status: "trial", replaces: { near: ll(150, 15), within: 20 }, builder: "pitBuilding",
    params: { garages: 30, height: 14, plate: 0.7, overhang: { pit: 1, paddock: 1, end: 1 }, facade: { pit: "pitGlass", paddock: "yasPaddock" } } };
  const scene = { location: "T", buildings: [A, B] };
  const r = await F.buildFacilities({ scene, gf, groundAt: () => 0, location: "T", toTrack: () => [0, -1], alongTrack: () => [1, 0], registry: [spec] });
  assert.strictEqual(r.info[0].how, "builder");
  assert.deepStrictEqual(scene.buildings.map((b) => r.skip(b)), [true, false]);
});

test("pit builder: paddock-side canopy, roof railing, sloped glazing and roof tents stand where they should", async () => {
  const F = await load();
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const scene = { location: "T", buildings: [{ name: "Pits", kind: "block", cls: "yes", est: 1, pts: rect(-150, 0, 150, 30), min: 0, h: 8 }] };
  const spec = { id: "f", loc: ["T"], status: "trial", replaces: { names: /^Pits$/ }, builder: "pitBuilding",
    params: { garages: 30, height: 12, roofRail: 1.1, slopedGlass: { y0: 5.8, y1: 10.4, lean: 2.6 }, tents: { spacing: 25, peak: 7, lift: 1.5 },
      balconies: [{ y: 5, depth: 4.5, side: "paddock", rail: false }], plate: 0.8, overhang: { pit: 5, paddock: 1, end: 2 }, facade: { pit: "pitGlass", paddock: "paddockPanels" } } };
  // the track towards scene −z: the building spans z −30..0, the pit side is at z = −30
  const r = await F.buildFacilities({ scene, gf, groundAt: () => 0, location: "T", toTrack: () => [0, -1], alongTrack: () => [1, 0], registry: [spec] });
  const box = (name) => new THREE.Box3().setFromObject(r.group.getObjectByName(name));
  const glass = box("slopedGlass");
  assert.ok(glass.min.z < -32 && glass.max.y <= 10.4 + 1e-6 && glass.min.y >= 5.8 - 1e-6, "glazing leans out over the pit lane");
  const tents = box("tent");
  assert.ok(tents.max.y > 12 + 7 && tents.max.y < 12 + 1.5 + 7 + 0.01, `tents peak ${tents.max.y}`);
  const rail = box("rail");
  assert.ok(Math.abs(rail.max.y - 13.1) < 0.01, "railing 1.1 m over the roof");
  const slab = box("slab");
  assert.ok(slab.max.z > 4, "the canopy reaches out on the paddock side (z > 0)");
  // 300 m / 25 m: twelve tents
  const tg = r.group.getObjectByName("tent").geometry; assert.strictEqual(tg.attributes.position.count / 3, 12 * 4);
});

test("buildings: a guessed-height sliver (a line mapped as an area) is no building; a thin piece with a real height stays", async () => {
  const { isSliver } = await import("../src/renderer/buildings.js");
  const line = [[-171, 25], [96, 24], [118, 21], [280, -15], [280, -16], [118, 20], [96, 23], [-171, 26]];   // Imola's, roughly
  assert.strictEqual(isSliver({ est: 1 }, line), true);
  assert.strictEqual(isSliver({ est: 0 }, line), false, "a real height: kept (a tile-cut piece)");
  assert.strictEqual(isSliver({ est: 1 }, [[0, 0], [20, 0], [20, 1], [0, 1]]), false, "short: a shed");
  assert.strictEqual(isSliver({ est: 1 }, [[0, 0], [100, 0], [100, 8], [0, 8]]), false, "8 m wide: a building");
});

// ---------- teams at their garages (garages.js) ----------
test("garages: teams placed from the session's own pit stops – not standings or list order; neutral without data", async () => {
  const G = await import("../src/renderer/garages.js");
  const slots = Array.from({ length: 40 }, (_, k) => ({ k, uc: -170 + k * 8.4 + 4.2 }));
  const drivers = { 4: { TeamName: "McLaren", TeamColour: "F47600", Tla: "NOR" }, 81: { TeamName: "McLaren", TeamColour: "F47600", Tla: "PIA" },
    16: { TeamName: "Ferrari", TeamColour: "ED1131", Tla: "LEC" }, 44: { TeamName: "Ferrari", TeamColour: "ED1131", Tla: "HAM" } };
  const still = { 4: { stops: [{ u: -76, t: 1 }, { u: -75.8, t: 2 }], long: [] }, 81: { stops: [{ u: -77, t: 3 }, { u: 91, t: 4 }], long: [] },
    16: { stops: [{ u: -48, t: 5 }, { u: -47.5, t: 6 }], long: [] }, 44: { stops: [{ u: -47.3, t: 7 }], long: [] } };
  const pos = G.workPositions(still, drivers);
  assert.ok(Math.abs(pos[81].u + 76.5) < 1.5, "an odd stop elsewhere doesn't move the team's box");
  const a = G.allocate(slots, 8.4, drivers, pos);
  assert.deepStrictEqual(a.map((t) => t.team), ["McLaren", "Ferrari"]);
  // reversing the driver list (as standings change) gives the same allocation
  const rev = Object.fromEntries(Object.entries(drivers).reverse());
  assert.strictEqual(G.allocationKey(G.allocate(slots, 8.4, rev, G.workPositions(still, rev))), G.allocationKey(a));
  assert.deepStrictEqual(G.allocate(slots, 8.4, drivers, G.workPositions({}, drivers)), [], "no data: no teams");
  // qualifying-style: a driver's garage from repeated long stays
  const q = G.workPositions({ 4: { stops: [], long: [{ u: 10, t: 1 }, { u: 11, t: 2 }] }, 81: { stops: [], long: [{ u: 50, t: 3 }] } }, {});
  assert.strictEqual(q[4].from, "garage"); assert.strictEqual(q[81], undefined, "seen once: not enough");
});

test("garages: standstills only count in front of the garages, and a short one only after entering the pits", async () => {
  const G = await import("../src/renderer/garages.js");
  const car = (pts) => ({ t: pts.map((p) => p[0]), x: pts.map((p) => p[1] * 10), y: pts.map((p) => p[2] * 10), n: pts.length });
  // (driving in first: a standstill at the very start of the data could have begun before it – not a stop)
  const still3s = (t0, x, y) => [[t0 - 500, x - 20, y], [t0, x, y], [t0 + 1000, x, y], [t0 + 3000, x, y], [t0 + 3500, x + 20, y]];
  const project = (x, z) => ({ u: x, off: -z - 0 });   // garages along x at z = 0, the pit lane towards −z
  const cars = { 1: car(still3s(10000, 50, 5)), 2: car(still3s(10000, 50, 40)), 3: car(still3s(500000, 60, 5)) };
  const r = G.standstills(cars, ([X, Y]) => [X, -Y], project, [0, 300], { 1: [5000], 3: [100000] });
  assert.strictEqual(r[1].stops.length, 1);
  assert.strictEqual(r[2], undefined, "40 m out: on the track, not at a garage");
  assert.strictEqual(r[3], undefined, "long after entering: a queue, not a stop");
});

test("pit builder: real garage bays with their floor on the pit lane's surface", async () => {
  const F = await load();
  const scene = { location: "T", buildings: [{ name: "Pits", kind: "block", cls: "yes", est: 1, pts: rect(-150, 0, 150, 30), min: 0, h: 8 }] };
  const spec = { id: "g", loc: ["T"], status: "trial", replaces: { names: /^Pits$/ }, builder: "pitBuilding",
    params: { garages: 30, height: 12, plate: 0.8, overhang: { pit: 2, paddock: 1, end: 1 }, facade: { pit: "pitGlass", paddock: "paddockPanels" } } };
  const r = await F.buildFacilities({ scene, gf, groundAt: () => 10, surfaceAt: () => 10.3, location: "T", toTrack: () => [0, -1], alongTrack: () => [1, 0], registry: [spec] });
  const G = r.group.children[0].userData.garages;
  assert.strictEqual(G.slots.length, 30);
  assert.ok(G.slots.every((s) => Math.abs(s.floor - 10.3) < 1e-6), "floors level with the pit lane");
  assert.ok(Math.abs(G.pitch - 10) < 0.01);
  const p = G.project(0, -35); assert.ok(Math.abs(p.off - 5) < 0.01, "5 m in front of the garages");
  assert.ok(r.group.getObjectByName("garageInteriors"));
});

test("pit inference: a team's box needs agreeing working stops; a queue, a breakdown, a hole in the data or one stop isn't enough", async () => {
  const G = await import("../src/renderer/garages.js");
  const D = { 1: { TeamName: "A", TeamColour: "ff0000" }, 2: { TeamName: "A" }, 3: { TeamName: "B", TeamColour: "0000ff" }, 4: { TeamName: "B" }, 5: { TeamName: "C" }, 6: { TeamName: "C" } };
  const st = (u, dur, t) => ({ u, dur, t });
  const ev = G.teamEvidence({
    1: { stops: [st(-76, 2500, 1)], long: [] }, 2: { stops: [st(-76.8, 3100, 2)], long: [] },          // A: two working stops agree
    3: { stops: [st(20, 9000, 3)], long: [] }, 4: { stops: [st(20.5, 1200, 4)], long: [] },           // B: too long (breakdown) / too short (queue)
    5: { stops: [st(60, 2700, 5)], long: [] },                                                          // C: one stop only
  }, D);
  const by = Object.fromEntries(ev.map((e) => [e.team, e]));
  assert.strictEqual(by.A.ok, true); assert.ok(Math.abs(by.A.u + 76.4) < 0.5);
  assert.strictEqual(by.B.ok, false); assert.strictEqual(by.C.ok, false); assert.match(by.C.reason, /one stop/);
  // two teams whose boxes come out within 5 m: neither trusted
  const clash = G.teamEvidence({ 1: { stops: [st(10, 2500, 1), st(10.5, 2600, 2)], long: [] }, 3: { stops: [st(13, 2500, 3), st(13.4, 2500, 4)], long: [] } }, D);
  assert.ok(clash.every((e) => !e.ok));
  // practice: repeated long stays of one driver are not enough; both drivers of the team close together are
  const L = (u, n) => Array.from({ length: n }, (_, i) => st(u + i * 0.3, 60000, i));
  const one = G.teamEvidence({ 1: { stops: [], long: L(40, 4) } }, D);
  assert.strictEqual(one[0].ok, false);
  const both = G.teamEvidence({ 1: { stops: [], long: L(40, 3) }, 2: { stops: [], long: L(48, 3) } }, D, 8.4);
  assert.strictEqual(both[0].ok, true); assert.strictEqual(both[0].from, "garage");
});

test("pit inference: a standstill across a hole in the position data isn't one; a replay counts only what has happened", async () => {
  const G = await import("../src/renderer/garages.js");
  const car = (pts) => ({ t: pts.map((p) => p[0]), x: pts.map((p) => p[1] * 10), y: pts.map((p) => p[2] * 10), n: pts.length });
  const project = (x, z) => ({ u: x, off: -z });
  const gap = car([[1000, 50, 5], [1300, 50, 5], [4800, 50, 5], [5000, 70, 5]]);           // 3.5 s without samples
  const ok = car([[700, 30, 5], [1000, 50, 5], [1500, 50, 5], [2500, 50, 5], [3600, 50, 5], [3800, 70, 5]]);
  const r = G.standstills({ 1: gap, 2: ok }, ([X, Y]) => [X, -Y], project, [0, 300]);
  assert.strictEqual(r[1], undefined); assert.strictEqual(r[2].stops.length, 1);
  assert.strictEqual(G.standstills({ 2: ok }, ([X, Y]) => [X, -Y], project, [0, 300], null, 2000)[2], undefined, "the stop hasn't happened yet at 2 s");
});

test("pit inference: places stay put with small changes, move only on trusted evidence a garage away; key ignores small moves", async () => {
  const G = await import("../src/renderer/garages.js");
  const D = { 1: { TeamName: "A", TeamColour: "ff0000", Tla: "AAA" }, 2: { TeamName: "A", Tla: "BBB" } };
  const inf = new G.PitInference();
  // (live: looks merged as they come – a replay instead shows exactly what's known at the moment, garages.test.js)
  const S = (us, t0 = 0) => ({ 1: { stops: us.map((u, i) => ({ u, dur: 2500, t: t0 + i * 1e5 })), long: [] } });
  inf.observe(S([-76, -76.5]), true); let r = inf.update(D, 8.4);
  const slots = Array.from({ length: 40 }, (_, k) => ({ k, uc: -170 + k * 8.4 + 4.2 }));
  const k1 = G.allocationKey(G.allocatePlaces(slots, 8.4, D, r.places));
  inf.observe(S([-75.4], 2e5), true); r = inf.update(D, 8.4);
  assert.strictEqual(G.allocationKey(G.allocatePlaces(slots, 8.4, D, r.places)), k1, "a stop 1 m off: nothing moves");
  assert.ok(Math.abs(r.places[0].u + 76.25) < 0.01, "the place itself stays where first trusted");
  inf.reset(); inf.observe(S([-76, -76.5, -75.4]), true); inf.update(D, 8.4);
  inf.observe(S([-40, -40.3, -39.8, -40.1], 1e6), true); r = inf.update(D, 8.4);
  assert.ok(Math.abs(r.places[0].u + 40) < 0.5, "three agreeing stops 36 m away: moved");
  const a = G.allocatePlaces(slots, 8.4, D, r.places);
  assert.strictEqual(a[0].link, "inferred"); assert.ok(Math.abs(a[0].box - r.places[0].u) <= 0.25, "the box drawn at the place (to 0.5 m)");
  assert.deepStrictEqual(a[0].drivers.map((d) => d.tla), ["AAA", "BBB"], "the team's drivers from the session's list");
});

test("pit wall at the track's edge; the estimated paddock only for its year and with the trial setting on", async () => {
  const F = await load();
  const scene = { location: "T", buildings: [{ name: "Pits", kind: "block", cls: "yes", est: 1, pts: rect(-150, 0, 150, 30), min: 0, h: 8 }] };
  const spec = { id: "w", loc: ["T"], status: "permanent", checked: "t", replaces: { names: /^Pits$/ }, builder: "pitBuilding",
    params: { garages: 30, height: 12, plate: 0.8, overhang: { pit: 2, paddock: 1, end: 1 }, facade: { pit: "pitGlass", paddock: "paddockPanels" },
      pitWall: { height: 1.1, thick: 0.5, fence: 3, walk: 8, deck: 1 }, paddock: { years: [2026, 2026], margin: 6, street: 20, awning: { d: 4, h: 3.6 }, unit: { w: 18, d: 14, h: 8.5, gap: 4 } } } };
  // the track's edge 30 m out from the garages (scene z = −60: the building's pit side is z = −30)
  const trackEdge = (x, z) => z + 60;   // metres to the edge, negative past it
  const run = (year, trial) => F.buildFacilities({ scene, gf, groundAt: () => 0, trackEdge, location: "T", year, trial, toTrack: () => [0, -1], alongTrack: () => [1, 0], registry: [spec] });
  const r = await run(2026, true);
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const wall = new THREE.Box3().setFromObject(r.group.getObjectByName("pitWall"));
  assert.ok(wall.min.z > -60.6 && wall.min.z < -59.4, `wall at the edge (z ${wall.min.z.toFixed(2)})`);
  assert.ok(r.group.children[0].userData.garages.wallAt(0), "stands have a place on the walkway");
  assert.strictEqual(r.info[0].paddock.units > 0, true);
  assert.strictEqual((await run(2025, true)).info[0].paddock, null, "not seen that year");
  assert.strictEqual((await run(2026, false)).info[0].paddock, null, "an estimate: trial setting off, no paddock");
});
