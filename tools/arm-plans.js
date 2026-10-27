// Bakes the driver's arm plans (src/renderer/arms.js planArmsPath – the whole turn of the wheel at once, ~10–60 s each)
// into src/renderer/armplans.js for every cockpit geometry the car models have (one per era so far), so a car never
// makes one at run time. Run after changing the cockpit's wheel, shoulders, the glove's grip or the arms' cost:
//   node tools/arm-plans.js        (test/arms.test.js fails while a car's geometry has no baked plan)
//   node tools/arm-plans.js --jobs 8   (v0.43: the geometries shared out over 8 processes – the same plans, sooner)
//   node tools/arm-plans.js --reuse    (v0.46: the −90…90 plans kept from armplans.js where only other settings changed)
const path = require("path"), fs = require("fs"), os = require("os"), { fork } = require("child_process");
const REUSE = process.argv.includes("--reuse"), argJobs = process.argv.indexOf("--jobs"), JOBS = argJobs > 0 ? +process.argv[argJobs + 1] : 1, WORKER = process.argv.indexOf("--worker");
(async () => {
  const R = (f) => import(path.join(__dirname, "../src/renderer", f));
  const C = await R("car3d.js"), A = await R("arms.js"), B = await R("body3d.js");
  const D = Math.PI / 180, seen = new Map();
  for (const season of [2022, 2023, 2024, 2025, 2026]) for (const team of ["Red Bull Racing", "McLaren", "Ferrari", "Mercedes", "Aston Martin", "Alpine", "Williams", "Racing Bulls", "Kick Sauber", "Haas F1 Team", "Cadillac", "Audi", "RB"]) {
    for (const date of [null, "2026-05-03", "2026-07-26"]) { const g = C.armGeometry(season, team, date); if (!seen.has(g.key)) seen.set(g.key, g); }
  }
  const out = {}, keys = [...seen.keys()];
  // (--reuse: the baked plans' geometry without the cost settings' part of the key – PLAN_COST)
  const geomOnly = (k) => JSON.stringify(JSON.parse(k).filter((v) => !(typeof v === "string" && v.startsWith("{\"WRIST_COMFORT"))));
  const OLD = new Map(); if (REUSE) { const { ARM_PLANS } = await R("armplans.js"); for (const [k, v] of Object.entries(ARM_PLANS)) OLD.set(geomOnly(k), v); }
  if (JOBS > 1 && WORKER < 0) {
    // (each worker bakes every JOBS-th geometry and writes its plans to a file; merged in the usual order)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "armplans-"));
    await Promise.all([...Array(JOBS).keys()].map((i) => new Promise((ok, no) => fork(__filename, ["--worker", String(i), String(JOBS), tmp, ...(REUSE ? ["--reuse"] : [])]).on("exit", (c) => (c ? no(new Error(`worker ${i} ${c}`)) : ok())))));
    const all = Object.assign({}, ...[...Array(JOBS).keys()].map((i) => JSON.parse(fs.readFileSync(path.join(tmp, `${i}.json`), "utf8"))));
    for (const k of keys) out[k] = all[k];
    fs.rmSync(tmp, { recursive: true });
  } else for (const [n, [key, g]] of [...seen].entries()) {
    if (WORKER > 0 && n % +process.argv[WORKER + 2] !== +process.argv[WORKER + 1]) continue;
    const t0 = Date.now();
    // the hand's roll round its grip: the best whole-turn plan on a coarse grid, 40°–100°; then the fine plan for it
    // (v0.46 --reuse: the −90…90 plan taken from the plans baked now for the same geometry when only settings planArmsPath
    // doesn't use changed – the same rows it would make again: test/arms.test.js re-plans one and compares)
    let best = null, plan = null; const old = REUSE ? OLD.get(geomOnly(key)) : null;
    if (old) { best = { r: old.rho }; plan = A.smoothPlan(A.armGeo(g.base, g.grip, g.glove, old.rho * D), old.rows); }
    else {
      for (let r = 40; r <= 100; r += 10) { const geo = A.armGeo(g.base, g.grip, g.glove, r * D), p = A.planArmsPath(geo, { swStep: 10 * D, rlStep: 5 * D }); if (!best || p.cost < best.cost) best = { cost: p.cost, r }; }
      plan = A.planArmsPath(A.armGeo(g.base, g.grip, g.glove, best.r * D));
    }
    // v0.46: the rising arm on to the 180° lock, the lowered arm's other way (up and across) and the swing between, the
    // hand on its grip: the rising rows first without the other arm, the other way kept out of them, then the rising rows
    // again kept out of the other way, and the other way once more against those (each arm the other's obstacle)
    const set = (p) => p.rows.map((r) => [r.sw, r.fw, r.up, r.rl].map((v) => +v.toFixed(5)));
    const geo = plan.geo, p1 = A.smoothPlan(geo, set(plan)), whole = (ext) => A.smoothPlan(geo, [...set(plan), ...ext.map((r) => r.map((v) => +v.toFixed(5)))], 0, -A.PLAN_MAX, A.PLAN_MAX / A.PLAN_STEP);
    let rise = A.planRise(geo, p1), across = A.planAcross(geo, whole(rise));
    rise = A.planRise(geo, p1, across); across = A.planAcross(geo, whole(rise));
    const log = [], swing = A.planSwing(geo, whole(rise), across, { log: (m) => log.push(m) });
    out[key] = { rho: best.r, rows: set(plan), rise: rise.map((r) => r.map((v) => +v.toFixed(5))), across: set(across), swing };
    console.log(`${key.slice(0, 60)}…  ρ ${best.r}°  mean cost ${plan.cost.toFixed(2)}  worst ${plan.worst.toFixed(1)}  across ${across.cost.toFixed(2)} (worst ${across.worst.toFixed(1)})  swing ${log.join("; ")}  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  if (WORKER > 0) { fs.writeFileSync(path.join(process.argv[WORKER + 3], `${process.argv[WORKER + 1]}.json`), JSON.stringify(out)); return; }
  const src = `// Baked by tools/arm-plans.js (${new Date().toISOString().slice(0, 10)}) – the driver's arm plans per cockpit geometry (arms.js
// planArmsPath): the hand's roll round its grip (deg) and per 2° of the wheel's turn from −90° the elbow's swivel (rad),
// the shoulder's travel forward and up (m) and the grip's turn in the hand (rad); v0.46: rise – the same from 92° to the
// 180° lock (arms.js planRise), across – the lowered arm's other way per 2° from −180° to −SWAP.min (planAcross), swing –
// the elbow's swing between with the hand on its grip (planSwing). Don't edit: re-bake.
export const ARM_PLANS = ${JSON.stringify(out)};
`;
  fs.writeFileSync(path.join(__dirname, "../src/renderer/armplans.js"), src);
})();
