// v0.52 §4: a race saved and restored at any step runs on exactly like the race that never stopped – the whole saved
// state (cars, AI observations, dirty marks, learnt coefficients, plans, orders, RNG streams) compared byte for byte.
// The wet-track AI state used to be a cache refreshed once a second and not saved: a restore between the threshold
// crossing and the next refresh learnt differently (the review's case at 125 050 ms).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const FX = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game", n), "utf8"));
const HUN = FX("2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), GBR = FX("2025-07-06_British_Grand_Prix_2025-07-06_Race.scenario.json");
const E = () => import("../../src/game/engine/engine.js"), P = () => import("../../src/game/data/params/ai.js");
const run = (e, r, until) => { while (r.state.t < until && !r.state.finished) e.step(r); };
// the comparable state: what saveRace writes (it brings state.surface up to date first)
const norm = (e, r) => e.saveRace(r);
function firstDiff(a, b) { const A = JSON.parse(a), B = JSON.parse(b); const walk = (x, y, p) => { if (JSON.stringify(x) === JSON.stringify(y)) return null; if (x && y && typeof x === "object" && typeof y === "object") { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) { const d = walk(x[k], y[k], p + "." + k); if (d) return d; } } return p; }; return walk(A, B, ""); }

// set the line's water so its mean is exactly `mm` (every segment the same)
const setWater = (r, mm) => { const h = r.cache.surface.hLine; for (let i = 0; i < h.length; i++) h[i] = mm; };

for (const [label, dw] of [["below", -1e-4], ["at", 0], ["above", 1e-4]]) {
  for (const t0 of [124950, 125000, 125050]) {
    test(`save/load at the wet-learning threshold (${label}) and the 1 s boundary (t ${t0}): the restored race equals the continued one`, async () => {
      const e = await E(), { AI } = await P();
      const r = e.createRace({ scenario: HUN, seed: 3, userTeam: "McLaren", ai: true });
      run(e, r, t0); setWater(r, AI.wetLearn + dw);
      const saved = e.saveRace(r), b = e.loadRace(saved, HUN);
      const until = t0 + 4 * 60000; run(e, r, until); run(e, b, until);
      const A = norm(e, r), B = norm(e, b);
      assert.strictEqual(A === B, true, "first difference at " + firstDiff(A, B));
    });
  }
}

test("a wet race saved and restored again and again runs exactly like the one never saved (British 2025, rain, AI)", async () => {
  const e = await E();
  const a = e.createRace({ scenario: GBR, seed: 2, userTeam: "Ferrari", ai: true });
  let b = e.createRace({ scenario: GBR, seed: 2, userTeam: "Ferrari", ai: true });
  const end = 45 * 60000;
  for (let t = 0; t < end; t += 137000) {   // (saves at odd times: never on a lap line or a whole second on purpose)
    run(e, a, t); run(e, b, t);
    b = e.loadRace(e.saveRace(b), GBR);
  }
  run(e, a, end); run(e, b, end);
  const A = norm(e, a), B = norm(e, b);
  assert.strictEqual(A === B, true, "first difference at " + firstDiff(A, B));
  // and it really was wet at some point (otherwise this checks little)
  assert.ok(a.state.cars.some((c) => c.laps.some((l) => /INTER|WET/.test(l.compound))) || a.state.log.some((e2) => e2.type === "rainStart"), "rain seen");
});

test("learning stops on a wet track and resumes once it has dried (no stuck dirty mark)", async () => {
  const e = await E(), { AI } = await P();
  const r = e.createRace({ scenario: HUN, seed: 3, userTeam: "McLaren", ai: true });
  run(e, r, 600000);
  const team = r.state.ai.teams.McLaren, nW0 = team.est.nWear;
  // wet for two laps: the laps are dirty (not learnt)
  const lap0 = r.state.leaderLap; while (r.state.leaderLap < lap0 + 2) { setWater(r, AI.wetLearn * 4); e.step(r); }
  const offWet = JSON.stringify(team.est.off);
  // dry again: learning resumes within a few laps
  setWater(r, 0); const lap1 = r.state.leaderLap; while (r.state.leaderLap < lap1 + 4 && !r.state.finished) { setWater(r, 0); e.step(r); }
  assert.notStrictEqual(JSON.stringify(team.est.off), offWet, "lap offsets learnt again after it dried");
  assert.ok(team.est.nWear >= nW0);
});
