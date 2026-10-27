// v0.45 regression checks: traffic.js's promises over many random close-car setups (3–8 cars, narrow to wide roads,
// across the lap line, replay and live), checked with the same audit the app's Map3D.trafficAudit uses (trafaudit.js).
const test = require("node:test");
const assert = require("node:assert");

const CAR = { front: 2.86, back: 2.86, half: 1.0 };
const L = 3000;
function env(width, tracks, live, log) {
  return { L, live, edges: () => ({ L: width, R: -width }), turnAhead: () => 1, kappa: () => 0,
    peek: (n, t) => { if (log) log.push(t); return tracks[n] ? tracks[n](t) : null; },
    pose(s, d, o) { o.x = -d; o.z = ((s % L) + L) % L; o.yaw = 0; return o; } };
}

test("traffic fuzz: S_MAX per car, the order along the lap, on the tarmac, the data untouched, live never reads ahead", async () => {
  const T = await import("../src/renderer/traffic.js"), Au = await import("../src/renderer/trafaudit.js");
  let seed = 12345; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const A = Au.makeAudit();
  for (let trial = 0; trial < 600; trial++) {
    const n = 3 + Math.floor(R() * 6), width = 1.5 + R() * 6, base = R() < 0.3 ? L - 15 : 500, live = R() < 0.3;
    const cars = []; let s = base;
    for (let i = 0; i < n; i++) { const v = 10 + R() * 50 + (R() - 0.5) * 8, d = (R() - 0.5) * 2 * Math.max(0, width - 1.1), s0 = s; cars.push({ num: String(i), f: (t) => s0 + v * t / 1000, v, d }); s -= R() * 7; }
    const log = [], E = env(width, Object.fromEntries(cars.map((c) => [c.num, c.f])), live, log), S = T.makeTraffic();
    for (let t = 0; t <= 3000; t += 50) {
      const list = cars.map((c) => ({ num: c.num, s: c.f(t), d: c.d, vs: c.v, y: 0, held: false, ...CAR }));
      const keep = list.map((c) => [c.s, c.d]); log.length = 0;
      const out = T.stepTraffic(S, list, E, t);
      if (live) for (const x of log) assert.ok(x <= t, `live peeked ${x - t} ms ahead`);
      for (const c of list) assert.deepStrictEqual([c.s, c.d], keep[+c.num], "the data is never changed");
      Au.auditFrame(A, list, out, T.TRAFFIC, L, t);
    }
  }
  const sum = Au.auditSummary(A);
  assert.ok(sum.pairs > 10000, "close pairs looked at");
  assert.strictEqual(sum.sMax.n, 0, `S_MAX kept: ${JSON.stringify(sum.sMax)}`);
  assert.strictEqual(sum.order.n, 0, `order kept: ${JSON.stringify(sum.order)}`);
  assert.strictEqual(sum.road.n, 0, `kept on the tarmac: ${JSON.stringify(sum.road)}`);
});

test("trafaudit: catches a car past the one ahead, a car beyond S_MAX and one pushed off the tarmac", async () => {
  const T = await import("../src/renderer/traffic.js"), Au = await import("../src/renderer/trafaudit.js");
  const A = Au.makeAudit();
  const list = [{ num: "a", s: 100, d: 0, y: 0, lo: -3, hi: 3 }, { num: "b", s: 103, d: 0, y: 0, lo: -3, hi: 3 }];
  const cars = new Map([["a", { sOff: 2.5, dOff: 3.5, res: 0 }], ["b", { sOff: -1, dOff: 0, res: 0 }]]);
  Au.auditFrame(A, list, cars, T.TRAFFIC, 3000, 0);
  assert.strictEqual(A.order.n, 1); assert.strictEqual(A.sMax.n, 1); assert.strictEqual(A.road.n, 1);
  const d = Au.diffSnaps({ a: { vis: true, x: 0, y: 0, z: 0, yaw: 3.1, trafD: 0, trafS: 0, sepX: 0, sepZ: 0 } }, { a: { vis: true, x: 3, y: 0, z: 4, yaw: -3.1, trafD: 1, trafS: 0, sepX: 0, sepZ: 0 } });
  assert.strictEqual(d.pos.m, 5); assert.ok(d.yaw.m < 0.1, "heading across ±π"); assert.strictEqual(d.trafD.m, 1);
});

// Found by the fuzz above, then in the app (Monaco 2025, Map3D.trafficAudit: 105 car-frames, up to 0.50 m, car 63 at
// +4302.9 s): the eased offset across trails a target that drops (a pair let go) and comes back (taken up again), and
// the drawn car goes past the tarmac's edge by that lag – the target is clamped to the road, the drawn place wasn't.
// Four cars over the lap line, the two behind faster (passes), 7.7 m of tarmac.
test("traffic: the drawn place across stays on the tarmac while the offset eases (a pass train over the lap line)", async () => {
  const T = await import("../src/renderer/traffic.js"), Au = await import("../src/renderer/trafaudit.js");
  const width = 3.83, cars = [[2985, 41.33, 1.705], [2982.873, 37.761, 1.563], [2978.688, 50.217, 1.563], [2972.398, 48.052, 1.808]];
  const f = (c) => (t) => c[0] + c[1] * t / 1000, tracks = Object.fromEntries(cars.map((c, i) => [String(i), f(c)]));
  const E = env(width, tracks, false), S = T.makeTraffic(), A = Au.makeAudit();
  for (let t = 0; t <= 3000; t += 50) {
    const list = cars.map((c, i) => ({ num: String(i), s: f(c)(t), d: c[2], vs: c[1], y: 0, held: false, ...CAR }));
    Au.auditFrame(A, list, T.stepTraffic(S, list, E, t), T.TRAFFIC, L, t);
  }
  assert.strictEqual(A.road.n, 0, `drawn off the tarmac: ${JSON.stringify(Au.auditSummary(A).road)}`);
  assert.strictEqual(A.order.n, 0); assert.strictEqual(A.sMax.n, 0);
});

// A seek (or a rewind) has no memory of which side a pair was parted to; chosen afresh it can be the other side from
// the one playing up to the same moment chose (the next corner turns the other way by then): the car going by is
// drawn on the left when played, on the right after a seek – Monaco 2025, Map3D.seekCheck: 2.8 m across at +50 min,
// 2.6 m at +95 min, 1.3 m at +36.5 min. With env.listAt (the cars at an earlier moment, past data only) a seek plays the
// last few seconds first (traffic.js WARM_MS) and shows what playing shows.
test("traffic: a seek or a rewind shows the sides playing up to the moment shows (the side was chosen seconds before)", async () => {
  const T = await import("../src/renderer/traffic.js");
  const fa = (t) => 1000 + 40 * t / 1000, fb = (t) => 960 + 45 * t / 1000;
  const list = (t) => [{ num: "A", s: fa(t), d: 0, vs: 40, y: 0, held: false, ...CAR }, { num: "B", s: fb(t), d: 0, vs: 45, y: 0, held: false, ...CAR }];
  const log = [], E = { ...env(6, { A: fa, B: fb }, false), L: 5000, turnAhead: (s) => (s < 1200 ? 1 : -1), listAt: (t) => { log.push(t); return list(t); } };
  const S = T.makeTraffic(), play = new Map();
  for (let t = 0; t <= 12000; t += 1000 / 60) { const o = T.stepTraffic(S, list(t), E, t); for (const k of [6000, 7000]) if (Math.abs(t - k) < 8.4) play.set(k, o.get("B").dOff); }
  for (const k of [6000, 7000]) {
    assert.ok(Math.abs(play.get(k)) > 1, "played: parted for the pass");
    log.length = 0;
    const seek = T.stepTraffic(T.makeTraffic(), list(k), E, k).get("B").dOff;   // (a fresh state: a seek from far away)
    assert.ok(Math.abs(seek - play.get(k)) < 0.3, `seek to ${k}: ${seek.toFixed(2)} vs played ${play.get(k).toFixed(2)}`);
    assert.ok(log.every((x) => x < k), "only earlier moments are looked at");
    const back = T.stepTraffic(S, list(k), E, k).get("B").dOff;              // (a rewind from 12 s)
    assert.ok(Math.abs(back - play.get(k)) < 0.3, `rewind to ${k}: ${back.toFixed(2)} vs played ${play.get(k).toFixed(2)}`);
  }
});

// A seek or a rewind: what map3d.js eases from frame to frame – a car's heading (updateCars), separate()'s push in the
// pit lane – was eased from the moment before the seek: Map3D.seekCheck at Monaco 2025 found headings up to 0.72 rad off
// on the first frame after a seek or rewind and a pit-lane car's push 2.1 m off (sliding back over ~1 s; separate()'s
// own `dt > 0.5` rule never fired: the frame time is capped at 0.1 s). The rule both now use (traffic.js timeJump):
test("timeJump: a seek forward, a rewind and the first frame are jumps; playing (up to 30x), a pause and a live resync are not", async () => {
  const { timeJump, TRAFFIC } = await import("../src/renderer/traffic.js");
  assert.strictEqual(typeof timeJump, "function", "traffic.js exports timeJump");
  assert.ok(timeJump(null, 5000), "first frame");
  assert.ok(timeJump(5000, 5000 + TRAFFIC.JUMP_MS + 1), "seek forward");
  assert.ok(timeJump(60000, 40000), "rewind");
  assert.ok(timeJump(60000, 59900), "rewind by 0.1 s");
  for (const d of [1000 / 60, 500, 0, -20]) assert.ok(!timeJump(60000, 60000 + d), `a frame ${d} ms on`);
});
