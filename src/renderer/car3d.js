// Formula 1 cars for the 3D view (nose towards +Z, +X the car's left, ground at y = 0, metres), one model per
// season era – the car of that year, not today's on every race –, with a cockpit and driver that hold up close (the
// broadcast T-cam looks down on them) and fewer parts far away.
//
// Model contract (every profile): metres, +Y up, nose +Z, origin on the ground between the axles' midpoint; wheel
// pivots at the axles (steer about Y, roll about X); front-wing flap pivot at its leading edge, rear-wing flap (DRS /
// active aero) at its leading edge; mounts in car coordinates: TCAM (the broadcast camera on the airbox), EYE (the
// driver's eyes); bounds (length, width, height); LOD: "near" (cockpit interior, hands, steering wheel, wheel
// deflectors and other small parts), "mid" (the car), "far" (wheel covers and lights off). See PROFILES for each era's
// numbers and where they come from (rules' limits vs. published or estimated figures).
//
// Eras:
//   2026      – 2026 rules: 3.4 m wheelbase max, 1.9 m wide, narrower front wing on twin pylons, no wheel arches,
//               active aero (both wings' flaps open on straights), no beam wing, smaller tyres.
//   2022      – 2022–2025 ground-effect cars: 3.6 m wheelbase (the rules' maximum; teams ran at or near it), 2.0 m
//               wide, four-element front wing rising outboard, wheel deflectors over the front tyres, 18-inch wheels
//               with covers, beam wing, DRS on the rear wing.
// Team variants (only where the shape was checked against photos of that car; the rest of the field gets the era's
// neutral shape in their colours): "rb21" – Red Bull RB21 (2025): letterbox sidepod inlet high and narrow, steep
// downwash ramp, deep undercut, matte navy paint. Proportions are estimates from photos and the rules' limits, not team
// measurements.
//
// No sponsor or team logos are drawn (none are licensed for this app): liveries are the team's colour zones and the
// car number. Helmets are in team colours, not the drivers' own designs.
import * as THREE from "./vendor/three.module.js";
import { shapeFor } from "./carshapes.js";

// ---------- profiles ----------
// FZ/RZ: axle positions along the car, FR/RR tyre radii, FW/RW tyre widths, W: overall width (outer tyre faces),
// H: height of the airbox top. src: where the numbers come from.
export const PROFILES = {
  2026: {
    era: "2026", FZ: 1.7, RZ: -1.7, FR: 0.353, RR: 0.355, FW: 0.28, RW: 0.375, W: 1.9, H: 0.95,
    // the broadcast T-cam, fitted to the 2026 onboard footage (Leclerc, Australian GP start – formula1.com, compared
    // only): the horizon, both front tyres' tops and the halo's top in one frame give the camera 1.10 m up, 0.46 m behind
    // the car's middle, looking down 15.5°, a 72° wide lens (16:9). Checked against two more (v0.22: Verstappen,
    // Singapore pole lap, a level straight; Russell, Barcelona pole lap, a corner – formula1.com thumbnails, 1920×1080,
    // compared only): tyres' tops (0.25, 0.39)/(0.76, 0.40) – the app 0.25/0.75, 0.39 –, horizon ~0.17 (0.17), helmet's
    // top 0.73 (0.72), mirror 0.62 (0.62). In both the helmet stands right of the middle (its centre 0.62–0.66 across)
    // while the tyres are centred (0.505): a lens off the car's centreline, turned back in – 8 cm to the left, 2° to the
    // right (solved from tyres and helmet; the halo's top then lands at 0.55, footage 0.535). A few points from two frames:
    // a few cm, a degree or two – not a measured mount
    // the helmet as wide (~30 % of the frame in the two newer frames, ~47 % in the first – that one closer in) with its
    // top at ~72 % down: ~0.41 m ahead of the lens, its top ~0.90 m up, ~28 cm across (a racing helmet with its visor)
    tcam: [0.08, 1.10, -0.46], tcamPitch: 15.5, tcamYaw: -2, tcamHfov: 72, eye: [0, 0.81, 0.0], helmet: [0, 0.755, -0.05], helmetSize: [0.14, 0.145, 0.16],
    src: "2026 F1 technical regulations: 3.4 m wheelbase max, 1.9 m width; tyre sizes from Pirelli's 2026 announcements (front ~705 mm, rear ~710 mm diameter; 25 mm / 30 mm narrower than 2025's 305 / 405 mm – motorsport.com) – the rest estimated",
  },
  2022: {
    era: "2022", FZ: 1.8, RZ: -1.8, FR: 0.36, RR: 0.36, FW: 0.305, RW: 0.405, W: 2.0, H: 0.95,
    // (no footage of these cars compared: the 2026 lens and angle, the mount from photos of the airbox – estimates)
    tcam: [0, 1.05, -0.52], tcamPitch: 15.5, tcamHfov: 72, eye: [0, 0.79, -0.06], helmet: [0, 0.735, -0.08],
    src: "2022–2025 F1 technical regulations: 3.6 m wheelbase max, 2.0 m width, 0.95 m height; 18-inch wheels, ~720 mm tyres (front ~305 mm, rear ~405 mm wide) – estimates; the rest from photos",
  },
};
// Team profiles, apart from the era's car: what is known of one team's car in one season – so far its T-cam, where
// a frame of that team's own onboard footage was fitted. `basis` says how far to trust it; a team without an entry
// uses the era's numbers (nothing is copied from another team).
export const TEAM_PROFILES = [
  { season: 2026, team: /ferrari/i, id: "ferrari-2026", camera: { tcam: [0, 1.10, -0.46], tcamPitch: 15.5, tcamYaw: 0, tcamHfov: 72 },
    basis: "fitted to Leclerc's 2026 Australian GP start onboard (straight, level car): tyres, halo, horizon; helmet and mirrors check out (the lens's sideways place not checked in that frame)" },
  { season: 2026, team: /red bull/i, id: "redbull-2026", camera: { tcam: [0.08, 1.10, -0.46], tcamPitch: 15.5, tcamYaw: -2, tcamHfov: 72 },
    basis: "checked against Verstappen's 2026 Singapore pole-lap onboard (level straight): tyres, horizon, helmet, mirror, halo – the lens 8 cm left of the centreline, turned 2° in" },
  { season: 2026, team: /mercedes/i, id: "mercedes-2026", camera: { tcam: [0.08, 1.10, -0.46], tcamPitch: 15.5, tcamYaw: -2, tcamHfov: 72 },
    basis: "Russell's 2026 Barcelona pole-lap onboard (a corner, car rolled): helmet right of the middle as in Verstappen's – the same lens place; heights not refitted from a rolled frame" },
  // (v0.20 tried a free fit to a Verstappen Singapore frame – read then as a rolled car – which put the lens 0.2 m behind
  // the car's middle and the helmet out of the frame: rejected. v0.22 keeps the height, distance, angle and lens and only
  // adds the sideways place above, which the tyres-vs-helmet offset in two frames calls for)
  // McLaren (Norris, Hungary) and Mercedes (Russell, Austria): only the left half of each frame is visible in the
  // thumbnails (a portrait over the rest) – too few points for a fit; the era's numbers are used
];
// Which model for a car: by season (the car of that year) and team – its shape that season (carshapes.js: the features
// photos and technical articles agree on; the event's date for a car changed during the season) – and the team's own
// profile (camera) on top. The template key carries the shape: one team's model is never handed to another.
export function profileFor(season, teamName, date = null) {
  const y = +season || new Date().getFullYear();
  const era = y >= 2026 ? "2026" : "2022";
  const shape = shapeFor(y, teamName, date);
  const team = TEAM_PROFILES.find((t) => t.season === y && t.team.test(teamName || "")) || null;
  return { key: shape ? `${era}:${shape.id}` : era, era, variant: shape?.id || null, shape, season: y, ...PROFILES[era], ...(team?.camera || {}), team: team?.id || null };
}
// (kept for callers of the old single model: the current era's numbers)
export const WHEELBASE = PROFILES[2026].FZ - PROFILES[2026].RZ;
const P26 = PROFILES[2026];
export const EYE = new THREE.Vector3(...P26.eye);
export const TCAM = new THREE.Vector3(...P26.tcam);

// ---------- geometry helpers ----------
// A section is [z, cy, halfWidth, halfHeight, cx = 0, power = 2.6] – a superellipse ring.
// Returns a smooth BufferGeometry with UVs: u along the car (0 = rear, 1 = front), v round the ring
// (0 at the bottom, 0.25 on the left, 0.5 on top, 0.75 on the right).
function loft(sections, ring = 24, uRange = [-2.9, 2.9], capEnds = true) {
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
// Sections given nose first, smoothed: each pair of neighbours gets `k` sections between them on a Catmull-Rom
// curve through all four numbers (no kinks between the hand-set sections).
function smoothSections(list, k = 2) {
  const out = [], n = list.length, at = (i) => list[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) for (let s = 0; s < (i === n - 2 ? k + 2 : k + 1); s++) {
    const t = s / (k + 1), p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    out.push(p1.map((_, j) => {
      if (j >= 4 && (p1[j] === undefined)) return undefined;
      const a = p0[j] ?? p1[j], b = p1[j], c = p2[j] ?? b, d = p3[j] ?? c;
      return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    }));
  }
  return out;
}
// A thin wing element: an airfoil-ish slab (rounded leading edge, thin trailing edge) spanning ±span/2
// at height y, leading edge at z, chord c, angle `aoa` (rad, leading edge up), dipping `dip` at the centre.
function wingElement(span, chord, thick, y, z, aoa = 0.12, dip = 0, segs = 16, rise = 0) {
  const prof = [[0, 0], [0.04, 0.55], [0.18, 0.9], [0.45, 1], [0.8, 0.55], [1, 0.08]];   // upper surface (fraction of chord, of thickness)
  const lower = [[1, -0.02], [0.6, -0.25], [0.25, -0.35], [0.06, -0.3], [0, 0]];
  const ring = [...prof, ...lower];
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const x = -span / 2 + (span * i) / segs, e = Math.abs(x) / (span / 2), f = 1 - e * e;
    // (rise: the outer ends turning up – the 2022 cars' wing tips sweeping up into the endplates)
    const yc = y - dip * Math.max(0, f) + rise * Math.pow(e, 6);
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
// a rounded box (soft edges catch the light: cockpit pads, mirror housings, camera pods)
function softBox(w, h, l, x, y, z, r = 0.25) {
  const g = new THREE.BoxGeometry(w, h, l, 8, 8, 8), p = g.attributes.position, v = new THREE.Vector3(), hx = w / 2, hy = h / 2, hz = l / 2, rr = Math.min(hx, hy, hz) * r * 4;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = new THREE.Vector3(Math.max(-hx + rr, Math.min(hx - rr, v.x)), Math.max(-hy + rr, Math.min(hy - rr, v.y)), Math.max(-hz + rr, Math.min(hz - rr, v.z)));
    const d = v.clone().sub(c); if (d.lengthSq() > 1e-12) v.copy(c).addScaledVector(d.normalize(), rr);
    p.setXYZ(i, v.x + x, v.y + y, v.z + z);
  }
  g.computeVertexNormals();
  return g;
}
const rod = (a, b, r = 0.012, seg = 6) => {   // a thin cylinder between two points
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, seg); g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q); g.translate(A.x, A.y, A.z); return g;
};
// A faired strut (wishbone, track rod): a flat aerofoil-like blade from a to b, `w` wide (lying flat), `t` thick.
function strut(a, b, w = 0.05, t = 0.016) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length(); d.normalize();
  const g = new THREE.CylinderGeometry(1, 1, len, 10); g.translate(0, len / 2, 0); g.scale(w / 2, 1, t / 2);
  // local y → along, local x → flat across (horizontal), local z → up
  let side = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
  const up = new THREE.Vector3().crossVectors(side, d).normalize();
  g.applyMatrix4(new THREE.Matrix4().makeBasis(side, d, up)); g.translate(A.x, A.y, A.z);
  return g;
}
// A tube swept along points with an elliptical section `a` × `b` (a across, in the curve's plane sideways; b up),
// smooth – the halo's hoop with its fairing.
function sweep(points, a, b, segs = 64, ring = 16) {
  const curve = new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(...q)), false, "centripetal");
  const pos = [], idx = [], uv = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), Bn = new THREE.Vector3(), P = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; curve.getPointAt(t, P); curve.getTangentAt(t, T);
    // the section's "up" kept as near world up as the curve allows (no twisting as Frenet frames would)
    N.crossVectors(T, UPV); if (N.lengthSq() < 1e-6) N.set(1, 0, 0); N.normalize(); Bn.crossVectors(N, T).normalize();
    for (let k = 0; k <= ring; k++) {
      const th = (k / ring) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      pos.push(P.x + N.x * a * c + Bn.x * b * s, P.y + N.y * a * c + Bn.y * b * s, P.z + N.z * a * c + Bn.z * b * s);
      uv.push(t, k / ring);
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < ring; k++) { const p = i * (ring + 1) + k, q = p + ring + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // (the winding faces out whichever way the curve runs)
  const n0 = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, 0), p0 = new THREE.Vector3().fromBufferAttribute(g.attributes.position, 0);
  curve.getPointAt(0, P);
  if (n0.dot(p0.sub(P)) < 0) { const a2 = g.index.array; for (let i = 0; i < a2.length; i += 3) [a2[i + 1], a2[i + 2]] = [a2[i + 2], a2[i + 1]]; g.computeVertexNormals(); }
  return g;
}
// A flat plate from a 2D outline (in the plane x = `at`; outline points [z, y]), `t` thick: endplates.
function plate(outline, at, t = 0.012) {
  const s = new THREE.Shape(); outline.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 6 });
  g.rotateY(-Math.PI / 2); g.translate(at + t / 2, 0, 0);
  return g;
}
// Merge geometries (all converted to non-indexed, keeping uv when every part has one).
function merge(list) {
  const parts = list.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g));
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
const both = (g) => merge([g, mirrorX(g)]);
// UVs in metres by box projection (each triangle on the plane its normal faces most): carbon weave and tyre grain
// keep their real size whatever the part's shape. `tile`: metres per texture repeat.
function metricUV(g, tile) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    let nx = 0, ny = 0, nz = 0; for (let k = 0; k < 3; k++) { nx += Math.abs(n.getX(i + k)); ny += Math.abs(n.getY(i + k)); nz += Math.abs(n.getZ(i + k)); }
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      const [u, v] = nx >= ny && nx >= nz ? [z, y] : ny >= nz ? [x, z] : [x, y];
      uv[(i + k) * 2] = u / tile; uv[(i + k) * 2 + 1] = v / tile;
    }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

// ---------- textures (shared, drawn once) ----------
const hasDom = typeof document !== "undefined";
const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const TEX = {};
const sharedTex = (key, make) => {
  if (!hasDom) return null;
  if (!TEX[key]) { const t = make(); t.userData.shared = true; TEX[key] = t; }
  return TEX[key];
};
// 2×2 twill carbon: tows 5 mm wide (a 4 cm repeat holds 8), drawn as colour – the tows a touch lighter one way
// than the other, as the weave catches the light (sRGB).
function carbonMaps() {
  return {
    colour: sharedTex("carbonC", () => {
      const N = 64, c = canvas(N, N), g = c.getContext("2d"), tow = N / 8;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        const warp = ((i + j) >> 1) % 2 === 0, gr = warp ? g.createLinearGradient(i * tow, 0, (i + 1) * tow, 0) : g.createLinearGradient(0, j * tow, 0, (j + 1) * tow);
        const v = warp ? 34 : 24; gr.addColorStop(0, `rgb(${v - 6},${v - 5},${v - 3})`); gr.addColorStop(0.5, `rgb(${v + 6},${v + 7},${v + 9})`); gr.addColorStop(1, `rgb(${v - 6},${v - 5},${v - 3})`);
        g.fillStyle = gr; g.fillRect(i * tow, j * tow, tow, tow);
      }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }),
  };
}
// The steering wheel's display when no driver's own data is on it (wheelscreen.js paints those): a neutral face – lights
// off, no gear, no made-up lap or delta
function wheelScreen() {
  return sharedTex("screen", () => {
    const c = canvas(256, 128), g = c.getContext("2d");
    g.fillStyle = "#050607"; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 10; i++) { g.fillStyle = "#16191c"; g.beginPath(); g.arc(28 + i * 22, 13, 7, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "#1d2f45"; g.fillRect(10, 34, 66, 70); g.fillRect(180, 34, 66, 70);
    g.fillStyle = "#3a434d"; g.font = "700 60px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("–", 128, 72);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  });
}
// A driver's own screen on this car's wheel (wheelscreen.js's texture – not the car's: never freed with it), or back to
// the neutral face (tex null)
export function setWheelScreen(car, tex) {
  const u = car.userData, mesh = u.screen; if (!mesh) return;
  if (!tex) { if (mesh.material !== u.screenShared) mesh.material = u.screenShared; return; }
  if (!u.screenOwn) u.screenOwn = new THREE.MeshBasicMaterial({ toneMapped: false });
  if (u.screenOwn.map !== tex) { u.screenOwn.map = tex; u.screenOwn.needsUpdate = true; }
  mesh.material = u.screenOwn;
}

// ---------- the template per profile (shared by every car of that profile) ----------
const TEMPLATES = new Map();
function template(prof) {
  if (TEMPLATES.has(prof.key)) return TEMPLATES.get(prof.key);
  const T = prof.era === "2026" ? body2026(prof) : body2022(prof);
  Object.assign(T, cockpit(prof), wheels(prof));
  // parts fixed to the car that share a material, merged: fewer objects to draw per car
  T.painted = merge([T.body, T.pods]); T.wing = merge([T.wing, T.halo]);
  T.lights = merge(T.lights);
  // (shared by every car: marked so freeing one car's model leaves them alone)
  const mark = (o) => { if (o?.isBufferGeometry) o.userData.shared = true; else if (o && typeof o === "object") Object.values(o).forEach(mark); };
  mark(T);
  T.box = new THREE.Box3().setFromBufferAttribute(T.painted.attributes.position);
  TEMPLATES.set(prof.key, T);
  return T;
}

// The halo (both eras: the hoop from rear mounts on the chassis up round the driver's head, the centre pillar down to
// the chassis ahead of the cockpit), its fairing thicker than the titanium tube under it.
function halo(p) {
  // (2026 footage: the hoop reads wide and flat from the T-cam. v0.22: its top bar ~6 % of the frame's height in the
  // Singapore and Barcelona pole-lap frames, its top edge at ~0.43 – the fairing ~9 cm across, ~4.5 cm thick, the top
  // at 0.91 m; it was 12 × 6 cm and 0.935 m, 8 % and 0.38 on screen)
  const wide = p.era === "2026";
  // (and its rear legs closer in: in that footage they meet the bottom of the frame ~a quarter in from each side)
  const k = wide ? 0.86 : 1;
  const top = wide ? 0.91 : 0.935;
  const hoop = sweep([[-0.335 * k, 0.6, -0.3], [-0.34 * k, 0.74, -0.16], [-0.31 * k, top - 0.075, 0.04], [-0.22, top - 0.02, 0.22], [0, top, 0.33], [0.22, top - 0.02, 0.22], [0.31 * k, top - 0.075, 0.04], [0.34 * k, 0.74, -0.16], [0.335 * k, 0.6, -0.3]], wide ? 0.045 : 0.046, wide ? 0.0225 : 0.034, 72, 18);
  // the pillar: a blade, wide across (the fairing), from the hoop's front down to the chassis
  const pillar = loft(smoothSections([[0.355, top - 0.01, 0.028, 0.03], [0.45, top - 0.075, 0.034, 0.03], [0.55, top - 0.175, 0.04, 0.028], [0.64, 0.64, 0.05, 0.03]].reverse(), 2), 14);
  return merge([hoop, pillar]);
}

// ---- a team's shape on the era's sections (carshapes.js) ----
// Body sections [z, y, half width, half height, x, roundness]; nose = the sections ahead of noseFrom. Pods likewise
// (one side's), their first two the inlet.
function shapeBody(sec, s, noseFrom) {
  if (!s) return sec;
  const tipZ = sec[0][0], n = s.nose || {};
  const lenF = { long: 1.14, medium: 1, short: 0.84 }[n.len] ?? 1, tipDy = { high: 0.05, mid: 0, low: -0.03 }[n.tip] ?? 0, wF = { narrow: 0.82, medium: 1, wide: 1.35 }[n.w] ?? 1;
  const box = s.airbox;
  return sec.map((q) => {
    const r = q.slice(); const [z] = q;
    if (z > noseFrom) {
      const k = (z - noseFrom) / (tipZ - noseFrom);          // 0 at the nose's root, 1 at its tip
      r[0] = noseFrom + (z - noseFrom) * lenF; r[1] = q[1] + tipDy * k; r[2] = q[2] * (1 + (wF - 1) * k);
    }
    // the airbox and the cover behind the driver's head
    if (z <= -0.35 && z >= -0.85) {
      if (box === "oval") { r[2] = q[2] * 0.82; r[3] = q[3] * 0.96; r[5] = 2.2; }
      else if (box === "rect") { r[2] = q[2] * 1.3; r[3] = q[3] * 1.04; r[5] = 4.5; }
    }
    if (s.cooling === "bulge" && z <= -1.0 && z >= -1.8) r[3] = q[3] * 1.12;
    return r;
  });
}
function shapePods(pod, s) {
  if (!s?.pod) return pod;
  const P = s.pod, z0 = pod[0][0], z1 = pod[pod.length - 1][0];
  return pod.map((q, i) => {
    const r = q.slice(), k = (z0 - q[0]) / (z0 - z1);        // 0 at the inlet, 1 at the tail
    if (i === 0 || i === 1) {
      const f = i === 0 ? 1 : 0.55;
      if (P.inlet === "letterbox") { r[3] = q[3] * (1 - 0.5 * f); r[2] = q[2] * (1 + 0.15 * f); r[1] = q[1] + 0.06 * f; }
      else if (P.inlet === "vertical") { r[2] = q[2] * (1 - 0.45 * f); r[3] = q[3] * (1 + 0.25 * f); r[4] = (q[4] ?? 0.5) - 0.06 * f; }
      else if (P.inlet === "wide") { r[2] = q[2] * (1 + 0.15 * f); r[3] = q[3] * (1 + 0.12 * f); }
    }
    if (P.undercut === "deep") { r[3] *= 0.82; r[1] += 0.025; } else if (P.undercut === "shallow") { r[3] *= 1.08; r[1] -= 0.01; }
    const ramp = P.top === "ramp" ? 1 : P.top === "halframp" ? 0.5 : 0, gully = P.top === "gully";
    if (ramp && k > 0.2) { r[1] -= 0.07 * ramp * (k - 0.2); r[3] *= 1 - 0.25 * ramp * (k - 0.2); }
    if (gully && k > 0.15 && k < 0.85) { r[1] += 0.025; r[3] *= 1.04; }
    return r;
  });
}
// the parts a shape adds: a cooling cannon or louvres, a serrated fin, the blades atop the front wing's endplates
function shapeParts(s, p, fwSpan, fwZ) {
  const out = [];
  if (!s) return out;
  if (s.cooling === "cannon") out.push(softBox(0.1, 0.09, 0.3, 0, 0.42, -2.0, 0.6));
  if (s.cooling === "louvres") for (const k of [1, -1]) for (let i = 0; i < 4; i++) out.push(boxAt(0.12, 0.008, 0.02, 0.36 * k, 0.4 - i * 0.012, -0.55 - i * 0.07));
  if (s.cooling === "split") for (const k of [1, -1]) out.push(softBox(0.06, 0.05, 0.18, 0.11 * k, 0.5, -1.55, 0.5));
  if (s.fin === "serrated") { out.push(boxAt(0.008, 0.11, 0.55, 0, 0.82, -1.2, 0.12)); for (let i = 0; i < 6; i++) out.push(boxAt(0.008, 0.035, 0.045, 0, 0.885, -0.98 - i * 0.085, 0, 0.6)); }
  if (s.blade) for (const k of [1, -1]) out.push(boxAt(0.12, 0.008, 0.42, (fwSpan / 2 - 0.05) * k, 0.31, fwZ));
  return out;
}

function body2022(p) {
  const rb = p.variant === "rb21";
  // body, nose first: nose (narrow, RB's nose tip sits on the wing's main plane) → survival cell → cockpit (low, open:
  // the driver sits in it) → airbox / roll hoop → engine cover → tail
  const sec = [
    [2.78, 0.19, 0.045, 0.035], [2.55, 0.22, rb ? 0.075 : 0.085, 0.06], [2.15, 0.29, 0.12, 0.095], [1.75, 0.36, 0.17, 0.14],
    [1.3, 0.425, 0.23, 0.18], [0.85, 0.455, 0.28, 0.19], [0.5, 0.45, 0.305, 0.175], [0.3, 0.42, 0.31, 0.135],
    [0.0, 0.41, 0.315, 0.13], [-0.22, 0.43, 0.32, 0.15], [-0.42, 0.53, 0.3, 0.29], [-0.75, 0.58, 0.25, 0.37],
    [-1.15, 0.52, 0.19, 0.28], [-1.6, 0.44, 0.13, 0.19], [-2.05, 0.37, 0.085, 0.12], [-2.45, 0.33, 0.05, 0.07],
  ];
  const body = loft(smoothSections(rb ? sec : shapeBody(sec, p.shape, 1.75), 2).reverse(), 32);
  // sidepods (left; the right is a mirror). RB21: a high, narrow letterbox inlet, a steep downwash ramp and a deep
  // undercut; the neutral shape a fuller pod.
  const podSec = rb
    ? [[0.62, 0.52, 0.11, 0.05, 0.47, 3.4], [0.5, 0.5, 0.16, 0.08, 0.5, 3.2], [0.2, 0.46, 0.2, 0.11, 0.53, 3], [-0.25, 0.4, 0.2, 0.12, 0.51, 2.8],
      [-0.75, 0.31, 0.16, 0.11, 0.45, 2.6], [-1.2, 0.24, 0.11, 0.08, 0.34], [-1.6, 0.19, 0.06, 0.05, 0.24], [-1.85, 0.17, 0.03, 0.03, 0.18]]
    : [[0.65, 0.42, 0.12, 0.11, 0.5, 3], [0.48, 0.42, 0.18, 0.15, 0.53, 3], [0.0, 0.4, 0.2, 0.16, 0.52, 2.8], [-0.5, 0.35, 0.18, 0.15, 0.48, 2.6],
      [-1.0, 0.28, 0.13, 0.12, 0.39], [-1.45, 0.22, 0.08, 0.08, 0.28], [-1.8, 0.18, 0.04, 0.05, 0.2]];
  const podL = loft(smoothSections(rb ? podSec : shapePods(podSec, p.shape), 2).reverse(), 22);
  const pods = both(podL);
  // floor: the 2022 floor, wide to the front tyres' wake, edge wing, the diffuser's big tunnels rising at the back
  const fl = new THREE.Shape();
  [[0.2, 1.25], [0.5, 1.02], [0.8, 0.72], [0.86, 0.35], [0.86, -0.9], [0.8, -1.3], [0.62, -1.55], [0.55, -2.35], [-0.55, -2.35], [-0.62, -1.55], [-0.8, -1.3], [-0.86, -0.9], [-0.86, 0.35], [-0.8, 0.72], [-0.5, 1.02], [-0.2, 1.25]]
    .forEach(([x, z], i) => (i ? fl.lineTo(x, -z) : fl.moveTo(x, -z)));
  const floor = new THREE.ExtrudeGeometry(fl, { depth: 0.04, bevelEnabled: false }); floor.rotateX(Math.PI / 2); floor.translate(0, 0.075, 0);
  const edge = both(wingElementSide(0.86, 0.075, 0.95, -0.85));
  const diffuser = merge([boxAt(1.0, 0.02, 0.62, 0, 0.19, -2.06, 0.38), boxAt(0.012, 0.22, 0.6, 0.5, 0.17, -2.05), boxAt(0.012, 0.22, 0.6, -0.5, 0.17, -2.05), boxAt(0.012, 0.18, 0.55, 0.2, 0.16, -2.05), boxAt(0.012, 0.18, 0.55, -0.2, 0.16, -2.05)]);
  // front wing: four elements sweeping up outboard into rounded endplates; the nose on the main plane
  const fwSpan = 1.95;
  const fw = [wingElement(fwSpan, 0.32, 0.03, 0.075, 2.92, 0.05, 0.02, 24, 0.05), wingElement(fwSpan - 0.06, 0.2, 0.026, 0.13, 2.68, 0.2, 0.025, 24, 0.09),
    wingElement(fwSpan - 0.1, 0.15, 0.022, 0.18, 2.52, 0.34, 0.03, 24, 0.12), wingElement(fwSpan - 0.14, 0.12, 0.02, 0.225, 2.4, 0.5, 0.03, 24, 0.14)];
  const epFront = [[3.0, 0.05], [3.0, 0.2], [2.85, 0.33], [2.5, 0.36], [2.3, 0.28], [2.3, 0.05]];
  const fwPlates = merge([plate(epFront, fwSpan / 2), plate(epFront, -fwSpan / 2 - 0.012)]);
  // rear wing: a spoon main plane, the DRS flap over it, rounded endplates, the beam wing under
  const rwSpan = 1.02;
  const rwMain = wingElement(rwSpan, 0.3, 0.04, 0.8, -2.12, 0.1, 0.035, 20);
  const rwFlap = wingElement(rwSpan - 0.02, 0.2, 0.026, 0.92, -2.3, 0.45, 0.02, 20);
  const ep = [[-2.0, 0.56], [-2.03, 0.8], [-2.13, 0.97], [-2.42, 1.0], [-2.5, 0.92], [-2.5, 0.62], [-2.36, 0.55]];
  const rwPlates = merge([plate(ep, rwSpan / 2 + 0.002), plate(ep, -rwSpan / 2 - 0.014)]);
  const beam = merge([wingElement(0.86, 0.14, 0.02, 0.36, -2.3, 0.15, 0, 12), wingElement(0.82, 0.12, 0.018, 0.43, -2.42, 0.4, 0, 12)]);
  const rwPylon = merge([boxAt(0.014, 0.42, 0.12, 0, 0.6, -2.3), boxAt(0.12, 0.12, 0.36, 0, 0.3, -2.45)]);
  const susp = suspension(p, (p.shape?.fsusp ?? "pull") === "pull", p.shape?.rsusp === "pull");
  // mirrors on the cockpit sides, a T-cam pod on the airbox, a small fin
  const mirrors = [], heads = [];
  for (const k of [1, -1]) { mirrors.push(strut([0.29 * k, 0.6, 0.5], [0.45 * k, 0.665, 0.52], 0.03, 0.012)); heads.push(softBox(0.16, 0.065, 0.06, 0.5 * k, 0.68, 0.52, 0.2)); }
  const tcamPod = softBox(0.1, 0.055, 0.13, 0, 0.995, -0.6, 0.3);   // (the lens at its front: the TCAM mount)
  const fin = boxAt(0.008, 0.12, 0.6, 0, 0.88, -1.15, 0.12);
  return {
    body, pods,
    carbon: metricUV(merge([floor, edge, diffuser, fw[0], fwPlates, rwPlates, rwPylon, beam, ...susp, ...mirrors, fin, tcamPod, ...shapeParts(rb ? null : p.shape, p, fwSpan, 2.6)]), 0.04),
    wing: merge([rwMain, ...heads]), fwFlaps: merge([fw[1], fw[2], fw[3]]), rwFlaps: rwFlap,
    fwPivot: [0.13, 2.68], rwPivot: [0.92, -2.3], aeroOpen: { fw: 0, rw: -0.75 },   // (2022–25: DRS opens the rear flap only)
    lights: [boxAt(0.14, 0.05, 0.02, 0, 0.3, -2.64)], halo: halo(p),
  };
}
// (the floor's edge wing: a short element along the floor edge)
function wingElementSide(x, y, z0, z1) { const g = wingElement(z0 - z1, 0.1, 0.012, 0, 0, 0.05, 0, 8); g.rotateY(Math.PI / 2); g.translate(x, y + 0.02, (z0 + z1) / 2); return g; }

function body2026(p) {
  const sec = [
    [2.42, 0.2, 0.05, 0.035], [2.3, 0.22, 0.085, 0.06], [2.0, 0.265, 0.12, 0.09], [1.6, 0.33, 0.175, 0.14],
    // (ahead of the cockpit the chassis stands high – ~0.67 m at the opening's front in the 2026 footage, hiding the
    // front suspension from the T-cam)
    // (v0.22: its top rounded – from the T-cam the chassis ahead of the opening reads ~0.32 m across near its top in the
    // 2026 pole-lap frames, not the full width of a box: elliptical sections there)
    [1.2, 0.42, 0.235, 0.2, 0, 2.1], [0.8, 0.46, 0.28, 0.22, 0, 2.1], [0.5, 0.47, 0.295, 0.2, 0, 2.2], [0.3, 0.43, 0.31, 0.14],
    // (the airbox stands over the helmet: in 2026 photos its inlet's top is ~0.1 m above the helmet's – an estimate)
    [0.0, 0.41, 0.315, 0.13], [-0.22, 0.43, 0.32, 0.15], [-0.42, 0.56, 0.3, 0.4], [-0.75, 0.6, 0.26, 0.4],
    [-1.2, 0.52, 0.22, 0.28], [-1.65, 0.43, 0.15, 0.19], [-2.1, 0.36, 0.085, 0.11], [-2.42, 0.32, 0.05, 0.06],
  ];
  const body = loft(smoothSections(shapeBody(sec, p.shape, 1.6), 2).reverse(), 32);
  const podL = loft(smoothSections(shapePods([
    [0.62, 0.38, 0.13, 0.12, 0.5, 3], [0.45, 0.39, 0.17, 0.15, 0.52, 3], [0.0, 0.37, 0.18, 0.16, 0.5, 2.8], [-0.5, 0.33, 0.17, 0.15, 0.46, 2.6],
    [-1.0, 0.28, 0.13, 0.12, 0.38], [-1.45, 0.23, 0.08, 0.08, 0.27], [-1.7, 0.2, 0.04, 0.05, 0.2],
  ], p.shape), 2).reverse(), 22);
  const fl = new THREE.Shape();
  [[0.22, 1.25], [0.6, 0.75], [0.74, 0.45], [0.74, -0.9], [0.66, -1.35], [0.5, -1.62], [0.5, -2.25], [-0.5, -2.25], [-0.5, -1.62], [-0.66, -1.35], [-0.74, -0.9], [-0.74, 0.45], [-0.6, 0.75], [-0.22, 1.25]]
    .forEach(([x, z], i) => (i ? fl.lineTo(x, -z) : fl.moveTo(x, -z)));
  const floor = new THREE.ExtrudeGeometry(fl, { depth: 0.05, bevelEnabled: false }); floor.rotateX(Math.PI / 2); floor.translate(0, 0.085, 0);
  const diffuser = boxAt(0.95, 0.02, 0.45, 0, 0.16, -2.05, 0.32);
  // front wing: three elements on twin pylons, endplates, no wheel arches
  const fwSpan = 1.72;
  const fw = [wingElement(fwSpan, 0.3, 0.035, 0.08, 2.72, 0.06, 0.025), wingElement(fwSpan - 0.06, 0.17, 0.028, 0.14, 2.5, 0.22, 0.02), wingElement(fwSpan - 0.12, 0.12, 0.024, 0.19, 2.36, 0.38, 0.015)];
  const pylons = merge([boxAt(0.012, 0.16, 0.32, 0.07, 0.16, 2.48), boxAt(0.012, 0.16, 0.32, -0.07, 0.16, 2.48)]);
  const fwPlates = merge([boxAt(0.012, 0.27, 0.62, fwSpan / 2, 0.16, 2.48), boxAt(0.012, 0.27, 0.62, -fwSpan / 2, 0.16, 2.48)]);
  const boards = merge([boxAt(0.01, 0.22, 0.35, 0.56, 0.24, 0.92, 0, 0.12), boxAt(0.01, 0.22, 0.35, -0.56, 0.24, 0.92, 0, -0.12)]);
  const rwSpan = 0.98;
  const rwMain = wingElement(rwSpan, 0.27, 0.04, 0.74, -2.08, 0.12, 0);
  const rwFlaps = merge([wingElement(rwSpan - 0.02, 0.17, 0.028, 0.84, -2.2, 0.42, 0), wingElement(rwSpan - 0.04, 0.12, 0.024, 0.9, -2.3, 0.62, 0)]);   // (top under the 0.95 m limit)
  const rwPlates = merge([boxAt(0.012, 0.56, 0.62, rwSpan / 2 + 0.006, 0.66, -2.24), boxAt(0.012, 0.56, 0.62, -rwSpan / 2 - 0.006, 0.66, -2.24)]);
  const rwPylons = merge([boxAt(0.012, 0.42, 0.12, 0.05, 0.56, -2.28), boxAt(0.012, 0.42, 0.12, -0.05, 0.56, -2.28), boxAt(0.12, 0.12, 0.36, 0, 0.33, -2.42), boxAt(0.6, 0.012, 0.06, 0, 0.5, -2.32)]);
  const susp = suspension(p, p.shape?.fsusp === "pull", p.shape?.rsusp === "pull");
  const mirrors = [], heads = [];
  // mirrors (2026 footage: larger and higher than before, either side of the halo's legs)
  for (const k of [1, -1]) { mirrors.push(strut([0.28 * k, 0.62, 0.46], [0.5 * k, 0.72, 0.48], 0.03, 0.012)); heads.push(softBox(0.22, 0.085, 0.07, 0.56 * k, 0.74, 0.48, 0.2)); }
  // the T-cam pod on the airbox (2026 photos: a black pod with its antennas well over the helmet); the lens at its front
  const tcamPod = merge([softBox(0.11, 0.075, 0.16, 0, 1.06, -0.58, 0.3), boxAt(0.006, 0.07, 0.03, 0.03, 1.12, -0.62), boxAt(0.006, 0.07, 0.03, -0.03, 1.12, -0.62)]);
  return {
    body, pods: both(podL),
    // (2026 halos are black carbon on every car in the footage and photos – not painted)
    carbon: metricUV(merge([floor, diffuser, fw[0], pylons, fwPlates, boards, rwPlates, rwPylons, ...susp, ...mirrors, tcamPod, halo(p), ...shapeParts(p.shape, p, fwSpan, 2.48)]), 0.04),
    wing: merge([rwMain, ...heads]), fwFlaps: merge([fw[1], fw[2]]), rwFlaps,
    fwPivot: [0.16, 2.5], rwPivot: [0.86, -2.2], aeroOpen: { fw: -0.28, rw: -0.55 },   // (2026: both wings' flaps open)
    lights: [boxAt(0.012, 0.05, 0.36, rwSpan / 2 + 0.014, 0.78, -2.24), boxAt(0.012, 0.05, 0.36, -rwSpan / 2 - 0.014, 0.78, -2.24), boxAt(0.06, 0.05, 0.02, 0, 0.36, -2.6)],
    halo: null,
  };
}

// Wishbones and push/pull rods (faired blades), each corner from the chassis to the upright – front and rear each
// push or pull as the team's car has them (carshapes.js; the era's default without one)
function suspension(p, pullFront, pullRear = false) {
  const out = [];
  for (const [z, wx, front] of [[p.FZ, p.W / 2 - p.FW / 2, true], [p.RZ, p.W / 2 - p.RW / 2, false]]) for (const k of [1, -1]) {
    const ox = (wx - 0.14) * k, cx = (front ? 0.2 : 0.22) * k;
    out.push(strut([cx, 0.46, z + 0.24], [ox, 0.47, z]), strut([cx, 0.46, z - 0.2], [ox, 0.47, z]));
    out.push(strut([cx, 0.22, z + 0.26], [ox, 0.2, z]), strut([cx, 0.22, z - 0.22], [ox, 0.2, z]));
    // (pull rod: from high on the upright down to the chassis; push rod: low on the upright up to the chassis)
    const pull = front ? pullFront : pullRear;
    out.push(pull ? strut([ox * 0.95, 0.45, z + (front ? -0.04 : 0.04)], [cx * 0.9, 0.2, z + (front ? -0.32 : 0.3)], 0.028, 0.014) : strut([ox * 0.95, 0.22, z + 0.02], [cx * 1.1, 0.5, z + (front ? -0.12 : 0.12)], 0.028, 0.014));
    // track rod (steering) in front
    if (front) out.push(strut([cx, 0.34, z + 0.1], [ox, 0.34, z + 0.08], 0.03, 0.012));
  }
  return out;
}

// The cockpit: its rim pads and headrest, the seat's dark interior, the steering wheel (with its screen, grips and
// paddles), the driver's helmet with visor, gloves and forearms.
function cockpit(p) {
  const [hx, hy, hz] = p.helmet;
  // the opening's rim (padded edge round it) and the headrest round the helmet's back and sides
  const rim = sweep([[0.26, 0.565, -0.32], [0.285, 0.575, -0.05], [0.27, 0.58, 0.25], [0.18, 0.585, 0.45], [0, 0.59, 0.5], [-0.18, 0.585, 0.45], [-0.27, 0.58, 0.25], [-0.285, 0.575, -0.05], [-0.26, 0.565, -0.32]], 0.03, 0.022, 48, 10);
  const headrest = merge([softBox(0.09, 0.15, 0.36, 0.2, 0.62, -0.12, 0.25), softBox(0.09, 0.15, 0.36, -0.2, 0.62, -0.12, 0.25), softBox(0.42, 0.2, 0.1, 0, 0.64, -0.33, 0.25)]);
  // the tub inside (dark), visible through the opening round the driver: seat back and shoulders
  const tub = merge([loft([[0.45, 0.53, 0.25, 0.02], [-0.3, 0.53, 0.26, 0.02]], 16), softBox(0.38, 0.12, 0.22, 0, 0.6, -0.2, 0.3)]);
  // helmet: an egg a little longer than wide, its chin bar lower in front; the visor a band over its eyes
  const [sx, sy, sz] = p.helmetSize || [0.13, 0.14, 0.155];
  const helmet = new THREE.SphereGeometry(1, 32, 24); helmet.scale(sx, sy, sz);
  { const q = helmet.attributes.position; for (let i = 0; i < q.count; i++) { const y = q.getY(i), z = q.getZ(i); if (y < -0.04 && z > 0) q.setY(i, y - 0.02 * (z / 0.155)); } helmet.computeVertexNormals(); }
  helmet.translate(hx, hy, hz);
  const visor = new THREE.SphereGeometry(1.01, 32, 8, Math.PI / 2 - 0.95, 1.9, 1.2, 0.42); visor.scale(sx, sy, sz); visor.translate(hx, hy, hz);
  // the steering wheel: a rounded rectangle, its face (screen, buttons: −z, towards the driver) tilted up to the
  // driver's eyes, grips and paddles behind
  const wz = 0.36, wy = 0.61, tilt = 0.42;
  const wheelBody = softBox(0.25, 0.14, 0.035, 0, 0, 0, 0.25);
  const grips = merge([softBox(0.055, 0.13, 0.055, 0.14, -0.005, 0.0, 0.45), softBox(0.055, 0.13, 0.055, -0.14, -0.005, 0.0, 0.45)]);
  const paddles = merge([boxAt(0.07, 0.07, 0.006, 0.08, 0.0, 0.03), boxAt(0.07, 0.07, 0.006, -0.08, 0.0, 0.03)]);
  const screen = new THREE.PlaneGeometry(0.11, 0.055); screen.rotateY(Math.PI); screen.translate(0, 0.02, -0.0185);
  const buttons = []; for (const [bx, by] of [[-0.1, 0.04], [0.1, 0.04], [-0.1, -0.03], [0.1, -0.03], [-0.07, -0.055], [0.07, -0.055], [-0.03, -0.055], [0.03, -0.055]]) { const b = new THREE.CylinderGeometry(0.008, 0.008, 0.01, 10); b.rotateX(Math.PI / 2); b.translate(bx, by, -0.02); buttons.push(b); }
  const column = rod([0, -0.02, 0.02], [0, -0.02, 0.2], 0.018, 10);
  // gloves on the grips; forearms back to the elbows, hidden lower in the cockpit; shoulders under the headrest
  // a fist round the grip: the fingers wrapped over its front, the thumb on the wheel's face
  const glove = (k) => { const g = new THREE.CapsuleGeometry(0.03, 0.05, 6, 12); g.scale(1.15, 1, 1); g.translate(0.145 * k, -0.005, 0.004); const th = new THREE.CapsuleGeometry(0.012, 0.03, 4, 8); th.rotateZ(0.9 * k); th.translate(0.112 * k, 0.03, -0.024); return merge([g, th]); };
  // (forearms in the car's frame: from the grips down and back to the elbows, inside the cockpit under its rim)
  const forearm = (k) => { const g = new THREE.CapsuleGeometry(0.033, 0.26, 4, 12); const A = new THREE.Vector3(0.15 * k, wy - 0.02, wz - 0.03), B = new THREE.Vector3(0.22 * k, 0.5, wz - 0.32); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize())); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); return g; };
  return {
    rim, headrest: merge([headrest, tub]), helmet, visor,
    wheel: { body: metricUV(merge([wheelBody, column, paddles]), 0.04), grips, screen, buttons: merge(buttons), gloves: merge([glove(1), glove(-1)]), arms: merge([forearm(1), forearm(-1)]), at: [0, wy, wz], tilt },
  };
}

// Wheels: the tyre (rounded profile, sidewall bulge), the rim's lip, the wheel cover (with the compound's coloured
// band on the sidewall), and on 2022–25 cars the deflector arching over the front tyre (it steers, doesn't spin).
function wheels(p) {
  const tyre = (r, w) => {
    const pts = [], rr = 0.07, rim = 0.247;   // (18-inch rim: ~0.247 m to its lip)
    pts.push(new THREE.Vector2(rim, -w / 2 + 0.01));
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; pts.push(new THREE.Vector2(r - rr + Math.sin(a) * rr, -w / 2 + rr - Math.cos(a) * rr - 0.004 * Math.sin(a * 2))); }
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; pts.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, w / 2 - rr + Math.sin(a) * rr + 0.004 * Math.sin(a * 2))); }
    pts.push(new THREE.Vector2(rim, w / 2 - 0.01));
    const g = new THREE.LatheGeometry(pts, 48); g.rotateZ(Math.PI / 2);    // axle along X
    return metricUV(g.toNonIndexed(), 0.25);
  };
  const band = (r, w) => { const g = new THREE.RingGeometry(r * 0.8, r * 0.86, 48); g.rotateY(Math.PI / 2); g.translate(w / 2 + 0.004, 0, 0); return both(g); };
  const lip = (w) => { const g = new THREE.TorusGeometry(0.247, 0.012, 6, 40); g.rotateY(Math.PI / 2); g.translate(w / 2 - 0.012, 0, 0); return both(g); };
  const cover = (r, w) => { const g = new THREE.CircleGeometry(0.245, 32); g.rotateY(Math.PI / 2); g.translate(w / 2 - 0.016, 0, 0); const mark = boxAt(0.004, 0.2, 0.04, w / 2 - 0.012, 0.1, 0); const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16); hub.rotateZ(Math.PI / 2); hub.translate(w / 2 - 0.006, 0, 0); return both(merge([g, mark, hub])); };
  const out = { front: { tyre: tyre(p.FR, p.FW), band: band(p.FR, p.FW), lip: lip(p.FW), cover: cover(p.FR, p.FW) }, rear: { tyre: tyre(p.RR, p.RW), band: band(p.RR, p.RW), lip: lip(p.RW), cover: cover(p.RR, p.RW) } };
  if (p.era === "2022") {
    // the deflector over the front tyre: an arc plate a few cm above the tread, from the top towards the front
    // (cylinder angle θ: after turning its axis along x, y = r·sin θ, z = r·cos θ – from over the top to the front)
    const arc = new THREE.CylinderGeometry(p.FR + 0.035, p.FR + 0.035, p.FW * 0.75, 24, 1, true, 0.55, 1.25);
    arc.rotateZ(Math.PI / 2);
    out.front.deflector = arc;
  }
  return out;
}

// ---------- liveries ----------
// base, top (spine/engine cover), side (sidepod band), accent (stripes, wing tips), nose tip, and whether the
// two sides differ (Cadillac's half-black, half-white); finish: matte paint (rougher). Matched on the feed's team name;
// by era where a team's colours changed.
const LIVERIES = [
  [/red bull racing/i, { base: "#1b2752", top: "#1b2752", side: "#d9123f", accent: "#ffcc1f", nose: "#ffcc1f", num: "#ffffff", finish: "matte" }],
  [/racing bulls|\bvcarb|alphatauri|rb f1/i, { base: "#f3f5f8", top: "#1c3faf", side: "#1c3faf", accent: "#e21b4d", nose: "#1c3faf", num: "#1c3faf" }],
  [/mercedes/i, { base: "#121315", top: "#c8cdd2", side: "#121315", accent: "#00d7b6", nose: "#c8cdd2", num: "#00d7b6" }],
  [/ferrari/i, { base: "#e8002d", top: "#ffffff", side: "#e8002d", accent: "#ffcd00", nose: "#e8002d", num: "#ffffff" }],
  [/mclaren/i, { base: "#ff8000", top: "#151515", side: "#151515", accent: "#47c7fc", nose: "#ff8000", num: "#151515" }],
  [/aston martin/i, { base: "#00594f", top: "#00594f", side: "#cedc00", accent: "#cedc00", nose: "#cedc00", num: "#cedc00" }],
  [/alpine/i, { base: "#0a3a8c", top: "#ff87bc", side: "#ff87bc", accent: "#ffffff", nose: "#0a3a8c", num: "#ffffff" }],
  [/williams/i, { base: "#0b3fa6", top: "#ffffff", side: "#41b6e6", accent: "#ffffff", nose: "#0b3fa6", num: "#ffffff" }],
  [/haas/i, { base: "#f2f2f2", top: "#151515", side: "#151515", accent: "#da291c", nose: "#151515", num: "#da291c" }],
  [/audi/i, { base: "#a9adb2", top: "#151515", side: "#e10600", accent: "#e10600", nose: "#151515", num: "#ffffff" }],
  [/kick sauber|sauber|stake/i, { base: "#151515", top: "#52e252", side: "#151515", accent: "#52e252", nose: "#52e252", num: "#52e252" }],
  [/cadillac/i, { base: "#111111", top: "#f2f2f2", side: "#111111", accent: "#c8a24a", nose: "#111111", num: "#f2f2f2", split: "#f2f2f2" }],
];
export function liveryFor(teamName, teamColour) {
  for (const [re, l] of LIVERIES) if (re.test(teamName || "")) return l;
  const c = "#" + (teamColour || "888888");
  return { base: c, top: c, side: "#151515", accent: "#ffffff", nose: c, num: "#ffffff" };
}
// The livery texture: x = along the car (0 rear → 1 front, matching the loft u), y = round the ring
// (canvas top = v 1 = right side bottom … see loft). Painted in bands; the car number on both sides and the nose.
const U0 = -2.9, U1 = 2.9;
function liveryTexture(l, number, prof) {
  if (!hasDom) return null;
  const W = 2048, H = 512, c = canvas(W, H);
  const g = c.getContext("2d");
  const V = (v) => (1 - v) * H;            // ring position → canvas y
  const U = (z) => ((z - U0) / (U1 - U0)) * W;  // car z → canvas x
  g.fillStyle = l.base; g.fillRect(0, 0, W, H);
  if (l.split) { g.fillStyle = l.split; g.fillRect(0, V(1), W, V(0.5) - V(1)); }               // one side another colour
  // top: spine and engine cover (around v = 0.5)
  g.fillStyle = l.top; g.fillRect(U(-2.9), V(0.58), U(0.1) - U(-2.9), V(0.42) - V(0.58));
  // side band along both flanks, sweeping up towards the rear (soft-edged: no hard pixel steps up close)
  g.fillStyle = l.side;
  for (const v of [0.28, 0.72]) { g.beginPath(); g.moveTo(U(1.3), V(v - 0.03)); g.quadraticCurveTo(U(-0.3), V(v - 0.07), U(-1.9), V(v - 0.09)); g.lineTo(U(-1.9), V(v + 0.07)); g.quadraticCurveTo(U(-0.3), V(v + 0.06), U(1.3), V(v + 0.03)); g.fill(); }
  // pinstripes in the accent colour
  g.strokeStyle = l.accent; g.lineWidth = 9; g.lineCap = "round";
  for (const v of [0.34, 0.66]) { g.beginPath(); g.moveTo(U(2.3), V(v)); g.quadraticCurveTo(U(1.0), V(v + (v < 0.5 ? 0.015 : -0.015)), U(-0.4), V(v + (v < 0.5 ? 0.04 : -0.04))); g.stroke(); }
  // nose tip and the dark underside
  g.fillStyle = l.nose; g.fillRect(U(prof.era === "2022" ? 2.35 : 1.9), 0, W, H);
  g.fillStyle = "#16171a"; g.fillRect(0, V(0.08), W, V(0) - V(0.08)); g.fillRect(0, V(1), W, V(0.92) - V(1));
  // car number on each side of the engine cover, and on the nose top
  g.fillStyle = l.num; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = "italic 900 104px Arial, sans-serif";
  // Orientation, from the loft's mapping (left flank = +x = v 0.75, canvas top = v 1, canvas x = rear → front):
  // on the right flank the canvas already reads front-wards and upright; on the left flank both are reversed.
  for (const v of [0.36, 0.64]) { g.save(); g.translate(U(-0.95), V(v)); g.scale(v < 0.5 ? 1 : -1, v < 0.5 ? 1 : -1); g.fillText(String(number), 0, 0); g.restore(); }
  g.font = "italic 900 76px Arial, sans-serif"; g.save(); g.translate(U(prof.era === "2022" ? 1.95 : 1.75), V(0.5)); g.rotate(Math.PI / 2); g.fillText(String(number), 0, 0); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// A helmet in team colours (not the driver's own design): a top colour, a band, the accent stripe.
function helmetTexture(l) {
  if (!hasDom) return null;
  const c = canvas(512, 256), g = c.getContext("2d");
  // sphere uv: x round (0 at −x, 0.25 at +z front), y from top (canvas top = sphere top)
  g.fillStyle = l.top === l.base ? "#f2f2f2" : l.top; g.fillRect(0, 0, 512, 256);
  g.fillStyle = l.base; g.fillRect(0, 150, 512, 106);
  g.fillStyle = l.accent; g.fillRect(0, 138, 512, 12);
  g.fillStyle = l.side; g.beginPath(); g.moveTo(0, 60); g.bezierCurveTo(128, 30, 384, 90, 512, 60); g.lineTo(512, 80); g.bezierCurveTo(384, 110, 128, 50, 0, 80); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------- one car ----------
const MAT = {};
const mat = (key, make) => MAT[key] || (MAT[key] = Object.assign(make(), { userData: { shared: true } }));
export const TYRE_COLOURS = { SOFT: "#e8392f", MEDIUM: "#f2c230", HARD: "#eef0f2", INTERMEDIATE: "#3cb54a", WET: "#2f7fe0" };
// opts: { teamName, teamColour, number, season } → a THREE.Group; userData: { profile, mounts: { tcam, eye },
// wheels (steer groups), spins (roll groups), fwPivot, rwPivot, bandMat, near (the close-up parts), fine (wheel covers,
// lights), helmet, wheel (steering wheel group), lod, compound, aero }.
export function makeCar({ teamName, teamColour, number, season = null, date = null }) {
  const prof = profileFor(season, teamName, date), t = template(prof), l = liveryFor(teamName, teamColour);
  const matte = l.finish === "matte";
  const paint = new THREE.MeshStandardMaterial({ map: liveryTexture(l, number, prof), color: hasDom ? 0xffffff : l.base, roughness: matte ? 0.5 : 0.28, metalness: 0.05 });
  const cm = carbonMaps();
  // (the weave as colour only: a normal and roughness map over a car that fills the cockpit cameras' screen, with the
  // reflections, dropped frames on the GPU – measured; the colour map costs next to nothing)
  const carbon = mat("carbon", () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: cm.colour, roughness: 0.42, metalness: 0.15 }));
  const wingPaint = new THREE.MeshStandardMaterial({ color: l.accent === "#ffffff" || l.accent === "#f2f2f2" ? l.base : l.top, roughness: matte ? 0.5 : 0.3, metalness: 0.05 });
  const carbonThin = mat("carbonThin", () => new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.45, metalness: 0.15, side: THREE.DoubleSide }));
  const tyreMat = mat("tyre", () => new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.9, metalness: 0 }));
  const coverMat = mat("cover", () => new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.35, metalness: 0.6 }));
  const lipMat = mat("lip", () => new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.3, metalness: 0.9 }));
  const pad = mat("pad", () => new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.85, metalness: 0 }));
  const visorMat = mat("visor", () => new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.06, metalness: 0.7 }));
  const screenMat = mat("screen", () => new THREE.MeshBasicMaterial({ map: wheelScreen(), toneMapped: false }));
  const buttonMat = mat("buttons", () => new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.4, metalness: 0.5 }));
  const bandMat = new THREE.MeshBasicMaterial({ color: 0xf2c230 });
  const lightMat = mat("light", () => new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  const helmetMat = new THREE.MeshStandardMaterial({ map: helmetTexture(l), color: hasDom ? 0xffffff : l.top, roughness: 0.18, metalness: 0.1 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: l.base, roughness: 0.8, metalness: 0 });
  const g = new THREE.Group();
  const add = (geo, m, parent = g, name) => { const mesh = new THREE.Mesh(geo, m); if (name) mesh.name = name; parent.add(mesh); return mesh; };
  add(t.painted, paint); add(t.carbon, carbon); add(t.wing, wingPaint); add(t.rim, pad);
  // active aero / DRS: the flaps pivot about their leading edges (closed = corner mode, open = straight mode / DRS)
  const pivot = ([y, z], geo) => { const pv = new THREE.Group(); pv.position.set(0, y, z); const m = new THREE.Mesh(geo, wingPaint); m.position.set(0, -y, -z); pv.add(m); g.add(pv); return pv; };
  const fwPivot = pivot(t.fwPivot, t.fwFlaps), rwPivot = pivot(t.rwPivot, t.rwFlaps);
  const fine = [add(t.lights, lightMat)];
  // driver: helmet and visor always (a T-cam sees them); the rest close up only
  const helmet = add(t.helmet, helmetMat, g, "helmet"); const visor = add(t.visor, visorMat, helmet);
  const near = new THREE.Group(); near.name = "near"; g.add(near);
  add(t.headrest, pad, near);
  const wheel = new THREE.Group(); wheel.name = "steering"; wheel.position.set(...t.wheel.at); wheel.rotation.x = t.wheel.tilt; near.add(wheel);
  add(t.wheel.body, carbon, wheel); add(t.wheel.grips, pad, wheel); const screen = add(t.wheel.screen, screenMat, wheel, "wheelScreen"); add(t.wheel.buttons, buttonMat, wheel); add(t.wheel.gloves, gloveMat, wheel);
  add(t.wheel.arms, gloveMat, near);
  const wheels = [], spins = [];
  const FX = prof.W / 2 - prof.FW / 2, RX = prof.W / 2 - prof.RW / 2;
  for (const [x, z, kind] of [[FX, prof.FZ, "front"], [-FX, prof.FZ, "front"], [RX, prof.RZ, "rear"], [-RX, prof.RZ, "rear"]]) {
    const w = new THREE.Group(); w.position.set(x, kind === "front" ? prof.FR : prof.RR, z);
    const s = new THREE.Group(); w.add(s);
    s.add(new THREE.Mesh(t[kind].tyre, tyreMat), new THREE.Mesh(t[kind].band, bandMat), new THREE.Mesh(t[kind].lip, lipMat));
    const cv = new THREE.Mesh(t[kind].cover, coverMat); s.add(cv); fine.push(cv);
    if (t[kind].deflector) { const d = new THREE.Mesh(t[kind].deflector, carbonThin); w.add(d); fine.push(d); }
    g.add(w); wheels.push(w); spins.push(s);
  }
  const mounts = { tcam: new THREE.Vector3(...prof.tcam), eye: new THREE.Vector3(...prof.eye) };
  g.userData = { profile: prof, mounts, wheels, spins, fwPivot, rwPivot, bandMat, near, fine, helmet, visor, wheel, screen, screenShared: screenMat, lod: "near", compound: null, aero: 0, aeroOpen: t.aeroOpen,
    paintMats: [paint, wingPaint, helmetMat, gloveMat], bounds: { length: t.box.max.z - t.box.min.z, width: prof.W, height: t.box.max.y } };
  return g;
}
// Tyre sidewall colour for the compound on the car now.
export function setCompound(car, compound) {
  if (car.userData.compound === compound) return;
  car.userData.compound = compound;
  car.userData.bandMat.color.set(TYRE_COLOURS[compound] || "#9aa0a6");
}
// Wing flaps: 0 = closed (corner mode / DRS shut), 1 = open (straight mode / DRS open). Eased by the caller.
export function setAero(car, open) {
  const u = car.userData; u.aero = open;
  u.fwPivot.rotation.x = u.aeroOpen.fw * open; u.rwPivot.rotation.x = u.aeroOpen.rw * open;
}
// Wheels: roll angle (rad) and the front wheels' steer angle (rad, + = left); the steering wheel turns with them at
// a fixed ratio (STEER_RATIO, an estimate: 10:1 – about 50° of the wheel through a 130 km/h corner, the ±90° stop
// at a hairpin), no more than ±90°. The steer angle is the caller's estimate from the path (the feed has no steering
// channel): the hands' movement is a depiction.
export const STEER_RATIO = 10;
export function setWheels(car, spin, steer) {
  const u = car.userData;
  u.wheels.forEach((w, i) => { w.rotation.y = i < 2 ? steer : 0; });
  u.spins.forEach((s) => { s.rotation.x = spin; });
  if (u.wheel) u.wheel.rotation.z = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, -steer * STEER_RATIO));
}
// Level of detail: "near" (everything), "mid" (no cockpit interior, hands, steering wheel), "far" (also no wheel covers,
// deflectors, lights). The same model at every level: only small parts come and go.
export function setDetail(car, lod) {
  const u = car.userData;
  if (u.lod === lod) return;
  u.lod = lod;
  u.near.visible = lod === "near";
  for (const o of u.fine) o.visible = lod !== "far";
}
// Reflections for the car's paint, carbon and visor: an environment map (the sky the scene shows) – the shared one is
// never freed with a car.
export function setCarEnvironment(car, env, intensity = 1) {
  car.traverse((o) => {
    const m = o.material; if (!m || !m.isMeshStandardMaterial) return;
    if (m.envMap !== env) { m.envMap = env; m.needsUpdate = true; }
    m.envMapIntensity = intensity;
  });
}
export const DIMENSIONS = (season, teamName) => { const p = profileFor(season, teamName); return { FZ: p.FZ, RZ: p.RZ, FR: p.FR, RR: p.RR, FX: p.W / 2 - p.FW / 2, RX: p.W / 2 - p.RW / 2 }; };
// The car's own wheel parts (shared template geometries – never freed by a caller) and where its wheels are, for a
// wheel off the car (a pit crew's: crew.js): front / rear { tyre, band, lip, cover }, radii, widths and hub places.
// The car's wheels in its userData.wheels are in this order: front left (+x), front right, rear left, rear right.
export function wheelParts(season, teamName) {
  const p = profileFor(season, teamName), t = template(p);
  return { key: p.key, front: t.front, rear: t.rear, FR: p.FR, RR: p.RR, FW: p.FW, RW: p.RW, FZ: p.FZ, RZ: p.RZ, FX: p.W / 2 - p.FW / 2, RX: p.W / 2 - p.RW / 2, W: p.W };
}
