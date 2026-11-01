// v0.53 regress (request §3 gaps): checks in the real engine on a real scenario for what v0.52 covered only by rule-level
// tests or by hand –
//   double stack   both team cars called in on the same lap: the second queues behind the box, stops only once the first
//                  is released, never two cars in the box, no overlap on the pit path; its queue part = its approach
//                  beyond a free one (braking early behind the box, the standstill, rolling in – v0.53 F3), 0 for the first
//   not resumed    a red flag that ends the race (the engine's own 3 h path, not a forced finish): classified at the
//                  penultimate lap before the suspension, no traffic counted under the red, a lane visit left open is
//                  no pit loss, pit = Σ parts
//   VSC / SC       no traffic counted under the VSC; pit = Σ parts and each part's split adds up; a stop under a VSC / SC
//                  is measured against the field's time over the same stretch then (v0.53 F2: it was the free lap's –
//                  a VSC stop showed as dear as a green one), marked with its flag
//   lap 1          every car's lap clock starts at lights out (v0.53 F1: a car gridded past the timing line counted its
//                  lap 1 from the race's creation – the start sequence, 5.7 s at Hungary); an older save still loads
// The tests only read the engine – nothing in them changes how a race runs.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const SC = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game/2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), "utf8"));
const M = () => Promise.all([import("../../src/game/engine/engine.js"), import("../../src/game/engine/control.js")]);
const sumParts = (c) => (c.acct.pitParts || []).reduce((a, p) => a + p.loss, 0);
const splitOk = (p) => Math.abs(p.loss - (p.queue + p.stationary + p.rest)) < 0.03;

test("double stack (real engine, Hungary 2025): the second car queues behind the box, stops once the first is released; one car in the box; no overlap; its queue part is its approach beyond a free one (v0.53 F3)", async () => {
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
      for (const key of ["entry", "app0", "appU", "appV", "queue", "queueEnd", "stop", "work", "release"]) if (c.pit.times?.[key] != null && x[key] == null) x[key] = c.pit.times[key];
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
  const pq = second.acct.pitParts.at(-1), pf = first.acct.pitParts.at(-1), st = (s.queueEnd - s.queue) / 1000;
  // (the queue: the approach from where it began to the stop against a free approach from the same place and speed –
  // more than the standstill alone; the first car's 0)
  const exp = (s.stop - s.app0) / 1000 - E.freeApproach(T, T.pit.boxes[second.teamKey], s.appU, s.appV);
  assert.ok(pq.queue >= st - 0.01 && pq.queue > st + 0.5, `queue part ${pq.queue} s ≥ the standstill ${st} s and the approach behind the box`);
  assert.ok(Math.abs(pq.queue - exp) < 0.06, `queue part ${pq.queue} s = approach beyond a free one ${exp.toFixed(2)} s`);
  assert.strictEqual(pf.queue, 0, "the first car didn't queue");
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

// the same race (seed 3, car 4 called in at 12 min) under green, with a VSC and with an SC deployed at that moment
const runFlag = async (flag) => {
  const [E, CTL] = await M();
  const r = E.createRace({ scenario: SC, seed: 3, userTeam: "McLaren" }), S = r.state, car = S.cars.find((c) => c.num === "4");
  while (S.t < 12 * 60e3) E.step(r);
  let tr0 = null;
  if (flag) { assert.ok(CTL.neutralise(r, r.cache.T, flag, { clearMs: flag === "sc" ? 300e3 : 150e3, cause: "test" }).ok); tr0 = Object.fromEntries(S.cars.map((c) => [c.num, c.acct.traffic])); }
  assert.ok(E.command(r, { id: "p", type: "pit", car: "4", args: { compound: "HARD" } }).ok);
  let k = 0, saw = false, trEnd = null;
  while (k++ < 80000 && !(car.acct.pitParts?.length && S.control.flag === "green")) {
    E.step(r);
    if (flag && S.control.flag === flag) { saw = true; trEnd = Object.fromEntries(S.cars.map((c) => [c.num, c.acct.traffic])); }
  }
  for (const c of S.cars) { assert.ok(Math.abs(sumParts(c) - c.acct.pit) < 0.05, c.num); for (const p of c.acct.pitParts || []) assert.ok(splitOk(p) && p.loss >= 0, JSON.stringify(p)); }
  return { r, S, car, saw, tr0, trEnd, part: car.acct.pitParts.at(-1) };
};
const runs = {};
const runOf = async (f) => (runs[f || "green"] ||= runFlag(f));
test("VSC (forced, as incidents.js would): no traffic counted under it; pit = Σ parts, each part's split adds up", async () => {
  const v = await runOf("vsc");
  assert.ok(v.saw && v.S.log.some((e) => e.type === "vsc"), "VSC deployed and logged");
  for (const c of v.S.cars) assert.ok(Math.abs(v.trEnd[c.num] - v.tr0[c.num]) < 0.5, `car ${c.num}: traffic ${v.tr0[c.num].toFixed(2)} → ${v.trEnd[c.num].toFixed(2)} under the VSC`);
});
// (v0.53 F2 – measured against the same race without the stop, regress/repro/vsccost.mjs, seed 3, 4 laps on: green real
// 22.6 s / account 19.2 s; VSC real 12.6 s / account 19.5 s before, 13.7 s now; SC real 13.8 s / account 25.5 s – the
// SC's account is the lane against the field over the same stretch: what the car wins back closing up to the SC queue
// afterwards is not in it, and the screens say so)
test("VSC / SC: a stop's loss is measured against the field over the same stretch then, not a free lap – a VSC stop is accounted cheaper than the same stop under green; the part carries its flag", async () => {
  const g = await runOf(null), v = await runOf("vsc"), sc = await runOf("sc");
  assert.ok(!g.part.under && g.part.refBy == null, "green: the free-lap reference as before");
  assert.strictEqual(v.part.under, "vsc"); assert.strictEqual(v.part.refBy, "field");
  assert.ok(v.part.ref > g.part.ref + 3, `the VSC reference ${v.part.ref} s is the field's slower stretch (green ${g.part.ref} s)`);
  assert.ok(v.part.loss < g.part.loss - 3, `stop under VSC ${v.part.loss} s vs green ${g.part.loss} s`);
  assert.strictEqual(sc.part.under, "sc"); assert.strictEqual(sc.part.refBy, "field");
  assert.ok(sc.part.ref > g.part.ref + 3, `the SC reference ${sc.part.ref} s (green ${g.part.ref} s)`);
  assert.ok(sc.S.log.some((e) => e.type === "pitExit" && e.car === "4" && /field under the SC/.test(e.effect)), "the log says which reference");
});

test("lap records: every car's lap clock starts at lights out – the laps of a car gridded past the timing line add up to its elapsed race time, none counts time from before the lights (v0.53 F1)", async () => {
  const [E] = await M();
  const sc = { ...SC, race: { ...SC.race, laps: 3 } };
  const r = E.createRace({ scenario: sc, seed: 1, ai: true }), S = r.state, T = r.cache.T;
  const past = new Set(S.cars.filter((c) => c.armed).map((c) => c.num));
  assert.ok(past.size > 0, "Hungary: some grid slots lie past the timing line");
  while (!S.finished && S.t < 30 * 60e3) E.step(r);
  for (const c of S.cars.filter((x) => x.finT != null)) {
    const sum = c.laps.reduce((a, l) => a + l.t, 0), el = (c.finT - S.control.t0) / 1000;
    // (a car behind the line starts lap 1 at its first crossing – Σ a little under the elapsed time)
    if (past.has(c.num)) assert.ok(Math.abs(sum - el) < 0.06, `car ${c.num} (past the line): Σ laps ${sum.toFixed(3)} s = elapsed ${el.toFixed(3)} s`);
    else assert.ok(sum <= el + 0.06 && el - sum < 10, `car ${c.num}: Σ laps ${sum.toFixed(3)} s vs elapsed ${el.toFixed(3)} s`);
  }
});

test("an older save (engine 0.52, without the stretch record) still loads and runs on; its lap records stay as saved, the model change is recorded", async () => {
  const [E] = await M();
  const r = E.createRace({ scenario: SC, seed: 1, ai: true }), S = r.state;
  while (S.t < 6 * 60e3) E.step(r);
  const o = JSON.parse(E.saveRace(r));
  // (made to look like a v0.52 save: its engine id, no stretch log, no per-car stretch / approach fields)
  o.engine = "0.52.0-engine.1"; o.state.engine = "0.52.0-engine.1"; o.state.models = [{ t: 0, engine: "0.52.0-engine.1", params: o.params }];
  delete o.state.stretch; for (const c of o.state.cars) delete c.stretch;
  const lap1 = Object.fromEntries(o.state.cars.map((c) => [c.num, c.laps[0]?.t]));
  const q = E.loadRace(JSON.stringify(o), SC);
  assert.strictEqual(q.loadInfo.sameEngine, false);
  assert.ok(q.state.models.some((m) => m.engine === E.ENGINE_VERSION), "the restored race records the model it now runs with");
  for (const c of q.state.cars) assert.strictEqual(c.laps[0]?.t, lap1[c.num], `car ${c.num}: lap 1 as saved`);
  for (let i = 0; i < 6000; i++) E.step(q);
  assert.ok(q.state.t > 10 * 60e3 && (q.state.stretch || []).length > 0, "runs on and records the stretch from now");
});

test("screens: a stop under an SC / VSC says so and which reference its loss has (the SC's catch-up afterwards not in it)", async () => {
  const HM = await import("../../src/renderer/game/hudmodel.js");
  assert.strictEqual(HM.underNote({ loss: 20 }), "");
  assert.match(HM.underNote({ under: "vsc", refBy: "field" }), /VSC 중 다른 차 기준$/);
  assert.match(HM.underNote({ under: "sc", refBy: "field" }), /SC 중 다른 차 기준 \(대열 따라잡기 미포함\)/);
  assert.match(HM.underNote({ under: "sc", refBy: "free" }), /기준: 정상 주행/);
});
