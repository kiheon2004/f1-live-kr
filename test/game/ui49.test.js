// The game screens' logic (request v0.49 §12, §13, §16; reports/ui.md): the pre-race plan editor's edits and checks, the
// plans and t = 0 orders handed to the engine, order status (queued ≠ applied; refused with a reason), the estimator's
// stale-result dropping and cache, the save queue, the save-file checks, the shared tyre list, the HUD's render-time
// snapshot, and that saving along the way doesn't change the race. Hungary 2025 fixture for anything that needs an engine.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const SC = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game/2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), "utf8"));
const R = (p) => import(path.join(__dirname, "../../src", p));
const TEAM = "McLaren";
const mine = () => SC.entries.filter((e) => e.teamKey === TEAM).map((e) => String(e.num));
const ALL = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];

test("plan edits: each returns a new plan, keeps the end at the race's lap count and the stint order valid", async () => {
  const P = await R("renderer/game/planedit.js");
  const p0 = P.planFrom([{ compound: "MEDIUM", toLap: 30 }, { compound: "HARD", toLap: 70 }]);
  const snap = JSON.stringify(p0);
  // setEnd clamps between the neighbours (never past the next stop / before the previous one)
  assert.deepStrictEqual(P.setEnd(p0, 0, 200, 70).stints.map((s) => s.toLap), [69, 70]);
  assert.deepStrictEqual(P.setEnd(p0, 0, -5, 70).stints.map((s) => s.toLap), [1, 70]);
  assert.strictEqual(P.setEnd(p0, 1, 40, 70).stints[1].toLap, 70, "the last stint's end is the finish – it doesn't move");
  // add: the longest stint split in half, the new half on another dry compound
  const p1 = P.addStint(p0, 70);
  assert.deepStrictEqual(p1.stints.map((s) => s.toLap), [30, 50, 70]);
  assert.notStrictEqual(p1.stints[2].compound, p1.stints[1].compound);
  assert.strictEqual(p1.src, "user");
  // remove: the laps go to the stint before (the first stint's to the next one)
  assert.deepStrictEqual(P.removeStint(p1, 1, 70).stints.map((s) => [s.compound, s.toLap]), [["MEDIUM", 50], [p1.stints[2].compound, 70]]);
  assert.deepStrictEqual(P.removeStint(p1, 0, 70).stints.map((s) => s.toLap), [50, 70]);
  assert.strictEqual(P.removeStint(p0, 0, 70).stints.length, 1);
  assert.strictEqual(P.removeStint(P.removeStint(p0, 0, 70), 0, 70).stints.length, 1, "the only stint stays");
  // move: the order of the tyres changes, each keeps its length
  const p2 = P.moveStint(p0, 0, +1, 70);
  assert.deepStrictEqual(p2.stints.map((s) => [s.compound, s.toLap]), [["HARD", 40], ["MEDIUM", 70]]);
  assert.deepStrictEqual(P.ranges(p2).map((r) => r.laps), [40, 30]);
  // start tyre = stint 1
  assert.strictEqual(P.setStart(p0, "SOFT").stints[0].compound, "SOFT");
  assert.strictEqual(JSON.stringify(p0), snap, "no edit changes the plan it was given");
});

test("plan checks: lap order, reaching the finish, compounds, start tyre, the season's rule, the team's same-lap stops", async () => {
  const P = await R("renderer/game/planedit.js");
  const ctx = { total: 70, compounds: ALL, rule: { minDry: 2, minSets: 1, exemptWet: true, text: "건조 2종" }, queueS: 4.4 };
  const ok = P.planFrom([{ compound: "MEDIUM", toLap: 30 }, { compound: "HARD", toLap: 70 }]);
  let V = P.validate({ a: ok }, ctx);
  assert.ok(V.ok); assert.strictEqual(V.cars.a.errors.length, 0); assert.strictEqual(V.cars.a.warnings.length, 0);
  V = P.validate({ a: { stints: [{ compound: "MEDIUM", toLap: 40 }, { compound: "HARD", toLap: 30 }, { compound: "SOFT", toLap: 70 }] } }, ctx);
  assert.ok(!V.ok && V.cars.a.errors.some((e) => e.code === "order" && e.stint === 1));
  V = P.validate({ a: { stints: [{ compound: "MEDIUM", toLap: 30 }, { compound: "HARD", toLap: 65 }] } }, ctx);
  assert.ok(!V.ok && V.cars.a.errors.some((e) => e.code === "finish"));
  V = P.validate({ a: { stints: [{ compound: "SUPERSOFT", toLap: 30 }, { compound: "HARD", toLap: 70 }] } }, ctx);
  assert.ok(!V.ok && V.cars.a.errors.some((e) => e.code === "compound" && e.stint === 0));
  V = P.validate({ a: ok }, { ...ctx, start: { a: "SOFT" } });
  assert.ok(!V.ok && V.cars.a.errors.some((e) => e.code === "start"));
  // one dry compound only: the rule (a severe warning – the race can still change the plan), exempt with a wet tyre
  V = P.validate({ a: { stints: [{ compound: "HARD", toLap: 30 }, { compound: "HARD", toLap: 70 }] } }, ctx);
  assert.ok(V.ok && V.cars.a.warnings.some((w) => w.code === "rule" && w.severe));
  V = P.validate({ a: { stints: [{ compound: "HARD", toLap: 30 }, { compound: "INTERMEDIATE", toLap: 70 }] } }, ctx);
  assert.ok(!V.cars.a.warnings.some((w) => w.code === "rule"));
  // Monaco-like 3 sets
  V = P.validate({ a: ok }, { ...ctx, rule: { minDry: 2, minSets: 3, exemptWet: true } });
  assert.ok(V.cars.a.warnings.some((w) => w.code === "rule"));
  // both cars stopping on lap 30 → a team warning naming the lap; a lap apart → none
  V = P.validate({ a: ok, b: ok }, ctx);
  assert.deepStrictEqual(V.team.map((w) => [w.code, w.lap]), [["clash", 30]]);
  V = P.validate({ a: ok, b: P.setEnd(ok, 0, 31, 70) }, ctx);
  assert.strictEqual(V.team.length, 0);
  // an empty plan
  V = P.validate({ a: { stints: [] } }, ctx);
  assert.ok(!V.ok && V.cars.a.errors.some((e) => e.code === "empty"));
});

test("to the engine: plans as createRace takes them; assist off → plan + modes as t = 0 orders, assist on → only the modes picked", async () => {
  const P = await R("renderer/game/planedit.js");
  const st = [{ compound: "MEDIUM", toLap: 30 }, { compound: "HARD", toLap: 70 }];
  const T = P.toEngine({ 81: P.planFrom(st, { assist: false, pace: "attack" }), 4: P.planFrom(st, { assist: true }) });
  assert.deepStrictEqual(T.plans["81"], { stints: st, by: "player" });
  assert.deepStrictEqual(T.orders.filter((o) => o.car === "81").map((o) => [o.type, o.args.mode ?? null]), [["plan", null], ["pace", "attack"], ["energy", "balanced"]]);
  assert.deepStrictEqual(T.orders.filter((o) => o.car === "4"), [], "assist on and nothing picked: the team AI keeps every decision");
  const T2 = P.toEngine({ 4: P.planFrom(st, { assist: true, energy: "harvest" }) });
  assert.deepStrictEqual(T2.orders.map((o) => [o.type, o.args.mode]), [["energy", "harvest"]]);
});

test("the engine takes the screen's plans and t = 0 orders: the plan raced is the player's, the orders applied at the first step", async () => {
  const E = await R("game/engine/engine.js"), P = await R("renderer/game/planedit.js"), O = await R("renderer/game/orders.js");
  const [a, b] = mine(), L = SC.race.laps;
  const plans = { [a]: P.planFrom([{ compound: "HARD", toLap: 25 }, { compound: "MEDIUM", toLap: L }], { assist: false, pace: "manage" }), [b]: P.planFrom([{ compound: "MEDIUM", toLap: 33 }, { compound: "HARD", toLap: L }], { assist: true }) };
  const T = P.toEngine(plans);
  const race = E.createRace({ scenario: SC, seed: 3, userTeam: TEAM, plans: T.plans, ai: true });
  const book = new O.OrderBook();
  T.orders.forEach((o, i) => book.add({ id: "t0-" + i, ...o }, E.command(race, { id: "t0-" + i, team: TEAM, by: "player", ...o })));
  assert.ok(book.list.every((o) => o.state === "queued"), "submitted, not yet applied");
  book.update(race); assert.ok(book.list.every((o) => o.state === "queued"), "still queued before any step");
  E.step(race); book.update(race);
  assert.ok(book.list.every((o) => o.state === "applied"), JSON.stringify(book.list));
  const ca = race.state.cars.find((c) => c.num === a), cb = race.state.cars.find((c) => c.num === b);
  assert.strictEqual(ca.tyre.name, "HARD"); assert.strictEqual(cb.tyre.name, "MEDIUM");
  assert.strictEqual(ca.mode.pace, "manage");
  for (let i = 0; i < 2400; i++) E.step(race);
  assert.deepStrictEqual(ca.plan.stints, T.plans[a].stints, "assist off: the AI hasn't touched the player's plan");
  assert.strictEqual(ca.mode.pace, "manage");
});

test("order status: queued until the engine's step; refused at submit or at the step with the reason; never 'applied' early", async () => {
  const E = await R("game/engine/engine.js"), O = await R("renderer/game/orders.js");
  const race = E.createRace({ scenario: SC, seed: 2, userTeam: TEAM });
  const other = SC.entries.find((e) => e.teamKey !== TEAM).num, [a] = mine(), book = new O.OrderBook();
  const send = (id, c) => book.add({ id, ...c }, E.command(race, { id, team: TEAM, by: "player", ...c }));
  const ok = send("o1", { type: "pace", car: a, args: { mode: "attack" } });
  const bad = send("o2", { type: "pace", car: a, args: { mode: "turbo" } });
  const notMine = send("o3", { type: "energy", car: String(other), args: { mode: "push" } });
  const dup = send("o1", { type: "pace", car: a, args: { mode: "manage" } });
  assert.strictEqual(ok.state, "queued"); assert.strictEqual(dup.state, "rejected"); assert.strictEqual(O.whyKo(dup.why), "같은 지시가 이미 접수됨");
  // (v0.49 engine: a bad mode and another team's car are refused when the order is taken – before any step)
  assert.ok(["rejected", "refused"].includes(bad.state) && bad.why, JSON.stringify(bad));
  assert.ok(["rejected", "refused"].includes(notMine.state)); assert.strictEqual(O.whyKo(notMine.why), "내 팀 차량이 아님");
  assert.strictEqual(O.orderState(race, "o1", E).state, "queued");
  E.step(race); book.update(race, E);
  assert.strictEqual(ok.state, "applied");
  assert.strictEqual(O.orderState(race, "o1", E).state, "applied");
  assert.strictEqual(book.last(a).id, "o1", "the duplicate isn't the car's last order in force");
  assert.strictEqual(book.pending(a, "pace"), null);
  // the engine's own status API wins when it exists (and "accepted" is shown as queued, never as applied)
  assert.deepStrictEqual(O.orderState(race, "x", { commandStatus: () => ({ state: "accepted" }) }).state, "queued");
  assert.strictEqual(O.whyKo("something new"), "something new");
});

test("saving along the way (engine.saveRace) leaves the race exactly as it would have run", async () => {
  const E = await R("game/engine/engine.js");
  const fp = (r) => JSON.stringify(r.state.cars.map((c) => [c.num, c.lap, +c.s.toFixed(6), +c.v.toFixed(6), c.tyre.name, +c.tyre.wear.toFixed(9), c.pit.phase, +c.energy.fuel.toFixed(6)]));
  const A = E.createRace({ scenario: SC, seed: 4, userTeam: TEAM, ai: true }), B = E.createRace({ scenario: SC, seed: 4, userTeam: TEAM, ai: true });
  let bytes = 0;
  for (let i = 1; i <= 1600; i++) { E.step(A); E.step(B); if (i % 400 === 0) bytes = E.saveRace(A).length; }
  assert.ok(bytes > 1000);
  assert.strictEqual(fp(A), fp(B));
  // and a save taken now continues like the original
  const C = E.loadRace(E.saveRace(A), SC);
  for (let i = 0; i < 600; i++) { E.step(A); E.step(C); }
  assert.strictEqual(fp(C), fp(A));
});

test("estimator: numbers for a plan, cached; a newer request makes an older one stale (dropped, never painted)", async () => {
  const E = await R("game/engine/engine.js"), S = await R("game/engine/strategy.js"), P = await R("renderer/game/planedit.js"), X = await R("renderer/game/estimator.js");
  const changes = [];
  const est = X.createEstimator({ engine: E, strat: S, delay: 0, later: (f) => setTimeout(f, 1), onChange: (e) => changes.push(e.status) });
  const [a, b] = mine(), L = SC.race.laps;
  const plans = { [a]: P.planFrom([{ compound: "MEDIUM", toLap: 28 }, { compound: "HARD", toLap: L }]), [b]: P.planFrom([{ compound: "MEDIUM", toLap: 31 }, { compound: "HARD", toLap: L }]) };
  const done = () => new Promise((res) => { const t0 = Date.now(); const f = () => (est.status === "done" || est.status === "failed" || Date.now() - t0 > 60000 ? res(est.status) : setTimeout(f, 5)); f(); });
  est.want({ sc: SC, seed: 1, team: TEAM, plans });
  // a newer request while the first is computing: the first is dropped at its next piece
  await new Promise((r) => setTimeout(r, 3));
  const plans2 = { ...plans, [a]: P.setEnd(plans[a], 0, 24, L) };
  est.want({ sc: SC, seed: 1, team: TEAM, plans: plans2 });
  assert.strictEqual(await done(), "done", est.err);
  assert.ok(est.stats.stale >= 1 || est.stats.runs === 1, JSON.stringify(est.stats));
  const r = est.planOf(SC, 1, TEAM, a, plans2[a]);
  assert.ok(r?.ok, JSON.stringify(r));
  assert.ok(Number.isFinite(r.v.mean) && r.v.mean > 3600 && r.v.mean < 3 * 3600, String(r.v.mean));
  assert.ok(r.v.sd >= 0 && r.v.p10 <= r.v.mean + 1e-9 && r.v.p90 >= r.v.mean - 30);
  assert.strictEqual(r.v.stops.length, 1); assert.strictEqual(r.v.stops[0].lap, 24);
  const w = r.v.stops[0].window; assert.ok(w && w[0] <= w[1], JSON.stringify(r.v.stops));
  const rec = est.get(SC, 1, TEAM); assert.ok(rec?.ok && rec.v.cars.length === 2 && rec.v.cars[0].best, "the recommendation");
  // the same plans again: all from the cache
  const hits = est.stats.hits; est.want({ sc: SC, seed: 1, team: TEAM, plans: plans2 }); await new Promise((r2) => setTimeout(r2, 5)); assert.strictEqual(await done(), "done");
  assert.ok(est.stats.hits >= hits + 3, JSON.stringify(est.stats));
});

test("saves go out one at a time; a newer save of a waiting slot replaces it; other slots are never dropped", async () => {
  const calls = []; let inflight = 0, maxInflight = 0; const pending = [];
  globalThis.window = { api: { game: { saves: async () => [], load: async () => null, save: (slot, d) => { inflight++; maxInflight = Math.max(maxInflight, inflight); calls.push([slot, d.n]); return new Promise((res) => pending.push(() => { inflight--; res({ ok: true, n: d.n }); })); } } } };
  const A = await R("renderer/game/gameapi.js");
  const p1 = A.save("auto", { n: 1 }), p2 = A.save("auto", { n: 2 }), p3 = A.save("slot1", { n: 3 }), p4 = A.save("auto", { n: 4 });
  const flush = async () => { for (let k = 0; k < 20 && (pending.length || A.savesPending()); k++) { await new Promise((r) => setTimeout(r, 1)); const f = pending.shift(); if (f) f(); } };
  await flush();
  const [r1, r2, r3, r4] = await Promise.all([p1, p2, p3, p4]);
  assert.deepStrictEqual(calls, [["auto", 1], ["auto", 4], ["slot1", 3]]);
  assert.strictEqual(maxInflight, 1);
  assert.strictEqual(r2.n, 4, "the replaced save answers with the newer one's result"); assert.strictEqual(r4.n, 4); assert.strictEqual(r3.n, 3); assert.strictEqual(r1.n, 1);
  delete globalThis.window;
});

test("save file checks: not a save, another state version, a race not prepared → refused; another engine build → a warning", async () => {
  const A = await R("renderer/game/gameapi.js");
  const E = { ENGINE_VERSION: "0.49.0-engine.1", STATE_VERSION: 2 }, list = [{ id: "r1" }];
  const d = { kind: "f1kr-game-save", stateVersion: 2, engine: "0.49.0-engine.1", scenarioId: "r1", race: "{}" };
  assert.deepStrictEqual(A.checkSave(d, E, list), { ok: true, warn: [] });
  assert.ok(!A.checkSave({ ...d, kind: "x" }, E, list).ok);
  assert.match(A.checkSave({ ...d, stateVersion: 1 }, E, list).why, /형식/);
  assert.match(A.checkSave({ ...d, scenarioId: "r9" }, E, list).why, /준비된 경기/);
  assert.ok(!A.checkSave({ ...d, race: undefined }, E, list).ok);
  const w = A.checkSave({ ...d, engine: "0.48.0-engine.1" }, E, list); assert.ok(w.ok && w.warn.length === 1);
  assert.strictEqual(A.scenarioIdOf("2025/2025-08-03_Hungarian_Grand_Prix/2025-08-03_Race/"), "2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race");
});

test("tyre lists: every screen list has both wet tyres even when the real race used none; never the race's own compound list", async () => {
  const U = await R("renderer/game/ui.js");
  await U.loadCompounds();
  const dry = { ...SC, tyres: { compoundsSeen: ["MEDIUM", "HARD"] } };
  const c = U.compoundsFor(dry);
  for (const x of ALL) assert.ok(c.list.includes(x), x);
  assert.ok(typeof c.source === "string" && c.source.length);
  if (!c.shared) assert.strictEqual(c.est, true, "without the shared API the list is labelled an assumption");
});

test("the HUD reads the snapshot at or before the render time, never a newer one", async () => {
  const U = await R("renderer/game/ui.js");
  const a = { t: 1000, cars: [{ tyre: { compound: "MEDIUM" }, pit: { phase: "work" } }] }, b = { t: 2000, cars: [{ tyre: { compound: "HARD" }, pit: { phase: "release" } }] };
  // (v0.50: one render-time picture – present.js – instead of the older snapshot as it is: a's discrete state, never b's)
  const h0 = U.hudSnap({ pair: () => ({ a: { ...a, flag: "green" }, b: { ...b, flag: "sc" }, renderT: 1100 }) });
  assert.strictEqual(h0.cars[0].tyre.compound, "MEDIUM"); assert.strictEqual(h0.cars[0].pit.phase, "work"); assert.strictEqual(h0.flag, "green"); assert.strictEqual(h0.t, 1100);
  assert.strictEqual(U.hudSnap({ pair: () => ({ a: null, b, renderT: 2000 }) }).cars[0].tyre.compound, "HARD");
  assert.strictEqual(U.hudSnap({ pair: () => null }), null);
  // estimates are rounded to what their spread allows
  assert.strictEqual(U.fmtEst(12.34, 25), "+10"); assert.strictEqual(U.fmtEst(12.34, 6), "+12"); assert.strictEqual(U.fmtEst(-1.26, 1), "−1.5");
});

test("prepare: progress and the end of THIS job only (an older job's late messages are dropped); a refusal said plainly", async () => {
  let listener = null; const sent = [];
  globalThis.window = { api: { game: { onPrep: (fn) => { listener = fn; return () => { listener = null; }; }, prepare: async (p) => (p === "bad" ? { ok: false, why: "캐시에 없는 경기예요" } : { ok: true, jobId: 7, sid: "x" }), prepCancel: async (id) => { sent.push(id); return { ok: true }; } } } };
  const A = await R("renderer/game/gameapi.js");
  const prog = [];
  const p = A.prepare("2025/x/y_Race/", (m) => prog.push(m.stage));
  await new Promise((r) => setTimeout(r, 2));
  listener({ jobId: 6, kind: "done", sid: "old" });          // an older job's answer
  listener({ jobId: 7, kind: "progress", stage: "read" });
  await A.cancelPrepare(); assert.deepStrictEqual(sent, [7]);
  listener({ jobId: 7, kind: "cancelled" });
  assert.deepStrictEqual(await p, { ok: false, cancelled: true, why: "취소됨" });
  assert.deepStrictEqual(prog, ["read"]);
  assert.strictEqual(listener, null, "unsubscribed at the end");
  const q = A.prepare("2025/x/z_Race/"); await new Promise((r) => setTimeout(r, 2)); listener({ jobId: 7, kind: "done", sid: "z" }); assert.deepStrictEqual(await q, { ok: true, sid: "z" });
  assert.deepStrictEqual(await A.prepare("bad"), { ok: false, why: "캐시에 없는 경기예요" });
  delete globalThis.window;
});
