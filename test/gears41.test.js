// v0.41: one gear / revs reading for the wheel's shift lights, its screen and the bottom bar (replay.js carAt). v0.40 had
// two: the lights' own sampler (shiftlights.js revsAt) took the next gear from half-way between samples while carAt held
// the earlier sample's gear and blended the revs – between 3rd/12,000 rpm (0 ms) and 4th/10,000 (250 ms), at 150 ms the
// lights showed 4th at 10,000 and the screen 3rd at 10,800; the screen's ≤ 8-a-second repaint added up to 125 ms more.
// When a shift really happened between two ~4 Hz samples is not known: these tests pin the drawing policy (the nearer
// sample, switching half-way), not a shift time.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const K = require("../src/renderer/replay.js");

const noop = new Proxy(() => {}, { get: (t, k) => (k === "canvas" ? {} : noop), apply: () => undefined, set: () => true });
const canvas = () => ({ width: 0, height: 0, getContext: () => noop });
// a car's telemetry from [t, gear, rpm] samples (the replay's channel layout)
const tel = (rows) => ({ t: rows.map((r) => r[0]), gear: rows.map((r) => r[1]), rpm: rows.map((r) => r[2]), v: rows.map(() => 200), thr: rows.map(() => 100), brk: rows.map(() => 0), drs: rows.map(() => 255) });
const label = (g) => (g == null ? "–" : g === 0 ? "N" : String(g));

test("gear/revs: across a gear change gear and revs come from the same sample (never 3rd with 4th gear's falling revs)", () => {
  const car = tel([[0, 3, 12000], [250, 4, 10000]]);
  // the request's case: at 150 ms v0.40's carAt said 3rd at 10,800 – a pair neither sample has
  assert.deepStrictEqual([K.carAt(car, 150).gear, K.carAt(car, 150).rpm], [4, 10000]);
  assert.deepStrictEqual([K.carAt(car, 100).gear, K.carAt(car, 100).rpm], [3, 12000]);
  // every moment between: the pair is one of the two samples' own
  for (let t = 0; t <= 250; t += 5) { const r = K.carAt(car, t); assert.ok((r.gear === 3 && r.rpm === 12000) || (r.gear === 4 && r.rpm === 10000), `${t} ms: ${r.gear}/${r.rpm}`); }
  // the switch half-way (125 ms) – the same rule for a downshift, neutral and an invalid code
  const down = tel([[0, 5, 9000], [250, 4, 10500]]);
  assert.deepStrictEqual([K.carAt(down, 120).gear, K.carAt(down, 120).rpm, K.carAt(down, 130).gear, K.carAt(down, 130).rpm], [5, 9000, 4, 10500]);
  const neutral = tel([[0, 1, 5000], [250, 0, 4000]]);
  assert.deepStrictEqual([K.carAt(neutral, 120).gear, K.carAt(neutral, 130).gear, K.carAt(neutral, 130).rpm], [1, 0, 4000]);
  const bad = tel([[0, 7, 3000], [250, 128, 0]]);   // (the 2026 feed's count-up on a car stopped for good)
  assert.deepStrictEqual([K.carAt(bad, 120).gear, K.carAt(bad, 120).rpm, K.carAt(bad, 130).gear, K.carAt(bad, 130).rpm], [7, 3000, null, 0]);
  // within a gear the revs are still blended
  assert.strictEqual(K.carAt(tel([[0, 6, 10000], [250, 6, 11000]]), 125).rpm, 10500);
});

test("gear/revs: over a gap in the samples the last one is held (no blend, no early switch); 3 s on, no data", () => {
  const car = tel([[0, 3, 11000], [1500, 5, 9000], [1750, 5, 9500]]);
  assert.deepStrictEqual([K.carAt(car, 1200).gear, K.carAt(car, 1200).rpm], [3, 11000]);
  assert.deepStrictEqual([K.carAt(car, 1500).gear, K.carAt(car, 1500).rpm], [5, 9000]);
  const same = tel([[0, 6, 10000], [2000, 6, 11000]]);
  assert.strictEqual(K.carAt(same, 1000).rpm, 10000, "a 2 s gap isn't blended across");
  assert.strictEqual(K.carAt(tel([[0, 6, 10000]]), 3001), null);
  // live: the next sample hasn't come – the last is held, whatever its gear
  assert.deepStrictEqual([K.carAt(tel([[0, 3, 12000]]), 200).gear, K.carAt(tel([[0, 3, 12000]]), 200).rpm], [3, 12000]);
});

test("shift lights and wheel screen: the same gear on every frame through up/down shifts, neutral, an invalid code and a gap", async () => {
  const S = await import("../src/renderer/shiftlights.js"), W = await import("../src/renderer/wheelscreen.js");
  const p = S.profileForWheel({ count: 15 }, "team");
  const rows = [[0, 3, 11800], [250, 4, 10000], [500, 4, 11200], [750, 5, 10100], [1000, 5, 9000], [1250, 4, 10400], [1500, 3, 10800], [1750, 3, 9000],
    [2000, 2, 9500], [2250, 1, 7000], [2500, 0, 4000], [2750, 1, 5000], [3000, 1, 6000], [4600, 2, 9000], [4850, 128, 0], [5100, 128, 0]];
  const car = tel(rows);
  const ws = new W.WheelScreens({ size: 1, every: 125, canvas }); ws.assign([{ num: "4" }]);
  let frames = 0, paints = 0, lastGear = undefined, changes = 0;
  // as map3d.js does each frame: the lights from carLeds(…, src.carAt), the screen from screenModel(carAt) with
  // screenUrgent for what can't wait (~60 frames a second)
  for (let t = 0; t <= 9000; t += 1000 / 60) {
    const r = K.carAt(car, t), leds = S.carLeds(car, t, p, "2026", r);
    paints += ws.update(() => W.screenModel({ car: r, season: 2026 }), t, () => W.screenUrgent(r));
    const shown = JSON.parse(ws.slots[0].key).gear;
    assert.strictEqual(shown, label(r ? r.gear : null), `${t.toFixed(0)} ms: the screen shows the reading's gear`);
    assert.strictEqual(leds.gear ?? null, r ? r.gear : null, `${t.toFixed(0)} ms: the lights use the same reading`);
    if (!(r && r.gear >= 1)) assert.strictEqual(leds.lit, 0, "neutral / invalid / no data: lights off");
    const g = r ? r.gear : "x"; if (g !== lastGear) { changes++; lastGear = g; }
    frames++;
  }
  // not repainted every frame: the ~8-a-second limit plus one paint per gear change / data loss
  assert.ok(paints <= Math.ceil(9000 / 125) + changes + 1 && paints < frames / 3, `${paints} paints in ${frames} frames`);
});

test("wheel screen: a gear change or data loss is painted at once, other changes wait for the rate limit; a new owner at once", async () => {
  const W = await import("../src/renderer/wheelscreen.js");
  const ws = new W.WheelScreens({ size: 1, every: 125, canvas });
  ws.assign([{ num: "16" }]);
  let car = { speed: 200, rpm: 11000, gear: 5 };
  const get = () => W.screenModel({ car, season: 2025 }), q = () => W.screenUrgent(car);
  assert.strictEqual(ws.update(get, 1000, q), 1);
  car = { speed: 201, rpm: 11100, gear: 5 }; assert.strictEqual(ws.update(get, 1010, q), 0, "the revs: wait");
  car = { speed: 201, rpm: 10000, gear: 6 }; assert.strictEqual(ws.update(get, 1020, q), 1, "the gear: at once");
  car = null; assert.strictEqual(ws.update(get, 1030, q), 1, "data lost: at once");
  assert.strictEqual(JSON.parse(ws.slots[0].key).stale, true);
  car = { speed: 0, rpm: 4000, gear: 128 }; assert.strictEqual(ws.update(get, 1040, q), 1, "an invalid gear: at once ('–')");
  // another driver takes the screen: painted at once with their own data, nothing of the last one's
  ws.assign([{ num: "44" }]); car = { speed: 150, rpm: 9000, gear: 3 };
  assert.strictEqual(ws.update(get, 1045, q), 1);
  assert.strictEqual(ws.slots[0].num, "44"); assert.strictEqual(JSON.parse(ws.slots[0].key).gear, "3");
});

test("map3d feeds the lights and the screen from the one reading (src.carAt) and the screen's urgent check", () => {
  const src = fs.readFileSync(require.resolve("../src/renderer/map3d.js"), "utf8");
  assert.match(src, /carLeds\(tel, t, u\.ledProfile, u\.profile\.era, src\.carAt\?\.\(num, t\)/);
  assert.match(src, /wheelScreens\.update\([^\n]*screenUrgent\(src\?\.carAt\?\.\(num, t\)/);
  assert.strictEqual(typeof require("../src/renderer/replay.js").carAt, "function");
  assert.ok(!/export function revsAt/.test(fs.readFileSync(require.resolve("../src/renderer/shiftlights.js"), "utf8")), "no second sampler in the lights");
});
