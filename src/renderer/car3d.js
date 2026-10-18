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
    // v0.39: the cockpit 0.30 m further forward (ck) – side photos of 2026 race cars lined up on their wheel hubs put the
    // helmet's middle 1.45–1.48 m behind the front axle (SF-26 and W17, Austrian GP 2026-06-26; MCL40 there ~1.4 m –
    // Wikimedia Commons, refs/cars MANIFEST), the model had it 1.75 m back. The T-cam moved with it and its lens refitted to
    // the footage marks above (run/tt_cars/tcamfit.py: tyres' tops, horizon, helmet's top; halo and mirror kept where the
    // v0.22 fit had them): 1.12 m up, looking down 17.5°, 77.5° wide – the marks within 0.02 of the footage (the horizon
    // 0.15 for 0.17), the helmet now ~32 % of the frame's width (footage ~30 %; it was 39 %)
    ck: 0.30, tcam: [0.08, 1.12, -0.16], tcamPitch: 17.5, tcamYaw: -2, tcamHfov: 77.5, eye: [0, 0.75, 0.30], helmet: [0, 0.755, 0.25], helmetSize: [0.14, 0.145, 0.16],
    src: "2026 F1 technical regulations: 3.4 m wheelbase max, 1.9 m width; tyre sizes from Pirelli's 2026 announcements (front ~705 mm, rear ~710 mm diameter; 25 mm / 30 mm narrower than 2025's 305 / 405 mm – motorsport.com) – the rest estimated",
  },
  2022: {
    era: "2022", FZ: 1.8, RZ: -1.8, FR: 0.36, RR: 0.36, FW: 0.305, RW: 0.405, W: 2.0, H: 0.95,
    // (no footage of these cars compared: the 2026 lens and angle, the mount from photos of the airbox – estimates)
    // (v0.39: the cockpit 0.33 m further forward, ck – the helmet's middle 1.47–1.62 m behind the front axle in side photos
    // of the 2025 SF-25, MCL39 (Japanese GP 2025-04-05) and W16 (Italian GP 2025) lined up on their hubs; the model had it
    // 1.88 m back. The T-cam moved with it, with the 2026 lens and angle)
    ck: 0.33, tcam: [0, 1.07, -0.19], tcamPitch: 17.5, tcamHfov: 77.5, eye: [0, 0.745, 0.30], helmet: [0, 0.735, 0.25],
    src: "2022–2025 F1 technical regulations: 3.6 m wheelbase max, 2.0 m width, 0.95 m height; 18-inch wheels, ~720 mm tyres (front ~305 mm, rear ~405 mm wide) – estimates; the rest from photos",
  },
};
// Team profiles, apart from the era's car: what is known of one team's car in one season – so far its T-cam, where
// a frame of that team's own onboard footage was fitted. `basis` says how far to trust it; a team without an entry
// uses the era's numbers (nothing is copied from another team).
export const TEAM_PROFILES = [
  { season: 2026, team: /ferrari/i, id: "ferrari-2026", camera: { tcam: [0, 1.12, -0.16], tcamPitch: 17.5, tcamYaw: 0, tcamHfov: 77.5 },
    basis: "fitted to Leclerc's 2026 Australian GP start onboard (straight, level car): tyres, halo, horizon; helmet and mirrors check out (the lens's sideways place not checked in that frame)" },
  { season: 2026, team: /red bull/i, id: "redbull-2026", camera: { tcam: [0.08, 1.12, -0.16], tcamPitch: 17.5, tcamYaw: -2, tcamHfov: 77.5 },
    basis: "checked against Verstappen's 2026 Singapore pole-lap onboard (level straight): tyres, horizon, helmet, mirror, halo – the lens 8 cm left of the centreline, turned 2° in" },
  { season: 2026, team: /mercedes/i, id: "mercedes-2026", camera: { tcam: [0.08, 1.12, -0.16], tcamPitch: 17.5, tcamYaw: -2, tcamHfov: 77.5 },
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
// A section is [z, cy, halfWidth, halfHeight, cx = 0, power = 2.6, taper = 0] – a superellipse ring; taper widens its
// top and narrows its bottom (> 0: a sidepod over its undercut) or the reverse (< 0: a chassis narrower at the top).
// Returns a smooth BufferGeometry with UVs: u along the car (0 = rear, 1 = front), v round the ring
// (0 at the bottom, 0.25 on the left, 0.5 on top, 0.75 on the right).
function loft(sections, ring = 24, uRange = [-2.9, 2.9], capEnds = true) {
  const pos = [], uv = [], idx = [];
  const n = sections.length;
  for (const [z, cy, hw, hh, cx = 0, pw = 2.6, tp = 0] of sections) {
    for (let k = 0; k <= ring; k++) {
      const a = (k / ring) * Math.PI * 2 - Math.PI / 2;        // starts at the bottom
      const c = Math.cos(a), s = Math.sin(a);
      const x = cx + hw * (1 + (tp || 0) * s) * Math.sign(c) * Math.pow(Math.abs(c), 2 / pw), y = cy + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / pw);
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
// The tyres' sidewall markings (v0.39): the compound's colour where the real tyre has it – the band's arcs and the
// lettering between them (SIDEWALL: where each is round the wheel; docs/research/wheels_tyres.md) – white on clear,
// tinted by the material's colour (the compound). The maker's words are not drawn (a trademark): blocks the size and
// place of the lettering stand in for them, so a slow wheel's turning reads as on TV. A second map is the same
// markings averaged round the wheel – what a fast wheel looks like on camera (one smooth ring).
// Angles in degrees round the wheel, radii as a share of the decal's outer radius (the tread's shoulder).
export const SIDEWALL = {
  // the band: arcs between the words, at r 0.80–0.865
  band: { r: [0.8, 0.865], arcs: [[14, 76], [104, 166], [194, 256], [284, 346]] },
  // the words: two long (at 90° and 270°), two short (0°, 180°) – lettering-sized blocks, r 0.81–0.855
  words: [{ at: 90, span: 26, n: 7 }, { at: 270, span: 26, n: 7 }, { at: 0, span: 22, n: 6 }, { at: 180, span: 22, n: 6 }],
  inner: 0.7,
};
function sidewallCanvas(avg = false) {
  const N = 512, c = canvas(N, N), g = c.getContext("2d"), R = N / 2, cx = R, cy = R, rad = (d) => (d * Math.PI) / 180;
  g.clearRect(0, 0, N, N); g.fillStyle = "#fff"; g.strokeStyle = "#fff";
  const [b0, b1] = SIDEWALL.band.r;
  for (const [a0, a1] of SIDEWALL.band.arcs) { g.beginPath(); g.arc(cx, cy, R * b1, rad(a0), rad(a1)); g.arc(cx, cy, R * b0, rad(a1), rad(a0), true); g.closePath(); g.fill(); }
  // the lettering: upright strokes and bars of letter size along the arc (abstract – no word is spelled)
  for (const w of SIDEWALL.words) {
    const step = w.span / w.n;
    for (let i = 0; i < w.n; i++) {
      const a = w.at - w.span / 2 + step * (i + 0.5), kind = (i * 7 + w.n) % 3;
      g.save(); g.translate(cx + Math.cos(rad(a)) * R * 0.832, cy + Math.sin(rad(a)) * R * 0.832); g.rotate(rad(a) + Math.PI / 2);
      const h = R * 0.05, wd = (step / 360) * Math.PI * 2 * R * 0.832 * 0.72;
      g.fillRect(-wd / 2, -h / 2, wd * 0.28, h);                          // a stem
      if (kind !== 1) g.fillRect(-wd / 2, -h / 2, wd, h * 0.24);          // a top bar
      if (kind === 2) g.fillRect(-wd / 2, -h * 0.06, wd * 0.8, h * 0.2);   // a middle bar
      if (kind !== 0) g.fillRect(wd / 2 - wd * 0.28, -h / 2, wd * 0.28, h); // a second stem
      g.restore();
    }
  }
  if (!avg) return c;
  // averaged round the wheel: each radius its mean coverage
  const img = g.getImageData(0, 0, N, N), d = img.data, bins = new Float64Array(R + 1), cnt = new Float64Array(R + 1);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = Math.round(Math.hypot(x + 0.5 - cx, y + 0.5 - cy)); if (r <= R) { bins[r] += d[(y * N + x) * 4 + 3]; cnt[r]++; } }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = Math.round(Math.hypot(x + 0.5 - cx, y + 0.5 - cy)), k = (y * N + x) * 4; d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = r <= R && cnt[r] ? bins[r] / cnt[r] : 0; }
  g.putImageData(img, 0, 0);
  return c;
}
function sidewallMaps() {
  const mk = (avg) => () => { const t = new THREE.CanvasTexture(sidewallCanvas(avg)); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: sharedTex("sidewall", mk(false)), avg: sharedTex("sidewallAvg", mk(true)) };
}
// The sidewall's material: the markings smeared round the wheel by the angle it turns in a frame (uniform smear, rad –
// car3d setSmear): sampled along the arc, and the averaged ring once it has turned well over a word in a frame.
export function sidewallMaterial(color = 0xf2c230) {
  const M = sidewallMaps();
  const m = new THREE.MeshBasicMaterial({ color, map: M.map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  if (!M.map) return m;
  const smear = { value: 0 }, avg = { value: M.avg };
  m.userData.smear = smear;
  m.customProgramCacheKey = () => "sidewall";
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSmear = smear; sh.uniforms.avgMap = avg;
    sh.fragmentShader = "uniform float uSmear;\nuniform sampler2D avgMap;\n" + sh.fragmentShader.replace("#include <map_fragment>", `
#ifdef USE_MAP
  vec2 c0 = vMapUv - 0.5; float sm = min(uSmear, 6.2832); vec4 acc = vec4(0.0);
  for (int k = 0; k < 9; k++) { float a = sm * (float(k) / 8.0 - 0.5); float cs = cos(a), sn = sin(a); acc += texture2D(map, vec2(cs * c0.x - sn * c0.y, sn * c0.x + cs * c0.y) + 0.5); }
  acc /= 9.0;
  vec4 sampledDiffuseColor = mix(acc, texture2D(avgMap, vMapUv), smoothstep(1.0, 3.0, uSmear));
  diffuseColor *= sampledDiffuseColor;
#endif`);
  };
  return m;
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
  // parts fixed to the car that share a material, merged: fewer objects to draw per car; the painted parts' livery
  // mapped by projection (paintUV: side, plan and underside views)
  const extra = T.paintExtra || [];
  T.painted = merge([paintUV(merge([T.body, T.pods, ...extra.filter((g) => !g.userData.patch)])), ...extra.filter((g) => g.userData.patch)]); T.wing = merge([T.wing, T.halo]);
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
export function halo(p) {
  // (2026 footage: the hoop reads wide and flat from the T-cam. v0.22: its top bar ~6 % of the frame's height in the
  // Singapore and Barcelona pole-lap frames, its top edge at ~0.43 – the fairing ~9 cm across, ~4.5 cm thick, the top
  // at 0.91 m; it was 12 × 6 cm and 0.935 m, 8 % and 0.38 on screen)
  const wide = p.era === "2026";
  // (and its rear legs closer in: in that footage they meet the bottom of the frame ~a quarter in from each side)
  const k = wide ? 0.86 : 1;
  const top = wide ? 0.91 : 0.935;
  // (v0.37: the 2026 hoop's section 84 × 52 mm – it was 90 × 45, thinner than the 50 mm titanium tube it fairs
  // (Symonds, Autosport 2021: a 50 × 4 mm tube); still within the T-cam fit's ~6 % of the frame. docs/research/halo.md)
  const hoop = sweep([[-0.335 * k, 0.6, -0.3], [-0.34 * k, 0.74, -0.16], [-0.31 * k, top - 0.075, 0.04], [-0.22, top - 0.02, 0.22], [0, top, 0.33], [0.22, top - 0.02, 0.22], [0.31 * k, top - 0.075, 0.04], [0.34 * k, 0.74, -0.16], [0.335 * k, 0.6, -0.3]], wide ? 0.042 : 0.046, wide ? 0.026 : 0.034, 72, 18);
  // the pillar: a blade from the hoop's front down to the chassis – across it the titanium strut (the FIA: 20 mm, 2017)
  // and its thin fairing, ~32 mm at the driver's eye height, ~38 mm at the hoop, 44 mm at its foot (the regulations' front
  // fairing box: ±25 mm, 2022–25 Art. 3.12.3b). v0.36 drew it 56–100 mm across: ~71 mm where the eye's line meets it –
  // wider than the ~63 mm between a driver's eyes, so it hid what two eyes see round (docs/research/halo.md)
  const pillar = loft(smoothSections([[0.355, top - 0.01, 0.019, 0.03], [0.45, top - 0.075, 0.016, 0.03], [0.55, top - 0.175, 0.017, 0.028], [0.64, 0.64, 0.022, 0.03]].reverse(), 2), 14);
  const g = merge([hoop, pillar]); g.translate(0, 0, p.ck || 0);   // (v0.39: with the cockpit)
  return g;
}

// ---- the era's car, in parts ----
// v0.39: the cars were a single lofted tube with slab wings and a flat floor – a toy next to race photos (side, ¾ and
// top views of 2025 / 2026 race cars: docs/research/cars_photos.md). Each car is now drawn from the parts a photo shows:
// a chassis narrower at the top than at its floor, the nose falling to the front wing, the airbox hoop over the
// driver's head and the engine cover falling to the gearbox; sidepods with their inlet mouths, the undercut beneath and
// the downwash slope; the floor with its edge wing, the fences and tunnel roofs at its front, the diffuser rising at its
// back; the front wing's elements sweeping up into the endplates; the rear wing with its pylon, (2022–25) beam wing;
// uprights and brake ducts inside the wheels. Sizes: the rules' volumes where they say (FIA 2025 Technical Regulations
// Issue 03; 2026 Section C Issue 17 – docs/research/cars2025.md / cars2026.md §1/§0), else read off photos (estimates,
// a few cm). Sections are written [z, bottom, top, half width, x, roundness, taper] (loft's taper) and turned into the
// loft's [z, y, half width, half height, …] by `sec`.
// v0.39: the cockpit sits ck further forward than the hand-set numbers below (PROFILES ck): ckShift moves a part's z
// by ck between a and the cockpit's front (zTo), not at all behind b (the engine cover between stretched), and squeezes
// the nose ahead of zTo so its tip stays put
const ckShift = (ck = 0, a, b, zTo = Infinity, tip = 3) => (z) => z > zTo ? zTo + ck + ((z - zTo) * (tip - zTo - ck)) / (tip - zTo) : z >= a ? z + ck : z <= b ? z : z + (ck * (z - b)) / (a - b);
const bodyShift = (p) => (p.era === "2026" ? ckShift(p.ck, -0.92, -1.75, 0.82, 2.86) : ckShift(p.ck, -0.94, -1.75, 0.72, 2.96));
const podShift = (p) => ckShift(p.ck, 0.1, -1.5);
const zMap = (list, f) => list.map((q) => [f(q[0]), ...q.slice(1)]);
const sec = (list) => list.map(([z, b, t, hw, cx = 0, pw = 2.6, tp = 0]) => [z, (b + t) / 2, hw, (t - b) / 2, cx, pw, tp]);

// A wing across the car: at(e) gives, at e = |x| / half span (0 middle, 1 tip), [y, z of the leading edge, chord,
// thickness, angle (rad, leading edge up)] – elements that rise, sweep back and twist towards their tips as the real
// ones do (one profile everywhere: wingElement's)
function wingSpan(span, at, segs = 28) {
  const prof = [[0, 0], [0.04, 0.55], [0.18, 0.9], [0.45, 1], [0.8, 0.55], [1, 0.08], [1, -0.02], [0.6, -0.25], [0.25, -0.35], [0.06, -0.3]];
  const R = prof.length, pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    // (stations closer together at the tips, where the elements turn)
    const u = -1 + (2 * i) / segs, x = (span / 2) * Math.sign(u) * (1 - Math.pow(1 - Math.abs(u), 1.6)), e = Math.abs(x) / (span / 2);
    const [y, z, c, t, a] = at(e);
    for (const [cf, tf] of prof) { const lz = -cf * c, ly = tf * t; pos.push(x, y + ly * Math.cos(a) - lz * Math.sin(a), z + lz * Math.cos(a) + ly * Math.sin(a)); }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < R; k++) { const a = i * R + k, b = a + R, a1 = i * R + ((k + 1) % R), b1 = a1 + R; idx.push(a, a1, b, a1, b1, b); }
  // the tips closed
  for (const i of [0, segs]) for (let k = 1; k < R - 1; k++) idx.push(...(i ? [i * R, i * R + k, i * R + k + 1] : [0, k + 1, k]));
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// a loft section's outline as a flat shape (the dark mouth of an inlet), scaled `k` about its middle, at z
function mouth(s, k = 0.8, dz = 0.004, ring = 24) {
  const [z, cy, hw, hh, cx = 0, pw = 2.6, tp = 0] = s, pts = [];
  for (let i = 0; i < ring; i++) { const a = (i / ring) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); pts.push(new THREE.Vector2(cx + k * hw * (1 + tp * sn) * Math.sign(c) * Math.pow(Math.abs(c), 2 / pw), cy + k * hh * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / pw))); }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts)); g.translate(0, 0, z + dz); return g;
}

// ---- a team's shape on the era's sections (carshapes.js) ----
// Body sections (sec's format, nose first); the nose = the sections ahead of noseFrom. Pods likewise (one side's).
function shapeBody(list, s, noseFrom) {
  if (!s) return list;
  const tipZ = list[0][0], n = s.nose || {};
  const lenF = { long: 1.1, medium: 1, short: 0.86 }[n.len] ?? 1, tipDy = { high: 0.05, mid: 0, low: -0.03 }[n.tip] ?? 0, wF = { narrow: 0.84, medium: 1, wide: 1.3 }[n.w] ?? 1;
  const box = s.airbox;
  return list.map((q) => {
    const r = q.slice(); const [z] = q;
    if (z > noseFrom) {
      const k = (z - noseFrom) / (tipZ - noseFrom);          // 0 at the nose's root, 1 at its tip
      r[0] = noseFrom + (z - noseFrom) * lenF; r[1] = q[1] + tipDy * k; r[2] = q[2] + tipDy * k; r[3] = q[3] * (1 + (wF - 1) * k);
    }
    // the airbox hoop over the driver's head: oval (rounder, narrower), rect (boxy, wide), triangle (pointed top)
    if (z <= -0.38 && z >= -0.9) {
      if (box === "oval") { r[3] = q[3] * 0.86; r[5] = 2.1; r[6] = (q[6] ?? 0) * 0.6; }
      else if (box === "rect") { r[3] = q[3] * 1.22; r[5] = 4.2; r[6] = (q[6] ?? 0) * 0.35; }
      else if (box === "triangle") { r[6] = (q[6] ?? 0) * 1.25; }
    }
    if (s.cooling === "bulge" && z <= -0.95 && z >= -1.8) { r[2] = q[2] + 0.035; r[3] = q[3] * 1.12; }
    return r;
  });
}
function shapePods(pod, s) {
  if (!s?.pod) return pod;
  const P = s.pod, z0 = pod[0][0], z1 = pod[pod.length - 1][0];
  return pod.map((q, i) => {
    const r = q.slice(), k = (z0 - q[0]) / (z0 - z1);        // 0 at the inlet, 1 at the tail
    let [, b, t, hw, cx, , tp] = r;
    if (i <= 1) {
      // the inlet's shape: a letterbox (a low wide slot high up), a tall narrow mouth by the chassis, a big hooped one
      const f = i === 0 ? 1 : 0.5;
      if (P.inlet === "letterbox") { b += 0.09 * f; t += 0.005 * f; hw *= 1 + 0.1 * f; }
      else if (P.inlet === "vertical") { hw *= 1 - 0.4 * f; cx -= 0.07 * f; b -= 0.03 * f; t += 0.01 * f; }
      else if (P.inlet === "wide") { hw *= 1 + 0.12 * f; b -= 0.04 * f; }
    }
    // the undercut: how far the pod's underside is cut back up over the floor (deep: high, with the bottom pulled in)
    if (P.undercut === "deep") { b += 0.05 * (1 - k); tp = (tp || 0) + 0.12; } else if (P.undercut === "shallow") { b -= 0.05 * (1 - k); tp = (tp || 0) - 0.1; }
    // the top: a downwash ramp falling to the floor's edge, or a gully (waterslide) – the top's outer edge kept high
    const ramp = P.top === "ramp" ? 1 : P.top === "halframp" ? 0.55 : 0;
    if (ramp && k > 0.12) { t -= 0.11 * ramp * sstep(0.12, 0.8, k); b -= 0.02 * ramp * sstep(0.12, 0.8, k); }
    if (P.top === "gully" && k > 0.1 && k < 0.9) { t += 0.02; tp = (tp || 0) + 0.12; hw *= 1.04; }
    r[1] = b; r[2] = t; r[3] = hw; r[4] = cx; r[6] = tp;
    return r;
  });
}
// the parts a shape adds: a cooling cannon or louvres, a serrated fin, the blades atop the front wing's endplates
function shapeParts(s, p, fwSpan, fwZ, epTop, zb = (z) => z) {
  const out = [];
  if (!s) return out;
  if (s.cooling === "cannon") out.push(softBox(0.1, 0.09, 0.3, 0, 0.44, -2.0, 0.6));
  if (s.cooling === "louvres") for (const k of [1, -1]) for (let i = 0; i < 5; i++) out.push(boxAt(0.1, 0.006, 0.022, 0.25 * k, 0.6 - i * 0.03, zb(-0.95 - i * 0.07), 0, 0, -0.35 * k));
  if (s.cooling === "split") for (const k of [1, -1]) out.push(softBox(0.06, 0.05, 0.18, 0.11 * k, 0.55, -1.55, 0.5));
  if (s.fin === "serrated") for (let i = 0; i < 6; i++) out.push(boxAt(0.008, 0.035, 0.045, 0, 0.93 - i * 0.03, zb(-1.0 - i * 0.085), 0, 0.6));
  if (s.blade) for (const k of [1, -1]) out.push(boxAt(0.1, 0.008, 0.42, (fwSpan / 2 - 0.045) * k, epTop, fwZ));
  return out;
}

// The parts both eras share, from each era's numbers (E): chassis sections, pods, floor and wings differ; these are
// built the same way.
// The floor: its plan outline (x, z of the left half, front to back), the board under the car; the tunnels' roofs
// rising at its front between the fences; its outer edge with the edge wing; the diffuser (roof, side walls and
// strakes) rising behind the rear axle.
function floorParts(E) {
  const fl = new THREE.Shape(), half = E.floorPlan, pts = [...half, ...half.slice().reverse().map(([x, z]) => [-x, z])];
  pts.forEach(([x, z], i) => (i ? fl.lineTo(x, -z) : fl.moveTo(x, -z)));
  const floor = new THREE.ExtrudeGeometry(fl, { depth: 0.035, bevelEnabled: false }); floor.rotateX(Math.PI / 2); floor.translate(0, E.floorY + 0.035, 0);
  const out = [floor];
  // the tunnels' roofs: from the floor's leading edge (high) down to the floor towards the sidepods' front
  const [z0, z1] = E.tunnel, roofTop = E.tunnelH, y0 = E.floorY + 0.035;
  const roof = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8, z = z0 + (z1 - z0) * t; roof.push([z, y0 + (roofTop - y0) * (1 - sstep(0, 1, t))]); }
  const roofOutline = [...roof.map(([z, y]) => [z, y + 0.012]), ...roof.slice().reverse().map(([z, y]) => [z, y - 0.004])];
  for (const k of [1, -1]) out.push(plate(roofOutline, k * (E.tunnelX[0] + E.tunnelX[1]) / 2, E.tunnelX[1] - E.tunnelX[0]));
  // the fences under the floor's front: thin vertical plates curving from the leading edge back along the tunnel roof
  for (const fx of E.fences) for (const k of [1, -1]) out.push(plate([[z0 + 0.02, y0 - 0.03], [z0 + 0.02, roofTop + 0.02], [z0 - 0.2, roofTop - 0.01], [z1 + 0.15, y0 + 0.03], [z1, y0 - 0.03]], fx * k, 0.008));
  // the edge wing along the floor's outer edge ahead of the sidepods, and the edge's upturned lip further back
  for (const k of [1, -1]) {
    const [ez0, ez1, ex] = E.edgeWing;
    if (k > 0) { const ew = wingElement(ez0 - ez1, 0.1, 0.012, 0, 0, 0.05, 0, 8); ew.rotateY(Math.PI / 2); ew.translate(ex, E.floorY + 0.1, (ez0 + ez1) / 2); out.push(both(ew)); }
    out.push(boxAt(0.012, 0.035, ez1 - E.edgeLip, (E.edgeX) * k, E.floorY + 0.05, (ez1 + E.edgeLip) / 2));
  }
  // the diffuser: its roof rising from the floor to the exit, side walls and strakes
  const [dz0, dz1] = E.diffuser, dw = E.diffuserW, dh = E.diffuserH, dpts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; dpts.push([dz0 + (dz1 - dz0) * t, y0 + (dh - y0) * Math.pow(t, 1.5)]); }
  out.push(plate([...dpts.map(([z, y]) => [z, y + 0.015]), ...dpts.slice().reverse().map(([z, y]) => [z, y - 0.005])], 0, dw * 2));
  const wall = (x, shrink) => plate([[dz0, y0 - 0.03], [dz1, y0 - 0.03], ...dpts.slice().reverse().map(([z, y]) => [z, y + 0.02 - shrink * (y - y0)])], x, 0.012);
  for (const k of [1, -1]) out.push(wall(dw * k, 0), wall(dw * 0.62 * k, 0.35), wall(dw * 0.3 * k, 0.55));
  return out;
}
// Uprights and brake ducts inside each wheel – the drum round the brake on the car's side of the wheel, its intake
// facing forward (the hub's carbon fairings, not the rotating wheel: they don't spin; the fronts steer a few degrees
// in reality – drawn fixed, inside the rim, where a few degrees don't show)
function corners(p) {
  const out = [];
  for (const [z, r, w, front] of [[p.FZ, p.FR, p.FW, true], [p.RZ, p.RR, p.RW, false]]) for (const k of [1, -1]) {
    const inner = p.W / 2 - w;                  // the tyre's inner face
    const drum = new THREE.CylinderGeometry(front ? 0.15 : 0.165, front ? 0.16 : 0.175, 0.13, 20); drum.rotateZ(Math.PI / 2); drum.translate((inner - 0.04) * k, r, z);
    const scoop = softBox(0.07, front ? 0.1 : 0.08, 0.16, (inner - 0.085) * k, r + (front ? -0.08 : 0.06), z + 0.14, 0.35);
    out.push(drum, scoop);
  }
  return out;
}
// Wishbones and push/pull rods (faired blades), each corner from the chassis to the upright – front and rear each
// push or pull as the team's car has them (carshapes.js; the era's default without one). The track rod beside the
// front upper wishbone; at the rear, the toe link.
function suspension(p, pullFront, pullRear = false) {
  const out = [];
  for (const [z, r, wx, front] of [[p.FZ, p.FR, p.W / 2 - p.FW, true], [p.RZ, p.RR, p.W / 2 - p.RW, false]]) for (const k of [1, -1]) {
    const ox = (wx + 0.02) * k, cx = (front ? 0.2 : 0.24) * k, top = r + 0.12, bot = r - 0.16;
    out.push(strut([cx, front ? 0.47 : 0.42, z + 0.26], [ox, top, z]), strut([cx, front ? 0.47 : 0.42, z - 0.22], [ox, top, z]));
    out.push(strut([cx * 0.95, 0.2, z + 0.3], [ox, bot, z]), strut([cx * 0.95, 0.2, z - 0.24], [ox, bot, z]));
    // (pull rod: from high on the upright down to the chassis; push rod: low on the upright up to the chassis)
    const pull = front ? pullFront : pullRear;
    out.push(pull ? strut([ox * 0.97, top - 0.02, z + (front ? -0.03 : 0.03)], [cx * 0.9, 0.17, z + (front ? -0.3 : 0.3)], 0.03, 0.014) : strut([ox * 0.97, bot + 0.02, z + 0.02], [cx * 1.05, front ? 0.52 : 0.46, z + (front ? -0.12 : 0.12)], 0.03, 0.014));
    out.push(front ? strut([cx, 0.4, z + 0.1], [ox, 0.42, z + 0.09], 0.032, 0.012) : strut([cx, 0.32, z - 0.12], [ox, 0.3, z - 0.1], 0.03, 0.012));
    // the upright (inside the rim)
    out.push(boxAt(0.04, top - bot + 0.04, 0.09, wx * k, r - 0.02, z));
  }
  return out;
}
// Mirrors: the housing (wider than tall, its glass facing back), its stays, a winglet under it
function mirrorParts(at, size, root) {
  const heads = [], stays = [];
  for (const k of [1, -1]) {
    const [x, y, z] = at, [w, h, d] = size;
    heads.push(softBox(w, h, d, x * k, y, z, 0.22));
    stays.push(strut([root[0] * k, root[1], root[2]], [(x - w * 0.25) * k, y - h * 0.4, z + 0.01], 0.03, 0.012), strut([(root[0] + 0.03) * k, root[1] + 0.02, root[2] - 0.12], [(x - w * 0.05) * k, y - h * 0.45, z - 0.01], 0.025, 0.01));
    stays.push(boxAt(w * 0.9, 0.006, d * 1.4, x * k, y - h * 0.75, z + 0.01, 0.1));
  }
  return { heads, stays };
}
// the glass in each mirror (dark, a little in from the housing's back)
const mirrorGlass = (at, size) => [1, -1].map((k) => { const g = new THREE.PlaneGeometry(size[0] * 0.86, size[1] * 0.72); g.rotateY(Math.PI); g.translate(at[0] * k, at[1], at[2] - size[2] / 2 - 0.002); return g; });

function body2022(p) {
  const S = p.shape;
  // chassis, nose first (sec's format): the nose tip over the front wing's main plane, its top rising to the chassis
  // ahead of the cockpit (~0.65 m), the tub on the floor; the cockpit; the airbox hoop (its top the rules' 0.95 m);
  // the engine cover falling to the gearbox and the crash structure (the rain light at its end)
  const C = [
    [2.96, 0.17, 0.25, 0.06, 0, 2.4, -0.1], [2.82, 0.16, 0.285, 0.085, 0, 2.5, -0.22], [2.5, 0.165, 0.35, 0.11, 0, 2.6, -0.28], [2.1, 0.18, 0.43, 0.14, 0, 2.6, -0.3],
    [1.7, 0.19, 0.51, 0.17, 0, 2.6, -0.3], [1.35, 0.15, 0.58, 0.205, 0, 2.6, -0.3], [1.0, 0.11, 0.63, 0.245, 0, 2.7, -0.3], [0.7, 0.1, 0.655, 0.27, 0, 2.8, -0.28],
    [0.45, 0.1, 0.63, 0.29, 0, 3, -0.24], [0.2, 0.1, 0.565, 0.3, 0, 3, -0.2], [-0.1, 0.1, 0.55, 0.3, 0, 3, -0.2], [-0.32, 0.1, 0.64, 0.3, 0, 2.8, -0.3],
    [-0.41, 0.1, 0.89, 0.28, 0, 2.6, -0.55], [-0.52, 0.1, 0.945, 0.255, 0, 2.5, -0.62], [-0.72, 0.1, 0.945, 0.24, 0, 2.5, -0.6], [-0.92, 0.1, 0.9, 0.23, 0, 2.5, -0.55], [-1.2, 0.1, 0.79, 0.205, 0, 2.5, -0.45],
    [-1.6, 0.13, 0.62, 0.155, 0, 2.5, -0.35], [-2.0, 0.18, 0.48, 0.105, 0, 2.5, -0.25], [-2.3, 0.22, 0.41, 0.07, 0, 2.4, -0.15], [-2.45, 0.245, 0.37, 0.05], [-2.655, 0.255, 0.335, 0.035],
  ];
  const zb = bodyShift(p), zp = podShift(p), ck = p.ck || 0;
  const body = loft(smoothSections(sec(zMap(shapeBody(C, S, 1.7), zb)), 2).reverse(), 32);
  // sidepods (left; the right a mirror): the inlet mouth under the mirror, the undercut beneath (the floor visible under
  // it), the top falling towards the floor's edge, the coke-bottle narrowing to the gearbox
  const P = sec(zMap(shapePods([
    [0.56, 0.41, 0.64, 0.115, 0.54, 3.2, 0.12], [0.42, 0.35, 0.665, 0.15, 0.53, 3, 0.3], [0.1, 0.29, 0.665, 0.17, 0.51, 2.8, 0.4], [-0.3, 0.24, 0.625, 0.165, 0.48, 2.7, 0.4],
    [-0.7, 0.2, 0.545, 0.14, 0.43, 2.6, 0.35], [-1.1, 0.17, 0.45, 0.11, 0.36, 2.6, 0.3], [-1.5, 0.15, 0.34, 0.075, 0.28, 2.5, 0.2], [-1.85, 0.15, 0.26, 0.04, 0.2],
  ], S), zp));
  const podL = loft(smoothSections(P, 2).reverse(), 24);
  const inlets = both(mouth(P[0], 0.8));
  // the airbox's mouth over the driver's head, and the roll hoop's side intakes
  const airbox = mouth([-0.425 + ck, 0.85, S?.airbox === "rect" ? 0.1 : 0.075, 0.055, 0, S?.airbox === "oval" ? 2.2 : 2.8, S?.airbox === "rect" ? -0.1 : -0.55], 1, -0.005);
  const floor = floorParts({ floorPlan: [[0.12, 1.36], [0.5, 1.36], [0.62, 1.15], [0.82, 0.7], [0.86, 0.3], [0.86, -0.95], [0.8, -1.3], [0.62, -1.42], [0.56, -1.5], [0.53, -2.3]],
    floorY: 0.065, tunnel: [1.36, 0.55], tunnelH: 0.27, tunnelX: [0.1, 0.56], fences: [0.14, 0.24, 0.34, 0.45], edgeWing: [1.1, 0.45, 0.84], edgeX: 0.86, edgeLip: -0.95,
    diffuser: [-1.3, -2.32], diffuserW: 0.5, diffuserH: 0.38 });
  // front wing: four elements – the main plane low in the middle (the nose over it), all rising outboard and sweeping
  // back into the endplates; the three flaps over it
  const fwSpan = 1.95, r = (e) => sstep(0.3, 1, e);
  const fw0 = wingSpan(fwSpan, (e) => [0.07 + 0.075 * r(e), 3.02 - 0.12 * r(e), 0.34 - 0.08 * r(e), 0.03, 0.05 + 0.08 * r(e)]);
  const fwF = [wingSpan(fwSpan - 0.02, (e) => [0.125 + 0.13 * r(e), 2.71 - 0.08 * r(e), 0.2 + 0.04 * r(e), 0.024, 0.2 + 0.25 * r(e)]),
    wingSpan(fwSpan - 0.03, (e) => [0.165 + 0.15 * r(e), 2.555 - 0.06 * r(e), 0.15 + 0.03 * r(e), 0.02, 0.28 + 0.36 * r(e)]),
    wingSpan(fwSpan - 0.04, (e) => [0.2 + 0.16 * r(e), 2.43 - 0.05 * r(e), 0.12 + 0.02 * r(e), 0.018, 0.36 + 0.44 * r(e)])];
  // the endplates: ~0.3 m tall, ~0.6 m long (photos: about a tyre and a half), in the livery's colour with the flaps;
  // the footplate under them carbon
  const epF = [[3.03, 0.05], [3.03, 0.15], [2.97, 0.24], [2.8, 0.31], [2.56, 0.335], [2.4, 0.31], [2.36, 0.24], [2.43, 0.05]];
  const fwPlates = merge([1, -1].map((k) => boxAt(0.1, 0.008, 0.6, (fwSpan / 2 - 0.045) * k, 0.055, 2.73)));
  const fwEnds = [plate(epF, fwSpan / 2 + 0.006, 0.012), plate(epF, -fwSpan / 2 - 0.006, 0.012)];
  // rear wing: the main plane a shallow spoon (lower in the middle), the DRS flap over it, both turning down at the tips
  // into rounded endplates; one pylon from the crash structure, the DRS actuator over it; the beam wing under
  const rwSpan = 1.0, tip = (e) => 0.07 * Math.pow(sstep(0.82, 1, e), 1.5);
  const rwMain = wingSpan(rwSpan, (e) => [0.775 + 0.035 * e * e - tip(e), -2.1 - 0.02 * e, 0.3, 0.04, 0.1]);
  const rwFlap = wingSpan(rwSpan - 0.01, (e) => [0.915 + 0.015 * e * e - tip(e), -2.3 - 0.01 * e, 0.2, 0.026, 0.45]);
  // (the endplates' lower rear corner cut away, their tops rounding over into the elements – photos of SF-25, MCL39)
  const ep = [[-2.02, 0.54], [-2.03, 0.8], [-2.07, 0.88], [-2.16, 0.93], [-2.3, 0.95], [-2.5, 0.945], [-2.575, 0.9], [-2.57, 0.73], [-2.4, 0.7], [-2.2, 0.62], [-2.12, 0.54]];
  const rwPlates = merge([plate(ep, rwSpan / 2 + 0.006, 0.012), plate(ep, -rwSpan / 2 - 0.006, 0.012)]);
  const rwPylon = merge([plate([[-2.24, 0.33], [-2.17, 0.55], [-2.13, 0.76], [-2.33, 0.76], [-2.36, 0.58], [-2.44, 0.4], [-2.46, 0.33]], 0, 0.014), softBox(0.04, 0.06, 0.14, 0, 0.86, -2.24, 0.4)]);
  const beam = merge([wingSpan(0.88, (e) => [0.36, -2.3, 0.14, 0.02, 0.15], 10), wingSpan(0.84, (e) => [0.435, -2.42, 0.12, 0.018, 0.4], 10)]);
  const susp = suspension(p, (S?.fsusp ?? "pull") === "pull", S?.rsusp === "pull");
  // mirrors on the inlets' top, stays to the chassis's side
  const M = mirrorParts([0.5, 0.68, 0.52 + ck], [0.16, 0.065, 0.06], [0.27, 0.6, 0.55 + ck]);
  const tcamPod = softBox(0.1, 0.055, 0.13, 0, 0.995, -0.6 + ck, 0.3);   // (the lens at its front: the TCAM mount)
  // the shark fin (small on these cars), the exhaust over the crash structure
  const fin = plate([[-0.8, 0.935], [-1.0, 0.93], [-1.65, 0.68], [-1.65, 0.6], [-0.8, 0.9]].map(([z, y]) => [zb(z), y]), 0, 0.008);
  const exhaust = new THREE.CylinderGeometry(0.045, 0.05, 0.14, 14, 1, true); exhaust.rotateX(Math.PI / 2); exhaust.translate(0, 0.43, -2.46);
  return {
    body, pods: both(podL),
    // (2022–25 halos are painted in the team's colours on most cars: with the body, the livery's zones decide)
    paintExtra: [paintUV(halo(p), true), rwPlates, ...M.heads],
    carbon: metricUV(merge([...floor, fw0, fwPlates, rwPylon, beam, ...susp, ...corners(p), ...M.stays, fin, tcamPod, inlets, airbox, exhaust, ...mirrorGlass([0.5, 0.68, 0.52 + ck], [0.16, 0.065, 0.06]), ...shapeParts(S, p, fwSpan, 2.68, 0.35, zb)]), 0.04),
    wing: rwMain, fwFlaps: merge([...fwF, ...fwEnds]), rwFlaps: rwFlap,   // (2022–25 flaps never move: the endplates go with them)
    fwPivot: [0.13, 2.68], rwPivot: [0.92, -2.3], aeroOpen: { fw: 0, rw: -0.75 },   // (2022–25: DRS opens the rear flap only)
    lights: [boxAt(0.14, 0.05, 0.02, 0, 0.3, -2.64)], halo: null,
  };
}

function body2026(p) {
  const S = p.shape;
  // (ahead of the cockpit the chassis stands high – ~0.67 m at the opening's front in the 2026 footage, hiding the
  // front suspension from the T-cam; v0.22: its top rounded – ~0.32 m across near its top in the pole-lap frames)
  // (the airbox stands over the helmet: in 2026 photos its inlet's top is ~0.1 m above the helmet's – an estimate)
  // the nose may reach 1.3 m ahead of the front axle (C3.7.1: z 3.0); the cars' noses end near the main plane's front
  const C = [
    [2.86, 0.17, 0.25, 0.065, 0, 2.4, -0.1], [2.72, 0.165, 0.285, 0.09, 0, 2.5, -0.2], [2.4, 0.17, 0.35, 0.115, 0, 2.6, -0.26], [2.0, 0.18, 0.43, 0.145, 0, 2.6, -0.3],
    [1.6, 0.17, 0.52, 0.18, 0, 2.4, -0.3], [1.2, 0.12, 0.62, 0.235, 0, 2.1, -0.3], [0.8, 0.1, 0.675, 0.28, 0, 2.1, -0.28], [0.5, 0.1, 0.66, 0.295, 0, 2.3, -0.24],
    [0.3, 0.1, 0.575, 0.305, 0, 3, -0.2], [0.0, 0.1, 0.545, 0.31, 0, 3, -0.2], [-0.28, 0.1, 0.64, 0.31, 0, 2.8, -0.3],
    [-0.37, 0.1, 0.93, 0.285, 0, 2.6, -0.55], [-0.48, 0.1, 0.995, 0.26, 0, 2.5, -0.62], [-0.7, 0.1, 0.99, 0.245, 0, 2.5, -0.6], [-0.9, 0.1, 0.96, 0.235, 0, 2.5, -0.55], [-1.2, 0.1, 0.85, 0.21, 0, 2.5, -0.45],
    [-1.6, 0.13, 0.7, 0.155, 0, 2.5, -0.35], [-2.0, 0.18, 0.54, 0.1, 0, 2.5, -0.25], [-2.28, 0.22, 0.44, 0.065, 0, 2.4, -0.15], [-2.42, 0.245, 0.36, 0.045], [-2.595, 0.255, 0.33, 0.032],
  ];
  const zb = bodyShift(p), zp = podShift(p), ck = p.ck || 0;
  const body = loft(smoothSections(sec(zMap(shapeBody(C, S, 1.6), zb)), 2).reverse(), 32);
  const P = sec(zMap(shapePods([
    [0.55, 0.4, 0.62, 0.11, 0.52, 3.2, 0.12], [0.4, 0.34, 0.645, 0.14, 0.51, 3, 0.28], [0.05, 0.28, 0.645, 0.155, 0.49, 2.8, 0.38], [-0.35, 0.23, 0.6, 0.15, 0.46, 2.7, 0.38],
    [-0.75, 0.19, 0.52, 0.125, 0.41, 2.6, 0.32], [-1.15, 0.165, 0.43, 0.1, 0.34, 2.6, 0.28], [-1.5, 0.15, 0.33, 0.07, 0.27, 2.5, 0.2], [-1.78, 0.15, 0.26, 0.04, 0.2],
  ], S), zp));
  const podL = loft(smoothSections(P, 2).reverse(), 24);
  const inlets = both(mouth(P[0], 0.8));
  const airbox = mouth([-0.385 + ck, 0.89, S?.airbox === "rect" ? 0.11 : 0.078, 0.058, 0, S?.airbox === "oval" ? 2.2 : 2.8, S?.airbox === "rect" ? -0.1 : -0.55], 1, -0.005);
  // the 2026 floor: narrower, flatter (smaller tunnels), the front boards outboard of the floor's front
  const floor = floorParts({ floorPlan: [[0.12, 1.25], [0.45, 1.25], [0.6, 1.0], [0.74, 0.55], [0.75, 0.2], [0.75, -0.9], [0.68, -1.25], [0.56, -1.33], [0.5, -1.45], [0.48, -2.22]],
    floorY: 0.07, tunnel: [1.25, 0.6], tunnelH: 0.21, tunnelX: [0.1, 0.48], fences: [0.18, 0.33], edgeWing: [0.95, 0.45, 0.74], edgeX: 0.75, edgeLip: -0.9,
    diffuser: [-1.35, -2.22], diffuserW: 0.48, diffuserH: 0.31 });
  const boards = merge([plate([[1.25, 0.08], [1.25, 0.34], [1.05, 0.36], [0.75, 0.3], [0.7, 0.08]], 0.6, 0.01), plate([[1.25, 0.08], [1.25, 0.34], [1.05, 0.36], [0.75, 0.3], [0.7, 0.08]], -0.6, 0.01)]);
  // front wing (C3.10: up to three elements, profiles within |y| ≤ 0.675 m, z 0.06–0.30 m, endplates at |y| 0.575–0.68):
  // the main plane, the two flaps that open in straight-line mode; endplates in front of the tyres' inner half
  const fwSpan = 1.35, r = (e) => sstep(0.35, 1, e);
  const fw0 = wingSpan(fwSpan, (e) => [0.075 + 0.07 * r(e), 2.93 - 0.1 * r(e), 0.32 - 0.06 * r(e), 0.032, 0.06 + 0.08 * r(e)]);
  const fwF = [wingSpan(fwSpan - 0.02, (e) => [0.15 + 0.08 * r(e), 2.58 - 0.08 * r(e), 0.17 + 0.03 * r(e), 0.026, 0.22 + 0.2 * r(e)]),
    wingSpan(fwSpan - 0.03, (e) => [0.2 + 0.08 * r(e), 2.45 - 0.05 * r(e), 0.12 + 0.02 * r(e), 0.022, 0.38 + 0.2 * r(e)])];
  const epF = [[2.95, 0.075], [2.95, 0.2], [2.88, 0.3], [2.7, 0.365], [2.4, 0.375], [2.15, 0.33], [2.05, 0.2], [2.08, 0.075]];
  const fwPlates = merge([plate(epF, 0.63, 0.012), plate(epF, -0.63, 0.012)]);
  const pylons = merge([plate([[2.75, 0.12], [2.75, 0.2], [2.45, 0.27], [2.3, 0.27], [2.4, 0.12]], 0.075, 0.012), plate([[2.75, 0.12], [2.75, 0.2], [2.45, 0.27], [2.3, 0.27], [2.4, 0.12]], -0.075, 0.012)]);
  // rear wing (C3.11: up to three elements within |y| ≤ 0.575 m, z 0.725–0.88 m; endplates – the upper at |y| 0.535–0.575,
  // the lower inboard at |y| 0.345–0.375, z 0.25–0.425; no beam wing): the main plane and two flaps that open together
  const rwSpan = 1.12;
  const rwMain = wingSpan(rwSpan, (e) => [0.78 + 0.02 * e * e, -1.9 - 0.02 * e, 0.26, 0.04, 0.12]);
  const rwFlaps = merge([wingSpan(rwSpan - 0.02, (e) => [0.875 + 0.01 * e * e, -2.2, 0.17, 0.028, 0.42]), wingSpan(rwSpan - 0.04, (e) => [0.92 + 0.008 * e * e, -2.33, 0.11, 0.022, 0.62])]);
  const epU = [[-1.85, 0.6], [-1.86, 0.88], [-1.95, 0.925], [-2.3, 0.925], [-2.42, 0.9], [-2.44, 0.64], [-2.3, 0.59]];
  const epL = [[-1.95, 0.29], [-2.4, 0.29], [-2.44, 0.47], [-2.3, 0.64], [-2.12, 0.64], [-2.0, 0.47]];
  const rwPlates = merge([plate(epU, rwSpan / 2 + 0.006, 0.012), plate(epU, -rwSpan / 2 - 0.006, 0.012), plate(epL, 0.36, 0.012), plate(epL, -0.36, 0.012),
    ...[1, -1].map((k) => plate([[-2.3, 0.59], [-2.44, 0.64], [-2.3, 0.64]], 0.45 * k, 0.012))]);
  const rwPylon = merge([plate([[-2.12, 0.33], [-2.04, 0.55], [-1.98, 0.76], [-2.2, 0.76], [-2.26, 0.55], [-2.36, 0.4], [-2.38, 0.33]], 0, 0.014)]);
  const susp = suspension(p, S?.fsusp === "pull", S?.rsusp === "pull");
  // mirrors (C3.7.5: on stays from the chassis, the lateral safety light in the body; 2026 footage: larger and higher
  // than before, either side of the halo's legs)
  const M = mirrorParts([0.56, 0.74, 0.48 + ck], [0.22, 0.085, 0.07], [0.27, 0.62, 0.5 + ck]);
  // the T-cam pod on the airbox (2026 photos: a black pod with its antennas well over the helmet); the lens at its front
  const tcamPod = merge([softBox(0.11, 0.075, 0.16, 0, 1.06, -0.58 + ck, 0.3), boxAt(0.006, 0.07, 0.03, 0.03, 1.12, -0.62 + ck), boxAt(0.006, 0.07, 0.03, -0.03, 1.12, -0.62 + ck)]);
  const fin = plate([[-0.78, 0.985], [-0.98, 0.975], [-1.65, 0.68], [-1.65, 0.6], [-0.78, 0.95]].map(([z, y]) => [zb(z), y]), 0, 0.008);
  const exhaust = new THREE.CylinderGeometry(0.045, 0.05, 0.14, 14, 1, true); exhaust.rotateX(Math.PI / 2); exhaust.translate(0, 0.42, -2.4);
  return {
    body, pods: both(podL), paintExtra: [rwPlates, ...M.heads],
    // (2026 halos are black carbon on every car in the footage and photos – not painted)
    carbon: metricUV(merge([...floor, fw0, pylons, fwPlates, boards, rwPylon, ...susp, ...corners(p), ...M.stays, tcamPod, fin, inlets, airbox, exhaust, halo(p), ...mirrorGlass([0.56, 0.74, 0.48 + ck], [0.22, 0.085, 0.07]), ...shapeParts(S, p, fwSpan, 2.5, 0.37, zb)]), 0.04),
    wing: rwMain, fwFlaps: merge(fwF), rwFlaps,
    fwPivot: [0.16, 2.5], rwPivot: [0.895, -2.2], aeroOpen: { fw: -0.28, rw: -0.55 },   // (2026: both wings' flaps open)
    lights: [boxAt(0.012, 0.05, 0.36, rwSpan / 2 + 0.014, 0.82, -2.15), boxAt(0.012, 0.05, 0.36, -rwSpan / 2 - 0.014, 0.82, -2.15), boxAt(0.06, 0.05, 0.02, 0, 0.29, -2.58)],
    halo: null,
  };
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
  // (v0.39: the cockpit ck further forward than these numbers – the helmet and mounts are the profile's own)
  const ck = p.ck || 0; for (const g of [rim, headrest, tub]) g.translate(0, 0, ck);
  // helmet: an egg a little longer than wide, its chin bar lower in front; the visor a band over its eyes
  const [sx, sy, sz] = p.helmetSize || [0.13, 0.14, 0.155];
  const helmet = new THREE.SphereGeometry(1, 32, 24); helmet.scale(sx, sy, sz);
  { const q = helmet.attributes.position; for (let i = 0; i < q.count; i++) { const y = q.getY(i), z = q.getZ(i); if (y < -0.04 && z > 0) q.setY(i, y - 0.02 * (z / 0.155)); } helmet.computeVertexNormals(); }
  helmet.translate(hx, hy, hz);
  const visor = new THREE.SphereGeometry(1.01, 32, 8, Math.PI / 2 - 0.95, 1.9, 1.2, 0.42); visor.scale(sx, sy, sz); visor.translate(hx, hy, hz);
  // the steering wheel: a rounded rectangle, its face (screen, buttons: −z, towards the driver) tilted up to the
  // driver's eyes, grips and paddles behind
  const wz = 0.36 + ck, wy = 0.61, tilt = 0.42;
  // (the team's wheel where a source shows it – carshapes.js wheel: a sculpted top and slimmer lower section (Ferrari
  // 2026), a top row of shift LEDs, its count of rotaries and buttons; else the neutral wheel)
  const W = p.shape?.wheel || null, ww = 0.25, wh = W?.ratio ? ww / W.ratio : 0.14;
  const wheelBody = W?.style === "sculpted"
    ? merge([softBox(ww, 0.085, 0.035, 0, 0.025, 0, 0.3), softBox(0.15, 0.06, 0.032, 0, -0.04, 0, 0.3), ...[-0.08, 0, 0.08].map((x) => softBox(0.05, 0.02, 0.03, x, 0.07, 0, 0.45))])
    : softBox(ww, wh, 0.035, 0, 0, 0, 0.25);
  const grips = merge([softBox(0.055, 0.13, 0.055, 0.14, -0.005, 0.0, 0.45), softBox(0.055, 0.13, 0.055, -0.14, -0.005, 0.0, 0.45)]);
  const paddles = merge([boxAt(0.07, 0.07, 0.006, 0.08, 0.0, 0.03), boxAt(0.07, 0.07, 0.006, -0.08, 0.0, 0.03)]);
  const screen = new THREE.PlaneGeometry(0.11, 0.055); screen.rotateY(Math.PI); screen.translate(0, 0.02, -0.0185);
  const buttons = [], btn = (bx, by, r = 0.008, d = 0.01) => { const b = new THREE.CylinderGeometry(r, r, d, 10); b.rotateX(Math.PI / 2); b.translate(bx, by, -0.02); buttons.push(b); };
  if (!W) for (const [bx, by] of [[-0.1, 0.04], [0.1, 0.04], [-0.1, -0.03], [0.1, -0.03], [-0.07, -0.055], [0.07, -0.055], [-0.03, -0.055], [0.03, -0.055]]) btn(bx, by);
  else {
    // buttons in two columns either side of the screen, rotaries along the bottom (bigger), LEDs in a row on top
    const nb = W.buttons || 8, per = Math.ceil(nb / 2);
    for (let i = 0; i < nb; i++) { const k = i < per ? -1 : 1, j = i < per ? i : i - per; btn(0.088 * k + (j % 2) * 0.016 * k, 0.045 - Math.floor(j / 2) * 0.026, 0.0075); }
    const nr = W.rotaries || 0, lowY = W.style === "sculpted" ? -0.05 : -wh / 2 + 0.018;
    for (let i = 0; i < nr; i++) btn(nr === 1 ? 0 : -0.07 + (0.14 * i) / (nr - 1), lowY, 0.0115, 0.014);
    for (let i = 0; i < (W.leds || 0); i++) btn(-0.07 + (0.14 * i) / Math.max(1, W.leds - 1), (W.style === "sculpted" ? 0.06 : wh / 2) - 0.012, 0.0035, 0.006);
  }
  const column = rod([0, -0.02, 0.02], [0, -0.02, 0.2], 0.018, 10);
  // gloves on the grips; forearms back to the elbows, hidden lower in the cockpit; shoulders under the headrest
  // a fist round the grip: the fingers wrapped over its front, the thumb on the wheel's face
  const glove = (k) => { const g = new THREE.CapsuleGeometry(0.03, 0.05, 6, 12); g.scale(1.15, 1, 1); g.translate(0.145 * k, -0.005, 0.004); const th = new THREE.CapsuleGeometry(0.012, 0.03, 4, 8); th.rotateZ(0.9 * k); th.translate(0.112 * k, 0.03, -0.024); return merge([g, th]); };
  // (forearms in the car's frame: from the grips down and back to the elbows, inside the cockpit under its rim)
  const forearm = (k) => { const g = new THREE.CapsuleGeometry(0.033, 0.26, 4, 12); const A = new THREE.Vector3(0.15 * k, wy - 0.02, wz - 0.03), B = new THREE.Vector3(0.22 * k, 0.5, wz - 0.32); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize())); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); return g; };
  return {
    rim, headrest: merge([headrest, tub]), helmet, visor,
    // (the forearms: one unit capsule – placed per car each frame from the turning grip to the elbow, setWheels)
    wheel: { body: metricUV(merge([wheelBody, column, paddles]), 0.04), grips, screen, buttons: merge(buttons), gloves: merge([glove(1), glove(-1)]), arm: new THREE.CapsuleGeometry(0.033, 1, 4, 12), at: [0, wy, wz], tilt,
      grip: [0.145, -0.005, 0.004], elbow: [0.22, 0.5, wz - 0.32] },
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
  // the sidewall's markings: a ring from the rim's lip to the shoulder, just off the rubber (its UVs the plane's: the
  // texture's middle at the axle – SIDEWALL's angles and radii)
  const band = (r, w) => { const out = r - 0.012, g = new THREE.RingGeometry(out * SIDEWALL.inner, out, 72, 1); g.rotateY(Math.PI / 2); g.translate(w / 2 + 0.004, 0, 0); return both(g); };
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
// base, top (spine/engine cover), side (sidepod band), accent (stripes), nose tip, num (the number's colour), wing (the
// rear wing's elements), fw (the front wing's flaps), ep (the rear wing's endplates), halo (2022–25: painted), lower
// (the lower chassis / undercut, up to lowerY m), split (the left side another colour: Cadillac's early 2026 car),
// finish: matte paint (rougher). paint: the team's own zones (painter shapes in metres: z along the car, y up, |x|
// across – liveryTexture) where race photos of that season's car show them; else paintDefault from the colours.
// Matched on the feed's team name and the season (from / until: event dates where a livery changed in the season).
// Colour zones only – no sponsor or team logos, no maker badges (none are licensed): where a logo dominates an area
// (Red Bull's bull, Mercedes' stars) the area keeps the colour around it. Race photos compared (Wikimedia Commons,
// dated race weekends 2025 / 2026 – docs/research/cars_photos.md).
const WHITE = "#f2f3f4", BLACK = "#16171a", CARBON = "#1b1c1f";
const LIVERIES = [
  // Red Bull: matte navy (2025), glossier and brighter (2026 – research §RB22: gloss); the yellow airbox flowing into the
  // red bull on the engine cover (drawn as a plain red panel), yellow nose tip; navy wings
  [/red bull racing/i, { base: "#1c2552", top: "#1c2552", side: "#1c2552", accent: "#d8102c", nose: "#ffc906", num: "#ffffff", wing: "#1c2552", fw: "#1c2552", ep: "#1c2552", halo: "#1c2552", finish: "matte", paint: paintRedBull }, { until: 2025 }],
  [/red bull racing/i, { base: "#1f2c70", top: "#1f2c70", side: "#1f2c70", accent: "#d8102c", nose: "#ffc906", num: "#ffffff", wing: "#1f2c70", fw: "#1f2c70", ep: "#1f2c70", paint: paintRedBull }, { from: 2026 }],
  [/racing bulls|\bvcarb|alphatauri|rb f1/i, { base: "#f3f5f8", top: "#f3f5f8", side: "#f3f5f8", accent: "#e21b4d", nose: "#f3f5f8", num: "#1c3faf", wing: "#1c3faf", fw: "#f3f5f8", ep: "#1c3faf", lower: "#1c2f7a", lowerY: 0.33, halo: "#1c3faf" }],
  // Mercedes: black, a silver band along the nose and chassis top, a teal stripe from the nose tip along the chassis
  // into the sidepod (2025); 2026 the same with silver bars over the sidepod's louvres
  [/mercedes/i, { base: "#111214", top: "#111214", side: "#111214", accent: "#00c8b0", nose: "#111214", num: "#ffffff", wing: "#111214", fw: "#111214", ep: "#111214", halo: "#111214", paint: paintMercedes }],
  // Ferrari 2025: red (matte – recollection, L), a white block on the engine cover behind the airbox down to the
  // sidepod's top with a red line inside it, black lower body; red halo; white rear-wing elements, black endplates
  [/ferrari/i, { base: "#d6001c", top: "#d6001c", side: "#d6001c", accent: WHITE, nose: "#d6001c", num: WHITE, wing: WHITE, fw: "#d6001c", ep: BLACK, halo: "#d6001c", numAt: [-1.45, 0.5], finish: "matte", paint: paintFerrari25 }, { until: 2025 }],
  // Ferrari 2026: gloss (H: Ferrari release), brighter red, white round the cockpit and over the airbox and engine
  // cover's top (312T style); black rear wing
  [/ferrari/i, { base: "#e2101e", top: "#e2101e", side: "#e2101e", accent: WHITE, nose: "#e2101e", num: WHITE, wing: BLACK, fw: "#e2101e", ep: BLACK, numAt: [-1.45, 0.52], paint: paintFerrari26 }, { from: 2026 }],
  // McLaren 2025: papaya nose, cockpit surround and front of the sidepods; anthracite sidepod tops, flanks and engine
  // cover with a papaya wedge rising to the rear; papaya rear-wing endplates and flaps; black halo
  [/mclaren/i, { base: "#ff7f00", top: "#ff7f00", side: "#ff7f00", accent: "#ff7f00", nose: "#ff7f00", num: BLACK, wing: "#ff7f00", fw: "#ff7f00", ep: "#ff7f00", halo: BLACK, numAt: [-1.45, 0.52], paint: paintMcLaren25 }, { until: 2025 }],
  // McLaren 2026: papaya, a black diagonal band from the sidepods' front up over the airbox's back, teal on the airbox
  [/mclaren/i, { base: "#ff7f00", top: "#ff7f00", side: "#ff7f00", accent: "#ff7f00", nose: "#ff7f00", num: BLACK, wing: BLACK, fw: "#ff7f00", ep: "#ff7f00", numAt: [-1.45, 0.52], paint: paintMcLaren26 }, { from: 2026 }],
  // Aston Martin: dark racing green with black, lime accents (endplates)
  [/aston martin/i, { base: "#00483d", top: "#00483d", side: BLACK, accent: "#cedc00", nose: "#00483d", num: "#cedc00", wing: "#00483d", fw: "#00483d", ep: "#cedc00", halo: "#00483d" }],
  // Alpine 2025: blue top and engine cover, pink nose, sidepods and endplates, black lower body; 2026: pink nose and
  // lower sidepods, blue upper body
  [/alpine/i, { base: "#0a3a8c", top: "#0a3a8c", side: "#ff87bc", accent: "#ff87bc", nose: "#ff87bc", num: "#ffffff", wing: "#0a3a8c", fw: "#ff87bc", ep: "#ff87bc", halo: "#0a3a8c" }],
  // Williams 2025: blue sidepods and engine cover, dark navy nose and lower body; 2026: light blue with navy accents
  [/williams/i, { base: "#1f5fd0", top: "#1f5fd0", side: "#1f5fd0", accent: "#ffffff", nose: "#0b1f4f", num: "#ffffff", wing: "#0b1f4f", fw: "#0b1f4f", ep: "#0b1f4f", lower: "#0b1f4f", lowerY: 0.3, halo: "#0b1f4f" }, { until: 2025 }],
  [/williams/i, { base: "#3c9be0", top: "#3c9be0", side: "#3c9be0", accent: "#ffffff", nose: "#0b1f4f", num: "#ffffff", wing: "#0b1f4f", fw: "#3c9be0", ep: "#0b1f4f", lower: "#0b1f4f", lowerY: 0.3 }, { from: 2026 }],
  // Haas 2025: white upper body, black lower body, red on the endplates; 2026: white with a red lower nose
  [/haas/i, { base: WHITE, top: WHITE, side: WHITE, accent: "#da291c", nose: WHITE, num: "#da291c", wing: BLACK, fw: BLACK, ep: "#da291c", lower: BLACK, lowerY: 0.34, halo: BLACK }, { until: 2025 }],
  [/haas/i, { base: WHITE, top: WHITE, side: WHITE, accent: "#da291c", nose: "#da291c", num: "#da291c", wing: BLACK, fw: "#da291c", ep: BLACK, lower: BLACK, lowerY: 0.28 }, { from: 2026 }],
  // Audi 2026: titanium grey, a red panel on the rear sidepod and engine-cover flank, black engine cover, black wings
  [/audi/i, { base: "#a7abb0", top: BLACK, side: "#e10600", accent: "#e10600", nose: "#a7abb0", num: "#ffffff", wing: BLACK, fw: BLACK, ep: BLACK }],
  // Sauber 2025: black with fluorescent green nose, front wing and sidepods' top
  [/kick sauber|sauber|stake/i, { base: BLACK, top: "#52e252", side: BLACK, accent: "#52e252", nose: "#52e252", num: "#52e252", wing: BLACK, fw: "#52e252", ep: BLACK, halo: BLACK }],
  // Cadillac 2026: to Austria asymmetric (right side mainly black, left mainly white); from the Austrian GP white with
  // black trim and lower body (research cars2026 §Cadillac: The Race 9 Feb 2026; Crash 20 Jul 2026; Austria photos)
  [/cadillac/i, { base: BLACK, top: WHITE, side: BLACK, accent: "#c8a24a", nose: BLACK, num: WHITE, split: WHITE, wing: BLACK, fw: BLACK, ep: BLACK }, { until: "2026-06-26" }],
  [/cadillac/i, { base: WHITE, top: WHITE, side: BLACK, accent: BLACK, nose: WHITE, num: BLACK, wing: BLACK, fw: BLACK, ep: BLACK, lower: BLACK, lowerY: 0.3 }, { from: "2026-06-26" }],
];
// The livery for a team in a season (and on an event's date where it changed mid-season)
export function liveryFor(teamName, teamColour, season = null, date = null) {
  const y = +season || null, d = typeof date === "string" ? date.slice(0, 10) : null;
  const ok = (w) => { if (!w) return true;
    const lo = w.from, hi = w.until;
    if (typeof lo === "number" && y && y < lo) return false; if (typeof hi === "number" && y && y > hi) return false;
    if (typeof lo === "string") { if (!d) return y ? y > +lo.slice(0, 4) : true; if (d < lo) return false; }
    // (no date: the livery the season started with)
    if (typeof hi === "string") { if (!d) return y ? y <= +hi.slice(0, 4) : true; if (d >= hi) return false; }
    return true; };
  for (const [re, l, w] of LIVERIES) if (re.test(teamName || "") && ok(w)) return l;
  const c = "#" + (teamColour || "888888");
  return { base: c, top: c, side: "#151515", accent: "#ffffff", nose: c, num: "#ffffff" };
}
// the teams' own zones (side view: z, y; plan: z, |x|) – on this model's body: the engine cover's top runs 0.95 m over
// the airbox (z −0.4 … −0.75) down to 0.48 m at z −2.0; the sidepods from their inlets (z 0.55) to z −1.85
function paintFerrari25(P, l) {
  P.side(l.lower || BLACK, [[3.3, -0.1], [-2.8, -0.1], [-2.8, 0.24], [3.3, 0.24]]);
  // the white block and the red line inside it, parallel to its front edge
  P.side(WHITE, [[-0.48, 1.1], [-0.48, 0.96], [-0.88, 0.5], [-1.3, 0.5], [-1.3, 1.1]]).plan(WHITE, [[-0.5, -0.01], [-0.5, 0.3], [-1.3, 0.3], [-1.3, -0.01]]);
  P.sideLine(l.base, 0.02, [[-0.58, 1.0], [-0.95, 0.56]]);
  P.side(l.ep, [[-1.95, 0.55], [-2.7, 0.55], [-2.7, 1.1], [-1.95, 1.1]]);
}
function paintFerrari26(P, l) {
  P.side(BLACK, [[3.3, -0.1], [-2.8, -0.1], [-2.8, 0.28], [3.3, 0.28]]);
  // white round the cockpit, over the airbox and the engine cover's top, its rear edge coming down diagonally
  P.side(WHITE, [[0.6, 1.1], [0.6, 0.61], [-0.28, 0.63], [-0.3, 0.72], [-1.0, 0.72], [-1.3, 1.1]]).plan(WHITE, [[0.62, 0.17], [0.62, 0.34], [-1.3, 0.34], [-1.3, -0.01], [-0.25, -0.01], [-0.25, 0.17]]);
  P.sideLine(l.base, 0.016, [[-0.3, 0.705], [-1.0, 0.705], [-1.28, 1.08]]);
  P.side(l.ep, [[-1.8, 0.55], [-2.7, 0.55], [-2.7, 1.1], [-1.8, 1.1]]);
}
function paintMcLaren25(P, l) {
  P.side(BLACK, [[3.3, -0.1], [-2.8, -0.1], [-2.8, 0.2], [3.3, 0.2]]);
  // anthracite from the sidepods' inlets back, the papaya wedge rising behind it to the engine cover's top
  P.side("#1d1f23", [[0.6, 1.1], [0.6, 0.44], [-0.4, 0.2], [-1.3, 1.1]]).plan("#1d1f23", [[0.6, 0.12], [0.6, 0.8], [-0.7, 0.8], [-1.0, -0.01], [-0.3, -0.01], [-0.3, 0.12]]);
  P.side(l.base, [[-0.36, 1.1], [-0.36, 0.86], [-0.78, 0.86], [-0.78, 1.1]]);   // the airbox's front
  P.side(l.ep, [[-1.95, 0.55], [-2.7, 0.55], [-2.7, 1.1], [-1.95, 1.1]]);
}
function paintMcLaren26(P, l) {
  P.side(BLACK, [[3.3, -0.1], [-2.8, -0.1], [-2.8, 0.2], [3.3, 0.2]]);
  P.side("#1d1f23", [[0.5, 0.28], [-0.3, 1.1], [-1.2, 1.1], [-0.45, 0.2]]).plan("#1d1f23", [[0.3, 0.8], [-0.55, 0.8], [-1.1, -0.01], [-0.25, -0.01]]);
  P.side("#2bb5b8", [[-0.3, 1.1], [-0.3, 0.86], [-0.62, 0.86], [-0.62, 1.1]]);   // teal on the airbox
  P.side(l.ep, [[-1.8, 0.55], [-2.7, 0.55], [-2.7, 1.1], [-1.8, 1.1]]);
}
function paintRedBull(P, l) {
  P.side(BLACK, [[3.3, -0.1], [-2.8, -0.1], [-2.8, 0.22], [3.3, 0.22]]);
  P.side("#ffc906", [[-0.34, 1.1], [-0.34, 0.8], [-0.62, 0.78], [-0.8, 0.86], [-0.8, 1.1]]).plan("#ffc906", [[-0.34, -0.01], [-0.34, 0.16], [-0.8, 0.14], [-0.8, -0.01]]);
  P.side("#d8102c", [[-0.8, 0.95], [-0.8, 0.8], [-1.2, 0.68], [-1.55, 0.6], [-1.6, 0.68], [-1.2, 0.84]]);
  P.from("#ffc906", 2.55);
  P.side(l.ep, [[-1.8, 0.55], [-2.7, 0.55], [-2.7, 1.1], [-1.8, 1.1]]);
}
function paintMercedes(P, l, prof) {
  const e26 = prof.era === "2026";
  P.side(BLACK, [[3.3, -0.1], [-2.8, -0.1], [-2.8, 0.2], [3.3, 0.2]]);
  // the silver band along the nose's top and the chassis's upper side to the cockpit; the teal stripe under it
  P.side("#b9bec4", [[3.0, 0.25], [2.0, 0.44], [0.9, 0.61], [0.5, 0.63], [0.5, 0.56], [0.9, 0.54], [2.0, 0.37], [3.0, 0.21]]).plan("#b9bec4", [[3.1, -0.01], [3.1, 0.12], [0.8, 0.2], [0.5, 0.12], [0.5, -0.01]]);
  P.sideLine("#00c8b0", 0.024, [[2.95, 0.205], [2.0, 0.355], [0.9, 0.52], [0.4, 0.5], e26 ? [-0.6, 0.44] : [-0.5, 0.4], e26 ? [-1.2, 0.38] : [-1.3, 0.3]]);
  if (e26) for (let i = 0; i < 3; i++) P.side("#c4c9cf", [[-0.45 - i * 0.16, 0.58], [-0.53 - i * 0.16, 0.58], [-0.68 - i * 0.16, 0.36], [-0.6 - i * 0.16, 0.36]]);
}
// The livery texture (v0.39): painted as a livery drawing is – the car's two side elevations, its plan from above and
// the underside – and laid on the painted parts by projection (paintUV): each face takes the view it faces most. A zone
// is then a shape in metres in the side view (z, y) and / or the plan (z, |x|), the same on both sides, as the photos
// show it; the loft's round-the-ring mapping put colour bands wherever a section's ring happened to pass (v0.38: the
// "side" band ran along the sidepods' tops). Canvas 1536 × 768 (the size of the v0.38 2048 × 512 one): rows 0–225 the
// left side (+x, nose to the left as seen), 225–450 the right side, 450–750 the plan (+x up), below them the underside
// and a patch for the halo (one colour).
const LV = { W: 1536, H: 768, z0: -2.75, z1: 3.25, side: 225, plan: [450, 750], xMax: 0.75, halo: [1400, 752, 1530, 766] };
const lvU = (z, left) => (left ? LV.z1 - z : z - LV.z0) / (LV.z1 - LV.z0);
// canvas row of a height in a side band (0 left, 1 right) / of a sideways place in the plan
const lvSideRow = (band, y) => band * LV.side + 2 + (1 - Math.max(0, Math.min(1, y))) * (LV.side - 4);
const lvPlanRow = (x) => LV.plan[0] + 2 + (1 - (Math.max(-LV.xMax, Math.min(LV.xMax, x)) + LV.xMax) / (2 * LV.xMax)) * (LV.plan[1] - LV.plan[0] - 4);
// UVs for painted geometry (non-indexed): per face, the side it faces (left/right), the plan (up) or the underside;
// `patch` maps every face to the halo's patch (and marks the geometry so)
export function paintUV(g, patch = false) {
  if (g.index) g = g.toNonIndexed();
  const p = g.attributes.position, uv = new Float32Array(p.count * 2), A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3();
  const hu = (LV.halo[0] + LV.halo[2]) / 2 / LV.W, hv = 1 - (LV.halo[1] + LV.halo[3]) / 2 / LV.H;
  for (let i = 0; i < p.count; i += 3) {
    A.fromBufferAttribute(p, i); B.fromBufferAttribute(p, i + 1).sub(A); Cc.fromBufferAttribute(p, i + 2).sub(A); B.cross(Cc); const n = B.normalize();
    const view = patch ? "halo" : n.y > 0.55 ? "plan" : n.y < -0.55 ? "under" : n.x >= 0 ? "left" : "right";
    for (let k = 0; k < 3; k++) {
      if (view === "halo") { uv[(i + k) * 2] = hu; uv[(i + k) * 2 + 1] = hv; continue; }
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      let u, row;
      if (view === "left" || view === "right") { u = lvU(z, view === "left"); row = lvSideRow(view === "left" ? 0 : 1, y); }
      else if (view === "plan") { u = lvU(z); row = lvPlanRow(x); }
      else { u = lvU(z); row = LV.plan[1] + 9; }
      uv[(i + k) * 2] = Math.max(0, Math.min(1, u)); uv[(i + k) * 2 + 1] = 1 - row / LV.H;
    }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  if (patch) g.userData.patch = true;
  return g;
}
// The painter a livery draws with: shapes in metres – side(z, y), plan(z, |x|) (mirrored to both sides) – and the
// numbers
function painter(g, zf = (z) => z) {
  const sx = (z, band) => lvU(zf(z), band === 0) * LV.W, pxm = LV.W / (LV.z1 - LV.z0);
  const poly = (pts, f) => { g.beginPath(); pts.forEach(([a, b], i) => { const [cx, cy] = f(a, b); i ? g.lineTo(cx, cy) : g.moveTo(cx, cy); }); g.closePath(); g.fill(); };
  const P = {
    side(col, pts) { g.fillStyle = col; for (const band of [0, 1]) poly(pts, (z, y) => [sx(z, band), lvSideRow(band, y)]); return P; },
    plan(col, pts) { g.fillStyle = col; for (const k of [1, -1]) poly(pts, (z, x) => [sx(z, 1), lvPlanRow(x * k)]); return P; },
    // everything ahead of z (the nose) – or between z and toZ – in both views
    from(col, z, toZ = 4) { P.side(col, [[z, -0.1], [toZ, -0.1], [toZ, 1.1], [z, 1.1]]); P.plan(col, [[z, -0.01], [toZ, -0.01], [toZ, 0.8], [z, 0.8]]); return P; },
    // a thin line along a side (width in metres)
    sideLine(col, w, pts) { g.strokeStyle = col; g.lineWidth = w * (LV.side - 4); g.lineCap = "round"; g.lineJoin = "round"; for (const band of [0, 1]) { g.beginPath(); pts.forEach(([z, y], i) => (i ? g.lineTo(sx(z, band), lvSideRow(band, y)) : g.moveTo(sx(z, band), lvSideRow(band, y)))); g.stroke(); } return P; },
    // the car's number: on both sides at (z, y), h metres tall; on the plan at z, read from the front
    num(text, col, z, y, h) { g.fillStyle = col; g.textAlign = "center"; g.textBaseline = "middle"; for (const band of [0, 1]) { g.save(); g.translate(sx(z, band), lvSideRow(band, y)); g.scale(1, (LV.side - 4) / pxm); g.font = `italic 900 ${Math.round(h * pxm)}px Arial, sans-serif`; g.fillText(text, 0, 0); g.restore(); } return P; },
    numPlan(text, col, z, h) { g.fillStyle = col; g.textAlign = "center"; g.textBaseline = "middle"; g.save(); g.translate(sx(z, 1), lvPlanRow(0)); g.rotate(-Math.PI / 2); g.scale((LV.plan[1] - LV.plan[0]) / (2 * LV.xMax) / pxm, 1); g.font = `italic 900 ${Math.round(h * pxm)}px Arial, sans-serif`; g.fillText(text, 0, 0); g.restore(); return P; },
  };
  return P;
}
// The livery's zones from its colours (a team without its own drawing): the base all over, the engine cover's top and
// spine, the sidepods' flanks, a pinstripe, the nose tip, the wing endplates, the lower chassis dark
function paintDefault(P, l, prof) {
  const e26 = prof.era === "2026";
  P.side(l.top, [[-0.38, 1.1], [-0.38, 0.84], [-0.9, 0.8], [-1.6, 0.56], [-2.3, 0.37], [-2.8, 0.3], [-2.8, 1.1]]).plan(l.top, [[-0.3, 0], [-0.3, 0.2], [-1.2, 0.14], [-2.8, 0.06], [-2.8, 0]]);
  P.side(l.side, [[0.62, 0.4], [0.62, 0.58], [0.0, 0.58], [-0.8, 0.47], [-1.75, 0.3], [-1.75, 0.17], [-0.6, 0.24]]);
  P.sideLine(l.accent, 0.014, [[2.3, 0.34], [1.2, 0.5], [0.62, 0.6], [-0.2, 0.61], [-1.2, 0.44]]);
  P.from(l.nose, e26 ? 2.3 : 2.4);
  P.side(l.ep || "#141518", [[-1.8, 0.55], [-2.7, 0.55], [-2.7, 1.1], [-1.8, 1.1]]);
  P.side(l.lower || "#16171a", [[3.3, -0.1], [-2.8, -0.1], [-2.8, l.lowerY ?? 0.2], [3.3, l.lowerY ?? 0.2]]);
}
function liveryTexture(l, number, prof) {
  if (!hasDom) return null;
  // (zones are written for the cockpit's old place: moved with the body – bodyShift)
  const c = canvas(LV.W, LV.H), g = c.getContext("2d"), P = painter(g, bodyShift(prof));
  g.fillStyle = l.base; g.fillRect(0, 0, LV.W, LV.plan[1]);
  g.fillStyle = "#16171a"; g.fillRect(0, LV.plan[1], LV.W, LV.H - LV.plan[1]);
  if (l.split) { g.fillStyle = l.split; g.fillRect(0, 0, LV.W, LV.side); g.fillRect(0, LV.plan[0], LV.W, (LV.plan[1] - LV.plan[0]) / 2); }   // the left side another colour
  (l.paint || paintDefault)(P, l, prof);
  // the car's number on each side of the engine cover and on the nose's top
  const e26 = prof.era === "2026", n = String(number);
  P.num(n, l.num, l.numAt?.[0] ?? -1.1, l.numAt?.[1] ?? 0.62, l.numAt ? 0.13 : 0.15);
  P.numPlan(n, l.num, e26 ? 1.85 : 2.0, 0.13);
  // the halo's patch
  g.fillStyle = l.halo || (e26 ? "#16171a" : l.base); g.fillRect(LV.halo[0], LV.halo[1], LV.halo[2] - LV.halo[0], LV.halo[3] - LV.halo[1]);
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
  const prof = profileFor(season, teamName, date), t = template(prof), l = liveryFor(teamName, teamColour, prof.season, date);
  const matte = l.finish === "matte";
  const paint = new THREE.MeshStandardMaterial({ map: liveryTexture(l, number, prof), color: hasDom ? 0xffffff : l.base, roughness: matte ? 0.5 : 0.28, metalness: 0.05 });
  const cm = carbonMaps();
  // (the weave as colour only: a normal and roughness map over a car that fills the cockpit cameras' screen, with the
  // reflections, dropped frames on the GPU – measured; the colour map costs next to nothing)
  const carbon = mat("carbon", () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: cm.colour, roughness: 0.42, metalness: 0.15 }));
  // the rear wing's elements and the front wing's flaps in the livery's colours (v0.38: the top colour on both)
  const wingPaint = new THREE.MeshStandardMaterial({ color: l.wing || (l.accent === "#ffffff" || l.accent === "#f2f2f2" ? l.base : l.top), roughness: matte ? 0.5 : 0.3, metalness: 0.05 });
  const fwPaint = new THREE.MeshStandardMaterial({ color: l.fw || l.wing || l.base, roughness: matte ? 0.5 : 0.3, metalness: 0.05 });
  const carbonThin = mat("carbonThin", () => new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.45, metalness: 0.15, side: THREE.DoubleSide }));
  const tyreMat = mat("tyre", () => new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.9, metalness: 0 }));
  const coverMat = mat("cover", () => new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.35, metalness: 0.6 }));
  const lipMat = mat("lip", () => new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.3, metalness: 0.9 }));
  const pad = mat("pad", () => new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.85, metalness: 0 }));
  const visorMat = mat("visor", () => new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.06, metalness: 0.7 }));
  const screenMat = mat("screen", () => new THREE.MeshBasicMaterial({ map: wheelScreen(), toneMapped: false }));
  const buttonMat = mat("buttons", () => new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.4, metalness: 0.5 }));
  const bandMat = sidewallMaterial(0xf2c230);
  const lightMat = mat("light", () => new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  const helmetMat = new THREE.MeshStandardMaterial({ map: helmetTexture(l), color: hasDom ? 0xffffff : l.top, roughness: 0.18, metalness: 0.1 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: l.base, roughness: 0.8, metalness: 0 });
  const g = new THREE.Group();
  const add = (geo, m, parent = g, name) => { const mesh = new THREE.Mesh(geo, m); if (name) mesh.name = name; parent.add(mesh); return mesh; };
  add(t.painted, paint); add(t.carbon, carbon); add(t.wing, wingPaint); add(t.rim, pad);
  // active aero / DRS: the flaps pivot about their leading edges (closed = corner mode, open = straight mode / DRS)
  const pivot = ([y, z], geo, m0) => { const pv = new THREE.Group(); pv.position.set(0, y, z); const m = new THREE.Mesh(geo, m0); m.position.set(0, -y, -z); pv.add(m); g.add(pv); return pv; };
  const fwPivot = pivot(t.fwPivot, t.fwFlaps, fwPaint), rwPivot = pivot(t.rwPivot, t.rwFlaps, wingPaint);
  const fine = [add(t.lights, lightMat)];
  // driver: helmet and visor always (a T-cam sees them); the rest close up only
  const helmet = add(t.helmet, helmetMat, g, "helmet"); const visor = add(t.visor, visorMat, helmet);
  const near = new THREE.Group(); near.name = "near"; g.add(near);
  add(t.headrest, pad, near);
  const wheel = new THREE.Group(); wheel.name = "steering"; wheel.position.set(...t.wheel.at); wheel.rotation.x = t.wheel.tilt; near.add(wheel);
  add(t.wheel.body, carbon, wheel); add(t.wheel.grips, pad, wheel); const screen = add(t.wheel.screen, screenMat, wheel, "wheelScreen"); add(t.wheel.buttons, buttonMat, wheel); add(t.wheel.gloves, gloveMat, wheel);
  // forearms: from each glove (it turns with the wheel) back to its elbow – placed by setWheels so the hands never leave
  // the arms when the wheel turns (v0.34: the arms were fixed while the gloves turned)
  const arms = [1, -1].map((k) => { const m = add(t.wheel.arm, gloveMat, near); m.userData.k = k; return m; });
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
  g.userData = { profile: prof, mounts, wheels, spins, fwPivot, rwPivot, bandMat, near, fine, helmet, visor, wheel, arms, armGeo: { grip: t.wheel.grip, elbow: t.wheel.elbow }, screen, screenShared: screenMat, lod: "near", compound: null, aero: 0, aeroOpen: t.aeroOpen,
    paintMats: [paint, wingPaint, fwPaint, helmetMat, gloveMat], bounds: { length: t.box.max.z - t.box.min.z, width: prof.W, height: t.box.max.y } };
  placeArms(g.userData);   // (the hands on the grips from the start)
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
  // (spin: one angle, or [front, rear] – each axle its own radius)
  u.spins.forEach((s, i) => { s.rotation.x = Array.isArray(spin) ? spin[i < 2 ? 0 : 1] : spin; });
  if (u.wheel) u.wheel.rotation.z = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, -steer * STEER_RATIO));
  if (u.arms && u.near.visible) placeArms(u);
}
// How far the sidewall markings smear this frame (rad; wheelspin.js smearOf) – the wheel's look at speed
export function setSmear(car, smear) {
  const u = car.userData; u.smear = smear;
  const sm = u.bandMat.userData.smear; if (sm) sm.value = smear;
}
// each forearm from its glove (where the turned wheel has it) to its elbow, the elbow following the hand a little (a
// driver's arm bends with the wheel – an approximation: no joint model)
const _A = new THREE.Vector3(), _B = new THREE.Vector3(), _D = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
function placeArms(u) {
  u.wheel.updateMatrix();
  for (const m of u.arms) {
    const k = m.userData.k, [gx, gy, gz] = u.armGeo.grip, [ex, ey, ez] = u.armGeo.elbow;
    _A.set(gx * k, gy, gz).applyMatrix4(u.wheel.matrix);
    // (the grip's place with the wheel straight: worked out once)
    const rest = m.userData.rest || (m.userData.rest = new THREE.Vector3(gx * k, gy, gz).applyMatrix4(new THREE.Matrix4().compose(u.wheel.position, new THREE.Quaternion().setFromEuler(new THREE.Euler(u.wheel.rotation.x, 0, 0)), new THREE.Vector3(1, 1, 1))));
    _B.set(ex * k, ey, ez); _D.copy(_A).sub(rest); _B.addScaledVector(_D, 0.45);
    _D.copy(_B).sub(_A); const len = _D.length();
    m.position.copy(_A).addScaledVector(_D, 0.5);
    m.quaternion.copy(_q.setFromUnitVectors(_Y, _D.normalize()));
    m.scale.set(1, Math.max(0.05, len - 0.066), 1);
  }
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
export { loft, smoothSections, softBox, merge, boxAt };
