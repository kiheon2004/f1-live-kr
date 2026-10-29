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
//   5. race control (control.js: the line / sector / SC-line crossings of this move, the SC car, flags, start, finish), the
//      stewards (rules.js), the incidents with causes (incidents.js: driver errors, failures – traffic reports contacts);
//   6. the order, the classification when race control ends the race (rules.js), the team AI.
// Race control's per-car outputs (speed cap, grip-use factor, start launch, pit-lane holds) are read at the step start from
// the state the previous step left – like the traffic decisions, never from a half-moved field.
// Interactions between cars (following, the wake, DRS / Active Aero / Overtake, passing, blue flags, team orders, the pit
// entry side and the pit-exit merge, the lateral position d) are traffic.js's: trafficPre before the moves (decisions from
// the step-start field), trafficEnv per car into the car model, trafficPost after all moves (lateral moves, detection
// lines, passes). Race control's flags and rules are control.js / rules.js's (traffic reads them through race.hooks.control).
import { loadTrack } from "./track.js";
import { computeProfile, makeProfile, needsReprofile, REPROFILE, vlimAt } from "./profile.js";
import { stepCar } from "./car.js";
import { createTyre, tyreGrip, stepTyre, tyreLap, fitTemp, windowFactor, windowTemp, compoundParams } from "./tyre.js";
import { createEnergy, iceCap, ersCap, splitPower, stepEnergy, energyLap, socFrac } from "./energy.js";
import { createDriver, setPaceMode, stepDriver, utilisation, tyreHeatFactor } from "./driver.js";
import { newPitState, newBoxes, pitCall, pitCancel, pitOnLap, pitStep, lapCapForPit, IN_LANE } from "./pit.js";
import { weatherTruth, truthAt, forecastAt, newSurface, surfaceStep, waterAt, rubberAt, segOf, saveSurface, loadSurface } from "./weather.js";
import { Streams } from "./rng.js";
import { DT_MS, DT } from "./clock.js";
import * as CMD from "./commands.js";
import { availableCompounds, isCompound } from "./compounds.js";
import { newTraffic, trafficSetup, trafficPre, trafficEnv, trafficPost, trafficAccount, trafficEnd, pathFactor, mergeClear, onPitExit, gridLateral, snapTraffic } from "./traffic.js";
import { newAiState, aiPrePlans, aiStep } from "./ai.js";
import * as CTL from "./control.js";
import * as RULES from "./rules.js";
import * as INC from "./incidents.js";
import R2025 from "../data/rules/2025.js";
import { INCIDENTS } from "../data/params/incidents.js";
import { carBase } from "../data/params/cars-base.js";
import { energyParams } from "../data/params/energy.js";
import { airDensity } from "../data/params/physics.js";
import { values } from "../data/params/param.js";
import { CARS_2025_TABLE, TRACK_TAU_2025 } from "../data/params/cars-2025.js";
import { CARS_2026_TABLE, TRACK_TAU_2026 } from "../data/params/cars-2026.js";
// per-team fitted car coefficients by season (calibrate.mjs; 2024 has none – one wet race – so the base car); per-race
// track grip factor τ where the calibration fitted one (from THAT race's speed traces – a circuit/conditions property,
// not its result), else 1 (estimate: the validation showed ±3 s/lap without it – reported as a limit)
const TEAM_CARS = { 2025: CARS_2025_TABLE, 2026: CARS_2026_TABLE }, TRACK_TAU = { ...TRACK_TAU_2025, ...TRACK_TAU_2026 };

export const ENGINE_VERSION = "0.48.0-engine.1";
export const STATE_VERSION = 1;

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
      s: g && Number.isFinite(g.s) ? T.wrap(g.s) : T.wrap(T.pit.sOut), d: g?.d ?? 0, v: 0, aLong: 0, aLat: 0, steer: 0, wheelDist: 0,
      lap: 0, armed: false, dist: 0, lapT0: 0, laps: [], sector: 0, secT0: 0, secs: [],
      tyre: newTyre(race, start, w0.airT),
      energy: createEnergy(race.cache.ep, {}), driver: createDriver(dp), mode: { pace: "balanced", energy: "balanced" },
      plan, pit: newPitState(), traffic: newTraffic(),
      pen: { pendingS: 0, finalS: 0, serve: [] }, acct: { traffic: 0, pit: 0, other: 0 } };
    // behind the line at the start: its first crossing starts lap 1 (not a lap done); ahead of it (some grids): armed
    car.armed = T.ahead(0, car.s) < T.L / 2;
    car.dist = car.armed ? car.s : car.s - T.L;
    state.cars.push(car);
  }
  // race control places the grid (the scenario's measured slots) and the pit-lane starters (in the lane, held at its end
  // until the field has passed the pit exit), and schedules the start: the lights, each driver's reaction and launch
  INC.newIncidents(race);
  CTL.newControl(race, T);
  // (every car's lap state from where race control put it: a slot the scenario couldn't measure is the rules' layout)
  for (const c of state.cars) { if (c.where === "pit") c.s = T.pit.pitToLap(c.pit.u); c.armed = T.ahead(0, c.s) < T.L / 2; c.dist = c.armed ? c.s : c.s - T.L; }
  gridLateral(race);
  sortOrder(race);
  for (const c of state.cars) noteTransitions(c, 0);
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
  // race names (SOFT/MEDIUM/HARD) → the C-number Pirelli nominated for this event (compounds.js: the one answer the engine,
  // the AI and the screens share; research data, else the defaults, est)
  const AV = availableCompounds(sc), alloc = { ...AV.alloc, est: AV.est };
  const tau = TRACK_TAU[sc.meta.id] ?? 1;
  race.cache = { T, PT, cars, drivers, profiles, alloc, tau, tauEst: !(sc.meta.id in TRACK_TAU), ep: energyParams(season), truth: weatherTruth(rec, { mode: race.state.weatherMode, seed: race.state.seed, minutes: 240 }),
    surface: race.cache?.surface || null, w: {}, carById: null, ghostProf: {} };
  if (!race.state.surface) race.state.surface = saveSurface(newSurface(T));
  race.cache.surface = loadSurface(race.state.surface);
  race.cache.carById = null;
  // what traffic asks race control (overtaking permission, DRS / Active Aero / Overtake availability) and where it reports
  // contacts (functions: never saved, set again on load)
  race.hooks = { control: { mayOvertake: CTL.mayOvertake, drsAllowed: CTL.drsAllowed, activeAeroAllowed: CTL.activeAeroAllowed, overtakeModeAllowed: CTL.overtakeModeAllowed }, incidents: { contact: INC.contact },
    // (complying with a blue flag: giving way – to any car –, or the lapping car already in the middle of its pass)
    traffic: { yielding: (c, f) => c.traffic?.role === "yield" || (f.traffic?.with === c.num && ["att", "done"].includes(f.traffic.role)) } };
  trafficSetup(race);
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

// a plain team plan when none is given: one stop near half distance, MEDIUM → HARD – the two harder of the event's three
// nominated dry compounds (known before the race; NOT the compounds the real race happened to use – scenario.tyres.
// compoundsSeen comes from the race's own stints and is never an engine input, DESIGN §0.6). ai.js replaces it.
// Where the season's rules ask for more sets (2025 Monaco: three, SR 30.5m) two stops at thirds, MEDIUM → HARD → HARD.
export function defaultPlan(sc, num) {
  const L = sc.race.laps, M = sc.meta.season === 2025 && /monaco/i.test(`${sc.meta.event || ""} ${sc.meta.id || ""}`) ? R2025.mandatoryDryCompounds?.value?.monaco : null;
  if (M && M.minSetsAnySpec >= 3) return { stints: [{ compound: "MEDIUM", toLap: Math.round(L / 3) }, { compound: "HARD", toLap: Math.round((2 * L) / 3) }, { compound: "HARD", toLap: L }], by: "default" };
  return { stints: [{ compound: "MEDIUM", toLap: Math.round(L * 0.45) }, { compound: "HARD", toLap: L }], by: "default" };
}

// ---------- the step ----------

export function step(race) {
  const S = race.state, C = race.cache, T = C.T;
  if (S.finished) return;
  const t = S.t + DT_MS;
  // (the start is race control's: lights, reactions, launches – the formation lap is not simulated: tyres preset, est)
  // 1. orders
  for (const c of CMD.due(S.commands, t)) CMD.record(S.commands, c, t, applyOrder(race, c, t));
  // 2. weather (once a second, on the second)
  if (t % 1000 === 0) { truthAt(C.truth, t, C.w); surfaceStep(C.surface, C.w, 1); }
  else if (C.w.rain == null) truthAt(C.truth, t, C.w);
  // 3. traffic decisions from the field as it is now (step start)
  trafficPre(race, t);
  const s0 = new Map(); for (const c of S.cars) if (c.status === "run" && c.where === "lap") s0.set(c.num, c.s);
  // race control's caps / pit-lane inputs for every car from the step-start state (before anything moves)
  const caps = new Map(); for (const c of S.cars) if (c.status === "run") caps.set(c.num, c.where === "pit" ? pitInputs(race, c) : CTL.caps(race, T, c));
  // 4. move
  for (const car of S.cars) {
    if (car.status !== "run") { car.v = 0; continue; }   // (grid: waiting for its go; fin / dnf: out of the running)
    if (car.traffic.released === t) { car.traffic.released = null; continue; }   // (joined this step at the pit exit: moves from the next)
    const dr = car.driver; stepDriver(dr, race.rng.get("driver:" + car.num), DT);
    if (car.where === "pit") movePit(race, car, t, caps.get(car.num));
    else moveLap(race, car, t, caps.get(car.num));
  }
  S.t = t; S.step++;
  // lateral moves, detection lines, passes (after every car moved)
  for (const c of S.cars) if (!(c.status === "run" && c.where === "lap")) s0.delete(c.num);
  trafficPost(race, t, s0);
  // 5. race control: this move's crossings, the SC, flags, start / finish; then the stewards and the incidents
  const flag0 = S.control.flag, phase0 = S.control.phase, water = avg(C.surface.hLine);
  CTL.controlStep(race, T, { wet: water > 0.15 || (C.w.rain || 0) > 0.5, lowGrip: water > 1.0 });
  RULES.stewardsStep(race, T);
  for (const car of S.cars) incidentsFor(race, car);
  controlEvents(race, flag0, phase0);
  // 6. order, the end
  sortOrder(race);
  for (const car of S.cars) noteTransitions(car, t);
  if (S.finished && !S.results) finishRace(race, t);
  // 7. the team AI (only orders – applied from the next step, like the player's)
  if (S.ai) aiStep(race);
}

// A car's discrete state (lap / pit / garage, status, pit phase, the tyre fitted) changes at a step: each change is kept
// with its sim time (car.trans, the last few, ≤ 60 s old) so the screen applies it at that time, not at the next snapshot
// it happens to receive (v0.49 §4: a stop's new tyres were drawn before the work had ended). State, saved like the rest.
const discOf = (c) => ({ where: c.where, status: c.status, phase: c.pit.phase, tyre: c.tyre.name, code: c.tyre.compound });
function noteTransitions(car, t) {
  const d = discOf(car), p = car.disc;
  if (!p) { car.disc = d; car.trans = []; return; }
  if (p.where === d.where && p.status === d.status && p.phase === d.phase && p.tyre === d.tyre && p.code === d.code) return;
  const set = {}; for (const k in d) if (d[k] !== p[k]) set[k] = d[k];
  car.trans.push({ t, set }); car.disc = d;
  while (car.trans.length > 12 || (car.trans.length && car.trans[0].t < t - 60000)) car.trans.shift();
}

// the pit lane: race control's holds (red-flag queue, exit light, pit-lane start) ⊕ the stewards' penalty to serve
function pitInputs(race, car) {
  const a = CTL.pitCtx(race, race.cache.T, car), b = RULES.pitCtx(race, car);
  return { noBox: a.noBox || b.noBox, holdU: a.holdU, penaltyS: b.penaltyS, noWork: b.noWork };
}

// the incidents with causes, from what the car did this step (incidents.js; each hazard 0 without its cause)
function incidentsFor(race, car) {
  const x = car.incIn; car.incIn = null;
  if (!x || car.status !== "run") return;
  const T = race.cache.T;
  INC.driverError(race, T, car, x);
  if (car.status === "run") INC.mechanical(race, T, car, { reliab: 1, attack: car.mode.pace === "attack" ? 1 : 0, push: car.mode.energy === "push" ? 1 : 0, airT: race.cache.w.airT, braking: x.braking });
  if (car.status === "dnf") { car.v = 0; trafficEnd(race, car); }
}

// flag / phase changes as engine events (the screens' auto-slow and the log read these types)
function controlEvents(race, flag0, phase0) {
  const S = race.state, ctl = S.control;
  S.phase = ctl.phase;
  if (ctl.flag !== flag0) log(race, { type: ctl.flag === "green" ? "green" : ctl.flag, cause: ctl.msgs.at(-1)?.text || "race control", effect: `${flag0} → ${ctl.flag}` });
  if (ctl.phase !== phase0) {
    if (ctl.phase === "racing" && phase0 === "grid") { for (const c of S.cars) if (!c.armed) c.lapT0 = ctl.t0 ?? S.t; log(race, { type: "lightsOut", cause: "start", effect: "lights out" }); }
    if (ctl.phase === "chequered") { S.chequeredAt = ctl.fin.flagT; log(race, { t: ctl.fin.flagT, type: "chequered", cause: ctl.fin.reason || "distance", effect: "chequered flag" }); }
  }
  for (const c of S.cars) if (c.status === "fin" && c.finT == null) { c.finT = c.fin?.t ?? S.t; c.v = 0; trafficEnd(race, c); }
}

function finishRace(race, t) {
  const S = race.state;
  S.phase = "finished";
  for (const c of S.cars) if (c.status === "fin" && c.finT == null) c.finT = c.fin?.t ?? t;
  RULES.classify(race, race.cache.T);
  S.results = resultRows(race, S.results);
  log(race, { t, type: "finished", cause: S.control.fin.reason || "race control", effect: `winner ${S.results.rows[0]?.tla}` });
}
// rules.classify's rows with the fields the screens and tools read (gap in s or laps down, stops, time accounts)
function resultRows(race, R) {
  const byNum = new Map(race.state.cars.map((c) => [c.num, c]));
  for (const r of R.rows) {
    const c = byNum.get(r.num);
    r.gap = r.pos === 1 ? 0 : r.gap?.s ?? null; r.lapsDown = r.pos == null ? null : (R.rows[0].laps - r.laps);
    r.time = Number.isFinite(r.totalMs) ? r.totalMs : null; r.stops = c.pit.stops;
    // the accounts that can be separated cleanly: traffic (the ghost – approximate), the pit stops' loss and its queue
    // part (approximate: a free lap's pace as the reference), the penalties added; tyre management / energy use are not
    // split out (no clean counterfactual)
    const pq = (c.acct.pitParts || []).reduce((a, p) => a + p.queue, 0);
    r.acct = { traffic: +c.acct.traffic.toFixed(2), pit: +c.acct.pit.toFixed(2), pitQueue: +pq.toFixed(2), penalty: r.penS || 0, approx: ["traffic", "pit", "pitQueue"], pitParts: c.acct.pitParts || [] };
    // stints as run (from the lap records: compound per completed lap)
    // (a new stint after an in-lap – the lap record's pit flag – or when the compound changes, e.g. a red-flag change)
    r.stints = []; let prev = null; for (const l of c.laps) { const last = r.stints.at(-1); if (last && !prev?.pit && last.compound === l.compound) last.laps++; else r.stints.push({ compound: l.compound, laps: 1 }); prev = l; }
  }
  R.by = "rules.classify";
  return R;
}

// the car's coefficients with its damage (incidents.js car.dmg: aero – a share of the downforce lost –, power – the share
// left): a new damage state forces an envelope refresh (car.dmgKey is saved, so a restored race doesn't refresh again)
function carOf(race, car) {
  const C = race.cache, cp = C.cars[car.num], d = car.dmg;
  if (!d || (!d.aero && d.power === 1)) return cp;
  const key = `${d.aero}|${d.power}`, m = C.dmgCars || (C.dmgCars = {});
  if (car.dmgKey !== key) { car.dmgKey = key; C.profiles[car.num].at = -1e9; }
  if (!m[car.num] || m[car.num].key !== key) m[car.num] = { key, cp: { ...cp, ClA: cp.ClA * (1 - d.aero), P_ice: cp.P_ice * d.power } };
  return m[car.num].cp;
}

// tv: traffic's energy scene (mode incl. ":scene", 2026 Overtake active) – the free reference power (P0) is the team mode's
function envFor(race, car, tv = null) {
  const C = race.cache, T = C.T, w = C.w, cp = carOf(race, car);
  const water = waterAt(C.surface, car.s), rubber = rubberAt(C.surface, car.s);
  const mode = tv?.mode || car.mode.energy, ep = C.ep;
  const pIce = iceCap(car.energy, cp.P_ice, ep), pErs = ersCap(car.energy, ep, mode, car.v, !!tv?.ot);
  const p0 = mode === car.mode.energy ? pErs : ersCap(car.energy, ep, car.mode.energy, car.v, false);
  return { water, rubber: rubber * C.tau, m: cp.m_min + car.energy.fuel, pIce, pErs, P: pIce + pErs, P0: pIce + p0, rho: airDensity(w.airT ?? 25), muTyre: tyreGrip(car.tyre, water), util: utilisation(car.driver, water) };
}

function moveLap(race, car, t, cap = null) {
  const S = race.state, C = race.cache, T = C.T, cp = carOf(race, car), tv = trafficEnv(race, car), E = envFor(race, car, tv);
  // race control: a grip-use factor (yellow, a moment), the launch (reaction is in the go time; launch quality scales the
  // traction-limited power below the MGU-K's speed – est), and a speed cap (VSC delta, SC queue, an incident)
  if (cap) {
    if (cap.util !== 1) E.util *= cap.util;
    if (cap.launch && car.v < cap.launch.mguKFromKmh / 3.6) { E.P *= cap.launch.quality; E.pIce *= cap.launch.quality; E.pErs *= cap.launch.quality; }
  }
  // the envelope when its inputs moved (μ 0.3 %, mass 5 kg) – at most every 0.5 s – or every 2 s
  const pr = C.profiles[car.num], mu = cp.mu_mech * E.muTyre * E.rubber * E.util;
  if ((t - pr.at >= 500 && needsReprofile(pr.prof, mu, E.m)) || t - pr.at >= REPROFILE.everyMs) {
    car.profIn = { muTyre: E.muTyre, muTrack: E.rubber, util: E.util, m: E.m, rho: E.rho };   // (saved: a restored race rebuilds the same envelope)
    computeProfile(C.PT, cp, { ...car.profIn, forward: false }, pr.prof);
    // (the 2 s refreshes staggered over the cars – not all 20 envelopes on one step: the frame-time spikes ui3d measured)
    pr.at = pr.at < -1e8 ? t - pr.phase : t;
  }
  // (off the line the s-progress is v/pf: the traffic caps – set in s terms – scale with pf for the path speed)
  const pf0 = pathFactor(race, car), vCap = Math.min(tv.vCap * pf0, lapCapForPit(car, T), cap ? cap.v : Infinity);
  const cs = { s: car.s, v: car.v, lap: 0, aLong: 0, aLat: 0, pDrive: 0, pBrake: 0, crossed: false, tCross: 0, limited: false, over: 0 };
  const s0 = car.s;
  stepCar(cs, C.PT, pr.prof, cp, { m: E.m, P: E.P, rho: E.rho, mu: pr.prof.mu, vCap, capArr: tv.capArr, cdaMul: tv.cdaMul, claMul: tv.claMul, aLift: tv.aLift }, DT);
  let moved = T.ahead(s0, cs.s) + (cs.crossed && cs.s >= s0 ? T.L : 0);
  car.wheelDist += moved;
  // off the racing line the path is longer or shorter than the line's (traffic.pathFactor): progress along s scales
  const pf = pathFactor(race, car);
  if (pf !== 1) { const ms = moved / pf, raw = s0 + ms; cs.crossed = raw >= T.L; cs.s = T.wrap(raw); if (cs.crossed) cs.tCross = Math.min(DT, cs.tCross * pf); moved = ms; }
  car.aLong = cs.aLong; car.aLat = cs.aLat; car.v = cs.v; car.s = cs.s;
  // the incidents' inputs (evaluated after every car moved): u from the grip the driver uses ÷ the grip there now, above
  // his own balanced level (params errGain) – only while the car is on its envelope (limited); the envelope was built with
  // the grip of its last refresh, so a tyre that cooled or a wetter patch since then adds to it
  const muNow = cp.mu_mech * E.muTyre * E.rubber, wf = windowFactor(compoundParams(car.tyre.compound), windowTemp(car.tyre));
  const over = pr.prof.mu / Math.max(1e-6, muNow) - car.driver.p.pace, IP = INCIDENTS;
  // (on the envelope = at its limit speed here: a car held back by a cap – the SC queue, a VSC delta, the car ahead – is
  // within its margin whatever the ratio says)
  const onEnv = cs.limited && car.v > 0.97 * vlimAt(pr.prof, C.PT, car.s);
  car.incIn = { u: onEnv ? Math.min(1 + 0.5 * (1 - IP.errU0.v), IP.errU0.v + IP.errGain.v * over) : 0, tyreOut: Math.min(1, (1 - wf) / 0.5), water: E.water, compound: car.tyre.name, braking: cs.aLong < -10 };
  // tyres and energy from what the car did
  const [pi, pe] = splitPower(cs.pDrive, E.pIce, E.pErs);
  car.deployW = pe > 0 ? pe : 0;   // (the ERS power deployed this step: the snapshot's energy.deployKw)
  stepTyre(car.tyre, { v: car.v, aLat: car.aLat, aLong: car.aLong, heat: cp.C_tyre_heat * tyreHeatFactor(car.driver) * tv.heatMul, Tair: C.w.airT, Ttrack: C.w.trackT, water: E.water, abrasion: 1 }, DT);
  stepEnergy(car.energy, C.ep, { pIce: pi, pErs: pe, pBrake: cs.pBrake, iceFull: pi >= E.pIce * 0.999 && E.pIce > 0, otLap: tv.otLap }, DT, t);
  // the surface: a car entering a new segment
  const sg0 = segOf(C.surface, s0), sg1 = segOf(C.surface, car.s); if (sg0 !== sg1) C.surface.passes[sg1] += 1;
  // the pit: commit / entry
  const pev = pitOnLap(car, T, s0, car.s, t);
  if (pev === "entry") {
    car.where = "pit"; trafficEnd(race, car); car.pit.refS = pitReference(race, car);
    log(race, { t, car: car.num, type: "pitEntry", cause: car.pit.call?.by || "call", effect: `box for ${car.pit.call?.compound || "same"}` });
    RULES.onPitEntry(race, T, car);
    // (retired in the garage: out of the lane – a stopped car left in the fast lane would block every car behind it)
    if (INC.pitEntry(race, T, car)) { car.where = "garage"; car.pit.phase = "none"; car.v = 0; log(race, { t, car: car.num, type: "retired", cause: car.out.cause, effect: "retired in the garage" }); }
  }
  if (pev === "committed") log(race, { t, car: car.num, type: "pitCommitted", cause: "call", effect: "past the commit point" });
  // line crossing
  lineCrossing(race, car, s0, car.s, cs.crossed, t - DT_MS + Math.round(cs.tCross * 1000));
  car.dist = car.armed ? car.lap * T.L + car.s : car.s - T.L;
  // the traffic time account: a free "ghost" of this car (same envelope, power, mass, non-traffic caps; no traffic) runs
  // beside it while traffic influences it – the loss is the time difference at the same distance (traffic.js)
  trafficAccount(race, car, ghostModels(E));
  // plan: call the stop when the plan says (the team's plan – ai.js decides plans; executing them is the engine's)
  planCall(race, car, t);
}

// the traffic ghost's models (traffic.js trafficAccount): the same tyre / energy / envelope code as a real car, on the
// ghost's own copies of the tyre and energy state (taken when the episode starts); its envelope is recomputed every 2 s
// from its own grip and mass (inputs kept in gh.pin, so a restored race rebuilds the same one)
function ghostModels(E) {
  return {
    start(race, car, gh) { gh.tyre = JSON.parse(JSON.stringify(car.tyre)); gh.energy = JSON.parse(JSON.stringify(car.energy)); gh.energy.events = []; gh.pat = -1e9; },
    env(race, car, gh, t) {
      const C = race.cache, T = C.T, cp = carOf(race, car), gp = C.ghostProf[car.num] || (C.ghostProf[car.num] = { prof: makeProfile(T.n), pat: null });
      const muTyre = tyreGrip(gh.tyre, E.water), m = cp.m_min + gh.energy.fuel;
      // (rebuild the cached envelope if it isn't this ghost's – a restored race – then the car's own refresh rule)
      if (gh.pin && (gp.pat !== gh.pat || gp.num !== car.num)) { computeProfile(C.PT, cp, { ...gh.pin, forward: false }, gp.prof); gp.pat = gh.pat; gp.num = car.num; }
      const mu = cp.mu_mech * muTyre * E.rubber * E.util;
      if (!gh.pin || (t - gh.pat >= 500 && needsReprofile(gp.prof, mu, m)) || t - gh.pat >= REPROFILE.everyMs) {
        gh.pin = { muTyre, muTrack: E.rubber, util: E.util, m, rho: E.rho }; gh.pat = t;
        computeProfile(C.PT, cp, { ...gh.pin, forward: false }, gp.prof); gp.pat = t; gp.num = car.num;
      }
      const pIce = iceCap(gh.energy, cp.P_ice, C.ep), pErs = ersCap(gh.energy, C.ep, car.mode.energy, gh.v, false);
      return { prof: gp.prof, env: { m, P: pIce + pErs, rho: E.rho, mu: gp.prof.mu, vCap: lapCapForPit(car, T) }, pIce, pErs };
    },
    after(race, car, gh, gs, ge, t) {
      const C = race.cache, cp = carOf(race, car), [pi, pe] = splitPower(gs.pDrive, ge.pIce, ge.pErs);
      stepTyre(gh.tyre, { v: gs.v, aLat: gs.aLat, aLong: gs.aLong, heat: cp.C_tyre_heat * tyreHeatFactor(car.driver), Tair: C.w.airT, Ttrack: C.w.trackT, water: E.water, abrasion: 1 }, DT);
      stepEnergy(gh.energy, C.ep, { pIce: pi, pErs: pe, pBrake: gs.pBrake, iceFull: pi >= ge.pIce * 0.999 && ge.pIce > 0 }, DT, t);
      if (gs.crossed) { tyreLap(gh.tyre); energyLap(gh.energy); }
    },
  };
}

function movePit(race, car, t, ctx = {}) {
  const S = race.state, C = race.cache, T = C.T;
  const others = S.cars.filter((o) => o.where === "pit").map((o) => ({ num: o.num, team: o.teamKey, phase: o.pit.phase, u: o.pit.u, v: o.pit.v }));
  const sPrev = T.wrap(T.pit.sIn + Math.min(1, car.pit.u / T.pit.L) * T.ahead(T.pit.sIn, T.pit.sOut));
  let ev = pitStep(car, T, { t, dt: DT, team: car.teamKey, boxes: S.boxes, rng: race.rng.get("pit:" + car.teamKey), wet: (C.w.rain || 0) > 0.1, others,
    penaltyS: ctx.penaltyS || 0, noBox: !!ctx.noBox, holdU: ctx.holdU ?? null, noWork: !!ctx.noWork,
    stack: S.cars.some((o) => o !== car && o.teamKey === car.teamKey && o.pit.times?.release && t - o.pit.times.release < 30000),
    onWorkDone: (cc, cmp) => { cc.tyre = newTyre(race, cmp, C.w.airT ?? 25); C.profiles[cc.num].at = -1e9; } }, undefined);
  // the merge: the car waits at the end of the exit road while joining would force a car on the lap to brake or move
  if (ev === "exit" && !mergeClear(race, car)) {
    const p = car.pit; p.phase = "exit"; p.u = T.pit.L - 0.01; p.v = Math.min(p.v, 10); delete p.times.exit; ev = null;
    if (!p.mergeHeld) { p.mergeHeld = true; log(race, { t, car: car.num, type: "pitExitHold", cause: "traffic on the lap", effect: "waits at the blend line" }); }
  }
  if (car.where === "pit") car.v = car.pit.v;
  if (ev === "unsafeRelease") RULES.onUnsafeRelease(race, T, car);
  if (ev) log(race, { t, car: car.num, type: "pit:" + ev, cause: ev === "work" && car.pit.err ? car.pit.err.causes.join(", ") || "crew" : "pit", effect: ev === "work" ? `stationary ${car.pit.workS?.toFixed(2)} s${car.pit.err ? ` (slow wheel +${car.pit.err.add.toFixed(1)} s)` : ""}` : ev });
  // tyres cool in the lane (slow, no load), energy: the limiter (no deploy)
  stepTyre(car.tyre, { v: car.v, aLat: 0, aLong: 0, heat: 0, Tair: C.w.airT, Ttrack: C.w.trackT, water: 0, abrasion: 1 }, DT);
  car.wheelDist += car.v * DT;
  if (car.pit.phase === "none" && ev === "exit") {
    car.where = "lap"; car.pit.mergeHeld = false; onPitExit(race, car);
    RULES.onPitExit(race, T, car);
    const tm = car.pit.times, lane = (tm.exit - tm.entry) / 1000;
    if (tm.entry == null) { car.pit.times = {}; log(race, { t, car: car.num, type: "pitLaneStart", cause: "start", effect: "joined from the pit exit" }); }
    else {
    // the stop's loss: time from the branch to the merge minus the time the car would have taken on the lap over the same
    // stretch at its free reference pace (forward pass of its envelope at entry) – the parts: queue, stationary (penalty +
    // work), the rest (braking to the limiter, the lane, the launch). Approximate: the reference is a free lap's pace.
    const queue = tm.queue != null ? (tm.queueEnd - tm.queue) / 1000 : 0, still = (tm.release - tm.stop) / 1000, ref = car.pit.refS ?? 0;
    const loss = lane - ref;
    car.acct.pit += loss; (car.acct.pitParts ||= []).push({ lap: car.lap, loss: +loss.toFixed(2), queue: +queue.toFixed(2), stationary: +still.toFixed(2), rest: +(loss - queue - still).toFixed(2), ref: +ref.toFixed(2) });
    log(race, { t, car: car.num, type: "pitExit", cause: "stop", effect: `loss ${loss.toFixed(1)} s (lane ${lane.toFixed(1)} s − free ${ref.toFixed(1)} s; stationary ${still.toFixed(1)} s${queue ? `, queued ${queue.toFixed(1)} s` : ""})` });
    car.pit.times = {};
    }
  }
  // the timing line inside the pit lane; the lap position of a pit car runs from the branch to the merge in proportion to
  // the path (pitToLap is clamped near the ends – a distance that stalled there let a car seem behind the car that left
  // the lane after it: the control report)
  const span = T.ahead(T.pit.sIn, T.pit.sOut), sNow = car.where === "pit" ? T.wrap(T.pit.sIn + Math.min(1, car.pit.u / T.pit.L) * span) : car.s;
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
  // (the chequered flag and each car's finish are race control's: control.js onLine)
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

function sortOrder(race) {
  const S = race.state;
  const key = (c) => (c.status === "dnf" ? -1e12 + c.dist : c.status === "fin" ? 1e12 - (c.finT || 0) + c.lap * 1e9 : c.dist);
  S.order = S.cars.slice().sort((a, b) => key(b) - key(a)).map((c) => c.num);
}

// the running order as a provisional classification (laps then time) – while the race runs; at the end race control's
// rules.classify (90 % rule, penalties, the tyre rule, points) replaces it
export function classify(race) {
  const S = race.state, T = race.cache.T;
  const rows = S.cars.map((c) => ({ num: c.num, tla: c.tla, team: c.team, teamKey: c.teamKey, laps: c.lap, time: c.finT != null ? (c.finT + c.pen.finalS * 1000) : null, status: c.status, stops: c.pit.stops, acct: { ...c.acct } }));
  rows.sort((a, b) => b.laps - a.laps || (a.time ?? Infinity) - (b.time ?? Infinity));
  const w = rows[0];
  rows.forEach((r, i) => { r.pos = i + 1; r.gap = r.laps === w.laps && r.time != null ? +((r.time - w.time) / 1000).toFixed(3) : null; r.lapsDown = w.laps - r.laps; });
  return { rows, by: "engine.classify (provisional)" };
}

// ---------- orders ----------

// The player's door: the order is the player's whatever its `by` field says (v0.49 §3: a spoofed "ai:<team>" can't reach
// another team's cars). The team AI uses commandAs(race, cmd, "ai:<team>").
export function command(race, cmd) { return commandAs(race, cmd, "player"); }
export function commandAs(race, cmd, actor) { return CMD.submit(race.state.commands, race.state.t, cmd, actor, (c) => validateOrder(race, c)); }
export const commandStatus = (race, id) => CMD.status(race.state.commands, id);

// who may give this order to what, and its arguments against this race (at submit; applyOrder checks the state again)
function validateOrder(race, c) {
  const S = race.state, team = c.by.startsWith("ai:") ? c.by.slice(3) : S.userTeam;   // (the player's team: null in headless tools = any)
  if (S.finished) return { ok: false, why: "race finished" };
  let car = null;
  if (c.car != null) {
    car = S.cars.find((x) => x.num === c.car);
    if (!car) return { ok: false, why: `no car ${c.car}` };
    if (team && car.teamKey !== team) return { ok: false, why: "not your car" };
  }
  if (c.type === "teamOrder") {
    const tk = c.team ?? car?.teamKey ?? team;
    if (!tk || !S.cars.some((x) => x.teamKey === tk)) return { ok: false, why: `no team ${tk}` };
    if (team && tk !== team) return { ok: false, why: "not your team" };
    c.team = tk;
  }
  if (c.type === "pit" && c.args.compound != null && !isCompound(race.scenario, c.args.compound)) return { ok: false, why: `compound ${c.args.compound} not offered at this event` };
  if (c.type === "plan") {
    const st = c.args.stints;
    for (const x of st) if (!isCompound(race.scenario, x.compound)) return { ok: false, why: `compound ${x.compound} not offered at this event` };
    if (st[st.length - 1].toLap < S.totalLaps) return { ok: false, why: `plan ends at lap ${st[st.length - 1].toLap}, before the finish (${S.totalLaps})` };
  }
  return { ok: true };
}

// apply an order at its step: the race state decides (and nothing an order does may stop the race)
function applyOrder(race, c, t) {
  const v = validateOrder(race, c); if (!v.ok) return v;   // (the state may have moved since it was taken)
  try { return applyOrder0(race, c, t); } catch (e) { log(race, { t, car: c.car, type: "orderError", cause: c.by, effect: String(e?.message || e) }); return { ok: false, why: "internal error: " + String(e?.message || e) }; }
}
function applyOrder0(race, c, t) {
  const S = race.state, car = c.car != null ? S.cars.find((x) => x.num === c.car) : null;
  if (car && (car.status === "fin" || car.status === "dnf")) return { ok: false, why: `car ${car.status}` };
  switch (c.type) {
    case "pace": setPaceMode(car.driver, c.args.mode); car.mode.pace = c.args.mode; return { ok: true };
    case "energy": car.mode.energy = c.args.mode; return { ok: true };
    case "pit": {
      // suspended (red flag) and stopped in the lane: the free tyre change (SR 57.4b / B5.14.4a), not a stop
      if (S.control?.flag === "red" && car.where === "pit") { const r = CTL.redTyreChange(race, race.cache.T, car, c.args.compound, (cc, cmp) => { cc.tyre = newTyre(race, cmp, race.cache.w.airT ?? 25); cc.redSets = (cc.redSets || 0) + 1; race.cache.profiles[cc.num].at = -1e9; }); log(race, { t, car: car.num, type: "redTyreChange", cause: c.by, effect: r.ok ? c.args.compound : `refused: ${r.why}` }); return r; }
      const r = pitCall(car, race.cache.T, { compound: c.args.compound, t }); if (r.ok && car.pit.call) car.pit.call.by = c.by; log(race, { t, car: car.num, type: "pitCall", cause: c.by, effect: r.ok ? `box for ${c.args.compound}: ${r.why}` : `refused: ${r.why}` }); return r; }
    case "pitCancel": { const r = pitCancel(car); log(race, { t, car: car.num, type: "pitCancel", cause: c.by, effect: r.ok ? "cancelled" : `refused: ${r.why}` }); return r; }
    case "plan": car.plan = { stints: c.args.stints.map((x) => ({ compound: x.compound, toLap: Math.min(x.toLap, S.totalLaps) })), by: c.by }; car.planCalled = null; return { ok: true };
    case "teamOrder": S.teamOrders[c.team] = { policy: c.args.policy, ...c.args }; return { ok: true };
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
  const lead = S.cars.find((c) => c.num === order[0]), cs = CTL.controlSnapshot(race, T);
  return { t: S.t, scenarioId: S.scenarioId, totalLaps: S.control.fin.target, leaderLap: S.leaderLap, flag: cs.flag, sc: cs.sc,
    control: { phase: cs.phase, drs: cs.drs, overtake: cs.overtake, yellows: cs.yellows, msgs: cs.msgs },
    weather: { rain: w.rain ?? 0, airT: w.airT ?? null, trackT: w.trackT ?? null, wind: w.wind ?? null, water: avg(C.surface.hLine), est: !!w.est },
    cars: S.cars.map((c) => ({ num: c.num, teamKey: c.teamKey, team: c.team, tla: c.tla, color: c.color, status: c.where === "pit" && c.status === "run" ? "pit" : c.status, pos: pos.get(c.num), lap: c.lap,
      trans: c.trans ? c.trans.slice() : [],   // (discrete changes with their sim times – adapter3d applies them at render time)
      pen: { pendingS: c.pen.pendingS ?? 0, open: (c.pen.serve || []).filter((x) => !x.served).map((x) => x.kind) }, inc: c.inc && c.inc.until > S.t ? c.inc.kind : null, dmg: c.dmg || null, out: c.out || null, vscDelta: CTL.vscDelta(race, T, c),
      // (s null: not on the track any more – retired in the garage, or 3 s past its chequered flag: the cool-down lap
      // isn't simulated, so a finished car leaves the picture instead of standing on the line)
      where: c.where, s: c.where === "garage" || (c.status === "fin" && S.t - (c.finT ?? S.t) > 3000) ? null : c.s, u: c.where === "pit" ? c.pit.u : null, v: c.v, a: c.aLong, steer: steerOf(T, c), wheelDist: c.wheelDist,
      ...snapTraffic(c),
      tyre: { compound: c.tyre.name, code: c.tyre.compound, wear: c.tyre.wear, Ts: c.tyre.Ts, Tc: c.tyre.Tc, age: c.tyre.laps }, energy: { soc: socFrac(c.energy, C.ep), mode: c.mode.energy, deployKw: c.where === "lap" && c.status === "run" ? Math.round((c.deployW || 0) / 1000) : 0 }, fuel: c.energy.fuel,
      pit: snapPit(c.pit),
      gap: { leader: lead && c.lap === lead.lap ? gapSec(c, lead, T) : null, ahead: null } })) };
}
// the pit state for the screen. workT1 is the engine's planned end of the work (the crew animation is fitted to it); a
// screen must not show it as a number before render time reaches it (request §15: no future stationary time shown).
// times: the phases' start times so far (entry, stop, queue, queueEnd, penEnd, work, workEnd – once done –, release);
// holdT1: a penalty hold's end (its length is the stewards' published 5 / 10 s); noWork: a stop-and-go (nobody touches
// the car); held: in "release" and held for a car coming down the fast lane (safe release)
function snapPit(p) {
  const tm = p.times || {};
  return { phase: p.phase, u: p.u, workT0: tm.work ?? null, workT1: tm.work != null ? p.workEnd ?? null : null, err: tm.work != null ? p.err : null, compound: p.call?.compound ?? null,
    times: { entry: tm.entry ?? null, stop: tm.stop ?? null, queue: tm.queue ?? null, queueEnd: tm.queueEnd ?? null, penEnd: tm.penEnd ?? null, work: tm.work ?? null, workEnd: tm.workEnd ?? null, release: tm.release ?? null },
    holdT1: p.phase === "penalty" ? p.holdUntil ?? null : null, noWork: !!p.noWork, held: p.phase === "release" && !!p.unsafeRolled };
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
  CTL.refreshControlCache(race, race.cache.T);
  return race;
}
// recompute a car's envelope for its present inputs and mark it computed at `at` (load: the same envelope the saved run
// had, since its inputs then are its stored state now – the profile depends only on state saved with the car)
function reprofileAt(race, car, at) {
  const C = race.cache, cp = carOf(race, car), pr = C.profiles[car.num];
  const st = car.profIn; if (!st) return;
  computeProfile(C.PT, cp, { ...st, forward: false }, pr.prof); pr.at = at;
}
