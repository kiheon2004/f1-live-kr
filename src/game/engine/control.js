// Race control (DESIGN §10, request §12): the race's phases (grid → lights out → racing → chequered → finished), its
// flags (green, local yellow, VSC, SC, red), the safety car as a CAR on the track, the start, restarts, DRS / 2026 Active
// Aero / Overtake availability, the finish and the time limit. Pure: no DOM, no clock, no Math.random – randomness from
// the race's named streams ("control:*", "start:<num>").
//
// What the engine does with it, each step:
//   controlStep(race, T, env)  – first: line / sector / SC-line crossings of the last move, the SC car's move, flag and
//                                phase changes. env = { wet, lowGrip } (from weather: race control's view of the track).
//   caps(race, T, car)         – per car: the speed cap at its place (m/s; the car model brakes / accelerates to it with its
//                                own limits), the start hold and launch inputs, a grip-use factor (yellow). Not a lap-time
//                                factor: the VSC is a minimum time per marshalling sector each car keeps (its own delta
//                                ghost), the SC is a car the leader closes up to and the field queues behind.
//   pitCtx(race, T, car)       – extra inputs for pit.js's pitStep (red flag: queue in the fast lane, no box; held at the
//                                exit light; pit-lane starters held until the field has gone by).
//   mayOvertake(race, a, b)    – may car a pass car b (or the SC: b = "SC") now? With the reason. alongsideOk(…) for the
//                                2026 "no running alongside after SAFETY CAR IN THIS LAP".
//   drsAllowed / activeAeroAllowed / overtakeModeAllowed – availability flags only (the zones and the detection gap are
//                                the aero / energy models' – they read the rules data); DRS, Active Aero and Overtake are
//                                separate systems and never merged.
//   pitOpen(race, T, car, why) – may the car enter the pit lane for this purpose / leave it now.
//   neutralise(race, T, kind, {s, clearMs, cause}) – incidents (or a scenario) ask for a yellow / VSC / SC / red.
// Rules are read from race.rules (data/rules/<season>.js); the numbers the rules leave open from data/params/control.js.
//
// State (race.state.control, plain JSON – saved and restored with the race): phase, flag, the SC car, VSC / red records,
// per-car records (cars[num]: last position, delta ghost, SC-line counts, permissions), the line-crossing log (cross[k] =
// the order and times of every car completing lap k+1 – the classification reads it), messages.
import { CONTROL } from "../data/params/control.js";
import { DT } from "./clock.js";
import R2024 from "../data/rules/2024.js";
import R2025 from "../data/rules/2025.js";
import R2026 from "../data/rules/2026.js";

const G = 9.81;
const BIT = { green: 1, yellow: 2, vsc: 4, sc: 8, red: 16 };

// ---------- small helpers (exported: rules.js / incidents.js / the engine use the same definitions) ----------
export const lapPos = (car, T) => (car.where === "pit" && car.pit && T.pit ? T.pit.pitToLap(car.pit.u) : car.s);
export const lapsOf = (car, T) => (car.dist >= 0 ? Math.floor(car.dist / T.L + 1e-9) : 0);
const onTrack = (c) => c.status === "run" && c.where !== "pit";
const live = (c) => c.status === "run" || c.status === "grid";
const RULES = { 2024: R2024, 2025: R2025, 2026: R2026 };
// the season's rules data: race.rules if the engine set one (tests patch copies), else by the race's season
export function seasonRules(race) {
  if (!race.rules) { const y = race.state.season ?? race.state.rulesSeason ?? race.scenario?.meta?.season; race.rules = RULES[y] || RULES[2025]; }
  return race.rules;
}
const season = (race) => seasonRules(race).season;

// A speed profile around the lap for a point-mass car: corner limit from lateral grip (with downforce: a_lat = aLat·(1 + kDown·v²)),
// then braking (backward) and acceleration (forward, falling to 0 at vMax) passes, twice round for the wrap. Used for the
// safety car's pace and for the minimum-time reference when the engine doesn't pass its own (race.cache.refV).
export function speedProfile(T, { aLat, vMax, aBrake, aAcc, kDown = 0 }) {
  const n = T.n, ds = T.ds, v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.abs(T.kappa[i]);
    v[i] = k < 1e-6 || k <= aLat * kDown ? vMax : Math.min(vMax, Math.sqrt(aLat / (k - aLat * kDown)));
  }
  for (let pass = 0; pass < 2; pass++) for (let j = 2 * n - 1; j >= 0; j--) { const i = j % n, nx = (i + 1) % n; v[i] = Math.min(v[i], Math.sqrt(v[nx] * v[nx] + 2 * aBrake * ds)); }
  for (let pass = 0; pass < 2; pass++) for (let j = 0; j < 2 * n; j++) { const i = j % n, pv = (i - 1 + n) % n; v[i] = Math.min(v[i], Math.sqrt(v[pv] * v[pv] + 2 * aAcc * Math.max(0.05, 1 - v[pv] / vMax) * ds)); }
  return v;
}

// derived per-track tables (race.cache – rebuilt on restore, never saved)
function tables(race, T, P = CONTROL) {
  const c = race.cache || (race.cache = {});
  if (c.ctl && c.ctl.T === T) return c.ctl;
  const TK = T.kappaLine ? { ...T, kappa: T.kappaLine } : T;   // (the racing line's curvature where the track has it)
  const sc = speedProfile(TK, { aLat: P.scALat.v * G, vMax: P.scVMax.v, aBrake: P.scABrake.v * G, aAcc: P.scAAcc.v * G });
  const R = P.refCar.v, ref = c.refV && c.refV.length === T.n ? c.refV : speedProfile(TK, { aLat: R.aLat * G, kDown: R.kDown, vMax: R.vMax, aBrake: R.aBrake * G, aAcc: R.aAcc * G });
  const slow = 1 + P.minTimeSlow.v, n = T.n, PT = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) PT[i + 1] = PT[i] + (T.ds / Math.max(1, ref[i])) * slow;
  const N = Math.max(4, Math.round(T.L / P.marshalSector.v)), secLen = T.L / N;
  const grid = race.scenario?.track?.grid || {};
  const lines = race.scenario?.track?.scLines || {};
  // SC line 1 starts the pit entry road, SC line 2 ends the pit exit road (SR 34.1–34.2 / B1.6): without surveyed lines
  // the branch and the merge of the pit path stand for them (est)
  const line1 = lines.l1 ?? (T.pit ? T.pit.sIn : T.L * 0.97), line2 = lines.l2 ?? (T.pit ? T.pit.sOut : T.L * 0.03);
  // first corner after the line (Active Aero after a standing start "after Turn 1") – the first sample tighter than R 200 m
  let sT1 = 0; for (let i = 0; i < n; i++) if (Math.abs(T.kappa[i]) > 1 / 200) { sT1 = T.s ? T.s[i] : i * T.ds; break; }
  const s1end = T.zones?.sectors?.[0] ?? T.L / 3;
  const otDet = T.zones?.ot?.[0]?.detect ?? T.zones?.straight?.[0]?.start ?? T.zones?.drs?.[0]?.detect ?? 0;
  return (c.ctl = { T, sc, ref, PT, slow, N, secLen, line1, line2, sT1, s1end, otDet, pole: grid.pole ?? P.gridPole.v });
}
// reference (minimum-time) clock at s: seconds from the lap line at the minimum-time pace
function tAt(K, T, s) { const i = Math.min(T.n - 1, Math.floor(s / T.ds)); return K.PT[i] + (s - i * T.ds) / Math.max(1, K.ref[i]) * K.slow; }
function sAtTime(K, T, tau) {   // inverse of tAt (tau within [0, PT[n]])
  let lo = 0, hi = T.n; if (tau <= 0) return 0; if (tau >= K.PT[hi]) return T.L;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (K.PT[m] <= tau) lo = m; else hi = m; }
  return Math.min(T.L, lo * T.ds + (tau - K.PT[lo]) * Math.max(1, K.ref[lo]) / K.slow);
}

// ---------- state ----------
export function newControl(race, T, P = CONTROL) {
  const S = race.state, cars = {};
  for (const c of S.cars) cars[c.num] = { d0: c.dist ?? 0, p0: lapPos(c, T), w0: c.where, sec: null, l1: 0, lapped: null, ok: true, perm: null, pitL2: false, fromLap: 0, t1: false, rsc: null, inf: 0, slot: null, gridS: null, redLap: 0 };
  const ctl = { v: 1, phase: "grid", flag: "green", t0: null, timeLimitAt: null, suspMs: 0, clearAt: 0,
    start: null, pitStartOpen: false, sc: null, vsc: null, red: null, yellows: [], cars,
    drs: { on: false, from: 0 }, ot: { on: false, wait: "det" }, cross: [], stepCross: [], infr: [], msgs: [],
    fin: { target: S.totalLaps, flagT: null, reason: null }, laps: { mask: 0, flags: [] }, env: { wet: false, lowGrip: false }, redEnd: null };
  S.control = ctl;
  tables(race, T, P);
  placeGrid(race, T, P);
  scheduleStart(race, T, S.t, "race", P);
  return ctl;
}

// Grid slots (staggered 1×1, rows 16 m apart → 8 m per slot, pole P.gridPole behind the line; scenario.track.grid
// overrides) and pit-lane starters at the end of the pit lane. Sets car.s/d/dist/v/status/where.
export function gridSlot(race, T, k, P = CONTROL) {
  const K = tables(race, T, P), dist = -(K.pole + (k - 1) * P.gridRow.v / 2);
  return { dist, s: T.wrap(dist), d: (k % 2 === 1 ? 1 : -1) * P.gridSide.v };
}
function placeGrid(race, T, P) {
  const S = race.state; let np = 0;
  const onGrid = S.cars.filter((c) => !c.pitStart && c.grid != null && c.status !== "dnf").sort((a, b) => a.grid - b.grid);
  // the scenario's grid slots (measured positions before the start, data/scenario builder) when it has them, else the
  // rules' layout (16 m rows, staggered) behind the line
  const meas = new Map((race.scenario?.grid?.slots || []).map((g) => [g.num, g]));
  onGrid.forEach((c, i) => {
    const m = meas.get(c.num), g = m && Number.isFinite(m.s) ? { s: T.wrap(m.s), d: m.d ?? 0, dist: T.ahead(0, m.s) < T.L / 2 ? T.wrap(m.s) : T.wrap(m.s) - T.L } : gridSlot(race, T, i + 1, P);
    Object.assign(c, { s: g.s, d: g.d, dist: g.dist, v: 0, where: "lap", status: "grid" });
  });
  for (const c of S.cars) if (c.pitStart && c.status !== "dnf" && c.status !== "pitstart" && T.pit) {
    c.where = "pit"; c.status = "run"; c.v = 0;
    c.pit = c.pit || {}; Object.assign(c.pit, { phase: "laneOut", u: Math.max(0, T.pit.limEnd - P.redHead.v - np * P.redSlotGap.v), v: 0 });
    c.dist = T.pit.pitToLap(c.pit.u); np++;   // (a pit-lane starter's first line crossing completes its lap 1 – DESIGN note in the report)
  }
  for (const c of S.cars) { const cc = S.control.cars[c.num]; cc.d0 = c.dist ?? 0; cc.p0 = lapPos(c, T); cc.w0 = c.where; }
}

// lights: (2026: 5 s blue Pre-Start) then five red lights 1 s apart, out after the starter's hold; each driver's reaction
// (seeded per driver: "start:<num>") and launch quality; an anticipating driver moves before the lights go out.
function scheduleStart(race, T, t, why, P = CONTROL) {
  const S = race.state, ctl = S.control, R = race.rng, yr = season(race);
  const pre = yr >= 2026 ? P.preStartS.v * 1000 : 0;
  const lights = [1, 2, 3, 4, 5].map((i) => t + pre + Math.round(i * P.lightGap.v * 1000));
  const g = R.get("control:start"), [a, b] = P.lightsOut.v, out = lights[4] + Math.round((a + (b - a) * g.next()) * 1000);
  const go = {}, launch = {}, fs = [];
  const mguK = seasonRules(race).start?.value?.mguKMinKmh ?? (yr >= 2026 ? 50 : 100);
  for (const c of S.cars) {
    if (c.status !== "grid") continue;
    const r = R.get("start:" + c.num + (why === "race" ? "" : ":" + why + ":" + t)), q = P.reaction.v;
    let react = Math.min(q.max, Math.max(q.min, q.mean + q.sd * r.normal()));
    const anticip = r.chance(P.falseStartP.v), early = P.falseStartBy.v[0] + (P.falseStartBy.v[1] - P.falseStartBy.v[0]) * r.next();
    const [qa, qb] = P.launchQ.v, quality = qa + (qb - qa) * r.next();
    go[c.num] = anticip ? Math.max(lights[3] + 50, out - Math.round(early * 1000)) : out + Math.round(react * 1000);
    if (go[c.num] < out) fs.push(c.num);
    launch[c.num] = { reaction: anticip ? -early : react, quality, mguKFromKmh: mguK, standing: true };
  }
  ctl.start = { why, lights, out, go, launch, fs, done: false };
  ctl.phase = "grid";
}

// the pit-lane speed limit (m/s): the track's, else the season's default (rules pitSpeedLimit, per-event measured values)
export function pitLimit(race, T = race.cache?.ctl?.T) {
  if (T?.pit?.speedLimit) return T.pit.speedLimit;
  const v = seasonRules(race).pitSpeedLimit?.value, ev = race.scenario?.meta?.event || "";
  const k = Object.keys(v?.measuredKmh || {}).find((x) => x !== "default" && ev.includes(x));
  return ((k ? v.measuredKmh[k] : v?.defaultKmh) ?? 80) / 3.6;
}

// ---------- messages / log ----------
function msg(race, text, extra = {}) {
  const S = race.state, ctl = S.control, lap = leaderLaps(race) + 1;
  ctl.msgs.push({ t: S.t, lap, text });
  (S.log || (S.log = [])).push({ t: S.t, lap, cars: extra.cars || [], type: "rc", cause: extra.cause || null, effect: text });
}
function leaderCar(race) {
  let best = null;
  for (const c of race.state.cars) if ((c.status === "run" || c.status === "fin") && (!best || c.dist > best.dist)) best = c;
  return best;
}
function leaderLaps(race) { const T = race.cache?.ctl?.T, l = leaderCar(race); return l && T ? lapsOf(l, T) : 0; }

// ---------- neutralisations ----------
// kind: "yellow" | "double" | "vsc" | "sc" | "red". clearMs: how long race control expects the clearing to take (from the
// incident: incidents.js rcDecision). A stronger neutralisation replaces a weaker one; a weaker request during a stronger
// one only extends its clearing time.
export function neutralise(race, T, kind, { s = null, clearMs = 60e3, cause = "" } = {}, P = CONTROL) {
  const S = race.state, ctl = S.control, t = S.t;
  if (ctl.phase === "finished") return { ok: false, why: "finished" };
  if (kind === "yellow" || kind === "double") {
    if (s == null) return { ok: false, why: "a yellow needs a place" };
    ctl.yellows.push({ s0: T.wrap(s - P.yellowLen.v / 2), s1: T.wrap(s + P.yellowLen.v / 2), dbl: kind === "double", until: t + clearMs, cause });
    msg(race, `${kind === "double" ? "DOUBLE YELLOW" : "YELLOW"} AT ${Math.round(s)} M`, { cause });
    return { ok: true };
  }
  const rank = { green: 0, vsc: 1, sc: 2, red: 3 }, want = rank[kind];
  if (want == null) return { ok: false, why: `unknown ${kind}` };
  if (ctl.phase === "grid" || ctl.phase === "chequered") {
    // before the lights / after the flag: no VSC / SC – a red still stops the session (the start would be suspended)
    if (kind !== "red") return { ok: false, why: `not during ${ctl.phase}` };
  }
  ctl.clearAt = Math.max(ctl.clearAt, t + clearMs);
  const cur = rank[ctl.flag] ?? 0;
  if (ctl.flag === "sc" && kind === "sc" && ctl.sc && ctl.sc.st === "in") {   // a new incident after "SC IN THIS LAP": out again
    ctl.sc.st = "out"; ctl.sc.lights = true; ctl.sc.restart = null; msg(race, "SAFETY CAR DEPLOYED", { cause }); return { ok: true, deployed: "sc" };
  }
  if (want <= cur && !(ctl.flag === "red" && ctl.red && ctl.red.phase === "run")) return { ok: true, extended: true };
  if (kind === "vsc") deployVsc(race, T, cause);
  else if (kind === "sc") deploySc(race, T, cause, P);
  else deployRed(race, T, cause, P);
  return { ok: true, deployed: kind };
}

function anchorAll(race, T) { race.state.control.neutralT = race.state.t; for (const c of race.state.cars) { const cc = race.state.control.cars[c.num]; cc.sec = null; } }

function deployVsc(race, T, cause) {
  const ctl = race.state.control;
  ctl.flag = "vsc"; ctl.vsc = { t0: race.state.t, endAt: null, greenAt: null };
  anchorAll(race, T); ctl.drs.on = false;
  msg(race, "VSC DEPLOYED", { cause });
}

function deploySc(race, T, cause, P) {
  const S = race.state, ctl = S.control;
  ctl.flag = "sc"; ctl.vsc = null; ctl.drs.on = false; ctl.ot.on = false; ctl.ot.wait = "sc";
  for (const c of S.cars) { const cc = ctl.cars[c.num]; cc.l1 = 0; cc.lapped = null; cc.perm = null; cc.ok = false; cc.rsc = null; }
  anchorAll(race, T);
  const lastLap = leaderLaps(race) + 1 >= ctl.fin.target;
  ctl.sc = { st: "wait", joinAt: S.t + Math.round(P.scJoinS.v * 1000), s: T.pit ? T.pit.sOut : 0, v: 0, d: 0, u: null, lights: true,
    t0: S.t, line: 0, caught: false, unlap: null, restart: null, lastLap, inT: null, retT: null };
  msg(race, "SAFETY CAR DEPLOYED", { cause });
}

function deployRed(race, T, cause, P) {
  const S = race.state, ctl = S.control, t = S.t;
  const order = raceOrder(race, T).filter((c) => c.status === "run").map((c) => c.num);
  const lapsAt = leaderLaps(race);
  ctl.flag = "red"; ctl.vsc = null; ctl.sc = null; ctl.drs.on = false; ctl.ot.on = false; ctl.ot.wait = "start";
  // the fast-lane line: 2024–25 SR 57.3 – cars "arranged in the order they occupied before" the suspension (= the
  // resumption order); 2026 B5.14.2 – "in the order they entered the Pit Lane" (slots given on arrival; the resumption
  // order is re-established on the laps behind the SC, B5.15.3e). Cars already in the lane keep their place first.
  const arrive = season(race) >= 2026;
  const slots = {};
  if (!arrive) order.forEach((n, k) => (slots[n] = k));
  else S.cars.filter((c) => c.status === "run" && c.where === "pit").sort((a, b) => b.pit.u - a.pit.u).forEach((c, k) => (slots[c.num] = k));
  // lapped by the leader at the suspension: a full lap or more behind it in race distance (not merely a completed lap
  // fewer – the leader may have just crossed the line ahead of a car right behind it)
  const lead = leaderCar(race), lapped = order.filter((n) => lead && lead.dist - S.cars.find((x) => x.num === n).dist >= T.L);
  const clearAt = Math.max(ctl.clearAt, t);
  ctl.red = { t0: t, phase: "in", order, slots, arrive, nArr: Object.keys(slots).length, lapsAt, lapped, clearAt, resumeAt: Math.max(t + P.redMinMs.v, clearAt + P.redNoticeMs.v),
    proc: ctl.env.wet ? "rolling" : "standing", early: false, scOut: false, open: false, changed: {} };
  for (const c of S.cars) { const cc = ctl.cars[c.num]; cc.ok = false; cc.perm = null; cc.slot = slots[c.num] ?? null; cc.res = order.indexOf(c.num); if (cc.res < 0) cc.res = null; }
  anchorAll(race, T);
  if (ctl.phase === "grid") { ctl.start = null; ctl.phase = "racing"; }
  msg(race, "RED FLAG - RACE SUSPENDED", { cause });
  forceRedPit(race, T);
}
function forceRedPit(race, T) {
  for (const c of race.state.cars) {
    if (c.status !== "run" || c.where === "pit" || !c.pit) continue;
    if (c.pit.phase === "none" || c.pit.phase === "called") { c.pit.phase = "committed"; c.pit.call = { compound: c.pit.call?.compound ?? null, t: race.state.t, armed: true, red: true }; }
  }
}

// race order: running / finished by distance; pit cars by their pit-path equivalent (the engine's dist already is); dnf last
export function raceOrder(race, T) {
  const cs = race.state.cars.slice();
  const key = (c) => (c.status === "dnf" ? 0 : 1);
  return cs.sort((a, b) => key(b) - key(a) || (b.dist - a.dist) || String(a.num).localeCompare(String(b.num)));
}

// ---------- the step ----------
export function controlStep(race, T, env = {}, P = CONTROL) {
  const S = race.state, ctl = S.control, t = S.t, K = tables(race, T, P);
  ctl.env = { wet: !!env.wet, lowGrip: !!env.lowGrip };
  ctl.stepCross = [];
  // 1. crossings since the last step (lines, sectors, SC lines, pit exit)
  for (const c of S.cars) crossings(race, T, K, c, P);
  // 2. phase: grid / lights
  if (ctl.start && !ctl.start.released) startStep(race, T, P);
  // pit-lane starters: released when every car that started on the grid has passed the pit exit
  if (!ctl.pitStartOpen && ctl.phase !== "grid" && T.pit) {
    const gridCars = S.cars.filter((c) => !c.pitStart && (c.status === "run" || c.status === "grid"));   // (still on its slot – reaction time – counts: not yet passed)
    if (gridCars.every((c) => c.dist > T.pit.sOut + P.carLen.v || c.where === "pit")) { ctl.pitStartOpen = true; if (S.cars.some((c) => c.pitStart)) msg(race, "PIT EXIT OPEN – PIT LANE STARTERS MAY JOIN"); }
  }
  // standing restart: every car on its grid slot (or 90 s waited) → the start procedure again
  if (ctl.phase === "racing" && S.cars.some((c) => ctl.cars[c.num].gridS != null) && (!ctl.sc || ctl.sc.st === "pit" || ctl.sc.st === "gone")) {
    const want = S.cars.filter((c) => c.status === "run" && ctl.cars[c.num].gridS != null);
    const parked = (c) => c.where !== "pit" && c.v < 0.1 && T.ahead(lapPos(c, T), ctl.cars[c.num].gridS) < 3;
    ctl.gridWait = ctl.gridWait ?? S.t;
    if (want.every(parked) || S.t - ctl.gridWait > 90e3) {
      for (const c of want) if (parked(c)) { c.status = "grid"; c.v = 0; }
      for (const c of S.cars) ctl.cars[c.num].gridS = null;
      ctl.gridWait = null; scheduleStart(race, T, S.t, "restart", P);
    }
  }
  // 3. the flags
  if (ctl.flag === "vsc") vscStep(race, T, P);
  if (ctl.sc) scStep(race, T, K, P);
  if (ctl.flag === "red" && ctl.red) redStep(race, T, K, P);
  ctl.yellows = ctl.yellows.filter((y) => y.until > t);
  // 4. time limit (2 h + suspensions, at most 3 h – SR 5.4c–d / B2.5.3) → the flag at the end of the lap after the one in which it expired
  const TL = seasonRules(race).timeLimit?.value;
  if (TL && ctl.t0 != null && ctl.flag !== "red" && !ctl.fin.flagT) {
    const lim = ctl.t0 + Math.min(TL.raceMs + ctl.suspMs, TL.raceMaxWithSuspensionMs);
    ctl.timeLimitAt = lim;
    if (t >= lim && ctl.fin.reason !== "time") {
      const target = Math.min(ctl.fin.target, leaderLaps(race) + 2);
      if (target < ctl.fin.target) { ctl.fin.target = target; ctl.fin.reason = "time"; msg(race, `TIME LIMIT – CHEQUERED FLAG AT THE END OF LAP ${target}`); }
      else ctl.fin.reason = "time";
    }
  }
  if (ctl.flag === "red" && ctl.red && TL && ctl.t0 != null && t >= ctl.t0 + TL.raceMaxWithSuspensionMs) endUnderRed(race, T, "time limit (3 h) reached during the suspension");
  // 5. DRS (2011–2025) and the 2026 Overtake system: global availability
  availability(race, T, K, P);
  // leader-lap flag mask (points for shortened races need laps without SC/VSC)
  ctl.laps.mask |= BIT[ctl.flag] | (ctl.yellows.length ? BIT.yellow : 0);
  // 6. finished?
  if (ctl.phase === "chequered") {
    const left = S.cars.filter((c) => c.status === "run");
    if (!left.length || t - ctl.fin.flagT > 15 * 60e3) { ctl.phase = "finished"; S.finished = true; msg(race, "SESSION FINISHED"); }
  }
  stepCache(race, T, K);
}

function crossings(race, T, K, c, P) {
  const S = race.state, ctl = S.control, cc = ctl.cars[c.num], t = S.t;
  if (!cc) return;
  const pos = lapPos(c, T);
  if (c.status !== "run" && c.status !== "fin") { cc.d0 = c.dist ?? cc.d0; cc.p0 = pos; cc.w0 = c.where; return; }
  const moved = T.ahead(cc.p0, pos), mv = moved < T.L / 2 ? moved : 0;
  const crossed = (x) => mv > 0 && T.ahead(cc.p0, x) > 0 && T.ahead(cc.p0, x) <= mv;
  // pit exit → may overtake / be overtaken until SC line 2 (SR 55.8d / B5.13)
  // (rejoining at the merge: the exception lasts only while SC line 2 is still ahead – with line 2 at the merge, not at all)
  if (cc.w0 === "pit" && c.where !== "pit") { const d2 = T.ahead(pos, K.line2); cc.pitL2 = d2 > 0 && d2 < T.L / 4; cc.sec = null; }
  if (crossed(K.line2)) cc.pitL2 = false;
  if (ctl.flag === "sc" && crossed(K.line1)) cc.l1++;
  if (!cc.t1 && c.dist >= K.sT1) cc.t1 = true;
  // marshalling sectors: the minimum time is checked when a car leaves a sector (not in its first, graced, one)
  if ((ctl.flag === "vsc" || ctl.flag === "sc" || ctl.flag === "red") && c.where !== "pit") {
    const e = (Math.floor(cc.p0 / K.secLen) + 1) * K.secLen, edge = e >= T.L - 1e-6 ? 0 : e;
    if (crossed(edge)) {
      const tc = t - Math.round(T.ahead(edge, pos) / Math.max(0.5, c.v) * 1000);
      if (cc.sec && !cc.sec.grace && minTimeApplies(race, c, cc)) {
        const need = (tAt(K, T, cc.sec.sEnd) - cc.sec.tb) * 1000, took = tc - cc.sec.t0;
        if (took < need - (race.stewardsTol ?? 100)) { ctl.infr.push({ num: c.num, kind: ctl.flag === "vsc" ? "vsc" : "sc", t, short: (need - took) / 1000 }); cc.inf++; }
      }
      const j = Math.round(edge / K.secLen) % K.N;
      cc.sec = { j, t0: tc, tb: tAt(K, T, j * K.secLen), sEnd: Math.min(T.L, (j + 1) * K.secLen), grace: t - (ctl.neutralT ?? -1e9) < 3000 };
    }
  }
  // the line
  const l0 = cc.d0 >= 0 ? Math.floor(cc.d0 / T.L + 1e-9) : 0, l1 = lapsOf(c, T);
  if (l1 > l0 && c.dist > cc.d0) {
    const over = c.dist - l1 * T.L, tc = t - Math.round(over / Math.max(0.5, c.v) * 1000);
    for (let k = l0 + 1; k <= l1; k++) {
      (ctl.cross[k - 1] || (ctl.cross[k - 1] = [])).push([c.num, tc, c.where === "pit" ? 1 : 0]);
      ctl.stepCross.push({ num: c.num, lap: k, t: tc, pit: c.where === "pit" });
      onLine(race, T, K, c, cc, k, tc, P);
    }
  }
  cc.d0 = c.dist; cc.p0 = pos; cc.w0 = c.where;
}

function minTimeApplies(race, c, cc) {
  const ctl = race.state.control;
  if (ctl.flag === "vsc" || ctl.flag === "red") return true;
  // SC: until the car crosses SC line 1 the second time (SR 55.7 / B5.13). A car waved past the SC drives at the passing
  // pace instead (caps: passPace × the SC's) – v0.50: held to the minimum time it never caught a SC lapping faster than
  // that, stayed "waved" for 30 laps and kept the SC out (Monaco 2025 seed 1)
  if (ctl.flag === "sc") return cc.l1 < 2 && cc.perm !== "wave";
  return false;
}

function onLine(race, T, K, c, cc, k, tc, P) {
  const S = race.state, ctl = S.control, lead = leaderCar(race), isLead = lead && lead.num === c.num;
  if (isLead) { ctl.laps.flags[k - 1] = ctl.laps.mask; ctl.laps.mask = BIT[ctl.flag]; }
  // lapped cars (SR 55.14 / B5.13): lapped at the Line at the end of the lap in which it crossed SC line 1 the 2nd time
  if (ctl.flag === "sc" && cc.l1 >= 2 && cc.lapped === null) cc.lapped = lead ? lapsOf(lead, T) > k : false;
  // after the SC: overtaking from the Line (SR 55.8 – after the SC returned to the pits; B5.13 – after it entered the pit entry road)
  if (!cc.ok && ctl.sc && (ctl.sc.st === "pit" || ctl.sc.st === "gone") && scReturned(race)) {
    cc.ok = true; cc.fromLap = k;
    if (isLead && !ctl.sc.lastLap && !ctl.sc.standing) {
      ctl.flag = "green"; ctl.drs.from = k; ctl.red = null; ctl.ot.detFrom = c.dist; msg(race, "TRACK CLEAR – GREEN FLAG");
      for (const x of S.cars) if (ctl.cars[x.num].perm) ctl.cars[x.num].perm = null;
    }
  }
  // the finish: the leader at the target lap takes the chequered flag; everyone else at their next crossing on the track
  if (!ctl.fin.flagT && isLead && k >= ctl.fin.target && ctl.phase === "racing" && ctl.flag !== "red") {
    ctl.fin.flagT = tc; ctl.phase = "chequered"; ctl.fin.reason = ctl.fin.reason || "distance"; msg(race, "CHEQUERED FLAG");
  }
  if (ctl.fin.flagT != null && tc >= ctl.fin.flagT && c.status === "run" && c.where !== "pit") { c.status = "fin"; c.fin = { t: tc, laps: k }; }
}
// B5.13 (2026): from the Control Line after the SC entered the pit entry road (= passed SC line 1). SR 55.8 (2024–25):
// "after the safety car has returned to the pits" – read the same way (SC line 1 starts the pit entry road; the pit
// lane's limiter line can lie after the Control Line on some layouts, which would make the leader's crossing ambiguous)
function scReturned(race) {
  const sc = race.state.control.sc; if (!sc) return true;
  return sc.inT != null;
}

// ---------- start ----------
function startStep(race, T, P) {
  const S = race.state, ctl = S.control, st = ctl.start, t = S.t;
  if (!st.lit && t >= st.lights[0]) { st.lit = true; msg(race, st.why === "race" ? "RED LIGHTS – START PROCEDURE" : "RED LIGHTS – STANDING RESTART"); }
  let wait = 0;
  for (const c of S.cars) if (c.status === "grid" && st.go[c.num] != null) { if (t >= st.go[c.num]) c.status = "run"; else wait++; }
  if (st.done && !wait) st.released = true;
  if (t >= st.out && !st.done) {
    st.done = true; ctl.phase = "racing"; ctl.flag = "green";
    if (st.why === "race") { ctl.t0 = st.out; ctl.drs.from = 0; ctl.ot.on = false; ctl.ot.wait = "det"; }
    else { ctl.drs.from = leaderLaps(race); ctl.ot.wait = "det"; ctl.red = null; ctl.sc = null; for (const c of S.cars) { const cc = ctl.cars[c.num]; cc.ok = true; cc.fromLap = lapsOf(c, T); cc.t1 = false; } }
    ctl.ot.detFrom = leaderCar(race)?.dist ?? 0;
    msg(race, st.why === "race" ? "LIGHTS OUT – RACE START" : "LIGHTS OUT – RACE RESUMED");
    // moved before the signal (2024–25: after the 4th light; 2026: stationary from the 3rd light) → stewards
    for (const n of st.fs) ctl.infr.push({ num: n, kind: "falseStart", t, early: (st.out - st.go[n]) / 1000 });
  }
}

// ---------- VSC ----------
function vscStep(race, T, P) {
  const S = race.state, ctl = S.control, v = ctl.vsc, t = S.t;
  if (!v.endAt && t >= ctl.clearAt) {
    const g = race.rng.get("control:vsc"), [a, b] = P.vscEndDelay.v;
    v.endAt = t; v.greenAt = t + Math.round((a + (b - a) * g.next()) * 1000);
    msg(race, "VSC ENDING");
  }
  if (v.greenAt != null && t >= v.greenAt) {
    ctl.flag = "green"; ctl.vsc = null; ctl.drs.from = leaderLaps(race) + P.drsAfterVscLaps.v - 1;
    for (const c of S.cars) { const cc = ctl.cars[c.num]; cc.sec = null; cc.fromLap = lapsOf(c, T) + P.drsAfterVscLaps.v - 1; }
    msg(race, "GREEN – VSC ENDED");
  }
}

// ---------- the safety car ----------
function scStep(race, T, K, P) {
  const S = race.state, ctl = S.control, sc = ctl.sc, t = S.t, dt = DT;
  const lead = leaderCar(race), L = T.L;
  if (sc.st === "wait") { if (t >= sc.joinAt) { sc.st = "out"; sc.s = T.pit ? T.pit.sOut : 0; sc.v = 15; } else return; }
  if (sc.st === "gone") return;
  if (sc.st === "pit") {   // down the pit lane at the limiter, then parked (out of the race)
    const lim = T.pit.speedLimit ?? pitLimit(race); sc.v = Math.min(lim, sc.v + 3 * dt); sc.u += sc.v * dt;
    if (sc.retT == null && sc.u >= T.pit.limStart) sc.retT = t;
    if (sc.u >= T.pit.limStart + 30) sc.st = "gone";
    return;
  }
  // caught: the leader within ten car lengths behind
  const lp = lead && lead.where !== "pit" ? lapPos(lead, T) : null;
  const gapLead = lp == null ? Infinity : T.ahead(lp, sc.s);
  if (!sc.caught && gapLead <= P.queueMax.v * P.carLen.v) { sc.caught = true; }
  // the SC's own speed: its pace profile (slower until it has collected the leader); a red-flag resumption SC holds still
  let target = K.sc[T.idx(sc.s)] * (sc.caught || sc.st === "in" || sc.st === "hold" ? 1 : P.scCollect.v);
  if (sc.st === "hold") {
    // 2026 resumption: drive to the resumption position and wait there until the field has formed up behind
    const toPos = T.ahead(sc.s, K.s1end); target = toPos < L / 2 ? Math.min(target, Math.sqrt(2 * P.scABrake.v * G * Math.max(0, toPos - 0.5))) : target;
    if (sc.caught && queueFormed(race, T, P)) sc.st = "out";
  }
  const aUp = P.scAAcc.v * G * Math.max(0.05, 1 - sc.v / P.scVMax.v), aDn = P.scABrake.v * G;
  sc.v = sc.v < target ? Math.min(target, sc.v + aUp * dt) : Math.max(target, sc.v - aDn * dt);
  let step = sc.v * dt;
  if (sc.st === "hold") { const toPos = T.ahead(sc.s, K.s1end); if (toPos < L / 2 && step >= toPos) { step = toPos; sc.v = 0; } }
  const s0 = sc.s; sc.s = T.wrap(sc.s + step);
  const moved = T.ahead(s0, sc.s), crossed = (x) => moved > 0 && T.ahead(s0, x) > 0 && T.ahead(s0, x) <= moved;
  // wave-by: cars between the SC and the leader pass it and drive round to the back (SR 55.9 / B5.13)
  if (sc.st === "out" && lp != null) for (const c of S.cars) {
    if (!onTrack(c) || c.num === lead.num) continue;
    const cc = ctl.cars[c.num], rel = T.ahead(lapPos(c, T), sc.s);
    if (cc.rsc != null && cc.rsc < 30 && rel > L - 30 && (cc.perm === "wave" || cc.perm === "unlap")) { cc.perm = "toQueue"; msg(race, `CAR ${c.num} PASSED THE SAFETY CAR`, { cars: [c.num] }); }
    else if (cc.perm == null && rel < gapLead && !sc.caught) cc.perm = "wave";
    cc.rsc = rel;
  }
  // a car that passed the SC rejoins the queue's tail: no longer "toQueue" once it is within ten lengths of a queued car
  for (const c of S.cars) { const cc = ctl.cars[c.num]; if (cc.perm === "toQueue" && onTrack(c)) { const p = pred(race, T, c); if (p && p.gap <= P.queueMax.v * P.carLen.v && !p.isSC) cc.perm = null; } }
  // a waved car that has ended up in the queue anyway (a stop under the SC put it behind queued cars): it is a queued car
  // now – it can't pass them, so its wave-by is over (v0.50: one such car kept "waved" for 30 laps held the SC out)
  for (const c of S.cars) { const cc = ctl.cars[c.num]; if (cc.perm === "wave" && onTrack(c)) { const p = pred(race, T, c); if (p && !p.isSC && p.gap <= P.queueMax.v * P.carLen.v && p.obj && ctl.cars[p.obj.num]?.perm == null && sc.caught) cc.perm = null; } }
  // last lap: the SC comes in at the end of it, cars take the flag without overtaking (SR 55.17 / B5.13)
  if (!sc.lastLap && lead && lapsOf(lead, T) + 1 >= ctl.fin.target) sc.lastLap = true;
  if (crossed(0)) scLine(race, T, K, P);
  if ((sc.st === "in" || sc.lastLap) && T.pit && crossed(K.line1)) {
    // into the pit entry road (2026: from here cars may pass the line; 2024–25: once it is in the pit lane)
    sc.inT = t; sc.st = "pit"; sc.u = T.pit.lapToPit(sc.s) ?? 0;
    if (!sc.lastLap && season(race) >= 2026) ctl.ot.wait = "allLine";
  }
  // lapped cars may unlap (SR 55.14 / B5.13): once every car's status is known and the track is clear
  if (sc.st === "out" && !sc.unlap && seasonRules(race).safetyCar?.value?.lappedCars && !sc.noUnlap && t >= ctl.clearAt && sc.caught) {
    const cs = S.cars.filter(onTrack), known = cs.every((c) => ctl.cars[c.num].lapped !== null), lapped = cs.filter((c) => ctl.cars[c.num].lapped);
    const left = ctl.fin.target - (lead ? lapsOf(lead, T) : 0);
    if (known && lapped.length && left >= P.unlapMinLapsLeft.v) {
      sc.unlap = { t, line: sc.line, cars: lapped.map((c) => c.num) };
      for (const c of lapped) ctl.cars[c.num].perm = "unlap";
      msg(race, `LAPPED CARS MAY NOW OVERTAKE THE SAFETY CAR: ${sc.unlap.cars.join(", ")}`, { cars: sc.unlap.cars });
    } else if (known && (!lapped.length || left < P.unlapMinLapsLeft.v)) sc.noUnlap = true;
  }
}
// every running car on the lap and lined up behind the SC within ten car lengths each (by track position)
function queueFormed(race, T, P) {
  const sc = race.state.control.sc, cs = race.state.cars.filter((c) => c.status === "run");
  if (!sc || cs.some((c) => c.where === "pit")) return false;
  const rel = cs.map((c) => T.ahead(lapPos(c, T), sc.s));
  return Math.max(...rel) <= cs.length * P.queueMax.v * P.carLen.v;
}
function allQueued(race, T, K) { return race.state.cars.every((c) => !onTrack(c) || !["wave", "unlap", "toQueue"].includes(race.state.control.cars[c.num].perm)); }

// the SC crossing the line: "SAFETY CAR IN THIS LAP" when the track is clear, the leader is behind it, nobody is still
// passing it, and the lapped cars (if allowed) have had their lap (in at the end of the lap after the message)
function scLine(race, T, K, P) {
  const S = race.state, ctl = S.control, sc = ctl.sc;
  sc.line++;
  if (sc.st !== "out" || sc.lastLap) return;
  const lead = leaderCar(race);
  // (after "LAPPED CARS MAY NOW OVERTAKE" the SC comes in at the end of the FOLLOWING lap – SR 55.14 / B5.13, the rules
  // files' lappedCars – whether or not every lapped car has got round yet; v0.50: waiting for them let a lapped car that
  // kept stopping hold the SC out for 30 laps – Monaco 2025 seed 1)
  const passed = S.cars.every((c) => !onTrack(c) || !(ctl.cars[c.num].perm === "wave" || (ctl.cars[c.num].perm === "unlap" && !(sc.unlap && sc.line > sc.unlap.line))));
  const ready = S.t >= ctl.clearAt && sc.caught && passed && (sc.noUnlap || (sc.unlap && sc.line > sc.unlap.line)) && (sc.unlap || allQueued(race, T, K));
  const unlapPending = !sc.noUnlap && !sc.unlap && seasonRules(race).safetyCar?.value?.lappedCars;
  if (!ready || unlapPending) return;
  sc.st = "in"; sc.lights = false;
  const g = race.rng.get("control:restart"), [a, b] = P.restartGo.v;
  sc.restart = { leader: lead?.num ?? null, goS: T.wrap(T.L - (a + (b - a) * g.next())), go: false };
  if (ctl.red && ctl.red.phase === "run" && ctl.red.proc === "standing") {
    sc.standing = true; msg(race, "STANDING START – SAFETY CAR IN THIS LAP");
    // grid slots for the restart, in the queue order (= the resumption order, kept by the no-overtaking rule)
    const R = ctl.red, run = S.cars.filter((c) => c.status === "run");
    const rk = (c) => { const cc = ctl.cars[c.num]; return cc.redLap ? 1000 + cc.slot : cc.res ?? 500 + cc.slot; };   // (the cars that did the extra lap at the back, in the order they came back)
    run.sort((a, b) => rk(a) - rk(b)).forEach((c, i) => { ctl.cars[c.num].gridS = gridSlot(race, T, i + 1, P).s; });
  } else msg(race, "SAFETY CAR IN THIS LAP");
}

// ---------- red flag ----------
function redStep(race, T, K, P) {
  const S = race.state, ctl = S.control, R = ctl.red, t = S.t;
  if (R.phase === "run") return;
  forceRedPit(race, T);
  if (R.arrive) for (const c of S.cars) { const cc = ctl.cars[c.num]; if (c.status === "run" && c.where === "pit" && cc.slot == null && !cc.redLap) cc.slot = R.nArr++; }
  R.clearAt = Math.max(R.clearAt, ctl.clearAt); R.resumeAt = Math.max(R.resumeAt, R.clearAt + P.redNoticeMs.v);
  if (R.phase === "in" && S.cars.every((c) => c.status !== "run" || (c.where === "pit" && (c.pit.v ?? 0) < 0.2 && (c.pit.phase === "lane" || c.pit.phase === "laneOut")))) {
    R.phase = "stopped"; msg(race, `ALL CARS IN THE PIT LANE – RACE WILL RESUME AT +${Math.round((R.resumeAt - R.t0) / 60000)} MIN`);
  }
  // lapped cars leave 2 min early for a lap and rejoin the back of the line in the fast lane (B5.15.2c; est for 2024–25 timing)
  if (!R.early && t >= R.resumeAt - P.redLappedEarlyMs.v) {
    R.early = true;
    R.lapped.forEach((n) => { ctl.cars[n].redLap = 1; });
    R.back = 0;
    if (R.lapped.length) msg(race, `LAPPED CARS MAY LEAVE THE PIT LANE: ${R.lapped.join(", ")}`, { cars: R.lapped });
  }
  for (const n of R.lapped) {   // back on the lap after their exit: into the pit lane again at the next entry
    const c = S.cars.find((x) => x.num === n), cc = ctl.cars[n];
    if (cc.redLap === 1 && c.where !== "pit") cc.redLap = 2;
    // back in the lane: the next free place at the end of the line, in the order they come back
    if (cc.redLap === 2 && c.where === "pit") { cc.redLap = 3; cc.slot = R.order.length + R.back++; }   // (beyond every first-arrival slot)
  }
  // the SC: 2026 – out before the 1-min signal to the resumption position (end of sector 1) and waits; 2024–25 – leads out of the pit exit
  if (!R.scOut && ((season(race) >= 2026 && t >= R.resumeAt - P.redScOutMs.v) || t >= R.resumeAt)) {
    R.scOut = true;
    ctl.sc = { st: season(race) >= 2026 ? "hold" : "wait", joinAt: t, s: T.pit ? T.pit.sOut : 0, v: 15, d: 0, u: null, lights: true, t0: t, line: 0,
      caught: false, unlap: null, noUnlap: true, restart: null, lastLap: false, inT: null, retT: null };
    if (season(race) >= 2026) { ctl.sc.st = "hold"; ctl.sc.s = T.pit ? T.pit.sOut : 0; }
  }
  if (t >= R.resumeAt && !R.open) {
    // the pit exit opens: the race resumes (the suspension ends here – B5.15.2g; same moment used for 2024–25)
    R.open = true; R.phase = "run"; ctl.suspMs += t - R.t0; ctl.flag = "sc"; ctl.clearAt = t;
    for (const c of S.cars) { const cc = ctl.cars[c.num]; cc.l1 = 2; cc.lapped = false; cc.perm = null; cc.ok = false; cc.sec = null; }
    msg(race, "PIT EXIT OPEN – RACE RESUMES BEHIND THE SAFETY CAR");
  }
}

// Not resumed (rain, time): the result is taken at the end of the penultimate lap before the lap in which the race was
// suspended (SR 58.14 / B5.14.2). rules.classify reads ctl.redEnd.
export function endUnderRed(race, T, why = "race not resumed") {
  const S = race.state, ctl = S.control;
  if (!ctl.red) return { ok: false, why: "no suspension" };
  const lap = Math.max(0, ctl.red.lapsAt - 1);
  ctl.redEnd = { lap, why }; ctl.phase = "finished"; ctl.fin.reason = "red"; S.finished = true;
  msg(race, `RACE WILL NOT RESUME – RESULT TAKEN AT THE END OF LAP ${lap}`);
  return { ok: true, lap };
}

// Free tyre change while suspended (SR 57.4b / B5.14.4a), until the 5-min signal. apply(car, compound) is the tyre
// model's (new set fitted now). Returns { ok, why }.
export function redTyreChange(race, T, car, compound, apply, P = CONTROL) {
  const ctl = race.state.control, R = ctl.red;
  if (ctl.flag !== "red" || !R || R.phase === "run") return { ok: false, why: "not suspended" };
  if (car.where !== "pit" || (car.pit?.v ?? 1) > 0.2) return { ok: false, why: "not stopped in the pit lane" };
  if (race.state.t > R.resumeAt - P.redWheelsMs.v) return { ok: false, why: "after the 5-minute signal (wheels must be fitted)" };
  // (the change is recorded only once it is made – apply returns false when the set can't be fitted: nothing changes)
  if (apply && apply(car, compound) === false) return { ok: false, why: "tyre set not fitted" };
  R.changed[car.num] = compound;
  return { ok: true };
}

// ---------- availability: DRS (≤ 2025), Overtake (2026) ----------
function availability(race, T, K, P) {
  const S = race.state, ctl = S.control, R = seasonRules(race);
  if (R?.drs) {
    const n = R.drs.value.enabledAfterLaps ?? 1;
    const on = ctl.phase === "racing" && ctl.flag === "green" && !ctl.env.wet && leaderLaps(race) - ctl.drs.from >= n;
    if (on !== ctl.drs.on) { ctl.drs.on = on; msg(race, on ? "DRS ENABLED" : "DRS DISABLED"); }
  }
  if (R?.overtakeMode) {
    // B7.2.2: off before the start/resumption until the leader first crosses the Detection Line; off from SC deployment
    // until all cars have crossed the Control Line after the SC entered the pit entry road; off in Low Grip Conditions
    const lead = leaderCar(race);
    if (ctl.ot.wait === "det" && ctl.phase === "racing" && lead && lead.dist >= (ctl.ot.detFrom ?? 0) + K.otDet && lead.dist > 0) { ctl.ot.wait = null; }
    if (ctl.ot.wait === "allLine" && S.cars.every((c) => c.status !== "run" || ctl.cars[c.num].ok)) ctl.ot.wait = null;
    const on = ctl.ot.wait == null && ctl.phase === "racing" && (ctl.flag === "green") && !ctl.env.lowGrip;
    if (on !== ctl.ot.on) { ctl.ot.on = on; msg(race, on ? "OVERTAKE ENABLED" : "OVERTAKE DISABLED"); }
  }
}

export function drsAllowed(race, T, car) {
  const R = seasonRules(race), ctl = race.state.control;
  if (!R?.drs) return { ok: false, why: "no DRS this season" };
  if (!ctl.drs.on) return { ok: false, why: ctl.env.wet ? "disabled (wet)" : ctl.flag !== "green" ? `disabled (${ctl.flag})` : "not yet enabled" };
  const cc = ctl.cars[car.num], n = R.drs.value.enabledAfterLaps ?? 1;
  if (lapsOf(car, T) - Math.max(cc.fromLap, ctl.drs.from) < n) return { ok: false, why: `after ${n} lap(s) from the start / restart` };
  // a yellow in the activation zone the car is in or approaching
  const z = T.zones?.drs?.find((q) => inSpan(lapPos(car, T), q.detect ?? q.start, q.end, T));
  if (z && ctl.yellows.some((y) => spansOverlap(y.s0, y.s1, z.start, z.end, T))) return { ok: false, why: "yellow in the zone" };
  return { ok: true };
}
export function overtakeModeAllowed(race, T, car) {
  const R = seasonRules(race), ctl = race.state.control;
  if (!R?.overtakeMode) return { ok: false, why: "no Overtake system this season" };
  if (!ctl.ot.on) return { ok: false, why: ctl.env.lowGrip ? "low grip conditions" : ctl.flag !== "green" ? `disabled (${ctl.flag})` : "not yet enabled" };
  return { ok: true, detectionGapS: R.overtakeMode.value.detectionGapS };
}
// Active Aero (2026 wings): any driver, any lap, only in an activation zone (the aero model checks the zone);
// after a standing start only past Turn 1; in Low Grip Conditions only the partial mode (front wing).
export function activeAeroAllowed(race, T, car) {
  const R = seasonRules(race), ctl = race.state.control;
  if (!R?.activeAero) return { ok: false, mode: "none", why: "no Active Aero this season" };
  if (ctl.phase === "grid") return { ok: false, mode: "none", why: "before the start" };
  if (!ctl.cars[car.num].t1) return { ok: false, mode: "none", why: "after Turn 1 at a standing start" };
  return ctl.env.lowGrip ? { ok: true, mode: "partial", why: "low grip conditions" } : { ok: true, mode: "full" };
}

const inSpan = (s, a, b, T) => T.ahead(a, s) <= T.ahead(a, b);
const spansOverlap = (a0, a1, b0, b1, T) => inSpan(b0, a0, a1, T) || inSpan(a0, b0, b1, T);
const inYellow = (race, T, s) => race.state.control.yellows.find((y) => inSpan(s, y.s0, y.s1, T));

// ---------- overtaking permission ----------
// a may pass b now? b: a car, or "SC". The exceptions are those of SR 55.8 / 56 / 57, B5.12–B5.15.
export function mayOvertake(race, T, a, b) {
  const S = race.state, ctl = S.control, K = tables(race, T);
  const isSC = b === "SC" || b?.isSC;
  const ca = ctl.cars[a.num];
  if (a.where === "pit" && (isSC || b.where === "pit")) return { ok: true, why: "in the pit lane" };
  if (!isSC && (b.status === "dnf" || b.inc?.problem)) return { ok: true, why: "car with an obvious problem" };
  if (!isSC && b.status === "fin") return { ok: true, why: "finished" };
  if (ctl.phase === "grid") return { ok: false, why: "before the start" };
  if (ctl.phase === "finished") return { ok: false, why: "finished" };
  if (ctl.flag === "red") return { ok: false, why: "red flag" };
  // laps behind the SC at a resumption: only to re-establish the resumption order (B5.15.3e; 2024–25 lines are already in it)
  if (ctl.flag === "sc" && ctl.red && ctl.red.phase === "run" && !isSC) {
    const cb = ctl.cars[b.num];
    if (ca.res != null && cb.res != null && ca.res < cb.res && !ca.redLap && !cb.redLap) return { ok: true, why: "re-establishing the resumption order" };
  }
  // pit entry after SC line 1 / pit exit before SC line 2 (SR 55.8c–d / 56)
  if ((ctl.flag === "sc" || ctl.flag === "vsc") && a.pit && (a.pit.phase === "committed" || a.pit.phase === "entry") && T.ahead(K.line1, lapPos(a, T)) < T.L / 4) return { ok: true, why: "entering the pits after SC line 1" };
  if ((ctl.flag === "sc" || ctl.flag === "vsc") && (ca.pitL2 || (!isSC && ctl.cars[b.num]?.pitL2))) return { ok: true, why: "leaving the pits before SC line 2" };
  if (ctl.flag === "vsc") return { ok: false, why: "VSC" };
  if (ctl.flag === "sc") {
    const sc = ctl.sc;
    if (isSC) {
      if (ca.perm === "wave" || ca.perm === "unlap") return { ok: true, why: ca.perm === "wave" ? "waved past by the SC (green light)" : "lapped car unlapping" };
      // (SR 55.8e: the returning SC may be passed once it reached SC line 1 – here it leaves the track at SC line 1)
      return { ok: false, why: "safety car" };
    }
    if (ca.perm === "unlap" && lapsOf(b, T) > lapsOf(a, T) - 0 && ctl.cars[b.num].perm !== "unlap") return { ok: true, why: "lapped car unlapping" };
    if (ca.ok) return { ok: true, why: "past the Line after the SC" };
    return { ok: false, why: sc && sc.st === "in" ? "not before the Line (SC in this lap)" : "safety car" };
  }
  // green: no overtaking inside a local yellow; under green after the SC each car only once it passed the Line
  if (!ca.ok && ctl.sc) return { ok: false, why: "not before the Line after the SC" };
  if (inYellow(race, T, lapPos(a, T)) || (!isSC && inYellow(race, T, lapPos(b, T)))) return { ok: false, why: "yellow flag" };
  return { ok: true };
}
// 2026 B5.13 / B5.15: from "SAFETY CAR IN THIS LAP" until the SC enters the pit entry road no part of a car alongside
// the car ahead. Otherwise running alongside is allowed where overtaking is.
export function alongsideOk(race, T, a, b) {
  const ctl = race.state.control;
  if (season(race) >= 2026 && ctl.flag === "sc" && ctl.sc && ctl.sc.st === "in") return { ok: false, why: "no running alongside after SAFETY CAR IN THIS LAP (2026)" };
  return mayOvertake(race, T, a, b);
}

// What traffic needs to know about a car under race control, beyond mayOvertake: its SC permission ("wave": waved past
// the SC; "unlap": a lapped car passing the queue and the SC; "toQueue": driving round to the back, no overtaking), and
// whether it must hold the racing line because lapped cars are passing (SR 55.14 / B5.13: "the cars on the lead lap must
// always stay on the racing line unless deviating from it is unavoidable").
export function scRole(race, car) {
  const ctl = race.state.control, cc = ctl.cars[car.num], sc = ctl.sc;
  const unlapping = ctl.flag === "sc" && race.state.cars.some((c) => ctl.cars[c.num]?.perm === "unlap");
  return { perm: cc?.perm ?? null, holdLine: unlapping && cc?.perm !== "unlap", behindSc: ctl.flag === "sc" && !!sc && !cc?.ok, noAlongside: season(race) >= 2026 && ctl.flag === "sc" && sc?.st === "in" };
}

// ---------- per-step cache: track order of the cars on the lap and the SC ----------
// (the engine calls refreshControlCache after a restore: pred() reads this cache before the first controlStep)
export const refreshControlCache = (race, T) => stepCache(race, T, tables(race, T));
function stepCache(race, T, K) {
  const S = race.state, ctl = S.control, objs = [];
  for (const c of S.cars) if (onTrack(c) || (c.status === "fin" && c.where !== "pit")) objs.push({ car: c, pos: lapPos(c, T), v: c.v });
  if (ctl.sc && (ctl.sc.st === "out" || ctl.sc.st === "in" || ctl.sc.st === "hold")) objs.push({ isSC: true, pos: ctl.sc.s, v: ctl.sc.v });
  objs.sort((x, y) => x.pos - y.pos);
  race.cache.ctlStep = { t: S.t, objs };
}
// the nearest car / SC ahead of c on the lap that c may not pass (its predecessor in a queue); { obj, gap (m, nose to tail), v, isSC }
export function pred(race, T, c, P = CONTROL) {
  const sc = race.cache?.ctlStep; if (!sc) return null;
  const objs = sc.objs, n = objs.length, pos = lapPos(c, T);
  const i0 = objs.findIndex((o) => o.car === c);
  if (i0 < 0) return null;
  for (let k = 1; k < n; k++) {
    const o = objs[(i0 + k) % n];
    if (o.car && o.car.status === "fin") continue;
    const ok = mayOvertake(race, T, c, o.isSC ? "SC" : o.car).ok;
    if (!ok) return { obj: o.isSC ? "SC" : o.car, isSC: !!o.isSC, gap: T.ahead(pos, o.pos) - P.carLen.v, v: o.v };
  }
  return null;
}

// ---------- caps ----------
// The speed cap at the car's place now (m/s), with the reason, the start hold / launch inputs and the grip-use factor.
export function caps(race, T, car, P = CONTROL) {
  const S = race.state, ctl = S.control, K = tables(race, T, P), cc = ctl.cars[car.num], t = S.t;
  const out = { v: Infinity, why: null, hold: false, util: 1, launch: null };
  const lim = (v, why) => { if (v < out.v) { out.v = Math.max(0, v); out.why = why; } };
  if (car.inc && car.inc.until > t) { if (car.inc.vCap != null) lim(car.inc.vCap, car.inc.kind); if (car.inc.util != null) out.util *= car.inc.util; }
  if (car.status === "dnf") { lim(0, "stopped"); return out; }
  if (car.status === "grid") { lim(0, "grid"); out.hold = true; return out; }
  if (ctl.start && ctl.start.go[car.num] != null && t < ctl.start.out + 8000) out.launch = ctl.start.launch[car.num];
  if (car.status === "fin") { lim(K.ref[T.idx(car.s)] / K.slow * P.cooldown.v, "cool-down lap"); return out; }
  if (car.where === "pit") return out;   // (the pit lane: pit.js and pitCtx)
  const pos = lapPos(car, T);
  // standing restart: drive to the grid slot and stop there
  if (cc.gridS != null && (!ctl.sc || ctl.sc.st === "pit" || ctl.sc.st === "gone")) {   // (once the SC has gone in at the end of the lap)
    const d = T.ahead(pos, cc.gridS);
    if (d < 1200) lim(Math.sqrt(2 * 2.0 * G * Math.max(0, d - 0.3)), "to the grid slot");
    lim(K.sc[T.idx(pos)], "formation to the grid");
  }
  const f = ctl.flag;
  if (f === "vsc" || f === "red" || (f === "sc" && minTimeApplies(race, car, cc))) lim(ghostCap(race, T, K, car, cc, pos, P), f === "vsc" ? "VSC delta" : "minimum sector time");
  // unlapping / driving round to the back of the queue: "an appropriate speed" – quicker than the queue so it gets there
  if (f === "sc" && (cc.perm === "unlap" || cc.perm === "toQueue" || cc.perm === "wave")) lim(K.sc[T.idx(pos)] * P.passPace.v, cc.perm === "wave" ? "waved past the safety car" : "passing the queue at an appropriate speed");
  if (f === "sc" || f === "red") {
    const sc = ctl.sc;
    const toGrid = cc.gridS != null && (!sc || sc.st === "pit" || sc.st === "gone");
    if (!(cc.perm === "wave" || cc.perm === "unlap" || cc.perm === "toQueue") && !toGrid) {
      const p = pred(race, T, car, P);
      const restart = sc && sc.st === "in" && sc.restart;
      const isLead = restart && !sc.standing && sc.restart.leader === car.num;
      if (isLead) {
        // the leader dictates the pace once the SC's lights are out: about the SC's speed, then he goes at a point of his choosing
        if (!sc.restart.go && T.ahead(pos, sc.restart.goS) < 30) sc.restart.go = true;
        if (!sc.restart.go) lim(K.sc[T.idx(pos)] * P.restartPace.v, "leader controls the restart");
        if (p && !p.isSC) lim(queueCap(p, P.queueGap.v, P), "no overtaking");
      } else if (p) lim(queueCap(p, restart ? P.queueGap.v * 0.6 : P.queueGap.v, P), p.isSC ? "behind the safety car" : "safety car queue");
    }
  }
  const y = inYellow(race, T, pos);
  if (y) out.util *= y.dbl ? P.yellowUtil.v.double : P.yellowUtil.v.single;
  return out;
}
// closing on the car ahead to the queue gap: speed at which braking at queueBrake stops the closing at the gap
function queueCap(p, gapTarget, P) {
  const a = P.queueBrake.v * G, g = p.gap - gapTarget;
  return g >= 0 ? Math.sqrt(p.v * p.v + 2 * a * g) : p.v * Math.max(0, p.gap / gapTarget);
}
// the delta ghost of the car's current marshalling sector: where a car at exactly the minimum time would be now
function ghostCap(race, T, K, car, cc, pos, P) {
  const t = race.state.t;
  if (!cc.sec) { const j = Math.min(K.N - 1, Math.floor(pos / K.secLen)); cc.sec = { j, t0: t, tb: tAt(K, T, pos), sEnd: Math.min(T.L, (j + 1) * K.secLen), grace: true }; }
  const sec = cc.sec, tau = sec.tb + (t - sec.t0) / 1000, tEnd = tAt(K, T, sec.sEnd);
  const vg = K.ref[T.idx(pos)] / K.slow;
  if (tau >= tEnd) return vg * 3;   // the ghost has left the sector: the car may finish it at any speed (its own limit)
  const sg = sAtTime(K, T, tau), e = sg - (pos < sec.j * K.secLen - 1 ? pos + T.L : pos);
  return vg * Math.min(3, Math.max(0.3, 1 + e / P.ghostGain.v));
}
// the delta (s) a car shows on its wheel: + behind the minimum time (fine), − ahead (an infringement at the sector end)
export function vscDelta(race, T, car) {
  const ctl = race.state.control, cc = ctl.cars[car.num], K = tables(race, T);
  if (!cc?.sec || ctl.flag === "green") return null;
  return (race.state.t - cc.sec.t0) / 1000 - (tAt(K, T, lapPos(car, T)) - cc.sec.tb);
}

// ---------- the pit lane ----------
// Extra inputs for pit.js's pitStep: { noBox (go to the fast-lane queue, not the box), holdU (stop by this pit-path
// distance), why }.
export function pitCtx(race, T, car, P = CONTROL) {
  const ctl = race.state.control, cc = ctl.cars[car.num], L = T.pit, out = { noBox: false, holdU: null, why: null };
  if (!L || car.where !== "pit") return out;
  const p = car.pit, u = p.u;
  const hold = (x, why) => { if (out.holdU == null || x < out.holdU) { out.holdU = x; out.why = why; } };
  if (car.pitStart && !ctl.pitStartOpen) hold(u, "pit-lane start: until the field has passed the pit exit");
  // the fast lane is one lane: never closer than a car length + 2 m to the car ahead in it (pit.js moves each car alone)
  const FAST = new Set(["entry", "lane", "laneOut", "exit"]);
  const arranging = ctl.flag === "red" && ctl.red && !ctl.red.open && !ctl.red.arrive;   // (SR 57.3: arranged by the marshals)
  const leaving = cc.redLap === 1;   // (a lapped car released for its extra lap pulls out of the line – B5.15.2c / B5.15.3a)
  if (FAST.has(p.phase) && !arranging && !leaving) {
    let near = null;
    for (const c of race.state.cars) if (c !== car && c.where === "pit" && FAST.has(c.pit.phase) && c.pit.u > u && ctl.cars[c.num].redLap !== 1 && (!near || c.pit.u < near.pit.u)) near = c;
    if (near) hold(near.pit.u - P.carLen.v - 2, "fast lane: the car ahead");
  }
  const R = ctl.red;
  const busy = ["approach", "queue", "penalty", "work", "release"].includes(p.phase);
  if (p.call?.red && !busy) out.noBox = true;   // (called in by the red flag: the fast lane, not the box – tyres are changed there)
  if (ctl.flag === "red" && R && !R.open) {
    if (!busy) out.noBox = true;
    const early = R.early && R.lapped.includes(car.num) && cc.redLap < 2;
    if (!early) hold(Math.max(0, L.limEnd - P.redHead.v - (cc.slot ?? 0) * P.redSlotGap.v), "red flag: queue at the pit exit");
  }
  // the exit light: red while the SC / the queue is passing the pit exit (est), and during a suspension
  // behind the SC (also at a red-flag resumption, when the field leaves the lane after the SC): one at a time – a car
  // waits at the exit light until the merge is clear of the SC and the car that left before it (est: P.mergeClear)
  if (ctl.flag === "sc" && u < L.limEnd + 1) {
    const clear = (s) => { const d = T.ahead(L.sOut, s); return d > P.mergeClear.v && d < T.L / 2 ? true : T.ahead(s, L.sOut) > 60 && T.ahead(s, L.sOut) < T.L / 2; };
    const blocked = (ctl.sc && ["out", "in", "hold"].includes(ctl.sc.st) && !clear(ctl.sc.s)) || race.state.cars.some((c) => c !== car && c.status === "run" && c.where !== "pit" && !clear(lapPos(c, T)))
      || race.state.cars.some((c) => c !== car && c.where === "pit" && c.pit.u > u && (c.pit.phase === "exit"));
    const ahead = race.state.cars.filter((c) => c !== car && c.where === "pit" && c.pit.u > u && c.pit.u < L.limEnd).length;
    if (blocked) hold(L.limEnd - 1 - ahead * P.redSlotGap.v, "pit exit: waiting for the merge to clear");
  }
  // (not when the field is leaving the pit lane behind the SC at a red-flag resumption)
  if (ctl.flag === "sc" && ctl.sc && (ctl.sc.st === "out" || ctl.sc.st === "in") && u < L.limEnd && !(R && R.phase === "run")) {
    const near = (s) => T.ahead(s, L.sOut) < P.pitExitHold.v;
    const queueNear = race.state.cars.some((c) => onTrack(c) && near(lapPos(c, T)) && !ctl.cars[c.num].perm);
    // queued at the light one behind the other (the cars already waiting ahead of this one in the lane)
    const ahead = race.state.cars.filter((c) => c !== car && c.where === "pit" && c.pit.u > u && c.pit.u < L.limEnd).length;
    if (near(ctl.sc.s) || queueNear) hold(L.limEnd - 1 - ahead * P.redSlotGap.v, "pit exit closed: the field is passing");
  }
  return out;
}

// May the car enter the pit lane for this purpose now / may it leave? purpose: "tyres" | "repair" | "time" (5/10 s at
// a stop) | "dt" | "sg" | "red". (Serving a DT / S&G under SC/VSC is refused by rules.js.)
export function pitOpen(race, T, car, purpose = "tyres") {
  const ctl = race.state.control;
  let entry = { ok: true }, exit = { ok: true };
  if (ctl.flag === "red") { entry = { ok: purpose === "red", why: "red flag: all cars into the pit lane" }; exit = { ok: !!ctl.red?.open, why: "pit exit closed (red flag)" }; }
  else if (ctl.flag === "sc" || ctl.flag === "vsc") {
    // SR 55.12 / 56.4, B5.13.3 / B5.12.3: only to change tyres (a time penalty is served at that stop)
    if (!(purpose === "tyres" || purpose === "repair")) entry = { ok: false, why: `${ctl.flag === "sc" ? "SC" : "VSC"}: pit entry only to change tyres` };
  }
  if (car.pitStart && !ctl.pitStartOpen) exit = { ok: false, why: "pit-lane start: the field has not passed the pit exit" };
  return { entry, exit };
}

// ---------- the snapshot's part ----------
export function controlSnapshot(race, T) {
  const ctl = race.state.control;
  const flag = ctl.phase === "grid" ? "grid" : ctl.phase !== "racing" ? "chequered" : ctl.flag === "green" && ctl.yellows.length ? "yellow" : ctl.flag;
  const sc = ctl.sc && ["out", "in", "hold"].includes(ctl.sc.st) ? { s: ctl.sc.s, d: 0, v: ctl.sc.v, lights: ctl.sc.lights } : null;
  return { flag, phase: ctl.phase, sc, yellows: ctl.yellows.map((y) => ({ s0: y.s0, s1: y.s1, dbl: y.dbl })), drs: ctl.drs.on, overtake: ctl.ot.on, msgs: ctl.msgs.slice(-5) };
}
