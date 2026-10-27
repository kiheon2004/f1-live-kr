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
