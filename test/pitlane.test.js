// The pit lane across (pitlane.js): the garages' line from the map's buildings beside the measured pit path.
const test = require("node:test");
const assert = require("node:assert");

// a straight pit lane along +x at z = 0, the track at z = −20 (so the garages are towards +z)
const lane = async () => {
  const P = await import("../src/renderer/pitlane.js");
  const frame = P.pathFrame([[0, 0], [200, 0], [500, 0]]);
  return { P, frame, toTrack: () => [0, -1] };
};
const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

test("pit lane frame: distance along, position and normal", async () => {
  const { frame } = await lane();
  assert.strictEqual(frame.len, 500);
  const p = frame.at(250);
  assert.deepStrictEqual([p.x, p.z, p.tx, p.tz, p.nx, p.nz], [250, 0, 1, 0, -0, 1]);
});

test("ray against a building's outline: the nearest edge crossed, none behind or beside", async () => {
  const { P } = await lane();
  const r = rect(10, 30, 8, 26);
  assert.strictEqual(P.rayRing(20, 0, 0, 1, r), 8);
  assert.strictEqual(P.rayRing(20, 0, 0, -1, r), Infinity);
  assert.strictEqual(P.rayRing(50, 0, 0, 1, r), Infinity);
});

test("garages' line: the pit building met on the side away from the track at the same distance, its parts", async () => {
  const { P, frame, toTrack } = await lane();
  const rings = [
    { ring: rect(80, 260, 11, 29), ref: "pits A" }, { ring: rect(262, 420, 11.5, 29), ref: "pits B" },
    { ring: rect(100, 140, -40, -30), ref: "grandstand over the track" },   // on the track's side: never
    { ring: rect(150, 160, 24, 40), ref: "behind the pits" },               // further back: not on the line
    { ring: rect(430, 440, 18, 30), ref: "a hut further out" },             // met once, off the line
  ];
  const g = P.garageLine(frame, rings, toTrack, 100, 400);
  assert.ok(Math.abs(g.front - 11) < 0.6, `front ${g.front}`);
  assert.deepStrictEqual(g.parts.sort(), ["pits A", "pits B"]);
  assert.ok(g.coverage > 0.9);
  assert.deepStrictEqual(g.side(200).map((v) => v + 0), [0, 1]);
});

test("garages' line: too few stations meet a building – none (a made-up building instead)", async () => {
  const { P, frame, toTrack } = await lane();
  const g = P.garageLine(frame, [{ ring: rect(100, 130, 10, 20), ref: "kiosk" }], toTrack, 100, 400);
  assert.strictEqual(g.front, null); assert.deepStrictEqual(g.parts, []);
});

test("run of garages: inside the limiter lines, at most 340 m, centred; a made-up outline on the line", async () => {
  const { P, frame, toTrack } = await lane();
  assert.deepStrictEqual(P.garageRun(60, 460, 500), [100, 420]);
  const [a, b] = P.garageRun(0, 900, 1000); assert.strictEqual(b - a, 340); assert.strictEqual((a + b) / 2, 450);
  const g = P.garageLine(frame, [], toTrack, 100, 400);
  const o = P.genericOutline(frame, g.side, 100, 400, 11, 18, 100);
  assert.deepStrictEqual(o, [[100, 11], [200, 11], [300, 11], [400, 11], [400, 29], [300, 29], [200, 29], [100, 29]]);
});

test("across the lane: driving in the fast lane, stopped at its box in the box, back to the feed's line past the run", async () => {
  const { laneOffset, LANES } = await import("../src/renderer/pitlane.js");
  const base = { gStart: 100, gEnd: 400, boxU: 250 };
  // the feed's line 1.1 m out (Silverstone) or 14.5 m (Lusail): driving → the fast lane
  assert.strictEqual(laneOffset({ ...base, off: 1.1, u: 200, speed: 22 }), LANES.fast);
  assert.strictEqual(laneOffset({ ...base, off: 14.5, u: 200, speed: 22 }), LANES.fast);
  // stopped at its box → the box; at the limit past its box (a drive-through) → still the fast lane
  assert.strictEqual(laneOffset({ ...base, off: 8.3, u: 250, speed: 0 }), LANES.box);
  assert.strictEqual(laneOffset({ ...base, off: 8.3, u: 250, speed: 22 }), LANES.fast);
  // slowing 12 m before it: on the way in
  const x = laneOffset({ ...base, off: 8.3, u: 238, speed: 4 }); assert.ok(x > LANES.box && x < LANES.fast, String(x));
  // stopped with no box of its own known yet (the race's first stops): it pulled into its box; driving: the fast lane
  assert.strictEqual(laneOffset({ ...base, boxU: null, off: 8.3, u: 250, speed: 0 }), LANES.box);
  assert.strictEqual(laneOffset({ ...base, boxU: null, off: 8.3, u: 250, speed: 22 }), LANES.fast);
  // slow but far from its own box (queued behind another car): the fast lane
  assert.strictEqual(laneOffset({ ...base, off: 8.3, u: 150, speed: 0 }), LANES.fast);
  // past the run's end: the feed's own line; nowhere near the garages: untouched
  assert.strictEqual(laneOffset({ ...base, off: 8.3, u: 460, speed: 22 }), 8.3);
  assert.strictEqual(laneOffset({ ...base, off: 60, u: 200, speed: 22 }), 60);
});

test("pit lane cells: points within 3 m of the path count, its 40 m ends (where it meets the lap line) and points off it don't", async () => {
  const { laneCells } = await import("../src/renderer/pitlane.js");
  const on = laneCells([[0, 0], [300, 0]]);
  assert.ok(on(150, 0) && on(150, 2.2) && on(60, -2));
  assert.ok(!on(150, 5), "5 m off the path");
  assert.ok(!on(20, 0) && !on(290, 0), "within 40 m of its ends");
  assert.ok(!laneCells([])(0, 0));
});

test("wall line fit: follows a slope exactly, ignores a jump of the measured edge, keeps a real step that lasts", async () => {
  const { fitLine } = await import("../src/renderer/pitlane.js");
  // a wall running at an angle to the building's axis: 18 → 24 m over 300 m
  const slope = Array.from({ length: 101 }, (_, i) => [i * 3, 18 + i * 0.06]);
  fitLine(slope).forEach((v, i) => assert.ok(Math.abs(v - slope[i][1]) < 1e-6));
  // the edge jumping 6 m in at three stations (Sakhir): the wall stays straight
  const jump = Array.from({ length: 60 }, (_, i) => [i * 3, i >= 30 && i < 33 ? 8 : 14]);
  for (const v of fitLine(jump)) assert.ok(Math.abs(v - 14) < 0.01, String(v));
});

test("cross-section: fast lane the last 3.5 m before the wall, the box in the inner lane with room for its crew, a lane too narrow said so", async () => {
  const { crossSection } = await import("../src/renderer/pitlane.js");
  // Bahrain-like: the wall's face 12.5 m out
  const a = crossSection({ wall: 12.5, edge: 14.5, path: 8.2 });
  assert.ok(a.ok); assert.deepStrictEqual(a.fast, [9, 12.5]); assert.strictEqual(a.fastC, 10.75); assert.strictEqual(a.boxC, 4.5);
  assert.strictEqual(a.wallFrom, "facility wall");
  // no wall known: one assumed at the track's edge
  const b = crossSection({ wall: null, edge: 18.25, path: 10.1 });
  assert.strictEqual(b.wall, 17.75); assert.ok(/assumed/.test(b.wallFrom));
  // a wide lane: the box isn't put far out in it (crew room on the lane side kept inside the inner lane)
  const c = crossSection({ wall: 30 }); assert.ok(c.boxC <= c.inner - 2.4 && c.boxC >= 2.6);
  // too narrow for a box and its crew
  const d = crossSection({ wall: 6 }); assert.ok(d.narrow && !d.ok); assert.ok(d.fast[1] === 6 && d.fast[0] === 3);
  // nothing known
  assert.strictEqual(crossSection({ wall: null, edge: null }).ok, false);
});
