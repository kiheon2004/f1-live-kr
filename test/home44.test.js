// v0.44: the timing screen's year / session pickers follow the session actually loaded (v0.43 report §8: a session opened
// from the home screen left the pickers on what they showed before). Session paths are the archive's real form
// ("<year>/<date>_<meeting>/<date>_<session>/") – the paths below are SYNTHETIC examples of that form.
const test = require("node:test");
const assert = require("node:assert");
const D = require("../src/shared/homedata.js");

const P21 = "2021/2021-03-28_Bahrain_Grand_Prix/2021-03-28_Race/", P26 = "2026/2026-06-07_Monaco_Grand_Prix/2026-06-07_Race/", P26b = "2026/2026-09-06_Italian_Grand_Prix/2026-09-06_Race/";
test("picker v0.44: a session from a year outside the picker's list adds that year and fetches its list", () => {
  const plan = D.pickerPlan({ years: [2026, 2025, 2024, 2023], year: 2026, paths: [P26, P26b] }, P21);
  assert.deepStrictEqual(plan, { year: 2021, addYear: true, reload: true, select: P21 });
  assert.deepStrictEqual(D.yearsWith([2026, 2025, 2024, 2023], 2021), [2026, 2025, 2024, 2023, 2021]);
  assert.deepStrictEqual(D.yearsWith([2026, 2025], 2025), [2026, 2025], "a year already there isn't added twice");
});
test("picker v0.44: same year – the list is fetched again only when the session isn't in it; another year showing – fetched", () => {
  assert.deepStrictEqual(D.pickerPlan({ years: [2026, 2025], year: 2026, paths: [P26, P26b] }, P26b), { year: 2026, addYear: false, reload: false, select: P26b });
  assert.strictEqual(D.pickerPlan({ years: [2026, 2025], year: 2026, paths: [P26] }, P26b).reload, true, "the session not in the list shown");
  assert.strictEqual(D.pickerPlan({ years: [2026, 2025], year: 2025, paths: [] }, P26).reload, true, "the picker showed 2025");
  // (the year the 3D view reads its car profiles from – app.sessionYear: the session path's first four digits – is the
  // year the picker is set to)
  assert.strictEqual(D.pickerPlan({ years: [2026], year: 2026, paths: [] }, P21).year, +P21.slice(0, 4));
});
test("picker v0.44: a path without a year (not an archive session) changes nothing", () => {
  assert.strictEqual(D.pickerPlan({ years: [2026], year: 2026, paths: [] }, "live"), null);
  assert.strictEqual(D.pickerPlan({ years: [2026], year: 2026, paths: [] }, ""), null);
  assert.strictEqual(D.pickerPlan({}, undefined), null);
});
