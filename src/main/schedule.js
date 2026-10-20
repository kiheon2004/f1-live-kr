// Season calendar with session start times (UTC), from the public Jolpica F1 API (Ergast-compatible).
// https://api.jolpi.ca/ergast/f1/{year}/races.json – anonymous, no key; what it gives per race (checked 2026-10-20 on the
// 2018–2026 seasons): season, round, url, raceName, Circuit { circuitId, url, circuitName, Location { lat, long,
// locality, country } }, date, time, and per weekend session (FirstPractice … SprintShootout) a date and – from 2022
// on – a time. 2018–2021 give practice and qualifying as a date only: such a session's start is "날짜만" (precision
// "date"), never midnight UTC (that read as 09:00 KST and started countdowns from a time nobody published).
const fs = require("node:fs");
const path = require("node:path");

const PROVIDER = "jolpica";
const URL_FOR = (year) => `https://api.jolpi.ca/ergast/f1/${year}/races.json?limit=100`;

const SESSION_KEYS = [
  ["FirstPractice", "Practice 1"], ["SecondPractice", "Practice 2"], ["ThirdPractice", "Practice 3"],
  // (2023's sprint qualifying was called the "Sprint Shootout" – Jolpica's key for that season)
  ["SprintQualifying", "Sprint Qualifying"], ["SprintShootout", "Sprint Shootout"], ["Sprint", "Sprint"], ["Qualifying", "Qualifying"],
];

const DATE_RE = /^\d{4}-\d\d-\d\d$/, TIME_RE = /^(\d\d):(\d\d)(?::(\d\d)(?:\.\d+)?)?(Z|[+-]\d\d:?\d\d)?$/;
// A start as the provider gave it: { utc, date, time, precision }. utc is an ISO time only when a time of day was given
// ("time"); a date alone keeps utc null (precision "date"); nothing usable: precision null.
function when(date, time) {
  if (typeof date !== "string" || !DATE_RE.test(date) || !Number.isFinite(Date.parse(date))) return { utc: null, date: null, time: null, precision: null };
  const m = typeof time === "string" ? TIME_RE.exec(time) : null;
  if (!m) return { utc: null, date, time: null, precision: "date" };
  const zone = !m[4] || m[4] === "Z" ? "Z" : m[4];
  const utc = new Date(`${date}T${m[1]}:${m[2]}:${m[3] || "00"}${zone}`);
  if (!Number.isFinite(utc.getTime())) return { utc: null, date, time: null, precision: "date" };
  return { utc: utc.toISOString().replace(".000Z", "Z"), date, time: `${m[1]}:${m[2]}:${m[3] || "00"}${zone}`, precision: "time" };
}
// (kept for callers of the old helper: an ISO start only when there is a time of day)
const toIso = (date, time) => when(date, time).utc;

// latitude / longitude as numbers within range, else null – never 0 or a country's centre in place of a missing one
function coord(v, lim) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? +v : NaN;
  return Number.isFinite(n) && Math.abs(n) <= lim ? n : null;
}
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

// The provider's answer → races. Every field the app had before stays (round, name, circuit, locality, country,
// sessions[{ name, utc }]); added: season, provider and its own ids, the circuit's id and coordinates, the start's date,
// time and precision, when it was fetched. A race without a usable round or name is left out (nothing to show).
function parseRaces(json, { season = null, fetchedAt = null } = {}) {
  const list = json?.MRData?.RaceTable?.Races;
  if (!Array.isArray(list)) throw new Error("일정 응답 형식이 달라요");
  const out = [];
  for (const r of list) {
    const round = Number.isInteger(+r?.round) && +r.round > 0 ? +r.round : null, name = str(r?.raceName);
    if (round == null || !name) continue;
    const C = r.Circuit || {}, L = C.Location || {};
    const lat = coord(L.lat, 90), lon = coord(L.long ?? L.lng ?? L.lon, 180);
    // (one of the pair alone places nothing)
    const both = lat != null && lon != null;
    const sessions = [];
    for (const [key, sname] of SESSION_KEYS) if (r[key]) { const w = when(r[key].date, r[key].time); if (w.precision) sessions.push({ name: sname, ...w }); }
    const race = when(r.date, r.time);
    if (race.precision) sessions.push({ name: "Race", ...race });
    // by day first (a date-only session has no time to compare), then by time where both have one; ties keep the order
    sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.utc && b.utc ? Date.parse(a.utc) - Date.parse(b.utc) : 0));
    out.push({
      round, name, circuit: str(C.circuitName), locality: str(L.locality), country: str(L.country), sessions,
      season: +r.season || season, provider: PROVIDER,
      source: { provider: PROVIDER, season: str(r.season), round: str(String(r.round ?? "")), url: str(r.url), circuitId: str(C.circuitId), circuitUrl: str(C.url) },
      circuitId: str(C.circuitId), circuitName: str(C.circuitName),
      lat: both ? lat : null, lon: both ? lon : null, coordSource: both ? PROVIDER : null,
      date: race.date, time: race.time, utc: race.utc, precision: race.precision, fetchedAt,
    });
  }
  return out.sort((a, b) => a.round - b.round);
}

async function fetchRaces(year, fetchImpl = fetch) {
  const res = await fetchImpl(URL_FOR(year), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

async function getSchedule(year) {
  return parseRaces(await fetchRaces(year), { season: year, fetchedAt: new Date().toISOString() });
}

// Season calendars kept on disk (the app's own data folder – never the session cache) and in memory, so the home
// screen and the KST schedule ask Jolpica once per season and per freshness window, and work offline from what was
// fetched before. Two asks for the same season while one is under way share that one request.
//   fresh for 6 hours for this season and later ones (times move), 7 days for past seasons (they don't, but a
//   correction can still come); past that it's fetched again, and if that fails the old copy is used, marked stale
class ScheduleStore {
  constructor(dir, { fetchImpl = (...a) => fetch(...a), now = () => Date.now() } = {}) {
    this.dir = dir; this.fetch = fetchImpl; this.now = now;
    this.mem = new Map(); this.inflight = new Map();
    this.stats = { network: 0, networkFailed: 0, memory: 0, disk: 0, shared: 0 };
  }
  file(year) { return path.join(this.dir, `jolpica_races_${year}.json`); }
  maxAge(year) { return year < new Date(this.now()).getUTCFullYear() ? 7 * 864e5 : 6 * 3600e3; }
  readDisk(year) {
    try { const d = JSON.parse(fs.readFileSync(this.file(year), "utf8")); if (d && Array.isArray(d.races) && d.season === year) return d; } catch {}
    return null;
  }
  // → { season, races, fetchedAt, source: "network" | "cache", stale (a cached copy past its freshness: the fetch failed),
  //   offline (that failure was no answer at all, not an HTTP error), error }
  async get(year, { force = false } = {}) {
    const age = (d) => this.now() - Date.parse(d.fetchedAt);
    let have = this.mem.get(year) || null;
    if (have && !force && age(have) < this.maxAge(year)) { this.stats.memory++; return { ...have, source: "cache", stale: false, offline: false, error: null }; }
    if (!have) { have = this.readDisk(year); if (have) this.mem.set(year, have); }
    if (have && !force && age(have) < this.maxAge(year)) { this.stats.disk++; return { ...have, source: "cache", stale: false, offline: false, error: null }; }
    if (this.inflight.has(year)) { this.stats.shared++; return this.inflight.get(year); }
    const p = (async () => {
      try {
        this.stats.network++;
        const fetchedAt = new Date(this.now()).toISOString();
        const races = parseRaces(await fetchRaces(year, this.fetch), { season: year, fetchedAt });
        const d = { season: year, provider: PROVIDER, fetchedAt, races };
        this.mem.set(year, d);
        try { fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(this.file(year), JSON.stringify(d)); } catch {}
        return { ...d, source: "network", stale: false, offline: false, error: null };
      } catch (e) {
        this.stats.networkFailed++;
        const offline = !e.status;
        if (have) return { ...have, source: "cache", stale: true, offline, error: e.status ? `HTTP ${e.status}` : "offline" };
        const err = new Error(offline ? `일정 서버에 연결하지 못했어요 (${e.cause?.code || e.name})` : `일정을 받지 못했어요 (HTTP ${e.status})`);
        err.offline = offline; err.status = e.status; throw err;
      } finally { this.inflight.delete(year); }
    })();
    this.inflight.set(year, p);
    return p;
  }
  // the seasons already on disk or in memory, with nothing fetched: what the "all venues" view may show
  checked() {
    const years = new Set(this.mem.keys());
    try { for (const f of fs.readdirSync(this.dir)) { const m = /^jolpica_races_(\d{4})\.json$/.exec(f); if (m) years.add(+m[1]); } } catch {}
    const out = [];
    for (const y of [...years].sort()) { const d = this.mem.get(y) || this.readDisk(y); if (d) out.push({ season: y, fetchedAt: d.fetchedAt, races: d.races }); }
    return out;
  }
}

module.exports = { getSchedule, parseRaces, when, toIso, coord, ScheduleStore, fetchRaces, PROVIDER, SESSION_KEYS };
