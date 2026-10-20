// The session's weather in the 3D view (the state: weather.js – one for live and replay, read at the session clock).
// What changes with it, and how much of it is measured:
//   rain falling (the feed's rain sensor, yes/no – H) drawn at a presentation intensity (not mm/h); its slant from the
//   feed's wind (H, the station's) · the road's wetness (an estimate – weather.js) as a darker, less rough road that
//   reflects the sky a little (no mirror, no puddles) · the sky (no cloud data in the feed: a neutral sky by default, an
//   hourly cloud fraction from Open-Meteo when found, overcast while and after it rains) with the sun, the sky light, the
//   haze and the exposure following it · no rain under a roof: Monaco's tunnel, pit buildings with their garages,
//   grandstand roofs (a raster of roof heights; a drop below the roof over it isn't drawn).
// Costs: the sky is one draw (a sphere round the camera, two textures mixed) instead of three.js's background box; the
// rain one draw of line segments, its drops moved on the GPU (no buffer is written per frame); the wet road its own
// material's uniforms. Nothing is allocated per frame.
import * as THREE from "./vendor/three.module.js";
import { WeatherLog, environmentAt, newEnvironment, wetTyreEvidence, coverRaster, tunnelCovers, coverAt, windVector, INTENSITY } from "./weather.js";

// ---------- the overcast sky (equirectangular, as the fair one in map3d.js) ----------
// A grey deck of stratus / stratocumulus: brighter towards the zenith's diffuse light, darker lumps underneath, a pale
// hazy horizon. A look (no photo of a given day), shared by every circuit.
function overcastPixels(W, H, ground) {
  const img = new ImageData(W, H), d = img.data;
  const P = new Uint8Array(512); { let a = 4242; for (let i = 0; i < 256; i++) P[i] = i; for (let i = 255; i > 0; i--) { a = (a * 16807) % 2147483647; const j = a % (i + 1); [P[i], P[j]] = [P[j], P[i]]; } for (let i = 0; i < 256; i++) P[256 + i] = P[i]; }
  const hash = (x, y) => P[(P[x & 255] + y) & 255] / 255, fade = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi); const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), e = hash(xi + 1, yi + 1); return a + (b - a) * xf + (c - a) * yf + (a - b - c + e) * xf * yf; };
  const zen = [150, 156, 163], hor = [186, 190, 194], grd = [70, 74, 70];
  for (let y = 0; y < H; y++) {
    const el = (0.5 - (y + 0.5) / H) * Math.PI;
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      let r, g, b;
      if (el < 0) { const k = Math.min(1, -el / 0.15); [r, g, b] = ground ? hor.map((v, i) => v + (grd[i] - v) * k) : hor; }
      else {
        const t = Math.pow(el / (Math.PI / 2), 0.6);
        r = hor[0] + (zen[0] - hor[0]) * t; g = hor[1] + (zen[1] - hor[1]) * t; b = hor[2] + (zen[2] - hor[2]) * t;
        if (el > 0.01) {
          const az = (x / W) * Math.PI * 2, dd = Math.min(60, 1 / Math.tan(el)), px = Math.cos(az) * dd * 2.2, py = Math.sin(az) * dd * 2.2;
          let n = 0, amp = 0.5, f = 1; for (let k = 0; k < 4; k++) { n += noise(px * f + 3, py * f + 5) * amp; amp *= 0.5; f *= 2.1; }
          // the deck's lumps: darker bases, paler gaps – fading into the haze towards the horizon
          const s = (n - 0.47) * 70 * Math.min(1, el / 0.25);
          r -= s; g -= s; b -= s * 0.9;
        }
      }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  return img;
}
let overSky = null, overEnv = null;
function overcastSky() {
  if (overSky) return overSky;
  const c = document.createElement("canvas"); c.width = 1024; c.height = 512; c.getContext("2d").putImageData(overcastPixels(1024, 512, false), 0, 0);
  overSky = new THREE.CanvasTexture(c); overSky.colorSpace = THREE.SRGBColorSpace; overSky.userData.shared = true;   // (kept for every circuit)
  return overSky;
}
// what a wet road reflects under that sky (a small prefiltered map, shared)
function overcastEnv(renderer) {
  if (overEnv) return overEnv;
  const c = document.createElement("canvas"); c.width = 256; c.height = 128; c.getContext("2d").putImageData(overcastPixels(256, 128, true), 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  overEnv = pm.fromEquirectangular(t).texture; overEnv.userData.shared = true;
  pm.dispose(); t.dispose();
  return overEnv;
}

// ---------- sky dome ----------
// Equirectangular lookup as three.js's (equirectUv); the gradients taken across the seam so no line shows where u wraps.
const SKY_VS = `varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99999; }`;
const SKY_FS = `uniform sampler2D uFair; uniform sampler2D uOver; uniform float uMix;
varying vec3 vDir;
#include <common>
vec3 look(sampler2D t, vec2 uv, vec2 dx, vec2 dy) { return textureGrad(t, uv, dx, dy).rgb; }
void main() {
  vec3 d = normalize(vDir);
  // (x mirrored: three.js turns an equirectangular background into a cube map whose +x face it renders looking down −x)
  vec2 uv = vec2(atan(d.z, -d.x) * RECIPROCAL_PI2 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * RECIPROCAL_PI + 0.5);
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  if (abs(dx.x) > 0.5) dx.x -= sign(dx.x);
  if (abs(dy.x) > 0.5) dy.x -= sign(dy.x);
  vec3 c = mix(look(uFair, uv, dx, dy), look(uOver, uv, dx, dy), uMix);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------- rain ----------
// N streaks in a box round the camera. Each drop has a fixed place in the box (seed) and falls with the wind; the box
// wraps round the camera, so the drops stand still in the world as the camera moves through them (they rush past a
// chase camera at 300 km/h). A streak is the drop's path over a short exposure relative to the camera – long and slanted
// when the camera moves (EXPOSE: a TV camera's ~1/20 s – longer than a real shutter, so the streaks read at a
// glance: a look). Drops below a roof (the cover raster) and those past the shown share (uAmount) aren't drawn.
const RAIN_N = 16000, BOX = [56, 32, 56], EXPOSE = 0.05;
const RAIN_VS = `attribute float aEnd; attribute float aSeed;
uniform vec3 uCam; uniform vec3 uBox; uniform vec3 uOff; uniform vec3 uStreak; uniform float uAmount;
uniform sampler2D uCover; uniform vec4 uCoverExt; uniform float uHasCover;
varying float vA;
void main() {
  vec3 base = uCam - 0.5 * uBox;
  vec3 p = base + mod(position * uBox - uOff - base, uBox);
  float hide = step(uAmount, aSeed);
  if (uHasCover > 0.5) {
    vec2 uv = (p.xz - uCoverExt.xy) * uCoverExt.zw;
    // (the streak's lower end tested: one whose head is just over a roof would show its tail under it)
    if (uv.x >= 0.0 && uv.y >= 0.0 && uv.x < 1.0 && uv.y < 1.0 && p.y + min(uStreak.y, 0.0) < texture2D(uCover, uv).r) hide = 1.0;
  }
  p += aEnd * uStreak;
  float r = length(p - uCam);
  vA = (1.0 - hide) * smoothstep(0.6, 2.0, r) * (1.0 - smoothstep(0.32 * uBox.x, 0.5 * uBox.x, r)) * (1.0 - 0.6 * aEnd);
  gl_Position = hide > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const RAIN_FS = `uniform vec3 uColor; uniform float uAlpha; varying float vA;
void main() { if (vA < 0.01) discard; gl_FragColor = vec4(uColor, uAlpha * vA); }`;
function rainMesh() {
  const pos = new Float32Array(RAIN_N * 6), end = new Float32Array(RAIN_N * 2), seed = new Float32Array(RAIN_N * 2);
  let a = 777; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < RAIN_N; i++) {
    const x = r(), y = r(), z = r(), s = r();
    pos.set([x, y, z, x, y, z], i * 6); end[i * 2 + 1] = 1; seed[i * 2] = seed[i * 2 + 1] = s;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aEnd", new THREE.BufferAttribute(end, 1)); g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const none = new THREE.DataTexture(new Float32Array([-1e9]), 1, 1, THREE.RedFormat, THREE.FloatType); none.needsUpdate = true;
  const m = new THREE.ShaderMaterial({
    vertexShader: RAIN_VS, fragmentShader: RAIN_FS, transparent: true, depthWrite: false, fog: false,
    uniforms: { uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...BOX) }, uOff: { value: new THREE.Vector3() }, uStreak: { value: new THREE.Vector3(0, -0.5, 0) },
      uAmount: { value: 0 }, uCover: { value: none }, uCoverExt: { value: new THREE.Vector4() }, uHasCover: { value: 0 }, uColor: { value: new THREE.Color(0.8, 0.83, 0.88) }, uAlpha: { value: 0.3 } },
  });
  m.userData.none = none;
  const mesh = new THREE.LineSegments(g, m);
  mesh.name = "rain"; mesh.frustumCulled = false; mesh.renderOrder = 10; mesh.visible = false; mesh.raycast = () => {};
  return mesh;
}

// ---------- scaling what map3d.js sets ----------
// The lights, the haze and the exposure are set by map3d.js (applyLighting, updateSun – by the sun and the night). The
// weather scales them: each value's base is what was last set there by someone else (a value that isn't the one written
// here last), so the two never fight and nothing compounds frame after frame.
function scaler() {
  let w = null, base = 0;
  return (obj, key, k) => { const cur = obj[key]; if (w === null || cur !== w) base = cur; w = base * k; obj[key] = w; };
}
function tinter() {
  const w = new THREE.Color(), base = new THREE.Color(); let has = false;
  return (col, to, a) => { if (!has || !col.equals(w)) base.copy(col); col.copy(base).lerp(to, a); w.copy(col); has = true; };
}

export function createWeather({ scene, renderer, daySky, fairEnv }) {
  const env = newEnvironment();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false,   // (as three.js draws an sRGB background: not tone-mapped)
    uniforms: { uFair: { value: daySky }, uOver: { value: null }, uMix: { value: 0 } } }));
  dome.name = "sky"; dome.frustumCulled = false; dome.renderOrder = -1e9; dome.raycast = () => {}; dome.visible = false;
  // (follows whichever camera draws the scene – the view's, a mirror's)
  dome.onBeforeRender = (_r, _s, cam) => { dome.position.copy(cam.position); dome.scale.setScalar(cam.far * 0.5); dome.updateMatrixWorld(); };
  const rain = rainMesh();
  scene.add(dome, rain);
  const ru = rain.material.uniforms;
  const S = { log: null, logFor: null, liveKey: null, liveSeen: "", clouds: null, cloudsKey: null, cloudsAsk: 0, coverFor: null, raster: null, coverTex: null,
    camPrev: new THREE.Vector3(), camVel: new THREE.Vector3(), hasPrev: false, north: [0, -1], east: [1, 0], wind: [0, 0], tyresAt: 0, tyres: null,
    forced: null, roadFor: null, roadMats: [], roadWet: -1, roadEnv: null, skyMode: "auto", useClouds: true, enabled: true };
  const sc = { sun: scaler(), hemi: scaler(), near: scaler(), far: scaler(), exp: scaler() };
  const ti = { hemi: tinter(), fog: tinter(), sun: tinter() };
  const GREY = new THREE.Color(0xdfe3e8), FOGGREY = new THREE.Color(0xa9afb6), SUNGREY = new THREE.Color(0xe8ecf2);
  const fall = new THREE.Vector3(), streak = new THREE.Vector3();

  // the log for this source: a replay's whole recording once; a live feed's records as they're shown (a new session's
  // key starts a new one)
  function logFor(src) {
    if (!src) { S.log = null; S.logFor = null; return null; }
    if (!src.isLive) {
      if (S.logFor !== src) { S.logFor = src; S.log = WeatherLog.fromEvents(src.events); S.tyresAt = 0; }
      return S.log;
    }
    const key = src.state?.SessionInfo?.Key ?? null;
    if (S.logFor !== src || key !== S.liveKey) { S.logFor = src; S.liveKey = key; S.log = new WeatherLog(); S.liveSeen = ""; S.tyresAt = 0; }
    const w = src.state?.WeatherData;
    if (w) {
      const sig = `${w.AirTemp}|${w.Humidity}|${w.Pressure}|${w.Rainfall}|${w.TrackTemp}|${w.WindDirection}|${w.WindSpeed}`;
      if (sig !== S.liveSeen) { S.liveSeen = sig; S.log.push(src.now(), w); }
    }
    return S.log;
  }
  // the hourly cloud cover for this place and session (asked once per session; none until it comes)
  // (asked again only when the session or the place changes – a live one every 15 min; the cover at t worked out once a
  // second, or at once after a jump: nothing of this per frame)
  function clouds(A, world, src, t) {
    if (!S.useClouds || !world?.geoCenter || !window.api?.geo?.clouds || !Number.isFinite(t)) return null;
    const now = performance.now();
    if (src !== S.cloudSrc || world !== S.cloudWorld || S.cloudsKey == null || (src.isLive && now - S.cloudsAsk > 15 * 60e3)) {
      const key = `${A.sourceKey?.()?.replace(/:\d+$/, "")}|${world.geoCenter[0].toFixed(2)},${world.geoCenter[1].toFixed(2)}`;
      S.cloudSrc = src; S.cloudWorld = world;
      if (key !== S.cloudsKey || src.isLive) {
        const utc = src.utcAt?.(t);
        if (Number.isFinite(utc)) {
          S.cloudsKey = key; S.cloudsAsk = now; if (!src.isLive) S.clouds = null; S.coverAt = -Infinity;
          window.api.geo.clouds(world.geoCenter[0], world.geoCenter[1], utc, !!src.isLive).then((r) => { if (S.cloudsKey === key) { S.clouds = r?.ok ? r : null; S.coverAt = -Infinity; } }).catch(() => {});
        }
      }
    }
    if (!S.clouds) return null;
    if (now - S.coverAt > 1000 || Math.abs(t - S.coverT) > 5000) { S.coverAt = now; S.coverT = t; S.cover = coverAt(S.clouds.hours, src.utcAt?.(t)); }
    return S.cover;
  }
  // the roofs over this world's real surroundings (rebuilt with them)
  function covers(world) {
    const real = world?.real || null;
    if (S.coverFor === real) return;
    S.coverFor = real;
    const list = [];
    if (real) {
      for (const c of tunnelCovers(real.tunnel?.stations)) list.push(c);
      for (const r of real.stands?.roofs || []) list.push(r);
      real.group.getObjectByName("facilities")?.traverse((o) => { const c = o.userData?.cover; if (c) list.push({ pts: c.pts, y: c.y, kind: "facility" }); });
      // north / east in scene axes from the map's frame (the F1 frame is a hair rotated from north)
      const g = real.geo;
      if (g?.toLL) {
        // lat / lon change for a 100 m step along scene x and along scene z → the steps that change only one of them
        const o = g.toLL(0, 0), ex = g.toLL(100, 0), ez = g.toLL(0, 100);
        const lx = ex[0] - o[0], lz = ez[0] - o[0], gx = ex[1] - o[1], gz = ez[1] - o[1], det = lx * gz - lz * gx;
        if (Math.abs(det) > 1e-15) {
          const unit = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
          S.north = unit(gz / det, -gx / det); S.east = unit(-lz / det, lx / det);
        }
      }
    }
    S.raster = coverRaster(list, { cell: 1, max: 1024 });
    S.coverTex?.dispose(); S.coverTex = null;
    if (S.raster) {
      const t = new THREE.DataTexture(S.raster.data, S.raster.w, S.raster.h, THREE.RedFormat, THREE.FloatType);
      t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
      S.coverTex = t;
      ru.uCover.value = t; ru.uCoverExt.value.set(S.raster.x0, S.raster.z0, 1 / (S.raster.w * S.raster.cell), 1 / (S.raster.h * S.raster.cell)); ru.uHasCover.value = 1;
    } else { ru.uCover.value = rain.material.userData.none; ru.uHasCover.value = 0; }
    S.info = { covers: list.length, tunnel: list.filter((c) => c.kind === "tunnel").length, stands: list.filter((c) => c.kind === "stand roof").length, facilities: list.filter((c) => c.kind === "facility").length, raster: S.raster ? [S.raster.w, S.raster.h, +S.raster.cell.toFixed(2)] : null };
  }
  // the wet look on the track's own surfaces (the road, its lines, the kerbs): darker, smoother, a faint reflection of the
  // sky – roughness no lower than 0.3 (a film of water on open tarmac, not a mirror); no puddles (nothing says where)
  function road(world, wet, night) {
    if (!world?.road) return;
    // (the kerbs are rebuilt when the real map comes – a tunnel keeps them out of it: their materials taken again)
    if (S.roadFor !== world || S.roadKerb !== world.kerb) {
      S.roadFor = world; S.roadKerb = world.kerb; S.roadMats = []; S.roadWet = -1; S.roadEnv = undefined;
      const seen = new Set();
      for (const part of [world.road, world.lines, world.kerb]) part?.traverse((o) => { for (const m of [].concat(o.material || [])) if (m?.isMeshStandardMaterial && !seen.has(m)) { seen.add(m); const b = m.userData.wxBase || (m.userData.wxBase = { color: m.color.clone(), rough: m.roughness }); S.roadMats.push({ m, color: b.color, rough: b.rough, road: o === world.road }); } });
    }
    const q = Math.round(wet * 50) / 50;
    const envNow = !night && q > 0.03 ? S.envSky || null : null;
    if (q === S.roadWet && envNow === S.roadEnv) return;
    S.roadWet = q; const envChanged = envNow !== S.roadEnv; S.roadEnv = envNow;
    for (const r of S.roadMats) {
      r.m.color.copy(r.color).multiplyScalar(1 - (r.road ? 0.42 : 0.25) * q);
      r.m.roughness = r.rough + ((r.road ? 0.3 : 0.3) - r.rough) * q;
      r.m.envMapIntensity = q;
      if (envChanged) { r.m.envMap = envNow; r.m.needsUpdate = true; }
    }
  }

  const W = {
    env,
    get info() { return S.info || null; },
    get raster() { return S.raster; },
    // settings: { sky: "auto" | "neutral" | "fair" | "overcast", clouds: true/false }
    configure(o = {}) { if (o.sky) S.skyMode = o.sky; if ("clouds" in o) { S.useClouds = o.clouds !== false; S.clouds = null; S.cloudsKey = null; S.cloudSrc = null; } },
    // development: a state forced for testing the look (the covers, the wet road) – { rain: 0–1, wet: 0–1, cloud: 0–1 } or null
    force(o) { S.forced = o || null; },
    reset() { S.log = null; S.logFor = null; S.liveKey = null; S.clouds = null; S.cloudsKey = null; S.cloudSrc = null; S.hasPrev = false; },
    // once a frame, before drawing. A: window.F1KR; world: map3d's world; night: the night look is on.
    update({ A, world, camera, dt, night, hemi, sun, fog }) {
      const src = A?.src || null, log = logFor(src), t = A?.t;
      covers(world);
      // supporting evidence: the tyres at t (re-read every 2 s; a seek re-reads at once)
      const now = performance.now();
      if (src && (now - S.tyresAt > 2000 || Math.abs((t ?? 0) - (S.tyresT ?? 0)) > 5000)) { S.tyresAt = now; S.tyresT = t; S.tyres = wetTyreEvidence(src.state?.TimingAppData?.Lines); }
      const cover = src ? clouds(A, world, src, t) : null;
      environmentAt(log, Number.isFinite(t) ? t : -Infinity, { tyres: src ? S.tyres : null, cover, sky: S.skyMode }, env);
      env.cloudData = cover != null ? S.clouds?.source || null : null;
      if (S.forced) { const f = S.forced; env.forced = true; if (f.rain != null) { env.rainAmt = f.rain; env.raining = f.rain > 0 ? 1 : 0; } if (f.wet != null) env.wet = f.wet; if (f.cloud != null) env.cloud = f.cloud; }
      const day = !night, m = env.cloud, rp = Math.min(1, env.rainAmt / INTENSITY);
      // sky: the dome by day (the fair sky mixed towards the overcast one); the night's own gradient stays the background
      if (day) {
        if (!dome.material.uniforms.uOver.value) dome.material.uniforms.uOver.value = overcastSky();
        dome.material.uniforms.uMix.value = m;
        dome.visible = true; if (scene.background) scene.background = null;
      } else dome.visible = false;
      // (what the wet road reflects: the overcast sky's or the fair one's – made only once a road is wet)
      if (day && (env.wet || 0) > 0.03) S.envSky = m > 0.5 ? overcastEnv(renderer) : fairEnv();
      // light: the sun's share falls under cloud (shadows fade with it), the sky's light grows a little and turns grey,
      // the haze closes in under rain; a touch more exposure under a dark sky (as a camera would)
      sc.sun(sun, "intensity", day ? 1 - 0.85 * Math.pow(m, 1.5) : 1 - 0.5 * rp);
      ti.sun(sun.color, SUNGREY, day ? 0.6 * m : 0);
      sc.hemi(hemi, "intensity", day ? 1 + 0.15 * m : 1);
      ti.hemi(hemi.color, GREY, day ? 0.7 * m : 0);
      sc.far(fog, "far", 1 - 0.2 * m - 0.5 * rp);
      sc.near(fog, "near", 1 - 0.6 * rp);
      ti.fog(fog.color, day ? FOGGREY : fog.color, day ? Math.max(0.6 * m, rp) : 0);
      sc.exp(renderer, "toneMappingExposure", day ? 1 + 0.12 * m : 1);
      road(world, env.wet || 0, night);
      // rain: the clock runs with the replay (paused: the drops stand still; fast: they still fall at their own speed)
      const rate = A?.rate ?? 1, step = dt * Math.min(1, Math.max(0, rate));
      rain.visible = env.rainAmt > 0.002 && !!camera;
      if (!rain.visible) { S.hasPrev = false; return; }
      windVector(env.windDir, env.windSpeed, S.north, S.east, S.wind);
      fall.set(S.wind[0], -6.5, S.wind[1]);          // (≈ the terminal speed of a 2 mm drop, m/s)
      ru.uOff.value.addScaledVector(fall, -step);
      ru.uOff.value.set(((ru.uOff.value.x % BOX[0]) + BOX[0]) % BOX[0], ((ru.uOff.value.y % BOX[1]) + BOX[1]) % BOX[1], ((ru.uOff.value.z % BOX[2]) + BOX[2]) % BOX[2]);
      // the camera's own motion (smoothed): the streak is the drop's path relative to it over EXPOSE
      // (a jump of more than 20 m in a frame is a cut – another camera, a seek –, not motion: no streaks smeared across it)
      if (S.hasPrev && dt > 0 && camera.position.distanceToSquared(S.camPrev) < 400) { streak.copy(camera.position).sub(S.camPrev).multiplyScalar(1 / dt); S.camVel.lerp(streak, 0.3); } else S.camVel.set(0, 0, 0);
      S.camPrev.copy(camera.position); S.hasPrev = true;
      streak.copy(fall).sub(S.camVel).multiplyScalar(EXPOSE);
      if (rate === 0) streak.copy(fall).multiplyScalar(EXPOSE);
      if (streak.length() > 3) streak.setLength(3);
      ru.uStreak.value.copy(streak);
      ru.uCam.value.copy(camera.position);
      ru.uAmount.value = env.rainAmt;
      ru.uColor.value.setRGB(night ? 0.66 : 0.86, night ? 0.68 : 0.88, night ? 0.74 : 0.92);
      ru.uAlpha.value = night ? 0.42 : 0.5;
    },
    dispose() {
      scene.remove(dome, rain);
      dome.geometry.dispose(); dome.material.dispose(); rain.geometry.dispose(); rain.material.dispose(); rain.material.userData.none.dispose();
      S.coverTex?.dispose(); S.coverTex = null;
    },
  };
  return W;
}
