// Team AI (src/game/engine/ai.js): acts only through the engine's orders; no information leaks (the weather truth's
// future, other teams' hidden state); hands off a player's car once ordered; tendencies are per-race draws; reactions to
// events (SC) through the estimator. Full-race distributions are in src/game/tools/aival.mjs (report).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const SC = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game/2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), "utf8"));
const E = () => import("../../src/game/engine/engine.js"), AIm = () => import("../../src/game/engine/ai.js");
const clone = (o) => JSON.parse(JSON.stringify(o));
const fixedFc = (race) => { const t0 = Math.floor(race.state.t / 300000) * 300000; return { issued: t0, blocks: Array.from({ length: 8 }, (_, j) => ({ from: t0 + j * 900000, to: t0 + (j + 1) * 900000, pRain: 0.1 + 0.05 * (j % 3) })) }; };

test("the AI changes nothing but its own state and the order queue (orders act through the engine, from the next step)", async () => {
  const { createRace, step } = await E(), { aiStep } = await AIm();
  const r = createRace({ scenario: SC, seed: 4, ai: true });
  for (let i = 0; i < 2600; i++) step(r);   // ≈ 2 laps: lap decisions happen around here
  let decisions = 0;
  for (let k = 0; k < 400; k++) {
    step(r);
    const before = clone({ ...r.state, ai: null, commands: null }), q0 = r.state.commands.queue.length;
    for (const team in r.state.ai.teams) for (const num in r.state.ai.teams[team].cars) if (r.state.ai.teams[team].cars[num].lastLap > 0) r.state.ai.teams[team].cars[num].lastLap--; // force lap decisions
    aiStep(r);
    assert.deepStrictEqual(clone({ ...r.state, ai: null, commands: null }), before, "race state untouched by the AI");
    for (const c of r.state.commands.queue.slice(q0)) { decisions++; assert.match(c.by, /^ai:/); assert.ok(["pace", "energy", "pit", "pitCancel", "plan", "teamOrder"].includes(c.type)); }
    if (decisions > 10) break;
  }
  assert.ok(decisions > 0, "the AI did order something");
  // the orders go through the engine's validation like the player's (logged with the result)
  for (let i = 0; i < 40; i++) step(r);
  assert.ok(r.state.commands.log.some((c) => c.by.startsWith("ai:") && c.ok));
});

test("no weather leak: same forecast, different weather truth after 45 min → identical AI orders up to 30 min", async () => {
  const { createRace, step } = await E();
  const mk = (wetLater) => { const r = createRace({ scenario: SC, seed: 7, ai: true }); r.cache.forecastFn = fixedFc; if (wetLater) for (let m = 45; m < r.cache.truth.n; m++) r.cache.truth.rain[m] = 6; return r; };
  const a = mk(false), b = mk(true);
  while (a.state.t < 30 * 60000) { step(a); step(b); }
  assert.ok(a.state.commands.log.filter((c) => c.by.startsWith("ai:")).length > 5);
  assert.deepStrictEqual(b.state.commands.log, a.state.commands.log);
  assert.deepStrictEqual(b.state.ai, a.state.ai);
  // (the forecast the engine would really issue does depend on the truth: with it the AI would see the rain coming)
});

test("no hidden-state leak: other teams' tyre wear, fuel, energy and modes don't change a team's decision", async () => {
  const { createRace, step } = await E(), { aiStep } = await AIm();
  const r = createRace({ scenario: SC, seed: 8, ai: { teams: ["Williams"] } });
  for (let i = 0; i < 14000; i++) step(r);   // ≈ 11 laps
  const json = clone(r.state);
  const decideWith = (mutate) => {
    const x = { ...r, state: clone(json) };
    if (mutate) for (const c of x.state.cars) if (c.teamKey !== "Williams") { c.tyre.wear = 0.99; c.tyre.Ts = 140; c.energy.fuel = 3; c.energy.soc = 0; c.mode.pace = "attack"; c.mode.energy = "harvest"; c.plan = { stints: [{ compound: "SOFT", toLap: 12 }, { compound: "HARD", toLap: 70 }] }; }
    for (const n in x.state.ai.teams.Williams.cars) x.state.ai.teams.Williams.cars[n].lastLap--;
    x.state.ai.teams.Williams.cars[Object.keys(x.state.ai.teams.Williams.cars)[0]].nextFull = 0;
    const w0 = x.state.ai.work.decisions; aiStep(x);
    // what the decision produced: its orders (if any – a plan that still fits needs none), the team's estimates and log
    return { full: x.state.ai.work.decisions - w0, orders: x.state.commands.queue.map((c) => ({ ...c, id: "" })), team: x.state.ai.teams.Williams };
  };
  const a = decideWith(false); assert.ok(a.full > 0, "a full re-plan was made");
  assert.deepStrictEqual(decideWith(true), a);
});

test("player's team: the AI gives defaults, then hands a car off for the kinds of orders the player has given it", async () => {
  const { createRace, step, command } = await E();
  const r = createRace({ scenario: SC, seed: 3, ai: true, userTeam: "McLaren" });
  assert.match(r.state.cars.find((c) => c.num === "81").plan.by, /^ai:McLaren/, "AI default plan for the player's car");
  command(r, { id: "me1", type: "plan", car: "81", args: { stints: [{ compound: "MEDIUM", toLap: 30 }, { compound: "HARD", toLap: 70 }] }, by: "player" });
  command(r, { id: "me2", type: "pace", car: "81", args: { mode: "attack" }, by: "player" });
  for (let i = 0; i < 12000; i++) step(r);
  const mine = r.state.commands.log.filter((c) => c.car === "81" && c.by.startsWith("ai:") && c.tEff > 100);
  assert.ok(!mine.some((c) => ["plan", "pit", "pitCancel", "pace"].includes(c.type)), "no AI strategy/pace orders for a car the player ordered");
  assert.strictEqual(r.state.cars.find((c) => c.num === "81").plan.by, "player");
  // the teammate the player didn't touch is still run by the AI: its plan is the AI's and the AI keeps deciding for it
  // (orders only when something needs changing – with tyres that last, ten laps may need none)
  const c4 = r.state.ai.teams.McLaren.cars["4"], car4 = r.state.cars.find((c) => c.num === "4");
  assert.match(car4.plan.by, /^ai:McLaren/); assert.strictEqual(c4.lastLap, car4.lap, "decided at its last lap");
  assert.ok(c4.nextFull > 0, "full re-plans for it");
});

test("tendencies: drawn per race and team inside the documented ranges – different seeds, different weekends", async () => {
  const { createRace } = await E();
  const t = (seed) => createRace({ scenario: SC, seed, ai: true }).state.ai.teams;
  const a = t(1), b = t(2);
  for (const k in a) { const x = a[k].tend; assert.ok(x.delay >= 1 && x.hyst >= 0.3 && Number.isFinite(x.risk)); }
  assert.notDeepStrictEqual(a.Ferrari.tend, b.Ferrari.tend);
  const risks = Object.values(a).map((x) => x.tend.risk); assert.ok(Math.max(...risks) - Math.min(...risks) > 0.05, "teams differ within a race");
});

test("SC deployed: the AI re-plans after its reaction delay and boxes cars whose stop was near (a cheaper stop)", async () => {
  const { createRace, step } = await E();
  const r = createRace({ scenario: SC, seed: 5, ai: true });
  while (r.state.leaderLap < 9) step(r);
  // a stand-in race control (the control module may be absent): the flag the AI reads – race.state.control.flag
  r.state.control = { ...(r.state.control || {}), flag: "sc" };
  const t0 = r.state.t;
  for (let i = 0; i < 400; i++) step(r);
  const evs = Object.values(r.state.ai.teams).flatMap((T) => T.decisions.filter((d) => d.t >= t0 && /flag:sc/.test(d.why)));
  const firstT = Math.min(...Object.entries(r.state.ai.teams).map(([k, T]) => (T.decisions.find((d) => d.t >= t0 && /flag:sc/.test(d.why)) || { t: Infinity }).t - t0));
  assert.ok(firstT >= 1000, "not before the reaction delay");
  const boxes = r.state.commands.log.filter((c) => c.tEff > t0 && c.by.startsWith("ai:") && c.type === "pit");
  assert.ok(evs.length > 0 || boxes.length > 0, "the SC led to re-plans");
});
