// v0.44 side mirrors: the virtual camera's geometry (a flat mirror: the eye's image across the glass, looking back,
// left on the left), the glass in the car model, the pass' recursion guard, the renderer's state restored, the render
// target reused and freed, the mode by setting. (mirrors.js, car3d.js mirrorGlass)
import test from "node:test";
import assert from "node:assert/strict";

const THREE = await import("../src/renderer/vendor/three.module.js");
const M = await import("../src/renderer/mirrors.js");
const C = await import("../src/renderer/car3d.js");
const V = (...a) => new THREE.Vector3(...a);

// a left mirror (car +x): glass centre, its normal back and in, h along it towards +x
function leftGlass() {
  const s = Math.sin(M.MIRROR.yaw), c = Math.cos(M.MIRROR.yaw);
  return { c: V(0.56, 0.74, 0.78), n: V(-s, 0, -c), h: V(c, 0, -s), up: V(0, 1, 0), hw: 0.1, hh: 0.025 };
}
// where on the glass (car frame) the virtual camera sees a world point: its NDC → the glass' local u (0 at the −x
// edge, 1 at +x – the UVs car3d gives) and the point on the glass
function glassPointOf(cam, g, P) {
  const p = P.clone().project(cam), u = (p.x + 1) / 2, v = (p.y + 1) / 2;
  return { u, v, at: g.c.clone().addScaledVector(g.h, (u * 2 - 1) * g.hw).addScaledVector(g.up, (v * 2 - 1) * g.hh) };
}

test("mirror camera: the eye mirrored across the glass' plane, looking backwards, the near plane on the glass", () => {
  const g = leftGlass(), eye = V(0, 0.73, 0.3), cam = new THREE.PerspectiveCamera();
  assert.ok(M.mirrorCamera(cam, eye, g.c, g.n, g.h, g.up, g.hw, g.hh, 0));
  // the image: as far beyond the plane as the eye is before it, on the same perpendicular
  const dEye = eye.clone().sub(g.c).dot(g.n), dImg = cam.position.clone().sub(g.c).dot(g.n);
  assert.ok(Math.abs(dEye + dImg) < 1e-9 && dEye > 0, `eye ${dEye}, image ${dImg}`);
  assert.ok(cam.position.clone().sub(eye).cross(g.n).length() < 1e-9, "image on the eye's perpendicular");
  // looking backwards (−z of the car) and the near plane at the glass
  const dir = cam.getWorldDirection(V());
  assert.ok(dir.z < -0.8, `looks ${dir.toArray()}`);
  assert.ok(Math.abs(cam.near - dEye) < 1e-9);
  // the glass' four corners on the frustum's edges (a window exactly the glass, flat mirror)
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const P = g.c.clone().addScaledVector(g.h, a * g.hw).addScaledVector(g.up, b * g.hh).project(cam);
    assert.ok(Math.abs(Math.abs(P.x) - 1) < 1e-6 && Math.abs(Math.abs(P.y) - 1) < 1e-6 && Math.sign(P.x) === a && Math.sign(P.y) === b, `corner ${a},${b} → ${P.x.toFixed(4)},${P.y.toFixed(4)}`);
  }
  // an eye behind the glass sees no reflection
  assert.equal(M.mirrorCamera(cam, V(0.6, 0.74, 1.2), g.c, g.n, g.h, g.up, g.hw, g.hh, 0), false);
});

test("mirror camera: a point behind is where the reflected ray from the eye goes (a true mirror image, left on the left)", () => {
  const g = leftGlass(), eye = V(0, 0.73, 0.3), cam = new THREE.PerspectiveCamera();
  M.mirrorCamera(cam, eye, g.c, g.n, g.h, g.up, g.hw, g.hh, 0);
  // targets behind and out to the left, where this mirror looks (the reflected line of sight)
  const mid = g.c.clone().sub(eye).reflect(g.n).normalize();   // (reflect: about the plane with this normal)
  for (const side of [-0.6, 0, 0.6]) {
    const T = g.c.clone().addScaledVector(mid, 15).addScaledVector(g.h, side);
    const { u, at } = glassPointOf(cam, g, T);
    assert.ok(u > 0 && u < 1, `on the glass: u ${u}`);
    // the ray eye → glass point, reflected about n, passes through the target
    const ray = at.clone().sub(eye).normalize().reflect(g.n), to = T.clone().sub(at).normalize();
    assert.ok(ray.angleTo(to) < 1e-6, `reflection off by ${ray.angleTo(to)} rad`);
  }
  // a car further to the car's left (+x) behind shows further to the glass' +x edge – the driver's left as he faces +z
  const L = g.c.clone().addScaledVector(mid, 15).addScaledVector(g.h, 0.8), R = g.c.clone().addScaledVector(mid, 15).addScaledVector(g.h, -0.8);
  const uL = glassPointOf(cam, g, L).u, uR = glassPointOf(cam, g, R).u;
  assert.ok(uL > uR, `left-behind ${uL.toFixed(3)} vs right-behind ${uR.toFixed(3)}`);
  // and nothing in front of the car: a point ahead of the glass (the nose) is behind the near plane
  const ahead = V(0.3, 0.5, 2.5).applyMatrix4(cam.matrixWorldInverse);
  assert.ok(-ahead.z < cam.near, "the nose is clipped");
});

test("mirror camera: the convex approximation widens the view sideways by the spread at each edge, not up and down", () => {
  const g = leftGlass(), eye = V(0, 0.73, 0.3), a = new THREE.PerspectiveCamera(), b = new THREE.PerspectiveCamera();
  M.mirrorCamera(a, eye, g.c, g.n, g.h, g.up, g.hw, g.hh, 0); M.mirrorCamera(b, eye, g.c, g.n, g.h, g.up, g.hw, g.hh, M.MIRROR.spread);
  const hAngle = (cam) => { const e = cam.projectionMatrixInverse, l = V(-1, 0, -1).applyMatrix4(e), r = V(1, 0, -1).applyMatrix4(e); return Math.atan2(r.x, -r.z) - Math.atan2(l.x, -l.z); };   // (in the camera's horizontal plane)
  const dh = hAngle(b) - hAngle(a);
  assert.ok(Math.abs(dh - 2 * M.MIRROR.spread) < 1e-6, `wider by ${(dh * 180 / Math.PI).toFixed(3)}°`);
  const vAngle = (cam) => { const e = cam.projectionMatrixInverse, b = V(0, -1, -1).applyMatrix4(e), t = V(0, 1, -1).applyMatrix4(e); return Math.atan2(t.y, -t.z) - Math.atan2(b.y, -b.z); };
  assert.ok(Math.abs(vAngle(a) - vAngle(b)) < 1e-9);
});

test("car model: the glass is its own mesh (not in the carbon), 200 × 50 mm a side, facing back and in, in the rules' volume", () => {
  for (const [season, team] of [[2025, "Ferrari"], [2026, "Mercedes"], [2026, "Cadillac"]]) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), u = car.userData, m = u.mirrors;
    assert.ok(m?.isMesh && m.name === "mirrors" && m.geometry.userData.shared && m.material.userData.shared, "a shared glass mesh");
    assert.equal(m.geometry.attributes.position.count, 12, "two quads");
    assert.equal(u.mirrors.userData.spec.length, 2);
    const carbon = car.getObjectByName("carbon").geometry.attributes.position.array;
    for (const s of m.userData.spec) {
      const n = V(...s.n), h = V(...s.h);
      assert.ok(Math.abs(n.dot(h)) < 1e-9 && Math.abs(n.length() - 1) < 1e-9);
      // the normal back (−z) and turned towards the car's middle by the rules' angle less half the spread (22°)
      const inward = Math.atan2(-Math.sign(s.k) * n.x, -n.z) * 180 / Math.PI;
      assert.ok(inward > 18 && inward < 28 && n.z < 0, `${season} ${team} k${s.k}: ${inward.toFixed(1)}° in`);
      assert.ok(Math.abs(s.hw * 2 - 0.2) < 1e-9 && Math.abs(s.hh * 2 - 0.05) < 1e-9, "200 × 50 mm");
      // Y 470–680, Z 640–720 (+ ~0.04 m: the reference plane over the ground)
      assert.ok(Math.abs(s.c[0]) - s.hw > 0.44 && Math.abs(s.c[0]) + s.hw < 0.69 && s.c[1] > 0.67 && s.c[1] < 0.77, `${season} ${team} glass at ${s.c}`);
      // nothing of the old glass plane left in the carbon: no carbon vertex on the glass' centre
      let near = false; for (let i = 0; i < carbon.length; i += 3) if (Math.hypot(carbon[i] - s.c[0], carbon[i + 1] - s.c[1], carbon[i + 2] - s.c[2]) < 0.004) near = true;
      assert.ok(!near, "the glass isn't in the carbon too");
    }
    // the UVs: the left mirror in u 0–0.5, the right in 0.5–1; u grows towards +x within each
    const P = m.geometry.attributes.position, UV = m.geometry.attributes.uv;
    for (let i = 0; i < P.count; i++) { const left = i < 6, uu = UV.getX(i); assert.ok(left ? uu <= 0.5 : uu >= 0.5); }
    const uAt = (from) => { let lo = null, hi = null; for (let i = from; i < from + 6; i++) { if (!lo || P.getX(i) < P.getX(lo)) lo = i; if (!hi || P.getX(i) > P.getX(hi)) hi = i; } return [UV.getX(lo), UV.getX(hi)]; };
    for (const f of [0, 6]) { const [a, b] = uAt(f); assert.ok(b > a, "u towards +x"); }
    // facing along its normal (the triangles' winding): each triangle's normal is the spec's
    for (let i = 0; i < 12; i += 3) {
      const a = V().fromBufferAttribute(P, i), b = V().fromBufferAttribute(P, i + 1), c = V().fromBufferAttribute(P, i + 2);
      const tn = b.clone().sub(a).cross(c.clone().sub(a)).normalize(), s = m.userData.spec[i < 6 ? 0 : 1];
      assert.ok(tn.dot(V(...s.n)) > 0.999, "wound to face the driver");
    }
  }
});

// a renderer stand-in: what the pass touches
function mockRenderer() {
  const r = { calls: [], target: null, autoClear: false, xr: { enabled: true }, shadowMap: { needsUpdate: true }, outputColorSpace: THREE.SRGBColorSpace, info: { render: { calls: 40, triangles: 9000 } } };
  r.getRenderTarget = () => r.target;
  r.getDrawingBufferSize = (v) => v.set(1920, 1080);
  r.setRenderTarget = (t) => { r.target = t; };
  r.render = (scene, cam) => { r.calls.push({ cam, target: r.target, autoClear: r.autoClear, xr: r.xr.enabled, shadow: r.shadowMap.needsUpdate, viewport: r.target?.viewport.clone(), hidden: r.watch.map((o) => o.visible), auto: scene.matrixWorldAutoUpdate }); };
  r.watch = [];
  return r;
}
function rig(season = 2026) {
  const scene = new THREE.Scene(), car = C.makeCar({ teamName: "Ferrari", teamColour: "888888", number: 16, season });
  scene.add(car); car.updateMatrixWorld(true);
  const label = new THREE.Sprite(); scene.add(label);
  // the T-cam: behind the helmet, looking forward over the car (both mirrors in the frame)
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 2000);
  camera.position.set(0, 1.12, -0.16); camera.lookAt(0, 0.7, 3); camera.updateMatrixWorld(true);
  return { scene, car, label, camera };
}

test("mirror pass: renders both halves, hides the glass and labels while drawing, restores the renderer", () => {
  const { scene, car, label, camera } = rig(), r = mockRenderer(), P = M.createMirrorPass(), glass = car.userData.mirrors;
  const prevRT = { isRenderTarget: true, viewport: new THREE.Vector4() }; r.target = prevRT;
  r.watch = [glass, label];
  const aux = (hide) => { label.visible = !hide; };
  const n = P.update(r, scene, camera, car, "full", "onboard:16", aux);
  assert.equal(n, 2, "both mirrors in the T-cam's frame");
  assert.equal(r.calls.length, 2);
  for (const c of r.calls) {
    assert.deepEqual(c.hidden, [false, false], "glass and labels hidden in the pass (no recursion)");
    assert.equal(c.target, P.state.rt); assert.equal(c.xr, false); assert.equal(c.autoClear, true); assert.equal(c.shadow, false, "no shadow redraw in the pass");
  }
  assert.deepEqual(r.calls.map((c) => c.viewport.x).sort((a, b) => a - b), [0, 384], "the two halves");
  assert.equal(r.calls[0].auto, true); assert.equal(r.calls[1].auto, false, "the world's matrices updated once");
  assert.equal(scene.matrixWorldAutoUpdate, true);
  // restored
  assert.equal(r.target, prevRT); assert.equal(r.autoClear, false); assert.equal(r.xr.enabled, true); assert.equal(r.shadowMap.needsUpdate, true);
  assert.equal(glass.visible, true); assert.equal(label.visible, true);
  assert.equal(glass.material, P.material, "the rear view on the glass once drawn");
  assert.equal(P.material.uniforms.map.value, P.state.rt.texture);
  // the target: the screen's colour space, plain RGBA8, marked so three takes the renderer's tone mapping
  assert.equal(P.state.rt.texture.colorSpace, THREE.SRGBColorSpace); assert.equal(P.state.rt.texture.internalFormat, "RGBA8"); assert.equal(P.state.rt.isXRRenderTarget, true);
  assert.deepEqual([P.state.rt.width, P.state.rt.height, P.state.rt.samples], [768, 96, 4]);
});

test("mirror pass: the target made once and reused; a mode's size change remakes it; dispose frees it and gives the glass back", () => {
  const { scene, car, camera } = rig(), r = mockRenderer(), P = M.createMirrorPass();
  P.update(r, scene, camera, car, "full", "onboard:16");
  const rt = P.state.rt; let freed = 0; rt.addEventListener("dispose", () => freed++);
  for (let i = 0; i < 10; i++) P.update(r, scene, camera, car, "full", "onboard:16");
  assert.equal(P.state.rt, rt, "the same target every frame");
  assert.equal(r.calls.length, 22);
  // low: its own smaller target (the old one freed), drawn every 3rd frame
  r.calls.length = 0;
  for (let i = 0; i < 9; i++) P.update(r, scene, camera, car, "low", "onboard:16");
  assert.equal(freed, 1); assert.notEqual(P.state.rt, rt); assert.deepEqual([P.state.rt.width, P.state.rt.height, P.state.rt.samples], [384, 48, 0]);
  assert.equal(r.calls.length, 6, "3 of 9 frames, both halves");
  // simple: no pass, the car's own glass
  r.calls.length = 0;
  P.update(r, scene, camera, car, "simple", "onboard:16");
  assert.equal(r.calls.length, 0); assert.equal(car.userData.mirrors.material, car.userData.mirrors.userData.glass);
  // dispose: the target freed, the glass its own
  P.update(r, scene, camera, car, "full", "onboard:16");
  const rt2 = P.state.rt; let freed2 = 0; rt2.addEventListener("dispose", () => freed2++);
  P.dispose();
  assert.equal(freed2, 1); assert.equal(P.state.rt, null); assert.equal(car.userData.mirrors.material, car.userData.mirrors.userData.glass);
  assert.equal(P.material.uniforms.map.value, null);
});

test("mirror pass: no stale picture – a new car or camera draws afresh before its glass shows the rear view; out of view, nothing drawn", () => {
  const { scene, car, camera } = rig(), r = mockRenderer(), P = M.createMirrorPass();
  P.update(r, scene, camera, car, "low", "onboard:16");
  P.update(r, scene, camera, car, "low", "onboard:16");
  r.calls.length = 0;
  // a camera change on a frame the low mode would skip: drawn at once
  P.update(r, scene, camera, car, "low", "eye:16");
  assert.equal(r.calls.length, 2, "redrawn on the view's change");
  // another car: the old one's glass given back, the new one drawn before it shows
  const other = C.makeCar({ teamName: "McLaren", teamColour: "888888", number: 4, season: 2026 }); scene.add(other); other.updateMatrixWorld(true);
  const turned = camera.clone(); turned.lookAt(0, 0.7, -5); turned.updateMatrixWorld(true);   // (looking back: neither mirror's glass in frame)
  r.calls.length = 0;
  P.update(r, scene, turned, other, "full", "onboard:4");
  assert.equal(car.userData.mirrors.material, car.userData.mirrors.userData.glass, "the old car's glass back");
  assert.equal(r.calls.length, 0, "nothing drawn out of view");
  assert.equal(other.userData.mirrors.material, other.userData.mirrors.userData.glass, "no undrawn picture on the glass");
  // no car (the helicopter): the glass back, nothing drawn
  P.update(r, scene, camera, null, "full", "");
  assert.equal(P.state.car, null);
});

test("mirror mode by setting: explicit choices kept, auto by the quality setting", () => {
  assert.equal(M.mirrorMode("full", "smooth"), "full");
  assert.equal(M.mirrorMode("low", "sharp"), "low");
  assert.equal(M.mirrorMode("simple", "balanced"), "simple");
  assert.equal(M.mirrorMode("auto", "sharp"), "full");
  assert.equal(M.mirrorMode(undefined, "balanced"), "full");
  assert.equal(M.mirrorMode("auto", "smooth"), "low");
  assert.equal(M.MIRROR_MODES.simple, null);
});

test("mirror pass: only glass the camera can see – past the car's own parts, and big enough on the screen to read", () => {
  // the driver's eyes see both glasses whole; the 2022–25 model's T-cam sees them mostly behind the halo's hoop
  for (const [season, team] of [[2025, "Haas F1 Team"], [2026, "Ferrari"]]) {
    const car = C.makeCar({ teamName: team, season }), P = car.userData.profile; car.userData.helmet.visible = false;
    assert.deepEqual(M.seenShare(car, V(...P.eye), car.userData.mirrors), [1, 1], `${season} eyes`);
    car.userData.helmet.visible = true;
    const t = M.seenShare(car, V(...P.tcam), car.userData.mirrors);
    if (season === 2025) assert.ok(t.every((x) => x < 0.5), `2025 T-cam sees ${t}`); else assert.ok(t.every((x) => x > 0.5), `2026 T-cam sees ${t}`);
  }
  // a camera 40 m behind: the glass a few pixels – the simple glass, no pass
  const { scene, car } = rig(), r = mockRenderer(), P = M.createMirrorPass();
  const far = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 2000); far.position.set(0, 3, -40); far.lookAt(0, 0.7, 0); far.updateMatrixWorld(true);
  assert.equal(P.update(r, scene, far, car, "full", "onboard:16"), 0);
  assert.equal(r.calls.length, 0); assert.equal(car.userData.mirrors.material, car.userData.mirrors.userData.glass);
});
