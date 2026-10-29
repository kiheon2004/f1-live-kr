// The kit in the circuit's team garages (v0.49 merge step): map3d.js hands it the teams' layer as built (garages.js
// teamLayer with { kit: true } – the layer's own simple equipment and booms left out, its lining, floors, boards, lights
// kept) and the zones (garages.js garageZones); this fills every team bay and keeps the detail where it is looked at.
//
// Detail (request §17): the NEAR teams – the focused car's and, in the game, the pit camera's subject's – get their own
// bays at full detail (car work spaces lod 0, engineering bays lod 1, team materials, signs, contact shadows); every
// other team bay is drawn at lod 2 in ONE merged mesh per material (shared library materials only – no team accent, no
// signs: a team is told apart from far by the layer's lining and boards), so the whole pit row costs ~a dozen draw
// calls. When the near set changes, the near bays and the far merge are rebuilt (the far one leaves the near teams out).
//
// Light: ONE spot light, made with the kit (so the scene's light count – and every shader – stays the same afterwards),
// casts no shadow (the sun keeps the scene's one shadow map); it is pointed into the focused car's work space and on
// only while the camera is within KEY_NEAR m of that bay's door, else dark. No other light is added.
//
// Ownership: the kit's group sits in the layer's group – it goes with it (disposeGroup); the library (shared
// materials, module pieces) is freed through the group's userData.onDispose. Rebuilt bays free what they owned; the
// library's materials are never written to (team colours are new materials per near bay).
import * as THREE from "../vendor/three.module.js";
import { createKitLibrary } from "./materials.js";
import { buildTeamBays } from "./circuit.js";
import { Parts } from "./parts.js";
import { mergeGeometries } from "../vendor/BufferGeometryUtils.js";
import { normZone, planBay, frameMatrix, planBoxes } from "./layout.js";
import { teamGarageStyle } from "./style.js";
import { disposeGroup } from "../dispose.js";

export const KEY_NEAR = 45;     // m: the key light is on while the camera is this close to the lit bay's door (estimate)
// slots the far merge maps a team material to (no team's colour in the shared far mesh)
const FAR_SLOT = { accent: "dark", fabricAccent: "fabric", cab: "dark", drawer: "light" };

// opts: { G, zones, teams (allocatePlaces' – team, colour), season, near: Set of team names, onMaterial(m) (map3d's
// nightLit), lodNear(zone) → 0 | 1 } → kit { group, update(state), plans(slot) → boxes, state(), near }
export function createPitKit(opts) {
  const lib = createKitLibrary(), group = new THREE.Group(); group.name = "garageKit";
  const colourOf = (t) => opts.teams?.find((x) => x.team === t)?.colour || "#8a9096";
  const zones = (opts.zones || []).filter((z) => z.team && z.kind !== "box" && !normZone(z).error);
  const K = { group, lib, near: new Set(), nearGroup: null, farGroup: null, plans: new Map(), builds: 0, buildMs: 0, report: [], key: null };
  // (the near bays' and the far merge's materials get the night light field too – map3d nightLit – once each)
  const seen = new WeakSet(), lit = (root) => { if (!opts.onMaterial) return; root.traverse((o) => { for (const m of [].concat(o.material || [])) if (m && !seen.has(m)) { seen.add(m); opts.onMaterial(m); } }); };
  // every team zone's plan (the far merge, the check's boxes) – a plan doesn't depend on the level of detail
  const styles = new Map(), styleOf = (t) => styles.get(t) || styles.set(t, teamGarageStyle(t, colourOf(t), { season: opts.season ?? null })).get(t);
  for (const z of zones) K.plans.set(z, planBay(z, styleOf(z.team)));

  // The far merge: every team zone at lod 2, ONE mesh per material for the whole pit row, built once. Each vertex carries
  // its team's index (attribute kitTeam); the far materials (clones of the library's, owned here) drop a hidden team's
  // triangles in the vertex shader (kitHide[i] = 1: put outside the clip volume) – so the near teams' far parts go away
  // and come back without rebuilding anything (a rebuild of the merge cost ~0.2 s).
  const teamIdx = new Map(); for (const z of zones) if (!teamIdx.has(z.team)) teamIdx.set(z.team, teamIdx.size);
  const HIDE = new Array(32).fill(0), hideU = { value: HIDE };
  function farMaterial(src) {
    const m = src.clone(); m.userData = { kitFar: true };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.kitHide = hideU;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float kitTeam;\nuniform float kitHide[32];")
        .replace("#include <project_vertex>", "#include <project_vertex>\n  if (kitHide[int(kitTeam + 0.5)] > 0.5) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);");
    };
    m.customProgramCacheKey = () => "kitFar|" + src.type;
    return m;
  }
  function buildFar() {
    const per = new Map(), m4 = new THREE.Matrix4(), place = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), e = new THREE.Euler(), v = new THREE.Vector3();
    for (const [team, ti] of teamIdx) {
      const P = new Parts();
      for (const z of zones) {
        if (z.team !== team) continue;
        const plan = K.plans.get(z), n = plan.zone; m4.fromArray(frameMatrix(n));
        for (const it of plan.items) { place.compose(v.set(it.x, 0, it.z), q.setFromEuler(e.set(0, it.ry, 0)), one); P.merge(lib.module(it.kind, 2, it.monitors ? { monitors: it.monitors } : {}, it.monitors ? String(it.monitors) : ""), m4.clone().multiply(place)); }
        if (plan.overhead) P.merge(lib.boom(2, plan.overhead), m4.clone().multiply(place.makeTranslation(0, 0, plan.overhead.z0)));
      }
      for (const [slot, geo] of P.bake()) {
        const key = FAR_SLOT[slot] || slot; if (!lib.M[key]) { geo.dispose(); continue; }
        geo.setAttribute("kitTeam", new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(ti), 1));
        (per.get(key) || per.set(key, []).get(key)).push(geo);
      }
    }
    const g = new THREE.Group(); g.name = "garageKitFar";
    for (const [key, list] of per) {
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false); if (list.length > 1) for (const x of list) x.dispose();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, farMaterial(lib.M[key])); mesh.name = "kitFar:" + key; mesh.receiveShadow = true; mesh.castShadow = false; mesh.userData.kit = "far"; g.add(mesh);
    }
    return g;
  }
  const hide = (near) => { HIDE.fill(0); for (const t of near) { const i = teamIdx.get(t); if (i != null && i < 32) HIDE[i] = 1; } };
  // the near teams' own bays (lod by zone kind), their checks against the car spots (garagecheck.js checkCar)
  function buildNear(near) {
    const nz = zones.filter((z) => near.has(z.team));
    const r = buildTeamBays(nz, opts.G, { lib, colourOf, season: opts.season, shareTeam: true, lodOf: opts.lodNear || ((z) => (z.kind === "car" ? 0 : 1)) });
    // (the near teams' bays merged per material: a team's bays share its materials – ~25 draws for the team instead of
    // ~25 per bay; the merged meshes are in the world frame)
    const byMat = new Map();
    r.group.updateMatrixWorld(true);
    r.group.traverse((o) => { if (o.isMesh) (byMat.get(o.material) || byMat.set(o.material, []).get(o.material)).push(o); });
    const g = new THREE.Group(); g.name = "garageKitNear";
    for (const [mat, list] of byMat) {
      const geos = list.map((m) => { const c = m.geometry.clone(); c.applyMatrix4(m.matrixWorld); return c; });
      const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false); if (geos.length > 1) for (const x of geos) x.dispose();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat); mesh.name = list[0].name; mesh.castShadow = false; mesh.receiveShadow = list[0].receiveShadow; mesh.renderOrder = list[0].renderOrder; mesh.userData.kit = "near"; g.add(mesh);
    }
    for (const b of r.bays) b.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    return { group: g, report: r.report };
  }
  // the near teams' bays: built for a team set, kept for the last two sets (switching the focus back is free)
  const nearCache = new Map();
  function rebuild(near) {
    const t0 = performance.now(), key = [...near].sort().join("|");
    if (K.nearGroup) group.remove(K.nearGroup);
    let c = nearCache.get(key);
    if (!c) { c = buildNear(near); nearCache.set(key, c); } else { nearCache.delete(key); nearCache.set(key, c); }
    while (nearCache.size > 2) { const [k0, old] = nearCache.entries().next().value; nearCache.delete(k0); disposeGroup(old.group); }
    K.nearGroup = c.group; K.report = c.report;
    if (!K.farGroup) { K.farGroup = buildFar(); group.add(K.farGroup); }
    hide(near); group.add(K.nearGroup); lit(group);
    K.near = new Set(near); K.key = key; K.builds++; K.buildMs = Math.round(performance.now() - t0);
    K.rev = (K.rev || 0) + 1; group.userData.rev = K.rev;
  }
  // the one key light (no shadow), pointed at the focused car's work space while the camera is near it
  const key = new THREE.SpotLight(0xfff4e8, 0, 14, 0.95, 0.85, 1.6); key.name = "garageKitKey"; key.castShadow = false;
  if (opts.light !== false) group.add(key, key.target);
  K.keyLight = key;
  function aimKey(cam, focus) {
    const z = zones.find((x) => x.kind === "car" && String(x.num) === String(focus)) || null;
    K.keyBay = z ? z.slot : null;
    if (!z || !cam || !key.parent) { key.intensity = 0; return; }
    const n = normZone(z), p = K.plans.get(z), d = p?.car ? p.car.z0 + p.car.length / 2 : n.depth / 2;
    const at = (x, y, zz) => [n.door[0] + n.x[0] * x + n.inward[0] * zz, n.floorY + y, n.door[1] + n.x[1] * x + n.inward[1] * zz];
    const L = at(0.4, n.ceilingH - 0.4, d - 0.6), T = at(0, 0, d + 0.2), door = at(0, 1.5, 0);
    key.position.set(...L); key.target.position.set(...T); key.target.updateMatrixWorld();
    const dist = Math.hypot(cam.x - door[0], cam.y - door[1], cam.z - door[2]);
    key.intensity = dist < KEY_NEAR ? 60 : 0;
  }
  // (the cached near groups not in the scene now are freed with the kit too; the far materials are its own clones)
  group.userData.onDispose = () => { for (const c of nearCache.values()) if (c.group !== K.nearGroup) disposeGroup(c.group); nearCache.clear(); lib.dispose(); };
  rebuild(opts.near || new Set());
  return {
    group,
    // (each frame is fine – cheap unless the near set changed) near: Set of team names; cam: the camera's position;
    // focus: the focused car's number
    update({ near, cam, focus }) {
      const k = [...(near || [])].sort().join("|");
      if (k !== K.key) rebuild(near || new Set());
      aimKey(cam, focus);
    },
    // the kit's things as boxes in the garage helper's bay frame, every zone of that slot (garagecheck.js equipment)
    boxesFor(slot) { const out = []; for (const z of zones) if (z.slot === slot) out.push(...planBoxes(K.plans.get(z), z)); return out; },
    // pit-camera occluders: the near bays' meshes (small bounds – the far merge spans the building and is left out)
    occluders() { const o = []; K.nearGroup?.traverse((m) => { if (m.isMesh) o.push(m); }); return o; },
    get rev() { return K.rev; },
    state() {
      let draws = 0, tris = 0; group.traverse((o) => { if (o.isMesh && o.visible) { draws++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
      return { near: [...K.near], zones: zones.length, builds: K.builds, buildMs: K.buildMs, meshes: draws, triangles: Math.round(tris), key: { bay: K.keyBay, on: key.intensity > 0 }, hits: K.report.filter((r) => r.hits?.length).map((r) => ({ team: r.team, num: r.num, hits: r.hits })) };
    },
  };
}
