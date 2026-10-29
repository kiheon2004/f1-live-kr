// Strategy estimator (src/game/engine/strategy.js): the team's lap-time model, candidates, rules, scenarios, the pre-race
// screen data – behaviour and causality (more wear → more stops, bigger pit loss → fewer, an SC makes "box now" cheap,
// a rain forecast puts water in the scenarios), and what the estimator may NOT read.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const FIX = path.join(__dirname, "../fixtures/game");
const sc = (name) => JSON.parse(fs.readFileSync(path.join(FIX, fs.readdirSync(FIX).find((f) => f.includes(name) && f.endsWith(".scenario.json"))), "utf8"));
const HUN = sc("2025-08-03_Hungarian"), MON = sc("2025-05-25_Monaco");
const E = () => import("../../src/game/engine/engine.js"), ST = () => import("../../src/game/engine/strategy.js");
const P = () => import("../../src/game/data/params/ai.js"), PARAM = () => import("../../src/game/data/params/param.js");

test("AI params: every entry documented, inside its range, labelled a game estimate", async () => {
  const { AI_TABLE } = await P(), { entries } = await PARAM();
  const es = entries(AI_TABLE); assert.ok(es.length > 30);
  for (const e of es) {
    assert.ok(e.unit && e.meaning && e.source && Array.isArray(e.range), e.key);
    assert.strictEqual(e.est, true, e.key + " is a game estimate");
    if (typeof e.v === "number") assert.ok(e.v >= e.range[0] && e.v <= e.range[1], `${e.key} ${e.v} in ${e.range}`);
  }
});

test("team model: deterministic per seed+team; laps slower with age (after warm-up), with fuel, on the wrong tyre for the water; finite", async () => {
  const { createRace } = await E(), S = await ST();
  const a = S.teamModel(createRace({ scenario: HUN, seed: 3 }), "McLaren"), b = S.teamModel(createRace({ scenario: HUN, seed: 3 }), "McLaren");
  assert.deepStrictEqual([...a.vs.MEDIUM.balanced.mu], [...b.vs.MEDIUM.balanced.mu]);
  assert.strictEqual(a.lanePrior, b.lanePrior);
  const c = S.teamModel(createRace({ scenario: HUN, seed: 4 }), "McLaren");
  assert.notStrictEqual(a.belief.MEDIUM.kw, c.belief.MEDIUM.kw, "another seed: another (unknown) error in the team's tyre belief");
  const n = a.nums[0];
  for (const cmp of a.av.dry) {
    const lt = (age, fuel) => S.lapTime(a, {}, n, cmp, "balanced", age, 0, fuel);
    assert.ok(lt(25) > lt(2), `${cmp}: an old tyre is slower`);
    assert.ok(lt(5, 100) > lt(5, 20), `${cmp}: heavier is slower`);
    for (let k = 0; k < 60; k++) assert.ok(Number.isFinite(lt(k)) && lt(k) > 40 && lt(k) < 200);
  }
  // water: slicks lose a lot on 2 mm, inters lose little → the inter is faster there and slower on a dry track
  assert.ok(S.lapTime(a, {}, n, "MEDIUM", "balanced", 3, 2) > S.lapTime(a, {}, n, "INTERMEDIATE", "balanced", 3, 2));
  assert.ok(S.lapTime(a, {}, n, "MEDIUM", "balanced", 3, 0) < S.lapTime(a, {}, n, "INTERMEDIATE", "balanced", 3, 0));
  // pit loss: lane > the same stretch on track; an SC makes it smaller, a VSC in between
  assert.ok(a.lanePrior > a.refPit + 5);
  assert.ok(S.pitLoss(a, {}, "sc") < S.pitLoss(a, {}, "vsc") && S.pitLoss(a, {}, "vsc") < S.pitLoss(a, {}));
});

test("team model reads only its own car: another team's car coefficients don't change it", async () => {
  const { createRace } = await E(), S = await ST();
  const a = S.teamModel(createRace({ scenario: HUN, seed: 3 }), "McLaren");
  const b = S.teamModel(createRace({ scenario: HUN, seed: 3, carParams: { Ferrari: { CdA: 1.6, C_tyre_heat: 1.4 } } }), "McLaren");
  assert.deepStrictEqual([...a.vs.HARD.balanced.mu], [...b.vs.HARD.balanced.mu]);
  assert.deepStrictEqual(a.ltGrid, b.ltGrid);
  const f1 = S.teamModel(createRace({ scenario: HUN, seed: 3 }), "Ferrari"), f2 = S.teamModel(createRace({ scenario: HUN, seed: 3, carParams: { Ferrari: { CdA: 1.6 } } }), "Ferrari");
  assert.notDeepStrictEqual(f1.ltGrid, f2.ltGrid, "(its own car does)");
});

test("public view: other cars' position, gap, compound, tyre age, stops, lap times – never their wear, fuel, energy or modes", async () => {
  const { createRace, step } = await E(), S = await ST();
  const r = createRace({ scenario: HUN, seed: 1 }); for (let i = 0; i < 3000; i++) step(r);
  const v = S.publicView(r, "McLaren"), keys = new Set(v.cars.flatMap((c) => Object.keys(c)));
  for (const k of ["wear", "fuel", "soc", "energy", "mode", "tyre", "driver", "Ts", "Tc", "plan"]) assert.ok(!keys.has(k), "no " + k);
  for (const c of v.cars) for (const l of c.laps) assert.deepStrictEqual(Object.keys(l).sort(), ["compound", "n", "out", "pit", "t"]);
  assert.ok(Array.isArray(v.forecast.blocks) && v.forecast.blocks.length);
});

test("candidates obey the season tyre rule: two dry compounds (dry race); Monaco 2025 three sets (≥ 2 stops)", async () => {
  const { createRace } = await E(), S = await ST();
  for (const [scn, minStops] of [[HUN, 1], [MON, 2]]) {
    const race = createRace({ scenario: scn, seed: 1 }), M = S.teamModel(race, race.state.cars[0].teamKey);
    const cands = S.planCandidates(M, { lane: M.lanePrior }, { num: M.nums[0], lap: 0, total: race.state.totalLaps, cur: null, used: [], sets: 0 }, { top: 12 });
    assert.ok(cands.length > 0);
    for (const c of cands) {
      assert.ok(new Set(c.stints.map((s) => s.compound)).size >= 2, scn.meta.event + " two dry compounds");
      assert.ok(c.stops >= minStops, `${scn.meta.event}: ${c.stops} stops ≥ ${minStops}`);
      assert.strictEqual(c.stints.reduce((a, s) => a + s.laps, 0), race.state.totalLaps, "stints cover the race");
    }
  }
});

test("causality: more wear → more stops; bigger pit loss → fewer stops; an SC now makes stopping this lap cheaper", async () => {
  const { createRace } = await E(), S = await ST();
  const race = createRace({ scenario: HUN, seed: 2 }), M = S.teamModel(race, "Mercedes"), num = M.nums[0];
  const st = { num, lap: 20, total: race.state.totalLaps, cur: { name: "MEDIUM", age: 8 }, used: ["MEDIUM"], sets: 1 };
  const best = (est, flag = "green") => S.planCandidates(M, { lane: M.lanePrior, ...est }, st, { flag, top: 1 })[0];
  // (wear factors within the range where a fresh set lasts longer than a few laps: with the model's worn-tyre grip floor a
  // tyre that is finished in 3–4 laps whatever is done makes extra stops pointless – reported, not hidden)
  const stopsBy = (g) => best({ g }).stops;
  assert.ok(stopsBy(0.3) <= stopsBy(0.7) && stopsBy(0.7) <= stopsBy(1.3) && stopsBy(0.3) < stopsBy(1.3), `stops by wear ${stopsBy(0.3)} ${stopsBy(0.7)} ${stopsBy(1.3)}`);
  const stopsLane = (dl) => best({ lane: M.lanePrior + dl }).stops;
  assert.ok(stopsLane(-8) >= stopsLane(0) && stopsLane(0) >= stopsLane(25) && stopsLane(-8) > stopsLane(25), `stops by lane ${stopsLane(-8)} ${stopsLane(0)} ${stopsLane(25)}`);
  // the next stop's lap: under an SC "this lap" (n0 = 1) gets the SC loss; the best plan moves toward it
  const g = best({}), s = best({}, "sc");
  assert.ok(s.stints[0].laps <= g.stints[0].laps);
  assert.ok(s.cost < g.cost, "the same race is cheaper with an SC stop available");
});

test("scenarios: seeded and repeatable; a wet forecast puts water in them, a dry one doesn't; SC laps appear at a sane rate", async () => {
  const { createRace } = await E(), S = await ST();
  const race = createRace({ scenario: HUN, seed: 1 }), M = S.teamModel(race, "Williams"), est = { lane: M.lanePrior };
  const view = S.publicView(race, "Williams"); view.lapS = 80;
  const mk = (p) => ({ ...view, forecast: { issued: 0, blocks: Array.from({ length: 8 }, (_, j) => ({ from: j * 900000, to: (j + 1) * 900000, pRain: p })) } });
  const a = S.scenarios(M, est, mk(0.02), "k", 32), b = S.scenarios(M, est, mk(0.02), "k", 32);
  assert.deepStrictEqual(a.map((x) => x.g), b.map((x) => x.g));
  assert.ok(a.every((x) => x.water.every((h) => h === 0)), "dry forecast: no water");
  const w = S.scenarios(M, est, mk(0.9), "k", 32), wetShare = w.filter((x) => Math.max(...x.water) > 0.1).length / w.length;
  assert.ok(wetShare > 0.6, "wet forecast: most scenarios wet " + wetShare);
  const scShare = a.filter((x) => x.sc.some((v) => v)).length / a.length;
  assert.ok(scShare > 0.15 && scShare < 0.85, "SC in some scenarios " + scShare);
});

test("rain forecast → inters pay for the stop now; the same damp track with a dry forecast → slicks kept", async () => {
  const { createRace } = await E(), S = await ST();
  const race = createRace({ scenario: HUN, seed: 1 }), M = S.teamModel(race, "Alpine"), num = M.nums[0], est = { lane: M.lanePrior, stintLife: {} };
  const view = (p, water, rain) => { const v = S.publicView(race, "Alpine"); v.lap = 30; v.lapS = 80; v.t = 2400000; v.water = water; v.rain = rain; v.forecast = { issued: v.t, blocks: Array.from({ length: 8 }, (_, j) => ({ from: v.t + j * 900000, to: v.t + (j + 1) * 900000, pRain: p })) }; return v; };
  const gain = (v) => S.crossoverGains(M, est, v, num, { name: "HARD", age: 5 }, { K: 10 }).INTERMEDIATE;
  const loss = S.pitLoss(M, est);
  const wet = gain(view(0.95, 0.2, 2.5)), dry = gain(view(0.03, 0.2, 0)), bone = gain(view(0.03, 0, 0));
  assert.ok(wet > loss, `raining + wet forecast: inters gain ${wet.toFixed(1)} s > the stop ${loss.toFixed(1)} s`);
  assert.ok(dry < loss, `damp + dry forecast: ${dry.toFixed(1)} s < the stop – slicks kept`);
  assert.ok(wet > dry && dry > bone, "more water expected → more for the inter");
  // and the other way: on inters with a drying track and a dry forecast, slicks pay
  const back = S.crossoverGains(M, est, view(0.03, 0.02, 0), num, { name: "INTERMEDIATE", age: 8 }, { K: 10 });
  assert.ok(Math.max(back.MEDIUM, back.HARD) > loss);
});

test("pre-race strategy: everything §3 asks for, labelled as an estimate; both cars; conflicts flagged", async () => {
  const { createRace } = await E(), S = await ST();
  const race = createRace({ scenario: HUN, seed: 1 }), p = S.preRaceStrategy(race, "McLaren");
  assert.strictEqual(p.est, true); assert.match(p.label, /예상치/);
  assert.strictEqual(p.laps, 70); assert.strictEqual(p.grid.length, HUN.entries.length);
  assert.ok(p.weather.blocks.length && typeof p.weather.uncertainty === "string");
  assert.ok(p.pitLoss.s > 5 && p.pitLoss.sc < p.pitLoss.s);
  assert.strictEqual(p.cars.length, 2);
  for (const c of p.cars) {
    assert.ok(c.best.plan.length >= 2 && c.best.plan.at(-1).toLap === 70);
    assert.ok(c.best.window && c.best.window[0] <= c.best.plan[0].toLap && c.best.plan[0].toLap <= c.best.window[1]);
    assert.ok(c.best.sd >= 0 && c.best.p10 <= c.best.mean + 1e-9 && c.best.mean <= c.best.p90 + 1e-9);
  }
  assert.ok(typeof p.rule.text === "string" && p.rule.compounds.length === 3);
  assert.ok(Array.isArray(p.conflicts));
  if (p.cars[0].best.key === p.cars[1].best.key) assert.ok(p.conflicts.length > 0, "same plan for both → same in-laps → flagged");
});
