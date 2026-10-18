// The support cars and the rear-of-grid official (support.js): the safety car from its own feed or parked – never two;
// a VSC sends no car; the medical car and the official reproductions around a standing start only; models by event.
const test = require("node:test");
const assert = require("node:assert");
const load = () => import("../src/renderer/support.js");

test("safety car: on track from its feed, else parked in a race; never both; a VSC makes no car", async () => {
  const { supportPlan } = await load();
  const on = supportPlan({ t: 5000, status: "4", sc: { 243: [100, 200, 0], 241: [0, 0, 0] }, race: true });
  assert.deepStrictEqual([on.sc.mode, on.sc.num, on.sc.from], ["track", "243", "data"]);
  const vsc = supportPlan({ t: 5000, status: "6", sc: {}, race: true });
  assert.deepStrictEqual([vsc.sc.mode, vsc.vsc], ["parked", true], "VSC: the car stays parked");
  assert.strictEqual(supportPlan({ t: 5000, status: "1", sc: {}, race: false }).sc, null, "not a race: none drawn");
  assert.strictEqual(supportPlan({ t: 5000, sc: { 242: [0, 0, 0] }, race: true }).sc.mode, "parked", "zeros are no place");
});

test("medical car and official: around the race's standing start only, the order kept; replayable at any moment", async () => {
  const { supportPlan, SUPPORT } = await load();
  const L = 300000, start = { t: L, standing: true }, at = (t, x = {}) => supportPlan({ t, start, race: true, ...x });
  assert.strictEqual(at(10000).medical.mode, "parked");
  assert.strictEqual(at(L - 10000).medical.mode, "gridRear");
  assert.strictEqual(at(L).medical.mode, "following");
  assert.strictEqual(at(L + 60000, { lap1End: L + 90000 }).medical.mode, "following");
  assert.strictEqual(at(L + 95000, { lap1End: L + 90000 }).medical.mode, "parked", "into the pits at the lap's end");
  assert.strictEqual(at(L + SUPPORT.medLap + 1).medical.mode, "parked", "no lap end in the data: not forever");
  assert.ok([at(10000), at(L + 50000)].every((p) => p.medical.from === "reproduction"));
  // the official: the flag, then off the track – gone before the lights (≥ 6 s before lights out) and after
  assert.strictEqual(at(L - 18000).official.phase, "flag");
  assert.strictEqual(at(L - 13000).official.phase, "leave");
  assert.strictEqual(at(L - 11000).official, null);
  assert.strictEqual(at(L + 1).official, null);
  assert.ok(-SUPPORT.leave[1] > 6000, "off the track before the first light");
  // a start that isn't a standing one (behind the safety car, unknown): no official, the medical car parked
  const roll = supportPlan({ t: 99000, start: { t: 100000, standing: null }, race: true });
  assert.deepStrictEqual([roll.official, roll.medical.mode], [null, "parked"]);
  // the same moment gives the same answer whatever was shown before (seek, speed)
  assert.deepStrictEqual(at(L + 50000), at(L + 50000));
});

test("support models: by season and event from sources; unknown events neutral, never another year's model", async () => {
  const { supportModels } = await load();
  assert.deepStrictEqual([supportModels(2026, 2, "2026-07-05").sc, supportModels(2026, 4, "2026-07-26").sc], ["amgGtBlack", "amgGt63Pro"]);
  assert.strictEqual(supportModels(2026, 2, null).sc, "amgGtBlack");
  assert.strictEqual(supportModels(2025, 15).sc, "amgGtBlack");
  assert.deepStrictEqual([supportModels(2025, 149).sc, supportModels(2025, 149).medical], ["vantage", "dbx707"]);
  assert.strictEqual(supportModels(2025, 55).sc, "vantageS");
  assert.deepStrictEqual([supportModels(2025, 2).sc, supportModels(2024, 2).sc], [null, null]);
});
