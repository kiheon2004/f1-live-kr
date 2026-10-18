// Port Hercule's yachts in Grand Prix week (Monaco, F1 circuit key 22; 2025 and 2026 only). Research:
// docs/research/monaco_harbour.md – Ports de Monaco (stern-to mooring with a bow line; the semi-floating dike's yachts
// alongside; the 2026 "South Zone" on Quai Antoine 1er), race-week press (the largest yachts on "the T"), OpenStreetMap
// quay lines checked against imagery. No GP week's actual yacht list or berth plan is public: the rows below put yachts
// of each zone's typical length along its quay at the usual spacing – a reproduction of the harbour's form and density,
// never of particular yachts.
// Each yacht floats on the sea's own surface (the scene's sea level, scenery.js – not the ground's height), its hull
// checked against the map's sea (no part on land or a quay) and kept out of the fairways; bobbing a few centimetres
// with the session's time (moored: barely moving).
import * as THREE from "./vendor/three.module.js";

// Quay faces: a → b (lat, lon), the yachts' length range (m), "stern" (stern-to, bows out from the quay) or "side"
// (alongside), gap between hulls (m). The water side is found from the map's sea.
export const MONACO_BERTHS = [
  { id: "Z1 Quai des États-Unis", a: [43.73672, 7.42228], b: [43.737, 7.42493], len: [40, 75], moor: "stern", gap: 3 },
  { id: "Z2 Quai Kennedy", a: [43.73697, 7.42567], b: [43.73718, 7.42675], len: [25, 50], moor: "stern", gap: 3 },
  { id: "Z3 Quai Jarlan", a: [43.73555, 7.42189], b: [43.73672, 7.42228], len: [20, 45], moor: "stern", gap: 3 },
  { id: "Z4 the T, east face", a: [43.73412, 7.42354], b: [43.73608, 7.42297], len: [55, 80], moor: "stern", gap: 3.5 },
  { id: "Z5 central pier, west", a: [43.73696, 7.4246], b: [43.73588, 7.42483], len: [30, 50], moor: "stern", gap: 3, side: -1 },
  { id: "Z5 central pier, east", a: [43.73696, 7.4246], b: [43.73588, 7.42483], len: [30, 50], moor: "stern", gap: 3, side: 1 },
  { id: "Z6 Capitainerie pier, west", a: [43.73718, 7.42675], b: [43.73607, 7.42705], len: [30, 60], moor: "stern", gap: 3 },
  { id: "Z6 Capitainerie pier, east", a: [43.73606, 7.4274], b: [43.73713, 7.42712], len: [30, 60], moor: "stern", gap: 3 },
  { id: "Z7 Darse Nord pontoon", a: [43.7361, 7.42243], b: [43.7353, 7.42254], len: [10, 30], moor: "stern", gap: 1.5 },
  { id: "Z8 Darse Sud pontoon 1", a: [43.73407, 7.42287], b: [43.73353, 7.42302], len: [10, 25], moor: "stern", gap: 1.5 },
  { id: "Z8 Darse Sud pontoon 2", a: [43.73343, 7.42348], b: [43.7328, 7.42372], len: [10, 25], moor: "stern", gap: 1.5 },
  { id: "Z8 Darse Sud pontoon 3", a: [43.73354, 7.42387], b: [43.73287, 7.42411], len: [10, 25], moor: "stern", gap: 1.5 },
  { id: "Z9 Quai Antoine 1er finger 1", a: [43.73314, 7.42536], b: [43.73432, 7.42487], len: [10, 25], moor: "stern", gap: 1.5 },
  { id: "Z9 Quai Antoine 1er finger 2", a: [43.73326, 7.42589], b: [43.73413, 7.42557], len: [10, 25], moor: "stern", gap: 1.5 },
  { id: "Z9 Quai Antoine 1er finger 3", a: [43.73337, 7.42649], b: [43.73388, 7.42631], len: [10, 22], moor: "stern", gap: 1.5 },
  { id: "Z10 Quai Rainier 1er, west", a: [43.73391, 7.42764], b: [43.73465, 7.42744], len: [40, 90], moor: "stern", gap: 3.5 },
  { id: "Z11 Digue Rainier III", a: [43.73411, 7.42903], b: [43.73656, 7.43182], len: [70, 150], moor: "side", gap: 12 },
  { id: "Z12 Jetée Lucciana", a: [43.73726, 7.42928], b: [43.73633, 7.4298], len: [30, 50], moor: "stern", gap: 3 },
  { id: "Z13 Quai Louis II", a: [43.73713, 7.42712], b: [43.73753, 7.42912], len: [15, 40], moor: "stern", gap: 2 },
];
// open water kept clear: the central basin (its edges lined by sterns – bows may reach into its rim) and the channel from
// the entrance to the inner basin
export const MONACO_FAIRWAYS = [
  [[43.7357, 7.4250], [43.7357, 7.4268], [43.7343, 7.4268], [43.7343, 7.4237], [43.7352, 7.4237]],
  [[43.73648, 7.4309], [43.7356, 7.429], [43.73535, 7.4274], [43.7351, 7.4276], [43.73545, 7.42905], [43.7363, 7.4311]],
];
export const harbourFor = (venueKey, season) => venueKey === 22 && (season === 2025 || season === 2026);

// beam for a length (m): ~5:1 at 40–90 m (S13/S14), ~3.5:1 for boats under 20 m
export const beamOf = (L) => (L < 20 ? L / 3.5 : L < 30 ? L / 4.2 : L / 5.2 + 0.6);
const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) c = !c; } return c; };

// The yachts: toScene(lat, lon) → [x, z]; isSea(x, z) → bool (the map's sea); seed. → [{ x, z, yaw (bow direction as
// rotation.y), L, B, zone }] – deterministic.
export function layoutYachts({ toScene, isSea, seed = 22 }) {
  let r = seed >>> 0; const rnd = () => ((r = (Math.imul(r ^ (r >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296);
  const fair = MONACO_FAIRWAYS.map((P) => P.map(([la, lo]) => toScene(la, lo)));
  const out = [], hulls = [];
  const clear = (cx, cz, ux, uz, L, B, stern = false) => {
    // the hull's outline sampled (every ~4 m along, both sides): all sea, out of the fairways, clear of the others
    const n = Math.max(3, Math.ceil(L / 4));
    for (let k = 0; k <= n; k++) for (const s of [-0.5, 0, 0.5]) {
      const a = (k / n - 0.5) * L, x = cx + ux * a - uz * s * B, z = cz + uz * a + ux * s * B;
      // (the stern's first 5 m lie against the quay – the sea raster's 6 m cells read them as land)
      if (!(stern && a < -L / 2 + 5) && !isSea(x, z)) return false;
      if (fair.some((P) => inPoly(x, z, P))) return false;
    }
    return !hulls.some((h) => Math.hypot(h.x - cx, h.z - cz) < (h.L + L) / 2 && Math.abs((cx - h.x) * -uz + (cz - h.z) * ux) < (h.B + B) / 2 + 0.8 && Math.abs((cx - h.x) * ux + (cz - h.z) * uz) < (h.L + L) / 2);
  };
  for (const b of MONACO_BERTHS) {
    const [ax, az] = toScene(...b.a), [bx, bz] = toScene(...b.b), dx = bx - ax, dz = bz - az, D = Math.hypot(dx, dz); if (D < 5) continue;
    const tx = dx / D, tz = dz / D;
    // the water side: the normal whose side is sea a few metres out
    let side = b.side || 0;
    if (!side) { const mx = (ax + bx) / 2, mz = (az + bz) / 2, s1 = [3, 6, 10].filter((d) => isSea(mx - tz * d, mz + tx * d)).length, s2 = [3, 6, 10].filter((d) => isSea(mx + tz * d, mz - tx * d)).length; side = s1 >= s2 ? 1 : -1; }
    const nx = -tz * side, nz = tx * side;
    let u = 2;
    while (u < D - 2) {
      const L = b.len[0] + (b.len[1] - b.len[0]) * Math.pow(rnd(), 1.4), B = beamOf(L);
      if (b.moor === "side") {
        const cx = ax + tx * (u + L / 2) + nx * (B / 2 + 1.5), cz = az + tz * (u + L / 2) + nz * (B / 2 + 1.5);
        if (u + L <= D && clear(cx, cz, tx, tz, L, B)) { out.push({ x: cx, z: cz, yaw: Math.atan2(tx, tz), L, B, zone: b.id }); hulls.push({ x: cx, z: cz, L, B }); }
        u += L + b.gap; continue;
      }
      // stern-to: the stern 1.5 m off the quay (the passerelle), the bow out over the water; shortened to fit if needed
      let placed = false;
      for (let LL = L; LL >= b.len[0] && !placed; LL *= 0.85) {
        const BB = beamOf(LL), cx = ax + tx * (u + BB / 2) + nx * (1.5 + LL / 2), cz = az + tz * (u + BB / 2) + nz * (1.5 + LL / 2);
        if (clear(cx, cz, nx, nz, LL, BB, true)) { out.push({ x: cx, z: cz, yaw: Math.atan2(nx, nz), L: LL, B: BB, zone: b.id }); hulls.push({ x: cx, z: cz, L: LL, B: BB }); placed = true; u += BB + b.gap; }
      }
      if (!placed) u += 4;
    }
  }
  return out;
}

// ---------- the yachts' models ----------
// One template (length 1, its bow along +z, waterline at y = 0): a hull with a raked bow and a flat transom, decks
// stepping back above it with dark glass; small boats (under 20 m) a lower one-deck cabin. Instanced, scaled per yacht.
function hullGeometry() {
  const pos = [], idx = [], N = 14, R = 10;
  // sections from stern (z −0.5) to bow (+0.5): half beam, freeboard (above water), keel depth
  const sec = (k) => { const z = -0.5 + k / N, f = k / N; const hw = 0.5 * (f < 0.6 ? 1 : Math.cos(((f - 0.6) / 0.4) * Math.PI / 2) ** 0.8 + 0.02); return { z, hw, top: 0.075 + 0.02 * f * f, keel: -0.04 * (f < 0.85 ? 1 : (1 - f) / 0.15) }; };
  for (let k = 0; k <= N; k++) { const s = sec(k); for (let j = 0; j <= R; j++) { const a = (j / R) * Math.PI; pos.push(-Math.cos(a) * s.hw, s.top - (s.top - s.keel) * Math.sin(a), s.z); } }
  for (let k = 0; k < N; k++) for (let j = 0; j < R; j++) { const a = k * (R + 1) + j, b = a + R + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  // the deck: a lid over the top edge
  const base = pos.length / 3;
  for (let k = 0; k <= N; k++) { const s = sec(k); pos.push(-s.hw, s.top, s.z, s.hw, s.top, s.z); }
  for (let k = 0; k < N; k++) { const a = base + k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  // the transom
  const t0 = pos.length / 3, s0 = sec(0); pos.push(-s0.hw, s0.top, s0.z, s0.hw, s0.top, s0.z, -s0.hw, s0.keel, s0.z, s0.hw, s0.keel, s0.z); idx.push(t0, t0 + 1, t0 + 2, t0 + 1, t0 + 3, t0 + 2);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const box = (w, h, l, x, y, z) => new THREE.BoxGeometry(w, h, l).translate(x, y, z);
  const merge = (gs) => { const parts = gs.map((g) => g.toNonIndexed()), out = new THREE.BufferGeometry(); for (const k of ["position", "normal"]) { const arr = new Float32Array(parts.reduce((a, g) => a + g.attributes[k].array.length, 0)); let o = 0; for (const g of parts) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; } out.setAttribute(k, new THREE.BufferAttribute(arr, 3)); } return out; };
  // decks (length fraction, height above the hull's top, set back from the bow) – superstructure 60–70 % of the length
  const decks = merge([box(0.78, 0.055, 0.6, 0, 0.11, -0.06), box(0.66, 0.05, 0.42, 0, 0.162, -0.1), box(0.52, 0.045, 0.24, 0, 0.21, -0.12)]);
  const glass = merge([box(0.8, 0.026, 0.58, 0, 0.115, -0.06), box(0.68, 0.024, 0.4, 0, 0.165, -0.1), box(0.54, 0.02, 0.22, 0, 0.212, -0.12)]);
  const cabin = merge([box(0.6, 0.07, 0.36, 0, 0.115, -0.08)]), cabinGlass = merge([box(0.62, 0.03, 0.3, 0, 0.12, -0.07)]);
  const mat = (c, r = 0.4, m = 0.1) => Object.assign(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }), { userData: { shared: true } });
  SHARED = { hull: hullGeometry(), decks, glass, cabin, cabinGlass, white: Object.assign(mat("#f2f3f1", 0.35), { side: THREE.DoubleSide }), dark: mat("#16202a", 0.08, 0.5), hullDark: mat("#d9dcdb", 0.3) };
  for (const g of [SHARED.hull, SHARED.decks, SHARED.glass, SHARED.cabin, SHARED.cabinGlass]) g.userData.shared = true;
  return SHARED;
}
// The yachts as instanced meshes: { group, update(t (s)) } – their bobbing from the session's time
export function yachtMeshes(list, seaY) {
  const S = shared(), group = new THREE.Group(); group.name = "yachts";
  const big = list.filter((y) => y.L >= 20), small = list.filter((y) => y.L < 20);
  const mk = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.count = n; m.castShadow = n > 0; m.receiveShadow = true; group.add(m); return m; };
  const parts = [[S.hull, S.white, list], [S.decks, S.white, big], [S.glass, S.dark, big], [S.cabin, S.white, small], [S.cabinGlass, S.dark, small]].map(([g, m, l]) => ({ mesh: mk(g, m, l.length), list: l }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let shown = null;
  const update = (t) => {
    const k = Math.round(t * 4) / 4; if (k === shown) return; shown = k;
    for (const { mesh, list: l } of parts) {
      l.forEach((y, i) => {
        const bob = 0.03 * Math.sin(k * 0.6 + y.x * 0.07) * Math.min(1, 20 / y.L);
        q.setFromAxisAngle(up, y.yaw); p.set(y.x, seaY + bob, y.z); sc.set(y.B, y.L, y.L); m4.compose(p, q, sc); mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    }
  };
  update(0);
  return { group, update, count: list.length };
}
