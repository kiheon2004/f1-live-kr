// v0.50 §3-2 / §3-3 / §3-4 / §5-6: the render-time picture (discrete fields at their recorded times, continuous ones
// interpolated, estimates from the older snapshot), the save revision, the speed / pause policy, Space, the alerts.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const R = (p) => import(path.join(__dirname, "../../src", p));
const SC = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game/2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), "utf8"));

const car = (o) => ({ num: "4", where: "lap", status: "run", s: 100, u: null, d: 0, v: 80, steer: 0, wheelDist: 0, lap: 1, pos: 2, mode: { pace: "balanced", energy: "balanced" },
  energy: { soc: 0.9, mode: "balanced" }, fuel: 90, tyre: { compound: "MEDIUM", code: "C3", setId: "4-M1", wear: 0.1, life: 0.9, Ts: 90, Tc: 85, Tw: 88, age: 3 },
  pit: { phase: "none", times: {} }, gap: { leader: 1.2 }, trans: [], transCut: 0, ...o });

test("present: the review's synthetic case – at 10 % between a (lap 1, P2, SoC 0.9, balanced) and b (lap 2, P1, SoC 0.1, attack) the car is a's, SoC interpolated", async () => {
  const { presentCars } = await R("renderer/game/present.js");
  const a = { t: 1000, cars: [car({})] };
  const b = { t: 2000, cars: [car({ s: 180, lap: 2, pos: 1, mode: { pace: "attack", energy: "push" }, energy: { soc: 0.1, mode: "push" }, gap: { leader: 0 },
    trans: [{ t: 1500, set: { lap: 2 } }, { t: 1600, set: { pos: 1 } }, { t: 1800, set: { pace: "attack", emode: "push" } }] })] };
  let c = presentCars(a, b, 1100, 4000)[0];
  assert.deepStrictEqual([c.lap, c.pos, c.mode.pace, c.mode.energy, c.energy.mode], [1, 2, "balanced", "balanced", "balanced"]);
  assert.ok(Math.abs(c.energy.soc - 0.82) < 1e-9, "continuous: interpolated"); assert.strictEqual(c.gap.leader, 1.2, "estimate: a's");
  c = presentCars(a, b, 1650, 4000)[0];
  assert.deepStrictEqual([c.lap, c.pos, c.mode.pace], [2, 1, "balanced"], "each change at its own time");
  c = presentCars(a, b, 1900, 4000)[0];
  assert.deepStrictEqual([c.mode.pace, c.mode.energy], ["attack", "push"]);
});

test("present: a tyre change shows the old set's values until its time, the new set's after; pit times after T are hidden; lap↔pit follows the side at T", async () => {
  const { presentCars } = await R("renderer/game/present.js");
  const a = { t: 0, cars: [car({ where: "pit", status: "pit", u: 200, s: 50, pit: { phase: "work", times: { stop: -2000, work: -1500 }, workT1: 600 } })] };
  const b = { t: 1000, cars: [car({ where: "pit", status: "pit", u: 205, s: 52, tyre: { compound: "HARD", code: "C2", setId: "4-H1", wear: 0, life: 1, Ts: 70, Tc: 70, Tw: 70, age: 0 },
    pit: { phase: "laneOut", times: { stop: -2000, work: -1500, workEnd: 600, release: 900 }, workT1: 600 },
    trans: [{ t: 600, set: { phase: "release", tyre: "HARD", code: "C2", setId: "4-H1" } }, { t: 900, set: { phase: "laneOut" } }] })] };
  let c = presentCars(a, b, 500, 4000)[0];
  assert.strictEqual(c.tyre.compound, "MEDIUM"); assert.strictEqual(c.tyre.wear, 0.1); assert.strictEqual(c.pit.phase, "work");
  assert.strictEqual(c.pit.times.workEnd, null, "the work's end is not shown before it happens"); assert.strictEqual(c.pit.times.release, null);
  c = presentCars(a, b, 700, 4000)[0];
  assert.strictEqual(c.tyre.compound, "HARD"); assert.strictEqual(c.tyre.wear, 0); assert.strictEqual(c.pit.phase, "release"); assert.strictEqual(c.pit.times.workEnd, 600); assert.strictEqual(c.pit.times.release, null);
  // lap ↔ pit: a on the lap, b in the pit, the entry at 800
  const a2 = { t: 0, cars: [car({ s: 3900, v: 80 })] }, b2 = { t: 1000, cars: [car({ where: "pit", status: "pit", s: 3990, u: 15, v: 60, trans: [{ t: 800, set: { where: "pit" } }] })] };
  c = presentCars(a2, b2, 500, 4000)[0]; assert.strictEqual(c.where, "lap"); assert.ok(Math.abs(c.s - 3940) < 1e-6);
  c = presentCars(a2, b2, 900, 4000)[0]; assert.strictEqual(c.where, "pit"); assert.strictEqual(c.status, "pit"); assert.ok(Math.abs(c.u - 9) < 1e-6);
});

test("present: when the engine's kept changes don't reach back to a (transCut), a's state until the cut – no invented times; race-wide flag likewise", async () => {
  const { presentCars, presentRace } = await R("renderer/game/present.js");
  const a = { t: 0, flag: "green", phase: "racing", leaderLap: 5, weather: { rain: 0, airT: 20, water: 0 }, cars: [car({})] };
  const b = { t: 10000, flag: "sc", phase: "racing", leaderLap: 6, weather: { rain: 2, airT: 18, water: 0.4 }, rtrans: [{ t: 7000, set: { flag: "sc" } }], rtransCut: 4000,
    cars: [car({ lap: 3, pos: 5, trans: [{ t: 6000, set: { pos: 5 } }, { t: 8000, set: { lap: 3 } }], transCut: 5000 })] };
  let c = presentCars(a, b, 3000, 4000)[0]; assert.deepStrictEqual([c.lap, c.pos], [1, 2]);
  c = presentCars(a, b, 6500, 4000)[0]; assert.deepStrictEqual([c.lap, c.pos], [1, 5]);
  assert.strictEqual(presentRace(a, b, 3000).flag, "green"); assert.strictEqual(presentRace(a, b, 7500).flag, "sc");
  assert.ok(Math.abs(presentRace(a, b, 5000).weather.rain - 1) < 1e-9);
});

test("present: on a real race – the HUD picture at every render time between snapshots never shows a lap / position / tyre the engine reached later", async () => {
  const E = await R("game/engine/engine.js"), { presentAt } = await R("renderer/game/present.js");
  const r = E.createRace({ scenario: SC, seed: 4, userTeam: "McLaren", ai: true });
  while (r.state.t < 240000) E.step(r);
  const snaps = []; for (let k = 0; k < 40; k++) { for (let i = 0; i < 20; i++) E.step(r); snaps.push(E.snapshot(r)); }   // (1 s apart: 60× at 60 fps)
  let checks = 0;
  for (let k = 1; k < snaps.length; k++) {
    const a = snaps[k - 1], b = snaps[k];
    for (const T of [a.t + 100, a.t + 500, b.t - 50]) {
      const P = presentAt(a, b, T, r.cache.T.L);
      for (const c of P.cars) {
        const tr = b.cars.find((x) => x.num === c.num).trans.filter((e) => e.t <= T);
        const lastLap = [...tr].reverse().find((e) => "lap" in e.set);
        const want = lastLap && lastLap.t > a.t ? lastLap.set.lap : a.cars.find((x) => x.num === c.num).lap;
        assert.strictEqual(c.lap, want); checks++;
      }
    }
  }
  assert.ok(checks > 1000);
});

test("save revision: a save marks only the revision it was built at; an order sent meanwhile stays unsaved; an earlier race's late answer changes nothing", async () => {
  const S = await R("renderer/game/saverev.js");
  const G = { raceGen: 1, rev: 10, savedRev: -1 };
  const t1 = S.beginSave(G);           // paused, save requested
  G.rev++;                             // an order sent before the answer comes back
  const m = S.endSave(G, t1, true);
  assert.ok(m.marked && m.behind); assert.strictEqual(G.savedRev, 10); assert.ok(S.unsaved(G), "the new order is still unsaved");
  // auto + manual at once: the later revision wins whatever order the answers come in
  const ta = S.beginSave(G); G.rev++; const tb = S.beginSave(G);
  S.endSave(G, tb, true); S.endSave(G, ta, true); assert.strictEqual(G.savedRev, 12); assert.ok(!S.unsaved(G));
  // a failure marks nothing; a retry does
  G.rev++; const tf = S.beginSave(G); assert.ok(!S.endSave(G, tf, false).marked); assert.ok(S.unsaved(G));
  assert.ok(S.endSave(G, S.beginSave(G), true).marked); assert.ok(!S.unsaved(G));
  // the previous race's answer arrives after another race started
  const old = S.beginSave(G); G.raceGen = 2; G.rev = 0; G.savedRev = -1;
  const st = S.endSave(G, old, true); assert.ok(st.stale); assert.strictEqual(G.savedRev, -1);
});

test("speed: 30× → pause → resume is 30×; first resume without a choice is 1×; manual wins over automatic slowing; auto never speeds up", async () => {
  const E = await R("game/engine/engine.js"), { GameRunner } = await R("renderer/game/runner.js");
  let now = 0; const race = E.createRace({ scenario: SC, seed: 1 });
  const run = new GameRunner(race, E, { now: () => now });
  run.manual(30); assert.strictEqual(run.speed, 30); assert.ok(!run.paused);
  run.pause(); assert.ok(run.paused); assert.strictEqual(run.speed, 30);
  run.play(); assert.ok(!run.paused); assert.strictEqual(run.clock.speed, 30);
  run.auto({ slowTo: 1 }, { why: "SC" }); assert.strictEqual(run.speed, 1); assert.ok(run.slowNote);
  run.manual(10); assert.strictEqual(run.speed, 10); assert.strictEqual(run.slowNote, null);
  run.auto({ slowTo: 20 }); assert.strictEqual(run.speed, 10, "auto never raises the speed");
  run.auto({ pause: true }); assert.ok(run.paused); run.toggle(); assert.ok(!run.paused); assert.strictEqual(run.speed, 10);
  const r2 = new GameRunner(E.createRace({ scenario: SC, seed: 1 }), E, { now: () => now }); r2.pause(); r2.speed = 0; r2.play(); assert.strictEqual(r2.speed, 1);
});

test("Space: not while typing / composing / in a dialog / on a focused button / on key repeat", async () => {
  const { spaceAllowed } = await R("renderer/game/keys.js");
  const el = (match) => ({ closest: (sel) => (match && sel.includes(match) ? {} : null) });
  const ev = (o) => ({ code: "Space", repeat: false, isComposing: false, keyCode: 32, target: el(null), ...o });
  assert.ok(spaceAllowed(ev({}), false));
  assert.ok(!spaceAllowed(ev({ repeat: true }), false));
  assert.ok(!spaceAllowed(ev({ isComposing: true }), false));
  assert.ok(!spaceAllowed(ev({ keyCode: 229 }), false));
  assert.ok(!spaceAllowed(ev({}), true));
  for (const m of ["input", "textarea", "select", "contenteditable", "button", "role=button"]) assert.ok(!spaceAllowed(ev({ target: el(m) }), false), m);
  assert.ok(!spaceAllowed(ev({ code: "KeyA" }), false));
});

test("alerts: each rule once per cooldown, only for my cars, strongest action wins, nothing when off", async () => {
  const A = await R("renderer/game/alerts.js");
  const st = A.newAlertState(), set = A.defaultAlertSettings();
  let out = A.checkAlerts(st, { events: [{ t: 1000, type: "sc" }, { t: 1000, type: "contact", cars: ["16", "44"] }, { t: 1000, type: "contact", cars: ["4", "44"], effect: { kind: "damage" } }], mine: ["4", "81"], settings: set, t: 1000 });
  assert.deepStrictEqual(out.map((a) => a.rule).sort(), ["damage", "flag"]);
  assert.deepStrictEqual(A.clockAction(out, 30), { pause: true, slowTo: null });
  out = A.checkAlerts(st, { events: [{ t: 5000, type: "vsc" }], mine: ["4"], settings: set, t: 5000 }); assert.strictEqual(out.length, 0, "flag cooldown");
  out = A.checkAlerts(st, { events: [{ t: 40000, type: "vsc" }], mine: ["4"], settings: set, t: 40000 }); assert.strictEqual(out.length, 1);
  assert.deepStrictEqual(A.clockAction(out, 1), { pause: false, slowTo: null }, "already at 1×");
  const off = Object.fromEntries(Object.keys(set).map((k) => [k, "off"]));
  assert.strictEqual(A.checkAlerts(A.newAlertState(), { events: [{ t: 0, type: "red" }], settings: off, t: 0 }).length, 0);
  // a lap from the planned stop, and the forecast jump
  const st2 = A.newAlertState(), snap = { totalLaps: 70, cars: [{ num: "4", status: "run", lap: 19, pit: { phase: "none" }, fuel: 50, plan: { stints: [{ compound: "MEDIUM", toLap: 20 }, { compound: "HARD", toLap: 70 }] } }] };
  out = A.checkAlerts(st2, { snap, mine: ["4"], settings: set, t: 100, forecast: { blocks: [{ pRain: 0.1 }] } });
  assert.deepStrictEqual(out.map((a) => a.rule), ["myPit"]);
  out = A.checkAlerts(st2, { snap, mine: ["4"], settings: set, t: 200, forecast: { blocks: [{ pRain: 0.5 }] } });
  assert.deepStrictEqual(out.map((a) => a.rule), ["rain"]);
});
