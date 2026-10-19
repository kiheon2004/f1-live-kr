// The cockpit check over every car model and the whole turn of the wheel (src/renderer/cockpitcheck.js): for each
// distinct car template (season, team, shape date), at every 5° from −90° to 90°, the deepest point of the steering
// wheel, gloves, gauntlets and sleeves inside the chassis' skin, the tub, the rim and the headrest; and the arms' wrist
// angles. Slow (a minute or two): a development check, the unit tests run a few cases.
//   node tools/cockpit-check.js [out.json]
const path = require("path"), fs = require("fs");
(async () => {
  const R = (f) => import(path.join(__dirname, "../src/renderer", f));
  const C = await R("car3d.js"), K = await R("cockpitcheck.js"), A = await R("arms.js");
  const teams = ["Red Bull Racing", "McLaren", "Ferrari", "Mercedes", "Aston Martin", "Alpine", "Williams", "Racing Bulls", "Kick Sauber", "Haas F1 Team", "Cadillac", "Audi", "Unknown"];
  const dates = [null, "2026-05-03", "2026-07-26"], seen = new Set(), rows = [];
  for (const season of [2022, 2023, 2024, 2025, 2026]) for (const team of teams) for (const date of dates) {
    const p = C.profileFor(season, team, date); if (seen.has(p.key)) continue; seen.add(p.key);
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season, date }), u = car.userData, solids = K.cockpitSolids(car), worst = {};
    let wristWorst = { flex: 0, rad: 0, pron: 0 };
    for (let deg = -90; deg <= 90; deg += 5) {
      C.setWheels(car, 0, -(deg * Math.PI / 180) / C.STEER_RATIO); car.updateMatrixWorld(true);
      for (const [k, d] of Object.entries(K.cockpitClash(car, solids, 4))) worst[k] = Math.max(worst[k] || 0, d);
      for (const a of u.arms) { const o = a.pose; for (const q of ["flex", "rad", "pron"]) if (Math.abs(o[q]) > Math.abs(wristWorst[q])) wristWorst[q] = +o[q].toFixed(1); }
    }
    const row = { key: p.key, season, team, date, worstMm: Object.fromEntries(Object.entries(worst).map(([k, d]) => [k, +(d * 1000).toFixed(1)])), wristWorst, baked: u.armPlan.baked };
    rows.push(row); console.log(JSON.stringify(row));
  }
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(rows, null, 1));
})();
