// v0.41: the wheels' odometer (wheelspin.js) against the data as a live feed delivers it – positions arriving after the
// speed samples for the same moments, both cut from the front of their buffers (replay.js LiveSource) – and through holes
// in the telemetry. Each test is a reproduction of a defect of the v0.40 odometer; the expected values come from the
// data (a fresh build on everything, the distance the positions cover), never from this implementation's own output.
const test = require("node:test");
const assert = require("node:assert");
const RK = require("../src/renderer/replay.js");
const W = () => import("../src/renderer/wheelspin.js");

// a car's position track as replay.js keeps it live (CarTracks.push: plain arrays, decimetres)
function liveTrack() { const tr = new RK.CarTracks(); return { tr, push: (t, xm, ym = 0) => tr.push("1", t, [xm * 10, ym * 10, 0]), get trk() { return tr.cars["1"]; } }; }
// a deterministic pseudo-random sequence
function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

test("section 7 as reported: t [0, 1000, 2000] at 36 km/h, judged moving, then the positions show the car standing – 0 m at 1 s, as a fresh build", async () => {
  const { odometerAt } = await W();
  const car = { t: [0, 1000, 2000], v: [36, 36, 36] }, P = liveTrack();
  // positions so far end 2.5 s before the first speed sample: no standing verdict possible yet (moving by the speed)
  for (let t = -4000; t <= -2500; t += 250) P.push(t, 100);
  assert.strictEqual(odometerAt(car, 1000, P.trk), 10, "first answer: 10 m (36 km/h for 1 s)");
  // the positions for the moment come in: the car never moved
  for (let t = -2250; t <= 2000; t += 250) P.push(t, 100);
  const fresh = { t: [0, 1000, 2000], v: [36, 36, 36] };
  assert.strictEqual(odometerAt(fresh, 1000, P.trk), 0, "fresh: standing");
  assert.strictEqual(odometerAt(car, 1000, P.trk), 0, "the cache built before the positions arrived must follow them (v0.40: 10 m for good)");
  assert.strictEqual(odometerAt(car, 2000, P.trk), 0);
});

// A synthetic stint: 30 s at 60 m/s, braking to 22 m/s, a stop of 4 s at 40–44 s with the wheel-speed figure jumping
// (the jacks up, the crew spinning the wheels) and the positions standing, away again. Telemetry at 4 Hz, positions at
// 4 Hz offset by 110 ms. Both arrive as live batches about once a second, the positions late by a random 0–1.6 s.
function stint() {
  const v = (t) => t < 30000 ? 60 : t < 36000 ? 60 - (38 * (t - 30000)) / 6000 : t < 39000 ? 22 - (22 * (t - 36000)) / 3000 : t < 44000 ? 0 : t < 48000 ? (22 * (t - 44000)) / 4000 : 22;
  const tel = [], pos = []; let x = 0, tp = -1000;
  for (let t = 0; t <= 70000; t += 250) tel.push([t, (t >= 40500 && t <= 43000 ? 40 + ((t / 250) % 3) * 5 : v(t)) * 3.6]);
  for (let t = 110; t <= 70110; t += 250) { x += (v(t) + v(tp)) / 2 * ((t - tp) / 1000); tp = t; pos.push([t, x]); }
  return { tel, pos, v };
}
test("live arrival order: positions late by up to 1.6 s – once all is in, every sample's distance equals a fresh build; confirmed samples never change; the stop adds nothing", async () => {
  const { odometer, odometerAt } = await W();
  const { tel, pos } = stint();
  for (const seed of [1, 7, 42, 1234]) {
    const r = rnd(seed), car = { t: [], v: [] }, P = liveTrack();
    // batches: telemetry every ~1 s; each positions batch held back a random 0–1.6 s
    const msgs = [];
    for (let i = 0; i < tel.length; i += 4) msgs.push({ at: tel[Math.min(i + 3, tel.length - 1)][0], tel: tel.slice(i, i + 4) });
    // (one stream: the positions' batches keep their order among themselves – CarTracks.push drops a sample older than
    // its last)
    let last = -Infinity;
    for (let i = 0; i < pos.length; i += 4) msgs.push({ at: (last = Math.max(last, pos[Math.min(i + 3, pos.length - 1)][0] + r() * 1600)), pos: pos.slice(i, i + 4) });
    msgs.sort((a, b) => a.at - b.at);
    const final = new Map();   // sample time → its distance once its positions were in
    let k = 0;
    for (let now = 0; now <= 72000; now += 50) {
      while (k < msgs.length && msgs[k].at <= now) { const m = msgs[k++]; if (m.tel) for (const [t, vv] of m.tel) { car.t.push(t); car.v.push(vv); } else for (const [t, x] of m.pos) P.push(t, x); }
      odometerAt(car, now - 600, P.trk || null);
      // every sample whose time the positions have reached: its distance must never change again
      const o = car.odo; if (!o || !P.trk) continue;
      const pt = P.trk.t[P.trk.n - 1];
      for (let i = 1; i < o.n; i++) {
        if (car.t[i] > pt) break;
        const was = final.get(car.t[i]);
        if (was == null) final.set(car.t[i], o.d[i]); else assert.strictEqual(o.d[i], was, `seed ${seed}: confirmed sample ${car.t[i]} changed`);
      }
    }
    odometerAt(car, 71000, P.trk);
    const fresh = { t: car.t.slice(), v: car.v.slice() }; odometer(fresh, P.trk);
    for (let i = 0; i < car.t.length; i++) assert.ok(Math.abs(car.odo.d[i] - fresh.odo.d[i]) < 1e-9, `seed ${seed}: sample ${car.t[i]}: live ${car.odo.d[i]} vs fresh ${fresh.odo.d[i]}`);
    // the stop (the positions standing from 39.1 s to 44 s): the jumping wheel-speed figure turned nothing
    assert.ok(odometerAt(car, 43900, P.trk) - odometerAt(car, 40300, P.trk) < 1e-9, `seed ${seed}: the wheels turned during the stop: ${odometerAt(car, 40300, P.trk)} → ${odometerAt(car, 43900, P.trk)}`);
  }
});

test("live trim before the odometer was built that far: the distances carry on from where they were (v0.40: started again from 0)", async () => {
  const { odometerAt } = await W();
  const L = new RK.LiveSource(), iso = (t) => new Date(Date.UTC(2026, 0, 1) + t).toISOString();
  const all = { t: [], v: [] }, vAt = (t) => 150 + 100 * Math.sin(t / 7000);
  let asked = null;
  for (let t = 0; t <= 420000; t += 250) {
    // one sample per message (Utc = its arrival: replay.js stamps the newest entry with the arrival time)
    L.applyOne(t, "CarData", { Entries: [{ Utc: iso(t), Cars: { 1: { Channels: { 2: vAt(t) } } } }] });
    L.applyOne(t, "Position", { Position: [{ Timestamp: iso(t + 100), Entries: { 1: { X: t, Y: 0, Z: 0 } } }] });
    all.t.push(t); all.v.push(vAt(t));
    // the 3D view looked once early on (the odometer built to ~12 s), then not again until the samples had been cut
    if (t === 12000) asked = odometerAt(L.car["1"], 12000, L.tracks.cars["1"]);
  }
  const c = L.car["1"];
  assert.ok(c.t[0] > 12000 + 200 * 250, "the samples the odometer was built over were cut");
  assert.ok(asked > 0);
  for (const t of [c.t[0] + 1000, 300000, 419000]) {
    const ref = odometerAt(all, t);   // every sample, no positions: the speed throughout (the positions here never stand)
    assert.ok(Math.abs(odometerAt(c, t, L.tracks.cars["1"]) - ref) < 1e-6, `t ${t}: ${odometerAt(c, t, L.tracks.cars["1"])} vs ${ref}`);
  }
});

test("positions cut from the live buffer (CarTracks.trim, 2 min): their own distance carries on", async () => {
  const { trackDist } = await W();
  const P = liveTrack();
  for (let t = 0; t <= 60000; t += 250) P.push(t, t / 50);   // 20 m/s
  const before = trackDist(P.trk, 59000);
  for (let t = 60250; t <= 200000; t += 250) P.push(t, t / 50);
  P.tr.trim(200000 - 120e3);
  assert.ok(P.trk.t[0] > 59000);
  assert.ok(Math.abs(trackDist(P.trk, 199000) - 199000 / 50) < 1e-6, "the whole path's length, the cut part included");
  assert.ok(Math.abs(before - 59000 / 50) < 1e-9);
});

// A car at 50 m/s on a straight: positions all along, telemetry with a hole from 20 s to 35 s, starting at 5 s and
// ending at 60 s while the positions go on to 70 s.
function holed(typed) {
  const tel = { t: [], v: [] }, P = liveTrack();
  for (let t = 5000; t <= 60000; t += 250) if (t <= 20000 || t >= 35000) { tel.t.push(t); tel.v.push(180); }
  for (let t = 0; t <= 70000; t += 250) P.push(t + 80, (t + 80) / 20);
  if (typed) { tel.t = Float64Array.from(tel.t); tel.v = Float64Array.from(tel.v); }
  return { tel, trk: P.trk };
}
test("telemetry missing (before it starts, a 15 s hole, after it ends): the distance goes on by the positions – no jump in or out, the same at any playback rate", async () => {
  const { odometerAt } = await W();
  const { tel, trk } = holed(true);
  for (const rate of [0.25, 1, 4]) {
    let prev = null;
    for (let t = 1000; t <= 69000; t += (1000 / 60) * rate) {
      const d = odometerAt(tel, t, trk);
      assert.ok(d != null, `t ${t}: no distance (v0.40: null inside the hole – the path rules, another origin)`);
      if (prev) { const step = d - prev[1], dt = (t - prev[0]) / 1000; assert.ok(step >= -1e-9 && step <= 50 * 1.05 * dt + 1e-6, `rate ${rate}, t ${t.toFixed(0)}: moved ${step.toFixed(3)} m in ${dt.toFixed(4)} s`); }
      prev = [t, d];
    }
  }
  // over the hole: what the positions covered (15 s at 50 m/s)
  assert.ok(Math.abs(odometerAt(tel, 35000, trk) - odometerAt(tel, 20000, trk) - 750) < 0.5);
});

test("seeks in any order give the distance a straight play gives (holes, the stop, before and after the telemetry)", async () => {
  const { odometerAt } = await W();
  const times = [500, 4000, 5100, 12345, 20000, 20100, 27000, 34990, 35000, 41000, 59999, 60100, 66000];
  const a = holed(true), seq = new Map();
  for (let t = 0; t <= 70000; t += 16.7) odometerAt(a.tel, t, a.trk);
  for (const t of times) seq.set(t, odometerAt(a.tel, t, a.trk));
  for (const seed of [3, 9, 27]) {
    const r = rnd(seed), b = holed(true), order = times.slice().sort(() => r() - 0.5);
    for (const t of order) assert.strictEqual(odometerAt(b.tel, t, b.trk), seq.get(t), `seed ${seed}: t ${t}`);
  }
});

test("no telemetry: the positions' own distance; telemetry starting later (live) carries on from it without a jump", async () => {
  const { odometerAt, trackDist } = await W();
  const P = liveTrack();
  for (let t = 0; t <= 30000; t += 250) P.push(t, t / 40);   // 25 m/s
  assert.strictEqual(odometerAt(undefined, 10000, P.trk), trackDist(P.trk, 10000));
  assert.strictEqual(odometerAt(undefined, 10000, null), null, "neither: the path rules");
  const before = odometerAt(undefined, 20000, P.trk);
  const tel = { t: [], v: [] }; for (let t = 20000; t <= 30000; t += 250) { tel.t.push(t); tel.v.push(90); }
  assert.ok(Math.abs(odometerAt(tel, 20000, P.trk) - before) < 1e-9, "at the first speed sample: the distance the positions had reached");
  assert.ok(Math.abs(odometerAt(tel, 19000, P.trk) - odometerAt(undefined, 19000, P.trk)) < 1e-9, "before it: the same measure");
});

test("standing with noisy positions (±0.2 m) and a jittering speed figure (0–4 km/h): the wheels stay still", async () => {
  const { odometerAt, trackDist } = await W();
  const r = rnd(5), P = liveTrack(), car = { t: [], v: [] };
  for (let t = 0; t <= 20000; t += 250) { P.push(t + 60, 500 + (r() - 0.5) * 0.4, 30 + (r() - 0.5) * 0.4); car.t.push(t); car.v.push(Math.floor(r() * 5)); }
  assert.strictEqual(odometerAt(car, 19500, P.trk) - odometerAt(car, 2000, P.trk), 0);
  assert.strictEqual(trackDist(P.trk, 19500) - trackDist(P.trk, 2000), 0);
});

test("live reconnect: a 10 s outage then a fresh snapshot of the same session – the wheels go on from where the car is, no jump in or out", async () => {
  const { odometerAt } = await W();
  const L = new RK.LiveSource(), iso = (t) => new Date(Date.UTC(2026, 0, 1) + t).toISOString();
  L.apply({ at: 0, snap: { SessionInfo: { Key: 9 } } });
  const feed = (t) => {   // 40 m/s on a straight; one sample per message
    L.applyOne(t, "CarData", { Entries: [{ Utc: iso(t), Cars: { 1: { Channels: { 2: 144 } } } }] });
    L.applyOne(t + 30, "Position", { Position: [{ Timestamp: iso(t + 30), Entries: { 1: { X: (t + 30) * 0.4, Y: 1, Z: 0 } } }] });
  };
  // the wheels' distance against where the car is drawn (CarTracks.at, as the view does): the offset between the two
  // must stay put through the outage and the reconnect – the wheels neither stop while the car moves nor make up a turn
  let off = null, n = 0;
  const p = [0, 0, 0];
  for (let now = 0; now <= 60000; now += 1000 / 60) {
    const t = Math.round(now);
    if (t % 250 === 0 && (t < 20000 || t > 30000)) feed(t);
    if (t === 30250) L.apply({ at: t, snap: { SessionInfo: { Key: 9 } } });   // reconnect: same session, its history kept
    // drawn 0.6 s back, no later than the newest position (map3d rollWheels)
    const trk = L.tracks.cars["1"]; if (!trk || now < 2000) continue;
    const tw = Math.min(now - 600, Math.max(trk.t[trk.n - 1], now - 4600)), d = odometerAt(L.car["1"], tw, trk);
    if (!L.tracks.at("1", now - 600, p)) continue;   // (not drawn: more than 4 s without positions)
    const o = d - p[0] * 0.1; if (off == null) off = o;
    assert.ok(Math.abs(o - off) < 0.6, `t ${t}: wheels ${d.toFixed(2)} m, car at ${(p[0] * 0.1).toFixed(2)} m – off by ${(o - off).toFixed(2)}`);
    n++;
  }
  assert.ok(n > 2500);
});
