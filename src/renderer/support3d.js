// The support cars' models: the safety car and the medical car of a season and event (support.js supportModels), in
// the few things the sources give – body type, size, colours, where the lights are (docs/research/
// support_cars_start.md: manufacturers' road-car figures, approximate; race-photo captions). Built from lofted sections
// like the F1 cars (car3d.js); no maker's shape is copied – a body of its type, length, width and height in its livery.
//   Mercedes-AMG safety cars (2022–): no roof light bar – light modules along the top of the windscreen and on the rear
//   wing, orange (green when cars may pass); Aston Martin's: a roof bar; both medical cars: a roof bar (its colours not
//   sourced: amber, an estimate).
// Each car is its own group (a handful at most), freed with its world (dispose.js).
import * as THREE from "./vendor/three.module.js";
import { loft, softBox, merge, boxAt } from "./car3d.js";

// L × W × H (m), body type, colours, lights; label on the doors
export const SUPPORT_CARS = {
  amgGtBlack: { name: "Mercedes-AMG GT Black Series", role: "sc", type: "coupe", L: 4.55, W: 2.0, H: 1.26, body: "#c41230", accent: "#111214", lights: "screen", wing: true, label: "SAFETY CAR" },
  amgGt63Pro: { name: "Mercedes-AMG GT 63 PRO 4MATIC+", role: "sc", type: "coupe", L: 4.73, W: 1.985, H: 1.355, body: "#141517", accent: "#c41230", lights: "screen", wing: true, label: "SAFETY CAR" },
  vantage: { name: "Aston Martin Vantage", role: "sc", type: "coupe", L: 4.495, W: 1.98, H: 1.275, body: "#00473b", accent: "#c4e000", lights: "roof", wing: true, label: "SAFETY CAR" },
  vantageS: { name: "Aston Martin Vantage S", role: "sc", type: "coupe", L: 4.495, W: 1.98, H: 1.275, body: "#00473b", accent: "#c4e000", lights: "roof", wing: true, label: "SAFETY CAR" },
  amgGt63s: { name: "Mercedes-AMG GT 63 S 4MATIC+ 4-Door", role: "medical", type: "fourdoor", L: 5.055, W: 1.955, H: 1.45, body: "#c41230", accent: "#111214", lights: "roof", wing: false, label: "MEDICAL CAR" },
  dbx707: { name: "Aston Martin DBX707", role: "medical", type: "suv", L: 5.04, W: 2.0, H: 1.68, body: "#00473b", accent: "#c4e000", lights: "roof", wing: false, label: "MEDICAL CAR" },
  // (the maker not known for the event: a car of the role's usual type in neutral colours – said so in the info)
  neutralSc: { name: "safety car (maker not sourced for this event)", role: "sc", type: "coupe", L: 4.55, W: 1.99, H: 1.27, body: "#9aa0a6", accent: "#2a2d31", lights: "roof", wing: true, label: "SAFETY CAR" },
  neutralMedical: { name: "medical car (maker not sourced for this event)", role: "medical", type: "fourdoor", L: 5.05, W: 1.96, H: 1.45, body: "#d9dde1", accent: "#2a2d31", lights: "roof", wing: false, label: "MEDICAL CAR" },
};

const SHAPES = {
  // belt (beltline / W·H), cabin [rear z, front z] (× L from the middle), roof peak at, wheel radius, boxiness
  coupe: { belt: 0.56, cab: [-0.2, 0.1], peak: -0.06, r: 0.345, pw: 4.5, hood: 0.78 },
  fourdoor: { belt: 0.55, cab: [-0.3, 0.12], peak: -0.06, r: 0.36, pw: 4.5, hood: 0.8 },
  suv: { belt: 0.58, cab: [-0.36, 0.17], peak: -0.1, r: 0.40, pw: 6, hood: 0.86 },
};

function door(text, colour) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 64;
  const g = c.getContext("2d"); g.clearRect(0, 0, 512, 64);
  g.fillStyle = colour; g.font = "700 46px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 256, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// One car: a Group, its front along +z, standing on y = 0. userData: { spec, lamps: [materials], setLights(on, phase) }
export function makeSupportCar(id) {
  const spec = SUPPORT_CARS[id] || SUPPORT_CARS.neutralSc, sh = SHAPES[spec.type], { L, W, H } = spec;
  const belt = H * sh.belt, floor = 0.13, hl = L / 2;
  const group = new THREE.Group(); group.name = "supportCar:" + id;
  const mat = (o) => new THREE.MeshStandardMaterial(o);
  const bodyM = mat({ color: spec.body, roughness: 0.35, metalness: 0.45, side: THREE.DoubleSide }), accentM = mat({ color: spec.accent, roughness: 0.5, metalness: 0.3 });
  const glassM = mat({ color: "#0d1117", roughness: 0.08, metalness: 0.6, side: THREE.DoubleSide }), tyreM = mat({ color: "#161718", roughness: 0.85 }), rimM = mat({ color: "#2a2c2f", roughness: 0.4, metalness: 0.7 });
  // the body below the windows: rear → front, the bonnet sloping to the nose
  const mid = (floor + belt) / 2, hh = (belt - floor) / 2;
  // (squarish sections – a car's flat sides and deck –, the bonnet falling gently to a blunt nose; the sides inside the
  // wheels' outer faces, so the wheels show)
  const bw = W * 0.47;
  const body = loft([
    [-hl, mid + hh * 0.05, bw * 0.86, hh * 0.9, 0, sh.pw], [-hl + 0.2, mid + hh * 0.03, bw * 0.98, hh * 0.98, 0, sh.pw], [-hl + 1.0, mid, bw, hh, 0, sh.pw],
    [hl - 1.0, mid - hh * 0.03, bw, hh * 0.97, 0, sh.pw], [hl - 0.45, mid - hh * 0.08, bw * 0.98, hh * 0.9, 0, sh.pw], [hl - 0.15, mid - hh * 0.12, bw * 0.93, hh * 0.8, 0, sh.pw],
    [hl - 0.01, mid - hh * 0.15, bw * 0.84, hh * 0.68, 0, sh.pw],
  ], 28);
  // the cabin: dark glass with the body's colour on the roof
  const [cr, cf] = sh.cab.map((k) => k * L), pz = sh.peak * L, top = H - 0.02;
  const cabin = loft([
    [cr - 0.25, belt + 0.02, W * 0.44, 0.03, 0, 3], [cr, belt + (top - belt) * 0.55, W * 0.42, (top - belt) * 0.5, 0, 3], [pz, belt + (top - belt) / 2, W * 0.4, (top - belt) / 2, 0, 3],
    [cf, belt + (top - belt) * 0.42, W * 0.41, (top - belt) * 0.4, 0, 3], [cf + 0.55, belt + 0.03, W * 0.44, 0.03, 0, 3],
  ], 24);
  const roof = boxAt(W * 0.62, 0.035, Math.max(0.6, (cf - cr) * 0.75), 0, top - 0.005, pz);
  group.add(new THREE.Mesh(body, bodyM), new THREE.Mesh(cabin, glassM), new THREE.Mesh(roof, bodyM));
  // the lower sills and bumpers in the accent (the liveries' dark lower bodies and graphics)
  const sx = W * 0.47 + 0.005;
  group.add(new THREE.Mesh(merge([boxAt(0.02, 0.1, L * 0.42, sx, floor + 0.07, 0), boxAt(0.02, 0.1, L * 0.42, -sx, floor + 0.07, 0), boxAt(W * 0.62, 0.08, 0.02, 0, floor + 0.1, hl - 0.005), boxAt(W * 0.62, 0.1, 0.02, 0, floor + 0.12, -hl + 0.005)]), accentM));
  // headlights, tail lights and the grille
  const head = mat({ color: "#e8eef2", emissive: "#fff6e0", emissiveIntensity: 0.35, roughness: 0.2 }), tail = mat({ color: "#5a0a0a", emissive: "#ff1a1a", emissiveIntensity: 0.4, roughness: 0.3 });
  const ny = mid + hh * 0.05, nz = hl - 0.06;
  group.add(new THREE.Mesh(merge([boxAt(0.36, 0.07, 0.08, W * 0.3, ny + hh * 0.25, nz - 0.03, 0, 0, 0), boxAt(0.36, 0.07, 0.08, -W * 0.3, ny + hh * 0.25, nz - 0.03)]), head));
  group.add(new THREE.Mesh(merge([boxAt(0.4, 0.05, 0.04, W * 0.3, mid + hh * 0.5, -hl + 0.02), boxAt(0.4, 0.05, 0.04, -W * 0.3, mid + hh * 0.5, -hl + 0.02)]), tail));
  group.add(new THREE.Mesh(boxAt(W * 0.42, hh * 0.45, 0.03, 0, mid - hh * 0.25, hl - 0.01), accentM));
  // wheels
  const tyre = new THREE.CylinderGeometry(sh.r, sh.r, 0.27, 22).rotateZ(Math.PI / 2), rim = new THREE.CylinderGeometry(sh.r * 0.66, sh.r * 0.66, 0.275, 16).rotateZ(Math.PI / 2);
  const wz = hl - 0.85, wx = W / 2 - 0.14;
  for (const [x, z] of [[wx, wz], [-wx, wz], [wx, -wz + 0.1], [-wx, -wz + 0.1]]) { const a = new THREE.Mesh(tyre, tyreM), b = new THREE.Mesh(rim, rimM); a.position.set(x, sh.r, z); b.position.set(x * 1.002, sh.r, z); group.add(a, b); }
  // a fixed rear wing on the safety cars
  if (spec.wing) group.add(new THREE.Mesh(merge([boxAt(W * 0.82, 0.03, 0.3, 0, belt + 0.2, -hl + 0.32), boxAt(0.04, 0.18, 0.12, W * 0.28, belt + 0.1, -hl + 0.35), boxAt(0.04, 0.18, 0.12, -W * 0.28, belt + 0.1, -hl + 0.35)]), accentM));
  // lights: their own materials (flashing: support state)
  const lamp = (c) => mat({ color: "#1b1b1b", emissive: c, emissiveIntensity: 0.05, roughness: 0.3 });
  const lamps = [];
  if (spec.lights === "screen") {
    const o = lamp("#ff7a00"), gr = lamp("#22e05a"); lamps.push(o, gr);
    group.add(new THREE.Mesh(boxAt(W * 0.28, 0.035, 0.05, -W * 0.15, top - 0.04, cf + 0.02), o), new THREE.Mesh(boxAt(W * 0.28, 0.035, 0.05, W * 0.15, top - 0.04, cf + 0.02), gr));
    if (spec.wing) group.add(new THREE.Mesh(boxAt(W * 0.6, 0.03, 0.03, 0, belt + 0.22, -hl + 0.17), o));
  } else {
    const a = lamp(spec.role === "sc" ? "#ff8a00" : "#ffb000"), b = lamp(spec.role === "sc" ? "#22e05a" : "#ffb000"); lamps.push(a, b);
    group.add(new THREE.Mesh(softBox(W * 0.62, 0.07, 0.22, 0, top + 0.05, pz + 0.05), accentM));
    group.add(new THREE.Mesh(boxAt(W * 0.28, 0.05, 0.2, -W * 0.15, top + 0.06, pz + 0.05), a), new THREE.Mesh(boxAt(W * 0.28, 0.05, 0.2, W * 0.15, top + 0.06, pz + 0.05), b));
  }
  // the role on both doors
  const tex = door(spec.label, spec.role === "medical" && spec.body === "#d9dde1" ? "#c41230" : "#ffffff");
  const labelM = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }); labelM.userData.ownedTextures = [tex];
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.19), labelM); p.position.set(s * (W * 0.47 + 0.004), floor + (belt - floor) * 0.62, -0.05); p.rotation.y = s * Math.PI / 2; group.add(p); }
  // (one mesh per material: the parts' transforms baked in – a car is a handful of draw calls, not two dozen)
  const byMat = new Map(); for (const o of group.children) { o.updateMatrix(); const l = byMat.get(o.material) || []; l.push(o); byMat.set(o.material, l); }
  group.clear();
  for (const [m, list] of byMat) {
    const gs = list.map((o) => { const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrix); o.geometry.dispose(); return g; });
    const uv = gs.every((g) => g.attributes.uv);
    for (const g of gs) { for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && !(uv && k === "uv")) g.deleteAttribute(k); if (!g.attributes.normal) g.computeVertexNormals(); }
    const mesh = new THREE.Mesh(merge(gs), m); for (const g of gs) g.dispose();
    mesh.castShadow = true; mesh.receiveShadow = false; group.add(mesh);
  }
  group.userData = { spec, lamps,
    // on: flashing (deployed / out on track); phase: the session's time (s) – the same moment, the same lamps
    setLights(on, phase) { const k = on ? (Math.floor(phase * 3) % 2 ? 1 : 0.15) : 0.05; lamps.forEach((m, i) => { const v = on ? (i % 2 ? 1.15 - k : k) * 2.2 : 0.05; if (Math.abs(m.emissiveIntensity - v) > 1e-3) m.emissiveIntensity = v; }); } };
  return group;
}
