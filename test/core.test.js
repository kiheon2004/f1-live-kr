const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const KO = require("../src/shared/ko.js");
const { parseStream, flattenPositions } = require("../src/main/archive.js");
const { Replay, merge } = require("../src/renderer/replay.js");

test("every collected race control message gets a Korean translation", () => {
  // Every unique message from the 2026 season so far (one per line).
  const lines = fs.readFileSync(path.join(__dirname, "rcm_samples.txt"), "utf8").trim().split("\n");
  const missing = lines.filter((l) => !KO.translate(l));
  assert.deepStrictEqual(missing, []);
  // No English phrase may survive in the Korean text (times and codes in brackets are fine).
  const leftover = lines.map((l) => KO.translate(l)).filter((k) => /\b[A-Z]{3,}(?: [A-Z]{2,})+/.test(k.replace(/\([^)]*\)/g, "")));
  assert.deepStrictEqual(leftover, []);
});

test("translations keep car numbers, names and reasons", () => {
  assert.strictEqual(KO.translate("FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 10 (GAS) - SPEEDING IN THE PIT LANE (16:37:16)"),
    "스튜어드: 10번 가슬리에게 5초 타임 페널티 – 피트레인 과속 (16:37:16)");
  assert.strictEqual(KO.translate("YELLOW IN TRACK SECTOR 1"), "황색기 – 트랙 섹터 1");
  assert.strictEqual(KO.translate("SOMETHING NEW AND UNKNOWN"), null);
});

test("stream lines parse, including compressed position data", () => {
  const payload = { Position: [{ Timestamp: "2026-09-26T10:00:00.000Z", Entries: { 1: { X: 10, Y: 20, Z: -3 } } }] };
  const z = zlib.deflateRawSync(Buffer.from(JSON.stringify(payload))).toString("base64");
  const text = `﻿00:00:01.500{"A":1}\n00:01:00.000{"A":2}\nbroken line\n`;
  assert.deepStrictEqual(parseStream(text, false), [[1500, { A: 1 }], [60000, { A: 2 }]]);
  const pos = flattenPositions(parseStream(`00:00:02.000${JSON.stringify(z)}`, true));
  assert.deepStrictEqual(pos, [[2000, { 1: [10, 20, -3] }]]);
});

test("delta merge patches nested objects and index-keyed arrays", () => {
  const s = merge(undefined, { Lines: { 1: { Sectors: [{ Value: "" }, { Value: "" }], Position: "2" } } });
  merge(s, { Lines: { 1: { Sectors: { 1: { Value: "30.1" } }, Position: "1" } } });
  assert.deepStrictEqual(s.Lines[1], { Sectors: [{ Value: "" }, { Value: "30.1" }], Position: "1" });
});

test("replay seeks forward and backward to the same state", () => {
  const r = new Replay({ duration: 3000, topics: {
    TimingData: [[0, { Lines: { 1: { Position: "3" } } }], [2000, { Lines: { 1: { Position: "1" } } }]],
    RaceControlMessages: [[1000, { Messages: [{ Message: "A" }] }], [2500, { Messages: { 1: { Message: "B" } } }]],
    Position: [[0, { 1: [0, 0] }], [1000, { 1: [10, 20] }]],
  } });
  r.seek(2600); assert.strictEqual(r.state.TimingData.Lines[1].Position, "1"); assert.strictEqual(r.messages.length, 2);
  r.seek(1500); assert.strictEqual(r.state.TimingData.Lines[1].Position, "3"); assert.strictEqual(r.messages.length, 1);
  assert.deepStrictEqual(r.positionsAt(500), { 1: [5, 10, 0] });
});

test("replay range runs from the session clock start to the results", () => {
  const r = new Replay({ duration: 9000, topics: {
    ExtrapolatedClock: [[0, { Extrapolating: false }], [3000, { Extrapolating: true }]],
    SessionStatus: [[0, { Status: "Inactive" }], [3000, { Status: "Started" }], [6000, { Status: "Finished" }], [7000, { Status: "Finalised" }]],
  } });
  assert.strictEqual(r.startTime(), 3000);
  assert.strictEqual(r.endTime(), 7000);
  assert.strictEqual(new Replay({ duration: 500, topics: {} }).endTime(), 500);
});

test("grand prix names", () => {
  assert.strictEqual(KO.gpName("Azerbaijan Grand Prix"), "아제르바이잔 그랑프리");
  assert.strictEqual(KO.gpName("Bahrain Grand Prix in Malaysia"), "바레인 그랑프리 (말레이시아 개최)");
  assert.strictEqual(KO.gpName("Unknown Cup"), "Unknown Cup");
});

const { LapTracker, LiveSource } = require("../src/renderer/replay.js");
const { decode } = require("../src/main/live.js");

test("lap tracker records laps, positions and pit entries", () => {
  const lt = new LapTracker();
  lt.feed(1000, { 1: { NumberOfLaps: 1, Position: "3", LastLapTime: { Value: "1:45.500" } } });
  lt.feed(2000, { 1: { InPit: true } });
  lt.feed(3000, { 1: { NumberOfLaps: 2, Position: "2", InPit: false, LastLapTime: { Value: "2:05.100" } } });
  assert.deepStrictEqual(lt.laps("1").map((x) => [x.lap, x.sec, x.pos]), [[1, 105.5, 3], [2, 125.1, 2]]);
  assert.deepStrictEqual(lt.pits("1").map((x) => x.lap), [2]);
  assert.strictEqual(lt.laps("1", 1500).length, 1);
});

test("live source holds updates back by the broadcast delay", () => {
  const ls = new LiveSource();
  ls.snapshot({ TimingData: { Lines: { 1: { Position: "2" } } } });
  ls.tick();
  ls.delayMs = 60e3;
  ls.push("TimingData", { Lines: { 1: { Position: "1" } } });
  ls.tick();
  assert.strictEqual(ls.state.TimingData.Lines[1].Position, "2");      // still delayed
  ls.queue[0].at -= 61e3; ls.tick();
  assert.strictEqual(ls.state.TimingData.Lines[1].Position, "1");
});

test("broadcast sync works out the delay from the TV clock or a lap press", () => {
  const live = new LiveSource();
  const t = Date.parse("2026-10-02T05:40:00Z");
  live.push("ExtrapolatedClock", { Utc: "2026-10-02T05:30:00Z", Remaining: "01:00:00", Extrapolating: true }, true);
  assert.strictEqual(live.remainingNow(t), 50 * 60e3);                       // 10 min into a 60 min session
  assert.strictEqual(live.delayFromTvClock("50:30", t), 30);                 // TV is 30 s behind
  assert.strictEqual(live.delayFromTvClock("abc", t), null);
  live.rawLap = null; live.push("LapCount", { CurrentLap: 12 }, true);
  assert.ok(live.delayFromLapPress(Date.now() + 41e3) >= 40);
});

test("pit log combines pit lane time and stationary time per lap", () => {
  const { PitLog } = require("../src/renderer/replay.js");
  const log = new PitLog();
  log.feed(100, "PitLaneTimeCollection", { PitTimes: { 6: { RacingNumber: "6", Duration: "20.6", Lap: "20" } } });
  log.feed(150, "PitLaneTimeCollection", { PitTimes: { _deleted: ["6"] } });
  log.feed(200, "PitStopSeries", { PitTimes: { 6: [{ PitStop: { RacingNumber: "6", PitStopTime: "2.5", PitLaneTime: "20.662", Lap: "20" } }] } });
  log.feed(900, "PitLaneTimeCollection", { PitTimes: { 6: { RacingNumber: "6", Duration: "22.1", Lap: "35" } } });
  assert.deepStrictEqual(log.list("6").map((x) => [x.lap, x.stop, x.lane]), [[20, 2.5, 20.662], [35, undefined, 22.1]]);
  assert.strictEqual(log.list("6", 500).length, 1);
});

test("status log marks safety car laps", () => {
  const { StatusLog } = require("../src/renderer/replay.js");
  const log = new StatusLog();
  log.feed(1, "LapCount", { CurrentLap: 30 });
  log.feed(2, "TrackStatus", { Status: "4" });
  log.feed(3, "LapCount", { CurrentLap: 31 }); log.feed(4, "LapCount", { CurrentLap: 34 });
  log.feed(5, "TrackStatus", { Status: "1" });
  log.feed(6, "LapCount", { CurrentLap: 35 });
  assert.deepStrictEqual(log.periods().map((p) => [p.kind, p.from, p.to]), [["SC", 30, 34]]);
});

test("replay maps a wall-clock time back to stream time and race lap", () => {
  const t0 = Date.parse("2026-09-26T11:00:00Z");
  const r = new Replay({ duration: 10000, topics: {
    Heartbeat: [[1000, { Utc: "2026-09-26T11:00:00Z" }], [6000, { Utc: "2026-09-26T11:00:05Z" }]],
    LapCount: [[2000, { CurrentLap: 1 }], [7000, { CurrentLap: 2 }]],
  } });
  assert.strictEqual(r.msAt(t0 + 3000), 4000);
  assert.strictEqual(r.msAt(t0 + 6500), 7500);
  assert.strictEqual(r.raceLapAt(r.msAt(t0 + 3000)), 1);
  assert.strictEqual(r.raceLapAt(7500), 2);
  assert.strictEqual(r.raceLapAt(500), null);
});

test("one clean lap is cut out of a multi-lap trace", () => {
  const { extractLap } = require("../src/renderer/replay.js");
  // Three laps round a 1 km-radius circle (units: decimetres); the first is slow (more samples).
  const lap = (n) => Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; return [10000 * Math.cos(a), 10000 * Math.sin(a), 5]; });
  const pts = [...lap(300), ...lap(200), ...lap(240)];
  const out = extractLap(pts);
  assert.ok(Math.abs(out.length - 201) <= 2, `got ${out.length} points`);
  let len = 0; for (let i = 1; i < out.length; i++) len += Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]);
  assert.ok(Math.abs(len - 2 * Math.PI * 10000) < 2000);
  assert.strictEqual(out[0].length, 3);
});

test("live decode inflates compressed topics", () => {
  const payload = { Position: [] };
  const z = zlib.deflateRawSync(Buffer.from(JSON.stringify(payload))).toString("base64");
  assert.deepStrictEqual(decode("Position.z", z), ["Position", payload]);
  assert.deepStrictEqual(decode("TrackStatus", { Status: "1" }), ["TrackStatus", { Status: "1" }]);
});

test("a reconnect snapshot waits out the broadcast delay too", () => {
  const ls = new LiveSource();
  ls.delayMs = 30e3;
  const t0 = 1_000_000;
  ls.snapshot({ SessionInfo: { Key: 1 }, DriverList: { 1: { Tla: "VER" } }, TimingData: { Lines: { 1: { Position: "5" } } } }, t0);
  ls.tick(t0 + 1000);
  assert.strictEqual(ls.state.DriverList, undefined);            // nothing shown before the TV catches up
  assert.ok(ls.waitingMs(t0 + 1000) > 28e3);
  ls.tick(t0 + 31e3);
  assert.strictEqual(ls.state.TimingData.Lines[1].Position, "5");
  assert.strictEqual(ls.epoch, 1);
  assert.strictEqual(ls.waitingMs(t0 + 31e3), 0);
});

test("a snapshot for a new session clears the old lap history", () => {
  const ls = new LiveSource();
  ls.snapshot({ SessionInfo: { Key: 1 }, TimingData: { Lines: { 1: { NumberOfLaps: 3, LastLapTime: { Value: "1:30.000" } } } } }, 0);
  ls.tick(1);
  assert.strictEqual(ls.laps("1", Infinity).length, 1);
  ls.snapshot({ SessionInfo: { Key: 2 }, TimingData: { Lines: { 1: { Position: "1" } } } }, 10);
  ls.tick(11);
  assert.strictEqual(ls.laps("1", Infinity).length, 0);
});

test("pausing live holds the screen and adds the paused time to the delay", () => {
  const ls = new LiveSource();
  ls.delayMs = 10e3;
  ls.pause(1000);
  ls.push("TrackStatus", { Status: "4" });
  ls.queue[0].at = 0;
  ls.tick(50e3);
  assert.strictEqual(ls.state.TrackStatus, undefined);
  assert.strictEqual(ls.resume(21000), 20000);
  assert.strictEqual(ls.delayMs, 30e3);
  ls.tick(50e3);
  assert.strictEqual(ls.state.TrackStatus.Status, "4");
});

test("live clock uses the server time from heartbeats", () => {
  const ls = new LiveSource();
  const local = Date.parse("2026-10-02T05:40:00Z");
  ls.snapshot({ Heartbeat: { Utc: "2026-10-02T05:40:02Z" } }, local);   // server is 2 s ahead of this computer
  assert.strictEqual(ls.skew, 2000);
  ls.rawClock = { Utc: "2026-10-02T05:30:00Z", Remaining: "01:00:00", Extrapolating: true };
  assert.strictEqual(ls.remainingNow(local), 50 * 60e3 - 2000);
  assert.strictEqual(ls.msAt(Date.parse("2026-10-02T05:40:02Z")), local);
});

test("live map traces one full lap from the car trails, never a partial one", () => {
  const ls = new LiveSource();
  const lap = (n, k) => Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; return { X: Math.round(10000 * Math.cos(a)), Y: Math.round(10000 * Math.sin(a)), Z: 0, k }; });
  const feed = (pts) => {
    const Position = pts.map((p, i) => ({ Timestamp: new Date(1e12 + i * 250).toISOString(), Entries: { 1: { X: p.X, Y: p.Y, Z: 0 } } }));
    ls.push("Position", { Position }, true);
  };
  feed(lap(300).slice(0, 150));                      // half a lap
  assert.deepStrictEqual(ls.trackOutline(0), []);
  feed([...lap(300).slice(150), ...lap(300)]);
  const out = ls.trackOutline(20e3);
  assert.ok(out.length > 250 && out.length < 320, `got ${out.length}`);
});

test("lap tracker keeps two identical lap times", () => {
  const lt = new LapTracker();
  lt.feed(1000, { 1: { NumberOfLaps: 5, LastLapTime: { Value: "1:31.000" } } });
  lt.feed(2000, { 1: { NumberOfLaps: 6, LastLapTime: { Value: "1:31.000" } } });
  lt.feed(2500, { 1: { LastLapTime: { Value: "1:31.000", PersonalFastest: true } } });   // same lap, flag update only
  assert.deepStrictEqual(lt.laps("1").map((x) => x.lap), [5, 6]);
});

test("deleted laps are counted per car and reinstated ones taken back", () => {
  const { deletedLaps } = require("../src/renderer/replay.js");
  const d = deletedLaps([
    { Message: "CAR 44 (HAM) TIME 1:23.456 DELETED - TRACK LIMITS AT TURN 4 LAP 7 15:04:05" },
    { Message: "CAR 44 (HAM) TIME 1:24.000 DELETED - TRACK LIMITS AT TURN 9 LAP 9 15:07:05" },
    { Message: "CAR 1 (NOR) LAP DELETED - DOUBLE YELLOW AT TURN 5 LAP 10 12:47:28 (PIT)" },
    { Message: "CAR 44 (HAM) TIME 1:23.456 WILL BE REINSTATED" },
    { Message: "GREEN LIGHT - PIT EXIT OPEN" },
  ]);
  assert.deepStrictEqual(d["44"].map((x) => [x.time, x.lap, x.limits]), [["1:24.000", 9, true]]);
  assert.deepStrictEqual(d["1"].map((x) => [x.why, x.lap, x.limits]), [["DOUBLE YELLOW AT TURN 5", 10, false]]);
});

test("every deleted-lap message in the season is recognised", () => {
  const { deletedLaps } = require("../src/renderer/replay.js");
  const lines = fs.readFileSync(path.join(__dirname, "rcm_samples.txt"), "utf8").trim().split("\n").filter((l) => / DELETED - /.test(l) && /^CAR /.test(l));
  const d = deletedLaps(lines.map((Message) => ({ Message })));
  assert.strictEqual(Object.values(d).reduce((a, x) => a + x.length, 0), lines.length);
});

test("pit rejoin: gap plus pit loss decides the place", () => {
  const { pitLoss, pitRejoin, gapSec } = require("../src/renderer/replay.js");
  assert.strictEqual(gapSec("LAP 12"), 0); assert.strictEqual(gapSec("+12.345"), 12.345); assert.strictEqual(gapSec("1L"), null);
  assert.strictEqual(pitLoss([], "1").sec, 22);
  assert.strictEqual(pitLoss([{ lane: 25 }, { lane: 30 }, { lane: 26 }], "1").sec, 26 * 0.8);
  assert.ok(pitLoss([{ lane: 20 }, { lane: 22 }], "4").sec < 13);
  const rows = [["1", 0], ["2", 3], ["3", 10], ["4", 24], ["5", 30], ["6", null]].map(([num, gap]) => ({ num, gap }));
  const r = pitRejoin(rows, "2", 22);
  assert.strictEqual(r.pos, 4);                // 3 + 22 = 25 s: cars at 0, 10 and 24 s stay ahead
  assert.strictEqual(r.ahead.num, "4"); assert.strictEqual(r.behind.num, "5");
});

test("deleted laps named by code only map back to the car number", () => {
  const { deletedLaps } = require("../src/renderer/replay.js");
  const d = deletedLaps([{ Message: "CAR BEA TIME 1:39.643 DELETED - TRACK LIMITS AT TURN 14 (NEXT LAP) (Q2)" }], { 87: { Tla: "BEA" } });
  assert.deepStrictEqual(d["87"].map((x) => [x.time, x.why]), [["1:39.643", "TRACK LIMITS AT TURN 14"]]);
});

test("a session still being published is not cached for good", async () => {
  const os = require("node:os");
  const { Archive } = require("../src/main/archive.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-"));
  const realFetch = globalThis.fetch;
  let finished = false;
  globalThis.fetch = async (url) => {
    const body = url.endsWith("TimingData.jsonStream") ? '00:00:01.000{"Lines":{}}\n'
      : url.endsWith("SessionStatus.jsonStream") ? `00:00:01.000{"Status":"Started"}\n${finished ? '00:09:00.000{"Status":"Finalised"}\n' : ""}` : null;
    return body == null ? new Response("", { status: 404 }) : new Response(body);
  };
  try {
    const a = new Archive(dir);
    await a.loadSession("2026/x/");
    assert.strictEqual(fs.readdirSync(dir).length, 0);               // half-done: nothing kept
    finished = true;
    await a.loadSession("2026/x/");
    assert.ok(fs.readdirSync(dir).some((f) => f.includes("TimingData")));
    globalThis.fetch = async () => new Response("", { status: 404 });
    await assert.rejects(a.loadSession("2026/y/"), /아직 공개되지 않았어요/);
  } finally { globalThis.fetch = realFetch; fs.rmSync(dir, { recursive: true, force: true }); }
});

test("stints left over after F1 rewrites the list are dropped (real Bahrain 2026 pattern)", () => {
  const S = (Compound, TotalLaps, New = "true") => ({ Compound, New, TotalLaps, StartLaps: 0 });
  const r = new Replay({ duration: 10, topics: {
    TimingData: [[0, { Lines: { 3: { NumberOfLaps: 0 } } }], [5, { Lines: { 3: { NumberOfLaps: 29 } } }]],
    TimingAppData: [
      [1, { Lines: { 3: { Stints: [S("INTERMEDIATE", 0), S("INTERMEDIATE", 0), S("INTERMEDIATE", 0), S("SOFT", 18)] } } }],
      // the list is rewritten one place down; index 2 and 3 are stale now
      [2, { Lines: { 3: { Stints: { 0: { TotalLaps: 0 }, 1: { TotalLaps: 1 }, 2: { Compound: "SOFT", TotalLaps: 18 } } } } }],
      [3, { Lines: { 3: { Stints: { 0: { TotalLaps: 9 }, 1: { Compound: "SOFT", TotalLaps: 18 } } } } }],
      [4, { Lines: { 3: { Stints: { 1: { TotalLaps: 20 } } } } }],
    ],
  } });
  r.seek(10);
  assert.deepStrictEqual(r.stints("3").map((x) => [x.Compound, x.TotalLaps]), [["INTERMEDIATE", 9], ["SOFT", 20]]);
  r.seek(1);   // seeking back starts over
  assert.strictEqual(r.stints("3").length, 4);
});

// ---------- real-world map fitting ----------
const geo = require("../src/main/geo.js");

test("a lap is found on mapped raceways even when shifted and slightly rotated", () => {
  // A kidney-shaped circuit (metres) as OSM would map it, plus an unrelated karting loop nearby.
  const shape = (t) => [700 * Math.cos(t) + 120 * Math.cos(2 * t), 420 * Math.sin(t) - 90 * Math.sin(3 * t)];
  const track = Array.from({ length: 400 }, (_, i) => shape((i / 400) * 2 * Math.PI));
  const kart = Array.from({ length: 80 }, (_, i) => [1300 + 60 * Math.cos(i / 12), 60 * Math.sin(i / 12)]);
  // F1's copy: decimetres, shifted 237 m east / 412 m south and turned 0.8°
  const th = 0.8 * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
  const lap = track.map(([x, y]) => [(c * x - s * y - 237) * 10, (s * x + c * y + 412) * 10, 0]);
  const fit = geo.fitTrack(lap, [track.concat([track[0]]), kart], []);
  assert.ok(fit.ok, JSON.stringify({ inliers: fit.inliers, rms: fit.rms }));
  assert.ok(fit.rms < 1.5 && fit.inliers > 0.95);
  // F1 point → map metres lands on the original, and back again
  const [ex, ey] = geo.toLocal(fit, lap[37]);
  assert.ok(Math.hypot(ex - track[37][0], ey - track[37][1]) < 2);
  const back = geo.toF1(fit, [ex, ey]);
  assert.ok(Math.hypot(back[0] - lap[37][0], back[1] - lap[37][1]) < 1);
});

test("street circuits are fitted on ordinary roads when no raceway is mapped", () => {
  const block = [[0, 0], [600, 0], [600, 300], [300, 300], [300, 500], [0, 500], [0, 0]];
  const roads = [block.slice(0, 3), block.slice(2, 5), block.slice(4), [[-400, 250], [1000, 250]], [[150, -300], [150, 900]]];
  const lap = geo.densify([block], 5).map(([x, y]) => [(x + 80) * 10, (y - 55) * 10, 0]);
  const fit = geo.fitTrack(lap, [], roads);
  assert.ok(fit.ok && fit.against === "road", JSON.stringify(fit && { inliers: fit.inliers }));
});

test("OSM answers become lines, areas and points; multipolygon pieces join into rings", () => {
  const fr = geo.frame([45, 9]);
  const ll = (x, y) => { const [lat, lon] = fr.toLL(x, y); return { lat, lon }; };
  const json = { elements: [
    { type: "way", tags: { highway: "raceway" }, geometry: [ll(0, 0), ll(100, 0)] },
    { type: "way", tags: { building: "yes" }, geometry: [ll(0, 0), ll(10, 0), ll(10, 10), ll(0, 0)] },
    { type: "way", tags: { highway: "residential" }, geometry: [ll(0, 0), ll(5, 5), ll(9, 0), ll(0, 0)] },   // closed road loop stays a line
    { type: "node", tags: { natural: "tree" }, lat: ll(3, 4).lat, lon: ll(3, 4).lon },
    { type: "relation", tags: { natural: "water" }, members: [
      { type: "way", role: "outer", geometry: [ll(0, 0), ll(50, 0), ll(50, 50)] },
      { type: "way", role: "outer", geometry: [ll(0, 0), ll(0, 50), ll(50, 50)] },
    ] },
  ] };
  const out = geo.parseOsm(json, fr);
  assert.strictEqual(out.lines.length, 2);
  assert.strictEqual(out.areas.length, 2);
  assert.strictEqual(out.points.length, 1);
  const water = out.areas.find((a) => a.tags.natural === "water");
  assert.ok(water.pts.length >= 4 && Math.hypot(water.pts[0][0] - water.pts.at(-1)[0], water.pts[0][1] - water.pts.at(-1)[1]) < 0.2);
});

test("building heights come from tags, levels or the building kind", () => {
  const { buildingHeight, areaKind } = require("../src/main/scene.js");
  assert.strictEqual(buildingHeight({ building: "yes", height: "42 m" }), 42);
  assert.strictEqual(buildingHeight({ building: "apartments", "building:levels": "5" }), 16);
  assert.strictEqual(buildingHeight({ building: "grandstand" }), 14);
  assert.strictEqual(areaKind({ landuse: "forest" }), "wood");
  assert.strictEqual(areaKind({ amenity: "parking" }), "paved");
  assert.strictEqual(areaKind({ building: "yes" }), null);
});

// ---------- telemetry ----------
test("car data becomes per-car typed arrays on the stream clock", () => {
  const { flattenCarData } = require("../src/main/archive.js");
  const out = flattenCarData([[5000, { Entries: [
    { Utc: "2026-10-04T06:00:00.000Z", Cars: { 1: { Channels: { 0: 10500, 2: 287, 3: 7, 4: 100, 5: 0, 45: 12 } } } },
    { Utc: "2026-10-04T06:00:00.250Z", Cars: { 1: { Channels: { 0: 9800, 2: 250, 3: 6, 4: 0, 5: 1 } } } },
  ] }]]);
  assert.deepStrictEqual([...out[1].t], [4750, 5000]);
  assert.deepStrictEqual([...out[1].v], [287, 250]);
  assert.deepStrictEqual([...out[1].brk], [0, 1]);
  assert.strictEqual(out[1].drs[0], 12);
});

test("telemetry lookup, lap trace distance and time at distance", () => {
  const { carAt, carTrace, timeAtDistance } = require("../src/renderer/replay.js");
  const c = { t: [0, 1000, 2000, 3000], v: [180, 180, 360, 360], rpm: [1, 1, 1, 1], gear: [6, 6, 8, 8], thr: [100, 100, 100, 100], brk: [0, 0, 0, 0], drs: [0, 0, 0, 0] };
  assert.strictEqual(carAt(c, 1500).speed, 270);              // interpolated
  assert.strictEqual(carAt(c, -10), null);
  assert.strictEqual(carAt(c, 9000), null);                   // stale
  const big = { ...c, t: [], v: [], thr: [], brk: [], gear: [], rpm: [], drs: [] };
  for (let i = 0; i <= 40; i++) { big.t.push(i * 250); big.v.push(180); big.thr.push(100); big.brk.push(0); big.gear.push(7); big.rpm.push(1); big.drs.push(0); }
  const tr = carTrace(big, 0, 10000);                         // 180 km/h = 50 m/s for 10 s
  assert.ok(Math.abs(tr.d.at(-1) - 500) < 0.01);
  assert.ok(Math.abs(timeAtDistance(tr, 250) - 5000) < 1);
});

test("bundled F1 circuit centrelines are found by F1's location names", () => {
  for (const [loc, id] of [["Monte Carlo", "mc-1929"], ["Kuala Lumpur", "my-1999"], ["Spa-Francorchamps", "be-1925"], ["Miami Gardens", "us-2022"], ["Madrid", "es-2026"]]) {
    const c = geo.circuitInfo(loc);
    assert.strictEqual(c?.id, id, loc);
    assert.ok(c.line.length > 50 && c.length > 3000);
  }
  assert.strictEqual(geo.circuitInfo("Nowhere"), null);
});

test("buildings are kept off the tarmac: pushed back to the edge, or left out when on the road", async () => {
  const { trackCorridor } = await import("../src/renderer/scenery.js");
  // a straight track along x (z = 0), 14 m wide, samples every 2 m
  const samples = Array.from({ length: 300 }, (_, i) => ({ i, p: { x: i * 2 - 300, y: 0, z: 0 }, tan: { x: 1, z: 0 }, nor: { x: 0, z: -1 }, L: 7, R: -7 }));
  const grid = { nearest(x, z) { const i = Math.max(0, Math.min(299, Math.round((x + 300) / 2))); const s = samples[i]; return [s, Math.hypot(s.p.x - x, s.p.z - z)]; } };
  const c = trackCorridor({ grid }, 3);
  const far = [[0, 40], [20, 40], [20, 60], [0, 60]];
  assert.strictEqual(c.clearPolygon(far), far);                                  // untouched
  const overlap = [[0, -5], [20, -5], [20, -30], [0, -30]];                       // front 5 m over the left edge
  const fixed = c.clearPolygon(overlap);
  assert.ok(fixed && fixed !== overlap);
  for (const [x, z] of fixed) assert.ok(!c.on(x, z, 2.9), `corner ${x},${z} still on the track`);
  assert.strictEqual(c.clearPolygon([[0, -20], [20, -20], [20, 20], [0, 20]]), null);   // across the road
});

test("positions between samples follow a smooth curve, not straight segments", () => {
  // a car on a circle of 100 m (1000 dm) sampled every 30°; halfway between samples it should still be on the circle
  const P = Array.from({ length: 13 }, (_, k) => { const a = (k * Math.PI) / 6; return [k * 1000, { 1: [1000 * Math.cos(a), 1000 * Math.sin(a), 0] }]; });
  const r = new Replay({ duration: 13000, topics: { Position: P } });
  const [x, y] = r.positionsAt(5500)[1];
  assert.ok(Math.abs(Math.hypot(x, y) - 1000) < 15, `radius ${Math.hypot(x, y).toFixed(1)}`);   // a chord would be at 966
});

test("cars that overlap in the data are moved apart: sideways when side by side, along the track when nose to tail", () => {
  const { separateCars, CAR_LEN, CAR_WID } = require("../src/renderer/replay.js");
  const mem = {};
  // side by side, 1.2 m apart, half a car length offset: pushed sideways to a car's width
  let off = separateCars([{ id: "1", x: 0, z: 0, hx: 0, hz: 1 }, { id: "2", x: 1.2, z: 1, hx: 0, hz: 1 }], mem);
  assert.ok(Math.abs(1.2 + off["2"][0] - off["1"][0] - CAR_WID) < 1e-6 && off["1"][1] === 0);
  // the pair keeps its sides even when the data briefly puts them level (no swapping back and forth)
  off = separateCars([{ id: "1", x: 0, z: 0, hx: 0, hz: 1 }, { id: "2", x: -0.1, z: 1, hx: 0, hz: 1 }], mem);
  assert.ok(off["2"][0] > off["1"][0]);
  // nose to tail, 3 m apart: pushed apart along the track, order kept
  off = separateCars([{ id: "1", x: 0, z: 0, hx: 0, hz: 1 }, { id: "2", x: 0.2, z: 3, hx: 0, hz: 1 }], {});
  assert.ok(Math.abs(3 + off["2"][1] - off["1"][1] - CAR_LEN) < 1e-6);
  // far apart: untouched
  off = separateCars([{ id: "1", x: 0, z: 0, hx: 0, hz: 1 }, { id: "2", x: 10, z: 0, hx: 0, hz: 1 }], {});
  assert.deepStrictEqual(off, { 1: [0, 0], 2: [0, 0] });
});

test("grandstand data: every stand lies at its circuit, with sane rows and capacities", () => {
  const geo = require("../src/main/geo");
  const { circuits } = JSON.parse(require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src", "data", "grandstands.json"), "utf8"));
  assert.ok(Object.keys(circuits).length >= 24);
  for (const [loc, c] of Object.entries(circuits)) {
    assert.ok(c.total > 0 && c.seats > 0 && c.seats <= c.total, `${loc}: capacity`);
    const centre = geo.CIRCUITS[loc] || geo.circuitInfo(loc)?.center;
    assert.ok(centre, `${loc}: known circuit`);
    const fr = geo.frame(centre);
    for (const st of c.stands) {
      for (const p of [st.a, st.b]) { const [x, y] = fr.toXY(p[0], p[1]); assert.ok(Math.hypot(x, y) < 3500, `${loc} ${st.n}: near the circuit`); }
      assert.ok(st.rows >= 4 && st.rows <= 40, `${loc} ${st.n}: rows`);
    }
  }
});

test("archive: refused by F1 (401/403/429) or a server error – the cached copy, even an old index; nothing cached – a clear error; 404 – no fallback", async () => {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const { Archive } = require("../src/main/archive.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-arch-"));
  const a = new Archive(dir);
  fs.writeFileSync(a.cachePath("2026/Index.json"), '{"Meetings":[]}');
  const old = new Date(Date.now() - 3 * 3600e3); fs.utimesSync(a.cachePath("2026/Index.json"), old, old);   // older than an hour: refetched
  const realFetch = global.fetch;
  try {
    for (const status of [401, 403, 429, 503]) {
      global.fetch = async () => ({ ok: false, status, headers: new Map() });
      assert.deepStrictEqual(await a.listSessions(2026), [], `HTTP ${status}: the cached index`);
    }
    global.fetch = async () => ({ ok: false, status: 401, headers: new Map() });
    await assert.rejects(a.getText("2025/Index.json", { maxAgeMs: 3600e3 }), (e) => e.status === 401 && /접근을 막았어요/.test(e.message));
    fs.writeFileSync(a.cachePath("2024/x.jsonStream"), "cached");
    const t = Date.now() - 1; fs.utimesSync(a.cachePath("2024/x.jsonStream"), new Date(t - 9e9), new Date(t - 9e9));
    global.fetch = async () => ({ ok: false, status: 404, headers: new Map() });
    await assert.rejects(a.getText("2024/y.jsonStream"), (e) => e.status === 404);
  } finally { global.fetch = realFetch; fs.rmSync(dir, { recursive: true, force: true }); }
});

test("archive: refused anonymously, tried with the F1 TV sign-in – the form that works is kept; no sign-in or every form refused, said so", async () => {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const { Archive } = require("../src/main/archive.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-auth-"));
  const realFetch = global.fetch, calls = [];
  try {
    // the archive takes only the "ascendontoken" header
    global.fetch = async (url, o) => { calls.push(Object.keys(o?.headers || {})); const ok = o?.headers?.ascendontoken === "T"; return { ok, status: ok ? 200 : 401, headers: new Map(), text: async () => "data" }; };
    const a = new Archive(dir); a.tokenProvider = async () => "T";
    assert.strictEqual(await a.getText("2026/x.jsonStream"), "data");
    assert.strictEqual(a.authTried, "ascendontoken");
    assert.deepStrictEqual(calls.map((c) => c.join()), ["", "Authorization", "ascendontoken"]);
    calls.length = 0;
    assert.strictEqual(await a.getText("2026/y.jsonStream"), "data");
    assert.deepStrictEqual(calls.map((c) => c.join()), ["ascendontoken"], "straight away the next time");
    // signed out: refused, with the hint
    const b = new Archive(dir); b.tokenProvider = async () => null;
    await assert.rejects(b.getText("2026/z.jsonStream"), (e) => e.status === 401 && /로그인하면 열릴 수도/.test(e.message));
    // every form refused
    global.fetch = async () => ({ ok: false, status: 401, headers: new Map() });
    const c = new Archive(dir); c.tokenProvider = async () => "T";
    await assert.rejects(c.getText("2026/w.jsonStream"), (e) => /로그인 토큰으로도 거부/.test(e.message));
    assert.strictEqual(c.authTried, "refused");
  } finally { global.fetch = realFetch; fs.rmSync(dir, { recursive: true, force: true }); }
});

test("loading a cached session while F1 refuses: a topic never cached is missing (not a failure) and nothing cached is thrown away", async () => {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const { Archive, TOPICS } = require("../src/main/archive.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-keep-"));
  const realFetch = global.fetch;
  try {
    const a = new Archive(dir), P = "2026/X/Race/";
    // cached: the core topics and a finalised status; never cached: the rest (F1 had no file for them)
    const line = (o) => "00:00:01.000" + JSON.stringify(o) + "\n";
    fs.writeFileSync(a.cachePath(P + "TimingData.jsonStream"), line({ Lines: { 1: { Position: "1" } } }));
    fs.writeFileSync(a.cachePath(P + "DriverList.jsonStream"), line({ 1: { Tla: "VER" } }));
    fs.writeFileSync(a.cachePath(P + "SessionInfo.jsonStream"), line({ Meeting: { Name: "X" } }));
    fs.writeFileSync(a.cachePath(P + "SessionStatus.jsonStream"), line({ Status: "Finalised" }));
    global.fetch = async () => ({ ok: false, status: 401, headers: new Map() });
    const r = await a.loadSession(P);
    assert.ok(r.topics.TimingData.length > 0);
    for (const t of ["TimingData", "DriverList", "SessionInfo", "SessionStatus"]) assert.ok(fs.existsSync(a.cachePath(P + t + ".jsonStream")), t + " kept");
    assert.ok(TOPICS.length > 4);
  } finally { global.fetch = realFetch; fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the sign-in window's user agent is plain ASCII Chrome – no app name (Korean, not ASCII: F1's sign-in answered it with HTTP 500), no Electron", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/main/auth.js"), "utf8");
  const m = /const PLAIN_UA = `([^`]+)`/.exec(src); assert.ok(m, "PLAIN_UA defined");
  const ua = m[1].replace("${process.versions.chrome || \"142.0.0.0\"}", "152.0.0.0");
  assert.ok(/^[\x20-\x7e]+$/.test(ua), "ASCII only"); assert.ok(!/Electron|LiveTiming|라이브/.test(ua)); assert.ok(/Chrome\/152\.0\.0\.0 Safari/.test(ua));
  assert.ok(/setUserAgent\(PLAIN_UA\)/.test(src));
});
