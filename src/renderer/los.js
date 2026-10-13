// Line of sight against the static world (buildings, stands, facilities), fast enough for every frame.
// The chase camera only needs to know whether the ~11 m between the car and the camera is clear, but three.js'
// raycaster tests every triangle of every mesh the endless ray passes near (a building chunk is tens of thousands of
// triangles): ~40 % of a frame. Here each static mesh gets a flat grid of its triangles (16 m cells, built once per
// geometry), a segment is tested only against the meshes whose bounding sphere it reaches, and only against the
// triangles in the cells it crosses. The result is the same as the raycaster's first hit within `far` (same faces:
// the material's side decides which way a triangle counts, as three.js does).
// What the grid covers: a plain static mesh with one material, drawn whole. Anything else – instanced, skinned or
// morphed, several materials (each group its own side, triangles outside the groups not drawn), a draw range – goes to
// three.js' own raycast. A triangle spanning more than 64 cells (a huge ground plane, a model in the wrong units) or
// with coordinates not finite or out of the grid's range isn't put in cells: it's on a short list tested every time,
// so building the grid stays bounded by the triangle count. A geometry whose positions or index change has its grid
// and its bounds made again – a new attribute, or one flagged needsUpdate (the same flag that sends the change to the
// GPU: a change without it isn't drawn either); for an interleaved attribute (glTF with a byte stride) that's its
// shared buffer, which holds the version. The bounding sphere is this module's own, from the positions as they are:
// a geometry changed without its bounds recomputed is still found (three.js' raycaster would skip it).
import * as THREE from "./vendor/three.module.js";

const CELL = 16, OFF = 32768, MAX_CELLS = 64;
const grids = new WeakMap();   // geometry → { cells: Map(key → triangle indices), big: [triangle], pos, v, stamp, pass, sig }
const bounds = new WeakMap();  // geometry → { sphere, sig }
const key = (i, j) => (i + OFF) * 65536 + (j + OFF);
const inRange = (i) => i > -OFF && i < OFF - 1;
// (what the grid was built from: the attributes, the buffers under them and their versions)
const verOf = (a) => (!a ? -1 : a.isInterleavedBufferAttribute ? a.data.version : a.version);
const sigOf = (g) => [g.attributes.position, g.attributes.position.data ?? null, verOf(g.attributes.position), g.index, verOf(g.index)];
const sameSig = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function sphereOf(g) {
  let B = bounds.get(g);
  const sig = sigOf(g);
  if (B && sameSig(B.sig, sig)) return B.sphere;
  const pos = g.attributes.position, sphere = new THREE.Sphere();
  // (as three.js computes it: the box's centre, the furthest position from it)
  new THREE.Box3().setFromBufferAttribute(pos).getCenter(sphere.center);
  let r2 = 0; for (let i = 0; i < pos.count; i++) r2 = Math.max(r2, sphere.center.distanceToSquared(_a.fromBufferAttribute(pos, i)));
  sphere.radius = Math.sqrt(r2);
  bounds.set(g, { sphere, sig });
  return sphere;
}
function gridOf(g) {
  let G = grids.get(g);
  const sig = sigOf(g);
  if (G && sameSig(G.sig, sig)) return G;
  const pos = g.attributes.position, index = g.index, n = Math.floor((index ? index.count : pos.count) / 3), cells = new Map(), big = [];
  const v = (k) => (index ? index.getX(k) : k);
  for (let t = 0; t < n; t++) {
    const a = v(t * 3), b = v(t * 3 + 1), c = v(t * 3 + 2);
    const x0 = Math.min(pos.getX(a), pos.getX(b), pos.getX(c)), x1 = Math.max(pos.getX(a), pos.getX(b), pos.getX(c));
    const z0 = Math.min(pos.getZ(a), pos.getZ(b), pos.getZ(c)), z1 = Math.max(pos.getZ(a), pos.getZ(b), pos.getZ(c));
    const i0 = Math.floor(x0 / CELL), i1 = Math.floor(x1 / CELL), j0 = Math.floor(z0 / CELL), j1 = Math.floor(z1 / CELL);
    // (NaN fails every comparison: such a triangle goes to the list too)
    if (!(inRange(i0) && inRange(i1) && inRange(j0) && inRange(j1) && (i1 - i0 + 1) * (j1 - j0 + 1) <= MAX_CELLS)) { big.push(t); continue; }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j); let list = cells.get(k); if (!list) cells.set(k, (list = [])); list.push(t);
    }
  }
  G = { cells, big, pos, v, stamp: new Uint32Array(n), pass: 0, sig };
  grids.set(g, G);
  return G;
}
// (the grid answers as three.js would only for this: one material, the whole geometry drawn)
const plain = (m, g) => !Array.isArray(m.material) && !m.isInstancedMesh && !m.isSkinnedMesh && !g.morphAttributes?.position?.length && !!g.attributes.position &&
  g.drawRange.start === 0 && g.drawRange.count === Infinity;

const _sphere = new THREE.Sphere(), _inv = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _lo = new THREE.Vector3(), _le = new THREE.Vector3(), _ray = new THREE.Ray(), _hit = new THREE.Vector3(), _end = new THREE.Vector3();
const _rc = new THREE.Raycaster(), _hits = [];
// The distance from `origin` along the unit vector `dir` to the first surface of `meshes` within `far`, or null.
export function firstHit(meshes, origin, dir, far) {
  let best = Infinity;
  _end.copy(origin).addScaledVector(dir, far);
  for (const m of meshes) {
    if (!m?.isMesh || !m.material) continue;
    const g = m.geometry;
    // (anything the grid doesn't cover goes to three.js as before)
    if (!plain(m, g)) {
      _rc.set(origin, dir); _rc.far = far; _hits.length = 0; m.raycast(_rc, _hits);
      for (const h of _hits) if (h.distance <= far && h.distance < best) best = h.distance;
      continue;
    }
    _sphere.copy(sphereOf(g)).applyMatrix4(m.matrixWorld);
    // the segment's closest point to the sphere's centre (a sphere that isn't a number rules nothing out, as for three.js)
    const t = Math.max(0, Math.min(far, _a.subVectors(_sphere.center, origin).dot(dir)));
    if (_b.copy(origin).addScaledVector(dir, t).distanceToSquared(_sphere.center) > _sphere.radius * _sphere.radius) continue;
    // the segment in the mesh's own space
    _inv.copy(m.matrixWorld).invert();
    _lo.copy(origin).applyMatrix4(_inv); _le.copy(_end).applyMatrix4(_inv);
    const len = _lo.distanceTo(_le); if (len < 1e-9) continue;
    _ray.origin.copy(_lo); _ray.direction.subVectors(_le, _lo).multiplyScalar(1 / len);
    const G = gridOf(g), side = m.material.side ?? THREE.FrontSide;
    if (++G.pass === 0xffffffff) { G.stamp.fill(0); G.pass = 1; }
    const test = (tri) => {
      if (G.stamp[tri] === G.pass) return;
      G.stamp[tri] = G.pass;
      const pa = G.v(tri * 3), pb = G.v(tri * 3 + 1), pc = G.v(tri * 3 + 2);
      _a.fromBufferAttribute(G.pos, pa); _b.fromBufferAttribute(G.pos, pb); _c.fromBufferAttribute(G.pos, pc);
      const p = side === THREE.BackSide ? _ray.intersectTriangle(_c, _b, _a, true, _hit) : _ray.intersectTriangle(_a, _b, _c, side === THREE.FrontSide, _hit);
      if (!p) return;
      const d = origin.distanceTo(_hit.applyMatrix4(m.matrixWorld));
      if (d <= far && d < best) best = d;
    };
    for (const tri of G.big) test(tri);
    const i0 = Math.floor(Math.min(_lo.x, _le.x) / CELL), i1 = Math.floor(Math.max(_lo.x, _le.x) / CELL);
    const j0 = Math.floor(Math.min(_lo.z, _le.z) / CELL), j1 = Math.floor(Math.max(_lo.z, _le.z) / CELL);
    // (a segment crossing more cells than that is longer than this is made for: every triangle in reach is tested)
    if (!((i1 - i0 + 1) * (j1 - j0 + 1) <= 4096)) { for (const list of G.cells.values()) for (const tri of list) test(tri); continue; }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const list = G.cells.get(key(i, j)); if (!list) continue;
      for (const tri of list) test(tri);
    }
  }
  return best < Infinity ? best : null;
}

// Whether any surface of `meshes` is within `radius` of the point `p` – the camera's own room: its near plane reaches
// ~0.3 m from it (0.3 m away, 58° tall, up to 1.8 : 1 wide), so nothing may be nearer than that or it's cut open on
// screen. Exact for what the grid covers (every triangle near, whatever its side); the rest (instanced, several
// materials, …) by three.js' raycast in 26 directions.
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _tri = new THREE.Triangle(), _w = new THREE.Vector3();
const DIRS = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) DIRS.push(new THREE.Vector3(x, y, z).normalize());
export function clearAround(meshes, p, radius) {
  const r2 = radius * radius;
  for (const m of meshes) {
    if (!m?.isMesh || !m.material) continue;
    const g = m.geometry;
    if (!plain(m, g)) {
      for (const d of DIRS) { _rc.set(p, d); _rc.far = radius; _hits.length = 0; m.raycast(_rc, _hits); if (_hits.some((h) => h.distance <= radius)) return false; }
      continue;
    }
    _sphere.copy(sphereOf(g)).applyMatrix4(m.matrixWorld);
    if (p.distanceTo(_sphere.center) > _sphere.radius + radius) continue;
    // the point and the room round it in the mesh's own space (its scale may differ by axis: the largest)
    _inv.copy(m.matrixWorld).invert();
    _p.copy(p).applyMatrix4(_inv);
    const rl = radius * _inv.getMaxScaleOnAxis(), G = gridOf(g), pos = G.pos;
    const near = (tri) => {
      const pa = G.v(tri * 3), pb = G.v(tri * 3 + 1), pc = G.v(tri * 3 + 2);
      const y0 = Math.min(pos.getY(pa), pos.getY(pb), pos.getY(pc)), y1 = Math.max(pos.getY(pa), pos.getY(pb), pos.getY(pc));
      if (y0 > _p.y + rl || y1 < _p.y - rl) return false;
      _tri.a.fromBufferAttribute(pos, pa).applyMatrix4(m.matrixWorld); _tri.b.fromBufferAttribute(pos, pb).applyMatrix4(m.matrixWorld); _tri.c.fromBufferAttribute(pos, pc).applyMatrix4(m.matrixWorld);
      return _tri.closestPointToPoint(p, _w).distanceToSquared(p) <= r2;
    };
    for (const tri of G.big) if (near(tri)) return false;
    for (let i = Math.floor((_p.x - rl) / CELL); i <= Math.floor((_p.x + rl) / CELL); i++)
      for (let j = Math.floor((_p.z - rl) / CELL); j <= Math.floor((_p.z + rl) / CELL); j++) {
        const list = G.cells.get(key(i, j)); if (!list) continue;
        for (const tri of list) if (near(tri)) return false;
      }
  }
  return true;
}

// Where the chase camera can stand, looking at `head` (the point over the car it keeps in view) from `r` m out at
// azimuth `az` and elevation `el` (+ `lift`, the caller's eased value). Three things must hold where it ends up:
//   1. the line to the car is clear – tested along the centre and four lines `radius` to the sides, above and below,
//      the camera `gap` short of the first thing any of them meets: never beyond it (the old rule kept at least 3 m,
//      which put it behind a wall 1.5 m away);
//   2. no surface within `radius` of the camera itself (clearAround: its near plane would cut into it);
//   3. at least `ground` m over the ground (groundAt(x, z) → height or null).
// Each candidate spot is checked for all three as it stands – nothing is moved after the check. The search, bounded:
// at the eased elevation as far out as the line is clear; when that point is under the ground, higher up – the
// elevation that puts it `ground` m over the ground there, as the old ground lift did (a few rounds, the ground
// changes as it rises) –; then nearer in along the line (steps over its length) until 2 and 3 hold. The spot furthest
// out of those wins. When nothing holds all three (a car under a low roof on a bank), the spot that keeps 1 and 2 and
// comes highest over the ground is taken and `safe` is false (the caller counts it).
// Separately, `lift` returned: the elevation to ease towards – none if the view is clear enough at the set elevation,
// else the first of `lifts` (radians added) at which it is `near` m or more out, rising over an obstacle as a crane
// shot would, else the one that gets furthest out.
// Returns { pos, lift, safe }.
const _d = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _o = new THREE.Vector3(), _f = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
// how far from `from` towards `to` the camera can go (m)
export function clearReach(meshes, from, to, radius = 0.35, gap = 0.6) {
  const len = _d.subVectors(to, from).length(); if (len < 1e-6) return 0;
  _d.multiplyScalar(1 / len);
  _r.crossVectors(_d, UP); if (_r.lengthSq() < 1e-8) _r.set(1, 0, 0); _r.normalize();
  _u.crossVectors(_r, _d).normalize();
  let hit = firstHit(meshes, from, _d, len);
  for (const [sr, su] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    _o.copy(from).addScaledVector(_r, sr * radius).addScaledVector(_u, su * radius);
    const h = firstHit(meshes, _o, _d, len);
    if (h != null && (hit == null || h < hit)) hit = h;
  }
  return hit == null ? len : Math.max(0, hit - gap);
}
// the point at elevation `el`, azimuth `az`, `r` from `head` (as the chase camera's sphere)
const onSphere = (head, az, el, r, out) => out.set(head.x + Math.sin(az) * Math.cos(el) * r, head.y + Math.sin(el) * r, head.z + Math.cos(az) * Math.cos(el) * r);
export function chasePlace(meshes, head, az, el, r, { lift = 0, lifts = [0.35, 0.7, 1.05], near = 2.5, radius = 0.35, gap = 0.6, groundAt = null, ground = 1.4, maxEl = 1.35 } = {}) {
  const reachAt = (e) => { onSphere(head, az, Math.min(maxEl, e), r, _f); return Math.min(r, clearReach(meshes, head, _f, radius, gap)); };
  // the lift wanted now: none if the view is clear enough at the set elevation, else the first that is
  let want = 0;
  const nearR = Math.min(near, r), reach0 = reachAt(el);
  if (reach0 < nearR) {
    let best = reach0;
    for (const L of lifts) { const d = reachAt(el + L); if (d >= nearR) { want = L; break; } if (d > best + 0.25) { best = d; want = L; } }
  }
  const over = (p) => { const g = groundAt ? groundAt(p.x, p.z) : null; return g == null ? Infinity : p.y - g; };
  const at = (e, s, out) => { onSphere(head, az, e, 1, _dir).sub(head); return out.copy(head).addScaledVector(_dir, s); };
  let best = null, fallback = null;
  const consider = (e, s) => {
    const p = at(e, s, new THREE.Vector3()), clear = over(p);
    if (clear >= ground - 1e-6) { if (clearAround(meshes, p, radius)) { if (!best || s > best.s) best = { s, pos: p }; return true; } return false; }
    // (clear of surfaces but under the ground margin: kept only to fall back on, the highest over the ground)
    if ((!fallback || clear > fallback.clear) && clearAround(meshes, p, radius)) fallback = { clear, pos: p };
    return false;
  };
  // from as far out as the line is clear, inwards in steps until the spot holds (2 and 3)
  const walk = (e, s0) => { const n = Math.min(24, Math.ceil(s0 / 0.25)); for (let k = 0; k <= n; k++) if (consider(e, s0 * (1 - k / n))) return; };
  const e0 = Math.min(maxEl, el + lift), s0 = e0 === Math.min(maxEl, el) ? reach0 : reachAt(e0);
  let e = e0, s = s0;
  // at the eased elevation, as far out as the line is clear – the usual case: done
  if (consider(e, s)) return { pos: best.pos, lift: want, safe: true };
  // under the ground there: higher, to `ground` over it (as far out as the line then lets it)
  for (let k = 0; k < 4 && e < maxEl; k++) {
    const p = at(e, s, _q), clear = over(p);
    if (clear >= ground) break;   // (it's what's around it, not the ground: rising doesn't help)
    const need = Math.asin(Math.max(-1, Math.min(1, (p.y - clear + ground - head.y) / Math.max(s, 0.5))));
    e = Math.min(maxEl, Math.max(need, e + 0.02)); s = reachAt(e);
    if (consider(e, s)) break;
  }
  // nearer in, at the eased elevation (and at the one it rose to)
  if (!best || best.s < nearR) { walk(e0, s0); if (e !== e0) walk(e, s); }
  if (best) return { pos: best.pos, lift: want, safe: true };
  // (nothing holds all three: what keeps the surfaces off, highest over the ground – else where the line is clear)
  return { pos: fallback ? fallback.pos : at(e0, s0, new THREE.Vector3()), lift: want, safe: false };
}
