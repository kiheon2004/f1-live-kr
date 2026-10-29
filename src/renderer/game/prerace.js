// The pre-race strategy screen (request §12): for each of the team's two cars the start tyre, the stints (add / remove /
// reorder / change), the target pit laps, the expected pit window, the initial pace and energy modes and whether the team
// AI may adjust the car during the race – over a timeline of the race's real lap count. The estimator's recommendations
// are offered beside the plans and applied only when the player presses 적용 – nothing ever rewrites the player's plan.
//
// The numbers (expected race time, its spread, the pit windows, the recommendations) are the engine's strategy
// estimator (estimator.js → strategy.js), computed after the edits stop for a moment and cached – never on every key
// press, never a full race run. Shown with their spread, rounded to what the spread allows.
//
// The plans go to createRace({ plans }); the initial modes and the assist choice go as the player's orders at t = 0
// (planedit.js toEngine).
import { G, go, paint, myCars, startRace } from "./gamehome.js";
import { $, esc, raceKo, CMP_KO, PACE_KO, ENERGY_KO, cmpChip, compoundsFor, NO_INVENTORY, fmtRace, fmtEst, fmtT, PENDING } from "./ui.js";
import * as P from "./planedit.js";
import { createEstimator } from "./estimator.js";
import { PIT } from "../../game/data/params/pit.js";
import { AI } from "../../game/data/params/ai.js";

const QUEUE_S = PIT.workBase.v + AI.queueMargin;   // (a second car stopping behind its teammate: the first one's stop + roll-in)
let EST = null, startErr = null;
const est = () => EST || (G.engine && G.strat ? (EST = createEstimator({ engine: G.engine, strat: G.strat, onChange: () => { if (G.step === "prerace") repaintNumbers(); } })) : null);

// the plans for this race and team: kept while the player moves around; made once from the engine's default plan
function ensurePlans(sc) {
  const key = `${G.sid}|${G.teamKey}`;
  if (G.plansFor === key && myCars(sc).every((e) => G.plans[e.num])) return;
  G.plansFor = key; G.plans = {};
  for (const e of myCars(sc)) {
    const base = G.engine?.defaultPlan ? G.engine.defaultPlan(sc, e.num) : { stints: [{ compound: "MEDIUM", toLap: Math.round(sc.race.laps * 0.45) }, { compound: "HARD", toLap: sc.race.laps }] };
    G.plans[e.num] = P.planFrom(base.stints, { src: "default", assist: true });
  }
}
const ruleOf = (sc) => { try { return G.strat?.tyreRule ? G.strat.tyreRule({ state: { season: sc.meta.season }, scenario: sc }) : null; } catch { return null; } };
const ctxOf = (sc) => ({ total: sc.race.laps, compounds: compoundsFor(sc).list, rule: ruleOf(sc), queueS: QUEUE_S, minStint: 3 });
const want = () => { const sc = G.sc; if (sc && est()) est().want({ sc, seed: G.seed, team: G.teamKey, plans: G.plans }); };

// ---------- painting ----------
export function paintBody() {
  const sc = G.sc;
  if (G.scErr) return `<div class="g-card"><h3>경기를 열지 못했어요</h3><p class="g-err">${esc(G.scErr)}</p><button data-act="go:menu">← 메뉴</button></div>`;
  if (!sc) return `<p class="muted">시나리오를 읽는 중…</p>`;
  ensurePlans(sc);
  const m = sc.meta, mine = myCars(sc), total = sc.race.laps, V = P.validate(G.plans, ctxOf(sc)), cmp = compoundsFor(sc);
  const ready = !!G.engine && V.ok;
  return `<div class="gp">
    <header class="gp-head">
      <button class="ghost small" data-act="go:menu">← 메뉴</button>
      <div class="gp-title"><h2>출발 전 전략</h2><span>${esc(raceKo(m.event))} · ${esc(m.date)} · ${esc(m.location)} · <b>${total}랩</b> · 랩 ${(sc.track.L / 1000).toFixed(3)} km · 총 ${((total * sc.track.L) / 1000).toFixed(1)} km</span></div>
      <label class="gp-seed">시드 <input type="number" min="1" max="999999" value="${G.seed}" data-chg="pre:seed" title="같은 시드 + 같은 계획·지시 = 같은 경기"></label>
      <div class="gp-go"><button class="primary" data-act="pre:start" ${ready ? "" : "disabled"}>레이스 시작</button>
        <small>${!G.engine ? esc(G.engineErr || "엔진 연결 전") : !V.ok ? "계획의 오류를 먼저 고치세요" : startErr ? esc(startErr) : `${total}랩 · 일시정지·배속 가능`}</small></div>
    </header>
    <div class="gp-main">
      <section class="gp-plans">
        <div class="g-card gp-tl-card"><h3>타임라인 <small>${total}랩 전체 · 경계를 끌어 피트 랩을 바꿔요 · 빗금: 예상 피트 윈도(최적 +2초 이내)</small></h3>${timeline(sc, mine, total)}
          ${V.team.length ? V.team.map((w) => `<p class="g-warn">⚠ ${esc(w.text)}</p>`).join("") : `<p class="muted gp-ok">두 차의 피트 랩이 겹치지 않아요</p>`}</div>
        <div class="gp-cars">${mine.map((e) => carEditor(sc, e, total, V.cars[e.num], cmp)).join("")}</div>
      </section>
      <aside class="gp-side">${sideCards(sc, mine, cmp)}</aside>
    </div></div>`;
}
export { paintBody as paint };

// one row per car on a shared lap axis: stints coloured by compound, stop markers (draggable), the estimator's windows
function timeline(sc, mine, total) {
  const ticks = []; for (let L = 10; L < total; L += 10) ticks.push(L);
  const pctOf = (lap) => `${((lap / total) * 100).toFixed(3)}%`;
  const rows = mine.map((e) => {
    const p = G.plans[e.num], R = P.ranges(p), ev = est()?.planOf(sc, G.seed, G.teamKey, e.num, p);
    const wins = ev?.ok ? ev.v.stops.map((s) => (s.window ? `<i class="gp-win" style="left:${pctOf(s.window[0] - 1)};width:${pctOf(s.window[1] - s.window[0] + 1)}" title="예상 피트 윈도 ${s.window[0]}–${s.window[1]}랩"></i>` : "")).join("") : "";
    return `<div class="gp-row"><span class="gp-who">${esc(e.tla)} <small>#${esc(e.num)}</small></span><div class="gp-bar" data-num="${esc(e.num)}">${wins}
      ${R.map((r, i) => `<div class="gp-seg cmp-bg-${esc(r.compound)}" style="left:${pctOf(r.from - 1)};width:${pctOf(r.laps)}" title="${esc(CMP_KO[r.compound] || r.compound)} ${r.from}–${r.to}랩 (${r.laps}랩)"><span>${esc((CMP_KO[r.compound] || r.compound || "?"))} ${r.laps}</span></div>`).join("")}
      ${R.slice(0, -1).map((r, i) => `<b class="gp-stop" data-num="${esc(e.num)}" data-i="${i}" style="left:${pctOf(r.to)}" title="${i + 1}번째 피트: ${r.to}랩 끝 – 끌어서 이동"><em>${r.to}</em></b>`).join("")}</div></div>`;
  }).join("");
  return `<div class="gp-tl">${rows}<div class="gp-axis"><span class="gp-who"></span><div>${ticks.map((L) => `<i style="left:${pctOf(L)}">${L}</i>`).join("")}<i style="left:100%">${total}</i></div></div></div>`;
}

function carEditor(sc, e, total, V, cmp) {
  const p = G.plans[e.num], R = P.ranges(p), grid = (sc.grid?.slots || []).find((s) => String(s.num) === String(e.num))?.pos, pl = (sc.grid?.pitLane || []).some((x) => String(x.num ?? x) === String(e.num));
  const chips = (sel, act, i) => cmp.list.map((c) => `<button class="gp-chip ${c === sel ? "on" : ""} ${cmp.wet.includes(c) ? "wet" : ""}" data-act="pre:${act}" data-num="${esc(e.num)}" data-i="${i}" data-c="${c}" aria-pressed="${c === sel}" title="${esc(CMP_KO[c] || c)}">${cmpChip(c)}</button>`).join("");
  const modeBtns = (key, list, ko) => `${p.assist ? `<button class="gp-mode ${p[key] == null ? "on" : ""}" data-act="pre:mode" data-num="${esc(e.num)}" data-k="${key}" data-v="" aria-pressed="${p[key] == null}">AI 맡김</button>` : ""}${list.map((v) => `<button class="gp-mode ${(p[key] || (p.assist ? null : "balanced")) === v ? "on" : ""}" data-act="pre:mode" data-num="${esc(e.num)}" data-k="${key}" data-v="${v}">${ko[v]}</button>`).join("")}`;
  const errs = V?.errors || [], warns = V?.warnings || [];
  return `<div class="g-card gp-car" style="--tc:${esc(e.colour || "#888")}">
    <h3><b class="gp-num">${esc(e.num)}</b> ${esc(e.name || e.tla)} <small>${pl ? "피트레인 출발" : grid ? `출발 ${grid}번 그리드` : ""} · 계획: ${p.src === "default" ? "엔진 기본 계획" : p.src.startsWith("rec:") ? `추천 적용 (${esc(p.src.slice(4))})` : "직접 편집"}</small></h3>
    <div class="gp-line"><span class="gp-lab">출발 타이어</span><span class="gp-chips">${chips(p.stints[0]?.compound, "startTyre", 0)}</span></div>
    <table class="gp-stints"><thead><tr><th>#</th><th>타이어</th><th>구간</th><th>피트 랩</th><th></th></tr></thead><tbody>
    ${R.map((r, i) => `<tr class="${errs.some((x) => x.stint === i) ? "bad" : ""}"><td>${i + 1}</td><td class="gp-chips">${chips(r.compound, "cmp", i)}</td><td>${r.from}–${r.to}랩 <small>(${r.laps}랩)</small></td>
      <td>${i < R.length - 1 ? `<input type="number" class="gp-lap" min="1" max="${total - 1}" value="${r.to}" data-chg="pre:end" data-num="${esc(e.num)}" data-i="${i}" aria-label="${i + 1}번째 피트 랩">` : `<small class="muted">끝까지</small>`}</td>
      <td class="gp-ops"><button class="ghost small" data-act="pre:up" data-num="${esc(e.num)}" data-i="${i}" ${i ? "" : "disabled"} title="앞으로">↑</button><button class="ghost small" data-act="pre:down" data-num="${esc(e.num)}" data-i="${i}" ${i < R.length - 1 ? "" : "disabled"} title="뒤로">↓</button><button class="ghost small" data-act="pre:del" data-num="${esc(e.num)}" data-i="${i}" ${R.length > 1 ? "" : "disabled"} title="이 스틴트 삭제 (피트 1회 줄임)">✕</button></td></tr>`).join("")}
    </tbody></table>
    <div class="g-row"><button class="ghost small" data-act="pre:add" data-num="${esc(e.num)}" ${R.length < 6 ? "" : "disabled"}>+ 스틴트 추가 (피트 1회 추가)</button></div>
    <div class="gp-line"><span class="gp-lab">초기 페이스</span><span class="gp-modes">${modeBtns("pace", P.PACE_MODES, PACE_KO)}</span></div>
    <div class="gp-line"><span class="gp-lab">초기 에너지</span><span class="gp-modes">${modeBtns("energy", P.ENERGY_MODES, ENERGY_KO)}</span></div>
    <label class="gp-assist"><input type="checkbox" data-chg="pre:assist" data-num="${esc(e.num)}" ${p.assist ? "checked" : ""}><span><b>자동 전략 보조</b> <small>${p.assist ? "켜짐 – 팀 AI가 경기 중 피트 시점·타이어와 'AI 맡김' 모드를 조정해요. 내가 그 종류의 지시를 내리면 그때부터 내 지시를 따라요." : "꺼짐 – 이 계획과 모드를 그대로 따라요. 바꾸려면 경기 중에 직접 지시해요."}</small></span></label>
    <div class="gp-est" data-est="${esc(e.num)}">${estLine(sc, e)}</div>
    ${errs.map((x) => `<p class="g-err">✕ ${esc(x.text)}</p>`).join("")}${warns.map((x) => `<p class="${x.severe ? "g-err" : "g-warn"}">⚠ ${esc(x.text)}</p>`).join("")}
  </div>`;
}

// the estimator's numbers for the player's plan (or why there are none)
function estLine(sc, e) {
  const E = est();
  if (!G.engine) return PENDING;
  if (!E) return `<span class="g-pending">전략 추정기 없음 – 예상 시간 자료 부족</span>`;
  const p = G.plans[e.num], r = E.planOf(sc, G.seed, G.teamKey, e.num, p), rec = E.get(sc, G.seed, G.teamKey);
  if (!r) return `<span class="muted">${E.status === "failed" ? `계산 실패: ${esc(E.err || "?")}` : "예상 시간 계산 중…"}</span>`;
  if (!r.ok) return `<span class="g-warn">이 계획은 추정기로 계산하지 못했어요 (${esc(r.err)})</span>`;
  const v = r.v, step = v.sd >= 10 ? 5 : 1, rd = (s) => Math.round(s / step) * step;
  const best = rec?.ok ? rec.v.cars.find((c) => String(c.num) === String(e.num))?.best : null;
  const vs = best ? `<br><small>엔진 추천(${esc(best.key)})보다 <b>${fmtEst(v.mean - best.mean, v.sd)}초</b> <span class="muted">(두 계획 모두 같은 가정의 추정)</span></small>` : "";
  const stops = v.stops.map((s, i) => `${i + 1}번째 피트 ${s.lap}랩${s.window ? ` · 예상 윈도 ${s.window[0]}–${s.window[1]}랩` : ""}${Math.abs(s.bestLap - s.lap) >= 2 ? ` <span class="muted">(이 계획에서는 ${s.bestLap}랩 근처가 약 ${fmtEst(-s.vsBest, v.sd)}초)</span>` : ""}`).join("<br>");
  return `<div><span class="gp-lab">예상 레이스 시간</span> <b>약 ${fmtRace(rd(v.mean))}</b> <small class="muted">· 10–90% 범위 ${fmtRace(rd(v.p10))}–${fmtRace(rd(v.p90))} · 표준편차 약 ${Math.round(v.sd)}초</small>${vs}</div>
    ${stops ? `<div class="gp-stops">${stops}</div>` : `<div class="muted">무정차 계획</div>`}
    <small class="muted">팀 전략 모델 추정 – 교통·세이프티카·날씨·사고에 따라 달라져요. 1스틴트는 초기 페이스(${PACE_KO[v.mode0] || v.mode0}), 이후는 균형으로 계산. 에너지 모드는 이 추정에 들어가지 않아요.</small>`;
}

function sideCards(sc, mine, cmp) {
  const E = est(), rec = E?.get(sc, G.seed, G.teamKey);
  const status = !E ? `<p class="g-pending">전략 추정기 없음</p>` : !rec ? `<p class="muted">${E.status === "failed" ? `계산 실패: ${esc(E.err || "?")}` : "추천 계산 중…"}</p>` : !rec.ok ? `<p class="g-warn">추천을 계산하지 못했어요: ${esc(rec.err)}</p>` : "";
  const R = rec?.ok ? rec.v : null;
  const recCard = `<div class="g-card"><h3>엔진 추천 <small>적용을 눌러야 내 계획이 바뀌어요</small></h3>${status}
    ${R ? mine.map((e) => { const c = R.cars.find((x) => String(x.num) === String(e.num)); if (!c?.best) return `<p class="muted">${esc(e.tla)}: 추천을 만들 자료가 부족해요</p>`;
      const line = (x, best) => `<div class="gp-rec ${P.sameStints(G.plans[e.num], { stints: x.plan }) ? "same" : ""}"><span>${x.plan.map((s, i) => cmpChip(s.compound) + `<small>${i < x.plan.length - 1 ? s.toLap : ""}</small>`).join("")}</span>
        <span>${best ? `${x.stops}스톱 · 약 ${fmtRace(Math.round(x.mean / 5) * 5)} <small class="muted">±${Math.round(x.sd)}초</small>` : `<small>${fmtEst(x.vsBest, x.sdRel)}초</small>`}</span>
        ${P.sameStints(G.plans[e.num], { stints: x.plan }) ? `<small class="muted">현재 계획</small>` : `<button class="ghost small" data-act="pre:apply" data-num="${esc(e.num)}" data-key="${esc(x.key)}">적용</button>`}</div>`;
      return `<h4>${esc(e.tla)} <small class="muted">최선 · 대안</small></h4>${line(c.best, true)}${c.alternatives.slice(0, 3).map((a) => line(a, false)).join("")}`; }).join("") : ""}
    ${R?.conflicts?.length ? R.conflicts.map((c) => `<p class="g-warn">추천끼리: ${esc(c.text)}</p>`).join("") : ""}</div>`;
  const wx = R ? `<div class="g-fc">${R.weather.blocks.map((b) => `<span title="${fmtT(b.from)}–${fmtT(b.to)}" style="--p:${b.pRain}"><i></i>${Math.round(b.pRain * 100)}%</span>`).join("")}</div>
    <p>${esc(R.weather.text)} <small class="muted">· 기온 ${R.weather.airT ?? "?"}°C · 노면 ${R.weather.trackT ?? "?"}°C</small></p><p class="muted">팀 예보(시드 ${G.seed}) – 15분 단위 비 확률. ${esc(R.weather.uncertainty)} 실제 경기에서 비가 왔는지는 보여주지 않아요.</p>` : `<p class="muted">예보 계산 중…</p>`;
  const slots = [...(sc.grid?.slots || [])].sort((a, b) => a.pos - b.pos), ents = new Map(sc.entries.map((x) => [String(x.num), x])), pl = sc.grid?.pitLane || [];
  const rule = ruleOf(sc);
  return `${recCard}
    <div class="g-card"><h3>예상 날씨 <small>예보 – 실제와 다를 수 있어요</small></h3>${wx}</div>
    <div class="g-card"><h3>규정·피트 <small>추정 포함</small></h3>
      <p>타이어 규정: ${esc(rule?.text || "규정 자료 없음")}</p>
      <p>쓸 수 있는 타이어: ${cmp.list.map((c) => cmpChip(c)).join(" ")} <small class="muted">${esc(cmp.source)}${cmp.est ? " (추정)" : ""}</small></p>
      <p class="muted">${esc(NO_INVENTORY)}</p>
      ${R ? `<p>예상 피트 손실: ${esc(R.pitLoss.text)}</p>` : ""}</div>
    <div class="g-card"><h3>출발 순서 <small>경기 전 공개된 그리드</small></h3>
      <ol class="g-grid-list">${slots.map((s) => { const x = ents.get(String(s.num)); return `<li class="${x?.teamKey === G.teamKey ? "mine" : ""}"><b>${s.pos}</b> ${esc(x?.tla || s.num)} <span style="color:${esc(x?.colour || "#888")}">■</span></li>`; }).join("")}${pl.map((x) => `<li><b>PL</b> ${esc(ents.get(String(x.num ?? x))?.tla || x.num || x)}</li>`).join("")}</ol></div>`;
}

// the estimator answered: repaint the numbers only (the editor's inputs keep focus)
function repaintNumbers() {
  const sc = G.sc; if (!sc || G.step !== "prerace") return;
  for (const e of myCars(sc)) { const el = document.querySelector(`[data-est="${CSS.escape(String(e.num))}"]`); if (el) el.innerHTML = estLine(sc, e); }
  const side = document.querySelector(".gp-side"); if (side) side.innerHTML = sideCards(sc, myCars(sc), compoundsFor(sc));
  const tl = document.querySelector(".gp-tl-card .gp-tl"); if (tl && !drag) tl.outerHTML = timeline(sc, myCars(sc), sc.race.laps);
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
  G.plans[num] = P.setEnd(G.plans[num], i, lap, total); paint();
});

// ---------- actions ----------
const edit = (num, f) => { G.plans[num] = f(G.plans[num]); startErr = null; paint(); };
export function onClick(act, b) {
  if (act === "start") { start(); return; }
  const num = b.dataset.num, i = +b.dataset.i, total = G.sc?.race.laps;
  if (!num || !G.plans[num]) return;
  if (act === "startTyre") return edit(num, (p) => P.setStart(p, b.dataset.c));
  if (act === "cmp") return edit(num, (p) => P.setCompound(p, i, b.dataset.c));
  if (act === "add") return edit(num, (p) => P.addStint(p, total));
  if (act === "del") return edit(num, (p) => P.removeStint(p, i, total));
  if (act === "up") return edit(num, (p) => P.moveStint(p, i, -1, total));
  if (act === "down") return edit(num, (p) => P.moveStint(p, i, +1, total));
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
  if (act === "end" && G.plans[num]) return edit(num, (p) => P.setEnd(p, +t.dataset.i, +t.value, G.sc.race.laps));
  if (act === "assist" && G.plans[num]) return edit(num, (p) => P.setMode(p, "assist", t.checked));
}

// ---------- start ----------
async function start() {
  const sc = G.sc; if (!sc || !G.engine) return;
  const V = P.validate(G.plans, ctxOf(sc)); if (!V.ok) { paint(); return; }
  const T = P.toEngine(G.plans);
  const runOpts = { seed: G.seed, userTeam: G.teamKey, weatherMode: "real", plans: T.plans, ai: true };
  try {
    est()?.cancel();
    await startRace({ runOpts, initialOrders: T.orders.map((o) => ({ ...o, text: `출발 전 ${o.type === "plan" ? "계획 고정 (자동 보조 끔)" : o.type === "pace" ? "페이스 " + PACE_KO[o.args.mode] : "에너지 " + ENERGY_KO[o.args.mode]}` })) });
  } catch (e) { startErr = `시작하지 못했어요: ${e.message || e}`; go("prerace"); }
}
