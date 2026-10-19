// Bakes the driver's arm plans (src/renderer/arms.js planArmsPath – the whole turn of the wheel at once, ~10–60 s each)
// into src/renderer/armplans.js for every cockpit geometry the car models have (one per era so far), so a car never
// makes one at run time. Run after changing the cockpit's wheel, shoulders, the glove's grip or the arms' cost:
//   node tools/arm-plans.js        (test/arms.test.js fails while a car's geometry has no baked plan)
const path = require("path"), fs = require("fs");
(async () => {
  const R = (f) => import(path.join(__dirname, "../src/renderer", f));
  const C = await R("car3d.js"), A = await R("arms.js"), B = await R("body3d.js");
  const D = Math.PI / 180, seen = new Map();
  for (const season of [2022, 2023, 2024, 2025, 2026]) for (const team of ["Red Bull Racing", "McLaren", "Ferrari", "Mercedes", "Aston Martin", "Alpine", "Williams", "Racing Bulls", "Kick Sauber", "Haas F1 Team", "Cadillac", "Audi", "RB"]) {
    const g = C.armGeometry(season, team); if (!seen.has(g.key)) seen.set(g.key, g);
  }
  const out = {};
  for (const [key, g] of seen) {
    const t0 = Date.now();
    // the hand's roll round its grip: the best whole-turn plan on a coarse grid, 40°–100°; then the fine plan for it
    let best = null;
    for (let r = 40; r <= 100; r += 10) { const geo = A.armGeo(g.base, g.grip, g.glove, r * D), p = A.planArmsPath(geo, { swStep: 10 * D, rlStep: 5 * D }); if (!best || p.cost < best.cost) best = { cost: p.cost, r }; }
    const plan = A.planArmsPath(A.armGeo(g.base, g.grip, g.glove, best.r * D));
    out[key] = { rho: best.r, rows: plan.rows.map((r) => [r.sw, r.fw, r.up, r.rl].map((v) => +v.toFixed(5))) };
    console.log(`${key.slice(0, 60)}…  ρ ${best.r}°  mean cost ${plan.cost.toFixed(2)}  worst ${plan.worst.toFixed(1)}  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  const src = `// Baked by tools/arm-plans.js (${new Date().toISOString().slice(0, 10)}) – the driver's arm plans per cockpit geometry (arms.js
// planArmsPath): the hand's roll round its grip (deg) and per 2° of the wheel's turn from −90° the elbow's swivel (rad),
// the shoulder's travel forward and up (m) and the grip's turn in the hand (rad). Don't edit: re-bake.
export const ARM_PLANS = ${JSON.stringify(out)};
`;
  fs.writeFileSync(path.join(__dirname, "../src/renderer/armplans.js"), src);
})();
