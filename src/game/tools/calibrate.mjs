#!/usr/bin/env node
// Fit the car coefficients per team per season (CdA, ClA, mu_mech, power, a_brake_max, k_trac) to real fastest-lap speed
// traces, on a CALIBRATION race set; report the errors on a separate VALIDATION race set (DESIGN §5, §16; 요청 §14–15).
//
//   node src/game/tools/calibrate.mjs --season 2025 [--scen DIR] [--out DIR] [--params DIR] [--rounds 3] [--evals 450]
//
// Inputs (never engine inputs – they hold race outcomes): the data helper's extracts in --scen (default
// ~/projects/f1kr-work/v048/scenarios): <id>.scenario.json (track s/κ/grade at 2 m, DRS / Straight Mode zones, weather) and
// <id>.calib.json (each driver's fastest clean lap as speed every 10 m, its lap number / compound / tyre age).
// The session cache is read strictly read-only (fs.readFileSync of CarData.z) only to learn whether DRS was open on the
// trace lap (channel 45); without the cache DRS is assumed closed and the report says so.
//
// Model per trace: profile.js envelope + forward pass (the same equations as the engine) with the car state of that lap –
//   mass = m_min + fuel(lap) (fuel from an estimated burn per km × laps to go), tyre μ = compound × wear(age) (estimate),
//   air density from the race's weather (temperature, pressure), DRS (≤2025) open in the zones where the car opened it,
//   2026 Straight Mode in every marked zone, power: ≤2025 one wheel power (ICE + ERS, the fast lap's deployment);
//   2026 ICE + MGU-K under the rule's speed cap, scaled to the per-lap recharge energy.
//   A per-race track grip factor τ (asphalt, temperature, rubber) is shared by all teams of that race; the calibration set's
//   τ have geometric mean 1 (otherwise τ and mu_mech are the same thing).
// Loss per trace: mean squared speed error over the 10 m bins (km/h²) + 25·(lap time error, s)², plus a weak prior that keeps
// each coefficient near the generic value (log-space σ 0.35) where the traces can't tell (no fast corners, no long straight).
// Fit: Nelder–Mead in log space within each PARAM range; teams and τ alternate for --rounds rounds.
// Validation: A = τ = 1 (pure prediction), B = τ fitted for the race (1 number shared by all teams). Baselines: the generic
// car, and one season-mean car for every team (does the team split carry information beyond the circuit?).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { computeProfile, makeProfile } from "../engine/profile.js";
import { carBase, CAR_BASE_TABLE } from "../data/params/cars-base.js";
import { airDensity } from "../data/params/physics.js";
import { COMPOUNDS, DEFAULT_ALLOCATION } from "../data/params/tyres.js";
import { wearFactor } from "../engine/tyre.js";
import { energyParams } from "../data/params/energy.js";

const require = createRequire(import.meta.url);
const HOME = os.homedir(), WORK = path.join(HOME, "projects/f1kr-work/v048");
const CACHE = path.join(HOME, "Library/Application Support/f1-live-kr/cache");

// ---- race sets: calibration and validation are disjoint; both span circuit types (power, downforce, street, altitude) ----
export const SETS = {
  2025: {
    calib: ["2025-04-13_Bahrain_Grand_Prix_2025-04-13_Race", "2025-04-20_Saudi_Arabian_Grand_Prix_2025-04-20_Race", "2025-04-06_Japanese_Grand_Prix_2025-04-06_Race",
      "2025-06-01_Spanish_Grand_Prix_2025-06-01_Race", "2025-06-29_Austrian_Grand_Prix_2025-06-29_Race", "2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race",
      "2025-09-07_Italian_Grand_Prix_2025-09-07_Race", "2025-10-26_Mexico_City_Grand_Prix_2025-10-26_Race", "2025-11-22_Las_Vegas_Grand_Prix_2025-11-22_Race",
      "2025-12-07_Abu_Dhabi_Grand_Prix_2025-12-07_Race"],
    valid: ["2025-03-23_Chinese_Grand_Prix_2025-03-23_Race", "2025-05-18_Emilia_Romagna_Grand_Prix_2025-05-18_Race", "2025-05-25_Monaco_Grand_Prix_2025-05-25_Race",
      "2025-06-15_Canadian_Grand_Prix_2025-06-15_Race", "2025-08-31_Dutch_Grand_Prix_2025-08-31_Race", "2025-09-21_Azerbaijan_Grand_Prix_2025-09-21_Race",
      "2025-10-05_Singapore_Grand_Prix_2025-10-05_Race", "2025-10-19_United_States_Grand_Prix_2025-10-19_Race", "2025-11-09_S_o_Paulo_Grand_Prix_2025-11-09_Race",
      "2025-11-30_Qatar_Grand_Prix_2025-11-30_Race"],
    excluded: { "2025-03-16_Australian_Grand_Prix_2025-03-16_Race": "rain", "2025-05-04_Miami_Grand_Prix_2025-05-04_Race": "rain in the race window",
      "2025-07-06_British_Grand_Prix_2025-07-06_Race": "rain", "2025-07-27_Belgian_Grand_Prix_2025-07-27_Race": "wet start (kept out of both sets)" },
  },
  2026: {
    calib: ["2026-03-08_Australian_Grand_Prix_2026-03-08_Race", "2026-05-03_Miami_Grand_Prix_2026-05-03_Race", "2026-06-14_Barcelona_Grand_Prix_2026-06-14_Race",
      "2026-07-05_British_Grand_Prix_2026-07-05_Race", "2026-09-06_Italian_Grand_Prix_2026-09-06_Race", "2026-10-04_Bahrain_Grand_Prix_2026-10-04_Race"],
    valid: ["2026-03-29_Japanese_Grand_Prix_2026-03-29_Race", "2026-05-24_Canadian_Grand_Prix_2026-05-24_Race", "2026-06-28_Austrian_Grand_Prix_2026-06-28_Race",
      "2026-07-26_Hungarian_Grand_Prix_2026-07-26_Race", "2026-09-13_Spanish_Grand_Prix_2026-09-13_Race", "2026-09-26_Azerbaijan_Grand_Prix_2026-09-26_Race",
      "2026-10-11_Singapore_Grand_Prix_2026-10-11_Race"],
    excluded: { "2026-06-07_Monaco_Grand_Prix_2026-06-07_Race": "no traces in the extract", "2026-08-23_Dutch_Grand_Prix_2026-08-23_Race": "rain" },
  },
};

// fitted coefficients (log space), their bounds from the PARAM ranges
export const FIT_KEYS = ["CdA", "ClA", "mu_mech", "P", "a_brake_max", "k_trac"];
const PRIOR_SIGMA = 0.35, W_LAP = 25;
// estimated fuel burn per km (kg) to put a plausible fuel mass on the trace lap: ≤2025 ≈ 100 kg / 305 km; 2026 ≈ 70 %
// (3000 MJ/h energy flow vs 100 kg/h × 43 MJ/kg). Game estimates (the feed has no fuel data).
const BURN_PER_KM = { 2024: 0.33, 2025: 0.33, 2026: 0.23 };
const WEAR_PER_LAP = 0.02; // tyre wear per lap of age for the trace lap's μ (estimate; small effect: fastest laps are on fresh-ish tyres)

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]] : a), []));

// ---------------------------------------------------------------------------------------------------------------------
// read-only cache access (CarData channel 45 = DRS ≤ 2025)
function cachedCarData(sessionPath) {
  const A = require("../../main/archive.js");
  const file = path.join(CACHE, `${sessionPath}CarData.z.jsonStream`.replace(/[^A-Za-z0-9._-]+/g, "_"));
  let text; try { text = fs.readFileSync(file, "utf8"); } catch { return null; }
  return A.flattenCarData(A.parseStream(text, true));
}

const inZone = (s, z, L, pad = 0) => (z.end >= z.start ? s >= z.start - pad && s <= z.end : s >= z.start - pad || s <= z.end);

export function loadRace(dir, id, { drs = true } = {}) {
  const S = JSON.parse(fs.readFileSync(path.join(dir, id + ".scenario.json"), "utf8"));
  const C = JSON.parse(fs.readFileSync(path.join(dir, id + ".calib.json"), "utf8"));
  const T = S.track, season = S.meta.season, N = S.race.laps;
  const track = { n: T.n, ds: T.ds, L: T.L, kappa: Float64Array.from(T.columns.kappa), grade: Float64Array.from(T.columns.grade) };
  const w = S.weather.cols, idx = w.t.map((t, i) => [t, i]).filter(([t]) => t >= 0 && t <= C.raceSeconds).map(([, i]) => i);
  const mean = (k) => { const a = idx.map((i) => w[k][i]).filter(Number.isFinite); return a.length ? a.reduce((x, y) => x + y) / a.length : null; };
  const air = mean("air") ?? 25, pMbar = mean("pressure") ?? 1013, tTrack = mean("track") ?? air + 10;
  const rho = airDensity(air, pMbar * 100);
  const drsZones = (T.zones.drs || []).map((z) => ({ start: z.start, end: z.end }));
  const straight = (T.zones.straight || []).map((z) => ({ start: z.start, end: z.end }));
  let cd = null, drsSource = "none (season without DRS)";
  if (season <= 2025 && drsZones.length) { cd = drs ? cachedCarData(S.meta.sessionPath) : null; drsSource = cd ? "CarData channel 45 (cache, read-only)" : "assumed closed (no cache)"; }
  const traces = [];
  for (const [num, tr] of Object.entries(C.traces || {})) {
    const D = C.drivers[num], lapRec = D?.laps.find((l) => l.lap === tr.lap);
    if (!lapRec || !lapRec.compound || !COMPOUNDS[DEFAULT_ALLOCATION[lapRec.compound]]) continue;
    const kind = COMPOUNDS[DEFAULT_ALLOCATION[lapRec.compound]].kind; if (kind !== "slick") continue;
    const v = Float64Array.from(tr.v.map((x) => (x == null ? NaN : x)));
    // DRS zones the car opened on this lap
    const open = [];
    if (cd && cd[num]) {
      const c = cd[num], t1 = C.lightsOutStreamMs + lapRec.tEnd * 1000, t0 = t1 - tr.time * 1000;
      const i0 = lower(c.t, t0), i1 = lower(c.t, t1);
      let d = 0; const ss = [], dd = [];
      for (let i = i0 + 1; i < i1; i++) { d += c.v[i] / 3.6 * (c.t[i] - c.t[i - 1]) / 1000; ss.push(d); dd.push(c.drs[i]); }
      const k = d > 0 ? T.L / d : 1;
      drsZones.forEach((z, zi) => { let n = 0; for (let j = 0; j < ss.length; j++) if (dd[j] >= 10 && dd[j] !== 255 && inZone(ss[j] * k, z, T.L, 150)) n++; if (n >= 2) open.push(zi); });
    }
    traces.push({ race: id, num, team: D.team, tla: D.tla, lap: tr.lap, time: tr.time, v, bin: tr.bin, compound: lapRec.compound, age: lapRec.age ?? 1,
      fuel: Math.max(1, BURN_PER_KM[season] * T.L / 1000 * (N - tr.lap) + 1), drsOpen: open });
  }
  // per-trace aero multiplier arrays are built on demand (they depend on the car's DRS/Straight Mode multipliers)
  return { id, season, track, rho, air, tTrack, pMbar, N, drsZones, straight, drsSource, traces, prof: makeProfile(T.n), drivers: C.drivers, periods: C.periods };
}
function lower(a, x) { let lo = 0, hi = a.length - 1; if (hi < 0 || a[0] > x) return 0; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= x) lo = m; else hi = m - 1; } return lo; }

// ---------------------------------------------------------------------------------------------------------------------
// one trace's prediction with car θ and race factor τ → { mse (km/h²), dLap (s), vPred (10 m bins) }
function aeroArrays(race, tr, base) {
  const key = "_aero" + tr.num; if (tr[key]) return tr[key];
  const n = race.track.n, ds = race.track.ds, cda = new Float64Array(n).fill(1), cla = new Float64Array(n).fill(1);
  const mark = (z, m) => { for (let i = 0; i < n; i++) if (inZone(i * ds, z, race.track.L)) { cda[i] = m.cdaMul; cla[i] = m.claMul; } };
  if (race.season >= 2026) race.straight.forEach((z) => mark(z, base.straightMode));
  else tr.drsOpen.forEach((zi) => mark(race.drsZones[zi], base.drs));
  return (tr[key] = { cda, cla });
}
function powerArray(race, car, prof, P) {
  // 2026: ICE (fitted) + MGU-K under the speed cap, scaled so the deployment over the lap fits the recharge per lap
  if (race.season < 2026) return P;
  const ep = energyParams(race.season), E = ep.ers, n = race.track.n, ds = race.track.ds;
  const arr = race._P || (race._P = new Float64Array(n)), vPrev = prof.vf;
  let eUse = 0; const pk = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const v = vPrev[i] > 1 ? vPrev[i] : 30, vk = v * 3.6, cap = vk >= E.capCut ? 0 : Math.min(E.pK, E.capA - E.capB * vk);
    const accel = vPrev[(i + 1) % n] > vPrev[i] + 1e-6; // deploy only where the car accelerates
    pk[i] = accel ? Math.max(0, cap) : 0; eUse += pk[i] * ds / v;
  }
  const f = eUse > E.harvestLapK ? E.harvestLapK / eUse : 1;
  for (let i = 0; i < n; i++) arr[i] = P + pk[i] * f;
  return arr;
}
function predict(race, tr, theta, tau, base) {
  const car = { ...base, CdA: theta.CdA, ClA: theta.ClA, mu_mech: theta.mu_mech, a_brake_max: theta.a_brake_max, k_trac: theta.k_trac };
  const aero = aeroArrays(race, tr, base);
  const cp = COMPOUNDS[DEFAULT_ALLOCATION[tr.compound]];
  const st = { m: base.m_min + tr.fuel, rho: race.rho, muTyre: cp.muRel * wearFactor(cp, Math.min(0.9, tr.age * WEAR_PER_LAP)), muTrack: tau, util: 1,
    cdaMul: aero.cda, claMul: aero.cla, P: theta.P, forward: true };
  let prof = computeProfile(race.track, car, st, race.prof);
  if (race.season >= 2026) { st.P = powerArray(race, car, prof, theta.P); prof = computeProfile(race.track, car, st, race.prof); st.P = powerArray(race, car, prof, theta.P); prof = computeProfile(race.track, car, st, race.prof); }
  // 10 m bins of the predicted speed (km/h)
  const nb = tr.v.length, ds = race.track.ds, n = race.track.n;
  let se = 0, cnt = 0; const vPred = new Float64Array(nb);
  for (let b = 0; b < nb; b++) {
    const i0 = Math.round(b * tr.bin / ds), i1 = Math.min(n, Math.round((b + 1) * tr.bin / ds));
    let s = 0, k = 0; for (let i = i0; i < i1; i++) { s += prof.vf[i]; k++; }
    vPred[b] = k ? s / k * 3.6 : NaN;
    if (Number.isFinite(tr.v[b]) && k) { const e = vPred[b] - tr.v[b]; se += e * e; cnt++; }
  }
  return { mse: cnt ? se / cnt : 0, dLap: prof.lapTime - tr.time, vPred, lapTime: prof.lapTime };
}

// ---------------------------------------------------------------------------------------------------------------------
// parameter vector handling
function bounds(season) {
  const T = CAR_BASE_TABLE[season];
  return { CdA: T.CdA.range, ClA: T.ClA.range, mu_mech: T.mu_mech.range, P: [300e3, season >= 2026 ? 650e3 : 900e3], a_brake_max: T.a_brake_max.range, k_trac: T.k_trac.range };
}
function theta0(season) {
  const b = carBase(season);
  return { CdA: b.CdA, ClA: b.ClA, mu_mech: b.mu_mech, P: season >= 2026 ? b.P_ice : b.P_ice + 120e3, a_brake_max: b.a_brake_max, k_trac: b.k_trac };
}
const toTheta = (z, t0, B) => Object.fromEntries(FIT_KEYS.map((k, i) => [k, Math.min(B[k][1], Math.max(B[k][0], t0[k] * Math.exp(z[i])))]));

function nelderMead(f, x0, { step = 0.08, evals = 450, tol = 1e-6 } = {}) {
  const n = x0.length; let pts = [x0.slice()]; for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step; pts.push(p); }
  let vals = pts.map(f), used = n + 1;
  while (used < evals) {
    const ord = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); pts = ord.map(([, i]) => pts[i]); vals = ord.map(([v]) => v);
    if (Math.abs(vals[n] - vals[0]) < tol * (1 + Math.abs(vals[0]))) break;
    const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
    const at = (t) => c.map((x, j) => x + t * (pts[n][j] - x));
    const xr = at(-1), fr = f(xr); used++;
    if (fr < vals[0]) { const xe = at(-2), fe = f(xe); used++; if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; } }
    else if (fr < vals[n - 1]) { pts[n] = xr; vals[n] = fr; }
    else { const xc = at(fr < vals[n] ? -0.5 : 0.5), fc = f(xc); used++;
      if (fc < Math.min(fr, vals[n])) { pts[n] = xc; vals[n] = fc; }
      else { for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((x, j) => pts[0][j] + 0.5 * (x - pts[0][j])); vals[i] = f(pts[i]); used++; } } }
  }
  let bi = 0; for (let i = 1; i <= n; i++) if (vals[i] < vals[bi]) bi = i;
  return { x: pts[bi], f: vals[bi], evals: used };
}
function golden(f, a, b, it = 24) { const g = (Math.sqrt(5) - 1) / 2; let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d); for (let k = 0; k < it; k++) { if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); } } return (a + b) / 2; }

const traceLoss = (p) => p.mse + W_LAP * p.dLap * p.dLap;

// ---------------------------------------------------------------------------------------------------------------------
export function calibrate({ season, scen, rounds = 3, evals = 450, log = console.log }) {
  const set = SETS[season], base = carBase(season), B = bounds(season), t0 = theta0(season);
  const load = (ids) => ids.filter((id) => fs.existsSync(path.join(scen, id + ".calib.json"))).map((id) => loadRace(scen, id));
  const cal = load(set.calib), val = load(set.valid);
  log(`season ${season}: ${cal.length} calibration races, ${val.length} validation races (air density, DRS source per race below)`);
  for (const r of [...cal, ...val]) log(`  ${r.id}: ρ ${r.rho.toFixed(3)} kg/m³ (air ${r.air.toFixed(1)} °C, ${r.pMbar.toFixed(0)} mbar), traces ${r.traces.length}, DRS: ${r.drsSource}`);
  const teams = [...new Set(cal.flatMap((r) => r.traces.map((t) => t.team)))].sort();
  const tau = Object.fromEntries([...cal, ...val].map((r) => [r.id, 1]));
  const theta = Object.fromEntries(teams.map((t) => [t, { ...t0 }]));
  const zOf = (th) => FIT_KEYS.map((k) => Math.log(th[k] / t0[k]));
  for (let round = 0; round < rounds; round++) {
    for (const team of teams) {
      const items = cal.flatMap((r) => r.traces.filter((t) => t.team === team).map((t) => [r, t]));
      if (!items.length) continue;
      const f = (z) => { const th = toTheta(z, t0, B); let s = 0; for (const [r, t] of items) s += traceLoss(predict(r, t, th, tau[r.id], base)); let pr = 0; for (const x of z) pr += (x / PRIOR_SIGMA) ** 2; return s / items.length + pr; };
      const res = nelderMead(f, zOf(theta[team]), { evals, step: round === 0 ? 0.1 : 0.04 });
      theta[team] = toTheta(res.x, t0, B);
    }
    // race factors τ (calibration races), then normalise their geometric mean to 1 (pushed into mu_mech)
    for (const r of cal) tau[r.id] = golden((x) => r.traces.reduce((s, t) => s + (theta[t.team] ? traceLoss(predict(r, t, theta[t.team], x, base)) : 0), 0), 0.8, 1.2);
    const gm = Math.exp(cal.reduce((s, r) => s + Math.log(tau[r.id]), 0) / cal.length);
    for (const r of cal) tau[r.id] /= gm; for (const t of teams) theta[t].mu_mech *= gm;
    const e = evaluate(cal, theta, tau, base);
    log(`round ${round + 1}: calibration speed RMS ${e.rmsV.toFixed(2)} km/h, lap |err| mean ${e.mae.toFixed(3)} s`);
  }
  // validation
  const tau1 = Object.fromEntries(val.map((r) => [r.id, 1]));
  const tauV = Object.fromEntries(val.map((r) => [r.id, golden((x) => r.traces.reduce((s, t) => s + (theta[t.team] ? traceLoss(predict(r, t, theta[t.team], x, base)) : 0), 0), 0.8, 1.2)]));
  const meanCar = Object.fromEntries(FIT_KEYS.map((k) => [k, Math.exp(teams.reduce((s, t) => s + Math.log(theta[t][k]), 0) / teams.length)]));
  const allMean = Object.fromEntries(teams.map((t) => [t, meanCar]));
  const generic = Object.fromEntries(teams.map((t) => [t, t0]));
  const tauGen = (races) => Object.fromEntries(races.map((r) => [r.id, golden((x) => r.traces.reduce((s, t) => s + (generic[t.team] ? traceLoss(predict(r, t, generic[t.team], x, base)) : 0), 0), 0.8, 1.2)]));
  const tauMean = (races) => Object.fromEntries(races.map((r) => [r.id, golden((x) => r.traces.reduce((s, t) => s + (allMean[t.team] ? traceLoss(predict(r, t, allMean[t.team], x, base)) : 0), 0), 0.8, 1.2)]));
  const out = {
    season, date: new Date().toISOString().slice(0, 10), calibrationRaces: cal.map((r) => r.id), validationRaces: val.map((r) => r.id), excluded: set.excluded,
    method: { fitted: FIT_KEYS, loss: `mean speed² error over 10 m bins (km/h²) + ${W_LAP}·lap error² (s²) + log prior σ ${PRIOR_SIGMA}`, rounds, evals, burnPerKm: BURN_PER_KM[season], wearPerLap: WEAR_PER_LAP },
    tau, tauValidationFitted: tauV, theta, meanCar,
    errors: {
      calibration: evaluate(cal, theta, tau, base),
      validationA_tau1: evaluate(val, theta, tau1, base),
      validationB_tauFitted: evaluate(val, theta, tauV, base),
      baselineGenericCar_validationB: evaluate(val, generic, tauGen(val), base),
      baselineSeasonMeanCar_calibration: evaluate(cal, allMean, tauMean(cal), base),
      baselineSeasonMeanCar_validationB: evaluate(val, allMean, tauMean(val), base),
    },
  };
  out.perTeam = Object.fromEntries(teams.map((t) => [t, { calibration: evaluate(cal, theta, tau, base, t), validationB: evaluate(val, theta, tauV, base, t), validationB_meanCar: evaluate(val, allMean, tauMean(val), base, t) }]));
  return out;
}

// errors of a set: speed RMS (km/h), mean |lap error| (s), mean lap error (bias), top speed error, slowest-corner error
export function evaluate(races, theta, tau, base, onlyTeam = null) {
  let se = 0, n = 0, ae = 0, be = 0, m = 0, topE = 0, minE = 0; const per = [];
  for (const r of races) for (const t of r.traces) {
    if (!theta[t.team] || (onlyTeam && t.team !== onlyTeam)) continue;
    const p = predict(r, t, theta[t.team], tau[r.id] ?? 1, base);
    se += p.mse; n++; ae += Math.abs(p.dLap); be += p.dLap; m++;
    let vmo = -1, vmp = -1, mo = 1e9, mp = 1e9;
    for (let b = 0; b < t.v.length; b++) if (Number.isFinite(t.v[b])) { if (t.v[b] > vmo) { vmo = t.v[b]; vmp = p.vPred[b]; } if (t.v[b] < mo) { mo = t.v[b]; mp = p.vPred[b]; } }
    topE += Math.abs(vmp - vmo); minE += Math.abs(mp - mo);
    per.push({ race: r.id, num: t.num, team: t.team, rmsV: +Math.sqrt(p.mse).toFixed(2), dLap: +p.dLap.toFixed(3) });
  }
  return { traces: n, rmsV: n ? Math.sqrt(se / n) : NaN, mae: m ? ae / m : NaN, bias: m ? be / m : NaN, topSpeedAbsErr: m ? topE / m : NaN, slowestCornerAbsErr: m ? minE / m : NaN, per: onlyTeam ? undefined : per };
}

// ---------------------------------------------------------------------------------------------------------------------
// Stage 2: tyre wear rate per compound name (SOFT / MEDIUM / HARD) from stint lap-time trends.
// Lap-level reduction of the same physics (no new equations): for a race and a team car, one reference lap at race pace
// (utilisation 0.99) gives the lap time T0, the tyre work per lap Q_lap = Σ(|a_lat| + |a_long|)·v·dt, and the lap time's
// sensitivities to mass (∂T/∂m) and to ln μ (∂T/∂ln μ). A stint's lap time then follows
//   T(age) = T0 + ∂T/∂m · (−burn per lap · laps run) + ∂T/∂ln μ · ln Gw(w(age)),   w(age) = kw(compound) · kwScale · Q_lap·T0 · age
// (window temperature assumed in range – thermal effects are not separable from these data). The observed trend is the
// least-squares slope of the clean laps (green, no pit in/out, not lap 1, within 4 % of the stint median: traffic and
// mistakes out); stints of ≥ 8 such laps. kwScale per compound name is fitted on the calibration races' stints and the
// slope error reported on the validation races, against two baselines: fuel only (no wear) and a constant slope (the
// calibration races' mean observed slope for that compound).
const STINT_MIN = 8, CLEAN_BAND = 0.04, RACE_UTIL = 0.99;
function slopeOf(xs, ys) { const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; } return sxx > 0 ? sxy / sxx : 0; }
export function stintsOf(race, teams) {
  const out = [];
  for (const [num, D] of Object.entries(race.drivers || {})) {
    if (!teams.has(D.team)) continue;
    const by = {};
    for (const l of D.laps) {
      if (l.status !== "green" || l.pitIn || l.pitOut || l.lap <= 1 || !Number.isFinite(l.time) || !l.compound || !DEFAULT_ALLOCATION[l.compound]) continue;
      if (COMPOUNDS[DEFAULT_ALLOCATION[l.compound]].kind !== "slick" || l.age == null) continue;
      (by[l.stint] || (by[l.stint] = [])).push(l);
    }
    for (const laps of Object.values(by)) {
      const med = [...laps].map((l) => l.time).sort((a, b) => a - b)[Math.floor(laps.length / 2)];
      const ok = laps.filter((l) => l.time < med * (1 + CLEAN_BAND));
      if (ok.length < STINT_MIN) continue;
      out.push({ race: race.id, num, team: D.team, compound: ok[0].compound, ages: ok.map((l) => l.age), laps: ok.map((l) => l.lap), times: ok.map((l) => l.time), obs: slopeOf(ok.map((l) => l.age), ok.map((l) => l.time)) });
    }
  }
  return out;
}
function refLap(race, theta, tau, base, compound) {
  const key = `_ref_${compound}_${theta.CdA}_${theta.P}`; if (race[key]) return race[key];
  const car = { ...base, CdA: theta.CdA, ClA: theta.ClA, mu_mech: theta.mu_mech, a_brake_max: theta.a_brake_max, k_trac: theta.k_trac };
  const cp = COMPOUNDS[DEFAULT_ALLOCATION[compound]], burn = BURN_PER_KM[race.season] * race.track.L / 1000;
  const m = base.m_min + Math.max(5, burn * race.N / 2);
  const P = race.season >= 2026 ? theta.P + 150e3 : theta.P; // 2026: a mean MGU-K share on race laps (estimate)
  const st = { m, rho: race.rho, muTyre: cp.muRel, muTrack: tau, util: RACE_UTIL, P, forward: true };
  const pr = computeProfile(race.track, car, st, makeProfile(race.track.n)), T0 = pr.lapTime;
  let Q = 0; const n = race.track.n, ds = race.track.ds, vf = pr.vf;
  for (let i = 0; i < n; i++) { const a = vf[i], b = vf[(i + 1) % n], dt = 2 * ds / (a + b), vm = 0.5 * (a + b); Q += (Math.abs(vm * vm * race.track.kappa[i]) + Math.abs((b * b - a * a) / (2 * ds))) * vm * dt; }
  const Tm = computeProfile(race.track, car, { ...st, m: m + 10 }, makeProfile(n)).lapTime, Tu = computeProfile(race.track, car, { ...st, muTyre: cp.muRel * 1.01 }, makeProfile(n)).lapTime;
  return (race[key] = { T0, Q, dTdm: (Tm - T0) / 10, dTdlnmu: (Tu - T0) / Math.log(1.01), burn, cp });
}
function predSlope(st, ref, scale) {
  const ys = st.ages.map((a, i) => { const w = Math.min(1, ref.cp.kw * scale * ref.Q * a); return ref.dTdm * (-ref.burn * (st.laps[i] - st.laps[0])) + ref.dTdlnmu * Math.log(wearFactor(ref.cp, w)); });
  return slopeOf(st.ages, ys);
}
export function calibrateTyres({ season, scen, theta, tau, log = console.log }) {
  const set = SETS[season], base = carBase(season), teams = new Set(Object.keys(theta));
  const load = (ids) => ids.filter((id) => fs.existsSync(path.join(scen, id + ".calib.json"))).map((id) => loadRace(scen, id, { drs: false }));
  const cal = load(set.calib), val = load(set.valid);
  const items = (races) => races.flatMap((r) => stintsOf(r, teams).map((st) => ({ st, ref: refLap(r, theta[st.team], tau[r.id] ?? 1, base, st.compound) })));
  const ci = items(cal), vi = items(val);
  const names = [...new Set(ci.map((x) => x.st.compound))].sort();
  const scale = {}, meanObs = {};
  for (const c of names) {
    const xs = ci.filter((x) => x.st.compound === c);
    // robust (Huber, δ 0.05 s/lap) – stints with an undetected slow-down (traffic) should not dominate
    const hub = (e) => (Math.abs(e) < 0.05 ? e * e : 0.1 * Math.abs(e) - 0.0025);
    scale[c] = golden((k) => xs.reduce((s, x) => s + hub(predSlope(x.st, x.ref, k) - x.st.obs), 0), 0, 8, 30);
    meanObs[c] = xs.reduce((s, x) => s + x.st.obs, 0) / xs.length;
  }
  const err = (xs, f) => { const e = xs.filter((x) => scale[x.st.compound] != null).map((x) => f(x) - x.st.obs); return { stints: e.length, rms: Math.sqrt(e.reduce((s, x) => s + x * x, 0) / Math.max(1, e.length)), bias: e.reduce((s, x) => s + x, 0) / Math.max(1, e.length) }; };
  const res = {
    season, date: new Date().toISOString().slice(0, 10), calibrationRaces: cal.map((r) => r.id), validationRaces: val.map((r) => r.id),
    method: { stintMinLaps: STINT_MIN, cleanBand: CLEAN_BAND, raceUtil: RACE_UTIL, burnPerKm: BURN_PER_KM[season], allocation: DEFAULT_ALLOCATION },
    kwScale: scale, meanObservedSlopeCalib: meanObs,
    fuelSensitivity: { meanDTdm_sPerKg: ci.reduce((s, x) => s + x.ref.dTdm, 0) / Math.max(1, ci.length) },
    errors: {
      calibration: err(ci, (x) => predSlope(x.st, x.ref, scale[x.st.compound])),
      validation: err(vi, (x) => predSlope(x.st, x.ref, scale[x.st.compound])),
      validation_defaultScale1: err(vi, (x) => predSlope(x.st, x.ref, 1)),
      validation_fuelOnly: err(vi, (x) => predSlope(x.st, x.ref, 0)),
      validation_constantMeanSlope: err(vi, (x) => meanObs[x.st.compound]),
    },
    perCompound: Object.fromEntries(names.map((c) => [c, { calibStints: ci.filter((x) => x.st.compound === c).length, validStints: vi.filter((x) => x.st.compound === c).length,
      validation: err(vi.filter((x) => x.st.compound === c), (x) => predSlope(x.st, x.ref, scale[c])), validation_constant: err(vi.filter((x) => x.st.compound === c), () => meanObs[c]) }])),
  };
  log(`tyres ${season}: ${ci.length} calibration stints, ${vi.length} validation stints; mean ∂T/∂m ${res.fuelSensitivity.meanDTdm_sPerKg.toFixed(4)} s/kg`);
  for (const c of names) log(`  ${c}: kwScale ${scale[c].toFixed(3)} (calib mean observed slope ${meanObs[c].toFixed(3)} s/lap), validation slope RMS ${res.perCompound[c].validation.rms.toFixed(3)} s/lap vs constant ${res.perCompound[c].validation_constant.rms.toFixed(3)} (${res.perCompound[c].validStints} stints)`);
  for (const [k, v] of Object.entries(res.errors)) log(`  ${k}: slope RMS ${v.rms.toFixed(3)} s/lap, bias ${v.bias.toFixed(3)} (${v.stints} stints)`);
  return res;
}
export function writeTyreParams(res, file) {
  const e = res.errors, src = `calibrate.mjs stint fit ${res.date} on ${res.calibrationRaces.length} ${res.season} races; slope RMS calib ${e.calibration.rms.toFixed(3)} s/lap, validation ${e.validation.rms.toFixed(3)} s/lap (fuel-only ${e.validation_fuelOnly.rms.toFixed(3)}, constant ${e.validation_constantMeanSlope.rms.toFixed(3)}) on ${res.validationRaces.length} other races`;
  const L = [`// GENERATED by src/game/tools/calibrate.mjs (${res.date}) – tyre wear-rate multipliers by race compound name for ${res.season}.`,
    `// Multiplies the compound's kw (tyres.js, via the event allocation; this fit used ${JSON.stringify(res.method.allocation)}).`,
    `// Calibration races: ${res.calibrationRaces.join(", ")}`, `// Validation races: ${res.validationRaces.join(", ")}`,
    `import { P } from "./param.js";`, `const fit = (v, meaning) => P(v, "1", meaning, ${JSON.stringify(src)}, [0, 8], true, "L");`, `export const TYRES_${res.season}_TABLE = {`];
  for (const [c, k] of Object.entries(res.kwScale)) L.push(`  ${c}: { kwScale: fit(${+k.toPrecision(4)}, ${JSON.stringify(`wear-rate multiplier for ${c} stints (${res.perCompound[c].calibStints} calibration stints)`)}) },`);
  L.push(`};`);
  fs.writeFileSync(file, L.join("\n") + "\n");
}

// ---------------------------------------------------------------------------------------------------------------------
// the params file with provenance (est: true – fitted game values, not team figures)
export function writeParams(res, file) {
  const B = bounds(res.season), U = { CdA: "m²", ClA: "m²", mu_mech: "1", P: "W", a_brake_max: "m/s²", k_trac: "1" };
  const M = { CdA: "drag area (wings closed)", ClA: "downforce area (wings closed)", mu_mech: "peak tyre–road μ (C3-equivalent, fresh, in window; per-race track factor τ = 1)",
    P: res.season >= 2026 ? "ICE power at the wheels (MGU-K added by the energy model under the 2026 speed cap)" : "wheel power on a fast race lap (ICE + MGU-K deployment)", a_brake_max: "braking deceleration cap", k_trac: "traction share of total grip" };
  const e = res.errors, src = `calibrate.mjs fit ${res.date} on ${res.calibrationRaces.length} ${res.season} races (${res.calibrationRaces.map((x) => x.slice(11).replace(/_Grand_Prix.*$/, "")).join(", ")}); calib speed RMS ${e.calibration.rmsV.toFixed(1)} km/h, validation (τ fitted) ${e.validationB_tauFitted.rmsV.toFixed(1)} km/h on ${res.validationRaces.length} other races`;
  const L = [];
  L.push(`// GENERATED by src/game/tools/calibrate.mjs (${res.date}) – per-team car coefficients for ${res.season}. Do not edit by hand: re-run the tool.`);
  L.push(`// Fitted game values (est: true): the speed traces identify combinations of these numbers, not a team's real figures.`);
  L.push(`// Calibration races: ${res.calibrationRaces.join(", ")}`);
  L.push(`// Validation races: ${res.validationRaces.join(", ")}`);
  L.push(`// Errors (speed RMS km/h / mean |lap| s): calibration ${e.calibration.rmsV.toFixed(2)} / ${e.calibration.mae.toFixed(3)}; validation τ=1 ${e.validationA_tau1.rmsV.toFixed(2)} / ${e.validationA_tau1.mae.toFixed(3)}; validation τ fitted ${e.validationB_tauFitted.rmsV.toFixed(2)} / ${e.validationB_tauFitted.mae.toFixed(3)}`);
  L.push(`import { P } from "./param.js";`);
  L.push(`const fit = (v, unit, meaning, range) => P(v, unit, meaning, ${JSON.stringify(src)}, range, true, "M");`);
  L.push(`export const CARS_${res.season}_TABLE = {`);
  for (const [team, th] of Object.entries(res.theta)) {
    const pe = res.perTeam[team];
    L.push(`  ${JSON.stringify(team)}: { // calib RMS ${pe.calibration.rmsV.toFixed(2)} km/h (${pe.calibration.traces} traces), validation RMS ${pe.validationB.rmsV.toFixed(2)} km/h (${pe.validationB.traces} traces; season-mean car: ${pe.validationB_meanCar.rmsV.toFixed(2)})`);
    for (const k of FIT_KEYS) {
      const key = k === "P" ? (res.season >= 2026 ? "P_ice" : "P_fast") : k;
      L.push(`    ${key}: fit(${+th[k].toPrecision(5)}, ${JSON.stringify(U[k])}, ${JSON.stringify(M[k])}, ${JSON.stringify(B[k])}),`);
    }
    L.push(`  },`);
  }
  L.push(`};`);
  L.push(`// per-race track grip factors τ found on the calibration races (μ multiplier; geometric mean 1) – circuit data, for reference`);
  L.push(`export const TRACK_TAU_${res.season} = ${JSON.stringify(Object.fromEntries(res.calibrationRaces.map((id) => [id, +res.tau[id].toFixed(4)])), null, 0)};`);
  fs.writeFileSync(file, L.join("\n") + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const season = +(args.season || 2025), scen = args.scen || path.join(WORK, "scenarios"), outDir = args.out || path.join(WORK, "calib");
  const paramsDir = args.params || path.join(path.dirname(new URL(import.meta.url).pathname), "../data/params");
  fs.mkdirSync(outDir, { recursive: true });
  const logLines = []; const log = (s) => { console.log(s); logLines.push(s); };
  const t0 = process.hrtime.bigint();
  if (args["tyres-only"]) { // stage 2 alone, from a previous car fit
    const prev = JSON.parse(fs.readFileSync(path.join(outDir, `cars-${season}.json`), "utf8"));
    const tr = calibrateTyres({ season, scen, theta: prev.theta, tau: prev.tau, log });
    fs.writeFileSync(path.join(outDir, `tyres-${season}.json`), JSON.stringify(tr, null, 1));
    fs.writeFileSync(path.join(outDir, `tyres-${season}.log`), logLines.join("\n") + "\n");
    if (!args["no-write"]) writeTyreParams(tr, path.join(paramsDir, `tyres-${season}.js`));
    process.exit(0);
  }
  const res = calibrate({ season, scen, rounds: +(args.rounds || 3), evals: +(args.evals || 450), log });
  const e = res.errors;
  for (const [k, v] of Object.entries(e)) log(`${k}: speed RMS ${v.rmsV.toFixed(2)} km/h, lap |err| ${v.mae.toFixed(3)} s (bias ${v.bias.toFixed(3)}), top speed |err| ${v.topSpeedAbsErr.toFixed(1)} km/h, slowest corner |err| ${v.slowestCornerAbsErr.toFixed(1)} km/h, ${v.traces} traces`);
  for (const [t, p] of Object.entries(res.perTeam)) log(`  ${t}: calib ${p.calibration.rmsV.toFixed(2)} | valid ${p.validationB.rmsV.toFixed(2)} (mean car ${p.validationB_meanCar.rmsV.toFixed(2)}) km/h  θ ${FIT_KEYS.map((k) => k + "=" + (+res.theta[t][k].toPrecision(4))).join(" ")}`);
  log(`time ${(Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1)} s`);
  fs.writeFileSync(path.join(outDir, `cars-${season}.json`), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(outDir, `cars-${season}.log`), logLines.join("\n") + "\n");
  if (!args["no-write"]) writeParams(res, path.join(paramsDir, `cars-${season}.js`));
}
