// v0.45 §5: the cloud answers (main/clouds.js) checked before the sky uses them – coordinates, UTC, time strings, order,
// array lengths, each layer's 0–100 % range, the asked dates, the disk cache's structure and atomic writes – and the
// real Open-Meteo formats (fixtures fetched anonymously 2026-10-21: test/fixtures/clouds). No network: fetchFn injected.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Clouds, coverOf, parseHourly } = require("../src/main/clouds.js");
const FIX = path.join(__dirname, "fixtures", "clouds");
const fix = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const SPA = [50.44, 5.97], RACE = Date.UTC(2025, 6, 27, 13, 0);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-clouds45-"));
const answer = (j, status = 200) => async () => ({ ok: status === 200, status, json: async () => (typeof j === "function" ? j() : JSON.parse(JSON.stringify(j))) });
// a small hourly answer as Open-Meteo sends it (timezone=GMT: no "Z" on the times)
const hourly = (over = {}, h = {}) => ({ latitude: 50.44, longitude: 6.03, utc_offset_seconds: 0, timezone: "GMT", timezone_abbreviation: "GMT",
  hourly_units: { time: "iso8601" }, hourly: { time: ["2025-07-27T12:00", "2025-07-27T13:00", "2025-07-27T14:00"], cloud_cover_low: [100, 27, 66], cloud_cover_mid: [31, 63, 49], cloud_cover_high: [100, 100, 97], ...h }, ...over });

test("clouds45: an answer without (finite, numeric) coordinates is not for the asked place", () => {
  const j = hourly(); delete j.latitude; delete j.longitude;
  assert.throws(() => parseHourly(j, ...SPA), /coordinates/, "no latitude/longitude");
  assert.throws(() => parseHourly(hourly({ latitude: "50.44" }), ...SPA), /coordinates/, "a string latitude");
  assert.throws(() => parseHourly(hourly({ longitude: null }), ...SPA), /coordinates/, "a null longitude");
  assert.throws(() => parseHourly(hourly({ latitude: NaN }), ...SPA), /coordinates/);
  assert.throws(() => parseHourly(hourly({ latitude: 51.0 }), ...SPA), /another place/, "0.56° away");
  assert.strictEqual(parseHourly(hourly(), ...SPA).length, 3, "the grid point 0.06° away is the place");
});

test("clouds45: a layer out of 0–100 % makes that hour unusable – never clamped into a real cover; the other hours kept", () => {
  assert.strictEqual(coverOf(-999, 0, 0), null); assert.strictEqual(coverOf(0, 120, 0), null); assert.strictEqual(coverOf(0, 0, 100.5), null);
  assert.strictEqual(coverOf("50", 0, 0), null, "a string is not a value"); assert.strictEqual(coverOf(100, 100, 100), 1, "the formula's own top (120 %) still reads 1");
  const h = parseHourly(hourly({}, { cloud_cover_low: [-999, 27, 66], cloud_cover_mid: [31, 120, 49] }), ...SPA);
  assert.deepStrictEqual(h.map(([ms]) => ms), [Date.UTC(2025, 6, 27, 14)], "12:00 (low −999) and 13:00 (mid 120) dropped, 14:00 kept");
});

test("clouds45: time strings – invalid dates and garbage drop that hour; out of order or repeated times reject the answer", () => {
  const bad = parseHourly(hourly({}, { time: ["2025-02-30T12:00", "2025-07-27T13:00", "13:00"] }), ...SPA);
  assert.deepStrictEqual(bad.map(([ms]) => ms), [Date.UTC(2025, 6, 27, 13)], "30 February and a bare clock time aren't hours");
  assert.throws(() => parseHourly(hourly({}, { time: ["2025-07-27T13:00", "2025-07-27T12:00", "2025-07-27T14:00"] }), ...SPA), /order/);
  assert.throws(() => parseHourly(hourly({}, { time: ["2025-07-27T12:00", "2025-07-27T12:00", "2025-07-27T14:00"] }), ...SPA), /order/);
  // an explicit Z is UTC too
  assert.strictEqual(parseHourly(hourly({}, { time: ["2025-07-27T12:00Z", "2025-07-27T13:00Z", "2025-07-27T14:00Z"] }), ...SPA)[1][0], Date.UTC(2025, 6, 27, 13));
});

test("clouds45: UTC – an answer in another time zone (offset, zone name, unix times) is rejected, not read as UTC", () => {
  assert.throws(() => parseHourly(hourly({ utc_offset_seconds: 7200 }), ...SPA), /UTC/);
  assert.throws(() => parseHourly(hourly({ timezone: "Europe/Brussels" }), ...SPA), /UTC/);
  assert.throws(() => parseHourly(hourly({ hourly_units: { time: "unixtime" } }), ...SPA), /UTC|time/);
  assert.strictEqual(parseHourly(hourly({}, { time: ["2025-07-27T12:00+02:00", "2025-07-27T13:00+02:00", "2025-07-27T14:00+02:00"] }), ...SPA).length, 0, "times with an offset are not hours of a GMT answer");
});

test("clouds45: the value arrays must match the times one to one – a missing or short array rejects the answer", () => {
  assert.throws(() => parseHourly(hourly({}, { cloud_cover_mid: [31, 63] }), ...SPA), /length/);
  const j = hourly(); delete j.hourly.cloud_cover_high;
  assert.throws(() => parseHourly(j, ...SPA), /length|layer/);
  assert.throws(() => parseHourly(hourly({}, { time: [] }), ...SPA), /hourly/);
});

test("clouds45: hours outside the asked dates are dropped", () => {
  const h = parseHourly(hourly({}, { time: ["2024-07-27T12:00", "2025-07-27T13:00", "2031-07-27T14:00"] }), ...SPA, [Date.UTC(2025, 6, 26), Date.UTC(2025, 6, 29)]);
  assert.deepStrictEqual(h.map(([ms]) => ms), [Date.UTC(2025, 6, 27, 13)]);
});

test("clouds45: the real Open-Meteo archive answer (Spa, 26–28 Jul 2025) reads in full, in UTC", () => {
  const j = fix("archive_spa_2025-07-27.json");
  const h = parseHourly(j, ...SPA, [Date.UTC(2025, 6, 26), Date.UTC(2025, 6, 29)]);
  assert.strictEqual(h.length, 72);
  const at13 = h.find(([ms]) => ms === Date.UTC(2025, 6, 27, 13));
  assert.ok(at13, "13:00 UTC present"); assert.strictEqual(at13[1], +coverOf(27, 63, 100).toFixed(3));
});

test("clouds45: get() – a real answer is used, written to disk atomically (temp file + rename), and read back without a fetch", async () => {
  const dir = tmp(), asked = [];
  const c = new Clouds(dir, async (u, o) => { asked.push([u, o]); return answer(fix("archive_spa_2025-07-27.json"))(); });
  const writes = [], wf = fs.promises.writeFile;
  fs.promises.writeFile = async (f, ...a) => { writes.push(String(f)); return wf.call(fs.promises, f, ...a); };
  let r; try { r = await c.get(50.437, 5.971, RACE); } finally { fs.promises.writeFile = wf; }
  assert.strictEqual(r.ok, true); assert.strictEqual(r.hours.length, 72);
  assert.deepStrictEqual(Object.keys(asked[0][1].headers), ["User-Agent"], "no headers beyond the UA"); assert.ok(!/@|email|user/i.test(asked[0][0]));
  const files = fs.readdirSync(dir);
  assert.deepStrictEqual(files, ["archive_50.44_5.97_2025-07-26_2025-07-28.json"], `only the final file left: ${files}`);
  assert.ok(writes.length && writes.every((w) => path.basename(w) !== files[0]), `written to a temp file first, not in place: ${writes.map((w) => path.basename(w))}`);
  const again = await new Clouds(dir, async () => { throw new Error("no fetch expected"); }).get(50.437, 5.971, RACE);
  assert.strictEqual(again.ok, true); assert.deepStrictEqual(again.hours, r.hours);
});

test("clouds45: a v0.44 cache file (the app's weather folder, Singapore 2026) still loads without a fetch", async () => {
  const dir = tmp(), name = "archive_1.29_103.86_2026-10-10_2026-10-12.json";
  fs.copyFileSync(path.join(FIX, "cache_legacy_" + name), path.join(dir, name));
  const r = await new Clouds(dir, async () => { throw new Error("no fetch expected"); }).get(1.2914, 103.864, Date.UTC(2026, 9, 11, 12));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.hours.length, 72);
});

test("clouds45: corrupt, half-written or wrongly shaped cache files are ignored (fetched again and replaced), never used", async () => {
  const name = "archive_50.44_5.97_2025-07-26_2025-07-28.json", good = JSON.stringify([[RACE, 0.5]]).slice(0, -3);
  const cases = { half: good, garbage: "\u0000\u0001xyz", object: JSON.stringify({ hours: [[RACE, 0.5]] }), coverOver1: JSON.stringify([[RACE, 7]]),
    stringMs: JSON.stringify([[String(RACE), 0.5]]), unsorted: JSON.stringify([[RACE, 0.5], [RACE - 36e5, 0.4]]), outside: JSON.stringify([[Date.UTC(2031, 0, 1), 0.5], [RACE, 0.5]]), nullCover: JSON.stringify([[RACE, null]]) };
  for (const [k, body] of Object.entries(cases)) {
    const dir = tmp(); fs.writeFileSync(path.join(dir, name), body);
    let n = 0;
    const r = await new Clouds(dir, async (...a) => { n++; return answer(fix("archive_spa_2025-07-27.json"))(...a); }).get(50.437, 5.971, RACE);
    assert.strictEqual(n, 1, `${k}: fetched again`); assert.strictEqual(r.ok, true, k); assert.strictEqual(r.hours.length, 72, k);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")).length, 72, `${k}: replaced`);
  }
  // and with the server unreachable: no cover (the neutral sky), not the broken file's value
  const dir = tmp(); fs.writeFileSync(path.join(dir, name), cases.coverOver1);
  const r = await new Clouds(dir, async () => { throw new TypeError("fetch failed"); }).get(50.437, 5.971, RACE);
  assert.strictEqual(r.ok, false);
});

test("clouds45: an answer with the session's hours still missing (a day being published) is used but not kept on disk", async () => {
  const dir = tmp(), j = fix("archive_spa_2025-07-27.json");
  for (let i = 38; i < 72; i++) { j.hourly.cloud_cover_low[i] = null; j.hourly.cloud_cover_mid[i] = null; j.hourly.cloud_cover_high[i] = null; }   // from 14:00 on 27 Jul
  const r = await new Clouds(dir, answer(j)).get(50.437, 5.971, RACE);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.hours.length, 38);
  assert.deepStrictEqual(fs.readdirSync(dir), [], "kept once complete only – a later run asks again and gets the rest");
});

test("clouds45: current() – the real forecast answer reads; no coordinates, out-of-range layers, another zone or a stale time are refused", async () => {
  const j = fix("current_monaco.json"), now = Date.parse(j.current.time + "Z") + 10 * 60e3, M = [43.73, 7.42];
  const run = (body) => new Clouds(tmp(), answer(body), { now: () => now }).get(...M, now, true);
  const ok = await run(j);
  assert.strictEqual(ok.ok, true); assert.deepStrictEqual(ok.hours, [[now - 10 * 60e3, +coverOf(93, 35, 99).toFixed(3)]]);
  const noXY = { ...j }; delete noXY.latitude; delete noXY.longitude;
  assert.strictEqual((await run(noXY)).ok, false, "no coordinates");
  assert.strictEqual((await run({ ...j, latitude: "43.73" })).ok, false, "string coordinates");
  assert.strictEqual((await run({ ...j, current: { ...j.current, cloud_cover_low: -999 } })).ok, false, "low −999");
  assert.strictEqual((await run({ ...j, current: { ...j.current, cloud_cover_mid: 120 } })).ok, false, "mid 120");
  assert.strictEqual((await run({ ...j, current: { ...j.current, cloud_cover_high: null } })).ok, false, "a missing layer");
  assert.strictEqual((await run({ ...j, utc_offset_seconds: 3600 })).ok, false, "not UTC");
  assert.strictEqual((await run({ ...j, current: { ...j.current, time: "2026-02-30T04:45" } })).ok, false, "invalid date");
  assert.strictEqual((await new Clouds(tmp(), answer(j), { now: () => now + 3 * 3600e3 }).get(...M, now, true)).ok, false, "3 h old");
});
