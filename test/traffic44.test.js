// v0.44 traffic (traffic.js): cars drawn through each other – oriented boxes, the solve across and along, its limits,
// what is left recorded, no future data live, the same at any frame rate / playback speed, seeks, the order kept.
const test = require("node:test");
const assert = require("node:assert");

const CAR = { front: 2.86, back: 2.86, half: 1.0 };   // (the 2022-era model's bounds: 5.72 × 2.0 m)
// a straight track along +z (the lap line at x = 0), `width` m of tarmac either side; d + = left = −x (smooth.js frame)
function straight(TR, { L = 5000, width = 6, live = false, tracks = {}, peekLog = null } = {}) {
  return {
    L, live,
    edges: () => ({ L: width, R: -width }),
    turnAhead: () => 1,
    kappa: () => 0,
    peek(num, t) { if (peekLog) peekLog.push(t); const f = tracks[num]; return f ? f(t) : null; },
    pose(s, d, o) { o.x = -d; o.z = ((s % L) + L) % L; o.yaw = 0; return o; },
  };
}
const car = (num, s, d, vs, y = 0) => ({ num, s, d, vs, y, held: false, ...CAR });
// run cars given as functions of t (ms) → { s, d, vs } from t0 to t1 every `step` ms; returns the record per frame
async function run(T, cars, env, t0, t1, step, S = null) {
  S = S || T.makeTraffic();
  const rec = [];
  for (let t = t0; t <= t1 + 1e-6; t += step) {
    const list = cars.map(([num, f]) => { const q = f(t); return car(num, q.s, q.d ?? 0, q.vs ?? 0, q.y ?? 0); });
    const before = new Map(list.map((c) => [c.num, [c.s, c.d]]));
    const out = T.stepTraffic(S, list, env, t);
    const fr = { t, cars: {} };
    list.forEach((c) => { assert.deepStrictEqual([c.s, c.d], before.get(c.num), "the data (s, d) is never changed"); const m = out.get(c.num); fr.cars[c.num] = { s: c.s, d: c.d, dOff: m.dOff, sOff: m.sOff, res: m.res, mode: m.mode }; });
    rec.push(fr);
  }
  return { rec, S };
}
// the boxes' overlap of two cars as drawn in a frame
function drawnDepth(T, env, fr, a, b) {
  const A = fr.cars[a], B = fr.cars[b], pa = env.pose(A.s + A.sOff, A.d + A.dOff, {}), pb = env.pose(B.s + B.sOff, B.d + B.dOff, {});
  return T.boxDepth(pa.x, pa.z, pa.yaw, CAR, pb.x, pb.z, pb.yaw, CAR);
}

test("boxes: apart, nose to tail, side by side, turned", async () => {
  const T = await import("../src/renderer/traffic.js");
  assert.strictEqual(T.boxDepth(0, 0, 0, CAR, 0, 6, 0, CAR), 0);                       // 6 m apart along: clear
  assert.ok(Math.abs(T.boxDepth(0, 0, 0, CAR, 0, 5, 0, CAR) - 0.72) < 1e-9);           // 5 m: 0.72 m into each other
  assert.ok(Math.abs(T.boxDepth(0, 0, 0, CAR, 1.5, 0, 0, CAR) - 0.5) < 1e-9);          // alongside, 1.5 m apart: 0.5 m
  assert.strictEqual(T.boxDepth(0, 0, 0, CAR, 2.1, 0, 0, CAR), 0);
  // turned 30° (a hairpin): 5.9 m apart along still overlaps at the inside corners
  assert.ok(T.boxDepth(0, 0, 0, CAR, 1.5, 5.7, 0.52, CAR) > 0);
});

test("two-car pass (replay): the one going by is parted across before they meet, no overlap, nothing along", async () => {
  const T = await import("../src/renderer/traffic.js");
  // B (behind, 5 m/s faster) passes A on a 12 m wide straight; both on the racing line (d = 0) in the data
  const fa = (t) => ({ s: 1000 + 40 * t / 1000, vs: 40 }), fb = (t) => ({ s: 960 + 45 * t / 1000, vs: 45 });
  const env = straight(T, { tracks: { A: (t) => fa(t).s, B: (t) => fb(t).s } });
  const { rec } = await run(T, [["A", fa], ["B", fb]], env, 0, 16000, 50);
  let worst = 0, maxRate = 0, passFrames = 0;
  for (let i = 0; i < rec.length; i++) {
    const fr = rec[i]; worst = Math.max(worst, drawnDepth(T, env, fr, "A", "B"));
    if (fr.cars.B.mode === "pass") passFrames++;
    assert.ok(Math.abs(fr.cars.A.sOff) < 1e-9 && Math.abs(fr.cars.B.sOff) < 1e-9, "a pass is never moved along (the order is the data's)");
    if (i) maxRate = Math.max(maxRate, Math.abs(fr.cars.B.dOff - rec[i - 1].cars.B.dOff) / 0.05);
  }
  assert.strictEqual(worst, 0, "no overlap drawn");
  assert.ok(passFrames > 50, "seen as a pass");
  assert.ok(maxRate < T.TRAFFIC.PASS_V + T.TRAFFIC.LAT_V + 0.1, `sideways speed bounded (${maxRate.toFixed(2)} m/s)`);
  // back on the line afterwards
  assert.ok(Math.abs(rec.at(-1).cars.B.dOff) < 0.05 && Math.abs(rec.at(-1).cars.A.dOff) < 0.05);
});

test("3 cars alongside in the data: all three parted, the middle one between (no pair-sum cancelling)", async () => {
  const T = await import("../src/renderer/traffic.js");
  const env = straight(T, { width: 7 });
  const fs = [["A", (t) => ({ s: 500 + 30 * t / 1000, vs: 30 })], ["B", (t) => ({ s: 500.6 + 30 * t / 1000, d: 0.3, vs: 30 })], ["C", (t) => ({ s: 499.5 + 30 * t / 1000, d: -0.2, vs: 30 })]];
  const { rec } = await run(T, fs, env, 0, 3000, 50);
  const fr = rec.at(-1), x = (n) => fr.cars[n].d + fr.cars[n].dOff;
  const xs = ["A", "B", "C"].map(x).sort((a, b) => a - b);
  assert.ok(xs[1] - xs[0] >= 2.25 && xs[2] - xs[1] >= 2.25, `three abreast: ${xs.map((v) => v.toFixed(2))}`);
  for (const [a, b] of [["A", "B"], ["A", "C"], ["B", "C"]]) assert.strictEqual(drawnDepth(T, env, fr, a, b), 0);
  for (const n of ["A", "B", "C"]) { assert.ok(x(n) <= 7 - 0.9 + 1e-6 && x(n) >= -7 + 0.9 - 1e-6, "on the tarmac"); assert.strictEqual(fr.cars[n].res, 0); }
});

test("braking queue: nose to tail closer than a car, not a pass – kept in line, spaced along within S_MAX, order kept", async () => {
  const T = await import("../src/renderer/traffic.js");
  const env = straight(T, { width: 5 });
  // 4 cars 5.3 m apart (centre to centre: 0.42 m short of a car's length), braking together
  const v = (t) => Math.max(15, 70 - 40 * t / 1000), sAt = (t) => { const tt = t / 1000, tb = 55 / 40; return tt < tb ? 70 * tt - 20 * tt * tt : 70 * tb - 20 * tb * tb + 15 * (tt - tb); };
  const fs = ["A", "B", "C", "D"].map((n, i) => [n, (t) => ({ s: 2000 - 5.3 * i + sAt(t), vs: v(t) })]);
  const { rec } = await run(T, fs, env, 0, 4000, 40);
  for (const fr of rec) {
    for (const n of ["A", "B", "C", "D"]) { assert.ok(Math.abs(fr.cars[n].dOff) < 1e-6, "not put alongside"); assert.ok(Math.abs(fr.cars[n].sOff) <= T.TRAFFIC.S_MAX + 1e-6); }
    const order = ["A", "B", "C", "D"].map((n) => fr.cars[n].s + fr.cars[n].sOff);
    for (let i = 1; i < 4; i++) assert.ok(order[i] < order[i - 1], "the order along the lap stays");
  }
  const fr = rec.at(-1);
  for (const [a, b] of [["A", "B"], ["B", "C"], ["C", "D"]]) assert.strictEqual(drawnDepth(T, env, fr, a, b), 0, `${a}/${b} clear`);
});

test("queue too tight for the limits: the overlap left is recorded, no pile-up push", async () => {
  const T = await import("../src/renderer/traffic.js");
  const env = straight(T, { width: 3 });   // (no room alongside)
  // 6 cars 4.5 m apart: 1.6 m short each – 8 m in all, more than ±S_MAX can make
  const fs = Array.from({ length: 6 }, (_, i) => [String(i), (t) => ({ s: 3000 - 4.5 * i + 20 * t / 1000, vs: 20 })]);
  const { rec } = await run(T, fs, env, 0, 3000, 50);
  const fr = rec.at(-1);
  let left = 0;
  for (let i = 0; i < 6; i++) { const c = fr.cars[String(i)]; assert.ok(Math.abs(c.sOff) <= T.TRAFFIC.S_MAX + 1e-6, "within S_MAX"); left = Math.max(left, c.res); }
  assert.ok(left > 0.05, "what's left is reported, not hidden");
  for (let i = 1; i < 6; i++) assert.ok(fr.cars[String(i)].s + fr.cars[String(i)].sOff < fr.cars[String(i - 1)].s + fr.cars[String(i - 1)].sOff, "order kept");
});

test("narrow road, alongside in the data (no room across): along within the limit, the rest recorded", async () => {
  const T = await import("../src/renderer/traffic.js");
  const env = straight(T, { width: 2.2 });   // 4.4 m of tarmac: two cars' centres at most 2.6 m apart (need 2.3 + room)
  const fs = [["A", (t) => ({ s: 800.5 + 20 * t / 1000, vs: 20 })], ["B", (t) => ({ s: 800 + 20 * t / 1000, vs: 20 })]];
  const narrow = straight(T, { width: 1.5 });   // 3 m: no room at all
  const { rec } = await run(T, fs, narrow, 0, 3000, 50);
  const fr = rec.at(-1);
  assert.ok(Math.abs(fr.cars.A.sOff - fr.cars.B.sOff) <= T.TRAFFIC.LONG_MAX + 1e-6, "along within LONG_MAX");
  assert.ok(fr.cars.A.res > 0.05 && fr.cars.B.res > 0.05, "the overlap that can't be removed is recorded");
  assert.ok(fr.cars.A.s + fr.cars.A.sOff > fr.cars.B.s + fr.cars.B.sOff, "never drawn past each other");
  // with room for two: parted across
  const { rec: r2 } = await run(T, fs, env, 0, 3000, 50);
  assert.strictEqual(drawnDepth(T, env, r2.at(-1), "A", "B"), 0);
});

test("different levels (a bridge, the pit lane under the track) don't interact; the lap's end wraps", async () => {
  const T = await import("../src/renderer/traffic.js");
  const env = straight(T, { L: 3000 });
  const { rec } = await run(T, [["A", (t) => ({ s: 100 + t / 100, vs: 10, y: 0 })], ["B", (t) => ({ s: 100.5 + t / 100, vs: 10, y: 6 })]], env, 0, 2000, 50);
  assert.strictEqual(rec.at(-1).cars.A.dOff, 0); assert.strictEqual(rec.at(-1).cars.B.dOff, 0);
  // across the line: 2999 and 1.5 (+L) are 2.5 m apart – a pair
  const { rec: r2 } = await run(T, [["A", (t) => ({ s: 1.5 + t / 100, vs: 10 })], ["B", (t) => ({ s: 2999 + t / 100, vs: 10 })]], env, 0, 2000, 50);
  const f = r2.at(-1);
  assert.ok(Math.abs(f.cars.A.d + f.cars.A.dOff - f.cars.B.d - f.cars.B.dOff) > 2.2 || f.cars.A.sOff - f.cars.B.sOff > 0, "parted over the line");
  assert.strictEqual(drawnDepth(T, env, f, "A", "B"), 0);
});

test("live: no future data is read (passes from the closing speed); replay may look ahead", async () => {
  const T = await import("../src/renderer/traffic.js");
  const fa = (t) => ({ s: 1000 + 40 * t / 1000, vs: 40 }), fb = (t) => ({ s: 970 + 46 * t / 1000, vs: 46 });
  const log = [], env = straight(T, { live: true, tracks: { A: (t) => fa(t).s, B: (t) => fb(t).s }, peekLog: log });
  const S = T.makeTraffic(); let worst = 0, pass = 0;
  for (let t = 0; t <= 12000; t += 50) {
    const n0 = log.length;
    const list = [car("A", fa(t).s, 0, 40), car("B", fb(t).s, 0, 46)];
    const out = T.stepTraffic(S, list, env, t);
    for (const x of log.slice(n0)) assert.ok(x <= t, `live peeked at t+${x - t} ms`);
    if (out.get("B").mode === "pass") pass++;
    const fr = { cars: { A: { s: list.find((c) => c.num === "A").s, d: 0, ...pick(out.get("A")) }, B: { s: list.find((c) => c.num === "B").s, d: 0, ...pick(out.get("B")) } } };
    worst = Math.max(worst, drawnDepth(T, env, fr, "A", "B"));
  }
  assert.ok(pass > 20, "the pass is seen live from the closing speed");
  assert.ok(worst < 0.3, `live, without the future: at most a little overlap (${worst.toFixed(2)} m)`);
  // replay: looks ahead (the policy: visual anticipation only)
  const log2 = [], env2 = straight(T, { live: false, tracks: { A: (t) => fa(t).s, B: (t) => fb(t).s }, peekLog: log2 });
  T.stepTraffic(T.makeTraffic(), [car("A", fa(4000).s, 0, 40), car("B", fb(4000).s, 0, 46)], env2, 4000);
  assert.ok(log2.some((x) => x > 4000));
});
const pick = (m) => ({ dOff: m.dOff, sOff: m.sOff, res: m.res });

// (30 fps at 4× steps 133 ms of session a frame: the target is held over the step – within 0.25 m of 60 fps at 1×)
test("same result at any frame rate and playback speed (session time); a seek starts over", async () => {
  const T = await import("../src/renderer/traffic.js");
  const fa = (t) => ({ s: 1000 + 40 * t / 1000, vs: 40 }), fb = (t) => ({ s: 960 + 45 * t / 1000, vs: 45 });
  const env = straight(T, { tracks: { A: (t) => fa(t).s, B: (t) => fb(t).s } });
  const at = (rec, t) => rec.find((f) => Math.abs(f.t - t) < 1e-6);
  const a = (await run(T, [["A", fa], ["B", fb]], env, 0, 12000, 16)).rec;      // 60 fps at 1×
  const b = (await run(T, [["A", fa], ["B", fb]], env, 0, 12000, 133.33333333333334)).rec;   // 30 fps at 4×
  for (const t of [4000, 6000, 8000, 10000]) {
    const fa1 = a.reduce((p, f) => (Math.abs(f.t - t) < Math.abs(p.t - t) ? f : p)), fb1 = b.reduce((p, f) => (Math.abs(f.t - t) < Math.abs(p.t - t) ? f : p));
    if (Math.abs(fa1.t - fb1.t) > 20) continue;
    assert.ok(Math.abs(fa1.cars.B.dOff - fb1.cars.B.dOff) < 0.25, `t ${t}: ${fa1.cars.B.dOff.toFixed(3)} vs ${fb1.cars.B.dOff.toFixed(3)}`);
  }
  // a seek (back, or forward by more than JUMP_MS): the pair memory is cleared and the offsets are the targets at once
  const S = (await run(T, [["A", fa], ["B", fb]], env, 0, 8000, 50)).S;
  assert.ok(S.pairs.size > 0);
  const list = [car("A", fa(2000).s, 0, 40), car("B", fb(2000).s, 0, 46)];
  const out = T.stepTraffic(S, list, env, 2000);
  for (const m of out.values()) { assert.strictEqual(m.dOff, m.tD); assert.strictEqual(m.sOff, m.tS); }
  const fresh = T.stepTraffic(T.makeTraffic(), [car("A", fa(2000).s, 0, 40), car("B", fb(2000).s, 0, 46)], env, 2000);
  for (const [k, m] of out) assert.ok(Math.abs(m.dOff - fresh.get(k).dOff) < 1e-9, "after a seek: as if started there");
  // paused (the same t again): nothing moves
  const again = T.stepTraffic(S, [car("A", fa(2000).s, 0, 40), car("B", fb(2000).s, 0, 46)], env, 2000);
  for (const [k, m] of again) assert.ok(Math.abs(m.dOff - fresh.get(k).dOff) < 1e-9);
});

test("overlap scan helpers: episodes per pair, causes in order of precedence", async () => {
  const T = await import("../src/renderer/traffic.js");
  const log = T.episodeLog(250);
  for (let t = 0; t <= 1000; t += 100) log.add(t, "1/2", 0.5 + t / 1000, "feed:lag", { t });
  log.add(5000, "1/2", 0.2, "smoothing", {});
  const eps = log.finish();
  assert.strictEqual(eps.length, 2);
  assert.strictEqual(eps[0].frames, 11); assert.ok(Math.abs(eps[0].depth - 1.5) < 1e-9); assert.strictEqual(eps[0].cause, "feed:lag");
  const sum = T.summarise(eps, 100);
  assert.strictEqual(sum["feed:lag"].episodes, 1); assert.strictEqual(sum["feed:lag"].durS[2], 1.1);
  const c = (o) => T.classifyOverlap({ pitA: false, pitB: false, est: false, grid: false, aligned: 1, raw: 1, room: 9, need: 2, cancel: false, tgtSep: 0, moved: false, ...o });
  assert.strictEqual(c({ pitA: true, pitB: true }), "pit-lane");
  assert.strictEqual(c({ pitB: true }), "pit-vs-track");
  assert.strictEqual(c({ raw: 0 }), "smoothing");
  assert.strictEqual(c({ room: 1 }), "feed:narrow");
  assert.strictEqual(c({ tgtSep: 3 }), "feed:lag");
  assert.strictEqual(c({ aligned: 0, moved: true }), "correction");
  assert.strictEqual(c({ aligned: 0 }), "pose");
});
