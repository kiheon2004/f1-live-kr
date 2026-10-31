// v0.52: the driver's-eye view measured over cars × steering angles × window shapes (src/renderer/eyeview.js).
// node tools/eyeview.mjs [out.json] [--quick]  – prints a table, writes every number to out.json
import { writeFileSync } from "node:fs";
const R = process.cwd() + "/src/renderer/";
const C = await import(R + "car3d.js"), E = await import(R + "eyeview.js"), K = await import(R + "eyecam.js"), A = await import(R + "arms.js");
const quick = process.argv.includes("--quick"), out = process.argv.find((a) => a.endsWith(".json"));
const CARS = quick ? [[2025, "McLaren"], [2026, "Ferrari"]] : [[2025, "McLaren"], [2025, "Ferrari"], [2025, "Red Bull Racing"], [2025, "Mercedes"], [2025, "Williams"], [2025, "Haas F1 Team"], [2026, "McLaren"], [2026, "Ferrari"], [2026, "Mercedes"], [2026, "Cadillac"], [2026, "Audi"]];
// (wheel angles: straight, a fast corner ~30°, medium ~60°, full ±90° lock, the slow hairpin's 140° lock (car3d LOCK_MAX))
const ANGLES = [0, 30, 60, 90, -90, 140, -140];
// (a speed for each angle – the corners they belong to: straight, fast, medium, slow, hairpin – for the head's turn)
const KMH = { 0: 290, 30: 220, 60: 150, 90: 100, 140: 50 };
// the path's curvature that gives this wheel angle at this speed (map3d pathSteer inverted: δ = atan(3.4κ) + 0.01·v²κ/g)
const kappaFor = (deg, v) => { const d = (deg * D) / C.STEER_RATIO; let k = 0; for (let i = 0; i < 40; i++) { const f = Math.atan(3.4 * k) + (0.01 * v * v * k) / 9.81 - d, df = 3.4 / (1 + (3.4 * k) ** 2) + (0.01 * v * v) / 9.81; k -= f / df; } return k; };
const ASPECTS = { "16:9": 16 / 9, "16:10": 1.6, "1280x720": 1280 / 720, "4:3": 4 / 3 };
const D = Math.PI / 180, rows = [];
for (const [season, team] of CARS) {
  const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }); C.setCockpit(car, true);
  car.userData.helmet.visible = false;   // (as map3d hides the rider's own helmet)
  for (const deg of ANGLES) {
    // (+deg = the wheel turned left: setWheels' steer is −wheel/ratio; speed slow so the 140° lock is allowed)
    C.setWheels(car, 0, -(deg * D) / C.STEER_RATIO, 100000, 5, () => deg * D); car.updateMatrixWorld(true);   // (held at this angle: the swing across settled – a history that says so)
    const wrist = car.userData.arms.map((a) => ({ k: a.k, flex: +a.pose.flex.toFixed(1), rad: +a.pose.rad.toFixed(1), pron: +a.pose.pron.toFixed(1) }));
    for (const [an, asp] of Object.entries(ASPECTS)) {
      if (quick && an !== "16:9") continue;
      const cam = K.eyeCamera(car, asp), m = E.measureEyeView(car, cam, 240);
      // (v0.52: and with the head turned into the bend as the app turns it – eyecam.js headYawFor; + wheel = a right turn)
      const v = KMH[Math.abs(deg)] / 3.6, yaw = K.headYawFor([-kappaFor(deg, v)], v), mh = E.measureEyeView(car, K.eyeCamera(car, asp, 0.03, { head: yaw }), 240);
      rows.push({ season, team, deg, aspect: an, fov: +cam.fov.toFixed(1), wrist, ...m, head: { deg: +(yaw / D).toFixed(1), all: mh.all, centre: mh.centre, forward: mh.forward, mirror: mh.mirror, display: mh.display, cut: mh.cut } });
    }
    // (the mirrors sit ~50° off the straight-ahead view, out of the 80° lens: looked at with the free look, 46° each way)
    const mir = [0.8, -0.8].map((yaw) => { const m = E.measureEyeView(car, K.eyeCamera(car, 16 / 9, 0.03, { yaw }), 240); return { yaw, ...m.mirror }; });
    rows[rows.length - 1].mirrorLook = mir;
  }
  console.error("done", season, team);
}
const pct = (x) => (x * 100).toFixed(1).padStart(5);
console.log("car              deg  asp      vfov | ALL arm+glv wheel body  out  | CTR arm | HEAD° ALL arm CTR arm cut | FWD arm+glv wheel out (bare out) | mirror hid | disp hid | cut | mirror look L/R px:hid | wrist L flex/rad R flex/rad");
for (const r of rows) console.log(`${r.season} ${r.team.padEnd(14).slice(0, 14)} ${String(r.deg).padStart(4)} ${r.aspect.padEnd(8)} ${r.fov.toFixed(0).padStart(4)} | ${pct(r.all.arm + r.all.glove)} ${pct(r.all.wheel + r.all.display)} ${pct(r.all.body + r.all.driver)} ${pct(r.all.outside)} | ${pct(r.centre.arm + r.centre.glove)} | ${r.head.deg.toFixed(0).padStart(4)} ${pct(r.head.all.arm + r.head.all.glove)} ${pct(r.head.centre.arm + r.head.centre.glove)} ${JSON.stringify(r.head.cut)} | ${pct(r.forward.arm + r.forward.glove)} ${pct(r.forward.wheel + r.forward.display)} ${pct(r.forward.outside)} (${pct(r.forwardBare.outside)}) | ${String(r.mirror.px).padStart(4)} ${pct(r.mirror.hidden)} | ${String(r.display.px).padStart(4)} ${pct(r.display.hidden)} | ${JSON.stringify(r.cut)} | ${r.mirrorLook ? r.mirrorLook.map((q) => q.px + ":" + pct(q.hidden)).join(" ") : ""} | ${r.wrist.map((w) => w.flex + "/" + w.rad).join(" ")}`);
if (out) writeFileSync(out, JSON.stringify(rows));
