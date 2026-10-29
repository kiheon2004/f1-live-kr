// Rules (DESIGN §10, request §12): penalties and their service, the last-three-laps conversion per season, pit-lane
// speeding, track limits, blue flags, the dry-tyre rule, the classification (DNFs, ties, penalties, 90 %, time limit,
// red-flag end) and points (2024 fastest-lap point, shortened races).
const test = require("node:test");
const assert = require("node:assert/strict");
const H0 = require("./harness-control.cjs");

const R = () => H0.imp("engine/rules.js");
// the harness step with the rules wired the way the engine will: stewards after control, the pit visit's penalty service
async function wired(opts) {
  const H = await H0.makeRace(opts), Ru = await R(), done = [];
  const hooks = {
    afterControl: (H) => Ru.stewardsStep(H.race, H.T),
    penaltyS: (c) => Ru.pitCtx(H.race, c).penaltyS,
    noWork: (c) => Ru.pitCtx(H.race, c).noWork,
    noBox: (c) => Ru.pitCtx(H.race, c).noBox,
    onWorkDone: (c, cmp) => done.push([c.num, cmp, H.race.state.t]),
    pitEvent: (c, ev) => { if (ev === "entry") Ru.onPitEntry(H.race, H.T, c); if (ev === "exit") Ru.onPitExit(H.race, H.T, c); },
  };
  return { H, Ru, hooks, done, run: (ms, until) => H0.run(H, ms, { hooks, until }) };
}

test("5 s penalty: served at the next stop before any work (held ≥ 5 s, then the crew works); unserved → +5 s to the result", async () => {
  const { H, Ru, hooks, run } = await wired({ n: 3, totalLaps: 30 }), S = H.race.state;
  run(3 * 60e3);
  const c = S.cars[0];
  Ru.penalise(H.race, H.T, c, "5s", "CAUSING A COLLISION");
  assert.equal(c.pen.pendingS, 5);
  H.pit.pitCall(c, H.T, { compound: "HARD", t: S.t });
  run(4 * 60e3, () => c.pit.phase === "none" && c.pit.stops === 1);
  const p = c.pit.times;
  assert.ok(p.work - p.stop >= 5000, `held ${p.work - p.stop} ms before the work`);
  assert.equal(c.pen.serve[0].served > 0, true); assert.equal(c.pen.pendingS, 0); assert.equal(c.pen.finalS, 0);
  assert.equal(c.tyre.compound, "HARD");
  // another 5 s never served → added at the end
  const d = S.cars[1]; Ru.penalise(H.race, H.T, d, "5s", "TRACK LIMITS");
  Ru.finalizePenalties(H.race, H.T);
  assert.equal(d.pen.finalS, 5);
});

test("last three laps: 2025 converts all four (+5/+10/+20/+30); 2026 only drive-through / stop-and-go (+20/+30)", async () => {
  for (const [season, exp] of [[2025, { "5s": [5, 0], "10s": [10, 0], dt: [20, 0], sg: [30, 0] }], [2026, { "5s": [0, 5], "10s": [0, 10], dt: [20, 0], sg: [30, 0] }]]) {
    const { H, Ru, run } = await wired({ n: 4, totalLaps: 4, season }), S = H.race.state;
    run(20 * 60e3, () => Math.floor(Math.max(...S.cars.map((c) => c.dist)) / 5000) >= 2);
    const kinds = ["5s", "10s", "dt", "sg"];
    kinds.forEach((k, i) => Ru.penalise(H.race, H.T, S.cars[i], k, "TEST"));
    kinds.forEach((k, i) => assert.deepEqual([S.cars[i].pen.finalS, S.cars[i].pen.pendingS], exp[k], `${season} ${k}`));
  }
});

test("drive-through: through the lane without stopping; not under the SC; more than two line crossings → disqualified", async () => {
  const { H, Ru, hooks, done, run } = await wired({ n: 3, totalLaps: 40 }), S = H.race.state;
  run(3 * 60e3);
  const c = S.cars[0];
  Ru.penalise(H.race, H.T, c, "dt", "SPEEDING IN THE PIT LANE");
  H.pit.pitCall(c, H.T, { compound: null, t: S.t }); c.pit.call.purpose = "dt";
  run(4 * 60e3, () => c.pit.phase === "none" && c.pit.times.exit);
  assert.ok(c.pen.serve[0].served > 0, "served");
  assert.equal(c.pit.times.stop, undefined, "never stopped");
  assert.equal(done.length, 0, "no work");
  // under the SC an entry can't serve it
  const d = S.cars[1]; Ru.penalise(H.race, H.T, d, "dt", "TEST");
  H.C.neutralise(H.race, H.T, "sc", { clearMs: 60e3 }); d.pit.call = { purpose: "dt" };
  const v = Ru.onPitEntry(H.race, H.T, d); assert.equal(v.dt, null, "no DT service under the SC");
  d.pen.visit = null;
  // never served: the 3rd green crossing → DSQ
  run(20 * 60e3, () => !!d.pen.dsq);
  assert.match(d.pen.dsq, /NOT SERVED/);
  assert.ok(d.pen.serve[0].crossings === 3);
});

test("stop-and-go: 10 s stationary and no work (no tyres); unsafe release / pit speeding handed to the stewards", async () => {
  const { H, Ru, done, run } = await wired({ n: 3, totalLaps: 40 }), S = H.race.state;
  run(3 * 60e3);
  const c = S.cars[0];
  Ru.penalise(H.race, H.T, c, "sg", "UNSAFE CONDITION");
  H.pit.pitCall(c, H.T, { compound: "HARD", t: S.t });
  run(4 * 60e3, () => c.pit.phase === "none" && c.pit.times.exit);
  assert.ok(c.pit.times.release - c.pit.times.stop >= 10000);
  assert.equal(done.length, 0, "no work during a stop-and-go"); assert.notEqual(c.tyre.compound, "HARD");
  assert.ok(c.pen.serve[0].served > 0);
  // pit speeding: a car over the limit inside the limiter zone → 5 s (stewards' practice)
  const d = S.cars[1]; d.status = "run"; d.where = "pit"; d.pit.phase = "lane"; d.pit.u = 300; d.pit.v = H.T.pit.speedLimit + 0.5;
  Ru.stewardsStep(H.race, H.T);
  assert.equal(d.pen.serve.at(-1).kind, "5s"); assert.match(d.pen.serve.at(-1).why, /SPEEDING/);
  Ru.stewardsStep(H.race, H.T); assert.equal(d.pen.serve.length, 1, "once per visit");
  Ru.onUnsafeRelease(H.race, H.T, S.cars[2]); assert.equal(S.cars[2].pen.serve[0].kind, "5s");
});

test("track limits: each excursion deletes the lap; 3rd → black-and-white flag, 4th and each later → 5 s; deleted laps don't count for the fastest lap", async () => {
  const { H, Ru, run } = await wired({ n: 2, totalLaps: 40 }), S = H.race.state;
  run(4 * 60e3);
  const c = S.cars[0];
  for (let i = 0; i < 5; i++) Ru.trackLimits(H.race, H.T, c, { where: 600 });
  const m = H0.msgs(H);
  assert.equal(m.filter((x) => x.includes("TIME DELETED")).length, 5);
  assert.ok(m.some((x) => x.startsWith("BLACK AND WHITE FLAG FOR CAR 1 – TRACK LIMITS")));
  assert.deepEqual(c.pen.serve.map((x) => x.kind), ["5s", "5s"], "penalties at the 4th and 5th");
  // fastest lap: delete car 1's laps → the fastest valid lap is someone else's or a non-deleted one
  const fl0 = Ru.fastestLap(H.race, H.T);
  S.control.stw.deleted[fl0.num] = [...(S.control.stw.deleted[fl0.num] || []), fl0.lap];
  const fl1 = Ru.fastestLap(H.race, H.T);
  assert.ok(!(fl1.num === fl0.num && fl1.lap === fl0.lap) && fl1.ms >= fl0.ms);
});

test("blue flags: a car about to be lapped gets a yield request (pre-warning 3 s, blue 1.2 s); ignored → black-and-white flag, then 5 s; letting the car by clears it", async () => {
  const { H, Ru, hooks, run } = await wired({ n: 2, totalLaps: 60, paces: [1, 0.8] }), S = H.race.state;
  const [lead, slow] = S.cars;
  run(30 * 60e3, () => lead.dist > slow.dist + 5000 - 300);
  let pre = null, blue = null;
  // pin the leader just behind the slow car (it can't get by): the slow car "ignores" the flag
  const pin = { ...hooks, afterCars: () => { const y = Ru.yieldRequest(H.race, slow); if (y && pre == null) pre = y; if (y?.blue && blue == null) blue = y; if (blue) { lead.s = H.T.wrap(slow.s - 25); lead.v = slow.v; lead.dist = slow.dist + 5000 - 25; } } };
  H0.run(H, 60e3, { hooks: pin });
  assert.ok(pre && pre.to === "1" && pre.gapS <= 3.0);
  assert.ok(blue && blue.gapS <= 1.2);
  const m = H0.msgs(H);
  assert.ok(m.some((x) => x.includes("BLACK AND WHITE FLAG FOR CAR 2 – IGNORING BLUE FLAGS")));
  assert.equal(slow.pen.serve.at(-1)?.why, "IGNORING BLUE FLAGS");
  // let it by: the request clears
  lead.s = H.T.wrap(slow.s + 50); lead.dist = slow.dist + 5000 + 50; H0.run(H, 1000, { hooks });
  assert.equal(Ru.yieldRequest(H.race, slow), null);
  // under the SC no blue flags
  lead.s = H.T.wrap(slow.s - 25); lead.dist = slow.dist + 5000 - 25; H.C.neutralise(H.race, H.T, "sc", { clearMs: 60e3 }); H0.run(H, 100, { hooks });
  assert.equal(Ru.yieldRequest(H.race, slow), null);
});

test("dry-tyre rule: one dry compound → DSQ; two → fine; intermediates used → exempt; not resumed after red → +30 s; Monaco 2025 three sets", async () => {
  const Ru = await R(), rules = (await H0.imp("data/rules/2025.js")).default;
  const race = (extra = {}) => ({ rules, state: { control: { red: null, redEnd: null } }, scenario: {}, ...extra });
  const car = (cmps, stops = 0) => ({ laps: cmps.map((c) => ({ compound: c })), tyre: { compound: cmps.at(-1) }, pit: { stops } });
  assert.equal(Ru.tyreRuleCheck(race(), car(["MEDIUM", "MEDIUM"], 1)).penalty, "dsq");
  assert.ok(Ru.tyreRuleCheck(race(), car(["MEDIUM", "HARD"], 1)).ok);
  assert.ok(Ru.tyreRuleCheck(race(), car(["INTERMEDIATE", "INTERMEDIATE"], 0)).ok);
  assert.equal(Ru.tyreRuleCheck(race({ state: { control: { redEnd: { lap: 10 } } } }), car(["SOFT"], 0)).penalty, "+30s");
  const mc = race({ scenario: { meta: { event: "Monaco Grand Prix" } } });
  assert.equal(Ru.tyreRuleCheck(mc, car(["MEDIUM", "HARD"], 1)).penalty, "dsq", "Monaco 2025: two sets is not enough");
  assert.ok(Ru.tyreRuleCheck(mc, car(["MEDIUM", "HARD", "HARD"], 2)).ok);
  const r24 = (await H0.imp("data/rules/2024.js")).default;
  assert.ok(Ru.tyreRuleCheck({ ...mc, rules: r24 }, car(["MEDIUM", "HARD"], 1)).ok, "2024: no Monaco rule");
});

// classification on a hand-made crossing log: cross[k] = [[num, t ms], …] in crossing order for lap k+1
function fakeRace(rules, { laps, total, cars, red = null, flags = null }) {
  const cross = [];
  for (const [num, lapTimes] of Object.entries(laps)) lapTimes.forEach((t, k) => (cross[k] || (cross[k] = [])).push([num, t]));
  cross.forEach((r) => r.sort((a, b) => a[1] - b[1]));
  const cs = cars.map(([num, status, extra]) => ({ num, status, pen: { pendingS: 0, finalS: 0, serve: [] }, laps: [{ compound: "MEDIUM" }, { compound: "HARD" }], tyre: { compound: "HARD" }, pit: { stops: 1 }, ...(extra || {}) }));
  return { rules, scenario: {}, state: { t: 1e7, totalLaps: total, cars: cs, log: [],
    control: { t0: 0, cross, redEnd: red, phase: "finished", fin: { target: total, reason: red ? "red" : "distance" }, laps: { flags: flags || cross.map(() => 1) }, msgs: [], infr: [], stepCross: [], flag: "green", stw: { tl: {}, deleted: {}, blue: {}, speeding: {}, n: 0, final: false } } } };
}
const T0 = { L: 5000 };
const lapsTo = (n, lap, off = 0) => Array.from({ length: n }, (_, k) => (k + 1) * lap + off);

test("classification: laps then crossing order; time penalties only reorder cars on the same lap; DNFs by laps; 90 % rounded down; DSQ out", async () => {
  const Ru = await R(), rules = (await H0.imp("data/rules/2025.js")).default;
  const race = fakeRace(rules, { total: 50, laps: {
      A: lapsTo(50, 90000), B: lapsTo(50, 90000, 3000), C: lapsTo(49, 90100), D: lapsTo(45, 90000), E: lapsTo(44, 90000), F: lapsTo(50, 90000, 1000), G: lapsTo(10, 91000) },
    cars: [["A", "fin"], ["B", "fin"], ["C", "fin"], ["D", "dnf"], ["E", "dnf"], ["F", "fin"], ["G", "dnf"]] });
  race.state.cars.find((c) => c.num === "F").pen.finalS = 5;     // F crossed 1 s after A, 2 s before B: +5 s puts it behind B
  race.state.cars.find((c) => c.num === "C").pen.finalS = 600;   // a lap down already: a penalty can't drop it behind a car with fewer laps
  race.state.cars.find((c) => c.num === "E").pen.dsq = "TEST";
  const res = Ru.classify(race, T0);
  const order = res.rows.filter((r) => r.classified).map((r) => r.num);
  assert.deepEqual(order, ["A", "B", "F", "C", "D"]);
  assert.equal(res.minLaps, 45, "90 % of 50 = 45");
  assert.equal(res.rows.find((r) => r.num === "G").status, "dnf"); assert.equal(res.rows.find((r) => r.num === "G").classified, false);
  assert.equal(res.rows.at(-1).num, "E"); assert.equal(res.rows.at(-1).status, "dsq");
  assert.deepEqual(res.rows.filter((r) => r.classified).map((r) => r.points), [25, 18, 15, 12, 10]);
  assert.deepEqual(res.rows.find((r) => r.num === "C").gap, { laps: 1 });
  // 90 % rounds DOWN: 57 laps → 51.3 → 51
  const r57 = fakeRace(rules, { total: 57, laps: { A: lapsTo(57, 90000), B: lapsTo(51, 90000) }, cars: [["A", "fin"], ["B", "dnf"]] });
  assert.equal(Ru.classify(r57, T0).rows[1].classified, true);
});

test("classification: a dead heat shares the points (SR 7.1); the 2024 fastest-lap point only inside the top 10 and only past 50 % distance", async () => {
  const Ru = await R(), r24 = (await H0.imp("data/rules/2024.js")).default;
  const race = fakeRace(r24, { total: 10, laps: { A: lapsTo(10, 90000), B: lapsTo(10, 90000, 2000), C: lapsTo(10, 90000, 2000) }, cars: [["A", "fin"], ["B", "fin"], ["C", "fin"]] });
  // C sets the fastest lap on lap 5
  race.state.control.cross[4].find((x) => x[0] === "C")[1] -= 1500;
  const res = Ru.classify(race, T0);
  const pts = Object.fromEntries(res.rows.map((r) => [r.num, r.points]));
  assert.equal(pts.A, 25); assert.ok(res.rows[1].deadHeat && res.rows[2].deadHeat);
  assert.equal(res.fastestLap.num, "C");
  assert.equal(pts.C, (18 + 15) / 2 + 1, "dead heat shares 18+15, plus the fastest-lap point");
  assert.equal(pts.B, (18 + 15) / 2);
  // the fastest-lap holder 11th: no point for anyone
  const many = {}; for (let i = 0; i < 12; i++) many["P" + i] = lapsTo(10, 90000, i * 500);
  const r2 = fakeRace(r24, { total: 10, laps: many, cars: Object.keys(many).map((n) => [n, "fin"]) });
  r2.state.control.cross[4].find((x) => x[0] === "P11")[1] -= 4000;
  const res2 = Ru.classify(r2, T0); assert.equal(res2.fastestLap.num, "P11"); assert.equal(res2.rows.reduce((a, r) => a + r.points, 0), 101);
  // 2025: no fastest-lap point at all
  const r25 = (await H0.imp("data/rules/2025.js")).default;
  const res3 = Ru.classify(fakeRace(r25, { total: 10, laps: { A: lapsTo(10, 90000), C: lapsTo(10, 90000, 2000) }, cars: [["A", "fin"], ["C", "fin"]] }), T0);
  assert.equal(res3.rows.reduce((a, r) => a + r.points, 0), 25 + 18);
});

test("shortened race: red flag not resumed → result at its lap, reduced points by distance band; no points without 2 laps clear of SC/VSC (2026: consecutive)", async () => {
  const Ru = await R(), r25 = (await H0.imp("data/rules/2025.js")).default, r26 = (await H0.imp("data/rules/2026.js")).default;
  const laps = { A: lapsTo(20, 90000), B: lapsTo(20, 90000, 1000), C: lapsTo(19, 90000, 2000) };
  // suspended on lap 21, result at lap 19 (the end of the penultimate lap before): 19/50 = 38 % → 13-10-8…
  const race = fakeRace(r25, { total: 50, laps, cars: [["A", "run"], ["B", "run"], ["C", "run"]], red: { lap: 19 } });
  const res = Ru.classify(race, T0);
  assert.equal(res.leaderLaps, 19); assert.deepEqual(res.rows.map((r) => r.points), [13, 10, 8]);
  // all but laps 3 and 7 under SC (bit 8): 2 clean laps → points (2025: not necessarily consecutive) …
  const flags = Array.from({ length: 20 }, (_, k) => (k === 2 || k === 6 ? 1 : 9));
  assert.deepEqual(Ru.classify(fakeRace(r25, { total: 50, laps, cars: [["A", "run"], ["B", "run"], ["C", "run"]], red: { lap: 19 }, flags }), T0).rows.map((r) => r.points), [13, 10, 8]);
  // … but 2026 wants two consecutive clean laps → none
  assert.deepEqual(Ru.classify(fakeRace(r26, { total: 50, laps, cars: [["A", "run"], ["B", "run"], ["C", "run"]], red: { lap: 19 }, flags }), T0).rows.map((r) => r.points), [0, 0, 0]);
  // under 2 laps: no points
  assert.deepEqual(Ru.classify(fakeRace(r25, { total: 50, laps, cars: [["A", "run"], ["B", "run"], ["C", "run"]], red: { lap: 1 } }), T0).rows.map((r) => r.points), [0, 0, 0]);
});

test("time limit end in a simulated race: the classification follows the reduced distance and penalties", async () => {
  const { H, Ru, run } = await wired({ n: 4, totalLaps: 50, rulesPatch: (r) => { r.timeLimit.value.raceMs = 240e3; } }), S = H.race.state;
  run(60e3);
  Ru.penalise(H.race, H.T, S.cars[0], "10s", "TEST");
  for (const c of S.cars) c.laps = [{ compound: "MEDIUM" }, { compound: "HARD" }];   // (two dry specifications: no tyre-rule DSQ)
  run(30 * 60e3, () => S.finished);
  assert.equal(S.control.fin.reason, "time");
  const res = Ru.classify(H.race, H.T);
  assert.equal(res.leaderLaps, S.control.fin.target);
  assert.ok(res.leaderLaps < 50);
  const a = res.rows.find((r) => r.num === "1");
  assert.equal(a.penS, 10, "the unserved 10 s added");
  assert.ok(res.rows.every((r) => r.classified));
});
