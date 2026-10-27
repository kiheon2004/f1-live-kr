// Cloud cover at a circuit for a session's hours – the one thing the 3D view's sky can't get from F1's feed (WeatherData
// has no clouds: renderer/weather.js). Open-Meteo (https://open-meteo.com, free for non-commercial use, no key, data
// CC BY 4.0): its historical archive (ERA5 / ECMWF IFS reanalysis, hourly, a 9–25 km grid – model data, not an
// observation of that stand's sky: M for the overall cover, L for a passing shower's timing) for a past session; its
// forecast model's current value for a live one. Anonymous GETs: nothing about the user is sent (only the circuit's
// coordinates and the date). Answers are kept in the app's own data folder (not the F1 session cache).
//
// Checked before use (v0.45): the answer's coordinates finite numbers and its grid point within 0.5° of the circuit (the
// archive answers from its nearest cell: ERA5 0.25° ≈ 25 km, Spa's 6.03° for 5.97° asked – 0.5° keeps that margin and
// still refuses a neighbouring region); in UTC (asked with timezone=GMT: utc_offset_seconds 0, ISO times without a
// zone); times valid calendar hours, in order and not repeated; each layer's array as long as the times; and an hour
// within 90 min of the asked moment (an archive day not yet published comes back as nulls – then there is no cover: the
// sky stays neutral; a past session is never given today's weather).
// Policy: an answer that is structurally wrong (no coordinates, another place, another zone, arrays not matching the
// times, times out of order) is refused whole – its values can't be tied to hours. One bad value (null, out of 0–100 %,
// not a number) or one bad time string only makes that hour unusable: the other hours are kept, never clamped into a
// "real" cover. Hours outside the asked dates are dropped.
const fs = require("node:fs");
const path = require("node:path");

const UA = { "User-Agent": "f1-live-kr (personal, non-commercial desktop app)" };
const HOURLY = "cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high";

// Checked arguments: lat, lon in range; a moment between 2018 and tomorrow. Throws otherwise.
function args(lat, lon, utc, now = Date.now()) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error("bad coordinates");
  if (!Number.isFinite(utc) || utc < Date.UTC(2018, 0, 1) || utc > now + 864e5) throw new Error("bad time");
  return [Math.round(lat * 100) / 100, Math.round(lon * 100) / 100, utc];
}
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

// How much of the sky reads as cloud (0–1) from the layers (%): low and mid cloud are the grey decks that hide the sun;
// high cloud (cirrus) is thin – the sun shines through (Monza 2025's race: 58–100 % "total", all of it high, a sunny race)
// so it counts a fifth.
// A layer outside 0–100 % (Open-Meteo's own range) is no value: null – that hour unusable, not clamped to 0 or 100. (The
// formula itself tops out at 120 %: that top, and only that, is capped at 1.)
const pct = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
function coverOf(low, mid, high) {
  if (![low, mid, high].every(pct)) return null;
  return Math.min(1, (Math.max(low, 0.9 * mid) + 0.2 * high) / 100);
}

// the answer is for (lat, lon) and in UTC – throws otherwise (NaN never passes: a missing coordinate is no place)
function checkPlace(json, lat, lon) {
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  if (!num(json.latitude) || !num(json.longitude)) throw new Error("answer without coordinates");
  if (!(Math.abs(json.latitude - lat) <= 0.5) || !(Math.abs(json.longitude - lon) <= 0.5)) throw new Error("answer for another place");
  if ("utc_offset_seconds" in json && json.utc_offset_seconds !== 0) throw new Error("answer not in UTC");
  if ("timezone" in json && !/^(GMT|UTC)$/.test(json.timezone)) throw new Error("answer not in UTC");
}
// an answer's time ("2025-07-27T13:00", GMT; a "Z" allowed) → UTC ms, or NaN for anything else: another zone's offset,
// a date that doesn't exist (Date.parse takes 30 February as 2 March – the round trip catches it)
function utcOf(t) {
  const m = typeof t === "string" && /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:00)?Z?$/.exec(t);
  if (!m) return NaN;
  const ms = Date.parse(m[1] + "Z");
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 16) === m[1] ? ms : NaN;
}
// An Open-Meteo hourly answer → [[utcMs, cover]…] (unusable hours left out), or throws when it is structurally wrong or
// not for that place (the policy above). range: [fromMs, toMs) – the asked dates; hours outside it dropped.
function parseHourly(json, lat, lon, range = null) {
  if (!json || typeof json !== "object" || !json.hourly || !Array.isArray(json.hourly.time) || !json.hourly.time.length) throw new Error("no hourly data");
  checkPlace(json, lat, lon);
  if (json.hourly_units?.time != null && json.hourly_units.time !== "iso8601") throw new Error("answer not in UTC ISO time");
  const h = json.hourly, n = h.time.length, L = [h.cloud_cover_low, h.cloud_cover_mid, h.cloud_cover_high];
  if (!L.every((a) => Array.isArray(a) && a.length === n)) throw new Error("layer arrays don't match the time array's length");
  const out = [];
  let last = -Infinity;
  for (let i = 0; i < n; i++) {
    const ms = utcOf(h.time[i]);
    if (!Number.isFinite(ms)) continue;
    if (ms <= last) throw new Error("times out of order or repeated");
    last = ms;
    if (range && (ms < range[0] || ms >= range[1])) continue;
    const c = coverOf(L[0][i], L[1][i], L[2][i]);
    if (c != null) out.push([ms, +c.toFixed(3)]);
  }
  return out;
}
// a cache file's contents are hours as parseHourly makes them: [[utcMs, 0–1]…], in order, inside the file's dates
function cachedHours(v, range) {
  if (!Array.isArray(v) || !v.length) return null;
  let last = -Infinity;
  for (const e of v) {
    if (!Array.isArray(e) || e.length !== 2 || !Number.isInteger(e[0]) || e[0] <= last || e[0] < range[0] || e[0] >= range[1] || typeof e[1] !== "number" || !(e[1] >= 0 && e[1] <= 1)) return null;
    last = e[0];
  }
  return v;
}
// written whole or not at all: a temp file renamed over the old one (a crash mid-write leaves a stray .tmp, never a
// half file under the real name)
async function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  try { await fs.promises.writeFile(tmp, text); await fs.promises.rename(tmp, file); } catch (e) { fs.promises.unlink(tmp).catch(() => {}); throw e; }
}
// the hours that count for the moment `utc`: kept only if one is within 90 min of it
const usable = (hours, utc) => hours.some(([ms]) => Math.abs(ms - utc) <= 90 * 60e3);

class Clouds {
  // opts.now: the clock (tests)
  constructor(dir, fetchFn = (...a) => fetch(...a), opts = {}) { this.dir = dir; this.fetch = fetchFn; this.mem = new Map(); this.now = opts.now || Date.now; }
  async get(lat, lon, utc, live = false) {
    [lat, lon, utc] = args(lat, lon, utc, this.now());
    if (live) return this.current(lat, lon);
    const d0 = day(utc - 864e5), d1 = day(utc + 864e5), key = `${lat}_${lon}_${d0}_${d1}`;
    if (this.mem.has(key)) return this.mem.get(key);
    // the asked dates as UTC hours: [d0 00:00, the day after d1 00:00) – 72 of them when complete
    const range = [Date.parse(d0 + "T00:00Z"), Date.parse(d1 + "T00:00Z") + 864e5], all = (range[1] - range[0]) / 36e5;
    const file = path.join(this.dir, `archive_${key}.json`);
    // (a file that isn't hours as written below – half-written, corrupt, another shape – is ignored and replaced)
    let hours = null;
    try { hours = cachedHours(JSON.parse(await fs.promises.readFile(file, "utf8")), range); } catch {}
    if (!hours || !usable(hours, utc)) {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${d0}&end_date=${d1}&hourly=${HOURLY}&timezone=GMT`;
      try {
        const res = await this.fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
        if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
        hours = parseHourly(await res.json(), lat, lon, range);
      } catch (e) { return { ok: false, reason: e.message }; }
      if (!usable(hours, utc)) return { ok: false, reason: "no archive data for that time yet" };
      // kept on disk once complete: a day still being published (some hours null) is used now but asked again next run
      if (hours.length === all) try { await fs.promises.mkdir(this.dir, { recursive: true }); await writeAtomic(file, JSON.stringify(hours)); } catch {}
    }
    const r = { ok: true, hours, source: "Open-Meteo historical archive (reanalysis)", lat, lon };
    this.mem.set(key, r);
    return r;
  }
  // live: the forecast model's current value (15-minute steps), held for 15 minutes; the same checks as an hourly answer
  async current(lat, lon) {
    const key = `now_${lat}_${lon}`, m = this.mem.get(key), now = this.now();
    if (m && now - m.at < 15 * 60e3) return m.r;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${HOURLY}&timezone=GMT`;
    try {
      const res = await this.fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
      const j = await res.json(), c = j?.current;
      if (!c || typeof c !== "object") return { ok: false, reason: "no current value" };
      checkPlace(j, lat, lon);
      if (j.current_units?.time != null && j.current_units.time !== "iso8601") throw new Error("answer not in UTC ISO time");
      const ms = utcOf(c.time), cover = coverOf(c.cloud_cover_low, c.cloud_cover_mid, c.cloud_cover_high);
      if (!Number.isFinite(ms) || cover == null || Math.abs(ms - now) > 90 * 60e3) return { ok: false, reason: "no current value" };
      const r = { ok: true, hours: [[ms, +cover.toFixed(3)]], source: "Open-Meteo forecast (current)", lat, lon };
      this.mem.set(key, { at: now, r });
      return r;
    } catch (e) { return { ok: false, reason: e.message }; }
  }
}

module.exports = { Clouds, coverOf, parseHourly, args, usable, utcOf, cachedHours, checkPlace };
