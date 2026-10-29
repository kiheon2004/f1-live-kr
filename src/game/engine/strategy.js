// Strategy estimator (DESIGN §1 ai.js, request §3, §10, §11, §13): what a team can work out about the race with only what
// it may know. Pure and fast; used by the pre-race strategy screen (preRaceStrategy) and by the team AI (ai.js).
//
// What a team knows (and this module reads – nothing else):
//   – its OWN car and drivers (car coefficients, driver pace/tyre style, its cars' tyre wear/temps, fuel, energy);
//   – the event's public facts: track geometry, pit-lane path/limiter/box places, the compounds nominated, season rules;
//   – public timing: positions, gaps, lap times, pit stops and lane times of every car, each car's compound and tyre age;
//   – the forecast (weather.js forecastAt – the same product the player sees), the weather NOW (rain, track water,
//     temperatures: visible to everyone), race control's flag (SC/VSC/red; a missing control module = green).
// What it never reads: another team's tyre wear, fuel or modes, the weather truth's future, the true tyre coefficients
// as such (its tyre model is the physics defaults × an error it doesn't know, corrected from its own laps), future
// incidents, pit-stop outcomes before they happen.
//
// The team's lap-time model (one per team, race.cache – rebuilt identically on load: it depends only on the scenario, the
// seed and the team):
//   LT(μ)  lap time vs the grip product μ = μ_tyre·μ_track·util – from the team's own car through profile.js (forward pass)
//          at a reference mass, plus kFuel (s/kg) from a second mass;
//   μ_tyre(compound, mode, age): a VIRTUAL STINT – the team's copy of the tyre equations (tyre.js) driven by its own car's
//          speed trace on this track, with the compound coefficients the team believes (defaults × seeded error);
//   lap time = LT(μ_tyre(age·g)·S(water)·μ_track·util) + kFuel·(fuel − fuelRef) + offset(car)
//          g: the team's wear-rate correction learned from its own wear readings; offset: learned from its own clean laps.
// Race-time candidates: stints (compound, length, pace mode) chosen by a small DP over the remaining laps (stint cost does
// not depend on when the stint is run – fuel is a separate additive term), then each candidate is evaluated in N seeded
// scenarios (wear error, safety car laps, rain timelines drawn from the forecast) with reactive rules (stop early under an
// SC, switch tyres when the other tyre is clearly faster on the water there) → mean, σ, p10/p90 of the race time.
// Traffic (lap-level forecast of the field from public timing) adds the time a candidate would spend held behind cars –
// undercut/overcut come out of fresh-tyre pace, pit loss and that traffic, not from a bonus.
import { computeProfile, makeProfile } from "./profile.js";
import { windowFactor, wearFactor, waterFactor, fitTemp } from "./tyre.js";
import { createEnergy, ersCap } from "./energy.js";
import { forecastAt, truthAt } from "./weather.js";
import { streamFor } from "./rng.js";
import { COMPOUNDS, TYRE_THERMAL as TH } from "../data/params/tyres.js";
import { PACE_MODES, DRIVER_DEFAULT, UTIL_MAX } from "../data/params/drivers.js";
import { PIT } from "../data/params/pit.js";
import { WEATHER } from "../data/params/weather.js";
import { airDensity } from "../data/params/physics.js";
import { AI } from "../data/params/ai.js";
import R2024 from "../data/rules/2024.js";
import R2025 from "../data/rules/2025.js";
import R2026 from "../data/rules/2026.js";

const G = 9.81;
export const DRY = ["SOFT", "MEDIUM", "HARD"], WETS = ["INTERMEDIATE", "WET"];
export const MODES = ["balanced", "manage", "attack"];
const RULES = { 2024: R2024, 2025: R2025, 2026: R2026 };
export const rulesFor = (season) => RULES[season] || (season >= 2026 ? R2026 : R2025);
const STREET = /monaco|marina bay|singapore|baku|jeddah|las vegas/i;
export const isStreet = (sc) => STREET.test(`${sc.meta?.event || ""} ${sc.meta?.venue?.name || ""} ${sc.meta?.location || ""}`);
const BIG = 1e7;

// ---------- small helpers ----------
const interp = (arr, x) => { const n = arr.length - 1; if (!(x > 0)) return arr[0]; if (x >= n) return arr[n]; const i = Math.floor(x), f = x - i; return arr[i] + (arr[i + 1] - arr[i]) * f; };
const median = (a) => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const Phi = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
const flagOf = (race) => race.state.control?.flag || "green";   // (no control module: green)
const ownCars = (race, team) => race.state.cars.filter((c) => c.teamKey === team);

// the dry compounds this event offers (the Pirelli nomination when the research data has it – est false; else the
// compounds the scenario lists, marked as such), plus the two wet tyres
export function available(race) {
  const C = race.cache, sc = race.scenario;
  if (C.alloc && !C.alloc.est) return { dry: DRY.slice(), wet: WETS.slice(), source: "Pirelli nomination (research data)" };
  const seen = (sc.tyres?.compoundsSeen || []).filter((c) => DRY.includes(c));
  return { dry: seen.length >= 2 ? DRY.filter((c) => seen.includes(c)) : DRY.slice(), wet: WETS.slice(), source: seen.length >= 2 ? "scenario compound list (est)" : "default S/M/H (est)" };
}

// the season's tyre rule as the estimator applies it: { minDry, minSets, exemptWet, text }
export function tyreRule(race) {
  const R = rulesFor(race.state.season), M = R.mandatoryDryCompounds?.value, sc = race.scenario;
  if (!M) return { minDry: 1, minSets: 1, exemptWet: true, text: "no mandatory-compound rule in the season data", src: null };
  const monaco = M.monaco && /monaco/i.test(`${sc.meta?.event || ""} ${sc.meta?.location || ""}`);
  return { minDry: M.minDistinctDrySpecs || 2, minSets: monaco ? M.monaco.minSetsAnySpec : 1, exemptWet: !!M.exemptIfInterOrWetUsed,
    text: `건조 컴파운드 ${M.minDistinctDrySpecs || 2}종 이상${monaco ? ` · 모나코 ${M.monaco.minSetsAnySpec}세트 이상` : ""}${M.exemptIfInterOrWetUsed ? " (인터/웨트 사용 시 면제)" : ""}`,
    src: R.mandatoryDryCompounds.src };
}
// does a set of used compounds + sets satisfy the rule?
export function ruleOk(rule, used, sets) {
  if (rule.exemptWet && used.some((c) => WETS.includes(c))) return true;
  return new Set(used.filter((c) => DRY.includes(c))).size >= rule.minDry && sets >= rule.minSets;
}

// ---------- the team's model ----------
export function teamModel(race, team) {
  const C = race.cache; C.aiModels ||= {};
  return C.aiModels[team] || (C.aiModels[team] = buildModel(race, team));
}

function buildModel(race, team) {
  const C = race.cache, S = race.state, sc = race.scenario, T = C.T, PT = C.PT;
  const cars = ownCars(race, team), num0 = cars[0].num, cp = C.cars[num0], ep = C.ep;
  const r = streamFor(S.seed, `ai:prior:${team}`);
  const errScale = Math.exp(AI.errScaleSd * r.normal());          // how good this team's reading is this weekend
  const w0 = truthAt(C.truth, 0, {}), Tair = w0.airT ?? 25, Ttrack = w0.trackT ?? Tair + 10, rho = airDensity(Tair);
  const drivers = {}; for (const c of cars) drivers[c.num] = { ...DRIVER_DEFAULT, ...(C.drivers[c.num] || {}) };
  const tm = cars.reduce((s, c) => s + drivers[c.num].tyreMgmt, 0) / cars.length, pace = cars.reduce((s, c) => s + drivers[c.num].pace, 0) / cars.length;
  const P = cp.P_ice + ersCap(createEnergy(ep, {}), ep, "balanced", 50, false);
  // track grip: what practice running tells a team about this track's grip level (the race's track factor τ where one is
  // known – a property of the circuit and its surface, not of the race's outcome – × the rubbered-in level), with an error
  const fuel0 = ep.fuel.max, fuelRef = fuel0 / 2, mRef = cp.m_min + fuelRef;
  const muTrack = (WEATHER.rubberMin.v + WEATHER.rubberMax.v) / 2 * (C.tau ?? 1) * Math.exp(AI.gripErrSd * errScale * r.normal());
  // LT(μ): lap time of the team's car vs the grip product, at the reference mass
  const muGrid = [], ltGrid = [], prof = makeProfile(T.n);
  for (let mu = 0.30; mu <= 1.20001; mu += 0.025) { computeProfile(PT, cp, { muTyre: mu, muTrack: 1, util: 1, m: mRef, P, rho, forward: true }, prof); muGrid.push(mu); ltGrid.push(prof.lapTime); }
  computeProfile(PT, cp, { muTyre: 0.95, muTrack: 1, util: 1, m: mRef + 20, P, rho, forward: true }, prof); const ltHeavy = prof.lapTime;
  computeProfile(PT, cp, { muTyre: 0.95, muTrack: 1, util: 1, m: mRef, P, rho, forward: true }, prof);
  const kFuel = (ltHeavy - prof.lapTime) / 20;
  // the compounds as the team believes them: physics defaults × a seeded error (never the race's own calibration)
  const av = available(race), belief = {};
  for (const name of [...av.dry, ...av.wet]) {
    const code = C.alloc?.[name] || name, base = COMPOUNDS[code]; if (!base) continue;
    belief[name] = { ...base, code, kw: base.kw * Math.exp(AI.kwErrSd * errScale * r.normal()), muRel: base.muRel + AI.muErrSd * errScale * r.normal() };
  }
  // the speed trace of one lap for a compound/mode (fresh tyre in its window) → per-sample v, dt, Q-base
  const trace = (cpT, util, water) => {
    computeProfile(PT, cp, { muTyre: cpT.muRel * waterFactor(cpT, water), muTrack, util, m: mRef, P, rho, forward: true }, prof);
    const n = T.n, step = 3, m = Math.ceil(n / step), v = new Float64Array(m), dt = new Float64Array(m), q = new Float64Array(m);
    for (let k = 0; k < m; k++) {
      const i = (k * step) % n, j = Math.min(n, k * step + step) % n, a = prof.vf[i], b = prof.vf[j], ds = T.ds * Math.min(step, n - k * step);
      const vm = Math.max(1, (a + b) / 2); v[k] = vm; dt[k] = ds / vm;
      q[k] = (vm * vm * Math.abs(PT.kappa[i]) + Math.abs((b * b - a * a) / (2 * ds))) * vm;
    }
    return { v, dt, q };
  };
  // virtual stint: the team's copy of tyre.js's two-node thermal model and wear law, lap by lap over the trace
  const A = AI.vsAgeLaps, season = S.season;
  const stint = (name, mode, water) => {
    const cpT = belief[name], pm = PACE_MODES[mode], util = pace * pm.util, heat = (cp.C_tyre_heat ?? 1) * tm * pm.heat;
    const tr = trace(cpT, Math.min(UTIL_MAX, util), water), dry = water > 0 ? Math.exp(-water / 0.3) : 1, dh = 1 + (cpT.dryHeat - 1) * dry, dwm = 1 + (cpT.dryWear - 1) * dry;
    let Ts = fitTemp(season, cpT.code, Tair), Tc = Ts, w = 0;
    const mu = new Float64Array(A + 1), wear = new Float64Array(A + 1);
    for (let a = 0; a <= A; a++) {
      wear[a] = w; let muSum = 0, tSum = 0;
      for (let k = 0; k < tr.v.length; k++) {
        const v = tr.v[k], d = tr.dt[k], Q = tr.q[k] * heat * dh;
        const dTs = TH.kq * Q - (TH.ha0 + TH.ha1 * v + TH.hw * water) * (Ts - Tair) - TH.hr * (Ts - Ttrack) - TH.hsc * (Ts - Tc);
        const dTc = TH.hcs * (Ts - Tc) - TH.hcl * (Tc - Tair);
        Ts = Math.min(TH.Thi, Math.max(TH.Tlo, Ts + dTs * d)); Tc = Math.min(TH.Thi, Math.max(TH.Tlo, Tc + dTc * d));
        const Tw = TH.wSurf * Ts + (1 - TH.wSurf) * Tc, over = Tw > cpT.winHi ? Tw - cpT.winHi : 0;
        w = Math.min(1, w + cpT.kw * Q * (1 + cpT.kH * over / 10) * dwm * d);
        muSum += cpT.muRel * windowFactor(cpT, Tw) * wearFactor(cpT, w) * d; tSum += d;
      }
      mu[a] = muSum / tSum;
    }
    return { mu, wear };
  };
  const vs = {};
  for (const name of av.dry) { vs[name] = {}; for (const mode of MODES) vs[name][mode] = stint(name, mode, 0); }
  for (const name of av.wet) if (belief[name]) { const t = stint(name, "balanced", 0); t.wet = stint(name, "balanced", name === "WET" ? 2.5 : AI.hRain); vs[name] = { balanced: t, manage: t, attack: t }; }
  // pit loss: the lane walked with the pit model's own public rules (limiter, box approach/launch, typical stationary time)
  // against the same stretch on the lap at the team's free pace; the team's prior error on top
  const L = T.pit, lim = L.speedLimit, boxU = L.boxes?.[team] ?? (L.limStart + L.limEnd) / 2;
  computeProfile(PT, cp, { muTyre: 0.95, muTrack, util: pace, m: mRef, P, rho, forward: true }, prof);
  let ref = 0; { const i0 = T.idx(L.sIn), len = Math.round(T.ahead(L.sIn, L.sOut) / T.ds); for (let k = 0; k < len; k++) { const i = (i0 + k) % T.n, j = (i + 1) % T.n; ref += (2 * T.ds) / Math.max(1, prof.vf[i] + prof.vf[j]); } }
  // walk the lane at 1 m with the pit model's caps: braking to the limiter (2.5 g), the limiter, stop in the box (approach
  // decel, stationary, launch), the limiter end, accelerating out (1.2 g, ≤ 80 m/s) – the same rules pit.js applies
  const vIn = prof.vf[T.idx(L.sIn)], aE = 2.5 * G, aIn = PIT.boxApproach.v * G, aOut = PIT.launch.v * G;
  let laneModel = PIT.workBase.v, vPrev = vIn;
  for (let u = 0; u < L.L; u += 1) {
    let v;
    if (u < L.limStart) v = Math.min(vIn, Math.sqrt(lim * lim + 2 * aE * (L.limStart - u)));
    else if (u < L.limEnd) v = Math.max(0.5, Math.min(lim, Math.sqrt(2 * aIn * Math.abs(boxU - u) + 0.25), u > boxU ? Math.sqrt(2 * aOut * (u - boxU) + 0.25) : Infinity));
    else v = Math.min(80, vPrev + 1.2 * G / Math.max(1, vPrev));
    laneModel += 1 / v; vPrev = v;
  }
  const lanePrior = laneModel + AI.laneErrSd * errScale * r.normal();
  return { team, nums: cars.map((c) => c.num), drivers, cp, muGrid, ltGrid, kFuel, fuelRef, fuel0, muTrack, pace, tm, belief, vs, av, A,
    lanePrior, laneModel, refPit: ref, boxU, errScale, street: isStreet(sc), Tair, Ttrack, rule: tyreRule(race),
    fuelPerLap: fuel0 / Math.max(1, S.totalLaps) * 0.97, scLapS: ltOfMu({ muGrid, ltGrid }, 0.95 * muTrack * pace) * 1.45 };
}

// lap time vs grip product (s): LT is decreasing in μ; linear between grid points, extrapolated at the ends
export function ltOfMu(M, mu) {
  const g = M.muGrid, l = M.ltGrid, n = g.length;
  if (mu <= g[0]) return l[0] + (l[1] - l[0]) / (g[1] - g[0]) * (mu - g[0]);
  if (mu >= g[n - 1]) return l[n - 1] + (l[n - 1] - l[n - 2]) / (g[n - 1] - g[n - 2]) * (mu - g[n - 1]);
  const x = (mu - g[0]) / (g[1] - g[0]), i = Math.floor(x), f = x - i; return l[i] + (l[i + 1] - l[i]) * f;
}

// the team's estimate of one lap (s): est = { g (wear-rate factor, from its wear readings), s (degradation scale, from its
// lap times), off: {num: s} (car offset) }. lap = LT at age 0 + s·(LT at age·g − LT at age 0) + fuel + offset: the
// physics model gives the shape, the team's own laps the size (teams fit "deg per lap" from their stints the same way).
// Water: a slick's grip × S(h); a wet tyre between its dry-surface table (overheating, wear) and its wet one by dryness.
export function lapTime(M, est, num, name, mode, age, water = 0, fuel = M.fuelRef) {
  const v = M.vs[name] || M.vs.MEDIUM || Object.values(M.vs)[0], t = (v[mode] || v.balanced), cpT = M.belief[name];
  const d = M.drivers[num] || { pace: M.pace }, k = M.muTrack * Math.min(UTIL_MAX, d.pace * PACE_MODES[mode].util), ae = age * (est?.g ?? 1);   // (the driver can't use more than the car's limit: driver.js caps it)
  let mu0 = t.mu[0], mua = interp(t.mu, ae);
  if (t.wet) { const dry = water > 0 ? Math.exp(-water / 0.3) : 1; mu0 = dry * mu0 + (1 - dry) * t.wet.mu[0]; mua = dry * mua + (1 - dry) * interp(t.wet.mu, ae); }
  const S = water > 0 && cpT ? waterFactor(cpT, water) : 1, lt0 = ltOfMu(M, mu0 * S * k), lta = ltOfMu(M, mua * S * k);
  return lt0 + (est?.sc?.[name] ?? est?.s ?? 1) * (lta - lt0) + M.kFuel * (fuel - M.fuelRef) + (est?.off?.[num] ?? 0);
}
// the model's degradation part of a lap (s, before the scale s and the offset): for learning s
export const degPart = (M, est, num, name, mode, age) => lapTime(M, { g: est?.g, s: 1 }, num, name, mode, age) - lapTime(M, { g: est?.g, s: 1 }, num, name, mode, 0);   // (s: 1 and no sc – the model's own shape)
// the wear the team expects after `age` laps (for learning g from its own readings)
export const wearAt = (M, name, mode, age) => interp((M.vs[name]?.[mode] || M.vs[name]?.balanced || { wear: [0] }).wear, age);

// the team's present pit-loss estimate (s) under a flag
export function pitLoss(M, est, flag = "green") {
  const lane = est?.lane ?? M.lanePrior, loss = Math.max(5, lane - M.refPit);
  return flag === "sc" ? loss * AI.scLossK : flag === "vsc" ? loss * AI.vscLossK : loss;
}

// ---------- candidates: DP over the remaining laps ----------
// state: { num, lap (laps completed), total, cur: { name, age } | null (pre-race), used: [names], sets, fuel }
// returns candidates sorted by cost: { stints: [{ compound, laps, mode }], stops, cost, window: [lo, hi] (next stop's in-lap range within +2 s) }
export function planCandidates(M, est, st, { flag = "green", maxStops = 4, compounds = null, top = 8 } = {}) {
  const R = st.total - st.lap; if (R <= 0) return [];
  const dry = compounds || M.av.dry, loss = pitLoss(M, est, "green"), loss0 = pitLoss(M, est, flag);
  // stint cost tables: best mode for each (compound, length) over fresh tyres
  const fresh = {};
  for (const c of dry) {
    const cost = new Float64Array(R + 1).fill(BIG), mode = new Array(R + 1).fill("balanced");
    const pre = {}; for (const m of MODES) { const p = new Float64Array(R + 1); for (let a = 0; a < R; a++) p[a + 1] = p[a] + lapTime(M, est, st.num, c, m, a); pre[m] = p; }
    cost[0] = 0; for (let n = 1; n <= R; n++) for (const m of MODES) if (pre[m][n] < cost[n]) { cost[n] = pre[m][n]; mode[n] = m; }
    fresh[c] = { cost, mode };
  }
  // the first stint: the current set (in-race) or a fresh one of each start compound (pre-race)
  const firsts = st.cur ? [st.cur] : dry.map((c) => ({ name: c, age: 0 }));
  const out = [];
  const multisets = []; const rec = (k, from, acc) => { multisets.push(acc.slice()); if (k === maxStops) return; for (let i = from; i < dry.length; i++) { acc.push(dry[i]); rec(k + 1, i, acc); acc.pop(); } }; rec(0, 0, []);
  for (const f of firsts) {
    const cur = new Float64Array(R + 1).fill(BIG), curMode = new Array(R + 1).fill("balanced");
    { const pre = {}; for (const m of MODES) { const p = new Float64Array(R + 1); for (let a = 0; a < R; a++) p[a + 1] = p[a] + lapTime(M, est, st.num, f.name, m, f.age + a); pre[m] = p; }
      for (let n = 1; n <= R; n++) for (const m of MODES) if (pre[m][n] < cur[n]) { cur[n] = pre[m][n]; curMode[n] = m; } }
    for (const ms of multisets) {
      if (ms.length > R - 1) continue;
      const used = [...(st.used || []), f.name, ...ms], sets = (st.sets || (st.cur ? 1 : 0)) + (st.cur ? 0 : 1) + ms.length;
      if (!ruleOk(M.rule, used, sets)) continue;
      // g(r): best cost of the fresh stints ms over r laps (min-convolution), with arg tables to rebuild
      let g = new Float64Array(R + 1).fill(BIG); g[0] = 0; const args = [];
      for (const c of ms) {
        const ng = new Float64Array(R + 1).fill(BIG), arg = new Int32Array(R + 1);
        for (let r = 1; r <= R; r++) for (let n = 1; n <= r; n++) { const v = g[r - n] + fresh[c].cost[n]; if (v < ng[r]) { ng[r] = v; arg[r] = n; } }
        g = ng; args.push(arg);
      }
      let best = BIG, n0b = R; const tot = new Float64Array(R + 1).fill(BIG);
      // (the first stop pays the present flag's loss only when it is this lap – n0 = 1: an SC now makes "box now" cheap)
      const stops = ms.length;
      for (let n0 = stops ? 1 : R; n0 <= R; n0++) { const v = cur[n0] + g[R - n0] + (stops ? (n0 === 1 ? loss0 : loss) + (stops - 1) * loss : 0); tot[n0] = v; if (v < best) { best = v; n0b = n0; } }
      if (best >= BIG) continue;
      const cost = best;
      // rebuild the stints (fresh stints listed hardest first – their order doesn't change the model's cost)
      const lens = []; let r = R - n0b; for (let j = ms.length - 1; j >= 0; j--) { const n = args[j][r]; lens.unshift(n); r -= n; }
      const stints = [{ compound: f.name, laps: n0b, mode: curMode[n0b], age0: f.age }, ...ms.map((c, j) => ({ compound: c, laps: lens[j], mode: fresh[c].mode[lens[j]] }))];
      // reorder the fresh stints: harder first (the usual order; equal cost in the model)
      const rest = stints.slice(1).sort((a, b) => DRY.indexOf(b.compound) - DRY.indexOf(a.compound)); stints.splice(1, rest.length, ...rest);
      let lo = n0b, hi = n0b; if (stops) { while (lo > 1 && tot[lo - 1] - best <= 2) lo--; while (hi < R - 1 && tot[hi + 1] - best <= 2) hi++; }
      out.push({ stints, stops, cost, window: stops ? [st.lap + lo, st.lap + hi] : null });
    }
  }
  out.sort((a, b) => a.cost - b.cost);
  // the best few, and the best of every stop count (a plan with fewer stops can win once traffic is counted – ai.js adds it)
  const pick = out.slice(0, top);
  for (let k = 0; k <= maxStops; k++) { const b = out.find((c) => c.stops === k); if (b && !pick.includes(b)) pick.push(b); }
  return pick;
}

// stints → the engine's plan order: [{ compound, toLap }] (toLap = in-lap of each stop; last = total)
export function toPlan(st, cand) {
  let lap = st.lap; const stints = [];
  for (const s of cand.stints) { lap += s.laps; stints.push({ compound: s.compound, toLap: lap }); }
  return stints;
}

// ---------- scenarios ----------
// N seeded scenarios for a decision (random access by key: the same draws however often they are asked for):
//   g: wear factor (the team's present belief ± its uncertainty); sc: per lap 0/1 safety car; water: per lap mm on the line
export function scenarios(M, est, view, key, n = AI.mc) {
  const S0 = view.lap, total = view.total, lapS = view.lapS, fc = view.forecast, out = [];
  const nObs = est?.nWear ?? 0, gSd = AI.kwErrSd * M.errScale * Math.sqrt(AI.priorLaps / (AI.priorLaps + nObs));
  const pSc = M.street ? AI.pScStreet : AI.pSc, haz = -Math.log(1 - pSc) / Math.max(1, total);
  const blocks = fc?.blocks || [], anyRain = (view.water || 0) > 0.05 || (view.rain || 0) > 0.1 || blocks.some((b) => b.pRain > 0.08);
  for (let k = 0; k < n; k++) {
    const r = streamFor(view.seed, `ai:mc:${M.team}:${key}:${k}`);
    const g = (est?.g ?? 1) * Math.exp(gSd * r.normal());
    const sc = new Uint8Array(total + 2);
    if (view.flag === "sc") for (let L = S0 + 1; L <= Math.min(total, S0 + 2); L++) sc[L] = 1;
    for (let L = S0 + 1; L <= total; L++) if (!sc[L] && r.next() < haz) { for (let j = 0; j < AI.scLaps && L + j <= total; j++) sc[L + j] = 1; L += AI.scLaps; }
    const water = new Float64Array(total + 2);
    if (anyRain) {
      // rain per forecast block (Gaussian copula: each block's marginal = its pRain, neighbours correlated), then a one-
      // segment water film (the team's water model below) sampled at each lap's middle
      const wet = []; let z = r.normal(); const rho = AI.wetPersist;
      for (let j = 0; j < Math.max(1, blocks.length); j++) { if (j) z = rho * z + Math.sqrt(1 - rho * rho) * r.normal(); wet.push(Phi(z) < (blocks[j]?.pRain ?? 0)); }
      const blkMs = blocks.length ? blocks[0].to - blocks[0].from : 900000, t0 = blocks[0]?.from ?? view.t;
      let h = view.water || 0, tm = view.t, nowRain = (view.rain || 0) > 0.1;
      const nCars = view.cars.filter((c) => c.status === "run").length || 20, Tt = view.trackT ?? 30;
      const evapMin = Math.max(0, WEATHER.evap.v * (1 + WEATHER.evapT.v * (Tt - 25))) / 60;
      for (let L = S0 + 1; L <= total; L++) {
        const tL = view.t + (L - S0 - 0.5) * lapS * 1000;
        while (tm < tL) {
          const j = Math.min(wet.length - 1, Math.max(0, Math.floor((tm - t0) / blkMs))), raining = tm - view.t < 300000 && nowRain ? true : wet[j];
          // the team's water model: the game's published surface physics for one segment (rain in at the intensity the
          // weather service gives for "raining", drainage, evaporation at the track temperature, the cars' clearing)
          const R = raining ? WEATHER.rainOn.v : 0, passes = nCars * 60 / Math.max(60, lapS);
          h += R / 60 - h * (1 - Math.exp(-WEATHER.drain.v / 60)) - evapMin; h *= Math.pow(1 - WEATHER.carClear.v, passes); if (h < 0) h = 0;
          tm += 60000;
        }
        water[L] = h;
      }
    }
    out.push({ g, sc, water, wetAny: anyRain });
  }
  return out;
}

// cost (s) of following a candidate from state st in one scenario, with the reactive rules (SC: bring the next stop
// forward; weather: switch to the tyre that is clearly faster on the water there)
// corr: { compound: s } what the field's latest laps say about each compound in the conditions now (ai.js conditionCorr) –
// applied in full for corrLaps laps, then fading over as many again (conditions change)
export function evalCandidate(M, est, st, cand, scn, { fuel = M.fuelRef, burn = M.fuelPerLap, corr = null, corrLaps = 3 } = {}) {
  const e = { ...est, g: scn.g }, total = st.total, loss = pitLoss(M, e, "green"), lossSc = pitLoss(M, e, "sc");
  const stops = []; { let lap = st.lap; for (let i = 0; i < cand.stints.length - 1; i++) { lap += cand.stints[i].laps; stops.push({ lap, compound: cand.stints[i + 1].compound, mode: cand.stints[i + 1].mode }); } }
  let name = cand.stints[0].compound, mode = cand.stints[0].mode, age = st.cur ? st.cur.age : 0, cost = 0, f = fuel, k = 0, plannedLen = cand.stints[0].laps;
  const used = new Set([...(st.used || []), name]); let sets = (st.sets || (st.cur ? 1 : 0)) + (st.cur ? 0 : 1), weatherMode = false;
  const opts = [...M.av.dry, ...M.av.wet].filter((c) => M.vs[c]);
  const cw = (L) => { const k = L - st.lap; return k <= corrLaps ? 1 : Math.max(0, 1 - (k - corrLaps) / corrLaps); };
  const LT = (c, m, a, h, f, L) => lapTime(M, e, st.num, c, m, a, h, f) + (corr && corr[c] ? corr[c] * cw(L) : 0);
  for (let L = st.lap + 1; L <= total; L++) {
    const h = scn.water[L], underSc = scn.sc[L];
    // SC: the next planned stop comes forward if it was within the window (only when the SC is out on that lap)
    if (underSc && k < stops.length && !weatherMode && stops[k].lap - L <= AI.scWindow * plannedLen && stops[k].lap >= L && L < total) stops[k].lap = L;
    cost += underSc ? M.scLapS : LT(name, mode, age, h, f, L);   // (SC laps: everyone at the SC's pace – the same for every candidate)
    age++; f -= burn;
    let pitTo = null;
    if (k < stops.length && stops[k].lap === L && !weatherMode) { pitTo = stops[k].compound; mode = stops[k].mode; k++; }
    if (scn.wetAny && L < total) {
      // the tyre that is fastest for the water now (a fresh set) vs the present one
      let best = name, bt = LT(name, mode, age, h, f, L);
      for (const c of opts) { const tt = LT(c, "balanced", 0, h, f, L); if (tt + AI.switchDelta < bt) { bt = tt; best = c; } }
      const wrongFamily = (WETS.includes(best) !== WETS.includes(name));
      if (best !== name && wrongFamily) { pitTo = best; mode = "balanced"; weatherMode = true; }
      else if (pitTo && WETS.includes(name) !== WETS.includes(pitTo) && h > 0.3) pitTo = null;   // (don't fit slicks on a wet track because the plan said so)
    }
    if (pitTo && L < total) {
      cost += underSc ? lossSc : loss; name = pitTo; age = 0; used.add(name); sets++;
      plannedLen = k < stops.length ? stops[k].lap - L : total - L;
      // after a weather switch back onto slicks: the remaining laps on the slick that suits them (one more stop if too long)
      if (weatherMode && DRY.includes(name)) { const rem = total - L; const life = (est?.stintLife?.[name]) || 30; if (rem > life * 1.3) { stops.length = k; stops.push({ lap: L + Math.round(rem / 2), compound: name === "HARD" ? "MEDIUM" : "HARD", mode: "balanced" }); weatherMode = false; } }
    }
  }
  if (!ruleOk(M.rule, [...used], sets)) cost += 60;   // (a breach is a DSQ – a large cost, not a ban: the scenario may make it unavoidable)
  return cost;
}

// the tyre-family crossover: for each tyre of the other family (slicks ↔ intermediates/wets), the time a fresh set of it
// gains over the present set in the next K laps, on the water the forecast scenarios expect there (mean of 8 draws: rain
// coming → the water rises, a dry forecast → it falls), the model corrected by the field's latest laps on each compound
// (corr – full on the next lap, half after). A switch pays when the gain beats the stop (ai.js; the scenarios use the
// per-lap form of the same rule).
export function crossoverGains(M, est, view, num, cur, { K = 10, corr = {}, key = "x" } = {}) {
  const scW = scenarios(M, est, view, key, 8), hAt = (k) => scW.reduce((a, x) => a + x.water[Math.min(view.total, view.lap + k)], 0) / scW.length;
  const lt = (c, age, k) => lapTime(M, est, num, c, "balanced", age, hAt(k), cur.fuel ?? M.fuelRef) + (corr[c] ?? 0) * (k <= 1 ? 1 : 0.5);
  const wet = WETS.includes(cur.name), out = {};
  for (const c of [...M.av.dry, ...M.av.wet]) if (M.vs[c] && WETS.includes(c) !== wet) { let g = 0; for (let k = 1; k <= K; k++) g += lt(cur.name, cur.age + k, k) - lt(c, k - 1, k); out[c] = g; }
  return out;
}

// candidates × scenarios → stats per candidate (mean, sd, p10, p90)
export function evaluate(M, est, st, cands, scns, opts) {
  // sd: spread of the race time itself (SC laps and rain included – what the screen shows); sdRel: spread of the candidate
  // against the scenario's average candidate – the risk that is really a choice (the risk weight uses this one)
  const X = cands.map((c) => scns.map((s) => evalCandidate(M, est, st, c, s, opts))), n = scns.length;
  const avg = scns.map((_, k) => X.reduce((a, x) => a + x[k], 0) / X.length);
  return cands.map((c, i) => {
    const xs = X[i], mean = xs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, n - 1));
    const rel = xs.map((x, k) => x - avg[k]), mr = rel.reduce((a, b) => a + b, 0) / n, sdRel = Math.sqrt(rel.reduce((a, b) => a + (b - mr) * (b - mr), 0) / Math.max(1, n - 1));
    const so = xs.slice().sort((a, b) => a - b);
    return { ...c, mean, sd, sdRel, p10: so[Math.floor(0.1 * (n - 1))], p90: so[Math.ceil(0.9 * (n - 1))] };
  });
}

// ---------- public view (what the team may see) ----------
// laps that say something about pace: not the in-lap (pit flag: the lap the car entered the lane), not the out-lap that
// follows it (the timing line is in the lane: that lap carries the stationary time), not the standing-start lap
export const cleanLaps = (laps) => laps.filter((l, i) => !l.pit && !(i > 0 && laps[i - 1].pit) && l.n > 1);
export const lastClean = (laps) => { const i = laps.length - 1; return i >= 0 && !laps[i].pit && !(i > 0 && laps[i - 1].pit) && laps[i].n > 1 ? laps[i] : null; };
export function publicView(race, team, { forecast = null } = {}) {
  const S = race.state, C = race.cache, T = C.T, w = C.w || {};
  const lead = S.cars.find((c) => c.num === S.order[0]);
  const lapS = estLapS(race);
  const fc = forecast || (C.forecastFn ? C.forecastFn(race) : forecastAt(C.truth, S.t, S.seed));
  const cars = S.order.map((n, i) => {
    const c = S.cars.find((x) => x.num === n);
    const k0 = Math.max(0, c.laps.length - 6), laps = c.laps.slice(k0).map((l, i) => ({ n: l.n, t: l.t, compound: l.compound, pit: !!l.pit, out: k0 + i > 0 && !!c.laps[k0 + i - 1].pit }));
    const used = [...new Set([...c.laps.map((l) => l.compound), c.tyre.name])];
    return { num: c.num, team: c.teamKey, pos: i + 1, lap: c.lap, dist: c.dist, gap: lead ? (lead.dist - c.dist) / (T.L / lapS) : 0,
      inPit: c.where === "pit", status: c.status, compound: c.tyre.name, age: c.tyre.laps, stops: c.pit.stops, used, laps };
  });
  let water = 0; if (C.surface?.hLine) { for (const x of C.surface.hLine) water += x; water /= C.surface.hLine.length; }
  return { t: S.t, seed: S.seed, lap: S.leaderLap, total: S.totalLaps, lapS, flag: flagOf(race), rain: w.rain ?? 0, water, airT: w.airT, trackT: w.trackT, forecast: fc, cars, team };
}
// a typical green lap now (s): the median of the field's recent clean laps, else the team model's
function estLapS(race) {
  const xs = []; for (const c of race.state.cars) for (const l of cleanLaps(c.laps).slice(-3)) xs.push(l.t);
  if (xs.length >= 5) return median(xs);
  const M = race.cache.aiModels && Object.values(race.cache.aiModels)[0]; return M ? ltOfMu(M, 0.95 * M.muTrack * M.pace) : 90;
}

// ---------- traffic: lap-level forecast of the field ----------
// Over the next H laps: every car runs its estimated pace (its public recent laps less the team's degradation model for
// its compound and age, relative to the own car) and stops when the team guesses it will; a car can't close below minGap
// on the car ahead unless it is passDelta/lap faster (passDelta: learned from the passes seen in the public order).
// The rivals' stops are guessed from public facts only: a rival still short of the compound's typical life stops when it
// gets there; one already past it is running long – it stops once, half-way through what is left, if it still has to
// (one dry compound used) and otherwise runs to the end.
// prepTraffic(...) once per decision → ctx; trafficHold(ctx, stops) per candidate: the own car's time held (s) when it
// stops at `stops` = [{ lap, compound }] (in-laps).
// rivals: "life" – each rival stops when its compound's typical life is reached (as above); "long" – the other common
// guess before any rival has stopped: one stop around half distance (or half of what is left)
export function prepTraffic(M, est, view, num, { H = AI.horizon, passDelta = est?.passDelta ?? (M.street ? AI.passDeltaStreet : AI.passDelta), rivals = "life" } = {}) {
  const loss = pitLoss(M, est, view.flag), me = view.cars.find((c) => c.num === num); if (!me) return null;
  const life = est?.stintLife || {}, Hm = Math.min(H, view.total - view.lap);
  const tab = {}; const pace = (name, age) => { const t = tab[name] || (tab[name] = []); const a = Math.min(M.A, Math.round(age)); return t[a] ?? (t[a] = lapTime(M, est, num, name, "balanced", a)); };
  const rel = view.cars.filter((c) => (c.status === "run" || c.status === "grid" || c.status === "pitstart") && Math.abs(c.gap - me.gap) < loss + 30);
  // a rival's pace relative to the own car: the same laps compared (same conditions, same lap of the race), each less the
  // model's tyre effect for its compound and age then – conditions that change (rain, a drying line) cancel out
  const ex = (c, l) => l.t - pace(l.compound, Math.max(0, c.age - (c.lap - l.n)));
  const mine = new Map(me.laps.filter((l) => !l.pit && !l.out && l.n > 1).map((l) => [l.n, ex(me, l)]));
  const rel0 = (c) => { const d = c.laps.filter((l) => !l.pit && !l.out && l.n > 1 && mine.has(l.n)).slice(-3).map((l) => ex(c, l) - mine.get(l.n)); return d.length ? median(d) : 0; };
  const cars = rel.map((c) => {
    const base = c.num === num ? 0 : Math.max(-5, Math.min(5, rel0(c)));
    let stop = null;
    if (c.num !== num && !c.inPit && WETS.indexOf(c.compound) < 0) {
      const L = life[c.compound] || 25, mustStop = new Set(c.used.filter((x) => DRY.includes(x))).size < 2;
      if (rivals === "long") stop = c.stops === 0 && mustStop ? Math.max(view.lap + 1, Math.round(view.total / 2)) : null;
      else if (c.age < L) stop = view.lap + Math.max(1, Math.round(L - c.age));
      else if (mustStop) stop = view.lap + Math.max(1, Math.round((view.total - view.lap) / 2));
      if (stop != null && stop >= view.total) stop = null;
    }
    return { num: c.num, gap: c.gap, name: c.compound, age: c.age, base, stop, comp: c.compound === "HARD" ? "MEDIUM" : "HARD" };
  });
  return { M, num, cars, pace, loss, passDelta, lap: view.lap, H: Hm };
}
export function trafficHold(ctx, stops = [], out = null) {
  if (!ctx) return 0;
  const st = ctx.cars.map((c) => ({ ...c, t: c.gap, held: 0, next: 0, lt: 0, pitted: -1 })), me = st.find((c) => c.num === ctx.num);
  const own = new Map(stops.map((x) => [x.lap, x.compound]));
  for (let L = ctx.lap + 1; L <= ctx.lap + ctx.H; L++) {
    for (const c of st) {
      let lt = ctx.pace(c.name, c.age) + c.base; c.age++;
      const pit = c === me ? own.get(L) : c.stop === L ? c.comp : undefined;
      if (pit) { lt += ctx.loss; c.name = pit; c.age = 0; c.pitted = L; }
      c.next = c.t + lt; c.lt = lt;
    }
    st.sort((a, b) => a.t - b.t);   // road order at the start of the lap
    for (let i = 1; i < st.length; i++) {
      const c = st[i], a = st[i - 1]; if (c.pitted === L || a.pitted === L) continue;
      const minT = a.next + AI.minGapS;
      if (c.next >= minT) { c.wait = 0; continue; }
      // caught up: held this lap; a car fast enough (passDelta) gets by after a lap behind (a pass takes setting up)
      c.wait = c.behind === a.num ? (c.wait || 0) + 1 : 1; c.behind = a.num;
      if (a.lt - c.lt >= ctx.passDelta && c.wait > 1) continue;
      c.held += minT - c.next; c.next = minT; c.lt = c.next - c.t;
    }
    if (out && L === ctx.lap + 1) out.first = me ? me.held : 0;
    for (const c of st) c.t = c.next;
  }
  return me ? me.held : 0;
}

// ---------- pre-race strategy (request §3) ----------
// What the pre-race screen shows, all estimates: grid, weather + its uncertainty, per car start tyre, planned stints and
// pit windows, expected race time and its spread, both drivers compared, the pit-loss estimate (with its parts), rule
// checks and the team's pit conflicts. race: a race created for this seed (createRace) – nothing is stepped.
// start: { num: compound } – the start tyre the player picked (that car's candidates start on it); traffic from the grid is
// left out here (equal pace for everyone before a lap is run – ai.js adds it for its own pre-race choice)
export function preRaceStrategy(race, team, { top = 4, start = {} } = {}) {
  const S = race.state, sc = race.scenario, M = teamModel(race, team), est = { g: 1, off: {}, lane: M.lanePrior, stintLife: {} };
  const view = publicView(race, team); view.lapS = ltOfMu(M, 0.95 * M.muTrack * M.pace);
  const ents = new Map(sc.entries.map((e) => [String(e.num), e]));
  const scns = scenarios(M, est, view, "pre");
  const cars = M.nums.map((num) => {
    const st = { num, lap: 0, total: S.totalLaps, cur: null, used: [], sets: 0 };
    const cands = evaluate(M, est, st, planCandidates(M, est, st, { top: 10 }).filter((c) => !start[num] || c.stints[0].compound === start[num]), scns);
    const risk = 0; cands.sort((a, b) => a.mean + risk * a.sd - (b.mean + risk * b.sd));
    const best = cands[0];
    return { num, tla: ents.get(String(num))?.tla, grid: S.cars.find((c) => c.num === num)?.grid ?? null,
      best: best && describe(best, st, best.mean), alternatives: best ? cands.slice(1, top).map((c) => describe(c, st, best.mean)) : [] };
  });
  // the team's two cars wanting the same in-lap → the second car queues behind the first one's stop
  const conflicts = [];
  if (cars.length === 2 && cars[0].best && cars[1].best) {
    const a = cars[0].best.plan.slice(0, -1).map((s) => s.toLap), b = cars[1].best.plan.slice(0, -1).map((s) => s.toLap);
    for (const L of a) if (b.includes(L)) conflicts.push({ lap: L, cars: [cars[0].num, cars[1].num], queueS: +(PIT.workBase.v + AI.queueMargin).toFixed(1),
      text: `${L}랩에 두 차가 같은 랩에 피트 예정 – 붙어 들어오면 뒤차가 약 ${(PIT.workBase.v + AI.queueMargin).toFixed(1)}초 대기 (간격이 그보다 크면 대기 없음)` });
  }
  const loss = pitLoss(M, est), fc = view.forecast;
  const pMax = Math.max(0, ...(fc.blocks || []).map((b) => b.pRain));
  return { est: true, label: "예상치 – 보장된 결과가 아니에요. 교통·날씨·세이프티카·사고에 따라 달라져요.",
    circuit: sc.meta.venue?.name || sc.meta.location, laps: S.totalLaps, lapKm: +(race.cache.T.L / 1000).toFixed(3),
    grid: S.order.map((n) => ({ num: n, tla: ents.get(String(n))?.tla, team: ents.get(String(n))?.teamKey, pos: S.cars.find((c) => c.num === n).grid, pitLane: S.cars.find((c) => c.num === n).pitStart })),
    weather: { blocks: fc.blocks, pRainMax: pMax, airT: M.Tair, trackT: M.Ttrack,
      text: pMax < 0.1 ? "건조 예상 (비 확률 10% 미만)" : pMax < 0.4 ? `비 가능성 있음 (최대 ${Math.round(pMax * 100)}%)` : `비 가능성 높음 (최대 ${Math.round(pMax * 100)}%)`,
      uncertainty: "예보는 15분 단위 확률이며 먼 시간일수록 오차가 커요 (시간 오차 포함)." },
    pitLoss: { s: +loss.toFixed(1), sc: +pitLoss(M, est, "sc").toFixed(1), vsc: +pitLoss(M, est, "vsc").toFixed(1), lane: +M.lanePrior.toFixed(1), freeStretch: +M.refPit.toFixed(1), stationary: PIT.workBase.v,
      text: `피트레인 약 ${M.lanePrior.toFixed(1)}초(정차 ${PIT.workBase.v}초 포함) − 같은 구간 본선 ${M.refPit.toFixed(1)}초 = 손실 약 ${loss.toFixed(1)}초 (SC 중 약 ${pitLoss(M, est, "sc").toFixed(1)}초)` },
    rule: { ...M.rule, compounds: M.av.dry, compoundSource: M.av.source },
    cars, conflicts,
    compare: cars.length === 2 && cars[0].best && cars[1].best ? { diffS: +(cars[1].best.mean - cars[0].best.mean).toFixed(1), same: cars[0].best.key === cars[1].best.key } : null };
}
function describe(c, st, bestMean) {
  const plan = toPlan(st, c);
  return { key: c.stints.map((s) => `${s.compound[0]}${s.laps}`).join("-"), plan, stints: c.stints.map((s) => ({ compound: s.compound, laps: s.laps, mode: s.mode })),
    stops: c.stops, window: c.window, mean: +c.mean.toFixed(1), sd: +c.sd.toFixed(1), sdRel: +c.sdRel.toFixed(1), p10: +c.p10.toFixed(1), p90: +c.p90.toFixed(1), vsBest: +(c.mean - bestMean).toFixed(1) };
}
