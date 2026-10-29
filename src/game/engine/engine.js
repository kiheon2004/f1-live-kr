// The race engine: one fixed step (DT_MS) of the whole race, and its public API (DESIGN §1, §1.1, §2).
//   createRace({ scenario, seed, userTeam, weatherMode }) → race   (race.state: plain, saved; race.cache: rebuilt)
//   step(race)               one DT_MS step
//   command(race, cmd)       an order (idempotent by cmd.id; fixed to the next step)
//   snapshot(race)           what the screen draws (DESIGN §13.1) – reads only
//   events(race, sinceT)     the log since a time; results(race) the classification and time accounts
//   saveRace(race) / loadRace(json, scenario)   the whole state incl. RNG streams and orders (DESIGN §14)
// Pure: no DOM, three.js, wall clock or Math.random.
//
// One step, in this order (every car sees the others as they were at the step's start – the order of the cars in the
// array never changes the result):
//   1. orders due now (validated against the state);  2. weather once a second (truth → surface);
//   3. per car: driver variation, grip (tyre × water, track rubber), mass (fuel), power (ICE + ERS by its energy mode),
//      the envelope when its inputs moved; the speed caps (the car ahead, the pit entry);
//   4. move: on the lap the car model (car.js), in the pit lane the pit model (pit.js); then tyres and energy from what
//      the car actually did; line crossings (laps, sectors), the pit entry/exit;
//   5. the order, race phase (start / finish), the log.
// Interactions between cars (following, slipstream, dirty air, overtaking) are traffic.js's; race control's flags and
// rules are control.js / rules.js's. Until those modules are wired, a car can't pass the car ahead on the lap: it follows
// it (the queue rule below) – a real constraint, not a shortcut through the other car.
import { loadTrack } from "./track.js";
import { computeProfile, makeProfile, needsReprofile, REPROFILE } from "./profile.js";
import { stepCar } from "./car.js";
import { createTyre, tyreGrip, stepTyre, tyreLap, fitTemp } from "./tyre.js";
import { createEnergy, iceCap, ersCap, splitPower, stepEnergy, energyLap, socFrac } from "./energy.js";
import { createDriver, setPaceMode, stepDriver, utilisation, tyreHeatFactor } from "./driver.js";
import { newPitState, newBoxes, pitCall, pitCancel, pitOnLap, pitStep, lapCapForPit, IN_LANE } from "./pit.js";
import { weatherTruth, truthAt, forecastAt, newSurface, surfaceStep, waterAt, rubberAt, segOf, saveSurface, loadSurface } from "./weather.js";
import { Streams } from "./rng.js";
import { DT_MS, DT } from "./clock.js";
import * as CMD from "./commands.js";
import { newAiState, aiPrePlans, aiStep } from "./ai.js";
import { carBase } from "../data/params/cars-base.js";
import { energyParams } from "../data/params/energy.js";
import { airDensity } from "../data/params/physics.js";
import { DEFAULT_ALLOCATION } from "../data/params/tyres.js";
import { values } from "../data/params/param.js";
import { CARS_2025_TABLE, TRACK_TAU_2025 } from "../data/params/cars-2025.js";
import { CARS_2026_TABLE, TRACK_TAU_2026 } from "../data/params/cars-2026.js";
// per-team fitted car coefficients by season (calibrate.mjs; 2024 has none – one wet race – so the base car); per-race
// track grip factor τ where the calibration fitted one (from THAT race's speed traces – a circuit/conditions property,
// not its result), else 1 (estimate: the validation showed ±3 s/lap without it – reported as a limit)
const TEAM_CARS = { 2025: CARS_2025_TABLE, 2026: CARS_2026_TABLE }, TRACK_TAU = { ...TRACK_TAU_2025, ...TRACK_TAU_2026 };
import NOMINATIONS from "../data/tyres/nominations.js";

export const ENGINE_VERSION = "0.48.0-engine.1";
export const STATE_VERSION = 1;
const CAR_LEN = 5.63;   // m – 2024–25 cars ≈ 5.6 m (TR Art. 3: no length rule; typical published 5.6–5.7 m); 2026 ≈ 5.3 m (est)

// ---------- creation ----------

// ai: false (default – every car on its given/default plan), true (every team run by ai.js; the player's team too until
// the player orders a car) or { teams: [teamKey…] } (only those). The AI's pre-race plans are computed on a throw-away race
// of the same seed and given to the race like the player's pre-race plans (plans passed here win for their cars).
export function createRace(opts) {
  const { ai = false, ...rest } = opts;
  if (!ai) return createRace0(rest);
  const teams = ai === true ? null : ai.teams || null;
  const pre = aiPrePlans(createRace0({ ...rest, plans: null }), teams);
  const race = createRace0({ ...rest, plans: { ...pre, ...(rest.plans || {}) } });
  race.state.ai = newAiState(race, { teams });
  for (const team in race.state.ai.teams) for (const num in race.state.ai.teams[team].cars) { const p = pre[num]; if (p && !rest.plans?.[num]) race.state.ai.teams[team].cars[num].modes = p.stints.map((s, i) => ({ toLap: s.toLap, mode: p.modes[i] })); }
  return race;
}
function createRace0({ scenario, seed = 1, userTeam = null, weatherMode = "real", carParams = null, driverParams = null, plans = null, tyreWear = 1 }) {
  const sc = scenario, season = sc.meta.season;
  const state = { v: STATE_VERSION, engine: ENGINE_VERSION, t: 0, step: 0, seed: seed >>> 0, scenarioId: sc.meta.id, season, tyreWear,
    userTeam, weatherMode, totalLaps: sc.race.laps, phase: "grid", finished: false, leaderLap: 0, chequeredAt: null,
    cars: [], order: [], boxes: null, commands: CMD.newCommandState(), teamOrders: {}, log: [], results: null };
  const race = { state, scenario: sc, cache: null, rng: new Streams(seed) };
  buildCache(race, { carParams, driverParams });
  const T = race.cache.T, w0 = truthAt(race.cache.truth, 0);
  const slots = new Map((sc.grid?.slots || []).map((g) => [g.num, g]));
  const pitStarters = new Set((sc.grid?.pitLane || []).map((x) => (typeof x === "object" ? x.num : x)));
  const teams = [...new Set(sc.entries.map((e) => e.teamKey))];
  state.boxes = newBoxes(teams);
  for (const e of sc.entries) {
    const g = slots.get(e.num), dp = race.cache.drivers[e.num];
    const plan = plans?.[e.num] || defaultPlan(sc, e.num);
    const start = plan.stints[0].compound;
    const car = { num: e.num, teamKey: e.teamKey, team: e.team, tla: e.tla, color: e.colour, driverId: e.num, grid: g?.pos ?? null,
      pitStart: pitStarters.has(e.num), status: "grid", out: null, where: "lap",
      s: g ? T.wrap(g.s) : T.wrap(T.pit.sOut), d: g ? g.d : 0, v: 0, aLong: 0, aLat: 0, steer: 0, wheelDist: 0,
      lap: 0, armed: false, dist: 0, lapT0: 0, laps: [], sector: 0, secT0: 0, secs: [],
      tyre: newTyre(race, start, w0.airT),
      energy: createEnergy(race.cache.ep, {}), driver: createDriver(dp), mode: { pace: "balanced", energy: "balanced" },
      plan, pit: newPitState(), traffic: { state: "free", ahead: null, gap: null },
      pen: { pendingS: 0, finalS: 0, serve: [] }, acct: { traffic: 0, pit: 0, other: 0 } };
    // behind the line at the start: its first crossing starts lap 1 (not a lap done); ahead of it (some grids): armed
    car.armed = T.ahead(0, car.s) < T.L / 2;
    car.dist = car.armed ? car.s : car.s - T.L;
    state.cars.push(car);
  }
  sortOrder(race);
  log(race, { type: "start", cause: "scenario", effect: `${state.cars.length} cars, ${state.totalLaps} laps, seed ${state.seed}` });
  return race;
}

// derived data – rebuilt from the scenario on load (never saved)
function buildCache(race, { carParams = null, driverParams = null } = {}) {
  const sc = race.scenario, season = sc.meta.season, T = loadTrack(sc.track);
  // the envelope uses the racing line's curvature (F1's positions are snapped to its reference line: T.kappa is that
  // line's; kappaLine is the racing-line estimate – the data report)
  const PT = { n: T.n, ds: T.ds, L: T.L, kappa: T.kappaLine || T.kappa, grade: T.grade };
  const base = carBase(season), cars = {}, drivers = {}, profiles = {};
  for (const e of sc.entries) {
    const fitted = TEAM_CARS[season]?.[e.teamKey];
    cars[e.num] = { ...base, ...(fitted ? values(fitted) : {}), ...(carParams?.[e.teamKey] || {}) };
    drivers[e.num] = driverParams?.[e.num] || {};
    profiles[e.num] = { prof: makeProfile(T.n), at: -1e9, phase: (sc.entries.indexOf(e) * 97) % REPROFILE.everyMs };
  }
  const rec = weatherRecord(sc.weather);
  // race names (SOFT/MEDIUM/HARD) → the C-number Pirelli nominated for this event (research data; else the defaults, est)
  const nomKey = sc.meta.id.replace(/_\d{4}-\d{2}-\d{2}_Race$/, ""), nom = NOMINATIONS.races[nomKey];
  const alloc = nom ? { HARD: nom.H, MEDIUM: nom.M, SOFT: nom.S, INTERMEDIATE: "INTERMEDIATE", WET: "WET", est: false } : { ...DEFAULT_ALLOCATION, est: true };
  const tau = TRACK_TAU[sc.meta.id] ?? 1;
  race.cache = { T, PT, cars, drivers, profiles, alloc, tau, tauEst: !(sc.meta.id in TRACK_TAU), ep: energyParams(season), truth: weatherTruth(rec, { mode: race.state.weatherMode, seed: race.state.seed, minutes: 240 }),
    surface: race.cache?.surface || null, w: {}, carById: null };
  if (!race.state.surface) race.state.surface = saveSurface(newSurface(T));
  race.cache.surface = loadSurface(race.state.surface);
  race.cache.carById = null;
}

// a set of tyres by its race name: the model's compound is the event's C-number; the name is kept for rules and screens
function newTyre(race, name, airT) {
  const C = race.cache, code = C.alloc[name] || name, ty = createTyre(code, { T0: fitTemp(race.state.season, code, airT ?? 25), kwScale: race.state.tyreWear ?? 1 });   // (tyreWear: a sensitivity knob, 1 = the model)
  ty.name = name; return ty;
}

// the scenario's weather columns (s from lights out) → weather.js records (ms)
function weatherRecord(W) {
  const c = W?.cols; if (!c?.t) return [];
  return c.t.map((ts, i) => ({ t: ts * 1000, rain: c.rain?.[i] ?? 0, airT: c.air?.[i], trackT: c.track?.[i], wind: c.windSpeed?.[i] }));
}

// a plain team plan when none is given: start on the harder of the two most-used dry compounds, one stop near half
// distance onto the other – what a team without its own strategist would do. ai.js replaces it with real strategy.
export function defaultPlan(sc, num) {
  const seen = (sc.tyres?.compoundsSeen || ["MEDIUM", "HARD"]).filter((c) => c === "SOFT" || c === "MEDIUM" || c === "HARD");
  const a = seen.includes("MEDIUM") ? "MEDIUM" : seen[0] || "MEDIUM", b = seen.includes("HARD") ? "HARD" : seen.find((x) => x !== a) || "HARD";
  const L = sc.race.laps;
  return { stints: [{ compound: a, toLap: Math.round(L * 0.45) }, { compound: b, toLap: L }], by: "default" };
}

// ---------- the step ----------

export function step(race) {
  const S = race.state, C = race.cache, T = C.T;
  if (S.finished) return;
  const t = S.t + DT_MS;
  // race start: lights out at t = 0 + one step (the grid formed; formation lap not simulated – tyres preset, est)
  if (S.phase === "grid") { S.phase = "racing"; for (const car of S.cars) if (car.status === "grid") { car.status = car.pitStart ? "pitstart" : "run"; car.lapT0 = t; } log(race, { t, type: "lightsOut", cause: "start", effect: "race started" }); }
  // 1. orders
  for (const c of CMD.due(S.commands, t)) CMD.record(S.commands, c, t, applyOrder(race, c, t));
  // 2. weather (once a second, on the second)
  if (t % 1000 === 0) { truthAt(C.truth, t, C.w); surfaceStep(C.surface, C.w, 1); }
  else if (C.w.rain == null) truthAt(C.truth, t, C.w);
  // 3. caps from the field as it is now (step start)
  const caps = followCaps(race);
  // 4. move
  for (const car of S.cars) {
    if (car.status === "fin" || car.status === "dnf") { car.v = 0; continue; }
    if (car.status === "pitstart") { pitStartWait(race, car, t); continue; }
    const dr = car.driver; stepDriver(dr, race.rng.get("driver:" + car.num), DT);
    if (car.where === "pit") movePit(race, car, t);
    else moveLap(race, car, t, caps.get(car.num) ?? Infinity);
  }
  S.t = t; S.step++;
  // 5. order, finish
  sortOrder(race);
  finishCheck(race, t);
  // 6. the team AI (only orders – applied from the next step, like the player's)
  if (S.ai) aiStep(race);
}

// the speed cap from the car ahead on the lap (same lane): keep a safe gap at its speed, braking distance included –
// v² ≤ v_ahead² + 2·a·(gap − gMin), gMin = car length + 0.25 s of travel (est). The queue rule before traffic.js.
function followCaps(race) {
  const S = race.state, T = race.cache.T, caps = new Map();
  const onLap = S.cars.filter((c) => c.where === "lap" && (c.status === "run"));
  const bySt = onLap.slice().sort((a, b) => a.s - b.s);
  const n = bySt.length;
  for (let i = 0; i < n; i++) {
    const c = bySt[i], a = bySt[(i + 1) % n]; if (n < 2) break;
    const gap = T.ahead(c.s, a.s) - CAR_LEN; if (gap > 150) { c.traffic.ahead = null; c.traffic.gap = null; c.traffic.state = "free"; continue; }
    const gMin = 1.0 + 0.25 * c.v, aB = 25;
    const cap = Math.sqrt(Math.max(0, a.v * a.v + 2 * aB * Math.max(0, gap - gMin)));
    caps.set(c.num, cap); c.traffic.ahead = a.num; c.traffic.gap = gap; c.traffic.state = cap < c.v + 1 ? "follow" : "free";
  }
  return caps;
}

function envFor(race, car) {
  const C = race.cache, T = C.T, w = C.w, cp = C.cars[car.num];
  const water = waterAt(C.surface, car.s), rubber = rubberAt(C.surface, car.s);
  const mode = car.mode.energy, ep = C.ep;
  const pIce = iceCap(car.energy, cp.P_ice, ep), pErs = ersCap(car.energy, ep, mode, car.v, false);
  return { water, rubber: rubber * C.tau, m: cp.m_min + car.energy.fuel, pIce, pErs, P: pIce + pErs, rho: airDensity(w.airT ?? 25), muTyre: tyreGrip(car.tyre, water), util: utilisation(car.driver, water) };
}

function moveLap(race, car, t, capFollow) {
  const S = race.state, C = race.cache, T = C.T, cp = C.cars[car.num], E = envFor(race, car);
  // the envelope when its inputs moved (μ 0.3 %, mass 5 kg) – at most every 0.5 s – or every 2 s
  const pr = C.profiles[car.num], mu = cp.mu_mech * E.muTyre * E.rubber * E.util;
  if ((t - pr.at >= 500 && needsReprofile(pr.prof, mu, E.m)) || t - pr.at >= REPROFILE.everyMs) {
    car.profIn = { muTyre: E.muTyre, muTrack: E.rubber, util: E.util, m: E.m, rho: E.rho };   // (saved: a restored race rebuilds the same envelope)
    computeProfile(C.PT, cp, { ...car.profIn, forward: false }, pr.prof);
    // (the 2 s refreshes staggered over the cars – not all 20 envelopes on one step: the frame-time spikes ui3d measured)
    pr.at = pr.at < -1e8 ? t - pr.phase : t;
  }
  const vCap = Math.min(capFollow, lapCapForPit(car, T));
  const cs = { s: car.s, v: car.v, lap: 0, aLong: 0, aLat: 0, pDrive: 0, pBrake: 0, crossed: false, tCross: 0, limited: false, over: 0 };
  const s0 = car.s;
  stepCar(cs, C.PT, pr.prof, cp, { m: E.m, P: E.P, rho: E.rho, mu: pr.prof.mu, vCap }, DT);
  const moved = T.ahead(s0, cs.s) + (cs.crossed && cs.s >= s0 ? T.L : 0);
  car.aLong = cs.aLong; car.aLat = cs.aLat; car.v = cs.v; car.s = cs.s; car.wheelDist += moved; car.d = T.at(T.line, car.s);
  // traffic time account: while the follow cap held the car under its own envelope (∫ 1/v − 1/v_free ds – here with the
  // envelope speed as v_free, an upper bound of the free speed this step: labelled approximate in results)
  if (vCap < Infinity && cs.limited && capFollow < Infinity && car.v > 1) { const vf = Math.min(pr.prof.vb[T.idx(car.s)], 95); if (vf > car.v) car.acct.traffic += moved / car.v - moved / vf; }
  // tyres and energy from what the car did
  const [pi, pe] = splitPower(cs.pDrive, E.pIce, E.pErs);
  stepTyre(car.tyre, { v: car.v, aLat: car.aLat, aLong: car.aLong, heat: cp.C_tyre_heat * tyreHeatFactor(car.driver), Tair: C.w.airT, Ttrack: C.w.trackT, water: E.water, abrasion: 1 }, DT);
  stepEnergy(car.energy, C.ep, { pIce: pi, pErs: pe, pBrake: cs.pBrake, iceFull: pi >= E.pIce * 0.999 && E.pIce > 0 }, DT, t);
  // the surface: a car entering a new segment
  const sg0 = segOf(C.surface, s0), sg1 = segOf(C.surface, car.s); if (sg0 !== sg1) C.surface.passes[sg1] += 1;
  // the pit: commit / entry
  const pev = pitOnLap(car, T, s0, car.s, t);
  if (pev === "entry") { car.where = "pit"; car.pit.refS = pitReference(race, car); log(race, { t, car: car.num, type: "pitEntry", cause: car.pit.call?.by || "call", effect: `box for ${car.pit.call?.compound || "same"}` }); }
  if (pev === "committed") log(race, { t, car: car.num, type: "pitCommitted", cause: "call", effect: "past the commit point" });
  // line crossing
  lineCrossing(race, car, s0, car.s, cs.crossed, t - DT_MS + Math.round(cs.tCross * 1000));
  car.dist = car.armed ? car.lap * T.L + car.s : car.s - T.L;
  // plan: call the stop when the plan says (the team's plan – ai.js decides plans; executing them is the engine's)
  planCall(race, car, t);
}

function movePit(race, car, t) {
  const S = race.state, C = race.cache, T = C.T;
  const others = S.cars.filter((o) => o.where === "pit").map((o) => ({ num: o.num, team: o.teamKey, phase: o.pit.phase, u: o.pit.u, v: o.pit.v }));
  const sPrev = T.pit.pitToLap(car.pit.u);
  const pen = car.pen.pendingS;
  const ev = pitStep(car, T, { t, dt: DT, team: car.teamKey, boxes: S.boxes, rng: race.rng.get("pit:" + car.teamKey), wet: (C.w.rain || 0) > 0.1, others, penaltyS: pen,
    stack: S.cars.some((o) => o !== car && o.teamKey === car.teamKey && o.pit.times?.release && t - o.pit.times.release < 30000),
    onWorkDone: (cc, cmp) => { cc.tyre = newTyre(race, cmp, C.w.airT ?? 25); C.profiles[cc.num].at = -1e9; } }, undefined);
  if (car.where === "pit") car.v = car.pit.v;
  if (ev === "work" && pen > 0 && car.pit.served >= pen) car.pen.pendingS = 0;
  if (ev) log(race, { t, car: car.num, type: "pit:" + ev, cause: ev === "work" && car.pit.err ? car.pit.err.causes.join(", ") || "crew" : "pit", effect: ev === "work" ? `stationary ${car.pit.workS?.toFixed(2)} s${car.pit.err ? ` (slow wheel +${car.pit.err.add.toFixed(1)} s)` : ""}` : ev });
  // tyres cool in the lane (slow, no load), energy: the limiter (no deploy)
  stepTyre(car.tyre, { v: car.v, aLat: 0, aLong: 0, heat: 0, Tair: C.w.airT, Ttrack: C.w.trackT, water: 0, abrasion: 1 }, DT);
  car.wheelDist += car.v * DT;
  if (car.pit.phase === "none" && ev === "exit") {
    car.where = "lap"; car.d = T.at(T.line, car.s);
    const tm = car.pit.times, lane = (tm.exit - tm.entry) / 1000;
    // the stop's loss: time from the branch to the merge minus the time the car would have taken on the lap over the same
    // stretch at its free reference pace (forward pass of its envelope at entry) – the parts: queue, stationary (penalty +
    // work), the rest (braking to the limiter, the lane, the launch). Approximate: the reference is a free lap's pace.
    const queue = tm.queue != null ? (tm.queueEnd - tm.queue) / 1000 : 0, still = (tm.release - tm.stop) / 1000, ref = car.pit.refS ?? 0;
    const loss = lane - ref;
    car.acct.pit += loss; (car.acct.pitParts ||= []).push({ lap: car.lap, loss: +loss.toFixed(2), queue: +queue.toFixed(2), stationary: +still.toFixed(2), rest: +(loss - queue - still).toFixed(2), ref: +ref.toFixed(2) });
    log(race, { t, car: car.num, type: "pitExit", cause: "stop", effect: `loss ${loss.toFixed(1)} s (lane ${lane.toFixed(1)} s − free ${ref.toFixed(1)} s; stationary ${still.toFixed(1)} s${queue ? `, queued ${queue.toFixed(1)} s` : ""})` });
    car.pit.times = {};
  }
  // the timing line inside the pit lane
  const sNow = car.where === "pit" ? T.pit.pitToLap(car.pit.u) : car.s;
  if (car.where === "pit") { const crossed = T.ahead(sPrev, sNow) < T.L / 2 && sNow < sPrev; lineCrossing(race, car, sPrev, sNow, crossed, t); car.s = sNow; }
  car.dist = car.armed ? car.lap * T.L + (car.where === "pit" ? sNow : car.s) : (car.where === "pit" ? sNow : car.s) - T.L;
}

// the time the car would take from the pit branch (sIn) to the merge (sOut) on the lap at its free pace (s): one forward
// pass of its present envelope (≈ 0.2 ms, once per stop)
function pitReference(race, car) {
  const C = race.cache, T = C.T, cp = C.cars[car.num], st = car.profIn; if (!st) return 0;
  const pr = C.pitRef || (C.pitRef = makeProfile(T.n));
  computeProfile(C.PT, cp, { ...st, P: cp.P_ice, forward: true }, pr);
  const vf = pr.vf, n = T.n, i0 = T.idx(T.pit.sIn), len = Math.round(T.ahead(T.pit.sIn, T.pit.sOut) / T.ds); let tt = 0;
  for (let k = 0; k < len; k++) { const i = (i0 + k) % n, j = (i + 1) % n; tt += (2 * T.ds) / Math.max(1, vf[i] + vf[j]); }
  return tt;
}

// a pit-lane starter waits at the pit exit until the field has passed it (simple rule; control.js refines)
function pitStartWait(race, car, t) {
  const S = race.state, T = race.cache.T;
  const exitDist = T.pit.sOut < T.L / 2 ? T.pit.sOut : T.pit.sOut - T.L;   // the pit exit's place on the first lap
  const passed = S.cars.filter((o) => o.status === "run").every((o) => o.dist > exitDist + 30);
  if (t > 3000 && passed) { car.status = "run"; car.where = "lap"; car.s = T.pit.sOut; car.armed = true; car.dist = car.s; car.lapT0 = t; log(race, { t, car: car.num, type: "pitLaneStart", cause: "start", effect: "released from the pit exit" }); }
}

function lineCrossing(race, car, s0, s1, crossed, tCross) {
  const S = race.state, T = race.cache.T;
  if (!crossed) return;
  if (!car.armed) { car.armed = true; car.lapT0 = tCross; return; }
  car.lap++;
  const lapT = (tCross - car.lapT0) / 1000; car.lapT0 = tCross;
  const inLap = car.pit.times?.entry != null || car.where === "pit";
  car.laps.push({ n: car.lap, t: +lapT.toFixed(3), compound: car.tyre.name, wear: +car.tyre.wear.toFixed(4), fuel: +car.energy.fuel.toFixed(2), soc: +socFrac(car.energy, race.cache.ep).toFixed(3), pit: inLap, mode: car.mode.pace });
  tyreLap(car.tyre); energyLap(car.energy);
  if (car.lap > S.leaderLap) S.leaderLap = car.lap;
  // the chequered flag: the leader completing the race distance; every car after it finishes at its next crossing
  if (S.chequeredAt == null && car.lap >= S.totalLaps) { S.chequeredAt = tCross; S.phase = "chequered"; log(race, { t: tCross, car: car.num, type: "chequered", cause: "race distance", effect: `${car.tla} wins on the road` }); }
  if (S.chequeredAt != null) { car.status = "fin"; car.finT = tCross; car.v = 0; }
}

function planCall(race, car, t) {
  const p = car.plan; if (!p || car.pit.phase !== "none" || car.status !== "run") return;
  const k = p.stints.findIndex((x) => x.toLap > car.lap);
  if (k <= 0 && car.lap < (p.stints[0]?.toLap ?? Infinity) - 1) return;
  const cur = p.stints[k < 0 ? p.stints.length - 1 : k], next = p.stints[(k < 0 ? p.stints.length - 1 : k) + 1];
  if (!next || car.lap < cur.toLap - 1 || car.lap >= race.state.totalLaps - 1) return;
  if (car.planCalled === cur.toLap) return;
  car.planCalled = cur.toLap;
  const r = pitCall(car, race.cache.T, { compound: next.compound, t }); car.pit.call && (car.pit.call.by = p.by || "plan");
  log(race, { t, car: car.num, type: "pitCall", cause: `plan (${p.by || "team"})`, effect: r.ok ? `box for ${next.compound}: ${r.why}` : `refused: ${r.why}` });
}

function finishCheck(race, t) {
  const S = race.state;
  if (S.chequeredAt == null) return;
  // every running car has crossed after the leader, or 10 min passed (a car stopped somewhere can't hold the race open)
  const running = S.cars.filter((c) => c.status === "run" || (c.where === "pit" && c.status !== "fin" && c.status !== "dnf"));
  if (!running.length || t - S.chequeredAt > 600000) {
    S.finished = true; S.phase = "finished";
    for (const c of running) if (c.status !== "fin") { c.status = "fin"; c.finT = c.finT ?? t; }
    S.results = classify(race);
    log(race, { t, type: "finished", cause: "all cars in", effect: `winner ${S.results.rows[0]?.tla}` });
  }
}

function sortOrder(race) {
  const S = race.state;
  const key = (c) => (c.status === "dnf" ? -1e12 + c.dist : c.status === "fin" ? 1e12 - (c.finT || 0) + c.lap * 1e9 : c.dist);
  S.order = S.cars.slice().sort((a, b) => key(b) - key(a)).map((c) => c.num);
}

// classification (basic: laps then time; rules.js adds the 90 % rule, penalties, points per season)
export function classify(race) {
  const S = race.state, T = race.cache.T;
  const rows = S.cars.map((c) => ({ num: c.num, tla: c.tla, team: c.team, teamKey: c.teamKey, laps: c.lap, time: c.finT != null ? (c.finT + c.pen.finalS * 1000) : null, status: c.status, stops: c.pit.stops, acct: { ...c.acct } }));
  rows.sort((a, b) => b.laps - a.laps || (a.time ?? Infinity) - (b.time ?? Infinity));
  const w = rows[0];
  rows.forEach((r, i) => { r.pos = i + 1; r.gap = r.laps === w.laps && r.time != null ? +((r.time - w.time) / 1000).toFixed(3) : null; r.lapsDown = w.laps - r.laps; });
  return { rows, by: "engine.classify (basic)" };
}

// ---------- orders ----------

export function command(race, cmd) { return CMD.submit(race.state.commands, race.state.t, cmd); }

function applyOrder(race, c, t) {
  const S = race.state, car = c.car != null ? S.cars.find((x) => x.num === c.car) : null;
  if (c.car != null && !car) return { ok: false, why: "no such car" };
  // the player commands only the user team's cars (the AI its own) – a cross-team order is refused
  if (car && c.by === "player" && S.userTeam && car.teamKey !== S.userTeam) return { ok: false, why: "not your car" };
  if (car && (car.status === "fin" || car.status === "dnf")) return { ok: false, why: `car ${car.status}` };
  switch (c.type) {
    case "pace": if (!CMD.PACE.includes(c.args.mode)) return { ok: false, why: "unknown pace mode" }; setPaceMode(car.driver, c.args.mode); car.mode.pace = c.args.mode; return { ok: true };
    case "energy": if (!CMD.ENERGY.includes(c.args.mode)) return { ok: false, why: "unknown energy mode" }; car.mode.energy = c.args.mode; return { ok: true };
    case "pit": { const r = pitCall(car, race.cache.T, { compound: c.args.compound, t }); if (r.ok && car.pit.call) car.pit.call.by = c.by; log(race, { t, car: car.num, type: "pitCall", cause: c.by, effect: r.ok ? `box for ${c.args.compound}: ${r.why}` : `refused: ${r.why}` }); return r; }
    case "pitCancel": { const r = pitCancel(car); log(race, { t, car: car.num, type: "pitCancel", cause: c.by, effect: r.ok ? "cancelled" : `refused: ${r.why}` }); return r; }
    case "plan": if (!Array.isArray(c.args.stints) || !c.args.stints.length) return { ok: false, why: "no stints" }; car.plan = { stints: c.args.stints.map((x) => ({ compound: x.compound, toLap: x.toLap | 0 })), by: c.by }; car.planCalled = null; return { ok: true };
    case "teamOrder": if (!CMD.TEAM_ORDER.includes(c.args.policy)) return { ok: false, why: "unknown policy" }; S.teamOrders[c.team || car?.teamKey] = { policy: c.args.policy, ...c.args }; return { ok: true };
  }
  return { ok: false, why: "unhandled" };
}

// ---------- reading ----------

function log(race, e) { race.state.log.push({ t: e.t ?? race.state.t, lap: race.state.leaderLap, ...e }); }
export const events = (race, sinceT = -1) => race.state.log.filter((e) => e.t > sinceT);
export const results = (race) => race.state.results || classify(race);
export function forecast(race) { return forecastAt(race.cache.truth, race.state.t, race.state.seed); }

export function snapshot(race) {
  const S = race.state, C = race.cache, T = C.T, w = C.w, order = S.order, pos = new Map(order.map((n, i) => [n, i + 1]));
  const lead = S.cars.find((c) => c.num === order[0]);
  return { t: S.t, scenarioId: S.scenarioId, totalLaps: S.totalLaps, leaderLap: S.leaderLap, flag: S.phase === "chequered" || S.phase === "finished" ? "chequered" : S.phase === "grid" ? "grid" : "green", sc: null,
    weather: { rain: w.rain ?? 0, airT: w.airT ?? null, trackT: w.trackT ?? null, wind: w.wind ?? null, water: avg(C.surface.hLine), est: !!w.est },
    cars: S.cars.map((c) => ({ num: c.num, teamKey: c.teamKey, team: c.team, tla: c.tla, color: c.color, status: c.status === "pitstart" ? "grid" : c.where === "pit" && c.status === "run" ? "pit" : c.status, pos: pos.get(c.num), lap: c.lap,
      where: c.where, s: c.s, u: c.where === "pit" ? c.pit.u : null, d: c.d, v: c.v, a: c.aLong, steer: steerOf(T, c), wheelDist: c.wheelDist,
      aero: { open: 0, front: 0 }, drs: false, overtake: false,
      tyre: { compound: c.tyre.name, code: c.tyre.compound, wear: c.tyre.wear, Ts: c.tyre.Ts, Tc: c.tyre.Tc, age: c.tyre.laps }, energy: { soc: socFrac(c.energy, C.ep), mode: c.mode.energy, deployKw: 0 }, fuel: c.energy.fuel,
      pit: { phase: c.pit.phase, u: c.pit.u, workT0: c.pit.times?.work ?? null, workT1: c.pit.workEnd ?? null, err: c.pit.err, compound: c.pit.call?.compound ?? null },
      gap: { leader: lead && c.lap === lead.lap ? gapSec(c, lead, T) : null, ahead: null } })) };
}
const avg = (a) => { let s = 0; for (const x of a) s += x; return a.length ? s / a.length : 0; };
// the front wheels' steer for the screen: the path's curvature × wheelbase (kinematic, rad, + left)
const steerOf = (T, c) => (c.where === "lap" ? Math.max(-0.4, Math.min(0.4, Math.atan(3.6 * T.at(T.kappaLine || T.kappa, c.s)))) : 0);
const gapSec = (c, lead, T) => (c === lead ? 0 : c.v > 1 ? +((lead.dist - c.dist) / Math.max(20, c.v)).toFixed(2) : null);

// ---------- save / load ----------

export function saveRace(race) {
  race.state.surface = saveSurface(race.cache.surface);
  return JSON.stringify({ engine: ENGINE_VERSION, stateVersion: STATE_VERSION, scenarioId: race.state.scenarioId, rng: race.rng.save(), state: race.state, cacheMeta: { profilesAt: Object.fromEntries(Object.entries(race.cache.profiles).map(([k, v]) => [k, v.at])), w: race.cache.w } });
}
export function loadRace(json, scenario, opts = {}) {
  const o = typeof json === "string" ? JSON.parse(json) : json;
  if (o.stateVersion !== STATE_VERSION) throw new Error(`save from state version ${o.stateVersion}, engine ${STATE_VERSION}`);
  if (o.scenarioId !== scenario.meta.id) throw new Error(`save is for ${o.scenarioId}, not ${scenario.meta.id}`);
  const race = { state: o.state, scenario, cache: null, rng: Streams.load(o.rng) };
  buildCache(race, opts);
  // the envelopes as they were: recompute each at the same inputs, with the same last-computed time
  Object.assign(race.cache.w, o.cacheMeta.w);
  for (const car of race.state.cars) {
    const at = o.cacheMeta.profilesAt[car.num]; race.cache.profiles[car.num].at = -1e9;
    if (at > -1e8 && car.where === "lap" && car.status === "run") { const saveT = race.state.t; reprofileAt(race, car, at); race.state.t = saveT; }
  }
  return race;
}
// recompute a car's envelope for its present inputs and mark it computed at `at` (load: the same envelope the saved run
// had, since its inputs then are its stored state now – the profile depends only on state saved with the car)
function reprofileAt(race, car, at) {
  const C = race.cache, cp = C.cars[car.num], pr = C.profiles[car.num];
  const st = car.profIn; if (!st) return;
  computeProfile(C.PT, cp, { ...st, forward: false }, pr.prof); pr.at = at;
}
