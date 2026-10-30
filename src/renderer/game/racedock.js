// The race screen's docked panels (v0.50 request §9-4, §5-2, §5-3, §5-6): opened on demand at the left of the 3D view,
// one at a time, from the tabs in the top bar –
//   전략   both cars' plans on one lap axis (applied plan vs the player's draft), the in-race plan editor (stop lap, next
//          tyre, add / remove a stop) with checks (sets in hand, the season's tyre rule, order of stops), 적용 / 취소 /
//          되돌리기 – editing never changes the engine's plan; only 적용 sends a "plan" order – and the alternatives for
//          the next stop from the team's strategy model (strategy.pitOptions: now / +1 / +2 / keep with loss range,
//          rejoin range, cars around, traffic, warm-up, team-mate queue, rules; an estimate, no odds, no "gain")
//   차량   the selected car in detail: tyre surface / core / window temperatures and their recent trend, life and wear
//          per lap, traffic, energy (battery, mode, power, this lap's use / recovery – game data), the season's rule
//          states (2025: DRS automatic; 2026: Overtake eligibility and the active aero state – never a button), fuel
//   날씨   the game's own forecast (15-minute rain chance; a forecast, not a radar) and the weather now
//   사건   the race's events at render time (mine only / all) and the alerts raised
//   팀     team orders
//   알림   the alert settings (alertsui.js)
// Repainted at 1 Hz by racehud.paint (texts compared before writing); the strategy editor only when what it shows changed
// and none of its inputs has the focus (typing a lap is never interrupted).
import { G, myCars, sendOrder } from "./gamehome.js";
import { esc, CMP_KO, CMP_1, ORDER_KO, PACE_KO, fmtT, fmtEst, cmpChip, compoundsFor, NO_INVENTORY } from "./ui.js";
import { whyKo, ST_KO } from "./orders.js";
import { TEAM_ORDER } from "../../game/engine/commands.js";
import * as HM from "./hudmodel.js";
import * as AlertsUI from "./alertsui.js";

export const TABS = [["strat", "전략"], ["car", "차량"], ["wx", "날씨"], ["ev", "사건"], ["team", "팀 지시"], ["alerts", "알림"]];
const D = { tab: null, el: null, dirty: true, stratKey: "", drafts: {}, base: {}, hist: {}, opts: {}, evMine: false, samples: {}, lastSample: {}, car: null, costs: { paints: 0, ms: 0 } };
try { const t = localStorage.getItem("f1kr:game:dock"); if (TABS.some(([k]) => k === t)) D.tab = t; } catch { /* per-viewer only */ }
const season = () => G.sc?.meta?.season ?? G.season ?? 2025;
const tlaOf = (n) => G.sc?.entries.find((x) => String(x.num) === String(n))?.tla || (n ? "#" + n : "");

export const open = () => D.tab;
export function toggle(t) { D.tab = D.tab === t ? null : t; D.dirty = true; D.stratKey = ""; try { localStorage.setItem("f1kr:game:dock", D.tab || ""); } catch { /* per-viewer only */ } }
export function build(el) { D.el = el; D.dirty = true; D.stratKey = ""; D.samples = {}; D.lastSample = {}; D.opts = {}; D.drafts = {}; D.base = {}; }
export function teardown() { D.el = null; }
export const markDirty = () => { D.dirty = true; };
export const costs = () => ({ paints: D.costs.paints, msAvg: D.costs.paints ? +(D.costs.ms / D.costs.paints).toFixed(3) : null });
const carNum = () => { const mine = myCars().map((e) => String(e.num)); return mine.includes(D.car) ? D.car : mine.includes(String(G.sel)) ? String(G.sel) : mine[0]; };
const setH = (el, s) => { if (el && el._h !== s) { el._h = s; el.innerHTML = s; } };

export function paint(snap, T, ctx = {}) {
  D.snap = snap; D.fuelH = ctx.fuel || D.fuelH;
  sample(snap, T);
  const el = D.el; if (!el) return;
  el.hidden = !D.tab;
  if (!D.tab) return;
  const t0 = performance.now();
  const body = ({ strat: stratPanel, car: carPanel, wx: wxPanel, ev: evPanel, team: teamPanel, alerts: alertsPanel }[D.tab] || (() => ""))(snap, T);
  if (body != null) {
    const head = `<div class="gd-h"><h3>${esc(TABS.find(([k]) => k === D.tab)?.[1] || "")}</h3>${["strat", "car"].includes(D.tab) ? carTabs() : ""}<button class="ui-btn ghost sm icon" data-act="hud:dock" data-v="${D.tab}" title="닫기" aria-label="패널 닫기">✕</button></div>`;
    setH(el, head + `<div class="gd-b">${body}</div>`);
  }
  D.dirty = false; D.costs.paints++; D.costs.ms += performance.now() - t0;
}
function carTabs() {
  const n = carNum();
  return `<div class="ui-seg sm" role="group" aria-label="차량">${myCars().map((e) => `<button data-act="hud:dockCar" data-num="${esc(e.num)}" aria-pressed="${String(e.num) === n}">${esc(e.tla)}</button>`).join("")}</div>`;
}
// the car panel's trend: one sample per 2 s of render time (Ts / Tc / Tw / life / soc), the last ~4 minutes
function sample(snap, T) {
  for (const e of myCars()) {
    const k = String(e.num), c = snap.cars.find((x) => String(x.num) === k); if (!c?.tyre) continue;
    if (D.lastSample[k] != null && T - D.lastSample[k] < 2000 && T >= D.lastSample[k]) continue;
    D.lastSample[k] = T;
    const h = D.samples[k] || (D.samples[k] = []);
    if (h.length && (T < h[h.length - 1].t || h[h.length - 1].set !== c.tyre.setId || h[h.length - 1].cmp !== c.tyre.compound)) h.length = 0;   // (a new set, or time went back: a new trend)
    h.push({ t: T, lap: c.lap, Ts: c.tyre.Ts, Tc: c.tyre.Tc, Tw: c.tyre.Tw, life: c.tyre.life, set: c.tyre.setId, cmp: c.tyre.compound });
    if (h.length > 120) h.shift();
  }
}

// ---------- 전략 ----------
const ruleOf = () => { try { return G.strat?.tyreRule ? G.strat.tyreRule({ state: { season: season() }, scenario: G.sc }) : null; } catch { return null; } };
function stockOf(c) { if (!Array.isArray(c?.sets)) return null; const m = {}; for (const s of c.sets) if (s.state === "free" || s.state === "reserved") m[s.compound] = (m[s.compound] || 0) + 1; return m; }
function stratPanel(snap, T) {
  const num = carNum(), c = snap.cars.find((x) => String(x.num) === num);
  if (!c?.plan) return `<div class="ui-state"><b>계획 자료 없음</b><span>엔진이 이 차의 계획을 아직 보내지 않았어요</span></div>`;
  const total = snap.totalLaps, plan = c.plan.stints, draft = D.drafts[num] || null, lap = c.lap || 0;
  const pend = [...G.book.list].reverse().find((o) => o.car === num && o.type === "plan");
  const pendSt = pend ? (G.book.stateAt ? G.book.stateAt(pend, T) : pend.state) : null;
  const op = D.opts[num];
  const key = JSON.stringify([num, plan, lap, draft, c.pit?.phase, c.own?.plan, pendSt, op?.lap, op?.err, D.hist[num]?.length, Object.values(stockOf(c) || {}), snap.cars.filter((x) => myCars().some((m) => String(m.num) === String(x.num))).map((x) => x.plan?.stints)]);
  if (key === D.stratKey && !D.dirty) return null;
  if (D.el?.contains(document.activeElement) && document.activeElement.matches("input, select")) return null;   // (typing: later)
  D.stratKey = key;
  if (!op || op.lap !== lap) refreshOptions(num);
  const cur = HM.curStint(draft || plan, lap), st = draft || plan;
  const chk = draft ? HM.liveCheck(draft, { lap, total, stock: stockOf(c), rule: ruleOf() }) : null;
  const moved = draft && D.base[num] && !HM.sameStints(D.base[num], plan);
  const cmps = compoundsFor(G.sc).list;
  const byKo = { player: "내 계획", "pre-race": "출발 전 계획" };
  const by = c.plan.by ? (byKo[c.plan.by] || (/^ai/.test(c.plan.by) ? "팀 AI" : /^goal/.test(c.plan.by) ? "목표 보조" : c.plan.by)) : "";
  // both cars on one lap axis: applied plans; the draft under its car
  const rows = myCars().map((e) => {
    const x = snap.cars.find((y) => String(y.num) === String(e.num)); if (!x?.plan) return "";
    const mineDraft = D.drafts[String(e.num)];
    return `${barRow(e.tla + (String(e.num) === num ? " ●" : ""), x.plan.stints, total, x.lap, "적용 중")}${mineDraft && !HM.sameStints(mineDraft, x.plan.stints) ? barRow("편집", mineDraft, total, x.lap, "편집 중", true) : ""}`;
  }).join("");
  const ticks = []; for (let L = 10; L < total; L += 10) ticks.push(L);
  const axis = `<div class="gd-axis"><span></span><div>${ticks.map((L) => `<i style="left:${HM.lapPct(L, total)}">${L}</i>`).join("")}<i style="left:100%">${total}</i></div></div>`;
  const ed = st.map((s, i) => {
    if (s.toLap <= lap && i < cur) return "";
    const isCur = i === cur, last = i === st.length - 1, from = (i ? st[i - 1].toLap : 0) + 1;
    return `<tr class="${isCur ? "cur" : ""}"><td>${isCur ? "지금" : i + 1}</td>
      <td>${isCur ? `${cmpChip(s.compound)} <small>장착 중</small>` : `<select class="ui-select sm" data-chg="hud:stCmp" data-i="${i}" aria-label="${i + 1}번째 스틴트 타이어">${cmps.map((k) => `<option value="${k}" ${k === s.compound ? "selected" : ""}>${esc(CMP_KO[k] || k)}</option>`).join("")}</select>`}</td>
      <td class="num">${Math.max(from, lap + 1)}–${s.toLap}</td>
      <td>${last ? `<small class="muted">끝까지</small>` : `<input class="ui-input sm gd-lap" type="number" min="${lap + 1}" max="${total - 1}" value="${s.toLap}" data-chg="hud:stEnd" data-i="${i}" aria-label="${i + 1}번째 스틴트가 끝나는 랩(피트 랩)">`}</td>
      <td>${i > cur ? `<button class="ui-btn ghost sm icon" data-act="hud:stDel" data-i="${i}" title="이 스틴트 삭제 (피트 1회 줄임)" aria-label="스틴트 삭제">✕</button>` : ""}</td></tr>`;
  }).join("");
  const canUndo = (D.hist[num] || []).length > 0;
  return `<section class="gd-sec"><h4>계획 <small>${esc(by)}${c.own?.plan ? ` · 결정: ${esc(HM.OWN_KO[c.own.plan] || c.own.plan)}` : ""}${pendSt === "queued" ? ` · <span class="t-stale">변경 대기</span>` : pendSt === "refused" || pendSt === "rejected" ? ` · <span class="t-lose">거절 – ${esc(whyKo(pend.why))}</span>` : ""}</small></h4>
      <div class="gd-tl">${rows}${axis}</div></section>
    <section class="gd-sec"><h4>${esc(tlaOf(num))} 남은 스틴트 편집 <small>편집만으로는 바뀌지 않아요 – 적용을 눌러야 엔진 계획이 바뀌어요</small></h4>
      <table class="gd-ed"><thead><tr><th></th><th>타이어</th><th>랩</th><th>피트 랩</th><th></th></tr></thead><tbody>${ed}</tbody></table>
      <div class="g-row"><button class="ui-btn sm" data-act="hud:stAdd">+ 피트 추가</button>
        <span class="gd-stock">${stockOf(c) ? `남은 세트 ${cmps.map((k) => `${cmpChip(k)}<small class="num">${stockOf(c)[k] || 0}</small>`).join(" ")}` : `<small class="muted">${esc(NO_INVENTORY)}</small>`}</span></div>
      ${moved ? `<p class="g-warn">편집을 시작한 뒤 적용 중인 계획이 바뀌었어요 (AI·피트) – 확인 후 적용하세요</p>` : ""}
      ${chk ? chk.errors.map((x) => `<p class="g-err">✕ ${esc(x)}</p>`).join("") + chk.warnings.map((x) => `<p class="g-warn">⚠ ${esc(x)}</p>`).join("") : ""}
      <div class="g-row gd-act"><button class="ui-btn primary sm" data-act="hud:stApply" ${draft && chk?.ok && !HM.sameStints(draft, plan) ? "" : "disabled"}>적용</button>
        <button class="ui-btn sm" data-act="hud:stCancel" ${draft ? "" : "disabled"}>편집 취소</button>
        <button class="ui-btn sm ghost" data-act="hud:stUndo" ${canUndo ? "" : "disabled"} title="직전에 적용한 변경 전 계획을 편집으로 불러와요 (이미 지난 피트는 되돌릴 수 없어요)">되돌리기</button></div></section>
    <section class="gd-sec">${optionsHtml(num, c)}</section>`;
}
function barRow(label, stints, total, lap, title, draft = false) {
  let prev = 0;
  const segs = stints.map((s) => { const from = prev; prev = s.toLap; return `<div class="gd-seg cmp-bg-${esc(s.compound)}" style="left:${HM.lapPct(from, total)};width:${HM.lapPct(s.toLap - from, total)}" title="${esc(CMP_KO[s.compound] || s.compound)} ${from + 1}–${s.toLap}랩"><span>${esc(CMP_1[s.compound] || "?")}</span></div>`; }).join("");
  return `<div class="gd-row ${draft ? "draft" : ""}"><span class="gd-who" title="${esc(title)}">${esc(label)}</span><div class="gd-bar">${segs}<i class="gd-done" style="width:${HM.lapPct(lap, total)}"></i><i class="gd-now" style="left:${HM.lapPct(lap, total)}"></i></div></div>`;
}
// the next stop's alternatives (strategy.pitOptions – the team model, own public view, read-only), once per lap
function refreshOptions(num) {
  const R = G.run, lap = R?.race.state.cars.find((c) => c.num === num)?.lap ?? null;
  if (!G.strat?.pitOptions || !R) { D.opts[num] = { lap, v: null, err: "none" }; return; }
  try { D.opts[num] = { lap, v: G.strat.pitOptions(R.race, num), err: null }; } catch (e) { D.opts[num] = { lap, v: null, err: String(e.message || e) }; }
}
const OPT_KO = { now: "지금 피트", plus1: "1랩 뒤", plus2: "2랩 뒤", keep: "계획대로" };
const TRAF_KO = { clear: "앞뒤 여유", one: "한 대와 가까움", busy: "차량 몰림" };
const WARM_KO = { oneLap: "1랩 워밍업", slowWarm: "워밍업 느림", wet: "젖은 노면" };
const WHYNOT_KO = { noStopPlanned: "계획된 피트 없음", tooLate: "이번 랩은 늦음" };
function optionsHtml(num, c) {
  const op = D.opts[num];
  if (!op || op.err === "none") return `<h4>다음 피트 대안</h4><p class="g-pending">엔진 연결 전</p>`;
  if (op.err) return `<h4>다음 피트 대안</h4><p class="g-warn">계산하지 못했어요: ${esc(op.err)}</p>`;
  const v = op.v; if (!v) return `<h4>다음 피트 대안</h4><p class="muted">주행 중인 차만 계산해요</p>`;
  const rows = v.options.map((o) => {
    const rj = o.rejoin, pos = rj?.pos ? (rj.pos[0] === rj.pos[1] ? `P${rj.pos[0]}` : `P${rj.pos[0]}–${rj.pos[1]}`) : "–";
    const around = rj ? [rj.ahead ? `앞 ${esc(rj.ahead.tla || tlaOf(rj.ahead.num))}${Number.isFinite(rj.ahead.gap) ? ` ${rj.ahead.gap.toFixed(0)}초` : ""}` : "", rj.behind ? `뒤 ${esc(rj.behind.tla || tlaOf(rj.behind.num))}${Number.isFinite(rj.behind.gap) ? ` ${rj.behind.gap.toFixed(0)}초` : ""}` : ""].filter(Boolean).join(" · ") : "";
    const loss = Array.isArray(o.loss) ? `${Math.round(o.loss[0])}–${Math.round(o.loss[1])}초` : "–";
    return `<div class="gd-opt ${o.possible ? "" : "no"}"><div class="gd-opt-h"><b>${OPT_KO[o.kind] || o.kind}</b>${o.stopLap ? `<small class="num">${o.stopLap}랩</small>` : ""}${o.compound ? `${cmpChip(o.compound)}<small>${o.set ? (o.set.used ? "중고" : "새 세트") : "세트 없음"}${Number.isFinite(o.sets) ? ` · ${o.sets}세트` : ""}</small>` : ""}
        ${o.possible ? `<button class="ui-btn sm" data-act="hud:optUse" data-k="${esc(o.kind)}" title="이 안을 편집으로 불러와요 – 적용은 따로">편집으로</button>` : `<small class="muted">${esc(WHYNOT_KO[o.why] || o.why || "불가")}</small>`}</div>
      ${o.possible ? `<div class="gd-opt-b"><span>피트 손실 <b class="num">${loss}</b></span><span>복귀 <b class="num">${pos}</b>${around ? ` <small>${around}</small>` : ""}</span>
        <span>${esc(TRAF_KO[rj?.traffic] || "")}${o.warmup ? ` · ${esc(WARM_KO[o.warmup] || o.warmup)}` : ""}${o.kind !== "now" && Number.isFinite(o.oldTyreCost) && o.oldTyreCost !== 0 ? ` · 헌 타이어 연장 비용 약 ${fmtEst(o.oldTyreCost, 2)}초` : ""}</span>
        ${o.queue > 0 ? `<span class="t-lose">동료 대기 약 ${Math.round(o.queue)}초${o.mate ? ` (${esc(tlaOf(o.mate.num))} ${o.mate.stop}랩 피트)` : ""}</span>` : o.mate ? `<span class="muted">동료 ${esc(tlaOf(o.mate.num))} ${o.mate.stop}랩 피트 – 대기 없음</span>` : ""}
        ${o.rule && !o.rule.ok ? `<span class="t-lose">규정: ${esc(o.rule.text || "미충족")}</span>` : ""}</div>` : ""}</div>`;
  }).join("");
  return `<h4>다음 피트 대안 <small>${v.lap}랩 기준 · 팀 전략 모델 추정 – 확률·승패 예측 아님</small><button class="ui-btn ghost sm" data-act="hud:optRefresh">다시 계산</button></h4>
    ${rows}${(v.assumptions || []).length ? `<ul class="gd-ass">${v.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}`;
}

// ---------- 차량 ----------
function carPanel(snap) {
  const num = carNum(), c = snap.cars.find((x) => String(x.num) === num); if (!c) return `<p class="muted">차량 자료 없음</p>`;
  const ty = c.tyre || {}, tt = HM.tyreTemp(ty), L = HM.tyreLife(ty), h = D.samples[num] || [], set = (c.sets || []).find((s) => s.state === "fitted");
  const wearPerLap = HM.perLap(h.map((x) => ({ lap: x.lap, v: x.life }))), tsTrend = HM.perLap(h.map((x) => ({ lap: x.lap, v: x.Ts })));
  const tr = c.traffic, EK = HM.energyKo(season()), en = c.energy || {}, s26 = season() >= 2026, ctl = snap.control || {};
  const n1 = (x) => (Number.isFinite(x) ? Math.round(x) : "–");
  const fh = burnOf(num);
  return `<section class="gd-sec"><h4>타이어 <small>${cmpChip(ty.compound)} ${esc(CMP_KO[ty.compound] || "")} · ${esc(HM.setLabel(set || (ty.used ? { used: true, laps: 0 } : null)) || "")}${ty.age != null ? ` · 이번 스틴트 ${ty.age}랩` : ""}</small></h4>
      <div class="gd-kvs"><span><small>남은 수명</small><span class="ui-meter ${L.cls}"><i><em style="width:${Math.round((L.life ?? 0) * 100)}%"></em></i></span><b class="num">${L.pct}</b></span>
        <span><small>랩당 마모</small><b class="num">${wearPerLap != null ? `${Math.abs(wearPerLap * 100).toFixed(1)}%` : "–"}</b></span>
        <span><small>온도 상태</small><b class="${tt.cls ? "t-" + (tt.key === "hot" ? "lose" : tt.key === "ok" ? "gain" : "none") : ""}">${esc(tt.label)}</b></span></div>
      <div class="gd-kvs"><span><small>표면</small><b class="num">${n1(ty.Ts)}°</b></span><span><small>코어</small><b class="num">${n1(ty.Tc)}°</b></span><span><small>작동 온도</small><b class="num">${n1(ty.Tw)}°</b></span><span><small>최적 범위</small><b class="num">${ty.win ? `${n1(ty.win.lo)}–${n1(ty.win.hi)}°` : "–"}</b></span></div>
      ${spark(h, ty.win)}
      <p class="gd-why">${esc(tyreWhy(tt, tsTrend, wearPerLap, c))}</p></section>
    <section class="gd-sec"><h4>교통</h4><p>${esc(HM.TRAFFIC_KO[tr] || (tr ? "주행 중" : "–"))}${c.with ? ` · ${esc(tlaOf(c.with))}` : ""}${tr === "follow" ? " – 앞차 뒤 난기류: 타이어가 더 달아오르고 코너 속도가 떨어져요" : ""}</p></section>
    <section class="gd-sec"><h4>에너지 <small>게임 데이터</small></h4>
      <div class="gd-kvs"><span><small>배터리</small><span class="ui-meter"><i><em style="width:${Math.round((en.soc ?? 0) * 100)}%"></em></i></span><b class="num">${Number.isFinite(en.soc) ? Math.round(en.soc * 100) + "%" : "–"}</b></span>
        <span><small>모드</small><b>${esc(EK[c.mode?.energy ?? en.mode] || "–")}</b></span><span><small>출력</small><b class="num">${Number.isFinite(en.deployKw) ? en.deployKw + " kW" : "–"}</b></span>
        <span><small>이번 랩 사용 / 회수</small><b class="num">${Number.isFinite(en.lapUsedMJ) ? `${en.lapUsedMJ.toFixed(1)} / ${(en.lapHarvMJ ?? 0).toFixed(1)} MJ` : "–"}</b></span></div>
      <p class="gd-rule">${s26
        ? `오버테이크: <b>${c.overtake ? "활성" : ctl.overtake ? "대기 (감지선 간격 조건)" : "비활성"}</b> · 액티브 에어로: <b>${c.aero?.open ? "직선 모드" : "코너 모드"}</b> <small class="muted">– 둘 다 경기 판정 상태, 버튼 아님</small>`
        : `DRS: <b>${c.drs ? "열림" : ctl.drs ? "사용 가능 구간에서 자동" : "사용 불가"}</b> <small class="muted">– 자동 판정</small>`}</p>
      <p class="muted gd-small">${esc(HM.energyHelp(season()))}</p></section>
    <section class="gd-sec"><h4>연료 <small>게임 추정</small></h4><p>${Number.isFinite(c.fuel) ? `<b class="num">${c.fuel.toFixed(1)} kg</b>` : "–"}${fh ? ` · 랩당 약 ${fh.per.toFixed(2)} kg · 완주까지 약 ${fh.need.toFixed(1)} kg 필요 · 여유 ${fh.marginLaps >= 0 ? "+" : "−"}${Math.abs(fh.marginLaps).toFixed(1)}랩` : " · 2랩 이상 달려야 추정해요"}</p></section>`;
}
// fuel burn from the car's own laps (the render-time picture's samples – racehud keeps them too; here from the trend)
function burnOf(num) {
  const h = D.fuelH?.[num] || [], c = snapCar(num); return h.length && c ? HM.fuelMargin(h, c.fuel, c.lap, D.snap?.totalLaps) : null;
}
// a short "why" from the car's own numbers: what the temperature and wear say, never a computed gain
function tyreWhy(tt, tsTrend, wear, c) {
  const ns = (c.plan?.stints || []).find((x, k, a) => x.toLap > (c.lap || 0) && k < a.length - 1), left = ns ? ns.toLap - c.lap : null;
  const parts = [];
  if (tt.key === "hot") parts.push(`작동 온도가 범위보다 ${tt.by}° 높아요${tsTrend > 0.5 ? " (최근 랩 상승 중)" : ""}`);
  else if (tt.key === "cold") parts.push(`작동 온도가 범위보다 ${tt.by}° 낮아요 – 그립이 덜 나와요`);
  else if (tt.key === "ok") parts.push("온도는 최적 범위 안");
  if (left != null) parts.push(`계획한 피트까지 ${left}랩`);
  if (tt.key === "hot" && left != null && left > 1) parts.push("관리 전환이 스틴트 유지에 유리할 수 있어요");
  if (wear != null && c.tyre?.life != null && left != null && wear < 0) { const proj = c.tyre.life + wear * left; if (proj < 0.25) parts.push(`이 마모 속도면 피트 랩에 남은 수명 약 ${Math.max(0, Math.round(proj * 100))}%`); }
  return parts.join(" · ");
}
// the surface / core trend as a small line chart: the window as a band, surface solid, core dashed (labelled – not colour alone)
function spark(h, win) {
  if (h.length < 3) return `<p class="muted gd-small">온도 추세: 자료 모으는 중</p>`;
  const W = 280, Hh = 64, vals = h.flatMap((x) => [x.Ts, x.Tc]).filter(Number.isFinite).concat(win ? [win.lo, win.hi] : []);
  const lo = Math.min(...vals) - 3, hi = Math.max(...vals) + 3, t0 = h[0].t, t1 = h[h.length - 1].t || t0 + 1;
  const X = (t) => ((t - t0) / Math.max(1, t1 - t0)) * W, Y = (v) => Hh - ((v - lo) / (hi - lo)) * Hh;
  const line = (k) => h.filter((x) => Number.isFinite(x[k])).map((x, i) => `${i ? "L" : "M"}${X(x.t).toFixed(1)},${Y(x[k]).toFixed(1)}`).join("");
  const band = win ? `<rect x="0" y="${Y(win.hi).toFixed(1)}" width="${W}" height="${Math.max(1, Y(win.lo) - Y(win.hi)).toFixed(1)}" class="sp-band"/>` : "";
  return `<figure class="gd-spark"><svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" role="img" aria-label="최근 타이어 온도 추세">${band}<path d="${line("Tc")}" class="sp-core"/><path d="${line("Ts")}" class="sp-surf"/></svg>
    <figcaption><span class="sp-k surf">표면</span><span class="sp-k core">코어</span>${win ? `<span class="sp-k band">최적 범위</span>` : ""}<span class="muted">최근 ${Math.max(1, Math.round((t1 - t0) / 60000))}분</span></figcaption></figure>`;
}

// ---------- 날씨 ----------
function wxPanel(snap) {
  const w = snap.weather || {};
  let fc = null; try { fc = G.engine?.forecast && G.run ? G.engine.forecast(G.run.race) : null; } catch { fc = null; }
  const mine = snap.cars.filter((x) => myCars().some((m) => String(m.num) === String(x.num)));
  const lapS = mine.map((x) => x.best?.t).filter(Number.isFinite)[0] || null;
  const now = `<div class="gd-kvs"><span><small>지금</small><b>${w.rain > 0.05 ? "비" : "건조"}</b></span><span><small>노면 물</small><b class="num">${Number.isFinite(w.water) ? w.water.toFixed(2) + " mm" : "–"}</b></span><span><small>기온</small><b class="num">${Number.isFinite(w.airT) ? Math.round(w.airT) + "°" : "–"}</b></span><span><small>노면</small><b class="num">${Number.isFinite(w.trackT) ? Math.round(w.trackT) + "°" : "–"}</b></span></div>`;
  if (!fc?.blocks?.length) return `<section class="gd-sec">${now}</section><p class="g-pending">예보 자료 없음</p>`;
  const blocks = fc.blocks.slice(0, 8).map((b) => `<span title="${fmtT(b.from)}–${fmtT(b.to)}"><i style="--p:${b.pRain}"></i><b class="num">${Math.round(b.pRain * 100)}%</b><small class="num">${fmtT(b.from).replace(/^00:/, "")}</small>${lapS ? `<small class="num">~${Math.round(b.from / 1000 / lapS)}랩</small>` : ""}</span>`).join("");
  return `<section class="gd-sec">${now}</section>
    <section class="gd-sec"><h4>게임 내부 예보 <small>${fmtT(fc.issued)} 발표 · 15분 단위 비 확률</small></h4><div class="g-fc">${blocks}</div>
      <p class="muted gd-small">팀이 받는 게임 예보예요 – 멀수록 오차가 커요. 레이더 영상이 아니고, 실제 경기의 날씨를 쓰지 않아요.${lapS ? " 랩 표시는 내 차 최고 랩 기준 대략값." : ""}</p></section>`;
}

// ---------- 사건 ----------
const EV_KO = { "driver error": "실수", contact: "접촉", mechanical: "고장", rc: "레이스 컨트롤", stewards: "스튜어드", retired: "리타이어", sc: "세이프티카", vsc: "VSC", red: "적색기", green: "녹색기", chequered: "체커기",
  pitCall: "피트 요청", pitCancel: "피트 요청 취소", pitEntry: "피트 진입", pitExit: "피트 출구", pitCommitted: "피트 진입 확정", pitLaneStart: "피트레인 출발", pitExitHold: "피트 출구 대기", start: "출발 준비", lightsOut: "출발",
  finished: "완주", fuelEmpty: "연료 소진", ersEmpty: "배터리 소진", teamOrder: "팀 지시", teamOrderDone: "팀 지시 완료", redTyreChange: "적색기 중 타이어 교체", rainStart: "비 시작", rainEnd: "비 그침",
  overtake: "추월", lapping: "랩 추월", "pit:work": "정비 시작", "pit:workDone": "정비 완료", "pit:release": "출발 신호", "pit:queue": "앞차 정비 대기", "pit:penalty": "페널티 정지", "pit:lane": "피트레인", "pit:approach": "박스 접근", "pit:exit": "피트 출구", "pit:entry": "피트 진입", "pit:laneOut": "피트레인 출구" };
const EV_SKIP = new Set(["defend", "attackAborted", "attack", "blueFlag", "yield", "pass"]);
// race control's own words (English in the engine's log) in plain Korean; anything else as it is
const RC = [[/^DRS ENABLED/, "DRS 사용 가능"], [/^DRS DISABLED/, "DRS 사용 불가"], [/TIME DELETED.*TRACK LIMITS/, "랩타임 삭제 – 트랙 리밋"], [/^TRACK CLEAR/, "트랙 정리 – 녹색기"], [/RED LIGHTS.*START/, "출발 절차 – 적색등"], [/LIGHTS OUT/, "출발"],
  [/SAFETY CAR DEPLOYED/, "세이프티카 투입"], [/SAFETY CAR IN THIS LAP/, "세이프티카 이번 랩 복귀"], [/VSC DEPLOYED|VIRTUAL SAFETY CAR DEPLOYED/, "VSC 발령"], [/VSC ENDING|VIRTUAL SAFETY CAR ENDING/, "VSC 종료 예정"], [/OVERTAKE ENABLED/, "오버테이크 사용 가능"], [/OVERTAKE DISABLED/, "오버테이크 사용 불가"], [/CHEQUERED FLAG/, "체커기"]];
const rcKo = (s) => { const x = String(s || ""); for (const [re, ko] of RC) if (re.test(x)) return ko; return x; };
const effText = (x) => x == null ? "" : typeof x === "string" ? rcKo(x) : [x.kind === "moment" ? "순간 실수" : x.kind, x.outcome && x.outcome !== "none" ? x.outcome : "", x.out ? "리타이어" : "", x.stoppedS ? `${x.stoppedS}초 정지` : "", x.damage ? "손상" : "", x.fault ? "결함" : ""].filter(Boolean).join(" · ");
// what an event says on screen. pit:work's own text carries the stop's length and any slow wheel, decided when the work
// STARTS – never shown; at pit:workDone the time it really took (both events already drawn) is shown.
function evDetail(e, all) {
  if (e.type === "pit:work") return "";
  if (e.type === "pit:workDone") { const w = all && [...all].reverse().find((x) => x.type === "pit:work" && x.car === e.car && x.t <= e.t); return w ? `정차 작업 ${((e.t - w.t) / 1000).toFixed(1)}초` : ""; }
  if (e.type === "pitCall") { const m = /^box for (\w+): (.*)$/.exec(String(e.effect || "")); return m ? `${CMP_KO[m[1]] || m[1]} · ${whyKo(m[2])}` : /^refused: (.*)/.test(String(e.effect)) ? `거절 – ${whyKo(String(e.effect).slice(9))}` : ""; }
  if (e.type === "pitCancel") return e.effect === "cancelled" ? "" : /^refused: (.*)/.test(String(e.effect)) ? `거절 – ${whyKo(String(e.effect).slice(9))}` : "";
  if (/^pit:/.test(e.type)) return "";
  { const m = /^passes (\w+) at (.+)$/.exec(String(e.effect || "")); if (m) return `${m[1]} 앞으로 · ${m[2].replace(/^straight/, "직선").replace(/\(?DRS zone (\d+)\)?/, (_, n) => HM.zoneKo(season(), n))}`; }
  return e.effect ? effText(e.effect) : e.cause && typeof e.cause === "string" && e.cause !== "player" && e.cause !== "pit" ? e.cause : "";
}
export const evShown = (e) => !EV_SKIP.has(e.type) && !/^ai:/.test(String(e.cause || ""));
export const evLine = (e, ents, all = null) => { const cars = e.car ? [e.car] : e.cars || []; const nm = (n) => ents?.get(String(n))?.tla || "#" + n; const d = evDetail(e, all);
  return `<p class="${cars.some((n) => myCars().some((m) => String(m.num) === String(n))) ? "mine" : ""}"><small class="num">${fmtT(e.t ?? 0)}${e.lap ? ` L${e.lap}` : ""}</small> <b>${esc(EV_KO[e.type] || e.type)}</b>${cars.length ? " " + cars.map((n) => esc(nm(n))).join(" ") : ""}${d ? ` · ${esc(d)}` : ""}</p>`; };
function evPanel(snap, T) {
  const ents = new Map(G.sc.entries.map((e) => [String(e.num), e])), mine = new Set(myCars().map((e) => String(e.num)));
  const past = G.events.filter((e) => (e.t ?? 0) <= T);
  const ev = past.filter(evShown).filter((e) => !D.evMine || (e.car ? mine.has(String(e.car)) : (e.cars || []).some((n) => mine.has(String(n))))).slice(-40).reverse();
  const notes = (G.notices || []).slice(-5).reverse();
  return `<div class="g-row"><div class="ui-seg sm" role="group" aria-label="사건 범위"><button data-act="hud:evMine" data-v="0" aria-pressed="${!D.evMine}">전체</button><button data-act="hud:evMine" data-v="1" aria-pressed="${D.evMine}">내 차</button></div></div>
    ${notes.length ? `<section class="gd-sec"><h4>알림</h4>${notes.map((a) => `<p class="gd-note ${HM.noticeCls(a.level)}"><small class="num">${fmtT(a.t)}</small> <b>${esc(AlertsUI.RULE_KO[a.rule] || a.rule)}</b>${a.car ? " " + esc(tlaOf(a.car)) : ""} · ${esc(a.text)}</p>`).join("")}</section>` : ""}
    <section class="gd-sec gd-ev">${ev.length ? ev.map((e) => evLine(e, ents, past)).join("") : `<p class="muted">사건 없음</p>`}</section>`;
}

// ---------- 팀 지시 ----------
const TEAM_HELP = { free: "두 차가 자유롭게 경쟁", hold: "지금 순서를 지키고 서로 공격하지 않음", swap: "앞차가 뒤차를 보내 순서를 바꿈" };
function teamPanel(snap, T) {
  const o = [...G.book.list].reverse().find((x) => x.type === "teamOrder"), s = o ? (G.book.stateAt ? G.book.stateAt(o, T) : o.state) : null;
  return `<section class="gd-sec"><div class="gd-team">${TEAM_ORDER.map((p) => `<button class="ui-btn" data-act="hud:team" data-v="${p}"><b>${ORDER_KO[p]}</b><small>${TEAM_HELP[p]}</small></button>`).join("")}</div>
    <p>${o ? `마지막 지시: ${esc(o.text || ORDER_KO[o.args?.policy] || "")} – <b class="gr-ord ${s}">${esc(ST_KO[s] || s)}</b>${o.why && (s === "refused" || s === "rejected") ? ` – ${esc(whyKo(o.why))}` : ""}` : `<span class="muted">팀 지시 없음 (자유 경쟁)</span>`}</p></section>`;
}
function alertsPanel() { return AlertsUI.settingsHtml({ compact: true }); }

// ---------- actions (racehud forwards the ones it doesn't know) ----------
export function onClick(act, b) {
  const num = carNum(), R = G.run, c = R ? snapCar(num) : null, total = R?.race.state.totalLaps, lap = c?.lap ?? 0;
  const edit = (f) => { const base = D.drafts[num] || c?.plan?.stints; if (!base) return; if (!D.drafts[num]) D.base[num] = c.plan.stints.map((s) => ({ ...s })); D.drafts[num] = f(base); D.dirty = true; D.stratKey = ""; repaint(); };
  if (act === "dockCar") { D.car = String(b.dataset.num); D.dirty = true; D.stratKey = ""; repaint(); return; }
  if (act === "evMine") { D.evMine = b.dataset.v === "1"; D.dirty = true; repaint(); return; }
  if (act === "team") { sendOrder("teamOrder", null, { policy: b.dataset.v }, `팀 지시 ${ORDER_KO[b.dataset.v]}`); return; }
  if (act === "stAdd") return edit((s) => HM.liveAdd(s, lap, total));
  if (act === "stDel") return edit((s) => HM.liveRemove(s, +b.dataset.i, lap, total));
  if (act === "stCancel") { delete D.drafts[num]; delete D.base[num]; D.dirty = true; D.stratKey = ""; repaint(); return; }
  if (act === "stUndo") { const h = D.hist[num] || []; if (!h.length) return; const prev = h[h.length - 1]; D.base[num] = c.plan.stints.map((s) => ({ ...s })); D.drafts[num] = prev.map((s) => ({ ...s })); D.dirty = true; D.stratKey = ""; repaint(); return; }
  if (act === "stApply") {
    const d = D.drafts[num]; if (!d || !c?.plan) return;
    const chk = HM.liveCheck(d, { lap, total, stock: stockOf(c), rule: ruleOf() }); if (!chk.ok) return;
    const h = D.hist[num] || (D.hist[num] = []); h.push(c.plan.stints.map((s) => ({ ...s }))); if (h.length > 10) h.shift();
    sendOrder("plan", num, { stints: d.map((s) => ({ compound: s.compound, toLap: s.toLap })) }, `${tlaOf(num)} 계획 변경 ${HM.stintsText(d)}`);
    delete D.drafts[num]; delete D.base[num]; D.dirty = true; D.stratKey = ""; return;
  }
  if (act === "optRefresh") { refreshOptions(num); D.dirty = true; D.stratKey = ""; repaint(); return; }
  if (act === "optUse") { const o = D.opts[num]?.v?.options.find((x) => x.kind === b.dataset.k); if (!o) return; if (o.kind === "keep") return edit((s) => s.map((x) => ({ ...x }))); return edit((s) => HM.liveStopAt(s, lap, o.stopLap, o.compound, total)); }
}
export function onChange(act, t) {
  const num = carNum(), c = snapCar(num), total = G.run?.race.state.totalLaps, lap = c?.lap ?? 0;
  const edit = (f) => { const base = D.drafts[num] || c?.plan?.stints; if (!base) return; if (!D.drafts[num]) D.base[num] = c.plan.stints.map((s) => ({ ...s })); D.drafts[num] = f(base); D.dirty = true; D.stratKey = ""; t.blur(); repaint(); };
  if (act === "stEnd") return edit((s) => HM.liveSetEnd(s, +t.dataset.i, +t.value, lap, total));
  if (act === "stCmp") return edit((s) => HM.liveSetCompound(s, +t.dataset.i, t.value, lap));
  if (t.dataset.chg?.startsWith("alerts:")) AlertsUI.onChange(act, t);
}
// my car in the render-time picture (the dock acts on what the player sees)
function snapCar(num) { return D.snap?.cars.find((x) => String(x.num) === String(num)) || null; }
function repaint() { import("./racehud.js").then((m) => { m.markOrders(); m.paint(); }); }
export { NO_INVENTORY, PACE_KO };
