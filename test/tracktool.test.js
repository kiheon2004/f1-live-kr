// The surveyed track's way into the app: the survey's own checks, the reference line, the fit and the conversion into
// the feed's metres (tools/track.js).
const test = require("node:test");
const assert = require("node:assert");
const T = require("../tools/track.js");
const geo = require("../src/main/geo.js");

// a lap in the feed's metres (clockwise on the map: x east, y north), and the track round it: `r` metres to the cars'
// right, `l` to their left
const CENTRE = [52.3888, 4.54092];
const FIT = { centre: CENTRE, c: Math.cos(0.3) * 0.9995, s: Math.sin(0.3) * 0.9995, tx: 338.2, ty: -86.1 };
const lapAt = (t) => [900 * Math.cos(-t) + 150 * Math.cos(-3 * t), 600 * Math.sin(-t)];
function lapPts(n) { return Array.from({ length: n }, (_, i) => lapAt((i / n) * 2 * Math.PI)); }
function offset(pts, d) {   // d metres to the right of travel
  const n = pts.length;
  return pts.map((p, i) => { const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l; return [p[0] + ty * d, p[1] - tx * d]; });
}
function survey(n = 400, r = 5, l = 8) {
  const mid = lapPts(n);
  return { venue: 55, season: 2026, src: { imagery: "test" }, edges: { right: offset(mid, r).map((p) => T.feedToLL(FIT, p)), left: offset(mid, -l).map((p) => T.feedToLL(FIT, p)) }, marks: { start: [T.feedToLL(FIT, offset(mid, r)[10]), T.feedToLL(FIT, offset(mid, -l)[10])] } };
}
const circuit = () => ({ venue: 55, location: "Zandvoort", yr: [2020, null], on: true, fit: { ...FIT, from: "test" }, ref: { from: "test", pts: lapPts(900).map(([x, y]) => [Math.round(x * 10), Math.round(y * 10)]) } });

test("a sound survey passes its checks: sections, length, widths", () => {
  const r = T.checkSurvey(survey());
  assert.deepStrictEqual(r.errors, []); assert.ok(r.ok);
  assert.strictEqual(r.stats.sections, 400); assert.ok(r.stats.closed);
  assert.ok(Math.abs(r.stats.width.median - 13) < 0.1 && r.stats.width.min > 12.5 && r.stats.width.max < 13.5, JSON.stringify(r.stats.width));
  assert.ok(r.stats.length > 4000 && r.stats.length < 6000); assert.deepStrictEqual(r.stats.marks, ["start"]);
  // a stretch only (the pit straight), and a lap whose last section repeats its first
  const part = survey(); part.edges = { left: part.edges.left.slice(0, 30), right: part.edges.right.slice(0, 30), open: true };
  assert.ok(T.checkSurvey(part).ok); assert.strictEqual(T.checkSurvey(part).stats.closed, false);
  const rep = survey(); rep.edges.left.push(rep.edges.left[0]); rep.edges.right.push(rep.edges.right[0]);
  const q = T.checkSurvey(rep); assert.ok(q.ok); assert.strictEqual(q.stats.sections, 400); assert.ok(q.warnings.some((w) => /repeats/.test(w)));
});

test("what the checks refuse: sides swapped, sections out of order or crossing, a width that is no track, a bad low range", () => {
  const errs = (f) => { const s = survey(); f(s); return T.checkSurvey(s); };
  assert.ok(/swapped/.test(errs((s) => { const l = s.edges.left; s.edges.left = s.edges.right; s.edges.right = l; }).errors.join()));
  assert.ok(/pair up/.test(errs((s) => s.edges.left.pop()).errors.join()));
  const swap = errs((s) => { for (const k of ["left", "right"]) { const a = s.edges[k], t = a[50]; a[50] = a[52]; a[52] = t; } });
  assert.ok(!swap.ok && /out of order/.test(swap.errors.join()), swap.errors.join());
  assert.ok(/narrower than 3 m/.test(errs((s) => { s.edges.left[70] = s.edges.right[70].map((v, i) => v + (i ? 1e-5 : 0)); }).errors.join()));
  assert.ok(/low\[0\]/.test(errs((s) => { s.low = [{ from: 390, to: 420, why: "trees" }]; }).errors.join()));
  assert.ok(/low\[0\]/.test(errs((s) => { s.low = [{ from: 30, to: 20 }]; }).errors.join()));
  assert.ok(/not a \[lat, lon\]/.test(errs((s) => { s.edges.right[3] = [52.4, null]; }).errors.join()));
  assert.ok(/two \[lat, lon\] points/.test(errs((s) => { s.marks.control = [s.edges.left[0]]; }).errors.join()));
  assert.ok(!T.checkSurvey(null).ok); assert.ok(!T.checkSurvey({ venue: 55 }).ok); assert.ok(!T.checkSurvey({ venue: 55, edges: { left: [], right: [] } }).ok);
  // warnings, not errors: a wide corner, a long gap, a low stretch
  const wide = errs((s) => { const g = survey(400, 5, 30); for (let i = 100; i < 104; i++) s.edges.left[i] = g.edges.left[i]; s.low = [{ from: 200, to: 210, why: "trees" }]; });
  assert.ok(wide.ok && wide.warnings.some((w) => /outside 6/.test(w)), JSON.stringify(wide)); assert.strictEqual(wide.stats.low.sections, 11); assert.ok(wide.stats.low.metres > 100);
  const gap = errs((s) => { s.edges.left.splice(20, 3); s.edges.right.splice(20, 3); });
  assert.ok(gap.ok && gap.warnings.some((w) => /more than 25 m/.test(w)));
});

test("the stored fit: feed metres ↔ latitude and longitude, the same place geo.js puts a point", () => {
  const p = [-312.4, 771.9], ll = T.feedToLL(FIT, p), back = T.llToFeed(FIT, ll);
  assert.ok(Math.hypot(back[0] - p[0], back[1] - p[1]) < 1e-6);
  // geo.fitTrack's own form (about its middle point cs) and the stored one give the same metres
  const f = { ok: true, mirror: 1, T: { c: FIT.c, s: FIT.s, tx: 12.5, ty: -40.25 }, cs: [384.5, 254.5] }, S = T.storedFit(f, CENTRE);
  const a = geo.toLocal(f, [p[0] * 10, p[1] * 10]), b = T.feedToLocal(S, p);
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9);
  assert.strictEqual(T.storedFit({ ...f, mirror: -1 }, CENTRE), null); assert.strictEqual(T.storedFit({ ...f, ok: false }, CENTRE), null);
});

test("the renderer's data: the lines in the feed's metres, the way the cars go – whichever way the survey ran", async () => {
  const mid = lapPts(400), right = offset(mid, 5), left = offset(mid, -8);
  const { entry, report } = T.buildEntry(circuit(), survey());
  assert.strictEqual(report.reversed, false); assert.strictEqual(entry.edges.left.length, 400); assert.ok(entry.on);
  for (const i of [0, 57, 399]) { assert.ok(Math.hypot(entry.edges.right[i][0] - right[i][0], entry.edges.right[i][1] - right[i][1]) < 0.02); assert.ok(Math.hypot(entry.edges.left[i][0] - left[i][0], entry.edges.left[i][1] - left[i][1]) < 0.02); }
  assert.deepStrictEqual(entry.fit, FIT); assert.strictEqual(entry.ref.length, 900); assert.strictEqual(entry.marks.start.length, 2);
  // the survey run against the cars – its own left then on the cars' right: turned round, the low range with it
  const rev = survey(); rev.edges = { left: rev.edges.right.slice().reverse(), right: rev.edges.left.slice().reverse() }; rev.low = [{ from: 10, to: 19, why: "trees" }];
  assert.ok(T.checkSurvey(rev).ok, "a survey is sound either way round");
  const R = T.buildEntry(circuit(), rev);
  assert.strictEqual(R.report.reversed, true);
  assert.ok(Math.hypot(R.entry.edges.right[57][0] - right[57][0], R.entry.edges.right[57][1] - right[57][1]) < 0.02 && Math.hypot(R.entry.edges.left[57][0] - left[57][0], R.entry.edges.left[57][1] - left[57][1]) < 0.02);
  assert.deepStrictEqual(R.entry.low, [[380, 389]]);
  // on its own reference line: every sample takes them, 5 m and 8 m, no fold
  const t = await T.tryEntry(entry);
  assert.strictEqual(t.folds, 0); assert.strictEqual(t.changed, t.samples); assert.ok(t.onRef.ok); assert.strictEqual(t.insideShare, 1);
  assert.ok(Math.abs(t.width[0] - 13) < 0.3 && Math.abs(t.width[1] - 13) < 0.3 && Math.abs(t.margin.median - 5) < 0.2, JSON.stringify(t));
  assert.throws(() => T.buildEntry({ venue: 55 }, survey()), /no fit/);
});

test("the reference line from a session: one car's lap moved onto where the whole field is, a point every 5 m", () => {
  // the feed's line; one car's lap lies 1.5 m off it over a tenth of the lap (as a lap picked from one car can)
  const N = 1200, line = lapPts(N), n = line.length, bad = offset(line, 1.5);
  const lap = line.map((p, i) => { const q = i > 300 && i < 420 ? bad[i] : p; return [q[0] * 10, q[1] * 10, 0]; }).filter((_, i) => i % 3 === 0);
  const cars = Array.from({ length: 6 }, (_, c) => { const pts = line.filter((_, i) => i % 2 === c % 2); return { n: pts.length * 8, x: Array.from({ length: pts.length * 8 }, (_, i) => pts[i % pts.length][0] * 10 + ((i * 7 + c) % 3) - 1), y: Array.from({ length: pts.length * 8 }, (_, i) => pts[i % pts.length][1] * 10 + ((i * 5 + c) % 3) - 1), z: new Array(pts.length * 8).fill(0) }; });
  const R = T.refLine(lap, cars);
  assert.ok(R.pts.length > 800 && R.pts.length < 1100 && Math.abs(R.length - R.pts.length * 5) < 5, JSON.stringify({ n: R.pts.length, len: R.length }));
  assert.ok(R.moved.max > 1.2 && R.moved.max < 1.8, "the car's lap was 1.5 m off: " + JSON.stringify(R.moved));
  // every point of it within 0.4 m of the feed's line
  let worst = 0;
  for (const [x, y] of R.pts) { let b = Infinity; for (let i = 0; i < n; i++) { const a = line[i], q = line[(i + 1) % n], ex = q[0] - a[0], ey = q[1] - a[1], t = Math.max(0, Math.min(1, ((x / 10 - a[0]) * ex + (y / 10 - a[1]) * ey) / (ex * ex + ey * ey))); b = Math.min(b, Math.hypot(a[0] + ex * t - x / 10, a[1] + ey * t - y / 10)); } worst = Math.max(worst, b); }
  assert.ok(worst < 0.4, "worst " + worst.toFixed(2));
});

test("the fit from the survey: a line that is not the track's middle is brought back between the edges, the pit path onto its lane", async () => {
  // the real track: 13 m wide round a middle the feed's line wanders ±2.5 m from; the circuit's present fit is 3.6 m and
  // 0.05° off the true one
  const N = 600, lap = lapPts(N), wander = lap.map((_, i) => 2.5 * Math.sin((i / N) * 2 * Math.PI * 5));
  const nrm = (i) => { const a = lap[(i - 1 + N) % N], b = lap[(i + 1) % N], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l]; };   // to the right of travel
  const mid = lap.map((p, i) => { const [nx, ny] = nrm(i); return [p[0] + nx * wander[i], p[1] + ny * wander[i]]; });
  const right = mid.map((p, i) => { const [nx, ny] = nrm(i); return [p[0] + nx * 6.5, p[1] + ny * 6.5]; }), left = mid.map((p, i) => { const [nx, ny] = nrm(i); return [p[0] - nx * 6.5, p[1] - ny * 6.5]; });
  const sv = { venue: 55, season: 2026, src: { imagery: "test" }, edges: { right: right.map((p) => T.feedToLL(FIT, p)), left: left.map((p) => T.feedToLL(FIT, p)) } };
  assert.ok(T.checkSurvey(sv).ok, T.checkSurvey(sv).errors.join());
  const th = 0.0008, F0 = { centre: CENTRE, c: FIT.c * Math.cos(th) - FIT.s * Math.sin(th), s: FIT.s * Math.cos(th) + FIT.c * Math.sin(th), tx: FIT.tx + 3, ty: FIT.ty - 2 };
  const C = { venue: 55, location: "Zandvoort", on: true, fit: F0, ref: { from: "test", pts: lap.map(([x, y]) => [Math.round(x * 10), Math.round(y * 10)]) } };
  const off = (F) => lap.map((p) => { const a = T.feedToLocal(F, p), b = T.feedToLocal(FIT, p); return Math.hypot(a[0] - b[0], a[1] - b[1]); }).sort((a, b) => a - b)[N >> 1];
  const r = await T.solveFit(C, sv);
  assert.ok(off(F0) > 3 && off(r.fit) < 2, `from the true fit: ${off(F0).toFixed(2)} m before, ${off(r.fit).toFixed(2)} m after`);
  assert.ok(r.before.margin.min < 1.2 && r.after.margin.min > 2, JSON.stringify([r.before.margin, r.after.margin]));
  assert.strictEqual(r.after.inside, 1); assert.deepStrictEqual(r.after.outside, []); assert.ok(r.moved.points.median > 1.5);
  const scale = Math.hypot(r.fit.c, r.fit.s); assert.ok(scale > 0.998 && scale < 1.001, "scale " + scale);
  // with the pit lane surveyed: the feed's pit path runs down the fast lane's middle – 15 m to the right of the track's
  // line along a straight stretch – and that holds the fit sideways there
  const a = lap[150], b = lap[165], [nx, ny] = nrm(157), A = [a[0] + nx * 15, a[1] + ny * 15], B = [b[0] + nx * 15, b[1] + ny * 15];
  const pit = { lane: [T.feedToLL(FIT, A), T.feedToLL(FIT, B)], path: Array.from({ length: 21 }, (_, i) => [(A[0] + ((B[0] - A[0]) * i) / 20) * 10, (A[1] + ((B[1] - A[1]) * i) / 20) * 10]) };
  const q = await T.solveFit(C, sv, { pit });
  assert.ok(Math.abs(q.before.pitPath.median) > 1.5 && Math.abs(q.after.pitPath.median) < 0.5, JSON.stringify([q.before.pitPath, q.after.pitPath]));
  assert.ok(q.after.margin.min > 1.5 && q.after.inside === 1 && off(q.fit) < 2, JSON.stringify(q.after.margin) + " " + off(q.fit).toFixed(2));
});
