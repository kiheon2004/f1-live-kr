// 3D track view. Builds the circuit from one clean lap of position data (F1 sends X/Y/Z in decimetres,
// so hills are real), places a small F1 car per driver and offers three cameras:
//   heli    – orbit around the circuit with the mouse / trackpad
//   chase   – TV-style camera behind and above the selected car
//   onboard – driver's-eye view from the cockpit
// Reads everything from window.F1KR (set up by app.js); draws only while the 3D view is visible.
import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { buildScenery } from "./scenery.js";
import { smoothedTracks, steadiness, racingLine, trackFrame, speedIntegral } from "./smooth.js";
import { GRID_RULES, ASSIGN_TOL, fitGrid, slotS, slotLat, gridWeight, assignSlots, poleSideFor, surveyedGrid, slotCount } from "./grid.js";
import { START_DATA } from "./startdata.js";
import { StartHistory, startContext, carKind, placeWithout, arrivalBy, onPitPath, PLAN, startLights, fieldLaunch } from "./startplan.js";
import { LANES, laneCells, crossSection } from "./pitlane.js";
import { pitState, laneOffsetOf, crewPhase, pendingPenalties, pendingTimePenalties, pitVisits, posSpeed, standingForPos, lastStandPos, standEndPos, nextStandPos, stopPlan, PIT } from "./pitstate.js";
import { crewMeshes, crewAt, crewLayout, stopChoreo, changeWalk, kitAt, CHANGE } from "./crew.js";
import { orderedBoxes } from "./pitorder.js";
import { standstills, PitInference, allocatePlaces, allocationKey, teamLayer, overridesFor, paintPitScreens, updateTeamScreens } from "./garages.js";
import { makeCar, setCompound, setAero, setWheels, setDetail, setCarEnvironment, profileFor, wheelParts, TYRE_COLOURS, setWheelScreen } from "./car3d.js";
import { WheelScreens, screenModel } from "./wheelscreen.js";
import { boardsFor, boardPlaces } from "./boards.js";
import { NL, GLOW, nightLit, lightField, glowPoints, releaseField } from "./nightlights.js";
import { disposeGroup, watchShadowDepth, releaseShadowRefs } from "./dispose.js";
import { chaseFallback, chasePlace, clearAround, firstHit, nearRoom } from "./los.js";
import { venueOf, aeroLocked, wallOpeningsFor } from "./venues.js";

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
  renderer.setPixelRatio(qualityRange().max);
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
// what the 3D view draws at right now (shown under the quality choice while the settings are open)
function paintQualityNow() {
  const el = document.getElementById("geoQualityNow"); if (!el) return;
  el.textContent = perf.ratio ? `지금 ${perf.ratio}배 해상도 · ${perf.cap ? "초당 60프레임" : perf.vsync && perf.vsync < 0.0105 ? "초당 120프레임" : "화면 주사율대로"}` : "";
}
function initGeoSettings() {
  const pop = document.getElementById("geo3dPop"), btn = document.getElementById("geo3dBtn");
  const paint = () => {
    const o = geoSettings();
    document.querySelectorAll('input[name="geoProvider"]').forEach((r) => { r.checked = r.value === o.provider; });
    document.getElementById("geoBuildings").checked = o.buildings !== false;
    document.getElementById("geoTrees").checked = o.trees !== false;
    document.getElementById("geoShadows").checked = o.shadows !== false;
    document.getElementById("geoFacilities").checked = o.facilities !== false;
    document.getElementById("geoBigCars").checked = o.bigCars === true;
    document.getElementById("geoQuality").value = QUALITY[o.quality] ? o.quality : "balanced";
    paintQualityNow();
    document.getElementById("geoNight").value = o.night || "auto";
    document.getElementById("geoPitWork").value = ["record", "observed", "typical"].includes(o.pitWork) ? o.pitWork : "record";
    document.getElementById("geoAero").value = o.aero === "off" ? "off" : "estimate";
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
  document.getElementById("geoBigCars").addEventListener("change", (e) => change({ bigCars: e.target.checked }, false));
  document.getElementById("geoQuality").addEventListener("change", (e) => { saveGeoSettings({ ...geoSettings(), quality: e.target.value }); applyQuality(); paintQualityNow(); });
  document.getElementById("geoNight").addEventListener("change", (e) => change({ night: e.target.value }, !!world?.real));
  document.getElementById("geoPitWork").addEventListener("change", (e) => saveGeoSettings({ ...geoSettings(), pitWork: e.target.value }));
  document.getElementById("geoAero").addEventListener("change", (e) => saveGeoSettings({ ...geoSettings(), aero: e.target.value }));
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
  if (fac !== pitTeams.facility) { clearPitTeams(); pitTeams.facility = fac; pitTeams.teams = null; pitTeams.G = null; if (!fac.getObjectByName("pitLaneSurface")) fac.add(pitLaneMeshes(pitModelFor(fac.userData.garages))); }
  const G = fac.userData.garages, c = world.center, drivers = src.state?.DriverList || {};
  // (the pit wall's screens: the session's public timing as the app shows it – never a team's own data)
  { const lines = src.state?.TimingData?.Lines || {}, lc = src.state?.LapCount;
    const rows = Object.entries(lines).filter(([, l]) => +l.Position > 0).sort((a, b) => a[1].Position - b[1].Position).slice(0, 10)
      .map(([n, l]) => [l.Position, drivers[n]?.Tla || n, l.Position === "1" ? "" : (l.IntervalToPositionAhead?.Value || l.GapToLeader || ""), "#" + (drivers[n]?.TeamColour || "888888")]);
    paintPitScreens(rows, lc?.CurrentLap ? `LAP ${lc.CurrentLap}${lc.TotalLaps ? "/" + lc.TotalLaps : ""}` : null); }
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
  // The teams' boxes as allocated (pitorder.js: the previous season's constructors' order along the lane, the circuit's
  // measured boxes – the rule held at every circuit measured): from the session's start, before any stop. The stops
  // seen place only a team the order doesn't cover.
  // A team whose stops this session have been seen (garages.js: trusted places) has its box where they were – the
  // order's place is the prior until then (it may be a season's measurement other than this one's, or between measured
  // boxes: pitorder.js says how each is known).
  const pub = world.pitLane ? orderedBoxes(A.circuitKey?.(), A.sessionYear?.(), Object.values(drivers).map((d) => d?.TeamName).filter(Boolean)) : null;
  let places = r.places;
  if (pub) {
    const o = {}, seen = new Set(r.places.filter((p) => p.ok && p.from === "box").map((p) => p.team));
    places = [...pub.filter((b) => !seen.has(b.team)).map((b) => { pitLaneAt(b.u, o); const pr = G.project(o.x, o.z); return { team: b.team, u: pr.u, off: LANES.box, from: "box", ok: true, own: {}, published: true, how: b.how, season: b.season }; }), ...r.places.filter((p) => !pub.some((b) => b.team === p.team) || seen.has(p.team))];
  }
  pitTeams.order = pub;
  const teams = allocatePlaces(G.slots, G.pitch, drivers, places, overridesFor(G.facility, A.sessionYear?.() || null, session));
  // (a box is painted where a car stands in it – LANES.box out from the garages –, not on the feed's line, which runs
  // anywhere across the lane: pitlane.js)
  { const pm = pitModelFor(G); for (const t of teams) if (t.box != null) t.boxOff = pm.at(t.box).boxC; }
  pitTeams.teams = teams; pitTeams.G = G;
  pitTeams.info = { evidence: r.evidence, live: !!src.isLive };
  // (how many garages a team has and which driver's is which are estimates: the data shows only where the cars stopped)
  const est = teams.filter((t) => t.estimated);
  pitTeamNote(!teams.length ? null : pub ? "팀 박스 순서: 전년도 컨스트럭터 순위(F1 배정 규칙, 실제 피트 스톱으로 확인) · 차고 칸 수는 추정" : !est.length ? "팀 차고: 공개된 배치 자료" : (est.some((t) => t.from === "box") ? "팀 차고 위치: 피트 스톱 위치로 추정" : "팀 차고 위치: 반복 정차 위치로 추정") + (src.isLive ? "" : " (현재 재생 시점까지)") + " · 칸 수·배정은 추정");
  const key = allocationKey(teams);
  if (key === pitTeams.key) return;
  clearPitTeams();
  pitTeams.key = key;
  if (!teams.length) return;   // neutral garages
  pitTeams.group = teamLayer(G, teams, drivers, A.sessionYear?.() || null);
  // a layer added at night takes the light field too (its own materials only – the rest of the world has it already)
  pitTeams.group.traverse((o) => { for (const m of [].concat(o.material || [])) nightLit(m); });
  fac.add(pitTeams.group);
  warmShaders();
}
// ---------- the pit lane across (pitlane.js crossSection), at every garage of the pit building ----------
// Measured at each garage: the pit wall's face to the lane (the facility's wall, where it has one), else the track's
// tarmac edge on this side (a wall assumed there); the garages' floor height. The pit lane is one level surface at the
// garages' floor (garage floors are laid level with the lane's tarmac – facilities.js floorAt), so cars, crews, paint
// and floor share one height; past the run's ends it eases down to the ground the entry and exit roads lie on.
const pitModels = new WeakMap();
function pitModelFor(G) {
  let m = pitModels.get(G); if (m) return m;
  const F = world.frame, st = G.slots.map((s) => {
    const out = [-s.inward[0], -s.inward[1]];
    let edge = null;
    for (let d = 0; d < 60; d += 0.25) {
      const x = s.front[0] + out[0] * d, z = s.front[1] + out[1] * d, pr = F.project(x, z); if (!pr) continue;
      const half = pr.d >= 0 ? edgeOf(pr.sample, 1) : -edgeOf(pr.sample, -1);
      if (Math.abs(pr.d) <= half) { edge = d; break; }
    }
    const wall = G.wallFace ? G.wallFace(s.uc) : null;
    return { s, cs: crossSection({ wall, edge }), edge, floor: s.floor };
  });
  const at = (u) => {
    const f = Math.max(0, Math.min(st.length - 1, (u - G.gStart) / G.pitch - 0.5)), i = Math.min(st.length - 2, Math.floor(f)), t = st.length > 1 ? f - Math.max(0, i) : 0;
    const a = st[Math.max(0, i)], b = st[Math.min(st.length - 1, Math.max(0, i) + 1)], L = (k) => (a.cs[k] ?? 0) + ((b.cs[k] ?? 0) - (a.cs[k] ?? 0)) * t;
    return { ok: a.cs.ok && b.cs.ok, fastC: L("fastC"), boxC: L("boxC"), inner: L("inner"), wall: L("wall"), floor: a.floor + (b.floor - a.floor) * t, slot: t < 0.5 ? a.s : b.s };
  };
  m = { G, st, at, ok: st.filter((x) => x.cs.ok).length, wallFrom: [...new Set(st.map((x) => x.cs.wallFrom))] };
  pitModels.set(G, m);
  return m;
}
// The pit lane's tarmac (from just inside the garages' fronts to the wall's face, at the floor's height; 20 m on past
// either end of the run, falling to the ground there) and the line where the fast lane begins
function pitLaneMeshes(m) {
  const g = new THREE.Group(); g.name = "pitLaneSurface";
  const R = world.real, sl = m.st, pos = [], col = [], uv = [], idx = [], line = [], lidx = [];
  const rows = [];
  rows.push({ x: sl[0], du: -sl[0].s.width / 2 - 20, end: true });
  for (const x of sl) rows.push({ x, du: 0 });
  rows.push({ x: sl[sl.length - 1], du: sl[sl.length - 1].s.width / 2 + 20, end: true });
  let dist = 0, prev = null;
  for (const r of rows) {
    const s = r.x.s, w = r.x.cs.wall ?? r.x.edge ?? 12, inner = r.x.cs.inner ?? w - 3.5;
    const P = (off, y) => [s.front[0] + s.along[0] * r.du - s.inward[0] * off, y, s.front[1] + s.along[1] * r.du - s.inward[1] * off];
    const yAt = (off) => { const [x, , z] = P(off, 0); const gy = R?.groundAt ? R.groundAt(x, z) : r.x.floor; return r.end ? Math.max(gy, r.x.floor - 0.6) + 0.04 : r.x.floor + 0.004; };
    const here = P(0, 0); if (prev) dist += Math.hypot(here[0] - prev[0], here[2] - prev[2]); prev = here;
    const v0 = pos.length / 3;
    for (const off of [-0.3, w * 0.5, w]) { pos.push(...P(off, yAt(off))); const c = 0.4; col.push(c, c * 1.01, c * 1.03); uv.push(off / 6, dist / 6); }
    if (v0) for (let k = 0; k < 2; k++) { const a = v0 - 3 + k, b = v0 + k; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    if (!r.end) { const l0 = line.length / 3; line.push(...P(inner - 0.06, r.x.floor + 0.012), ...P(inner + 0.06, r.x.floor + 0.012)); if (l0) lidx.push(l0 - 2, l0 - 1, l0, l0 - 1, l0 + 1, l0); }
  }
  const mk = (p, i, mat, name, c, u) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    if (c) geo.setAttribute("color", new THREE.Float32BufferAttribute(c, 3)); if (u) geo.setAttribute("uv", new THREE.Float32BufferAttribute(u, 2));
    geo.setIndex(i); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat); mesh.name = name; mesh.receiveShadow = true; g.add(mesh);
  };
  mk(pos, idx, new THREE.MeshStandardMaterial({ vertexColors: true, map: asphaltTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide }), "pitLaneTarmac", col, uv);
  mk(line, lidx, new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide }), "laneLine");
  return g;
}
// Every car in the pit lane this frame (pitstate.js): its state from the data up to now – raw positions only (the
// InPit flag, its place on the measured pit path, its telemetry), never what is drawn – and where across the lane that
// puts it. Two passes: a car standing behind its box sees a teammate in it. → Map num → { state, u, off, at, team, … }
let laneTestFor = null;
function pitFrame(src, t, lag, isRace) {
  const G = pitTeams.G; if (!G || !world?.pitLane) return null;
  const m = pitModelFor(G), S = startState(src, t), ctx = startCtxAt(S, t);
  if (laneTestFor?.lane !== world.pitLane) laneTestFor = { lane: world.pitLane, test: laneCells(world.pitLane.pts.map((p) => [p.x, p.z])) };
  const visits = (num) => pitVisits(S.hist.flags.get(num + ":InPit"), t), timePen = pendingTimePenalties(S.hist.rcm, t, visits);
  const pen = pendingPenalties(S.hist.rcm, t, visits), drivers = src.state.DriverList || {}, c0 = world.center;
  const raw = src.positionsAt(t), out = new Map();
  // (each team's box tolerance: half the way to the nearest other team's box)
  const boxes = (pitTeams.teams || []).filter((q) => q.box != null).map((q) => [q.team, q.box]).sort((a, b) => a[1] - b[1]), tolOf = new Map();
  boxes.forEach(([tm, u], i) => tolOf.set(tm, Math.min(i > 0 ? u - boxes[i - 1][1] : Infinity, i + 1 < boxes.length ? boxes[i + 1][1] - u : Infinity) / 2));
  for (const [num, p] of Object.entries(raw)) {
    let x = p[0] * DM - c0.x, z = -(p[1] * DM - c0.z);
    const onLane = laneTestFor.test(x, z), inPit = S.hist.flagAt(num, "InPit", t);
    if (!onLane && !inPit) continue;
    // (in the pit lane the feed has every car on the measured path's line: a position more than 3 m off it is the data
    // jumping – Barcelona 2025, Norris, one sample 13 m out towards the track – and taken back onto the line, its place
    // along the lane kept)
    if (inPit) { const q = nearestOnPath(x, z); if (q && q.d > 3 && q.d < 25) { x = q.x; z = q.z; } }
    const pr = G.project(x, z), team = drivers[num]?.TeamName, tm = pitTeams.teams?.find((q) => q.team === team);
    // (standing and speed from its positions: in the box the telemetry's wheel speed jumps while the car is jacked up)
    const trk = src.tracks?.cars?.[num];
    const speed = trk ? posSpeed(trk, t) : (cars.get(num)?.speed ?? 0), stillFor = trk ? standingForPos(trk, t) : 0;
    const ls = trk ? lastStandPos(trk, t) : null; let lastBox = null;
    if (ls && tm?.box != null) { const q = [0, 0, 0]; if (src.tracks?.at?.(num, ls.t1, q)) { const pu = G.project(q[0] * DM - c0.x, -(q[1] * DM - c0.z)).u; if (Math.abs(pu - tm.box) <= Math.min(PIT.atBox, tolOf.get(team) ?? PIT.atBox)) lastBox = { endU: pu, ago: (t - ls.t1) / 1000, t0: ls.t0, t1: ls.t1 }; } }
    let pitStart = null;
    if (ctx && carKind(S.hist, ctx, num, t).kind === "pit") pitStart = speed <= PIT.still ? "queue" : "go";
    const inRun = pr.off > -3 && pr.off < 40;
    out.set(num, { num, team, x, z, u: inRun ? pr.u : null, off: pr.off, input: { u: inRun ? pr.u : null, gStart: G.gStart, gEnd: G.gEnd, inPit, onLane, speed, stillFor, boxU: tm?.box ?? null, boxFrom: tm ? (tm.link === "order" ? "order" : "stops") : null, penalty: pen.get(num) || null, timePen: timePen.get(num) || 0, pitStart, race: isRace, retired: S.hist.flagAt(num, "Retired", t) || S.hist.flagAt(num, "Stopped", t), teammateInBox: false, lastBox, boxTol: tolOf.get(team) } });
  }
  for (const r of out.values()) r.state = pitState(r.input);
  // (a teammate in the box – or still pulling out of it – and this car standing or creeping up behind: a double stack)
  for (const r of out.values()) if (r.input.speed < PIT.creep && [...out.values()].some((o) => o !== r && o.team === r.team && (o.state.state === "in box" || o.state.state === "leaving box") && o.u != null && r.u != null && o.u > r.u + 2)) { r.input.teammateInBox = true; r.state = pitState(r.input); }
  for (const r of out.values()) {
    if (r.u == null) continue;
    const at = m.at(r.u), want = laneOffsetOf(r.state, at, r.off, r.u, G.gStart, G.gEnd);
    // the way across changing along the lane: the heading turns by it (pulling into / out of the box)
    const ahead = laneOffsetOf(pitState({ ...r.input, u: r.u + 1 }), m.at(r.u + 1), r.off, r.u + 1, G.gStart, G.gEnd);
    const inRun = Math.min(ss01((r.u - (G.gStart - PIT.ends)) / PIT.ends), ss01(((G.gEnd + PIT.ends) - r.u) / PIT.ends));
    Object.assign(r, { at, want, turn: Math.atan2(ahead - want, 1), inRun });
  }
  return out;
}
const pitCost = { ms: 0, frames: 0 };
// the nearest point of the measured pit path to (x, z): { x, z, d, tx, tz (the way cars go along it there) }
function nearestOnPath(x, z) {
  const P = world.pitLane?.pts; if (!P) return null;
  let best = null;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez; if (!l2) continue;
    const f = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2)), px = a.x + ex * f, pz = a.z + ez * f, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) { const l = Math.sqrt(l2); best = { x: px, z: pz, d, tx: ex / l, tz: ez / l }; }
  }
  return best;
}
const ss01 = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
// Draws car c (at v, heading c.yaw) as its pit state says: across the lane, on the lane's surface, turned along it
function pitDraw(c, r, v) {
  c.pit = r; if (r.u == null || r.want == null) return;
  const G = pitTeams.G, s = r.at.slot, d = r.want - r.off;
  // from the raw position (r.x, r.z: the feed's, where r.off was measured), moved across to where its state puts it
  v.x = r.x - s.inward[0] * d; v.z = r.z - s.inward[1] * d;
  // on the lane's surface in front of the garages, easing to the ground the entry / exit roads lie on
  v.y = v.y + (r.at.floor + 0.004 - v.y) * r.inRun;
  // standing, along the lane; moving across, turned by the slope of the way across
  if (c.speed < 6 || r.turn) {
    // (the way along: the measured pit path's – from the entry to the exit; the heading before a seek can be anything)
    const ax = s.along[0], az = s.along[1], q = nearestOnPath(r.x, r.z), fwd = q && q.d < 25 ? (ax * q.tx + az * q.tz >= 0 ? 1 : -1) : Math.sin(c.yaw) * ax + Math.cos(c.yaw) * az >= 0 ? 1 : -1;
    const ox = -s.inward[0], oz = -s.inward[1], k = Math.sin(r.turn * fwd), cs = Math.cos(r.turn);
    const fx = ax * fwd * cs + ox * k, fz = az * fwd * cs + oz * k;
    c.yaw = Math.atan2(fx, fz);
  }
}
// The crews (crew.js), each team's from its cars' states (pitstate.js crewPhase): round its car in the box (work);
// standing back by the garage (a stop-and-go: hold); out at the box while a car of the team comes to it (ready); walking
// back after it left (back); else in the garage (not drawn). Positions in the box's frame: the car's own when it is
// there, else the box's place along the lane, facing the way the cars go.
// What the work is (pitstate.js stopPlan, by the viewer's choice – pitWorkPolicy): a tyre change the record shows (or
// a typical one, if asked for) is played on the stop's own clock – seconds since the car stood, from its positions, so
// a seek, a pause or another speed shows the same moment the same way – lifting the car a few centimetres (its model
// only: the car's place, the timing and the cameras' mounts are the car's own, and the cockpit cameras ride the lifted
// car as drawn) and taking its wheels off and on (its own wheel groups hidden while a wheel is off; the wheels in the
// crew's hands are copies of the car's). Anything else: the crew round the car, nothing played.
// 2026 active aero, estimated (the feed has nothing about it): only if the viewer leaves it on, and never where the FIA
// locked the cars in corner mode for the weekend – Monaco 2026 (formula1.com, 4 June 2026: "effectively locked in
// Corner Mode for the entire Monte Carlo weekend"). The real straight-mode zones are set circuit by circuit and not
// in the data, so the flaps open on any fast straight: a look, not the car's state.
function aero2026Allowed() {
  if (geoSettings().aero === "off") return false;
  const A = app(), v = venueOf({ circuitKey: A?.circuitKey?.(), location: A?.location?.() });
  return !aeroLocked(v?.key, A?.sessionYear?.() || 0);
}
function pitWorkPolicy() {
  const v = geoSettings().pitWork || "record", live = !!app()?.src?.isLive;
  return live && v === "record" ? "observed" : v;
}
const liftedCars = new Set();
function pitPlanFor(num, src, policy, { t0, t1 = null, input }) {
  const tyres = src.tyreChanges?.(num) || [];
  const stop = (policy === "record" ? src.pitStops?.(num, Infinity) : src.pitStops?.(num)) || [];
  const rec = stop.find((x) => x.stop && x.ms >= t0 && x.ms <= t0 + 120000);
  return stopPlan({ t: app().t, t0, t1, tyres, stopTime: rec?.stop ?? null, penalty: input?.penalty || null, timePen: input?.timePen || 0, policy });
}
function updateCrews(frame) {
  const G = pitTeams.G;
  // (the cars lifted and their wheels taken off last frame: back as they are unless still at work)
  const was = new Set(liftedCars); liftedCars.clear();
  const done = () => { for (const num of was) if (!liftedCars.has(num)) { const c = cars.get(num); if (c) restoreCar(c); } };
  if (!G || !world || !frame) { world?.crews?.clear(); done(); pitWorkNote(null); return; }
  if (!world.crews) { world.crews = crewMeshes(); world.group.add(world.crews.group); }
  const A = app(), src = A.src, m = pitModelFor(G), drivers = src?.state.DriverList || {}, list = [], loose = [], byTeam = new Map();
  const policy = pitWorkPolicy();
  let shown = null;
  for (const r of frame.values()) if (r.team) { const a = byTeam.get(r.team) || []; a.push({ num: r.num, state: r.state, u: r.u, boxU: r.input.boxU, lastBox: r.input.lastBox, stillFor: r.input.stillFor, input: r.input }); byTeam.set(r.team, a); }
  for (const [team, cs] of byTeam) {
    const ph = crewPhase(cs); if (ph.phase === "none" || ph.f <= 0.01) continue;
    const tm = pitTeams.teams?.find((q) => q.team === team); if (tm?.box == null) continue;
    const colour = "#" + (Object.values(drivers).find((d) => d?.TeamName === team)?.TeamColour || "9aa0a6");
    const at = m.at(tm.box), s = at.slot, c = ph.phase === "work" ? cars.get(ph.num) : null;
    const bx = s.front[0] + s.along[0] * (tm.box - s.uc) - s.inward[0] * at.boxC, bz = s.front[1] + s.along[1] * (tm.box - s.uc) - s.inward[1] * at.boxC;
    // (no car there: the box's frame faces the way the cars go – along the measured pit path)
    const q = c ? null : nearestOnPath(bx, bz), rev = q && q.d < 25 && s.along[0] * q.tx + s.along[1] * q.tz < 0;
    const yaw = c ? c.yaw : Math.atan2(rev ? -s.along[0] : s.along[0], rev ? -s.along[1] : s.along[1]);
    const where = c ? { x: c.pos.x, y: at.floor + 0.004, z: c.pos.z, yaw } : { x: bx, y: at.floor + 0.004, z: bz, yaw };
    // (the layouts are written with the garages on the car's left: mirrored otherwise)
    const left = Math.sign(Math.cos(yaw) * s.inward[0] - Math.sin(yaw) * s.inward[1]) || 1;
    // the work at this stop: the car in the box (work), the one coming (ready – its stop ahead, the record only), the
    // one gone (back)
    const me = cs.find((x) => x.num === ph.num), trk = src?.tracks?.cars?.[ph.num];
    let plan = null, t0 = null;
    if (me && trk && ph.phase !== "hold") {
      if (ph.phase === "work") { t0 = A.t - (ph.since || 0) * 1000; plan = pitPlanFor(ph.num, src, policy, { t0, t1: policy === "record" ? standEndPos(trk, A.t) : null, input: me.input }); }
      else if (ph.phase === "back" && me.lastBox?.t0 != null) { t0 = me.lastBox.t0; plan = pitPlanFor(ph.num, src, policy, { t0, t1: me.lastBox.t1, input: me.input }); }
      else if (ph.phase === "ready" && policy !== "observed") { t0 = policy === "record" ? nextStandPos(trk, A.t) : null; plan = t0 != null ? pitPlanFor(ph.num, src, policy, { t0, input: me.input }) : policy === "typical" ? { kind: "tyres", from: "typical", D: null, wait: 0, compound: null } : null; }
    }
    if (plan?.kind === "tyres") {
      const car = cars.get(ph.num), dims = wheelParts(A.sessionYear?.() || null, team);
      world.crews.wheels(dims);
      const oldC = (src.stints?.(ph.num) || []).slice(-1)[0]?.Compound, bands = { old: TYRE_COLOURS[oldC] || null, new: TYRE_COLOURS[plan.compound] || null };
      let L;
      if (ph.phase === "work") {
        L = stopChoreo(plan, ph.since || 0, dims, left);
        if (car && c) { applyLift(car, L.car, dims); liftedCars.add(ph.num); if (plan.compound && L.car.off.every((o) => !o) && stopClockDone(plan, ph.since)) setCompound(car.model, plan.compound); }
      } else L = changeWalk(ph.phase, ph.f, dims, at.boxC, left);
      list.push(...crewAt(where, L.figures, colour));
      loose.push(...kitAt(where, L.kits, bands));
      shown = shown || plan.from;
      continue;
    }
    list.push(...crewAt(where, crewLayout(ph.phase, ph.f, at.boxC, left), colour));
  }
  world.crews.place(list, loose, camera.position);
  done();
  pitWorkNote(shown === "record" ? "타이어 교체: 경기 기록(정차 뒤 공개된 새 타이어)으로 재현 · 동작은 일반적인 피트 스톱" : shown === "typical" ? "타이어 교체: 전형적인 피트 스톱을 재현한 추정(실제 작업은 모름)" : null);
}
// (the new set's compound shown on the car once every wheel is back on)
function stopClockDone(plan, since) { return (since || 0) >= (plan.wait || 0) + (CHANGE.on[1] + 0.1) * (plan.D != null && plan.D - (plan.wait || 0) < CHANGE.base ? Math.max(0.6, (plan.D - (plan.wait || 0)) / CHANGE.base) : 1); }
// The car's model lifted by the jacks (front and rear, m: the model's height and pitch over its place – the car's
// place, timing and the camera's mounts stay the car's) and its wheels hidden while they are off (crew.js draws them)
function applyLift(c, vis, dims) {
  const [lf, lr] = vis.lift, u = c.model.userData;
  c.model.position.y = (lf + lr) / 2;
  c.model.rotation.x -= Math.atan2(lf - lr, dims.FZ - dims.RZ);
  u.wheels.forEach((w, i) => { w.visible = !vis.off[i]; });
  c.lifted = true;
}
function restoreCar(c) {
  if (!c.lifted) return;
  c.model.position.y = 0; c.model.userData.wheels.forEach((w) => { w.visible = true; }); c.lifted = false;
}
function pitWorkNote(text) {
  let el = document.getElementById("pitWorkNote");
  if (!el && text) { el = document.createElement("div"); el.id = "pitWorkNote"; el.style.cssText = "position:absolute;left:12px;bottom:62px;padding:3px 8px;border-radius:6px;background:rgba(14,16,19,.72);color:#cfd6dd;font-size:11px;pointer-events:none;z-index:3"; host?.appendChild(el); }
  if (el) { if (el.textContent !== (text || "")) el.textContent = text || ""; el.hidden = !text; }
}
// the pit lane's direction at (x, z) – the way the cars go – if that's in front of a facility's garages (0–16 m out),
// else null
function pitLaneDir(x, z) {
  let out = null;
  world?.real?.group.getObjectByName("facilities")?.traverse((o) => {
    const G = o.userData?.garages; if (out || !G) return;
    const p = G.project(x, z);
    if (p.off > -1 && p.off < 16 && p.u > G.gStart - 10 && p.u < G.gEnd + 10) out = G.slots[0].along;
  });
  // (turned the way the cars go: the measured pit path runs from the entry to the exit – a heading kept from before
  // a seek can be the other way round)
  const q = out && nearestOnPath(x, z);
  if (q && q.d < 25 && out[0] * q.tx + out[1] * q.tz < 0) out = [-out[0], -out[1]];
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
  if (world.real) { world.group.remove(world.real.group); disposeReal(world.real); world.real = null; world.occluders = []; releaseShadowRefs(); }
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

// The sky: by night a gradient behind everything; by day a sky all round (equirectangular, so it turns with the view
// and the horizon stays level): deeper blue overhead, paler to a hazy horizon in the fog's colour, with soft fair-weather
// clouds – a look, not the session's weather (the feed has none for clouds). The cars reflect the same sky.
function dayPixels(W, H, ground) {
  const img = new ImageData(W, H), d = img.data;
  // value noise, a few octaves (fixed seed: the same sky every time)
  const P = new Uint8Array(512); { let a = 1337; for (let i = 0; i < 256; i++) P[i] = i; for (let i = 255; i > 0; i--) { a = (a * 16807) % 2147483647; const j = a % (i + 1); [P[i], P[j]] = [P[j], P[i]]; } for (let i = 0; i < 256; i++) P[256 + i] = P[i]; }
  const hash = (x, y) => P[(P[x & 255] + y) & 255] / 255, fade = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi); const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), e = hash(xi + 1, yi + 1); return a + (b - a) * xf + (c - a) * yf + (a - b - c + e) * xf * yf; };
  const top = [61, 111, 174], mid = [143, 179, 214], hor = [201, 217, 232], grd = [74, 82, 70];
  for (let y = 0; y < H; y++) {
    const el = (0.5 - (y + 0.5) / H) * Math.PI;   // elevation
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      let r, g, b;
      if (el < 0) { const k = Math.min(1, -el / 0.15); [r, g, b] = ground ? hor.map((v, i) => v + (grd[i] - v) * k) : hor; }
      else {
        const t = Math.pow(el / (Math.PI / 2), 0.55);
        [r, g, b] = t < 0.45 ? hor.map((v, i) => v + (mid[i] - v) * (t / 0.45)) : mid.map((v, i) => v + (top[i] - v) * ((t - 0.45) / 0.55));
        // clouds on a layer overhead: the azimuth and elevation onto a plane (squashed towards the horizon)
        if (el > 0.02) {
          const az = (x / W) * Math.PI * 2, dd = 1 / Math.tan(el), px = Math.cos(az) * dd * 3, py = Math.sin(az) * dd * 3;
          let n = 0, amp = 0.5, f = 1; for (let k = 0; k < 5; k++) { n += noise(px * f + 11, py * f + 7) * amp; amp *= 0.5; f *= 2.03; }
          const cover = Math.max(0, Math.min(1, (n - 0.52) * 3.2)) * Math.min(1, el / 0.12) * Math.max(0, 1 - dd / 40);
          const lit = 238 - (1 - n) * 40;
          r += (lit - r) * cover; g += (lit + 2 - g) * cover; b += (lit + 6 - b) * cover;
        }
      }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  return img;
}
function skyTexture(night = false) {
  const c = document.createElement("canvas");
  if (!night) {
    c.width = 2048; c.height = 1024; c.getContext("2d").putImageData(dayPixels(2048, 1024, false), 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  }
  c.width = 4; c.height = 256;
  const g = c.getContext("2d").createLinearGradient(0, 0, 0, 256);
  // a city's night sky: near black overhead, the glow of its lights low down (warm, from sodium and LED haze)
  g.addColorStop(0, "#03050a"); g.addColorStop(0.45, "#0a0f1a"); g.addColorStop(0.75, "#171a26"); g.addColorStop(0.92, "#2b2730"); g.addColorStop(1, "#3a3034");
  const ctx = c.getContext("2d"); ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// What the cars reflect: by day that sky over ground below the horizon, by night the night reflections (shared by every
// car: never freed with one).
let dayCarEnv = null;
function carEnvironment(night) {
  if (night) return nightEnvironment();
  if (dayCarEnv) return dayCarEnv;
  const c = document.createElement("canvas"); c.width = 512; c.height = 256; c.getContext("2d").putImageData(dayPixels(512, 256, true), 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  dayCarEnv = pm.fromEquirectangular(t).texture; dayCarEnv.userData.shared = true;
  pm.dispose(); t.dispose();
  return dayCarEnv;
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
  nightEnv = pm.fromEquirectangular(t).texture; nightEnv.userData.shared = true;
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
    const nor = new THREE.Vector3(-tan.z, 0, tan.x);          // right of travel (x east, z south)
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
  // (the pit lane, as measured – startdata.js –, widened to the lane's width: no generated wall across it)
  const A0 = app(), pd0 = START_DATA[venueOf({ circuitKey: A0.circuitKey?.(), location: A0.location?.() })?.key]?.pit;
  const laneZone = pd0 ? laneCells(pd0.path.map((p) => [p[0] * DM - center.x, -(p[1] * DM - center.z)]), 8) : null;
  const syn = { walls: style.street ? streetWalls(samples, grid) : walls(samples, grid, 12, 1.1, undefined, 0, laneZone) };
  world0Level = Math.min(...samples.map((s) => s.p.y)) - 2.5;
  syn.terrain = terrain(samples, grid, box);
  syn.trees = trees(grid, box);
  syn.walls.name = "syntheticWalls"; group.add(syn.walls, syn.terrain, syn.trees);
  road.receiveShadow = true; kerb.traverse((o) => { o.receiveShadow = true; }); lines.traverse((o) => { o.receiveShadow = true; });
  syn.terrain.receiveShadow = true; syn.walls.traverse((o) => { o.castShadow = true; }); syn.trees.traverse((o) => { o.castShadow = true; });
  const lowY = Math.min(...samples.map((s) => s.p.y));
  const far = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshStandardMaterial({ color: 0x4f7a3c, roughness: 1 }));
  far.rotation.x = -Math.PI / 2; far.position.y = lowY - 3;   // below the lowest point of the track
  group.add(far);
  scene.add(group);
  scene.fog.near = Math.max(size.x, size.z) * 0.6;
  scene.fog.far = Math.max(size.x, size.z) * 3.2;
  const frame = trackFrame({ samples, grid });
  return { group, samples, grid, frame, center, size, box, n, lap, syn, laneZone, far, kerbMark: samples.kerbMark, street: !!style.street, width: samples.reduce((a, s) => a + (s.L - s.R), 0) / samples.length, farBase: far.material.color.clone(), road, lines, kerb };
}

// Where the edges of the tarmac are, from where every car drove in the session: per ~10 m of track, the
// spread of the cars' sideways offsets from the lap line. The spread is cut where a gap of 2.5 m opens
// (a pit lane behind a wall is a separate cluster), the outermost 1 % are dropped (a trip over the
// run-off), and a metre is added for half a car. Sets s.L (left edge, +) and s.R (right edge, −) on every
// sample; stretches without enough data keep the circuit's usual width, centred on the lap line.
// (Positions on the circuit's measured pit lane path – startdata.js – are the pit lane, not the track: left out. Where
// the lane runs beside the track, cars leaving and joining it filled the 2.5 m gap and the lane was taken for tarmac –
// Barcelona's main straight came out wide enough to reach past the pit lane's own line.)
function measureWidth(samples, grid, center) {
  const n = samples.length, B = 5, nb = Math.ceil(n / B), half = TRACK_W / 2;
  const lat = Array.from({ length: nb }, () => []);
  const pts = app().carPoints?.() || [];
  const A = app(), pd = START_DATA[venueOf({ circuitKey: A.circuitKey?.(), location: A.location?.() })?.key]?.pit;
  const inLane = pd ? laneCells(pd.path.map((p) => [p[0] * DM - center.x, -(p[1] * DM - center.z)])) : () => false;
  let dropped = 0;
  for (const p of pts) {
    const x = p[0] * DM - center.x, z = -(p[1] * DM - center.z), y = (p[2] || 0) * DM - center.y;
    if (inLane(x, z)) { dropped++; continue; }
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
  samples.pitDropped = dropped;
}
const ROAD_LIFT = 0.06;   // the asphalt over the lap line (roadMesh); cars and paint sit on it
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
// Close up, the tarmac's own grain: stones a few mm across, as a normal map 0.5 m to a tile on a second uv set (the
// colour's 6 m tile and this one don't line up, so neither repeat shows). A data map: no sRGB. (Measured: a 512² normal
// and roughness pair at anisotropy 8 over the road doubled the onboard camera's 95th-percentile frame time.)
let roadGrain = null;
function roadGrainMaps() {
  if (roadGrain) return roadGrain;
  const n = 256, h = new Float32Array(n * n), r = (() => { let a = 99; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
  // stones: little domes of 3–9 mm (0.5 m over 256 px: 2 mm a pixel), wrapping round the tile
  for (let k = 0; k < 4200; k++) {
    const cx = r() * n, cy = r() * n, rad = 0.8 + r() * 2.2, ht = 0.5 + r() * 0.5;
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      const d = Math.hypot(x - cx, y - cy) / rad; if (d >= 1) continue;
      const i = ((y + n) % n) * n + ((x + n) % n); h[i] = Math.max(h[i], ht * Math.sqrt(1 - d * d));
    }
  }
  const cn = document.createElement("canvas"); cn.width = cn.height = n;
  const gn = cn.getContext("2d"), dn = gn.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, dx = h[y * n + (x + 1) % n] - h[y * n + (x - 1 + n) % n], dy = h[((y + 1) % n) * n + x] - h[((y - 1 + n) % n) * n + x];
    const len = Math.hypot(dx, dy, 1), o = i * 4;
    dn.data[o] = 128 - (dx / len) * 127; dn.data[o + 1] = 128 - (dy / len) * 127; dn.data[o + 2] = 128 + (1 / len) * 127; dn.data[o + 3] = 255;
  }
  gn.putImageData(dn, 0, 0);
  const t = new THREE.CanvasTexture(cn); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; t.channel = 1; t.userData.shared = true;
  roadGrain = { normal: t };   // (kept for every circuit: never freed with one)
  return roadGrain;
}
function roadMesh(samples) {
  const lanes = [0, 0.08, 0.22, 0.38, 0.5, 0.62, 0.78, 0.92, 1], K = lanes.length;
  const pos = [], col = [], uv = [], uv1 = [], idx = [], c = new THREE.Color();
  let dist = 0;
  samples.forEach((s, i) => {
    if (i) dist += s.p.distanceTo(samples[i - 1].p);
    const L = edgeOf(s, 1), R = edgeOf(s, -1), M = s.M ?? 0;
    uv1.push(...lanes.flatMap((f) => [(L + (R - L) * f) / 0.5, dist / 0.5]));
    for (const f of lanes) {
      const off = L + (R - L) * f;
      pos.push(s.p.x + s.nor.x * off, s.p.y + ROAD_LIFT, s.p.z + s.nor.z * off);
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
  g.setAttribute("uv1", new THREE.Float32BufferAttribute(uv1, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const gm = roadGrainMaps();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: asphaltTexture(), roughness: 0.92, normalMap: gm.normal, normalScale: new THREE.Vector2(0.5, 0.5), metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
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
  const pos = [], col = [], idx = [], uv = [];
  const red = new THREE.Color(0xd8262b), white = new THREE.Color(0xf4f4f4), green = new THREE.Color(0x2f7d4f);
  // one band beside the edge on side sd, from offset o0 to o1 beyond the edge, lifted lip0 → lip1
  const band = (on, o0, o1, lip0, lip1, colourOf) => {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, sd = on[i];
      if (!sd || on[j] !== sd) continue;
      const v = pos.length / 3, c = colourOf(i);
      for (const [k, s] of [[0, samples[i]], [1, samples[j]]]) for (const [o, lift] of [[o0, lip0], [o1, lip1]]) {
        const off = edgeOf(s, sd) + sd * o;
        pos.push(s.p.x + s.nor.x * off, s.p.y + 0.07 + lift, s.p.z + s.nor.z * off); col.push(c.r, c.g, c.b);
        uv.push((i + k) / 0.25, o / 1.4);   // (ridges every 25 cm across the kerb – samples are ~1 m apart)
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
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));   // lit as flat ground
  g.setIndex(idx);
  // the kerb's ridges across it (a normal map: one rounded ridge per tile) and its paint a little worn
  const rc = document.createElement("canvas"); rc.width = 64; rc.height = 4; const rg = rc.getContext("2d"), rd = rg.createImageData(64, 4);
  for (let x = 0; x < 64; x++) { const a = Math.sin((x / 64) * Math.PI * 2) * 0.55; for (let y = 0; y < 4; y++) { const o = (y * 64 + x) * 4; rd.data[o] = 128 + a * 127; rd.data[o + 1] = 128; rd.data[o + 2] = 128 + Math.sqrt(1 - a * a) * 127; rd.data[o + 3] = 255; } }
  rg.putImageData(rd, 0, 0);
  const ridge = new THREE.CanvasTexture(rc); ridge.wrapS = ridge.wrapT = THREE.RepeatWrapping; ridge.colorSpace = THREE.NoColorSpace; ridge.anisotropy = 8;
  const km = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, normalMap: ridge, normalScale: new THREE.Vector2(0.8, 0.8), polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide });
  km.userData.ownedTextures = [ridge];
  // (normal maps need tangents along the uvs: three.js derives them in the shader from the uv's screen derivatives)
  const m = new THREE.Mesh(g, km);
  const grp = new THREE.Group(); grp.add(m);
  return grp;
}

// Low barriers 12 m off each edge, left out where they'd cut across another part of the track.
// (x, z) → whether a generated wall there is in one of the openings: within len/2 along the track of the opening's
// point, on its side
function wallOpenings(w, geo, list) {
  const n = w.samples.length, step = w.samples[0].p.distanceTo(w.samples[1].p);
  const op = list.map((o) => { const [x, z] = geo.fromLL(o.ll[0], o.ll[1]), [s] = w.grid.nearest(x, z, 4); if (!s) return null; return { i: s.i, half: o.len / 2 / step, side: Math.sign((x - s.p.x) * s.nor.x + (z - s.p.z) * s.nor.z) || 1 }; }).filter(Boolean);
  return (x, z) => { const [s] = w.grid.nearest(x, z, 2); if (!s) return false; const l = Math.sign((x - s.p.x) * s.nor.x + (z - s.p.z) * s.nor.z); return op.some((o) => { const d = Math.abs(((s.i - o.i) % n + n + n / 2) % n - n / 2); return d <= o.half && l === o.side; }); };
}
// Street circuit barriers: a concrete wall about a metre from the edge with a debris fence on top.
function streetWalls(samples, grid, gap = null) {
  const g = new THREE.Group();
  g.add(walls(samples, grid, 1.4, 1.2, [0xc9ccd0, 0xe4e6e8], 0, null, gap));
  const fence = walls(samples, grid, 1.6, 4.2, [0x8d969e, 0x8d969e], 1.2, null, gap);
  fence.material = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.5, metalness: 0.5, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  g.add(fence);
  return g;
}

// A barrier `extra` metres beyond each edge of the track, `h` high (from `y0` above the road), two-tone.
// (inLane: the circuit's pit lane – a wall whose run-off would cross it isn't drawn there: along a straight with the
// pit lane beside it the barrier on that side is the pit wall at the track's edge, the pit building's – facilities.js;
// 12 m out it had stood across the pit lane, in front of the boxes)
// (gap: where the venue's other tarmac meets the track – an escape road's mouth: no barrier across it, only there)
function walls(samples, grid, extra = 12, h = 1.1, tones = [0x5d636b, 0xd9dde2], y0 = 0, inLane = null, gap = null) {
  const pos = [], col = [], idx = [];
  const offOf = (s, side) => edgeOf(s, side) + side * extra;
  const crossesLane = (s, side) => { if (!inLane) return false; for (let o = 1; o <= extra + 2; o += 1) { const d = edgeOf(s, side) + side * o; if (inLane(s.p.x + s.nor.x * d, s.p.z + s.nor.z * d)) return true; } return false; };
  // blocked when the barrier point would sit on (or right next to) a different stretch of the track
  const blocked = (x, z, s) => {
    const [near, d] = grid.nearest(x, z, 1);
    if (!near || d > Math.max(edgeOf(near, 1), -edgeOf(near, -1)) + 4) return false;
    const di = Math.abs(near.i - s.i);
    return Math.min(di, samples.length - di) > 20;
  };
  for (const side of [1, -1]) {
    const ok = samples.map((s) => { const o = offOf(s, side), x = s.p.x + s.nor.x * o, z = s.p.z + s.nor.z * o; return !blocked(x, z, s) && !crossesLane(s, side) && !gap?.(x, z); });
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
  // (the model is chosen by season and team – the car of that year –, its paint by the team's colours)
  const season = app().sessionYear?.() || null, color = "#" + (d.TeamColour || "888888"), key = `${color}|${d.TeamName || ""}|${season}`;
  if (c && c.key === key) return c;
  if (c) { scene.remove(c.obj); disposeGroup(c.obj); releaseShadowRefs(); }
  const obj = new THREE.Group();
  // (the event's date: a team's car changed during the season – carshapes.js)
  const date = /\d{4}-\d\d-\d\d/.exec(app().src?.state.SessionInfo?.Path || "")?.[0] || null;
  const model = makeCar({ teamName: d.TeamName, teamColour: d.TeamColour, number: num, season, date });
  if (nightNow) setCarEnvironment(model, carEnvironment(true), 0.6);
  { const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5.8), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; model.add(sh); }
  if (nightNow) lightCar(model, true);
  // cars don't go into the (static) shadow map; the soft contact shadow under each car does the job
  obj.add(model);
  const label = labelSprite(); obj.add(label.sp);
  scene.add(obj);
  c = { num, obj, model, label, color, key, yaw: 0, pitch: 0, roll: 0, speed: 0, spin: 0, aero: 0, pos: new THREE.Vector3(), has: false, sample: null };
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

const pitTmp = {}, posBuf = {}, velBuf = {}, vTmp = new THREE.Vector3(), P0 = [0, 0, 0], PA = [0, 0, 0], PB = [0, 0, 0], DIR = [0, 0];
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
  // (cars still drawn in their grid columns – standing, or easing out of them after the start – are apart already:
  // no room-making between them, which pushed one into the other column)
  const held = (num) => { const g = cars.get(num)?.grid; return !!g && g.state !== "free" && (g.across ?? 0) > 0.15; };
  for (const A of list) for (const B of list) {
    if (A === B || held(A.num) || held(B.num)) continue;
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
// ---------- cars on the grid ----------
// What the field looks like at time t from the data up to t only (cached per 250 ms, shared by every car): the raw
// positions on the lap line (s, d), who is standing (telemetry speed ≤ 2 km/h now and a second ago; without telemetry,
// moved < 1.5 m in 2 s), before or after the start, and who is in which slot (grid.js assignSlots).
// Before the start: replays – the moment the race clock first runs (lights out); live – the clock not yet running
// and no lap counted.
const gridFields = new Map();
let gridFieldsFor = null;
function preStartAt(src, t) {
  if (!src.isLive) return t < (src._startT ??= src.startTime());
  const clk = src.state.ExtrapolatedClock, lap = +(src.state.LapCount?.CurrentLap || 0);
  return !clk?.Extrapolating && lap <= 1 && !(src.state.TimingData?.Lines && Object.values(src.state.TimingData.Lines).some((l) => +l.NumberOfLaps > 0));
}
function fieldAt(src, t) {
  const key = Math.round(t / 250);
  if (gridFieldsFor !== src || gridFieldsFor?._w !== world) { gridFields.clear(); gridFieldsFor = src; src._w = world; }
  let f = gridFields.get(key);
  if (f) return f;
  if (gridFields.size > 400) for (const k of gridFields.keys()) if (Math.abs(k - key) > 160) gridFields.delete(k);
  const T = key * 250, F = world.frame, c0 = world.center, now = src.positionsAt(T), before = src.positionsAt(T - 2000);
  const appLines = src.state.TimingAppData?.Lines || {}, lines = src.state.TimingData?.Lines || {};   // (the published grid doesn't change during the race; the order is the current one)
  const cars = [];
  for (const [num, p] of Object.entries(now)) {
    const x = p[0] * DM - c0.x, z = -(p[1] * DM - c0.z), pr = F.project(x, z);
    if (!pr) continue;
    const tel = src.carAt?.(num, T), tel1 = src.carAt?.(num, T - 1000), q = before[num];
    // (on the pit lane's path – a queue there beside the grid – is not on the track, whatever its offset)
    const inPitLane = !!world.pitLane && onPitPath(world.pitLane.pts, world.pitLane.cum, x, z) != null;
    const standing = tel && tel1 ? tel.speed <= 2 && tel1.speed <= 2 : !!q && Math.hypot(p[0] - q[0], p[1] - q[1]) * DM < 1.5;
    const half = Math.max(edgeOf(pr.sample, 1), -edgeOf(pr.sample, -1));
    cars.push({ num, s: pr.s, d: pr.d, standing, onTrack: Math.abs(pr.d) <= half + 1 && !inPitLane, gridPos: +(appLines[num]?.GridPos || 0), position: +(lines[num]?.Position || 0) });
  }
  const preStart = preStartAt(src, T), m = world.gridModel;
  const assign = assignSlots(cars.filter((c) => c.onTrack), { ...m, slots: m.slots.size }, F.L, preStart);
  f = { t: T, preStart, cars: new Map(cars.map((c) => [c.num, c])), assign };
  gridFields.set(key, f);
  return f;
}
function gridContext(src, t, sm) { return { src, t, sm, field: fieldAt(src, t) }; }
const gTmp = [0, 0, 0];
// Car `num`, drawn at v (its place from the smoothed tracks) with heading c.yaw: moved into its slot as far as
// gridWeight says. Standing or arriving: towards the slot itself. Leaving: the offset it had standing in the slot
// (slot − where the tracks had it then), let go as it drives off – so it moves exactly when the data has it moving.
function gridCar(c, num, v, ctx) {
  const m = world.gridModel, F = world.frame, L = F.L, f = ctx.field, me = f.cars.get(num);
  if (!me) return;
  let a = f.assign.get(num), w = null, off = null;
  if (a && me.onTrack && me.standing) {
    w = gridWeight({ delta: a.delta, standing: true, preStart: f.preStart, speed: 0, driven: null });
    if (w.state === "standing") { const sl = m.slots.get(a.g); if (sl) off = [sl.x - v.x, sl.z - v.z, sl]; }
  }
  // (only near the grid: from the last slot to 130 m past pole's)
  let u1 = me.s - m.slots.get(1).s; u1 = ((u1 % L) + L * 1.5) % L - L / 2;
  const nearGrid = u1 < 130 && u1 > -(m.pitch * m.slots.size + 10);
  if (!off && !me.standing && nearGrid) {
    // did it stand in its slot a moment ago? (back over up to 25 s, until it is 120 m further back than now)
    const memo = c.gridLeave;
    let res = memo && Math.abs(memo.t - ctx.t) < 300 ? memo.res : undefined;
    if (res === undefined) {
      res = null;
      for (let tau = ctx.t - 250; tau > ctx.t - 25000; tau -= 250) {
        const g = fieldAt(ctx.src, tau), was = g.cars.get(num);
        if (!was) break;
        let dr = me.s - was.s; dr = ((dr % L) + L * 1.5) % L - L / 2;
        if (dr > 125 || dr < -5) break;
        const at = g.assign.get(num);
        if (was.standing && at && Math.abs(at.delta) <= ASSIGN_TOL[at.by === "gridPos" ? "gridPos" : "order"]) {
          const sl = m.slots.get(at.g), st0 = ctx.sm?.state(num, g.t, {});
          if (!sl || !st0) break;
          F.at(st0.s, st0.d, gTmp);
          res = { g: at.g, by: at.by, sStand: was.s, off: [sl.x - gTmp[0], sl.z - gTmp[2]], sl, tau: g.t };
          break;
        }
      }
      c.gridLeave = { t: ctx.t, res };
    }
    if (res) {
      let driven = me.s - res.sStand; driven = ((driven % L) + L * 1.5) % L - L / 2;
      const wl = gridWeight({ delta: NaN, standing: false, preStart: f.preStart, speed: c.speed, driven });
      if (wl.state === "leaving") { w = wl; off = [res.off[0], res.off[1], res.sl]; a = { g: res.g, by: res.by, delta: driven }; }
    }
  }
  if (!off && a && me.onTrack && f.preStart && nearGrid) {
    // rolling up to its slot before the start
    w = gridWeight({ delta: a.delta, standing: false, preStart: true, speed: c.speed, driven: null });
    if (w.state === "arriving") { const sl = m.slots.get(a.g); if (sl) off = [sl.x - v.x, sl.z - v.z, sl]; }
  }
  if (!off || !w || w.state === "free") { c.grid = a ? { g: a.g, by: a.by, delta: +a.delta.toFixed(1), standing: me.standing, state: "free" } : null; return; }
  const sl = off[2], da = off[0] * sl.tx + off[1] * sl.tz, dc = off[0] * sl.nx + off[1] * sl.nz;
  // standing: in the slot's own axes; arriving and leaving: along and across the track where the car is now (on a
  // curved grid – Monaco's – the slot's axes turn away from the road within metres), kept on the tarmac
  const cs = w.state === "standing" ? null : c.sample;
  const tx = cs ? cs.tan.x : sl.tx, tz = cs ? cs.tan.z : sl.tz, nx = cs ? cs.nor.x : sl.nx, nz = cs ? cs.nor.z : sl.nz;
  v.x += tx * da * w.along + nx * dc * w.across;
  v.z += tz * da * w.along + nz * dc * w.across;
  if (cs) {
    const lat = (v.x - cs.p.x) * cs.nor.x + (v.z - cs.p.z) * cs.nor.z, lo = (cs.R ?? -7) + 0.95, hi = (cs.L ?? 7) - 0.95;
    const cl = Math.max(lo, Math.min(hi, lat)) - lat;
    if (cl) { v.x += cs.nor.x * cl; v.z += cs.nor.z * cl; }
  }
  // heading: the slot's (standing) or the path's turned by the sideways easing (arriving, leaving)
  if (w.state === "standing") c.yaw = sl.yaw;
  else c.yaw = wrap(c.yaw + (w.state === "arriving" ? wrap(sl.yaw - c.yaw) * w.across : 0) - Math.atan(dc * w.dAcross));
  c.grid = { g: a.g, by: a.by, delta: +a.delta.toFixed(1), standing: me.standing, state: w.state, along: +w.along.toFixed(2), across: +w.across.toFixed(2) };
}
const gridCost = { ms: 0, frames: 0, worst: 0, last: 0 };   // (development: the grid's own share of a frame)
let devRawTracks = false, devNoShake = false, devMotion = false, devRec = null, devGpu = null, devShadowDrawn = false;
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
  gridCost.frames++; { const f = gridCost.ms - gridCost.last; if (f > gridCost.worst) gridCost.worst = f; gridCost.last = gridCost.ms; }
  // (live: the grid is looked for again every 5 s until the field has been seen standing on it)
  // (the grid again when what it depends on has come in: the entrants (a live feed's driver list), or – live, before a
  // grid of this race's own – the field standing on it; checked every 2 s, live 5 s)
  if (world && performance.now() - (world.gridTry || 0) > (src.isLive ? 5000 : 2000)) {
    world.gridTry = performance.now();
    const own = /^(session|live)/.test(world.gridInfo?.source || "");
    if (gridKeyNow() !== world.gridKey || (src.isLive && isRace && !own)) addGrid();
  }
  const g0 = performance.now(), gridNow = isRace && world?.gridModel && F ? gridContext(src, A.t, sm) : null;
  // the cars in the pit lane: what each is doing, from the data (pitstate.js)
  const p0 = performance.now(), pitNow = world ? pitFrame(src, A.t, sm?.lag || 0, isRace) : null; pitCost.ms += performance.now() - p0; pitCost.frames++;
  // cars the feed has no position for now, placed from the start and their own telemetry where that can be done
  // (startplan.js placeWithout): in their slot, launched from it, waiting at the pit exit
  const without = isRace && world ? carsWithout(src, A.t, pos, F, sm?.lag || 0) : [];
  gridCost.ms += performance.now() - g0;
  if (isRace && world) updatePitLight(src, A.t);
  const list = without.length ? [...Object.entries(pos).filter(([n]) => !without.some((w) => w.override && w.num === n)), ...without.map((w) => [w.num, null, w.est])] : Object.entries(pos);
  for (const [num, p, est] of list) {
    const d = drivers[num]; if (!d || !world) continue;
    if (est && !est.pit && !F) continue;
    seen.add(num);
    const c = carFor(num, d);
    const st = est ? (est.pit ? null : Object.assign(c.st || (c.st = {}), { s: est.s, d: est.d, vs: est.vs, vd: est.vd || 0, as: est.as || 0, run: -1 })) : F ? sm.state(num, A.t, c.st || (c.st = {})) : null;
    c.est = est || null;
    const v = vTmp;
    let speed;
    if (st) {
      // On the track: posed from its track coordinates (smooth.js) – along the lap from the timing and the speed
      // telemetry, across on the racing line plus any room it's making in traffic – and from them how an F1 car
      // moves: the path's heading and turning rate, the body a touch more into the corner than the path (slip),
      // the nose dipping under braking, the car leaning a little and squatting on its downforce at speed.
      const off = est ? 0 : c.trafD || 0, offRate = est ? 0 : c.trafRate || 0;
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
      // on the tarmac (drawn 6 cm over the lap line), the tyres squashed a centimetre; the body drops with the downforce
      v.y += ROAD_LIFT - 0.01 - 0.012 * Math.min(1, (speed / 90) ** 2);
    } else {
      // Off the track (pit lane, a trip across the run-off) and before the steadied tracks are ready: from the
      // positions, heading from the velocity. (A pit-lane starter the feed has no position for: along the pit lane.)
      let mx, mz, pitYaw = null;
      if (est?.pit) {
        const q = pitLaneAt(est.u, pitTmp);
        v.set(q.x, q.y, q.z); pitYaw = q.yaw;
        trackPointFor(c, v.x, v.z); v.y = q.y + ROAD_LIFT - 0.02;
        mx = Math.sin(q.yaw) * est.vs; mz = Math.cos(q.yaw) * est.vs;
      } else {
        v.set(p[0] * DM - world.center.x, (p[2] || 0) * DM - world.center.y, -(p[1] * DM - world.center.z));
        const ground = trackPointFor(c, v.x, v.z);
        if (ground != null) v.y = ground + ROAD_LIFT - 0.02;   // (the pit lane's tarmac is laid 4 cm over the ground)
        const vel = velBuf[num];                                               // dm/ms → m/s is ×100
        mx = vel ? vel[0] * 100 : 0; mz = vel ? -vel[1] * 100 : 0;
      }
      speed = Math.hypot(mx, mz);
      // (crawling, the velocity of 4 Hz positions points anywhere: below 6 m/s the heading is kept – in front of the
      // garages it lies along the pit lane, the way the car was already facing; first seen, the lap line's direction)
      let yaw = c.yaw;
      if (pitYaw != null) yaw = pitYaw;
      else if (speed > 6) yaw = Math.atan2(mx, mz);
      else {
        const pl = pitLaneDir(v.x, v.z);
        if (pl) { const q = nearestOnPath(v.x, v.z), a = Math.atan2(pl[0], pl[1]); yaw = q && q.d < 25 ? a : Math.abs(wrap(a - c.yaw)) <= Math.PI / 2 ? a : wrap(a + Math.PI); }
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
    // On the grid: drawn in its slot while it stands there (the feed has the whole grid in single file, metres off),
    // eased in as it rolls up to it before the start and let go with the distance it drives off (grid.js, gridCar)
    // in the pit lane in front of the garages: in the fast lane, or its box (off the lap line only – the track running
    // past the garages is the track)
    (c.feedPos || (c.feedPos = new THREE.Vector3())).copy(v);
    // (a car the data puts in the pit lane – its InPit flag or its raw position on the pit path – is drawn from its raw
    // position and the lane's model, whatever the track's smoothing made of it: a pit-entry sample 3 m off the measured
    // path had been pulled 13 m out onto the racing line – Barcelona 2025, Norris)
    if (!est && pitNow?.has(num)) pitDraw(c, pitNow.get(num), v); else c.pit = null;
    (c.raw || (c.raw = new THREE.Vector3())).copy(v);
    c.grid = null;
    if (gridNow && st && !est) { const g1 = performance.now(); gridCar(c, num, v, gridNow); const e = performance.now() - g1; gridCost.ms += e; }
    if (est) { if (!est.pit) c.yaw = wrap(c.yaw); c.grid = { g: est.g, by: est.from, state: est.est, estimated: true }; }
    // From a placement without position data to the feed's own: the difference at that moment let go over 1.5 s of the
    // session's time (so the car doesn't jump when its positions start; a seek starts over)
    if (est) { c.estAt = A.t; (c.estPos || (c.estPos = new THREE.Vector3())).copy(v); }
    else if (c.estAt != null) { if (A.t >= c.estAt && A.t - c.estAt < 1000) c.hand = { t: A.t, dx: c.estPos.x - v.x, dz: c.estPos.z - v.z }; c.estAt = null; }
    if (c.hand) {
      const w = A.t < c.hand.t || A.t - c.hand.t > 1500 ? 0 : 1 - smoothstep(0, 1500, A.t - c.hand.t);
      if (w <= 0) c.hand = null; else { v.x += c.hand.dx * w; v.z += c.hand.dz * w; }
    }
    c.pos.copy(v); c.has = true;
    c.obj.position.copy(v);
    // The car the cockpit cameras ride in is steadied: its pitch and roll follow slowly (~0.4 s) and its height over
    // the road too, kerb bumps left out – the camera is fixed to it, and the halo, helmet and nose in the frame with it,
    // so what moves on screen is the world going by, not a shaking car (4 Hz positions and kerb ridges shook it).
    const ride = (camMode === "onboard" || camMode === "eye") && num === focusNum;
    if (ride) {
      const k = c.stab ? 1 - Math.exp(-dt * 2.5) : 1, ky = c.stab ? 1 - Math.exp(-dt * 5) : 1, S = c.stab || (c.stab = { p: 0, r: 0, y: v.y });
      S.p += (c.pitch - S.p) * k; S.r += (c.roll - S.r) * k; S.y += (v.y - (c.bump ? 0.008 + 0.01 * c.bump : 0) - S.y) * ky;
      c.obj.position.y = S.y;
      c.model.rotation.set(S.p, c.yaw, S.r, "YXZ");
    } else {
      c.stab = null;
      c.model.rotation.set(c.pitch, c.yaw, c.roll + c.bump * 0.003, "YXZ");
    }
    // wheels roll with the speed; front wheels steer with the turning rate (Ackermann-ish: δ ≈ L·ω / v)
    c.spin = (c.spin + (c.speed * dt) / 0.354) % (Math.PI * 2);
    // (the front tyres' slip angle on top, growing with the cornering force: an estimate, ~0.6° per g (0.01 rad); and a
    // touch of opposite lock when the rear steps out)
    const steer = c.speed > 3 ? Math.max(-0.4, Math.min(0.4, Math.atan((3.4 * yawRate) / c.speed) + (0.01 * c.speed * yawRate) / 9.81 - (c.slide || 0) * 2)) : 0;
    // (the wheels' and steering wheel's angle eased: the turning rate from 4 Hz positions twitched them frame to frame)
    c.steer = c.steer == null ? steer : c.steer + (steer - c.steer) * (1 - Math.exp(-dt * 5));
    setWheels(c.model, c.spin, c.steer);
    // the wings' flaps: 2022–25 cars – DRS as the car's telemetry says (open ≥ 10); 2026 cars – active aero, estimated
    // (straight mode at speed on straights, corner mode otherwise: the feed has no channel for it)
    let wantOpen;
    if (c.model.userData.profile.era === "2022") { const cd = src.carAt?.(num, A.t); wantOpen = cd && cd.drs != null ? (cd.drs >= 10 ? 1 : 0) : 0; }
    else wantOpen = aero2026Allowed() && c.speed > 68 && Math.abs(yawRate) < 0.04 ? 1 : 0;
    c.aero += (wantOpen - c.aero) * (1 - Math.exp(-dt * 6));
    setAero(c.model, c.aero);
    // (the compound on the sidewalls: the stint now; a replay shown from its record has the new set on the car from the
    // stop it went on at – the new stint is sent ~15 s after the car left; a car at work in its box: updateCrews)
    if (!liftedCars.has(num) && (!c.compoundAt || performance.now() - c.compoundAt > 1500)) {
      c.compoundAt = performance.now(); const st = src.stints?.(num); let cmp = st?.[st.length - 1]?.Compound;
      if (pitWorkPolicy() === "record") { const trk = src.tracks?.cars?.[num], ls = trk && lastStandPos(trk, A.t, 40); if (ls) { const e = (src.tyreChanges?.(num) || []).find((x) => x.ms > A.t && x.ms >= ls.t0 && x.ms <= ls.t0 + 90000 && x.changed !== false); if (e) cmp = e.compound; } }
      setCompound(c.model, cmp);
    }
    const l = lines[num] || {};
    const out = l.Retired || l.Stopped;
    const inCockpit = (camMode === "onboard" || camMode === "eye") && num === focusNum;
    c.obj.visible = true;
    // the T-cam sees the driver's helmet in front of it, as on TV; from the driver's own eyes it is round the camera
    c.model.userData.helmet.visible = !(camMode === "eye" && num === focusNum);
    c.label.sp.userData.own = inCockpit;
    // (≈: drawn where the start and its telemetry put it – the feed has no position for it now, or one far off its slot)
    paintLabel(c.label, `${l.Position || ""} ${d.Tla}${est ? " ≈" : ""}`.trim(), "#" + (d.TeamColour || "888"), num === A.focus);
    c.label.sp.material.opacity = out ? 0.45 : 1;
  }
  // (a car not drawn this frame is drawn afresh when it's back: no easing from where it was before)
  for (const [num, c] of cars) if (!seen.has(num)) { c.obj.visible = false; c.grid = null; c.has = false; c.est = null; c.estAt = null; c.hand = null; c.pit = null; }
  separate(dt, seen);
  // (after the cars are kept apart: the crew round a car where it is drawn)
  { const c0 = performance.now(); updateCrews(pitNow); pitCost.ms += performance.now() - c0; }
  // F1's archive sometimes stops publishing car positions part-way through a session (e.g. Monaco 2026):
  // say so instead of showing an empty track without explanation.
  const note = document.getElementById("note3d"), msg = "이 시점은 F1이 차량 위치 기록을 공개하지 않아서 차를 그릴 수 없어요. 순위·기록은 그대로 볼 수 있어요.";
  if (!seen.size && Object.keys(drivers).length) { if (note.textContent !== msg) note.textContent = msg; note.hidden = false; }
  else if (note.textContent === msg) note.hidden = true;
  scaleForView();
  updateWheelScreens(src, A.t);
  updateStartLights(src, A.t);
}
// the gantry's reds before a standing start (startplan.js startLights: a replay's estimate – the data has lights out only)
function updateStartLights(src, t) {
  const lamps = world?.group.getObjectByName("grid")?.userData.lamps;
  // (no gantry or source: no lights and no note left from before)
  if (!lamps || !src) { const el = document.getElementById("startLightNote"); if (el) el.hidden = true; return; }
  // (a replay's standing starts at the moment the field set off by its telemetry where that differs from the race clock's
  // – the clock isn't always lights out; live: as the clock says, nothing ahead)
  const S = startState(src, t);
  if (!S.launches) S.launches = new Map();
  const starts = S.hist.starts(src.isLive ? t : Infinity).map((s) => {
    // (a restart race control doesn't name: standing only if the field is seen setting off together from standstill)
    if (src.isLive || s.standing === false) return s;
    if (!S.launches.has(s.t)) S.launches.set(s.t, fieldLaunch(src.car, s));
    const f = S.launches.get(s.t);
    if (s.standing !== true) return f ? { ...s, t: f.t, standing: true, from: "field" } : s;
    return f && Math.abs(f.t - s.t) > 3000 ? { ...s, t: f.t, from: "field" } : s;
  });
  const L = startLights(starts, t, { live: !!src.isLive });
  lamps.forEach((m, i) => { const on = i < L.lit; if ((m.emissiveIntensity > 0.5) !== on) { m.emissiveIntensity = on ? 1.1 : 0.04; m.color.set(on ? 0x500000 : 0x180505); m.emissive.set(on ? 0xff0a00 : 0xff2a1a); } });
  const note = L.est ? "출발 신호: 데이터에는 소등 시각만 있어요 – 빨간불이 켜지는 시점은 추정(1초 간격, 소등 2초 전 5개 점등)" : null;
  let el = document.getElementById("startLightNote");
  if (!el && note) { el = document.createElement("div"); el.id = "startLightNote"; el.style.cssText = "position:absolute;left:12px;bottom:84px;padding:3px 8px;border-radius:6px;background:rgba(14,16,19,.72);color:#cfd6dd;font-size:11px;pointer-events:none;z-index:3"; host?.appendChild(el); }
  if (el) { el.hidden = !note; if (note && el.textContent !== note) el.textContent = note; }
}
// The steering wheels' screens: each driver's own data at the moment shown (wheelscreen.js) on the cars drawn close up –
// the cockpit car first, then the nearest – four at most; the others show the neutral face. A new session starts clean.
let TEXLOG = null;
// (shadow depth materials let go of a freed world's maps – dispose.js watchShadowDepth / releaseShadowRefs)
watchShadowDepth(THREE);
const wheelScreens = new WheelScreens({ size: 4, every: 125 });
let wheelScreensFor = null;
function updateWheelScreens(src, t) {
  const key = app()?.sourceKey?.()?.replace(/:\d+$/, "") || null;
  if (key !== wheelScreensFor) { wheelScreens.reset(); for (const c of cars.values()) setWheelScreen(c.model, null); wheelScreensFor = key; }
  const focusNum = app().focus || leader(), cockpit = camMode === "onboard" || camMode === "eye";
  const list = [...cars.values()].filter((c) => c.obj.visible && c.model.userData.lod === "near")
    .map((c) => ({ num: c.num, c, d: cockpit && c.num === focusNum ? -1 : camera.position.distanceTo(c.obj.position) })).sort((a, b) => a.d - b.d);
  const { have, lost } = wheelScreens.assign(list);
  for (const num of lost) { const c = cars.get(num); if (c) setWheelScreen(c.model, null); }
  for (const { num, tex } of have) { const c = cars.get(num); if (c) setWheelScreen(c.model, tex); }
  const lines = src?.state?.TimingData?.Lines || {}, laps = src?.state?.LapCount || null, season = app()?.sessionYear?.() || null;
  wheelScreens.update((num) => screenModel({ car: src?.carAt?.(num, t) || null, line: lines[num] || null, laps, season }));
  // the teams' own pit wall panels: their two drivers, by team – the session's public data at the moment shown (each
  // repainted on change, at most twice a second: ~11 small canvases)
  if (pitTeams.group) {
    const apps = src?.state?.TimingAppData?.Lines || {};
    updateTeamScreens(pitTeams.group, (num) => ({ line: lines[num] || null, app: apps[num] || null, car: src?.carAt?.(num, t) || null }));
  }
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
    if (!c.onTrack) { const ground = trackPointFor(c, c.pos.x, c.pos.z); if (ground != null) c.pos.y = ground + ROAD_LIFT - 0.02; }   // (on the track the height is right already)
    c.obj.position.copy(c.pos);
  }
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function leader() {
  const lines = app().src?.state.TimingData?.Lines || {};
  return Object.keys(lines).find((n) => lines[n].Position === "1") || null;
}

// Name tags readable at any distance; cars at their real size (or larger from high up, by choice).
// Cars are drawn at their real size; from the helicopter they can be drawn larger to be told apart (the map
// settings' "차량 크게" – a readability option, off by default: the names over them say who is where).
// Level of detail by the car's size on screen (pixels along its length), with a margin each way so it doesn't flick:
// close up (over ~260 px, or the car the cockpit cameras are in) the cockpit interior, hands and steering wheel;
// under ~26 px no wheel covers, deflectors or lights either.
function scaleForView() {
  const H = hostH || 1, f = 2 * Math.tan((camera.fov * Math.PI) / 360) / H, big = geoSettings().bigCars === true, focusNum = app().focus || leader();
  for (const c of cars.values()) {
    const dist = camera.position.distanceTo(c.obj.position);
    const s = camMode === "heli" && big ? Math.min(7, Math.max(1, dist / 115)) : 1;
    c.model.scale.setScalar(s);
    const u = c.model.userData, px = (u.bounds.length * s) / Math.max(1e-3, dist * f);
    const cockpit = (camMode === "onboard" || camMode === "eye") && c.num === focusNum;
    const lod = cockpit ? "near" : u.lod === "near" ? (px > 200 ? "near" : px > 26 ? "mid" : "far") : u.lod === "far" ? (px > 34 ? (px > 260 ? "near" : "mid") : "far") : (px > 260 ? "near" : px < 26 ? "far" : "mid");
    setDetail(c.model, lod);
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
// (unsafe: frames no spot was clear, off the surfaces and over the ground; held: of those, frames the camera stood on a
// fallback spot – the last safe one relative to the car, or over it –; exposed: frames even that wasn't found, the
// camera kept where it was. offset: the last safe spot relative to the car's head point; back: seconds of normal
// spots needed to leave a fallback – so the view doesn't flick between the two)
const chase = { yaw: 0, yawVel: 0, y: 0, init: false, lift: 0, frames: 0, unsafe: 0, held: 0, exposed: 0, offset: null, holding: false, back: 0 };
const ray = new THREE.Raycaster(), qTmp = new THREE.Quaternion(), qShake = new THREE.Quaternion(), shakeE = new THREE.Euler(), qLook = new THREE.Quaternion(), lookE = new THREE.Euler();
// The car the cameras are on: the selected driver (else the leader) – only as drawn this frame. A car the feed has no
// position for at this moment isn't drawn, and no camera rides where it last was.
// (camFor: the car and world the cameras' history – the chase rig's swing and height, the steadied ride – belongs to;
// another car or a new session starts it over)
let camFor = { num: null, world: null }, camNote = "";
const heli = { follow: false, last: new THREE.Vector3(), at: new THREE.Vector3() };
function camNoteSet(text) {
  if (text === camNote) return;
  camNote = text;
  let el = document.getElementById("camNote3d");
  if (!el && text) { el = document.createElement("div"); el.id = "camNote3d"; el.style.cssText = "position:absolute;left:84px;top:12px;max-width:46%;padding:4px 9px;border-radius:6px;background:rgba(14,16,19,.78);color:#e3e8ee;font-size:12px;line-height:1.4;pointer-events:none;z-index:4"; host?.appendChild(el); }
  if (el) { el.textContent = text; el.hidden = !text; }
}
function carNoteFor(num, c) {
  const d = app().src?.state.DriverList?.[num], name = d ? `${d.Tla || num}` : num;
  if (!c?.obj.visible) return `${name}: 이 시점의 위치 자료가 없어 차를 그릴 수 없어요 (출발 상태로도 위치를 정할 수 없음).`;
  if (c.est?.pit) return `${name}: 피트레인 출발 · 이 시점 위치 자료가 없어 피트 출구 대기 위치로 표시 (대기 순서는 추정)`;
  if (c.est) return `${name}: 이 시점 위치 자료가 없어 ${c.est.est === "slot" ? `출발 그리드 ${c.est.g}번 칸에 표시` : `${c.est.g}번 칸에서 텔레메트리 속도로 출발 위치를 추정`}`;
  return "";
}
function updateCamera(dt) {
  const A = app();
  if (camMode === "inspect") return;
  const num = A.focus || leader(), c = cars.get(num), shown = !!c?.obj.visible;
  // (a seek – the session's time jumping, or going back – starts the chase rig's swing and height over too)
  const t = A.t, jumped = camFor.t != null && (t < camFor.t - 50 || t - camFor.t > 2000);
  camFor.t = t;
  if (jumped) { chase.init = false; for (const x of cars.values()) x.stab = null; }
  if (camFor.num !== num || camFor.world !== world) {
    // another car (or session): the chase rig and the ridden car's steadying start over; the helicopter, following,
    // goes over to the new car keeping its view
    if (camMode === "heli" && camFor.num && camFor.num !== num && camFor.world === world) heli.follow = true;
    camFor = { num, world, t }; chase.init = false; camInit = false; chase.offset = null; chase.holding = false;
    for (const x of cars.values()) x.stab = null;
  }
  if (camMode === "heli") {
    controls.enabled = true; setNear(0.3);
    // following the selected car: target and camera moved with it (orbit and zoom stay the user's); a drag that moves
    // the target (pan) lets go of it – a free view from then on
    if (heli.follow && shown) { tmp.subVectors(c.pos, controls.target); controls.target.add(tmp); camera.position.add(tmp); }
    heli.at.copy(controls.target);
    controls.update();
    if (heli.follow && controls.target.distanceTo(heli.at) > 0.05) heli.follow = false;
    camNoteSet(heli.follow ? (shown ? `헬기: ${A.src?.state.DriverList?.[num]?.Tla || num} 추적 중 · 끌어서 옮기면 자유 시점` + (c.est ? " · " + carNoteFor(num, c) : "") : carNoteFor(num, c)) : "");
    return;
  }
  controls.enabled = false;
  if (!shown) {
    // no car to ride: a view over the grid (or the circuit) instead of the road where it was, said so
    controls.enabled = true;
    if (camInit !== "overview") { overview(); camInit = "overview"; }
    controls.update();
    camNoteSet(carNoteFor(num, c));
    return;
  }
  if (camInit === "overview") { camInit = false; chase.init = false; }
  camNoteSet(carNoteFor(num, c));
  if (camMode === "onboard" || camMode === "eye") {
    // Fixed to the car (its mounts, per model): the broadcast T-cam on top of the airbox, looking down the car over
    // the driver's helmet – or the driver's own eyes (first person). The car under it is steadied (updateCars), and no
    // vibration is added: a steady picture to watch the race by.
    // (the car's matrices from its parent down, as it is this frame: updateMatrixWorld on the model alone builds on the
    // parent's from the last render – the camera then sat one frame back, a metre behind the airbox at 200 km/h)
    c.model.updateWorldMatrix(true, true);
    const u = c.model.userData, eye = camMode === "eye";
    camera.position.copy(eye ? u.mounts.eye : u.mounts.tcam).applyMatrix4(c.model.matrixWorld);
    c.model.getWorldQuaternion(qTmp);
    // (the T-cam as the car's profile has it – fitted to the team's onboard footage where there is one; the eyes ahead,
    // a touch down)
    shakeE.set(eye ? -0.06 : -((u.profile.tcamPitch ?? 15.5) * Math.PI) / 180, Math.PI + (eye ? 0 : ((u.profile.tcamYaw || 0) * Math.PI) / 180), 0, "YXZ");
    camera.quaternion.copy(qTmp).multiply(qShake.setFromEuler(shakeE));
    // free look: turn the head round the car's own up axis, then tilt
    if (look.yaw || look.pitch) camera.quaternion.multiply(qLook.setFromEuler(lookE.set(look.pitch, look.yaw, 0, "YXZ")));
    setNear(eye ? 0.03 : 0.05);
    const fov = cockpitFov(eye, u.profile.tcamHfov);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camLook.copy(c.pos); camInit = true;
    return;
  }
  setNear(0.3);
  const w = 3.2;   // spring rate (rad/s): lower = lazier swing
  if (!camInit || !chase.init || Math.abs(wrap(c.yaw - chase.yaw)) > 1.6) { chase.yaw = c.yaw; chase.yawVel = 0; chase.y = c.pos.y; chase.lift = 0; chase.init = true; chase.offset = null; chase.holding = false; }
  const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const acc = w * w * wrap(c.yaw - chase.yaw) - 2 * w * chase.yawVel;
    chase.yawVel += acc * h; chase.yaw += chase.yawVel * h;
  }
  chase.y += (c.pos.y - chase.y) * (1 - Math.exp(-dt * 4));
  // the camera on a sphere round the car: behind it and a little above by default, turned by free look
  const head = new THREE.Vector3(c.pos.x, chase.y + 1.1, c.pos.z);
  const az = chase.yaw + Math.PI + look.yaw, el = Math.atan2(2.4, 10.5) + look.pitch, r = Math.hypot(2.4, 10.5) * (look.dist / 10.5);
  // keep a clear line of sight to the car: the camera stops short of a building in between (never behind it), rises
  // over one that would bring it too close (eased, not jumping), keeps off every surface and over the ground – each
  // spot checked as it stands (los.js: chasePlace)
  const real = world.real, groundAt = real?.groundAt ? (x, z) => real.groundAt(x, z) : null;
  if (camera.fov !== 58) { camera.fov = 58; camera.updateProjectionMatrix(); }
  // (the room round the camera: as far as the corners of its near plane, at this window's shape)
  const occ = world.occluders || [], room = Math.max(0.35, nearRoom(camera.near, camera.fov, camera.aspect));
  const placed = chasePlace(occ, head, az, el, r, { lift: chase.lift, groundAt, room });
  chase.frames++;
  chase.lift += (placed.lift - chase.lift) * (1 - Math.exp(-dt * 3));
  let pos = placed.pos;
  if (!placed.safe) {
    // never onto a spot that isn't safe: the last safe one relative to the car, else over it, else where it stands
    chase.unsafe++; chase.back = 0;
    const fb = chaseFallback(occ, head, chase.offset, { room, groundAt });
    if (fb) { chase.held++; chase.holding = true; pos = fb; }
    else { chase.exposed++; pos = camInit ? camera.position : (chase.offset ? head.clone().add(chase.offset) : placed.pos); }
  } else if (chase.holding) {
    // back to the normal spot once it has held for a moment (the fallback, still holding, meanwhile)
    chase.back += dt;
    const fb = chase.back < 0.4 ? chaseFallback(occ, head, chase.offset, { room, groundAt }) : null;
    if (fb) pos = fb; else chase.holding = false;
  }
  if (pos !== camera.position) camera.position.copy(pos);
  if (placed.safe || chase.holding) (chase.offset ??= new THREE.Vector3()).subVectors(camera.position, head);
  const fwd = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
  camLook.copy(c.pos).addScaledVector(fwd, 7).setY(chase.y + 1.0);
  // turned away from straight behind, the camera looks at the car itself
  const turned = Math.min(1, (Math.abs(look.yaw) + Math.abs(look.pitch) * 0.7) / 0.6);
  if (turned) camLook.lerp(head, turned);
  camera.up.copy(UP);
  camera.lookAt(camLook);
  camInit = true;
}
function setNear(n) { if (camera.near !== n) { camera.near = n; camera.updateProjectionMatrix(); } }

// Free look in the chase and onboard cameras: drag (or swipe sideways with two fingers) to turn the view all
// the way round, up and down; scroll / pinch to move the chase camera nearer or further (onboard: zoom).
// Double-click returns to the straight-ahead view. The angles are kept relative to the car, so the view
// turns with it through the corners.
// (fov 0: the cockpit cameras' own – the T-cam's lens as the car's profile has it (2026 footage: ~72° wide), the eyes'
// ~95°, as tall
// as the window's shape makes it; zooming sets a vertical angle of its own)
const look = { yaw: 0, pitch: 0, dist: 10.5, fov: 0, dragged: false, down: null };
function resetLook() { look.yaw = 0; look.pitch = 0; look.dist = 10.5; look.fov = 0; }
const cockpitFov = (eye, tcamHfov = 72) => look.fov || Math.max(35, Math.min(100, (2 * Math.atan(Math.tan(((eye ? 95 : tcamHfov) * Math.PI) / 360) / (camera.aspect || 1.6)) * 180) / Math.PI));
function initLook() {
  const active = () => camMode === "chase" || camMode === "onboard" || camMode === "eye";
  canvas.addEventListener("pointerdown", (e) => {
    if (!active() || e.button !== 0) return;
    look.down = { x: e.clientX, y: e.clientY, yaw: look.yaw, pitch: look.pitch, moved: 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!look.down || !active()) return;
    const dx = e.clientX - look.down.x, dy = e.clientY - look.down.y;
    look.down.moved = Math.max(look.down.moved, Math.hypot(dx, dy));
    const inCar = camMode === "onboard" || camMode === "eye", k = inCar ? 0.0055 : 0.007;
    look.yaw = wrap(look.down.yaw - dx * k);
    look.pitch = Math.max(inCar ? -0.9 : -0.35, Math.min(inCar ? 0.7 : 1.25, look.down.pitch + dy * k * (inCar ? -1 : 1)));
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
    else look.fov = Math.max(35, Math.min(100, (look.fov || camera.fov) * Math.exp(d)));
  }, { passive: false });
}

function setCam(mode) {
  if (mode === camMode) return;
  resetLook();
  camera.up.copy(UP); chase.init = false;
  if (mode === "heli") {
    // take over from wherever the chase camera was, orbiting – and following – the selected car (when it is drawn;
    // else the view stays where it is, free)
    const c = cars.get(app().focus || leader()), shown = !!c?.obj.visible;
    camera.fov = 50; camera.updateProjectionMatrix();
    if (shown) {
      controls.target.copy(c.pos); heli.follow = true;
      if (camMode !== "chase") camera.position.copy(c.pos).add(new THREE.Vector3(0, 120, 160));
    } else heli.follow = false;
  }
  camMode = mode; camInit = false; resetPace();
  try { localStorage.setItem("f1kr:cam3d", JSON.stringify(mode)); } catch {}
  paintCamButtons();
}
function paintCamButtons() {
  document.querySelectorAll("[data-cam]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cam === camMode)));
  document.getElementById("map3d").dataset.cam = camMode;
}
function cycleCar(dir) {
  const lines = app().src?.state.TimingData?.Lines || {};
  const order = Object.keys(lines).filter((n) => cars.get(n)?.obj.visible).sort((a, b) => (+lines[a].Position || 99) - (+lines[b].Position || 99));
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

// A view over the starting grid from behind and above when there is one, else over the whole circuit
function overview() {
  camera.up.copy(UP); camera.fov = 50; camera.updateProjectionMatrix();
  const sl = world?.slots;
  if (!sl?.size) { frameCircuit(); return; }
  const p1 = sl.get(1), pl = sl.get(Math.min(sl.size, 12)) || p1;
  controls.target.set((p1.x + pl.x) / 2, p1.y, (p1.z + pl.z) / 2);
  camera.position.set(pl.x - p1.tx * 90 + p1.nx * 30, pl.y + 55, pl.z - p1.tz * 90 + p1.nz * 30);
  controls.update();
}
// Fit the helicopter view to the whole circuit.
function frameCircuit() {
  heli.follow = false;
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
const GEO_DEFAULT = { provider: "eox", buildings: true, trees: true, night: "auto", shadows: true, facilities: true, bigCars: false, quality: "balanced", pitWork: "record" };
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
    // (this circuit's corners – F1's numbers – for the grandstands placed by them: grandstands.json "at")
    const circ = A.circuitKey?.() != null ? await window.api.trackCircuit(A.circuitKey(), A.sessionYear?.() || null).catch(() => null) : null;
    if (job !== geoJob || world !== w) return;
    const corners = (circ?.corners || []).map((k) => ({ n: k.n, x: k.x * DM - w.center.x, z: -(k.y * DM - w.center.z) }));
    const built = await buildScenery(window.api, data, w, { provider, buildings: opts.buildings, trees: opts.trees, night: evening, street: w.street, trackW: w.width, corners,
      facilities: opts.facilities, year: A.sessionYear?.() || null, venue: venueOf({ circuitKey: A.circuitKey?.(), location: A.location?.() }), isCurrent: () => job === geoJob && world === w }, (step) => job === geoJob && geoStatus(`실제 지도 · ${step}…`));
    if (job !== geoJob || world !== w) { disposeReal(built); return; }
    // swap the generic surroundings for the real ones
    w.group.remove(w.syn.terrain, w.syn.trees);
    // the generated walls, opened where an escape road or rejoin route meets the track: the map's (auxroads.js) and the
    // FIA's run-offs on street-style circuits the map has no line for (venues.js WALL_OPENINGS – they were walled off)
    const openings = wallOpeningsFor(venueOf({ circuitKey: app().circuitKey?.(), location: app().location?.() })?.key);
    const openAt = openings.length ? wallOpenings(w, built.geo, openings) : null;
    const gap = built.auxGap && openAt ? (x, z) => built.auxGap(x, z) || openAt(x, z) : built.auxGap || openAt;
    if (built.barrierShare > 0.35 && !w.street) w.group.remove(w.syn.walls);
    else if (gap) {
      const open = w.street ? streetWalls(w.samples, w.grid, gap) : walls(w.samples, w.grid, 12, 1.1, undefined, 0, w.laneZone, gap); open.name = "syntheticWalls"; open.traverse((o) => { o.castShadow = true; });
      w.group.remove(w.syn.walls); disposeGroup(w.syn.walls); w.syn.walls = open; w.group.add(open);
    }
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
  // (reflections on the cars by night only, as the rest of the world has: by day an environment map over a car that
  // fills the cockpit cameras' screen dropped frames on the GPU – measured: frames over 30 ms 26 → 10 in 4 s)
  for (const c of cars.values()) { lightCar(c.model, night); setCarEnvironment(c.model, night ? carEnvironment(true) : null, 0.6); }
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
  if (world) { world.sourceKey = key; world.pts = pts.length; cornerMarks(); addGrid(); addPitLane(); frameCircuit(); applyLighting(); loadGeo(world); refreshShadows(); }
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
    for (const o of Object.values(world.syn || {})) if (o?.isObject3D && !o.parent) disposeGroup(o, done);   // (3D objects only)
    world = null;
  }
  lit = null;
  forgetPitTeams();
  wheelScreens.reset(); wheelScreensFor = null;
  for (const c of cars.values()) { scene.remove(c.obj); disposeGroup(c.obj); }   // labels and shadows have their own textures
  cars.clear();
  releaseShadowRefs();
}
// the session a source key belongs to (a live key also carries the outline's length, which grows)
const sessionOf = (key) => (key || "").startsWith("live:") ? key.split(":").slice(0, 2).join(":") : key || "";

// ---------- the start (startplan.js) ----------
// Per source: its start history (a replay's from its events; a live feed's noted as it is applied – only what has
// come in), each car's distance from its speed telemetry, the share of the field standing still (per 250 ms).
let startFor = null;
function startState(src, t) {
  // (a live feed is one source across sessions: a new session's key starts the history over)
  const key = src.state.SessionInfo?.Key ?? null;
  if (!startFor || startFor.src !== src || (src.isLive && startFor.key !== key)) startFor = { key, src, hist: src.isLive ? new StartHistory() : StartHistory.fromEvents(src.events || []), sv: new Map(), still: new Map(), ctx: new Map(), arr: new Map() };
  const S = startFor;
  if (src.isLive) S.hist.note(t, src.state);
  return S;
}
function startCtxAt(S, t) {
  const key = Math.round(t / 250);
  if (!S.ctx.has(key)) { if (S.ctx.size > 200) S.ctx.clear(); S.ctx.set(key, startContext(S.hist, key * 250)); }
  return S.ctx.get(key);
}
// (a car's arrival on the grid by its telemetry, per 250 ms: it scans back over the drive to the grid)
function arrivalFor(S, src, num, t, need, lag) {
  const key = num + ":" + Math.floor(t / 250);
  let a = S.arr.get(key);
  if (a === undefined) { if (S.arr.size > 2000) S.arr.clear(); a = arrivalBy(src.car?.[num], Math.floor(t / 250) * 250, need, lag); S.arr.set(key, a); }
  return a;
}
function svFor(S, src, num, lag) {
  const car = src.car?.[num]; if (!car?.t?.length) return null;
  let e = S.sv.get(num);
  // (live: the telemetry grows – the integral again every 2 s)
  if (!e || e.lag !== lag || (src.isLive && performance.now() - e.at > 2000)) { e = { fn: speedIntegral(car, lag), lag, at: performance.now() }; S.sv.set(num, e); }
  return e.fn;
}
// the distance integral built only when a car is moving without positions (it is a pass over all its telemetry)
function lazySv(S, src, num, lag) {
  let f = null;
  const get = () => f || (f = svFor(S, src, num, lag));
  const fn = (t) => get()?.(t) ?? 0;
  fn.v = (t) => get()?.v(t) ?? 0; fn.a = (t) => get()?.a(t) ?? 0; fn.ok = () => !!get();
  return src.car?.[num]?.t?.length ? fn : null;
}
function fieldStillAt(S, src, t) {
  const key = Math.round(t / 250);
  let v = S.still.get(key);
  if (v == null) {
    let n = 0, still = 0;
    // (retired cars stand still for good: not counted. A car standing in the pit lane – by the feed's position, flagged
    // or not – is no field standing on the grid: counted, not as standing)
    const raw = world?.pitLane ? src.positionsAt(key * 250) : null, c0 = world?.center;
    const inLane = (num) => { const r = raw?.[num]; return !!r && onPitPath(world.pitLane.pts, world.pitLane.cum, r[0] * DM - c0.x, -(r[1] * DM - c0.z)) != null; };
    for (const num of Object.keys(src.car || {})) { if (S.hist.flagAt(num, "Retired", key * 250)) continue; const c = src.carAt(num, key * 250); if (!c) continue; n++; if (c.speed <= PLAN.still && !inLane(num)) still++; }
    v = n >= 6 ? still / n : 0;
    if (S.still.size > 600) S.still.clear();
    S.still.set(key, v);
  }
  return v;
}
// Cars the feed has no position for at t that can be placed from the start and their telemetry (placeWithout):
// [{ num, est }] – est in track coordinates, or { pit, u } along the pit lane. Also a car the feed does have that is
// standing still in a field standing on the grid, after its drive to the grid, not in the pit lane – a car on the grid
// by everything else known – but whose position is nowhere near its slot (over 1.5 slots, or off the track: Monaco 2026,
// the first positions after the gap put Hamilton, third on the grid, at the swimming pool): drawn in its slot, the
// feed's position kept for everything else (est.feedOff: how far it is) – not a car that is moving, or in the pits.
function carsWithout(src, t, pos, F, lag) {
  if (!world?.gridModel && !world?.pitLane) return [];
  const S = startState(src, t), ctx = startCtxAt(S, t);
  if (!ctx) return [];
  const drivers = src.state.DriverList || {}, out = [];
  const kinds = new Map(); for (const num of Object.keys(drivers)) kinds.set(num, carKind(S.hist, ctx, num, t));
  // the pit-lane starters' queue: in grid order (their real order in the queue isn't in the data – an estimate)
  const pitters = [...kinds].filter(([, k]) => k.kind === "pit").sort((a, b) => (a[1].g || 99) - (b[1].g || 99)).map(([n]) => n);
  const field = (tt) => fieldStillAt(S, src, tt);
  const need = PLAN.formation * (F?.L || 5000), c0 = world.center, raw = src.positionsAt(t);
  for (const num of Object.keys(drivers)) {
    const kind = kinds.get(num), slot = kind.kind === "grid" ? world.gridModel?.slots.get(kind.g) : null;
    // (in the pit lane by the feed's own position, flagged or not – Sepang 2026: the field queued there behind a suspended
    // start, InPit cleared –: not a car on the grid, drawn where the feed has it. The raw position: the steadied tracks
    // leave out what is off the lap line, the pit lane with it)
    const r = raw[num];
    if (r && world.pitLane && onPitPath(world.pitLane.pts, world.pitLane.cum, r[0] * DM - c0.x, -(r[1] * DM - c0.z)) != null) continue;
    let feedOff = null;
    if (pos[num]) {
      // the feed has it: only a car standing on the grid by its telemetry whose position is far from its slot
      if (!slot || !F) continue;
      const a = arrivalFor(S, src, num, t, need, lag);
      if (!a?.still || !a.ok || kind.inPitNow) continue;
      const p = pos[num], pr = F.project(p[0] * DM - c0.x, -(p[1] * DM - c0.z));
      let ds = pr ? pr.s - slot.s : Infinity; if (pr) ds = ((ds % F.L) + F.L * 1.5) % F.L - F.L / 2;
      const onTrack = pr && Math.abs(pr.d) <= Math.max(edgeOf(pr.sample, 1), -edgeOf(pr.sample, -1)) + 1;
      if (onTrack && Math.abs(ds) <= ASSIGN_TOL.gridPos) continue;
      feedOff = pr ? Math.round(Math.hypot(ds, pr.d)) : null;
    }
    const pit = kind.kind === "pit" && world.pitLane && !pos[num] ? { queueU: world.pitLane.queueU, queueIndex: pitters.indexOf(num) } : null;
    if (!slot && !pit) continue;
    const est = placeWithout({ start: ctx, kind, slot, car: src.car?.[num], lag, Sv: lazySv(S, src, num, lag), t, line: F ? (x) => F.lineAt(x) : null, L: F?.L, need, pit, fieldStill: field, arrival: (tt) => arrivalFor(S, src, num, tt, need, lag) });
    if (est && (!pos[num] || est.est === "slot")) out.push({ num, est: { ...est, kind: kind.kind, g: kind.g ?? null, from: ctx.orderFrom, feedOff }, override: !!pos[num] });
  }
  return out;
}

// ---------- the pit lane (startdata.js) ----------
// The venue's pit lane as measured from F1's data (its path from where cars leave the lap line to where they join it,
// the limiter's on and off points from their speed telemetry), placed in this world only where its ends lie on this
// session's lap line. What is drawn of it: the speed-limit lines across it and the pit exit light (red / green as race
// control's last pit-exit message says, unlit without one). Pit-lane starters wait at its exit (placeWithout).
function addPitLane() {
  const old = world.group.getObjectByName("pitLane");
  if (old) { world.group.remove(old); disposeGroup(old); }
  world.pitLane = null;
  const A = app(), venue = venueOf({ circuitKey: A.circuitKey?.(), location: A.location?.() }), pd = START_DATA[venue?.key]?.pit, F = world.frame;
  if (!pd) { world.pitInfo = { ok: false, reason: "no measured pit lane for this venue" }; return; }
  const pts = pd.path.map((p) => toWorld([p[0], p[1], 0], world.center));
  const a = F.project(pts[0].x, pts[0].z), b = F.project(pts[pts.length - 1].x, pts[pts.length - 1].z);
  if (!a || !b || Math.abs(a.d) > 4 || Math.abs(b.d) > 4) { world.pitInfo = { ok: false, reason: "the measured pit lane's ends don't lie on this session's lap line", ends: [a?.d, b?.d] }; return; }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  for (const p of pts) { const [smp] = world.grid.nearest(p.x, p.z, 4); p.y = smp ? smp.p.y : 0; }
  const len = cum[cum.length - 1];
  // the queue of pit-lane starters: its head where such cars were seen waiting at this venue (startdata.js pit.queue),
  // else just short of where the limiter goes off (an estimate: the telemetry puts that 10–90 m past the waiting place
  // at venues where both are known); the pit exit line and its light just ahead of the head
  const head = pd.queue?.head ?? Math.max(20, pd.limitOff - 4);
  world.pitLane = { pts, cum, len, entryS: a.s, exitS: b.s, limit: pd.limit, limitOn: pd.limitOn, limitOff: pd.limitOff, queueU: head, exitU: Math.min(len - 5, head + 3) };
  world.pitInfo = { ok: true, from: pd.session, passes: pd.passes, limit: pd.limit, limitOn: pd.limitOn, limitOff: pd.limitOff, spread: [pd.onMAD, pd.offMAD], length: Math.round(len),
    queueHead: head, queueFrom: pd.queue ? `measured: pit-lane starters waiting (${pd.queue.seen.map((q) => q.session).join(", ")})` : "estimate: 4 m short of the limiter's end",
    queueOrder: "estimate: one car every 7.5 m back from the head, in grid order (the real order isn't in the data)" };
  paintPitLane(world.pitLane);
}
// where u metres along the pit lane is: { x, y, z, yaw }; past its end, on along the lap line from where it joins it
function pitLaneAt(u, out = {}) {
  const P = world.pitLane, F = world.frame;
  if (u >= P.len) { const D = [0, 0], q = [0, 0, 0]; F.at(P.exitS + (u - P.len), F.lineAt(P.exitS + (u - P.len)) * Math.min(1, (u - P.len) / 120), q, D); out.x = q[0]; out.y = q[1]; out.z = q[2]; out.yaw = Math.atan2(D[0], D[1]); return out; }
  u = Math.max(0, u);
  let i = 1; while (i < P.cum.length - 1 && P.cum[i] < u) i++;
  const p0 = P.pts[i - 1], p1 = P.pts[i], f = (u - P.cum[i - 1]) / (P.cum[i] - P.cum[i - 1] || 1);
  out.x = p0.x + (p1.x - p0.x) * f; out.y = p0.y + (p1.y - p0.y) * f; out.z = p0.z + (p1.z - p0.z) * f;
  // (the heading over ±6 m: the path's points are 4 m apart)
  const ua = Math.max(0, u - 6), ub = Math.min(P.len, u + 6), A1 = pitLaneAt2(ua), B1 = pitLaneAt2(ub);
  out.yaw = Math.atan2(B1[0] - A1[0], B1[1] - A1[1]);
  return out;
}
function pitLaneAt2(u) { const P = world.pitLane; let i = 1; while (i < P.cum.length - 1 && P.cum[i] < u) i++; const p0 = P.pts[i - 1], p1 = P.pts[i], f = (u - P.cum[i - 1]) / (P.cum[i] - P.cum[i - 1] || 1); return [p0.x + (p1.x - p0.x) * f, p0.z + (p1.z - p0.z) * f]; }
let pitLight = null;
function paintPitLane(P) {
  const g = new THREE.Group(); g.name = "pitLane";
  const pos = [], idx = [], o = {};
  // a line across the lane (6 m: the fast lane – the data has the cars on one line in it; the working lane's side
  // isn't in the data) at u
  const across = (u, w = 6, t = 0.3) => {
    pitLaneAt(u, o); const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw), nx = -fz, nz = fx, v = pos.length / 3, y = o.y + ROAD_LIFT + 0.006;
    for (const [a, b] of [[-t / 2, -w / 2], [t / 2, -w / 2], [t / 2, w / 2], [-t / 2, w / 2]]) pos.push(o.x + fx * a + nx * b, y, o.z + fz * a + nz * b);
    idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
  };
  across(P.limitOn); across(P.exitU);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  const paint = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide }));
  paint.name = "pitLines"; g.add(paint);
  // the pit exit light: a post on the far side from the track at the exit line, its lamp lit as race control says
  pitLaneAt(P.exitU, o);
  const pr = world.frame.project(o.x, o.z), away = pr && pr.d >= 0 ? 1 : -1, fx = Math.sin(o.yaw), fz = Math.cos(o.yaw), nx = -fz, nz = fx;
  const px = o.x + nx * 4 * away, pz = o.z + nz * 4 * away;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.6, metalness: 0.4 }));
  post.position.set(px, o.y + 1.3, pz); g.add(post);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000, emissiveIntensity: 1.6 });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.25), lampMat);
  lamp.position.set(px, o.y + 2.75, pz); lamp.rotation.y = o.yaw + Math.PI; g.add(lamp);
  pitLight = { mat: lampMat, state: undefined };
  world.group.add(g);
}
function updatePitLight(src, t) {
  if (!pitLight || !world?.pitLane) return;
  const st = startState(src, t).hist.pitExitAt(t);
  if (st === pitLight.state) return;
  pitLight.state = st;
  pitLight.mat.emissive.setHex(st === "open" ? 0x22ff44 : st === "closed" ? 0xff2211 : 0x000000);
  pitLight.mat.color.setHex(st ? 0x222222 : 0x111111);
}

// ---------- the starting grid ----------
// Three layers (grid.js, startplan.js):
//   the circuit's grid – where the slots are: fitted to this session's own field standing before a start (when the feed
//     has it and it agrees with the circuit's measured grid), else the circuit's grid as measured from F1's position data
//     in other races there (startdata.js, placed on this lap line only where that lap line lies on this one). One slot
//     every 8 m along the lap line (or the venue's measured pitch), the columns in the middle of each half of the
//     tarmac, as many slots as this session has entrants. Drawn whether or not any car stands in them;
//   the start – which car has which slot, who starts from the pit lane (startplan.js);
//   the moment – where each car is drawn (updateCars: gridCar for cars the feed has, placeWithout for cars it hasn't).
// The painted boxes and the cars standing in them use the same slots: the box's front line is half a metre ahead of
// the car's front axle (the car model's origin is between its axles; the feed's point is taken to be the same –
// unverified, ±1 m).
// world.gridModel = { s1, pitch, side, slots: Map(g → { s, lat, x, y, z, yaw, tx, tz, nx, nz }), info } or null
const feedProject = (p) => { const v = toWorld(p, world.center), pr = world.frame.project(v.x, v.z); return pr ? { s: pr.s, d: pr.d } : null; };
function gridSources(spots) {
  const F = world.frame, L = F.L, A = app();
  const year = A.sessionYear?.() || null, venue = venueOf({ circuitKey: A.circuitKey?.(), location: A.location?.() });
  // the circuit's measured grid
  const surveyed = surveyedGrid(START_DATA[venue?.key], year, feedProject, L);
  // this session's own field standing on it
  let fit = null;
  if (spots?.length) {
    const obs = [];
    for (const sp of spots) {
      const pr = feedProject(sp.p);
      if (!pr) continue;
      const smp = F.sampleAt(pr.s), half = Math.max(edgeOf(smp, 1), -edgeOf(smp, -1));
      if (Math.abs(pr.d) <= half + 1) obs.push({ g: sp.grid, s: pr.s, d: pr.d });   // (pit-lane starters left out)
    }
    fit = fitGrid(obs, L);
    // a field standing still somewhere else (a queue in the pit lane, cars parked after a red flag) isn't the grid:
    // where the circuit's grid is known, the session's has to be within a slot of it
    if (fit.ok && surveyed.ok) {
      const off = ((fit.s1 - surveyed.s1) % L + L * 1.5) % L - L / 2;
      fit.offSurvey = +off.toFixed(1);
      if (Math.abs(off) > 2 * GRID_RULES.pitch) { fit.ok = false; fit.reason = `stood ${off.toFixed(0)} m from the circuit's measured grid`; }
    }
  }
  return { venue, year, surveyed, fit, spots };
}
function gridModelFor(src) {
  const F = world.frame, L = F.L, A = app(), { venue, year, surveyed, fit, spots } = src;
  let s1, pitch, from;
  if (fit?.ok) { s1 = fit.s1; pitch = fit.pitch; from = { kind: spots.source || "session", n: fit.n, rms: fit.rms, maxRes: fit.maxRes, dropped: fit.dropped, pitchFrom: fit.pitchFrom, pitchData: fit.pitchData, offSurvey: fit.offSurvey ?? null, res: fit.res.map((r) => [r.g, +r.r.toFixed(1)]) }; }
  else if (surveyed.ok) { s1 = surveyed.s1; pitch = surveyed.pitch; from = { kind: "survey", sessions: surveyed.sessions, others: surveyed.others, pitchFrom: surveyed.pitchFrom, sessionFit: fit ? { reason: fit.reason, n: fit.n, rms: fit.rms } : null }; }
  else return { info: { ok: false, reason: spots?.length ? `this session's standing field didn't fit (${fit?.reason}) and ${surveyed.reason}` : `no standing grid in this session and ${surveyed.reason}`, survey: surveyed.fits || null } };
  const src0 = A.src, drivers = Object.keys(src0?.state.DriverList || {}).length;
  const maxGridPos = Math.max(0, ...Object.values(src0?.state.TimingAppData?.Lines || {}).map((l) => +l?.GridPos || 0));
  const count = slotCount({ drivers, maxGridPos, year });
  const model = { s1, pitch, slots: new Map() };
  // pole's side: from a source where there is one; else the side the racing line takes there (an estimate)
  const known = poleSideFor(venue?.key, year), p1 = F.sampleAt(slotS(model, 1, L));
  const side = known ? known.side : (Math.sign((p1.M ?? 0) - (edgeOf(p1, 1) + edgeOf(p1, -1)) / 2) || 1);
  model.side = side;
  const P = [0, 0, 0], D = [0, 0];
  for (let g = 1; g <= count.n; g++) {
    const ss = slotS(model, g, L), smp = F.sampleAt(ss), lat = slotLat(g, edgeOf(smp, 1), edgeOf(smp, -1), side);
    F.at(ss, lat, P, D);
    model.slots.set(g, { g, s: ss, lat, x: P[0], y: P[1], z: P[2], yaw: Math.atan2(D[0], D[1]), tx: D[0], tz: D[1], nx: -D[1], nz: D[0] });
  }
  model.count = count;
  model.info = { ok: true, source: from.kind, from, pitch: +pitch.toFixed(2), poleSide: side > 0 ? "left" : "right", poleSideFrom: known ? known.src : "estimate: the racing line's side at pole",
    slots: count.n, slotsFrom: count.from, columns: "estimate: middle of each half of the tarmac", venue: venue?.key ?? null, year };
  return model;
}
function addGrid() {
  const old = world.group.getObjectByName("grid");
  if (old) { world.group.remove(old); disposeGroup(old); }
  world.gridModel = null; world.slots = null; world.gridInfo = null;
  gridFields.clear(); gridFieldsFor = null;
  const m = gridModelFor(gridSources(app().gridSpots?.()));
  world.gridInfo = m.info;
  world.gridKey = gridKeyNow();
  if (!m.slots) return;
  world.gridModel = m; world.slots = m.slots;
  paintGrid(m);
}
// (what the grid depends on that can come late in a live feed: the field standing before the start, the entrants)
function gridKeyNow() {
  const s = app().src; if (!s) return "";
  return `${Object.keys(s.state.DriverList || {}).length}|${Math.max(0, ...Object.values(s.state.TimingAppData?.Lines || {}).map((l) => +l?.GridPos || 0))}`;
}
// The paint: per slot a box open at the back – a front line across (2.7 m between the side lines' outer edges) and two
// short side lines –, the start line a metre ahead of pole's box, and the light gantry over it. Flat on the tarmac
// (its own height, with a depth offset over the road; never over the cars).
function paintGrid(m) {
  const F = world.frame, fz = profileFor(app().sessionYear?.() || null).FZ, P = [0, 0, 0], D = [0, 0];
  const pos = [], idx = [];
  // a painted rectangle from s0 to s1 along the lap line, lat0 to lat1 across
  const quad = (s0, s1, l0, l1) => {
    const v = pos.length / 3;
    for (const [s, l] of [[s0, l0], [s1, l0], [s1, l1], [s0, l1]]) { F.at(s, l, P); pos.push(P[0], P[1] + ROAD_LIFT + 0.004, P[2]); }
    idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
  };
  const W = GRID_RULES.boxWidth, T = 0.12, SIDE = 1.5;
  for (const sl of m.slots.values()) {
    const front = sl.s + fz + GRID_RULES.frontGap;
    quad(front - T, front, sl.lat - W / 2, sl.lat + W / 2);
    quad(front - SIDE, front - T, sl.lat + W / 2 - T, sl.lat + W / 2);
    quad(front - SIDE, front - T, sl.lat - W / 2, sl.lat - W / 2 + T);
  }
  // start line across the tarmac, a metre ahead of pole's front line
  const p1 = m.slots.get(1), startS = p1.s + fz + GRID_RULES.frontGap + GRID_RULES.startLine, smp = F.sampleAt(startS);
  const wl = edgeOf(smp, 1), wr = edgeOf(smp, -1);
  quad(startS, startS + 0.5, wr + 0.2, wl - 0.2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  const paint = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide }));
  paint.receiveShadow = true; paint.name = "gridPaint";
  const g = new THREE.Group(); g.name = "grid"; g.add(paint);
  {
    // the light gantry over the start line
    F.at(startS, 0, P, D);
    const fx = D[0], fzz = D[1], nx = -D[1], nz = D[0], yaw = Math.atan2(fx, fzz), sx = P[0], sz = P[2], y = P[1], mid = (wl + wr) / 2;
    const steel = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.5, metalness: 0.6 });
    const H = 7.2;
    for (const off of [wl + 1.5, wr - 1.5]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, H, 0.5), steel);
      post.position.set(sx + nx * off, y + H / 2, sz + nz * off); post.castShadow = true; g.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(wl - wr + 3.5, 1.1, 0.6), steel);
    beam.position.set(sx + nx * mid, y + H, sz + nz * mid); beam.rotation.y = yaw; beam.castShadow = true; g.add(beam);
    // (each column its own lamp material: lit one after another before a standing start – updateStartLights)
    const lamps = [];
    for (let i = -2; i <= 2; i++) {
      const lamp = new THREE.MeshStandardMaterial({ color: 0x180505, emissive: 0xff2a1a, emissiveIntensity: 0.04 }); lamps.push(lamp);
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.35), lamp);
      pod.position.set(sx + nx * (mid + i * 1.4) - fx * 0.45, y + H - 0.9, sz + nz * (mid + i * 1.4) - fz * 0.45); pod.rotation.y = yaw; g.add(pod);
    }
    g.userData.lamps = lamps;
  }
  world.group.add(g);
}

// The braking boards a source names for this circuit and season (boards.js): a white panel with its distance on two
// posts, 3.5 m off the tarmac, facing the cars coming; none where no source covers a corner.
const BOARD_TEX = new Map();
function boardTexture(v) {
  if (BOARD_TEX.has(v)) return BOARD_TEX.get(v);
  const c = document.createElement("canvas"); c.width = 128; c.height = 160; const g = c.getContext("2d");
  g.fillStyle = "#f4f5f6"; g.fillRect(0, 0, 128, 160); g.strokeStyle = "#1a1c1f"; g.lineWidth = 6; g.strokeRect(3, 3, 122, 154);
  g.fillStyle = "#15171a"; g.font = "800 64px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(v), 64, 84);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.userData.shared = true; BOARD_TEX.set(v, tex); return tex;
}
function addBoards() {
  const circ = app().circuit, A = app(), v = venueOf({ circuitKey: A.circuitKey?.(), location: A.location?.() });
  const list = boardsFor(v?.key, A.sessionYear?.() || 0);
  if (!list.length || !circ?.corners?.length) return;
  const step = world.samples[0].p.distanceTo(world.samples[1].p), g = new THREE.Group(); g.name = "brakeBoards";
  const post = new THREE.BoxGeometry(0.06, 1.3, 0.06), panel = new THREE.PlaneGeometry(0.8, 1.0), postMat = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.6 });
  for (const b of list) {
    const k = circ.corners.find((c) => c.n === b.turn); if (!k) continue;
    const w = toWorld([k.x, k.y, 0], world.center), [s] = world.grid.nearest(w.x, w.z, 3); if (!s) continue;
    for (const pl of boardPlaces(world.samples, s.i, b, step)) {
      const y = world.samples[pl.i].p.y, yaw = Math.atan2(pl.face[0], pl.face[1]);
      const m = new THREE.Mesh(panel, new THREE.MeshStandardMaterial({ map: boardTexture(pl.value), roughness: 0.7 }));
      m.position.set(pl.x, y + 1.15, pl.z); m.rotation.y = yaw; g.add(m);
      for (const dx of [-0.3, 0.3]) { const q = new THREE.Mesh(post, postMat); q.position.set(pl.x + Math.cos(yaw) * dx, y + 0.65, pl.z - Math.sin(yaw) * dx); g.add(q); }
      m.userData.board = { turn: b.turn, value: pl.value, side: pl.side, sideEstimated: pl.sideEstimated };
    }
  }
  world.group.add(g);
}
// The corners' numbers and the braking boards need F1's corner data, which can arrive after the world is built: added
// once it's there (before, a world built first never got them)
function cornerMarks() {
  if (!world || world.cornersAdded || !app().circuit?.corners?.length) return;
  world.cornersAdded = true; addCorners(); addBoards();
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
  // (held to 60 a second: every other refresh of a 120 Hz screen is left out, evenly)
  if (perf.cap && now - lastT < 1000 / 60 - 4) { requestAnimationFrame(frame); return; }
  const dt = Math.min(0.1, (now - lastT) / 1000 || 0.016); lastT = now;
  ensureWorld(now);
  cornerMarks();
  const A = app();
  if (world && A?.src) updateCars(dt);
  if (world) updateCamera(dt);
  if (devRec) devRec(now, dt);
  updateSun(now);
  thinFarTrees();
  world?.real?.stands?.update(camera.position, camMode === "heli" || camMode === "inspect" ? 520 : 300);
  realPart("buildings")?.userData.update?.(camera.position);
  realPart("facilities")?.userData.update?.(camera.position);
  updatePitTeams();
  if (!devNoHud) paintHud();
  // glare points: pixels per metre at 1 m away, fading into the haze as the fog does; time for blinking lights
  NL.time.value = now / 1000;
  GLOW.scale.value = renderer.getDrawingBufferSize(tmpV2).y / (2 * Math.tan((camera.fov * Math.PI) / 360));
  GLOW.fade.value.set(scene.fog.near, scene.fog.far);
  if (devGpu) devGpu.begin();
  devShadowDrawn = renderer.shadowMap.needsUpdate;
  renderer.render(scene, camera);
  if (devGpu) devGpu.end();
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
    // (all of them within 380 m, thinning with distance beyond – a forest far off reads the same with fewer)
    const f = Math.max(0.1, Math.min(1, 380 / Math.max(1, d)));
    im.count = Math.max(1, Math.round(full * f));
  }
}

// Keeps the frame rate up on slower machines: render at a lower pixel ratio while frames are slow (over
// ~25 ms on average for 2 s), and step back up when there's room again.
const perf = { acc: 0, n: 0, since: 0, ratio: 0, fps: 0, spikes: 0, worst: 0, frames: 0 };
// The 3D view's quality setting (🛰 map settings): how sharp vs. how smooth. Resolution is the GPU's biggest cost
// (measured on an M3, Retina: ~48 ms a frame at 2×, ~33 at 1.5×, ~16 at 1×), so each choice is a range of drawing
// scales and an order of what gives way first when frames come late:
//   선명 (sharp)   – the screen's full scale (up to 2×), never lowered: when the GPU can't keep up, an even 60 a second
//   균형 (balanced, default) – starts at 1.5× (on a Retina screen hard to tell from 2×); late → an even 60 a second,
//                    still late → lower, down to 1×; back up to 1.5× after a calm while
//   부드러움 (smooth) – starts at 1.25×; late → lower first (to 1×) to keep the screen's full rate, an even 60 last
// The choice is the user's: no level drops below its range or rises above it.
const QUALITY = { sharp: [2, 2, "cap"], balanced: [1, 1.5, "cap"], smooth: [1, 1.25, "lower"] };
function qualityRange() {
  const q = QUALITY[geoSettings().quality] ? geoSettings().quality : "balanced", [lo, hi, first] = QUALITY[q], dpr = devicePixelRatio || 1;
  return { q, min: Math.min(lo, dpr), max: Math.min(hi, dpr), first };
}
// (a new choice: its top scale at once, the pace measured afresh)
function applyQuality() {
  const { max } = qualityRange();
  perf.ratio = max; perf.changedAt = performance.now(); resetPace();
  renderer.setPixelRatio(max); resize();
}
function adaptResolution(now, dt) {
  const Q = qualityRange();
  if (!perf.ratio) perf.ratio = Q.max;
  perf.acc += dt; perf.n++; perf.frames++;
  if (dt > 0.03) { perf.spikes++; perf.spikesNow = (perf.spikesNow || 0) + 1; }   // a frame longer than ~2 at 60 Hz: a visible hitch
  perf.worst = Math.max(perf.worst, dt);
  // the screen's refresh interval: the shortest frame-to-frame gaps seen (120 Hz → 8.3 ms, 60 Hz → 16.7 ms)
  perf.minDt = Math.min(perf.minDt ?? 1, dt);
  // a late frame: one that missed its refresh (longer than 1.5 intervals of the pace it's drawn at)
  const pace = perf.cap ? 1 / 60 : perf.vsync || 1 / 60;
  if (dt > pace * 1.5) perf.lateNow = (perf.lateNow || 0) + 1;
  if (now - perf.since < 2000) return;
  const avg = perf.acc / perf.n, late = (perf.lateNow || 0) / Math.max(1, perf.n);
  perf.vsync = perf.minDt < 0.0105 ? 1 / 120 : perf.minDt < 0.0185 ? 1 / 60 : perf.minDt; perf.minDt = 1;
  perf.fps = Math.round(1 / avg); perf.acc = 0; perf.n = 0; perf.since = now; perf.windowSpikes = perf.spikesNow || 0; perf.spikesNow = 0; perf.lateNow = 0; perf.late = +late.toFixed(3);
  if (!document.getElementById("geo3dPop")?.hidden) paintQualityNow();
  if (perf.lockRatio) return;
  // Steady pacing first: frames that come at uneven intervals (8 ms, 17 ms, 8 ms… on a 120 Hz screen when the GPU
  // can't keep up) look like the picture shaking, worst in the cockpit cameras. When more than 1 frame in 12 is late,
  // the quality's first remedy: an even 60 a second (every other refresh of a 120 Hz screen – no change of size, no
  // stall) or a lower scale; then the other. Each change of size stalls ~100 ms: down at most every 4 s, up only after
  // 30 s of calm windows well inside the pace.
  const since = now - (perf.changedAt || 0), canCap = !perf.cap && perf.vsync < 0.0105;
  let r = Math.max(Q.min, Math.min(Q.max, perf.ratio));
  if (late > 0.08) {
    perf.calm = 0;
    const lower = r > Q.min && since > 4000;
    if (canCap && (Q.first === "cap" || r <= Q.min)) { perf.cap = true; return; }
    if (lower) r = Math.max(Q.min, r - 0.25);
  } else if (late === 0 && !perf.windowSpikes) perf.calm = (perf.calm || 0) + 1; else perf.calm = 0;
  if (r === perf.ratio && !perf.cap && perf.calm >= 15 && avg < pace * 0.8 && since > 30000 && r < Q.max) r = Math.min(Q.max, r + 0.25);
  if (r !== perf.ratio) { perf.ratio = r; perf.changedAt = now; perf.calm = 0; renderer.setPixelRatio(r); resize(); }
}
// The pace is set again when the view or the camera changes (what's on screen and its cost change with them).
function resetPace() { perf.cap = false; perf.calm = 0; perf.lateNow = 0; }

// (development: this circuit's corners – F1's numbers and places – on the lap's samples)
async function standCorners() {
  const A = app(), key = A.circuitKey?.(), year = A.sessionYear?.();
  const c = key != null ? await window.api.trackCircuit(key, year).catch(() => null) : null;
  return (c?.corners || []).map((k) => { const [s] = world.grid.nearest(k.x * DM - world.center.x, -(k.y * DM - world.center.z), 3); return s ? { n: k.n, i: s.i } : null; }).filter(Boolean);
}
// (metres along the lap from sample i to sample j, the short way round: + j after i)
function alongTo(i, j) { const n = world.n, step = world.samples[0].p.distanceTo(world.samples[1].p); let d = ((j - i) % n + n) % n; if (d > n / 2) d -= n; return d * step; }
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
  // development: the GPU's own time for drawing the 3D view (EXT_disjoint_timer_query_webgl2), median and 90th
  // percentile over `n` frames, ms
  gpuTime(n = 60) {
    const gl = renderer.getContext(), ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    if (!ext) return Promise.resolve("no timer");
    return new Promise((done) => {
      const pending = [], got = [];
      devGpu = {
        begin() { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); pending.push(q); },
        end() {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) { const q = pending.shift(); if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) got.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); }
          if (got.length >= n) { devGpu = null; pending.forEach((q) => gl.deleteQuery(q)); const s = got.sort((a, b) => a - b); done(JSON.stringify([+s[Math.floor(s.length / 2)].toFixed(2), +s[Math.floor(s.length * 0.9)].toFixed(2)])); }
        },
      };
    });
  },
  // development: who flags geometry for upload, over `secs` – by the line that set needsUpdate, with counts and bytes
  traceUploads(secs = 3) {
    const seen = new Map(), tally = (kind, bytes) => { const at = kind + " @ " + (new Error().stack || "").split("\n").slice(3, 7).map((l) => l.trim().replace(/^at /, "").replace(/\(?file:.*\/(\w+\.js):(\d+):\d+\)?/, "$1:$2")).join(" < "); const e = seen.get(at) || [0, 0]; e[0]++; e[1] += bytes; seen.set(at, e); };
    const BA = THREE.BufferAttribute.prototype, d = Object.getOwnPropertyDescriptor(BA, "needsUpdate"), sa = THREE.BufferGeometry.prototype.setAttribute;
    Object.defineProperty(BA, "needsUpdate", { configurable: true, set(v) { if (v === true) tally("needsUpdate", this.array?.byteLength || 0); d.set.call(this, v); } });
    THREE.BufferGeometry.prototype.setAttribute = function (n, a) { tally("setAttribute " + n, a?.array?.byteLength || 0); return sa.call(this, n, a); };
    const gl = renderer.getContext(), bd = gl.bufferData, bs = gl.bufferSubData; let nbd = 0, bbd = 0, nbs = 0, bbs = 0;
    gl.bufferData = function (t, x, u) { nbd++; bbd += x?.byteLength || 0; return bd.apply(this, arguments); };
    gl.bufferSubData = function (t, o, x) { nbs++; bbs += x?.byteLength || 0; return bs.apply(this, arguments); };
    return new Promise((done) => setTimeout(() => {
      Object.defineProperty(BA, "needsUpdate", d); THREE.BufferGeometry.prototype.setAttribute = sa; gl.bufferData = bd; gl.bufferSubData = bs;
      done(JSON.stringify({ bufferData: [nbd, Math.round(bbd / 1048576) + " MB"], bufferSubData: [nbs, Math.round(bbs / 1048576) + " MB"], who: [...seen].sort((a, b) => b[1][1] - a[1][1]).slice(0, 12).map(([k, [n, b]]) => [k, n, Math.round(b / 1024) + " KB"]) }));
    }, secs * 1000));
  },
  // development: what the viewer sees move during real playback, frame by frame for `secs` – the camera's turn and
  // height, the focused car's steer and steering wheel – each split into its slow part and the rest (jitter: the
  // residual from a ±0.25 s fit, RMS, and the largest frame-to-frame jump), and the frame times.
  recordLive(secs = 8) {
    return new Promise((done) => {
      const r = { t: [], dt: [], yaw: [], pitch: [], roll: [], y: [], side: [], steer: [], wheel: [], st: [] }, e = new THREE.Euler(), t0 = performance.now();
      devRec = (now, dt) => {
        const c = cars.get(app().focus || leader()); if (!c) return;
        e.setFromQuaternion(camera.quaternion, "YXZ");
        r.t.push(now); r.dt.push(dt * 1000); r.yaw.push(e.y); r.pitch.push(e.x); r.roll.push(e.z); r.y.push(camera.position.y);
        r.side.push(camera.position.x * Math.cos(c.yaw) - camera.position.z * Math.sin(c.yaw));
        r.steer.push(c.steer || 0); r.wheel.push(c.model.userData.wheel?.rotation.z || 0); r.st.push(app().t); (r.sh || (r.sh = [])).push(devShadowDrawn ? 1 : 0);
        if (now - t0 > secs * 1000) {
          devRec = null;
          const un = (a) => { const o = a.slice(); for (let i = 1; i < o.length; i++) o[i] = o[i - 1] + wrap(a[i] - a[i - 1]); return o; };
          // (fit over ±0.25 s of frames by time)
          const resid = (a) => a.map((v, i) => { let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0; for (let j = 0; j < a.length; j++) { const x = (r.t[j] - r.t[i]) / 1000; if (Math.abs(x) > 0.25) continue; n++; sx += x; sy += a[j]; sxx += x * x; sxy += x * a[j]; } const b = (n * sxy - sx * sy) / Math.max(1e-12, n * sxx - sx * sx); return v - (sy - b * sx) / n; });
          const stat = (a, k) => { const q = resid(a).slice(20, -20); let jump = 0; for (let i = 21; i < a.length - 20; i++) jump = Math.max(jump, Math.abs(a[i] - a[i - 1])); return { rms: +(Math.sqrt(q.reduce((x, y) => x + y * y, 0) / Math.max(1, q.length)) * k).toFixed(3), jump: +(jump * k).toFixed(3) }; };
          const D = 57.2958, dts = r.dt.slice().sort((a, b) => a - b), q = (p) => +dts[Math.floor(p * (dts.length - 1))].toFixed(1);
          let back = 0; for (let i = 1; i < r.st.length; i++) if (r.st[i] - r.st[i - 1] <= 0) back++;
          const slow = []; for (let i = 0; i < r.dt.length; i++) if (r.dt[i] > 25) slow.push([Math.round(r.t[i] - t0), Math.round(r.dt[i]), r.sh[i - 1] ? "shadow" : r.sh[i] ? "shadow+" : ""]);
          const shadows = r.sh.reduce((a, b) => a + b, 0);
          done(JSON.stringify({ frames: r.t.length, dtMs: [q(0.5), q(0.95), q(0.99)], streamStill: back, shadowRedraws: shadows, slow: slow.slice(0, 60),
            camYawDeg: stat(un(r.yaw), D), camPitchDeg: stat(r.pitch, D), camRollDeg: stat(r.roll, D), camHeightCm: stat(r.y, 100), camSideCm: stat(r.side, 100),
            steerDeg: stat(r.steer, D), wheelDeg: stat(r.wheel, D) }));
        }
      };
    });
  },
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
  // development: the pit lane across – every 20 m between the limiter lines: the track's side and how far its edge is
  // from the measured pit path (the feed's line, the fast lane), and (with a pit building) how far its garage fronts are
  pitAcross() {
    const P = world?.pitLane, F = world?.frame; if (!P) return JSON.stringify({ ok: false, info: world?.pitInfo });
    let G = null; world?.real?.group.getObjectByName("facilities")?.traverse((o) => { if (!G && o.userData?.garages) G = o.userData.garages; });
    const o = {}, rows = [];
    for (let u = Math.max(20, P.limitOn); u <= Math.min(P.len - 20, P.limitOff); u += 20) {
      pitLaneAt(u, o); const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw), nx = -fz, nz = fx;
      const pr = F.project(o.x, o.z); if (!pr) continue;
      const smp = pr.sample, side = pr.d >= 0 ? -1 : 1;   // (+1: the track lies in −n direction from the lane… sign of n towards the track)
      const half = pr.d >= 0 ? edgeOf(smp, 1) : -edgeOf(smp, -1);
      const toEdge = Math.abs(pr.d) - half;   // path → nearest track edge (m)
      // which way n points relative to the track: n·(track point − lane point)
      const tp = [0, 0, 0]; F.at(pr.s, 0, tp); const nTrack = Math.sign((tp[0] - o.x) * nx + (tp[2] - o.z) * nz);
      let garage = null;
      if (G) { let best = Infinity; for (const sl of G.slots) { const dx = sl.front[0] - o.x, dz = sl.front[1] - o.z, along = dx * fx + dz * fz; if (Math.abs(along) > 15) continue; const lat = (dx * nx + dz * nz) * -nTrack; if (Math.abs(along) < best) { best = Math.abs(along); garage = +lat.toFixed(1); } } }
      // the first thing built on the garage side: a level ray 1.5 m up, out to 45 m
      const rc = new THREE.Raycaster(new THREE.Vector3(o.x, o.y + 1.5, o.z), new THREE.Vector3(-nx * nTrack, 0, -nz * nTrack), 0.5, 45); rc.camera = camera;
      const hit = world.real ? rc.intersectObject(world.real.group, true).find((h) => h.object.visible !== false && !h.object.isSprite) : null;
      const nm = hit ? (() => { let x = hit.object; while (x && !x.name) x = x.parent; return x?.name || hit.object.type; })() : null;
      rows.push([Math.round(u), +toEdge.toFixed(1), +Math.abs(pr.d).toFixed(1), garage, hit ? +hit.distance.toFixed(1) : null, nm]);
    }
    return JSON.stringify({ ok: true, loc: app().location(), facility: G?.facility || null, len: Math.round(P.len), rows });
  },
  // development: car num against the pit building's garages – along them (u), how far out it is drawn and where the
  // feed has it, its speed, its team's box
  // development: the crews as placed this frame – a checksum of every instance's place (the same moment shows the
  // same: compared after seeks, pauses, speeds) and the cars lifted (model height, pitch, wheels on)
  // development: the pit states from t0 to t1 (ms) every `step` ms without drawing – the moments some car was in one of
  // `states` (default: waiting behind a teammate in the box): [[t, num, state, u]]
  pitScan(t0, t1, step = 500, states = ["waiting (double stack)"]) {
    const src = app().src, out = [];
    for (let t = t0; t <= t1; t += step) { const f = pitFrame(src, t, 0, true); if (!f) continue; for (const r of f.values()) if (states.includes(r.state.state)) out.push([t, r.num, r.state.state, r.u == null ? null : Math.round(r.u)]); }
    return JSON.stringify(out);
  },
  // development: the grandstands as built – each with the nearest corner (F1's corner numbers for this circuit and
  // season), which side of the track it is on (L/R in the race's direction), how far along from that corner (m), its
  // front's ends (lat, lon), rows, seats, roof – and the listed ones that couldn't be built, with why
  async standsReport() {
    const R = world?.real, L = R?.stands?.info?.list || []; if (!R) return JSON.stringify({ real: false });
    const corners = await standCorners();
    const out = L.map((st) => {
      const [cx, , cz] = st.c, [s] = world.grid.nearest(cx, cz, 3), lat = s ? (cx - s.p.x) * s.nor.x + (cz - s.p.z) * s.nor.z : null;
      const near = s && corners.length ? corners.map((k) => ({ n: k.n, d: alongTo(k.i, s.i) })).sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0] : null;
      return { n: st.n, kind: st.kind, rows: st.rows, seats: st.seats, len: st.len, roof: st.roof, outline: (st.outline || []).map(([x, z]) => R.geo.toLL(x, z).map((v) => +v.toFixed(6))), side: lat == null ? null : lat > 0 ? "R" : "L", lat: lat && Math.round(lat), turn: near?.n ?? null, along: near ? Math.round(near.d) : null, ll: R.geo.toLL(cx, cz).map((v) => +v.toFixed(6)) };
    });
    const track = []; for (let i = 0; i < world.n; i += 5) { const s = world.samples[i]; track.push([...R.geo.toLL(s.p.x + s.nor.x * (s.L ?? 7), s.p.z + s.nor.z * (s.L ?? 7)), ...R.geo.toLL(s.p.x + s.nor.x * (s.R ?? -7), s.p.z + s.nor.z * (s.R ?? -7))].map((v) => +v.toFixed(6))); }
    const cl = corners.map((k) => ({ n: k.n, ll: R.geo.toLL(world.samples[k.i].p.x, world.samples[k.i].p.z).map((v) => +v.toFixed(6)) }));
    const mapped = (R.scene?.buildings || []).filter((b) => b.kind === "grandstand").map((b) => ({ name: b.name, ll: b.pts.map(R.geo.xz).map(([x, z]) => R.geo.toLL(x, z).map((v) => +v.toFixed(6))) }));
    // (the map's other buildings near the track – what a stand may be mapped as, or blocked by)
    const others = (R.scene?.buildings || []).filter((b) => b.kind !== "grandstand" && !(b.min > 3)).map((b) => ({ b, pts: b.pts.map(R.geo.xz) }))
      .filter(({ pts }) => pts.some(([x, z]) => (world.grid.nearest(x, z, 2)[1] ?? 999) < 70))
      .map(({ b, pts }) => ({ name: b.name || null, h: b.h, ll: pts.map(([x, z]) => R.geo.toLL(x, z).map((v) => +v.toFixed(6))) }));
    return JSON.stringify({ loc: app().location?.(), key: app().circuitKey?.(), year: app().sessionYear?.(), info: { ...R.info.stands, skipped: R.stands?.info.skipped, dropped: R.stands?.info.dropped, unmatched: R.scene?.stands?.unmatched || [] }, stands: out, track, corners: cl, mapped, others });
  },
  // development: grandstand ends for the data file from places along the track: [{ n, turn, d0, d1, side, off }] – from
  // corner `turn` (F1's numbering), d0 to d1 m along the track (− before it), `off` m beyond the tarmac's edge on that
  // side (L / R in the race's direction) → [{ n, a: [lat, lon], b: [lat, lon] }]
  async standPoints(specs) {
    const R = world?.real; if (!R) return "no real";
    const corners = await standCorners(), n = world.n, step = world.samples[0].p.distanceTo(world.samples[1].p);
    return JSON.stringify(specs.map((sp) => {
      const k = corners.find((c) => c.n === sp.turn); if (!k) return { n: sp.n, error: "no corner " + sp.turn };
      const pt = (d) => { const s = world.samples[((k.i + Math.round(d / step)) % n + n) % n], side = sp.side === "R" ? 1 : -1, o = side > 0 ? (s.L ?? 7) + (sp.off ?? 14) : (s.R ?? -7) - (sp.off ?? 14); return R.geo.toLL(s.p.x + s.nor.x * o, s.p.z + s.nor.z * o).map((v) => +v.toFixed(7)); };
      return { n: sp.n, a: pt(sp.d0), b: pt(sp.d1) };
    }));
  },
  // development: look at a team's pit wall stand from the pit lane (side: + towards its garage) – dist m away, h up
  viewWallStand(team, dist = 6, h = 1.8, along = 0, fov = 55) {
    const tm = pitTeams.teams?.find((q) => q.team.toLowerCase().includes(String(team).toLowerCase())); const w = tm && pitTeams.G?.wallAt?.(tm.box);
    if (!w) return "no stand";
    const [x, y, z] = w.p, [ox, oz] = w.out, [ax, az] = w.along;
    return this.look(x + ox * dist + ax * along, y + h, z + oz * dist + az * along, x, y + 1.2, z, fov) + ` seats ${tm.wallStand?.seats} (${tm.wallStand?.from})`;
  },
  // development: moments two cars of one team were both drawn in the box lane within `near` m of each other along it
  // (a double stack's second car on top of the first): [[t, a, b, stateA, stateB, du]]
  pitPairs(t0, t1, step = 500, near = 7) {
    const src = app().src, out = [];
    for (let t = t0; t <= t1; t += step) {
      const f = pitFrame(src, t, 0, true); if (!f) continue;
      const v = [...f.values()].filter((r) => r.u != null && r.state.lane === "box" && r.state.w > 0.3);
      for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (v[i].team && v[i].team === v[j].team && Math.abs(v[i].u - v[j].u) < near) out.push([t, v[i].num, v[j].num, v[i].state.state, v[j].state.state, +(v[i].u - v[j].u).toFixed(1)]);
    }
    return JSON.stringify(out);
  },
  // development: a test fixture – the track's samples and the map's raceway / road / path lines within r m of (lat, lon),
  // in scene metres (for auxroads tests on a real junction)
  auxFixture(lat, lon, r = 250) {
    const R = world?.real; if (!R?.scene) return "no map";
    const [x, z] = R.geo.fromLL(lat, lon), near = (p) => Math.hypot(p[0] - x, p[1] - z) < r, f = (v) => +v.toFixed(2);
    const samples = world.samples.filter((s) => Math.hypot(s.p.x - x, s.p.z - z) < r + 60).map((s) => ({ i: s.i, p: [f(s.p.x), f(s.p.z)], tan: [f(s.tan.x), f(s.tan.z)], nor: [f(s.nor.x), f(s.nor.z)], L: f(s.L ?? 7), R: f(s.R ?? -7) }));
    const lines = R.scene.lines.filter((l) => ["raceway", "road", "path"].includes(l.k)).map((l) => ({ k: l.k, sub: l.sub, w: l.w, bridge: l.bridge, tunnel: l.tunnel, pts: l.pts.map(R.geo.xz).map(([a, c]) => [f(a), f(c)]) })).filter((l) => l.pts.some(near));
    return JSON.stringify({ lat, lon, samples, lines });
  },
  // development: the venue's other tarmac strips (auxroads.js) within r m of (lat, lon): kind, width, joins, length
  auxNear(lat, lon, r = 200) {
    const R = world?.real; if (!R?.aux) return "no aux";
    const [x, z] = R.geo.fromLL(lat, lon);
    return JSON.stringify(R.aux.filter((a) => a.pts.some(([p, q]) => Math.hypot(p - x, q - z) < r)).map((a) => ({ k: a.k, sub: a.sub, w: a.w, joins: a.joins, n: a.pts.length, ll: a.pts.map(([p, q]) => R.geo.toLL(p, q).map((v) => +v.toFixed(6))) })));
  },
  // development: the map's lines (roads, raceways, paths, barriers) within r m of (lat, lon): kind, sub-kind, width,
  // bridge, the distance of each end from the track's centre line, and the line (lat, lon)
  linesNear(lat, lon, r = 150, kinds = ["raceway", "road", "path"]) {
    const R = world?.real; if (!R?.scene) return "no map";
    const [x, z] = R.geo.fromLL(lat, lon), out = [];
    for (const l of R.scene.lines) {
      if (!kinds.includes(l.k)) continue;
      const pts = l.pts.map(R.geo.xz);
      if (!pts.some(([a, c]) => Math.hypot(a - x, c - z) < r)) continue;
      const td = ([a, c]) => Math.round(world.grid.nearest(a, c, 3)[1] ?? 999);
      out.push({ k: l.k, sub: l.sub, w: l.w, bridge: l.bridge, n: pts.length, d0: td(pts[0]), d1: td(pts[pts.length - 1]), dmin: Math.min(...pts.map(td)), dmax: Math.max(...pts.map(td)), ll: pts.map(([a, c]) => R.geo.toLL(a, c).map((v) => +v.toFixed(6))) });
    }
    return JSON.stringify(out);
  },
  // development: the map's buildings and stand outlines within r m of (lat, lon) or a listed stand's ends – kind, name,
  // height, area, distance, whether the grandstands treat it as an obstacle (area > 900 m² or over 14 m)
  mapNear(lat, lon, r = 120) {
    const R = world?.real; if (!R?.scene) return "no map";
    const [x, z] = R.geo.fromLL(lat, lon), out = [];
    for (const b of R.scene.buildings) {
      const pts = b.pts.map(R.geo.xz); let cx = 0, cz = 0; for (const [a, c] of pts) { cx += a; cz += c; } cx /= pts.length; cz /= pts.length;
      const d = Math.hypot(cx - x, cz - z); if (d > r) continue;
      let A = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) A += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
      out.push({ kind: b.kind, name: b.name, h: b.h, area: Math.round(Math.abs(A / 2)), d: Math.round(d), blocks: b.kind !== "grandstand" && (Math.abs(A / 2) > 900 || b.h > 14), ll: R.geo.toLL(cx, cz).map((v) => +v.toFixed(6)), min: b.min || 0, ...(r <= 80 ? { pts: pts.map(([x, z]) => R.geo.toLL(x, z).map((v) => +v.toFixed(7))) } : {}) });
    }
    return JSON.stringify(out.sort((a, b) => a.d - b.d).slice(0, 25));
  },
  crewState() {
    let h = 0, n = 0;
    for (const m of world?.crews?.group.children || []) for (let i = 0; i < m.count; i++) { const e = m.instanceMatrix.array; for (let k = 12; k < 15; k++) { h = (h * 31 + Math.round(e[i * 16 + k] * 100)) | 0; } n++; }
    const lifted = [...cars.values()].filter((c) => c.lifted).map((c) => ({ num: c.num, y: +c.model.position.y.toFixed(3), wheels: c.model.userData.wheels.map((w) => (w.visible ? 1 : 0)).join(""), pos: c.pos.toArray().map((v) => +v.toFixed(3)), raw: c.raw?.toArray().map((v) => +v.toFixed(3)), yaw: +c.yaw.toFixed(4) }));
    return JSON.stringify({ t: app().t, instances: n, hash: h, lifted, note: document.getElementById("pitWorkNote")?.hidden === false ? document.getElementById("pitWorkNote").textContent : null });
  },
  pitCar(num) {
    const G = pitTeams.G, c = cars.get(String(num)); if (!G || !c) return JSON.stringify({ G: !!G, car: !!c });
    const p = G.project(c.pos.x, c.pos.z), r = c.feedPos ? G.project(c.feedPos.x, c.feedPos.z) : null, team = app().src?.state.DriverList?.[num]?.TeamName;
    return JSON.stringify({ t: app().t, u: +p.u.toFixed(1), off: +p.off.toFixed(2), feedOff: r && +r.off.toFixed(2), speed: +c.speed.toFixed(1), box: pitTeams.teams?.find((x) => x.team === team)?.box ?? null, gStart: Math.round(G.gStart), gEnd: Math.round(G.gEnd),
      state: c.pit?.state?.state || null, lane: c.pit?.state?.lane || null, w: c.pit?.state ? +c.pit.state.w.toFixed(2) : null, evidence: c.pit?.state?.evidence || null, fastC: c.pit?.at ? +c.pit.at.fastC.toFixed(2) : null, boxC: c.pit?.at ? +c.pit.at.boxC.toFixed(2) : null,
      lastBox: c.pit?.input?.lastBox || null, stillFor: c.pit?.input ? +c.pit.input.stillFor.toFixed(1) : null, tel: app().src?.carAt?.(String(num), app().t)?.speed ?? null,
      yOverFloor: c.pit?.at ? +(c.obj.position.y - c.pit.at.floor).toFixed(3) : null, yawDeg: +(c.yaw * 57.3).toFixed(1), crews: world.crews ? world.crews.group.children.reduce((a, m) => a + m.count, 0) : 0 });
  },
  // development: what is seen at screen point (x, y: −1…1) – the first few objects a ray from the camera meets, named
  // by their nearest named parent, with the distance and whether their material is shown
  hitAt(x = 0, y = 0) {
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(x, y), camera); rc.camera = camera;
    const name = (o) => { const out = []; let q = o; while (q && out.length < 3) { if (q.name) out.push(q.name); q = q.parent; } return out.join("<") || o.type; };
    return JSON.stringify(rc.intersectObject(scene, true).filter((h) => !h.object.isSprite).slice(0, 5).map((h) => [name(h.object), +h.distance.toFixed(2), h.object.visible]));
  },
  // development: the pit lane across, along the garages (every `every`-th garage): its floor height, the ground's and
  // the track model's height out from the front (0, 4, 8, 12 m), how far the track's tarmac edge is, where the pit wall
  // stands (from the facility's wall, if it has one), and the cars in front of the garages: drawn height over the floor
  pitProbe(every = 4) {
    const G = pitTeams.G || (() => { let g = null; world?.real?.group.getObjectByName("facilities")?.traverse((o) => { if (!g && o.userData?.garages) g = o.userData.garages; }); return g; })();
    if (!G) return JSON.stringify({ ok: false });
    const F = world.frame, R = world.real, rows = [];
    for (let k = 0; k < G.slots.length; k += every) {
      const s = G.slots[k], out = [-s.inward[0], -s.inward[1]], at = (d) => [s.front[0] + out[0] * d, s.front[1] + out[1] * d];
      const gr = [0, 4, 8, 12].map((d) => { const [x, z] = at(d); return +(R?.groundAt ? R.groundAt(x, z) - s.floor : NaN).toFixed(2); });
      let edge = null; for (let d = 0; d < 60; d += 0.25) { const [x, z] = at(d), pr = F.project(x, z); if (pr && Math.abs(pr.d) <= Math.max(edgeOf(pr.sample, 1), -edgeOf(pr.sample, -1))) { edge = d; break; } }
      const w = G.wallAt?.(s.uc); const wallOff = w ? +G.project(w.p[0], w.p[2]).off.toFixed(1) : null;
      let trackY = null; if (edge != null) { const [x, z] = at(edge), pr = F.project(x, z); if (pr) trackY = +(pr.sample.p.y - s.floor).toFixed(2); }
      // the feed's pit path across here: the nearest path point in front of this garage (within ±6 m along it)
      let path = null; if (world.pitLane) { let best = Infinity; for (const q of world.pitLane.pts) { const pr = G.project(q.x, q.z); if (Math.abs(pr.u - s.uc) < 6 && Math.abs(pr.u - s.uc) < best) { best = Math.abs(pr.u - s.uc); path = +pr.off.toFixed(1); } } }
      rows.push({ k, u: Math.round(s.uc), floor: +s.floor.toFixed(2), groundOver: gr, path, edge, wallOff, trackOverFloor: trackY });
    }
    const pitCars = [...cars.values()].filter((c) => c.pit && c.obj.visible).map((c) => { const p = G.project(c.pos.x, c.pos.z), s = G.slots[Math.max(0, Math.min(G.slots.length - 1, Math.round((p.u - G.gStart) / G.pitch - 0.5)))]; return [c.num, Math.round(p.u), +p.off.toFixed(1), +(c.obj.position.y - s.floor).toFixed(3)]; });
    return JSON.stringify({ ok: true, facility: G.facility, n: G.slots.length, pitch: +G.pitch.toFixed(2), depth: G.slots[0].depth, rows, pitCars });
  },
  // development: out from each `every`-th garage's front at 0.6 m over its floor, the first thing in the way (name,
  // metres) – a wall the scenery drew between the pit lane and the track, a fence, the facility's own wall
  pitWallSeen(every = 5) {
    const G = pitTeams.G; if (!G) return "no garages";
    const out = [], rc = new THREE.Raycaster(); rc.camera = camera;
    const name = (o) => { const n = []; let q = o; while (q && n.length < 2) { if (q.name) n.push(q.name); q = q.parent; } return n.join("<") || o.type; };
    for (let k = 0; k < G.slots.length; k += every) {
      const s = G.slots[k]; rc.set(new THREE.Vector3(s.front[0] - s.inward[0] * 0.5, s.floor + 0.6, s.front[1] - s.inward[1] * 0.5), new THREE.Vector3(-s.inward[0], 0, -s.inward[1])); rc.far = 40;
      // (structures only: map barriers, the facilities, the generated walls – never the instanced seats and trees, which a
      // ray tests one by one)
      const targets = [world.real?.group.getObjectByName("barriers"), world.real?.group.getObjectByName("facilities"), world.group.getObjectByName("syntheticWalls")].filter(Boolean);
      const h = rc.intersectObjects(targets, true).filter((x) => x.object.visible !== false && !x.object.isSprite && !x.object.isInstancedMesh)[0];
      out.push([k, Math.round(s.uc), h ? +(h.distance + 0.5).toFixed(1) : null, h ? name(h.object) : null, +(pitModelFor(G).st[k].cs.wall ?? -1).toFixed(1)]);
    }
    return JSON.stringify(out);
  },
  // development: the pit lane's per-frame cost (pitFrame: every pit car's state; the crews), average over the frames
  pitCostMs(reset = false) { const r = { avgMs: +(pitCost.ms / Math.max(1, pitCost.frames)).toFixed(3), frames: pitCost.frames }; if (reset) { pitCost.ms = 0; pitCost.frames = 0; } return JSON.stringify(r); },
  // development: look at garage k of the pit building from `back` m out in the pit lane, `h` m up (`side` m along)
  // development: from inside garage k (`inside` m behind its front, `h` m up), looking out across the pit lane
  viewLane(k = 20, inside = 2, h = 2.5, side = 0, fov = 75) {
    let G = null; world?.real?.group.getObjectByName("facilities")?.traverse((o) => { if (!G && o.userData?.garages) G = o.userData.garages; });
    if (!G) return "no garages";
    const s = G.slots[Math.max(0, Math.min(G.slots.length - 1, k))], [ix, iz] = s.inward;
    return this.look(s.front[0] + ix * inside + s.along[0] * side, s.floor + h, s.front[1] + iz * inside + s.along[1] * side, s.front[0] - ix * 20 + s.along[0] * side, s.floor + 0.5, s.front[1] - iz * 20 + s.along[1] * side, fov);
  },
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
  // development: the chase camera's line of sight (los.js) against three.js' raycaster on this world's own occluders –
  // n segments from points round the track, any direction, 2–40 m – with how long the first grids took, what the
  // occluders are (meshes the grid answers for; the rest go to three.js), and the cost of placing the chase camera
  losCheck(n = 3000) {
    if (!world?.occluders?.length) return JSON.stringify({ occluders: 0 });
    const occ = world.occluders, kinds = { grid: 0, materialArray: 0, drawRange: 0, instanced: 0, other: 0 };
    let tris = 0;
    for (const m of occ) {
      const g = m.geometry; tris += g?.attributes?.position ? Math.round((g.index ? g.index.count : g.attributes.position.count) / 3) : 0;
      if (Array.isArray(m.material)) kinds.materialArray++; else if (m.isInstancedMesh) kinds.instanced++;
      else if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) kinds.drawRange++; else if (m.isSkinnedMesh || !g.attributes.position) kinds.other++; else kinds.grid++;
    }
    let seed = 5; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const o = new THREE.Vector3(), d = new THREE.Vector3(), rc = new THREE.Raycaster();
    // the first segment through each occluder builds its grid
    const g0 = performance.now();
    for (const m of occ) { if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere(); const c = m.geometry.boundingSphere.center.clone().applyMatrix4(m.matrixWorld); firstHit([m], o.copy(c).add(d.set(0, 1, 0)), d.set(0, -1, 0), 2); }
    const gridMs = performance.now() - g0;
    const segs = [];
    for (let k = 0; k < n; k++) {
      const s = world.samples[Math.floor(r() * world.n)];
      o.set(s.p.x + (r() - 0.5) * 80, s.p.y + 0.5 + r() * 15, s.p.z + (r() - 0.5) * 80); d.set(r() - 0.5, (r() - 0.5) * 0.6, r() - 0.5).normalize();
      segs.push([o.clone(), d.clone(), 2 + r() * 38]);
    }
    let hits = 0, diff = 0, worst = 0, tl = 0, tr = 0;
    for (const [a, b, far] of segs) {
      let t = performance.now(); const got = firstHit(occ, a, b, far); tl += performance.now() - t;
      t = performance.now(); rc.set(a, b); rc.far = far; const ref = rc.intersectObjects(occ, false)[0]?.distance ?? null; tr += performance.now() - t;
      if (ref != null) hits++;
      if ((got == null) !== (ref == null) || (ref != null && Math.abs(got - ref) > 1e-3)) { diff++; worst = Math.max(worst, ref == null || got == null ? Infinity : Math.abs(got - ref)); }
    }
    // the chase camera at each sample of the track (as updateCamera places it, heading along the track)
    let tc = 0, tw = 0, blocked = 0, unsafe = 0, low = 0, touching = 0, fellBack = 0, none = 0; const el = Math.atan2(2.4, 10.5), rr = Math.hypot(2.4, 10.5), groundAt = world.real?.groundAt ? (x, z) => world.real.groundAt(x, z) : null;
    const room = Math.max(0.35, nearRoom(0.3, 58, camera.aspect));
    for (let i = 0; i < world.n; i += 3) {
      const s = world.samples[i], head = new THREE.Vector3(s.p.x, s.p.y + 1.1, s.p.z), az = Math.atan2(s.tan.x, s.tan.z) + Math.PI;
      const t = performance.now(); const p = chasePlace(occ, head, az, el, rr, { groundAt, room }); const dt = performance.now() - t; tc += dt; tw = Math.max(tw, dt);
      if (!p.safe) { if (chaseFallback(occ, head, null, { room, groundAt })) fellBack++; else none++; }
      if (p.lift > 0 || p.pos.distanceTo(head) < rr - 0.01) blocked++;
      // (checked again from outside: over the ground, off the surfaces)
      if (!p.safe) unsafe++;
      if (groundAt && p.pos.y < groundAt(p.pos.x, p.pos.z) + 1.4 - 1e-6) low++;
      if (!clearAround(occ, p.pos, room)) touching++;
    }
    return JSON.stringify({ occluders: occ.length, tris, kinds, gridMs: Math.round(gridMs), rays: n, hits, diff, worst, losUs: +(tl / n * 1000).toFixed(1), raycastUs: +(tr / n * 1000).toFixed(1),
      chase: { spots: Math.ceil(world.n / 3), room: +room.toFixed(3), closer: blocked, unsafe, fellBack, none, low, touching, us: +(tc / Math.ceil(world.n / 3) * 1000).toFixed(1), worstUs: +(tw * 1000).toFixed(0),
        frames: chase.frames, unsafeFrames: chase.unsafe, heldFrames: chase.held, exposedFrames: chase.exposed } });
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
  // development: look at the start-light gantry from the grid (back m behind pole, h up)
  viewGantry(back = 22, h = 3, fov = 40) {
    const sl = world?.slots, p1 = sl?.get(1); if (!p1) return "no grid";
    const fx = Math.sin(p1.yaw), fz = Math.cos(p1.yaw);
    return this.look(p1.x - fx * back, p1.y + h, p1.z - fz * back, p1.x + fx * 6, p1.y + 6.4, p1.z + fz * 6, fov);
  },
  viewGrid(h = 22, back = 60, side = 14) {
    const sl = world?.slots; if (!sl) return "no grid";
    const p1 = sl.get(1), p12 = sl.get(12) || p1, fx = Math.sin(p1.yaw), fz = Math.cos(p1.yaw);
    return window.Map3D.look(p12.x - fx * back + fz * side, p12.y + h, p12.z - fz * back - fx * side, (p1.x + p12.x) / 2, p1.y, (p1.z + p12.z) / 2, 45);
  },
  // development: the grid model (where its slots came from, how well the cars fitted) and every car's grid state –
  // its slot (g, by published grid position or by order at a restart), how far along it is from it (delta, m), whether it
  // stands, and how far it is drawn into it (state: standing / arriving / leaving / free; along, across 0–1)
  gridState() {
    const cs = [...cars.values()].filter((c) => c.grid).map((c) => ({ num: c.num, ...c.grid, drawnOff: c.raw ? +Math.hypot(c.pos.x - c.raw.x, c.pos.z - c.raw.z).toFixed(2) : null })).sort((a, b) => a.g - b.g);
    const f = gridFieldsFor && world?.gridModel ? fieldAt(app().src, app().t) : null;
    const p1 = world?.gridModel?.slots.get(1), gf = world?.real?.geo, poleLL = p1 && gf ? gf.toLL(p1.x, p1.z).map((v) => +v.toFixed(6)) : null;
    const S = app().src ? startState(app().src, app().t) : null, ctx = S ? startCtxAt(S, app().t) : null;
    const lastLL = (() => { const sl = world?.gridModel?.slots, l = sl?.get(sl.size); return l && gf ? gf.toLL(l.x, l.z).map((v) => +v.toFixed(6)) : null; })();
    return JSON.stringify({ cost: { avgMs: +(gridCost.ms / Math.max(1, gridCost.frames)).toFixed(3), worstMs: +gridCost.worst.toFixed(2), frames: gridCost.frames }, model: world?.gridInfo || null, poleLL, lastLL, pit: world?.pitInfo || null,
      start: ctx ? { t: ctx.t, n: ctx.n, pending: !!ctx.pending, standing: ctx.standing, orderFrom: ctx.orderFrom, order: ctx.order } : null, pitExit: S?.hist.pitExitAt(app().t) ?? null, preStart: f?.preStart ?? null, cars: cs,
      drawn: [...cars.values()].filter((c) => c.obj.visible).length, estimated: [...cars.values()].filter((c) => c.obj.visible && c.est).map((c) => [c.num, c.est.kind, c.est.g, c.est.est]) });
  },
  // development: the grid as drawn – where it came from, every slot's place (first, middle, last in lat/lon and along
  // the lap), whether its paint is really seen (a ray straight down from 30 m over the box's front line has to reach the
  // paint before the road or anything else; and from the camera of viewGrid()), the start line, and the cars on it
  gridCheck() {
    const m = world?.gridModel, gf = world?.real?.geo;
    if (!m) return JSON.stringify({ ok: false, info: world?.gridInfo || null, pit: world?.pitInfo || null });
    const paint = world.group.getObjectByName("gridPaint"), fz = profileFor(app().sessionYear?.() || null).FZ;
    const rc = new THREE.Raycaster(), P = [0, 0, 0], down = new THREE.Vector3(0, -1, 0), targets = [world.group];
    rc.camera = camera;   // (labels are sprites: a raycast needs the camera to test them)
    const hitName = (o) => { let x = o; while (x && !x.name) x = x.parent; return x?.name || o.type; };
    const slots = [];
    for (const sl of m.slots.values()) {
      world.frame.at(sl.s + fz + GRID_RULES.frontGap - 0.06, sl.lat, P);
      rc.set(new THREE.Vector3(P[0], P[1] + 30, P[2]), down); rc.far = 60;
      const hits = rc.intersectObjects(targets, true).filter((h) => h.object.visible !== false && !h.object.isSprite);
      const first = hits[0], roadHit = hits.find((h) => h.object !== paint), paintHit = hits.find((h) => h.object === paint);
      // (a structure raised 4 m or more over the paint – a bridge across the track: Silverstone's Skybridge over the start
      // line, 2022 – hides it from straight above only; from the track's own cameras it is in view)
      const raised = !!first && first.object !== paint && !!paintHit && paintHit.distance - first.distance >= 4 && hits.filter((h) => h.distance < paintHit.distance).every((h) => paintHit.distance - h.distance >= 4);
      slots.push({ g: sl.g, s: +sl.s.toFixed(1), lat: +sl.lat.toFixed(2), seenFromAbove: !!first && first.object === paint, underRaised: raised, firstHit: first ? hitName(first.object) : null, overRoad: first && roadHit ? +(roadHit.distance - first.distance).toFixed(3) : null, ll: gf ? gf.toLL(sl.x, sl.z).map((v) => +v.toFixed(6)) : null });
    }
    const p1 = m.slots.get(1), last = m.slots.get(m.slots.size), mid = m.slots.get(Math.ceil(m.slots.size / 2));
    const L = world.frame.L, span = ((p1.s - last.s) % L + L) % L;
    const drawn = [...cars.values()].filter((c) => c.obj.visible);
    return JSON.stringify({ ok: true, info: world.gridInfo, pit: world.pitInfo, L: +L.toFixed(1), span: +span.toFixed(1), crossesLapStart: last.s > p1.s,
      first: slots[0], mid: slots[mid.g - 1], last: slots[slots.length - 1], seen: slots.filter((x) => x.seenFromAbove || x.underRaised).length, underRaised: slots.filter((x) => x.underRaised).map((x) => [x.g, x.firstHit]), notSeen: slots.filter((x) => !x.seenFromAbove && !x.underRaised).map((x) => [x.g, x.firstHit]),
      minOverRoad: Math.min(...slots.map((x) => x.overRoad ?? 9)), cars: { drawn: drawn.length, inSlot: drawn.filter((c) => c.grid?.state === "standing" || c.est?.est === "slot").length, estimated: drawn.filter((c) => c.est).length, pitQueue: drawn.filter((c) => c.est?.pit).length } });
  },
  // development: every car's raw place at time t (default now) – along the lap from pole's slot (m, + ahead), across,
  // its telemetry speed, the slot it would take (g) and how far it is from it, standing / on the track
  fieldAt(t = app().t) {
    const m = world?.gridModel; if (!m) return "no grid";
    const f = fieldAt(app().src, t), p1 = m.slots.get(1), L = world.frame.L;
    return JSON.stringify({ t, preStart: f.preStart, cars: [...f.cars.values()].map((c) => { const a = f.assign.get(c.num); let u = c.s - p1.s; u = ((u % L) + L * 1.5) % L - L / 2;
      // (and how far it is from the measured pit lane's path, and where along it)
      let pit = null; if (world.pitLane) { const q = [0, 0, 0]; world.frame.at(c.s, c.d, q); let best = Infinity, bu = 0; const P = world.pitLane.pts; for (let i = 0; i < P.length; i++) { const dd = Math.hypot(P[i].x - q[0], P[i].z - q[2]); if (dd < best) { best = dd; bu = world.pitLane.cum[i]; } } pit = [+best.toFixed(1), Math.round(bu)]; }
      return [c.num, c.gridPos, Math.round(u), +c.d.toFixed(1), Math.round(app().src.carAt?.(c.num, t)?.speed ?? -1), c.standing ? 1 : 0, c.onTrack ? 1 : 0, a ? a.g : null, a ? +a.delta.toFixed(1) : null, pit, c.position]; }).sort((x, y) => y[2] - x[2]) });
  },
  // development: look at slot g from `back` m behind it, `h` m up, `side` m to the left, towards `ahead` m in front
  viewSlot(g = 1, back = 12, h = 4, side = 0, ahead = 6, fov = 50) {
    const sl = world?.gridModel?.slots.get(g); if (!sl) return "no grid";
    return window.Map3D.look(sl.x - sl.tx * back + sl.nx * side, sl.y + h, sl.z - sl.tz * back + sl.nz * side, sl.x + sl.tx * ahead, sl.y, sl.z + sl.tz * ahead, fov);
  },
  // development: the lap line in latitude / longitude every `every` samples, with the left normal's bearing and the
  // drawn edges (m) – for measuring the tarmac against aerial imagery outside the app
  lapLL(every = 5) {
    const gf = world?.real?.geo; if (!gf) return "no map";
    const out = [];
    for (let i = 0; i < world.n; i += every) {
      const s = world.samples[i], [la, lo] = gf.toLL(s.p.x, s.p.z), [la2, lo2] = gf.toLL(s.p.x + s.nor.x, s.p.z + s.nor.z);
      out.push([+la.toFixed(7), +lo.toFixed(7), +(la2 - la).toExponential(5), +(lo2 - lo).toExponential(5), +edgeOf(s, 1).toFixed(2), +edgeOf(s, -1).toFixed(2), i]);
    }
    return JSON.stringify({ loc: app().location(), n: world.n, L: world.frame.L, pts: out });
  },
  // development: where points of the ridden car land on screen (0..1 from the top left) with the cockpit camera as it
  // is – for comparing with onboard footage. pts: { name: [x, y, z] in car metres }
  projectCar(pts) {
    const c = cars.get(app().focus || leader()); if (!c) return "no car";
    c.model.updateWorldMatrix(true, true); camera.updateMatrixWorld(true);
    const out = { fov: +camera.fov.toFixed(2), aspect: +camera.aspect.toFixed(3), pitch: +(c.model.rotation.x * 57.3).toFixed(2), roll: +(c.model.rotation.z * 57.3).toFixed(2) };
    for (const [k, p] of Object.entries(pts)) { const v = new THREE.Vector3(...p).applyMatrix4(c.model.matrixWorld).project(camera); out[k] = [+((v.x + 1) / 2).toFixed(3), +((1 - v.y) / 2).toFixed(3)]; }
    return JSON.stringify(out);
  },
  // development: the camera as it is – position, a point 10 m ahead, fov – to set the same view elsewhere with look()
  camState() { const d = new THREE.Vector3(); camera.getWorldDirection(d); const p = camera.position; return JSON.stringify([p.x, p.y, p.z, p.x + d.x * 10, p.y + d.y * 10, p.z + d.z * 10, camera.fov].map((v) => +v.toFixed(3))); },
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
      try { const m = JSON.parse(localStorage.getItem("f1kr:cam3d")); if (["heli", "chase", "onboard", "eye"].includes(m)) { camMode = m; paintCamButtons(); } } catch {}
    }
    if (visible) return;
    visible = true; resize(); resetPace(); lastT = performance.now(); requestAnimationFrame(frame);
  },
  hide() { visible = false; },
  dev(o) { if ("shadows" in o) { sun.castShadow = o.shadows; } if ("hud" in o) devNoHud = !o.hud; if ("labels" in o) devNoLabels = !o.labels; return "ok"; },
  // development: switch costly looks off to measure them – { roadGrain, carEnv, carNear, kerbRidge } (true = on)
  tune(o) {
    if ("roadGrain" in o && world?.road) { const m = world.road.material, g = roadGrainMaps(); m.normalMap = o.roadGrain ? g.normal : null; m.needsUpdate = true; }
    if ("carEnv" in o) for (const c of cars.values()) setCarEnvironment(c.model, o.carEnv ? carEnvironment(nightNow) : null, 1);
    if ("carNear" in o) for (const c of cars.values()) c.model.userData.near.visible = o.carNear;
    if ("carMaps" in o) for (const c of cars.values()) c.model.traverse((m) => { const x = m.material; if (!x?.isMeshStandardMaterial) return; if (!o.carMaps) { x.userData.devMaps ??= [x.normalMap, x.roughnessMap]; x.normalMap = null; x.roughnessMap = null; } else if (x.userData.devMaps) { [x.normalMap, x.roughnessMap] = x.userData.devMaps; } x.needsUpdate = true; });
    if ("ratio" in o) { perf.lockRatio = o.ratio; renderer.setPixelRatio(o.ratio); resize(); }
    if ("cap" in o) perf.cap = o.cap;
    if (o.hide) for (const [n, v] of Object.entries(o.hide)) { if (n === "cars") { for (const c of cars.values()) c.model.visible = !v; continue; } if (n === "road") { for (const m of [world.road, world.kerb, world.lines]) m.visible = !v; continue; } world.group.traverse((x) => { if (x.name === n) x.visible = !v; }); }
    if ("fog" in o) scene.fog.far = o.fog ? 5000 : 1e9;
    if ("sky" in o) scene.background = o.sky ? (nightNow ? nightSky : daySky) : new THREE.Color(0x8fb3d6);
    if ("all" in o) world.group.visible = o.all;
    if ("labels" in o) for (const c of cars.values()) c.label.sp.visible = o.labels;
    if (o.shadowSize) { sun.shadow.mapSize.set(o.shadowSize, o.shadowSize); sun.shadow.map?.dispose(); sun.shadow.map = null; refreshShadows(); }
    if (o.shadowType) { renderer.shadowMap.type = THREE[o.shadowType]; scene.traverse((x) => { if (x.material) [].concat(x.material).forEach((m) => { m.needsUpdate = true; }); }); refreshShadows(); }
    return "ok";
  },
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
  // development: show or hide the built grandstands (to compare the satellite picture under them)
  standsShown(v) { const g = world?.real?.stands?.group; if (g) g.visible = !!v; return String(!!g); },
  // development: (lat, lon) → scene [x, ground y, z] (to aim another build's look() at the same place)
  llToScene(lat, lon) { const R = world?.real; if (!R) return "no real"; const [x, z] = R.geo.fromLL(lat, lon); return JSON.stringify([+x.toFixed(2), +(R.groundAt?.(x, z) ?? 0).toFixed(2), +z.toFixed(2)]); },
  // development: the measured pit path (startdata.js) every `every` m – lat/lon, and how far the track's tarmac is from it on
  // each side (left / right of the path's direction, m; null beyond 60 m) and which lap sample that is
  pitPathProbe(every = 20) {
    const A = app(), pd = START_DATA[venueOf({ circuitKey: A.circuitKey?.(), location: A.location?.() })?.key]?.pit, R = world?.real;
    if (!pd || !R) return "no pit / map";
    const pts = pd.path.map((p) => [p[0] * DM - world.center.x, -(p[1] * DM - world.center.z)]), out = [];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az); acc += l; if (acc < every) continue; acc = 0;
      const tx = (bx - ax) / l, tz = (bz - az) / l, side = (sg) => { for (let d = 1; d <= 60; d += 0.5) { const x = bx - tz * sg * d, z = bz + tx * sg * d, [s, dd] = world.grid.nearest(x, z, 2); if (s && dd < (sg > 0 ? -(s.R ?? -7) : (s.L ?? 7)) + 0.5 && Math.abs(((x - s.p.x) * s.nor.x + (z - s.p.z) * s.nor.z)) <= Math.max(s.L ?? 7, -(s.R ?? -7))) return [d, s.i]; } return null; };
      out.push({ ll: R.geo.toLL(bx, bz).map((v) => +v.toFixed(6)), left: side(1), right: side(-1) });
    }
    return JSON.stringify({ n: world.n, limitOn: pd.limitOn, limitOff: pd.limitOff, len: Math.round(pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0)), out });
  },
  // development: every texture uploaded to the GPU and not yet disposed (three.js adds its 'dispose' listener on upload):
  // texTrack(true) starts recording, texList() → [{ uuid, name, type, size, owner }] – owner: where it is in the scene
  // now (object path), "pool" / "shared" if marked, or "detached" (on the GPU, reachable from nothing drawn)
  texTrack(on = true) {
    if (!TEXLOG) {
      TEXLOG = new Map();
      THREE.Object3D.prototype.onBeforeRender = function (r, sc, cam) { TEXLOG.last = this; TEXLOG.lastScene = sc; TEXLOG.lastCam = cam; };
      { const ob = THREE.Object3D.prototype.onBeforeShadow; THREE.Object3D.prototype.onBeforeShadow = function (r, o, cam, ...rest) { TEXLOG.last = this; TEXLOG.lastScene = "shadow"; TEXLOG.lastCam = cam; return ob.call(this, r, o, cam, ...rest); }; }
      const od = THREE.Texture.prototype.dispose; THREE.Texture.prototype.dispose = function () { this.userData.disposedAt = performance.now(); return od.call(this); };
      const orig = THREE.Texture.prototype.addEventListener;
      THREE.Texture.prototype.addEventListener = function (type, fn) {
        if (type === "dispose" && TEXLOG.on && !TEXLOG.has(this)) {
          TEXLOG.set(this, { t: performance.now(), key: world?.sourceKey || null, after: this.userData?.disposedAt ?? null, obj: (() => { const o = TEXLOG.last; if (!o) return null; const c = []; let p = o; while (p && c.length < 8) { c.push(p.name || p.type); p = p.parent; } return c.join('<') + ' | scene:' + (TEXLOG.lastScene === scene ? 'main' : (TEXLOG.lastScene?.type || '?')) + ' cam:' + (TEXLOG.lastCam === camera ? 'main' : (TEXLOG.lastCam?.type || '?')); })(), stack: (new Error().stack || '').split('\n').slice(3, 9).map((s) => s.trim().replace(/^at /, '').replace(/\(.*\/(\w+\.js):(\d+):\d+\)/, '$1:$2')).join(' < ') });
          const self = this; orig.call(this, "dispose", () => TEXLOG.delete(self));
        }
        return orig.call(this, type, fn);
      };
    }
    TEXLOG.on = on; return String(TEXLOG.size);
  },
  get _scene() { return scene; },
  texList() {
    const where = new Map();
    scene.traverse((o) => { for (const m of [].concat(o.material || [])) { if (!m) continue; for (const k in m) if (m[k]?.isTexture) where.set(m[k], (o.name || o.type) + "." + k); for (const t of m.userData?.ownedTextures || []) where.set(t, (o.name || o.type) + ".owned"); if (m.uniforms) for (const [k, u] of Object.entries(m.uniforms)) if (u?.value?.isTexture) where.set(u.value, (o.name || o.type) + ".u." + k); } });
    for (const [k, u] of Object.entries(GLOW || {})) if (u?.value?.isTexture) where.set(u.value, "GLOW." + k);
    for (const [k, u] of Object.entries(NL || {})) if (u?.value?.isTexture) where.set(u.value, "NL." + k);
    if (scene.environment) where.set(scene.environment, "scene.environment"); if (scene.background?.isTexture) where.set(scene.background, "scene.background");
    const out = [];
    for (const [tex, rec] of TEXLOG || []) {
      const im = tex.image, size = im ? `${im.width}x${im.height}` : "?";
      out.push({ disposedBefore: rec.after, obj: rec.obj, disposedAt: tex.userData?.disposedAt ?? null, upStack: rec.stack, from: tex.userData?.from || null, uuid: tex.uuid.slice(0, 8), name: tex.name || "", type: tex.constructor.name, size, owner: where.get(tex) || (tex.userData?.shared ? "shared" : "detached"), at: Math.round(rec.t), key: (rec.key || "").slice(-30) });
    }
    return JSON.stringify(out);
  },
  // development: the braking boards built (boards.js): turn, distance, side, lat/lon
  boardsInfo() { const g = world?.group.getObjectByName("brakeBoards"), R = world?.real; return JSON.stringify((g?.children || []).filter((m) => m.userData.board).map((m) => ({ ...m.userData.board, ll: R ? R.geo.toLL(m.position.x, m.position.z).map((v) => +v.toFixed(6)) : null, y: +m.position.y.toFixed(1) }))); },
  // development: from (lat, lon) h m above the ground towards (lat2, lon2) h2 m above it
  lookLLAt(lat, lon, h, lat2, lon2, h2 = 0, fov = 60) {
    const R = world?.real; if (!R) return "no real";
    const [x, z] = R.geo.fromLL(lat, lon), [x2, z2] = R.geo.fromLL(lat2, lon2), g = (a, c) => Math.max(R.groundAt?.(a, c) ?? 0, world.grid.nearest(a, c, 2)[1] < 12 ? world.grid.nearest(a, c, 2)[0].p.y : -1e9);
    return this.look(x, g(x, z) + h, z, x2, g(x2, z2) + h2, z2, fov);
  },
  // development: straight down on (lat, lon) from h m up (north at the top) – the satellite ground and what stands on it
  lookLL(lat, lon, h = 300, fov = 50) {
    const R = world?.real; if (!R) return "no real";
    const [x, z] = R.geo.fromLL(lat, lon), y = R.groundAt?.(x, z) ?? 0;
    setCam("heli"); controls.enabled = false; camMode = "inspect";
    camera.position.set(x, y + h, z); camera.up.set(0, 0, -1); camera.near = 1; camera.far = Math.max(camera.far, h * 4); camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(x, y, z); camera.up.set(0, 1, 0);
    return "ok";
  },
  look(px, py, pz, tx, ty, tz, fov = 50) {
    setCam("heli"); controls.enabled = false; camMode = "inspect";
    camera.position.set(px, py, pz); camera.near = 0.3; camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(tx, ty, tz);
    return "ok";
  },
  debug: () => JSON.stringify({ cam: camera?.position.toArray().map(Math.round), target: controls?.target.toArray().map(Math.round), fov: camera?.fov, aspect: camera?.aspect,
    size: world && [world.size.x, world.size.y, world.size.z].map(Math.round), host: host && [host.clientWidth, host.clientHeight], cars: cars.size, mode: camMode,
    paint: (() => { const c = cars.get(app()?.focus || leader()); const m = c?.model.children[1]?.material; return m && { color: m.color.getHexString(), emissive: m.emissive.getHexString(), ei: m.emissiveIntensity }; })(),
    sun: [sun?.color.getHexString(), sun && +sun.intensity.toFixed(2), sunDir.toArray().map((v) => +v.toFixed(2))], night: nightNow, follow: (() => { const c = cars.get(app()?.focus || leader()); if (!c) return null; const v = c.pos.clone().project(camera); return { pos: c.pos.toArray().map(Math.round), yaw: +c.yaw.toFixed(2), pitchDeg: +(c.pitch * 57.3).toFixed(2), modelPitchDeg: +(c.model.rotation.x * 57.3).toFixed(2), camPitchDeg: +(new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ").x * 57.3).toFixed(2), steer: +(c.steer || 0).toFixed(3), wheel: +(c.model.userData.wheel?.rotation.z || 0).toFixed(2), lod: c.model.userData.lod, chaseYaw: +chase.yaw.toFixed(2), speed: Math.round(c.speed), screen: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(3)], camDist: +camera.position.distanceTo(c.pos).toFixed(2), visible: c.obj.visible, inScene: !!c.obj.parent, est: c.est?.est || null }; })(), hitches: { frames: perf.frames, over30ms: perf.spikes, worstMs: Math.round(perf.worst * 1000) }, key: world?.sourceKey, mem: { geo: renderer?.info.memory.geometries, tex: renderer?.info.memory.textures, calls: renderer?.info.render.calls, tris: renderer?.info.render.triangles, heapMB: Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576) }, fps: perf.fps, ratio: perf.ratio, cap60: !!perf.cap, late: perf.late, loc: app()?.location?.(), width: world?.width && +world.width.toFixed(1), measured: world?.samples?.measured && +world.samples.measured.toFixed(2), street: world?.street, real: !!world?.real, info: world?.real?.info }),
};
window.dispatchEvent(new Event("map3d-ready"));
