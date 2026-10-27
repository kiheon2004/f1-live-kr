// v0.45 side mirrors, found with the real renderer in the app (mirrorprobe.js, Map3D.mirrorProbe – reports/mirrors.md):
// an exception inside the pass must not stop the 3D view's frame loop (it did: the error left frame() before it asked for
// the next frame), and the glass' reflectance applies to light, not to sRGB-encoded values (it showed ~0.68 of the
// picture's light for a stated 0.85). And a glass under MIN_PX on the screen showed a picture that wasn't this moment's:
// an earlier one frozen (every glass small: no pass, the live picture kept) or none of this view (one glass small, the
// other drawn: the small one's half never drawn – another car's or camera's picture, or a new target's blank).
import test from "node:test";
import assert from "node:assert/strict";

const THREE = await import("../src/renderer/vendor/three.module.js");
const M = await import("../src/renderer/mirrors.js");
const C = await import("../src/renderer/car3d.js");

// a renderer stand-in (as in mirrors.test.js) whose render can throw
function mockRenderer() {
  const r = { calls: 0, target: null, autoClear: false, xr: { enabled: true }, shadowMap: { needsUpdate: true }, outputColorSpace: THREE.SRGBColorSpace, info: { render: { calls: 40, triangles: 9000 } }, fail: false };
  r.getRenderTarget = () => r.target;
  r.size = [1920, 1080]; r.getDrawingBufferSize = (v) => v.set(r.size[0], r.size[1]);
  r.setRenderTarget = (t) => { r.target = t; };
  r.render = () => { r.calls++; if (r.fail) throw new Error("shader failed"); };
  return r;
}
function rig(look = [0, 0.7, 3]) {
  const scene = new THREE.Scene(), car = C.makeCar({ teamName: "Ferrari", teamColour: "888888", number: 16, season: 2026 });
  scene.add(car); car.updateMatrixWorld(true);
  const label = new THREE.Sprite(); scene.add(label);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 2000);
  camera.position.set(0, 1.12, -0.16); camera.lookAt(...look); camera.updateMatrixWorld(true);
  return { scene, car, label, camera };
}

test("mirror pass: an exception while drawing stays in the pass – renderer restored, the plain glass back, not retried every frame", () => {
  const { scene, car, label, camera } = rig(), r = mockRenderer(), P = M.createMirrorPass(), glass = car.userData.mirrors;
  const prevRT = { isRenderTarget: true }; r.target = prevRT;
  const aux = (hide) => { label.visible = !hide; };
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  try {
    P.update(r, scene, camera, car, "full", "onboard:16", aux);
    assert.equal(glass.material, P.material, "drawn: the rear view");
    r.fail = true;
    let n; assert.doesNotThrow(() => { n = P.update(r, scene, camera, car, "full", "onboard:16", aux); }, "the error must not reach the frame loop");
    assert.equal(n, 0);
    assert.equal(r.target, prevRT); assert.equal(r.autoClear, false); assert.equal(r.xr.enabled, true); assert.equal(r.shadowMap.needsUpdate, true);
    assert.equal(scene.matrixWorldAutoUpdate, true); assert.equal(glass.visible, true); assert.equal(label.visible, true);
    assert.equal(glass.material, glass.userData.glass, "a half-drawn picture is not shown: the plain glass");
    assert.equal(warned, 1, "said once");
    const c0 = r.calls; for (let i = 0; i < 5; i++) P.update(r, scene, camera, car, "full", "onboard:16", aux);
    assert.equal(r.calls, c0, "the same view is not tried again every frame");
    assert.equal(warned, 1);
    // another view (camera or car) tries again; once it works the rear view is back
    r.fail = false;
    assert.ok(P.update(r, scene, camera, car, "full", "eye:16", aux) > 0);
    assert.equal(glass.material, P.material);
  } finally { console.warn = warn; }
});

test("mirror glass: the reflectance scales the picture's light (decoded from sRGB, scaled, encoded again), not its stored values", () => {
  const { scene, car, camera } = rig(), r = mockRenderer(), P = M.createMirrorPass();
  P.update(r, scene, camera, car, "full", "onboard:16");
  const fs = P.material.fragmentShader;
  assert.match(fs, /sRGBTransferEOTF/, "the picture decoded to light before the reflectance");
  assert.match(fs, /sRGBTransferOETF/, "and encoded again for the screen");
  assert.equal(P.material.defines?.MIRROR_SRGB, 1, "the picture is sRGB (the screen's colour space): decode it");
  // a linear screen (no encoding): nothing to decode
  const r2 = mockRenderer(); r2.outputColorSpace = THREE.LinearSRGBColorSpace; const P2 = M.createMirrorPass();
  P2.update(r2, scene, camera, car, "full", "onboard:4");
  assert.ok(!P2.material.defines?.MIRROR_SRGB);
});

// each glass in the camera's frustum (the pass' own test) – the glasses the screen shows
function inView(car, camera) {
  const spec = car.userData.mirrors.userData.spec, fr = new THREE.Frustum(), m = new THREE.Matrix4();
  fr.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  return spec.map((s) => fr.intersectsSphere(new THREE.Sphere(new THREE.Vector3(...s.c).applyMatrix4(car.matrixWorld), Math.hypot(s.hw, s.hh))));
}

test("mirror glass under MIN_PX: every glass small – not a frozen picture but the plain glass, drawn afresh when large again", () => {
  const { scene, car, camera } = rig(), r = mockRenderer(), P = M.createMirrorPass(), glass = car.userData.mirrors;
  assert.equal(P.update(r, scene, camera, car, "full", "eye:16"), 2);
  assert.ok(glass.material === P.material);
  // the same view, the drawing buffer shrunk (a small window, the adaptive resolution): both glasses ~5 px² – no pass
  r.size = [40, 22]; const c0 = r.calls;
  for (let i = 0; i < 4; i++) P.update(r, scene, camera, car, "full", "eye:16");
  assert.equal(r.calls, c0, "no pass for glasses under MIN_PX");
  assert.deepEqual(inView(car, camera), [true, true]);
  assert.ok(glass.material === glass.userData.glass, "glasses in view not redrawn show the plain glass, not the picture of 4 frames ago");
  // large again: both halves drawn in that frame before the picture is shown (low: not one half from before)
  r.size = [1920, 1080];
  assert.equal(P.update(r, scene, camera, car, "low", "eye:16"), 2);
  assert.ok(glass.material === P.material);
});

test("mirror glass under MIN_PX: one glass small, the other large – the small one's half is this view's, not another view's or blank", () => {
  // looking off to the right: the left glass (0) mid-screen, small; the right one (1) at the edge, stretched – ~75 vs ~234 px²
  const { scene, car, camera } = rig([1, 0.7, 3]), r = mockRenderer(), P = M.createMirrorPass(), glass = car.userData.mirrors;
  r.size = [192, 108];
  P.update(r, scene, camera, car, "full", "onboard:16");
  P.update(r, scene, camera, car, "full", "eye:16");   // (a new view: both halves still another view's picture)
  assert.deepEqual(inView(car, camera), [true, true]);
  assert.ok(glass.material === P.material, "the large glass shows the rear view");
  assert.deepEqual(P.state.drawn, [true, true], "every glass in view has its half drawn for this view");
  // after that the small one is kept (no pass a frame for a ~75 px² sliver), the large one drawn every frame
  const c0 = r.calls; P.update(r, scene, camera, car, "full", "eye:16"); assert.equal(r.calls - c0, 1);
});
