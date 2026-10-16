// Pit crews: the team's people at its box. What they do is the car's state in the pit lane (pitstate.js crewPhase),
// from the data – never a timing of their own: out at the box while a car of the team comes down the lane to it
// ("ready"), round the car while it stands in its box ("work"), standing back by the garage through a stop-and-go
// ("hold": no work is allowed), walking back after it left ("back"). The FIA's rule (Art. 34.13): team personnel are in
// the pit lane only just before they work on a car and withdraw as soon as it's done – otherwise they're in the garage
// (not drawn).
//
// What is done at a stop (pitstate.js stopPlan): where the session's record says the car got a new set of tyres at
// it (a new stint – sent ~15 s after the car left: a replay has it, a live feed doesn't yet), or where the viewer asked
// for a typical stop to be shown, the tyre change is played from the moment the car stood (stopChoreo): the jacks lift
// it, the guns undo the wheel nuts, the old wheels come off, the new ones go on, the jacks drop. Played on the stop's
// own time (seconds since the car stood, from its positions – the same after a seek), fitted to how long the car really
// stood when that is known; the car leaves when its positions say so, never held for the play. Otherwise the crew stands
// round the car in the usual places (STOP: the work isn't known).
//
// Where they stand at a stop is the usual arrangement – three at each wheel (the gun, the old wheel off, the new one
// on), the front and rear jacks, one at each end of the front wing, one steadying each side, the release controller by
// the nose on the pit lane side – a depiction of a typical stop, not the team's own. All of it inside the inner lane
// (pitlane.js crossSection keeps the room), none in the fast lane.
// The car's frame: a along it (+ forward), b across (+ the car's left), from the model's origin between the axles.
import * as THREE from "./vendor/three.module.js";

// [along, across, facing (rad, 0 = looking along +a), pose, kit]: written with the garages on the car's left (+b)
const WHEEL = (ax, ay) => {
  const s = Math.sign(ay), face = s > 0 ? -Math.PI / 2 : Math.PI / 2;
  return [
    [ax, ay * 1.32, face, "kneel", "gun"],                           // the gun, kneeling at the hub
    [ax - 0.75, ay * 1.6, face + s * 0.35, "ready", null],           // the old wheel off (behind the gun)
    [ax + 0.75, ay * 1.6, face - s * 0.35, "carry", "tyre"],         // the new wheel on (ahead of it)
  ];
};
export const STOP = [
  ...WHEEL(1.72, 1), ...WHEEL(1.72, -1), ...WHEEL(-1.72, 1), ...WHEEL(-1.72, -1),
  [3.55, 0, Math.PI, "jack", "frontJack"], [-3.3, 0, 0, "jack", "rearJack"],
  [2.75, 1.25, Math.PI * 0.85, "ready", null], [2.75, -1.25, -Math.PI * 0.85, "ready", null],   // the front wing's ends
  [0.15, 1.35, -Math.PI / 2, "ready", null], [0.15, -1.35, Math.PI / 2, "ready", null],         // steadying at the sides
  [3.6, -2.15, Math.PI * 0.75, "stand", null],                                                   // the release controller
];

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;

// The figures for a phase: a layout [along, across, facing, pose, kit] in the box's frame (garages on the left).
//   f: how far out from the garage (0: at its front, 1: in place); boxC: the box's distance out from the garages' front;
//   left: +1 with the garages on the car's left, −1 on its right (the layout mirrored)
export function crewLayout(phase, f, boxC, left = 1) {
  const mouth = boxC - 0.7;   // just outside the garage's opening, across from the box's centre
  const out = STOP.map(([a, b, face, pose, kit]) => {
    if (phase === "work") return [a, b, face, pose, kit];
    if (phase === "hold") return [a * 0.9, mouth, -Math.PI / 2, "stand", null];
    // ready / back: from the garage's front to its place (standing ready, the kit in hand), facing the way it moves.
    // Walking back, the ones ahead of the car (the front jack, the wing's ends, the release) are already out of its way
    // on the garage side: the car drove off through where they stood
    const k = clamp01(f), ahead = phase === "back" && a > 2;
    const y = ahead ? mouth + (Math.max(b, 1.6) - mouth) * k * 0.5 : mouth + (b - mouth) * k;
    const moving = k > 0.02 && k < 0.98;
    return [a, y, moving ? (phase === "back" ? Math.PI / 2 : -Math.PI / 2) : face, moving ? "walk" : pose === "kneel" ? "ready" : pose, kit === "gun" || kit === "tyre" ? kit : null];
  });
  return left > 0 ? out : out.map(([a, b, face, pose, kit]) => [a, -b, -face, pose, kit]);
}

// ---------- the tyre change ----------
// Timings of a typical stop (s from the car standing; a 2.3 s stop – the field's usual 2.2–2.6 s): the jacks lift the
// front and the rear (0.05–0.35), each gun on its hub, the wheel nuts undone, the old wheel off (0.5–0.85), the new one
// on (0.75–1.1), done up (to 1.5), the gunner's arm up, the jacks drop (1.95–2.1), the car released. A wheel a few
// hundredths of a second after another (four crews never move as one). A depiction of the usual sequence: the data has
// only when the car stood and left, and – from the record – that a new set went on.
export const CHANGE = { base: 2.3, lift: 0.07, liftF: [0.05, 0.3], liftR: [0.1, 0.35], drop: 1.95, dropFor: 0.15, gunIn: [0, 0.18],
  off: [0.5, 0.85], away: [0.85, 1.25], on: [0.75, 1.1], back: [1.15, 1.5], signal: 1.5, wheelLag: [0, 0.05, 0.03, 0.08] };

// The stop's own clock: seconds into the work from seconds since the car stood (s), the plan's wait (a time penalty
// served at the stop: nobody touches the car until it has run) and its known length (D, s; null unknown) – a stop known
// to be quick plays faster (never under 0.6×), a long one plays at the usual pace and waits with the jacks up until
// shortly before the car leaves.
export function stopClock(plan, s, C = CHANGE) {
  const wait = plan.wait || 0, D = plan.D ?? null;
  const k = D != null && D - wait < C.base ? Math.max(0.6, (D - wait) / C.base) : 1;
  const w = (s - wait) / k;                                       // seconds into the work, at the usual pace
  const dropAt = D != null ? Math.max(wait + C.drop * k, D - 0.35) : wait + C.drop * k;   // the jacks drop (s since it stood)
  return { w, k, dropAt, down: ss(dropAt, dropAt + C.dropFor, s) };
}

// The car's hubs, from its dimensions (car3d.js wheelParts): per wheel in the car's order (front left, front right,
// rear left, rear right) { a, b (hub centre), side (+1 left), face (b of the wheel's outer face), r, axle }
export function hubsOf(d) {
  return [[d.FZ, d.FX, "front"], [d.FZ, -d.FX, "front"], [d.RZ, d.RX, "rear"], [d.RZ, -d.RX, "rear"]].map(([a, b, axle]) => {
    const side = Math.sign(b), w = axle === "front" ? d.FW : d.RW;
    return { a, b, side, face: b + side * w / 2, r: axle === "front" ? d.FR : d.RR, axle };
  });
}

// The tyre change at s seconds since the car stood: { figures: [[a, b, facing, pose, kit]], kits: [{ kind, axle, a, b,
// h, yaw (about up, 0 = the car's heading), flip }], car: { lift: [front, rear] m, off: [4 × bool: that wheel not on
// the car] } } in the car's frame (b + its left). left: +1 with the garages on the car's left. pose: a POSES name or a
// pose (blendPose). A kit a figure holds is drawn with it ("frontJack", "rearJack"); the guns and the wheels off the
// car are kits of their own ("gun"; "old" / "new": the old set's and the new set's).
export function stopChoreo(plan, s, d, left = 1, C = CHANGE) {
  const { w, dropAt, down } = stopClock(plan, s, C), H = hubsOf(d), figures = [], kits = [];
  const liftF = C.lift * ss(C.liftF[0], C.liftF[1], w) * (1 - down), liftR = C.lift * ss(C.liftR[0], C.liftR[1], w) * (1 - down);
  const off = [false, false, false, false];
  const standUp = ss(dropAt, dropAt + 0.3, s);
  H.forEach((h, i) => {
    const t = w - C.wheelLag[i], sd = h.side, inward = sd > 0 ? -Math.PI / 2 : Math.PI / 2, hubH = h.r + (h.axle === "front" ? liftF : liftR), fb = Math.abs(h.face);
    // the gun: crouched ready just out from the wheel, kneels at it as the car stops, the gun on the hub until the nuts
    // are done up, the arm up, standing back once the jacks drop
    const gk = ss(C.gunIn[0], C.gunIn[1], t);
    const gPose = standUp > 0 ? blendPose("signal", "ready", standUp) : t >= C.signal ? blendPose("kneel", "signal", ss(C.signal, C.signal + 0.15, t)) : blendPose("ready", "kneel", gk);
    figures.push([h.a, sd * (fb + lerp(0.85, 0.42, gk) + 0.3 * standUp), inward, gPose, null]);
    const gunOn = gk * (1 - ss(C.back[1] - 0.1, C.back[1] + 0.1, t));
    kits.push({ kind: "gun", a: h.a, b: sd * (fb + lerp(0.55, 0.06, gunOn) + 0.3 * standUp), h: lerp(0.45, hubH, gunOn), yaw: inward, flip: false });
    // the old wheel: off the car from `off`, pulled straight out, then carried back behind the gun
    const reach = ss(C.off[0] - 0.15, C.off[0], t), pull = ss(C.off[0], C.off[1], t), away = ss(C.away[0], C.away[1], t);
    const oa = h.a - lerp(lerp(0.5, 0.3, reach), 1.05, away) - 0.2 * pull * (1 - away);
    const ob = sd * (fb + lerp(lerp(0.6, 0.35, reach), 1.2, away) + 0.35 * pull * (1 - away));
    const oFace = inward + sd * 0.45;
    const oPose = t < C.off[0] - 0.15 ? "ready" : t < C.off[1] ? blendPose("ready", "reach", reach * (1 - ss(C.off[0] + 0.15, C.off[1], t))) : "carry";
    figures.push([oa, ob, oFace, oPose, null]);
    if (t >= C.off[0]) {
      // from the hub out (still at its height), then held at the waist in front of its carrier
      const ha = oa + Math.cos(oFace) * 0.45, hb = ob - Math.sin(oFace) * 0.45;
      kits.push({ kind: "old", axle: h.axle, a: lerp(h.a - 0.1 * pull, ha, away), b: lerp(h.b + sd * 0.5 * pull, hb, away), h: lerp(hubH, 0.6, away), yaw: 0, flip: sd < 0 });
    }
    // the new wheel: held ready ahead of the gun, onto the hub from `on`, fitted at its end; its carrier steps back
    const fit = ss(C.on[0], C.on[1], t), back = ss(C.back[0], C.back[1], t), nFace = inward - sd * 0.4;
    // (stepping back: ahead of the wheel, except on the fast lane's side – the car leaves that way – where it's behind)
    const na = h.a + lerp(lerp(0.65, 0.3, fit), sd === -left ? -0.7 : 0.85, back), nb = sd * (fb + lerp(lerp(0.65, 0.4, fit), sd === -left ? 1.65 : 1.0, back));   // (and out past the old wheel's man)
    figures.push([na, nb, nFace, back > 0 ? blendPose("reach", "stand", back) : blendPose("carry", "reach", fit), null]);
    if (t < C.on[1]) {
      const ha = na + Math.cos(nFace) * 0.42, hb = nb - Math.sin(nFace) * 0.42;
      kits.push({ kind: "new", axle: h.axle, a: lerp(ha, h.a, fit), b: lerp(hb, h.b, fit), h: lerp(0.6, hubH, fit), yaw: 0, flip: sd < 0 });
    }
    off[i] = t >= C.off[0] && t < C.on[1];
  });
  // the jacks: in at the nose and the tail, the levers down as the car goes up, back up as it drops; the front one
  // pulled out to the garages' side as soon as it is down (the car leaves through where he stands)
  const front = d.FZ + 1.85, rear = d.RZ - 1.6, aside = ss(dropAt, dropAt + 0.35, s);
  figures.push([front + 0.2 * aside, left * 1.9 * aside, Math.PI, blendPose("jack", "jackDown", liftF / C.lift), "frontJack"]);
  figures.push([rear, 0, 0, blendPose("jack", "jackDown", liftR / C.lift), "rearJack"]);
  // the front wing's ends, steadying at the sides (hands on the car while it is up), the release controller
  const steady = (liftF + liftR) / (2 * C.lift);
  // (as the jacks drop, the ones on the fast lane's side ahead of the car – a wing man, the release controller – step
  // back beside it: the car turns out through where they stood)
  const wing = (sd) => (sd === -left ? [2.75 - 2.2 * aside, sd * (1.25 + 0.45 * aside)] : [2.75, sd * 1.25]);
  figures.push([...wing(1), Math.PI * 0.85, "ready", null], [...wing(-1), -Math.PI * 0.85, "ready", null]);
  figures.push([0.15, 1.35, -Math.PI / 2, blendPose("ready", "reach", steady * 0.6), null], [0.15, -1.35, Math.PI / 2, blendPose("ready", "reach", steady * 0.6), null]);
  figures.push([3.6 - 3.0 * aside, -left * (2.15 + 0.15 * aside), left > 0 ? Math.PI * 0.75 : -Math.PI * 0.75, s >= dropAt ? "signal" : "stand", null]);
  return { figures, kits, car: { lift: [liftF, liftR], off } };
}

// Before the stop (a car of the team coming: f 0 → 1 as it nears) and after it (the car gone: f 1 → 0 back to the
// garage): the tyre-change crew walking out to its places with the new wheels and guns, and back with the old wheels.
// Positions blend between the garage's opening (boxC − 0.7 m out) and the places at the stop's start or end; those
// ahead of the car walk back by the garage side (the car drove off through where they stood).
export function changeWalk(phase, f, d, boxC, left = 1, C = CHANGE) {
  const mouth = left * (boxC - 0.7), k = clamp01(f), moving = k > 0.02 && k < 0.98;
  const at = phase === "ready" ? stopChoreo({ wait: 0, D: null }, -1, d, left, C) : stopChoreo({ wait: 0, D: C.base }, C.base + 1, d, left, C);
  const figures = at.figures.map(([a, b, face, pose, kit], i) => {
    const ahead = phase === "back" && a > 2;
    const y = ahead ? mouth + (left * Math.max(left * b, 1.6) - mouth) * k * 0.5 : mouth + (b - mouth) * k;
    return [a, y, moving ? (phase === "back" ? left * Math.PI / 2 : -left * Math.PI / 2) : face, moving ? walkPose(k * Math.abs(b - mouth) * 3 + i) : pose, kit];
  });
  const kits = [];
  for (const kt of at.kits) {
    // a kit goes with the figure nearest it (its carrier) – new wheels and guns out, old wheels and guns back
    if ((phase === "ready" && kt.kind === "old") || (phase === "back" && kt.kind === "new")) continue;
    let best = 0, bd = Infinity; at.figures.forEach(([a, b], i) => { const dd = (a - kt.a) ** 2 + (b - kt.b) ** 2; if (dd < bd) { bd = dd; best = i; } });
    const [a0, b0] = at.figures[best], [a1, b1] = figures[best];
    kits.push({ ...kt, a: kt.a + (a1 - a0), b: kt.b + (b1 - b0), h: kt.kind === "gun" ? 0.45 : 0.6 });
  }
  return { figures, kits, car: null };
}

// ---------- the figures: jointed ----------
// One person 1.78 m tall, from capsules and boxes on a skeleton – hips, knees, waist, shoulders, elbows – posed by
// joint angles, so poses blend smoothly (a gunner kneeling down, a jack man pulling his lever) instead of jumping from
// one shape to the next. Every body part is one instanced mesh for all the crews (a part per person in it): the fire
// suit and the helmet's shell in the team's colour, the visor, belt, gloves and boots dark.
// Angles (rad): th – thigh from straight down, + forward; sh – the shin's own angle from straight down (+ the foot
// ahead of the knee); lean – the torso forward from upright; arm – per arm [flex (from straight down, + forward),
// spread (out to the side), elbow bend]. Index 0: the left leg / arm.
export const POSES = {
  stand: { th: [0.03, 0.03], sh: [-0.03, -0.03], lean: 0.03, arm: [[0.15, 0.08, 0.2], [0.15, 0.08, 0.2]] },
  ready: { th: [0.55, 0.55], sh: [-0.35, -0.35], lean: 0.45, arm: [[1.0, 0.15, 0.4], [1.0, 0.15, 0.4]] },
  reach: { th: [1.0, 0.55], sh: [-0.2, -0.65], lean: 0.85, arm: [[1.35, 0.25, 0.15], [1.35, 0.25, 0.15]] },
  kneel: { th: [1.45, 0.08], sh: [0.05, -1.5], lean: 0.35, arm: [[1.35, 0.1, 0.35], [1.3, 0.12, 0.4]] },
  signal: { th: [1.45, 0.08], sh: [0.05, -1.5], lean: 0.2, arm: [[1.35, 0.1, 0.35], [2.9, 0.15, 0.1]] },
  carry: { th: [0.2, 0.2], sh: [-0.15, -0.15], lean: 0.15, arm: [[0.75, 0.35, 0.9], [0.75, 0.35, 0.9]] },
  jack: { th: [0.45, -0.1], sh: [0.1, -0.4], lean: 0.6, arm: [[1.2, 0.16, 0.2], [1.2, 0.16, 0.2]] },
  jackDown: { th: [0.75, 0.05], sh: [-0.05, -0.55], lean: 0.95, arm: [[1.55, 0.16, 0.05], [1.55, 0.16, 0.05]] },
};
// A step of a walk at phase ph (rad): the legs swinging opposite, the knee bent on the swinging leg, the arms opposite
export function walkPose(ph) {
  const sw = Math.sin(ph), lg = [0.32 * sw, -0.32 * sw], bend = [0.2 + 0.45 * Math.max(0, -Math.cos(ph)), 0.2 + 0.45 * Math.max(0, Math.cos(ph))];
  return { th: lg, sh: [lg[0] - bend[0], lg[1] - bend[1]], lean: 0.08, arm: [[-0.3 * sw, 0.08, 0.3], [0.3 * sw, 0.08, 0.3]] };
}
POSES.walk = walkPose(0);
const poseOf = (p) => (typeof p === "string" ? POSES[p] || POSES.stand : p || POSES.stand);
export function blendPose(a, b, k) {
  const A = poseOf(a), B = poseOf(b); k = clamp01(k);
  if (k <= 0) return A; if (k >= 1) return B;
  return { th: [lerp(A.th[0], B.th[0], k), lerp(A.th[1], B.th[1], k)], sh: [lerp(A.sh[0], B.sh[0], k), lerp(A.sh[1], B.sh[1], k)], lean: lerp(A.lean, B.lean, k),
    arm: [0, 1].map((i) => [0, 1, 2].map((j) => lerp(A.arm[i][j], B.arm[i][j], k))) };
}
const LIMB = { thigh: 0.44, shin: 0.43, uarm: 0.29, farm: 0.27, torso: 0.55 };
// The body's parts for a pose, in the person's frame (x forward, y up, z across; standing on y = 0: the lower of each
// leg's foot and knee on the ground): put(part, x, y, z, ax, ay, az) – the part's centre and, for a limb, its
// direction (unit); for the others ay = null and ax their lean about z. Returns the hands' places [[x, y, z] × 2].
export function skeleton(P, put) {
  P = poseOf(P);
  let hip = 0;
  for (let i = 0; i < 2; i++) { const dT = LIMB.thigh * Math.cos(P.th[i]), dS = LIMB.shin * Math.max(0, Math.cos(P.sh[i])); hip = Math.max(hip, dT + dS + 0.05, dT + 0.06); }
  for (let i = 0; i < 2; i++) {
    const z = (i ? -1 : 1) * 0.11, kx = Math.sin(P.th[i]) * LIMB.thigh, ky = hip - Math.cos(P.th[i]) * LIMB.thigh;
    put("thigh", kx / 2, (hip + ky) / 2, z, Math.sin(P.th[i]), -Math.cos(P.th[i]), 0);
    const fx = kx + Math.sin(P.sh[i]) * LIMB.shin, fy = ky - Math.cos(P.sh[i]) * LIMB.shin;
    put("shin", (kx + fx) / 2, (ky + fy) / 2, z, Math.sin(P.sh[i]), -Math.cos(P.sh[i]), 0);
    put("boot", fx + 0.06, Math.max(0.045, fy - 0.01), z, Math.max(-1.2, Math.min(0, P.sh[i] + 0.6)), null, null);
  }
  const L = P.lean, T = LIMB.torso;
  put("pelvis", 0, hip + 0.02, 0, 0, null, null);
  put("torso", Math.sin(L) * (T / 2 + 0.06), hip + Math.cos(L) * (T / 2 + 0.06), 0, -L, null, null);
  put("belt", Math.sin(L) * 0.1, hip + Math.cos(L) * 0.1, 0, -L, null, null);
  const nx = Math.sin(L) * T, ny = hip + Math.cos(L) * T + 0.04;
  put("neck", nx + 0.01, ny + 0.03, 0, -L * 0.5, null, null);
  put("helmet", nx + 0.03, ny + 0.17, 0, 0, null, null);
  put("visor", nx + 0.14, ny + 0.165, 0, 0, null, null);
  const hands = [];
  for (let i = 0; i < 2; i++) {
    const side = i ? -1 : 1, [a, spread, elbow] = P.arm[i], sx = nx - 0.02, sy = ny - 0.05, sz = side * 0.21;
    const ex = sx + Math.sin(a) * LIMB.uarm, ey = sy - Math.cos(a) * LIMB.uarm, ez = sz + side * spread * 0.25;
    const ul = Math.hypot(ex - sx, ey - sy, ez - sz);
    put("uarm", (sx + ex) / 2, (sy + ey) / 2, (sz + ez) / 2, (ex - sx) / ul, (ey - sy) / ul, (ez - sz) / ul);
    const b = a + elbow, hx = ex + Math.sin(b) * LIMB.farm, hy = ey - Math.cos(b) * LIMB.farm;
    put("farm", (ex + hx) / 2, (ey + hy) / 2, ez, Math.sin(b), -Math.cos(b), 0);
    put("glove", hx, hy, ez, 0, null, null);
    hands.push([hx, hy, ez]);
  }
  return hands;
}
// the parts: [geometry (centred; limbs along y), in the team's colour, small (left out far away), per person]
function partGeometries() {
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 8);
  return {
    thigh: [cap(0.075, LIMB.thigh - 0.1), true, false, 2], shin: [cap(0.065, LIMB.shin - 0.1), true, false, 2], boot: [new THREE.BoxGeometry(0.26, 0.09, 0.11), false, true, 2],
    // (the torso rounded – a capsule flattened front to back, broad at the shoulders; the pelvis across the hips)
    torso: [cap(0.16, LIMB.torso - 0.3).scale(0.78, 1, 1.18), true, false, 1], pelvis: [cap(0.11, 0.12).rotateX(Math.PI / 2).scale(0.95, 1, 1), true, false, 1],
    belt: [new THREE.CylinderGeometry(0.135, 0.135, 0.06, 14).scale(0.8, 1, 1.4), false, true, 1], neck: [new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), true, false, 1],
    helmet: [new THREE.SphereGeometry(0.13, 14, 10).scale(1.08, 1, 0.95), true, false, 1], visor: [new THREE.BoxGeometry(0.04, 0.06, 0.17), false, true, 1],
    uarm: [cap(0.055, LIMB.uarm - 0.08), true, false, 2], farm: [cap(0.05, LIMB.farm - 0.08), true, false, 2], glove: [new THREE.SphereGeometry(0.055, 8, 6), false, true, 2],
  };
}
// geometries [[geometry, rgb]] into one, its vertex colours from each part's
function mergeGeo(gs) {
  const pos = [], nor = [], col = [];
  for (const [g0, c] of gs) {
    const g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position.array, n = g.attributes.normal.array;
    for (const v of p) pos.push(v); for (const v of n) nor.push(v); for (let i = 0; i < p.length / 3; i++) col.push(c[0], c[1], c[2]);
    if (g !== g0) g.dispose(); g0.dispose();
  }
  const m = new THREE.BufferGeometry(); m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  m.computeBoundingSphere(); return m;
}
// the kit: a wheel gun (its socket at the origin, the body behind it along −x, a grip), a jack (its bar and the head)
function kitParts() {
  const grey = [0.55, 0.58, 0.6], dark = [0.1, 0.1, 0.11];
  const gun = mergeGeo([[new THREE.CylinderGeometry(0.05, 0.05, 0.26, 10).rotateZ(Math.PI / 2).translate(-0.16, 0, 0), grey], [new THREE.CylinderGeometry(0.035, 0.035, 0.06, 8).rotateZ(Math.PI / 2).translate(0, 0, 0), dark], [new THREE.BoxGeometry(0.05, 0.16, 0.05).translate(-0.22, -0.08, 0), dark]]);
  const jack = mergeGeo([[new THREE.CylinderGeometry(0.025, 0.025, 1.3, 8).rotateZ(Math.PI / 2 - 0.5).translate(0.55, 0.32, 0), grey], [new THREE.BoxGeometry(0.22, 0.12, 0.5).translate(1.05, 0.12, 0), grey], [new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10).rotateX(Math.PI / 2).translate(0.95, 0.06, 0.2), dark], [new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10).rotateX(Math.PI / 2).translate(0.95, 0.06, -0.2), dark]]);
  return { gun, jack };
}
// A wheel off the car, from the car's own parts (car3d.js wheelParts – cloned: those are shared): the tyre, the rim's
// lip and its cover in one geometry (vertex colours); the sidewall band the car's own (the compound's colour per wheel)
function wheelKit(parts) {
  const geo = (p) => mergeGeo([[p.tyre.clone(), [0.094, 0.094, 0.1]], [p.lip.clone(), [0.54, 0.56, 0.59]], [p.cover.clone(), [0.11, 0.12, 0.13]]]);
  return { front: geo(parts.front), rear: geo(parts.rear), frontBand: parts.front.band, rearBand: parts.rear.band };
}

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const parts = partGeometries();
  SHARED = { parts, kit: kitParts(), teamMat: new THREE.MeshStandardMaterial({ roughness: 0.65 }), darkMat: new THREE.MeshStandardMaterial({ color: "#16181b", roughness: 0.45 }),
    kitMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 }), bandMat: new THREE.MeshBasicMaterial({ color: 0xffffff }) };
  for (const x of [SHARED.teamMat, SHARED.darkMat, SHARED.kitMat, SHARED.bandMat]) x.userData.shared = true;
  for (const [g] of Object.values(parts)) g.userData.shared = true;
  for (const g of Object.values(SHARED.kit)) g.userData.shared = true;
  return SHARED;
}

// Crews for up to `max` people: { group, wheels(parts), place(figures, loose, cam), clear() }.
//   wheels(parts): the wheels' shape for this session's cars (car3d.js wheelParts; rebuilt when it changes)
//   place([{ x, y, z, yaw, colour, pose, kit }], [{ kind, x, y, z, yaw, flip, band }], cam) – figures (pose: a name
//   or a pose) and loose kit (kind "gun"; "front" / "rear": a wheel off a car, band its sidewall's colour). Over 90 m
//   from cam the small parts (boots, belt, visor, gloves) are left out.
export function crewMeshes(max = 120) {
  const S = shared(), group = new THREE.Group(); group.name = "crews";
  const mk = (geo, mat, n, coloured) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.visible = false; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; if (coloured) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); group.add(m); return m; };
  const body = {}; for (const [k, [g, team, small, per]] of Object.entries(S.parts)) body[k] = { mesh: mk(g, team ? S.teamMat : S.darkMat, max * per, team), team, small, cap: max * per };
  const kit = { gun: mk(S.kit.gun, S.kitMat, max, false), frontJack: mk(S.kit.jack, S.kitMat, 16, false), rearJack: mk(S.kit.jack, S.kitMat, 16, false) };
  const kitCap = { gun: max, frontJack: 16, rearJack: 16 };
  let wheel = null;   // { key, front, rear, frontBand, rearBand }
  const m4 = new THREE.Matrix4(), mp = new THREE.Matrix4(), q = new THREE.Quaternion(), qp = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color(), dir = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1);
  const counts = {};
  let far = false, colour = col;
  // a part at its place in the person's frame, into the world through the person's matrix (mp)
  const put = (part, x, y, z, ax, ay, az) => {
    const b = body[part]; if ((far && b.small) || counts[part] >= b.cap) return;
    if (ay != null) { dir.set(ax, ay, az); qp.setFromUnitVectors(up, dir); } else qp.setFromAxisAngle(zAxis, ax || 0);
    p.set(x, y, z); m4.compose(p, qp, one).premultiply(mp);
    const i = counts[part]++; b.mesh.setMatrixAt(i, m4); if (b.team) b.mesh.setColorAt(i, colour);
  };
  return {
    group,
    wheels(parts) {
      if (!parts || wheel?.key === parts.key) return;
      if (wheel) { for (const m of [wheel.front, wheel.rear]) { group.remove(m); m.geometry.dispose(); m.dispose(); } for (const m of [wheel.frontBand, wheel.rearBand]) { group.remove(m); m.dispose(); } }
      const g = wheelKit(parts);
      wheel = { key: parts.key, front: mk(g.front, S.kitMat, 64, false), rear: mk(g.rear, S.kitMat, 64, false), frontBand: mk(g.frontBand, S.bandMat, 64, true), rearBand: mk(g.rearBand, S.bandMat, 64, true) };
    },
    place(list, loose = [], cam = null) {
      for (const k of Object.keys(body)) counts[k] = 0;
      const n = { gun: 0, frontJack: 0, rearJack: 0, front: 0, rear: 0 };
      for (const f of list) {
        if (counts.torso >= max) break;
        far = !!cam && Math.hypot(f.x - cam.x, f.y - cam.y, f.z - cam.z) > 90;
        colour = col.set(f.colour || "#9aa0a6");
        q.setFromAxisAngle(up, f.yaw); p.set(f.x, f.y, f.z); mp.compose(p, q, one);
        const hands = skeleton(f.pose, put);
        if (f.kit && kit[f.kit] && n[f.kit] < kitCap[f.kit]) {
          // (a gun in the right hand, pointing ahead; a jack's bar from the hands down to its head on the ground)
          if (f.kit === "gun") p.set(hands[1][0] + 0.12, hands[1][1], hands[1][2]); else p.set(0.2, 0, 0);
          m4.compose(p, qp.identity(), one).premultiply(mp); kit[f.kit].setMatrixAt(n[f.kit]++, m4);
        }
      }
      for (const k of loose) {
        q.setFromAxisAngle(up, k.yaw + (k.flip ? Math.PI : 0)); p.set(k.x, k.y, k.z); m4.compose(p, q, one);
        if (k.kind === "gun") { if (n.gun < kitCap.gun) kit.gun.setMatrixAt(n.gun++, m4); }
        else if (wheel && (k.kind === "front" || k.kind === "rear") && n[k.kind] < 64) {
          const i = n[k.kind]++; wheel[k.kind].setMatrixAt(i, m4);
          wheel[k.kind + "Band"].setMatrixAt(i, m4); wheel[k.kind + "Band"].setColorAt(i, col.set(k.band || "#9aa0a6"));
        }
      }
      for (const [k, b] of Object.entries(body)) { b.mesh.count = counts[k]; b.mesh.visible = counts[k] > 0; b.mesh.instanceMatrix.needsUpdate = true; if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true; }
      for (const [k, mesh] of Object.entries(kit)) { mesh.count = n[k]; mesh.visible = n[k] > 0; mesh.instanceMatrix.needsUpdate = true; }
      if (wheel) for (const k of ["front", "rear"]) for (const mesh of [wheel[k], wheel[k + "Band"]]) { mesh.count = n[k]; mesh.visible = n[k] > 0; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
      return { people: counts.torso, wheels: n.front + n.rear, guns: n.gun };
    },
    clear() { for (const m of group.children) { m.count = 0; m.visible = false; } },
  };
}

// The figures in the world for a layout in the box's frame (where: x, y, z of the frame's origin – the car's, or the
// box's place – and its heading yaw as the cars': forward = (sin yaw, cos yaw); its left = (cos yaw, −sin yaw)).
// A figure's own facing: 0 looks along +x of its geometry; turned to face the layout's direction.
export function crewAt(where, layout, colour) {
  const c = Math.cos(where.yaw), s = Math.sin(where.yaw);
  return layout.map(([a, b, f, pose, kit]) => ({ x: where.x + s * a + c * b, y: where.y, z: where.z + c * a - s * b, yaw: where.yaw + f - Math.PI / 2, colour, pose, kit }));
}
// Loose kit in the world from the box's frame (as crewAt): guns, and wheels off the car (bands: { old, new } – the
// sidewall colours of the old set's and the new set's compounds; null: not known)
export function kitAt(where, kits, bands = {}) {
  const c = Math.cos(where.yaw), s = Math.sin(where.yaw);
  return kits.map((k) => ({ kind: k.kind === "gun" ? "gun" : k.axle, x: where.x + s * k.a + c * k.b, y: where.y + k.h, z: where.z + c * k.a - s * k.b,
    yaw: k.kind === "gun" ? where.yaw + k.yaw - Math.PI / 2 : where.yaw + k.yaw, flip: !!k.flip, band: k.kind === "new" ? bands.new : k.kind === "old" ? bands.old : null }));
}

// ---------- the team's people on the pit wall ----------
// Seated on stools at the stand's console, facing the track (the screens in front of them; from the garage one sees
// their backs – formula1.com, "The insider's guide to the pit wall"), headsets on: the same skeleton as the crews (the
// "sit" pose), dressed in the team's shirt, dark trousers and shoes, a bare head with a headset – no helmets.
// Static (a layer's people stand still until the layer is rebuilt): one instanced mesh per body part for all of them.
POSES.sit = { th: [1.45, 1.4], sh: [0.02, -0.06], lean: 0.12, arm: [[0.95, 0.12, 0.65], [0.9, 0.14, 0.7]] };
POSES.sitLean = { th: [1.45, 1.4], sh: [0.02, -0.06], lean: 0.32, arm: [[1.15, 0.1, 0.45], [1.1, 0.12, 0.5]] };
let PEOPLE = null;
function peopleShared() {
  if (PEOPLE) return PEOPLE;
  const S = shared(), cap = (r, l) => new THREE.CapsuleGeometry(r, l, 2, 6);
  const head = new THREE.SphereGeometry(0.105, 10, 8).scale(1.05, 1.12, 0.92);
  // the headset: a band over the head and a cup at each ear
  const set = mergeGeo([[new THREE.TorusGeometry(0.115, 0.012, 4, 12, Math.PI).rotateY(Math.PI / 2).translate(0, 0.02, 0), [0.08, 0.08, 0.09]],
    [new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10).rotateX(Math.PI / 2).translate(0, -0.01, 0.115), [0.08, 0.08, 0.09]], [new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10).rotateX(Math.PI / 2).translate(0, -0.01, -0.115), [0.08, 0.08, 0.09]]]);
  PEOPLE = {
    // part → [geometry, colour role: "shirt" | "legs" | "skin" | "dark", per person]
    parts: { thigh: [cap(0.072, LIMB.thigh - 0.1), "legs"], shin: [cap(0.06, LIMB.shin - 0.1), "legs"], boot: [new THREE.BoxGeometry(0.25, 0.08, 0.1), "dark"],
      pelvis: [S.parts.pelvis[0], "legs"], torso: [S.parts.torso[0], "shirt"], neck: [S.parts.neck[0], "skin"], helmet: [head, "skin"], visor: [set, "kit"],
      uarm: [cap(0.052, LIMB.uarm - 0.08), "shirt"], farm: [cap(0.045, LIMB.farm - 0.08), "skin"], glove: [new THREE.SphereGeometry(0.045, 6, 5), "skin"] },
    skin: ["#e9c3a3", "#d8a77f", "#b98260", "#8d5a3c", "#f1d2b6"],
    mat: new THREE.MeshStandardMaterial({ roughness: 0.7 }), kitMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }),
  };
  for (const [g] of Object.values(PEOPLE.parts)) g.userData.shared = true;
  PEOPLE.mat.userData.shared = true; PEOPLE.kitMat.userData.shared = true;
  return PEOPLE;
}
// people: [{ x, y, z, yaw (as crewAt's: the geometry's +x turned to face), shirt, pose, seed }] → a Group (its instanced
// meshes own nothing shared: the geometries and materials are; disposeGroup leaves them)
export function peopleMeshes(people) {
  const P = peopleShared(), group = new THREE.Group(); group.name = "pitWallPeople";
  if (!people.length) return group;
  const per = { thigh: 2, shin: 2, boot: 2, uarm: 2, farm: 2, glove: 2 }, meshes = {}, counts = {};
  for (const [k, [g, role]] of Object.entries(P.parts)) {
    const m = new THREE.InstancedMesh(g, role === "kit" ? P.kitMat : P.mat, people.length * (per[k] || 1)); m.count = 0; m.castShadow = true; m.receiveShadow = true;
    if (role !== "kit") m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.instanceMatrix.count * 3), 3);
    meshes[k] = { m, role }; counts[k] = 0; group.add(m);
  }
  const mp = new THREE.Matrix4(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qp = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), z = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3();
  const cShirt = new THREE.Color(), cLegs = new THREE.Color("#25282d"), cSkin = new THREE.Color(), cDark = new THREE.Color("#141518");
  for (const f of people) {
    cShirt.set(f.shirt || "#9aa0a6"); cSkin.set(P.skin[(f.seed ?? 0) % P.skin.length]);
    q.setFromAxisAngle(up, f.yaw); p.set(f.x, f.y, f.z); mp.compose(p, q, one);
    skeleton(f.pose || "sit", (part, x, y, zz, ax, ay, az) => {
      const e = meshes[part]; if (!e) return;
      if (ay != null) { dir.set(ax, ay, az); qp.setFromUnitVectors(up, dir); } else qp.setFromAxisAngle(z, ax || 0);
      p.set(x, part === "visor" ? y : y, zz); if (part === "visor") p.x -= 0.11;   // (the headset round the head, not at the visor's place)
      m4.compose(p, qp, one).premultiply(mp);
      const i = counts[part]++; e.m.setMatrixAt(i, m4);
      if (e.role !== "kit") e.m.setColorAt(i, e.role === "shirt" ? cShirt : e.role === "legs" ? cLegs : e.role === "skin" ? cSkin : cDark);
    });
  }
  for (const [k, e] of Object.entries(meshes)) { e.m.count = counts[k]; e.m.instanceMatrix.needsUpdate = true; if (e.m.instanceColor) e.m.instanceColor.needsUpdate = true; e.m.computeBoundingSphere(); }
  return group;
}
