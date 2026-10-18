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

// v0.37 (review of v0.36): a stint's New / TyresNotChanged sent before its compound were dropped – the stint, opened later
// by its compound alone, read as used tyres, changed
test("tyre log: fields that come before the compound are kept, each from its own arrival", () => {
  const log = new TyreLog();
  feed(log, 1000, { 44: { Stints: { 1: { TyresNotChanged: "1", New: "true" } } } });
  assert.deepStrictEqual(log.list("44", 1500), [], "no compound yet: not listed, nothing guessed");
  feed(log, 2000, { 44: { Stints: { 1: { Compound: "HARD" } } } });
  assert.deepStrictEqual(log.list("44"), [{ ms: 2000, idx: 1, compound: "HARD", isNew: true, changed: false }]);
  // a later New-only correction: from its time only
  feed(log, 3000, { 44: { Stints: { 1: { New: "false" } } } });
  assert.strictEqual(log.list("44", 2500)[0].isNew, true);
  assert.strictEqual(log.list("44", 3000)[0].isNew, false);
  // "not changed" kept to the end when nothing corrects it
  assert.strictEqual(log.list("44")[0].changed, false);
  // a duplicate message changes nothing
  feed(log, 4000, { 44: { Stints: { 1: { Compound: "HARD", New: "false" } } } });
  assert.deepStrictEqual(log.list("44"), [{ ms: 2000, idx: 1, compound: "HARD", isNew: false, changed: false }]);
});

test("tyre log: the session's reset (an array) and _deleted drop stints from then on, not before", () => {
  const log = new TyreLog();
  feed(log, 10, { 1: { Stints: [{ Compound: "SOFT", New: "true" }, { Compound: "MEDIUM", New: "true" }] } });
  feed(log, 20, { 1: { Stints: [] } });
  assert.strictEqual(log.list("1", 15).length, 2);
  assert.strictEqual(log.list("1", 25).length, 0);
  feed(log, 30, { 1: { Stints: [{ Compound: "MEDIUM", New: "true" }] } });
  assert.deepStrictEqual(log.list("1").map((s) => [s.idx, s.compound]), [[0, "MEDIUM"]]);
  feed(log, 40, { 1: { Stints: { 1: { Compound: "HARD" } } } });
  feed(log, 50, { 1: { Stints: { _deleted: ["1"] } } });
  assert.strictEqual(log.list("1", 45).length, 2);
  assert.strictEqual(log.list("1", 55).length, 1);
});

test("tyre log → stop plan: record sees the session's later correction, observed only what had come by then", async () => {
  const { stopPlan } = await import("../src/renderer/pitstate.js");
  const log = new TyreLog();
  feed(log, 3481439, { 22: { Stints: { 1: { Compound: "UNKNOWN", New: "false", TyresNotChanged: "1" } } } });
  feed(log, 3486388, { 22: { Stints: { 1: { Compound: "HARD", New: "true", TyresNotChanged: "0" } } } });
  const base = { t0: 3463830, t1: 3466330, stopTime: 2.6 };
  // during the stop, observed (live or the 'observed' setting): nothing has come yet
  assert.strictEqual(stopPlan({ ...base, t: 3466000, tyres: log.list("22", 3466000), policy: "observed" }).kind, "work");
  // after the first (placeholder) message only: not a tyre change yet
  assert.strictEqual(stopPlan({ ...base, t: 3483000, tyres: log.list("22", 3483000), policy: "observed" }).kind, "work");
  // after the correction: still not this stop's – observed takes only a stint sent before the car left (the record
  // arrives ~15 s after; a live feed never knows during the stop)
  assert.strictEqual(stopPlan({ ...base, t: 3490000, tyres: log.list("22", 3490000), policy: "observed" }).kind, "work");
  // the record, at any moment shown
  assert.strictEqual(stopPlan({ ...base, t: 3466000, tyres: log.list("22"), policy: "record" }).kind, "tyres");
});
