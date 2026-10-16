// F1 timing archive client: session index, stream download, decoding and an on-disk cache.
// Past sessions are published at livetiming.formula1.com/static/ without login.
const fs = require("node:fs");
const { findLap } = require("../renderer/replay.js");
const path = require("node:path");
const zlib = require("node:zlib");

const BASE = "https://livetiming.formula1.com/static/";

// Topics the app replays. Position.z is compressed (raw deflate + base64).
const TOPICS = [
  "Heartbeat", "SessionInfo", "DriverList", "TimingData", "TimingAppData", "RaceControlMessages",
  "TrackStatus", "LapCount", "ExtrapolatedClock", "WeatherData", "SessionStatus", "TeamRadio", "Position.z",
  "TimingStats", "PitStopSeries", "PitLaneTimeCollection", "ChampionshipPrediction", "CarData.z",
];

const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
// the topics a replay can't do without (what's on the timing board and who is who)
const CORE = ["TimingData", "DriverList", "SessionInfo"];

// (a compressed message is a few kB; more than 32 MB unpacked is not position data, and is refused)
const INFLATE_MAX = 32 * 1024 * 1024;
function inflateZ(b64) {
  return JSON.parse(zlib.inflateRawSync(Buffer.from(b64, "base64"), { maxOutputLength: INFLATE_MAX }).toString("utf8"));
}

// "HH:MM:SS.mmm{json}" per line; time is offset from the start of the stream.
function parseStream(text, compressed) {
  const out = [];
  for (const raw of stripBom(text).split(/\r?\n/)) {
    const m = /^(\d+):(\d\d):(\d\d)\.(\d+)(.*)$/.exec(raw.trim());
    if (!m) continue;
    const ms = ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + Math.round(+("0." + m[4]) * 1000);
    try {
      const body = JSON.parse(m[5]);
      out.push([ms, compressed ? inflateZ(body) : body]);
    } catch { /* skip a damaged line */ }
  }
  return out;
}

// Position samples carry their own UTC timestamps; spread them back from the line time.
function flattenPositions(lines) {
  const samples = [];
  for (const [ms, body] of lines) {
    const list = body.Position || [];
    if (!list.length) continue;
    const last = Date.parse(list[list.length - 1].Timestamp);
    for (const p of list) {
      const t = ms - (last - Date.parse(p.Timestamp));
      const cars = {};
      for (const [num, e] of Object.entries(p.Entries || {})) {
        if (e.X || e.Y) cars[num] = [e.X, e.Y, e.Z || 0];   // decimetres; Z is elevation
      }
      samples.push([t, cars]);
    }
  }
  samples.sort((a, b) => a[0] - b[0]);
  return samples;
}

// The same per car, as compact typed arrays in time order: { cars: { num: { t: Float64Array, x, y, z: Float32Array, n } } }
// – what the replay's CarTracks keeps. (The sample list above is ~90 MB of objects for a race; this is ~13 MB, and
// passes to the page without copying every little array.)
function flattenTracks(lines) {
  const per = {};
  for (const [ms, body] of lines) {
    const list = body.Position || [];
    if (!list.length) continue;
    const last = Date.parse(list[list.length - 1].Timestamp);
    for (const p of list) {
      const t = ms - (last - Date.parse(p.Timestamp));
      for (const [num, e] of Object.entries(p.Entries || {})) {
        if (!(e.X || e.Y)) continue;
        (per[num] || (per[num] = [])).push(t, e.X, e.Y, e.Z || 0);
      }
    }
  }
  const cars = {};
  for (const [num, a] of Object.entries(per)) {
    const k = a.length / 4, order = Array.from({ length: k }, (_, i) => i);
    // (time order, ties as they came – as the sample list's stable sort gives them)
    order.sort((i, j) => a[i * 4] - a[j * 4] || i - j);
    const o = { t: new Float64Array(k), x: new Float32Array(k), y: new Float32Array(k), z: new Float32Array(k), n: 0 };
    for (const i of order) {
      const t = a[i * 4];
      if (o.n && t <= o.t[o.n - 1] + 1) continue;   // same moment twice: the first (as CarTracks)
      o.t[o.n] = t; o.x[o.n] = a[i * 4 + 1]; o.y[o.n] = a[i * 4 + 2]; o.z[o.n] = a[i * 4 + 3]; o.n++;
    }
    cars[num] = o;
  }
  return { cars };
}

// Car telemetry, per car, as compact typed arrays (stream ms; speed km/h, rpm, gear, throttle %, brake 0/1, DRS code).
// F1 channels: 0 RPM, 2 speed, 3 gear, 4 throttle, 5 brake, 45 DRS (8+ = open, gone in 2026).
function flattenCarData(lines) {
  const per = {};
  for (const [ms, body] of lines) {
    const list = body.Entries || [];
    if (!list.length) continue;
    const last = Date.parse(list[list.length - 1].Utc);
    for (const e of list) {
      const t = ms - (last - Date.parse(e.Utc));
      for (const [num, car] of Object.entries(e.Cars || {})) {
        const c = car.Channels || {};
        (per[num] || (per[num] = [])).push([t, c[2] || 0, c[0] || 0, c[3] || 0, c[4] || 0, c[5] ? 1 : 0, c[45] || 0]);
      }
    }
  }
  const out = {};
  for (const [num, rows] of Object.entries(per)) {
    rows.sort((a, b) => a[0] - b[0]);
    const n = rows.length, o = { t: new Float64Array(n), v: new Uint16Array(n), rpm: new Uint16Array(n), gear: new Uint8Array(n), thr: new Uint8Array(n), brk: new Uint8Array(n), drs: new Uint8Array(n) };
    rows.forEach((r, i) => { o.t[i] = r[0]; o.v[i] = r[1]; o.rpm[i] = r[2]; o.gear[i] = r[3]; o.thr[i] = Math.min(255, r[4]); o.brk[i] = r[5]; o.drs[i] = r[6]; });
    out[num] = o;
  }
  return out;
}

// Session start in UTC ms; StartDate is local track time, GmtOffset like "08:00:00" or "-04:00:00".
function sessionUtc({ start, gmtOffset }) {
  const m = /^(-?)(\d\d):(\d\d)/.exec(gmtOffset || "00:00");
  return Date.parse(`${start}${m[1] ? "-" : "+"}${m[2]}:${m[3]}`);
}

class Archive {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // Session recordings pile up (~20 MB a session): past `maxBytes` the ones used longest ago are deleted down to
  // `target` (they download again if needed). Returns the bytes freed.
  prune(maxBytes = 3 * 1024 ** 3, target = 2 * 1024 ** 3) {
    let files;
    try { files = fs.readdirSync(this.cacheDir).filter((f) => f.endsWith(".jsonStream")).map((f) => { const p = path.join(this.cacheDir, f), st = fs.statSync(p); return { p, size: st.size, used: st.mtimeMs }; }); }
    catch { return 0; }
    let total = files.reduce((a, f) => a + f.size, 0), freed = 0;
    if (total <= maxBytes) return 0;
    files.sort((a, b) => a.used - b.used);
    for (const f of files) {
      if (total <= target) break;
      try { fs.unlinkSync(f.p); total -= f.size; freed += f.size; } catch {}
    }
    return freed;
  }

  cachePath(key) {
    return path.join(this.cacheDir, key.replace(/[^A-Za-z0-9._-]+/g, "_"));
  }

  // Finished sessions never change, so cached files are reused forever; indexes refresh hourly.
  // onBytes(received, total) reports download progress (a cached file reports itself as complete).
  async getText(rel, { maxAgeMs = Infinity, onBytes } = {}) {
    const file = this.cachePath(rel);
    try {
      const st = fs.statSync(file);
      if (Date.now() - st.mtimeMs < maxAgeMs) {
        // (a kept-for-good file is marked as just used, so pruning takes the ones not opened for longest)
        if (maxAgeMs === Infinity) { try { const now = new Date(); fs.utimesSync(file, now, now); } catch {} }
        onBytes?.(st.size, st.size); return fs.readFileSync(file, "utf8");
      }
    } catch { /* not cached */ }
    let res;
    try { res = await fetch(BASE + rel, { signal: AbortSignal.timeout(60000) }); }
    catch (e) {
      // Offline: an old copy (e.g. a season index older than an hour) is better than nothing.
      try { const text = fs.readFileSync(file, "utf8"); onBytes?.(text.length, text.length); return text; } catch {}
      onBytes?.(0, 0);
      throw new Error(`인터넷 연결을 확인해 주세요 (${e.cause?.code || e.name})`);
    }
    if (!res.ok) {
      // Refused (F1 closed its public archive to anonymous requests on 2026-10-16: 401 for every file) or a server
      // error: an old copy is better than nothing, as when offline. A missing file (404) is no reason to.
      if ([401, 403, 429].includes(res.status) || res.status >= 500) {
        try { const text = fs.readFileSync(file, "utf8"); onBytes?.(text.length, text.length); return text; } catch {}
      }
      onBytes?.(0, 0);
      const err = new Error(res.status === 401 || res.status === 403 ? `F1 기록 서버가 접근을 막았어요 (HTTP ${res.status}). 이 컴퓨터에 받아 둔 기록만 열 수 있어요` : `HTTP ${res.status} for ${rel}`);
      err.status = res.status; throw err;
    }
    let text;
    if (onBytes) {
      const total = +res.headers.get("content-length") || 0, chunks = [];
      let got = 0;
      onBytes(0, total);
      for await (const c of res.body) { chunks.push(c); got += c.length; onBytes(got, Math.max(total, got)); }
      text = stripBom(Buffer.concat(chunks).toString("utf8"));
    } else text = stripBom(await res.text());
    fs.writeFileSync(file, text);
    return text;
  }

  async listSessions(year) {
    const idx = JSON.parse(await this.getText(`${year}/Index.json`, { maxAgeMs: 3600e3 }));
    const out = [];
    for (const m of idx.Meetings || []) {
      for (const s of m.Sessions || []) {
        if (!s.Path) continue;
        out.push({
          path: s.Path, type: s.Type, name: s.Name, start: s.StartDate, gmtOffset: s.GmtOffset,
          meeting: m.Name, location: m.Location, country: m.Country?.Name,
          // (the venue apart from the Grand Prix's name: F1's circuit key – 2026's "Bahrain Grand Prix" ran at Sepang)
          circuitKey: Number.isFinite(+m.Circuit?.Key) ? +m.Circuit.Key : null, circuit: m.Circuit?.ShortName || null,
        });
      }
    }
    return out;
  }

  // Progress events: { phase: "download", received, total, known } then { phase: "parse", done, total }.
  // All files download in parallel; "known" says how many file sizes are known yet.
  async loadSession(sessionPath, onProgress = () => {}) {
    const bytes = {};
    let lastSent = 0;
    const report = (force) => {
      const now = Date.now();
      if (!force && now - lastSent < 80) return;
      lastSent = now;
      let received = 0, total = 0;
      for (const [r, t] of Object.values(bytes)) { received += r; total += t; }
      onProgress({ phase: "download", received, total, known: Object.keys(bytes).length, files: TOPICS.length });
    };
    const failed = [];
    const texts = await Promise.all(TOPICS.map((topic) =>
      this.getText(`${sessionPath}${topic}.jsonStream`, { onBytes: (r, t) => { bytes[topic] = [r, t]; report(); } })
        .catch((e) => { bytes[topic] = [0, 0]; if (e.status !== 404 && e.status !== 403) failed.push(e); return ""; })));   // some topics are missing for some sessions
    report(true);
    const core = TOPICS.indexOf("TimingData");
    if (!texts[core]) {
      if (failed.length) throw failed[0];
      throw new Error("이 세션의 기록이 아직 공개되지 않았어요. 세션이 끝나고 잠시 뒤에 다시 시도해 주세요");
    }
    // A session still running (or just finished) is published bit by bit: don't keep a half file forever.
    const status = texts[TOPICS.indexOf("SessionStatus")] || "";
    if (failed.length || !/"Status":"(?:Finalised|Ends)"/.test(status)) {
      for (const topic of TOPICS) { try { fs.unlinkSync(this.cachePath(`${sessionPath}${topic}.jsonStream`)); } catch {} }
    }
    // A file with text but not one readable line is damaged (cut short or garbled on the way, or on disk). The core
    // topics are downloaded once more, then it's an error – never a replay that loads with nothing in it; a damaged
    // optional topic is left out (and out of the cache, so the next load fetches it again). Missing ones are fine.
    const topics = {}, damaged = [];
    const drop = (topic) => { try { fs.unlinkSync(this.cachePath(`${sessionPath}${topic}.jsonStream`)); } catch {} };
    for (const [i, topic] of TOPICS.entries()) {
      onProgress({ phase: "parse", done: i, total: TOPICS.length });
      await new Promise((r) => setImmediate(r));   // let the progress message go out before the heavy parse
      let lines = parseStream(texts[i], topic.endsWith(".z"));
      if (!lines.length && texts[i].trim()) {
        drop(topic);
        if (CORE.includes(topic)) {
          const again = await this.getText(`${sessionPath}${topic}.jsonStream`).catch(() => "");
          lines = parseStream(again, false);
          if (!lines.length) { drop(topic); throw new Error(`이 세션의 기록(${topic})을 읽을 수 없어요. 파일이 손상됐어요. 잠시 뒤 다시 시도해 주세요`); }
        } else damaged.push(topic);
      }
      if (topic === "Position.z") topics.PositionTracks = flattenTracks(lines);
      else if (topic === "CarData.z") topics.CarData = flattenCarData(lines);
      else topics[topic] = lines;
    }
    onProgress({ phase: "parse", done: TOPICS.length, total: TOPICS.length });
    let duration = 0;
    for (const [topic, list] of Object.entries(topics)) if (Array.isArray(list) && list.length) duration = Math.max(duration, list[list.length - 1][0]);
    for (const c of Object.values(topics.PositionTracks?.cars || {})) if (c.n) duration = Math.max(duration, c.t[c.n - 1]);
    return { topics, duration, damaged };
  }

  // Circuit outline for a location (e.g. "Baku"), traced from the most recent race or qualifying held there.
  // Used in live mode when car positions aren't available. Cached as a small JSON file.
  async findOutline(location, years) {
    const key = this.cachePath(`outline4_${location}.json`);   // "4": a real complete lap, with elevation
    try { return JSON.parse(fs.readFileSync(key, "utf8")); } catch {}
    for (const year of years) {
      let list = [];
      try { list = await this.listSessions(year); } catch { continue; }
      // Finished sessions only (a running session's file is still growing and would be cached half-done).
      // Races and qualifying first, then practice, newest first.
      const done = list.filter((x) => x.location === location && sessionUtc(x) < Date.now() - 2.5 * 3600e3);
      const main = (x) => /Race|Qualifying/.test(x.type);
      const ranked = [...done.filter(main).reverse(), ...done.filter((x) => !main(x)).reverse()];
      // A clean lap from the session: the cars with the most samples first (one may sit in the garage
      // all session, so the lap must actually close).
      for (const pick of ranked) {
        const text = await this.getText(`${pick.path}Position.z.jsonStream`).catch(() => "");
        const samples = flattenPositions(parseStream(text, true));
        if (samples.length < 1000) continue;
        const counts = {};
        for (const [, cars] of samples) for (const n of Object.keys(cars)) counts[n] = (counts[n] || 0) + 1;
        for (const [car] of Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
          const lap = findLap(samples.filter(([, c]) => c[car]).map(([, c]) => c[car]));
          if (lap) { fs.writeFileSync(key, JSON.stringify(lap)); return lap; }
        }
      }
    }
    return [];
  }
}

module.exports = { Archive, parseStream, flattenPositions, flattenTracks, flattenCarData, inflateZ, TOPICS };
