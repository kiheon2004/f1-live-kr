// Pit crews: the team's people at its box during a stop, and lined up at the box while one of its cars is in the
// pit lane on its way in. Simple figures (legs, a torso in the team's colour, a dark helmet), all crews in two
// instanced meshes.
//
// Where they stand at a stop is the usual F1 arrangement – three at each wheel (the gun, taking the old wheel off,
// putting the new one on), the front and rear jacks, a man at each front-wing end, one steadying each side, and the
// release controller by the nose on the pit lane side – 19 people; the data has none of it (the feed shows only where
// the car stopped and for how long), so it is a depiction. The car's own frame: x along it (+ forward), y across
// (+ its left), from the model's origin between the axles (wheelbase 3.4–3.6 m, track ~1.9 m: car3d.js).
import * as THREE from "./vendor/three.module.js";

// [along, across, facing (rad, 0 = looking along +x), height scale (kneeling < 1)]
const WHEEL = (ax, ay) => [
  [ax, ay * 1.45, ay > 0 ? -Math.PI / 2 : Math.PI / 2, 0.62],            // the gun, kneeling at the wheel
  [ax + 0.75, ay * 1.55, ay > 0 ? -Math.PI * 0.6 : Math.PI * 0.6, 0.85], // the old wheel off
  [ax - 0.75, ay * 1.55, ay > 0 ? -Math.PI * 0.4 : Math.PI * 0.4, 0.85], // the new wheel on
];
export const STOP = [
  ...WHEEL(1.75, 1), ...WHEEL(1.75, -1), ...WHEEL(-1.75, 1), ...WHEEL(-1.75, -1),
  [3.6, 0, Math.PI, 1], [-3.1, 0, 0, 1],                  // the front and rear jacks
  [2.9, 1.25, Math.PI, 0.9], [2.9, -1.25, Math.PI, 0.9],  // the front wing's ends
  [0.1, 1.4, -Math.PI / 2, 1], [0.1, -1.4, Math.PI / 2, 1], // steadying the car at its sides
  [4.6, -2.4, Math.PI * 0.75, 1],                         // the release controller (pit lane side)
];
// waiting for the car: in a line along the box's garage side, facing the lane
export const WAIT = STOP.map((_, i) => [-4.5 + (9 / (STOP.length - 1)) * i, 2.6, -Math.PI / 2, 1]);

// one figure, 1.8 m: legs and helmet dark (one mesh), the torso and arms in the team's colour (the other)
function figureParts() {
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const merge = (gs) => {
    const pos = [], nor = [], idx = []; let o = 0;
    for (const g of gs) { const p = g.attributes.position.array, n = g.attributes.normal.array; pos.push(...p); nor.push(...n); for (const i of g.index.array) idx.push(i + o); o += p.length / 3; g.dispose(); }
    const m = new THREE.BufferGeometry(); m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); m.setIndex(idx); return m;
  };
  const dark = merge([box(0.16, 0.86, 0.2, 0, 0.43, 0.11), box(0.16, 0.86, 0.2, 0, 0.43, -0.11), new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.66, 0)]);
  const team = merge([box(0.28, 0.62, 0.46, 0, 1.17, 0), box(0.12, 0.56, 0.12, 0.06, 1.16, 0.3), box(0.12, 0.56, 0.12, 0.06, 1.16, -0.3)]);
  return { dark, team };
}

// Crews for up to `max` people: { group, place(list), clear() } – place([{ x, y, z, yaw, colour, scale }])
export function crewMeshes(max = 240) {
  const { dark, team } = figureParts();
  const darkMesh = new THREE.InstancedMesh(dark, new THREE.MeshStandardMaterial({ color: "#1b1d21", roughness: 0.7 }), max);
  const teamMesh = new THREE.InstancedMesh(team, new THREE.MeshStandardMaterial({ roughness: 0.6 }), max);
  for (const m of [darkMesh, teamMesh]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; }
  teamMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  const group = new THREE.Group(); group.name = "crews"; group.add(darkMesh, teamMesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  return {
    group,
    place(list) {
      const n = Math.min(max, list.length);
      for (let i = 0; i < n; i++) {
        const f = list[i];
        q.setFromAxisAngle(up, f.yaw); p.set(f.x, f.y, f.z); sc.set(1, f.scale ?? 1, 1);
        m4.compose(p, q, sc); darkMesh.setMatrixAt(i, m4); teamMesh.setMatrixAt(i, m4);
        teamMesh.setColorAt(i, col.set(f.colour || "#9aa0a6"));
      }
      darkMesh.count = teamMesh.count = n;
      darkMesh.instanceMatrix.needsUpdate = teamMesh.instanceMatrix.needsUpdate = true;
      if (teamMesh.instanceColor) teamMesh.instanceColor.needsUpdate = true;
    },
    clear() { darkMesh.count = teamMesh.count = 0; },
  };
}

// The figures for one crew in the world: at the car (frame: its position x, y, z and heading yaw – the scene's, as the
// cars' – facing +x along it) or waiting at its box. → [{ x, y, z, yaw, colour, scale }]
export function crewAt(where, layout, colour) {
  const c = Math.cos(where.yaw), s = Math.sin(where.yaw);
  // (a car's heading yaw: forward = (sin yaw, cos yaw) in x, z; its left = (cos yaw, −sin yaw))
  return layout.map(([a, b, f, h]) => ({ x: where.x + s * a + c * b, y: where.y, z: where.z + c * a - s * b, yaw: where.yaw + f - Math.PI / 2, colour, scale: h }));
}
