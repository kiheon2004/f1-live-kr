// v0.54: the game race screen's small track map – the scenario's track frame and the presented cars (minimap.js)
import { test } from "node:test";
import assert from "node:assert";
import { trackOutline, carPoint, fitTransform } from "../src/renderer/game/minimap.js";

// a circle of radius 100 m, counter-clockwise (travel +hdg), sampled every 1 m
function ring() {
  const R = 100, L = 2 * Math.PI * R, n = Math.round(L), ds = L / n, x = [], y = [], hdg = [];
  for (let i = 0; i < n; i++) { const a = (i * ds) / R; x.push(R * Math.cos(a)); y.push(R * Math.sin(a)); hdg.push(a + Math.PI / 2); }
  return { n, ds, L, columns: { x, y, hdg }, pit: { ds: 10, columns: { x: [0, 10, 20], y: [-50, -50, -50] } } };
}
const near = (a, b, e = 0.05) => assert.ok(Math.abs(a - b) <= e, `${a} ≉ ${b}`);

test("minimap: a car on the lap at s, offset d to the left of travel (towards the centre on a counter-clockwise ring)", () => {
  const tr = ring(), q = tr.L / 4;
  const [x, y] = carPoint(tr, { where: "lap", s: q, d: 0 }); near(x, 0, 0.1); near(y, 100, 0.1);
  const [x2, y2] = carPoint(tr, { where: "lap", s: q, d: 5 }); near(x2, 0, 0.1); near(y2, 95, 0.1);
  const [x3] = carPoint(tr, { where: "lap", s: tr.L + 1e-6, d: 0 }); near(x3, 100, 0.1);   // (wraps at the line)
});
test("minimap: a car in the pit lane at u; no place → null", () => {
  const tr = ring();
  assert.deepStrictEqual(carPoint(tr, { where: "pit", u: 15 }).map((v) => +v.toFixed(3)), [15, -50]);
  assert.strictEqual(carPoint(tr, { where: "garage", s: null }), null);
  assert.strictEqual(carPoint(null, { s: 1 }), null);
});
test("minimap: the outline fits the box with its padding, north up", () => {
  const tr = ring(), ol = trackOutline(tr, 10), T = fitTransform(ol, 200, 200, 10);
  assert.ok(ol.lap.length > 50 && ol.pit.length === 3);
  const [ax, ay] = T.map(0, 100), [bx, by] = T.map(0, -100), [cx] = T.map(-100, 0), [dx] = T.map(100, 0);
  near(ay, 10, 0.5); near(by, 190, 0.5); near(cx, 10, 0.5); near(dx, 190, 0.5); near(ax, 100, 0.5); near(bx, 100, 0.5);
});
