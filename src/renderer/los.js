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
// so building the grid stays bounded by the triangle count. A geometry whose positions or index change (a new
// attribute, or one flagged needsUpdate) has its grid built again.
import * as THREE from "./vendor/three.module.js";

const CELL = 16, OFF = 32768, MAX_CELLS = 64;
const grids = new WeakMap();   // geometry → { cells: Map(key → triangle indices), big: [triangle], pos, v, stamp, pass, sig }
const key = (i, j) => (i + OFF) * 65536 + (j + OFF);
const inRange = (i) => i > -OFF && i < OFF - 1;
// (what the grid was built from: the attributes and their versions)
const sigOf = (g) => [g.attributes.position, g.attributes.position.version, g.index, g.index?.version ?? -1];
const sameSig = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
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
    if (!g.boundingSphere) g.computeBoundingSphere();
    _sphere.copy(g.boundingSphere).applyMatrix4(m.matrixWorld);
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

// Where the chase camera can stand, looking from `want` at `head` (the point over the car it keeps in view): as far
// out towards `want` as the line to it is clear. The camera isn't a point – its near plane is ~0.3 m wide either side –
// so the line is tested along the centre and four lines `radius` to the sides, above and below, and the camera stays
// `gap` short of the first thing any of them meets: never beyond it (the old rule kept at least 3 m, which put the
// camera behind a wall 1.5 m away). When that leaves it nearer than `near` m, the same distance is tried higher up –
// rising over the obstacle, as a crane shot would – `lifts` (radians added to the elevation), the first that's clear
// enough taken, else the one that gets furthest out. After that the ground: the camera at least `ground` m over it
// (groundAt(x, z) → height or null), and the line to that point tested once more.
// Returns { pos, lift } – lift: the elevation added (for the caller to ease towards rather than jump).
const _d = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _o = new THREE.Vector3(), _f = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
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
  const pos = new THREE.Vector3();
  const at = (L) => { onSphere(head, az, Math.min(maxEl, el + L), r, _f); return clearReach(meshes, head, _f, radius, gap); };
  // the lift wanted now: none if the view is clear enough at the set elevation, else the first that is
  let want = 0, reach = at(0);
  if (reach < Math.min(near, r)) {
    let best = reach;
    for (const L of lifts) { const d = at(L); if (d >= Math.min(near, r)) { want = L; break; } if (d > best + 0.25) { best = d; want = L; } }
  }
  // (placed at the lift given – the caller's eased value – and kept clear there)
  onSphere(head, az, Math.min(maxEl, el + lift), r, _f);
  let d = clearReach(meshes, head, _f, radius, gap);
  pos.copy(head).addScaledVector(_f.sub(head).normalize(), Math.min(r, d));
  const g = groundAt ? groundAt(pos.x, pos.z) : null;
  if (g != null && pos.y < g + ground) {
    pos.y = g + ground;
    _f.copy(pos); d = clearReach(meshes, head, _f, radius, gap);
    const len = _f.distanceTo(head);
    if (d < len) pos.copy(head).addScaledVector(_f.sub(head).normalize(), d);
  }
  return { pos, lift: want };
}
