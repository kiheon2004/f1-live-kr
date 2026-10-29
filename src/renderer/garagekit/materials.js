// The garage kit's library (v0.49): the materials every bay shares, the shared textures, and the equipment modules'
// pieces per lod – made once per library and marked userData.shared, so a bay's disposeGroup (dispose.js) leaves them
// alone; library.dispose() frees them (the menu garage when it hides, a circuit world when it is swapped).
//
// The team's own materials (its accent paint and blanket fabric, cabinet tone, wall lining, floor, signs) are made per
// bay by teamMaterials() – NEW objects owned by that bay, never a shared material recoloured – so changing team can't
// paint another team's room (request §17).
//
// Finishes (roughness / metalness) – the point is that each family reads differently under the same lights; values are
// estimates tuned on screenshots, not measurements:
//   painted floor 0.42–0.85 (map), satin; powder-coated cabinets 0.5; brushed steel 0.3 ± grain, metal; aluminium 0.4;
//   chrome 0.15; rubber (tyres, mats, hoses) 0.85–0.95; fabric (blankets) 0.9 with sheen; carbon lacquered 0.32 with a
//   clearcoat-like sheen via MeshPhysical; plastic bins 0.55.
import * as THREE from "../vendor/three.module.js";
import { Parts } from "./parts.js";
import { BUILD } from "./equipment.js";
import { brushedRough, rubberMap, quiltMap, carbonMap, screensAtlas, contactTexture, floorTextures, panelTexture, signTexture } from "./textures.js";
import { mix, lum } from "./style.js";

const std = (o) => new THREE.MeshStandardMaterial(o);
const shared = (x) => { if (x) { x.userData.shared = true; } return x; };

export function createKitLibrary() {
  const T = { brushed: brushedRough(11, 0.32, 0.1), powder: brushedRough(12, 0.5, 0.08), rubber: rubberMap(), quilt: quiltMap(), carbon: carbonMap(), screens: screensAtlas(), contact: contactTexture() };
  for (const t of Object.values(T)) shared(t);
  const M = {
    steel: std({ color: 0xb9bec4, metalness: 0.9, roughness: 1, roughnessMap: T.brushed }),
    alu: std({ color: 0xc9ccd0, metalness: 0.8, roughness: 0.42 }),
    chrome: std({ color: 0xdfe3e8, metalness: 1, roughness: 0.16 }),
    dark: std({ color: 0x2a2d31, metalness: 0.25, roughness: 1, roughnessMap: T.powder }),
    light: std({ color: 0xd8dbde, metalness: 0.1, roughness: 0.5 }),
    tyre: std({ color: 0x1a1a1c, metalness: 0, roughness: 0.9, map: T.rubber }),
    rubber: std({ color: 0x202124, metalness: 0, roughness: 0.93, map: T.rubber }),
    hose: std({ color: 0x1d1f22, metalness: 0, roughness: 0.7 }),
    rim: std({ color: 0x2b2d31, metalness: 0.7, roughness: 0.38 }),
    fabric: new THREE.MeshPhysicalMaterial({ color: 0x26282b, roughness: 0.9, metalness: 0, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x5a5e66), map: T.quilt }),
    carbon: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: T.carbon, roughness: 0.42, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.18 }),
    plastic: std({ color: 0x3d5a78, metalness: 0, roughness: 0.55 }),
    // the monitors: lit pictures (toneMapped so a dark room doesn't blow them out) – screens do glow; they are not the
    // room's lighting (lights.js has the real lights)
    screen: new THREE.MeshBasicMaterial({ map: T.screens, color: 0xb8c2cc }),
    // light fittings' diffusers: what the eye sees of a lamp; the light itself is a real light in lights.js
    glow: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    bandS: std({ color: 0xe8392f, roughness: 0.6 }), bandM: std({ color: 0xf2c230, roughness: 0.6 }), bandH: std({ color: 0xeef0f2, roughness: 0.6 }),
    // the contact shadow under a car or a module: multiplied over the floor, no depth write (the AO stand-in)
    contact: new THREE.MeshBasicMaterial({ map: T.contact, color: 0x000000, transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    tape: std({ color: 0xe9e9e4, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  };
  for (const m of Object.values(M)) shared(m);
  const modules = new Map();   // kind|lod|variant → Parts (unbaked: a bay clones the pieces it places)
  const lib = {
    T, M, modules,
    module(kind, lod, opts = {}, variant = "") {
      const key = `${kind}|${lod}|${variant}`;
      if (!modules.has(key)) { const P = new Parts(); (BUILD[kind] || (() => {}))(P, lod, opts); modules.set(key, P); }
      return modules.get(key);
    },
    stats() { let tris = 0; for (const P of modules.values()) tris += P.triangles; return { materials: Object.keys(M).length, textures: Object.values(T).filter(Boolean).length, modules: modules.size, moduleTriangles: Math.round(tris) }; },
    disposed: false,
    dispose() {
      if (lib.disposed) return; lib.disposed = true;
      for (const m of Object.values(M)) m.dispose();
      for (const t of Object.values(T)) t?.dispose();
      for (const P of modules.values()) for (const list of P.slots.values()) for (const g of list) g.dispose();
      modules.clear();
    },
  };
  return lib;
}

// the blankets' fabric with the team's tint (quilted, sheen at grazing angles) – also the car's own blankets
export function blanketMaterial(lib, accent) {
  return new THREE.MeshPhysicalMaterial({ color: mix(accent, "#1c1d20", 0.88), roughness: 0.9, metalness: 0, sheen: 0.8, sheenRoughness: 0.5, sheenColor: new THREE.Color(mix(accent, "#6a6d72", 0.8)), map: lib.T.quilt });
}
// The team's materials for one bay – owned by it (freed with it). style: teamGarageStyle. Slots: accent (the team's
// colour: stripes, a jack's rails, the hoses' one coloured line), fabricAccent (blankets – or the black fabric), drawer,
// cab, wall (lining, a panel texture with the team's band), floor (one texture over the floor), sign.
export function teamMaterials(lib, style, { floor = null, signs = [] } = {}) {
  const own = [];
  const mk = (m) => { own.push(m); return m; };
  const accent = mk(std({ color: style.accent, metalness: 0.15, roughness: 0.42 }));
  // (blankets: dark fabric, a team's tint at most – a whole stack in the team colour beside a car in the same colour
  // turned the room into one colour; the colour-coded part is the tag (equipment.js trolley))
  const fabricAccent = style.blanket === "black" ? lib.M.fabric : mk(blanketMaterial(lib, style.accent));
  const cab = mk(std({ color: style.cabinetTone, metalness: 0.25, roughness: 1, roughnessMap: lib.T.powder }));
  const drawer = style.drawer === "accent" ? mk(std({ color: style.accent, metalness: 0.2, roughness: 0.45 })) : style.drawer === "steel" ? lib.M.steel : lib.M.light;
  const M = { ...lib.M, accent, fabricAccent, cab, drawer };
  const textures = [];
  if (floor) {
    const ft = floorTextures(style.floor, floor.w, floor.d, style.seed, floor.car);
    if (ft.map) textures.push(ft.map, ft.rough);
    M.floor = mk(std({ color: ft.map ? 0xffffff : style.floor, map: ft.map, roughness: ft.rough ? 1 : 0.6, roughnessMap: ft.rough, metalness: 0 }));
  }
  const pt = panelTexture(style.wall.base, style.accent, style.wall.band, style.dark, style.seed);
  if (pt) textures.push(pt);
  M.wall = mk(std({ color: pt ? 0xffffff : style.wall.base, map: pt, roughness: 0.55, metalness: 0.05 }));
  M.wallPlain = mk(std({ color: style.wall.base, roughness: 0.6, metalness: 0.05 }));
  M.ceiling = mk(std({ color: style.dark ? "#1d1f22" : mix(style.wall.base, "#5a5e63", 0.45), roughness: 0.85, metalness: 0 }));
  for (const s of signs) {
    const t = signTexture(s.text, style.colour, style.dark, s.sub || "");
    if (t) textures.push(t);
    M[s.slot] = mk(new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 0.5, metalness: 0 }));
  }
  // (the owned list on every owned material, so disposeGroup frees the canvas textures once)
  for (const m of own) m.userData.ownedTextures = textures;
  return { M, own, textures };
}
