// Test harness for race control / rules / incidents (not a test file itself: test/game/*.test.js import it).
// A synthetic 5 km track that keeps to the track.js contract (DESIGN §4.1): samples every 2 m, curvature with five
// corners, DRS / straight zones, three sectors, a pit path (600 m, branch at 4700, merge at 300, limiter 100–500).
// Cars are point masses with a free-running speed profile scaled by a per-car pace, accelerating / braking with fixed
// limits toward min(own profile, race control's cap) – the minimum needed to see control's effects; the real car
// model is physics.js's. A car that may not pass the car ahead (control.mayOvertake) cannot drive into it (1-D
// no-penetration); a car that may pass simply does (no lateral model here).
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const imp = (p) => import(pathToFileURL(path.join(__dirname, "../../src/game", p)).href);

function makeTrack(L = 5000, ds = 2) {
  const n = Math.round(L / ds), s = new Float64Array(n), kappa = new Float64Array(n), z = new Uint32Array(n);
  // corners: [centre m, half-length m, radius m]
  const corners = [[600, 60, 30], [1500, 120, 120], [2300, 80, 60], [3300, 150, 250], [4300, 50, 25]];
  for (let i = 0; i < n; i++) {
    s[i] = i * ds;
    for (const [c, h, r] of corners) { const d = Math.abs(s[i] - c); if (d < h) kappa[i] = (1 / r) * (d < h * 0.7 ? 1 : (h - d) / (h * 0.3)); }
  }
  const wrap = (x) => ((x % L) + L) % L, idx = (x) => Math.min(n - 1, Math.floor(wrap(x) / ds));
  const T = {
    L, n, ds, s, kappa, zone: z, wL: new Float64Array(n).fill(6), wR: new Float64Array(n).fill(6), line: new Float64Array(n),
    wrap, idx, ahead: (a, b) => ((wrap(b) - wrap(a)) + L) % L,
    at: (arr, x) => { const i = idx(x), j = (i + 1) % n, f = (wrap(x) - i * ds) / ds; return arr[i] * (1 - f) + arr[j] * f; },
    zones: { drs: [{ detect: 4400, start: 4800, end: 400 }, { detect: 2400, start: 2500, end: 3100 }], straight: [{ start: 4800, end: 400 }, { start: 2500, end: 3100 }], sectors: [1700, 3400], cover: [] },
  };
  const PL = 600;
  T.pit = { L: PL, sIn: 4700, sOut: 300, limStart: 100, limEnd: 500, speedLimit: 80 / 3.6,
    boxes: { a: 200, b: 230, c: 260, d: 290, e: 320, f: 350, g: 380, h: 410, i: 440, j: 470 },
    lapToPit: (x) => { const d = T.ahead(4700, x); return d < 30 ? d : null; }, pitToLap: (u) => wrap(4700 + u) };
  return T;
}

async function makeRace({ n = 10, season = 2025, seed = 1, totalLaps = 20, paces = null, pitStart = [], rulesPatch = null, P = null, scenario = {} } = {}) {
  const { Streams } = await imp("engine/rng.js"), pit = await imp("engine/pit.js"), C = await imp("engine/control.js");
  const rules = structuredCloneRules((await imp(`data/rules/${season}.js`)).default);
  if (rulesPatch) rulesPatch(rules);
  const teams = "abcdefghij".split("");
  const cars = [];
  for (let i = 0; i < n; i++) {
    const num = String(i + 1);
    cars.push({ num, teamKey: teams[Math.floor(i / 2) % teams.length], tla: "C" + num, grid: pitStart.includes(num) ? null : i + 1, pitStart: pitStart.includes(num),
      status: "grid", out: null, where: "lap", s: 0, d: 0, v: 0, dist: 0, lap: 0, pit: pit.newPitState(), pen: { pendingS: 0, finalS: 0, serve: [] },
      pace: paces ? paces[i] : 1 - i * 0.002, tyre: { compound: "MEDIUM" }, laps: [] });
  }
  const race = { state: { v: 1, t: 0, step: 0, seed, rulesSeason: season, totalLaps, finished: false, cars, order: cars.map((c) => c.num), log: [] },
    rules, rng: new Streams(seed), cache: {}, scenario };
  const T = makeTrack();
  C.newControl(race, T, P || undefined);
  // the cars' own free-running profile (a quicker car than control's reference)
  race.cache.prof = C.speedProfile(T, { aLat: 1.7 * 9.81, kDown: 0.0036, vMax: 93, aBrake: 4.5 * 9.81, aAcc: 1.3 * 9.81 });
  race.cache.boxes = pit.newBoxes(teams);
  return { race, T, C, pit };
}
function structuredCloneRules(r) { return JSON.parse(JSON.stringify(r)); }

// one 50 ms step: control first, then the cars (pit path via pit.js), then the order
function step(H, { env = {}, hooks = {} } = {}) {
  const { race, T, C, pit } = H, S = race.state, dt = 0.05;
  S.t += 50; S.step++;
  C.controlStep(race, T, env);
  hooks.afterControl?.(H);
  const prof = race.cache.prof;
  // on-lap cars sorted by position (for no-penetration)
  const on = S.cars.filter((c) => (c.status === "run" || c.status === "fin") && c.where === "lap");
  for (const c of S.cars) {
    if (c.status === "dnf" || c.status === "grid") { c.v = 0; continue; }
    const cap = C.caps(race, T, c);
    if (c.where === "pit") {
      const ctx = C.pitCtx(race, T, c);
      const others = S.cars.filter((o) => o.where === "pit").map((o) => ({ num: o.num, team: o.teamKey, phase: o.pit.phase, u: o.pit.u, v: o.pit.v }));
      const lp0 = C.lapPos(c, T);
      const pen = hooks.penaltyS?.(c) ?? 0;
      const ev = pit.pitStep(c, T, { t: S.t, dt, team: c.teamKey, boxes: race.cache.boxes, rng: race.rng.get("pit:" + c.teamKey), wet: false, others, penaltyS: pen, noWork: hooks.noWork?.(c), noBox: ctx.noBox || hooks.noBox?.(c), holdU: ctx.holdU,
        onWorkDone: (car, cmp) => { car.tyre = { compound: cmp }; hooks.onWorkDone?.(car, cmp); } });
      if (ev) hooks.pitEvent?.(c, ev);
      if (c.pit.phase === "none") { c.where = "lap"; const d = T.ahead(lp0, c.s); c.dist += d < T.L / 2 ? d : 0; }
      else { c.v = c.pit.v; c.dist += T.ahead(lp0, C.lapPos(c, T)) < 100 ? T.ahead(lp0, C.lapPos(c, T)) : 0; }
      continue;
    }
    const util = cap.util ?? 1;
    let vt = prof[T.idx(c.s)] * c.pace * Math.sqrt(util);
    vt = Math.min(vt, cap.v, pit.lapCapForPit(c, T));
    const aUp = c.v < 5 && cap.launch ? 9 * (cap.launch.quality ?? 1) : 12, aDn = 40;
    c.v = c.v < vt ? Math.min(vt, c.v + aUp * dt) : Math.max(vt, c.v - aDn * dt);
    let mv = c.v * dt;
    // no penetration of a car this one may not pass
    for (const o of on) {
      if (o === c) continue;
      const g = T.ahead(c.s, o.s);
      if (g < 60 && !C.mayOvertake(race, T, c, o).ok && mv > g - 6.0) { mv = Math.max(0, g - 6.0); c.v = Math.min(c.v, mv / dt); }
    }
    const sc = race.state.control.sc;
    if (sc && ["out", "in", "hold"].includes(sc.st)) { const g = T.ahead(c.s, sc.s); if (g < 60 && !C.mayOvertake(race, T, c, "SC").ok && mv > g - 6) { mv = Math.max(0, g - 6); c.v = Math.min(c.v, mv / dt); } }
    const s0 = c.s; c.s = T.wrap(c.s + mv); c.dist += mv;
    const ev = pit.pitOnLap(c, T, s0, c.s, S.t);
    if (ev === "entry") { c.where = "pit"; hooks.pitEvent?.(c, "entry"); }
  }
  S.order = C.raceOrder(race, T).map((c) => c.num);
  hooks.afterCars?.(H);
}
function run(H, ms, opt = {}) { const end = H.race.state.t + ms; while (H.race.state.t < end && !H.race.state.finished) { step(H, opt); if (opt.until?.(H)) break; } }
const msgs = (H) => H.race.state.control.msgs.map((m) => m.text);
const trackOrder = (H) => H.race.state.cars.filter((c) => c.status === "run").sort((a, b) => b.dist - a.dist).map((c) => c.num);

module.exports = { imp, makeTrack, makeRace, step, run, msgs, trackOrder };
