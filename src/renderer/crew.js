// Pit crews: the team's people at its box. What they do is the car's state in the pit lane (pitstate.js crewPhase),
// from the data – never a timing of their own: out at the box while a car of the team comes down the lane to it
// ("ready"), round the car while it stands in its box ("work"), standing back by the garage through a stop-and-go
// ("hold": no work is allowed), walking back after it left ("back"). The FIA's rule (Art. 34.13): team personnel are in
// the pit lane only just before they work on a car and withdraw as soon as it's done – otherwise they're in the garage
// (not drawn).
//
// Where they stand at a stop is the usual arrangement – three at each wheel (the gun, the old wheel off, the new one
// on), the front and rear jacks, one at each end of the front wing, one steadying each side, the release controller by
// the nose on the pit lane side – a depiction: the data has only where the car stood and for how long, and what work was
// done (tyres changed or not) only after it has gone, so it shows the crew in position, not a tyre change or a wing
// adjustment. All of it inside the inner lane (pitlane.js crossSection keeps the room), none in the fast lane.
// The car's frame: x along it (+ forward), y across (+ its left), from the model's origin between the axles
// (car3d.js: wheelbase 3.4–3.6 m, the front wing ~1.8 m wide, the nose ~1.2 m ahead of the front axle).
import * as THREE from "./vendor/three.module.js";

// [along, across, facing (rad, 0 = looking along +x), pose, kit]: written with the garages on the car's left (+y)
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
    const k = Math.max(0, Math.min(1, f)), ahead = phase === "back" && a > 2;
    const y = ahead ? mouth + (Math.max(b, 1.6) - mouth) * k * 0.5 : mouth + (b - mouth) * k;
    const moving = k > 0.02 && k < 0.98;
    return [a, y, moving ? (phase === "back" ? Math.PI / 2 : -Math.PI / 2) : face, moving ? "walk" : pose === "kneel" ? "ready" : pose, kit === "gun" || kit === "tyre" ? kit : null];
  });
  return left > 0 ? out : out.map(([a, b, face, pose, kit]) => [a, -b, -face, pose, kit]);
}

// ---------- the figures ----------
// One person 1.78 m tall, from boxes and capsules posed joint by joint (hips, knees, waist, shoulders): the fire suit
// and the helmet's shell in the team's colour, the visor, gloves and boots dark. Per pose a merged geometry; every
// person of that pose one instance.
const POSES = {
  stand: { hip: 0.92, knee: [0.05, 0.05], lean: 0.02, arms: [[0.15, 0.1], [0.15, -0.1]], elbow: 0.2 },
  ready: { hip: 0.86, knee: [0.35, 0.35], lean: 0.25, arms: [[0.9, 0.18], [0.9, -0.18]], elbow: 0.5 },
  walk: { hip: 0.9, knee: [0.4, 0.05], stride: 0.35, lean: 0.08, arms: [[0.35, 0.1], [-0.25, -0.1]], elbow: 0.3 },
  kneel: { hip: 0.52, knee: [1.55, 1.1], kneel: true, lean: 0.55, arms: [[1.25, 0.14], [1.15, -0.14]], elbow: 0.4 },
  carry: { hip: 0.88, knee: [0.25, 0.25], lean: 0.18, arms: [[0.95, 0.32], [0.95, -0.32]], elbow: 0.9 },
  jack: { hip: 0.86, knee: [0.3, 0.5], stride: 0.25, lean: 0.4, arms: [[1.1, 0.16], [1.1, -0.16]], elbow: 0.25 },
};
function poseParts(P) {
  const team = [], dark = [];
  const put = (list, geo, m) => { geo.applyMatrix4(m); list.push(geo); };
  const M = (x, y, z, rx = 0, rz = 0, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")), new THREE.Vector3(1, 1, 1));
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 8);
  // legs: thigh from the hip down-forward by the knee angle, shin back down to the foot (the kneeling leg's knee on the
  // ground); x forward, z sideways
  for (const [side, kn] of [[1, P.knee[0]], [-1, P.knee[1]]]) {
    const z = side * 0.11, hx = (P.stride || 0) * (side > 0 ? 0.5 : -0.5) * 0.4;
    const thighA = P.kneel && side < 0 ? 0.15 : kn * 0.55, thighL = 0.44, shinL = 0.43;
    const kx = hx + Math.sin(thighA) * thighL, ky = P.hip - Math.cos(thighA) * thighL;
    put(team, cap(0.075, thighL - 0.1), M(hx + (kx - hx) / 2, (P.hip + ky) / 2, z, 0, -thighA));
    const shinA = P.kneel && side > 0 ? -1.45 : P.kneel ? -0.15 : -kn * 0.6;   // (the kneeling knee: shin along the ground)
    const fx = kx + Math.sin(shinA) * shinL, fy = Math.max(0.05, ky - Math.cos(shinA) * shinL);
    put(team, cap(0.065, shinL - 0.1), M((kx + fx) / 2, (ky + fy) / 2, z, 0, -shinA));
    put(dark, box(0.26, 0.09, 0.11), M(fx + 0.06, Math.max(0.045, fy - 0.03), z));   // boots
  }
  // torso and head over the hips, leaning forward
  const L = P.lean, tl = 0.55, cx = Math.sin(L) * tl / 2, cy = P.hip + Math.cos(L) * tl / 2;
  put(team, box(0.24, tl, 0.38), M(cx, cy + 0.04, 0, 0, -L));
  put(dark, box(0.25, 0.07, 0.39), M(Math.sin(L) * 0.04, P.hip + 0.06, 0, 0, -L));   // belt
  const nx = Math.sin(L) * tl, ny = P.hip + Math.cos(L) * tl + 0.04;
  put(team, new THREE.SphereGeometry(0.135, 12, 9), M(nx + 0.02, ny + 0.16, 0));        // helmet shell
  put(dark, box(0.06, 0.07, 0.2), M(nx + 0.14, ny + 0.16, 0));                          // visor
  // arms from the shoulders: upper arm forward by its angle, forearm bent at the elbow; gloves dark
  for (const [k, side] of [[0, 1], [1, -1]]) {
    const [a, spread] = P.arms[k], sx = nx - 0.02, sy = ny - 0.05, sz = side * 0.21;
    const ua = 0.29, fa = 0.27, ex = sx + Math.sin(a) * ua, ey = sy - Math.cos(a) * ua, ez = sz + spread * 0.25;
    put(team, cap(0.055, ua - 0.08), M((sx + ex) / 2, (sy + ey) / 2, (sz + ez) / 2, 0, -a));
    const b = a + P.elbow, hx = ex + Math.sin(b) * fa, hy = ey - Math.cos(b) * fa;
    put(team, cap(0.05, fa - 0.08), M((ex + hx) / 2, (ey + hy) / 2, ez, 0, -b));
    put(dark, new THREE.SphereGeometry(0.055, 8, 6), M(hx, hy, ez));
  }
  return { team: merge(team), dark: merge(dark) };
}
function merge(gs) {
  const pos = [], nor = [], idx = []; let o = 0;
  for (const g0 of gs) { const g = g0.index ? g0 : g0; const p = g.attributes.position.array, n = g.attributes.normal.array; for (const v of p) pos.push(v); for (const v of n) nor.push(v); for (const i of g.index.array) idx.push(i + o); o += p.length / 3; g.dispose(); }
  const m = new THREE.BufferGeometry(); m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); m.setIndex(idx); return m;
}
// the kit: a wheel gun (body and grip), a tyre on its rim, a jack (its bar and the lifting head)
function kitParts() {
  const gun = merge([new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10).rotateZ(Math.PI / 2).translate(0.15, 0, 0), new THREE.BoxGeometry(0.05, 0.16, 0.05).translate(0.05, -0.08, 0)]);
  const tyre = merge([new THREE.CylinderGeometry(0.36, 0.36, 0.33, 18).rotateX(Math.PI / 2)]);
  const jack = merge([new THREE.CylinderGeometry(0.025, 0.025, 1.3, 8).rotateZ(Math.PI / 2 - 0.5).translate(0.55, 0.32, 0), new THREE.BoxGeometry(0.22, 0.12, 0.5).translate(1.05, 0.12, 0)]);
  return { gun, tyre, jack };
}

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const poses = {}; for (const [k, P] of Object.entries(POSES)) poses[k] = poseParts(P);
  SHARED = { poses, kit: kitParts(), teamMat: new THREE.MeshStandardMaterial({ roughness: 0.65 }), darkMat: new THREE.MeshStandardMaterial({ color: "#16181b", roughness: 0.45 }),
    rubber: new THREE.MeshStandardMaterial({ color: "#1b1b1c", roughness: 0.85 }), metal: new THREE.MeshStandardMaterial({ color: "#8e949a", roughness: 0.35, metalness: 0.7 }) };
  for (const x of [SHARED.teamMat, SHARED.darkMat, SHARED.rubber, SHARED.metal]) x.userData.shared = true;
  for (const p of Object.values(poses)) { p.team.userData.shared = true; p.dark.userData.shared = true; }
  for (const g of Object.values(SHARED.kit)) g.userData.shared = true;
  return SHARED;
}

// Crews for up to `max` people a pose: { group, place(list), clear() } – place([{ x, y, z, yaw, colour, pose, kit }])
export function crewMeshes(max = 120) {
  const S = shared(), group = new THREE.Group(); group.name = "crews";
  const mk = (geo, mat, coloured) => { const m = new THREE.InstancedMesh(geo, mat, max); m.count = 0; m.visible = false; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; if (coloured) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); group.add(m); return m; };
  const by = {}; for (const [k, p] of Object.entries(S.poses)) by[k] = { team: mk(p.team, S.teamMat, true), dark: mk(p.dark, S.darkMat, false) };
  const kit = { gun: mk(S.kit.gun, S.metal, false), tyre: mk(S.kit.tyre, S.rubber, false), frontJack: mk(S.kit.jack, S.metal, false), rearJack: mk(S.kit.jack, S.metal, false) };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  const set = (mesh, i) => { mesh.setMatrixAt(i, m4); };
  return {
    group,
    place(list) {
      const n = {}; for (const k of [...Object.keys(by), ...Object.keys(kit)]) n[k] = 0;
      for (const f of list) {
        const b = by[f.pose] || by.stand; if (n[f.pose] >= max) continue;
        q.setFromAxisAngle(up, f.yaw); p.set(f.x, f.y, f.z); m4.compose(p, q, one);
        const i = n[f.pose]++; set(b.team, i); set(b.dark, i); b.team.setColorAt(i, col.set(f.colour || "#9aa0a6"));
        if (f.kit && kit[f.kit] && n[f.kit] < max) {
          // (in the hands: the gun at the hub's height in front of a kneeling man, a tyre held at the waist, a jack's bar)
          const off = f.kit === "gun" ? [0.62, 0.36, 0] : f.kit === "tyre" ? [0.5, 0.62, 0] : [0.2, 0, 0];
          p.set(f.x + Math.cos(f.yaw) * off[0], f.y + off[1], f.z - Math.sin(f.yaw) * off[0]); m4.compose(p, q, one); set(kit[f.kit], n[f.kit]++);
        }
      }
      for (const [k, b] of Object.entries(by)) for (const mesh of [b.team, b.dark]) { mesh.count = n[k]; mesh.visible = n[k] > 0; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
      for (const [k, mesh] of Object.entries(kit)) { mesh.count = n[k]; mesh.visible = n[k] > 0; mesh.instanceMatrix.needsUpdate = true; }
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
