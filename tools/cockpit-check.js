// The cockpit check over every car model and the whole turn of the wheel (src/renderer/cockpitcheck.js): for each
// distinct car template (season, team, shape date), at every 5° from −90° to 90°, the deepest point of the steering
// wheel, gloves, gauntlets and sleeves inside the chassis' skin, the tub, the rim, the headrest and the torso; and the
// arms' wrist angles. v0.43: both pairs of gloves – the light pair every car shows and the fine pair of the car a
// cockpit camera rides in (setCockpit) –, the depth as the true shortest distance to the skin (penetration; the
// straight up/down one beside it), every vertex (step 1), and the triangles' crossings between the vertices
// (surfaceCrossings: an edge of one through a face of the other). Slow (several minutes): a development check, the
// unit tests run a few cases.
// v0.45: each angle held in the session's time (the app's pose: past ±50° the lowered hand holds its grip the other way),
// and the regrip measured through a turn into the stop and out (regripMm, regripWrist).
//   node tools/cockpit-check.js [out.json] [--quick]   (--quick: 15° steps, the light gloves only, no crossings, no regrip)
const path = require("path"), fs = require("fs");
(async () => {
  const R = (f) => import(path.join(__dirname, "../src/renderer", f));
  const C = await R("car3d.js"), K = await R("cockpitcheck.js");
  const quick = process.argv.includes("--quick"), out = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const teams = ["Red Bull Racing", "McLaren", "Ferrari", "Mercedes", "Aston Martin", "Alpine", "Williams", "Racing Bulls", "Kick Sauber", "Haas F1 Team", "Cadillac", "Audi", "Unknown"];
  const dates = [null, "2026-05-03", "2026-07-26"], seen = new Set(), rows = [];
  const mm = (o) => Object.fromEntries(Object.entries(o).map(([k, d]) => [k, / x /.test(k) ? d : +(d * 1000).toFixed(1)]));
  for (const season of [2022, 2023, 2024, 2025, 2026]) for (const team of teams) for (const date of dates) {
    const p = C.profileFor(season, team, date); if (seen.has(p.key)) continue; seen.add(p.key);
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season, date }), u = car.userData, solids = K.cockpitSolids(car);
    const row = { key: p.key, season, team, date, wheel: u.wheelSpec?.id || null, open: solids.filter((s) => !s.closed).map((s) => s.name), baked: u.armPlan.baked };
    for (const fine of quick ? [false] : [false, true]) {
      C.setCockpit(car, fine);
      const worst = {}, vertical = {}, inner = {}, lock = {}; let wristWorst = { flex: 0, rad: 0, pron: 0 };
      let T = 0;
      for (let deg = -90; deg <= 90; deg += quick ? 15 : 5) {
        // (v0.45: held at the angle in the session's time – the pose the app shows there; the lowered hand's regrip is
        // checked below)
        C.setWheels(car, 0, -(deg * Math.PI / 180) / C.STEER_RATIO, (T += 10000)); car.updateMatrixWorld(true);
        const near = K.cockpitClash(car, solids, 1, { nearest: true, edges: !quick }), vert = K.cockpitClash(car, solids, 1);
        for (const [k, d] of Object.entries(near)) { worst[k] = Math.max(worst[k] || 0, d); (Math.abs(deg) <= 55 ? inner : lock)[k] = Math.max((Math.abs(deg) <= 55 ? inner : lock)[k] || 0, d); }
        for (const [k, d] of Object.entries(vert)) vertical[k] = Math.max(vertical[k] || 0, d);
        for (const a of u.arms) { const o = a.pose; for (const q of ["flex", "rad", "pron"]) if (Math.abs(o[q]) > Math.abs(wristWorst[q])) wristWorst[q] = +o[q].toFixed(1); }
      }
      // v0.45: the regrip – into the stop and out again at 90°/s both ways, every 50 ms of the session's time (the hand off
      // its grip: armswap.js / arms.js armSwapPose)
      const regrip = {}; let regripWrist = { flex: 0, rad: 0, pron: 0 };
      if (!quick) for (const side of [-1, 1]) {
        const at = (t) => side * (t < 300 ? 0 : t < 1300 ? 90 * (t - 300) / 1000 : t < 2800 ? 90 : t < 3800 ? 90 - 90 * (t - 2800) / 1000 : 0);
        T += 10000;
        for (let t = 0; t <= 4400; t += 1000 / 60) {
          C.setWheels(car, 0, -(at(t) * Math.PI / 180) / C.STEER_RATIO, T + t);
          if (Math.round(t) % 50 >= 17) continue;
          car.updateMatrixWorld(true);
          for (const [k, d] of Object.entries(K.cockpitClash(car, solids, 1, { nearest: true }))) regrip[k] = Math.max(regrip[k] || 0, d);
          for (const a of u.arms) { const o = a.pose; for (const q of ["flex", "rad", "pron"]) if (Math.abs(o[q]) > Math.abs(regripWrist[q])) regripWrist[q] = +o[q].toFixed(1); }
        }
      }
      row[fine ? "fine" : "light"] = { nearestMm: mm(worst), within55: mm(inner), beyond55: mm(lock), verticalMm: mm(vertical), wristWorst, regripMm: mm(regrip), regripWrist };
    }
    rows.push(row); console.log(JSON.stringify(row));
  }
  if (out) fs.writeFileSync(out, JSON.stringify(rows, null, 1));
})();
