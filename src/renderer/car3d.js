// Formula 1 cars for the 3D view (nose towards +Z, +X the car's left, ground at y = 0, metres), one model per
// season era – the car of that year, not today's on every race –, with a cockpit and driver that hold up close (the
// broadcast T-cam looks down on them) and fewer parts far away.
//
// Model contract (every profile): metres, +Y up, nose +Z, origin on the ground between the axles' midpoint; wheel
// pivots at the axles (steer about Y, roll about X); front-wing flap pivot at its leading edge, rear-wing flap (DRS /
// active aero) at its leading edge; mounts in car coordinates: TCAM (the broadcast camera on the airbox), EYE (the
// driver's eyes); bounds (length, width, height); LOD: "near" (cockpit interior, hands, steering wheel and other
// small parts), "mid" (the car), "far" (wheel covers and lights off; the corners' drums and the 2022–25 front fence and
// arch stay at every level – their outline doesn't pop). See PROFILES for each era's
// numbers and where they come from (rules' limits vs. published or estimated figures).
//
// Eras:
//   2026      – 2026 rules: 3.4 m wheelbase max, 1.9 m wide, narrower front wing on twin pylons, no wheel arches,
//               active aero (both wings' flaps open on straights), no beam wing, smaller tyres.
//   2022      – 2022–2025 ground-effect cars: 3.6 m wheelbase (the rules' maximum; teams ran at or near it), 2.0 m
//               wide, four-element front wing rising outboard, wheel deflectors over the front tyres, 18-inch wheels
//               with covers, beam wing, DRS on the rear wing.
// Team shapes: carshapes.js (nose, sidepod inlet / undercut / top, airbox, cooling, suspension per team and season).
// v0.39: each era's car is built from the parts race photos show (body2022 / body2026 – see the comment above them).
// It was checked against hub-aligned side photos and ¾ photos of 2025 / 2026 race cars (docs/research/cars_photos.md).
// The cockpit moved 0.30–0.33 m forward to where those photos put it. The liveries are painted as side and plan
// elevations (liveryTexture). Proportions are estimates from photos and the rules' limits, not team measurements.
//
// No sponsor or team logos are drawn (none are licensed for this app): liveries are the team's colour zones and the
// car number. Helmets are in team colours, not the drivers' own designs.
import * as THREE from "./vendor/three.module.js";
import { shapeFor } from "./carshapes.js";
import { BODY, driverGlove, mirrorGlove, armSkin, gauntletSkin, trunkGeometry, limbGeometry, JOINT_R, KIT_ZONE, kitZone } from "./body3d.js";
import { kitStyle, kitEntry, kitMaterial } from "./kit.js";
import { harnessGeometry, HARNESS } from "./harness.js";
import { armGeo, planArmsPath, smoothPlan, armFromPlan, armOut, twistedX, PLAN_COST } from "./arms.js";
import { ARM_PLANS } from "./armplans.js";
import { wheelSpec, wheelParts as steeringParts, ledGeometry, teamWheel } from "./wheel3d.js";
import { paintScreen, screenModel } from "./wheelscreen.js";

// ---------- profiles ----------
// FZ/RZ: axle positions along the car, FR/RR tyre radii, FW/RW tyre widths, W: overall width (outer tyre faces),
// H: height of the airbox top. src: where the numbers come from.
export const PROFILES = {
  2026: {
    era: "2026", FZ: 1.7, RZ: -1.7, FR: 0.353, RR: 0.355, FW: 0.335, RW: 0.425, W: 1.9, H: 0.95,
    // (v0.40: FW / RW the tyres' overall width, sidewall to sidewall. They were Pirelli's tread widths (280 / 375 mm) – the
    // tyres drew ~5 cm narrow. The rims' mounting widths fell 20 / 28 mm from 2025 (C10.7.2: 315 / 401.3 mm against 335.3 / 429.3) and 2025's tyres were 345–375 / 440–470 mm
    // overall (FIA 2025 Art. 10.8.1b): ~340 / ~425 mm – an estimate, the FIA 2026 text gives no tyre width (C10.8))
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
    ck: 0.30, tcam: [0.08, 1.12, -0.16], tcamPitch: 17.5, tcamYaw: -2, tcamHfov: 77.5, eye: [0, 0.73, 0.30], helmet: [0, 0.755, 0.25], helmetSize: [0.14, 0.145, 0.16],
    src: "2026 F1 technical regulations: 3.4 m wheelbase max, 1.9 m width; tyre diameters from Pirelli's 2026 announcements (front ~705 mm, rear ~710 mm; the tread 25 / 30 mm narrower than 2025's 305 / 405 mm – motorsport.com), overall widths estimated (above) – the rest estimated",
  },
  2022: {
    era: "2022", FZ: 1.8, RZ: -1.8, FR: 0.36, RR: 0.36, FW: 0.36, RW: 0.455, W: 2.0, H: 0.95,
    // (v0.40: FW / RW the tyres' overall width, the middle of the FIA's measured range – 345–375 / 440–470 mm, 2025
    // Technical Regulations Art. 10.8.1b (H); they were Pirelli's tread widths, 305 / 405 mm)
    // (no footage of these cars compared: the 2026 lens and angle, the mount from photos of the airbox – estimates)
    // (v0.39: the cockpit 0.33 m further forward, ck – the helmet's middle 1.47–1.62 m behind the front axle in side photos
    // of the 2025 SF-25, MCL39 (Japanese GP 2025-04-05) and W16 (Italian GP 2025) lined up on their hubs; the model had it
    // 1.88 m back. The T-cam moved with it, with the 2026 lens and angle)
    ck: 0.33, tcam: [0, 1.07, -0.19], tcamPitch: 17.5, tcamHfov: 77.5, eye: [0, 0.725, 0.30], helmet: [0, 0.735, 0.25],
    src: "2022–2025 F1 technical regulations: 3.6 m wheelbase max, 2.0 m width, 0.95 m height; 18-inch wheels, ~720 mm tyres (FIA: ≤ 725 mm; 345–375 / 440–470 mm wide overall) – the rest from photos",
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
  // (the steering wheel: the team's (wheel3d.js TEAM_WHEELS) over what the car's shape says; part of the model's key)
  const wheel = teamWheel(y, teamName) ? { ...(shape?.wheel || {}), ...teamWheel(y, teamName) } : shape?.wheel || null;
  const key = shape ? `${era}:${shape.id}` : era + (wheel?.id ? `+${wheel.id}` : "");   // (a shape's id is the team's already)
  return { key, era, variant: shape?.id || null, shape, wheel, season: y, ...PROFILES[era], ...(team?.camera || {}), team: team?.id || null };
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
  // (v0.40: the caps were wound the wrong way – both faced into the loft, so the nose's tip, the sidepods' tails and the
  // crash structure's end showed a hole with the inside of the far wall through it; the winding is reversed below with the
  // sides', so each cap is written the other way round here)
  // (capEnds "rear": the first section only – an open front for an inlet's recess, inletRecess)
  if (capEnds) for (const [i, flip] of capEnds === "rear" ? [[0, false]] : [[0, false], [n - 1, true]]) {
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
// The chassis with its cockpit open (v0.42): loft's surface, except that over the cockpit each section's top – the arc
// between the opening's edges, |x| ≤ open.w(z) – folds down into the tub: over the rim's lip, down the inner side wall,
// across the floor, up the other wall – and back to the edge. Where the opening starts and ends (open.depth(z) rising
// from 0 to 1) the fold deepens: at the front the bulkhead under the steering wheel, at the back the seat's back. The
// surface stays one closed skin (no hole cut, no torn edge); the folded part comes back as its own geometry (`inner`:
// the tub's dark carbon and padding, its own normals – a crisp edge at the rim), the rest as `outer` (paint).
// v0.41 and before: the chassis loft was closed over the cockpit (its top at ~0.6 m, the steering wheel's middle at
// 0.61 m) – a padded rim drawn on the paint, the dark tub under it: the wheel's lower half and the hands sank into the
// paint when it turned. open: { zR, zF (the opening's rear and front, car z), w(z) (half width of the opening at its
// edge), depth(z) (0…1), floor(z) (the tub's floor height) }.
const OPEN_TOP = 22, OPEN_DZ = 0.015;
function openLoft(sections, ring, open, uRange = [-2.9, 2.9]) {
  // (sections over the cockpit closer together: the bulkhead and seat back are formed between them)
  const S = [];
  for (let i = 0; i < sections.length; i++) {
    const a = sections[i], b = sections[i + 1]; S.push(a);
    if (!b) break;
    // (only where the fold deepens – the bulkhead's and the seat back's stretches; over the open middle it's the same
    // fold section to section)
    const n = Math.ceil((b[0] - a[0]) / OPEN_DZ);
    for (let k = 1; k < n; k++) { const t = k / n, z = a[0] + (b[0] - a[0]) * t; if (open.ramps.some(([z0, z1]) => z > z0 - 0.01 && z < z1 + 0.01)) S.push(a.map((v, j) => (v === undefined ? b[j] : b[j] === undefined ? v : v + (b[j] - v) * t))); }
  }
  // a section's point at ring angle a (as loft: from the bottom, a = −π/2, round the left (+x) to the top and the right)
  const at = (s, a) => { const [, cy, hw, hh, cx = 0, pw = 2.6, tp = 0] = s, c = Math.cos(a), sn = Math.sin(a); return [cx + hw * (1 + (tp || 0) * sn) * Math.sign(c) * Math.pow(Math.abs(c), 2 / pw), cy + hh * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / pw)]; };
  // the top arc's half angle β: where the section's top reaches the opening's edge (|x| = w); outside the cockpit the
  // edge's angle at the nearest end – only where the ring's points fall, the surface is the same
  const wOf = (z) => open.w(Math.max(open.zR, Math.min(open.zF, z)));
  const beta = (s) => { const w = Math.min(wOf(s[0]), s[2] * 0.97); let lo = 0, hi = Math.PI / 2; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (at(s, Math.PI / 2 - m)[0] > w) hi = m; else lo = m; } return lo; };
  const N = OPEN_TOP, M = ring - N, rows = S.length, pos = [], uv = [], isIn = [], edge = [];
  for (const s of S) {
    const z = s[0], b = beta(s), d = z > open.zR && z < open.zF ? open.depth(z) : 0;
    // the outer part: from the top arc's right end round the bottom to its left end (M + 1 points), then the top arc
    // (N − 1 points between its ends)
    const pts = [];
    // (v0.43: spaced closer near the opening's edges – the wall's top beside the edge is the section's shoulder, where a
    // boxy section turns down; evenly spaced angles left two points on it and cut the shoulder off as a chamfer)
    for (let k = 0; k <= M; k++) { const t = k / M, f = t - (0.75 * Math.sin(2 * Math.PI * t)) / (2 * Math.PI); pts.push(at(s, Math.PI / 2 + b + (2 * Math.PI - 2 * b) * f)); }
    const L = at(s, Math.PI / 2 - b), R = at(s, Math.PI / 2 + b), fl = open.floor(z);
    if (z >= open.zR - 1e-9 && z <= open.zF + 1e-9) edge.push([L[0], L[1], z]);
    // the fold: lip, wall, the floor's corners and middle – then each top-arc point slid towards its place on it
    const fold = [L, [L[0] - 0.006, L[1] - 0.014], [L[0] - 0.014, L[1] - 0.045], [L[0] - 0.026, fl + 0.07], [L[0] - 0.055, fl + 0.012], [0, fl], [R[0] + 0.055, fl + 0.012], [R[0] + 0.026, fl + 0.07], [R[0] + 0.014, R[1] - 0.045], [R[0] + 0.006, R[1] - 0.014], R];
    const segN = [1, 2, 4, 2, 2, 2, 2, 4, 2, 1], along = [];   // (points per stretch: more on the walls and round the lip)
    fold.slice(0, -1).forEach((A, i) => { const B = fold[i + 1]; for (let k = 0; k < segN[i]; k++) along.push([A[0] + ((B[0] - A[0]) * k) / segN[i], A[1] + ((B[1] - A[1]) * k) / segN[i]]); });
    for (let k = 1; k < N; k++) {
      const P0 = at(s, Math.PI / 2 - b + (2 * b * k) / N), PT = along[k];   // (along has N points: k = 0 is the edge)
      pts.push([P0[0] + (PT[0] - P0[0]) * d, P0[1] + (PT[1] - P0[1]) * d]);
    }
    pts.forEach(([x, y], k) => { pos.push(x, y, z); uv.push((z - uRange[0]) / (uRange[1] - uRange[0]), 1 - k / ring); isIn.push(d > 0 && k > M ? 1 : 0); });
  }
  // rings of `ring` points (closed: the last top-arc point joins the first outer one)
  const outer = [], inner = [];
  for (let i = 0; i < rows - 1; i++) for (let k = 0; k < ring; k++) {
    const a = i * ring + k, b = a + ring, a1 = i * ring + ((k + 1) % ring), b1 = a1 + ring;
    const tri = isIn[a] || isIn[b] || isIn[a1] || isIn[b1] ? inner : outer;
    tri.push(a, a1, b, a1, b1, b);   // (rear → front, round bottom → left → top: this winding faces out, as loft's)
  }
  // the ends closed (the crash structure's rear, the nose's tip) – (v0.43: wound as the sides, which are written facing
  // out here – v0.42 took loft's caps, written before loft reverses its whole winding, so both ends faced in: the
  // nose's tip and the crash structure's end were holes from outside; found by the cockpit check's edge directions)
  for (const [i, flip] of [[0, true], [rows - 1, false]]) {
    const base = pos.length / 3, s = S[i]; pos.push(s[4] || 0, s[1], s[0]); uv.push(uv[i * ring * 2], uv[i * ring * 2 + 1]); isIn.push(0);
    for (let k = 0; k < ring; k++) { const a = i * ring + k, a1 = i * ring + ((k + 1) % ring); outer.push(...(flip ? [base, a1, a] : [base, a, a1])); }
  }
  // each part with its own copy of the points it uses: smooth normals within it, a crease where the two meet
  const build = (idx) => {
    const map = new Map(), P = [], U = [], I = idx.map((v) => { if (!map.has(v)) { map.set(v, P.length / 3); P.push(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]); U.push(uv[2 * v], uv[2 * v + 1]); } return map.get(v); });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
    return g;
  };
  return { outer: build(outer), inner: build(inner), sections: S, edge, room: roomTable(S, open) };
}
// The cockpit's room as a table (v0.42) – for the driver's arms (arms.js roomPenetration) and the tests: every centimetre
// along the car over the opening, the opening's edge (x, y), how deep the tub is there, and the chassis' top surface's
// height every centimetre across (−9 where the chassis isn't): read off the very sections openLoft folds.
export function roomTable(S, open) {
  const z0 = open.zR - 0.04, z1 = open.zF + 0.2, dz = 0.01, nz = Math.round((z1 - z0) / dz) + 1, dx = 0.01, nx = 76;
  const secAt = (z) => { let i = 0; while (i < S.length - 2 && S[i + 1][0] < z) i++; const a = S[i], b = S[i + 1], t = Math.max(0, Math.min(1, (z - a[0]) / (b[0] - a[0]))); return a.map((v, j) => (v === undefined ? b[j] : b[j] === undefined ? v : v + (b[j] - v) * t)); };
  const at = (s, a) => { const [, cy, hw, hh, cx = 0, pw = 2.6, tp = 0] = s, c = Math.cos(a), sn = Math.sin(a); return [cx + hw * (1 + (tp || 0) * sn) * Math.sign(c) * Math.pow(Math.abs(c), 2 / pw), cy + hh * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / pw)]; };
  const topAt = (s, x) => { if (x > at(s, 0)[0] && x > at(s, 0.3)[0]) return -9; let lo = 0, hi = Math.PI / 2; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (at(s, m)[0] > x) lo = m; else hi = m; } return at(s, (lo + hi) / 2)[1]; };
  const edgeX = [], edgeY = [], bottom = [], top = new Float32Array(nz * nx);
  for (let i = 0; i < nz; i++) {
    const z = z0 + i * dz, sc = secAt(z), inside = z > open.zR && z < open.zF, w = open.w(Math.max(open.zR, Math.min(open.zF, z))), d = inside ? open.depth(z) : 0;
    const yE = topAt(sc, w); edgeX.push(inside ? w : 0); edgeY.push(yE); bottom.push(yE - d * (yE - open.floor(z)));
    for (let j = 0; j < nx; j++) top[i * nx + j] = topAt(sc, j * dx);
  }
  return { z0, dz, nz, dx, nx, edgeX, edgeY, bottom, top, zR: open.zR, zF: open.zF, rim: 0.03 };
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
function softBox(w, h, l, x, y, z, r = 0.25, seg = 8) {
  const g = new THREE.BoxGeometry(w, h, l, seg, seg, seg), p = g.attributes.position, v = new THREE.Vector3(), hx = w / 2, hy = h / 2, hz = l / 2, rr = Math.min(hx, hy, hz) * r * 4;
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
function sweep(points, a, b, segs = 64, ring = 16, caps = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(...q)), false, "centripetal");
  const pos = [], idx = [], uv = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), Bn = new THREE.Vector3(), P = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; curve.getPointAt(t, P); curve.getTangentAt(t, T);
    // (a, b: the section's half sizes – or a function of the point giving both: a tube that thins along its length)
    const [sa, sb] = typeof a === "function" ? a(P) : [a, b];
    // the section's "up" kept as near world up as the curve allows (no twisting as Frenet frames would)
    N.crossVectors(T, UPV); if (N.lengthSq() < 1e-6) N.set(1, 0, 0); N.normalize(); Bn.crossVectors(N, T).normalize();
    for (let k = 0; k <= ring; k++) {
      const th = (k / ring) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      pos.push(P.x + N.x * sa * c + Bn.x * sb * s, P.y + N.y * sa * c + Bn.y * sb * s, P.z + N.z * sa * c + Bn.z * sb * s);
      uv.push(t, k / ring);
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < ring; k++) { const p = i * (ring + 1) + k, q = p + ring + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
  // (caps: each end closed by a fan round its middle – a closed tube; the winding fixed below turns them with the rest)
  if (caps) for (const [i, f] of [[0, 1], [segs, -1]]) {
    curve.getPointAt(i / segs, P); const c = pos.length / 3; pos.push(P.x, P.y, P.z); uv.push(i / segs, 0.5);
    for (let k = 0; k < ring; k++) { const p = i * (ring + 1) + k; if (f > 0) idx.push(c, p, p + 1); else idx.push(c, p + 1, p); }
  }
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
// A bent plate (v0.40): a thin wall whose section across the car follows `path` ([x, y] points, bottom first) and which
// runs along the car from front(y) to rear(y) (z of its leading and trailing edges at that height), `t` thick – the 2026
// rear wing's endplate, one piece from its inboard lower part up the diagonal to its outboard upper part. Closed (both
// faces, the edges, the top and the bottom), so it needs no double-sided material.
function bentPlate(path, front, rear, t = 0.012, sub = 3) {
  const P = [];
  for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < (i === path.length - 2 ? sub + 1 : sub); k++) { const u = k / sub, [x0, y0] = path[i], [x1, y1] = path[i + 1]; P.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]); }
  const n = P.length, pos = [], quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  // each station: the normal to the path in the section's plane, the two faces ±t/2 along it, its leading and trailing z
  const V = P.map(([x, y], i) => {
    const [xa, ya] = P[Math.max(0, i - 1)], [xb, yb] = P[Math.min(n - 1, i + 1)], dx = xb - xa, dy = yb - ya, L = Math.hypot(dx, dy) || 1, nx = dy / L, ny = -dx / L;
    const o = [x + (nx * t) / 2, y + (ny * t) / 2], q = [x - (nx * t) / 2, y - (ny * t) / 2], zf = front(y), zr = rear(y);
    return { of: [o[0], o[1], zf], or: [o[0], o[1], zr], if: [q[0], q[1], zf], ir: [q[0], q[1], zr] };
  });
  for (let i = 0; i < n - 1; i++) {
    const a = V[i], b = V[i + 1];
    quad(a.of, a.or, b.or, b.of); quad(a.if, b.if, b.ir, a.ir);   // the two faces
    quad(a.of, b.of, b.if, a.if); quad(a.or, a.ir, b.ir, b.or);   // the leading and trailing edges
  }
  quad(V[0].of, V[0].if, V[0].ir, V[0].or); quad(V[n - 1].of, V[n - 1].or, V[n - 1].ir, V[n - 1].if);   // bottom and top
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  // (the faces' winding depends on the path's direction: turned outwards by the first face's normal against the path's
  // outer side)
  g.computeVertexNormals();
  const n0 = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, 0), c = V[0], mid = [(c.of[0] + c.if[0]) / 2, (c.of[1] + c.if[1]) / 2];
  if (n0.x * (c.of[0] - mid[0]) + n0.y * (c.of[1] - mid[1]) < 0) { const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) [a[i + 3 + k], a[i + 6 + k]] = [a[i + 6 + k], a[i + 3 + k]]; g.computeVertexNormals(); }
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
  // radii as a share of the decal's outer radius (≈ the tyre's R − 12 mm: R 0.86–0.90 → ~0.89–0.93 here); angles
  // clockwise from 12 o'clock seen from outside the wheel (wheels_tyres.md §4, measured off race photos, ±10°)
  inner: 0.7,
  // 2022–25: "PIRELLI" at 0°, a continuous arc +32…+140°, "P ZERO" at 180°, an arc 220…328°; lettering r 0.74–0.88 R
  2022: { arcs: [[32, 140, 0.885, 0.93], [220, 328, 0.885, 0.93]], words: [[-28, 28, 0.765, 0.905, 7], [145, 215, 0.765, 0.905, 6]], dashes: [], chequers: [] },
  // 2026 (Pirelli's new graphics, 9 Dec 2025): "P ZERO" −20…+55°, a train of dashes +60…+140° then a two-row chequered
  // block +140…+165°, "PIRELLI" +185…+222°, dashes +225…+280°, chequers +280…+318°
  2026: { arcs: [], words: [[-20, 55, 0.765, 0.87, 6], [185, 222, 0.765, 0.89, 7]], dashes: [[60, 140, 0.9], [225, 280, 0.9]], chequers: [[140, 165, 0.84, 0.94], [280, 318, 0.84, 0.94]] },
};
// wheel nuts' colours a race photo shows (wheels_tyres.md §3): Williams 2025 green with an orange-red collar (Zandvoort
// 2025-08-30), Ferrari 2026 yellow (Barcelona 2026, F1.com Tech Weekly) – others not checked: anodised grey
export const NUTS = { fw47: { c: [0.18, 0.62, 0.3], ring: [0.85, 0.3, 0.15] }, sf26: { c: [0.95, 0.8, 0.1] }, default: { c: [0.5, 0.52, 0.55] } };
function sidewallCanvas(era = "2022", avg = false) {
  const L = SIDEWALL[era] || SIDEWALL[2022];
  const N = 512, c = canvas(N, N), g = c.getContext("2d"), R = N / 2, cx = R, cy = R, rad = (d) => ((d - 90) * Math.PI) / 180;
  g.clearRect(0, 0, N, N); g.fillStyle = "#fff";
  const sector = (a0, a1, r0, r1) => { g.beginPath(); g.arc(cx, cy, R * r1, rad(a0), rad(a1)); g.arc(cx, cy, R * r0, rad(a1), rad(a0), true); g.closePath(); g.fill(); };
  for (const [a0, a1, r0, r1] of L.arcs) sector(a0, a1, r0, r1);
  // the dashes: short ones growing longer, then a thin solid line (2026)
  for (const [a0, a1, r] of L.dashes) {
    let a = a0, k = 0; const solidFrom = a0 + (a1 - a0) * 0.7;
    while (a < solidFrom) { const len = 2 + k * 0.9, gap = 2.2; sector(a, Math.min(solidFrom, a + len), r - 0.012, r + 0.012); a += len + gap; k++; }
    sector(solidFrom, a1, r - 0.007, r + 0.007);
  }
  // the chequered blocks: two rows of alternating squares
  for (const [a0, a1, r0, r1] of L.chequers) {
    const n = 6, step = (a1 - a0) / n, rm = (r0 + r1) / 2;
    for (let i = 0; i < n; i++) sector(a0 + i * step, a0 + (i + 1) * step, i % 2 ? r0 : rm, i % 2 ? rm : r1);
  }
  // the lettering: upright strokes and bars of letter size along the arc (abstract – no word is spelled)
  for (const [a0, a1, r0, r1, n] of L.words) {
    const step = (a1 - a0) / n, rm = (r0 + r1) / 2, h = R * (r1 - r0);
    for (let i = 0; i < n; i++) {
      const a = a0 + step * (i + 0.5), kind = (i * 7 + n) % 3;
      g.save(); g.translate(cx + Math.cos(rad(a)) * R * rm, cy + Math.sin(rad(a)) * R * rm); g.rotate(rad(a) + Math.PI / 2);
      const wd = (step / 360) * Math.PI * 2 * R * rm * 0.74, sw = Math.max(2, wd * 0.26);
      g.fillRect(-wd / 2, -h / 2, sw, h);                         // a stem
      if (kind !== 1) g.fillRect(-wd / 2, -h / 2, wd, h * 0.22);   // a top bar
      if (kind === 2) g.fillRect(-wd / 2, -h * 0.08, wd * 0.8, h * 0.18);
      if (kind !== 0) g.fillRect(wd / 2 - sw, -h / 2, sw, h);      // a second stem
      if (kind === 0) g.fillRect(-wd / 2, h / 2 - h * 0.22, wd, h * 0.22);   // a foot
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
function sidewallMaps(era = "2022") {
  const mk = (avg) => () => { const t = new THREE.CanvasTexture(sidewallCanvas(era, avg)); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: sharedTex("sidewall" + era, mk(false)), avg: sharedTex("sidewallAvg" + era, mk(true)) };
}
// The sidewall's material: the markings smeared round the wheel by the angle it turns in a frame (uniform smear, rad –
// car3d setSmear): sampled along the arc, and the averaged ring once it has turned well over a word in a frame.
export function sidewallMaterial(color = 0xf2c230, era = "2022") {
  const M = sidewallMaps(era === "2026" ? "2026" : "2022");
  const m = new THREE.MeshBasicMaterial({ color, map: M.map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  if (!M.map) return m;
  const smear = { value: 0 }, avg = { value: M.avg };
  m.userData.smear = smear;
  m.customProgramCacheKey = () => "sidewall";   // (one program for both eras: the maps are uniforms)
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSmear = smear; sh.uniforms.avgMap = avg;
    sh.fragmentShader = "uniform float uSmear;\nuniform sampler2D avgMap;\n" + sh.fragmentShader.replace("#include <map_fragment>", `
#ifdef USE_MAP
  vec2 c0 = vMapUv - 0.5; float sm = clamp(uSmear - 0.12, 0.0, 6.2832); vec4 acc = vec4(0.0);   // (a slow wheel crisp: under ~0.12 rad no smear)
  for (int k = 0; k < 9; k++) { float a = sm * (float(k) / 8.0 - 0.5); float cs = cos(a), sn = sin(a); acc += texture2D(map, vec2(cs * c0.x - sn * c0.y, sn * c0.x + cs * c0.y) + 0.5); }
  acc /= 9.0;
  vec4 sampledDiffuseColor = mix(acc, texture2D(avgMap, vMapUv), smoothstep(0.6, 1.6, uSmear));   // (~100 km/h on: one ring, as on TV – no wagon wheel)
  diffuseColor *= sampledDiffuseColor;
#endif`);
  };
  return m;
}
// The steering wheel's display when no driver's own data is on it (wheelscreen.js paints those): its neutral face – no
// gear, no made-up lap or delta – in the same layout, at a lower resolution (the cars further away)
function wheelScreen() {
  return sharedTex("screen", () => {
    const c = canvas(256, 144); paintScreen(c.getContext("2d"), screenModel({ car: null }), 256, 144);
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
const TEMPLATES = new Map(), ROOMS = new Map();
// a profile's cockpit room (roomTable) without building the whole car template when it isn't made yet
function roomOf(p) { if (!ROOMS.has(p.key)) ROOMS.set(p.key, (p.era === "2026" ? body2026(p) : body2022(p)).room); return ROOMS.get(p.key); }
function template(prof) {
  if (TEMPLATES.has(prof.key)) return TEMPLATES.get(prof.key);
  const T = prof.era === "2026" ? body2026(prof) : body2022(prof);
  ROOMS.set(prof.key, T.room);
  Object.assign(T, cockpit(prof), wheels(prof));
  // (v0.42: the padded rim along the opening's own edge – the chassis' fold – round its front; it was a hand-set line)
  if (T.openEdge) { T.rim.dispose(); T.rim = rimAlong(T.openEdge, prof.eye[2] - 0.05); }
  // (v0.43: the tub's walls and floor in the carbon's weave at its real scale – a plain near-black skin read as a hole)
  if (T.tubIn) { const g = T.tubIn.toNonIndexed(); T.tubIn.dispose(); T.tubIn = metricUV(g, 0.04); }
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
// The sidepod's inlet as an opening (v0.40): a loft's front section `s` left open (loft capEnds "rear"), the lip – a ring
// from the section's edge in to `k` of it – and a duct going `depth` back, narrowing a little, closed by a dark wall.
// It was a dark disc 4 mm in front of a closed pod: from any angle but head-on it read as paint. Returns { lip } (the
// body's paint) and { duct } (dark). The ring follows loft's points, so the lip meets the pod's skin exactly.
function inletRecess(s, k = 0.8, depth = 0.14, ring = 32) {
  const [z, cy, hw, hh, cx = 0, pw = 2.6, tp = 0] = s;
  const pt = (i, f, zz) => { const a = (i / ring) * Math.PI * 2 - Math.PI / 2, c = Math.cos(a), sn = Math.sin(a); return [cx + f * hw * (1 + tp * sn) * Math.sign(c) * Math.pow(Math.abs(c), 2 / pw), cy + f * hh * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / pw), zz]; };
  const lipP = [], ductP = [], quad = (out, a, b, c, d) => out.push(...a, ...b, ...c, ...a, ...c, ...d);
  const z1 = z - depth, k1 = k * 0.9, back = pt(0, 0, z1); back[1] = cy;
  for (let i = 0; i < ring; i++) {
    quad(lipP, pt(i, 1, z), pt(i + 1, 1, z), pt(i + 1, k, z), pt(i, k, z));
    quad(ductP, pt(i, k, z), pt(i + 1, k, z), pt(i + 1, k1, z1), pt(i, k1, z1));
    ductP.push(...[cx, cy, z1], ...pt(i + 1, k1, z1), ...pt(i, k1, z1));
  }
  const geo = (arr, wantZ) => {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals();
    // (faced forward: the lip and the duct's back wall towards +z, the duct's sides inwards – checked on the first face)
    const n0 = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, 0);
    if (n0.z * wantZ < 0) { const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 9) for (let q = 0; q < 3; q++) [a[i + 3 + q], a[i + 6 + q]] = [a[i + 6 + q], a[i + 3 + q]]; g.computeVertexNormals(); }
    return g;
  };
  // (the duct's first face is a side wall slanting in towards the back: seen from the front it faces +z a little)
  return { lip: geo(lipP, 1), duct: geo(ductP, 1) };
}
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
// v0.40: the sidepods joined to the body behind the cockpit. They were tubes standing off the chassis, and from above
// (the T-cam, the helicopter) a dark valley ran between them and the engine cover down to the floor; race photos from
// above (2025 RB21 / MCL39 / SF-25, Las Vegas 2025-11-22; 2026 RB22, China 2026-03-13 – docs/research/cars_photos.md)
// show the pod's top running into the engine cover's flank with no gap behind the cockpit (beside it the inlet stands
// off the chassis). Each section (loft format, one side's) keeps its outer face; its inner edge goes into the body
// (x `inner`) between z0 (none) and z1 (all), the undercut's taper scaled to the same depth in metres. And every section
// boxier (the superellipse's power at least `pw`): a flat top, a tight outer shoulder and a near-vertical flank over the
// undercut, as the photos show – not the round tube the lower power drew.
function blendPods(P, z0, z1, inner = 0.12, pw = 5) {
  return P.map(([z, cy, hw, hh, cx = 0, p = 2.6, tp = 0]) => {
    const t = sstep(z0, z1, z), outer = cx + hw, inn = (cx - hw) * (1 - t) + Math.min(inner, cx - hw) * t, hw2 = (outer - inn) / 2;
    return [z, cy, hw2, hh, (outer + inn) / 2, Math.max(p, pw), (tp * hw) / hw2];
  });
}
// the parts a shape adds: a cooling cannon or louvres, a serrated fin, the blades atop the front wing's endplates
function shapeParts(s, p, fwSpan, fwZ, epTop, zb = (z) => z) {
  const out = [];
  if (!s) return out;
  if (s.cooling === "cannon") out.push(softBox(0.1, 0.09, 0.3, 0, 0.44, -2.0, 0.6));
  if (s.cooling === "louvres") for (const k of [1, -1]) for (let i = 0; i < 5; i++) out.push(boxAt(0.1, 0.006, 0.022, 0.25 * k, 0.6 - i * 0.03, zb(-0.95 - i * 0.07), 0, 0, -0.35 * k));
  if (s.cooling === "split") for (const k of [1, -1]) out.push(softBox(0.06, 0.05, 0.18, 0.11 * k, 0.55, -1.55, 0.5));
  // (v0.40: on the 2026 engine cover, high to the rear axle, the serrations stand on its top – they were buried in it)
  if (s.fin === "serrated") for (let i = 0; i < 6; i++) out.push(boxAt(0.008, 0.035, 0.045, 0, (p.era === "2026" ? 1.0 - i * 0.012 : 0.93 - i * 0.03), zb(-1.0 - i * 0.085), 0, 0.6));
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
  const wall = (x, shrink) => plate([[dz0, y0], [dz1, y0], ...dpts.slice().reverse().map(([z, y]) => [z, y + 0.02 - shrink * (y - y0)])], x, 0.012);
  for (const k of [1, -1]) out.push(wall(dw * k, 0), wall(dw * 0.62 * k, 0.35), wall(dw * 0.3 * k, 0.55));
  return out;
}
// ---------- the corners: what sits inside each wheel (v0.43) ----------
// The parts inside the rim that do NOT come off with the wheel (research/corners.md): the brake drum (the carbon brake-duct
// fairing round the disc, fixed to the upright), its intake facing forward on the drum's inboard face, the upright
// inside it, the caliper on the disc's edge, the disc and the hub. Drawn in the wheel's own frame (origin the wheel's
// centre, axle along x, +x out of the LEFT wheel; the right wheel's is the mirror image – cornerGeo's caller mirrors it),
// in vertex colours over the carbon weave.
// Motion (makeCar): the fronts' corner mesh rides in the wheel's steer group (it steers, it doesn't roll); the rears'
// is merged into the body's carbon (a rear wheel never steers in this model and the body doesn't move on its springs).
// The disc and the hub turn with the axle on the car, but they are drawn as plain solids of revolution – their turning
// would not show – so they go with the drum: one mesh less per corner, and they stay on the car at a stop as the real
// ones do. Proportions: CORNER (estimates from photos and the rules' limits – see each number's note).
export const CORNER = {
  // the rim's inner barrel (18-inch: 457 mm bead seat, Ø ~464 mm inside the barrel's wall – estimate) and the drum
  // inside it – ~2 cm clear of the barrel (photos of 2022–25 front corners with the wheel off: the drum fills the rim)
  barrelR: 0.232, drumR: 0.21, drumWall: 0.006,
  // how far the drum reaches out of the wheel past the tyre's inner sidewall, and in towards the wheel's middle (its
  // open outboard side faces the rim's centre: with the wheel off the disc shows in it)
  drumOut: 0.025, drumIn: 0.05,
  // brake discs (research/corners.md): FIA 2022–25 Technical Regulations Art. 11.3.2–3 – front Ø 325–330 mm, rear Ø 275–280
  // mm, ≤ 32 mm thick; 2026 Section C (Issue 17, 2026-04-28) C11.3 – front Ø 325–345, rear 260–280, ≤ 34 mm. Drawn at the
  // upper limits (teams run the largest a track's cooling allows – an estimate); the hub's bell and stub
  disc: { 2022: { front: 0.165, rear: 0.14, t: 0.032 }, 2026: { front: 0.1725, rear: 0.14, t: 0.034 } }, hubR: 0.062,
  // the wishbones' outer ends (ball joints): inside the drum, 6 cm in from the wheel's middle plane – near the steer axis
  // (the wheel group's pivot), so a fixed wishbone's end stays hidden in the drum through ±0.4 rad of steer (measured in
  // test/corners43.test.js); real kingpins sit inside the rim near the middle plane (low scrub – an estimate, M)
  ballX: 0.06,
};
const CC = { carbon: [1, 1, 1], mouth: [0.03, 0.03, 0.035], disc: [0.11, 0.11, 0.115], metal: [0.32, 0.33, 0.35], caliper: [0.16, 0.16, 0.17] };
const tinted = (g, c) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g; };
// a solid of revolution about the x axis from (radius, x) points – a closed loop, counter-clockwise in (r, x): the
// faces point out of the solid
function latheX(pts, seg = 32) { const g = new THREE.LatheGeometry(pts.map(([r, x]) => new THREE.Vector2(r, x)), seg); g.rotateZ(-Math.PI / 2); return g; }
// A closed annular sector about the x axis: radii r0–r1, angles a0–a1 (y = r·sin a, z = r·cos a: 0 at the front, π/2 on
// top), from x0 to x1 – the 2022–25 front fence and arch; its faces point out (checked by the first face's normal)
function sector(r0, r1, a0, a1, x0, x1, n = 18) {
  const pos = [], P = (rr, a, x) => [x, rr * Math.sin(a), rr * Math.cos(a)], quad = (A, B, C, D) => pos.push(...A, ...B, ...C, ...A, ...C, ...D);
  for (let i = 0; i < n; i++) {
    const s0 = a0 + ((a1 - a0) * i) / n, s1 = a0 + ((a1 - a0) * (i + 1)) / n;
    quad(P(r1, s0, x0), P(r1, s1, x0), P(r1, s1, x1), P(r1, s0, x1));   // outer face
    quad(P(r0, s0, x0), P(r0, s0, x1), P(r0, s1, x1), P(r0, s1, x0));   // inner face
    quad(P(r0, s0, x0), P(r0, s1, x0), P(r1, s1, x0), P(r1, s0, x0));   // the x0 side
    quad(P(r0, s0, x1), P(r1, s0, x1), P(r1, s1, x1), P(r0, s1, x1));   // the x1 side
  }
  quad(P(r0, a0, x0), P(r1, a0, x0), P(r1, a0, x1), P(r0, a0, x1)); quad(P(r0, a1, x0), P(r0, a1, x1), P(r1, a1, x1), P(r1, a1, x0));
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const nn = g.attributes.normal; if (nn.getY(0) * Math.sin(a0) + nn.getZ(0) * Math.cos(a0) < 0) { const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) [a[i + 3 + k], a[i + 6 + k]] = [a[i + 6 + k], a[i + 3 + k]]; g.computeVertexNormals(); }
  return g;
}
// One corner's fixed parts (the left wheel's, its frame as above): r the tyre's radius, w its width
function cornerGeo(p, front) {
  const w = front ? p.FW : p.RW, r = front ? p.FR : p.RR, hw = w / 2, K = CORNER, R = K.drumR, ri = R - K.drumWall;
  const xi = -hw - K.drumOut, xo = K.drumIn, e = 0.022, t = 0.012, parts = [];
  // the drum: a shell – its outer skin, the rounded edge into its inboard wall, the wall's inner face, the skin's inside
  // and the outboard rim (open towards the wheel's centre)
  const loop = [[ri, xo], [R, xo], [R, xi + e], [R - e * 0.3, xi + e * 0.3], [R - e, xi], [K.hubR + 0.01, xi], [K.hubR + 0.01, xi + t], [ri, xi + t], [ri, xo]];
  // (written clockwise from the open rim; reversed: counter-clockwise, the faces out of the shell's material)
  parts.push(tinted(latheX(loop.slice().reverse(), 36), CC.carbon));
  // the wall's middle closed round the upright's stub (the hub's axle runs through the upright inside)
  const plug = new THREE.CircleGeometry(K.hubR + 0.012, 16); plug.rotateY(-Math.PI / 2); plug.translate(xi - 0.001, 0, 0); parts.push(tinted(plug, CC.carbon));
  // the disc near the drum's open side, and the hub's bell from it out to the wheel nut (the nut is the wheel's)
  const D = K.disc[p.era] || K.disc[2022], dR = front ? D.front : D.rear, dx = xo - 0.035;
  parts.push(tinted(latheX([[K.hubR, dx - D.t / 2], [dR, dx - D.t / 2], [dR, dx + D.t / 2], [K.hubR, dx + D.t / 2]], 36), CC.disc));
  parts.push(tinted(latheX([[0.001, xi + t], [K.hubR, xi + t], [K.hubR, hw - 0.06], [0.001, hw - 0.06]], 18), CC.metal));
  // the caliper on the disc's rim, behind the axle and a little low (front calipers sit at the back of the disc on most
  // cars – photos, M), and the upright: a block inside the drum from the lower ball joint to the upper one
  parts.push(tinted(boxAt(0.075, 0.12, 0.04, dx, -0.045, -(dR - 0.02)), CC.caliper));
  parts.push(tinted(boxAt(0.07, 0.3, 0.08, -K.ballX - 0.005, -0.015, 0), CC.carbon));
  // the intake on the drum's inboard face, its mouth facing forward (a duct's four walls; the inside dark): low and
  // ahead of the axle at the front, higher at the rear (photos of 2022–26 corners – M)
  const [y0, y1] = front ? [-0.1, 0.025] : [-0.02, 0.11], z0 = 0.045, z1 = R - 0.012, xa = xi - 0.055, xb = xi + 0.004, wt = 0.007;
  const zc = (z0 + z1) / 2, zl = z1 - z0;
  parts.push(tinted(boxAt(xb - xa, wt, zl, (xa + xb) / 2, y1 - wt / 2, zc), CC.carbon), tinted(boxAt(xb - xa, wt, zl, (xa + xb) / 2, y0 + wt / 2, zc), CC.carbon));
  parts.push(tinted(boxAt(wt, y1 - y0, zl, xa + wt / 2, (y0 + y1) / 2, zc), CC.carbon));
  // (its back: a dark wall 4 cm into the mouth – what the eye takes for the opening)
  parts.push(tinted(boxAt(xb - xa - wt, y1 - y0 - 2 * wt, 0.01, (xa + wt + xb) / 2, (y0 + y1) / 2, z1 - 0.045), CC.mouth));
  if (front && p.era === "2022") {
    // 2022–25: the front wheel bodywork's fence and arch (FIA 2022–25 Art. 3.13.5, a shape the rules fix; rigidly on the
    // upright, 3.13.1 – research/corners.md): a flat carbon fence just inboard of the tyre over its upper front quarter,
    // curling over the top into an arch a few cm over the tread's inner part. It steers with the drum; it doesn't spin.
    // 2026 has no arch (C3.14 – press and rule text agree). Both closed thin shells (no double-sided material needed)
    // (v0.43 first try: the arch over 0.6 of the tread – as the v0.39 deflector spanned 0.75 – read as a mudguard in the
    // app; photos show a strip over the tyre's inner shoulder only, ~7 cm in – an estimate, M. The fence a narrow tall
    // strip a little ahead of the top, from the drum's height up past the tread: Haas VF-22 front corner, wheel off,
    // motorsport.com 2022 (refs/corners/vf22_brake_drum.jpg); RB18 drawing, Piola 2022 – M)
    const a0 = 1.3, a1 = 1.68, xf = -hw - 0.014;
    parts.push(tinted(sector(R - 0.01, r + 0.036, a0, a1, xf - 0.01, xf), CC.carbon));             // the fence
    parts.push(tinted(sector(r + 0.03, r + 0.036, a0 + 0.04, a1 + 0.08, xf - 0.01, -hw + 0.07), CC.carbon));  // the arch over the shoulder
  }
  if (front && p.era === "2026") {
    // 2026: no arch over the tyre (C3.14 – nothing of the wheel bodywork may reach over it); the Front Drum Rear Deflector
    // instead (FIA 2026 Section C Issue 17, 2026-04-28, C3.14.7: its leading edge must hide the box FWH-TOP – XW 150–335 mm
    // behind the axle, ZW −160…−110 mm under it – seen from inboard; ≤ 15 mm thick there – research/corners.md): a board
    // just inboard of the tyre from the drum's lower back down and back past the tyre's rear edge. Its outline here is
    // an estimate (L) – the rules' reference surface itself was not read
    const xb = -hw - 0.022, P2 = [[-0.1, -0.06], [-0.2, -0.085], [-0.345, -0.1], [-0.345, -0.17], [-0.12, -0.175]];
    const sh = new THREE.Shape(); P2.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
    const b = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }); b.rotateY(-Math.PI / 2); b.translate(xb + 0.006, 0, 0);
    parts.push(tinted(b, CC.carbon));
  }
  for (const g of parts) if (g.attributes.uv) g.deleteAttribute("uv");
  return mergeColoured(parts);
}
// The mirror image across x = 0 of a non-indexed geometry, every attribute kept (normals mirrored, not recomputed:
// smooth parts stay smooth) and each triangle's winding turned back so its faces still point out
function mirrorAll(g) {
  const m = g.clone(); m.attributes.position.array.forEach((_, i, a) => { if (i % 3 === 0) a[i] = -a[i]; });
  if (m.attributes.normal) m.attributes.normal.array.forEach((_, i, a) => { if (i % 3 === 0) a[i] = -a[i]; });
  for (const at of Object.values(m.attributes)) { const a = at.array, s = at.itemSize; for (let i = 0; i < a.length; i += 3 * s) for (let k = 0; k < s; k++) [a[i + s + k], a[i + 2 * s + k]] = [a[i + 2 * s + k], a[i + s + k]]; }
  m.computeBoundingSphere(); return m;
}
// merge() keeps position / normal / uv: a colour attribute merged the same way (the corner meshes' vertex colours)
function mergeColoured(list) { const out = merge(list); const total = list.reduce((a, g) => a + g.attributes.color.count, 0), arr = new Float32Array(total * 3); let o = 0; for (const g of list) { arr.set(g.attributes.color.array, o); o += g.attributes.color.count * 3; } out.setAttribute("color", new THREE.BufferAttribute(arr, 3)); return out; }
// The rear corners in the car's frame, for the body's carbon (they neither steer nor roll in this model)
function corners(p) {
  const L = cornerGeo(p, false), out = [];
  const RX = p.W / 2 - p.RW / 2;
  const l = L.clone(); l.translate(RX, p.RR, p.RZ); out.push(l);
  const rr = mirrorAll(L); rr.translate(-RX, p.RR, p.RZ); out.push(rr);
  L.dispose();
  return out;
}
// Wishbones and push/pull rods (faired blades), each corner from the chassis to the upright – front and rear each
// push or pull as the team's car has them (carshapes.js; the era's default without one). The track rod beside the
// front upper wishbone; at the rear, the toe link.
function suspension(p, pullFront, pullRear = false) {
  const out = [];
  for (const [z, r, wc, front] of [[p.FZ, p.FR, p.W / 2 - p.FW / 2, true], [p.RZ, p.RR, p.W / 2 - p.RW / 2, false]]) for (const k of [1, -1]) {
    // (v0.43: the outer ends at the ball joints inside the drum, CORNER.ballX in from the wheel's middle – they ended at
    // the tyre's inner face, where a steered drum would leave them behind)
    const ox = (wc - CORNER.ballX) * k, cx = (front ? 0.2 : 0.24) * k, top = r + 0.12, bot = r - 0.16;
    out.push(strut([cx, front ? 0.47 : 0.42, z + 0.26], [ox, top, z]), strut([cx, front ? 0.47 : 0.42, z - 0.22], [ox, top, z]));
    out.push(strut([cx * 0.95, 0.2, z + 0.3], [ox, bot, z]), strut([cx * 0.95, 0.2, z - 0.24], [ox, bot, z]));
    // (pull rod: from high on the upright down to the chassis; push rod: low on the upright up to the chassis)
    const pull = front ? pullFront : pullRear;
    out.push(pull ? strut([ox * 0.97, top - 0.02, z + (front ? -0.03 : 0.03)], [cx * 0.9, 0.17, z + (front ? -0.3 : 0.3)], 0.03, 0.014) : strut([ox * 0.97, bot + 0.02, z + 0.02], [cx * 1.05, front ? 0.52 : 0.46, z + (front ? -0.12 : 0.12)], 0.03, 0.014));
    out.push(front ? strut([cx, 0.4, z + 0.1], [ox, 0.42, z + 0.09], 0.032, 0.012) : strut([cx, 0.32, z - 0.12], [ox, 0.3, z - 0.1], 0.03, 0.012));
    // (the upright: in the corner's parts – cornerGeo)
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

// the padded rim on the opening's edge: a soft tube (3 × 2.2 cm) a little out over the edge, up one side, round the front
// in front of the steering wheel (its middle at the opening's front) and down the other
// v0.43: the pad only beside the driver's shoulders and head (FIA 2025 Art 14.2 – the cockpit padding round the head);
// ahead of them the opening's edge is the chassis' own lip, a thin dark edge trim (~2.2 × 1.6 cm) over the painted top
// (2022–25 helmet-cam footage, research/cockpit43.md: the coaming over the wheel and the sides down into the frame's
// lower corners are the livery's colour, M). v0.42's 6 cm pad all round the U read from the eyes as a black band
// where the car's paint should show.
function rimAlong(edge, padTo) {
  const E = edge.filter((_, i) => i % 2 === 0 || i === edge.length - 1), last = edge[edge.length - 1];
  const side = (k) => E.map(([x, y, z]) => [(x + 0.006) * k, y + 0.012, z]);
  const front = [[last[0] * 0.55, last[1] + 0.012, last[2] + 0.02], [0, last[1] + 0.013, last[2] + 0.028], [-last[0] * 0.55, last[1] + 0.012, last[2] + 0.02]];
  const size = (P) => { const t = sstep(padTo, padTo + 0.2, P.z); return [0.03 - 0.019 * t, 0.022 - 0.014 * t]; };
  return sweep([...side(1), ...front, ...side(-1).reverse()], size, 0, 48, 8, true);
}
// The cockpit's opening (v0.42), the car's z with the cockpit's own shift (ck): its edge's half width along it – the
// rim's line of v0.41, a U closing in front of the steering wheel (FIA cockpit opening template, research/cockpit.md;
// the side edge ~0.27 m out, the front ~0.14 m ahead of the wheel's middle – photos, M) –, how deep the tub is under it
// (the bulkhead rising under and ahead of the wheel over its front 0.1 m, the seat's back over the rear 0.06 m) and the
// tub's floor. One definition for the chassis' fold (openLoft), the padded rim, the arms' room (arms.js) and the tests.
const OPEN_W = [[-0.36, 0.25], [-0.3, 0.262], [-0.05, 0.272], [0.25, 0.262], [0.36, 0.24], [0.44, 0.19], [0.5, 0.11]];
export function cockpitOpening(p) {
  const ck = p.ck || 0, zR = OPEN_W[0][0] + ck, zF = OPEN_W[OPEN_W.length - 1][0] + ck;
  const w = (z) => { const u = z - ck; if (u <= OPEN_W[0][0]) return OPEN_W[0][1]; for (let i = 0; i < OPEN_W.length - 1; i++) { const [u0, w0] = OPEN_W[i], [u1, w1] = OPEN_W[i + 1]; if (u <= u1) { const t = (u - u0) / (u1 - u0); return w0 + (w1 - w0) * t * t * (3 - 2 * t); } } return OPEN_W[OPEN_W.length - 1][1]; };
  const depth = (z) => { const u = z - ck; return sstep(-0.36, -0.3, u) * (1 - sstep(0.4, 0.5, u)); };
  return { zR, zF, w, depth, floor: () => 0.16, ramps: [[zR, -0.3 + ck], [0.4 + ck, zF]] };
}
function body2022(p) {
  const S = p.shape;
  // chassis, nose first (sec's format): the nose tip over the front wing's main plane, its top rising to the chassis
  // ahead of the cockpit (~0.65 m), the tub on the floor; the cockpit; the airbox hoop (its top the rules' 0.95 m);
  // the engine cover falling to the gearbox and the crash structure (the rain light at its end)
  const C = [
    [2.96, 0.17, 0.25, 0.06, 0, 2.4, -0.1], [2.82, 0.16, 0.285, 0.085, 0, 2.5, -0.22], [2.5, 0.165, 0.35, 0.11, 0, 2.6, -0.28], [2.1, 0.18, 0.43, 0.14, 0, 2.6, -0.3],
    [1.7, 0.19, 0.51, 0.17, 0, 2.6, -0.3], [1.35, 0.15, 0.6, 0.21, 0, 2.6, -0.28], [1.0, 0.11, 0.655, 0.25, 0, 2.7, -0.28], [0.8, 0.1, 0.672, 0.25, 0, 2.9, -0.24],
    [0.6, 0.1, 0.684, 0.27, 0, 4, -0.12], [0.4, 0.1, 0.662, 0.35, 0, 7, -0.04], [0.2, 0.1, 0.632, 0.37, 0, 8, -0.03], [-0.1, 0.1, 0.6, 0.36, 0, 8, -0.03], [-0.32, 0.1, 0.64, 0.3, 0, 2.8, -0.3],
    [-0.41, 0.1, 0.89, 0.28, 0, 2.6, -0.55], [-0.52, 0.1, 0.945, 0.255, 0, 2.5, -0.62], [-0.72, 0.1, 0.945, 0.24, 0, 2.5, -0.6], [-0.92, 0.1, 0.9, 0.23, 0, 2.5, -0.55], [-1.2, 0.1, 0.79, 0.205, 0, 2.5, -0.45],
    [-1.6, 0.13, 0.62, 0.155, 0, 2.5, -0.35], [-2.0, 0.18, 0.48, 0.105, 0, 2.5, -0.25], [-2.3, 0.22, 0.41, 0.07, 0, 2.4, -0.15], [-2.45, 0.245, 0.37, 0.05], [-2.655, 0.255, 0.335, 0.035],
  ];
  const zb = bodyShift(p), zp = podShift(p), ck = p.ck || 0;
  const OB = openLoft(smoothSections(sec(zMap(shapeBody(C, S, 1.7), zb)), 2).reverse(), 44, cockpitOpening(p)), body = OB.outer;
  // sidepods (left; the right a mirror): the inlet mouth under the mirror, the undercut beneath (the floor visible under
  // it), the top falling towards the floor's edge, the coke-bottle narrowing to the gearbox
  const P = sec(zMap(shapePods([
    [0.56, 0.41, 0.64, 0.115, 0.54, 3.2, 0.12], [0.42, 0.35, 0.665, 0.15, 0.53, 3, 0.3], [0.1, 0.29, 0.665, 0.17, 0.51, 2.8, 0.4], [-0.3, 0.24, 0.625, 0.165, 0.48, 2.7, 0.4],
    [-0.7, 0.2, 0.545, 0.14, 0.43, 2.6, 0.35], [-1.1, 0.17, 0.45, 0.11, 0.36, 2.6, 0.3], [-1.5, 0.15, 0.34, 0.075, 0.28, 2.5, 0.2], [-1.85, 0.15, 0.26, 0.04, 0.2],
  ], S), zp));
  const PB = blendPods(P, ck - 0.2, ck - 0.55), inl = inletRecess(PB[0]), inlets = both(inl.duct);
  const podL = loft(smoothSections(PB, 2).reverse(), 32, undefined, "rear");
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
  // (v0.40: the wing, its endplates and pylon 0.1 m further forward – FIA 2025 Technical Regulations Issue 03 App. §27–29
  // (read from the PDF 2026-10-19): the profiles between XR +140 and +555 (the tips to +680), the endplates' volume to
  // XR +680; the model's endplates reached XR +775 and the flap's trailing edge XR +680)
  const rwMain = wingSpan(rwSpan, (e) => [0.775 + 0.035 * e * e - tip(e), -2.0 - 0.02 * e, 0.3, 0.04, 0.1]);
  const rwFlap = wingSpan(rwSpan - 0.01, (e) => [0.855 + 0.015 * e * e - tip(e), -2.2 - 0.01 * e, 0.2, 0.026, 0.42]);   // (its trailing edge under Z 910: it stood at 1.01 m)
  // (the endplates' lower rear corner cut away, their tops rounding over into the elements – photos of SF-25, MCL39)
  const ep = [[-1.96, 0.54], [-1.95, 0.8], [-1.97, 0.88], [-2.06, 0.93], [-2.2, 0.95], [-2.4, 0.945], [-2.475, 0.9], [-2.47, 0.73], [-2.3, 0.7], [-2.1, 0.62], [-2.04, 0.54]];
  const rwPlates = merge([plate(ep, rwSpan / 2 + 0.006, 0.012), plate(ep, -rwSpan / 2 - 0.006, 0.012)]);
  const rwPylon = merge([plate([[-2.18, 0.33], [-2.09, 0.55], [-2.03, 0.76], [-2.23, 0.76], [-2.28, 0.58], [-2.4, 0.4], [-2.44, 0.33]], 0, 0.014), softBox(0.04, 0.06, 0.14, 0, 0.8, -2.14, 0.4)]);
  const beam = merge([wingSpan(0.88, (e) => [0.36, -2.3, 0.14, 0.02, 0.15], 10), wingSpan(0.84, (e) => [0.435, -2.42, 0.12, 0.018, 0.4], 10)]);
  const susp = suspension(p, (S?.fsusp ?? "pull") === "pull", S?.rsusp === "pull");
  // mirrors on the inlets' top, stays to the chassis's side
  const M = mirrorParts([0.5, 0.68, 0.52 + ck], [0.16, 0.065, 0.06], [0.27, 0.6, 0.55 + ck]);
  const tcamPod = softBox(0.1, 0.055, 0.13, 0, 0.995, -0.6 + ck, 0.3);   // (the lens at its front: the TCAM mount)
  // the shark fin (small on these cars), the exhaust over the crash structure
  const fin = plate([[-0.8, 0.935], [-1.0, 0.93], [-1.65, 0.68], [-1.65, 0.6], [-0.8, 0.9]].map(([z, y]) => [zb(z), y]), 0, 0.008);
  const exhaust = new THREE.CylinderGeometry(0.045, 0.05, 0.14, 14, 1, true); exhaust.rotateX(Math.PI / 2); exhaust.translate(0, 0.43, -2.46);
  return {
    body, tubIn: OB.inner, openEdge: OB.edge, room: OB.room, pods: both(merge([podL, inl.lip])),
    // (2022–25 halos are painted in the team's colours on most cars: with the body, the livery's zones decide)
    paintExtra: [paintUV(halo(p), true), rwPlates, ...M.heads],
    carbon: metricUV(merge([...floor, fw0, fwPlates, rwPylon, beam, ...susp, ...corners(p), ...M.stays, fin, tcamPod, inlets, airbox, exhaust, ...mirrorGlass([0.5, 0.68, 0.52 + ck], [0.16, 0.065, 0.06]), ...shapeParts(S, p, fwSpan, 2.68, 0.35, zb)]), 0.04),
    wing: rwMain, fwFlaps: merge([...fwF, ...fwEnds]), rwFlaps: rwFlap,   // (2022–25 flaps never move: the endplates go with them)
    fwPivot: [0.13, 2.68], rwPivot: [0.855, -2.2], aeroOpen: { fw: 0, rw: -0.75 },   // (2022–25: DRS opens the rear flap only)
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
    [1.6, 0.17, 0.52, 0.18, 0, 2.4, -0.3], [1.2, 0.12, 0.63, 0.235, 0, 2.1, -0.3], [0.8, 0.1, 0.675, 0.255, 0, 2.4, -0.24], [0.6, 0.1, 0.684, 0.27, 0, 3.6, -0.14],
    [0.4, 0.1, 0.662, 0.34, 0, 7, -0.05], [0.2, 0.1, 0.628, 0.365, 0, 8, -0.03], [-0.05, 0.1, 0.595, 0.355, 0, 8, -0.03], [-0.28, 0.1, 0.64, 0.31, 0, 2.8, -0.3],
    [-0.37, 0.1, 0.93, 0.285, 0, 2.6, -0.55], [-0.48, 0.1, 0.995, 0.26, 0, 2.5, -0.62], [-0.7, 0.1, 0.99, 0.245, 0, 2.5, -0.6], [-0.9, 0.1, 0.96, 0.235, 0, 2.5, -0.55], [-1.2, 0.1, 0.94, 0.215, 0, 2.6, -0.42],
    [-1.6, 0.13, 0.86, 0.17, 0, 2.6, -0.35], [-1.85, 0.16, 0.66, 0.125, 0, 2.5, -0.3], [-2.05, 0.19, 0.5, 0.095, 0, 2.5, -0.25], [-2.28, 0.22, 0.44, 0.065, 0, 2.4, -0.15], [-2.42, 0.245, 0.36, 0.045], [-2.52, 0.255, 0.33, 0.032],
  ];
  const zb = bodyShift(p), zp = podShift(p), ck = p.ck || 0;
  const OB = openLoft(smoothSections(sec(zMap(shapeBody(C, S, 1.6), zb)), 2).reverse(), 44, cockpitOpening(p)), body = OB.outer;
  const P = sec(zMap(shapePods([
    [0.55, 0.4, 0.62, 0.11, 0.52, 3.2, 0.12], [0.4, 0.34, 0.645, 0.14, 0.51, 3, 0.28], [0.05, 0.28, 0.645, 0.155, 0.49, 2.8, 0.38], [-0.35, 0.23, 0.6, 0.15, 0.46, 2.7, 0.38],
    [-0.75, 0.19, 0.52, 0.125, 0.41, 2.6, 0.32], [-1.15, 0.165, 0.43, 0.1, 0.34, 2.6, 0.28], [-1.5, 0.15, 0.33, 0.07, 0.27, 2.5, 0.2], [-1.78, 0.15, 0.26, 0.04, 0.2],
  ], S), zp));
  const PB = blendPods(P, ck - 0.2, ck - 0.55), inl = inletRecess(PB[0]), inlets = both(inl.duct);
  const podL = loft(smoothSections(PB, 2).reverse(), 32, undefined, "rear");
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
  const fwF = [wingSpan(fwSpan - 0.02, (e) => [0.15 + 0.08 * r(e), 2.58 - 0.08 * r(e), 0.17 + 0.03 * r(e), 0.026, 0.22 + 0.1 * r(e)]),
    wingSpan(fwSpan - 0.03, (e) => [0.2 + 0.08 * r(e), 2.45 - 0.05 * r(e), 0.12 + 0.02 * r(e), 0.022, 0.38 + 0.1 * r(e)])];
  const epF = [[2.95, 0.075], [2.95, 0.2], [2.88, 0.3], [2.7, 0.365], [2.4, 0.375], [2.15, 0.33], [2.05, 0.2], [2.08, 0.075]];
  const fwPlates = merge([plate(epF, 0.63, 0.012), plate(epF, -0.63, 0.012)]);
  const pylons = merge([plate([[2.75, 0.12], [2.75, 0.2], [2.45, 0.27], [2.3, 0.27], [2.4, 0.12]], 0.075, 0.012), plate([[2.75, 0.12], [2.75, 0.2], [2.45, 0.27], [2.3, 0.27], [2.4, 0.12]], -0.075, 0.012)]);
  // rear wing (C3.11: up to three elements within |y| ≤ 0.575 m, z 0.725–0.88 m; endplates – the upper at |y| 0.535–0.575,
  // the lower inboard at |y| 0.345–0.375, z 0.25–0.425; no beam wing): the main plane and two flaps that open together
  const rwSpan = 1.12;
  // (v0.40: the elements within the profiles' volume, XR +165…+630 – App. §30, Issue 17, read from the PDF 2026-10-19: the
  // flaps' trailing edge was at XR +740, behind it; the endplates may reach XR +750 and keep their place. The tips rise
  // outboard as §30.2's plane asks – Z ≥ 785 at Y 575 against 725 inboard)
  // (and under its top, Z 880 – ~0.92 m over the ground: the top flap's trailing edge was at 1.0 m)
  const rwMain = wingSpan(rwSpan, (e) => [0.765 + 0.05 * e * e, -1.88 - 0.01 * e, 0.24, 0.04, 0.12]);
  const rwFlaps = merge([wingSpan(rwSpan - 0.02, (e) => [0.81 + 0.03 * e * e, -2.09, 0.15, 0.026, 0.38]), wingSpan(rwSpan - 0.04, (e) => [0.87 + 0.015 * e * e, -2.205, 0.1, 0.02, 0.45])]);
  // (v0.40: the endplate as the rules draw it – App. §31, Issue 17: in the X-plane its section runs from the lower part
  // inboard (Y 345–375, Z 250–425) up a diagonal to the upper part outboard (Y 535–575, from Z 700 to 880), one piece; its
  // leading edge from XR +375 at Z 250 forward to XR +160 at Z 700, its trailing edge from XR +625 back to XR +750 at
  // Z 625 (§31.3 a/b). Race photos (RB22 Australia 2026-03-06, W17 / SF-26 Austria 2026-06-26) show that bent plate. It
  // was two separate flat plates, upper and lower, with a small triangle between. Heights: Z + ~4 cm, the reference plane
  // over the ground; the tops rounded off – an estimate)
  const RZ = p.RZ, lerpY = (y, pts) => { for (let i = 0; i < pts.length - 1; i++) { const [y0, z0] = pts[i], [y1, z1] = pts[i + 1]; if (y <= y1) return z0 + ((z1 - z0) * Math.max(0, y - y0)) / (y1 - y0); } return pts[pts.length - 1][1]; };
  const epPath = [[0.36, 0.29], [0.36, 0.465], [0.555, 0.74], [0.555, 0.9], [0.55, 0.925]];
  const epFront = (y) => lerpY(y, [[0.29, RZ - 0.375], [0.74, RZ - 0.16], [0.9, RZ - 0.16], [0.925, RZ - 0.2]]), epRear = (y) => lerpY(y, [[0.29, RZ - 0.625], [0.665, RZ - 0.75], [0.9, RZ - 0.75], [0.925, RZ - 0.72]]);
  const rwPlates = both(bentPlate(epPath, epFront, epRear));
  const rwPylon = merge([plate([[-2.12, 0.33], [-2.04, 0.55], [-1.98, 0.76], [-2.2, 0.76], [-2.26, 0.55], [-2.36, 0.4], [-2.38, 0.33]], 0, 0.014)]);
  const susp = suspension(p, S?.fsusp === "pull", S?.rsusp === "pull");
  // mirrors (C3.7.5: on stays from the chassis, the lateral safety light in the body; 2026 footage: larger and higher
  // than before, either side of the halo's legs)
  const M = mirrorParts([0.56, 0.74, 0.48 + ck], [0.22, 0.085, 0.07], [0.27, 0.62, 0.5 + ck]);
  // the T-cam pod on the airbox (2026 photos: a black pod with its antennas well over the helmet); the lens at its front
  const tcamPod = merge([softBox(0.11, 0.075, 0.16, 0, 1.06, -0.58 + ck, 0.3), boxAt(0.006, 0.07, 0.03, 0.03, 1.12, -0.62 + ck), boxAt(0.006, 0.07, 0.03, -0.03, 1.12, -0.62 + ck)]);
  const fin = plate([[-0.78, 0.99], [-0.98, 0.99], [-1.55, 0.93], [-1.75, 0.8], [-1.75, 0.72], [-0.78, 0.95]].map(([z, y]) => [zb(z), y]), 0, 0.008);
  const exhaust = new THREE.CylinderGeometry(0.045, 0.05, 0.14, 14, 1, true); exhaust.rotateX(Math.PI / 2); exhaust.translate(0, 0.42, -2.4);
  return {
    body, tubIn: OB.inner, openEdge: OB.edge, room: OB.room, pods: both(merge([podL, inl.lip])), paintExtra: [rwPlates, ...M.heads],
    // (2026 halos are black carbon on every car in the footage and photos – not painted)
    carbon: metricUV(merge([...floor, fw0, pylons, fwPlates, boards, rwPylon, ...susp, ...corners(p), ...M.stays, tcamPod, fin, inlets, airbox, exhaust, halo(p), ...mirrorGlass([0.56, 0.74, 0.48 + ck], [0.22, 0.085, 0.07]), ...shapeParts(S, p, fwSpan, 2.5, 0.37, zb)]), 0.04),
    wing: rwMain, fwFlaps: merge(fwF), rwFlaps,
    fwPivot: [0.16, 2.5], rwPivot: [0.81, -2.09], aeroOpen: { fw: -0.28, rw: -0.55 },   // (2026: both wings' flaps open)
    // (v0.40, C14.3 Issue 17: two lights in the endplates, lenses facing back – within 5° of the X-axis –, between Z 700
    // and 870, and the middle one's rear face centred at Z 295–305 on Y = 0. They were 0.36 m strips along the endplates'
    // outer faces, lit sideways: now upright strips at the endplates' trailing edges, a reference plane ~4 cm up)
    lights: [boxAt(0.012, 0.13, 0.014, 0.555, 0.825, p.RZ - 0.755), boxAt(0.012, 0.13, 0.014, -0.555, 0.825, p.RZ - 0.755), boxAt(0.06, 0.05, 0.02, 0, 0.34, -2.51)],
    halo: null,
  };
}

// The cockpit: its rim pads and headrest, the seat's dark interior, the steering wheel (with its screen, grips and
// paddles), the driver's helmet with visor, gloves and forearms.
function cockpit(p) {
  const [hx, hy, hz] = p.helmet;
  // the opening's rim (padded edge round it) and the headrest round the helmet's back and sides
  const rim = sweep([[0.26, 0.565, -0.32], [0.285, 0.575, -0.05], [0.27, 0.58, 0.25], [0.18, 0.585, 0.45], [0, 0.59, 0.5], [-0.18, 0.585, 0.45], [-0.27, 0.58, 0.25], [-0.285, 0.575, -0.05], [-0.26, 0.565, -0.32]], 0.03, 0.022, 48, 10);
  // (v0.42: the side pads beside the helmet, over the shoulders – FIA 2025 Art 14.2: ≥ 95 mm thick above Z 545, ≥ 320 mm
  // apart; research/cockpit.md – from the head's back to its front; they reached down to 0.545 m and 0.39 m forward, over
  // the shoulders and the upper arms)
  const [padC, padH] = headPads(p), padZ = padC[2] - (p.ck || 0), headrest = merge([softBox(padH[0] * 2, padH[1] * 2, padH[2] * 2, padC[0], padC[1], padZ, 0.25, 4), softBox(padH[0] * 2, padH[1] * 2, padH[2] * 2, -padC[0], padC[1], padZ, 0.25, 4), softBox(0.42, 0.2, 0.1, 0, 0.64, -0.33, 0.25, 4)]);
  // behind the helmet, the seat's top and the HANS' collar (dark); the tub itself is the chassis' fold (openLoft – v0.41's
  // flat dark slab lay under the closed paint)
  // (v0.42: the HANS collar 0.26 m across behind the helmet's back – it was a 0.38 m block reaching forward over the
  // shoulders, through which a raised arm passed at a big lock)
  const [hC, hH] = hansBox(p), tub = softBox(hH[0] * 2, hH[1] * 2, hH[2] * 2, 0, hC[1], hC[2] - (p.ck || 0), 0.3, 4);
  // (v0.39: the cockpit ck further forward than these numbers – the helmet and mounts are the profile's own)
  const ck = p.ck || 0; for (const g of [rim, headrest, tub]) g.translate(0, 0, ck);
  // helmet: an egg a little longer than wide, its chin bar lower in front; the visor a band over its eyes
  const [sx, sy, sz] = p.helmetSize || [0.13, 0.14, 0.155];
  const helmet = new THREE.SphereGeometry(1, 30, 20); helmet.scale(sx, sy, sz);
  { const q = helmet.attributes.position; for (let i = 0; i < q.count; i++) { const y = q.getY(i), z = q.getZ(i); if (y < -0.04 && z > 0) q.setY(i, y - 0.02 * (z / 0.155)); } helmet.computeVertexNormals(); }
  helmet.translate(hx, hy, hz);
  const visor = new THREE.SphereGeometry(1.01, 28, 8, Math.PI / 2 - 0.95, 1.9, 1.2, 0.42); visor.scale(sx, sy, sz); visor.translate(hx, hy, hz);
  // the steering wheel (wheel3d.js): the team's where a source shows it (carshapes.js wheel), else the era's neutral
  // one – carbon body, rubber grips, display in its bezel, buttons, rotaries, paddles, hub, and its shift lights' places;
  // its face (−z, towards the driver) tilted up to the driver's eyes
  const wz = wheelZ(p), wy = WHEEL_MOUNT.y, tilt = WHEEL_MOUNT.tilt;
  const W = wheelSpec(p.wheel || null), SW = steeringParts(W, merge, metricUV);
  const column = rod([0, -0.02, 0.06], [0, -0.02, 0.24], 0.018, 10);
  // the gloves round the grips (body3d.js driverGlove: a left hand closed round the grip, phalanges tangent to it, the
  // grip across the palm obliquely; the right hand its mirror image) and the arms (a skinned sleeve and the glove's
  // gauntlet each, body3d armSkin / gauntletSkin) from the shoulders (armGeometryOf; an estimate).
  // v0.41 (arms.js): the hand's roll round its grip, and per angle of the wheel the elbow's swivel, the shoulder's bit
  // of travel and the grip's small turn in the hand, planned together for a natural wrist and forearm – the plan a table
  // over the wheel's angle (the same angle, the same arms). v0.40 reached the arm to a fixed glove's wrist with a fixed
  // elbow pole: the forearm ran up along the grip and the wrist was bent ~66° sideways with the wheel straight.
  const fine = driverGlove(W.grip.r, 1), lo = driverGlove(W.grip.r, 0);
  const A = armGeometryOf(p, W), plan = armPlanFor(A), grip = A.grip, shoulder = A.base.shoulder;
  // the left glove into the wheel's frame (the plan's roll), then about its grip's centre (it turns there: a pivot)
  const F = plan.geo.frame, fistM = new THREE.Matrix4().makeBasis(new THREE.Vector3(...F.x), new THREE.Vector3(...F.y), new THREE.Vector3(...F.z)).setPosition(...F.o);
  const c = grip.c, at = new THREE.Matrix4().makeTranslation(-c[0], -c[1], -c[2]).multiply(fistM);
  const place = (gl) => { gl.applyMatrix4(at); gl.userData.tips = gl.userData.tips.map((t) => new THREE.Vector3(...t).applyMatrix4(at).toArray()); return gl; };
  const left = place(fine), leftLo = place(lo);
  // (the right glove: the left mirrored across the wheel's middle – its pivot is the mirrored grip's centre)
  const mirrorTips = (g, from) => { g.userData.tips = from.userData.tips.map(([x, y, z]) => [-x, y, z]); return g; };
  const right = mirrorTips(mirrorGlove(left), left), rightLo = mirrorTips(mirrorGlove(leftLo), leftLo);
  return {
    rim, headrest: merge([headrest, tub]), helmet, visor, torso: torsoKit(p, shoulder),
    // (the arms: placed per car each frame from the plan, setWheels)
    wheel: { body: SW.body, rubber: SW.rubber, bezel: SW.bezel, caps: SW.caps, metal: merge([SW.metal, column]), paddles: SW.paddles, screen: SW.screen, leds: SW.leds, led: ledGeometry(SW.led.r), ledWhere: W.leds?.where || null, spec: W,
      flags: SW.flags, gloves: [left, right], glovesLo: [leftLo, rightLo], grip, arm: armSkin(), gauntlet: gauntletSkin(), at: [0, wy, wz], tilt, plan, shoulder },
  };
}
// the head's side pads (left one: centre and half sizes, the car's frame with the cockpit's shift) – drawn by cockpit(),
// kept clear by the arms (arms.js)
export const headPads = (p) => [[0.21, 0.655, p.helmet[2] - 0.07], [0.0475, 0.065, 0.09]];   // (from behind the helmet to its middle: a raised arm at a big lock passes in front of them)
// the HANS collar behind the helmet (centre and half sizes)
export const hansBox = (p) => [[0, 0.6, p.helmet[2] - (p.helmetSize?.[2] ?? 0.155) - 0.05], [0.13, 0.05, 0.07]];
// The steering wheel's mount in the cockpit (the car's frame, before the cockpit's shift ck): its middle and its face's
// tilt back from upright. v0.42: 0.3 rad (17°) – research/cockpit.md: 10–20° in photos (L); it was 0.42 (24°), which
// laid the grips back along the rising forearms (the wrists bent ~40° to the little finger with the wheel straight).
export const WHEEL_MOUNT = { y: 0.585, z: 0.36, tilt: 0.3, fromHelmet: 0.44 };
// (z: v0.42 – the wheel's middle 0.44 m ahead of the helmet's in every era, the driver's reach; it was the cockpit's own
// place (0.36 + ck), which with the 2026 profile's ck and the same helmet put the wheel 3 cm nearer the driver than in
// 2022–25 – the arms more folded, into the torso at a big lock)
export const wheelZ = (p) => (p.helmet?.[2] ?? 0.25) + WHEEL_MOUNT.fromHelmet;
// The driver's torso and thighs (v0.42 – the open cockpit shows them; v0.41's closed paint hid that there were none):
// the chest and pelvis (body3d's) along the back reclined from the shoulders – their middle at the arms' shoulder joints'
// height – down to the hips on the seat, the thighs forward and a little up into the footwell under the bulkhead. The
// recline (the shoulders over the hips by 0.29 m in 0.48 m: ~37° from flat) and the knees' place are estimates from
// side photos of drivers in their cars (M–L). Returns the parts' placement (for the mesh) and the capsules the arms keep
// clear of (arms.js torsoPenetration).
export function driverTorso(shoulder) {
  const sm = new THREE.Vector3(0, shoulder[1], shoulder[2]), hip = new THREE.Vector3(0, 0.25, shoulder[2] + 0.385);
  const up = sm.clone().sub(hip).normalize(), front = new THREE.Vector3(0, -up.z, up.y);   // (up the back; out of the chest)
  const L0 = sm.clone().addScaledVector(up, -BODY.chestShoulder), hips = L0.clone().addScaledVector(up, -BODY.lumbar);
  const thighDir = new THREE.Vector3(0, Math.sin(0.25), Math.cos(0.25)), hipX = BODY.hipZ;
  const thighs = [1, -1].map((k) => { const a = hips.clone().setX(hipX * k), b = a.clone().addScaledVector(thighDir, BODY.thigh); return [a, b]; });
  // (the capsules: the ribcage – 0.14 m half across, 0.1 m front to back – not the suit's outline: the arms lie against
  // the sides of the chest, they don't stand off it)
  return { L0, up, front, hips, thighs, capsule: { L0: L0.toArray(), up: up.toArray(), front: front.toArray(), lo: -0.2, hi: 0.42, hw: 0.14, hd: 0.1, thighs: thighs.map(([a, b]) => [a.toArray(), b.toArray(), 0.075]) } };
}
// a geometry's triangles as [ax, ay, az, bx, by, bz, cx, cy, cz] (meshgeo.js's form)
function geoTriangles(g) {
  const P = g.attributes.position, I = g.index, n = I ? I.count : P.count, out = [];
  for (let i = 0; i + 2 < n; i += 3) { const t = []; for (let j = 0; j < 3; j++) { const v = I ? I.getX(i + j) : i + j; t.push(P.getX(v), P.getY(v), P.getZ(v)); } out.push(t); }
  g.dispose(); return out;
}
// v0.44: the torso in the suit's kit zone with the six-point harness on it (harness.js: laid on this mesh and the HANS
// collar), one geometry – the kit's material draws both (kit.js); the arms are planned against it as drawn
function torsoKit(p, shoulder) {
  const T = driverTorso(shoulder), body = kitZone(torsoGeometry(T), KIT_ZONE.suit);
  // (the collar where cockpit() draws it: hansBox is in the car's frame – cockpit() shifts it back and forth by ck)
  const [hC, hH] = hansBox(p), hans = softBox(hH[0] * 2, hH[1] * 2, hH[2] * 2, 0, hC[1], hC[2], 0.3, 4);
  const belt = harnessGeometry(T, [body, hans]); hans.dispose();
  const out = mergeColoured([body, belt]); out.userData.buckle = belt.userData.buckle; body.dispose(); belt.dispose();
  return out;
}
function torsoGeometry(t) {
  // (the lathes' frame: +y up the spine, +x out of the chest, z across – into the car's: y → up, x → front, z → −x)
  const M = new THREE.Matrix4().makeBasis(t.front, t.up, new THREE.Vector3().crossVectors(t.front, t.up)).setPosition(t.L0);
  // (body3d's chest and pelvis outlines, coarser: down in the tub, mostly under the arms and the wheel)
  const chest = trunkGeometry([[-0.06, 0.118], [0, 0.13], [0.1, 0.136], [0.22, 0.154], [0.31, 0.164], [0.37, 0.157], [0.415, 0.127], [0.445, 0.07], [0.455, 0.03]], 0.68, 10);
  const pelvis = trunkGeometry([[-0.22, 0.03], [-0.2, 0.09], [-0.16, 0.138], [-0.11, 0.152], [-0.05, 0.146], [0, 0.132], [0.06, 0.116]], 0.64, 10);
  const parts = [chest.applyMatrix4(M), pelvis.applyMatrix4(M)];
  for (const [a, b] of t.thighs) { const g = limbGeometry(BODY.thigh, 0.082, JOINT_R.knee - 0.002, 0.006, 0.25, 0.95, 8, 5); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())); g.translate(a.x, a.y, a.z); parts.push(g); }
  return merge(parts);
}
// The driver's arm geometry for a car (season, team): the wheel's place and tilt, the shoulders, the left grip, the
// glove's wrist and axes – and its key (with the arms' cost settings) for the baked plans (armplans.js)
export function armGeometry(season, teamName, date = null) { const p = profileFor(season, teamName, date); return armGeometryOf(p, wheelSpec(p.wheel || null)); }
function armGeometryOf(p, W) {
  // (the shoulder joints: 0.21 m below the eyes (body3d proportions) and – v0.41 – under the back of the helmet, where
  // the HANS device's yoke lies on the shoulders behind the helmet (its collar behind the shell's back): the helmet's
  // centre less its depth. v0.40 had them 0.13 m behind the eyes, under the middle of the helmet – the arm then had
  // ~0.44 m to reach a 0.59 m arm into, folding the elbow down beside the rim and bending the rising hand ~60°.)
  const hz = (p.helmet?.[2] ?? p.eye[2] - 0.05) - (p.helmetSize?.[2] ?? 0.155);
  const base = { at: [0, WHEEL_MOUNT.y, wheelZ(p)], tilt: WHEEL_MOUNT.tilt, shoulder: [0.19, p.eye[1] - 0.21, hz] };
  base.torso = driverTorso(base.shoulder).capsule; base.torso.boxes = [headPads(p), hansBox(p)];
  // (v0.44: the harness on the torso – in the plans' key, so plans baked without it are seen as stale)
  base.torso.harness = HARNESS;
  // (v0.43: the torso as drawn – its mesh's triangles, for the planner's distance field (arms.js torsoField); a function,
  // so a car never builds them, and left out of the key's JSON – PLAN_COST says the field is used)
  const sh = base.shoulder; base.torso.mesh = () => geoTriangles(torsoKit(p, sh));
  // (the glove against the wheel's face parts – thumb drums, buttons – as the grip turns in the hand: clear on every
  // wheel layout over ±40° of turn, measured on the glove's mesh (wheel42 test) – not a term of the plan)
  const grip = { c: [W.grip.x, 0, 0], up: [Math.sin(W.grip.tilt), Math.cos(W.grip.tilt), 0] }, glove = driverGlove(W.grip.r, 0).userData;
  // (v0.42: the cockpit's room – the arms kept out of the tub's walls, the rim and the chassis – in the plan and its key)
  base.room = roomOf(p);
  const r = (v) => (Array.isArray(v) ? v.map(r) : typeof v === "number" ? +v.toFixed(5) : v);
  let h = 0; for (const v of [...base.room.top, ...base.room.edgeX, ...base.room.edgeY, ...base.room.bottom]) h = (h * 31 + Math.round(v * 1e4)) | 0;
  return { base, grip, glove, key: JSON.stringify(r([base.at, base.tilt, base.shoulder, grip.c, grip.up, glove.wrist, glove.hand, PLAN_COST, base.room.z0, h, base.torso])) };
}
// the plan for that geometry: the baked one (tools/arm-plans.js) – else made now on a coarse grid (~1–2 s; a warning:
// re-bake), once per geometry
const ARM_PLANS_MADE = new Map();
function armPlanFor(A) {
  if (ARM_PLANS_MADE.has(A.key)) return ARM_PLANS_MADE.get(A.key);
  const b = ARM_PLANS[A.key], D = Math.PI / 180;
  let plan;
  if (b) plan = smoothPlan(armGeo(A.base, A.grip, A.glove, b.rho * D), b.rows);
  else { console.warn("arm plan not baked for this cockpit (node tools/arm-plans.js) – made on a coarse grid"); plan = planArmsPath(armGeo(A.base, A.grip, A.glove, 60 * D), { swStep: 10 * D, rlStep: 5 * D }); }
  plan.baked = !!b; ARM_PLANS_MADE.set(A.key, plan);
  return plan;
}

// Wheels: the tyre (rounded profile, sidewall bulge), the rim's lip, the wheel cover (with the compound's coloured
// band on the sidewall); the fronts' corner parts (cornerGeo: drum, intake, upright, caliper, disc, hub – and on 2022–25
// cars the deflector arching over the front tyre: they steer, they don't spin).
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
  // The rim's face (v0.39, docs/research/wheels_tyres.md – FIA 2025 Art. 3.13.7 / 10.7, 2026 C10.7.5; race photos):
  //   2022–25: the standard wheel cover – a flat matte-black disc to the rim's lip (Ø 490.6 mm), fixed to the rim (it turns
  //     with it), a ring of ~10 small fasteners near its edge, a valve hole, a central opening (~⅓ of its diameter) showing
  //     the hub and the coloured wheel nut;
  //   2026: no cover – the mandatory annular outboard disc (inner Ø 310 mm, Issue 14) to the lip (Ø 496 mm), and inside it
  //     the team's own rim: spokes (a show car's ~14 twin spokes – team designs differ; an estimate) over dark closing
  //     panels, the hub and the nut (≤ Ø 105 mm, 6-sided here).
  // Vertex colours (the materials white): one mesh for the black parts, one for the metal ones – no more draw calls
  // than the plain disc had. NUTS: the nut's colour where a race photo shows a team's (else an anodised grey).
  const era26 = p.era === "2026", lipR = era26 ? 0.248 : 0.2453, nut = NUTS[p.variant] || NUTS.default;
  const tint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g; };
  const onFace = (g, x, rad = 0, ang = 0) => { g.translate(0, rad, 0); g.rotateX(ang); g.translate(x, 0, 0); return g; };
  const axleCyl = (r1, r2, len, seg, x, rad = 0, ang = 0) => { const g = new THREE.CylinderGeometry(r1, r2, len, seg); g.rotateZ(-Math.PI / 2); return onFace(g, x, rad, ang); };
  // (v0.43: the rim's both flanges, the nut, valve and fasteners on its outer face only – they were mirrored onto the
  // inner face too, a nut where the brake drum is; the hub went to the corner's parts – it stays on the car at a stop;
  // the rim's inner barrel and its centre's inboard face added: through the inner flange the eye saw the cover's back
  // – a black disc – and past the drum's edge through the wheel)
  const lip = (w) => {
    const g = new THREE.TorusGeometry(lipR, 0.012, 6, 40); g.rotateY(Math.PI / 2); g.translate(w / 2 - 0.012, 0, 0);
    const parts = [tint(g.toNonIndexed(), [0.54, 0.56, 0.59])];
    parts.push(tint(g.clone().translate(-(w - 0.024), 0, 0).toNonIndexed(), [0.54, 0.56, 0.59]));   // the inner flange
    const face = w / 2 - (era26 ? 0.014 : 0.016);
    if (!era26) for (let i = 0; i < 10; i++) parts.push(tint(axleCyl(0.008, 0.008, 0.006, 8, face + 0.002, 0.219, (i / 10) * Math.PI * 2).toNonIndexed(), [0.42, 0.44, 0.47]));
    parts.push(tint(axleCyl(0.006, 0.006, 0.016, 8, face + 0.006, era26 ? 0.2 : 0.19, 0.31).toNonIndexed(), [0.75, 0.77, 0.8]));   // the valve
    // the nut (it stays in the wheel – a captive nut – and comes off with it): six flats, a collar in the second colour
    parts.push(tint(axleCyl(0.046, 0.0525, 0.05, 6, w / 2 - 0.035).toNonIndexed(), nut.c));
    parts.push(tint(axleCyl(0.054, 0.054, 0.012, 20, w / 2 - 0.058).toNonIndexed(), nut.ring || nut.c));
    // the barrel (its inside: faces towards the axle) from flange to flange, and the rim's centre seen from inboard
    const bR = CORNER.barrelR, bar = new THREE.CylinderGeometry(bR, bR, w - 0.03, 40, 1, true); bar.rotateZ(-Math.PI / 2);
    const bi = bar.toNonIndexed(), ba = bi.attributes.position.array; for (let i = 0; i < ba.length; i += 9) for (let k = 0; k < 3; k++) [ba[i + 3 + k], ba[i + 6 + k]] = [ba[i + 6 + k], ba[i + 3 + k]];
    bi.computeVertexNormals(); parts.push(tint(bi, [0.09, 0.095, 0.1]));
    const web = new THREE.RingGeometry(CORNER.hubR + 0.004, bR + 0.002, 40, 1); web.rotateY(-Math.PI / 2); web.translate(w / 2 - 0.075, 0, 0); parts.push(tint(web.toNonIndexed(), [0.07, 0.072, 0.078]));
    return merge(parts);
  };
  const cover = (r, w) => {
    const parts = [];
    if (!era26) {
      const d = new THREE.RingGeometry(0.08, lipR - 0.003, 40, 1); d.rotateY(Math.PI / 2); d.translate(w / 2 - 0.016, 0, 0); parts.push(tint(d.toNonIndexed(), [0.07, 0.075, 0.085]));
      const well = new THREE.CylinderGeometry(0.08, 0.08, 0.05, 24, 1, true); well.rotateZ(-Math.PI / 2); well.translate(w / 2 - 0.041, 0, 0); parts.push(tint(well.toNonIndexed(), [0.05, 0.05, 0.055]));
    } else {
      const d = new THREE.RingGeometry(0.155, lipR - 0.002, 40, 1); d.rotateY(Math.PI / 2); d.translate(w / 2 - 0.014, 0, 0); parts.push(tint(d.toNonIndexed(), [0.07, 0.075, 0.085]));
      const panel = new THREE.CircleGeometry(0.155, 28); panel.rotateY(Math.PI / 2); panel.translate(w / 2 - 0.055, 0, 0); parts.push(tint(panel.toNonIndexed(), [0.035, 0.035, 0.04]));
      // seven twin spokes from the hub out to the disc's edge
      for (let i = 0; i < 7; i++) for (const o of [-0.09, 0.09]) {
        const b = new THREE.BoxGeometry(0.02, 0.1, 0.016); b.rotateZ(0.0); onFace(b, w / 2 - 0.04, 0.108, (i / 7) * Math.PI * 2 + o); parts.push(tint(b.toNonIndexed(), [0.2, 0.21, 0.23]));
      }
    }
    return merge(parts);   // (v0.43: the outer face only – it was mirrored onto the inner face, where the drum is)
  };
  // the left wheel's (outer face +x); the right wheel's turned half round about the vertical (not mirrored: the wheel is
  // the same both ways round). corner: the parts inside the wheel that steer but don't roll (fronts – cornerGeo; the
  // rears' are in the body) – the right one the left's mirror image (its intake still faces forward)
  const half = (g) => g.clone().rotateY(Math.PI);
  const out = {};
  for (const [k, r, w] of [["front", p.FR, p.FW], ["rear", p.RR, p.RW]]) {
    const L = lip(w), C = cover(r, w);
    out[k] = { tyre: tyre(r, w), band: band(r, w), lip: L, cover: C, lipR: half(L), coverR: half(C) };
  }
  const cl = metricUV(cornerGeo(p, true), 0.04);
  out.front.corner = cl; out.front.cornerR = mirrorAll(cl);
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

// ---------- reflections by day (v0.40) ----------
// By day the cars have no environment map (map3d.js: the PMREM sky over a car filling the cockpit cameras' screen dropped
// frames on the GPU), so glossy paint, carbon, metal rims and visors showed only the sun's one highlight and read as
// plastic. Each lit car material gets the sky as the app's day lights paint it, worked out in the shader – a few
// arithmetic operations, no texture: the reflected ray's colour from the ground below the horizon (the hemisphere
// light's ground colour), a bright horizon and the zenith's blue (its sky colour), the horizon's edge blurred and the
// colours averaged with the surface's roughness. three.js's own BRDF then weighs it (Fresnel, roughness, metalness) as it
// would an environment map's light – so paint shows the horizon along its flanks, the rims look metal, and matte paint
// stays matte. Added to the indirect specular light ahead of the light maps' chunk: the night patches after it (map3d
// nightLit's tunnel mask: radiance × 0.3 under the roof) still apply. Off (0) when a real environment map is given
// (night: setCarEnvironment), so the two never add up; tone mapping and colour space are the renderer's, once.
export const CAR_SKY = { value: 1 };
const SKY_GLSL = `
uniform float uCarSky;
vec3 carSky(vec3 d, float r) {
  // (linear RGB, after the app's day hemisphere light – sky 0xe3efff, ground 0x4a5a3a – with the horizon dimmed to what
  // stands round a track – trees, stands, barriers – rather than open sky: an estimate, tuned on the turntable)
  float w = 0.03 + 0.5 * r * r, y = d.y;
  vec3 zen = vec3(0.3, 0.44, 0.72), hor = vec3(0.7, 0.74, 0.8), gnd = vec3(0.05, 0.06, 0.045);
  vec3 up = mix(hor, zen, sqrt(max(y, 0.0))), dn = mix(hor * 0.32, gnd, smoothstep(0.0, 0.3, -y));
  return mix(mix(dn, up, smoothstep(-w, w, y)), vec3(0.3, 0.33, 0.37), r * r);
}`;
const skied = new WeakSet();
// (k: how much of it a material takes – carbon less: its lacquer is thinner and the floor's top, facing the sky, read
// pale grey in the app where photos show it near black; the halo is carbon too and must stay dark in the T-cam's view)
function skyLit(m, k = 1) {
  if (!m || skied.has(m)) return m;
  skied.add(m);
  const u = k === 1 ? CAR_SKY : { get value() { return CAR_SKY.value * k; } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCarSky = u;
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>" + SKY_GLSL).replace("#include <lights_fragment_maps>", `
#if defined( RE_IndirectSpecular )
  if (uCarSky > 0.0) radiance += uCarSky * carSky(inverseTransformDirection(reflect(-geometryViewDir, geometryNormal), viewMatrix), material.roughness);
#endif
#include <lights_fragment_maps>`);
  };
  m.customProgramCacheKey = () => "carSky";
  return m;
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
  // (v0.40 finishes: gloss paint is clear-coated – sharper than 0.28 drew it; matte paint (Red Bull 2025) a satin 0.55;
  // the reflections are the sky's (skyLit) – estimates against race photos, not measured)
  const paint = skyLit(new THREE.MeshStandardMaterial({ map: liveryTexture(l, number, prof), color: hasDom ? 0xffffff : l.base, roughness: matte ? 0.55 : 0.2, metalness: 0.05 }), 0.85);
  const cm = carbonMaps();
  // (the weave as colour only: a normal and roughness map over a car that fills the cockpit cameras' screen, with the
  // reflections, dropped frames on the GPU – measured; the colour map costs next to nothing)
  // (v0.40: lacquered carbon, a dielectric – metalness 0.15 dulled its colour under the sky and gave it no sheen; it now
  // takes the sky's reflection like a varnished part)
  const carbon = mat("carbon", () => skyLit(new THREE.MeshStandardMaterial({ color: 0xffffff, map: cm.colour, roughness: 0.45, metalness: 0 }), 0.35));
  // the rear wing's elements and the front wing's flaps in the livery's colours (v0.38: the top colour on both)
  const wingPaint = skyLit(new THREE.MeshStandardMaterial({ color: l.wing || (l.accent === "#ffffff" || l.accent === "#f2f2f2" ? l.base : l.top), roughness: matte ? 0.55 : 0.24, metalness: 0.05 }));
  const fwPaint = skyLit(new THREE.MeshStandardMaterial({ color: l.fw || l.wing || l.base, roughness: matte ? 0.55 : 0.24, metalness: 0.05 }));
  // (rubber: matte, a faint sheen at grazing angles; the wheel's black parts satin, its metal parts – the rim's lip, the
  // nut, the hub – metal that now has a sky to reflect: without one a metalness of 0.85 drew them near black)
  const tyreMat = mat("tyre", () => skyLit(new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.88, metalness: 0 }), 0.6));
  const coverMat = mat("cover", () => skyLit(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0.2 }), 0.6));
  const lipMat = mat("lip", () => skyLit(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.32, metalness: 0.85 })));
  const pad = mat("pad", () => new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.85, metalness: 0 }));
  // (v0.43: the tub – the chassis' inside, bare carbon: the weave, a satin sheen from the sky – the same carbon as the car's,
  // darker (in its own shade); v0.42's flat 0x17191c skin, matte, showed the walls under the rim as one black hole)
  const tubMat = mat("tub", () => skyLit(new THREE.MeshStandardMaterial({ color: 0xb4b4b4, map: cm.colour, roughness: 0.45, metalness: 0 }), 0.35));
  const visorMat = mat("visor", () => skyLit(new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.06, metalness: 0.7 })));
  const screenMat = mat("screen", () => new THREE.MeshBasicMaterial({ map: wheelScreen(), toneMapped: false }));
  // the wheel's own materials (shared): grips' rubber, the matte black of the display's bezel and the light strip, the
  // buttons' and scales' coloured caps (vertex colours), anodised metal (hub, paddle pivots); the shift lights unlit
  // (lit through each car's instance colours – never brighter than their colour: no white blow-out by day or night)
  const rubberMat = mat("wheelRubber", () => new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.93, metalness: 0 }));
  const bezelMat = mat("wheelBezel", () => new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.62, metalness: 0.05 }));
  const capsMat = mat("wheelCaps", () => new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.38, metalness: 0.05 }));
  const metalMat = mat("wheelMetal", () => new THREE.MeshStandardMaterial({ color: 0x8e949b, roughness: 0.3, metalness: 0.9 }));
  const ledMat = mat("wheelLed", () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  // (v0.42: the wheel's own carbon – its weave at the wheel's 3 mm tows (wheel3d.js UVs), a touch darker than the car's
  // and lacquered glossier: a moulded face plate with a sheen along its rounded edges (W16 photos, AMR26 replica), where
  // v0.41's car carbon read as a big grey weave on a matte slab)
  const wheelCarbon = mat("wheelCarbon", () => skyLit(new THREE.MeshStandardMaterial({ color: 0xa0a0a0, map: cm.colour, roughness: 0.3, metalness: 0 }), 0.45));
  const bandMat = sidewallMaterial(0xf2c230, prof.era);
  const lightMat = mat("light", () => new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  const helmetMat = skyLit(new THREE.MeshStandardMaterial({ map: helmetTexture(l), color: hasDom ? 0xffffff : l.top, roughness: 0.18, metalness: 0.1 }));
  // the driver's kit – gloves, the suit's sleeves and torso, the harness – in the team's kit colours per zone (kit.js: one
  // material per kit style, shared by the team's cars; v0.43 drew the gloves in the car's base colour all over)
  const kitMat = kitMaterial(kitStyle(l, kitEntry(teamName, prof.season, date, number))), gloveMat = kitMat, suitMat = kitMat;
  const g = new THREE.Group();
  const add = (geo, m, parent = g, name) => { const mesh = new THREE.Mesh(geo, m); if (name) mesh.name = name; parent.add(mesh); return mesh; };
  add(t.painted, paint, g, "painted"); add(t.carbon, carbon, g, "carbon"); add(t.wing, wingPaint, g, "wing"); add(t.rim, pad, g, "rim");
  // the tub inside the cockpit's opening (the chassis' fold: walls, floor, bulkhead, seat back) – dark carbon, every LOD
  // (it shows from the helicopter too)
  if (t.tubIn) add(t.tubIn, tubMat, g, "tub");
  // active aero / DRS: the flaps pivot about their leading edges (closed = corner mode, open = straight mode / DRS)
  const pivot = ([y, z], geo, m0) => { const pv = new THREE.Group(); pv.position.set(0, y, z); const m = new THREE.Mesh(geo, m0); m.position.set(0, -y, -z); pv.add(m); g.add(pv); return pv; };
  const fwPivot = pivot(t.fwPivot, t.fwFlaps, fwPaint), rwPivot = pivot(t.rwPivot, t.rwFlaps, wingPaint);
  const fine = [add(t.lights, lightMat)];
  // driver: helmet and visor always (a T-cam sees them); the rest close up only
  const helmet = add(t.helmet, helmetMat, g, "helmet"); const visor = add(t.visor, visorMat, helmet);
  const near = new THREE.Group(); near.name = "near"; g.add(near);
  add(t.headrest, pad, near, "headrest");
  // the driver's torso and thighs in the suit (the open tub shows them – close up only, as the arms)
  add(t.torso, suitMat, near, "torso");
  const wheel = new THREE.Group(); wheel.name = "steering"; wheel.position.set(...t.wheel.at); wheel.rotation.x = t.wheel.tilt; near.add(wheel);
  add(t.wheel.body, wheelCarbon, wheel); add(t.wheel.paddles, wheelCarbon, wheel); add(t.wheel.rubber, rubberMat, wheel); add(t.wheel.bezel, bezelMat, wheel); add(t.wheel.caps, capsMat, wheel); add(t.wheel.metal, metalMat, wheel);
  const screen = add(t.wheel.screen, screenMat, wheel, "wheelScreen");
  // (the gloves: the fine pair only for the car a cockpit camera rides in – setCockpit; ~16k triangles – else a light pair;
  // each hand on a pivot at its grip's centre: the grip turns a little in the hand with the wheel's angle – placeArms)
  const hands = [0, 1].map((i) => { const pv = new THREE.Group(); pv.name = i ? "handR" : "handL"; const [cx, cy, cz] = t.wheel.grip.c; pv.position.set(i ? -cx : cx, cy, cz); wheel.add(pv); return pv; });
  const gloveFine = hands.map((pv, i) => add(t.wheel.gloves[i], gloveMat, pv, "glove")), gloveLo = hands.map((pv, i) => add(t.wheel.glovesLo[i], gloveMat, pv, "gloveLo"));
  for (const m of gloveFine) m.visible = false;
  // the shift lights: one instanced mesh per car (its own colours), the light's shape shared (shiftlights.js says which
  // are lit, setLeds paints them)
  let leds = null;
  if (t.wheel.leds.length) {
    const m = new THREE.InstancedMesh(t.wheel.led, ledMat, t.wheel.leds.length); m.name = "shiftLights"; m.frustumCulled = false;
    const mt = new THREE.Matrix4(); t.wheel.leds.forEach(([x, y, z], i) => { m.setMatrixAt(i, mt.makeTranslation(x, y, z)); m.setColorAt(i, LED_OFF); });
    wheel.add(m); leds = { mesh: m, count: t.wheel.leds.length, where: t.wheel.ledWhere, key: "" };
  }
  // the FIA flag lights beside the display (3 a side): lit by race control's track state (setFlagLights)
  let flagLights = null;
  if (t.wheel.flags.length) {
    const m = new THREE.InstancedMesh(t.wheel.led, ledMat, t.wheel.flags.length); m.name = "flagLights"; m.frustumCulled = false;
    const mt = new THREE.Matrix4(); t.wheel.flags.forEach(([x, y, z], i) => { m.setMatrixAt(i, mt.makeTranslation(x, y, z).scale(_one.set(1.3, 1.3, 1))); m.setColorAt(i, LED_OFF); });
    wheel.add(m); flagLights = { mesh: m, count: t.wheel.flags.length, key: "" };
  }
  // arms: from each shoulder to its glove's wrist (the glove turns with the wheel) – one skinned sleeve and the glove's
  // gauntlet each, sharing the arm's five bones (this car's own, the shapes shared): shoulder, elbow, half way down the
  // forearm, wrist, hand – placed by setWheels from the plan (placeArms), so the hands never leave the arms
  const arms = [1, -1].map((k) => {
    const L1 = BODY.uarm, L2 = BODY.farm, bones = [0, L1, L1 + L2 / 2, L1 + L2, L1 + L2].map((y) => { const b = new THREE.Bone(); b.position.set(0, y, 0); return b; });
    const sk = new THREE.SkinnedMesh(t.wheel.arm, suitMat); for (const b of bones) sk.add(b);
    sk.updateMatrixWorld(true); const skel = new THREE.Skeleton(bones); sk.bind(skel); sk.frustumCulled = false; sk.name = "arm";
    const gl = new THREE.SkinnedMesh(t.wheel.gauntlet, gloveMat); gl.bind(skel, sk.bindMatrix); gl.frustumCulled = false; gl.name = "gauntlet";
    near.add(sk, gl);
    return { k, mesh: sk, gauntlet: gl, bones, hand: hands[k > 0 ? 0 : 1], pose: armOut() };
  });
  // each wheel: its steer group w at the axle (turns about y – the fronts) holding the spin group s (rolls about x: the
  // parts that come off at a stop – tyre, band, rim, cover, nut) and, at the front, the corner mesh (drum, intake,
  // upright, caliper, disc, hub, 2022–25 deflector – steers, doesn't roll, stays on the car). The rears' corner parts
  // are in the body's carbon. One material for the corners: the carbon weave tinted by vertex colours (the intake's
  // dark mouth, the disc, the hub's metal)
  const cornerMat = mat("corner", () => skyLit(new THREE.MeshStandardMaterial({ color: 0xffffff, map: cm.colour, vertexColors: true, roughness: 0.45, metalness: 0 }), 0.35));
  const wheels = [], spins = [], corners = [];
  const FX = prof.W / 2 - prof.FW / 2, RX = prof.W / 2 - prof.RW / 2;
  for (const [x, z, kind] of [[FX, prof.FZ, "front"], [-FX, prof.FZ, "front"], [RX, prof.RZ, "rear"], [-RX, prof.RZ, "rear"]]) {
    const T = t[kind], left = x > 0;
    const w = new THREE.Group(); w.name = "wheel"; w.position.set(x, kind === "front" ? prof.FR : prof.RR, z);
    const s = new THREE.Group(); s.name = "spin"; w.add(s);
    s.add(new THREE.Mesh(T.tyre, tyreMat), new THREE.Mesh(T.band, bandMat), new THREE.Mesh(left ? T.lip : T.lipR, lipMat));
    const cv = new THREE.Mesh(left ? T.cover : T.coverR, coverMat); s.add(cv); fine.push(cv);
    let cn = null; if (T.corner) { cn = new THREE.Mesh(left ? T.corner : T.cornerR, cornerMat); cn.name = "corner"; w.add(cn); }
    g.add(w); wheels.push(w); spins.push(s); corners.push(cn);
  }
  const mounts = { tcam: new THREE.Vector3(...prof.tcam), eye: new THREE.Vector3(...prof.eye) };
  g.userData = { profile: prof, mounts, wheels, spins, corners, fwPivot, rwPivot, bandMat, near, fine, helmet, visor, wheel, arms, armPlan: t.wheel.plan, screen, screenShared: screenMat, lod: "near", compound: null, aero: 0, aeroOpen: t.aeroOpen,
    leds, flagLights, gloveFine, gloveLo, cockpit: false, bodySkin: [t.body, t.tubIn].filter(Boolean), wheelSpec: t.wheel.spec, paintMats: [paint, wingPaint, fwPaint, helmetMat], kitMat, bounds: { length: t.box.max.z - t.box.min.z, width: prof.W, height: t.box.max.y } };
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
// A wheel off the car at a pit stop (i in userData.wheels' order): only what comes off with a real wheel is hidden – its
// spin group (tyre, band, rim, cover, nut); the drum, intake, upright, caliper, disc, hub and the 2022–25 fence and
// arch stay (FIA 2022–25 Art. 3.13.1 / 3.13.7, 2026 C3.14 / C10.7.5 – research/corners.md). Before v0.43 the whole
// steer group was hidden.
export function setWheelOff(car, i, off) { const s = car.userData.spins[i]; if (s) s.visible = !off; }
export const wheelIsOn = (car, i) => car.userData.spins[i]?.visible !== false;
// the steering wheel's spec this car was built with (wheel3d.js)
export const wheelSpecOf = (car) => car.userData.wheelSpec || null;
// The car a cockpit camera rides in (on) or not: its gloves in full detail – fingers' grip print, seams
export function setCockpit(car, on) {
  const u = car.userData; if (!u.gloveFine || u.cockpit === on) return;
  u.cockpit = on; for (const m of u.gloveFine) m.visible = on; for (const m of u.gloveLo) m.visible = !on;
}
// The shift lights' colours (shiftlights.js ledState: a colour per light, null off) – painted only when they change
const LED_OFF = new THREE.Color("#15181b"), _lc = new THREE.Color();
export function setLeds(car, colours) {
  const L = car.userData.leds; if (!L) return false;
  const key = colours ? colours.join(",") : "";
  if (key === L.key) return false;
  L.key = key;
  for (let i = 0; i < L.count; i++) { const c = colours?.[i]; L.mesh.setColorAt(i, c ? _lc.set(c) : LED_OFF); }
  L.mesh.instanceColor.needsUpdate = true;
  return true;
}
// The FIA flag lights on the wheel: colour (hex) or null (off) – all of them alike (what race control's track state says
// for everybody; the per-car light-panel messages aren't in the feed)
const _one = new THREE.Vector3();
export function setFlagLights(car, colour) {
  const L = car.userData.flagLights; if (!L) return;
  const key = colour || ""; if (key === L.key) return; L.key = key;
  for (let i = 0; i < L.count; i++) L.mesh.setColorAt(i, colour ? _lc.set(colour) : LED_OFF);
  L.mesh.instanceColor.needsUpdate = true;
}
// How far the sidewall markings smear this frame (rad; wheelspin.js smearOf) – the wheel's look at speed
export function setSmear(car, smear) {
  const u = car.userData; u.smear = smear;
  const sm = u.bandMat.userData.smear; if (sm) sm.value = smear;
}
// Each arm from the plan (arms.js) at the wheel's angle – the left arm's at the angle, the right arm the left's mirror
// image at the opposite angle – rebuilt from the exact wrist of the turned wheel; the bones set in the arm mesh's frame
// (the car's): the shoulder bone along the upper arm, the elbow's along the forearm turned about the elbow's hinge only
// (both rolled a quarter turn: the forearm's neutral, thumb up), the half-way bone turned by half the forearm's twist,
// the wrist's by all of it (its x the hand's own across the forearm: the wrist bends, never twists), the hand's the
// glove's frame. The grip's small turn in the hand moves the glove on its pivot. Arrays and vectors reused – no
// allocation per frame.
const _M = new THREE.Matrix4(), _bx = [0, 0, 0], _bz = [0, 0, 0], _x2 = [0, 0, 0], _bp = [0, 0, 0], _ax = new THREE.Vector3(), _q = new THREE.Quaternion();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), Q90 = Math.PI / 2;
function setBone(b, k, p, x, y) {
  // (z = x × y; mirrored for the right arm: positions' x negated, the frame (−Mx, My, Mz) – a rotation again)
  const zx = x[1] * y[2] - x[2] * y[1], zy = x[2] * y[0] - x[0] * y[2], zz = x[0] * y[1] - x[1] * y[0];
  if (k > 0) { b.position.set(p[0], p[1], p[2]); _v1.set(x[0], x[1], x[2]); _v2.set(y[0], y[1], y[2]); _v3.set(zx, zy, zz); }
  else { b.position.set(-p[0], p[1], p[2]); _v1.set(x[0], -x[1], -x[2]); _v2.set(-y[0], y[1], y[2]); _v3.set(-zx, zy, zz); }
  b.quaternion.setFromRotationMatrix(_M.makeBasis(_v1, _v2, _v3));
}
const rollAbout = (v, k, a, o) => { const c = Math.cos(a), s = Math.sin(a), d = v[0] * k[0] + v[1] * k[1] + v[2] * k[2]; const x = k[1] * v[2] - k[2] * v[1], y = k[2] * v[0] - k[0] * v[2], z = k[0] * v[1] - k[1] * v[0]; o[0] = v[0] * c + x * s + k[0] * d * (1 - c); o[1] = v[1] * c + y * s + k[1] * d * (1 - c); o[2] = v[2] * c + z * s + k[2] * d * (1 - c); return o; };
function placeArms(u) {
  const plan = u.armPlan, a0 = u.wheel.rotation.z, up = plan.geo.grip.up;
  for (const A of u.arms) {
    const k = A.k, o = armFromPlan(plan, k * a0, A.pose), [b0, b1, b2, b3, b4] = A.bones, L2 = BODY.farm;
    rollAbout(o.H, o.A, Q90, _bx); setBone(b0, k, o.S, _bx, o.A);                          // upper arm (rolled a quarter turn)
    rollAbout(o.H, o.f, Q90, _bx); setBone(b1, k, o.E, _bx, o.f);                          // forearm at the elbow: the hinge's turn only
    _bp[0] = o.E[0] + o.f[0] * L2 / 2; _bp[1] = o.E[1] + o.f[1] * L2 / 2; _bp[2] = o.E[2] + o.f[2] * L2 / 2;
    twistedX(o, Q90 + (o.tau - Q90) / 2, _x2); setBone(b2, k, _bp, _x2, o.f);
    twistedX(o, o.tau, _x2); setBone(b3, k, o.W, _x2, o.f);                                // the forearm's end, turned with the hand
    setBone(b4, k, o.W, o.hx, o.hy);                                                        // the hand
    // the glove on its pivot: the grip's turn in the hand (the right hand's mirrored: about the mirrored axis, the other way)
    if (k > 0) _ax.set(up[0], up[1], up[2]); else _ax.set(-up[0], up[1], up[2]);
    A.hand.quaternion.copy(_q.setFromAxisAngle(_ax, k * (o.roll || 0)));
  }
}
// Level of detail: "near" (everything), "mid" (no cockpit interior, hands, steering wheel), "far" (also no wheel covers or
// lights; v0.43: the 2022–25 front fence and arch are in the corner mesh, at every level). The same model at every level: only small parts come and go.
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
  CAR_SKY.value = env ? 0 : 1;   // (v0.40: the shader's day sky only without an environment map – never both)
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
  // (front / rear: the wheel as it comes off – tyre, band, lip (rim, nut), cover – the left wheel's, outer face +x; a
  // carried wheel is turned, not mirrored, for the right side. The corner parts are not in it: they stay on the car)
  const off = (o) => ({ tyre: o.tyre, band: o.band, lip: o.lip, cover: o.cover });
  return { key: p.key, front: off(t.front), rear: off(t.rear), FR: p.FR, RR: p.RR, FW: p.FW, RW: p.RW, FZ: p.FZ, RZ: p.RZ, FX: p.W / 2 - p.FW / 2, RX: p.W / 2 - p.RW / 2, W: p.W };
}
export { loft, smoothSections, softBox, merge, boxAt };
