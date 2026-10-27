// v0.45 weather fixes. §3: partial WeatherData updates at the same moment merge (the last value given for a field wins,
// the other fields are kept); the derived state (wetness, rain start / end) is worked out once from the merged record.
const test = require("node:test");
const assert = require("node:assert");
const W = () => import("../src/renderer/weather.js");
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
