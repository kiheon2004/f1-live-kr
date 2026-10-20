// v0.43 home screen: calendar parsing, the metadata cache, archive metadata, matching races to archive meetings, the
// schedule and data states, late-answer guards and the globe's latitude/longitude convention.
// Fixtures: test/fixtures/home/jolpica_races_<year>.json are REAL Jolpica answers (api.jolpi.ca/ergast/f1/<year>/
// races.json?limit=100, fetched 2026-10-20); f1_index_<year>.json are REAL F1 archive season indexes (copies of the app's
// cached livetiming.formula1.com/static/<year>/Index.json, 2025 from 2026-10-15, 2026 from 2026-10-20). Everything built
// inline below is SYNTHETIC and says so.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const S = require("../src/main/schedule.js");
const H = require("../src/shared/homedata.js");
const { Archive, parseIndex } = require("../src/main/archive.js");

const FIX = path.join(__dirname, "fixtures", "home");
const jolpica = (y) => JSON.parse(fs.readFileSync(path.join(FIX, `jolpica_races_${y}.json`), "utf8"));
const index = (y) => parseIndex(fs.readFileSync(path.join(FIX, `f1_index_${y}.json`), "utf8").replace(/^﻿/, ""));

// ---------- calendar parsing ----------
test("schedule (real 2021): practice and qualifying given as a date only stay date-only – never midnight UTC", () => {
  const races = S.parseRaces(jolpica(2021), { season: 2021, fetchedAt: "2026-10-20T00:00:00Z" });
  assert.strictEqual(races.length, 22);
  const bah = races[0];
  assert.strictEqual(bah.name, "Bahrain Grand Prix");
  const fp1 = bah.sessions.find((s) => s.name === "Practice 1");
  assert.deepStrictEqual([fp1.utc, fp1.date, fp1.precision], [null, "2021-03-26", "date"]);
  const race = bah.sessions.find((s) => s.name === "Race");
  assert.strictEqual(race.precision, "time"); assert.strictEqual(race.utc, "2021-03-28T15:00:00Z");
  // no session anywhere has a made-up 00:00:00Z
  for (const r of races) for (const s of r.sessions) if (s.precision === "date") assert.strictEqual(s.utc, null);
  // sessions in day order, the race last
  for (const r of races) assert.strictEqual(r.sessions[r.sessions.length - 1].name, "Race");
});

test("schedule (real 2026): the old fields stay, the new ones are filled from the provider (ids, coordinates, precision)", () => {
  const races = S.parseRaces(jolpica(2026), { season: 2026, fetchedAt: "2026-10-20T01:02:03Z" });
  const r = races.find((x) => x.circuitId === "sepang");
  // the old shape
  assert.deepStrictEqual({ round: r.round, name: r.name, circuit: r.circuit, locality: r.locality, country: r.country }, { round: 16, name: "Bahrain Grand Prix in Malaysia", circuit: "Sepang International Circuit", locality: "Kuala Lumpur", country: "Malaysia" });
  assert.ok(r.sessions.every((s) => typeof s.name === "string" && "utc" in s));
  // the new fields
  assert.strictEqual(r.season, 2026); assert.strictEqual(r.provider, "jolpica"); assert.strictEqual(r.fetchedAt, "2026-10-20T01:02:03Z");
  assert.deepStrictEqual([r.lat, r.lon, r.coordSource], [2.76083, 101.738, "jolpica"]);
  assert.strictEqual(r.source.round, "16"); assert.match(r.source.url, /wikipedia/);
  assert.deepStrictEqual([r.date, r.time, r.precision, r.utc], ["2026-10-04", "07:00:00Z", "time", "2026-10-04T07:00:00Z"]);
  assert.strictEqual(races.length, 23);
  // every 2026 session has a time
  assert.ok(races.every((x) => x.sessions.every((s) => s.precision === "time")));
});

test("schedule (synthetic): missing or out-of-range coordinates are null – never 0,0; extra provider fields don't break parsing", () => {
  const json = { MRData: { RaceTable: { Races: [
    { season: "2030", round: "1", raceName: "A GP", url: "u", date: "2030-03-01", time: "05:00:00Z", Circuit: { circuitId: "a", circuitName: "A", Location: { locality: "X", country: "Y" } }, NewField: { anything: 1 } },
    { season: "2030", round: "2", raceName: "B GP", date: "2030-03-08", Circuit: { circuitId: "b", Location: { lat: "95", long: "10" } } },
    { season: "2030", round: "3", raceName: "C GP", date: "2030-03-15", Circuit: { circuitId: "c", Location: { lat: "10", long: "" } } },
    { season: "2030", round: "4", raceName: "D GP", date: "2030-03-22", time: "25:99", Circuit: { circuitId: "d", Location: { lat: "-33.5", long: "-70.25" } } },
    { season: "2030", round: "x", raceName: "no round" },
  ] } } };
  const races = S.parseRaces(json, { season: 2030 });
  assert.strictEqual(races.length, 4);
  assert.deepStrictEqual(races.map((r) => [r.lat, r.lon]), [[null, null], [null, null], [null, null], [-33.5, -70.25]]);
  assert.strictEqual(races[1].precision, "date"); assert.strictEqual(races[1].utc, null);
  assert.strictEqual(races[3].precision, "date", "an unreadable time is no time");
  assert.throws(() => S.parseRaces({}), /형식/);
  assert.strictEqual(S.toIso("2030-01-01"), null);
  assert.strictEqual(S.toIso("2030-01-01", "12:00:00Z"), "2030-01-01T12:00:00Z");
});

test("schedule (real 2020): two races at one circuit (Red Bull Ring, Silverstone, Sakhir) stay separate events", () => {
  const races = S.parseRaces(jolpica(2020), { season: 2020 });
  const byCircuit = {};
  for (const r of races) (byCircuit[r.circuitId] ||= []).push(r.round);
  assert.deepStrictEqual(byCircuit.red_bull_ring, [1, 2]); assert.deepStrictEqual(byCircuit.silverstone, [4, 5]); assert.deepStrictEqual(byCircuit.bahrain, [15, 16]);
  // one marker spot, two events offered
  const g = H.placeGroups(races).find((p) => p.races.some((r) => r.circuitId === "red_bull_ring"));
  assert.deepStrictEqual(g.races.map((r) => r.name), ["Austrian Grand Prix", "Styrian Grand Prix"]);
});

// ---------- metadata cache ----------
test("schedule store (synthetic answers): one request per season while fresh, shared while under way, offline → the old copy marked stale", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-sched-"));
  let calls = 0, fail = false, now = Date.parse("2026-10-20T00:00:00Z");
  const body = jolpica(2026);
  const fetchImpl = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); if (fail) throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }); return { ok: true, status: 200, json: async () => body }; };
  try {
    const st = new S.ScheduleStore(dir, { fetchImpl, now: () => now });
    const [a, b] = await Promise.all([st.get(2026), st.get(2026)]);
    assert.strictEqual(calls, 1, "two asks at once share one request");
    assert.strictEqual(a.source, "network"); assert.strictEqual(b.races.length, 23);
    assert.strictEqual((await st.get(2026)).source, "cache"); assert.strictEqual(calls, 1);
    // a new store (next launch) reads the disk copy
    const st2 = new S.ScheduleStore(dir, { fetchImpl, now: () => now });
    assert.strictEqual((await st2.get(2026)).source, "cache"); assert.strictEqual(calls, 1);
    // 7 hours later this season is stale; offline: the old copy, said so
    now += 7 * 3600e3; fail = true;
    const c = await st2.get(2026);
    assert.strictEqual(calls, 2); assert.strictEqual(c.stale, true); assert.strictEqual(c.offline, true); assert.strictEqual(c.races.length, 23);
    // a season never fetched, offline: an error that says offline (not "no races")
    await assert.rejects(st2.get(2025), (e) => e.offline === true);
    assert.deepStrictEqual(st2.checked().map((x) => x.season), [2026]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- archive metadata ----------
test("archive meta (synthetic files): the text contract stays; fresh/cache/stale-cache/offline/refused are told apart; cacheOnly fetches nothing", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-meta-"));
  const realFetch = global.fetch;
  let calls = 0;
  try {
    const a = new Archive(dir);
    global.fetch = async () => { calls++; return { ok: true, status: 200, headers: new Map(), text: async () => '{"Meetings":[]}' }; };
    const m1 = await a.getTextMeta("2026/Index.json", { maxAgeMs: 3600e3 });
    assert.strictEqual(m1.source, "network");
    assert.strictEqual(typeof (await a.getText("2026/Index.json", { maxAgeMs: 3600e3 })), "string", "getText still returns the text");
    assert.strictEqual((await a.getTextMeta("2026/Index.json", { maxAgeMs: 3600e3 })).source, "cache");
    const old = new Date(Date.now() - 3 * 3600e3); fs.utimesSync(a.cachePath("2026/Index.json"), old, old);
    global.fetch = async () => { calls++; throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }); };
    const off = await a.listSessionsMeta(2026);
    assert.deepStrictEqual([off.source, off.offline, off.sessions.length], ["stale-cache", true, 0]);
    // asked again within two minutes: the same answer, no new request
    const n0 = calls; assert.strictEqual((await a.listSessionsMeta(2026)).source, "stale-cache"); assert.strictEqual(calls, n0);
    global.fetch = async () => { calls++; return { ok: false, status: 401, headers: new Map() }; };
    const ref = await new Archive(dir).listSessionsMeta(2026);
    assert.deepStrictEqual([ref.source, ref.offline, ref.status], ["stale-cache", false, 401]);
    // nothing cached, offline: an error marked offline
    global.fetch = async () => { throw new TypeError("fetch failed"); };
    await assert.rejects(a.listSessionsMeta(2025), (e) => e.offline === true);
    const before = calls;
    await assert.rejects(a.listSessionsMeta(2024, { cacheOnly: true }), (e) => e.notCached === true);
    assert.strictEqual((await a.listSessionsMeta(2026, { cacheOnly: true })).source, "stale-cache");
    assert.strictEqual(calls, before, "cacheOnly never asks the network");
    // which sessions are on this computer (file names only)
    for (const t of ["TimingData", "DriverList", "SessionInfo"]) fs.writeFileSync(a.cachePath(`2026/M/R/${t}.jsonStream`), "x");
    fs.writeFileSync(a.cachePath("2026/M/Q/TimingData.jsonStream"), "x");
    assert.deepStrictEqual(a.cachedSessions(["2026/M/R/", "2026/M/Q/", "2026/M/P/"]), { "2026/M/R/": { core: true, topics: 3 }, "2026/M/Q/": { core: false, topics: 1 }, "2026/M/P/": { core: false, topics: 0 } });
    // the probe reads no body and keeps nothing
    for (const [status, state] of [[200, "remote"], [401, "auth"], [404, "none"], [503, "failed"]]) {
      global.fetch = async () => ({ ok: status === 200, status, headers: new Map(), body: { cancel: async () => {} } });
      assert.strictEqual((await a.probeSession("2026/M/X/")).state, state);
    }
    assert.ok(!fs.existsSync(a.cachePath("2026/M/X/SessionInfo.jsonStream")));
    global.fetch = async () => { throw new TypeError("fetch failed"); };
    assert.strictEqual((await a.probeSession("2026/M/X/")).state, "failed");
  } finally { global.fetch = realFetch; fs.rmSync(dir, { recursive: true, force: true }); }
});

test("archive index (real 2026): meeting key, code and session key are kept beside the names", () => {
  const s = index(2026);
  const r = s.find((x) => x.path === "2026/2026-10-04_Bahrain_Grand_Prix/2026-10-04_Race/");
  assert.ok(r, "the 2026 Bahrain GP race is in the real index");
  assert.deepStrictEqual([r.meeting, r.location, r.circuitKey, r.meetingKey], ["Bahrain Grand Prix", "Kuala Lumpur", 12, 1308]);
  assert.ok(r.meetingCode && r.sessionKey);
});

// ---------- matching ----------
test("matching (real 2026 calendar + real 2026 index): by days, not names – Bahrain GP in Malaysia, two venues in Spain, testing left over, later rounds not recorded yet", () => {
  const races = S.parseRaces(jolpica(2026), { season: 2026 });
  const m = H.matchRaces(races, index(2026));
  const at = (round) => m.races.get(round);
  // 2026 round 16 is called "Bahrain Grand Prix in Malaysia" by Jolpica and "Bahrain Grand Prix" at Kuala Lumpur by F1
  assert.strictEqual(at(16).state, "matched"); assert.strictEqual(at(16).meeting.circuitKey, 12);
  // Spain: Barcelona (round 7) and Madrid (round 14) – two meetings, each its own
  assert.strictEqual(at(7).meeting.circuitKey, 15); assert.strictEqual(at(14).meeting.circuitKey, 153);
  // Miami and Monaco both carry F1 meeting Number 6 in this index – matched to their own meetings anyway
  assert.strictEqual(at(4).meeting.location, "Miami Gardens"); assert.strictEqual(at(6).meeting.location, "Monte Carlo");
  // rounds after Singapore (17) aren't in the index yet: no record – not cancelled
  for (const r of [18, 19, 20, 21, 22, 23]) assert.strictEqual(at(r).state, "none");
  for (let r = 1; r <= 17; r++) assert.strictEqual(at(r).state, "matched", `round ${r}`);
  // the two pre-season tests match no race
  assert.deepStrictEqual(m.extra.map((g) => g.name), ["Pre-Season Testing", "Pre-Season Testing"]);
});

test("matching (real 2025): every round that ran is matched to exactly one meeting", () => {
  const races = S.parseRaces(jolpica(2025), { season: 2025 });
  const m = H.matchRaces(races, index(2025));
  const keys = new Set();
  for (const r of races) { const e = m.races.get(r.round); if (e.state === "matched") { assert.ok(!keys.has(e.meeting.key)); keys.add(e.meeting.key); } }
  assert.ok(keys.size >= 20, `${keys.size} matched`);
  assert.strictEqual(m.races.get(8).meeting.circuitKey, 22, "Monaco (F1 calls the 2025 location \"Monaco\", 2026 \"Monte Carlo\")");
});

test("matching (synthetic): same circuit a week apart stays two events; a meeting overlapping two races is left unresolved; same name elsewhere doesn't match", () => {
  const race = (round, date, first) => ({ round, name: "X", date, sessions: [{ name: "Practice 1", date: first, precision: "date" }, { name: "Race", date, precision: "date" }] });
  const sess = (key, start, name = "Austrian Grand Prix") => ({ path: `2020/${key}/${start}/`, meetingKey: key, meeting: name, start: start + "T15:00:00", circuitKey: 19 });
  const races = [race(1, "2020-07-05", "2020-07-03"), race(2, "2020-07-12", "2020-07-10")];
  const m = H.matchRaces(races, [sess(1, "2020-07-03"), sess(1, "2020-07-05"), sess(2, "2020-07-10", "Styrian Grand Prix"), sess(2, "2020-07-12", "Styrian Grand Prix")]);
  assert.strictEqual(m.races.get(1).meeting.meetingKey, 1); assert.strictEqual(m.races.get(2).meeting.meetingKey, 2);
  // one meeting spanning both weekends (a data error): neither is forced onto it
  const m2 = H.matchRaces(races, [sess(9, "2020-07-04"), sess(9, "2020-07-11")]);
  assert.strictEqual(m2.races.get(1).state, "ambiguous"); assert.strictEqual(m2.races.get(2).state, "ambiguous");
  // two meetings in one weekend: unresolved too
  const m3 = H.matchRaces([races[0]], [sess(3, "2020-07-04"), sess(4, "2020-07-05")]);
  assert.strictEqual(m3.races.get(1).state, "ambiguous"); assert.strictEqual(m3.races.get(1).candidates.length, 2);
  // the same name in another week is no match (names are never used)
  const m4 = H.matchRaces([races[0]], [sess(5, "2020-08-01")]);
  assert.strictEqual(m4.races.get(1).state, "none");
  // a season whose archive list is missing (a year in between with nothing): every race "none", nothing invented
  const m5 = H.matchRaces(races, []);
  assert.deepStrictEqual([...m5.races.values()].map((e) => e.state), ["none", "none"]);
});

// ---------- states ----------
test("schedule state (synthetic times): upcoming, weekend window, finished only with the record, date gone by unconfirmed, cancelled only with evidence", () => {
  const r = { sessions: [{ name: "Practice 1", utc: "2030-05-01T10:00:00Z", date: "2030-05-01", precision: "time" }, { name: "Race", utc: "2030-05-03T13:00:00Z", date: "2030-05-03", precision: "time" }] };
  const T = (s) => Date.parse(s);
  assert.strictEqual(H.scheduleStatus(r, { now: T("2030-04-30T00:00:00Z") }).key, "scheduled");
  assert.strictEqual(H.scheduleStatus(r, { now: T("2030-05-02T00:00:00Z") }).key, "ongoing");
  assert.strictEqual(H.scheduleStatus(r, { now: T("2030-05-10T00:00:00Z") }).key, "unknown", "date passed ≠ finished");
  assert.strictEqual(H.scheduleStatus(r, { now: T("2030-05-10T00:00:00Z"), raceListed: true, raceStart: T("2030-05-03T13:00:00Z") }).key, "finished");
  assert.strictEqual(H.scheduleStatus(r, { now: T("2030-05-10T00:00:00Z"), evidence: { cancelled: true, source: "x" } }).key, "cancelled");
  assert.strictEqual(H.scheduleStatus({ sessions: [] }).key, "unknown");
  // a date-only weekend: the whole day counts, wherever it is
  const d = { sessions: [{ name: "Practice 1", date: "2030-05-01", utc: null, precision: "date" }, { name: "Race", date: "2030-05-03", utc: null, precision: "date" }] };
  assert.strictEqual(H.scheduleStatus(d, { now: T("2030-04-30T12:00:00Z") }).key, "ongoing", "UTC+14's 1 May starts at 10:00 UTC on 30 April");
  assert.strictEqual(H.scheduleStatus(d, { now: T("2030-04-30T09:00:00Z") }).key, "scheduled");
});

test("next session to count down to (synthetic): date-only sessions are never counted to", () => {
  const races = [{ name: "A", sessions: [{ name: "Practice 1", date: "2030-05-01", utc: null, precision: "date" }, { name: "Race", utc: "2030-05-03T13:00:00Z", date: "2030-05-03", precision: "time" }] }];
  const n = H.nextTimedSession(races, Date.parse("2030-04-01T00:00:00Z"));
  assert.strictEqual(n.s.name, "Race");
  assert.strictEqual(H.nextTimedSession(races, Date.parse("2030-06-01T00:00:00Z")), null);
  // old-shaped entries (utc only) still count
  assert.strictEqual(H.nextTimedSession([{ sessions: [{ name: "Race", utc: "2030-05-03T13:00:00Z" }] }], 0).s.name, "Race");
});

test("data state (synthetic inputs): a failed request isn't 'no data', no record isn't 'cancelled', a list entry isn't downloadable, cache vs remote vs sign-in", () => {
  const meeting = { sessions: [{ path: "2026/M/R/" }, { path: "2026/M/Q/" }] };
  const ok = { state: "ok" };
  assert.strictEqual(H.dataStatus({ year: 2017, listing: ok }).key, "unsupported");
  assert.strictEqual(H.dataStatus({ year: 2026, listing: { state: "loading" } }).key, "checking");
  assert.strictEqual(H.dataStatus({ year: 2026, listing: { state: "error", offline: true } }).key, "failed");
  assert.strictEqual(H.dataStatus({ year: 2019, listing: { state: "error", status: 401 } }).key, "auth");
  assert.strictEqual(H.dataStatus({ year: 2026, listing: ok, match: { state: "none" } }).key, "none");
  assert.doesNotMatch(H.dataStatus({ year: 2026, listing: ok, match: { state: "none" } }).ko, /취소/);
  assert.strictEqual(H.dataStatus({ year: 2026, listing: ok, match: { state: "ambiguous", candidates: [1, 2] } }).key, "unknown");
  assert.strictEqual(H.dataStatus({ year: 2026, listing: ok, match: { state: "matched", meeting } }).key, "listed");
  assert.strictEqual(H.dataStatus({ year: 2026, listing: ok, match: { state: "matched", meeting }, probes: { "2026/M/R/": { state: "auth" } } }).key, "auth");
  assert.strictEqual(H.dataStatus({ year: 2026, listing: ok, match: { state: "matched", meeting }, probes: { "2026/M/R/": { state: "remote" } } }).key, "remote");
  assert.strictEqual(H.dataStatus({ year: 2026, listing: { state: "ok", stale: true, offline: true }, match: { state: "matched", meeting }, cached: { "2026/M/R/": { core: true } } }).key, "cached");
  assert.match(H.dataStatus({ year: 2026, listing: { state: "ok", stale: true, offline: true }, match: { state: "matched", meeting }, cached: { "2026/M/R/": { core: true } } }).why, /오프라인/);
  assert.strictEqual(H.sessionStatus({ cached: { core: true }, probe: { state: "auth" } }).key, "cached", "a cached copy plays whatever the server says");
  assert.strictEqual(H.sessionStatus({ probe: { state: "none", status: 404 } }).key, "none");
  assert.strictEqual(H.sessionStatus({ probe: { state: "failed", offline: true } }).key, "failed");
  assert.strictEqual(H.sessionStatus({}).key, "listed");
});

// ---------- list ----------
test("search (real 2026 calendar): race, circuit, place, country, accents ignored; nothing found → empty", () => {
  const races = S.parseRaces(jolpica(2026), { season: 2026 });
  assert.deepStrictEqual(H.filterRaces(races, "spain").map((r) => r.round), [7, 14]);
  assert.deepStrictEqual(H.filterRaces(races, "sao paulo").map((r) => r.round), [20]);
  assert.deepStrictEqual(H.filterRaces(races, "MONZA").map((r) => r.round), [13]);
  assert.deepStrictEqual(H.filterRaces(races, "malaysia").map((r) => r.round), [16]);
  assert.deepStrictEqual(H.filterRaces(races, "모나코", (n) => (n === "Monaco Grand Prix" ? "모나코 그랑프리" : n)).map((r) => r.round), [6]);
  assert.deepStrictEqual(H.filterRaces(races, "zzz"), []);
  assert.strictEqual(H.filterRaces(races, "  ").length, 23);
});

// ---------- late answers and progress ----------
test("late answers (synthetic): an answer for an earlier season/event is ignored; progress of an earlier load never moves the newer bar", async () => {
  const g = H.guard(), shown = [];
  const ask = async (year, ms) => { const t = g.next(); await new Promise((r) => setTimeout(r, ms)); if (g.current(t)) shown.push(year); };
  await Promise.all([ask(2026, 40), ask(2024, 10), ask(2025, 25)]);
  assert.deepStrictEqual(shown, [2025], "only the last asked is shown, though 2024 answered first and 2026 last");
  assert.ok(H.progressMatches(3, { job: 3 })); assert.ok(!H.progressMatches(3, { job: 2 })); assert.ok(H.progressMatches(3, { phase: "download" }));
});

test("progress binding (synthetic): the main process tags each progress message with the load's number", async () => {
  const V = require("../src/main/validate.js");
  assert.strictEqual(V.jobId(5), 5); assert.strictEqual(V.jobId(undefined), null);
  assert.throws(() => V.jobId(-1)); assert.throws(() => V.jobId("5")); assert.throws(() => V.jobId(1.5));
  assert.deepStrictEqual(V.sessionPaths(["2026/a/b/"]), ["2026/a/b/"]); assert.throws(() => V.sessionPaths(["../x"])); assert.throws(() => V.sessionPaths("2026/a/b/"));
});

// ---------- globe ----------
test("globe: latitude/longitude land where three.js SphereGeometry puts that spot of an equirectangular texture", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const g = new THREE.SphereGeometry(1, 72, 36), pos = g.attributes.position, uv = g.attributes.uv;
  // a vertex away from the poles and the seam: its (u, v) is a texture longitude/latitude; our function must give that vertex
  let worst = 0;
  for (let i = 0; i < pos.count; i += 7) {
    const u = uv.getX(i), v = uv.getY(i);
    if (v < 0.05 || v > 0.95 || u < 0.01 || u > 0.99) continue;
    const lon = u * 360 - 180, lat = v * 180 - 90;
    const p = H.latLonToVec3(lat, lon);
    worst = Math.max(worst, Math.hypot(p.x - pos.getX(i), p.y - pos.getY(i), p.z - pos.getZ(i)));
  }
  assert.ok(worst < 1e-6, `worst ${worst}`);
  // known spots: Greenwich-equator +x, the north pole +y, 90°E −z; Monaco and Melbourne in the right hemispheres
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const p0 = H.latLonToVec3(0, 0); assert.ok(near(p0.x, 1) && near(p0.y, 0) && near(p0.z, 0));
  assert.ok(near(H.latLonToVec3(90, 0).y, 1)); assert.ok(near(H.latLonToVec3(0, 90).z, -1));
  const mel = H.latLonToVec3(-37.85, 144.97); assert.ok(mel.y < 0 && mel.x < 0 && mel.z < 0);
  assert.strictEqual(H.latLonToVec3(null, 3), null);
});

test("markers (synthetic): close ones cluster, the selected one keeps its own place", () => {
  const pts = [{ id: "a", x: 100, y: 100 }, { id: "b", x: 110, y: 104 }, { id: "c", x: 300, y: 100 }];
  assert.deepStrictEqual(H.clusterPoints(pts, 24).map((c) => c.ids), [["a", "b"], ["c"]]);
  const sel = H.clusterPoints(pts, 24, "b");
  assert.deepStrictEqual(sel[0], { ids: ["b", "a"], x: 110, y: 104 });
});
