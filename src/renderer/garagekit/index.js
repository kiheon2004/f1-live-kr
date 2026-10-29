// The garage interior kit (v0.49) – one import for its users (the menu garage; the circuit garages at the lead's merge).
//   teamGarageStyle(team, colour, { season })        style.js   – a team's look and layout choices (deterministic)
//   normZone / planBay / planClashes / frameMatrix   layout.js  – the zone contract and where things go (pure)
//   createKitLibrary()                                materials.js – shared materials, textures, module pieces
//   buildBayInterior(zone, style, { lib, lod, … })    bay.js     – one bay's interior as a Group
//   buildLightRig(zone, fixtures, target, opts)       lights.js  – a few real lights, ≤ 1 shadow
//   roomEnvironment(renderer, room)                   lights.js  – the room as a PMREM environment map
export { teamGarageStyle, hashStr, rng } from "./style.js";
export { normZone, planBay, planClashes, frameMatrix, toWorld, footprint, MODULES, CLEAR, CAR_DEFAULT } from "./layout.js";
export { createKitLibrary, teamMaterials, blanketMaterial } from "./materials.js";
export { buildBayInterior } from "./bay.js";
export { buildLightRig, roomEnvironment } from "./lights.js";
export { wheel, blanketGeo, TYRE } from "./equipment.js";
