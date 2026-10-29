#!/usr/bin/env node
// Calibration / validation extract of one race (format: src/game/data/scenario.js CALIB_*). NEVER an engine input:
// it holds the race's outcome – lap times, stints, pit stops, SC/VSC periods, the final classification – to fit
// coefficients on calibration races and to compare the engine with validation races (DESIGN §0.6, §15, §16).
//
//   node src/game/tools/extract-calib.mjs <session path> [out.json]
//
// Per driver per lap: time, sectors (when the feed's three add up to the lap within 0.1 s), compound, tyre age, in/out
// lap, the lap's track status, position at its end; pit stops (pit lane time – PitLaneTimeCollection, stationary time –
// PitStopSeries); each driver's fastest clean lap as speed / throttle / brake / gear every 10 m of the scenario's s;
// SC / VSC / red periods (TrackStatus); race control's messages; the final order as the timing feed ended it.
import fs from "node:fs";
import path from "node:path";
import { loadReplay, normPath } from "./session.mjs";
import { buildScenario } from "./build-scenario.mjs";
import { cleanLaps, lapTelemetry, statusAt, wrapS } from "./buildlib.mjs";
import { CALIB_FORMAT, CALIB_VERSION, LAP_COLS, validateCalib } from "../data/scenario.js";

const rd = (v, k) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** k) / 10 ** k);
const toSec = (v) => { const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(v || "").trim()); return m ? (+(m[1] || 0)) * 60 + +m[2] : null; };
const KIND = { 1: "green", 2: "yellow", 4: "SC", 5: "red", 6: "VSC", 7: "VSC" };
const SEV = { green: 0, yellow: 1, VSC: 2, SC: 3, red: 4 };

// sector times per car per lap from the TimingData stream (a sector's Value as sent; sector 3 goes with the lap the
// counter closes – a report within 3 s after the counter moved belongs to the lap just completed)
function sectorTimes(r) {
  const cur = {}, out = {};
  for (const e of r.events) {
    if (e.topic !== "TimingData") continue;
    for (const [num, l] of Object.entries(e.data?.Lines || {})) {
      if (!l) continue;
      const c = cur[num] || (cur[num] = { n: 0, at: -Infinity });
      const S = l.Sectors;
      if (S && typeof S === "object") for (const k of [0, 1, 2]) {
        const v = (Array.isArray(S) ? S[k] : S[String(k)])?.Value; if (typeof v !== "string" || !v.trim()) continue;
        let lap = c.n + 1;
        if (k === 2) lap = l.NumberOfLaps != null ? +l.NumberOfLaps : e.ms - c.at < 3000 ? c.n : c.n + 1;
        ((out[num] || (out[num] = {}))[lap] || (out[num][lap] = [null, null, null]))[k] = toSec(v);
      }
      if (l.NumberOfLaps != null && +l.NumberOfLaps !== c.n) { c.n = +l.NumberOfLaps; c.at = e.ms; }
    }
  }
  return out;
}

export function extractCalib(r, built) {
  const { scenario, ctx, track } = built, { win, tl } = ctx;
  const rel = (ms) => rd((ms - win.start) / 1000, 3);
  const sec = sectorTimes(r);
  r.seek(r.endTime());
  const drivers = {};
  for (const e of scenario.entries) {
    const num = e.num, laps = r.laps(num, Infinity), pits = (r.pits(num, Infinity) || []).filter((p) => p.ms >= win.start - 60000);
    const inLaps = new Set(pits.map((p) => p.lap));
    // stints → per-lap compound and age (laps counted in order through the stints; age = the set's laps before the stint
    // (StartLaps) + laps run on it). From the final TimingAppData list (replay.js stints – ghost entries tidied).
    const st = r.stints(num) || [], perLap = {};
    let lapNo = 1;
    for (const [i, s] of st.entries()) {
      const nL = Math.max(0, (+s.TotalLaps || 0) - (+s.StartLaps || 0));
      for (let k = 0; k < nL; k++, lapNo++) perLap[lapNo] = { compound: s.Compound || null, age: (+s.StartLaps || 0) + k + 1, stint: i, isNew: s.New === "true" || s.New === true };
    }
    const out = [];
    for (let k = 0; k < laps.length; k++) {
      const L = laps[k], t1 = L.ms, t0 = k > 0 && laps[k - 1].lap === L.lap - 1 ? laps[k - 1].ms : L.lap === 1 ? win.start : null;
      let worst = "green";
      if (t0 != null) { worst = KIND[statusAt(tl, t0)] || "green"; for (const [m, s] of tl) { if (m <= t0) continue; if (m > t1) break; const kd = KIND[s] || "green"; if (SEV[kd] > SEV[worst]) worst = kd; } }
      const sc = sec[num]?.[L.lap] || null, sum = sc && sc.every((v) => v != null) ? sc[0] + sc[1] + sc[2] : null;
      const tyre = perLap[L.lap] || {};
      const okS = sum != null && L.sec && Math.abs(sum - L.sec) < 0.1;
      // (a row per lap in LAP_COLS order – scenario.js calibLaps turns them back into objects)
      out.push([L.lap, rd(L.sec, 3), okS ? rd(sc[0], 3) : null, okS ? rd(sc[1], 3) : null, okS ? rd(sc[2], 3) : null, tyre.compound ?? null, tyre.age ?? null, tyre.stint ?? null,
        inLaps.has(L.lap) ? 1 : 0, inLaps.has(L.lap - 1) || (L.lap === 1 && scenario.grid.pitLane.some((x) => x.num === num)) ? 1 : 0, worst, L.pos ?? null, rel(t1)]);
    }
    const stops = (r.pitStops(num, Infinity) || []).filter((p) => p.ms >= win.start - 60000).map((p) => ({ lap: p.lap, lane: p.lane ?? null, stationary: p.stop ?? null, t: rel(p.ms) }));
    drivers[num] = { tla: e.tla, team: e.team, laps: out, stops, pitEntries: pits.map((p) => ({ lap: p.lap, t: rel(p.ms) })),
      stints: st.map((s, i) => ({ i, compound: s.Compound || null, isNew: s.New === "true" || s.New === true, startLaps: +s.StartLaps || 0, totalLaps: +s.TotalLaps || 0 })) };
  }
  // fastest clean lap per driver, every 10 m of the scenario's s
  const BIN = 10, nb = Math.ceil(track.L / BIN), traces = {};
  for (const lp of cleanLaps(ctx, { perDriver: 1 })) {
    const tr = lapTelemetry(ctx, track.idx, lp); if (!tr) continue;
    // samples (~4 Hz: 15–25 m apart at speed) sorted by s, interpolated to each bin's centre (speed, throttle linearly;
    // brake, gear from the nearer sample); a bin further than 60 m from both neighbours is left empty
    const q = [...tr].sort((a, b) => a.s - b.s), m = q.length, V = [], T = [], B = [], G = [];
    let filled = 0;
    for (let k = 0, j = 0; k < nb; k++) {
      const s = (k + 0.5) * BIN;
      while (j < m && q[j].s < s) j++;
      const a = q[(j - 1 + m) % m], b = q[j % m], da = wrapS(s - a.s, track.L), db = wrapS(b.s - s, track.L);
      if (da + db > 60 || da + db <= 0) { V.push(null); T.push(null); B.push(null); G.push(null); continue; }
      const f = da / (da + db), near = f < 0.5 ? a : b;
      V.push(rd((a.v + (b.v - a.v) * f) * 3.6, 0)); T.push(Math.round(a.thr + (b.thr - a.thr) * f)); B.push(near.brk ? 1 : 0); G.push(near.gear); filled++;
    }
    traces[lp.num] = { lap: lp.lap, time: lp.sec, samples: m, coverage: rd(filled / nb, 3), bin: BIN, v: V, thr: T, brk: B, gear: G, units: { v: "km/h", thr: "%", brk: "0/1", gear: "-" } };
  }
  // neutral periods
  const periods = []; let cur = null;
  for (const [m, s] of tl) {
    const kd = KIND[s] || "green", neutral = kd === "SC" || kd === "VSC" || kd === "red";
    if (cur && (!neutral || kd !== cur.kind)) { cur.t1 = rel(m); cur.lapTo = r.raceLapAt(m); periods.push(cur); cur = null; }
    if (neutral && !cur) cur = { kind: kd, t0: rel(m), lapFrom: r.raceLapAt(m), code: s };
  }
  if (cur) { cur.t1 = rel(win.end); periods.push(cur); }
  // race control
  const rcm = (r.messages || []).map((m) => ({ t: m.Utc ? rel(r.msAt(Date.parse(m.Utc.endsWith("Z") ? m.Utc : m.Utc + "Z"))) : null, lap: m.Lap ?? null, cat: m.Category || null, flag: m.Flag || null, msg: m.Message || "" }));
  // the final order as the feed ended it (penalties applied after the session are not in it)
  const lines = r.state.TimingData?.Lines || {};
  const classification = Object.entries(lines).filter(([n]) => scenario.entries.some((e) => e.num === n)).map(([num, l]) => ({ pos: +l.Position || null, num, laps: +l.NumberOfLaps || 0, gap: typeof l.GapToLeader === "string" ? l.GapToLeader : null, retired: !!l.Retired, stopped: !!l.Stopped }))
    .sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
  const c = {
    format: CALIB_FORMAT, version: CALIB_VERSION, engineInput: false,
    note: "Calibration / validation only. Contains the race's outcome – never give this to the engine.",
    scenarioId: scenario.meta.id, sessionPath: scenario.meta.sessionPath, builtAt: scenario.meta.builtAt, trackL: scenario.track.L,
    lightsOutStreamMs: win.start, finishStreamMs: win.end, raceSeconds: rd((win.end - win.start) / 1000, 1),
    lapCols: LAP_COLS, drivers, traces, periods, raceControl: rcm, classification,
    sources: ["F1 live timing archive via the app's cache (TimingData, TimingAppData, PitLaneTimeCollection, PitStopSeries, TrackStatus, RaceControlMessages, CarData, Position)"],
  };
  return { calib: c, validation: validateCalib(c) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [p, out] = process.argv.slice(2);
  if (!p) { console.error("usage: extract-calib.mjs <session path> [out.json]"); process.exit(2); }
  const r = loadReplay(p), built = buildScenario(r, normPath(p));
  const { calib, validation } = extractCalib(r, built);
  const file = out || path.join(process.env.HOME, "projects/f1kr-work/v048/scenarios", `${calib.scenarioId}.calib.json`);
  fs.writeFileSync(file, JSON.stringify(calib));
  console.log(JSON.stringify({ file, bytes: fs.statSync(file).size, ok: validation.ok, errors: validation.errors.slice(0, 10) }, null, 1));
}
