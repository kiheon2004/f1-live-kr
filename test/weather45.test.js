// v0.45 weather fixes. §3: partial WeatherData updates at the same moment merge (the last value given for a field wins,
// the other fields are kept); the derived state (wetness, rain start / end) is worked out once from the merged record.
const test = require("node:test");
const assert = require("node:assert");
const W = () => import("../src/renderer/weather.js"), W_ = W;
const MIN = 60e3;
const frozen = (o) => Object.freeze({ ...o });
// what a record's derived state is at t (to compare two logs)
const at = (log, t) => ({ rain: log.rainAt(t), wet: log.wetAt(t), rec: log.recordAt(t) && { ...log.recordAt(t) }, k: log.indexAt(t), since: log.since[log.indexAt(t)], end: log.rainEnd[log.indexAt(t)] });

test("weather45 §3: rain then a temperature at the same moment – both kept (the request's input)", async () => {
  const { WeatherLog } = await W();
  const log = new WeatherLog();
  log.push(0, { Rainfall: "0", AirTemp: "20" });
  log.push(1000, { Rainfall: "1" });
  log.push(1000, { AirTemp: "19" });
  assert.strictEqual(log.rainAt(1000), 1, "rain=1 at 1000 must survive the later AirTemp-only update");
  assert.strictEqual(log.recordAt(1000).AirTemp, 19);
  assert.strictEqual(log.size, 2);
  assert.strictEqual(log.since[1], 1000, "the rain began at 1000");
});

test("weather45 §3: a temperature then rain at the same moment – both kept", async () => {
  const { WeatherLog } = await W();
  const log = new WeatherLog();
  log.push(0, { Rainfall: "0", AirTemp: "20", Humidity: "70" });
  log.push(1000, { AirTemp: "19" });
  log.push(1000, { Rainfall: "1" });
  assert.strictEqual(log.rainAt(1000), 1);
  assert.strictEqual(log.recordAt(1000).AirTemp, 19);
  assert.strictEqual(log.recordAt(1000).Humidity, 70, "a field not sent at 1000 keeps its earlier value");
});

test("weather45 §3: the same field sent again (a resend) or corrected at the same moment – the last value wins", async () => {
  const { WeatherLog } = await W();
  const log = new WeatherLog();
  log.push(0, { Rainfall: "0", AirTemp: "20" });
  log.push(1000, { Rainfall: "1", AirTemp: "19" });
  log.push(1000, { Rainfall: "1" });                          // resend
  assert.strictEqual(log.rainAt(1000), 1); assert.strictEqual(log.recordAt(1000).AirTemp, 19); assert.strictEqual(log.size, 2);
  log.push(1000, { Rainfall: "0" });                          // correction
  assert.strictEqual(log.rainAt(1000), 0); assert.strictEqual(log.recordAt(1000).AirTemp, 19);
  assert.strictEqual(log.since[1], 0, "no rain at 1000 after the correction: the dry spell still began at 0");
  assert.strictEqual(log.rainEnd[1], null);
  log.push(1000, { AirTemp: "18.5" });
  assert.strictEqual(log.recordAt(1000).AirTemp, 18.5); assert.strictEqual(log.rainAt(1000), 0);
});

test("weather45 §3: three and more partial updates at one moment – every field kept, the same as one full record", async () => {
  const { WeatherLog, environmentAt } = await W();
  const parts = [{ Rainfall: "1" }, { AirTemp: "19" }, { WindSpeed: "3.4" }, { Humidity: "88" }, { TrackTemp: "24.1", WindDirection: "200" }];
  const a = new WeatherLog(), b = new WeatherLog();
  a.push(0, { Rainfall: "0", AirTemp: "20", Pressure: "1010" }); b.push(0, { Rainfall: "0", AirTemp: "20", Pressure: "1010" });
  for (const p of parts) a.push(MIN, p);
  b.push(MIN, Object.assign({}, ...parts));
  for (const t of [MIN, MIN + 1, 5 * MIN, 30 * MIN]) assert.deepStrictEqual(at(a, t), at(b, t), `t=${t}`);
  assert.deepStrictEqual({ ...environmentAt(a, 10 * MIN) }, { ...environmentAt(b, 10 * MIN) });
  assert.strictEqual(a.recordAt(MIN).Pressure, 1010);
});

test("weather45 §3: an unreadable Rainfall is an explicit unknown (the last word at that moment); a missing one keeps the value", async () => {
  const { WeatherLog } = await W();
  const log = new WeatherLog();
  log.push(0, { Rainfall: "1" });
  log.push(1000, { AirTemp: "19" });
  assert.strictEqual(log.rainAt(1000), 1, "missing: kept");
  log.push(1000, { Rainfall: "??" });
  assert.strictEqual(log.rainAt(1000), null, "explicit garbage at the same moment: unknown");
  log.push(1000, { AirTemp: "18" });
  assert.strictEqual(log.rainAt(1000), null, "a later partial without Rainfall leaves the explicit unknown");
  log.push(1000, { Rainfall: "1" });
  assert.strictEqual(log.rainAt(1000), 1, "and a readable one corrects it");
  for (const v of ["", " ", "2", null, {}]) { log.push(2000, { Rainfall: "0" }); log.push(2000, { Rainfall: v }); assert.strictEqual(log.rainAt(2000), null, JSON.stringify(v)); }
  // a number that can't be read is unknown too (not the old value)
  log.push(3000, { AirTemp: "x" }); assert.strictEqual(log.recordAt(3000).AirTemp, null);
});

test("weather45 §3: duplicates at the very first moment merge too", async () => {
  const { WeatherLog } = await W();
  const log = new WeatherLog();
  log.push(0, { Rainfall: "1" }); log.push(0, { AirTemp: "20" }); log.push(0, { WindSpeed: "2" });
  assert.strictEqual(log.size, 1); assert.strictEqual(log.rainAt(0), 1); assert.strictEqual(log.recordAt(0).AirTemp, 20); assert.strictEqual(log.recordAt(0).WindSpeed, 2);
  assert.strictEqual(log.since[0], 0); assert.strictEqual(log.rainEnd[0], null); assert.strictEqual(log.wetAt(0), 0);
});

test("weather45 §3: later records' wetness and rain transitions follow the merged record (wetness integrated once from the time before)", async () => {
  const { WeatherLog, environmentAt, evolveWet } = await W();
  const a = new WeatherLog(), b = new WeatherLog();
  a.push(0, { Rainfall: "0", AirTemp: "20" }); a.push(MIN, { Rainfall: "1" }); a.push(MIN, { AirTemp: "19" }); a.push(MIN, { AirTemp: "19" }); a.push(21 * MIN, { Rainfall: "0" }); a.push(22 * MIN, { AirTemp: "18" });
  b.push(0, { Rainfall: "0", AirTemp: "20" }); b.push(MIN, { Rainfall: "1", AirTemp: "19" }); b.push(21 * MIN, { Rainfall: "0" }); b.push(22 * MIN, { AirTemp: "18" });
  for (const t of [0, MIN, 10 * MIN, 21 * MIN, 21.5 * MIN, 22 * MIN, 60 * MIN]) assert.deepStrictEqual(at(a, t), at(b, t), `t=${t / MIN} min`);
  const w21 = evolveWet(0, 1, 20 * MIN);
  assert.ok(Math.abs(a.wetAt(21 * MIN) - w21) < 1e-12, "20 min of rain integrated once");
  assert.strictEqual(a.rainEnd[a.indexAt(21 * MIN)], 21 * MIN, "the rain ended at 21 min");
  const e = environmentAt(a, 21 * MIN + 20e3);
  assert.ok(e.rainAmt > 0 && e.rainAmt < 0.6, "the rain fading out after it stopped");
});

test("weather45 §3: inputs are never changed; an older moment is refused; an unsorted list is sorted once (a copy)", async () => {
  const { WeatherLog } = await W();
  const log = new WeatherLog();
  const p = [frozen({ Rainfall: "0", AirTemp: "20" }), frozen({ Rainfall: "1" }), frozen({ AirTemp: "19" })];
  const copy = JSON.parse(JSON.stringify(p));
  log.push(0, p[0]); log.push(1000, p[1]); log.push(1000, p[2]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p)), copy);
  // a record handed out earlier isn't changed by a later merge at its moment either
  const r = log.recordAt(1000), before = { ...r };
  log.push(1000, { AirTemp: "17" });
  assert.deepStrictEqual({ ...r }, before); assert.strictEqual(log.recordAt(1000).AirTemp, 17);
  assert.strictEqual(log.push(500, { Rainfall: "1" }), false);
  assert.strictEqual(log.rainAt(800), 0);
  const ev = [{ ms: 2 * MIN, topic: "WeatherData", data: { Rainfall: "0" } }, { ms: 0, topic: "WeatherData", data: { Rainfall: "0" } }, { ms: MIN, topic: "WeatherData", data: { Rainfall: "1" } }];
  const evCopy = JSON.parse(JSON.stringify(ev));
  const u = WeatherLog.fromEvents(ev), s = WeatherLog.fromEvents([...ev].sort((x, y) => x.ms - y.ms));
  assert.deepStrictEqual(u.ms, s.ms); assert.deepStrictEqual(u.rain, s.rain);
  assert.deepStrictEqual(ev, evCopy, "the caller's list is left as it was");
});

// ---------- §4: the live weather record kept by the data layer (LiveSource), the 3D view only reading it ----------
const { LiveSource } = require("../src/renderer/replay.js");
const full = (rain, extra = {}) => ({ AirTemp: "18.8", Humidity: "81.0", Pressure: "965.0", Rainfall: rain, TrackTemp: "26.7", WindDirection: "328", WindSpeed: "1.8", ...extra });
// a live source on a fake clock: clock.now moves; push() takes its receive time from Date.now
function liveRig(t0 = 1_700_000_000_000) {
  const clock = { now: t0 }, real = Date.now;
  Date.now = () => clock.now;
  const live = new LiveSource();
  return { live, clock, restore: () => { Date.now = real; } };
}
async function view() {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const { createWeather } = await import("../src/renderer/weather3d.js");
  const scene = new THREE.Scene(), renderer = { toneMappingExposure: 1.05 };
  const hemi = new THREE.HemisphereLight(0xe3efff, 0x4a5a3a, 1.15), sun = new THREE.DirectionalLight(0xfff3e0, 2.4), fog = new THREE.Fog(0xc9d9e8, 800, 5000);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 20000);
  const W = createWeather({ scene, renderer, daySky: null, fairEnv: () => null });
  // A: as window.F1KR (the source in use and the moment shown)
  const draw = (src) => W.update({ A: { src, t: src?.now?.() ?? null, rate: 1, sourceKey: () => "live:1:0" }, world: null, camera, dt: 0.016, night: true, hemi, sun, fog });
  return { W, draw };
}

test("weather45 §4: rain starts and stops while the 3D view is closed – opened afterwards, it knows (the record is the data layer's)", async () => {
  const { live, clock, restore } = liveRig();
  try {
    const t0 = clock.now;
    live.snapshot({ SessionInfo: { Key: 9 }, WeatherData: full("0") }, t0); live.tick(t0);
    clock.now = t0 + MIN; live.push("WeatherData", { Rainfall: "1" }); live.tick(clock.now);
    for (let m = 2; m <= 20; m++) { clock.now = t0 + m * MIN; live.push("WeatherData", full("1")); live.tick(clock.now); }
    clock.now = t0 + 21 * MIN; live.push("WeatherData", { Rainfall: "0" }); live.tick(clock.now);
    clock.now = t0 + 21.5 * MIN; live.tick(clock.now);
    // the 3D view's first frame now
    const { W, draw } = await view();
    draw(live);
    assert.strictEqual(W.env.raining, 0);
    assert.ok(W.env.wetModel > 0.9, `20 min of rain before the view opened: wet ${W.env.wetModel}`);
    assert.ok(W.env.rainAmt > 0, "the rain that stopped 30 s ago still fading out");
    assert.strictEqual(live.weather.length, 22);
    assert.strictEqual(W.log.rainEnd[W.log.size - 1], t0 + 21 * MIN);
    W.dispose();
  } finally { restore(); }
});

test("weather45 §4: several weather updates applied in one tick – each one kept, at its own receive time", async () => {
  const { live, clock, restore } = liveRig();
  try {
    const t0 = clock.now;
    live.delayMs = 120e3;
    live.snapshot({ SessionInfo: { Key: 9 }, WeatherData: full("0") }, t0);
    clock.now = t0 + 10e3; live.push("WeatherData", { Rainfall: "1" }, false, "2025-07-06T14:00:10.000Z");
    clock.now = t0 + 70e3; live.push("WeatherData", { AirTemp: "17.9" });
    clock.now = t0 + 130e3; live.push("WeatherData", { Rainfall: "0" });
    const { W, draw } = await view();
    clock.now = t0 + 125e3; live.tick(clock.now); draw(live);
    assert.strictEqual(W.env.raining, 0, "the delay holds back what TV hasn't shown");
    clock.now = t0 + 260e3; live.tick(clock.now);            // (one tick: three updates)
    draw(live);
    assert.ok(W.env.wetModel > 0.2, `two minutes of rain counted: ${W.env.wetModel}`);
    assert.ok(W.env.rainAmt > 0, "the rain that stopped at 130 s (shown at 250 s) still fading out");
    assert.deepStrictEqual(live.weather.map((r) => [r.ms - t0, r.via]), [[0, "snapshot"], [10e3, "feed"], [70e3, "feed"], [130e3, "feed"]]);
    assert.strictEqual(live.weather[1].utc, Date.parse("2025-07-06T14:00:10.000Z"), "the hub's own time kept apart from the receive time");
    assert.strictEqual(live.weather[1].at, t0 + 10e3); assert.strictEqual(live.weather[2].utc, null);
    assert.strictEqual(W.log.size, 4);
    assert.strictEqual(W.log.rainAt(t0 + 69e3), 1); assert.strictEqual(W.log.recordAt(t0 + 70e3).AirTemp, 17.9);
    assert.ok(W.env.wetModel > 0.2, `two minutes of rain counted: ${W.env.wetModel}`);
    W.dispose();
  } finally { restore(); }
});

test("weather45 §4: broadcast delay raised and lowered, live pause and resume – the record follows what's applied, no moment from the future", async () => {
  const { live, clock, restore } = liveRig();
  try {
    const t0 = clock.now;
    live.snapshot({ SessionInfo: { Key: 9 }, WeatherData: full("0") }, t0); live.tick(t0);
    const { W, draw } = await view();
    clock.now = t0 + MIN; live.push("WeatherData", full("1")); live.delayMs = 30e3; live.tick(clock.now); draw(live);
    assert.strictEqual(W.env.raining, 0, "raised delay: the rain isn't shown before TV shows it");
    clock.now = t0 + MIN + 30e3; live.tick(clock.now); draw(live);
    assert.strictEqual(W.env.raining, 1);
    live.pause(clock.now);
    clock.now = t0 + 3 * MIN; live.push("WeatherData", full("0")); live.tick(clock.now); draw(live);
    assert.strictEqual(W.env.raining, 1, "paused: nothing new applied");
    clock.now = t0 + 4 * MIN; live.resume(clock.now); live.tick(clock.now); draw(live);
    assert.strictEqual(W.env.raining, 1, "resumed: the paused time joins the delay");
    assert.strictEqual(live.delayMs, 30e3 + (4 * MIN - (MIN + 30e3)));
    clock.now = t0 + 3 * MIN + live.delayMs - 1; live.tick(clock.now); draw(live);
    assert.strictEqual(W.env.raining, 1, "not before its delayed moment");
    clock.now += 1; live.tick(clock.now); draw(live);
    assert.strictEqual(W.env.raining, 0);
    assert.strictEqual(live.weather[2].ms, t0 + 3 * MIN, "kept at its receive time, not the moment it was drawn");
    live.delayMs = 0; clock.now += 1000; live.tick(clock.now); draw(live);
    for (let i = 1; i < live.weather.length; i++) assert.ok(live.weather[i].ms >= live.weather[i - 1].ms);
    assert.ok(W.log.ms.every((m) => m <= live.now()));
    W.dispose();
  } finally { restore(); }
});

test("weather45 §4: a reconnect's snapshot keeps the session's record (a long silence is an explicit unknown, not rain or dry held); a new session starts a new one", async () => {
  const { live, clock, restore } = liveRig();
  try {
    const t0 = clock.now;
    live.snapshot({ SessionInfo: { Key: 9 }, WeatherData: full("1") }, t0); live.tick(t0);
    const { W, draw } = await view();
    draw(live);
    clock.now = t0 + 10 * MIN; live.push("WeatherData", full("1")); live.tick(clock.now); draw(live);
    const wet10 = W.env.wetModel;
    // the link drops for 15 minutes; the reconnect's snapshot
    clock.now = t0 + 25 * MIN; live.snapshot({ SessionInfo: { Key: 9 }, WeatherData: full("1") }, clock.now); live.tick(clock.now); draw(live);
    const { evolveWet } = await W_();
    assert.ok(W.env.wetModel < evolveWet(0, 1, 25 * MIN) - 0.01, `the 15 minutes disconnected aren't counted as rain: ${W.env.wetModel}`);
    assert.deepStrictEqual(live.weather.map((r) => r.via), ["snapshot", "feed", "gap", "snapshot"]);
    assert.strictEqual(live.weather[2].ms, t0 + 10 * MIN + 90e3);
    assert.strictEqual(W.log.rainAt(t0 + 20 * MIN), null, "while disconnected: unknown");
    assert.ok(Math.abs(W.log.wetAt(t0 + 25 * MIN) - W.log.wetAt(t0 + 10 * MIN + 90e3)) < 1e-12, "the unknown spell holds the wetness (no rain assumed)");
    assert.ok(W.env.wetModel >= wet10);
    // a short reconnect: no gap
    clock.now += 20e3; live.snapshot({ SessionInfo: { Key: 9 }, WeatherData: full("1") }, clock.now); live.tick(clock.now);
    assert.strictEqual(live.weather.filter((r) => r.via === "gap").length, 1);
    // a new session: a new record, nothing of the last one's rain
    clock.now += MIN; live.snapshot({ SessionInfo: { Key: 10 }, WeatherData: full("0") }, clock.now); live.tick(clock.now); draw(live);
    assert.strictEqual(live.weather.length, 1);
    assert.strictEqual(W.log.size, 1); assert.strictEqual(W.env.wetModel, 0); assert.strictEqual(W.env.rainAmt, 0);
    // and a new session's info arriving in the feed does the same
    clock.now += MIN; live.push("WeatherData", full("1")); live.push("SessionInfo", { Key: 11 }); live.push("WeatherData", full("0")); live.tick(clock.now); draw(live);
    assert.strictEqual(live.weather.length, 1); assert.strictEqual(W.env.raining, 0); assert.strictEqual(W.env.wetModel, 0);
    W.dispose();
  } finally { restore(); }
});

test("weather45 §4: switching away (home, timing, a replay) and back keeps the live record; the first 3D entry after long rain doesn't call the road dry", async () => {
  const { live, clock, restore } = liveRig();
  try {
    const t0 = clock.now;
    // joined mid-session in rain: before the first record the road is unknown
    live.snapshot({ SessionInfo: { Key: 9 }, WeatherData: full("1") }, t0); live.tick(t0);
    const { W, draw } = await view();
    draw(live);
    const first = { start: W.env.wetStart, span: W.env.wetSpan, src: W.env.wetSrc };
    // the 3D shows a replay, then the home / timing screen (no draws) while live goes on
    const replay = { isLive: false, events: [{ ms: 0, topic: "WeatherData", data: full("0") }], state: {}, now: () => 0 };
    draw(replay); assert.strictEqual(W.env.raining, 0);
    for (let m = 1; m <= 30; m++) { clock.now = t0 + m * MIN; live.push("WeatherData", full("1")); live.tick(clock.now); }
    draw(live);
    assert.ok(W.env.wetModel > 0.99, `the whole 30 minutes of rain, though the view wasn't drawing live: ${W.env.wetModel}`);
    assert.strictEqual(W.log.size, 31);
    assert.strictEqual(W.env.wetSrc, "rain");
    assert.strictEqual(first.start, "unknown");
    assert.ok(first.span > 0.99, "everything before the connection is unknown");
    assert.strictEqual(first.src, "unknown", "not a dry road – nothing said so yet");
    assert.ok(W.env.wetSpan < 0.01, "30 min of rain leaves nothing of the unknown start");
    W.dispose();
  } finally { restore(); }
});

test("weather45 §4: tyres on a live join – wet tyres say wet at once (labelled), slicks don't make an unknown start 'dry from the rain record'", async () => {
  const { WeatherLog, environmentAt } = await W();
  const log = new WeatherLog(); log.push(0, full("0"));
  const e = environmentAt(log, MIN, { tyres: 0.75 });
  assert.strictEqual(e.wet, 0.75); assert.strictEqual(e.wetSrc, "tyres");
  const s = environmentAt(log, MIN, { tyres: 0 });
  assert.strictEqual(s.wet, 0); assert.strictEqual(s.wetSrc, "rain"); assert.ok(s.wetSpan > 0.9);
  const u = environmentAt(log, MIN);
  assert.strictEqual(u.wet, 0); assert.strictEqual(u.wetSrc, "unknown");
  // a known-dry start (opts.start: "dry") isn't unknown
  const d = new WeatherLog({ start: "dry" }); d.push(0, full("0"));
  assert.strictEqual(environmentAt(d, MIN).wetSrc, "rain"); assert.strictEqual(environmentAt(d, MIN).wetSpan, 0);
});
