// v0.46 §4: the rear-of-grid official (support.js flagSpot / flagAt). The user: before the start the person waving the
// green flag at the back of the grid stands on the track, on the medical car's side, near the medical car – not in the
// pit lane – and steps off before the lights. v0.45 put them off the track on "the side with more room", from the grid's
// rear point: at Melbourne and other circuits that was the pit lane.
// Fixture: test/fixtures/flag46.json – the ground around the back of the grid measured in the app at every cached
// circuit (Map3D.flagGeom(), one race per circuit, run/flag/flag_sweep_before.log; Montréal from 2026 – the 2025 race's data
// begins at the lights): in the lap line's frame from the grid's
// rear point (u along, + towards the grid; v across, + left), the asphalt's edges per u, the first barrier beyond each
// edge at the medical car, the pit lane's spans across (the pit building's lane, garages to wall face: "pit"; within 8 m
// of the measured pit path: "zone"), the medical car; and what v0.45's own measurement of room gave (sides).
const test = require("node:test");
const assert = require("node:assert");
const load = () => import("../src/renderer/support.js");
const FX = require("./fixtures/flag46.json");

// the fixture as flagSpot's input (the same rules map3d.js uses on the live scene: in the pit lane = inside the pit
// building's lane, or within the measured path's zone off the asphalt)
function ground(fx) {
  const row = (u) => fx.rows.reduce((a, r) => (Math.abs(r.u - u) < Math.abs(a.u - u) ? r : a));
  const inside = (spans, v) => spans.some(([a, b]) => v >= a - 0.125 && v <= b + 0.125);
  const edges = (u) => { const r = row(u); return { L: r.L, R: r.R }; };
  const inPit = (u, v) => { const r = row(u); return inside(r.pit, v) || (inside(r.zone, v) && (v > r.L || v < r.R)); };
  return { gbV: fx.gbV, med: fx.med, edges, wall: fx.wall, inPit, sides: fx.sides };
}
// the gap from a point to the medical car's outline (axis-aligned in this frame: it stands straight behind the grid)
const gapTo = (m, u, v) => Math.hypot(Math.max(0, Math.abs(u - m.u) - m.L / 2), Math.max(0, Math.abs(v - m.v) - m.W / 2));

test("rear-of-grid official, every cached circuit: waves on the track by the medical car, on its side; never in the pit lane", async () => {
  const { flagSpot, flagAt } = await load();
  // (25 cached circuits; Spa's one race, 2025, started behind the safety car – no standing start, no flag – so 24)
  assert.ok(FX.length >= 24, "one race per cached circuit with a standing start");
  const bad = [];
  for (const fx of FX) {
    const g = ground(fx), m = fx.med, why = [];
    let sp; try { sp = flagSpot(g); } catch (e) { bad.push(`${fx.loc} (${fx.item}): no place (${e.message})`); continue; }
    const f = sp.flag, e = g.edges(f.u);
    if (!(f.v <= e.L - 0.5 && f.v >= e.R + 0.5)) why.push(`flag off the asphalt (v ${f.v.toFixed(2)}, edges ${e.R}…${e.L})`);
    if (g.inPit(f.u, f.v)) why.push(`flag in the pit lane (v ${f.v.toFixed(2)})`);
    if (Math.abs(m.v) >= 0.3 && Math.sign(f.v) !== Math.sign(m.v)) why.push(`flag not on the medical car's side (v ${f.v.toFixed(2)}, car ${m.v})`);
    const gap = gapTo(m, f.u, f.v);
    if (!(gap >= 0.5 && gap <= 3)) why.push(`flag ${gap.toFixed(2)} m from the medical car (0.5–3)`);
    // behind the last row: the last car's rear is 2.7 m ahead of the grid's rear point (its box 5.5 m ahead, ~5.6 m long)
    if (!(f.u <= 1)) why.push(`flag not behind the last row (u ${f.u})`);
    // the walk-off: off the asphalt at its end, never into the pit lane on the way, never through the medical car
    const x = sp.exit, ex = g.edges(x.u);
    if (!(x.v >= ex.L + 0.8 || x.v <= ex.R - 0.8)) why.push(`walk ends on the track (v ${x.v.toFixed(2)}, edges ${ex.R}…${ex.L})`);
    for (let k = 0; k <= 1.0001; k += 0.02) {
      const p = flagAt(sp, "leave", k);
      if (g.inPit(p.u, p.v)) { why.push(`walks into the pit lane (u ${p.u.toFixed(1)}, v ${p.v.toFixed(2)})`); break; }
      if (gapTo(m, p.u, p.v) < 0.3) { why.push(`walks through the medical car (u ${p.u.toFixed(1)}, v ${p.v.toFixed(2)})`); break; }
    }
    // a barrier beyond the edge: short of it, or – one within 1.6 m of the edge, no room in front (street circuits: 1.4 m) –
    // behind it at an opening (Appendix H 2026 2.5.5 g); never behind the pit wall (the pit-lane checks above)
    const side = x.v > 0 ? "L" : "R", past = Math.abs(x.v) - Math.abs(side === "L" ? ex.L : ex.R), w = fx.wall[side];
    if (w != null && past > w && w > 1.6) why.push(`walks through a barrier ${w} m past the edge (to ${past.toFixed(2)} m)`);
    if (why.length) bad.push(`${fx.loc} (${fx.item}): ${why.join("; ")}`);
  }
  assert.deepStrictEqual(bad, [], `the official misplaced at ${bad.length} circuit(s):\n  ${bad.join("\n  ")}`);
});

test("rear-of-grid official: the same moment gives the same place; waving, then a walk that ends where the exit is", async () => {
  const { flagSpot, flagAt } = await load();
  const g = ground(FX[0]), a = flagSpot(g), b = flagSpot(g);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(flagAt(a, "flag", 0.2), flagAt(a, "flag", 0.9), "standing still while waving");
  assert.strictEqual(flagAt(a, "flag", 0.5).facing, "grid");
  const end = flagAt(a, "leave", 1);
  assert.deepStrictEqual([end.u, end.v], [a.exit.u, a.exit.v]);
  assert.ok(flagAt(a, "leave", 0.5).walked > 0 && flagAt(a, "leave", 0.5).walked < end.walked);
});

test("rear-of-grid official: a pit lane right beside the medical car's edge sends them off the other side, across in front of it", async () => {
  const { flagSpot, flagAt } = await load();
  // a made-up straight: 12 m of asphalt, the medical car on the left half, the pit lane from 0.5 m past the left edge
  // (a pit wall at the edge – nowhere to stand on that side), nothing on the right
  const med = { u: -7.5, v: 3, L: 5.05, W: 1.96 };
  const g = { gbV: 3, med, edges: () => ({ L: 6, R: -6 }), wall: { L: 0.3, R: null }, inPit: (u, v) => v >= 6.5 && v <= 20, sides: null };
  const sp = flagSpot(g);
  assert.ok(sp.flag.v > 0 && sp.flag.v < 6, `waves on the left half (v ${sp.flag.v})`);
  assert.ok(sp.exit.v < -6.5, `walks off on the right (v ${sp.exit.v})`);
  for (let k = 0; k <= 1; k += 0.05) { const p = flagAt(sp, "leave", k); assert.ok(gapTo(med, p.u, p.v) >= 0.3, "not through the medical car"); }
  // the same with room on the left: off on its own side, short of the barrier
  const g2 = { ...g, wall: { L: 3, R: null }, inPit: () => false }, sp2 = flagSpot(g2);
  assert.ok(sp2.exit.v > 6.8 && sp2.exit.v < 6 + 3, `off on the medical car's side, short of the barrier (v ${sp2.exit.v})`);
});
