// Development (v0.49): does a car fit in its garage – the car's box against the garage's pillars, lintel, walls, back
// partition, ceiling and the team's equipment, and its wheels on the floor. Everything in one bay's frame: a (m along,
// from the opening's middle, + to the pit exit), d (m in from the front, + into the garage), h (m over the bay's floor).
// Map3D.garageCheck draws it and puts real-size cars at their spots (map3d.js); this is the measuring, kept pure.
import * as THREE from "./vendor/three.module.js";
import { CAR_ENVELOPE } from "./carbounds.js";

// a point in the bay's frame
export const toBay = (s, x, y, z) => { const dx = x - s.front[0], dz = z - s.front[1]; return [dx * s.along[0] + dz * s.along[1], dx * s.inward[0] + dz * s.inward[1], y - s.floor]; };
// The bay's own structure as boxes ({ name, min: [a, d, h], max }): the pillars either side of the opening (0.5 m wide,
// facilities.js FW; 0.3 m deep – assumed, the model draws them as a face), the lintel and the rolled-up shutter's box over
// the opening, the side walls, the back partition (or back wall) and the ceiling – each 0.1 m thick behind its face.
export function bayStructure(s, top = s.height + 0.55, fw = 0.5) {
  const W = s.width / 2, D = s.depth, C = s.ceil;
  return [
    { name: "pillar −", min: [-W - fw, -0.3, 0], max: [-W, 0.3, top] }, { name: "pillar +", min: [W, -0.3, 0], max: [W + fw, 0.3, top] },
    { name: "lintel / shutter box", min: [-W, -0.3, s.height - 0.4], max: [W, 0.6, top] },
    { name: "side wall −", min: [-W - 0.1, 0, 0], max: [-W, D, C] }, { name: "side wall +", min: [W, 0, 0], max: [W + 0.1, D, C] },
    { name: s.back ? "back partition" : "back wall", min: [-W, D, 0], max: [W, D + 0.1, C] }, { name: "ceiling", min: [-W, 0, C], max: [W, D, C + 0.1] },
  ];
}
// The team layer's equipment in this bay as boxes (its instanced meshes: tyres, cabinets, jacks, benches, desks, booms,
// trolleys, wheel guns, wall screens – each instance's own box turned into the bay's frame), only those inside the bay
const EQUIP = ["tyres", "cabinets", "jacks", "benches", "screens", "booms", "trolleys", "wheelGuns", "wallScreens"];
const _m = new THREE.Matrix4(), _b = new THREE.Box3(), _v = new THREE.Vector3();
export function equipmentBoxes(group, s) {
  const out = [];
  group?.traverse((o) => {
    if (!o.isInstancedMesh || !EQUIP.includes(o.name)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const gb = o.geometry.boundingBox;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, _m); _m.premultiply(o.matrixWorld);
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let k = 0; k < 8; k++) {
        _v.set(k & 1 ? gb.max.x : gb.min.x, k & 2 ? gb.max.y : gb.min.y, k & 4 ? gb.max.z : gb.min.z).applyMatrix4(_m);
        const p = toBay(s, _v.x, _v.y, _v.z); for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], p[j]); hi[j] = Math.max(hi[j], p[j]); }
      }
      if (hi[0] < -s.width / 2 || lo[0] > s.width / 2 || hi[1] < 0 || lo[1] > s.depth + (s.back || 0)) continue;
      out.push({ name: o.name + "#" + i, min: lo, max: hi });
    }
  });
  return out;
}
// A car's box in the bay's frame: at (a, d) on the floor + h0, facing out (its nose towards the pit lane: −d) or in
export function carBox(a, d, h0 = 0, E = CAR_ENVELOPE, facing = "out") {
  const f = facing === "out" ? -1 : 1;
  const d0 = d + f * E.front, d1 = d - f * E.back;
  return { name: "car", min: [a - E.width / 2, Math.min(d0, d1), h0], max: [a + E.width / 2, Math.max(d0, d1), h0 + E.height] };
}
// overlap of two boxes: null, or by how much along each axis (the smallest is how far one is into the other)
export function overlap(A, B) {
  const o = [0, 1, 2].map((j) => Math.min(A.max[j], B.max[j]) - Math.max(A.min[j], B.min[j]));
  return o.every((x) => x > 1e-3) ? { by: o.map((x) => +x.toFixed(3)), depth: +Math.min(...o).toFixed(3) } : null;
}
// The check for one car: its box against the structure and the equipment; the room left around it (to the opening's
// sides, the door line, the back), its height over the floor and the headroom to the lowest fixed thing over it.
//   s: the bay (facilities.js slot), car: carBox(…), equip: equipmentBoxes(…), ground: its lowest point over the floor
//   (the model's wheels: should be ~0), lowest: the zone's lowest overhead (garages.js garageZones)
export function checkCar(s, car, equip = [], { ground = 0, lowest = null, ignore = null } = {}) {
  const hits = [];
  for (const b of [...bayStructure(s), ...equip]) { if (ignore && ignore.test(b.name)) continue; const o = overlap(car, b); if (o) hits.push({ with: b.name, ...o }); }
  return {
    hits, ok: !hits.length,
    room: { sideMinus: +(car.min[0] + s.width / 2).toFixed(2), sidePlus: +(s.width / 2 - car.max[0]).toFixed(2), front: +car.min[1].toFixed(2), back: +(s.depth - car.max[1]).toFixed(2) },
    floorGap: +ground.toFixed(3), headroom: lowest != null ? +(lowest - car.max[2]).toFixed(2) : null,
    // (what hangs over the car – the boom and its lines – with its lowest point)
    overhead: equip.filter((b) => b.min[2] >= car.max[2] - 1e-3 && b.max[0] > car.min[0] && b.min[0] < car.max[0] && b.max[1] > car.min[1] && b.min[1] < car.max[1]).map((b) => ({ with: b.name, lowest: +b.min[2].toFixed(2) })),
  };
}

// The dev view (Map3D.garageCheck): for each car work space of the chosen teams, a real-size car model (car3d.js makeCar –
// the session's season, the team's own shape) parked at its spot, wire boxes – the car's (green: clear, red: something in
// it), what it hits (red), the bay's structure (grey) –, and the report. drivers: the session's DriverList; season, date:
// the model's. → { group (to add to the scene; dispose with it), report: [{ num, team, slot, kind, fits, why, carSpot,
// extents: the model's measured box, …checkCar }] }
// extra(s) (v0.49): more equipment boxes for bay s in its frame – the garage kit's (garagekit/pitkit.js boxesFor: its
// merged meshes aren't instanced, so equipmentBoxes doesn't find them)
export async function garageCheckScene({ G, zones, layer, teams = null, drivers = {}, season = null, date = null, park = true, boxes = true, extra = null }) {
  const { makeCar } = await import("./car3d.js"), { carExtents } = await import("./carbounds.js");
  const group = new THREE.Group(); group.name = "garageCheck";
  const line = (s, b, colour) => {
    const P = (a, d, h) => new THREE.Vector3(s.front[0] + s.along[0] * a + s.inward[0] * d, s.floor + h, s.front[1] + s.along[1] * a + s.inward[1] * d), c = [];
    for (let k = 0; k < 8; k++) c.push(P(k & 1 ? b.max[0] : b.min[0], k & 2 ? b.max[1] : b.min[1], k & 4 ? b.max[2] : b.min[2]));
    const e = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]].flatMap(([i, j]) => [c[i], c[j]]);
    const m = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(e), new THREE.LineBasicMaterial({ color: colour, depthTest: false, transparent: true, opacity: 0.9 }));
    m.renderOrder = 10; group.add(m);
  };
  const report = [];
  for (const z of zones) {
    if (z.kind !== "car" || (teams && !teams.includes(z.team))) continue;
    const s = G.slots[z.slot], d = drivers[z.num] || {}, cs = z.carSpot;
    const model = makeCar({ teamName: d.TeamName || z.team, teamColour: d.TeamColour || "888888", number: z.num, season, date });
    const ext = carExtents(model), E = { length: ext.length, width: ext.width, height: ext.height, front: ext.front, back: ext.back };
    const car = carBox(z.w, cs.d, cs.y - s.floor + ext.ground, E, "out"), equip = [...equipmentBoxes(layer, s), ...(extra?.(s) || [])];
    const r = checkCar(s, car, equip, { ground: cs.y - s.floor - 0.016 + ext.ground, lowest: z.lowest });
    report.push({ num: z.num, team: z.team, slot: z.slot, fits: cs.fits, why: cs.why, carSpot: { d: cs.d, w: z.w }, bay: { width: +s.width.toFixed(2), depth: +s.depth.toFixed(2), back: s.back, building: s.building, door: [+s.width.toFixed(2), +s.height.toFixed(2)], ceil: +s.ceil.toFixed(2), floor: +s.floor.toFixed(3), depthFrom: s.depthFrom },
      model: ext.key, extents: { length: ext.length, width: ext.width, height: ext.height }, ...r });
    if (park) { model.position.set(cs.x, cs.y, cs.z); model.rotation.set(0, cs.yaw, 0, "YXZ"); model.name = "garageCheckCar"; group.add(model); }
    if (boxes) {
      line(s, car, r.ok ? 0x22dd55 : 0xff3030);
      for (const b of bayStructure(s)) line(s, b, r.hits.some((h) => h.with === b.name) ? 0xff3030 : 0x9aa0a6);
      for (const b of equip) if (r.hits.some((h) => h.with === b.name)) line(s, b, 0xff3030);
    }
  }
  return { group, report };
}
