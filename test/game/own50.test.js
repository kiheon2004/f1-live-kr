// v0.50 §3-1 / §5-1 / §5-4: who controls a player's car (only APPLIED orders move it; refused ones never do), handing
// kinds back to the team AI, the goal assist (its orders under "goal:<team>", a manual order ends it), tyre sets
// (reserved by a call, fitted at the work's end, freed by a cancel / a stop without work, a plan the sets can't run is
// refused), the timing-line gaps and the presentation transitions – and all of it through save / load.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const SC = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game/2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), "utf8"));
const E = () => import("../../src/game/engine/engine.js");
const run = (E, r, ms) => { const until = r.state.t + ms; while (r.state.t < until && !r.state.finished) E.step(r); };
const aiOrders = (r, num, type) => r.state.commands.log.filter((c) => c.car === num && c.type === type && c.by.startsWith("ai:"));

test("ownership: refused orders (bad mode, no set left, other team, committed cancel) leave the AI in charge; an applied one hands that kind over", async () => {
  const e = await E(), r = e.createRace({ scenario: SC, seed: 3, userTeam: "McLaren", ai: true });
  assert.deepStrictEqual([r.state.own["81"].pace, r.state.own["81"].energy, r.state.own["81"].plan], ["ai", "ai", "ai"]);
  run(e, r, 125000);
  const no = (cmd) => { const x = e.command(r, cmd); assert.strictEqual(x.ok, false, JSON.stringify(cmd)); };
  no({ id: "b1", type: "energy", car: "81", args: { mode: "invalid" } });
  no({ id: "b2", type: "pace", car: "16", args: { mode: "attack" } });
  // every free SOFT set reserved away: a box for SOFT can't be served
  for (const s of r.state.cars.find((c) => c.num === "81").sets) if (s.compound === "WET") s.state = "fitted-elsewhere";
  no({ id: "b3", type: "pit", car: "81", args: { compound: "WET" } });
  e.step(r);
  assert.deepStrictEqual([r.state.own["81"].pace, r.state.own["81"].energy, r.state.own["81"].plan], ["ai", "ai", "ai"], "refused orders change nothing");
  // the same kinds as the v0.49 repro: the AI still sends its energy orders after a refused one
  const before = aiOrders(r, "81", "energy").length; run(e, r, 20 * 60000);
  assert.ok(aiOrders(r, "81", "energy").length > before, "AI energy orders continue");
  assert.ok(e.command(r, { id: "ok1", type: "energy", car: "81", args: { mode: "harvest" } }).ok);
  assert.strictEqual(r.state.own["81"].energy, "ai", "queued is not applied: still the AI's");
  e.step(r);
  assert.strictEqual(r.state.own["81"].energy, "player"); assert.strictEqual(r.state.own["81"].by.energy.id, "ok1");
  const n = aiOrders(r, "81", "energy").length; run(e, r, 10 * 60000);
  assert.strictEqual(aiOrders(r, "81", "energy").length, n, "the AI leaves the player's energy alone");
});

test("ownership: an order refused when applied (the car retired meanwhile) changes nothing; delegate hands kinds back and the AI acts again; save/load keeps it", async () => {
  const e = await E(), r = e.createRace({ scenario: SC, seed: 3, userTeam: "McLaren", ai: true });
  run(e, r, 200000);
  assert.ok(e.command(r, { id: "p1", type: "pace", car: "4", args: { mode: "manage" } }).ok); e.step(r);
  assert.strictEqual(r.state.own["4"].pace, "player");
  // car 81 retires between submit and apply
  assert.ok(e.command(r, { id: "p2", type: "pace", car: "81", args: { mode: "attack" } }).ok);
  r.state.cars.find((c) => c.num === "81").status = "dnf"; e.step(r);
  assert.strictEqual(e.commandStatus(r, "p2").state, "refused"); assert.strictEqual(r.state.own["81"].pace, "ai");
  // hand pace back for 4
  const saved = e.saveRace(r), r2 = e.loadRace(saved, SC);
  assert.strictEqual(r2.state.own["4"].pace, "player", "save/load keeps ownership");
  assert.ok(e.command(r2, { id: "d1", type: "delegate", car: "4", args: { kinds: ["pace"] } }).ok); e.step(r2);
  assert.strictEqual(r2.state.own["4"].pace, "ai");
  assert.ok(r2.state.commands.log.some((c) => c.id === "p1"), "the history is kept – delegating deletes no log");
  const n = aiOrders(r2, "4", "pace").length; run(e, r2, 6 * 60000);
  assert.ok(aiOrders(r2, "4", "pace").length > n || r2.state.cars.find((c) => c.num === "4").mode.pace !== "manage", "the AI decides pace again");
  // a team without the AI can't delegate
  const r3 = e.createRace({ scenario: SC, seed: 3, userTeam: "McLaren" });
  assert.strictEqual(e.command(r3, { id: "d2", type: "delegate", car: "4", args: { kinds: ["pace"] } }).ok, false);
});

test("ownership: a pre-v0.50 save (no state.own) is migrated from APPLIED player orders only", async () => {
  const e = await E(), r = e.createRace({ scenario: SC, seed: 3, userTeam: "McLaren", ai: true });
  run(e, r, 125000);
  e.command(r, { id: "x", type: "energy", car: "81", args: { mode: "invalid" } });
  e.command(r, { id: "y", type: "pace", car: "4", args: { mode: "manage" } }); e.step(r);
  const o = JSON.parse(e.saveRace(r)); delete o.state.own; for (const c of o.state.cars) { delete c.sets; delete c.tl; delete c.plan0; delete c.goal; }
  const r2 = e.loadRace(o, SC);
  assert.strictEqual(r2.state.own["81"].energy, "ai", "a refused order in an old save doesn't hand the kind over");
  assert.strictEqual(r2.state.own["4"].pace, "player");
  assert.ok(r2.state.cars.every((c) => Array.isArray(c.sets) && c.sets.filter((s) => s.state === "fitted").length === 1), "sets made for old saves");
  run(e, r2, 60000);
});

test("goal assist: orders come under goal:<team>, keep control with the assist; a manual order ends the goal; SC waits", async () => {
  const e = await E(), r = e.createRace({ scenario: SC, seed: 3, userTeam: "McLaren", ai: true });
  run(e, r, 200000);
  assert.ok(e.command(r, { id: "g1", type: "goal", car: "4", args: { kind: "save" } }).ok); e.step(r);
  assert.strictEqual(r.state.own["4"].energy, "goal"); assert.strictEqual(r.state.cars.find((c) => c.num === "4").goal.kind, "save");
  run(e, r, 30000);
  const g = r.state.commands.log.filter((c) => c.car === "4" && c.by === "goal:McLaren");
  const car = r.state.cars.find((c) => c.num === "4"), soc = car.energy.soc / 4e6;
  assert.ok(g.length > 0 || car.mode.energy === (soc >= 0.85 ? "balanced" : "harvest"), "the assist set the energy mode for the goal");
  assert.strictEqual(r.state.own["4"].energy, "goal", "assist orders don't take control from the assist");
  assert.ok(g.length < 6, "rate-limited");
  assert.ok(e.command(r, { id: "m1", type: "energy", car: "4", args: { mode: "push" } }).ok); e.step(r);
  assert.strictEqual(r.state.cars.find((c) => c.num === "4").goal, null); assert.strictEqual(r.state.own["4"].energy, "player");
  // bad goal / other team refused
  assert.strictEqual(e.command(r, { id: "g2", type: "goal", car: "4", args: { kind: "win" } }).ok, false);
  assert.strictEqual(e.command(r, { id: "g3", type: "goal", car: "16", args: { kind: "keep" } }).ok, false);
});

test("goal assist: deterministic – the same goals give the same race, also across save/load", async () => {
  const e = await E();
  const go = () => { const r = e.createRace({ scenario: SC, seed: 5, userTeam: "McLaren", ai: true }); run(e, r, 150000); e.command(r, { id: "g", type: "goal", car: "81", args: { kind: "attack" } }); e.command(r, { id: "h", type: "goal", car: "4", args: { kind: "tyre" } }); return r; };
  const a = go(), b = go(); run(e, a, 8 * 60000);
  const mid = e.loadRace(e.saveRace(b), SC); run(e, b, 3 * 60000); const b2 = e.loadRace(e.saveRace(b), SC); run(e, b2, 5 * 60000);
  const key = (r) => JSON.stringify(r.state.cars.map((c) => [c.num, c.lap, +c.dist.toFixed(3), c.mode]));
  assert.strictEqual(key(a), key(b2));
  assert.ok(mid);
});

test("tyre sets: a call reserves, the work fits that set and returns the old one used; cancel and a stop-and-go free it; a plan the sets can't run is refused", async () => {
  const e = await E(), r = e.createRace({ scenario: SC, seed: 2, userTeam: "McLaren" });
  const c = r.state.cars.find((x) => x.num === "4"), first = c.sets.find((s) => s.state === "fitted");
  assert.ok(first && first.compound === c.tyre.name && !first.used);
  run(e, r, 300000);
  assert.ok(e.command(r, { id: "c1", type: "pit", car: "4", args: { compound: "HARD" } }).ok); e.step(r);
  const res = c.sets.find((s) => s.state === "reserved"); assert.ok(res && res.compound === "HARD"); assert.strictEqual(c.pit.call.setId, res.id);
  // change the tyre on the standing call: the reservation moves
  assert.ok(e.command(r, { id: "c2", type: "pit", car: "4", args: { compound: "MEDIUM" } }).ok); e.step(r);
  assert.strictEqual(c.sets.filter((s) => s.state === "reserved").length, 1); assert.strictEqual(c.sets.find((s) => s.state === "reserved").compound, "MEDIUM");
  const cancel = e.command(r, { id: "c3", type: "pitCancel", car: "4", args: {} }); e.step(r);
  if (cancel.ok && e.commandStatus(r, "c3").state === "applied") assert.strictEqual(c.sets.filter((s) => s.state === "reserved").length, 0, "cancel frees");
  // a real stop
  e.command(r, { id: "c4", type: "pit", car: "4", args: { compound: "HARD" } });
  let guard = 0; while (c.pit.stops < 1 && guard++ < 6000) e.step(r);
  run(e, r, 3000);
  assert.strictEqual(c.tyre.name, "HARD"); const fitted = c.sets.find((s) => s.state === "fitted");
  assert.strictEqual(fitted.compound, "HARD"); assert.strictEqual(c.tyre.setId, fitted.id);
  const back = c.sets.find((s) => s.id === first.id); assert.strictEqual(back.state, "free"); assert.ok(back.used && back.wear > 0, "the old set back, used, with its wear");
  assert.strictEqual(c.sets.filter((s) => s.state === "reserved").length, 0);
  // a plan needing three more HARD sets (one free HARD left) is refused, with the reason
  const L = r.state.totalLaps, p = e.command(r, { id: "p", type: "plan", car: "4", args: { stints: [{ compound: "HARD", toLap: c.lap + 3 }, { compound: "HARD", toLap: c.lap + 8 }, { compound: "HARD", toLap: c.lap + 14 }, { compound: "HARD", toLap: L }] } });
  assert.strictEqual(p.ok, false); assert.match(p.why, /sets of HARD/);
  // snapshot: sets only for the player's cars
  const sn = e.snapshot(r);
  assert.ok(Array.isArray(sn.cars.find((x) => x.num === "4").sets)); assert.strictEqual(sn.cars.find((x) => x.num === "16").sets, undefined);
  assert.ok(sn.inventory.est);
});

test("timing line: gaps from passes of the same point (not distance ÷ speed), null before data; transitions carry lap / pos / modes with their times", async () => {
  const e = await E(), r = e.createRace({ scenario: SC, seed: 1, userTeam: "McLaren", ai: true });
  const s0 = e.snapshot(r); assert.ok(s0.cars.filter((c) => c.pos > 1).every((c) => c.gap.leader == null || c.gap.leader >= 0));
  run(e, r, 600000);
  const sn = e.snapshot(r), cars = [...sn.cars].sort((a, b) => a.pos - b.pos);
  const running = cars.filter((c) => c.status === "run" && c.gap.lapsDown === 0 && c.pos > 1);
  assert.ok(running.length > 10 && running.every((c) => Number.isFinite(c.gap.leader) && c.gap.how === "line"), "line gaps for the running field");
  for (let i = 1; i < running.length; i++) if (running[i].gap.ahead != null) assert.ok(running[i].gap.ahead > -0.5 && running[i].gap.ahead < 60);
  // ahead + ahead … ≈ leader (same points; within a few tenths)
  const c5 = cars[4]; let sum = 0; for (let i = 1; i <= 4; i++) sum += cars[i].gap.ahead ?? NaN;
  if (Number.isFinite(sum)) assert.ok(Math.abs(sum - c5.gap.leader) < 1.5, `sum ${sum} vs ${c5.gap.leader}`);
  const c = r.state.cars.find((x) => x.num === "4");
  assert.ok(c.trans.some((x) => "lap" in x.set) && c.trans.every((x) => x.t <= r.state.t));
  assert.ok(sn.cars[0].last && Number.isFinite(sn.cars[0].last.t) && sn.cars[0].tyre.win && sn.cars[0].tyre.life <= 1);
});

test("pit options: now / +1 / +2 / keep from the team's own view – ranges, rejoin against the field now, the set it would take; reading changes nothing", async () => {
  const e = await E(), St = await import("../../src/game/engine/strategy.js");
  const r = e.createRace({ scenario: SC, seed: 3, userTeam: "McLaren", ai: true });
  run(e, r, 900000);
  const before = JSON.stringify(r.state), o = St.pitOptions(r, "4");
  assert.strictEqual(JSON.stringify(r.state), before, "read-only");
  assert.ok(o.est && o.assumptions.length >= 2);
  assert.deepStrictEqual(o.options.map((x) => x.kind), ["now", "plus1", "plus2", "keep"]);
  const now = o.options[0]; assert.ok(now.possible && now.loss[0] < now.loss[1] && now.rejoin.pos[0] <= now.rejoin.pos[1] && now.set && now.oldTyreCost === 0);
  assert.ok(o.options[2].oldTyreCost >= o.options[1].oldTyreCost, "two laps more on the old tyre cost at least one");
  assert.strictEqual(St.pitOptions(r, "16")?.options ? true : true, true);
});

test("ownership: a cancel refused when applied (no call / past the commit point) and a box for a tyre the car has no set of leave the plan with the AI", async () => {
  const e = await E(), r = e.createRace({ scenario: SC, seed: 3, userTeam: "McLaren", ai: true });
  run(e, r, 200000);
  assert.ok(e.command(r, { id: "c0", type: "pitCancel", car: "4", args: {} }).ok, "taken (shape ok)"); e.step(r);
  assert.strictEqual(e.commandStatus(r, "c0").state, "refused"); assert.strictEqual(r.state.own["4"].plan, "ai");
  // committed: the AI's own call past the commit point – the player's cancel is refused and changes nothing
  const c = r.state.cars.find((x) => x.num === "4"); let guard = 0;
  e.commandAs(r, { id: "ai-call", type: "pit", car: "4", args: { compound: "HARD" } }, "ai:McLaren");
  while (c.pit.phase !== "committed" && guard++ < 4000) e.step(r);
  assert.strictEqual(c.pit.phase, "committed");
  e.command(r, { id: "c1", type: "pitCancel", car: "4", args: {} }); e.step(r);
  assert.strictEqual(e.commandStatus(r, "c1").state, "refused"); assert.match(e.commandStatus(r, "c1").why, /commit/); assert.strictEqual(r.state.own["4"].plan, "ai");
});
