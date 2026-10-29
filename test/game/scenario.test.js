// The scenario format and its builder (src/game/data/scenario.js, src/game/tools/build-scenario.mjs, extract-calib.mjs):
// the validator refuses what an engine input must not hold; the fixtures keep the race's outcome out of the scenario and
// in the separate calibration file; with the app's session cache present, the builder reproduces a fixture exactly.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const FIX = path.join(__dirname, "../fixtures/game");
const CACHE = path.join(os.homedir(), "Library/Application Support/f1-live-kr/cache");
const list = () => (fs.existsSync(FIX) ? fs.readdirSync(FIX).filter((f) => f.endsWith(".scenario.json")).sort() : []);
const read = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const clone = (o) => JSON.parse(JSON.stringify(o));

test("validator: a fixture passes; outcome keys, broken columns, foreign grid numbers and bad sectors are refused", async (t) => {
  const { validateScenario, SCENARIO_VERSION } = await import("../../src/game/data/scenario.js");
  const f = list()[0]; if (!f) return t.skip("no fixtures");
  const sc = read(f);
  assert.ok(validateScenario(sc).ok);
  const bad = (mut, re) => { const c = clone(sc); mut(c); const v = validateScenario(c); assert.ok(!v.ok && v.errors.some((e) => re.test(e)), `expected ${re}: ${v.errors.join("; ")}`); };
  bad((c) => { c.classification = [{ pos: 1, num: "1" }]; }, /outcome/);
  bad((c) => { c.race.pitLaps = { 1: [20] }; }, /outcome/);
  bad((c) => { c.weather.scPeriods = []; }, /outcome/);
  bad((c) => { c.version = SCENARIO_VERSION + 1; }, /version/);
  bad((c) => { c.track.columns.kappa = c.track.columns.kappa.slice(1); }, /kappa: length/);
  bad((c) => { c.track.columns.wL[5] = -1; }, /wL\[5\]/);
  bad((c) => { c.track.columns.x[10] += 50; }, /spacing/);
  bad((c) => { c.grid.slots[0].num = "999"; }, /not an entry/);
  bad((c) => { c.track.zones.sectors = [c.track.zones.sectors[1], c.track.zones.sectors[0]]; }, /sectors/);
  bad((c) => { c.race.laps = 0; }, /race.laps/);
  bad((c) => { c.weather.cols.rain[0] = 0.5; }, /rain/);
  bad((c) => { delete c.meta.sources; }, /sources/);
});

test("fixtures: the scenario holds only pre-race facts; the outcome is in the calibration file, marked never-an-input", async (t) => {
  const { validateCalib, calibLaps } = await import("../../src/game/data/scenario.js");
  const L = list(); if (!L.length) return t.skip("no fixtures");
  for (const f of L) {
    const sc = read(f), cf = f.replace(".scenario.json", ".calib.json");
    const text = JSON.stringify(sc);
    for (const k of ["classification", "pitLaps", "stops", "periods", "GapToLeader", "raceControl"]) assert.ok(!text.includes(`"${k}"`), `${f}: "${k}" in a scenario`);
    // entries: the race's own teams and drivers – how many there were is read from the data, not assumed
    const teams = new Set(sc.entries.map((e) => e.team));
    assert.ok(sc.entries.length >= 18 && sc.entries.length <= 24, `${f}: ${sc.entries.length} cars`);
    assert.ok(teams.size * 2 === sc.entries.length, `${f}: two cars per team (${teams.size} teams, ${sc.entries.length} cars)`);
    for (const e of sc.entries) assert.ok(e.tla && e.name && e.colour && /^#[0-9A-Fa-f]{6}$/.test(e.colour), `${f}: entry ${e.num}`);
    // the grid covers every car once: grid slots + pit-lane starters + not started
    const g = sc.grid, all = [...g.slots.map((s) => s.num), ...g.pitLane.map((s) => s.num), ...g.dns.map((s) => s.num)];
    assert.strictEqual(new Set(all).size, sc.entries.length, `${f}: every entry placed once at the start`);
    assert.ok(sc.weather.cols.t.length > 30, `${f}: weather records`);
    assert.ok(sc.tyres.compoundsSeen.length >= 2 && sc.tyres.nominations === null, `${f}: compounds`);
    if (!fs.existsSync(path.join(FIX, cf))) continue;
    const c = JSON.parse(fs.readFileSync(path.join(FIX, cf), "utf8"));
    assert.ok(validateCalib(c).ok, `${cf}: ${validateCalib(c).errors.join("; ")}`);
    assert.strictEqual(c.engineInput, false);
    assert.strictEqual(c.scenarioId, sc.meta.id);
    // the scheduled laps match what the winner ran (a full-distance race) or more (a shortened one) – never fewer laps scheduled than run
    const maxLap = Math.max(...c.classification.map((q) => q.laps));
    assert.ok(maxLap <= sc.race.laps, `${f}: ran ${maxLap} of ${sc.race.laps}`);
    // per-lap records are consistent: the tyre age grows by one a lap within a stint, sectors add up to the lap
    for (const num of Object.keys(c.drivers)) {
      const laps = calibLaps(c, num);
      for (let i = 1; i < laps.length; i++) { const a = laps[i - 1], b = laps[i]; if (a.stint === b.stint && a.age != null && b.lap === a.lap + 1) assert.strictEqual(b.age, a.age + 1, `${cf}: ${num} lap ${b.lap} age`); }
      for (const l of laps) if (l.s1 != null && l.time) assert.ok(Math.abs(l.s1 + l.s2 + l.s3 - l.time) < 0.1);
    }
    // the fastest-lap traces are on the scenario's s: as long as its lap, with a speed range of a real lap
    for (const tr of Object.values(c.traces)) { assert.strictEqual(tr.v.length, Math.ceil(sc.track.L / tr.bin)); const v = tr.v.filter((x) => x != null); assert.ok(Math.min(...v) > 40 && Math.max(...v) > 250 && Math.max(...v) < 375, `${cf}: speeds ${Math.min(...v)}–${Math.max(...v)}`); }
  }
});

test("builder: with the session cache, rebuilding a fixture's race gives the same scenario (deterministic, read-only)", async (t) => {
  const L = list(); if (!L.length) return t.skip("no fixtures");
  const sc0 = read(L.find((f) => /Monaco/.test(f)) || L[0]);
  const { hasSession, CACHE: C, loadReplay } = await import("../../src/game/tools/session.mjs");
  if (!fs.existsSync(CACHE) || !hasSession(sc0.meta.sessionPath, C)) return t.skip(`session cache absent (${sc0.meta.sessionPath}) – fixtures still checked above`);
  // the cache must not change: every file's size and mtime before and after
  const stamp = () => fs.readdirSync(CACHE).filter((f) => f.startsWith(sc0.meta.sessionPath.replace(/\//g, "_").replace(/_$/, ""))).map((f) => { const s = fs.statSync(path.join(CACHE, f)); return `${f}:${s.size}:${s.mtimeMs}`; }).sort().join("|");
  const before = stamp();
  const { buildScenario } = await import("../../src/game/tools/build-scenario.mjs");
  const { scenario } = buildScenario(loadReplay(sc0.meta.sessionPath), sc0.meta.sessionPath, { builtAt: sc0.meta.builtAt });
  assert.strictEqual(stamp(), before, "the cache was touched");
  const a = clone(scenario), b = clone(sc0);
  for (const o of [a, b]) { delete o.meta.builder; }
  assert.deepStrictEqual(a.track.columns.kappa.length, b.track.columns.kappa.length);
  assert.deepStrictEqual(a, b);
});
