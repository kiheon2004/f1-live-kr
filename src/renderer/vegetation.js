// Vegetation shapes for the real surroundings (v0.53, request §11 – "no repeated cone trees up close; species / crowns /
// heights / clusters"). Out of scenery.js so the shapes, the species mix and the stand pattern can be checked in node
// (test/vegetation53.test.js).
//
// Before v0.53 every broadleaf tree was the same four-lobe crown and every conifer the same three tiers, each instance
// only scaled and turned; the crowns' shading noise was drawn per face corner, so each 20-face lobe read as a cut gem
// (Hungary 2025, shots gfx_sv_hun_8 / _11). Now:
//   – seven archetypes, by crown form, not by botanical name (no species is mapped – OSM's leaf_type is too sparse):
//       round   broad, rounded crown on a short trunk (oak, maple, lime in the open)
//       oval    taller, narrower crown (lime, hornbeam, poplar-like in rows and woods)
//       spread  wide, flat-topped crown high on a bare trunk (plane trees, the Mediterranean stone pine)
//       spruce  three ragged tiers (spruce / fir, the v0.52 conifer)
//       slender narrow column (cypress, Lombardy-poplar-like; common round Mediterranean circuits)
//       palm, shrub (as before)
//   – trunk and crown in ONE geometry (the trunk's vertices marked `bark`, its own colour kept from the instance's tint by
//     a two-line shader change): seven instanced meshes a chunk as before (trunk, broad, conTrunk, conifer, palmTrunk,
//     palmTop, shrub) – the extra crown forms cost no draw calls
//   – stands, not salt-and-pepper: the form is drawn per 45 m cell (70 % of a cell's trees share its form) and a cell's
//     trees share an age (height × 0.85–1.15) – woods read as groups of similar trees, as planted / grown woods are
//   – the crown's light-to-dark shading and its noise keyed to the vertex's place (shared corners shade alike), not per
//     face corner: soft masses instead of facets, at no cost
// Triangles a tree (trunk included): round 90, oval 90, spread 90, spruce 60, slender 40, palm 94, shrub 40 – as the v0.52
// forms they replace (broad 80 + trunk 10, conifer 50 + 10, palm 54 + 40, shrub 40).
// All procedural – no assets.
import * as THREE from "./vendor/three.module.js";

export function rand(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// a cell's own number in [0, 1) (integer cell coordinates, a salt)
export function cellHash(i, j, salt = 0) { let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

const key3 = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
function noisy(geo, amount, seed) {
  const r = rand(seed), p = geo.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = key3(p.getX(i), p.getY(i), p.getZ(i));   // keep shared corners shared
    if (!seen.has(key)) seen.set(key, 1 + (r() - 0.5) * amount);
    const k = seen.get(key); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}
// [geometry, x, y, z, sx, sy, sz, bark] → one non-indexed geometry (position, normal, bark)
function merge(list) {
  const pos = [], nor = [], bark = [], v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const [g0, x, y, z, sx = 1, sy = sx, sz = sx, b = 0] of list) {
    const g = g0.index ? g0.toNonIndexed() : g0, m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    nm.getNormalMatrix(m); const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); bark.push(b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("bark", new THREE.Float32BufferAttribute(bark, 1));
  return g;
}
// Foliage reads as soft masses, not facets: normals pulled out from the crown's middle, colour running from shadowed
// underneath to sunlit on top with a little noise – both keyed to the vertex's place. Bark keeps its own colour.
const BARK = new THREE.Color(0x5a4330), PALM_BARK = new THREE.Color(0x8a7458), CON_BARK = new THREE.Color(0x4d3a2a);
function soften(g, cy, rad, k = 0.85, bark = BARK, seed = 31) {
  const p = g.attributes.position, nrm = g.attributes.normal, b = g.attributes.bark, col = [], v = new THREE.Vector3(), nn = new THREE.Vector3(), noise = new Map(), rr = rand(seed);
  for (let i = 0; i < p.count; i++) {
    if (b.getX(i) > 0.5) { col.push(bark.r, bark.g, bark.b); continue; }
    v.set(p.getX(i), p.getY(i) - cy, p.getZ(i)).normalize();
    nn.fromBufferAttribute(nrm, i).lerp(v, k).normalize(); nrm.setXYZ(i, nn.x, nn.y, nn.z);
    const key = key3(p.getX(i), p.getY(i), p.getZ(i)); if (!noise.has(key)) noise.set(key, (rr() - 0.5) * 0.1);
    const h = Math.max(0, Math.min(1, (p.getY(i) - (cy - rad)) / (2 * rad)));
    const s = 0.5 + 0.5 * Math.pow(h, 0.8) + noise.get(key);
    col.push(s, s, s);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

// ---- the archetypes (metres; a tree's base at y 0; sizes before the instance's own scale) ----
export const SPECIES = ["round", "oval", "spread", "spruce", "slender", "palm", "shrub"];
let VEG = null;
export function vegGeometries() {
  if (VEG) return VEG;
  const lobe = (seed) => noisy(new THREE.IcosahedronGeometry(1, 0), 0.3, seed);   // 20 faces each: thousands of trees stay cheap
  const trunk = (h, r0, r1, seg = 5) => { const t = new THREE.CylinderGeometry(r1, r0, h, seg, 1, true); t.translate(0, h / 2, 0); return t; };
  // (v0.52, request §11: the tiers' rims 9-gons, each corner pulled in or out and dropped – a ragged, drooping edge)
  const tier = (r, h, n, seed) => { const g = new THREE.ConeGeometry(r, h, n), p = g.attributes.position, rr = rand(seed), k = new Map();
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > -h / 2 + 1e-4) continue; const key = p.getX(i).toFixed(3) + "," + p.getZ(i).toFixed(3);
      if (!k.has(key)) k.set(key, [0.8 + rr() * 0.4, -rr() * 0.22 * h]); const [f, dy] = k.get(key); p.setXYZ(i, p.getX(i) * f, y + dy, p.getZ(i) * f); }
    g.computeVertexNormals(); return g; };
  const round = soften(merge([[trunk(4, 0.38, 0.22), 0, 0, 0, 1, 1, 1, 1],
    [lobe(1), 0, 5.4, 0, 2.6, 2.2, 2.6], [lobe(2), 1.5, 4.6, 0.6, 1.8], [lobe(3), -1.3, 4.8, -0.7, 1.9], [lobe(4), 0.2, 6.6, -0.3, 1.6]]), 5.4, 3.4);
  const oval = soften(merge([[trunk(4.6, 0.32, 0.2), 0, 0, 0, 1, 1, 1, 1],
    [lobe(41), 0, 5.8, 0, 1.9, 2.5, 1.9], [lobe(42), 0.35, 7.9, 0.2, 1.55, 2.0, 1.55], [lobe(43), -0.55, 4.9, -0.35, 1.5, 1.3, 1.5], [lobe(44), 0.1, 9.6, -0.1, 1.05, 1.3, 1.05]]), 7.2, 4.2);
  const spread = soften(merge([[trunk(5.8, 0.36, 0.24), 0, 0, 0, 1, 1, 1, 1],
    [lobe(51), 0, 6.9, 0, 3.3, 1.35, 3.3], [lobe(52), 2.3, 6.4, 0.9, 2.0, 1.05, 2.0], [lobe(53), -2.1, 6.5, -1.0, 2.1, 1.1, 2.1], [lobe(54), 0.6, 7.6, -1.7, 1.8, 0.95, 1.8]]), 6.6, 3.2, 0.8);
  const spruce = soften(merge([[trunk(3, 0.3, 0.18), 0, 0, 0, 1, 1, 1, 1],
    [tier(2.6, 4.2, 9, 21), 0, 4.2, 0], [tier(2.0, 3.6, 9, 22), 0, 6.3, 0], [tier(1.3, 3.0, 7, 23), 0, 8.2, 0]]), 5.6, 4.6, 0.78, CON_BARK);
  const slender = soften(merge([[trunk(1.8, 0.24, 0.16), 0, 0, 0, 1, 1, 1, 1],
    [tier(1.15, 7.2, 8, 61), 0, 4.7, 0], [tier(0.75, 3.2, 7, 62), 0, 8.6, 0]]), 5.4, 4.6, 0.7, CON_BARK);
  // palm: a gently leaning, ringed trunk and 9 fronds arching down from the top
  const palmTrunk = new THREE.CylinderGeometry(0.17, 0.26, 9, 5, 4, true);
  { const p = palmTrunk.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 4.5; p.setX(i, p.getX(i) + 0.012 * y * y); } palmTrunk.translate(0, 4.5, 0); palmTrunk.computeVertexNormals(); }
  const fronds = [[palmTrunk, 0, 0, 0, 1, 1, 1, 1]];
  for (let k = 0; k < 9; k++) {
    const f = new THREE.PlaneGeometry(0.9, 3.4, 1, 3); f.rotateX(-Math.PI / 2); f.translate(0, 0, 1.7);
    const p = f.attributes.position;
    for (let i = 0; i < p.count; i++) { const zz = p.getZ(i); p.setY(i, -0.12 * zz * zz + 0.25 * zz); p.setX(i, p.getX(i) * (1 - zz / 4)); }
    f.rotateY((k / 9) * Math.PI * 2 + (k % 2) * 0.2); f.computeVertexNormals();
    fronds.push([f, 0.97, 9, 0]);
  }
  const palm = soften(merge(fronds), 9, 2, 0.4, PALM_BARK);
  const shrub = soften(merge([[lobe(7), 0, 0.7, 0, 1.3, 0.8, 1.3], [lobe(8), 0.7, 0.55, 0.3, 0.8]]), 0.7, 1.1);
  const rock = noisy(new THREE.IcosahedronGeometry(1, 1), 0.55, 11); rock.scale(1, 0.62, 0.9); rock.translate(0, 0.25, 0);
  VEG = { round, oval, spread, spruce, slender, palm, shrub, rock };
  return VEG;
}

// The mix by latitude (|lat|°): palms near the tropics and in the desert, more conifers away from them; round the
// Mediterranean (30–44.5°: Monaco, Barcelona, Imola – not Monza's park at 45.6°) more umbrella-shaped and columnar
// trees, further north more spruce and rounded crowns. Shares of all trees; the rest round / oval. (A rule of thumb from the climate zones, not a survey of each venue.)
export function speciesMix(lat) {
  const a = Math.abs(lat), med = a >= 30 && a <= 44.5;
  const palm = a < 8 ? 0.22 : a < 27 ? 0.55 : a < 34 ? 0.12 : 0, conifer = a > 40 ? 0.4 : a > 30 ? 0.18 : 0.04;
  const slender = conifer * (med ? 0.5 : 0.15), spruce = conifer - slender, broad = Math.max(0, 1 - palm - conifer);
  const spread = broad * (med ? 0.32 : 0.14), oval = broad * 0.3, round = broad - spread - oval;
  return { palm, spruce, slender, spread, oval, round };
}
const ORDER = ["palm", "spruce", "slender", "spread", "oval", "round"];
// A tree's form at (x, z): its 45 m cell's own form for 70 % of the trees in it, else one of its own – both drawn from
// the mix. `u` the tree's own random number, `v` another; shrubs stay shrubs.
export const STAND = 45;
export function speciesAt(x, z, mix, u, v) {
  const cu = cellHash(Math.floor(x / STAND), Math.floor(z / STAND), 7), w = v < 0.7 ? cu : u;
  let acc = 0; for (const k of ORDER) { acc += mix[k]; if (w < acc) return k; }
  return "round";
}
// a stand's age: one height factor for the trees of a cell (0.85–1.15)
export const standHeight = (x, z) => 0.85 + 0.3 * cellHash(Math.floor(x / STAND), Math.floor(z / STAND), 11);

// A tree's tint (multiplied with the crown's own shading; bark untouched): hue / saturation / lightness by form
export function treeTint(kind, r, col = new THREE.Color()) {
  if (kind === "round") return col.setHSL(0.21 + r() * 0.09, 0.34 + r() * 0.22, 0.22 + r() * 0.12);
  if (kind === "oval") return col.setHSL(0.19 + r() * 0.08, 0.38 + r() * 0.2, 0.25 + r() * 0.1);
  if (kind === "spread") return col.setHSL(0.24 + r() * 0.08, 0.26 + r() * 0.18, 0.2 + r() * 0.09);
  if (kind === "spruce") return col.setHSL(0.29 + r() * 0.06, 0.3 + r() * 0.18, 0.17 + r() * 0.08);
  if (kind === "slender") return col.setHSL(0.3 + r() * 0.05, 0.32 + r() * 0.14, 0.13 + r() * 0.06);
  if (kind === "palm") return col.setHSL(0.23 + r() * 0.07, 0.42 + r() * 0.2, 0.26 + r() * 0.1);
  return col.setHSL(0.2 + r() * 0.1, 0.28 + r() * 0.2, 0.24 + r() * 0.1);
}

// The material: vertex colours (the crown's shading, the bark's colour) × the instance's tint – on the crown only.
// (three's color_vertex chunk with its instance line changed; one program for all trees, compiled with the scenery)
const COLOR_VERTEX = `#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= mix( instanceColor.rgb, vec3( 1.0 ), bark );
#endif`;
export function treeMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, vertexColors: true, ...opts });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace("#include <color_pars_vertex>", "#include <color_pars_vertex>\nattribute float bark;").replace("#include <color_vertex>", COLOR_VERTEX);
  };
  m.customProgramCacheKey = () => "tree-bark-v53";
  return m;
}
