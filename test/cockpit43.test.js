// v0.43: the cockpit from the driver's eyes. v0.42's opened tub showed nothing of the car round the steering wheel –
// the wheel seemed to float over the road (the user's screenshot against an official onboard): the chassis beside and
// ahead of the driver was ~0.27–0.29 m half wide with its top drawn in (the opening's edge fell on its flank – no wall
// top), the wheel's top (0.717 m) stood over the line from the eyes to the coaming (the lip hidden behind the wheel),
// and the only thing under the wheel was the tub's dark floor. Checked here on the generated meshes, every car model.
const test = require("node:test");
const assert = require("node:assert");

const D = Math.PI / 180;
const TEAMS = ["Red Bull Racing", "McLaren", "Ferrari", "Mercedes", "Aston Martin", "Alpine", "Williams", "Racing Bulls", "Kick Sauber", "Haas F1 Team", "Cadillac", "Audi", "Unknown"];
async function shapes() {
  const C = await import("../src/renderer/car3d.js"), seen = new Set(), out = [];
  for (const season of [2022, 2025, 2026]) for (const team of TEAMS) for (const date of [null, "2026-07-26"]) {
    const p = C.profileFor(season, team, date); if (seen.has(p.key)) continue; seen.add(p.key); out.push({ season, team, date, p });
  }
  return out;
}

test("cockpit v0.43: from the eyes the coaming shows over the steering wheel's top – a band of the car's own front beyond the wheel, below the horizon", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js");
  for (const { season, team, date, p } of await shapes()) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season, date }); car.updateMatrixWorld(true);
    const u = car.userData, eye = u.mounts.eye, O = C.cockpitOpening(p);
    // the wheel's highest point (straight ahead) and the coaming's: the highest of the chassis or rim straight ahead of
    // the eye between the opening's front and 0.3 m beyond it (rays down at x = 0; the halo's pillar not counted)
    const box = new THREE.Box3(); u.wheel.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !/glove/i.test(o.name)) box.expandByObject(o); });
    const wTop = Math.atan2(box.max.y - eye.y, (u.wheel.position.z - 0.03) - eye.z) / D;
    const body = [car.getObjectByName("rim"), car.getObjectByName("tub")], ray = new THREE.Raycaster();
    const skin = new THREE.Mesh(u.bodySkin[0]); skin.updateMatrixWorld(true); body.push(skin);
    let lip = -90;
    for (let z = O.zF - 0.02; z <= O.zF + 0.3; z += 0.02) { ray.set(new THREE.Vector3(0, 2, z), new THREE.Vector3(0, -1, 0)); const h = ray.intersectObjects(body, false)[0]; if (h) lip = Math.max(lip, Math.atan2(h.point.y - eye.y, z - eye.z) / D); }
    assert.ok(lip > wTop + 1, `${season} ${team} ${date || ""}: the coaming at ${lip.toFixed(1)}° from the eyes, the wheel's top at ${wTop.toFixed(1)}° – hidden behind it`);
    assert.ok(lip < -1.5 && lip > -10, `${season} ${team}: the coaming ${lip.toFixed(1)}° – below the horizon, in view (helmet-cam footage 4–9° down, research/cockpit43.md)`);
    // (the chassis' top under the FIA's Z 645 cap over the cockpit's stretch – ~0.685 m in the car's frame, the reference
    // plane ~4 cm up; 2022–25 C12.4 / 2026 C12.3, research/cockpit43.md)
    for (let z = O.zR + 0.05; z <= O.zF + 0.2; z += 0.05) { ray.set(new THREE.Vector3(O.w(Math.min(z, O.zF)) + 0.04, 2, z), new THREE.Vector3(0, -1, 0)); const h = ray.intersectObject(skin, false)[0]; if (h) assert.ok(h.point.y < 0.69, `${season} ${team}: the chassis' top ${h.point.y.toFixed(3)} m at z ${z.toFixed(2)}`); }
  }
});

test("cockpit v0.43: the opening's sides are walls with a top – at least 5 cm of the chassis' top outside the edge, level with it, beside the driver and the wheel", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js");
  for (const { season, team, date, p } of await shapes()) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season, date }), u = car.userData, O = C.cockpitOpening(p);
    const skin = new THREE.Mesh(u.bodySkin[0]); skin.updateMatrixWorld(true); const ray = new THREE.Raycaster();
    const top = (x, z) => { ray.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0)); return ray.intersectObject(skin, false)[0]?.point.y ?? null; };
    for (let z = u.mounts.eye.z; z <= O.zF - 0.15; z += 0.05) for (const k of [1, -1]) {
      const w = O.w(z), a = top((w + 0.012) * k, z), b = top((w + 0.06) * k, z);
      assert.ok(a != null && b != null, `${season} ${team}: no wall top at z ${z.toFixed(2)}`);
      assert.ok(Math.abs(a - b) < 0.035, `${season} ${team} ${date || ""}: the wall's top falls ${((a - b) * 100).toFixed(1)} cm in 5 cm at z ${z.toFixed(2)} – a flank, not a top`);
      assert.ok(a > 0.57, `${season} ${team}: the wall's top ${a.toFixed(3)} m at z ${z.toFixed(2)}`);
    }
  }
});

test("cockpit v0.43: through the eye camera's lens both lower corners show the car's sides (not the road), the middle above the wheel the coaming", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js");
  for (const [season, team] of [[2025, "Ferrari"], [2025, "Aston Martin"], [2026, "Mercedes"], [2026, "Cadillac"], [2027, "Unknown"]]) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }); car.updateMatrixWorld(true);
    const u = car.userData, cam = new THREE.PerspectiveCamera(1, 16 / 9, 0.03, 100);
    // (the app's eye camera: 80° across, 8° down – map3d.js; its vertical angle from the 16:9 width)
    cam.fov = 2 * Math.atan(Math.tan(40 * D) / cam.aspect) / D; cam.position.copy(u.mounts.eye); cam.rotation.set(0, Math.PI, 0); cam.rotateX(-8 * D); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    const body = ["painted", "rim", "tub"].map((n) => car.getObjectByName(n)); body.forEach((m) => { m.material.side = THREE.DoubleSide; });
    const ray = new THREE.Raycaster();
    for (const [nx, ny, what] of [[-0.92, -0.8, "lower left"], [0.92, -0.8, "lower right"], [-0.85, -0.55, "left side"], [0.85, -0.55, "right side"]]) {
      ray.setFromCamera(new THREE.Vector2(nx, ny), cam); const h = ray.intersectObjects(body, false)[0];
      assert.ok(h && h.distance < 1.5, `${season} ${team}: the ${what} of the eye view sees ${h ? `${h.object.name} at ${h.distance.toFixed(2)} m` : "no part of the car"}`);
    }
  }
});

test("cockpit v0.43: the fine gloves of the car a cockpit camera rides in, and the light pair, clear of the car's body at every angle – every vertex, the true depth, and no triangle crossing between the vertices", async () => {
  const C = await import("../src/renderer/car3d.js"), K = await import("../src/renderer/cockpitcheck.js");
  for (const [season, team] of [[2025, "Ferrari"], [2026, "Aston Martin"]]) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), solids = K.cockpitSolids(car, ["chassis", "rim", "headrest"]);
    for (const fine of [true, false]) {
      C.setCockpit(car, fine);
      for (const deg of [-90, -45, 0, 30, 60, 90]) {
        C.setWheels(car, 0, -(deg * D) / C.STEER_RATIO); car.updateMatrixWorld(true);
        for (const [k, d] of Object.entries(K.cockpitClash(car, solids, 1, { nearest: true, edges: true })))
          assert.ok(!/^(glove|gloveLo|wheel|wheelScreen|shiftLights|flagLights)/.test(k), `${season} ${team} (${fine ? "fine" : "light"} gloves) ${deg}°: ${k} ${d}`);
      }
    }
  }
});

test("cockpit v0.43: the arms against the torso as drawn – within ±55° no more than 6 mm (the sleeve's root against the chest), at the lock below v0.42's measured 60 mm", async () => {
  const C = await import("../src/renderer/car3d.js"), K = await import("../src/renderer/cockpitcheck.js");
  for (const [season, team] of [[2025, "Aston Martin"], [2026, "Ferrari"]]) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), solids = K.cockpitSolids(car, ["torso"]);
    assert.strictEqual(solids.length, 4, "chest, pelvis and two thighs: four pieces judged apart");
    let lock = 0;
    for (let deg = -90; deg <= 90; deg += 10) {
      C.setWheels(car, 0, -(deg * D) / C.STEER_RATIO); car.updateMatrixWorld(true);
      const d = Object.entries(K.cockpitClash(car, solids, 1, { nearest: true, dense: 0.006 })).filter(([k]) => / in /.test(k)).reduce((m, [, v]) => Math.max(m, v), 0);
      if (Math.abs(deg) <= 55) assert.ok(d <= 0.006, `${season} ${team} ${deg}°: ${(d * 1000).toFixed(1)} mm into the torso`);
      else lock = Math.max(lock, d);
    }
    assert.ok(lock < 0.055, `${season} ${team}: at the lock ${(lock * 1000).toFixed(1)} mm (v0.42: 60 mm, measured with the same check)`);
  }
});
