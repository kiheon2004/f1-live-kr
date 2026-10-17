// The steering wheels' screens (wheelscreen.js): each driver's own data, not one shared made-up picture (v0.34 showed
// gear 7, "DELTA -0.12", "LAP 23" on every car); neutral 0 is "N", no fresh data is "no data" (never the last values as
// if current); a new session leaves no screen on another driver's face.
const test = require("node:test");
const assert = require("node:assert");

const noop = new Proxy(() => {}, { get: (t, k) => (k === "canvas" ? {} : noop), apply: () => undefined, set: () => true });
const canvas = () => ({ width: 0, height: 0, getContext: () => noop });

test("wheel screen: two drivers at the same moment show their own gear, speed, place, lap and gap", async () => {
  const { screenModel } = await import("../src/renderer/wheelscreen.js");
  const laps = { CurrentLap: 23, TotalLaps: 57 };
  const a = screenModel({ car: { speed: 301.4, rpm: 11800, gear: 8, drs: 12 }, line: { Position: "1", NumberOfLaps: 22, IntervalToPositionAhead: { Value: "" } }, laps, season: 2025 });
  const b = screenModel({ car: { speed: 96, rpm: 9000, gear: 3, drs: 0 }, line: { Position: "7", NumberOfLaps: 21, IntervalToPositionAhead: { Value: "+1.204" } }, laps, season: 2025 });
  assert.deepStrictEqual([a.gear, a.speed, a.pos, a.lap, a.gap, a.drs], ["8", 301, 1, 23, "LEADER", "open"]);
  assert.deepStrictEqual([b.gear, b.speed, b.pos, b.lap, b.gap, b.drs], ["3", 96, 7, 22, "+1.204", null]);
  assert.notStrictEqual(a.key, b.key);
});

test("wheel screen: neutral is N, no fresh telemetry is no data, 2026 shows no DRS (the feed sends none)", async () => {
  const { screenModel } = await import("../src/renderer/wheelscreen.js");
  assert.strictEqual(screenModel({ car: { speed: 0, rpm: 4000, gear: 0, drs: 0 }, season: 2025 }).gear, "N");
  const gone = screenModel({ car: null, line: { Position: "4", NumberOfLaps: 10 }, season: 2025 });
  assert.deepStrictEqual([gone.gear, gone.speed, gone.rev, gone.stale, gone.pos], ["–", null, 0, true, 4]);
  assert.strictEqual(screenModel({ car: { speed: 320, rpm: 11500, gear: 8, drs: null }, season: 2026 }).drs, null);
  // telemetry parsed without channel 45 (2026): not sent – never a "closed" DRS; with it (2025): its code
  const { flattenCarData } = require("../src/main/archive.js"), K = require("../src/renderer/replay.js");
  const at = "2026-01-01T00:00:00.000Z", car26 = flattenCarData([[1000, { Entries: [{ Utc: at, Cars: { 1: { Channels: { 0: 11000, 2: 300, 3: 8, 4: 100, 5: 0 } } } }] }]])["1"];
  const car25 = flattenCarData([[1000, { Entries: [{ Utc: at, Cars: { 1: { Channels: { 0: 11000, 2: 300, 3: 8, 4: 100, 5: 0, 45: 0 } } } }] }]])["1"];
  assert.strictEqual(K.carAt(car26, 1000).drs, null);
  assert.strictEqual(K.carAt(car25, 1000).drs, 0);
});

test("wheel screens: a few for the nearest cars, each repainted only when its picture changes, cleared on a new session", async () => {
  const { WheelScreens, screenModel } = await import("../src/renderer/wheelscreen.js");
  const ws = new WheelScreens({ size: 2, every: 100, canvas });
  let r = ws.assign([{ num: "16" }, { num: "44" }, { num: "1" }]);
  assert.deepStrictEqual(r.have.map((x) => x.num).sort(), ["16", "44"]);
  const data = { 16: { speed: 200, rpm: 10000, gear: 6 }, 44: { speed: 180, rpm: 9800, gear: 5 } };
  const get = (n) => screenModel({ car: data[n], season: 2026 });
  assert.strictEqual(ws.update(get, 1000), 2);
  assert.strictEqual(ws.update(get, 1200), 0, "nothing changed: nothing repainted");
  data[16] = { speed: 210, rpm: 10500, gear: 6 };
  assert.strictEqual(ws.update(get, 1250), 1);
  assert.strictEqual(ws.update(get, 1260), 0, "changed again within 100 ms: waits");
  // 44 drops out, 1 comes in: 44's screen is reused for 1 and painted afresh
  r = ws.assign([{ num: "16" }, { num: "1" }]);
  assert.deepStrictEqual(r.lost, ["44"]);
  const tex1 = r.have.find((x) => x.num === "1").tex;
  ws.reset();
  r = ws.assign([{ num: "63" }]);
  assert.deepStrictEqual(r.have.map((x) => x.num), ["63"]);
  assert.ok(ws.slots.every((s) => s.num !== "1" && s.num !== "16"), "a new session: no old driver keeps a screen");
  assert.strictEqual(ws.slots.length, 2, "never more textures than its size");
  assert.ok(tex1.userData.shared, "the pool's textures aren't freed with a car");
});

// v0.35: the teams' own pit wall panels – each of a team's two drivers on its own half, by team (not by place); a
// change of the classification doesn't swap them
test("pit wall panels: a team's two drivers each with their own data, tied to the driver, not the place", async () => {
  const { driverPanel } = await import("../src/renderer/pitscreens.js");
  const ham = driverPanel({ d: { num: "44", tla: "HAM" }, line: { Position: "4", NumberOfLaps: 23, IntervalToPositionAhead: { Value: "3.821" }, LastLapTime: { Value: "1:25.380" } },
    app: { Stints: { 0: { Compound: "MEDIUM", TotalLaps: 23, New: "true" } } }, car: { speed: 318, gear: 8 } });
  const lec = driverPanel({ d: { num: "16", tla: "LEC" }, line: { Position: "22", NumberOfLaps: 1, Retired: true }, car: null });
  assert.deepStrictEqual([ham.num, ham.pos, ham.gap, ham.last, ham.tyre.c, ham.tyre.age, ham.speed, ham.gear, ham.state], ["44", 4, "+3.821", "1:25.380", "M", 23, 318, "8", null]);
  assert.deepStrictEqual([lec.num, lec.pos, lec.state, lec.speed], ["16", 22, "OUT", null]);
  const swapped = driverPanel({ d: { num: "44", tla: "HAM" }, line: { Position: "1", NumberOfLaps: 24 }, car: null });
  assert.deepStrictEqual([swapped.num, swapped.tla, swapped.gap], ["44", "HAM", "LEADER"]);
});

// v0.36 review: a screen handed to another driver showed the previous driver's face until its rate limit let it repaint
// (size 1, every 125 ms: 16 painted at 1000 ms, the slot given to 44 at 1050 ms – 44's first update was held back)
test("wheel screens: a screen handed to another driver is wiped at once and painted for its new owner on the next update", async () => {
  const { WheelScreens, screenModel } = await import("../src/renderer/wheelscreen.js");
  const painted = []; const ctx = new Proxy(() => {}, { get: (t, k) => (k === "fillText" ? (s) => painted.push(String(s)) : k === "canvas" ? {} : () => {}), set: () => true });
  const ws = new WheelScreens({ size: 1, every: 125, canvas: () => ({ width: 0, height: 0, getContext: () => ctx }) });
  const data = { 16: { speed: 250, rpm: 11000, gear: 7 }, 44: { speed: 120, rpm: 9000, gear: 3 } };
  const get = (n) => screenModel({ car: data[n], season: 2026 });
  ws.assign([{ num: "16" }]); ws.update(get, 1000);
  assert.strictEqual(ws.slots[0].painted, "16"); assert.ok(painted.includes("7"));
  painted.length = 0;
  ws.assign([{ num: "44" }]);
  assert.ok(painted.includes("NO DATA") && !painted.includes("7"), "the old face wiped when the slot changed hands");
  assert.strictEqual(ws.update(get, 1050), 1, "the new owner painted at once, not 75 ms later");
  assert.strictEqual(ws.slots[0].painted, "44"); assert.ok(painted.includes("3"));
  // still limited for its own updates
  data[44] = { speed: 130, rpm: 9200, gear: 3 }; assert.strictEqual(ws.update(get, 1100), 0);
  // a reset: wiped at once too
  painted.length = 0; ws.reset(); assert.ok(painted.includes("NO DATA")); assert.strictEqual(ws.slots[0].painted, null);
  ws.assign([{ num: "16" }]); assert.strictEqual(ws.update(get, 1101), 1);
});

// v0.36: what the screens show from partial or odd timing – laps-down gaps, empty strings, missing numbers – never
// "NaN" / "undefined", seconds and laps told apart; the wheel's lap the one being driven, the wall's laps completed
test("wheel screen and pit wall panel: laps-down gaps, partial data, no NaN or undefined", async () => {
  const { screenModel } = await import("../src/renderer/wheelscreen.js"), { driverPanel } = await import("../src/renderer/pitscreens.js");
  const lines = [{ Position: "15", NumberOfLaps: 40, IntervalToPositionAhead: { Value: "1 L" } }, { Position: "16", NumberOfLaps: 39, IntervalToPositionAhead: { Value: "+2 LAPS" } },
    { Position: "3", NumberOfLaps: 41, IntervalToPositionAhead: { Value: "" } }, { Position: "4", IntervalToPositionAhead: {} }, { Position: "5", NumberOfLaps: 41, IntervalToPositionAhead: { Value: "+0.8" } }];
  const w = lines.map((line) => screenModel({ car: { speed: NaN, rpm: undefined, gear: undefined }, line, laps: { CurrentLap: 42, TotalLaps: 57 }, season: 2025 }));
  assert.deepStrictEqual(w.map((m) => m.gap), ["+1 LAP", "+2 LAP", null, null, "+0.8"]);
  assert.deepStrictEqual(w.map((m) => m.lap), [41, 40, 42, null, 42], "the lap being driven (completed + 1, never past the leader's); unknown without its laps");
  for (const m of w) assert.ok(!/NaN|undefined/.test(m.key), m.key);
  const p = lines.map((line) => driverPanel({ d: { num: "1", tla: "X" }, line, car: { speed: NaN, gear: undefined } }));
  assert.deepStrictEqual(p.map((m) => m.laps), [40, 39, 41, null, 41], "the wall shows laps completed");
  for (const m of p) assert.ok(!/NaN|undefined/.test(m.key), m.key);
});
