// The game result (v0.50 request §9-5, §5-7): a race the engine ran to its end – always labelled as a GAME result, never a
// real record; kept in userData/game/results. The team's two drivers side by side: final position, points, status, stops,
// the stints really run against the plan they started with (one lap axis), the plan changes (who, when), the decisive
// stops (each stop's loss and its team-mate queue), the main time losses the engine can separate (traffic, pit, queue,
// penalty – others are not separable and are not given a number), and the decision history: the player's orders (and the
// goal assist's) and the team AI's re-plans with their reasons (engine.analysis). No "another strategy would have won":
// nothing here was simulated twice.
// Actions: 다시 시작 (same plans, same seed), 전략부터 다시 편집, 차고로, 라이브 타이밍으로.
import { G, go, myCars, toPrerace, closeGame } from "./gamehome.js";
import { esc, teamKo, raceKo, STATUS_KO, cmpChip, CMP_KO, CMP_1, PENDING, fmtT, PACE_KO } from "./ui.js";
import { truthAt } from "../../game/engine/weather.js";
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

// one of my drivers: position, points, then the race on ONE lap axis (v0.52 §10-2): the plan it started with, the stints
// it really ran with each stop and its loss, every decision (who: team AI / 나 / 목표 보조) at its lap, the traffic loss
// per lap, the game's rain per lap and the SC / VSC / red-flag periods – then the same as a table by lap, each number
// marked by its source (engine record vs an estimate made at the time). hudmodel raceStory / storyRows: tested.
function carCol(r, e, total) {
  const c = r.classification.find((x) => String(x.num) === String(e.num)) || {}, A = r.analysis?.cars?.[String(e.num)] || null;
  const fallbackActual = (r.stints?.[c.tla] || null)?.map((s, i, a) => ({ compound: s.compound, toLap: a.slice(0, i + 1).reduce((x, y) => x + (y.laps || 0), 0) }));
  const S = A ? HM.raceStory(A, { flags: r.analysis?.flags || [], total, weather: r.weather || [] }) : null;
  const actual = S?.actual?.length ? S.actual : fallbackActual;
  const planned = S?.planned?.length ? S.planned : r.runOpts?.plans?.[e.num]?.stints || null;
  const diffs = HM.planVsActual(planned, actual);
  const pts = r.points?.[c.tla || c.num];
  const head = `<div class="gx-car-h"><b class="gx-pos num">${c.pos ?? "–"}<small>위</small></b><span><b>${esc(e.name || e.tla)}</b><small>#${esc(e.num)} · ${esc(STATUS_KO[c.status] || c.status || "")} · 정차 ${c.stops ?? "?"}회 · ${pts ? `${pts}점` : "0점"}</small></span></div>`;
  if (!S) return `<div class="g-card gx-car" style="--tc:${esc(e.colour || "#888")}">${head}<div class="gx-tl">${bar("계획", planned, total)}${bar("실제", actual, total)}</div><ul class="gx-diff">${diffs.map((d) => `<li>${esc(d)}</li>`).join("")}</ul><p class="g-pending">경기 분석 자료 없음 (엔진 연결 전)</p></div>`;
  const rows = HM.storyRows(S, ordText);
  const wxLine = [S.rainy.length ? `비 ${HM.lapsText(S.rainy)}랩` : S.hasRain ? "비 없음" : "", S.hasWater && S.wet.length ? `젖은 노면 ${HM.lapsText(S.wet)}랩` : "", S.onWet.length ? `우천 타이어 ${HM.lapsText(S.onWet)}랩` : "우천 타이어 안 씀"].filter(Boolean).join(" · ");
  return `<div class="g-card gx-car" style="--tc:${esc(e.colour || "#888")}">${head}
    <div class="gx-kvs"><span title="피트레인 시간 − 같은 구간을 경기 속도로 달린 시간 (엔진 근사)"><small>피트 손실 합 <i class="gx-src m">엔진 기록</i></small><b class="num">${HM.fmtS(S.pitTotal)}</b></span>
      <span title="같은 팀 차가 박스를 쓰는 동안 기다린 시간"><small>그중 동료 대기</small><b class="num ${S.queueTotal > 0.05 ? "t-lose" : ""}">${HM.fmtS(S.queueTotal)}</b></span>
      <span title="앞차 때문에 잃은(+) / 번(−) 시간의 합 – 엔진 근사"><small>교통 영향 합 (−: 이득)</small><b class="num">${HM.fmtS(S.trafficTotal)}</b></span></div>
    ${axis(S, planned, total)}
    <p class="gx-wx">${esc(wxLine)} <small class="muted">게임 날씨 기록 – 랩은 이 차의 랩</small></p>
    <ul class="gx-diff">${diffs.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
    <h4>랩별 기록 <small>시간 손실과 그때의 결정·사건 · 누가 정했는지 · 숫자의 출처</small></h4>
    <div class="gx-storyw"><table class="g-tbl gx-story"><thead><tr><th class="r">랩</th><th>누가</th><th>무엇</th><th class="r">숫자</th><th>출처</th></tr></thead><tbody>
      ${rows.map((x) => `<tr class="k-${x.kind}${x.refused ? " no" : ""}"><td class="r num">${x.lapTo && x.lapTo !== x.lap ? `${x.lap}–${x.lapTo}` : x.lap}</td><td>${x.who ? `<span class="gx-who ${x.cls}">${esc(x.who)}</span>` : ""}</td><td class="txt" title="${esc(x.text)}">${esc(x.text)}${x.refused ? ` <span class="t-lose">거절 – ${esc(whyKo(x.why))}</span>` : ""}</td><td class="r num ${x.bad ? "t-lose" : ""}">${esc(x.num)}</td><td><i class="gx-src ${x.src === "measured" ? "m" : x.src === "estimate" ? "e" : "r"}">${esc(HM.SRC_KO[x.src])}</i></td></tr>`).join("") || `<tr><td colspan="5" class="muted">기록 없음</td></tr>`}</tbody></table></div>
    <p class="muted gd-small">엔진 기록: 경기에서 실제로 잰 값 (피트 손실·교통은 엔진 근사) · 당시 추정: 팀 AI가 계획을 바꿀 때 기대한 차이 – 결과가 아니고, 다른 전략의 결과도 계산하지 않았어요.${(A.ai || []).length >= 60 ? " 팀 AI 판단은 최근 60개만 남아요." : ""}</p>
  </div>`;
}
// the lap axis: plan / actual (+ stops) / decisions / traffic / rain, SC-VSC-red bands behind all rows, ticks every 10 laps
function axis(S, planned, total) {
  if (!total) return "";
  const P = (lap) => HM.lapPct(lap, total), mid = (lap) => HM.lapPct(lap - 0.5, total), FL = { sc: "SC", vsc: "VSC", red: "적색기" };
  // (a stop's label only where it doesn't run into the one before – ~7 % of the axis; the others keep their tooltip)
  const gap = Math.max(2, total * 0.07), showPit = new Set(); let lastL = -Infinity;
  for (const p of S.pits.slice().sort((a, b) => a.lap - b.lap)) if (p.lap - lastL >= gap) { showPit.add(p); lastL = p.lap; }
  const pits = S.pits.map((p) => `<b class="gx-pit${p.queue > 0.05 ? " q" : ""}" style="left:${P(p.lap)}" title="${p.lap}랩 ${p.red ? `적색기 피트레인 (중단 ${HM.fmtS(p.susp)}은 손실에서 뺌)` : "피트"} ${esc(CMP_KO[p.from] || "")}→${esc(CMP_KO[p.to] || "")} · 손실 ${HM.fmtS(p.loss)}${p.queue > 0.05 ? ` (동료 대기 ${HM.fmtS(p.queue)})` : ""} · 정지 ${HM.fmtS(p.stationary)}">${showPit.has(p) ? `<span class="num">${p.red ? "적색기" : `${p.loss.toFixed(0)}초`}</span>` : ""}</b>`).join("");
  const dec = [...S.changes, ...S.aiOther].map((d) => `<b class="gx-dm ${d.cls}" style="left:${mid(d.lap)}" title="${d.lap}랩 · ${esc(d.who)} · ${esc(d.text)}${d.why ? ` (${esc(d.why)})` : ""}"></b>`).join("")
    + S.orders.map((x) => `<b class="gx-dm ${x.cls}${x.ok ? "" : " no"}" style="left:${mid(x.lap)}" title="${x.lap}랩 · ${esc(x.who)} · ${esc(ordText(x))}${x.ok ? "" : ` – 거절: ${esc(whyKo(x.why))}`}"></b>`).join("");
  const mx = Math.max(1, ...S.traffic.map((t) => t.loss)), topSet = new Set(S.top.map((t) => t.lap)), labelled = new Set();
  for (const t of S.top) if (![...labelled].some((l) => Math.abs(l - t.lap) <= 2)) labelled.add(t.lap);   // (no labels on top of each other)
  const tr = S.traffic.filter((t) => t.loss > 0.05).map((t) => `<i class="${topSet.has(t.lap) ? "top" : ""}" style="left:${P(t.lap - 1)};width:${P(1)};height:${Math.max(4, (t.loss / mx) * 100).toFixed(1)}%" title="${t.lap}랩 교통 손실 ${HM.fmtS(t.loss)}">${labelled.has(t.lap) ? `<span class="num">${t.lap}</span>` : ""}</i>`).join("");
  const wx = S.wx.filter((w) => (w.rain ?? 0) > 0.05 || (w.water ?? 0) > HM.WET_MM).map((w) => `<i class="${(w.rain ?? 0) > 0.05 ? "rain" : "wet"}" style="left:${P(w.lap - 1)};width:${P(1)}" title="${w.lap}랩 · ${(w.rain ?? 0) > 0.05 ? "비" : "비 그침"}${w.water != null ? ` · 노면 물 ${w.water.toFixed(2)}mm` : ""}"></i>`).join("");
  const bands = S.bands.map((b) => `<i class="gx-band ${b.type}" style="left:${P(b.from - 1)};width:${P(b.to - b.from + 1)}" title="${FL[b.type]} ${b.from}–${b.to}랩"><span>${FL[b.type]}</span></i>`).join("");
  const ticks = [1, ...Array.from({ length: Math.floor(total / 10) }, (_, i) => (i + 1) * 10).filter((x) => x < total), total].map((l) => `<span style="left:${mid(l)}">${l}</span>`).join("");
  return `<figure class="gx-axis" aria-label="랩 축: 계획·실제 스틴트·피트·결정·교통 손실·비">
    <div class="gx-ov">${bands}</div>
    ${bar("계획", planned, total)}
    <div class="gx-row"><span>실제</span><div class="gx-bar gx-act">${stintsI(S.actual, total)}${pits}</div></div>
    <div class="gx-row"><span>결정</span><div class="gx-lane gx-decs">${dec || `<small class="muted">경기 중 결정 없음</small>`}</div></div>
    <div class="gx-row"><span>교통</span><div class="gx-lane gx-traf" title="막대: 그 랩에 교통으로 잃은 시간 (가장 큰 랩 ${HM.fmtS(mx)})">${tr}</div></div>
    <div class="gx-row"><span>날씨</span><div class="gx-lane gx-wxl">${wx || (S.hasRain ? `<small class="muted">비 없음</small>` : `<small class="muted">날씨 기록 없음</small>`)}</div></div>
    <div class="gx-row gx-ticks"><span>랩</span><div>${ticks}</div></div>
    <figcaption class="gx-leg"><span><b class="gx-pit"></b>피트 (손실)</span><span><b class="gx-dm ai"></b>팀 AI</span><span><b class="gx-dm me"></b>나</span><span><b class="gx-dm goal"></b>목표 보조</span><span><i class="gx-lt"></i>교통 손실 (가장 큰 3랩에 랩 번호)</span><span><i class="gx-lr"></i>비</span>${S.hasWater ? `<span><i class="gx-lw"></i>젖은 노면</span>` : ""}${S.bands.length ? `<span><i class="gx-lb"></i>SC·VSC·적색기</span>` : ""}</figcaption>
  </figure>`;
}
const ordText = (x) => `${ORD_KO[x.type] || x.type}${orderArg(x)}`;
const orderArg = (o) => { const a = o.args || {}; return a.mode ? ` ${(o.type === "energy" ? HM.energyKo(G.sc?.meta?.season ?? 2025)[a.mode] : PACE_KO[a.mode]) || a.mode}` : a.compound ? ` ${CMP_KO[a.compound] || a.compound}` : a.kind !== undefined ? ` ${HM.GOAL_KO[a.kind] || "해제"}` : a.stints ? ` ${HM.stintsText(a.stints)}` : a.policy ? ` ${a.policy}` : ""; };
function bar(label, st, total) {
  if (!Array.isArray(st) || !st.length || !total) return `<div class="gx-row"><span>${label}</span><div class="gx-bar"><small class="muted">자료 없음</small></div></div>`;
  return `<div class="gx-row"><span>${label}</span><div class="gx-bar">${stintsI(st, total)}</div></div>`;
}
function stintsI(st, total) {
  let prev = 0;
  return st.map((s) => { const from = prev; prev = s.toLap; return `<i class="cmp-bg-${esc(s.compound)}" style="left:${HM.lapPct(from, total)};width:${HM.lapPct(s.toLap - from, total)}" title="${esc(CMP_KO[s.compound] || s.compound)} ${from + 1}–${s.toLap}랩"><span>${esc(CMP_1[s.compound] || "?")}${s.toLap - from >= 6 ? `<small>${s.toLap - from}</small>` : ""}</span></i>`; }).join("");
}
// the engine's accounts as it gives them (per car: { traffic, pit, pitQueue, penalty, approx: [...] } s)
function accountsHtml(a) {
  const rows = Object.entries(a.cars || a).filter(([, v]) => v && typeof v === "object");
  const all = ["traffic", "pit", "pitQueue", "penalty"], have = new Set(rows.flatMap(([, v]) => Object.keys(v))), keys = all.filter((k) => have.has(k)), ko = { traffic: "교통", pit: "피트", pitQueue: "그중 대기", penalty: "페널티" };
  return `<table class="g-tbl"><thead><tr><th>차</th>${keys.map((k) => `<th class="r">${ko[k]}</th>`).join("")}</tr></thead><tbody>${rows.map(([n, v]) => `<tr><td>${esc(n)}</td>${keys.map((k) => `<td class="r num">${Number.isFinite(v[k]) ? v[k].toFixed(1) + "초" + ((v.approx || []).includes(k) ? " ≈" : "") : "–"}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <p class="muted gd-small">≈ 엔진 근사 · 타이어 관리·에너지 운용으로 잃거나 얻은 시간은 깨끗하게 떼어낼 수 없어서 숫자로 보여주지 않아요</p>`;
}
// the game's weather as the race ran, for the lap axis (read at the finish – never fed back to the race): the screen's own
// samples (rain + the track's water, every 10 s of race time while the race screen ran – racehud.js) and, for the time
// the screen did not see (a race continued from a save), the engine's weather record's rain every 30 s (water unknown)
export function weatherSeries(R, log) {
  const out = [], seen = (log || []).slice();
  for (const x of seen) out.push({ t: x.t, rain: x.rain, water: x.water });
  const W = R?.race?.cache?.truth, end = R?.race?.state?.t ?? 0;
  if (W) { const t0 = seen.length ? seen[0].t : Infinity; const o = {}; for (let t = 0; t < Math.min(t0, end); t += 30000) { truthAt(W, t, o); out.push({ t, rain: o.rain, water: null }); } }
  return out.sort((a, b) => a.t - b.t);
}
export function onClick(act) {
  if (act === "again") { G.result = null; toPrerace(); return; }
  if (act === "live") { closeGame({ force: true }); return; }
  if (act === "restart") { import("./prerace.js").then((m) => { G.result = null; return m.restartSame(); }); return; }
}
export { CMP_KO };
