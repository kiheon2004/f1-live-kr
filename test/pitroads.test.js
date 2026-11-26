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
  assert.deepStrictEqual(r.info, { lane: 100, ends: [0, 100], run: [15, 85], entry: 13, exit: 13, more: 0, fronts: [0, 3] });
  for (const m of [r.tarmac, r.white, r.red]) { assert.ok(m.pos.every(Number.isFinite) && m.pos.length % 3 === 0); assert.ok(m.idx.length % 3 === 0 && m.idx.every((i) => i >= 0 && i < m.pos.length / 3)); }
  assert.strictEqual(r.tarmac.uv.length / 2, r.tarmac.pos.length / 3);
  // the strips' sides: under every edge point a point 0.5 m lower
  assert.ok(r.skirt.pos.length % 6 === 0 && r.skirt.idx.length % 3 === 0 && r.skirt.idx.every((i) => i < r.skirt.pos.length / 3));
  for (let i = 0; i < r.skirt.pos.length; i += 6) assert.ok(r.skirt.pos[i] === r.skirt.pos[i + 3] && r.skirt.pos[i + 2] === r.skirt.pos[i + 5] && Math.abs(r.skirt.pos[i + 1] - r.skirt.pos[i + 4] - 0.5) < 1e-9);
  const T = verts(r.tarmac);
  // the entry road: 13 sections up to the lane's start – none inside it –, each at the ground's height
  const inEntry = T.filter(([x]) => x < -0.01), inExit = T.filter(([x]) => x > 100.01);
  assert.strictEqual(inEntry.length, 12 * 3); assert.strictEqual(inExit.length, 12 * 3);
  // …and each joined to the lane's own first / last row, the lane's whole width (−0.3 … 11 m from the doors), no gap between
  for (const u of [0, 100]) { const row = T.filter(([x]) => Math.abs(x - u) < 1e-9).map(([, , z]) => z); assert.ok(row.includes(-0.3) && row.includes(11), `the lane's row at ${u}: ${row}`); }
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

