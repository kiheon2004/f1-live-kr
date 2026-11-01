// Offline demo (npm run demo): a small SYNTHETIC session – an invented circuit, six invented cars, five laps – for trying
// the replay and the 3D view without F1's archive (closed to anonymous requests since 2026-10-16), a sign-in or a cache.
// Nothing here is a real race or a measurement: the motion is made by the rules below, with a fixed seed, so every run
// gives the same session.
//
// It is written as F1's archive files are (one "HH:MM:SS.mmm{json}" line per update, Position and CarData deflated and
// base64-encoded) and read back by the archive's own parsers (archive.js parseStream / flattenTracks / flattenCarData),
// so the page gets exactly the shape Archive.loadSession gives it and every later step (ReplayKit.Replay, smoothing,
// pit and start handling, the 3D view) is the real one. The session has no location and no circuit key: the 3D view
// then builds the circuit from the cars' own lap and its generic surroundings (no map download).
const zlib = require("node:zlib");
const { parseStream, flattenTracks, flattenCarData } = require("./archive");

const DEMO_PATH = "demo/synthetic";
const LAPS = 5;
const DT = 250;                 // ms between samples (F1 sends ~4 a second)
const PRE = 60000;              // the field standing on its grid before the lights go out
const COOL = 40000;             // after the leader's flag, before the data ends (the last car finishes too)
const BASE_UTC = Date.UTC(2000, 0, 1, 13, 0, 0);   // (a made-up date: nothing here happened)

// The circuit: a closed curve through these points (metres), centripetal Catmull-Rom, resampled every metre.
// The first three points lie on one line: the start/finish straight with the pit lane beside it.
const CONTROL = [[-300, 0], [0, 0], [300, 0], [470, 60], [520, 230], [400, 330], [230, 300], [120, 380],
  [-40, 420], [-220, 360], [-330, 250], [-450, 140], [-440, 30]];
const LAT_G = 28, ACC = 7.5, BRAKE = 32, VMAX = 86;     // m/s², m/s
const GRID_GAP = 8, GRID_SIDE = 2.2;                     // m between grid places along / across
const HEADWAY = 0.7;                                     // s: a car never runs closer than this behind the one ahead
const PIT = { car: 5, lap: 2, entry: -260, lane: -180, box: 0, laneEnd: 170, exit: 260, side: -18, limit: 22.2, stand: 2800 };

const DRIVERS = [
  ["11", "데모 A", "DMA", "데모 레드", "C8102E"], ["22", "데모 B", "DMB", "데모 레드", "C8102E"],
  ["33", "데모 C", "DMC", "데모 블루", "1E5BC6"], ["44", "데모 D", "DMD", "데모 블루", "1E5BC6"],
  ["55", "데모 E", "DME", "데모 그린", "2E9D5A"], ["66", "데모 F", "DMF", "데모 그린", "2E9D5A"],
];

// a small fixed-seed generator (mulberry32): the samples' metre-scale noise, the same every run
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function circuit() {
  const P = CONTROL, n = P.length, dense = [];
  const d = (a, b) => Math.max(1e-6, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    for (let k = 0; k < 200; k++) {
      const t = t1 + (t2 - t1) * (k / 200), pt = [];
      for (const c of [0, 1]) {
        const a1 = ((t1 - t) * p0[c] + t * p1[c]) / t1, a2 = ((t2 - t) * p1[c] + (t - t1) * p2[c]) / (t2 - t1), a3 = ((t3 - t) * p2[c] + (t - t2) * p3[c]) / (t3 - t2);
        const b1 = ((t2 - t) * a1 + t * a2) / t2, b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
        pt.push(((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1));
      }
      dense.push(pt);
    }
  }
  // resample every metre along the curve
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i % dense.length][0] - dense[i - 1][0], dense[i % dense.length][1] - dense[i - 1][1]));
  const L = cum[cum.length - 1], N = Math.floor(L), x = new Float64Array(N), y = new Float64Array(N);
  for (let s = 0, j = 0; s < N; s++) {
    const want = (s / N) * L;
    while (cum[j + 1] < want) j++;
    const w = (want - cum[j]) / (cum[j + 1] - cum[j] || 1), a = dense[j], b = dense[(j + 1) % dense.length];
    x[s] = a[0] + (b[0] - a[0]) * w; y[s] = a[1] + (b[1] - a[1]) * w;
  }
  // heading, curvature (smoothed over ±15 m) and the fastest speed through each metre (corners, then braking/traction)
  const hdg = new Float64Array(N), kap = new Float64Array(N), v = new Float64Array(N);
  for (let s = 0; s < N; s++) hdg[s] = Math.atan2(y[(s + 1) % N] - y[(s - 1 + N) % N], x[(s + 1) % N] - x[(s - 1 + N) % N]);
  for (let s = 0; s < N; s++) {
    let sum = 0;
    for (let k = -15; k <= 15; k++) { let dh = hdg[(s + k + 1 + N) % N] - hdg[(s + k + N) % N]; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); sum += Math.abs(dh); }
    kap[s] = sum / 31;
  }
  for (let s = 0; s < N; s++) v[s] = Math.min(VMAX, Math.sqrt(LAT_G / Math.max(kap[s], 1e-5)));
  for (let pass = 0; pass < 2; pass++) {
    for (let s = 1; s <= N; s++) { const i = s % N, p = (s - 1) % N; v[i] = Math.min(v[i], Math.sqrt(v[p] * v[p] + 2 * ACC)); }
    for (let s = N - 1; s >= 0; s--) { const i = s % N, nx = (s + 1) % N; v[i] = Math.min(v[i], Math.sqrt(v[nx] * v[nx] + 2 * BRAKE)); }
  }
  return { N, x, y, hdg, v };
}

// The place at s metres along the lap (wrapping), d metres to the left: [x, y] metres
function placeAt(C, s, d) {
  const N = C.N, f = ((s % N) + N) % N, i = Math.floor(f), j = (i + 1) % N, w = f - i;
  const x = C.x[i] + (C.x[j] - C.x[i]) * w, y = C.y[i] + (C.y[j] - C.y[i]) * w, h = C.hdg[i];
  return [x - Math.sin(h) * d, y + Math.cos(h) * d];
}
const speedAt = (C, s) => C.v[((Math.floor(s) % C.N) + C.N) % C.N];
const smooth01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// The pit car's offset from the lap line and its speed limit at s (lap distance, around the start line)
function pitPlan(s, N) {
  const u = s > N / 2 ? s - N : s;   // −N/2 … N/2 around the line
  const P = PIT;
  if (u < P.entry || u > P.exit) return { d: 0, limit: Infinity, inLane: false };
  const d = u < P.lane ? P.side * smooth01((u - P.entry) / (P.lane - P.entry)) : u > P.laneEnd ? P.side * (1 - smooth01((u - P.laneEnd) / (P.exit - P.laneEnd))) : P.side;
  return { d, limit: u >= P.lane - 60 && u <= P.laneEnd ? P.limit : Infinity, inLane: u >= P.lane && u <= P.laneEnd, u };
}

// Every car's run: s (lap metres from the start line, the grid behind it negative), offset d, speed, in the pit lane
function simulate(C) {
  const N = C.N, cars = DRIVERS.map((_, k) => ({ k, s: -GRID_GAP * (k + 1), v: 0, d: k % 2 ? -GRID_SIDE : GRID_SIDE, pace: 1 - 0.012 * k, hist: [], laps: 0, crossings: [], pitDone: false, standUntil: null, finished: null }));
  const end = { leader: null };
  const frames = [];
  for (let t = -PRE; ; t += DT) {
    const dt = DT / 1000, running = t >= 0;
    for (const c of cars) {
      if (!running) { c.hist.push([t, c.s, c.v]); continue; }
      const lapOf = (s) => Math.floor(s / N);
      const pitting = c.k === PIT.car && !c.pitDone && lapOf(c.s + 300) === PIT.lap;
      const pp = pitting ? pitPlan(((c.s % N) + N) % N, N) : null;
      // the speed wanted here: the lap's (scaled by the car's pace), the pit lane's limit, a stop at its box
      let want = speedAt(C, c.s) * c.pace;
      if (pp && pp.limit < Infinity) want = Math.min(want, pp.limit);
      if (pp && pp.inLane && c.standUntil == null && pp.u >= PIT.box - 25 && pp.u < PIT.box) want = Math.min(want, Math.max(0, Math.sqrt(2 * 9 * Math.max(0, PIT.box - pp.u))));
      if (c.standUntil != null) want = t < c.standUntil ? 0 : want;
      // not closer than HEADWAY behind where the car ahead was (cars in order, the pit car rejoins last)
      let v = want > c.v ? Math.min(want, c.v + ACC * dt) : Math.max(want, c.v - BRAKE * dt);
      if (c.k > 0 && !(pp && pp.inLane)) {
        const ahead = cars[c.k - 1], back = ahead.hist[Math.max(0, ahead.hist.length - Math.round(HEADWAY * 1000 / DT))];
        const room = back[1] - c.s - 6;
        if (room < v * dt) v = Math.max(0, room / dt);
      }
      c.v = v; c.s += v * dt;
      if (pp) c.d = pp.d; else if (c.d !== 0) c.d *= Math.max(0, 1 - dt / 3);   // (off the grid's stagger in ~3 s)
      if (pp && pp.inLane && c.standUntil == null && pp.u >= PIT.box - 0.5) { c.standUntil = t + PIT.stand; c.v = 0; }
      if (pitting && pp && pp.u > PIT.exit - 1) c.pitDone = true;
      const lap = Math.floor(c.s / N);
      if (lap > c.laps) { c.laps = lap; c.crossings.push(t); if (lap === LAPS && c.finished == null) { c.finished = t; if (end.leader == null) end.leader = t; } }
      c.inPit = !!(pp && pp.inLane);
      c.hist.push([t, c.s, c.v]);
    }
    frames.push({ t, cars: cars.map((c) => ({ s: c.s, d: c.d, v: c.v, inPit: !!c.inPit, standing: c.standUntil != null && t < c.standUntil })) });
    if (end.leader != null && t >= end.leader + COOL) break;
    if (t > 20 * 60000) break;   // (a guard: never runs away)
  }
  return { frames, cars, end: end.leader + COOL, flag: end.leader };
}

const hms = (ms) => { const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, f = ms % 1000; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(f).padStart(3, "0")}`; };
const zip = (obj) => JSON.stringify(zlib.deflateRawSync(Buffer.from(JSON.stringify(obj))).toString("base64"));
const lapTime = (ms) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, "0")}`;

// The session as the archive's text files: { topic: "line\nline…" }
function demoTexts() {
  const C = circuit(), run = simulate(C), N = C.N, noise = rng(20261101);
  const T0 = PRE + 5000;                      // stream time of lights out (the stream starts 5 s before the grid data)
  const at = (t) => t + T0, utc = (t) => new Date(BASE_UTC + at(t)).toISOString();
  const out = {};
  const put = (topic, t, body) => { (out[topic] || (out[topic] = [])).push(`${hms(at(t))}${typeof body === "string" ? body : JSON.stringify(body)}`); };
  const first = -PRE - 5000;
  put("SessionInfo", first, { Meeting: { Name: "오프라인 데모", OfficialName: "오프라인 데모 · 합성 데이터 (실제 경기 아님)", Location: "", Country: { Name: "" }, Circuit: { ShortName: "합성 트랙" } },
    SessionStatus: "Inactive", Type: "Race", Name: "합성 데이터", GmtOffset: "00:00:00" });
  const dl = {};
  DRIVERS.forEach(([num, name, tla, team, colour], i) => { dl[num] = { RacingNumber: num, BroadcastName: name, FullName: name, Tla: tla, Line: i + 1, TeamName: team, TeamColour: colour, FirstName: "데모", LastName: name }; });
  put("DriverList", first, dl);
  put("SessionStatus", first, { Status: "Inactive", Started: "Inactive" });
  put("TrackStatus", first, { Status: "1", Message: "AllClear" });
  put("LapCount", first, { CurrentLap: 1, TotalLaps: LAPS });
  put("ExtrapolatedClock", first, { Utc: utc(first), Remaining: "00:30:00", Extrapolating: false });
  put("RaceControlMessages", first, { Messages: [{ Utc: utc(first), Category: "Other", Message: "OFFLINE DEMO - SYNTHETIC DATA, NOT A REAL SESSION" }] });
  const lines = {}, app = {};
  DRIVERS.forEach(([num], i) => {
    lines[num] = { RacingNumber: num, Line: i + 1, Position: String(i + 1), ShowPosition: true, GapToLeader: i ? "" : "", IntervalToPositionAhead: { Value: "", Catching: false }, NumberOfLaps: 0, NumberOfPitStops: 0, InPit: false, PitOut: false, Retired: false, Stopped: false, LastLapTime: { Value: "" }, BestLapTime: { Value: "" } };
    app[num] = { RacingNumber: num, Line: i + 1, GridPos: String(i + 1), Stints: [{ Compound: "MEDIUM", New: "true", TotalLaps: 0, StartLaps: 0 }] };
  });
  put("TimingData", first, { Lines: lines });
  put("TimingAppData", first, { Lines: app });
  for (let t = first + 15000; t < run.end; t += 15000) put("Heartbeat", t, { Utc: utc(t) });
  put("SessionStatus", 0, { Status: "Started", Started: "Started" });
  put("ExtrapolatedClock", 0, { Utc: utc(0), Remaining: "00:30:00", Extrapolating: true });
  // positions and car data, one sample per car every DT ms
  for (const f of run.frames) {
    const entries = {}, cars = {};
    f.cars.forEach((c, k) => {
      const num = DRIVERS[k][0], [x, y] = placeAt(C, c.s, c.d), n1 = (noise() - 0.5) * 0.6, n2 = (noise() - 0.5) * 0.6;
      const z = 6 * Math.sin((2 * Math.PI * (((c.s % N) + N) % N)) / N);
      entries[num] = { Status: "OnTrack", X: Math.round((x + n1) * 10), Y: Math.round((y + n2) * 10), Z: Math.round(z * 10) };
      const kmh = Math.round(c.v * 3.6), gear = kmh < 5 ? (f.t < 0 ? 1 : 0) : Math.min(8, 1 + Math.floor(kmh / 42));
      cars[num] = { Channels: { 0: Math.round(4000 + kmh * 35), 2: kmh, 3: gear, 4: c.standing || kmh < 5 ? 0 : 100, 5: 0, 45: 0 } };
    });
    put("Position.z", f.t, zip({ Position: [{ Timestamp: utc(f.t), Entries: entries }] }));
    put("CarData.z", f.t, zip({ Entries: [{ Utc: utc(f.t), Cars: cars }] }));
  }
  // timing at each line crossing, the pit car's stop, lap count, the flag
  const best = {};
  const events = [];
  run.cars.forEach((c) => c.crossings.forEach((t, i) => events.push({ t, k: c.k, lap: i + 1, prev: i ? c.crossings[i - 1] : 0 })));
  events.sort((a, b) => a.t - b.t);
  const lead = {};
  for (const e of events) {
    const num = DRIVERS[e.k][0], ms = e.t - e.prev;
    if (lead[e.lap] == null) { lead[e.lap] = e.t; put("LapCount", e.t, { CurrentLap: Math.min(LAPS, e.lap + 1) }); }
    const ahead = e.k ? run.cars[e.k - 1].crossings[e.lap - 1] : null;
    const L = { NumberOfLaps: e.lap, LastLapTime: { Value: lapTime(ms) }, GapToLeader: e.k ? `+${((e.t - lead[e.lap]) / 1000).toFixed(3)}` : `LAP ${e.lap}`, IntervalToPositionAhead: { Value: e.k && ahead != null ? `+${((e.t - ahead) / 1000).toFixed(3)}` : "" } };
    if (best[num] == null || ms < best[num]) { best[num] = ms; L.BestLapTime = { Value: lapTime(ms), Lap: e.lap }; }
    put("TimingData", e.t, { Lines: { [num]: L } });
    const st = e.k === PIT.car && e.lap > PIT.lap ? 1 : 0;
    put("TimingAppData", e.t, { Lines: { [num]: { Stints: { [st]: { TotalLaps: st ? e.lap - PIT.lap : e.lap } } } } });
  }
  const pitNum = DRIVERS[PIT.car][0];
  let was = false;
  for (const f of run.frames) {
    const now = f.cars[PIT.car].inPit;
    if (now && !was) put("TimingData", f.t, { Lines: { [pitNum]: { InPit: true, NumberOfPitStops: 1 } } });
    if (!now && was) {
      put("TimingData", f.t, { Lines: { [pitNum]: { InPit: false, PitOut: true } } });
      put("TimingAppData", f.t, { Lines: { [pitNum]: { Stints: { 1: { Compound: "HARD", New: "true", TotalLaps: 0, StartLaps: 0 } } } } });
      put("TimingData", f.t + 5000, { Lines: { [pitNum]: { PitOut: false } } });
    }
    was = now;
  }
  put("TrackStatus", run.flag, { Status: "1", Message: "AllClear" });
  put("SessionStatus", run.flag, { Status: "Finished", Started: "Finished" });
  put("ExtrapolatedClock", run.flag, { Utc: utc(run.flag), Remaining: "00:00:00", Extrapolating: false });
  put("SessionStatus", run.end - 1000, { Status: "Finalised", Started: "Finished" });
  for (const k of Object.keys(out)) out[k] = out[k].map((l) => [l.slice(0, 12), l]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map((p) => p[1]).join("\n");
  return out;
}

// The session in Archive.loadSession's shape ({ topics, duration, damaged }), read with the archive's own parsers
function loadDemo() {
  const texts = demoTexts(), topics = {};
  for (const [topic, text] of Object.entries(texts)) {
    const lines = parseStream(text, topic.endsWith(".z"));
    if (topic === "Position.z") topics.PositionTracks = flattenTracks(lines);
    else if (topic === "CarData.z") topics.CarData = flattenCarData(lines);
    else topics[topic] = lines;
  }
  let duration = 0;
  for (const list of Object.values(topics)) if (Array.isArray(list) && list.length) duration = Math.max(duration, list[list.length - 1][0]);
  for (const c of Object.values(topics.PositionTracks?.cars || {})) if (c.n) duration = Math.max(duration, c.t[c.n - 1]);
  return { topics, duration, damaged: [], demo: true };
}

// what the page lists the demo as (the picker's session entry shape)
const DEMO_INFO = { path: DEMO_PATH, type: "Race", name: "합성 데이터", meeting: "오프라인 데모", demo: true };

module.exports = { loadDemo, demoTexts, DEMO_PATH, DEMO_INFO, PIT, DRIVERS, LAPS, _internal: { circuit, simulate, placeAt, pitPlan } };
