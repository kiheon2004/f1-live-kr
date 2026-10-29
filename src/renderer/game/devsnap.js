// DEVELOPMENT ONLY – a stand-in snapshot source for building the 3D game mode before the real engine (src/game/engine,
// createRace/step/snapshot) exists. It is NOT a race simulation and never runs in the game's real flow: gamehome.js
// reaches it only through the explicit dev entry (Map3D.game.devStart / GameDev.devRace), and everything it shows is
// labelled "개발용 스냅샷". It exists so the adapter, the cars' posing, the pit lane and the crews can be checked against
// the snapshot contract (DESIGN §13.1) with the scenario's own track.
//
// What it does: one speed envelope for the lap (corner speed from the scenario's curvature at a fixed grip with a
// downforce term, braking and power-limited acceleration – round numbers, no calibration), every car at the same pace
// from its grid slot (so nobody drives through anybody: there is no traffic model here), on the scenario's racing line;
// one car (the 3rd on the grid, or `pitCar`) calls a stop on lap `pitLap` and goes through the scenario's pit path in
// the engine's phase names (entry → lane → approach → work → release → laneOut → exit) with work start / end times, so
// the crew's animation is driven by times the source decided. Fixed 50 ms steps (DT_MS), state.t integer ms, no
// Math.random (a fixed per-car spread only).
import { DT_MS } from "../../game/engine/clock.js";

const G = 9.81, MU = 1.5, KAERO = 0.0034, VMAX = 88, ABRAKE = 38, P_M = 900;   // (round numbers, dev only)
const SLOT = 8;   // m between grid slots along the lap (the real 16 m pitch is two columns)

// the lap's speed envelope (m/s) per track sample: corner limit, then braking backwards, then acceleration forwards
function envelope(tr) {
  const n = tr.n, ds = tr.ds, K = tr.columns.kappa, v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.max(1e-4, Math.abs(K[i])), den = 1 - (MU * KAERO) / k;
    v[i] = den <= 0 ? VMAX : Math.min(VMAX, Math.sqrt((MU * G) / k / den));
  }
  for (let pass = 0; pass < 2; pass++) for (let j = 2 * n - 1; j >= 0; j--) { const i = j % n, nx = v[(i + 1) % n]; v[i] = Math.min(v[i], Math.sqrt(nx * nx + 2 * ABRAKE * ds)); }
  for (let pass = 0; pass < 2; pass++) for (let j = 0; j < 2 * n; j++) { const i = (j + 1) % n, pv = v[j % n], a = Math.min(14, P_M / Math.max(pv, 8)) - 0.0006 * pv * pv; v[i] = Math.min(v[i], Math.sqrt(Math.max(0, pv * pv + 2 * a * ds))); }
  return v;
}
const at = (arr, s, ds, n) => { const f = (((s / ds) % n) + n) % n, i = Math.floor(f), w = f - i; return arr[i] * (1 - w) + arr[(i + 1) % n] * w; };
const wrapS = (s, L) => ((s % L) + L) % L;

export function createDevRace(scenario, { pitCar = null, pitLap = 2, startDelayMs = 4000 } = {}) {
  const tr = scenario.track, n = tr.n, ds = tr.ds, L = tr.L, env = envelope(tr), pit = tr.pit;
  const ents = new Map((scenario.entries || []).map((e) => [String(e.num), e]));
  const order = [...(scenario.grid?.slots || [])].sort((a, b) => a.pos - b.pos).map((s) => String(s.num));
  for (const e of ents.keys()) if (!order.includes(e)) order.push(e);   // (pit-lane starters and the rest: behind the grid here)
  const pitNum = pitCar != null ? String(pitCar) : order[2] || order[0];
  const cmp0 = scenario.tyres?.compoundsSeen?.find((c) => /MEDIUM/.test(c)) || "MEDIUM";
  const cars = order.map((num, i) => {
    const e = ents.get(num) || { num };
    return { num, e, s: wrapS(-SLOT * i - 6, L), lapsDone: -1, v: 0, a: 0, dist: 0, wheel: 0, status: "grid", where: "lap", u: 0, d: 0,
      tyre: { compound: cmp0, wear: 0, Ts: 60, Tc: 70, age: 0 }, pit: { phase: "none", u: 0, workT0: null, workT1: null, err: null, compound: null } };
  });
  const race = { dev: true, scenario, state: { t: 0, finished: false }, cars, pitNum, pitLap, startDelayMs, events: [], log: [] };
  race.info = { label: "개발용 스냅샷 (엔진 아님)", pitNum, pitLap, envelopeLap: lapTime(env, ds) };
  return race;
}
function lapTime(env, ds) { let t = 0; for (const v of env) t += ds / Math.max(1, v); return +t.toFixed(2); }

// one fixed step (DT_MS) – the clock.js Runner's step(race)
export function devStep(race) {
  const S = race.state, dt = DT_MS / 1000, sc = race.scenario, tr = sc.track, n = tr.n, ds = tr.ds, L = tr.L, P = tr.pit;
  const env = race.env || (race.env = envelope(tr));
  S.t += DT_MS;
  const go = S.t >= race.startDelayMs;
  for (const c of race.cars) {
    if (!go) continue;
    c.status = "run";
    const v0 = c.v;
    if (c.where === "lap") {
      let lim = at(env, c.s, ds, n);
      const aMax = Math.min(14, P_M / Math.max(c.v, 8)) - 0.0006 * c.v * c.v;
      c.v = Math.min(lim, c.v + aMax * dt);
      const s0 = c.s; c.s = wrapS(c.s + c.v * dt, L);
      if (c.s < s0) { c.lapsDone++; c.tyre.age++; if (c.lapsDone + 1 >= sc.race.laps) c.finished = true; }
      // the dev car's stop: at its lap, on reaching the pit branch
      if (P && c.num === race.pitNum && c.pit.phase === "none" && c.lapsDone + 1 === race.pitLap && c.pit.stops !== 1) { c.pit.phase = "called"; c.pit.compound = c.tyre.compound === "HARD" ? "MEDIUM" : "HARD"; }
      if (P && c.pit.phase === "called" && wrapS(c.s - P.sIn, L) < c.v * dt + 0.01) { c.where = "pit"; c.u = 0; c.pit.phase = "entry"; c.pit.u = 0; }
      c.d = at(tr.columns.line, c.s, ds, n);
    } else {
      // the pit path: brake to the limiter before limStart, the limiter, into the box, the work (2.4 s), out
      const box = P.boxes?.[c.e.teamKey] ?? (P.limStart + P.limEnd) / 2, lim = P.speedLimit || 22.2;
      const ph = c.pit;
      let target;
      if (ph.phase === "work") { target = 0; if (S.t >= ph.workT1) { ph.phase = "release"; c.tyre = { compound: ph.compound, wear: 0, Ts: 45, Tc: 55, age: 0 }; ph.stops = 1; } }
      else if (ph.phase === "release" || ph.phase === "laneOut" || ph.phase === "exit") target = c.u < P.limEnd ? lim : 80;
      else if (c.u < box) {
        const toBox = box - c.u, stopV = Math.sqrt(2 * 8 * Math.max(0, toBox - 0.3));
        target = Math.min(c.u < P.limStart ? Math.max(lim, Math.sqrt(lim * lim + 2 * 25 * (P.limStart - c.u))) : lim, stopV);
        if (toBox < 25) ph.phase = "approach"; else if (c.u >= P.limStart) ph.phase = "lane";
      } else target = 0;
      if (ph.phase === "approach" && (c.u >= box - 0.25 || (c.v < 0.3 && box - c.u < 1.5))) { c.v = 0; c.u = Math.max(c.u, box - 0.25); ph.phase = "work"; ph.workT0 = S.t + 300; ph.workT1 = S.t + 300 + 2400; }
      const a = target > c.v ? 9 : -25;
      c.v = ph.phase === "work" ? 0 : a > 0 ? Math.min(target, c.v + a * dt) : Math.max(target, c.v + a * dt);
      c.u += c.v * dt; ph.u = c.u;
      if (ph.phase === "release" && c.u > box + 8) ph.phase = "laneOut";
      if (ph.phase === "laneOut" && c.u > P.limEnd) ph.phase = "exit";
      if (c.u >= P.L) { c.where = "lap"; c.s = P.sOut; if (wrapS(P.sOut, L) < wrapS(P.sIn, L)) c.lapsDone++; ph.phase = "none"; ph.workT0 = ph.workT1 = null; }
      c.d = 0;
    }
    c.a = (c.v - v0) / dt; c.dist += c.v * dt;
  }
  if (race.cars.every((c) => c.finished)) S.finished = true;
}

// the snapshot contract (DESIGN §13.1) – a fresh plain object; nothing in the race is changed
export function devSnapshot(race) {
  const sc = race.scenario, tr = sc.track, L = tr.L, P = tr.pit, t = race.state.t;
  const along = (c) => (c.lapsDone + 1) * L + (c.where === "lap" ? c.s : P.columns.sLap[Math.min(P.n - 1, Math.round(c.u / P.ds))]);
  const ranked = [...race.cars].sort((a, b) => along(b) - along(a));
  const wi = (sc.weather?.cols?.t || []).findIndex((x, i, a) => x * 1000 <= t && (a[i + 1] == null || a[i + 1] * 1000 > t)), W = sc.weather?.cols || {};
  const kOf = (s) => at(tr.columns.kappa, s, tr.ds, tr.n);
  const drsOn = (s) => (tr.zones?.drs || []).some((z) => (z.start <= z.end ? s >= z.start && s <= z.end : s >= z.start || s <= z.end));
  return {
    t, scenarioId: sc.meta?.id || null, totalLaps: sc.race?.laps ?? null, leaderLap: Math.max(1, ranked[0].lapsDone + 1), flag: t < race.startDelayMs ? "grid" : "green", sc: null,
    weather: { rain: wi >= 0 && W.rain[wi] === 1 ? 3 : 0, airT: wi >= 0 ? W.air[wi] : null, trackT: wi >= 0 ? W.track[wi] : null, wind: wi >= 0 ? W.windSpeed[wi] : null, water: wi >= 0 && W.rain[wi] === 1 ? 0.8 : 0, est: true },
    dev: race.info,
    cars: ranked.map((c, i) => ({
      num: c.num, teamKey: c.e.teamKey, team: c.e.team, tla: c.e.tla, color: c.e.colour, status: c.status === "run" && c.where === "pit" ? "pit" : c.status, pos: i + 1, lap: Math.max(0, c.lapsDone + 1),
      where: c.where, s: c.where === "lap" ? c.s : null, u: c.where === "pit" ? c.u : null, d: c.d, v: c.v, a: c.a,
      steer: c.where === "lap" ? Math.max(-0.35, Math.min(0.35, Math.atan(3.6 * kOf(c.s)))) : 0,
      wheelDist: c.dist, aero: { open: c.where === "lap" && sc.meta.season < 2026 && drsOn(c.s) && c.v > 60 ? 1 : 0, front: 0 }, drs: false, overtake: false,
      tyre: { ...c.tyre }, energy: { soc: 0.5, mode: "balanced", deployKw: 0 }, fuel: null,
      pit: { phase: c.pit.phase, u: c.where === "pit" ? c.u : null, workT0: c.pit.workT0, workT1: c.pit.workT1, err: null, compound: c.pit.compound },
    })),
  };
}
