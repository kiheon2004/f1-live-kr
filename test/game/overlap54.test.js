// v0.54 (request item 5): game cars never drawn into each other. The engine's (s, d) posed on its own track as the
// renderer does (the lap line's point moved d along its left normal, heading the path's at that offset), the bodies
// as oriented 5.6 × 2.0 m rectangles: no pair overlaps through the start, Turn 1 and the first laps of Hungary 2025 –
// v0.53 (|Δs| ≥ length on the lap line only) had cars 0.5 m into each other on the inside of Turn 1 at 22 s.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const load = (id) => JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game", id + ".scenario.json"), "utf8"));

test("drawn bodies (oriented boxes at the posed (s, d)) never overlap: Hungary 2025, lights out to 4 min", async () => {
  const E = await import("../../src/game/engine/engine.js"), { boxDepth } = await import("../../src/renderer/traffic.js");
  const r = E.createRace({ scenario: load("2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race"), seed: 3 }), T = r.cache.T;
  const D = { front: 2.8, back: 2.8, half: 1.0 }, Q = {}, A = {}, B = {};
  const live = (c) => c.status === "run" && c.where === "lap" && c.s != null;
  let worst = 0, at = null;
  while (r.state.t < 4 * 60e3) {
    E.step(r);
    const P = r.state.cars.filter(live).map((c) => { T.posAt(c.s, c.d, Q); T.posAt(c.s - 3, c.d, A); T.posAt(c.s + 3, c.d, B); return { c, x: Q.x, y: Q.y, h: Math.atan2(B.y - A.y, B.x - A.x) }; });
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j]; if (Math.hypot(a.x - b.x, a.y - b.y) > 8) continue;
      const o = boxDepth(a.x, a.y, Math.PI / 2 - a.h, D, b.x, b.y, Math.PI / 2 - b.h, D);
      if (o > worst) { worst = o; at = `${a.c.num}/${b.c.num} t=${r.state.t} s=${a.c.s.toFixed(0)}`; }
    }
  }
  assert.ok(worst < 0.05, `bodies drawn ${worst.toFixed(2)} m into each other (${at})`);
});

test("bodyLen: the plain length on a straight and on the outside, more on the inside of a bend", async () => {
  const { bodyLen } = await import("../../src/game/engine/traffic.js");
  const T = (k) => ({ kappa: null, at: () => k }), tc = { len: 5.63, wid: 2 };
  assert.strictEqual(bodyLen(T(0), tc, 0, -5), 5.63);
  assert.strictEqual(bodyLen(T(-1 / 27), tc, 0, 5), 5.63);              // right turn, car on the left: the outside
  const inside = bodyLen(T(-1 / 27), tc, 0, -5.9);                        // Hungary T1's inside (R ≈ 21 m at the car)
  assert.ok(inside > 7 && inside < 8, `inside ${inside}`);
});
