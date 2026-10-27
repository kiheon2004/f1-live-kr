// The driver's arms on the steering wheel (v0.41): where each elbow and shoulder go, and how the forearm turns, for the
// hand that holds its grip at any angle of the wheel – solved for the whole arm, not just for the wrist's place.
//
// v0.40 put the glove on its grip with the hand square to the grip's axis, then reached the arm to the glove's wrist
// with a fixed elbow pole (down and out). Nothing tied the forearm's direction to the hand's: with the wheel straight the
// forearm ran up along the grip (the elbow hung low) and the hand sat ~66° off it towards the little finger – past what a
// wrist can do (ulnar deviation ~30°) – and turning the wheel bent the rising hand ~90° more. The sleeve ended at the
// wrist's point, so every test of "the arm reaches the glove" passed while the wrist was broken.
//
// Now (all in the LEFT arm's frame – the car's: +x its left, +y up, +z its nose; the right arm is its mirror image at the
// opposite wheel angle – the cockpit is symmetric):
//  1. the hand holds its grip as a closed power grip does – the grip across the palm obliquely (body3d GLOVE.oblique), the
//     thumb on the wheel's face, the fingers round its back – and stays where it is on the grip as the wheel turns (hands
//     don't slide round a race car's grips);
//  2. its arm: shoulder → elbow → wrist with the bones' fixed lengths; the elbow's place on the circle the two bones allow
//     (the swivel), and how far the shoulder comes forward and up (a little: protraction / elevation), chosen per wheel
//     angle to keep the wrist's bend (flexion/extension, radial/ulnar deviation) and the forearm's turn (pronation /
//     supination) in a comfortable range, the elbow in the cockpit – and, angle to angle, changing smoothly;
//  3. the hand's roll round the grip (where on the grip's circumference the palm sits) chosen once per wheel for the
//     whole range, and the grip's small turn in the closed hand (±ROLL) as it goes round;
//  4. the forearm's turn shared out along it (a twist bone half way) – pronation happens along the forearm (the radius
//     round the ulna) – so the wrist itself only bends, and the glove's gauntlet (skinned to the forearm and the hand)
//     bends over the wrist instead of a cuff sitting at an angle on the sleeve's end.
// The plan is a table over the wheel's angle (every 2°) – the best smooth path over the whole turn (planArmsPath), baked
// offline per cockpit geometry (armplans.js) – a pure function of the wheel's angle: the same angle gives the same arms
// whatever came before (a seek, a pause, a camera change).
//
// Human reference ranges (not model rules; the model aims inside the "functional" ones; sources in v0.41
// research/wrist.md):
//  - wrist active range (AAOS): flexion 80°, extension 70° (H), radial deviation 20°, ulnar 30° (M); range used in daily
//    tasks (Ryu et al. 1991): 60° extension, 54° flexion, 17° radial, 40° ulnar (H); Palmer et al. 1985: 5° flexion –
//    30° extension, 10° radial – 15° ulnar (M); the power grip's wrist leans to extension and ulnar deviation (M).
//  - forearm: pronation 78–82°, supination 85–88° (Zwerus et al. 2017, 352 adults; H); functional 50° each way (Morrey
//    et al. 1981; M–H). Elbow flexion 143–148° (Zwerus; H).
//  - the shoulder joint's forward / upward travel with the shoulder blade: a few cm (L – no good figure in cm).
// The model's own quality limits (what this code aims at and the tests check) are WRIST_COMFORT / WRIST_LIMIT /
// PRONATION below – choices for a picture that reads as natural, inside the human ranges, not measurements of a driver.
import { BODY, armSkin } from "./body3d.js";
import { distanceField, fieldAt } from "./meshgeo.js";

const D = Math.PI / 180;
// the wrist's comfortable centre and how far it may go before the cost climbs steeply (deg; flex + = towards the palm,
// rad + = towards the thumb's side)
// (a closed hand on a handle leans to extension and to the little finger's side – the power grip's posture; with the
// elbows low beside the driver's body the forearms rise to the grips, so the hands lean further that way than at a desk:
// the limits below are the functional range's (Ryu 1991: 40° ulnar) – the model allows that much, no more)
export const WRIST_COMFORT = { flex: -15, rad: -22, flexSpan: 26, radSpan: 14 };
export const WRIST_LIMIT = { flex: [-58, 54], rad: [-38, 16] };   // (v0.42: inside the daily-use range – Ryu 1991: 60° extension, 54° flexion, 40° ulnar, 17° radial – with a margin)
export const PRONATION = { comfort: 0, span: 45, limit: [-75, 70] };   // (deg from neutral – thumb up; + = palm turning down)
export const SHOULDER = { forward: 0.07, back: 0.02, up: 0.03, down: 0.02 };   // how far the shoulder joint may move (m)
export const ROLL = 25 * D;
// how much a millimetre of the arm in the car's body or the torso costs: (pen / PEN_SCALE)² (v0.43: 2 mm, was 3.5 – with the
// torso as drawn (torsoField), 3.5 mm let the plan buy a few degrees of wrist with ~8 mm of the upper arm in the chest)
export const PEN_SCALE = 0.002;   // how far the grip may turn in the closed hand either way (rad; an estimate – the glove and a loosened hand let a round grip slide round a little)
// the elbow beside the driver's torso (never into it: x ≥ xBody), not down in the seat (y ≥ yMin), and only a little
// over the shoulders (yHigh) – the car's own body is the room's (roomPenetration)
export const ELBOW_ROOM = { xBody: 0.12, yMin: 0.22, yHigh: 0.72 };

// ---------- the cockpit's room (v0.42) ----------
// How deep a ball of radius r at (x, y, z) (the car's frame) sits in the car's body – 0 when it is clear: inside the
// tub (within its walls, over its floor or the bulkhead / seat back where the opening starts and ends), over the
// opening, or above the chassis' top outside it. From the room table car3d.js builds off the chassis' own sections
// (roomTable): the opening's edge, the tub's bottom, the top surface every cm. The padded rim: a 3 cm tube on the edge.
export function roomPenetration(R, x, y, z, r) {
  if (!R) return 0;
  const ax = Math.abs(x), fi = (z - R.z0) / R.dz;
  if (fi < 0 || fi > R.nz - 1) return 0;   // (ahead of or behind the table: nothing of the arm goes there)
  const i = Math.min(R.nz - 2, Math.floor(fi)), t = fi - i, lerp = (A) => A[i] + (A[i + 1] - A[i]) * t;
  const ex = lerp(R.edgeX), ey = lerp(R.edgeY), bot = lerp(R.bottom);
  const topAt = (xx) => { const fj = Math.min(R.nx - 1.001, xx / R.dx), j = Math.floor(fj), u = fj - j, a = R.top[i * R.nx + j] * (1 - u) + R.top[i * R.nx + j + 1] * u, b = R.top[(i + 1) * R.nx + j] * (1 - u) + R.top[(i + 1) * R.nx + j + 1] * u; return a + (b - a) * t; };
  // over the opening (between its edges, inside the rim): the tub's walls and floor, and the rim's tube at the edge
  if (ex > 0 && ax < ex) {
    let pen = Math.max(0, bot - (y - r));                                   // floor, bulkhead, seat back
    if (y < ey + 0.01) pen = Math.max(pen, ax + r - (ex - 0.02));           // the walls (the fold's 1.4–2.6 cm in)
    const dr = Math.hypot(ax - ex, y - (ey + 0.012)) - R.rim; if (dr < r) pen = Math.max(pen, r - dr);   // the rim
    return pen;
  }
  // elsewhere: above the chassis' top (the rim's tube on the edge too)
  const top = Math.max(topAt(Math.max(0, ax - r * 0.7)), topAt(ax), topAt(ax + r * 0.7));
  let pen = top > -1 ? Math.max(0, top - (y - r)) : 0;
  if (ex > 0) { const dr = Math.hypot(ax - ex, y - (ey + 0.012)) - R.rim; if (dr < r) pen = Math.max(pen, r - dr); }
  return pen;
}
// How deep a ball of radius r at (x, y, z) sits in the driver's own torso or thighs (car3d driverTorso's capsules: the
// trunk an elliptic section – hw across, hd front to back – along its back from lo to hi about L0; the thighs round)
// v0.43: with the torso's mesh at hand (T.mesh – car3d), its signed distance field instead (torsoField): the planner
// keeps the arms out of the torso as it is drawn and measured (cockpitcheck.js), not out of a narrower stand-in – the
// capsule's ribcage was 0.14 m half across where the drawn chest is ~0.16 m, so a "clear" arm lay 2–3 cm in the suit.
const FIELDS = new Map();
export function torsoField(T) {
  if (!T?.mesh) return null;
  if (!T.field) { const k = JSON.stringify([T.L0, T.up]); if (!FIELDS.has(k)) FIELDS.set(k, distanceField(T.mesh(), 0.01, 0.07)); T.field = FIELDS.get(k); }
  return T.field;
}
export function torsoPenetration(T, x, y, z, r) {
  if (!T) return 0;
  if (T.field) return Math.max(0, r - fieldAt(T.field, x, y, z));
  const rx = x - T.L0[0], ry = y - T.L0[1], rz = z - T.L0[2], along = rx * T.up[0] + ry * T.up[1] + rz * T.up[2];
  let pen = 0;
  if (along > T.lo - r && along < T.hi + r) {
    const lat = rx, fr = rx * T.front[0] + ry * T.front[1] + rz * T.front[2], d = Math.hypot(lat / T.hw, fr / T.hd);
    if (d < 1 + r / T.hd) pen = Math.max(pen, r + T.hd * (1 - d));
  }
  for (const [a, b, rr] of T.thighs) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2, t = Math.max(0, Math.min(1, ((x - a[0]) * ab[0] + (y - a[1]) * ab[1] + (z - a[2]) * ab[2]) / L2));
    const dd = Math.hypot(x - a[0] - ab[0] * t, y - a[1] - ab[1] * t, z - a[2] - ab[2] * t); if (dd < rr + r) pen = Math.max(pen, rr + r - dd);
  }
  return pen;
}
// how deep a ball sits in boxes (the head's side pads: the left one given, mirrored for an arm at −x)
export function boxPenetration(boxes, x, y, z, r) {
  let pen = 0;
  for (const [c, h] of boxes || []) {
    const dx = Math.max(0, Math.abs(Math.abs(x) - c[0]) - h[0]), dy = Math.max(0, Math.abs(y - c[1]) - h[1]), dz = Math.max(0, Math.abs(z - c[2]) - h[2]), dd = Math.hypot(dx, dy, dz);
    if (dd < r) pen = Math.max(pen, r - dd);
  }
  return pen;
}
// the sleeve's radius along the arm – v0.43: read off the sleeve's own mesh (body3d armSkin, its widest every cm from the
// shoulder), where v0.42's straight-line guess (5.2 → 2.6 cm) was 4–9 mm thinner than the drawn sleeve along most of
// it: the plan's "clear" arms lay that much in the chest. u: 0 at the shoulder, ½ at the elbow, 1 at the wrist.
let SLEEVE = null;
function sleeveRadii() {
  const g = armSkin(), P = g.attributes.position, r = new Float32Array(Math.ceil((BODY.uarm + BODY.farm) / 0.01) + 2);
  for (let i = 0; i < P.count; i++) { const k = Math.max(0, Math.min(r.length - 1, Math.round(P.getY(i) / 0.01))); r[k] = Math.max(r[k], Math.hypot(P.getX(i), P.getZ(i))); }
  for (let k = 1; k < r.length; k++) if (!r[k]) r[k] = r[k - 1];
  g.dispose(); return r;
}
const ARM_R = (u) => { SLEEVE ||= sleeveRadii(); const a = (u < 0.5 ? u * 2 * BODY.uarm : BODY.uarm + (u - 0.5) * 2 * BODY.farm) / 0.01, k = Math.min(SLEEVE.length - 2, Math.floor(a)), t = a - k; return SLEEVE[k] + (SLEEVE[k + 1] - SLEEVE[k]) * t; };
// the deepest the arm (shoulder → elbow → wrist, 24 balls along it) goes into the car's body, and into the driver's
// torso and thighs (the balls more than 0.14 m from the shoulder joint: nearer, the arm grows out of the torso)
// (v0.43: 24 balls – 12 were 5 cm apart on the upper arm, and the mesh's sleeve lay 8 mm in the chest between two of
// them, just past the root's 14 cm)
export function armPenetration(R, o, T = null) {
  let worst = 0;
  for (let k = 0; k <= 24; k++) {
    const u = k / 24, A = u <= 0.5 ? o.S : o.E, B = u <= 0.5 ? o.E : o.W, f = u <= 0.5 ? u * 2 : (u - 0.5) * 2;
    const x = A[0] + (B[0] - A[0]) * f, y = A[1] + (B[1] - A[1]) * f, z = A[2] + (B[2] - A[2]) * f, r = ARM_R(u);
    worst = Math.max(worst, roomPenetration(R, x, y, z, r), boxPenetration(T?.boxes, x, y, z, r));
    if (T && Math.hypot(x - o.S[0], y - o.S[1], z - o.S[2]) > 0.14) worst = Math.max(worst, torsoPenetration(T, x, y, z, r));
  }
  return worst;
}

// ---------- small vector helpers (arrays; no per-call allocation in the per-frame path) ----------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b, o) => { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; };
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; a[0] /= l; a[1] /= l; a[2] /= l; return a; };
const cross = (a, b, o) => { const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]; o[0] = x; o[1] = y; o[2] = z; return o; };
const madd = (a, b, s, o) => { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; };
// rotate v about the unit axis k by angle a (Rodrigues), into o
function rotAbout(v, k, a, o) {
  const c = Math.cos(a), s = Math.sin(a), d = dot(k, v), x = k[1] * v[2] - k[2] * v[1], y = k[2] * v[0] - k[0] * v[2], z = k[0] * v[1] - k[1] * v[0];
  o[0] = v[0] * c + x * s + k[0] * d * (1 - c); o[1] = v[1] * c + y * s + k[1] * d * (1 - c); o[2] = v[2] * c + z * s + k[2] * d * (1 - c); return o;
}

// The wheel's frame in the car's: its centre `at`, tilted back by `tilt` about x, turned by `a` about its own z (the
// column). Points / directions in the wheel's frame → the car's.
export function wheelToCar(at, tilt, a, p, o, dir = false) {
  const ca = Math.cos(a), sa = Math.sin(a), x = p[0] * ca - p[1] * sa, y = p[0] * sa + p[1] * ca, z = p[2];
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  o[0] = x; o[1] = y * ct - z * st; o[2] = y * st + z * ct;
  if (!dir) { o[0] += at[0]; o[1] += at[1]; o[2] += at[2]; }
  return o;
}

// The wrist's bend from the forearm's direction f (elbow → wrist, unit) and the hand's axes (x: towards the little
// finger's side, y: wrist → knuckles, z: out of the palm) – all in the same frame: flexion (+ towards the palm) and
// radial deviation (+ towards the thumb), degrees. (The hand's long axis seen from the forearm: tilted towards the palm
// when f leans to the hand's −z, towards the thumb when f leans to +x.)
export function wristBend(f, hx, hy, hz, out = { flex: 0, rad: 0 }) {
  const fx = dot(f, hx), fy = dot(f, hy), fz = dot(f, hz);
  out.flex = Math.atan2(-fz, fy) / D; out.rad = Math.atan2(fx, Math.hypot(fy, fz)) / D;
  return out;
}
// The forearm's turn (deg from neutral, + = pronation) for a left arm: the hand's little-finger axis hx against the
// elbow's hinge H (upper arm × forearm), about the forearm f. Neutral (thumb up, palm towards the body) puts hx in the
// elbow's plane: +90° from H about f; palm down (pronated) +180°.
const _tp = [0, 0, 0], _tq = [0, 0, 0];
export function twistOf(H, f, hx) {
  const p = madd(hx, f, -dot(hx, f), _tp); nrm(p);
  const q = cross(H, p, _tq);
  return Math.atan2(dot(q, f), dot(H, p)) / D;   // τ: H → p about f
}

// ---------- the arm for one wheel angle ----------
// geometry: { at, tilt, shoulder: [x, y, z], wrist: [x, y, z] (the wrist joint's centre, wheel frame), hand: [hx, hy, hz]
// (the hand's axes, wheel frame) } – the left arm's. Writes into `o` (reused): S, E, W (car frame), f, A, H (unit), the
// hand's axes in the car's frame, flex, rad, pron, twist τ (rad, H → the hand's x about f), and the cost.
const _n = [0, 0, 0], _u = [0, 0, 0], _v = [0, 0, 0], _c = [0, 0, 0], _t = [0, 0, 0], _bend = { flex: 0, rad: 0 };
export function armOut() { return { S: [0, 0, 0], E: [0, 0, 0], W: [0, 0, 0], W0: [0, 0, 0], roll: 0, f: [0, 0, 0], A: [0, 0, 0], H: [0, 0, 0], hx: [0, 0, 0], hy: [0, 0, 0], hz: [0, 0, 0], flex: 0, rad: 0, pron: 0, tau: 0, cost: 0, short: 0 }; }
const _w = [0, 0, 0], _h0 = [0, 0, 0], _h1 = [0, 0, 0], _h2 = [0, 0, 0];
// the hand at wheel angle a, rolled `roll` round its grip's axis (the grip turning a little in the closed hand): the
// wrist joint W and the hand's axes in the car's frame
export function handAt(geo, a, roll, o) {
  const { at, tilt } = geo;
  if (roll) {
    const g = geo.grip; sub(geo.wrist, g.c, _w); rotAbout(_w, g.up, roll, _w); _w[0] += g.c[0]; _w[1] += g.c[1]; _w[2] += g.c[2];
    rotAbout(geo.hand[0], g.up, roll, _h0); rotAbout(geo.hand[1], g.up, roll, _h1); rotAbout(geo.hand[2], g.up, roll, _h2);
  } else { for (let i = 0; i < 3; i++) { _w[i] = geo.wrist[i]; _h0[i] = geo.hand[0][i]; _h1[i] = geo.hand[1][i]; _h2[i] = geo.hand[2][i]; } }
  wheelToCar(at, tilt, a, _w, o.W0);
  wheelToCar(at, tilt, a, _h0, o.hx, true); wheelToCar(at, tilt, a, _h1, o.hy, true); wheelToCar(at, tilt, a, _h2, o.hz, true);
  o.roll = roll;
  return o;
}
// the arm to that hand: the shoulder moved fwd / up, the elbow at its swivel; the wrist's bend and the forearm's turn
export function elbowAt(geo, swivel, fwd, up, o) {
  o.W[0] = o.W0[0]; o.W[1] = o.W0[1]; o.W[2] = o.W0[2];
  o.S[0] = geo.shoulder[0]; o.S[1] = geo.shoulder[1] + up; o.S[2] = geo.shoulder[2] + fwd;
  // the elbow on its circle round the shoulder–wrist line: swivel 0 straight down from the line, 90° out to the side
  sub(o.W, o.S, _n); const d0 = len(_n), L1 = BODY.uarm, L2 = BODY.farm, d = Math.min(L1 + L2 - 1e-6, Math.max(Math.abs(L1 - L2) + 1e-6, d0));
  o.short = d0 - d; nrm(_n);
  const ca = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - ca * ca));
  _u[0] = 0; _u[1] = -1; _u[2] = 0; madd(_u, _n, -dot(_u, _n), _u); nrm(_u);           // down, square to the line
  cross(_n, _u, _v);                                                                       // out (+x for the left arm)
  madd(o.S, _n, ca, _c); const cs = Math.cos(swivel), sn = Math.sin(swivel);
  _t[0] = cs * _u[0] + sn * _v[0]; _t[1] = cs * _u[1] + sn * _v[1]; _t[2] = cs * _u[2] + sn * _v[2];   // the elbow's way out of the line
  madd(_c, _t, h, o.E);
  // (a wrist beyond the arm's reach: the arm points straight at it and stops short – `short` says by how much)
  if (o.short > 0) { madd(o.S, _n, L1, o.E); madd(o.S, _n, L1 + L2, o.W); }
  sub(o.E, o.S, o.A); nrm(o.A); sub(o.W, o.E, o.f); nrm(o.f);
  // the elbow's hinge: square to the arm's plane – from the swivel (its way out × the line), not from upper arm ×
  // forearm, which vanishes as the arm straightens and flips the hinge over (v0.41's first plan, at 90°)
  cross(_t, _n, o.H); nrm(o.H);
  wristBend(o.f, o.hx, o.hy, o.hz, _bend); o.flex = _bend.flex; o.rad = _bend.rad;
  o.tau = twistOf(o.H, o.f, o.hx) * D; o.pron = wrapDeg(o.tau / D - 90);
  return o;
}
export function armAt(geo, a, swivel, fwd, up, o, roll = 0) { handAt(geo, a, roll, o); o.room = geo.room || null; o.torso = geo.torso || null; o.geo = geo; return elbowAt(geo, swivel, fwd, up, o); }
const wrapDeg = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
// how unnatural the arm is (dimensionless): the wrist's bend and the forearm's turn from their comfortable centres, steep
// past the limits; the elbow out of the cockpit's room; the shoulder moved
const barrier = (x, lo, hi, s) => (x < lo ? ((lo - x) / s) ** 2 : x > hi ? ((x - hi) / s) ** 2 : 0);
export function armCost(o, fwd, up, roll = 0) {
  const C = WRIST_COMFORT, L = WRIST_LIMIT, P = PRONATION, R = ELBOW_ROOM;
  let c = ((o.flex - C.flex) / C.flexSpan) ** 2 + ((o.rad - C.rad) / C.radSpan) ** 2 + ((o.pron - P.comfort) / P.span) ** 2;
  c += 30 * (barrier(o.flex, L.flex[0], L.flex[1], 8) + barrier(o.rad, L.rad[0], L.rad[1], 4) + barrier(o.pron, P.limit[0], P.limit[1], 8));
  const [ex, ey] = o.E;
  // the arm in the car's body (the tub's walls and floor, the rim, the chassis' top – the room's table, roomPenetration)
  // or into the driver's own body (beside the torso: x ≥ xBody); a raised elbow high over the shoulders costs a little
  const pen = o.room || o.torso ? armPenetration(o.room, o, o.torso) : 0; o.pen = pen;
  c += (pen / PEN_SCALE) ** 2 + (o.torso ? 0 : 40 * barrier(ex, R.xBody, 9, 0.012)) + 40 * barrier(ey, R.yMin, 9, 0.02) + 2 * barrier(ey, -9, R.yHigh, 0.04);
  c += 0.4 * ((fwd / 0.04) ** 2 + (up / 0.02) ** 2) + ((roll / D) / 18) ** 2 + (o.short / 0.001) ** 2;   // (the hand out of reach: never – a millimetre costs as much as a bent wrist)
  return c;
}

// ---------- the plan: every 2° of the wheel ----------
export const PLAN_STEP = 2, PLAN_MAX = 90;
// everything the plan's cost depends on besides the geometry: part of a baked plan's key (a change asks for a re-bake)
export const PLAN_COST = JSON.stringify({ WRIST_COMFORT, WRIST_LIMIT, PRONATION, SHOULDER, ROLL, ELBOW_ROOM, PLAN_STEP, PLAN_MAX, W: "1+12exp(-(a/35)^2)", SW: [-120, 150], BESIDE: [91, 0.16], TORSO: "mesh field 1 cm", PEN: PEN_SCALE, BALLS: 24, SLEEVE: "mesh" });
const SW = { lo: -120 * D, hi: 150 * D };   // the swivel's range (the elbow from across the chest – a big lock's lower arm – to well up and out)
const _o = armOut();
const wrapRad = (x) => x - 2 * Math.PI * Math.round(x / (2 * Math.PI));

// The arm at wheel angle `a` (rad, the wheel's own turn about its column; + = the left grip up), from the plan: the
// table's neighbours blended, then the arm rebuilt from the exact wrist (so the hand is held wherever the wheel is).
// Left arm; the right is mirrored by the caller (k = −1: angle −a, x negated). Writes into o (armOut()).
export function armFromPlan(plan, a, o) {
  const n = plan.n, x = Math.max(-PLAN_MAX, Math.min(PLAN_MAX, a / D)) / PLAN_STEP + n, i = Math.min(2 * n - 1, Math.floor(x)), t = x - i;
  const A = plan.rows[i], B = plan.rows[i + 1], l = (p, q) => p + (q - p) * t;
  armAt(plan.geo, a, l(A.sw, B.sw), l(A.fw, B.fw), l(A.up, B.up), o, l(A.rl, B.rl)); o.roll = l(A.rl, B.rl);
  // (τ from the frame, kept on the table's branch – never a whole turn off)
  const ref = l(A.tau, B.tau); o.tau = ref + wrapRad(o.tau - ref);
  return o;
}
// rotate the hinge H about f by τ: the forearm's x at the wrist (its turn matched to the hand's), into out
export function twistedX(o, tau, out) { return rotAbout(o.H, o.f, tau, out); }

// ---------- the hand on its grip ----------
// The left glove's frame in the wheel's for a roll ρ of the hand round its grip: the glove's x down the grip, its y (from
// the wrist across to the grip) at ρ from pointing in towards the hub (0) to pointing at the nose (90°), its z = x × y;
// the grip's centre at BODY.grip along y. grip: { c, up } (wheel frame). Returns { x, y, z, o } (arrays).
export function gloveFrame(grip, rho) {
  const up = grip.up, X = [-up[0], -up[1], -up[2]], inw = [-up[1], up[0], 0]; nrm(inw);
  const Y = [inw[0] * Math.cos(rho), inw[1] * Math.cos(rho), Math.sin(rho)]; nrm(Y);
  const Z = cross(X, Y, [0, 0, 0]); nrm(Z);
  return { x: X, y: Y, z: Z, o: madd(grip.c, Y, -BODY.grip, [0, 0, 0]) };
}
const inFrame = (F, v, pt) => { const o = pt ? F.o.slice() : [0, 0, 0]; return madd(madd(madd(o, F.x, v[0], o), F.y, v[1], o), F.z, v[2], o); };
// The wheel's arm geometry for the hand rolled ρ: the wrist joint and the hand's axes (glove frame: driverGlove's
// userData) carried into the wheel's frame
export function armGeo(base, grip, glove, rho) {
  const F = gloveFrame(grip, rho);
  return { ...base, rho, grip, frame: F, wrist: inFrame(F, glove.wrist, true), hand: glove.hand.map((v) => inFrame(F, v, false)) };
}
// how much a wheel angle's pose counts in the whole-turn plan: the wheel spends most of a lap within ±30° (straight
// ahead most of all) – a pose there weighs up to 5× one at the lock, so the plan never buys a better hairpin with a
// worse straight (v0.42's first whole-turn plan with the torso kept the lower arm crossed over the chest from the lock
// right through straight ahead: the wrist bent 57° there)
export const BESIDE = { a: 91 * D, x: 0.16 };
export const angleWeight = (a) => 1 + 12 * Math.exp(-(((a / D) / 35) ** 2));
// ---------- the whole turn at once (offline: tools/arm-plans.js bakes it into armplans.js) ----------
// Step by step from straight ahead (planArms) an arm can stay in a pose that is fine now but leads nowhere – v0.41's first
// plan kept the rising arm's elbow down beside the rim with the hand bent ~60° at 30–90°, though lifting the elbow over
// the rim from ~20° on gives a ~20° wrist. So: the best smooth path over the whole turn of the wheel (−90°…90°, every
// 2°) through a grid of the elbow's swivel (5°) and the grip's turn in the hand (2.5°) – the shoulder's small travel the
// best for each – the cost of each pose (armCost) plus the change from one angle to the next (dynamic programming:
// exact on the grid); then each angle refined off the grid next to its neighbour (smooth). ~5 s – never at run time.
export function planArmsPath(geo, { swStep = 5 * D, rlStep = 2.5 * D, wSw = 4 * D, wRl = 2 * D, smooth = 3 } = {}) {
  const n = PLAN_MAX / PLAN_STEP, N = 2 * n + 1, sws = [], rls = [];
  for (let x = SW.lo; x <= SW.hi + 1e-9; x += swStep) sws.push(x);
  for (let x = -ROLL; x <= ROLL + 1e-9; x += rlStep) rls.push(x);
  const fws = [-SHOULDER.back, 0, 0.03, 0.07, SHOULDER.forward], ups = [-SHOULDER.down, 0, 0.03, SHOULDER.up], S = sws.length * rls.length;
  torsoField(geo.torso);   // (the torso's field built once per torso, before the first pose is costed)
  _o.room = geo.room || null; _o.torso = geo.torso || null; _o.geo = geo;
  const cost = new Float64Array(N * S), arg = new Int8Array(N * S * 2);
  for (let i = 0; i < N; i++) {
    const a = (i - n) * PLAN_STEP * D;
    for (let r = 0; r < rls.length; r++) {
      handAt(geo, a, rls[r], _o);
      for (let w = 0; w < sws.length; w++) {
        let bc = Infinity, bf = 0, bu = 0;
        for (let f = 0; f < fws.length; f++) for (let u = 0; u < ups.length; u++) { elbowAt(geo, sws[w], fws[f], ups[u], _o); const c = armCost(_o, fws[f], ups[u], rls[r]); if (c < bc) { bc = c; bf = f; bu = u; } }
        // (within ±BESIDE of straight ahead the elbow stays out beside the body. v0.42 measured both ways of the lower arm
        // at a big lock on the meshes – crossing over the chest from ±65°: the sleeve 115 mm into the torso on the way
        // across; staying beside the body: 90–99 mm into it at ±80–90° and the wrist extended ~85°. Neither is clean with
        // the hands fixed on the grips; the arm stays beside the body over the whole ±90° – the smaller clash, no swing)
        if (Math.abs(a) < BESIDE.a) { armAt(geo, a, sws[w], fws[bf], ups[bu], _o, rls[r]); if (_o.E[0] < BESIDE.x) bc += 1e4 * (BESIDE.x - _o.E[0]); }
        const k = i * S + r * sws.length + w; cost[k] = bc * angleWeight(a); arg[2 * k] = bf; arg[2 * k + 1] = bu;
      }
    }
  }
  // forward pass: the cheapest way to each state, from a neighbour state at the previous angle (within 3 swivel and 2
  // roll steps – no leaps)
  const acc = new Float64Array(N * S), from = new Int32Array(N * S);
  for (let k = 0; k < S; k++) acc[k] = cost[k];
  for (let i = 1; i < N; i++) for (let r = 0; r < rls.length; r++) for (let w = 0; w < sws.length; w++) {
    let best = Infinity, bk = -1;
    for (let dr = -2; dr <= 2; dr++) { const r0 = r + dr; if (r0 < 0 || r0 >= rls.length) continue; for (let dw = -3; dw <= 3; dw++) { const w0 = w + dw; if (w0 < 0 || w0 >= sws.length) continue;
      const k0 = (i - 1) * S + r0 * sws.length + w0, c = acc[k0] + ((dw * swStep) / wSw) ** 2 + ((dr * rlStep) / wRl) ** 2; if (c < best) { best = c; bk = k0; } } }
    const k = i * S + r * sws.length + w; acc[k] = best + cost[k]; from[k] = bk;
  }
  let end = (N - 1) * S; for (let k = (N - 1) * S; k < N * S; k++) if (acc[k] < acc[end]) end = k;
  const states = new Array(N); for (let i = N - 1, k = end; i >= 0; i--) { states[i] = k; k = from[k]; }
  // off the grid: each angle refined next to its grid state and its neighbour (from straight ahead outwards)
  const rows = new Array(N), seed = (i) => { const k = states[i], q = k - i * S, r = Math.floor(q / sws.length), w = q % sws.length; return { sw: sws[w], rl: rls[r], fw: fws[arg[2 * k]], up: ups[arg[2 * k + 1]] }; };
  const refine = (i, prev) => {
    const a = (i - n) * PLAN_STEP * D, g = seed(i), B = { ...g, c: Infinity };
    const tryOne = (sw, fw, up, rl) => {
      armAt(geo, a, sw, fw, up, _o, rl); let c = armCost(_o, fw, up, rl);
      if (prev) c += ((sw - prev.sw) / wSw) ** 2 + ((rl - prev.rl) / wRl) ** 2 + ((fw - prev.fw) / 0.006) ** 2 + ((up - prev.up) / 0.004) ** 2;
      if (c < B.c) Object.assign(B, { sw, fw, up, rl, c });
    };
    tryOne(g.sw, g.fw, g.up, g.rl);
    for (let it = 0; it < 6; it++) {
      const b = { ...B }, ds = swStep / (2 << it), dr = rlStep / (2 << it), df = 0.015 / (1 << it), du = 0.01 / (1 << it);
      for (const s of [-1, 0, 1]) for (const r of [-1, 0, 1]) for (const f of [-1, 0, 1]) for (const u of [-1, 0, 1])
        tryOne(b.sw + s * ds, Math.max(-SHOULDER.back, Math.min(SHOULDER.forward, b.fw + f * df)), Math.max(-SHOULDER.down, Math.min(SHOULDER.up, b.up + u * du)), Math.max(-ROLL, Math.min(ROLL, b.rl + r * dr)));
    }
    armAt(geo, a, B.sw, B.fw, B.up, _o, B.rl);
    return { sw: B.sw, fw: B.fw, up: B.up, rl: B.rl, c: armCost(_o, B.fw, B.up, B.rl), flex: _o.flex, rad: _o.rad, pron: _o.pron, tau: _o.tau, E: _o.E.slice(), short: _o.short };
  };
  rows[n] = refine(n, null);
  for (const dir of [1, -1]) { let prev = rows[n]; for (let j = 1; j <= n; j++) { const i = n + dir * j, r = refine(i, prev); rows[i] = r; prev = r; } }
  // then smoothed along the turn (a Gaussian over ±3 rows, σ 6°: no corner in the arm's motion where the grid's path
  // turns) and the poses rebuilt from the smoothed settings
  return smoothPlan(geo, rows.map((r) => [r.sw, r.fw, r.up, r.rl]), smooth);
}
// A plan from settings per row ([swivel, shoulder forward, up, grip roll] every PLAN_STEP from −PLAN_MAX), optionally
// smoothed along the turn; each row's pose rebuilt (the wrist's bend, the forearm's turn, the elbow, the cost) and the
// forearm's twist unwrapped from straight ahead outwards
export function smoothPlan(geo, set, sigma = 0) {
  const N = set.length, n = (N - 1) / 2;
  let S = set;
  if (sigma > 0) { const R = Math.ceil(sigma * 2), w = []; for (let d = -R; d <= R; d++) w.push(Math.exp(-0.5 * (d / sigma) ** 2));
    S = set.map((_, i) => [0, 1, 2, 3].map((c) => { let t = 0, q = 0; for (let d = -R; d <= R; d++) { const j = Math.max(0, Math.min(N - 1, i + d)); t += w[d + R] * set[j][c]; q += w[d + R]; } return t / q; })); }
  const rows = S.map(([sw, fw, up, rl], i) => {
    const a = (i - n) * PLAN_STEP * D; armAt(geo, a, sw, fw, up, _o, rl);
    // (smoothing must never leave the hand out of reach: the shoulder then comes forward just enough)
    if (_o.short > 0) { let lo = fw, hi = SHOULDER.forward; for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; armAt(geo, a, sw, m, up, _o, rl); if (_o.short > 0) lo = m; else hi = m; } fw = hi; armAt(geo, a, sw, fw, up, _o, rl); }
    return { sw, fw, up, rl, c: armCost(_o, fw, up, rl), flex: _o.flex, rad: _o.rad, pron: _o.pron, tau: _o.tau, E: _o.E.slice(), short: _o.short }; });
  for (const dir of [1, -1]) for (let j = 1; j <= n; j++) { const i = n + dir * j, p = rows[i - dir]; rows[i].tau = p.tau + wrapRad(rows[i].tau - p.tau); }
  return { geo, rows, n, cost: rows.reduce((t, r) => t + r.c, 0) / rows.length, worst: rows.reduce((m, r) => Math.max(m, r.c), 0) };
}
