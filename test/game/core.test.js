// Game engine core: seeded streams, the fixed-step clock, the runner, orders (DESIGN §2, §3; request §4, §19).
const test = require("node:test");
const assert = require("node:assert");

test("rng: same seed + name → same sequence; streams are independent of each other's use; save/load continues exactly", async () => {
  const { Streams, streamFor } = await import("../../src/game/engine/rng.js");
  const a = new Streams(42), b = new Streams(42);
  const xa = Array.from({ length: 5 }, () => a.get("driver:16").next());
  // b draws 1000 numbers from another stream first – driver:16's sequence must not move
  for (let i = 0; i < 1000; i++) b.get("pit:ferrari").normal();
  const xb = Array.from({ length: 5 }, () => b.get("driver:16").next());
  assert.deepStrictEqual(xa, xb);
  // different seeds / names differ
  assert.notStrictEqual(streamFor(42, "driver:1").next(), streamFor(42, "driver:11").next());
  assert.notStrictEqual(streamFor(42, "x").next(), streamFor(43, "x").next());
  // save mid-way (with a spare normal pending) and continue in a restored copy
  const s = new Streams(7); s.get("w").normal(); const saved = JSON.parse(JSON.stringify(s.save()));
  const cont = Array.from({ length: 6 }, () => s.get("w").normal());
  const { Streams: S2 } = await import("../../src/game/engine/rng.js");
  const r = S2.load(saved), again = Array.from({ length: 6 }, () => r.get("w").normal());
  assert.deepStrictEqual(again, cont);
});

test("rng: uniform and normal look right (mean, variance, range) – not a constant", async () => {
  const { streamFor } = await import("../../src/game/engine/rng.js");
  const r = streamFor(1, "stat"); let m = 0, v = 0, lo = 1, hi = 0; const N = 20000;
  for (let i = 0; i < N; i++) { const x = r.next(); m += x; lo = Math.min(lo, x); hi = Math.max(hi, x); }
  m /= N; assert.ok(Math.abs(m - 0.5) < 0.01 && lo >= 0 && hi < 1, `uniform mean ${m}`);
  m = 0; for (let i = 0; i < N; i++) { const z = r.normal(); m += z; v += z * z; }
  m /= N; v = v / N - m * m; assert.ok(Math.abs(m) < 0.03 && Math.abs(v - 1) < 0.05, `normal mean ${m} var ${v}`);
});

// a toy race for the clock: its "state" accumulates something from every step (order-sensitive), so any split of the
// same sim time into frames must give the same state
const toy = () => ({ state: { t: 0, acc: 0, finished: false } });
const toyStep = (race) => { race.state.acc = (race.state.acc * 31 + race.state.t / 50 + 7) % 1000003; race.state.t += 50; };

test("clock: the same sim time reached by any split into frames (1×, 30×, odd frame times) runs the same steps", async () => {
  const { advanceTo, DT_MS } = await import("../../src/game/engine/clock.js");
  assert.strictEqual(DT_MS, 50);
  const one = toy(); advanceTo(one, toyStep, 600000);
  const many = toy(); let t = 0; const frames = [16.7, 33.3, 7, 250, 1000 / 144];
  for (let i = 0; t < 600000; i++) { t = Math.min(600000, t + frames[i % frames.length] * (i % 3 === 0 ? 30 : 1)); advanceTo(many, toyStep, t); }
  assert.deepStrictEqual(many.state, one.state);
  // never a partial step: the state's time is a whole number of steps
  assert.strictEqual(one.state.t % DT_MS, 0);
});

test("runner: paused → no steps, state unchanged; speed scales sim time per wall time; an impossible speed is reported as behind", async () => {
  const { Runner } = await import("../../src/game/engine/clock.js");
  let wall = 0; const now = () => wall;
  const r = toy(), run = new Runner(r, toyStep, { now, budgetMs: 1e9 });
  const before = JSON.stringify(r.state);
  for (let i = 0; i < 10; i++) { wall += 16; run.frame(); }
  assert.strictEqual(JSON.stringify(r.state), before, "paused");
  run.play(); run.setSpeed(10); run.frame();
  for (let i = 0; i < 60; i++) { wall += 1000 / 60; run.frame(); }
  assert.ok(Math.abs(r.state.t - 10000) <= 100, `10× for 1 s: sim ${r.state.t} ms`);
  assert.ok(Math.abs(run.achieved - 10) < 0.5, `achieved ${run.achieved}`);
  // a step that costs 5 ms of wall time with a 6 ms budget: 1000× can't be kept up
  const slow = toy(), slowStep = (race) => { toyStep(race); wall += 5; };
  const run2 = new Runner(slow, slowStep, { now, budgetMs: 6 }); run2.play(); run2.setSpeed(1000); run2.frame();
  for (let i = 0; i < 30; i++) { wall += 16; run2.frame(); }
  assert.ok(run2.behind, "behind"); assert.ok(run2.achieved < 100, `achieved ${run2.achieved}`);
  // and it never skipped: every step ran (t is steps × 50)
  assert.strictEqual(slow.state.t % 50, 0);
});

test("orders: an id is taken once (double click, key repeat at 30×); unknown types refused; due at the step's time", async () => {
  const C = await import("../../src/game/engine/commands.js");
  const cs = C.newCommandState();
  assert.ok(C.submit(cs, 1000, { id: "a", type: "pit", car: "16", args: { compound: "HARD" } }).ok);
  const d = C.submit(cs, 1000, { id: "a", type: "pit", car: "16" }); assert.ok(!d.ok && d.dup);
  assert.ok(!C.submit(cs, 1000, { id: "b", type: "warp" }).ok);
  assert.ok(!C.submit(cs, 1000, { type: "pit" }).ok);
  assert.deepStrictEqual(C.due(cs, 950).map((c) => c.id), []);
  assert.deepStrictEqual(C.due(cs, 1000).map((c) => c.id), ["a"]);
  assert.deepStrictEqual(C.due(cs, 1050), []);
});
