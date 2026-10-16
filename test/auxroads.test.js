// The venue's other tarmac (auxroads.js): an escape road running close beside the track stays one strip joined to the
// track's edge at both ends (v0.33 cut it wherever it came within the track's half width + 5.5 m); the lap's own
// raceway isn't drawn again; the strip never lies on the track's tarmac; its height blends without a step.
const test = require("node:test");
const assert = require("node:assert");

// a straight track along +x, 14 m wide (edges at ±7), samples every 2 m
const samples = []; for (let i = 0; i <= 300; i++) samples.push({ i, p: { x: i * 2 - 300, y: 0, z: 0 }, nor: { x: 0, z: 1 }, tan: { x: 1, z: 0 }, L: 7, R: -7 });
const T = {
  local: (x, z) => { const i = Math.max(0, Math.min(300, Math.round((x + 300) / 2))), s = samples[i]; return Math.hypot(x - s.p.x, z) > 50 ? null : { s, l: z, a: x - s.p.x }; },
  edge: (s, side) => (side > 0 ? s.L : s.R),
};

test("other tarmac: an escape road close beside the track is one strip, joined to the track's edge at both ends", async () => {
  const { auxRuns, ribbonEdges } = await import("../src/renderer/auxroads.js");
  // the lap's own raceway, and an escape road leaving the track at x = -100, 11 m from its centre for 150 m, back at x = 120
  const lap = { k: "raceway", w: 12, pts: [[-300, 0], [300, 0]] };
  const esc = { k: "raceway", w: 10, pts: [[-120, 0], [-100, 11], [100, 11], [120, 0]] };
  const runs = auxRuns([lap, esc], T);
  assert.strictEqual(runs.length, 1, "only the escape road: the lap isn't drawn again");
  const r = runs[0];
  assert.deepStrictEqual(r.joins, [true, true]);
  const xs = r.pts.map((p) => p[0]); assert.ok(Math.min(...xs) < -100 && Math.max(...xs) > 100, "not cut where it runs 11 m from the centre");
  for (const p of [r.pts[0], r.pts[r.pts.length - 1]]) assert.ok(Math.abs(p[1]) < 8, `its ends on the track's edge: ${p}`);
  for (let i = 1; i < r.pts.length; i++) assert.ok(Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]) <= 2.01, "continuous");
  const { left, right } = ribbonEdges(r, T);
  for (const p of left.concat(right)) assert.ok(!(p[1] < 7 + 0.05 && p[1] > -7 - 0.05), `never on the track's tarmac: ${p}`);
  // where it runs beside the track it keeps its width beyond the edge (its inner edge on the track's edge line)
  const mid = r.pts.findIndex((p) => Math.abs(p[0]) < 1);
  assert.ok(Math.abs(left[mid][1] - 16) < 0.2 && Math.abs(right[mid][1] - 7.1) < 0.2, `${left[mid]} ${right[mid]}`);
});

test("other tarmac: service roads only where they meet the track; bends keep the width; no step in height", async () => {
  const { auxRuns, ribbonEdges, blendHeight, onJoiningRun } = await import("../src/renderer/auxroads.js");
  const far = { k: "road", sub: "service", w: 4, pts: [[0, 30], [100, 30]] };
  const marshal = { k: "road", sub: "service", w: 4, pts: [[0, 7], [0, 40]] };
  const town = { k: "road", sub: "residential", w: 6, pts: [[0, 0], [0, 40]] };
  const runs = auxRuns([far, marshal, town], T);
  assert.deepStrictEqual(runs.map((r) => r.sub), ["service"]);
  assert.deepStrictEqual(runs[0].joins, [true, false]);
  // a right-angle bend 40 m from the track: the strip's width at the corner is the miter's (√2 × half width), limited
  const bend = { pts: [[0, 40], [0, 60], [20, 60]], w: 6, joins: [false, false] };
  const { left, right } = ribbonEdges(bend, T);
  assert.ok(Math.abs(Math.hypot(left[1][0] - right[1][0], left[1][1] - right[1][1]) - 6 * Math.SQRT2) < 0.01);
  // height: continuous from the track to the terrain (no 60 m step), never under the terrain
  let prev = blendHeight(5, 0, 0);
  for (let d = 0.5; d <= 80; d += 0.5) { const y = blendHeight(5, 0, d); assert.ok(Math.abs(y - prev) < 0.2, `step at ${d} m`); assert.ok(y >= 0.05); prev = y; }
  // the generated barrier stays out of the joining strip's way
  const gap = onJoiningRun(runs);
  assert.ok(gap(0, 19) && !gap(30, 19));
});
