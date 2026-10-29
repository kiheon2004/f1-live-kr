// How big a car model is – its wheels and bodywork, measured from the model itself (car3d.js makeCar), never the soft
// contact shadow under it or the label over it (map3d.js carFor adds both) – and the envelope the garages are laid out
// for. Each season's car is its own model (2022–25 era: 3.6 m wheelbase, 2.0 m wide; 2026: 3.4 m, 1.9 m – car3d.js
// PROFILES), each team's shape on top (carshapes.js): measured one by one (test/carbounds49.test.js), not one size for all.
import * as THREE from "./vendor/three.module.js";

const _box = new THREE.Box3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
// what is not the car: the contact shadow (a flat textured plane named so – map3d.js carFor), any sprite (labels), and
// anything marked userData.notCar
export const notCar = (o) => !!(o.isSprite || o.userData?.notCar || o.name === "contactShadow");
// A model's extents in its own frame (x across, y up from the ground, z ahead; the model's own rotation and place left out,
// its scale kept out too: the car as built). → { min: [x, y, z], max, length, width, height, front (m ahead of the origin),
// back (behind), half (half width), ground (lowest point), body: { min, max } (the bodywork – everything but the wheel
// groups), wheels: { min, max, track: [front, rear] (outer faces), base (axle to axle) }, era, key }
export function carExtents(model) {
  model.updateWorldMatrix(true, true); _inv.copy(model.matrixWorld).invert();
  const all = new THREE.Box3(), body = new THREE.Box3(), wheels = new THREE.Box3(), axles = [];
  const inWheel = (o) => { for (let p = o; p && p !== model; p = p.parent) if (p.name === "wheel") return p; return null; };
  model.traverse((o) => {
    if (notCar(o)) return;
    for (let p = o.parent; p && p !== model; p = p.parent) if (notCar(p)) return;
    if (!o.isMesh || !o.geometry) return;
    // (an instanced mesh – the shift lights – by its instances; a skinned sleeve by its rest pose: inside the cockpit either way)
    if (o.isInstancedMesh) { if (!o.boundingBox) o.computeBoundingBox(); _box.copy(o.boundingBox); }
    else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); _box.copy(o.geometry.boundingBox); }
    if (_box.isEmpty()) return;
    _box.applyMatrix4(_m.multiplyMatrices(_inv, o.matrixWorld));
    all.union(_box);
    const w = inWheel(o);
    if (w) { wheels.union(_box); if (!axles.includes(w)) axles.push(w); } else body.union(_box);
  });
  const v = (b) => ({ min: [b.min.x, b.min.y, b.min.z].map(r3), max: [b.max.x, b.max.y, b.max.z].map(r3) });
  const zs = axles.map((w) => w.position.z), fz = Math.max(...zs), rz = Math.min(...zs);
  const trackAt = (z) => { const b = new THREE.Box3(); for (const w of axles) if (Math.abs(w.position.z - z) < 0.01) w.traverse((o) => { if (o.isMesh && o.geometry && !notCar(o)) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.union(_box.copy(o.geometry.boundingBox).applyMatrix4(_m.multiplyMatrices(_inv, o.matrixWorld))); } }); return b.isEmpty() ? null : r3(b.max.x - b.min.x); };
  const prof = model.userData?.profile || {};
  return { ...v(all), length: r3(all.max.z - all.min.z), width: r3(all.max.x - all.min.x), height: r3(all.max.y - all.min.y), front: r3(all.max.z), back: r3(-all.min.z),
    half: r3(Math.max(all.max.x, -all.min.x)), ground: r3(all.min.y), body: v(body), wheels: { ...v(wheels), track: axles.length ? [trackAt(fz), trackAt(rz)] : null, base: axles.length ? r3(fz - rz) : null },
    era: prof.era || null, key: prof.key || null };
}
const r3 = (x) => Math.round(x * 1000) / 1000;

// The envelope every garage is laid out for: the largest car the app draws in any season or shape (carExtents over
// every model – test/carbounds49.test.js keeps it so). Measured v0.49 (node, car3d.js makeCar, every 2024–26 model:
// f1kr-work/v049/garage/carsizes.json): 2022–25 era 5.685 m long (−2.655 … +3.03), the long-nosed shapes (vcarb02, vf25,
// fw47) 5.722 m, 2.008 m over the tyres, 1.033 m high; 2026 5.47–5.487 m, 1.908 m, 1.155 m (the T-cam pod). Origin: the
// middle between the axles, on the ground; +z ahead.
export const CAR_ENVELOPE = { length: 5.73, width: 2.01, height: 1.16, front: 3.07, back: 2.66 };
