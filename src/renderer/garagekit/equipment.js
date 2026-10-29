// The garage's equipment as modules (v0.49 garage kit): each a function that adds its parts to a Parts collector
// (garagekit/parts.js) by material slot, in its own frame – origin on the floor at its footprint's centre, its front
// (the side a mechanic works from) toward +z, its length along x (layout.js MODULES: w along x, d along z).
// lod: 0 near (every handle, castor, hose), 1 mid (the shapes, fewer segments), 2 far (a few blocks in the right
// colours – what reads from the pit lane's far side).
//
// What the parts are and how big: estimates from public photos and descriptions of F1 garages (reports/kit.md: wall
// units with tool drawers and wheel-gun housings, a modular overhead gantry carrying lighting, air lines, extraction,
// the driver's monitor and power, colour-coded tyre blankets, tyre racks and trolleys). Not any team's real equipment;
// no logos, no maker's names.
import * as THREE from "../vendor/three.module.js";

const SEG = [28, 14, 7];                 // round parts' segments per lod
// F1 wheels since 2022: 18-inch rims, ~0.72 m tyres (estimate from the published 18" size; the rear wider than the front)
export const TYRE = { r: 0.36, rim: 0.229, w: 0.36 };

// the tyre's cross-section as a lathe about y (lying flat): rounded shoulders, the bead at the rim
function tyreGeo(lod, w = TYRE.w) {
  const R = TYRE.r, r = TYRE.rim, h = w / 2, k = 0.045, seg = SEG[lod] * 2;
  const pts = [[r, -h * 0.92], [R - k * 1.6, -h], [R - k * 0.5, -h + k * 0.5], [R, -h + k * 1.5], [R, h - k * 1.5], [R - k * 0.5, h - k * 0.5], [R - k * 1.6, h], [r, h * 0.92]];
  const P = lod === 2 ? [pts[0], pts[3], pts[4], pts[7]] : pts;
  return new THREE.LatheGeometry(P.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}
// the blanket over a tyre (tread and the sidewalls' outer part; the rim face stays bare), a lathe a few cm proud
export function blanketGeo(lod, w = TYRE.w) {
  const R = TYRE.r + 0.022, h = w / 2 + 0.018, i = TYRE.rim + 0.045, seg = SEG[lod] * 2;
  const pts = lod === 2 ? [[i, -h], [R, -h], [R, h], [i, h]] : [[i, -h], [R - 0.05, -h - 0.004], [R - 0.012, -h + 0.02], [R + 0.004, -h + 0.07], [R + 0.004, h - 0.07], [R - 0.012, h - 0.02], [R - 0.05, h + 0.004], [i, h]];
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}
// one wheel: tyre, the compound's sidewall band (both sides), rim and its face; lying flat (axis y) at x, y, z, or
// standing (axis z) with up = false. blanket: slot name for a blanket over it (no band then: the blanket hides it)
export function wheel(P, lod, x, y, z, { standing = false, band = "bandM", blanket = null, w = TYRE.w } = {}) {
  const rx = standing ? Math.PI / 2 : 0, s = SEG[lod];
  P.add("tyre", tyreGeo(lod, w), x, y, z, rx);
  if (blanket) P.add(blanket, blanketGeo(lod, w), x, y, z, rx);
  else if (lod < 2) for (const sg of [-1, 1]) { const t = new THREE.TorusGeometry(TYRE.r - 0.075, 0.009, 4, s * 2); t.rotateX(Math.PI / 2); t.translate(0, sg * (w / 2 - 0.004), 0); if (standing) t.rotateX(Math.PI / 2); P.add(band, t, x, y, z); }
  // the rim: a dark barrel and its dished face toward +y (lying) / +z (standing), the nut
  P.cyl("rim", TYRE.rim, TYRE.rim, w * 0.9, s * 2, x, y, z, rx, 0, 0, true);
  if (lod < 2) {
    const f = new THREE.CylinderGeometry(TYRE.rim * 0.98, TYRE.rim * 0.7, 0.05, s * 2); f.translate(0, w * 0.42, 0); if (standing) f.rotateX(Math.PI / 2); P.add("rim", f, x, y, z);
    const n = new THREE.CylinderGeometry(0.045, 0.05, 0.07, Math.max(6, s)); n.translate(0, w * 0.47, 0); if (standing) n.rotateX(Math.PI / 2); P.add("chrome", n, x, y, z);
  }
}
const castor = (P, lod, x, z, r = 0.05) => { if (lod > 1) return; P.cyl("rubber", r, r, 0.035, SEG[lod], x, r, z, 0, 0, Math.PI / 2); P.box("steel", 0.05, 0.05, 0.05, x, r * 2 + 0.02, z); };

// roll cabinet with a worktop: body, drawer fronts (slot "drawer": the team's choice – accent / steel / light), handles
export function cabinet(P, lod, { w = 1.25, d = 0.62, h = 1.02, drawers = 6 } = {}) {
  const base = lod < 2 ? 0.12 : 0, bh = h - base - 0.04;
  P.box("cab", w, bh, d - 0.02, 0, base + bh / 2, -0.01);
  P.box("rubber", w + 0.02, 0.035, d + 0.02, 0, h - 0.0175, 0);       // the worktop's mat
  if (lod === 2) { P.box("drawer", w - 0.06, bh - 0.06, 0.01, 0, base + bh / 2, d / 2 - 0.015); return; }
  const dh = (bh - 0.06) / drawers;
  for (let i = 0; i < drawers; i++) {
    const y = base + 0.03 + dh * i + dh / 2;
    P.box("drawer", w - 0.05, dh - 0.012, 0.012, 0, y, d / 2 - 0.012);
    if (lod === 0) P.box("steel", w * 0.7, 0.014, 0.022, 0, y + dh / 2 - 0.03, d / 2 + 0.006); else if (i % 2 === 0) P.box("steel", w * 0.7, 0.014, 0.02, 0, y + dh / 2 - 0.03, d / 2 + 0.004);
  }
  if (lod === 0) P.bar("steel", [-w / 2 - 0.04, h - 0.18, -0.15], [-w / 2 - 0.04, h - 0.18, 0.15], 0.022, 8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) castor(P, lod, sx * (w / 2 - 0.08), sz * (d / 2 - 0.08));
}
// tall locker: two doors, vents, handles
export function tallCab(P, lod, { w = 0.92, d = 0.6, h = 1.95 } = {}) {
  P.box("cab", w, h - 0.06, d - 0.02, 0, (h - 0.06) / 2 + 0.06, -0.01);
  P.box("dark", w - 0.02, 0.06, d - 0.06, 0, 0.03, 0);
  P.box("accent", w - 0.02, 0.035, 0.014, 0, h - 0.12, d / 2 - 0.004);
  if (lod === 2) { P.box("cab", w - 0.04, h - 0.2, 0.01, 0, h / 2 + 0.03, d / 2 - 0.015); return; }
  for (const sx of [-1, 1]) {
    P.box("cab", w / 2 - 0.025, h - 0.22, 0.012, sx * w / 4, h / 2 + 0.03, d / 2 - 0.012);
    P.box("steel", 0.02, 0.24, 0.025, sx * 0.04, h * 0.55, d / 2 + 0.006);
    if (lod === 0) for (let k = 0; k < 5; k++) P.box("dark", w / 2 - 0.16, 0.012, 0.004, sx * w / 4, h - 0.3 - k * 0.03, d / 2 - 0.004);
  }
}
// tyre rack: a steel frame, two shelves of two wheels standing (sidewall bands: the compounds of a weekend's sets)
export function tyreRack(P, lod, { w = 1.62, d = 0.82, h = 1.98, bands = ["bandS", "bandM", "bandH", "bandM"] } = {}) {
  const post = 0.045, shelves = [0.06, 0.98];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box("steel", post, h, post, sx * (w / 2 - post / 2), h / 2, sz * (d / 2 - post / 2));
  for (const y of [...shelves, h - 0.03]) for (const sz of [-1, 1]) P.box("steel", w, 0.04, 0.04, 0, y, sz * (d / 2 - 0.02));
  for (const y of shelves) { P.box("steel", 0.04, 0.04, d, -w / 4, y, 0); P.box("steel", 0.04, 0.04, d, w / 4, y, 0); }
  let k = 0;
  for (const y of shelves) for (const sx of [-1, 1]) wheel(P, lod, sx * (w / 4 + 0.01), y + 0.02 + TYRE.r, 0, { standing: true, band: bands[k++ % bands.length] });
}
// tyre trolley: a castor base and a set's stack in blankets (slot "fabricAccent" or "fabric": the team's choice), the
// blanket controller on top with its lead
export function trolley(P, lod, { w = 0.95, d = 0.95, wheels = 4, blanket = "fabricAccent" } = {}) {
  P.box("dark", w, 0.05, d, 0, 0.14, 0);
  if (lod < 2) for (const sz of [-1, 1]) P.box("steel", w, 0.03, 0.03, 0, 0.18, sz * (d / 2 - 0.015));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) castor(P, lod, sx * (w / 2 - 0.08), sz * (d / 2 - 0.08), 0.06);
  const th = TYRE.w + 0.04;
  for (let i = 0; i < wheels; i++) wheel(P, lod, 0, 0.17 + th / 2 + i * th, 0, { blanket, w: TYRE.w });
  const top = 0.17 + wheels * th;
  P.box("dark", 0.3, 0.12, 0.2, 0.08, top + 0.06, -0.12);
  if (lod === 0) { P.box("screen", 0.08, 0.04, 0.005, 0.08, top + 0.07, -0.018); P.tube("hose", [[0.2, top + 0.05, -0.12], [0.38, top - 0.2, -0.1], [0.4, top - 0.7, 0.05], [0.39, 0.4, 0.1]], 0.008, 16, 5); }
  // the blankets' colour tag (which car's set: research – colour-coded blankets, Jalopnik/Williams)
  if (lod < 2) for (let i = 0; i < wheels; i++) P.box(i % 2 ? "light" : "accent", 0.12, 0.06, 0.006, 0, 0.17 + th / 2 + i * th, TYRE.r + 0.028);
}
// a pneumatic wheel gun: body, the socket in front, the pistol grip, the air coupling (lying along z at x, y, z)
function gun(P, lod, x, y, z, ry = 0) {
  const s = SEG[lod];
  P.cyl("dark", 0.055, 0.06, 0.3, s, x, y, z, Math.PI / 2, ry);
  P.cyl("chrome", 0.042, 0.042, 0.1, s, x + Math.sin(ry) * 0.2, y, z + Math.cos(ry) * 0.2, Math.PI / 2, ry);
  P.box("rubber", 0.05, 0.16, 0.06, x - Math.sin(ry) * 0.06, y - 0.1, z - Math.cos(ry) * 0.06, -0.25, ry);
  if (lod === 0) P.box("accent", 0.062, 0.03, 0.12, x, y + 0.06, z, 0, ry);
}
// wall board: the wheel guns in their holsters, coiled air hoses, sockets on a shelf (motorsport.com: wall units with
// housings for the in-garage wheel guns)
export function guns(P, lod, { w = 1.1, d = 0.34, h = 1.75 } = {}) {
  P.box("dark", w, h - 0.25, 0.04, 0, 0.25 + (h - 0.25) / 2, -d / 2 + 0.02);
  if (lod === 2) { P.box("chrome", w * 0.6, 0.2, 0.15, 0, 1.2, -0.05); return; }
  P.box("steel", w, 0.025, 0.24, 0, 1.25, -d / 2 + 0.14);
  for (const sx of [-0.28, 0.28]) { P.box("steel", 0.14, 0.03, 0.12, sx, 0.95, -d / 2 + 0.1); gun(P, lod, sx, 1.02, -d / 2 + 0.15, 0); }
  for (const sx of [-0.3, 0.3]) { const t = new THREE.TorusGeometry(0.2, 0.013, 5, SEG[lod] * 2); t.rotateX(0); P.add("hose", t, sx, 0.62, -d / 2 + 0.07); if (lod === 0) { const t2 = new THREE.TorusGeometry(0.18, 0.013, 5, SEG[lod] * 2); P.add("hose", t2, sx, 0.62, -d / 2 + 0.1); } }
  if (lod === 0) for (let k = 0; k < 6; k++) P.cyl("chrome", 0.03, 0.03, 0.07, 10, -0.4 + k * 0.16, 1.3, -d / 2 + 0.12);
  P.box("accent", w, 0.05, 0.045, 0, h - 0.05, -d / 2 + 0.03);
}
// cooling unit on castors: a grille and fan in front, a flexible duct that reaches out toward the car's sidepod
export function cooling(P, lod, { w = 0.72, d = 0.66, h = 1.18, reach = 0.9 } = {}) {
  P.box("light", w, h - 0.14, d, 0, 0.14 + (h - 0.14) / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) castor(P, lod, sx * (w / 2 - 0.08), sz * (d / 2 - 0.08), 0.06);
  if (lod === 2) { P.box("dark", w - 0.12, h * 0.4, 0.01, 0, h * 0.45, d / 2); return; }
  for (let k = 0; k < 8; k++) P.box("dark", w - 0.14, 0.018, 0.012, 0, 0.3 + k * 0.045, d / 2 + 0.004);
  P.cyl("dark", 0.2, 0.2, 0.02, SEG[lod] * 2, 0, h - 0.33, d / 2 + 0.005, Math.PI / 2);
  P.cyl("steel", 0.05, 0.05, 0.03, SEG[lod], 0, h - 0.33, d / 2 + 0.015, Math.PI / 2);
  P.box("accent", w + 0.004, 0.04, d + 0.004, 0, h - 0.06, 0);
  if (lod === 0) P.bar("steel", [-w / 2 + 0.06, h + 0.12, -d / 2 + 0.05], [w / 2 - 0.06, h + 0.12, -d / 2 + 0.05], 0.025, 8);
  // the duct: a ribbed hose (rings on lod 0) from the top to the car side
  const pts = [[0, h, 0.05], [0, h + 0.2, d / 2], [0, h * 0.85, d / 2 + reach * 0.6], [0, 0.62, d / 2 + reach]];
  P.tube("hose", pts, 0.075, lod === 0 ? 24 : 10, SEG[lod]);
  if (lod === 0) { const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))); for (let k = 1; k < 12; k++) { const p = c.getPoint(k / 12), t = c.getTangent(k / 12), r = new THREE.TorusGeometry(0.078, 0.008, 4, 12); r.lookAt(t); P.add("hose", r, p.x, p.y, p.z); } }
}
// an airfoil section (chord c along z, thickness t) extruded over span s (x), its leading edge at z = 0
function foil(c, t, s, seg) {
  const sh = new THREE.Shape(), n = Math.max(4, seg);
  for (let i = 0; i <= n; i++) { const x = i / n, y = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4); i ? sh.lineTo(x * c, y) : sh.moveTo(0, 0); }
  for (let i = n; i >= 0; i--) { const x = i / n; sh.lineTo(x * c, -0.25 * 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x)); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: s, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -s / 2); g.rotateY(Math.PI / 2);   // span along x, chord along −z…
  return g;
}
// a spare front wing on its A-frame trolley: main plane and flaps (carbon, the top flap in the livery's accent), endplates
export function wingStand(P, lod, { w = 1.95, d = 0.72, h = 1.2 } = {}) {
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.12);
    P.bar("steel", [x, 0.12, -d / 2 + 0.06], [x, h - 0.15, 0], 0.035, lod ? 0 : 8);
    P.bar("steel", [x, 0.12, d / 2 - 0.06], [x, h - 0.15, 0], 0.035, lod ? 0 : 8);
    P.box("steel", 0.04, 0.04, d, x, 0.1, 0);
    for (const sz of [-1, 1]) castor(P, lod, x, sz * (d / 2 - 0.06));
  }
  P.box("steel", w - 0.2, 0.04, 0.04, 0, 0.32, 0);
  const span = w - 0.12, y = h - 0.32, seg = [10, 6, 3][lod];
  P.add("carbon", foil(0.3, 0.06, span, seg), 0, y, 0.2, -0.08);
  P.add("carbon", foil(0.2, 0.06, span * 0.98, seg), 0, y + 0.06, -0.08, -0.32);
  P.add("accent", foil(0.16, 0.06, span * 0.96, seg), 0, y + 0.13, -0.24, -0.55);
  for (const sx of [-1, 1]) P.box("carbon", 0.018, 0.32, 0.52, sx * span / 2, y + 0.04, -0.02);
  for (const sx of [-1, 1]) P.box("rubber", 0.06, 0.06, 0.06, sx * (w / 2 - 0.12), h - 0.15, 0);
}
// shelving with parts bins (the spare parts' bins and racks at the back and sides – motorsport.com)
export function bins(P, lod, { w = 1.45, d = 0.5, h = 1.9 } = {}) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box("steel", 0.035, h, 0.035, sx * (w / 2 - 0.02), h / 2, sz * (d / 2 - 0.02));
  const ys = [0.08, 0.55, 1.02, 1.49, h - 0.02];
  for (const y of ys) P.box("dark", w, 0.025, d, 0, y, 0);
  if (lod === 2) { P.box("plastic", w - 0.1, 1.3, d - 0.08, 0, 0.82, 0); return; }
  for (let s = 0; s < 4; s++) for (let k = 0; k < 3; k++) {
    const bw = (w - 0.12) / 3 - 0.02, bh = 0.26 + ((s + k) % 2) * 0.06, x = -w / 2 + 0.06 + bw / 2 + k * (bw + 0.02), y = ys[s] + 0.015 + bh / 2;
    P.box("plastic", bw, bh, d - 0.08, x, y, 0);
    if (lod === 0) P.box("light", bw * 0.4, 0.05, 0.004, x, y + bh * 0.15, d / 2 - 0.038);
  }
}
// a monitor on a stand: dark bezel and its screen (slot "screen", uv in the shared atlas's quadrant q)
function monitor(P, lod, x, y, z, q, sw = 0.6, sh = 0.36, ry = 0, stand = true) {
  P.box("dark", sw + 0.03, sh + 0.03, 0.035, x, y, z, 0, ry);
  const g = new THREE.PlaneGeometry(sw, sh), uv = g.attributes.uv, u0 = (q % 2) * 0.5, v0 = q < 2 ? 0.5 : 0;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
  g.translate(0, 0, 0.0185); P.add("screen", g, x, y, z, 0, ry);
  if (stand && lod < 2) P.box("steel", 0.04, Math.max(0.05, y - sh / 2 - 0.92), 0.04, x, (y - sh / 2 + 0.92) / 2, z - 0.06);
}
// work bench: steel top, drawers under, a back panel with the monitors (the engineers' data feeds – made-up pictures)
export function bench(P, lod, { w = 2.5, d = 0.82, h = 0.95, monitors = 2 } = {}) {
  P.box("steel", w, 0.04, d, 0, h - 0.02, 0);
  P.box("cab", w * 0.36, h - 0.18, d - 0.08, -w / 2 + w * 0.18 + 0.03, (h - 0.18) / 2 + 0.1, -0.02);
  if (lod < 2) for (let i = 0; i < 4; i++) P.box("drawer", w * 0.34, 0.15, 0.012, -w / 2 + w * 0.18 + 0.03, 0.22 + i * 0.17, d / 2 - 0.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) if (!(sx < 0)) P.box("steel", 0.05, h - 0.04, 0.05, sx * (w / 2 - 0.05), (h - 0.04) / 2, sz * (d / 2 - 0.05));
  P.box("dark", w, 0.8, 0.03, 0, h + 0.4, -d / 2 + 0.015);
  const n = Math.max(1, Math.min(4, monitors)), mw = Math.min(0.6, (w - 0.2) / n - 0.05);
  for (let i = 0; i < n; i++) monitor(P, lod, -w / 2 + (w / n) * (i + 0.5), h + 0.45, -d / 2 + 0.12, i % 4, mw, mw * 0.6);
  if (lod < 2) { P.box("dark", 0.45, 0.02, 0.15, w * 0.15, h + 0.01, 0.1); P.box("dark", 0.36, 0.02, 0.26, -w * 0.12, h + 0.01, 0.12); }
}
// the engineers' desk: a long desk, a row of monitors, chairs
export function desk(P, lod, { w = 2.8, d = 0.9, h = 0.76, monitors = 3 } = {}) {
  P.box("light", w, 0.04, d, 0, h - 0.02, 0);
  for (const sx of [-1, 1]) P.box("dark", 0.05, h - 0.04, d - 0.1, sx * (w / 2 - 0.05), (h - 0.04) / 2, 0);
  const n = Math.max(2, Math.min(4, monitors + 1)), mw = Math.min(0.62, (w - 0.1) / n - 0.04);
  for (let i = 0; i < n; i++) monitor(P, lod, -w / 2 + (w / n) * (i + 0.5), h + 0.36, -d / 2 + 0.15, (i + 1) % 4, mw, mw * 0.6);
  if (lod < 2) for (let i = 0; i < 2; i++) { const x = -w / 4 + i * w / 2; P.box("rubber", 0.48, 0.07, 0.46, x, 0.5, d / 2 + 0.35); P.box("rubber", 0.46, 0.5, 0.06, x, 0.8, d / 2 + 0.58); P.cyl("steel", 0.025, 0.025, 0.45, 8, x, 0.24, d / 2 + 0.35); }
}
// a jack lying on the floor: two dark rails, the lifting head with its cradle and wheels at the front (+z end), the
// handle with a team-colour sleeve (styling, not a source) and its grip at the back
export function jack(P, lod, { w = 0.55, d = 1.75 } = {}) {
  for (const sx of [-1, 1]) P.box("dark", 0.05, 0.05, d - 0.25, sx * 0.1, 0.18, -0.1);
  P.box("dark", 0.3, 0.16, 0.22, 0, 0.12, d / 2 - 0.2);
  P.box("steel", w * 0.9, 0.05, 0.12, 0, 0.26, d / 2 - 0.12);
  if (lod < 2) for (const sx of [-1, 1]) P.cyl("rubber", 0.07, 0.07, 0.05, SEG[lod], sx * 0.2, 0.07, d / 2 - 0.22, 0, 0, Math.PI / 2);
  P.bar("accent", [0, 0.2, -d / 2 + 0.25], [0, 0.38, -d / 2 + 0.02], 0.04);
  P.box("rubber", 0.38, 0.045, 0.045, 0, 0.4, -d / 2 + 0.02);
}
// the overhead gantry along the car (motorsport.com / Red Bull: lighting, pneumatic air lines, air extraction, the
// driver monitor and power hang from it; built first, before the walls – Toyota archive). In the bay frame: from z0 to z1
// along the car's centre line, its top at y1 (the ceiling), its lowest part at y0. kind "twin": two beams.
export function boom(P, lod, { z0, z1, y0, y1, kind = "single", hoses = 3 }) {
  const L = z1 - z0, zc = (z0 + z1) / 2, yb = y1 - 0.35, xs = kind === "twin" ? [-0.55, 0.55] : [0];
  for (const x of xs) {
    // the truss: two chords and the hangers to the ceiling
    P.box("steel", 0.1, 0.08, L, x, yb + 0.25, zc); P.box("steel", 0.1, 0.08, L, x, yb, zc);
    if (lod < 2) { const n = Math.max(2, Math.round(L / 0.8)); for (let i = 0; i <= n; i++) { const z = z0 + (L * i) / n; P.box("steel", 0.04, 0.25, 0.04, x, yb + 0.125, z); if (lod === 0 && i < n) P.bar("steel", [x, yb, z], [x, yb + 0.25, z + L / n], 0.025); } }
    for (const z of [z0 + 0.1, z1 - 0.1]) P.box("steel", 0.04, y1 - yb - 0.25, 0.04, x, (y1 + yb + 0.25) / 2, z);
    // the services panel under it: lights in its underside (the glow strip – a real light sits there: lights.js),
    // sockets, the umbilical's reel
    P.box("dark", 0.42, 0.14, L * 0.7, x, yb - 0.1, zc);
    P.box("glow", 0.3, 0.012, L * 0.62, x, yb - 0.175, zc);
    if (lod < 2) P.cyl("dark", 0.14, 0.14, 0.18, SEG[lod], x + 0.28, yb - 0.08, z0 + L * 0.25, 0, 0, Math.PI / 2);
  }
  // hoses and cables dropping to the car in loops (air lines, the umbilical, power), each a catenary-ish curve whose lowest
  // point stays at y0 or above
  const n = lod === 2 ? 1 : hoses, x0 = xs[0];
  for (let i = 0; i < n; i++) {
    const z = z0 + L * (0.2 + 0.6 * (i / Math.max(1, n - 1))), side = i % 2 ? 0.35 : -0.35, lo = y0 + 0.08 * i;
    P.tube(i === 1 ? "accent" : "hose", [[x0, yb - 0.17, z], [x0 + side * 0.5, lo + (yb - lo) * 0.45, z + 0.15], [x0 + side, lo, z + 0.35], [x0 + side * 1.1, lo + 0.25, z + 0.6]], 0.016 + 0.006 * (i % 2), lod === 0 ? 20 : 8, lod === 0 ? 6 : 4);
    if (lod === 0) P.cyl("chrome", 0.025, 0.025, 0.08, 8, x0 + side * 1.1, lo + 0.25, z + 0.6, Math.PI / 2);
  }
  // the exhaust extraction: a wide flexible duct hanging at the rear of the car
  if (lod < 2) P.tube("hose", [[x0, yb - 0.1, z1 - 0.05], [x0 - 0.1, (y0 + yb) / 2, z1 + 0.15], [x0 - 0.15, y0 + 0.1, z1 + 0.35]], 0.09, lod === 0 ? 14 : 6, SEG[lod]);
  // the driver's monitor, hanging ahead of the cockpit, facing the driver (toward +z: the car's nose is at the door)
  const zm = z0 + Math.min(L * 0.3, 1.5);
  P.box("steel", 0.03, Math.max(0.05, yb - 0.17 - (y0 + 0.33)), 0.03, x0, (yb - 0.17 + y0 + 0.33) / 2, zm - 0.03);
  monitor(P, lod, x0, y0 + 0.2, zm, 3, 0.42, 0.26, 0, false);
}
// what the planner's kinds draw
export const BUILD = { cabinet, tallCab, tyreRack, trolley, guns, cooling, wingStand, bins, bench, desk, jackF: (P, lod) => jack(P, lod, { d: 1.75 }), jackR: (P, lod) => jack(P, lod, { d: 1.45 }) };
