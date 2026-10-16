const test = require("node:test");
const assert = require("node:assert");
const S = () => import("../src/renderer/pitstate.js");
const C = () => import("../src/renderer/crew.js");
const D26 = { FZ: 1.7, RZ: -1.7, FR: 0.353, RR: 0.355, FW: 0.28, RW: 0.375, FX: 0.81, RX: 0.7625, W: 1.9 };

test("what a stop is shown as: the record's new stint (sent after the car left) only when replaying from the record; live never knows during the stop", async () => {
  const { stopPlan } = await S();
  // Barcelona 2026, Hamilton: stood 4145.0–4149.0 s, stint 1 sent at 4163.9 s
  const tyres = [{ ms: 4163900, idx: 1, compound: "HARD", isNew: true, changed: true }];
  const rec = stopPlan({ t: 4147000, t0: 4145000, t1: 4149000, tyres, policy: "record" });
  assert.deepStrictEqual([rec.kind, rec.from, rec.compound, rec.D], ["tyres", "record", "HARD", 4.25]);
  const live = stopPlan({ t: 4147000, t0: 4145000, tyres, policy: "observed" });
  assert.strictEqual(live.kind, "work", "during the stop the stint isn't known yet");
  // the stint arriving after the car left never changes that stop (no lifting a car that has gone, no wheels put back)
  assert.strictEqual(stopPlan({ t: 4170000, t0: 4145000, t1: 4149000, tyres, policy: "observed" }).kind, "work");
  // asked for: an unknown stop shown as a typical change, said so
  assert.deepStrictEqual([stopPlan({ t: 4147000, t0: 4145000, tyres: [], policy: "typical" }).kind, stopPlan({ t: 4147000, t0: 4145000, tyres: [], policy: "typical" }).from], ["tyres", "typical"]);
  // tyres F1 marks as not changed: no change played; a stop-and-go: no work at all
  assert.strictEqual(stopPlan({ t: 4147000, t0: 4145000, tyres: [{ ...tyres[0], changed: false }], policy: "record" }).kind, "work");
  assert.strictEqual(stopPlan({ t: 4147000, t0: 4145000, tyres, policy: "record", penalty: "stop-go" }).kind, "hold");
  // a stint from another stop (minutes later) isn't this one's
  assert.strictEqual(stopPlan({ t: 4147000, t0: 4145000, tyres: [{ ...tyres[0], ms: 4145000 + 200000 }], policy: "record" }).kind, "work");
});

test("time penalties: pending until served at the next stop (a whole visit after it was given) or race control says served", async () => {
  const { pendingTimePenalties } = await S();
  const rcm = [[1000, "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 22 (TSU) - CAUSING A COLLISION"], [9000, "FIA STEWARDS: 10 SECOND TIME PENALTY FOR CAR 11 (PER) - TRACK LIMITS"], [9500, "FIA STEWARDS: PENALTY SERVED - 10 SECOND TIME PENALTY FOR CAR 11 (PER) - TRACK LIMITS"]];
  assert.deepStrictEqual([...pendingTimePenalties(rcm, 2000)], [["22", 5]]);
  assert.deepStrictEqual([...pendingTimePenalties(rcm, 9600)], [["22", 5]], "PER's served");
  const visits = (n) => (n === "22" ? [[5000, null]] : []);
  assert.deepStrictEqual([...pendingTimePenalties(rcm, 6000, visits)], [["22", 5]], "in the pit lane serving it: still pending (the crew waits)");
  assert.deepStrictEqual([...pendingTimePenalties(rcm, 8000, () => [[5000, 7000]])].filter(([n]) => n === "22"), [], "done after that visit");
});

test("the tyre change: lifted only between the jacks going in and dropping, a wheel never both on the car and in a hand, everyone clear of the car", async () => {
  const { stopChoreo, CHANGE } = await C();
  for (const D of [1.9, 2.4, 4.0, null]) for (const left of [1, -1]) {
    let fitted = false;
    for (let s = -0.5; s <= (D ?? 3) + 0.4; s += 0.05) {
      const L = stopChoreo({ wait: 0, D }, s, D26, left);
      if (s <= 0) assert.deepStrictEqual(L.car.lift, [0, 0], "not up before it stood");
      if (D != null && s >= D) assert.deepStrictEqual(L.car.lift.map((v) => +v.toFixed(4)), [0, 0], `down before it leaves (D ${D}, s ${s.toFixed(2)})`);
      assert.ok(L.car.lift.every((v) => v <= CHANGE.lift + 1e-9));
      // each wheel off the car is in somebody's hands (or on its way): never drawn twice, never missing
      const loose = L.kits.filter((k) => k.kind === "old" || k.kind === "new");
      const atHub = loose.filter((k) => k.kind === "new" && L.car.off.some((o) => o));
      if (L.car.off.some((o) => !o)) for (const [i, o] of L.car.off.entries()) if (!o) assert.ok(!loose.some((k) => k.kind === "new" && Math.hypot(k.a - (i < 2 ? D26.FZ : D26.RZ), k.b - (i % 2 ? -1 : 1) * (i < 2 ? D26.FX : D26.RX)) < 0.02), "a wheel on the car isn't also a loose one at its hub");
      if (L.car.off.some((o) => o) && L.car.lift.some((v) => v < 0.03)) assert.fail(`a wheel off a car standing on its tyres (s ${s.toFixed(2)})`);
      if (L.car.off.every((o) => !o) && s > 1.5) fitted = true;
      void atHub;
      for (const [a, b] of L.figures) assert.ok(!(a > D26.RZ - 0.9 && a < D26.FZ + 1.3 && Math.abs(b) < D26.W / 2 - 0.05), `a figure inside the car at ${a.toFixed(2)}, ${b.toFixed(2)}`);
    }
    assert.ok(fitted, "the new set is on by the end");
  }
});

test("the stop's own clock: the same seconds since the car stood give the same picture (a seek, a pause, another speed), a quick stop plays faster, a wait comes first", async () => {
  const { stopChoreo, stopClock } = await C();
  const a = JSON.stringify(stopChoreo({ wait: 0, D: 2.4 }, 1.1, D26, 1)), b = JSON.stringify(stopChoreo({ wait: 0, D: 2.4 }, 1.1, D26, 1));
  assert.strictEqual(a, b);
  assert.ok(stopClock({ wait: 0, D: 1.8 }, 1.0).w > 1.0, "a 1.8 s stop runs the change faster");
  assert.strictEqual(stopClock({ wait: 0, D: 1.0 }, 1.0).k, 0.6, "never under 0.6×");
  const w = stopChoreo({ wait: 5, D: 7.4 }, 3.0, D26, 1);
  assert.deepStrictEqual([w.car.lift, w.car.off], [[0, 0], [false, false, false, false]], "serving a time penalty: nobody touches the car");
  const after = stopChoreo({ wait: 5, D: 7.4 }, 6.0, D26, 1);
  assert.ok(after.car.lift[0] > 0.06, "then the work");
});
