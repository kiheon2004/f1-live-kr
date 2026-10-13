// Timing and delta handling (v0.14 review): lap corrections vs. laps whose time comes before the counter, the live
// clock when the delay changes, array patches with deletions, race control messages corrected in place, the
// undelayed TV-sync values per session, and damaged recordings.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { LapTracker, LiveSource, Replay, merge, newMessages } = require("../src/renderer/replay.js");

const laps = (tr, num, t) => tr.laps(num, t).map((l) => [l.lap, l.time]);

// ---------- LapTracker ----------
test("laps: a lap time corrected on its own (no counter) a few seconds later is that lap corrected, not one more", () => {
  const tr = new LapTracker();
  tr.feed(100000, { 1: { NumberOfLaps: 10, LastLapTime: { Value: "1:20.000" } } });
  tr.feed(103000, { 1: { LastLapTime: { Value: "1:20.100" } } });
  assert.deepStrictEqual(laps(tr, "1"), [[10, "1:20.100"]]);
  // a replay looking before the correction sees the time as it was then
  assert.deepStrictEqual(laps(tr, "1", 101000), [[10, "1:20.000"]]);
  // the next real lap still comes in as the next lap
  tr.feed(181000, { 1: { NumberOfLaps: 11, LastLapTime: { Value: "1:19.800" } } });
  assert.deepStrictEqual(laps(tr, "1"), [[10, "1:20.100"], [11, "1:19.800"]]);
});

test("laps: an in-lap's time before the counter (real practice pattern) is the next lap, and the late counter confirms it", () => {
  // British GP 2025 FP1, car 16: N=3 with 1:33.491; into the pits; 2:00.449 with no counter 120 s later; N=4 at pit exit
  const tr = new LapTracker();
  tr.feed(1198850, { 16: { NumberOfLaps: 3, LastLapTime: { Value: "1:33.491" } } });
  tr.feed(1313223, { 16: { InPit: true } });
  tr.feed(1319303, { 16: { LastLapTime: { Value: "2:00.449" } } });
  assert.deepStrictEqual(laps(tr, "16"), [[3, "1:33.491"], [4, "2:00.449"]]);
  tr.feed(1586045, { 16: { NumberOfLaps: 4, InPit: false, PitOut: true } });
  tr.feed(1700000, { 16: { NumberOfLaps: 5, LastLapTime: { Value: "1:29.000" } } });
  assert.deepStrictEqual(laps(tr, "16"), [[3, "1:33.491"], [4, "2:00.449"], [5, "1:29.000"]]);
  // a quick drive-through: the time, then the counter 15 s later
  const t2 = new LapTracker();
  t2.feed(0, { 81: { NumberOfLaps: 3, LastLapTime: { Value: "1:31.000" } } });
  t2.feed(130000, { 81: { LastLapTime: { Value: "1:56.713" } } });
  t2.feed(147000, { 81: { NumberOfLaps: 4, PitOut: true } });
  assert.deepStrictEqual(laps(t2, "81"), [[3, "1:31.000"], [4, "1:56.713"]]);
});

test("laps: the counter alone, then the same time as before a lap later, is a new lap; joining mid-session starts at the counter", () => {
  const tr = new LapTracker();
  tr.feed(1000, { 1: { NumberOfLaps: 12, LastLapTime: { Value: "1:30.000" } } });   // joined: lap 12 is the first we know
  assert.deepStrictEqual(laps(tr, "1"), [[12, "1:30.000"]]);
  tr.feed(91000, { 1: { NumberOfLaps: 13 } });
  tr.feed(91200, { 1: { LastLapTime: { Value: "1:30.000" } } });
  assert.deepStrictEqual(laps(tr, "1"), [[12, "1:30.000"], [13, "1:30.000"]]);
  // the same time repeated without a counter a moment later (a resend) is nothing
  tr.feed(92000, { 1: { LastLapTime: { Value: "1:30.000" } } });
  assert.strictEqual(tr.laps("1").length, 2);
  // the same time first, the counter a little later (a lap timed identically, counter late) is a new lap too
  tr.feed(181000, { 1: { LastLapTime: { Value: "1:30.000" } } });
  tr.feed(181500, { 1: { NumberOfLaps: 14 } });
  assert.deepStrictEqual(laps(tr, "1").map((l) => l[0]), [12, 13, 14]);
});

// ---------- LiveSource clock ----------
test("live clock: raising the delay between updates never moves the clock back", () => {
  const ls = new LiveSource();
  ls.queue.push({ at: 1000, topic: "LapCount", data: { CurrentLap: 3 } });
  ls.tick(1100);
  ls.tick(5000);                               // nothing new: the clock runs on with the wall clock
  assert.strictEqual(ls.now(), 5000);
  ls.delayMs = 3000;                           // raised with no update in between
  ls.tick(5100);
  assert.ok(ls.now() >= 5000, `clock went back to ${ls.now()}`);
  ls.tick(8500);
  assert.strictEqual(ls.now(), 5500, "runs on once the delayed time passes what was shown");
});

test("live clock: before the first delayed snapshot shows, the clock is the delayed time, not when the source was made", () => {
  const ls = new LiveSource();
  const made = Date.now();
  ls.delayMs = 30000;
  ls.snapshot({ SessionInfo: { Key: 1, Name: "Race" }, LapCount: { CurrentLap: 1 } }, made + 10);
  ls.tick(made + 1000);
  assert.ok(ls.now() <= made - 29000 + 5, `clock ${ls.now() - made} ms from creation, expected the delayed time`);
  assert.strictEqual(ls.state.SessionInfo, undefined, "the snapshot still waits out the delay");
  ls.tick(made + 30010);
  assert.strictEqual(ls.state.SessionInfo.Key, 1);
  // lowering the delay jumps forward; pausing holds; resuming carries on from the held moment
  ls.queue.push({ at: made + 31000, topic: "LapCount", data: { CurrentLap: 2 } });
  ls.delayMs = 0; ls.tick(made + 32000);
  assert.strictEqual(ls.state.LapCount.CurrentLap, 2); assert.strictEqual(ls.now(), made + 32000);
  ls.pause(made + 32000); ls.tick(made + 40000);
  assert.strictEqual(ls.now(), made + 32000, "paused: the clock holds");
  ls.resume(made + 40000); ls.tick(made + 40500);
  assert.strictEqual(ls.now(), made + 32500, "resumed with the paused time as delay");
});

// ---------- merge ----------
test("merge: an array patched by index together with _deleted stays an array; other indices keep their place", () => {
  const s = { Stints: [{ a: 0 }, { a: 1 }, { a: 2 }] };
  merge(s, { Stints: { 1: { a: 11 }, _deleted: ["0"] } });
  assert.ok(Array.isArray(s.Stints), "still an array");
  assert.strictEqual(s.Stints.length, 3);
  assert.strictEqual(s.Stints[0], undefined, "deleted in place – the others don't move up");
  assert.deepStrictEqual(s.Stints[1], { a: 11 }); assert.deepStrictEqual(s.Stints[2], { a: 2 });
  // unsafe keys are still never merged
  try { merge(s, JSON.parse('{"Stints":{"__proto__":{"polluted":1},"_deleted":["__proto__"]}}')); assert.strictEqual({}.polluted, undefined); }
  finally { delete Object.prototype.polluted; }
});

// ---------- race control messages ----------
const RC = (i, msg, extra = {}) => ({ Utc: "2025-07-06T14:0" + i + ":00", Category: "Other", Message: msg, ...extra });
test("race control: a correction to a message (same index) updates it in place; only new messages count as new", () => {
  const ls = new LiveSource();
  ls.apply({ at: 1, snap: { RaceControlMessages: { Messages: [RC(0, "GREEN LIGHT - PIT EXIT OPEN"), RC(1, "CAR 1 (VER) TIME 1:30.000 DELETED - TRACK LIMITS AT TURN 4 LAP 3 14:01:00")] } } });
  const seen = ls.rc.added;
  ls.apply({ at: 2, topic: "RaceControlMessages", data: { Messages: { 1: { Message: "CAR 1 (VER) TIME 1:30.100 DELETED - TRACK LIMITS AT TURN 4 LAP 3 14:01:00" } } } });
  assert.strictEqual(ls.messages.length, 2, "a correction is not a new message");
  assert.match(ls.messages[1].Message, /1:30\.100/);
  assert.strictEqual(ls.messages[1].Category, "Other", "the rest of the message is kept");
  assert.deepStrictEqual(newMessages(ls, seen), [], "nothing new to alert about");
  ls.apply({ at: 3, topic: "RaceControlMessages", data: { Messages: { 2: RC(2, "SAFETY CAR DEPLOYED", { Category: "SafetyCar" }) } } });
  assert.deepStrictEqual(newMessages(ls, seen).map((m) => m.Message), ["SAFETY CAR DEPLOYED"]);
  const rev = ls.rc.rev;
  // a deletion takes that one out without the later ones moving up into its index
  ls.apply({ at: 4, topic: "RaceControlMessages", data: { Messages: { _deleted: ["0"] } } });
  assert.deepStrictEqual(ls.messages.map((m) => m.Message.slice(0, 6)), ["CAR 1 ", "SAFETY"]);
  assert.ok(ls.rc.rev > rev, "the list knows it changed");
  ls.apply({ at: 5, topic: "RaceControlMessages", data: { Messages: { 2: { Flag: "CLEAR" } } } });
  assert.strictEqual(ls.messages[1].Flag, "CLEAR", "index 2 is still the safety car message");
  // a reconnect snapshot replaces the list; it's a fresh picture (new epoch: the screen takes it without alerts)
  const epoch = ls.epoch;
  ls.apply({ at: 6, snap: { RaceControlMessages: { Messages: [RC(0, "A"), RC(1, "B")] } } });
  assert.deepStrictEqual(ls.messages.map((m) => m.Message), ["A", "B"]);
  assert.ok(ls.epoch > epoch);
});

test("race control: a replay seeking back and forth rebuilds the same list as playing through", () => {
  const ev = [[1000, { Messages: [RC(0, "M0")] }], [2000, { Messages: { 1: RC(1, "M1") } }], [3000, { Messages: { 1: { Message: "M1 corrected" } } }], [4000, { Messages: { 2: RC(2, "M2") } }]];
  const r = new Replay({ topics: { RaceControlMessages: ev }, duration: 5000 });
  for (let t = 0; t <= 5000; t += 250) r.seek(t);
  const played = r.messages.map((m) => m.Message);
  r.seek(2500); assert.deepStrictEqual(r.messages.map((m) => m.Message), ["M0", "M1"], "before the correction");
  r.seek(5000); assert.deepStrictEqual(r.messages.map((m) => m.Message), played);
  assert.deepStrictEqual(played, ["M0", "M1 corrected", "M2"]);
});

// ---------- undelayed values for the TV sync ----------
test("TV sync: a new session's clock and lap only – the previous session's never line up the delay", () => {
  const ls = new LiveSource();
  ls.snapshot({ SessionInfo: { Key: 100 }, LapCount: { CurrentLap: 30 }, ExtrapolatedClock: { Utc: "2025-07-06T15:00:00Z", Remaining: "00:10:00", Extrapolating: true } }, 1000);
  assert.strictEqual(ls.rawLap.lap, 30);
  // the next session starts (its info arrives before its clock or lap)
  ls.push("SessionInfo", { Key: 101, Name: "Race" });
  assert.strictEqual(ls.delayFromLapPress(), null, "no lap of the new session yet");
  assert.strictEqual(ls.remainingNow(), null, "no clock of the new session yet");
  ls.push("LapCount", { CurrentLap: 1 });
  assert.strictEqual(ls.rawLap.lap, 1);
  // the delayed screen catching up with the new session doesn't wipe what was already received for it
  ls.delayMs = 0; ls.tick(Date.now() + 10);
  assert.strictEqual(ls.state.SessionInfo.Key, 101);
  assert.strictEqual(ls.rawLap.lap, 1);
  // a reconnect snapshot of the new session (keys in any order) keeps its values
  ls.snapshot({ LapCount: { CurrentLap: 2 }, SessionInfo: { Key: 101 } }, Date.now());
  assert.strictEqual(ls.rawLap.lap, 2);
});

// ---------- damaged recordings ----------
const { Archive } = require("../src/main/archive.js");
const resp = (text) => text == null ? { ok: false, status: 404, headers: new Map() }
  : { ok: true, status: 200, headers: new Map([["content-length", String(Buffer.byteLength(text))]]), text: async () => text, body: (async function* () { yield Buffer.from(text); })() };
test("archive: lap data that can't be read at all is an error (after one fresh download), not an empty replay", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-arc-")), a = new Archive(dir), P = "2025/X/Race/";
  const realFetch = global.fetch; let timingFetches = 0;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith("TimingData.jsonStream")) { timingFetches++; return resp("00:00:01.000{broken\n00:00:02.000also broken\n"); }
    if (u.endsWith("SessionStatus.jsonStream")) return resp('00:00:01.000{"Status":"Finalised"}\n');
    return resp(null);
  };
  try {
    await assert.rejects(a.loadSession(P), /읽을 수 없|damaged|손상/);
    assert.strictEqual(timingFetches, 2, "downloaded again once before giving up");
    assert.ok(!fs.existsSync(a.cachePath(`${P}TimingData.jsonStream`)), "the damaged file isn't kept");
  } finally { global.fetch = realFetch; fs.rmSync(dir, { recursive: true, force: true }); }
});

test("archive: a damaged optional topic is dropped from the cache and the session still loads; missing ones are fine", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-arc-")), a = new Archive(dir), P = "2025/Y/Race/";
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    const body = u.endsWith("TimingData.jsonStream") ? '00:00:01.000{"Lines":{"1":{"NumberOfLaps":1}}}\n'
      : u.endsWith("SessionStatus.jsonStream") ? '00:00:01.000{"Status":"Finalised"}\n'
      : u.endsWith("WeatherData.jsonStream") ? "00:00:01.000{not json\n" : null;
    return resp(body);
  };
  try {
    const s = await a.loadSession(P);
    assert.strictEqual(s.topics.TimingData.length, 1);
    assert.deepStrictEqual(s.topics.WeatherData, []);
    assert.ok(!fs.existsSync(a.cachePath(`${P}WeatherData.jsonStream`)), "the damaged optional file is fetched again next time");
    assert.ok(fs.existsSync(a.cachePath(`${P}TimingData.jsonStream`)), "good files stay cached");
  } finally { global.fetch = realFetch; fs.rmSync(dir, { recursive: true, force: true }); }
});

// v0.14 optimisation review: the deleted laps kept between board redraws are worked out again when a driver's code is
// corrected (same number of drivers) – they match codes in the messages to car numbers; the 2D map's canvas buffer is
// sized in whole device pixels, so a fractional size doesn't set (and clear) it again every frame.
test("deleted laps: a driver's code corrected (or two swapped) is seen at once; colours and names changing don't recount", () => {
  const { deletedLapsMemo, deletedLaps } = require("../src/renderer/replay.js");
  const memo = deletedLapsMemo(), src = {};
  const msgs = [{ Message: "CAR AAA TIME 1:30.000 DELETED - TRACK LIMITS AT TURN 4 LAP 7 15:04:05" }];
  const keys = (d) => Object.keys(memo(src, "1|0", msgs, d)).sort();
  assert.deepStrictEqual(keys({ 1: { Tla: "AAA" }, 2: { Tla: "CCC" } }), ["1"]);
  // the list corrected: car 1 is BBB – the deletion named AAA no longer goes to car 1
  assert.deepStrictEqual(keys({ 1: { Tla: "BBB" }, 2: { Tla: "CCC" } }), ["AAA"]);
  assert.deepStrictEqual(keys({ 1: { Tla: "CCC" }, 2: { Tla: "AAA" } }), ["2"], "codes swapped");
  // same as working it out directly, every time
  for (const d of [{ 1: { Tla: "AAA" } }, { 1: { Tla: "BBB" } }, { 3: { Tla: "AAA" } }]) assert.deepStrictEqual(memo(src, "1|0", msgs, d), deletedLaps(msgs, d));
  // a colour or name changing: the kept result, not worked out again
  const d0 = { 1: { Tla: "AAA", TeamColour: "ff0000" } }, v0 = memo(src, "2|0", msgs, d0);
  assert.strictEqual(memo(src, "2|0", msgs, { 1: { Tla: "AAA", TeamColour: "00ff00", LastName: "X" } }), v0);
  // new messages (revision), another source: worked out again
  const more = [...msgs, { Message: "CAR 5 (EEE) LAP DELETED - TRACK LIMITS AT TURN 9 LAP 8 15:06:00" }];
  assert.deepStrictEqual(Object.keys(memo(src, "3|0", more, d0)).sort(), ["1", "5"]);
  assert.deepStrictEqual(Object.keys(memo({}, "3|0", msgs, d0)), ["1"]);
});

test("2D map canvas: whole device pixels – a fractional size sets the buffer once, not every frame", () => {
  const { canvasPixels } = require("../src/renderer/replay.js");
  for (const dpr of [1, 1.25, 1.5, 2]) for (const [w, h] of [[400.5, 300.25], [399.75, 301.6], [640, 360]]) {
    let sets = 0, cw = 0, ch = 0;
    const canvas = { get width() { return cw; }, set width(v) { sets++; cw = Math.trunc(v); }, get height() { return ch; }, set height(v) { sets++; ch = Math.trunc(v); } };
    for (let f = 0; f < 5; f++) { const [pw, ph] = canvasPixels(w, h, dpr); if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; } }
    assert.strictEqual(sets, 2, `${w}×${h} at ${dpr}: set once (${sets / 2} times)`);
    const [pw, ph, sx, sy] = canvasPixels(w, h, dpr);
    assert.ok(Math.abs(pw - w * dpr) <= 0.5 && Math.abs(ph - h * dpr) <= 0.5 && Math.abs(sx * w - pw) < 1e-9 && Math.abs(sy * h - ph) < 1e-9);
  }
  // hidden (no size): a 1 × 1 buffer and a finite scale
  assert.deepStrictEqual(canvasPixels(0, 0, 2), [1, 1, 2, 2]);
});
