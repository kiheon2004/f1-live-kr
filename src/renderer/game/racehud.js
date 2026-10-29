// The race screen around the 3D view (request §13): a top bar (race, lap, flag, weather, clock, speed), a standings tower
// on the right that folds and can be made wider or narrower, the team's two driver cards along the bottom with every
// control of both cars always in reach, and between them the pit-work panel of the SELECTED car while it is in the pit
// lane (else the race's events).
//
// Two different "which car" ideas, kept apart on screen:
//   selected  the car whose card is highlighted and whose pit work the middle panel shows (click a card's name)
//   camera    the car the 3D view follows (adapter ctx.focus – a tower row, the card's 카메라 button, or an automatic
//             camera when one is active: adapter.camAuto = { num, why } set by the camera's own module)
// Both cards keep their controls whichever car is selected or filmed.
//
// What is shown is what the engine gives at the RENDER time (the newest snapshot at or before it – never a later one: no
// tyre change or pit release shown before the 3D view shows it – ui.js hudSnap). Fuel in kg. ERS deploy power as the engine
// gives it (snapshot energy.deployKw, real since v0.49). "Laps of fuel" only as an estimate from the fuel this car really
// used per lap so far.
import { G, paint as paintAll, myCars, sendOrder, leaveRace } from "./gamehome.js";
import { SPEEDS } from "./runner.js";
import { $, esc, raceKo, PACE_KO, ENERGY_KO, ORDER_KO, CMP_KO, FLAG_KO, PIT_KO, STATUS_KO, fmtT, pct, cmpChip, compoundsFor, NO_INVENTORY, hudSnap } from "./ui.js";
import { ST_KO, whyKo } from "./orders.js";
import { PACE, ENERGY, TEAM_ORDER } from "../../game/engine/commands.js";
import * as SaveUI from "./saveui.js";

const TOWER_KEY = "f1kr:game:towerW";
const IN_LANE = new Set(["entry", "lane", "approach", "penalty", "queue", "work", "release", "laneOut", "exit"]);
const H = { built: false, pitCmp: {}, fuel: {}, ordersDirty: true, towerSlim: false, pp: null, ppTried: false, ppErr: null, lastEvN: -1 };


export function build() {
  const sc = G.sc, mine = myCars(sc), cmp = compoundsFor(sc);
  let w = 300; try { w = Math.max(150, Math.min(460, +localStorage.getItem(TOWER_KEY) || 300)); } catch { /* default */ }
  H.fuel = {}; H.lastEvN = -1;
  for (const e of mine) if (!H.pitCmp[e.num] || !cmp.list.includes(H.pitCmp[e.num])) H.pitCmp[e.num] = nextPlanned(e.num) || "HARD";
  $("gameBody").innerHTML = `<div class="gr">
    <header class="gr-top">
      <div class="gr-ev"><b>${esc(raceKo(sc.meta.event))}</b><small>${G.dev ? "개발용 스냅샷" : "게임 · 실제 기록 아님"}</small></div>
      <div class="gr-lap"><small>랩</small><b id="grLap">–</b></div>
      <div class="gr-flag" id="grFlag">–</div>
      <div class="gr-wx" id="grWx"></div>
      <div class="gr-clock"><small>경기 시각</small><b id="grClock">–</b></div>
      <div class="gr-speeds" role="group" aria-label="배속">${SPEEDS.map((x) => `<button data-act="hud:speed" data-v="${x}" title="${x ? x + "배속" : "일시정지 (Space)"}">${x ? x + "×" : "❚❚"}</button>`).join("")}</div>
      <span class="gr-ach" id="grAch"></span>
      <label class="gr-auto" title="세이프티카·비·내 차 사고·피트 진입 때 1배속으로 (화면만)"><input type="checkbox" data-chg="hud:autoSlow" ${G.settings.autoSlow ? "checked" : ""}> 자동 감속</label>
      <span class="gr-gap"></span>
      <button class="ghost small" data-act="hud:save" ${G.dev ? "disabled" : ""}>저장</button>
      <button class="ghost small" data-act="go:menu">메뉴로</button>
    </header>
    <div class="gr-mid">
      <div class="gr-view" id="gameView"><div class="gr-tags"><span class="gr-tag" id="grSelTag"></span><span class="gr-tag cam" id="grCamTag"></span></div><div class="gr-note" id="grNote" hidden></div></div>
      <aside class="gr-tower ${H.towerSlim ? "slim" : ""}" id="grTower" style="width:${H.towerSlim ? 150 : w}px">
        <div class="gr-tower-h"><b>순위</b><span id="grTowerSub"></span><button class="ghost small" data-act="hud:tower" title="${H.towerSlim ? "펼치기" : "접기"}">${H.towerSlim ? "◀" : "▶"}</button></div>
        <div class="gr-tw" id="grTw"></div><i class="gr-resize" id="grResize" title="끌어서 너비 조절"></i>
      </aside>
    </div>
    <footer class="gr-bottom">
      ${mine[0] ? card(mine[0], cmp) : "<section></section>"}
      <section class="gr-center"><div class="gr-pit" id="grPit" hidden></div><div class="gr-events" id="grEvents"></div>
        <div class="gr-team"><small>팀 지시</small>${TEAM_ORDER.map((p) => `<button data-act="hud:team" data-v="${p}">${ORDER_KO[p]}</button>`).join("")}<span class="gr-last" id="grTeamLast"></span></div></section>
      ${mine[1] ? card(mine[1], cmp) : "<section></section>"}
    </footer></div>`;
  H.built = true; H.ordersDirty = true;
  wireResize();
}
export function teardown() { H.built = false; }
export const markOrders = () => { H.ordersDirty = true; };

function card(e, cmp) {
  const n = esc(e.num);
  return `<section class="gr-card" data-car="${n}" style="--tc:${esc(e.colour || "#888")}">
    <header class="gr-card-h"><button class="gr-selbtn" data-act="hud:sel" data-num="${n}" title="이 차를 선택 (가운데 패널이 이 차의 피트 작업을 보여줘요)">
      <b class="gr-pos" data-f="pos">–</b><span class="gr-name"><b>${esc(e.tla)}</b><small>#${n} ${esc(e.name || "")}</small></span></button>
      <span class="gr-status" data-f="status"></span><span class="gr-selmark" data-f="selmark">선택됨</span>
      <button class="gr-cambtn" data-act="hud:cam" data-num="${n}" data-f="cam" title="3D 카메라가 이 차를 따라가요">카메라</button></header>
    <div class="gr-stats">
      <div class="gr-tyre"><span data-f="cmp"></span><span class="gr-kv"><b data-f="age">–</b><small>랩 사용</small></span>
        <span class="gr-meter" title="타이어 마모율: 0% 새 타이어 → 100% 완전 마모 (남은 상태가 아니에요)"><small>마모율</small><i><em data-f="wearbar"></em></i><b data-f="wear">–</b></span></div>
      <div class="gr-energy"><span class="gr-meter soc" title="배터리 충전 상태 (SoC)"><small>배터리</small><i><em data-f="socbar"></em></i><b data-f="soc">–</b></span>
        <span class="gr-kv" title="지난 계산 단계의 ERS 출력 (엔진)"><small>ERS</small><b data-f="deploy">–</b></span>
        <span class="gr-kv" title="연료 (kg)"><small>연료</small><b data-f="fuel">–</b><small data-f="fuelLaps"></small></span></div>
    </div>
    <div class="gr-ctl">
      <div class="gr-seg" data-k="pace"><small>페이스 <em data-f="paceBy"></em></small>${PACE.slice().sort((a, b) => ["manage", "balanced", "attack"].indexOf(a) - ["manage", "balanced", "attack"].indexOf(b)).map((p) => `<button data-act="hud:pace" data-num="${n}" data-v="${p}">${PACE_KO[p]}</button>`).join("")}</div>
      <div class="gr-seg" data-k="energy"><small>에너지 <em data-f="energyBy"></em></small>${ENERGY.map((p) => `<button data-act="hud:energy" data-num="${n}" data-v="${p}">${ENERGY_KO[p]}</button>`).join("")}</div>
      <div class="gr-pitrow"><small>피트</small><span class="gr-chips">${cmp.list.map((c) => `<button class="gr-chip ${cmp.wet.includes(c) ? "wet" : ""}" data-act="hud:cmp" data-num="${n}" data-v="${c}" title="${esc(CMP_KO[c] || c)}">${cmpChip(c)}</button>`).join("")}</span>
        <button class="gr-box" data-act="hud:box" data-num="${n}">박스</button><button class="gr-cancel" data-act="hud:cancel" data-num="${n}">취소</button></div>
      <div class="gr-pitst" data-f="pit"></div>
    </div>
    <div class="gr-last" data-f="last"></div>
  </section>`;
}
// the next compound this car's plan fits (for the pit tyre's default)
function nextPlanned(num) {
  const c = G.run?.race.state.cars.find((x) => x.num === String(num)); if (!c?.plan) return null;
  const s = c.plan.stints.find((x) => x.toLap > (c.lap || 0)), i = c.plan.stints.indexOf(s);
  return c.plan.stints[i + 1]?.compound || null;
}
// whose decision a mode is now: the player's (an order of that kind given) or the team AI's
function decidedBy(num, type) {
  if (!G.run?.race.state.ai?.teams?.[G.teamKey]) return "";
  return G.book.list.some((o) => o.car === String(num) && (o.type === type || (type === "plan" && ["pit", "pitCancel", "plan"].includes(o.type))) && (o.state === "applied" || o.state === "queued")) ? "내 지시" : "AI 조정";
}
const f = (root, k) => root.querySelector(`[data-f="${k}"]`);
const setT = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };
const setH = (el, s) => { if (el && el._h !== s) { el._h = s; el.innerHTML = s; } };

export function paint() {
  const R = G.run; if (!R || G.step !== "race") return;
  if (!H.built) build();
  const snap = hudSnap(R, G.adapter); if (!snap) return;
  const sc = G.sc, ents = new Map(sc.entries.map((e) => [String(e.num), e])), T = R.renderT;
  // ---- top bar ----
  setT($("grLap"), `${Math.min(snap.leaderLap || 0, snap.totalLaps ?? Infinity)}/${snap.totalLaps ?? "?"}`);
  const fl = $("grFlag"); setT(fl, FLAG_KO[snap.flag] || snap.flag || ""); fl.dataset.flag = snap.flag || "";
  const w = snap.weather || {};
  setH($("grWx"), `${w.airT != null ? `기온 ${Math.round(w.airT)}°` : ""}${w.trackT != null ? ` · 노면 ${Math.round(w.trackT)}°` : ""} · ${w.rain > 0.05 ? `<b class="rain">비</b>` : "건조"}${w.water > 0.05 ? ` · 노면 물 ${w.water.toFixed(1)} mm` : w.water > 0.005 ? " · 노면 젖음" : ""}${w.est ? ` <small title="비의 세기는 엔진 추정">(추정)</small>` : ""}`);
  setT($("grClock"), fmtT(T));
  const ach = R.paused ? 0 : R.achieved;
  setH($("grAch"), R.paused ? `<b>일시정지</b>` : `실제 <b class="${R.behind ? "bad" : ""}">${ach.toFixed(1)}×</b>${R.behind ? ` <small class="bad" title="계산이 따라가지 못해 실제로 낼 수 있는 배속으로 진행 중">계산 한계</small>` : ""}${R.slowNote ? ` <small title="${esc(R.slowNote.why)}">자동 감속됨</small>` : ""}`);
  document.querySelectorAll(".gr-speeds [data-v]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.v === (R.paused ? 0 : R.speed))));
  // ---- tags: selected vs camera ----
  const focus = G.adapter?.ctx.focus, auto = G.adapter?.camAuto;
  const tla = (n) => ents.get(String(n))?.tla || n || "–";
  setH($("grSelTag"), `<small>조작 선택</small> <b>${esc(tla(G.sel))}</b>`);
  setH($("grCamTag"), `<small>카메라</small> <b>${esc(tla(auto?.num ?? focus))}</b> <small>${auto ? `자동 연출${auto.why ? " · " + esc(auto.why) : ""}` : "직접 선택"}</small>`);
  // ---- tower ----
  const cars = [...snap.cars].sort((a, b) => a.pos - b.pos);
  setT($("grTowerSub"), snap.dev ? "개발용" : "");
  setH($("grTw"), `<table class="gr-tw-t">${cars.map((c) => { const e = ents.get(String(c.num)), mine = e?.teamKey === G.teamKey;
    return `<tr class="${mine ? "mine" : ""} ${String(c.num) === String(focus) ? "focus" : ""} ${c.status === "dnf" ? "out" : ""}" data-act="hud:cam" data-num="${esc(c.num)}" title="카메라로 보기"><td class="p">${c.pos}</td><td class="n"><i style="background:${esc(e?.colour || "#888")}"></i>${esc(e?.tla || c.num)}</td>
      <td class="g">${c.pos === 1 ? "선두" : gapTxt(c, cars[0])}</td><td class="s">${c.status === "pit" ? `<em class="pit">PIT</em>` : c.status === "dnf" ? "OUT" : c.status === "fin" ? "🏁" : c.pen?.open?.length ? `<em class="pen" title="${esc(c.pen.open.join(", "))}">P</em>` : ""}</td>
      <td class="t">${cmpChip(c.tyre?.compound)}<small>${c.tyre?.age ?? ""}</small></td></tr>`; }).join("")}</table>`);
  // ---- the cards ----
  for (const e of myCars(sc)) paintCard(e, snap, T);
  // ---- middle: the selected car's pit work, else the events ----
  const sel = snap.cars.find((c) => String(c.num) === String(G.sel)), inLane = sel && sel.where === "pit" && IN_LANE.has(sel.pit?.phase);
  const pitEl = $("grPit"), evEl = $("grEvents");
  pitEl.hidden = !inLane; evEl.hidden = !!inLane;
  if (inLane) { pitPanel(pitEl, sel, T, snap); if (pitEl.hidden) { evEl.hidden = false; paintEvents(evEl); } } else paintEvents(evEl);
  const tl = G.book.last(null, ["teamOrder"]) || [...G.book.list].reverse().find((o) => o.type === "teamOrder");
  setH($("grTeamLast"), tl ? orderLine(tl, false) : "");
  const note = $("grNote"); if (G.saveNote) { note.hidden = false; note.className = `gr-note ${G.saveNote.ok ? "" : "bad"}`; setT(note, G.saveNote.text); } else note.hidden = true;
  H.ordersDirty = false;
}
const gapTxt = (c, lead) => { const g = c.gap && typeof c.gap === "object" ? c.gap.leader : c.gap; if (Number.isFinite(g)) return "+" + g.toFixed(1); return lead && c.lap < lead.lap ? `+${lead.lap - c.lap}랩` : ""; };

function paintCard(e, snap, T) {
  const root = document.querySelector(`.gr-card[data-car="${CSS.escape(String(e.num))}"]`); if (!root) return;
  const c = snap.cars.find((x) => String(x.num) === String(e.num)); if (!c) return;
  const stc = G.run.race.state.cars.find((x) => x.num === String(e.num));
  root.classList.toggle("sel", String(G.sel) === String(e.num));
  root.classList.toggle("cam", String(G.adapter?.ctx.focus) === String(e.num));
  root.classList.toggle("out", c.status === "dnf" || c.status === "fin");
  setT(f(root, "pos"), c.pos ? `P${c.pos}` : "–");
  setT(f(root, "status"), c.status === "pit" ? PIT_KO[c.pit?.phase] || "피트" : STATUS_KO[c.status] || c.status || "");
  setT(f(root, "cam"), String(G.adapter?.ctx.focus) === String(e.num) ? "카메라 ●" : "카메라");
  // tyre
  setH(f(root, "cmp"), `${cmpChip(c.tyre?.compound)}<small>${esc(CMP_KO[c.tyre?.compound] || c.tyre?.compound || "?")}</small>`);
  setT(f(root, "age"), String(c.tyre?.age ?? "–"));
  const wear = Number.isFinite(c.tyre?.wear) ? c.tyre.wear : null;
  setT(f(root, "wear"), wear == null ? "–" : pct(wear)); const wb = f(root, "wearbar"); if (wb) { wb.style.width = `${Math.round((wear ?? 0) * 100)}%`; wb.className = wear > 0.6 ? "hi" : wear > 0.35 ? "mid" : ""; }
  // energy (SoC) and fuel (kg) – the fuel estimate from this car's own use so far
  const soc = Number.isFinite(c.energy?.soc) ? c.energy.soc : null;
  setT(f(root, "soc"), soc == null ? "–" : pct(soc)); const sb = f(root, "socbar"); if (sb) sb.style.width = `${Math.round((soc ?? 0) * 100)}%`;
  setT(f(root, "deploy"), Number.isFinite(c.energy?.deployKw) ? `${Math.round(c.energy.deployKw)} kW` : "–");
  setT(f(root, "fuel"), Number.isFinite(c.fuel) ? `${c.fuel.toFixed(1)} kg` : "–");
  setT(f(root, "fuelLaps"), fuelLaps(c, snap));
  // modes: the one in force (the engine's), an order still waiting shown as waiting – never as in force
  const pace = c.mode?.pace ?? stc?.mode?.pace, energy = c.energy?.mode ?? stc?.mode?.energy;
  for (const [k, cur] of [["pace", pace], ["energy", energy]]) {
    const pend = G.book.pending(e.num, k);
    root.querySelectorAll(`.gr-seg[data-k="${k}"] button`).forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.v === cur)); b.classList.toggle("pending", !!pend && pend.args?.mode === b.dataset.v); });
    setT(f(root, k + "By"), decidedBy(e.num, k));
  }
  // pit
  const sel = H.pitCmp[e.num];
  root.querySelectorAll(`.gr-chip`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === sel)));
  const ph = c.pit?.phase || "none", lane = IN_LANE.has(ph);
  root.querySelector(".gr-box").disabled = lane || ph === "committed" || c.status === "dnf" || c.status === "fin";
  root.querySelector(".gr-cancel").disabled = ph !== "called";
  let pit = "";
  if (ph === "called") pit = `<b>박스 요청됨</b> · ${cmpChip(c.pit.compound)} ${esc(CMP_KO[c.pit.compound] || c.pit.compound || "")} – 피트 입구 전까지 취소 가능`;
  else if (ph === "committed") pit = `<b>피트 진입 확정</b> · ${cmpChip(c.pit.compound)} – 취소 불가`;
  else if (lane) pit = `<b>${esc(PIT_KO[ph] || ph)}</b>${ph === "work" && Number.isFinite(c.pit.workT0) ? ` · 작업 ${((T - c.pit.workT0) / 1000).toFixed(1)}초 경과` : ""}${ph === "work" || ph === "queue" || ph === "approach" || ph === "lane" || ph === "entry" ? ` · 요청 ${cmpChip(c.pit.compound)}` : ""}`;
  else pit = `<small class="muted">다음 계획 타이어 ${nextPlanned(e.num) ? cmpChip(nextPlanned(e.num)) : "–"} · 정차 ${stc?.pit?.stops ?? 0}회</small>`;
  setH(f(root, "pit"), pit);
  // the last order of this car and what became of it
  const o = G.book.last(e.num);
  setH(f(root, "last"), o ? orderLine(o, true) : `<small class="muted">지시 없음</small>`);
}
function orderLine(o, short) {
  const why = o.why ? ` – ${esc(whyKo(o.why))}` : "";
  return `<span class="gr-ord ${o.state}"><small>${fmtT(o.t)}</small> ${esc(o.text || o.type)} → <b>${esc(ST_KO[o.state] || o.state)}</b>${o.state === "applied" && o.type === "pit" ? " (피트 요청 등록)" : ""}${why}</span>`;
}
// laps of fuel left at the rate this car has really burnt over its last laps (kg/lap from its own snapshots) – an estimate
function fuelLaps(c, snap) {
  const h = H.fuel[c.num] || (H.fuel[c.num] = []);
  if (!Number.isFinite(c.fuel)) return "";
  if (!h.length || c.lap > h[h.length - 1].lap) { h.push({ lap: c.lap, fuel: c.fuel }); if (h.length > 6) h.shift(); }
  const a = h[0], b = h[h.length - 1];
  if (h.length < 3 || b.lap - a.lap < 2 || a.fuel - b.fuel <= 0) return "";
  const burn = (a.fuel - b.fuel) / (b.lap - a.lap), left = c.fuel / burn, need = (snap.totalLaps ?? 0) - c.lap;
  return ` · 약 ${Math.floor(left)}랩분 (추정${need > 0 ? `, 남은 ${need}랩` : ""})`;
}

// the pit-work panel: the pit module's (pitpanel.js render(el, car, renderT, ctx)) when it is in this build; else the
// phase and the elapsed time only – never the stop's future length, never a slow wheel before the work is over
async function loadPitPanel() { if (H.ppTried) return; H.ppTried = true; try { const m = await import("./pitpanel.js"); const f = m.renderPitPanel || m.render; if (typeof f === "function") H.pp = { render: f }; } catch (e) { H.ppErr = String(e.message || e); } }
function pitPanel(el, car, T, snap) {
  loadPitPanel();
  const e = G.sc.entries.find((x) => String(x.num) === String(car.num));
  // (car: the adapter's render-time row – hudSnap; the pit module fills el and may hide it when the car isn't in the lane)
  if (H.pp) { try { H.pp.render(el, car, T, { tla: e?.tla || null, colour: e?.colour || null, entry: e, snapshot: snap, scenario: G.sc, team: G.teamKey }); return; } catch (err) { H.ppErr = String(err.message || err); H.pp = null; } }
  const p = car.pit || {}, ph = p.phase;
  const done = Number.isFinite(p.workT1) && T >= p.workT1;
  setH(el, `<div class="gr-pit-h"><b>${esc(e?.tla || car.num)}</b> 피트 작업 <span class="gr-status">${esc(PIT_KO[ph] || ph)}</span></div>
    <ol class="gr-pit-steps">${["entry", "lane", "approach", "work", "release", "exit"].map((k) => `<li class="${k === ph ? "on" : order(k) < order(ph) ? "done" : ""}">${esc(PIT_KO[k])}</li>`).join("")}</ol>
    <p>${ph === "work" && Number.isFinite(p.workT0) ? `작업 ${((T - p.workT0) / 1000).toFixed(1)}초 경과` : ph === "queue" ? "팀 동료 정비가 끝나길 기다리는 중" : ph === "penalty" ? "시간 페널티 정지 – 끝나기 전에는 작업하지 않아요" : ph === "release" ? "작업 완료 · 안전 출발 확인 대기" : ""}
      ${done && p.err ? ` · <b class="bad">정비 지연 (${esc(p.err.kind === "slow wheel" ? "바퀴 작업 지연" : p.err.kind)} +${(p.err.add ?? 0).toFixed(1)}초)</b>` : ""}</p>
    <p class="muted">요청 타이어 ${cmpChip(p.compound)} · 장착 중 ${cmpChip(car.tyre?.compound)} ${esc(CMP_KO[car.tyre?.compound] || "")}${H.ppErr ? "" : ""}</p>`);
}
const PH_ORDER = ["called", "committed", "entry", "lane", "approach", "penalty", "queue", "work", "release", "exit"];
const order = (k) => PH_ORDER.indexOf(k);

const EV_KO = { "driver error": "실수", contact: "접촉", mechanical: "고장", rc: "레이스 컨트롤", stewards: "스튜어드", retired: "리타이어", sc: "세이프티카", vsc: "VSC", red: "적색기", green: "녹색기", chequered: "체커기",
  pitCall: "피트 요청", pitCancel: "피트 요청 취소", pitEntry: "피트 진입", pitExit: "피트 출구", pitCommitted: "피트 진입 확정", pitLaneStart: "피트레인 출발", pitExitHold: "피트 출구 대기", start: "출발 준비", lightsOut: "출발",
  finished: "완주", fuelEmpty: "연료 소진", ersEmpty: "배터리 소진", teamOrder: "팀 지시", teamOrderDone: "팀 지시 완료", redTyreChange: "적색기 중 타이어 교체",
  "pit:work": "정비 시작", "pit:workDone": "정비 완료", "pit:release": "출발 신호", "pit:queue": "앞차 정비 대기", "pit:penalty": "페널티 정지", "pit:lane": "피트레인", "pit:approach": "박스 접근", "pit:exit": "피트 출구", "pit:entry": "피트 진입", "pit:laneOut": "피트레인 출구" };
// traffic's running commentary (who defends where, a pass given up, blue flags) – the engine's own log, too much for the panel
const EV_SKIP = new Set(["defend", "attackAborted", "attack", "blueFlag", "yield", "pass"]);
const effText = (x) => x == null ? "" : typeof x === "string" ? x : [x.kind, x.outcome && x.outcome !== "none" ? x.outcome : "", x.out ? `out (${x.out})` : "", x.stoppedS ? `${x.stoppedS}s 정지` : "", x.damage ? "손상" : "", x.fault ? `결함 ${x.fault}` : ""].filter(Boolean).join(" · ");
// what an event says on screen. pit:work's own text carries the stop's length and any slow wheel, decided when the work
// STARTS – never shown (request §15); at pit:workDone the time it really took (both events already drawn) is shown.
function evDetail(e, all) {
  if (e.type === "pit:work") return "";
  if (e.type === "pit:workDone") { const w = all && [...all].reverse().find((x) => x.type === "pit:work" && x.car === e.car && x.t <= e.t); return w ? `정차 작업 ${((e.t - w.t) / 1000).toFixed(1)}초` : ""; }
  if (e.type === "pitCall") { const m = /^box for (\w+): (.*)$/.exec(String(e.effect || "")); return m ? `${CMP_KO[m[1]] || m[1]} · ${whyKo(m[2])}` : /^refused: (.*)/.test(String(e.effect)) ? `거절 – ${whyKo(String(e.effect).slice(9))}` : ""; }
  if (e.type === "pitCancel") return e.effect === "cancelled" ? "" : /^refused: (.*)/.test(String(e.effect)) ? `거절 – ${whyKo(String(e.effect).slice(9))}` : "";
  if (/^pit:/.test(e.type)) return "";
  return e.effect ? effText(e.effect) : e.cause && typeof e.cause === "string" && e.cause !== "player" && e.cause !== "pit" ? e.cause : "";
}
export const evShown = (e) => !EV_SKIP.has(e.type) && !/^ai:/.test(String(e.cause || ""));
export const evLine = (e, ents, all = null) => { const cars = e.car ? [e.car] : e.cars || []; const nm = (n) => ents?.get(String(n))?.tla || "#" + n; const d = evDetail(e, all);
  return `<p class="${cars.some((n) => myCars().some((m) => String(m.num) === String(n))) ? "mine" : ""}">${fmtT(e.t ?? 0)}${e.lap ? ` L${e.lap}` : ""} <b>${esc(EV_KO[e.type] || e.type)}</b>${cars.length ? " " + cars.map((n) => esc(nm(n))).join(" ") : ""}${d ? ` · ${esc(d)}` : ""}</p>`; };
function paintEvents(el) {
  // (only events at or before the render time: the log runs ahead of what is drawn by up to a frame)
  const T = G.run.renderT, ents = new Map(G.sc.entries.map((e) => [String(e.num), e]));
  const past = G.events.filter((e) => (e.t ?? 0) <= T), ev = past.filter(evShown).slice(-7).reverse();
  setH(el, ev.length ? ev.map((e) => evLine(e, ents, past)).join("") : `<p class="muted">사건 없음${G.dev ? " (개발용 스냅샷)" : ""}</p>`);
}

// ---------- the tower's width ----------
function wireResize() {
  const h = $("grResize"), tw = $("grTower"); if (!h || !tw) return;
  h.onpointerdown = (ev) => {
    if (H.towerSlim) return;
    const x0 = ev.clientX, w0 = tw.offsetWidth; h.setPointerCapture(ev.pointerId);
    h.onpointermove = (m) => { tw.style.width = `${Math.max(180, Math.min(460, w0 + (x0 - m.clientX)))}px`; };
    h.onpointerup = () => { h.onpointermove = null; try { localStorage.setItem(TOWER_KEY, String(tw.offsetWidth)); } catch { /* per-viewer only */ } dispatchEvent(new Event("resize")); };
  };
}

// ---------- actions ----------
export function onClick(act, b) {
  const num = b.dataset.num, v = b.dataset.v, R = G.run; if (!R) return;
  const tla = num ? G.sc.entries.find((e) => String(e.num) === String(num))?.tla || num : "";
  if (act === "speed") { R.setSpeed(+v); R.slowNote = null; paint(); return; }
  if (act === "sel") { G.sel = String(num); import("./gamehome.js").then((m) => m.applyRacePrefs()); paint(); return; }
  if (act === "cam") { G.adapter?.ctx.setFocus(String(num)); if (G.adapter?.camAuto) G.adapter.camAuto = null; paint(); return; }
  if (act === "tower") { H.towerSlim = !H.towerSlim; build(); paint(); dispatchEvent(new Event("resize")); return; }
  if (act === "save") { SaveUI.savePrompt(); return; }
  if (act === "pace") { sendOrder("pace", num, { mode: v }, `${tla} 페이스 ${PACE_KO[v]}`); return; }
  if (act === "energy") { sendOrder("energy", num, { mode: v }, `${tla} 에너지 ${ENERGY_KO[v]}`); return; }
  if (act === "cmp") {
    H.pitCmp[num] = v;
    // (a call already standing: the new tyre goes to the engine as a fresh pit order – commands.js / pit.js change the
    // standing call's compound; otherwise only the choice is remembered for the 박스 button)
    const c = hudSnap(R, G.adapter)?.cars.find((x) => String(x.num) === String(num));
    if (c?.pit?.phase === "called") sendOrder("pit", num, { compound: v }, `${tla} 피트 타이어 → ${CMP_KO[v] || v}`);
    paint(); return;
  }
  if (act === "box") { const cmp = H.pitCmp[num]; sendOrder("pit", num, { compound: cmp }, `${tla} 박스 (${CMP_KO[cmp] || cmp})`); return; }
  if (act === "cancel") { sendOrder("pitCancel", num, {}, `${tla} 피트 취소`); return; }
  if (act === "team") { sendOrder("teamOrder", null, { policy: v }, `팀 지시 ${ORDER_KO[v]}`); return; }
}
export function onChange(act, t) {
  if (act === "autoSlow") { G.settings.autoSlow = t.checked; import("./gamehome.js").then((m) => { m.saveSettings(); if (G.run) G.run.autoSlow = G.settings.autoSlow ? m.autoSlowRule() : null; }); }
}
export { NO_INVENTORY };
