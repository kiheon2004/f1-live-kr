// v0.42: the cockpit is open. v0.41's chassis loft was closed over the cockpit – its painted top ~0.6 m up under the
// steering wheel's middle (0.61 m) – and the wheel's lower half and the hands sank into the paint as it turned. These
// tests look at the generated meshes themselves (cockpitcheck.js: a point is inside a closed skin when a ray from it
// crosses it an odd number of times), not at the models that built them.
const test = require("node:test");
const assert = require("node:assert");

const D = Math.PI / 180;
const CARS = [[2025, "Aston Martin"], [2026, "Aston Martin"], [2025, "Mercedes"], [2026, "Ferrari"], [2027, "Unknown"]];

test("cockpit v0.42: under the steering wheel the rays go down into the tub – no painted surface over the opening", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js");
  for (const [season, team] of CARS) {
    const car = C.makeCar({ teamName: team, teamColour: "229971", number: 18, season }); car.updateMatrixWorld(true);
    const u = car.userData, ray = new THREE.Raycaster(), wz = u.wheel.position.z, painted = car.getObjectByName("painted"), tub = car.getObjectByName("tub");
    painted.material.side = THREE.DoubleSide;
    for (const [x, dz] of [[0, 0], [0.1, 0], [-0.1, 0], [0.2, -0.1], [0, -0.3], [0, 0.05]]) {
      // (from just under the wheel's lowest point straight down: the first thing hit is the tub, never the paint)
      ray.set(new THREE.Vector3(x, 0.5, wz + dz).applyMatrix4(car.matrixWorld), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects([painted, tub], false)[0];
      assert.ok(hit && hit.object === tub, `${season} ${team}: at x ${x}, z ${(wz + dz).toFixed(2)} the ray meets ${hit?.object.name} at ${hit && hit.point.y.toFixed(3)}`);
      assert.ok(hit.point.y < 0.48, `${season} ${team}: the tub's bottom at ${hit.point.y.toFixed(3)} under the wheel`);
    }
  }
});

test("cockpit v0.42: through the whole turn of the wheel nothing the driver handles is in the car's body – wheel, gloves, gauntlets and sleeves against the chassis' skin, its tub, the rim and the head pads", async () => {
  const C = await import("../src/renderer/car3d.js"), K = await import("../src/renderer/cockpitcheck.js");
  for (const [season, team] of CARS.slice(0, 4)) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), solids = K.cockpitSolids(car, ["chassis", "rim", "headrest"]);
    assert.ok(solids.find((s) => s.name === "chassis").tris.length > 1000, "the chassis' skin found");
    for (let deg = -90; deg <= 90; deg += 15) {
      C.setWheels(car, 0, -(deg * D) / C.STEER_RATIO); car.updateMatrixWorld(true);
      for (const [k, d] of Object.entries(K.cockpitClash(car, solids, 3))) {
        // (the wheel, its parts and the gloves: never, at any angle; a sleeve or gauntlet: the padding's give, ≤ 1 cm, to
        // ±55° – past it, at the lock, the raised arm brushes the head's side pad and the rim (≤ 5 cm, measured; report))
        const limit = /^(sleeve|gauntlet)/.test(k) ? (Math.abs(deg) <= 55 ? 0.01 : 0.05) : 0.001;
        assert.ok(d <= limit, `${season} ${team}, wheel ${deg}°: ${k} ${(d * 1000).toFixed(1)} mm`);
      }
    }
  }
});

test("cockpit v0.42: the arms stay out of the driver's own torso and thighs to ±55° of the wheel (beyond, the lower arm presses into it – the known limit, measured)", async () => {
  const C = await import("../src/renderer/car3d.js"), K = await import("../src/renderer/cockpitcheck.js");
  for (const [season, team] of CARS.slice(0, 2)) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), solids = K.cockpitSolids(car, ["torso"]);
    let worstLock = 0;
    for (let deg = -90; deg <= 90; deg += 5) {
      C.setWheels(car, 0, -(deg * D) / C.STEER_RATIO); car.updateMatrixWorld(true);
      const d = Object.values(K.cockpitClash(car, solids, 3)).reduce((m, v) => Math.max(m, v), 0);
      if (Math.abs(deg) <= 55) assert.ok(d <= 0.02, `${season} ${team}, wheel ${deg}°: an arm ${(d * 1000).toFixed(0)} mm into the torso`);
      else worstLock = Math.max(worstLock, d);
    }
    assert.ok(worstLock < 0.115, `${season} ${team}: at the lock ${(worstLock * 1000).toFixed(0)} mm`);
  }
});

test("cockpit v0.42: the rim follows the opening's edge; the tub, the torso and the rim are shared template parts (never freed with a car), the torso close up only", async () => {
  const C = await import("../src/renderer/car3d.js");
  for (const [season, team] of CARS) {
    const p = C.profileFor(season, team), O = C.cockpitOpening(p), car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), u = car.userData;
    // the opening: ahead of the wheel's face by ≥ 50 mm (FIA 2025 Art 12.5.3 – the wheel ≥ 50 mm behind the opening's
    // front), its sides ~0.5 m apart (the 2021 template's 520 mm), the wheel's grips and the hands within it
    assert.ok(O.zF - u.wheel.position.z > 0.05, `${season} ${team}: the opening's front ${(O.zF - u.wheel.position.z).toFixed(3)} m ahead of the wheel`);
    assert.ok(O.w(u.wheel.position.z - 0.3) > 0.24 && O.w(u.wheel.position.z - 0.3) < 0.28, "the opening's half width by the driver");
    assert.ok(O.w(u.wheel.position.z) > 0.2, "wide enough for the grips and hands at the wheel");
    for (const name of ["tub", "torso", "rim"]) { const m = car.getObjectByName(name); assert.ok(m && m.geometry.userData.shared, `${name} shared`); }
    assert.strictEqual(car.getObjectByName("torso").parent, u.near, "the torso in the close-up group");
    // the rim's tube sits on the edge: every point of the opening's edge within 4 cm of the rim's surface
    const rim = car.getObjectByName("rim").geometry.attributes.position;
    for (const z of [O.zR + 0.1, (O.zR + O.zF) / 2, O.zF - 0.08]) {
      let best = Infinity; for (let i = 0; i < rim.count; i++) best = Math.min(best, Math.hypot(rim.getX(i) - O.w(z), rim.getZ(i) - z));
      assert.ok(best < 0.04, `${season} ${team}: the rim ${(best * 100).toFixed(1)} cm from the edge at z ${z.toFixed(2)}`);
    }
  }
});

test("cockpit v0.42: the eyes see the whole steering wheel – its lowest point not hidden by the car's body, nearer than nothing at the near plane", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js");
  for (const [season, team] of CARS) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }); car.updateMatrixWorld(true);
    const u = car.userData, eye = u.mounts.eye.clone().applyMatrix4(car.matrixWorld), ray = new THREE.Raycaster();
    const body = ["painted", "carbon", "rim", "headrest", "tub"].map((n) => car.getObjectByName(n)).filter(Boolean);
    body.forEach((m) => { m.material.side = THREE.DoubleSide; });
    // (the wheel's face corners and lower edge: a ray from the eye meets nothing of the body before it)
    const W = u.wheelSpec;
    for (const [x, y] of [[0, -W.h * 0.3], [W.w * 0.35, 0], [-W.w * 0.35, 0], [0.1, -W.h * 0.25], [-0.1, -W.h * 0.25]]) {
      const target = new THREE.Vector3(x, y, -W.t / 2).applyMatrix4(u.wheel.matrixWorld), dir = target.clone().sub(eye), dist = dir.length();
      ray.set(eye, dir.normalize()); ray.far = dist - 0.005;
      const hit = ray.intersectObjects(body, false)[0];
      assert.ok(!hit, `${season} ${team}: the wheel's point (${x}, ${y.toFixed(3)}) hidden by ${hit?.object.name} at ${hit && hit.distance.toFixed(3)} m`);
      assert.ok(dist > 0.1, "the wheel well beyond the eye camera's near plane (3 cm)");
    }
  }
});
