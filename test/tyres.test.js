// The tyre record a stop is played from (replay.js TyreLog): a stint's first message can be corrected seconds later –
// Monaco 2025, Tsunoda's lap-1 stop: stint 1 sent "UNKNOWN", TyresNotChanged "1", then "HARD", new, "0" 5 s later.
// v0.35 kept the first message only: the stop counted as "tyres not changed" – no lift, no wheels off.
const test = require("node:test");
const assert = require("node:assert");
const { TyreLog } = require("../src/renderer/replay.js");

const feed = (log, ms, lines) => log.feed(ms, "TimingAppData", { Lines: lines });

test("tyre log: a stint's later correction counts from when it arrived, never before", () => {
  const log = new TyreLog();
  feed(log, 1000, { 22: { Stints: [{ Compound: "MEDIUM", New: "true", TyresNotChanged: "0", TotalLaps: 0 }] } });
  feed(log, 3481439, { 22: { Stints: { 0: { TotalLaps: 1 }, 1: { Compound: "UNKNOWN", New: "false", TyresNotChanged: "1", TotalLaps: 0 } } } });
  feed(log, 3486388, { 22: { Stints: { 1: { Compound: "HARD", New: "true", TyresNotChanged: "0" } } } });
  feed(log, 3591410, { 22: { Stints: { 1: { TotalLaps: 1 } } } });                  // a lap count: no change
  const all = log.list("22");
  assert.strictEqual(all.length, 2);
  assert.deepStrictEqual(all[1], { ms: 3481439, idx: 1, compound: "HARD", isNew: true, changed: true });
  // as known in between: the first message
  assert.deepStrictEqual(log.list("22", 3484000)[1], { ms: 3481439, idx: 1, compound: "UNKNOWN", isNew: false, changed: false });
  assert.strictEqual(log.list("22", 3000000).length, 1, "not yet sent");
});

test("tyre log: a red flag's 'not changed' stays so; a field sent alone corrects only itself", () => {
  const log = new TyreLog();
  feed(log, 10, { 4: { Stints: [{ Compound: "SOFT", New: "true", TyresNotChanged: "0" }] } });
  feed(log, 20, { 4: { Stints: { 1: { Compound: "SOFT", New: "false", TyresNotChanged: "1" } } } });
  assert.strictEqual(log.list("4")[1].changed, false);
  feed(log, 30, { 4: { Stints: { 1: { New: "true" } } } });
  assert.deepStrictEqual(log.list("4")[1], { ms: 20, idx: 1, compound: "SOFT", isNew: true, changed: false });
  // a stint whose first message has no compound is listed once one comes (as before)
  feed(log, 40, { 4: { Stints: { 2: { TotalLaps: 0 } } } });
  assert.strictEqual(log.list("4").length, 2);
  feed(log, 50, { 4: { Stints: { 2: { Compound: "HARD", New: "true" } } } });
  assert.deepStrictEqual(log.list("4")[2], { ms: 50, idx: 2, compound: "HARD", isNew: true, changed: true });
});

test("tyre log → stop plan: the corrected stint makes the record's stop a tyre change", async () => {
  const { stopPlan } = await import("../src/renderer/pitstate.js");
  const log = new TyreLog();
  feed(log, 3481439, { 22: { Stints: { 1: { Compound: "UNKNOWN", New: "false", TyresNotChanged: "1" } } } });
  feed(log, 3486388, { 22: { Stints: { 1: { Compound: "HARD", New: "true", TyresNotChanged: "0" } } } });
  const p = stopPlan({ t: 3466000, t0: 3463830, t1: 3466330, tyres: log.list("22"), stopTime: 2.6, policy: "record" });
  assert.strictEqual(p.kind, "tyres");
  assert.strictEqual(p.compound, "HARD");
});
