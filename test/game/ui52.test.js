// v0.52 game screens' pure logic (request §10-1 / §10-2; reports/ui.md): the driver panel's control state (who decides,
// the mode in force vs sent-not-yet vs selectable), one unit per quantity, short refusal reasons, why the box can't act;
// and the result's race story on one lap axis per driver (stops with their loss and team-mate queue, plan changes with the
// decider and the team AI's reason, the player's orders incl. refused ones, the largest traffic laps, flag bands, rain per
// lap) with every number marked by its source and no counterfactual text. Plus, with the Hungary 2025 fixture and the
// engine: the story built from a real engine.analysis puts the player's orders and the team AI's decisions on sane laps.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const SC = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game/2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), "utf8"));
const R = (p) => import(path.join(__dirname, "../../src", p));

test("units: seconds with one decimal and 초, gaps never 0 for no data, the tyre's rate in the same 'left' meaning", async () => {
  const H = await R("renderer/game/hudmodel.js");
  assert.strictEqual(H.fmtS(1.26), "1.3초");
  assert.strictEqual(H.fmtS(null), "–");
  assert.strictEqual(H.gapText(0.84), "0.8초");
  assert.strictEqual(H.gapText(null), "–");
  assert.strictEqual(H.gapText(-0.3), "–", "a negative interval is no data");
  assert.strictEqual(H.gapText(null, 2), "+2랩");
  assert.strictEqual(H.gapText(5, 0, true), "선두");
  assert.strictEqual(H.lifeRateText(-0.032), "랩당 −3.2%p", "life goes down: the rate is negative, in %p of the same 'left' value");
  assert.strictEqual(H.lifeRateText(null), "–");
  // the tyre's life is shown as LEFT everywhere (tyreLife): 1 − wear
  assert.strictEqual(H.tyreLife({ wear: 0.12 }).pct, "88%");
});

test("control state: who decides each kind as a chip, the mode in force vs sent-not-yet vs selectable", async () => {
  const H = await R("renderer/game/hudmodel.js");
  const own = { pace: "player", energy: "ai", plan: "goal" };
  assert.deepStrictEqual([H.ownChip(own, "pace").text, H.ownChip(own, "energy").text, H.ownChip(own, "plan").text], ["직접", "AI", "목표"]);
  assert.strictEqual(H.ownChip(own, "pace").cls, "gc-own own-player", "class names never collide with global ones (.player is the live replay bar)");
  assert.match(H.ownChip(own, "energy").tip, /팀 AI/);
  assert.strictEqual(H.ownChip(null, "pace").key, null, "no ownership data: not guessed");
  const b = H.modeButtons(["manage", "balanced", "attack"], "balanced", "attack");
  assert.deepStrictEqual(b.map((x) => [x.v, x.inForce, x.pending]), [["manage", false, false], ["balanced", true, false], ["attack", false, true]]);
  assert.ok(!H.modeButtons(["a", "b"], "a", "a").some((x) => x.pending), "a sent mode equal to the one in force is not pending");
  assert.ok(H.modeButtons(["a", "b"], "a", null, true).every((x) => x.disabled), "a car out: every button disabled, none removed");
  assert.strictEqual(H.modeLine("균형", "AI", "공격"), "균형 · AI → 공격 대기");
  assert.strictEqual(H.modeLine("공격", "직접", null), "공격 · 직접");
});

test("short reasons: a refusal is cut near a word with the whole text kept for the tooltip; why the box can't act", async () => {
  const H = await R("renderer/game/hudmodel.js");
  assert.strictEqual(H.clip("짧은 이유"), "짧은 이유");
  const long = "피트 진입 확정 지점을 지나 취소할 수 없음 그리고 더 긴 설명";
  const c = H.clip(long, 20); assert.ok(c.length <= 21 && c.endsWith("…") && long.startsWith(c.slice(0, -1)));
  assert.strictEqual(H.boxBlocked({ status: "run", pit: { phase: "none" } }, { ok: true }), null);
  assert.strictEqual(H.boxBlocked({ status: "run", pit: { phase: "called" } }, { ok: false, why: "x" }), null, "a standing call can change its tyre");
  assert.strictEqual(H.boxBlocked({ status: "run", pit: { phase: "committed" } }, { ok: true }), "진입 확정 – 변경 불가");
  assert.strictEqual(H.boxBlocked({ status: "run", pit: { phase: "work" } }, { ok: true }), "피트레인 안");
  assert.strictEqual(H.boxBlocked({ status: "dnf", pit: { phase: "none" } }, { ok: true }), "리타이어");
  assert.match(H.boxBlocked({ status: "run", pit: { phase: "none" } }, { ok: false, why: "미디엄 세트가 남지 않았어요" }), /세트/);
});

// a small analysis car: 20 laps of 90 s from lights out at 5 s; a stop at the end of lap 8 (S→I, queue 3.2 s), another
// at 15 (I→M); the AI re-planned at lap 7 (crossover) and the player changed the plan at lap 12; one refused order
const lapsOf = (n, comp) => Array.from({ length: n }, (_, i) => ({ n: i + 1, t: 90, compound: comp(i + 1), pit: i + 1 === 8 || i + 1 === 15 }));
const T0 = 5000, tAt = (lap, f = 0.5) => T0 + (lap - 1 + f) * 90000;
const CAR = {
  num: "16", laps: lapsOf(20, (l) => (l <= 8 ? "SOFT" : l <= 15 ? "INTERMEDIATE" : "MEDIUM")),
  stints: [{ compound: "SOFT", fromLap: 1, toLap: 8 }, { compound: "INTERMEDIATE", fromLap: 9, toLap: 15 }, { compound: "MEDIUM", fromLap: 16, toLap: 20 }],
  plans: [{ t: 0, lap: 0, by: "pre-race", stints: [{ compound: "SOFT", toLap: 10 }, { compound: "HARD", toLap: 20 }] },
    { t: tAt(7) + 50, lap: 7, by: "ai:Ferrari", stints: [{ compound: "SOFT", toLap: 8 }, { compound: "INTERMEDIATE", toLap: 20 }] },
    { t: tAt(12), lap: 12, by: "player", stints: [{ compound: "SOFT", toLap: 8 }, { compound: "INTERMEDIATE", toLap: 15 }, { compound: "MEDIUM", toLap: 20 }] }],
  ai: [{ t: tAt(7), lap: 7, why: "lap,crossover", plan: "→INTERMEDIATE", gain: 28.5 }, { t: tAt(3), lap: 3, why: "lap", plan: "S10-H20", gain: 0.4 }],
  orders: [{ t: tAt(12), tEff: tAt(12) + 50, type: "plan", args: {}, by: "player", ok: true }, { t: tAt(16), tEff: tAt(16) + 50, type: "pitCancel", args: {}, by: "player", ok: false, why: "no call to cancel" },
    { t: tAt(5), tEff: tAt(5) + 50, type: "pace", args: { mode: "manage" }, by: "goal:Ferrari", ok: true }],
  pitParts: [{ lap: 8, loss: 24.1, queue: 3.2, stationary: 2.4, rest: 18.5 }, { lap: 15, loss: 21.0, queue: 0, stationary: 2.2, rest: 18.8 }],
  traffic: Array.from({ length: 20 }, (_, i) => ({ lap: i + 1, loss: i + 1 === 4 ? 4.5 : i + 1 === 11 ? 2.2 : i + 1 === 9 ? 1.4 : 0.2 })),
  trafficTotal: 11.7, pitTotal: 45.1,
};
const FLAGS = [{ t: T0, type: "lightsOut" }, { t: tAt(13, 0.2), type: "sc" }, { t: tAt(14, 0.6), type: "green" }];
const WX = Array.from({ length: 200 }, (_, i) => ({ t: T0 + i * 10000, rain: i * 10000 > 5.5 * 90000 && i * 10000 < 12.2 * 90000 ? 2.5 : 0, water: null }));

test("race story: stops, decisions with their decider and reason, orders, traffic peaks, flags and rain on the car's laps", async () => {
  const H = await R("renderer/game/hudmodel.js");
  assert.strictEqual(H.lapAtT(CAR.laps, tAt(12), T0), 12);
  assert.strictEqual(H.lapAtT(CAR.laps, 1e12, T0), 21, "after the last record: the next lap");
  const S = H.raceStory(CAR, { flags: FLAGS, total: 20, weather: WX });
  assert.deepStrictEqual(S.pits.map((p) => [p.lap, p.from, p.to, p.queue]), [[8, "SOFT", "INTERMEDIATE", 3.2], [15, "INTERMEDIATE", "MEDIUM", 0]]);
  assert.ok(Math.abs(S.queueTotal - 3.2) < 1e-9);
  assert.deepStrictEqual(S.changes.map((c) => [c.lap, c.who]), [[7, "팀 AI"], [12, "나"]]);
  assert.match(S.changes[0].why, /건조·우천 타이어 교차/, "the AI decision that made the plan gives its reason");
  assert.strictEqual(S.changes[0].gain, 28.5);
  assert.deepStrictEqual(S.aiOther.map((d) => d.lap), [3], "an AI decision without a plan order of its own stays visible");
  assert.deepStrictEqual(S.orders.map((o) => [o.lap, o.who, o.ok]), [[12, "나", true], [16, "나", false], [5, "목표 보조", true]]);
  assert.deepStrictEqual(S.top.map((t) => t.lap), [4, 11, 9], "the largest traffic laps, ≥ 1 s, biggest first");
  assert.deepStrictEqual(S.bands, [{ type: "sc", from: 13, to: 14 }]);
  assert.deepStrictEqual(S.rainy, [{ from: 6, to: 13 }]);
  assert.deepStrictEqual(S.onWet, [{ from: 9, to: 15 }]);
  assert.strictEqual(S.hasWater, false, "water not sampled: said as unknown, not 0");
  const rows = H.storyRows(S, (x) => x.type);
  assert.ok(rows.every((r, i) => !i || rows[i - 1].lap <= r.lap), "one table by lap");
  const pit = rows.find((r) => r.kind === "pit" && r.lap === 8);
  assert.strictEqual(pit.src, "measured"); assert.match(pit.num, /손실 24\.1초 · 동료 대기 3\.2초/); assert.strictEqual(pit.bad, true);
  const ai = rows.find((r) => r.kind === "plan" && r.lap === 7);
  assert.strictEqual(ai.src, "estimate", "the AI's expected gain is an estimate made at the time, labelled so");
  assert.match(ai.num, /AI 기대 \+28\.5초/);
  assert.strictEqual(rows.find((r) => r.kind === "plan" && r.lap === 12).src, "record");
  assert.ok(rows.find((r) => r.kind === "order" && r.lap === 16).refused);
  assert.match(rows.find((r) => r.kind === "traffic" && r.lap === 9).text, /피트 랩/, "traffic on a pit lap is said to be one");
  assert.ok(rows.some((r) => r.kind === "flag" && /세이프티카 13–14랩/.test(r.text)));
  assert.ok(rows.some((r) => r.kind === "wx" && /비 6–13랩/.test(r.text)));
  // the goal assist's many small orders fold into one row per unbroken run, with the count and the laps
  const many = { ...CAR, orders: [...CAR.orders, ...[5.2, 5.6, 6.1].map((l) => ({ t: tAt(Math.floor(l), l % 1), tEff: tAt(Math.floor(l), l % 1) + 50, type: "energy", args: { mode: "push" }, by: "goal:Ferrari", ok: true }))] };
  const gr = H.storyRows(H.raceStory(many, { flags: FLAGS, total: 20, weather: WX }), (x) => x.type).filter((r) => r.kind === "goalrun");
  assert.strictEqual(gr.length, 1, "lap 6's rain row breaks the run: lap 5's three orders fold, lap 6's one stays a single row");
  assert.strictEqual(gr[0].n, 3); assert.deepStrictEqual([gr[0].lap, gr[0].lapTo], [5, 5]); assert.match(gr[0].text, /목표 보조 지시 3회/);
  // no counterfactual words anywhere
  assert.ok(!rows.some((r) => /했다면|였다면|우승|would/.test(r.text + r.num)));
  assert.strictEqual(H.raceStory(null), null);
});

test("race story from the engine: the player's orders and the team AI's decisions land on sane laps of that car", async () => {
  const E = await R("game/engine/engine.js"), H = await R("renderer/game/hudmodel.js");
  const team = "Ferrari", num = String(SC.entries.find((e) => e.teamKey === team).num);
  const race = E.createRace({ scenario: SC, seed: 2, userTeam: team, ai: true });
  while (race.state.t < 300000) E.step(race);
  assert.ok(E.command(race, { id: "u52-pace", type: "pace", car: num, team, args: { mode: "manage" }, by: "player" }).ok);
  assert.ok(E.command(race, { id: "u52-cancel", type: "pitCancel", car: num, team, args: {}, by: "player" }).ok, "submitted (refused later: no call)");
  while (race.state.t < 420000) E.step(race);
  const A = E.analysis(race), S = H.raceStory(A.cars[num], { flags: A.flags, total: A.totalLaps, weather: [] });
  const lapNow = race.state.cars.find((c) => c.num === num).lap;
  assert.ok(S.orders.length >= 2);
  for (const o of S.orders) assert.ok(o.lap >= 1 && o.lap <= lapNow + 1, `order on lap ${o.lap} (car on ${lapNow})`);
  assert.ok(S.orders.some((o) => o.type === "pitCancel" && !o.ok), "the refused order is kept, marked refused");
  for (const c of [...S.changes, ...S.aiOther]) assert.ok(c.lap >= 0 && c.lap <= lapNow + 1);
  assert.strictEqual(S.hasRain, false, "no weather series given: rain unknown, not 'dry'");
});
