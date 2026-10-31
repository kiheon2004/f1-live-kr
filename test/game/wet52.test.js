// v0.52 §5 / §6: dry / intermediate / wet as three classes – every change between them and a fresh set of the same
// compound are real candidates; one admissibility rule for every candidate (new, present plan, double-stack shifts);
// rain likely soon is a price on a slick stop, not a ban; a player's call is never cancelled by the AI.
// Weather sequences are written into the weather truth (rain in mm/h, a few minutes ahead) so the track wets and dries
// by the engine's own surface physics and the forecast sees it like real weather.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const SC = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game/2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), "utf8"));
const M = () => Promise.all([import("../../src/game/engine/engine.js"), import("../../src/game/engine/ai.js"), import("../../src/game/engine/strategy.js")]);

// laps:rain sequence → the race (stops after the sequence or at the flag)
async function rainRace(seq, { seed = 4, prep = null } = {}) {
  const [E] = await M();
  const r = E.createRace({ scenario: SC, seed, ai: true }); prep?.(r);
  const T = r.cache.truth;
  for (const [laps, rain] of seq) {
    const L0 = r.state.leaderLap;
    while (r.state.leaderLap < L0 + laps && !r.state.finished) { const m = Math.floor(r.state.t / 60000); for (let j = m; j < Math.min(T.rain.length, m + 12); j++) T.rain[j] = rain; E.step(r); }
  }
  return r;
}
// a car's stints as run: [{ c: compound, from, n }] (a stop starts a new stint, also on the same compound)
const stints = (c) => { const st = []; let prev = null; for (const l of c.laps) { const last = st[st.length - 1]; if (last && !prev?.pit && last.c === l.compound) last.n++; else st.push({ c: l.compound, from: l.n, n: 1 }); prev = l; } return st; };
const cls = (c) => (c === "INTERMEDIATE" ? "I" : c === "WET" ? "W" : "D");

test("heavy rain: dry → intermediate → wet → intermediate → dry, each change with the water then (not straight back on noise)", async () => {
  const r = await rainRace([[8, 0], [6, 2.5], [14, 20], [10, 5], [30, 0]]);
  for (const n of ["4", "81", "16", "1"]) {
    const seq = stints(r.state.cars.find((c) => c.num === n)).map((s) => cls(s.c)).filter((x, i, a) => i === 0 || x !== a[i - 1]).join("");
    assert.match(seq, /DIWID/, `car ${n}: ${seq}`);
  }
});

test("long moderate rain: a worn intermediate is changed for a fresh one (a same-compound stop is a candidate)", async () => {
  const r = await rainRace([[8, 0], [55, 4]], { seed: 4 });   // (4 mm/h: the line settles near 0.6 mm – intermediate weather)
  const refreshed = r.state.cars.filter((c) => { const st = stints(c); return st.some((s, i) => i > 0 && s.c === "INTERMEDIATE" && st[i - 1].c === "INTERMEDIATE"); });
  assert.ok(refreshed.length >= 4, `cars with an inter → inter stop: ${refreshed.length}`);
  assert.ok(Object.values(r.state.ai.teams).some((T) => T.decisions.some((d) => /refresh/.test(d.why))), "logged as a refresh");
});

test("no wet sets in hand: heavy rain keeps the car on intermediates (no switch to a tyre it hasn't got)", async () => {
  const r = await rainRace([[8, 0], [6, 2.5], [14, 20], [4, 20]], { prep: (q) => { for (const c of q.state.cars) if (c.num === "4") c.sets = c.sets.filter((s) => s.compound !== "WET"); } });
  const c4 = r.state.cars.find((c) => c.num === "4"), c81 = r.state.cars.find((c) => c.num === "81");
  assert.ok(!stints(c4).some((s) => s.c === "WET"), stints(c4).map((s) => s.c[0]).join(""));
  assert.ok(stints(c81).some((s) => s.c === "WET"), "its teammate with wets does switch");
});

test("switchGains offers every class and the same compound on another set; a compound with no set is left out", async () => {
  const [E, , St] = await M();
  const r = E.createRace({ scenario: SC, seed: 1, ai: true }); while (r.state.t < 300000) E.step(r);
  const team = "McLaren", Mo = St.teamModel(r, team), est = r.state.ai.teams[team].est, view = St.publicView(r, team);
  const g = St.switchGains(Mo, est, view, "4", { name: "INTERMEDIATE", age: 12, fuel: 80 }, { K: 8, key: "t", setAge: (c) => (c === "HARD" ? null : 0) });
  for (const c of ["SOFT", "MEDIUM", "INTERMEDIATE", "WET"]) assert.ok(c in g, c);
  assert.ok(!("HARD" in g)); assert.ok(Number.isFinite(g.WET.gain) && Number.isFinite(g.WET.firstLap));
  const gw = St.switchGains(Mo, est, view, "4", { name: "WET", age: 5, fuel: 80 }, { K: 8, key: "t" });
  assert.ok("INTERMEDIATE" in gw && "WET" in gw);
});

test("plan rules: one admissibility rule for new plans, the present plan and shifted ones; the rain price instead of a ban", async () => {
  const [, A] = await M();
  const plan = (first, ...rest) => ({ stints: [{ compound: "MEDIUM", laps: first }, ...rest.map((c) => ({ compound: c, laps: 10 }))] });
  const base = { tyreLaps: 2, wetTyre: false, wornOut: false, scPeriod: null, scStop: null, stock: { SOFT: 1, HARD: 2 } };
  assert.strictEqual(A.planAdmissible(base, plan(1, "HARD")), false, "a stop on a 2-lap-old set");
  assert.strictEqual(A.planAdmissible({ ...base, wornOut: true }, plan(1, "HARD")), true, "…unless it is past its cliff");
  assert.strictEqual(A.planAdmissible(base, plan(4, "HARD")), true);
  assert.strictEqual(A.planAdmissible(base, plan(4, "HARD", "HARD", "HARD")), false, "needs 3 HARD sets, 2 in hand");
  assert.strictEqual(A.planAdmissible({ ...base, tyreLaps: 20, scPeriod: "sc:1", scStop: "sc:1" }, plan(1, "HARD")), false, "second stop in one SC");
  assert.strictEqual(A.planAdmissible({ ...base, tyreLaps: 5, scPeriod: "sc:1" }, plan(1, "HARD")), false, "SC stop on young tyres");
  assert.strictEqual(A.planAdmissible({ ...base, tyreLaps: 20, scPeriod: "sc:1" }, plan(1, "HARD")), true);
  // rain likely soon: a slick stop within 3 laps is charged chance × loss; a later stop or a wet tyre isn't
  assert.ok(Math.abs(A.rainStopRisk({ wetTyre: false, pSoon: 0.7 }, plan(2, "HARD"), 20) - 14) < 1e-9);
  assert.strictEqual(A.rainStopRisk({ wetTyre: false, pSoon: 0.7 }, plan(6, "HARD"), 20), 0);
  assert.strictEqual(A.rainStopRisk({ wetTyre: false, pSoon: 0.2 }, plan(2, "HARD"), 20), 0);
  assert.strictEqual(A.rainStopRisk({ wetTyre: false, pSoon: 0.9 }, plan(2, "INTERMEDIATE"), 20), 0);
});

test("the AI never cancels a player's pit call; a player plan is not replaced by the AI", async () => {
  const [E] = await M();
  const r = E.createRace({ scenario: SC, seed: 3, userTeam: "McLaren", ai: true }); while (r.state.t < 300000) E.step(r);
  assert.ok(E.command(r, { id: "call", type: "pit", car: "4", args: { compound: "HARD" } }).ok);
  const until = r.state.t + 60000; while (r.state.t < until) E.step(r);
  assert.ok(!r.state.commands.log.some((c) => c.car === "4" && c.type === "pitCancel" && c.by.startsWith("ai:")), "no AI cancel of the player's call");
  assert.strictEqual(r.state.own["4"].plan, "player");
});

test("dry race unchanged by the wet rules where nothing is wet (Hungary dry, 25 min, same as with no rain at all)", async () => {
  const [E] = await M();
  const a = E.createRace({ scenario: SC, seed: 2, ai: true }); while (a.state.t < 1500000) E.step(a);
  assert.ok(a.state.cars.every((c) => c.laps.every((l) => !/INTER|WET/.test(l.compound))));
});
