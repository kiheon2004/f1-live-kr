// The track from surveyed lines (trackedges.js): the edges are the surveyed ones wherever both were met, eased from the
// measured ones at a surveyed stretch's ends; a session on another reference line gets none of it.
const test = require("node:test");
const assert = require("node:assert");

const id = (p) => p;
// samples the way map3d.js buildWorld makes them: tangent from the neighbours, the normal (−tan.z, tan.x) – to the cars'
// right with x east and z south
function samplesOf(pts, closed = false, L = 7, R = -7) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const tan = { x: (b[0] - a[0]) / l, z: (b[1] - a[1]) / l };
    return { i, p: { x: p[0], z: p[1] }, nor: { x: -tan.z, z: tan.x }, L, R, M: 0 };
  });
}
// a straight track going east, 2 m between samples: the cars' right is +z (south)
const straight = (n = 300) => samplesOf(Array.from({ length: n }, (_, i) => [i * 2, 0]));
const line = (x0, x1, z, step = 10) => Array.from({ length: Math.round((x1 - x0) / step) + 1 }, (_, i) => [x0 + i * step, z]);

test("a surveyed stretch: its edges where both lines are met, eased from the measured ones over 25 m at its ends", async () => {
  const { applyTrackEdges } = await import("../src/renderer/trackedges.js");
  const S = straight();
  // the real road: its right edge 5 m to the cars' right of the lap line, its left edge 8 m to their left – from x 200 to 400
  const r = applyTrackEdges(S, { edges: { right: line(200, 400, 5), left: line(200, 400, -8), open: true } }, id);
  const at = (x) => S[x / 2];
  assert.deepStrictEqual([at(300).L, at(300).R, at(300).sv], [5, -8, 1], "inside it: the surveyed edges, 13 m apart, not round the lap line");
  assert.deepStrictEqual([at(150).L, at(150).R, at(450).L, at(450).R], [7, -7, 7, -7], "beyond it: as measured");
  assert.ok(!at(150).sv && !at(450).sv);
  assert.ok(at(210).L < 7 && at(210).L > 5 && at(210).R < -7 && at(210).R > -8 && at(210).sv > 0 && at(210).sv < 1, "in the first 25 m: between the two");
  for (let i = 1; i < S.length; i++) assert.ok(Math.abs(S[i].L - S[i - 1].L) < 0.3 && Math.abs(S[i].R - S[i - 1].R) < 0.3, "no step in an edge");
  assert.strictEqual(r.changed, 101); assert.ok(r.full > 70 && r.full < 101);
  assert.deepStrictEqual([r.missed, r.outside, r.folds], [0, 0, 0]); assert.deepStrictEqual(r.width, [13, 13]);
});

test("the whole lap surveyed: every sample takes the surveyed edges; a lap line outside the track is counted, not refused", async () => {
  const { applyTrackEdges } = await import("../src/renderer/trackedges.js");
  // a clockwise lap of 200 m radius (x east, z south): the cars' right is the inside
  const ring = (rad, n) => Array.from({ length: n }, (_, i) => [rad * Math.cos((i / n) * 2 * Math.PI), rad * Math.sin((i / n) * 2 * Math.PI)]);
  const S = samplesOf(ring(200, 628), true);
  const r = applyTrackEdges(S, { edges: { right: ring(196, 90), left: ring(209, 90) } }, id);
  assert.strictEqual(r.changed, 628); assert.strictEqual(r.full, 628); assert.deepStrictEqual([r.missed, r.outside, r.folds], [0, 0, 0]);
  for (const s of S) { assert.ok(Math.abs(s.L - 4) < 0.15 && Math.abs(s.R + 9) < 0.15, "4 m to the inside edge, 9 m to the outside one (the survey's straight pieces: within 0.15 m)"); assert.strictEqual(s.sv, 1); }
  // the same lap line 2 m inside the track's inside edge: both edges on its left
  const O = samplesOf(ring(200, 628), true), o = applyTrackEdges(O, { edges: { right: ring(202, 90), left: ring(214, 90) } }, id);
  assert.strictEqual(o.outside, 628);
  for (const s of O) { assert.ok(s.L < -1.8 && s.L > -2.2 && s.R < -13.8 && s.R > -14.2); assert.ok(s.M <= s.L && s.M >= s.R, "the cars' line is kept on the tarmac"); }
});

test("sections marked low keep the measured edges; a line met on one side only, or another part of the track, changes nothing", async () => {
  const { applyTrackEdges } = await import("../src/renderer/trackedges.js");
  const S = straight();
  // sections 10 m apart from x 100: sections 10 … 14 (x 200 … 240) are under trees
  const r = applyTrackEdges(S, { edges: { right: line(100, 400, 5), left: line(100, 400, -8), open: true }, low: [[10, 14]] }, id);
  const at = (x) => S[x / 2];
  for (let x = 192; x <= 248; x += 2) assert.deepStrictEqual([at(x).L, at(x).R], [7, -7], "x " + x + ": the measured edges (the pieces touching a low section too)");
  assert.deepStrictEqual([at(150).L, at(150).R, at(320).L, at(320).R], [5, -8, 5, -8]); assert.strictEqual(r.missed, 0);
  // only the right edge surveyed along x 100 … 200
  const one = straight(), q = applyTrackEdges(one, { edges: { right: line(100, 400, 5), left: line(250, 400, -8).concat(line(410, 550, -8)), open: true } }, id);
  assert.deepStrictEqual([one[75].L, one[75].R], [7, -7]); assert.ok(q.missed > 60, "counted: the survey has a side missing there");
  // the survey's lines running against the cars (the other leg of a hairpin, 20 m away) are not this stretch's edges
  const back = straight(), b = applyTrackEdges(back, { edges: { right: line(100, 400, 25).reverse(), left: line(100, 400, 12).reverse(), open: true } }, id);
  assert.strictEqual(b.changed, 0); assert.deepStrictEqual([back[120].L, back[120].R], [7, -7]);
  // lines further off than the reach, and no data at all
  assert.strictEqual(applyTrackEdges(straight(), { edges: { right: line(100, 400, 60), left: line(100, 400, 40), open: true } }, id).changed, 0);
  assert.strictEqual(applyTrackEdges(straight(), null, id).changed, 0); assert.strictEqual(applyTrackEdges(straight(), { edges: { left: [[0, 0]], right: [[0, 1]] } }, id).changed, 0);
});

test("an edge that runs backwards is reported: its offset is beyond the lap line's centre of curvature", async () => {
  const { applyTrackEdges } = await import("../src/renderer/trackedges.js");
  // a tight right-hander of 5 m radius; the surveyed right edge is a straight line 8 m to the inside of its apex
  const arc = Array.from({ length: 31 }, (_, i) => { const th = -0.6 + i * 0.04; return [5 * Math.cos(th), 5 * Math.sin(th)]; });
  const S = samplesOf(arc), outer = Array.from({ length: 31 }, (_, i) => { const th = -0.6 + i * 0.04; return [12 * Math.cos(th), 12 * Math.sin(th)]; });
  const r = applyTrackEdges(S, { edges: { right: [[-3, -6], [-3, 0], [-3, 6]], left: [outer[0], outer[15], outer[30]], open: true } }, id, { ease: 1 });
  assert.ok(r.changed > 10 && r.folds > 5, JSON.stringify(r));
});

test("a session's lap on the stored reference line – and one whose frame has moved", async () => {
  const { lapOnRef } = await import("../src/renderer/trackedges.js");
  // a 4 km lap (decimetres): the stored line every 5 m, a car's lap every 20 m with 0.2 m of noise
  const P = (t, k = 1) => [k * (6000 * Math.cos(t) + 1500 * Math.cos(3 * t)), k * (4000 * Math.sin(t) + 900 * Math.sin(2 * t))];
  const ref = Array.from({ length: 800 }, (_, i) => P((i / 800) * 2 * Math.PI));
  let a = 5; const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647 - 0.5) * 4;
  const lap = Array.from({ length: 210 }, (_, i) => { const [x, y] = P(((i + 0.37) / 210) * 2 * Math.PI); return [x + rnd(), y + rnd(), 0]; });
  const same = lapOnRef(lap, ref);
  assert.ok(same.ok && same.p50 < 0.3 && same.p90 < 0.5, JSON.stringify(same));
  const moved = (dx, dy) => lapOnRef(lap.map(([x, y]) => [x + dx, y + dy, 0]), ref);
  assert.strictEqual(moved(30, 20).ok, false, "3.6 m: " + JSON.stringify(moved(30, 20)));
  assert.strictEqual(moved(150, 150).ok, false, "21 m (Suzuka 2023 → 2025)");
  assert.strictEqual(moved(4, -3).ok, true, "half a metre: the same frame");
  assert.strictEqual(lapOnRef([], ref).ok, false); assert.strictEqual(lapOnRef(lap, []).ok, false); assert.strictEqual(lapOnRef(null, null).ok, false);
});

test("which circuits have a surveyed track: switched on, and the season's layout", async () => {
  const { trackFor } = await import("../src/renderer/trackedges.js");
  const E = { left: [[0, 0], [1, 0]], right: [[0, 1], [1, 1]] };
  const T = { 55: { on: true, yr: [2020, null], edges: E }, 39: { on: false, edges: E }, 7: { on: true, yr: [2022, 2026], edges: E }, 2: { on: true, edges: { left: [], right: [] } } };
  assert.strictEqual(trackFor(55, 2026, T), T[55]); assert.strictEqual(trackFor(55, null, T), T[55]); assert.strictEqual(trackFor(55, 2019, T), null);
  assert.strictEqual(trackFor(39, 2026, T), null, "switched off"); assert.strictEqual(trackFor(7, 2027, T), null); assert.strictEqual(trackFor(7, 2022, T), T[7]);
  assert.strictEqual(trackFor(2, 2026, T), null, "no lines"); assert.strictEqual(trackFor(61, 2026, T), null); assert.strictEqual(trackFor(55, 2026, null), null);
});

test("the shipped data: every circuit's lines pair up, lie on its own reference line without a fold, and are 6 … 30 m apart", async () => {
  const { TRACKS, applyTrackEdges, lapOnRef } = await import("../src/renderer/trackedges.js");
  for (const [key, T] of Object.entries(TRACKS)) {
    assert.strictEqual(T.edges.left.length, T.edges.right.length, key + ": sections in pairs");
    assert.ok(T.ref.length >= 200 && Number.isFinite(T.fit.c) && Number.isFinite(T.fit.s) && Number.isFinite(T.fit.tx) && Number.isFinite(T.fit.ty) && T.fit.centre.length === 2, key + ": fit and reference line");
    const scale = Math.hypot(T.fit.c, T.fit.s); assert.ok(scale > 0.99 && scale < 1.01, key + ": the fit's scale " + scale);
    assert.ok(lapOnRef(T.ref.filter((_, i) => i % 3 === 0), T.ref).ok);
    // the reference line as a lap, 2 m between samples – its points joined by a smooth curve, as the app's lap line is (straight
    // pieces turn all at once at each point: 12 m inside Spa's La Source hairpin an edge then ran back by 0.25 m – a fold of
    // the test's own, tools/track.js tryEntry)
    const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    const pts = []; for (let i = 0; i < T.ref.length; i++) { const q = (k) => T.ref[(i + k + T.ref.length) % T.ref.length], a = q(0), b = q(1), l = Math.hypot(b[0] - a[0], b[1] - a[1]) / 10, m = Math.max(1, Math.round(l / 2)); for (let k = 0; k < m; k++) pts.push([cr(q(-1)[0], a[0], b[0], q(2)[0], k / m) / 10, -cr(q(-1)[1], a[1], b[1], q(2)[1], k / m) / 10]); }
    const S = samplesOf(pts, true), r = applyTrackEdges(S, T, ([X, Y]) => [X, -Y]);
    const facts = JSON.stringify({ ...r, broken: undefined });
    assert.strictEqual(r.folds, 0, key + ": " + facts);
    if (!T.edges.open) assert.ok(r.changed > S.length * 0.9, key + ": " + facts);
    assert.ok(r.width[0] >= 6 && r.width[1] <= 30, key + ": widths " + r.width);
  }
});

test("v0.71: no edge line along a step in a surveyed edge – only there, and never at an unsurveyed circuit", async () => {
  const { edgeSteps } = await import("../src/renderer/trackedges.js");
  // a pit lane's line ends: 4.6 m within 5 m, samples 2 m apart
  // (and the edge coming back in gently round the rest of the lap: no step)
  const e = [7, 7, 7, 7.46, 9.3, 11.14, 11.6, 11.6, 10.6, 9.6, 8.6, 7.6], sv = e.map(() => 1);
  // (the step itself lies between the samples 3 … 5; the line narrows over the sample before it and widens over the one after)
  assert.deepStrictEqual([...edgeSteps(e, sv)], [0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
  // an edge moving against the lap line in a corner (0.3 m a metre) is no step
  assert.ok(![...edgeSteps([7, 7.6, 8.2, 8.8, 9.4, 8.8, 8.2, 7.6], [1, 1, 1, 1, 1, 1, 1, 1])].some(Boolean));
  // not where either sample is unsurveyed (the measured edges of every other circuit: nothing changes there)
  assert.ok(![...edgeSteps(e, e.map(() => 0))].some(Boolean));
  assert.deepStrictEqual([...edgeSteps([7, 7, 12, 12], [1, 1, 0, 0])], [0, 0, 0, 0]);
  // the lap closes: the last sample's neighbour is the first
  assert.deepStrictEqual([...edgeSteps([12, 7, 7, 7, 7, 7], [1, 1, 1, 1, 1, 1])], [1, 1, 1, 0, 1, 1]);
  // the one sample more is never an unsurveyed one
  assert.deepStrictEqual([...edgeSteps([7, 7, 7, 12, 12, 12, 12, 7], [0, 1, 1, 1, 1, 0, 0, 0])], [0, 1, 1, 1, 1, 0, 0, 0]);
});

test("v0.71: a broken edge line – the painted pieces along a path, and which samples lie on the broken stretch", async () => {
  const { dashPieces, applyTrackEdges } = await import("../src/renderer/trackedges.js");
  // 1.1 m painted, 0.9 m bare along three pieces of 2 m: painted 0 … 1.1, 2 … 3.1, 4 … 5.1
  const r = dashPieces([2, 2, 2], 1.1, 0.9).map(([j, a, b]) => [j, +a.toFixed(3), +b.toFixed(3)]);
  assert.deepStrictEqual(r, [[0, 0, 0.55], [1, 0, 0.55], [2, 0, 0.55]]);
  // a painted stretch running over a joint comes in two; the paint adds up to its share of the path
  const q = dashPieces([1.5, 1.5, 3], 2, 1); const painted = [1.5, 1.5, 3].map((len, j) => q.filter((x) => x[0] === j).reduce((a, x) => a + (x[2] - x[1]) * len, 0));
  assert.ok(Math.abs(painted[0] - 1.5) < 1e-9 && Math.abs(painted[1] - 0.5) < 1e-9 && Math.abs(painted[2] - 2) < 1e-9, JSON.stringify(q));
  assert.deepStrictEqual(dashPieces([2, 2], 0, 1), []);
  // a straight track 100 m long, 12 m wide, sections every 5 m; the right line broken between sections 4 and 8 (20 … 40 m)
  const T = { edges: { left: [], right: [], open: true }, low: [], broken: { right: [[4, 8, 1.1, 0.9]] } };
  for (let i = 0; i <= 20; i++) { T.edges.left.push([i * 5, 6]); T.edges.right.push([i * 5, -6]); }
  const S = []; for (let i = 0; i < 50; i++) S.push({ i, p: { x: i * 2, z: 0 }, nor: { x: 0, z: 1 }, L: 7, R: -7 });
  const out = applyTrackEdges(S, T, ([X, Y]) => [X, -Y], { ease: 0 });
  assert.ok(out.broken && out.broken.right && !out.broken.left, JSON.stringify(Object.keys(out.broken || {})));
  const on = [...out.broken.right.mask].map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  assert.deepStrictEqual(on, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);   // the samples at 20 … 40 m
  // no `broken` in the data: nothing in the result
  assert.ok(!("broken" in applyTrackEdges(S.map((s) => ({ ...s, L: 7, R: -7, sv: 0 })), { ...T, broken: undefined }, ([X, Y]) => [X, -Y], { ease: 0 })));
});

test("v0.71: where the feed's own line lies beyond a surveyed edge (a kerb at an apex), the cars' line is not bent back inside it", async () => {
  const { racingLine } = await import("../src/renderer/smooth.js");
  // a straight lap line, 2 m a sample, the edges 6 m either side – and over five samples the edge on the +nor side comes
  // across the lap line by up to 1.04 m (Monza's first apex as surveyed)
  const dip = [-0.06, -0.81, -1.04, -0.73, -0.05], mk = (sv) => Array.from({ length: 400 }, (_, i) => ({ p: { x: 0, z: i * 2 }, nor: { x: 1, z: 0 }, L: i >= 200 && i < 205 ? dip[i - 200] : 6, R: -6, sv }));
  const a = racingLine(mk(1)), b = racingLine(mk(0));
  const step = (v) => Math.max(...Array.from(v).slice(1).map((x, i) => Math.abs(x - v[i])));
  assert.ok(Math.min(...a) > -0.15 && step(a) < 0.05, `surveyed: the line stays on the feed's (${Math.min(...a).toFixed(2)} m, step ${step(a).toFixed(2)})`);
  assert.ok(Math.min(...b) < -1.5, "an edge that is not surveyed: the margin holds, as before (" + Math.min(...b).toFixed(2) + " m)");
  // at most 1 m beyond the edge: a feed line 2.5 m outside is followed to 1 m outside only
  const far = Array.from({ length: 400 }, (_, i) => ({ p: { x: 0, z: i * 2 }, nor: { x: 1, z: 0 }, L: i >= 190 && i < 215 ? -2.5 : 6, R: -6, sv: 1 })), c = racingLine(far);
  assert.ok(Math.abs(c[202] + 1.5) < 0.05, String(c[202]));
});

test("v0.71: the room for traffic at a surveyed track comes in no faster than 0.2 m a metre, and reaches the cars' own line where that lies over an edge", async () => {
  const { trafficRoom } = await import("../src/renderer/trackedges.js");
  const n = 300, L = new Array(n).fill(7), R = new Array(n).fill(-7), line = new Array(n).fill(0), sv = new Array(n).fill(1);
  for (let i = 150; i < 170; i++) R[i] = -1.5;          // the far edge steps in by 5.5 m at one sample, and out again
  for (let i = 60; i < 65; i++) { L[i] = -1; line[i] = -0.2; }   // the near edge 1 m across the lap line, the cars' line 0.8 m over it
  const T = trafficRoom(L, R, line, sv, 2);
  const steps = (v) => Math.max(...Array.from(v).map((x, i) => Math.abs(v[(i + 1) % n] - x)));
  assert.ok(steps(T.L) <= 0.4 + 1e-9 && steps(T.R) <= 0.4 + 1e-9, `no more than 0.4 m from one sample to the next (${steps(T.L).toFixed(2)}, ${steps(T.R).toFixed(2)})`);
  assert.ok(Math.abs(T.R[150] + 1.5) < 1e-9 && Math.abs(T.R[160] + 1.5) < 1e-9 && Math.abs(T.R[145] + 3.5) < 1e-9 && Math.abs(T.R[120] + 7) < 1e-9, "the room narrows before the edge does, and is the edge where the edge is nearest");
  assert.ok(Math.abs(T.L[62] - 0.7) < 1e-9, "the cars' own line plus a car's half width less the allowance: " + T.L[62]);
  assert.ok(T.L.every((v, i) => v <= Math.max(L[i], line[i] + 0.9) + 1e-9) && T.R.every((v, i) => v >= Math.min(R[i], line[i] - 0.9) - 1e-9), "never more room than the edges give (but for the cars' own line)");
  // not surveyed: no room of its own
  const U = trafficRoom(L, R, line, new Array(n).fill(0), 2); assert.ok(U.L.every(Number.isNaN) && U.R.every(Number.isNaN));
});
