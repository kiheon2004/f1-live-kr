// The race screen's small pure answers (v0.50 request §9-3, §5-1 … §5-4, §3-5): how a gap, a lap time, a tyre's state,
// the fuel to the finish, the tyre sets in hand, a box call about to be made, who controls a car and what a goal is doing
// are said on screen – and the in-race plan editor's edits and checks. No DOM, no engine calls, no state (tested:
// test/game/ui50.test.js). Every function takes only what the render-time picture (ui.js hudSnap) gives for the
// player's own cars and the public timing for the others; a value that isn't there is "–" / null, never 0.
import { CMP_1, CMP_KO } from "./ui.js";
import { ACTIONS, defaultAlertSettings } from "./alerts.js";

const fin = Number.isFinite;

// ---------- times and gaps ----------
// a lap time in s → "1:21.345" (the engine's own lap record – a result, not an estimate)
export const fmtLapT = (s) => (fin(s) && s > 0 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, "0")}` : "–");
// the last lap against the car's best: "+0.214" / "−0.050" / "" (no best yet, or the last one IS the best)
export function lapDelta(last, best) {
  if (!last || !best || !fin(last.t) || !fin(best.t) || last.n === best.n) return "";
  const d = last.t - best.t; return (d >= 0 ? "+" : "−") + Math.abs(d).toFixed(3);
}
// a gap in s (timing line) → "+1.2"; lapped → "+1랩"; no data → "–" (never "+0.0")
export function fmtGap(g, lapsDown = 0) {
  if (lapsDown > 0) return `+${lapsDown}랩`;
  return fin(g) && g >= 0 ? `+${g.toFixed(1)}` : "–";   // (a negative interval – a car in the pit lane, the order changing – is no data)
}
// the gap to the car BEHIND a car: that car's own interval (the cars sorted by position; the next one's gap.ahead)
export function gapBehind(cars, num) {
  const s = [...cars].filter((c) => fin(c.pos)).sort((a, b) => a.pos - b.pos), i = s.findIndex((c) => String(c.num) === String(num));
  const b = i >= 0 ? s[i + 1] : null; if (!b) return { car: null, g: null, laps: 0 };
  return { car: b, g: b.gap?.ahead ?? null, laps: b.gap?.aheadLaps ?? 0 };
}

// ---------- the tyre ----------
// the tyre's temperature against its compound's working window (tyre.win from the engine; Tw = the temperature the grip
// uses): below → 저온 (cold: less grip until it warms), above → 과열 (hot: grip falls, wear rises), else 정상
export function tyreTemp(t) {
  if (!t || !fin(t.Tw) || !t.win || !fin(t.win.lo) || !fin(t.win.hi)) return { key: null, label: "온도 자료 없음", cls: "" };
  if (t.Tw < t.win.lo) return { key: "cold", label: "저온", cls: "info", by: Math.round(t.win.lo - t.Tw) };
  if (t.Tw > t.win.hi) return { key: "hot", label: "과열", cls: "bad", by: Math.round(t.Tw - t.win.hi) };
  return { key: "ok", label: "정상", cls: "ok", by: 0 };
}
// what is left of the tyre (life = 1 − wear): the bar shows LIFE everywhere (full = new; it empties as the tyre wears),
// so the bar and the number always read the same way
export function tyreLife(t) {
  const life = fin(t?.life) ? t.life : fin(t?.wear) ? 1 - t.wear : null;
  if (life == null) return { life: null, pct: "–", cls: "" };
  return { life, pct: Math.round(life * 100) + "%", cls: life < 0.3 ? "bad" : life < 0.5 ? "warn" : "ok" };
}
// a per-lap trend of a value from a car's samples [{ lap, v }] (the last few laps): change per lap, or null
export function perLap(samples, n = 3) {
  const h = (samples || []).filter((x) => fin(x.v) && fin(x.lap)); if (h.length < 2) return null;
  const a = h[Math.max(0, h.length - 1 - n)], b = h[h.length - 1]; if (b.lap - a.lap < 1) return null;
  return (b.v - a.v) / (b.lap - a.lap);
}

// ---------- fuel to the finish ----------
// from the car's own burn so far (samples [{ lap, fuel }] at lap ends): kg per lap, what the laps left need, the margin
// in laps. An estimate (said on screen): null until 2 laps of samples.
export function fuelMargin(samples, fuel, lap, total) {
  const h = (samples || []).filter((x) => fin(x.fuel)); if (h.length < 3 || !fin(fuel) || !fin(total)) return null;
  const a = h[0], b = h[h.length - 1]; if (b.lap - a.lap < 2 || a.fuel <= b.fuel) return null;
  const per = (a.fuel - b.fuel) / (b.lap - a.lap), left = Math.max(0, total - lap), need = per * left;
  return { per, need, marginLaps: (fuel - need) / per, ok: fuel >= need };
}

// ---------- tyre sets (engine inventory.js: car.sets) ----------
// per compound: free (new / used), reserved (promised to a standing call); the set fitted
export function setStock(sets) {
  const by = {}, fitted = (sets || []).find((s) => s.state === "fitted") || null;
  for (const s of sets || []) {
    const b = by[s.compound] || (by[s.compound] = { free: 0, fresh: 0, used: 0, reserved: 0 });
    if (s.state === "free") { b.free++; if (s.used) b.used++; else b.fresh++; } else if (s.state === "reserved") b.reserved++;
  }
  return { by, fitted };
}
// the set the engine fits for a compound when no set is named (inventory.js pickFree: a new one first, else the least worn)
export function pickSet(sets, compound) {
  let best = null;
  for (const s of sets || []) if (s.state === "free" && s.compound === compound && (!best || (best.used && !s.used) || (best.used === s.used && s.wear < best.wear))) best = s;
  return best;
}
export const setLabel = (s) => (!s ? "세트 없음" : s.used ? `중고 세트 (${s.laps}랩 사용)` : "새 세트");

// ---------- a box call, read before it is made (§9-3) ----------
// car: my car at render time; mate: my other car (or null); compound: the tyre chosen. → { compound, set, left, cancel,
// mate: { risk, text } , ok, why }
export function boxPreview(car, mate, compound) {
  const ph = car?.pit?.phase || "none", out = { compound, set: null, left: null, cancel: "", mate: { risk: "none", text: "" }, ok: true, why: "" };
  if (!car || car.status === "dnf" || car.status === "fin") return { ...out, ok: false, why: car?.status === "fin" ? "완주" : "리타이어" };
  if (Array.isArray(car.sets)) {
    out.set = pickSet(car.sets, compound);
    const st = setStock(car.sets).by[compound]; out.left = st ? st.free : 0;
    if (!out.set && ph !== "called") { out.ok = false; out.why = `${CMP_KO[compound] || compound} 세트가 남지 않았어요`; }
  }
  out.cancel = ph === "none" ? "피트 입구 전까지 취소 가능" : ph === "called" ? "요청됨 · 입구 전까지 취소 가능" : ph === "committed" ? "진입 확정 · 취소 불가" : "피트레인 안";
  if (mate && mate.status === "run") {
    const mph = mate.pit?.phase || "none", gap = fin(car.gap?.leader) && fin(mate.gap?.leader) ? Math.abs(car.gap.leader - mate.gap.leader) : null;
    const mateIn = ["called", "committed", "entry", "lane", "approach", "queue", "work"].includes(mph);
    const ns = (mate.plan?.stints || []).find((x, k, a) => x.toLap > (mate.lap || 0) && k < a.length - 1);
    const sameLap = ns && ns.toLap === (car.lap || 0) + 1;
    if (mateIn || sameLap) {
      const close = gap != null && gap < 6;
      out.mate = { risk: close ? "high" : "low", text: `${mate.tla || "#" + mate.num} ${mateIn ? "피트 진행 중" : "같은 랩 피트 예정"}${gap != null ? ` · 간격 ${gap.toFixed(1)}초` : ""} – ${close ? "붙어 들어오면 대기 위험" : "간격이 있어 대기 위험 낮음"}` };
    }
  }
  return out;
}

// ---------- control: who decides each kind (engine car.own) ----------
export const OWN_KO = { ai: "AI", player: "직접", goal: "목표" };
export const ownText = (own, kind) => (own && own[kind] ? OWN_KO[own[kind]] || own[kind] : null);

// ---------- goals (engine assist.js) ----------
export const GOALS = ["keep", "attack", "defend", "tyre", "save"];
export const GOAL_KO = { keep: "페이스 유지", attack: "앞차 압박", defend: "뒤차 방어", tyre: "타이어 관리", save: "에너지 비축" };
export const GOAL_SHORT = { keep: "유지", attack: "압박", defend: "방어", tyre: "타이어", save: "비축" };
export const GOAL_STATE_KO = { active: "수행 중", waiting: "대기", blocked: "수행 불가", done: "완료" };
// the engine's reason codes in plain Korean (why: { code, gap?, car?, life?, soc?, lap?, toLap?, flag? })
export function goalWhy(why, tla = (n) => (n ? "#" + n : "")) {
  if (!why) return "";
  const g = fin(why.gap) ? `${why.gap.toFixed(1)}초` : "";
  switch (why.code) {
    case "keep": return "균형 페이스·에너지 유지";
    case "leading": return "선두 – 압박할 앞차 없음";
    case "noGap": return "간격 자료 대기";
    case "far": return `앞차 ${tla(why.car)} ${g} – 따라가는 중`;
    case "attack": return `앞차 ${tla(why.car)} ${g} – 압박`;
    case "tyreLimit": return `타이어 한계 (남은 ${Math.round((why.life ?? 0) * 100)}%) – 공격 보류`;
    case "lowBattery": return `배터리 부족 (${Math.round((why.soc ?? 0) * 100)}%) – 사용 보류`;
    case "last": return "뒤에 방어할 차 없음";
    case "defend": return `뒤차 ${tla(why.car)} ${g} – 방어`;
    case "reached": return `${why.lap}랩 도달`;
    case "learning": return `마모 추세 수집 중 (목표 ${why.toLap}랩)`;
    case "hot": return "타이어 과열 – 관리";
    case "tyre": return `${why.toLap}랩까지 타이어 관리${fin(why.proj) ? ` (예상 남은 ${Math.round((1 - why.proj) * 100)}%)` : ""}`;
    case "saved": return `배터리 ${Math.round((why.soc ?? 0) * 100)}% – 비축 완료`;
    case "saving": return `배터리 ${Math.round((why.soc ?? 0) * 100)}% → ${Math.round((why.target ?? 0) * 100)}% 비축 중`;
    case "flag": return `${why.flag === "sc" ? "세이프티카" : why.flag === "vsc" ? "VSC" : why.flag === "red" ? "적색기" : "깃발"} – 대기`;
    case "inPit": return "피트 – 대기";
    default: return "";
  }
}

// ---------- the in-race plan editor (§5-2) ----------
// The plan as the engine has it (car.plan.stints: [{ compound, toLap }], the last toLap = the race's laps). lap: the car's
// completed laps. A stint is DONE when toLap ≤ lap; the CURRENT one is the first with toLap > lap (its tyre is fitted: the
// compound can't change; its end – the next stop – can move, not before lap + 1). Every edit returns new stints.
const cp = (st) => st.map((s) => ({ compound: s.compound, toLap: s.toLap }));
export const curStint = (st, lap) => { const i = st.findIndex((s) => s.toLap > lap); return i < 0 ? st.length - 1 : i; };
export function liveSetEnd(st, i, to, lap, total) {
  const s = cp(st), c = curStint(s, lap); if (i < c || i >= s.length - 1) return s;
  const lo = Math.max((i ? s[i - 1].toLap : 0) + 1, lap + 1), hi = s[i + 1].toLap - 1; if (lo > hi) return s;
  s[i].toLap = Math.max(lo, Math.min(hi, Math.round(to))); s[s.length - 1].toLap = total; return s;
}
export function liveSetCompound(st, i, compound, lap) { const s = cp(st); if (i > curStint(s, lap) && s[i]) s[i].compound = compound; return s; }
// one more stop: the longest future part of a stint split in half (the new part on another dry tyre)
export function liveAdd(st, lap, total, compound = null) {
  const s = cp(st), c = curStint(s, lap); let k = -1, best = 0;
  for (let i = c; i < s.length; i++) { const from = Math.max(i ? s[i - 1].toLap : 0, lap), len = s[i].toLap - from; if (len > best) { best = len; k = i; } }
  if (k < 0 || best < 2) return s;
  const from = Math.max(k ? s[k - 1].toLap : 0, lap), mid = from + Math.floor(best / 2), cur = s[k].compound;
  const next = compound || (["SOFT", "MEDIUM", "HARD"].includes(cur) ? (cur === "HARD" ? "MEDIUM" : "HARD") : cur);
  s.splice(k + 1, 0, { compound: next, toLap: s[k].toLap }); s[k].toLap = mid; s[s.length - 1].toLap = total;
  return s;
}
// one stop fewer: a future stint goes, its laps to the one before (the current stint can't go – its tyre is on the car)
export function liveRemove(st, i, lap, total) {
  const s = cp(st); if (i <= curStint(s, lap) || !s[i]) return s;
  s[i - 1].toLap = s[i].toLap; s.splice(i, 1); s[s.length - 1].toLap = total; return s;
}
export const sameStints = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x.compound === b[i].compound && x.toLap === b[i].toLap);
// checks before 적용: { errors, warnings } – errors: the engine would refuse; warnings: allowed, but said
// ctx: { lap, total, stock: { compound: free + reserved }, rule: { minDry, exemptWet, text } | null, minStint }
export function liveCheck(st, ctx) {
  const E = [], W = [], total = ctx.total, lap = ctx.lap ?? 0, c = curStint(st, lap);
  let prev = 0;
  st.forEach((s, i) => {
    if (!Number.isInteger(s.toLap) || s.toLap <= prev) E.push(`${i + 1}번째 스틴트의 끝 랩이 앞 스틴트보다 늦어야 해요`);
    else if (i > c && i < st.length - 1 && s.toLap - prev < (ctx.minStint ?? 3)) W.push(`${i + 1}번째 스틴트가 ${s.toLap - prev}랩뿐 (피트 손실에 비해 짧음)`);
    if (fin(s.toLap)) prev = Math.max(prev, s.toLap);
  });
  if (st.length && st[st.length - 1].toLap !== total) E.push(`마지막 스틴트가 경기 끝(${total}랩)에서 끝나야 해요`);
  if (st[c] && st[c].toLap <= lap) E.push("다음 피트는 다음 랩 이후여야 해요");
  if (ctx.stock) {
    const need = {}; for (let i = c + 1; i < st.length; i++) need[st[i].compound] = (need[st[i].compound] || 0) + 1;
    for (const [k, n] of Object.entries(need)) { const m = ctx.stock[k] ?? 0; if (n > m) E.push(`${CMP_KO[k] || k} 세트 부족 – 필요 ${n}, 남은 ${m}`); }
  }
  if (ctx.rule) {
    const used = st.map((s) => s.compound), wet = used.some((x) => x === "INTERMEDIATE" || x === "WET"), dry = new Set(used.filter((x) => ["SOFT", "MEDIUM", "HARD"].includes(x)));
    if (!((ctx.rule.exemptWet && wet) || dry.size >= (ctx.rule.minDry ?? 2))) W.push(`타이어 규정 미충족 위험: ${ctx.rule.text || "건조 컴파운드 2종 이상"}`);
  }
  return { errors: E, warnings: W, ok: !E.length };
}
export const stintsText = (st) => st.map((s, i) => `${CMP_1[s.compound] || "?"}${i < st.length - 1 ? s.toLap : ""}`).join("·");

// ---------- the lap axis (timelines): a lap → a share of the width ----------
export const lapPct = (lap, total) => `${((Math.max(0, Math.min(total, lap)) / Math.max(1, total)) * 100).toFixed(3)}%`;
// forecast blocks (ms from the start) on a lap axis: each block's laps from the expected lap time – an approximation
// said on screen ("예상 랩타임 기준")
export function forecastOnLaps(blocks, lapS, total, t0 = 0) {
  if (!fin(lapS) || lapS <= 0) return [];
  return (blocks || []).map((b) => ({ from: Math.max(0, (b.from - t0) / 1000 / lapS), to: Math.min(total, (b.to - t0) / 1000 / lapS), p: b.pRain })).filter((b) => b.to > 0 && b.from < total);
}

// ---------- alerts: the notice's look ----------
export const noticeCls = (level) => (level >= 3 ? "bad" : level >= 2 ? "warn" : "info");

// an alternative's stop put into a plan: the current stint ends at stopLap, the next one on `compound` (a new stint when
// the plan had no stop left)
export function liveStopAt(st, lap, stopLap, compound, total) {
  let s = cp(st); const c = curStint(s, lap);
  if (c === s.length - 1) { s.splice(c + 1, 0, { compound, toLap: total }); s[c].toLap = Math.max(lap + 1, Math.min(total - 1, stopLap)); return s; }
  s = liveSetEnd(s, c, stopLap, lap, total);
  if (compound) s[c + 1].compound = compound;
  return s;
}

// ---------- season words (research/energy_rules.md §4) ----------
// The engine's four energy modes are the same in every season; what they are called is the season's: 2026 has Boost
// (most deploy) and an Overtake mode that only works while the car is ELIGIBLE (a state the race decides, not a button);
// up to 2025 the fourth mode is just "most deploy" (not a rule mode), and DRS is automatic (a state too).
export function energyKo(season) {
  return season >= 2026 ? { harvest: "회수", balanced: "균형", push: "부스트", overtake: "오버테이크" } : { harvest: "회수", balanced: "균형", push: "사용", overtake: "최대 사용" };
}
export const energyHelp = (season) => (season >= 2026
  ? "부스트: 최대 배치 · 오버테이크: 추월 조건(감지선 간격)을 충족한 랩에만 추가 출력 – 조건은 경기가 판정"
  : "사용: 배치 많이 · 최대 사용: 배터리를 빠르게 소모 (규정 모드 아님)");
// the zone a pass happened in, as the season calls it (2026: no DRS)
export const zoneKo = (season, n) => (season >= 2026 ? `직선 모드 구간 ${n}` : `DRS 구간 ${n}`);
export const TRAFFIC_KO = { free: "자유 주행", follow: "앞차 뒤 (난기류)", prepare: "추월 준비", alongside: "나란히", complete: "추월 완료", abort: "추월 포기", defend: "방어 중", yield: "양보", merge: "합류", pitIn: "피트 진입", pit: "피트" };

// ---------- the result screen ----------
// the team AI's reason for a re-plan (ai.js decision.why: "lap", "flag:sc", "forecast", "rivalStop:16", "falloff:16", with
// ",plannedStopTyre" / ",crossover" suffixes) in plain Korean
export function aiWhyKo(why) {
  const parts = String(why || "").split(","), out = [];
  for (const p of parts) {
    const [k, v] = p.split(":");
    const t = { lap: "정기 재검토", forecast: "예보 변화", rivalStop: "경쟁 차량 피트", falloff: "타이어 성능 저하", plannedStopTyre: "계획 피트의 타이어 변경", crossover: "건조·우천 타이어 교차", water: "노면 물", start: "출발" }[k]
      || (k === "flag" ? { sc: "세이프티카", vsc: "VSC", red: "적색기", green: "녹색기 복귀", yellow: "황색기" }[v] || "깃발 변화" : null);
    if (t) out.push(t);
  }
  return out.join(" · ") || "재검토";
}
// who changed a plan (analysis plans[].by)
export const byKo = (by) => (by === "player" ? "나" : by === "pre-race" ? "출발 전" : /^ai/.test(String(by)) ? "팀 AI" : /^goal/.test(String(by)) ? "목표 보조" : String(by || "?"));
// planned (start) vs actual stints → a short list of differences: [{ text }]
export function planVsActual(planned, actual) {
  const out = [];
  if (!Array.isArray(planned) || !Array.isArray(actual)) return out;
  const ps = planned.length - 1, as = actual.length - 1;
  if (ps !== as) out.push(`피트 ${ps}회 계획 → 실제 ${as}회`);
  for (let i = 0; i < Math.min(planned.length, actual.length) - 1; i++) {
    const p = planned[i], a = actual[i];
    if (p.toLap !== a.toLap) out.push(`${i + 1}번째 피트 ${p.toLap}랩 → ${a.toLap}랩`);
    const pn = planned[i + 1]?.compound, an = actual[i + 1]?.compound;
    if (pn && an && pn !== an) out.push(`${i + 2}번째 스틴트 ${CMP_KO[pn] || pn} → ${CMP_KO[an] || an}`);
  }
  if (!out.length) out.push("계획대로 진행");
  return out;
}

// ---------- alert settings (alertsui.js) ----------
// the choice a rule shows (myPit: "scene" – the pit camera's own scene slow-down – when that is on and the alert itself only
// notes) and a choice written back to the settings: one control per moment, so the two pit slow-downs can't both act
export function actionOf(rule, S) {
  const a = { ...defaultAlertSettings(), ...(S.alerts || {}) }[rule] || "off";
  return rule === "myPit" && S.pitSlow && (a === "note" || a === "off") ? "scene" : a;
}
export function applyAction(S, rule, act) {
  const alerts = { ...defaultAlertSettings(), ...(S.alerts || {}) };
  if (rule === "myPit") { S.pitSlow = act === "scene"; alerts.myPit = act === "scene" ? "note" : ACTIONS.includes(act) ? act : alerts.myPit; }
  else if (ACTIONS.includes(act)) alerts[rule] = act;
  S.alerts = alerts; return S;
}

// ---------- the menu: the car's safe area ----------
// the share of the scene's width the menu column (left) and the cards / sheet (right) cover, plus a margin – the car is
// framed in the free middle (menugarage.js setSafe clamps the two to ≤ 0.6 each, ≤ 0.8 together)
export const safeFrac = (W, leftPx, rightPx, margin = 28) => ({ left: Math.min(0.6, Math.max(0, (leftPx + margin) / W)), right: Math.min(0.6, Math.max(0, rightPx > 0 ? (rightPx + margin) / W : 0)) });

// ---------- pre-race: sets a plan needs against the sets in hand ----------
// each stint takes a set (the first is fitted at the start); sets: the engine's assumed allocation for the car
// → [{ compound, need, have }] for the compounds short; null when there is no inventory
export function setsShort(plan, sets) {
  if (!Array.isArray(sets)) return null;
  const need = {}, have = {}; for (const s of plan.stints) need[s.compound] = (need[s.compound] || 0) + 1;
  for (const s of sets) have[s.compound] = (have[s.compound] || 0) + 1;
  return Object.entries(need).filter(([k, n]) => n > (have[k] || 0)).map(([k, n]) => ({ compound: k, need: n, have: have[k] || 0 }));
}

// ======================================================================================================================
// v0.52 (request §10-1): the driver panel's control state and units
// ======================================================================================================================
// One unit per quantity on the race screen: times in seconds with one decimal and "초" (gaps, losses, queue), lap times
// m:ss.sss, the battery and the tyre as "남은 %" (what is LEFT – life = 1 − wear; a rate is the same quantity per lap, in
// %p, negative = going down), energy per lap in MJ (dock only), fuel margin in laps.
export const fmtS = (s, dp = 1) => (fin(s) ? `${s.toFixed(dp)}초` : "–");
// a gap on the panel: "1.2초" / "+1랩" / "선두" / "–" (no data – never 0)
export function gapText(g, laps = 0, leader = false) { if (leader) return "선두"; if (laps > 0) return `+${laps}랩`; return fin(g) && g >= 0 ? fmtS(g) : "–"; }
// the tyre's life change per lap (perLap of life: negative while it wears) → "랩당 −3.2%p" – the same "남은 수명" meaning
export const lifeRateText = (perLapLife) => (fin(perLapLife) ? `랩당 ${perLapLife <= 0 ? "−" : "+"}${Math.abs(perLapLife * 100).toFixed(1)}%p` : "–");

// who decides a kind, said plainly (engine car.own): the chip's text, class and its tooltip
export const OWN_TIP = {
  ai: "팀 AI가 정하는 중 – 버튼을 누르면 직접 지시로 바뀌어요",
  player: "직접 지시 중 – 'AI에 맡기기'로 팀 AI에게 돌려줄 수 있어요",
  goal: "운영 목표가 정하는 중 – 버튼을 누르면 목표가 끝나고 직접 지시로 바뀌어요",
};
export function ownChip(own, kind) {
  const k = own && own[kind]; if (!k) return { key: null, text: "–", cls: "gc-own", tip: "조작 권한 자료 없음" };
  return { key: k, text: OWN_KO[k] || k, cls: `gc-own own-${k}`, tip: OWN_TIP[k] || "" };
}
// a mode control's buttons: IN FORCE (the render-time mode – pressed), PENDING (sent, not yet in force – marked, never
// pressed), the rest SELECTABLE; all disabled when the car is out. pendMode equal to the mode in force is not "pending".
export function modeButtons(list, cur, pendMode, out = false) {
  return list.map((v) => ({ v, inForce: v === cur, pending: !!pendMode && v === pendMode && v !== cur, disabled: !!out }));
}
// the state of one kind in a line (the folded panel and tooltips): "공격 · 직접" / "균형 · AI → 사용 대기"
export function modeLine(curKo, own, pendKo) { return `${curKo || "–"}${own ? ` · ${own}` : ""}${pendKo ? ` → ${pendKo} 대기` : ""}`; }
// a short refusal / reason for a narrow line (the full text goes to the tooltip): cut at a word near n characters
export function clip(s, n = 26) { s = String(s || ""); if (s.length <= n) return s; const cut = s.slice(0, n); const sp = cut.lastIndexOf(" "); return (sp > n * 0.6 ? cut.slice(0, sp) : cut) + "…"; }
// why the box button can't act right now (short; null = it can)
export function boxBlocked(car, pv) {
  const ph = car?.pit?.phase || "none";
  if (!car) return "자료 없음";
  if (car.status === "dnf") return "리타이어"; if (car.status === "fin") return "완주";
  if (ph === "committed") return "진입 확정 – 변경 불가";
  if (["entry", "lane", "approach", "penalty", "queue", "work", "release", "laneOut", "exit"].includes(ph)) return "피트레인 안";
  if (pv && !pv.ok && ph !== "called") return pv.why || "불가";
  return null;
}

// ======================================================================================================================
// v0.52 (request §10-2): the race explained on ONE lap axis per driver (results.js)
// ======================================================================================================================
// a stop under an SC / VSC: its loss is against the field over the same stretch then (v0.53), not a free lap – under the SC
// what the car wins back closing up to the queue afterwards is not in it (said, not hidden)
export const underNote = (p) => !p.under ? "" : p.refBy === "field" ? ` · ${p.under.toUpperCase()} 중 다른 차 기준${p.under === "sc" ? " (대열 따라잡기 미포함)" : ""}` : ` · ${p.under.toUpperCase()} 중 (기준: 정상 주행)`;
// Input: one car of engine.analysis (plans, stints, orders, ai, pitParts, traffic, laps, events), the race's flags
// (analysis.flags), the race's laps, and a weather series [{ t, rain, water? }] (the game's own weather as the race ran –
// gamehome finishRace). Output: everything placed on that car's laps, each item marked by where its number comes from:
//   "measured"  – the engine's record of what happened (lap times, stints, stop times; pit loss = lane time − the same
//                 stretch at race speed, which the engine itself calls an approximation: "엔진 근사")
//   "estimate"  – a number someone estimated at the time (the team AI's expected gain when it re-planned)
//   "record"    – a fact without a number (who decided what, a flag, rain)
// Nothing here compares with a race that wasn't run: no "would have" numbers.
const WHO = (by) => (by === "player" ? "나" : /^goal/.test(String(by)) ? "목표 보조" : /^ai/.test(String(by)) ? "팀 AI" : by === "pre-race" ? "출발 전" : String(by || "?"));
export const whoCls = (who) => ({ "나": "me", "목표 보조": "goal", "팀 AI": "ai" }[who] || "pre");
// the car's lap in progress at race time t (ms): its lap records' durations from lights out
export function lapAtT(laps, t, t0 = 0) {
  let acc = t0; for (const l of laps || []) { acc += (l.t || 0) * 1000; if (acc > t) return l.n; }
  return laps?.length ? laps[laps.length - 1].n + 1 : 1;
}
// the end time (ms) of each of the car's laps
const lapEnds = (laps, t0) => { let acc = t0; return (laps || []).map((l) => (acc += (l.t || 0) * 1000)); };
// weather per lap: the samples falling inside each lap → { lap, rain (max), water (max, null when not sampled) }
export function weatherByLap(laps, series, t0 = 0) {
  const ends = lapEnds(laps, t0), out = []; let k = 0; const s = (series || []).slice().sort((a, b) => a.t - b.t);
  for (let i = 0; i < ends.length; i++) {
    const from = i ? ends[i - 1] : t0; let rain = null, water = null;
    while (k < s.length && s[k].t < from) k++;
    for (let j = k; j < s.length && s[j].t <= ends[i]; j++) { if (fin(s[j].rain)) rain = Math.max(rain ?? 0, s[j].rain); if (fin(s[j].water)) water = Math.max(water ?? 0, s[j].water); }
    out.push({ lap: laps[i].n, rain, water });
  }
  return out;
}
// runs of consecutive laps where pred holds → [{ from, to }]
export function runs(list, pred) {
  const out = []; let cur = null;
  for (const x of list) { if (pred(x)) { if (cur && x.lap === cur.to + 1) cur.to = x.lap; else out.push(cur = { from: x.lap, to: x.lap }); } else cur = null; }
  return out;
}
export const lapsText = (r) => r.map((x) => (x.from === x.to ? `${x.from}` : `${x.from}–${x.to}`)).join(", ");
// a plan string of the AI ("S16-H36-S52", "→INTERMEDIATE") or stints → short text
const planStr = (p) => String(p || "").replace(/→(\w+)/, (m, c) => `→ ${CMP_KO[c] || c}`);
// a track this wet (mean water film on the racing line, mm – the HUD's own "젖음" shows from 0.005, "물 N mm" from 0.05)
// counts as a wet lap on the axis
export const WET_MM = 0.1;
// the story of one car. A: analysis car; o: { flags, total, weather, t0 }
export function raceStory(A, o = {}) {
  if (!A) return null;
  const laps = A.laps || [], t0 = fin(o.t0) ? o.t0 : (o.flags || []).find((f) => f.type === "lightsOut")?.t ?? 0, lapOf = (t) => lapAtT(laps, t, t0);
  const total = o.total || laps.length || 0;
  const actual = (A.stints || []).map((s) => ({ compound: s.compound, fromLap: s.fromLap, toLap: s.toLap }));
  const planned = A.plans?.[0]?.stints || null;
  // stops: each pitPart is the stop at the end of lap `lap` (the stint before it ends there)
  const pits = (A.pitParts || []).map((p, i) => {
    const before = actual.find((s) => s.toLap === p.lap) || actual[i] || null, after = actual[actual.indexOf(before) + 1] || null;
    return { lap: p.lap, loss: p.loss, queue: p.queue || 0, stationary: p.stationary ?? null, rest: p.rest ?? null, from: before?.compound || null, to: after?.compound || null, src: "measured", red: !!p.red, susp: p.susp ?? null, under: p.under || null, refBy: p.refBy || null };
  });
  // plan changes, each with its decider and (team AI) the decision that made it – reason codes and the AI's estimate
  const ai = (A.ai || []).slice().sort((a, b) => a.t - b.t);
  const changes = (A.plans || []).slice(1).map((p) => {
    const who = WHO(p.by); let d = null;
    if (who === "팀 AI") for (const x of ai) if (x.t <= p.t + 1 && p.t - x.t < 5000) d = x;
    return { lap: p.lap ?? lapOf(p.t), t: p.t, who, cls: whoCls(who), stints: p.stints || [], text: stintsText(p.stints || []), why: d ? aiWhyKo(d.why) : who === "나" ? "직접 편집" : "", gain: d && fin(d.gain) ? d.gain : null };
  });
  // the AI's decisions that were not a plan order (a crossover call → a pit order) are kept as their own entries
  const usedAi = new Set(changes.map((c) => c.t));
  const aiOther = ai.filter((d) => ![...usedAi].some((t) => t + 1 >= d.t && t - d.t < 5000)).map((d) => ({ lap: d.lap ?? lapOf(d.t), t: d.t, who: "팀 AI", cls: "ai", text: planStr(d.plan), why: aiWhyKo(d.why), gain: fin(d.gain) ? d.gain : null }));
  // the player's and the goal assist's orders (applied or refused)
  const orders = (A.orders || []).filter((x) => x.stage !== "submit").map((x) => { const who = WHO(x.by); return { lap: lapOf(x.tEff ?? x.t), t: x.tEff ?? x.t, who, cls: whoCls(who), type: x.type, args: x.args || {}, ok: !!x.ok, why: x.why || null }; });
  // traffic: the per-lap loss (s, + = lost, − = gained) and the laps where it was largest
  const traffic = (A.traffic || []).filter((x) => fin(x.loss));
  const top = traffic.filter((x) => x.loss >= 1).slice().sort((a, b) => b.loss - a.loss).slice(0, 3);
  // flags as bands on this car's laps
  const bands = []; let open = null;
  for (const f of (o.flags || []).slice().sort((a, b) => a.t - b.t)) {
    if (["sc", "vsc", "red"].includes(f.type)) { if (open) open.to = lapOf(f.t); open = { type: f.type, from: lapOf(f.t), to: null }; bands.push(open); }
    else if (["green", "chequered"].includes(f.type) && open) { open.to = Math.max(open.from, lapOf(f.t)); open = null; }
  }
  if (open) open.to = total;
  // weather and the tyres on the same laps (facts only)
  // (the engine's own lap records – water / rain at each lap's end, v0.52 – also where the screen sampled nothing)
  const wx = weatherByLap(laps, o.weather || [], t0).map((x, i) => {
    const l = laps[i], mx = (a, b) => (fin(b) ? Math.max(a ?? 0, b) : a);
    return { lap: x.lap, rain: mx(x.rain, l?.rain), water: mx(x.water, l?.water) };
  });
  const rainy = runs(wx, (x) => (x.rain ?? 0) > 0.05), wet = runs(wx, (x) => (x.water ?? 0) > WET_MM);
  const onWet = runs(laps.map((l) => ({ lap: l.n, c: l.compound })), (x) => x.c === "INTERMEDIATE" || x.c === "WET");
  return { total, actual, planned, pits, changes, aiOther, orders, traffic, top, trafficTotal: A.trafficTotal ?? null, pitTotal: A.pitTotal ?? null,
    queueTotal: pits.reduce((a, p) => a + p.queue, 0), bands, wx, rainy, wet, onWet, hasWater: wx.some((x) => x.water != null), hasRain: wx.some((x) => x.rain != null) };
}
// the story as rows of one table, by lap (the decisions, stops, flags, the largest traffic laps, rain starting / ending)
// → [{ lap, kind, who, cls, text, num, src }] – src: "measured" | "estimate" | "record"
export const SRC_KO = { measured: "엔진 기록", estimate: "당시 추정", record: "기록" };
export function storyRows(S, ordText = (x) => x.type) {
  if (!S) return [];
  const R = [];
  for (const p of S.pits) R.push({ lap: p.lap, kind: "pit", who: "", cls: "", text: `${p.red ? "적색기 피트레인" : `피트${p.under ? ` (${p.under.toUpperCase()} 중)` : ""}`} ${p.from ? CMP_1[p.from] || "?" : "?"}→${p.to ? CMP_1[p.to] || "?" : "?"}`, num: `${p.red && fin(p.susp) ? `중단 ${fmtS(p.susp)} (손실 아님) · ` : ""}손실 ${fmtS(p.loss)}${p.queue > 0.05 ? ` · 동료 대기 ${fmtS(p.queue)}` : ""}${fin(p.stationary) ? ` · 정지 ${fmtS(p.stationary)}` : ""}${underNote(p)}`, src: "measured", bad: p.queue > 0.05 });
  for (const c of S.changes) R.push({ lap: c.lap, kind: "plan", who: c.who, cls: c.cls, text: `계획 → ${c.text}${c.why ? ` (${c.why})` : ""}`, num: fin(c.gain) ? `AI 기대 ${c.gain >= 0 ? "+" : "−"}${Math.abs(c.gain).toFixed(1)}초` : "", src: fin(c.gain) ? "estimate" : "record" });
  for (const c of S.aiOther) R.push({ lap: c.lap, kind: "ai", who: c.who, cls: c.cls, text: `${c.text}${c.why ? ` (${c.why})` : ""}`, num: fin(c.gain) ? `AI 기대 ${c.gain >= 0 ? "+" : "−"}${Math.abs(c.gain).toFixed(1)}초` : "", src: fin(c.gain) ? "estimate" : "record" });
  for (const x of S.orders) R.push({ lap: x.lap, kind: "order", who: x.who, cls: x.cls, text: ordText(x), num: "", src: "record", refused: !x.ok, why: x.why });
  const pitLap = (l) => S.pits.some((p) => l === p.lap || l === p.lap + 1);
  for (const t of S.top) R.push({ lap: t.lap, kind: "traffic", who: "", cls: "", text: `교통 손실 큼${pitLap(t.lap) ? " (피트 랩)" : ""}`, num: fmtS(t.loss), src: "measured" });
  const FL = { sc: "세이프티카", vsc: "VSC", red: "적색기" };
  for (const b of S.bands) R.push({ lap: b.from, kind: "flag", who: "", cls: "", text: `${FL[b.type]} ${b.from}–${b.to}랩`, num: "", src: "record" });
  for (const r of S.rainy) R.push({ lap: r.from, kind: "wx", who: "", cls: "", text: `비 ${r.from === r.to ? `${r.from}랩` : `${r.from}–${r.to}랩`}`, num: "", src: "record" });
  const ord = { flag: 0, wx: 1, plan: 2, ai: 3, order: 4, pit: 5, traffic: 6 };
  R.sort((a, b) => a.lap - b.lap || ord[a.kind] - ord[b.kind]);
  // the goal assist's many small pace / energy orders: one row per unbroken run (between other rows), with the count
  const out = [];
  for (const r of R) {
    const last = out[out.length - 1];
    if (r.kind === "order" && r.who === "목표 보조" && !r.refused && last && last.kind === "goalrun") { last.n++; last.lapTo = r.lap; last.text = `목표 보조 지시 ${last.n}회 (페이스·에너지)`; continue; }
    if (r.kind === "order" && r.who === "목표 보조" && !r.refused) { out.push({ ...r, kind: "goalrun", n: 1, lapTo: r.lap, first: r.text }); continue; }
    out.push(r);
  }
  for (const r of out) if (r.kind === "goalrun" && r.n === 1) { r.kind = "order"; r.text = r.first; }
  return out;
}

// v0.53 §12-4: a card's status badge only when the car is NOT plainly running – in the pit lane, a box called or
// committed, an incident, finished or out. "주행 중" on both cards all race long was a badge that never said anything.
export function plainRunning(c) {
  if (!c) return false;
  const ph = c.pit?.phase || "none";
  return c.status === "run" && ph === "none" && !c.inc;
}
// the incident in a word for the card's badge (engine car.inc kinds – incidents.js); unknown kinds say "사고 처리 중"
export const INC_KO = { moment: "실수", wide: "코스 이탈", spin: "스핀", crash: "사고", puncture: "펑크", limp: "손상 주행" };
export const incKo = (k) => (k ? INC_KO[k] || "사고 처리 중" : "");
