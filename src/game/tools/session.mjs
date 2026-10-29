// Read-only access to the app's session cache for the offline game tools (node only, never the engine).
// Archive.loadSession would do, but it touches each cached file's mtime (getTextMeta → utimesSync, for pruning) and may
// fetch a missing topic over the network – the cache must stay untouched (BRIEF: read-only). So the cached files are read
// directly with fs.readFileSync and parsed with the archive's own parsers (same result as loadSession on a cached session).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parseStream, flattenTracks, flattenCarData, TOPICS } = require("../../main/archive.js");
export const RK = require("../../renderer/replay.js");

export const CACHE = path.join(os.homedir(), "Library/Application Support/f1-live-kr/cache");
// the archive's cache file name for a topic of a session ("2025/2025-07-06_British_Grand_Prix/2025-07-06_Race/")
const fileOf = (cache, sessionPath, topic) => path.join(cache, `${sessionPath}${topic}.jsonStream`.replace(/[^A-Za-z0-9._-]+/g, "_"));
export const normPath = (p) => (String(p).replace(/^\/+/, "").replace(/\/*$/, "/"));

// the cached race sessions: [{ path: "2025/…/…_Race/", name }]
export function cachedRaces(cache = CACHE, kinds = /_Race$/) {
  const set = new Set();
  for (const f of fs.readdirSync(cache)) {
    const m = /^(\d{4})_(\d{4}-\d\d-\d\d_.+?)_(\d{4}-\d\d-\d\d_[A-Za-z_]+?)_TimingData\.jsonStream$/.exec(f);
    if (m && kinds.test(m[3])) set.add(`${m[1]}/${m[2]}/${m[3]}/`);
  }
  return [...set].sort();
}
export function hasSession(sessionPath, cache = CACHE) { try { return fs.statSync(fileOf(cache, normPath(sessionPath), "TimingData")).size > 0; } catch { return false; } }

// → { topics, duration, missing: [topic] } like Archive.loadSession, without writing anything
export function loadCached(sessionPath, cache = CACHE) {
  sessionPath = normPath(sessionPath);
  const topics = {}, missing = [];
  for (const topic of TOPICS) {
    let text = "";
    try { text = fs.readFileSync(fileOf(cache, sessionPath, topic), "utf8"); } catch { missing.push(topic); }
    const lines = text ? parseStream(text, topic.endsWith(".z")) : [];
    if (topic === "Position.z") topics.PositionTracks = flattenTracks(lines);
    else if (topic === "CarData.z") topics.CarData = flattenCarData(lines);
    else topics[topic] = lines;
  }
  if (!topics.TimingData?.length) throw new Error(`not cached: ${sessionPath}`);
  let duration = 0;
  for (const list of Object.values(topics)) if (Array.isArray(list) && list.length) duration = Math.max(duration, list[list.length - 1][0]);
  for (const c of Object.values(topics.PositionTracks?.cars || {})) if (c.n) duration = Math.max(duration, c.t[c.n - 1]);
  return { topics, duration, missing };
}
export function loadReplay(sessionPath, cache = CACHE) { const d = loadCached(sessionPath, cache); const r = new RK.Replay(d); r.missingTopics = d.missing; return r; }
// the circuit corner file the app cached (MultiViewer API, read by src/main/circuit.js): { corners: [{n, x, y, angle}] } | null
export function cachedCircuit(key, year, cache = CACHE) {
  for (const y of [year, year - 1, year - 2, year + 1]) { try { return { ...JSON.parse(fs.readFileSync(path.join(cache, `circuit_${key}_${y}.json`), "utf8")), year: y }; } catch {} }
  return null;
}
