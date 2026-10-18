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
  return new THREE.SphereGeometry(1, 16, 4, Math.PI - 0.95, 1.9, 1.2, 0.5).scale(0.153, 0.157, 0.133);
}
// bare head (pit wall people): 0.197 × 0.155 m, 0.231 m chin to the top; hair over its top and back
export const headGeometry = () => new THREE.SphereGeometry(1, 14, 10).scale(0.099, 0.116, 0.078);
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
// (arrays [x, y, z]); returns how far short the end stays (0 when reached).
export function reach2(S, T, L1, L2, pole, mid, end) {
  let dx = T[0] - S[0], dy = T[1] - S[1], dz = T[2] - S[2];
  const d0 = Math.hypot(dx, dy, dz) || 1e-6, d = Math.min(L1 + L2 - 1e-4, Math.max(Math.abs(L1 - L2) + 1e-4, d0));
  dx /= d0; dy /= d0; dz /= d0;
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  // the pole's part across the line
  const pd = pole[0] * dx + pole[1] * dy + pole[2] * dz; let mx = pole[0] - pd * dx, my = pole[1] - pd * dy, mz = pole[2] - pd * dz;
  let ml = Math.hypot(mx, my, mz); if (ml < 1e-6) { mx = -dy; my = dx; mz = 0; ml = Math.hypot(mx, my) || 1; }
  mid[0] = S[0] + dx * a + (mx / ml) * h; mid[1] = S[1] + dy * a + (my / ml) * h; mid[2] = S[2] + dz * a + (mz / ml) * h;
  end[0] = S[0] + dx * d; end[1] = S[1] + dy * d; end[2] = S[2] + dz * d;
  return Math.max(0, d0 - d);
}
