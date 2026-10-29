// every physics coefficient is a PARAM entry: unit, meaning, source, range, est flag (DESIGN §0.5, 요청 §15); values inside
// their own range; estimates say so.
const test = require("node:test");
const assert = require("node:assert");
const { physics } = require("./_physics.js");

test("physics PARAM tables: every entry documented, inside its range, estimates labelled", async () => {
  const X = await physics(), { entries } = X.param;
  const tables = { phys: X.phys.PHYS_TABLE, cars: X.carsBase.CAR_BASE_TABLE, energy: X.energyP.ENERGY_TABLE, thermal: X.tyresP.TYRE_THERMAL_TABLE,
    compounds: X.tyresP.COMPOUND_TABLE, blankets: X.tyresP.BLANKET_TABLE, driver: X.driversP.DRIVER_DEFAULT_TABLE, pace: X.driversP.PACE_MODE_TABLE };
  let n = 0;
  for (const [name, t] of Object.entries(tables)) for (const e of entries(t, name + ".")) {
    n++;
    assert.ok(e.unit && typeof e.unit === "string", e.key + " unit");
    assert.ok(e.meaning && e.meaning.length > 3, e.key + " meaning");
    assert.ok(e.source && e.source.length > 3, e.key + " source");
    assert.ok(typeof e.est === "boolean", e.key + " est flag");
    assert.ok(Array.isArray(e.range) && e.range.length === 2, e.key + " range");
    if (typeof e.v === "number" && typeof e.range[0] === "number") assert.ok(e.v >= e.range[0] && e.v <= e.range[1], `${e.key} = ${e.v} outside ${e.range}`);
    if (/game estimate|recalled|not yet verified/.test(e.source)) assert.strictEqual(e.est, true, e.key + " is an estimate and must say so");
  }
  assert.ok(n > 80, "entries checked: " + n);
});
