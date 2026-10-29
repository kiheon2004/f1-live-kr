// The game's screen side (DESIGN §2, §13; request §4, §17, §19): engine s → world mapping, snapshot interpolation, the
// screen runner (speed / FPS independence, pause, honest achieved speed, render time inside the snapshots), order ids,
// and the game's own file store (userData/game – ids checked, nothing outside its folders).
// A synthetic ellipse track stands in for a scenario (no session cache needed); the "world" is built the way map3d's
// buildWorld lays its samples out (another start point, another spacing, scene axes x = X − cx, z = −(Y − cz)).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// an ellipse lap (F1 frame, metres), evenly resampled every ds from angle θ0, counter-clockwise (left turns)
function ellipse(n0, ds, a = 620, b = 290, th0 = 0, cx = 1500, cy = -800) {
  const M = 20000, P = []; let L = 0;
  for (let k = 0; k <= M; k++) { const t = th0 + (2 * Math.PI * k) / M, p = [cx + a * Math.cos(t), cy + b * Math.sin(t), 10 + 3 * Math.sin(2 * t)]; if (k) L += Math.hypot(p[0] - P[k - 1][0], p[1] - P[k - 1][1]); P.push(p); }
  const n = n0 || Math.round(L / ds), step = L / n, out = []; let acc = 0, j = 0;
  for (let i = 0; i < n; i++) {
    const target = i * step;
    while (j < M && acc + Math.hypot(P[j + 1][0] - P[j][0], P[j + 1][1] - P[j][1]) < target) { acc += Math.hypot(P[j + 1][0] - P[j][0], P[j + 1][1] - P[j][1]); j++; }
    const l = Math.hypot(P[j + 1][0] - P[j][0], P[j + 1][1] - P[j][1]) || 1, f = (target - acc) / l;
    out.push([P[j][0] + (P[j + 1][0] - P[j][0]) * f, P[j][1] + (P[j + 1][1] - P[j][1]) * f, P[j][2] + (P[j + 1][2] - P[j][2]) * f]);
  }
  return { pts: out, L, ds: step, n };
}
function scenarioOf(E) {
  const n = E.n, x = [], y = [], z = [], hdg = [], kappa = [], line = [];
  for (let i = 0; i < n; i++) {
    const a = E.pts[(i - 1 + n) % n], b = E.pts[(i + 1) % n]; x.push(E.pts[i][0]); y.push(E.pts[i][1]); z.push(E.pts[i][2]);
    hdg.push(Math.atan2(b[1] - a[1], b[0] - a[0])); line.push(0);
  }
  for (let i = 0; i < n; i++) { let dh = hdg[(i + 1) % n] - hdg[(i - 1 + n) % n]; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); kappa.push(dh / (2 * E.ds)); }
  return { format: "f1kr-game-scenario", version: 1, meta: { id: "synthetic", season: 2025, event: "Test GP", location: "Nowhere", date: "2025-01-01", startUtc: "2025-01-01T12:00:00Z" },
    track: { n, ds: E.ds, L: E.L, columns: { x, y, z, hdg, kappa, line, wL: x.map(() => 6), wR: x.map(() => 6) }, zones: { drs: [] }, pit: null },
    entries: [{ num: "1", tla: "AAA", team: "Team A", teamKey: "Team A", colour: "#ff0000" }, { num: "2", tla: "BBB", team: "Team A", teamKey: "Team A", colour: "#ff0000" }, { num: "3", tla: "CCC", team: "Team B", teamKey: "Team B", colour: "#00ff00" }],
    grid: { slots: [{ pos: 1, num: "1" }, { pos: 2, num: "3" }, { pos: 3, num: "2" }] }, race: { laps: 5 }, weather: { cols: { t: [0], air: [20], track: [30], windSpeed: [1], rain: [0] } }, tyres: { compoundsSeen: ["MEDIUM", "HARD"] } };
}
// a world laid out as buildWorld does: scene axes, samples from another start, nor = right of travel
function worldOf(E, center) {
  const pts = E.pts.map(([X, Y, Z]) => ({ x: X - center.x, y: Z - center.y, z: -(Y - center.z) })), n = pts.length;
  const samples = pts.map((p, i) => { const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, tan = { x: (b.x - a.x) / l, z: (b.z - a.z) / l }; return { p, tan, nor: { x: -tan.z, y: 0, z: tan.x }, i, line: 0 }; });
  const grid = { nearest(x, z) { let best = null, bd = Infinity; for (const s of samples) { const d = Math.hypot(s.p.x - x, s.p.z - z); if (d < bd) { bd = d; best = s; } } return [best, bd]; } };
  return { samples, grid, center };
}

test("adapter mapping: engine (s, d) lands on the engine's own lap point in the world, + d to the LEFT of travel, whatever the world's start and spacing", async () => {
  const { buildMapping } = await import("../../src/renderer/game/adapter3d.js");
  const { trackFrame } = await import("../../src/renderer/smooth.js");
  const Eng = ellipse(0, 2), sc = scenarioOf(Eng);
  const center = { x: 1500, y: 10, z: -800 };
  const Wd = worldOf(ellipse(0, 2.07, 620, 290, 2.1), center); Wd.frame = trackFrame(Wd);
  const M = buildMapping(sc.track, Wd, Wd.frame);
  assert.ok(Math.abs(M.info.stretch - 1) < 0.01, `stretch ${M.info.stretch}`);
  const P = [0, 0, 0];
  let worst = 0, worstLeft = 0;
  for (let s = 0; s < sc.track.L; s += 37.3) {
    const i = Math.round(s / sc.track.ds) % sc.track.n, X = sc.track.columns.x[i], Y = sc.track.columns.y[i], h = sc.track.columns.hdg[i];
    const w = M.sd(i * sc.track.ds, 0); Wd.frame.at(w.s, w.d, P);
    worst = Math.max(worst, Math.hypot(P[0] + center.x - X, -P[2] + center.z - Y));
    // 3 m to the left in the engine → 3 m along the engine's left normal (−sin h, cos h) in the F1 frame
    const wl = M.sd(i * sc.track.ds, 3); Wd.frame.at(wl.s, wl.d, P);
    const lx = P[0] + center.x - X, ly = -P[2] + center.z - Y, along = lx * -Math.sin(h) + ly * Math.cos(h);
    worstLeft = Math.max(worstLeft, Math.abs(along - 3));
  }
  assert.ok(worst < 0.3, `engine lap point drawn ${worst.toFixed(3)} m off`);
  assert.ok(worstLeft < 0.3, `+3 m left drawn ${worstLeft.toFixed(3)} m off the engine's left`);
  assert.ok(M.info.plainRatioWorstErrM >= 0 && Number.isFinite(M.info.plainRatioWorstErrM));
});

test("adapter interpolation: between two snapshots by render time, s wrapped over the line, phases from the newer one; nothing written to the snapshots", async () => {
  const { createGameAdapter } = await import("../../src/renderer/game/adapter3d.js");
  const sc = scenarioOf(ellipse(0, 2)), L = sc.track.L;
  const a = { t: 1000, cars: [{ num: "1", pos: 1, where: "lap", s: L - 10, d: 1, v: 80, steer: 0, wheelDist: 100, pit: { phase: "none" }, tyre: { compound: "MEDIUM" } }] };
  const b = { t: 1250, cars: [{ num: "1", pos: 1, where: "lap", s: 10, d: 3, v: 80, steer: 0.1, wheelDist: 120, pit: { phase: "called" }, tyre: { compound: "MEDIUM" } }] };
  const frozen = JSON.stringify([a, b]);
  const src = { paused: false, speed: 1, pair: () => ({ a, b, renderT: 1125 }) };
  const A = createGameAdapter({ scenario: sc, source: src });
  const fr = A.frameCars();
  assert.ok(Math.abs(fr.cars[0].s - 0) < 1e-6 || Math.abs(fr.cars[0].s - L) < 1e-6, `s ${fr.cars[0].s}`);
  assert.strictEqual(fr.cars[0].d, 2); assert.strictEqual(fr.cars[0].wheelDist, 110); assert.strictEqual(fr.cars[0].pit.phase, "called");
  assert.strictEqual(JSON.stringify([a, b]), frozen);
  assert.strictEqual(A.ctx.src, null, "the game context is no live / replay source");
  assert.strictEqual(A.ctx.t, 1125);
  // the road drawn as wide as the engine's (wL / wR 6 m: points from 5 m right to 5 m left of the lap line, decimetres)
  const pts = A.ctx.carPoints(), C = sc.track.columns, far = Math.max(...pts.slice(0, 11).map((p) => Math.hypot(p[0] / 10 - C.x[0], p[1] / 10 - C.y[0])));
  assert.strictEqual(pts.length, sc.track.n * 11); assert.ok(Math.abs(far - 5) < 1e-6, `edge point ${far} m out`);
});

// a fake wall clock the runner reads (ms); steps may "cost" wall time
function clock() { let w = 0; return { now: () => w, add: (ms) => { w += ms; } }; }

test("runner: the race at a sim moment is the same at 1× / 60 fps and 30× / 24 fps as stepped directly (the screen never changes the steps)", async () => {
  const { GameRunner } = await import("../../src/renderer/game/runner.js");
  const D = await import("../../src/renderer/game/devsnap.js");
  const sc = scenarioOf(ellipse(0, 2));
  const runTo = (speed, fps, T) => {
    const c = clock(), race = D.createDevRace(sc, { startDelayMs: 1000 }), R = new GameRunner(race, { step: D.devStep, snapshot: D.devSnapshot }, { now: c.now, budgetMs: 1e9 });
    R.setSpeed(speed);
    while (race.state.t < T) { c.add(1000 / fps); R.frame(); }
    return race;
  };
  const ref = D.createDevRace(sc, { startDelayMs: 1000 }); while (ref.state.t < 30000) D.devStep(ref);
  for (const [sp, fps] of [[1, 60], [30, 24], [60, 144]]) {
    const r = runTo(sp, fps, 30000);
    // (each runner overshoots by under a frame: step the reference on to the same t and compare every car exactly)
    const R2 = D.createDevRace(sc, { startDelayMs: 1000 }); while (R2.state.t < r.state.t) D.devStep(R2);
    assert.deepStrictEqual(r.cars.map((c) => [c.s, c.v, c.dist]), R2.cars.map((c) => [c.s, c.v, c.dist]), `${sp}× at ${fps} fps`);
  }
});

test("runner: paused – no steps, no state change, render time still; playing – render time inside the buffered snapshots and never backwards", async () => {
  const { GameRunner } = await import("../../src/renderer/game/runner.js");
  const D = await import("../../src/renderer/game/devsnap.js");
  const sc = scenarioOf(ellipse(0, 2)), c = clock(), race = D.createDevRace(sc, { startDelayMs: 0 });
  const R = new GameRunner(race, { step: D.devStep, snapshot: D.devSnapshot }, { now: c.now, budgetMs: 1e9 });
  R.setSpeed(10);
  let lastR = -Infinity;
  for (let i = 0; i < 200; i++) {
    c.add(16.7); R.frame();
    const p = R.pair(), oldest = R.buf[0].t, newest = R.latest().t;
    assert.ok(R.renderT >= oldest - 1e-9 && R.renderT <= newest + 1e-9, `render ${R.renderT} outside [${oldest}, ${newest}]`);
    assert.ok(R.renderT >= lastR, "render time went back"); lastR = R.renderT;
    assert.ok(p.b.t >= p.renderT && (!p.a || p.a.t <= p.renderT));
  }
  R.setSpeed(0);
  const t0 = race.state.t, state0 = JSON.stringify(race.cars), r0 = R.renderT;
  for (let i = 0; i < 100; i++) { c.add(16.7); assert.strictEqual(R.frame(), 0); }
  assert.strictEqual(race.state.t, t0); assert.strictEqual(JSON.stringify(race.cars), state0); assert.strictEqual(R.renderT, r0);
  assert.strictEqual(R.achieved, 0);
});

test("runner: a speed the machine can't keep up with is reported as the speed really achieved, and the race is still computed step by step", async () => {
  const { GameRunner } = await import("../../src/renderer/game/runner.js");
  const D = await import("../../src/renderer/game/devsnap.js");
  const sc = scenarioOf(ellipse(0, 2)), c = clock(), race = D.createDevRace(sc, { startDelayMs: 0 });
  // each step costs 2 ms of wall time; 8 ms per frame for steps → at most ~4 steps (200 ms) per 16.7 ms frame ≈ 12×
  const R = new GameRunner(race, { step: (r) => { c.add(2); D.devStep(r); }, snapshot: D.devSnapshot }, { now: c.now, budgetMs: 8 });
  R.setSpeed(60);
  for (let i = 0; i < 180; i++) { c.add(16.7); R.frame(); }
  assert.ok(R.behind, "behind is reported");
  assert.ok(R.achieved > 5 && R.achieved < 20, `achieved ${R.achieved}`);
  assert.strictEqual(race.state.t % 50, 0, "whole 50 ms steps only");
  // the same race as stepped directly to that moment
  const ref = D.createDevRace(sc, { startDelayMs: 0 }); while (ref.state.t < race.state.t) D.devStep(ref);
  assert.deepStrictEqual(race.cars.map((x) => x.s), ref.cars.map((x) => x.s));
});

test("orders: every player order gets its own id (the engine drops repeats of an id – commands.js)", async () => {
  const { orderId } = await import("../../src/renderer/game/runner.js");
  const ids = new Set(Array.from({ length: 1000 }, () => orderId("pit")));
  assert.strictEqual(ids.size, 1000);
  const { newCommandState, submit } = await import("../../src/game/engine/commands.js");
  const cs = newCommandState(), id = orderId("pace");
  assert.ok(submit(cs, 0, { id, type: "pace", car: "1", args: { mode: "attack" } }).ok);
  assert.ok(submit(cs, 50, { id, type: "pace", car: "1", args: { mode: "attack" } }).dup);
});

test("game store: scenarios listed from userData/game/scenarios with their own entry lists; results and saves stay inside their folders; bad ids refused", async () => {
  const { GameStore } = require("../../src/main/gamestore.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-game-"));
  try {
    const st = new GameStore(dir), sc = scenarioOf(ellipse(0, 2));
    fs.mkdirSync(path.join(dir, "scenarios"));
    fs.writeFileSync(path.join(dir, "scenarios", "test_gp.scenario.json"), JSON.stringify(sc));
    fs.writeFileSync(path.join(dir, "scenarios", "broken.scenario.json"), "{ not json");
    const list = await st.listScenarios();
    const t = list.find((x) => x.id === "test_gp");
    assert.ok(t && t.laps === 5 && t.entries.length === 3 && t.entries[0].team === "Team A");
    assert.ok(list.find((x) => x.id === "broken")?.error, "a broken file is listed with its error, not dropped silently");
    assert.strictEqual((await st.loadScenario("test_gp")).meta.id, "synthetic");
    for (const bad of ["../x", "a/b", "", "x".repeat(200), "..", null, 5]) await assert.rejects(() => st.loadScenario(bad), /bad game id/);
    const r = await st.saveResult("test_gp", { classification: [{ pos: 1, num: "1" }] });
    assert.ok(r.ok && r.file.startsWith("results" + path.sep + "test_gp" + path.sep));
    const saved = JSON.parse(fs.readFileSync(path.join(dir, r.file), "utf8"));
    assert.strictEqual(saved.kind, "f1kr-game-result");
    assert.strictEqual((await st.listResults("test_gp")).length, 1);
    await st.saveGame("slot1", { t: 5 }); assert.deepStrictEqual(await st.loadGame("slot1"), { t: 5 });
    await assert.rejects(() => st.saveGame("../../etc", { t: 1 }), /bad game slot/);
    assert.strictEqual(await st.loadGame("nothing"), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("runner + the real engine (British 2025 fixture): the same race at 1× / 30× / 60× and different frame rates as stepped directly; orders through the runner are the engine's (duplicate id refused)", async () => {
  const file = path.join(__dirname, "../fixtures/game/2025-07-06_British_Grand_Prix_2025-07-06_Race.scenario.json");
  if (!fs.existsSync(file)) return test.skip?.("no British 2025 scenario fixture");
  const sc = JSON.parse(fs.readFileSync(file, "utf8"));
  const E = await import("../../src/game/engine/engine.js");
  const { GameRunner, orderId } = await import("../../src/renderer/game/runner.js");
  const T = 25000;
  const key = (r) => JSON.stringify(r.state.cars.map((c) => [c.num, c.s, c.v, c.where, c.pit.phase, c.tyre.wear]));
  const results = [];
  for (const [speed, fps] of [[1, 60], [30, 24], [60, 144]]) {
    const c = clock(), race = E.createRace({ scenario: sc, seed: 3, userTeam: "McLaren" });
    const R = new GameRunner(race, E, { now: c.now, budgetMs: 1e9 });
    const id = orderId("pace");
    assert.ok(R.command({ id, type: "pace", car: "4", team: "McLaren", args: { mode: "attack" }, by: "player" }).ok);
    assert.ok(R.command({ id, type: "pace", car: "4", team: "McLaren", args: { mode: "attack" }, by: "player" }).dup);
    R.setSpeed(speed);
    while (race.state.t < T) { c.add(1000 / fps); R.frame(); }
    const ref = E.createRace({ scenario: sc, seed: 3, userTeam: "McLaren" });
    E.command(ref, { id: "x", type: "pace", car: "4", team: "McLaren", args: { mode: "attack" }, by: "player" });
    while (ref.state.t < race.state.t) E.step(ref);
    assert.strictEqual(key(race), key(ref), `${speed}× at ${fps} fps`);
    results.push(race.state.t);
    // the render time stays inside the snapshots and the snapshot carries the contract's fields the 3D view reads
    const p = R.pair(), car = p.b.cars.find((x) => x.num === "4");
    assert.ok(R.renderT <= R.latest().t && "wheelDist" in car && "pit" in car && "tyre" in car && car.where);
  }
});
