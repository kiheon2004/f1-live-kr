// v0.47 (the user's §4): the teams' pit wall stands against each other – each is placed on its own (facilities.js wallAt,
// moved up to 6 m where the wall kinks), so standcheck.js measures what neighbours could do to each other: overlap, take
// the same stretch, run off the walkway's end, leave the railing open where no stand is, stand in the cars' way.
const test = require("node:test");
const assert = require("node:assert");

// a straight walkway along +x (u = x), the stands' fronts towards −z (the pit lane), their point 30 m out
const along = [1, 0], out = [0, -1];
const stand = (team, box, at = box, L = 5.4, extra = {}) => ({ team, box, L, p: [at, 30], along, out, enclosed: false, upper: false, ...extra });
const base = (stands, more = {}) => ({ axis: { o: [0, 0], u: [1, 0] }, wall: [-100, 100], run: [-100, 100], rail: null, spans: [], stands, ...more });

test("stand check: parts, overlap and gap", async () => {
  const { standRects, polyOverlap, PARTS } = await import("../src/renderer/standcheck.js");
  // (the parts garages.js pitWallStand builds – a 6-seat stand 5.4 m long: its roof 5.7 m, its step 0.5 m past the end)
  assert.deepStrictEqual(PARTS(5.4).map((q) => q.name), ["deck", "console", "post", "post", "post", "post", "roof", "fascia", "endRail", "endRail", "step"]);
  const r = standRects(stand("A", 0)), roof = r.find((q) => q.name === "roof"), xs = roof.pts.map((p) => p[0]);
  assert.ok(Math.abs(Math.min(...xs) + 2.85) < 1e-9 && Math.abs(Math.max(...xs) - 2.85) < 1e-9);
  const sq = (x0, x1) => [[x0, 0], [x1, 0], [x1, 1], [x0, 1]];
  assert.ok(Math.abs(polyOverlap(sq(0, 2), sq(1.5, 3)) - 0.5) < 1e-9);
  assert.ok(Math.abs(polyOverlap(sq(0, 2), sq(2.4, 3)) + 0.4) < 1e-9);
});

test("stand check: neighbours apart, on the walkway, the railing opened over them alone, clear of the cars – right", async () => {
  const { checkStands } = await import("../src/renderer/standcheck.js");
  const across = (box) => [-2.75, 0, 2.75, 3.2].map((a) => ({ a, u: box + a, standLane: 28.15, deckLane: 28.15, laneFace: 28.25, carEdge: 27.0, boxEdge: 20 }));
  const rail = []; for (let u = -100; u < 100; u += 0.5) rail.push([u, u + 0.5]);
  const v = checkStands(base([stand("A", -20, -20, 5.4, { across: across(-20) }), stand("B", 0, 0, 5.4, { across: across(0) })], { rail, spans: [[-22.7, -16.7], [-2.7, 3.3]] }));
  assert.ok(v.ok, v.problems.join("; "));
  assert.strictEqual(v.nMoved, 0);
  assert.ok(v.minGap > 13 && v.minGap < 15, String(v.minGap));
  assert.ok(v.rail.maxBeyond <= 0.5, JSON.stringify(v.rail));
  assert.strictEqual(v.minCarGap, 1.15);
});

test("stand check: two neighbours over the same stretch, a stand off the walkway's end, the railing through a stand or open beyond it, a stand in the lane or the cars' way – each found", async () => {
  const { checkStands } = await import("../src/renderer/standcheck.js");
  // B moved 4 m towards A (a kink): their roofs and decks overlap
  const ov = checkStands(base([stand("A", 0), stand("B", 8, 4)]));
  assert.ok(!ov.ok);
  assert.ok(ov.overlaps.some((o) => o.parts.includes("deck") && o.depth > 1), JSON.stringify(ov.overlaps));
  assert.ok(ov.order.some((p) => /same stretch/.test(p)), ov.order.join("; "));
  assert.deepStrictEqual(ov.moved.map((m) => m.du), [0, -4]);
  // swapped: B's stand before A's
  assert.ok(checkStands(base([stand("A", 0, 3), stand("B", 2, -6)])).order.some((p) => /swapped/.test(p)));
  // past the walkway's end (its step 0.5 m past the deck)
  const end = checkStands(base([stand("A", 97)]));
  assert.ok(end.ends.some((p) => /0\.\d+ m past the walkway's end/.test(p)), end.ends.join("; "));
  // the railing: 3 m segments; left across the stand (not opened) / opened 3 m beyond it
  const rail = [[-6, -3], [-3, 0], [0, 3], [3, 6], [6, 9], [9, 12]];
  const through = checkStands(base([stand("A", 0)], { rail, spans: [[0, 3.3]] }));
  assert.ok(through.rail.through.some((p) => /railing left across 2\.7\d* m/.test(p)), JSON.stringify(through.rail));
  const wide = checkStands(base([stand("A", 0)], { rail, spans: [[-2.7, 6.1]] }));
  assert.ok(wide.problems.some((p) => /railing open 5\.8 m beyond/.test(p)), wide.problems.join("; "));
  // in the lane, the fast lane's cars into the deck
  const lane = checkStands(base([stand("A", 0, 0, 5.4, { across: [{ a: 0, u: 0, standLane: 27.6, deckLane: 27.6, laneFace: 28.0, carEdge: 27.8 }] })]));
  assert.ok(lane.problems.some((p) => /0\.4 m in the pit lane/.test(p)), lane.problems.join("; "));
  assert.ok(lane.problems.some((p) => /fast lane's cars 0\.2 m into/.test(p)), lane.problems.join("; "));
});

// the real input (Madrid 2026, 5 min before the end – Map3D.standCheck(true, true), run/stands/stands_madrid2.log): the
// run's 29 garages in two blocks 116 m apart, each garage's lane section (u, wall face, fast lane's centre), the stands
const madrid = () => require("./fixtures/stands47_madrid26.json");
// where a car in the fast lane is drawn (map3d.js pitModelFor's at = pitlane.js laneSectionAt, + pitstate.js
// laneOffsetOf, inside the run): the facility's wall face at u where known (laneFace), else the sections either side
async function fastLaneAt(slots, u, laneFace = null) {
  const { laneSectionAt, crossSection, CREW_ROOM } = await import("../src/renderer/pitlane.js");
  const st = slots.map(([uc, wall]) => ({ cs: crossSection({ wall }), floor: 0, s: { uc } })), c = laneSectionAt(st, slots.map((x) => x[0]), u, laneFace == null ? null : () => laneFace);
  return { wall: c.wall, carEdge: c.fastC + CREW_ROOM.carHalf };
}

test("pit lane: a place along the run between the garages either side by their centres – a gap in the run (Madrid 2026) doesn't shift the cars onto a far garage's section", async () => {
  const { laneStationAt } = await import("../src/renderer/pitlane.js");
  // evenly spaced garages: the same as counting pitches from the run's start (the v0.46 formula)
  const g0 = -100, p = 6, us = Array.from({ length: 20 }, (_, k) => g0 + p * (k + 0.5));
  for (const u of [-120, -100, -97, -50.2, 0, 13.7, 16.9, 20, 40]) {
    const f = Math.max(0, Math.min(us.length - 1, (u - g0) / p - 0.5)), i = Math.min(us.length - 2, Math.floor(f)), r = laneStationAt(us, u);
    assert.strictEqual(r.i, i, `u ${u}`); assert.ok(Math.abs(r.t - (f - i)) < 1e-9, `u ${u}: t ${r.t} vs ${f - i}`);
  }
  // Madrid 2026: every place along every stand – the fast lane's cars short of the lane's face and of the stand
  const M = madrid(); let worst = Infinity;
  for (const s of M.stands) for (const x of s.across) {
    const f = await fastLaneAt(M.slots, x.u, x.laneFace), g = await fastLaneAt(M.slots, x.u);
    // (the lane's sections are a garage apart, the facility's wall every 3 m: at the run's end, where the wall kinks,
    // they differ by up to 0.5 m – the old count put Haas on a section 6.6 m off)
    assert.ok(Math.abs(g.wall - x.laneFace) < 1, `${s.team} u ${x.u}: the lane's section ${f.wall.toFixed(2)} m, the facility's wall face ${x.laneFace}`);
    worst = Math.min(worst, x.standLane - f.carEdge);
  }
  // (0.65 m: the fast lane's centre 1.75 m in from the wall face, a car 1 m to its side, the deck 0.1 m over the face)
  assert.ok(worst > 0.5, `the fast lane's cars ${(-worst).toFixed(2)} m into a stand`);
});

test("stand check on the real input (Madrid 2026): neighbours apart, in box order, on the walkway, out of the lane and the cars' way; one stand moved (Cadillac, at the kink)", async () => {
  const { checkStands } = await import("../src/renderer/standcheck.js");
  const M = madrid(), stands = [];
  for (const s of M.stands) { const across = []; for (const x of s.across) across.push({ ...x, carEdge: (await fastLaneAt(M.slots, x.u, x.laneFace)).carEdge }); stands.push({ ...s, across }); }
  // (the railing apart – its own test)
  const v = checkStands({ ...M, rail: null, stands });
  assert.ok(v.ok, v.problems.join("; "));
  assert.strictEqual(v.stands, 11);
  assert.deepStrictEqual(v.moved.filter((m) => Math.abs(m.du) > 0.25).map((m) => [m.team, m.du]), [["Cadillac", -6]]);
  assert.ok(v.minGap > 10, String(v.minGap));
});

// the plain pit wall of a synthetic pit building (as test/pitwall45.test.js): a building along x, the track's tarmac edge
// 30 m out from its garages
async function plainWall(more = {}) {
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], gf = { xz: ([X, Y]) => [X, -Y], fromLL: () => [0, 0], toLL: () => [0, 0] };
  const F = await import("../src/renderer/facilities.js");
  const r = await F.buildFacilities({ scene: { location: "T", buildings: [{ name: "Pits", kind: "block", cls: "yes", est: 1, pts: rect(-150, 0, 150, 30), min: 0, h: 8 }] }, gf, groundAt: () => 0, trackEdge: (x, z) => z + 60, barrierRay: null, location: "T", year: 2025, toTrack: () => [0, -1], alongTrack: () => [1, 0],
    registry: [{ id: "w", loc: ["T"], status: "permanent", checked: "t", replaces: { names: /^Pits$/ }, builder: "pitBuilding", params: { garages: 30, height: 12, plate: 0.8, overhang: { pit: 2, paddock: 1, end: 1 }, facade: { pit: "pitGlass", paddock: "paddockPanels" }, pitWall: { height: 1.1, thick: 0.5, fence: 3.0, walk: 1.5, deck: 0.3 }, ...more } }] });
  let rail = null; r.group.traverse((o) => { if (o.isMesh && o.name === "rail") rail = o; });
  return { G: r.group.children[0].userData.garages, rail };
}
// what of the railing is left out (u spans along the garages), from its mesh: each quad's 6 vertices, in order
function railOpen(G, rail) {
  const pos = rail.geometry.attributes.position, idx = rail.geometry.index, n = pos.count / 6, shown = new Set();
  if (!idx) return [];
  for (let k = 0; k < idx.count; k += 6) shown.add(Math.floor(idx.getX(k) / 6));
  const open = [];
  for (let q = 0; q < n; q++) if (!shown.has(q)) { const us = [0, 1, 2, 3, 4, 5].map((v) => G.project(pos.getX(q * 6 + v), pos.getZ(q * 6 + v))); open.push([Math.min(...us.map((p) => p.u)), Math.max(...us.map((p) => p.u)), Math.min(...us.map((p) => p.off))]); }
  return open.sort((a, b) => a[0] - b[0]).reduce((m, s) => { const l = m[m.length - 1]; if (l && s[0] <= l[1] + 1e-6) l[1] = Math.max(l[1], s[1]); else m.push(s); return m; }, []);
}

test("the walkway's railing opened in front of a stand – not metres beyond it (v0.46 opened whole 3 m segments: up to 3.1 m open past a stand's end, Madrid 2026)", async () => {
  const { G, rail } = await plainWall();
  // a 6-seat stand (5.4 m, its step 0.5 m past one end) as garages.js opens it: [uc − L/2 − 0.3, uc + L/2 + 0.6]
  for (const uc of [G.gStart + 9, G.gStart + 50.4, 0]) {
    const span = [uc - 3.0, uc + 3.3];
    G.openRail([span]);
    const open = railOpen(G, rail);
    assert.strictEqual(open.length, 1, JSON.stringify(open));
    const [o0, o1] = open[0];
    assert.ok(o0 <= span[0] + 1e-6 && o1 >= span[1] - 1e-6, `open ${o0.toFixed(2)}–${o1.toFixed(2)} covers ${span}`);
    assert.ok(span[0] - o0 <= 0.5 && o1 - span[1] <= 0.5, `the railing open ${(span[0] - o0).toFixed(2)} m before and ${(o1 - span[1]).toFixed(2)} m after the stand's span`);
  }
  G.openRail([]);
  assert.deepStrictEqual(railOpen(G, rail), []);
});

test("pit lane: the fast lane's wall side from the facility's own wall face at u – not sections a garage apart interpolated across the run's end (Sakhir 2025: the cars 1.7 m into Kick Sauber's stand)", async () => {
  const { laneSectionAt, crossSection, CREW_ROOM } = await import("../src/renderer/pitlane.js");
  const S = require("./fixtures/stands47_sakhir25.json"), st = S.slots.map(([u, wall]) => ({ cs: crossSection({ wall }), floor: 0, s: { uc: u } })), us = S.slots.map((x) => x[0]);
  // (the facility's wall face where it was measured: along the stand)
  const xs = S.stand.across, wallFace = (u) => { let i = 0; while (i + 2 < xs.length && xs[i + 1].u < u) i++; const f = Math.max(0, Math.min(1, (u - xs[i].u) / (xs[i + 1].u - xs[i].u))); return xs[i].laneFace + (xs[i + 1].laneFace - xs[i].laneFace) * f; };
  // (what v0.46 drew: up to 1.7 m into the stand – in the fixture)
  assert.ok(Math.min(...xs.map((x) => x.standLane - x.carEdgeV046)) < -1.5);
  for (const x of xs) {
    const c = laneSectionAt(st, us, x.u, wallFace), edge = c.fastC + CREW_ROOM.carHalf;
    assert.ok(edge < x.standLane - 0.5, `u ${x.u}: the fast lane's cars' wall side ${edge.toFixed(2)} m out, the stand's lane side ${x.standLane}`);
    assert.ok(Math.abs(c.wall - x.laneFace) < 1e-6);
  }
  // without the facility's wall (none known): the sections, as before
  const c = laneSectionAt(st, us, us[3] + 1);
  assert.ok(Math.abs(c.wall - (S.slots[3][1] + (S.slots[4][1] - S.slots[3][1]) * (1 / (us[4] - us[3])))) < 1e-9);
});

test("the railing opened in front of a stand where the building has balconies with balustrades (the same mesh): the pit wall's own pieces opened, the balconies' kept (Suzuka, Silverstone)", async () => {
  const { G, rail } = await plainWall({ balconies: [{ y: 4, depth: 2 }] });
  const n = rail.geometry.attributes.position.count / 6;
  G.openRail([[-3, 3.3]]);
  const open = railOpen(G, rail), shown = rail.geometry.index.count / 6;
  // (what is left out: the walkway's railing – 29 m or so out from the garages – over the span, nothing else)
  assert.ok(open.length >= 1 && open.every(([a, b, off]) => off > 25 && a >= -3.6 && b <= 3.9), JSON.stringify(open.map((q) => q.map((x) => +x.toFixed(2)))));
  assert.strictEqual(n - shown, Math.round((open[0][1] - open[0][0]) / 0.5), "only the opened pieces are left out – every other quad (the balconies' balustrades too) still drawn");
  G.openRail([]);
  assert.deepStrictEqual(railOpen(G, rail), []);
});

test("a stand at the run's end stays on the walkway – its step too (Zandvoort 2026 Cadillac: the step 0.07 m past the walkway's last station)", async () => {
  const { G } = await plainWall();
  const { checkStands } = await import("../src/renderer/standcheck.js");
  const w0 = G.railU[0][0], w1 = G.railU[G.railU.length - 1][1], L = 5.4;
  for (const box of [w1 - 1, w1 - 3.1, w0 + 1, w0 + 2.8]) {
    const w = G.wallAt(box, L / 2), p = [w.p[0], w.p[2]];
    const u0 = G.project(0, 0).u, ux = G.project(1, 0).u - u0, uz = G.project(0, 1).u - u0;
    const v = checkStands({ axis: { o: [-u0 * ux, -u0 * uz], u: [ux, uz] }, wall: [w0, w1], run: [G.gStart, G.gEnd], rail: null, spans: [], stands: [{ team: "T", box, L, p, along: w.along, out: w.out }] });
    assert.deepStrictEqual(v.ends, [], `box ${box.toFixed(2)} (walkway ${w0.toFixed(2)}–${w1.toFixed(2)}): ${v.ends.join("; ")}`);
    assert.ok(Math.abs(G.project(...p).u - box) <= 3.5, "still by its box");
  }
});
