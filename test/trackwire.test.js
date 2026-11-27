// The stored fit a surveyed track brings with it, in the main process: what is taken from the renderer (validate.js)
// and how the map is placed with it instead of a fit of the session's lap (scene.js).
const test = require("node:test");
const assert = require("node:assert");
const T = require("../tools/track.js");
const geo = require("../src/main/geo.js");
const V = require("../src/main/validate.js");
const { fixedFit } = require("../src/main/scene.js");

const CENTRE = [52.3888, 4.54092];
const FIT = { centre: CENTRE, c: Math.cos(0.3) * 0.9995, s: Math.sin(0.3) * 0.9995, tx: 338.2, ty: -86.1 };

test("the map placed with a stored fit: the same metres the tool turned the survey into", () => {
  const p = [-312.4, 771.9], b = T.feedToLocal(FIT, p);
  const g = fixedFit(V.fixedFit(FIT), CENTRE), c = geo.toLocal(g, [p[0] * 10, p[1] * 10]), d = geo.toF1(g, c);
  assert.ok(Math.hypot(c[0] - b[0], c[1] - b[1]) < 1e-9 && Math.hypot(d[0] / 10 - p[0], d[1] / 10 - p[1]) < 1e-9);
  assert.strictEqual(g.against, "surveyed"); assert.ok(g.ok && g.mirror === 1);
  assert.strictEqual(fixedFit(FIT, [52.3889, 4.54092]), null, "made about another centre: not used");
  assert.strictEqual(fixedFit(null, CENTRE), null);
});

test("what the main process takes as a stored fit from the renderer", () => {
  assert.strictEqual(V.fixedFit(null), null); assert.strictEqual(V.fixedFit(undefined), null);
  const ok = V.fixedFit({ ...FIT, from: "x", extra: 1 });
  assert.deepStrictEqual(Object.keys(ok).sort(), ["c", "centre", "s", "tx", "ty"]);
  for (const bad of [{ ...FIT, c: 2 * FIT.c }, { ...FIT, c: NaN }, { ...FIT, centre: [100, 4] }, { ...FIT, centre: [52] }, { ...FIT, tx: "1" }, { ...FIT, ty: 1e6 }, "fit", 5, []])
    assert.throws(() => V.fixedFit(bad), /bad fit/, JSON.stringify(bad));
});

