// Checks of a built scenario's track against the data it came from and against published facts (node tools only).
// Used by build-all.mjs for every race; numbers go to the report.
import { inSpan } from "./trackgeo.mjs";

// Official lap lengths (km) – Wikipedia, "List of Formula One circuits", table column "Last length used" (fetched
// 2026-10-29: https://en.wikipedia.org/wiki/List_of_Formula_One_circuits). Keyed by F1's circuit key (venues.js).
// These are the circuits' centreline lengths; the scenario's lap is the field's racing line, which cuts corners, so it
// is expected a little shorter (≈ 0.5–2 %).
export const OFFICIAL_KM = {
  2: 5.891, 4: 4.381, 6: 4.909, 7: 7.004, 9: 5.513, 10: 5.278, 12: 5.543, 14: 4.309, 15: 4.657, 19: 4.318, 22: 3.337, 23: 4.361,
  39: 5.793, 46: 5.807, 49: 5.451, 55: 4.259, 61: 4.940, 63: 5.412, 65: 4.304, 70: 5.281, 144: 6.003, 149: 6.174, 150: 5.419,
  151: 5.412, 152: 6.201, 153: 5.414,
};
export const OFFICIAL_SRC = "Wikipedia 'List of Formula One circuits' (Last length used), fetched 2026-10-29";

const G = 9.81;
// lateral acceleration at each numbered corner: within ±60 m of the corner's s (the corner markers are label places, a
// few tens of metres off the apex), the median over drivers of their fastest clean lap's minimum speed (calib traces,
// 10 m bins) at the slowest point, and the curvature there – of the lap line (kappa) and of the racing-line estimate
// (kappaLine, the larger of the two radii is what a car can use) → a = v²·|κ| in g
export function cornerCheck(scenario, calib) {
  const t = scenario.track, k = t.columns.kappa, kl = t.columns.kappaLine || k, n = t.n, ds = t.ds, out = [];
  const traces = Object.values(calib?.traces || {}).filter((q) => q.coverage > 0.8);
  if (!traces.length) return out;
  const nb = traces[0].v.length, bin = traces[0].bin;
  // the field's median speed per bin
  const vmed = new Float64Array(nb); for (let b = 0; b < nb; b++) { const v = traces.map((q) => q.v[b]).filter((x) => x != null).sort((a, c) => a - c); vmed[b] = v.length ? v[v.length >> 1] / 3.6 : NaN; }
  const kAt = (arr, s) => { let m = 0; for (let o = -10; o <= 10; o += ds) { const i = ((Math.round((s + o) / ds) % n) + n) % n; m = Math.max(m, Math.abs(arr[i])); } return m; };
  for (const c of t.corners || []) {
    let bmin = -1, vm = Infinity;
    for (let o = -60; o <= 60; o += bin) { const b = ((Math.floor((c.s + o) / bin) % nb) + nb) % nb; if (vmed[b] < vm) { vm = vmed[b]; bmin = b; } }
    if (bmin < 0 || !Number.isFinite(vm)) continue;
    const s = (bmin + 0.5) * bin, k1 = kAt(k, s), k2 = kAt(kl, s);
    out.push({ n: c.n, s: c.s, sMin: s, vMinKmh: +(vm * 3.6).toFixed(0), r: k1 > 0 ? +(1 / k1).toFixed(1) : null, rLine: k2 > 0 ? +(1 / k2).toFixed(1) : null, latG: +((vm * vm * k1) / G).toFixed(2), latGLine: +((vm * vm * k2) / G).toFixed(2) });
  }
  return out;
}

// the whole check of one race → a summary row
export function validateTrack(scenario, calib) {
  const t = scenario.track, key = scenario.meta.circuitKey, off = OFFICIAL_KM[key];
  const z = t.columns.z, zr = Math.max(...z) - Math.min(...z);
  const corners = cornerCheck(scenario, calib);
  const lat = corners.filter((c) => c.latG != null);
  // pit: limiter span / limit + stationary vs the measured pit lane time (both medians)
  let pit = null;
  if (t.pit && calib) {
    const lanes = [], stat = [];
    for (const d of Object.values(calib.drivers)) for (const s of d.stops) { if (s.lane > 10 && s.lane < 60) lanes.push(s.lane); if (s.stationary > 1 && s.stationary < 10) stat.push(s.stationary); }
    const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
    const span = t.pit.limEnd - t.pit.limStart, lane = med(lanes), st = med(stat);
    pit = { pathL: t.pit.L, limiterSpan: +span.toFixed(1), limitKmh: t.pit.speedLimit ? +(t.pit.speedLimit * 3.6).toFixed(0) : null, laneTimeMedian: lane, stationaryMedian: st, stops: lanes.length,
      predictedLane: t.pit.speedLimit && st != null ? +(span / t.pit.speedLimit + st).toFixed(2) : null };
    if (pit.predictedLane != null && lane != null) pit.excess = +(lane - pit.predictedLane).toFixed(2);   // decel/accel to the box, the stop's in/out: expected + 1–4 s
  }
  const pole = scenario.grid.slots[0];
  return {
    id: scenario.meta.id, circuitKey: key, L: +t.L.toFixed(1), officialM: off ? off * 1000 : null, lenDiffPct: off ? +(((t.L - off * 1000) / (off * 1000)) * 100).toFixed(2) : null,
    startLine: { latency: t.startLine.latency, fitted: t.startLine.latencyFitted, n: t.startLine.n, rms: t.startLine.rmsBins ?? null }, poleS: pole?.s ?? null, poleBehindLine: pole?.s != null ? +(((t.L - pole.s) % t.L)).toFixed(1) : null,
    sectors: t.zones.sectors, sectorsFitted: !t.sectorLines.est,
    zRange: +zr.toFixed(1), kappaMax: +Math.max(...t.columns.kappa.map(Math.abs)).toFixed(4), rMinOverall: +(1 / Math.max(...t.columns.kappa.map(Math.abs))).toFixed(1),
    latG: lat.length ? { min: Math.min(...lat.map((c) => c.latG)), max: Math.max(...lat.map((c) => c.latG)), over6: lat.filter((c) => c.latG > 6).map((c) => c.n) } : null,
    latGLine: lat.length ? { min: Math.min(...lat.map((c) => c.latGLine)), max: Math.max(...lat.map((c) => c.latGLine)), median: [...lat.map((c) => c.latGLine)].sort((a, b) => a - b)[lat.length >> 1], over6: lat.filter((c) => c.latGLine > 6).map((c) => c.n) } : null,
    corners, pit, drs: t.zones.drs.length, straight: t.zones.straight.length, cover: t.zones.cover.length,
    widthMeasured: t.stats.widthMeasured, snapped: t.stats.snapped,
  };
}
export { inSpan };
