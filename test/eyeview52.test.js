// v0.52 (request §11): the driver's-eye view measured (eyeview.js – a small rasteriser over the car's own triangles) and
// the head's turn into the bend (eyecam.js). The pure parts checked on their own; then two cars (2025, 2026) through
// the turn of the wheel: nothing cut by the near plane, the wheel's display never behind a hand, the centre of the
// picture clear on a straight, and the head's turn taking the rising arm out of the picture's centre in a corner.
const test = require("node:test");
const assert = require("node:assert");
const D = Math.PI / 180;

test("eyeview: near-plane clipping and filling – a triangle behind the eye is cut, a half-screen triangle fills half", async () => {
  const E = await import("../src/renderer/eyeview.js");
  const a = [0, 0, 0, 1], b = [1, 0, 0, 1], c = [0, 1, 0, 1];
  assert.deepStrictEqual(E.clipNear(a, b, c), { poly: [a, b, c], cut: false });
  const r = E.clipNear([0, 0, -2, 1], [1, 0, 0, 1], [0, 1, 0, 1]);   // (the first corner behind the near plane: z < −w)
  assert.strictEqual(r.cut, true); assert.strictEqual(r.poly.length, 4);
  const buf = { W: 40, H: 20, depth: new Float32Array(800).fill(Infinity), id: new Uint8Array(800) };
  E.fillTri(buf, [0, 0, 0.5], [40, 0, 0.5], [0, 20, 0.5], 3);
  const n = buf.id.reduce((s, v) => s + (v === 3), 0);
  assert.ok(Math.abs(n / 800 - 0.5) < 0.05, `half the buffer: ${n}`);
  // (nearer wins)
  E.fillTri(buf, [0, 0, 0.2], [40, 0, 0.2], [0, 20, 0.2], 5); E.fillTri(buf, [0, 0, 0.9], [40, 0, 0.9], [0, 20, 0.9], 6);
  assert.ok(!buf.id.includes(6) && buf.id.includes(5));
  // a triangle between the eye and the near plane, in front of the eye and inside the view's cone, is a visible hole
  assert.ok(E.clippedInView([[0, 0, 0, 0.01], [0.005, 0, 0, 0.01], [0, 0.005, 0, 0.01]], 0.03));
  assert.ok(!E.clippedInView([[0, 0, 0, -0.5], [0.005, 0, 0, -0.5], [0, 0.005, 0, -0.5]], 0.03), "behind the eye: no hole");
});

test("eyecam: the lens as before (80° wide, as tall as the window), the head's turn bounded, following the bend's side", async () => {
  const K = await import("../src/renderer/eyecam.js");
  const old = (aspect) => Math.max(35, Math.min(100, (2 * Math.atan(Math.tan((80 * Math.PI) / 360) / aspect) * 180) / Math.PI));
  for (const a of [16 / 9, 1.6, 4 / 3, 1, 2.4]) assert.ok(Math.abs(K.cockpitFov(true, a) - old(a)) < 1e-9);
  assert.strictEqual(K.headYawFor([0, 0, 0], 80), 0);
  assert.strictEqual(K.headYawFor([], 30), 0);
  assert.strictEqual(K.headYawFor([0.01], 0), 0);
  // (+ curvature = turning left → the head to the left, +)
  assert.ok(K.headYawFor([0.02, 0.02], 30) > 0 && K.headYawFor([-0.02], 30) < 0);
  assert.ok(Math.abs(K.headYawFor([0.02], 30) + K.headYawFor([-0.02], 30)) < 1e-12, "symmetric");
  // small rates: gain × rate; any rate: never past the limit; more turning, more head
  assert.ok(Math.abs(K.headYawFor([0.001], 20) - K.HEAD.gain * 0.02) < 1e-4);
  let prev = 0;
  for (let k = 0.002; k < 0.2; k *= 1.5) { const y = K.headYawFor([k], 15); assert.ok(y > prev && y < K.HEAD.max); prev = y; }
  // the eyes round the neck: straight ahead where they were, sideways towards the turn and a hair back
  assert.deepStrictEqual(K.eyeTurned([0, 0.73, 0.3], 0), [0, 0.73, 0.3]);
  const e = K.eyeTurned([0, 0.73, 0.3], 0.3);
  assert.ok(e[0] > 0.02 && e[0] < 0.03 && e[2] < 0.3 && e[2] > 0.29);
});

test("eyeview: from the driver's eyes, 2025 and 2026, through the turn of the wheel – no near-plane hole, the display never behind a hand, the head's turn clearing the picture's centre", async () => {
  const C = await import("../src/renderer/car3d.js"), E = await import("../src/renderer/eyeview.js"), K = await import("../src/renderer/eyecam.js");
  for (const [season, team] of [[2025, "McLaren"], [2026, "Ferrari"]]) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }); C.setCockpit(car, true); car.userData.helmet.visible = false;
    for (const [deg, kmh] of [[0, 290], [30, 220], [60, 150], [90, 100], [-90, 100], [140, 50]]) {
      C.setWheels(car, 0, -(deg * D) / C.STEER_RATIO, 100000, 5, () => deg * D);
      const v = kmh / 3.6, kappa = -((deg * D) / C.STEER_RATIO) / (3.4 + (0.01 * v * v) / 9.81);   // (pathSteer's δ for small angles, inverted)
      const head = K.headYawFor([kappa], v);
      const m0 = E.measureEyeView(car, K.eyeCamera(car, 16 / 9), 160), m1 = E.measureEyeView(car, K.eyeCamera(car, 16 / 9, 0.03, { head }), 160);
      const tag = `${season} ${team} wheel ${deg}°`;
      for (const m of [m0, m1]) {
        assert.deepStrictEqual(m.cut, {}, `${tag}: the near plane cuts ${JSON.stringify(m.cut)}`);
        assert.ok(m.display.px > 200 && m.display.hidden < 0.05, `${tag}: the display ${JSON.stringify(m.display)}`);
        assert.ok(m.all.outside > 0.25, `${tag}: the world outside ${m.all.outside}`);
      }
      const arms = (m) => m.centre.arm + m.centre.glove;
      if (deg === 0) { assert.ok(arms(m0) < 0.01 && m0.forward.arm === 0, `${tag}: arms in the centre ${arms(m0)}`); continue; }
      // (the head into the bend: the rising arm out of the centre – at a medium corner nearly all of it)
      assert.ok(Math.sign(head) === -Math.sign(deg), `${tag}: the head turns ${(head / D).toFixed(1)}° – into the bend`);
      assert.ok(arms(m1) <= arms(m0) + 1e-9, `${tag}: arms in the centre ${arms(m0).toFixed(3)} → ${arms(m1).toFixed(3)}`);
      if (Math.abs(deg) === 60) assert.ok(arms(m1) < 0.03 && arms(m0) > 0.1, `${tag}: arms in the centre ${arms(m0).toFixed(3)} → ${arms(m1).toFixed(3)}`);
    }
  }
});

test("steering: the path's curvature held to the car's grip (car3d gripKappa) – a fast chicane can't ask for more than LAT_G_MAX; a slow corner is untouched", async () => {
  const C = await import("../src/renderer/car3d.js");
  assert.strictEqual(C.gripKappa(0.05, 13), 0.05, "a hairpin at 47 km/h");
  assert.strictEqual(C.gripKappa(-0.02, 25), -0.02);
  const v = 62, k = C.gripKappa(0.0215, v);   // (Monaco's swimming pool as the lap line drew it: 8.4 g at 223 km/h)
  assert.ok(Math.abs((v * v * k) / 9.81 - C.LAT_G_MAX) < 1e-9);
  assert.strictEqual(C.gripKappa(-0.0215, v), -k);
  assert.strictEqual(C.gripKappa(0.3, 0), 0.3, "standing: no limit (no division by zero)");
  for (const sp of [5, 20, 40, 60, 90]) for (const kk of [-0.2, -0.01, 0, 0.003, 0.1]) { const g = C.gripKappa(kk, sp); assert.ok(Math.abs(g) <= Math.abs(kk) && Math.sign(g) === Math.sign(kk) && (sp * sp * Math.abs(g)) / 9.81 <= C.LAT_G_MAX + 1e-9); }
});
