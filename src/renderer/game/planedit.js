// The pre-race plan the player edits (request §12) – pure data and checks, no DOM, no engine calls (tested in node).
//
// One car's plan: { stints: [{ compound, toLap }], pace, energy, assist, src }
//   stints  the engine's own plan form (createRace({ plans }) / the "plan" order): each stint ends at its in-lap toLap, the
//           last one at the race's lap count. The start tyre IS stint 1's compound – there is no second copy of it to
//           drift apart (the check below still catches a plan that comes in from elsewhere with the two different).
//   pace    the initial pace order ("attack" | "balanced" | "manage") or null = left to the team AI
//   energy  the initial energy order ("harvest" | "balanced" | "push" | "overtake") or null = left to the team AI
//   assist  true: the team AI may re-plan this car's stops and set its modes during the race (until the player gives that
//           kind of order – ai.js `touched`); false: the plan and the modes are the player's from lap 1
//   src     where the plan came from: "default" (the engine's plain plan), "user" (edited), "rec:<key>" (a recommendation
//           the player chose to apply) – a label only; nothing ever replaces a plan on its own
//
// Every edit returns a NEW plan (the screen keeps the old one for undo-free comparison and never mutates in place).
export const DRY = ["SOFT", "MEDIUM", "HARD"], WETS = ["INTERMEDIATE", "WET"];
export const PACE_MODES = ["manage", "balanced", "attack"], ENERGY_MODES = ["harvest", "balanced", "push", "overtake"];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const copy = (p) => ({ ...p, stints: p.stints.map((s) => ({ ...s })) });

// the engine's default plan for a car (engine.defaultPlan when given), as an editable plan
export function planFrom(stints, { src = "default", pace = null, energy = null, assist = true } = {}) {
  return { stints: stints.map((s) => ({ compound: s.compound, toLap: s.toLap | 0 })), pace, energy, assist, src };
}

// stints with their lap ranges: [{ compound, from (first lap), to (in-lap), laps }]
export function ranges(plan) {
  let prev = 0;
  return plan.stints.map((s) => { const r = { compound: s.compound, from: prev + 1, to: s.toLap, laps: s.toLap - prev }; prev = s.toLap; return r; });
}
// the stop laps (in-laps of every stint but the last)
export const stopLaps = (plan) => plan.stints.slice(0, -1).map((s) => s.toLap);
// a short key for a plan's stints ("M30-H70") – cache keys, comparing with a recommendation
export const planKey = (plan) => plan.stints.map((s) => `${(s.compound || "?")[0]}${s.toLap}`).join("-");
export const sameStints = (a, b) => !!a && !!b && planKey(a) === planKey(b);

// ---------- edits ----------
const edited = (p) => { p.src = "user"; return p; };
// the start tyre = stint 1's compound
export function setStart(plan, compound) { const p = copy(plan); p.stints[0].compound = compound; return edited(p); }
export function setCompound(plan, i, compound) { const p = copy(plan); if (p.stints[i]) p.stints[i].compound = compound; return edited(p); }
// move stint i's end (its in-lap) – kept between the previous stint's end + 1 and the next one's end − 1 so the order stays
// valid while dragging; the last stint's end is the race's end and doesn't move
export function setEnd(plan, i, lap, total) {
  const p = copy(plan); if (i < 0 || i >= p.stints.length - 1) return p;
  const lo = (i ? p.stints[i - 1].toLap : 0) + 1, hi = p.stints[i + 1].toLap - 1;
  if (lo > hi) return p;
  p.stints[i].toLap = clamp(Math.round(lap), lo, hi); p.stints[p.stints.length - 1].toLap = total;
  return edited(p);
}
// one more stop: the longest stint is split in half; the new (second) half gets `compound` or another dry tyre than the
// split one's (a plan with one dry compound breaks the usual rule)
export function addStint(plan, total, compound = null) {
  const p = copy(plan), R = ranges(p);
  let k = 0; R.forEach((r, j) => { if (r.laps > R[k].laps) k = j; });
  if (R[k].laps < 2) return p;
  const mid = R[k].from - 1 + Math.floor(R[k].laps / 2), cur = p.stints[k].compound;
  const next = compound || (DRY.includes(cur) ? DRY.find((c) => c !== cur && c !== "SOFT") || DRY.find((c) => c !== cur) : cur);
  p.stints.splice(k + 1, 0, { compound: next, toLap: p.stints[k].toLap });
  p.stints[k].toLap = mid;
  p.stints[p.stints.length - 1].toLap = total;
  return edited(p);
}
// one stop fewer: stint i goes; its laps go to the stint before it (to the next one when it is the first)
export function removeStint(plan, i, total) {
  const p = copy(plan); if (p.stints.length < 2 || !p.stints[i]) return p;
  if (i === 0) p.stints.splice(0, 1);
  else { p.stints[i - 1].toLap = p.stints[i].toLap; p.stints.splice(i, 1); }
  p.stints[p.stints.length - 1].toLap = total;
  return edited(p);
}
// swap stint i with its neighbour (dir −1 / +1), each keeping its LENGTH: the order of the tyres changes, not the distances
export function moveStint(plan, i, dir, total) {
  const j = i + dir; if (j < 0 || j >= plan.stints.length || i < 0 || i >= plan.stints.length) return copy(plan);
  const R = ranges(plan), lens = R.map((r) => r.laps), cmps = R.map((r) => r.compound);
  [lens[i], lens[j]] = [lens[j], lens[i]]; [cmps[i], cmps[j]] = [cmps[j], cmps[i]];
  const p = copy(plan); let lap = 0;
  p.stints = cmps.map((c, k) => { lap += lens[k]; return { compound: c, toLap: lap }; });
  p.stints[p.stints.length - 1].toLap = total;
  return edited(p);
}
export const setMode = (plan, key, v) => edited({ ...copy(plan), [key]: v });

// ---------- checks ----------
// ctx: { total, compounds: [names allowed], rule: { minDry, minSets, exemptWet, text } | null, minStint (laps, default 3),
//        queueS (s a second car waits behind its teammate's stop), start: { num: compound } (the start tyre shown, when
//        it is kept apart from the plan – optional) }
// → { cars: { num: { errors: [msg], warnings: [msg] } }, team: [msg], ok: no errors anywhere }
// msg: { code, text, stint? } – errors block the start (the engine would refuse or misread the plan); warnings don't
export function validate(plans, ctx) {
  const out = { cars: {}, team: [], ok: true }, total = ctx.total, allowed = new Set(ctx.compounds || []), minStint = ctx.minStint ?? 3;
  for (const num of Object.keys(plans)) {
    const p = plans[num], E = [], W = [];
    const st = p?.stints || [];
    if (!st.length) E.push({ code: "empty", text: "스틴트가 없어요" });
    let prev = 0;
    st.forEach((s, i) => {
      if (!allowed.has(s.compound)) E.push({ code: "compound", stint: i, text: `${i + 1}번째 스틴트: 이 경기에서 쓸 수 없는 타이어 (${s.compound ?? "없음"})` });
      if (!Number.isInteger(s.toLap)) E.push({ code: "lap", stint: i, text: `${i + 1}번째 스틴트: 종료 랩이 정수가 아니에요` });
      else if (s.toLap <= prev) E.push({ code: "order", stint: i, text: `${i + 1}번째 스틴트: 종료 랩 ${s.toLap}이 앞 스틴트(${prev}랩)보다 늦지 않아요` });
      else if (i < st.length - 1 && s.toLap - prev < minStint) W.push({ code: "short", stint: i, text: `${i + 1}번째 스틴트가 ${s.toLap - prev}랩뿐이에요 (피트 손실에 비해 짧음)` });
      if (Number.isInteger(s.toLap)) prev = Math.max(prev, s.toLap);
    });
    const last = st[st.length - 1];
    if (last && last.toLap !== total) E.push({ code: "finish", stint: st.length - 1, text: `마지막 스틴트가 경기 끝(${total}랩)이 아니라 ${last.toLap}랩에서 끝나요` });
    if (st.length && st.some((s) => s.toLap >= total) && st.findIndex((s) => s.toLap >= total) < st.length - 1) E.push({ code: "past", text: `경기 끝(${total}랩) 뒤에 계획된 스틴트가 있어요` });
    const start = ctx.start?.[num];
    if (start && st[0] && start !== st[0].compound) E.push({ code: "start", stint: 0, text: `출발 타이어(${start})와 1번째 스틴트(${st[0].compound})가 달라요` });
    if (ctx.rule && st.length) {
      const used = st.map((s) => s.compound), wet = used.some((c) => WETS.includes(c)), dry = new Set(used.filter((c) => DRY.includes(c)));
      const ok = (ctx.rule.exemptWet && wet) || (dry.size >= (ctx.rule.minDry ?? 2) && st.length >= (ctx.rule.minSets ?? 1));
      if (!ok) W.push({ code: "rule", severe: true, text: `시즌 타이어 규정 미충족: ${ctx.rule.text || "건조 컴파운드 2종 이상"} – 이대로 끝나면 실격 위험` });
    }
    if (st.length && st.every((s) => WETS.includes(s.compound))) W.push({ code: "allwet", text: "전 구간 인터/웨트 계획 – 비가 오지 않으면 매우 느려요" });
    out.cars[num] = { errors: E, warnings: W };
    if (E.length) out.ok = false;
  }
  // the team's two cars stopping on the same lap: the second one waits behind the first one's stop when they run close
  const nums = Object.keys(plans);
  if (nums.length === 2) {
    const [a, b] = nums, la = stopLaps(plans[a] || { stints: [] }), lb = new Set(stopLaps(plans[b] || { stints: [] }));
    for (const L of la) if (lb.has(L)) out.team.push({ code: "clash", lap: L, text: `${L}랩: 두 차가 같은 랩에 피트 예정 – 붙어 들어오면 뒤차가 약 ${(ctx.queueS ?? 5).toFixed(0)}초 대기 (간격이 크면 대기 없음)` });
  }
  return out;
}

// ---------- to the engine ----------
// plans → what createRace and the first orders need. The plans go to createRace({ plans }) (the engine's own form, by
// "player"); the initial modes and the assist choice go as the player's orders at t = 0 (an order of a kind is what hands
// that kind of decision from the team AI to the player – ai.js `touched`):
//   assist off → a "plan" order with the same stints, and the pace and energy orders (balanced where none was picked)
//   assist on  → only the modes the player picked (null: the team AI's)
export function toEngine(plans) {
  const out = { plans: {}, orders: [] };
  for (const num of Object.keys(plans)) {
    const p = plans[num], stints = p.stints.map((s) => ({ compound: s.compound, toLap: s.toLap }));
    out.plans[num] = { stints, by: "player" };
    if (!p.assist) out.orders.push({ type: "plan", car: num, args: { stints } });
    const pace = p.pace || (p.assist ? null : "balanced"), energy = p.energy || (p.assist ? null : "balanced");
    if (pace) out.orders.push({ type: "pace", car: num, args: { mode: pace } });
    if (energy) out.orders.push({ type: "energy", car: num, args: { mode: energy } });
  }
  return out;
}
