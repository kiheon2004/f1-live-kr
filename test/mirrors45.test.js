// v0.45 side mirrors, found with the real renderer in the app (mirrorprobe.js, Map3D.mirrorProbe – reports/mirrors.md):
// an exception inside the pass must not stop the 3D view's frame loop (it did: the error left frame() before it asked for
// the next frame), and the glass' reflectance applies to light, not to sRGB-encoded values (it showed ~0.68 of the
// picture's light for a stated 0.85).
import test from "node:test";
import assert from "node:assert/strict";

const THREE = await import("../src/renderer/vendor/three.module.js");
const M = await import("../src/renderer/mirrors.js");
const C = await import("../src/renderer/car3d.js");

// a renderer stand-in (as in mirrors.test.js) whose render can throw
function mockRenderer() {
  const r = { calls: 0, target: null, autoClear: false, xr: { enabled: true }, shadowMap: { needsUpdate: true }, outputColorSpace: THREE.SRGBColorSpace, info: { render: { calls: 40, triangles: 9000 } }, fail: false };
  r.getRenderTarget = () => r.target;
  r.getDrawingBufferSize = (v) => v.set(1920, 1080);
  r.setRenderTarget = (t) => { r.target = t; };
  r.render = () => { r.calls++; if (r.fail) throw new Error("shader failed"); };
  return r;
}
function rig() {
  const scene = new THREE.Scene(), car = C.makeCar({ teamName: "Ferrari", teamColour: "888888", number: 16, season: 2026 });
  scene.add(car); car.updateMatrixWorld(true);
  const label = new THREE.Sprite(); scene.add(label);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 2000);
  camera.position.set(0, 1.12, -0.16); camera.lookAt(0, 0.7, 3); camera.updateMatrixWorld(true);
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
