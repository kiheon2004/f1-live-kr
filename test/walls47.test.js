// v0.47 (request §3): the map's barriers as the checks see them (pitwallcheck.js solidBarrierSegs → scenery.js
// barrierRay → facilities.js) and as they are drawn (scenery.js barriersMesh) – one split + clip (mapwalls.js), so a
// piece whose two ends are off the tarmac but whose middle crosses the road or the pit lane is neither found nor drawn.
import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const id = (p) => p;
const len = (segs) => segs.reduce((a, [ax, az, bx, bz]) => a + Math.hypot(bx - ax, bz - az), 0);
// (every 0.25 m along each piece: any point where `cut` says it can't be)
const pointsIn = (segs, cut) => { const bad = []; for (const [ax, az, bx, bz] of segs) { const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25)); for (let k = 0; k <= n; k++) { const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n; if (cut(x, z)) bad.push([+x.toFixed(2), +z.toFixed(2)]); } } return bad; };
// a road along x, its tarmac |z| < 5 (as corridor.on(x, z, -0.3) answers it)
const road = (x, z) => Math.abs(z) < 5;
// a pit building along x from u −50 to 50, its garages' front at z 0, out towards the track at −z, the lane's end (its
// wall face) 12 m out – what facilities.js hands pitLaneOf (project, wallFace, gStart, gEnd)
const G = { gStart: -50, gEnd: 50, project: (x, z) => ({ u: x, off: -z }), wallFace: () => 12 };

test("a mapped wall whose two ends are off the road but whose middle crosses it: the in-road part is not taken for a wall (solidBarrierSegs)", async () => {
  const { solidBarrierSegs } = await import("../src/renderer/pitwallcheck.js");
  // one straight piece from z −10 to 10, across the road – no point of the map's line on the tarmac
  const segs = solidBarrierSegs([{ k: "barrier", sub: "wall", pts: [[0, -10], [0, 10]] }], id, road);
  assert.deepStrictEqual(pointsIn(segs, road), [], "nothing found on the tarmac");
  assert.ok(len(segs) >= 7 && len(segs) <= 10, `the parts off the road are still found (${len(segs).toFixed(1)} m)`);
  // (a long piece – 3 points 200 m apart – whose middle segment cuts a road at a slant)
  const slant = solidBarrierSegs([{ k: "barrier", sub: "jersey_barrier", pts: [[-200, -40], [0, -20], [200, 30]] }], id, road);
  assert.deepStrictEqual(pointsIn(slant, road), [], "nothing found on the tarmac (slanted crossing)");
});

test("a mapped barrier whose two ends are past the garages but whose middle runs along the pit lane: not in the lane (pitLaneOf), the map's own pit wall kept", async () => {
  const { solidBarrierSegs, pitLaneOf } = await import("../src/renderer/pitwallcheck.js");
  const inLane = pitLaneOf(G), cut = (x, z) => road(x, z + 30) || inLane(x, z);   // (the track's tarmac 25–35 m out)
  const lines = [
    { k: "barrier", sub: "wall", pts: [[-70, -6], [70, -6]] },          // across the lane's whole length, 6 m out (Imola's mapped fences, as a wall)
    { k: "barrier", sub: "wall", pts: [[-60, -12.5], [60, -12.5]] },    // the map's pit wall: 12.5 m out, past the lane's end
  ];
  const segs = solidBarrierSegs(lines, id, cut);
  assert.deepStrictEqual(pointsIn(segs, inLane), [], "nothing found in the pit lane");
  const wall = segs.filter(([, az]) => az === -12.5);
  assert.ok(Math.abs(len(wall) - 120) < 1e-6, `the map's pit wall kept whole (${len(wall).toFixed(1)} of 120 m)`);
  // the lane piece past the garages' ends: kept there (the map's barrier beyond the pits stays as mapped)
  const ends = segs.filter(([, az]) => az === -6);
  assert.ok(len(ends) >= 36 && len(ends) <= 40, `the barrier beyond the garages' ends kept (${len(ends).toFixed(1)} of 40 m)`);
});

test("what the checks find (solidBarrierSegs, the candidate walls) is what the drawing keeps (the final walls) for the same cut; the final walls are a part of the candidates", async () => {
  const { clipBarrierLines, runSegs } = await import("../src/renderer/mapwalls.js");
  const { solidBarrierSegs, pitLaneOf } = await import("../src/renderer/pitwallcheck.js");
  const inLane = pitLaneOf(G), tarmac = (x, z) => road(x, z + 30);
  const lines = [
    { k: "barrier", sub: "wall", pts: [[0, -45], [0, -15]] },                       // across the track, ends off it
    { k: "barrier", sub: "guard_rail", pts: [[-80, -20], [-40, -31], [40, -31], [80, -20]] }, // a point on the tarmac
    { k: "barrier", sub: "fence", pts: [[-70, -6], [70, -6]] },                     // along the lane
    { k: "barrier", sub: "retaining_wall", pts: [[-60, -12.5], [0, -12.5], [60, -12.5]] }, // the map's pit wall
    { k: "road", pts: [[0, 0], [9, 9]] },
  ];
  const solid = /^(wall|retaining_wall|jersey_barrier|guard_rail)$/;
  // the candidates (before the facilities: the track's tarmac only) – the same pieces solidBarrierSegs finds
  const cand = clipBarrierLines(lines, id, { cut: (x, z) => tarmac(x, z) && "road" });
  assert.deepStrictEqual(solidBarrierSegs(lines, id, tarmac), runSegs(cand.filter((l) => solid.test(l.sub))));
  assert.deepStrictEqual(solidBarrierSegs(lines, id, tarmac, /^fence$/), runSegs(cand.filter((l) => l.sub === "fence")));
  // the final walls (after the facilities: the pit lane too), drawn in 2 m points near the pits – every piece of them
  // lies on a candidate piece, none on the tarmac or in the lane
  const stats = {};
  const fin = clipBarrierLines(lines, id, { cut: (x, z) => (tarmac(x, z) && "road") || (inLane(x, z) && "lane"), dense: (x, z) => Math.abs(x) < 130, stats });
  const cs = runSegs(cand), fs = runSegs(fin);
  const onCand = ([x, z]) => cs.some(([ax, az, bx, bz]) => { const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)); return Math.hypot(ax + ex * t - x, az + ez * t - z) < 1e-6; });
  for (const [ax, az, bx, bz] of fs) assert.ok(onCand([ax, az]) && onCand([bx, bz]) && onCand([(ax + bx) / 2, (az + bz) / 2]), `final piece ${[ax, az, bx, bz]} is a candidate's`);
  assert.deepStrictEqual(pointsIn(fs, (x, z) => tarmac(x, z) || inLane(x, z)), [], "the final walls: none on the tarmac or in the lane");
  assert.ok(Math.abs(len(fs.filter(([, az, , bz]) => az === -12.5 && bz === -12.5)) - 120) < 1e-6, "the map's pit wall kept whole");
  assert.ok(stats.crossing >= 1 && stats.cut.lane > 0 && stats.cut.road > 0, `counted: ${JSON.stringify(stats)}`);
});

test("the drawing, the checks' search and the facilities use the shared clip (scenery.js wiring)", () => {
  const src = readFileSync(new URL("../src/renderer/scenery.js", import.meta.url), "utf8");
  // the candidates for barrierRay, the final walls for barriersMesh – both from mapwalls.js clipBarrierLines
  assert.ok(/import \{[^}]*clipBarrierLines[^}]*\} from "\.\/mapwalls\.js"/.test(src), "scenery.js imports the shared clip");
  assert.ok(/const wallCand = clipBarrierLines\(/.test(src), "candidate walls (before the facilities)");
  assert.ok(/const near = clipBarrierLines\(/.test(src), "final walls (after the facilities)");
  assert.ok(!/solidBarrierSegs\(scene\.lines/.test(src), "barrierRay no longer clips the map's lines its own way");
});

test("pieces nothing cuts stay as mapped (no extra points); a line with no point near the track is left out of both stages", async () => {
  const { clipBarrierLines, runSegs } = await import("../src/renderer/mapwalls.js");
  const lines = [{ k: "barrier", sub: "wall", pts: [[0, 10], [30, 10], [60, 12]] }, { k: "barrier", sub: "wall", pts: [[0, 300], [30, 300]] }];
  const keep = (l, q) => q.some(([, z]) => z < 45);
  assert.deepStrictEqual(runSegs(clipBarrierLines(lines, id, { cut: road, keep })), [[0, 10, 30, 10], [30, 10, 60, 12]]);
  // (dense: the same line in 2 m points – the same wall)
  const d = runSegs(clipBarrierLines(lines, id, { cut: road, keep, dense: () => true }));
  assert.strictEqual(d.length, 15 + 16);
  assert.ok(Math.abs(len(d) - (30 + Math.hypot(30, 2))) < 1e-9);
});
