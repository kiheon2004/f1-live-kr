// People's bodies at close range: the proportions, the joint-to-joint skeleton and the shared shapes the pit crews,
// marshals, officials, pit wall people (crew.js) and the driver's arms and gloves in the cockpit (car3d.js) are made of.
//
// Proportions: segment lengths as fractions of stature H (Drillis & Contini 1966, as tabled in D. A. Winter,
// "Biomechanics and Motor Control of Human Movement", 4th ed. 2009, fig. 4.1 – the usual reference set; confidence M:
// population averages, any one person differs by a few cm): thigh (hip–knee) 0.245 H, shank (knee–ankle) 0.246 H,
// ankle height 0.039 H, foot 0.152 H × 0.055 H, upper arm 0.186 H, forearm 0.146 H, hand 0.108 H, hip joint height
// 0.530 H, shoulder height 0.818 H, chin 0.870 H, head (chin–vertex) 0.130 H, shoulder breadth 0.259 H, hip breadth
// 0.191 H. Breadths/depths of the trunk and head from the ANSUR II (US Army, 2012) male means, rounded (head 197 × 155
// mm, chest ~250 mm deep; M), plus ~1 cm of fireproof overalls. One stature for everybody: 1.78 m.
// Built from tapered limbs (a lathe profile: thick at the near joint, thin at the far one, a muscle's swell between)
// that end in spheres at the shoulders, elbows and knees – bending a joint never opens a gap or stretches a part, and no
// part changes length between poses (the skeleton's bones are constants). Not skinned: rigid parts, one instanced mesh
// per part for everybody (crew.js) – cheap enough for a full pit lane.
import * as THREE from "./vendor/three.module.js";

export const STATURE = 1.78;
const H = STATURE;
export const BODY = {
  thigh: 0.245 * H, shank: 0.246 * H, ankle: 0.039 * H, uarm: 0.186 * H, farm: 0.146 * H, hand: 0.108 * H,
  grip: 0.045 * H,                 // wrist → the middle of a closed fist (~0.42 of the hand's length)
  hipZ: 0.05 * H,                  // half the distance between the hip joints' centres (~0.09 m)
  shoulderZ: 0.107 * H,            // half the distance between the shoulder joints (~0.19 m: 0.259 H across the acromia, less the joint's depth)
  lumbar: 0.062 * H,               // hip joints → the low back's bending point (~0.11 m)
  chestShoulder: 0.226 * H,        // that point → the shoulder joints (0.818 H − 0.530 H − lumbar)
  neck: 0.253 * H,                 // that point → the base of the skull's pivot (neck), 0.06 m above the shoulders
  headC: 0.085 * H,                // neck pivot → the head's centre (its top then at ~1.0 H)
  footFront: 0.125 * H, footBack: 0.042 * H,   // the shoe's toe and heel from the ankle (0.152 H long, plus the shoe)
};
// joint sphere radii (with the overalls) – the limbs' ends meet these exactly
export const JOINT_R = { shoulder: 0.056, elbow: 0.045, knee: 0.06 };

// A limb along +y from its near joint (y 0) to its far one (y = len): radius r0 → r1 with a swell (+bulge at `at` of the
// length), the cross-section an ellipse (depth × the width); closed at both ends (the joint spheres cover them).
export function limbGeometry(len, r0, r1, bulge = 0, at = 0.35, depth = 1, seg = 10, rings = 7) {
  const pts = [new THREE.Vector2(0, -0.005)];
  for (let i = 0; i <= rings; i++) { const t = i / rings, sw = bulge * Math.exp(-(((t - at) / 0.32) ** 2)); pts.push(new THREE.Vector2(r0 + (r1 - r0) * t + sw, t * len)); }
  pts.push(new THREE.Vector2(0, len + 0.005));
  const g = new THREE.LatheGeometry(pts, seg); if (depth !== 1) g.scale(depth, 1, 1);
  return g;
}
// A trunk part from a profile [[y, half-width]] about +y, depth/width `depth`, closed at both ends
export function trunkGeometry(profile, depth = 0.7, seg = 14) {
  const pts = [new THREE.Vector2(0, profile[0][0]), ...profile.map(([y, r]) => new THREE.Vector2(r, y)), new THREE.Vector2(0, profile[profile.length - 1][0])];
  return new THREE.LatheGeometry(pts, seg).scale(depth, 1, 1);
}
// The chest (from the low back's bending point up to the neck's base: waist 0.27 m wide, chest 0.33 m at the armpits,
// sloping to the neck) and the pelvis (from that point down past the hip joints, 0.34 m across the hips) – each
// overlapping the other by 6 cm so a bend at the waist shows a crease, not a gap (0.30 m across the hips with the
// thighs' tops beside it)
export const chestGeometry = () => trunkGeometry([[-0.06, 0.118], [0, 0.13], [0.1, 0.136], [0.22, 0.154], [0.31, 0.164], [0.37, 0.157], [0.415, 0.127], [0.445, 0.07], [0.455, 0.03]], 0.68, 16);
export const pelvisGeometry = () => trunkGeometry([[-0.22, 0.03], [-0.2, 0.09], [-0.16, 0.138], [-0.11, 0.152], [-0.05, 0.146], [0, 0.132], [0.06, 0.116]], 0.64, 16);
// the four limbs, each from its near joint (radii with the overalls; the calf's and the forearm's swell)
export const LIMB_GEO = {
  thigh: () => limbGeometry(BODY.thigh, 0.082, JOINT_R.knee - 0.002, 0.006, 0.25, 0.95, 12),
  shin: () => limbGeometry(BODY.shank, JOINT_R.knee - 0.003, 0.038, 0.009, 0.28, 0.92, 12),
  uarm: (seg = 10) => limbGeometry(BODY.uarm, JOINT_R.shoulder - 0.006, JOINT_R.elbow - 0.002, 0.005, 0.4, 0.92, seg),
  farm: (seg = 10) => limbGeometry(BODY.farm, JOINT_R.elbow - 0.003, 0.032, 0.006, 0.22, 0.85, seg),
};
// The shoe: from the ankle joint (origin), its sole flat at −ankle height, the toe ahead (+x), the heel behind, its
// top over the ankle (the shin ends inside it)
export function shoeGeometry() {
  const L = BODY.footFront + BODY.footBack, g = new THREE.SphereGeometry(1, 14, 8);
  g.scale(L / 2 + 0.01, 0.07, 0.054); g.translate((BODY.footFront - BODY.footBack) / 2, -0.035, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < -BODY.ankle) y = -BODY.ankle;                                  // the sole flat
    if (x > 0.1) { const k = Math.min(1, (x - 0.1) / 0.13); z *= 1 - 0.28 * k; if (y > -0.03) y -= 0.03 * k; }   // toe narrower and lower
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals(); return g;
}
// A fist round a handle: the hand from the wrist (origin) along +y, the handle's axis along x through (0, grip, 0)
// – the palm behind it (−z), four fingers wrapped over and round it, the thumb across the other way, a cuff at the
// wrist. fine: the fingers (close up); else a mitten of the same size (mid distance).
export function fistGeometry(fine = true, handle = 0.016) {
  const G = BODY.grip, parts = [];
  // the glove's cuff over the wrist: a short rounded sleeve (the forearm ends inside it)
  parts.push(limbGeometry(0.06, 0.036, 0.033, 0.002, 0.5, 0.85, fine ? 14 : 8, 3).translate(0, -0.035, 0));
  if (!fine) { parts.push(new THREE.SphereGeometry(1, 10, 8).scale(0.044, 0.06, 0.034).translate(0, G - 0.012, -0.004)); return mergeSimple(parts); }
  // palm and the back of the hand: a rounded block from the wrist to the knuckles behind the handle
  parts.push(new THREE.SphereGeometry(1, 14, 10).scale(0.042, 0.05, 0.024).translate(0, G - 0.032, -handle - 0.012));
  // fingers: arcs round the handle (index to little finger along x, each a little thinner), over its far side and
  // round to its front, the knuckles a ridge where they leave the hand
  const fr = 0.0088, R = handle + fr * 0.9;
  [[-0.026, 1.0], [-0.0085, 1.03], [0.009, 0.98], [0.0255, 0.86]].forEach(([x, s]) => {
    parts.push(new THREE.TorusGeometry(R, fr * s, 8, 14, Math.PI * 1.3).rotateY(Math.PI / 2).translate(x, G, 0));
    parts.push(new THREE.SphereGeometry(fr * s * 1.12, 8, 6).translate(x, G, -R));
  });
  // the thumb: along the front of the handle, across the fingers' tips
  parts.push(new THREE.CapsuleGeometry(0.0098, 0.038, 4, 10).rotateZ(Math.PI / 2 - 0.35).translate(-0.006, G - 0.014, handle + 0.016));
  return mergeSimple(parts);
}
// A full-face helmet (pit crews: team-coloured shells, dark visors – F1 media photos 2024–25) about the head's centre,
// facing +x: a shell a little longer than wide, the chin bar forward and low; its visor a band across the eyes
export function helmetGeometry() {
  const g = new THREE.SphereGeometry(1, 18, 12); g.scale(0.148, 0.152, 0.128);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); if (y < -0.03 && x > 0) p.setX(i, x + 0.025 * Math.min(1, (-0.03 - y) / 0.08)); if (y < -0.12) p.setY(i, -0.12 - (y + 0.12) * 0.4); }
  g.computeVertexNormals(); return g;
}
export function visorGeometry() {
  // (the face opening's whole height, brow to chin bar – the eye protection the rules require, tinted: F1 stop photos
  // 2023–25; v0.39's narrow band read as a toy's)
  return new THREE.SphereGeometry(1, 18, 6, Math.PI - 1.0, 2.0, 1.05, 0.78).scale(0.154, 0.158, 0.134);
}
// bare head (pit wall people): 0.197 × 0.155 m, 0.231 m chin to the top; hair over its top and back
// (v0.40: the jaw narrowed under the cheekbones, a nose and ears – an egg alone read as a doll's head close by)
export function headGeometry() {
  const g = new THREE.SphereGeometry(1, 16, 12).scale(0.099, 0.116, 0.078), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = Math.min(1, Math.max(0, (-0.01 - y) / 0.09)); p.setZ(i, p.getZ(i) * (1 - 0.22 * k)); if (p.getX(i) < 0) p.setX(i, p.getX(i) * (1 - 0.12 * k)); }
  g.computeVertexNormals();
  const nose = new THREE.ConeGeometry(0.016, 0.045, 8).rotateZ(Math.PI).scale(1, 1, 0.9).rotateZ(0.32).translate(0.097, -0.012, 0);
  const ears = [1, -1].map((sd) => new THREE.SphereGeometry(1, 8, 6).scale(0.018, 0.03, 0.01).translate(-0.004, 0.0, sd * 0.077));
  return mergeSimple([g, nose, ...ears]);
}
export const hairGeometry = () => new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, 1.25).scale(0.103, 0.12, 0.082).translate(-0.006, 0.004, 0);

// geometries (position + normal) into one
export function mergeSimple(gs) {
  const pos = [], nor = [];
  for (const g0 of gs) { const g = g0.index ? g0.toNonIndexed() : g0; for (const v of g.attributes.position.array) pos.push(v); for (const v of g.attributes.normal.array) nor.push(v); if (g !== g0) g.dispose(); g0.dispose(); }
  const m = new THREE.BufferGeometry(); m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); m.computeBoundingSphere();
  return m;
}

// Two-bone reach (an arm or a leg): from the root S to the target T with bones L1, L2; the middle joint bent towards
// the pole direction. Writes the middle joint into mid and the end (T, or as near as the bones reach) into end
// (arrays [x, y, z]); returns how far the end stays from T (0 when reached: beyond the bones' reach, or inside the
// nearest a folded limb can come, |L1 − L2|). Both bones always keep their lengths.
// v0.39 lost them when the pole lay along the line to the target (a target straight ahead with the pole ahead too: an
// arm of 0.33 + 0.26 m drawn 0.25 + 0.15 m – the fallback across the line was zero for a line along z) or the target
// sat on the root, and it reported 0 for a target inside the folded reach. Now the elbow's (knee's) side comes from the
// pole's part across the line, blended – as that part shrinks towards nothing (a pole along the line, either way) –
// into a steady fallback: `hint` (e.g. last frame's middle joint, so a joint never flips between frames), else the
// world axis most across the line. Near-parallel inputs therefore give nearly the same joint as exactly parallel ones.
export const REACH_BLEND = 0.25;   // the pole's part across the line (of its length) under which the fallback blends in
const _rf = [0, 0, 0];
export function reach2(S, T, L1, L2, pole, mid, end, hint = null) {
  let dx = T[0] - S[0], dy = T[1] - S[1], dz = T[2] - S[2];
  const d0 = Math.hypot(dx, dy, dz);
  // the line's direction: to the target; with the target on the root, across the pole (any way the limb can fold)
  if (d0 > 1e-9) { dx /= d0; dy /= d0; dz /= d0; }
  else { acrossOf(pole, 0, 1, 0, _rf); dx = _rf[0]; dy = _rf[1]; dz = _rf[2]; }
  const lo = Math.abs(L1 - L2), hi = L1 + L2, d = Math.min(hi, Math.max(lo, d0));
  const a = d > 1e-9 ? (L1 * L1 - L2 * L2 + d * d) / (2 * d) : 0, h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  // the pole's part across the line, and the fallback blended in as it vanishes
  const pl = Math.hypot(pole[0], pole[1], pole[2]) || 1, pd = (pole[0] * dx + pole[1] * dy + pole[2] * dz) / pl;
  let mx = pole[0] / pl - pd * dx, my = pole[1] / pl - pd * dy, mz = pole[2] / pl - pd * dz;
  const ml = Math.hypot(mx, my, mz);
  if (ml < REACH_BLEND) {
    if (hint) { _rf[0] = hint[0] - S[0]; _rf[1] = hint[1] - S[1]; _rf[2] = hint[2] - S[2]; }
    const hd = hint ? _rf[0] * dx + _rf[1] * dy + _rf[2] * dz : 0;
    let fx = hint ? _rf[0] - hd * dx : 0, fy = hint ? _rf[1] - hd * dy : 0, fz = hint ? _rf[2] - hd * dz : 0, fl = Math.hypot(fx, fy, fz);
    if (fl < 1e-6) { acrossOf([dx, dy, dz], 0, 0, 0, _rf); fx = _rf[0]; fy = _rf[1]; fz = _rf[2]; fl = 1; }
    const k = REACH_BLEND - ml;   // (linear: the joint swings round evenly as the pole's part shrinks, never in a snap)
    mx += (fx / fl) * k; my += (fy / fl) * k; mz += (fz / fl) * k;
  }
  let nl = Math.hypot(mx, my, mz);
  if (nl < 1e-9) { acrossOf([dx, dy, dz], 0, 0, 0, _rf); mx = _rf[0]; my = _rf[1]; mz = _rf[2]; nl = 1; }   // (pole and fallback cancelled out)
  mid[0] = S[0] + dx * a + (mx / nl) * h; mid[1] = S[1] + dy * a + (my / nl) * h; mid[2] = S[2] + dz * a + (mz / nl) * h;
  end[0] = S[0] + dx * d; end[1] = S[1] + dy * d; end[2] = S[2] + dz * d;
  return Math.abs(d0 - d);
}
// a unit vector square to v (written into out): the preferred axis (px, py, pz) – else world up, else x – taken while it
// is clearly across v (|cos| < 0.9), its part across v; the same for the same v every time (a deterministic choice, not
// the previous frame's), and the same axis over the whole range around a pole's line (no switch at the exact centre)
function acrossOf(v, px, py, pz, out) {
  const vl = Math.hypot(v[0], v[1], v[2]) || 1, x = v[0] / vl, y = v[1] / vl, z = v[2] / vl;
  let ax = px, ay = py, az = pz;
  if (ax * ax + ay * ay + az * az < 0.5 || Math.abs(ax * x + ay * y + az * z) >= 0.9) { ax = 0; ay = 1; az = 0; }
  if (Math.abs(y * ay + x * ax + z * az) >= 0.9) { ax = 1; ay = 0; az = 0; }
  const dd = ax * x + ay * y + az * z; let ox = ax - dd * x, oy = ay - dd * y, oz = az - dd * z; const ol = Math.hypot(ox, oy, oz) || 1;
  out[0] = ox / ol; out[1] = oy / ol; out[2] = oz / ol; return out;
}

// ---------- the driver's hands and arms up close (v0.40) ----------
// v0.39's cockpit gloves were the crews' fist (torus fingers round a thin handle, a capsule thumb) scaled onto the
// wheel's 47 mm grips, the same LEFT hand turned round for both sides (its thumb on the wrong side of the right hand),
// and the arms three rigid parts with a ball at the elbow. Now:
//   driverGlove(handleR): a gloved LEFT hand closed round a grip of radius handleR, in fistGeometry's frame (wrist at the
//   origin, +y to the grip's centre at BODY.grip, the grip's axis along x – index finger at −x –, the palm at −z). Each
//   finger is three phalanges (gloved lengths from hand-anthropometry tables – Garrett 1971 / Buryanov & Kotiuk 2010 –
//   scaled to a 1.78 m man; M), laid round the grip as a chain whose every phalanx is tangent to it (the pad touching,
//   never through it): the knuckles stand off the grip, the tips curl round its far side. The thumb lies across the
//   grip's face (the wheel's face side). The palm's grip panels and finger pads darker (silicone print on the palm of
//   race gloves – FIA 8856-2018 gloves, maker photos; M), a seam ring at each finger joint, the gauntlet cuff with its
//   strap. Vertex colours (white = the glove's colour; the material's colour tints them).
//   For the other hand, mirror it (mirrorGlove) – never turn it round.
//   armSkin(): one sleeve per arm (shoulder → wrist, the elbow's crease blended over ±5 cm) skinned to three bones –
//   no ball at the elbow, no rigid parts turning against each other.
// v0.41: the grip lies across the palm obliquely, as in any closed power grip – from the heel of the hand at the little
// finger's side to the index finger's base (Napier 1956; the handle ~70–80° to the forearm with the wrist straight –
// GLOVE.oblique): the palm, the thumb's base and the wrist are turned that much about the palm's normal round the
// knuckles, the fingers still wrap square round the grip. The gauntlet cuff is no longer part of the hand: it is skinned
// to the arm (gauntletSkin) – to the forearm and to the hand – so it bends over the wrist instead of standing at an angle
// on the sleeve's end; the hand's own axes and its wrist joint's centre are in the glove's userData (hand, wrist).
// The sleeve: five bones (shoulder, elbow, half way down the forearm, wrist, hand) – the forearm's turn shared out along
// it, the elbow a hinge.
// v0.44: the driver's kit in zones (KIT_ZONE) – each part's triangles carry their zone in the uv's u (a texel of the kit's
// palette: kit.js), so one material per kit draws the glove's fabric, its back-of-hand panel, knuckles, seams, palm print,
// cuff, the suit's sleeve and the harness each in its own colour and finish – the geometry shared by every team, the
// colours the team's (no glove taking the car's body colour whole, v0.43's l.glove || l.base). Neighbouring zones along a
// part (sleeve – seam, sleeve – cuff, gauntlet – band – hem) are neighbouring texels: a triangle across a border never
// samples a third zone's colour. Vertex colours stay (white: the zone's colour as it is).
export const KIT_ZONE = { fabric: 0, back: 1, knuckle: 2, seam: 3, palm: 4, band: 5, gauntlet: 6, hem: 7, suitSeam: 8, suit: 9, suitCuff: 10, webbing: 11, webEdge: 12, buckle: 13, buckleCap: 14, adjuster: 15 };
export const KIT_TEXELS = 16;
export const kitU = (z) => (z + 0.5) / KIT_TEXELS;
// every vertex of g in zone z (white vertex colours)
export function kitZone(g, z) {
  const n = g.attributes.position.count;
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2).fill(0.5).map((v, i) => (i & 1 ? 0.5 : kitU(z))), 2));
  if (!g.attributes.color) g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}
export const GLOVE = {
  // phalanx lengths (m, gloved, proximal → distal) and radii, index → little; their places along the grip (x)
  fingers: [
    { x: -0.0275, L: [0.042, 0.025, 0.021], r: 0.0093 },
    { x: -0.0085, L: [0.046, 0.029, 0.023], r: 0.0096 },
    { x: 0.0105, L: [0.043, 0.027, 0.022], r: 0.0092 },
    { x: 0.0285, L: [0.034, 0.021, 0.019], r: 0.0082 },
  ],
  knuckle: 0.62,   // where the knuckles sit round the grip (rad from straight behind it, towards +y)
  pad: 0.32,       // the darker grip print's shade
  // the grip across the palm: the hand's long axis turned this far (20°) from square to the grip, its heel towards the
  // little finger's end (the power grip's handle lies obliquely across the palm, hypothenar → index – Napier 1956 (H for
  // the grip, no angle given); pistol-grip handle angles 80° (Fraser 1980) – 100° (Mital & Kilbom) to the forearm, i.e.
  // 10–20° off square (secondary text; M) – v0.41 research/wrist.md)
  oblique: 0.35,
};
export function driverGlove(handleR = 0.0235, fine = 1) {
  const G = BODY.grip, parts = [], seg = fine ? 12 : 6;
  const shade = (g, z) => kitZone(g, z);
  const capsule = (A, B, r, k = KIT_ZONE.fabric) => {
    const d = new THREE.Vector3().subVectors(B, A), len = d.length();
    const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), fine ? 4 : 2, seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    return shade(g, k);
  };
  // the fingers: in the plane across the grip at their x, from the knuckle round the grip – each phalanx along the
  // tangent from its base joint to the circle its pad touches (radius: grip + finger)
  const tips = [];
  for (const f of GLOVE.fingers) {
    const c = handleR + f.r;
    let a = GLOVE.knuckle, d = c + 0.006;
    let P = new THREE.Vector3(f.x, G + d * Math.sin(a), -d * Math.cos(a));
    const joints = [P.clone()];
    for (const L of f.L) {
      const q = Math.hypot(P.y - G, P.z), al = Math.atan2(P.y - G, -P.z), th = al + Math.acos(Math.min(1, c / q));
      const T = new THREE.Vector3(f.x, G + c * Math.sin(th), -c * Math.cos(th)), u = T.sub(P);
      const ul = u.length() || 1; u.multiplyScalar(1 / ul);
      // (a phalanx shorter than the way to its tangent point stops short of the grip: it ends there, not through it)
      P = P.clone().addScaledVector(u, L); joints.push(P.clone());
    }
    for (let i = 0; i < 3; i++) {
      const r = f.r * (1 - 0.07 * i);
      parts.push(capsule(joints[i], joints[i + 1], r));
      // the pad – the half facing the grip – in the darker print: a thin capsule pressed onto that side (close up only)
      const mid = joints[i].clone().lerp(joints[i + 1], 0.5), toAxis = new THREE.Vector3(0, G - mid.y, -mid.z).normalize();
      if (fine) parts.push(capsule(joints[i].clone().addScaledVector(toAxis, r * 0.25), joints[i + 1].clone().addScaledVector(toAxis, r * 0.25), r * 0.72, KIT_ZONE.palm));
      // (the seam rings on the light glove too – v0.45: v0.44 drew them on the fine one only, so a colour only the seams
      // carry (Haas' white piping, the readable look's team colour) vanished whenever the light pair showed; there one
      // coarse ring a finger, at its first joint – 36 triangles: the car's 60k budget, test/car.test.js)
      if (fine ? i < 2 : i === 0) { const s = new THREE.TorusGeometry(r * 1.01, 0.0011, fine ? 4 : 3, fine ? seg : 6); s.lookAt(new THREE.Vector3().subVectors(joints[i + 1], joints[i])); s.translate(joints[i + 1].x, joints[i + 1].y, joints[i + 1].z); parts.push(shade(s, KIT_ZONE.seam)); }
    }
    tips.push(joints[3]);
  }
  // the palm: from the wrist to the knuckles behind the grip, wider at the knuckles, its front (+z, against the grip) in
  // the grip print; the back of the hand rounded; the thenar (thumb's base) bulging at the index side by the wrist
  const kn = GLOVE.fingers.map((f) => { const d = handleR + f.r + 0.006; return new THREE.Vector3(f.x, G + d * Math.sin(GLOVE.knuckle), -d * Math.cos(GLOVE.knuckle)); });
  const palmTop = (kn[0].y + kn[3].y) / 2, palmZ = -(handleR + 0.0205);
  // (the hand's heel turned towards the little finger's end of the grip by GLOVE.oblique about the palm's normal, round
  // the knuckles' line: what's built below along +y from the wrist is turned with it)
  const ob = GLOVE.oblique, co = Math.cos(ob), so = Math.sin(ob), turn = (v) => { const x = v.x, y = v.y - palmTop; v.x = x * co - y * so; v.y = palmTop + x * so + y * co; return v; };
  const turnGeo = (g) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const v = turn(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))); p.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals(); return g; };
  const palm = new THREE.SphereGeometry(1, seg + 4, fine ? seg : 8); palm.scale(0.043, (palmTop + 0.004) / 2, 0.019);
  { const p = palm.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), t = Math.max(0, Math.min(1, y / ((palmTop + 0.004) / 2) * 0.5 + 0.5)); p.setX(i, p.getX(i) * (0.74 + 0.26 * t)); } }
  palm.translate(0.001, (palmTop + 0.004) / 2 - 0.002, palmZ); turnGeo(palm);
  // (v0.44: the back of the hand – the side away from the grip, from a little above the wrist to the knuckles – its own
  // panel (most race gloves have one, in the team's second colour or the fabric's: kit.js); per triangle, by its middle)
  parts.push(backPanel(palm.toNonIndexed(), palmZ - 0.006, 0.012, palmTop)); palm.dispose();
  const print = new THREE.SphereGeometry(1, seg, 6, 0, Math.PI * 2, 0, Math.PI / 2); print.rotateX(Math.PI / 2); print.scale(0.036, (palmTop - 0.01) / 2, 0.012);
  print.translate(0.002, (palmTop - 0.01) / 2 + 0.006, palmZ + 0.008); turnGeo(print); parts.push(shade(print, KIT_ZONE.palm));
  // knuckle ridge (the glove's padding over the knuckles)
  parts.push(capsule(kn[0].clone().add(new THREE.Vector3(-0.004, 0, -0.004)), kn[3].clone().add(new THREE.Vector3(0.004, 0, -0.004)), 0.0105, KIT_ZONE.knuckle));
  const thenar = new THREE.SphereGeometry(1, seg, 8); thenar.scale(0.02, 0.03, 0.017); thenar.translate(-0.025, 0.032, palmZ + 0.009); turnGeo(thenar); parts.push(shade(thenar, KIT_ZONE.fabric));
  // the thumb: from its base at the palm's index edge round the grip's wrist side (−y: the wheel's face, towards the
  // driver) to its inner side, over the index finger's tip – a closed hand's thumb on a wheel's grip (onboard footage:
  // the thumbs on the wheel's face by the grips' tops). Its joints on a circle round the grip (the grip's radius + the
  // thumb's): no part of it inside the grip
  const ct = handleR + 0.0128, at = (x, th) => new THREE.Vector3(x, G + ct * Math.sin(th), -ct * Math.cos(th));
  const t0 = turn(new THREE.Vector3(-0.03, 0.034, palmZ + 0.006)), t1 = at(-0.036, -1.75), t2 = at(-0.031, -2.55), t3 = at(-0.022, -3.05);
  parts.push(capsule(t0, t1, 0.0125), capsule(t1, t2, 0.0112), capsule(t2, t3, 0.0102));
  if (fine) parts.push(capsule(t1.clone().lerp(t2, 0.1).add(new THREE.Vector3(0, 0, -0.004)), t2.clone().lerp(t3, 0.9).add(new THREE.Vector3(0, 0, -0.004)), 0.0075, KIT_ZONE.palm));
  // (the gauntlet cuff and its strap: on the arm since v0.41 – gauntletSkin – bending over the wrist with it)
  const out = mergeColoured(parts);
  out.userData.tips = tips.map((v) => v.toArray());
  // the hand's axes (x towards the little finger, y wrist → knuckles, z out of the palm – towards the grip) and its
  // wrist joint's centre: in the hand's middle between palm and back, a centimetre before the heel of the palm
  out.userData.hand = [[co, so, 0], [-so, co, 0], [0, 0, 1]];
  out.userData.wrist = turn(new THREE.Vector3(0, -0.01, palmZ + 0.004)).toArray();
  // the thumb's chain (its joints and radii, the glove's frame) – kept off the wheel's buttons and drums (arms.js)
  out.userData.thumb = { pts: [t0, t1, t2, t3].map((v) => v.toArray()), r: [0.0125, 0.0112, 0.0102] };
  return out;
}
// a non-indexed hand's palm block with the back of the hand's panel: triangles whose middle lies behind z0 (away from the
// grip) and from y0 above the wrist to the knuckles' line top in KIT_ZONE.back, the rest the fabric
function backPanel(g, z0, y0, top) {
  const P = g.attributes.position, n = P.count, uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i += 3) {
    let y = 0, z = 0; for (let k = 0; k < 3; k++) { y += P.getY(i + k) / 3; z += P.getZ(i + k) / 3; }
    const u = kitU(z < z0 && y > y0 && y < top ? KIT_ZONE.back : KIT_ZONE.fabric);
    for (let k = 0; k < 3; k++) { uv[(i + k) * 2] = u; uv[(i + k) * 2 + 1] = 0.5; }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}
// the other hand: the glove mirrored across its own x (the grip's axis) – a right hand from the left one, the winding
// turned so its faces still face out
export function mirrorGlove(g) {
  const m = g.clone(); m.scale(-1, 1, 1);
  const p = m.attributes.position.array, n = m.attributes.normal?.array, c = m.attributes.color?.array, uv = m.attributes.uv?.array;
  for (let i = 0; i < p.length; i += 9) for (const a of [p, n, c]) if (a) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
  if (uv) for (let i = 0; i < uv.length; i += 6) for (let k = 0; k < 2; k++) { const t = uv[i + 2 + k]; uv[i + 2 + k] = uv[i + 4 + k]; uv[i + 4 + k] = t; }
  m.computeVertexNormals();
  return m;
}
// geometries (position, normal, color) into one, non-indexed
function mergeColoured(gs) {
  const pos = [], nor = [], col = [], uvs = [];
  for (const g0 of gs) {
    const g = g0.index ? g0.toNonIndexed() : g0, c = g.attributes.color, uv = g.attributes.uv;
    for (const v of g.attributes.position.array) pos.push(v); for (const v of g.attributes.normal.array) nor.push(v);
    for (let i = 0; i < g.attributes.position.count; i++) { c ? col.push(c.getX(i), c.getY(i), c.getZ(i)) : col.push(1, 1, 1); uv ? uvs.push(uv.getX(i), uv.getY(i)) : uvs.push(kitU(KIT_ZONE.fabric), 0.5); }
    if (g !== g0) g.dispose(); g0.dispose();
  }
  const m = new THREE.BufferGeometry(); m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  m.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  m.computeBoundingSphere(); return m;
}
// One sleeve from the shoulder (origin) along +y to the wrist (uarm + farm), the upper arm's and the forearm's swell,
// skinned to the arm's bones (ARM_BONES: 0 shoulder, 1 elbow at +uarm, 2 half way down the forearm, 3 wrist, 4 the hand
// – all at their joints along +y in the bind pose, the straight arm): the elbow's crease blended over ±ARM_BLEND – a bent
// elbow folds the sleeve, no ball and no gap – and the forearm shared out between the elbow, the half-way and the wrist
// bones, so its turn (pronation, set on bones 2 and 3) twists the sleeve evenly along it, never all at the wrist. The race
// suit's sleeve: a seam down its inside and a knitted cuff ring at the wrist (vertex colours as driverGlove); it stops
// 4.5 cm short of the wrist, inside the glove's gauntlet (which reaches 8.5 cm up the forearm).
export const ARM_BLEND = 0.05;
export const ARM_BONES = 5;
export function armSkin(fine = 1) {
  const L1 = BODY.uarm, L2 = BODY.farm, len = L1 + L2 - 0.045, rings = fine ? 24 : 16, seg = fine ? 16 : 10;
  // (the forearm narrowing to the wrist's ~17 cm round – a radius of ~27 mm with the suit – over its last 6 cm, so its
  // end fits inside the gauntlet's cuff)
  const radius = (y) => {
    if (y < L1) { const t = y / L1; return 0.054 - 0.012 * t + 0.006 * Math.exp(-(((t - 0.45) / 0.25) ** 2)); }
    const t = (y - L1) / L2, r = 0.043 - 0.012 * t + 0.006 * Math.exp(-(((t - 0.25) / 0.25) ** 2)), e = Math.max(0, Math.min(1, (y - (L1 + L2 - 0.105)) / 0.06));
    return r + (0.0255 - r) * e * e * (3 - 2 * e);
  };
  const pos = [], idx = [], skI = [], skW = [], col = [], uvs = [];
  for (let i = 0; i <= rings; i++) {
    // (rings closer together round the elbow, where it bends)
    const u = i / rings, y = u < 0.5 ? L1 * Math.pow(u * 2, 0.8) : L1 + (len - L1) * (1 - Math.pow(1 - (u - 0.5) * 2, 0.8));
    const r = radius(y), w1 = y <= L1 - ARM_BLEND ? 0 : y >= L1 + ARM_BLEND ? 1 : (() => { const t = (y - (L1 - ARM_BLEND)) / (2 * ARM_BLEND); return t * t * (3 - 2 * t); })();
    // (along the forearm: elbow → half way → wrist, linearly – each pair of bones at most half the turn apart)
    const tf = Math.max(0, Math.min(1, (y - L1) / L2)), e1 = tf < 0.5 ? 1 - 2 * tf : 0, e2 = tf < 0.5 ? 2 * tf : 2 - 2 * tf, e3 = tf < 0.5 ? 0 : 2 * tf - 1;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9;
      pos.push(x, y, z); skI.push(0, 1, 2, 3); skW.push(1 - w1, w1 * e1, w1 * e2, w1 * e3);
      // (v0.44: the seam and the knitted cuff their own zones – the suit's colours, kit.js)
      const seam = Math.abs(Math.sin(a) - 1) < 0.02, cuff = y > len - 0.025;
      col.push(1, 1, 1); uvs.push(kitU(cuff ? KIT_ZONE.suitCuff : seam ? KIT_ZONE.suitSeam : KIT_ZONE.suit), 0.5);
    }
  }
  for (let i = 0; i < rings; i++) for (let k = 0; k < seg; k++) { const a = i * (seg + 1) + k, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skI, 4)); g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skW, 4));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// The glove's gauntlet: from 7.5 cm up the forearm (over the sleeve's end) across the wrist to the heel of the hand,
// skinned to the wrist bone (3: the forearm's end, turned with it) and the hand (4) and blended between them over ±2 cm
// round the wrist joint – the cuff bends with the wrist and its end meets the palm and the back of the hand. Its section
// an oval wider across (the wrist's ~6 × 4 cm plus the glove), flared at its open end to go over the sleeve; the strap a
// darker band, the open end's hem a lighter one. In the bind pose along +y with the wrist joint at uarm + farm; x across
// the hand (the little finger's side), z towards the palm; symmetric in x (the right arm uses it mirrored by its bones).
// FIA 8856-2018 (rev. 2024-06-11): the glove's cuff at least 80 mm long, tight at the wrist, the wrist always under two
// layers (H); the gauntlet goes over the suit's knitted cuff (2025 driver photos; M); most current gloves strapless, an
// elastic band at the wrist (M) – drawn as the darker band.
export function gauntletSkin(fine = 1) {
  const W = BODY.uarm + BODY.farm, y0 = W - 0.085, y1 = W + 0.03, rings = fine ? 9 : 6, seg = fine ? 12 : 10, B = 0.02;
  // half width (x) and half depth (z) along it: flared open end → the wrist's narrowest → the heel of the hand
  const prof = (y) => {
    const t = (y - y0) / (y1 - y0);
    const hw = 0.0385 - 0.0075 * Math.min(1, t / 0.62) + 0.003 * Math.max(0, (t - 0.72) / 0.28);
    const hd = 0.034 - 0.0125 * Math.min(1, t / 0.62) - 0.003 * Math.max(0, (t - 0.72) / 0.28);
    return [hw, hd];
  };
  const pos = [], idx = [], skI = [], skW = [], col = [], uvs = [];
  // (rings evenly along it, plus a pair at each edge of the hem and the band – their shade changes there, sharp, not
  // smeared over a whole ring's length into a saw-tooth)
  const ys = Array.from({ length: rings + 1 }, (_, i) => y0 + ((y1 - y0) * i) / rings);
  for (const e of [y0 + 0.008, W - 0.048, W - 0.026]) ys.push(e - 0.0004, e + 0.0004);
  ys.sort((a, b) => a - b);
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i], [hw, hd] = prof(y);
    const w4 = y <= W - B ? 0 : y >= W + B ? 1 : (() => { const t = (y - (W - B)) / (2 * B); return t * t * (3 - 2 * t); })();
    const zone = y < y0 + 0.008 ? KIT_ZONE.hem : y > W - 0.048 && y < W - 0.026 ? KIT_ZONE.band : KIT_ZONE.gauntlet;   // (hem, strap, the gauntlet)
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * hw, y, Math.sin(a) * hd); skI.push(3, 4, 0, 0); skW.push(1 - w4, w4, 0, 0); col.push(1, 1, 1); uvs.push(kitU(zone), 0.5);
    }
  }
  for (let i = 0; i < ys.length - 1; i++) for (let k = 0; k < seg; k++) { const a = i * (seg + 1) + k, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skI, 4)); g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skW, 4));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
