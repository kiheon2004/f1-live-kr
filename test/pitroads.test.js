// A pit lane's roads from surveyed lines (pitroads.js): the lane beyond the garages eased from the road's height to the
// garages' floor, the entry and exit roads at the ground's height (none of them inside the lane), the lane's paint at its
// surveyed distance from the door line – not where a garage's front stands in it. Spa-Francorchamps' plan (v0.70).
const test = require("node:test");
const assert = require("node:assert");

// "lat, lon" = [z, x]: a lane 100 m long along +x, the garages on the −z side, the track on +z
const toXZ = ([la, lo]) => [lo, la];
const edge = (v, us) => us.map((u) => [v, u]);
const us = (a, b) => { const o = []; for (let u = a; u <= b; u += 5) o.push(u); return o; };
const plan = () => ({
  lane: { doors: [[0, 0], [0, 100]], width: 11, bands: [[2.4, 2.55, "white"], [6.0, 6.2, "white"], [6.2, 7.7, "red"], [7.7, 7.9, "white"]] }, edgeLine: 0.15,
  entry: { left: edge(8, us(-60, 10)), right: edge(2, us(-60, 10)) }, exit: { left: edge(9, us(95, 160)), right: edge(4, us(95, 160)) },
});
// eight garages 10 m wide, fronts on the door line – the middle two 3 m out in the lane; floors at 5, the ground at 2
const slots = () => [15, 25, 35, 45, 55, 65, 75, 85].map((u) => ({ front: [u, u === 45 || u === 55 ? 3 : 0], inward: [0, -1], width: 10, floor: 5, w: 11 }));
const verts = (m) => { const o = []; for (let i = 0; i < m.pos.length; i += 3) o.push([m.pos[i], m.pos[i + 1], m.pos[i + 2]]); return o; };

test("pitRoads: the lane beyond the garages, the entry and the exit road, the paint", async () => {
  const { pitRoads } = await import("../src/renderer/pitroads.js");
  const r = pitRoads(plan(), toXZ, () => 2, slots());
  assert.deepStrictEqual(r.info, { lane: 100, ends: [0, 100], run: [15, 85], entry: 13, exit: 13, more: 0, fronts: [0, 3], face: [11, 14, 11] });
  for (const m of [r.tarmac, r.white, r.red]) { assert.ok(m.pos.every(Number.isFinite) && m.pos.length % 3 === 0); assert.ok(m.idx.length % 3 === 0 && m.idx.every((i) => i >= 0 && i < m.pos.length / 3)); }
  assert.strictEqual(r.tarmac.uv.length / 2, r.tarmac.pos.length / 3);
  // the strips' sides: under every edge point a point 0.5 m lower
  assert.ok(r.skirt.pos.length % 6 === 0 && r.skirt.idx.length % 3 === 0 && r.skirt.idx.every((i) => i < r.skirt.pos.length / 3));
  for (let i = 0; i < r.skirt.pos.length; i += 6) assert.ok(r.skirt.pos[i] === r.skirt.pos[i + 3] && r.skirt.pos[i + 2] === r.skirt.pos[i + 5] && Math.abs(r.skirt.pos[i + 1] - r.skirt.pos[i + 4] - 0.5) < 1e-9);
  // …and every triangle of a side lies along ONE edge of its strip, never across the road (the entry road's edges: z 2 and 8)
  { const K = verts(r.skirt); let n = 0; for (let i = 0; i < r.skirt.idx.length; i += 3) { const tr = [0, 1, 2].map((k) => K[r.skirt.idx[i + k]]); if (!tr.every(([x]) => x < -4.99)) continue; n++; assert.ok(tr.every(([, , z]) => z === 2) || tr.every(([, , z]) => z === 8), JSON.stringify(tr)); } assert.strictEqual(n, 11 * 2 * 2, "both edges of the entry road's eleven outer steps have a side"); }
  const T = verts(r.tarmac);
  // the entry road: 13 sections up to the lane's start – none inside it –, each at the ground's height
  const inEntry = T.filter(([x]) => x < -0.01), inExit = T.filter(([x]) => x > 100.01);
  assert.strictEqual(inEntry.length, 12 * 3); assert.strictEqual(inExit.length, 12 * 3);
  // …and each joined to the lane's own first / last row, the lane's whole width (−0.3 … 11 m from the doors), no gap between
  for (const u of [0, 100]) { const row = T.filter(([x]) => Math.abs(x - u) < 1e-9).map(([, , z]) => z); assert.ok(row.includes(-0.3) && row.includes(11), `the lane's row at ${u}: ${row}`); }
  // (a triangle of the tarmac has a corner on the road's own edge – z 8, its last section at the lane's start – and one on
  // the lane's row there, z 11: the road widens into the lane's whole width)
  { let joined = false; for (let i = 0; i < r.tarmac.idx.length; i += 3) { const tr = [0, 1, 2].map((k) => T[r.tarmac.idx[i + k]]); if (tr.some(([x, , z]) => x === 0 && z === 8) && tr.some(([x, , z]) => x === 0 && z === 11)) joined = true; } assert.ok(joined, "the entry road's last section is joined to the lane's row"); }
  assert.ok([...inEntry, ...inExit].every(([, y]) => y === 2));
  // the lane from its start to the first garage's middle: from the road's height to the garages' floor, never stepping down
  const fill = T.filter(([x, , z]) => x >= 0 && x <= 15 && z < 0).sort((a, b) => a[0] - b[0]);
  assert.ok(fill.length >= 3 && fill[0][1] === 2 && Math.abs(fill[fill.length - 1][1] - 5.004) < 1e-9);
  assert.ok(fill.every((p, i) => !i || p[1] >= fill[i - 1][1]));
  // …and nothing of it between the first and the last garage's middle: that is the app's own lane surface
  assert.ok(T.every(([x]) => x <= 15 + 1e-9 || x >= 85 - 1e-9));
  // the red band along the whole lane (21 sections), on the garages' floor within the run
  assert.strictEqual(r.red.pos.length, 21 * 2 * 3); assert.strictEqual(r.red.idx.length, 20 * 6);
  const R = verts(r.red); assert.ok(R.every(([, , z]) => Math.abs(z - 6.2) < 1e-9 || Math.abs(z - 7.7) < 1e-9));
  assert.ok(R.filter(([x]) => x >= 15 && x <= 85).every(([, y]) => Math.abs(y - 5.012) < 1e-9));
  // the thin white line 2.4 m before the doors: not where the two middle garages stand 3 m out
  const thin = verts(r.white).filter(([, , z]) => Math.abs(z - 2.4) < 1e-9).map(([x]) => x);
  assert.ok(thin.includes(40) && thin.includes(65) && !thin.some((x) => x > 40 && x <= 60));
  // …and no triangle of it spans that gap
  const W = verts(r.white); for (let i = 0; i < r.white.idx.length; i += 3) { const t = [0, 1, 2].map((k) => W[r.white.idx[i + k]]); if (t.every(([, , z]) => z > 2.3 && z < 2.6)) assert.ok(Math.max(...t.map((p) => p[0])) - Math.min(...t.map((p) => p[0])) <= 5 + 1e-9); }
  // the roads' white edge lines: just inside each edge, 0.15 m wide
  assert.ok(W.some(([x, , z]) => x < 0 && Math.abs(z - 2.05) < 1e-9) && W.some(([x, , z]) => x < 0 && Math.abs(z - 7.95) < 1e-9));
});

test("pitRoads: the lane's ends follow the ground's own height, the garages' floors between them", async () => {
  const { pitRoads, roadHeight, ROAD_LIFT } = await import("../src/renderer/pitroads.js");
  const s = slots().map((x, i) => ({ ...x, floor: 5 + i * 0.5 }));
  const r = pitRoads(plan(), toXZ, (x) => 1 + x * 0.05, s), T = verts(r.tarmac);
  const at = (u) => T.filter(([x, , z]) => Math.abs(x - u) < 1e-9 && z < 0)[0][1];
  assert.ok(Math.abs(at(0) - 1) < 1e-9 && Math.abs(at(15) - 5.004) < 1e-9 && Math.abs(at(85) - 8.504) < 1e-9 && Math.abs(at(100) - 6) < 1e-9);
  // a road's height: the track's right by it, the terrain's from 25 m out; 2 cm over an auxiliary road's
  assert.ok(Math.abs(roadHeight(10, 4, 5) - (10 - 0.03 + ROAD_LIFT)) < 1e-9 && Math.abs(roadHeight(10, 4, 30) - (4.08 + ROAD_LIFT)) < 1e-9 && Math.abs(roadHeight(null, 4, Infinity) - (4.05 + ROAD_LIFT)) < 1e-9);
  assert.ok(roadHeight(3, 9, 5) >= 9.08, "never under the terrain");
});

test("Spa-Francorchamps' pit roads: the lane 300 m between the door line's ends, the entry road round the Bus Stop, the exit road inside La Source", async () => {
  const { PIT_ROADS } = await import("../src/renderer/pitroads.js");
  const P = PIT_ROADS[7]; assert.ok(P && /Esri World Imagery/.test(P.src));
  const KY = 111200, KX = 111320 * Math.cos((50.4435 * Math.PI) / 180), xz = ([la, lo]) => [(lo - 5.9665) * KX, -(la - 50.443) * KY], d = (a, b) => Math.hypot(xz(a)[0] - xz(b)[0], xz(a)[1] - xz(b)[1]);
  const L = d(P.lane.doors[0], P.lane.doors[1]); assert.ok(L > 299 && L < 301, String(L));
  assert.strictEqual(P.lane.width, 11); assert.deepStrictEqual(P.lane.bands.map((b) => b[2]), ["white", "white", "red", "white"]);
  assert.ok(P.lane.bands.every(([a, b]) => a < b && b <= 7.9), "the paint ends where the fast lane (7.9 … 11.0 m) begins");
  for (const [k, n] of [["entry", 91], ["exit", 66]]) {
    const R = P[k]; assert.strictEqual(R.left.length, n); assert.strictEqual(R.right.length, n);
    for (let i = 0; i < n; i++) { const w = d(R.left[i], R.right[i]); assert.ok(w > 2.5 && w < 17, `${k} ${i}: ${w.toFixed(1)} m wide`); if (i) assert.ok(d(R.left[i], R.left[i - 1]) < 12 && d(R.right[i], R.right[i - 1]) < 12, `${k} ${i}`); }
  }
  // the entry road ends, the exit road begins at the lane's ends
  const mid = (R, i) => [(R.left[i][0] + R.right[i][0]) / 2, (R.left[i][1] + R.right[i][1]) / 2];
  assert.ok(d(mid(P.entry, 90), P.lane.doors[0]) < 16 && d(mid(P.exit, 0), P.lane.doors[1]) < 16);
});

test("onPitRoads: a point on a surveyed road, a metre inside its edges – a mapped barrier there is cut", async () => {
  const { onPitRoads } = await import("../src/renderer/pitroads.js");
  const on = onPitRoads(plan(), toXZ);
  assert.ok(on(-30, 5) && on(-30, 5, 1) && on(130, 6.5, 1), "the middle of the entry road (z 2 … 8) and of the exit road (z 4 … 9)");
  assert.ok(on(-30, 2.5) && !on(-30, 2.5, 1) && !on(-30, 7.6, 1), "within a metre of an edge: on it, not a metre inside");
  assert.ok(!on(-30, 1.9) && !on(-30, 8.1) && !on(50, 5) && !on(-70, 5) && !on(170, 6), "beside it, in the lane between them, beyond their ends");
});

test("pitRoads: a lane longer than its door line, bands over part of it, a line across, more tarmac, painted lines, a striped field", async () => {
  const { pitRoads } = await import("../src/renderer/pitroads.js");
  const pl = { ...plan(), edgeLine: 0,
    lane: { doors: [[0, 0], [0, 100]], span: 200, u: [-20, 260], width: 11, bands: [[0, 5.5, "concrete", 0, 100], [5.5, 5.8, "white"]], cross: [[-20, 0, 11, 0.5, "white"]] },
    entry: { left: edge(8, us(-60, -15)), right: edge(2, us(-60, -15)) }, exit: { left: edge(9, us(125, 160)), right: edge(4, us(125, 160)) },
    tarmac: [{ left: edge(20, us(0, 100)), right: edge(13, us(0, 100)) }],
    lines: [{ pts: [[9, 130], [9, 160]], width: 0.2, dash: [3, 2] }, { pts: [[30, 40], [30, 80]], width: 0.2, onTrack: true }],
    hatch: [{ poly: [[3, -50], [6, -20], [0, -20]], c: [1, 0], period: 10, stripes: [[0, 4, "red"], [5, 9, "green"]], rest: "white" }] };
  // (span 200 for a door line 100 m long here: the survey's metres are twice this scene's – the lane from −10 to 130)
  const r = pitRoads(pl, toXZ, () => 2, slots(), (x, z) => (z > 25 ? 7 : null));
  assert.deepStrictEqual(r.info.ends, [-10, 130]); assert.strictEqual(r.info.more, 21); assert.strictEqual(r.info.entry, 10); assert.strictEqual(r.info.exit, 7);
  const T = verts(r.tarmac);
  assert.ok(T.some(([x, , z]) => Math.abs(x + 10) < 1e-9 && z === 11) && T.some(([x, , z]) => Math.abs(x - 130) < 1e-9 && z === -0.3), "the lane's rows at its own ends, not the door line's");
  // the roads are joined to those rows: the entry's last section (at −15, edge z 8) to the lane's row at −10 (z 11) – 5 m the
  // lane's own surface does not cover –, the exit's first (at 130, edge z 9) to the lane's row there
  const tri = (p, q) => { for (let i = 0; i < r.tarmac.idx.length; i += 3) { const tr = [0, 1, 2].map((k) => T[r.tarmac.idx[i + k]]); if (tr.some(([x, , z]) => Math.abs(x - p[0]) < 1e-9 && z === p[1]) && tr.some(([x, , z]) => Math.abs(x - q[0]) < 1e-9 && z === q[1])) return true; } return false; };
  assert.ok(tri([-15, 8], [-10, 11]) && tri([-15, 2], [-10, -0.3]), "the entry road reaches the lane's start");
  assert.ok(tri([130, 9], [130, 11]) && tri([130, 4], [130, -0.3]), "the exit road begins at the lane's end");
  assert.ok(T.filter(([, , z]) => z >= 13 && z <= 20).length >= 21 * 3, "the further strip, beside the lane, is laid whole");
  // the concrete band: from the doors (not from a garage front that stands 3 m out), over the first half only (0 … 100 survey metres = 0 … 50)
  const C = verts(r.paint.concrete); assert.ok(C.length && C.every(([x]) => x >= -1e-9 && x <= 50 + 1e-9));
  assert.ok(C.some(([x, , z]) => x < 40 && Math.abs(z - 0.05) < 1e-9) && C.some(([x, , z]) => x > 41 && Math.abs(z - 3.05) < 1e-9), "it begins at each garage's front");
  assert.ok(C.every(([, y]) => y < 5.011), "under the white lines' height");
  // the line across the lane's start; the broken line in pieces of 3 m; a line on the track's surface where the track is
  const Wt = verts(r.white); assert.ok(Wt.some(([x, , z]) => Math.abs(x + 10.25) < 1e-9 && z === 0) && Wt.some(([x, , z]) => Math.abs(x + 9.75) < 1e-9 && Math.abs(z - 10.9) < 1e-9), "across the lane, to its end (0.1 m before the walkway)");
  const dashX = [...new Set(Wt.filter(([, , z]) => Math.abs(z - 8.9) < 1e-9).map(([x]) => +x.toFixed(2)))].sort((a, b) => a - b);
  assert.deepStrictEqual(dashX.filter((x) => x <= 143.01), [130, 133, 135, 138, 140, 143]);
  { const on = Wt.filter(([x, , z]) => z > 29 && x >= 40 && x <= 80); assert.ok(on.length >= 80 && on.every(([, y]) => Math.abs(y - 7.006) < 1e-9), "on the track's own surface, a point every metre"); }
  // the striped field: red, green and white pieces inside the triangle
  // (the field: (−50, 3), (−20, 6), (−20, 0) – every painted point within its three sides)
  const inTri = ([x, , z]) => x <= -20 + 1e-6 && z - 3 <= (x + 50) / 10 + 1e-6 && 3 - z <= (x + 50) / 10 + 1e-6;
  assert.ok(verts(r.paint.red).length >= 3 && verts(r.paint.red).every(inTri) && verts(r.paint.green).length >= 3 && verts(r.paint.green).every(inTri));
  for (const m of Object.values(r.paint)) assert.ok(m.pos.every(Number.isFinite) && m.idx.every((i) => i < m.pos.length / 3));
});

test("Monza's pit roads: the lane from the control line to the wall's end, the entry lane with its striped wedge, the exit apron and its lines", async () => {
  const { PIT_ROADS, onPitRoads } = await import("../src/renderer/pitroads.js");
  const P = PIT_ROADS[39]; assert.ok(P && /Esri World Imagery/.test(P.src));
  const KY = 111200, KX = 111320 * Math.cos((45.6175 * Math.PI) / 180), xz = ([la, lo]) => [(lo - 9.2811) * KX, -(la - 45.6163) * KY], d = (a, b) => Math.hypot(xz(a)[0] - xz(b)[0], xz(a)[1] - xz(b)[1]);
  const Ld = d(P.lane.doors[0], P.lane.doors[1]); assert.ok(Math.abs(Ld - 230.4) < 1.5, String(Ld));
  assert.deepStrictEqual(P.lane.u, [-11.2, 320]); assert.strictEqual(P.lane.span, 230.4); assert.strictEqual(P.lane.width, 11.5); assert.strictEqual(P.edgeLine, 0);
  assert.deepStrictEqual(P.lane.bands.map((b) => b[2]), ["concrete", "white", "white", "white"]); assert.ok(P.lane.bands.every(([a, b]) => a < b && b <= 11.5)); assert.strictEqual(P.lane.cross[0][0], -11.2);
  for (const [R, n] of [[P.entry, 59], [P.exit, 34], [P.tarmac[0], 89]]) {
    assert.strictEqual(R.left.length, n); assert.strictEqual(R.right.length, n);
    // (the exit apron's last four sections run in to a point on the track's edge line: the survey ends there)
    for (let i = 1; i < n; i++) { const w = d(R.left[i], R.right[i]), taper = R === P.exit && i >= n - 4; assert.ok((taper || w > 0.5) && w < 18, `${i}: ${w.toFixed(1)} m wide`); assert.ok(d(R.left[i], R.left[i - 1]) < 9 && d(R.right[i], R.right[i - 1]) < 9, String(i)); }
  }
  assert.ok(d(P.exit.left[33], P.exit.right[33]) < 0.01 && d(P.exit.left[29], P.exit.right[29]) > 3, "the exit apron ends in a point");
  assert.ok(d(P.entry.left[0], P.entry.right[0]) < 0.01, "the entry lane begins at a point on the track's edge");
  assert.strictEqual(P.lines.length, 8); assert.ok(P.lines[0].dash && P.lines.filter((l) => l.onTrack).length === 1 && P.lines.every((l) => l.pts.length >= 2 && l.width > 0.1 && l.width < 0.3));
  const h = P.hatch[0]; assert.ok(h.poly.length === 3 && h.period === 15 && h.rest === "white" && h.stripes.map((s) => s[2]).join() === "red,green");
  // a point in the middle of the entry lane and of the old lane's tarmac is on a surveyed road
  const mid = (R, i) => [(R.left[i][0] + R.right[i][0]) / 2, (R.left[i][1] + R.right[i][1]) / 2], on = onPitRoads(P, (p) => xz(p));
  assert.ok(on(...xz(mid(P.entry, 30)), 1) && on(...xz(mid(P.tarmac[0], 60)), 1) && on(...xz(mid(P.exit, 15)), 1));
});

test("pitRoads: nothing is painted past this app's own wall; a road's own edge lines", async () => {
  const { pitRoads } = await import("../src/renderer/pitroads.js");
  // the wall 9 m from the fronts (the track lies nearer than the surveyed lane is wide): a band 6 … 12 m ends at the wall,
  // a line at 10 m is left out along the garages, a line at 5 m stays
  const pl = { ...plan(), edgeLine: 0, lane: { doors: [[0, 0], [0, 100]], width: 14, bands: [[6, 12, "concrete"], [10, 10.2, "white"], [5, 5.2, "white"]], cross: [[30, 0, 13, 0.5, "white"]] }, exit: { edgeLine: 0.15, left: edge(9, us(95, 160)), right: edge(4, us(95, 160)) },
    lines: [{ pts: [[7, 50], [13.5, 50]], width: 0.4 }] };
  const sl = slots().map((s) => ({ ...s, front: [s.front[0], 0], w: 9 }));
  const r = pitRoads(pl, toXZ, () => 2, sl), C = verts(r.paint.concrete), Wt = verts(r.white);
  assert.ok(C.length && Math.abs(Math.max(...C.map(([, , z]) => z)) - 8.9) < 1e-9, "the band ends 0.1 m before the wall's face");
  assert.ok(!Wt.some(([, , z]) => Math.abs(z - 10) < 1e-9) && Wt.some(([, , z]) => Math.abs(z - 5) < 1e-9));
  // a line across the lane (painted, or `cross`) ends at the lane's end too: at 50 from z 7 to 8.9, at 30 from 0 to 8.9
  const at50 = Wt.filter(([x]) => Math.abs(Math.abs(x - 50) - 0.2) < 1e-9), at30 = Wt.filter(([x]) => Math.abs(Math.abs(x - 30) - 0.25) < 1e-9);
  assert.ok(at50.length && Math.abs(Math.min(...at50.map(([, , z]) => z)) - 7) < 1e-9 && Math.max(...at50.map(([, , z]) => z)) <= 8.9 + 1e-9 && Math.max(...at50.map(([, , z]) => z)) > 8.3);
  assert.ok(at30.some(([, , z]) => z === 0) && Math.abs(Math.max(...at30.map(([, , z]) => z)) - 8.9) < 1e-9);
  // the exit road carries edge lines (its own `edgeLine`), the entry road none
  assert.ok(Wt.some(([x, , z]) => x > 100 && Math.abs(z - 4.05) < 1e-9) && !Wt.some(([x]) => x < 0));
});

test("Zandvoort's pit roads: the lane from the passage's mouth to the wall's end, the entry behind the fence, the exit round the inside of the Tarzanbocht", async () => {
  const { PIT_ROADS } = await import("../src/renderer/pitroads.js");
  // (carried over from the chat side's zandvoort_pitlane.json, version 2.1 – track/run/zan_roads2.py)
  const P = PIT_ROADS[55]; assert.ok(P && /zandvoort_pitlane\.json, version 2\.1/.test(P.src));
  const KY = 111200, KX = 111320 * Math.cos((52.389 * Math.PI) / 180), xz = ([la, lo]) => [(lo - 4.5413) * KX, -(la - 52.389) * KY], d = (a, b) => Math.hypot(xz(a)[0] - xz(b)[0], xz(a)[1] - xz(b)[1]);
  assert.ok(Math.abs(d(P.lane.doors[0], P.lane.doors[1]) - 155.6) < 1, "the old block's door line"); assert.strictEqual(P.lane.span, 155.6); assert.strictEqual(P.lane.width, 15.1);
  assert.deepStrictEqual(P.lane.bands.map((b) => b[2]), ["concrete", "concrete", "red", "white", "white"]);
  // the paint in its order out from the doors, none over another: the red line, the white one beside it, the fast lane's concrete, the white line
  const [fastB, , redB, rwB, lineB] = P.lane.bands; assert.ok(redB[0] < redB[1] && redB[1] <= rwB[0] && rwB[1] <= fastB[0] && fastB[1] <= lineB[0] && lineB[1] < P.lane.width);
  assert.deepStrictEqual(P.lane.fast, [fastB[0], fastB[1]]);
  assert.strictEqual(P.entry.left.length, 73); assert.strictEqual(P.entry.right.length, 73); assert.strictEqual(P.exit.left.length, 49); assert.strictEqual(P.exit.right.length, 49);
  assert.ok(d(P.entry.left[0], P.entry.right[0]) < 1.5, "the entry lane opens narrow: the wall's foot stands a metre behind the track's line, the lane's edge 0.25 m under the track");
  for (let i = 1; i < 49; i++) { const w = d(P.exit.left[i], P.exit.right[i]); assert.ok(w > 3.5 && w < 7, `exit ${i}: ${w.toFixed(1)} m wide`); assert.ok(d(P.exit.left[i], P.exit.left[i - 1]) < 9, String(i)); }   // (5 m apart as surveyed; 8 m once, where its edge takes up the track's solid line)
  // the exit road comes back past its own start, 60 – 70 m to the side: round the inside of the corner
  const back = d(P.exit.left[48], P.exit.left[0]); assert.ok(back > 55 && back < 75, String(back));
  assert.strictEqual(P.lines.length, 6); assert.ok(P.lines.filter((l) => l.onTrack && !l.dash && l.width === 0.25).length === 1, "the line inside the track before the entry: solid on the 2026 photograph");
});

