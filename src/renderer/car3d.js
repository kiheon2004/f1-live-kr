// A 2026-regulation Formula 1 car for the 3D view (nose towards +Z, ground at y = 0, metres).
// Dimensions from the 2026 technical rules: 3.4 m wheelbase, 1.9 m overall width, front wing 100 mm
// narrower with three elements on twin pylons, no front wheel arches, wake-control boards ahead of the
// sidepods, rear wing with three elements on twin pylons, no beam wing, endplate lights, smaller tyres
// (18-inch, ~705 mm front / ~710 mm rear). Active aero: the upper flaps of both wings open on straights.
//
// The bodywork is lofted from rounded cross-sections (smooth surfaces rather than boxes) and carries a
// livery texture per car: the team's 2026 colours and the car number. Shared geometry is built once.
import * as THREE from "./vendor/three.module.js";

export const WHEELBASE = 3.4;
const FZ = 1.75, RZ = FZ - WHEELBASE;          // front / rear axle positions along the car
const FR = 0.353, RR = 0.355;                  // tyre radii
const FW = 0.30, RW = 0.37;                    // tyre widths
const FX = 0.95 - FW / 2, RX = 0.95 - RW / 2;  // wheel centres: outer tyre faces at the 1.9 m limit

// Driver's eye and the broadcast "T-cam" (on top of the airbox) in car coordinates.
export const EYE = new THREE.Vector3(0, 0.84, -0.02);
export const TCAM = new THREE.Vector3(0, 1.08, -0.3);

// ---------- lofting ----------
// A section is [z, cy, halfWidth, halfHeight, cx = 0, power = 2.6] – a superellipse ring.
// Returns a smooth BufferGeometry with UVs: u along the car (0 = rear, 1 = front), v round the ring
// (0 at the bottom, 0.25 on the left, 0.5 on top, 0.75 on the right).
function loft(sections, ring = 24, uRange = [-2.6, 2.6], capEnds = true) {
  const pos = [], uv = [], idx = [];
  const n = sections.length;
  for (const [z, cy, hw, hh, cx = 0, pw = 2.6] of sections) {
    for (let k = 0; k <= ring; k++) {
      const a = (k / ring) * Math.PI * 2 - Math.PI / 2;        // starts at the bottom
      const c = Math.cos(a), s = Math.sin(a);
      const x = cx + hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / pw), y = cy + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / pw);
      pos.push(x, y, z);
      uv.push((z - uRange[0]) / (uRange[1] - uRange[0]), 1 - k / ring);   // mirrored so v grows from the right side round
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < ring; k++) {
    const a = i * (ring + 1) + k, b = a + ring + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  if (capEnds) for (const [i, flip] of [[0, true], [n - 1, false]]) {
    const base = pos.length / 3, [z, cy, , , cx = 0] = sections[i];
    pos.push(cx, cy, z); uv.push(...uv.slice(i * (ring + 1) * 2, i * (ring + 1) * 2 + 2));
    for (let k = 0; k < ring; k++) { const a = i * (ring + 1) + k; idx.push(...(flip ? [base, a + 1, a] : [base, a, a + 1])); }
  }
  // sections run rear → front and the ring goes bottom → left → top: this winding faces outwards
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// A thin wing element: an airfoil-ish slab (rounded leading edge, thin trailing edge) spanning ±span/2
// at height y, leading edge at z, chord c, angle `aoa` (rad, leading edge up), dipping `dip` at the centre.
function wingElement(span, chord, thick, y, z, aoa = 0.12, dip = 0, segs = 16) {
  const prof = [[0, 0], [0.04, 0.55], [0.18, 0.9], [0.45, 1], [0.8, 0.55], [1, 0.08]];   // upper surface (fraction of chord, of thickness)
  const lower = [[1, -0.02], [0.6, -0.25], [0.25, -0.35], [0.06, -0.3], [0, 0]];
  const ring = [...prof, ...lower];
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const x = -span / 2 + (span * i) / segs, f = 1 - Math.pow(Math.abs(x) / (span / 2), 2);
    const yc = y - dip * Math.max(0, f);
    for (const [cf, tf] of ring) {
      const lz = -cf * chord, ly = tf * thick;
      pos.push(x, yc + ly * Math.cos(aoa) - lz * Math.sin(aoa), z + lz * Math.cos(aoa) + ly * Math.sin(aoa));
    }
  }
  const R = ring.length;
  for (let i = 0; i < segs; i++) for (let k = 0; k < R; k++) {
    const a = i * R + k, b = a + R, a1 = i * R + ((k + 1) % R), b1 = a1 + R;
    idx.push(a, a1, b, a1, b1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const boxAt = (w, h, l, x, y, z, rx = 0, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, l); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
const rod = (a, b, r = 0.012) => {   // a thin cylinder between two points
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, 6); g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q); g.translate(A.x, A.y, A.z); return g;
};
// Merge geometries (all converted to non-indexed, keeping uv when every part has one).
function merge(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const withUv = parts.every((g) => g.attributes.uv);
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", ...(withUv ? ["uv"] : [])]) {
    const size = parts[0].attributes[name].itemSize, total = parts.reduce((a, g) => a + g.attributes[name].count * size, 0);
    const arr = new Float32Array(total); let o = 0;
    for (const g of parts) { arr.set(g.attributes[name].array, o); o += g.attributes[name].count * size; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}
const mirrorX = (g) => { const m = g.clone(); m.scale(-1, 1, 1); const idx = m.index; if (idx) { const a = idx.array; for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]]; } else { const p = m.attributes.position.array; for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) [p[i + 3 + k], p[i + 6 + k]] = [p[i + 6 + k], p[i + 3 + k]]; } m.computeVertexNormals(); return m; };

// ---------- the shared template ----------
let T = null;
function template() {
  if (T) return T;
  // body: nose → survival cell → cockpit → airbox/engine cover → tail (sections listed nose first)
  const body = loft([
    [2.42, 0.2, 0.05, 0.035], [2.3, 0.22, 0.085, 0.06], [2.0, 0.265, 0.12, 0.09], [1.6, 0.33, 0.175, 0.14],
    [1.2, 0.4, 0.235, 0.19], [0.75, 0.44, 0.285, 0.2], [0.35, 0.43, 0.31, 0.19], [-0.1, 0.45, 0.33, 0.21],
    [-0.4, 0.55, 0.33, 0.31], [-0.75, 0.57, 0.29, 0.33], [-1.2, 0.5, 0.22, 0.26], [-1.65, 0.43, 0.15, 0.19],
    [-2.1, 0.36, 0.085, 0.11], [-2.42, 0.32, 0.05, 0.06],
  ].reverse(), 28);
  // sidepods (left; the right is a mirror): inlet, a deep undercut and the coke-bottle taper to the floor
  const podL = loft([
    [0.62, 0.38, 0.13, 0.12, 0.5, 3], [0.45, 0.39, 0.17, 0.15, 0.52, 3], [0.0, 0.37, 0.18, 0.16, 0.5, 2.8], [-0.5, 0.33, 0.17, 0.15, 0.46, 2.6],
    [-1.0, 0.28, 0.13, 0.12, 0.38], [-1.45, 0.23, 0.08, 0.08, 0.27], [-1.7, 0.2, 0.04, 0.05, 0.2],
  ].reverse(), 20);
  const podR = mirrorX(podL);
  // floor: a plate with the outline of the 2026 floor (narrower, shorter) and a raised edge
  const fl = new THREE.Shape();
  [[0.22, 1.25], [0.6, 0.75], [0.74, 0.45], [0.74, -0.9], [0.66, -1.35], [0.5, -1.62], [0.5, -2.25], [-0.5, -2.25], [-0.5, -1.62], [-0.66, -1.35], [-0.74, -0.9], [-0.74, 0.45], [-0.6, 0.75], [-0.22, 1.25]]
    .forEach(([x, z], i) => (i ? fl.lineTo(x, -z) : fl.moveTo(x, -z)));
  const floor = new THREE.ExtrudeGeometry(fl, { depth: 0.05, bevelEnabled: false }); floor.rotateX(Math.PI / 2); floor.translate(0, 0.085, 0);
  const diffuser = boxAt(0.95, 0.02, 0.45, 0, 0.16, -2.05, 0.32);
  // front wing: three elements on twin pylons, endplates, no wheel arches
  const fwSpan = 1.72;
  const fw = [wingElement(fwSpan, 0.3, 0.035, 0.08, 2.72, 0.06, 0.025), wingElement(fwSpan - 0.06, 0.17, 0.028, 0.14, 2.5, 0.22, 0.02), wingElement(fwSpan - 0.12, 0.12, 0.024, 0.19, 2.36, 0.38, 0.015)];
  const fwFixed = merge([fw[0], boxAt(0.012, 0.16, 0.32, 0.07, 0.16, 2.48), boxAt(0.012, 0.16, 0.32, -0.07, 0.16, 2.48)]);
  const fwPlates = merge([boxAt(0.012, 0.27, 0.62, fwSpan / 2, 0.16, 2.48), boxAt(0.012, 0.27, 0.62, -fwSpan / 2, 0.16, 2.48)]);
  // wake-control boards ahead of the sidepods, and the front brake ducts
  const boards = merge([boxAt(0.01, 0.22, 0.35, 0.56, 0.24, 0.92, 0, 0.12), boxAt(0.01, 0.22, 0.35, -0.56, 0.24, 0.92, 0, -0.12)]);
  // rear wing: main plane + two active flaps on twin pylons, endplates with lights; crash structure; no beam wing
  const rwSpan = 0.98;
  const rwMain = wingElement(rwSpan, 0.27, 0.04, 0.82, -2.08, 0.12, 0);
  const rwFlap1 = wingElement(rwSpan - 0.02, 0.17, 0.028, 0.94, -2.2, 0.42, 0), rwFlap2 = wingElement(rwSpan - 0.04, 0.12, 0.024, 1.01, -2.3, 0.62, 0);
  const rwPlates = merge([boxAt(0.012, 0.66, 0.7, rwSpan / 2 + 0.006, 0.72, -2.24), boxAt(0.012, 0.66, 0.7, -rwSpan / 2 - 0.006, 0.72, -2.24)]);
  const rwPylons = merge([boxAt(0.012, 0.5, 0.12, 0.05, 0.6, -2.28), boxAt(0.012, 0.5, 0.12, -0.05, 0.6, -2.28), boxAt(0.12, 0.12, 0.36, 0, 0.33, -2.42), boxAt(0.6, 0.012, 0.06, 0, 0.5, -2.32)]);
  // suspension (wishbones and push/pull rods), mirrors, halo, steering wheel, T-cam pod
  const susp = [];
  for (const [z, wx] of [[FZ, FX], [RZ, RX]]) for (const k of [1, -1]) {
    susp.push(rod([0.2 * k, 0.46, z + 0.18], [(wx - 0.13) * k, 0.44, z]), rod([0.2 * k, 0.46, z - 0.18], [(wx - 0.13) * k, 0.44, z]));
    susp.push(rod([0.2 * k, 0.24, z + 0.2], [(wx - 0.12) * k, 0.22, z]), rod([0.2 * k, 0.24, z - 0.2], [(wx - 0.12) * k, 0.22, z]));
    susp.push(rod([0.22 * k, 0.5, z - 0.02], [(wx - 0.14) * k, 0.24, z], 0.014));
  }
  const halo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-0.33, 0.56, -0.28], [-0.32, 0.8, -0.06], [-0.2, 0.9, 0.22], [0, 0.92, 0.33], [0.2, 0.9, 0.22], [0.32, 0.8, -0.06], [0.33, 0.56, -0.28]].map((q) => new THREE.Vector3(...q))), 40, 0.034, 8, false);
  const pillar = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, 0.92, 0.33], [0, 0.8, 0.5], [0, 0.62, 0.62]].map((q) => new THREE.Vector3(...q))), 12, 0.036, 8, false);
  const mirrors = [];
  for (const k of [1, -1]) { mirrors.push(rod([0.27 * k, 0.6, 0.48], [0.44 * k, 0.66, 0.5], 0.01), boxAt(0.15, 0.06, 0.05, 0.48 * k, 0.67, 0.5)); }
  const darkParts = merge([fwPlates, boards, rwPlates, rwPylons, ...susp, halo, pillar, ...mirrors.map((g, i) => (i % 2 ? null : g)).filter(Boolean),
    boxAt(0.22, 0.09, 0.03, 0, 0.62, 0.32), boxAt(0.08, 0.05, 0.09, 0, 0.98, -0.45), loft([[0.5, 0.62, 0.21, 0.02], [0.05, 0.63, 0.25, 0.02], [-0.22, 0.63, 0.24, 0.02]], 16, [-2.6, 2.6], true)]);
  const mirrorHeads = merge(mirrors.filter((_, i) => i % 2));
  const carbon = merge([floor, diffuser, fwFixed]);
  // wheels: tyre (lathe of a rounded profile), a coloured sidewall band, a wheel cover with a marker
  const tyre = (r, w) => {
    const pts = []; const rr = 0.06;
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; pts.push(new THREE.Vector2(r - rr + Math.sin(a) * rr, -w / 2 + rr - Math.cos(a) * rr)); }
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; pts.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, w / 2 - rr + Math.sin(a) * rr)); }
    pts.unshift(new THREE.Vector2(r * 0.66, -w / 2)); pts.push(new THREE.Vector2(r * 0.66, w / 2));
    const g = new THREE.LatheGeometry(pts, 32); g.rotateZ(Math.PI / 2); return g;    // axle along X
  };
  const band = (r, w) => { const g = new THREE.RingGeometry(r * 0.78, r * 0.86, 32); g.rotateY(Math.PI / 2); g.translate(w / 2 + 0.002, 0, 0); return merge([g, mirrorX(g)]); };
  const cover = (r, w) => { const g = new THREE.CircleGeometry(r * 0.66, 24); g.rotateY(Math.PI / 2); g.translate(w / 2 - 0.01, 0, 0); const mark = boxAt(0.004, r * 0.55, 0.05, w / 2 - 0.005, r * 0.3, 0); return merge([g, mirrorX(g), mark]); };
  T = {
    body, pods: merge([podL, podR]), carbon, dark: darkParts, mirrorHeads,
    fwFlaps: merge([fw[1], fw[2]]), rwMain, rwFlaps: merge([rwFlap1, rwFlap2]),
    front: { tyre: tyre(FR, FW), band: band(FR, FW), cover: cover(FR, FW) }, rear: { tyre: tyre(RR, RW), band: band(RR, RW), cover: cover(RR, RW) },
    light: boxAt(0.012, 0.05, 0.36, 0, 0, 0), rain: boxAt(0.06, 0.05, 0.02, 0, 0.36, -2.6),
    helmet: new THREE.SphereGeometry(0.15, 16, 12),
  };
  // (shared by every car: marked so freeing one car's model leaves them alone)
  const mark = (o) => { if (o?.isBufferGeometry) o.userData.shared = true; else if (o && typeof o === "object") Object.values(o).forEach(mark); };
  mark(T);
  return T;
}

// ---------- liveries (2026) ----------
// base, top (spine/engine cover), side (sidepod band), accent (stripes, wing tips), nose tip, and whether the
// two sides differ (Cadillac's half-black, half-white). Matched on the feed's team name.
const LIVERIES = [
  [/red bull racing/i, { base: "#1d2a5e", top: "#1d2a5e", side: "#e21b4d", accent: "#ffcc1f", nose: "#ffcc1f", num: "#ffffff" }],
  [/racing bulls|\bvcarb|alphatauri/i, { base: "#f3f5f8", top: "#1c3faf", side: "#1c3faf", accent: "#e21b4d", nose: "#1c3faf", num: "#1c3faf" }],
  [/mercedes/i, { base: "#121315", top: "#c8cdd2", side: "#121315", accent: "#00d7b6", nose: "#c8cdd2", num: "#00d7b6" }],
  [/ferrari/i, { base: "#e8002d", top: "#ffffff", side: "#e8002d", accent: "#ffcd00", nose: "#e8002d", num: "#ffffff" }],
  [/mclaren/i, { base: "#ff8000", top: "#151515", side: "#151515", accent: "#47c7fc", nose: "#ff8000", num: "#151515" }],
  [/aston martin/i, { base: "#00594f", top: "#00594f", side: "#cedc00", accent: "#cedc00", nose: "#cedc00", num: "#cedc00" }],
  [/alpine/i, { base: "#0a3a8c", top: "#ff87bc", side: "#ff87bc", accent: "#ffffff", nose: "#0a3a8c", num: "#ffffff" }],
  [/williams/i, { base: "#0b3fa6", top: "#ffffff", side: "#41b6e6", accent: "#ffffff", nose: "#0b3fa6", num: "#ffffff" }],
  [/haas/i, { base: "#f2f2f2", top: "#151515", side: "#151515", accent: "#da291c", nose: "#151515", num: "#da291c" }],
  [/audi|sauber/i, { base: "#a9adb2", top: "#151515", side: "#e10600", accent: "#e10600", nose: "#151515", num: "#ffffff" }],
  [/cadillac/i, { base: "#111111", top: "#f2f2f2", side: "#111111", accent: "#c8a24a", nose: "#111111", num: "#f2f2f2", split: "#f2f2f2" }],
];
export function liveryFor(teamName, teamColour) {
  for (const [re, l] of LIVERIES) if (re.test(teamName || "")) return l;
  const c = "#" + (teamColour || "888888");
  return { base: c, top: c, side: "#151515", accent: "#ffffff", nose: c, num: "#ffffff" };
}
// The livery texture: x = along the car (0 rear → 1 front, matching the loft u), y = round the ring
// (canvas top = v 1 = right side bottom … see loft). Painted in bands; the car number on both sides.
function liveryTexture(l, number) {
  const W = 1024, H = 256, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  const V = (v) => (1 - v) * H;            // ring position → canvas y
  const U = (z) => ((z + 2.6) / 5.2) * W;  // car z → canvas x
  g.fillStyle = l.base; g.fillRect(0, 0, W, H);
  if (l.split) { g.fillStyle = l.split; g.fillRect(0, V(1), W, V(0.5) - V(1)); }               // one side another colour
  // top: spine and engine cover (around v = 0.5)
  g.fillStyle = l.top; g.fillRect(U(-2.6), V(0.58), U(0.1) - U(-2.6), V(0.42) - V(0.58));
  // side band along both flanks, sweeping up towards the rear
  g.fillStyle = l.side;
  for (const v of [0.28, 0.72]) { g.beginPath(); g.moveTo(U(1.3), V(v - 0.03)); g.lineTo(U(-1.9), V(v - 0.09)); g.lineTo(U(-1.9), V(v + 0.07)); g.lineTo(U(1.3), V(v + 0.03)); g.fill(); }
  // pinstripes in the accent colour
  g.strokeStyle = l.accent; g.lineWidth = 6;
  for (const v of [0.34, 0.66]) { g.beginPath(); g.moveTo(U(2.3), V(v)); g.lineTo(U(-0.4), V(v + (v < 0.5 ? 0.04 : -0.04))); g.stroke(); }
  // nose tip and the dark underside
  g.fillStyle = l.nose; g.fillRect(U(1.9), 0, W - U(1.9), H);
  g.fillStyle = "#16171a"; g.fillRect(0, V(0.08), W, V(0) - V(0.08)); g.fillRect(0, V(1), W, V(0.92) - V(1));
  // car number on each side of the engine cover, and on the nose top
  g.fillStyle = l.num; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = "italic 900 54px Arial, sans-serif";
  // Orientation, from the loft's mapping (left flank = +x = v 0.75, canvas top = v 1, canvas x = rear → front):
  // on the right flank the canvas already reads front-wards and upright; on the left flank both are reversed.
  for (const v of [0.36, 0.64]) { g.save(); g.translate(U(-0.85), V(v)); g.scale(v < 0.5 ? 1 : -1, v < 0.5 ? 1 : -1); g.fillText(String(number), 0, 0); g.restore(); }
  g.font = "italic 900 40px Arial, sans-serif"; g.save(); g.translate(U(1.75), V(0.5)); g.rotate(Math.PI / 2); g.fillText(String(number), 0, 0); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------- one car ----------
const MAT = {};
const mat = (key, make) => MAT[key] || (MAT[key] = Object.assign(make(), { userData: { shared: true } }));
export const TYRE_COLOURS = { SOFT: "#e8392f", MEDIUM: "#f2c230", HARD: "#eef0f2", INTERMEDIATE: "#3cb54a", WET: "#2f7fe0" };
export function makeCar({ teamName, teamColour, number }) {
  const t = template(), l = liveryFor(teamName, teamColour), tex = liveryTexture(l, number);
  const paint = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0.08 });
  const dark = mat("dark", () => new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.55, metalness: 0.1 }));
  const carbon = mat("carbon", () => new THREE.MeshStandardMaterial({ color: 0x1f2125, roughness: 0.45, metalness: 0.2 }));
  const wingPaint = new THREE.MeshStandardMaterial({ color: l.accent === "#ffffff" || l.accent === "#f2f2f2" ? l.base : l.top, roughness: 0.4, metalness: 0.08 });
  const tyreMat = mat("tyre", () => new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }));
  const coverMat = mat("cover", () => new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.4, metalness: 0.5 }));
  const bandMat = new THREE.MeshBasicMaterial({ color: 0xf2c230 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const g = new THREE.Group();
  const add = (geo, m, name) => { const mesh = new THREE.Mesh(geo, m); if (name) mesh.name = name; g.add(mesh); return mesh; };
  add(t.body, paint); add(t.pods, paint); add(t.carbon, carbon); add(t.dark, dark); add(t.mirrorHeads, wingPaint); add(t.rwMain, wingPaint);
  // active aero: the flap pairs pivot about their leading edges (closed = corner mode, open = straight mode)
  const fwPivot = new THREE.Group(); fwPivot.position.set(0, 0.16, 2.5); const fwF = new THREE.Mesh(t.fwFlaps, wingPaint); fwF.position.set(0, -0.16, -2.5); fwPivot.add(fwF); g.add(fwPivot);
  const rwPivot = new THREE.Group(); rwPivot.position.set(0, 0.96, -2.2); const rwF = new THREE.Mesh(t.rwFlaps, wingPaint); rwF.position.set(0, -0.96, 2.2); rwPivot.add(rwF); g.add(rwPivot);
  for (const k of [1, -1]) { const lm = new THREE.Mesh(t.light, lightMat); lm.position.set(0.5 * k, 0.86, -2.24); g.add(lm); }
  add(t.rain, lightMat);
  const wheels = [];
  for (const [x, z, kind] of [[FX, FZ, "front"], [-FX, FZ, "front"], [RX, RZ, "rear"], [-RX, RZ, "rear"]]) {
    const w = new THREE.Group(); w.position.set(x, kind === "front" ? FR : RR, z); w.rotation.order = "YXZ";
    w.add(new THREE.Mesh(t[kind].tyre, tyreMat), new THREE.Mesh(t[kind].band, bandMat), new THREE.Mesh(t[kind].cover, coverMat));
    g.add(w); wheels.push(w);
  }
  const helmet = add(t.helmet, new THREE.MeshStandardMaterial({ color: new THREE.Color(l.top).lerp(new THREE.Color("#ffffff"), 0.4), roughness: 0.25 }), "helmet");
  helmet.position.set(0, 0.76, -0.04);
  g.userData = { wheels, fwPivot, rwPivot, bandMat, compound: null, aero: 0 };
  return g;
}
// Tyre sidewall colour for the compound on the car now.
export function setCompound(car, compound) {
  if (car.userData.compound === compound) return;
  car.userData.compound = compound;
  car.userData.bandMat.color.set(TYRE_COLOURS[compound] || "#9aa0a6");
}
// Active aero: 0 = corner mode (flaps closed), 1 = straight mode (open). Eased by the caller.
export function setAero(car, open) {
  const u = car.userData; u.aero = open;
  u.fwPivot.rotation.x = -0.28 * open; u.rwPivot.rotation.x = -0.55 * open;
}
export const DIMENSIONS = { FZ, RZ, FR, RR, FX, RX };
