// energy.js – fuel mass/consumption and ERS store: fuel burn makes the car faster, no negative fuel, empty tank stops the
// car (an event), empty store removes deploy, per-lap limits, season differences, energy bookkeeping.
const test = require("node:test");
const assert = require("node:assert");
const { physics } = require("./_physics.js");

let X, E, tr, car;
test.before(async () => { X = await physics(); E = X.energy; tr = X.lapline.genericTrack(); car = X.carsBase.carBase(2025); });
const solo = (o) => X.solo.runSolo({ track: tr, car, compound: "C3", v0: 60, ...o });

test("fuel burn makes the car faster: same tyre state, less fuel ⇒ quicker lap; consumption plausible", () => {
  const heavy = solo({ laps: 2, fuel: 100, tyreT0: 95 }), light = solo({ laps: 2, fuel: 20, tyreT0: 95 });
  assert.ok(light.laps[1] < heavy.laps[1] - 1, `80 kg less fuel: ${heavy.laps[1]} → ${light.laps[1]}`);
  const perLap = (100 - heavy.energy.fuel) / 2, perKm = perLap / (tr.L / 1000);
  assert.ok(perKm > 0.2 && perKm < 0.45, "fuel per km " + perKm); // ≤2025 races: ≈ 100 kg / 305 km ≈ 0.33
});

test("fuel never goes negative; the empty tank is an event; the car then slows and stops", () => {
  const r = solo({ laps: 20, fuel: 0.6, soc: 0.3 });
  assert.ok(r.energy.fuel >= 0);
  assert.ok(r.energy.events.some((e) => e.type === "fuelEmpty"));
  assert.ok(r.stopped, "stopped after the energy ran out");
  assert.ok(r.lapInfo.length < 20);
});

test("empty energy store removes deploy; a full store gives deploy power", () => {
  const ep = X.energyP.energyParams(2025), es = E.createEnergy(ep, { soc: 0 });
  assert.strictEqual(E.ersCap(es, ep, "push", 50), 0);
  assert.strictEqual(E.ersCap(es, ep, "overtake", 50), 0);
  const full = E.createEnergy(ep, { soc: 1 });
  assert.ok(E.ersCap(full, ep, "push", 50) > 0);
  // and on track: a car with an empty store (harvest mode can't deploy below its floor) is slower than one deploying
  const noErs = solo({ laps: 2, soc: 0, energyMode: "harvest", tyreT0: 95 }), ers = solo({ laps: 2, soc: 1, energyMode: "push", tyreT0: 95 });
  assert.ok(ers.laps[0] < noErs.laps[0] - 0.2, `deploy ${ers.laps[0]} vs none ${noErs.laps[0]}`);
});

test("energy modes: push drains the store over laps, harvest builds it; push is faster now", () => {
  const push = solo({ laps: 6, soc: 0.6, energyMode: "push", tyreT0: 95 }), harv = solo({ laps: 6, soc: 0.6, energyMode: "harvest", tyreT0: 95 });
  assert.ok(push.energy.soc < harv.energy.soc, `soc push ${push.energy.soc} vs harvest ${harv.energy.soc}`);
  assert.ok(push.laps[0] < harv.laps[0], "push lap faster");
});

test("per-lap limits: deploy ≤ allowance and harvest (MGU-K) ≤ the per-lap limit, every lap", () => {
  const ep = X.energyP.energyParams(2025);
  let maxDep = 0, maxHarv = 0;
  // per-lap counters read before each lap's reset
  const es2 = E.createEnergy(ep, { soc: 1 });
  for (let lap = 0; lap < 3; lap++) {
    for (let k = 0; k < 1500; k++) {
      const cap = E.ersCap(es2, ep, "push", 60);
      E.stepEnergy(es2, ep, { pIce: 500e3, pErs: cap, pBrake: k % 3 === 0 ? 900e3 : 0, iceFull: true }, 0.05);
    }
    maxDep = Math.max(maxDep, es2.lapDeploy); maxHarv = Math.max(maxHarv, es2.lapHarvest);
    E.energyLap(es2);
  }
  assert.ok(maxDep <= ep.ers.deployLap + ep.ers.pK * 0.05 + 1, "deploy per lap " + maxDep);
  assert.ok(maxHarv <= ep.ers.harvestLapK + 1, "harvest per lap " + maxHarv);
  assert.ok(es2.soc >= 0 && es2.soc <= ep.ers.socWindow);
});

test("bookkeeping: store change = harvested − deployed; fuel used = ICE energy / (η·LHV)", () => {
  const ep = X.energyP.energyParams(2025), es = E.createEnergy(ep, { soc: 0.5, fuel: 50 }), soc0 = es.soc;
  let eIce = 0;
  for (let k = 0; k < 4000; k++) {
    const pI = k % 5 ? 400e3 : 0; eIce += pI * 0.05;
    E.stepEnergy(es, ep, { pIce: pI, pErs: k % 4 ? E.ersCap(es, ep, "balanced", 60) : 0, pBrake: k % 7 === 0 ? 600e3 : 0, iceFull: pI > 0 }, 0.05);
    if (k % 1600 === 1599) E.energyLap(es);
  }
  assert.ok(Math.abs(es.soc - soc0 - (es.harvested - es.deployed)) < 1e-3);
  assert.ok(Math.abs(es.fuelUsed - eIce / (ep.fuel.etaIce * ep.fuel.LHV)) < 1e-9);
});

test("seasons are data: 2026 caps MGU-K power by speed (Overtake moves the cap; rule formula), ≤2025 doesn't; 2026 has more MGU-K power and no MGU-H", () => {
  const e25 = X.energyP.energyParams(2025), e26 = X.energyP.energyParams(2026);
  const s25 = E.createEnergy(e25), s26 = E.createEnergy(e26);
  assert.strictEqual(E.ersCap(s25, e25, "push", 92), E.ersCap(s25, e25, "push", 60));
  assert.ok(E.ersCap(s26, e26, "push", 92) < E.ersCap(s26, e26, "push", 60));
  assert.ok(E.ersCap(s26, e26, "overtake", 90, true) > E.ersCap(s26, e26, "push", 90));
  // the rule's own numbers: full 350 kW to 290 km/h; normal 1800 − 5·v to 340, then 6900 − 20·v to 0 at 345 km/h (C5.2.8 i –
  // v0.50: the second segment); Overtake full to 337.5, 0 at 355 km/h
  assert.strictEqual(E.ersCap(s26, e26, "push", 289 / 3.6), 350e3);
  assert.ok(E.ersCap(s26, e26, "push", 300 / 3.6) < 350e3);
  assert.ok(Math.abs(E.ersCap(s26, e26, "push", 342 / 3.6) - (6900e3 - 20e3 * 342)) < 1);
  assert.strictEqual(E.ersCap(s26, e26, "push", 345.5 / 3.6), 0);
  assert.strictEqual(E.ersCap(s26, e26, "overtake", 337 / 3.6, true), 350e3);
  assert.strictEqual(E.ersCap(s26, e26, "overtake", 356 / 3.6, true), 0);
  assert.ok(e26.ers.pK > e25.ers.pK && e26.ers.pH === 0 && e25.ers.pH > 0);
  // fuel flow caps ICE power (2026 energy-flow limit lower than ≤2025's)
  assert.ok(E.iceCap(s26, 1e6, e26) < E.iceCap(s25, 1e6, e25));
  // ICE cap is 0 with an empty tank
  assert.strictEqual(E.iceCap({ fuel: 0 }, 5e5, e25), 0);
});

test("power split: the ICE gives first, ERS covers the rest up to its cap", () => {
  assert.deepStrictEqual(E.splitPower(300e3, 500e3, 100e3), [300e3, 0]);
  assert.deepStrictEqual(E.splitPower(560e3, 500e3, 100e3), [500e3, 60e3]);
  assert.deepStrictEqual(E.splitPower(900e3, 500e3, 100e3), [500e3, 100e3]);
});
