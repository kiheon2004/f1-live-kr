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

// v0.35: on the real map at Monza's first chicane (test/fixtures/monza-t1-roads.json: the track's samples and the map's
// lines there, scene metres, from the 2026 race's world) – the escape road beside the track is one strip joined at both
// ends, never on the track's tarmac, and the barrier opens only at its mouths (v0.34 opened it along the whole run).
test("other tarmac on the real map (Monza T1): one joined escape road, off the tarmac, open only at its mouths", async () => {
  const { auxRuns, ribbonEdges, onJoiningRun } = await import("../src/renderer/auxroads.js");
  const fx = require("./fixtures/monza-t1-roads.json");
  const S = fx.samples.map((s) => ({ i: s.i, p: { x: s.p[0], z: s.p[1] }, tan: { x: s.tan[0], z: s.tan[1] }, nor: { x: s.nor[0], z: s.nor[1] }, L: s.L, R: s.R }));
  const local = (x, z) => { let b = null, bd = Infinity; for (const s of S) { const d = Math.hypot(s.p.x - x, s.p.z - z); if (d < bd) { bd = d; b = s; } } if (!b || bd > 50) return null; const dx = x - b.p.x, dz = z - b.p.z; return { s: b, l: dx * b.nor.x + dz * b.nor.z, a: dx * b.tan.x + dz * b.tan.z }; };
  const T = { local, edge: (s, side) => (side > 0 ? s.L : s.R) };
  const runs = auxRuns(fx.lines, T);
  const len = (r) => r.pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - r.pts[i - 1][0], p[1] - r.pts[i - 1][1]) : 0), 0);
  const esc = runs.filter((r) => r.k === "raceway" && r.joins[0] && r.joins[1]).sort((a, b) => len(b) - len(a))[0];
  assert.ok(esc && len(esc) > 140, `the escape road: one run of ${esc && len(esc).toFixed(0)} m`);
  for (const r of runs) {
    const { left, right } = ribbonEdges(r, T);
    for (const p of left.concat(right)) { const q = local(p[0], p[1]); if (q && Math.abs(q.a) < 3) assert.ok(!(q.l < T.edge(q.s, 1) - 0.05 && q.l > T.edge(q.s, -1) + 0.05), `a strip's edge on the track's tarmac: ${p}`); }
  }
  const gap = onJoiningRun(runs), mid = esc.pts[Math.floor(esc.pts.length / 2)], end = esc.pts[1];
  assert.ok(gap(end[0], end[1]), "open at its mouth");
  assert.ok(!gap(mid[0], mid[1]), "closed along the middle of it");
});

test("other tarmac: the map's tracks (marshal roads) meeting the track are drawn; tunnels and bridges aren't laid on the ground", async () => {
  const { auxRuns } = await import("../src/renderer/auxroads.js");
  const marshal = { k: "path", sub: "track", w: 3, pts: [[10, 7], [10, 40]] };
  const tunnel = { k: "raceway", w: 12, tunnel: 1, pts: [[-50, 30], [50, 30]] };
  const bridge = { k: "raceway", w: 12, bridge: 1, pts: [[-50, -30], [50, -30]] };
  const footpath = { k: "path", sub: "footway", w: 2, pts: [[20, 7], [20, 40]] };
  assert.deepStrictEqual(auxRuns([marshal, tunnel, bridge, footpath], T).map((r) => r.sub), ["track"]);
});

// v0.35 audit (São Paulo, Jeddah, Sakhir, Lusail, Yas, Sepang): raceways that never meet the track – kart tracks, drag
// strips, old roads – were laid 12 m wide anywhere; a raceway over the app's own pit lane was laid twice
test("other tarmac: a raceway away from the track and not meeting it isn't drawn; one over the pit lane isn't laid again", async () => {
  const { auxRuns } = await import("../src/renderer/auxroads.js");
  const kart = { k: "raceway", w: 12, pts: [[0, 120], [200, 120], [200, 200]] };
  const bend = { k: "raceway", w: 12, pts: [[-60, 20], [0, 26], [60, 20]] };
  const pit = { k: "raceway", w: 12, pts: [[-100, -30], [100, -30]] };
  const runs = auxRuns([kart, bend, pit], T, { skip: (x, z) => z < -20 && z > -40 });
  assert.deepStrictEqual(runs.map((r) => r.pts[0][1]), [20], "only the other layout's bend close beside the track");
});

// v0.35 audit (Monza): a road crossing the lap on a bridge doesn't meet it – its pieces either side of the bridge aren't
// junctions (no barrier opened for them)
test("other tarmac: the approach to a bridge over the track isn't a junction", async () => {
  const { auxRuns } = await import("../src/renderer/auxroads.js");
  const ramp = { k: "raceway", w: 12, pts: [[30, 60], [30, 10]] }, deck = { k: "raceway", w: 12, bridge: 1, pts: [[30, 10], [30, -10]] };
  const runs = auxRuns([ramp, deck], T);
  assert.ok(runs.every((r) => !r.joins[0] && !r.joins[1]), JSON.stringify(runs.map((r) => r.joins)));
});
