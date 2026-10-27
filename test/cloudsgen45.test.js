// v0.45 §6: the cloud answers reach the sky (weather3d.js clouds()) in the order they were asked – an older request's
// success or failure arriving after a newer request never replaces the newer one's state; the same session and place
// still reuse their answer (no request per frame, none on a rebuilt world). Deferred promises stand in for main/clouds.js.
const test = require("node:test");
const assert = require("node:assert");
const T0 = Date.UTC(2025, 6, 27, 13);
const H = (c) => [[T0 - 36e5, c], [T0, c], [T0 + 36e5, c]];
const ok = (tag, c = 0.9) => ({ ok: true, hours: H(c), source: tag });

async function rig() {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const { createWeather } = await import("../src/renderer/weather3d.js");
  const asked = [];
  globalThis.window = { api: { geo: { clouds: (lat, lon, utc, live) => new Promise((res, rej) => asked.push({ lat, lon, utc, live, res, rej })) } } };
  let clock = 1e6;
  const pn = performance.now;
  Object.defineProperty(performance, "now", { value: () => clock, configurable: true, writable: true });
  const W = createWeather({ scene: new THREE.Scene(), renderer: { toneMappingExposure: 1 }, daySky: null, fairEnv: () => null });
  const lights = { hemi: new THREE.HemisphereLight(), sun: new THREE.DirectionalLight(), fog: new THREE.Fog(0xffffff, 1, 2), camera: new THREE.PerspectiveCamera() };
  const replay = (name) => ({ isLive: false, events: [], state: {}, now: () => 0, utcAt: (t) => T0 + t, name });
  const live = (key) => ({ isLive: true, state: { SessionInfo: { Key: key } }, now: () => 0, utcAt: (t) => T0 + t });
  const world = (lat = 50.44, lon = 5.97) => ({ geoCenter: [lat, lon] });
  const A = (src, key) => ({ src, t: 0, rate: 1, sourceKey: () => key });
  const step = async (a, w, n = 1) => { for (let i = 0; i < n; i++) { W.update({ A: a, world: w, dt: 0.016, night: true, ...lights }); clock += 16; } await new Promise((r) => setImmediate(r)); W.update({ A: a, world: w, dt: 0.016, night: true, ...lights }); };
  const shown = () => W.env.cloudData;
  const done = () => { Object.defineProperty(performance, "now", { value: pn, configurable: true, writable: true }); delete globalThis.window; W.dispose(); };
  return { W, asked, step, shown, replay, live, world, A, done, tick: (ms) => { clock += ms; } };
}

test("clouds45 §6: session A → B → back to A – A's first (older) answer arriving after the new A request's doesn't replace it, success or failure", async () => {
  for (const late of [{ ok: false, reason: "HTTP 500" }, ok("A-old", 0.1), "reject"]) {
    const R = await rig(), sa = R.replay("A"), sb = R.replay("B"), w = R.world(), Aa = R.A(sa, "replay:A"), Ab = R.A(sb, "replay:B");
    await R.step(Aa, w); await R.step(Ab, w); await R.step(Aa, w);
    assert.strictEqual(R.asked.length, 3, "A, B, A asked");
    R.asked[2].res(ok("A-new")); await R.step(Aa, w);
    assert.strictEqual(R.shown(), "A-new");
    R.asked[1].res(ok("B")); await R.step(Aa, w);
    assert.strictEqual(R.shown(), "A-new", "B's late answer ignored");
    if (late === "reject") R.asked[0].rej(new Error("ipc")); else R.asked[0].res(late);
    await R.step(Aa, w);
    assert.strictEqual(R.shown(), "A-new", `A's stale ${late === "reject" ? "rejection" : late.ok ? "success" : "failure"} doesn't overwrite the newer answer`);
    R.done();
  }
});

test("clouds45 §6: the same live key – an older refresh answering after a newer one is ignored", async () => {
  for (const late of [ok("L-old", 0.1), { ok: false, reason: "timeout" }]) {
    const R = await rig(), s = R.live(7), w = R.world(), a = R.A(s, "live:7:0");
    await R.step(a, w);
    R.tick(16 * 60e3); await R.step(a, w);
    assert.strictEqual(R.asked.length, 2, "asked again after 15 min");
    R.asked[1].res(ok("L-new")); await R.step(a, w);
    assert.strictEqual(R.shown(), "L-new");
    R.asked[0].res(late); await R.step(a, w);
    assert.strictEqual(R.shown(), "L-new", `the older ${late.ok ? "success" : "failure"} ignored`);
    R.done();
  }
});

test("clouds45 §6: cloud data off → on, and reset() then the same session again – the request from before doesn't land on the new one", async () => {
  for (const how of ["configure", "reset"]) {
    const R = await rig(), s = R.replay("A"), w = R.world(), a = R.A(s, "replay:A");
    await R.step(a, w);
    if (how === "configure") { R.W.configure({ clouds: false }); await R.step(a, w); R.W.configure({ clouds: true }); } else R.W.reset();
    await R.step(a, w);
    assert.strictEqual(R.asked.length, 2, `${how}: asked again`);
    R.asked[1].res(ok("new")); await R.step(a, w);
    assert.strictEqual(R.shown(), "new");
    R.asked[0].res({ ok: false, reason: "HTTP 503" }); await R.step(a, w);
    assert.strictEqual(R.shown(), "new", `${how}: the old failure ignored`);
    R.done();
  }
  // off: an answer arriving while the data is off is not shown, and not kept for later
  const R = await rig(), s = R.replay("A"), w = R.world(), a = R.A(s, "replay:A");
  await R.step(a, w); R.W.configure({ clouds: false }); R.asked[0].res(ok("while-off")); await R.step(a, w);
  assert.strictEqual(R.shown(), null);
  R.W.configure({ clouds: true }); await R.step(a, w);
  assert.strictEqual(R.shown(), null, "not the answer that came while off"); assert.strictEqual(R.asked.length, 2);
  R.done();
});

test("clouds45 §6: a rebuilt world – the same place keeps its answer (in flight or arrived, no new request); another place's old answer is ignored", async () => {
  const R = await rig(), s = R.replay("A"), a = R.A(s, "replay:A");
  await R.step(a, R.world());
  const w2 = R.world(); await R.step(a, w2, 50);
  assert.strictEqual(R.asked.length, 1, "no request per frame or for the rebuilt world");
  R.asked[0].res(ok("A")); await R.step(a, w2);
  assert.strictEqual(R.shown(), "A", "the in-flight answer for the same place lands on the rebuilt world");
  const w3 = R.world(); await R.step(a, w3);
  assert.strictEqual(R.shown(), "A"); assert.strictEqual(R.asked.length, 1);
  // another place (a different geo centre): asked anew; the first place's answer arriving late is ignored
  const R2 = await rig(), s2 = R2.replay("A"), a2 = R2.A(s2, "replay:A");
  await R2.step(a2, R2.world()); const far = R2.world(43.73, 7.42); await R2.step(a2, far);
  assert.strictEqual(R2.asked.length, 2);
  R2.asked[1].res(ok("far")); await R2.step(a2, far); R2.asked[0].res(ok("near")); await R2.step(a2, far);
  assert.strictEqual(R2.shown(), "far");
  R.done(); R2.done();
});

test("clouds45 §6: live – a failed 15-min refresh keeps the last good value while its hour is still near the moment shown; neutral once stale; a new live session never shows the last one's value", async () => {
  const R = await rig(), s = R.live(7), w = R.world(), a = R.A(s, "live:7:0");
  await R.step(a, w); R.asked[0].res(ok("L1")); await R.step(a, w);
  assert.strictEqual(R.shown(), "L1");
  for (const fail of [{ ok: false, reason: "HTTP 503" }, "reject"]) {
    R.tick(16 * 60e3); await R.step(a, w);
    const q = R.asked.at(-1); if (fail === "reject") q.rej(new Error("ipc")); else q.res(fail);
    await R.step(a, w);
    assert.strictEqual(R.shown(), "L1", `the refresh's ${fail === "reject" ? "rejection" : "failure"} keeps the still-valid value`);
  }
  // stale: the moment shown is 3 h on – the kept hours (T0 ± 1 h) are more than 90 min away – neutral
  a.t = 3 * 36e5; await R.step(a, w);
  assert.strictEqual(R.shown(), null, "a stale value falls back to neutral");
  // a new live session at the same place (another key; the app keeps the live source object and map3d.js rebuilds the
  // world when the session changes): the last session's value isn't shown while its own answer is pending, nor after it fails
  s.state.SessionInfo.Key = 8; const b = R.A(s, "live:8:0"), w2 = R.world(), n = R.asked.length; await R.step(b, w2);
  assert.strictEqual(R.asked.length, n + 1, "the new session asked");
  assert.strictEqual(R.shown(), null, "not the last session's value while its own answer is pending");
  R.asked.at(-1).res({ ok: false, reason: "timeout" }); await R.step(b, w2);
  assert.strictEqual(R.shown(), null, "nor after its own refresh fails");
  R.done();
});
