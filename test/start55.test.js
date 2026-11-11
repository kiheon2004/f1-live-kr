// v0.55 – the launch off the grid: the two columns stay two columns until the cars are apart along the track.
// The feed has the whole field on one line and neighbouring slots' cars within a car's length of each other along it
// for seconds after the start (2025 Hungary: 8 of 18 gaps at +3 s, and so to the first corner). v0.54 let each car's
// column offset go over 120 m of its own run and kept the car from traffic.js until 15 % of it was left: the columns
// were one line 3.5–4.2 s after lights out, the cars nose into tail, and traffic.js then parted them from nothing, to
// the side its own rule picked. Now: grid.js leaveBase gives traffic.js the place the car is drawn at from the moment
// it moves (map3d.js gridPlan), with the distance driven continuous (it stepped every 250 ms).
const test = require("node:test");
const assert = require("node:assert");

const CAR = { front: 2.8, back: 2.8, half: 1.0 };
const ROAD = { L: 7, R: -7 }, LINE = -6.2;   // (the feed's one line, as at the Hungaroring: 0.8 m from the right edge)
// a straight road along +z; d + = left = −x
const envFor = (tracks) => ({ L: 5000, live: false, edges: () => ROAD, turnAhead: () => -1, kappa: () => 0,
  peek: (num, t) => (tracks[num] ? tracks[num](t).s : null), pose(s, d, o) { o.x = -d; o.z = s; o.yaw = 0; return o; } });
// A launch: slots 8 m apart alternately in two columns (±3.5 m); the feed has every car on LINE, `gaps[k]` m behind the
// car ahead (not the slots' 8 m), all pulling away at `acc[k]` m/s² from t = 0.
function field(gaps, acc) {
  const cars = []; let s = 1000;
  gaps.forEach((g, k) => {
    s -= g;
    const s0 = s, a = acc[k], slotS = 1000 - 8 * k, slotD = k % 2 ? -3.5 : 3.5;
    const at = (t) => { const u = Math.max(0, t / 1000), v = Math.min(a * u, 85), x = u < 85 / a ? 0.5 * a * u * u : 0.5 * 85 * 85 / a + 85 * (u - 85 / a); return { s: s0 + x, vs: v, driven: x }; };
    cars.push({ num: String(k + 1), col: Math.sign(slotD), da: slotS - s0, dc: slotD - LINE, at });
  });
  return cars;
}
// one frame: the list traffic.js is given – how: "base" (v0.55: the drawn place, never held once moving) or "v054" (the
// tracks' own place, held while more than 15 % of the column offset is left, that offset stepping every 250 ms)
async function frame(G, cars, t, how) {
  return cars.map((c) => {
    const q = c.at(t), it = { num: c.num, s: q.s, d: LINE, vs: q.vs, y: 0, held: false, ...CAR, gs: 0, gd: 0, c };
    if (q.driven <= 0) { it.held = true; it.gs = c.da; it.gd = c.dc; return it; }
    const driven = how === "v054" ? c.at(Math.floor(t / 250) * 250).driven : q.driven;
    const b = G.leaveBase({ da: c.da, dc: c.dc, driven, d: LINE, lo: ROAD.R + 0.95, hi: ROAD.L - 0.95 });
    if (!b) return it;
    if (how === "v054") { it.gs = b.ds; it.gd = b.dd; it.held = b.across > 0.15; } else { it.s += b.ds; it.d += b.dd; }
    return it;
  });
}
async function launch(how, gaps, acc, leaveAcross = null, t1 = 9000) {
  const G = await import("../src/renderer/grid.js"), T = await import("../src/renderer/traffic.js");
  const keep = G.BLEND.leaveAcross; if (leaveAcross) G.BLEND.leaveAcross = leaveAcross;
  try {
    const cars = field(gaps, acc), env = envFor(Object.fromEntries(cars.map((c) => [c.num, c.at]))), S = T.makeTraffic();
    const out = { frames: 0, overlap: 0, maxDepth: 0, crossed: 0, maxStep: 0, columnsAt4: null }, prev = new Map(), side = new Map();
    for (let t = -500; t <= t1; t += 50) {
      const list = await frame(G, cars, t, how), res = T.stepTraffic(S, list, env, t);
      const P = list.map((c) => { const m = res.get(c.num); return { num: c.num, col: c.c.col, z: c.s + c.gs + m.sOff, x: c.d + c.gd + m.dOff }; });
      out.frames++;
      for (const p of P) { const q = prev.get(p.num); if (q != null) out.maxStep = Math.max(out.maxStep, Math.abs(p.x - q)); prev.set(p.num, p.x); }
      if (t === 4000) { const l = P.filter((p) => p.col > 0).map((p) => p.x), r = P.filter((p) => p.col < 0).map((p) => p.x); out.columnsAt4 = Math.min(...l) - Math.max(...r); }
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const a = P[i], b = P[j], d = T.boxDepth(-a.x, a.z, 0, CAR, -b.x, b.z, 0, CAR);
        if (d > 0.02) { out.overlap++; out.maxDepth = Math.max(out.maxDepth, d); }
        // (two cars from different columns, alongside – under a car's length apart along: the left one is still on the left)
        if (a.col !== b.col && Math.abs(a.z - b.z) < 5.6) { const k = a.num + "/" + b.num, sd = Math.sign((a.x - b.x) * a.col); if (sd < 0 && Math.abs(a.x - b.x) > 0.3 && !side.get(k)) { side.set(k, true); out.crossed++; } }
      }
    }
    return out;
  } finally { G.BLEND.leaveAcross = keep; }
}
// the feed's gaps of a real grid (2025 Hungary at lights out: 4–12 m, not the slots' 8), launches from 8.5 to 11.5 m/s²:
// cars come alongside their neighbours within 3–4 s
const GAPS = [0, 4.4, 11.4, 8.0, 8.1, 6.0, 8.5, 6.3, 9.3, 7.4, 8.9, 5.1, 10.4, 10.9, 6.4, 4.1, 11.6, 9.6, 5.8];
const ACC = [10.5, 10.2, 10.6, 9.6, 11.2, 9.4, 10.9, 9.9, 10.4, 9.2, 11.4, 9.8, 10.8, 10.0, 9.0, 8.6, 11.5, 10.6, 9.5];

test("leaveBase: the slot's offset let go with the distance driven – continuous, kept on the tarmac, null when gone", async () => {
  const G = await import("../src/renderer/grid.js");
  const at0 = G.leaveBase({ da: 3, dc: 9.7, driven: 0, d: -6.2, lo: -6.05, hi: 6.05 });
  assert.deepStrictEqual([at0.state, at0.ds, +at0.dd.toFixed(6)], ["leaving", 3, 9.7], "at its slot when it starts moving");
  assert.strictEqual(G.leaveBase({ da: 3, dc: 9.7, driven: -0.4, d: -6.2 }).ds, 3, "rolling back a little: still its slot's offset (not dropped onto the feed's place)");
  assert.strictEqual(G.leaveBase({ da: 3, dc: 9.7, driven: G.BLEND.leaveAcross, d: -6.2 }), null);
  // a metre driven moves the drawn car by centimetres at most, along and across (v0.54: steps of up to 1.4 m, four a second)
  let prev = at0, worst = 0;
  for (let x = 0.5; x < G.BLEND.leaveAcross; x += 0.5) { const b = G.leaveBase({ da: 3, dc: 9.7, driven: x, d: -6.2, lo: -6.05, hi: 6.05 }); worst = Math.max(worst, Math.abs(b.dd - prev.dd), Math.abs(b.ds - prev.ds)); assert.ok(b.dd <= prev.dd + 1e-9 && b.ds <= prev.ds + 1e-9, "only ever let go"); prev = b; }
  assert.ok(worst < 0.06, `largest change per half metre driven ${worst.toFixed(3)} m`);
  assert.ok(prev.dd < 0.01 && prev.ds === 0, "all of it gone at the end: no step when the grid lets go");
  // 120 m from the slots the two columns (7 m apart standing) are still more than two car widths apart
  const l = G.leaveBase({ da: 0, dc: 9.7, driven: 120, d: -6.2 }), r = G.leaveBase({ da: 0, dc: 2.7, driven: 120, d: -6.2 });
  assert.ok(l.dd - r.dd > 4.2, `columns ${(l.dd - r.dd).toFixed(2)} m apart at 120 m`);
  // the tarmac: a column offset that would put the car over the edge is cut at it (the place traffic.js is given)
  assert.strictEqual(G.leaveBase({ da: 0, dc: 9.7, driven: 0, d: -1, lo: -6.05, hi: 6.05 }).dd, 7.05);
});

test("launch: v0.54's hand-over draws neighbours into each other and swaps their sides – this is what was wrong", async () => {
  const old = await launch("v054", GAPS, ACC, 120);
  assert.ok(old.overlap > 40 && old.maxDepth > 1, `overlap pair-frames ${old.overlap}, deepest ${old.maxDepth.toFixed(2)} m`);
  assert.ok(old.crossed >= 1, "a car from one column drawn on the other side of its neighbour while alongside");
  assert.ok(old.maxStep > 0.6, `sideways steps of ${old.maxStep.toFixed(2)} m in one 50 ms frame (the 250 ms staircase)`);
  assert.ok(old.columnsAt4 < 1, "the two columns one line 4 s after lights out");
});

test("launch: the columns stay columns until the cars are apart along the track – no overlap, no side swapped, no step", async () => {
  const now = await launch("base", GAPS, ACC);
  // (what is left is traffic.js's own: one car going by another from its own column at the road's edge, 0.06 m for 0.2 s –
  // the solve over the whole pack not quite done in its rounds; v0.54 above: more than a metre, for a second)
  assert.ok(now.overlap <= 6 && now.maxDepth < 0.1, `overlap pair-frames ${now.overlap}, deepest ${now.maxDepth.toFixed(2)} m`);
  assert.strictEqual(now.crossed, 0, "every car alongside a neighbour from the other column is still on its own side");
  assert.ok(now.maxStep < 0.45, `largest sideways move in a 50 ms frame ${now.maxStep.toFixed(2)} m`);
  assert.ok(now.columnsAt4 > 2.0, `4 s after lights out the columns are ${now.columnsAt4.toFixed(2)} m apart (centres; a car is 2 m wide)`);
});

test("launch: the same with every car getting away equally (nobody alongside) – the columns close without traffic.js moving anyone", async () => {
  const even = GAPS.map((g, k) => (k ? 8 : 0)), now = await launch("base", even, ACC.map(() => 10));
  assert.strictEqual(now.overlap, 0);
  assert.strictEqual(now.crossed, 0);
});
