// The pre-race strategy screen (v0.50 request §9-2): the two drivers' plans on ONE lap axis stay the core – stints
// coloured by compound (letter + colour), the stops as handles to drag, the estimator's pit windows hatched, the team's
// forecast as a strip over the same laps, the recommendation as a faint row under each plan to compare against, and a
// same-lap double stop marked as the RISK it is (the queue it costs when the two cars run close – never forbidden).
// Selecting a stint opens ONE editor (tyre, end lap or length as numbers, move, delete, add a stop) instead of every tyre
// button repeated on every stint. Under the timeline each car's summary: the estimate with its spread (rounded to what the
// spread allows – ui.js fmtEst / fmtRace; never tenths on a ±100 s estimate), the sets it needs against the sets in hand
// (the game's assumed allocation, said so), the start modes and the AI assist choice.
//
// The recommendations come from the engine's strategy estimator and change the player's plan ONLY when 적용 is pressed.
// The estimate's limits (energy modes not modelled; traffic / SC / incidents only as ranges) are shown with it.
//
// The plans go to createRace({ plans }); the initial modes and the assist choice go as the player's orders at t = 0
// (planedit.js toEngine).
import { G, go, paint, myCars, startRace } from "./gamehome.js";
import { esc, raceKo, CMP_KO, CMP_1, PACE_KO, cmpChip, compoundsFor, NO_INVENTORY, fmtRace, fmtEst, fmtT, PENDING } from "./ui.js";
import * as P from "./planedit.js";
import * as HM from "./hudmodel.js";
import { createEstimator } from "./estimator.js";
import { PIT } from "../../game/data/params/pit.js";
import { AI } from "../../game/data/params/ai.js";

const QUEUE_S = PIT.workBase.v + AI.queueMargin;   // (a second car stopping behind its teammate: the first one's stop + roll-in)
let EST = null, startErr = null;
const SEL = { num: null, i: 0, showRec: true };
const est = () => EST || (G.engine && G.strat ? (EST = createEstimator({ engine: G.engine, strat: G.strat, onChange: () => { if (G.step === "prerace") repaintNumbers(); } })) : null);
const season = () => G.sc?.meta?.season ?? G.season ?? 2025;

// the plans for this race and team: kept while the player moves around; made once from the engine's default plan
function ensurePlans(sc) {
  const key = `${G.sid}|${G.teamKey}`;
  if (G.plansFor === key && myCars(sc).every((e) => G.plans[e.num])) return;
  G.plansFor = key; G.plans = {}; SEL.num = null;
  for (const e of myCars(sc)) {
    const base = G.engine?.defaultPlan ? G.engine.defaultPlan(sc, e.num) : { stints: [{ compound: "MEDIUM", toLap: Math.round(sc.race.laps * 0.45) }, { compound: "HARD", toLap: sc.race.laps }] };
    G.plans[e.num] = P.planFrom(base.stints, { src: "default", assist: true });
  }
}
const ruleOf = (sc) => { try { return G.strat?.tyreRule ? G.strat.tyreRule({ state: { season: sc.meta.season }, scenario: sc }) : null; } catch { return null; } };
const ctxOf = (sc) => ({ total: sc.race.laps, compounds: compoundsFor(sc).list, rule: ruleOf(sc), queueS: QUEUE_S, minStint: 3 });
const want = () => { const sc = G.sc; if (sc && est()) est().want({ sc, seed: G.seed, team: G.teamKey, plans: G.plans }); };
const recOf = (sc) => { const r = est()?.get(sc, G.seed, G.teamKey); return r?.ok ? r.v : null; };
const setsShort = HM.setsShort;

// ---------- painting ----------
export function paintBody() {
  const sc = G.sc;
  if (G.scErr) return `<div class="ui-state bad"><b>경기를 열지 못했어요</b><span>${esc(G.scErr)}</span><button class="ui-btn" data-act="go:menu">← 메뉴</button></div>`;
  if (!sc) return `<div class="ui-state"><i class="ui-spin"></i><b>경기 자료를 읽는 중</b></div>`;
  ensurePlans(sc);
  const m = sc.meta, mine = myCars(sc), total = sc.race.laps, V = P.validate(G.plans, ctxOf(sc)), R = recOf(sc);
  if (!SEL.num || !G.plans[SEL.num]) SEL.num = String(mine[0]?.num ?? "");
  SEL.recPainted = !!R;
  const short = Object.fromEntries(mine.map((e) => [e.num, R?.inventory ? setsShort(G.plans[e.num], R.inventory.cars?.[e.num]) : null]));
  const shortBad = Object.values(short).some((x) => x?.length);
  const ready = !!G.engine && V.ok && !shortBad;
  return `<div class="gp">
    <header class="gp-head">
      <button class="ui-btn ghost sm" data-act="go:menu">← 차고</button>
      <div class="gp-title"><h2>출발 전 전략</h2><span>${esc(raceKo(m.event))} · ${esc(m.date)} · <b class="num">${total}랩</b> · 랩 ${(sc.track.L / 1000).toFixed(3)} km</span></div>
      <label class="g-field gp-seed" title="같은 시드 + 같은 계획·지시 = 같은 경기">시드 <input class="ui-input num" type="number" min="1" max="999999" value="${G.seed}" data-chg="pre:seed"></label>
      <div class="gp-go"><button class="ui-btn primary" data-act="pre:start" ${ready ? "" : "disabled"}>레이스 시작</button>
        <small>${!G.engine ? esc(G.engineErr === "checking" ? "게임 엔진 여는 중…" : "게임 엔진을 열지 못했어요") : !V.ok ? "계획의 오류를 먼저 고치세요" : shortBad ? "타이어 세트가 모자란 계획이 있어요" : startErr ? esc(startErr) : "일시정지·배속은 경기 중에"}</small></div>
    </header>
    <div class="gp-main">
      <section class="gp-plans">
        <div class="g-card gp-tl-card"><h3>두 드라이버 전략 <small>${total}랩 · 스틴트를 눌러 편집 · 경계를 끌어 피트 랩 이동 · 빗금: 예상 피트 윈도</small>
          <label class="ui-check gp-reccheck"><input type="checkbox" data-chg="pre:showRec" ${SEL.showRec ? "checked" : ""}> 추천 비교</label></h3>
          ${timeline(sc, mine, total, R)}
          ${V.team.length ? V.team.map((w) => `<p class="g-warn">⚠ ${esc(w.text)}</p>`).join("") : ""}</div>
        ${editor(sc, total, V)}
        <div class="gp-cars">${mine.map((e) => carCard(sc, e, total, V.cars[e.num], short[e.num], R)).join("")}</div>
      </section>
      <aside class="gp-side">${sideCards(sc, mine, R)}</aside>
    </div></div>`;
}
export { paintBody as paint };

// one row per car on the shared lap axis (+ the recommendation's faint row), the forecast strip over it, the stops as
// drag handles, the pit windows, a same-lap double stop marked across both rows
function timeline(sc, mine, total, R) {
  const ticks = []; for (let L = 10; L < total; L += 10) ticks.push(L);
  const pct = (lap) => HM.lapPct(lap, total);
  // the forecast on laps: the 15-minute blocks put on the lap axis at the estimator's lap time (approximate – said)
  const lapS = (() => { const v = est()?.planOf(sc, G.seed, G.teamKey, mine[0]?.num, G.plans[mine[0]?.num]); return v?.ok ? v.v.mean / total : null; })();
  const fc = R && lapS ? HM.forecastOnLaps(R.weather.blocks, lapS, total) : [];
  const wx = fc.length ? `<div class="gp-row gp-wxrow"><span class="gp-who" title="팀 예보의 비 확률 – 예상 랩타임으로 랩에 맞춘 대략값">비 확률</span><div class="gp-wx">${fc.map((b) => `<i style="left:${pct(b.from)};width:${pct(b.to - b.from)};--p:${b.p}" title="${Math.round(b.from) + 1}–${Math.round(b.to)}랩 무렵 비 확률 ${Math.round(b.p * 100)}%">${b.p >= 0.15 ? `<em>${Math.round(b.p * 100)}%</em>` : ""}</i>`).join("")}</div></div>` : "";
  const stops = Object.fromEntries(mine.map((e) => [e.num, P.stopLaps(G.plans[e.num])]));
  const clash = mine.length === 2 ? stops[mine[0].num].filter((L) => stops[mine[1].num].includes(L)) : [];
  const rows = mine.map((e) => {
    const p = G.plans[e.num], Rg = P.ranges(p), ev = est()?.planOf(sc, G.seed, G.teamKey, e.num, p);
    const wins = ev?.ok ? ev.v.stops.map((s) => (s.window ? `<i class="gp-win" style="left:${pct(s.window[0] - 1)};width:${pct(s.window[1] - s.window[0] + 1)}" title="예상 피트 윈도 ${s.window[0]}–${s.window[1]}랩 (최적 +2초 이내)"></i>` : "")).join("") : "";
    const segs = Rg.map((r, i) => `<button class="gp-seg cmp-bg-${esc(r.compound)} ${SEL.num === String(e.num) && SEL.i === i ? "on" : ""}" data-act="pre:sel" data-num="${esc(e.num)}" data-i="${i}" style="left:${pct(r.from - 1)};width:${pct(r.laps)}" title="${esc(CMP_KO[r.compound] || r.compound)} ${r.from}–${r.to}랩 (${r.laps}랩) – 눌러서 편집"><span>${esc(CMP_1[r.compound] || "?")}<small class="num">${r.laps}</small></span></button>`).join("");
    const handles = Rg.slice(0, -1).map((r, i) => `<b class="gp-stop ${clash.includes(r.to) ? "clash" : ""}" data-num="${esc(e.num)}" data-i="${i}" style="left:${pct(r.to)}" title="${i + 1}번째 피트: ${r.to}랩 끝 – 끌어서 이동"><em class="num">${r.to}</em></b>`).join("");
    const rc = SEL.showRec && R ? R.cars.find((x) => String(x.num) === String(e.num))?.best : null;
    let prev = 0;
    const recRow = rc ? `<div class="gp-row gp-recrow"><span class="gp-who" title="엔진 추천 – 적용을 눌러야 바뀌어요">추천</span><div class="gp-rbar">${rc.plan.map((s) => { const from = prev; prev = s.toLap; return `<i class="cmp-bg-${esc(s.compound)}" style="left:${pct(from)};width:${pct(s.toLap - from)}" title="추천 ${esc(CMP_KO[s.compound] || s.compound)} ${from + 1}–${s.toLap}랩"><span>${esc(CMP_1[s.compound] || "?")}</span></i>`; }).join("")}</div></div>` : "";
    return `<div class="gp-row"><span class="gp-who" style="--tc:${esc(e.colour || "#888")}"><b>${esc(e.tla)}</b><small>#${esc(e.num)}</small></span><div class="gp-bar" data-num="${esc(e.num)}">${wins}${segs}${handles}</div></div>${recRow}`;
  }).join("");
  const clashMarks = clash.map((L) => `<i class="gp-clash" style="left:${pct(L)}" title="${L}랩: 두 차 같은 랩 피트 – 붙어 들어오면 뒤차가 약 ${Math.round(QUEUE_S)}초 대기"><em>⚠ ${L}</em></i>`).join("");
  return `<div class="gp-tl">${wx}<div class="gp-tlrows">${rows}<div class="gp-clashes">${clashMarks}</div></div>
    <div class="gp-row gp-axis"><span class="gp-who"></span><div>${ticks.map((L) => `<i style="left:${pct(L)}">${L}</i>`).join("")}<i style="left:100%">${total}</i></div></div></div>`;
}

// the editor of the selected stint
function editor(sc, total, V) {
  const num = SEL.num, p = G.plans[num]; if (!p) return "";
  const e = myCars(sc).find((x) => String(x.num) === String(num)), Rg = P.ranges(p), i = Math.min(SEL.i, Rg.length - 1), r = Rg[i], last = i === Rg.length - 1;
  const cmp = compoundsFor(sc), R = recOf(sc), inv = R?.inventory?.cars?.[num];
  const have = (c) => (Array.isArray(inv) ? inv.filter((s) => s.compound === c).length : null);
  const errs = (V.cars[num]?.errors || []).filter((x) => x.stint === i), warns = (V.cars[num]?.warnings || []).filter((x) => x.stint === i);
  return `<div class="g-card gp-ed" style="--tc:${esc(e?.colour || "#888")}">
    <div class="gp-ed-h"><b>${esc(e?.tla || num)}</b> <span>${i + 1}번째 스틴트 · <span class="num">${r.from}–${r.to}랩 (${r.laps}랩)</span>${i === 0 ? " · 출발 타이어" : ""}</span>
      <span class="gp-ed-nav"><button class="ui-btn ghost sm" data-act="pre:selMove" data-d="-1" ${i ? "" : "disabled"} aria-label="이전 스틴트">‹ 이전</button><button class="ui-btn ghost sm" data-act="pre:selMove" data-d="1" ${last ? "disabled" : ""} aria-label="다음 스틴트">다음 ›</button></span></div>
    <div class="gp-ed-b">
      <div class="gp-f"><small>타이어</small><div class="ui-seg gp-tyres" role="group" aria-label="타이어">${cmp.list.map((c) => `<button data-act="pre:cmp" data-num="${esc(num)}" data-i="${i}" data-c="${c}" aria-pressed="${c === r.compound}" title="${esc(CMP_KO[c] || c)}">${cmpChip(c)}<span>${esc(CMP_KO[c] || c)}</span>${have(c) != null ? `<small class="num">${have(c)}</small>` : ""}</button>`).join("")}</div></div>
      <div class="gp-f"><small>피트 랩 (이 스틴트의 끝)</small>${last ? `<span class="muted">끝까지 (${total}랩)</span>` : `<input class="ui-input num" type="number" min="1" max="${total - 1}" value="${r.to}" data-chg="pre:end" data-num="${esc(num)}" data-i="${i}" aria-label="피트 랩">`}</div>
      <div class="gp-f"><small>길이 (랩)</small>${last ? `<span class="num">${r.laps}</span>` : `<input class="ui-input num" type="number" min="1" max="${total - 1}" value="${r.laps}" data-chg="pre:len" data-num="${esc(num)}" data-i="${i}" aria-label="스틴트 길이">`}</div>
      <div class="gp-f gp-ops"><small>스틴트</small><span>
        <button class="ui-btn sm" data-act="pre:up" data-num="${esc(num)}" data-i="${i}" ${i ? "" : "disabled"} title="앞 스틴트와 순서 바꾸기">← 앞으로</button>
        <button class="ui-btn sm" data-act="pre:down" data-num="${esc(num)}" data-i="${i}" ${last ? "disabled" : ""} title="뒤 스틴트와 순서 바꾸기">뒤로 →</button>
        <button class="ui-btn sm" data-act="pre:add" data-num="${esc(num)}" ${Rg.length < 6 ? "" : "disabled"} title="가장 긴 스틴트를 반으로 나눠 피트 1회 추가">+ 피트 추가</button>
        <button class="ui-btn sm danger" data-act="pre:del" data-num="${esc(num)}" data-i="${i}" ${Rg.length > 1 ? "" : "disabled"} title="이 스틴트 삭제 (피트 1회 줄임)">삭제</button></span></div>
    </div>
    ${errs.map((x) => `<p class="g-err">✕ ${esc(x.text)}</p>`).join("")}${warns.map((x) => `<p class="${x.severe ? "g-err" : "g-warn"}">⚠ ${esc(x.text)}</p>`).join("")}
    ${have(r.compound) === 0 ? `<p class="g-err">✕ ${esc(CMP_KO[r.compound] || r.compound)} 세트가 없어요</p>` : ""}
  </div>`;
}

// each car: estimate (with its spread), sets needed vs in hand, start modes, the assist choice, its checks
function carCard(sc, e, total, V, short, R) {
  const p = G.plans[e.num], grid = (sc.grid?.slots || []).find((s) => String(s.num) === String(e.num))?.pos, pl = (sc.grid?.pitLane || []).some((x) => String(x.num ?? x) === String(e.num));
  const EK = HM.energyKo(season());
  const seg = (key, list, ko) => `<div class="ui-seg sm" role="group">${p.assist ? `<button data-act="pre:mode" data-num="${esc(e.num)}" data-k="${key}" data-v="" aria-pressed="${p[key] == null}">AI 맡김</button>` : ""}${list.map((v) => `<button data-act="pre:mode" data-num="${esc(e.num)}" data-k="${key}" data-v="${v}" aria-pressed="${(p[key] || (p.assist ? null : "balanced")) === v}">${ko[v]}</button>`).join("")}</div>`;
  const errs = (V?.errors || []).filter((x) => x.stint == null), warns = (V?.warnings || []).filter((x) => x.stint == null);
  return `<div class="g-card gp-car" style="--tc:${esc(e.colour || "#888")}">
    <h3><b class="gp-num num">${esc(e.num)}</b> ${esc(e.name || e.tla)} <small>${pl ? "피트레인 출발" : grid ? `그리드 ${grid}번` : ""} · ${p.src === "default" ? "엔진 기본 계획" : p.src.startsWith("rec:") ? "추천 적용" : "직접 편집"}</small></h3>
    <div class="gp-sum">${P.ranges(p).map((r) => `${cmpChip(r.compound)}<small class="num">${r.laps}</small>`).join('<i class="gp-arrow">›</i>')} <span class="muted">${p.stints.length - 1}스톱</span></div>
    <div class="gp-est" data-est="${esc(e.num)}">${estLine(sc, e)}</div>
    <p class="gp-sets">${short == null ? `<span class="muted">${R ? esc(NO_INVENTORY) : "세트 재고 확인 중…"}</span>` : short.length ? short.map((s) => `<span class="g-err">✕ ${esc(CMP_KO[s.compound] || s.compound)} 세트 부족 – 필요 ${s.need}, 보유 ${s.have}</span>`).join(" ") : `<span class="t-gain">세트 충분</span> <small class="muted">(게임용 가정 배정)</small>`}</p>
    <div class="gp-line"><span class="gp-lab">출발 페이스</span>${seg("pace", P.PACE_MODES, PACE_KO)}</div>
    <div class="gp-line"><span class="gp-lab">출발 에너지</span>${seg("energy", P.ENERGY_MODES, EK)}</div>
    <label class="gp-assist ui-check"><input type="checkbox" data-chg="pre:assist" data-num="${esc(e.num)}" ${p.assist ? "checked" : ""}><span><b>팀 AI 보조</b> <small>${p.assist ? "켜짐 – 경기 중 팀 AI가 피트·타이어와 'AI 맡김' 모드를 조정. 직접 지시한 종류는 그때부터 내 지시를 따르고, 경기 중 'AI에 맡기기'로 되돌릴 수 있어요." : "꺼짐 – 이 계획과 모드를 그대로. 바꾸려면 경기 중에 직접 지시해요."}</small></span></label>
    ${errs.map((x) => `<p class="g-err">✕ ${esc(x.text)}</p>`).join("")}${warns.map((x) => `<p class="${x.severe ? "g-err" : "g-warn"}">⚠ ${esc(x.text)}</p>`).join("")}
  </div>`;
}

// the estimator's numbers for the player's plan (or why there are none) – rounded to the spread, with the model's limits
function estLine(sc, e) {
  const E = est();
  if (!G.engine) return PENDING;
  if (!E) return `<span class="g-pending">전략 추정기 없음</span>`;
  const p = G.plans[e.num], r = E.planOf(sc, G.seed, G.teamKey, e.num, p), rec = E.get(sc, G.seed, G.teamKey);
  if (!r) return `<span class="muted">${E.status === "failed" ? `계산 실패: ${esc(E.err || "?")}` : "예상 시간 계산 중…"}</span>`;
  if (!r.ok) return `<span class="g-warn">이 계획은 추정기로 계산하지 못했어요 (${esc(r.err)})</span>`;
  const v = r.v, step = v.sd >= 30 ? 10 : v.sd >= 10 ? 5 : 1, rd = (s) => Math.round(s / step) * step;
  const best = rec?.ok ? rec.v.cars.find((c) => String(c.num) === String(e.num))?.best : null;
  const vs = best && !P.sameStints(p, { stints: best.plan }) ? `<span>추천보다 <b class="num">${fmtEst(v.mean - best.mean, v.sd)}초</b></span>` : best ? `<span class="t-gain">추천과 같음</span>` : "";
  const stops = v.stops.map((s, i) => `${i + 1}번째 ${s.lap}랩${s.window ? ` <small class="muted">(윈도 ${s.window[0]}–${s.window[1]})</small>` : ""}`).join(" · ");
  return `<div class="gp-est-n"><span>예상 <b class="num">${fmtRace(rd(v.mean))}</b></span><span class="muted num">10–90% ${fmtRace(rd(v.p10))}–${fmtRace(rd(v.p90))}</span>${vs}</div>
    ${stops ? `<div class="gp-stops">${stops}</div>` : `<div class="muted">무정차 계획</div>`}`;
}

function sideCards(sc, mine, R) {
  const E = est(), rec = E?.get(sc, G.seed, G.teamKey);
  const status = !E ? `<p class="g-pending">전략 추정기 없음</p>` : !rec ? `<div class="ui-state"><i class="ui-spin"></i><span>${E.status === "failed" ? `계산 실패: ${esc(E.err || "?")}` : "추천 계산 중"}</span></div>` : !rec.ok ? `<p class="g-warn">추천을 계산하지 못했어요: ${esc(rec.err)}</p>` : "";
  const recCard = `<div class="g-card"><h3>엔진 추천 <small>적용을 눌러야 내 계획이 바뀌어요</small></h3>${status}
    ${R ? mine.map((e) => { const c = R.cars.find((x) => String(x.num) === String(e.num)); if (!c?.best) return `<p class="muted">${esc(e.tla)}: 추천을 만들 자료가 부족해요</p>`;
      const line = (x, best) => { const same = P.sameStints(G.plans[e.num], { stints: x.plan }); return `<div class="gp-rec ${same ? "same" : ""}"><span class="gp-rec-p">${x.plan.map((s, i) => cmpChip(s.compound) + `<small class="num">${i < x.plan.length - 1 ? s.toLap : ""}</small>`).join("")}</span>
        <span class="num">${best ? `${x.stops}스톱 · ${fmtRace(Math.round(x.mean / 10) * 10)}` : `${fmtEst(x.vsBest, x.sdRel)}초`}</span>
        ${same ? `<small class="muted">현재 계획</small>` : `<button class="ui-btn sm" data-act="pre:apply" data-num="${esc(e.num)}" data-key="${esc(x.key)}">적용</button>`}</div>`; };
      return `<h4>${esc(e.tla)} <small>최선 · 대안 (최선 대비)</small></h4>${line(c.best, true)}${c.alternatives.slice(0, 3).map((a) => line(a, false)).join("")}`; }).join("") : ""}
    ${R?.conflicts?.length ? R.conflicts.map((c) => `<p class="g-warn">추천끼리: ${esc(c.text)}</p>`).join("") : ""}
    ${R ? `<ul class="gp-limits">${[...(R.limits || []), "숫자는 시간 차를 그 불확실성에 맞춰 반올림했어요"].map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>`;
  const wx = R ? `<div class="g-fc">${R.weather.blocks.slice(0, 8).map((b) => `<span title="${fmtT(b.from)}–${fmtT(b.to)}"><i style="--p:${b.pRain}"></i><b class="num">${Math.round(b.pRain * 100)}%</b><small class="num">${fmtT(b.from).replace(/^00:/, "")}</small></span>`).join("")}</div>
    <p>${esc(R.weather.text)} <small class="muted">· 기온 ${R.weather.airT ?? "?"}°C · 노면 ${R.weather.trackT ?? "?"}°C</small></p><p class="muted gd-small">게임 내부 예보(시드 ${G.seed}) – 15분 단위 비 확률. ${esc(R.weather.uncertainty)} 실제 경기에서 비가 왔는지는 쓰지 않아요.</p>` : `<p class="muted">예보 계산 중…</p>`;
  const rule = ruleOf(sc), cmp = compoundsFor(sc), inv = R?.inventory;
  const invLine = inv ? mine.map((e) => { const sets = inv.cars?.[e.num] || [], by = {}; for (const s of sets) { const b = by[s.compound] || (by[s.compound] = { n: 0, used: 0 }); b.n++; if (s.used) b.used++; } return `<p><b>${esc(e.tla)}</b> ${Object.entries(by).map(([k, b]) => `${cmpChip(k)}<small class="num">${b.n}${b.used ? ` (중고 ${b.used})` : ""}</small>`).join(" ")}</p>`; }).join("") : "";
  const slots = [...(sc.grid?.slots || [])].sort((a, b) => a.pos - b.pos), ents = new Map(sc.entries.map((x) => [String(x.num), x])), pl = sc.grid?.pitLane || [];
  return `${recCard}
    <div class="g-card"><h3>날씨 예보 <small>게임 예보 – 실제와 달라요</small></h3>${wx}</div>
    <div class="g-card"><h3>타이어·규정</h3>
      <p>규정: ${esc(rule?.text || "규정 자료 없음")}</p>
      <p>쓸 수 있는 타이어 ${cmp.list.map((c) => cmpChip(c)).join(" ")}${cmp.est ? ` <small class="muted">(${esc(cmp.source)})</small>` : ""}</p>
      ${inv ? `<h4>보유 세트 <small>${esc(inv.source)}</small></h4>${invLine}` : `<p class="muted">${esc(NO_INVENTORY)}</p>`}
      ${R ? `<p class="gd-small">피트 손실 추정: ${esc(R.pitLoss.text)}</p>` : ""}</div>
    <div class="g-card"><h3>출발 순서 <small>경기 전 공개 그리드</small></h3>
      <ol class="g-grid-list">${slots.map((s) => { const x = ents.get(String(s.num)); return `<li class="${x?.teamKey === G.teamKey ? "mine" : ""}"><b class="num">${s.pos}</b><i style="background:${esc(x?.colour || "#888")}"></i>${esc(x?.tla || s.num)}</li>`; }).join("")}${pl.map((x) => `<li><b>PL</b>${esc(ents.get(String(x.num ?? x))?.tla || x.num || x)}</li>`).join("")}</ol></div>`;
}

// the estimator answered: repaint the numbers only (the editor's inputs keep focus)
function repaintNumbers() {
  const sc = G.sc; if (!sc || G.step !== "prerace") return;
  const R = recOf(sc);
  // (the sets check, the start button and the editor's stock depend on the inventory, which comes with the recommendation:
  // the first answer repaints the whole screen once – unless the player is typing in a field)
  if (R && !SEL.recPainted && !document.activeElement?.matches?.("#gameBody input")) { paint(); return; }
  for (const e of myCars(sc)) { const el = document.querySelector(`[data-est="${CSS.escape(String(e.num))}"]`); if (el) el.innerHTML = estLine(sc, e); }
  const side = document.querySelector(".gp-side"); if (side) side.innerHTML = sideCards(sc, myCars(sc), R);
  const tl = document.querySelector(".gp-tl-card .gp-tl"); if (tl && !drag) tl.outerHTML = timeline(sc, myCars(sc), sc.race.laps, R);
}

// ---------- after a paint: ask for the numbers, wire the timeline's drag ----------
export function afterPaint() { if (G.sc) want(); }
let drag = null;
document.addEventListener("pointerdown", (ev) => {
  const h = ev.target.closest?.(".gp-stop"); if (!h || G.step !== "prerace" || !G.sc) return;
  const bar = h.parentNode, rect = bar.getBoundingClientRect(), num = h.dataset.num, i = +h.dataset.i, total = G.sc.race.laps;
  drag = { num, i, rect, total, h, lap: P.ranges(G.plans[num])[i].to };
  h.setPointerCapture(ev.pointerId); h.classList.add("drag"); ev.preventDefault();
});
document.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  const { rect, total, num, i, h } = drag, lap = Math.round(((ev.clientX - rect.left) / rect.width) * total);
  const p = P.setEnd(G.plans[num], i, lap, total), to = p.stints[i].toLap;
  if (to === drag.lap) return;
  drag.lap = to; h.style.left = `${(to / total) * 100}%`; h.querySelector("em").textContent = to;
});
document.addEventListener("pointerup", () => {
  if (!drag) return;
  const { num, i, total, lap } = drag; drag = null;
  G.plans[num] = P.setEnd(G.plans[num], i, lap, total); SEL.num = String(num); SEL.i = i; paint();
});

// ---------- actions ----------
const edit = (num, f) => { G.plans[num] = f(G.plans[num]); startErr = null; paint(); };
export function onClick(act, b) {
  if (act === "start") { start(); return; }
  if (act === "selMove") { const n = G.plans[SEL.num]?.stints.length || 1; SEL.i = Math.max(0, Math.min(n - 1, SEL.i + +b.dataset.d)); paint(); return; }
  const num = b.dataset.num, i = +b.dataset.i, total = G.sc?.race.laps;
  if (!num || !G.plans[num]) return;
  if (act === "sel") { SEL.num = String(num); SEL.i = i; paint(); return; }
  if (act === "cmp") return edit(num, (p) => (i === 0 ? P.setStart(p, b.dataset.c) : P.setCompound(p, i, b.dataset.c)));
  if (act === "add") { SEL.num = String(num); return edit(num, (p) => P.addStint(p, total)); }
  if (act === "del") { SEL.i = Math.max(0, i - 1); return edit(num, (p) => P.removeStint(p, i, total)); }
  if (act === "up") { SEL.i = i - 1; return edit(num, (p) => P.moveStint(p, i, -1, total)); }
  if (act === "down") { SEL.i = i + 1; return edit(num, (p) => P.moveStint(p, i, +1, total)); }
  if (act === "mode") return edit(num, (p) => P.setMode(p, b.dataset.k, b.dataset.v || null));
  if (act === "apply") {
    const rec = est()?.get(G.sc, G.seed, G.teamKey); const c = rec?.ok ? rec.v.cars.find((x) => String(x.num) === String(num)) : null;
    const x = c && [c.best, ...c.alternatives].find((a) => a?.key === b.dataset.key); if (!x) return;
    return edit(num, (p) => P.planFrom(x.plan, { src: "rec:" + x.key, pace: p.pace, energy: p.energy, assist: p.assist }));
  }
}
export function onChange(act, t) {
  const num = t.dataset.num;
  if (act === "seed") { G.seed = Math.max(1, Math.min(999999, Math.round(+t.value) || 1)); paint(); return; }
  if (act === "showRec") { SEL.showRec = !!t.checked; paint(); return; }
  if (act === "end" && G.plans[num]) return edit(num, (p) => P.setEnd(p, +t.dataset.i, +t.value, G.sc.race.laps));
  if (act === "len" && G.plans[num]) { const i = +t.dataset.i, R = P.ranges(G.plans[num]); return edit(num, (p) => P.setEnd(p, i, R[i].from - 1 + Math.max(1, Math.round(+t.value) || 1), G.sc.race.laps)); }
  if (act === "assist" && G.plans[num]) return edit(num, (p) => P.setMode(p, "assist", t.checked));
}

// ---------- start ----------
async function start() {
  const sc = G.sc; if (!sc || !G.engine) return;
  const V = P.validate(G.plans, ctxOf(sc)); if (!V.ok) { paint(); return; }
  const T = P.toEngine(G.plans), EK = HM.energyKo(season());
  const runOpts = { seed: G.seed, userTeam: G.teamKey, weatherMode: "real", plans: T.plans, ai: true };
  G.startPlans = JSON.parse(JSON.stringify(T.plans));   // (the plans as the race starts – the result screen compares against them)
  try {
    est()?.cancel();
    await startRace({ runOpts, initialOrders: T.orders.map((o) => ({ ...o, text: `출발 전 ${o.type === "plan" ? "계획 고정 (AI 보조 끔)" : o.type === "pace" ? "페이스 " + PACE_KO[o.args.mode] : "에너지 " + EK[o.args.mode]}` })) });
  } catch (e) { startErr = `시작하지 못했어요: ${e.message || e}`; go("prerace"); }
}
// the result screen's 다시 시작: the same plans and seed, straight to the race (the plans kept since the start)
export async function restartSame() {
  if (!G.sc) { go("menu"); return; }
  ensurePlans(G.sc); go("prerace");
  await start();
}
