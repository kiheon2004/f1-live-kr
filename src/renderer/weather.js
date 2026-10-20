// The session's weather as one environment state for the 3D view – the same for a live feed and a replay, always read
// at the session clock's moment t (a replay: the moment played; live: the moment shown, after the broadcast delay).
// Pure functions, no three.js (tested in node: test/weather.test.js); weather3d.js draws it.
//
// What is measured and what is not (checked 2026-10-20 in every cached WeatherData recording, 54 sessions 2024–2026):
//  – F1's WeatherData: one full record about every 60 s (median gap 60.0 s; one 379 s gap, Baku 2026 FP1) with AirTemp,
//    Humidity, Pressure, Rainfall, TrackTemp, WindDirection, WindSpeed – all strings ("18.8", "328", …). Rainfall was "0"
//    or "1" in every record (no numbers, booleans or blanks seen; 0/1/true/false are still read the same way, anything
//    else is unknown). It's the trackside station's rain sensor: rain yes/no – no amount, no clouds, no water on the road.
//    Telemetry, H.
//  – the road's wetness: NOT measured (no channel for it). Estimated here from the rain record's history (wetModel) and,
//    as supporting evidence, the share of cars on intermediate / wet tyres at t (TimingAppData compounds – the teams'
//    own judgement of the track; wetTyres). Race control's "TRACK SURFACE SLIPPERY" isn't used: it's sent for oil and
//    debris as much as for water (2025–26 recordings), and "WET TRACK" came once in 54 sessions.
//  – how hard it rains: not in the feed. A presentation default (INTENSITY), not mm/h.
//  – clouds: not in the feed. "No rain" says nothing about the sky; without other data the sky is a neutral one (a setting
//    can pick another look) – or a cloud fraction from an hourly weather archive for the circuit's place and the session's
//    hour when it was found (weather3d / main/clouds.js: Open-Meteo, a reanalysis – model data, not a photo of that sky).

// ---------- reading the feed ----------
// Rainfall → 1 (raining), 0 (not raining) or null (unknown: missing, blank, garbage). Missing is never "dry".
export function rainOf(v) {
  if (v === true || v === 1) return 1;
  if (v === false || v === 0) return 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "1" || s === "true" || s === "1.0") return 1;
    if (s === "0" || s === "false" || s === "0.0") return 0;
  }
  return null;
}
// a number from the feed's strings ("18.8"), or null
export function numOf(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------- the road's wetness (an estimate) ----------
// A first-order response: while it rains the road goes towards fully wet (1), while it doesn't it dries towards 0, and
// while the rain record is unknown it stays where it was (nothing is assumed). Closed form between records, so the value
// at t comes from the records up to t alone – the same after a seek, a rewind, at any playback speed or frame rate.
//  – TAU_WET 6 min: short showers (the feed's 1–2 min of "1") leave a damp road, ~20 min of rain a wet one. Seen in the
//    tyre data: Zandvoort 2026 (showers of 1–2 min flagged through the race) – every car stayed on slicks; Spa / Silverstone
//    2025, Bahrain 2026 (rain for 30–60 min) – the whole field on intermediates. L–M.
//  – TAU_DRY 30 min: calibrated on when the field went back to slicks after the rain stopped (TimingAppData): Spa 2025 –
//    rain off at 126.6 min, half the field on slicks at 163 min (≈ 37 min: model 0.29); Silverstone 2025 – off at 87.3 min,
//    half at ≈ 138 min (≈ 51 min: 0.18); Bahrain 2026 – off at 93 min, first slicks at 145 min (52 min: 0.18) under a red
//    flag and safety car. So "slicks" ≈ 0.2–0.3. Sun, wind, track temperature and traffic (which dry a line first) aren't
//    modelled. L–M.
export const TAU_WET = 6 * 60e3, TAU_DRY = 30 * 60e3;
export function evolveWet(w, rain, dt) {
  if (!(dt > 0)) return w;
  if (rain === 1) return 1 - (1 - w) * Math.exp(-dt / TAU_WET);
  if (rain === 0) return w * Math.exp(-dt / TAU_DRY);
  return w;
}
// Presentation (not measured): how strongly the rain is drawn (share of the drops shown, 0–1) – a "moderate" look; how
// fast it fades in and out when the record changes (the record is a step; a minute's sample can't say when within it).
export const INTENSITY = 0.6, RAMP = 40e3;
// clouds linger after the rain stops (presentation; nothing in the feed): the overcast look fades over CLOUD_TAU
export const CLOUD_TAU = 15 * 60e3;

// The session's records in time order: rain state, wetness at each record (computed once, from the records before it),
// when the current rain state began and when the last rain ended. push() appends (live: as records arrive; replay: the
// whole recording once) – a record older than the last is ignored, one at the same moment replaces it.
export class WeatherLog {
  constructor() { this.reset(); }
  reset() { this.ms = []; this.rain = []; this.wet = []; this.since = []; this.rainEnd = []; this.recs = []; this.cur = {}; }
  get size() { return this.ms.length; }
  // data: a WeatherData message (full or partial: fields it lacks keep their last value, as the app's merged state does;
  // a Rainfall that is there but unreadable is unknown)
  push(ms, data) {
    if (!Number.isFinite(ms) || !data || typeof data !== "object") return false;
    const n = this.ms.length;
    if (n && ms < this.ms[n - 1]) return false;
    if (n && ms === this.ms[n - 1]) { this.pop(); return this.push(ms, data); }
    const rec = { ...this.cur };
    for (const k of ["AirTemp", "Humidity", "Pressure", "TrackTemp", "WindDirection", "WindSpeed"]) if (k in data) rec[k] = numOf(data[k]);
    if ("Rainfall" in data) rec.rain = rainOf(data.Rainfall); else if (!("rain" in rec)) rec.rain = null;
    const k = n - 1, rain = rec.rain;
    const wet = n ? evolveWet(this.wet[k], this.rain[k], ms - this.ms[k]) : 0;
    const since = n && this.rain[k] === rain ? this.since[k] : ms;
    // (the moment the last rain ended: this record's when it stops the rain)
    const rainEnd = n && this.rain[k] === 1 && rain !== 1 ? ms : n ? this.rainEnd[k] : null;
    this.ms.push(ms); this.rain.push(rain); this.wet.push(wet); this.since.push(since); this.rainEnd.push(rainEnd); this.recs.push(rec);
    this.cur = rec;
    return true;
  }
  pop() { this.ms.pop(); this.rain.pop(); this.wet.pop(); this.since.pop(); this.rainEnd.pop(); this.recs.pop(); this.cur = this.recs[this.recs.length - 1] || {}; }
  // index of the last record at or before t (−1: none yet)
  indexAt(t) {
    let lo = 0, hi = this.ms.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (this.ms[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  }
  rainAt(t) { const k = this.indexAt(t); return k < 0 ? null : this.rain[k]; }
  // the estimated wetness at t (0–1), or null before the first record
  wetAt(t) { const k = this.indexAt(t); return k < 0 ? null : evolveWet(this.wet[k], this.rain[k], t - this.ms[k]); }
  recordAt(t) { const k = this.indexAt(t); return k < 0 ? null : this.recs[k]; }
  // A replay's whole recording: its WeatherData events ({ ms, topic, data }, in time order).
  static fromEvents(events) {
    const log = new WeatherLog();
    for (const e of events || []) if (e.topic === "WeatherData") log.push(e.ms, e.data);
    return log;
  }
}

// ---------- supporting evidence: the tyres the cars are on at t ----------
// TimingAppData's Lines (the state at t): each car's latest stint compound. Intermediates count 0.75, full wets 1
// (the teams' judgement of the track; F1's compound names as sent). null with fewer than 3 cars known.
const WET_WEIGHT = { INTERMEDIATE: 0.75, WET: 1 };
export function wetTyreEvidence(lines) {
  if (!lines || typeof lines !== "object") return null;
  let known = 0, sum = 0;
  for (const num in lines) {
    const l = lines[num], st = l?.Stints;
    if (!st || typeof st !== "object" || l.Retired || l.Stopped) continue;
    let comp = null, best = -1;
    for (const k in st) { if (!/^\d+$/.test(k)) continue; const c = st[k]?.Compound; if (typeof c === "string" && +k > best) { best = +k; comp = c; } }
    if (!comp || comp === "UNKNOWN" || comp === "TEST_UNKNOWN") continue;
    known++; sum += WET_WEIGHT[comp] || 0;
  }
  return known >= 3 ? sum / known : null;
}

// ---------- the environment at t ----------
// sky: "auto" (an hourly cloud fraction when one was found, else neutral) · "neutral" · "fair" (the old fair-weather look)
// · "overcast". The setting is for when the feed can't say: rain always brings the overcast look.
export const NEUTRAL_CLOUD = 0.45;
// a cloud fraction (0–1, total cover) → the look's overcast amount (0: the fair-weather sky – itself ≈ a quarter covered
// with small clouds – … 1: an unbroken grey deck)
export const cloudLook = (c) => Math.max(0, Math.min(1, (c - 0.2) / 0.75));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function newEnvironment() {
  return { t: null, known: false, raining: null, rainAmt: 0, wet: 0, wetModel: null, wetTyres: null, wetSrc: "none", cloud: NEUTRAL_CLOUD, cloudSrc: "neutral",
    airTemp: null, trackTemp: null, humidity: null, windSpeed: null, windDir: null, forced: false };
}
// Fills `out` (reused: no garbage per frame). opts: { tyres (wetTyreEvidence at t, or null), cover (0–1 hourly cloud
// fraction at t, or null), sky ("auto" | "neutral" | "fair" | "overcast"), intensity }.
export function environmentAt(log, t, opts = {}, out = newEnvironment()) {
  const k = log ? log.indexAt(t) : -1, rec = k >= 0 ? log.recs[k] : null;
  out.t = t; out.forced = false;
  out.raining = k >= 0 ? log.rain[k] : null;
  out.known = out.raining !== null;
  out.airTemp = rec?.AirTemp ?? null; out.trackTemp = rec?.TrackTemp ?? null; out.humidity = rec?.Humidity ?? null;
  out.windSpeed = rec?.WindSpeed ?? null; out.windDir = rec?.WindDirection ?? null;
  // rain drawn: faded in from when it began, out from when it stopped (only records up to t)
  const I = opts.intensity ?? INTENSITY;
  if (out.raining === 1) out.rainAmt = I * clamp01((t - log.since[k]) / RAMP);
  else if (k >= 0 && log.rainEnd[k] != null && log.since[k] === log.rainEnd[k]) out.rainAmt = I * clamp01(1 - (t - log.rainEnd[k]) / RAMP);
  else out.rainAmt = 0;
  // wetness: the model, the tyres as a floor under it
  out.wetModel = k >= 0 ? evolveWet(log.wet[k], log.rain[k], t - log.ms[k]) : null;
  out.wetTyres = opts.tyres ?? null;
  const a = out.wetModel ?? 0, b = out.wetTyres ?? 0;
  out.wet = Math.max(a, b);
  out.wetSrc = out.wetModel == null && out.wetTyres == null ? "none" : b > a ? "tyres" : "rain";
  // the sky: what the setting / the cloud data says, overcast while it rains (faded in over 2 min) and for a while after
  const sky = opts.sky || "auto";
  let base, src;
  if (sky === "fair") { base = 0; src = "setting"; }
  else if (sky === "overcast") { base = 1; src = "setting"; }
  else if (sky === "auto" && opts.cover != null) { base = cloudLook(opts.cover); src = "cloud data"; }
  else { base = NEUTRAL_CLOUD; src = "neutral"; }
  let rainCloud = 0;
  if (out.raining === 1) rainCloud = 0.92 * clamp01(0.35 + (t - log.since[k]) / 120e3);
  else if (k >= 0 && log.rainEnd[k] != null) rainCloud = 0.92 * Math.exp(-(t - log.rainEnd[k]) / CLOUD_TAU);
  if (rainCloud > base) { base = rainCloud; src = "rain"; }
  out.cloud = base; out.cloudSrc = src;
  return out;
}

// ---------- where rain can't fall ----------
// Covers: [{ pts: [[x, z]…], y }] – a roof's outline and the height of its underside (scene metres). A raster of the
// highest roof over each cell (−1e9: open sky), over the covers' own extent only. A drop below the roof over it is hidden;
// one beside the roof isn't – a camera under a roof still sees the rain outside.
export const OPEN = -1e9;
function inPoly(x, z, pts) { let r = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r; } return r; }
export function coverRaster(covers, { cell = 1, max = 1024, pad = 2 } = {}) {
  const list = (covers || []).filter((c) => c?.pts?.length >= 3 && Number.isFinite(c.y));
  if (!list.length) return null;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const c of list) for (const [x, z] of c.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  x0 -= pad; z0 -= pad; x1 += pad; z1 += pad;
  const size = Math.max(cell, (x1 - x0) / max, (z1 - z0) / max);
  const w = Math.max(1, Math.ceil((x1 - x0) / size)), h = Math.max(1, Math.ceil((z1 - z0) / size));
  const data = new Float32Array(w * h).fill(OPEN);
  for (const c of list) {
    let a = Infinity, b = Infinity, A = -Infinity, B = -Infinity;
    for (const [x, z] of c.pts) { a = Math.min(a, x); A = Math.max(A, x); b = Math.min(b, z); B = Math.max(B, z); }
    const i0 = Math.max(0, Math.floor((a - x0) / size)), i1 = Math.min(w - 1, Math.floor((A - x0) / size));
    const j0 = Math.max(0, Math.floor((b - z0) / size)), j1 = Math.min(h - 1, Math.floor((B - z0) / size));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      // (a cell is covered when any of its centre or corners is: thin roofs – a tunnel's edge – aren't lost between cells)
      const cx = x0 + (i + 0.5) * size, cz = z0 + (j + 0.5) * size, q = size * 0.45;
      if (inPoly(cx, cz, c.pts) || inPoly(cx - q, cz - q, c.pts) || inPoly(cx + q, cz - q, c.pts) || inPoly(cx - q, cz + q, c.pts) || inPoly(cx + q, cz + q, c.pts)) {
        const o = j * w + i; if (c.y > data[o]) data[o] = c.y;
      }
    }
  }
  return { x0, z0, cell: size, w, h, data, count: list.length };
}
export function roofAt(r, x, z) {
  if (!r) return OPEN;
  const i = Math.floor((x - r.x0) / r.cell), j = Math.floor((z - r.z0) / r.cell);
  if (i < 0 || j < 0 || i >= r.w || j >= r.h) return OPEN;
  return r.data[j * r.w + i];
}
export const rainBlocked = (r, x, y, z) => y < roofAt(r, x, z);

// A covered stretch's roof (tunnel.js stations – or a list of such lists, one per stretch): a quad between each pair of stations across its outer faces, at the
// lower of the two ceilings (the road falls along Monaco's tunnel).
export function tunnelCovers(stations) {
  const out = [];
  if (!stations?.length) return out;
  // (scenery.js keeps one list of stations per covered stretch)
  if (Array.isArray(stations[0])) { for (const list of stations) out.push(...tunnelCovers(list)); return out; }
  const P = (st, o) => [st.x + st.ox * o, st.z + st.oz * o];
  for (let k = 0; k + 1 < stations.length; k++) {
    const a = stations[k], b = stations[k + 1];
    out.push({ pts: [P(a, a.seaOut), P(b, b.seaOut), P(b, -b.hillOut), P(a, -a.hillOut)], y: Math.min(a.ceil, b.ceil), kind: "tunnel" });
  }
  return out;
}

// The wind (the feed's direction it blows FROM, degrees clockwise from north; speed m/s) as a scene velocity, given the
// scene's north and east unit vectors ([x, z]). Into `out` ([x, z]).
export function windVector(dirDeg, speed, north = [0, -1], east = [1, 0], out = [0, 0]) {
  if (!Number.isFinite(dirDeg) || !Number.isFinite(speed)) { out[0] = 0; out[1] = 0; return out; }
  const a = (dirDeg * Math.PI) / 180, s = -speed;           // (towards: the opposite of where it comes from)
  const n = Math.cos(a) * s, e = Math.sin(a) * s;
  out[0] = north[0] * n + east[0] * e; out[1] = north[1] * n + east[1] * e;
  return out;
}

// The cloud fraction at a UTC moment from hourly values ([[utcMs, 0–1]…], time order – main/clouds.js): between the two
// hours round it, linearly (an hourly reanalysis describes the sky at those hours; it says nothing of the race); only
// when an hour is within 90 min, else null (no data for that moment: the sky stays neutral). One value (live: the
// forecast model's current one) holds for 90 min either side.
export function coverAt(hours, utc) {
  if (!Array.isArray(hours) || !hours.length || !Number.isFinite(utc)) return null;
  const NEAR = 90 * 60e3;
  let a = null, b = null;
  for (const h of hours) { if (h[0] <= utc) a = h; else { b = h; break; } }
  if (a && b && b[0] - a[0] <= 2 * NEAR) { const f = (utc - a[0]) / (b[0] - a[0] || 1); return a[1] + (b[1] - a[1]) * f; }
  const n = a && utc - a[0] <= NEAR ? a : b && b[0] - utc <= NEAR ? b : null;
  return n ? n[1] : null;
}
