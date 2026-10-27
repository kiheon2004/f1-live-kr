// The session's weather as one environment state (weather.js): the feed's Rainfall read safely (missing is never dry),
// the road's wetness as a function of session time from the records up to it (same after a seek, a rewind, any speed),
// nothing after t used, a new session starting clean, the tyres as supporting evidence, the sky's setting, the roofs
// that keep rain off (a drop below a roof hidden, one beside it not), the hourly cloud data (main/clouds.js).
const test = require("node:test");
const assert = require("node:assert");
const W = () => import("../src/renderer/weather.js");
const MIN = 60e3;
// a record as F1 sends it (strings), raining or not
const rec = (rain, extra = {}) => ({ AirTemp: "18.8", Humidity: "81.0", Pressure: "965.0", Rainfall: rain, TrackTemp: "26.7", WindDirection: "328", WindSpeed: "1.8", ...extra });
// a recording: one record a minute; rain from minute a to b (exclusive)
function events(n, a, b) { const out = []; for (let i = 0; i < n; i++) out.push({ ms: i * MIN + 36172, topic: "WeatherData", data: rec(i >= a && i < b ? "1" : "0") }); return out; }

test("weather: Rainfall read as raining / not raining / unknown – strings, numbers, booleans; missing and garbage are unknown, never dry", async () => {
  const { rainOf, numOf } = await W();
  for (const v of ["1", " 1 ", 1, true, "true", "TRUE", "1.0"]) assert.strictEqual(rainOf(v), 1, JSON.stringify(v));
  for (const v of ["0", 0, false, "false", "0.0"]) assert.strictEqual(rainOf(v), 0, JSON.stringify(v));
  for (const v of [undefined, null, "", " ", "yes", "2", 2, 0.5, NaN, {}, [], "rain"]) assert.strictEqual(rainOf(v), null, JSON.stringify(v));
  assert.strictEqual(numOf("18.8"), 18.8); assert.strictEqual(numOf(""), null); assert.strictEqual(numOf("x"), null); assert.strictEqual(numOf(3), 3);
});

test("weather: a record without Rainfall keeps the last known value (a partial update); before any – unknown, not dry; an unreadable one is unknown", async () => {
  const { WeatherLog, environmentAt } = await W();
  const log = new WeatherLog();
  log.push(0, { AirTemp: "20" });
  assert.strictEqual(log.rainAt(0), null);
  const e = environmentAt(log, 0);
  assert.strictEqual(e.known, false); assert.strictEqual(e.raining, null); assert.strictEqual(e.rainAmt, 0);
  log.push(MIN, { Rainfall: "1" }); log.push(2 * MIN, { AirTemp: "19" });
  assert.strictEqual(log.rainAt(2 * MIN), 1, "a partial update keeps rain");
  assert.strictEqual(log.recordAt(2 * MIN).AirTemp, 19);
  log.push(3 * MIN, { Rainfall: "??" });
  assert.strictEqual(log.rainAt(3 * MIN), null, "garbage is unknown");
  // unknown holds the wetness (no drying assumed)
  const w3 = log.wetAt(3 * MIN), w20 = log.wetAt(20 * MIN);
  assert.ok(w3 > 0 && Math.abs(w20 - w3) < 1e-12, `held ${w3} ${w20}`);
  // nothing before the first record
  assert.strictEqual(log.wetAt(-1), null);
});

test("weather: transitions – rain fades in from when it began, out from when it stopped; the road wets and then dries continuously", async () => {
  const { WeatherLog, environmentAt, INTENSITY, RAMP, TAU_DRY } = await W();
  const log = WeatherLog.fromEvents(events(120, 10, 40));
  const t0 = 10 * MIN + 36172, t1 = 40 * MIN + 36172;
  assert.strictEqual(environmentAt(log, t0 - 1).raining, 0);
  assert.strictEqual(environmentAt(log, t0).rainAmt, 0);
  assert.ok(Math.abs(environmentAt(log, t0 + RAMP / 2).rainAmt - INTENSITY / 2) < 1e-9);
  assert.strictEqual(environmentAt(log, t0 + 5 * MIN).rainAmt, INTENSITY);
  assert.strictEqual(environmentAt(log, t1).raining, 0);
  assert.ok(Math.abs(environmentAt(log, t1).rainAmt - INTENSITY) < 1e-9, "fades out from the stop");
  assert.strictEqual(environmentAt(log, t1 + RAMP + 1).rainAmt, 0);
  // wetness: rising while it rains, falling after, never jumping (sampled every second over the whole session)
  let prev = log.wetAt(0), maxStep = 0;
  for (let t = 0; t < 120 * MIN; t += 1000) { const w = log.wetAt(t); maxStep = Math.max(maxStep, Math.abs(w - prev)); prev = w; }
  assert.ok(maxStep < 0.01, `continuous (max step ${maxStep})`);
  assert.ok(log.wetAt(t1) > 0.95, "30 min of rain: wet");
  // after the rain: still wet for a while, then drying – e^(−Δt/τ)
  const w1 = log.wetAt(t1);
  assert.ok(Math.abs(log.wetAt(t1 + TAU_DRY) - w1 * Math.exp(-1)) < 1e-9);
  assert.ok(log.wetAt(t1 + 5 * MIN) > 0.8, "not dry at once");
  assert.ok(log.wetAt(t1 + 79 * MIN) < 0.1);
  // the overcast look lingers after the rain and fades
  const c = (t) => environmentAt(log, t, { sky: "fair" }).cloud;
  assert.ok(c(t0 + 5 * MIN) > 0.9 && c(t1 + 1) > 0.9 && c(t1 + 30 * MIN) < c(t1 + 1) && c(t1 + 30 * MIN) > 0);
});

test("weather: the state at t is the same by seeking forward, back, or playing through at any step (no per-frame integration)", async () => {
  const { WeatherLog, environmentAt, newEnvironment } = await W();
  const log = WeatherLog.fromEvents(events(150, 20, 50).concat(events(150, 70, 71).map((e) => ({ ...e, ms: e.ms + 0.5 }))).sort((a, b) => a.ms - b.ms));
  const pick = (e) => JSON.stringify([e.raining, e.rainAmt, e.wet, e.cloud]);
  const targets = [5 * MIN, 21.3 * MIN, 49.9 * MIN, 52 * MIN, 71 * MIN, 140 * MIN];
  const straight = targets.map((t) => pick(environmentAt(log, t)));
  // played through with a reused state at uneven frame steps (16 ms … 8× speed)
  const out = newEnvironment(); const played = [];
  let t = 0, k = 0, steps = [16, 33, 133, 1066];
  while (k < targets.length) { t = Math.min(targets[k], t + steps[(t / 7) % 4 | 0]); environmentAt(log, t, {}, out); if (t === targets[k]) { played.push(pick(out)); k++; } }
  assert.deepStrictEqual(played, straight);
  // seeking back and forth, in a scrambled order
  for (const i of [5, 0, 3, 1, 4, 2, 2, 0]) assert.strictEqual(pick(environmentAt(log, targets[i], {}, out)), straight[i]);
});

test("weather: a replay never uses a record after t; a live log only has what was shown (nothing from the future)", async () => {
  const { WeatherLog, environmentAt } = await W();
  // rain only in the future of t: nothing of it shows at t
  const ev = events(60, 30, 40);
  const log = WeatherLog.fromEvents(ev);
  const t = 29 * MIN + 36172;
  const full = environmentAt(log, t);
  const cut = environmentAt(WeatherLog.fromEvents(ev.filter((e) => e.ms <= t)), t);
  assert.deepStrictEqual({ ...full }, { ...cut });
  assert.strictEqual(full.raining, 0); assert.strictEqual(full.wet, 0); assert.ok(full.cloud < 0.5);
  // live: records pushed as they're shown; the clock never reads a record ahead of it
  const live = new WeatherLog();
  live.push(1000, rec("0")); live.push(61000, rec("1"));
  assert.strictEqual(live.rainAt(60999), 0);
  assert.strictEqual(live.rainAt(61000), 1);
  // an older record arriving late doesn't rewrite the past
  assert.strictEqual(live.push(30000, rec("1")), false);
  assert.strictEqual(live.rainAt(40000), 0);
});

test("weather: a new session starts clean – nothing of the last one's rain or wet road is left", async () => {
  const { WeatherLog, environmentAt } = await W();
  const wet = WeatherLog.fromEvents(events(60, 0, 60));
  assert.ok(environmentAt(wet, 59 * MIN).wet > 0.9);
  const next = WeatherLog.fromEvents([]);
  const e = environmentAt(next, 59 * MIN);
  assert.strictEqual(e.raining, null); assert.strictEqual(e.wet, 0); assert.strictEqual(e.rainAmt, 0); assert.strictEqual(e.wetModel, null);
  // and reset() empties a live log
  wet.reset(); assert.strictEqual(wet.size, 0); assert.strictEqual(wet.rainAt(59 * MIN), null);
});

test("weather: tyres as supporting evidence – intermediates / wets at t raise the wetness estimate (labelled), never lower it", async () => {
  const { wetTyreEvidence, WeatherLog, environmentAt } = await W();
  const lines = (comps) => Object.fromEntries(comps.map((c, i) => [String(i + 1), { Stints: c === null ? {} : [{ Compound: "SOFT" }, { Compound: c }] }]));
  assert.strictEqual(wetTyreEvidence(lines(["INTERMEDIATE", "INTERMEDIATE", "INTERMEDIATE", "INTERMEDIATE"])), 0.75);
  assert.strictEqual(wetTyreEvidence(lines(["WET", "WET", "WET"])), 1);
  assert.strictEqual(wetTyreEvidence(lines(["MEDIUM", "HARD", "SOFT", "MEDIUM"])), 0);
  assert.strictEqual(wetTyreEvidence(lines(["INTERMEDIATE", "UNKNOWN", null])), null, "fewer than 3 known");
  // an index-keyed patch (as merged) reads its highest stint
  assert.strictEqual(wetTyreEvidence({ 1: { Stints: { 0: { Compound: "SOFT" }, 1: { Compound: "INTERMEDIATE" } } }, 2: { Stints: { 0: { Compound: "INTERMEDIATE" } } }, 3: { Stints: { 0: { Compound: "INTERMEDIATE" } } } }), 0.75);
  assert.strictEqual(wetTyreEvidence(null), null);
  const log = WeatherLog.fromEvents(events(60, 0, 0));
  const e = environmentAt(log, 30 * MIN, { tyres: 0.75 });
  assert.strictEqual(e.wet, 0.75); assert.strictEqual(e.wetSrc, "tyres"); assert.strictEqual(e.wetModel, 0);
  const r = WeatherLog.fromEvents(events(60, 0, 60));
  assert.ok(environmentAt(r, 59 * MIN, { tyres: 0 }).wet > 0.9, "slicks don't dry a wet model");
});

test("weather: the sky – neutral by default when the feed can't say (no rain is not 'clear'), the setting's choice, cloud data, overcast while it rains", async () => {
  const { WeatherLog, environmentAt, NEUTRAL_CLOUD, cloudLook, coverAt } = await W();
  const dry = WeatherLog.fromEvents(events(60, 0, 0)), t = 30 * MIN;
  assert.strictEqual(environmentAt(dry, t).cloud, NEUTRAL_CLOUD); assert.strictEqual(environmentAt(dry, t).cloudSrc, "neutral");
  assert.strictEqual(environmentAt(dry, t, { sky: "fair" }).cloud, 0);
  assert.strictEqual(environmentAt(dry, t, { sky: "overcast" }).cloud, 1);
  assert.strictEqual(environmentAt(dry, t, { sky: "auto", cover: 0.1 }).cloud, 0);
  assert.strictEqual(environmentAt(dry, t, { sky: "auto", cover: 0.95 }).cloud, 1);
  assert.strictEqual(environmentAt(dry, t, { sky: "neutral", cover: 0.95 }).cloud, NEUTRAL_CLOUD, "the neutral setting ignores the data");
  assert.strictEqual(environmentAt(null, t).cloud, NEUTRAL_CLOUD);
  const wet = WeatherLog.fromEvents(events(60, 0, 60));
  for (const sky of ["auto", "neutral", "fair"]) { const e = environmentAt(wet, t, { sky, cover: 0 }); assert.ok(e.cloud > 0.9 && e.cloudSrc === "rain", sky); }
  assert.ok(cloudLook(0.2) === 0 && cloudLook(0.95) === 1);
  // hourly data: interpolated between the hours round t, nothing when no hour is within 90 min
  const H = 3600e3, hours = [[10 * H, 0.2], [11 * H, 0.6], [12 * H, 1]];
  assert.ok(Math.abs(coverAt(hours, 10.5 * H) - 0.4) < 1e-9);
  assert.strictEqual(coverAt(hours, 12 * H + 80 * MIN), 1);
  assert.strictEqual(coverAt(hours, 14 * H), null);
  assert.strictEqual(coverAt(hours, 8 * H), null);
  assert.strictEqual(coverAt([], 10 * H), null);
});

test("weather: covers – no rain under a roof (tunnel, pit building, grandstand roof); beside it, and above it, rain falls", async () => {
  const { coverRaster, roofAt, rainBlocked, tunnelCovers, OPEN } = await W();
  const garage = { pts: [[0, 0], [40, 0], [40, 12], [0, 12]], y: 8 };
  const roof = { pts: [[100, 0], [130, 0], [130, 6], [100, 6]], y: 15 };
  const R = coverRaster([garage, roof]);
  assert.ok(rainBlocked(R, 20, 2, 6), "inside the garage");
  assert.ok(!rainBlocked(R, 20, 9, 6), "above its roof");
  assert.ok(!rainBlocked(R, 20, 2, -3), "in the pit lane in front of it – a camera in the garage sees this rain");
  assert.ok(rainBlocked(R, 115, 10, 3) && !rainBlocked(R, 115, 10, 8));
  assert.strictEqual(roofAt(R, -500, -500), OPEN);
  assert.strictEqual(coverRaster([]), null); assert.ok(!rainBlocked(null, 0, 0, 0));
  // nested covers: the higher roof counts (a tunnel under a building)
  const N = coverRaster([{ pts: [[0, 0], [10, 0], [10, 10], [0, 10]], y: 5 }, { pts: [[2, 2], [8, 2], [8, 8], [2, 8]], y: 20 }]);
  assert.strictEqual(roofAt(N, 5, 5), 20); assert.strictEqual(roofAt(N, 1, 1), 5);
  // a tunnel from stations along x (the road rising 0 → 2 m), 4.4 m clear; given as tunnel.js keeps them (a list per stretch)
  const st = Array.from({ length: 51 }, (_, k) => ({ x: k * 2, z: 0, ox: 0, oz: -1, seaOut: 6, hillOut: 6, ceil: (k / 50) * 2 + 4.4 }));
  const covers = tunnelCovers([st]);
  assert.strictEqual(covers.length, 50);
  const T = coverRaster(covers);
  assert.ok(rainBlocked(T, 50, 3, 0), "on the road in the tunnel");
  assert.ok(rainBlocked(T, 50, 3, 5.5) && !rainBlocked(T, 50, 3, 7), "to its outer faces, not beyond");
  assert.ok(!rainBlocked(T, -3, 1, 0) && !rainBlocked(T, 103, 1, 0), "outside the mouths");
  // a large extent: the cell grows so the raster stays bounded
  const big = coverRaster([{ pts: [[0, 0], [5000, 0], [5000, 10], [0, 10]], y: 3 }], { max: 1024 });
  assert.ok(big.w <= 1024 && big.h <= 1024 && rainBlocked(big, 2500, 1, 5));
});

test("weather: wind – the feed's 'from' direction blows the rain the other way, in the scene's own north / east", async () => {
  const { windVector } = await W();
  const v = windVector(0, 2);                 // from the north → towards the south (+z when north is −z)
  assert.ok(Math.abs(v[0]) < 1e-9 && Math.abs(v[1] - 2) < 1e-9);
  const w = windVector(270, 3);               // from the west → towards the east (+x)
  assert.ok(Math.abs(w[0] - 3) < 1e-9 && Math.abs(w[1]) < 1e-9);
  assert.deepStrictEqual(windVector(null, 3), [0, 0]);
  // a frame turned 90°: north along +x
  const r = windVector(0, 1, [1, 0], [0, 1]);
  assert.ok(Math.abs(r[0] + 1) < 1e-9 && Math.abs(r[1]) < 1e-9);
});

test("weather: cloud data (main/clouds.js) – layers to a cover (thin high cloud counts little), answers checked for place and time, a past session never gets today's sky", async () => {
  const { coverOf, parseHourly, args, usable, Clouds } = require("../src/main/clouds.js");
  assert.strictEqual(coverOf(0, 0, 100), 0.2, "Monza 2025: all high cloud – a sunny race");
  assert.strictEqual(coverOf(100, 0, 0), 1);
  assert.strictEqual(coverOf(null, 0, 0), null);
  const j = { latitude: 50.44, longitude: 6.03, hourly: { time: ["2025-07-27T13:00", "2025-07-27T14:00"], cloud_cover_low: [27, null], cloud_cover_mid: [63, 49], cloud_cover_high: [100, 97] } };
  const h = parseHourly(j, 50.44, 5.97);
  assert.strictEqual(h.length, 1); assert.strictEqual(h[0][0], Date.UTC(2025, 6, 27, 13));
  assert.throws(() => parseHourly({ ...j, latitude: 40 }, 50.44, 5.97), /another place/);
  assert.throws(() => args(91, 0, Date.UTC(2025, 0, 1))); assert.throws(() => args(0, 0, Date.now() + 5 * 864e5)); assert.throws(() => args(0, 0, NaN));
  assert.ok(usable([[Date.UTC(2025, 6, 27, 13), 0.5]], Date.UTC(2025, 6, 27, 14, 20)));
  assert.ok(!usable([[Date.UTC(2025, 6, 27, 13), 0.5]], Date.UTC(2025, 6, 27, 16)));
  // the archive's answer for a day not yet published (nulls): no cover – and only the session's own dates are asked for
  const asked = [];
  const c = new Clouds(require("node:os").tmpdir() + "/f1kr-clouds-test-" + process.pid, async (url) => { asked.push(url); return { ok: true, json: async () => ({ latitude: 50.44, longitude: 5.97, hourly: { time: ["2025-07-27T13:00"], cloud_cover_low: [null], cloud_cover_mid: [null], cloud_cover_high: [null] } }) }; });
  const r = await c.get(50.437, 5.971, Date.UTC(2025, 6, 27, 14, 20));
  assert.strictEqual(r.ok, false);
  assert.ok(/start_date=2025-07-26&end_date=2025-07-28/.test(asked[0]) && /archive-api\.open-meteo\.com/.test(asked[0]));
  assert.ok(!/@|email|user/i.test(asked[0]), "nothing about the user in the request");
});

test("weather: Spa 2025's recorded rain (WeatherData, minute records) – wet at the delayed start, drying to ~0.3 when the field went back to slicks", async () => {
  const { WeatherLog } = await W();
  // the Rainfall changes in the cached recording (minutes into it) – 2025-07-27 Belgian GP, race; 223 records to 222 min
  const changes = [[0.6, "0"], [7.6, "1"], [10.6, "0"], [15.6, "1"], [63.6, "0"], [64.6, "1"], [66.6, "0"], [70.6, "1"], [115.6, "0"], [117.6, "1"], [119.6, "0"], [124.6, "1"], [126.6, "0"]];
  const log = new WeatherLog();
  for (let m = 0.6; m < 222; m += 1) { let v = "0"; for (const [at, r] of changes) if (at <= m + 1e-9) v = r; log.push(m * MIN, rec(v)); }
  const start = 134.55 * MIN, slicks = 163 * MIN;   // the clock started 134.55 min in; half the field on slicks by 163 min (TimingAppData)
  assert.ok(log.wetAt(start) > 0.6, `start ${log.wetAt(start)}`);
  const w = log.wetAt(slicks);
  assert.ok(w > 0.2 && w < 0.4, `at the switch to slicks ${w}`);
  assert.ok(log.wetAt(222 * MIN) < 0.1);
});

test("weather3d: the live path – records taken as they're shown, a new session's key starts clean; the lights scaled without compounding or fighting map3d.js", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const { createWeather } = await import("../src/renderer/weather3d.js");
  const scene = new THREE.Scene(), renderer = { toneMappingExposure: 1.05 };
  const hemi = new THREE.HemisphereLight(0xe3efff, 0x4a5a3a, 1.15), sun = new THREE.DirectionalLight(0xfff3e0, 2.4), fog = new THREE.Fog(0xc9d9e8, 800, 5000);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 20000);
  const W = createWeather({ scene, renderer, daySky: null, fairEnv: () => null });
  let now = 1000;
  // (v0.45: a live source logs its weather records as they are applied – LiveSource.weather – and the 3D view reads
  // that list; a new session's source starts a new list)
  const src = { isLive: true, state: { SessionInfo: { Key: 1 }, WeatherData: { Rainfall: "0", WindSpeed: "1", WindDirection: "90" } }, now: () => now, utcAt: (t) => t };
  src.weather = [{ ms: now, data: src.state.WeatherData }];
  const A = { src, get t() { return now; }, rate: 1, sourceKey: () => "live:1:0" };
  const step = () => W.update({ A, world: null, camera, dt: 0.016, night: true, hemi, sun, fog });
  step();
  assert.strictEqual(W.env.raining, 0);
  now = 61000; src.state.WeatherData = { ...src.state.WeatherData, Rainfall: "1" }; src.weather.push({ ms: now, data: { Rainfall: "1" } }); step();
  assert.strictEqual(W.env.raining, 1);
  for (let i = 0; i < 50; i++) { now += 1000; step(); }
  assert.ok(W.env.rainAmt > 0 && W.env.wet > 0);
  // the lights: the same every frame (no compounding), and a value map3d.js sets is taken as the new base
  const s1 = sun.intensity; for (let i = 0; i < 20; i++) step();
  assert.strictEqual(sun.intensity, s1);
  sun.intensity = 0.16; step();                       // (applyLighting's night value)
  assert.ok(Math.abs(sun.intensity - 0.16 * (1 - 0.5 * Math.min(1, W.env.rainAmt / 0.6))) < 1e-9);
  // a new live session: nothing of the last one's rain or wet road
  src.state = { SessionInfo: { Key: 2 }, WeatherData: { Rainfall: "0" } }; now += 1000; src.weather = [{ ms: now, data: { Rainfall: "0" } }]; step();
  assert.strictEqual(W.env.raining, 0); assert.strictEqual(W.env.wet, 0); assert.strictEqual(W.env.rainAmt, 0);
  // no session at all: unknown, nothing drawn
  const B = { src: null, t: null, rate: 1 };
  W.update({ A: B, world: null, camera, dt: 0.016, night: true, hemi, sun, fog });
  assert.strictEqual(W.env.known, false); assert.strictEqual(W.env.rainAmt, 0);
  W.dispose();
});

test("weather: the roof raster of a rotated 400 × 30 m pit building and 300 pit wall canopies (scanline fill: 35 ms idle where a per-cell point-in-polygon test took 14 s; not timed here – the shared machine's load makes a time bound flaky)", async () => {
  const { coverRaster, rainBlocked } = await W();
  const a = 0.6, R = (u, v) => [u * Math.cos(a) - v * Math.sin(a), u * Math.sin(a) + v * Math.cos(a)];
  const foot = []; for (let i = 0; i <= 100; i++) foot.push(R(i * 4, 0)); for (let i = 100; i >= 0; i--) foot.push(R(i * 4, 30));
  const list = [{ pts: foot, y: 15 }]; for (let k = 0; k < 300; k++) { const x = k * 3 - 400, z = 500; list.push({ pts: [[x, z], [x + 2.5, z], [x + 2.5, z + 2], [x, z + 2]], y: 3 }); }
  const r = coverRaster(list);
  const [cx, cz] = R(200, 15);
  assert.ok(rainBlocked(r, cx, 5, cz) && !rainBlocked(r, cx, 16, cz));
  assert.ok(rainBlocked(r, -399, 1, 501) && !rainBlocked(r, -399, 4, 501), "under a pit wall canopy, not above it");
  const [ox, oz] = R(200, 45); assert.ok(!rainBlocked(r, ox, 1, oz), "beside the building");
});
