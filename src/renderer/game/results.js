// The game result (v0.50 request §9-5, §5-7): a race the engine ran to its end – always labelled as a GAME result, never a
// real record; kept in userData/game/results. The team's two drivers side by side: final position, points, status, stops,
// the stints really run against the plan they started with (one lap axis), the plan changes (who, when), the decisive
// stops (each stop's loss and its team-mate queue), the main time losses the engine can separate (traffic, pit, queue,
// penalty – others are not separable and are not given a number), and the decision history: the player's orders (and the
// goal assist's) and the team AI's re-plans with their reasons (engine.analysis). No "another strategy would have won":
// nothing here was simulated twice.
// Actions: 다시 시작 (same plans, same seed), 전략부터 다시 편집, 차고로, 라이브 타이밍으로.
import { G, go, myCars, toPrerace, closeGame } from "./gamehome.js";
import { esc, teamKo, raceKo, STATUS_KO, cmpChip, CMP_KO, CMP_1, PENDING, fmtT } from "./ui.js";
import { evLine, evShown } from "./racedock.js";
import { whyKo } from "./orders.js";
import * as HM from "./hudmodel.js";

const ORD_KO = { pace: "페이스", energy: "에너지", pit: "피트", pitCancel: "피트 취소", plan: "계획 변경", teamOrder: "팀 지시", delegate: "AI에 맡김", goal: "목표" };

export function paint() {
  const r = G.result; if (!r) return `<div class="ui-state"><b>결과가 없어요</b><button class="ui-btn" data-act="go:menu">차고로</button></div>`;
  const mine = myCars(G.sc), mineSet = new Set(mine.map((e) => String(e.num))), ents = new Map((G.sc?.entries || []).map((e) => [String(e.num), e]));
  const total = r.analysis?.totalLaps || G.sc?.race?.laps || 0;
  return `<div class="gx">
    <header class="gx-head"><div><span class="ui-badge info">게임 결과 · 엔진 계산 – 실제 경기 기록이 아니에요</span>${r.dev ? ` <span class="ui-badge warn">개발용 스냅샷 (엔진 아님)</span>` : ""}
      <h2>${esc(raceKo(G.sc?.meta?.event))} <span class="muted">${esc(G.sc?.meta?.date || "")} · 시드 ${r.seed}</span></h2></div>
      <div class="gx-acts"><button class="ui-btn primary" data-act="res:restart" ${r.dev || !G.engine ? "disabled" : ""} title="같은 계획·같은 시드로 처음부터">다시 시작</button>
        <button class="ui-btn" data-act="res:again">전략부터 다시 편집</button><button class="ui-btn" data-act="go:menu">차고로</button><button class="ui-btn ghost" data-act="res:live">라이브 타이밍으로</button></div></header>
    <div class="gx-mine">${mine.map((e) => carCol(r, e, total)).join("")}</div>
    <div class="gx-cols">
      <div class="g-card"><h3>최종 순위 <small>게임 결과</small></h3><table class="g-tbl"><thead><tr><th class="r">순위</th><th>드라이버</th><th>팀</th><th class="r">랩</th><th class="r">차이</th><th class="r">정차</th><th class="r">점수</th><th>상태</th></tr></thead><tbody>
        ${r.classification.map((c) => `<tr class="${mineSet.has(String(c.num)) ? "mine" : ""}" style="--tc:${esc(ents.get(String(c.num))?.colour || "#888")}"><td class="r num">${c.pos ?? ""}</td><td>${esc(c.tla || c.num)}</td><td>${esc(teamKo(c.team))}</td><td class="r num">${c.laps}</td><td class="r num">${c.pos === 1 ? "" : Number.isFinite(c.gap) ? "+" + c.gap.toFixed(3) : c.lapsDown ? `+${c.lapsDown}랩` : ""}</td><td class="r num">${c.stops ?? ""}</td><td class="r num">${r.points?.[c.tla || c.num] || ""}</td><td>${esc(STATUS_KO[c.status] || c.status)}</td></tr>`).join("")}</tbody></table></div>
      <div>
        <div class="g-card"><h3>시간 손실 <small>엔진이 따로 셀 수 있는 항목만 – 내 차와 10위 안</small></h3>${r.accounts ? accountsHtml(r.accounts) : PENDING}</div>
        <div class="g-card"><h3>사건</h3><div class="gx-ev">${r.events.length ? r.events.filter(evShown).slice(-40).map((e) => evLine(e, ents, r.events)).join("") : `<p class="muted">기록된 사건 없음</p>`}</div></div>
      </div>
    </div>
    <p class="muted">${r.saved ? `결과 저장됨 (게임 폴더)` : r.saveErr ? `결과 저장 실패: ${esc(r.saveErr)}` : r.dev ? "개발용 결과는 저장하지 않아요." : "결과 저장 중…"}${r.loadedFrom ? ` · 저장 슬롯에서 이어서 완주` : ""}</p>
  </div>`;
}

// one of my drivers: position, points, stints vs plan, plan changes, stops, losses, decisions
function carCol(r, e, total) {
  const c = r.classification.find((x) => String(x.num) === String(e.num)) || {}, A = r.analysis?.cars?.[String(e.num)] || null;
  const actual = A?.stints?.length ? A.stints.map((s) => ({ compound: s.compound, toLap: s.toLap })) : (r.stints?.[c.tla] || null)?.map((s, i, a) => ({ compound: s.compound, toLap: a.slice(0, i + 1).reduce((x, y) => x + (y.laps || 0), 0) }));
  const planned = A?.plans?.[0]?.stints?.length ? A.plans[0].stints : r.runOpts?.plans?.[e.num]?.stints || null;
  const diffs = HM.planVsActual(planned, actual);
  const pts = r.points?.[c.tla || c.num];
  const changes = (A?.plans || []).slice(1);
  const stops = A?.pitParts || [];
  const orders = (A?.orders || []).filter((o) => o.type !== "pitCancel" || o.ok);
  const ai = A?.ai || [];
  const dec = [...orders.map((o) => ({ t: o.tEff ?? o.t, who: /^goal/.test(o.by) ? "목표" : "나", text: `${ORD_KO[o.type] || o.type}${orderArg(o)}`, ok: o.ok, why: o.why })), ...ai.map((d) => ({ t: d.t, who: "팀 AI", text: `${HM.aiWhyKo(d.why)}${d.plan ? ` → ${d.plan}` : ""}`, ok: true }))].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  const big = stops.slice().sort((a, b) => b.loss - a.loss)[0];
  return `<div class="g-card gx-car" style="--tc:${esc(e.colour || "#888")}">
    <div class="gx-car-h"><b class="gx-pos num">${c.pos ?? "–"}<small>위</small></b><span><b>${esc(e.name || e.tla)}</b><small>#${esc(e.num)} · ${esc(STATUS_KO[c.status] || c.status || "")} · 정차 ${c.stops ?? "?"}회 · ${pts ? `${pts}점` : "0점"}</small></span></div>
    <div class="gx-tl">${bar("계획", planned, total)}${bar("실제", actual, total)}</div>
    <ul class="gx-diff">${diffs.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
    ${A ? `<div class="gx-kvs"><span><small>피트 손실 합</small><b class="num">${A.pitTotal.toFixed(1)}초</b></span><span title="교통 때문에 잃은(+) / 번(−) 시간 – 엔진 근사"><small>교통 영향 합 (−: 이득)</small><b class="num">${A.trafficTotal.toFixed(1)}초</b></span>${big ? `<span><small>가장 큰 피트</small><b class="num">${big.lap}랩 ${big.loss.toFixed(1)}초</b>${big.queue > 0.05 ? `<small class="t-lose">동료 대기 ${big.queue.toFixed(1)}초</small>` : ""}</span>` : ""}</div>
      ${stops.length ? `<p class="gx-stops">${stops.map((s) => `<span>${s.lap}랩 <b class="num">${s.loss.toFixed(1)}초</b>${s.queue > 0.05 ? ` <small class="t-lose">(대기 ${s.queue.toFixed(1)})</small>` : ""}</span>`).join("")}<small class="muted">피트 손실: 피트레인 시간 − 같은 구간 본선 시간 (엔진 근사)</small></p>` : ""}
      ${changes.length ? `<h4>계획 변경 <small>${changes.length}회</small></h4><ul class="gx-list">${changes.length > 8 ? `<li class="muted">앞선 ${changes.length - 8}회 생략</li>` : ""}${changes.slice(-8).map((p) => `<li><small class="num">${p.lap}랩</small> <b>${esc(HM.byKo(p.by))}</b> ${esc(HM.stintsText(p.stints || []))}</li>`).join("")}</ul>` : `<p class="muted">경기 중 계획 변경 없음</p>`}
      <h4>결정 기록 <small>나 · 목표 보조 · 팀 AI</small></h4>
      <ul class="gx-list gx-dec">${dec.slice(-14).map((d) => `<li class="${d.ok ? "" : "no"}"><small class="num">${fmtT(d.t ?? 0)}</small> <b>${esc(d.who)}</b> ${esc(d.text)}${d.ok ? "" : ` <span class="t-lose">거절 – ${esc(whyKo(d.why))}</span>`}</li>`).join("") || `<li class="muted">기록 없음</li>`}</ul>` : `<p class="g-pending">경기 분석 자료 없음 (엔진 연결 전)</p>`}
  </div>`;
}
const orderArg = (o) => { const a = o.args || {}; return a.mode ? ` ${a.mode}` : a.compound ? ` ${CMP_KO[a.compound] || a.compound}` : a.kind !== undefined ? ` ${HM.GOAL_KO[a.kind] || "해제"}` : a.stints ? ` ${HM.stintsText(a.stints)}` : a.policy ? ` ${a.policy}` : ""; };
function bar(label, st, total) {
  if (!Array.isArray(st) || !st.length || !total) return `<div class="gx-row"><span>${label}</span><div class="gx-bar"><small class="muted">자료 없음</small></div></div>`;
  let prev = 0;
  return `<div class="gx-row"><span>${label}</span><div class="gx-bar">${st.map((s) => { const from = prev; prev = s.toLap; return `<i class="cmp-bg-${esc(s.compound)}" style="left:${HM.lapPct(from, total)};width:${HM.lapPct(s.toLap - from, total)}" title="${esc(CMP_KO[s.compound] || s.compound)} ${from + 1}–${s.toLap}랩"><span>${esc(CMP_1[s.compound] || "?")}${s.toLap - from >= 6 ? `<small>${s.toLap - from}</small>` : ""}</span></i>`; }).join("")}</div></div>`;
}
// the engine's accounts as it gives them (per car: { traffic, pit, pitQueue, penalty, approx: [...] } s)
function accountsHtml(a) {
  const rows = Object.entries(a.cars || a).filter(([, v]) => v && typeof v === "object");
  const all = ["traffic", "pit", "pitQueue", "penalty"], have = new Set(rows.flatMap(([, v]) => Object.keys(v))), keys = all.filter((k) => have.has(k)), ko = { traffic: "교통", pit: "피트", pitQueue: "그중 대기", penalty: "페널티" };
  return `<table class="g-tbl"><thead><tr><th>차</th>${keys.map((k) => `<th class="r">${ko[k]}</th>`).join("")}</tr></thead><tbody>${rows.map(([n, v]) => `<tr><td>${esc(n)}</td>${keys.map((k) => `<td class="r num">${Number.isFinite(v[k]) ? v[k].toFixed(1) + "초" + ((v.approx || []).includes(k) ? " ≈" : "") : "–"}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <p class="muted gd-small">≈ 엔진 근사 · 타이어 관리·에너지 운용으로 잃거나 얻은 시간은 깨끗하게 떼어낼 수 없어서 숫자로 보여주지 않아요</p>`;
}
export function onClick(act) {
  if (act === "again") { G.result = null; toPrerace(); return; }
  if (act === "live") { closeGame({ force: true }); return; }
  if (act === "restart") { import("./prerace.js").then((m) => { G.result = null; return m.restartSame(); }); return; }
}
export { CMP_KO };
