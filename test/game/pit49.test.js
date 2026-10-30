// v0.49 pit presentation contract (request §14, §15): which wheel a slow wheel is (from the draw that already sizes it –
// no new draw, saved with the race), the snapshot's pit block for the screen (phase times, penalty hold, stop-and-go,
// a held release) and that nothing of it changes the race.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const SC = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game/2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), "utf8"));
const fingerprint = (race) => JSON.stringify({ t: race.state.t, cars: race.state.cars.map((c) => [c.num, c.s.toFixed(6), c.v.toFixed(6), c.lap, c.tyre.wear.toFixed(9), c.pit.phase, c.pit.workEnd]), order: race.state.order });

// the synthetic lane of pit.test.js: a 5 km lap, the pit path 600 m from 4700 to 300, boxes a 250, b 330
function makeT() {
  const L = 5000, wrap = (s) => ((s % L) + L) % L;
  const pit = { L: 600, sIn: 4700, sOut: 300, limStart: 100, limEnd: 500, speedLimit: 80 / 3.6, boxes: { a: 250, b: 330 },
    lapToPit: (s) => { const d = ((wrap(s) - 4700) + L) % L; return d < 20 ? d : null; }, pitToLap: (u) => wrap(4700 + u) };
  return { L, wrap, ahead: (a, b) => ((wrap(b) - wrap(a)) + L) % L, pit };
}
async function oneStop(seed, P) {
  const M = await import("../../src/game/engine/pit.js"), { Streams } = await import("../../src/game/engine/rng.js");
  const T = makeT(), R = new Streams(seed), boxes = M.newBoxes(["a", "b"]);
  const c = { num: "1", status: "run", s: 3000, v: 80, lap: 3, pit: M.newPitState() };
  M.pitCall(c, T, { compound: "HARD", t: 0 }, P);
  let t = 0;
  for (let k = 0; k < 3000 && !(c.pit.times.work != null); k++) {
    t += 50;
    if (M.IN_LANE.has(c.pit.phase)) M.pitStep(c, T, { t, dt: 0.05, team: "a", boxes, rng: R.get("pit:a"), wet: false, others: [], penaltyS: 0 }, P);
    else { const s0 = c.s; c.s = T.wrap(c.s + 60 * 0.05); M.pitOnLap(c, T, s0, c.s, t, P); }
  }
  return c.pit;
}

test("slow wheel: the wheel comes from the draw that sizes the delay (no extra draw: the stop's time is what it was), all four wheels occur, the same seed the same wheel", async () => {
  const { PIT } = await import("../../src/game/data/params/pit.js"), M = await import("../../src/game/engine/pit.js");
  const P = { ...PIT, errBase: { ...PIT.errBase, v: 1 } }, [a, b] = PIT.errDelay.v, seen = [0, 0, 0, 0];
  for (let s = 1; s <= 60; s++) {
    const p = await oneStop(s, P);
    assert.ok(p.err && p.err.kind === "slow wheel", "every stop slow with errBase 1");
    assert.ok(Number.isInteger(p.err.wheel) && p.err.wheel >= 0 && p.err.wheel <= 3);
    // the delay and the wheel are one draw u: add = a + (b − a)·u, wheel = slowWheelOf(u)
    const u = (p.err.add - a) / (b - a);
    assert.strictEqual(p.err.wheel, M.slowWheelOf(u));
    seen[p.err.wheel]++;
    const again = await oneStop(s, P);
    assert.deepStrictEqual(again.err, p.err); assert.strictEqual(again.workEnd, p.workEnd);
  }
  assert.ok(seen.every((n) => n >= 6), `all four wheels occur: ${seen}`);
  // a clean stop's draws are untouched: with errBase 0 the work time is the crew's normal draw only
  const P0 = { ...PIT, errBase: { ...PIT.errBase, v: 0 } }, q = await oneStop(7, P0);
  assert.strictEqual(q.err, null);
});

test("engine: a slow wheel mid-stop survives save/restore – the same wheel, the same end, the same race after", async () => {
  const { PIT } = await import("../../src/game/data/params/pit.js"), E = await import("../../src/game/engine/engine.js");
  const keep = PIT.errBase.v; PIT.errBase.v = 1;   // (this test process only: every stop has a slow wheel)
  try {
    const a = E.createRace({ scenario: SC, seed: 4 });
    E.command(a, { id: "p", type: "pit", car: "4", args: { compound: "HARD" }, by: "player" });
    let snap = null;
    for (let i = 0; i < 20 * 60 * 20; i++) { E.step(a); const c = a.state.cars.find((x) => x.num === "4"); if (c.pit.phase === "work" && a.state.t - c.pit.times.work >= 1000) { snap = E.snapshot(a).cars.find((x) => x.num === "4"); break; } }
    assert.ok(snap, "car 4 reached its work");
    assert.ok(snap.pit.err && Number.isInteger(snap.pit.err.wheel), "the snapshot names the wheel");
    const saved = E.saveRace(a);
    for (let i = 0; i < 2400; i++) E.step(a);
    const b = E.loadRace(saved, SC);
    const sb = E.snapshot(b).cars.find((x) => x.num === "4");
    assert.deepStrictEqual(sb.pit, snap.pit, "the restored snapshot's pit block is the saved one's");
    for (let i = 0; i < 2400; i++) E.step(b);
    assert.strictEqual(fingerprint(b), fingerprint(a));
    assert.deepStrictEqual(b.state.log.slice(-8), a.state.log.slice(-8));
  } finally { PIT.errBase.v = keep; }
});

test("snapshot pit block: phase times as they happen, workT1 / err only during the stop, the stop-and-go and a held release flagged; reading it changes nothing", async () => {
  const E = await import("../../src/game/engine/engine.js");
  const r = E.createRace({ scenario: SC, seed: 3 });
  E.command(r, { id: "p", type: "pit", car: "16", args: { compound: "HARD" }, by: "player" });
  const seen = new Set(); let worked = null, after = null;
  for (let i = 0; i < 20 * 60 * 20; i++) {
    E.step(r);
    const g = E.snapshot(r).cars.find((x) => x.num === "16"), p = g.pit; seen.add(p.phase);
    if (p.phase === "none" || p.phase === "called" || p.phase === "committed") { assert.strictEqual(p.workT1, null); assert.strictEqual(p.err, null); }
    if (p.phase === "work") { worked = p; assert.ok(p.times.stop != null && p.times.work != null && p.times.entry != null); assert.strictEqual(p.times.workEnd, null, "the end isn't in times until it has happened"); assert.ok(p.workT1 > r.state.t - 50); }
    if (worked && p.phase === "laneOut") { after = p; break; }
  }
  assert.ok(worked && after, [...seen].join(","));
  // (the engine's work ends at the first 50 ms step at or after workT1: the tyres change then)
  assert.ok(after.times.workEnd >= worked.workT1 && after.times.workEnd < worked.workT1 + 50 && after.times.release >= after.times.workEnd);
  assert.strictEqual(after.noWork, false); assert.strictEqual(after.held, false); assert.strictEqual(after.holdT1, null);
  // reading snapshots doesn't change the race: the same race without them
  const q = E.createRace({ scenario: SC, seed: 3 });
  E.command(q, { id: "p", type: "pit", car: "16", args: { compound: "HARD" }, by: "player" });
  while (q.state.t < r.state.t) E.step(q);
  assert.strictEqual(fingerprint(q), fingerprint(r));
});

test("pit state: a time penalty holds before the work (holdT1 = the stop + the penalty), a stop-and-go flags noWork and has no slow wheel; a held release is flagged", async () => {
  const M = await import("../../src/game/engine/pit.js"), { Streams } = await import("../../src/game/engine/rng.js"), { PIT } = await import("../../src/game/data/params/pit.js");
  const T = makeT();
  for (const noWork of [false, true]) {
    const R = new Streams(2), boxes = M.newBoxes(["a", "b"]), c = { num: "1", status: "run", s: 3000, v: 80, lap: 3, pit: M.newPitState() };
    c.pit.err = { kind: "slow wheel", add: 3, wheel: 1, causes: [] };   // (a previous stop's – must not show on this one)
    M.pitCall(c, T, { compound: "HARD", t: 0 });
    let t = 0, hold = null, rel = null;
    for (let k = 0; k < 3000 && c.pit.phase !== "laneOut"; k++) {
      t += 50;
      if (M.IN_LANE.has(c.pit.phase)) { M.pitStep(c, T, { t, dt: 0.05, team: "a", boxes, rng: R.get("pit:a"), wet: false, others: [], penaltyS: 5, noWork }); if (c.pit.phase === "penalty" && !hold) hold = { stop: c.pit.times.stop, until: c.pit.holdUntil, noWork: c.pit.noWork }; if ((c.pit.phase === "release" || c.pit.phase === "laneOut") && !rel) rel = { err: c.pit.err, work: c.pit.times.work }; }
      else { const s0 = c.s; c.s = T.wrap(c.s + 60 * 0.05); M.pitOnLap(c, T, s0, c.s, t); }
    }
    assert.ok(hold && hold.until === hold.stop + 5000 && hold.noWork === noWork);
    assert.ok(rel.work >= hold.until, "no work before the hold ended");
    if (noWork) assert.strictEqual(rel.err, null, "a stop-and-go has no slow wheel (not even a stale one)");
  }
  // held: a car coming down the fast lane behind at the release; unsafe release chance 0 → held until it has passed
  const P = { ...PIT, unsafeRelease: { ...PIT.unsafeRelease, v: 0 } }, R = new Streams(1), boxes = M.newBoxes(["a"]);
  const c = { num: "1", status: "run", s: 0, v: 0, lap: 3, pit: { ...M.newPitState(), phase: "work", u: 250, stopU: 250, workEnd: 100, times: { stop: 0, work: 0 } } };
  boxes.a.occupant = "1";
  M.pitStep(c, T, { t: 100, dt: 0.05, team: "a", boxes, rng: R.get("pit:a"), wet: false, others: [{ num: "9", phase: "lane", u: 230, v: 22 }], penaltyS: 0 }, P);
  assert.strictEqual(c.pit.phase, "release"); assert.ok(c.pit.unsafeRolled, "held for the car behind");
  M.pitStep(c, T, { t: 150, dt: 0.05, team: "a", boxes, rng: R.get("pit:a"), wet: false, others: [{ num: "9", phase: "lane", u: 262, v: 22 }], penaltyS: 0 }, P);
  assert.strictEqual(c.pit.phase, "laneOut", "released once it has passed");
});
