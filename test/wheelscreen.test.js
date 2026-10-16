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
