// The teams' pit wall stands side by side (v0.47, the user's §4): each team's stand is placed on its own – facilities.js
// wallAt, opposite its box, moved along the wall up to 6 m where the wall kinks (v0.46, 282d17d) – so two neighbours
// might overlap, pick the same place, run off an end of the walkway, leave the walkway's railing open where no stand is,
// or stand in the cars' way. This measures all of that for a circuit; it changes nothing.
//
// Pure (node-tested): the 3D view's dev hook (map3d.js Map3D.standCheck) gathers the stands as built (garages.js
// pitWallStand records each one in t.wallStand.at), the railing's segments and what was opened (facilities.js railU,
// openRail; garages.js standSpans), the lane's face and where the cars drive; this judges.
//
// A stand's parts in plan – the same sizes garages.js pitWallStand builds (keep the two in step): along A (its length
// L = seats × 0.8 + 0.6), out O (towards the pit lane) from its point p (the walkway's middle there).
//   deck L × 1.6 at o 0.05 · console top (L − 0.1) × 0.5 at o −0.52 · posts 0.07² at a ±(L/2 − 0.05), o −0.72 / 0.82 ·
//   roof (L + 0.3) × 2.0 at o 0.1, its fascia at o 1.1 · end rails 0.04 × 1.6 at a ±L/2 · the step 0.5 × 0.7 at
//   a L/2 + 0.25, o 0.4 · an enclosure 0.03 × 1.7 at a ±(L/2 + 0.02) where the team has one
// Heights (over the deck's foot): the deck 0–0.22, the console to 1.08, the roof 2.68–2.76 – the roof's 1.1 m out over
// the lane is over a car's height (a 2026 car is under 1 m tall), so only the deck, the step, the posts and the
// console count against the cars' path.
export const PARTS = (L, enclosed = false) => [
  { name: "deck", a: 0, o: 0.05, la: L, lo: 1.6, low: true },
  { name: "console", a: 0, o: -0.52, la: L - 0.1, lo: 0.5, low: true },
  ...[-L / 2 + 0.05, L / 2 - 0.05].flatMap((a) => [-0.72, 0.82].map((o) => ({ name: "post", a, o, la: 0.07, lo: 0.07, low: true }))),
  { name: "roof", a: 0, o: 0.1, la: L + 0.3, lo: 2.0 },
  { name: "fascia", a: 0, o: 1.1, la: L + 0.3, lo: 0.04 },
  ...[-L / 2, L / 2].map((a) => ({ name: "endRail", a, o: 0.05, la: 0.04, lo: 1.6, low: true })),
  { name: "step", a: L / 2 + 0.25, o: 0.4, la: 0.5, lo: 0.7, low: true },
  ...(enclosed ? [-L / 2 - 0.02, L / 2 + 0.02].map((a) => ({ name: "enclosure", a, o: 0.05, la: 0.03, lo: 1.7, low: true })) : []),
];
// the parts that stand on the walkway in front of its railing (what the railing is opened for: garages.js standSpans)
const ON_WALK = new Set(["deck", "endRail", "step", "enclosure"]);

// s: { p: [x, z], along: [ax, az], out: [ox, oz], L, enclosed } → its parts as rectangles: corners in scene x, z
export function standRects(s) {
  return PARTS(s.L, s.enclosed).map((q) => {
    const c = [s.p[0] + s.along[0] * q.a + s.out[0] * q.o, s.p[1] + s.along[1] * q.a + s.out[1] * q.o], ha = q.la / 2, ho = q.lo / 2;
    const pt = (i, j) => [c[0] + s.along[0] * ha * i + s.out[0] * ho * j, c[1] + s.along[1] * ha * i + s.out[1] * ho * j];
    return { ...q, pts: [pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)] };
  });
}

// two convex polygons: how deep they overlap (> 0, the least push apart along an edge's normal), else −(the gap between them)
export function polyOverlap(P, Q) {
  let depth = Infinity;
  for (const poly of [P, Q]) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], n = [b[1] - a[1], a[0] - b[0]], l = Math.hypot(n[0], n[1]) || 1;
    const pr = (pts) => pts.reduce(([lo, hi], p) => { const d = (p[0] * n[0] + p[1] * n[1]) / l; return [Math.min(lo, d), Math.max(hi, d)]; }, [Infinity, -Infinity]);
    const [p0, p1] = pr(P), [q0, q1] = pr(Q), o = Math.min(p1, q1) - Math.max(p0, q0);
    if (o <= 0) return -polyGap(P, Q);
    depth = Math.min(depth, o);
  }
  return depth;
}
const segPt = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t); };
function polyGap(P, Q) {
  let m = Infinity;
  for (const [A, B] of [[P, Q], [Q, P]]) for (const p of A) for (let i = 0; i < B.length; i++) m = Math.min(m, segPt(p, B[i], B[(i + 1) % B.length]));
  return m;
}

// [u0, u1] spans: merged, in order
const merge = (spans) => { const s = spans.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]), out = []; for (const [a, b] of s) { const l = out[out.length - 1]; if (l && a <= l[1] + 1e-6) l[1] = Math.max(l[1], b); else out.push([a, b]); } return out; };
// a's spans less b's
const minus = (a, b) => { const out = []; for (let [s0, s1] of merge(a)) { for (const [b0, b1] of merge(b)) { if (b1 <= s0 || b0 >= s1) continue; if (b0 > s0) out.push([s0, b0]); s0 = Math.max(s0, b1); if (s0 >= s1) break; } if (s1 > s0) out.push([s0, s1]); } return out; };

export const TOL = {
  overlap: 0.005,   // parts of two stands overlapping by more than this (m) – they stand in each other
  gapTight: 0.3,    // neighbours closer than this are listed as tight (not wrong: real stands stand nearly end to end)
  end: 0.05,        // a stand's part this far past the walkway's end stands off it
  rail: 0.05,       // the railing left in place over a stand's deck or step by more than this – it runs through it
  railSlack: 0.5,   // the railing open more than this beyond a stand's deck and step (nothing in front of the opening)
  lane: 0.2,        // a stand this far over the lane's face stands in the pit lane (as pitwallcheck.js)
  car: 0,           // the cars' wall side within this of a stand's deck / step / posts – in their way
};

// input: {
//   axis: { o: [x, z], u: [ux, uz] } – u along the garages = (point − o) · u (facilities.js project's u),
//   wall: [u0, u1] – the walkway's ends; run: [gStart, gEnd] – the garages' run,
//   rail: [[u0, u1]] – the railing's segments (facilities.js railU) or null (none: Monaco's upstairs stands),
//   spans: [[u0, u1]] – what was opened (garages.js standSpans),
//   stands: [{ team, box (u), L, p: [x, z], along, out, enclosed, upper,
//              across: [{ a, u, standLane (m out from the garages: the deck's / step's / posts' lane side), laneFace
//              (facilities.js wallFace), carEdge (the wall side of a car in the fast lane there: pitstate.js
//              laneOffsetOf + the car's half width), boxEdge (the box's painted outline's lane side, if here), feedEdge
//              (the feed's own pit line + a car's half width – shown, not judged: the feed's line wanders a metre or
//              two; the cars are drawn on the lanes) }] }]
// } → { stands, moved, overlaps, tight, order, ends, rail, lane, cars, problems, ok }
export function checkStands(input, tol = TOL) {
  const T = { ...TOL, ...tol }, ax = input.axis, U = (p) => (p[0] - ax.o[0]) * ax.u[0] + (p[1] - ax.o[1]) * ax.u[1];
  const st = [...input.stands].sort((a, b) => a.box - b.box).map((s) => {
    const rects = standRects(s), us = (f) => { const v = rects.filter(f).flatMap((r) => r.pts.map(U)); return [Math.min(...v), Math.max(...v)]; };
    return { ...s, rects, at: U(s.p), all: us(() => true), walk: us((r) => ON_WALK.has(r.name)) };
  });
  const r2 = (x) => +x.toFixed(2), problems = [];
  // how far each stand stands along the wall from its box (wallAt's kink move)
  const moved = st.map((s) => ({ team: s.team, box: r2(s.box), at: r2(s.at), du: r2(s.at - s.box) }));
  // every pair: overlapping parts; neighbours (in box order): the gap between them
  const overlaps = [], gaps = [];
  for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
    const A = st[i], B = st[j];
    if (A.all[1] < B.all[0] - 3 || B.all[1] < A.all[0] - 3) { if (j === i + 1) gaps.push({ a: A.team, b: B.team, gap: r2(B.all[0] - A.all[1]), du: r2(B.at - A.at) }); continue; }
    let worst = -Infinity, pair = null;
    for (const ra of A.rects) for (const rb of B.rects) { const o = polyOverlap(ra.pts, rb.pts); if (o > worst) { worst = o; pair = [ra.name, rb.name]; } if (o > T.overlap) overlaps.push({ a: A.team, b: B.team, parts: [ra.name, rb.name], depth: r2(o) }); }
    if (j === i + 1) gaps.push({ a: A.team, b: B.team, gap: r2(-worst), du: r2(B.at - A.at), closest: pair });
  }
  const tight = gaps.filter((g) => g.gap >= -T.overlap && g.gap < T.gapTight);
  for (const o of overlaps) problems.push(`${o.a} and ${o.b} overlap: ${o.parts.join("/")} ${o.depth} m`);
  // the order along the wall the boxes' order; two neighbours over the same stretch
  const order = [];
  for (let i = 0; i + 1 < st.length; i++) {
    const A = st[i], B = st[i + 1];
    if (B.at < A.at) order.push(`${A.team} and ${B.team} swapped along the wall (${r2(A.at)} > ${r2(B.at)})`);
    else if (B.walk[0] < A.walk[1] - T.overlap) order.push(`${A.team} and ${B.team} on the same stretch (${r2(A.walk[1] - B.walk[0])} m)`);
  }
  problems.push(...order);
  // past an end of the walkway (or of the garages' run, for the stands upstairs)
  const ends = [];
  for (const s of st) {
    const [w0, w1] = s.upper || !input.wall ? input.run : input.wall;
    if (s.all[0] < w0 - T.end) ends.push(`${s.team} ${r2(w0 - s.all[0])} m past the ${s.upper ? "run" : "walkway"}'s start`);
    if (s.all[1] > w1 + T.end) ends.push(`${s.team} ${r2(s.all[1] - w1)} m past the ${s.upper ? "run" : "walkway"}'s end`);
  }
  problems.push(...ends);
  // the railing: what openRail leaves out (a segment over a span), against where the stands' decks and steps are
  let rail = null;
  if (input.rail?.length) {
    const spans = input.spans || [], open = input.rail.filter(([a, b]) => spans.some(([s0, s1]) => b > s0 && a < s1)), closed = input.rail.filter((q) => !open.includes(q));
    const walks = st.filter((s) => !s.upper).map((s) => s.walk), beyond = minus(open, walks).map(([a, b]) => [r2(a), r2(b), r2(b - a)]);
    const through = [];
    for (const s of st) if (!s.upper) for (const [a, b] of closed) { const o = Math.min(b, s.walk[1]) - Math.max(a, s.walk[0]); if (o > T.rail) through.push(`${s.team}: the railing left across ${r2(o)} m of its deck/step`); }
    const slack = beyond.filter((q) => q[2] > T.railSlack);
    rail = { segments: input.rail.length, open: open.length, openM: r2(merge(open).reduce((m, [a, b]) => m + b - a, 0)), beyond, maxBeyond: beyond.reduce((m, q) => Math.max(m, q[2]), 0), through };
    problems.push(...through, ...slack.map((q) => `the railing open ${q[2]} m beyond the stands (u ${q[0]}–${q[1]})`));
  }
  // the lane and the cars: across the stand's length
  const lane = [], cars = [];
  for (const s of st) {
    if (s.upper || !s.across?.length) continue;
    let inLane = -Infinity, carGap = Infinity, boxGap = Infinity, feedGap = Infinity;
    for (const x of s.across) {
      if (x.feedEdge != null) feedGap = Math.min(feedGap, x.standLane - x.feedEdge);
      if (x.laneFace != null) inLane = Math.max(inLane, x.laneFace - x.standLane);
      if (x.carEdge != null) carGap = Math.min(carGap, x.standLane - x.carEdge);
      if (x.boxEdge != null) boxGap = Math.min(boxGap, x.standLane - x.boxEdge);
    }
    lane.push({ team: s.team, overLane: r2(inLane), carGap: Number.isFinite(carGap) ? r2(carGap) : null, boxGap: Number.isFinite(boxGap) ? r2(boxGap) : null, feedGap: Number.isFinite(feedGap) ? r2(feedGap) : null });
    if (inLane > T.lane) problems.push(`${s.team} stands ${r2(inLane)} m in the pit lane`);
    if (carGap < T.car) { cars.push(s.team); problems.push(`${s.team}: the fast lane's cars ${r2(-carGap)} m into its deck/step`); }
    if (boxGap < T.car) problems.push(`${s.team}: a box's outline ${r2(-boxGap)} m under its deck/step`);
  }
  return { stands: st.length, moved, nMoved: moved.filter((m) => Math.abs(m.du) > 0.25).length, maxMove: moved.reduce((m, q) => Math.max(m, Math.abs(q.du)), 0),
    overlaps, gaps, minGap: gaps.length ? Math.min(...gaps.map((g) => g.gap)) : null, tight, order, ends, rail, lane,
    minCarGap: lane.some((l) => l.carGap != null) ? Math.min(...lane.filter((l) => l.carGap != null).map((l) => l.carGap)) : null, cars, problems, ok: !problems.length };
}
