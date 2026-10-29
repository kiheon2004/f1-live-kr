// The integrated engine on a real scenario (Hungary 2025 fixture): determinism, save/restore, pause, any split of sim
// time into frames, order idempotency, pit call → stop → new tyres – request §4, §16, §19.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const SC = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game/2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), "utf8"));
const load = () => import("../../src/game/engine/engine.js");
const clk = () => import("../../src/game/engine/clock.js");
const fingerprint = (race) => JSON.stringify({ t: race.state.t, cars: race.state.cars.map((c) => [c.num, c.s.toFixed(6), c.v.toFixed(6), c.lap, c.tyre.wear.toFixed(9), c.tyre.Ts.toFixed(6), c.energy.fuel.toFixed(6), c.energy.soc.toFixed(3), c.pit.phase]), order: race.state.order });

test("same scenario + seed → identical race; another seed differs (the driver variation)", async () => {
  const E = await load();
  const run = (seed) => { const r = E.createRace({ scenario: SC, seed }); for (let i = 0; i < 6000; i++) E.step(r); return fingerprint(r); };
  assert.strictEqual(run(3), run(3));
  assert.notStrictEqual(run(3), run(4));
});

test("frames: 1× vs 30× vs uneven frames reach the same state at the same sim time; paused → nothing changes", async () => {
  const E = await load(), { advanceTo, Runner } = await clk();
  const a = E.createRace({ scenario: SC, seed: 9 }); advanceTo(a, E.step, 240000);
  const b = E.createRace({ scenario: SC, seed: 9 }); let t = 0, i = 0; while (t < 240000) { t = Math.min(240000, t + [16.7, 250, 33, 1000][i++ % 4] * (i % 2 ? 30 : 1)); advanceTo(b, E.step, t); }
  assert.strictEqual(fingerprint(a), fingerprint(b));
  let wall = 0; const run = new Runner(b, E.step, { now: () => wall, budgetMs: 1e9 });
  const before = fingerprint(b); for (let k = 0; k < 50; k++) { wall += 16; run.frame(); }
  assert.strictEqual(fingerprint(b), before, "paused: unchanged");
});

test("save at 3 min → load → continue: the same race as never saved (RNG, tyres, energy, envelopes, pit state)", async () => {
  const E = await load();
  const a = E.createRace({ scenario: SC, seed: 5 });
  E.command(a, { id: "p1", type: "pit", car: "16", args: { compound: "HARD" }, by: "player" });
  for (let i = 0; i < 3600; i++) E.step(a);
  const saved = E.saveRace(a);
  for (let i = 0; i < 3600; i++) E.step(a);
  const b = E.loadRace(saved, SC); for (let i = 0; i < 3600; i++) E.step(b);
  assert.strictEqual(fingerprint(b), fingerprint(a));
  assert.deepStrictEqual(b.state.log.slice(-5), a.state.log.slice(-5));
});

test("orders: the same id twice acts once; a pit call stops the car and fits the new tyres only at the end of the work; a player can't order another team's car", async () => {
  const E = await load();
  const r = E.createRace({ scenario: SC, seed: 2, userTeam: "Ferrari" });
  assert.ok(E.command(r, { id: "x", type: "pit", car: "16", args: { compound: "HARD" }, by: "player" }).ok);
  assert.ok(!E.command(r, { id: "x", type: "pit", car: "16", args: { compound: "HARD" }, by: "player" }).ok);
  E.command(r, { id: "y", type: "pace", car: "4", args: { mode: "attack" }, by: "player" });
  let fitted = null, workEnd = null;
  for (let i = 0; i < 4 * 60 * 20 && !fitted; i++) {
    E.step(r); const c = r.state.cars.find((x) => x.num === "16");
    if (c.pit.phase === "work") workEnd = c.pit.workEnd;
    if (c.tyre.name === "HARD") fitted = r.state.t;
    if (c.pit.phase === "work") assert.notStrictEqual(c.tyre.name, "HARD", "not before the work ends");
  }
  assert.ok(fitted && workEnd && fitted >= workEnd, `fitted ${fitted} work end ${workEnd}`);
  for (let i = 0; i < 60 * 20; i++) E.step(r);   // (out of the lane)
  const refused = r.state.commands.log.find((c) => c.id === "y"); assert.ok(refused && !refused.ok && /not your car/.test(refused.why));
  const pitLog = r.state.log.filter((e) => e.car === "16" && /pit/.test(e.type)).map((e) => e.type);
  assert.ok(pitLog.includes("pitEntry") && pitLog.includes("pit:work") && pitLog.includes("pitExit"), pitLog.join(","));
});

test("ranges after 10 min: speeds, tyre wear/temperatures, fuel, energy all finite and physical; cars move forward", async () => {
  const E = await load();
  const r = E.createRace({ scenario: SC, seed: 11 });
  const dist0 = new Map(r.state.cars.map((c) => [c.num, c.dist]));
  for (let i = 0; i < 12000; i++) E.step(r);
  for (const c of r.state.cars) {
    assert.ok(c.v >= 0 && c.v < 100, `v ${c.v}`); assert.ok(c.tyre.wear >= 0 && c.tyre.wear <= 1);
    assert.ok(c.tyre.Ts > 0 && c.tyre.Ts < 200 && c.tyre.Tc > 0 && c.tyre.Tc < 200);
    assert.ok(c.energy.fuel >= 0 && c.energy.soc >= 0);
    assert.ok(c.dist > dist0.get(c.num) + 4000, `car ${c.num} moved ${c.dist - dist0.get(c.num)} m`);
  }
});
