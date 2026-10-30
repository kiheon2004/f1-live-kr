// The v0.50 game screens' pure logic (request §9, §5-1 … §5-4, §5-6, §3-5; reports/gameui.md): how gaps, lap times, tyre
// state, fuel margin, sets and a box call are said; the in-race plan editor's edits and checks; goal reasons; alert
// settings; the menu's safe area; season words (no DRS in 2026). Plus, with the Hungary 2025 fixture and the engine: the
// in-race editor's plan is accepted by the engine as an order, and the UI's set choice is the engine's own.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const SC = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game/2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), "utf8"));
const R = (p) => import(path.join(__dirname, "../../src", p));

test("gaps and lap times: no data is '–' (never +0.0), lapped cars say laps, the delta is to the car's own best", async () => {
  const H = await R("renderer/game/hudmodel.js");
  assert.strictEqual(H.fmtGap(null), "–");
  assert.strictEqual(H.fmtGap(undefined), "–");
  assert.strictEqual(H.fmtGap(0.04), "+0.0");
  assert.strictEqual(H.fmtGap(1.26), "+1.3");
  assert.strictEqual(H.fmtGap(null, 2), "+2랩");
  assert.strictEqual(H.fmtLapT(81.2345), "1:21.234");
  assert.strictEqual(H.fmtLapT(null), "–");
  assert.strictEqual(H.lapDelta({ n: 5, t: 81.5 }, { n: 3, t: 81.25 }), "+0.250");
  assert.strictEqual(H.lapDelta({ n: 5, t: 81.0 }, { n: 5, t: 81.0 }), "", "the last lap IS the best: no delta");
  assert.strictEqual(H.lapDelta(null, { n: 1, t: 80 }), "");
  // the gap behind: the next car's own interval
  const cars = [{ num: "1", pos: 1, gap: { ahead: null } }, { num: "2", pos: 2, gap: { ahead: 0.8 } }, { num: "3", pos: 3, gap: { ahead: null, aheadLaps: 1 } }];
  assert.strictEqual(H.gapBehind(cars, "1").g, 0.8);
  assert.strictEqual(H.gapBehind(cars, "2").laps, 1);
  assert.strictEqual(H.gapBehind(cars, "3").car, null);
});

test("tyre: temperature state from the engine's window, life bar = 1 − wear everywhere, missing data said as such", async () => {
  const H = await R("renderer/game/hudmodel.js");
  const win = { lo: 90, hi: 110 };
  assert.strictEqual(H.tyreTemp({ Tw: 80, win }).key, "cold");
  assert.strictEqual(H.tyreTemp({ Tw: 80, win }).by, 10);
  assert.strictEqual(H.tyreTemp({ Tw: 100, win }).key, "ok");
  assert.strictEqual(H.tyreTemp({ Tw: 117, win }).label, "과열");
  assert.strictEqual(H.tyreTemp({ Tw: null, win }).key, null);
  assert.strictEqual(H.tyreTemp({ Tw: 100 }).label, "온도 자료 없음");
  assert.deepStrictEqual([H.tyreLife({ life: 0.72 }).pct, H.tyreLife({ life: 0.72 }).cls], ["72%", "ok"]);
  assert.strictEqual(H.tyreLife({ wear: 0.6 }).pct, "40%", "from wear when life is missing – the same direction");
  assert.strictEqual(H.tyreLife({ wear: 0.75 }).cls, "bad");
  assert.strictEqual(H.tyreLife({}).life, null);
  assert.strictEqual(H.perLap([{ lap: 1, v: 0.9 }, { lap: 2, v: 0.87 }, { lap: 3, v: 0.84 }]).toFixed(3), "-0.030");
  assert.strictEqual(H.perLap([{ lap: 1, v: 0.9 }]), null);
});

test("fuel margin: from the car's own burn, null until enough laps, negative when short", async () => {
  const H = await R("renderer/game/hudmodel.js");
  assert.strictEqual(H.fuelMargin([{ lap: 1, fuel: 100 }], 100, 1, 70), null);
  const h = [{ lap: 1, fuel: 100 }, { lap: 2, fuel: 98.5 }, { lap: 3, fuel: 97 }];
  const m = H.fuelMargin(h, 97, 3, 70);
  assert.strictEqual(m.per, 1.5); assert.strictEqual(+m.need.toFixed(1), 100.5); assert.strictEqual(m.ok, false); assert.ok(m.marginLaps < 0);
  assert.ok(H.fuelMargin(h, 97, 3, 50).ok);
});

test("tyre sets: stock per compound, the set the engine would fit (new first, then least worn), the box preview", async () => {
  const H = await R("renderer/game/hudmodel.js");
  const sets = [
    { id: "16-S1", compound: "SOFT", used: false, laps: 0, wear: 0, state: "free" },
    { id: "16-S3", compound: "SOFT", used: true, laps: 3, wear: 0.05, state: "free" },
    { id: "16-M1", compound: "MEDIUM", used: false, laps: 0, wear: 0, state: "fitted" },
    { id: "16-H1", compound: "HARD", used: true, laps: 12, wear: 0.3, state: "free" },
    { id: "16-H2", compound: "HARD", used: true, laps: 5, wear: 0.1, state: "free" },
    { id: "16-H3", compound: "HARD", used: false, laps: 0, wear: 0, state: "reserved" },
  ];
  const st = H.setStock(sets);
  assert.deepStrictEqual(st.by.SOFT, { free: 2, fresh: 1, used: 1, reserved: 0 });
  assert.strictEqual(st.by.HARD.reserved, 1);
  assert.strictEqual(st.fitted.id, "16-M1");
  assert.strictEqual(H.pickSet(sets, "SOFT").id, "16-S1", "a new set first");
  assert.strictEqual(H.pickSet(sets, "HARD").id, "16-H2", "else the least worn");
  assert.strictEqual(H.pickSet(sets, "WET"), null);
  // the same choice as the engine's inventory.js pickFree
  const INV = await R("game/engine/inventory.js");
  for (const c of ["SOFT", "MEDIUM", "HARD", "WET"]) assert.strictEqual(H.pickSet(sets, c)?.id ?? null, INV.pickFree(sets, c)?.id ?? null, c);
  // box preview: set, stock, cancel window, the team-mate's queue risk when both stop together and run close
  const car = { num: "16", status: "run", lap: 20, pit: { phase: "none" }, sets, gap: { leader: 10 } };
  const mate = { num: "44", tla: "HAM", status: "run", lap: 20, pit: { phase: "none" }, gap: { leader: 12.5 }, plan: { stints: [{ compound: "MEDIUM", toLap: 21 }, { compound: "HARD", toLap: 70 }] } };
  const p = H.boxPreview(car, mate, "SOFT");
  assert.strictEqual(p.set.id, "16-S1"); assert.strictEqual(p.left, 2); assert.ok(p.ok);
  assert.match(p.cancel, /취소 가능/);
  assert.strictEqual(p.mate.risk, "high"); assert.match(p.mate.text, /HAM.*2\.5초/);
  assert.strictEqual(H.boxPreview(car, { ...mate, gap: { leader: 30 } }, "SOFT").mate.risk, "low");
  assert.strictEqual(H.boxPreview({ ...car, pit: { phase: "committed" } }, null, "SOFT").cancel, "진입 확정 · 취소 불가");
  const none = H.boxPreview(car, null, "WET");
  assert.strictEqual(none.ok, false); assert.match(none.why, /웨트 세트/);
  assert.strictEqual(H.boxPreview({ ...car, status: "dnf" }, null, "SOFT").ok, false);
});

test("in-race plan editor: done stints locked, the current tyre fixed, the next stop not before next lap; checks", async () => {
  const H = await R("renderer/game/hudmodel.js");
  const st = [{ compound: "MEDIUM", toLap: 20 }, { compound: "HARD", toLap: 45 }, { compound: "HARD", toLap: 70 }];
  const snap = JSON.stringify(st);
  assert.strictEqual(H.curStint(st, 10), 0); assert.strictEqual(H.curStint(st, 20), 1); assert.strictEqual(H.curStint(st, 69), 2);
  // end moves: not before lap + 1, not past the next stop − 1, a done stint never
  assert.strictEqual(H.liveSetEnd(st, 0, 5, 12, 70)[0].toLap, 13);
  assert.strictEqual(H.liveSetEnd(st, 0, 60, 12, 70)[0].toLap, 44);
  assert.strictEqual(H.liveSetEnd(st, 0, 30, 25, 70)[0].toLap, 20, "a done stint doesn't move");
  assert.strictEqual(H.liveSetEnd(st, 2, 50, 12, 70)[2].toLap, 70, "the last stint ends at the finish");
  // compound: the fitted (current) one can't change
  assert.strictEqual(H.liveSetCompound(st, 0, "SOFT", 12)[0].compound, "MEDIUM");
  assert.strictEqual(H.liveSetCompound(st, 1, "SOFT", 12)[1].compound, "SOFT");
  // add / remove
  const add = H.liveAdd(st, 12, 70);
  assert.strictEqual(add.length, 4); assert.strictEqual(add[add.length - 1].toLap, 70);
  assert.ok(add.every((s, i) => !i || s.toLap > add[i - 1].toLap));
  assert.strictEqual(H.liveRemove(st, 0, 12, 70).length, 3, "the current stint can't go");
  assert.deepStrictEqual(H.liveRemove(st, 1, 12, 70), [{ compound: "MEDIUM", toLap: 45 }, { compound: "HARD", toLap: 70 }]);
  // an alternative put into the plan: stop now, or a new stop when none was left
  assert.deepStrictEqual(H.liveStopAt(st, 15, 16, "SOFT", 70).slice(0, 2), [{ compound: "MEDIUM", toLap: 16 }, { compound: "SOFT", toLap: 45 }]);
  assert.deepStrictEqual(H.liveStopAt([{ compound: "HARD", toLap: 70 }], 30, 31, "MEDIUM", 70), [{ compound: "HARD", toLap: 31 }, { compound: "MEDIUM", toLap: 70 }]);
  assert.strictEqual(JSON.stringify(st), snap, "no edit changes the stints it was given");
  // checks: sets in hand (the engine refuses a plan its sets can't serve), the rule, the order
  const ok = H.liveCheck(st, { lap: 12, total: 70, stock: { HARD: 2 }, rule: { minDry: 2, text: "2종" } });
  assert.ok(ok.ok, JSON.stringify(ok));
  const short = H.liveCheck(st, { lap: 12, total: 70, stock: { HARD: 1 } });
  assert.strictEqual(short.ok, false); assert.match(short.errors[0], /하드 세트 부족 – 필요 2, 남은 1/);
  const rule = H.liveCheck([{ compound: "HARD", toLap: 30 }, { compound: "HARD", toLap: 70 }], { lap: 5, total: 70, stock: { HARD: 2 }, rule: { minDry: 2, text: "2종" } });
  assert.ok(rule.ok && rule.warnings.some((w) => /규정/.test(w)));
  assert.strictEqual(H.liveCheck([{ compound: "HARD", toLap: 30 }, { compound: "HARD", toLap: 60 }], { lap: 5, total: 70 }).ok, false, "must end at the finish");
  assert.ok(H.sameStints(st, JSON.parse(snap))); assert.ok(!H.sameStints(st, add));
  assert.strictEqual(H.stintsText(st), "M20·H45·H");
});

test("in-race plan: the editor's plan goes to the engine as a 'plan' order and is applied (the order door, not a back way)", async () => {
  const E = await R("game/engine/engine.js"), H = await R("renderer/game/hudmodel.js");
  const team = "McLaren", num = SC.entries.find((e) => e.teamKey === team).num;
  const race = E.createRace({ scenario: SC, seed: 3, userTeam: team, ai: true });
  while (race.state.t < 240000) E.step(race);
  const car = E.snapshot(race).cars.find((c) => c.num === String(num));
  assert.ok(car.plan && Array.isArray(car.sets) && car.own, "own-team cars carry plan / sets / own in the snapshot");
  const stock = {}; for (const s of car.sets) if (s.state === "free" || s.state === "reserved") stock[s.compound] = (stock[s.compound] || 0) + 1;
  const draft = H.liveSetEnd(car.plan.stints, 0, car.lap + 4, car.lap, race.state.totalLaps);
  assert.ok(H.liveCheck(draft, { lap: car.lap, total: race.state.totalLaps, stock }).ok);
  const r = E.command(race, { id: "t-plan-1", type: "plan", car: String(num), team, args: { stints: draft }, by: "player" });
  assert.ok(r.ok, JSON.stringify(r));
  for (let i = 0; i < 4; i++) E.step(race);
  const after = E.snapshot(race).cars.find((c) => c.num === String(num));
  assert.deepStrictEqual(after.plan.stints.map((s) => s.toLap), draft.map((s) => s.toLap));
  assert.strictEqual(after.own.plan, "player", "a plan order takes the plan from the AI");
});

test("goals, control and season words", async () => {
  const H = await R("renderer/game/hudmodel.js");
  assert.deepStrictEqual(H.GOALS, ["keep", "attack", "defend", "tyre", "save"], "only the goals the engine models (no fuel goal)");
  assert.strictEqual(H.goalWhy({ code: "attack", gap: 0.84, car: "4" }, (n) => "NOR"), "앞차 NOR 0.8초 – 압박");
  assert.match(H.goalWhy({ code: "tyreLimit", life: 0.22 }), /22%/);
  assert.match(H.goalWhy({ code: "flag", flag: "sc" }), /세이프티카/);
  assert.strictEqual(H.goalWhy({ code: "zzz" }), "");
  assert.strictEqual(H.ownText({ pace: "player", energy: "ai", plan: "goal" }, "pace"), "직접");
  assert.strictEqual(H.ownText({ pace: "player", energy: "ai", plan: "goal" }, "plan"), "목표");
  assert.strictEqual(H.ownText(null, "pace"), null, "no ownership data: nothing shown (not a guess)");
  // 2026: no DRS words, Boost / Overtake; ≤ 2025: 사용 / 최대 사용
  assert.strictEqual(H.energyKo(2026).push, "부스트"); assert.strictEqual(H.energyKo(2026).overtake, "오버테이크");
  assert.strictEqual(H.energyKo(2025).overtake, "최대 사용");
  assert.ok(!/DRS/.test(H.zoneKo(2026, 2))); assert.match(H.zoneKo(2025, 2), /DRS 구간 2/);
  assert.match(H.aiWhyKo("flag:sc,plannedStopTyre"), /세이프티카 · 계획 피트의 타이어 변경/);
  assert.strictEqual(H.aiWhyKo("rivalStop:16"), "경쟁 차량 피트");
  assert.strictEqual(H.byKo("ai:McLaren"), "팀 AI");
  assert.deepStrictEqual(H.planVsActual([{ compound: "M", toLap: 20 }, { compound: "H", toLap: 70 }], [{ compound: "M", toLap: 20 }, { compound: "H", toLap: 70 }]), ["계획대로 진행"]);
  assert.deepStrictEqual(H.planVsActual([{ compound: "MEDIUM", toLap: 20 }, { compound: "HARD", toLap: 70 }], [{ compound: "MEDIUM", toLap: 24 }, { compound: "SOFT", toLap: 50 }, { compound: "SOFT", toLap: 70 }]),
    ["피트 1회 계획 → 실제 2회", "1번째 피트 20랩 → 24랩", "2번째 스틴트 하드 → 소프트"]);
});

test("alert settings: one row per moment; the pit scene slow-down folded into myPit so the two can't both act", async () => {
  const H = await R("renderer/game/hudmodel.js"), A = await R("renderer/game/alerts.js");
  const S = { alerts: A.defaultAlertSettings(), pitSlow: false };
  H.applyAction(S, "myPit", "scene");
  assert.strictEqual(S.pitSlow, true); assert.strictEqual(S.alerts.myPit, "note", "the alert itself only notes while the scene slows");
  assert.strictEqual(H.actionOf("myPit", S), "scene");
  H.applyAction(S, "myPit", "pause");
  assert.strictEqual(S.pitSlow, false); assert.strictEqual(S.alerts.myPit, "pause");
  H.applyAction(S, "rain", "off"); assert.strictEqual(S.alerts.rain, "off");
  H.applyAction(S, "rain", "explode"); assert.strictEqual(S.alerts.rain, "off", "an unknown action changes nothing");
  assert.strictEqual(H.noticeCls(3), "bad"); assert.strictEqual(H.noticeCls(1), "info");
});

test("menu safe area and the lap axis", async () => {
  const H = await R("renderer/game/hudmodel.js");
  const f = H.safeFrac(1280, 300, 330);
  assert.ok(Math.abs(f.left - 328 / 1280) < 1e-9 && Math.abs(f.right - 358 / 1280) < 1e-9);
  assert.strictEqual(H.safeFrac(1280, 300, 0).right, 0, "no right column: nothing reserved");
  assert.strictEqual(H.safeFrac(500, 400, 400).left, 0.6, "clamped");
  assert.strictEqual(H.lapPct(35, 70), "50.000%"); assert.strictEqual(H.lapPct(90, 70), "100.000%");
  const fc = H.forecastOnLaps([{ from: 0, to: 900000, pRain: 0.1 }, { from: 900000, to: 1800000, pRain: 0.5 }], 90, 70);
  assert.strictEqual(fc.length, 2); assert.strictEqual(fc[0].to, 10); assert.strictEqual(fc[1].from, 10);
  assert.deepStrictEqual(H.forecastOnLaps([], 90, 70), []); assert.deepStrictEqual(H.forecastOnLaps([{ from: 0, to: 1, pRain: 1 }], null, 70), []);
  // pre-race sets: each stint a set
  const sets = [{ compound: "MEDIUM" }, { compound: "MEDIUM" }, { compound: "HARD" }, { compound: "HARD" }];
  assert.deepStrictEqual(H.setsShort({ stints: [{ compound: "MEDIUM" }, { compound: "HARD" }, { compound: "HARD" }] }, sets), []);
  assert.deepStrictEqual(H.setsShort({ stints: [{ compound: "HARD" }, { compound: "HARD" }, { compound: "HARD" }] }, sets), [{ compound: "HARD", need: 3, have: 2 }]);
  assert.strictEqual(H.setsShort({ stints: [] }, null), null);
});

test("order reasons in Korean, with the numbers the engine gives", async () => {
  const O = await R("renderer/game/orders.js");
  assert.strictEqual(O.whyKo("plan needs 3 sets of HARD, 2 left"), "계획에 하드 세트 3개 필요 – 2개 남음");
  assert.strictEqual(O.whyKo("no set of SOFT left"), "소프트 세트가 남지 않음");
  assert.strictEqual(O.whyKo("no team AI for this car"), "이 차는 팀 AI가 운영하지 않음");
  assert.strictEqual(O.whyKo("unknown goal fly"), "알 수 없는 목표");
  assert.strictEqual(O.whyKo("something new"), "something new", "an unknown reason is shown as it is");
});
