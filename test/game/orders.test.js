// v0.49 §3 / §4 / §5: orders are checked when taken and when applied (a bad order is refused with its reason and never stops
// the race; nobody commands another team's cars by naming themselves "ai:<team>"); the screen applies a car's discrete
// changes (pit phase, the tyre fitted, lap ↔ pit) at their sim time, never early; one list of compounds for engine, AI, UI.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const SC = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game/2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), "utf8"));
const E = () => import("../../src/game/engine/engine.js");

test("orders: a pace order without a car is refused when taken, the race runs on, a correct order after it applies", async () => {
  const { createRace, step, command, commandStatus } = await E();
  const r = createRace({ scenario: SC, seed: 1, userTeam: "McLaren" });
  const bad = command(r, { id: "a", type: "pace", args: { mode: "attack" } });
  assert.strictEqual(bad.ok, false); assert.match(bad.why, /no car/);
  assert.strictEqual(commandStatus(r, "a").state, "refused");
  assert.ok(command(r, { id: "b", type: "pace", car: "4", args: { mode: "attack" } }).ok);
  assert.strictEqual(commandStatus(r, "b").state, "queued", "taken is not applied");
  for (let i = 0; i < 5; i++) step(r);
  assert.strictEqual(commandStatus(r, "b").state, "applied");
  assert.strictEqual(r.state.cars.find((c) => c.num === "4").mode.pace, "attack");
});

test("orders: the player can't order another team (team order, or a car) – also not by naming itself the AI", async () => {
  const { createRace, step, command } = await E();
  const r = createRace({ scenario: SC, seed: 1, userTeam: "McLaren" });
  const t1 = command(r, { id: "t", type: "teamOrder", team: "Ferrari", args: { policy: "swap" } });
  assert.strictEqual(t1.ok, false); assert.match(t1.why, /not your team/);
  const t2 = command(r, { id: "s", type: "pace", car: "16", args: { mode: "attack" }, by: "ai:Ferrari" });
  assert.strictEqual(t2.ok, false); assert.match(t2.why, /not your car/);
  assert.ok(command(r, { id: "m", type: "teamOrder", args: { policy: "hold" } }).ok, "own team (default)");
  for (let i = 0; i < 3; i++) step(r);
  assert.deepStrictEqual(Object.keys(r.state.teamOrders), ["McLaren"]);
  assert.strictEqual(r.state.cars.find((c) => c.num === "16").mode.pace, "balanced");
});

test("orders: arguments – unknown modes, a compound the event doesn't offer, plan end laps out of order or short, duplicate ids, retired cars", async () => {
  const { createRace, step, command, commandStatus } = await E();
  const r = createRace({ scenario: SC, seed: 1, userTeam: "McLaren" }), L = r.state.totalLaps;
  const no = (cmd, re) => { const x = command(r, cmd); assert.strictEqual(x.ok, false, JSON.stringify(cmd)); assert.match(x.why, re); };
  no({ id: "1", type: "energy", car: "4", args: { mode: "warp" } }, /unknown energy/);
  no({ id: "2", type: "pit", car: "4", args: { compound: "C9" } }, /not offered/);
  no({ id: "3", type: "plan", car: "4", args: { stints: [{ compound: "MEDIUM", toLap: 30 }, { compound: "HARD", toLap: 20 }] } }, /not after/);
  no({ id: "4", type: "plan", car: "4", args: { stints: [{ compound: "MEDIUM", toLap: 30.5 }, { compound: "HARD", toLap: L }] } }, /whole number/);
  no({ id: "5", type: "plan", car: "4", args: { stints: [{ compound: "MEDIUM", toLap: 30 }, { compound: "HARD", toLap: L - 5 }] } }, /before the finish/);
  no({ id: "6", type: "plan", car: "4", args: { stints: [{ compound: "MEDIUM", toLap: NaN }] } }, /whole number/);
  no({ id: "7", type: "nonsense", car: "4" }, /unknown type/);
  no({ id: "8", type: "pace", car: "99", args: { mode: "attack" } }, /no car 99/);
  assert.ok(command(r, { id: "9", type: "pit", car: "4", args: { compound: "INTERMEDIATE" } }).ok, "wet tyres are offered at every event (dry race or not)");
  const dup = command(r, { id: "9", type: "pit", car: "4", args: { compound: "INTERMEDIATE" } }); assert.ok(dup.dup);
  // a retired car: refused when it is applied
  step(r); const c4 = r.state.cars.find((c) => c.num === "81"); c4.status = "dnf";
  assert.ok(command(r, { id: "10", type: "pace", car: "81", args: { mode: "manage" } }).ok);
  step(r); step(r);
  const st = commandStatus(r, "10"); assert.strictEqual(st.state, "refused"); assert.match(st.why, /dnf/);
});

test("orders: an order that throws while applied is refused with the reason and the race goes on", async () => {
  const { createRace, step, command, commandStatus } = await E();
  const r = createRace({ scenario: SC, seed: 1, userTeam: "McLaren" });
  assert.ok(command(r, { id: "x", type: "pace", car: "4", args: { mode: "attack" } }).ok);
  const car = r.state.cars.find((c) => c.num === "4"), d = car.driver; car.driver = null;   // (forced fault)
  step(r); car.driver = d;
  assert.strictEqual(commandStatus(r, "x").state, "refused"); assert.match(commandStatus(r, "x").why, /internal error/);
  for (let i = 0; i < 100; i++) step(r);
  assert.ok(r.state.t >= 5000);
});

test("compounds: engine, AI estimator and screens share one list – the nomination plus both wet tyres, never the compounds the race happened to use", async () => {
  const { availableCompounds } = await import("../../src/game/engine/compounds.js");
  const S = await import("../../src/game/engine/strategy.js"), { createRace } = await E();
  const A = availableCompounds(SC);
  assert.deepStrictEqual(A.list.map((c) => c.name), ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"]);
  assert.strictEqual(A.est, false); assert.strictEqual(A.inventory, false);
  const r = createRace({ scenario: SC, seed: 1 });
  for (const c of A.list) assert.strictEqual(r.cache.alloc[c.name], c.code, `engine maps ${c.name} like the shared list`);
  const av = S.available(r); assert.deepStrictEqual([...av.dry, ...av.wet], A.list.map((c) => c.name));
  // without a nomination: S/M/H with an assumed mapping, said so – the race's own compound list plays no part
  const odd = { ...SC, meta: { ...SC.meta, id: "2099-01-01_Nowhere_Grand_Prix_2099-01-01_Race" }, tyres: { compoundsSeen: ["HARD"] } };
  const B = availableCompounds(odd); assert.strictEqual(B.est, true); assert.deepStrictEqual(B.dry, ["SOFT", "MEDIUM", "HARD"]);
});

test("render time: a stop's release and new tyres appear at the engine's change time, not at the next snapshot (a 1000 / b 2000 / change 1800, drawn at 1100 and 1900)", async () => {
  const { discreteAt } = await import("../../src/renderer/game/adapter3d.js");
  const ca = { num: "4", where: "pit", status: "pit", pit: { phase: "work" }, tyre: { compound: "MEDIUM", code: "C3" } };
  const cb = { num: "4", where: "pit", status: "pit", pit: { phase: "release", workT1: 1800 }, tyre: { compound: "HARD", code: "C2" },
    trans: [{ t: 400, set: { phase: "work" } }, { t: 1800, set: { phase: "release", tyre: "HARD", code: "C2" } }] };
  const at1100 = discreteAt(ca, cb, 1000, 1100); assert.strictEqual(at1100.phase, "work"); assert.strictEqual(at1100.tyre, "MEDIUM");
  const at1900 = discreteAt(ca, cb, 1000, 1900); assert.strictEqual(at1900.phase, "release"); assert.strictEqual(at1900.tyre, "HARD");
  // two changes between the snapshots keep their order
  const cc = { ...cb, trans: [{ t: 1200, set: { phase: "release" } }, { t: 1500, set: { phase: "laneOut" } }, { t: 1900, set: { where: "lap", phase: "none" } }] };
  assert.strictEqual(discreteAt(ca, cc, 1000, 1300).phase, "release"); assert.strictEqual(discreteAt(ca, cc, 1000, 1600).phase, "laneOut");
  const end = discreteAt(ca, cc, 1000, 1950); assert.strictEqual(end.where, "lap"); assert.strictEqual(end.phase, "none");
});

test("render time: the engine records each car's discrete changes with their sim times (a real stop: entry, work, tyre change, exit)", async () => {
  const { createRace, step, command, snapshot } = await E();
  const r = createRace({ scenario: SC, seed: 4 });
  command(r, { id: "p", type: "pit", car: "4", args: { compound: "HARD" } });
  const seen = []; let last = null;
  for (let i = 0; i < 20 * 160; i++) { step(r); const c = snapshot(r).cars.find((x) => x.num === "4"); for (const e of c.trans) if (!last || e.t > last) { seen.push(e); last = e.t; } }
  const tyreAt = seen.find((e) => e.set.tyre === "HARD")?.t, workDone = r.state.log.find((e) => e.car === "4" && e.type === "pit:workDone")?.t;
  assert.ok(seen.some((e) => e.set.where === "pit") && seen.some((e) => e.set.where === "lap"), "into the lane and out");
  assert.ok(tyreAt != null && workDone != null && tyreAt === workDone, `new tyre recorded at the work's end (${tyreAt} vs ${workDone})`);
});
