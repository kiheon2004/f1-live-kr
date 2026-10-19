// v0.41 regression fixes (regress helper): a stop split in two by a position blip.
const test = require("node:test");
const assert = require("node:assert");
const S = () => import("../src/renderer/pitstate.js");

// Monaco 2025, Bortoleto lap 35 (positions, dm, relative ms): still 1.6 s, 2.2 dm in 0.18 s, still 0.8 s, away – one
// 2.4 s stop in the record. The crew's clock started again from 0 at the blip.
const track = (t, x) => ({ t: Float64Array.from(t), x: Float64Array.from(x), y: new Float64Array(t.length), n: t.length });
const BLIPPED = track([-900, -600, -230, 70, 350, 530, 750, 910, 1310, 1490, 1890, 2290, 2550, 2930, 3210, 3410, 3650],
  [0, 10, 20, 20, 20, 20, 20, 20, 21, 23, 23, 23, 29, 49, 62, 81, 100]);

test("a blip inside a standstill (≤ 0.5 m over ≤ 2 steps, still before and after) doesn't split the stop", async () => {
  const { standingForPos, standEndPos, lastStandPos, posSpeed, pitState } = await S();
  // standing from -230 (the last moving sample) right through the blip: its clock never goes back
  let last = -1;
  for (let t = -200; t < 2280; t += 20) { const s = standingForPos(BLIPPED, t); assert.ok(s > last, `standing ${s.toFixed(2)} s at ${t} after ${last.toFixed(2)}`); last = s; }
  assert.ok(Math.abs(standingForPos(BLIPPED, 2200) - 2.43) < 1e-9, String(standingForPos(BLIPPED, 2200)));
  assert.strictEqual(standEndPos(BLIPPED, 500), 2290, "the stop ends where the car drives off, not at the blip");
  assert.strictEqual(standingForPos(BLIPPED, 2400), 0, "drawn moving off");
  const ls = lastStandPos(BLIPPED, 2700, 25, 1); assert.ok(ls && ls.t0 === -230 && ls.t1 === 2290, JSON.stringify(ls));
  // in the blip itself the car is still "in box" (its speed then is 1.2 m/s)
  assert.ok(posSpeed(BLIPPED, 1400) > 1);
  assert.strictEqual(pitState({ inPit: true, onLane: true, u: 100, gStart: 0, gEnd: 400, speed: posSpeed(BLIPPED, 1400), stillFor: standingForPos(BLIPPED, 1400), boxU: 100, boxFrom: "order", race: true }).state, "in box");
});

test("not a blip: a car driving off, a move over 0.5 m, three moving steps, or no samples after it yet (live)", async () => {
  const { standingForPos, standEndPos } = await S();
  // driving off slowly (2, 4, 8 dm steps): never stands again – the stop ends at the first move
  const away = track([0, 250, 500, 750, 1000, 1250, 1500, 1750], [0, 0, 0, 0, 2, 6, 14, 30]);
  assert.strictEqual(standEndPos(away, 300), 750);
  assert.strictEqual(standingForPos(away, 1100), 0);
  // 0.7 m (a car shuffling forward to its marks): two standstills
  const shuffle = track([0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000], [0, 0, 0, 0, 7, 7, 7, 7, 7]);
  assert.strictEqual(standEndPos(shuffle, 300), 750);
  assert.ok(Math.abs(standingForPos(shuffle, 1600) - 0.6) < 1e-9, String(standingForPos(shuffle, 1600)));
  // three moving steps (1 m/s), 0.3 m in all
  const three = track([0, 250, 500, 600, 700, 800, 1050, 1300, 1550], [0, 0, 0, 1, 2, 3, 3, 3, 3]);
  assert.strictEqual(standEndPos(three, 300), 500);
  // live: the blip is the last sample in – not bridged until the samples after it arrive
  const live = { ...BLIPPED, n: 11 };   // (to 1890: one still step after the blip, BLIP.after needs 2)
  assert.strictEqual(standingForPos(live, 1450), 0);
});
