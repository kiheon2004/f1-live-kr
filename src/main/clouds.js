// Cloud cover at a circuit for a session's hours – the one thing the 3D view's sky can't get from F1's feed (WeatherData
// has no clouds: renderer/weather.js). Open-Meteo (https://open-meteo.com, free for non-commercial use, no key, data
// CC BY 4.0): its historical archive (ERA5 / ECMWF IFS reanalysis, hourly, a 9–25 km grid – model data, not an
// observation of that stand's sky: M for the overall cover, L for a passing shower's timing) for a past session; its
// forecast model's current value for a live one. Anonymous GETs: nothing about the user is sent (only the circuit's
// coordinates and the date). Answers are kept in the app's own data folder (not the F1 session cache).
//
// Checked before use: the answer's grid point within 0.5° of the circuit, and an hour within 90 min of the asked moment
// (an archive day not yet published comes back as nulls – then there is no cover: the sky stays neutral; a past
// session is never given today's weather).
const fs = require("node:fs");
const path = require("node:path");

const UA = { "User-Agent": "f1-live-kr (personal, non-commercial desktop app)" };
const HOURLY = "cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high";

// Checked arguments: lat, lon in range; a moment between 2018 and tomorrow. Throws otherwise.
function args(lat, lon, utc) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error("bad coordinates");
  if (!Number.isFinite(utc) || utc < Date.UTC(2018, 0, 1) || utc > Date.now() + 864e5) throw new Error("bad time");
  return [Math.round(lat * 100) / 100, Math.round(lon * 100) / 100, utc];
}
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

// How much of the sky reads as cloud (0–1) from the layers (%): low and mid cloud are the grey decks that hide the sun;
// high cloud (cirrus) is thin – the sun shines through (Monza 2025's race: 58–100 % "total", all of it high, a sunny race)
// so it counts a fifth.
function coverOf(low, mid, high) {
  if (![low, mid, high].every(Number.isFinite)) return null;
  return Math.max(0, Math.min(1, (Math.max(low, 0.9 * mid) + 0.2 * high) / 100));
}

// An Open-Meteo hourly answer → [[utcMs, cover]…] (nulls left out), or throws when it isn't for that place.
function parseHourly(json, lat, lon) {
  if (!json || typeof json !== "object" || !json.hourly || !Array.isArray(json.hourly.time)) throw new Error("no hourly data");
  if (Math.abs(json.latitude - lat) > 0.5 || Math.abs(json.longitude - lon) > 0.5) throw new Error("answer for another place");
  const h = json.hourly, out = [];
  h.time.forEach((t, i) => {
    const ms = Date.parse(/Z$/.test(t) ? t : t + "Z"), c = coverOf(h.cloud_cover_low?.[i], h.cloud_cover_mid?.[i], h.cloud_cover_high?.[i]);
    if (Number.isFinite(ms) && c != null) out.push([ms, +c.toFixed(3)]);
  });
  return out;
}
// the hours that count for the moment `utc`: kept only if one is within 90 min of it
const usable = (hours, utc) => hours.some(([ms]) => Math.abs(ms - utc) <= 90 * 60e3);

class Clouds {
  constructor(dir, fetchFn = (...a) => fetch(...a)) { this.dir = dir; this.fetch = fetchFn; this.mem = new Map(); }
  async get(lat, lon, utc, live = false) {
    [lat, lon, utc] = args(lat, lon, utc);
    if (live) return this.current(lat, lon);
    const d0 = day(utc - 864e5), d1 = day(utc + 864e5), key = `${lat}_${lon}_${d0}_${d1}`;
    if (this.mem.has(key)) return this.mem.get(key);
    const file = path.join(this.dir, `archive_${key}.json`);
    let hours = null;
    try { hours = JSON.parse(await fs.promises.readFile(file, "utf8")); } catch {}
    if (!Array.isArray(hours) || !usable(hours, utc)) {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${d0}&end_date=${d1}&hourly=${HOURLY}&timezone=GMT`;
      try {
        const res = await this.fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
        if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
        hours = parseHourly(await res.json(), lat, lon);
      } catch (e) { return { ok: false, reason: e.message }; }
      if (!usable(hours, utc)) return { ok: false, reason: "no archive data for that time yet" };
      // (kept once complete: a day still being published isn't stored)
      try { await fs.promises.mkdir(this.dir, { recursive: true }); await fs.promises.writeFile(file, JSON.stringify(hours)); } catch {}
    }
    const r = { ok: true, hours, source: "Open-Meteo historical archive (reanalysis)", lat, lon };
    this.mem.set(key, r);
    return r;
  }
  // live: the forecast model's current value (15-minute steps), held for 15 minutes
  async current(lat, lon) {
    const key = `now_${lat}_${lon}`, m = this.mem.get(key);
    if (m && Date.now() - m.at < 15 * 60e3) return m.r;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${HOURLY}&timezone=GMT`;
    try {
      const res = await this.fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
      const j = await res.json(), c = j?.current;
      if (!c || Math.abs(j.latitude - lat) > 0.5 || Math.abs(j.longitude - lon) > 0.5) return { ok: false, reason: "answer for another place" };
      const ms = Date.parse(c.time + "Z"), cover = coverOf(c.cloud_cover_low, c.cloud_cover_mid, c.cloud_cover_high);
      if (!Number.isFinite(ms) || cover == null || Math.abs(ms - Date.now()) > 90 * 60e3) return { ok: false, reason: "no current value" };
      const r = { ok: true, hours: [[ms, +cover.toFixed(3)]], source: "Open-Meteo forecast (current)", lat, lon };
      this.mem.set(key, { at: Date.now(), r });
      return r;
    } catch (e) { return { ok: false, reason: e.message }; }
  }
}

module.exports = { Clouds, coverOf, parseHourly, args, usable };
