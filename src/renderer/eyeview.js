// v0.52 (request §11): what the driver's-eye camera actually shows of the car and the driver – measured, per car, per
// angle of the steering wheel, per window shape. Development and test use only (tools/eyeview.mjs, test/eyeview52.test.js,
// Map3D.eyeView in the app); never used to draw a frame.
//
// A small software rasteriser over the car's own generated triangles (the meshes as built and posed – the skinned
// sleeves and gauntlets through their bones, the gloves on the grips, the steering wheel turned): every triangle
// projected through the camera, clipped at its near plane, filled into a coarse depth buffer with a class per pixel.
// The share of the picture each class holds then says what the eye sees: the outside world (road, sky – nothing of
// the car), the car's body, the steering wheel, its display, the arms (sleeves and gauntlets), the gloves, the
// mirrors' glass. Regions: the forward window (the road ahead: ±20° across, from 8° under the horizon to 4° over it,
// in the car's frame – where a driver looks through a corner), the bottom band, the mirrors' and the display's own
// pixels (how much of each is hidden behind a hand or an arm), and the near plane (any triangle cut by it: the
// camera inside something).
//
// Classes (CLS): 0 outside, 1 body (chassis, halo, wings, wheels, tub, rim, headrest), 2 driver (torso, legs),
// 3 wheel (rim, grips, buttons, lights), 4 display (the wheel's screen), 5 arm (sleeve, gauntlet), 6 glove,
// 7 mirror glass.
import * as THREE from "./vendor/three.module.js";

export const CLS = { outside: 0, body: 1, driver: 2, wheel: 3, display: 4, arm: 5, glove: 6, mirror: 7 };
export const CLS_NAMES = Object.keys(CLS);

// a mesh's class from its name and its parents' (car3d's naming)
export function classOf(o, root) {
  const names = []; for (let p = o; p && p !== root; p = p.parent) names.push(p.name || "");
  const n = names[0];
  if (n === "wheelScreen") return CLS.display;
  if (n === "mirrors") return CLS.mirror;
  if (n === "arm" || n === "gauntlet") return CLS.arm;
  if (/^glove/.test(n) || names.some((x) => /^hand[LR]$/.test(x))) return CLS.glove;
  if (names.includes("steering")) return CLS.wheel;
  if (n === "torso") return CLS.driver;
  return CLS.body;
}
// shown: the object and its parents up to the root visible
function shown(o, root) { for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false; return true; }

// Clip a triangle (clip-space x, y, z, w per corner) against the near plane (z > −w), Sutherland–Hodgman; returns a
// polygon (0, 3 or 4 corners) and whether anything was cut away.
export function clipNear(a, b, c) {
  const inp = [a, b, c], out = []; let cut = false;
  for (let i = 0; i < 3; i++) {
    const p = inp[i], q = inp[(i + 1) % 3], dp = p[2] + p[3], dq = q[2] + q[3];
    if (dp >= 0) out.push(p); else cut = true;
    if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t, p[3] + (q[3] - p[3]) * t]); }
  }
  return { poly: out, cut };
}

// Fill a screen-space triangle (x, y in pixels, z depth 0..1) into the buffers: nearer wins.
export function fillTri(buf, A, B, C, cls) {
  const { W, H, depth, id } = buf;
  const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
  const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
  const area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
  if (Math.abs(area) < 1e-12) return 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    const w0 = ((B[0] - px) * (C[1] - py) - (B[1] - py) * (C[0] - px)) / area, w1 = ((C[0] - px) * (A[1] - py) - (C[1] - py) * (A[0] - px)) / area, w2 = 1 - w0 - w1;
    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
    const z = w0 * A[2] + w1 * B[2] + w2 * C[2], k = y * W + x;
    if (z < depth[k]) { depth[k] = z; id[k] = cls; n++; }
  }
  return n;
}

// does the part of a clip-space triangle in front of the eye but nearer than the near plane fall inside the view's cone?
// (w is the distance along the view; the cone: |x| ≤ w, |y| ≤ w in clip space for a perspective camera) – sampled
export function clippedInView(c, near, n = 8) {
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
    const a = i / n, b = j / n, g = 1 - a - b, w = a * c[0][3] + b * c[1][3] + g * c[2][3];
    if (!(w > 1e-4 && w < near)) continue;
    const x = a * c[0][0] + b * c[1][0] + g * c[2][0], y = a * c[0][1] + b * c[1][1] + g * c[2][1];
    if (Math.abs(x) <= w && Math.abs(y) <= w) return true;
  }
  return false;
}
// Rasterise the car's meshes seen by `camera` at W × H pixels. Returns { W, H, id (Uint8Array, class per pixel), cut:
// { class: triangles the near plane cut }, nearest: { class: the nearest distance along the view (m) } }.
export function rasterCar(car, camera, W = 320, H = 180, { skip = null } = {}) {
  car.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const buf = { W, H, depth: new Float32Array(W * H).fill(Infinity), id: new Uint8Array(W * H) };
  const VP = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const e = VP.elements, v = new THREE.Vector3(), m = new THREE.Matrix4(), cut = {}, nearest = {};
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  const cam = camera.position, near = camera.near;
  const clip = (x, y, z) => [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14], e[3] * x + e[7] * y + e[11] * z + e[15]];
  const toScreen = (c) => [(c[0] / c[3] * 0.5 + 0.5) * W, (-c[1] / c[3] * 0.5 + 0.5) * H, c[2] / c[3]];
  car.traverse((o) => {
    if (!o.isMesh || !shown(o, car) || !o.geometry?.attributes?.position || o.name === "contactShadow" || o.material?.transparent && o.material.depthWrite === false) return;   // (the soft shadow under the car: no surface)
    const cls = classOf(o, car); if (skip && skip(o, cls)) return;
    const P = o.geometry.attributes.position, I = o.geometry.index, cnt = I ? I.count : P.count;
    const inst = o.isInstancedMesh ? o.count : 1;
    for (let c = 0; c < inst; c++) {
      if (o.isInstancedMesh) o.getMatrixAt(c, m);
      const corner = new Array(3);
      for (let i = 0; i + 2 < cnt; i += 3) {
        for (let j = 0; j < 3; j++) {
          const ix = I ? I.getX(i + j) : i + j;
          if (o.isSkinnedMesh) o.getVertexPosition(ix, v); else v.fromBufferAttribute(P, ix);
          if (o.isInstancedMesh) v.applyMatrix4(m);
          v.applyMatrix4(o.matrixWorld);
          const d = (v.x - cam.x) * fwd.x + (v.y - cam.y) * fwd.y + (v.z - cam.z) * fwd.z;
          if (d > 0 && !(nearest[cls] <= d)) nearest[cls] = d;
          corner[j] = clip(v.x, v.y, v.z);
        }
        const { poly, cut: wasCut } = clipNear(corner[0], corner[1], corner[2]);
        // (a cut that shows: part of the triangle between the eye and the near plane, inside the view's cone – there the
        // picture has a hole where the surface was; a big triangle merely reaching back past the camera is no hole)
        if (wasCut && clippedInView(corner, near)) cut[cls] = (cut[cls] || 0) + 1;
        if (poly.length < 3) continue;
        const S = poly.map(toScreen);
        for (let k = 1; k + 1 < S.length; k++) fillTri(buf, S[0], S[k], S[k + 1], cls);
      }
    }
  });
  return { W, H, id: buf.id, depth: buf.depth, cut, nearest };
}

// The shares of a raster: whole picture, the forward window (a rectangle of directions in the car's frame, projected),
// the bottom band; plus each class's bounding box (fractions of the picture).
export function shares(R, region = null) {
  const { W, H, id } = R, n = new Array(CLS_NAMES.length).fill(0);
  let tot = 0;
  const [rx0, ry0, rx1, ry1] = region || [0, 0, 1, 1];
  for (let y = Math.floor(ry0 * H); y < Math.ceil(ry1 * H); y++) for (let x = Math.floor(rx0 * W); x < Math.ceil(rx1 * W); x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; n[id[y * W + x]]++; tot++; }
  const out = {}; CLS_NAMES.forEach((k, i) => { out[k] = tot ? +(n[i] / tot).toFixed(4) : 0; });
  return out;
}
export function boxes(R) {
  const { W, H, id } = R, b = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = id[y * W + x]; if (!c) continue; const k = CLS_NAMES[c], q = (b[k] ||= [1, 1, 0, 0]); q[0] = Math.min(q[0], x / W); q[1] = Math.min(q[1], y / H); q[2] = Math.max(q[2], (x + 1) / W); q[3] = Math.max(q[3], (y + 1) / H); }
  for (const k in b) b[k] = b[k].map((v) => +v.toFixed(3));
  return b;
}
// how much of the given class' pixels is hidden by a hand or an arm: render once with every class, once without the
// arms and gloves; the class' pixels in the second that the first shows as arm / glove
export function hiddenByArms(full, bare, cls) {
  let all = 0, hid = 0;
  for (let k = 0; k < full.id.length; k++) if (bare.id[k] === cls) { all++; if (full.id[k] === CLS.arm || full.id[k] === CLS.glove) hid++; }
  return { px: all, hidden: all ? +(hid / all).toFixed(3) : 0 };
}
// the forward window (directions in the car's frame: yaw ±a across, pitch from lo to hi; the car looks along +z) as a
// rectangle of the picture (fractions), through the camera
export function windowRect(camera, carM, { across = 20, lo = -8, hi = 4 } = {}) {
  const D = Math.PI / 180, eye = camera.position, pts = [];
  for (const yw of [-across, across]) for (const pt of [lo, hi]) {
    const d = new THREE.Vector3(Math.sin(yw * D) * Math.cos(pt * D), Math.sin(pt * D), Math.cos(yw * D) * Math.cos(pt * D)).transformDirection(carM);
    const p = eye.clone().addScaledVector(d, 50).project(camera); pts.push([p.x * 0.5 + 0.5, -p.y * 0.5 + 0.5]);
  }
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))].map((v) => +Math.max(0, Math.min(1, v)).toFixed(3));
}
// the picture's centre the spectator HUD keeps clear in the cockpit cameras (map3d keepClearZones: 30–70 % across,
// 12–58 % down) – where the eye looks
export const CENTRE = [0.3, 0.12, 0.7, 0.58];
// Everything for one view: the car posed as it is, the camera as given
export function measureEyeView(car, camera, W = 320, H = null) {
  H = H || Math.round(W / camera.aspect);
  const hideArms = (o, cls) => cls === CLS.arm || cls === CLS.glove;
  const full = rasterCar(car, camera, W, H), bare = rasterCar(car, camera, W, H, { skip: hideArms });
  const win = windowRect(camera, car.matrixWorld);
  return {
    W, H, all: shares(full), forward: shares(full, win), forwardBare: shares(bare, win), window: win,
    bottom: shares(full, [0, 0.75, 1, 1]), centre: shares(full, CENTRE), boxes: boxes(full),
    mirror: hiddenByArms(full, bare, CLS.mirror), display: hiddenByArms(full, bare, CLS.display),
    cut: full.cut, nearest: Object.fromEntries(Object.entries(full.nearest).map(([k, d]) => [CLS_NAMES[k], +d.toFixed(3)])),
  };
}
// a coarse picture of the classes (one character a pixel) – for a report or a failing test's message
export function asciiOf(R, step = 4) {
  const ch = ".#dwDag M".split(""), rows = [];
  for (let y = 0; y < R.H; y += step * 2) { let s = ""; for (let x = 0; x < R.W; x += step) s += ch[R.id[y * R.W + x]] || "?"; rows.push(s); }
  return rows.join("\n");
}
