// Scenario format (DESIGN §4, §15): what the engine may know about a race before it starts – the track built from that
// session's own position data, the entry list, the starting order, the scheduled laps, the weather record and the tyre
// compounds. Never the result: the final classification, the real pit laps and the real SC/VSC times live only in the
// separate calibration/validation extract (CALIB below; tools/extract-calib.mjs) and are refused here.
// Pure (no node / DOM): the engine, the screens and the tools all validate with this.

export const SCENARIO_FORMAT = "f1kr-game-scenario";
export const SCENARIO_VERSION = 1;
export const CALIB_FORMAT = "f1kr-game-calib";
export const CALIB_VERSION = 1;

// Per-sample zone bits of track.columns.zone (engine/track.js re-exports these)
export const ZONE = {
  BRAKE: 1 << 0,          // the fastest laps' telemetry shows the brake on here (≥ half of them)
  DRS: 1 << 1,            // a DRS activation zone (2011–2025), from where the telemetry's flap opens
  STRAIGHT_MODE: 1 << 2,  // a 2026 Straight Mode activation zone (official where aero.js lists it, else estimated)
  PIT_ENTRY: 1 << 3,      // the lap stretch where the pit lane branches off (sIn − 50 m … sIn + 50 m)
  PIT_EXIT: 1 << 4,       // where it joins again (sOut − 50 m … sOut + 50 m)
  COVER: 1 << 5,          // covered from the sky (Monaco's tunnel): no rain falls on it
  SECTOR1: 1 << 6, SECTOR2: 1 << 7, SECTOR3: 1 << 8,
};

// track columns (all length n): name → [min, max] plausible range
export const TRACK_COLUMNS = {
  x: [-1e5, 1e5], y: [-1e5, 1e5], z: [-2000, 3000],   // m (F1 Position frame × 0.1)
  hdg: [-Math.PI - 1e-3, Math.PI + 1e-3],             // rad, atan2(dy, dx)
  kappa: [-0.25, 0.25],                               // 1/m (+ left); |κ| ≤ 0.25 = radius ≥ 4 m
  grade: [-0.25, 0.25],                               // dz/ds
  wL: [0.5, 30], wR: [0.5, 30],                       // m from the lap line to the left / right edge (estimate)
  line: [-20, 20],                                    // m, racing line's lateral offset (+ left, estimate)
  kappaLine: [-0.25, 0.25],                           // 1/m, curvature of the racing line (optional; estimate)
  zone: [0, 2 ** 31 - 1],
};
const OPTIONAL = new Set(["kappaLine"]);
export const PIT_COLUMNS = { u: [0, 5000], x: [-1e5, 1e5], y: [-1e5, 1e5], z: [-2000, 3000], hdg: [-Math.PI - 1e-3, Math.PI + 1e-3], sLap: [0, 1e5] };

// keys that would carry the race's outcome into an engine input (anywhere in a scenario)
export const FORBIDDEN_KEYS = ["result", "results", "classification", "finalClassification", "finishOrder", "pitLaps", "pitStops", "stints", "scPeriods", "safetyCar", "neutralPeriods", "trackStatus", "lapTimes", "raceControl", "winner"];

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
function forbiddenPaths(o, at = "", out = []) {
  if (!o || typeof o !== "object") return out;
  if (Array.isArray(o)) { if (o.length && typeof o[0] === "object") o.forEach((v, i) => forbiddenPaths(v, `${at}[${i}]`, out)); return out; }
  for (const [k, v] of Object.entries(o)) { if (FORBIDDEN_KEYS.includes(k)) out.push(`${at}.${k}`); forbiddenPaths(v, `${at}.${k}`, out); }
  return out;
}
function checkColumns(cols, spec, n, where, err) {
  if (!cols || typeof cols !== "object") { err.push(`${where}: missing`); return; }
  for (const [k, [lo, hi]] of Object.entries(spec)) {
    const a = cols[k];
    if (a == null && OPTIONAL.has(k)) continue;
    if (!a || typeof a.length !== "number") { err.push(`${where}.${k}: missing`); continue; }
    if (a.length !== n) { err.push(`${where}.${k}: length ${a.length} ≠ ${n}`); continue; }
    for (let i = 0; i < n; i++) if (!isNum(a[i]) || a[i] < lo || a[i] > hi) { err.push(`${where}.${k}[${i}] = ${a[i]} outside [${lo}, ${hi}]`); break; }
  }
}
const inLap = (s, L) => isNum(s) && s >= 0 && s < L;

// → { ok, errors: [string], warnings: [string] }
export function validateScenario(sc) {
  const err = [], warn = [];
  if (!sc || typeof sc !== "object") return { ok: false, errors: ["not an object"], warnings: [] };
  if (sc.format !== SCENARIO_FORMAT) err.push(`format ${sc.format} ≠ ${SCENARIO_FORMAT}`);
  if (sc.version !== SCENARIO_VERSION) err.push(`version ${sc.version} ≠ ${SCENARIO_VERSION} (rebuild with tools/build-scenario.mjs)`);
  for (const p of forbiddenPaths(sc)) err.push(`${p}: a race outcome must not be in a scenario (it belongs in the calibration extract)`);
  const m = sc.meta || {};
  for (const k of ["id", "season", "event", "sessionPath", "builtAt"]) if (m[k] == null || m[k] === "") err.push(`meta.${k}: missing`);
  if (!Array.isArray(m.sources) || !m.sources.length) err.push("meta.sources: missing");
  if (!Array.isArray(m.estimates)) err.push("meta.estimates: missing");
  // track
  const t = sc.track || {};
  const n = t.n, L = t.L;
  if (!Number.isInteger(n) || n < 100) err.push(`track.n: ${n}`);
  if (!isNum(L) || L < 1000 || L > 9000) err.push(`track.L: ${L} (a Grand Prix lap is 3–7.1 km)`);
  if (!isNum(t.ds) || t.ds < 1 || t.ds > 4) err.push(`track.ds: ${t.ds}`);
  if (Number.isInteger(n) && isNum(L) && isNum(t.ds) && Math.abs(n * t.ds - L) > 1e-3 * L) err.push(`track: n·ds = ${n * t.ds} ≠ L = ${L}`);
  if (Number.isInteger(n)) checkColumns(t.columns, TRACK_COLUMNS, n, "track.columns", err);
  if (t.columns?.x && t.columns?.y && Number.isInteger(n) && n > 2) {
    let worst = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n, d = Math.hypot(t.columns.x[j] - t.columns.x[i], t.columns.y[j] - t.columns.y[i]); worst = Math.max(worst, Math.abs(d - t.ds)); }
    if (worst > t.ds * 0.5) err.push(`track: sample spacing off by ${worst.toFixed(2)} m somewhere (not a closed even lap)`);
  }
  const z = t.zones || {};
  if (!Array.isArray(z.sectors) || z.sectors.length !== 2 || !z.sectors.every((s) => inLap(s, L)) || !(z.sectors[0] < z.sectors[1])) err.push(`track.zones.sectors: ${JSON.stringify(z.sectors)} (two ends 0 < s1 < s2 < L)`);
  for (const k of ["drs", "straight", "cover", "brake"]) if (!Array.isArray(z[k])) err.push(`track.zones.${k}: missing`);
  for (const d of z.drs || []) if (!inLap(d.start, L) || !inLap(d.end, L) || (d.detect != null && !inLap(d.detect, L))) err.push(`track.zones.drs: ${JSON.stringify(d)}`);
  for (const d of z.straight || []) if (!inLap(d.start, L) || !inLap(d.end, L)) err.push(`track.zones.straight: ${JSON.stringify(d)}`);
  for (const c of z.cover || []) if (!Array.isArray(c) || !inLap(c[0], L) || !inLap(c[1], L)) err.push(`track.zones.cover: ${JSON.stringify(c)}`);
  // pit
  const p = t.pit;
  if (p == null) warn.push("track.pit: none (no pit lane could be measured)");
  else {
    if (!Number.isInteger(p.n) || p.n < 10) err.push(`track.pit.n: ${p.n}`);
    else checkColumns(p.columns, PIT_COLUMNS, p.n, "track.pit.columns", err);
    if (!isNum(p.L) || p.L < 150 || p.L > 1500) err.push(`track.pit.L: ${p.L}`);
    for (const k of ["sIn", "sOut"]) if (!inLap(p[k], L)) err.push(`track.pit.${k}: ${p[k]}`);
    for (const k of ["limStart", "limEnd"]) if (!isNum(p[k]) || p[k] < 0 || p[k] > p.L) err.push(`track.pit.${k}: ${p[k]}`);
    if (isNum(p.limStart) && isNum(p.limEnd) && !(p.limStart < p.limEnd)) err.push("track.pit: limiter starts after it ends");
    if (p.speedLimit != null && (!isNum(p.speedLimit) || p.speedLimit < 10 || p.speedLimit > 30)) err.push(`track.pit.speedLimit: ${p.speedLimit} m/s`);
    for (const [k, u] of Object.entries(p.boxes || {})) if (!isNum(u) || u < 0 || u > p.L) err.push(`track.pit.boxes.${k}: ${u}`);
  }
  // entries, grid, race
  const E = sc.entries;
  if (!Array.isArray(E) || E.length < 2) err.push("entries: missing");
  else {
    const nums = new Set();
    for (const e of E) { if (!/^\d{1,2}$/.test(String(e.num))) err.push(`entries: bad number ${e.num}`); if (nums.has(e.num)) err.push(`entries: ${e.num} twice`); nums.add(e.num); if (!e.team) warn.push(`entries: ${e.num} has no team`); }
    const g = sc.grid || {};
    if (!Array.isArray(g.slots)) err.push("grid.slots: missing");
    else {
      const seen = new Set();
      for (const s of g.slots) { if (!nums.has(s.num)) err.push(`grid: ${s.num} not an entry`); if (seen.has(s.num)) err.push(`grid: ${s.num} twice`); seen.add(s.num); if (!(Number.isInteger(s.pos) && s.pos >= 1)) err.push(`grid: bad slot ${s.pos}`); }
      for (const x of g.pitLane || []) { if (!nums.has(x.num)) err.push(`grid.pitLane: ${x.num} not an entry`); if (seen.has(x.num)) err.push(`grid: ${x.num} both on the grid and in the pit lane`); }
    }
  }
  const R = sc.race || {};
  if (!Number.isInteger(R.laps) || R.laps < 1 || R.laps > 100) err.push(`race.laps: ${R.laps}`);
  // weather
  const W = sc.weather;
  if (!W || !W.cols) err.push("weather: missing");
  else {
    const k = W.cols.t?.length ?? -1;
    for (const c of ["t", "air", "track", "humidity", "pressure", "windSpeed", "windDir", "rain"]) if (!Array.isArray(W.cols[c]) || W.cols[c].length !== k) err.push(`weather.cols.${c}: length`);
    for (let i = 1; i < k; i++) if (!(W.cols.t[i] > W.cols.t[i - 1])) { err.push(`weather.cols.t not increasing at ${i}`); break; }
    for (const v of W.cols.rain || []) if (v != null && v !== 0 && v !== 1) { err.push(`weather.rain: ${v}`); break; }
    if (!k) warn.push("weather: no records");
  }
  if (!sc.tyres || !Array.isArray(sc.tyres.compoundsSeen)) err.push("tyres.compoundsSeen: missing");
  return { ok: err.length === 0, errors: err, warnings: warn };
}

// a calibration extract's per-lap row: column order (drivers[num].laps = [[…], …])
export const LAP_COLS = ["lap", "time", "s1", "s2", "s3", "compound", "age", "stint", "pitIn", "pitOut", "status", "pos", "tEnd"];
// → [{ lap, time, s1, …, pitIn: bool, pitOut: bool }]
export function calibLaps(calib, num) {
  const cols = calib.lapCols || LAP_COLS;
  return (calib.drivers?.[num]?.laps || []).map((r) => { const o = {}; cols.forEach((k, i) => { o[k] = r[i]; }); o.pitIn = !!o.pitIn; o.pitOut = !!o.pitOut; return o; });
}

// The calibration / validation extract: per driver per lap, pit stops, neutral periods, the fastest clean lap's traces,
// the final classification. Validation-only – never an engine input.
export function validateCalib(c) {
  const err = [];
  if (!c || c.format !== CALIB_FORMAT) err.push(`format ${c?.format}`);
  if (c?.version !== CALIB_VERSION) err.push(`version ${c?.version}`);
  if (c?.engineInput !== false) err.push("engineInput must be false");
  if (!c?.scenarioId) err.push("scenarioId: missing");
  if (!c?.drivers || typeof c.drivers !== "object") err.push("drivers: missing");
  else for (const [num, d] of Object.entries(c.drivers)) {
    if (!Array.isArray(d.laps)) { err.push(`drivers.${num}.laps: missing`); continue; }
    const cols = c.lapCols || LAP_COLS;
    if (d.laps.some((r) => !Array.isArray(r) || r.length !== cols.length)) { err.push(`drivers.${num}.laps: rows must have ${cols.length} columns`); continue; }
    for (let i = 1; i < d.laps.length; i++) if (!(d.laps[i][0] > d.laps[i - 1][0])) { err.push(`drivers.${num}.laps not in order at ${i}`); break; }
  }
  if (!Array.isArray(c?.classification)) err.push("classification: missing");
  return { ok: err.length === 0, errors: err };
}
