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
  // (v0.55: the team of the race leader – learning needs a lap in clear air (traffic < 0.3 s), and who has one depends on
  // the race: until v0.54 the McLarens, second and third behind Leclerc, had the odd one; with the follower's look-ahead
  // a car in a train loses a steady ≈ 0.5 s a lap and learns nothing there, wet or dry – the leader always can)
  const team = r.state.ai.teams[r.state.cars.find((c) => c.num === r.state.order[0]).teamKey], nW0 = team.est.nWear;
  // wet for two laps: the laps are dirty (not learnt)
  const lap0 = r.state.leaderLap; while (r.state.leaderLap < lap0 + 2) { setWater(r, AI.wetLearn * 4); e.step(r); }
  const offWet = JSON.stringify(team.est.off);
  // dry again: learning resumes within a few laps
  setWater(r, 0); const lap1 = r.state.leaderLap; while (r.state.leaderLap < lap1 + 4 && !r.state.finished) { setWater(r, 0); e.step(r); }
  assert.notStrictEqual(JSON.stringify(team.est.off), offWet, "lap offsets learnt again after it dried");
  assert.ok(team.est.nWear >= nW0);
});

// v0.55: the cached envelopes (race.cache.profiles – not saved, rebuilt at the load from each car's saved inputs). The
// traffic rules read a car's envelope – and since v0.55 the envelope of the car ahead – one step before the engine rebuilds
// a stale one, so the restored race has to hold exactly the arrays the never-saved one holds, for every car and at any step
const sameEnvelopes = (r, b, tag) => {
  for (const c of r.state.cars) {
    const x = r.cache.profiles[c.num], y = b.cache.profiles[c.num];
    assert.strictEqual(y.at, x.at, `${tag}: car ${c.num} (${c.where}/${c.pit.phase}) envelope time`);
    for (const k of ["vb", "vc"]) assert.strictEqual(Buffer.compare(Buffer.from(y.prof[k].buffer), Buffer.from(x.prof[k].buffer)), 0, `${tag}: car ${c.num} (${c.where}/${c.pit.phase}) envelope ${k}`);
    assert.strictEqual(y.prof.mu, x.prof.mu, `${tag}: car ${c.num} mu`); assert.strictEqual(y.prof.m, x.prof.m, `${tag}: car ${c.num} m`);
  }
};

test("a restored race holds every car's envelope as the never-saved one does: in the pit lane, with new tyres, in its first step back on the lap (v0.55)", async () => {
  const e = await E();
  const r = e.createRace({ scenario: HUN, seed: 3, userTeam: "Ferrari" });
  e.command(r, { id: "p", type: "pit", car: "16", args: { compound: "HARD" }, by: "player" });
  const car = r.state.cars.find((c) => c.num === "16"), seen = [], twins = [];
  let last = "", out = null;
  for (let i = 0; i < 6 * 60 * 20 && (out == null || r.state.t < out + 20000); i++) {
    e.step(r);
    for (const tw of twins) e.step(tw.b);
    const key = car.where + "/" + car.pit.phase;
    if (key !== last && (car.where === "pit" || (last.startsWith("pit") && car.where === "lap"))) {
      // (a new stage of the stop, and the first step back on the lap: a save here, restored, runs on beside the race)
      seen.push(key); const b = e.loadRace(e.saveRace(r), HUN); sameEnvelopes(r, b, key); twins.push({ key, b });
      if (car.where === "lap") out = r.state.t;
    }
    last = key;
  }
  assert.ok(out != null && seen.length >= 4, "the stop was seen stage by stage: " + seen.join(" "));
  assert.ok(r.state.cars.find((c) => c.num === "16").tyre.name === "HARD", "the tyres were changed");
  const A = norm(e, r);
  for (const tw of twins) { const B = norm(e, tw.b); assert.strictEqual(A === B, true, `saved at ${tw.key}: first difference at ` + firstDiff(A, B)); }
});

test("a save between a contact's damage and the damaged car's next move: the restored race keeps the envelope from before it for that step (v0.55)", async () => {
  const e = await E();
  const r = e.createRace({ scenario: HUN, seed: 3, userTeam: "Ferrari" });
  run(e, r, 90000);
  const car = r.state.cars.find((c) => c.num === "81");
  car.dmg = { aero: 0.12, power: 1, puncture: false };                   // (as incidents.js leaves it after the moves of a step)
  const b = e.loadRace(e.saveRace(r), HUN);
  sameEnvelopes(r, b, "after the damage");
  run(e, r, 90050); run(e, b, 90050);
  sameEnvelopes(r, b, "one step on"); assert.strictEqual(r.state.cars.find((c) => c.num === "81").profIn.dk, "0.12|1", "the new envelope is the damaged car's");
  run(e, r, 110000); run(e, b, 110000);
  const A = norm(e, r), B = norm(e, b);
  assert.strictEqual(A === B, true, "first difference at " + firstDiff(A, B));
});
