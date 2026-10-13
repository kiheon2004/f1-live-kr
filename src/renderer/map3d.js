// 3D track view. Builds the circuit from one clean lap of position data (F1 sends X/Y/Z in decimetres,
// so hills are real), places a small F1 car per driver and offers three cameras:
//   heli    – orbit around the circuit with the mouse / trackpad
//   chase   – TV-style camera behind and above the selected car
//   onboard – driver's-eye view from the cockpit
// Reads everything from window.F1KR (set up by app.js); draws only while the 3D view is visible.
import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { buildScenery } from "./scenery.js";
import { smoothedTracks, steadiness, racingLine } from "./smooth.js";
import { standstills, PitInference, allocatePlaces, allocationKey, teamLayer, overridesFor } from "./garages.js";
import { makeCar, setCompound, setAero, EYE, TCAM } from "./car3d.js";
import { NL, GLOW, nightLit, lightField, glowPoints, releaseField } from "./nightlights.js";
import { disposeGroup } from "./dispose.js";
import { firstHit } from "./los.js";

const DM = 0.1;               // decimetres → metres
let TRACK_W = 14;             // road width (m), set per circuit in buildWorld
// Street circuits: narrower roads, concrete walls with debris fences right at the edge of the track.
const CIRCUIT_STYLE = {
  "Monte Carlo": { w: 9, street: true }, "Monaco": { w: 9, street: true }, "Baku": { w: 11, street: true },
  "Marina Bay": { w: 12, street: true }, "Singapore": { w: 12, street: true }, "Las Vegas": { w: 14, street: true },
  "Jeddah": { w: 12, street: true }, "Montréal": { w: 11, street: true }, "Montreal": { w: 11, street: true },
  "Madrid": { w: 13, street: true }, "Melbourne": { w: 13 }, "Miami": { w: 13 }, "Miami Gardens": { w: 13 },
};
const app = () => window.F1KR;

let renderer, scene, camera, controls, host, canvas, hemi, sun, daySky, nightSky;
let world = null;             // built circuit: { key, samples, grid, center, size, … }
let cars = new Map();         // racing number → car record
let camMode = "heli", visible = false, lastT = 0, lastBuildCheck = 0;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), tmpV2 = new THREE.Vector2();

// ---------- setup ----------
function init() {
  host = document.getElementById("map3d");
  canvas = document.createElement("canvas");
  canvas.className = "map3d-canvas";
  host.prepend(canvas);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;   // redrawn only when the shadow area moves (see updateSun)
  renderer.shadowMap.type = THREE.PCFShadowMap;

  scene = new THREE.Scene();
  daySky = skyTexture(); nightSky = skyTexture(true);
  scene.background = daySky;
  scene.fog = new THREE.Fog(0xc9d9e8, 800, 5000);
  hemi = new THREE.HemisphereLight(0xe3efff, 0x4a5a3a, 1.25);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff3e0, 2.4);
  sun.position.set(0.6, 1, 0.35);
  // Shadows: a 4096² map over a box that follows what the camera looks at (see updateSun).
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 6000;
  scene.add(sun, sun.target);

  camera = new THREE.PerspectiveCamera(50, 1, 0.3, 20000);
  camera.position.set(0, 1500, 1500);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.47;   // never below the ground
  controls.minDistance = 15;
  controls.screenSpacePanning = false;

  new ResizeObserver(resize).observe(host);
  canvas.addEventListener("click", (e) => { if (look.dragged) { look.dragged = false; return; } pickCar(e); });
  canvas.addEventListener("dblclick", () => { if (camMode === "heli") setCam("chase"); else resetLook(); });
  initLook();
  document.querySelectorAll("[data-cam]").forEach((b) => b.addEventListener("click", () => setCam(b.dataset.cam)));
  document.getElementById("cam3dPrev").addEventListener("click", () => cycleCar(-1));
  document.getElementById("cam3dNext").addEventListener("click", () => cycleCar(1));
  paintCamButtons();
  initGeoSettings();
}

// Settings popover for the real map.
function initGeoSettings() {
  const pop = document.getElementById("geo3dPop"), btn = document.getElementById("geo3dBtn");
  const paint = () => {
    const o = geoSettings();
    document.querySelectorAll('input[name="geoProvider"]').forEach((r) => { r.checked = r.value === o.provider; });
    document.getElementById("geoBuildings").checked = o.buildings !== false;
    document.getElementById("geoTrees").checked = o.trees !== false;
    document.getElementById("geoShadows").checked = o.shadows !== false;
    document.getElementById("geoFacilities").checked = o.facilities !== false;
    document.getElementById("geoNight").value = o.night || "auto";
  };
  btn.addEventListener("click", async () => {
    const open = pop.hidden;
    pop.hidden = !open; btn.setAttribute("aria-expanded", String(open));
    if (open) {
      paint();
      const g = await window.api.geo.google();
      document.getElementById("geoKey").placeholder = g.hasKey ? "저장된 키가 있어요 (바꾸려면 새 키 입력)" : "Google Maps Platform API 키";
    }
  });
  document.addEventListener("click", (e) => { if (!pop.hidden && !e.target.closest("#geo3dPop, #geo3dBtn")) { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
  const change = (patch, rebuildGeo = true) => { saveGeoSettings({ ...geoSettings(), ...patch }); if (rebuildGeo) rebuild(); else applyLighting(); };
  document.querySelectorAll('input[name="geoProvider"]').forEach((r) => r.addEventListener("change", async () => {
    if (r.value === "google") {
      const m = document.getElementById("geoKeyMsg"), g = await window.api.geo.googleCheck();
      if (!g.ok) { m.textContent = g.hasKey ? g.message : "먼저 Google Maps API 키를 저장해 주세요."; m.classList.add("bad"); paint(); return; }
    }
    change({ provider: r.value });
  }));
  document.getElementById("geoBuildings").addEventListener("change", (e) => change({ buildings: e.target.checked }));
  document.getElementById("geoTrees").addEventListener("change", (e) => change({ trees: e.target.checked }));
  document.getElementById("geoShadows").addEventListener("change", (e) => change({ shadows: e.target.checked }, false));
  document.getElementById("geoFacilities").addEventListener("change", (e) => change({ facilities: e.target.checked }));
  document.getElementById("geoNight").addEventListener("change", (e) => change({ night: e.target.value }, !!world?.real));
  document.getElementById("geoKeySave").addEventListener("click", async () => {
    const m = document.getElementById("geoKeyMsg"), key = document.getElementById("geoKey").value;
    m.textContent = "확인하는 중…"; m.classList.remove("bad");
    const r = await window.api.geo.setGoogleKey(key);
    m.textContent = r.message; m.classList.toggle("bad", !r.ok);
    document.getElementById("geoKey").value = "";
    if (r.ok && key.trim()) change({ provider: "google" });
    else if (r.ok && geoSettings().provider === "google") change({ provider: "eox" });
    paint();
  });
  document.getElementById("geoKey").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("geoKeySave").click(); e.stopPropagation(); });
}

// Teams at their garages (garages.js): inferred from the session's own pit positions. A replay uses only what has
// happened by the moment shown (no future: seeking back takes places away again); a live feed gathers standstills
// as they come (it keeps only minutes of positions) and keeps places stable (PitInference). Neutral where the
// evidence isn't enough. Checked every 2 s (live: 15 s).
let pitTeams = { key: null, group: null, facility: null, session: null, inf: new PitInference(), last: 0, info: null, frame: null };
function clearPitTeams() {
  if (pitTeams.group) { pitTeams.group.parent?.remove(pitTeams.group); disposeGroup(pitTeams.group); }
  pitTeams.group = null; pitTeams.key = null;
}
// (the layer went with the world or the real map it was in: nothing of it is freed again, the next check rebuilds it)
function forgetPitTeams() { pitTeams.group = null; pitTeams.key = null; pitTeams.facility = null; pitTeams.last = 0; }
function updatePitTeams(force = false) {
  const now = performance.now(), A = app(), src = A?.src;
  if (!force && now - pitTeams.last < (src?.isLive ? 15000 : 2000)) return;
  pitTeams.last = now;
  let fac = null;
  world?.real?.group.getObjectByName("facilities")?.traverse((o) => { if (!fac && o.userData?.garages) fac = o; });
  const session = A?.sourceKey?.()?.replace(/:\d+$/, "") || null;
  if (session !== pitTeams.session) { pitTeams.session = session; pitTeams.inf.reset(); clearPitTeams(); }
  if (!fac || !src?.tracks?.cars) { if (pitTeams.group) clearPitTeams(); pitTeams.facility = fac; pitTeamNote(null); return; }
  if (fac !== pitTeams.facility) { clearPitTeams(); pitTeams.facility = fac; }
  const G = fac.userData.garages, c = world.center, drivers = src.state?.DriverList || {};
  // The frame the standstills are placed in: this pit building in this world. A rebuilt building (settings, a new map)
  // or a new world is a new frame: what was seen is placed in it again (garages.js PitInference.update).
  if (pitTeams.frame?.G !== G || pitTeams.frame.c !== c) {
    pitTeams.frame = { G, c, rev: (pitTeams.frame?.rev || 0) + 1, toScene: ([X, Y]) => [X - c.x, -(Y - c.z)], project: G.project, span: [G.gStart, G.gEnd] };
  }
  const frame = pitTeams.frame;
  const pitIn = {}; for (const num of Object.keys(src.tracks.cars)) pitIn[num] = (src.tracker?.pits(num) || []).map((x) => x.ms);
  const found = standstills(src.tracks.cars, frame.toScene, G.project, frame.span, pitIn, src.isLive ? Infinity : A.t);
  pitTeams.inf.observe(found, !!src.isLive);
  const r = pitTeams.inf.update(drivers, G.pitch, frame);
  const teams = allocatePlaces(G.slots, G.pitch, drivers, r.places, overridesFor(G.facility, A.sessionYear?.() || null, session));
  pitTeams.info = { evidence: r.evidence, live: !!src.isLive };
  // (how many garages a team has and which driver's is which are estimates: the data shows only where the cars stopped)
  const est = teams.filter((t) => t.estimated);
  pitTeamNote(!teams.length ? null : !est.length ? "팀 차고: 공개된 배치 자료" : (est.some((t) => t.from === "box") ? "팀 차고 위치: 피트 스톱 위치로 추정" : "팀 차고 위치: 반복 정차 위치로 추정") + (src.isLive ? "" : " (현재 재생 시점까지)") + " · 칸 수·배정은 추정");
  const key = allocationKey(teams);
  if (key === pitTeams.key) return;
  clearPitTeams();
  pitTeams.key = key;
  if (!teams.length) return;   // neutral garages
  pitTeams.group = teamLayer(G, teams, drivers);
  // a layer added at night takes the light field too (its own materials only – the rest of the world has it already)
  pitTeams.group.traverse((o) => { for (const m of [].concat(o.material || [])) nightLit(m); });
  fac.add(pitTeams.group);
  warmShaders();
}
// the pit lane's direction at (x, z) if that's in front of a facility's garages (0–16 m out), else null
function pitLaneDir(x, z) {
  let out = null;
  world?.real?.group.getObjectByName("facilities")?.traverse((o) => {
    const G = o.userData?.garages; if (out || !G) return;
    const p = G.project(x, z);
    if (p.off > -1 && p.off < 16 && p.u > G.gStart - 10 && p.u < G.gEnd + 10) out = G.slots[0].along;
  });
  return out;
}
// a small note in the 3D view saying the team garages are an inference, and from what
function pitTeamNote(text) {
  let el = document.getElementById("pitTeamNote");
  if (!el && text) { el = document.createElement("div"); el.id = "pitTeamNote"; el.style.cssText = "position:absolute;left:12px;bottom:40px;padding:3px 8px;border-radius:6px;background:rgba(14,16,19,.72);color:#cfd6dd;font-size:11px;pointer-events:none;z-index:3"; host?.appendChild(el); }
  if (el) { el.textContent = text || ""; el.hidden = !text; }
}
// development: the current allocation (teams, their garages and how each driver's place is known)
function pitTeamsInfo() {
  const g = pitTeams.group; let tris = 0; g?.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); });
  return { key: pitTeams.key, session: pitTeams.session, meshes: g ? g.children.length : 0, tris };
}

// Back to the generic surroundings, then load the real ones again with the current settings.
function rebuild() {
  if (!world) return;
  if (world.real) { world.group.remove(world.real.group); disposeReal(world.real); world.real = null; world.occluders = []; }
  forgetPitTeams();   // (its layer was in the real map just freed)
  for (const k of ["terrain", "trees", "walls"]) if (!world.syn[k].parent) world.group.add(world.syn[k]);
  world.farBase = world.far.material.color.clone().set(0x4f7a3c);
  applyLighting();
  loadGeo(world);
}

// (the view's size, read when it changes – reading it every frame after the HUD changed forced a layout each frame)
let hostW = 1, hostH = 1;
function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  hostW = w; hostH = h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function skyTexture(night = false) {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 256;
  const g = c.getContext("2d").createLinearGradient(0, 0, 0, 256);
  // a city's night sky: near black overhead, the glow of its lights low down (warm, from sodium and LED haze)
  if (night) { g.addColorStop(0, "#03050a"); g.addColorStop(0.45, "#0a0f1a"); g.addColorStop(0.75, "#171a26"); g.addColorStop(0.92, "#2b2730"); g.addColorStop(1, "#3a3034"); }
  else { g.addColorStop(0, "#3d6fae"); g.addColorStop(0.55, "#8fb3d6"); g.addColorStop(1, "#d6e3ee"); }
  const ctx = c.getContext("2d"); ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Night reflections: a dim sky with the city's glow along the horizon and lights below it, for glass and water
// (an environment map; by day there is none – the hemisphere light does it).
let nightEnv = null;
function nightEnvironment() {
  if (nightEnv) return nightEnv;
  const w = 512, h = 256, c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, h);
  for (const [t, col] of [[0, "#020308"], [0.32, "#080c16"], [0.44, "#1a1b26"], [0.5, "#3a2f30"], [0.53, "#1a1714"], [1, "#050505"]]) gr.addColorStop(t, col);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // lit windows and street lights all around below the horizon
  let a = 12345; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 1400; k++) { const y = h * (0.5 + Math.pow(r(), 2.2) * 0.12); g.fillStyle = r() < 0.7 ? `rgba(255,${190 + r() * 50 | 0},${120 + r() * 80 | 0},${0.4 + r() * 0.6})` : `rgba(210,230,255,${0.4 + r() * 0.5})`; g.fillRect(r() * w, y, 1 + r() * 1.5, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  nightEnv = pm.fromEquirectangular(t).texture;
  pm.dispose(); t.dispose();
  return nightEnv;
}

// ---------- circuit ----------
// F1 X/Y is the ground plane and Z is height; three.js uses Y for up, so (X, Y, Z) → (X, Z, −Y).
const toWorld = (p, c) => new THREE.Vector3(p[0] * DM - c.x, (p[2] || 0) * DM - c.y, -(p[1] * DM - c.z));

function buildWorld(points) {
  const style = CIRCUIT_STYLE[app().location?.()] || {};
  TRACK_W = style.w || 14;
  // the caller passes one lap; a trace much longer than any circuit (> 9 km) means no lap was found
  const lap = window.ReplayKit.findLap(points) || points;
  { let len = 0; for (let i = 1; i < lap.length; i++) len += Math.hypot(lap[i][0] - lap[i - 1][0], lap[i][1] - lap[i - 1][1]); if (len * DM > 9000) return null; }
  if (lap.length < 30) return null;
  let sx = 0, sy = 0, sz = 0;
  for (const p of lap) { sx += p[0]; sy += p[1]; sz += p[2] || 0; }
  const center = { x: (sx / lap.length) * DM, z: (sy / lap.length) * DM, y: (sz / lap.length) * DM };
  // Drop near-duplicates, then smooth into an evenly spaced closed curve (~2 m apart).
  const raw = [];
  for (const p of lap) { const v = toWorld(p, center); if (!raw.length || raw[raw.length - 1].distanceTo(v) > 3) raw.push(v); }
  if (raw.length > 3 && raw[0].distanceTo(raw[raw.length - 1]) < 15) raw.pop();
  // The lap is one car's positions, each a metre or so off: a curve through them wiggles, and the edges, lines and
  // kerbs built along it wiggle too. So: 1 m steps, then a Gaussian of σ 4 m along the lap (it shifts the apex of a
  // 15 m hairpin by ~0.5 m), then the final curve.
  const rough = new THREE.CatmullRomCurve3(raw, true, "centripetal");
  rough.arcLengthDivisions = raw.length * 8;
  const m1 = Math.max(200, Math.round(rough.getLength())), fine = rough.getSpacedPoints(m1).slice(0, m1);
  const SIG = 4, K = 12, wts = Array.from({ length: 2 * K + 1 }, (_, k) => Math.exp(-0.5 * ((k - K) / SIG) ** 2));
  const wsum = wts.reduce((a, b) => a + b, 0);
  const soft = fine.map((_, i) => { const v = new THREE.Vector3(); for (let k = -K; k <= K; k++) v.addScaledVector(fine[(i + k + m1) % m1], wts[k + K]); return v.multiplyScalar(1 / wsum); });
  const curve = new THREE.CatmullRomCurve3(soft.filter((_, i) => i % 2 === 0), true, "centripetal");
  // (three.js measures a curve's length in 200 pieces by default: on a 5 km lap the "evenly spaced" points
  // then come 0.5–3.7 m apart)
  curve.arcLengthDivisions = m1 * 2;
  const n = Math.max(200, Math.round(curve.getLength() / 2));
  const pts = curve.getSpacedPoints(n).slice(0, n);
  // Heights from position data jitter a little; average them along the track (±20 m).
  const ys = pts.map((_, i) => { let s = 0; for (let k = -10; k <= 10; k++) s += pts[(i + k + n) % n].y; return s / 21; });
  pts.forEach((p, i) => { p.y = ys[i]; });

  const samples = pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const tan = tmp.copy(b).sub(a).setY(0).normalize().clone();
    const nor = new THREE.Vector3(-tan.z, 0, tan.x);          // left of travel
    return { p, tan, nor, i };
  });
  // Turning rate (rad per metre) → where kerbs go and which side is the inside.
  for (const s of samples) {
    const a = samples[(s.i - 4 + n) % n].tan, b = samples[(s.i + 4) % n].tan;
    s.turn = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z) / 16;
  }
  const grid = new SpatialGrid(40);
  samples.forEach((s) => grid.add(s.p.x, s.p.z, s));
  measureWidth(samples, grid, center);
  // the racing line (smooth.js) – where the cars are drawn, and where the tarmac is rubbered in
  const line = racingLine(samples);
  samples.forEach((s, i) => { s.line = line[i]; s.M = line[i]; });

  const box = new THREE.Box3().setFromPoints(pts);
  const size = box.getSize(new THREE.Vector3());
  const group = new THREE.Group();
  const road = roadMesh(samples), lines = edgeLines(samples), kerb = kerbs(samples);
  group.add(road, lines, kerb);
  // Generic surroundings, shown at once and replaced by the real ones when the map data arrives.
  const syn = { walls: style.street ? streetWalls(samples, grid) : walls(samples, grid) };
  world0Level = Math.min(...samples.map((s) => s.p.y)) - 2.5;
  syn.terrain = terrain(samples, grid, box);
  syn.trees = trees(grid, box);
  group.add(syn.walls, syn.terrain, syn.trees);
  road.receiveShadow = true; kerb.traverse((o) => { o.receiveShadow = true; }); lines.traverse((o) => { o.receiveShadow = true; });
  syn.terrain.receiveShadow = true; syn.walls.traverse((o) => { o.castShadow = true; }); syn.trees.traverse((o) => { o.castShadow = true; });
  const lowY = Math.min(...samples.map((s) => s.p.y));
  const far = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshStandardMaterial({ color: 0x4f7a3c, roughness: 1 }));
  far.rotation.x = -Math.PI / 2; far.position.y = lowY - 3;   // below the lowest point of the track
  group.add(far);
  scene.add(group);
  scene.fog.near = Math.max(size.x, size.z) * 0.6;
  scene.fog.far = Math.max(size.x, size.z) * 3.2;
  return { group, samples, grid, center, size, box, n, lap, syn, far, kerbMark: samples.kerbMark, street: !!style.street, width: samples.reduce((a, s) => a + (s.L - s.R), 0) / samples.length, farBase: far.material.color.clone(), road, lines, kerb };
}

// Where the edges of the tarmac are, from where every car drove in the session: per ~10 m of track, the
// spread of the cars' sideways offsets from the lap line. The spread is cut where a gap of 2.5 m opens
// (a pit lane behind a wall is a separate cluster), the outermost 1 % are dropped (a trip over the
// run-off), and a metre is added for half a car. Sets s.L (left edge, +) and s.R (right edge, −) on every
// sample; stretches without enough data keep the circuit's usual width, centred on the lap line.
function measureWidth(samples, grid, center) {
  const n = samples.length, B = 5, nb = Math.ceil(n / B), half = TRACK_W / 2;
  const lat = Array.from({ length: nb }, () => []);
  const pts = app().carPoints?.() || [];
  for (const p of pts) {
    const x = p[0] * DM - center.x, z = -(p[1] * DM - center.z), y = (p[2] || 0) * DM - center.y;
    const [s, d] = grid.nearest(x, z, 1);
    if (!s || d > 22 || Math.abs(y - s.p.y) > 4) continue;    // not near, or a bridge above / below
    const l = (x - s.p.x) * s.nor.x + (z - s.p.z) * s.nor.z;
    lat[Math.floor(s.i / B)].push(l);
  }
  const Lb = new Array(nb).fill(null), Rb = new Array(nb).fill(null), Mb = new Array(nb).fill(null);
  for (let b = 0; b < nb; b++) {
    const v = lat[b];
    if (v.length < 40) continue;
    v.sort((a, c) => a - c);
    // the busiest cluster: where the field races (the lap line itself can run down the pit lane for a stretch,
    // when the one lap it was cut from went through it)
    let lo = 0, hi = -1;
    for (let i = 0, start = 0; i < v.length; i++) {
      if (i === v.length - 1 || v[i + 1] - v[i] >= 2.5) { if (i - start > hi - lo) { lo = start; hi = i; } start = i + 1; }
    }
    if (hi - lo + 1 < v.length * 0.25) continue;
    const cut = Math.floor((hi - lo + 1) * 0.01);
    const L = v[hi - cut] + 1, R = v[lo + cut] - 1;
    // Cars rarely use every metre of a wide track, so the spread gives the centre of the tarmac (the racing
    // line keeps to one side on straights) and a lower bound on its width.
    const c = Math.max(-22, Math.min(22, (L + R) / 2)), W = Math.min(28, Math.max(L - R, TRACK_W));
    Lb[b] = c + W / 2; Rb[b] = c - W / 2;
    Mb[b] = v[Math.floor((lo + hi) / 2)];   // where the field drives most: the rubbered-in line
  }
  // fill gaps from the neighbours (or the usual width), then smooth along the track
  const fill = (arr, dflt) => {
    const known = arr.map((v, i) => (v == null ? null : i)).filter((i) => i != null);
    if (!known.length) return arr.map(() => dflt);
    return arr.map((v, i) => {
      if (v != null) return v;
      let a = null, c = null;
      for (let d = 1; d < nb && (a == null || c == null); d++) { if (a == null && arr[(i - d + nb) % nb] != null) a = [d, arr[(i - d + nb) % nb]]; if (c == null && arr[(i + d) % nb] != null) c = [d, arr[(i + d) % nb]]; }
      if (!a || !c || a[0] + c[0] > 40) return dflt;
      return (a[1] * c[0] + c[1] * a[0]) / (a[0] + c[0]);
    });
  };
  const smooth = (arr, k) => arr.map((_, i) => { let sum = 0; for (let d = -k; d <= k; d++) sum += arr[(i + d + nb) % nb]; return sum / (2 * k + 1); });
  // the centre moves gently (±80 m window), the width follows more closely (±30 m)
  const Lf = fill(Lb, half), Rf = fill(Rb, -half);
  const C = smooth(Lf.map((l, i) => (l + Rf[i]) / 2), 8), Wd = smooth(Lf.map((l, i) => l - Rf[i]), 3);
  const L = C.map((c, i) => c + Wd[i] / 2), R = C.map((c, i) => c - Wd[i] / 2);
  const M = smooth(fill(Mb, 0).map((m, i) => Math.max(R[i] + 2, Math.min(L[i] - 2, m))), 4);
  for (const s of samples) {
    const f = s.i / B - 0.5, b0 = Math.floor(f), t = f - b0, i0 = (b0 + nb) % nb, i1 = (b0 + 1) % nb;
    s.L = L[i0] * (1 - t) + L[i1] * t; s.R = R[i0] * (1 - t) + R[i1] * t; s.M = M[i0] * (1 - t) + M[i1] * t;
  }
  samples.measured = Lb.filter((v) => v != null).length / nb;
}
const edgeOf = (s, side) => (side > 0 ? s.L ?? TRACK_W / 2 : s.R ?? -TRACK_W / 2);

// (cells keyed by a number, not a string: it's asked many times a frame)
class SpatialGrid {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  key(i, j) { return (i + 32768) * 65536 + (j + 32768); }
  add(x, z, v) { const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)); if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push(v); }
  // Nearest track sample within `rings` cells; returns [sample, distance] or [null, Infinity].
  nearest(x, z, rings = 2) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = null, bd = Infinity;
    for (let i = -rings; i <= rings; i++) for (let j = -rings; j <= rings; j++) {
      const list = this.map.get(this.key(cx + i, cz + j)); if (!list) continue;
      for (const s of list) { const dx = s.p.x - x, dz = s.p.z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = s; } }
    }
    return [best, best ? Math.sqrt(bd) : Infinity];
  }
}

// A strip alongside the centre line between lateral offsets a and b (metres, + = left).
function strip(samples, a, b, lift, colorAt) {
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  const A = typeof a === "function" ? a : () => a, Bf = typeof b === "function" ? b : () => b;
  samples.forEach((s, i) => {
    for (const off of [A(s), Bf(s)]) {
      pos.push(s.p.x + s.nor.x * off, s.p.y + lift, s.p.z + s.nor.z * off);
      c.set(colorAt ? colorAt(s, i, off) : 0xffffff); col.push(c.r, c.g, c.b);
    }
  });
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, v = i * 2, w = j * 2;
    idx.push(v, w, v + 1, v + 1, w, w + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Asphalt between the measured edges: several lanes across so the rubbered-in racing line (darker, where
// the field actually drives) and the dusty, lighter edges can be shaded; an aggregate texture repeats every
// 6 m along the track for a sense of speed.
function asphaltTexture() {
  const n = 256, c = document.createElement("canvas"); c.width = c.height = n;
  const g = c.getContext("2d"), img = g.createImageData(n, n), r = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
  for (let i = 0; i < n * n; i++) { const v = 118 + (r() - 0.5) * 46 + (r() < 0.04 ? 30 : 0) - (r() < 0.03 ? 28 : 0); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 18; k++) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`; g.beginPath(); g.ellipse(r() * n, r() * n, 8 + r() * 40, 4 + r() * 14, r() * 3, 0, Math.PI * 2); g.fill(); }   // patches
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function roadMesh(samples) {
  const lanes = [0, 0.08, 0.22, 0.38, 0.5, 0.62, 0.78, 0.92, 1], K = lanes.length;
  const pos = [], col = [], uv = [], idx = [], c = new THREE.Color();
  let dist = 0;
  samples.forEach((s, i) => {
    if (i) dist += s.p.distanceTo(samples[i - 1].p);
    const L = edgeOf(s, 1), R = edgeOf(s, -1), M = s.M ?? 0;
    for (const f of lanes) {
      const off = L + (R - L) * f;
      pos.push(s.p.x + s.nor.x * off, s.p.y + 0.06, s.p.z + s.nor.z * off);
      const rub = Math.exp(-Math.pow((off - M) / 1.6, 2)), edge = Math.min(1, Math.min(L - off, off - R) / 2.5);
      const v = 0.36 - 0.07 * rub + 0.04 * (1 - edge);
      c.setRGB(v, v * 1.01, v * 1.04); col.push(c.r, c.g, c.b);
      uv.push(off / 6, dist / 6);
    }
  });
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    for (let k = 0; k < K - 1; k++) { const a = i * K + k, b = j * K + k; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: asphaltTexture(), roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
  return new THREE.Mesh(g, m);
}

function edgeLines(samples) {
  const m = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide });
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(strip(samples, (s) => edgeOf(s, 1) - 0.25, (s) => edgeOf(s, 1) - 0.65, 0.08), m));
  grp.add(new THREE.Mesh(strip(samples, (s) => edgeOf(s, -1) + 0.65, (s) => edgeOf(s, -1) + 0.25, 0.08), m));
  return grp;
}

// Kerbs where real circuits put them: for every corner an apex kerb on the inside (turn-in to just past the
// apex) and an exit kerb on the outside (apex to ~30 m after the corner), plus an entry kerb on the outside
// of slow corners; beyond the exit kerb a painted run-off strip. Kerbs are 1.4 m wide with ~2 m red and
// white blocks and a raised outer lip (sloped, like the real profile).
function cornerKerbs(samples) {
  const n = samples.length, kap = new Float32Array(n), side = new Int8Array(n);
  for (const s of samples) {
    const a = samples[(s.i - 4 + n) % n].tan, b = samples[(s.i + 4) % n].tan;
    kap[s.i] = Math.abs(s.turn);
    side[s.i] = (b.x - a.x) * s.nor.x + (b.z - a.z) * s.nor.z > 0 ? 1 : -1;     // +1: corner turns left
  }
  // corners: runs of real curvature (radius under ~170 m), short gaps bridged
  const inC = Array.from(kap, (k) => k > 0.006);
  const corners = [];
  for (let i = 0; i < n; i++) {
    if (!inC[i] || inC[(i - 1 + n) % n]) continue;
    let j = i; while (inC[(j + 1) % n] && j - i < n) j++;
    if (j - i < 3) continue;
    let apex = i; for (let k = i; k <= j; k++) if (kap[k % n] > kap[apex % n]) apex = k;
    corners.push({ i0: i, i1: j, apex, side: side[apex % n], peak: kap[apex % n] });
  }
  const mark = { inside: new Int8Array(n), outside: new Int8Array(n), strip: new Int8Array(n) };   // value: side (+1/−1)
  const set = (arr, from, to, sd) => { for (let k = from; k <= to; k++) arr[((k % n) + n) % n] = sd; };
  for (const c of corners) {
    set(mark.inside, c.i0 + 1, Math.round(c.apex + (c.i1 - c.apex) * 0.6), c.side);
    set(mark.outside, c.apex, c.i1 + 15, -c.side);
    set(mark.strip, c.apex + 4, c.i1 + 13, -c.side);
    if (c.peak > 0.03) set(mark.outside, c.i0 - 8, c.i0 + 2, -c.side);   // hairpins and slow corners
  }
  return mark;
}
function kerbs(samples) {
  const n = samples.length, mark = cornerKerbs(samples);
  samples.kerbMark = mark;
  const pos = [], col = [], idx = [];
  const red = new THREE.Color(0xd8262b), white = new THREE.Color(0xf4f4f4), green = new THREE.Color(0x2f7d4f);
  // one band beside the edge on side sd, from offset o0 to o1 beyond the edge, lifted lip0 → lip1
  const band = (on, o0, o1, lip0, lip1, colourOf) => {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, sd = on[i];
      if (!sd || on[j] !== sd) continue;
      const v = pos.length / 3, c = colourOf(i);
      for (const s of [samples[i], samples[j]]) for (const [o, lift] of [[o0, lip0], [o1, lip1]]) {
        const off = edgeOf(s, sd) + sd * o;
        pos.push(s.p.x + s.nor.x * off, s.p.y + 0.07 + lift, s.p.z + s.nor.z * off); col.push(c.r, c.g, c.b);
      }
      // wound to face up (a face seen from behind gets its normal flipped: kerbs on one side came out black)
      const P = (k) => pos.slice((v + k) * 3, (v + k) * 3 + 3), a = P(0), b = P(1), q = P(2);
      const up = (b[2] - a[2]) * (q[0] - a[0]) - (b[0] - a[0]) * (q[2] - a[2]) > 0;
      if (up) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); else idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
  };
  const stripes = (i) => (i % 2 ? red : white);
  band(mark.inside, -1.4, 0, 0.0, 0.06, stripes);          // apex kerbs sit just inside the white line
  band(mark.outside, 0, 1.4, 0.0, 0.07, stripes);
  band(mark.strip, 1.4, 3.6, 0.0, 0.0, () => green);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));   // lit as flat ground
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide }));
  const grp = new THREE.Group(); grp.add(m);
  return grp;
}

// Low barriers 12 m off each edge, left out where they'd cut across another part of the track.
// Street circuit barriers: a concrete wall about a metre from the edge with a debris fence on top.
function streetWalls(samples, grid) {
  const g = new THREE.Group();
  g.add(walls(samples, grid, 1.4, 1.2, [0xc9ccd0, 0xe4e6e8]));
  const fence = walls(samples, grid, 1.6, 4.2, [0x8d969e, 0x8d969e], 1.2);
  fence.material = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.5, metalness: 0.5, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  g.add(fence);
  return g;
}

// A barrier `extra` metres beyond each edge of the track, `h` high (from `y0` above the road), two-tone.
function walls(samples, grid, extra = 12, h = 1.1, tones = [0x5d636b, 0xd9dde2], y0 = 0) {
  const pos = [], col = [], idx = [];
  const offOf = (s, side) => edgeOf(s, side) + side * extra;
  // blocked when the barrier point would sit on (or right next to) a different stretch of the track
  const blocked = (x, z, s) => {
    const [near, d] = grid.nearest(x, z, 1);
    if (!near || d > Math.max(edgeOf(near, 1), -edgeOf(near, -1)) + 4) return false;
    const di = Math.abs(near.i - s.i);
    return Math.min(di, samples.length - di) > 20;
  };
  for (const side of [1, -1]) {
    const ok = samples.map((s) => { const o = offOf(s, side); return !blocked(s.p.x + s.nor.x * o, s.p.z + s.nor.z * o, s); });
    const n = samples.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (!ok[i] || !ok[j]) continue;
      const a = samples[i], b = samples[j], base = pos.length / 3;
      for (const s of [a, b]) for (const y of [y0, y0 + h]) {
        const o = offOf(s, side);
        pos.push(s.p.x + s.nor.x * o, s.p.y + y - 0.3, s.p.z + s.nor.z * o);
        const stripe = y > y0 ? tones[1] : tones[0];    // light rail on a dark tyre-wall base
        const c = new THREE.Color(stripe); col.push(c.r, c.g, c.b);
      }
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
}

// Ground that follows the track's height: run-off near the road, grass further out.
function terrain(samples, grid, box) {
  const pad = 450, nx = 220, nz = 220;
  const x0 = box.min.x - pad, z0 = box.min.z - pad, w = box.max.x - box.min.x + pad * 2, d = box.max.z - box.min.z + pad * 2;
  const level = Math.min(...samples.map((s) => s.p.y)) - 2.5;   // flat ground far from the track
  const pos = [], col = [], idx = [];
  const grass = new THREE.Color(0x4f7a3c), grass2 = new THREE.Color(0x5b8a45), runoff = new THREE.Color(0x7d7f78), c = new THREE.Color();
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + (w * i) / nx, z = z0 + (d * j) / nz;
    const [near, dist] = grid.nearest(x, z, 4);
    let y = level;
    if (near) {
      const k = Math.min(1, Math.max(0, (dist - TRACK_W) / 140));   // follow the track close by, level out further away
      y = Math.min(near.p.y - 0.5, near.p.y * (1 - k) + level * k - 0.5);
    }
    pos.push(x, y, z);
    const mow = (Math.floor((x + z) / 18) % 2) ? grass : grass2;             // mown stripes
    const r = near ? Math.min(1, Math.max(0, (dist - TRACK_W / 2 - 4) / 14)) : 1;
    c.copy(runoff).lerp(mow, r); col.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, e = a + nx + 1, f = e + 1;
    idx.push(a, e, b, b, e, f);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
}

// Trees scattered away from the track for depth.
let world0Level = 0;
function trees(grid, box) {
  const count = 700, rnd = mulberry(7);
  const trunkG = new THREE.CylinderGeometry(0.4, 0.5, 4, 6), crownG = new THREE.ConeGeometry(3.2, 9, 7);
  const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1 }), count);
  const crown = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ color: 0x2f5a2c, roughness: 1 }), count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  let k = 0;
  for (let tries = 0; tries < count * 6 && k < count; tries++) {
    const x = box.min.x - 400 + rnd() * (box.max.x - box.min.x + 800), z = box.min.z - 400 + rnd() * (box.max.z - box.min.z + 800);
    const [near, dist] = grid.nearest(x, z, 4);
    if (near && dist < 45) continue;
    const lv = world0Level;
    const y = near ? Math.min(near.p.y - 0.5, near.p.y * (1 - Math.min(1, (dist - TRACK_W) / 140)) + lv * Math.min(1, (dist - TRACK_W) / 140) - 0.5) : lv;
    const sc = 0.7 + rnd() * 0.8;
    s.set(sc, sc, sc);
    m.compose(new THREE.Vector3(x, y + 2 * sc, z), q, s); trunk.setMatrixAt(k, m);
    m.compose(new THREE.Vector3(x, y + 8 * sc, z), q, s); crown.setMatrixAt(k, m);
    k++;
  }
  trunk.count = crown.count = k;
  const g = new THREE.Group(); g.add(trunk, crown);
  return g;
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- cars ----------
// The car model itself lives in car3d.js (2026 regulations, team liveries).
let _shadow;
function shadowTex() {
  if (_shadow) return _shadow;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d"), r = x.createRadialGradient(32, 32, 4, 32, 32, 32);
  r.addColorStop(0, "rgba(0,0,0,0.55)"); r.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = r; x.fillRect(0, 0, 64, 64);
  _shadow = new THREE.CanvasTexture(c); _shadow.userData.shared = true;   // (one for every car)
  return _shadow;
}

// Name tag that keeps the same size on screen.
function labelSprite() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 40;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true }));
  sp.center.set(0.5, 0); sp.renderOrder = 10;
  return { sp, c, tex, text: "" };
}
function paintLabel(l, text, color, strong) {
  const key = text + color + strong;
  if (l.text === key) return; l.text = key;
  const x = l.c.getContext("2d");
  x.clearRect(0, 0, 128, 40);
  x.font = "700 20px -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
  const w = Math.min(124, x.measureText(text).width + 26);
  const left = (128 - w) / 2;                      // centred over the car
  x.fillStyle = strong ? "rgba(255,255,255,0.96)" : "rgba(14,16,19,0.8)";
  x.beginPath(); x.roundRect(left, 4, w, 30, 8); x.fill();
  x.fillStyle = color; x.fillRect(left + 7, 11, 5, 16);
  x.fillStyle = strong ? "#0e1013" : "#ffffff";
  x.textBaseline = "middle"; x.fillText(text, left + 17, 20);
  l.tex.needsUpdate = true;
}

function carFor(num, d) {
  let c = cars.get(num);
  const color = "#" + (d.TeamColour || "888888");
  if (c && c.color === color) return c;
  if (c) { scene.remove(c.obj); disposeGroup(c.obj); }
  const obj = new THREE.Group();
  const model = makeCar({ teamName: d.TeamName, teamColour: d.TeamColour, number: num });
  { const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5.8), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; model.add(sh); }
  if (nightNow) lightCar(model, true);
  // cars don't go into the (static) shadow map; the soft contact shadow under each car does the job
  obj.add(model);
  const label = labelSprite(); obj.add(label.sp);
  scene.add(obj);
  c = { num, obj, model, label, color, yaw: 0, pitch: 0, roll: 0, speed: 0, spin: 0, aero: 0, pos: new THREE.Vector3(), has: false, sample: null };
  cars.set(num, c);
  return c;
}

// ---------- per-frame update ----------
function trackPointFor(c, x, z) {
  // Keep cars glued to the road surface and remember where on the lap they are.
  const [s, d] = world.grid.nearest(x, z, 1);
  c.sample = s && d < 25 ? s : null;
  return c.sample ? c.sample.p.y : null;
}

const posBuf = {}, velBuf = {}, vTmp = new THREE.Vector3(), P0 = [0, 0, 0], PA = [0, 0, 0], PB = [0, 0, 0], DIR = [0, 0];
// x → target as a critically damped spring of rate w (1/s), the value and its rate kept on the object
function spring(o, key, rateKey, target, w, dt) {
  let x = o[key] || 0, v = o[rateKey] || 0;
  const steps = Math.max(1, Math.ceil(dt / 0.01)), h = dt / steps;
  for (let i = 0; i < steps; i++) { v += (w * w * (target - x) - 2 * w * v) * h; x += v * h; }
  o[key] = x; o[rateKey] = v;
}
const smoothstep = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// Traffic. Every car is drawn on the racing line (the position data has them all on one line), so when one
// catches and passes another, or two run side by side, someone has to make room: the car going past (seen in
// the timing: it's behind now and ahead within 3 s, or the other way round in the last 3 s) pulls out by a car's
// width to the side with room – the inside of the next corner if it can, as a real pass is set up – and the car
// being passed gives a little room the other way. Two cars overlapping without a pass: the one behind goes to
// the side. Offsets are eased (≈0.4 s), so cars swing out and back in like cars, not jump.
const trafSide = new Map(), trafSt = {}, trafA = {}, trafB = {};
let trafT = null;
function traffic(sm, F, t, dt, pos) {
  const L = F.L, list = [];
  const wrapL = (x) => ((x % L) + L * 1.5) % L - L / 2;
  for (const num of Object.keys(pos)) {
    const st = sm.state(num, t, trafSt[num] || (trafSt[num] = {}));
    if (st && cars.get(num)) list.push({ num, u: ((st.s % L) + L) % L, st });
  }
  // per car the biggest push each way (several cars at once don't add up beyond a car's width)
  const want = new Map();
  const add = (num, x) => { const w = want.get(num) || [0, 0]; if (x > 0) w[0] = Math.max(w[0], x); else w[1] = Math.min(w[1], x); want.set(num, w); };
  for (const A of list) for (const B of list) {
    if (A === B) continue;
    const du = wrapL(B.u - A.u);
    if (du <= 0 || du > 25) continue;   // B ahead of A, within 25 m
    let passer = null;
    for (const tau of [-3000, -2000, -1000, 1000, 2000, 3000]) {
      const sa = sm.state(A.num, t + tau, trafA), sb = sm.state(B.num, t + tau, trafB);
      if (!sa || !sb) continue;
      if (wrapL(sb.s - sa.s) < -1) { passer = tau > 0 ? A : B; break; }
    }
    const overlap = du < 6;
    if (!passer && !overlap) continue;
    const mover = passer || A, other = mover === A ? B : A;
    const w = passer ? smoothstep(25, 9, du) : smoothstep(6.5, 3.5, du);
    const key = mover.num + ">" + other.num;
    const smp = F.sampleAt(mover.st.s), ln = F.lineAt(mover.st.s);
    const roomL = (smp.L ?? 7) - 0.95 - ln, roomR = ln - ((smp.R ?? -7) + 0.95);
    let side = trafSide.get(key)?.side;
    if (!side) {
      // the inside of the next corner (the turning over the next 200 m), if there's a car's width of room there
      let turn = 0; for (let k = 0; k < 100; k++) turn += world.samples[(smp.i + k) % world.n].turn;
      side = turn >= 0 ? 1 : -1;
      if ((side > 0 ? roomL : roomR) < 1.8 && (side > 0 ? roomR : roomL) > (side > 0 ? roomL : roomR)) side = -side;
    }
    trafSide.set(key, { side, t });
    add(mover.num, side * Math.max(0, Math.min(2.5, side > 0 ? roomL : roomR)) * w);
    const os = F.sampleAt(other.st.s), oln = F.lineAt(other.st.s);
    const oRoom = side > 0 ? oln - ((os.R ?? -7) + 0.95) : (os.L ?? 7) - 0.95 - oln;
    add(other.num, -side * Math.max(0, Math.min(0.8, oRoom)) * w);
  }
  for (const [key, v] of trafSide) if (Math.abs(t - v.t) > 8000) trafSide.delete(key);
  const jump = trafT == null || Math.abs(t - trafT) > 2000;
  trafT = t;
  for (const { num, st } of list) {
    const w = want.get(num) || [0, 0], smp = F.sampleAt(st.s), ln = F.lineAt(st.s);
    const tgt = Math.max((smp.R ?? -7) + 0.95 - ln, Math.min((smp.L ?? 7) - 0.95 - ln, w[0] + w[1]));   // on the tarmac
    // a critically damped spring (ω 3/s: a lane change takes ~1.5 s, starting and ending gently, like a car's)
    const c = cars.get(num);
    if (jump) { c.trafD = tgt; c.trafRate = 0; continue; }
    spring(c, "trafD", "trafRate", tgt, 3, dt);
  }
  for (const [num, c] of cars) if (!list.some((x) => x.num === num)) { c.trafD = 0; c.trafRate = 0; }
}
// Steadied car tracks per source and world, built a moment after the world (a replay takes a few hundred ms).
let smooth = { src: null, world: null, tr: null, pending: false };
function smoothFor(src) {
  if (devRawTracks) return null;
  if (smooth.src !== src || smooth.world !== world) {
    smooth = { src, world, tr: null, pending: true };
    const job = smooth;
    setTimeout(() => { if (smooth !== job) return; try { job.tr = smoothedTracks(src, world, window.ReplayKit.CarTracks); } catch (e) { console.warn("smooth", e); } job.pending = false; }, 50);
  }
  if (smooth.tr && src.isLive) smooth.tr.update(performance.now());
  return smooth.tr;
}
let devRawTracks = false, devNoShake = false, devMotion = false;
function updateCars(dt) {
  const A = app(), src = A.src;
  // position and velocity of every car from its smooth track (arrays reused frame to frame)
  // steadied tracks (smooth.js) once they're built for this source and circuit; the raw ones until then
  const sm = smoothFor(src);
  const pos = sm ? sm.all(A.t, posBuf, velBuf) : src.positionsInto ? src.positionsInto(A.t, posBuf, velBuf) : src.positionsAt(A.t);
  const drivers = src.state.DriverList || {}, lines = src.state.TimingData?.Lines || {};
  const appLines = src.state.TimingAppData?.Lines || {}, isRace = /Race|Sprint/.test(src.state.SessionInfo?.Type || src.state.SessionInfo?.Name || "") && !/Qualifying|Shootout/.test(src.state.SessionInfo?.Name || "");
  const seen = new Set();
  const focusNum = A.focus || leader();
  const k = 1 - Math.exp(-dt * 25), kSlow = 1 - Math.exp(-dt * 5);   // the heading is smooth already: only a touch of damping
  const F = sm?.frame, kBody = 1 - Math.exp(-dt * 12);
  if (F) traffic(sm, F, A.t, dt, pos);
  for (const [num, p] of Object.entries(pos)) {
    const d = drivers[num]; if (!d || !world) continue;
    seen.add(num);
    const c = carFor(num, d);
    const st = F ? sm.state(num, A.t, c.st || (c.st = {})) : null;
    const v = vTmp;
    let speed;
    if (st) {
      // On the track: posed from its track coordinates (smooth.js) – along the lap from the timing and the speed
      // telemetry, across on the racing line plus any room it's making in traffic – and from them how an F1 car
      // moves: the path's heading and turning rate, the body a touch more into the corner than the path (slip),
      // the nose dipping under braking, the car leaning a little and squatting on its downforce at speed.
      const off = c.trafD || 0, offRate = c.trafRate || 0;
      const dTot = st.d + off, dRate = st.vd + offRate;
      F.at(st.s, dTot, P0, DIR);
      speed = Math.hypot(st.vs, dRate);
      v.set(P0[0], P0[1], P0[2]);
      c.sample = F.sampleAt(st.s);
      // heading: the direction of the path over a few metres either side (3–10 m, with the speed): the lap line has
      // fine wiggles from the reference line it's made of, which its tangent shows and a chord averages out
      let pathYaw;
      if (Math.abs(st.vs) > 1.5) {
        const ds = Math.max(3, Math.min(10, Math.abs(st.vs) * 0.1)), h = ds / Math.abs(st.vs);
        F.at(st.s - st.vs * h, dTot - dRate * h, PA); F.at(st.s + st.vs * h, dTot + dRate * h, PB);
        pathYaw = Math.atan2(PB[0] - PA[0], PB[2] - PA[2]);
      } else pathYaw = Math.atan2(DIR[0], DIR[1]);
      if (devMotion) c.dbg = [Math.atan2(DIR[0], DIR[1]), Math.atan2(dRate, st.vs || 1), st.s, dTot, st.vs, st.d, off, P0[0], P0[2]];
      let yawRate = c.has && dt > 0 && c.pathYaw != null ? wrap(pathYaw - c.pathYaw) / dt : 0;
      if (Math.abs(yawRate) > 3) yawRate = 0;   // (a seek)
      // (the turning rate is a difference of headings: it carries a fine ripple where the curve's pieces meet,
      // so it's low-passed before the slip, lean and steering are made from it)
      c.yawRateF = c.has && c.yawRateF != null ? c.yawRateF + (yawRate - c.yawRateF) * (1 - Math.exp(-dt * 8)) : yawRate;
      yawRate = c.yawRateF;
      const aLat = speed * yawRate, aLong = st.as;
      // slip: ~1.5° at 5 g; a little more (oversteer) when it's on the power out of a slow corner
      const exitSlide = aLong > 4 && speed < 45 && Math.abs(aLat) > 8 ? Math.min(1, (aLong - 4) / 6) * Math.min(1, (Math.abs(aLat) - 8) / 10) * 0.035 * Math.sign(aLat) : 0;
      const beta = Math.max(-0.035, Math.min(0.035, aLat * 0.0006)) + exitSlide;
      const yaw = pathYaw + beta, dy = wrap(yaw - c.yaw);
      if (!c.has || Math.abs(dy) > 1.2) c.yaw = yaw; else c.yaw += dy * (1 - Math.exp(-dt * 30));
      c.pathYaw = pathYaw; c.yawRate = yawRate; c.slide = exitSlide;
      // the road's slope over ±4 m
      F.at(st.s + 4, 0, PA); F.at(st.s - 4, 0, PB);
      const fwd = st.vs >= 0 ? 1 : -1, slope = -Math.atan2((PA[1] - PB[1]) * fwd, 8);
      const pitchT = slope + Math.max(-0.006, Math.min(0.02, -aLong * 0.00032));     // −5 g: nose down ~0.9°
      const rollT = Math.max(-0.012, Math.min(0.012, -aLat * 0.0002));               // 5 g: ~0.55° out of the corner
      if (!c.has) { c.pitch = pitchT; c.roll = rollT; }
      c.pitch += (pitchT - c.pitch) * kBody; c.roll += (rollT - c.roll) * kBody;
      c.speed = speed; c.acc = aLong;
      v.y += 0.02 - 0.012 * Math.min(1, (speed / 90) ** 2);   // ride height drops with the downforce
    } else {
      // Off the track (pit lane, a trip across the run-off) and before the steadied tracks are ready: from the
      // positions, heading from the velocity.
      v.set(p[0] * DM - world.center.x, (p[2] || 0) * DM - world.center.y, -(p[1] * DM - world.center.z));
      const ground = trackPointFor(c, v.x, v.z);
      if (ground != null) v.y = ground + 0.02;
      const vel = velBuf[num];                                               // dm/ms → m/s is ×100
      const mx = vel ? vel[0] * 100 : 0, mz = vel ? -vel[1] * 100 : 0;
      speed = Math.hypot(mx, mz);
      // (crawling, the velocity of 4 Hz positions points anywhere: below 6 m/s the heading is kept – in front of the
      // garages it lies along the pit lane, the way the car was already facing; first seen, the lap line's direction)
      let yaw = c.yaw;
      if (speed > 6) yaw = Math.atan2(mx, mz);
      else {
        const pl = pitLaneDir(v.x, v.z);
        if (pl) { const a = Math.atan2(pl[0], pl[1]); yaw = Math.abs(wrap(a - c.yaw)) <= Math.PI / 2 ? a : wrap(a + Math.PI); }
        else if (!c.has && c.sample) yaw = Math.atan2(c.sample.tan.x, c.sample.tan.z);
      }
      const dy = wrap(yaw - c.yaw);
      if (!c.has || Math.abs(dy) > 1.2) c.yaw = yaw; else c.yaw += dy * k;   // a big swing is a jump (seek): snap
      const yawRate = c.has && dt > 0 ? wrap(c.yaw - (c.prevYaw ?? c.yaw)) / dt : 0;
      c.pathYaw = c.yaw; c.yawRate = yawRate; c.slide = 0;
      const prevSpeed = c.speed;
      c.speed = c.has ? c.speed + (speed - c.speed) * Math.min(1, dt * 8) : speed;
      const acc = dt > 0 && c.has ? (c.speed - prevSpeed) / dt : 0;
      c.acc = (c.acc || 0) + (Math.max(-60, Math.min(25, acc)) - (c.acc || 0)) * Math.min(1, dt * 6);
      let slope = 0;
      if (c.sample) {
        const ahead = world.samples[(c.sample.i + 3) % world.n].p, behind = world.samples[(c.sample.i - 3 + world.n) % world.n].p;
        const fwd = Math.cos(c.yaw - Math.atan2(c.sample.tan.x, c.sample.tan.z)) >= 0 ? 1 : -1;
        slope = -Math.atan2((ahead.y - behind.y) * fwd, 12);
      }
      c.pitch += (slope + Math.max(-0.006, Math.min(0.02, -c.acc * 0.00032)) - c.pitch) * kSlow;
      c.roll += (Math.max(-0.012, Math.min(0.012, -yawRate * c.speed * 0.0002)) - c.roll) * kSlow;
    }
    c.prevYaw = c.yaw; c.onTrack = !!st;
    const yawRate = c.yawRate;
    // on a kerb? (for the onboard shake)
    c.onKerb = false;
    if (c.sample && world.kerbMark) {
      const lat = (v.x - c.sample.p.x) * c.sample.nor.x + (v.z - c.sample.p.z) * c.sample.nor.z, i = c.sample.i;
      const L = c.sample.L ?? 7, R = c.sample.R ?? -7, m = world.kerbMark;
      c.onKerb = (lat > L - 1.6 && (m.inside[i] === 1 || m.outside[i] === 1)) || (lat < R + 1.6 && (m.inside[i] === -1 || m.outside[i] === -1));
    }
    // over a kerb the car rides its ridges: a bump pattern fixed to the kerb (so the same kerb always feels the same)
    c.bump = 0;
    if (c.onKerb && st) { c.bump = Math.sin(st.s * 5.3) * 0.6 + Math.sin(st.s * 12.1 + 1.7) * 0.4; v.y += 0.008 + 0.01 * c.bump; }
    // On the grid: a car standing near its slot is drawn in it (the data has the whole grid in single file);
    // once it pulls away the offset fades over ~2 s, so the field merges from the stagger as it really does.
    (c.raw || (c.raw = new THREE.Vector3())).copy(v);
    const slot = world.slots && isRace && world.slots.get(+(appLines[num]?.GridPos || 0));
    if (!c.gridOff) c.gridOff = { x: 0, z: 0 };
    if (slot && speed < 1 && Math.hypot(slot.x - v.x, slot.z - v.z) < 14) {
      const kk = c.has ? 1 - Math.exp(-dt * 8) : 1;
      c.gridOff.x += (slot.x - v.x - c.gridOff.x) * kk; c.gridOff.z += (slot.z - v.z - c.gridOff.z) * kk;
      c.yaw = slot.yaw;
    } else { const fade = Math.exp(-dt * 1.4); c.gridOff.x *= fade; c.gridOff.z *= fade; }
    if (Math.abs(c.gridOff.x) + Math.abs(c.gridOff.z) > 0.01) {
      v.x += c.gridOff.x; v.z += c.gridOff.z;
      if (!st) { const g2 = trackPointFor(c, v.x, v.z); if (g2 != null) v.y = g2 + 0.02; }
    }
    c.pos.copy(v); c.has = true;
    c.obj.position.copy(v);
    c.model.rotation.set(c.pitch, c.yaw, c.roll + c.bump * 0.003, "YXZ");
    // wheels roll with the speed; front wheels steer with the turning rate (Ackermann-ish: δ ≈ L·ω / v)
    c.spin = (c.spin + (c.speed * dt) / 0.354) % (Math.PI * 2);
    // (and a touch of opposite lock when the rear steps out)
    const steer = c.speed > 3 ? Math.max(-0.4, Math.min(0.4, Math.atan((3.4 * yawRate) / c.speed) - (c.slide || 0) * 2)) : 0;
    c.model.userData.wheels.forEach((w, i) => w.rotation.set(c.spin, i < 2 ? steer : 0, 0));
    // active aero: straight mode (flaps open) at speed on straights, corner mode otherwise
    const wantOpen = c.speed > 68 && Math.abs(yawRate) < 0.04 ? 1 : 0;
    c.aero += (wantOpen - c.aero) * (1 - Math.exp(-dt * 6));
    setAero(c.model, c.aero);
    if (!c.compoundAt || performance.now() - c.compoundAt > 1500) { c.compoundAt = performance.now(); const st = src.stints?.(num); setCompound(c.model, st?.[st.length - 1]?.Compound); }
    const l = lines[num] || {};
    const out = l.Retired || l.Stopped;
    const inCockpit = camMode === "onboard" && num === focusNum;
    c.obj.visible = true;
    (c.helmet || (c.helmet = c.model.getObjectByName("helmet"))).visible = !inCockpit;   // out of the T-cam's way, as in broadcast onboards
    c.label.sp.userData.own = inCockpit;
    paintLabel(c.label, `${l.Position || ""} ${d.Tla}`.trim(), "#" + (d.TeamColour || "888"), num === A.focus);
    c.label.sp.material.opacity = out ? 0.45 : 1;
  }
  for (const [num, c] of cars) if (!seen.has(num)) c.obj.visible = false;
  separate(dt, seen);
  // F1's archive sometimes stops publishing car positions part-way through a session (e.g. Monaco 2026):
  // say so instead of showing an empty track without explanation.
  const note = document.getElementById("note3d"), msg = "이 시점은 F1이 차량 위치 기록을 공개하지 않아서 차를 그릴 수 없어요. 순위·기록은 그대로 볼 수 있어요.";
  if (!seen.size && Object.keys(drivers).length) { if (note.textContent !== msg) note.textContent = msg; note.hidden = false; }
  else if (note.textContent === msg) note.hidden = true;
  scaleForView();
}
// Cars never pass through each other: overlapping pairs (position data is a metre or two off, and only
// 4 Hz) are moved apart – sideways when side by side, along the track when nose to tail – by the smallest
// amount (ReplayKit.separateCars). The correction is eased in and out so nothing jumps, and a car pushed
// sideways stays on the tarmac.
let sepMemory = {};
function separate(dt, seen) {
  const list = [];
  for (const num of seen) {
    const c = cars.get(num);
    list.push({ id: num, x: c.pos.x, z: c.pos.z, hx: Math.sin(c.yaw), hz: Math.cos(c.yaw) });   // c.pos is this frame's raw position
  }
  const off = window.ReplayKit.separateCars(list, sepMemory);
  const k = Math.min(1, dt * 9);
  for (const o of list) {
    const c = cars.get(o.id);
    let [tx, tz] = off[o.id];
    // keep it between the track edges (with half a car's width to spare)
    const s = c.sample;
    if (s && (tx || tz)) {
      const lat = (o.x + tx - s.p.x) * s.nor.x + (o.z + tz - s.p.z) * s.nor.z, latRaw = (o.x - s.p.x) * s.nor.x + (o.z - s.p.z) * s.nor.z;
      const hi = (s.L ?? 7) - 0.95, lo = (s.R ?? -7) + 0.95;
      if (latRaw <= hi && latRaw >= lo) { const cl = Math.max(lo, Math.min(hi, lat)) - lat; tx += s.nor.x * cl; tz += s.nor.z * cl; }
    }
    // (a spring, ω 6/s: the correction comes and goes without a kink, which at 60 fps read as a shake)
    if (dt > 0.5) { c.sepX = tx; c.sepZ = tz; c.sepVX = c.sepVZ = 0; } else { spring(c, "sepX", "sepVX", tx, 6, dt); spring(c, "sepZ", "sepVZ", tz, 6, dt); }
    c.pos.set(o.x + c.sepX, c.pos.y, o.z + c.sepZ);
    if (!c.onTrack) { const ground = trackPointFor(c, c.pos.x, c.pos.z); if (ground != null) c.pos.y = ground + 0.02; }   // (on the track the height is right already)
    c.obj.position.copy(c.pos);
  }
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function leader() {
  const lines = app().src?.state.TimingData?.Lines || {};
  return Object.keys(lines).find((n) => lines[n].Position === "1") || null;
}

// From high up the cars would be specks: grow them with distance, and keep name tags readable.
// (the small parts of a car: its four wheel covers and its lights)
function fineParts(c) {
  if (c.fineList) return c.fineList;
  const lm = c.model.userData, list = [];
  for (const w of lm.wheels || []) if (w.children[2]) list.push(w.children[2]);
  c.model.traverse((o) => { if (o.isMesh && o.material?.isMeshBasicMaterial && o.material !== lm.bandMat) list.push(o); });
  return (c.fineList = list);
}
function scaleForView() {
  const H = hostH || 1, f = 2 * Math.tan((camera.fov * Math.PI) / 360) / H;
  for (const c of cars.values()) {
    const dist = camera.position.distanceTo(c.obj.position);
    const s = camMode === "heli" ? Math.min(7, Math.max(1, dist / 115)) : 1;
    c.model.scale.setScalar(s);
    // far off (the helicopter view), the parts no one can make out at that size aren't drawn: the wheel covers and the
    // lights – 5 of a car's 20 draw calls (the tyre bands stay: their colour is the compound)
    const fine = dist < 250;
    if (c.fine !== fine) { c.fine = fine; for (const o of fineParts(c)) o.visible = fine; }
    c.label.sp.position.set(0, 1.5 * s + 0.4, 0);
    c.label.sp.scale.set(26 * f * (128 / 40), 26 * f, 1);   // ~26 px tall on screen
    c.label.sp.visible = !c.label.sp.userData.own && dist < 6000 && c.obj.visible;
  }
  declutterLabels();
}
function declutterLabels() {
  const lines = app().src?.state.TimingData?.Lines || {}, W = hostW, H = hostH, taken = [];
  const list = [...cars.values()].filter((c) => c.label.sp.visible)
    .sort((a, b) => (a.num === app().focus ? -1 : b.num === app().focus ? 1 : (+lines[a.num]?.Position || 99) - (+lines[b.num]?.Position || 99)));
  for (const c of list) {
    tmp2.copy(c.obj.position).project(camera);
    if (tmp2.z > 1) { c.label.sp.visible = false; continue; }
    const x = (tmp2.x * 0.5 + 0.5) * W, y = (-tmp2.y * 0.5 + 0.5) * H;
    if (taken.some(([tx, ty]) => Math.abs(tx - x) < 64 && Math.abs(ty - y) < 24)) { c.label.sp.visible = false; continue; }
    taken.push([x, y]);
  }
}

// ---------- cameras ----------
let camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camInit = false;
// Chase: a TV-style camera on a rig behind the car. The rig turns after the car on a critically damped
// spring (so corners swing the view a little, like a real tracking shot) and rides at a smoothed height
// (kerbs don't shake it). If a building or the ground would come between the car and the camera, the
// camera moves in. Onboard: the camera sits at the driver's eye on the car itself – same transform as
// the car, so the halo, mirrors, nose and front wheels stay put in the frame.
const chase = { yaw: 0, yawVel: 0, y: 0, init: false };
const ray = new THREE.Raycaster(), qTmp = new THREE.Quaternion(), qShake = new THREE.Quaternion(), shakeE = new THREE.Euler(), qLook = new THREE.Quaternion(), lookE = new THREE.Euler();
function updateCamera(dt) {
  const A = app();
  if (camMode === "inspect") return;
  if (camMode === "heli") { controls.enabled = true; controls.update(); setNear(0.3); return; }
  controls.enabled = false;
  const num = A.focus || leader(), c = cars.get(num);
  if (!c || !c.has) { controls.enabled = true; controls.update(); return; }
  if (camMode === "onboard") {
    // The broadcast T-cam on top of the airbox, fixed to the car: it pitches and rolls with the car under
    // braking and in corners, and shakes – a fine buzz that grows with speed, a hard rattle over kerbs.
    c.model.updateMatrixWorld(true);
    camera.position.copy(TCAM).applyMatrix4(c.model.matrixWorld);
    c.model.getWorldQuaternion(qTmp);
    const now = performance.now() / 1000, sp = Math.min(1, c.speed / 90);
    // (a fine buzz only: the car's own motion – kerbs included – now comes through the body it's fixed to)
    const amp = devNoShake ? 0 : 0.0002 + 0.0006 * sp + (c.onKerb ? 0.0015 : 0);
    const n1 = Math.sin(now * 61.3) * 0.6 + Math.sin(now * 97.1 + 1.3) * 0.4, n2 = Math.sin(now * 53.7 + 2.1) * 0.6 + Math.sin(now * 83.9) * 0.4;
    shakeE.set(-0.06 + n1 * amp, Math.PI + n2 * amp * 0.5, n2 * amp * 0.6, "YXZ");
    camera.quaternion.copy(qTmp).multiply(qShake.setFromEuler(shakeE));
    // free look: turn the head round the car's own up axis, then tilt
    if (look.yaw || look.pitch) camera.quaternion.multiply(qLook.setFromEuler(lookE.set(look.pitch, look.yaw, 0, "YXZ")));
    camera.position.y += n1 * amp * 0.25;
    setNear(0.05);
    if (camera.fov !== look.fov) { camera.fov = look.fov; camera.updateProjectionMatrix(); }
    camLook.copy(c.pos); camInit = true;
    return;
  }
  setNear(0.3);
  const w = 3.2;   // spring rate (rad/s): lower = lazier swing
  if (!camInit || !chase.init || Math.abs(wrap(c.yaw - chase.yaw)) > 1.6) { chase.yaw = c.yaw; chase.yawVel = 0; chase.y = c.pos.y; chase.init = true; }
  const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const acc = w * w * wrap(c.yaw - chase.yaw) - 2 * w * chase.yawVel;
    chase.yawVel += acc * h; chase.yaw += chase.yawVel * h;
  }
  chase.y += (c.pos.y - chase.y) * (1 - Math.exp(-dt * 4));
  // the camera on a sphere round the car: behind it and a little above by default, turned by free look
  const head = new THREE.Vector3(c.pos.x, chase.y + 1.1, c.pos.z);
  const az = chase.yaw + Math.PI + look.yaw, el = Math.atan2(2.4, 10.5) + look.pitch, r = Math.hypot(2.4, 10.5) * (look.dist / 10.5);
  const want = head.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el) * r, Math.sin(el) * r, Math.cos(az) * Math.cos(el) * r));
  // keep a clear line of sight to the car
  const dir = want.clone().sub(head), len = dir.length(); dir.normalize();
  // (los.js: only the triangles near the segment – the same answer as a raycast, at a fraction of the cost)
  const hitD = world.occluders?.length ? firstHit(world.occluders, head, dir, len) : null;
  if (hitD != null) want.copy(head).addScaledVector(dir, Math.max(3, hitD - 0.6));
  const g = world.real?.groundAt ? world.real.groundAt(want.x, want.z) : null;
  if (g != null && want.y < g + 1.4) want.y = g + 1.4;
  camera.position.copy(want);
  const fwd = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
  camLook.copy(c.pos).addScaledVector(fwd, 7).setY(chase.y + 1.0);
  // turned away from straight behind, the camera looks at the car itself
  const turned = Math.min(1, (Math.abs(look.yaw) + Math.abs(look.pitch) * 0.7) / 0.6);
  if (turned) camLook.lerp(head, turned);
  camera.up.copy(UP);
  camera.lookAt(camLook);
  camInit = true;
  if (camera.fov !== 58) { camera.fov = 58; camera.updateProjectionMatrix(); }
}
function setNear(n) { if (camera.near !== n) { camera.near = n; camera.updateProjectionMatrix(); } }

// Free look in the chase and onboard cameras: drag (or swipe sideways with two fingers) to turn the view all
// the way round, up and down; scroll / pinch to move the chase camera nearer or further (onboard: zoom).
// Double-click returns to the straight-ahead view. The angles are kept relative to the car, so the view
// turns with it through the corners.
const look = { yaw: 0, pitch: 0, dist: 10.5, fov: 74, dragged: false, down: null };
function resetLook() { look.yaw = 0; look.pitch = 0; look.dist = 10.5; look.fov = 74; }
function initLook() {
  const active = () => camMode === "chase" || camMode === "onboard";
  canvas.addEventListener("pointerdown", (e) => {
    if (!active() || e.button !== 0) return;
    look.down = { x: e.clientX, y: e.clientY, yaw: look.yaw, pitch: look.pitch, moved: 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!look.down || !active()) return;
    const dx = e.clientX - look.down.x, dy = e.clientY - look.down.y;
    look.down.moved = Math.max(look.down.moved, Math.hypot(dx, dy));
    const k = camMode === "onboard" ? 0.0055 : 0.007;
    look.yaw = wrap(look.down.yaw - dx * k);
    look.pitch = Math.max(camMode === "onboard" ? -0.9 : -0.35, Math.min(camMode === "onboard" ? 0.7 : 1.25, look.down.pitch + dy * k * (camMode === "onboard" ? -1 : 1)));
  });
  const up = (e) => { if (!look.down) return; if (look.down.moved > 4) look.dragged = true; look.down = null; try { canvas.releasePointerCapture(e.pointerId); } catch {} };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => {
    if (!active()) return;
    e.preventDefault();
    // a sideways two-finger swipe turns the view; up/down and pinch zoom
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) { look.yaw = wrap(look.yaw - e.deltaX * 0.006); return; }
    const d = e.deltaY * (e.ctrlKey ? 0.02 : 0.004);
    if (camMode === "chase") look.dist = Math.max(4.5, Math.min(60, look.dist * Math.exp(d)));
    else look.fov = Math.max(35, Math.min(100, look.fov * Math.exp(d)));
  }, { passive: false });
}

function setCam(mode) {
  if (mode === camMode) return;
  resetLook();
  camera.up.copy(UP); chase.init = false;
  if (mode === "heli") {
    // take over from wherever the chase camera was, orbiting the selected car
    const c = cars.get(app().focus || leader());
    controls.target.copy(c?.has ? c.pos : new THREE.Vector3());
    camera.fov = 50; camera.updateProjectionMatrix();
    if (camMode === "onboard" && c?.has) camera.position.copy(c.pos).add(new THREE.Vector3(0, 120, 160));
  }
  camMode = mode; camInit = false;
  try { localStorage.setItem("f1kr:cam3d", JSON.stringify(mode)); } catch {}
  paintCamButtons();
}
function paintCamButtons() {
  document.querySelectorAll("[data-cam]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cam === camMode)));
  document.getElementById("map3d").dataset.cam = camMode;
}
function cycleCar(dir) {
  const lines = app().src?.state.TimingData?.Lines || {};
  const order = Object.keys(lines).filter((n) => cars.get(n)?.has).sort((a, b) => (+lines[a].Position || 99) - (+lines[b].Position || 99));
  if (!order.length) return;
  const cur = order.indexOf(app().focus || leader());
  app().setFocus(order[(cur + dir + order.length) % order.length]);
}
function pickCar(e) {
  const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = null, bd = 26;
  for (const c of cars.values()) {
    if (!c.obj.visible) continue;
    tmp2.copy(c.obj.position).project(camera);
    if (tmp2.z > 1) continue;
    const sx = (tmp2.x * 0.5 + 0.5) * r.width, sy = (-tmp2.y * 0.5 + 0.5) * r.height;
    const d = Math.hypot(sx - x, sy - y);
    if (d < bd) { bd = d; best = c.num; }
  }
  if (best) app().setFocus(best);
}

// Fit the helicopter view to the whole circuit.
function frameCircuit() {
  const s = Math.max(world.size.x, world.size.z);
  controls.target.set(0, 0, 0);
  camera.position.set(0, s * 0.75, s * 0.75);
  camera.fov = 50; camera.updateProjectionMatrix();
  controls.maxDistance = s * 3;
  controls.update();
}

// ---------- HUD (chase / onboard) ----------
function paintHud() {
  const hud = document.getElementById("hud3d");
  if (camMode === "heli") { hud.hidden = true; return; }
  const A = app(), num = A.focus || leader();
  const d = A.src?.state.DriverList?.[num], l = A.src?.state.TimingData?.Lines?.[num];
  if (!d || !l) { hud.hidden = true; return; }
  hud.hidden = false;
  const KO = window.KO;
  const gap = l.GapToLeader || l.TimeDiffToFastest || "", int = l.IntervalToPositionAhead?.Value || l.TimeDiffToPositionAhead || "";
  // (feed values escaped; the colour only as six hex digits)
  const e = (x) => String(x ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const colour = /^[0-9a-f]{6}$/i.test(d.TeamColour || "") ? d.TeamColour : "888";
  const html = `<span class="bar" style="background:#${colour}"></span>
    <b class="p">P${e(l.Position || "–")}</b><b>${e(KO.surname(d.Tla, d.LastName))}</b><span class="t">${e(d.Tla)} · ${e(KO.TEAMS[d.TeamName] || d.TeamName)}</span>
    ${l.Position === "1" ? `<span class="g">선두</span>` : gap ? `<span class="g">선두와 ${e(gap)}</span>` : ""}${int && l.Position !== "1" ? `<span class="g">앞 차 ${e(int)}</span>` : ""}
    ${l.LastLapTime?.Value ? `<span class="g">최근 랩 ${e(l.LastLapTime.Value)}</span>` : ""}`;
  // live car data: speed, gear, pedals
  const c = A.src?.carAt?.(num, A.t);
  const tel = c ? `<span class="tel"><b>${Math.round(c.speed)}</b><small>km/h</small><b class="gear">${e(c.gear || "N")}</b><i class="thr" style="--v:${Math.max(0, Math.min(100, +c.thr || 0))}%"></i><i class="brk" style="--v:${c.brk ? 100 : 0}%"></i></span>` : "";
  const full = html + tel;
  if (hud.dataset.html !== full) { hud.innerHTML = full; hud.dataset.html = full; }
}

// ---------- real surroundings ----------
// Settings: imagery "eox" (free Sentinel-2) | "google" (needs the user's key) | "off" (generic look), and layers.
const GEO_DEFAULT = { provider: "eox", buildings: true, trees: true, night: "auto", shadows: true, facilities: true };
function geoSettings() { try { return { ...GEO_DEFAULT, ...JSON.parse(localStorage.getItem("f1kr:geo3d") || "{}") }; } catch { return { ...GEO_DEFAULT }; } }
function saveGeoSettings(v) { try { localStorage.setItem("f1kr:geo3d", JSON.stringify(v)); } catch {} }
const ATTR = {
  eox: "© OpenStreetMap 기여자 · 건물 Overture Maps Foundation · Sentinel-2 cloudless – EOX (Copernicus 2023) · 지형 Mapzen/AWS",
  google: "© OpenStreetMap 기여자 · 건물 Overture Maps Foundation · 지형 Mapzen/AWS",
};
let geoJob = 0;
function geoStatus(text, bad = false) {
  const el = document.getElementById("geo3dStatus");
  if (!el) return;
  el.textContent = text || ""; el.hidden = !text; el.classList.toggle("bad", bad);
}
async function loadGeo(w) {
  const job = ++geoJob, A = app(), opts = geoSettings();
  const attr = document.getElementById("geo3dAttr");
  attr.hidden = true;
  if (opts.provider === "off") { geoStatus(""); return; }
  const location = A.location?.();
  if (!location || !w.lap?.length) return;
  let provider = opts.provider;
  // (Google: checked with Google each time – a key deleted or the API switched off in the Cloud console falls
  // back to the free imagery, with a word why, instead of a map with no imagery)
  let googleNote = "";
  if (provider === "google") {
    const g = await window.api.geo.googleCheck();
    if (job !== geoJob) return;
    if (!g.ok) { provider = "eox"; saveGeoSettings({ ...geoSettings(), provider: "eox" }); googleNote = g.hasKey ? `${g.message} 무료 위성 사진으로 바꿨어요.` : ""; }
  }
  const off = window.api.geo.onProgress((step) => { if (job === geoJob) geoStatus(`실제 지도 · ${step}…`); });
  try {
    geoStatus("실제 지도 · 준비 중…");
    const data = await window.api.geo.scene(location, w.lap);
    if (job !== geoJob || world !== w) return;
    if (!data.ok) { geoStatus(`실제 지도를 못 만들었어요: ${data.reason}`, true); setTimeout(() => job === geoJob && geoStatus(""), 8000); return; }
    w.geoCenter = data.center;
    // A light map is painted when the session is (or runs into) the night: switched on and off with the sun.
    const evening = isNight() || (app().sessionHour?.() ?? 0) >= 15.5;
    const built = await buildScenery(window.api, data, w, { provider, buildings: opts.buildings, trees: opts.trees, night: evening, street: w.street, trackW: w.width,
      facilities: opts.facilities, year: A.sessionYear?.() || null, isCurrent: () => job === geoJob && world === w }, (step) => job === geoJob && geoStatus(`실제 지도 · ${step}…`));
    if (job !== geoJob || world !== w) { disposeReal(built); return; }
    // swap the generic surroundings for the real ones
    w.group.remove(w.syn.terrain, w.syn.trees);
    if (built.barrierShare > 0.35 && !w.street) w.group.remove(w.syn.walls);
    w.farBase = built.edge.clone().multiplyScalar(0.92);
    w.far.position.y = Math.min(w.far.position.y, (built.terrainLevel ?? w.far.position.y) - 40);
    w.group.add(built.group);
    refreshShadows();
    w.real = built;
    w.occluders = built.occluders;
    applyLighting();
    // credits are listed in the 🛰 지도 panel; only Google's imagery must carry its logo and data credits on the map
    const credits = document.getElementById("geo3dCredits");
    if (credits) credits.textContent = provider === "google" ? `Google 위성 사진 · ${ATTR.google}` : ATTR.eox;
    attr.hidden = provider !== "google";
    if (provider === "google") attr.innerHTML = `<b class="g-logo">Google</b> <span id="geo3dGAttr"></span>`;
    if (provider === "google") {
      const b = built.bounds.ll;
      // (an answer for an earlier map – rebuilt or another circuit since – isn't written over the current one's)
      window.api.geo.googleAttribution(built.info.zoom, b.n, b.s, b.e, b.w).then((t) => { if (job !== geoJob || world !== w || w.real !== built) return; const el = document.getElementById("geo3dGAttr"); if (el) el.textContent = t; }).catch(() => {});
    }
    const ci = data.circuit;
    if (googleNote) { geoStatus(googleNote, true); setTimeout(() => job === geoJob && geoStatus(""), 10000); return; }
    geoStatus(`${ci ? `${ci.name} · ${ci.length.toLocaleString()}m · ${ci.opened}년 개장 · 첫 F1 ${ci.firstgp}년 · ` : ""}트랙 위치 오차 약 ${data.rms.toFixed(1)}m${data.sceneryError ? " · 건물 정보는 못 받았어요" : data.buildingsPartial ? " · 일부 건물 타일을 못 받아 OSM 건물로 채웠어요" : ""}`);
    setTimeout(() => job === geoJob && geoStatus(""), 6000);
  } catch (e) {
    if (job === geoJob) { geoStatus(`실제 지도를 못 불러왔어요 (${e.message})`, true); setTimeout(() => job === geoJob && geoStatus(""), 8000); }
  } finally { off(); }
}

// ---------- sun, sky and night ----------
// Sun position for a moment and place (NOAA-style low-precision formulas, good to a fraction of a degree):
// { alt, az } in radians, azimuth clockwise from north.
function sunPosition(ms, lat, lon) {
  const r = Math.PI / 180, d = ms / 864e5 - 10957.5;                    // days since J2000.0
  const g = ((357.529 + 0.98560028 * d) % 360) * r;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * r;
  const e = (23.439 - 0.00000036 * d) * r;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  const ha = (gmst * 15 + lon) * r - ra, la = lat * r;
  const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha));
  return { alt, az };
}
// Where the sun is right now in the session (needs the circuit's coordinates from the real map), else null.
function sunNow() {
  const ll = world?.geoCenter, ms = app()?.utcNow?.();
  return ll && ms ? sunPosition(ms, ll[0], ll[1]) : null;
}
// Night: by the real sun when known (below −4°), else by the session's local start time.
function isNight() {
  const mode = geoSettings().night;
  if (mode === "on") return true;
  if (mode === "off") return false;
  const sp = sunNow();
  if (sp) return sp.alt < -4 * Math.PI / 180;
  const h = app()?.sessionHour?.();
  return h != null && h >= 17.5;
}
const sunDir = new THREE.Vector3(0.6, 1, 0.35).normalize();
let lit = null, lastSun = 0, nightNow = null, devNoHud = false, devNoLabels = false;
// Points the sun light (and its shadow box) at what the camera is looking at; a low sun turns warm.
function updateSun(now) {
  if (now - lastSun > 2000) {
    lastSun = now;
    const sp = sunNow(), night = isNight();
    if (night !== nightNow) applyLighting();
    if (sp && !night) {
      const alt = Math.max(sp.alt, 6 * Math.PI / 180);   // keep a little light in from above at dusk
      sunDir.set(Math.sin(sp.az) * Math.cos(alt), Math.sin(alt), -Math.cos(sp.az) * Math.cos(alt)).normalize();
      const low = Math.max(0, Math.min(1, (sp.alt * 180 / Math.PI) / 25));   // 0 at the horizon, 1 above 25°
      sun.color.setRGB(1, 0.78 + 0.18 * low, 0.6 + 0.3 * low);
      sun.intensity = 1.2 + 1.3 * low;
    } else if (night) sunDir.set(0.3, 1, 0.2).normalize();
  }
  // The shadow map holds only things that don't move (ground, buildings, trees, barriers; cars have their own
  // soft shadow under them). It is drawn again only when the area it covers moves: its centre snaps to a grid
  // an eighth of its size, so in a chase it is redrawn a couple of times a second instead of every frame.
  const target = camMode === "heli" ? controls.target : camLook;
  let span = camMode === "heli" ? Math.min(1700, Math.max(260, camera.position.distanceTo(controls.target) * 0.95)) : 260;
  span = Math.pow(2, Math.round(Math.log2(span) * 4) / 4);              // a few fixed sizes, not every value
  const grid = span / 8, cx = Math.round(target.x / grid) * grid, cz = Math.round(target.z / grid) * grid;
  // (the sun to ~0.5°: it moves that far in about two minutes – redrawing the whole shadow map for less was a stall
  // every few seconds of a fast replay, for no visible change)
  const key = `${cx},${cz},${span},${sunDir.x.toFixed(2)},${sunDir.y.toFixed(2)},${sunDir.z.toFixed(2)},${sun.castShadow}`;
  if (key === shadowKey) return;
  shadowKey = key;
  const c = new THREE.Vector3(cx, target.y, cz);
  sun.target.position.copy(c);
  sun.position.copy(c).addScaledVector(sunDir, 2500);
  const sc = sun.shadow.camera;
  if (sc.right !== span) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.updateProjectionMatrix(); }
  sun.target.updateMatrixWorld();
  renderer.shadowMap.needsUpdate = true;
}
let shadowKey = "";
function refreshShadows() { shadowKey = ""; }
// Floodlit cars: the light field (nightlights.js) lights them where the track is lit; a touch of light of their
// own on top keeps a dark livery readable from the helicopter.
function lightCar(model, night) {
  model.traverse((o) => {
    const m = o.material;
    if (!o.isMesh || !m || !m.isMeshStandardMaterial) return;
    nightLit(m);
    if (m.map && !m.emissiveMap) m.emissiveMap = m.map;
    m.emissive.set(night ? (m.map ? 0xffffff : m.color) : 0x000000);
    m.emissiveIntensity = night ? (m.map ? 0.1 : 0.07) : 0;
    m.needsUpdate = true;
  });
}
// The light field in use: the real map's (street lights, car parks, floodlit track) once it's there, else one of
// the floodlit track alone over the generic surroundings.
function nightField() {
  if (world.real?.night) return world.real.night;
  if (!world.trackField) {
    const b = world.box, pad = 300;
    const groundAt = (x, z) => { const [s] = world.grid.nearest(x, z, 3); return s ? s.p.y - 0.3 : world0Level; };
    world.trackField = lightField({ ext: { x0: b.min.x - pad, z0: b.min.z - pad, x1: b.max.x + pad, z1: b.max.z + pad }, groundAt,
      track: { samples: world.samples, width: world.width }, lines: [] });
  }
  return world.trackField;
}
// Every lit material of the world takes the light field (once each; the buildings' near and far materials too).
function nightLitWorld() {
  world.group.traverse((o) => {
    for (const m of [].concat(o.material || [], Array.isArray(o.userData?.materials) ? o.userData.materials : [])) nightLit(m);
  });
}
function applyLighting() {
  const night = isNight();
  nightNow = night;
  scene.background = night ? nightSky : daySky;
  // Night: little light from the sky (the city's glow, a moon), the rest from the light field – floodlights, street
  // lights – and from lit windows; reflections of the glowing horizon on glass and water.
  scene.fog.color.set(night ? 0x141620 : 0xc9d9e8);
  hemi.intensity = night ? 0.32 : 1.15; hemi.color.set(night ? 0x7d8db0 : 0xe3efff); hemi.groundColor.set(night ? 0x2a2420 : 0x4a5a3a);
  if (night) { sun.intensity = 0.16; sun.color.set(0xa9bce0); } else if (!sunNow()) { sun.intensity = 2.4; sun.color.set(0xfff3e0); }
  sun.castShadow = !night && geoSettings().shadows !== false;
  scene.environment = night ? nightEnvironment() : null;
  scene.environmentIntensity = 0.45;
  renderer.toneMappingExposure = night ? 1.0 : 1.05;
  lastSun = 0; refreshShadows();
  NL.gain.value = 0;
  if (!world) return;
  nightLitWorld();
  if (night) {
    const f = nightField();
    NL.tex.value = f.tex; NL.hgt.value = f.hgt; NL.ext.value.copy(f.ext); NL.gain.value = NIGHT_GAIN;
  }
  if (world.real?.night?.group) world.real.night.group.visible = night;
  for (const m of [world.road, world.kerb, world.lines]) m.traverse((o) => { if (o.material) { o.material.emissive = new THREE.Color(0); o.material.emissiveIntensity = 0; } });
  for (const c of cars.values()) lightCar(c.model, night);
  if (lit) { world.group.remove(lit); disposeGroup(lit); lit = null; }
  if (night) { lit = floodlights(world.samples); world.group.add(lit); }
  // the ground keeps its colour (the light falling on it changes, not the ground); lit windows switch on
  const real = world.real?.group.getObjectByName("terrain");
  if (real) real.material.color.set(0xffffff);
  for (const bm of world.real?.group.getObjectByName("buildings")?.userData.materials || []) { bm.emissive.set(night ? 0xffffff : 0); bm.emissiveIntensity = night ? 1 : 0; }
  // landmarks with lights of their own (the Sphere's LEDs, the Flame Towers, W hotel's gridshell, lit glass)
  world.real?.group.getObjectByName("landmarks")?.traverse((o) => { const m = o.material; if (m?.userData?.nightE) m.emissiveIntensity = m.userData.nightE[night ? 1 : 0]; });
  const sea = world.real?.group.getObjectByName("sea"), water = world.real?.group.getObjectByName("water");
  for (const w of [sea, water]) if (w) { w.material.emissive = new THREE.Color(night ? 0x02060a : 0); }
  world.far.material.color.copy(world.farBase).multiplyScalar(night ? 0.5 : 1);
  warmShaders();   // (the lit materials changed: their shaders now, not when each comes into view)
}
const NIGHT_GAIN = 5.5;   // light field → irradiance
// Light towers along the track (instanced): a mast, a bank of projectors aimed at the track, their lit faces and
// glare. Alternating sides, ~36 m apart (the field lights the track itself).
function floodlights(samples) {
  const g = new THREE.Group(), n = samples.length, every = 18;
  const count = Math.floor(n / every);
  const poleG = new THREE.CylinderGeometry(0.16, 0.26, 14, 6); poleG.translate(0, 7, 0);
  const headG = new THREE.BoxGeometry(2.4, 0.9, 0.45);
  const faceG = new THREE.PlaneGeometry(2.2, 0.75); faceG.translate(0, 0, 0.24);
  const metal = new THREE.MeshStandardMaterial({ color: 0x6b7178, roughness: 0.6, metalness: 0.4 });
  const poles = new THREE.InstancedMesh(poleG, metal, count), heads = new THREE.InstancedMesh(headG, metal, count);
  const faces = new THREE.InstancedMesh(faceG, new THREE.MeshBasicMaterial({ color: 0xf4f6ff }), count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), tilt = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const glow = [];
  for (let k = 0; k < count; k++) {
    const s = samples[k * every], side = k % 2 ? 1 : -1, off = Math.abs(edgeOf(s, side)) + 7;
    p.set(s.p.x + s.nor.x * side * off, s.p.y - 0.3, s.p.z + s.nor.z * side * off);
    // facing the track (local +z towards it), tipped down a little
    q.setFromAxisAngle(UP, Math.atan2(-s.nor.x * side, -s.nor.z * side));
    m.compose(p, q, one); poles.setMatrixAt(k, m);
    tilt.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.35); const qh = q.clone().multiply(tilt);
    m.compose(tmp.copy(p).setY(p.y + 14.2), qh, one); heads.setMatrixAt(k, m); faces.setMatrixAt(k, m);
    for (const u of [-0.75, 0, 0.75]) {
      const ax = s.tan.x * u, az = s.tan.z * u, toward = 0.6;
      glow.push({ x: p.x + ax - s.nor.x * side * toward, y: p.y + 14.1, z: p.z + az - s.nor.z * side * toward, c: [240, 244, 255], i: 4, s: 2.6 });
    }
  }
  g.add(poles, heads, faces, glowPoints(glow, "floodGlow"));
  return g;
}

// The shaders of everything in the world compiled now, while the map is being shown – not the first time a part comes
// into view (the garages' insides, the teams' layer: hidden by distance until the camera is near), which stalled that
// frame. (three.js compiles what's visible: the hidden parts are shown for the call, then hidden again.)
function warmShaders() {
  if (!renderer?.compileAsync) return;
  const hidden = [];
  world?.group.traverse((o) => { if (!o.visible && (o.name === "garageInteriors" || o.name === "pitTeams")) { hidden.push(o); o.visible = true; } });
  try { renderer.compileAsync(scene, camera).catch(() => {}); } finally { for (const o of hidden) o.visible = false; }
}

// ---------- loop ----------
function trackPoints() { try { return app().trackPoints(); } catch { return []; } }
// (Re)build the circuit when the session changes; checked once a second.
function ensureWorld(now) {
  const A = app();
  if (!A?.src) { showNote(A?.mode === "live" ? "실시간에 연결하면 서킷이 나타나요." : "세션을 불러오면 3D 서킷이 나타나요."); return; }
  if (now - lastBuildCheck < 1000) return;
  lastBuildCheck = now;
  const key = A.sourceKey(), note = document.getElementById("note3d");
  if (world && world.sourceKey === key && key.startsWith("replay:")) return;    // a replay's track never changes
  const pts = trackPoints();
  if (pts.length < 60) {
    // (another session without a track yet: the previous circuit isn't left on screen as if it were this one)
    if (world && sessionOf(world.sourceKey) !== sessionOf(key)) { disposeWorld(); geoJob++; }
    if (!world) showNote("이 서킷은 아직 주행 기록이 없어 3D로 그릴 수 없어요."); else note.hidden = true;
    return;
  }
  if (world && world.sourceKey === key && Math.abs(pts.length - world.pts) < 400) return;
  disposeWorld();
  sepMemory = {};
  world = buildWorld(pts);
  if (world) { world.sourceKey = key; world.pts = pts.length; addCorners(); addGrid(); frameCircuit(); applyLighting(); loadGeo(world); refreshShadows(); }
  note.hidden = !!world;
}
function showNote(text) { const n = document.getElementById("note3d"); n.textContent = text; n.hidden = false; }
// (disposeGroup, dispose.js: geometries, materials, their textures, instanced meshes' own buffers – each once, shared
// ones left alone)
// The real surroundings of a world (or a build that came too late or failed): their meshes, and the night light field,
// whose textures live outside the group (the shared uniforms are pointed away from them).
function disposeReal(real, done = new Set()) {
  if (!real) return done;
  disposeGroup(real.group, done);
  releaseField(real.night);
  return done;
}
// The whole world: its group, the real surroundings and the generic ones taken out of it while the real map is shown
// (they're kept to put back, so the group alone doesn't reach them), the light fields, and the cars. What pointed into
// it (the floodlights, the teams' layer) is let go.
function disposeWorld() {
  if (world) {
    scene.remove(world.group);
    const done = disposeGroup(world.group);
    disposeReal(world.real, done);
    releaseField(world.trackField);
    for (const o of Object.values(world.syn || {})) if (o && !o.parent) disposeGroup(o, done);
    world = null;
  }
  lit = null;
  forgetPitTeams();
  for (const c of cars.values()) { scene.remove(c.obj); disposeGroup(c.obj); }   // labels and shadows have their own textures
  cars.clear();
}
// the session a source key belongs to (a live key also carries the outline's length, which grows)
const sessionOf = (key) => (key || "").startsWith("live:") ? key.split(":").slice(0, 2).join(":") : key || "";

// Start line, light gantry and grid boxes from where the cars stood before a race start.
// The starting grid as it is painted: F1's position data puts every car on the lap line at uneven gaps, but
// the real grid is a 2-by-2 staggered formation – one slot every 8 m along the track, alternately left and
// right of the centre, pole on the side of the racing line. Built from the cars' standing positions before
// a start: pole's spot fixes where the grid begins. Map of grid position → { x, z, y, yaw, s }.
const GRID_GAP = 8;
function gridSlots(spots) {
  const n = world.n, step = world.samples[1].p.distanceTo(world.samples[0].p);
  const onTrack = spots.map((sp) => { const v = toWorld(sp.p, world.center), [s, d] = world.grid.nearest(v.x, v.z, 1); return { ...sp, v, s, d }; })
    .filter((o) => o.s && o.d <= Math.max(edgeOf(o.s, 1), -edgeOf(o.s, -1)) + 1)   // pit-lane starters left out
    .sort((a, b) => a.grid - b.grid);
  if (!onTrack.length) return null;
  // where pole stands along the track: from the front-most car on the grid, moved up by its grid position
  const f = onTrack[0], along0 = f.s.i * step + (f.v.x - f.s.p.x) * f.s.tan.x + (f.v.z - f.s.p.z) * f.s.tan.z + (f.grid - 1) * GRID_GAP;
  const ps = world.samples[((Math.round(along0 / step) % n) + n) % n];
  const centre = (edgeOf(ps, 1) + edgeOf(ps, -1)) / 2;
  const poleSide = Math.sign((ps.M ?? centre) - centre) || 1;
  const slots = new Map();
  const last = Math.max(22, ...spots.map((sp) => sp.grid));
  for (let g = 1; g <= last; g++) {
    const along = along0 - (g - 1) * GRID_GAP, fi = along / step, i0 = Math.floor(fi), t = fi - i0;
    const a = world.samples[((i0 % n) + n) % n], b = world.samples[(((i0 + 1) % n) + n) % n];
    const c = (edgeOf(a, 1) + edgeOf(a, -1)) / 2, w = Math.max(2.2, Math.min(3.8, (edgeOf(a, 1) - edgeOf(a, -1)) / 4));
    const lat = c + (g % 2 ? poleSide : -poleSide) * w;
    const x = a.p.x + (b.p.x - a.p.x) * t + a.nor.x * lat, z = a.p.z + (b.p.z - a.p.z) * t + a.nor.z * lat;
    slots.set(g, { x, z, y: a.p.y + (b.p.y - a.p.y) * t, yaw: Math.atan2(a.tan.x, a.tan.z), s: a });
  }
  return slots;
}
function addGrid() {
  const spots = app().gridSpots?.();
  world.slots = null;
  if (!spots?.length) return;
  world.slots = gridSlots(spots);
  if (!world.slots) return;
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 });   // lifted 12 cm instead of a depth offset, which drew them over the cars
  const g = new THREE.Group();
  let pole = null;
  const flat = (cx, cy, cz, w, l, yaw) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, l), white); m.position.set(cx, cy + 0.12, cz); m.rotation.y = yaw; m.receiveShadow = true; g.add(m); };
  for (const [g, sl] of world.slots) {
    if (g > 22) break;
    const { s, yaw } = sl, fx = s.tan.x, fz = s.tan.z, nx = s.nor.x, nz = s.nor.z, y = sl.y;
    // the slot: a line just ahead of the car's nose and two short side marks
    const lx = sl.x + fx * 3, lz = sl.z + fz * 3;
    flat(lx, y, lz, 2.6, 0.22, yaw);
    const side = (k) => flat(lx + nx * 1.25 * k - fx * 0.6, y, lz + nz * 1.25 * k - fz * 0.6, 0.18, 1.2, yaw);
    side(1); side(-1);
    if (g === 1) pole = { s, x: sl.x, z: sl.z, yaw };
  }
  if (pole) {
    // start line ~9 m ahead of pole, across the whole track, and the gantry with its five red lights above it
    const { s, yaw } = pole, fx = s.tan.x, fz = s.tan.z, nx = s.nor.x, nz = s.nor.z;
    // 9 m ahead of pole, measured along the lap line (all sideways offsets below are from that line)
    const along = (pole.x - s.p.x) * fx + (pole.z - s.p.z) * fz;
    const sx = s.p.x + fx * (along + 9), sz = s.p.z + fz * (along + 9), y = s.p.y;
    const wl = edgeOf(s, 1), wr = edgeOf(s, -1), mid = (wl + wr) / 2;
    const line = new THREE.Mesh(new THREE.BoxGeometry(wl - wr, 0.02, 0.6), white); line.position.set(sx + nx * mid, y + 0.12, sz + nz * mid); line.rotation.y = yaw; g.add(line);
    const steel = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.5, metalness: 0.6 });
    const H = 7.2;
    for (const off of [wl + 1.5, wr - 1.5]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, H, 0.5), steel);
      post.position.set(sx + nx * off, y + H / 2, sz + nz * off); post.castShadow = true; g.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(wl - wr + 3.5, 1.1, 0.6), steel);
    beam.position.set(sx + nx * mid, y + H, sz + nz * mid); beam.rotation.y = yaw; beam.castShadow = true; g.add(beam);
    const lamp = new THREE.MeshStandardMaterial({ color: 0x220606, emissive: 0xff2a1a, emissiveIntensity: 0.25 });
    for (let i = -2; i <= 2; i++) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.35), lamp);
      pod.position.set(sx + nx * (mid + i * 1.4) - fx * 0.45, y + H - 0.9, sz + nz * (mid + i * 1.4) - fz * 0.45); pod.rotation.y = yaw; g.add(pod);
    }
  }
  world.group.add(g);
}

function addCorners() {
  const circ = app().circuit;
  if (!circ?.corners?.length) return;
  for (const k of circ.corners) {
    const v = toWorld([k.x, k.y, 0], world.center);
    const [s] = world.grid.nearest(v.x, v.z, 2);
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d");
    x.fillStyle = "rgba(14,16,19,0.75)"; x.beginPath(); x.arc(32, 32, 26, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#e8ecf0"; x.font = "700 28px -apple-system, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(k.n), 32, 34);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), sizeAttenuation: false, depthTest: false, transparent: true, opacity: 0.85 }));
    const a = (k.angle * Math.PI) / 180;
    sp.position.set(v.x + Math.cos(a) * 22, (s ? s.p.y : 0) + 4, v.z - Math.sin(a) * 22);
    sp.scale.set(0.032, 0.032, 1); sp.renderOrder = 5;
    world.group.add(sp);
  }
}

function frame(now) {
  if (!visible) return;
  const dt = Math.min(0.1, (now - lastT) / 1000 || 0.016); lastT = now;
  ensureWorld(now);
  const A = app();
  if (world && A?.src) updateCars(dt);
  if (world) updateCamera(dt);
  updateSun(now);
  thinFarTrees();
  world?.real?.stands?.update(camera.position);
  realPart("buildings")?.userData.update?.(camera.position);
  realPart("facilities")?.userData.update?.(camera.position);
  updatePitTeams();
  if (!devNoHud) paintHud();
  // glare points: pixels per metre at 1 m away, fading into the haze as the fog does; time for blinking lights
  NL.time.value = now / 1000;
  GLOW.scale.value = renderer.getDrawingBufferSize(tmpV2).y / (2 * Math.tan((camera.fov * Math.PI) / 360));
  GLOW.fade.value.set(scene.fog.near, scene.fog.far);
  renderer.render(scene, camera);
  adaptResolution(now, dt);
  requestAnimationFrame(frame);
}

// Level of detail for vegetation: each tree chunk holds its instances in random order, so drawing only the
// first part of them thins a far-away forest evenly. Near chunks get all their trees.
// (a part of the real map by name, looked up once: the parts don't change once it's built)
function realPart(name) {
  const R = world?.real; if (!R) return null;
  const c = R.parts || (R.parts = {});
  return name in c ? c[name] : (c[name] = R.group.getObjectByName(name) || null);
}
// (done again when the camera has moved 5 m: the forest a frame later is the same)
let treesAt = null;
function thinFarTrees() {
  const trees = realPart("trees");
  if (!trees) return;
  const cam = camera.position;
  if (treesAt && treesAt.trees === trees && treesAt.p.distanceToSquared(cam) < 25) return;
  treesAt = { trees, p: cam.clone() };
  for (const im of trees.children) {
    const full = im.userData.full; if (!full) continue;
    const c = im.userData.centre, d = Math.hypot(c.x - cam.x, c.z - cam.z, (c.y - cam.y) * 0.5);
    const f = Math.max(0.12, Math.min(1, 450 / Math.max(1, d)));
    im.count = Math.max(1, Math.round(full * f));
  }
}

// Keeps the frame rate up on slower machines: render at a lower pixel ratio while frames are slow (over
// ~25 ms on average for 2 s), and step back up when there's room again.
const perf = { acc: 0, n: 0, since: 0, ratio: 0, fps: 0, spikes: 0, worst: 0, frames: 0 };
function adaptResolution(now, dt) {
  const max = Math.min(devicePixelRatio || 1, 2);
  if (!perf.ratio) perf.ratio = max;
  perf.acc += dt; perf.n++; perf.frames++;
  if (dt > 0.03) perf.spikes++;                 // a frame longer than ~2 at 60 Hz: a visible hitch
  perf.worst = Math.max(perf.worst, dt);
  if (now - perf.since < 2000) return;
  const avg = perf.acc / perf.n;
  perf.fps = Math.round(1 / avg); perf.acc = 0; perf.n = 0; perf.since = now;
  // (a change of resolution reallocates the drawing buffers – a ~100 ms stall: down at once when frames are slow (4 s
  // apart at most), up only after two fast 2 s windows in a row and 10 s after the last change – no stepping back and
  // forth between two sizes)
  const want = avg > 0.025 ? -1 : avg < 0.012 ? 1 : 0;
  perf.trend = want > 0 && perf.lastWant > 0 ? (perf.trend || 0) + 1 : want > 0 ? 1 : 0; perf.lastWant = want;
  const since = now - (perf.changedAt || 0);
  let r = perf.ratio;
  if (want < 0 && r > 1 && since > 4000) r = Math.max(1, r - 0.25);
  else if (want > 0 && perf.trend >= 2 && since > 10000 && r < max) r = Math.min(max, r + 0.25);
  if (r !== perf.ratio) { perf.ratio = r; perf.changedAt = now; perf.trend = 0; renderer.setPixelRatio(r); resize(); }
}

// Self-check used in development on every circuit: walks the lap every ~20 m and reports
//  overhead – places where a building stands over the tarmac (a ray from above hits a building first)
//  chase   – places where a building blocks the chase camera's view of a car on the racing line
function occlusionTest() {
  if (!world?.occluders?.length) return { buildings: 0 };
  const res = { samples: 0, overhead: 0, chase: 0, where: [] };
  const down = new THREE.Vector3(0, -1, 0);
  for (let i = 0; i < world.n; i += 10) {
    const s = world.samples[i], mid = ((s.L ?? 7) + (s.R ?? -7)) / 2;
    const car = new THREE.Vector3(s.p.x + s.nor.x * mid, s.p.y + 0.6, s.p.z + s.nor.z * mid);
    res.samples++;
    for (const off of [0, (s.L ?? 7) - 1, (s.R ?? -7) + 1]) {
      const pt = new THREE.Vector3(s.p.x + s.nor.x * off, s.p.y + 80, s.p.z + s.nor.z * off);
      ray.set(pt, down); ray.far = 79.5;
      const hit = ray.intersectObjects(world.occluders, false)[0];
      if (hit) {
        let what = "building";
        if (hit.object === world.real?.stands?.structure) {
          const L = world.real.stands.info.list;
          what = "stand " + L.reduce((b, st) => (Math.hypot(st.c[0] - hit.point.x, st.c[2] - hit.point.z) < Math.hypot(b.c[0] - hit.point.x, b.c[2] - hit.point.z) ? st : b), L[0]).n;
        }
        res.overhead++; res.where.push(["overhead", i, what, hit.point.toArray().map(Math.round)]); break;
      }
    }
    const b = world.samples[(i - 5 + world.n) % world.n];   // ~10 m back along the track
    const cam = new THREE.Vector3(b.p.x + b.nor.x * mid, b.p.y + 3.5, b.p.z + b.nor.z * mid);
    const dir = car.clone().sub(cam), len = dir.length();
    ray.set(cam, dir.normalize()); ray.far = len;
    if (ray.intersectObjects(world.occluders, false).length) { res.chase++; res.where.push(["chase", i]); }
  }
  res.where = res.where.slice(0, 8);
  res.cleared = world.real?.info?.clearedFromTrack;
  return res;
}

// Self-check: land (not water on the map) under a water surface – the sea plane or a lake/harbour mesh.
// Walks the terrain every 12 m; reports the flooded share of land and where the biggest patches are.
function floodTest() {
  const R = world?.real;
  if (!R) return { real: false };
  const water = [R.group.getObjectByName("water")].filter(Boolean);
  const down = new THREE.Vector3(0, -1, 0), b = R.bounds;
  let land = 0, wet = 0, dry = 0;   // dry: flooded although the map has land (buildings, roads, land use) there
  const cells = new Map();
  for (let x = b.x0 + 6; x < b.x1; x += 12) for (let z = b.z0 + 6; z < b.z1; z += 12) {
    if (R.classAt(x, z) === 9) continue;
    const g = R.groundAt(x, z);
    land++;
    let top = R.seaLevel ?? -Infinity;
    if (water.length) { ray.set(tmp.set(x, g + 200, z), down); ray.far = 400; const h = ray.intersectObjects(water, false)[0]; if (h) top = Math.max(top, h.point.y); }
    const mapped = R.landAt ? R.landAt(x, z) : false;   // a building, road, land use or the track is here
    if (top > g + 0.05) { wet++; if (mapped) dry++; }
    if (top > g + 0.05 && mapped) { const k = `${Math.floor(x / 200)},${Math.floor(z / 200)}`; cells.set(k, (cells.get(k) || 0) + 1); }
  }
  return { land, wet, dry, dryShare: +(dry / Math.max(1, land)).toFixed(4), sea: R.seaLevel, top: [...cells].sort((a, c) => c[1] - a[1]).slice(0, 5) };
}

window.Map3D = {
  floodTest,
  // development: steadiness of the drawn cars over [t0, t1] (stream ms): raw tracks vs steadied ones
  steadiness(t0, t1) {
    const src = app().src; if (!world || !src) return "no world";
    const a = performance.now(), tr = smoothedTracks(src, world, window.ReplayKit.CarTracks), build = Math.round(performance.now() - a);
    return JSON.stringify({ buildMs: build, lag: tr.lag, raw: steadiness(src.tracks, src, world, t0, t1, tr.lag), steady: steadiness(tr, src, world, t0, t1, tr.lag) });
  },
  rawTracks(on) { devRawTracks = !!on; return "ok"; },
  // development: drives the onboard camera of car `num` frame by frame (60 fps) over `secs` from stream time t0
  // and measures what the viewer sees shake – the part of each motion faster than ~1 Hz (the residual from a
  // 0.25 s Gaussian): camera height and sideways position (cm), camera yaw / pitch / roll (deg); car body too.
  motionTest(t0, secs = 20, num = null, shake = false) {
    const real = window.F1KR, n = Math.round(secs * 60), dt = 1 / 60;
    num = num || real.focus || leader();
    let fakeT = t0;
    window.F1KR = new Proxy(real, { get: (o, k) => (k === "t" ? fakeT : k === "focus" ? num : Reflect.get(o, k)) });
    const prevMode = camMode, prevShake = devNoShake;
    camMode = "onboard"; devNoShake = !shake; devMotion = true; camInit = false;
    const rec = { t: [], cx: [], cy: [], cz: [], yaw: [], pitch: [], roll: [], by: [], bpitch: [], broll: [], byaw: [] };
    const e = new THREE.Euler();
    try {
      for (let i = 0; i < n; i++) {
        fakeT = t0 + i * dt * 1000;
        updateCars(dt); updateCamera(dt);
        const c = cars.get(num); if (!c?.has || !c.obj.visible) continue;
        e.setFromQuaternion(camera.quaternion, "YXZ");
        rec.t.push(i * dt * 1000); rec.cx.push(camera.position.x); rec.cy.push(camera.position.y); rec.cz.push(camera.position.z);
        rec.yaw.push(e.y); rec.pitch.push(e.x); rec.roll.push(e.z);
        rec.by.push(c.pos.y); rec.byaw.push(c.yaw); rec.bpitch.push(c.pitch); rec.broll.push(c.roll);
        if (c.dbg) (rec.dbg || (rec.dbg = [])).push(c.dbg.slice().concat([c.pos.x, c.pos.z, c.sepX || 0, c.sepZ || 0, c.bump || 0, c.onTrack ? 1 : 0]));
      }
    } finally { window.F1KR = real; camMode = prevMode; devNoShake = prevShake; devMotion = false; camInit = false; }
    const un = (a) => { const o = a.slice(); for (let i = 1; i < o.length; i++) o[i] = o[i - 1] + wrap(a[i] - a[i - 1]); return o; };
    const resid = (a) => {   // jitter: the residual from a local quadratic fit over ±0.25 s (zero for any smooth motion)
      const m = a.length, out = new Array(m).fill(0), W = 15;
      for (let i = W; i < m - W; i++) {
        let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0;
        for (let j = -W; j <= W; j++) { const x = j / W, y = a[i + j]; s0++; s1 += x; s2 += x * x; s3 += x ** 3; s4 += x ** 4; y0 += y; y1 += x * y; y2 += x * x * y; }
        // normal equations of y = c0 + c1 x + c2 x² (symmetric window: s1 = s3 = 0); the fit at x = 0 is c0
        const c0 = (y0 * s4 - y2 * s2) / (s0 * s4 - s2 * s2);
        out[i] = a[i] - c0;
      }
      return out;
    };
    const rms = (r, scale) => +(Math.sqrt(r.slice(30, -30).reduce((x, y) => x + y * y, 0) / Math.max(1, r.length - 60)) * scale).toFixed(3);
    const hf = (a, scale) => rms(resid(a), scale);
    // sideways: the horizontal residual across the direction of travel
    const rx = resid(rec.cx), rz = resid(rec.cz), side = rx.map((x, i) => x * Math.cos(rec.byaw[i]) - rz[i] * Math.sin(rec.byaw[i]));
    const D = 57.2958;
    return JSON.stringify({ num, frames: rec.t.length,
      cam: { heightCm: hf(rec.cy, 100), sideCm: rms(side, 100), yawDeg: hf(un(rec.yaw), D), pitchDeg: hf(rec.pitch, D), rollDeg: hf(rec.roll, D) },
      parts: rec.dbg ? { lineDirDeg: hf(un(rec.dbg.map((r) => r[0])), D), sideTermDeg: hf(rec.dbg.map((r) => r[1]), D), sCm: hf(rec.dbg.map((r) => r[2]), 100), dCm: hf(rec.dbg.map((r) => r[3]), 100), vs: hf(rec.dbg.map((r) => r[4]), 1), dDataCm: hf(rec.dbg.map((r) => r[5]), 100), offCm: hf(rec.dbg.map((r) => r[6]), 100), ...(() => { const sd = (ix, iz) => { const rx = resid(rec.dbg.map((r) => r[ix])), rz = resid(rec.dbg.map((r) => r[iz])); return rms(rx.map((x, i) => x * Math.cos(rec.byaw[i]) - rz[i] * Math.sin(rec.byaw[i])), 100); }; return { p0SideCm: sd(7, 8), posSideCm: sd(9, 10), sepCm: hf(rec.dbg.map((r) => Math.hypot(r[11], r[12])), 100), kerbShare: +(rec.dbg.filter((r) => r[13]).length / rec.dbg.length).toFixed(2), onTrack: +(rec.dbg.filter((r) => r[14]).length / rec.dbg.length).toFixed(2) }; })() } : null,
      body: { heightCm: hf(rec.by, 100), yawDeg: hf(un(rec.byaw), D), pitchDeg: hf(rec.bpitch, D), rollDeg: hf(rec.broll, D) } });
  },
  // development: across-track spread of all cars at the sharpest corners (d: + left of the lap line, metres)
  spreadAt(k = 6) {
    const src = app().src, S = world.samples, n = world.n, c0 = world.center;
    const peaks = []; for (let i = 0; i < n; i++) { const t = Math.abs(S[i].turn); if (t < 0.006) continue; let p = true; for (let j = -10; j <= 10; j++) if (Math.abs(S[(i + j + n) % n].turn) > t) { p = false; break; } if (p) peaks.push(i); }
    const bins = new Map(peaks.slice(0, k).map((i) => [i, []]));
    for (const c of Object.values(src.tracks.cars)) for (let q = 0; q < c.n; q += 1) {
      const x = c.x[q] * DM - c0.x, z = -(c.y[q] * DM - c0.z), [smp, d] = world.grid.nearest(x, z, 1);
      if (!smp || d > 25 || !bins.has(smp.i)) continue;
      bins.get(smp.i).push((x - smp.p.x) * smp.nor.x + (z - smp.p.z) * smp.nor.z);
    }
    const pc = (a, f) => +a[Math.min(a.length - 1, Math.floor(a.length * f))].toFixed(1);
    return JSON.stringify([...bins].map(([i, a]) => { a.sort((x, y) => x - y); return { i, turn: S[i].turn > 0 ? "L" : "R", n: a.length, p1: a.length ? pc(a, 0.01) : null, p10: a.length ? pc(a, 0.1) : null, p50: a.length ? pc(a, 0.5) : null, p90: a.length ? pc(a, 0.9) : null, p99: a.length ? pc(a, 0.99) : null, L: +S[i].L.toFixed(1), R: +S[i].R.toFixed(1) }; }));
  },
  // development: moments in [t0, t1] (stream ms, every `step`) when a car is moved aside by traffic (> 1.2 m)
  trafficScan(t0, t1, step = 1000) {
    const real = window.F1KR; let fakeT = t0; const hits = [];
    window.F1KR = new Proxy(real, { get: (o, k) => (k === "t" ? fakeT : Reflect.get(o, k)) });
    try { for (fakeT = t0; fakeT <= t1; fakeT += step) { updateCars(step / 1000); for (const [num, c] of cars) if (c.obj.visible && Math.abs(c.trafD || 0) > 1.2) hits.push([Math.round((fakeT - t0) / 1000), num, +c.trafD.toFixed(1)]); } }
    finally { window.F1KR = real; }
    return JSON.stringify(hits.slice(0, 60)) + " total " + hits.length;
  },
  // development: the racing line's offset (and the edges, turning) every 10 m over ±80 m of the k sharpest corners
  lineProfile(k = 3) {
    const S = world.samples, n = world.n, res = [];
    const peaks = []; for (let i = 0; i < n; i++) { const t = Math.abs(S[i].turn); if (t < 0.006) continue; let p = true; for (let j = -10; j <= 10; j++) if (Math.abs(S[(i + j + n) % n].turn) > t) { p = false; break; } if (p) peaks.push(i); }
    for (const i of peaks.slice(0, k)) { const r = []; for (let j = -40; j <= 40; j += 5) { const q = S[(i + j + n) % n]; r.push([j * 2, +q.line.toFixed(1), +q.L.toFixed(1), +q.R.toFixed(1), +(q.turn * 1000).toFixed(1)]); } res.push({ i, rows: r }); }
    return JSON.stringify(res);
  },
  // development: how the cars take the corners over [t0, t1] (stream ms), from what's drawn every 100 ms: for each
  // corner (the sharpest point of every bend tighter than ~170 m radius), the median distance from a car's centre
  // to the inside edge at the apex (a racing car clips it: ~1–1.5 m, its half-width plus a little), and to the
  // outside edge 40 m before (turn-in) and 50 m after (exit, running wide).
  lineTest(t0, t1) {
    if (!world) return "no world";
    const real = window.F1KR; let fakeT = t0;
    window.F1KR = new Proxy(real, { get: (o, k) => (k === "t" ? fakeT : Reflect.get(o, k)) });
    const S = world.samples, n = world.n, corners = [];
    for (let i = 0; i < n; i++) {
      const k = Math.abs(S[i].turn); if (k < 0.006) continue;
      let peak = true; for (let j = -10; j <= 10; j++) if (Math.abs(S[(i + j + n) % n].turn) > k) { peak = false; break; }
      if (peak) corners.push({ i, side: S[i].turn > 0 ? 1 : -1, apex: [], entry: [], exit: [] });
    }
    try {
      for (fakeT = t0; fakeT <= t1; fakeT += 100) {
        updateCars(0.1);
        for (const [, c] of cars) {
          if (!c.has || !c.obj.visible || !c.sample) continue;
          const i = c.sample.i;
          for (const k of corners) {
            const di = ((i - k.i + n + n / 2) % n) - n / 2;
            const lat = (x) => (c.pos.x - x.p.x) * x.nor.x + (c.pos.z - x.p.z) * x.nor.z;
            const inner = (x) => (k.side > 0 ? x.L - lat(x) : lat(x) - x.R), outer = (x) => (k.side > 0 ? lat(x) - x.R : x.L - lat(x));
            if (Math.abs(di) <= 1) k.apex.push(inner(c.sample));
            else if (Math.abs(di + 20) <= 1) k.entry.push(outer(c.sample));
            else if (Math.abs(di - 25) <= 1) k.exit.push(outer(c.sample));
          }
        }
      }
    } finally { window.F1KR = real; }
    const med = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
    const avg = (key) => { const v = corners.map((k) => med(k[key])).filter((x) => x != null); return +(v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)).toFixed(2); };
    const spread = () => { const v = corners.filter((k) => k.apex.length > 8).map((k) => { const m = med(k.apex); return med(k.apex.map((x) => Math.abs(x - m))); }); return +(v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)).toFixed(2); };
    return JSON.stringify({ corners: corners.length, apexToInsideM: avg("apex"), turnInToOutsideM: avg("entry"), exitToOutsideM: avg("exit"), apexScatterM: spread() });
  },
  _real: () => world?.real?.group,
  // development: look at landmark k from `dist` m away (bearing `ang`), `h` m up
  viewLandmark(k = 0, dist = 1, h = 0.6, ang = 0.7) {
    const sp = world?.real?.landmarks?.spots?.[k]; if (!sp) return "none";
    const [x, z, r] = sp, g = world.real.groundAt(x, z), d = r * 2.2 * dist;
    return window.Map3D.look(x + Math.cos(ang) * d, g + d * h, z + Math.sin(ang) * d, x, g + r * 0.25, z, 45);
  },
  // development: look at a real-world point (lat, lon) from `dist` m away on bearing `brg` (degrees from north,
  // where the camera stands), `h` m up; or at a point in F1 metres (viewF1)
  viewLL(lat, lon, dist = 150, h = 40, brg = 180, fov = 45, aimH = 8) {
    const gf = world?.real?.geo; if (!gf) return "no map";
    const [x, z] = gf.fromLL(lat, lon); return this.viewAt(x, z, dist, h, brg, fov, aimH);
  },
  viewF1(X, Y, dist = 150, h = 40, brg = 180, fov = 45, aimH = 8) {
    const gf = world?.real?.geo; if (!gf) return "no map";
    const [x, z] = gf.xz([X, Y]); return this.viewAt(x, z, dist, h, brg, fov, aimH);
  },
  // development: load a model file from src/data/models through the real path (main process → GLTFLoader) and
  // stand it at (lat, lon); answers how it went and whether its texture decoded
  async facilityTest(file, lat, lon, heading = 0) {
    const gf = world?.real?.geo; if (!gf) return "no map";
    const { buildFacilities } = await import("./facilities.js");
    const r = await buildFacilities({ scene: { buildings: [] }, gf, groundAt: world.real.groundAt, location: "test", year: null, toTrack: () => [1, 0],
      readModel: (f) => window.api.geo.model(f), registry: [{ id: "test:" + file, loc: ["test"], status: "trial", replaces: { names: /^$/ }, model: { file, anchor: [lat, lon], heading } }] });
    const fg = r?.group; if (fg) world.real.group.add(fg);
    const mesh = fg?.getObjectByProperty("isMesh", true), img = mesh?.material?.map?.image;
    return JSON.stringify({ info: r?.info, texture: img ? [img.width, img.height] : null });
  },
  // development: look at garage k of the pit building from `back` m out in the pit lane, `h` m up (`side` m along)
  viewPits(k = 20, back = 28, h = 9, side = 0, fov = 50) {
    let G = null; world?.real?.group.getObjectByName("facilities")?.traverse((o) => { if (!G && o.userData?.garages) G = o.userData.garages; });
    if (!G) return "no garages";
    const s = G.slots[Math.max(0, Math.min(G.slots.length - 1, k))], [ix, iz] = s.inward;
    return this.look(s.front[0] - ix * back + s.along[0] * side, s.floor + h, s.front[1] - iz * back + s.along[1] * side, s.front[0] + ix * 3, s.floor + 2, s.front[1] + iz * 3, fov);
  },
  // development: look down at the paddock behind garage k (from beyond it, over the units towards the building)
  viewPaddock(k = 20, out = 70, h = 30, fov = 50) {
    let G = null; world?.real?.group.getObjectByName("facilities")?.traverse((o) => { if (!G && o.userData?.garages) G = o.userData.garages; });
    if (!G) return "no garages";
    const s = G.slots[Math.max(0, Math.min(G.slots.length - 1, k))], [ix, iz] = s.inward;
    return this.look(s.front[0] + ix * (s.depth + out), s.floor + h, s.front[1] + iz * (s.depth + out), s.front[0] + ix * (s.depth + 18), s.floor + 3, s.front[1] + iz * (s.depth + 18), fov);
  },
  // development: what the scene holds, by part – objects, meshes drawn (visible, in view or not), triangles
  sceneStats() {
    const out = {}, add = (k, o) => { const r = out[k] || (out[k] = { objects: 0, meshes: 0, visibleMeshes: 0, tris: 0 }); r.objects++; if (o.isMesh || o.isPoints || o.isSprite || o.isLine) { r.meshes++; let v = true; for (let p = o; p; p = p.parent) if (!p.visible) { v = false; break; } if (v) { r.visibleMeshes++; const g = o.geometry; if (g?.attributes?.position) r.tris += Math.round(((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1)); } } };
    scene.traverse((o) => { let top = o, sub = null; while (top.parent && top.parent !== scene) { sub = top; top = top.parent; } const name = top === world?.group ? "world/" + (sub ? (sub === world.real?.group ? "real" : sub.name || sub.type) : "-") : top.name || top.type; add(name, o); });
    for (const c of world?.real?.group.children || []) c.traverse((o) => add("real/" + (c.name || c.type), o));
    return JSON.stringify(out);
  },
  // development: how many facility models stand in the current world, and what the renderer holds
  pitTeams() { updatePitTeams(true); return JSON.stringify({ ...pitTeamsInfo(), teams: pitTeams.key?.split("|"), evidence: pitTeams.info?.evidence.map((e) => [e.team, e.ok ? "ok" : "no", e.reason, e.n, e.spread, e.u != null ? Math.round(e.u) : null]) }); },
  facilityState() {
    const g = world?.real?.group; let n = 0; g?.traverse((o) => { if (o.userData?.facility) n++; });
    return JSON.stringify({ facilities: n, info: world?.real?.info?.facilities, mem: renderer?.info.memory, calls: renderer?.info.render.calls, tris: renderer?.info.render.triangles });
  },
  // development: eye and target in F1 metres, heights above the ground there
  lookF1(ex, ey, eh, tx, ty, th, fov = 40) {
    const gf = world?.real?.geo; if (!gf) return "no map";
    const [a, b] = gf.xz([ex, ey]), [c, d] = gf.xz([tx, ty]), g = world.real.groundAt;
    return this.look(a, g(a, b) + eh, b, c, g(c, d) + th, d, fov);
  },
  viewAt(x, z, dist, h, brg, fov = 45, aimH = 8) {
    const g = world.real.groundAt(x, z), gf = world.real.geo;
    // the bearing in scene axes: north is the direction of increasing latitude in this frame
    const [la, lo] = gf.toLL(x, z), [nx, nz] = gf.fromLL(la + 0.001, lo), nl = Math.hypot(nx - x, nz - z) || 1, N = [(nx - x) / nl, (nz - z) / nl], E = [-N[1], N[0]];
    const b = (brg * Math.PI) / 180, dx = N[0] * Math.cos(b) + E[0] * Math.sin(b), dz = N[1] * Math.cos(b) + E[1] * Math.sin(b);
    return this.look(x + dx * dist, g + h, z + dz * dist, x, g + aimH, z, fov);
  },
  setLook(yaw = 0, pitch = 0, dist = 10.5) { look.yaw = yaw; look.pitch = pitch; look.dist = dist; return "ok"; },
  // development: a look down the grid from behind and above (pole at the far end)
  viewGrid(h = 22, back = 60, side = 14) {
    const sl = world?.slots; if (!sl) return "no grid";
    const p1 = sl.get(1), p12 = sl.get(12) || p1, fx = Math.sin(p1.yaw), fz = Math.cos(p1.yaw);
    return window.Map3D.look(p12.x - fx * back + fz * side, p12.y + h, p12.z - fz * back - fx * side, (p1.x + p12.x) / 2, p1.y, (p1.z + p12.z) / 2, 45);
  },
  // development: where the cars stand across the track (lateral offset from the lap line, m) and along it
  gridDebug() {
    const out = [];
    for (const [num, c] of cars) {
      if (!c.has) continue;
      const [s] = world.grid.nearest(c.pos.x, c.pos.z, 2); if (!s) continue;
      const raw = c.raw || c.pos;
      out.push({ num, i: s.i, lat: +((c.pos.x - s.p.x) * s.nor.x + (c.pos.z - s.p.z) * s.nor.z).toFixed(2), rawLat: +((raw.x - s.p.x) * s.nor.x + (raw.z - s.p.z) * s.nor.z).toFixed(2), L: +(s.L ?? 0).toFixed(1), R: +(s.R ?? 0).toFixed(1) });
    }
    out.sort((a, b) => b.i - a.i);
    const spots = (app().gridSpots?.() || []).map((sp) => { const v = toWorld(sp.p, world.center), [s] = world.grid.nearest(v.x, v.z, 2); return s && { grid: sp.grid, i: s.i, lat: +((v.x - s.p.x) * s.nor.x + (v.z - s.p.z) * s.nor.z).toFixed(2) }; }).filter(Boolean).sort((a, b) => a.grid - b.grid);
    return { cars: out, spots };
  },
  show() {
    if (!renderer) {
      init();
      try { const m = JSON.parse(localStorage.getItem("f1kr:cam3d")); if (["heli", "chase", "onboard"].includes(m)) { camMode = m; paintCamButtons(); } } catch {}
    }
    if (visible) return;
    visible = true; resize(); lastT = performance.now(); requestAnimationFrame(frame);
  },
  hide() { visible = false; },
  dev(o) { if ("shadows" in o) { sun.castShadow = o.shadows; } if ("hud" in o) devNoHud = !o.hud; if ("labels" in o) devNoLabels = !o.labels; return "ok"; },
  resetHitches() { perf.spikes = 0; perf.worst = 0; perf.frames = 0; },
  occlusionTest,
  // development: look at the focused car from a given offset (metres, car frame)
  inspect(dx, dy, dz) {
    const c = cars.get(app().focus || leader()); if (!c) return "no car";
    setCam("heli"); controls.enabled = false; visible && (camMode = "inspect");
    const yaw = c.yaw, f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), r = new THREE.Vector3(f.z, 0, -f.x);
    camera.position.copy(c.pos).addScaledVector(r, dx).addScaledVector(UP, dy).addScaledVector(f, dz);
    camera.near = 0.05; camera.fov = 40; camera.updateProjectionMatrix(); camera.lookAt(c.pos.clone().addScaledVector(UP, 0.5));
    return "ok";
  },
  reset() { if (world) { setCam("heli"); frameCircuit(); } },
  // development: look at a grandstand (index or name) from `dist` m in front of it, `h` m up, `along` m sideways
  viewStand(k, dist = 60, h = 12, along = 0) {
    const L = world?.real?.stands?.info.list || [];
    const st = typeof k === "number" ? L[k] : L.find((s) => s.n === k);
    if (!st) return "no stand";
    setCam("heli"); controls.enabled = false; camMode = "inspect";
    const [cx, cy, cz] = st.c, [nx, nz] = st.nrm, tx = -nz, tz = nx;
    camera.position.set(cx - nx * dist + tx * along, cy + h, cz - nz * dist + tz * along);
    camera.near = 0.3; camera.fov = 50; camera.updateProjectionMatrix();
    camera.lookAt(cx + nx * 9, cy + 7, cz + nz * 9);
    return `${st.n} rows ${st.rows} seats ${st.seats}`;
  },
  // development: free camera
  // development: look at car `num` (default: the leader) from `back` m behind and `h` m up, `side` m to its left
  viewCar(num = null, h = 40, back = 30, side = 0, fov = 50) {
    const c = cars.get(num || leader()); if (!c?.has) return "no car";
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    return this.look(c.pos.x - fx * back - fz * side, c.pos.y + h, c.pos.z - fz * back + fx * side, c.pos.x + fx * back * 0.4, c.pos.y, c.pos.z + fz * back * 0.4, fov);
  },
  // development: look at the track at fraction f of the lap from `back` m behind, `h` m up, `side` m to the left
  viewTrack(f = 0, h = 25, back = 50, side = 0, fov = 50) {
    if (!world) return "no world";
    const s = world.samples[Math.floor((((f % 1) + 1) % 1) * world.n)];
    return this.look(s.p.x - s.tan.x * back + s.nor.x * side, s.p.y + h, s.p.z - s.tan.z * back + s.nor.z * side, s.p.x, s.p.y, s.p.z, fov);
  },
  look(px, py, pz, tx, ty, tz, fov = 50) {
    setCam("heli"); controls.enabled = false; camMode = "inspect";
    camera.position.set(px, py, pz); camera.near = 0.3; camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(tx, ty, tz);
    return "ok";
  },
  debug: () => JSON.stringify({ cam: camera?.position.toArray().map(Math.round), target: controls?.target.toArray().map(Math.round), fov: camera?.fov, aspect: camera?.aspect,
    size: world && [world.size.x, world.size.y, world.size.z].map(Math.round), host: host && [host.clientWidth, host.clientHeight], cars: cars.size, mode: camMode,
    paint: (() => { const c = cars.get(app()?.focus || leader()); const m = c?.model.children[1]?.material; return m && { color: m.color.getHexString(), emissive: m.emissive.getHexString(), ei: m.emissiveIntensity }; })(),
    sun: [sun?.color.getHexString(), sun && +sun.intensity.toFixed(2), sunDir.toArray().map((v) => +v.toFixed(2))], night: nightNow, follow: (() => { const c = cars.get(app()?.focus || leader()); if (!c) return null; const v = c.pos.clone().project(camera); return { pos: c.pos.toArray().map(Math.round), yaw: +c.yaw.toFixed(2), chaseYaw: +chase.yaw.toFixed(2), speed: Math.round(c.speed), screen: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(3)], visible: c.obj.visible, inScene: !!c.obj.parent }; })(), hitches: { frames: perf.frames, over30ms: perf.spikes, worstMs: Math.round(perf.worst * 1000) }, key: world?.sourceKey, mem: { geo: renderer?.info.memory.geometries, tex: renderer?.info.memory.textures, calls: renderer?.info.render.calls, tris: renderer?.info.render.triangles, heapMB: Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576) }, fps: perf.fps, ratio: perf.ratio, loc: app()?.location?.(), width: world?.width && +world.width.toFixed(1), measured: world?.samples?.measured && +world.samples.measured.toFixed(2), street: world?.street, real: !!world?.real, info: world?.real?.info }),
};
window.dispatchEvent(new Event("map3d-ready"));
