// v0.49 garages a car fits in: the car models' own size (carbounds.js), each bay's depth from the building behind it
// (facilities.js + garagespace.js), no garage without room between its pillars (pitlane.js unfoldPath, facilities.js),
// the zones – bays, drivers' work spaces, engineering, the one pit box – (garages.js garageZones), where a car stands in
// its garage and how it gets there (pitstate.js garagePath), and the fit check (garagecheck.js).
const test = require("node:test");
const assert = require("node:assert");

const gf = { xz: ([X, Y]) => [X, -Y], fromLL: (lat, lon) => [(lon + 1) * 68500, -(lat - 52) * 111320], toLL: (x, z) => [52 - z / 111320, -1 + x / 68500] };
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const spec = (over = {}) => ({ id: "g", kind: "pit-building", loc: ["T"], status: "trial", replaces: { names: /^Pits/ }, builder: "pitBuilding",
  params: { garages: 20, height: 12, plate: 0.8, overhang: { pit: 2, paddock: 1, end: 1 }, facade: { pit: "pitGlass", paddock: "paddockPanels" }, ...over } });
async function build(buildings, opts = {}) {
  const F = await import("../src/renderer/facilities.js");
  const scene = { location: "T", buildings: buildings.map((pts, i) => ({ name: "Pits " + i, kind: "block", cls: "yes", est: 1, pts, min: 0, h: 8 })) };
  const r = await F.buildFacilities({ scene, gf, groundAt: () => 10, surfaceAt: () => 10.3, location: "T", toTrack: () => [0, -1], alongTrack: () => [1, 0], registry: [spec()], ...opts });
  return r.group.children[0].userData.garages;
}

test("car size: measured from the model – the contact shadow and the label left out; each season's car its own size", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js"), B = await import("../src/renderer/carbounds.js");
  const car = C.makeCar({ teamName: "McLaren", teamColour: "FF8000", number: 4, season: 2025 }), e0 = B.carExtents(car);
  // what map3d.js carFor adds: a 2.4 × 5.8 m shadow plane, a label sprite over it
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5.8), new THREE.MeshBasicMaterial()); sh.rotation.x = -Math.PI / 2; sh.name = "contactShadow"; car.add(sh);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial()); sp.position.y = 3; sp.scale.set(4, 1, 1); car.add(sp);
  car.rotation.y = 1.1; car.position.set(100, 5, -40);
  const e1 = B.carExtents(car);
  assert.deepStrictEqual([e1.length, e1.width, e1.height], [e0.length, e0.width, e0.height], "the shadow, the label, where it stands and which way it faces don't change its size");
  assert.ok(Math.abs(e1.ground) < 0.005, "its wheels on its ground");
  assert.ok(e1.width < 2.02 && e1.width > 1.98 && e1.length > 5.5 && e1.length < 5.8, `2025 car ${e1.length} × ${e1.width}`);
  const c26 = B.carExtents(C.makeCar({ teamName: "McLaren", teamColour: "FF8000", number: 4, season: 2026 }));
  assert.ok(c26.width < e1.width - 0.05 && c26.length < e1.length - 0.1, "2026's car is narrower and shorter (1.9 m, 3.4 m wheelbase)");
  assert.ok(Math.abs(c26.wheels.base - 3.4) < 1e-6 && Math.abs(e1.wheels.base - 3.6) < 1e-6, "wheelbases");
  // the garages' envelope holds every model the app draws (a long-nosed 2025 shape is the longest)
  for (const [season, team] of [[2024, "Williams"], [2025, "Williams"], [2025, "Haas F1 Team"], [2025, "Racing Bulls"], [2026, "Red Bull Racing"], [2026, "Haas F1 Team"]]) {
    const e = B.carExtents(C.makeCar({ teamName: team, teamColour: "888888", number: 1, season }));
    for (const k of ["length", "width", "height", "front", "back"]) assert.ok(e[k] <= B.CAR_ENVELOPE[k] + 1e-9, `${season} ${team} ${k} ${e[k]} > envelope ${B.CAR_ENVELOPE[k]}`);
  }
});

test("garage space: the race bay a car needs, the back area only where the building leaves room, a spot never through the back wall", async () => {
  const S = await import("../src/renderer/garagespace.js"), { CAR_ENVELOPE: E } = await import("../src/renderer/carbounds.js");
  const want = S.raceBayDepth();
  assert.ok(want > E.length + 3 && want < E.length + 5, `race bay ${want}`);
  const deep = S.bayDepths(29);
  assert.ok(deep.fits && Math.abs(deep.depth - want) < 1e-9 && deep.back > 18, "a 29 m building: the race bay and a back area behind its partition");
  const mid = S.bayDepths(want + 1.5);
  assert.ok(mid.back === 0 && mid.depth > want, "too little behind for a back area: the race bay keeps it");
  const shallow = S.bayDepths(6);
  assert.ok(!shallow.fits && Math.abs(shallow.depth - (6 - S.GARAGE_SPACE.wall)) < 1e-9, "6 m: as deep as the building allows, not deeper");
  for (const depth of [4, 6, 7.5, 8.5, want, 14]) {
    const c = S.carSpotDepth(depth);
    assert.ok(c.d + E.back <= depth - 0.2 + 1e-9 || depth < 0.2 + E.back, `${depth} m: the tail stays off the back wall`);
    if (c.fits) assert.ok(c.d - E.front >= S.GARAGE_SPACE.door - 1e-9, `${depth} m: a fitting car's nose stays behind the door line`);
    else assert.ok(Number.isFinite(c.out) && /doesn't fit/.test(c.why), `${depth} m: said it doesn't fit`);
  }
  assert.ok(S.carSpotDepth(want).fits && S.carSpotDepth(4).fits === false);
});

test("pit path: fold-backs taken out – equal garages along the lane, not along the data's steps back", async () => {
  const { unfoldPath, pathFrame } = await import("../src/renderer/pitlane.js");
  // a straight lane every 4 m, a step on 1.6 m, back 4 m, on again (Hungaroring 2025's at 590 m)
  const pts = []; for (let x = 0; x <= 80; x += 4) pts.push([x, 0]);
  pts.push([81.6, 0], [77.6, 0], [77.5, 0.1], [81.6, 0]); for (let x = 85.6; x <= 140; x += 4) pts.push([x, 0]);
  const raw = pathFrame(pts), U = unfoldPath(pts);
  assert.strictEqual(U.folds.length, 1);
  assert.ok(raw.len - U.frame.len > 8 && raw.len - U.frame.len < 9.5, `${(raw.len - U.frame.len).toFixed(2)} m of fold`);
  for (let u = 0; u < raw.len; u += 1.3) assert.ok(U.toU(u + 1.3) >= U.toU(u) - 1e-9, "toU never goes back");
  // a place past the fold is the same place on both
  const u = 120, a = raw.at(u), b = U.frame.at(U.toU(u)); assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-6);
  // 8 m bays on the unfolded path have 8 m between their ends; on the raw one the bay over the fold collapses
  const len = (fr, u0) => fr.at(u0 + 8).x - fr.at(u0).x;
  assert.ok(Math.min(...[72, 80, 88].map((u0) => len(U.frame, u0))) > 7.99);
  assert.ok(len(raw, 80) < 1, "raw: the bay on the fold is under a metre long");
  // a path without folds is itself
  const straight = [[0, 0], [10, 0], [20, 1], [30, 1]], S2 = unfoldPath(straight); assert.strictEqual(S2.pts, straight); assert.strictEqual(S2.toU(7), 7);
});

test("pit builder: each bay as deep as the building behind it (never past its back), a bay with no room between its pillars not built", async () => {
  // the building 30 m deep on the left half, 10 m in the middle, 6 m on the right (F1 metres; the pit side at y = 30)
  const G = await build([rect(-150, 0, -50, 30), rect(-50, 20, 50, 30), rect(50, 24, 150, 30)]);
  const at = (x) => G.slots.reduce((p, q) => (Math.abs(q.uc - x) < Math.abs(p.uc - x) ? q : p));
  const S = await import("../src/renderer/garagespace.js");
  const L = at(-100), M = at(0), R = at(100);
  assert.ok(Math.abs(L.depth - S.raceBayDepth()) < 1e-6 && L.back > 15 && Math.abs(L.building - 30) < 0.1, `30 m: race bay ${L.depth}, back ${L.back}`);
  assert.ok(Math.abs(M.depth - 9.7) < 0.05 && M.back === 0, `10 m: ${M.depth}`);
  assert.ok(Math.abs(R.depth - 5.7) < 0.05, `6 m: ${R.depth}`);
  for (const s of G.slots) assert.ok(s.depth + s.back <= s.building - S.GARAGE_SPACE.wall + 1e-6, `bay ${s.k}: inside the building`);
  assert.ok(G.slots.every((s) => s.depthFrom === "map footprint"));
  // (v0.48: one depth for all – 0.45 of the narrowest section, at least 4 m)
  assert.ok(new Set(G.slots.map((s) => s.depth.toFixed(1))).size >= 3);
  // the FIA drawing's bays: 10 m each, one of them with both ends at one point (a fold in the measured path)
  const list = []; for (let i = 0; i < 20; i++) list.push({ a: [-100 + i * 10, -40], b: [-90 + i * 10, -40], bay: { n: list.length + 1, label: "X" } });
  list.splice(10, 0, { a: [0, -40], b: [0.05, -40], bay: { n: 99, label: "SAU" } });
  const G2 = await build([rect(-150, 0, 150, 30)], { bays: { list, src: "t", meta: { src: "t" } } });
  assert.ok(G2.slots.every((s) => s.width > 0.5), "no bay without room between its pillars");
  assert.deepStrictEqual(G2.plan.blocked.map((b) => [b.n, b.label]), [[99, "SAU"]]);
  assert.ok(Math.max(...G2.slots.map((s) => s.width)) < 9.6 && G2.slots.filter((s) => s.bay).length === 20, "the others as drawn");
});

test("zones: the building's bays, one work space per driver, engineering bays, one shared pit box; the car's spot in its own space", async () => {
  const Z = await import("../src/renderer/garages.js"), { CAR_ENVELOPE: E } = await import("../src/renderer/carbounds.js");
  const mk = (k, uc, width, depth) => ({ k, uc, u0: uc - width / 2 - 0.25, u1: uc + width / 2 + 0.25, front: [uc, 0], along: [1, 0], inward: [0, 1], width, height: 4.25, ceil: 4.6, depth, back: 0, floor: 2, depthFrom: "map footprint" });
  // three 8 m bays 9.63 m deep (a team of two) and three 4.6 m Monaco-like ones only 6 m deep
  const G = { slots: [mk(0, 0, 8, 9.63), mk(1, 8.5, 8, 9.63), mk(2, 17, 8, 9.63), mk(3, 40, 4.6, 6), mk(4, 45, 4.6, 6), mk(5, 50, 4.6, 6)] };
  const drivers = { 4: { TeamName: "McLaren", Tla: "NOR" }, 81: { TeamName: "McLaren", Tla: "PIA" }, 16: { TeamName: "Ferrari", Tla: "LEC" }, 44: { TeamName: "Ferrari", Tla: "HAM" } };
  const teams = Z.allocatePlaces(G.slots, 8.5, drivers, [], [{ team: "McLaren", slots: [0, 1, 2] }, { team: "Ferrari", slots: [3, 4, 5] }]);
  teams[0].box = 8.5; teams[0].boxOff = 4;
  const zs = Z.garageZones(G, teams), car = zs.filter((z) => z.kind === "car"), eng = zs.filter((z) => z.kind === "eng"), box = zs.filter((z) => z.kind === "box");
  assert.deepStrictEqual(car.map((z) => [z.team, z.num, z.slot]).sort(), [["Ferrari", "16", 3], ["Ferrari", "44", 5], ["McLaren", "4", 0], ["McLaren", "81", 2]]);
  assert.deepStrictEqual(eng.map((z) => z.slot).sort(), [1, 4], "the middle bays: engineering – no car");
  assert.strictEqual(box.length, 1, "one box for the team, both drivers'"); assert.ok(box[0].box.off === 4 && box[0].centre[1] === -4);
  const mcl = car.find((z) => z.num === "4"), cs = mcl.carSpot;
  assert.ok(cs.fits && Math.abs(cs.x - 0) < 1e-9 && cs.z > E.front && cs.z + E.back < 9.63, "in its bay's middle, nose to the door, tail off the back");
  assert.ok(Math.abs(Math.sin(cs.yaw)) < 1e-9 && Math.cos(cs.yaw) < -0.999, "facing out to the pit lane (−inward)");
  assert.ok(Math.abs(cs.y - 2.017) < 1e-9, "on the garage's floor");
  assert.ok(mcl.walk[0] > 2.9 && mcl.doorW === 8 && mcl.lowest > E.height + 2);
  const lec = car.find((z) => z.num === "16");
  assert.ok(!lec.carSpot.fits && /doesn't fit/.test(lec.carSpot.why), "6 m deep: said it doesn't fit");
  assert.ok(lec.carSpot.z + E.back <= 6 - 0.2 + 1e-9, "…and its tail still not through the back wall");
  // a narrow bay shared by two drivers: two half-width spaces, too narrow for a car each
  const t2 = Z.allocatePlaces([mk(0, 0, 3.6, 9.63)], 4, { 1: { TeamName: "A" }, 2: { TeamName: "A" } }, [], [{ team: "A", slots: [0] }]);
  const z2 = Z.garageZones({ slots: [mk(0, 0, 3.6, 9.63)] }, t2).filter((z) => z.kind === "car");
  assert.strictEqual(z2.length, 2); assert.ok(z2.every((z) => z.width === 1.8 && !z.carSpot.fits));
  // no teams: the bays alone
  assert.deepStrictEqual(Z.garageZones(G).map((z) => z.kind), ["bay", "bay", "bay", "bay", "bay", "bay"]);
});

test("into the garage: along the inner lane to its own door turning to face out, then tail first straight in – never sideways through a front", async () => {
  const { garagePath } = await import("../src/renderer/pitstate.js");
  const from = { u: 30, off: 8 }, to = { u: 12, off: -4.5 }, lane = 6;
  const p0 = garagePath(0, from, to, lane), p5 = garagePath(0.5, from, to, lane), p1 = garagePath(1, from, to, lane);
  assert.deepStrictEqual([p0.u, p0.off, p0.turn], [30, 8, 0]);
  assert.ok(Math.abs(p5.u - 12) < 1e-9 && Math.abs(p5.off - lane) < 1e-9 && p5.turn === 1, "half way: in front of its door, facing out");
  assert.ok(Math.abs(p1.u - 12) < 1e-9 && Math.abs(p1.off + 4.5) < 1e-9);
  // (while it crosses the garages' front – off 0 – it is already in front of its own door and turned)
  for (let w = 0; w <= 1; w += 0.01) { const p = garagePath(w, from, to, lane); if (p.off < 0.5) assert.ok(Math.abs(p.u - 12) < 1e-9 && p.turn === 1, `w ${w.toFixed(2)}`); }
});

test("garage check: a car at its spot clear of pillars, walls and the back; in a 4 m bay it hits the back wall", async () => {
  const K = await import("../src/renderer/garagecheck.js"), S = await import("../src/renderer/garagespace.js");
  const bay = (depth, width = 8) => ({ front: [0, 0], along: [1, 0], inward: [0, 1], width, height: 4.25, ceil: 4.6, depth, back: 0, floor: 0 });
  const s = bay(S.raceBayDepth()), cs = S.carSpotDepth(s.depth), car = K.carBox(0, cs.d);
  const r = K.checkCar(s, car, [], { lowest: 4.6 - 0.62 });
  assert.ok(r.ok, JSON.stringify(r.hits)); assert.ok(r.room.front >= 0.6 + 0.8 - 1e-6 && r.room.back > 2 && r.room.sideMinus > 2.9 && r.headroom > 2.5);
  // v0.48's 4 m bay: the car through its back wall
  const s4 = bay(4), r4 = K.checkCar(s4, K.carBox(0, 2.5 + 2.66 - 2.66 + 0.4), []);
  assert.ok(r4.hits.some((h) => h.with === "back wall"));
  // v0.48's retired car: turned along the lane (5.7 m across a 4.6 m opening) – into both pillars
  const sm = bay(9.63, 4.6), side = { name: "car", min: [-2.85, 1.5, 0], max: [2.85, 3.5, 1.16] }, rs = K.checkCar(sm, side, []);
  assert.ok(rs.hits.some((h) => h.with === "side wall −") && rs.hits.some((h) => h.with === "side wall +"));
  // equipment: a bench across the car's place is found
  const rb = K.checkCar(s, car, [{ name: "benches#0", min: [-0.9, 4, 0], max: [0.9, 4.7, 0.95] }]);
  assert.deepStrictEqual(rb.hits.map((h) => h.with), ["benches#0"]);
});

test("game: a car the engine retired into its garage (where: \"garage\") is drawn parked at its own car spot – never also on the track; none without a work space", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js"), { updateGameCars } = await import("../src/renderer/game/cars3d.js");
  const cars = new Map(), spot = { x: 12, y: 3.017, z: 40, yaw: 2.5, d: 4.47, fits: true };
  const carFor = (num, d) => { let c = cars.get(num); if (!c) { const obj = new THREE.Group(), model = C.makeCar({ teamName: d.TeamName, teamColour: "FF8000", number: num, season: 2025 }); obj.add(model); c = { num, obj, model, label: { sp: { material: { opacity: 1 }, userData: {} } }, pos: new THREE.Vector3(), yaw: 0 }; cars.set(num, c); } return c; };
  let zones = [{ kind: "car", num: "4", carSpot: spot }];
  const K = { world: () => ({ frame: {}, center: { x: 0, z: 0 } }), cars, carFor, focus: () => "4", camMode: () => "chase", ROAD_LIFT: 0.02, paintLabel: () => {}, scaleForView: () => {}, pitZones: () => zones, pitG: () => null, pitTeams: () => null, lifted: new Set(), restoreCar: () => {} };
  const g = { num: "4", status: "dnf", where: "garage", s: null, u: null, v: 0, pit: { phase: "none" } };
  const A = { frameCars: () => ({ t: 1000, snap: { flag: null, sc: null }, cars: [g] }), map: {}, scenario: { track: { pit: null } }, driverOf: () => ({ TeamName: "McLaren", TeamColour: "FF8000", Tla: "NOR" }), ctx: { rate: 1 } };
  updateGameCars(K, A, 0.016);
  const c = cars.get("4");
  assert.ok(c.obj.visible && c.onTrack === false, "drawn, not on the track");
  assert.deepStrictEqual([c.obj.position.x, c.obj.position.y, c.obj.position.z], [12, 3.017, 40]);
  assert.ok(Math.abs(c.model.rotation.y - 2.5) < 1e-9 && c.model.rotation.x === 0, "facing out, level on the floor");
  zones = [];
  updateGameCars(K, A, 0.016);
  assert.strictEqual(c.obj.visible, false, "no work space: not drawn (v0.48's behaviour)");
});
