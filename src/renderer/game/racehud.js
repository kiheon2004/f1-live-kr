// The race screen around the 3D view (v0.50 request §9-3, §9-4, §5-6): the 3D view in the middle, the standings tower on
// the right, the team's two driver panels along the bottom (the same layout for both, so the two cars compare by place on
// screen), a top bar with the race state and the clock, and docked panels on the left that open on demand (strategy,
// car detail, forecast, events, team orders, alerts – racedock.js).
//
// Each driver panel shows the minimum to decide on, always for both cars: position, the gaps ahead / behind, the last lap
// and its delta to the car's best, the tyre (compound, laps, life, temperature state), the fuel margin to the finish
// (estimate), the battery, the next planned stop, the goal, who decides pace / energy / plan (AI / 직접 / 목표) – and the
// key controls: pace, energy, goal, box (with the tyre and the set it will take, the stock, whether it can still be
// cancelled and the team-mate's queue risk read BEFORE the call), cancel. Order states 접수 / 대기 / 적용 / 거절 with short
// reasons (orders.js whyKo). Details (temperatures and their trend, energy per lap, traffic) are in the car panel.
//
// Stable at any speed: every panel's DOM is built once (build()); paint() only changes texts, classes and widths. Nothing
// appears / disappears inside a panel's control rows while the race runs (a control that can't act is disabled, not
// removed), so a button is never under the pointer one moment and gone the next.
//
// Two different "which car" ideas, kept apart: SELECTED (the highlighted panel; the dock's car panels follow it) and
// CAMERA (the car the 3D view follows – a tower row, the panel's 카메라 button, or the pit camera's automatic choice).
//
// Update rates (measured, report gameui.md): the loop calls paint() every 200 ms; the top bar, the panels and the toasts
// every call (texts compared before writing), the tower every other call (cells compared, rows moved only when the order
// changed), the dock at 1 Hz (racedock.js – the strategy editor only when its inputs change and nothing in it has focus).
// Everything shown is the render-time picture (ui.js hudSnap – present.js), never the newest snapshot or the race state.
import { G, myCars, sendOrder } from "./gamehome.js";
import { SPEEDS } from "./runner.js";
import { $, esc, raceKo, PACE_KO, CMP_KO, FLAG_KO, PIT_KO, STATUS_KO, fmtT, cmpChip, compoundsFor, NO_INVENTORY, hudSnap } from "./ui.js";
import { ST_KO, whyKo } from "./orders.js";
import { PACE, ENERGY, TYPES as CMD_TYPES } from "../../game/engine/commands.js";
import * as HM from "./hudmodel.js";
import * as Dock from "./racedock.js";
import * as SaveUI from "./saveui.js";
import * as AlertsUI from "./alertsui.js";
import { trackOutline, carPoint, fitTransform } from "./minimap.js";

const TOWER_KEY = "f1kr:game:towerW", TOWER_MODE_KEY = "f1kr:game:towerMode";
const IN_LANE = new Set(["entry", "lane", "approach", "penalty", "queue", "work", "release", "laneOut", "exit"]);
const PACE_ORDER = ["manage", "balanced", "attack"];
const H = { told: new Set(), flash: [], built: false, pitCmp: {}, fuel: {}, ordersDirty: true, towerSlim: false, towerMode: "leader", pp: null, ppTried: false, ppErr: null, n: 0, rows: new Map(), order: "", seen: new Map(), costs: { paints: 0, ms: 0, tower: 0, towerMs: 0, writes: 0 } };
const season = () => G.sc?.meta?.season ?? G.season ?? 2025;
export const hasGoal = () => CMD_TYPES.includes("goal");
export const hasDelegate = () => CMD_TYPES.includes("delegate");

export function build() {
  const sc = G.sc, mine = myCars(sc);
  let w = 236; try { w = Math.max(170, Math.min(420, +localStorage.getItem(TOWER_KEY) || 236)); H.towerMode = localStorage.getItem(TOWER_MODE_KEY) === "ahead" ? "ahead" : "leader"; } catch { /* default */ }
  H.fuel = {}; H.rows = new Map(); H.order = ""; H.n = 0; H.seen = new Map();
  for (const e of mine) if (!H.pitCmp[e.num]) H.pitCmp[e.num] = null;   // (null: the plan's next tyre, chosen at paint)
  $("gameBody").innerHTML = `<div class="gr ${Dock.open() ? "dock-on" : ""}" id="grRoot">
    <header class="gr-top">
      <div class="gr-ev"><b>${esc(raceKo(sc.meta.event))}</b><span class="ui-badge info" title="게임 엔진이 계산한 경기 – 실제 경기 기록이 아니에요">${G.dev ? "개발용" : "게임"}</span></div>
      <div class="gr-lap"><small>랩</small><b class="num" id="grLap">–</b></div>
      <span class="ui-flag" id="grFlag">–</span>
      <div class="gr-wx" id="grWx"></div>
      <div class="gr-clock"><small>경기 시각</small><b class="num" id="grClock">–</b></div>
      <div class="gr-speedbox">
        <div class="ui-seg gr-speeds" role="group" aria-label="배속">${SPEEDS.map((x) => `<button data-act="hud:speed" data-v="${x}" title="${x ? x + "배속" : "일시정지 (Space)"}">${x ? x + "×" : "❚❚"}</button>`).join("")}</div>
        <span class="gr-ach num" id="grAch"><small id="grAchL">실제</small> <b id="grAchV">–</b></span>
      </div>
      <span class="gr-auto" id="grAuto"></span>
      <span class="gr-gap"></span>
      <div class="ui-seg gr-docktabs" role="tablist" aria-label="패널">${Dock.TABS.map(([k, t]) => `<button data-act="hud:dock" data-v="${k}" role="tab" aria-selected="${Dock.open() === k}">${t}</button>`).join("")}</div>
      <button class="ui-btn sm" data-act="hud:save" ${G.dev ? "disabled" : ""}>저장</button>
      <button class="ui-btn sm ghost" data-act="go:menu">메뉴로</button>
    </header>
    <aside class="gr-dock" id="grDock" aria-label="전략 패널"></aside>
    <div class="gr-view" id="gameView"><div class="gr-tags"><span class="gr-tag" id="grSelTag"></span><span class="gr-tag cam" id="grCamTag"></span></div>
      <div class="gr-toasts" id="grToasts" aria-live="polite"></div><div class="gr-note" id="grNote" hidden></div><div class="gr-pit pp" id="grPit" hidden></div></div>
    <aside class="gr-tower ${H.towerSlim ? "slim" : ""}" id="grTower" style="width:${H.towerSlim ? 150 : w}px">
      <div class="gr-tower-h"><b>순위</b>
        <div class="ui-seg sm" role="group" aria-label="간격 기준"><button data-act="hud:towerMode" data-v="leader" aria-pressed="${H.towerMode === "leader"}">선두</button><button data-act="hud:towerMode" data-v="ahead" aria-pressed="${H.towerMode === "ahead"}">앞차</button></div>
        <button class="ui-btn ghost sm icon" data-act="hud:tower" title="${H.towerSlim ? "펼치기" : "접기"}" aria-label="${H.towerSlim ? "순위표 펼치기" : "순위표 접기"}">${H.towerSlim ? "◀" : "▶"}</button></div>
      <div class="gr-tw" id="grTw"><table class="gr-tw-t"><tbody id="grTwB"></tbody></table></div><i class="gr-resize" id="grResize" title="끌어서 너비 조절"></i>
      <div class="gr-mini" id="grMini" role="img" aria-label="서킷 지도 – 게임 속 차량 위치"><canvas id="grMiniC"></canvas></div>
    </aside>
    <footer class="gr-bottom">${mine.map((e) => card(e)).join("")}</footer></div>`;
  H.built = true; H.ordersDirty = true;
  wireResize(); wireFold(); miniStart();
  Dock.build($("grDock"));
}
export function teardown() { H.built = false; if (H.miniRaf) cancelAnimationFrame(H.miniRaf); H.miniRaf = null; H.mini = null; Dock.teardown(); }

// ---------- the small track map (v0.54) ----------
// In the standings tower's empty foot: the circuit from above and every car where the GAME has it at render time (the
// same presented picture as the tower – hudSnap), drawn on its own animation frame (~30 fps) so the dots glide between the
// 200 ms paints. My cars: larger, outlined, named; the camera's car ringed. Reads only; never touches the race.
function miniStart() { if (!H.miniRaf) H.miniRaf = requestAnimationFrame(miniLoop); }
function miniLoop(now) {
  if (!H.built) { H.miniRaf = null; return; }
  H.miniRaf = requestAnimationFrame(miniLoop);
  if (now - (H.miniAt || 0) < 33) return; H.miniAt = now;
  try { drawMini(); } catch { /* (a map that can't draw stays blank – never the race screen's problem) */ }
}
function drawMini() {
  const R = G.run, sc = G.sc, cv = $("grMiniC"), box = $("grMini"); if (!R || !sc?.track || !cv || !box || G.step !== "race") return;
  const w = box.clientWidth, h = box.clientHeight; if (w < 40 || h < 40) return;
  const dpr = window.devicePixelRatio || 1;
  if (!H.mini || H.mini.sc !== sc || H.mini.w !== w || H.mini.h !== h) {
    const ol = trackOutline(sc.track); if (!ol) return;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + "px"; cv.style.height = h + "px";
    H.mini = { sc, w, h, ol, T: fitTransform(ol, w, h, 10), ents: new Map(sc.entries.map((e) => [String(e.num), e])) };
  }
  const M = H.mini, snap = hudSnap(R, G.adapter); if (!snap) return;
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const path = (pts, closed) => { g.beginPath(); pts.forEach(([x, y], i) => { const [a, b] = M.T.map(x, y); i ? g.lineTo(a, b) : g.moveTo(a, b); }); if (closed) g.closePath(); };
  g.lineJoin = "round"; g.lineCap = "round";
  if (M.ol.pit.length) { path(M.ol.pit, false); g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 2; g.stroke(); }
  path(M.ol.lap, true); g.strokeStyle = "rgba(255,255,255,0.32)"; g.lineWidth = 4; g.stroke();
  { const [a, b] = M.T.map(...M.ol.lap[0]); g.fillStyle = "#fff"; g.fillRect(a - 1.5, b - 1.5, 3, 3); }   // (the line where laps are counted)
  const focus = G.adapter?.ctx.focus, onCam = String(G.adapter?.camAuto?.num ?? focus ?? "");
  const cars = [...snap.cars];
  const mineOf = (c) => M.ents.get(String(c.num))?.teamKey === G.teamKey;
  cars.sort((a, b) => (mineOf(a) - mineOf(b)) || (b.pos ?? 99) - (a.pos ?? 99));   // (mine on top, the leader above the rest)
  const labels = [];
  for (const c of cars) {
    if (c.status === "dnf" && c.where !== "lap" && c.where !== "pit") continue;
    const p = carPoint(sc.track, c); if (!p) continue;
    const [x, y] = M.T.map(p[0], p[1]), e = M.ents.get(String(c.num)), mine = mineOf(c), r = mine ? 4.5 : 3.2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = e?.colour || "#888"; g.globalAlpha = c.status === "dnf" ? 0.4 : 1; g.fill(); g.globalAlpha = 1;
    if (mine) { g.lineWidth = 1.5; g.strokeStyle = "#fff"; g.stroke(); }
    if (String(c.num) === onCam) { g.beginPath(); g.arc(x, y, r + 3, 0, Math.PI * 2); g.lineWidth = 1.2; g.strokeStyle = "#ffd400"; g.stroke(); }
    if (mine) labels.push({ x, y, r, t: e?.tla || String(c.num) });
  }
  // my two cars' names: inside the box, flipped left at its right edge, the second moved off the first when they'd overlap
  g.font = "600 10px Pretendard, sans-serif"; g.textBaseline = "middle"; const placed = [];
  for (const L of labels) {
    const tw = g.measureText(L.t).width; let lx = L.x + L.r + 3; if (lx + tw > w - 2) lx = L.x - L.r - 3 - tw;
    let ly = Math.max(7, Math.min(h - 7, L.y));
    for (const q of placed) if (Math.abs(q.y - ly) < 11 && lx < q.x + q.w && q.x < lx + tw) ly = q.y + (ly >= q.y && q.y + 11 <= h - 7 ? 11 : -11);
    placed.push({ x: lx, y: ly, w: tw });
    g.lineWidth = 3; g.strokeStyle = "rgba(0,0,0,0.75)"; g.strokeText(L.t, lx, ly); g.fillStyle = "#fff"; g.fillText(L.t, lx, ly);
  }
}
export const markOrders = () => { H.ordersDirty = true; Dock.markDirty(); };

// one driver panel – the same layout for both cars, built once (v0.52 §10-1), split into BASIC and DETAIL (v0.53 §12-4):
//   BASIC, always on screen for both cars
//     state row     position · name · a status badge only when it isn't plain running (pit, box called, incident, out)
//                   · gaps (s) · last lap · camera
//     stats row     tyre (left %, temperature) · battery % · next stop
//     target line   what is in force for pace / energy / goal and who decides it, a sent-not-yet order marked "→ … 대기"
//     box row       tyre + sets · 박스 · 취소 · what the call will do (cut, whole line in its tooltip) · 조작 (the detail)
//     foot          goal state · the last order and its state – a refusal in red with its short reason, kept until the
//                   next order (and a toast when it happens: refusals are never only in a tooltip)
//   DETAIL, one card at a time, a pop-up over the view above its card (조작 ▴; Escape or the button closes it, the focus
//   goes to the mode in force and back to the button). In the DOM it follows the box row, so the Tab order is 조작 → its
//   controls → the foot (round 2). In a short window (under 600 px high – 1280 × 720 at 150 %) it opens beside its card,
//   over the other card, so the race bar's speed buttons stay uncovered:
//     페이스 / 에너지 – who decides (AI / 직접 / 목표 chip) + the modes: IN FORCE solid, SENT-not-yet dashed with a dot,
//     the rest selectable · 목표 select · AI에 맡기기 · fuel margin · the box line in full · 차량 상세 (the dock's car panel:
//     temperatures, energy per lap, trends)
// Before v0.53 the controls were open on both cards all the time and folded only on small windows; now the same pop-up at
// every size – the same action in the same place and look.
function card(e) {
  const n = esc(e.num), EK = HM.energyKo(season()), cmp = compoundsFor(G.sc);
  const LEG = "채워진 버튼: 지금 적용 중 · 점선과 점: 보냈지만 아직 적용 전 · 나머지: 누르면 바로 지시";
  const seg = (k, list, ko) => `<div class="ui-seg gc-seg" data-k="${k}" role="group" aria-label="${k === "pace" ? "페이스" : "에너지"}" title="${LEG}">${list.map((p) => `<button data-act="hud:${k}" data-num="${n}" data-v="${p}">${ko[p]}</button>`).join("")}</div>`;
  return `<section class="gr-card" data-car="${n}" style="--tc:${esc(e.colour || "#888")}" aria-label="${esc(e.tla)} 운영">
    <header class="gc-h">
      <button class="gc-sel" data-act="hud:sel" data-num="${n}" title="이 차를 선택 (패널의 상세가 이 차를 보여줘요)"><b class="gc-pos num" data-f="pos">–</b><span class="gc-name"><b>${esc(e.tla)}</b><small>#${n}</small></span></button>
      <span class="ui-badge" data-f="status" hidden></span><i class="gc-br" aria-hidden="true"></i>
      <span class="gc-gaps num" title="앞차·뒤차와의 시간 차 (초, 계측선 통과 기준 · 자료 없으면 –)"><small>앞</small><b data-f="ahead">–</b><small>뒤</small><b data-f="behind">–</b></span>
      <span class="gc-lapt num" title="최근 랩 · 이 차의 최고 랩 대비 (초)"><small>최근</small><b data-f="last">–</b><em data-f="delta"></em></span>
      <button class="ui-btn sm quiet gc-cam" data-act="hud:cam" data-num="${n}" data-f="cam" title="3D 카메라가 이 차를 따라가요">카메라</button>
    </header>
    <div class="gc-stats">
      <span class="gc-tyre" title="타이어: 컴파운드 · 이번 스틴트 랩 · 남은 수명 (새 타이어 100%, 줄어들수록 마모) · 온도 상태"><span data-f="cmp"></span><small class="num" data-f="age"></small>
        <span class="ui-meter" data-f="lifeM"><i><em data-f="lifebar"></em></i></span><small class="gc-u">남은</small><b class="num" data-f="life">–</b><span class="ui-badge" data-f="temp"></span></span>
      <span class="gc-kv" title="배터리: 남은 충전량 (%)"><small>배터리</small><span class="ui-meter" data-f="socM"><i><em data-f="socbar"></em></i></span><b class="num" data-f="soc">–</b></span>
      <span class="gc-kv gc-next" title="계획의 다음 피트 (랩 · 타이어)"><small><span class="lg">다음 피트</span><span class="sh">다음</span></small><b data-f="next">–</b></span>
    </div>
    <div class="gc-modes" data-f="modes" aria-live="off" title="${LEG}"></div>
    <div class="gc-box">
      <small class="gc-lbl">피트</small><span class="gc-own" data-f="ownPlan" title="계획(피트 시점·타이어)을 누가 정하는지">–</span>
      <select class="ui-select gc-cmp" data-chg="hud:cmp" data-num="${n}" aria-label="장착할 타이어">${cmp.list.map((c) => `<option value="${c}">${esc(CMP_KO[c] || c)}</option>`).join("")}</select>
      <button class="ui-btn gc-boxbtn" data-act="hud:box" data-num="${n}">박스</button><button class="ui-btn sm gc-cancel" data-act="hud:cancel" data-num="${n}">취소</button>
      <span class="gc-pre" data-f="pre"></span>
      <button class="ui-btn sm gc-fold" data-act="hud:fold" data-num="${n}" aria-expanded="false" aria-controls="gcCtl${n}" title="페이스·에너지·목표·AI 위임 (Esc로 닫기)">조작 ▴</button>
    </div>
    <div class="gc-ctl" id="gcCtl${n}" role="group" aria-label="${esc(e.tla)} 조작">
      <div class="gc-ctl-h"><b>${esc(e.tla)} 조작</b><span class="gc-kv gc-fuel" title="연료: 이 차가 지금까지 쓴 양으로 추정한 완주 여유 (랩, 게임 추정)"><small>연료 여유</small><b class="num" data-f="fuel">–</b></span>
        <button class="ui-btn sm ghost" data-act="hud:carDetail" data-num="${n}" title="온도·랩당 에너지·추세 – 오른쪽 차량 패널">차량 상세</button>
        <button class="ui-btn sm ghost icon" data-act="hud:fold" data-num="${n}" aria-label="닫기" title="닫기 (Esc)">✕</button></div>
      <span class="gc-grp" data-k="pace"><small class="gc-lbl">페이스</small><span class="gc-own" data-f="ownPace">–</span>${seg("pace", PACE.slice().sort((a, b) => PACE_ORDER.indexOf(a) - PACE_ORDER.indexOf(b)), PACE_KO)}</span>
      <span class="gc-grp" data-k="energy" title="${esc(HM.energyHelp(season()))}"><small class="gc-lbl">에너지</small><span class="gc-own" data-f="ownEnergy">–</span>${seg("energy", ENERGY, EK)}</span>
      <span class="gc-grp gc-goalg"><small class="gc-lbl">목표</small><select class="ui-select gc-goal" data-chg="hud:goal" data-num="${n}" ${hasGoal() ? "" : "disabled"} aria-label="운영 목표" title="목표를 고르면 목표 보조가 페이스·에너지를 정해요 (직접 누르면 목표 종료)">
        <option value="">${hasGoal() ? "없음" : "사용할 수 없음"}</option>${HM.GOALS.map((g) => `<option value="${g}">${HM.GOAL_KO[g]}</option>`).join("")}</select>
        <button class="ui-btn sm quiet gc-deleg" data-act="hud:delegate" data-num="${n}" data-f="deleg" ${hasDelegate() ? "" : "disabled"} title="직접 지시한 페이스·에너지·계획을 팀 AI에게 다시 맡겨요">AI에 맡기기</button></span>
      <span class="gc-grp gc-plang"><small class="gc-lbl">피트 계획</small><span class="gc-own" data-f="ownPlan2">–</span></span>
      <span class="gc-pre2" data-f="pre2"></span>
    </div>
    <div class="gc-foot">
      <span class="gc-goalst" data-f="goal"></span>
      <span class="gc-ord" data-f="ord"></span>
    </div>
  </section>`;
}

const f = (root, k) => root.querySelector(`[data-f="${k}"]`);
// (a text already there is changed in place – its node's data – rather than replaced: no node churn for the tower's gaps)
const setT = (el, s) => { if (!el || el.textContent === s) return; const n = el.firstChild; if (n && n.nodeType === 3 && el.childNodes.length === 1 && s) n.data = s; else el.textContent = s; H.costs.writes++; };
const setH = (el, s) => { if (el && el._h !== s) { el._h = s; el.innerHTML = s; H.costs.writes++; } };
const setC = (el, cls) => { if (el && el.className !== cls) el.className = cls; };
const setW = (el, frac) => { if (!el) return; const w = `${Math.round(Math.max(0, Math.min(1, frac ?? 0)) * 100)}%`; if (el.style.width !== w) el.style.width = w; };

export function paint() {
  const R = G.run; if (!R || G.step !== "race") return;
  if (!H.built) build();
  const t0 = performance.now();
  const snap = hudSnap(R, G.adapter); if (!snap) return;
  const sc = G.sc, ents = new Map(sc.entries.map((e) => [String(e.num), e])), T = R.renderT;
  H.n++;
  // (orders already settled when this race was opened – a loaded save – are not news: only refusals from now on toast)
  if (H.toldRun !== R) { H.toldRun = R; H.told = new Set(G.book.list.filter((o) => o.state === "refused" || o.state === "rejected").map((o) => o.id)); H.flash = []; }
  // ---- top bar ----
  setT($("grLap"), `${Math.min(snap.leaderLap || 0, snap.totalLaps ?? Infinity)}/${snap.totalLaps ?? "?"}`);
  const fl = $("grFlag"), flag = snap.flag || "";
  setT(fl, FLAG_KO[flag] || flag || "–"); setC(fl, `ui-flag ${{ green: "green", yellow: "yellow", sc: "sc", vsc: "vsc", red: "red", chequered: "chequered" }[flag] || ""}`);
  const w = snap.weather || {};
  setH($("grWx"), `${w.airT != null ? `<span>기온 <b class="num">${Math.round(w.airT)}°</b></span>` : ""}${w.trackT != null ? `<span>노면 <b class="num">${Math.round(w.trackT)}°</b></span>` : ""}<span>${w.rain > 0.05 ? `<b class="rain">비</b>` : "건조"}${w.water > 0.05 ? ` · 물 ${w.water.toFixed(1)}mm` : w.water > 0.005 ? " · 젖음" : ""}</span>`);
  setT($("grClock"), fmtT(T));
  // (the weather the screen showed, every 10 s of race time – only for the result's lap axis; never read by the race)
  if (!G.wxLog || G.wxLog.run !== R) G.wxLog = { run: R, s: [] };
  { const L = G.wxLog.s; if (!L.length || T - L[L.length - 1].t >= 10000) { L.push({ t: T, rain: w.rain ?? 0, water: Number.isFinite(w.water) ? +w.water.toFixed(3) : null }); if (L.length > 3000) L.shift(); } }
  // (the achieved speed: two text nodes updated in place – no markup rebuilt 5× a second)
  setT($("grAchL"), R.paused ? "" : "실제"); setT($("grAchV"), R.paused ? "일시정지" : `${R.achieved.toFixed(1)}×`); setC($("grAchV"), R.behind && !R.paused ? "bad" : "");
  setH($("grAuto"), R.slowNote ? `<span class="ui-badge warn" title="${esc(R.slowNote.why || "")}">${R.slowNote.action === "pause" ? "자동 정지" : "자동 감속"} · ${esc(String(R.slowNote.why || "").slice(0, 26))}</span>` : R.behind ? `<span class="ui-badge sc" title="계산이 따라가지 못해 실제로 낼 수 있는 배속으로 진행 중">계산 한계</span>` : "");
  const req = R.paused ? 0 : R.speed;
  // (paused: the pause button is pressed and the speed it resumes at is marked "held")
  document.querySelectorAll(".gr-speeds [data-v]").forEach((b) => { const v = +b.dataset.v; b.setAttribute("aria-pressed", String(v === req)); b.classList.toggle("held", R.paused && v === R.speed && v > 0); });
  // ---- tags: selected vs camera ----
  const focus = G.adapter?.ctx.focus, auto = G.adapter?.camAuto, onCam = String(auto?.num ?? focus ?? "");
  const tla = (n) => ents.get(String(n))?.tla || n || "–";
  // (one tag when the camera is on the selected car – two only when they differ)
  const camN = String(auto?.num ?? focus ?? ""), same = camN === String(G.sel ?? "") && !auto;
  setH($("grSelTag"), `<small>${same ? "선택 · 카메라" : "선택"}</small> <b>${esc(tla(G.sel))}</b>`);
  setH($("grCamTag"), same ? "" : `<small>카메라</small> <b>${esc(tla(auto?.num ?? focus))}</b>${auto ? ` <small>자동${auto.why ? " · " + esc(auto.why) : ""}</small>` : ""}`);
  // (the 3D view's provenance notes stay one short line each over the race – the whole sentence in the tooltip)
  if (H.n % 5 === 0) document.querySelectorAll("#notes3d.game .note3d-line").forEach((l) => { if (l.title !== l.textContent) l.title = l.textContent; });
  // ---- tower (every other call) ----
  if (H.n % 2 === 1 || H.ordersDirty) { const a = performance.now(); paintTower(snap, ents, onCam); H.costs.tower++; H.costs.towerMs += performance.now() - a; }
  // ---- the panels ----
  const mine = myCars(sc);
  for (const e of mine) paintCard(e, snap, T, onCam, mine);
  // ---- the selected car's pit work over the view ----
  const sel = snap.cars.find((c) => String(c.num) === String(G.sel)), inLane = sel && sel.where === "pit" && IN_LANE.has(sel.pit?.phase);
  const pitCar = inLane ? sel : snap.cars.find((c) => mine.some((m) => String(m.num) === String(c.num)) && c.where === "pit" && IN_LANE.has(c.pit?.phase));
  const pitEl = $("grPit");
  if (pitCar) pitPanel(pitEl, pitCar, T, snap); else if (!pitEl.hidden) pitEl.hidden = true;
  // ---- notices (alerts.js via gamehome: G.notices) ----
  paintToasts();
  // (the save note for 6 s after it changes – a failure stays until the next save)
  const note = $("grNote"), sn = G.saveNote;
  if (sn && sn !== H.note) { H.note = sn; H.noteAt = performance.now(); }
  const showNote = sn && (!sn.ok || performance.now() - (H.noteAt || 0) < 6000);
  if (showNote) { note.hidden = false; note.className = `gr-note ${sn.ok ? "" : "bad"}`; setT(note, sn.text); } else if (!note.hidden) note.hidden = true;
  // ---- the dock (1 Hz, or at once after an order) ----
  if (H.n % 5 === 0 || H.ordersDirty) Dock.paint(snap, T, { fuel: H.fuel });
  H.ordersDirty = false;
  H.costs.paints++; H.costs.ms += performance.now() - t0;
}

// ---------- the tower: rows made once per car, cells updated, rows moved only when the order changed ----------
function paintTower(snap, ents, onCam) {
  const body = $("grTwB"); if (!body) return;
  const cars = [...snap.cars].sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
  for (const c of cars) {
    const k = String(c.num); let r = H.rows.get(k);
    if (!r) {
      const e = ents.get(k), tr = document.createElement("tr");
      tr.dataset.act = "hud:cam"; tr.dataset.num = k; tr.title = "카메라로 보기";
      tr.innerHTML = `<td class="p num"></td><td class="n"><i style="background:${esc(e?.colour || "#888")}"></i>${esc(e?.tla || k)}</td><td class="g num"></td><td class="t"></td><td class="s"></td>`;
      if (e?.teamKey === G.teamKey) tr.classList.add("mine");
      r = { tr, p: tr.children[0], g: tr.children[2], t: tr.children[3], s: tr.children[4], cls: "" };
      H.rows.set(k, r);
    }
    setT(r.p, c.pos ? String(c.pos) : "–");
    const g = c.pos === 1 ? "선두" : H.towerMode === "ahead" ? HM.fmtGap(c.gap?.ahead, c.gap?.aheadLaps) : HM.fmtGap(c.gap?.leader, c.gap?.lapsDown);
    setT(r.g, g);
    setH(r.t, `${cmpChip(c.tyre?.compound)}<small class="num">${c.tyre?.age ?? ""}</small>`);
    setH(r.s, c.status === "pit" ? `<em class="pit">PIT</em>` : c.status === "dnf" ? `<em class="out">OUT</em>` : c.status === "fin" ? `<em class="fin">완주</em>` : c.pen?.open?.length ? `<em class="pen" title="미이행 페널티">P</em>` : "");
    const cls = `${ents.get(k)?.teamKey === G.teamKey ? "mine" : ""} ${k === onCam ? "focus" : ""} ${c.status === "dnf" ? "out" : ""}`.trim();
    if (r.cls !== cls) { r.cls = cls; r.tr.className = cls; }
  }
  const order = cars.map((c) => c.num).join(",");
  if (order !== H.order) { H.order = order; for (const c of cars) body.appendChild(H.rows.get(String(c.num)).tr); }
}

// ---------- a driver panel ----------
function paintCard(e, snap, T, onCam, mine) {
  const root = document.querySelector(`.gr-card[data-car="${CSS.escape(String(e.num))}"]`); if (!root) return;
  const c = snap.cars.find((x) => String(x.num) === String(e.num)); if (!c) return;
  const mate = snap.cars.find((x) => mine.some((m) => String(m.num) === String(x.num)) && String(x.num) !== String(e.num)) || null;
  const out = c.status === "dnf" || c.status === "fin";
  root.classList.toggle("sel", String(G.sel) === String(e.num));
  root.classList.toggle("cam", onCam === String(e.num));
  root.classList.toggle("out", out);
  setT(f(root, "pos"), c.pos ? `P${c.pos}` : "–");
  const st = f(root, "status"), ph = c.pit?.phase || "none";
  setT(st, c.status === "pit" ? PIT_KO[ph] || "피트" : ph === "called" ? "박스 요청" : ph === "committed" ? "진입 확정" : c.status === "run" && c.inc ? HM.incKo(c.inc) : STATUS_KO[c.status] || c.status || "");
  setC(st, `ui-badge ${c.status === "pit" || ph === "called" || ph === "committed" ? "info" : c.status === "dnf" ? "bad" : c.inc ? "warn" : ""}`);
  // (plain running is the usual state – no badge saying "주행 중" on both cards all race long)
  { const plain = HM.plainRunning(c); if (st.hidden !== plain) st.hidden = plain; }
  setT(f(root, "cam"), onCam === String(e.num) ? "카메라 ●" : "카메라");
  // gaps (timing line; "–" when there is no data – never 0), last lap and delta
  // (seconds to that car – "앞 1.2초 · 뒤 0.4초"; laps "+1랩"; the leader has no car ahead: "없음"; no data "–")
  const bh = HM.gapBehind(snap.cars, e.num);
  setT(f(root, "ahead"), c.pos === 1 ? "없음" : HM.gapText(c.gap?.ahead, c.gap?.aheadLaps)); setT(f(root, "behind"), bh.car ? HM.gapText(bh.g, bh.laps) : "없음");
  setT(f(root, "last"), HM.fmtLapT(c.last?.t));
  const d = HM.lapDelta(c.last, c.best), de = f(root, "delta"); setT(de, d); setC(de, d.startsWith("+") ? "t-lose" : d ? "t-gain" : "");
  // tyre
  const ty = c.tyre || {}, set = (c.sets || []).find((s) => s.state === "fitted");
  setH(f(root, "cmp"), cmpChip(ty.compound).replace('class="g-cmp', `class="g-cmp${ty.used || set?.used ? " used" : ""}`));
  setT(f(root, "age"), ty.age != null ? `${ty.age}랩` : "");
  const L = HM.tyreLife(ty); setT(f(root, "life"), L.pct); setW(f(root, "lifebar"), L.life); setC(f(root, "lifeM"), `ui-meter ${L.cls}`);
  const tt = HM.tyreTemp(ty), te = f(root, "temp"); setT(te, tt.key ? tt.label : "–"); setC(te, `ui-badge ${tt.cls}`); { const tip = tt.key ? `${tt.label} – 작동 온도 ${Math.round(ty.win.lo)}–${Math.round(ty.win.hi)}°C, 지금 ${Math.round(ty.Tw)}°C` : tt.label; if (te.title !== tip) te.title = tip; }
  // fuel margin (estimate from this car's own burn) and battery
  const fm = fuelOf(c, snap), fe = f(root, "fuel");
  setT(fe, fm ? `${fm.marginLaps >= 0 ? "+" : "−"}${Math.abs(fm.marginLaps).toFixed(fm.marginLaps > -1 && fm.marginLaps < 1 ? 1 : 0)}랩` : Number.isFinite(c.fuel) ? "계산 중" : "–");
  setC(fe, `num ${fm && !fm.ok ? "t-lose" : ""}`);
  const soc = Number.isFinite(c.energy?.soc) ? c.energy.soc : null;
  setT(f(root, "soc"), soc == null ? "–" : `${Math.round(soc * 100)}%`); setW(f(root, "socbar"), soc); setC(f(root, "socM"), `ui-meter ${soc != null && soc < 0.2 ? "warn" : "ok"}`);
  // the next planned stop
  const ns = (c.plan?.stints || []).find((x, k, a) => x.toLap > (c.lap || 0) && k < a.length - 1), nx = ns ? (c.plan.stints[c.plan.stints.indexOf(ns) + 1]?.compound) : null;
  setH(f(root, "next"), c.plan ? (ns ? `${ns.toLap}랩 ${cmpChip(nx)}` : "없음") : "–");
  // modes in force (the render-time picture); an order still waiting is marked pending on its button, never pressed;
  // who decides each kind as a chip (AI / 직접 / 목표) with its meaning in the tooltip
  const EK = HM.energyKo(season()), modeWords = [];
  for (const [k, cur, ko] of [["pace", c.mode?.pace, PACE_KO], ["energy", c.mode?.energy ?? c.energy?.mode, EK]]) {
    const pend = pendingShown(e.num, k, T), btns = HM.modeButtons([...root.querySelectorAll(`.ui-seg[data-k="${k}"] button`)].map((b) => b.dataset.v), cur, pend?.args?.mode, out);
    root.querySelectorAll(`.ui-seg[data-k="${k}"] button`).forEach((b, i) => { const m = btns[i]; if (b.getAttribute("aria-pressed") !== String(m.inForce)) b.setAttribute("aria-pressed", String(m.inForce)); b.classList.toggle("pending", m.pending); if (b.disabled !== m.disabled) b.disabled = m.disabled; });
    const oc = HM.ownChip(c.own, k), el = f(root, k === "pace" ? "ownPace" : "ownEnergy"); setT(el, oc.text); setC(el, oc.cls); if (el.title !== oc.tip) el.title = oc.tip;
    modeWords.push(`<span class="gm-k"><small>${k === "pace" ? "페이스" : "에너지"}</small> <b>${esc(ko[cur] || "–")}</b>${oc.key ? ` <i class="${esc(oc.cls)}">${esc(oc.text)}</i>` : ""}${pend ? ` <em class="gm-pend">→ ${esc(ko[pend.args?.mode] || "")} 대기</em>` : ""}</span>`);
  }
  const op = HM.ownChip(c.own, "plan");
  for (const ope of [f(root, "ownPlan"), f(root, "ownPlan2")]) { setT(ope, op.key ? op.text : "–"); setC(ope, op.cls); const tt = `피트 계획: ${op.tip}`; if (ope.title !== tt) ope.title = tt; }
  modeWords.push(`<span class="gm-k"><small>목표</small> <b>${c.goal && c.goal.state !== "done" ? esc(HM.GOAL_SHORT[c.goal.kind] || c.goal.kind) : "없음"}</b></span>`);
  setH(f(root, "modes"), modeWords.join(""));
  // goal (the select follows the engine unless the player is on it)
  const gs = root.querySelector(".gc-goal"); if (gs && document.activeElement !== gs) { const v = c.goal && c.goal.state !== "done" ? c.goal.kind : ""; if (gs.value !== (v || "")) gs.value = v || ""; gs.disabled = !hasGoal() || out; }
  const tlaOf = (n) => G.sc.entries.find((x) => String(x.num) === String(n))?.tla || (n ? "#" + n : "");
  const ge = f(root, "goal");
  if (c.goal) { { const gt = `${HM.GOAL_STATE_KO[c.goal.state] || c.goal.state}${HM.goalWhy(c.goal.why, tlaOf) ? " – " + HM.goalWhy(c.goal.why, tlaOf) : ""}`; setT(ge, gt); if (ge.title !== gt) ge.title = `목표 ${HM.GOAL_KO[c.goal.kind] || c.goal.kind}: ${gt}`; } setC(ge, `gc-goalst ${c.goal.state === "blocked" ? "t-lose" : c.goal.state === "waiting" ? "muted" : ""}`); }
  else setT(ge, "");
  // box: the tyre (the player's choice, else the plan's next), the set and stock, cancel window, the team-mate's risk
  const cmpSel = root.querySelector(".gc-cmp"); let choice = H.pitCmp[e.num] || (ph === "called" ? c.pit?.compound : null) || nx || (ty.compound === "HARD" ? "MEDIUM" : "HARD");
  if (cmpSel && document.activeElement !== cmpSel && cmpSel.value !== choice) cmpSel.value = choice;
  if (cmpSel && Array.isArray(c.sets)) { const S = HM.setStock(c.sets).by; for (const o of cmpSel.options) { const t = `${CMP_KO[o.value] || o.value} · ${S[o.value]?.free ?? 0}세트`; if (o.textContent !== t) o.textContent = t; } }
  const pv = HM.boxPreview(c, mate, choice), lane = IN_LANE.has(ph);
  const boxB = root.querySelector(".gc-boxbtn"), blocked = HM.boxBlocked(c, pv); boxB.disabled = !!blocked;
  setT(boxB, ph === "called" ? "변경" : "박스"); { const tt = blocked ? `지금은 박스 불가: ${blocked}` : ph === "called" ? "요청한 피트의 타이어를 바꿔요" : "다음 피트 입구에서 들어와요 (긴급 박스)"; if (boxB.title !== tt) boxB.title = tt; }
  root.querySelector('[data-act="hud:cancel"]').disabled = ph !== "called";
  if (cmpSel) cmpSel.disabled = out || lane || ph === "committed";
  let pre;
  if (lane) pre = `<b>${esc(PIT_KO[ph] || ph)}</b>${c.pit?.compound ? ` · ${cmpChip(c.pit.compound)} 장착 예정` : ""}`;
  else if (ph === "called" || ph === "committed") pre = `<b>${ph === "called" ? "박스 요청됨" : "피트 진입 확정"}</b> · ${cmpChip(c.pit?.compound)} ${esc(CMP_KO[c.pit?.compound] || "")} · ${esc(pv.cancel)}${pv.mate.text ? ` · <span class="${pv.mate.risk === "high" ? "t-lose" : ""}">${esc(pv.mate.text)}</span>` : ""}`;
  else if (out) pre = "";
  else pre = !pv.ok ? `<span class="t-lose">${esc(pv.why)}</span>` : `박스 → ${cmpChip(choice)} ${Array.isArray(c.sets) ? `${esc(HM.setLabel(pv.set))} · 남은 ${pv.left}` : `<span class="muted">${esc(NO_INVENTORY)}</span>`} · ${esc(pv.cancel)}${pv.mate.text ? ` · <span class="${pv.mate.risk === "high" ? "t-lose" : ""}">${esc(pv.mate.text)}</span>` : ""}`;
  const pe = f(root, "pre"); setH(pe, pre); setH(f(root, "pre2"), pre); { const tt = pe.textContent; if (pe.title !== tt) pe.title = tt; }   // (cut on a narrow card – the whole line in the tooltip)
  // the last order of this car and what became of it (its state at the render time)
  const o = G.book.last(e.num);
  setH(f(root, "ord"), o ? orderLine(o, T) : "");
  // (a refused order also as a toast, once – never only a word in a card's corner)
  if (o) { const os = G.book.stateAt ? G.book.stateAt(o, T) : o.state; if ((os === "refused" || os === "rejected") && !H.told.has(o.id)) { H.told.add(o.id); H.flash.push({ id: "o" + o.id, at: performance.now(), cls: "bad", head: `거절 · ${e.tla}`, text: `${o.text || o.type}${o.why ? " – " + whyKo(o.why) : ""}` }); } }
  const dl = f(root, "deleg"); if (dl) dl.disabled = !hasDelegate() || out || !c.own || !["pace", "energy", "plan"].some((k) => c.own[k] === "player" || c.own[k] === "goal");
}
// the order of a kind still waiting at render time (shown as pending on its button, never as the mode in force)
function pendingShown(num, type, T) {
  for (let i = G.book.list.length - 1; i >= 0; i--) { const o = G.book.list[i]; if (o.car !== String(num) || o.type !== type) continue; return (G.book.stateAt ? G.book.stateAt(o, T) : o.state) === "queued" ? o : null; }
  return null;
}
const ST_SHORT = { sending: "보내는 중", queued: "대기", applied: "적용", refused: "거절", rejected: "접수 거절", unknown: "확인 불가" };
function orderLine(o, T) {
  // (a refusal: its reason short on the panel, the whole reason in the tooltip)
  const s = G.book.stateAt ? G.book.stateAt(o, T) : o.state, full = (s === "refused" || s === "rejected") && o.why ? whyKo(o.why) : "";
  return `<span class="gr-ord ${s}" title="${esc(`${o.text || o.type} – ${ST_KO[s] || s}${full ? ": " + full : ""}`)}">${esc(o.text || o.type)} <b>${esc(ST_SHORT[s] || s)}</b>${full ? ` – ${esc(HM.clip(full, 24))}` : ""}</span>`;
}
// fuel samples per car: one at each completed lap (render-time picture)
function fuelOf(c, snap) {
  const h = H.fuel[c.num] || (H.fuel[c.num] = []);
  if (Number.isFinite(c.fuel) && (!h.length || c.lap > h[h.length - 1].lap)) { h.push({ lap: c.lap, fuel: c.fuel }); if (h.length > 8) h.shift(); }
  return HM.fuelMargin(h, c.fuel, c.lap, snap.totalLaps);
}

// ---------- notices (alerts) as toasts over the view: the newest three, each for 8 s of wall time ----------
function paintToasts() {
  const el = $("grToasts"); if (!el) return;
  const now = performance.now(), list = (G.notices || []).slice(-6);
  for (const a of list) if (!H.seen.has(a.id)) H.seen.set(a.id, now);
  const tlaOf = (n) => G.sc.entries.find((x) => String(x.num) === String(n))?.tla || "";
  H.flash = H.flash.filter((x) => now - x.at < 8000);
  const items = list.filter((a) => now - H.seen.get(a.id) < 8000).map((a) => ({ at: H.seen.get(a.id), html: `<div class="ui-toast ${HM.noticeCls(a.level)}"><b>${esc(AlertsUI.RULE_KO[a.rule] || a.rule)}${a.car ? " · " + esc(tlaOf(a.car)) : ""}</b><span>${esc(a.text)}</span><small>${a.action === "pause" ? "자동 정지" : a.action === "slow" ? "1배속으로" : ""}</small></div>` }))
    .concat(H.flash.map((x) => ({ at: x.at, html: `<div class="ui-toast ${x.cls}"><b>${esc(x.head)}</b><span>${esc(x.text)}</span></div>` })));
  setH(el, items.sort((a, b) => a.at - b.at).slice(-3).reverse().map((x) => x.html).join(""));
}

// the pit-work panel: pitpanel.js render(el, car, renderT, ctx) – never the stop's future length
async function loadPitPanel() { if (H.ppTried) return; H.ppTried = true; try { const m = await import("./pitpanel.js"); const fn = m.renderPitPanel || m.render; if (typeof fn === "function") H.pp = { render: fn }; } catch (e) { H.ppErr = String(e.message || e); } }
function pitPanel(el, car, T, snap) {
  loadPitPanel();
  const e = G.sc.entries.find((x) => String(x.num) === String(car.num));
  if (H.pp) { try { H.pp.render(el, car, T, { tla: e?.tla || null, colour: e?.colour || null, entry: e, snapshot: snap, scenario: G.sc, team: G.teamKey }); return; } catch (err) { H.ppErr = String(err.message || err); H.pp = null; } }
  el.hidden = false;
  setH(el, `<div class="pp-h"><b>${esc(e?.tla || car.num)}</b> <span>${esc(PIT_KO[car.pit?.phase] || "")}</span></div>`);
}

// ---------- the folded controls (narrow / short windows): a pop-up over the view, Escape or the button closes it ----------
function foldCtl(num, open = null) {
  const root = document.querySelector(`.gr-card[data-car="${CSS.escape(String(num))}"]`); if (!root) return;
  const on = open == null ? !root.classList.contains("ctl-open") : open, btn = root.querySelector(".gc-fold");
  document.querySelectorAll(".gr-card.ctl-open").forEach((x) => { if (x !== root) { x.classList.remove("ctl-open"); x.querySelector(".gc-fold")?.setAttribute("aria-expanded", "false"); } });
  root.classList.toggle("ctl-open", on); btn?.setAttribute("aria-expanded", String(on)); if (btn) btn.textContent = on ? "조작 ▾" : "조작 ▴";
  if (on) (root.querySelector('.gc-ctl button[aria-pressed="true"]') || root.querySelector(".gc-ctl button, .gc-ctl select"))?.focus();
  else if (root.contains(document.activeElement)) btn?.focus();
}
function wireFold() {
  document.querySelectorAll(".gr-card").forEach((root) => root.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && root.classList.contains("ctl-open")) { ev.stopPropagation(); ev.preventDefault(); foldCtl(root.dataset.car, false); }
  }));
}

// ---------- the tower's width ----------
function wireResize() {
  const h = $("grResize"), tw = $("grTower"); if (!h || !tw) return;
  h.onpointerdown = (ev) => {
    if (H.towerSlim) return;
    const x0 = ev.clientX, w0 = tw.offsetWidth; h.setPointerCapture(ev.pointerId);
    h.onpointermove = (m) => { tw.style.width = `${Math.max(170, Math.min(420, w0 + (x0 - m.clientX)))}px`; };
    h.onpointerup = () => { h.onpointermove = null; try { localStorage.setItem(TOWER_KEY, String(tw.offsetWidth)); } catch { /* per-viewer only */ } dispatchEvent(new Event("resize")); };
  };
}

// ---------- actions ----------
export function onClick(act, b) {
  const num = b.dataset.num, v = b.dataset.v, R = G.run; if (!R) return;
  const tla = num ? G.sc.entries.find((e) => String(e.num) === String(num))?.tla || num : "";
  if (act === "speed") { if (+v > 0) R.manual ? R.manual(+v) : R.setSpeed(+v); else { R.slowNote = null; R.pause(); } paint(); return; }
  if (act === "sel") { G.sel = String(num); import("./gamehome.js").then((m) => m.applyRacePrefs()); Dock.markDirty(); paint(); return; }
  if (act === "cam") { G.adapter?.ctx.setFocus(String(num)); if (G.adapter?.camAuto) G.adapter.camAuto = null; paint(); return; }
  if (act === "tower") { H.towerSlim = !H.towerSlim; build(); paint(); dispatchEvent(new Event("resize")); return; }
  if (act === "towerMode") { H.towerMode = v === "ahead" ? "ahead" : "leader"; try { localStorage.setItem(TOWER_MODE_KEY, H.towerMode); } catch { /* per-viewer only */ } document.querySelectorAll('[data-act="hud:towerMode"]').forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === H.towerMode))); H.ordersDirty = true; paint(); return; }
  if (act === "dock") { Dock.toggle(v); $("grRoot")?.classList.toggle("dock-on", !!Dock.open()); document.querySelectorAll('[data-act="hud:dock"]').forEach((x) => x.setAttribute("aria-selected", String(x.dataset.v === Dock.open()))); requestAnimationFrame(() => dispatchEvent(new Event("resize"))); H.ordersDirty = true; paint(); return; }
  if (act === "save") { SaveUI.savePrompt(); return; }
  if (act === "fold") { foldCtl(num); return; }
  if (act === "carDetail") { G.sel = String(num); if (Dock.open() !== "car") onClick("dock", { dataset: { v: "car" } }); else { Dock.markDirty(); paint(); } return; }
  const EK = HM.energyKo(season());
  if (act === "pace") { sendOrder("pace", num, { mode: v }, `${tla} 페이스 ${PACE_KO[v]}`); return; }
  if (act === "energy") { sendOrder("energy", num, { mode: v }, `${tla} 에너지 ${EK[v]}`); return; }
  if (act === "box") {
    const snap = hudSnap(R, G.adapter), c = snap?.cars.find((x) => String(x.num) === String(num));
    const cmpSel = document.querySelector(`.gr-card[data-car="${CSS.escape(String(num))}"] .gc-cmp`), cmp = H.pitCmp[num] || cmpSel?.value;
    const set = Array.isArray(c?.sets) ? HM.pickSet(c.sets, cmp) : null;
    sendOrder("pit", num, set ? { compound: cmp, setId: set.id } : { compound: cmp }, `${tla} 박스 ${CMP_KO[cmp] || cmp}`); return;
  }
  if (act === "cancel") { sendOrder("pitCancel", num, {}, `${tla} 피트 취소`); return; }
  if (act === "delegate") { sendOrder("delegate", num, { kinds: ["pace", "energy", "plan"] }, `${tla} AI에 맡김`); return; }
  Dock.onClick?.(act, b);
}
export function onChange(act, t) {
  const num = t.dataset.num, R = G.run; if (!R) return;
  const tla = num ? G.sc.entries.find((e) => String(e.num) === String(num))?.tla || num : "";
  if (act === "cmp") {
    H.pitCmp[num] = t.value;
    // (a call already standing: the new tyre goes to the engine at once as a fresh pit order – it moves the reservation)
    const c = hudSnap(R, G.adapter)?.cars.find((x) => String(x.num) === String(num));
    if (c?.pit?.phase === "called") { const set = Array.isArray(c.sets) ? HM.pickSet(c.sets, t.value) : null; sendOrder("pit", num, set ? { compound: t.value, setId: set.id } : { compound: t.value }, `${tla} 피트 타이어 → ${CMP_KO[t.value] || t.value}`); }
    paint(); return;
  }
  if (act === "goal") { const k = t.value || null; sendOrder("goal", num, { kind: k }, k ? `${tla} 목표: ${HM.GOAL_KO[k]}` : `${tla} 목표 해제`); t.blur(); return; }
  Dock.onChange?.(act, t);
}
export const onInput = (act, t) => Dock.onInput?.(act, t);
export const hudCosts = () => ({ paints: H.costs.paints, msAvg: H.costs.paints ? +(H.costs.ms / H.costs.paints).toFixed(3) : null, tower: H.costs.tower, towerMsAvg: H.costs.tower ? +(H.costs.towerMs / H.costs.tower).toFixed(3) : null, writes: H.costs.writes, dock: Dock.costs() });
export { NO_INVENTORY };
export { evLine, evShown } from "./racedock.js";
