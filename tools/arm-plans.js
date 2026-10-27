// Bakes the driver's arm plans (src/renderer/arms.js planArmsPath – the whole turn of the wheel at once, ~10–60 s each)
// into src/renderer/armplans.js for every cockpit geometry the car models have (one per era so far), so a car never
// makes one at run time. Run after changing the cockpit's wheel, shoulders, the glove's grip or the arms' cost:
//   node tools/arm-plans.js        (test/arms.test.js fails while a car's geometry has no baked plan)
//   node tools/arm-plans.js --jobs 8   (v0.43: the geometries shared out over 8 processes – the same plans, sooner)
const path = require("path"), fs = require("fs"), os = require("os"), { fork } = require("child_process");
const argJobs = process.argv.indexOf("--jobs"), JOBS = argJobs > 0 ? +process.argv[argJobs + 1] : 1, WORKER = process.argv.indexOf("--worker");
(async () => {
  const R = (f) => import(path.join(__dirname, "../src/renderer", f));
  const C = await R("car3d.js"), A = await R("arms.js"), B = await R("body3d.js");
  const D = Math.PI / 180, seen = new Map();
  for (const season of [2022, 2023, 2024, 2025, 2026]) for (const team of ["Red Bull Racing", "McLaren", "Ferrari", "Mercedes", "Aston Martin", "Alpine", "Williams", "Racing Bulls", "Kick Sauber", "Haas F1 Team", "Cadillac", "Audi", "RB"]) {
    for (const date of [null, "2026-05-03", "2026-07-26"]) { const g = C.armGeometry(season, team, date); if (!seen.has(g.key)) seen.set(g.key, g); }
  }
  const out = {}, keys = [...seen.keys()];
  if (JOBS > 1 && WORKER < 0) {
    // (each worker bakes every JOBS-th geometry and writes its plans to a file; merged in the usual order)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "armplans-"));
    await Promise.all([...Array(JOBS).keys()].map((i) => new Promise((ok, no) => fork(__filename, ["--worker", String(i), String(JOBS), tmp]).on("exit", (c) => (c ? no(new Error(`worker ${i} ${c}`)) : ok())))));
    const all = Object.assign({}, ...[...Array(JOBS).keys()].map((i) => JSON.parse(fs.readFileSync(path.join(tmp, `${i}.json`), "utf8"))));
    for (const k of keys) out[k] = all[k];
    fs.rmSync(tmp, { recursive: true });
  } else for (const [n, [key, g]] of [...seen].entries()) {
    if (WORKER > 0 && n % +process.argv[WORKER + 2] !== +process.argv[WORKER + 1]) continue;
    const t0 = Date.now();
    // the hand's roll round its grip: the best whole-turn plan on a coarse grid, 40°–100°; then the fine plan for it
    let best = null;
    for (let r = 40; r <= 100; r += 10) { const geo = A.armGeo(g.base, g.grip, g.glove, r * D), p = A.planArmsPath(geo, { swStep: 10 * D, rlStep: 5 * D }); if (!best || p.cost < best.cost) best = { cost: p.cost, r }; }
    const plan = A.planArmsPath(A.armGeo(g.base, g.grip, g.glove, best.r * D));
    // v0.45: the lowered hand's other way (the elbow up and across, from the stop to SWAP.min) and the regrip between
    const set = (p) => p.rows.map((r) => [r.sw, r.fw, r.up, r.rl].map((v) => +v.toFixed(5)));
    const geo = plan.geo, plan2 = A.planSwapPath(geo, A.smoothPlan(geo, set(plan))), log = [];
    const move = A.planSwapMove(geo, A.smoothPlan(geo, set(plan)), A.smoothPlan(geo, set(plan2), 0, -A.PLAN_MAX, 0), { log: (m) => log.push(m) });
    out[key] = { rho: best.r, rows: set(plan), swap: { rows: set(plan2), move } };
    console.log(`${key.slice(0, 60)}…  ρ ${best.r}°  mean cost ${plan.cost.toFixed(2)}  worst ${plan.worst.toFixed(1)}  other way ${plan2.cost.toFixed(2)}  ${log.join("; ")}  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  if (WORKER > 0) { fs.writeFileSync(path.join(process.argv[WORKER + 3], `${process.argv[WORKER + 1]}.json`), JSON.stringify(out)); return; }
  const src = `// Baked by tools/arm-plans.js (${new Date().toISOString().slice(0, 10)}) – the driver's arm plans per cockpit geometry (arms.js
// planArmsPath): the hand's roll round its grip (deg) and per 2° of the wheel's turn from −90° the elbow's swivel (rad),
// the shoulder's travel forward and up (m) and the grip's turn in the hand (rad); v0.45 swap: the lowered hand's other
// way (the same per 2° from −90° to −SWAP.min) and the regrip's path (arms.js planSwapMove). Don't edit: re-bake.
export const ARM_PLANS = ${JSON.stringify(out)};
`;
  fs.writeFileSync(path.join(__dirname, "../src/renderer/armplans.js"), src);
})();
