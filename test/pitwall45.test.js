// v0.46: the pit wall stands on the pit lane's side of the wall (src/renderer/pitwallcheck.js judges, facilities.js
// builds): garages | pit lane | stand | wall | track – the stand open to the lane, the wall between it and the track.
// The user's report: a stand with a barrier between it and the pit lane, joined to the track.
const test = require("node:test");
const assert = require("node:assert");

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const gf = { xz: ([X, Y]) => [X, -Y], fromLL: () => [0, 0], toLL: () => [0, 0] };
// a pit building along x, its pit side at scene z = −30, the track's tarmac edge 30 m out (z = −60)
const scene = () => ({ location: "T", buildings: [{ name: "Pits", kind: "block", cls: "yes", est: 1, pts: rect(-150, 0, 150, 30), min: 0, h: 8 }] });
const spec = (pitWall) => ({ id: "w", loc: ["T"], status: "permanent", checked: "t", replaces: { names: /^Pits$/ }, builder: "pitBuilding",
  params: { garages: 30, height: 12, plate: 0.8, overhang: { pit: 2, paddock: 1, end: 1 }, facade: { pit: "pitGlass", paddock: "paddockPanels" }, pitWall } });
const trackEdge = (x, z) => z + 60;
async function build(pitWall, barrierRay = null) {
  const F = await import("../src/renderer/facilities.js");
  const r = await F.buildFacilities({ scene: scene(), gf, groundAt: () => 0, trackEdge, barrierRay, location: "T", year: 2025, toTrack: () => [0, -1], alongTrack: () => [1, 0], registry: [spec(pitWall)] });
  return { r, G: r.group.children[0].userData.garages };
}
// a stand's section as the dev hook (map3d.js pitWallOrder) measures it: level lines out from the garages' front at the
// stand's seated heights through the facility's meshes, plus the map's wall where there is one
async function section(G, group, u, extra = []) {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const w = G.wallAt(u), c = G.project(w.p[0], w.p[2]).off, rc = new THREE.Raycaster(), hits = [...extra];
  group.updateMatrixWorld(true);
  const s = G.slots.reduce((p, q) => (Math.abs(q.uc - u) < Math.abs(p.uc - u) ? q : p)), out = [-s.inward[0], -s.inward[1]];
  for (const [y, low] of [[w.p[1] + 0.72, false], [w.p[1] + 1.12, false], [w.p[1] + 1.72, false], [s.floor + 0.6, true]]) {
    // (both ways: a one-sided face is met only from its front)
    for (const [o0, dir] of [[0.3, 1], [60, -1]]) {
      rc.set(new THREE.Vector3(s.front[0] + s.along[0] * (u - s.uc) + out[0] * o0, y, s.front[1] + s.along[1] * (u - s.uc) + out[1] * o0), new THREE.Vector3(out[0] * dir, 0, out[1] * dir)); rc.far = 59.7;
      for (const h of rc.intersectObject(group, true)) if (h.object.isMesh) hits.push({ off: o0 + dir * h.distance, name: h.object.name, low });
    }
  }
  return { stand: [c - 0.85, c + 0.75], lane: G.wallFace(u), edge: 30, hits };
}

test("pit wall check: lane | stand | wall | track is right; a wall or a railing in front of the stand, or none behind it, is wrong", async () => {
  const { standSection, circuitVerdict } = await import("../src/renderer/pitwallcheck.js");
  const good = standSection({ stand: [27.9, 29.5], lane: 28, edge: 30, hits: [{ off: 29.5, name: "pitWall" }, { off: 29.55, name: "fence" }, { off: 29.5, name: "pitWall" }] });
  assert.ok(good.ok, good.problems.join("; "));
  assert.match(good.order, /garages@0.0 stand\[@27.9 lane\|@28.0 .*\]stand@29.5 .*track@30.0/);
  // Suzuka-like (v0.45): the stand between a mapped wall and the tarmac
  const sz = standSection({ stand: [27.6, 29.2], lane: 27.0, edge: 30, hits: [{ off: 27.5, name: "barrier:wall" }] });
  assert.ok(!sz.ok);
  assert.ok(sz.problems.some((p) => /barrier:wall .*between the pit lane and the stand/.test(p)), sz.problems.join("; "));
  assert.ok(sz.problems.includes("no wall between the stand and the track"));
  // a railing along the walkway's lane edge, across the stand's front
  const rail = standSection({ stand: [27.9, 29.5], lane: 28, edge: 30, hits: [{ off: 28.0, name: "rail" }, { off: 29.5, name: "pitWall" }] });
  assert.deepStrictEqual(rail.problems, ["rail 28 m out: through the stand"]);
  // the stand on the tarmac
  assert.ok(standSection({ stand: [29, 30.6], edge: 30, hits: [{ off: 30.6, name: "syntheticWalls" }] }).problems.some((p) => /reaches the track/.test(p)));
  // only walls and screens count (a sign, a tree, the stand's own panels don't)
  assert.ok(standSection({ stand: [27.9, 29.5], edge: 30, hits: [{ off: 28.5, name: "teamPanels" }, { off: 29.5, name: "barrier:retaining_wall" }] }).ok);
  const v = circuitVerdict([{ team: "A", stand: [27.9, 29.5], edge: 30, hits: [{ off: 29.5, name: "pitWall" }] }, { team: "B", stand: [27.6, 29.2], edge: 30, hits: [{ off: 27.5, name: "barrier:wall" }] }]);
  assert.strictEqual(v.stands, 2); assert.strictEqual(v.wrong, 1);
});

test("mapped pit wall (Suzuka: the map's wall 2.5 m short of the tarmac): the stands on its pit lane side, the lane short of them", async () => {
  // the map's wall 27.5 m out from the garages (scene z = −57.5), the whole run long
  const barrierRay = (x, z, dx, dz, max) => { const s = (z - -57.5) / -dz; return dz < 0 && s > 0 && s <= max ? s : Infinity; };
  const { r, G } = await build({ height: 1.1, thick: 0.5, fence: 3.0, walk: 1.5, deck: 0.3 }, barrierRay);
  assert.strictEqual(r.info[0].wallFrom, "the map's wall");
  for (const u of [-60, 0, 75]) {
    const w = G.wallAt(u);
    assert.ok(w, `a stand at u ${u}`);
    G.openRail?.([[u - 3, u + 3]]);   // (the team layer opens the walkway's railing in front of its stands)
    const sec = await section(G, r.group, u, [{ off: 27.5, name: "barrier:wall" }]);
    const { standSection } = await import("../src/renderer/pitwallcheck.js");
    const v = standSection(sec);
    assert.ok(v.ok, `u ${u}: ${v.order} – ${v.problems.join("; ")}`);
    // (the cars' lane stops short of the stand: the fast lane's cars don't drive through it)
    assert.ok(sec.lane <= sec.stand[0] + 0.2, `lane face ${sec.lane.toFixed(2)} vs stand ${sec.stand[0].toFixed(2)}`);
  }
});

test("plain pit wall: the walkway's railing is open in front of a team's stand, closed elsewhere", async () => {
  const { r, G } = await build({ height: 1.1, thick: 0.5, fence: 3.0, walk: 1.5, deck: 0.3 });
  const { standSection } = await import("../src/renderer/pitwallcheck.js");
  assert.ok(G.openRail, "the facility lets the team layer open its railing at the stands");
  G.openRail([[-3, 3]]);
  const v = standSection(await section(G, r.group, 0));
  assert.ok(v.ok, `${v.order} – ${v.problems.join("; ")}`);
  // (away from a stand the railing is still there)
  const away = standSection(await section(G, r.group, 60));
  assert.ok(away.between.some((h) => h.name === "rail"), away.order);
  G.openRail([]);
  assert.ok(standSection(await section(G, r.group, 0)).between.some((h) => h.name === "rail"), "closed again");
});

test("Silverstone-like walkway (8 m, 1 m up): the stand on it against the wall, nothing between it and the lane once opened", async () => {
  const { r, G } = await build({ height: 1.1, thick: 0.5, fence: 3.0, walk: 8, deck: 1.0 });
  const { standSection } = await import("../src/renderer/pitwallcheck.js");
  G.openRail?.([[-3, 3]]);
  const v = standSection(await section(G, r.group, 0));
  assert.ok(v.ok, `${v.order} – ${v.problems.join("; ")}`);
});

test("generated walls keep out of the pits: between the garages and the pit wall's track face (Jeddah: one through the stands)", async () => {
  const { r, G } = await build({ height: 1.1, thick: 0.5, fence: 3.0, walk: 1.5, deck: 0.3 });
  const { pitsUpToWall } = await import("../src/renderer/pitwallcheck.js");
  const inPits = pitsUpToWall(G);
  assert.ok(inPits, "the pit building says where its wall's track face is (garages.wallOut)");
  assert.ok(Math.abs(G.wallOut(0) - 30) < 0.3, `the wall's track face at the tarmac's edge (${G.wallOut(0)})`);
  // scene z: the garages' front at −30, the wall's track face at −60 (30 m out)
  assert.strictEqual(inPits(0, -44), true, "the pit lane");
  assert.strictEqual(inPits(0, -58.6), true, "the walkway, where the stands are");
  assert.strictEqual(inPits(0, -61), false, "the track");
  assert.strictEqual(inPits(400, -44), false, "past the garages");
  assert.ok(r.group);
});

test("mapped pit wall that stops short of the garages' end (Silverstone): ours carries on, so the last stand has a wall before the tarmac", async () => {
  // the map's wall 27.5 m out, only for x < 60 (the run is −150…150: ≥ 60 % of it mapped)
  const barrierRay = (x, z, dx, dz, max) => { const s = (z - -57.5) / -dz; return x < 60 && dz < 0 && s > 0 && s <= max ? s : Infinity; };
  const { r, G } = await build({ height: 1.1, thick: 0.5, fence: 3.0, walk: 1.5, deck: 0.3 }, barrierRay);
  const { standSection } = await import("../src/renderer/pitwallcheck.js");
  assert.match(r.info[0].wallFrom, /^the map's wall/);
  for (const u of [0, 100]) {
    G.openRail?.([[u - 3, u + 3]]);
    // (the map's wall drawn where the map has it – scenery.js barriersMesh; here a hit for it)
    const v = standSection(await section(G, r.group, u, u < 60 ? [{ off: 27.5, name: "barrier:wall" }] : []));
    assert.ok(v.ok, `u ${u}: ${v.order} – ${v.problems.join("; ")}`);
  }
});

test("the pit lane in front of the garages is kept clear of mapped barriers; the map's pit wall at its end stays (Imola: fences across the lane)", async () => {
  const barrierRay = (x, z, dx, dz, max) => { const s = (z - -57.5) / -dz; return dz < 0 && s > 0 && s <= max ? s : Infinity; };
  const { G } = await build({ height: 1.1, thick: 0.5, fence: 3.0, walk: 1.5, deck: 0.3 }, barrierRay);
  const { pitLaneOf } = await import("../src/renderer/pitwallcheck.js");
  const inLane = pitLaneOf(G);
  assert.ok(inLane, "the pit building says where its lane ends");
  // scene z: garages' front −30, the map's wall −57.5 (its pit face −57.25), the stands' walkway 1.5 m in from there
  assert.strictEqual(inLane(0, -45), true, "a fence across the lane: cut");
  assert.strictEqual(inLane(0, -57.5), false, "the map's pit wall: kept");
  assert.strictEqual(inLane(0, -29.5), false, "the garages' front");
  assert.strictEqual(inLane(400, -45), false, "past the garages");
});

test("the pit wall is looked for only among the map's barrier pieces that are drawn (Silverstone: a piece on the tarmac, cut from the picture, had been taken for it)", async () => {
  const { solidBarrierSegs } = await import("../src/renderer/pitwallcheck.js");
  const lines = [{ k: "barrier", sub: "guard_rail", pts: [[0, 0], [10, 0], [20, 0], [30, 0]] }, { k: "barrier", sub: "fence", pts: [[0, 5], [30, 5]] }, { k: "road", pts: [[0, 9], [9, 9]] }];
  const onTarmac = (x) => x > 15;   // (the points at x 20 and 30 lie on the tarmac: cut from the drawn barrier)
  // (the piece reaching the tarmac in its 2 m pieces off it, as drawn – v0.46 Monza 2026)
  assert.deepStrictEqual(solidBarrierSegs(lines, (p) => p, onTarmac), [[0, 0, 10, 0], [10, 0, 12, 0], [12, 0, 14, 0]]);
  assert.strictEqual(solidBarrierSegs(lines, (p) => p).length, 3, "all pieces where none is on the tarmac; never a fence");
});

test("a mapped fence just short of the tarmac (no wall mapped) is the pit wall's debris fence: our wall under it, the stands clear of it (Interlagos)", async () => {
  // a fence 29.4 m out from the garages (scene z −59.4), the tarmac's edge at 30; walls: none mapped
  const barrierRay = (x, z, dx, dz, max, kind = "solid") => { if (kind !== "fence") return Infinity; const s = (z - -59.4) / -dz; return dz < 0 && s > 0 && s <= max ? s : Infinity; };
  const { r, G } = await build({ height: 1.1, thick: 0.5, fence: 3.0, walk: 1.5, deck: 0.3 }, barrierRay);
  const { standSection } = await import("../src/renderer/pitwallcheck.js");
  assert.ok(Math.abs(G.wallOut(0) - 29.35) < 0.2, `the wall's track face under the fence (${G.wallOut(0)})`);
  G.openRail([[-3, 3]]);
  const v = standSection(await section(G, r.group, 0, [{ off: 29.4, name: "barrier:fence" }]));
  assert.ok(v.ok, `${v.order} – ${v.problems.join("; ")}`);
});

test("a mapped pit wall along only part of the run (Monza 2026: 40 %) is the wall there, ours carries it on: no map wall through a stand", async () => {
  // the map's wall 27.5 m out for x < −45 only (the run −150…150: ~35 %)
  const barrierRay = (x, z, dx, dz, max, kind = "solid") => { if (kind !== "solid") return Infinity; const s = (z - -57.5) / -dz; return x < -45 && dz < 0 && s > 0 && s <= max ? s : Infinity; };
  const { r, G } = await build({ height: 1.1, thick: 0.5, fence: 3.0, walk: 1.5, deck: 0.3 }, barrierRay);
  const { standSection } = await import("../src/renderer/pitwallcheck.js");
  for (const u of [-100, 0, 100]) {
    G.openRail([[u - 3, u + 3]]);
    const v = standSection(await section(G, r.group, u, u < -45 ? [{ off: 27.5, name: "barrier:wall" }] : []));
    assert.ok(v.ok, `u ${u}: ${v.order} – ${v.problems.join("; ")}`);
  }
});

test("a mapped pit wall along a short part of the run (Monza 2026: ~13 %) is the wall there and ours carries it on: no map wall through a stand", async () => {
  // the map's wall 27.5 m out for x < −112 only (the run −150…150: ~13 %)
  const barrierRay = (x, z, dx, dz, max, kind = "solid") => { if (kind !== "solid") return Infinity; const s = (z - -57.5) / -dz; return x < -112 && dz < 0 && s > 0 && s <= max ? s : Infinity; };
  const { r, G } = await build({ height: 1.1, thick: 0.5, fence: 3.0, walk: 1.5, deck: 0.3 }, barrierRay);
  const { standSection } = await import("../src/renderer/pitwallcheck.js");
  for (const u of [-130, 0, 100]) {
    G.openRail([[u - 3, u + 3]]);
    const v = standSection(await section(G, r.group, u, u < -112 ? [{ off: 27.5, name: "barrier:wall" }] : []));
    assert.ok(v.ok, `u ${u}: ${v.order} – ${v.problems.join("; ")}`);
  }
});

test("an opening in the mapped pit wall narrower than the 3 m between stations (Mexico City 2025, at a stand): ours across it", async () => {
  // where the stations are: a first build with the wall everywhere
  const solid = (open) => (x, z, dx, dz, max, kind = "solid") => { if (kind !== "solid" || (open && x > open[0] && x < open[1])) return Infinity; const s = (z - -57.5) / -dz; return dz < 0 && s > 0 && s <= max ? s : Infinity; };
  const first = await build({ height: 1.1, thick: 0.5, fence: 3.0, walk: 1.5, deck: 0.3 }, solid(null));
  // a 2 m opening between two stations (x = u here: the building centred on x = 0, along +x – checked)
  const u0 = first.G.gStart + 3 * 50 + 0.5, [px] = [u0], c = first.G.project(px, -45).u;
  assert.ok(Math.abs(c - u0) < 0.01, `u is x (${c} vs ${u0})`);
  const { r, G } = await build({ height: 1.1, thick: 0.5, fence: 3.0, walk: 1.5, deck: 0.3 }, solid([u0, u0 + 2]));
  const { standSection } = await import("../src/renderer/pitwallcheck.js");
  G.openRail([[u0 - 2, u0 + 4]]);
  // (the map's wall drawn either side of the opening, not in it: no hit for it at the opening's middle)
  const v = standSection(await section(G, r.group, u0 + 1));
  assert.ok(v.ok, `${v.order} – ${v.problems.join("; ")}`);
  assert.match(r.info[0].wallFrom, /opening/);
});

test("a mapped wall piece with an end on the tarmac is found where it is drawn (Monza 2026: drawn in 2 m pieces near the pits, not found whole)", async () => {
  const { solidBarrierSegs } = await import("../src/renderer/pitwallcheck.js");
  // one straight piece from x 0 to 40, its last point on the tarmac (x > 35)
  const segs = solidBarrierSegs([{ k: "barrier", sub: "wall", pts: [[0, 0], [40, 0]] }], (p) => p, (x) => x > 35);
  const len = segs.reduce((a, [ax, az, bx, bz]) => a + Math.hypot(bx - ax, bz - az), 0);
  assert.ok(len >= 34 && len <= 36, `the off-tarmac part found (${len.toFixed(1)} m of it)`);
  assert.ok(segs.every(([ax, , bx]) => ax <= 35 && bx <= 35), "none of it on the tarmac");
});

test("pit wall check across a stand's length: one line through a joint of two map pieces is no opening; an opening 0.5 m wide behind the stand is", async () => {
  const { circuitVerdict } = await import("../src/renderer/pitwallcheck.js");
  const at = (a, wall) => ({ a, stand: [27.9, 29.5], lane: 28, edge: 30, hits: wall ? [{ off: 29.6, name: "barrier:wall" }] : [] });
  // (Mexico City 2025: the middle line alone – the joint – met nothing; every 0.5 m across it the wall is there)
  const joint = circuitVerdict([{ team: "M", across: [-2.25, -1.75, -1.25, -0.75, -0.25, 0.25, 0.75, 1.25, 1.75, 2.25].map((a) => at(a, true)) }]);
  assert.strictEqual(joint.wrong, 0, joint.problems.join("; "));
  const open = circuitVerdict([{ team: "M", across: [-0.75, -0.25, 0.25, 0.75].map((a) => at(a, a !== 0.25)) }]);
  assert.strictEqual(open.wrong, 1);
  assert.deepStrictEqual(open.res[0].problems, ["no wall between the stand and the track (at 0.25 m along)"]);
});
