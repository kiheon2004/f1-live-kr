// Development only (v0.45): checks the side mirrors' pass (mirrors.js) against the REAL WebGLRenderer in the app – the
// v0.44 tests use a stand-in renderer. Map3D.mirrorProbe() runs one frame's pass through probeMirrorPass(): the renderer's
// and the GL context's own state before and after (render target, viewport, scissor and its test, shadow map flags,
// autoClear, xr), per mirror render the GL errors and whether anything visible samples the picture being drawn (a
// feedback loop), and optionally a fault injected inside the pass:
//   "throw" – an object whose onBeforeRender throws while the mirror target is bound (an exception mid-render)
//   "loop"  – the glass left visible in its own pass (a feedback loop made on purpose: the detector's own check; it only
//             forms in the low mode – full draws into a multisampled buffer and the texture is only the resolve target)
// colourCheck() compares the picture with the same camera drawn straight to the screen, and the glass' pixels on the
// screen with the picture's texels. Nothing here runs unless called.
import * as THREE from "./vendor/three.module.js";

const v4 = () => new THREE.Vector4();
// the GL's errors since the last call (WebGL keeps a set of flags: read until none)
export function glErrors(gl) { const out = []; for (let i = 0; i < 8; i++) { const e = gl.getError(); if (!e) break; out.push(e); } return out; }
export function rendererState(r, pass) {
  const gl = r.getContext(), a = v4(), b = v4(), c = v4(), t = r.getRenderTarget(), sm = r.shadowMap;
  r.getViewport(a); r.getScissor(b); r.getCurrentViewport(c);
  return {
    target: t === null ? "screen" : t === pass?.state.rt ? "mirrors" : t.texture?.name || "other",
    viewport: a.toArray(), scissor: b.toArray(), scissorTest: r.getScissorTest(), currentViewport: c.toArray(),
    autoClear: r.autoClear, xr: r.xr.enabled, shadow: { enabled: sm.enabled, autoUpdate: sm.autoUpdate, needsUpdate: sm.needsUpdate, type: sm.type },
    gl: { viewport: Array.from(gl.getParameter(gl.VIEWPORT)), scissor: Array.from(gl.getParameter(gl.SCISSOR_BOX)), scissorTest: gl.isEnabled(gl.SCISSOR_TEST), framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING) === null ? "default" : "bound" },
  };
}
// the keys whose values differ between two states
export function stateDiff(a, b, path = "") {
  const out = [];
  for (const k of Object.keys(a)) {
    const x = a[k], y = b[k], p = path + k;
    if (x && typeof x === "object" && !Array.isArray(x)) out.push(...stateDiff(x, y, p + "."));
    else if (JSON.stringify(x) !== JSON.stringify(y)) out.push(p + ": " + JSON.stringify(x) + " → " + JSON.stringify(y));
  }
  return out;
}

// run(): the frame's pass (mirrorPass.update(...)); returns { result, error } – the error the pass let out, if any
export function probeMirrorPass({ renderer, scene, pass, fault }, run) {
  const gl = renderer.getContext(), pre = glErrors(gl), before = rendererState(renderer, pass), calls = [];
  const orig = renderer.render, glass = () => pass.state.car?.userData?.mirrors;
  let injected = null, error = null, result;
  if (fault === "throw") {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    injected = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); injected.frustumCulled = false; injected.name = "mirrorProbeFault";
    injected.onBeforeRender = (r) => { if (pass.state.rt && r.getRenderTarget() === pass.state.rt) throw new Error("mirror probe: injected fault"); };
    scene.add(injected);
  }
  renderer.render = function (s, cam) {
    const inPass = !!pass.state.rt && this.getRenderTarget() === pass.state.rt;
    if (inPass && fault === "loop") { const m = glass(); if (m) { m.visible = true; m.material = pass.material; } }
    let sampling = 0;
    if (inPass) s.traverseVisible((o) => { const m = o.material; if (m === pass.material || (Array.isArray(m) && m.includes(pass.material))) sampling++; });
    try { return orig.call(this, s, cam); } finally { calls.push({ inPass, sampling, samples: pass.state.rt?.samples ?? null, glErrors: glErrors(gl), during: inPass ? rendererState(this, pass).gl : null }); }
  };
  try { result = run(); } catch (e) { error = String(e?.message || e); } finally {
    renderer.render = orig;
    if (injected) { scene.remove(injected); injected.geometry.dispose(); injected.material.dispose(); }
  }
  const after = rendererState(renderer, pass), m = glass();
  return { result, error, preErrors: pre, before, after, changed: stateDiff(before, after), calls, glass: m ? { visible: m.visible, live: m.material === pass.material } : null, post: glErrors(gl) };
}

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// (sRGB-encoded 0..255 → linear 0..1)
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
// The picture vs the same mirror camera drawn straight to the screen (the screen's own colour pipeline). Call between the
// pass and the main render (the main render clears the canvas after). i: the mirror (0, 1) – its half of the picture.
export function samePipeline(renderer, scene, pass, i, hide) {
  const rt = pass.state.rt, cam = pass.cams[i], spec = pass.state.car?.userData?.mirrors?.userData.spec;
  if (!rt || !spec || !pass.state.drawn[i]) return null;
  const W = rt.width, H = rt.height, half = W / 2, x0 = spec[i].k > 0 ? 0 : half, gl = renderer.getContext();
  const pic = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, pic);
  const vp = v4(), sc = v4(), sct = renderer.getScissorTest(), pr = renderer.getPixelRatio(), clear = renderer.autoClear, sh = renderer.shadowMap.needsUpdate, prevT = renderer.getRenderTarget();
  renderer.getViewport(vp); renderer.getScissor(sc);
  const scr = new Uint8Array(half * H * 4);
  try {
    hide(true); renderer.shadowMap.needsUpdate = false; renderer.autoClear = true; renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, half / pr, H / pr); renderer.setScissor(0, 0, half / pr, H / pr); renderer.setScissorTest(true);
    renderer.render(scene, cam);
    gl.readPixels(0, 0, half, H, gl.RGBA, gl.UNSIGNED_BYTE, scr);
  } finally { hide(false); renderer.setRenderTarget(prevT); renderer.setViewport(vp); renderer.setScissor(sc); renderer.setScissorTest(sct); renderer.autoClear = clear; renderer.shadowMap.needsUpdate = sh; }
  // (both read bottom row first: the same layout)
  let d = 0, lp = 0, ls = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < half; x++) {
    const p = (y * W + x0 + x) * 4, q = (y * half + x) * 4;
    d += Math.abs(pic[p] - scr[q]) + Math.abs(pic[p + 1] - scr[q + 1]) + Math.abs(pic[p + 2] - scr[q + 2]);
    lp += luma(pic[p], pic[p + 1], pic[p + 2]); ls += luma(scr[q], scr[q + 1], scr[q + 2]); n++;
  }
  return { mirror: i, px: [half, H], meanAbsDiff: +(d / n / 3).toFixed(2), lumaPicture: +(lp / n).toFixed(1), lumaScreen: +(ls / n).toFixed(1) };
}
// The glass on the screen vs the picture's texels at the same places (call right after the main render): an inner grid of
// the glass (a along it, b up it), each point's screen pixel against the texel its UV shows. Ratios of the mean, both as
// stored (sRGB-encoded) and in linear light.
export function glassVsPicture(renderer, camera, pass) {
  const rt = pass.state.rt, mesh = pass.state.car?.userData?.mirrors, spec = mesh?.userData.spec;
  if (!rt || !spec || mesh.material !== pass.material) return null;
  const gl = renderer.getContext(), W = rt.width, H = rt.height, half = W / 2, size = new THREE.Vector2(); renderer.getDrawingBufferSize(size);
  const pic = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, pic);
  const mw = mesh.matrixWorld, P = new THREE.Vector3(), px = new Uint8Array(4), out = [];
  spec.forEach((s, i) => {
    if (!pass.state.drawn[i]) return;
    const x0 = s.k > 0 ? 0 : half;
    let sS = 0, sT = 0, lS = 0, lT = 0, n = 0;
    for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) for (const b of [-0.4, 0, 0.4]) {
      P.set(s.c[0] + s.h[0] * a * s.hw + s.up[0] * b * s.hh, s.c[1] + s.h[1] * a * s.hw + s.up[1] * b * s.hh, s.c[2] + s.h[2] * a * s.hw + s.up[2] * b * s.hh).applyMatrix4(mw).project(camera);
      if (Math.abs(P.x) > 1 || Math.abs(P.y) > 1 || P.z > 1) continue;
      const X = Math.floor((P.x + 1) / 2 * size.x), Y = Math.floor((P.y + 1) / 2 * size.y);
      gl.readPixels(X, Y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const tx = Math.min(W - 1, Math.floor(x0 + (a + 1) / 2 * half)), ty = Math.min(H - 1, Math.floor((b + 1) / 2 * H)), t = (ty * W + tx) * 4;
      sS += luma(px[0], px[1], px[2]); sT += luma(pic[t], pic[t + 1], pic[t + 2]);
      lS += luma(lin(px[0]), lin(px[1]), lin(px[2])); lT += luma(lin(pic[t]), lin(pic[t + 1]), lin(pic[t + 2])); n++;
    }
    if (n) out.push({ mirror: i, points: n, lumaScreen: +(sS / n).toFixed(1), lumaPicture: +(sT / n).toFixed(1), ratioEncoded: +(sS / sT).toFixed(3), ratioLinear: +(lS / lT).toFixed(3) });
  });
  return out;
}
