// v0.43: the parts inside the wheels (car3d.js cornerGeo / wheels / makeCar / setWheelOff / wheelParts) – what rolls,
// what steers, what stays on the car at a stop, where the drum sits against the tyre and rim, the mirrored right side,
// the eras' wheel bodywork (research/corners.md)
const test = require("node:test");
const assert = require("node:assert");
const load = async () => ({ THREE: await import("../src/renderer/vendor/three.module.js"), C: await import("../src/renderer/car3d.js") });
const CARS = [[2025, "Ferrari"], [2024, "Williams"], [2026, "Mercedes"], [2026, "Cadillac"]];
// every triangle of a geometry: its three corners, centroid and edge middles; its face normal
function* tris(g) {
  const p = g.attributes.position, a = [0, 1, 2].map(() => [0, 0, 0]);
  for (let i = 0; i < p.count; i += 3) {
    for (let k = 0; k < 3; k++) a[k] = [p.getX(i + k), p.getY(i + k), p.getZ(i + k)];
    const u = a[1].map((v, j) => v - a[0][j]), w = a[2].map((v, j) => v - a[0][j]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], L = Math.hypot(...n) || 1;
    const mid = (x, y) => x.map((v, j) => (v + y[j]) / 2), c = a[0].map((v, j) => (v + a[1][j] + a[2][j]) / 3);
    yield { i, pts: [...a, c, mid(a[0], a[1]), mid(a[1], a[2]), mid(a[0], a[2])], c, n: n.map((v) => v / L), colour: g.attributes.color ? [g.attributes.color.getX(i), g.attributes.color.getY(i), g.attributes.color.getZ(i)] : null };
  }
}
const radial = ([, y, z]) => Math.hypot(y, z);

test("corners v0.43: each wheel's steer group holds the rolling wheel and, at the front, the corner mesh – never in the spin group", async () => {
  const { C } = await load();
  for (const [season, team] of CARS) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), u = car.userData;
    u.wheels.forEach((w, i) => {
      const s = u.spins[i], cn = u.corners[i];
      assert.strictEqual(s.parent, w, "spin group in the steer group");
      if (i < 2) { assert.ok(cn && cn.parent === w, `${season} ${team}: front corner ${i} in the steer group`); assert.ok(!s.children.includes(cn)); }
      else assert.strictEqual(cn, null, "the rears' corner parts are in the body (they never steer)");
      // the spin group: tyre, band, lip, cover – the parts that come off
      assert.strictEqual(s.children.length, 4);
      s.traverse((o) => assert.notStrictEqual(o.name, "corner"));
    });
    // steering turns the fronts' corner with their wheel; the rears stay; rolling turns only the spin groups
    C.setWheels(car, 1.3, 0.3);
    assert.strictEqual(u.corners[0].parent.rotation.y, 0.3); assert.strictEqual(u.wheels[2].rotation.y, 0);
    assert.strictEqual(u.corners[0].rotation.x, 0, "the drum doesn't roll"); assert.strictEqual(u.spins[0].rotation.x, 1.3);
    car.updateMatrixWorld(true);
    const ax = new (await load()).THREE.Vector3(0, 0, 1).transformDirection(u.corners[1].matrixWorld);
    assert.ok(Math.abs(Math.atan2(ax.x, ax.z) - 0.3) < 1e-6, "the right front's intake turns with the steer");
  }
});

test("corners v0.43: the drum, disc, caliper and upright inside the rim's barrel, clear of tyre and rim; the fence and arch outside the tyre", async () => {
  const { C } = await load();
  for (const [season, team] of CARS) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), u = car.userData, P = u.profile, hw = P.FW / 2, r = P.FR;
    const K = C.CORNER, g = u.corners[0].geometry;
    let drumMax = 0, outside = 0;
    for (const t of tris(g)) for (const q of t.pts) {
      const rr = radial(q);
      if (rr >= r + 0.025) continue;                                                                  // over the tread (the arch)
      if (q[0] > -hw + 0.005) { drumMax = Math.max(drumMax, rr); if (rr > K.barrelR - 0.015) outside++; }   // within the tyre's width
      else if (rr > K.barrelR && q[0] > -hw - 0.012) outside++;                                       // beside the inner sidewall: only past it
    }
    assert.strictEqual(outside, 0, `${season} ${team}: corner points in the tyre or rim`);
    assert.ok(drumMax <= K.drumR + 1e-6 && drumMax > K.drumR - 0.01, `drum radius ${drumMax.toFixed(3)}`);
    // the rim's barrel (in the lip) at barrelR, inside the tyre's bead (0.247) and outside the drum
    const lip = u.spins[0].children[2].geometry, lr = []; for (const t of tris(lip)) lr.push(...t.pts.map(radial));
    assert.ok(lr.some((v) => Math.abs(v - K.barrelR) < 1e-4) && K.barrelR < 0.247 && K.barrelR - K.drumR >= 0.015);
    // the 2022–25 arch: points over the tread (within the tyre's width, beyond its radius) – none in 2026 (no arch:
    // C3.14); 2026's Front Drum Rear Deflector instead: inboard of the tyre, behind and under the axle (C3.14.7)
    let above = 0, board = 0; for (const t of tris(g)) for (const q of t.pts) { if (radial(q) > r + 0.02 && q[0] > -hw) above++; if (q[0] < -hw - 0.005 && q[2] < -0.3 && q[1] < -0.09) board++; }
    if (P.era === "2022") assert.ok(above > 50 && board === 0, `${season}: arch over the tyre, no 2026 board`); else assert.ok(above === 0 && board > 4, `${season}: no arch on 2026 cars (${above}), the rear deflector board (${board})`);
  }
});

test("corners v0.43: the right corner is the left's mirror image, faces out on both, the intake inboard and facing forward", async () => {
  const { C } = await load();
  for (const [season, team] of [[2025, "McLaren"], [2026, "Ferrari"]]) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), u = car.userData, hw = u.profile.FW / 2, K = C.CORNER;
    const L = u.corners[0].geometry, R = u.corners[1].geometry;
    assert.strictEqual(L.attributes.position.count, R.attributes.position.count);
    const key = (x, y, z) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`, set = new Set();
    for (let i = 0; i < L.attributes.position.count; i++) set.add(key(-L.attributes.position.getX(i), L.attributes.position.getY(i), L.attributes.position.getZ(i)));
    let miss = 0; for (let i = 0; i < R.attributes.position.count; i++) if (!set.has(key(R.attributes.position.getX(i), R.attributes.position.getY(i), R.attributes.position.getZ(i)))) miss++;
    assert.strictEqual(miss, 0, "mirror image");
    for (const [g, side] of [[L, 1], [R, -1]]) {
      // the drum's outer skin: its triangles' normals point away from the axle (winding kept through the mirror)
      let skin = 0, bad = 0, mouthZ = [], mouthX = [];
      for (const t of tris(g)) {
        const rr = radial(t.c);
        if (Math.abs(rr - K.drumR) < 0.002 && t.c[0] * side > -hw + 0.01 && t.c[0] * side < K.drumIn - 0.002) { skin++; if ((t.n[1] * t.c[1] + t.n[2] * t.c[2]) / rr < 0.9) bad++; }
        if (t.colour && t.colour[0] < 0.05) { mouthZ.push(t.c[2]); mouthX.push(t.c[0] * side); }
      }
      assert.ok(skin > 30 && bad === 0, `${season} side ${side}: ${bad} of ${skin} skin faces turned in`);
      // the intake's dark back wall: ahead of the axle, inboard of the tyre
      assert.ok(mouthZ.length && mouthZ.every((z) => z > 0.1) && mouthX.every((x) => x < -hw), "intake ahead and inboard");
      // the disc and the hub face out too (v0.43 review: both were wound inside out – the wheel-off view saw through them):
      // the disc's rim faces away from the axle, its two flat faces away from its middle plane
      const D = C.CORNER.disc[season >= 2026 ? 2026 : 2022].front; let rimF = 0, rimBad = 0, flat = 0, flatBad = 0, xs = [];
      for (const t of tris(g)) if (t.colour && Math.abs(t.colour[0] - 0.11) < 1e-3) xs.push(t.c[0]);
      const xm = xs.reduce((a, v) => a + v, 0) / xs.length;
      for (const t of tris(g)) if (t.colour && Math.abs(t.colour[0] - 0.11) < 1e-3) {
        const rr = radial(t.c);
        if (Math.abs(rr - D) < 0.003 && Math.abs(t.n[0]) < 0.3) { rimF++; if ((t.n[1] * t.c[1] + t.n[2] * t.c[2]) / rr < 0.9) rimBad++; }
        else if (Math.abs(t.n[0]) > 0.9) { flat++; if (t.n[0] * (t.c[0] - xm) < 0) flatBad++; }
      }
      assert.ok(rimF > 20 && flat > 20 && rimBad === 0 && flatBad === 0, `disc faces: rim ${rimBad}/${rimF} in, flats ${flatBad}/${flat} in`);
      let hub = 0, hubBad = 0; for (const t of tris(g)) if (t.colour && Math.abs(t.colour[0] - 0.32) < 1e-3 && Math.abs(radial(t.c) - K.hubR) < 0.003 && Math.abs(t.n[0]) < 0.3) { hub++; if ((t.n[1] * t.c[1] + t.n[2] * t.c[2]) / radial(t.c) < 0.9) hubBad++; }
      assert.ok(hub > 10 && hubBad === 0, `hub faces ${hubBad}/${hub} in`);
      // the face normals agree with the stored normals (smooth or flat, never opposite)
      const n = g.attributes.normal; let opp = 0; for (const t of tris(g)) if (t.n[0] * n.getX(t.i) + t.n[1] * n.getY(t.i) + t.n[2] * n.getZ(t.i) < -0.2) opp++;
      assert.ok(opp <= 2, `${opp} faces against their normals`);
    }
  }
});

test("corners v0.43: the wishbones' outer ends stay hidden in the steered drum (±0.4 rad – the app's limit); the mismatch measured", async () => {
  const { C } = await load();
  for (const season of [2025, 2026]) {
    const P = C.profileFor(season, "Haas F1 Team"), K = C.CORNER, FX = P.W / 2 - P.FW / 2, hw = P.FW / 2;
    // (suspension(): the ball joints at (FX − ballX, FR + 0.12 / FR − 0.16, FZ); the track rod's end 9 cm ahead at FR + 0.06)
    for (const [dy, dz, x] of [[0.12, 0, FX - K.ballX], [-0.16, 0, FX - K.ballX], [0.06, 0.09, FX - K.ballX]]) for (const th of [-0.4, -0.2, 0, 0.2, 0.4]) {
      // the fixed point in the steered wheel's frame
      const lx = x - FX, c = Math.cos(-th), s = Math.sin(-th), X = c * lx + s * dz, Z = -s * lx + c * dz;
      assert.ok(X > -hw - K.drumOut + 0.012 && X < K.drumIn && Math.hypot(dy, Z) < K.drumR - 0.006, `${season}: end (${dy}, ${dz}) at ${th} rad outside the drum (${X.toFixed(3)}, ${Z.toFixed(3)})`);
    }
    // (how far the real joint would have moved – the fixed ends' error, hidden in the drum: ballX·θ)
    assert.ok(K.ballX * 0.4 < 0.03);
  }
});

test("corners v0.43: a wheel off at a stop takes only the wheel – drum, disc, hub and the 2022–25 fence stay; the carried wheel has none of them", async () => {
  const { C } = await load();
  for (const season of [2025, 2026]) {
    const car = C.makeCar({ teamName: "Ferrari", teamColour: "888888", number: 16, season }), u = car.userData;
    for (let i = 0; i < 4; i++) C.setWheelOff(car, i, true);
    let shown = 0; car.traverseVisible((o) => { if (o.name === "corner") shown++; });
    assert.strictEqual(shown, 2, "both front corners on the car");
    assert.ok(u.spins.every((s) => !s.visible) && u.wheels.every((w) => w.visible), "the wheels off, the steer groups (and their corners) on");
    assert.ok([0, 1, 2, 3].every((i) => !C.wheelIsOn(car, i)));
    // the rear corners: in the body's carbon (visible) – their disc and drum at the rear axle
    const carbon = car.children.find((o) => o.name === "carbon"), P = u.profile; let rearDrum = 0;
    const p = carbon.geometry.attributes.position; for (let i = 0; i < p.count; i++) if (Math.abs(p.getZ(i) - P.RZ) < 0.25 && Math.abs(Math.hypot(p.getY(i) - P.RR, p.getZ(i) - P.RZ) - C.CORNER.drumR) < 0.001) rearDrum++;
    assert.ok(carbon.visible && rearDrum > 50, `rear drums in the body (${rearDrum})`);
    for (let i = 0; i < 4; i++) C.setWheelOff(car, i, false);
    assert.ok(u.spins.every((s) => s.visible));
    // the crew's wheel (wheelParts): the wheel's parts only, no corner, and nothing of it inside the drum's radius but the nut
    const W = C.wheelParts(season, "Ferrari");
    for (const k of ["front", "rear"]) {
      assert.deepStrictEqual(Object.keys(W[k]).sort(), ["band", "cover", "lip", "tyre"]);
      let inner = 0; for (const t of tris(W[k].lip)) for (const q of t.pts) if (radial(q) < C.CORNER.drumR && q[0] < W[k === "front" ? "FW" : "RW"] / 2 - 0.08) inner++;
      assert.strictEqual(inner, 0, `${season} ${k}: the hub and nut no longer mirrored onto the wheel's inner face`);
    }
  }
});

test("corners v0.43: the corner meshes at every level of detail; shared geometry survives a car's dispose; budget kept", async () => {
  const { C } = await load(), { disposeGroup } = await import("../src/renderer/dispose.js");
  const car = C.makeCar({ teamName: "Red Bull Racing", teamColour: "3671C6", number: 1, season: 2025 }), u = car.userData;
  for (const lod of ["near", "mid", "far"]) { C.setDetail(car, lod); let n = 0; car.traverseVisible((o) => { if (o.name === "corner") n++; }); assert.strictEqual(n, 2, lod); }
  const g = u.corners[0].geometry; assert.ok(g.userData.shared && u.corners[1].geometry.userData.shared && u.spins[1].children[2].geometry.userData.shared);
  let gone = 0; for (const m of [g, u.corners[1].geometry]) m.addEventListener("dispose", () => gone++);
  disposeGroup(car); assert.strictEqual(gone, 0);
  // per corner: under 1.5k triangles
  assert.ok(g.attributes.position.count / 3 < 1500, `${g.attributes.position.count / 3} triangles a corner`);
});
