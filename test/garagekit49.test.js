// The garage interior kit (v0.49, src/renderer/garagekit/*): the zone contract (a bad zone refused, not clamped), what
// is placed fits the bay and leaves the car's work area clear, narrow / shallow bays drop modules with a reason instead
// of pushing them through walls, a team's room is the same every time and two teams' rooms differ in more than colour,
// detail levels cost less as they go, and building or freeing a team's bay never touches the shared materials.
const test = require("node:test");
const assert = require("node:assert");

const kit = () => import("../src/renderer/garagekit/index.js");
const TEAMS = ["McLaren", "Ferrari", "Red Bull Racing", "Mercedes", "Aston Martin", "Alpine", "Williams", "Racing Bulls", "Kick Sauber", "Haas F1 Team"];

test("garage kit: a zone of zero / negative size or without a direction is refused with a reason", async () => {
  const K = await kit();
  for (const z of [null, { width: 0, depth: 10 }, { width: 8, depth: -1 }, { width: 8, depth: 10, ceilingH: 0 }, { width: 8, depth: 10, inward: [0, 0] }, { width: NaN, depth: 10 }]) {
    const n = K.normZone(z); assert.ok(n.error, JSON.stringify(z));
    assert.ok(K.planBay(z).error);
  }
  const lib = K.createKitLibrary();
  assert.throws(() => K.buildBayInterior({ width: -0.45, depth: 9 }, K.teamGarageStyle("Kick Sauber", "#52e252"), { lib }), /bad size/);
  lib.dispose();
});

test("garage kit: the bay frame – door line at z = 0, inward along +z, a right-handed basis whatever 'along' says", async () => {
  const K = await kit();
  const n = K.normZone({ width: 8, depth: 12, ceilingH: 4.6, floorY: 2, centre: [10, 20], inward: [0, -1], along: [1, 0] });
  assert.deepStrictEqual(n.door, [10, 26]);                          // centre − inward × depth/2
  assert.deepStrictEqual(K.toWorld(n, [0, 0, 12]), [10, 2, 14]);    // the back wall's middle
  // x = up × inward: for inward (0, −1) that is (−1, 0); the caller's along (1, 0) is the other way → mirrored
  assert.deepStrictEqual(n.x.map((v) => v + 0), [-1, 0]); assert.strictEqual(n.mirrored, true);
  const m = K.frameMatrix(n), det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
  assert.ok(Math.abs(det - 1) < 1e-9, "a rotation, not a mirror");
  // front (the door line's middle) given: used as is
  assert.deepStrictEqual(K.normZone({ width: 8, depth: 12, front: [1, 2], inward: [1, 0] }).door, [1, 2]);
});

test("garage kit: every team's plan in bays from Monaco-narrow to roomy keeps inside the bay and off the car's work area", async () => {
  const K = await kit();
  const sizes = [[4.6, 9, 4.25], [5.4, 10, 4.6], [7.98, 11, 4.6], [8.4, 12, 4.9], [12, 15, 5.2], [7.98, 4, 4.6]];
  for (const t of TEAMS) for (const [w, d, h] of sizes) {
    const p = K.planBay({ width: w, depth: d, ceilingH: h, centre: [0, 0], inward: [0, 1] }, K.teamGarageStyle(t, "#888888"));
    assert.deepStrictEqual(K.planClashes(p), [], `${t} ${w}×${d}`);
    for (const it of p.items) assert.ok(it.h <= h, `${it.kind} under the ceiling`);
    if (p.overhead) assert.ok(p.overhead.y0 >= 2.3 && p.overhead.y1 <= h, "the boom above head height, under the ceiling");
  }
  // the 4 m deep bay (v0.48's circuit garages): the car doesn't fit – said, not hidden; nothing goes where it would be
  const shallow = K.planBay({ width: 7.98, depth: 4, ceilingH: 4.6, centre: [0, 0], inward: [0, 1] }, K.teamGarageStyle("McLaren", "#ff8000"));
  assert.strictEqual(shallow.car.fits, false); assert.ok(shallow.dropped.some((d) => d.kind === "car" && /smaller than the car/.test(d.why)));
  assert.strictEqual(shallow.overhead, null);
  // Monaco-narrow: the side strips too narrow for cabinets – dropped with the strip's width as the reason
  const narrow = K.planBay({ width: 4.6, depth: 9, ceilingH: 4.25, centre: [0, 0], inward: [0, 1] }, K.teamGarageStyle("Ferrari", "#e8002d"));
  assert.ok(narrow.car.fits);
  assert.ok(narrow.dropped.some((d) => /strip|deep/.test(d.why)));
  // the car's real bounds size the work area (a 2026 car is shorter than a 2025 one)
  const a = K.planBay({ width: 8, depth: 9, centre: [0, 0], inward: [0, 1] }, {}, { car: { length: 5.68, width: 2.03, height: 1.03 } });
  const b = K.planBay({ width: 8, depth: 9, centre: [0, 0], inward: [0, 1] }, {}, { car: { length: 5.47, width: 1.91, height: 1.15 } });
  assert.ok(b.area.z1 < a.area.z1 && b.area.x1 < a.area.x1);
});

test("garage kit: a team's room is the same every time; teams differ in layout and choices, not only colour", async () => {
  const K = await kit();
  const zone = { width: 8.4, depth: 12, ceilingH: 4.9, centre: [0, 0], inward: [0, 1] };
  const sig = (t) => { const s = K.teamGarageStyle(t, "#123456"), p = K.planBay(zone, s); return JSON.stringify([p.items.map((i) => [i.kind, i.side, +i.x.toFixed(2), +i.z.toFixed(2)]), s.floor, s.lights, s.boom, s.drawer, s.bench, s.wall.base, s.wall.band]); };
  for (const t of TEAMS) assert.strictEqual(sig(t), sig(t), t);
  const all = new Set(TEAMS.map(sig));
  assert.strictEqual(all.size, TEAMS.length, "no two teams' rooms the same");
  // and the item lists alone (colour aside) differ for most pairs
  const lists = TEAMS.map((t) => JSON.stringify(K.planBay(zone, K.teamGarageStyle(t, "#123456")).items.map((i) => [i.kind, i.side])));
  assert.ok(new Set(lists).size >= TEAMS.length - 2, `distinct layouts: ${new Set(lists).size}/${TEAMS.length}`);
  // the colour doesn't change the layout (a team's colour change between seasons keeps its room)
  assert.strictEqual(JSON.stringify(K.planBay(zone, K.teamGarageStyle("Alpine", "#0093cc")).items), JSON.stringify(K.planBay(zone, K.teamGarageStyle("Alpine", "#ff87bc")).items));
});

test("garage kit: the built bay sits inside its zone in the world, lower detail levels cost fewer triangles", async () => {
  const K = await kit(), THREE = await import("../src/renderer/vendor/three.module.js");
  const lib = K.createKitLibrary(), st = K.teamGarageStyle("Williams", "#64c4ff");
  const zone = { width: 8.4, depth: 12, ceilingH: 4.9, floorY: 1.5, centre: [30, -12], inward: [Math.SQRT1_2, Math.SQRT1_2], kind: "car" };
  const tri = [];
  for (const lod of [0, 1, 2]) {
    const g = K.buildBayInterior(zone, st, { lib, lod, shell: true });
    tri.push(g.userData.stats.triangles);
    // every vertex inside the zone's box (in the bay frame: the group's inverse)
    g.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), v = new THREE.Vector3();
    let out = 0;
    g.traverse((o) => { if (!o.isMesh) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i += 7) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv); if (v.x < -4.2 - 1e-3 || v.x > 4.2 + 1e-3 || v.z < -1e-3 || v.z > 12 + 1e-3 || v.y < -1e-3 || v.y > 4.9 + 1e-3) out++; } });
    assert.strictEqual(out, 0, `lod ${lod}: vertices outside the zone`);
    assert.ok(Math.abs(g.position.y - 1.5) < 1e-9, "on the zone's floor");
    assert.ok(g.userData.stats.draws <= 30, `draws ${g.userData.stats.draws}`);
  }
  assert.ok(tri[0] > tri[1] && tri[1] > tri[2] * 2, JSON.stringify(tri));
  lib.dispose();
});

test("garage kit: a team's bay owns its own materials – building and freeing it never changes or frees a shared one", async () => {
  const K = await kit(), { disposeGroup } = await import("../src/renderer/dispose.js");
  const lib = K.createKitLibrary();
  const snap = () => JSON.stringify(Object.entries(lib.M).map(([k, m]) => [k, m.color?.getHexString(), m.roughness, m.metalness, m.opacity]));
  const before = snap(), freed = [];
  for (const m of Object.values(lib.M)) m.addEventListener("dispose", () => freed.push(m));
  const a = K.buildBayInterior({ width: 8, depth: 11, ceilingH: 4.6, centre: [0, 0], inward: [0, 1] }, K.teamGarageStyle("McLaren", "#ff8000"), { lib, shell: true });
  const b = K.buildBayInterior({ width: 8, depth: 11, ceilingH: 4.6, centre: [9, 0], inward: [0, 1] }, K.teamGarageStyle("Ferrari", "#e8002d"), { lib, shell: true });
  const accent = (g) => g.children.find((m) => m.name === "bay:accent")?.material;
  assert.notStrictEqual(accent(a), accent(b));
  assert.strictEqual(accent(a).color.getHexString(), "ff8000"); assert.strictEqual(accent(b).color.getHexString(), "e8002d");
  assert.ok(!Object.values(lib.M).includes(accent(a)));
  disposeGroup(a); disposeGroup(b);
  assert.strictEqual(snap(), before); assert.deepStrictEqual(freed, []);
  // the shared module pieces are still there for the next bay
  const c = K.buildBayInterior({ width: 8, depth: 11, ceilingH: 4.6, centre: [0, 0], inward: [0, 1] }, K.teamGarageStyle("McLaren", "#ff8000"), { lib, lod: 1 });
  assert.ok(c.userData.stats.triangles > 0);
  lib.dispose();
});

test("garage kit: lights – one shadow at most per rig, none in 'none' mode, the second bay's rig without key or bounce", async () => {
  const K = await kit();
  const n = K.normZone({ width: 8.4, depth: 12, ceilingH: 4.9, centre: [0, 6], inward: [0, 1] });
  const fx = [{ kind: "boom", x: 0, y: 4.3, z: 4, len: 3 }, { kind: "ceiling", x: -2, y: 4.6, z: 6, len: 9, along: "z" }, { kind: "ceiling", x: 2, y: 4.6, z: 6, len: 9, along: "z" }];
  const full = K.buildLightRig(n, fx, [0, 0.5, 5.5]);
  assert.strictEqual(full.lights.filter((l) => l.castShadow).length, 1);
  assert.ok(full.lights.filter((l) => !l.isHemisphereLight).length <= 4);
  assert.strictEqual(K.buildLightRig(n, fx, null, { mode: "none" }).lights.length, 0);
  const noShadow = K.buildLightRig(n, fx, null, { shadow: false });
  assert.strictEqual(noShadow.lights.filter((l) => l.castShadow).length, 0);
  const second = K.buildLightRig(n, fx, null, { key: false, hemi: false, door: false, shadow: false });
  assert.ok(second.lights.every((l) => l.isSpotLight && !l.castShadow) && second.lights.length === 2);
  assert.strictEqual(K.buildLightRig(n, fx, [0, 0.5, 5], { key: false, sides: 1, hemi: false, door: false, shadow: false }).lights.length, 1);
});

test("menu garage: the car framed between the menu column and the driver cards; margins capped so the car keeps a fifth", async () => {
  const M = await import("../src/renderer/game/menugarage.js");
  // centred in the free middle: left 30 % → the picture slides right by 15 %; equal margins → no slide, zoomed out
  assert.deepStrictEqual(M.frameOf(0.3, 0), { shift: 0.15, zoom: 1 });
  const both = M.frameOf(0.2, 0.2); assert.strictEqual(both.shift, 0); assert.ok(both.zoom < 1 && both.zoom > 0.8);
  assert.ok(M.frameOf(0.1, 0.3).shift < 0, "a wider right column moves the car left");
  assert.deepStrictEqual(M.setSafe(0.6, 0.6, false), { left: 0.4, right: 0.4 });
  assert.deepStrictEqual(M.setSafe(-1, "x", false), { left: 0, right: 0 });
  assert.strictEqual(M.setSafeLeft(0.25), 0.25);
  // no DOM: show() refuses instead of throwing
  assert.deepStrictEqual(await M.show({ season: 2025 }), { error: "no DOM" });
});

test("garage kit in the garage helper's zones: garageZones → plan → its checkCar finds no kit box in any car (9.63 m race bays, a split narrow bay, a shallow one)", async () => {
  const K = await kit(), GZ = await import("../src/renderer/garages.js"), GC = await import("../src/renderer/garagecheck.js"), { CAR_ENVELOPE: E } = await import("../src/renderer/carbounds.js");
  const slot = (k, uc, width, depth, along = [1, 0], inward = [0, 1]) => ({ k, u0: uc - width / 2, u1: uc + width / 2, uc, front: [uc * along[0], uc * along[1]], along, inward, width, height: 4.25, ceil: 4.6, depth, back: 3, floor: 0.2, depthFrom: "facility" });
  const G = { slots: [slot(0, 0, 7.98, 9.63), slot(1, 8.5, 7.98, 9.63), slot(2, 17, 7.98, 9.63), slot(3, 26, 7.6, 9.63), slot(4, 34, 7.98, 6.2), slot(5, 42, 5.2, 9.63, [-1, 0], [0, -1])] };
  const teams = [{ team: "McLaren", slots: [0, 1, 2], spaces: [{ slot: 0, num: "4", w: 0 }, { slot: 2, num: "81", w: 0 }] },
    { team: "Haas F1 Team", slots: [3], spaces: [{ slot: 3, num: "31", w: -1.9 }, { slot: 3, num: "87", w: 1.9 }] },
    { team: "Williams", slots: [4, 5], spaces: [{ slot: 4, num: "23", w: 0 }, { slot: 5, num: "55", w: 0 }] }];
  const zones = GZ.garageZones(G, teams);
  let cars = 0;
  for (const z of zones) {
    const n = K.normZone(z);
    if (z.kind === "box") { assert.ok(n.error); continue; }
    const p = K.planBay(z, K.teamGarageStyle(z.team || "-", "#777777")), boxes = K.planBoxes(p, z), s = G.slots[z.slot];
    assert.deepStrictEqual(K.planClashes(p), [], `${z.team} ${z.kind} ${z.slot}`);
    // every kit box inside its bay (side walls and the race bay's back) and under the ceiling
    for (const b of boxes) assert.ok(b.min[0] >= -s.width / 2 - 1e-6 && b.max[0] <= s.width / 2 + 1e-6 && b.min[1] >= 0.6 - 1e-6 && b.max[1] <= s.depth + 1e-6 && b.max[2] <= s.ceil + 1e-6, `${b.name} in bay ${z.slot}: ${JSON.stringify(b)}`);
    if (z.kind !== "car") continue;
    // the kit's car place is the garage helper's car spot
    if (p.car.fits) assert.ok(Math.abs(p.car.z0 + E.front - z.carSpot.d) < 1e-9);
    const car = GC.carBox(z.w, z.carSpot.d, 0, E, "out"), r = GC.checkCar(s, car, boxes);
    assert.deepStrictEqual(r.hits.filter((h) => h.with.startsWith("kit")), [], `${z.team} #${z.num}: ${JSON.stringify(r.hits)}`);
    cars++;
  }
  assert.strictEqual(cars, 6);
  // the merge helper: the same zones built at a level per zone (far ones skipped), its own check on every car spot
  const lib = K.createKitLibrary();
  const B = K.buildTeamBays(zones, G, { lib, colourOf: (t) => ({ McLaren: "#ff8000", Williams: "#64c4ff" }[t] || "#b6babd"), lodOf: (z) => (z.team === "McLaren" ? 0 : z.team ? 2 : null) });
  assert.strictEqual(B.bays.length, zones.filter((z) => z.kind !== "box" && z.team).length);
  assert.ok(B.report.filter((r) => r.kind === "car").every((r) => r.hits.length === 0 && (r.headroom == null || r.headroom > 1)), JSON.stringify(B.report));
  assert.ok(B.report.every((r) => (r.team === "McLaren" ? r.lod === 0 : r.lod === 2)));
  lib.dispose();
});
