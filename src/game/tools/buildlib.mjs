// The scenario builder's data work over one cached session (node tools only, never the engine): the race window, who
// was in the pit lane when, the track built from the field's own positions, the timing lines, zones from telemetry, the
// pit lane. Everything read from a Replay (src/renderer/replay.js) built from the read-only cache (session.mjs).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { closedCum, resampleClosed, smoothClosed, headings, curvature, gradient, rotate, StationIndex, binnedFit, maskRuns, inSpan, wrapS, median, quantile, totalTurn, minCurvatureLine, wrapAngle } from "./trackgeo.mjs";
import { CACHE, cachedCircuit } from "./session.mjs";
import { venueOf } from "../../renderer/venues.js";
import { zonesFor, zoneSpans, estimateZones, aeroLock } from "../../renderer/aero.js";
import { cornerStations } from "../../renderer/corners.js";
import { orderedBoxes, teamKey } from "../../renderer/pitorder.js";
import { START_DATA } from "../../renderer/startdata.js";
import { StartHistory, carKind } from "../../renderer/startplan.js";
import { ZONE } from "../data/scenario.js";
const require = createRequire(import.meta.url);

const DM = 0.1;
export const BUILD = {
  ds: 2,              // m between track samples (DESIGN §4)
  posSigma: 3,        // m – Gaussian on the field-averaged x, y (removes the averaging's residual ripple; a 15 m hairpin's apex moves < 0.3 m)
  kappaSigma: 8,      // m – Gaussian on the curvature (DESIGN §4: 6–10 m; positions are good to ~1–2 m). Checked against telemetry minimum speeds (report)
  zSigma: 20,         // m – Gaussian on the heights (the feed's Z jitters by a metre or more; the live buildWorld averages ±20 m)
  maxLat: 20,         // m – a position further than this from the lap line is not on it (pit lane, run-off, another stretch)
  maxDz: 5,           // m – nor one this far above/below it (a bridge / an underpass)
  pitMargin: 8000,    // ms – positions this long before/after a car's InPit flag count as the pit lane
  passes: 2,          // field-averaging passes before the final statistics pass
  lineMargin: 1.3,    // m – the racing line's car centre stays this far inside the edges (half the 2.0 m car width + 0.3 m)
  reportLatency: 0.48, // s – the timing feed's typical delay from a line crossing to its report (median of the 25 per-session fits with an SC/VSC speed spread, 0.17–0.62 s – data.md)
};
// Road width defaults (m) where the data can't show the tarmac: the live 3D view's own per-circuit values (map3d.js
// CIRCUIT_STYLE, v0.47, keyed by F1's Location) – estimates, never measured; 14 m elsewhere (map3d TRACK_W).
export const WIDTH_DEFAULT = { "Monte Carlo": 9, "Monaco": 9, "Baku": 11, "Marina Bay": 12, "Singapore": 12, "Las Vegas": 14, "Jeddah": 12, "Montréal": 11, "Montreal": 11, "Madrid": 13, "Melbourne": 13, "Miami": 13, "Miami Gardens": 13 };
export const widthDefault = (location) => WIDTH_DEFAULT[location] || 14;

// ---------- session facts ----------
// sorted [[a, b]] intervals with a point query
export class Intervals {
  constructor(list = []) { this.list = list.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]); }
  has(t) { const L = this.list; let lo = 0, hi = L.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (L[m][1] < t) lo = m + 1; else if (L[m][0] > t) hi = m - 1; else return true; } return false; }
}
// per car: its TimingData flag (InPit / Retired / Stopped / PitOut) as on-intervals [[from, to]]
export function flagIntervals(r, flag, margin = 0) {
  const on = {}, out = {};
  for (const e of r.events) {
    if (e.topic !== "TimingData") continue;
    for (const [num, l] of Object.entries(e.data?.Lines || {})) {
      if (!l || l[flag] == null) continue;
      const v = !!l[flag];
      if (v && on[num] == null) on[num] = e.ms;
      else if (!v && on[num] != null) { (out[num] || (out[num] = [])).push([on[num] - margin, e.ms + margin]); on[num] = null; }
    }
  }
  for (const [num, a] of Object.entries(on)) if (a != null) (out[num] || (out[num] = [])).push([a - margin, Infinity]);
  const res = {}; for (const [n, l] of Object.entries(out)) res[n] = new Intervals(l);
  return res;
}
// TrackStatus over time: [[ms, code]] ("1" green, "2" yellow, "4" SC, "5" red, "6" VSC, "7" VSC ending)
export function statusTimeline(r) { return r.events.filter((e) => e.topic === "TrackStatus" && e.data?.Status).map((e) => [e.ms, String(e.data.Status)]); }
export function statusAt(tl, t) { let v = "1"; for (const [m, s] of tl) { if (m > t) break; v = s; } return v; }
// non-green (SC, VSC, red) intervals
export function neutralIntervals(tl, end) {
  const out = []; let from = null;
  for (const [m, s] of tl) { const bad = s === "4" || s === "5" || s === "6" || s === "7"; if (bad && from == null) from = m; else if (!bad && from != null) { out.push([from, m]); from = null; } }
  if (from != null) out.push([from, end]);
  return new Intervals(out);
}
// The race window: lights out (the race clock first running – startplan.js reads the same) to the chequered flag
// (SessionStatus "Finished"; else the data's end)
export function raceWindow(r) {
  const start = r.startTime();
  let end = null; for (const e of r.events) if (e.topic === "SessionStatus" && e.data?.Status === "Finished" && e.ms > start) { end = e.ms; break; }
  return { start, end: end ?? r.endTime() };
}
// The positions' clock against the telemetry's (ms): CarData at t + lag matches the positions at t (the same method as
// the live smooth.js telemetryLag: the lag that best matches position-derived speeds to the speed channel).
export function telemetryLag(r) {
  const pairs = [];
  for (const [num, c] of Object.entries(r.tracks.cars)) {
    const car = r.car?.[num];
    if (!car || !car.t || car.t.length < 100 || c.n < 200) continue;
    for (let k = 2; k < c.n - 2; k += 7) {
      const dt = c.t[k + 2] - c.t[k - 2]; if (dt <= 0 || dt > 2500) continue;
      const v = (Math.hypot(c.x[k + 2] - c.x[k - 2], c.y[k + 2] - c.y[k - 2]) * DM) / (dt / 1000) * 3.6;
      if (v > 60 && v < 360) pairs.push([c.t[k], v, car]);
    }
    if (pairs.length > 6000) break;
  }
  if (pairs.length < 300) return { lag: 0, measured: false };
  const speedAt = (car, t) => { const T = car.t; let lo = 0, hi = T.length - 1; if (t <= T[0] || t >= T[hi]) return null; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; } const f = (t - T[lo]) / (T[hi] - T[lo] || 1); return car.v[lo] + (car.v[hi] - car.v[lo]) * f; };
  let best = 0, bestErr = Infinity;
  for (let lag = -2500; lag <= 2500; lag += 50) {
    const err = []; for (const [t, v, car] of pairs) { const w = speedAt(car, t + lag); if (w != null) err.push(Math.abs(w - v)); }
    const med = median(err); if (med < bestErr) { bestErr = med; best = lag; }
  }
  return { lag: best, measured: true, medianErrKmh: +bestErr.toFixed(2) };
}
// telemetry sample index at or before t
export function sampleIdx(T, t) { let lo = 0, hi = T.length - 1; if (hi < 0 || T[0] > t) return -1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= t) lo = m; else hi = m - 1; } return lo; }
export function speedAt(car, t) { if (!car) return null; const i = sampleIdx(car.t, t); if (i < 0 || i >= car.t.length - 1 || car.t[i + 1] - car.t[i] > 2000) return null; const f = (t - car.t[i]) / (car.t[i + 1] - car.t[i] || 1); return (car.v[i] + (car.v[i + 1] - car.v[i]) * f) / 3.6; }

// The context every step needs, computed once
export function sessionContext(r) {
  const win = raceWindow(r), tl = statusTimeline(r);
  return { r, win, tl, neutral: neutralIntervals(tl, win.end), inPit: flagIntervals(r, "InPit", BUILD.pitMargin), inPitExact: flagIntervals(r, "InPit"), retired: flagIntervals(r, "Retired"), stopped: flagIntervals(r, "Stopped"), lag: telemetryLag(r) };
}
// is a car's position sample at t a racing one (race window, green or yellow, not in the pit lane or out)?
const racing = (ctx, num, t) => t >= ctx.win.start && t <= ctx.win.end && !ctx.neutral.has(t) && !ctx.inPit[num]?.has(t) && !ctx.retired[num]?.has(t) && !ctx.stopped[num]?.has(t);

// ---------- the track ----------
function stationsOf(X, Y, Z, ds, sigmaPos = 0) {
  const rs = resampleClosed(X, Y, Z, ds);
  const x = smoothClosed(rs.x, sigmaPos / rs.ds), y = smoothClosed(rs.y, sigmaPos / rs.ds);
  // (smoothing pulls a corner's samples inwards a little: resample once more so the spacing is even again)
  const rs2 = resampleClosed(x, y, rs.z, ds);
  return { ...rs2, hdg: headings(rs2.x, rs2.y) };
}
// One pass over every car's racing positions: per station the mean lateral offset and height, and (stats) the offsets
// per 10 m block for the width / line. Each car is followed along the lap with a hint (its last station), so a car on a
// stretch that passes over or beside another stays on its own.
function fieldPass(ctx, st, { stats = false } = {}) {
  const { r } = ctx, idx = new StationIndex(st.x, st.y, st.hdg, st.ds), n = st.n;
  const sumD = new Float64Array(n), sumZ = new Float64Array(n), cnt = new Float64Array(n), B = 5, blocks = stats ? Array.from({ length: Math.ceil(n / B) }, () => []) : null;
  let used = 0, absD = [];
  for (const [num, c] of Object.entries(r.tracks.cars)) {
    let hint = -1, lastT = -Infinity;
    for (let k = 1; k < c.n - 1; k++) {
      const t = c.t[k];
      if (!racing(ctx, num, t)) { hint = -1; continue; }
      const dt = c.t[k + 1] - c.t[k - 1]; if (dt <= 0 || dt > 2500) { hint = -1; continue; }
      const v = Math.hypot(c.x[k + 1] - c.x[k - 1], c.y[k + 1] - c.y[k - 1]) * DM / (dt / 1000);
      if (v < 15) continue;                                     // crawling, spinning, standing: not the line
      if (t - lastT > 3000) hint = -1;
      const px = c.x[k] * DM, py = c.y[k] * DM, pz = c.z[k] * DM, p = idx.project(px, py, hint);
      lastT = t;
      if (!p || Math.abs(p.d) > BUILD.maxLat || Math.abs(pz - st.z[p.i]) > BUILD.maxDz) { hint = -1; continue; }
      hint = p.i;
      const i = Math.round(p.s / st.ds) % n;
      sumD[i] += p.d; sumZ[i] += pz; cnt[i]++; used++;
      if (stats) { blocks[Math.floor(i / B)].push(p.d); if (used % 7 === 0) absD.push(Math.abs(p.d)); }
    }
  }
  return { sumD, sumZ, cnt, blocks, used, absD, B };
}
// fill stations without data from their neighbours (linear across the gap), cyclic
function fillCyclic(vals, ok) {
  const n = vals.length, out = Float64Array.from(vals), known = []; for (let i = 0; i < n; i++) if (ok[i]) known.push(i);
  if (!known.length) return { out: out.fill(0), filled: n };
  let filled = 0;
  for (let q = 0; q < known.length; q++) {
    const a = known[q], b = known[(q + 1) % known.length], gap = ((b - a + n) % n) || n;
    for (let g = 1; g < gap; g++) { const i = (a + g) % n; out[i] = vals[a] + (vals[b] - vals[a]) * (g / gap); filled++; }
  }
  return { out, filled };
}

// The track's geometry: the field's mean racing path over every green-flag lap (DESIGN §4), its heights, curvature,
// gradient, and the field's lateral spread (width lower bound) and busiest line.
export function buildGeometry(ctx, { location } = {}) {
  const { r } = ctx;
  let lap = r.lapShape(), lapFrom = "replay lapShape";
  // (some sessions repeat a car's position in consecutive samples – a third of them at Shanghai 2026 – and findLap reads a
  // repeated point as "the car stopped": the same search over each car's path without the repeats)
  if (!lap) for (const n of r.furthest().slice(0, 8)) { const p = r.carPath(n), q = p.filter((v, i) => i === 0 || Math.hypot(v[0] - p[i - 1][0], v[1] - p[i - 1][1]) >= 1); lap = require("../../renderer/replay.js").findLap(q); if (lap) { lapFrom = `findLap over car ${n}'s path without repeated points`; break; } }
  if (!lap) throw new Error("no clean lap in the position data (replay lapShape, nor without repeated points)");
  // a sample out of order in the seed lap (Miami 2026: one point 68 m back along the straight) folds the line back on
  // itself: points where the path reverses (consecutive steps more than 90° apart) are dropped until none is left
  let seedDropped = 0;
  for (let again = true; again && lap.length > 30;) {
    again = false;
    for (let i = 1; i < lap.length - 1; i++) {
      const a = lap[i - 1], b = lap[i], c = lap[i + 1], ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
      if (ux * vx + uy * vy < 0) { lap = [...lap.slice(0, i), ...lap.slice(i + 1)]; seedDropped++; again = true; break; }
    }
  }
  let X = lap.map((p) => p[0] * DM), Y = lap.map((p) => p[1] * DM), Z = lap.map((p) => (p[2] || 0) * DM);
  if (Math.hypot(X[0] - X[X.length - 1], Y[0] - Y[X.length - 1]) < 3) { X.pop(); Y.pop(); Z.pop(); }
  let st = stationsOf(X, Y, Z, BUILD.ds, 4);
  st.z = smoothClosed(st.z, BUILD.zSigma / st.ds);
  const passLog = [];
  for (let pass = 0; pass < BUILD.passes; pass++) {
    const fp = fieldPass(ctx, st);
    const ok = Array.from(fp.cnt, (c) => c >= 3);
    const mD = fillCyclic(Array.from(fp.sumD, (s, i) => (fp.cnt[i] ? s / fp.cnt[i] : 0)), ok), mZ = fillCyclic(Array.from(fp.sumZ, (s, i) => (fp.cnt[i] ? s / fp.cnt[i] : st.z[i])), ok);
    const dS = smoothClosed(mD.out, 2);
    const nx = new Float64Array(st.n), ny = new Float64Array(st.n);
    for (let i = 0; i < st.n; i++) { nx[i] = st.x[i] - Math.sin(st.hdg[i]) * dS[i]; ny[i] = st.y[i] + Math.cos(st.hdg[i]) * dS[i]; }
    passLog.push({ pass: pass + 1, samples: fp.used, coverage: +(ok.filter(Boolean).length / st.n).toFixed(3), meanShift: +(dS.reduce((a, b) => a + Math.abs(b), 0) / st.n).toFixed(2), maxShift: +Math.max(...dS.map(Math.abs)).toFixed(2) });
    st = stationsOf(nx, ny, smoothClosed(mZ.out, 1), BUILD.ds, BUILD.posSigma);
    st.z = smoothClosed(st.z, BUILD.zSigma / st.ds);
  }
  // final statistics on the final line
  const fp = fieldPass(ctx, st, { stats: true });
  const okZ = Array.from(fp.cnt, (c) => c >= 3);
  const zf = fillCyclic(Array.from(fp.sumZ, (s, i) => (fp.cnt[i] ? s / fp.cnt[i] : st.z[i])), okZ);
  const z = smoothClosed(zf.out, BUILD.zSigma / st.ds);
  const hdg = headings(st.x, st.y), kappa = curvature(hdg, st.ds, BUILD.kappaSigma), grade = gradient(z, st.ds);
  // the feed snaps some sessions' positions to a reference line (smooth.js isSnapped: 75 % within 0.6 m) – then the spread
  // says nothing about the width
  const snapped = fp.absD.length > 200 && quantile(fp.absD, 0.75) < 0.6;
  const W0 = widthDefault(location), wd = widthAndLine(fp.blocks, fp.B, st.n, W0, snapped);
  // the racing line: minimum curvature between the edges, the car's centre kept LINE_MARGIN m inside them
  const lo = Float64Array.from(wd.wR, (w) => -(w - BUILD.lineMargin)), hi = Float64Array.from(wd.wL, (w) => w - BUILD.lineMargin);
  const line = smoothClosed(minCurvatureLine(st.x, st.y, hdg, st.ds, lo, hi), 1);
  const kappaLine = pathCurvature(st.x, st.y, hdg, line, st.ds);
  return { lapFrom, seedDropped, st: { ...st, z, hdg }, kappa, kappaLine, grade, wL: wd.wL, wR: wd.wR, line, fieldLine: wd.line, widthMeasured: wd.measured, snapped, widthDefault: W0, passLog, finalSamples: fp.used, zCoverage: +(okZ.filter(Boolean).length / st.n).toFixed(3), turn: totalTurn(hdg) };
}

// curvature (1/m, per lap sample) of the path offset by d along the lap line's normals, over the path's own length
export function pathCurvature(x, y, hdg, d, ds) {
  const n = x.length, px = new Float64Array(n), py = new Float64Array(n), k = new Float64Array(n);
  for (let i = 0; i < n; i++) { px[i] = x[i] - Math.sin(hdg[i]) * d[i]; py[i] = y[i] + Math.cos(hdg[i]) * d[i]; }
  const th = headings(px, py);
  for (let i = 0; i < n; i++) { const a = (i - 1 + n) % n, b = (i + 1) % n, len = Math.hypot(px[b] - px[i], py[b] - py[i]) + Math.hypot(px[i] - px[a], py[i] - py[a]); k[i] = len > 0 ? wrapAngle(th[b] - th[a]) / len : 0; }
  return smoothClosed(k, BUILD.kappaSigma / ds);
}
// Width and line from the field's lateral offsets per 10 m block – the method of the live view's measureWidth (map3d.js):
// the busiest cluster (cut where a 2.5 m gap opens), the outer 1 % dropped, a metre added for half a car; the spread is a
// lower bound on the tarmac (cars rarely use every metre), so the width is max(spread, the circuit default), ≤ 28 m,
// centred on the spread's centre. line: the cluster's median (where the field drives most), kept ≥ 2 m inside the edges.
function widthAndLine(blocks, B, n, W0, snapped) {
  const nb = blocks.length, Lb = new Array(nb).fill(null), Rb = new Array(nb).fill(null), Mb = new Array(nb).fill(null);
  if (!snapped) for (let b = 0; b < nb; b++) {
    const v = blocks[b]; if (v.length < 40) continue;
    v.sort((a, c) => a - c);
    let lo = 0, hi = -1;
    for (let i = 0, start = 0; i < v.length; i++) if (i === v.length - 1 || v[i + 1] - v[i] >= 2.5) { if (i - start > hi - lo) { lo = start; hi = i; } start = i + 1; }
    if (hi - lo + 1 < v.length * 0.25) continue;
    const cut = Math.floor((hi - lo + 1) * 0.01), L = v[hi - cut] + 1, R = v[lo + cut] - 1;
    const c = Math.max(-22, Math.min(22, (L + R) / 2)), W = Math.min(28, Math.max(L - R, W0));
    Lb[b] = c + W / 2; Rb[b] = c - W / 2; Mb[b] = v[Math.floor((lo + hi) / 2)];
  }
  const measured = Lb.filter((v) => v != null).length / nb;
  const fill = (arr, dflt) => { const ok = arr.map((v) => v != null); if (!ok.some(Boolean)) return new Float64Array(nb).fill(dflt); return fillCyclic(arr.map((v) => v ?? 0), ok).out; };
  const Lf = fill(Lb, W0 / 2), Rf = fill(Rb, -W0 / 2);
  const C = smoothClosed(Lf.map((l, i) => (l + Rf[i]) / 2), 8), Wd = smoothClosed(Lf.map((l, i) => l - Rf[i]), 3);
  const Mf = smoothClosed(fill(Mb, 0).map((m, i) => Math.max(C[i] - Wd[i] / 2 + 2, Math.min(C[i] + Wd[i] / 2 - 2, m))), 4);
  const wL = new Float64Array(n), wR = new Float64Array(n), line = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const f = i / B - 0.5, b0 = Math.floor(f), t = f - b0, i0 = (b0 + nb) % nb, i1 = (b0 + 1) % nb;
    const c = C[i0] * (1 - t) + C[i1] * t, w = Wd[i0] * (1 - t) + Wd[i1] * t;
    wL[i] = Math.max(1.5, c + w / 2); wR[i] = Math.max(1.5, w / 2 - c); line[i] = Mf[i0] * (1 - t) + Mf[i1] * t;
  }
  return { wL, wR, line, measured: +measured.toFixed(3) };
}

// ---------- timing lines ----------
// Where a line is from the messages that report crossing it: every report's car place s (m along the lap) and speed v;
// s = s_line + v·δ fitted over speed bins (see trackgeo binnedFit). Reports are taken relative to their circular median
// and kept within ±300 m of it.
export function lineFromReports(rows, L) {
  if (rows.length < 20) return null;
  const ang = rows.map((o) => (o.s / L) * 2 * Math.PI), cx = ang.reduce((a, b) => a + Math.cos(b), 0), cy = ang.reduce((a, b) => a + Math.sin(b), 0);
  let ref = wrapS((Math.atan2(cy, cx) / (2 * Math.PI)) * L, L);
  const rel = (s) => wrapS(s - ref + L / 2, L) - L / 2;
  ref = wrapS(ref + median(rows.map((o) => rel(o.s))), L);
  // (a report while the car stands – stopped on track, in the closing parc fermé queue – says nothing about the line)
  const keep = rows.filter((o) => Math.abs(rel(o.s)) < 300 && o.v != null && o.v > 8);
  if (keep.length < 20) return null;
  const fit = binnedFit(keep.map((o) => o.v), keep.map((o) => rel(o.s)), 8, 5);
  const med = median(keep.map((o) => rel(o.s))), vMed = median(keep.map((o) => o.v));
  const base = { n: keep.length, bins: fit ? fit.bins.map(([v, d, k]) => [+v.toFixed(1), +d.toFixed(1), k]) : [] };
  // without a speed spread (no SC / VSC laps: every report at racing speed) the delay can't be fitted in this session: the
  // feed's typical delay (BUILD.reportLatency, fitted over the sessions that have the spread – report) is taken instead
  if (!fit || fit.span[1] - fit.span[0] < 25 || fit.b < 0 || fit.b > 1.5)
    return { ...base, s: wrapS(ref + med - vMed * BUILD.reportLatency, L), latency: BUILD.reportLatency, latencyFitted: false, method: `median report place − median speed × the feed's typical delay ${BUILD.reportLatency} s (no usable speed spread in this session)`, est: true };
  return { ...base, s: wrapS(ref + fit.a, L), latency: +fit.b.toFixed(3), latencyFitted: true, rmsBins: +fit.rms.toFixed(2), speedSpan: fit.span.map((v) => +v.toFixed(1)), medianOffset: +(med - fit.a).toFixed(1), method: "reports' car place vs speed, intercept at v = 0" };
}
// Lap reports (TimingData NumberOfLaps) and sector reports (Sectors[k].Value) → each car's place and speed then
export function timingReports(ctx, idx) {
  const { r } = ctx, out = { lap: [], s1: [], s2: [] }, pos = [0, 0, 0];
  const put = (list, num, ms) => {
    if (ctx.inPitExact[num]?.has(ms) || !r.tracks.at(num, ms, pos)) return;
    const p = idx.project(pos[0] * DM, pos[1] * DM); if (!p || Math.abs(p.d) > 12) return;
    list.push({ s: p.s, v: speedAt(r.car?.[num], ms + ctx.lag.lag), num, ms });
  };
  for (const e of r.events) {
    if (e.topic !== "TimingData" || e.ms < ctx.win.start - 60000 || e.ms > ctx.win.end + 600000) continue;
    for (const [num, l] of Object.entries(e.data?.Lines || {})) {
      if (!l) continue;
      if (l.NumberOfLaps != null) put(out.lap, num, e.ms);
      const S = l.Sectors; if (!S || typeof S !== "object") continue;
      const get = (k) => (Array.isArray(S) ? S[k] : S[String(k)]);
      for (const k of [0, 1]) { const v = get(k)?.Value; if (typeof v === "string" && v.trim()) put(k ? out.s2 : out.s1, num, e.ms); }
    }
  }
  return out;
}

// ---------- telemetry over the track ----------
// each driver's fastest green laps (not out-laps / in-laps, no SC/VSC in them): [{ num, lap, t0, t1, sec }]
export function cleanLaps(ctx, { perDriver = 3 } = {}) {
  const { r } = ctx, out = [];
  for (const num of Object.keys(r.tracks.cars)) {
    const laps = r.laps(num, Infinity), pits = (r.pits(num, Infinity) || []).map((p) => p.ms);
    const cand = [];
    for (let k = 1; k < laps.length; k++) {
      const a = laps[k - 1], b = laps[k];
      if (!(b.sec > 0) || b.lap !== a.lap + 1 || b.lap < 2) continue;
      if (b.ms < ctx.win.start || b.ms > ctx.win.end + 120000) continue;
      if (pits.some((m) => m > a.ms - 15000 && m < b.ms + 5000)) continue;          // an in-lap or out-lap
      let bad = false; for (const iv of ctx.neutral.list) if (iv[1] > a.ms - 5000 && iv[0] < b.ms) { bad = true; break; }
      if (bad || ctx.inPitExact[num]?.has(a.ms) || ctx.inPitExact[num]?.has(b.ms)) continue;
      cand.push({ num, lap: b.lap, t0: a.ms, t1: b.ms, sec: b.sec });
    }
    cand.sort((p, q) => p.sec - q.sec);
    out.push(...cand.slice(0, perDriver));
  }
  return out;
}
// one lap's telemetry mapped onto the lap: [{ s, t (ms from the lap's start), v (m/s), thr, brk, gear, drs }] – each
// CarData sample's place from the positions at (its time − lag), projected with the car's own hint
export function lapTelemetry(ctx, idx, lp) {
  const { r } = ctx, car = r.car?.[lp.num]; if (!car) return null;
  const out = [], pos = [0, 0, 0]; let hint = -1;
  for (let i = Math.max(0, sampleIdx(car.t, lp.t0)); i < car.t.length && car.t[i] <= lp.t1; i++) {
    const tc = car.t[i]; if (tc < lp.t0) continue;
    if (!r.tracks.at(lp.num, tc - ctx.lag.lag, pos)) continue;
    const p = idx.project(pos[0] * DM, pos[1] * DM, hint); if (!p || Math.abs(p.d) > BUILD.maxLat) { hint = -1; continue; }
    hint = p.i;
    out.push({ s: p.s, t: tc - lp.t0, v: car.v[i] / 3.6, thr: car.thr[i], brk: car.brk[i], gear: car.gear[i], drs: car.drs[i] });
  }
  return out.length > 50 ? out : null;
}
// braking stations: where at least half of the fastest laps' telemetry shows the brake on (10 m bins, smoothed)
export function brakeMask(laps, n, ds) {
  const B = Math.max(1, Math.round(10 / ds)), nb = Math.ceil(n / B), on = new Float64Array(nb), all = new Float64Array(nb);
  for (const tr of laps) for (const q of tr) { const b = Math.floor(q.s / ds / B) % nb; all[b]++; if (q.brk) on[b]++; }
  const f = smoothClosed(Array.from(on, (v, b) => (all[b] ? v / all[b] : 0)), 1);
  const mask = new Uint8Array(n); for (let i = 0; i < n; i++) mask[i] = f[Math.floor(i / B) % nb] >= 0.5 ? 1 : 0;
  return mask;
}
// DRS zones (2011–2025 cars send CarData channel 45; ≥ 10 = flap open – aero.js): every run of open samples in the
// race's green laps, by where it starts; a zone = a cluster of run starts. start: the 10th percentile of the run starts
// (drivers open as soon as allowed, a few late), end: the median run end (the flap shuts at the first brake – 2025 SR
// Art. 22.1 (e), aero.js – so this is where the field brakes, not necessarily the painted end). Detection points can't
// be seen in telemetry: estimated (see caller).
export function drsZones(ctx, idx, L) {
  const { r } = ctx, runs = [], pos = [0, 0, 0];
  for (const [num, car] of Object.entries(r.car || {})) {
    if (!r.tracks.cars[num] || !car.drs) continue;
    let run = null; const close = () => { if (run && run.n >= 3) runs.push(run); run = null; };
    for (let i = 0; i < car.t.length; i++) {
      const t = car.t[i], open = car.drs[i] >= 10 && car.drs[i] !== 255;
      if (!open || !racing(ctx, num, t - ctx.lag.lag) || (run && t - run.tl > 1500)) { close(); if (!open) continue; if (!racing(ctx, num, t - ctx.lag.lag)) continue; }
      if (!r.tracks.at(num, t - ctx.lag.lag, pos)) { close(); continue; }
      const p = idx.project(pos[0] * DM, pos[1] * DM, run?.hint ?? -1); if (!p || Math.abs(p.d) > BUILD.maxLat) { close(); continue; }
      if (!run) run = { num, a: p.s, b: p.s, n: 0, tl: t, hint: p.i };
      run.b = p.s; run.n++; run.tl = t; run.hint = p.i;
    }
    close();
  }
  if (runs.length < 10) return { zones: [], runs: runs.length };
  // cluster by start (50 m bins, cyclic), clusters of ≥ 5 % of runs (and ≥ 8)
  const nb = Math.ceil(L / 50), h = new Array(nb).fill(0); for (const q of runs) h[Math.floor(q.a / 50) % nb]++;
  const minN = Math.max(8, runs.length * 0.05), used = new Uint8Array(nb), zones = [];
  const order = [...h.keys()].sort((a, b) => h[b] - h[a]);
  for (const b of order) {
    if (used[b] || h[b] < 3) continue;
    let lo = b, hi = b; used[b] = 1;
    while (h[(lo - 1 + nb) % nb] > 0 && !used[(lo - 1 + nb) % nb] && b - lo < 12) { lo--; used[(lo + nb) % nb] = 1; }
    while (h[(hi + 1) % nb] > 0 && !used[(hi + 1) % nb] && hi - b < 12) { hi++; used[hi % nb] = 1; }
    const a0 = lo * 50, a1 = (hi + 1) * 50, mem = runs.filter((q) => inSpan(q.a, wrapS(a0, L), wrapS(a1, L)));
    if (mem.length < minN) continue;
    const rel = (s) => wrapS(s - wrapS(a0, L), L);
    const start = wrapS(wrapS(a0, L) + quantile(mem.map((q) => rel(q.a)), 0.1), L), end = wrapS(start + median(mem.map((q) => wrapS(q.b - start, L))), L);
    if (wrapS(end - start, L) < 150) continue;
    zones.push({ start: +start.toFixed(1), end: +end.toFixed(1), runs: mem.length, cars: new Set(mem.map((q) => q.num)).size });
  }
  return { zones: zones.sort((p, q) => p.start - q.start), runs: runs.length };
}

// ---------- the pit lane ----------
// Every pass through the pit lane (TimingData InPit): the car's positions from where it leaves the lap line to where it
// joins it again (grid-survey.js's method), with speeds. → [{ num, ms, seg: [{ t, x, y, z, d, s, v }] }]
export function pitPasses(ctx, idx) {
  const { r } = ctx, passes = [];
  for (const [num, c] of Object.entries(r.tracks.cars)) {
    for (const { ms } of r.pits(num, Infinity) || []) {
      if (ms < ctx.win.start - 120000) continue;
      let k0 = 0; while (k0 < c.n && c.t[k0] < ms - 30000) k0++;
      const pts = []; let hint = -1;
      for (let k = k0; k < c.n && c.t[k] < ms + 120000; k++) {
        const x = c.x[k] * DM, y = c.y[k] * DM, pr = idx.project(x, y, hint);
        if (!pr) { hint = -1; pts.push({ t: c.t[k], x, y, z: c.z[k] * DM, d: 99, s: null, v: speedAt(r.car?.[num], c.t[k] + ctx.lag.lag) }); continue; }
        hint = pr.i;
        pts.push({ t: c.t[k], x, y, z: c.z[k] * DM, d: Math.abs(pr.d), sd: pr.d, s: pr.s, v: speedAt(r.car?.[num], c.t[k] + ctx.lag.lag) });
      }
      const a = pts.findIndex((p) => p.t >= ms - 12000 && p.d > 2.5);
      if (a < 1) continue;
      let b = a; while (b + 1 < pts.length && (pts[b + 1].d > 1.5 || pts[b + 2]?.d > 1.5) && pts[b + 1].t - pts[b].t < 4000) b++;
      if (b + 1 >= pts.length || pts[b + 1].t - pts[b].t > 4000) continue;
      const seg = pts.slice(a - 1, b + 2);
      if (seg.length < 12 || seg[seg.length - 1].t - seg[0].t > 110000) continue;
      passes.push({ num, ms, seg });
    }
  }
  return passes;
}
// polyline length helpers
function polyCum(P) { const c = new Float64Array(P.length); for (let i = 1; i < P.length; i++) c[i] = c[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return c; }
function alongPoly(P, cum, x, y) { let best = 0, bd = Infinity; for (let i = 1; i < P.length; i++) { const [x0, y0] = P[i - 1], [x1, y1] = P[i], dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (l * l))), d = Math.hypot(x - x0 - dx * t, y - y0 - dy * t); if (d < bd) { bd = d; best = cum[i - 1] + l * t; } } return { u: best, d: bd }; }

// The pit lane path and its features. The representative pass (the median duration) gives the path – the feed puts
// pit-lane positions on a line of its own (grid-survey.js), so one pass is the lane – resampled every ~2 m, heights
// smoothed; the limiter lines and the limit from all passes' speeds (grid-survey.js's method); the branch / merge on the
// lap where the path leaves / joins the lap line; the teams' boxes from pitorder.js (measured on the app's pit path,
// START_DATA) moved onto this path by projection.
export function buildPit(ctx, idx, L, { circuitKey, season, teams }) {
  const passes = pitPasses(ctx, idx);
  if (passes.length < 2) return { pit: null, why: `only ${passes.length} pit passes in the data` };
  const lim = []; for (const p of passes) for (const q of p.seg) if (q.v != null && q.v * 3.6 > 40 && q.v * 3.6 < 95) lim.push(Math.round((q.v * 3.6) / 5) * 5);
  const counts = {}; for (const v of lim) counts[v] = (counts[v] || 0) + 1;
  const limit = +Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const ends = passes.map((p) => {
    const s = p.seg, on = s.findIndex((q) => q.v != null && q.v * 3.6 <= limit + 3);
    let iMin = -1; for (let i = 0; i < s.length; i++) if (s[i].v != null && (iMin < 0 || s[i].v <= s[iMin].v)) iMin = i;
    let off = -1; for (let i = Math.max(0, iMin); i < s.length; i++) if (s[i].v != null && s[i].v * 3.6 > limit + 8) { off = i - 1; break; }
    return { p, on: on >= 0 ? s[on] : null, off: off >= 0 ? s[off] : null, dur: s[s.length - 1].t - s[0].t };
  }).filter((e) => e.on && e.off);
  if (!ends.length) return { pit: null, why: "no pass with both limiter lines" };
  // the representative pass: among the passes whose path length is within 5 % of the median (a pass whose positions
  // jump back and forth – Baku 2026 – is longer), the one of median duration
  const segLen = (e) => { let l = 0; const g = e.p.seg; for (let i = 1; i < g.length; i++) l += Math.hypot(g[i].x - g[i - 1].x, g[i].y - g[i - 1].y); return l; };
  for (const e of ends) e.len = segLen(e);
  const medLen = median(ends.map((e) => e.len)), typical = ends.filter((e) => Math.abs(e.len - medLen) <= medLen * 0.05);
  const pool = typical.length ? typical : ends, mid = median(pool.map((e) => e.dur)), rep = pool.reduce((a, b) => (Math.abs(b.dur - mid) < Math.abs(a.dur - mid) ? b : a));
  // the path: from the last on-line point before the branch to the first one back (both on the lap line)
  const raw = rep.p.seg.map((q) => [q.x, q.y, q.z]);
  let P = []; for (const q of raw) if (!P.length || Math.hypot(q[0] - P[P.length - 1][0], q[1] - P[P.length - 1][1]) > 1) P.push(q);
  // zig-zag check: the path against itself smoothed over ±3 points; positions alternating between two lines (Shanghai
  // 2026: every pass ~1.9 km for a ~0.7 km lane) → the app's own measured pit path (startdata.js, many sessions) instead
  const zig = (Q) => { const sm = Q.map((_, i) => { let x = 0, y = 0, w = 0; for (let k = -3; k <= 3; k++) { const j = Math.min(Q.length - 1, Math.max(0, i + k)); x += Q[j][0]; y += Q[j][1]; w++; } return [x / w, y / w]; }); return polyCum(Q.map((q) => [q[0], q[1]])).at(-1) / (polyCum(sm).at(-1) || 1); };
  const sd0 = START_DATA[circuitKey]?.pit, zz = zig(P);
  let pathFrom = `this session: car ${rep.p.num}'s pass at ${((rep.p.ms - ctx.win.start) / 1000).toFixed(0)} s from lights out`;
  if (zz > 1.15 && sd0?.path?.length > 10) {
    const pr = (q) => idx.project(q[0], q[1]), SP = sd0.path.map((q) => [q[0] * DM, q[1] * DM]);
    P = SP.map((q) => { const p0 = pr(q); return [q[0], q[1], p0 ? idx.z?.[p0.i] ?? 0 : 0]; });
    pathFrom = `startdata.js pit path (${sd0.session}) – this session's pit positions zig-zag (path / smoothed ${zz.toFixed(2)})`;
  }
  const cum = polyCum(P), Lp = cum[cum.length - 1], np = Math.max(10, Math.round(Lp / BUILD.ds)), dsp = Lp / np;
  const px = new Float64Array(np + 1), py = new Float64Array(np + 1), pz = new Float64Array(np + 1);
  for (let i = 0, j = 0; i <= np; i++) { const u = i * dsp; while (j < P.length - 2 && cum[j + 1] < u) j++; const l = cum[j + 1] - cum[j] || 1, f = Math.min(1, Math.max(0, (u - cum[j]) / l)); px[i] = P[j][0] + (P[j + 1][0] - P[j][0]) * f; py[i] = P[j][1] + (P[j + 1][1] - P[j][1]) * f; pz[i] = P[j][2] + (P[j + 1][2] - P[j][2]) * f; }
  const sm = (a, sg) => { const n = a.length, out = new Float64Array(n), K = Math.ceil(sg * 3); for (let i = 0; i < n; i++) { let s = 0, w = 0; for (let k = -K; k <= K; k++) { const j = i + k; if (j < 0 || j >= n) continue; const ww = Math.exp(-0.5 * (k / sg) ** 2); s += a[j] * ww; w += ww; } out[i] = s / w; } return out; };
  const zs = sm(pz, 10), xs = sm(px, 1), ys = sm(py, 1);
  const hdg = new Float64Array(np + 1); for (let i = 0; i <= np; i++) { const a = Math.max(0, i - 1), b = Math.min(np, i + 1); hdg[i] = Math.atan2(ys[b] - ys[a], xs[b] - xs[a]); }
  const PP = Array.from(xs, (x, i) => [x, ys[i]]), pcum = polyCum(PP);
  // positions along the path in the path's OWN unit u = i·dsp (what the engine and the screen read: sample index × ds) –
  // not the smoothed polyline's arc length, which is shorter wherever the raw positions zig-zag (v0.48 garage audit: boxes
  // up to 11 m off at Silverstone 2025)
  const toU = (a) => { let i = 0; while (i < pcum.length - 2 && pcum[i + 1] < a) i++; const l = pcum[i + 1] - pcum[i] || 1; return (i + Math.min(1, Math.max(0, (a - pcum[i]) / l))) * dsp; };
  const alongU = (x, y) => { const a = alongPoly(PP, pcum, x, y); return { u: toU(a.u), d: a.d }; };
  // the branch and the merge on the lap: where the path's ends project; each pit sample's approximate lap s (for gaps
  // and the screen): its own projection while the lane runs beside the lap line (≤ 40 m), else interpolated in u
  const pa = idx.project(xs[0], ys[0]), pb = idx.project(xs[np], ys[np]);
  const sIn = pa.s, sOut = pb.s, span = wrapS(sOut - sIn, L);
  const sLap = new Float64Array(np + 1);
  for (let i = 0; i <= np; i++) {
    const lin = wrapS(sIn + span * (i / np), L), pr = idx.project(xs[i], ys[i]);
    sLap[i] = pr && pr.dist < 40 && Math.abs(wrapS(pr.s - lin + L / 2, L) - L / 2) < 150 ? pr.s : lin;
  }
  for (let i = 1; i <= np; i++) if (wrapS(sLap[i] - sLap[i - 1] + L / 2, L) - L / 2 < 0) sLap[i] = sLap[i - 1];   // (never backwards)
  let onU = median(ends.map((e) => alongU(e.on.x, e.on.y).u)), offU = median(ends.map((e) => alongU(e.off.x, e.off.y).u));
  const mad = (k) => { const v = ends.map((e) => alongU(e[k].x, e[k].y).u), m = median(v); return +median(v.map((x) => Math.abs(x - m))).toFixed(1); };
  // the limiter lines from this session when enough passes agree; else startdata.js's (medians over the app's race
  // sessions at this circuit), its points projected onto this path
  let limFrom = `this session: medians over ${ends.length} passes`, madOn = mad("on"), madOff = mad("off");
  const sdLim = (() => { if (!sd0?.path?.length || sd0.limitOn == null) return null; const SP = sd0.path.map((q) => [q[0] * DM, q[1] * DM]), sc = polyCum(SP), at = (u) => { let j = 0; while (j < SP.length - 2 && sc[j + 1] < u) j++; const l = sc[j + 1] - sc[j] || 1, f = Math.min(1, Math.max(0, (u - sc[j]) / l)); return [SP[j][0] + (SP[j + 1][0] - SP[j][0]) * f, SP[j][1] + (SP[j + 1][1] - SP[j][1]) * f]; }; const a = at(sd0.limitOn), b = at(sd0.limitOff), pa = alongU(a[0], a[1]), pb = alongU(b[0], b[1]); return pa.d < 15 && pb.d < 15 ? { on: pa.u, off: pb.u, limit: sd0.limit } : null; })();
  if ((ends.length < 5 || madOn > 20 || madOff > 20 || !(offU - onU > 100)) && sdLim) { onU = sdLim.on; offU = sdLim.off; limFrom = `startdata.js (${sd0.session}; this session: ${ends.length} usable passes, MAD ${madOn}/${madOff} m)`; }
  // team boxes: pitorder.js's measured places (m along START_DATA's pit path) → points → this path
  const boxes = {}, boxInfo = [], sd = START_DATA[circuitKey]?.pit;
  const ob = sd ? orderedBoxes(circuitKey, season, teams) : null;
  if (ob && sd) {
    const SP = sd.path.map((p) => [p[0] * DM, p[1] * DM]), scum = polyCum(SP);
    const pointAt = (u) => { let j = 0; while (j < SP.length - 2 && scum[j + 1] < u) j++; const l = scum[j + 1] - scum[j] || 1, f = Math.min(1, Math.max(0, (u - scum[j]) / l)); return [SP[j][0] + (SP[j + 1][0] - SP[j][0]) * f, SP[j][1] + (SP[j + 1][1] - SP[j][1]) * f]; };
    for (const b of ob) { const [x, y] = pointAt(b.u), a = alongU(x, y); const k = teamKey(b.team); if (a.d < 15) { boxes[k] = +a.u.toFixed(1); boxInfo.push({ team: b.team, teamKey: k, u: +a.u.toFixed(1), off: +a.d.toFixed(1), rank: b.rank, how: b.how, season: b.season, sameSeason: b.sameSeason, from: b.from }); } else boxInfo.push({ team: b.team, teamKey: k, u: null, off: +a.d.toFixed(1), why: "measured box is off this path" }); }
  }
  const laneTimes = ends.map((e) => (e.p.seg[e.p.seg.length - 1].t - e.p.seg[0].t) / 1000);
  return { pit: {
    n: np + 1, ds: dsp, L: Lp, u: Array.from({ length: np + 1 }, (_, i) => i * dsp), x: xs, y: ys, z: zs, hdg, sLap,
    sIn, sOut, limStart: onU, limEnd: offU, speedLimit: limit != null ? limit / 3.6 : null,
    speedLimitSrc: { kmh: limit, how: "measured: the commonest pit-lane speed (40–95 km/h, 5 km/h steps) in CarData over every pass", est: true, conf: "H" },
    boxes, boxInfo,
    stats: { passes: passes.length, used: ends.length, limStartMAD: madOn, limEndMAD: madOff, pathFrom, limFrom, zigzag: +zz.toFixed(3), startdataLimiter: sdLim ? [+sdLim.on.toFixed(1), +sdLim.off.toFixed(1)] : null, repPass: { num: rep.p.num, ms: rep.p.ms, sec: rep.dur / 1000 }, branchOff: +pa.dist.toFixed(1), mergeOff: +pb.dist.toFixed(1), passSecMedian: +median(laneTimes).toFixed(2) },
  } };
}

// ---------- Monaco's covered stretches ----------
// tunnel.js TUNNELS (OSM ends, lat/lon) → the app's own map fit (geo.js frame + the cached fit2_<Location>_*.json the 3D
// view made: F1 decimetres ↔ local metres) → points on the lap. A fit is used only if both ends land within 15 m of the
// lap line and the stretch's length matches the spec within 25 %.
export function coverSpans(venueKey, location, idx, L, cache = CACHE) {
  if (venueKey !== 22) return { spans: [], note: "no covered stretch known for this venue (tunnel.js TUNNELS)" };
  const text = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../../renderer/tunnel.js"), "utf8");
  // (tunnel.js imports three.js – its table is read as data instead of importing the module)
  const specs = [...text.matchAll(/id: "([a-z-]+)", name: "([^"]+)", entry: \[([\d.]+), ([\d.]+)\], exit: \[([\d.]+), ([\d.]+)\], len: (\d+)/g)].map((m) => ({ id: m[1], name: m[2], entry: [+m[3], +m[4]], exit: [+m[5], +m[6]], len: +m[7] }));
  const geo = require("../../main/geo.js");
  const centre = geo.CIRCUITS[location] || geo.circuitInfo(location)?.center;
  if (!centre) return { spans: [], note: "no centre for the map frame" };
  const fr = geo.frame(centre);
  const fits = fs.readdirSync(cache).filter((f) => f.startsWith(`fit2_${location.replace(/[^A-Za-z0-9]+/g, "_")}_`));
  for (const f of fits) {
    let fit; try { fit = JSON.parse(fs.readFileSync(path.join(cache, f), "utf8")); } catch { continue; }
    if (!fit?.ok) continue;
    const spans = []; let good = true;
    for (const sp of specs) {
      const a = geo.toF1(fit, fr.toXY(...sp.entry)), b = geo.toF1(fit, fr.toXY(...sp.exit));
      const pa = idx.project(a[0] * DM, a[1] * DM), pb = idx.project(b[0] * DM, b[1] * DM);
      if (!pa || !pb || pa.dist > 15 || pb.dist > 15) { good = false; break; }
      const len = wrapS(pb.s - pa.s, L);
      if (Math.abs(len - sp.len) > Math.max(10, sp.len * 0.25)) { good = false; break; }
      spans.push({ id: sp.id, name: sp.name, a: pa.s, b: pb.s, len, specLen: sp.len, off: [+pa.dist.toFixed(1), +pb.dist.toFixed(1)] });
    }
    if (good && spans.length) return { spans, fit: f, note: "tunnel.js TUNNELS (OSM ways, 2026-10-18) via the app's map fit" };
  }
  return { spans: [], note: "no map fit placed the tunnel on this lap" };
}

// ---------- entries, grid, laps, weather, tyres ----------
export function entriesOf(r, t) {
  r.seek(t);
  const dl = r.state.DriverList || {};
  return Object.entries(dl).filter(([n, d]) => d && typeof d === "object" && /^\d+$/.test(n) && +n < 200).map(([n, d]) => ({
    num: n, tla: d.Tla || null, name: d.FullName || [d.FirstName, d.LastName].filter(Boolean).join(" ") || null, first: d.FirstName || null, last: d.LastName || null,
    team: d.TeamName || null, teamKey: teamKey(d.TeamName), colour: d.TeamColour ? `#${String(d.TeamColour).replace(/^#/, "")}` : null, line: d.Line ?? null,
  })).sort((a, b) => (a.line ?? 99) - (b.line ?? 99) || +a.num - +b.num);
}
// The starting order (startplan.js: the first start's order is the published grid, TimingAppData GridPos), each car's
// kind at lights out (grid / pit lane / out) – a pit-lane starter's slot is left empty.
export function gridOf(r, win, entries, idx = null) {
  const hist = StartHistory.fromEvents(r.events), starts = hist.starts(), first = starts[0];
  const order = first?.order || [...hist.grid.entries()].filter(([, g]) => g > 0).sort((a, b) => a[1] - b[1]).map(([n]) => n);
  const t = first ? first.t : win.start;
  const slots = [], pitLane = [], dns = [];
  for (const e of entries) {
    const k = first ? carKind(hist, first, e.num, t) : { kind: hist.grid.get(e.num) ? "grid" : "none" };
    const g = hist.grid.get(e.num) || null;
    // (where it stood 1.5 s before lights out – its real slot on this lap's s, when the feed sent positions then)
    let at = null; const P = [0, 0, 0];
    if (idx && r.tracks.at(e.num, t - 1500, P)) { const pr = idx.project(P[0] * DM, P[1] * DM); if (pr && pr.dist < 40) at = { s: +pr.s.toFixed(1), d: +pr.d.toFixed(1) }; }
    if (k.kind === "grid") slots.push({ pos: k.g, num: e.num, ...(at ? { s: at.s, d: at.d } : {}) });
    else if (k.kind === "pit") pitLane.push({ num: e.num, gridPos: g });
    else dns.push({ num: e.num, kind: k.kind, gridPos: g });
  }
  slots.sort((a, b) => a.pos - b.pos);
  return { slots, order: slots.map((s) => s.num), pitLane, dns, standing: first ? first.standing : true, source: first ? `startplan.js StartHistory (${first.orderFrom}); kind at lights out (TimingData InPit / Retired / Stopped)` : "TimingAppData GridPos (no start found)", publishedOrder: order };
}
// the scheduled race distance: LapCount.TotalLaps as it stood at lights out (a later change – a shortened race – is a
// result, not a schedule)
export function lapsOf(r, win) {
  let total = null, last = null;
  for (const e of r.events) { if (e.topic !== "LapCount" || e.data?.TotalLaps == null) continue; if (e.ms <= win.start + 1000) total = +e.data.TotalLaps; last = +e.data.TotalLaps; }
  return { laps: total ?? last, source: total != null ? "LapCount.TotalLaps at lights out" : "LapCount.TotalLaps (first sent after lights out)", changedLater: last != null && total != null && last !== total ? last : null };
}
// WeatherData records over the session (the station sends about one a minute): t (s from lights out), values as sent;
// rain is the feed's Rainfall 0/1 (no intensity). gaps: stretches with no record for > 90 s.
export function weatherOf(r, win) {
  const recs = r.events.filter((e) => e.topic === "WeatherData" && e.data && typeof e.data === "object");
  const cols = { t: [], air: [], track: [], humidity: [], pressure: [], windSpeed: [], windDir: [], rain: [] };
  const cur = {};
  const num = (v) => (v == null || v === "" || !Number.isFinite(+v) ? null : +v);
  for (const e of recs) {
    Object.assign(cur, e.data);
    cols.t.push(+((e.ms - win.start) / 1000).toFixed(1)); cols.air.push(num(cur.AirTemp)); cols.track.push(num(cur.TrackTemp)); cols.humidity.push(num(cur.Humidity));
    cols.pressure.push(num(cur.Pressure)); cols.windSpeed.push(num(cur.WindSpeed)); cols.windDir.push(num(cur.WindDirection)); cols.rain.push(cur.Rainfall == null ? null : +cur.Rainfall ? 1 : 0);
  }
  const gaps = []; for (let i = 1; i < cols.t.length; i++) if (cols.t[i] - cols.t[i - 1] > 90) gaps.push([cols.t[i - 1], cols.t[i]]);
  const raceEnd = (win.end - win.start) / 1000;
  if (cols.t.length && cols.t[cols.t.length - 1] < raceEnd - 90) gaps.push([cols.t[cols.t.length - 1], +raceEnd.toFixed(1)]);
  if (cols.t.length && cols.t[0] > 90 - 3600) {}   // (pre-race coverage is whatever the session sent)
  return { cols, gaps, records: recs.length, units: { t: "s from lights out", air: "°C", track: "°C", humidity: "%", pressure: "hPa (mbar)", windSpeed: "m/s", windDir: "deg from, clockwise from north", rain: "0/1 (F1 Rainfall flag – no intensity)" }, source: "F1 live timing WeatherData (circuit station)" };
}
export function compoundsSeen(r) {
  const s = new Set();
  for (const num of Object.keys(r.tyreLog?.cars || {})) for (const st of r.tyreChanges(num, Infinity, { history: true })) if (st.compound && st.compound !== "UNKNOWN") s.add(st.compound);
  return [...s].sort();
}

export { venueOf, zonesFor, zoneSpans, estimateZones, aeroLock, cornerStations, cachedCircuit, ZONE, closedCum, rotate, maskRuns, StationIndex, wrapS, median, quantile, inSpan };
