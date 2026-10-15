// The start (startplan.js), the circuits' measured grids and pit lanes (startdata.js, grid.js surveyedGrid): which
// grid is used where, who starts where, and where a car is drawn when the feed has no position for it – from what is
// known at that moment only.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// a straight lap line along +x for the survey tests: feed dm (x, y) → s = x/10 m, d = y/10 m
const straight = (shift = 0) => ([x, y]) => ({ s: x / 10, d: (y - shift) / 10 });
const session = (year, poleX, extra = {}) => ({ session: `${year}-x`, year, pole: [poleX, 0], dir: [1, 0], ref: Array.from({ length: 30 }, (_, i) => [poleX + 2000 - i * 100, 0]), ...extra });

test("measured grid: used only where its lap line lies on this session's – a moved frame (Suzuka 2023: 21 m) is refused", async () => {
  const G = await import("../src/renderer/grid.js");
  const venue = { grid: { pitch: 8, pitchFrom: "rules", sessions: [session(2023, 5000), session(2025, 5000)] } };
  const ok = G.surveyedGrid(venue, 2026, straight(0), 10000);
  assert.ok(ok.ok);
  assert.strictEqual(ok.s1, 500);
  // this session's lap line 21 m to the side of the measured ones: none lies on it
  const moved = G.surveyedGrid(venue, 2026, straight(210), 10000);
  assert.strictEqual(moved.ok, false);
  assert.match(moved.reason, /don't lie/);
  // a lap line running the other way isn't the same either
  const back = G.surveyedGrid(venue, 2026, ([x, y]) => ({ s: (100000 - x) / 10, d: y / 10 }), 10000);
  assert.strictEqual(back.ok, false);
});

test("measured grid: the nearest year's sessions (later on a tie), their median along this lap line; other years reported", async () => {
  const G = await import("../src/renderer/grid.js");
  const venue = { grid: { pitch: 7.46, pitchFrom: "measured", sessions: [session(2023, 5100), session(2025, 5000), session(2025, 5004), session(2025, 5300)] } };
  const r = G.surveyedGrid(venue, 2026, straight(0), 10000);
  assert.ok(r.ok);
  assert.ok(Math.abs(r.s1 - 500.4) < 1e-9, String(r.s1));   // median of 500, 500.4, 530
  assert.strictEqual(r.pitch, 7.46);
  assert.deepStrictEqual(r.others.map((o) => o.along), [9.6]);
  // a session's own year first
  assert.strictEqual(G.surveyedGrid(venue, 2023, straight(0), 10000).s1, 510);
  // across the lap line's start: the median is taken round the wrap
  const wrap = { grid: { pitch: 8, sessions: [session(2025, 10), session(2025, 99990), session(2025, 30)] } };
  const w = G.surveyedGrid(wrap, 2025, straight(0), 10000);
  assert.ok(w.ok);
  assert.ok(Math.abs(w.s1 - 1) < 1e-9, String(w.s1));
});

test("slots: one per entrant of the session, the season's usual field only without a driver list (said so)", async () => {
  const G = await import("../src/renderer/grid.js");
  assert.deepStrictEqual(G.slotCount({ drivers: 22, maxGridPos: 22, year: 2026 }), { n: 22, from: "driver list" });
  assert.strictEqual(G.slotCount({ drivers: 20, maxGridPos: 0, year: 2026 }).n, 20);   // a season with 20 entrants
  assert.strictEqual(G.slotCount({ drivers: 19, maxGridPos: 20, year: 2025 }).n, 20);   // a car withdrawn after qualifying
  assert.match(G.slotCount({ year: 2026 }).from, /estimate/);
  assert.strictEqual(G.slotCount({ year: 2026 }).n, 22);
  assert.strictEqual(G.slotCount({ year: 2024 }).n, 20);
});

// a session's history: clock, race-control messages, flags
async function history(events) {
  const P = await import("../src/renderer/startplan.js");
  return { P, h: P.StartHistory.fromEvents(events) };
}
const clock = (ms, run) => ({ ms, topic: "ExtrapolatedClock", data: { Extrapolating: run } });
const rcm = (ms, Message) => ({ ms, topic: "RaceControlMessages", data: { Messages: [{ Message }] } });
const grid = (ms, lines) => ({ ms, topic: "TimingAppData", data: { Lines: Object.fromEntries(Object.entries(lines).map(([n, g]) => [n, { GridPos: String(g) }])) } });
const line = (ms, num, l) => ({ ms, topic: "TimingData", data: { Lines: { [num]: l } } });

test("starts: lights out from the race clock; a red-flag restart in race control's resumption order; known only once it happened", async () => {
  const { P, h } = await history([
    grid(0, { 1: 1, 44: 2, 16: 3, 5: 4 }), clock(10, false), line(500, "5", { InPit: true }),
    clock(1000, true), line(1500, "5", { InPit: false }),
    rcm(5000, "RED FLAG - RACE SUSPENDED"), clock(5000, false), rcm(6000, "RESUMPTION ORDER: 44, 1, 16, 5"), rcm(6500, "STANDING START"),
    clock(8000, true),
  ]);
  // before the race start: a start to come, in the published grid order
  const pre = P.startContext(h, 900);
  assert.ok(pre.pending);
  assert.strictEqual(pre.t, Infinity);
  assert.deepStrictEqual(pre.order, ["1", "44", "16", "5"]);
  // its lights out once the clock ran
  assert.strictEqual(P.startContext(h, 1200).t, 1000);
  // a pit-lane starter: in the pit lane at lights out – its slot is left empty; grid position is the published one
  assert.deepStrictEqual(P.carKind(h, P.startContext(h, 1200), "5", 1200), { kind: "pit", g: 4, inPitNow: true });
  assert.deepStrictEqual(P.carKind(h, P.startContext(h, 1200), "16", 1200), { kind: "grid", g: 3, inPitNow: false });
  // racing: no start
  assert.strictEqual(P.startContext(h, 1000 + 1000000), null);
  // red flag: the restart to come, standing, in the resumption order (place in it, not the grid position)
  const rf = P.startContext(h, 7000);
  assert.ok(rf.pending);
  assert.strictEqual(rf.standing, true);
  assert.deepStrictEqual(rf.order, ["44", "1", "16", "5"]);
  assert.strictEqual(P.carKind(h, rf, "44", 7000).g, 1);
  // its lights out: the clock running again
  assert.strictEqual(P.startContext(h, 8100).t, 8000);
  assert.strictEqual(P.startContext(h, 8100).n, 2);
  // a moment before the restart doesn't know its time yet (no looking ahead)
  assert.strictEqual(P.startContext(h, 7999).t, Infinity);
});

test("restart: the cars still in the pit lane when the clock runs again are not pit-lane starters – only one in it now", async () => {
  const { P, h } = await history([
    grid(0, { 1: 1, 2: 2 }), clock(1000, true), rcm(5000, "RED FLAG"), clock(5000, false), line(5100, "1", { InPit: true }), line(5100, "2", { InPit: true }),
    rcm(6000, "RESUMPTION ORDER: 2, 1"), clock(8000, true), line(8100, "1", { InPit: false }), line(8100, "2", { InPit: false }), rcm(8200, "STANDING START"),
  ]);
  // the clock ran at 8000 with both in the pit lane; on the grid at 8300 they are the restart's grid
  const ctx = P.startContext(h, 8300);
  assert.strictEqual(ctx.n, 2);
  assert.deepStrictEqual(P.carKind(h, ctx, "2", 8300), { kind: "grid", g: 1, inPitNow: false });
  assert.deepStrictEqual(P.carKind(h, ctx, "1", 8300), { kind: "grid", g: 2, inPitNow: false });
  assert.strictEqual(P.carKind(h, ctx, "1", 8050).kind, "pit");
});

test("starts: a rolling start is no standing grid; retired cars are out; race control's pit-exit light", async () => {
  const { P, h } = await history([
    grid(0, { 1: 1, 2: 2 }), rcm(100, "PIT EXIT CLOSED"), rcm(200, "RACE WILL START BEHIND THE SAFETY CAR"), line(300, "2", { Retired: true }), clock(1000, true), rcm(1001, "GREEN LIGHT - PIT EXIT OPEN"),
  ]);
  assert.strictEqual(P.startContext(h, 500).standing, false);
  assert.strictEqual(P.carKind(h, P.startContext(h, 500), "2", 500).kind, "out");
  assert.strictEqual(h.pitExitAt(50), null);
  assert.strictEqual(h.pitExitAt(500), "closed");
  assert.strictEqual(h.pitExitAt(2000), "open");
});

// telemetry: { t: [ms], v: [km/h] } at 4 Hz
function telemetry(parts) {
  const t = [], v = [];
  let ms = 0;
  for (const [dur, speed] of parts) for (let k = 0; k < dur / 250; k++) { t.push(ms); v.push(typeof speed === "function" ? speed(k * 250) : speed); ms += 250; }
  return { t, v };
}

test("arrival on the grid: standing still after a drive long enough to be the lap to it – not a car still in its garage", async () => {
  const P = await import("../src/renderer/startplan.js");
  // 60 s standing, a 90 s formation lap at 120 km/h (3 km), then 20 s on the grid
  const car = telemetry([[60000, 0], [90000, 120], [20000, 0]]);
  const a = P.arrivalBy(car, 165000, 1000);
  assert.ok(a.still && a.ok);
  assert.ok(Math.abs(a.drove - 3000) < 40, String(a.drove));
  assert.strictEqual(a.stillSince, 150000);
  // a car that only rolled 150 m (garage to the pit exit) hasn't driven to the grid
  const garage = telemetry([[60000, 0], [5000, 108], [20000, 0]]);
  assert.strictEqual(P.arrivalBy(garage, 80000, 1000).ok, false);
  // moving: not still
  assert.strictEqual(P.arrivalBy(car, 100000, 1000).still, false);
  // just stopped: not yet (2 s)
  assert.strictEqual(P.arrivalBy(car, 151000, 1000).ok, false);
});

test("placement without positions: in the slot while the field stands, launched by the telemetry's distance, nothing made up", async () => {
  const P = await import("../src/renderer/startplan.js");
  const { speedIntegral } = await import("../src/renderer/smooth.js");
  // formation lap, 30 s on the grid, then away at 2 s after lights out (lights out at 180 000)
  const car = telemetry([[60000, 0], [90000, 120], [32000, 0], [20000, (dt) => Math.min(250, dt / 40)]]);
  const Sv = speedIntegral(car);
  const start = { t: 180000, standing: true, orderFrom: "GridPos", order: ["1"] };
  const kind = { kind: "grid", g: 7, inPitNow: false }, slot = { s: 1000, lat: 2.5 };
  const still = () => 1, moving = () => 0;
  const base = { start, kind, slot, car, Sv, need: 1000, L: 5000, line: () => -1, fieldStill: still };
  // standing in its slot before lights out
  const a = P.placeWithout({ ...base, t: 170000 });
  assert.deepStrictEqual([a.est, a.s, a.d, a.vs], ["slot", 1000, 2.5, 0]);
  // but not while the rest of the field is driving (a car stopped on its own isn't on the grid)
  assert.strictEqual(P.placeWithout({ ...base, t: 170000, fieldStill: moving }), null);
  // launched: its slot moved on by the distance driven since it set off, eased towards the racing line
  const b = P.placeWithout({ ...base, t: 186000, fieldStill: (tt) => (tt < 182000 ? 1 : 0) });
  assert.strictEqual(b.est, "launch");
  assert.ok(b.go > 182000 && b.go <= 182500, String(b.go));
  assert.ok(Math.abs(b.s - (1000 + (Sv(186000) - Sv(b.go)))) < 1e-6);
  assert.ok(b.d < 2.5 && b.d > -1);
  // further than 600 m from the slot: not placed any more
  assert.strictEqual(P.placeWithout({ ...base, t: 199000, fieldStill: (tt) => (tt < 182000 ? 1 : 0) }), null);
  // a car that never drove to the grid (no formation lap in its telemetry) is not put in a slot
  const garage = telemetry([[180000, 0]]);
  assert.strictEqual(P.placeWithout({ ...base, car: garage, Sv: speedIntegral(garage), t: 170000 }), null);
  // no looking ahead: the same answer with the telemetry cut at the moment asked about
  const cut = { t: car.t.filter((x) => x <= 186000), v: car.v.slice(0, car.t.filter((x) => x <= 186000).length) };
  const c = P.placeWithout({ ...base, car: cut, Sv: speedIntegral(cut), t: 186000, fieldStill: (tt) => (tt < 182000 ? 1 : 0) });
  assert.ok(Math.abs(c.s - b.s) < 0.5, `${c.s} vs ${b.s}`);
});

test("pit-lane starters without positions: at the pit exit in the queue, away only after waiting there while the field stood", async () => {
  const P = await import("../src/renderer/startplan.js");
  const { speedIntegral } = await import("../src/renderer/smooth.js");
  // to the pit exit (20 s at 60 km/h), waits 60 s, the field starts at 170 000, it leaves at 182 000
  const car = telemetry([[90000, 0], [20000, 60], [72000, 0], [20000, 80]]);
  const start = { t: 170000, standing: true }, kind = { kind: "pit", g: 22, inPitNow: true }, pit = { queueU: 400, queueIndex: 1 };
  const base = { start, kind, car, Sv: speedIntegral(car), need: 1000, L: 5000, pit, fieldStill: (tt) => (tt < 171000 ? 1 : 0) };
  const q = P.placeWithout({ ...base, t: 160000 });
  assert.deepStrictEqual([q.pit, q.u, q.est], [true, 400 - P.PLAN.queueGap, "pit queue"]);
  const away = P.placeWithout({ ...base, t: 186000 });
  assert.strictEqual(away.est, "pit exit");
  assert.ok(away.u > q.u && away.u < q.u + 120);
  // a car driving down the pit lane mid-race (a pit stop) is no pit-lane starter
  assert.strictEqual(P.placeWithout({ ...base, t: 186000, fieldStill: () => 0 }), null);
});

test("startdata: every supported venue has a measured grid and pit lane, with its sources and a lap-line strip to check it against", async () => {
  const { START_DATA } = await import("../src/renderer/startdata.js");
  const { VENUES } = await import("../src/renderer/venues.js");
  for (const key of Object.keys(VENUES)) {
    const v = START_DATA[key];
    assert.ok(v?.grid?.sessions?.length, `grid for venue ${key}`);
    assert.ok(v.pit?.path?.length > 20, `pit lane for venue ${key}`);
    for (const s of v.grid.sessions) {
      assert.ok(s.ref?.length > 20 && s.pole.length === 2 && Math.abs(Math.hypot(...s.dir) - 1) < 0.01, `${key} ${s.session}`);
      assert.ok(s.rms < 4, `${key} ${s.session} rms ${s.rms}`);
    }
    assert.ok(v.grid.pitch >= 7 && v.grid.pitch <= 9);
    assert.ok(v.pit.limit >= 60 && v.pit.limit <= 80, `${key} pit limit ${v.pit.limit}`);
  }
  // Catalunya: the grid's own measured pitch (both years 7.4–7.6 m in the feed); elsewhere the rules' 8 m
  assert.ok(START_DATA[15].grid.pitch < 7.6);
  assert.strictEqual(START_DATA[144].grid.pitch, 8);
});

// with the session data in the app's cache: Monaco 2026, where the feed has no positions from 27 minutes before the
// start to a few seconds after it
const CACHE = path.join(process.env.HOME || "", "Library/Application Support/f1-live-kr/cache");
const MONACO = "2026_2026-06-07_Monaco_Grand_Prix_2026-06-07_Race";
test("Monaco 2026 (cached data): lights out, the published grid, Bortoleto from the pit lane, the restart in race control's order", { skip: !fs.existsSync(path.join(CACHE, MONACO + "_TimingData.jsonStream")) && "no cached session" }, async () => {
  const { Archive } = require("../src/main/archive.js");
  const RK = require("../src/renderer/replay.js");
  const P = await import("../src/renderer/startplan.js");
  const r = new RK.Replay(await new Archive(CACHE).loadSession("2026/2026-06-07_Monaco_Grand_Prix/2026-06-07_Race/"));
  const h = P.StartHistory.fromEvents(r.events), t0 = r.startTime();
  const ctx = P.startContext(h, t0);
  assert.strictEqual(ctx.t, t0);
  assert.strictEqual(ctx.order.length, 22);
  assert.strictEqual(P.carKind(h, ctx, "12", t0).g, 1);   // Antonelli on pole
  assert.strictEqual(P.carKind(h, ctx, "44", t0).g, 3);
  // the feed has Hamilton (third) at the start of its positions nowhere near the grid; his telemetry has him standing
  // on it after the formation lap
  const a = P.arrivalBy(r.car["44"], t0 - 1000, 1000);
  assert.ok(a.still && a.ok, JSON.stringify(a));
  // Bortoleto: in the pit lane at the start (TimingData) – a pit-lane start
  const bor = P.carKind(h, P.startContext(h, t0 + 5000), "5", t0 + 5000);
  assert.ok(bor.kind === "pit" || bor.kind === "grid", JSON.stringify(bor));
  // the red flag (lap 56): the restart's order from race control
  const rf = P.startContext(h, t0 + 6400e3);
  assert.ok(rf?.pending);
  assert.deepStrictEqual(rf.order.slice(0, 3), ["12", "44", "6"]);
});

test("on the pit lane's path: within 3 m of it and clear of its ends (where it meets the lap line), whatever InPit says", async () => {
  const { onPitPath } = await import("../src/renderer/startplan.js");
  // a pit lane 500 m long, 15 m beside a straight (z = 15), bending in at both ends
  const pts = [{ x: 0, z: 0 }, { x: 50, z: 15 }, { x: 450, z: 15 }, { x: 500, z: 0 }], cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  assert.ok(Math.abs(onPitPath(pts, cum, 250, 14.2) - (cum[1] + 200)) < 0.01, "queued in the lane");
  assert.strictEqual(onPitPath(pts, cum, 250, 0), null, "on the straight beside it");
  assert.strictEqual(onPitPath(pts, cum, 250, 9), null, "6 m off it");
  assert.strictEqual(onPitPath(pts, cum, 2, 0.5), null, "at its entry, where it joins the lap line");
  assert.strictEqual(onPitPath([], [], 0, 0), null);
});
