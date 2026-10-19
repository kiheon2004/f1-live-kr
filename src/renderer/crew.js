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
// the nose on the pit lane side, a spare rear jack standing by – 20 round the car, 21 with the spare: Red Bull's chief
// mechanic counts 20 roles (redbullracing.com, Feb 2022), Mercedes "up to 22" with spare jacks (2023), and formula1.com
// (2025) says each team would give a different number – no source gives each team's own, so every team gets this
// typical layout (not the team's own; the fire extinguisher and side-jack crews standing by in the garage aren't drawn:
// where they stand isn't sourced). Research: ~/projects/f1kr-work/v040/research/pitstop.md (v0.40). All of it inside
// the inner lane (pitlane.js crossSection keeps the room), none in the fast lane.
// The car's frame: a along it (+ forward), b across (+ the car's left), from the model's origin between the axles.
import * as THREE from "./vendor/three.module.js";
import { sidewallMaterial } from "./car3d.js";
import { BODY, JOINT_R, LIMB_GEO, limbGeometry, trunkGeometry, mergeSimple, chestGeometry, pelvisGeometry, shoeGeometry, fistGeometry, helmetGeometry, visorGeometry, headGeometry, hairGeometry, reach2 } from "./body3d.js";

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
  [3.55, 0, Math.PI, "jack", "frontJack"], [-3.56, 0.89, -0.7, "jack", "rearJack"],              // (the rear one behind and to the side: stopChoreo)
  [2.5, 1.3, Math.PI * 0.85, "ready", null], [2.5, -1.3, -Math.PI * 0.85, "ready", null],         // the front wing's ends
  [0.15, 1.35, -Math.PI / 2, "ready", null], [0.15, -1.35, Math.PI / 2, "ready", null],         // steadying at the sides
  [3.6, -2.15, Math.PI * 0.75, "stand", null],                                                   // the release controller
  [-3.7, -1.75, Math.PI / 2, "stand", "rearJack"],                                               // the spare rear jack, standing by
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
    return [a, y, moving ? (phase === "back" ? Math.PI / 2 : -Math.PI / 2) : face, moving ? walkPose(walkPhase(Math.abs(y - mouth))) : pose === "kneel" ? "ready" : pose, kit === "gun" || kit === "tyre" ? kit : null];
  });
  return left > 0 ? out : out.map(([a, b, face, pose, kit]) => [a, -b, -face, pose, kit]);
}

// ---------- the tyre change ----------
// Timings of a typical stop (s from the car standing; a 2.3 s stop – the field's usual 2.2–2.6 s): the jacks lift the
// front and the rear (0.05–0.35), each gun on its hub, the wheel nuts undone, the old wheel off (0.5–0.85), the new one
// on (0.75–1.1), done up (to 1.5), the gunner's arm up, the jacks drop (1.95–2.1), the car released. A wheel a few
// hundredths of a second after another (four crews never move as one). A depiction of the usual sequence: the data has
// only when the car stood and left, and – from the record – that a new set went on.
export const CHANGE = { base: 2.3, lift: 0.07, liftF: [0.05, 0.3], liftR: [0.25, 0.45], rearIn: [-0.08, 0.22], swivel: [0.8, 1.6], drop: 1.95, dropFor: 0.15, gunIn: [-0.12, 0.08], gunInR: [0.02, 0.22],
  off: [0.5, 0.85], away: [0.85, 1.25], on: [0.75, 1.1], back: [1.15, 1.5], signal: 1.5, wheelLag: [0, 0.05, 0.03, 0.08], lagMax: 0.1, nutMax: 0.06 };
// Each stop's own small differences between its four wheels (no two stops' crews move alike, the same stop always the
// same – a seek shows it again): from the car's number and when it stood (stopSeed), each wheel a little behind the
// first (up to lagMax s) and its nut a little slower to do up (up to nutMax) – estimates (M: in stop videos the four
// gunners' arms go up within about a tenth of a second of each other). Everything stays inside the stop's own timings:
// the last wheel is done (back + lagMax + nutMax = 1.66 s at the usual pace) before the jacks drop (1.95).
export function stopSeed(num, t0) { let h = 2166136261; for (const ch of `${num}:${Math.round((t0 || 0) / 1000)}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
const unit = (seed, k) => { let h = Math.imul(seed ^ Math.imul(k + 1, 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
export function wheelTimes(seed, C = CHANGE) {
  if (seed == null) return C.wheelLag.map((lag) => ({ lag, nut: 0 }));
  return [0, 1, 2, 3].map((i) => ({ lag: unit(seed, i) * C.lagMax, nut: unit(seed, i + 4) * C.nutMax }));
}

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
// rear left, rear right) { a, b (hub centre), side (+1 left), face (b of the wheel's outer face), r, w, axle }
export function hubsOf(d) {
  return [[d.FZ, d.FX, "front"], [d.FZ, -d.FX, "front"], [d.RZ, d.RX, "rear"], [d.RZ, -d.RX, "rear"]].map(([a, b, axle]) => {
    const side = Math.sign(b), w = axle === "front" ? d.FW : d.RW;
    return { a, b, side, face: b + side * w / 2, r: axle === "front" ? d.FR : d.RR, w, axle };
  });
}

// ---------- what the hands hold (in the box's frame: [a, b, h, weight, handle axis a, b, h]) ----------
// A figure at (fa, fb) facing f: forward (cos f, sin f), its right (+z) (sin f, −cos f) – hand 0 the one on its right.
const wrapPi = (x) => Math.atan2(Math.sin(x), Math.cos(x));
const byRight = (f, p, q) => { const ra = Math.sin(f), rb = -Math.cos(f); return p[0] * ra + p[1] * rb >= q[0] * ra + q[1] * rb ? [p, q] : [q, p]; };
// a wheel (centre a, b, h; turned by yaw – its axle (−sin φ, cos φ), φ = yaw (+π flipped)): both hands on the tread at
// its front and back (3 and 9 o'clock), on the half nearer the figure – how tyre men hold a wheel (F1 media photos)
export function wheelGrips(k, R, W, fa, fb, f, w = 1) {
  const ph = k.yaw + (k.flip ? Math.PI : 0), Aa = -Math.sin(ph), Ab = Math.cos(ph), Za = Math.cos(ph), Zb = Math.sin(ph);
  const tw = Math.sign((fa - k.a) * Aa + (fb - k.b) * Ab || 1) * Math.max(0, W / 2 - 0.07), r = R - 0.03;
  const p = [k.a + Za * r + Aa * tw, k.b + Zb * r + Ab * tw], q = [k.a - Za * r + Aa * tw, k.b - Zb * r + Ab * tw];
  const [h0, h1] = byRight(f, p, q);
  return [[h0[0], h0[1], k.h + 0.02, w, 0, 0, 1], [h1[0], h1[1], k.h + 0.02, w, 0, 0, 1]];
}
// a gun (socket a, b, h pointing along yaw – the facing convention): the trigger hand on its pistol grip, the other on
// the front handle (w1: that hand's weight – off it while the gunner signals)
export function gunGripsAB(k, w0 = 1, w1 = 1) {
  const F = [Math.cos(k.yaw), Math.sin(k.yaw)], Rt = [Math.sin(k.yaw), -Math.cos(k.yaw)];
  const tr = (v) => [k.a + F[0] * v[0] + Rt[0] * v[2], k.b + F[1] * v[0] + Rt[1] * v[2], k.h + v[1]], ax = (v) => [F[0] * v[0] + Rt[0] * v[2], F[1] * v[0] + Rt[1] * v[2], v[1]];
  return [[...tr(GUN.rear), w0, ...ax(GUN.rearAxis)], [...tr(GUN.front), w1, ...ax(GUN.frontAxis)]];
}
// a jack (base a, b; its lever along yaw, tilted up by tilt): the T handle's two ends, for a man facing f
export function jackGripsAB(k, f) {
  const L = JACK.bar * Math.cos(k.tilt), ca = k.a + Math.cos(k.yaw) * L, cb = k.b + Math.sin(k.yaw) * L, h = JACK.pivot + JACK.bar * Math.sin(k.tilt);
  const Ra = Math.sin(f), Rb = -Math.cos(f);
  return [[ca + Ra * JACK.half, cb + Rb * JACK.half, h, 1, Ra, Rb, 0], [ca - Ra * JACK.half, cb - Rb * JACK.half, h, 1, Ra, Rb, 0]];
}
// where the jacks engage (m from the axle lines: under the nose cone, the rear crash structure – estimates, M; a car
// profile may give its own as JF / JR in the dimensions it hands over – car3d.js wheelParts – and the crew follows) and how
// their men stand (from the jack's base to the man's hips), the lever's tilt ready / lifting (rad)
export const JACKS = { front: 0.85, rear: 0.8, man: 1.38, tiltUp: 0.62, tiltDown: 0.25, rearWait: [0.4, 1.3], rearAngle: 0.7, swivel: 1.1, clear: 0.9, upright: 1.25,
  gunAside: [0.12, 0.2, 0.3] };   // (the gunner's step out and forward while the wheels change, his gun's way out – estimates, L)
// carried in front of a walking man: a gun at the waist (its socket 0.56 m ahead), a wheel at the hips (its centre
// 0.5 m ahead, axle along his way) – heights where straight-ish arms hold them (body3d proportions)
const CARRY = { gun: [0.56, 0.95], wheel: [0.5, 0.86] };

// The tyre change at s seconds since the car stood: { figures: [[a, b, facing, pose, kit, grips]], kits: [{ kind,
// axle, a, b, h, yaw (about up, 0 = the car's heading), flip, tilt, by (its holder: a figure's index) }], car: { lift:
// [front, rear] m, off: [4 × bool: that wheel not on the car] } } in the car's frame (b + its left). left: +1 with the
// garages on the car's left. pose: a POSES name or a pose (blendPose); grips: what the hands hold (above). The guns,
// the jacks and the wheels off the car are kits of their own ("gun", "jack"; "old" / "new": the old set's and the new
// set's).
export function stopChoreo(plan, s, d, left = 1, C = CHANGE) {
  const { w, dropAt, down } = stopClock(plan, s, C), H = hubsOf(d), figures = [], kits = [];
  const liftF = C.lift * ss(C.liftF[0], C.liftF[1], w) * (1 - down), liftR = C.lift * ss(C.liftR[0], C.liftR[1], w) * (1 - down);
  const off = [false, false, false, false];
  const standUp = ss(dropAt, dropAt + 0.3, s), WT = wheelTimes(plan.seed, C);
  H.forEach((h, i) => {
    // (t: this wheel's own clock; tn: its nut's – done up a little later on some wheels)
    const t = w - WT[i].lag, tn = t - WT[i].nut, sd = h.side, inward = sd > 0 ? -Math.PI / 2 : Math.PI / 2, hubH = h.r + (h.axle === "front" ? liftF : liftR), fb = Math.abs(h.face);
    // the gun: crouched ready just out from the wheel, kneels at it as the car stops – a front one on the nut even as
    // the car comes to rest, a rear one only once it stands (its nut sits deep in the dished wheel: formula1.com 2025) –,
    // the gun drawn back out and up off the hub while the wheels change (the nut is captive in the wheel: it comes off
    // with it), on again to do the new one up, the arm up, standing back once the jacks drop
    const gIn = h.axle === "front" ? C.gunIn : C.gunInR, gk = ss(gIn[0], gIn[1], t);
    const wd = ss(C.off[0] - 0.05, C.off[0] + 0.1, t) * (1 - ss(C.on[1] - 0.12, C.on[1] + 0.04, t));
    const gPose = standUp > 0 ? blendPose("signal", "ready", standUp) : tn >= C.signal ? blendPose("kneel", "signal", ss(C.signal, C.signal + 0.15, tn)) : blendPose("ready", "kneel", gk);
    const sig = standUp > 0 ? 1 - standUp : tn >= C.signal ? ss(C.signal, C.signal + 0.15, tn) : 0;
    const gi = figures.length, gFig = [h.a + JACKS.gunAside[0] * wd, sd * (fb + lerp(0.98, 0.62, gk) + JACKS.gunAside[1] * wd + 0.3 * standUp), inward, gPose, null, null];
    figures.push(gFig);
    const gunOn = gk * (1 - ss(C.back[1] - 0.1, C.back[1] + 0.1, tn));
    // (off the hub the gun is in front of him – at his waist crouched, lower kneeling, at his hips once he stands)
    const gOut = lerp(0.98, 0.62, gk) + 0.3 * standUp, gOffH = standUp > 0 ? lerp(0.5, 0.86, standUp) : lerp(0.62, 0.5, gk);
    const gun = { kind: "gun", a: h.a + JACKS.gunAside[0] * wd, b: sd * (fb + lerp(gOut - 0.5, 0.06, gunOn) + JACKS.gunAside[2] * wd), h: lerp(gOffH, hubH, gunOn) + 0.06 * wd, yaw: inward, flip: false, by: gi };
    kits.push(gun); gFig[5] = gunGripsAB(gun, 1, 1 - sig);
    // the old wheel: off the car from `off`, pulled straight out, then carried back behind the gun (turned to face its
    // carrier, lifted to his hips)
    const reach = ss(C.off[0] - 0.15, C.off[0], t), pull = ss(C.off[0], C.off[1], t), away = ss(C.away[0], C.away[1], t);
    const oa = h.a - lerp(lerp(0.5, 0.3, reach), 1.05, away) - 0.2 * pull * (1 - away);
    const ob = sd * (fb + lerp(lerp(0.6, 0.3, reach), 1.2, away) + 0.35 * pull * (1 - away));
    // (the wheel: straight out along the axle off the hub's spigot, then back to its carrier – behind the gunner)
    const oFace = inward + sd * 0.45;
    const oPose = t < C.off[0] - 0.15 ? "ready" : t < C.off[1] ? blendPose("ready", "reach", reach * (1 - ss(C.off[0] + 0.15, C.off[1], t))) : blendPose("reach", "carry", away);
    const oi = figures.length, oFig = [oa, ob, oFace, oPose, null, null];
    figures.push(oFig);
    const flip = sd < 0, oYaw = nearYaw(wrapPi(oFace - Math.PI / 2 - (flip ? Math.PI : 0)));
    if (t >= C.off[0]) {
      // from the hub out (still at its height), then held at the hips in front of its carrier
      const ha = oa + Math.cos(oFace) * CARRY.wheel[0], hb = ob + Math.sin(oFace) * CARRY.wheel[0];
      const k = { kind: "old", axle: h.axle, a: lerp(h.a - 0.3 * ss(0.4, 1, pull), ha, away), b: lerp(h.b + sd * (0.24 * ss(0, 0.55, pull) + 0.2 * ss(0.4, 1, pull)), hb, away), h: lerp(hubH, CARRY.wheel[1], away), yaw: oYaw * away, flip, by: oi };
      kits.push(k); oFig[5] = wheelGrips(k, h.r, h.w, oa, ob, oFace);
    } else if (reach > 0) oFig[5] = wheelGrips({ a: h.a, b: h.b, h: hubH, yaw: 0, flip }, h.r, h.w, oa, ob, oFace, reach);   // (reaching for it on the car)
    // the new wheel: held ready ahead of the gun, onto the hub from `on`, fitted at its end; its carrier steps back
    const fit = ss(C.on[0], C.on[1], t), back = ss(C.back[0], C.back[1], tn), nFace = inward - sd * 0.4;
    // (stepping back: ahead of the wheel, except on the fast lane's side – the car leaves that way – where it's behind)
    const na = h.a + lerp(lerp(0.65, 0.3, fit), sd === -left ? -0.7 : 0.85, back), nb = sd * (fb + lerp(lerp(0.65, 0.4, fit), sd === -left ? 1.65 : 1.0, back));   // (and out past the old wheel's man)
    const ni = figures.length, nFig = [na, nb, nFace, back > 0 ? blendPose("reach", "stand", back) : blendPose("carry", "reach", fit), null, null];
    figures.push(nFig);
    const nYaw = nearYaw(wrapPi(nFace - Math.PI / 2 - (flip ? Math.PI : 0)));
    if (t < C.on[1]) {
      const ha = na + Math.cos(nFace) * CARRY.wheel[0], hb = nb + Math.sin(nFace) * CARRY.wheel[0];
      const k = { kind: "new", axle: h.axle, a: lerp(ha, h.a, fit), b: lerp(hb, h.b, fit), h: lerp(CARRY.wheel[1], hubH, fit), yaw: nYaw * (1 - fit), flip, by: ni };
      kits.push(k); nFig[5] = wheelGrips(k, h.r, h.w, na, nb, nFace);
    } else if (back < 1) nFig[5] = wheelGrips({ a: h.a, b: h.b, h: hubH, yaw: 0, flip }, h.r, h.w, na, nb, nFace, 1 - back);   // (letting go of it on the car)
    off[i] = t >= C.off[0] && t < C.on[1];
  });
  // The front jack (formula1.com, "Anatomy of a pit stop", 2 Mar 2025 – 2024–25 cars): the nose meets it just before
  // the car stands, the car is up by ~0.3 s; at ~0.8 s its man "engages the swivel and steps aside" – the car still up,
  // the head still under the nose, the handle swung round it – and by ~1.6 s he is clear, ready to press the release; the
  // car drops "while the jack is still swinging" and drives off over and past it. Which way he swings isn't said: here
  // to the garages' side (away from the car's way out – an estimate, L), JACKS.swivel round (60–90° in photos, L); once
  // it has dropped he pulls the jack out further that way.
  const kF = liftF / C.lift, kR = liftR / C.lift, sw = ss(C.swivel[0], C.swivel[1], w), clear = ss(dropAt, dropAt + 0.35, s);
  const psi = left * JACKS.swivel * sw, fa = d.FZ + (d.JF ?? JACKS.front) + 0.25 * clear, fbb = left * JACKS.clear * clear;
  const fj = { kind: "jack", a: fa, b: fbb, h: 0, yaw: psi, tilt: lerp(JACKS.tiltUp, JACKS.tiltDown, kF), by: figures.length }, ff = psi + Math.PI;
  let fPose = blendPose("jack", "jackDown", kF);
  if (sw > 0.001 && sw < 0.999) fPose = shuffle(fPose, 0, left, JACKS.man * JACKS.swivel * sw, JACKS.man * JACKS.swivel);   // (round the jack: to his right with the garages on the car's left)
  else if (clear > 0.001 && clear < 0.999) fPose = shuffle(fPose, left * Math.sin(ff), -left * Math.cos(ff), JACKS.clear * clear, JACKS.clear);
  kits.push(fj); figures.push([fa + Math.cos(psi) * JACKS.man, fbb + Math.sin(psi) * JACKS.man, ff, fPose, null, jackGripsAB(fj, ff)]);
  // The rear jack (same source; Red Bull's sporting director, redbullracing.com 2021: it "has to wait until the car has
  // come past to engage it"): waiting beside the box, out of the car's way, moving in once the car has passed – just
  // before it stands – and lifting at ~0.4 s. Worked from behind the car and to one side, its handle at roughly 45° (the
  // stop photos and McLaren's 2023 record-stop video, formula1.com; M) – here the garages' side (L).
  const rIn = ss(C.rearIn[0], C.rearIn[1], w), rOut = 1 - rIn, ry = Math.PI - left * JACKS.rearAngle, rf = ry + Math.PI;
  const rDa = JACKS.rearWait[0], rDb = -left * JACKS.rearWait[1];   // (the way in: from the wait to the place behind the car)
  const ra = d.RZ - (d.JR ?? JACKS.rear) - rDa * rOut, rb = -rDb * rOut;
  const rj = { kind: "jack", a: ra, b: rb, h: 0, yaw: ry, tilt: lerp(JACKS.tiltUp, JACKS.tiltDown, kR), by: figures.length };
  let rPose = blendPose("jack", "jackDown", kR);
  if (rIn > 0.001 && rIn < 0.999) { const L = Math.hypot(rDa, rDb); rPose = shuffle("jack", rDa * Math.cos(rf) + rDb * Math.sin(rf), rDa * Math.sin(rf) - rDb * Math.cos(rf), L * rIn, L); }
  kits.push(rj); figures.push([ra + Math.cos(ry) * JACKS.man, rb + Math.sin(ry) * JACKS.man, rf, rPose, null, jackGripsAB(rj, rf)]);
  // The front wing's adjusters (still at modern stops: two "wing-winders" with pre-set torque drivers – formula1.com
  // 2025; Haas 2026, motorsport.com) beside the wing's ends, out of the swinging jack's way; as the car drops the one on
  // the fast lane's side steps back and out beside the front wheel (the car turns out through where he stood).
  const wing = (sd) => (sd === -left ? [d.FZ + 0.75 - 0.45 * clear, sd * (1.3 + 1.05 * clear)] : [d.FZ + 0.75, sd * 1.3]);
  const wingPose = (sd) => (sd === -left && clear > 0.001 && clear < 0.999 ? shuffle("ready", -0.45 * Math.cos(sd * Math.PI * 0.85) + sd * 1.05 * Math.sin(sd * Math.PI * 0.85), -0.45 * Math.sin(sd * Math.PI * 0.85) - sd * 1.05 * Math.cos(sd * Math.PI * 0.85), 1.14 * clear, 1.14) : "ready");
  figures.push([...wing(1), Math.PI * 0.85, wingPose(1), null, null], [...wing(-1), -Math.PI * 0.85, wingPose(-1), null, null]);
  // the stabilisers: one each side, hands on the sidepod's top by the cockpit from just before the car stands until it
  // drops (formula1.com 2025; they also wipe the visor and mirrors – not drawn)
  const steady = ss(-0.1, 0.1, w) * (1 - down);
  for (const sd of [1, -1]) {
    const f = -sd * Math.PI / 2, [h0, h1] = byRight(f, [0.32, sd * 0.5], [-0.02, sd * 0.52]), sw2 = ss(0, 0.6, steady);
    figures.push([0.15, sd * 1.35, f, blendPose("ready", "reach", steady * 0.6), null, sw2 > 0 ? [[h0[0], h0[1], 0.66, sw2, 1, 0, 0], [h1[0], h1[1], 0.64, sw2, 1, 0, 0]] : null]);
  }
  // the release: a light on the gantry, worked by the chief mechanic (formula1.com 2025: the lollipop long replaced by the light) – he
  // stands at the box's front corner looking up the lane (where: L), stepping back beside the car as it drops
  figures.push([3.6 - 3.0 * clear, -left * (2.15 + 0.15 * clear), left > 0 ? Math.PI * 0.75 : -Math.PI * 0.75, "stand", null, null]);
  // the spare rear jack (Mercedes, "up to 22", 2023; formula1.com 2025: the back-up rear jack beside the car with its jack
  // upright on its wheels): standing by behind the rear wheel – on the fast lane's side here (formula1.com says the car's
  // right; the garages' side is the working rear jack's way in; L)
  const sa = d.RZ - 2.0, sb = -left * 1.75, sf = left * Math.PI / 2, sj = { kind: "jack", a: sa + Math.cos(sf) * 0.52, b: sb + Math.sin(sf) * 0.52, h: 0, yaw: sf + Math.PI, tilt: JACKS.upright, by: figures.length };
  kits.push(sj); figures.push([sa, sb, sf, "stand", null, jackGripsAB(sj, sf)]);
  return { figures, kits, car: { lift: [liftF, liftR], off } };
}
// (a wheel's turn either way round – the one nearer its turn on the car)
const nearYaw = (y) => (Math.abs(y) > Math.PI / 2 ? wrapPi(y + Math.PI) : y);

// Before the stop (a car of the team coming: f 0 → 1 as it nears) and after it (the car gone: f 1 → 0 back to the
// garage): the tyre-change crew walking out to its places with the new wheels, guns and jacks, and back with the old
// wheels. Positions blend between the garage's opening (boxC − 0.7 m out) and the places at the stop's start or end;
// those ahead of the car walk back by the garage side (the car drove off through where they stood). Walking, each
// carries his kit in front of him (CARRY), his feet in step with the distance walked (walkPhase).
export function changeWalk(phase, f, d, boxC, left = 1, C = CHANGE) {
  const mouth = left * (boxC - 0.7), k = clamp01(f), moving = k > 0.02 && k < 0.98;
  const at = phase === "ready" ? stopChoreo({ wait: 0, D: null }, -1, d, left, C) : stopChoreo({ wait: 0, D: C.base }, C.base + 1, d, left, C);
  const figures = at.figures.map(([a, b, face, pose, kit, grips], i) => {
    const ahead = phase === "back" && a > 2;
    const y = ahead ? mouth + (left * Math.max(left * b, 1.6) - mouth) * k * 0.5 : mouth + (b - mouth) * k;
    return [a, y, moving ? (phase === "back" ? left * Math.PI / 2 : -left * Math.PI / 2) : face, moving ? walkPose(walkPhase(Math.abs(y - mouth)) + i) : pose, kit, moving ? null : grips];
  });
  const kits = [], hubs = hubsOf(d);
  for (const kt of at.kits) {
    // a kit goes with its holder – new wheels, guns and jacks out, old wheels, guns and jacks back
    if ((phase === "ready" && kt.kind === "old") || (phase === "back" && kt.kind === "new")) continue;
    const i = kt.by ?? 0, [a0, b0] = at.figures[i], fig = figures[i], [a1, b1, face] = fig;
    let K;
    if (!moving) K = { ...kt, a: kt.a + (a1 - a0), b: kt.b + (b1 - b0) };
    else if (kt.kind === "gun") K = { ...kt, a: a1 + Math.cos(face) * CARRY.gun[0], b: b1 + Math.sin(face) * CARRY.gun[0], h: CARRY.gun[1], yaw: face };
    else if (kt.kind === "jack") { const t = JACKS.tiltUp, L = 0.42 + JACK.bar * Math.cos(t); K = { ...kt, a: a1 + Math.cos(face) * L, b: b1 + Math.sin(face) * L, yaw: face + Math.PI, tilt: t }; }
    else K = { ...kt, a: a1 + Math.cos(face) * CARRY.wheel[0], b: b1 + Math.sin(face) * CARRY.wheel[0], h: CARRY.wheel[1], yaw: wrapPi(face - Math.PI / 2), flip: false };
    kits.push(K);
    if (moving) {
      const hb = hubs.find((x) => x.axle === kt.axle) || hubs[0];
      fig[5] = K.kind === "gun" ? gunGripsAB(K) : K.kind === "jack" ? jackGripsAB(K, face) : wheelGrips(K, hb.r, hb.w, a1, b1, face);
    } else if (fig[5]) fig[5] = fig[5].map((g) => g && [g[0] + (a1 - a0), g[1] + (b1 - b0), ...g.slice(2)]);
  }
  return { figures, kits, car: null };
}

// ---------- the figures: jointed ----------
// One person (body3d.js: 1.78 m, the segment lengths of Drillis & Contini as in Winter 2009), rigid parts on a
// skeleton – hips, knees, ankles, the low back, neck, shoulders, elbows, wrists – posed by joint angles, so poses blend
// smoothly (a gunner kneeling down, a jack man pulling his lever). Tapered limbs end in joint spheres (no gaps at a
// bent knee or elbow); the bones never change length. Hands reach for what they hold (the wheel gun's grips, a tyre's
// tread, the jack's handle, a flag's pole, the pit wall console) by a two-bone reach from the shoulder: the pose's arm
// angles are only where the hands rest when they hold nothing. Standing figures stand on y = 0 (the lowest of their
// soles and knees); seated ones sit at the pose's seat height with their feet on the floor.
// Every body part is one instanced mesh for all the crews (a part per person in it): the overalls and the helmet's
// shell in the team's colour, the visor, balaclava, gloves and shoes dark.
// Angles (rad): th – thigh from straight down, + forward; sh – the shin's own angle from straight down (+ the foot
// ahead of the knee); lean – the trunk forward from upright; arm – per arm [flex (from straight down, + forward),
// spread (out to the side), elbow bend]. Index 0: the leg / arm on the figure's +z side. Optional: seat (the hips'
// height, sitting) with feet [x, x] (the ankles' distance ahead, the soles at footY – the floor or a footrest), head
// (the head's pitch).
// Or planted (the crews' working poses): plant = { hip (the hip joints' height), ankle: [[x, y] × 2] (each ankle's place
// under the hips: ahead, above the ground), foot: [pitch × 2] } – the legs reached to their ankles, so a pose says where
// the feet and knees touch the ground and they stay there through a blend (v0.39 posed the working figures by angles
// alone, the lowest point put on the ground: the kneeling gunner knelt 22 cm above it on one toe, the jack men's
// front feet were 9–12 cm up). Written with stance() from where the soles and knees go.
const FOOT_ROM = [-1.05, 0.44];   // the foot's pitch from flat, relative to the shin's angle (ankle ~65°–150° to the shin)
const _sa = [0, 0, 0], _sb = [0, 0, 0];
// a sole's lowest point (toe or heel) for an ankle at height ay with the foot at pitch p
const soleLow = (ay, p) => Math.min(ay + BODY.footFront * Math.sin(p) - BODY.ankle * Math.cos(p), ay - BODY.footBack * Math.sin(p) - BODY.ankle * Math.cos(p));
// the foot's pitch: as wanted, within the ankle's range for the shin from knee k to ankle a
const footPitch = (k, a, want) => { const shA = Math.atan2(a[0] - k[0], -(a[1] - k[1])); return Math.max(shA + FOOT_ROM[0], Math.min(shA + FOOT_ROM[1], want)); };
// a foot on the ground at x (the ankle's distance ahead of the hips) for hips at `hip`: the ankle's height that puts the
// sole's lowest point on the ground with the foot as near the pitch wanted as the ankle allows (flat, or on its toes)
function footOnGround(hip, x, want = 0) {
  let ay = BODY.ankle, p = want;
  for (let it = 0; it < 6; it++) {
    reach2([0, hip, 0], [x, ay, 0], BODY.thigh, BODY.shank, [1, 0, 0], _sa, _sb);
    p = footPitch(_sa, _sb, want); ay -= soleLow(ay, p);
  }
  return [x, ay, p];
}
// a knee on the ground at kx (ahead of the hips; its sphere touching), the shin back along the ground and the foot
// stretched back on its toes' tip – how one kneels on a hard floor; the hips then at the thigh's length over the knee
function kneeOnGround(kx) {
  const ky = JOINT_R.knee, hip = ky + Math.sqrt(BODY.thigh ** 2 - kx * kx);
  // (the shin's rise from the knee: the least that brings the toe's tip down to the ground, the foot pointed)
  let lo = -0.2, hi = 0.8, a = 0, p = 0;
  for (let it = 0; it < 30; it++) {
    a = (lo + hi) / 2; const ax = kx - Math.cos(a) * BODY.shank, ay = ky + Math.sin(a) * BODY.shank; p = footPitch([kx, ky], [ax, ay], -3);
    if (soleLow(ay, p) > 0) hi = a; else lo = a;
  }
  return { hip, leg: [kx - Math.cos(a) * BODY.shank, ky + Math.sin(a) * BODY.shank, p] };
}
// legs: per leg ["foot", x, pitch wanted] or ["knee", kx]; the hips' height from a kneeling leg, else `hip`
export function stance(hip, legs, rest) {
  const kn = legs.map((l) => (l[0] === "knee" ? kneeOnGround(l[1]) : null)), h = kn.find(Boolean)?.hip ?? hip;
  const L = legs.map((l, i) => kn[i]?.leg || footOnGround(h, l[1], l[2] ?? 0));
  return { ...rest, plant: { hip: h, ankle: L.map(([x, y]) => [x, y]), foot: L.map((l) => l[2]) } };
}
export const POSES = {
  stand: { th: [0.03, 0.03], sh: [-0.03, -0.03], lean: 0.03, arm: [[0.12, 0.1, 0.2], [0.12, 0.1, 0.2]] },
  // (waiting crouched, on the balls of the feet – the ankle's range lifts the heels in so deep a crouch)
  ready: stance(0.7, [["foot", 0.1], ["foot", 0.04]], { lean: 0.55, arm: [[0.9, 0.18, 0.5], [0.9, 0.18, 0.5]] }),
  // (a lunge towards the wheel: the near foot ahead flat, the other back on its toes)
  reach: stance(0.7, [["foot", 0.42], ["foot", -0.3, -0.6]], { lean: 0.95, arm: [[1.35, 0.25, 0.15], [1.35, 0.25, 0.15]] }),
  // (the gunner: down on one knee – on the ground – the other foot flat ahead, both hands on the gun; F1 media photos
  // 2024–25)
  kneel: stance(0, [["foot", 0.42], ["knee", 0.1]], { lean: 0.75, arm: [[1.3, 0.12, 0.35], [1.25, 0.14, 0.4]] }),
  signal: stance(0, [["foot", 0.42], ["knee", 0.1]], { lean: 0.35, arm: [[1.3, 0.12, 0.35], [2.95, 0.15, 0.1]] }),
  carry: stance(0.86, [["foot", 0.08], ["foot", -0.02]], { lean: 0.3, arm: [[0.6, 0.3, 0.9], [0.6, 0.3, 0.9]] }),
  // (the jack men: braced, a foot ahead, pulling the lever down to the deep lunge as the car goes up)
  jack: stance(0.88, [["foot", 0.3], ["foot", -0.22]], { lean: 0.7, arm: [[1.0, 0.16, 0.3], [1.0, 0.16, 0.3]] }),
  jackDown: stance(0.66, [["foot", 0.42], ["foot", -0.42, -0.7]], { lean: 0.62, arm: [[1.3, 0.16, 0.1], [1.3, 0.16, 0.1]] }),
};
// A walk: the planted foot slides back under the hips at an even speed while the other swings ahead (the knee bending
// it clear of the ground) – a step of WALK.step m each half cycle, so a figure that moves d metres is walkPhase(d)
// into its cycle and its planted foot stays where it was put down (no skating). Step ~0.4 × stature (an ordinary
// walking step; M).
export const WALK = { step: 0.72, lift: 0.07, bend: 0.035 };
export const walkPhase = (dist) => (dist * Math.PI) / WALK.step;
const _m = [0, 0, 0], _e = [0, 0, 0], _o = [0, 0, 0];
export function walkPose(ph) {
  const s = WALK.step / 2, Lx = BODY.thigh + BODY.shank - 0.008, th = [0, 0], sh = [0, 0], X = [0, 0], Y = [0, 0];
  let stanceX = 0;
  for (let i = 0; i < 2; i++) {
    const u = (((ph / (2 * Math.PI) + i * 0.5) % 1) + 1) % 1;
    if (u < 0.5) { X[i] = s * (1 - 4 * u); stanceX = X[i]; }            // planted: from ahead to behind, evenly
    else { const v = (u - 0.5) * 2, e = v * v * (3 - 2 * v); X[i] = -s + 2 * s * e; Y[i] = WALK.lift * Math.sin(Math.PI * v); }
  }
  // (the hips as high as the planted leg allows – lowest with the feet apart: the walk's natural rise and fall)
  const legH = Math.min(BODY.thigh + BODY.shank - WALK.bend, Math.sqrt(Lx * Lx - stanceX * stanceX));
  for (let i = 0; i < 2; i++) {
    reach2(_o, [X[i], -legH + Y[i], 0], BODY.thigh, BODY.shank, [1, 0, 0], _m, _e);
    th[i] = Math.atan2(_m[0], -_m[1]); sh[i] = Math.atan2(_e[0] - _m[0], -(_e[1] - _m[1]));
  }
  const sw = Math.sin(ph);
  return { th, sh, lean: 0.08, arm: [[0.32 * sw, 0.1, 0.35], [-0.32 * sw, 0.1, 0.35]] };
}
POSES.walk = walkPose(0);
// Short quick steps from a planted pose (a jack man swinging round his jack, the rear jack man swooping in behind the car):
// the pose's feet stepping along the way he moves – (ux, uz) in his own frame (x ahead, z his right) –, d of the `total`
// metres moved: each foot planted while the body passes over it, then lifted and put down ahead (SHUFFLE.step a step,
// eased in and out over the first and last steps so the feet start and end where the pose has them). Estimated (M: the
// crouched side-steps of the jack men in the stop photos and videos – formula1.com, 2024–25).
export const SHUFFLE = { step: 0.34, side: 0.18, lift: 0.06 };
export function shuffle(P, ux, uz, d, total) {
  P = poseOf(P); const base = plantOf(P), st = SHUFFLE.step, ul = Math.hypot(ux, uz) || 1;
  const e = Math.min(1, d / st, Math.max(0, total - d) / st);
  // (mostly sideways: the leading foot steps out, then the other closes up to it – the feet never cross; each moves
  // 2·side a cycle while the body moves side per half)
  const lateral = Math.abs(uz) > 0.4 * ul, lead = uz > 0 ? 0 : 1, a = SHUFFLE.side;
  const ankle = base.ankle.map(([x, y, z = 0], i) => {
    let off, lift = 0;
    if (lateral) {
      const v = (((d / (2 * a)) % 1) + 1) % 1, mine = (i === lead) === (v < 0.5), w = (v % 0.5) * 2, sm = w * w * (3 - 2 * w);
      // (relative to the hips: the moving foot from its place out by a – or in, the trailing one – the planted one back)
      off = (i === lead ? 1 : -1) * a * (mine ? (i === lead ? sm : 1 - sm) : (i === lead ? 1 - w : w));
      if (mine) lift = SHUFFLE.lift * Math.sin(Math.PI * w);
    } else {
      const v = (((d / (2 * st) + i * 0.5) % 1) + 1) % 1;
      if (v < 0.5) off = (st / 2) * (1 - 4 * v);
      else { const w = (v - 0.5) * 2, sm = w * w * (3 - 2 * w); off = -st / 2 + st * sm; lift = SHUFFLE.lift * Math.sin(Math.PI * w); }
    }
    return [x + (ux / ul) * off * e, y + lift * e, z + (uz / ul) * off * e];
  });
  // (the hips no higher than lets each leg reach its foot)
  let hip = base.hip; for (const [x, y, z] of ankle) hip = Math.min(hip, y + Math.sqrt(Math.max(0, (BODY.thigh + BODY.shank - 0.012) ** 2 - x * x - z * z)));
  return { ...P, plant: { hip, ankle, foot: base.foot } };
}
const poseOf = (p) => (typeof p === "string" ? POSES[p] || POSES.stand : p || POSES.stand);
export function blendPose(a, b, k) {
  const A = poseOf(a), B = poseOf(b); k = clamp01(k);
  if (k <= 0) return A; if (k >= 1) return B;
  const out = { lean: lerp(A.lean, B.lean, k), arm: [0, 1].map((i) => [0, 1, 2].map((j) => lerp(A.arm[i][j], B.arm[i][j], k))) };
  if (A.th && B.th) { out.th = [lerp(A.th[0], B.th[0], k), lerp(A.th[1], B.th[1], k)]; out.sh = [lerp(A.sh[0], B.sh[0], k), lerp(A.sh[1], B.sh[1], k)]; }
  if (A.head != null || B.head != null) out.head = lerp(A.head ?? A.lean * 0.3, B.head ?? B.lean * 0.3, k);
  if (A.seat != null && B.seat != null) { out.th = out.th || A.th; out.sh = out.sh || A.sh; out.seat = lerp(A.seat, B.seat, k); out.footY = lerp(A.footY || 0, B.footY || 0, k); out.feet = [lerp(A.feet[0], B.feet[0], k), lerp(A.feet[1], B.feet[1], k)]; }
  // (a planted pose with another: both as planted – the ankles' places blended, so a foot on the ground in both stays on
  // it, and a knee goes down to the ground in one even move)
  else if (A.plant || B.plant) {
    const a = plantOf(A), b = plantOf(B);
    out.plant = { hip: lerp(a.hip, b.hip, k), ankle: [0, 1].map((i) => [lerp(a.ankle[i][0], b.ankle[i][0], k), lerp(a.ankle[i][1], b.ankle[i][1], k), lerp(a.ankle[i][2] || 0, b.ankle[i][2] || 0, k)]), foot: [0, 1].map((i) => lerp(a.foot[i], b.foot[i], k)) };
  }
  return out;
}
// a pose's legs as planted (angles: where they put the ankles and feet, the lowest point on the ground)
function plantOf(P) {
  if (P.plant) return P.plant;
  const kn = [], an = [], ft = []; let low = Infinity;
  for (let i = 0; i < 2; i++) {
    const kx = Math.sin(P.th[i]) * BODY.thigh, ky = -Math.cos(P.th[i]) * BODY.thigh, ax = kx + Math.sin(P.sh[i]) * BODY.shank, ay = ky - Math.cos(P.sh[i]) * BODY.shank;
    const p = footPitch([kx, ky], [ax, ay], P.foot?.[i] ?? 0);
    low = Math.min(low, soleLow(ay, p), ky - JOINT_R.knee); kn.push(ky); an.push([ax, ay]); ft.push(p);
  }
  return { hip: -low, ankle: an.map(([x, y]) => [x, y - low]), foot: ft };
}
// the limbs' lengths (constants: no pose stretches a bone)
export const LIMB = { thigh: BODY.thigh, shin: BODY.shank, uarm: BODY.uarm, farm: BODY.farm, reach: BODY.farm + BODY.grip };

// The body's parts for a pose, in the person's frame (x forward, y up, z across), through
//   put(part, x, y, z, yx, yy, yz, xx, xy, xz, s): the part's origin, its +y direction (a limb: from its near joint to
//   its far one), its +x direction (null: any square to +y) and a scale (joint spheres: their radius; else null).
// hands: [[x, y, z, w, ax, ay, az] | null × 2] – what each hand holds, in the person's frame: the point a closed fist
// grips (w: 0 the pose's own arm, 1 on the point), the axis of the handle through the fist (optional).
// Returns the hands' grip points [[x, y, z] × 2], with .joints (each joint's place, .short: how far a hand stayed
// from its point, .ground: the lowest sole/knee) for the callers that hang things on a hand and for the tests.
export function skeleton(P, put = null, hands = null) {
  P = poseOf(P);
  const B = BODY, K = { knee: [], ankle: [], foot: [], shoulder: [], elbow: [], wrist: [], grip: [], short: [0, 0] };
  // legs: from each hip joint (at height 0 first), the knee and the ankle; the foot as flat as the ankle allows
  let low = Infinity, hip = 0;
  const seated = P.seat != null && P.feet, PL = !seated && P.plant;
  for (let i = 0; i < 2; i++) {
    const z = (i ? -1 : 1) * B.hipZ;
    let kx, ky, ax, ay, kz = 0, az = 0;
    if (PL) {
      // (relative to the hips, as the other ways: put at the plant's height below; a foot may be stepped out sideways –
      // its third number, out from under its hip)
      reach2([0, 0, 0], [PL.ankle[i][0], PL.ankle[i][1] - PL.hip, PL.ankle[i][2] || 0], B.thigh, B.shank, [1, 0, 0], _m, _e);
      kx = _m[0]; ky = _m[1]; ax = _e[0]; ay = _e[1]; kz = _m[2]; az = _e[2];
    } else if (seated) {
      reach2([0, 0, 0], [P.feet[i], (P.footY || 0) + B.ankle - P.seat, 0], B.thigh, B.shank, [1, 0.6, 0], _m, _e);
      kx = _m[0]; ky = _m[1]; ax = _e[0]; ay = _e[1];
    } else {
      kx = Math.sin(P.th[i]) * B.thigh; ky = -Math.cos(P.th[i]) * B.thigh;
      ax = kx + Math.sin(P.sh[i]) * B.shank; ay = ky - Math.cos(P.sh[i]) * B.shank;
    }
    const p = footPitch([kx, ky], [ax, ay], PL ? PL.foot[i] : P.foot?.[i] ?? 0);
    const c = Math.cos(p), s = Math.sin(p);
    const toeY = ay + B.footFront * s - B.ankle * c, heelY = ay - B.footBack * s - B.ankle * c;
    low = Math.min(low, toeY, heelY, ky - JOINT_R.knee);
    K.knee.push([kx, ky, z + kz]); K.ankle.push([ax, ay, z + az]); K.foot.push(p);
  }
  // (planted: at the plant's height – lifted only if a blend would push a sole or knee into the ground)
  hip = seated ? P.seat : PL ? Math.max(PL.hip, -low) : -low;
  for (let i = 0; i < 2; i++) { K.knee[i][1] += hip; K.ankle[i][1] += hip; }
  K.hip = hip; K.ground = seated ? null : 0;
  // trunk: the pelvis tips a third of the lean, the chest the whole lean; the head stays nearer upright (eyes ahead).
  // A hand that can't reach its point bends the trunk a little further towards it (never past 1.35 rad).
  const shoulders = (L) => {
    const pl = L * 0.35, lx = Math.sin(pl) * B.lumbar, ly = hip + Math.cos(pl) * B.lumbar, cx = Math.sin(L), cy = Math.cos(L);
    return { L, pl, lx, ly, cx, cy, S: [0, 1].map((i) => [lx + cx * B.chestShoulder - 0.012 * cy, ly + cy * B.chestShoulder + 0.012 * cx, (i ? -1 : 1) * B.shoulderZ]) };
  };
  let T = shoulders(P.lean);
  if (hands) {
    const miss = (tt) => { let m = 0; for (let i = 0; i < 2; i++) { const h = hands[i]; if (h && (h[3] ?? 1) >= 0.5) m = Math.max(m, Math.hypot(h[0] - tt.S[i][0], h[1] - tt.S[i][1], h[2] - tt.S[i][2]) - (B.uarm + LIMB.reach - 0.01)); } return m; };
    for (let k = 0, m = miss(T); m > 0 && k < 8 && T.L < 1.35; k++) { const n = shoulders(T.L + 0.08), mn = miss(n); if (mn >= m) break; T = n; m = mn; }
  }
  const { L, pl, lx, ly, cx, cy } = T;
  K.lean = L; K.lumbar = [lx, ly, 0];
  const Q = put || (() => {});
  Q("pelvis", lx, ly, 0, Math.sin(pl), Math.cos(pl), 0, Math.cos(pl), -Math.sin(pl), 0, null);
  Q("belt", lx, ly, 0, Math.sin(pl), Math.cos(pl), 0, Math.cos(pl), -Math.sin(pl), 0, null);
  Q("chest", lx, ly, 0, cx, cy, 0, cy, -cx, 0, null);
  const nx = lx + cx * B.neck, ny = ly + cy * B.neck, hp = P.head ?? L * 0.3, hx = Math.sin(hp), hy = Math.cos(hp);
  Q("neck", lx + cx * (B.neck - 0.085), ly + cy * (B.neck - 0.085), 0, cx * 0.5 + hx * 0.5, cy * 0.5 + hy * 0.5, 0, null, null, null, null);
  const hcx = nx + hx * B.headC + hy * 0.012, hcy = ny + hy * B.headC - hx * 0.012;
  K.head = [hcx, hcy, 0];
  for (const part of ["head", "visor", "hair"]) Q(part, hcx, hcy, 0, hx, hy, 0, hy, -hx, 0, null);
  // legs drawn: thigh from the hip joint, shin from the knee, the knee's sphere, the shoe from the ankle
  for (let i = 0; i < 2; i++) {
    const z = (i ? -1 : 1) * B.hipZ, [kx, ky, kz] = K.knee[i], [ax, ay, az] = K.ankle[i], p = K.foot[i];
    Q("thigh", 0, hip, z, kx / B.thigh, (ky - hip) / B.thigh, (kz - z) / B.thigh, null, null, null, null);
    Q("knee", kx, ky, kz, 0, 1, 0, null, null, null, JOINT_R.knee);
    Q("shin", kx, ky, kz, (ax - kx) / B.shank, (ay - ky) / B.shank, (az - kz) / B.shank, null, null, null, null);
    Q("boot", ax, ay, az, -Math.sin(p), Math.cos(p), 0, Math.cos(p), Math.sin(p), 0, null);
  }
  // arms: the pose's angles, or a reach to what the hand holds (the elbow bent down and out)
  const out = [];
  for (let i = 0; i < 2; i++) {
    const side = i ? -1 : 1, [a, sp, el] = P.arm[i], S = T.S[i], cs = Math.cos(sp), ss_ = Math.sin(sp);
    const E = [S[0] + Math.sin(a) * cs * B.uarm, S[1] - Math.cos(a) * cs * B.uarm, S[2] + side * ss_ * B.uarm];
    const b = a + el, G = [E[0] + Math.sin(b) * cs * LIMB.reach, E[1] - Math.cos(b) * cs * LIMB.reach, E[2] + side * ss_ * LIMB.reach];
    const h = hands?.[i];
    if (h && (h[3] ?? 1) > 0) {
      const w = clamp01(h[3] ?? 1), tg = [lerp(G[0], h[0], w), lerp(G[1], h[1], w), lerp(G[2], h[2], w)];
      // (the elbow's way: down and out, back a little; for a hand above the shoulder, out to the side)
      const up = tg[1] > S[1] + 0.1, pole = up ? [-0.3, -0.2, side] : [-0.25, -1, side * 0.75];
      K.short[i] = reach2(S, tg, B.uarm, LIMB.reach, pole, E, G) * (w >= 0.999 ? 1 : 0);
    }
    const dx = G[0] - E[0], dy = G[1] - E[1], dz = G[2] - E[2], dl = Math.hypot(dx, dy, dz) || 1, fx = dx / dl, fy = dy / dl, fz = dz / dl;
    const W = [E[0] + fx * B.farm, E[1] + fy * B.farm, E[2] + fz * B.farm];
    const ux = E[0] - S[0], uy = E[1] - S[1], uz = E[2] - S[2], ul = Math.hypot(ux, uy, uz) || 1;
    Q("shoulder", S[0], S[1], S[2], 0, 1, 0, null, null, null, JOINT_R.shoulder);
    Q("uarm", S[0], S[1], S[2], ux / ul, uy / ul, uz / ul, null, null, null, null);
    Q("elbow", E[0], E[1], E[2], 0, 1, 0, null, null, null, JOINT_R.elbow);
    Q("farm", E[0], E[1], E[2], fx, fy, fz, null, null, null, null);
    // the fist: its handle's axis – what it holds, else across the body for a hand ahead of it, else ahead (a hanging
    // arm's knuckles face forward)
    let gx = h?.[4] ?? 0, gy = h?.[5] ?? 0, gz = h?.[6] ?? (fx > 0.6 ? side : 0);
    if (h?.[4] == null && !(fx > 0.6)) gx = 1;
    // (body3d's fist is a left hand: the right one – index 0, the +z side – is its mirror image, a part of its own)
    Q(i ? "glove" : "gloveR", W[0], W[1], W[2], fx, fy, fz, gx, gy, gz, null);
    K.shoulder.push(S); K.elbow.push(E); K.wrist.push(W); K.grip.push(G);
    out.push(G);
  }
  out.joints = K;
  return out;
}
// A held flag's pole (marshals, the rear-of-grid official): the fist round it, the pole along the forearm tipped up a
// little (the wrist cocked), the hand a hand's breadth above the pole's end – in the person's frame
export function flagHold(pose, i = 1) {
  const j = skeleton(pose).joints, G = j.grip[i], E = j.elbow[i];
  let ax = G[0] - E[0], ay = G[1] - E[1] + 0.35 * LIMB.reach, az = G[2] - E[2]; const l = Math.hypot(ax, ay, az) || 1;
  return { at: G, axis: [ax / l, ay / l, az / l] };
}
// a marshal's or official's flag: waving (w: −1…1 the arm's swing, from the session's time) or held still
export const flagPose = (w, still = false) => (still ? { th: [0.03, 0.03], sh: [-0.03, -0.03], lean: 0.02, arm: [[0.12, 0.12, 0.25], [0.12, 0.12, 0.25]] }
  : { th: [0.03, 0.03], sh: [-0.03, -0.03], lean: 0.04, arm: [[0.12, 0.1, 0.25], [2.45 + 0.42 * w, 0.32, 0.25 - 0.1 * w]] });

// the parts: [geometry (from its joint, limbs along +y), in the team's colour, small (left out far away), per person]
function partGeometries() {
  const ring = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 16, 1, true).scale(0.72, 1, 1.02);
  return {
    pelvis: [pelvisGeometry(), true, false, 1], chest: [yokedChest(), true, false, 1], belt: [ring, false, true, 1],
    neck: [limbGeometry(0.13, 0.058, 0.054, 0, 0.5, 1, 10, 2), false, false, 1],
    head: [helmetGeometry(), true, false, 1], visor: [visorGeometry(), false, true, 1],
    // (marshals and officials: no helmet – orange overalls, gloves, a hat; Motorsport UK 2025, F1 Singapore 2025 – a bare
    // face and a cap in the overalls' colour)
    face: [headGeometry(), "skin", false, 1], cap: [capGeometry(), true, false, 1], brows: [browsGeometry(), false, true, 1],
    thigh: [LIMB_GEO.thigh(), true, false, 2], shin: [LIMB_GEO.shin(), true, false, 2], uarm: [LIMB_GEO.uarm(), true, false, 2], farm: [LIMB_GEO.farm(), true, false, 2],
    joint: [new THREE.SphereGeometry(1, 12, 8), true, true, 6], boot: [shoeGeometry(), false, true, 2],
    gloveFine: [fistGeometry(true), false, true, 1], gloveMid: [fistGeometry(false), false, true, 1],
    gloveFineR: [mirrorX(fistGeometry(true)), false, true, 1], gloveMidR: [mirrorX(fistGeometry(false)), false, true, 1],
    farBody: [farBodyGeometry(), true, false, 1],
  };
}
// The chest with the shoulders' line across its top: a rounded bar from one shoulder joint to the other (the trapezius
// and the overalls' shoulder seams) – v0.39's narrow chest top left the shoulder spheres standing out like a doll's
function yokedChest() {
  const bar = new THREE.CapsuleGeometry(0.058, 2 * BODY.shoulderZ, 4, 12).rotateX(Math.PI / 2).scale(0.85, 0.9, 1).translate(-0.016, BODY.chestShoulder + 0.004, 0);
  const trap = new THREE.CapsuleGeometry(0.05, 2 * BODY.shoulderZ - 0.12, 4, 10).rotateX(Math.PI / 2).scale(0.9, 0.8, 1).translate(-0.02, BODY.chestShoulder + 0.04, 0);
  return mergeSimple([chestGeometry(), bar, trap]);
}
// Brows and eyes on a bare head (about its centre, facing +x): two dark strokes over two dark dots – enough for a face to
// read as one at a few metres
export function browsGeometry() {
  const parts = [];
  for (const sd of [1, -1]) {
    parts.push(new THREE.CapsuleGeometry(0.0045, 0.026, 2, 6).rotateX(Math.PI / 2).rotateY(sd * 0.25).translate(0.09, 0.03, sd * 0.032));
    parts.push(new THREE.SphereGeometry(0.0075, 8, 6).scale(0.6, 0.8, 1).translate(0.091, 0.012, sd * 0.031));
  }
  return mergeSimple(parts);
}
// A cap: the crown over the head's top and a peak ahead (about the head's centre, facing +x)
function capGeometry() {
  const crown = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, 1.15).scale(0.104, 0.1, 0.086).translate(-0.004, 0.035, 0);
  const peak = new THREE.CylinderGeometry(0.075, 0.075, 0.008, 14, 1, false, -Math.PI / 2, Math.PI).scale(1.1, 1, 1.05).rotateZ(-0.12).translate(0.07, 0.05, 0);
  return mergeSimple([crown, peak]);
}
// A geometry's mirror image across x (a right hand from a left one): the positions and normals mirrored, each
// triangle's winding turned back (an instance matrix with a negative determinant would leave three.js culling the
// wrong faces – it decides that per mesh, not per instance)
export function mirrorX(g) {
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  for (let i = 0; i < p.length; i += 3) { p[i] = -p[i]; n[i] = -n[i]; }
  for (let i = 0; i < p.length; i += 9) for (const a of [p, n]) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
  g.computeBoundingSphere(); return g;
}
// A whole figure standing, in one coarse geometry (~300 triangles): what stands for a person far away (CREW_LOD.body)
function farBodyGeometry() {
  const lo = { pelvis: trunkGeometry([[-0.2, 0.06], [-0.11, 0.15], [0, 0.13], [0.06, 0.11]], 0.64, 6), chest: trunkGeometry([[-0.04, 0.12], [0.2, 0.15], [0.33, 0.16], [0.42, 0.11], [0.45, 0.03]], 0.68, 6),
    head: new THREE.SphereGeometry(1, 6, 4).scale(0.15, 0.15, 0.13), thigh: limbGeometry(BODY.thigh, 0.075, 0.055, 0, 0.3, 1, 5, 1), shin: limbGeometry(BODY.shank, 0.055, 0.04, 0, 0.3, 1, 5, 1),
    uarm: limbGeometry(BODY.uarm, 0.05, 0.042, 0, 0.3, 1, 5, 1), farm: limbGeometry(BODY.farm + 0.06, 0.042, 0.035, 0, 0.3, 1, 5, 1), boot: new THREE.BoxGeometry(0.27, 0.07, 0.1).translate(0.07, -0.035, 0) };
  const out = [], m = new THREE.Matrix4();
  skeleton("stand", (part, x, y, z, yx, yy, yz, xx, xy, xz) => {
    const g = lo[part]; if (!g) return;
    partMatrix(m, new THREE.Matrix4(), x, y, z, yx, yy, yz, xx, xy, xz, null);
    out.push(g.clone().applyMatrix4(m));
  });
  for (const g of Object.values(lo)) g.dispose();
  return mergeSimple(out);
}
// geometries [[geometry, rgb]] into one, its vertex colours from each part's
function mergeGeo(gs) {
  const pos = [], nor = [], col = [];
  for (const [g0, c] of gs) {
    const g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position.array, n = g.attributes.normal.array;
    for (const v of p) pos.push(v); for (const v of n) nor.push(v); const own = g.attributes.color; for (let i = 0; i < p.length / 3; i++) own ? col.push(own.getX(i), own.getY(i), own.getZ(i)) : col.push(c[0], c[1], c[2]);
    if (g !== g0) g.dispose(); g0.dispose();
  }
  const m = new THREE.BufferGeometry(); m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  m.computeBoundingSphere(); return m;
}
// The kit. A wheel gun: its socket at the origin (on the wheel nut), the body behind it along −x, a pistol grip under
// its back end (the trigger hand) and a handle over its front (the other hand), the air hose out of the back – the
// usual shape of the guns teams use (team videos, 2024–25: a two-handed gun; sizes estimated, M). A jack: its base
// (the head that lifts the car and the wheels it rolls on) at the origin, and its lever – from the pivot up along +x
// to a T handle, turned by its tilt (the man at the handle pulls it down to lift the car).
export const GUN = { rear: [-0.29, -0.1, 0], rearAxis: [0.25, 1, 0], front: [-0.13, 0.105, 0], frontAxis: [1, 0, 0] };
export const JACK = { pivot: 0.075, bar: 1.05, half: 0.13 };
function kitParts() {
  const grey = [0.55, 0.58, 0.6], dark = [0.1, 0.1, 0.11], steel = [0.72, 0.74, 0.76];
  const gun = mergeGeo([
    [new THREE.CylinderGeometry(0.052, 0.056, 0.25, 14).rotateZ(Math.PI / 2).translate(-0.175, 0, 0), grey],
    [new THREE.CylinderGeometry(0.028, 0.034, 0.06, 10).rotateZ(Math.PI / 2).translate(-0.025, 0, 0), dark],     // the socket
    [new THREE.BoxGeometry(0.045, 0.14, 0.04).rotateZ(0.25).translate(-0.285, -0.095, 0), dark],                 // the pistol grip
    [new THREE.CylinderGeometry(0.014, 0.014, 0.14, 8).rotateZ(Math.PI / 2).translate(-0.13, 0.105, 0), dark],   // the front handle's bar
    [new THREE.BoxGeometry(0.018, 0.06, 0.018).translate(-0.07, 0.075, 0), dark], [new THREE.BoxGeometry(0.018, 0.06, 0.018).translate(-0.19, 0.075, 0), dark],
    [new THREE.CylinderGeometry(0.014, 0.014, 0.22, 6).rotateZ(Math.PI / 2 - 0.5).translate(-0.38, -0.05, 0), dark],   // the hose's start
  ]);
  const base = mergeGeo([
    [new THREE.BoxGeometry(0.2, 0.08, 0.36).translate(-0.04, 0.06, 0), grey], [new THREE.BoxGeometry(0.12, 0.04, 0.3).translate(-0.12, 0.11, 0), dark],   // the lifting head
    [new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12).rotateX(Math.PI / 2).translate(0, 0.045, 0.2), dark], [new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12).rotateX(Math.PI / 2).translate(0, 0.045, -0.2), dark],
  ]);
  const bar = mergeGeo([
    [new THREE.CylinderGeometry(0.022, 0.026, JACK.bar, 10).rotateZ(-Math.PI / 2).translate(JACK.bar / 2, 0, 0), steel],
    [new THREE.CylinderGeometry(0.018, 0.018, JACK.half * 2 + 0.06, 8).rotateX(Math.PI / 2).translate(JACK.bar, 0, 0), dark],   // the T handle
  ]);
  return { gun, base, bar };
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
  SHARED = { parts, kit: kitParts(), teamMat: new THREE.MeshStandardMaterial({ roughness: 0.72 }), darkMat: new THREE.MeshStandardMaterial({ color: "#17191c", roughness: 0.6 }),
    visorMat: new THREE.MeshStandardMaterial({ color: "#0b0d12", roughness: 0.08, metalness: 0.6 }),
    kitMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 }), bandMat: sidewallMaterial(0xffffff), bandMat26: sidewallMaterial(0xffffff, "2026") };
  for (const x of [SHARED.teamMat, SHARED.darkMat, SHARED.visorMat, SHARED.kitMat, SHARED.bandMat, SHARED.bandMat26]) x.userData.shared = true;
  for (const [g] of Object.values(parts)) g.userData.shared = true;
  for (const g of Object.values(SHARED.kit)) g.userData.shared = true;
  return SHARED;
}
// how a figure is drawn at its distance from the camera: near (fingers), mid (mittens), far (no small parts), beyond
// `body` one coarse standing figure (its pose too small to see there)
export const CREW_LOD = { near: 14, far: 90, body: 170 };
// a part's world matrix from put()'s arguments, into m4 (the person's matrix mp applied)
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _P = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
function partMatrix(m4, mp, x, y, z, yx, yy, yz, xx, xy, xz, s) {
  _Y.set(yx, yy, yz).normalize();
  if (xx != null) { _X.set(xx, xy, xz); _X.addScaledVector(_Y, -_X.dot(_Y)); }
  if (xx == null || _X.lengthSq() < 1e-6) { _q.setFromUnitVectors(_UP, _Y); m4.makeRotationFromQuaternion(_q); }
  else { _X.normalize(); _Z.crossVectors(_X, _Y); m4.makeBasis(_X, _Y, _Z); }
  if (s != null) m4.scale(_P.set(s, s, s));
  m4.setPosition(x, y, z);
  return m4.premultiply(mp);
}

// Crews for up to `max` people: { group, wheels(parts), place(figures, loose, cam), clear() }.
//   wheels(parts): the wheels' shape for this session's cars (car3d.js wheelParts; rebuilt when it changes)
//   place([{ x, y, z, yaw, colour, pose, kit, hands }], [{ kind, x, y, z, yaw, flip, band, tilt }], cam) – figures
//   (pose: a name or a pose; hands: what each hand holds, in the figure's frame – crewAt) and loose kit (kind "gun";
//   "jack" with its lever's tilt; "front" / "rear": a wheel off a car, band its sidewall's colour). Within
//   CREW_LOD.near of cam the gloves have fingers; beyond CREW_LOD.far the small parts (shoes, belt, visor, gloves,
//   joints) are left out.
export function crewMeshes(max = 120) {
  const S = shared(), group = new THREE.Group(); group.name = "crews";
  const mk = (geo, mat, n, coloured) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.visible = false; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; if (coloured) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); group.add(m); return m; };
  const body = {}; for (const [k, [g, team, small, per]] of Object.entries(S.parts)) body[k] = { mesh: mk(g, team ? S.teamMat : k === "visor" ? S.visorMat : S.darkMat, max * per, !!team), team, small, cap: max * per };
  for (const [k, b] of Object.entries(body)) b.mesh.name = k;
  const kit = { gun: mk(S.kit.gun, S.kitMat, max, false), jackBase: mk(S.kit.base, S.kitMat, 32, false), jackBar: mk(S.kit.bar, S.kitMat, 32, false) };
  const kitCap = { gun: max, jackBase: 32, jackBar: 32 };
  let wheel = null;   // { key, front, rear, frontBand, rearBand }
  const m4 = new THREE.Matrix4(), mp = new THREE.Matrix4(), mk4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  const counts = {}, alias = { knee: "joint", elbow: "joint", shoulder: "joint" };
  let lod = "mid", colour = col, bare = false;
  const skin = new THREE.Color();
  // a part at its place in the person's frame, into the world through the person's matrix (mp); a marshal's (bare) head
  // a face and a cap, no helmet or visor
  const put = (part, x, y, z, yx, yy, yz, xx, xy, xz, s) => {
    if (bare && part === "visor") return;
    const k = part === "glove" ? (lod === "near" ? "gloveFine" : "gloveMid") : part === "gloveR" ? (lod === "near" ? "gloveFineR" : "gloveMidR") : bare && part === "head" ? "face" : bare && part === "hair" ? "cap" : alias[part] || part, b = body[k];
    if (!b || (lod === "far" && b.small) || counts[k] >= b.cap) return;
    partMatrix(m4, mp, x, y, z, yx, yy, yz, xx, xy, xz, s);
    const i = counts[k]++; b.mesh.setMatrixAt(i, m4); if (b.team) b.mesh.setColorAt(i, b.team === "skin" ? skin : colour);
    if (k === "face" && lod !== "far" && counts.brows < body.brows.cap) body.brows.mesh.setMatrixAt(counts.brows++, m4);   // (the same head's brows and eyes)
  };
  // a jack: its base where m4 says, the lever tilted up by tilt about its pivot
  const putJack = (tilt) => {
    if (counts.jack >= kitCap.jackBase) return;
    const i = counts.jack++; kit.jackBase.setMatrixAt(i, m4);
    mk4.makeRotationZ(tilt).setPosition(0, JACK.pivot, 0); kit.jackBar.setMatrixAt(i, mk4.premultiply(m4));
  };
  return {
    group,
    wheels(parts) {
      if (!parts || wheel?.key === parts.key) return;
      if (wheel) { for (const m of [wheel.front, wheel.rear]) { group.remove(m); m.geometry.dispose(); m.dispose(); } for (const m of [wheel.frontBand, wheel.rearBand]) { group.remove(m); m.dispose(); } }
      const g = wheelKit(parts);
      wheel = { key: parts.key, front: mk(g.front, S.kitMat, 64, false), rear: mk(g.rear, S.kitMat, 64, false), frontBand: mk(g.frontBand, /^2026/.test(parts.key) ? S.bandMat26 : S.bandMat, 64, true), rearBand: mk(g.rearBand, /^2026/.test(parts.key) ? S.bandMat26 : S.bandMat, 64, true) };
    },
    place(list, loose = [], cam = null) {
      for (const k of Object.keys(body)) counts[k] = 0;
      counts.jack = 0;
      const n = { gun: 0, front: 0, rear: 0 };
      let people = 0;
      for (const f of list) {
        if (people++ >= max) { people--; break; }
        const d = cam ? Math.hypot(f.x - cam.x, f.y - cam.y, f.z - cam.z) : CREW_LOD.near + 1;
        lod = d < CREW_LOD.near ? "near" : d > CREW_LOD.far ? "far" : "mid";
        colour = col.set(f.colour || "#9aa0a6"); bare = f.role === "marshal"; if (bare) skin.set(SKIN[((f.seed ?? people) * 7) % SKIN.length]);
        q.setFromAxisAngle(up, f.yaw); p.set(f.x, f.y, f.z); mp.compose(p, q, one);
        if (d > CREW_LOD.body) { put("farBody", 0, 0, 0, 0, 1, 0, 1, 0, 0, null); continue; }
        // kit carried by the figure itself (walking out or standing ready, no stop played): held in front, the hands on it
        let hands = f.hands || null;
        if (f.kit === "gun" && !hands && n.gun < kitCap.gun) {
          m4.makeTranslation(0.56, 0.95, -0.04).premultiply(mp); kit.gun.setMatrixAt(n.gun++, m4);
          hands = gunGrips([0.56, 0.95, -0.04], 0);
        } else if ((f.kit === "frontJack" || f.kit === "rearJack") && !hands) {
          // (the jack ahead of its man, its lever towards him: the base turned round)
          const t = 0.55, bx = 0.42 + JACK.bar * Math.cos(t);
          m4.makeRotationY(Math.PI).setPosition(bx, 0, 0).premultiply(mp); putJack(t);
          hands = jackGrips(bx, Math.PI, t);
        }
        skeleton(f.pose, put, hands);
      }
      for (const k of loose) {
        if (k.kind === "jack") { q.setFromAxisAngle(up, k.yaw); p.set(k.x, k.y, k.z); m4.compose(p, q, one); putJack(k.tilt ?? 0.5); continue; }
        q.setFromAxisAngle(up, k.yaw + (k.flip ? Math.PI : 0)); p.set(k.x, k.y, k.z); m4.compose(p, q, one);
        if (k.kind === "gun") { if (n.gun < kitCap.gun) kit.gun.setMatrixAt(n.gun++, m4); }
        else if (wheel && (k.kind === "front" || k.kind === "rear") && n[k.kind] < 64) {
          const i = n[k.kind]++; wheel[k.kind].setMatrixAt(i, m4);
          wheel[k.kind + "Band"].setMatrixAt(i, m4); wheel[k.kind + "Band"].setColorAt(i, col.set(k.band || "#9aa0a6"));
        }
      }
      for (const [k, b] of Object.entries(body)) { b.mesh.count = counts[k]; b.mesh.visible = counts[k] > 0; b.mesh.instanceMatrix.needsUpdate = true; if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true; }
      const kn = { gun: n.gun, jackBase: counts.jack, jackBar: counts.jack };
      for (const [k, mesh] of Object.entries(kit)) { mesh.count = kn[k]; mesh.visible = kn[k] > 0; mesh.instanceMatrix.needsUpdate = true; }
      if (wheel) for (const k of ["front", "rear"]) for (const mesh of [wheel[k], wheel[k + "Band"]]) { mesh.count = n[k]; mesh.visible = n[k] > 0; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
      return { people, wheels: n.front + n.rear, guns: n.gun };
    },
    clear() { for (const m of group.children) { m.count = 0; m.visible = false; } },
  };
}
// the grips of a gun at [x, y, z] pointing along `yaw` (facing convention: 0 = +x) in the same frame – [rear, front]
// as hands (index 0: the trigger hand on the pistol grip, 1: the front handle), w the weights
function gunGrips(at, yaw, w0 = 1, w1 = 1) {
  const c = Math.cos(yaw), s = Math.sin(yaw), tr = (v) => [at[0] + v[0] * c - v[2] * s, at[1] + v[1], at[2] + v[0] * s + v[2] * c], ax = (v) => [v[0] * c - v[2] * s, v[1], v[0] * s + v[2] * c];
  return [[...tr(GUN.rear), w0, ...ax(GUN.rearAxis)], [...tr(GUN.front), w1, ...ax(GUN.frontAxis)]];
}
// the T handle's two ends of a jack whose base is at x (on the figure's axis) turned by yaw, its lever tilted t – as hands
function jackGrips(bx, yaw, t) {
  const hx = bx + Math.cos(yaw) * JACK.bar * Math.cos(t), hy = JACK.pivot + JACK.bar * Math.sin(t);
  return [[hx, hy, JACK.half, 1, 0, 0, 1], [hx, hy, -JACK.half, 1, 0, 0, 1]];
}

// The figures in the world for a layout in the box's frame (where: x, y, z of the frame's origin – the car's, or the
// box's place – and its heading yaw as the cars': forward = (sin yaw, cos yaw); its left = (cos yaw, −sin yaw)).
// A figure's own facing f: 0 looks along +a; its forward in the box's frame is (cos f, sin f), its +z (right)
// (sin f, −cos f). What its hands hold (layout's 6th: [[a, b, h, w, axis a, b, h] | null × 2]) into its own frame.
export function crewAt(where, layout, colour) {
  const c = Math.cos(where.yaw), s = Math.sin(where.yaw);
  return layout.map(([a, b, f, pose, kit, grips]) => {
    const fig = { x: where.x + s * a + c * b, y: where.y, z: where.z + c * a - s * b, yaw: where.yaw + f - Math.PI / 2, colour, pose, kit };
    if (grips) fig.hands = gripsToFigure(grips, a, b, f);
    return fig;
  });
}
export function gripsToFigure(grips, a, b, f) {
  const cf = Math.cos(f), sf = Math.sin(f);
  return grips.map((g) => {
    if (!g) return null;
    const ra = g[0] - a, rb = g[1] - b, out = [ra * cf + rb * sf, g[2], ra * sf - rb * cf, g[3] ?? 1];
    if (g[4] != null) out.push(g[4] * cf + g[5] * sf, g[6], g[4] * sf - g[5] * cf);
    return out;
  });
}
// Loose kit in the world from the box's frame (as crewAt): guns, jacks, and wheels off the car (bands: { old, new } –
// the sidewall colours of the old set's and the new set's compounds; null: not known)
export function kitAt(where, kits, bands = {}) {
  const c = Math.cos(where.yaw), s = Math.sin(where.yaw);
  return kits.map((k) => ({ kind: k.kind === "gun" || k.kind === "jack" ? k.kind : k.axle, x: where.x + s * k.a + c * k.b, y: where.y + k.h, z: where.z + c * k.a - s * k.b,
    yaw: k.kind === "gun" || k.kind === "jack" ? where.yaw + k.yaw - Math.PI / 2 : where.yaw + k.yaw, flip: !!k.flip, tilt: k.tilt, band: k.kind === "new" ? bands.new : k.kind === "old" ? bands.old : null }));
}

// ---------- the team's people on the pit wall ----------
// Seated on stools at the stand's console, facing the track (the screens in front of them; from the garage one sees
// their backs – formula1.com, "The insider's guide to the pit wall"), headsets on: the same skeleton as the crews
// (the "sit" pose: on the stool – hips at the seat, feet on the deck –, the hands on the console where garages.js says
// it is), dressed in the team's shirt, dark trousers and shoes, a bare head with hair and a headset – no helmets.
// Static (a layer's people stand still until the layer is rebuilt): one instanced mesh per body part for all of them.
// (seat: the stool's top 0.77 m over the deck – garages.js – plus ~9 cm from the seat to the hip joints, seated; the
// soles on the footrest 0.31 m up, 0.16 m ahead; M)
POSES.sit = { th: [1.45, 1.4], sh: [0.02, -0.06], lean: 0.12, arm: [[0.95, 0.12, 0.65], [0.9, 0.14, 0.7]], seat: 0.86, feet: [0.14, 0.11], footY: 0.312 };
POSES.sitLean = { th: [1.45, 1.4], sh: [0.02, -0.06], lean: 0.3, arm: [[1.15, 0.1, 0.45], [1.1, 0.12, 0.5]], seat: 0.86, feet: [0.15, 0.1], footY: 0.312 };
const SKIN = ["#e9c3a3", "#d8a77f", "#b98260", "#8d5a3c", "#f1d2b6"];
let PEOPLE = null;
function peopleShared() {
  if (PEOPLE) return PEOPLE;
  const S = shared();
  // the headset: a band over the head and a cup at each ear, a boom microphone (about the head's centre)
  const k = [0.08, 0.08, 0.09];
  const set = mergeGeo([[new THREE.TorusGeometry(0.118, 0.012, 4, 14, Math.PI).rotateY(Math.PI / 2).translate(0, 0.02, 0), k],
    [new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12).rotateX(Math.PI / 2).translate(0, -0.005, 0.088), k], [new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12).rotateX(Math.PI / 2).translate(0, -0.005, -0.088), k],
    [new THREE.CylinderGeometry(0.005, 0.005, 0.12, 5).rotateZ(Math.PI / 2 - 0.35).translate(0.06, -0.06, 0.09), k]]);
  PEOPLE = {
    // part → [geometry, colour role: "shirt" | "legs" | "skin" | "hair" | "dark" | "kit", per person]
    parts: { thigh: [S.parts.thigh[0], "legs", 2], shin: [S.parts.shin[0], "legs", 2], boot: [S.parts.boot[0], "dark", 2],
      pelvis: [S.parts.pelvis[0], "legs", 1], chest: [S.parts.chest[0], "shirt", 1], neck: [S.parts.neck[0], "skin", 1], head: [headGeometry(), "skin", 1], hair: [hairGeometry(), "hair", 1], brows: [S.parts.brows[0], "dark", 1], visor: [set, "kit", 1],
      uarm: [S.parts.uarm[0], "shirt", 2], farm: [S.parts.farm[0], "skin", 2], glove: [S.parts.gloveMid[0], "skin", 1], gloveR: [S.parts.gloveMidR[0], "skin", 1],   // (mittens: fingers on 67 seated people behind the consoles were ~240k triangles drawn from anywhere – v0.39 perf)
      shoulder: [S.parts.joint[0], "shirt", 2], elbow: [S.parts.joint[0], "skin", 2], knee: [S.parts.joint[0], "legs", 2] },
    skin: SKIN, hair: ["#2a2420", "#4a3626", "#151313", "#8a6b4a", "#6b6b6b"],
    mat: new THREE.MeshStandardMaterial({ roughness: 0.75 }), kitMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }),
  };
  for (const [g] of Object.values(PEOPLE.parts)) g.userData.shared = true;
  PEOPLE.mat.userData.shared = true; PEOPLE.kitMat.userData.shared = true;
  return PEOPLE;
}
// people: [{ x, y, z, yaw (as crewAt's: the geometry's +x turned to face), shirt, pose, seed, hands (the figure's
// frame) }] → a Group (its instanced meshes own nothing shared: the geometries and materials are; disposeGroup leaves them)
export const PEOPLE_NEAR = 120;
const _wc = new THREE.Vector3();
export function peopleMeshes(people) {
  const P = peopleShared(), group = new THREE.Group(); group.name = "pitWallPeople";
  if (!people.length) return group;
  const meshes = {}, counts = {};
  for (const [k, [g, role, per]] of Object.entries(P.parts)) {
    const m = new THREE.InstancedMesh(g, role === "kit" ? P.kitMat : P.mat, people.length * per); m.count = 0; m.castShadow = true; m.receiveShadow = true;
    if (role !== "kit") m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.instanceMatrix.count * 3), 3);
    meshes[k] = { m, role }; counts[k] = 0; group.add(m);
  }
  const mp = new THREE.Matrix4(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const cShirt = new THREE.Color(), cLegs = new THREE.Color("#25282d"), cSkin = new THREE.Color(), cHair = new THREE.Color(), cDark = new THREE.Color("#141518");
  for (const f of people) {
    cShirt.set(f.shirt || "#9aa0a6"); cSkin.set(P.skin[(f.seed ?? 0) % P.skin.length]); cHair.set(P.hair[((f.seed ?? 0) >> 3) % P.hair.length]);
    q.setFromAxisAngle(up, f.yaw); p.set(f.x, f.y, f.z); mp.compose(p, q, one);
    skeleton(f.pose || "sit", (part, x, y, z, yx, yy, yz, xx, xy, xz, s) => {
      const e = meshes[part]; if (!e) return;
      partMatrix(m4, mp, x, y, z, yx, yy, yz, xx, xy, xz, s);
      const i = counts[part]++; e.m.setMatrixAt(i, m4);
      if (part === "head") { meshes.brows.m.setMatrixAt(counts.brows++, m4); meshes.brows.m.setColorAt(counts.brows - 1, cDark); }
      if (e.role !== "kit") e.m.setColorAt(i, e.role === "shirt" ? cShirt : e.role === "legs" ? cLegs : e.role === "skin" ? cSkin : e.role === "hair" ? cHair : cDark);
    }, f.hands || null);
  }
  for (const [k, e] of Object.entries(meshes)) { e.m.count = counts[k]; e.m.instanceMatrix.needsUpdate = true; if (e.m.instanceColor) e.m.instanceColor.needsUpdate = true; e.m.computeBoundingSphere(); }
  // the small parts (hands, joints, hair, headsets, necks, shoes) drawn only with the camera within PEOPLE_NEAR m of the
  // stand (its bounding sphere's surface): a pit wall seen from further away is torsos, heads and limbs (v0.39 perf –
  // 67 people at Suzuka were ~0.5 M triangles from anywhere).
  // v0.40: decided once a frame before drawing (peopleLod, from the view's camera) – no longer in each mesh's
  // onBeforeRender: three.js draws the shadow map before the view and calls only onBeforeShadow there, so the shadow pass
  // used the count the previous frame's view had left (and this app redraws its shadow map only when the shadow's area
  // moves – hands and joints walked in from 120 m kept no shadow until then). Now the shadow pass and the view see the
  // same counts, and a change asks the caller to redraw the shadow map.
  const small = [];
  for (const k of ["glove", "gloveR", "brows", "elbow", "shoulder", "knee", "hair", "visor", "neck", "boot"]) { const m = meshes[k]?.m; if (m) small.push({ m, full: m.count }); }
  const bs = group.children[0]?.boundingSphere;
  let near = true;
  group.userData.lod = (camPos) => {
    group.updateWorldMatrix(true, false);
    const want = !bs || camPos.distanceTo(_wc.copy(bs.center).applyMatrix4(group.children[0].matrixWorld)) - bs.radius <= PEOPLE_NEAR;
    if (want === near) return false;
    near = want; for (const e of small) e.m.count = near ? e.full : 0;
    return true;
  };
  LIVE_PEOPLE.add(group);
  group.children[0]?.addEventListener("dispose", () => LIVE_PEOPLE.delete(group));
  return group;
}
// the pit wall people's small parts near or not, for the camera at camPos (each frame, before the frame is drawn);
// true when any changed (the static shadow map then wants redrawing). Only the groups in a scene now are looked at.
const LIVE_PEOPLE = new Set();
export function peopleLod(camPos) {
  let changed = false;
  for (const g of LIVE_PEOPLE) { let o = g; while (o.parent) o = o.parent; if (o.isScene) changed = g.userData.lod(camPos) || changed; }
  return changed;
}
