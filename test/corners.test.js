// Corner numbers (corners.js): matched to the lap in lap order; riding with a car only the next corners on its own lap,
// never one on a parallel stretch however near; passed ones fade; the helicopter sees those near where it looks; off
const test = require("node:test");
const assert = require("node:assert");
const load = () => import("../src/renderer/corners.js");

// a hairpin circuit: out along z = 0 (x 0 → 1000), back along z = 30 (x 1000 → 0) – the two straights 30 m apart
function hairpin() {
  const pts = []; for (let x = 0; x <= 1000; x += 5) pts.push({ x, z: 0 });
  for (let a = 1; a < 30; a++) { const t = (a / 30) * Math.PI; pts.push({ x: 1000 + Math.sin(t) * 15, z: 15 - Math.cos(t) * 15 }); }
  for (let x = 1000; x >= 5; x -= 5) pts.push({ x, z: 30 });
  for (let a = 1; a < 30; a++) { const t = (a / 30) * Math.PI; pts.push({ x: -Math.sin(t) * 15, z: 15 + Math.cos(t) * 15 }); }
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const L = cum[cum.length - 1] + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
  return { pts, cum, L };
}

test("corner stations: in lap order – a corner between two parallel stretches goes on the one after the corner before", async () => {
  const { cornerStations } = await load();
  const { pts, cum, L } = hairpin();
  // T1 at the far hairpin; T2 a kink on the way back at x = 400, drawn 14 m from the outbound straight and 16 m from the
  // return one (nearer the wrong one)
  const st = cornerStations([{ n: 1, x: 1012, z: 15 }, { n: 2, x: 400, z: 14 }], pts, cum, L);
  const t2 = st.find((k) => k.n === 2);
  assert.strictEqual(pts[t2.i].z, 30, "T2 on the return straight");
  assert.ok(t2.s > st.find((k) => k.n === 1).s);
});

test("corner numbers riding with a car: the next ones ahead on its lap, not the hairpin's other side; passed ones fade", async () => {
  const { cornerStations, cornerTargets, CORNERS } = await load();
  const { pts, cum, L } = hairpin();
  const ks = [{ n: 1, x: 1012, z: 15 }, { n: 2, x: 600, z: 31 }, { n: 3, x: -12, z: 15 }];
  const st = cornerStations(ks, pts, cum, L).map((k) => ({ ...k, x: pts[k.i].x, z: pts[k.i].z }));
  const s1 = st.find((k) => k.n === 1).s, s2 = st.find((k) => k.n === 2).s;
  // a car on the outbound straight at x = 640: T2 is 1 m away across the gap but ~800 m on along the lap – not shown;
  // T1 ~400 m ahead: shown (fading in)
  const at = (carS, prev) => cornerTargets(st, { mode: "near", cam: "chase", carS, L, prev });
  let T = at(640);
  assert.strictEqual(T.get(2), 0, "the corner on the parallel straight");
  assert.ok(T.get(1) > 0 && T.get(1) <= 1);
  T = at(s1 - 100); assert.strictEqual(T.get(1), 1);
  // past T1: gone within CORNERS.passed m, T2 then the next
  assert.ok(at(s1 + 5).get(1) > 0 && at(s1 + 5).get(1) < 1);
  assert.strictEqual(at(s1 + CORNERS.passed + 1).get(1), 0);
  assert.strictEqual(at(s2 - 50).get(2), 1);
  assert.strictEqual(at(s2 - 50).get(1), 0);
  // more than CORNERS.ahead m before: not yet; the margin keeps a shown one shown a bit further (no blinking)
  const edge = s1 - CORNERS.ahead - 10;
  assert.strictEqual(at(edge).get(1), 0);
  assert.ok(at(edge, new Map([[1, 0.5]])).get(1) > 0);
  // at most CORNERS.next at once
  assert.ok([...at(s1 - 50).values()].filter((a) => a > 0).length <= CORNERS.next);
});

test("corner numbers: off shows none; all shows every one; the helicopter those near where it looks", async () => {
  const { cornerTargets, easeAlpha, cornerScale } = await load();
  const st = [{ n: 1, s: 0, x: 0, z: 0 }, { n: 2, s: 500, x: 300, z: 0 }, { n: 3, s: 2000, x: 2500, z: 0 }];
  assert.deepStrictEqual([...cornerTargets(st, { mode: "off", cam: "chase", carS: 0, L: 3000 }).values()], [0, 0, 0]);
  assert.deepStrictEqual([...cornerTargets(st, { mode: "all", cam: "heli", L: 3000 }).values()], [1, 1, 1]);
  const H = cornerTargets(st, { mode: "near", cam: "heli", L: 3000, look: { x: 0, z: 0 }, height: 200 });
  assert.deepStrictEqual([H.get(1), H.get(2), H.get(3)], [1, 1, 0]);
  const high = cornerTargets(st, { mode: "near", cam: "heli", L: 3000, look: { x: 0, z: 0 }, height: 2000 });
  assert.strictEqual(high.get(3), 1, "high up: a wider circle");
  // eased, not switched
  const a = easeAlpha(0, 1, 1 / 60); assert.ok(a > 0 && a < 0.2);
  // on screen: never a dot, never a blot
  assert.strictEqual(cornerScale(3000, 60), 0.018); assert.strictEqual(cornerScale(2, 60), 0.042);
});
