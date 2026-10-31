// v0.52 §3: the red-flag free tyre change goes through the same set check as a stop (inventory.canFit): no set, a wrong
// / foreign / other-compound set id are refused; a refusal changes nothing; a change fits exactly one real set; the
// invariant (one fitted set, the tyre names it, compounds agree) holds after every path, also across save / load.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const SC = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game/2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), "utf8"));
const M = () => Promise.all([import("../../src/game/engine/engine.js"), import("../../src/game/engine/control.js"), import("../../src/game/engine/inventory.js")]);

// a race suspended by race control's own procedure with car 4 stopped in the pit lane
async function suspended(seed = 1) {
  const [E, CTL, INV] = await M();
  const r = E.createRace({ scenario: SC, seed, userTeam: "McLaren" });
  while (r.state.t < 600000) E.step(r);
  CTL.neutralise(r, r.cache.T, "red", { clearMs: 300000, cause: "test" });
  const car = r.state.cars.find((c) => c.num === "4");
  let g = 0; while (!(car.where === "pit" && (car.pit.v ?? 1) < 0.2 && r.state.control.flag === "red") && g++ < 40000) E.step(r);
  assert.ok(car.where === "pit" && r.state.control.flag === "red", "stopped in the lane under the red flag");
  return { E, CTL, INV, r, car };
}
// (the tyre's identity – temperatures move with time in the lane, they're not the inventory)
const view = (r, car) => JSON.stringify({ tyre: { name: car.tyre.name, compound: car.tyre.compound, setId: car.tyre.setId, wear: car.tyre.wear, laps: car.tyre.laps }, sets: car.sets, changed: r.state.control.red?.changed || {} });
const inv = (INV, car) => { const c = INV.checkSets(car); assert.ok(c.ok, c.problems.join("; ")); };

test("red flag: no set of the compound → refused when taken; nothing changes", async () => {
  const { E, INV, r, car } = await suspended();
  car.sets = car.sets.filter((s) => s.compound !== "WET");
  const before = view(r, car);
  const x = E.command(r, { id: "w", type: "pit", car: "4", args: { compound: "WET" } }); E.step(r);
  assert.strictEqual(x.ok, false); assert.match(x.why, /no set of WET left/);
  assert.strictEqual(view(r, car), before); inv(INV, car);
});

test("red flag: a normal change fits a real set and returns the old one; repeated and consecutive changes consume sets", async () => {
  const { E, INV, r, car } = await suspended();
  const old = car.tyre.setId;
  assert.ok(E.command(r, { id: "a", type: "pit", car: "4", args: { compound: "INTERMEDIATE" } }).ok); E.step(r);
  assert.strictEqual(E.commandStatus(r, "a").state, "applied"); inv(INV, car);
  assert.strictEqual(car.tyre.name, "INTERMEDIATE"); assert.strictEqual(car.sets.find((s) => s.id === old).state, "free");
  // the same compound again: another fresh set (the fitted one is not "free")
  const i1 = car.tyre.setId;
  assert.ok(E.command(r, { id: "b", type: "pit", car: "4", args: { compound: "INTERMEDIATE" } }).ok); E.step(r);
  inv(INV, car); assert.notStrictEqual(car.tyre.setId, i1);
  // consecutive changes: each fits one of the car's own sets (used ones handed back may be refitted); the list never grows
  const n0 = car.sets.length;
  for (let k = 0; k < 6; k++) { assert.ok(E.command(r, { id: "c" + k, type: "pit", car: "4", args: { compound: k % 2 ? "WET" : "INTERMEDIATE" } }).ok); E.step(r); inv(INV, car); }
  assert.strictEqual(car.sets.length, n0, "no set created");
});

test("red flag: wrong set id, a set of another compound, another driver's set → refused, nothing changes", async () => {
  const { E, INV, r, car } = await suspended();
  const before = view(r, car);
  const no = (args, re) => { const x = E.command(r, { id: "x" + Math.random(), type: "pit", car: "4", args }); assert.strictEqual(x.ok, false, JSON.stringify(args)); assert.match(x.why, re); };
  no({ compound: "WET", setId: "4-W9" }, /not available/);
  no({ compound: "WET", setId: "4-I1" }, /is INTERMEDIATE, not WET/);
  no({ compound: "WET", setId: "81-W1" }, /not available/);
  no({ setId: "4-W1" }, /needs its compound/);
  E.step(r); assert.strictEqual(view(r, car), before); inv(INV, car);
  // the right one
  assert.ok(E.command(r, { id: "ok", type: "pit", car: "4", args: { compound: "WET", setId: "4-W2" } }).ok); E.step(r);
  inv(INV, car); assert.strictEqual(car.tyre.setId, "4-W2");
});

test("red flag: taken, then the set disappears before its step → refused when applied, atomically (no set handed back, no change recorded)", async () => {
  const { E, INV, r, car } = await suspended();
  assert.ok(E.command(r, { id: "w", type: "pit", car: "4", args: { compound: "WET" } }).ok);
  car.sets = car.sets.filter((s) => s.compound !== "WET");
  const before = view(r, car); E.step(r);
  assert.strictEqual(E.commandStatus(r, "w").state, "refused"); assert.strictEqual(view(r, car), before); inv(INV, car);
});

test("red flag: before / after the 5-minute signal; a standing call's reservation going into the red flag; save / load keeps the sets consistent", async () => {
  const { E, CTL, INV, r, car } = await suspended();
  const R = r.state.control.red;
  // just after the signal: refused when applied (the rules), nothing changes
  const t0 = r.state.t, sig = R.resumeAt - 300000;
  if (sig > t0) { while (r.state.t < sig + 50) E.step(r); const before = view(r, car); E.command(r, { id: "late", type: "pit", car: "4", args: { compound: "WET" } }); E.step(r);
    assert.strictEqual(E.commandStatus(r, "late").state, "refused"); assert.match(E.commandStatus(r, "late").why, /5-minute/); assert.strictEqual(view(r, car), before); }
  inv(INV, car);
  const s2 = E.loadRace(E.saveRace(r), SC); for (const c of s2.state.cars) { const ck = INV.checkSets(c); assert.ok(ck.ok, c.num + ": " + ck.problems.join("; ")); }
  // a call with a reservation, then a red-flag change of another compound: the change fits a real set, the reservation
  // stays the call's (or is freed at its exit) – never two fitted sets
  const [E2, CTL2] = [E, CTL];
  const q = E2.createRace({ scenario: SC, seed: 2, userTeam: "McLaren" }); while (q.state.t < 500000) E2.step(q);
  const c4 = q.state.cars.find((c) => c.num === "4"); assert.ok(E2.command(q, { id: "call", type: "pit", car: "4", args: { compound: "HARD" } }).ok); E2.step(q);
  assert.strictEqual(c4.sets.filter((s) => s.state === "reserved").length, 1);
  CTL2.neutralise(q, q.cache.T, "red", { clearMs: 300000, cause: "test" });
  let g = 0; while (!(c4.where === "pit" && (c4.pit.v ?? 1) < 0.2 && q.state.control.flag === "red") && g++ < 40000) E2.step(q);
  if (c4.where === "pit" && q.state.control.flag === "red") { assert.ok(E2.command(q, { id: "r", type: "pit", car: "4", args: { compound: "MEDIUM" } }).ok); E2.step(q); inv(INV, c4); assert.strictEqual(c4.tyre.name, "MEDIUM"); }
  let h = 0; while (q.state.control.flag === "red" && h++ < 80000) E2.step(q);
  for (let i = 0; i < 2000; i++) E2.step(q);
  for (const c of q.state.cars) { const ck = INV.checkSets(c); assert.ok(ck.ok, c.num + ": " + ck.problems.join("; ")); }
});

test("normal stops keep the invariant for every car over a race (all paths: plan calls, AI calls, cancels, red flags none)", async () => {
  const [E, , INV] = await M();
  const r = E.createRace({ scenario: SC, seed: 3, userTeam: "McLaren", ai: true });
  let n = 0; while (!r.state.finished && n++ < 200000) { E.step(r); if (n % 2000 === 0) for (const c of r.state.cars) { const ck = INV.checkSets(c); assert.ok(ck.ok, `t ${r.state.t} car ${c.num}: ${ck.problems.join("; ")}`); } }
  assert.ok(r.state.finished);
  assert.ok(!r.state.log.some((e) => e.type === "tyreNotFitted"), "no stop ended without its set");
});
