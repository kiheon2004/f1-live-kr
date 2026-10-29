// A collector of geometry pieces by material slot (v0.49 garage kit): equipment modules add boxes, cylinders, lathes and
// tubes to named slots ("steel", "rubber", "fabric", "accent", …); merge() bakes each slot into ONE BufferGeometry – a
// module, or a whole bay, draws once per material it uses, however many parts it has (the draw-call budget).
// UVs: pieces whose material repeats a tile (brushed grain, carbon weave, quilting) get box-projected UVs in metres ×
// scale, so the tile keeps its real size on every part instead of stretching 0…1 over each face.
import * as THREE from "../vendor/three.module.js";
import { mergeGeometries } from "../vendor/BufferGeometryUtils.js";

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
// metres per tile repeat for the slots whose texture tiles (others keep the primitive's own UVs)
export const UV_SCALE = { steel: 0.5, alu: 0.5, dark: 0.6, cab: 0.6, light: 0.6, carbon: 0.04, fabric: 0.12, fabricAccent: 0.12, rubber: 0.25, hose: 0.25, accent: 0.6, drawer: 0.6, plastic: 0.5 };

// box-projected UVs from positions and normals (each triangle's corner by its own normal's main axis)
export function boxUV(g, scale) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ax >= ay && ax >= az ? [p.getZ(i), p.getY(i)] : ay >= az ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u / scale; uv[i * 2 + 1] = v / scale;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}
// every merged piece has an index, position, normal and uv – nothing else (mergeGeometries needs the same set)
function tidy(g) {
  for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.index) { const n = g.attributes.position.count, idx = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
  g.morphAttributes = {}; g.clearGroups();
  return g;
}

export class Parts {
  constructor() { this.slots = new Map(); }
  // a geometry (owned by the collector: it is transformed in place and freed by merge) at x, y, z turned rx, ry, rz
  add(slot, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s);
    geo.applyMatrix4(_m);
    (this.slots.get(slot) || this.slots.set(slot, []).get(slot)).push(geo);
    return this;
  }
  addM(slot, geo, m) { geo.applyMatrix4(m); (this.slots.get(slot) || this.slots.set(slot, []).get(slot)).push(geo); return this; }
  // centre x, y, z (y: the box's middle)
  box(slot, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { return this.add(slot, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz); }
  // a cylinder along y (rx / rz turn it), centre x, y, z
  cyl(slot, r0, r1, h, seg, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, open = false) { return this.add(slot, new THREE.CylinderGeometry(r0, r1, h, Math.max(3, seg), 1, open), x, y, z, rx, ry, rz); }
  // a bar between two points (square section s, or round with seg > 0)
  bar(slot, a, b, s, seg = 0) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(); if (L < 1e-6) return this;
    const g = seg ? new THREE.CylinderGeometry(s / 2, s / 2, L, seg, 1, true) : new THREE.BoxGeometry(s, L, s);
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    _m.compose(_p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _s);
    return this.addM(slot, g, _m);
  }
  tube(slot, pts, r, seg = 24, radial = 6) {
    const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    return this.add(slot, new THREE.TubeGeometry(c, Math.max(2, seg), r, Math.max(3, radial), false));
  }
  // every piece of another collector, moved by matrix m (the bay places its modules this way)
  merge(other, m) { for (const [slot, list] of other.slots) for (const g of list) this.addM(slot, g.clone(), m); return this; }
  // one BufferGeometry per slot – Map(slot → geometry); the pieces are freed
  bake() {
    const out = new Map();
    for (const [slot, list] of this.slots) {
      if (!list.length) continue;
      const sc = UV_SCALE[slot];
      const parts = list.map((g) => { tidy(g); if (sc) boxUV(g, sc); return g; });
      const m = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
      if (parts.length > 1) for (const g of parts) g.dispose();
      m.computeBoundingBox(); m.computeBoundingSphere();
      out.set(slot, m);
    }
    this.slots.clear();
    return out;
  }
  // triangles so far (dev)
  get triangles() { let n = 0; for (const list of this.slots.values()) for (const g of list) n += (g.index ? g.index.count : g.attributes.position.count) / 3; return n; }
}
