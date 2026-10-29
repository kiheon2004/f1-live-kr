// A garage's lighting (v0.49 garage kit): a few REAL lights where the room's lamps are, an environment map of the room
// itself for reflections and soft fill, and a hemisphere light as the bounce off the floor and walls (the indirect-light
// approximation). The ceiling's diffusers (bay.js "glow") are only what the eye sees of a lamp – they light nothing.
//
// Budget (request §11, §17): at most ONE shadow-casting light per scene – the key light over the car; the others
// cast none. A circuit world that places many bays asks for mode "none" (the world's own sun / night lights light
// them) or "key" for the one bay the camera is in – never a shadow light per bay.
import * as THREE from "../vendor/three.module.js";

// fixtures: bay.js userData.fixtures; target: the car's centre in the bay frame ([x, y, z]); opts: { mode: "full" |
// "key" | "none", key: true (false: no key light – a second bay lit by its lamps only), hemi: true, shadow: true,
// shadowSize: 2048, door: true (daylight from the pit lane through the door), floor: the bounce colour, scale: 1 }.
// → { group (in the bay frame: add it to the bay's group), key, lights: [...], shadowLights: n }
export function buildLightRig(zone, fixtures = [], target = null, opts = {}) {
  const mode = opts.mode || "full", k = opts.scale ?? 1, group = new THREE.Group(); group.name = "garageLights";
  const W = zone.width, D = zone.depth, H = zone.ceilingH, t = target || [0, 0.5, D * 0.45], lights = [];
  if (mode === "none") return { group, key: null, lights, shadowLights: 0 };
  // the key: a wide spot from the gantry's / ceiling's lamps over the car (neutral white ~4500 K), the one shadow
  const over = fixtures.find((f) => f.kind === "boom") || fixtures.find((f) => f.kind === "ceiling") || { x: t[0], y: H - 0.3, z: t[2] };
  const key = opts.key === false ? null : new THREE.SpotLight(0xfff6ec, 120 * k, 0, 0.9, 0.8, 2);
  if (key) {
  key.position.set(over.x + 0.6, Math.min(H - 0.3, over.y), t[2] - 0.6);
  key.target.position.set(t[0], 0, t[2] + 0.2);
  }
  if (key && opts.shadow !== false) {
    key.castShadow = true; const s = opts.shadowSize || 2048; key.shadow.mapSize.set(s, s);
    key.shadow.camera.near = 0.5; key.shadow.camera.far = H + 3; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.025; key.shadow.radius = 3;
  }
  if (key) { group.add(key, key.target); lights.push(key); }
  if (mode === "key") return { group, key, lights, shadowLights: key?.castShadow ? 1 : 0 };
  // the ceiling's other lamps as one soft spot each side of the room (no shadow): light on the walls and the equipment
  const ceil = fixtures.filter((f) => f.kind === "ceiling");
  const side = ceil.length >= 2 ? [ceil[0], ceil[ceil.length - 1]] : [{ x: -W / 4, y: H - 0.3, z: D / 2 }, { x: W / 4, y: H - 0.3, z: D / 2 }];
  for (const f of side) {
    const s = new THREE.SpotLight(0xf4f1ea, 30 * k, 0, 1.2, 1, 2);
    // (aimed at the side wall's equipment, half way up: the lit walls and cabinets give the room its depth – a spot on the
    // floor only lit the floor)
    s.position.set(f.x, f.y, f.z); s.target.position.set(Math.sign(f.x || 1) * W / 2, 0.9, Math.min(D - 0.5, f.z + 0.8)); group.add(s, s.target); lights.push(s);
  }
  // daylight from the pit lane through the open door (cool, soft, no shadow)
  if (opts.door !== false) {
    const d = new THREE.SpotLight(0xdde6f5, 18 * k, 0, 0.75, 1, 1.4);
    d.position.set(0, Math.min(zone.doorH * 0.6, 3), -4); d.target.position.set(0, 0.4, D * 0.5); group.add(d, d.target); lights.push(d);
  }
  // the bounce: the ceiling's light back off a painted floor and lined walls (hemisphere: sky = the lamps, ground = floor)
  if (opts.hemi !== false) { const hemi = new THREE.HemisphereLight(0xeef1f6, opts.floor || 0x8a8d90, 0.22 * k); group.add(hemi); lights.push(hemi); }
  return { group, key, lights, shadowLights: key?.castShadow ? 1 : 0 };
}

// The room as an environment map (PMREM): its walls, floor and ceiling in their own tones, the lamps' diffusers and the
// open door bright – what glossy paint, carbon, chrome and screens reflect, and the image-based diffuse fill. A few
// planes drawn once into a cube and pre-filtered; the generator and the little scene are freed at once. Returns the
// texture (the caller owns and frees it).
export function roomEnvironment(renderer, { width = 9, depth = 12, ceilingH = 4.8, wall = "#cfd2d5", floor = "#9da1a5", ceiling = "#55595e", fixtures = [], doorW = 7, doorH = 4.2, door = true } = {}) {
  const sc = new THREE.Scene(), mats = [], geos = [];
  const plane = (w, h, colour, x, y, z, rx, ry, power = 1) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(power), side: THREE.DoubleSide }), g = new THREE.PlaneGeometry(w, h);
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, 0); sc.add(o); mats.push(m); geos.push(g);
  };
  const W = width, D = depth, H = ceilingH, cx = 0, cz = D / 2;
  plane(W, D, floor, cx, 0, cz, -Math.PI / 2, 0, 0.55);
  plane(W, D, ceiling, cx, H, cz, Math.PI / 2, 0, 0.6);
  plane(D, H, wall, -W / 2, H / 2, cz, 0, Math.PI / 2, 0.6); plane(D, H, wall, W / 2, H / 2, cz, 0, -Math.PI / 2, 0.6);
  plane(W, H, wall, cx, H / 2, D, 0, Math.PI, 0.6);
  plane(W, H, wall, cx, H / 2, 0, 0, 0, 0.5);
  if (door) plane(doorW, doorH, "#dfe7f2", cx, doorH / 2, -0.02, 0, 0, 3.2);
  for (const f of fixtures) { const [w, d] = f.along === "x" ? [f.len, 0.3] : [0.3, f.len]; plane(w, d, "#ffffff", f.x, H - 0.02, f.z, Math.PI / 2, 0, 9); }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(sc, 0.035, 0.1, 100, { position: new THREE.Vector3(0, 1.2, D * 0.45) });
  pm.dispose(); for (const m of mats) m.dispose(); for (const g of geos) g.dispose();
  rt.texture.userData.renderTarget = rt;
  return rt.texture;
}
