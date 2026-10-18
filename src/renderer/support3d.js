// The support cars' models: the safety car and the medical car of a season and event (support.js supportModels).
// v0.39: each model its own shape, from the makers' figures and the race cars' photos (docs/research/
// support_cars_start.md, ~/projects/f1kr-work/v039/research/support_models.md → docs/research/support_models.md):
// length, width, height, wheelbase, tracks and tyre sizes from the road cars' spec sheets (the race cars sit a touch lower
// and carry aero parts); the side outline – bonnet, windscreen, roof, tail – and where the lamps, grille, vents, wing and
// light bars are from photos of the race cars (estimates, a few cm). No maker's badge, sponsor or logo is drawn: shapes
// and colours only, the role on the plates ("SAFETY CAR" / "MEDICAL CAR", as the race cars' plates read).
//   The body: its side outline (with the wheel arches cut out) pushed across the car's width, then narrowed along its
//   length to the car's plan and rounded over the top (tumblehome); the glasshouse the same way, narrower at the roof.
//   Wheels: each its own group, the tyre and the rim's spokes turning about the axle (setSpin – the distance the car has
//   gone, map3d.js), so a moving car's wheels turn.
//   Mercedes-AMG safety cars (2022–): no roof light bar – LED modules in the top band of the windscreen and along the rear
//   wing's upper blade, orange (green when cars may pass); the Aston Martin safety cars: a roof bar; the medical cars: a
//   roof bar on a fairing at the roof's rear edge (amber ends, X290 photo, Shanghai 2026), the DBX707 likewise (estimate).
// Each car is its own group (a handful at most), freed with its world (dispose.js).
import * as THREE from "./vendor/three.module.js";
import { merge, boxAt, softBox } from "./car3d.js";

// L × W × H, wheelbase WB, front overhang FO, tracks TF/TR, tyre radii RF/RR (m, from the tyre sizes), ground clearance
// GC; the side outline (u: share of the length from the nose; y: m) – `top`: the lower body's upper edge (nose, bonnet,
// beltline, tail deck), `glass`: the glasshouse's outline over it (windscreen foot → roof → its rear end); `plan`: half
// width as a share of W/2 along u; colours, lights, wing, spokes (count of spoke pairs), extras
export const SUPPORT_CARS = {
  // Mercedes-AMG GT Black Series (C190): 4,551 × 2,007 × 1,284 mm, WB 2,630, tracks 1,693 / 1,683, 285/35 R19 / 335/30 R20,
  // clearance 95 (auto motor und sport data sheet). Long bonnet (~45 %) with two big outlets, the cabin far back, a
  // fastback to a short high tail, a two-tier wing on tall pylons over it (its top about roof height); race car: red,
  // the roof black, lower body and aero black (Commons photos, Suzuka 6 Apr 2025 / 29 Mar 2026); black 5×2-spoke wheels
  amgGtBlack: { name: "Mercedes-AMG GT Black Series", role: "sc", L: 4.551, W: 2.007, H: 1.284, WB: 2.63, FO: 0.892, TF: 1.693, TR: 1.683, RF: 0.341, RR: 0.355, GC: 0.1,
    top: [[0, 0.57], [0.012, 0.62], [0.196, 0.745], [0.3, 0.82], [0.4, 0.895], [0.6, 0.9], [0.75, 0.9], [0.85, 0.89], [0.97, 0.873], [0.99, 0.833], [1, 0.713]],
    glass: [[0.4, 0.895], [0.52, 1.2], [0.62, 1.284], [0.7, 1.24], [0.8, 1.1], [0.9, 0.96], [0.97, 0.88]],
    plan: [[0, 0.78], [0.06, 0.9], [0.18, 1], [0.35, 0.97], [0.55, 0.93], [0.78, 1], [0.92, 0.97], [1, 0.86]],
    body: "#cf1d22", roof: "#111214", lower: "#0e0f11", accent: "#111214", lights: "screen", wing: { y: 1.29, u: 0.93, two: true }, spokes: 5, rim: "#141516", roofW: 0.65,
    grille: "panamericana", vents: "bonnet2", plate: "SAFETY CAR" },
  // Mercedes-AMG GT 63 PRO 4MATIC+ Coupé (C192): 4,728 × 1,984 × 1,354 mm, WB 2,700, tracks 1,684 / 1,687, 295/30 ZR21 /
  // 305/30 ZR21 (Mercedes technical data, 2023 / 2024). A 2+2 – the cabin longer and taller than the Black Series's, a
  // long fastback to a liftback, two power domes on the bonnet, a fixed wing on the tailgate below roof height; race car
  // (Mercedes, 23 Jul 2026): black with red graphics, LEDs in the front and the rear wing (an active flap)
  amgGt63Pro: { name: "Mercedes-AMG GT 63 PRO 4MATIC+", role: "sc", L: 4.728, W: 1.984, H: 1.354, WB: 2.7, FO: 0.851, TF: 1.684, TR: 1.687, RF: 0.356, RR: 0.358, GC: 0.11,
    top: [[0, 0.6], [0.012, 0.65], [0.18, 0.8], [0.28, 0.88], [0.35, 0.95], [0.55, 0.975], [0.75, 0.97], [0.88, 0.9], [0.97, 0.84], [0.99, 0.8], [1, 0.68]],
    glass: [[0.35, 0.95], [0.46, 1.27], [0.54, 1.354], [0.64, 1.33], [0.76, 1.17], [0.88, 0.98], [0.96, 0.85]],
    plan: [[0, 0.8], [0.06, 0.92], [0.18, 1], [0.38, 0.97], [0.58, 0.93], [0.8, 1], [0.93, 0.97], [1, 0.88]],
    body: "#121315", roof: "#121315", lower: "#0b0c0d", accent: "#c8102e", rearBody: "#c8102e", lights: "screen", wing: { y: 1.3, u: 0.95, two: false, swan: true }, spokes: 5, rim: "#141516", roofW: 0.65,
    grille: "panamericana", vents: "domes", plate: "SAFETY CAR", stripe: "#c8102e" },
  // Aston Martin Vantage (2024): 4,495 × 1,980 × 1,275 mm, WB 2,705, tracks 1,665 / 1,655, 275/35 ZR21 / 325/30 ZR21. A long
  // bonnet with a wide grille low in the nose, the cabin set back, a short fastback to a ducktail; the safety car: green,
  // lime accents, a roof light bar, a fixed rear wing (estimate)
  vantage: { name: "Aston Martin Vantage", role: "sc", L: 4.495, W: 1.98, H: 1.275, WB: 2.705, FO: 0.742, TF: 1.665, TR: 1.655, RF: 0.36, RR: 0.364, GC: 0.1,
    top: [[0, 0.57], [0.012, 0.62], [0.165, 0.765], [0.25, 0.83], [0.33, 0.885], [0.55, 0.89], [0.71, 0.9], [0.85, 0.88], [0.97, 0.84], [0.99, 0.8], [1, 0.68]],
    glass: [[0.33, 0.885], [0.45, 1.19], [0.55, 1.275], [0.64, 1.24], [0.75, 1.08], [0.88, 0.92], [0.96, 0.85]],
    plan: [[0, 0.8], [0.06, 0.92], [0.18, 1], [0.38, 0.96], [0.56, 0.92], [0.8, 1], [0.93, 0.97], [1, 0.87]],
    body: "#00473b", roof: "#00473b", lower: "#0e0f11", accent: "#c4e000", lights: "roof", wing: { y: 1.24, u: 0.95, two: false }, spokes: 5, rim: "#1a1b1d", roofW: 0.6,
    grille: "wide", plate: "SAFETY CAR" },
  vantageS: { name: "Aston Martin Vantage S", role: "sc", L: 4.495, W: 1.98, H: 1.275, WB: 2.705, FO: 0.742, TF: 1.665, TR: 1.655, RF: 0.36, RR: 0.364, GC: 0.1,
    top: [[0, 0.57], [0.012, 0.62], [0.165, 0.765], [0.25, 0.83], [0.33, 0.885], [0.55, 0.89], [0.71, 0.9], [0.85, 0.88], [0.97, 0.84], [0.99, 0.8], [1, 0.68]],
    glass: [[0.33, 0.885], [0.45, 1.19], [0.55, 1.275], [0.64, 1.24], [0.75, 1.08], [0.88, 0.92], [0.96, 0.85]],
    plan: [[0, 0.8], [0.06, 0.92], [0.18, 1], [0.38, 0.96], [0.56, 0.92], [0.8, 1], [0.93, 0.97], [1, 0.87]],
    body: "#00473b", roof: "#00473b", lower: "#0e0f11", accent: "#c4e000", lights: "roof", wing: { y: 1.24, u: 0.95, two: false }, spokes: 5, rim: "#1a1b1d", roofW: 0.6,
    grille: "wide", plate: "SAFETY CAR" },
  // Mercedes-AMG GT 63 S 4MATIC+ 4-Door Coupé (X290), the medical car 2022–: 5,054 × 1,953 × 1,447 mm, WB 2,951, tracks
  // 1,669 / 1,664, 275/35 R21 / 315/30 R21 (auto motor und sport). Four doors, a fastback liftback with a short ducktail;
  // race car (Commons, Shanghai 13 Mar 2026): red all over (the roof too), black aero and lower body, a roof bar at the
  // roof's rear edge (amber ends), a fixed wing on the tailgate below it, black wheels
  amgGt63s: { name: "Mercedes-AMG GT 63 S 4MATIC+ 4-Door", role: "medical", L: 5.054, W: 1.953, H: 1.447, WB: 2.951, FO: 0.96, TF: 1.669, TR: 1.664, RF: 0.363, RR: 0.367, GC: 0.12,
    top: [[0, 0.63], [0.012, 0.68], [0.19, 0.8], [0.27, 0.88], [0.33, 0.94], [0.55, 0.955], [0.8, 0.96], [0.92, 0.95], [0.97, 0.926], [0.99, 0.886], [1, 0.766]],
    glass: [[0.33, 0.94], [0.43, 1.33], [0.5, 1.447], [0.64, 1.42], [0.8, 1.2], [0.92, 1.0], [0.97, 0.93]],
    plan: [[0, 0.8], [0.06, 0.92], [0.17, 1], [0.4, 0.98], [0.6, 0.96], [0.8, 1], [0.94, 0.96], [1, 0.86]],
    body: "#cf1d22", roof: "#cf1d22", lower: "#0e0f11", accent: "#111214", lights: "bar", wing: { y: 1.02, u: 0.965, two: false }, spokes: 5, rim: "#141516", rimEdge: "#cf1d22", roofW: 0.75,
    grille: "panamericana", vents: "domes", plate: "MEDICAL CAR", doors4: true },
  // Aston Martin DBX707, medical car (2025 Aston rounds): 5,039 × 1,998 × 1,680 mm, WB 3,060, 285/40 YR22 / 325/35 YR22,
  // clearance 175. An SUV: a high bonnet, a long flat roof, a sloping hatch; green, a roof bar (estimate)
  dbx707: { name: "Aston Martin DBX707", role: "medical", L: 5.039, W: 1.998, H: 1.68, WB: 3.06, FO: 0.937, TF: 1.698, TR: 1.664, RF: 0.393, RR: 0.393, GC: 0.19,
    top: [[0, 0.77], [0.012, 0.82], [0.186, 1.04], [0.25, 1.1], [0.31, 1.17], [0.55, 1.19], [0.8, 1.2], [0.9, 1.18], [0.97, 1.1], [0.99, 1.06], [1, 0.94]],
    glass: [[0.31, 1.17], [0.43, 1.6], [0.5, 1.68], [0.75, 1.67], [0.84, 1.58], [0.9, 1.42], [0.94, 1.2]],
    plan: [[0, 0.82], [0.06, 0.93], [0.17, 1], [0.4, 0.98], [0.6, 0.97], [0.8, 1], [0.95, 0.97], [1, 0.9]],
    body: "#00473b", roof: "#00473b", lower: "#0e0f11", accent: "#c4e000", lights: "roof", wing: null, spokes: 5, rim: "#1a1b1d", roofW: 0.75,
    grille: "wide", plate: "MEDICAL CAR", doors4: true },
  // (the maker not known for the event: a car of the role's usual type in neutral colours – said so in the info)
  neutralSc: { name: "safety car (maker not sourced for this event)", role: "sc", L: 4.55, W: 1.99, H: 1.27, WB: 2.66, FO: 0.95, TF: 1.68, TR: 1.67, RF: 0.35, RR: 0.355, GC: 0.1,
    top: [[0, 0.59], [0.012, 0.64], [0.08, 0.7], [0.25, 0.8], [0.44, 0.9], [0.5, 0.92], [0.8, 0.95], [0.92, 0.97], [0.97, 0.93], [0.99, 0.89], [1, 0.77]],
    glass: [[0.44, 0.9], [0.55, 1.19], [0.62, 1.27], [0.72, 1.24], [0.86, 1.04], [0.92, 0.97]],
    plan: [[0, 0.8], [0.06, 0.92], [0.18, 1], [0.38, 0.96], [0.56, 0.93], [0.8, 1], [0.93, 0.97], [1, 0.87]],
    body: "#9aa0a6", roof: "#9aa0a6", lower: "#2a2d31", accent: "#2a2d31", lights: "roof", wing: { y: 1.1, u: 0.94, two: false }, spokes: 5, rim: "#2a2d31", plate: "SAFETY CAR" },
  // (a support car in the feed whose role isn't known – never seen so far: plain, no lights or role)
  neutralSupport: { name: "support car (role not known)", role: "support", L: 4.55, W: 1.99, H: 1.27, WB: 2.66, FO: 0.95, TF: 1.68, TR: 1.67, RF: 0.35, RR: 0.355, GC: 0.1,
    top: [[0, 0.59], [0.012, 0.64], [0.08, 0.7], [0.25, 0.8], [0.44, 0.9], [0.5, 0.92], [0.8, 0.95], [0.92, 0.97], [0.97, 0.93], [0.99, 0.89], [1, 0.77]],
    glass: [[0.44, 0.9], [0.55, 1.19], [0.62, 1.27], [0.72, 1.24], [0.86, 1.04], [0.92, 0.97]],
    plan: [[0, 0.8], [0.06, 0.92], [0.18, 1], [0.38, 0.96], [0.56, 0.93], [0.8, 1], [0.93, 0.97], [1, 0.87]],
    body: "#8a8f95", roof: "#8a8f95", lower: "#2a2d31", accent: "#2a2d31", lights: null, wing: null, spokes: 5, rim: "#2a2d31", plate: "" },
  neutralMedical: { name: "medical car (maker not sourced for this event)", role: "medical", L: 5.05, W: 1.96, H: 1.45, WB: 2.95, FO: 0.95, TF: 1.67, TR: 1.66, RF: 0.363, RR: 0.367, GC: 0.12,
    top: [[0, 0.63], [0.012, 0.68], [0.08, 0.74], [0.22, 0.84], [0.33, 0.93], [0.38, 0.95], [0.8, 1.0], [0.93, 1.03], [0.97, 0.98], [0.99, 0.94], [1, 0.82]],
    glass: [[0.33, 0.93], [0.44, 1.32], [0.52, 1.45], [0.66, 1.43], [0.84, 1.15], [0.94, 1.03]],
    plan: [[0, 0.8], [0.06, 0.92], [0.17, 1], [0.4, 0.98], [0.6, 0.96], [0.8, 1], [0.94, 0.96], [1, 0.86]],
    body: "#d9dde1", roof: "#d9dde1", lower: "#2a2d31", accent: "#2a2d31", lights: "bar", wing: null, spokes: 5, rim: "#2a2d31", plate: "MEDICAL CAR", doors4: true },
};

// piecewise-linear lookup in [[u, v], …] (u ascending)
export function lerpAt(list, u) {
  if (u <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) if (u <= list[i][0]) { const [u0, v0] = list[i - 1], [u1, v1] = list[i]; return v0 + ((v1 - v0) * (u - u0)) / (u1 - u0 || 1); }
  return list[list.length - 1][1];
}
// The car's wheels: axle places (z, front +) and arch radii
export function wheelPlaces(spec) {
  const zf = spec.L / 2 - spec.FO, zr = zf - spec.WB;
  return { zf, zr, archF: spec.RF + 0.035, archR: spec.RR + 0.035 };
}
const COL = (h) => new THREE.Color(h);
// A body part lofted along the car: at each u (share of the length from the nose) a rounded section from y = bot(u) to
// top(u), half width hw(u), squareness pw, its upper half drawn in by `tumble` (the sides leaning in towards the top).
// Smooth (indexed, shared normals); u from u0 to u1 in n steps, the ends capped.
function loftBody(spec, { u0 = 0, u1 = 1, n = 90, ring = 28, bot, top, hw, pw = 5, tumble = 0 }) {
  const L = spec.L, pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0) * i) / n, z = L / 2 - u * L, b = bot(u), t = Math.max(b + 0.004, top(u)), cy = (b + t) / 2, hh = (t - b) / 2, w = hw(u);
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2 - Math.PI / 2, c = Math.cos(a), sn = Math.sin(a);
      const yk = sn >= 0 ? Math.pow(sn, 2 / pw) : -Math.pow(-sn, 2 / pw), lean = 1 - tumble * Math.max(0, yk);
      pos.push(w * lean * Math.sign(c) * Math.pow(Math.abs(c), 2 / pw), cy + hh * yk, z);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < ring; k++) { const a = i * ring + k, b2 = i * ring + ((k + 1) % ring), c = a + ring, d = b2 + ring; idx.push(a, c, b2, b2, c, d); }
  for (const [i, flip] of [[0, false], [n, true]]) {
    const base = pos.length / 3; let cx = 0, cy = 0, cz = 0; for (let k = 0; k < ring; k++) { cx += pos[(i * ring + k) * 3]; cy += pos[(i * ring + k) * 3 + 1]; cz += pos[(i * ring + k) * 3 + 2]; }
    pos.push(cx / ring, cy / ring, cz / ring);
    for (let k = 0; k < ring; k++) { const a = i * ring + k, b2 = i * ring + ((k + 1) % ring); idx.push(...(flip ? [base, b2, a] : [base, a, b2])); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// the lower body's underside along u: the sill, rising over the wheels into the arches
export function bodyBottom(spec, u) {
  const z = spec.L / 2 - u * spec.L, W = wheelPlaces(spec), sill = spec.GC + 0.04;
  let y = sill + (u < 0.02 ? (0.02 - u) * 3 : 0) + (u > 0.985 ? (u - 0.985) * 4 : 0);
  for (const [zc, ra, r] of [[W.zf, W.archF, spec.RF], [W.zr, W.archR, spec.RR]]) { const d = Math.abs(z - zc); if (d < ra) y = Math.max(y, r + Math.sqrt(ra * ra - d * d)); }
  return y;
}
function plateTexture(text, fg = "#ffffff", bg = "#0e0f11") {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64; const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 64); g.fillStyle = fg; g.font = "700 34px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// a wheel: the tyre (rounded section) and the rim's face – `spokes` pairs of spokes, the hub – in one geometry (vertex
// colours), the axle along x, its outer face at +x
function wheelGeometry(r, w, spokes, rimHex, edgeHex = null) {
  const rimR = r * 0.7, pts = [], rr = Math.min(0.05, w * 0.2);
  pts.push(new THREE.Vector2(rimR, -w / 2 + 0.01));
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push(new THREE.Vector2(r - rr + Math.sin(a) * rr, -w / 2 + rr - Math.cos(a) * rr)); }
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, w / 2 - rr + Math.sin(a) * rr)); }
  pts.push(new THREE.Vector2(rimR, w / 2 - 0.01));
  const tyre = new THREE.LatheGeometry(pts, 28).rotateZ(Math.PI / 2).toNonIndexed();
  const tint = (g, hex) => { const c = COL(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute("color", new THREE.BufferAttribute(a, 3)); g.deleteAttribute("uv"); return g; };
  const parts = [tint(tyre, "#141516")];
  const face = w / 2 - 0.02;
  const barrel = new THREE.CircleGeometry(rimR, 24).rotateY(Math.PI / 2).translate(face - 0.05, 0, 0).toNonIndexed(); parts.push(tint(barrel, "#0b0b0c"));
  const lip = new THREE.TorusGeometry(rimR, 0.012, 5, 28).rotateY(Math.PI / 2).translate(face, 0, 0).toNonIndexed(); parts.push(tint(lip, edgeHex || rimHex));
  for (let i = 0; i < spokes; i++) for (const o of [-0.13, 0.13]) {
    const b = new THREE.BoxGeometry(0.018, rimR - 0.06, 0.03).translate(0, (rimR - 0.06) / 2 + 0.06, 0); b.rotateX((i / spokes) * Math.PI * 2 + o); b.translate(face - 0.012, 0, 0); parts.push(tint(b.toNonIndexed(), rimHex));
  }
  const hub = new THREE.CylinderGeometry(0.07, 0.075, 0.03, 16).rotateZ(Math.PI / 2).translate(face - 0.01, 0, 0).toNonIndexed(); parts.push(tint(hub, rimHex));
  const g = merge(parts); g.computeVertexNormals(); return g;
}

// A soft shadow on the ground under a car L × W: darkest under the body, fading out ~0.3 m beyond it (the vertices'
// alpha – no texture). Its own geometry and material (freed with the car: dispose.js); it casts and takes no shadow.
export function contactShadow(L, W) {
  const a0 = Math.max(0.2, L / 2 - 0.25), b0 = Math.max(0.2, W / 2 - 0.25), a1 = L / 2 + 0.3, b1 = W / 2 + 0.3, y = 0.03;
  const pos = [], col = [];
  for (const [a, b, al] of [[a0, b0, 0.5], [a1, b1, 0]]) for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(sx * b, y, sz * a); col.push(0, 0, 0, al); }
  // the inner rectangle (0–3), and a ring of four quads out to the outer one (4–7); faces up
  const idx = [0, 2, 1, 0, 3, 2];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; idx.push(i, j, 4 + j, i, 4 + j, 4 + i); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  m.name = "contactShadow"; m.userData.contactShadow = true;
  return m;
}

// One car: a Group, its front along +z, standing on y = 0. userData: { spec, lamps: [materials], wheels: [spin groups],
// setLights(on, phase), setSpin(front, rear) }
export function makeSupportCar(id) {
  const spec = SUPPORT_CARS[id] || SUPPORT_CARS.neutralSc, { L, W, H } = spec, h = L / 2, Z = (u) => h - u * L;
  const group = new THREE.Group(); group.name = "supportCar:" + id;
  const mat = (o) => new THREE.MeshStandardMaterial(o);
  const bodyM = mat({ color: spec.body, roughness: 0.32, metalness: 0.45 }), lowerM = mat({ color: spec.lower, roughness: 0.55, metalness: 0.2 });
  const roofM = spec.roof === spec.body ? bodyM : mat({ color: spec.roof, roughness: 0.35, metalness: 0.3 });
  const accentM = spec.accent === spec.lower ? lowerM : mat({ color: spec.accent, roughness: 0.4, metalness: 0.3 });
  const glassM = mat({ color: "#0b0e13", roughness: 0.06, metalness: 0.7 });
  const parts = [];   // [geometry, material]
  const add = (g, m) => parts.push([g, m]);
  // the lower body (with the arches), and the black sill / bumper band along its bottom
  const belt = lerpAt(spec.top, 0.6), plan = (u) => (lerpAt(spec.plan, u) * W) / 2;
  // (the GT 63 PRO safety car: black at the front fading to red at the rear – Mercedes's photos, Hungary 2026; here two
  // colours split at 0.62 of its length, the fade and the dash graphics not drawn)
  const body = (u0, u1, m) => add(loftBody(spec, { u0, u1, n: Math.round(120 * (u1 - u0)), bot: (u) => bodyBottom(spec, u), top: (u) => lerpAt(spec.top, u), hw: plan, pw: 3.4, tumble: 0.14 }), m);
  if (spec.rearBody) { body(0, 0.62, bodyM); body(0.62, 1, mat({ color: spec.rearBody, roughness: 0.32, metalness: 0.45 })); } else body(0, 1, bodyM);
  const sill = spec.GC + 0.04, Wp = wheelPlaces(spec);
  const sillLen = Wp.zf - Wp.zr - Wp.archF - Wp.archR - 0.04, sillZ = (Wp.zf - Wp.archF + Wp.zr + Wp.archR) / 2;
  for (const s2 of [1, -1]) add(boxAt(0.03, 0.08, sillLen, s2 * plan(0.5) * 0.99, sill + 0.035, sillZ), lowerM);
  add(boxAt(W * 0.8, 0.05, 0.14, 0, sill - 0.005, h - 0.1), lowerM);              // the splitter
  add(boxAt(W * 0.78, 0.14, 0.08, 0, sill + 0.08, -h + 0.06), lowerM);            // the diffuser / rear apron
  // the glasshouse over the beltline, narrower towards the roof; the roof panel a skin over its top
  const gl = spec.glass, g0 = gl[0][0], g1 = gl[gl.length - 1][0], topAt = (u) => lerpAt(spec.top, u);
  // (the glasshouse's width at the roof as a share of the body's – the AMG coupés ~0.65, the Vantage ~0.6, the 4-door and
  // the DBX ~0.75 (photos, research §8) – from ~0.92 at the beltline)
  const roofW = 0.92, lean = 1 - (spec.roofW || 0.7) / roofW;
  add(loftBody(spec, { u0: g0, u1: g1, n: 60, ring: 24, bot: (u) => topAt(u) - 0.03, top: (u) => lerpAt(gl, u), hw: (u) => plan(u) * roofW, pw: 4, tumble: lean }), glassM);
  const peakU = gl.reduce((a2, b2) => (b2[1] > a2[1] ? b2 : a2))[0], r0 = gl.find((q) => q[1] > spec.H - 0.12) || gl[1], r1 = [...gl].reverse().find((q) => q[1] > spec.H - 0.1) || gl[gl.length - 2];
  add(loftBody(spec, { u0: r0[0], u1: r1[0], n: 24, ring: 20, bot: (u) => lerpAt(gl, u) - 0.06, top: (u) => lerpAt(gl, u) + 0.012, hw: (u) => plan(u) * (spec.roofW || 0.7) * 1.02, pw: 4, tumble: 0.1 }), roofM);
  // the doors' gaps and the window frames: thin dark lines on the sides (where the doors are)
  const dz0 = Z(gl[0][0] + 0.02), dz1 = spec.doors4 ? Z(peakU + 0.12) : Z(peakU + 0.06);
  for (const s of [1, -1]) {
    const xs = s * (W / 2 * lerpAt(spec.plan, 0.55) * 0.995 + 0.002);
    for (const z of spec.doors4 ? [dz0, (dz0 + dz1) / 2, dz1] : [dz0, dz1]) add(boxAt(0.006, belt - sill - 0.08, 0.008, xs, (belt + sill) / 2 + 0.02, z), lowerM);
  }
  // nose: the grille (Panamericana: vertical slats in a trapezoid; Aston: a wide mesh opening), headlamps, plates
  const ny = lerpAt(spec.top, 0.02), nz = h - 0.03;
  if (spec.grille === "panamericana") { add(boxAt(W * 0.36, 0.2, 0.04, 0, ny - 0.17, nz - 0.01), lowerM); for (let i = 0; i < 13; i++) add(boxAt(0.012, 0.18, 0.05, -W * 0.16 + (W * 0.32 * i) / 12, ny - 0.17, nz + 0.005), mat({ color: "#7d8287", roughness: 0.25, metalness: 0.9 })); }
  else if (spec.grille === "wide") add(boxAt(W * 0.5, 0.22, 0.04, 0, ny - 0.2, nz - 0.01), lowerM);
  const head = mat({ color: "#dfe7ee", emissive: "#fff6e0", emissiveIntensity: 0.35, roughness: 0.15 }), tail = mat({ color: "#4a0808", emissive: "#ff1a1a", emissiveIntensity: 0.45, roughness: 0.3 });
  // headlamps: slim swept units in the front corners, flush with the body (C190 / C192: narrow triangles up the wing;
  // the Astons' wider ovals) – a thin strip a few mm proud of the surface
  for (const s of [1, -1]) {
    const u = 0.045, y = lerpAt(spec.top, u) - 0.06, x = plan(u) * 0.74;
    add(boxAt(0.26, 0.035, 0.16, s * x, y, Z(u) - 0.02, -0.35, s * 0.42, 0), head);
  }
  // tail lamps: a thin strip across the top of the tail (Aston: full width; AMG: at the corners)
  const ty = lerpAt(spec.top, 0.985) - 0.05;
  if (/Aston/.test(spec.name)) add(boxAt(W * 0.8, 0.035, 0.03, 0, ty, -h + 0.03), tail);
  else for (const s of [1, -1]) add(boxAt(W * 0.26, 0.04, 0.03, s * W * 0.32, ty, -h + 0.035), tail);
  // bonnet: the Black Series's two big outlets, the others' power domes (dark lines)
  if (spec.vents === "bonnet2") for (const s of [1, -1]) add(boxAt(W * 0.2, 0.012, 0.38, s * W * 0.14, lerpAt(spec.top, 0.22) + 0.005, Z(0.22), -0.12), lowerM);
  if (spec.vents === "domes") for (const s of [1, -1]) add(boxAt(0.01, 0.012, L * 0.25, s * W * 0.2, lerpAt(spec.top, 0.2) + 0.006, Z(0.2), -0.1), accentM);
  if (spec.stripe) for (const s of [1, -1]) add(boxAt(0.005, 0.05, L * 0.6, s * (W / 2 * 0.985), belt - 0.18, Z(0.5)), accentM);
  // the rear wing: blade(s) on two pylons from the tailgate
  if (spec.wing) {
    const wz = Z(spec.wing.u), base = lerpAt(spec.top, spec.wing.u);
    add(boxAt(W * 0.84, 0.025, 0.3, 0, spec.wing.y, wz, 0.12), lowerM);
    if (spec.wing.two) add(boxAt(W * 0.84, 0.02, 0.2, 0, spec.wing.y - 0.09, wz + 0.12, 0.2), lowerM);
    // (pylons from the tailgate to the blade – the GT 63 PRO's swan necks hang it from above: up past its leading edge)
    for (const s of [1, -1]) { add(boxAt(0.02, spec.wing.y - base + (spec.wing.swan ? 0.05 : 0.02), 0.14, s * W * 0.26, (spec.wing.y + base) / 2 + (spec.wing.swan ? 0.025 : 0), wz + (spec.wing.swan ? 0.12 : 0.06)), lowerM); add(boxAt(0.012, 0.2, 0.38, s * W * 0.42, spec.wing.y - 0.04, wz), lowerM); }
  }
  // lights (their own materials: flashing – support state)
  const lamp = (c) => mat({ color: "#1b1b1b", emissive: c, emissiveIntensity: 0.05, roughness: 0.3 });
  const lamps = [], lampParts = [];
  if (spec.lights === "screen") {
    // the top band of the windscreen: black, LED modules each side; the rear wing's upper blade: a row of modules
    const o = lamp("#ff7a00"), gr = lamp("#22e05a"); lamps.push(o, gr);
    const sw = gl[1], wy = sw[1] - 0.02, wz = Z(sw[0]) - 0.02;
    add(boxAt(W * 0.6, 0.06, 0.04, 0, wy, wz, -0.9), lowerM);
    for (const s of [1, -1]) { lampParts.push([boxAt(0.12, 0.03, 0.03, s * W * 0.22, wy, wz + 0.02, -0.9), o]); lampParts.push([boxAt(0.08, 0.03, 0.03, s * W * 0.1, wy, wz + 0.02, -0.9), gr]); }
    if (spec.wing) lampParts.push([boxAt(W * 0.6, 0.02, 0.03, 0, spec.wing.y + 0.015, Z(spec.wing.u) - 0.14), o]);
  } else if (spec.lights === "roof" || spec.lights === "bar") {
    // a roof bar: on the roof's middle (Aston's safety car) or its rear edge on a fairing (the medical cars)
    // (the Astons' bar at the front of the roof on a plinth, the medical X290's on a fairing at its rear edge – photos)
    const atU = spec.lights === "bar" ? r1[0] - 0.03 : r0[0] + 0.03, by = lerpAt(gl, atU) + 0.05, bz = Z(atU);
    const a = lamp(spec.role === "sc" ? "#ff8a00" : "#ffb000"), b = lamp(spec.role === "sc" ? "#22e05a" : "#ffb000"); lamps.push(a, b);
    add(softBox(W * 0.6, 0.06, 0.24, 0, by, bz, 0.3), lowerM);
    lampParts.push([boxAt(W * 0.2, 0.05, 0.2, -W * 0.19, by + 0.012, bz), a], [boxAt(W * 0.2, 0.05, 0.2, W * 0.19, by + 0.012, bz), b]);
  }
  for (const pp of lampParts) add(...pp);
  // plates front and rear with the role
  if (spec.plate && typeof document !== "undefined") {
    const tex = plateTexture(spec.plate), pm = new THREE.MeshBasicMaterial({ map: tex, toneMapped: true }); pm.userData.ownedTextures = [tex];
    const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), pm); pf.position.set(0, sill + 0.13, h + 0.005); group.add(pf);
    const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), pm); pr.position.set(0, sill + 0.22, -h - 0.005); pr.rotation.y = Math.PI; group.add(pr);
    if (spec.plate === "MEDICAL CAR") { const pb = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.2), new THREE.MeshBasicMaterial({ map: plateTexture("MEDICAL CAR", "#ffffff", spec.body), transparent: false })); pb.material.userData.ownedTextures = [pb.material.map]; pb.position.set(0, lerpAt(spec.top, 0.12) + 0.012, Z(0.12)); pb.rotation.x = -Math.PI / 2 + 0.14; group.add(pb); }
  }
  // (one mesh per material: the parts' transforms baked in – a car is a handful of draw calls)
  const byMat = new Map(); for (const [g, m] of parts) { const l = byMat.get(m) || []; l.push(g.index ? g.toNonIndexed() : g); byMat.set(m, l); }
  for (const [m, list] of byMat) {
    for (const g of list) for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    const mesh = new THREE.Mesh(merge(list), m); for (const g of list) g.dispose();
    group.add(mesh);
  }
  // (no car casts into the sun's shadow map: that map is drawn again only when the area it covers moves – map3d.js
  // updateSun –, so a support car driving off left its shadow on the ground where the map was last drawn, and drew none
  // where it went – seen at Monza 2026, the safety car leaving the pit exit under a still camera (v0.40). Like the race
  // cars: a soft contact shadow under it instead)
  group.add(contactShadow(L, W));
  // the wheels: each its own pivot at the axle, turning about x (setSpin)
  const wheelM = mat({ color: "#ffffff", vertexColors: true, roughness: 0.6, metalness: 0.4 }), wheels = [];
  const geoF = wheelGeometry(spec.RF, spec.RF * 0.75, spec.spokes || 5, spec.rim, spec.rimEdge), geoR = wheelGeometry(spec.RR, spec.RR * 0.85, spec.spokes || 5, spec.rim, spec.rimEdge);
  for (const [x, z, front] of [[spec.TF / 2, Wp.zf, true], [-spec.TF / 2, Wp.zf, true], [spec.TR / 2, Wp.zr, false], [-spec.TR / 2, Wp.zr, false]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, front ? spec.RF : spec.RR, z);
    const m = new THREE.Mesh(front ? geoF : geoR, wheelM); if (x < 0) m.scale.x = -1; pivot.add(m); group.add(pivot); wheels.push(pivot);
  }
  group.userData = { spec, lamps, wheels,
    // on: flashing (deployed / out on track); phase: the session's time (s) – the same moment, the same lamps
    setLights(on, phase) { const k = on ? (Math.floor(phase * 3) % 2 ? 1 : 0.15) : 0.05; lamps.forEach((m, i) => { const v = on ? (i % 2 ? 1.15 - k : k) * 2.2 : 0.05; if (Math.abs(m.emissiveIntensity - v) > 1e-3) m.emissiveIntensity = v; }); },
    // the wheels' roll angles (rad): front, rear
    setSpin(front, rear = front) { wheels.forEach((w, i) => { w.rotation.x = i < 2 ? front : rear; }); } };
  return group;
}
