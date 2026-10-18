// v0.40 car exteriors (car3d.js): the FIA volumes the wings and nose must keep to (2025 Issue 03, 2026 Section C Issue 17 –
// read from the PDFs; ~/projects/f1kr-work/v040/research/cars40.md), the tyres' overall widths, the 2026 rear lights, the
// lofts' closed ends, the sidepods joined to the body, the 2026 engine cover's height at the rear and the day sky's switch.
const test = require("node:test");
const assert = require("node:assert");

const TEAMS25 = ["Red Bull Racing", "McLaren", "Ferrari", "Mercedes", "Aston Martin", "Alpine", "Williams", "Racing Bulls", "Kick Sauber", "Haas F1 Team"];
const TEAMS26 = ["Red Bull Racing", "McLaren", "Ferrari", "Mercedes", "Aston Martin", "Alpine", "Williams", "Racing Bulls", "Audi", "Haas F1 Team", "Cadillac"];
const load = async () => ({ THREE: await import("../src/renderer/vendor/three.module.js"), C: await import("../src/renderer/car3d.js") });
// the car's meshes in its own frame, closed flaps (setAero 0)
function parts(C, THREE, season, team, date) {
  const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season, date }); C.setAero(car, 0); car.updateMatrixWorld(true);
  const u = car.userData, box = (o) => new THREE.Box3().setFromObject(o);
  const wingPaint = u.paintMats[1], rwMain = car.children.find((o) => o.isMesh && o.material === wingPaint), rwFlaps = u.rwPivot.children[0];
  return { car, u, P: u.profile, box, rwMain, rwFlaps };
}

test("cars v0.40: the rear wing's elements in the FIA profiles' volume (2026 XR +165…+630; 2022–25 XR +140…+680 with the tips)", async () => {
  const { THREE, C } = await load();
  for (const [season, teams, lo, hi] of [[2026, TEAMS26, 0.165, 0.63], [2025, TEAMS25, 0.14, 0.68]]) for (const team of teams) {
    const { P, box, rwMain, rwFlaps } = parts(C, THREE, season, team, `${season}-06-27`);
    const b = box(rwMain).union(box(rwFlaps)), xrFront = P.RZ - b.max.z, xrRear = P.RZ - b.min.z;
    assert.ok(xrFront >= lo - 0.01 && xrRear <= hi + 0.01, `${season} ${team}: rear wing XR ${xrFront.toFixed(3)}…${xrRear.toFixed(3)} (${lo}…${hi})`);
    // (and above the ground where the rules put them: Z 725–880 (2026) / 670–910 (2025) over a reference plane a few cm up –
    // its height on the car not known: 2–5 cm allowed)
    assert.ok(b.min.y > (season >= 2026 ? 0.745 : 0.69) && b.max.y < (season >= 2026 ? 0.88 : 0.91) + 0.05, `${season} ${team}: rear wing height ${b.min.y.toFixed(3)}…${b.max.y.toFixed(3)}`);
  }
});

test("cars v0.40: nothing ahead of the 2026 nose's volume (XF −1300) – the front wing within its own (XF −1250)", async () => {
  const { THREE, C } = await load();
  for (const team of TEAMS26) {
    const { car, P, box, u } = parts(C, THREE, 2026, team, "2026-06-27");
    const all = box(car), fwFlaps = box(u.fwPivot.children[0]);
    assert.ok(all.max.z - P.FZ <= 1.30 + 0.005, `${team}: front-most point ${(all.max.z - P.FZ).toFixed(3)} m ahead of the front axle`);
    assert.ok(fwFlaps.max.z - P.FZ <= 1.25 + 0.005, `${team}: front wing flaps ${(fwFlaps.max.z - P.FZ).toFixed(3)} m ahead`);
    // (the whole car within 1.9 m, tyres included)
    assert.ok(all.max.x - all.min.x <= 1.9 + 0.01, `${team}: width ${(all.max.x - all.min.x).toFixed(3)}`);
  }
});

test("cars v0.40: the tyres at their overall width – FIA 2025 Art. 10.8.1b's measured range; 2026 over its rims' mounting width", async () => {
  const { C } = await load();
  const p25 = C.PROFILES[2022], p26 = C.PROFILES[2026];
  assert.ok(p25.FW >= 0.345 && p25.FW <= 0.375 && p25.RW >= 0.44 && p25.RW <= 0.47, `2022–25 tyres ${p25.FW} / ${p25.RW}`);
  // (2026: C10.7.2 mounting widths 315 / 401.3 mm; narrower than 2025's tyres by about the rims' difference, 20 / 28 mm)
  assert.ok(p26.FW > 0.315 && p26.FW < p25.FW && p26.RW > 0.4013 && p26.RW < p25.RW, `2026 tyres ${p26.FW} / ${p26.RW}`);
  // the wheel's centre follows: the outer tyre faces stay at the car's width
  for (const p of [p25, p26]) { const w = C.wheelParts(p === p25 ? 2025 : 2026, "Ferrari"); assert.ok(Math.abs(w.FX + w.FW / 2 - p.W / 2) < 1e-9 && Math.abs(w.RX + w.RW / 2 - p.W / 2) < 1e-9); }
});

test("cars v0.40: 2026 rear lights – upright strips at the endplates' trailing edges facing back (C14.3.3), the middle one at Z ~300", async () => {
  const { THREE, C } = await load();
  const { u, P } = parts(C, THREE, 2026, "Mercedes", "2026-06-27");
  const g = u.fine[0].geometry, p = g.attributes.position, side = new THREE.Box3(), mid = new THREE.Box3();
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); (Math.abs(v.x) > 0.4 ? side : mid).expandByPoint(v); }
  // the side lights: within Z 700–870 (+ the reference plane's few cm), short along the car (they were 0.36 m strips facing sideways)
  assert.ok(side.min.y >= 0.7 && side.max.y <= 0.92, `side lights ${side.min.y.toFixed(3)}…${side.max.y.toFixed(3)}`);
  assert.ok(side.max.z - side.min.z < 0.03, `side lights ${(side.max.z - side.min.z).toFixed(3)} m long`);
  assert.ok(P.RZ - side.max.z > 0.6, "side lights at the endplates' trailing edges");
  assert.ok(Math.abs((mid.min.y + mid.max.y) / 2 - 0.34) < 0.03 && Math.abs(mid.min.x + mid.max.x) < 1e-6, `middle light at ${((mid.min.y + mid.max.y) / 2).toFixed(3)}`);
});

test("cars v0.40: loft caps face out of the loft (the nose tip showed the inside of its far wall)", async () => {
  const { THREE, C } = await load();
  const g = C.loft([[0, 0.5, 0.2, 0.1], [1, 0.5, 0.2, 0.1]], 12), p = g.attributes.position, ix = g.index.array, A = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3();
  let front = 0, rear = 0;
  for (let t = 0; t < ix.length / 3; t++) {
    A.fromBufferAttribute(p, ix[t * 3]); B.fromBufferAttribute(p, ix[t * 3 + 1]).sub(A); D.fromBufferAttribute(p, ix[t * 3 + 2]).sub(A);
    const n = B.cross(D); if (Math.abs(n.x) + Math.abs(n.y) > 1e-9) continue;   // (the caps only)
    if (A.z > 0.5) { assert.ok(n.z > 0, "front cap faces +z"); front++; } else { assert.ok(n.z < 0, "rear cap faces −z"); rear++; }
  }
  assert.ok(front === 12 && rear === 12);
  // (an open front for an inlet: the rear cap only)
  const o = C.loft([[0, 0.5, 0.2, 0.1], [1, 0.5, 0.2, 0.1]], 12, undefined, "rear");
  assert.strictEqual(o.index.count, g.index.count - 12 * 3);
});

test("cars v0.40: behind the cockpit the sidepods meet the body (no valley to the floor); 2026 engine cover high to the rear axle", async () => {
  const { THREE, C } = await load();
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  const topAt = (mesh, x, z) => { ray.set(new THREE.Vector3(x, 3, z), down); const h = ray.intersectObject(mesh, false)[0]; return h ? h.point.y : 0; };
  for (const [season, team] of [[2025, "Red Bull Racing"], [2025, "Ferrari"], [2026, "Red Bull Racing"], [2026, "Mercedes"]]) {
    const { u, car } = parts(C, THREE, season, team, `${season}-06-27`), painted = car.children.find((o) => o.isMesh && o.material === u.paintMats[0]), ck = u.profile.ck;
    // between the engine cover and the pod's top (x 0.25–0.32), from behind the headrest to the coke-bottle: the painted
    // body, not the floor (0.1 m) under a gap
    for (let z = ck - 0.7; z >= -1.0; z -= 0.1) for (const x of [0.25, 0.32]) {
      const y = topAt(painted, x, z); assert.ok(y > 0.3, `${season} ${team}: body top at x ${x}, z ${z.toFixed(2)} is ${y.toFixed(3)}`);
    }
  }
  // the 2026 engine cover (photos: RB22, W17, SF-26 side-on, Austria 2026-06-26 – M): ~0.8 m or more 0.25 m ahead of the
  // rear axle; it fell to ~0.7 m there before
  for (const team of ["Red Bull Racing", "Mercedes", "Ferrari"]) {
    const { u, car } = parts(C, THREE, 2026, team, "2026-06-27"), painted = car.children.find((o) => o.isMesh && o.material === u.paintMats[0]);
    const y = topAt(painted, 0, u.profile.RZ + 0.25); assert.ok(y > 0.8 && y < 1.0, `${team}: engine cover ${y.toFixed(3)} m at the rear axle`);
  }
});

test("cars v0.40: the day sky's reflection is off whenever a real environment map is given, back on without one", async () => {
  const { THREE, C } = await load();
  const car = C.makeCar({ teamName: "Ferrari", teamColour: "888888", number: 16, season: 2026 }), env = new THREE.Texture();
  C.setCarEnvironment(car, env, 0.6); assert.strictEqual(C.CAR_SKY.value, 0);
  C.setCarEnvironment(car, null, 0.6); assert.strictEqual(C.CAR_SKY.value, 1);
});
