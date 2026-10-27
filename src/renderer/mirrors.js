// The side mirrors' rear view (v0.44). Until v0.43 the glass was a dark plane merged into the car's carbon: it showed
// nothing. Now, for the car a cockpit camera rides in (onboard T-cam, first person), each mirror shows what is behind –
// the cars, the track, the barriers and buildings – drawn from a virtual camera into one small two-in-one picture that
// is made once and reused; every other car's mirrors (and this one's in the simple mode) are a silvered glass lit by the
// sky (car3d.js glassMat).
//
// What the rules give (FIA 2025 Technical Regulations Issue 03 Art. 14.2 / App. §13; 2026 Section C Issue 17 C14.2 /
// C3.7.5 / App. §14 – the PDFs, read 2026-10-20): two mirrors, one each side, symmetric; each glass projects onto a
// vertical rectangle 200 × 50 mm; convex, no concave part, no normal radius under 400 mm; cut by any Z-plane, the
// normal at its inboard end 24–28° off the X axis towards the car's centre and the normals at its two ends more than 8°
// apart; the body in a box Y 470–680, Z 640–720 mm, skewed 21° in plan (outboard end further back); on stays from the
// chassis (2026: optionally a rear stay to the sidepod; never the halo). So the model draws one flat glass a side,
// turned MIRROR.yaw in from straight back (the inboard normal's 24–28° less half the 8° spread – regulation, M), and
// approximates the convex glass by widening the picture's horizontal angle by MIRROR.spread at each edge (a glass whose
// normal turns 8° across it turns the reflected rays 2 × 8° more: the regulations' least curvature – a visual
// approximation: a real convex mirror shrinks the image unevenly, this one evenly).
//
// The virtual camera (mirrorCamera, pure): a flat mirror shows the world as seen from the eye's mirror image across the
// glass' plane, through the glass as a window. So the camera stands at the mirrored eye, looks along the glass' normal
// (backwards), its frustum the glass' rectangle off-axis (at its distance, the near plane IS the glass' plane: anything
// between – the car's nose, the front wheels – is clipped off; behind it the own sidepod and rear tyre show at the inner
// edge, as in real mirrors), widened for the convexity. Its right is the car's +x (left): a car behind on the left lands
// on the picture's right half, and the glass' UVs (car3d.js) lay the picture's right edge at the glass' +x edge – the
// driver, facing forward, sees it on the left of the mirror: a mirror image, left on the left (test/mirrors.test.js
// checks this against a reflected ray).
//
// The picture: drawn with the screen's own tone mapping and colour space (the target marked as three.js's XR target,
// which takes the renderer's tone mapping and the texture's colour space; RGBA8 storage, so no second sRGB step): the
// mirror's light is the scene's – tunnels, night, rain look as bright as the view itself – and every material reuses the
// screen's shader programs (a plain render target makes three.js compile a linear, untoned copy of each one: a stall the
// first time the mirrors were drawn). The glass shows the picture as it is (MIRROR_SHADER: no second tone mapping),
// dimmed to a silvered glass' reflectance (~0.85 – an estimate).
//
// Modes (the 🛰 settings' 사이드미러; "auto": low with the quality setting 부드러움 or while frames come late – the
// adaptive resolution's own test, mirrorStrain –, else full):
//   full   – both mirrors every frame, 2 × 384 × 96 px, 4× multisampled
//   low    – 2 × 192 × 48 px, each mirror every 3rd frame, the two on different frames (one pass a frame at most: the
//            picture up to 2 frames old, no frame carrying both), no multisampling
//   simple – no rear view: the sky's reflection only (car3d.js glass) – no cars or scenery in it
// Only when a mirror is in the camera's frustum and the camera in front of its glass; never in the helicopter or chase
// views (a mirror there is a few pixels). Resources: one render target (made on first use, remade only when the mode's
// size changes) and two cameras, no per-frame allocation; the glass keeps the simple material until its half of the
// picture has been drawn for this car and camera (never black, never another view's picture); release() hands the car its
// glass back (a car or session change), dispose() frees the target (the world's teardown).
import * as THREE from "./vendor/three.module.js";

// (far: 150 m – a car there is ~10 px tall in the full picture (96 px over the glass' ~3.6° of height, seen from the eyes
// ~0.8 m away); beyond it the sky. At 1500 m each mirror drew 1.2 M triangles in ~260 draws from the eyes – v0.44 runs)
export const MIRROR = { yaw: (22 * Math.PI) / 180, spread: (8 * Math.PI) / 180, glass: [0.2, 0.05], far: 150, reflectance: 0.85 };
export const MIRROR_MODES = {
  full: { w: 768, h: 96, every: 1, samples: 4 },
  low: { w: 384, h: 48, every: 3, samples: 0 },
  simple: null,
};
// the mode from the setting ("auto" | "full" | "low" | "simple") and the quality setting ("sharp" | "balanced" | "smooth")
// strained: frames are coming late now (mirrorStrain)
export function mirrorMode(setting, quality, strained = false) {
  if (setting === "full" || setting === "low" || setting === "simple") return setting;
  return quality === "smooth" || strained ? "low" : "full";
}
// Late frames (map3d's adaptive resolution: the share of the last 2 s window's frames that missed their refresh, and
// how many calm windows in a row): strained from more than 1 late frame in 12 – the same line at which the resolution
// steps down – until 15 calm windows (30 s), so the mode doesn't flip back and forth
export function mirrorStrain(was, late, calm) { return was ? !((calm || 0) >= 15) : (late || 0) > 0.08; }

const _d = new THREE.Vector3(), _x = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
// Places `cam` (a PerspectiveCamera, never updateProjectionMatrix()'d) for a flat mirror: eye, glass centre c, unit
// normal n (towards the side the eye looks from), unit h (along the glass, the car's +x way), unit up; half sizes hw, hh;
// spread: the convexity's extra angle at each side edge (rad). False when the eye is behind the glass (or on it).
export function mirrorCamera(cam, eye, c, n, h, up, hw, hh, spread = 0, far = MIRROR.far) {
  const dist = _d.subVectors(eye, c).dot(n);
  if (!(dist > 1e-4)) return false;
  cam.position.copy(eye).addScaledVector(n, -2 * dist);            // the eye's mirror image
  _z.copy(n).negate(); _x.crossVectors(up, _z);                     // looking along n: z = −n, x = up × z (= h)
  cam.quaternion.setFromRotationMatrix(_m.makeBasis(_x, up, _z));
  // the glass' rectangle in the camera's frame at its distance (in-plane offsets are the same from eye and its image)
  _d.subVectors(c, eye); const ox = _d.dot(_x), oy = _d.dot(up);
  let l = ox - hw, r = ox + hw;
  if (spread) { l = dist * Math.tan(Math.atan2(l, dist) - spread); r = dist * Math.tan(Math.atan2(r, dist) + spread); }
  cam.near = dist; cam.far = far;
  cam.projectionMatrix.makePerspective(l, r, oy + hh, oy - hh, dist, far);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  cam.updateMatrixWorld(true);
  return true;
}

// the glass' material for the rear view: the picture as drawn (already tone-mapped, in the screen's colour space), dimmed
// by the reflectance in light, not in stored values (v0.45: the sRGB-encoded values × 0.85 gave ~0.68 of the picture's
// light on the screen – measured in the app, Map3D.mirrorProbe({ colour: true })): decoded (MIRROR_SRGB: the picture is
// sRGB, the screen's colour space), scaled, encoded again (three's own colorspace_pars functions, in every ShaderMaterial)
export const MIRROR_SHADER = {
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: "uniform sampler2D map; uniform float k; varying vec2 vUv; void main() { vec4 c = texture2D(map, vUv);\n#ifdef MIRROR_SRGB\nc = sRGBTransferOETF(vec4(sRGBTransferEOTF(c).rgb * k, 1.0));\n#else\nc = vec4(c.rgb * k, 1.0);\n#endif\ngl_FragColor = vec4(c.rgb, 1.0); }",
};

// How much of each glass the eye sees past the car's own parts (halo, bodywork, helmet, arms): rays from the eye to 3 × 2
// points on the glass. Once per view (car and camera): the cameras ride the car, so this doesn't change with the
// picture's turning. (The 2022–25 model's T-cam sees its glass behind the halo's hoop: drawing it would cost a pass a
// frame for nothing.)
const _ray = new THREE.Raycaster(), _p = new THREE.Vector3(), _dir = new THREE.Vector3();
export function seenShare(car, eye, mesh, out = []) {
  const list = [], spec = mesh.userData.spec;
  car.updateWorldMatrix(true, true);
  car.traverseVisible((o) => { if (o.isMesh && o !== mesh && !o.isInstancedMesh) list.push(o); });
  spec.forEach((s, i) => {
    let seen = 0, n = 0;
    for (const a of [-0.8, 0, 0.8]) for (const b of [-0.6, 0.6]) {
      _p.set(s.c[0] + s.h[0] * a * s.hw + s.up[0] * b * s.hh, s.c[1] + s.h[1] * a * s.hw + s.up[1] * b * s.hh, s.c[2] + s.h[2] * a * s.hw + s.up[2] * b * s.hh).applyMatrix4(car.matrixWorld);
      const d = _dir.subVectors(_p, eye).length(); n++;
      _ray.set(eye, _dir.normalize()); _ray.near = 0; _ray.far = Math.max(0, d - 0.004);
      if (!_ray.intersectObjects(list, false).length) seen++;
    }
    out[i] = seen / n;
  });
  return out;
}

// The pass. update() once a frame before the main render; three is the module (tests pass a mock renderer).
export function createMirrorPass(three = THREE) {
  const cams = [new three.PerspectiveCamera(), new three.PerspectiveCamera()];
  for (const c of cams) c.matrixAutoUpdate = true;
  const liveMat = new three.ShaderMaterial({ uniforms: { map: { value: null }, k: { value: MIRROR.reflectance } }, defines: {}, ...MIRROR_SHADER, toneMapped: false, fog: false, lights: false });
  liveMat.userData.shared = true;   // (the pass' own: never freed with a car)
  const W = { c: new three.Vector3(), n: new three.Vector3(), h: new three.Vector3(), up: new three.Vector3() };
  const frustum = new three.Frustum(), pv = new three.Matrix4(), sphere = new three.Sphere(), eye = new three.Vector3();
  const corners = [new three.Vector3(), new three.Vector3(), new three.Vector3(), new three.Vector3()], buf = new three.Vector2();
  // (a glass under ~150 px² on the screen – a sliver seen edge-on, a tiny window or drawing buffer – gets no pass a frame:
  // no picture to read. v0.45: but it still showed the live material – a picture frozen when every glass in view was
  // small, or its half never drawn for this view (another car's or camera's picture) when the other glass was large. Now:
  // every glass in view small → the simple glass (drawn afresh once large again); one large → the small one's half drawn
  // once for this view, then kept – test/mirrors45.test.js)
  const MIN_PX = 150;
  function screenArea(renderer, camera, W, hw, hh) {
    for (let j = 0; j < 4; j++) corners[j].copy(W.c).addScaledVector(W.h, (j === 0 || j === 3 ? -1 : 1) * hw).addScaledVector(W.up, (j < 2 ? -1 : 1) * hh).project(camera);
    for (let j = 0; j < 4; j++) if (corners[j].z > 1 || corners[j].z < -1) return Infinity;   // (a corner behind the camera: count it as large)
    renderer.getDrawingBufferSize?.(buf); const sx = (buf.x || 1) / 2, sy = (buf.y || 1) / 2;
    let a = 0; for (let j = 0; j < 4; j++) { const p = corners[j], q = corners[(j + 1) % 4]; a += p.x * sx * q.y * sy - q.x * sx * p.y * sy; }
    return Math.abs(a) / 2;
  }
  const st = { rt: null, seen: [1, 1], size: null, car: null, key: "", failed: null, frame: 0, last: [-1e9, -1e9], drawn: [false, false], stats: { renders: 0, calls: 0, tris: 0, ms: 0, skipped: 0 } };

  function target(renderer, M) {
    if (st.rt && st.size === M) return st.rt;
    if (st.rt) st.rt.dispose();
    const rt = new three.WebGLRenderTarget(M.w, M.h, { samples: M.samples, depthBuffer: true, generateMipmaps: false, minFilter: three.LinearFilter, magFilter: three.LinearFilter });
    rt.texture.colorSpace = renderer.outputColorSpace; rt.texture.internalFormat = "RGBA8"; rt.texture.name = "mirrors";
    rt.isXRRenderTarget = true;   // (three.js: the renderer's tone mapping and the texture's colour space – the screen's programs)
    const srgb = rt.texture.colorSpace === three.SRGBColorSpace;
    if (!!liveMat.defines.MIRROR_SRGB !== srgb) { if (srgb) liveMat.defines.MIRROR_SRGB = 1; else delete liveMat.defines.MIRROR_SRGB; liveMat.needsUpdate = true; }
    st.rt = rt; st.size = M; st.drawn = [false, false]; st.last = [-1e9, -1e9];
    liveMat.uniforms.map.value = rt.texture;
    return rt;
  }
  // the car's glass back to its own (simple) material
  function release() {
    const m = st.car?.userData?.mirrors;
    if (m) { if (m.material === liveMat) m.material = m.userData.glass; m.visible = true; }
    st.car = null; st.key = ""; st.drawn = [false, false]; st.last = [-1e9, -1e9];
  }
  function dispose() { release(); st.failed = null; if (st.rt) st.rt.dispose(); st.rt = null; st.size = null; liveMat.uniforms.map.value = null; }

  // renderer, scene, camera (the main one, its matrices up to date), car (the model ridden, its matrixWorld up to date,
  // or null), mode ("full" | "low" | "simple"), view (a key for the camera: mode and car – a change draws afresh),
  // aux(hide): hides (true) / shows (false) what must not be in a mirror (labels – drawn facing the screen)
  function update(renderer, scene, camera, car, mode, view, aux) {
    st.frame++;
    const M = MIRROR_MODES[mode], mesh = car?.userData?.mirrors, spec = mesh?.userData.spec;
    if (!M || !spec?.length) { if (st.car) release(); return 0; }
    if (st.car !== car) { release(); st.car = car; }
    const rt = target(renderer, M);
    camera.updateMatrixWorld(); eye.setFromMatrixPosition(camera.matrixWorld);
    if (st.failed) { if (st.failed === view + "|" + mode) return 0; st.failed = null; st.key = ""; }   // (failed in this view and mode: the plain glass – another tries again)
    if (st.key !== view) { st.key = view; st.drawn = [false, false]; st.last = [-1e9, -1e9]; mesh.material = mesh.userData.glass; seenShare(car, eye, mesh, st.seen); }
    frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const mw = car.matrixWorld;
    let todo = 0, shown = 0, large = 0;
    for (let i = 0; i < spec.length; i++) {
      const s = spec[i], cam = cams[i];
      cam.userData.go = false;
      W.c.set(s.c[0], s.c[1], s.c[2]).applyMatrix4(mw); W.n.set(s.n[0], s.n[1], s.n[2]).transformDirection(mw); W.h.set(s.h[0], s.h[1], s.h[2]).transformDirection(mw); W.up.set(s.up[0], s.up[1], s.up[2]).transformDirection(mw);
      sphere.center.copy(W.c); sphere.radius = Math.hypot(s.hw, s.hh);
      // (under half the glass in sight past the car's own parts – the 2022–25 T-cam's, behind the halo – no pass: what
      // shows of it is a sliver, measured as nothing in the app's frames)
      if (!(st.seen[i] >= 0.5) || !frustum.intersectsSphere(sphere)) { st.stats.skipped++; continue; }
      shown++;
      if (screenArea(renderer, camera, W, s.hw, s.hh) >= MIN_PX) large++;
      else if (st.drawn[i]) { st.stats.skipped++; continue; }   // (small: this view's picture kept on the sliver)
      const due = !st.drawn[i] || st.frame - st.last[i] >= M.every;
      if (!due) continue;
      // (low: one mirror a frame – the other waits a frame unless it has never been drawn for this view)
      if (M.every > 1 && todo && st.drawn[i]) continue;
      if (!mirrorCamera(cam, eye, W.c, W.n, W.h, W.up, s.hw, s.hh, MIRROR.spread, MIRROR.far)) continue;
      cam.userData.go = true; todo++;
    }
    if (shown && !large) {   // (every glass in view small: the simple glass, the picture drawn afresh when one is large again)
      if (mesh.material === liveMat) { mesh.material = mesh.userData.glass; st.drawn = [false, false]; st.last = [-1e9, -1e9]; }
      for (const c of cams) c.userData.go = false; st.stats.skipped += todo; return 0;
    }
    if (!todo) return 0;
    // (the renderer as it was – restored whatever happens)
    const t0 = performance.now(), prevRT = renderer.getRenderTarget(), prevClear = renderer.autoClear, prevXR = renderer.xr.enabled, prevShadow = renderer.shadowMap.needsUpdate, prevAuto = scene.matrixWorldAutoUpdate;
    const vis = mesh.visible;
    let failed = null;
    try {
      mesh.visible = false;   // (no mirror in a mirror: the glass samples the picture being drawn)
      aux?.(true);
      renderer.xr.enabled = false; renderer.autoClear = true; renderer.shadowMap.needsUpdate = false;
      for (let i = 0; i < spec.length; i++) {
        const cam = cams[i]; if (!cam.userData.go) continue;
        const half = M.w / 2, x0 = spec[i].k > 0 ? 0 : half;
        rt.viewport.set(x0, 0, half, M.h); rt.scissor.set(x0, 0, half, M.h); rt.scissorTest = true;
        renderer.setRenderTarget(rt);
        renderer.render(scene, cam);
        scene.matrixWorldAutoUpdate = false;   // (the second mirror: the world's matrices are this frame's already)
        const info = renderer.info?.render; if (info) { st.stats.calls += info.calls; st.stats.tris += info.triangles; }
        st.stats.renders++; st.last[i] = st.frame; st.drawn[i] = true;
      }
    } catch (e) { failed = e; } finally {
      scene.matrixWorldAutoUpdate = prevAuto;
      aux?.(false);
      mesh.visible = vis;
      renderer.setRenderTarget(prevRT); renderer.autoClear = prevClear; renderer.xr.enabled = prevXR; renderer.shadowMap.needsUpdate = prevShadow;
    }
    // (an error inside the pass – a shader that won't build, a part's own onBeforeRender – stays here: thrown on, it left
    // map3d's frame() before the next frame was asked for and the whole 3D view stopped (v0.45, an error injected in the
    // app). The plain glass for this view – a half-drawn picture isn't shown – and no new try until the view or mode changes,
    // so a lasting fault doesn't cost an error a frame)
    if (failed) {
      if (!st.failed) console.warn("side mirrors: the rear view failed, plain glass for this view –", failed);
      st.failed = view + "|" + mode; mesh.material = mesh.userData.glass; st.drawn = [false, false]; st.last = [-1e9, -1e9];
      st.stats.ms += performance.now() - t0;
      return 0;
    }
    // (the rear view on the glass once both halves in sight are drawn: a half never drawn for this view is out of sight)
    if (st.drawn[0] || st.drawn[1]) mesh.material = liveMat;
    st.stats.ms += performance.now() - t0;
    return todo;
  }
  return { update, release, dispose, cams, material: liveMat, state: st };
}
