// v0.47 (the user's §4): the teams' pit wall stands against each other – each is placed on its own (facilities.js wallAt,
// moved up to 6 m where the wall kinks), so standcheck.js measures what neighbours could do to each other: overlap, take
// the same stretch, run off the walkway's end, leave the railing open where no stand is, stand in the cars' way.
const test = require("node:test");
const assert = require("node:assert");

// a straight walkway along +x (u = x), the stands' fronts towards −z (the pit lane), their point 30 m out
const along = [1, 0], out = [0, -1];
const stand = (team, box, at = box, L = 5.4, extra = {}) => ({ team, box, L, p: [at, 30], along, out, enclosed: false, upper: false, ...extra });
const base = (stands, more = {}) => ({ axis: { o: [0, 0], u: [1, 0] }, wall: [-100, 100], run: [-100, 100], rail: null, spans: [], stands, ...more });

test("stand check: parts, overlap and gap", async () => {
  const { standRects, polyOverlap, PARTS } = await import("../src/renderer/standcheck.js");
  // (the parts garages.js pitWallStand builds – a 6-seat stand 5.4 m long: its roof 5.7 m, its step 0.5 m past the end)
  assert.deepStrictEqual(PARTS(5.4).map((q) => q.name), ["deck", "console", "post", "post", "post", "post", "roof", "fascia", "endRail", "endRail", "step"]);
  const r = standRects(stand("A", 0)), roof = r.find((q) => q.name === "roof"), xs = roof.pts.map((p) => p[0]);
  assert.ok(Math.abs(Math.min(...xs) + 2.85) < 1e-9 && Math.abs(Math.max(...xs) - 2.85) < 1e-9);
  const sq = (x0, x1) => [[x0, 0], [x1, 0], [x1, 1], [x0, 1]];
  assert.ok(Math.abs(polyOverlap(sq(0, 2), sq(1.5, 3)) - 0.5) < 1e-9);
  assert.ok(Math.abs(polyOverlap(sq(0, 2), sq(2.4, 3)) + 0.4) < 1e-9);
});

test("stand check: neighbours apart, on the walkway, the railing opened over them alone, clear of the cars – right", async () => {
  const { checkStands } = await import("../src/renderer/standcheck.js");
  const across = (box) => [-2.75, 0, 2.75, 3.2].map((a) => ({ a, u: box + a, standLane: 28.15, laneFace: 28.25, carEdge: 27.0, boxEdge: 20 }));
  const rail = []; for (let u = -100; u < 100; u += 0.5) rail.push([u, u + 0.5]);
  const v = checkStands(base([stand("A", -20, -20, 5.4, { across: across(-20) }), stand("B", 0, 0, 5.4, { across: across(0) })], { rail, spans: [[-22.7, -16.7], [-2.7, 3.3]] }));
  assert.ok(v.ok, v.problems.join("; "));
  assert.strictEqual(v.nMoved, 0);
  assert.ok(v.minGap > 13 && v.minGap < 15, String(v.minGap));
  assert.ok(v.rail.maxBeyond <= 0.5, JSON.stringify(v.rail));
  assert.strictEqual(v.minCarGap, 1.15);
});

test("stand check: two neighbours over the same stretch, a stand off the walkway's end, the railing through a stand or open beyond it, a stand in the lane or the cars' way – each found", async () => {
  const { checkStands } = await import("../src/renderer/standcheck.js");
  // B moved 4 m towards A (a kink): their roofs and decks overlap
  const ov = checkStands(base([stand("A", 0), stand("B", 8, 4)]));
  assert.ok(!ov.ok);
  assert.ok(ov.overlaps.some((o) => o.parts.includes("deck") && o.depth > 1), JSON.stringify(ov.overlaps));
  assert.ok(ov.order.some((p) => /same stretch/.test(p)), ov.order.join("; "));
  assert.deepStrictEqual(ov.moved.map((m) => m.du), [0, -4]);
  // swapped: B's stand before A's
  assert.ok(checkStands(base([stand("A", 0, 3), stand("B", 2, -6)])).order.some((p) => /swapped/.test(p)));
  // past the walkway's end (its step 0.5 m past the deck)
  const end = checkStands(base([stand("A", 97)]));
  assert.ok(end.ends.some((p) => /0\.\d+ m past the walkway's end/.test(p)), end.ends.join("; "));
  // the railing: 3 m segments; left across the stand (not opened) / opened 3 m beyond it
  const rail = [[-6, -3], [-3, 0], [0, 3], [3, 6], [6, 9], [9, 12]];
  const through = checkStands(base([stand("A", 0)], { rail, spans: [[0, 3.3]] }));
  assert.ok(through.rail.through.some((p) => /railing left across 2\.7\d* m/.test(p)), JSON.stringify(through.rail));
  const wide = checkStands(base([stand("A", 0)], { rail, spans: [[-2.7, 6.1]] }));
  assert.ok(wide.problems.some((p) => /railing open 5\.8 m beyond/.test(p)), wide.problems.join("; "));
  // in the lane, the fast lane's cars into the deck
  const lane = checkStands(base([stand("A", 0, 0, 5.4, { across: [{ a: 0, u: 0, standLane: 27.6, laneFace: 28.0, carEdge: 27.8 }] })]));
  assert.ok(lane.problems.some((p) => /0\.4 m in the pit lane/.test(p)), lane.problems.join("; "));
  assert.ok(lane.problems.some((p) => /fast lane's cars 0\.2 m into/.test(p)), lane.problems.join("; "));
});
