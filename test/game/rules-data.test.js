// Season rules data (src/game/data/rules/<season>.js): the contract the engine and the UI rely on – every rule carries a
// source the reader can open (document, article, https URL or an explicit null with a note), an `implemented` flag that
// starts false, and a `verified` flag; unverified values must say why. The eras keep their systems apart (DRS ≤ 2025,
// Active Aero + Overtake 2026) and the same keys exist across seasons so the engine can switch season without guessing.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = (y) => import(pathToFileURL(path.join(__dirname, "../../src/game/data/rules", `${y}.js`)).href).then((m) => m.default);
const META = new Set(["season", "schema", "docs"]);
const entries = (o) => Object.entries(o).filter(([k, v]) => !META.has(k) && v !== null);

for (const y of [2024, 2025, 2026]) {
  test(`rules ${y}: every entry is sourced, flagged and explains what it could not verify`, async () => {
    const o = await load(y);
    assert.equal(o.season, y);
    for (const d of Object.values(o.docs)) assert.match(d.url, /^https:\/\/www\.fia\.com\//, "season documents are FIA originals");
    for (const [k, v] of entries(o)) {
      assert.ok("value" in v, `${k}: value`);
      assert.equal(v.implemented, false, `${k}: starts unimplemented (the engine flips it when it enforces the rule)`);
      assert.equal(typeof v.verified, "boolean", `${k}: verified flag`);
      assert.ok(v.src && typeof v.src.doc === "string" && v.src.doc.length > 3, `${k}: src.doc`);
      assert.ok(typeof v.src.art === "string", `${k}: src.art`);
      assert.match(v.src.accessed, /^\d{4}-\d{2}-\d{2}$/, `${k}: access date`);
      if (v.src.url === null) assert.ok(v.note || !v.verified, `${k}: a source without URL must be explained`);
      else assert.match(v.src.url, /^https:\/\//, `${k}: https URL`);
      if (!v.verified) assert.ok(typeof v.note === "string" && v.note.length > 10, `${k}: unverified values say why`);
    }
  });
}

test("rules: the same rule keys exist in every season (null where a system does not exist)", async () => {
  const [a, b, c] = await Promise.all([2024, 2025, 2026].map(load));
  const keys = (o) => Object.keys(o).filter((k) => !META.has(k));
  const shared = keys(a).filter((k) => keys(b).includes(k));
  assert.deepEqual(keys(a).sort(), keys(b).sort(), "2024 and 2025 have the same keys");
  for (const k of shared) assert.ok(k in c, `2026 has ${k} (null if gone)`);
});

test("rules: DRS and the 2026 systems are separate things, never merged", async () => {
  const [a, b, c] = await Promise.all([2024, 2025, 2026].map(load));
  for (const o of [a, b]) { assert.ok(o.drs && o.drs.value, "DRS exists ≤ 2025"); assert.equal(o.activeAero, undefined); assert.equal(o.overtakeMode, undefined); }
  assert.equal(c.drs, null, "no DRS in 2026");
  assert.ok(c.activeAero.value && c.overtakeMode.value, "Active Aero and Overtake both described");
  assert.equal(c.overtakeMode.value.notTheWings, true);
});

test("rules: points tables are well-formed and the fastest-lap point exists only where the regulations had it", async () => {
  const [a, b, c] = await Promise.all([2024, 2025, 2026].map(load));
  for (const o of [a, b, c]) {
    const p = o.points.value.race;
    assert.ok(p.length >= 8 && p.every((x, i) => i === 0 || x <= p[i - 1]), "non-increasing race points");
    assert.ok(o.classification.value.minFracOfWinnerLaps > 0 && o.classification.value.minFracOfWinnerLaps < 1);
  }
  assert.ok(a.points.value.fastestLap, "2024 had the fastest-lap point");
  assert.equal(b.points.value.fastestLap, null);
  assert.equal(c.points.value.fastestLap, null);
});
