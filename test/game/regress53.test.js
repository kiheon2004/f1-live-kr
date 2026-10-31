// v0.53 regress (request §3 gaps): checks in the real engine on a real scenario for what v0.52 covered only by rule-level
// tests or by hand –
//   double stack   both team cars called in on the same lap: the second queues behind the box, stops only once the first
//                  is released, never two cars in the box, no overlap on the pit path, its queue part = its wait
//   not resumed    a red flag that ends the race (the engine's own 3 h path, not a forced finish): classified at the
//                  penultimate lap before the suspension, no traffic counted under the red, a lane visit left open is
//                  no pit loss, pit = Σ parts
//   VSC            no traffic counted under the VSC; pit = Σ parts and each part's split adds up; (todo) a stop under
//                  the VSC accounted cheaper than under green – the account's reference is the free lap
//   lap 1          (todo – found here, pre-existing since v0.51: a car whose grid slot is past the timing line keeps the
//                  creation time as its lap start, so its lap 1 record includes the time before lights out)
// The engine is only read here – nothing in these tests changes how a race runs.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const SC = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game/2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), "utf8"));
const M = () => Promise.all([import("../../src/game/engine/engine.js"), import("../../src/game/engine/control.js")]);
const sumParts = (c) => (c.acct.pitParts || []).reduce((a, p) => a + p.loss, 0);
const splitOk = (p) => Math.abs(p.loss - (p.queue + p.stationary + p.rest)) < 0.03;

test("double stack (real engine, Hungary 2025): the second car queues behind the box, stops once the first is released; one car in the box; no overlap; its queue part is its wait", async () => {
  const [E] = await M();
  const r = E.createRace({ scenario: SC, seed: 1, userTeam: "McLaren" }), S = r.state, T = r.cache.T;
  const [A, B] = S.cars.filter((c) => c.teamKey === "McLaren");
  // both called when they run within 2 s of each other, far enough before the pit entry for both calls to stand this lap
  let called = false;
  while (!called && S.t < 40 * 60e3) {
    E.step(r);
    if (S.t < 12 * 60e3 || A.where !== "lap" || B.where !== "lap" || S.control.flag !== "green" || A.pit.phase !== "none" || B.pit.phase !== "none") continue;
    const lead = A.dist > B.dist ? A : B, toEntry = T.ahead(lead.s, T.pit.sIn);
    if (Math.abs(A.dist - B.dist) / Math.max(30, (A.v + B.v) / 2) < 2 && toEntry > 1500 && toEntry < 3000) {
      for (const c of [A, B]) assert.ok(E.command(r, { id: "ds" + c.num, type: "pit", car: c.num, args: { compound: "HARD" } }).ok);
      called = true;
    }
  }
  assert.ok(called, "a moment with both cars within 2 s");
  const tm = { [A.num]: {}, [B.num]: {} }, box = S.boxes[A.teamKey];
  let k = 0, minGap = Infinity;
  while (k++ < 40000 && !(tm[A.num].exit && tm[B.num].exit)) {
    E.step(r);
    const lane = [A, B].filter((c) => c.where === "pit"), at = lane.filter((c) => ["penalty", "work", "release"].includes(c.pit.phase));
    assert.ok(at.length <= 1, `t ${S.t}: two cars in the box`);
    if (at.length) assert.strictEqual(box.occupant, at[0].num, `t ${S.t}: the box's occupant is the car in it`);
    const near = (c) => ["approach", "queue", "penalty", "work", "release"].includes(c.pit.phase);
    if (lane.length === 2 && near(A) && near(B)) minGap = Math.min(minGap, Math.abs(A.pit.u - B.pit.u));
    for (const c of [A, B]) {
      const x = tm[c.num];
      for (const key of ["entry", "queue", "queueEnd", "stop", "work", "release"]) if (c.pit.times?.[key] != null && x[key] == null) x[key] = c.pit.times[key];
      if (x.entry != null && x.exit == null && c.where === "lap") x.exit = S.t;
    }
  }
  const first = tm[A.num].stop <= tm[B.num].stop ? A : B, second = first === A ? B : A, f = tm[first.num], s = tm[second.num];
  assert.ok(f.exit && s.exit, "both out again");
  assert.ok(s.queue != null && s.queueEnd > s.queue, `the second car queued: ${JSON.stringify(s)}`);
  assert.ok(s.queueEnd >= f.release, "it left the queue only once the first car was released");
  assert.ok(s.stop >= f.release && s.work >= f.release, "its stop and work after the first car's release");
  assert.ok(minGap >= 5, `no overlap at the box: closest ${minGap.toFixed(2)} m between the two cars`);
  assert.strictEqual(box.occupant, null, "the box is free afterwards"); assert.deepStrictEqual(box.queue, [], "no one left queued");
  const pq = second.acct.pitParts.at(-1);
  assert.ok(Math.abs(pq.queue - (s.queueEnd - s.queue) / 1000) < 0.06, `queue part ${pq.queue} s = its wait ${(s.queueEnd - s.queue) / 1000} s`);
  for (const c of [A, B]) { assert.ok(Math.abs(sumParts(c) - c.acct.pit) < 0.05); for (const p of c.acct.pitParts) assert.ok(splitOk(p), JSON.stringify(p)); }
  assert.ok(S.log.some((e) => e.type === "pit:queue" && e.car === second.num), "the queue is logged");
});

test("red flag not resumed (the engine's own 3 h limit during the suspension): classified at the lap before the suspension lap; no traffic under the red; an open lane visit is no pit loss; pit = Σ parts", async () => {
  const [E, CTL] = await M();
  const r = E.createRace({ scenario: SC, seed: 2, ai: true }), S = r.state, ctl = S.control;
  while (S.t < 9 * 60e3) E.step(r);
  const tr0 = Object.fromEntries(S.cars.map((c) => [c.num, c.acct.traffic]));
  assert.ok(CTL.neutralise(r, r.cache.T, "red", { clearMs: 4 * 3600e3, cause: "test: not resumed" }).ok);
  let g = 0; while (!S.cars.filter((c) => c.status === "run").every((c) => c.where === "pit" && (c.pit.v ?? 1) < 0.2) && g++ < 100000) E.step(r);
  for (let i = 0; i < 400; i++) E.step(r);
  // (the time limit reached on the next step – race control ends the race itself: endUnderRed, then finishRace / resultRows)
  ctl.t0 = S.t + 50 - CTL.seasonRules(r).timeLimit.value.raceMaxWithSuspensionMs;
  E.step(r);
  assert.ok(S.finished && S.results, "finished with results");
  assert.strictEqual(S.results.ended, "red");
  assert.strictEqual(ctl.redEnd.lap, ctl.red.lapsAt - 1, "the lap before the suspension lap");
  for (const row of S.results.rows) {
    const c = S.cars.find((x) => x.num === row.num);
    assert.ok(row.laps <= ctl.redEnd.lap, `${row.num}: ${row.laps} laps counted (cap ${ctl.redEnd.lap})`);
    assert.ok(Math.abs(c.acct.traffic - tr0[c.num]) < 0.5, `${c.num}: traffic ${tr0[c.num].toFixed(2)} → ${c.acct.traffic.toFixed(2)} under the red`);
    assert.ok(Math.abs(row.acct.pit - sumParts(c)) < 0.05 && !(c.acct.pitParts || []).some((p) => p.red), `${c.num}: no red-flag visit closed, pit ${row.acct.pit} = Σ parts`);
    if (c.where === "pit") assert.ok(c.pit.times.red && c.pit.times.susp > 0, `${c.num}: its open visit is marked as the suspension's`);
  }
});

const vscPair = async () => {
  const [E, CTL] = await M();
  // the same race twice: car 4 called in at 12 min – once with a VSC deployed at that moment, once under green
  const run = async (vsc) => {
    const r = E.createRace({ scenario: SC, seed: 3, userTeam: "McLaren" }), S = r.state, car = S.cars.find((c) => c.num === "4");
    while (S.t < 12 * 60e3) E.step(r);
    let tr0 = null;
    if (vsc) { assert.ok(CTL.neutralise(r, r.cache.T, "vsc", { clearMs: 150e3, cause: "test" }).ok); tr0 = Object.fromEntries(S.cars.map((c) => [c.num, c.acct.traffic])); }
    assert.ok(E.command(r, { id: "p", type: "pit", car: "4", args: { compound: "HARD" } }).ok);
    let k = 0, sawVsc = false, trEnd = null;
    while (k++ < 60000 && !(car.acct.pitParts?.length && S.control.flag === "green")) {
      E.step(r);
      if (S.control.flag === "vsc") { sawVsc = true; trEnd = Object.fromEntries(S.cars.map((c) => [c.num, c.acct.traffic])); }
    }
    return { r, S, car, sawVsc, tr0, trEnd };
  };
  const v = await run(true), g = await run(false);
  assert.ok(v.sawVsc && v.S.log.some((e) => e.type === "vsc"), "VSC deployed and logged");
  for (const c of v.S.cars) assert.ok(Math.abs(v.trEnd[c.num] - v.tr0[c.num]) < 0.5, `car ${c.num}: traffic ${v.tr0[c.num].toFixed(2)} → ${v.trEnd[c.num].toFixed(2)} under the VSC`);
  for (const x of [v, g]) for (const c of x.S.cars) { assert.ok(Math.abs(sumParts(c) - c.acct.pit) < 0.05, c.num); for (const p of c.acct.pitParts || []) assert.ok(splitOk(p) && p.loss >= 0, JSON.stringify(p)); }
  return { pv: v.car.acct.pitParts.at(-1), pg: g.car.acct.pitParts.at(-1) };
};
let pair = null;
test("VSC (forced, as incidents.js would): no traffic counted under it; pit = Σ parts, each part's split adds up", async () => { pair = await vscPair(); });
// (found here: the stop's loss is measured against the car's FREE lap over the same stretch – under a VSC the car that
// stays out is slower too, so the stop really costs less; the AI prices it at AI.vscLossK × the green loss, the
// account shows the green-reference number. Seed 3: 19.49 s under the VSC vs 19.17 s under green.)
test("VSC: a stop under the VSC is accounted cheaper than the same stop under green", { todo: "the account's reference is the free lap, not the neutralised one (engine.js pitExit loss) – reported to the lead" }, async () => {
  const { pv, pg } = pair || await vscPair();
  assert.ok(pv.loss < pg.loss - 3, `stop under VSC ${pv.loss} s vs green ${pg.loss} s`);
});

test("lap records: the laps of a finished car never add up to more than its elapsed race time (lights out → its finish)", { todo: "pre-existing (v0.51 too): cars whose grid slot is past the timing line keep lapT0 = 0, not lights out (engine.js controlEvents resets only the cars not armed) – lap 1 includes the start sequence (5.7 s at Hungary). Reported to the lead; not fixed here (an engine change)." }, async () => {
  const [E] = await M();
  const sc = { ...SC, race: { ...SC.race, laps: 3 } };
  const r = E.createRace({ scenario: sc, seed: 1, ai: true }), S = r.state;
  while (!S.finished && S.t < 30 * 60e3) E.step(r);
  for (const c of S.cars.filter((x) => x.finT != null)) {
    const sum = c.laps.reduce((a, l) => a + l.t, 0), el = (c.finT - S.control.t0) / 1000;
    // (a car behind the line starts lap 1 at its first crossing – Σ a little under the elapsed time; none can count time
    // from before the lights went out)
    assert.ok(sum <= el + 0.06 && el - sum < 10, `car ${c.num}: Σ laps ${sum.toFixed(3)} s vs elapsed ${el.toFixed(3)} s`);
  }
});
