// The scenario builder's pure geometry (src/game/tools/trackgeo.mjs) on shapes with known answers.
const test = require("node:test");
const assert = require("node:assert");
const G = () => import("../../src/game/tools/trackgeo.mjs");

const circle = (R, n0 = 97, jitter = 0) => { const X = [], Y = []; for (let i = 0; i < n0; i++) { const a = (2 * Math.PI * i) / n0; X.push(R * Math.cos(a) + jitter * Math.sin(i * 7.3)); Y.push(R * Math.sin(a) + jitter * Math.cos(i * 5.1)); } return { X, Y }; };

test("trackgeo: a closed polyline resampled evenly; curvature of a circle is 1/R and turns once", async () => {
  const g = await G(), R = 250, { X, Y } = circle(R, 400);
  const rs = g.resampleClosed(X, Y, null, 2);
  assert.ok(Math.abs(rs.n * rs.ds - rs.L) < 1e-9 && Math.abs(rs.ds - 2) < 0.01);
  for (let i = 0; i < rs.n; i++) { const j = (i + 1) % rs.n; assert.ok(Math.abs(Math.hypot(rs.x[j] - rs.x[i], rs.y[j] - rs.y[i]) - rs.ds) < 0.01); }
  const h = g.headings(rs.x, rs.y), k = g.curvature(h, rs.ds, 8);
  const mean = k.reduce((a, b) => a + b, 0) / k.length;
  assert.ok(Math.abs(mean - 1 / R) / (1 / R) < 0.01, `κ ${mean} vs ${1 / R}`);
  assert.ok(Math.abs(g.totalTurn(h) - 2 * Math.PI) < 1e-6);
  // clockwise: −2π and negative curvature (+ is left)
  const hc = g.headings(Array.from(rs.x).reverse(), Array.from(rs.y).reverse());
  assert.ok(Math.abs(g.totalTurn(hc) + 2 * Math.PI) < 1e-6);
});

test("trackgeo: smoothing keeps the mean and the integral of curvature; rotate is a cyclic shift", async () => {
  const g = await G();
  const a = Float64Array.from({ length: 200 }, (_, i) => Math.sin(i / 7) + (i % 13 === 0 ? 5 : 0));
  const s = g.smoothClosed(a, 4), sum = (v) => v.reduce((p, q) => p + q, 0);
  assert.ok(Math.abs(sum(a) - sum(s)) < 1e-9);
  assert.ok(Math.max(...s) < Math.max(...a), "spikes are spread");
  const r = g.rotate(a, 17); assert.strictEqual(r[0], a[17]); assert.strictEqual(r[199], a[16]);
});

test("trackgeo: the timing-line fit recovers the line and the feed's delay from places vs speeds", async () => {
  const g = await G();
  // reports: place = 120 m + v·0.45 s + noise; speeds from SC laps (30–45 m/s) and racing laps (70–90 m/s)
  const xs = [], ys = []; let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let i = 0; i < 600; i++) { const v = i % 4 === 0 ? 30 + 15 * (rnd() + 0.5) : 70 + 20 * (rnd() + 0.5); xs.push(v); ys.push(120 + 0.45 * v + 4 * rnd()); }
  const f = g.binnedFit(xs, ys, 8, 5);
  assert.ok(Math.abs(f.a - 120) < 3 && Math.abs(f.b - 0.45) < 0.05, `a ${f.a} b ${f.b}`);
  // no spread at all → no fit (the caller then uses the typical delay)
  assert.strictEqual(g.binnedFit(xs.map(() => 80), ys, 8, 5), null);
});

test("trackgeo: projection follows a car along its own stretch (hint) and reports + left", async () => {
  const g = await G(), { X, Y } = circle(200, 300);
  const rs = g.resampleClosed(X, Y, null, 2), h = g.headings(rs.x, rs.y), idx = new g.StationIndex(rs.x, rs.y, h, rs.ds);
  const p = idx.project(0, 195);                       // 5 m inside the anticlockwise circle at the top: left
  assert.ok(Math.abs(p.d - 5) < 0.1 && Math.abs(p.s - rs.L / 4) < 1);
  assert.strictEqual(idx.project(1000, 1000), null);
  // a hint far from the point: the far window is ignored and the right place found
  const q = idx.project(0, -205, 0); assert.ok(Math.abs(q.d + 5) < 0.1 && Math.abs(q.s - (3 * rs.L) / 4) < 1);
});

test("trackgeo: the minimum-curvature line uses the width – outside on a constant bend, straighter through a chicane", async () => {
  const g = await G();
  // constant bend: the flattest path is the largest radius = the outer (right, −) bound
  const { X, Y } = circle(150, 300), rs = g.resampleClosed(X, Y, null, 2), h = g.headings(rs.x, rs.y);
  const lo = new Float64Array(rs.n).fill(-5), hi = new Float64Array(rs.n).fill(5);
  const d = g.minCurvatureLine(rs.x, rs.y, h, rs.ds, lo, hi);
  assert.ok(d.every((v) => v >= -5 - 1e-9 && v <= 5 + 1e-9), "within bounds");
  assert.ok(d.reduce((a, b) => a + b, 0) / d.length < -4.5, "hugs the outside of a constant bend");
  // an S-bend on a long oval: the line's peak curvature through it is lower than the lap line's
  const P = []; for (let s = 0; s < 3000; s += 2) { const y = s < 1000 ? 12 * Math.sin((s / 1000) * 2 * Math.PI * 3) : 0; P.push([s, y]); }
  for (let a = 0; a <= Math.PI; a += 0.01) P.push([3000 + 300 * Math.sin(a), 300 - 300 * Math.cos(a)]);
  for (let s = 3000; s > 0; s -= 2) P.push([s, 600]);
  for (let a = 0; a <= Math.PI; a += 0.01) P.push([-300 * Math.sin(a), 600 - 300 + 300 * Math.cos(a)]);
  const o = g.resampleClosed(P.map((p) => p[0]), P.map((p) => p[1]), null, 2), ho = g.headings(o.x, o.y), ko = g.curvature(ho, o.ds, 8);
  const l2 = new Float64Array(o.n).fill(-6), h2 = new Float64Array(o.n).fill(6), dl = g.minCurvatureLine(o.x, o.y, ho, o.ds, l2, h2);
  const px = Float64Array.from(o.x, (x, i) => x - Math.sin(ho[i]) * dl[i]), py = Float64Array.from(o.y, (y, i) => y + Math.cos(ho[i]) * dl[i]);
  const rs2 = g.resampleClosed(px, py, null, 2), kl = g.curvature(g.headings(rs2.x, rs2.y), rs2.ds, 8);
  const peak = (k, a, b, ds) => { let m = 0; for (let i = Math.floor(a / ds); i < Math.floor(b / ds); i++) m = Math.max(m, Math.abs(k[i])); return m; };
  assert.ok(peak(kl, 100, 900, rs2.ds) < peak(ko, 100, 900, o.ds) * 0.7, `S-bend peak κ ${peak(kl, 100, 900, rs2.ds)} vs ${peak(ko, 100, 900, o.ds)}`);
});

test("trackgeo: mask runs and spans across s = 0", async () => {
  const g = await G();
  const m = new Uint8Array(10); m[0] = m[1] = m[8] = m[9] = 1; m[4] = 1;
  const runs = g.maskRuns(m, 2);
  assert.ok(runs.some(([a, b]) => a === 16 && b === 4), "the run across the start");
  assert.ok(runs.some(([a, b]) => a === 8 && b === 10));
  assert.ok(g.inSpan(1, 16, 4) && g.inSpan(17, 16, 4) && !g.inSpan(10, 16, 4));
});
