// v0.42 (request §8, §9): the steering wheels as the sources show them – a layout profile only where a source shows
// every part's place (Mercedes 2025, Ferrari 2025 and 2026), the family's rule elsewhere (never one team's wheel copied
// to another); every part on the face plate, clear of the grips, the display and each other; the display, its lights
// and the flag lights mounted in the pod on the face, turning with the wheel; a thin plate, not a slab.
const test = require("node:test");
const assert = require("node:assert");

const TEAMS = ["Red Bull Racing", "McLaren", "Ferrari", "Mercedes", "Kick Sauber", "Audi", "Aston Martin", "Haas F1 Team", "Williams", "Alpine", "Racing Bulls", "Cadillac", "Unknown"];
const specs = async () => {
  const C = await import("../src/renderer/car3d.js"), Wm = await import("../src/renderer/wheel3d.js"), out = [];
  for (const season of [2025, 2026]) for (const team of TEAMS) { const p = C.profileFor(season, team), W = Wm.wheelSpec(p.wheel || null); out.push({ season, team, W, O: Wm.wheelOutline(W), L: Wm.wheelLayout(W) }); }
  return { C, Wm, out };
};

test("wheel v0.42: layout profiles by season and team – the sourced ones only, each its own; the others laid out by the family's rule", async () => {
  const { Wm, out } = await specs(), by = (s, t) => out.find((o) => o.season === s && o.team === t);
  for (const [s, t] of [[2025, "Mercedes"], [2025, "Ferrari"], [2026, "Ferrari"]]) assert.strictEqual(by(s, t).L.from, "profile", `${s} ${t}: its source's layout`);
  // (no 2026 Mercedes close-up, Haas's wheel only assumed Ferrari's: never the sourced team's places)
  for (const [s, t] of [[2026, "Mercedes"], [2025, "Haas F1 Team"], [2026, "Haas F1 Team"], [2025, "McLaren"], [2026, "Aston Martin"], [2026, "Unknown"]]) assert.strictEqual(by(s, t).L.from, "family", `${s} ${t}: no profile of its own`);
  // a profile is one team's in one season: the Ferraris' two differ, and no other car has either
  const prof = out.filter((o) => o.L.from === "profile"), lay = new Map();
  for (const o of prof) { const k = JSON.stringify(o.L.buttons); assert.ok(!lay.has(k) || lay.get(k) === o.W.id, `${o.season} ${o.team}: the same layout as ${lay.get(k)}`); lay.set(k, o.W.id); }
  assert.strictEqual(new Set(prof.map((o) => o.W.id)).size, 3);
  assert.notDeepStrictEqual(by(2025, "Ferrari").L.rotaries, by(2026, "Ferrari").L.rotaries);
  // the profiles' counts are their sources' (the SF-26 three big rotaries, the SF-25 six + one small, the W16 three)
  assert.deepStrictEqual([by(2025, "Mercedes").L.rotaries.length, by(2025, "Ferrari").L.rotaries.length, by(2026, "Ferrari").L.rotaries.length], [3, 7, 3]);
  // the family rule from the counts: every rotary and button the spec counts is placed (thumb drums where they fit – said)
  for (const o of out.filter((q) => q.L.from === "family")) {
    assert.strictEqual(o.L.rotaries.length, o.W.rotaries, `${o.season} ${o.team}: rotaries`);
    assert.strictEqual(o.L.buttons.length, o.W.buttons, `${o.season} ${o.team}: buttons`);
    assert.strictEqual(o.L.buttons.length + o.L.rotaries.length + o.L.thumbs.length + o.L.dropped, o.W.buttons + o.W.rotaries + (o.W.thumb || 0));
  }
  // the grips (the arms' contract) the same on every wheel
  for (const o of out) assert.deepStrictEqual(o.W.grip, Wm.WHEEL_NEUTRAL.grip, `${o.season} ${o.team}: grips`);
});

test("wheel v0.42: every part on the face plate, clear of the grips' rubber, the display pod and each other (drums on a grip's top sit on its front)", async () => {
  const { Wm, out } = await specs();
  for (const { season, team, W, O, L } of out) {
    const pod = Wm.podRect(W), id = `${season} ${team}`;
    const parts = [...L.buttons.map(([x, y, r]) => ({ x, y, r: r + 0.0022, k: "button" })), ...L.rotaries.map(([x, y, R]) => ({ x, y, r: R, k: "rotary" })), ...L.thumbs.map(([x, y]) => ({ x, y, r: 0.0075, k: "drum" }))];
    for (const p of parts) {
      const what = `${id}: ${p.k} at ${p.x.toFixed(3)}, ${p.y.toFixed(3)}`;
      assert.ok(!(p.x + p.r > pod[0] && p.x - p.r < pod[1] && p.y + p.r > pod[2] && p.y - p.r < pod[3]), `${what} over the display's pod`);
      const g = Wm.gripClearance(W, p.x, p.y, p.r);
      if (p.k === "drum" && g < 0) {
        // (on the grip's front: in front of the rubber's surface less half the drum – not inside the grip)
        assert.ok(Wm.drumZ(W, p.x, p.y) < -W.grip.r * 0.5, `${what} inside the grip`);
      } else {
        assert.ok(g > 0, `${what} into a grip by ${(-g * 1000).toFixed(1)} mm`);
        assert.ok(Wm.onPlate(O, p.x, p.y, p.k === "button" ? p.r - 0.0022 : p.k === "drum" ? 0.002 : p.r * 0.8), `${what} off the plate`);   // (a drum may stand at the plate's edge, its roller over the hand hole – the SF-25's BMIG / BBAL)
      }
    }
    // the profiles' tiny buttons sit close to their neighbours (as the graphic has them): the collars may touch, the caps not
    const caps = [...L.buttons.map(([x, y, r]) => [x, y, r]), ...L.rotaries.map(([x, y, R]) => [x, y, R])];
    for (let i = 0; i < caps.length; i++) for (let j = i + 1; j < caps.length; j++) { const [a, b] = [caps[i], caps[j]]; assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) > a[2] + b[2], `${id}: parts ${i} and ${j} overlap`); }
  }
});

test("wheel v0.42: the display, its shift lights and the flag lights mounted in the pod on the face; a thin plate with open grips (not a 35 mm slab)", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), { Wm, out } = await specs(), merge = (l) => { const g = l.length === 1 ? l[0] : null; if (g) return g; const parts = l.map((q) => (q.index ? q.toNonIndexed() : q)), o = new THREE.BufferGeometry(); for (const n of ["position", "normal"]) { const tot = parts.reduce((a, q) => a + q.attributes[n].array.length, 0), arr = new Float32Array(tot); let k = 0; for (const q of parts) { arr.set(q.attributes[n].array, k); k += q.attributes[n].array.length; } o.setAttribute(n, new THREE.BufferAttribute(arr, 3)); } return o; };
  for (const { season, team, W, O } of out) {
    const P = Wm.wheelParts(W, merge, (g) => g), id = `${season} ${team}`, S = W.screen, pod = Wm.podRect(W);
    // the screen: the glass's size, in the pod's opening, in front of the face, facing the driver, its UVs 0..1
    const sp = P.screen.attributes.position, bb = new THREE.Box3().setFromBufferAttribute(sp);
    assert.ok(Math.abs(bb.max.x - bb.min.x - S.w) < 1e-6 && Math.abs(bb.max.y - bb.min.y - S.h) < 1e-6, `${id}: screen size`);
    assert.ok(bb.min.x > pod[0] && bb.max.x < pod[1] && bb.min.y > pod[2] && bb.max.y < pod[3], `${id}: screen inside its pod`);
    assert.ok(bb.max.z < P.face && bb.max.z > P.face - 0.006, `${id}: screen just in front of the face (${bb.max.z.toFixed(4)})`);
    assert.ok(P.screen.attributes.normal.getZ(0) < -0.99, `${id}: screen facing the driver (−z)`);
    const uv = new THREE.Box2().setFromPoints(Array.from({ length: P.screen.attributes.uv.count }, (_, i) => new THREE.Vector2().fromBufferAttribute(P.screen.attributes.uv, i)));
    assert.deepStrictEqual([uv.min.x, uv.min.y, uv.max.x, uv.max.y], [0, 0, 1, 1]);
    // (UV u = 0 on the driver's left (+x) – the picture reads left to right as the driver sees it)
    let left = 0; for (let i = 0; i < sp.count; i++) if (P.screen.attributes.uv.getX(i) === 0) left += sp.getX(i);
    assert.ok(left > 0, `${id}: the picture mirrored`);
    // the shift lights: 15 in a row over the glass and under the pod's top, light 0 on the driver's left, in front of the pod
    assert.strictEqual(P.leds.length, W.leds.count);
    for (const [x, y, z] of P.leds) assert.ok(y > S.y + S.h / 2 && y + P.led.r < pod[3] && Math.abs(x) < S.w / 2 && z < P.face - 0.005, `${id}: a light at ${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(4)}`);
    assert.ok(P.leds[0][0] > P.leds[P.leds.length - 1][0]);
    for (const [x, y] of P.flags) assert.ok(Math.abs(x) > S.w / 2 && Math.abs(x) < pod[1] && y < S.y + S.h / 2 && y > S.y - S.h / 2, `${id}: a flag light at ${x.toFixed(3)}, ${y.toFixed(3)}`);
    // the plate: ≤ 13 mm thick where it is only the plate (out by the grips; the housing behind the middle), its edges rounded
    const bp = P.body.attributes.position; let zmin = 1, zmax = -1;
    for (let i = 0; i < bp.count; i++) if (Math.abs(bp.getX(i)) > W.bodyHW) { zmin = Math.min(zmin, bp.getZ(i)); zmax = Math.max(zmax, bp.getZ(i)); }
    assert.ok(zmax - zmin <= 0.013 + 1e-6, `${id}: the plate ${((zmax - zmin) * 1000).toFixed(1)} mm thick`);
    // the grips hang free below the top bar (open bottoms): no plate between the body and a grip's lower half
    if (W.bottom !== "closed") for (const k of [1, -1]) assert.ok(!Wm.onPlate(O, k * (W.bodyHW + 0.006), -0.03), `${id}: plate between the body and the grip`);
    // the display pod on the plate (its top corners too), the body under the rotaries
    assert.ok(Wm.onPlate(O, 0, pod[3] - 0.001) && Wm.onPlate(O, pod[0] + 0.003, pod[3] - 0.003) && Wm.onPlate(O, pod[1] - 0.003, pod[3] - 0.003) && Wm.onPlate(O, 0, W.bottomY + 0.004), `${id}: the pod on the plate`);
  }
});

test("wheel v0.42: on the car the screen, lights, flag lights, buttons and gloves are the steering group's children (they turn on its axis)", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js");
  for (const [season, team] of [[2025, "Mercedes"], [2026, "Ferrari"], [2026, "Cadillac"]]) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), u = car.userData, st = car.getObjectByName("steering");
    const under = (o) => { for (let p = o; p; p = p.parent) if (p === st) return true; return false; };
    for (const name of ["wheelScreen", "shiftLights", "flagLights"]) assert.ok(under(car.getObjectByName(name)), `${season} ${team}: ${name} under the wheel`);
    // turned: the screen's middle goes round the wheel's axis by the same angle as the wheel
    const mid = () => { car.updateMatrixWorld(true); const s = car.getObjectByName("wheelScreen"); s.geometry.computeBoundingBox(); return st.worldToLocal(s.localToWorld(s.geometry.boundingBox.getCenter(new THREE.Vector3()))); };
    const a = mid(); C.setWheels(car, 0, -0.2); const b = mid();
    assert.ok(a.distanceTo(b) < 1e-9, "fixed in the wheel's frame");
    assert.ok(Math.abs(st.rotation.z) > 0.5, "the wheel turned");
    assert.ok(u.leds && u.leds.mesh.parent === st && u.leds.count === 15);
  }
});

test("wheel v0.42: the gloves rest on the wheel's parts, never through them (≤ 2 mm: the thumb on a drum, as a hand on a real wheel)", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), C = await import("../src/renderer/car3d.js"), Wm = await import("../src/renderer/wheel3d.js");
  for (const [season, team] of [[2025, "Mercedes"], [2025, "Ferrari"], [2026, "Ferrari"], [2025, "Red Bull Racing"], [2026, "Cadillac"]]) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }); C.setCockpit(car, true);
    const p = C.profileFor(season, team), W = Wm.wheelSpec(p.wheel || null), L = Wm.wheelLayout(W), st = car.getObjectByName("steering"), face = -W.t / 2;
    for (const steer of [0, 0.3, -0.3]) {
      C.setWheels(car, 0, steer); car.updateMatrixWorld(true);
      const inv = st.matrixWorld.clone().invert(), v = new THREE.Vector3();
      st.traverse((o) => {
        if (!o.isMesh || o.name !== "glove") return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
          if (v.z > face) continue;   // (behind the face: the plate's own business)
          for (const [x, y, ax] of L.thumbs) { const z = Wm.drumZ(W, x, y), d = Math.max(Math.abs(v.x - x) - (ax === "y" ? 0.008 : 0.0062), Math.abs(v.y - y) - (ax === "y" ? 0.0062 : 0.008), Math.abs(v.z - z) - 0.0052); assert.ok(d > -0.002, `${season} ${team} ${steer}: a glove ${(-d * 1000).toFixed(1)} mm into a drum`); }
          for (const [x, y, r] of L.buttons) { const d = Math.max(Math.hypot(v.x - x, v.y - y) - r, face - 0.007 - v.z); assert.ok(d > -0.002, `${season} ${team} ${steer}: a glove ${(-d * 1000).toFixed(1)} mm into a button`); }
        }
      });
    }
  }
});
