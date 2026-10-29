// Game weather (DESIGN §9, request §11): truth vs forecast, water per segment – causes and orders, not constants.
const test = require("node:test");
const assert = require("node:assert");
const T = { L: 5000, zones: { cover: [[1000, 1400]] } };   // a 400 m tunnel
const MIN = 60000;
const rec = (fn, minutes = 150) => Array.from({ length: minutes }, (_, m) => ({ t: m * MIN, rain: fn(m), airT: 20, trackT: 28, wind: 2 }));

test("rain stopping doesn't dry the track at once: water drains and dries over minutes; a tunnel stays dry; the racing line dries first with cars", async () => {
  const W = await import("../../src/game/engine/weather.js");
  const truth = W.weatherTruth(rec((m) => (m >= 10 && m < 40 ? 1 : 0)));
  const S = W.newSurface(T), w = {};
  const depth = []; let lineVsOff = null;
  for (let sec = 0; sec < 120 * 60; sec++) {
    W.truthAt(truth, sec * 1000, w);
    for (let i = 0; i < S.n; i++) S.passes[i] = 20 / 90;   // 20 cars every 90 s
    W.surfaceStep(S, w, 1);
    if (sec % 60 === 0) depth.push([sec / 60, W.waterAt(S, 3000), W.waterAt(S, 1200)]);
    if (sec === 50 * 60) lineVsOff = [W.waterAt(S, 3000), W.waterAt(S, 3000, true)];
  }
  const at = (m) => depth.find((d) => d[0] === m);
  assert.strictEqual(at(5)[1], 0, "dry before the rain");
  assert.ok(at(39)[1] > 0.3, `wet by the end of the rain: ${at(39)[1]}`);
  assert.ok(at(42)[1] > 0.2, `still wet 2 min after the rain stopped: ${at(42)[1]}`);
  assert.ok(at(42)[1] < at(39)[1], "draining");
  assert.ok(at(100)[1] < 0.05, `dry-ish an hour later: ${at(100)[1]}`);
  assert.ok(Math.max(...depth.map((d) => d[2])) === 0, "the tunnel never got wet");
  assert.ok(lineVsOff[0] < lineVsOff[1], `the racing line drier than off it 10 min after: ${lineVsOff}`);
});

test("a hotter track and wind dry it faster (evaporation); depth is never negative and stays bounded in a downpour", async () => {
  const W = await import("../../src/game/engine/weather.js");
  const dryTime = (trackT, wind) => {
    const S = W.newSurface(T); S.hLine.fill(1); S.hOff.fill(1);
    for (let sec = 1; sec < 7200; sec++) { W.surfaceStep(S, { rain: 0, trackT, airT: 20, wind }, 1); if (S.hLine[10] < 0.05) return sec; }
    return Infinity;
  };
  assert.ok(dryTime(45, 2) < dryTime(20, 2)); assert.ok(dryTime(30, 8) < dryTime(30, 0));
  const S = W.newSurface(T);
  for (let sec = 0; sec < 3600; sec++) W.surfaceStep(S, { rain: 60, trackT: 20, airT: 15, wind: 0 }, 1);
  for (const x of S.hLine) assert.ok(x >= 0 && x < 10, `bounded ${x}`);
});

test("forecast: the same at any call; never certain; nearer blocks are more accurate than far ones (over many seeds)", async () => {
  const W = await import("../../src/game/engine/weather.js");
  const truth = W.weatherTruth(rec((m) => (m >= 60 && m < 90 ? 1 : 0), 240));
  const a = W.forecastAt(truth, 20 * MIN, 9), b = W.forecastAt(truth, 21 * MIN, 9);
  assert.deepStrictEqual(a, b, "re-issued every 5 min – the same within an issue");
  for (const blk of a.blocks) assert.ok(blk.pRain > 0 && blk.pRain < 1);
  // Brier score of the block containing minute 75 (raining), forecast 10 min vs 55 min ahead
  const brier = (lead) => { let s = 0; for (let seed = 1; seed <= 300; seed++) { const f = W.forecastAt(truth, (75 - lead) * MIN, seed); const blk = f.blocks.find((x) => x.from <= 75 * MIN && x.to > 75 * MIN); s += (1 - blk.pRain) ** 2; } return s / 300; };
  assert.ok(brier(10) < brier(55), `near ${brier(10)} vs far ${brier(55)}`);
});

test("truth: real record → rain minutes and estimated flags (intensity is always an estimate; gaps are estimated); generated is seeded", async () => {
  const W = await import("../../src/game/engine/weather.js");
  const r = rec((m) => (m === 30 ? 1 : 0), 60).filter((p) => p.t < 40 * MIN);   // no record after 40 min
  const tr = W.weatherTruth(r, { minutes: 60 });
  assert.ok(tr.rain[30] > 0 && tr.est[30] === 1); assert.strictEqual(tr.est[20], 0); assert.strictEqual(tr.est[50], 1);
  const g1 = W.weatherTruth([], { mode: "generated", seed: 3 }), g2 = W.weatherTruth([], { mode: "generated", seed: 3 });
  assert.deepStrictEqual([...g1.rain], [...g2.rain]);
  let rainy = 0; for (let s = 1; s <= 40; s++) if (W.weatherTruth([], { mode: "generated", seed: s }).rain.some((x) => x > 0)) rainy++;
  assert.ok(rainy > 3 && rainy < 40, `some generated races have rain: ${rainy}/40`);
});
