// Incidents with causes (DESIGN §12, request §12): every hazard is 0 without its cause and rises with it; the result
// depends on where it happens (run-off vs wall); consequences reach race control; seeded and logged with their inputs.
const test = require("node:test");
const assert = require("node:assert/strict");
const H0 = require("./harness-control.cjs");
const I = () => H0.imp("engine/incidents.js");

// count driver errors for N car-steps at fixed inputs (a bare race: control state for the logs / neutralisations)
async function errorsAt(inp, { N = 40000, seed = 1, scenario = {}, wet = 1, cars = 8 } = {}) {
  const H = await H0.makeRace({ n: cars, seed, totalLaps: 50, scenario }), Inc = await I(), S = H.race.state;
  H0.run(H, 60e3);
  const kinds = {}; let n = 0;
  for (let k = 0; k < N; k++) {
    S.t += 50;
    for (const c of S.cars) {
      c.status = "run"; c.where = "lap"; c.inc = null; c.v = 60; c.driver = { wet };
      const e = Inc.driverError(H.race, H.T, c, inp);
      if (e) { n++; kinds[e.effect.kind] = (kinds[e.effect.kind] || 0) + 1; }
    }
    if (S.control.flag !== "green") { S.control.flag = "green"; S.control.sc = null; S.control.vsc = null; S.control.red = null; }
  }
  return { n, kinds, perCarHour: n / (cars * N * 0.05 / 3600), H };
}

test("driver error: hazard 0 with margin, rises with grip overuse, a tyre out of its window, water on slicks; a better wet driver errs less", async () => {
  const { errorHazard } = await I();
  assert.equal(errorHazard({ u: 0.95 }).lambda, 0);
  assert.equal(errorHazard({ u: 0.95, tyreOut: 1, water: 3 }).lambda, 0, "no overuse, no error – whatever the conditions (they enter through u)");
  const a = errorHazard({ u: 0.985 }).lambda, b = errorHazard({ u: 1.0 }).lambda, c = errorHazard({ u: 1.0, tyreOut: 0.5 }).lambda;
  assert.ok(a > 0 && b > a && c > b);
  const slick = errorHazard({ u: 1, water: 2, compound: "MEDIUM" }).lambda, inter = errorHazard({ u: 1, water: 2, compound: "INTERMEDIATE" }).lambda, wetT = errorHazard({ u: 1, water: 2, compound: "WET" }).lambda;
  assert.ok(slick > inter && inter > wetT && wetT > b);
  assert.ok(errorHazard({ u: 1, water: 2 }, { wet: 1.05 }).lambda < errorHazard({ u: 1, water: 2 }, { wet: 0.95 }).lambda);
});

test("driver error: counts follow the hazard – none with margin, more at the limit, more again with cold tyres (seeded Monte Carlo)", async () => {
  const none = await errorsAt({ u: 0.96 }, { N: 6000 });
  const lim = await errorsAt({ u: 0.995 }, { N: 20000 });
  const cold = await errorsAt({ u: 0.995, tyreOut: 0.8 }, { N: 20000 });
  assert.equal(none.n, 0);
  assert.ok(lim.n > 3, `at the limit: ${lim.n}`);
  assert.ok(cold.n > lim.n * 1.8, `cold tyres ${cold.n} vs ${lim.n}`);
  // every logged error carries its cause
  const e = cold.H.race.state.incidents.list[0];
  assert.equal(e.type, "driver error"); assert.ok(e.cause.u > 0.97 && e.cause.tyreOut === 0.8 && e.cause.runoff && Number.isFinite(e.t) && e.cars.length === 1);
});

test("driver error: what it becomes depends on what is beside the track – walls turn more errors into crashes than paved run-off", async () => {
  const inp = { u: 1.02, tyreOut: 0.6 };
  const paved = await errorsAt(inp, { N: 15000 }), wall = await errorsAt(inp, { N: 15000, scenario: { circuit: { street: true } } });
  const share = (r, k) => (r.kinds[k] || 0) / r.n;
  assert.ok(paved.n > 50 && wall.n > 50, `${paved.n} / ${wall.n}`);
  assert.ok(share(wall, "crash") > share(paved, "crash") * 3, `crash share wall ${share(wall, "crash").toFixed(3)} vs paved ${share(paved, "crash").toFixed(3)}`);
  assert.ok(share(paved, "wide") > share(wall, "wide"), "paved run-off: more running wide (track limits)");
  // a wide moment on paved run-off counts toward track limits
  assert.ok(paved.H.race.state.control.msgs.some((m) => m.text.includes("TIME DELETED – TRACK LIMITS")));
  // scenario-marked run-off zones override the circuit default
  const { runoffAt } = await I();
  const H = await H0.makeRace({ n: 2, scenario: { track: { runoff: [{ from: 4250, to: 4350, type: "gravel" }] } } });
  assert.equal(runoffAt(H.race, H.T, 4300), "gravel"); assert.equal(runoffAt(H.race, H.T, 1000), "paved");
});

test("consequences: a high-speed crash into a wall → out, SC or red (barrier); a car beached in gravel → VSC; stopped in paved run-off → double yellow", async () => {
  const Inc = await I(), { INCIDENTS } = await H0.imp("data/params/incidents.js");
  // force the kind: severity tables with a single entry
  const only = (k) => ({ ...INCIDENTS, severity: { v: Object.fromEntries(["paved", "grass", "gravel", "wall"].map((r) => [r, { moment: 0, wide: 0, spin: 0, crash: 0, [k]: 1 }])) } });
  const H = await H0.makeRace({ n: 4, totalLaps: 50, scenario: { circuit: { street: true } } }), S = H.race.state;
  H0.run(H, 3 * 60e3);
  const c = S.cars[1]; c.v = 75;
  let e = null; for (let k = 0; k < 20000 && !e; k++) { S.t += 50; e = Inc.driverError(H.race, H.T, c, { u: 1.05 }, only("crash")); }
  assert.ok(e && e.effect.out === "crash" && e.effect.barrier, JSON.stringify(e?.effect));
  assert.equal(c.status, "dnf"); assert.equal(c.out.cause, "crash");
  assert.equal(S.control.flag, "red", "barrier damage → red flag");
  assert.ok(Inc.obstacles(H.race).some((o) => o.num === c.num && o.onTrack));
  // gravel, spin, beached → VSC
  const { rcDecision } = Inc;
  const H2 = await H0.makeRace({ n: 4, totalLaps: 50 });
  assert.equal(rcDecision(H2.race, H2.T, { place: "offTrack", runoff: "gravel", stuck: true }).kind, "vsc");
  assert.equal(rcDecision(H2.race, H2.T, { place: "offTrack", runoff: "paved" }).kind, "double");
  assert.equal(rcDecision(H2.race, H2.T, { place: "onTrack" }).kind, "sc");
  assert.equal(rcDecision(H2.race, H2.T, { place: "trackEdge", debris: "none" }).kind, "vsc");
  assert.equal(rcDecision(H2.race, H2.T, { place: "none", spun: true }).kind, "yellow");
  assert.equal(rcDecision(H2.race, H2.T, { place: "none", debris: "none" }).kind, "none");
  const d = rcDecision(H2.race, H2.T, { place: "onTrack" }); assert.ok(d.clearMs >= 240e3 && d.clearMs <= 480e3);
});

test("contact: 0 outside braking zones / without overlap / with clearance; rises with closing speed, falls with racecraft; logged with its inputs; the at-fault driver penalised", async () => {
  const { contactHazard, contact } = await I();
  const a = { num: "1", driver: { racecraft: 0.8 } }, b = { num: "2", driver: { racecraft: 0.8 } };
  const base = { a, b, overlap: 0.5, dv: 3, braking: true, latGap: 0 };
  assert.equal(contactHazard({ ...base, braking: false }).p, 0);
  assert.equal(contactHazard({ ...base, overlap: 0 }).p, 0);
  assert.ok(contactHazard({ ...base, latGap: 3 }).p < contactHazard(base).p * 0.01);
  assert.ok(contactHazard({ ...base, dv: 8 }).p > contactHazard(base).p);
  const good = { num: "3", driver: { racecraft: 0.95 } }, bad = { num: "4", driver: { racecraft: 0.6 } };
  assert.ok(contactHazard({ ...base, a: good, b: good }).p < contactHazard(base).p && contactHazard({ ...base, a: bad, b: bad }).p > contactHazard(base).p);
  // Monte Carlo on cars of a race: contacts happen at about the hazard; each logged, fault → penalty
  const H = await H0.makeRace({ n: 2, totalLaps: 50 }), S = H.race.state; H0.run(H, 60e3);
  const [ca, cb] = S.cars; let n = 0, pens = 0; const N = 3000;
  for (let k = 0; k < N; k++) {
    ca.status = cb.status = "run"; ca.dmg = cb.dmg = null; ca.inc = cb.inc = null;
    const ev = { a: ca, b: cb, overlap: 0.3, dv: 4, braking: true, latGap: 0.1 };
    const e = contact(H.race, H.T, ev);
    if (e) { n++; assert.ok(e.cause.overlap === 0.3 && e.cause.dv === 4 && e.cars.length === 2); if (e.effect.fault === "1") pens++; }
    S.control.flag = "green"; S.control.sc = null; S.control.vsc = null; S.control.red = null;
  }
  const p = contactHazard({ a: ca, b: cb, overlap: 0.3, dv: 4, braking: true, latGap: 0.1 }).p;
  assert.ok(Math.abs(n - p * N) < 4 * Math.sqrt(p * N) + 3, `contacts ${n} vs expected ${(p * N).toFixed(1)}`);
  assert.ok(pens > 0 && ca.pen.serve.length === pens && ca.pen.serve.every((x) => x.kind === "10s"), "a dive (overlap < 0.5) is the attacker's fault – 10 s (stewards' practice)");
});

test("mechanical: never with reliability 0; the rate rises with attack, energy push and heat; the expected count over many hours", async () => {
  const { mechHazard, mechanical } = await I();
  assert.equal(mechHazard({ reliab: 0, attack: 1, push: 1, airT: 40 }).perS, 0);
  const b = mechHazard({ reliab: 1 }).perS;
  assert.ok(mechHazard({ reliab: 1, attack: 1 }).perS > b && mechHazard({ reliab: 1, push: 1 }).perS > b && mechHazard({ reliab: 1, airT: 38 }).perS > b);
  assert.equal(mechHazard({ reliab: 1, airT: 25 }).perS, b, "no heat effect below 30 °C");
  // (the base rate × 100 so that a few simulated hours give a count worth comparing – the shape is what is tested)
  const { INCIDENTS } = await H0.imp("data/params/incidents.js"), P = { ...INCIDENTS, mechPerHour: { v: INCIDENTS.mechPerHour.v * 100 } };
  const H = await H0.makeRace({ n: 20, totalLaps: 50 }), S = H.race.state; H0.run(H, 60e3);
  const count = (inp, hours) => { let n = 0; const steps = Math.round(hours * 3600 / 0.05 / S.cars.length);
    for (let k = 0; k < steps; k++) { S.t += 50; for (const c of S.cars) { c.status = "run"; c.where = "lap"; c.inc = null; c.retireInPit = null; c.pit.phase = "none"; if (mechanical(H.race, H.T, c, inp, P)) n++; } S.control.flag = "green"; S.control.sc = null; S.control.vsc = null; S.control.red = null; }
    return n; };
  const n0 = count({ reliab: 1 }, 6), n1 = count({ reliab: 1, attack: 1, push: 1, airT: 36 }, 6);
  const e0 = b * 100 * 6 * 3600;
  assert.ok(Math.abs(n0 - e0) < 4 * Math.sqrt(e0) + 2, `base ${n0} vs ${e0.toFixed(1)}`);
  assert.ok(n1 > n0 * 2, `stressed ${n1} vs ${n0}`);
  const e = S.incidents.list.find((x) => x.type === "mechanical");
  assert.ok(e.cause.reliab === 1 && "attack" in e.cause && e.effect.kind);
});

test("mechanical: a car failing near the pit entry coasts in and retires in the garage (no neutralisation); elsewhere it parks and race control reacts", async () => {
  const Inc = await I(), { INCIDENTS } = await H0.imp("data/params/incidents.js");
  const P = { ...INCIDENTS, mechPerHour: { v: 3600 * 200 }, mechKind: { v: { pu: 1 } } };   // (certain failure, a PU)
  const H = await H0.makeRace({ n: 3, totalLaps: 50 }), S = H.race.state; H0.run(H, 60e3);
  const c = S.cars[0]; c.s = H.T.wrap(H.T.pit.sIn - 800); c.where = "lap";
  const e = Inc.mechanical(H.race, H.T, c, { reliab: 1 }, P);
  assert.equal(e.effect.park, "pit"); assert.equal(c.status, "run"); assert.equal(c.pit.phase, "committed");
  assert.equal(S.control.flag, "green");
  assert.ok(Inc.pitEntry(H.race, H.T, c)); assert.equal(c.status, "dnf"); assert.ok(c.out.inPit);
  const d = S.cars[1]; d.s = 1000; d.where = "lap";
  const e2 = Inc.mechanical(H.race, H.T, d, { reliab: 1 }, P);
  assert.equal(e2.effect.park, "offTrack"); assert.equal(d.status, "dnf");
  assert.ok(S.control.yellows.length > 0, "a car parked in the run-off → double yellow");
});

test("determinism: the same seed → the same incidents; each car's errors come from its own stream (another car's hazard doesn't move them)", async () => {
  const runIt = async (seed, withOther) => {
    const H = await H0.makeRace({ n: 2, seed, totalLaps: 50 }), Inc = await I(), S = H.race.state; H0.run(H, 60e3);
    const times = [];
    for (let k = 0; k < 40000; k++) {
      S.t += 50;
      const [a, b] = S.cars; a.status = "run"; a.where = "lap"; a.inc = null;
      const e = Inc.driverError(H.race, H.T, a, { u: 0.999 }); if (e) times.push(S.t);
      if (withOther) { b.status = "run"; b.where = "lap"; b.inc = null; Inc.driverError(H.race, H.T, b, { u: 1.01, tyreOut: 1 }); }
      S.control.flag = "green"; S.control.sc = null; S.control.vsc = null; S.control.red = null;
    }
    return times;
  };
  const x = await runIt(5, false), y = await runIt(5, true), z = await runIt(6, false);
  assert.ok(x.length > 0);
  assert.deepEqual(x, y, "car 1's errors unchanged by car 2's");
  assert.notDeepEqual(x, z);
});
