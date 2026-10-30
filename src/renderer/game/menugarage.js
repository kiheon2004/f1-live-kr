// The menu garage (v0.49, request §9–§11): a standalone 3D room that shows the player's team's car – the app's own model
// (car3d.js makeCar: the season's and team's shape and livery) – from a low front-quarter camera, in a garage built from
// the shared interior kit (garagekit/*). It opens without any circuit: no map, no terrain, no download; everything is
// made here from code.
//
// API (window.MenuGarage, and the module's exports) – for the game's screens (the ui helper builds the buttons on top):
//   show({ season, teamKey, team, colour, entries, focusNum, date?, host?, safeLeft?, safeRight? }) → Promise<state>
//       season: number; teamKey / team: the scenario's team key and name (car3d's team names: "McLaren", …); colour:
//       "#rrggbb" or "rrggbb"; entries: the team's two drivers FROM THE CHOSEN RACE'S ENTRY LIST ([{ num, tla, name }] –
//       which race's list it is is the caller's to say on screen); focusNum: the car in front (default entries[0]);
//       date: the race's date (car3d picks a mid-season car change by it); host: the element the canvas fills (default
//       #gGarage3d, else #game); safeLeft / safeRight: the fractions of the width the menu column (left) and the driver
//       cards (right) cover (each 0…0.6; together ≤ 0.8) – the car is framed between them, the view zoomed out when the
//       free middle is narrow. safeLeft: the fraction of the width the menu covers on the left – the car is
//       framed in the rest. Calling it again with another team replaces the room; with the same team only refocuses.
//   setFocus(num) – the other driver's car to the front bay (no rebuild: the two cars swap bays)
//   setMotion("auto" | "on" | "off") – the slow camera drift; "auto" follows prefers-reduced-motion; saved
//       (localStorage f1kr:game:motion). Off: nothing moves and the room is drawn only when something changes.
//   setSafeLeft(f) / setSafe(left, right) – re-frame for a menu / cards of another width (the menu measures its DOM)
//   setQuality("high" | "medium" | "low") – the menu's own quality budget (v0.50): high adds the floor's reflection of the
//       cars and draws the still picture at 1.5×; low drops the rim light, draws at 1× with a 1024² shadow map. Rebuilds
//       the room when the level changes. show({ quality }) sets it too.
//   hide() – stops drawing at once and frees everything on the GPU: the room, the cars, the textures, the WebGL context
//   dispose() – hide() and forget the host (the game closing)
//   state() – a plain object for dev checks: what is shown, the loop, renderer.info, the generation counter.
//
// Rendering: its OWN WebGLRenderer on its own canvas, made at show and destroyed at hide. Why not map3d's: map3d's
// renderer is private to map3d.js, set up for a circuit (sun shadow map 4096², fog, sky, weather, its own frame loop
// that builds a world when shown), and its canvas sits in #map3d, which the race screen borrows. Reusing it would mean
// opening map3d's internals and saving / restoring its tone mapping, shadow and environment state around every menu
// frame. A separate context costs one canvas while the menu shows (freed at hide), and only one of the two ever draws:
// show() hides Map3D (its loop stops at its next frame) and the globe is already stopped by the game screen
// (home.js on "f1kr-game"); the menu's own loop draws only while the menu shows, and only when something moves.
//
// Lifetime and ownership: every show() takes a generation number; the room is built, its shaders compiled
// (compileAsync), and only then attached – if another show() or a hide() came in between, the late room is freed
// and never attached (a slow build can't put team A's car into team B's garage). The cars' shared parts (car3d.js
// marks them userData.shared) are never freed or written to: this module changes only its own objects' visibility
// and transforms, and its own new materials – no shared material is recoloured. The renderer's bookkeeping on those
// shared parts (three.js adds a dispose listener per renderer) is removed when the renderer goes, so a closed menu
// leaves nothing of its context behind.
import * as THREE from "../vendor/three.module.js";
import { makeCar, CAR_SKY } from "../car3d.js";
import { disposeGroup } from "../dispose.js";
import { createKitLibrary, buildBayInterior, teamGarageStyle, buildLightRig, roomEnvironment, blanketGeo, blanketMaterial } from "../garagekit/index.js";

// The room (estimates – a garage a car fits in with room round it; the circuit garages' sizes are the garage helper's):
// a bay 8.4 m wide, 12 m deep, 4.9 m to the ceiling, its door 7.6 × 4.25 m (the app's circuit garages' door height,
// v0.48 audit); the second bay beside it through a partition with a roller shutter half up.
export const ROOM = { width: 8.4, depth: 12.5, ceilingH: 4.9, doorW: 7.6, doorH: 4.25, wall: 0.3, carZ0: 3.2, opening: { z0: 3.0, z1: 8.4, h: 3.1, shutter: 2.15 } };
// The camera: low, ahead of the nose and to its left (a front quarter) – offsets from the primary car's centre in the
// room frame (the car's nose toward −z, the door); look: the point it aims at. FOV vertical (deg).
export const CAM = { pos: [-2.95, 0.58, -4.95], look: [0.35, 0.78, -0.7], fov: 41, drift: { yaw: 0.05, h: 0.04, period: 26 } };
const MOTION_KEY = "f1kr:game:motion";

const MG = { gen: 0, on: false, host: null, canvas: null, renderer: null, world: null, raf: 0, dirty: false, ro: null, mq: null,
  motion: readMotion(), quality: "medium", safeLeft: 0.32, safeRight: 0, frames: 0, ms: [], last: 0, t0: 0, stale: 0, built: 0, leases: new Map(), err: null, req: null };

function readMotion() { try { const v = localStorage.getItem(MOTION_KEY); return ["on", "off", "auto"].includes(v) ? v : "auto"; } catch { return "auto"; } }
// Resolution: a still picture is drawn once per change – at up to 1.5× (sharp edges on the car's curves); while the
// camera drifts every frame is drawn, at 1× (measured, 2400×1302 at 1.5×: ~40 ms of GPU per frame on this M3 – the room's
// environment map ~10 ms, the side / door lamps ~13 ms, the shadow ~3 ms – a menu doesn't need that every frame).
// The quality levels (the menu's own budget, apart from the circuit view's): high – the floor's reflection of the cars, the
// still picture at 1.5×; medium – no reflection, 1.25×; low – no reflection, no rim light, 1× and a 1024² shadow map.
export const QUALITY = { high: { still: 1.5, move: 1, mirror: true, rim: true, shadow: 2048 }, medium: { still: 1.25, move: 1, mirror: false, rim: true, shadow: 2048 }, low: { still: 1, move: 1, mirror: false, rim: false, shadow: 1024 } };
const Q = () => QUALITY[MG.quality] || QUALITY.medium;
const pixelRatio = (move) => Math.min(move ? Q().move : Q().still, (typeof devicePixelRatio === "number" && devicePixelRatio) || 1);
const reducedPref = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const moving = () => (MG.motion === "on" ? true : MG.motion === "off" ? false : !reducedPref());
const hexc = (c) => { const s = String(c ?? "").replace(/^#/, ""); return /^[0-9a-f]{6}$/i.test(s) ? "#" + s : "#888888"; };

// ---------- the renderer ----------
function ensureRenderer(host) {
  if (MG.renderer) { if (host && MG.canvas.parentNode !== host) host.prepend(MG.canvas); return MG.renderer; }
  const c = document.createElement("canvas"); c.className = "menu-garage-canvas";
  Object.assign(c.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });
  (host || document.body).prepend(c);
  const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, powerPreference: "high-performance" });
  r.setPixelRatio(pixelRatio(false));
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.9; r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; r.shadowMap.autoUpdate = false;   // (redrawn when the scene changes: render())
  MG.canvas = c; MG.renderer = r; MG.host = host;
  MG.ro = new ResizeObserver(() => { resize(); kick(); }); MG.ro.observe(host || document.body);
  c.addEventListener("webglcontextlost", (e) => { e.preventDefault(); MG.err = "context lost"; stopLoop(); });
  resize();
  return r;
}
function resize() {
  const r = MG.renderer; if (!r) return; const h = MG.host || document.body;
  const w = Math.max(2, h.clientWidth || innerWidth), hh = Math.max(2, h.clientHeight || innerHeight);
  r.setSize(w, hh, false);
  if (MG.world) frameCamera(MG.world.camera, w, hh);
}
// the car framed in the part of the screen the menu and the cards leave free: the picture's window slid by half the
// difference of the two margins (the free middle's centre), zoomed out when that middle is narrower than the 70 % the
// framing was tuned for (CAM: menu column 30 %, nothing on the right)
export const frameOf = (l, r) => ({ shift: (l - r) / 2, zoom: Math.min(1, Math.max(0.5, (1 - l - r) / 0.7)) });
function frameCamera(cam, w, h) {
  cam.aspect = w / h; cam.fov = CAM.fov;
  const f = frameOf(MG.safeLeft, MG.safeRight);
  cam.zoom = f.zoom;
  if (Math.abs(f.shift) > 1e-4) cam.setViewOffset(w, h, -w * f.shift, 0, w, h); else cam.clearViewOffset();
  cam.updateProjectionMatrix();
}

// Remember which dispose listeners a shared object (a car's template geometry, a shared material or texture) had before
// this renderer saw it; when the renderer goes, the ones it added are taken off again (three.js keeps them otherwise –
// and with them the dead context's tables – for as long as the shared object lives).
function lease(root) {
  root.traverse((o) => {
    const things = [o.geometry, ...[].concat(o.material || [])];
    for (const m of [].concat(o.material || [])) if (m) for (const k in m) if (m[k]?.isTexture) things.push(m[k]);
    for (const x of things) if (x?.userData?.shared && !MG.leases.has(x)) MG.leases.set(x, new Set(x._listeners?.dispose || []));
  });
}
function releaseLeases() {
  let n = 0;
  for (const [x, before] of MG.leases) for (const f of [...(x._listeners?.dispose || [])]) if (!before.has(f)) { x.removeEventListener("dispose", f); n++; }
  MG.leases.clear();
  return n;
}

// ---------- the room ----------
function zoneA() { return { width: ROOM.width, depth: ROOM.depth, ceilingH: ROOM.ceilingH, doorW: ROOM.doorW, doorH: ROOM.doorH, centre: [0, ROOM.depth / 2], inward: [0, 1], along: [1, 0], kind: "menu" }; }
function zoneB() { const x = ROOM.width + ROOM.wall; return { ...zoneA(), centre: [x, ROOM.depth / 2] }; }

function buildWorld(o, renderer) {
  const t0 = performance.now();
  const style = menuStyle(teamGarageStyle(o.team, o.colour, { season: o.season }));
  const lib = createKitLibrary(), scene = new THREE.Scene(), entries = (o.entries || []).filter((e) => e && e.num != null).slice(0, 2);
  scene.background = new THREE.Color(style.dark ? 0x101113 : 0x1b1d20);
  // the cars first: their real bounds size the work area
  const cars = entries.map((e) => {
    const car = makeCar({ teamName: o.team, teamColour: hexc(o.colour), number: e.num, season: o.season, date: o.date || null });
    parked(car, lib, style);
    car.updateMatrixWorld(true);
    const b = new THREE.Box3(); for (const m of car.children) if (m.visible) b.expandByObject(m);
    return { num: String(e.num), entry: e, obj: car, box: b };
  });
  const dims = cars[0] ? { length: cars[0].box.max.z - cars[0].box.min.z, width: cars[0].box.max.x - cars[0].box.min.x, height: cars[0].box.max.y, front: cars[0].box.max.z } : undefined;
  const opening = { wall: "right", ...ROOM.opening };
  // (the camera's corner – front left, ahead of the nose and beside the front wheels – kept free of equipment: a cooling
  // unit's duct 3–4 m from the lens filled the frame's edge)
  // (and the partition's opening on both sides: the second car is seen through it)
  const op = ROOM.opening, keep = [{ x0: -ROOM.width / 2, x1: -1.1, z0: 0, z1: ROOM.carZ0 + 2.6 }, { x0: ROOM.width / 2 - 1.2, x1: ROOM.width / 2, z0: op.z0 - 0.2, z1: op.z1 + 0.2 }];
  const keepB = [{ x0: -ROOM.width / 2, x1: -ROOM.width / 2 + 1.2, z0: op.z0 - 0.2, z1: op.z1 + 0.2 }];
  const A = buildBayInterior(zoneA(), style, { lib, lod: 0, car: dims, carZ0: ROOM.carZ0, keep, shell: { floor: true, walls: ["left", "right", "back"], ceiling: true, header: true, openings: [opening] }, signSub: `${o.season} 시즌` });
  const B = buildBayInterior(zoneB(), style, { lib, lod: 1, car: dims, carZ0: ROOM.carZ0, keep: keepB, shell: { floor: true, walls: ["left", "right", "back"], ceiling: true, header: true, openings: [{ ...opening, wall: "left", shutter: 0 }] }, signs: false });
  scene.add(A, B);
  // the partition's reveal round the opening (its thickness between the two bays' linings)
  const reveal = new THREE.Group(); reveal.name = "reveal";
  for (const [z, w] of [[opening.z0, 0.04], [opening.z1, 0.04]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(ROOM.wall, opening.h, w), lib.M.dark); m.position.set(ROOM.width / 2 + ROOM.wall / 2, opening.h / 2, z); reveal.add(m); }
  { const m = new THREE.Mesh(new THREE.BoxGeometry(ROOM.wall, 0.04, opening.z1 - opening.z0), lib.M.dark); m.position.set(ROOM.width / 2 + ROOM.wall / 2, opening.h, (opening.z0 + opening.z1) / 2); reveal.add(m); }
  scene.add(reveal);
  // where the cars stand: bay A's work place (the front car), bay B's (the other); nose to the door
  const planA = A.userData.plan;
  const spot = (bay) => { const p = bay.userData.plan.car; return p ? new THREE.Vector3(bay.position.x, 0, p.z0) : new THREE.Vector3(bay.position.x, 0, ROOM.carZ0); };
  const spots = [spot(A), spot(B)];
  for (const c of cars) { scene.add(c.obj); scene.add(c.contact = contactUnder(c, lib)); }
  // the lights: bay A's rig (the key light over the front car casts the scene's one shadow), bay B gets only its
  // ceiling's two soft lamps (no shadow), the room's environment for reflections
  const target = [0, 0.5, (planA.car?.z0 ?? ROOM.carZ0) + (dims?.length ?? 5.6) / 2];
  const rigA = buildLightRig(A.userData.zone, A.userData.fixtures, target, { mode: "full", shadow: true, shadowSize: Q().shadow, floor: style.floor });
  A.add(rigA.group);
  const rigB = buildLightRig(B.userData.zone, B.userData.fixtures, [0, 0.5, target[2]], { mode: "full", key: false, sides: 1, hemi: false, shadow: false, door: false, scale: 0.9 });
  B.add(rigB.group);
  const env = roomEnvironment(renderer, { width: ROOM.width, depth: ROOM.depth, ceilingH: ROOM.ceilingH, wall: style.wall.base, floor: style.floor, ceiling: style.dark ? "#1d1f22" : "#55595e", fixtures: A.userData.fixtures.filter((f) => f.kind === "ceiling"), doorW: ROOM.doorW, doorH: ROOM.doorH });
  scene.environment = env; scene.environmentIntensity = 0.75;
  // (the floor faces the ceiling's bright lamp strips in the environment map: its image-based fill alone lifted it to a
  // near-white; the door's daylight lit the foreground floor more than the car. Menu-only: the floor takes a third of the
  // room's fill and the door light is halved – the floor reads as a painted floor in a lit room, the car stays the
  // brightest thing in the middle)
  for (const bay of [A, B]) bay.traverse((x) => { if (x.isMesh && x.name === "bay:floor" && x.material) x.material.envMapIntensity = 0.32; });
  for (const l of rigA.lights) if (l.isSpotLight && l.color.getHex() === 0xdde6f5) l.intensity *= 0.45;
  // the rim: a cool, soft light from behind and above the front car (no shadow) – it draws the bodywork's upper edges
  // and the halo against the darker back wall, so the car's shape reads apart from the room (quality ≥ medium)
  const extra = [reveal], lights = [...rigA.lights, ...rigB.lights];
  if (Q().rim) {
    const rim = new THREE.SpotLight(0xdfe8ff, 55, 0, 0.75, 0.9, 2); rim.name = "menuRim";
    rim.position.set(1.4, ROOM.ceilingH - 0.4, target[2] + 4.2); rim.target.position.set(0, 0.6, target[2] - 0.4);
    A.add(rim, rim.target); lights.push(rim);
  }
  const camera = new THREE.PerspectiveCamera(CAM.fov, 16 / 9, 0.1, 80);
  const W = { key: `${o.season}|${o.teamKey}`, season: o.season, teamKey: o.teamKey, team: o.team, colour: hexc(o.colour), style, lib, scene, camera, env, bays: [A, B], cars, spots, lights,
    focus: null, buildMs: 0, extra, quality: MG.quality };
  // the floor's reflection of the cars (high quality only): the cars and the lights also on the mirror's layer
  if (Q().mirror) {
    for (const c of cars) c.obj.traverse((x) => x.layers.enable(MIRROR_LAYER));
    scene.traverse((x) => { if (x.isLight) x.layers.enable(MIRROR_LAYER); });
    W.mirror = makeMirror(); scene.add(W.mirror.mesh); extra.push(W.mirror.mesh);
  }
  setFocusIn(W, o.focusNum ?? cars[0]?.num);
  W.buildMs = Math.round(performance.now() - t0);
  return W;
}
// a car as it stands in a garage: no driver (helmet, torso, arms, gloves hidden – these are this car's own objects, only
// their visibility changes), tyre blankets on its four wheels, every part casting and taking shadows
function parked(car, lib, style) {
  const u = car.userData;
  u.helmet && (u.helmet.visible = false);
  car.traverse((o) => { if (/^(torso|arm|gauntlet|glove|gloveLo)$/.test(o.name)) o.visible = false; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // the blankets (the kit's own geometry, made for this car's wheel widths; its fabric: the team's or black)
  const p = u.profile, fab = style.blanket === "black" ? lib.M.fabric : blanketMaterial(lib, style.accent);
  const geos = new Map();
  u.wheels.forEach((w, i) => {
    const wd = (i < 2 ? p.FW : p.RW) || 0.36, key = wd.toFixed(3);
    if (!geos.has(key)) { const g = blanketGeo(0, wd); g.rotateZ(Math.PI / 2); geos.set(key, g); }
    const m = new THREE.Mesh(geos.get(key), fab); m.name = "blanket"; m.castShadow = true; m.receiveShadow = true; w.add(m);
  });
}
// the soft dark patch under the car (the AO stand-in for where the floor meets the car: the key light's shadow alone
// leaves the floor under the floor-plate too bright from the bounce light)
// plus a small, darker patch under each tyre's contact (where the rubber meets the floor the floor gets almost no light –
// without it the car looked set onto the floor rather than standing on it). In the car's frame: the group is turned and
// placed with the car (setFocusIn), the wheels' x / z from the car's own wheel objects.
function contactUnder(c, lib) {
  const b = c.box, grp = new THREE.Group(); grp.name = "contact";
  const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, lib.M.contact); m.scale.set((b.max.x - b.min.x) * 1.12, 1, (b.max.z - b.min.z) * 1.04); m.renderOrder = 1; grp.add(m);
  const cz = (b.max.z + b.min.z) / 2, p = c.obj.userData.profile || {};
  for (const [i, w] of (c.obj.userData.wheels || []).entries()) {
    const wp = new THREE.Vector3(); w.getWorldPosition(wp); c.obj.worldToLocal(wp);
    const wd = ((i < 2 ? p.FW : p.RW) || 0.36) * 1.5, len = 0.42;
    const t = new THREE.Mesh(g, lib.M.contact); t.scale.set(wd, 1, len); t.position.set(wp.x, 0.002, wp.z - cz); t.renderOrder = 2; grp.add(t);
  }
  return grp;
}
// put the focused car in bay A, the other in bay B (no rebuild); camera re-aimed
function setFocusIn(W, num) {
  const cars = W.cars; if (!cars.length) return;
  const first = cars.find((c) => c.num === String(num)) || cars[0];
  W.focus = first.num;
  const order = [first, ...cars.filter((c) => c !== first)];
  order.forEach((c, i) => {
    const s = W.spots[i]; if (!s) { c.obj.visible = false; c.contact.visible = false; return; }
    const cz = s.z + c.box.max.z;                       // the nose (model +z) at the spot's z0, facing the door (−z)
    c.obj.position.set(s.x, 0, cz); c.obj.rotation.set(0, Math.PI, 0); c.obj.visible = true;
    c.contact.position.set(s.x, 0.005, cz - (c.box.max.z + c.box.min.z) / 2); c.contact.rotation.set(0, Math.PI, 0); c.contact.visible = true;
    c.bay = i;
  });
  W.anchor = new THREE.Vector3(W.spots[0].x, 0, W.spots[0].z + first.box.max.z);
  if (W.mirror) { const u = W.mirror.mat.uniforms; order.forEach((c, i) => u[i ? "c1" : "c0"].value.set(c.contact.position.x, c.contact.position.z)); if (order.length < 2) u.c1.value.copy(u.c0.value); }
}
function aim(W, t) {
  const cam = W.camera, a = W.anchor, d = moving() ? CAM.drift : null;
  const ph = d ? (t / 1000 / d.period) * Math.PI * 2 : 0, yaw = d ? Math.sin(ph) * d.yaw : 0, dh = d ? Math.sin(ph * 0.7) * d.h : 0;
  const [px, py, pz] = CAM.pos, c = Math.cos(yaw), s = Math.sin(yaw);
  cam.position.set(a.x + px * c - pz * s, py + dh, a.z + px * s + pz * c);
  cam.lookAt(a.x + CAM.look[0], CAM.look[1], a.z + CAM.look[2]);
}
function disposeWorld(W) {
  if (!W) return;
  const done = new Set();
  for (const c of W.cars) { disposeGroup(c.obj, done); disposeGroup(c.contact, done); }
  for (const b of W.bays) disposeGroup(b, done);
  for (const x of W.extra || []) disposeGroup(x, done);
  for (const l of W.lights) l.shadow?.map?.dispose?.();
  W.env?.dispose(); W.env?.userData.renderTarget?.dispose();
  if (W.mirror) { W.mirror.tex?.dispose(); W.mirror.mat.dispose(); }
  W.lib.dispose();
  W.scene.clear();
}

// ---------- menu-only looks ----------
// The floor: the kit picks a light epoxy grey for a circuit garage (seen from outside, in daylight); in the menu the
// camera looks down at it from 0.6 m and it filled half the picture brighter than the car. Here it is taken towards
// graphite (the same hue, about half the value) – this world's own style object, the circuit's garages are untouched.
const MIRROR_LAYER = 3;
function menuStyle(style) {
  const c = new THREE.Color(style.floor), hsl = {}; c.getHSL(hsl, THREE.SRGBColorSpace);   // (sRGB lightness, not linear)
  c.setHSL(hsl.h, hsl.s * 0.8, Math.min(hsl.l, 0.62) * 0.5, THREE.SRGBColorSpace);
  return { ...style, floor: "#" + c.getHexString() };
}
// The floor's reflection (high quality): the cars (and only the cars – MIRROR_LAYER) drawn by the camera mirrored in the
// floor plane into a corner of the canvas at half size, copied into a texture (copyFramebufferToTexture), then laid over
// the floor near the cars as a faint additive sheen (a satin epoxy, not a mirror). Drawn on the canvas rather than into a
// render target so it uses the very shader programs of the main pass (a render target needs other tone-mapping variants
// of every car material: measured +2.6 s of compiling on the first picture). One extra pass of the cars' draws at a
// quarter of the pixels, only when the picture is redrawn anyway.
function makeMirror() {
  const cam = new THREE.PerspectiveCamera(); cam.layers.set(MIRROR_LAYER);
  const mat = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null }, texM: { value: new THREE.Matrix4() }, strength: { value: 0.5 }, c0: { value: new THREE.Vector2() }, c1: { value: new THREE.Vector2() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    vertexShader: `uniform mat4 texM; varying vec4 vUv; varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vUv = texM * w; gl_Position = projectionMatrix * viewMatrix * w; }`,
    // (the copied picture is already tone-mapped and sRGB-encoded – the texture is plain RGBA8, a copy can't go into an sRGB
    // texture: decoded here, written back through the output encoding only)
    fragmentShader: `uniform sampler2D tMap; uniform float strength; uniform vec2 c0; uniform vec2 c1; varying vec4 vUv; varying vec3 vW;
      void main() {
        vec3 r = sRGBTransferEOTF(texture2DProj(tMap, vUv)).rgb;
        float d = min(distance(vW.xz, c0), distance(vW.xz, c1));
        float fade = 1.0 - smoothstep(0.8, 3.4, d);
        gl_FragColor = vec4(r * strength * fade, 1.0);
        #include <colorspace_fragment>
      }` });
  const g = new THREE.PlaneGeometry(ROOM.width * 2 + ROOM.wall, ROOM.depth); g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, mat); mesh.position.set((ROOM.width + ROOM.wall) / 2, 0.003, ROOM.depth / 2); mesh.renderOrder = 0.5; mesh.name = "menuMirror";
  mesh.visible = false;   // (until the first copy exists)
  return { tex: null, cam, mat, mesh, look: new THREE.Vector3(), clear: new THREE.Color(), vp: new THREE.Vector4(), buf: new THREE.Vector2(), at: new THREE.Vector2(0, 0) };
}
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
function renderMirror(W, r) {
  const M = W.mirror, cam = W.camera, vc = M.cam, buf = r.getDrawingBufferSize(M.buf), ratio = r.getPixelRatio();
  const w = Math.max(2, buf.x >> 1), h = Math.max(2, buf.y >> 1);
  if (!M.tex || M.tex.image.width !== w || M.tex.image.height !== h) {
    M.tex?.dispose(); M.tex = new THREE.FramebufferTexture(w, h); M.tex.minFilter = M.tex.magFilter = THREE.LinearFilter;
    M.mat.uniforms.tMap.value = M.tex;
  }
  cam.updateMatrixWorld();
  vc.position.set(cam.position.x, -cam.position.y, cam.position.z);
  M.look.set(0, 0, -1).applyQuaternion(cam.quaternion).add(cam.position); M.look.y = -M.look.y;
  vc.up.set(0, 1, 0).applyQuaternion(cam.quaternion); vc.up.y = -vc.up.y;
  vc.lookAt(M.look); vc.near = cam.near; vc.far = cam.far;
  vc.updateMatrixWorld(); vc.projectionMatrix.copy(cam.projectionMatrix); vc.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
  M.mat.uniforms.texM.value.copy(BIAS).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
  const bg = W.scene.background, a = r.getClearAlpha(); r.getClearColor(M.clear); r.getViewport(M.vp);
  W.scene.background = null; r.setClearColor(0x000000, 1); r.setViewport(0, 0, w / ratio, h / ratio); r.clear();
  try { r.render(W.scene, vc); r.copyFramebufferToTexture(M.tex, M.at); M.mesh.visible = true; }
  finally { r.setViewport(M.vp); r.setClearColor(M.clear, a); W.scene.background = bg; }
}

// ---------- the loop: draws while something moves; otherwise once per change ----------
function kick() { MG.dirty = true; if (MG.on && !MG.raf) MG.raf = requestAnimationFrame(mgFrame); }
function stopLoop() { cancelAnimationFrame(MG.raf); MG.raf = 0; }
function mgFrame(t) {
  MG.raf = 0;
  const W = MG.world, r = MG.renderer; if (!MG.on || !W || !r) return;
  const move = moving();
  if (r.getPixelRatio() !== pixelRatio(move)) { r.setPixelRatio(pixelRatio(move)); resize(); MG.dirty = true; }
  if (move || MG.dirty) {
    aim(W, t - MG.t0);
    const a = performance.now(), sky = CAR_SKY.value;
    // (the cars' day-sky reflection is for outdoors: indoors the room's environment map gives them their reflections –
    // set for this draw only, put back after: the circuit view's next frame finds it as it was)
    CAR_SKY.value = 0;
    if (MG.dirty) r.shadowMap.needsUpdate = true;
    const q = MG.gpu?.begin();
    try { if (W.mirror) renderMirror(W, r); r.render(W.scene, W.camera); } finally { CAR_SKY.value = sky; MG.gpu?.end(q); }
    const ms = performance.now() - a; MG.ms.push(ms); if (MG.ms.length > 240) MG.ms.shift();
    if (W.firstFrameMs == null) W.firstFrameMs = Math.round(ms);   // (the first draw uploads textures and builds the shadow pass's programs)
    MG.frames++; MG.dirty = false; MG.last = t;
  }
  if (move) MG.raf = requestAnimationFrame(mgFrame);
}

// ---------- API ----------
export function show(o = {}) {
  if (typeof document === "undefined") return Promise.resolve({ error: "no DOM" });
  if (o.quality && QUALITY[o.quality]) MG.quality = o.quality;
  const gen = ++MG.gen, key = `${o.season}|${o.teamKey}`;
  MG.req = { season: o.season, teamKey: o.teamKey, focusNum: o.focusNum ?? null }; MG.lastShow = { ...o };
  if (o.safeLeft != null || o.safeRight != null) setSafe(o.safeLeft ?? MG.safeLeft, o.safeRight ?? 0, false);
  // (the circuit view never draws under the menu: hidden now – its own loop ends at its next frame)
  try { window.Map3D?.hide?.(); } catch {}
  const host = o.host || document.getElementById("gGarage3d") || document.getElementById("game") || document.body;
  const sameEntries = MG.world && JSON.stringify(MG.world.cars.map((c) => c.num)) === JSON.stringify((o.entries || []).slice(0, 2).map((e) => String(e.num)));
  if (MG.on && MG.world && MG.world.key === key && sameEntries && (o.date || null) === (MG.world.date || null) && MG.world.quality === MG.quality) {
    if (o.focusNum != null) setFocus(o.focusNum);
    ensureRenderer(host); resize(); kick();
    return Promise.resolve(state());
  }
  MG.on = true;
  const r = ensureRenderer(host);
  let W;
  try { W = buildWorld(o, r); W.date = o.date || null; } catch (e) { MG.err = String(e?.message || e); return Promise.resolve(state()); }
  lease(W.scene);
  frameCamera(W.camera, r.domElement.width || 16, r.domElement.height || 9); aim(W, 0);
  const t0 = performance.now();
  const compiled = r.compileAsync ? r.compileAsync(W.scene, W.camera).catch(() => null) : Promise.resolve();
  return compiled.then(() => {
    // a later show() or a hide() came in: this room is not attached – freed instead
    if (gen !== MG.gen || !MG.on || MG.renderer !== r) { MG.stale++; disposeWorld(W); return state(); }
    W.compileMs = Math.round(performance.now() - t0);
    const old = MG.world; MG.world = W; MG.built++;
    if (old) disposeWorld(old);
    resize(); MG.t0 = performance.now(); MG.ms = [];
    // (the first picture drawn before the promise resolves: it uploads the textures and builds the shadow pass's programs –
    // the caller can keep its "loading" label up until then instead of showing an empty canvas)
    stopLoop(); MG.dirty = true; mgFrame(performance.now());
    return state();
  });
}
export function setFocus(num) {
  const W = MG.world; if (!W || !W.cars.some((c) => c.num === String(num))) return false;
  setFocusIn(W, num); if (MG.req) MG.req.focusNum = String(num); kick(); return true;
}
// another quality: the room is built again (the shadow map size, the rim light and the mirror are made at build) – the
// last request repeated with the new level; same level: nothing
export function setQuality(q) {
  if (!QUALITY[q] || q === MG.quality) return MG.quality;
  MG.quality = q;
  if (MG.on && MG.world && MG.lastShow) show({ ...MG.lastShow, focusNum: MG.world.focus, quality: q });
  return q;
}
export function setMotion(m) {
  MG.motion = ["on", "off", "auto"].includes(m) ? m : "auto";
  try { localStorage.setItem(MOTION_KEY, MG.motion); } catch {}
  kick(); return MG.motion;
}
// development: a measurement over `ms` with the drift on (every frame drawn) – the interval between frames, the CPU time
// of render() and, where the GPU offers EXT_disjoint_timer_query_webgl2, the GPU's own time per frame (median, p90).
// The drift setting is put back after. Numbers depend on the machine's load – the caller says so next to them.
export function probe(ms = 4000) {
  const r = MG.renderer; if (!r || !MG.world) return Promise.resolve({ error: "not shown" });
  const gl = r.getContext(), ext = gl.getExtension("EXT_disjoint_timer_query_webgl2"), gpu = [], pend = [];
  MG.gpu = ext ? { begin() { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); return q; }, end(q) { if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pend.push(q); } } } : null;
  const poll = () => { while (pend.length && gl.getQueryParameter(pend[0], gl.QUERY_RESULT_AVAILABLE)) { const q = pend.shift(); if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); } };
  const was = MG.motion; MG.motion = "on"; MG.ms = []; kick();
  const iv = []; let last = 0, done = false;
  const tick = (t) => { if (done) return; if (last) iv.push(t - last); last = t; if (ext) poll(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const st = (a) => { const v = a.slice().sort((x, y) => x - y); return v.length ? { median: +v[v.length >> 1].toFixed(2), p90: +v[Math.floor(v.length * 0.9)].toFixed(2), n: v.length } : null; };
  return new Promise((res) => setTimeout(() => {
    done = true; MG.motion = was; MG.gpu = null; if (ext) poll(); kick();
    const i = r.info;
    res({ intervalMs: st(iv), cpuRenderMs: st(MG.ms), gpuMs: ext ? st(gpu) : "no timer query", calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length,
      canvas: [r.domElement.width, r.domElement.height], heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null });
  }, ms));
}
// development: the world shown (measurement scripts add test bays to its scene)
export const _world = () => MG.world;
// development: try another camera ({ pos, look, fov } – the CAM fields), redrawn at once
export function setView(v = {}) { for (const k of ["pos", "look", "fov"]) if (v[k] != null) CAM[k] = v[k]; resize(); kick(); return JSON.stringify(CAM); }
export function setSafe(left, right = 0, draw = true) {
  let l = Math.max(0, Math.min(0.6, +left || 0)), r = Math.max(0, Math.min(0.6, +right || 0));
  if (l + r > 0.8) { const k = 0.8 / (l + r); l *= k; r *= k; }   // (at least a fifth of the width stays the car's)
  MG.safeLeft = l; MG.safeRight = r; if (draw) { resize(); kick(); } return { left: l, right: r };
}
export function setSafeLeft(f) { return setSafe(f, MG.safeRight).left; }
export function hide() {
  MG.gen++; MG.on = false; stopLoop();
  const W = MG.world; MG.world = null; disposeWorld(W);
  const r = MG.renderer;
  if (r) {
    MG.ro?.disconnect(); MG.ro = null;
    r.renderLists.dispose(); r.dispose(); const freed = releaseLeases();
    r.forceContextLoss(); MG.canvas?.remove();
    MG.renderer = null; MG.canvas = null; MG.lastRelease = freed;
  }
  return true;
}
export function dispose() { hide(); MG.host = null; MG.req = null; MG.lastShow = null; return true; }
export function state() {
  const W = MG.world, r = MG.renderer, ms = MG.ms.slice().sort((a, b) => a - b);
  return {
    on: MG.on, gen: MG.gen, built: MG.built, stale: MG.stale, err: MG.err, quality: MG.quality, mirror: !!MG.world?.mirror,
    request: MG.req, shown: W ? { season: W.season, teamKey: W.teamKey, team: W.team, colour: W.colour, focus: W.focus, styleSeed: W.style.seed, buildMs: W.buildMs, compileMs: W.compileMs ?? null, firstFrameMs: W.firstFrameMs ?? null } : null,
    cars: W ? W.cars.map((c) => ({ num: c.num, tla: c.entry.tla || null, bay: c.bay, front: c.num === W.focus, profile: c.obj.userData.profile.key, x: +c.obj.position.x.toFixed(2), z: +c.obj.position.z.toFixed(2),
      size: [+(c.box.max.x - c.box.min.x).toFixed(3), +c.box.max.y.toFixed(3), +(c.box.max.z - c.box.min.z).toFixed(3)] })) : [],
    bays: W ? W.bays.map((b) => ({ draws: b.userData.stats.draws, triangles: b.userData.stats.triangles, items: b.userData.plan.items.map((i) => i.kind), dropped: b.userData.plan.dropped.map((d) => d.kind), lod: b.userData.lod })) : [],
    lights: W ? { real: W.lights.filter((l) => !l.isHemisphereLight).length, hemi: W.lights.filter((l) => l.isHemisphereLight).length, shadow: W.lights.filter((l) => l.castShadow).length } : null,
    safe: { left: +MG.safeLeft.toFixed(3), right: +MG.safeRight.toFixed(3) },
    loop: { running: !!MG.raf, motion: MG.motion, moving: moving(), reducedPref: reducedPref(), frames: MG.frames, cpuMs: ms.length ? { median: +ms[ms.length >> 1].toFixed(2), p90: +ms[Math.floor(ms.length * 0.9)].toFixed(2), n: ms.length } : null },
    renderer: r ? { size: [r.domElement.width, r.domElement.height], ratio: r.getPixelRatio(), calls: r.info.render.calls, triangles: r.info.render.triangles, geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length ?? null } : null,
    leases: MG.leases.size, lastRelease: MG.lastRelease ?? null,
  };
}
if (typeof window !== "undefined") window.MenuGarage = { show, setFocus, setMotion, setQuality, setSafe, setSafeLeft, setView, probe, hide, dispose, state, ROOM, CAM };
