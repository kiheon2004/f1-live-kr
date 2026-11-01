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
import { pitLaneTest } from "./lanemember.js";
import { gridMemo } from "./armswap.js";
import { GRID_RULES, ASSIGN_TOL, fitGrid, slotS, slotLat, gridWeight, assignSlots, poleSideFor, surveyedGrid, slotCount } from "./grid.js";
import { START_DATA } from "./startdata.js";
import { StartHistory, startContext, carKind, placeWithout, arrivalBy, onPitPath, PLAN, startLights, fieldLaunch } from "./startplan.js";
import { supportPlan, supportModels, followTarget, medicalLap1, gridRearSlot, flagSpot, flagAt, FLAG, SUPPORT } from "./support.js";
import { makeSupportCar, SUPPORT_CARS } from "./support3d.js";
import { makeFlag } from "./flag3d.js";
import { MARSHAL_DATA } from "./marshaldata.js";
import { flagState, marshalMap, postSignal, panelSignal, vscEndOf } from "./marshals.js";
import { harbourFor, layoutYachts, yachtMeshes, hullsOverlap } from "./harbour.js";
import { LANES, laneCells, crossSection, laneSectionAt } from "./pitlane.js";
import { pitState, laneOffsetOf, crewPhase, pendingPenalties, pendingTimePenalties, pitVisits, posSpeed, standingForPos, lastStandPos, standEndPos, nextStandPos, stopPlan, garagePath, PIT } from "./pitstate.js";
import { crewMeshes, crewAt, crewLayout, stopChoreo, changeWalk, kitAt, CHANGE, stopSeed, walkPose, walkPhase, flagPose, flagHold, peopleLod } from "./crew.js";
import { orderedBoxes } from "./pitorder.js";
import { circuitVerdict, pitsUpToWall } from "./pitwallcheck.js";
import { standstills, PitInference, allocatePlaces, allocationKey, teamLayer, overridesFor, planOverrides, boardStatus, seeThrough, paintPitScreens, updateTeamScreens, garageZones } from "./garages.js";
import { createMirrorPass, mirrorMode, mirrorStrain } from "./mirrors.js";
import { probeMirrorPass, samePipeline, glassVsPicture, rendererState, flatFill, glassPixels, glassOnScreen } from "./mirrorprobe.js";
import { makeCar, setKitMode, setCompound, setAero, setWheels, setWheelOff, wheelIsOn, setSmear, setDetail, setCarEnvironment, profileFor, wheelParts, TYRE_COLOURS, setWheelScreen, setLeds, setCockpit, setFlagLights, STEER_RATIO, lockFor, gripKappa } from "./car3d.js";
import { kitMode } from "./kit.js";
import { carLeds, profileForWheel } from "./shiftlights.js";
import { stepWheel, smearOf, odometerAt, wrapAngle } from "./wheelspin.js";
import { cornerStations, cornerTargets, easeAlpha, cornerScale } from "./corners.js";
import { WheelScreens, screenModel, screenUrgent } from "./wheelscreen.js";
import { boardsFor, boardPlaces } from "./boards.js";
import { NL, GLOW, nightLit, lightField, glowPoints, releaseField } from "./nightlights.js";
import { tunnelLight } from "./tunnel.js";
import { disposeGroup, watchShadowDepth, releaseShadowRefs } from "./dispose.js";
import { chaseFallback, chasePlace, clearAround, firstHit, nearRoom } from "./los.js";
import { venueOf, wallOpeningsFor } from "./venues.js";
import { drsAt, activeAeroAt, aeroLock, zonesFor, zoneSpans, zoneAt, estimateZones, smModeOf } from "./aero.js";
import { footing } from "./footing.js";
import { boxDepth, episodeLog, summarise, classifyOverlap, makeTraffic, resetTraffic, stepTraffic, timeJump, TRAFFIC } from "./traffic.js";
import { createWeather } from "./weather3d.js";
import { updateGameCars, paintGameHud, pitPoint } from "./game/cars3d.js";
import { createPitCam } from "./game/pitcam.js";
import { createPitKit } from "./garagekit/pitkit.js";
import { createSpecHud } from "./spectator/hud.js";
import { pickTags, cameraCar } from "./spectator/layout.js";
import { EYE_PITCH, cockpitFov as lensFov, HEAD, headYawFor, eyeTurned } from "./eyecam.js";

const DM = 0.1;               // decimetres → metres
let TRACK_W = 14;             // road width (m), set per circuit in buildWorld
// Street circuits: narrower roads, concrete walls with debris fences right at the edge of the track.
const CIRCUIT_STYLE = {
  "Monte Carlo": { w: 9, street: true }, "Monaco": { w: 9, street: true }, "Baku": { w: 11, street: true },
  "Marina Bay": { w: 12, street: true }, "Singapore": { w: 12, street: true }, "Las Vegas": { w: 14, street: true },
  "Jeddah": { w: 12, street: true }, "Montréal": { w: 11, street: true }, "Montreal": { w: 11, street: true },
  "Madrid": { w: 13, street: true }, "Melbourne": { w: 13 }, "Miami": { w: 13 }, "Miami Gardens": { w: 13 },
};
// The strategy game's explicit mode (Map3D.game.attach / detach – game/adapter3d.js): while a game adapter is attached the
// view reads the circuit's identity and the moment drawn from the adapter's ctx (no source: ctx.src is null, so none of
// the live paths run) and poses the cars from engine snapshots only (game/cars3d.js). Detached: window.F1KR as always.
let game = null;
const app = () => game?.ctx || window.F1KR;

let renderer, scene, camera, controls, host, canvas, hemi, sun, daySky, nightSky;
let wx = null;                // the session's weather in the view (weather3d.js)
let world = null;             // built circuit: { key, samples, grid, center, size, … }
let cars = new Map();         // racing number → car record
let camMode = "heli", visible = false, lastT = 0, lastBuildCheck = 0;
let specHud = null;           // the spectator HUD (spectator/hud.js) – live / replay; hidden in the game's mode
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
  // (three.js adds the bias to the map's 0…1 depth over near…far: −0.0004 was 0.0004 × 5990 m ≈ 2.4 m, which wiped the
  // shadow of anything under ~2 m – barriers, the pit wall, chimneys – and lit a strip up the shaded side of walls at a
  // low sun. v0.41: 0.12 m. No acne seen at Monza 2025 (spans 256–1218 m) or Abu Dhabi 2025 at a 6° sun; the maps are
  // drawn from back faces and nothing that moves casts into them (cars, crews, support cars, flags: contact shadows) –
  // shots/reg_sh_*; normalBias unchanged.)
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 6000;
  sun.shadow.bias = -0.12 / (sun.shadow.camera.far - sun.shadow.camera.near); sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  wx = createWeather({ scene, renderer, daySky, fairEnv: () => carEnvironment(false) });
  wx.configure({ sky: geoSettings().sky || "auto", clouds: geoSettings().cloudData !== false });
  wx.spray(geoSettings().spray !== false);

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
  // (v0.50: the spectator HUD – built before the camera buttons are bound: its own [data-cam] buttons are bound with them)
  specHud = createSpecHud(host, specApi);
  host.dataset.mode = game ? "game" : "spec"; if (game) specHud.setGame(true);
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
    document.getElementById("geoSky").value = ["auto", "neutral", "fair", "overcast"].includes(o.sky) ? o.sky : "auto";
    document.getElementById("geoCloudData").checked = o.cloudData !== false;
    document.getElementById("geoSpray").checked = o.spray !== false;
    document.getElementById("geoPitWork").value = ["record", "observed", "typical"].includes(o.pitWork) ? o.pitWork : "record";
    document.getElementById("geoAero").value = o.aero === "off" ? "off" : "estimate";
    document.getElementById("geoCorners").value = ["near", "all", "off"].includes(o.corners) ? o.corners : "near";
    document.getElementById("geoShift").value = o.shiftLights === "fill" ? "fill" : "team";
    document.getElementById("geoMirrors").value = ["full", "low", "simple"].includes(o.mirrors) ? o.mirrors : "auto";
    document.getElementById("geoGloves").value = kitMode(o.gloves);
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
  document.getElementById("geoQuality").addEventListener("change", (e) => { saveGeoSettings({ ...geoSettings(), quality: e.target.value }); mirrorSetting = null; applyQuality(); paintQualityNow(); });
  document.getElementById("geoNight").addEventListener("change", (e) => change({ night: e.target.value }, !!world?.real));
  document.getElementById("geoSky").addEventListener("change", (e) => { saveGeoSettings({ ...geoSettings(), sky: e.target.value }); wx?.configure({ sky: e.target.value }); });
  document.getElementById("geoSpray").addEventListener("change", (e) => { saveGeoSettings({ ...geoSettings(), spray: e.target.checked }); wx?.spray(e.target.checked); });
  document.getElementById("geoCloudData").addEventListener("change", (e) => { saveGeoSettings({ ...geoSettings(), cloudData: e.target.checked }); wx?.configure({ clouds: e.target.checked }); });
  document.getElementById("geoPitWork").addEventListener("change", (e) => saveGeoSettings({ ...geoSettings(), pitWork: e.target.value }));
  document.getElementById("geoAero").addEventListener("change", (e) => saveGeoSettings({ ...geoSettings(), aero: e.target.value }));
  document.getElementById("geoCorners").addEventListener("change", (e) => saveGeoSettings({ ...geoSettings(), corners: e.target.value }));
  document.getElementById("geoShift").addEventListener("change", (e) => saveGeoSettings({ ...geoSettings(), shiftLights: e.target.value }));
  document.getElementById("geoMirrors").addEventListener("change", (e) => { saveGeoSettings({ ...geoSettings(), mirrors: e.target.value }); mirrorSetting = null; });
  // (v0.45: the gloves' look – kit.js; every car takes its kit's material for the look, nothing rebuilt. The material it
  // takes may not have been on any car yet: lit as applyLighting lights every car – by night the light field, the glow
  // and the environment map, else a night switch drew the hands unlit)
  document.getElementById("geoGloves").addEventListener("change", (e) => { const m = kitMode(e.target.value); saveGeoSettings({ ...geoSettings(), gloves: m });
    for (const c of cars.values()) if (setKitMode(c.model, m) && nightNow !== null) { lightCar(c.model, nightNow); setCarEnvironment(c.model, nightNow ? carEnvironment(true) : null, 0.6); } });
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
const newPitTeams = () => ({ key: null, group: null, facility: null, session: null, inf: new PitInference(), last: 0, info: null, frame: null });
// (the game's mode works on its own record – the live one, with what a live feed has gathered, is kept aside untouched)
let pitTeams = newPitTeams(), livePitTeams = null;
// v0.49: the garage interior kit in the team bays (garagekit/pitkit.js) – made with the teams' layer, freed with it.
// garageKitOn: Map3D.garageKit(false) draws the layer's own simple equipment instead (before / after comparisons).
let pitKit = null, garageKitOn = true, garageKitLight = true;
// the teams the kit draws in full: the focused car's and, in the game, the pit camera's subject's
const kitNearSet = new Set();
function kitNear() {
  kitNearSet.clear();
  const teamOf = (num) => num != null && (pitTeams.teams || []).find((t) => (t.drivers || []).some((d) => String(d.num) === String(num)))?.team;
  const a = teamOf(camNum()), b = game ? teamOf(gamePitCam?.S?.subject) : null;
  if (a) kitNearSet.add(a); if (b) kitNearSet.add(b);
  return kitNearSet;
}
function attachPitKit(G, teams, season) {
  pitKit = null;
  if (!garageKitOn || !pitTeams.group || !pitTeams.zones?.length) return;
  try { pitKit = createPitKit({ G, zones: pitTeams.zones, teams, season, near: new Set(kitNear()), onMaterial: nightLit, light: garageKitLight }); pitTeams.group.add(pitKit.group); }
  catch (e) { pitKit = null; console.warn("garage kit:", e); }
}
function clearPitTeams() {
  pitKit = null;
  if (pitTeams.group) { pitTeams.group.parent?.remove(pitTeams.group); disposeGroup(pitTeams.group); pitTeams.facility?.userData?.garages?.openRail?.([]); }
  pitTeams.group = null; pitTeams.key = null;
}
// (the layer went with the world or the real map it was in: nothing of it is freed again, the next check rebuilds it)
function forgetPitTeams() { pitTeams.group = null; pitTeams.key = null; pitTeams.facility = null; pitTeams.last = 0; }
function updatePitTeams(force = false) {
  if (game) return gamePitTeams(force);
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
  // (the FIA drawing's garages for the event, where the pit building was built from it – confirmed; else the estimate)
  const plan = planOverrides(G, drivers);
  const teams = allocatePlaces(G.slots, G.pitch, drivers, places, plan.length ? plan : overridesFor(G.facility, A.sessionYear?.() || null, session));
  // (a box is painted where a car stands in it – LANES.box out from the garages –, not on the feed's line, which runs
  // anywhere across the lane: pitlane.js)
  { const pm = pitModelFor(G); for (const t of teams) if (t.box != null) t.boxOff = pm.at(t.box).boxC; }
  pitTeams.teams = teams; pitTeams.G = G; pitTeams.zones = garageZones(G, teams);
  pitTeams.info = { evidence: r.evidence, live: !!src.isLive };
  // (how many garages a team has and which driver's is which are estimates: the data shows only where the cars stopped)
  const est = teams.filter((t) => t.estimated);
  pitTeamNote(!teams.length ? null : plan.length ? `팀 차고: FIA 피트 레인 배치도(${G.plan.season}${G.plan.layoutFrom !== G.plan.season ? ", 위치는 " + G.plan.layoutFrom + "년 피트 박스 기준" : ""}) · 칸 폭·차량 작업 칸은 추정` : pub ? "팀 박스 순서: 전년도 컨스트럭터 순위(F1 배정 규칙, 실제 피트 스톱으로 확인) · 차고 칸 수는 추정" : !est.length ? "팀 차고: 공개된 배치 자료" : (est.some((t) => t.from === "box") ? "팀 차고 위치: 피트 스톱 위치로 추정" : "팀 차고 위치: 반복 정차 위치로 추정") + (src.isLive ? "" : " (현재 재생 시점까지)") + " · 칸 수·배정은 추정");
  const key = allocationKey(teams);
  if (key === pitTeams.key) return;
  clearPitTeams();
  pitTeams.key = key;
  if (!teams.length) return;   // neutral garages
  pitTeams.group = teamLayer(G, teams, drivers, A.sessionYear?.() || null, { kit: garageKitOn });
  attachPitKit(G, teams, A.sessionYear?.() || null);
  // a layer added at night takes the light field too (its own materials only – the rest of the world has it already)
  pitTeams.group.traverse((o) => { for (const m of [].concat(o.material || [])) nightLit(m); });
  fac.add(pitTeams.group);
  // (the walkway's railing open in front of each team's stand: the stand is open to its pit lane – facilities.js openRail)
  G.openRail?.(pitTeams.group.userData.standSpans || []);
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
  // (between the garages either side of u by their centres – a run's garages can have a gap, Madrid 2026 –, the wall's
  // face the facility's own at u, within the run: laneSectionAt)
  const us = st.map((x) => x.s.uc), wf = G.wallFace ? (u) => G.wallFace(Math.max(G.gStart, Math.min(G.gEnd, u))) : null;
  const at = (u) => laneSectionAt(st, us, u, wf);
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
// (the car's state on the steadied tracks at t, or null – they aren't built yet, or it is off them)
const smoothStTmp = {};
function smoothSt(src, num, t) { const sm = smooth.src === src ? smooth.tr : null; return sm?.frame ? sm.state(num, t, smoothStTmp) : null; }
// Every car in the pit lane this frame (pitstate.js): its state from the data up to now – raw positions only (the
// InPit flag, its place on the measured pit path, its telemetry), never what is drawn – and where across the lane that
// puts it. Two passes: a car standing behind its box sees a teammate in it. → Map num → { state, u, off, at, team, … }
function pitFrame(src, t, lag, isRace) {
  const G = pitTeams.G; if (!G || !world?.pitLane) return null;
  const m = pitModelFor(G), S = startState(src, t), ctx = startCtxAt(S, t);
  // (v0.53: on the measured pit path AND off the track's tarmac – lanemember.js; v0.52 took every car passing the pit exit
  // at 300 km/h for a car in the lane and drew it at its raw position for a frame, ~18 m off)
  const laneTest = pitLaneTest(world);
  const visits = (num) => pitVisits(S.hist.flags.get(num + ":InPit"), t), timePen = pendingTimePenalties(S.hist.rcm, t, visits);
  const pen = pendingPenalties(S.hist.rcm, t, visits), drivers = src.state.DriverList || {}, c0 = world.center;
  const raw = src.positionsAt(t), out = new Map();
  // (each team's box tolerance: half the way to the nearest other team's box)
  const boxes = (pitTeams.teams || []).filter((q) => q.box != null).map((q) => [q.team, q.box]).sort((a, b) => a[1] - b[1]), tolOf = new Map();
  boxes.forEach(([tm, u], i) => tolOf.set(tm, Math.min(i > 0 ? u - boxes[i - 1][1] : Infinity, i + 1 < boxes.length ? boxes[i + 1][1] - u : Infinity) / 2));
  for (const [num, p] of Object.entries(raw)) {
    let x = p[0] * DM - c0.x, z = -(p[1] * DM - c0.z);
    const onLane = laneTest(x, z, (p[2] || 0) * DM - c0.y), inPit = S.hist.flagAt(num, "InPit", t);
    if (!onLane && !inPit) continue;
    // (v0.53: a car the steadied tracks have on the track, which the timing doesn't have in the pit lane, is the track's –
    // its raw position here is only interpolated between the feed's samples, which come 4–5 s apart at times (2026 Hungary:
    // the straight line between two of them cut across the lane, and the car was drawn in it for a moment, 300–500 m off)
    if (!inPit && smoothSt(src, num, t)) continue;
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
    out.set(num, { num, team, x, z, u: inRun ? pr.u : null, off: pr.off, input: { u: inRun ? pr.u : null, gStart: G.gStart, gEnd: G.gEnd, inPit, onLane, speed, stillFor, boxU: tm?.box ?? null, boxFrom: tm ? (tm.link === "order" ? "order" : "stops") : null, penalty: pen.get(num) || null, timePen: timePen.get(num) || 0, pitStart, race: isRace, retired: S.hist.flagAt(num, "Retired", t) || S.hist.flagAt(num, "Stopped", t), retiredFor: outFor(S.hist, num, t), teammateInBox: false, lastBox, boxTol: tolOf.get(team) } });
  }
  for (const r of out.values()) r.state = pitState(r.input);
  // (a teammate in the box – or still pulling out of it – and this car standing or creeping up behind: a double stack)
  for (const r of out.values()) if (r.input.speed < PIT.creep && [...out.values()].some((o) => o !== r && o.team === r.team && (o.state.state === "in box" || o.state.state === "leaving box") && o.u != null && r.u != null && o.u > r.u + 2)) { r.input.teammateInBox = true; r.state = pitState(r.input); }
  for (const r of out.values()) {
    if (r.u == null) continue;
    // (v0.49: going into its garage – to its own work space's car spot, garages.js garageZones; none known: it stays in the
    // inner lane where it stands, never pushed through a garage's front)
    if (r.state.lane === "garage") { r.spot = (pitTeams.zones || []).find((z) => z.kind === "car" && z.num === r.num) || null; r.state.evidence.push(r.spot ? `parked at its work space, bay ${r.spot.slot} (estimate)` : "no work space known: left in the inner lane"); }
    const at = m.at(r.u), want = laneOffsetOf(r.state, at, r.off, r.u, G.gStart, G.gEnd);
    // the way across changing along the lane: the heading turns by it (pulling into / out of the box)
    const ahead = laneOffsetOf(pitState({ ...r.input, u: r.u + 1 }), m.at(r.u + 1), r.off, r.u + 1, G.gStart, G.gEnd);
    const inRun = Math.min(ss01((r.u - (G.gStart - PIT.ends)) / PIT.ends), ss01(((G.gEnd + PIT.ends) - r.u) / PIT.ends));
    Object.assign(r, { at, want, turn: Math.atan2(ahead - want, 1), inRun });
  }
  return out;
}
// seconds since the car's Retired or Stopped flag was last set (up to t); null: neither set
function outFor(hist, num, t) {
  let since = null;
  for (const k of ["Retired", "Stopped"]) { let s = null; for (const [ts, x] of hist.flags.get(num + ":" + k) || []) { if (ts > t) break; s = x ? s ?? ts : null; } if (s != null) since = since == null ? s : Math.min(since, s); }
  return since == null ? null : (t - since) / 1000;
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
  if (r.state.lane === "garage") { garageDraw(c, r, v, G); return; }
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
// v0.49: a car going into its garage (pitstate.js garagePath): along the inner lane to in front of its own work space,
// turning to face out, then tail first straight in through the door to its car spot (garages.js garageZones: on the
// garage's floor, facing the pit lane) – v0.48 pushed it 2.5 m sideways into whatever garage it stood in front of, turned
// along the lane, through pillars, benches and the engineers' desks. No work space known: the inner lane where it stands.
function garageDraw(c, r, v, G) {
  const z = r.spot, at = r.at, near = r.input.boxU != null && Math.abs(r.u - r.input.boxU) <= (r.input.boxTol ?? PIT.atBox);
  const from = { u: r.u, off: near && at.ok ? at.boxC : at.fastC }, ax = at.slot.along[0], az = at.slot.along[1];
  const q0 = nearestOnPath(r.x, r.z), fwd = q0 && q0.d < 25 ? (ax * q0.tx + az * q0.tz >= 0 ? 1 : -1) : 1, laneYaw = Math.atan2(ax * fwd, az * fwd);
  if (!z) { const s0 = at.slot, d = (at.ok ? at.boxC : at.fastC) - r.off; v.x = r.x - s0.inward[0] * d; v.z = r.z - s0.inward[1] * d; v.y = v.y + (at.floor + 0.004 - v.y) * r.inRun; c.yaw = laneYaw; return; }
  const s = G.slots[z.slot], cs = z.carSpot, q = garagePath(r.state.w, from, { u: s.uc + z.w, off: -cs.d }, at.ok ? at.boxC : at.fastC);
  v.x = s.front[0] + s.along[0] * (q.u - s.uc) - s.inward[0] * q.off; v.z = s.front[1] + s.along[1] * (q.u - s.uc) - s.inward[1] * q.off;
  // (the lane's floor, then the garage's – one level: facilities.js lays the garage floors at the lane's height)
  v.y = at.floor + 0.004 + (cs.y - at.floor - 0.004) * q.turn;
  c.yaw = laneYaw + wrap(cs.yaw - laneYaw) * q.turn;
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
// Corner Mode for the entire Monte Carlo weekend"). v0.44: the zones are the FIA's where the app has them (aero.js
// ZONES), else estimated from the lap line's long straights – either way a look from the rules and the car's speed and
// brake, not the car's state.
function aero2026Allowed() {
  if (geoSettings().aero === "off") return false;
  const A = app(), v = venueOf({ circuitKey: A?.circuitKey?.(), location: A?.location?.() });
  return !aeroLock(v?.key, A?.sessionYear?.() || 0, sessionDate());
}
// v0.44: the zones on this world's lap line (aero.js zonesFor: the event's own, placed from the corners' stations; else
// estimated from the line's long straights), kept per world, season and venue
function aeroZones() {
  const A = app(), season = A?.sessionYear?.() || 0, v = venueOf({ circuitKey: A?.circuitKey?.(), location: A?.location?.() }), key = `${season}|${v?.key}|${sessionDate()}|${A?.circuit?.corners?.length || 0}`;   // (again once the circuit's corners have come)
  if (world.aeroZones?.key === key) return world.aeroZones;
  const S = world.samples, pts = S.map((q) => q.p), cum = new Float64Array(S.length);
  for (let i = 1; i < S.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  const L = cum[S.length - 1] + Math.hypot(pts[0].x - pts[S.length - 1].x, pts[0].z - pts[S.length - 1].z);
  const circ = A.circuit, ks = (circ?.corners || []).map((k) => { const q = toWorld([k.x, k.y, 0], world.center); return { n: k.n, x: q.x, z: q.z }; });
  const official = zonesFor(v?.key, season, sessionDate());
  const spans = official && ks.length ? zoneSpans(official.zones, cornerStations(ks, pts, cum, L), L) : [];
  world.aeroZones = spans.length ? { key, L, spans, official } : { key, L, spans: estimateZones(pts, cum, L), official: null };
  return world.aeroZones;
}
// A car's wing pose at t: { open 0..1, measured | estimated, why }
let devAeroHold = null;
// what every car's pose needs from the session, worked out once a frame (the setting, the venue's zones, lights out, race
// control's word) – not per car: the setting is read from storage and the start found in the event list
const AERO_CTX = { src: null, t: NaN, nMsg: -1, allowed: false, Z: null, t0: null, mode: "normal", isRace: false };
function aeroCtx(src, t) {
  const X = AERO_CTX, nMsg = src.messages?.length || 0;
  if (X.src !== src) { X.src = src; X.isRace = /Race|Sprint/.test(src.state.SessionInfo?.Type || src.state.SessionInfo?.Name || "") && !/Qualifying|Shootout/.test(src.state.SessionInfo?.Name || ""); X.t0 = X.isRace && src.startTime ? src.startTime() || null : null; X.nMsg = -1; X.t = NaN; }
  if (X.isRace && X.t0 == null && src.isLive && src.startTime) X.t0 = src.startTime() || null;   // (live: lights out comes later)
  if (X.nMsg !== nMsg) { X.nMsg = nMsg; X.mode = smModeOf(src.messages); }
  if (X.t !== t) { X.t = t; X.allowed = aero2026Allowed(); X.Z = aeroZones(); }
  return X;
}
function aeroPose(c, num, st, est, t, src) {
  const era = c.model.userData.profile.era, out = c.aeroOut || (c.aeroOut = {});
  if (era === "2022") { if (drsAt(src.car?.[num], t, 160, out)) return out; out.open = 0; out.front = 0; out.measured = false; out.estimated = false; out.why = "no DRS data"; return out; }
  if (!world?.samples?.length) { out.open = 0; out.front = 0; out.estimated = true; out.why = "no lap line"; return out; }
  const X = aeroCtx(src, t), I = c.aeroIn || (c.aeroIn = {});
  // (v0.45: the zone's entry from the car's own track coordinates – smooth.js coords – at the moment its place st is for:
  // live 0.6 s behind the newest data; the telemetry on its own clock (lag), live never past the newest moment t – a
  // replay reads up to t + lag: the same moment as the place, all of it recorded)
  const sm = smooth.src === src ? smooth.tr : null;
  I.allowed = X.allowed; I.spans = X.Z.spans; I.L = X.Z.L; I.s = st ? st.s : null; I.speed = c.speed * 3.6; I.tel = src.car?.[num] || null;
  I.hist = st && sm?.coords ? sm.coords(num) : null; I.lag = sm?.telLag || 0; I.t = t - (I.hist ? sm.stateLag || 0 : 0); I.now = src.isLive ? t : null;
  I.onTrack = !!st && !est && !c.pit; I.racing = X.t0 == null || t >= X.t0; I.startGate = X.t0; I.mode = X.mode;
  return activeAeroAt(I, out);
}
function pitWorkPolicy() {
  const v = geoSettings().pitWork || "record", live = !!app()?.src?.isLive;
  return live && v === "record" ? "observed" : v;
}
const liftedCars = new Set();
function pitPlanFor(num, src, policy, { t0, t1 = null, input }) {
  // (the record: the session's whole tyre record; observed: only what had arrived by the moment shown – a correction sent
  // later isn't seen early)
  // (the record also holds a stint dropped later – a reset or deletion after the stop –, each record on its own: a stint
  // index used again is another stint, never this one's)
  const tyres = (policy === "record" ? src.tyreChanges?.(num, Infinity, { history: true }) : src.tyreChanges?.(num, app().t)) || [];
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
  // (v0.49: the crews lit by the night's floodlights like the pit building – they were near black at night races)
  if (!world.crews) { world.crews = crewMeshes(); world.group.add(world.crews.group); world.crews.group.traverse((o) => nightLit(o.material)); }
  const A = app(), src = A.src, m = pitModelFor(G), drivers = src?.state.DriverList || {}, list = [], loose = [], byTeam = new Map();
  const policy = pitWorkPolicy();
  let shown = null;
  pitWork.clear();
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
    if (plan && t0 != null) plan.seed = stopSeed(ph.num, t0);   // (the stop's own wheel-to-wheel differences: crew.js wheelTimes)
    if (plan?.kind === "tyres") {
      const car = cars.get(ph.num), dims = wheelParts(A.sessionYear?.() || null, team);
      world.crews.wheels(dims);
      const oldC = (src.stints?.(ph.num) || []).slice(-1)[0]?.Compound, bands = { old: TYRE_COLOURS[oldC] || null, new: TYRE_COLOURS[plan.compound] || null };
      let L;
      if (ph.phase === "work") {
        L = stopChoreo(plan, ph.since || 0, dims, left);
        // (what the panel says of the work: the stage drawn now – never when it will end)
        const cnt = (a) => a.reduce((n, x) => n + (x ? 1 : 0), 0);
        pitWork.set(ph.num, { kind: "tyres", from: plan.from, off: cnt(L.car.off), fitted: cnt(L.car.fitted), done: cnt(L.car.done), lifted: L.car.lift[0] + L.car.lift[1] > 0.005 });
        if (car && c) { applyLift(car, L.car, dims); liftedCars.add(ph.num); if (plan.compound && L.car.off.every((o) => !o) && stopClockDone(plan, ph.since)) setCompound(car.model, plan.compound); }
      } else L = changeWalk(ph.phase, ph.f, dims, at.boxC, left);
      list.push(...crewAt(where, L.figures, colour));
      loose.push(...kitAt(where, L.kits, bands));
      shown = shown || plan.from;
      continue;
    }
    if (ph.phase === "work" && plan) pitWork.set(ph.num, { kind: plan.kind, from: plan.from, off: 0, fitted: 0, done: 0, lifted: false });
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
  u.wheels.forEach((w, i) => setWheelOff(c.model, i, !!vis.off[i]));   // (v0.43: the wheel only – drum, upright, disc stay)
  c.lifted = true;
}
function restoreCar(c) {
  if (!c.lifted) return;
  c.model.position.y = 0; c.model.userData.wheels.forEach((w, i) => setWheelOff(c.model, i, false)); c.lifted = false;
}
// v0.50: the small provenance notes stack in one place (#notes3d – the HUD's "자료 출처 메모" widget; in the game's mode
// bottom left as before), each with its own line and order instead of five absolutely placed boxes
const NOTE_ORDER = { camNote3d: 0, startLightNote: 1, supportNote: 2, pitWorkNote: 3, pitTeamNote: 4 };
function noteLine(id) {
  const el = document.createElement("div"); el.id = id; el.className = "note3d-line" + (id === "camNote3d" ? " cam" : ""); el.style.order = NOTE_ORDER[id] ?? 9;
  (document.getElementById("notes3d") || host)?.appendChild(el);
  return el;
}
function pitWorkNote(text) {
  let el = document.getElementById("pitWorkNote");
  if (!el && text) { el = noteLine("pitWorkNote"); }
  if (el) { if (el.textContent !== (text || "")) el.textContent = text || ""; if (el.hidden !== !text) el.hidden = !text; }
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
  if (!el && text) { el = noteLine("pitTeamNote"); }
  if (el) { if (el.textContent !== (text || "")) el.textContent = text || ""; if (el.hidden !== !text) el.hidden = !text; }
}
// (Map3D.boardsDiag – a pure function of the pit building, the session's data, the layer and the camera: boardStatus
// in garages.js says why each board is or isn't there; this adds what only the scene can say)
function boardsDiag() {
  let fac = null; world?.real?.group.getObjectByName("facilities")?.traverse((o) => { if (!fac && o.userData?.garages) fac = o; });
  const A = app(), src = A?.src, G = fac?.userData.garages || null, drivers = src?.state?.DriverList || {};
  const nums = [...new Set([...Object.keys(drivers), ...Object.keys(src?.state?.TimingData?.Lines || {})])].filter((n) => /^\d+$/.test(n));
  const layer = pitTeams.group, boards = new Map((layer?.userData.boards || []).map((b) => [b.num, b]));
  const keyNow = pitTeams.teams ? allocationKey(pitTeams.teams) : null;
  const base = boardStatus({ G, hasPositions: !!src?.tracks?.cars, drivers, nums, teams: pitTeams.teams || [], evidence: pitTeams.info?.evidence || [], layerKey: pitTeams.key, keyNow, boards });
  const cam = camera.position, rc = new THREE.Raycaster(), v = new THREE.Vector3(), targets = [world?.real?.group.getObjectByName("facilities"), world?.real?.group.getObjectByName("barriers"), world?.group.getObjectByName("syntheticWalls")].filter(Boolean);
  rc.camera = camera;
  for (const r of base) {
    const b = boards.get(r.num); if (!b || r.status !== "created") continue;
    const p = new THREE.Vector3(...b.p), d = p.distanceTo(cam);
    let vis = true; for (let o = layer; o; o = o.parent) if (!o.visible) vis = false;
    r.dist = Math.round(d);
    // (its height on screen in pixels: the board's height over the distance, the view's vertical field)
    r.px = Math.round((b.h / (2 * d * Math.tan((camera.fov * Math.PI) / 360))) * renderer.domElement.height);
    if (!vis) { r.status = "hidden"; r.reason = d > 300 ? "LOD: the teams' layer shows within 300 m of the garages" : "layer hidden"; continue; }
    if ((cam.x - p.x) * b.n[0] + (cam.y - p.y) * b.n[1] + (cam.z - p.z) * b.n[2] <= 0) { r.status = "hidden"; r.reason = "faces away from the camera (seen from inside or behind the building)"; continue; }
    v.copy(p).project(camera); if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || v.z > 1) { r.status = "off-screen"; r.reason = "outside the view"; continue; }
    rc.set(cam.clone(), p.clone().sub(cam).normalize()); rc.far = d - 0.05;
    const hit = rc.intersectObjects(targets, true).find((h) => h.object.visible !== false && !h.object.isSprite && !h.object.isInstancedMesh && h.object.name !== "teamLabels" && !seeThrough(h.object.material));
    if (hit) { let o = hit.object, n = []; while (o && n.length < 2) { if (o.name) n.push(o.name); o = o.parent; } r.status = "occluded"; r.reason = "behind " + (n.join("<") || hit.object.type); r.hit = +hit.distance.toFixed(1); continue; }
    if (r.px < 6) { r.status = "tiny"; r.reason = `${r.px} px high at ${r.dist} m`; continue; }
    r.status = "visible";
  }
  return { facility: G?.facility || null, plan: G?.plan || world?.real?.info?.garagePlan || null, slots: G?.slots.length || 0, layer: !!layer, key: pitTeams.key === keyNow ? "current" : "stale", drivers: base };
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
// (covered: a test for points under a tunnel's roof – tunnel.js; no kerbs there: the Monaco tunnel's road runs between
// armco with no kerbs, but its bend made them – v0.39)
function kerbs(samples, covered = null) {
  const n = samples.length, mark = cornerKerbs(samples);
  if (covered) for (let i = 0; i < n; i++) if (covered(samples[i].p.x, samples[i].p.z, 0)) { mark.inside[i] = 0; mark.outside[i] = 0; mark.strip[i] = 0; }
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
  const op = list.map((o) => { const [x, z] = geo.fromLL(o.ll[0], o.ll[1]), [s] = w.grid.nearest(x, z, 4); if (!s) return null; return { i: s.i, half: o.len / 2 / step, side: o.side === "R" ? 1 : o.side === "L" ? -1 : Math.sign((x - s.p.x) * s.nor.x + (z - s.p.z) * s.nor.z) || 1 }; }).filter(Boolean);
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
      // (the lap's normals turning over between two samples – Miami T17–T18: the left offset joined to the right one, a
      // wall drawn across the track; v0.36 audit): no segment there
      if (a.nor.x * b.nor.x + a.nor.z * b.nor.z < 0.5) continue;
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
const _shadow = {};
function shadowTex(prof = null) {
  // v0.52 (request §11, the car on the ground): the car's own plan under it – the floor's broad dark plate between the
  // axles (5 cm off the road: the sky's light can't get under it), the nose and the gearbox narrower, and each tyre's
  // contact patch darkest – blurred; one texture per era (its axles and track), shared by every car of it. It was one
  // round blob (darkest in the middle, an ellipse 2.4 × 5.8 m): the car seemed to hover with nothing under its wheels.
  // The same one plane and draw call as before.
  const key = prof ? prof.era : "blob";
  if (_shadow[key]) return _shadow[key];
  const c = document.createElement("canvas"), x = c.getContext("2d");
  if (!prof) {
    c.width = c.height = 64; const r = x.createRadialGradient(32, 32, 4, 32, 32, 32);
    r.addColorStop(0, "rgba(0,0,0,0.55)"); r.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = r; x.fillRect(0, 0, 64, 64);
  } else {
    // (the canvas: the plane's 2.4 × 5.8 m at 50 px a metre; its top the car's tail – the plane lies face up, its +y the car's −z)
    const k = 50, W = (c.width = 120), H = (c.height = 290), px = (mx) => W / 2 + mx * k, pz = (mz) => H / 2 - mz * k;
    const box = (x0, z0, x1, z1, a, r) => { x.fillStyle = `rgba(0,0,0,${a})`; x.beginPath(); x.roundRect(px(x0), pz(z1), (x1 - x0) * k, (z1 - z0) * k, r * k); x.fill(); };
    x.filter = "blur(7px)";
    box(-0.95, prof.RZ + 0.3, 0.95, prof.FZ - 0.6, 0.5, 0.25);       // the floor's plate (to its edge under the sidepods)
    box(-0.3, prof.FZ - 0.8, 0.3, prof.FZ + 1.0, 0.3, 0.15);         // the nose and the front wing's middle
    box(-0.45, prof.RZ - 0.75, 0.45, prof.RZ + 0.4, 0.34, 0.15);     // the gearbox and the diffuser
    // (each tyre: the shade round its foot – the road a hand's breadth round the contact patch sees little sky –, then the
    // patch itself darkest)
    for (const [z, tw] of [[prof.FZ, prof.FW], [prof.RZ, prof.RW]]) for (const sd of [-1, 1]) {
      const cx = sd * (prof.W / 2 - tw / 2);
      x.filter = "blur(5px)"; box(cx - tw / 2 - 0.1, z - 0.32, cx + tw / 2 + 0.1, z + 0.32, 0.45, 0.12);
      x.filter = "blur(2px)"; box(cx - tw / 2, z - 0.12, cx + tw / 2, z + 0.12, 0.7, 0.04);
    }
    x.filter = "none";
  }
  const t = new THREE.CanvasTexture(c); t.userData.shared = true;   // (one for every car of the era)
  return (_shadow[key] = t);
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

// The session's local date (the track's day, YYYY-MM-DD): its archive path's session folder ("…/2026-06-14_Race/"), or
// its SessionInfo StartDate (local track time) – null when neither has come (a live feed early on)
function sessionDate() {
  if (game) return game.scenario.meta?.date || null;
  const si = app().src?.state.SessionInfo || {};
  const m = /\/(\d{4}-\d\d-\d\d)_[^/]*\/?$/.exec(si.Path || "") || /^(\d{4}-\d\d-\d\d)/.exec(si.StartDate || "");
  return m ? m[1] : null;
}
function carFor(num, d) {
  let c = cars.get(num);
  // (the model is chosen by season and team – the car of that year –, its paint by the team's colours)
  // (the session's date: a team's car changed during the season – carshapes.js; the key carries the shape picked, so a
  // date that comes late – live – or a session of another part of the season gives the car its other shape)
  const season = app().sessionYear?.() || null, color = "#" + (d.TeamColour || "888888"), date = sessionDate();
  const key = `${color}|${d.TeamName || ""}|${season}|${profileFor(season, d.TeamName, date).key}`;
  if (c && c.key === key) return c;
  if (c) { scene.remove(c.obj); disposeGroup(c.obj); releaseShadowRefs(); }
  const obj = new THREE.Group();
  const model = makeCar({ teamName: d.TeamName, teamColour: d.TeamColour, number: num, season, date, kit: geoSettings().gloves });
  if (nightNow) setCarEnvironment(model, carEnvironment(true), 0.6);
  { const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5.8), new THREE.MeshBasicMaterial({ map: shadowTex(model.userData.profile), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; sh.name = "contactShadow"; sh.userData.notCar = true; model.add(sh); }
  if (nightNow) lightCar(model, true);
  // cars don't go into the (static) shadow map; the soft contact shadow under each car does the job
  obj.add(model);
  const label = labelSprite(); obj.add(label.sp);
  scene.add(obj);
  c = { num, obj, model, label, color, key, yaw: 0, pitch: 0, roll: 0, speed: 0, spinW: null, aero: 0, pos: new THREE.Vector3(), has: false, sample: null };
  cars.set(num, c);
  return c;
}

// A car's footprint from its model's bounds (metres from its origin: ahead, behind, to the side), once per model –
// the contact shadow left out (development: Map3D.overlapScan; traffic.js boxes)
const dimBox = new THREE.Box3(), dimM = new THREE.Matrix4();
function carDims(c) {
  if (c.dims?.key === c.key) return c.dims;
  const m = c.model, inv = new THREE.Matrix4(); m.updateWorldMatrix(true, true); inv.copy(m.matrixWorld).invert();
  let f = 0, b = 0, h = 0;
  m.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.name === "contactShadow") return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    dimBox.copy(o.geometry.boundingBox).applyMatrix4(dimM.multiplyMatrices(inv, o.matrixWorld));
    f = Math.max(f, dimBox.max.z); b = Math.max(b, -dimBox.min.z); h = Math.max(h, dimBox.max.x, -dimBox.min.x);
  });
  return (c.dims = { key: c.key, front: f, back: b, half: h, era: m.userData.profile?.era || "?" });
}
// ---------- per-frame update ----------
function trackPointFor(c, x, z) {
  // Keep cars glued to the road surface and remember where on the lap they are.
  const [s, d] = world.grid.nearest(x, z, 1);
  c.sample = s && d < 25 ? s : null;
  return c.sample ? c.sample.p.y : null;
}
// v0.53: the height for a car drawn from its raw position (off the steadied tracks, not in the pit lane): the lap line's
// within 25 m (trackPointFor); further out the ground's (the real map's terrain) unless the feed's own height agrees with it
// within GROUND_TOL m – the feed's Z can be tens of metres off (2026 Hungary: cars 52 m under the ground in the run-off)
const GROUND_TOL = 3;
function groundFor(c, x, z, feedY) {
  const g = trackPointFor(c, x, z); if (g != null) return g + ROAD_LIFT - 0.02;
  const t = world.real?.groundAt?.(x, z);
  return Number.isFinite(t) && Math.abs(feedY - t) > GROUND_TOL ? t + 0.02 : feedY;
}

const HAND_MAX = 8, READY_MS = 600, ACROSS_MAX = Math.tan(0.35);   // m (v0.53: an estimate → feed handover eased only up to this far); ms: raw → steadied when those come
const pitTmp = {}, posBuf = {}, velBuf = {}, vTmp = new THREE.Vector3(), P0 = [0, 0, 0], PA = [0, 0, 0], PB = [0, 0, 0], DIR = [0, 0];
// x → target as a critically damped spring of rate w (1/s), the value and its rate kept on the object
function spring(o, key, rateKey, target, w, dt) {
  let x = o[key] || 0, v = o[rateKey] || 0;
  const steps = Math.max(1, Math.ceil(dt / 0.01)), h = dt / steps;
  for (let i = 0; i < steps; i++) { v += (w * w * (target - x) - 2 * w * v) * h; x += v * h; }
  o[key] = x; o[rateKey] = v;
}
const smoothstep = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// Traffic (traffic.js): every car is drawn on the racing line (the position data has them all on one line), so cars
// side by side or nose to tail in the data would be drawn through each other. traffic.js parts them – across the
// track for passes and cars alongside, along it (within a few metres, never past each other) in queues – as offsets
// on top of the steadied tracks (c.trafD across, c.trafS along, eased in the session's time), and records what it
// can't solve (c.trafRes). Only where the cars are drawn: the order, laps and timing are the data's.
// (v0.44: this replaced a pairwise push – each car the largest push each way, summed – that cancelled for a car
// between two others and put queues side by side; and that looked 1–3 s ahead live, where smooth.js holds the newest
// position: the "future" was the latest data, every car standing still)
const trafSt = {}, trafPk = {}, trafItems = new Map(), trafList = [], trafEdge = { L: 7, R: -7 }, KA2 = [0, 0, 0], KB2 = [0, 0, 0], KD1 = [0, 0], KD2 = [0, 0];
const trafWarm = [], trafWS = {}, trafWI = new Map();
// (cars still drawn in their grid columns – standing, or easing out of them after the start – are apart already)
const trafHeld = (c) => { const g = c.grid; return !!g && g.state !== "free" && (g.across ?? 0) > 0.15; };
const traf = { S: makeTraffic(), sm: null, env: null, lastT: null }, trafCost = { ms: 0, frames: 0 };   // (development: its share of a frame)
function traffic(sm, F, t, dt, pos) {
  if (traf.sm !== sm) { resetTraffic(traf.S); traf.sm = sm; }   // (another session or circuit: nothing carried over)
  const env = traf.env || (traf.env = {
    L: 0, live: false,
    edges(s) { const q = traf.F.sampleAt(s); trafEdge.L = q.L ?? 7; trafEdge.R = q.R ?? -7; return trafEdge; },
    // (the next 200 m's turning: > 0 the next corner goes left)
    turnAhead(s) { const i = traf.F.sampleAt(s).i; let x = 0; for (let k = 0; k < 100; k++) x += world.samples[(i + k) % world.n].turn; return x; },
    kappa(s) { traf.F.at(s - 4, 0, KA2, KD1); traf.F.at(s + 4, 0, KB2, KD2); return Math.atan2(KD1[0] * KD2[1] - KD1[1] * KD2[0], KD1[0] * KD2[0] + KD1[1] * KD2[1]) / 8; },
    peek(num, tt) { const q = traf.sm.state(num, tt, trafPk); return q ? q.s : null; },
    // (where a car at (s, d) is and faces: the path at that offset over ±2 m – the boxes check)
    pose(s, d, o) { traf.F.at(s - 2, d, KA2); traf.F.at(s + 2, d, KB2); o.x = (KA2[0] + KB2[0]) / 2; o.z = (KA2[2] + KB2[2]) / 2; o.yaw = Math.atan2(KB2[0] - KA2[0], KB2[2] - KA2[2]); return o; },
    // (v0.45: the cars now shown, at an earlier moment – a seek plays the last seconds first, traffic.js WARM_MS)
    warmAt(tt) { const L = trafWarm; L.length = 0; for (const num of Object.keys(traf.pos)) { const c = cars.get(num), st = c && traf.sm.state(num, tt, trafWS[num] || (trafWS[num] = {})); if (!st) continue; const D = carDims(c), it = trafWI.get(num) || {}; trafWI.set(num, it); it.num = num; it.s = st.s; it.d = st.d; it.vs = st.vs; it.y = traf.F.sampleAt(st.s).p.y; it.held = trafHeld(c); it.front = D.front; it.back = D.back; it.half = D.half; L.push(it); } return L; },
  });
  traf.F = F; traf.pos = pos; env.L = F.L; env.live = !!app().src?.isLive;
  // (the warm-up reads each car's grid state as it is now: right while the race runs on, stale on a seek from before the
  // start – every car still "held" in its slot – so then none, as in v0.44: Monza 2025, a seek from the grid to lap 1
  // warmed up with the pack held chose the other side for a pass, 1.8 m off a second later)
  let gridHeld = false; for (const c of cars.values()) if (c.grid && c.grid.state !== "free") { gridHeld = true; break; }
  env.listAt = gridHeld ? null : env.warmAt;
  // (v0.45: separate()'s sides are no longer forgotten on a seek. They are only asked for when the data has two cars on top
  // of each other – a queue standing in the pit lane – and a side chosen afresh after a rewind was often the other one:
  // parked cars 4.6–6.8 m off where playing draws them, Monza 2025 after the flag – Map3D.seekCheck)
  traf.lastT = t;
  const list = trafList; list.length = 0;
  for (const num of Object.keys(pos)) {
    const c = cars.get(num), st = c && sm.state(num, t, trafSt[num] || (trafSt[num] = {}));
    if (!st) continue;
    const D = carDims(c), it = trafItems.get(num) || {}; trafItems.set(num, it);
    it.num = num; it.s = st.s; it.d = st.d; it.vs = st.vs; it.y = F.sampleAt(st.s).p.y; it.held = trafHeld(c); it.front = D.front; it.back = D.back; it.half = D.half;
    list.push(it);
  }
  const t0 = performance.now(), out = stepTraffic(traf.S, list, env, t); trafCost.ms += performance.now() - t0; trafCost.frames++;
  for (const [num, c] of cars) {
    const m = out.get(num);
    c.trafD = m ? m.dOff : 0; c.trafRate = m ? m.dRate : 0; c.trafS = m ? m.sOff : 0; c.trafSRate = m ? m.sRate : 0;
    c.trafTgt = m ? m.tD : 0; c.trafRes = m ? m.res : 0; c.trafMode = m ? m.mode : "";
    // (development: a red ring under a car the correction couldn't keep clear – one shared ring, never in the app's views)
    if (devTrafMark || c.trafRing) {
      if (!c.trafRing) { c.trafRing = new THREE.Mesh(trafRingGeo(), trafRingMat()); c.trafRing.rotation.x = -Math.PI / 2; c.trafRing.position.y = 0.06; c.obj.add(c.trafRing); }
      c.trafRing.visible = devTrafMark && c.trafRes > 0.05;
    }
  }
}
let trafRingG = null, trafRingM = null;
const trafRingGeo = () => trafRingG || (trafRingG = Object.assign(new THREE.RingGeometry(2.6, 3.0, 32), { userData: { shared: true } }));
const trafRingMat = () => trafRingM || (trafRingM = Object.assign(new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.85, depthWrite: false }), { userData: { shared: true } }));
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
let devSpin = null;   // (development, v0.43: the focused car's wheels rolled at this many turns a second – Map3D.spinWheels)
let devRoadJoin = true;   // (development: the ground between two stretches of the lap as before v0.44 – Map3D.roadJoin(false))
let devGroundOld = false;   // (development: buildings on the ground as before v0.39 – Map3D.groundFix(false))
let devTrafMark = false;   // (development: red rings under cars with an overlap left – Map3D.trafficState(at, true))
let devRawTracks = false, devNoShake = false, devMotion = false, devRec = null, devGpu = null, devShadowDrawn = false;
// development: the focused car's steering wheel held at an angle (deg, + = its left grip up) or swept (Map3D.steerWheel)
const KA = [0, 0, 0], KB = [0, 0, 0], KC = [0, 0, 0];   // (the steering's curvature: three points of the path)
// On the track: the front wheels' steer (rad) from the path's curvature where the car is (st: its track coordinates) –
// the frame's own steering (updateCars) and its history (wheelHistOf) by the one rule
function pathKappa(F, s, d, fwd, h) {
  F.at(s - fwd * h, d, KA); F.at(s, d, KB); F.at(s + fwd * h, d, KC);
  return wrap(Math.atan2(KC[0] - KB[0], KC[2] - KB[2]) - Math.atan2(KB[0] - KA[0], KB[2] - KA[2])) / h;
}
function pathSteer(F, st, speed) {
  const fwd = st.vs >= 0 ? 1 : -1, h = Math.max(4, Math.min(12, Math.abs(st.vs) * 0.15));
  const kappa = gripKappa(pathKappa(F, st.s, st.d, fwd, h), speed);   // (v0.52: no more than the car's grip – car3d gripKappa)
  return Math.max(-0.4, Math.min(0.4, Math.atan(3.4 * kappa) + (0.01 * speed * speed * kappa) / 9.81));
}
// v0.47 (request §2): the steering wheel's turn (rad, as car3d's wheel.rotation.z) at any moment of the session – the
// lowered arm's swing is read from its history (car3d setWheels' hist, armswap.js swapAt), so continuous play at any
// frame rate or replay speed, a pause, the car out of close-up and a direct seek show the same arms at the same moment.
// From the smoothed track's state at that moment (a function of the moment, smooth.js) by pathSteer, at the track's own
// speed (the frame's adds the queue's small traffic.js rates – the drawn wheel may differ from it by a hair; the swing
// is timed by this one); standing (≤ 3 m/s) 0, the eased frame steering's aim. null where there is no state (no
// smoothed track yet, a pit-lane starter's estimated path): there setWheels keeps the frame-to-frame stepSwap – that
// steering is eased frame to frame and snapped on a seek (a known limit, kept). Kept per car on armswap's grid.
const histSt = {};
function wheelHistOf(c, num, sm) {
  c.histSm = sm;   // (the tracks this frame's cars are posed from – smoothFor; a new one clears the kept samples)
  return (c.wheelHist || (c.wheelHist = gridMemo((ms) => {
    const sm = c.histSm, st = sm?.frame ? sm.state(num, ms, histSt) : null; if (!st) return null;
    const speed = Math.hypot(st.vs, st.vd), L = lockFor(speed);
    return Math.max(-L, Math.min(L, -(speed > 3 ? pathSteer(sm.frame, st, speed) : 0) * STEER_RATIO));
  }))).key(sm);
}
// development: the focused driver's arm axes drawn over the car (Map3D.armDiag) – shoulder → elbow → wrist (white),
// the hand's axes at the wrist (x to the little finger red, y to the knuckles green, z out of the palm blue), the
// forearm's twisted x at the wrist (magenta), each grip's axis (yellow); never in the app's own views
let devArmDiag = null;
function drawArmDiag(model) {
  const u = model.userData; if (!u.arms) return;
  if (!devArmDiag.lines) {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(2 * 3 * 2 * 9), 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(2 * 3 * 2 * 9), 3));
    devArmDiag.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, toneMapped: false })); devArmDiag.lines.renderOrder = 999; devArmDiag.lines.frustumCulled = false;
  }
  const L = devArmDiag.lines; if (L.parent !== u.near) u.near.add(L);
  const P = L.geometry.attributes.position, Cc = L.geometry.attributes.color, w = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Vector3();
  let n = 0; const seg = (a, b, c) => { P.setXYZ(n, a.x, a.y, a.z); Cc.setXYZ(n++, ...c); P.setXYZ(n, b.x, b.y, b.z); Cc.setXYZ(n++, ...c); };
  for (const a of u.arms) {
    const [b0, b1, , b3, b4] = a.bones, S = b0.position, E = b1.position, W = b3.position;
    seg(S, E, [1, 1, 1]); seg(E, W, [1, 1, 1]);
    for (const [ax, col] of [[[1, 0, 0], [1, 0.2, 0.2]], [[0, 1, 0], [0.2, 1, 0.2]], [[0, 0, 1], [0.3, 0.5, 1]]]) seg(W, w.set(...ax).applyQuaternion(b4.quaternion).multiplyScalar(0.07).add(W), col);
    seg(W, w.set(1, 0, 0).applyQuaternion(b3.quaternion).multiplyScalar(0.06).add(W), [1, 0.2, 1]);
    // the grip's axis: the hand's pivot (in the wheel) along the grip's up
    const G = u.armPlan.geo.grip; a.hand.getWorldPosition(w); u.near.worldToLocal(w); e.set(G.up[0] * a.k, G.up[1], G.up[2]).applyQuaternion(u.wheel.getWorldQuaternion(q)).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()).invert()).multiplyScalar(0.08);
    seg(w.clone().sub(e), w.clone().add(e), [1, 0.85, 0.1]);
  }
  L.geometry.setDrawRange(0, n); P.needsUpdate = true; Cc.needsUpdate = true;
}
let devSteer = null;
const devSteerNow = () => -((typeof devSteer === "number" ? devSteer : devSteer.amp * Math.sin((2 * Math.PI * (performance.now() - devSteer.t0)) / (devSteer.period * 1000))) * Math.PI) / 180 / STEER_RATIO;
// a car's shift lights now (shiftlights.js carLeds; its wheel's row in the viewer's chosen look); off without telemetry
function lightLeds(c, num, t, src) {
  const u = c.model.userData, look = geoSettings().shiftLights === "fill" ? "fill" : "team";
  if (u.ledLook !== look) { u.ledProfile = profileForWheel(u.wheelSpec?.leds, look); u.ledLook = look; }
  // (the gear and revs: src.carAt – the same reading the wheel's screen and the bottom bar show at this t)
  const tel = src?.car?.[num], st = tel && u.ledProfile ? carLeds(tel, t, u.ledProfile, u.profile.era, src.carAt?.(num, t) || null) : null;
  setLeds(c.model, st ? st.colours : null);
  c.leds = st;
  // (the flag lights: race control's track state – yellow for a yellow / SC / VSC, red for a red flag; else off)
  const ts = src?.state?.TrackStatus?.Status;
  setFlagLights(c.model, ts === "5" ? "#ff2414" : ts === "2" || ts === "4" || ts === "6" || ts === "7" ? "#ffb21a" : null);
}
// the wheels' angles (front, rear) and how much their markings smear this frame (car3d.js setSmear)
const LIVE_LAG = 600;   // (ms: a live car is drawn this far behind the newest data – replay.js LiveSource.positionsInto)
function rollWheels(c, st, est, F, t, v) {
  const P = c.model.userData.profile, W = c.wheelSt || (c.wheelSt = { f: { a: null, t: null }, r: { a: null, t: null }, t: null, pos: new THREE.Vector3(), has: false });
  const pitU = est?.pit ? est.u : c.pit?.u;
  const along = st ? { d: st.s, L: F?.L || null } : pitU != null ? { d: pitU, L: null } : null;
  const moved = W.has ? Math.hypot(v.x - W.pos.x, v.z - W.pos.z) : null;
  const fwd = Math.sin(c.yaw) * (v.x - W.pos.x) + Math.cos(c.yaw) * (v.z - W.pos.z) >= 0 ? 1 : -1;
  const speed = st ? st.vs : (est?.pit ? est.vs : c.speed * (moved ? fwd : 1));
  const dts = W.t == null ? 0 : (t - W.t) / 1000;
  // (the telemetry's odometer where the car has speed data, on by its positions over holes in it – one measure on
  // every path; else from the path. Asked at the moment the car is drawn: live 0.6 s back – replay.js / smooth.js
  // LiveSource positions – and no later than its newest position, where the drawn car holds (CarTracks.at) – so the
  // wheels neither run ahead of the car nor wait on a speed batch not in yet)
  const src = app().src, tel = src?.car?.[c.num], trk = src?.tracks?.cars?.[c.num] || null;
  const tw = !src?.isLive ? t : trk?.n ? Math.min(t - LIVE_LAG, Math.max(trk.t[trk.n - 1], t - LIVE_LAG - 4000)) : t - LIVE_LAG;
  const odo = tel || trk ? odometerAt(tel, tw, trk) : null;
  let fa, ra;
  c.spinSrc = odo != null ? "odo" : "path"; c.spinD = odo;   // (development: recordSpin)
  if (odo != null) { fa = W.f.a = wrapAngle(odo / P.FR); ra = W.r.a = wrapAngle(odo / P.RR); W.f.t = W.r.t = t; }
  else { fa = stepWheel(W.f, { t, r: P.FR, along, speed, moved }); ra = stepWheel(W.r, { t, r: P.RR, along, speed, moved }); }
  W.pos.copy(v); W.has = true; W.t = t;
  (c.spinW || (c.spinW = [0, 0]))[0] = fa; c.spinW[1] = ra;
  setSmear(c.model, smearOf(speed / P.RR, app().rate ?? 1, !(dts >= 0) || dts > 1));
}
function updateCars(dt) {
  const A = app(), src = A.src;
  // position and velocity of every car from its smooth track (arrays reused frame to frame)
  // steadied tracks (smooth.js) once they're built for this source and circuit; the raw ones until then
  const sm = smoothFor(src);
  const pos = sm ? sm.all(A.t, posBuf, velBuf) : src.positionsInto ? src.positionsInto(A.t, posBuf, velBuf) : src.positionsAt(A.t);
  const drivers = src.state.DriverList || {}, lines = src.state.TimingData?.Lines || {};
  const appLines = src.state.TimingAppData?.Lines || {}, isRace = /Race|Sprint/.test(src.state.SessionInfo?.Type || src.state.SessionInfo?.Name || "") && !/Qualifying|Shootout/.test(src.state.SessionInfo?.Name || "");
  const seen = new Set();
  const focusNum = camNum();
  const F = sm?.frame;   // (v0.53: the cars' easings by the session's time – sdt per car below)
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
    // (v0.45: a seek or a rewind – the moment shown jumping, as the steering's rule below – takes the heading as it is
    // then; eased from the heading before the seek it was up to 0.7 rad off on the first frames – Map3D.seekCheck)
    const jumpT = timeJump(c.yawT, A.t);
    // (v0.53 §6-4: the motion's rates and easings go by the SESSION's time between frames – sdt, s –, not the wall clock's:
    // at 30× the heading's change over a frame divided by the wall's 1/60 s read 30× the real turning rate, and the body
    // leaned, slipped and dipped to its limits on every bend; paused (sdt 0) the pose holds)
    const sdt = c.yawT != null && !jumpT ? Math.max(0, (A.t - c.yawT) / 1000) : 0; c.yawT = A.t;
    const kB = 1 - Math.exp(-sdt * 12), kS = 1 - Math.exp(-sdt * 5);
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
      // (and along it: a queue's spacing, traffic.js – a few metres at most, never past the car ahead)
      const sD = st.s + (est ? 0 : c.trafS || 0), sRate = st.vs + (est ? 0 : c.trafSRate || 0);
      const dTot = st.d + off, dRate = st.vd + offRate;
      F.at(sD, dTot, P0, DIR);
      speed = Math.hypot(sRate, dRate);
      v.set(P0[0], P0[1], P0[2]);
      c.sample = F.sampleAt(sD);
      // heading: the direction of the path over a few metres either side (3–10 m, with the speed): the lap line has
      // fine wiggles from the reference line it's made of, which its tangent shows and a chord averages out
      // (v0.53: facing back along the lap only when the car really reverses – slowly, its telemetry under 20 km/h; the
      // steadied s can run backwards for a moment where its correction pulls it back (a stale or frozen stretch of data,
      // a car crawling on the grid), and v0.52 turned the car round with it: 2025 Hungary, 180° flips at 30–146 km/h)
      let pathYaw;
      // (v0.53: the speed along the track for the heading is the telemetry's where there is some – the steadied s's own rate
      // dips where its place is eased onto the raw positions at a stretch's end: 2025 Hungary's pit entry, where the feed's
      // position steps 8.6 m across onto the pit lane's line and 4 m back, it fell to 2 m/s at 105 km/h and the heading went
      // 40–80° across – and the part of the heading from moving across is held within ACROSS_MAX of the track's direction
      // at speed: no car on the tarmac goes sideways at 100 km/h; a jump of the data does)
      const tel = src.carAt?.(num, A.t), back = st.vs < -1.5 && (!tel || tel.speed < 20);
      const vTel = tel && tel.speed > 5 && !est ? tel.speed / 3.6 : null, vAl = back ? st.vs : vTel ?? Math.abs(st.vs);
      if (Math.abs(vAl) > 1.5) {
        const ds = Math.max(3, Math.min(10, Math.abs(vAl) * 0.1)), h = ds / Math.abs(vAl);
        const dR = Math.abs(vAl) > 15 ? Math.max(-ACROSS_MAX, Math.min(ACROSS_MAX, dRate / Math.abs(vAl))) * Math.abs(vAl) : dRate;
        F.at(sD - vAl * h, dTot - dR * h, PA); F.at(sD + vAl * h, dTot + dR * h, PB);
        pathYaw = Math.atan2(PB[0] - PA[0], PB[2] - PA[2]);
      } else pathYaw = Math.atan2(DIR[0], DIR[1]);
      if (devMotion) c.dbg = [Math.atan2(DIR[0], DIR[1]), Math.atan2(dRate, st.vs || 1), st.s, dTot, st.vs, st.d, off, P0[0], P0[2]];
      let yawRate = c.has && sdt > 0 && c.pathYaw != null ? wrap(pathYaw - c.pathYaw) / sdt : sdt === 0 && c.has && !jumpT ? c.yawRateF ?? 0 : 0;
      if (jumpT || Math.abs(yawRate) > 3) yawRate = 0;   // (a seek)
      // (the turning rate is a difference of headings: it carries a fine ripple where the curve's pieces meet,
      // so it's low-passed before the slip, lean and steering are made from it)
      c.yawRateF = c.has && c.yawRateF != null && !jumpT ? c.yawRateF + (yawRate - c.yawRateF) * (1 - Math.exp(-sdt * 8)) : yawRate;
      yawRate = c.yawRateF;
      const aLat = speed * yawRate, aLong = st.as;
      // slip: ~1.5° at 5 g; a little more (oversteer) when it's on the power out of a slow corner
      const exitSlide = aLong > 4 && speed < 45 && Math.abs(aLat) > 8 ? Math.min(1, (aLong - 4) / 6) * Math.min(1, (Math.abs(aLat) - 8) / 10) * 0.035 * Math.sign(aLat) : 0;
      const beta = Math.max(-0.035, Math.min(0.035, aLat * 0.0006)) + exitSlide;
      const yaw = pathYaw + beta, dy = wrap(yaw - c.yaw);
      if (!c.has || jumpT || Math.abs(dy) > 1.2) c.yaw = yaw; else c.yaw += dy * (1 - Math.exp(-sdt * 30));
      c.pathYaw = pathYaw; c.yawRate = yawRate; c.slide = exitSlide;
      // the road's slope over ±4 m
      F.at(sD + 4, 0, PA); F.at(sD - 4, 0, PB);
      const fwd = back ? -1 : 1, slope = -Math.atan2((PA[1] - PB[1]) * fwd, 8);
      const pitchT = slope + Math.max(-0.006, Math.min(0.02, -aLong * 0.00032));     // −5 g: nose down ~0.9°
      const rollT = Math.max(-0.012, Math.min(0.012, -aLat * 0.0002));               // 5 g: ~0.55° out of the corner
      if (!c.has) { c.pitch = pitchT; c.roll = rollT; }
      c.pitch += (pitchT - c.pitch) * kB; c.roll += (rollT - c.roll) * kB;
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
        v.y = groundFor(c, v.x, v.z, v.y);   // (the pit lane's tarmac is laid 4 cm over the ground)
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
      if (!c.has || jumpT || Math.abs(dy) > 1.2) c.yaw = yaw; else c.yaw += dy * (1 - Math.exp(-sdt * 25));   // a big swing is a jump (seek): snap
      const yawRate = c.has && sdt > 0 ? wrap(c.yaw - (c.prevYaw ?? c.yaw)) / sdt : sdt === 0 && c.has && !jumpT ? c.yawRate || 0 : 0;
      c.pathYaw = c.yaw; c.yawRate = yawRate; c.slide = 0;
      const prevSpeed = c.speed;
      c.speed = c.has && !jumpT ? c.speed + (speed - c.speed) * Math.min(1, sdt * 8) : speed;   // (v0.45: a seek – no easing from before it)
      const acc = sdt > 0 && c.has && !jumpT ? (c.speed - prevSpeed) / sdt : c.acc || 0;
      c.acc = (c.acc || 0) + (Math.max(-60, Math.min(25, acc)) - (c.acc || 0)) * Math.min(1, sdt * 6);
      let slope = 0;
      if (c.sample) {
        const ahead = world.samples[(c.sample.i + 3) % world.n].p, behind = world.samples[(c.sample.i - 3 + world.n) % world.n].p;
        const fwd = Math.cos(c.yaw - Math.atan2(c.sample.tan.x, c.sample.tan.z)) >= 0 ? 1 : -1;
        slope = -Math.atan2((ahead.y - behind.y) * fwd, 12);
      }
      c.pitch += (slope + Math.max(-0.006, Math.min(0.02, -c.acc * 0.00032)) - c.pitch) * kS;
      c.roll += (Math.max(-0.012, Math.min(0.012, -yawRate * c.speed * 0.0002)) - c.roll) * kS;
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
    // (v0.53: only a difference a car could close in that time – up to HAND_MAX m; further, the placement was wrong and the
    // car is shown where its data has it at once: 2025 Hungary, cars leaving the pit lane for the grid glided 80–90 m in
    // 1.5 s at walking pace from where the estimate had them)
    else if (c.estAt != null) { if (A.t >= c.estAt && A.t - c.estAt < 1000 && Math.hypot(c.estPos.x - v.x, c.estPos.z - v.z) <= HAND_MAX) c.hand = { t: A.t, dx: c.estPos.x - v.x, dz: c.estPos.z - v.z }; c.estAt = null; }
    if (c.hand) {
      const w = A.t < c.hand.t || A.t - c.hand.t > 1500 ? 0 : 1 - smoothstep(0, 1500, A.t - c.hand.t);
      if (w <= 0) c.hand = null; else { v.x += c.hand.dx * w; v.z += c.hand.dz * w; }
    }
    // (v0.53: the steadied tracks arriving – a moment after a session opens, smoothFor – take the car from the raw
    // positions it was drawn by so far to its steadied place over READY_MS of the wall's time (also while paused: it is
    // the drawing that changed, not the moment), if that is a step a car could make (HAND_MAX); a seek starts afresh)
    if (c.smFor !== sm) {
      if (c.smFor === null && sm && c.has && !jumpT && c.pos && Math.hypot(c.pos.x - v.x, c.pos.z - v.z) <= HAND_MAX) c.smHand = { at: performance.now(), dx: c.pos.x - v.x, dz: c.pos.z - v.z, dy: c.pos.y - v.y };
      c.smFor = sm;
    }
    if (c.smHand) {
      const e = performance.now() - c.smHand.at, w = jumpT || e > READY_MS ? 0 : 1 - smoothstep(0, READY_MS, e);
      if (w <= 0) c.smHand = null; else { v.x += c.smHand.dx * w; v.z += c.smHand.dz * w; v.y += c.smHand.dy * w; }
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
    // wheels roll the distance gone over each axle's own radius (wheelspin.js: the telemetry's odometer – one measure
    // on the track, the pit lane and an estimated path, a pause, any speed, a seek: the same angle; without telemetry
    // from where the car is on the lap / the lane, else rolled on by the session's time); front wheels
    // steer with the turning rate (Ackermann-ish: δ ≈ L·ω / v)
    rollWheels(c, st, est, F, A.t, v);
    // (the front tyres' slip angle on top, growing with the cornering force: an estimate, ~0.6° per g (0.01 rad); and a
    // touch of opposite lock when the rear steps out)
    // v0.41: on the track, from the path's curvature where the car is (its heading's change over ±4–12 m of the lap
    // line, the car's offset across it) – a function of the moment shown, so a seek, a pause or another speed shows the
    // same steering wheel and arms at the same moment (it was eased from frame-to-frame turning rates: after a seek the
    // wheel took ~0.5 s to come round, and what it showed depended on what had been shown before). Off the track (pit
    // lane, an estimated path) from the turning rate as before, eased – snapped after a jump of the session's time.
    let steer;
    if (st && c.speed > 3) {
      steer = pathSteer(F, st, c.speed);
      c.steer = steer;
    } else {
      steer = c.speed > 3 ? Math.max(-0.4, Math.min(0.4, Math.atan((3.4 * yawRate) / c.speed) + (0.01 * c.speed * yawRate) / 9.81 - (c.slide || 0) * 2)) : 0;
      // (eased: the turning rate from 4 Hz positions twitched it frame to frame)
      const jumped = c.steerT == null || A.t < c.steerT - 50 || A.t - c.steerT > 2000;
      c.steer = c.steer == null || jumped ? steer : c.steer + (steer - c.steer) * (1 - Math.exp(-dt * 5));
    }
    c.steerT = A.t;
    // v0.52: the driver's head into the bend (eyecam.js headYawFor) – the eye camera's car only: on the track from the
    // path's curvature 0.5–1.5 s ahead at this speed (a function of the moment shown, like the steering); elsewhere
    // from the steering, eased
    if (camMode === "eye" && num === focusNum) {
      if (st && c.speed > 3) { const fwd = st.vs >= 0 ? 1 : -1, h = Math.max(4, Math.min(12, Math.abs(st.vs) * 0.15)); c.headYaw = headYawFor(HEAD.ahead.map((tau) => gripKappa(pathKappa(F, st.s + fwd * c.speed * tau, st.d, fwd, h), c.speed)), c.speed); }
      else { const aim = c.speed > 3 ? headYawFor([Math.tan(c.steer || 0) / 3.4], c.speed) : 0; c.headYaw = (c.headYaw || 0) + (aim - (c.headYaw || 0)) * (1 - Math.exp(-dt * 3)); }
    } else c.headYaw = 0;
    if (devSteer != null && num === focusNum) c.steer = devSteerNow();
    setWheels(c.model, devSpin != null && num === focusNum ? (performance.now() / 1000) * devSpin * 2 * Math.PI : c.spinW, c.steer, devSteer != null && num === focusNum ? performance.now() : A.t, devSteer != null && num === focusNum ? 0 : c.speed, devSteer != null && num === focusNum ? null : wheelHistOf(c, num, sm));   // (v0.45: the session's time – the lowered arm's swing goes by it, armswap.js; v0.46: the speed – past ±90° only at a slow corner, car3d lockFor; v0.47: the steering's history – the swing read from it)
    if (devArmDiag && num === focusNum) drawArmDiag(c.model);
    // the shift lights (shiftlights.js): this driver's revs against where they shift up in this gear – close up only
    if (c.model.userData.leds && c.model.userData.lod === "near") lightLeds(c, num, A.t, src);
    // the wings' flaps (aero.js – a function of the moment shown: a seek or a pause shows the pose at once): 2022–25
    // cars – DRS as the car's telemetry says; 2026 cars – active aero, ESTIMATED (the feed has no channel for it): in the
    // event's Straight Mode zones, at speed, until the brake (v0.44; it was speed > 68 m/s and a low turning rate, eased
    // frame to frame – stale after a seek)
    c.aeroState = aeroPose(c, num, st, est, A.t, src);
    if (devAeroHold != null && num === focusNum) { c.aeroState.open = c.aeroState.front = devAeroHold; c.aeroState.why = "development hold"; }
    c.aero = c.aeroState.open; setAero(c.model, c.aero, c.aeroState.front ?? c.aero);
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
    setCockpit(c.model, (inCockpit && camMode === "eye") || (camMode === "inspect" && num === focusNum));
    // the T-cam sees the driver's helmet in front of it, as on TV; from the driver's own eyes it is round the camera
    c.model.userData.helmet.visible = !(camMode === "eye" && num === focusNum);
    c.label.sp.userData.own = inCockpit;
    // (≈: drawn where the start and its telemetry put it – the feed has no position for it now, or one far off its slot)
    paintLabel(c.label, `${l.Position || ""} ${d.Tla}${est ? " ≈" : ""}`.trim(), "#" + (d.TeamColour || "888"), num === A.focus);
    c.label.sp.material.opacity = out ? 0.45 : 1;
  }
  // (a car not drawn this frame is drawn afresh when it's back: no easing from where it was before)
  for (const [num, c] of cars) if (!seen.has(num)) { c.obj.visible = false; c.grid = null; c.has = false; c.est = null; c.estAt = null; c.hand = null; c.pit = null; }
  separate(dt, seen, timeJump(sepT, A.t)); sepT = A.t;
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
  updateSupport(src, A.t);
  updateMarshals(src, A.t);
  updateHarbour(A.t);
}
// The standing starts as shown: race control's, each at the moment the field set off by its telemetry where that differs
// from the race clock's (fieldLaunch) – the clock isn't always lights out; live: as the clock says, nothing ahead
function shownStarts(src, t) {
  const S = startState(src, t);
  if (!S.launches) S.launches = new Map();
  const all = S.hist.starts(src.isLive ? t : Infinity);
  return all.map((s, k) => {
    // (a restart race control doesn't name: standing only if the field is seen setting off together from standstill)
    if (src.isLive || s.standing === false) return s;
    // (only the cars starting from the grid count – not a car out, nor at the race's first start a pit-lane starter; at a
    // restart after a red flag the field itself waits in the pit lane (Monaco 2026), so none is left out for that – and
    // up to the next start)
    if (!S.launches.has(s.t)) {
      const ctx = startCtxAt(S, s.t), first = k === 0;
      const skip = (num) => { const kd = ctx ? carKind(S.hist, ctx, num, s.t).kind : null; return kd === "out" || (first && kd === "pit"); };
      S.launches.set(s.t, fieldLaunch(src.car, s, { until: all[k + 1]?.t ?? Infinity, skip }));
    }
    const f = S.launches.get(s.t);
    if (s.standing !== true) return f ? { ...s, t: f.t, standing: true, from: "field" } : s;
    return f && Math.abs(f.t - s.t) > 3000 ? { ...s, t: f.t, from: "field" } : s;
  });
}
// Monaco's harbour in Grand Prix week (harbour.js: yachts along Port Hercule's quays – a reproduction of the form and
// density, not of particular yachts): on the scene's sea surface, once the real map (its sea) is there; a part of it.
function updateHarbour(t) {
  const W = world, R = W?.real; if (!R) return;
  if (W.harbour?.real !== R) {
    W.harbour = { real: R, y: null };
    const A = app(), key = venueOf({ circuitKey: A.circuitKey?.(), location: A.location?.() })?.key;
    if (harbourFor(key, A.sessionYear?.() || null) && R.seaLevel != null && R.isSea) {
      const list = layoutYachts({ toScene: (la, lo) => R.geo.fromLL(la, lo), isSea: (x, z) => R.isSea(x, z) });
      const y = yachtMeshes(list, R.seaLevel); y.group.name = "harbourYachts"; R.group.add(y.group);
      W.harbour.y = y; W.harbour.list = list;
    }
  }
  W.harbour.y?.update(t / 1000);
}
// Marshal posts (marshals.js, marshaldata.js: the FIA circuit map's posts and light panels for this circuit): two marshals
// in orange behind the barrier at each post – the barrier as drawn (the map's or the generated one, found by a ray from the
// track's edge outwards; none within 90 m: the post is left out, counted) – facing the cars coming, and the light panels on posts at
// the barrier. Their flags from race control's sector flags and TrackStatus at the moment shown (the same after a seek;
// waved from the session's time – still while paused). Built once the real map's barriers are there; a part of the world.
const MARSHAL = { far: 650, flagFar: 380, per: 2 };
// (the nearest lap sample to a scene point – any distance: the logical map never fails on a placement)
function lapIndexOf(x, z) {
  let bi = -1, bd = Infinity;
  for (const s of world.samples) { const d = (s.p.x - x) ** 2 + (s.p.z - z) ** 2; if (d < bd) { bd = d; bi = s.i; } }
  return bi;
}
function buildMarshals(src) {
  const W = world, A = app(), key = venueOf({ circuitKey: A.circuitKey?.(), location: A.location?.() })?.key;
  const D = key != null ? MARSHAL_DATA[key] : null;
  if (!D || !W.grid) return { posts: [], panels: [], map: null, data: null, info: null };
  const c0 = W.center, n = W.samples.length, ray = new THREE.Raycaster();
  const targets = [W.real?.group.getObjectByName("barriers"), W.group.getObjectByName("syntheticWalls")].filter(Boolean);
  const sceneOf = (X, Y) => ({ x: X * DM - c0.x, z: -(Y * DM - c0.z) });
  // the logical map first – every panel and post of the FIA map at its point on the lap, whether or not it can be drawn
  const map = marshalMap(D.lights.map(([nn, X, Y]) => { const q = sceneOf(X, Y); return { n: +nn, i: lapIndexOf(q.x, q.z) }; }),
    D.posts.map(([id, X, Y]) => { const q = sceneOf(X, Y); return { id, i: lapIndexOf(q.x, q.z) }; }), n);
  // then what can be drawn: each behind the barrier at its place (the map's along-track place; its side from the map's
  // label – an inference; how far out: the barrier found by a ray from the track's edge – an estimate)
  let guessed = 0, skipped = 0, lane = 0;
  const place = (X, Y, side, i, panel = false) => {
    const s = W.samples[i]; if (!s) return null;
    const sg = side === "R" ? 1 : -1, edge = edgeOf(s, sg);
    const from = new THREE.Vector3(s.p.x + s.nor.x * edge, s.p.y + 0.6, s.p.z + s.nor.z * edge), dir = new THREE.Vector3(s.nor.x * sg, 0, s.nor.z * sg);
    ray.set(from, dir); ray.far = 90;
    const hit = targets.length ? ray.intersectObjects(targets, true)[0] : null;
    // (no barrier drawn within 90 m: nobody is stood in the run-off on a guess – not drawn, counted; its sector stays)
    if (!hit) { guessed++; return null; }
    let off = hit.distance + 1.6, x = s.p.x + s.nor.x * (edge + sg * off), z = s.p.z + s.nor.z * (edge + sg * off);
    // (behind the pit wall is the pit lane – v0.38: a panel stood in its fast lane: a panel goes on the wall itself, a post
    // isn't stood there)
    const ln = W.pitLane ? laneNearest(x, z) : null;
    if (ln && ln.d < 7.5) { if (!panel) { lane++; return null; } off = hit.distance + 0.3; x = s.p.x + s.nor.x * (edge + sg * off); z = s.p.z + s.nor.z * (edge + sg * off); }
    // (not on another stretch of the track: not drawn there)
    const [o, d] = W.grid.nearest(x, z, 2);
    if (o && Math.min(Math.abs(o.i - s.i), n - Math.abs(o.i - s.i)) > 20 && d < Math.max(edgeOf(o, 1), -edgeOf(o, -1)) + 2) { skipped++; return null; }
    // facing the cars coming (against the race's direction), turned a little to the track
    const fx = -s.tan.x * 0.75 - s.nor.x * sg * 0.66, fz = -s.tan.z * 0.75 - s.nor.z * sg * 0.66, fl = Math.hypot(fx, fz);
    return { x, z, y: s.p.y, i: s.i, face: { x: fx / fl, z: fz / fl }, along: { x: s.tan.x, z: s.tan.z } };
  };
  const lights = D.lights.map(([nn, X, Y, side]) => { const q = sceneOf(X, Y); return { n: +nn, X, Y, side, i: lapIndexOf(q.x, q.z) }; });
  const panels = lights.map((l) => { const q = place(l.X, l.Y, l.side, l.i, true); return q && { n: l.n, ...q }; }).filter(Boolean);
  const posts = D.posts.map(([id, X, Y, side], k) => { const lp = map.posts[k], q = place(X, Y, side, lp.i); return q && { id, ...q, sector: lp.sector, prev: lp.prev, first: !!lp.first }; }).filter(Boolean);
  const season = A.sessionYear?.() || null;
  const info = { venue: key, season: D.season, sameSeason: D.season === season, map: D.map, url: D.url, sectors: map.bounds.length, mirrors: map.mirrors.length,
    posts: posts.length, panels: panels.length, ofPosts: D.posts.length, ofPanels: D.lights.length, noBarrier: guessed, onTrack: skipped, pitLane: lane,
    where: { along: `FIA ${D.season} circuit map, fitted to a lap (~5–8 m)`, side: "the map label's side (inferred)", out: "behind the barrier found by a ray (estimate)" } };
  return { posts, panels, map, data: D, info };
}
// The light panels' faces: one shared atlas (dark, yellow, the double yellow's two halves, red, green, "SC", "VSC"), each
// panel's cell per instance – one texture for all of them, made once
const PANEL_CELLS = ["off", "yellow", "doubleA", "doubleB", "red", "green", "sc", "vsc"];
let panelAtlas = null;
function panelAtlasTexture() {
  if (panelAtlas) return panelAtlas;
  const W = 96, H = 64, cv = document.createElement("canvas"); cv.width = W * PANEL_CELLS.length; cv.height = H;
  const g = cv.getContext("2d");
  const lamps = (x0, colour, rows = [0, 1]) => { g.fillStyle = colour; for (const r of rows) for (let c = 0; c < 4; c++) { g.beginPath(); g.arc(x0 + 16 + c * 21.3, 16 + r * 32, 8.5, 0, Math.PI * 2); g.fill(); } };
  PANEL_CELLS.forEach((k, j) => {
    const x0 = j * W; g.fillStyle = "#0b0c0e"; g.fillRect(x0, 0, W, H);
    g.fillStyle = "#16181b"; for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { g.beginPath(); g.arc(x0 + 16 + c * 21.3, 16 + r * 32, 8.5, 0, Math.PI * 2); g.fill(); }
    if (k === "yellow") lamps(x0, "#ffd200");
    if (k === "doubleA") lamps(x0, "#ffd200", [0]);
    if (k === "doubleB") lamps(x0, "#ffd200", [1]);
    if (k === "red") lamps(x0, "#ff1a10");
    if (k === "green") lamps(x0, "#1fd15a");
    if (k === "sc" || k === "vsc") { g.fillStyle = "#0b0c0e"; g.fillRect(x0, 0, W, H); g.fillStyle = "#ffd200"; g.font = `bold ${k === "sc" ? 44 : 34}px Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(k.toUpperCase(), x0 + W / 2, H / 2 + 2); }
  });
  panelAtlas = new THREE.CanvasTexture(cv); panelAtlas.colorSpace = THREE.SRGBColorSpace; panelAtlas.anisotropy = 4;
  panelAtlas.userData.shared = true;
  return panelAtlas;
}
function panelFaceMaterial() {
  const m = new THREE.MeshBasicMaterial({ map: panelAtlasTexture() });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aCell;")
      .replace("#include <uv_vertex>", `#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv.x = (vMapUv.x + aCell) * ${(1 / PANEL_CELLS.length).toFixed(6)};\n#endif`);
  };
  m.customProgramCacheKey = () => "panelAtlas";
  return m;
}
// a panel's signal → the atlas cell shown now (flashing from the session's time: still while paused; light panels flash
// at 3–4 Hz – App H 2.5.3.3 –, a double yellow as two lamp rows in turn – how the double shows on F1's panels isn't
// documented: an estimate; "SC" / "VSC" steady letters)
function panelCell(sig, tsec) {
  const ph = Math.floor(tsec * 2 * 3.5) % 2;
  if (sig === "yellow") return ph ? "yellow" : "off";
  if (sig === "double") return ph ? "doubleA" : "doubleB";
  if (sig === "red") return ph ? "red" : "off";
  return sig || "off";
}
// When TrackStatus last turned "7" (VSC ending) at or before t – replay: from the session's record; live: as it came
let statusTrail = null;
function vscEndAt(src, t) {
  if (!statusTrail || statusTrail.src !== src) {
    statusTrail = { src, list: [] };
    if (!src.isLive) { let last = null; for (const e of src.events || []) if (e.topic === "TrackStatus" && e.data?.Status && e.data.Status !== last) { last = e.data.Status; statusTrail.list.push([e.ms, last]); } }
  }
  const L = statusTrail.list;
  if (src.isLive) { const s = src.state.TrackStatus?.Status ?? null; if (s && (!L.length || L[L.length - 1][1] !== s)) { if (L.length && L[L.length - 1][0] > t) L.length = 0; L.push([t, s]); } }
  return vscEndOf(L, t);
}
function updateMarshals(src, t) {
  const W = world; if (!W?.grid || !src) return;
  if (!W.marshals || W.marshals.real !== W.real || W.marshals.src !== src) {
    if (W.marshals) { W.group.remove(W.marshals.group); disposeGroup(W.marshals.group); }
    if (!W.real) { W.marshals = null; return; }   // (behind the real map's barriers only)
    const M = buildMarshals(src), group = new THREE.Group(); group.name = "marshals";
    const crew = crewMeshes(Math.max(2, M.posts.length * MARSHAL.per)); group.add(crew.group);
    // the light panels: a post and a panel facing the cars coming – two instanced meshes for all of them (the face unlit,
    // its atlas cell per instance: the sector's signal)
    const body = new THREE.BufferGeometry().copy(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6).translate(0, 1.1, 0).toNonIndexed());
    const box = new THREE.BoxGeometry(0.7, 0.5, 0.12).translate(0, 2.3, 0).toNonIndexed();
    const merged = new THREE.BufferGeometry(); for (const k of ["position", "normal"]) { const a1 = body.attributes[k].array, a2 = box.attributes[k].array, arr = new Float32Array(a1.length + a2.length); arr.set(a1); arr.set(a2, a1.length); merged.setAttribute(k, new THREE.BufferAttribute(arr, 3)); }
    body.dispose(); box.dispose();
    const np = Math.max(1, M.panels.length);
    const frames = new THREE.InstancedMesh(merged, new THREE.MeshStandardMaterial({ color: "#2b2e33", roughness: 0.55 }), np);
    const faceGeo = new THREE.PlaneGeometry(0.6, 0.4).translate(0, 2.3, 0.061);
    faceGeo.setAttribute("aCell", new THREE.InstancedBufferAttribute(new Float32Array(np), 1));
    const faces = new THREE.InstancedMesh(faceGeo, panelFaceMaterial(), np);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), yAx = new THREE.Vector3(0, 1, 0);
    M.panels.forEach((p, i) => { q.setFromAxisAngle(yAx, Math.atan2(p.face.x, p.face.z)); m4.compose(new THREE.Vector3(p.x, groundY(p.x, p.z), p.z), q, one); frames.setMatrixAt(i, m4); faces.setMatrixAt(i, m4); p.slot = i; p.cell = "off"; });
    frames.count = faces.count = M.panels.length; frames.castShadow = true; group.add(frames, faces); M.faces = faces;
    W.group.add(group);
    W.marshals = { real: W.real, src, group, crew, ...M, flags: new Map(), key: null };
  }
  const MS = W.marshals;
  const status = src.state.TrackStatus?.Status ?? null, state = flagState(src.messages || [], status);
  const tsec = t / 1000, cam = camera.position;
  // the posts (none drawn – the panels still show their signals)
  if (MS.posts.length) {
    const figures = [], used = new Set();
    for (const [k, p] of MS.posts.entries()) {
      const sig = postSignal(p, state, p.prev), dist = Math.hypot(p.x - cam.x, p.z - cam.z);
      if (dist > MARSHAL.far) continue;
      const y = groundY(p.x, p.z), yaw = Math.atan2(p.face.x, p.face.z) - Math.PI / 2;
      for (let m = 0; m < MARSHAL.per; m++) {
        const a = (m - (MARSHAL.per - 1) / 2) * 1.3, x = p.x + p.along.x * a, z = p.z + p.along.z * a;
        const waving = sig && (m === 0 || sig === "double");
        const w = Math.sin(tsec * 2 * Math.PI * 1.4 + k + m * 0.7);
        const pose = waving ? flagPose(w) : flagPose(0, true);
        const fig = { x, y, z, yaw, colour: "#ff6a13", pose, role: "marshal", seed: k * 3 + m }; figures.push(fig);
        if (waving && dist < MARSHAL.flagFar) {
          const fk = k + ":" + m; used.add(fk);
          let f = MS.flags.get(fk); if (!f) { f = makeFlag("yellow"); MS.flags.set(fk, f); MS.group.add(f.group); }
          f.set(sig === "double" ? "yellow" : sig); f.group.visible = true;
          // (the pole in the fist, along the forearm: the arm's swing is the flag's – crew.js flagHold)
          const { at: h, axis: ax } = flagHold(pose), c = Math.cos(yaw), sn = Math.sin(yaw);
          fig.hands = [null, [h[0], h[1], h[2], 1, ax[0], ax[1], ax[2]]];
          f.pose({ x: x + h[0] * c + h[2] * sn, y: y + h[1], z: z - h[0] * sn + h[2] * c }, { x: -p.along.x, z: -p.along.z }, tsec, 1, k * 0.9 + m, { x: ax[0] * c + ax[2] * sn, y: ax[1], z: -ax[0] * sn + ax[2] * c });
        }
      }
    }
    for (const [fk, f] of MS.flags) if (!used.has(fk)) f.group.visible = false;
    MS.crew.place(figures, [], cam);
  }
  // the panels: each its own sector's signal, or every panel's SC / VSC / red / VSC-ending green
  if (MS.panels.length) {
    const vscEnd = vscEndAt(src, t), cells = MS.faces.geometry.getAttribute("aCell"); let dirty = false;
    for (const p of MS.panels) {
      const sig = panelSignal(p.n, state, { t, vscEnd }), cell = panelCell(sig, tsec);
      p.sig = sig;
      if (p.cell !== cell) { cells.setX(p.slot, PANEL_CELLS.indexOf(cell)); p.cell = cell; dirty = true; }
    }
    if (dirty) cells.needsUpdate = true;
  }
  MS.state = { red: state.red, sc: state.sc, vsc: state.vsc, sectors: [...state.sectors] };
  // (what the posts show rests on: race control's sector flags; where they stand: the FIA map – of another season, said so)
  const mapNote = MS.info && !MS.info.sameSeason ? `, ${MS.info.season} FIA 지도 위치` : "";
  MS.note = state.red || state.sc || state.sectors.size ? `마샬 깃발: 레이스 컨트롤 신호${mapNote}` : state.vsc ? "VSC: 라이트 패널만(깃발은 규정에 없음)" : status === "2" ? "황기: 구간 정보 없음 – 포스트에 표시 안 함" : null;
}
// The support cars and the rear-of-grid official (support.js: what each does at the moment shown – the safety car from
// its own feed or parked at the pit exit; the medical car and the official reproductions, said so on screen). Parts of
// the world (freed with it); everything placed from the moment shown – the same after a seek, at any speed.
function supportCtx(src, t) {
  const W = world; if (!W) return null;
  if (W.support?.src === src) return W.support;
  const group = new THREE.Group(); group.name = "support"; W.group.add(group);
  return (W.support = { src, group, cars: {}, crew: null, flag: null, starts: new Map() });
}
const toScene = (p, c0) => ({ x: p[0] * DM - c0.x, z: -(p[1] * DM - c0.z) });
function groundY(x, z) { const [s] = world.grid.nearest(x, z, 3); return s ? s.p.y : 0; }
// a point on the pit lane u m along it (and its direction)
function laneAt(u) {
  const L = world.pitLane; if (!L) return null;
  let i = 1; while (i < L.cum.length - 1 && L.cum[i] < u) i++;
  const a = L.pts[i - 1], b = L.pts[i], f = Math.max(0, Math.min(1, (u - L.cum[i - 1]) / Math.max(1e-6, L.cum[i] - L.cum[i - 1])));
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, dx: b.x - a.x, dz: b.z - a.z };
}
function placeSupportCar(SP, key, id, where, lightsOn, tsec) {
  let c = SP.cars[key];
  if (!c || c.id !== id) { if (c) { SP.group.remove(c.obj); disposeGroup(c.obj); } c = SP.cars[key] = { id, obj: makeSupportCar(id) }; SP.group.add(c.obj); }
  if (!where) { c.obj.visible = false; return; }
  c.obj.visible = true;
  // (the wheels roll the distance it moved at the session's time – wheelspin.js: still at a pause, nothing made up at a
  // seek or a jump to another place)
  const t = tsec * 1000, W = c.wheel || (c.wheel = { f: { a: null, t: null }, r: { a: null, t: null }, x: where.x, z: where.z, t });
  const moved = Math.hypot(where.x - W.x, where.z - W.z), dts = (t - W.t) / 1000, sp = c.obj.userData.spec;
  const fwd = Math.sin(Math.atan2(where.dx, where.dz)) * (where.x - W.x) + Math.cos(Math.atan2(where.dx, where.dz)) * (where.z - W.z) >= 0 ? 1 : -1;
  const speed = dts > 0 ? (fwd * moved) / dts : 0;
  c.obj.userData.setSpin?.(stepWheel(W.f, { t, r: sp.RF || 0.35, speed, moved }), stepWheel(W.r, { t, r: sp.RR || 0.35, speed, moved }));
  W.x = where.x; W.z = where.z; W.t = t;
  c.obj.position.set(where.x, groundY(where.x, where.z), where.z); c.obj.rotation.set(0, Math.atan2(where.dx, where.dz), 0);
  c.obj.userData.setLights(lightsOn, tsec);
}
// the nearest point of the pit lane to a scene point: { u (m along it), d (m off its line) }
function laneNearest(x, z) {
  const L = world.pitLane; if (!L) return null;
  let best = null;
  for (let i = 1; i < L.pts.length; i++) {
    const a = L.pts[i - 1], b = L.pts[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1e-9;
    const f = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)), px = a.x + dx * f, pz = a.z + dz * f, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { u: L.cum[i - 1] + f * (L.cum[i] - L.cum[i - 1]), d };
  }
  return best;
}
// metres along the lap from sample a forward to sample b; the point s m ahead of sample i (on the racing line, its
// direction)
function trackDist(a, b) { const S = world.samples, n = S.length; let d = 0; for (let i = a; i !== b; i = (i + 1) % n) { const p = S[i].p, q = S[(i + 1) % n].p; d += Math.hypot(q.x - p.x, q.z - p.z); if (d > 5000) return Infinity; } return d; }
function trackAhead(i, s) {
  const S = world.samples, n = S.length; let d = 0;
  for (let k = 0; k < n; k++) { const a = S[(i + k) % n], b = S[(i + k + 1) % n], l = Math.hypot(b.p.x - a.p.x, b.p.z - a.p.z); if (d + l >= s) { const f = (s - d) / (l || 1); return { x: a.p.x + (b.p.x - a.p.x) * f, z: a.p.z + (b.p.z - a.p.z) * f, dx: b.p.x - a.p.x, dz: b.p.z - a.p.z }; } d += l; }
  return null;
}
// TrackStatus at or within `back` ms before t was s (replay: the session's record; live: as it came – statusTrail)
function statusWas(src, t, s, back) {
  vscEndAt(src, t);   // (keeps the trail up to date)
  const L = statusTrail.list; let cur = null;
  for (const [m, v] of L) { if (m > t) break; if (m >= t - back && v === s) return true; cur = v; }
  return cur === s;
}
function updateSupport(src, t) {
  if (!world || !src || !world.grid) return;
  const A = app(), SP = supportCtx(src, t); if (!SP) return;
  const isRace = /Race|Sprint/.test(src.state.SessionInfo?.Type || src.state.SessionInfo?.Name || "") && !/Qualifying|Shootout/.test(src.state.SessionInfo?.Name || "");
  const starts = isRace ? shownStarts(src, t) : [], start = starts[0] || null, c0 = world.center;
  const P = world.pitLane, exitU = P ? P.exitU : null;
  // the medical car's start: the starters, last grid place first (pit-lane starters and cars out left aside), and when it
  // reaches the pit entry after lap 1 – found in the positions, the same whenever asked (a replay: at once; live: again
  // as positions come in until the data has it – provisional till then)
  let st = start && start.standing === true ? SP.starts.get(start.t) : null;
  if (start && start.standing === true && (!st || (!st.lap1.final && t - st.at >= 1000) || !st.order.length)) {
    const S = startState(src, t), ctx = startCtxAt(S, start.t);
    const order = Object.keys(src.state.DriverList || {}).map((num) => [num, ctx ? carKind(S.hist, ctx, num, start.t) : null]).filter(([, k]) => k?.kind === "grid").sort((a, b) => b[1].g - a[1].g || +a[0] - +b[0]).map(([n]) => n);
    const ent = P ? laneAt(0) : null, buf = [0, 0, 0];
    const pos = (num, tau) => src.tracks?.at(num, tau, buf) ? toScene(buf, c0) : null;
    // (in the pit lane: within 5 m of its line past its first 30 m, and off the track)
    const inLane = (p) => { if (!P) return false; const q = laneNearest(p.x, p.z); if (!q || q.d > 5 || q.u < 30) return false; const [s0, d0] = world.grid.nearest(p.x, p.z, 2); return !s0 || d0 > Math.max(edgeOf(s0, 1), -edgeOf(s0, -1)) + 1.5; };
    const nearEntry = (p) => ent && Math.hypot(p.x - ent.x, p.z - ent.z) < 30;
    let dataEnd = Infinity;
    if (src.isLive) { dataEnd = -Infinity; for (const n of order) { const c = src.tracks?.cars?.[n]; if (c?.n) dataEnd = Math.max(dataEnd, c.t[c.n - 1]); } }
    const lap1 = ent && order.length ? medicalLap1({ L: start.t, order, pos, inLane, nearEntry, dataEnd }) : { t: null, final: !src.isLive };
    st = { order, lap1, at: t, pos, inLane, last: order[0] || null }; SP.starts.set(start.t, st);
  }
  const status = src.state.TrackStatus?.Status ?? null;
  // the safety car: its feed's places now and each one's age; its last place when none is fresh
  const sup = src.supportAt ? (src.isLive ? src.supportAt() : src.supportAt(t)) : {};
  const lastS = src.supportLast ? (src.isLive ? src.supportLast() : src.supportLast(t)) : {};
  const ages = {}; let scLast = null;
  for (const [n, s] of Object.entries(lastS)) { ages[n] = t - s.t; if (!scLast || s.t > scLast.t) scLast = { num: n, t: s.t, x: s.x, y: s.y }; }
  if (scLast && P) {
    const q = toScene([scLast.x, scLast.y], c0), ln = laneNearest(q.x, q.z);
    scLast.laneU = ln && ln.d < 25 ? ln.u : null; scLast.laneD = ln ? +ln.d.toFixed(1) : null; scLast.at = [+q.x.toFixed(1), +q.z.toFixed(1)];
    // (on the track before the pit entry: how far along the lap to it – the entry's nearest track sample)
    scLast.toEntry = null;
    if (scLast.laneU == null) { const [a, da] = world.grid.nearest(q.x, q.z, 3), e = laneAt(0), [b] = e ? world.grid.nearest(e.x, e.z, 4) : []; if (a && b && da < 30) { const d = trackDist(a.i, b.i); if (d <= 800) { scLast.toEntry = d; scLast.i0 = a.i; } } }
  }
  SP.scLast = scLast;
  const plan = supportPlan({ t, status, sc: sup, ages, scRecent: statusWas(src, t, "4", 6000), scLast, parkU: exitU, start, lap1: st?.lap1 || null, lap: +(src.state.LapCount?.CurrentLap || 0) || null, race: isRace });
  const models = supportModels(A.sessionYear?.() || 0, venueOf({ circuitKey: A.circuitKey?.(), location: A.location?.() })?.key ?? null, sessionDate());
  const scId = models.sc || "neutralSc", medId = models.medical || "neutralMedical", tsec = t / 1000;
  // (parked beside the lane's line at its end – the cars leaving the pits drive past, never through them: the side away
  // from the track, 4 m off the line – an estimate of the spot); on the way there along the lane's line, moving over to
  // that side in its last 20 m
  const sideOf = (a) => { const l = Math.hypot(a.dx, a.dz) || 1, nx = a.dz / l, nz = -a.dx / l, d = (sg) => { const [q, dd] = world.grid.nearest(a.x + nx * 4 * sg, a.z + nz * 4 * sg, 2); return q ? dd : 99; }; return { nx, nz, sg: d(1) >= d(-1) ? 1 : -1 }; };
  const laneSpot = (u, back) => {
    if (exitU == null) return null; const park = Math.max(0, exitU - back), a = laneAt(Math.min(u, park)); if (!a) return null;
    const { nx, nz, sg } = sideOf(laneAt(park)), off = 4 * Math.max(0, Math.min(1, (u - (park - 20)) / 20));
    return { ...a, x: a.x + nx * off * sg, z: a.z + nz * off * sg };
  };
  const parkedAt = (back) => laneSpot(Infinity, back);
  if (plan.sc?.mode === "track") {
    const p = toScene(plan.sc.pos, c0), q0 = (src.isLive ? src.supportAt(t - 500) : src.supportAt(t - 500))?.[plan.sc.num], q = q0 ? toScene(q0, c0) : null;
    // (heading from its last half second while it moves; standing or crawling (< 0.6 m in ½ s): the last heading it had)
    if (q && Math.hypot(p.x - q.x, p.z - q.z) > 0.6) SP.scDir = { dx: p.x - q.x, dz: p.z - q.z };
    placeSupportCar(SP, "sc", plan.sc.role === "sc" ? scId : "neutralSupport", { x: p.x, z: p.z, dx: SP.scDir?.dx ?? 0, dz: SP.scDir?.dz ?? 1 }, plan.sc.role === "sc", tsec);
  } else if (plan.sc?.mode === "returning") placeSupportCar(SP, "sc", scId, plan.sc.leg === "track" ? trackAhead(scLast.i0, plan.sc.s) : laneSpot(plan.sc.u, 4), false, tsec);
  else placeSupportCar(SP, "sc", scId, plan.sc?.mode === "parked" ? parkedAt(4) : null, false, tsec);
  // the medical car
  let med = null;
  const slotBack = () => {
    // (behind the last row: the last painted grid box as measured (grid.js) – support.js gridRearSlot –, or, without it, the
    // last starter's own place)
    const g = st?.last ? world.gridModel?.slots.get(gridRearSlot(+carKindG(src, start, st.last), world.gridModel?.slots)) : null;
    if (g) return { x: g.x, z: g.z, f: { x: g.tx, z: g.tz } };
    const trk = st?.last ? src.tracks?.cars?.[st.last] : null, a = [0, 0, 0], b = [0, 0, 0];
    if (trk && src.tracks.at(st.last, start.t - 3000, a) && src.tracks.at(st.last, start.t + 2500, b)) { const p = toScene(a, c0), q = toScene(b, c0), d = Math.hypot(q.x - p.x, q.z - p.z) || 1; return { x: p.x, z: p.z, f: { x: (q.x - p.x) / d, z: (q.z - p.z) / d } }; }
    return null;
  };
  const back = start && st && (plan.medical?.mode === "gridRear" || plan.official || (plan.medical?.mode === "following" && t - start.t < 8000)) ? slotBack() : null;
  if (back) SP.gridBack = { x: back.x - back.f.x * 5.5, z: back.z - back.f.z * 5.5, f: back.f, t: start.t };   // (the official just behind the last row – an estimate)
  const rear = back ? { x: back.x - back.f.x * 13, z: back.z - back.f.z * 13, dx: back.f.x, dz: back.f.z } : null;   // (the medical car behind them)
  if (plan.medical?.mode === "following" && st) {
    // (the car it follows, lag behind on its path – never on top of it: further back while that car is slow; off the
    // grid it moves up from its place behind the last row over the first 8 s)
    let tg = null, lag = plan.medical.lag;
    for (; lag <= 9000; lag += 1500) { tg = followTarget({ L: start.t, order: st.order, pos: st.pos, inLane: st.inLane }, t - lag); if (!tg) break; const now = st.pos(tg.num, t); if (!now || Math.hypot(now.x - tg.p.x, now.z - tg.p.z) >= 12) break; }
    if (tg) {
      const q = st.pos(tg.num, t - lag - 400) || tg.p; med = { x: tg.p.x, z: tg.p.z, dx: tg.p.x - q.x || 1e-6, dz: tg.p.z - q.z };
      const k = (t - start.t) / 8000;
      if (rear && k < 1) { const e = k * k * (3 - 2 * k); med = { x: rear.x + (med.x - rear.x) * e, z: rear.z + (med.z - rear.z) * e, dx: rear.dx + (med.dx - rear.dx) * e, dz: rear.dz + (med.dz - rear.dz) * e }; }
      SP.medFollows = tg.num;
    }
  } else if (plan.medical?.mode === "gridRear") med = rear;
  else if (plan.medical?.mode === "entering") med = laneSpot(plan.medical.u, 14);
  else if (plan.medical?.mode === "parked") med = parkedAt(14);
  placeSupportCar(SP, "med", medId, med, plan.medical?.mode === "following" || plan.medical?.mode === "entering", tsec);
  SP.medShown = !!med;
  // the rear-of-grid official: behind the last row with a green flag, then off to the side of the track (where: support.js
  // flagSpot, in the lap line's frame from the grid's rear point – the ground it stands on measured here once per start)
  if (plan.official && SP.gridBack && SP.gridBack.t === start?.t) {
    if (!SP.crew) { SP.crew = crewMeshes(2); SP.group.add(SP.crew.group); SP.flag = makeFlag("green"); SP.group.add(SP.flag.group); }
    const F = world.frame;
    // (once per start – again when the pit building or the map's barriers arrive: they decide where it can step off)
    const offKey = `${start.t}|${!!pitTeams.G}|${!!world.real}`;
    if (!SP.off || SP.off.key !== offKey) { const o = F.project(SP.gridBack.x, SP.gridBack.z); const ground = o ? flagGround(SP.gridBack, o, rear, medId) : null; SP.off = { key: offKey, s: o?.s, ground, spot: ground ? flagSpot(ground) : null }; }
    const { s: s0, spot } = SP.off;
    if (spot) {
      const p = flagAt(spot, plan.official.phase, plan.official.f), q = [0, 0, 0], D = [0, 1];
      F.at(s0 + p.u, p.v, q, D);
      const x = q[0], z = q[2], y = groundY(x, z), sg = Math.sign(spot.exit.v - spot.flag.v) || spot.side, side = { x: -D[1] * sg, z: D[0] * sg };
      // (facing the grid while waving – the starter's way –, then the way it walks)
      const face = p.facing === "grid" ? { x: D[0], z: D[1] } : side, yaw = Math.atan2(face.x, face.z) - Math.PI / 2;
      const flagging = p.facing === "grid", wave = flagging ? Math.sin(tsec * 2 * Math.PI * 1.4) : 0;
      // (walking off: the feet in step with the metres walked – walkPhase)
      const pose = flagging ? flagPose(wave) : walkPose(walkPhase(p.walked));
      const { at: h, axis: ax } = flagHold(pose), c = Math.cos(yaw), sn2 = Math.sin(yaw);
      SP.crew.place([{ x, y, z, yaw, colour: "#ff6a13", pose, role: "marshal", seed: 1, hands: flagging ? [null, [h[0], h[1], h[2], 1, ax[0], ax[1], ax[2]]] : null }], [], camera.position);
      const hx = x + h[0] * c + h[2] * sn2, hz = z - h[0] * sn2 + h[2] * c;
      SP.flag.group.visible = flagging;
      if (flagging) SP.flag.pose({ x: hx, y: y + h[1], z: hz }, { x: side.x, z: side.z }, tsec, 1, 0.3, { x: ax[0] * c + ax[2] * sn2, y: ax[1], z: -ax[0] * sn2 + ax[2] * c });
      SP.officialShown = true; SP.officialAt = { x: +x.toFixed(1), z: +z.toFixed(1), u: +p.u.toFixed(2), v: +p.v.toFixed(2), side: spot.side, via: spot.via || null };
    } else if (SP.officialShown) { SP.crew.place([], [], camera.position); SP.flag.group.visible = false; SP.officialShown = false; }
  } else if (SP.crew && SP.officialShown) { SP.crew.place([], [], camera.position); SP.flag.group.visible = false; SP.officialShown = false; }
  SP.plan = plan; SP.models = models;
  supportNote(plan, models);
}
// the last starter's grid place at a start (startplan's carKind)
function carKindG(src, start, num) { const S = startState(src, start.t), ctx = startCtxAt(S, start.t); return ctx ? carKind(S.hist, ctx, num, start.t)?.g ?? null : null; }
// The ground the rear-of-grid official's place is chosen on (support.js flagSpot), in the lap line's frame from the
// grid's rear point (o: its place in the frame): the medical car there (rear: its centre; id: its model, for its size),
// the asphalt's edges along the track, the first barrier past each edge across from in front of the medical car (the
// map's or the generated one, a level ray; null: none within 40 m) and the pit lane – inside the pit building's lane
// (garages to the wall's face, pitModelFor) or, off the asphalt, within 8 m of the measured pit path (world.laneZone)
function flagGround(gb, o, rear, id) {
  const F = world.frame, q = [0, 0, 0], at = (u, v) => { F.at(o.s + u, v, q); return q; };
  const spec = SUPPORT_CARS[id] || SUPPORT_CARS.neutralMedical, mp = rear ? F.project(rear.x, rear.z) : null;
  const med = mp ? { u: mp.s - o.s, v: mp.d, L: spec.L, W: spec.W } : null;
  const edges = (u) => { const s = F.sampleAt(o.s + u); return { L: edgeOf(s, 1), R: edgeOf(s, -1) }; };
  const G = pitTeams.G, m = G ? pitModelFor(G) : null;
  const inPit = (u, v) => {
    const [x, , z] = at(u, v), e = edges(u);
    if (G) { const pr = G.project(x, z); if (pr.u >= G.gStart - 20 && pr.u <= G.gEnd + 20 && pr.off >= -0.5 && pr.off <= (m.at(Math.max(G.gStart, Math.min(G.gEnd, pr.u))).wall || 0)) return true; }
    return (v > e.L || v < e.R) && !!world.laneZone?.(x, z);
  };
  const targets = [world.real?.group.getObjectByName("barriers"), world.group.getObjectByName("syntheticWalls")].filter(Boolean), ray = new THREE.Raycaster();
  const u0 = med ? med.u + med.L / 2 + FLAG.ahead : 0;
  const wall = (sg) => {
    if (!targets.length) return null;
    const e = edges(u0), [x0, y0, z0] = at(u0, sg > 0 ? e.L : e.R), [x1, , z1] = at(u0, (sg > 0 ? e.L : e.R) + sg), d = Math.hypot(x1 - x0, z1 - z0) || 1;
    ray.set(new THREE.Vector3(x0, y0 + 0.6, z0), new THREE.Vector3((x1 - x0) / d, 0, (z1 - z0) / d)); ray.far = 40;
    const h = ray.intersectObjects(targets, true)[0]; return h ? h.distance : null;
  };
  return { gbV: o.d, med, edges, wall: { L: wall(1), R: wall(-1) }, inPit };
}
function supportNote(plan, models) {
  const parts = [];
  const M = plan.medical?.mode;
  if (M === "following" || M === "gridRear") parts.push(`메디컬카: 위치 데이터가 없어 재현(마지막 차를 따라 첫 랩${plan.medical.provisional ? ", 랩 종료 미확인" : ""})`);
  else if (M === "entering") parts.push("메디컬카: 재현(첫 랩 뒤 피트로)");
  else if (M === "unknown") parts.push("메디컬카: 첫 랩 종료가 데이터에 없어 표시 안 함");
  if (plan.official) parts.push("그리드 후방 관계자: 재현(정확한 시각은 데이터에 없음)");
  if (plan.sc?.mode === "track") parts.push(plan.sc.role === "sc" ? "세이프티카: 실제 위치 데이터" : `지원 차량 ${plan.sc.num}: 실제 위치(역할 미확정)`);
  else if (plan.sc?.mode === "unseen") parts.push("세이프티카 출동 중: 위치 데이터 없음 – 표시 안 함");
  else if (plan.sc?.mode === "returning") parts.push("세이프티카: 위치 데이터 종료 – 피트로 복귀(재현)");
  else if (plan.vsc) parts.push("VSC: 실제 세이프티카는 나오지 않아요");
  if ((plan.sc?.mode === "track" || parts.length) && !models.sc) parts.push("지원 차량 제조사: 이 경기는 확인 안 됨(중립 표시)");
  if (world?.marshals?.note) parts.push(world.marshals.note);
  const text = parts.join(" · ") || null;
  let el = document.getElementById("supportNote");
  if (!el && text) { el = noteLine("supportNote"); }
  if (el) { if (el.hidden !== !text) el.hidden = !text; if (text && el.textContent !== text) el.textContent = text; }
}
// the gantry's reds before a standing start (startplan.js startLights: a replay's estimate – the data has lights out only)
function updateStartLights(src, t) {
  const lamps = world?.group.getObjectByName("grid")?.userData.lamps;
  // (no gantry or source: no lights and no note left from before)
  if (!lamps || !src) { const el = document.getElementById("startLightNote"); if (el && !el.hidden) el.hidden = true; return; }
  // (a replay's standing starts at the moment the field set off by its telemetry where that differs from the race clock's
  // – the clock isn't always lights out; live: as the clock says, nothing ahead)
  const L = startLights(shownStarts(src, t), t, { live: !!src.isLive });
  lamps.forEach((m, i) => { const on = i < L.lit; if ((m.emissiveIntensity > 0.5) !== on) { m.emissiveIntensity = on ? 1.1 : 0.04; m.color.set(on ? 0x500000 : 0x180505); m.emissive.set(on ? 0xff0a00 : 0xff2a1a); } });
  const note = L.est ? "출발 신호: 데이터에는 소등 시각만 있어요 – 빨간불이 켜지는 시점은 추정(1초 간격, 소등 2초 전 5개 점등)" : null;
  let el = document.getElementById("startLightNote");
  if (!el && note) { el = noteLine("startLightNote"); }
  if (el) { if (el.hidden !== !note) el.hidden = !note; if (note && el.textContent !== note) el.textContent = note; }
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
  const focusNum = camNum(), cockpit = camMode === "onboard" || camMode === "eye";
  const list = [...cars.values()].filter((c) => c.obj.visible && c.model.userData.lod === "near")
    .map((c) => ({ num: c.num, c, d: cockpit && c.num === focusNum ? -1 : camera.position.distanceTo(c.obj.position) })).sort((a, b) => a.d - b.d);
  const { have, lost } = wheelScreens.assign(list);
  for (const num of lost) { const c = cars.get(num); if (c) setWheelScreen(c.model, null); }
  for (const { num, tex } of have) { const c = cars.get(num); if (c) setWheelScreen(c.model, tex); }
  const lines = src?.state?.TimingData?.Lines || {}, laps = src?.state?.LapCount || null, season = app()?.sessionYear?.() || null;
  const status = src?.state?.TrackStatus?.Status ?? null;
  // (the gear and data loss at once, the rest ≤ 8 a second; the gear from src.carAt as the shift lights have it)
  wheelScreens.update((num) => screenModel({ car: src?.carAt?.(num, t) || null, line: lines[num] || null, laps, season, status }), performance.now(), (num) => screenUrgent(src?.carAt?.(num, t) || null));
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
// (v0.45: a seek sets the push at once, as a seek sets traffic()'s offsets – it was eased from before the seek over
// ~1 s, the frame time being capped at 0.1 s so `dt > 0.5` never caught a seek: a pit-lane car drawn up to 2 m off
// where playing up to the same moment draws it, sliding back – Map3D.seekCheck, Monaco 2025)
let sepT = null;
const sepSkip = (a, b) => a.track && b.track;
function separate(dt, seen, snap = false) {
  const list = [];
  for (const num of seen) {
    const c = cars.get(num);
    list.push({ id: num, x: c.pos.x, z: c.pos.z, hx: Math.sin(c.yaw), hz: Math.cos(c.yaw), track: c.onTrack && !c.est && !c.pit && !(c.grid && c.grid.state !== "free") });   // c.pos is this frame's raw position
  }
  // (v0.44: two cars on the track are traffic.js's – traffic() above, along and across the track, checked as boxes; this
  // pass is for the rest – the pit lane, a car off the steadied tracks, grid slots, placements without data – so no pair
  // gets two corrections on top of each other)
  const off = window.ReplayKit.separateCars(list, sepMemory, 16, 5, sepSkip);
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
    if (dt > 0.5 || snap) { c.sepX = tx; c.sepZ = tz; c.sepVX = c.sepVZ = 0; } else { spring(c, "sepX", "sepVX", tx, 6, dt); spring(c, "sepZ", "sepVZ", tz, 6, dt); }
    c.pos.set(o.x + c.sepX, c.pos.y, o.z + c.sepZ);
    // (on the track the height is right already; in the pit lane pitDraw put it on the lane's / the garage's floor – v0.49:
    // this set every pit-lane car off the steadied tracks to the NEAREST LAP-LINE point's height, the start straight beside
    // the lane: Monaco 2025's cars in their boxes 0.93 m under the lane's floor, Gasly's retired car 1.19 m over it)
    if (!c.onTrack && !(c.pit?.at && c.pit.inRun > 0)) c.pos.y = groundFor(c, c.pos.x, c.pos.z, c.pos.y);
    c.obj.position.copy(c.pos);
    // (v0.53: the car the cockpit cameras ride keeps its steadied height – updateCars' c.stab; v0.52 set it back to the
    // unsteadied one here, every frame, so the steadying of the height never reached the picture)
    if (c.stab) { if (!c.onTrack && !(c.pit?.at && c.pit.inRun > 0)) { c.stab.y = c.pos.y; } c.obj.position.y = c.stab.y; }
  }
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function leader() {
  if (game) return game.leader();
  const lines = app().src?.state.TimingData?.Lines || {};
  return Object.keys(lines).find((n) => lines[n].Position === "1") || null;
}
// v0.50 §8-3: the car the camera films, the driver selected for information (app().focus) and the comparison driver
// (app().compare) are three things. 따라가기 (camFollow, the HUD's switch – a UI preference) on: the camera films the
// selected driver, as before; off: the camera keeps its own pick (camPick: ◀ ▶, "이 차 보기") while the selection
// changes freely. The game's mode keeps its own rule (the camera on the selected car – game/racehud.js).
let camPick = null, camFollow = true, camPickFor = null;
function camNum() {
  if (game) return app().focus || leader();
  return cameraCar({ follow: camFollow, camPick, focus: app()?.focus, leader: leader(), exists: (n) => cars.has(n) });
}
function setFollow(on) {
  on = !!on;
  if (on === camFollow) return;
  if (!on) camPick = camNum(); else camPick = null;
  camFollow = on;
}

// Name tags readable at any distance; cars at their real size (or larger from high up, by choice).
// Cars are drawn at their real size; from the helicopter they can be drawn larger to be told apart (the map
// settings' "차량 크게" – a readability option, off by default: the names over them say who is where).
// Level of detail by the car's size on screen (pixels along its length), with a margin each way so it doesn't flick:
// close up (over ~260 px, or the car the cockpit cameras are in) the cockpit interior, hands and steering wheel;
// under ~26 px no wheel covers or lights either (the corners' drums and the 2022–25 front fences stay – v0.43).
function scaleForView() {
  const H = hostH || 1, f = 2 * Math.tan((camera.fov * Math.PI) / 360) / H, big = geoSettings().bigCars === true, focusNum = camNum();
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
// v0.50 §8-6 (live / replay): tags limited by distance, importance and occlusion – spectator/layout.js pickTags: the
// selected, compared and filmed cars always (on screen, not behind a building), then by race position, a few per camera.
// Occlusion: a ray from the camera to the tag against the world's occluders (los.js firstHit), a few cars a frame, each
// car's answer kept ~0.3 s. The game's mode keeps its own rule (gameDeclutter).
const TAG_RECHECK = 300;
function declutterLabels() {
  if (game) return gameDeclutter();
  const A = app(), lines = A.src?.state.TimingData?.Lines || {}, W = hostW, H = hostH, sel = A.focus, cmp = A.compare || null, cam = camNum();
  const now = performance.now(), occ = world?.occluders || [], cands = [];
  let rays = 0;
  for (const c of cars.values()) {
    if (!c.label.sp.visible) continue;
    tmp2.copy(c.obj.position); tmp2.y += 1.6; tmp2.project(camera);
    const dist = camera.position.distanceTo(c.obj.position);
    // (occlusion: only what can matter – near enough to be tagged, in front of the camera; the oldest answers first)
    if (occ.length && tmp2.z < 1 && dist > 12 && (c.tagAt == null || now - c.tagAt > TAG_RECHECK) && rays < 6) {
      rays++; c.tagAt = now;
      tmp.copy(c.obj.position); tmp.y += 1.4; tmp.sub(camera.position); const far = tmp.length() - 2; tmp.normalize();
      c.tagHidden = far > 0 && firstHit(occ, camera.position, tmp, far) != null;
    }
    cands.push({ num: c.num, x: (tmp2.x * 0.5 + 0.5) * W, y: (-tmp2.y * 0.5 + 0.5) * H, behind: tmp2.z > 1, dist, rank: +lines[c.num]?.Position || 99,
      sel: c.num === sel, cmp: c.num === cmp, cam: c.num === cam && camMode !== "heli", hidden: !!c.tagHidden && !(c.num === sel && dist < 12) });
  }
  const keep = pickTags(cands, { mode: camMode, w: W, h: H, tagW: 64, tagH: 24 });
  for (const c of cars.values()) if (c.label.sp.visible && !keep.has(c.num)) c.label.sp.visible = false;
}
function gameDeclutter() {
  const lines = app().src?.state.TimingData?.Lines || {}, W = hostW, H = hostH, taken = [], go = game ? game.order() : null;
  const posOf = (n) => (go ? go.indexOf(n) + 1 || 99 : +lines[n]?.Position || 99);
  const list = [...cars.values()].filter((c) => c.label.sp.visible)
    .sort((a, b) => (a.num === app().focus ? -1 : b.num === app().focus ? 1 : posOf(a.num) - posOf(b.num)));
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
  if (!el && text) { el = noteLine("camNote3d"); }
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
  // the game's pit view: posed by game/pitcam.js (its shots, occlusion checks and director); the live view never has it
  if (camMode === "pit") { if (game) { gamePitView(dt); return; } setCam("chase"); }
  const num = camNum(), c = cars.get(num), shown = !!c?.obj.visible;
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
    // (a game's car: from the engine's front-wheel angle – no path ahead here; game/cars3d.js sets c.steer)
    const hy = !eye || !headTurn ? 0 : game ? headYawFor([Math.tan(c.steer || 0) / 3.4], c.speed || 0) : c.headYaw || 0;
    if (hy) { eyeTurned([u.mounts.eye.x, u.mounts.eye.y, u.mounts.eye.z], hy, EYE_AT); camera.position.set(EYE_AT[0], EYE_AT[1], EYE_AT[2]).applyMatrix4(c.model.matrixWorld); }
    else camera.position.copy(eye ? u.mounts.eye : u.mounts.tcam).applyMatrix4(c.model.matrixWorld);
    c.model.getWorldQuaternion(qTmp);
    // (the T-cam as the car's profile has it – fitted to the team's onboard footage where there is one; the eyes ahead,
    // a touch down)
    // (v0.52: the eyes turn with the driver's head into the bend – eyecam.js; the T-cam is bolted to the car)
    shakeE.set(eye ? EYE_PITCH : -((u.profile.tcamPitch ?? 15.5) * Math.PI) / 180, Math.PI + (eye ? hy : ((u.profile.tcamYaw || 0) * Math.PI) / 180), 0, "YXZ");
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
// EYE_HFOV, as tall
// as the window's shape makes it; zooming sets a vertical angle of its own)
const look = { yaw: 0, pitch: 0, dist: 10.5, fov: 0, dragged: false, down: null };
// (v0.52: the eye camera turns with the driver's head into bends – on unless turned off: Map3D.headTurn(false), kept)
const EYE_AT = [0, 0, 0];
let headTurn = (() => { try { return localStorage.getItem("f1kr:eyeHead") !== "off"; } catch { return true; } })();
function resetLook() { look.yaw = 0; look.pitch = 0; look.dist = 10.5; look.fov = 0; }
// v0.42: the eyes' lens 80° wide (it was 95°: the steering wheel ~30 % of the picture's width against ~45 % in the
// helmet camera's frames – research/cockpit.md: that camera ~75–85° wide, L) and looking down 8° (it was 3.4°) – the
// horizon a third of the way down, the wheel's top a little under it, as in those frames (the eyes 2 cm lower too, the
// profiles' eye: ~3.5 cm over the wheel's top, Z 0.70–0.76 m in the research – L)
// (v0.52: the lens and the aim in eyecam.js – the measuring tools use the same numbers)
const cockpitFov = (eye, tcamHfov = 72) => look.fov || lensFov(eye, camera.aspect, tcamHfov);
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
  if (mode === "pit" && !game) return;
  // (the viewer's own choice in game mode – not the pit director's – wins over the director: game/pitcam.js)
  if (game && !pitCamDirecting) gamePitCam.userCam(mode);
  if (mode === camMode) return;
  resetLook();
  camera.up.copy(UP); chase.init = false;
  if (mode === "heli") {
    // take over from wherever the chase camera was, orbiting – and following – the selected car (when it is drawn;
    // else the view stays where it is, free)
    const c = cars.get(camNum()), shown = !!c?.obj.visible;
    camera.fov = 50; camera.updateProjectionMatrix();
    if (shown) {
      controls.target.copy(c.pos); heli.follow = true;
      if (camMode !== "chase") camera.position.copy(c.pos).add(new THREE.Vector3(0, 120, 160));
    } else heli.follow = false;
  }
  camMode = mode; camInit = false; resetPace();
  if (mode !== "pit") try { localStorage.setItem("f1kr:cam3d", JSON.stringify(mode)); } catch {}
  paintCamButtons();
}
function paintCamButtons() {
  document.querySelectorAll("[data-cam]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cam === camMode)));
  document.getElementById("map3d").dataset.cam = camMode;
}
function cycleCar(dir) {
  const lines = app().src?.state.TimingData?.Lines || {};
  const order = game ? game.order().filter((n) => cars.get(n)?.obj.visible) : Object.keys(lines).filter((n) => cars.get(n)?.obj.visible).sort((a, b) => (+lines[a].Position || 99) - (+lines[b].Position || 99));
  if (!order.length) return;
  const cur = order.indexOf(camNum());
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
  if (game) return gameHud(hud);
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
  const tel = c ? `<span class="tel"><b>${Math.round(c.speed)}</b><small>km/h</small><b class="gear">${e(c.gear == null ? "–" : c.gear || "N")}</b><i class="thr" style="--v:${Math.max(0, Math.min(100, +c.thr || 0))}%"></i><i class="brk" style="--v:${c.brk ? 100 : 0}%"></i></span>` : "";
  const full = html + tel;
  if (hud.dataset.html !== full) { hud.innerHTML = full; hud.dataset.html = full; }
}

// ---------- the spectator HUD's view of this module (spectator/hud.js) ----------
// The keep-clear zones of the cockpit cameras (§8-1): where the ridden car's steering wheel (with the hands round its
// rim), its two mirrors and the view's centre are on screen now (host px) – measured from the model, so another car,
// lens or window shape gives its own. [] outside the cockpit cameras or with no car drawn.
const kcV = new THREE.Vector3();
function mirrorBoxes(model) {
  let mesh = null; model.traverse((o) => { if (!mesh && o.isMesh && o.name === "mirrors") mesh = o; });
  const pos = mesh?.geometry?.attributes?.position; if (!pos) return [];
  const side = [null, null];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), k = x >= 0 ? 0 : 1, b = side[k] || (side[k] = new THREE.Box3());
    b.expandByPoint(kcV.set(x, pos.getY(i), pos.getZ(i)));
  }
  return side.filter(Boolean).map((b) => ({ mesh, pts: [0, 1, 2, 3, 4, 5, 6, 7].map((j) => new THREE.Vector3(j & 1 ? b.max.x : b.min.x, j & 2 ? b.max.y : b.min.y, j & 4 ? b.max.z : b.min.z)) }));
}
function wheelBox(wheel) {
  wheel.updateWorldMatrix(true, true);
  const box = new THREE.Box3(), inv = new THREE.Matrix4().copy(wheel.matrixWorld).invert(), m = new THREE.Matrix4(), p = new THREE.Vector3();
  const walk = (o) => {
    if (o !== wheel && /^hand[LR]$/.test(o.name)) { p.setFromMatrixPosition(m.multiplyMatrices(inv, o.matrixWorld)); box.expandByPoint(p.clone().addScalar(0.07)); box.expandByPoint(p.clone().addScalar(-0.07)); return; }
    if (o.isMesh && o.geometry?.attributes?.position) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld))); }
    for (const c of o.children) walk(c);
  };
  walk(wheel);
  // (the wheel's face only: the column behind it runs 0.24 m and the gloves stand out towards the driver – corners a hand's
  // breadth from the eye project over the whole screen)
  box.min.z = box.max.z = 0;
  return box;
}
function screenRect(pts, pad = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { kcV.copy(p).project(camera); if (kcV.z > 1) return null; const x = (kcV.x * 0.5 + 0.5) * hostW, y = (-kcV.y * 0.5 + 0.5) * hostH; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const w = x1 - x0, h = y1 - y0, px = w * pad, py = h * pad;
  x0 = Math.max(0, x0 - px); y0 = Math.max(0, y0 - py); x1 = Math.min(hostW, x1 + px); y1 = Math.min(hostH, y1 + py);
  return x1 > x0 && y1 > y0 ? { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) } : null;
}
function keepClearZones() {
  if (!(camMode === "onboard" || camMode === "eye") || !world) return [];
  const c = cars.get(camNum()); if (!c?.obj.visible) return [];
  const u = c.model.userData, out = [];
  c.model.updateWorldMatrix(true, true); camera.updateMatrixWorld();
  if (u.wheel) {
    // (the wheel's own parts and the gloves on its rim, in the wheel's frame – it turns with the steering; the arms run
    // back past the camera and are left out: their box would cover the whole screen)
    if (!u.specWheel) u.specWheel = wheelBox(u.wheel);
    const b = u.specWheel, M = u.wheel.matrixWorld;
    const r = screenRect([0, 1, 2, 3, 4, 5, 6, 7].map((j) => new THREE.Vector3(j & 1 ? b.max.x : b.min.x, j & 2 ? b.max.y : b.min.y, j & 4 ? b.max.z : b.min.z).applyMatrix4(M)), 0.12);
    if (r) out.push({ ...r, what: "wheel" });
  }
  // (onboard – the T-cam above the airbox looks down on the helmet: its box too, so the driver card doesn't sit on it; v0.51)
  if (camMode === "onboard" && u.helmet?.visible) {
    const hb = new THREE.Box3().setFromObject(u.helmet);
    if (!hb.isEmpty()) { const r = screenRect([0, 1, 2, 3, 4, 5, 6, 7].map((j) => new THREE.Vector3(j & 1 ? hb.max.x : hb.min.x, j & 2 ? hb.max.y : hb.min.y, j & 4 ? hb.max.z : hb.min.z)), 0.1); if (r) { const cx = r.x + r.w / 2, hw = Math.min(r.w / 2, hostW * 0.2); out.push({ x: Math.round(cx - hw), y: Math.max(r.y, Math.round(hostH * 0.55)), w: Math.round(2 * hw), h: hostH - Math.max(r.y, Math.round(hostH * 0.55)), what: "helmet" }); } }   // (the group's box is wider than the shell seen: its centre ± 20 % of the view, from 55 % down)
  }
  if (u.specMirrors === undefined) u.specMirrors = mirrorBoxes(c.model);
  for (const m of u.specMirrors) { const r = screenRect(m.pts.map((p) => p.clone().applyMatrix4(m.mesh.matrixWorld)), 0.25); if (r) out.push({ ...r, what: "mirror" }); }
  // (the view's centre: the road ahead and, onboard, the halo's opening – 30–70 % across, 12–58 % down)
  out.push({ x: Math.round(hostW * 0.3), y: Math.round(hostH * 0.12), w: Math.round(hostW * 0.4), h: Math.round(hostH * 0.46), what: "centre" });
  return out;
}
// What the pit panel may say about car num (pitstate.js inference up to the moment shown; the crew's shown stage)
const pitWork = new Map();
function pitInfoFor(num) {
  const r = cars.get(num)?.pit; if (!r?.state) return null;
  const i = r.input || {};
  return { state: r.state.state, stillFor: i.stillFor || 0, penalty: i.penalty || null, timePen: i.timePen || 0, lastBox: i.lastBox || null, work: pitWork.get(num) || null };
}
// The ready / loading state: the circuit being built, or the filmed car not placed yet just after a session (re)opened
// (a session loading – the timing screen's own progress events, f1kr-load: the circuit on screen is still the last one)
let specLoad = null;
addEventListener("f1kr-load", (e) => { specLoad = e.detail?.pct >= 100 ? null : { pct: e.detail?.pct ?? 0, text: String(e.detail?.text || "").replace(/\s*·\s*$/, ""), at: performance.now() }; });
addEventListener("f1kr-loaded", () => { specLoad = null; });
function specReady() {
  const A = app(), note = document.getElementById("note3d");
  if (specLoad && !game) {
    if (document.getElementById("load")?.disabled === false || performance.now() - specLoad.at > 30000) specLoad = null;   // (failed or gone quiet)
    else return { busy: true, text: "세션을 불러오는 중…", sub: `${specLoad.text} ${specLoad.pct}%` };
  }
  if (!A?.src || !note.hidden) return { busy: false };
  const geo = document.getElementById("geo3dStatus"), sub = geo && !geo.hidden ? geo.textContent : "";
  if (!world) return { busy: true, text: "3D 서킷을 만드는 중…", sub };
  if (camMode === "heli" || camMode === "inspect") return { busy: false };
  const c = cars.get(camNum());
  if ((!c || !c.obj.visible) && performance.now() - (world.builtAt || 0) < 8000) return { busy: true, text: "차량 위치를 준비하는 중…", sub: sub || "차를 찾으면 바로 비춰요" };
  return { busy: false };
}
function cycleCam(dir) {
  if (game || camFollow) { cycleCar(dir); return; }
  const lines = app().src?.state.TimingData?.Lines || {};
  const order = Object.keys(lines).filter((n) => cars.get(n)?.obj.visible).sort((a, b) => (+lines[a].Position || 99) - (+lines[b].Position || 99));
  if (!order.length) return;
  const cur = order.indexOf(camNum());
  camPick = order[(cur + dir + order.length) % order.length];
}
const specApi = {
  app: () => app(), leader: () => leader(), camNum: () => camNum(), camMode: () => camMode,
  follow: () => camFollow, setFollow, cycleCam, filmSelected: () => { camPick = app()?.focus || camPick; },
  pitInfo: pitInfoFor, ready: specReady, keepClear: keepClearZones,
};

// ---------- real surroundings ----------
// Settings: imagery "eox" (free Sentinel-2) | "google" (needs the user's key) | "off" (generic look), and layers.
const GEO_DEFAULT = { provider: "eox", buildings: true, trees: true, night: "auto", shadows: true, facilities: true, bigCars: false, quality: "balanced", pitWork: "record", corners: "near", shiftLights: "team", mirrors: "auto", gloves: "readable" };
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
    const built = await buildScenery(window.api, data, w, { provider, buildings: opts.buildings, trees: opts.trees, night: evening, street: w.street, trackW: w.width, corners, groundOld: devGroundOld, roadJoin: devRoadJoin,
      facilities: opts.facilities, year: A.sessionYear?.() || null, venue: venueOf({ circuitKey: A.circuitKey?.(), location: A.location?.() }), isCurrent: () => job === geoJob && world === w }, (step) => job === geoJob && geoStatus(`실제 지도 · ${step}…`));
    if (job !== geoJob || world !== w) { disposeReal(built); return; }
    // swap the generic surroundings for the real ones
    w.group.remove(w.syn.terrain, w.syn.trees);
    // the generated walls, opened where an escape road or rejoin route meets the track: the map's (auxroads.js) and the
    // FIA's run-offs on street-style circuits the map has no line for (venues.js WALL_OPENINGS – they were walled off)
    const openings = wallOpeningsFor(venueOf({ circuitKey: app().circuitKey?.(), location: app().location?.() })?.key);
    const openAt = openings.length ? wallOpenings(w, built.geo, openings) : null;
    // (a street circuit: only the FIA's named run-offs – a road joining the track there is a public road closed behind
    // the barrier; the map's pieces opened the walls at Monaco, Singapore, Las Vegas with no FIA basis (v0.36 audit) – and
    // the map's roads right by the pit lane, its entry and exit)
    const nearLane = (x, z) => !!w.laneZone && [[0, 0], [25, 0], [-25, 0], [0, 25], [0, -25]].some(([dx, dz]) => w.laneZone(x + dx, z + dz));
    const aux = built.auxGap && w.street ? (x, z) => nearLane(x, z) && built.auxGap(x, z) : built.auxGap;
    const gap0 = aux && openAt ? (x, z) => aux(x, z) || openAt(x, z) : aux || openAt;
    // (none of the generated barriers or fences in a tunnel: its own walls and armco are there – tunnel.js; the fence stood
    // through the ceiling)
    // (v0.46: none between the pit building's garages and its pit wall – one 12 m out from a stretch of tarmac stood in
    // the pit wall's walkway, through the teams' stands: Jeddah 2025, run/pitwall)
    let PG = null; built.group.getObjectByName("facilities")?.traverse((o) => { if (!PG && o.userData?.garages?.wallOut) PG = o.userData.garages; });
    const inPits = PG ? pitsUpToWall(PG) : null;
    const gap1 = inPits ? (gap0 ? (x, z) => gap0(x, z) || inPits(x, z) : inPits) : gap0;
    const inTun = built.tunnel?.inside, gap = inTun ? (gap1 ? (x, z) => gap1(x, z) || inTun(x, z, 2) : (x, z) => inTun(x, z, 2)) : gap1;
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
    if (built.tunnel?.inside) { const k = kerbs(w.samples, built.tunnel.inside); w.group.remove(w.kerb); disposeGroup(w.kerb); w.kerb = k; w.group.add(k); w.kerbMark = w.samples.kerbMark; }
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
  tunnelLight(world?.real?.tunnel, night);
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
  if (night) { lit = floodlights(world.samples, world.real?.tunnel?.inside); world.group.add(lit); }
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
function floodlights(samples, covered = null) {
  const g = new THREE.Group(), n = samples.length, every = 18;
  const count = Math.floor(n / every);
  let used = 0;
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
    // (none over a tunnel: a 14 m pole stood through its slab – the tunnel has lamps of its own)
    if (covered && (covered(s.p.x, s.p.z, 8) || covered(p.x, p.z, 4))) continue;
    const kk = used++;
    // facing the track (local +z towards it), tipped down a little
    q.setFromAxisAngle(UP, Math.atan2(-s.nor.x * side, -s.nor.z * side));
    m.compose(p, q, one); poles.setMatrixAt(kk, m);
    tilt.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.35); const qh = q.clone().multiply(tilt);
    m.compose(tmp.copy(p).setY(p.y + 14.2), qh, one); heads.setMatrixAt(kk, m); faces.setMatrixAt(kk, m);
    for (const u of [-0.75, 0, 0.75]) {
      const ax = s.tan.x * u, az = s.tan.z * u, toward = 0.6;
      glow.push({ x: p.x + ax - s.nor.x * side * toward, y: p.y + 14.1, z: p.z + az - s.nor.z * side * toward, c: [240, 244, 255], i: 4, s: 2.6 });
    }
  }
  poles.count = heads.count = faces.count = used;
  g.add(poles, heads, faces, glowPoints(glow, "floodGlow"));
  return g;
}

// The shaders of everything in the world compiled now, while the map is being shown – not the first time a part comes
// into view (the garages' insides, the teams' layer: hidden by distance until the camera is near), which stalled that
// frame. (three.js compiles what's visible: the hidden parts are shown for the call, then hidden again.)
function warmShaders() {
  if (!renderer?.compileAsync) return;
  const hidden = [];
  world?.group.traverse((o) => { if (!o.visible && (o.name === "garageInteriors" || o.name === "pitTeams" || o.name === "pitTeamsNear")) { hidden.push(o); o.visible = true; } });
  try { renderer.compileAsync(scene, camera).catch(() => {}); } finally { for (const o of hidden) o.visible = false; }
}

// ---------- loop ----------
function trackPoints() { try { return app().trackPoints(); } catch { return []; } }
// (Re)build the circuit when the session changes; checked once a second.
function ensureWorld(now) {
  if (game) return gameEnsureWorld(now);
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
  if (camPickFor !== sessionOf(key)) { camPick = null; camPickFor = sessionOf(key); }   // (the camera's own pick is per session)
  world = buildWorld(pts);
  if (world) { world.builtAt = performance.now(); world.sourceKey = key; world.pts = pts.length; cornerMarks(); addGrid(); addPitLane(); frameCircuit(); applyLighting(); loadGeo(world); refreshShadows(); }
  note.hidden = !!world;
}
// game mode: the circuit from the scenario's own lap (the same buildWorld, the same real surroundings), built once per
// game; the adapter is then bound to it (engine s → world s, game/adapter3d.js buildMapping)
function gameEnsureWorld(now) {
  const key = app().sourceKey();
  if (world && world.sourceKey === key) return;
  if (now - lastBuildCheck < 300) return;
  lastBuildCheck = now;
  disposeWorld(); geoJob++;
  sepMemory = {};
  world = buildWorld(app().trackPoints());
  if (!world) { showNote("게임 시나리오의 랩 형상으로 3D 서킷을 만들 수 없어요."); return; }
  world.sourceKey = key; world.game = true; world.pts = app().trackPoints().length;
  cornerMarks(); addGrid(); addPitLane(); frameCircuit(); applyLighting(); loadGeo(world); refreshShadows();
  game.bind(world, world.frame);
  document.getElementById("note3d").hidden = true;
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
  mirrorPass?.dispose();   // (the rear view's picture with the world: made again on first use)
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
// The corners' numbers (corners.js decides which and how strongly): one sprite each, in their own group; their place on
// the lap matched in lap order. Drawn with the depth test – a building, a tunnel's roof or a hill in front hides them –
// except when the viewer asks for all of them (the old map-like view, over everything).
function addCorners() {
  const circ = app().circuit;
  if (!circ?.corners?.length) return;
  const S = world.samples, pts = S.map((q) => q.p), cum = new Float64Array(S.length);
  for (let i = 1; i < S.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  const L = cum[S.length - 1] + Math.hypot(pts[0].x - pts[S.length - 1].x, pts[0].z - pts[S.length - 1].z);
  const ks = circ.corners.map((k) => { const v = toWorld([k.x, k.y, 0], world.center); return { n: k.n, x: v.x, z: v.z, angle: k.angle }; });
  const st = cornerStations(ks, pts, cum, L);
  const group = new THREE.Group(); group.name = "cornerNumbers";
  const list = [];
  for (const k of ks) {
    const at = st.find((q) => q.n === k.n), smp = S[at.i];
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d");
    x.fillStyle = "rgba(14,16,19,0.75)"; x.beginPath(); x.arc(32, 32, 26, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#e8ecf0"; x.font = "700 28px -apple-system, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(k.n), 32, 34);
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: true, depthWrite: false, transparent: true, opacity: 0 }));
    sp.material.userData.ownedTextures = [tex];
    // (beside the corner where F1's map puts its number, but no further out than the tarmac's edge + 6 m – 22 m out it
    // stood inside the buildings of a street circuit)
    const a = (k.angle * Math.PI) / 180, dx = Math.cos(a), dz = -Math.sin(a);
    const half = Math.max(smp.L ?? 7, -(smp.R ?? -7)), off = Math.min(22, half + 6);
    sp.position.set(smp.p.x + dx * off, smp.p.y + 3.2, smp.p.z + dz * off);
    sp.scale.set(0.03, 0.03, 1); sp.renderOrder = 5; sp.visible = false;
    group.add(sp);
    list.push({ n: k.n, s: at.s, i: at.i, x: sp.position.x, z: sp.position.z, sp, alpha: 0 });
  }
  world.group.add(group);
  world.corners = { group, list, L, cum, prev: new Map() };
}
// each frame: the numbers' targets for the camera now (corners.js), eased; sized by distance
function updateCorners(dt) {
  const C = world?.corners; if (!C) return;
  const mode = ["near", "all", "off"].includes(geoSettings().corners) ? geoSettings().corners : "near";
  const A = app(), focus = camNum(), c = cars.get(focus);
  const riding = camMode === "chase" || camMode === "onboard" || camMode === "eye";
  let carS = null;
  if (riding && c?.has) { carS = c.onTrack && c.st?.s != null ? c.st.s : c.sample ? cornerS(c.sample.i) : null; }
  const look = camMode === "heli" ? controls.target : camLook;
  const T = cornerTargets(C.list, { mode, cam: riding ? camMode : "heli", carS, L: C.L, look, height: Math.max(0, camera.position.y - look.y), prev: C.prev });
  const all = mode === "all";
  for (const k of C.list) {
    k.alpha = easeAlpha(k.alpha, T.get(k.n) || 0, dt);
    if (k.alpha < 0.01) { k.alpha = T.get(k.n) ? k.alpha : 0; k.sp.visible = false; C.prev.set(k.n, 0); continue; }
    C.prev.set(k.n, k.alpha);
    const m = k.sp.material; k.sp.visible = true;
    if (m.depthTest !== !all) { m.depthTest = !all; m.needsUpdate = true; }
    m.opacity = 0.88 * k.alpha;
    const sc = all ? 0.032 : cornerScale(camera.position.distanceTo(k.sp.position), camera.fov);
    k.sp.scale.set(sc, sc, 1);
  }
}
// a lap-line point's distance along the lap (the corners' own measure)
function cornerS(i) { return world.corners.cum[i] ?? null; }

// (one frame loop at a time: hide() then show() before the hidden loop's last frame ran would otherwise start a second
// loop – the home screen hides and shows the view on every switch; rafId is the loop's pending frame)
let rafId = 0;
function frame(now) {
  if (!visible) return;
  // (held to 60 a second: every other refresh of a 120 Hz screen is left out, evenly)
  if (perf.cap && now - lastT < 1000 / 60 - 4) { rafId = requestAnimationFrame(frame); return; }
  const dt = Math.min(0.1, (now - lastT) / 1000 || 0.016); lastT = now;
  ensureWorld(now);
  cornerMarks();
  const A = app();
  if (world && game) gameCars(dt);
  else if (world && A?.src) updateCars(dt);
  if (world) updateCamera(dt);
  if (world) updateCorners(dt);
  if (devRec) devRec(now, dt);
  // (the pit wall people's small parts near or not – decided before drawing, so the shadow pass sees the same; a change
  // redraws the static shadow map)
  if (peopleLod(camera.position)) refreshShadows();
  updateSun(now);
  wx?.update({ A, world, camera, dt, night: !!nightNow, hemi, sun, fog: scene.fog, pitFac: pitTeams.facility, teams: pitTeams.group, cars, viewH: renderer.getDrawingBufferSize(tmpV2).y, gameEnv: game ? game.weather() || { rain: 0, rainShare: 0, wet: 0, cloud: null } : undefined });
  thinFarTrees();
  world?.real?.stands?.update(camera.position, camMode === "heli" || camMode === "inspect" ? 520 : 300);
  realPart("buildings")?.userData.update?.(camera.position);
  realPart("facilities")?.userData.update?.(camera.position);
  updatePitTeams();
  // (the kit's near teams and its one light – cheap unless the focused / pit-camera team changed)
  if (pitKit && pitTeams.group?.visible !== false) pitKit.update({ near: kitNear(), cam: camera.position, focus: camNum() });
  if (!devNoHud) { if (game) paintHud(); else specHud?.frame(now); }
  // glare points: pixels per metre at 1 m away, fading into the haze as the fog does; time for blinking lights
  NL.time.value = now / 1000;
  GLOW.scale.value = renderer.getDrawingBufferSize(tmpV2).y / (2 * Math.tan((camera.fov * Math.PI) / 360));
  GLOW.fade.value.set(scene.fog.near, scene.fog.far);
  if (devGpu) devGpu.begin();
  if (world) updateMirrors();
  devShadowDrawn = renderer.shadowMap.needsUpdate;
  renderer.render(scene, camera);
  if (mirrorProbePost) { const f = mirrorProbePost; mirrorProbePost = null; f(); }   // (development: Map3D.mirrorProbe)
  if (devGpu) devGpu.end();
  adaptResolution(now, dt);
  rafId = requestAnimationFrame(frame);
}

// The side mirrors' rear view (mirrors.js, v0.44): the car a cockpit camera rides in only – its picture drawn just before
// the view (after the cars, the camera and the shadows' decision for this frame). The mode is the 🛰 settings' 사이드미러
// (auto: by the quality setting), read when the settings change (mirrorSetting null: read again).
let mirrorPass = null, mirrorSetting = null, mirrorStrained = false;
const mirrorAux = (hide) => {
  // (the labels face the screen and are drawn over everything: not in a mirror)
  for (const c of cars.values()) { const sp = c.label.sp; if (hide) { sp.userData.mv = sp.visible; sp.visible = false; } else if (sp.userData.mv !== undefined) sp.visible = sp.userData.mv; }
  const cn = world?.corners?.group; if (cn) { if (hide) { cn.userData.mv = cn.visible; cn.visible = false; } else if (cn.userData.mv !== undefined) cn.visible = cn.userData.mv; }
};
function updateMirrors() {
  if (!mirrorPass) mirrorPass = createMirrorPass();
  if (mirrorSetting === null) { const o = geoSettings(); mirrorSetting = { set: o.mirrors, q: QUALITY[o.quality] ? o.quality : "balanced" }; }
  mirrorStrained = mirrorStrain(mirrorStrained, perf.late, perf.calm);
  const ride = camMode === "onboard" || camMode === "eye", num = ride ? camNum() : null, c = num ? cars.get(num) : null;
  const view = ride ? camMode + ":" + num : "";
  const run = () => mirrorPass.update(renderer, scene, camera, c?.obj.visible ? c.model : null, mirrorMode(mirrorSetting.set, mirrorSetting.q, mirrorStrained), view, mirrorAux);
  if (!mirrorProbeReq) return run();
  // (development: Map3D.mirrorProbe – this frame's pass watched; an error the pass lets out goes on as it would)
  const q = mirrorProbeReq; mirrorProbeReq = null;
  const out = probeMirrorPass({ renderer, scene, pass: mirrorPass, fault: q.fault }, run);
  if (q.needPass && !out.error && !out.calls.some((k) => k.inPass) && (q.tries = (q.tries || 0) + 1) < 12) { mirrorProbeReq = q; return out.result; }   // (low: a frame with a pass)
  out.tries = q.tries || 0;
  if (q.colour) out.pipeline = [0, 1].map((i) => samePipeline(renderer, scene, mirrorPass, i, (h) => { const m = mirrorPass.state.car?.userData.mirrors; if (m) m.visible = !h; mirrorAux(h); }));
  if (q.flat != null) out.flat = flatFill(renderer, mirrorPass, q.flat);
  mirrorProbePost = () => { out.afterMain = rendererState(renderer, mirrorPass); out.screen = glassOnScreen(renderer, camera, mirrorPass); if (q.colour) out.glass = glassVsPicture(renderer, camera, mirrorPass); if (out.flat) out.flatGlass = glassPixels(renderer, camera, mirrorPass); };
  const t0 = lastT; setTimeout(() => { out.loopAlive = lastT !== t0; out.later = rendererState(renderer, mirrorPass); q.done(JSON.stringify(out)); }, 700);
  if (out.error) throw new Error(out.error);
  return out.result;
}
let mirrorProbeReq = null, mirrorProbePost = null;

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

// ---------- the strategy game's mode (Map3D.game; game/adapter3d.js, game/cars3d.js) ----------
// What cars3d.js may use of this view: its world, cars, camera and a few drawing helpers – nothing of the live paths.
const gameLifted = new Set();
let gamePitCam = null;
const gameKit = {
  setCamByDirector(m) { pitCamDirecting = true; try { setCam(m); } finally { pitCamDirecting = false; } },
  pitTeamsGroup: () => pitTeams.group || null, nightLit,
  THREE, get camera() { return camera; }, cars, lifted: gameLifted, ROAD_LIFT,
  world: () => world, camMode: () => camMode, focus: () => camNum(),
  carFor, paintLabel, scaleForView, applyLift, restoreCar, pitModelFor,
  pitG: () => pitTeams.G || null, pitTeams: () => pitTeams.teams || null, pitZones: () => pitTeams.zones || null,
  groundAt: (x, z) => { const R = world?.real; const g = R?.groundAt ? R.groundAt(x, z) : null; return Number.isFinite(g) ? g : groundY(x, z); },
  // a point on the pit lane moved across into the box (k 0 → 1: the lane's line → the box's offset from the garages), on
  // the lane's floor inside the garages' run – the pit building's own lane model (pitlane.js, as pitDraw does live)
  pitAcross(x, z, k) {
    const G = pitTeams.G; if (!G || !world) return null;
    const pr = G.project(x, z); if (!(pr.off > -3 && pr.off < 40) || pr.u < G.gStart - PIT.ends || pr.u > G.gEnd + PIT.ends) return null;
    const at = pitModelFor(G).at(pr.u), sl = at.slot, d = ((at.boxC ?? pr.off) - pr.off) * k;
    const inRun = Math.min(ss01((pr.u - (G.gStart - PIT.ends)) / PIT.ends), ss01(((G.gEnd + PIT.ends) - pr.u) / PIT.ends));
    return { x: x - sl.inward[0] * d, z: z - sl.inward[1] * d, y: at.floor + 0.004, inRun, turn: Math.atan2((at.boxC ?? pr.off) - pr.off, 12) };
  },
};
function gameCars(dt) {
  const fr = updateGameCars(gameKit, game, dt);
  if (fr) { const t0 = performance.now(); gamePitCam.direct(game, fr, t0); gamePitCost.direct += performance.now() - t0; gamePitCost.frames++; gamePitFr = fr; }
  // the safety car where the engine has it (snapshot.sc: on the engine's lap, mapped like the cars)
  const sc = fr?.snap?.sc, SP = supportCtx(game, 0);
  if (SP) {
    let where = null;
    if (sc && game.map) { const w = game.map.sd(sc.s, sc.d || 0), q = [0, 0, 0], q2 = [0, 0, 0]; world.frame.at(w.s, w.d, q); world.frame.at(w.s + 3, w.d, q2); where = { x: q[0], z: q[2], dx: q2[0] - q[0], dz: q2[2] - q[2] }; }
    const A = app(), models = supportModels(A.sessionYear?.() || 0, venueOf({ circuitKey: A.circuitKey?.(), location: A.location?.() })?.key ?? null, sessionDate());
    placeSupportCar(SP, "sc", models.sc || "neutralSc", where, !!where, (fr?.t || 0) / 1000);
  }
  gameNote(fr);
}
gamePitCam = createPitCam(gameKit);
// the pit view's camera (camMode "pit"): game/pitcam.js's pose for this frame, or the camera left where it is
let gamePitFr = null, pitCamDirecting = false;
const gamePitCost = { direct: 0, pose: 0, frames: 0 };
function gamePitView(dt) {
  controls.enabled = false; setNear(0.1);
  const t0 = performance.now(), p = gamePitFr && gamePitCam.pose(game, { ...gamePitFr, dtWall: dt }, t0, camera);
  gamePitCost.pose += performance.now() - t0;
  if (!p) { camNoteSet("피트 카메라: 이 팀의 박스를 아직 그릴 수 없어요"); return; }
  if (camera.fov !== p.fov) { camera.fov = p.fov; camera.updateProjectionMatrix(); }
  camera.position.copy(p.pos); camera.up.copy(UP); camera.lookAt(p.look); camLook.copy(p.look);
  camNoteSet(p.note);
}
function gameNote(fr) {
  const note = document.getElementById("note3d");
  const msg = !fr ? "게임 스냅샷을 기다리는 중…" : !game.map ? "게임 서킷 준비 중…" : fr.snap?.dev ? `${fr.snap.dev.label} · 3D 개발 확인용` : "";
  if (msg) { if (note.textContent !== msg) note.textContent = msg; note.hidden = false; }
  else if (note.dataset.game) note.hidden = true;
  note.dataset.game = msg ? "1" : "";
}
// the chase / onboard bar: the focused car's game state (game/cars3d.js paintGameHud – labelled game data, no telemetry)
function gameHud(hud) { paintGameHud(hud, game, camNum()); }
// The teams at their boxes in game mode: the boxes as allocated (pitorder.js – the previous season's constructors' order
// along the lane, the circuit's measured boxes), for the scenario's own entry list; no inference from positions. The pit
// wall's screens show the game's tower, marked as the game's.
function gamePitTeams(force) {
  const now = performance.now();
  if (!force && now - pitTeams.last < 1000) return;
  pitTeams.last = now;
  let fac = null;
  world?.real?.group.getObjectByName("facilities")?.traverse((o) => { if (!fac && o.userData?.garages) fac = o; });
  const A = app(), session = A.sourceKey();
  if (session !== pitTeams.session) { pitTeams.session = session; pitTeams.inf.reset(); clearPitTeams(); }
  if (!fac || !world?.pitLane) { if (pitTeams.group) clearPitTeams(); pitTeams.facility = fac; pitTeams.G = null; pitTeams.teams = null; pitTeamNote(null); return; }
  if (fac !== pitTeams.facility) { clearPitTeams(); pitTeams.facility = fac; pitTeams.teams = null; pitTeams.G = null; if (!fac.getObjectByName("pitLaneSurface")) fac.add(pitLaneMeshes(pitModelFor(fac.userData.garages))); }
  const G = fac.userData.garages, drivers = game.drivers();
  { const snap = game.snapshot(), rows = (snap?.cars || []).slice().sort((a, b) => a.pos - b.pos).slice(0, 10).map((c) => [String(c.pos), drivers[c.num]?.Tla || c.num, "", "#" + (drivers[c.num]?.TeamColour || "888888")]);
    paintPitScreens(rows, snap ? `GAME LAP ${snap.leaderLap}${snap.totalLaps ? "/" + snap.totalLaps : ""}` : null); }
  const pub = orderedBoxes(A.circuitKey?.(), A.sessionYear?.(), Object.values(drivers).map((d) => d?.TeamName).filter(Boolean)) || [];
  // each team's box where the ENGINE stops its cars (the scenario's pit path at its box u), not re-centred on the garages
  // (published: false) – so the painted box, the crew and the stopped car are one place; the published order only for a
  // team the scenario has no box for (v0.48 garage audit A2)
  const P = game.scenario?.track?.pit, ent = new Map((game.scenario?.entries || []).map((e) => [e.team, e.teamKey]));
  const o = {}, places = pub.map((b) => {
    const bu = P?.boxes?.[ent.get(b.team)];
    if (bu != null && world) { const pp = pitPoint(P, bu, world.center || { x: 0, z: 0 }), pr = G.project(pp.x, pp.z); if (pr && Number.isFinite(pr.u)) return { team: b.team, u: pr.u, off: LANES.box, from: "box", ok: true, own: {}, published: false, how: "engine box (scenario pit path)", season: b.season }; }
    pitLaneAt(b.u, o); const pr = G.project(o.x, o.z); return { team: b.team, u: pr.u, off: LANES.box, from: "box", ok: true, own: {}, published: true, how: b.how, season: b.season };
  });
  const plan = planOverrides(G, drivers);
  const teams = allocatePlaces(G.slots, G.pitch, drivers, places, plan.length ? plan : overridesFor(G.facility, A.sessionYear?.() || null, session));
  { const pm = pitModelFor(G); for (const t of teams) if (t.box != null) t.boxOff = pm.at(t.box).boxC; }
  pitTeams.teams = teams; pitTeams.G = G; pitTeams.zones = garageZones(G, teams); pitTeams.order = pub; pitTeams.info = { evidence: "game: published box order", live: false };
  pitTeamNote(teams.length ? "게임: 팀 박스는 전년도 컨스트럭터 순위 배정(실측 박스 위치) · 차고 칸 수는 추정" : null);
  const key = allocationKey(teams);
  if (key === pitTeams.key) return;
  clearPitTeams(); pitTeams.key = key;
  if (!teams.length) return;
  pitTeams.group = teamLayer(G, teams, drivers, A.sessionYear?.() || null, { kit: garageKitOn });
  attachPitKit(G, teams, A.sessionYear?.() || null);
  pitTeams.group.traverse((x) => { for (const m of [].concat(x.material || [])) nightLit(m); });
  fac.add(pitTeams.group);
  G.openRail?.(pitTeams.group.userData.standSpans || []);
  warmShaders();
}
// enter / leave the game's mode. attach: the live circuit and cars are let go and the game's circuit is built on the next
// frame; detach: the game's world is let go and the live / replay view is built again from window.F1KR as it is.
function gameAttach(adapter) {
  if (game === adapter) return "same";
  if (game) gameDetach();
  disposeWorld(); geoJob++; lastBuildCheck = 0; wx?.reset(); gameLifted.clear();
  livePitTeams = pitTeams; pitTeams = newPitTeams();
  // (the live view's notes about its own data – the start, the support cars, the crews' work, the teams' places – are put
  // away; each live update sets them again from its data after detach)
  for (const id of ["supportNote", "startLightNote", "pitWorkNote", "pitTeamNote", "camNote3d"]) { const el = document.getElementById(id); if (el) el.hidden = true; }
  camNote = "";
  game = adapter;
  specHud?.setGame(true); if (host) host.dataset.mode = "game";
  for (const x of cars.values()) x.stab = null;
  chase.init = false; camInit = false; camFor = { num: null, world: null };
  return "attached";
}
function gameDetach() {
  if (!game) return "not attached";
  if (camMode === "pit") { gameKit.setCamByDirector(gamePitCam.S.prev || "chase"); }
  gamePitCam.finish(game); gamePitCam.S.pinned = false; gamePitCam.S.manual = false; gameKit.crewMem = null;
  game.unbind?.();
  disposeWorld(); geoJob++; lastBuildCheck = 0; wx?.reset(); gameLifted.clear();
  game = null;
  specHud?.setGame(false); if (host) host.dataset.mode = "spec";
  if (livePitTeams) { pitTeams = livePitTeams; livePitTeams = null; forgetPitTeams(); }
  chase.init = false; camInit = false; camFor = { num: null, world: null };
  const n = document.getElementById("note3d"); if (n) { n.hidden = true; n.dataset.game = ""; }
  return "detached";
}

window.Map3D = {
  // development (v0.50 spectator HUD): its state / layout / cost, presets and the editor from scripts, the follow switch,
  // the camera's own pick, the cockpit's keep-clear zones and the car tags drawn now
  spec: {
    state: () => JSON.stringify({ ...specHud?.dev.state(), follow: camFollow, camPick, cam: camNum(), focus: app()?.focus || null, compare: app()?.compare || null, mode: camMode }),
    cost: () => JSON.stringify(specHud?.dev.cost() || null), resetCost: () => specHud?.dev.resetCost(),
    preset: (p) => specHud?.dev.preset(p), set: (id, patch) => specHud?.dev.set(id, patch), reset: () => specHud?.dev.reset(), edit: (on) => specHud?.dev.edit(on),
    follow: (on) => { if (on != null) setFollow(on); return camFollow; }, pick: (num) => { camPick = num == null ? null : String(num); return camNum(); },
    zones: () => JSON.stringify(keepClearZones()), layout: () => JSON.stringify(specHud?.dev.layout() || null),
    tags: () => JSON.stringify([...cars.values()].filter((c) => c.label.sp.visible).map((c) => c.num)),
    pit: (num) => JSON.stringify(pitInfoFor(String(num || camNum()))),
  },
  game: {
    attach: gameAttach,
    detach: gameDetach,
    get on() { return !!game; },
    // development: where the engine's lap lands on the world's (adapter3d.js buildMapping) and the cars as drawn
    mapping: () => JSON.stringify(game?.mappingInfo || null),
    state: () => JSON.stringify({ on: !!game, key: world?.sourceKey || null, game: !!world?.game, real: !!world?.real, pitLane: !!world?.pitLane, G: !!pitTeams.G, teams: (pitTeams.teams || []).length,
      cars: [...cars.values()].filter((c) => c.obj.visible).map((c) => ({ num: c.num, x: +c.pos.x.toFixed(2), y: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2), yaw: +c.yaw.toFixed(3), s: c.worldS != null ? +c.worldS.toFixed(1) : null, where: c.game?.where, phase: c.game?.pit?.phase, lifted: !!c.lifted, cmp: c.game?.tyre?.compound })),
      crews: world?.crews ? true : false, boxes: gameKit.boxDiag || null, cam: camMode, focus: app().focus || null, t: app().t }),
    setCam: (m) => setCam(m),
    // the pit view (game/pitcam.js): auto-direction and auto-slow on / off, the team's cars the director follows (the
    // selected car always first), its state and costs (ms: the director and the camera's placing, over `frames`)
    pitcam: {
      auto(on) { if (on != null) gamePitCam.S.auto = !!on; return gamePitCam.S.auto; },
      slow(on) { if (on != null) gamePitCam.S.slow = !!on; return gamePitCam.S.slow; },
      cars(list) { if (list !== undefined) gamePitCam.S.cars = list ? list.map(String) : null; return gamePitCam.S.cars; },
      state: () => JSON.stringify({ ...gamePitCam.state(), cam: camMode, cost: { frames: gamePitCost.frames, directMs: +(gamePitCost.direct / Math.max(1, gamePitCost.frames)).toFixed(4), poseMs: +(gamePitCost.pose / Math.max(1, gamePitCost.frames)).toFixed(4) }, crews: gameKit.crewInfo || null, drawn: gameKit.crewDrawn || null, crewCost: gameKit.crewCost ? { msPerFrame: +(gameKit.crewCost.ms / Math.max(1, gameKit.crewCost.frames)).toFixed(4), worstMs: +gameKit.crewCost.worst.toFixed(2), frames: gameKit.crewCost.frames } : null }),
      resetCost() { gamePitCost.direct = gamePitCost.pose = 0; gamePitCost.frames = 0; gameKit.crewCost = null; return "ok"; },
    },
  },
  floodTest,
  // development: look at a support car ("sc" | "med") from `dist` m at bearing `ang` (rad, 0 = from behind), `h` m up
  viewSupport(key = "sc", dist = 7, h = 1.6, ang = 0.6, fov = 40) {
    const o = world?.support?.cars?.[key]?.obj; if (!o?.visible) return "no " + key;
    const yaw = o.rotation.y, a = yaw + Math.PI + ang, p = o.position;
    return this.look(p.x + Math.sin(a) * dist, p.y + h, p.z + Math.cos(a) * dist, p.x, p.y + 0.6, p.z, fov) + " " + o.userData.spec.name;
  },
  // development: every support car model in a row on the lap line at fraction f (for comparing them); off: removed
  showroom(f = 0.1, on = true, gap = 4) {
    if (!world) return "no world";
    const old = world.group.getObjectByName("showroom"); if (old) { world.group.remove(old); disposeGroup(old); }
    if (!on) return "off";
    const g = new THREE.Group(); g.name = "showroom"; const S = world.samples, i = Math.floor(f * S.length) % S.length, p = S[i].p, t = S[i].tan, n = S[i].nor;
    Object.keys(SUPPORT_CARS).forEach((id, k) => { const c = makeSupportCar(id); c.position.set(p.x + n.x * (k - 4) * gap, p.y + 0.06, p.z + n.z * (k - 4) * gap); c.rotation.y = Math.atan2(t.x, t.z); g.add(c); });
    world.group.add(g); world.showroom = { x: p.x, y: p.y, z: p.z, tx: t.x, tz: t.z, nx: n.x, nz: n.z, gap }; return JSON.stringify(world.showroom);
  },
  // development: look at showroom car k from `dist` m at bearing `ang` (rad; 0 = from its front, π/2 = its left side)
  showroomView(k, ang = Math.PI / 2, dist = 7, h = 1.2, fov = 40) {
    const r = world?.showroom; if (!r) return "no showroom";
    const cx = r.x + r.nx * (k - 4) * r.gap, cz = r.z + r.nz * (k - 4) * r.gap, f = Math.atan2(r.tx, r.tz) + ang;
    return this.look(cx + Math.sin(f) * dist, r.y + h, cz + Math.cos(f) * dist, cx, r.y + 0.55, cz, fov) + " " + Object.keys(SUPPORT_CARS)[k];
  },
  // development: the corners' numbers now – [{ n, s, alpha, visible, d (m from the camera) }]
  cornerState() { const C = world?.corners; if (!C) return "no corners"; return JSON.stringify(C.list.map((k) => ({ n: k.n, s: Math.round(k.s), a: +k.alpha.toFixed(2), vis: k.sp.visible, d: Math.round(camera.position.distanceTo(k.sp.position)) }))); },
  // development: a car's wheels – the angle front / rear (rad), its place on the lap (m), its smear
  wheelState(num) { const c = cars.get(String(num)); if (!c) return "no car"; const u = c.model.userData; return JSON.stringify({ spin: c.spinW?.map((a) => +a.toFixed(4)), s: c.st?.s != null ? +c.st.s.toFixed(2) : null, onTrack: c.onTrack, speed: +c.speed.toFixed(2), smear: +(u.smear || 0).toFixed(3), rot: u.spins.map((q) => +q.rotation.x.toFixed(4)), lod: u.lod, R: [u.profile.FR, u.profile.RR] }); },
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
  // development: the focused car's front wheel angle each frame for `secs` s of playing – the biggest turn in one frame
  // against what its speed allows (the angle must never jump where its path changes: track ↔ pit lane ↔ estimated)
  // (v0.41: num – a car other than the focused one; the frames around each change of path or of the angle's source
  // (seams: [ms from the first frame, angle °, turn this frame °, what its speed allows °, path, source]))
  recordSpin(secs = 10, num = null) {
    return new Promise((done) => {
      const r = [], t0 = performance.now();
      devRec = () => {
        const c = cars.get(num || camNum()); if (!c || !c.spinW) return;
        r.push([app().t, c.spinW[0], c.speed, c.onTrack ? "track" : c.pit ? "pit:" + (c.pit.state?.state || "") : c.est ? "est" : "other", c.model.userData.profile.FR, c.spinSrc, c.spinD, app().src.carAt?.(c.num, app().t)?.speed ?? null]);
        if (performance.now() - t0 < secs * 1000) return;
        devRec = null;
        let worst = 0, at = null; const states = new Set();
        for (let i = 1; i < r.length; i++) {
          states.add(r[i][3]); const dts = (r[i][0] - r[i - 1][0]) / 1000; if (!(dts > 0)) continue;
          const turn = Math.abs(Math.atan2(Math.sin(r[i][1] - r[i - 1][1]), Math.cos(r[i][1] - r[i - 1][1]))), allow = 1.3 * Math.max(r[i][2], r[i - 1][2]) * dts / r[i][4] + 0.02;   // (c.speed m/s; the telemetry may read a touch above the positions)
          if (turn - allow > worst) { worst = turn - allow; at = [r[i - 1], r[i]]; }
        }
        // (the distance behind the angle, frame by frame, against the telemetry's speed × the frame's session time –
        // no aliasing: above ~40 km/h a wheel turns more than half a turn a frame and the angle alone can't tell)
        const deg = (x) => +(x * 180 / Math.PI).toFixed(1), seams = [], row = (j) => { const dt = (r[j][0] - r[j - 1][0]) / 1000, dd = r[j][6] != null && r[j - 1][6] != null ? r[j][6] - r[j - 1][6] : null, vd = r[j][7] != null && r[j - 1][7] != null ? ((r[j][7] + r[j - 1][7]) / 2 / 3.6) * dt : null; return [Math.round(r[j][0] - r[0][0]), deg(r[j][1]), dd == null ? null : +dd.toFixed(3), vd == null ? null : +vd.toFixed(3), r[j][3], r[j][5], +(((r[j][2] + r[j - 1][2]) / 2) * dt).toFixed(3)]; };
        let distWorst = 0, distAt = null;
        for (let i = 1; i < r.length; i++) {
          const x = row(i); if (x[2] != null && x[3] != null && Math.abs(x[2] - x[3]) > distWorst) { distWorst = Math.abs(x[2] - x[3]); distAt = x; }
          if (r[i][3] !== r[i - 1][3] || r[i][5] !== r[i - 1][5] || (r[i][7] == null) !== (r[i - 1][7] == null)) { const s = []; for (let j = Math.max(1, i - 4); j < Math.min(r.length, i + 5); j++) s.push(row(j)); seams.push(s); }
        }
        done(JSON.stringify({ frames: r.length, states: [...states], t: [r[0]?.[0], r[r.length - 1]?.[0]], excessRad: +worst.toFixed(4), at, distWorstM: +distWorst.toFixed(3), distAt, seams }));
      };
    });
  },
  // development: a car's wheel angles now – [session ms, front °, rear °, distance m (null: the path rules), source]
  spinOf(num) { const c = cars.get(num || camNum()); return c?.spinW ? JSON.stringify([app().t, +(c.spinW[0] * 180 / Math.PI).toFixed(3), +(c.spinW[1] * 180 / Math.PI).toFixed(3), c.spinD == null ? null : +c.spinD.toFixed(3), c.spinSrc]) : null; },
  recordLive(secs = 8) {
    return new Promise((done) => {
      const r = { t: [], dt: [], yaw: [], pitch: [], roll: [], y: [], side: [], steer: [], wheel: [], st: [] }, e = new THREE.Euler(), t0 = performance.now();
      devRec = (now, dt) => {
        const c = cars.get(camNum()); if (!c) return;
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
  // development (v0.53): kinks in the path the cars are drawn on – the racing line (lap line + its offset) walked every
  // `step` m: the heading's change per metre (curvature) and how fast that changes; the worst places
  lineKinks(step = 0.5, d = null) {
    if (!world) return "no world";
    const F = world.frame, A0 = [0, 0, 0], A1 = [0, 0, 0], out = [];
    let prevH = null, prevK = null;
    for (let s = 0; s < F.L; s += step) {
      const dd = d ?? F.lineAt(s); F.at(s, dd, A0); F.at(s + step, d ?? F.lineAt(s + step), A1);
      const h = Math.atan2(A1[0] - A0[0], A1[2] - A0[2]);
      if (prevH != null) { const k = wrap(h - prevH) / step; if (prevK != null) out.push({ s: +s.toFixed(1), k: +k.toFixed(4), dk: +((k - prevK) / step).toFixed(4) }); prevK = k; }
      prevH = h;
    }
    const ks = out.map((o) => Math.abs(o.k)).sort((a, b) => a - b), dks = out.map((o) => Math.abs(o.dk)).sort((a, b) => a - b);
    return JSON.stringify({ L: +F.L.toFixed(1), kP99: ks[Math.floor(ks.length * 0.99)], kMax: ks[ks.length - 1], dkP99: dks[Math.floor(dks.length * 0.99)], dkMax: dks[dks.length - 1], worst: out.sort((a, b) => Math.abs(b.dk) - Math.abs(a.dk)).slice(0, 15) });
  },
  // development (v0.53): why a car's samples are or aren't on the steadied tracks – per sample its offset from the lap line
  // and its height against the line's (smooth.js smoothCar's tests), as histograms
  trackFit(num, w0 = null, w1 = null) {
    const src = app().src, c = src?.tracks?.cars?.[num]; if (!c || !world) return "no car";
    if (w0 != null) { const st0 = src.startTime?.() || 0, F = world.frame, c0 = world.center, lane = pitLaneTest(world), rows = []; let hint = null;
      for (let k = 0; k < c.n; k++) { const x = c.x[k] * DM - c0.x, z = -(c.y[k] * DM - c0.z), y = (c.z[k] || 0) * DM - c0.y, pr = F.project(x, z, hint); if (pr) hint = pr.i; const tt = (c.t[k] - st0) / 1000; if (tt < w0 || tt > w1 || !pr) continue;
        rows.push([+tt.toFixed(2), Math.round(((pr.s % F.L) + F.L) % F.L), +pr.d.toFixed(1), +(y - pr.sample.p.y).toFixed(1), lane(x, z, y) ? 1 : 0, Math.round(src.carAt?.(num, c.t[k])?.speed ?? -1)]); }
      return JSON.stringify(rows); }
    const F = world.frame, c0 = world.center, lane = pitLaneTest(world), H = { d: {}, dy: {} }; let hint = null, near = 0, level = 0, inLane = 0;
    const bin = (o, v, w) => { const k = Math.sign(v) * Math.floor(Math.abs(v) / w) * w; o[k] = (o[k] || 0) + 1; };
    for (let k = 0; k < c.n; k++) {
      const x = c.x[k] * DM - c0.x, z = -(c.y[k] * DM - c0.z), y = (c.z[k] || 0) * DM - c0.y, pr = F.project(x, z, hint); if (!pr) continue; hint = pr.i;
      const half = Math.max(pr.sample.L ?? 7, -(pr.sample.R ?? -7)); bin(H.d, Math.abs(pr.d) - half, 2); bin(H.dy, y - pr.sample.p.y, 1);
      if (Math.abs(pr.d) <= half + 6) near++; if (Math.abs(y - pr.sample.p.y) < 4) level++; if (lane(x, z, y)) inLane++;
    }
    const LB = {}; { let hint2 = null; for (let k = 0; k < c.n; k++) { const x = c.x[k] * DM - c0.x, z = -(c.y[k] * DM - c0.z), y = (c.z[k] || 0) * DM - c0.y; const pr = F.project(x, z, hint2); if (pr) hint2 = pr.i; if (pr && lane(x, z, y)) { const key = Math.round(((pr.s % F.L) + F.L) % F.L / 50) * 50 + "|" + Math.round(pr.d); LB[key] = (LB[key] || 0) + 1; } } }
    const o = smooth.tr?.coords?.(num), runs = new Set(); let off = 0; if (o) for (let i = 0; i < o.t.length; i++) { if (o.run[i]) runs.add(o.run[i]); else off++; }
    const spans = []; if (o) { const st0 = src.startTime?.() || 0; let a = null; for (let i = 0; i <= o.t.length; i++) { const r = i < o.t.length ? o.run[i] : -1; if (a != null && r !== o.run[a]) { if (o.run[a]) spans.push([Math.round((o.t[a] - st0) / 1000), Math.round((o.t[i - 1] - st0) / 1000)]); a = null; } if (a == null && i < o.t.length) a = i; } }
    const gaps = {}; for (let k = 1; k < c.n; k++) bin(gaps, (c.t[k] - c.t[k - 1]) / 1000, 1);
    return JSON.stringify({ spans, laneAt: Object.entries(LB).sort((a, b) => b[1] - a[1]).slice(0, 25), n: c.n, near, level, inLane, out: o ? o.t.length : null, offOut: off, runs: runs.size, gaps, d: H.d, dy: H.dy });
  },
  // development (v0.53 §4–5): every car's FINAL drawn pose (after separate()) driven through updateCars over [t0, t1]
  // (stream ms) at `fps`, and what in it no car can do: a step faster than its own telemetry speed allows (a jump), a
  // height change faster than any road's slope at that speed (a lift), a heading swing, the body pitched / rolled past
  // a few degrees, the drawn height off the road under it. Each anomaly with the path the car was posed from (trk: the
  // steadied tracks, pit: pitDraw, raw: the feed's positions, est: a placement without data, grid) before and after.
  poseScan(t0, t1, o = {}) {
    const src = app().src; if (!world || !src) return "no world";
    if (!smoothFor(src) && !o.raw) return "pending";
    const fps = o.fps ?? 30, dt = 1 / fps, real = window.F1KR, st0 = src.startTime?.() || 0, nums = o.nums ? o.nums.map(String) : null;
    let fakeT = t0;
    window.F1KR = new Proxy(real, { get: (x, k) => (k === "t" ? fakeT : Reflect.get(x, k)) });
    const prev = new Map(), out = [], byKind = {}, cnt = {}, tags = {}, worst = {}, R = world.real, add = (kind, num, mag, extra) => { cnt[kind] = (cnt[kind] || 0) + 1; if (!worst[kind] || mag > worst[kind]) worst[kind] = mag; const per = o.perKind ?? 300; byKind[kind] = (byKind[kind] || 0) + 1; if (byKind[kind] <= per) out.push({ t: +((fakeT - st0) / 1000).toFixed(2), num, kind, mag: +mag.toFixed(2), ...extra }); };
    const tagOf = (c) => c.est ? "est" : c.pit ? "pit:" + (c.pit.state?.state || "") : c.grid && c.grid.state !== "free" ? "grid" : c.onTrack ? "trk" : "raw";
    const groundY = (x, z) => { const [s, d] = world.grid.nearest(x, z, 2); const g = R?.groundAt ? R.groundAt(x, z) : null; return s && d < Math.max(s.L ?? 7, -(s.R ?? -7)) + 1.5 ? s.p.y : g; };
    let frames = 0; const tA = performance.now(), ft = [];
    try {
      for (fakeT = t0; fakeT <= t1; fakeT += dt * 1000) {
        const f0 = performance.now(); updateCars(dt); ft.push(performance.now() - f0); frames++;
        for (const [num, c] of cars) {
          if (nums && !nums.includes(num)) continue;
          if (!c.has || !c.obj.visible) { prev.delete(num); continue; }
          const P = c.obj.position, tg = tagOf(c), q = prev.get(num), tel = src.carAt?.(num, fakeT), vt = tel ? tel.speed / 3.6 : null, sNow = c.st && c.onTrack ? Math.round(((c.st.s % world.frame.L) + world.frame.L) % world.frame.L) : null;
          tags[tg.split(":")[0]] = (tags[tg.split(":")[0]] || 0) + 1;
          if (q) {
            const step = Math.hypot(P.x - q.x, P.z - q.z), allow = (Math.max(vt ?? 0, q.v ?? 0, c.speed || 0) * 1.25 + 8) * dt + 0.15;
            const base = { tag: q.tag === tg ? tg : q.tag + ">" + tg, s: sNow, v: Math.round((vt ?? c.speed ?? 0) * 3.6), x: +P.x.toFixed(1), y: +P.y.toFixed(2), z: +P.z.toFixed(1) };
            if (step > allow) add("jump", num, step, { ...base, allow: +allow.toFixed(2) });
            const dy = Math.abs(P.y - q.y), yAllow = (0.2 * Math.max(step / dt, 5) + 0.6) * dt;   // (20 % slope at the speed it moved, + 0.6 m/s)
            if (dy > yAllow) add("lift", num, dy, base);
            const dyaw = Math.abs(wrap(c.yaw - q.yaw));
            if (dyaw > Math.max(0.12, (c.speed || 0) / 12 * dt * 1.5 + 0.05) && step > 0.02) add("yaw", num, dyaw * 57.3, { ...base, traf: [+(c.trafD || 0).toFixed(2), +(c.trafRate || 0).toFixed(2), c.trafMode || ""], vs: c.st ? +c.st.vs.toFixed(1) : null, d: c.st ? +c.st.d.toFixed(2) : null, vd: c.st ? +c.st.vd.toFixed(2) : null });
            if (q.tag !== tg) add("switch", num, step, base);
          }
          if (Math.abs(c.model.rotation.x) > 0.09 || Math.abs(c.model.rotation.z) > 0.06) add("tilt", num, Math.max(Math.abs(c.model.rotation.x), Math.abs(c.model.rotation.z)) * 57.3, { tag: tg });
          if (frames % Math.max(1, Math.round(fps / 2)) === 0) { const g = groundY(P.x, P.z); if (g != null && Math.abs(P.y - g) > (o.hTol ?? 0.6)) add("height", num, P.y - g, { tag: tg, x: +P.x.toFixed(1), z: +P.z.toFixed(1), ground: +g.toFixed(2) }); }
          prev.set(num, { x: P.x, y: P.y, z: P.z, yaw: c.yaw, tag: tg, v: vt });
        }
      }
    } finally { window.F1KR = real; }
    ft.sort((a, b) => a - b);
    return JSON.stringify({ frames, ms: Math.round(performance.now() - tA), updateMs: [ft[ft.length >> 1], ft[Math.floor(ft.length * 0.99)]].map((v) => +v.toFixed(2)), tags, counts: cnt, worst: Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, +v.toFixed(2)])), list: out });
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
  // development (v0.44): cars drawn overlapping over [t0, t1] (stream ms, every `step` ms, driven like trafficScan):
  // oriented boxes from each car's model bounds at its drawn pose (C), at its steadied place without the correction
  // (B) and at the feed's own interpolated position (A); overlap episodes per pair, classified (traffic.js
  // classifyOverlap), with counts, durations and depths per cause and the worst ones (time from lights out, cars, place)
  overlapScan(t0, t1, step = 100, o = {}) {
    const src = app().src, sm = smoothFor(src); if (!sm || !world) return "no tracks";
    const F = sm.frame, real = window.F1KR, st0 = src.startTime?.() || 0; let fakeT = t0;
    const log = episodeLog(step * 2.5), RAW = [0, 0, 0], B = [0, 0, 0], c0 = world.center;
    const res = { frames: 0, carFrames: 0, acknowledged: 0, byMode: {}, byPlace: {}, levels: 0, sameLat: 0, closePairs: 0, queue: { brake: { pairs: 0, rawBelow: 0, alignedBelow: 0 }, other: { pairs: 0, rawBelow: 0, alignedBelow: 0 } }, rawGapMs: null, dims: {} };
    window.F1KR = new Proxy(real, { get: (x, k) => (k === "t" ? fakeT : Reflect.get(x, k)) });
    try {
      for (fakeT = t0; fakeT <= t1; fakeT += step) {
        updateCars(step / 1000); res.frames++;
        const list = [];
        for (const [num, c] of cars) {
          if (!c.has || !c.obj.visible || !c.pos) continue;
          const D = carDims(c); res.dims[D.era] = [+(D.front + D.back).toFixed(2), +(2 * D.half).toFixed(2)];
          const onT = c.onTrack && c.st && !c.est && !c.pit;
          if (onT) F.at(c.st.s, c.st.d, B);
          const r = src.tracks.at(num, fakeT, RAW) ? [RAW[0] * DM - c0.x, -(RAW[1] * DM - c0.z)] : null;
          list.push({ num, c, D, x: c.pos.x, y: c.pos.y, z: c.pos.z, yaw: c.yaw, bx: onT ? B[0] : c.feedPos.x, bz: onT ? B[2] : c.feedPos.z, s: onT ? c.st.s : null, d: onT ? c.st.d : null, raw: r,
            pit: !!c.pit, offT: !onT && !c.pit && !c.est, est: !!c.est, grid: !!c.grid && c.grid.state !== "free" && !c.grid.estimated, off: c.trafD || 0, tgt: c.trafTgt ?? 0, want: c.trafWant || [0, 0], as: c.st?.as || 0 });
        }
        res.carFrames += list.length;
        // nose to tail on the track (neighbours along the lap within 15 m): how often the feed (A) and the steadied
        // tracks (B) have them closer than a car's length – braking (−12 m/s² or harder) and all
        { const on = list.filter((q) => q.s != null).map((q) => [((q.s % F.L) + F.L) % F.L, q]).sort((x, y) => x[0] - y[0]);
          for (let k = 0; k < on.length; k++) {
            const [ua, a] = on[k], [ub, b] = on[(k + 1) % on.length]; if (a === b) continue;
            const dsB = ((ub - ua) % F.L + F.L) % F.L; if (dsB > 15) continue;
            const need = (a.D.front + a.D.back + b.D.front + b.D.back) / 2, pa = a.raw && F.project(a.raw[0], a.raw[1]), pb = b.raw && F.project(b.raw[0], b.raw[1]);
            const q = Math.min(a.as, b.as) < -12 ? res.queue.brake : res.queue.other;
            q.pairs++; if (dsB < need) q.alignedBelow++;
            if (pa && pb) { const dsA = Math.abs(((pb.s - pa.s) % F.L + F.L * 1.5) % F.L - F.L / 2); if (dsA < need) q.rawBelow++; }
          }
        }
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (Math.hypot(a.x - b.x, a.z - b.z) > 8) continue;
          const dC = boxDepth(a.x, a.z, a.yaw, a.D, b.x, b.z, b.yaw, b.D);
          // (on the track, one behind the other: the feed's spacing in a braking queue, and how often B has them on the same line)
          if (a.s != null && b.s != null) {
            res.closePairs++; if (Math.abs(a.d - b.d) < 0.3) res.sameLat++;
          }
          if (!dC) continue;
          if (Math.abs(a.y - b.y) > 2.5) { res.levels++; continue; }   // (one over the other: a bridge, a tunnel – not an overlap)
          const dB = boxDepth(a.bx, a.bz, a.yaw, a.D, b.bx, b.bz, b.yaw, b.D);
          const dA = a.raw && b.raw ? boxDepth(a.raw[0], a.raw[1], a.yaw, a.D, b.raw[0], b.raw[1], b.yaw, b.D) : 0;
          const smp = a.s != null ? F.sampleAt(a.s) : null, room = smp ? (smp.L ?? 7) - (smp.R ?? -7) - 1.9 : 99;
          const cause = classifyOverlap({ pitA: a.pit, pitB: b.pit, offA: a.offT, offB: b.offT, est: a.est || b.est, grid: a.grid || b.grid, aligned: dB, raw: dA, room, need: a.D.half + b.D.half,
            cancel: [a, b].some((q) => q.want[0] > 0.3 && q.want[1] < -0.3), tgtSep: a.d != null && b.d != null ? Math.abs(a.d + a.tgt - b.d - b.tgt) : 0, moved: Math.abs(a.off) + Math.abs(b.off) > 0.3 });
          if (Math.max(a.c.trafRes || 0, b.c.trafRes || 0) > 0) res.acknowledged++;
          { const mk = cause + "|" + [a.c.trafMode || "-", b.c.trafMode || "-"].sort().join("+"); res.byMode[mk] = (res.byMode[mk] || 0) + 1; if (a.s != null) { const bin = Math.floor(((a.s % F.L) + F.L) % F.L / 50) * 50; res.byPlace[bin] = (res.byPlace[bin] || 0) + 1; } }   // (frames the correction itself reports as left over)
          log.add(fakeT, a.num + "/" + b.num, dC, cause, { s: a.s != null ? Math.round(((a.s % F.L) + F.L) % F.L) : null, x: +a.x.toFixed(1), y: +a.y.toFixed(1), z: +a.z.toFixed(1), off: [+a.off.toFixed(2), +b.off.toFixed(2)], sOff: [+(a.c.trafS || 0).toFixed(2), +(b.c.trafS || 0).toFixed(2)], mode: [a.c.trafMode || "", b.c.trafMode || ""], pit: [a.c.pit?.state?.state || "", b.c.pit?.state?.state || ""], sep: [+Math.hypot(a.c.sepX || 0, a.c.sepZ || 0).toFixed(2), +Math.hypot(b.c.sepX || 0, b.c.sepZ || 0).toFixed(2)], raw: +dA.toFixed(2), aligned: +dB.toFixed(2) });
        }
      }
    } finally { window.F1KR = real; }
    // the feed's sample spacing (ms) over the window: median and 95th percentile
    { const g = []; for (const c of Object.values(src.tracks.cars)) for (let k = 1; k < c.n; k++) if (c.t[k] >= t0 && c.t[k] <= t1) g.push(c.t[k] - c.t[k - 1]); g.sort((x, y) => x - y); res.rawGapMs = g.length ? [g[g.length >> 1], g[Math.floor(g.length * 0.95)]] : null; }
    const eps = log.finish();
    res.episodes = eps.length; res.overlapFrames = eps.reduce((x, e) => x + e.frames, 0);
    res.byCause = summarise(eps, step);
    res.worst = eps.sort((x, y) => y.depth * (y.t1 - y.t0 + step) - x.depth * (x.t1 - x.t0 + step)).slice(0, o.top ?? 12).map((e) => ({ t: +((e.worstT - st0) / 1000).toFixed(1), pair: e.key, cause: e.cause, depth: +e.depth.toFixed(2), dur: +((e.t1 - e.t0 + step) / 1000).toFixed(1), ...e.at }));
    return JSON.stringify(res);
  },
  // development (v0.44): the traffic correction now (D) – per car its place (s, d: the steadied tracks), the offsets
  // across and along (drawn and target), the overlap left (res, m) and why (mode); the close pairs and what each
  // needs. `at` (stream ms): driven there first, from 8 s before (like trafficScan). `mark`: a red ring under every
  // car with an overlap left (development only)
  // development (v0.45 regression): traffic.js's promises checked every frame over [t0, t1] (driven like overlapScan –
  // trafaudit.js auditFrame: S_MAX per car, the order along the lap, kept on the tarmac), and the data before/after
  // (the timing lines and the steadied tracks are read, never written)
  async trafficAudit(t0, t1, step = 100) {
    const src = app().src, sm = smoothFor(src); if (!sm || !world) return "no tracks";
    const { makeAudit, auditFrame, auditSummary } = await import("./trafaudit.js"), real = window.F1KR, A = makeAudit(), st0 = src.startTime?.() || 0;
    const nums = Object.keys(src.state.DriverList || {}), probe = () => JSON.stringify([src.state.TimingData?.Lines, src.state.LapCount, nums.map((n) => [t0, (t0 + t1) / 2, t1].map((tt) => { const q = sm.state(n, tt, {}); return q && [q.s, q.d, q.vs]; }))]);
    const before = probe(); let fakeT = t0;
    window.F1KR = new Proxy(real, { get: (x, k) => (k === "t" ? fakeT : Reflect.get(x, k)) });
    try { for (fakeT = t0; fakeT <= t1; fakeT += step) { updateCars(step / 1000); if (traf.F) auditFrame(A, trafList, traf.S.cars, TRAFFIC, traf.F.L, Math.round((fakeT - st0) / 100) / 10); } }
    finally { window.F1KR = real; }
    return JSON.stringify({ ...auditSummary(A), dataSame: probe() === before });
  },
  // development (v0.45 regression): the same moment t shown after playing up to it (1/60 s frames) and after a seek
  // forward, a rewind and a pause – per car the largest difference in place, heading, traffic offsets and separate()'s push
  async seekCheck(t, o = {}) {
    const src = app().src; if (!smoothFor(src) || !world) return "no tracks";
    const { diffSnaps } = await import("./trafaudit.js"), real = window.F1KR, fr = 1000 / 60; let fakeT = t;
    // (whole frames from a to b, the last exactly at b: a sum of 1/60 s steps drifts by a fraction of a µs past b, and the
    // pause after it then read as a rewind)
    const drive = (a, b) => { const n = Math.max(1, Math.round((b - a) / fr)); for (let i = 0; i <= n; i++) { fakeT = a + (b - a) * i / n; updateCars((b - a) / n / 1000); } };
    const one = (tt) => { fakeT = tt; updateCars(fr / 1000); };
    const snap = () => { const s = {}; for (const [num, c] of cars) s[num] = { vis: !!(c.obj.visible && c.has), x: c.pos.x, y: c.pos.y, z: c.pos.z, yaw: c.yaw, trafD: c.trafD || 0, trafS: c.trafS || 0, sepX: c.sepX || 0, sepZ: c.sepZ || 0, tag: [c.trafMode || "", c.pit ? "pit:" + (c.pit.state?.state || "") : "", c.onTrack ? "" : "off", c.grid && c.grid.state !== "free" ? "grid" : "", c.est ? "est" : "", Math.round(c.speed || 0)].filter((x) => x !== "").join(" ") }; return s; };
    const lead = o.lead ?? 20000, after = o.after ?? 1000, out = {}, warm0 = TRAFFIC.WARM_MS;
    // (o.warm: another warm-up length for this check; o.trace: one car's offsets and traffic step per paused frame)
    if (o.warm != null) TRAFFIC.WARM_MS = o.warm;
    const tr = o.trace != null && cars.get(String(o.trace)), trace = () => tr && [+(tr.trafD || 0).toFixed(3), +(tr.trafS || 0).toFixed(3), traf.S.lastT, tr.trafMode || ""];
    window.F1KR = new Proxy(real, { get: (x, k) => (k === "t" ? fakeT : Reflect.get(x, k)) });
    try {
      drive(t - lead, t); const P = snap(), T0 = trace(), Tp = [];
      for (let i = 0; i < 60; i++) { one(t); if (i < 4) Tp.push(trace()); } out.pause = diffSnaps(P, snap()); if (tr) out.trace = { played: T0, paused: Tp, lastDriven: fakeT };
      drive(t - lead, t + after); const P1 = snap();
      drive(t - 600000, t - 598000); one(t); out.seek = diffSnaps(P, snap());
      drive(t + fr, t + after); out.seekAfter = diffSnaps(P1, snap());
      drive(t - lead, t + 10000); one(t); out.rewind = diffSnaps(P, snap());
      drive(t - lead, t + 1500); one(t); out.rewindShort = diffSnaps(P, snap());
    } finally { window.F1KR = real; TRAFFIC.WARM_MS = warm0; }
    return JSON.stringify({ t: +((t - (src.startTime?.() || 0)) / 1000).toFixed(1), ...out });
  },
  trafficState(at = null, mark = null) {
    if (at != null) { const real = window.F1KR; let fakeT = at - 8000; window.F1KR = new Proxy(real, { get: (x, k) => (k === "t" ? fakeT : Reflect.get(x, k)) }); try { for (; fakeT <= at; fakeT += 50) updateCars(0.05); } finally { window.F1KR = real; } }
    if (mark != null) devTrafMark = !!mark;
    const S = traf.S, r2 = (x) => +x.toFixed(2);
    return JSON.stringify({ t: S.lastT, live: !!traf.env?.live, stats: S.stats, costMs: +(trafCost.ms / Math.max(1, trafCost.frames)).toFixed(4), limits: TRAFFIC,
      cars: S.cand.length || S.cars.size ? [...trafItems.values()].filter((c) => S.cars.has(c.num)).map((c) => { const m = S.cars.get(c.num); return { num: c.num, s: r2(c.s % traf.F.L), d: r2(c.d), lo: r2(c.lo), hi: r2(c.hi), dOff: r2(m.dOff), tD: r2(m.tD), sOff: r2(m.sOff), tS: r2(m.tS), res: r2(m.res), mode: m.mode }; }) : [],
      pairs: S.cand.slice(0, S.cand.length).map((P) => ({ r: P.r.num, f: P.f.num, du: r2(P.du), Lneed: r2(P.Lneed), deficit: r2(P.deficit), wLat: r2(P.wLat), wLong: r2(P.wLong), pass: P.pass, side: P.side })) });
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
  pitScan(t0, t1, step = 500, states = ["waiting (double stack)"], nums = null) {
    const src = app().src, out = [];
    for (let t = t0; t <= t1; t += step) { const f = pitFrame(src, t, 0, true); if (!f) continue; for (const r of f.values()) if ((!states || states.includes(r.state.state)) && (!nums || nums.includes(r.num))) out.push([t, r.num, r.state.state, r.u == null ? null : Math.round(r.u), ...(nums ? [+r.off.toFixed(1), +r.input.speed.toFixed(1), +r.input.stillFor.toFixed(1), r.input.boxU == null ? null : Math.round(r.input.boxU)] : [])]); }
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
  // development (v0.46): the pit wall at a team's box (a name, or the k-th team with a box along the lane), from a camera
  // placed by the garages and the track's edge alone – not by the wall or the stand, so before and after a change to
  // them it stands in the same place: "above" – 9 m over the lane, 22 m back along it, looking down the wall; "lane" –
  // 1.7 m up in the pit lane 9 m short of the edge's line, 12 m back, looking along the wall
  viewPitWall(team = 0, mode = "above", fov = 55) {
    const G = pitTeams.G, ts = (pitTeams.teams || []).filter((t) => t.box != null).sort((a, b) => a.box - b.box);
    const t = typeof team === "number" ? ts[Math.max(0, Math.min(ts.length - 1, team))] : ts.find((q) => q.team.toLowerCase().includes(String(team).toLowerCase()));
    if (!G || !t) return "no team";
    const s = G.slots.reduce((p, q) => (Math.abs(q.uc - t.box) < Math.abs(p.uc - t.box) ? q : p)), out = [-s.inward[0], -s.inward[1]], F = world.frame;
    const at = (a, d) => [s.front[0] + s.along[0] * (t.box - s.uc + a) + out[0] * d, s.front[1] + s.along[1] * (t.box - s.uc + a) + out[1] * d];
    let edge = null; for (let d = 0; d < 60; d += 0.25) { const [x, z] = at(0, d), pr = F.project(x, z); if (pr && Math.abs(pr.d) <= (pr.d >= 0 ? edgeOf(pr.sample, 1) : -edgeOf(pr.sample, -1))) { edge = d; break; } }
    if (edge == null) return "no edge";
    const y = s.floor, [tx, tz] = at(0, edge - 3), [px, pz] = mode === "lane" ? at(-12, edge - 9) : at(-22, edge - 10), [qx, qz] = mode === "lane" ? at(2, edge - 3) : [tx, tz];
    return this.look(px, y + (mode === "lane" ? 1.7 : 9), pz, qx, y + 1, qz, fov) + ` ${t.team} box ${Math.round(t.box)} edge ${edge}`;
  },
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
  // development: the level yards and footings on (true) or off (false – as before v0.39); resolves once rebuilt
  roadJoin(on = true) {
    devRoadJoin = !!on; rebuild(); const t0 = performance.now();
    return new Promise((res) => { const t = setInterval(() => { if (world?.real?.info || performance.now() - t0 > 150e3) { clearInterval(t); res(world?.real ? `rebuilt (join ${on ? "on" : "off"}) ${Math.round(performance.now() - t0)} ms` : "timeout"); } }, 400); });
  },
  groundFix(on = true) {
    devGroundOld = !on; rebuild(); const t0 = performance.now();
    return new Promise((res) => { const t = setInterval(() => { if (world?.real?.info || performance.now() - t0 > 150e3) { clearInterval(t); res(world?.real ? `rebuilt (${on ? "fix" : "old"}) ${Math.round(performance.now() - t0)} ms` : "timeout"); } }, 400); });
  },
  // development: the drawn terrain's height (terrainAt) where the yards must never change it – along the pit lane, out
  // from the track's edges over its run-off (2–29 m), along the map's raceway lines (escape roads, service tracks) –
  // [{ k, x, z, y }]; compared before / after groundFix(false) it shows what the yards (footing.js padPlan) moved there
  padProbe() {
    const R = world?.real; if (!R?.terrainAt) return "no map";
    const out = [], add = (k, x, z) => out.push([k, +x.toFixed(1), +z.toFixed(1), +R.terrainAt(x, z).toFixed(3), +(R.padAt?.(x, z) ?? 0).toFixed(3), R.padKeepOut ? R.padKeepOut(x, z) : null]);
    for (const p of world.pitLane?.pts || []) add("lane", p.x, p.z);
    const S = world.samples; for (let i = 0; i < S.length; i += 6) { const s = S[i]; for (const sg of [1, -1]) { const e = sg > 0 ? (s.L ?? 7) : -(s.R ?? -7); for (const o of [2, 10, 20, 29]) add("runoff" + o, s.p.x + s.nor.x * (e + o) * sg, s.p.z + s.nor.z * (e + o) * sg); } }
    for (const l of R.scene?.lines || []) if (l.k === "raceway") for (const q of l.pts) { const [x, z] = R.geo.xz(q); add("raceway", x, z); }
    return out;
  },
  // development: groundDiag's counts over the whole map (no list)
  groundDiagAll() { const R = world?.real; if (!R?.scene) return "no map"; const [la, lo] = R.scene.center || R.geo.toLL(0, 0), d = JSON.parse(this.groundDiag(la, lo, 1e5, 0)); delete d.list; return JSON.stringify(d); },
  // development: pick the n buildings nearest the track (within maxD m) most buried by the drawn ground – the cameras
  // for groundCam(k) – and keep them, so the same cameras can be used with the fix off and on
  groundCams(n = 3, maxD = 400) {
    const R = world?.real; if (!R?.scene) return "no map";
    const [la, lo] = R.scene.center || R.geo.toLL(0, 0), d = JSON.parse(this.groundDiag(la, lo, 1e5, 2000));
    const near = d.list.filter((b) => !b.modelled && b.kind !== "grandstand" && b.trackD < maxD && b.h > 2.5).slice(0, n);
    window.__gndCams = near.map((b) => ({ ll: b.ll, worst: b.worstAt, name: b.name, kind: b.kind, size: b.size }));
    return JSON.stringify(near);
  },
  // development: look at kept building k (groundCams) from its buried side, h m up
  groundCam(k = 0, h = 1.7) {
    const c = window.__gndCams?.[k], R = world?.real; if (!c || !R) return "none";
    const [x, z] = R.geo.fromLL(...c.ll), [wx, wz] = R.geo.fromLL(...c.worst); let dx = wx - x, dz = wz - z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const dist = Math.max(22, c.size * 0.9), [la, lo] = R.geo.toLL(x + dx * dist, z + dz * dist);
    return this.lookLLAt(la, lo, h, c.ll[0], c.ll[1], h > 10 ? 0 : 2, 60);
  },
  // development: how the map's buildings within r m of (lat, lon) meet the drawn ground. Per building: the base its walls
  // start from (buildings.js: the lowest groundAt at its corners), the drawn terrain's lowest/highest point over the
  // footprint (corners, every 2 m along the edges, a 3 m grid inside – the mesh's own triangles, not groundAt), how deep
  // the terrain covers the walls (buried = terrain max − base) and the largest gap under them (gap = base − terrain min)
  groundDiag(lat, lon, r = 150, top = 30) {
    const R = world?.real; if (!R?.scene || !R.terrainAt) return "no map";
    const [x0, z0] = R.geo.fromLL(lat, lon), out = [];
    const inside = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < ((P[j][0] - P[i][0]) * (z - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
    for (const b of R.scene.buildings) {
      let P = b.pts.map(R.geo.xz); if (P.length > 3 && P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1]) P = P.slice(0, -1);
      let cx = 0, cz = 0; for (const [a, c] of P) { cx += a; cz += c; } cx /= P.length; cz /= P.length;
      if (Math.hypot(cx - x0, cz - z0) > r || P.length < 3) continue;
      const S = [...P];
      for (let i = 0; i < P.length; i++) { const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2); for (let k = 1; k < n; k++) S.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]); }
      let xa = Infinity, xb = -Infinity, za = Infinity, zb = -Infinity; for (const [a, c] of P) { xa = Math.min(xa, a); xb = Math.max(xb, a); za = Math.min(za, c); zb = Math.max(zb, c); }
      for (let x = xa + 1.5; x < xb; x += 3) for (let z = za + 1.5; z < zb; z += 3) if (inside(x, z, P)) S.push([x, z]);
      // (as buildings.js stands it: footing() on the drawn ground – or, before v0.39, the lowest corner's groundAt)
      const ft = footing(S.map(([a, c]) => R.terrainAt(a, c))); let corner = Infinity; for (const [a, c] of P) corner = Math.min(corner, R.groundAt(a, c));
      if (!R.info?.footing?.n) { ft.floor = corner; ft.plinth = 0; }   // (the fix off – Map3D.groundFix(false): the lowest corner, no plinth)
      const base = ft.floor;
      let tMin = Infinity, tMax = -Infinity, gMin = Infinity, gMax = -Infinity, at = null;
      for (const [a, c] of S) { const t = R.terrainAt(a, c), g = R.groundAt(a, c); if (t > tMax) { tMax = t; at = [a, c]; } tMin = Math.min(tMin, t); gMin = Math.min(gMin, g); gMax = Math.max(gMax, g); }
      // (what the ground round it is to the level yards – scenery.js keepOut – within 12 m of the outline)
      const ko = {}; if (R.padKeepOut) for (let x = xa - 12; x <= xb + 12; x += 4) for (let z = za - 12; z <= zb + 12; z += 4) { let dd = Infinity; for (let i = 0; i < P.length; i++) { const A = P[i], B = P[(i + 1) % P.length], ex = B[0] - A[0], ez = B[1] - A[1], l = ex * ex + ez * ez, t = l ? Math.max(0, Math.min(1, ((x - A[0]) * ex + (z - A[1]) * ez) / l)) : 0; dd = Math.min(dd, Math.hypot(x - A[0] - ex * t, z - A[1] - ez * t)); } if (dd > 12 && !inside(x, z, P)) continue; const k = R.padKeepOut(x, z) || "free"; ko[k] = (ko[k] || 0) + 1; }
      const f = (v) => +v.toFixed(2);
      const tr = world.grid.nearest(cx, cz, 12);
      out.push({ yard: R.padWhy?.(b) ?? null, trackD: tr?.[0] ? Math.round(tr[1]) : 1e4, size: Math.round(Math.max(xb - xa, zb - za)), ko, name: b.name || null, kind: b.kind || null, h: b.h, min: b.min || 0, est: !!b.est, d: Math.round(Math.hypot(cx - x0, cz - z0)), ll: R.geo.toLL(cx, cz).map((v) => +v.toFixed(6)), n: S.length,
        modelled: !!R.landmarks?.skip?.(b), base: f(base), lowestCorner: f(corner), plinth: f(ft.plinth), terrain: [f(tMin), f(tMax)], groundAt: [f(gMin), f(gMax)], buried: f(tMax - base), gap: f(ft.plinth ? 0 : base - tMin), worstAt: R.geo.toLL(...at).map((v) => +v.toFixed(6)) });
    }
    return JSON.stringify({ cell: R.terrainCell?.map((v) => +v.toFixed(1)), pads: R.info?.pads, footing: R.info?.footing, n: out.length, buried1m: out.filter((b) => b.buried > 1).length, buried1mNear: out.filter((b) => b.buried > 1 && b.trackD < 400 && !b.modelled).length, nearTrack: out.filter((b) => b.trackD < 400).length, list: out.sort((a, b) => b.buried - a.buried).slice(0, top) });
  },
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
    const lifted = [...cars.values()].filter((c) => c.lifted).map((c) => ({ num: c.num, y: +c.model.position.y.toFixed(3), wheels: c.model.userData.wheels.map((w, i) => (wheelIsOn(c.model, i) ? 1 : 0)).join(""), pos: c.pos.toArray().map((v) => +v.toFixed(3)), raw: c.raw?.toArray().map((v) => +v.toFixed(3)), yaw: +c.yaw.toFixed(4) }));
    return JSON.stringify({ t: app().t, instances: n, hash: h, lifted, note: document.getElementById("pitWorkNote")?.hidden === false ? document.getElementById("pitWorkNote").textContent : null });
  },
  // development: the starts as the lights use them (race control's + the field's launch by telemetry)
  starts() { const src = app().src; if (!src) return "null"; const shown = shownStarts(src, app().t), S = startState(src, app().t); return JSON.stringify({ shown: shown.map((s) => ({ t: s.t, standing: s.standing, from: s.from || null })), launches: [...(S.launches || new Map())].map(([t, f]) => [t, f && { t: f.t, n: f.n, of: f.of }]) }); },
  // development: the support cars and the official as placed this frame
  support() { const SP = world?.support; if (!SP) return "null"; const pos = (k) => { const o = SP.cars[k]?.obj; return o?.visible ? o.position.toArray().map((v) => +v.toFixed(1)) : null; }; return JSON.stringify({ plan: SP.plan, models: SP.models, sc: pos("sc"), med: pos("med"), last: [...SP.starts.values()][0]?.last || null, order: [...SP.starts.values()][0]?.order || null, official: SP.officialShown || false, officialAt: SP.officialAt || null, scLast: SP.scLast || null, medFollows: SP.medFollows || null, lap1: [...SP.starts.values()][0]?.lap1 || null, lane: world.pitLane ? { entry: [laneAt(0).x, laneAt(0).z].map((v) => +v.toFixed(1)), exit: [laneAt(world.pitLane.exitU).x, laneAt(world.pitLane.exitU).z].map((v) => +v.toFixed(1)), len: +world.pitLane.len.toFixed(1), exitU: +world.pitLane.exitU.toFixed(1) } : null, gridBack: SP.gridBack ? { x: +SP.gridBack.x.toFixed(1), z: +SP.gridBack.z.toFixed(1), f: [+SP.gridBack.f.x.toFixed(3), +SP.gridBack.f.z.toFixed(3)] } : null }); },
  // development: the rear-of-grid official against the track, the pit lane and the medical car this frame (v0.46 §4):
  // lateral offsets d (+ left) from the lap line's frame, the edges there, the distance to the pit lane's measured path,
  // inside the pit building's lane (pit model: 0 … wall from the garages) and the gap to the medical car's outline
  flagDiag() {
    const SP = world?.support; if (!SP || !world.frame) return "null";
    const F = world.frame, P = (x, z) => { const pr = F.project(x, z); return pr ? { d: +pr.d.toFixed(2), L: +edgeOf(pr.sample, 1).toFixed(2), R: +edgeOf(pr.sample, -1).toFixed(2), on: pr.d <= edgeOf(pr.sample, 1) && pr.d >= edgeOf(pr.sample, -1) } : null; };
    const lane = (x, z) => { const L = world.pitLane; if (!L) return null; let b = Infinity; for (let i = 1; i < L.pts.length; i++) { const a = L.pts[i - 1], c = L.pts[i], dx = c.x - a.x, dz = c.z - a.z, l2 = dx * dx + dz * dz, f = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0; b = Math.min(b, Math.hypot(a.x + dx * f - x, a.z + dz * f - z)); } return +b.toFixed(2); };
    const G = pitTeams.G, inPit = (x, z) => { if (!G) return null; const m = pitModelFor(G), pr = G.project(x, z); if (pr.u < G.gStart - 20 || pr.u > G.gEnd + 20) return false; const w = m.at(Math.max(G.gStart, Math.min(G.gEnd, pr.u))).wall; return pr.off >= -0.5 && pr.off <= (w || 0); };
    const o = SP.officialAt, mo = SP.cars.med?.obj, med = mo?.visible ? { x: mo.position.x, z: mo.position.z, yaw: mo.rotation.y, L: mo.userData.spec?.L || 5.05, W: mo.userData.spec?.W || 1.96 } : null;
    const gap = (x, z) => { if (!med) return null; const c = Math.cos(med.yaw), s = Math.sin(med.yaw), dx = x - med.x, dz = z - med.z, along = dx * s + dz * c, across = dx * c - dz * s; return +Math.hypot(Math.max(0, Math.abs(along) - med.L / 2), Math.max(0, Math.abs(across) - med.W / 2)).toFixed(2); };
    const gb = SP.gridBack, laneSide = gb && world.pitLane ? (() => { let b = Infinity, q = null; for (const p of world.pitLane.pts) { const d = Math.hypot(p.x - gb.x, p.z - gb.z); if (d < b) { b = d; q = p; } } const pr = q && F.project(q.x, q.z); return pr ? { d: +pr.d.toFixed(1), dist: +b.toFixed(1) } : null; })() : null;
    return JSON.stringify({ plan: SP.plan?.official || null, med: SP.plan?.medical?.mode || null, official: o ? { x: o.x, z: o.z, sg: o.sg, stand: o.stand, out: o.out, track: P(o.x, o.z), laneDist: lane(o.x, o.z), inPit: inPit(o.x, o.z), laneZone: !!world.laneZone?.(o.x, o.z), medGap: gap(o.x, o.z) } : null,
      medCar: med ? { x: +med.x.toFixed(1), z: +med.z.toFixed(1), track: P(med.x, med.z) } : null, gridBack: gb ? { x: +gb.x.toFixed(1), z: +gb.z.toFixed(1), track: P(gb.x, gb.z) } : null, laneAtBack: laneSide, sides: SP.off?.ground?.sides?.map((q) => ({ sg: q.dir, room: +q.room.toFixed(1), wall: q.wall == null ? null : +q.wall.toFixed(1) })) || null });
  },
  // development (v0.46 §4): the ground around the back of the grid in the lap line's frame from the grid's rear point (u
  // along the track, + towards the grid; v across, + left = frame d): the medical car, the asphalt's edges, the first
  // barrier beyond each edge and where the pit lane is (the pit building's lane: garages to wall face – "pit"; within
  // 8 m of the measured pit path – "zone"), as intervals of v per u – the test fixture for support.js flagSpot
  flagGeom() {
    const SP = world?.support, gb = SP?.gridBack, F = world?.frame; if (!gb || !F) return "null";
    const o = F.project(gb.x, gb.z); if (!o) return "null";
    const q = [0, 0, 0], at = (u, v) => { F.at(o.s + u, v, q); return [q[0], q[2]]; }, r1 = (v) => +v.toFixed(2);
    const G = pitTeams.G, m = G ? pitModelFor(G) : null;
    const pit = (x, z) => { if (!G) return false; const pr = G.project(x, z); if (pr.u < G.gStart - 20 || pr.u > G.gEnd + 20) return false; const w = m.at(Math.max(G.gStart, Math.min(G.gEnd, pr.u))).wall; return pr.off >= -0.5 && pr.off <= (w || 0); };
    const zone = (x, z) => !!world.laneZone?.(x, z);
    const spans = (u, test) => { const out = []; let a = null; for (let v = -40; v <= 40.001; v += 0.25) { const [x, z] = at(u, v), t = test(x, z); if (t && a == null) a = v; if (!t && a != null) { out.push([r1(a), r1(v - 0.25)]); a = null; } } if (a != null) out.push([r1(a), 40]); return out; };
    const rows = []; for (let u = -24; u <= 6; u += 2) { const [x, z] = at(u, 0), [sm] = world.grid.nearest(x, z, 3); rows.push({ u, L: r1(edgeOf(sm, 1)), R: r1(edgeOf(sm, -1)), pit: spans(u, pit), zone: spans(u, zone) }); }
    const mo = SP.cars.med?.obj, mp = mo?.visible ? F.project(mo.position.x, mo.position.z) : null;
    // (the first barrier beyond each edge at the medical car's station: map's or generated, a level ray across the track)
    const targets = [world.real?.group.getObjectByName("barriers"), world.group.getObjectByName("syntheticWalls")].filter(Boolean), ray = new THREE.Raycaster();
    const wall = (u, sg) => { const e = edgeOf(F.sampleAt(o.s + u), sg), [x0, z0] = at(u, e), [x1, z1] = at(u, e + sg), d = Math.hypot(x1 - x0, z1 - z0) || 1; ray.set(new THREE.Vector3(x0, groundY(x0, z0) + 0.6, z0), new THREE.Vector3((x1 - x0) / d, 0, (z1 - z0) / d)); ray.far = 40; const h = targets.length ? ray.intersectObjects(targets, true)[0] : null; return h ? r1(h.distance) : null; };
    const mu = mp ? r1(mp.s - o.s) : -7.5;
    return JSON.stringify({ loc: app().location?.() || null, gbV: r1(o.d), med: mp ? { u: mu, v: r1(mp.d), L: mo.userData.spec?.L || 5.05, W: mo.userData.spec?.W || 1.96 } : null, wall: { L: wall(mu, 1), R: wall(mu, -1) }, rows, G: !!G });
  },
  // development: the marshal posts as placed, their flags now
  marshals() { const M = world?.marshals; if (!M) return "null"; return JSON.stringify({ info: M.info, state: M.state, flags: [...M.flags].filter(([, f]) => f.group.visible).length, N: world.samples.length, bounds: M.map?.bounds.map((b) => [b.n, b.i]), mirrors: M.map?.mirrors.map((b) => [b.n, b.i]), logical: M.map?.posts.map((p) => [p.id, p.i, p.sector, p.first ? 1 : 0]), panels: M.panels.map((p) => [p.n, p.sig ?? null, p.cell, +p.x.toFixed(1), +p.z.toFixed(1), p.i]), posts: M.posts.slice(0, 80).map((p) => [p.id, p.sector, +p.x.toFixed(1), +p.z.toFixed(1), +groundY(p.x, p.z).toFixed(1), p.first ? 1 : 0, p.i]) }); },
  // development: the harbour's yachts as laid out (per zone: count, lengths)
  // development: the camera on a marshal post (its id) or a light panel ("P" + number) from the track a little before it –
  // returns the look() arguments used (to frame the same view in another build)
  // development: face to face with post k's marshals (dist m in front of them, h up)
  viewPost(k = 0, dist = 4, h = 1.6, fov = 40) {
    const p = world?.marshals?.posts?.[k]; if (!p) return "no post";
    const y = groundY(p.x, p.z), a = [p.x + p.face.x * dist, y + h, p.z + p.face.z * dist, p.x, y + 1.2, p.z, fov];
    window.Map3D.look(...a); return p.id + " " + JSON.stringify(a.map((v) => +v.toFixed(2)));
  },
  viewMarshal(id, back = 24, h = 4, fov = 45) {
    const M = world?.marshals; if (!M) return "no marshals";
    const p = /^P\d+$/.test(id) ? M.panels.find((q) => "P" + q.n === id) : M.posts.find((q) => q.id === id); if (!p) return "not drawn";
    const sm = world.samples[p.i], y = groundY(p.x, p.z), a = [sm.p.x - sm.tan.x * back, sm.p.y + h, sm.p.z - sm.tan.z * back, p.x, y + 1.6, p.z, fov];
    window.Map3D.look(...a); return JSON.stringify(a.map((v) => +v.toFixed(2)));
  },
  // development: pairs of yachts whose hulls overlap (oriented rectangles; margin m each side) and hulls over land
  harbourCheck(margin = 0) { const H = world?.harbour; if (!H?.list) return JSON.stringify({ yachts: 0 }); const L = H.list, pairs = []; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (hullsOverlap(L[i], L[j], margin)) pairs.push([L[i].zone, L[j].zone, Math.round(L[i].L), Math.round(L[j].L), +Math.hypot(L[i].x - L[j].x, L[i].z - L[j].z).toFixed(1)]); let land = 0; for (const y of L) { const ux = Math.sin(y.yaw), uz = Math.cos(y.yaw); for (const f of [-0.3, 0, 0.5]) for (const s of [-0.5, 0.5]) if (!world.real.isSea(y.x + ux * f * y.L - uz * s * y.B, y.z + uz * f * y.L + ux * s * y.B)) land++; } return JSON.stringify({ yachts: L.length, overlaps: pairs.length, pairs: pairs.slice(0, 20), landPoints: land }); },
  harbour() { const H = world?.harbour; if (!H?.list) return JSON.stringify({ yachts: 0 }); const z = {}; for (const y of H.list) { const e = z[y.zone] || (z[y.zone] = { n: 0, L: [] }); e.n++; e.L.push(Math.round(y.L)); } return JSON.stringify({ yachts: H.list.length, seaY: +world.real.seaLevel.toFixed(2), zones: z, first: H.list.slice(0, 3).map((y) => [+y.x.toFixed(1), +y.z.toFixed(1)]) }); },
  // development (v0.49, garagecheck.js): real-size cars parked at the chosen teams' car work spaces (garages.js
  // garageZones), wire boxes of the car (green clear / red hit), the bay's pillars, lintel, walls, partition, ceiling, and
  // what it hits, and the report (JSON). o: { teams: ["McLaren"] (default: every team), park, boxes, clear: true – remove }
  async garageCheck(o = {}) {
    const old = scene.getObjectByName("garageCheck"); if (old) { scene.remove(old); disposeGroup(old); }
    if (o.clear) return "cleared";
    const G = pitTeams.G; if (!G || !pitTeams.zones) return JSON.stringify({ G: !!G, zones: !!pitTeams.zones });
    const { garageCheckScene } = await import("./garagecheck.js"), A = app();
    const drivers = game ? game.drivers() : A.src?.state.DriverList || {};
    const r = await garageCheckScene({ G, zones: pitTeams.zones, layer: pitTeams.group, teams: o.teams || null, drivers, season: A.sessionYear?.() || null, date: sessionDate(), park: o.park !== false, boxes: o.boxes !== false, extra: pitKit ? (sl) => pitKit.boxesFor(sl.k) : null });
    scene.add(r.group);
    const zs = pitTeams.zones.filter((z) => !o.teams || o.teams.includes(z.team));
    // (game: each team's box where the engine stops its cars against the box painted in the lane – v0.48 A1 / A2)
    let engineBoxes = null;
    if (game) { const P = game.scenario?.track?.pit, ent = new Map((game.scenario?.entries || []).map((e) => [e.team, e.teamKey]));
      engineBoxes = (pitTeams.teams || []).map((t) => { const bu = P?.boxes?.[ent.get(t.team)]; if (bu == null || t.box == null) return [t.team, null, t.box]; const pp = pitPoint(P, bu, world.center), pr = G.project(pp.x, pp.z); return [t.team, +pr.u.toFixed(2), +t.box.toFixed(2), +(pr.u - t.box).toFixed(2)]; }); }
    return JSON.stringify({ facility: G.facility || null, engineBoxes, plan: G.plan ? { built: G.plan.built, blocked: G.plan.blocked || null, folds: G.plan.folds || null } : null, cars: r.report,
      zones: zs.map((z) => ({ team: z.team, kind: z.kind, slot: z.slot, num: z.num, w: +z.w.toFixed(2), width: +z.width.toFixed(2), depth: +z.depth.toFixed(2), back: +(+z.back).toFixed(2), doorW: z.doorW && +z.doorW.toFixed(2), doorH: z.doorH && +z.doorH.toFixed(2), ceilingH: z.ceilingH && +z.ceilingH.toFixed(2), lowest: z.lowest, floorY: +z.floorY.toFixed(3), depthFrom: z.depthFrom, walk: z.walk, fits: z.carSpot?.fits ?? null, box: z.box || null })) });
  },
  // development (v0.49): the garage interior kit in the team bays – on / off (off: the teams' layer draws its own simple
  // equipment, as before the kit: before / after pictures at the same camera); returns the kit's state
  garageKit(on, o = {}) {
    const light = o.light ?? garageKitLight;
    if ((on != null && !!on !== garageKitOn) || !!light !== garageKitLight) { if (on != null) garageKitOn = !!on; garageKitLight = !!light; clearPitTeams(); updatePitTeams(true); }
    return JSON.stringify({ on: garageKitOn, kit: pitKit ? pitKit.state() : null });
  },
  // development: every bay of the pit building as built – its width, depth, back area, the building's depth behind it
  garageBays() {
    const G = pitTeams.G || (() => { let g = null; world?.real?.group.getObjectByName("facilities")?.traverse((x) => { if (!g && x.userData?.garages) g = x.userData.garages; }); return g; })();
    if (!G) return JSON.stringify({ G: false });
    return JSON.stringify({ facility: G.facility || null, depth: +G.depth.toFixed(2), plan: G.plan || null, slots: G.slots.map((s) => [s.k, +s.uc.toFixed(1), +s.width.toFixed(2), +s.depth.toFixed(2), s.back, s.building, +s.floor.toFixed(2), s.depthFrom, s.bay?.label || null]) });
  },
  pitCar(num) {
    const G = pitTeams.G, c = cars.get(String(num)); if (!G || !c) return JSON.stringify({ G: !!G, car: !!c });
    const p = G.project(c.pos.x, c.pos.z), r = c.feedPos ? G.project(c.feedPos.x, c.feedPos.z) : null, team = app().src?.state.DriverList?.[num]?.TeamName;
    return JSON.stringify({ t: app().t, u: +p.u.toFixed(1), off: +p.off.toFixed(2), feedOff: r && +r.off.toFixed(2), speed: +c.speed.toFixed(1), box: pitTeams.teams?.find((x) => x.team === team)?.box ?? null, gStart: Math.round(G.gStart), gEnd: Math.round(G.gEnd),
      state: c.pit?.state?.state || null, lane: c.pit?.state?.lane || null, w: c.pit?.state ? +c.pit.state.w.toFixed(2) : null, evidence: c.pit?.state?.evidence || null, fastC: c.pit?.at ? +c.pit.at.fastC.toFixed(2) : null, boxC: c.pit?.at ? +c.pit.at.boxC.toFixed(2) : null,
      lastBox: c.pit?.input?.lastBox || null, stillFor: c.pit?.input ? +c.pit.input.stillFor.toFixed(1) : null, tel: app().src?.carAt?.(String(num), app().t)?.speed ?? null,
      yOverFloor: c.pit?.at ? +(c.obj.position.y - c.pit.at.floor).toFixed(3) : null, inRun: c.pit?.inRun != null ? +c.pit.inRun.toFixed(2) : null,
      spot: c.pit?.spot ? { slot: c.pit.spot.slot, w: c.pit.spot.w, d: c.pit.spot.carSpot.d, fits: c.pit.spot.carSpot.fits, off: +Math.hypot(c.obj.position.x - c.pit.spot.carSpot.x, c.obj.position.z - c.pit.spot.carSpot.z).toFixed(2) } : null, yawDeg: +(c.yaw * 57.3).toFixed(1), crews: world.crews ? world.crews.group.children.reduce((a, m) => a + m.count, 0) : 0 });
  },
  // development: what is seen at screen point (x, y: −1…1) – the first few objects a ray from the camera meets, named
  // by their nearest named parent, with the distance and whether their material is shown
  // development (v0.44 §3): spiky ground beside the road – terrainscan.js over the drawn terrain grid (vertices standing
  // out of their neighbours) and over every mesh of the world near the track (steep thin triangles rising over the road,
  // up-facing surfaces turned over), plus the rocks' instances near the road. → JSON (scene x, y, z and lat/lon)
  async terrainScan(maxD = 40, top = 25, minDev = 2.5) {
    const R = world?.real; if (!R?.terrainAt) return "no map";
    const { gridSpikes, triScan } = await import("./terrainscan.js");
    const roadAt = (x, z) => { const [s] = world.grid.nearest(x, z, 2); if (!s) return null; const l = (x - s.p.x) * s.nor.x + (z - s.p.z) * s.nor.z; return { y: s.p.y, d: l >= 0 ? l - edgeOf(s, 1) : -l + edgeOf(s, -1), i: s.i }; };
    const f = (v) => +v.toFixed(2), ll = (x, z) => R.geo.toLL(x, z).map((v) => +v.toFixed(6));
    const ter = R.group.getObjectByName("terrain"), b = R.bounds, nx = Math.round((b.x1 - b.x0) / R.terrainCell[0]), nz = Math.round((b.z1 - b.z0) / R.terrainCell[1]);
    const P = ter.geometry.attributes.position.array;
    const sp = gridSpikes(P, nx, nz, 3, 1, (i, j) => [P[(j * (nx + 1) + i) * 3], P[(j * (nx + 1) + i) * 3 + 2]], roadAt, { maxD, minDev });
    const meshes = {}, tmp = new THREE.Vector3();
    world.group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry?.attributes?.position) return;
      const path = []; for (let p = o; p && p !== world.group; p = p.parent) path.push(p.name || p.type);
      const key = path.reverse().join("/"), A = o.geometry.attributes.position, W = new Float32Array(A.count * 3); o.updateWorldMatrix(true, false);
      for (let k = 0; k < A.count; k++) { tmp.fromBufferAttribute(A, k).applyMatrix4(o.matrixWorld); W[k * 3] = tmp.x; W[k * 3 + 1] = tmp.y; W[k * 3 + 2] = tmp.z; }
      const up = /terrain|auxTarmac|road|kerb|ground/i.test(key), hits = triScan(W, o.geometry.index?.array || null, roadAt, { maxD, upFacing: up });
      if (!hits.length) return;
      const m = meshes[key] || (meshes[key] = { spike: 0, down: 0, thin: 0, worst: [] });
      for (const h of hits) m[h.flag]++;
      m.worst.push(...hits.sort((a, c) => c.rise - a.rise).slice(0, top).map((h) => ({ flag: h.flag, t: h.t, ll: ll(h.cx, h.cz), rise: f(h.rise), road: f(h.road), d: f(h.d), ny: f(h.ny), thin: f(h.thin), s: h.s, v: h.v.map((q) => q.map(f)) })));
      m.worst = m.worst.sort((a, c) => c.rise - a.rise).slice(0, top);
    });
    const rocks = []; R.group.traverse((o) => { if (o.name !== "rocks" || !o.isInstancedMesh) return; const M = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); for (let k = 0; k < o.count; k++) { o.getMatrixAt(k, M); M.decompose(p, q, s); const r = roadAt(p.x, p.z); if (r && r.d < maxD) rocks.push({ k, ll: ll(p.x, p.z), x: f(p.x), y: f(p.y), z: f(p.z), size: f(Math.max(s.x, s.y, s.z)), above: f(p.y - r.y), d: f(r.d) }); } });
    return JSON.stringify({ grid: { nx, nz, cell: R.terrainCell.map(f), n: sp.length, peaks: sp.filter((v) => v.peak).length, pits: sp.filter((v) => v.pit).length,
      worst: sp.slice(0, top).map((v) => ({ ij: [v.i, v.j], ll: ll(v.x, v.z), xyz: [f(v.x), f(v.y), f(v.z)], med: f(v.med), dev: f(v.dev), peak: v.peak, pit: v.pit, road: f(v.road), d: f(v.d), s: v.s })) },
      meshes, rocks: { n: rocks.length, list: rocks.sort((a, c) => a.d - c.d).slice(0, top) },
      // the lap's height every 20 samples, and the stretches of the lap that pass close by another at another height
      profile: world.samples.filter((s) => s.i % 20 === 0).map((s) => [s.i, f(s.p.y)]),
      stacked: (() => { const out = []; for (const s of world.samples) { if (s.i % 4) continue; let best = null; for (const q of world.samples) { const di = Math.abs(q.i - s.i); if (Math.min(di, world.n - di) < 60 || Math.abs(q.p.y - s.p.y) < 3) continue; const d = Math.hypot(q.p.x - s.p.x, q.p.z - s.p.z); if (d < 70 && (!best || d < best[1])) best = [q, d]; } if (best && s.i < best[0].i) out.push([s.i, best[0].i, f(best[1]), f(best[0].p.y - s.p.y), ll(s.p.x, s.p.z)]); } return out; })() });
  },
  // development: show / hide the real surroundings' parts by name ("buildings,landmarks,trees") and draw the terrain as
  // its wireframe – for seeing the ground's own triangles
  partsShown(names, v = false) { const R = world?.real; if (!R) return "no map"; const set = names.split(","); for (const c of R.group.children) if (set.includes(c.name)) c.visible = !!v; return R.group.children.map((c) => c.name + (c.visible ? "" : "(off)")).join(","); },
  // development: the first mesh triangle under a screen point (−1..1): the mesh's path, the triangle's corners (scene) and
  // the lap sample nearest each corner with its road height
  // development: one line per circuit – the terrain poking through the tarmac, sheer faces near the road (> 5 and > 10 m
  // across one grid edge, on land off the tarmac – under a road its own walls stand), stacked
  // stretches of the lap, what roadground.js changed (Map3D.roadJoin(false) for the ground as before)
  async terrainSummary(maxD = 40) {
    const R = world?.real; if (!R?.terrainAt) return "no map";
    const { pokeThrough, gridSteps, gridSpikes } = await import("./terrainscan.js"), { roadProbes } = await import("./roadground.js");
    const roadAt = (x, z) => { const [s] = world.grid.nearest(x, z, 2); if (!s) return null; const l = (x - s.p.x) * s.nor.x + (z - s.p.z) * s.nor.z; return { y: s.p.y, d: l >= 0 ? l - edgeOf(s, 1) : -l + edgeOf(s, -1), i: s.i }; };
    const ter = R.group.getObjectByName("terrain"), b = R.bounds, nx = Math.round((b.x1 - b.x0) / R.terrainCell[0]), nz = Math.round((b.z1 - b.z0) / R.terrainCell[1]), P = ter.geometry.attributes.position.array;
    const xz = (i, j) => [P[(j * (nx + 1) + i) * 3], P[(j * (nx + 1) + i) * 3 + 2]], f = (v) => +v.toFixed(2), ll = (a) => a && R.geo.toLL(...a).map((v) => +v.toFixed(5));
    const poke = pokeThrough(roadProbes(world.samples, edgeOf), R.terrainAt), L = Float32Array.from(P), _sea = (() => { for (let k = 0; k < L.length; k += 3) { const r = roadAt(L[k], L[k + 2]); if (R.isSea?.(L[k], L[k + 2]) || (r && r.d < 0.5)) L[k + 1] = NaN; } })(), steps = gridSteps(L, nx, nz, 3, 1, xz, roadAt, { maxD }), steps10 = gridSteps(L, nx, nz, 3, 1, xz, roadAt, { maxD, minStep: 10 }), spikes = gridSpikes(P, nx, nz, 3, 1, xz, roadAt, { maxD, minDev: 2.5 });
    let stacked = 0, maxDy = 0; for (const s of world.samples) { if (s.i % 4) continue; for (const q of world.samples) { const di = Math.abs(q.i - s.i); if (Math.min(di, world.n - di) < 60) continue; const dy = Math.abs(q.p.y - s.p.y); if (dy >= 3 && Math.hypot(q.p.x - s.p.x, q.p.z - s.p.z) < 40) { stacked++; maxDy = Math.max(maxDy, dy); break; } } }
    const w = R.group.getObjectByName("roadWalls");
    return JSON.stringify({ loc: app().location?.(), join: devRoadJoin, poke: { n: poke.n, worst: f(poke.worst), at: ll(poke.at) }, steps: { n: steps.n, n10: steps10.n, worst: f(steps.worst), at: ll(steps.at) }, spikes: { n: spikes.length, peaks: spikes.filter((v) => v.peak).length }, stacked: { samples: stacked * 4, maxDy: f(maxDy) }, roadGround: R.info?.roadGround ?? null, buildMs: R.info?.ms?.total ?? null, wallTris: w ? w.geometry.index.count / 3 : 0 });
  },
  hitTri(x = 0, y = 0) {
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(x, y), camera);
    const h = rc.intersectObject(world.group, true).find((q) => q.object.isMesh && q.face); if (!h) return "nothing";
    const o = h.object, A = o.geometry.attributes.position, path = []; for (let p = o; p && p !== world.group; p = p.parent) path.push(p.name || p.type);
    const v = [h.face.a, h.face.b, h.face.c].map((k) => { const p = new THREE.Vector3().fromBufferAttribute(A, k).applyMatrix4(o.matrixWorld), [s, d] = world.grid.nearest(p.x, p.z, 2); return [k, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), s?.i ?? null, s ? +s.p.y.toFixed(2) : null, +d.toFixed(1)]; });
    return JSON.stringify({ mesh: path.reverse().join("/"), dist: +h.distance.toFixed(2), face: h.faceIndex, v });
  },
  terrainWire(on = true) { const t = world?.real?.group.getObjectByName("terrain"); if (!t) return "no map"; t.material.wireframe = !!on; return "ok"; },
  hitAt(x = 0, y = 0) {
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(x, y), camera); rc.camera = camera;
    const name = (o) => { const out = []; let q = o; while (q && out.length < 3) { if (q.name) out.push(q.name); q = q.parent; } return out.join("<") || o.type; };
    return JSON.stringify(rc.intersectObject(scene, true).filter((h) => !h.object.isSprite).slice(0, 5).map((h) => [name(h.object), +h.distance.toFixed(2), h.object.visible, h.object.receiveShadow ? "rx" : "-", h.object.castShadow ? "cast" : "-", h.object.material?.type]));
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
      // (the lap's nearest sample to where the floor's tarmac height is taken – 1.5 m out from the front: scenery.js surfaceAt)
      const [nx, nz] = at(1.5), [ns, nd] = world.grid.nearest(nx, nz, 6), near = ns ? [ns.i, +(ns.p.y - s.floor).toFixed(2), +nd.toFixed(1)] : null;
      rows.push({ k, u: Math.round(s.uc), floor: +s.floor.toFixed(2), groundOver: gr, path, edge, wallOff, trackOverFloor: trackY, near });
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
  // development (v0.46): the pit wall across at each team's stand – level lines out from the garages' front at its box,
  // at the seated people's heights over the stand's deck, through the map's barriers, the facility (its wall, fence,
  // walkway railing) and the generated walls; the stand's footprint (garages.js pitWallStand: its deck 0.85 m to the
  // lane side of wallAt's point, its console 0.75 m to the track side), the lane's face and the track's edge – judged by
  // pitwallcheck.js (lane | stand | wall | track)
  pitWallOrder(detail = false) {
    const G = pitTeams.G; if (!G || !pitTeams.teams) return JSON.stringify({ ok: false, why: "no garages" });
    const F = world.frame, rc = new THREE.Raycaster(); rc.camera = camera;
    const targets = [world.real?.group.getObjectByName("barriers"), world.real?.group.getObjectByName("facilities"), world.group.getObjectByName("syntheticWalls")].filter(Boolean);
    const secs = [];
    for (const t of pitTeams.teams) {
      // (its length as built – the layer's record: pitTeams.teams is re-derived on every update without t.wallStand, so
      // v0.46 measured every stand as 6 seats, 5.4 m – a 4-seat stand's phantom ends met the walkway's railing once it
      // opened only in front of the stand: v0.47 run/stands)
      const built = (pitTeams.group?.userData.wallStands || []).find((q) => q.team === t.team);
      const L = built ? built.L : (t.wallStand?.seats ?? 6) * 0.8 + 0.6, w = t.box != null && G.wallAt?.(t.box, L / 2); if (!w) continue;
      // (where the stand is – it may stand a little along the wall from its box: facilities.js wallAt)
      const uc = G.project(w.p[0], w.p[2]).u, s = G.slots.reduce((p, q) => (Math.abs(q.uc - uc) < Math.abs(p.uc - uc) ? q : p)), out = [-s.inward[0], -s.inward[1]], across = [];
      // (across the stand's length every 0.5 m, from 0.25 m in at either end – not one line at its middle: a line through
      // the joint of two map pieces misses both, a v0.46 false "no wall" at Mexico City's Mercedes stand; an opening
      // 0.5 m wide or more anywhere behind or in front of a stand is met)
      for (let a = -L / 2 + 0.25; a <= L / 2 - 0.25 + 1e-6; a += 0.5) {
        const at = (d) => [s.front[0] + s.along[0] * (uc + a - s.uc) + out[0] * d, s.front[1] + s.along[1] * (uc + a - s.uc) + out[1] * d];
        let edge = null; for (let d = 0; d < 60; d += 0.25) { const [x, z] = at(d), pr = F.project(x, z); if (pr && Math.abs(pr.d) <= (pr.d >= 0 ? edgeOf(pr.sample, 1) : -edgeOf(pr.sample, -1))) { edge = d; break; } }
        const hits = [];
        // (at the seated people's heights over the stand's deck; and at 0.6 m over the lane – under a raised stand, for the wall)
        for (const [y, low] of [[w.p[1] + 0.72, false], [w.p[1] + 1.12, false], [w.p[1] + 1.72, false], [s.floor + 0.6, true]]) {
          // (both ways: a one-sided face is met only from its front – the wall's faces the track)
          for (const [o0, dir] of [[0.3, 1], [60, -1]]) {
            const [x, z] = at(o0); rc.set(new THREE.Vector3(x, y, z), new THREE.Vector3(out[0] * dir, 0, out[1] * dir)); rc.far = 59.7;
            for (const h of rc.intersectObjects(targets, true)) if (h.object.visible !== false && !h.object.isSprite && !h.object.isInstancedMesh) hits.push({ off: o0 + dir * h.distance, name: h.object.name || h.object.parent?.name || h.object.type, low });
          }
        }
        // (all in the garages' frame there – G.project: metres out from that garage's front; the fronts step in and out
        // from one garage to the next, the lines above run from the box's garage's front line, the stand is straight)
        const [x0, z0] = at(0), dl = G.project(x0, z0).off, cl = G.project(w.p[0] + w.along[0] * a, w.p[2] + w.along[1] * a).off;
        for (const h of hits) h.off += dl;
        // (a stand upstairs, in its room – Monaco: from behind its stools to the glazing, garages.js upperStandLayout)
        across.push({ a: +a.toFixed(2), stand: built?.upper && built.span ? [cl - built.span[1], cl - built.span[0]] : [cl - 0.85, cl + 0.75], lane: G.wallFace ? G.wallFace(uc + a) : null, edge: edge == null ? null : edge + dl, hits, upper: !!w.upper });
      }
      secs.push({ team: t.team, u: Math.round(t.box), at: Math.round(uc), across, standY: +(w.p[1] - s.floor).toFixed(2) });
    }
    const v = circuitVerdict(secs);
    const row = (r, s) => ({ team: r.team, u: s.u, standAt: s.at, ok: r.ok, order: r.order, problems: r.problems, standY: s.standY, ...(r.worst ? { worst: r.worst } : {}) });
    return JSON.stringify({ ok: true, facility: G.facility, wallFrom: G.wallFrom ?? null, stands: v.stands, wrong: v.wrong, problems: v.problems,
      first: v.res[0] && row(v.res[0], secs[0]), wrongOnes: v.res.map((r, i) => [r, secs[i]]).filter(([r]) => !r.ok).slice(0, detail ? 99 : 2).map(([r, s]) => row(r, s)), all: detail ? v.res.map((r, i) => row(r, secs[i])) : undefined });
  },
  // development (v0.53): the teams' stands upstairs (Monaco) against the room they stand in – pitwallcheck.js
  // upperStandCheck on each stand as built, and rays through the drawn facility at each: down from a seated person's hips
  // (the floor under them), up (the ceiling), out to the lane (the glazing), and up from the lane 0.5 m out from the
  // garages' front (the first floor's slab over it – the room not floating: on the top of the garages' openings)
  async upperCheck() {
    const G = pitTeams.G; if (!G) return JSON.stringify({ ok: false, why: "no garages" });
    const built = (pitTeams.group?.userData.wallStands || []).filter((q) => q.upper);
    if (!G.upperRoom) return JSON.stringify({ ok: !built.length, why: "no room upstairs", upperStands: built.length });
    const { upperStandCheck } = await import("./pitwallcheck.js");
    const fac = world.real?.group.getObjectByName("facilities"), rc = new THREE.Raycaster(), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const first = (o, d, far = 8) => { rc.set(o, d); rc.far = far; const team = (o) => { for (let q = o; q; q = q.parent) if (q.name === "pitTeams") return true; return false; };
      const h = fac ? rc.intersectObject(fac, true).filter((x) => x.object.visible !== false && x.object.isMesh && !x.object.isInstancedMesh && !team(x.object))[0] : null; return h ? [h.object.name || h.object.parent?.name, +h.distance.toFixed(3)] : null; };
    const rows = built.map((st) => {
      const r = upperStandCheck(st, G.upperRoom, G.project), [x, y, z] = st.people[0], pr = G.project(st.p[0], st.p[1]), rm = G.upperRoom(pr.u);
      const lane = (d) => { const s = G.slots.reduce((p, q) => (Math.abs(q.uc - pr.u) < Math.abs(p.uc - pr.u) ? q : p)); return V(s.front[0] - s.inward[0] * d + s.along[0] * (pr.u - s.uc), s.floor + 1, s.front[1] - s.inward[1] * d + s.along[1] * (pr.u - s.uc)); };
      const rays = { down: first(V(x, y + 0.3, z), V(0, -1, 0)), up: first(V(x, y + 0.3, z), V(0, 1, 0)), out: first(V(x, y + 1.2, z), V(-st.out[0], 0, -st.out[1]), 4), slabOverLane: first(lane(0.5), V(0, 1, 0), 8) };
      // (expected: the floor 0.29 m under the hips' ray, the ceiling, the glazing ~1.15 m out, the slab G − 1 m over the lane)
      // (out: the glass in front of the person – the console's lane face is 1.01 m ahead of the seat, the glass beyond it)
      const pr0 = G.project(x, z), rp = G.upperRoom(pr0.u), toGlass = rp.glass - pr0.off;
      const want = { down: ["garFloor", 0.29], up: ["garCeil", +(rp.ceil - y - 0.3).toFixed(3)], out: ["roomGlass", +toGlass.toFixed(3), 0.2], slabOverLane: ["slab", +(rm.under - lane(0.5).y).toFixed(3)] };
      for (const k of Object.keys(want)) if (!rays[k] || rays[k][0] !== want[k][0] || Math.abs(rays[k][1] - want[k][1]) > (want[k][2] ?? 0.05)) r.problems.push(`${st.team}: ray ${k} met ${rays[k] ? rays[k].join(" @ ") : "nothing"}, not ${want[k].join(" @ ")}`);
      return { team: st.team, ok: !r.problems.length, problems: r.problems, floorY: +(y - rm.floor).toFixed(3), rays };
    });
    return JSON.stringify({ ok: rows.every((q) => q.ok), stands: rows.length, bad: rows.filter((q) => !q.ok).length, rows });
  },
  // development (v0.47): the map's walls at both stages (mapwalls.js – the candidates barrierRay searched, the final ones
  // drawn): lines, segments, how many crossed the road / pit lane in their middle, test points cut by the road and the lane
  mapWalls() { return JSON.stringify(world?.real?.mapWalls || null); },
  // development (v0.47): look down at the i-th recorded map wall segment that crossed the road in its middle or had a cut
  // end (stage "final" or "candidate"), from `h` m over the track's height nearest it
  viewMapWall(i = 0, stage = "final", h = 40, fov = 50, back = 25) {
    const w = world?.real?.mapWalls?.[stage]?.where?.[i]; if (!w) return "none";
    const [s] = world.grid.nearest(w[2], w[3], 6), y = s ? s.p.y : 0;
    // (returns the camera as a Map3D.look call too: the same view in another build – before / after pictures)
    const v = [w[2], y + h, w[3] + back, w[2], y, w[3], fov].map((x) => +x.toFixed(2)); this.look(...v); return `${JSON.stringify(w)} Map3D.look(${v.join(", ")})`;
  },
  // development (v0.47): the teams' stands against each other – overlaps, order, the walkway's ends, the railing opened
  // in front of them, the lane and the cars' path (standcheck.js judges; each stand as garages.js built it). dump: the
  // plain input too (a test fixture)
  async standCheck(detail = false, dump = false) {
    const G = pitTeams.G; if (!G || !pitTeams.teams) return JSON.stringify({ ok: false, why: "no garages" });
    const { checkStands, PARTS } = await import("./standcheck.js"), { CREW_ROOM } = await import("./pitlane.js");
    const u0 = G.project(0, 0).u, ux = G.project(1, 0).u - u0, uz = G.project(0, 1).u - u0, axis = { o: [-u0 * ux, -u0 * uz], u: [ux, uz] };
    const m = pitModelFor(G), lane = world.pitLane, r3 = (x) => +x.toFixed(3);
    const feedOff = (u) => { if (!lane) return null; let best = 6, off = null; for (const q of lane.pts) { const pr = G.project(q.x, q.z), d = Math.abs(pr.u - u); if (d < best) { best = d; off = pr.off; } } return off; };
    // (the stands as the layer built them – pitTeams.teams is re-derived on every update, the layer only when the allocation changes)
    const built = pitTeams.group?.userData.wallStands || [], boxes = built.map((t) => [t.box - 2.87, t.box + 2.87, t.boxOff + 1.17]);
    const stands = [];
    for (const w of built) {
      const t = w;
      const parts = PARTS(w.L, w.enclosed).filter((q) => q.low), across = [];
      // (across its length every 0.25 m, the step's end included: the lane side of what stands there – deck, step, posts)
      if (!w.upper) for (let a = -w.L / 2 - 0.05; a <= w.L / 2 + 0.55; a += 0.25) {
        const o = Math.max(...parts.filter((q) => Math.abs(a - q.a) <= q.la / 2 + 1e-6).map((q) => q.o + q.lo / 2)); if (!Number.isFinite(o)) continue;
        const x = w.p[0] + w.along[0] * a + w.out[0] * o, z = w.p[1] + w.along[1] * a + w.out[1] * o, pr = G.project(x, z), u = pr.u, uu = Math.max(G.gStart, Math.min(G.gEnd, u));
        const cs = m.at(uu), f = feedOff(u), car = laneOffsetOf({ lane: "fast", w: 0 }, cs, f ?? cs.fastC, u, G.gStart, G.gEnd), bx = boxes.filter((b) => u >= b[0] && u <= b[1]);
        const dk = Math.abs(a) <= w.L / 2 - 0.25 + 1e-6 ? G.project(w.p[0] + w.along[0] * a + w.out[0] * 0.85, w.p[1] + w.along[1] * a + w.out[1] * 0.85).off : null;
        across.push({ a: r3(a), u: r3(u), standLane: r3(pr.off), deckLane: dk == null ? null : r3(dk), laneFace: G.wallFace ? r3(G.wallFace(uu)) : null, carEdge: r3(car + CREW_ROOM.carHalf), boxEdge: bx.length ? r3(Math.max(...bx.map((b) => b[2]))) : null, feedEdge: f == null ? null : r3(f + CREW_ROOM.carHalf) });
      }
      stands.push({ team: t.team, box: r3(t.box), L: w.L, p: w.p.map(r3), along: w.along.map((x) => +x.toFixed(5)), out: w.out.map((x) => +x.toFixed(5)), enclosed: w.enclosed, upper: w.upper, across });
    }
    // (the walkway railing as drawn: the rail mesh's quads out at the lane's face – the building's balustrades share the
    // mesh –, each shown or left out of its index; not railU, which says what openRail meant to do)
    const railDrawn = () => {
      const rm = pitTeams.facility?.getObjectByName("rail"); if (!rm) return [];
      const pos = rm.geometry.attributes.position, ix = rm.geometry.index, shown = new Set(), out = [];
      if (ix) for (let k = 0; k < ix.count; k += 6) shown.add(Math.floor(ix.getX(k) / 6));
      for (let q = 0; q < pos.count / 6; q++) {
        let u0 = Infinity, u1 = -Infinity, off = 0;
        for (let k = 0; k < 6; k++) { const pr = G.project(pos.getX(q * 6 + k), pos.getZ(q * 6 + k)); u0 = Math.min(u0, pr.u); u1 = Math.max(u1, pr.u); off += pr.off / 6; }
        const wf = G.wallFace?.(Math.max(G.gStart, Math.min(G.gEnd, (u0 + u1) / 2)));
        if (wf != null && Math.abs(off - wf) < 0.6 && u1 - u0 > 0.05) out.push([r3(u0), r3(u1), !ix || shown.has(q) ? 1 : 0]);
      }
      return out.sort((a, b) => a[0] - b[0]);
    };
    const input = { axis: { o: axis.o.map(r3), u: axis.u.map((x) => +x.toFixed(6)) }, wall: G.railU?.length ? [r3(G.railU[0][0]), r3(G.railU[G.railU.length - 1][1])] : null, run: [r3(G.gStart), r3(G.gEnd)],
      rail: railDrawn(), spans: (pitTeams.group?.userData.standSpans || []).map(([a, b]) => [r3(a), r3(b)]), stands };
    const v = checkStands(input);
    return JSON.stringify({ ok: true, facility: G.facility, wallFrom: G.wallFrom ?? null, stands: v.stands, bad: v.problems.length, problems: v.problems, nMoved: v.nMoved, maxMove: v.maxMove, minGap: v.minGap, minCarGap: v.minCarGap,
      rail: v.rail && { segments: v.rail.segments, open: v.rail.open, openM: v.rail.openM, maxBeyond: v.rail.maxBeyond, beyond: detail ? v.rail.beyond : undefined, through: v.rail.through },
      tight: v.tight, overlaps: v.overlaps, order: v.order, ends: v.ends, moved: detail ? v.moved : v.moved.filter((q) => Math.abs(q.du) > 0.25), gaps: detail ? v.gaps : undefined, lane: detail ? v.lane : undefined, ...(dump ? { input, model: { pitch: r3(G.pitch), slots: m.st.map((x) => [r3(x.s.uc), x.cs.wall == null ? null : r3(x.cs.wall), x.cs.fastC == null ? null : r3(x.cs.fastC)]) } } : {}) });
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
    // (returns the camera as a Map3D.look call: the same view again in another build – before / after pictures)
    const a = [s.front[0] - ix * back + s.along[0] * side, s.floor + h, s.front[1] - iz * back + s.along[1] * side, s.front[0] + ix * 3, s.floor + 2, s.front[1] + iz * 3, fov].map((x) => +x.toFixed(2));
    this.look(...a); return `Map3D.look(${a.join(", ")})`;
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
  // development: the covered stretches (tunnel.js) – where they were placed, the buildings raised over them, the mask
  tunnel() {
    const T = world?.real?.tunnel; if (!T) return JSON.stringify({ tunnel: null });
    return JSON.stringify({ info: T.info, mask: T.mask ? { w: T.mask.tex.image.width, h: T.mask.tex.image.height, ext: T.mask.ext.toArray().map((v) => +v.toFixed(1)) } : null,
      stations: T.stations.map((S) => ({ n: S.length, len: +S[S.length - 1].s.toFixed(1), y0: +S[0].y.toFixed(2), y1: +S[S.length - 1].y.toFixed(2), sea: +S[Math.floor(S.length / 2)].sea.toFixed(1), hill: +S[Math.floor(S.length / 2)].hill.toFixed(1) })) });
  },
  // development: night on / off / auto ("on" | "off" | "auto") and the real map built again with it
  nightMode(mode) { saveGeoSettings({ ...geoSettings(), night: mode }); rebuild(); return "ok"; },
  // development: the weather state at the moment shown (weather.js / weather3d.js) – measured (raining, records) and
  // estimated (wet, rainAmt, cloud) – and the roofs that keep rain off; weather({ rain, wet, cloud }) forces a look for
  // testing (marked forced: true), weather(null) gives it back to the feed; weather({ sky }) sets the sky setting
  weather(o) {
    if (o === null) wx?.force(null); else if (o && typeof o === "object") { if (o.sky) wx?.configure({ sky: o.sky }); if ("rain" in o || "wet" in o || "cloud" in o) wx?.force(o); }
    const e = wx?.env || {}, r = (v) => (typeof v === "number" ? +v.toFixed(3) : v);
    return JSON.stringify({ t: e.t, raining: e.raining, rainAmt: r(e.rainAmt), wet: r(e.wet), wetModel: r(e.wetModel), wetSpan: r(e.wetSpan), wetStart: e.wetStart, wetTyres: r(e.wetTyres), wetSrc: e.wetSrc, wetCovered: r(e.wetCovered), log: wx?.log ? { n: wx.log.size, refused: wx.log.refused } : null, liveRecords: window.F1KR?.src?.weather?.length ?? null, cloud: r(e.cloud), cloudSrc: e.cloudSrc, cloudData: e.cloudData,
      air: e.airTemp, track: e.trackTemp, hum: e.humidity, wind: [e.windSpeed, e.windDir], forced: e.forced, night: nightNow, covers: wx?.info });
  },
  // development: the session times (ms, from t0 to t1 every `step`) at which car `num` is in or near covered stretch 0 –
  // [t, metres along from its entry] for each – to find a car driving through (the cars stepped as motionTest does)
  tunnelPass(num, t0, t1, step = 250) {
    const T = world?.real?.tunnel; if (!T) return "no tunnel";
    const real = window.F1KR, out = []; let fakeT = t0;
    num = String(num || real.focus || leader());
    window.F1KR = new Proxy(real, { get: (o, k) => (k === "t" ? fakeT : k === "focus" ? num : Reflect.get(o, k)) });
    try {
      for (let t = t0; t <= t1; t += step) {
        fakeT = t; updateCars(0.05);
        const c = cars.get(num); if (!c?.obj.visible) continue;
        const S = T.stations[0], loc = T.where(c.pos.x, c.pos.z);
        let best = null; for (const x of S) { const d = (x.x - c.pos.x) ** 2 + (x.z - c.pos.z) ** 2; if (!best || d < best.d) best = { d, s: x.s }; }
        if (best && best.d < 400) out.push([t, Math.round(best.s), loc ? 1 : 0]);
      }
    } finally { window.F1KR = real; }
    return JSON.stringify(out);
  },
  // development (v0.45, glove checks): the session times (t0 … t1 every `step` ms) and whether car `num`'s cockpit is in
  // the sun then – [t, 1 sunlit / 0 shaded by the real map (buildings, terrain, a tunnel's roof)] – a ray from 0.9 m over
  // the car towards the sun (sunDir as now), the cars stepped as tunnelPass does
  sunScan(num, t0, t1, step = 1000) {
    const g = world?.real?.group; if (!g) return "no map";
    const real = window.F1KR, out = [], ray = new THREE.Raycaster(); let fakeT = t0; ray.far = 400;
    num = String(num || real.focus || leader());
    window.F1KR = new Proxy(real, { get: (o, k) => (k === "t" ? fakeT : k === "focus" ? num : Reflect.get(o, k)) });
    try {
      for (let t = t0; t <= t1; t += step) {
        fakeT = t; updateCars(0.05);
        const c = cars.get(num); if (!c?.obj.visible) continue;
        ray.set(c.pos.clone().addScaledVector(UP, 0.9), sunDir);
        out.push([t, ray.intersectObject(g, true).some((h) => { for (let p = h.object; p; p = p.parent) if (!p.visible) return false; return true; }) ? 0 : 1]);
      }
    } finally { window.F1KR = real; }
    return JSON.stringify(out);
  },
  // development: a free camera at s m into covered stretch k, `o` m towards the sea, h m over its floor, looking `ahead`
  // m further along (negative: back), at `ho` m – inside the tunnel
  viewTunnel(k = 0, s = 30, o = 0, h = 1.5, ahead = 30, ho = 1.2, fov = 70) {
    const S = world?.real?.tunnel?.stations?.[k]; if (!S) return "no tunnel";
    // (beyond a mouth: straight on from the end station)
    const st = (d) => { const x = S.reduce((b, q) => (Math.abs(q.s - d) < Math.abs(b.s - d) ? q : b), S[0]), e = d - x.s; return { ...x, x: x.x + x.tx * e, z: x.z + x.tz * e }; };
    const a = st(s), b = st(s + ahead), at = (x, oo, hh) => [x.x + x.ox * oo, x.y + hh, x.z + x.oz * oo];
    return this.look(...at(a, o, h), ...at(b, o, ho), fov);
  },
  // development: the biggest meshes (visible, by triangles) under a part of the real map: [name path, tris, instances]
  bigMeshes(part = "landmarks", n = 15) {
    const g = world?.real?.group.children.find((c) => c.name === part); if (!g) return "no " + part;
    const out = []; g.traverse((o) => { if (!o.isMesh) return; let v = true; for (let p = o; p; p = p.parent) if (!p.visible) { v = false; break; } if (!v) return; const ix = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; const path = []; for (let p = o; p && p !== g; p = p.parent) path.push(p.name || p.type); out.push([path.reverse().join("/"), Math.round((ix / 3) * (o.isInstancedMesh ? o.count : 1)), o.isInstancedMesh ? o.count : 1]); });
    return JSON.stringify(out.sort((a, b) => b[1] - a[1]).slice(0, n));
  },
  sceneStats() {
    const out = {}, add = (k, o) => { const r = out[k] || (out[k] = { objects: 0, meshes: 0, visibleMeshes: 0, tris: 0 }); r.objects++; if (o.isMesh || o.isPoints || o.isSprite || o.isLine) { r.meshes++; let v = true; for (let p = o; p; p = p.parent) if (!p.visible) { v = false; break; } if (v) { r.visibleMeshes++; const g = o.geometry; if (g?.attributes?.position) r.tris += Math.round(((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1)); } } };
    scene.traverse((o) => { let top = o, sub = null; while (top.parent && top.parent !== scene) { sub = top; top = top.parent; } const name = top === world?.group ? "world/" + (sub ? (sub === world.real?.group ? "real" : sub.name || sub.type) : "-") : top.name || top.type; add(name, o); });
    for (const c of world?.real?.group.children || []) c.traverse((o) => add("real/" + (c.name || c.type), o));
    return JSON.stringify(out);
  },
  // development: how many facility models stand in the current world, and what the renderer holds
  // development: every driver's name board – made or not, and why (the whole chain: the pit building, its garages,
  // position data, the driver list, the team's garages, the driver's work space, the layer and its key, the board's row
  // in the label atlas, the layer's distance LOD, which way it faces, what stands between it and the camera, its size
  // on screen). → { facility, plan, layer, drivers: [{ num, code, team, status, reason, slot, px, hit }] }
  boardsDiag() { updatePitTeams(true); return JSON.stringify(boardsDiag()); },
  pitTeams() { updatePitTeams(true); return JSON.stringify({ ...pitTeamsInfo(), teams: pitTeams.key?.split("|"), evidence: !Array.isArray(pitTeams.info?.evidence) ? pitTeams.info?.evidence ?? null : pitTeams.info.evidence.map((e) => [e.team, e.ok ? "ok" : "no", e.reason, e.n, e.spread, e.u != null ? Math.round(e.u) : null]) }); },
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
    const c = cars.get(camNum()); if (!c) return "no car";
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
    visible = true; resize(); resetPace(); lastT = performance.now(); cancelAnimationFrame(rafId); rafId = requestAnimationFrame(frame);
  },
  hide() { visible = false; },
  // development (v0.44): the side mirrors' pass – { mode: "auto" | "full" | "low" | "simple" } sets the setting; returns its state
  mirrors(o = {}) {
    if (o.mode) { saveGeoSettings({ ...geoSettings(), mirrors: o.mode }); mirrorSetting = null; }
    const S = mirrorPass?.state, ms = S?.car?.userData.mirrors;
    return JSON.stringify({ setting: geoSettings().mirrors, mode: mirrorSetting && mirrorMode(mirrorSetting.set, mirrorSetting.q, mirrorStrained), strained: mirrorStrained, car: S?.car ? [...cars].find(([, c]) => c.model === S.car)?.[0] : null, view: S?.key, drawn: S?.drawn, rt: S?.rt ? [S.rt.width, S.rt.height, S.rt.samples] : null,
      glass: ms?.material.type, stats: S?.stats, programs: renderer.info.programs?.length, frame: S?.frame,
      live: [...cars].filter(([, c]) => mirrorPass && c.model.userData.mirrors?.material === mirrorPass.material).map(([n]) => n), failed: S?.failed ?? null });
  },
  // development (v0.45): the next frame's mirror pass against the real renderer (mirrorprobe.js) – { fault: "throw" |
  // "loop", colour: true, flat: v (low mode: the picture cleared to sRGB grey v, the glass' centre pixels read), needPass: true
  // (wait up to 12 frames for one with a mirror render – low mode draws every 3rd) }; resolves ~0.7 s later with the state
  // before/after, GL errors, each glass on the screen, and whether frames still come
  mirrorProbe(o = {}) { return new Promise((done) => { mirrorProbeReq = { ...o, done }; }); },
  // development (v0.44): the mirrors' picture (as drawn, unflipped: the left mirror's half first) shown over the page ×k
  mirrorDump(k = 2) {
    const rt = mirrorPass?.state.rt; if (!rt) return "no target";
    const w = rt.width, h = rt.height, px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const x = cv.getContext("2d"), im = x.createImageData(w, h);
    for (let y = 0; y < h; y++) im.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    x.putImageData(im, 0, 0);
    let el = document.getElementById("mirrorDump"); if (!el) { el = document.createElement("img"); el.id = "mirrorDump"; el.style.cssText = "position:fixed;left:90px;top:200px;z-index:99999;image-rendering:pixelated;border:2px solid #f0f"; document.body.append(el); }
    el.src = cv.toDataURL(); el.style.width = w * k + "px"; return "ok";
  },
  // development (v0.44): moments with one car close behind another (replay positions; minutes after lights out):
  // [min, ahead, behind, metres behind, metres to the side (+ = the car ahead's left)]
  closeBehind(fromMin = 3, toMin = 60, stepS = 4, maxM = 22) {
    const src = app().src, t0 = src.startTime(), out = [], dz = (p) => p && Math.hypot(p[0], p[1]) > 1;
    for (let t = t0 + fromMin * 60e3; t < t0 + toMin * 60e3; t += stepS * 1e3) {
      const a = src.positionsAt(t), b = src.positionsAt(t - 1000);
      for (const [n, p] of Object.entries(a)) {
        const q = b[n]; if (!dz(p) || !q) continue;
        const hx = p[0] - q[0], hy = p[1] - q[1], hl = Math.hypot(hx, hy); if (hl < 300) continue;   // (decimetres a second: > 30 m/s)
        const fx = hx / hl, fy = hy / hl;
        for (const [m, r] of Object.entries(a)) {
          if (m === n || !dz(r)) continue;
          const rx = (r[0] - p[0]) / 10, ry = (r[1] - p[1]) / 10, along = rx * fx + ry * fy, side = -rx * fy + ry * fx;
          if (along < -maxM || along > -5 || Math.abs(side) > 5) continue;
          out.push([+((t - t0) / 60e3).toFixed(2), n, m, +(-along).toFixed(1), +side.toFixed(1)]);
        }
      }
    }
    return JSON.stringify(out.slice(0, 400));
  },
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
    if ("shadowBias" in o) { sun.shadow.bias = o.shadowBias; refreshShadows(); }
    if ("normalBias" in o) { sun.shadow.normalBias = o.normalBias; refreshShadows(); }
    if (o.shadowSize) { sun.shadow.mapSize.set(o.shadowSize, o.shadowSize); sun.shadow.map?.dispose(); sun.shadow.map = null; refreshShadows(); }
    if (o.shadowType) { renderer.shadowMap.type = THREE[o.shadowType]; scene.traverse((x) => { if (x.material) [].concat(x.material).forEach((m) => { m.needsUpdate = true; }); }); refreshShadows(); }
    return "ok";
  },
  resetHitches() { perf.spikes = 0; perf.worst = 0; perf.frames = 0; },
  occlusionTest,
  // development: hold the focused car's steering wheel at `deg` (+ = its left grip up – a right turn), or sweep it
  // (period s, amplitude deg) – the arms' poses at any lock with the car standing still; null lets go
  // development (v0.43): roll the focused car's wheels at `rps` turns a second whatever it does (null lets go) – what turns
  // and what doesn't inside the wheel, the car standing
  spinWheels(rps = 0.5) { devSpin = rps == null ? null : +rps; return "ok"; },
  steerWheel(deg, period = 0) { devSteer = deg == null ? null : period ? { amp: deg, period, t0: performance.now() } : deg; return "ok"; },
  // development (v0.42): the focused car's steering wheel alone (its body, arms – and with hands false its gloves – hidden)
  // for close looks at the wheel; false shows them again
  wheelSolo(on = true, hands = true) {
    const c = cars.get(camNum()); if (!c) return "no car";
    const st = c.model.getObjectByName("steering"), keep = (o) => { for (let p = o; p; p = p.parent) if (p === st) return hands || !/glove/i.test(o.name); return false; };
    c.model.traverse((o) => { if (o.isMesh) { if (on && !keep(o)) { o.userData.soloHid = o.visible; o.visible = false; } else if (!on && o.userData.soloHid != null) { o.visible = o.userData.soloHid; delete o.userData.soloHid; } } });
    return "ok";
  },
  // development: the camera as it is – mode, lens, near plane, its place in the focused car's frame (cockpit checks)
  camInfo() {
    const c = cars.get(camNum()); let rel = null;
    if (c) { c.model.updateWorldMatrix(true, false); rel = camera.position.clone().applyMatrix4(c.model.matrixWorld.clone().invert()).toArray().map((v) => +v.toFixed(3)); }
    return { mode: camMode, fov: +camera.fov.toFixed(2), near: camera.near, aspect: +camera.aspect.toFixed(3), rel, look: { ...look, down: undefined } };
  },
  // development (v0.43): the focused car's meshes drawn for diagnosis – "colors": each named part one flat colour (what
  // the eye actually sees of which mesh), "wire": wireframe, "double": both faces drawn (a face turned the wrong way
  // shows up), "normals": the normals as colours; null: the car's own materials back
  carDiag(mode = "colors") {
    const c = cars.get(camNum()); if (!c) return "no car";
    const COL = { painted: 0xd02020, carbon: 0x2050d0, wing: 0x8040c0, rim: 0xf0d000, tub: 0x20b040, headrest: 0x00c0c0, torso: 0xe040e0, helmet: 0xffffff, arm: 0xff8000, gauntlet: 0xffa060, glove: 0xffc090, gloveLo: 0xffc090 }, seen = new Set();
    c.model.traverse((o) => {
      if (!o.isMesh || seen.has(o)) return; seen.add(o);
      if (o.userData.diagMat) { const m = o.material; o.material = o.userData.diagMat; delete o.userData.diagMat; if (m !== o.material) m.dispose(); }
      if (!mode) return;
      const base = o.material, under = (q) => { for (let p = q; p; p = p.parent) if (p.name === "steering") return true; return false; };
      let m;
      if (mode === "colors") m = new THREE.MeshLambertMaterial({ color: COL[o.name] ?? (under(o) ? 0xdddddd : 0x606060), side: THREE.DoubleSide });
      else if (mode === "wire") m = new THREE.MeshBasicMaterial({ color: COL[o.name] ?? 0x888888, wireframe: true });
      else if (mode === "double") { m = base.clone(); m.side = THREE.DoubleSide; }
      else if (mode === "normals") m = new THREE.MeshNormalMaterial();
      if (m) { if (o.isSkinnedMesh || o.isInstancedMesh) m.vertexColors = false; o.userData.diagMat = base; o.material = m; }
    });
    return "ok";
  },
  // development (v0.44): the focused car's kit drawn in loud zone colours (kit.js zones: gloves, sleeves, harness) – on a
  // copy of its material, put back with kitDiag(false); partVis hides / shows the focused car's parts by name
  kitDiag(on = true) {
    const c = cars.get(camNum()); if (!c) return "no car";
    const k = c.model.userData.kitMat; let n = 0;
    c.model.traverse((o) => {
      if (!o.isMesh) return;
      if (!on && o.userData.kitDiag) { const m = o.material; o.material = o.userData.kitDiag; delete o.userData.kitDiag; if (!o.material.userData?.shared || m !== o.material) m.dispose?.(); n++; }
      else if (on && o.material === k) {
        const m = k.clone(), a = new Uint8Array(64);
        for (let z = 0; z < 16; z++) { const col = new THREE.Color().setHSL((z * 0.381) % 1, 0.9, 0.55); a.set([col.r * 255, col.g * 255, col.b * 255, 255], z * 4); }
        m.map = new THREE.DataTexture(a, 16, 1); m.map.magFilter = m.map.minFilter = THREE.NearestFilter; m.map.needsUpdate = true; m.sheen = 0;
        o.userData.kitDiag = k; o.material = m; n++;
      }
    });
    return n;
  },
  // development (v0.45): the focused car's glove look and how each look's material is lit – patched (the light field /
  // tunnel lamps: nightLit), its night glow and environment map – to check a look switched by night or in a tunnel
  gloveState() {
    const c = cars.get(camNum()); if (!c) return "no car";
    const u = c.model.userData, st = (m) => ({ patched: Object.prototype.hasOwnProperty.call(m, "onBeforeCompile"), glow: +m.emissiveIntensity.toFixed(3), env: !!m.envMap, onCar: u.kitMat === m });
    return JSON.stringify({ num: app().focus, look: u.kitMode, night: nightNow, readable: st(u.kitMats.readable), real: st(u.kitMats.real) });
  },
  partVis(name, on) { const c = cars.get(camNum()); if (!c) return "no car"; let n = 0; c.model.traverse((o) => { if (o.name === name) { o.visible = !!on; n++; } }); return n; },
  // development: the focused driver's arm axes on/off (drawArmDiag)
  // v0.47: the focused car's arms' swing now – q per arm (0 beside the body, 1 across; armswap.js), the wheel drawn and
  // the steering history's at this moment (deg), and whether the swing came from the history (swapAt) or frame to frame
  armQ(num) { const A = app(), c = cars.get(num || camNum()), u = c?.model.userData; if (!u?.arms) return null; const h = u.hist && u.armT != null ? u.hist(u.armT) : null; return { num: num || camNum(), t: u.armT, q: u.arms.map((a) => a.q), wheelDeg: +(u.wheel.rotation.z * 57.29578).toFixed(2), histDeg: h == null ? null : +(h * 57.29578).toFixed(2), from: h == null ? "frames" : "history", lod: u.lod, near: u.near.visible }; },
  // development (v0.52, request §11): the focused car's driver's-eye view measured on the frame as drawn – what share of
  // the picture the arms, gloves, wheel, its display and the body take, the forward window, the mirrors and the display
  // hidden by a hand, near-plane cuts (eyeview.js); and the HUD's panels over the wheel / hands (their boxes, px²)
  async eyeView(W = 320) {
    const c = cars.get(camNum()); if (!c?.model) return "no car";
    const E = await import("./eyeview.js"); c.model.updateWorldMatrix(true, true); camera.updateMatrixWorld();
    const m = E.measureEyeView(c.model, camera, W), r = canvas.getBoundingClientRect(), hud = [];
    for (const el of document.querySelectorAll("#map3d .spec-w")) {
      const b = el.getBoundingClientRect(); if (!b.width || !b.height || getComputedStyle(el).visibility === "hidden" || el.hidden) continue;
      const box = [(b.left - r.left) / r.width, (b.top - r.top) / r.height, (b.right - r.left) / r.width, (b.bottom - r.top) / r.height];
      const over = {}; for (const k of ["wheel", "display", "arm", "glove"]) { const q = m.boxes[k]; if (!q) continue; const w = Math.min(box[2], q[2]) - Math.max(box[0], q[0]), h = Math.min(box[3], q[3]) - Math.max(box[1], q[1]); if (w > 0 && h > 0) over[k] = Math.round(w * h * r.width * r.height); }
      if (Object.keys(over).length) hud.push({ el: el.className || el.id, over });
    }
    return JSON.stringify({ cam: camMode, num: camNum(), size: [Math.round(r.width), Math.round(r.height)], fov: +camera.fov.toFixed(1), wheelDeg: +((c.model.userData.wheel?.rotation.z || 0) * 180 / Math.PI).toFixed(1), speed: Math.round((c.speed || 0) * 3.6), ...m, hud });
  },
  // development (v0.52): car num's steering wheel angle (deg, + = turned left, as the arms get it) every `step` ms of the
  // session over [t0, t1], from the smoothed tracks (the same as the arms' history: pathSteer, the lock by speed) –
  // [s since t0, wheel deg, km/h, lap position m]
  wheelTrace(num, t0, t1, step = 100) {
    const sm = smoothFor(app().src); if (!sm?.frame) return "no tracks";
    const out = [], st = {};
    for (let ms = t0; ms <= t1; ms += step) {
      const q = sm.state(num, ms, st); if (!q) { out.push(null); continue; }
      const v = Math.hypot(q.vs, q.vd), L = lockFor(v), w = Math.max(-L, Math.min(L, -(v > 3 ? pathSteer(sm.frame, q, v) : 0) * STEER_RATIO));
      out.push([+((ms - t0) / 1000).toFixed(1), +(w * 180 / Math.PI).toFixed(1), Math.round(v * 3.6), Math.round(((q.s % sm.frame.L) + sm.frame.L) % sm.frame.L)]);
    }
    return JSON.stringify(out);
  },
  // (v0.52) the focused car's contact shadow: its texture (per era), its plane's height and the road's under the car's
  // middle and its four tyres (a ray down through the world's meshes) – is it on the road or under it
  contactShadow() {
    const c = cars.get(camNum()); if (!c) return "no car"; c.model.updateWorldMatrix(true, true);
    const sh = c.model.getObjectByName("contactShadow"), p = new THREE.Vector3(), ray = new THREE.Raycaster(), hits = [];
    const u = c.model.userData.profile;
    for (const [x, z] of [[0, 0], [u.W / 2 - u.FW / 2, u.FZ], [-(u.W / 2 - u.FW / 2), u.FZ], [u.W / 2 - u.RW / 2, u.RZ], [-(u.W / 2 - u.RW / 2), u.RZ]]) {
      p.set(x, 0.03, z).applyMatrix4(c.model.matrixWorld); ray.set(new THREE.Vector3(p.x, p.y + 5, p.z), new THREE.Vector3(0, -1, 0));
      let h = null; world.group.traverseVisible((o) => { if (!o.isMesh || o.isInstancedMesh) return; try { for (const q of ray.intersectObject(o, false)) if (!h || q.distance < h.distance) h = q; } catch {} });
      hits.push(h ? +(p.y - h.point.y).toFixed(3) : null);
    }
    return JSON.stringify({ tex: sh?.material.map?.image ? [sh.material.map.image.width, sh.material.map.image.height] : null, planeOverRoad: hits });
  },
  // (v0.52) the eye camera's turn with the driver's head into bends: on / off (kept in this computer's settings); no
  // argument: the state and the head's turn now (deg)
  headTurn(on) { if (on != null) { headTurn = !!on; try { localStorage.setItem("f1kr:eyeHead", headTurn ? "on" : "off"); } catch {} } const c = cars.get(camNum()); return JSON.stringify({ on: headTurn, deg: c ? +((c.headYaw || 0) * 180 / Math.PI).toFixed(1) : null }); },
  armDiag(on = true) { if (!on && devArmDiag?.lines) { devArmDiag.lines.removeFromParent(); devArmDiag.lines.geometry.dispose(); devArmDiag.lines.material.dispose(); } devArmDiag = on ? devArmDiag || {} : null; return "ok"; },
  // development (v0.44): a car's wing state – its pose's source (measured DRS / estimated active aero), the mechanism, the zones
  // development: hold the focused car's wings at a fraction (0 shut … 1 open; null: back to the estimate / data)
  aeroHold(v = null) { devAeroHold = v; return "ok"; },
  aeroState(num = null) {
    const c = cars.get(num || camNum()); if (!c) return "no car";
    const Z = world?.aeroZones, u = c.model.userData;
    return JSON.stringify({ num: c.num, ...c.aeroState, open: +(c.aero ?? 0).toFixed(3), spec: u.aeroSpec?.id, conf: u.aeroSpec?.conf, zones: Z ? { official: !!Z.official, src: Z.official?.src || "estimated (long straights)", spans: Z.spans.map((q) => [Math.round(q.a), Math.round(q.b)]), L: Math.round(Z.L) } : null, s: c.st ? Math.round(((c.st.s % (Z?.L || 1)) + (Z?.L || 1)) % (Z?.L || 1)) : null });
  },
  // development (v0.45): moments over [t0, t1] (ms) where a car is shut by a brake of this pass of a zone and the v0.44
  // estimate (entry from the speed now: hist left out) had it open again – the cases the entry from the positions fixes
  aeroScan(t0, t1, step = 250, max = 40) {
    const src = app().src, sm = smooth.src === src ? smooth.tr : null; if (!sm?.coords) return "no smooth tracks";
    const ev = [], st = {}, I = {}, a = {}, b = {}, open = {};
    for (const num of Object.keys(src.tracks?.cars || {})) {
      for (let t = t0; t <= t1; t += step) {
        if (!sm.state(num, t, st)) { open[num] = null; continue; }
        const X = aeroCtx(src, t);
        Object.assign(I, { allowed: X.allowed, spans: X.Z.spans, L: X.Z.L, s: st.s, speed: st.vs * 3.6, tel: src.car?.[num] || null, t, now: src.isLive ? t : null, onTrack: true, racing: X.t0 == null || t >= X.t0, startGate: X.t0, mode: X.mode, hist: sm.coords(num), lag: sm.telLag || 0 });
        activeAeroAt(I, a); I.hist = null; activeAeroAt(I, b);
        const bad = a.why === "braking" && a.open === 0 && b.open > 0.5;
        if (bad && !open[num]) { const z = zoneAt(st.s, X.Z.spans, X.Z.L); open[num] = { num, t, rel: Math.round((t - (src.startTime?.() || 0)) / 100) / 10, zone: z ? [Math.round(z.span.a), Math.round(z.span.b), z.span.z?.id || "est"] : null, s: Math.round(((st.s % X.Z.L) + X.Z.L) % X.Z.L), kmh: Math.round(st.vs * 3.6), tEntry: Math.round(a.tEntry), brakeAgo: null, until: t }; ev.push(open[num]); if (ev.length >= max) return JSON.stringify(ev); }
        else if (bad) { open[num].until = t; open[num].kmhEnd = Math.round(st.vs * 3.6); }
        else open[num] = null;
      }
    }
    return JSON.stringify(ev);
  },
  // development (v0.47): the wings never read ahead – over [t0, t1] every car's pose with the whole telemetry and with
  // the telemetry cut at the query's limit (t + lag, or now) must be the same; returns the counts and the first misses
  aeroPrefix(t0, t1, step = 250, max = 20) {
    const src = app().src, sm = smooth.src === src ? smooth.tr : null; if (!sm?.coords) return "no smooth tracks";
    const st = {}, I = {}, a = {}, b = {}, miss = []; let n = 0, inZone = 0, open = 0, braking = 0;
    for (const num of Object.keys(src.tracks?.cars || {})) {
      const tel = src.car?.[num]; if (!tel?.t?.length) continue;
      for (let t = t0; t <= t1; t += step) {
        if (!sm.state(num, t, st)) continue;
        const X = aeroCtx(src, t), lim = src.isLive ? t : t + (sm.telLag || 0);
        Object.assign(I, { allowed: X.allowed, spans: X.Z.spans, L: X.Z.L, s: st.s, speed: st.vs * 3.6, tel, t, now: src.isLive ? t : null, onTrack: true, racing: X.t0 == null || t >= X.t0, startGate: X.t0, mode: X.mode, hist: sm.coords(num), lag: sm.telLag || 0 });
        activeAeroAt(I, a);
        let lo = 0, hi = tel.t.length; while (lo < hi) { const m = (lo + hi) >> 1; if (tel.t[m] <= lim) lo = m + 1; else hi = m; }
        const cut = (x) => x && (x.subarray ? x.subarray(0, lo) : x.slice(0, lo));
        I.tel = { t: cut(tel.t), brk: cut(tel.brk), v: cut(tel.v) };
        activeAeroAt(I, b); n++;
        if (a.why !== "outside the zones" && a.why !== "no zone") inZone++;
        if (a.open > 0) open++; if (/braking/.test(a.why)) braking++;
        if (a.open !== b.open || a.why !== b.why) { if (miss.length < max) miss.push({ num, rel: Math.round((t - (src.startTime?.() || 0)) / 100) / 10, full: [+a.open.toFixed(3), a.why], cut: [+b.open.toFixed(3), b.why] }); else miss.n = (miss.n || max) + 1; }
      }
    }
    return JSON.stringify({ n, inZone, open, braking, misses: miss.n || miss.length, first: miss });
  },
  // development: look at the focused car from a given offset (metres, car frame)
  inspect(dx, dy, dz) {
    const c = cars.get(camNum()); if (!c) return "no car";
    setCam("heli"); controls.enabled = false; visible && (camMode = "inspect");
    const yaw = c.yaw, f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), r = new THREE.Vector3(f.z, 0, -f.x);
    camera.position.copy(c.pos).addScaledVector(r, dx).addScaledVector(UP, dy).addScaledVector(f, dz);
    camera.near = 0.05; camera.fov = 40; camera.updateProjectionMatrix(); camera.lookAt(c.pos.clone().addScaledVector(UP, 0.5));
    return "ok";
  },
  // development: a static look at the focused car from (x, y, z) to (tx, ty, tz), both in the car's own frame (+x its
  // left, +y up, +z its nose; metres) – the cockpit's parts up close (fine gloves on)
  inspectAt(x, y, z, tx, ty, tz, fov = 35) {
    const c = cars.get(camNum()); if (!c) return "no car";
    setCam("heli"); controls.enabled = false; visible && (camMode = "inspect");
    c.model.updateWorldMatrix(true, true); setCockpit(c.model, true); setDetail(c.model, "near");
    camera.position.set(x, y, z).applyMatrix4(c.model.matrixWorld); camera.up.set(0, 1, 0);
    camera.near = 0.01; camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(new THREE.Vector3(tx, ty, tz).applyMatrix4(c.model.matrixWorld));
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
  // development: the helicopter camera let go of the car (as after a pan) at p looking at t – the user's free view, whose
  // shadow area stays put (updateSun), unlike look()'s inspect camera
  shadowInfo() { const sc = sun.shadow.camera; return JSON.stringify({ cast: sun.castShadow, enabled: renderer.shadowMap.enabled, key: shadowKey, map: sun.shadow.map ? [sun.shadow.map.width, sun.shadow.map.height] : null, cam: [sc.left, sc.right, sc.near, sc.far], sun: sun.position.toArray().map(Math.round), target: sun.target.position.toArray().map(Math.round), int: sun.shadow.intensity, bias: [sun.shadow.bias, sun.shadow.normalBias] }); },
  heliAt(px, py, pz, tx, ty, tz) { if (camMode !== "heli") setCam("heli"); heli.follow = false; controls.target.set(tx, ty, tz); camera.position.set(px, py, pz); controls.update(); return "ok"; },
  look(px, py, pz, tx, ty, tz, fov = 50) {
    setCam("heli"); controls.enabled = false; camMode = "inspect";
    camera.position.set(px, py, pz); camera.near = 0.3; camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(tx, ty, tz);
    return "ok";
  },
  debug: () => JSON.stringify({ cam: camera?.position.toArray().map(Math.round), target: controls?.target.toArray().map(Math.round), fov: camera?.fov, aspect: camera?.aspect,
    size: world && [world.size.x, world.size.y, world.size.z].map(Math.round), host: host && [host.clientWidth, host.clientHeight], cars: cars.size, mode: camMode,
    paint: (() => { const c = cars.get(camNum()); const m = c?.model.children[1]?.material; return m && { color: m.color.getHexString(), emissive: m.emissive.getHexString(), ei: m.emissiveIntensity }; })(),
    sun: [sun?.color.getHexString(), sun && +sun.intensity.toFixed(2), sunDir.toArray().map((v) => +v.toFixed(2))], night: nightNow, follow: (() => { const c = cars.get(camNum()); if (!c) return null; const v = c.pos.clone().project(camera); return { pos: c.pos.toArray().map(Math.round), yaw: +c.yaw.toFixed(2), pitchDeg: +(c.pitch * 57.3).toFixed(2), modelPitchDeg: +(c.model.rotation.x * 57.3).toFixed(2), camPitchDeg: +(new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ").x * 57.3).toFixed(2), steer: +(c.steer || 0).toFixed(3), wheel: +(c.model.userData.wheel?.rotation.z || 0).toFixed(2), lod: c.model.userData.lod, chaseYaw: +chase.yaw.toFixed(2), speed: Math.round(c.speed), screen: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(3)], camDist: +camera.position.distanceTo(c.pos).toFixed(2), visible: c.obj.visible, inScene: !!c.obj.parent, est: c.est?.est || null }; })(), hitches: { frames: perf.frames, over30ms: perf.spikes, worstMs: Math.round(perf.worst * 1000) }, key: world?.sourceKey, mem: { geo: renderer?.info.memory.geometries, tex: renderer?.info.memory.textures, calls: renderer?.info.render.calls, tris: renderer?.info.render.triangles, heapMB: Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576) }, fps: perf.fps, ratio: perf.ratio, cap60: !!perf.cap, late: perf.late, loc: app()?.location?.(), width: world?.width && +world.width.toFixed(1), measured: world?.samples?.measured && +world.samples.measured.toFixed(2), street: world?.street, real: !!world?.real, info: world?.real?.info }),
};
window.dispatchEvent(new Event("map3d-ready"));
