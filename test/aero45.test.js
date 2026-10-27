// v0.45 active aero: the zone's entry is the time the car really crossed the zone's start (its position history –
// smooth.js track coordinates), not t − (metres in) / (speed now); the brake of THAT pass closes the flaps for the rest
// of it (whatever the speed does next); a pure function of t and the history up to t (seek = play, live never looks
// ahead).
const test = require("node:test");
const assert = require("node:assert");
const load = () => import("../src/renderer/aero.js");

// a position history like smooth.js tr.coords[num]: { t, s (continuous within a run), run } every 125 ms, s linear
// between the given [t, s] points; run: a function of t (0 = off the lap line: the pit lane)
function hist(points, { step = 125, run = () => 1, t0 = points[0][0], t1 = points[points.length - 1][0] } = {}) {
  const t = [], s = [], r = [];
  for (let tt = t0; tt <= t1; tt += step) {
    let k = 0; while (k + 2 < points.length && points[k + 1][0] <= tt) k++;
    const [ta, sa] = points[k], [tb, sb] = points[k + 1], f = (tt - ta) / (tb - ta);
    t.push(tt); s.push(sa + (sb - sa) * f); r.push(run(tt));
  }
  return { t: Float64Array.from(t), s: Float64Array.from(s), run: Int32Array.from(r) };
}
// telemetry every 250 ms: brake on at the given times (± 125 ms), speed v(t)
function telOf(t1, brakeAt = [], v = () => 250, t0 = 0) {
  const tel = { t: [], v: [], brk: [] };
  for (let t = t0; t <= t1; t += 250) { tel.t.push(t); tel.v.push(v(t)); tel.brk.push(brakeAt.some((b) => Math.abs(b - t) < 125) ? 1 : 0); }
  return tel;
}
const sOf = (H, t) => { let i = 0; while (i + 1 < H.t.length && H.t[i + 1] <= t) i++; const f = i + 1 < H.t.length ? (t - H.t[i]) / (H.t[i + 1] - H.t[i]) : 0; return i + 1 < H.t.length ? H.s[i] + (H.s[i + 1] - H.s[i]) * f : H.s[i]; };
const base = (o) => ({ allowed: true, onTrack: true, racing: true, mode: "normal", L: 5000, ...o });

test("the request's repro: a brake inside the zone keeps it shut when the car is faster later in the same zone", async () => {
  const { activeAeroAt } = await load();
  const spans = [{ a: 0, b: 1000, len: 1000, z: {} }];
  const tel = { t: [0, 5000, 6000, 10000, 15000], brk: [0, 1, 0, 0, 0] };
  // the car's history: in the zone (s 5000 ≡ 0) at 1 s, 222 m in when it braked (5 s), 500 m in at 10 s, 700 m at 15 s
  const H = hist([[0, 4940], [1000, 5000], [10000, 5500], [15000, 5700]]);
  const a = activeAeroAt(base({ spans, tel, hist: H, t: 10000, s: 500, speed: 200 }));
  assert.strictEqual(a.open, 0); assert.strictEqual(a.why, "braking");
  const b = activeAeroAt(base({ spans, tel, hist: H, t: 15000, s: 700, speed: 300 }));
  assert.strictEqual(b.open, 0, `t=15000 s=700 speed=300: ${JSON.stringify(b)}`); assert.strictEqual(b.why, "braking");
  // the entry is the crossing (1 s), whatever the speed now
  assert.strictEqual(Math.round(b.tEntry), 1000); assert.strictEqual(b.entryKnown, true);
});

test("the speed now does not move the entry: accelerating, slowing and a single short brake sample", async () => {
  const { activeAeroAt, MOVE } = await load();
  const spans = [{ a: 1000, b: 2200, len: 1200, z: {} }];
  // 60 m/s at entry (t 10 s at s 1000) rising to 90 m/s
  const H = hist([[0, 400], [10000, 1000], [15000, 1375], [20000, 1825], [25000, 2275], [40000, 3600]]);
  const free = telOf(40000);
  for (let t = 10600; t < 24000; t += 700) for (const speed of [120, 210, 340, 160]) {
    const r = activeAeroAt(base({ spans, tel: free, hist: H, t, s: sOf(H, t) % 5000, speed }));
    assert.strictEqual(r.open, 1, `no brake: open at ${t} / ${speed} (${r.why})`); assert.strictEqual(Math.round(r.tEntry), 10000);
  }
  // one 250 ms brake sample at 14 s (a dab): shut from then to the end of the pass, at any speed
  const dab = telOf(40000, [14000]);
  assert.ok(activeAeroAt(base({ spans, tel: dab, hist: H, t: 13900, s: sOf(H, 13900), speed: 300 })).open === 1, "before the dab");
  for (let t = 14000 + MOVE.close * 1000 + 1; t < 24000; t += 450) for (const speed of [300, 340, 120]) {
    const r = activeAeroAt(base({ spans, tel: dab, hist: H, t, s: sOf(H, t), speed }));
    assert.strictEqual(r.open, 0, `after the dab at ${t} / ${speed}`); assert.strictEqual(r.why, "braking");
  }
  // past the zone's end: shut ("zone end" there – the dab came first: still the brake)
  assert.strictEqual(activeAeroAt(base({ spans, tel: dab, hist: H, t: 25500, s: sOf(H, 25500), speed: 300 })).open, 0);
  assert.strictEqual(activeAeroAt(base({ spans, tel: free, hist: H, t: 25500, s: sOf(H, 25500), speed: 300 })).why, "zone end");
});

test("a zone across the lap line's start, and the same zone on the next lap (the old lap's brake is not this pass's)", async () => {
  const { activeAeroAt } = await load();
  const spans = [{ a: 4800, b: 300, len: 500, z: {} }, { a: 2000, b: 2600, len: 600, z: {} }];
  // 80 m/s; lap 1 enters the zone at 20 s (s 4800), crosses the line at 22.5 s, leaves it at 26.25 s; lap 2 enters at 82.5 s
  const H = hist([[0, 3200], [20000, 4800], [100000, 11200]]);
  const brakes = [20900];   // at s 4872 – inside the zone, before the line
  const tel = telOf(100000, brakes, () => 288);
  for (const t of [22500, 24000, 26000]) { const r = activeAeroAt(base({ spans, tel, hist: H, t, s: sOf(H, t) % 5000, speed: 330 })); assert.strictEqual(r.open, 0, `lap 1 across the line, ${t}`); }
  // no brake: open on both sides of the line, the entry the crossing of 4800
  const free = telOf(100000, [], () => 288);
  const r = activeAeroAt(base({ spans, tel: free, hist: H, t: 23000, s: sOf(H, 23000) % 5000, speed: 288 }));
  assert.strictEqual(r.open, 1); assert.strictEqual(Math.round(r.tEntry), 20000);
  // lap 2: the same zone again – lap 1's brake is not in this pass
  for (const t of [84000, 86000]) { const q = activeAeroAt(base({ spans, tel, hist: H, t, s: sOf(H, t) % 5000, speed: 288 })); assert.strictEqual(q.open, 1, `lap 2 at ${t}: ${q.why}`); assert.strictEqual(Math.round(q.tEntry), 82500); }
});

test("data that starts inside a zone: the entry is unknown – the brake looked for from the first sample (labelled)", async () => {
  const { activeAeroAt } = await load();
  const spans = [{ a: 1000, b: 2200, len: 1200, z: {} }];
  const H = hist([[5000, 1300], [20000, 2500]]);   // the data begins 300 m into the zone
  const r = activeAeroAt(base({ spans, tel: telOf(20000), hist: H, t: 8000, s: sOf(H, 8000), speed: 290 }));
  assert.strictEqual(r.open, 1); assert.strictEqual(r.entryKnown, false); assert.match(r.why, /entry not in the data/);
  const b = activeAeroAt(base({ spans, tel: telOf(20000, [6000]), hist: H, t: 9000, s: sOf(H, 9000), speed: 290 }));
  assert.strictEqual(b.open, 0); assert.strictEqual(b.why, "braking");
  // a brake BEFORE the data began (telemetry without positions) is not counted: where the car was is unknown
  const c = activeAeroAt(base({ spans, tel: telOf(20000, [3000]), hist: H, t: 9000, s: sOf(H, 9000), speed: 290 }));
  assert.strictEqual(c.open, 1);
});

test("missing position samples: a gap that splits the history is bridged (the earlier brake still counts); a long one is not", async () => {
  const { activeAeroAt } = await load();
  const spans = [{ a: 1000, b: 2600, len: 1600, z: {} }];
  // 80 m/s: enters at 10 s; positions missing 13–19 s (smooth.js starts a new run after a gap ≥ 4 s, s re-based)
  const A = hist([[0, 200], [10000, 1000], [13000, 1240]]), B = hist([[19000, 1720 + 5000], [26000, 2280 + 5000]]);
  const H = { t: Float64Array.from([...A.t, ...B.t]), s: Float64Array.from([...A.s, ...B.s]), run: Int32Array.from([...A.t].map(() => 3).concat([...B.t].map(() => 4))) };
  const tel = telOf(30000, [12000], () => 288);
  const r = activeAeroAt(base({ spans, tel, hist: H, t: 21000, s: 1880, speed: 300 }));
  assert.strictEqual(r.open, 0, `bridged: ${r.why}`); assert.strictEqual(Math.round(r.tEntry), 10000); assert.strictEqual(r.entryKnown, true);
  assert.strictEqual(activeAeroAt(base({ spans, tel: telOf(30000, [], () => 288), hist: H, t: 21000, s: 1880, speed: 300 })).open, 1);
  // the entry inside the gap: interpolated across it
  const C = hist([[19000, 1400 + 5000], [26000, 1960 + 5000]]), A2 = hist([[0, 100], [8000, 900]]);
  const H2 = { t: Float64Array.from([...A2.t, ...C.t]), s: Float64Array.from([...A2.s, ...C.s]), run: Int32Array.from([...A2.t].map(() => 1).concat([...C.t].map(() => 2))) };
  const q = activeAeroAt(base({ spans, tel: telOf(30000, [], () => 288), hist: H2, t: 20000, s: 1480, speed: 288 }));
  assert.ok(q.entryKnown && q.tEntry > 8000 && q.tEntry < 19000, `${q.tEntry}`);
  // a gap longer than the bridge (or after the pit lane): the entry unknown, from the first sample after it
  const D = hist([[60000, 1720], [66000, 2200]]);
  const H3 = { t: Float64Array.from([...A.t, ...D.t]), s: Float64Array.from([...A.s, ...D.s]), run: Int32Array.from([...A.t].map(() => 3).concat([...D.t].map(() => 4))) };
  const u = activeAeroAt(base({ spans, tel: telOf(70000, [12000]), hist: H3, t: 62000, s: sOf(D, 62000), speed: 288 }));
  assert.strictEqual(u.entryKnown, false); assert.strictEqual(u.open, 1);
});

test("pit lane: shut in it; out of the pit exit into a zone – the entry unknown, the pit lane's braking not counted", async () => {
  const { activeAeroAt } = await load();
  const spans = [{ a: 1000, b: 2600, len: 1600, z: {} }];
  // in the pit lane (run 0) until 30 s, rejoining 200 m into the zone
  const H = hist([[0, 0], [30000, 1200], [40000, 2000]], { run: (t) => (t < 30000 ? 0 : 1) });
  const tel = telOf(40000, [5000, 28000]);
  assert.strictEqual(activeAeroAt(base({ spans, tel, hist: H, t: 29000, s: 1160, speed: 80, onTrack: false })).open, 0);
  const r = activeAeroAt(base({ spans, tel, hist: H, t: 33000, s: sOf(H, 33000), speed: 250 }));
  assert.strictEqual(r.open, 1, r.why); assert.strictEqual(r.entryKnown, false);
  // pit entry from a zone: off the lap line – shut at once
  assert.strictEqual(activeAeroAt(base({ spans, tel, hist: H, t: 36000, s: sOf(H, 36000), speed: 250, onTrack: false })).open, 0);
});

test("stop and restart in a zone: shut while slow, and still shut for the rest of that pass (it braked to stop)", async () => {
  const { activeAeroAt } = await load();
  const spans = [{ a: 1000, b: 2600, len: 1600, z: {} }];
  // in at 10 s, brakes at 12 s, stands 14–20 s at s 1300, off again
  const H = hist([[0, 200], [10000, 1000], [12000, 1200], [14000, 1300], [20000, 1300], [30000, 2100]]);
  const tel = telOf(30000, [12000, 12250, 12500, 12750, 13000, 13500], (t) => (t > 13800 && t < 20000 ? 0 : 200));
  assert.strictEqual(activeAeroAt(base({ spans, tel, hist: H, t: 17000, s: 1300, speed: 0 })).open, 0);
  for (const t of [24000, 27000, 29000]) assert.strictEqual(activeAeroAt(base({ spans, tel, hist: H, t, s: sOf(H, t), speed: 260 })).open, 0, `${t}`);
});

test("determinism: seek, rewind, pause and any playback speed give the same state as playing through (a function of t)", async () => {
  const { activeAeroAt } = await load();
  const spans = [{ a: 4800, b: 300, len: 500, z: {} }, { a: 1000, b: 2600, len: 1600, z: {} }];
  const H = hist([[0, 0], [30000, 2000], [60000, 4400], [90000, 7400], [120000, 9500]]);
  const tel = telOf(120000, [21000, 52000, 74000, 101000], (t) => 180 + ((t / 1000) % 60) * 2);
  const inpAt = (H, tel, t) => base({ spans, tel, hist: H, t, s: sOf(H, t) % 5000, speed: 180 + ((t / 1000) % 60) * 2 });
  // fresh copies: no cache shared with the played-through run
  const copy = () => ({ H: { t: Float64Array.from(H.t), s: Float64Array.from(H.s), run: Int32Array.from(H.run) }, tel: { t: [...tel.t], v: [...tel.v], brk: [...tel.brk] } });
  const ref = new Map(); { const out = {}; for (let t = 0; t <= 120000; t += 16) { activeAeroAt(inpAt(H, tel, t), out); if (t % 400 === 0) ref.set(t, { ...out }); } }
  // seek straight to each time (cold), at another playback speed (every 400 ms / 4 s), backwards (rewind), and paused (the same t many times)
  const C = copy();
  for (const [t, want] of ref) assert.deepStrictEqual({ ...activeAeroAt(inpAt(C.H, C.tel, t), {}) }, want, `seek ${t}`);
  const out = {}; for (const t of [...ref.keys()].reverse()) assert.deepStrictEqual({ ...activeAeroAt(inpAt(H, tel, t), out) }, ref.get(t), `rewind ${t}`);
  for (let t = 0; t <= 120000; t += 4000) assert.deepStrictEqual({ ...activeAeroAt(inpAt(H, tel, t), out) }, ref.get(t), `x10 ${t}`);
  for (let k = 0; k < 5; k++) assert.deepStrictEqual({ ...activeAeroAt(inpAt(H, tel, 74400), out) }, ref.get(74400), "paused");
});

test("live: only the history up to now – the arrays cut at now give the same state as the whole record; a reconnect's fresh history", async () => {
  const { activeAeroAt } = await load();
  const spans = [{ a: 1000, b: 2600, len: 1600, z: {} }];
  const H = hist([[0, 0], [30000, 2000], [60000, 4400], [90000, 7400]]);
  const tel = telOf(90000, [21000, 52000], () => 250);
  const cut = (t, now) => { const k = H.t.findIndex((x) => x > t); const n = k < 0 ? H.t.length : k, m = tel.t.findIndex((x) => x > now); const q = m < 0 ? tel.t.length : m;
    return { H: { t: H.t.slice(0, n), s: H.s.slice(0, n), run: H.run.slice(0, n) }, tel: { t: tel.t.slice(0, q), v: tel.v.slice(0, q), brk: tel.brk.slice(0, q) } }; };
  for (let now = 1000; now <= 90000; now += 1300) {
    const t = now - 600, C = cut(t, now);   // (live: the car drawn 0.6 s behind the newest data)
    const a = activeAeroAt(base({ spans, tel, hist: H, t, now, s: sOf(H, t) % 5000, speed: 250 }), {});
    const b = activeAeroAt(base({ spans, tel: C.tel, hist: C.H, t, now, s: sOf(H, t) % 5000, speed: 250 }), {});
    assert.deepStrictEqual({ ...b }, { ...a }, `live ${now}`);
  }
  // a reconnect mid-zone: the history begins again at 77 s (s 6100 ≡ 1100, 100 m in) – the entry unknown
  const R = { t: H.t.filter((x) => x >= 77000), s: H.s.filter((_, i) => H.t[i] >= 77000), run: H.run.filter((_, i) => H.t[i] >= 77000) };
  const r = activeAeroAt(base({ spans, tel, hist: R, t: 79000, now: 79600, s: sOf(H, 79000) % 5000, speed: 250 }));
  assert.strictEqual(r.entryKnown, false); assert.strictEqual(r.open, 1);
});

test("the telemetry's lag against the positions (smooth.js telemetryLag): a brake sample is placed where the car was", async () => {
  const { activeAeroAt } = await load();
  const spans = [{ a: 1000, b: 2600, len: 1600, z: {} }];
  const H = hist([[0, 200], [10000, 1000], [30000, 2600], [40000, 3400]]);
  // the telemetry stamped 400 ms late: a brake stamped 10.25 s is the car at 9.85 s – before the zone: not this pass
  const tel = telOf(40000, [10250]);
  assert.strictEqual(activeAeroAt(base({ spans, tel, hist: H, t: 15000, s: sOf(H, 15000), speed: 288, lag: 400 })).open, 1);
  assert.strictEqual(activeAeroAt(base({ spans, tel, hist: H, t: 15000, s: sOf(H, 15000), speed: 288, lag: 0 })).open, 0);
});

test("the corner's braking carried across the zone's start: activated once off the brake; the next brake ends it for the pass", async () => {
  const { activeAeroAt, MOVE } = await load();
  const spans = [{ a: 1000, b: 2600, len: 1600, z: {} }];
  const H = hist([[0, 400], [10000, 1000], [30000, 2600], [40000, 3400]]);
  const tel = telOf(40000, [9500, 9750, 10000, 10250, 10500]);   // on the brake from 9.5 s to 10.5 s – across the entry (10 s)
  const at = (tel, t) => activeAeroAt(base({ spans, tel, hist: H, t, s: sOf(H, t), speed: 250 }));
  assert.strictEqual(at(tel, 10400).open, 0); assert.match(at(tel, 10400).why, /not yet activated/);
  const r = at(tel, 10750 + MOVE.open * 500); assert.ok(r.open > 0 && r.open < 1, `opening from the release: ${r.open}`);
  assert.strictEqual(at(tel, 14000).open, 1);
  const tel2 = telOf(40000, [9500, 9750, 10000, 10250, 10500, 16000]);
  for (const t of [16500, 20000, 28000]) assert.strictEqual(at(tel2, t).open, 0, `after the brake at 16 s: ${t}`);
  // a brake that begins at the zone's start (none just before it) is a brake in the zone
  assert.strictEqual(at(telOf(40000, [10000]), 14000).open, 0);
});

// through smooth.js itself (the input map3d's aeroPose builds): a car lapping a 1 km circle, speed varying (so the
// telemetry lag is found), brakes once inside the zone and is faster later in it – replay and live (the data cut at now,
// rebuilt as LiveSource's would be, the place 0.6 s behind) give the same state, and the old entry from the speed now
// (no history) would have reopened.
test("smooth.js coordinates as the history: replay and live (cut at now) agree; the in-zone brake holds", async () => {
  const { activeAeroAt } = await load();
  const { smoothedTracks } = await import("../src/renderer/smooth.js");
  const { CarTracks } = require("../src/renderer/replay.js");
  const R = 1000 / (2 * Math.PI), n = 1000, samples = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; samples.push({ i, p: { x: R * Math.cos(a), y: 0, z: R * Math.sin(a) }, tan: { x: -Math.sin(a), z: Math.cos(a) }, nor: { x: -Math.cos(a), z: -Math.sin(a) }, L: 6, R: -6 }); }
  const world = { samples, center: { x: 0, y: 0, z: 0 }, grid: { nearest: (x, z) => [samples.reduce((b, q) => ((q.p.x - x) ** 2 + (q.p.z - z) ** 2 < (b.p.x - x) ** 2 + (b.p.z - z) ** 2 ? q : b))] } };
  // v(t) m/s: 45 ± 15 over a 9 s cycle; positions at 4 Hz for 120 s, telemetry at 4 Hz
  const v = (t) => 45 + 15 * Math.sin((2 * Math.PI * t) / 9000), dt = 250, N = 481;
  const pt = new Float64Array(N), px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N), S = [];
  let s = 0;
  for (let k = 0; k < N; k++) { const t = k * dt; if (k) s += ((v(t) + v(t - dt)) / 2) * (dt / 1000); S.push(s); const a = ((s % 1000) / n) * 2 * Math.PI; pt[k] = t; px[k] = (R * Math.cos(a)) / 0.1; py[k] = -(R * Math.sin(a)) / 0.1; }
  const sAt = (t) => { const k = Math.min(N - 2, Math.floor(t / dt)), f = (t - k * dt) / dt; return S[k] + (S[k + 1] - S[k]) * f; };
  const tAtS = (x) => { let k = 0; while (S[k + 1] < x) k++; return (k + (x - S[k]) / (S[k + 1] - S[k])) * dt; };
  // the zone 300–800 m; on lap 3 (s 2300–2800) one brake sample 1.5 s after the entry; lap 4 free
  const tIn3 = tAtS(2300), tOut3 = tAtS(2800), tb = Math.round((tIn3 + 1500) / dt) * dt;
  const tel = { t: [], v: [], brk: [] }; for (let k = 0; k < N; k++) { tel.t.push(k * dt); tel.v.push(Math.round(v(k * dt) * 3.6)); tel.brk.push(k * dt === tb ? 1 : 0); }
  const cars = { 1: { t: pt, x: px, y: py, z: pz, n: N } };
  const rep = smoothedTracks({ isLive: false, car: { 1: tel }, tracks: { cars } }, world, CarTracks);
  assert.ok(rep?.coords("1"), "replay coords"); assert.strictEqual(rep.stateLag, 0); assert.ok(Math.abs(rep.telLag) <= 100, `lag ${rep.telLag}`);
  const L = rep.frame.L, spans = [{ a: 300, b: 800, len: 500, z: {} }], st = {};
  const replayAt = (t, speed) => { rep.state("1", t, st); return activeAeroAt(base({ spans, L, tel, hist: rep.coords("1"), lag: rep.telLag, t, now: null, s: ((st.s % L) + L) % L, speed }), {}); };
  const liveAt = (now, speed) => {
    const k = pt.findIndex((x) => x > now), m = k < 0 ? N : k;
    const lc = { 1: { t: pt.slice(0, m), x: px.slice(0, m), y: py.slice(0, m), z: pz.slice(0, m), n: m } }, lt = { t: tel.t.slice(0, m), v: tel.v.slice(0, m), brk: tel.brk.slice(0, m) };
    const lv = smoothedTracks({ isLive: true, car: { 1: lt }, tracks: { cars: lc } }, world, CarTracks); lv.update(now);
    if (!lv.state("1", now, st)) return null;
    return activeAeroAt(base({ spans, L, tel: lt, hist: lv.coords("1"), lag: lv.telLag, t: now - lv.stateLag, now, s: ((st.s % L) + L) % L, speed }), {});
  };
  let checked = 0;
  for (let t = tIn3 + 2500; t < tOut3 - 300; t += 700) {
    const r = replayAt(t, 330);
    assert.strictEqual(r.open, 0, `lap 3 after the brake, replay ${t}: ${r.why}`); assert.ok(Math.abs(r.tEntry - tIn3) < 150, `entry ${r.tEntry} vs ${tIn3}`);
    const l = liveAt(t + 600, 330); if (!l) continue; checked++;
    assert.strictEqual(l.open, r.open, `live ${t}`); assert.strictEqual(l.why, r.why); assert.ok(Math.abs(l.tEntry - r.tEntry) < 150, `live entry ${l.tEntry} vs ${r.tEntry}`);
  }
  assert.ok(checked >= 3, `live compared ${checked}`);
  // without the history (v0.44's entry from the speed now): reopened at 330 km/h late in the same pass
  const late = tOut3 - 400; rep.state("1", late, st);
  assert.strictEqual(activeAeroAt(base({ spans, L, tel, t: late, s: ((st.s % L) + L) % L, speed: 330 }), {}).open, 1, "(the v0.44 input reopens)");
  // lap 4: open again from its own entry, replay and live alike
  const tIn4 = tAtS(3300), t4 = tIn4 + 3000, r4 = replayAt(t4, 250), l4 = liveAt(t4 + 600, 250);
  assert.strictEqual(r4.open, 1, r4.why); assert.ok(Math.abs(r4.tEntry - tIn4) < 150); assert.strictEqual(l4.open, 1); assert.strictEqual(l4.entryKnown, true);
});
