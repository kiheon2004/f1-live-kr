#!/usr/bin/env node
// Cached session → game scenario JSON (DESIGN §4, §15; format and validator: src/game/data/scenario.js).
//
//   node src/game/tools/build-scenario.mjs <session path, e.g. 2025/2025-07-06_British_Grand_Prix/2025-07-06_Race/> [out.json]
//
// Reads the app's session cache only (session.mjs: never writes, never fetches). Everything in the scenario is something
// known before the race starts (or the weather record, which the engine hides behind its forecast – DESIGN §9): the track
// from the field's positions, the entries, the starting order, the scheduled laps, the weather record, the compounds. The
// race's outcome (classification, pit laps, SC/VSC times) goes only to extract-calib.mjs's separate file.
import fs from "node:fs";
import path from "node:path";
import { loadReplay, normPath, cachedCircuit } from "./session.mjs";
import {
  BUILD, sessionContext, buildGeometry, timingReports, lineFromReports, cleanLaps, lapTelemetry, brakeMask, drsZones, buildPit, coverSpans,
  entriesOf, gridOf, lapsOf, weatherOf, compoundsSeen, venueOf, zonesFor, zoneSpans, estimateZones, aeroLock, cornerStations, ZONE, rotate, maskRuns, StationIndex, wrapS, inSpan,
} from "./buildlib.mjs";
import { SCENARIO_FORMAT, SCENARIO_VERSION, validateScenario } from "../data/scenario.js";

export const BUILDER_VERSION = "0.48.0-data.1";
const DM = 0.1;
const rd = (v, k) => (v == null || !Number.isFinite(v) ? v : Math.round(v * 10 ** k) / 10 ** k);
const col = (a, k) => Array.from(a, (v) => rd(v, k));

// → { scenario, ctx, track (in-memory, full precision: { st, idx, L, ds, n }), notes }
export function buildScenario(r, sessionPath, { builtAt = new Date().toISOString() } = {}) {
  sessionPath = normPath(sessionPath);
  const ctx = sessionContext(r);
  r.seek(ctx.win.start);
  const info = r.state.SessionInfo || {}, mt = info.Meeting || {};
  const season = +String(info.StartDate || sessionPath).slice(0, 4);
  const circuitKey = Number.isFinite(+mt.Circuit?.Key) ? +mt.Circuit.Key : null, location = mt.Location || null;
  const venue = venueOf({ circuitKey, location });
  const estimates = [], sources = [];
  const ent = entriesOf(r, ctx.win.start);

  // ---- geometry, then the start/finish line, then everything along the lap from it
  const g = buildGeometry(ctx, { location });
  let { x, y, z, hdg, n, ds, L } = g.st;
  let kappa = g.kappa, kappaLine = g.kappaLine, grade = g.grade, wL = g.wL, wR = g.wR, line = g.line;
  const idx0 = new StationIndex(x, y, hdg, ds);
  const rep = timingReports(ctx, idx0);
  const lap0 = lineFromReports(rep.lap, L);
  if (!lap0) throw new Error(`too few lap reports to find the timing line (${rep.lap.length})`);
  const k0 = Math.round(lap0.s / ds) % n;
  [x, y, z, hdg, kappa, kappaLine, grade, wL, wR, line] = [x, y, z, hdg, kappa, kappaLine, grade, wL, wR, line].map((a) => rotate(a, k0));
  const shift = k0 * ds, rel = (s) => wrapS(s - shift, L);
  const idx = new StationIndex(x, y, hdg, ds); idx.z = z;
  const s1 = lineFromReports(rep.s1, L), s2 = lineFromReports(rep.s2, L);
  let sectors = s1 && s2 ? [rel(s1.s), rel(s2.s)] : null, sectorsEst = false;
  if (!sectors || !(sectors[0] > 0 && sectors[0] < sectors[1])) { sectors = [L / 3, (2 * L) / 3]; sectorsEst = true; estimates.push("track.zones.sectors: thirds of the lap (sector reports unusable)"); }

  // ---- telemetry over the lap: braking stations from each driver's fastest clean laps
  const laps = cleanLaps(ctx, { perDriver: 3 }), traces = laps.map((lp) => lapTelemetry(ctx, idx, lp)).filter(Boolean);
  const brake = brakeMask(traces, n, ds), brakeRuns = maskRuns(brake, ds);

  // ---- DRS (2011–2025: where the telemetry's flap opens) / Straight Mode (2026)
  const hasDrs = Object.values(r.car || {}).some((c) => c.drs && c.drs.some((v) => v !== 255));
  let drs = [], drsNote = null;
  if (season <= 2025 && hasDrs) {
    const dz = drsZones(ctx, idx, L);
    drs = dz.zones.map((zn) => {
      // detection point: not in any feed – estimated as the start of the last braking zone before the activation point
      // (FIA detection lines usually sit shortly before the corner leading onto the zone) – confidence L
      let det = null, best = Infinity; for (const [a] of brakeRuns) { const back = wrapS(zn.start - a, L); if (back > 30 && back < 1500 && back < best) { best = back; det = a; } }
      return { detect: det != null ? rd(det, 1) : rd(wrapS(zn.start - 300, L), 1), start: zn.start, end: zn.end, detectEst: true, startEst: true, endEst: true, runs: zn.runs, cars: zn.cars };
    });
    drsNote = { how: "CarData channel 45 ≥ 10 runs over green racing laps: start = 10th percentile of run starts, end = median run end; detection = estimated", runs: dz.runs };
    estimates.push("track.zones.drs: activation from telemetry (start ~ +latency/reaction, end = where the field brakes); detection points estimated (L)");
  } else if (season <= 2025) drsNote = { how: "no DRS channel in this session's telemetry" };
  const circ = circuitKey != null ? cachedCircuit(circuitKey, season) : null;
  const pts = Array.from(x, (v, i) => ({ x: v, z: y[i] })), cum = Array.from({ length: n }, (_, i) => i * ds);
  const corners = circ?.corners?.length ? cornerStations(circ.corners.map((c) => ({ n: c.n, x: c.x * DM, z: c.y * DM })), pts, cum, L) : [];
  let straight = [], straightNote = null;
  if (season >= 2026) {
    if (aeroLock(venue?.key, season)) straightNote = { how: "Straight Mode locked for this event (aero.js LOCKS)" };
    else {
      const zz = zonesFor(venue?.key, season);
      if (zz && corners.length) {
        straight = zoneSpans(zz.zones, corners, L).map((sp) => ({ start: rd(sp.a, 1), end: rd(sp.b, 1), id: sp.z.id, official: true, t1: !!sp.z.t1, low: sp.z.low !== false }));
        straightNote = { how: "aero.js ZONES (official maps) placed by corner", src: zz.src, conf: zz.conf };
      } else {
        straight = estimateZones(pts, cum, L).map((sp, i) => ({ start: rd(sp.a, 1), end: rd(sp.b, 1), id: `E${i + 1}`, official: false, est: true }));
        straightNote = { how: "aero.js estimateZones (long straights) – no official map in aero.js ZONES", est: true };
        estimates.push("track.zones.straight: estimated from straights (aero.js estimateZones)");
      }
    }
  }

  // ---- pit lane, covered stretches
  const pitR = buildPit(ctx, idx, L, { circuitKey, season, teams: ent.map((e) => e.team).filter(Boolean) });
  const pit = pitR.pit;
  if (pit) { estimates.push("track.pit.speedLimit: measured from telemetry, not an official document"); if (Object.keys(pit.boxes).length < ent.length / 2) estimates.push("track.pit.boxes: incomplete – pitorder.js has no measurement for this circuit/season"); }
  const cover = coverSpans(venue?.key, location, idx, L);

  // ---- zone bits
  const zone = new Uint32Array(n);
  const mark = (a, b, bit) => { for (let i = 0; i < n; i++) if (inSpan(i * ds, a, b)) zone[i] |= bit; };
  for (let i = 0; i < n; i++) { if (brake[i]) zone[i] |= ZONE.BRAKE; const s = i * ds; zone[i] |= s < sectors[0] ? ZONE.SECTOR1 : s < sectors[1] ? ZONE.SECTOR2 : ZONE.SECTOR3; }
  for (const d of drs) mark(d.start, d.end, ZONE.DRS);
  for (const d of straight) mark(d.start, d.end, ZONE.STRAIGHT_MODE);
  for (const c of cover.spans) mark(c.a, c.b, ZONE.COVER);
  if (pit) { mark(wrapS(pit.sIn - 50, L), wrapS(pit.sIn + 50, L), ZONE.PIT_ENTRY); mark(wrapS(pit.sOut - 50, L), wrapS(pit.sOut + 50, L), ZONE.PIT_EXIT); }

  estimates.push(`track.wL/wR: lower bound from the field's lateral spread, at least the circuit default ${g.widthDefault} m (map3d.js CIRCUIT_STYLE) – measured on ${(g.widthMeasured * 100).toFixed(0)} % of the lap${g.snapped ? " (positions snapped to a line: default width everywhere)" : ""}`);
  estimates.push(`track.line / kappaLine: minimum-curvature line between the (estimated) edges, car centre ≥ ${BUILD.lineMargin} m inside – a geometric estimate of the racing line, not measured`);
  if (lap0.est) estimates.push("track s = 0: the feed's typical report delay used (no SC/VSC speed spread in this session to fit it)");

  // ---- entries, grid, laps, weather, tyres
  const grid = gridOf(r, ctx.win, ent, idx), lapsInfo = lapsOf(r, ctx.win), weather = weatherOf(r, ctx.win), comps = compoundsSeen(r);
  if (weather.gaps.length) estimates.push(`weather: ${weather.gaps.length} gap(s) > 90 s without a record (weather.gaps) – the engine interpolates there and marks it estimated`);
  estimates.push("weather.rain: the feed's Rainfall is 0/1 – intensity is an engine estimate");
  sources.push(
    { what: "track, pit lane, timing lines, DRS, grid, entries, laps, weather, compounds", src: `F1 live timing archive (livetiming.formula1.com/static/${sessionPath}) via the app's local cache, read-only` },
    { what: "corner numbers", src: circ ? `MultiViewer circuit API (api.multiviewer.app) as cached by the app: circuit_${circuitKey}_${circ.year}.json` : "none cached" },
    { what: "team pit boxes", src: "src/renderer/pitorder.js (measured from F1 data + the constructors' order rule)" },
    { what: "width defaults", src: "src/renderer/map3d.js CIRCUIT_STYLE (estimates)" },
  );
  if (straightNote?.src) sources.push({ what: "2026 Straight Mode zones", src: `src/renderer/aero.js ZONES: ${straightNote.src}` });
  if (cover.spans.length) sources.push({ what: "covered stretches", src: `src/renderer/tunnel.js TUNNELS (OSM) via ${cover.fit}` });

  const date = String(info.StartDate || "").slice(0, 10);
  const id = sessionPath.split("/").slice(1, 3).join("_").replace(/[^A-Za-z0-9_-]+/g, "_");
  const scenario = {
    format: SCENARIO_FORMAT, version: SCENARIO_VERSION,
    meta: {
      id, season, round: Number.isFinite(+mt.Number) ? +mt.Number : null, event: mt.Name || null, officialName: mt.OfficialName || null, session: info.Name || null, date,
      startUtc: info.StartDate && info.GmtOffset ? new Date(Date.parse(info.StartDate + "Z") - (/^-/.test(info.GmtOffset) ? -1 : 1) * ((+info.GmtOffset.replace("-", "").slice(0, 2)) * 3600e3 + (+info.GmtOffset.replace("-", "").slice(3, 5)) * 60e3)).toISOString() : null,
      circuitKey, location, venue: venue ? { key: venue.key, short: venue.short, name: venue.name } : null, country: mt.Country?.Name || null,
      sessionPath, builtAt, builder: `src/game/tools/build-scenario.mjs ${BUILDER_VERSION}`, sources, estimates,
      missingTopics: r.missingTopics || [],
    },
    track: {
      n, ds, L,
      frame: "F1 Position frame in metres (feed decimetres × 0.1), not re-centred; hdg = atan2(dy, dx); + left; kappa = dhdg/ds",
      columns: { x: col(x, 2), y: col(y, 2), z: col(z, 2), hdg: col(hdg, 4), kappa: col(kappa, 6), grade: col(grade, 5), wL: col(wL, 2), wR: col(wR, 2), line: col(line, 2), kappaLine: col(kappaLine, 6), zone: Array.from(zone) },
      smoothing: { posSigma: BUILD.posSigma, kappaSigma: BUILD.kappaSigma, zSigma: BUILD.zSigma, units: "m (Gaussian σ along the lap)" },
      startLine: { method: "TimingData lap reports: the car's place at the report vs its speed – s = s_line + v·δ, intercept at v = 0", ...lap0, s: undefined, rotatedBy: rd(shift, 1), roundingErr: rd(lap0.s - shift, 2) },
      sectorLines: { s1: s1 ? { ...s1, s: rd(rel(s1.s), 1) } : null, s2: s2 ? { ...s2, s: rd(rel(s2.s), 1) } : null, est: sectorsEst },
      corners: corners.map((c) => ({ n: c.n, s: rd(c.s, 1) })),
      zones: {
        drs, drsNote,
        straight, straightNote,
        sectors: sectors.map((s) => rd(s, 1)),
        cover: cover.spans.map((c) => [rd(c.a, 1), rd(c.b, 1)]), coverInfo: cover.spans.map((c) => ({ id: c.id, name: c.name, len: rd(c.len, 1), specLen: c.specLen, off: c.off })), coverNote: cover.note,
        brake: brakeRuns.map(([a, b]) => [rd(a, 1), rd(b, 1)]),
      },
      pit: pit ? {
        n: pit.n, ds: rd(pit.ds, 4), L: rd(pit.L, 2),
        columns: { u: col(pit.u, 2), x: col(pit.x, 2), y: col(pit.y, 2), z: col(pit.z, 2), hdg: col(pit.hdg, 4), sLap: col(pit.sLap, 1) },
        sIn: rd(pit.sIn, 1), sOut: rd(pit.sOut, 1), limStart: rd(pit.limStart, 1), limEnd: rd(pit.limEnd, 1), speedLimit: rd(pit.speedLimit, 3), speedLimitSrc: pit.speedLimitSrc,
        boxes: pit.boxes, boxInfo: pit.boxInfo, stats: pit.stats,
      } : null,
      pitNote: pit ? null : pitR.why,
      est: { wL: true, wR: true, line: true, kappaLine: true, kappa: false, z: false, drsDetect: true, pitSpeedLimit: true },
      stats: { seedLap: g.lapFrom, seedDropped: g.seedDropped, passLog: g.passLog, finalSamples: g.finalSamples, zCoverage: g.zCoverage, widthMeasured: g.widthMeasured, snapped: g.snapped, widthDefault: g.widthDefault, totalTurnRad: rd(g.turn, 3), cleanLaps: traces.length, telemetryLag: ctx.lag },
    },
    entries: ent.map(({ line: _l, ...e }) => e),
    grid,
    race: { laps: lapsInfo.laps, lapsSource: lapsInfo.source, standingStart: grid.standing },
    weather,
    tyres: { compoundsSeen: comps, compoundsSource: "TimingAppData stint compounds seen in this session", nominations: null, nominationsSource: null },
  };
  const v = validateScenario(scenario);
  return { scenario, ctx, track: { x, y, z, hdg, kappa, idx, L, ds, n, sectors }, validation: v, traces, laps };
}

// ---- CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const [p, out] = process.argv.slice(2);
  if (!p) { console.error("usage: build-scenario.mjs <session path> [out.json]"); process.exit(2); }
  const r = loadReplay(p);
  const { scenario, validation } = buildScenario(r, p);
  const file = out || path.join(process.env.HOME, "projects/f1kr-work/v048/scenarios", `${scenario.meta.id}.scenario.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(scenario));
  console.log(JSON.stringify({ file, bytes: fs.statSync(file).size, L: scenario.track.L, n: scenario.track.n, ok: validation.ok, errors: validation.errors.slice(0, 10), warnings: validation.warnings }, null, 1));
  if (!validation.ok) process.exit(1);
}
