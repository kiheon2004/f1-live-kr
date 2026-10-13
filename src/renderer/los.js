// Line of sight against the static world (buildings, stands, facilities), fast enough for every frame.
// The chase camera only needs to know whether the ~11 m between the car and the camera is clear, but three.js'
// raycaster tests every triangle of every mesh the endless ray passes near (a building chunk is tens of thousands of
// triangles): ~40 % of a frame. Here each static mesh gets a flat grid of its triangles (16 m cells, built once per
// geometry), a segment is tested only against the meshes whose bounding sphere it reaches, and only against the
// triangles in the cells it crosses. The result is the same as the raycaster's first hit within `far` (same faces:
// the material's side decides which way a triangle counts, as three.js does).
import * as THREE from "./vendor/three.module.js";

const CELL = 16, OFF = 32768;
const grids = new WeakMap();   // geometry → { cells: Map(key → triangle indices), pos, index }
const key = (i, j) => (i + OFF) * 65536 + (j + OFF);
function gridOf(g) {
  let G = grids.get(g);
  if (G) return G;
  const pos = g.attributes.position, index = g.index, n = (index ? index.count : pos.count) / 3, cells = new Map();
  const v = (k) => (index ? index.getX(k) : k);
  for (let t = 0; t < n; t++) {
    const a = v(t * 3), b = v(t * 3 + 1), c = v(t * 3 + 2);
    const x0 = Math.min(pos.getX(a), pos.getX(b), pos.getX(c)), x1 = Math.max(pos.getX(a), pos.getX(b), pos.getX(c));
    const z0 = Math.min(pos.getZ(a), pos.getZ(b), pos.getZ(c)), z1 = Math.max(pos.getZ(a), pos.getZ(b), pos.getZ(c));
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
      const k = key(i, j); let list = cells.get(k); if (!list) cells.set(k, (list = [])); list.push(t);
    }
  }
  G = { cells, pos, v, stamp: new Uint32Array(n), pass: 0 };
  grids.set(g, G);
  return G;
}

const _sphere = new THREE.Sphere(), _inv = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _lo = new THREE.Vector3(), _le = new THREE.Vector3(), _ray = new THREE.Ray(), _hit = new THREE.Vector3(), _end = new THREE.Vector3();
const _rc = new THREE.Raycaster(), _hits = [];
// The distance from `origin` along the unit vector `dir` to the first surface of `meshes` within `far`, or null.
export function firstHit(meshes, origin, dir, far) {
  let best = Infinity;
  _end.copy(origin).addScaledVector(dir, far);
  for (const m of meshes) {
    if (!m?.isMesh) continue;
    const g = m.geometry;
    // (anything not a plain static mesh – instanced, skinned, morphed – goes to three.js as before)
    if (m.isInstancedMesh || m.isSkinnedMesh || g.morphAttributes?.position?.length || !g.attributes.position) {
      _rc.set(origin, dir); _rc.far = far; _hits.length = 0; m.raycast(_rc, _hits);
      for (const h of _hits) if (h.distance <= far && h.distance < best) best = h.distance;
      continue;
    }
    if (!g.boundingSphere) g.computeBoundingSphere();
    _sphere.copy(g.boundingSphere).applyMatrix4(m.matrixWorld);
    // the segment's closest point to the sphere's centre
    const t = Math.max(0, Math.min(far, _a.subVectors(_sphere.center, origin).dot(dir)));
    if (_b.copy(origin).addScaledVector(dir, t).distanceToSquared(_sphere.center) > _sphere.radius * _sphere.radius) continue;
    // the segment in the mesh's own space
    _inv.copy(m.matrixWorld).invert();
    _lo.copy(origin).applyMatrix4(_inv); _le.copy(_end).applyMatrix4(_inv);
    const len = _lo.distanceTo(_le); if (len < 1e-9) continue;
    _ray.origin.copy(_lo); _ray.direction.subVectors(_le, _lo).multiplyScalar(1 / len);
    const G = gridOf(g), side = Array.isArray(m.material) ? THREE.DoubleSide : m.material?.side ?? THREE.FrontSide;
    if (++G.pass === 0xffffffff) { G.stamp.fill(0); G.pass = 1; }
    const i0 = Math.floor(Math.min(_lo.x, _le.x) / CELL), i1 = Math.floor(Math.max(_lo.x, _le.x) / CELL);
    const j0 = Math.floor(Math.min(_lo.z, _le.z) / CELL), j1 = Math.floor(Math.max(_lo.z, _le.z) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const list = G.cells.get(key(i, j)); if (!list) continue;
      for (const tri of list) {
        if (G.stamp[tri] === G.pass) continue;
        G.stamp[tri] = G.pass;
        const pa = G.v(tri * 3), pb = G.v(tri * 3 + 1), pc = G.v(tri * 3 + 2);
        _a.fromBufferAttribute(G.pos, pa); _b.fromBufferAttribute(G.pos, pb); _c.fromBufferAttribute(G.pos, pc);
        const p = side === THREE.BackSide ? _ray.intersectTriangle(_c, _b, _a, true, _hit) : _ray.intersectTriangle(_a, _b, _c, side === THREE.FrontSide, _hit);
        if (!p) continue;
        const d = origin.distanceTo(_hit.applyMatrix4(m.matrixWorld));
        if (d <= far && d < best) best = d;
      }
    }
  }
  return best < Infinity ? best : null;
}
