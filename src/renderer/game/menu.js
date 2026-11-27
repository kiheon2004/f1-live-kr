// The game's main menu (v0.71): a row of tabs over a mosaic of tiles – no picture behind it. A tile is a title, one line
// and its button; the shapes on the tiles are plain blocks and lines.
//   tabs    홈 (the tiles) · 경기 기록 · 드라이버·차량, and the gear at the row's end = 설정
//   tiles   레이스 준비 (the chosen race's strategy screen – the large blue tile) · 이어하기 (the latest save) · 경기 선택 ·
//           저장 슬롯 · 차고 · 팀 바꾸기
// 차고 opens the 3D menu garage (menugarage.js) – the player's team in its garage, the car as the hero, the race's two
// drivers beside it: the garage is built only when that tile is opened (v0.50–0.70 drew it behind the whole menu), and
// its safe area is MEASURED from the laid-out DOM and handed to the scene's setSafe().
//
// Which drivers: the entry list of ONE prepared race (the chosen one, else the team's latest prepared race of the
// season) – said on screen ("이 경기 기준"); never the season's other drivers (a team's line-up changes during a season).
//
// Loading: the menu's own DOM and a readable loading line (team, car number) are painted BEFORE the room is built – the
// build and shader compile hold the main thread for a moment and the screen must not be blank meanwhile. The scene's
// quality (high: floor reflection / medium / low) is the menu's own budget (settings: 차고 화질).
import { G, go, paint, seasons, teamsOf, racesOf, menuRace, toPrerace, saveSettings, autoSlowRule, applyRacePrefs } from "./gamehome.js";
import { $, esc, teamKo, raceKo, fmtT } from "./ui.js";
import { safeFrac } from "./hudmodel.js";
import * as API from "./gameapi.js";
import * as SaveUI from "./saveui.js";

// ---------- the 3D garage hook ----------
const MG = { mod: null, tried: false, err: null, shown: null, drawn: null, focus: null, safe: null, pending: null };
async function garageModule() {
  if (MG.tried) return MG.mod; MG.tried = true;
  try { const m = await import("./menugarage.js"); if (typeof m.show === "function") MG.mod = m; else MG.err = "3D 차고를 열 수 없어요"; }
  catch (e) { MG.mod = null; MG.err = "3D 차고를 열 수 없어요"; }
  return MG.mod;
}
// the two drivers the menu shows: the chosen race's entry list for this team – never the season's other drivers (a team's
// line-up changes during a season; with no race there is nobody to show)
export const menuEntries = (r = menuRace()) => (r?.entries || []).filter((e) => e.teamKey === G.teamKey).slice(0, 2);
const garageKey = (r = menuRace()) => `${G.season}|${G.teamKey}|${r?.id || ""}`;
// what the scene is asked to show (a new team / race / focus → show again; the same → nothing)
async function showGarage(host) {
  const r = menuRace(), t = teamsOf(G.season).find((x) => x.key === G.teamKey); if (!t || !host) return;
  const entries = menuEntries(r);
  const focusNum = MG.focus && entries.some((e) => String(e.num) === MG.focus) ? MG.focus : String(entries[0]?.num ?? "");
  MG.focus = focusNum;
  const key = garageKey(r);
  const m = await garageModule();
  if (!m) { host.dataset.fallback = "1"; paintLoading(); return; }
  m.setQuality?.(qualityOf());
  if (MG.shown === key) { m.setFocus?.(focusNum); reframe(); return; }
  MG.shown = key; MG.drawn = null; host.dataset.fallback = ""; host.dataset.drawn = "";
  // (the menu's own DOM – the team, the actions, the drivers and the loading line – is painted before the room is built:
  // building and compiling the room takes the main thread for a moment, and the screen must not stay blank meanwhile)
  await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 16)));
  if (MG.shown !== key || G.step !== "menu" || !host.isConnected) return;
  try {
    m.setMotion?.(motionOf());
    const sf = safeArea(host);
    const st = await m.show({ host, season: G.season, teamKey: G.teamKey, team: t.name, colour: t.colour, entries: entries.map((e) => ({ num: e.num, tla: e.tla, name: e.name })), focusNum, date: r?.date || null,
      safeLeft: sf.left, safeRight: sf.right, quality: qualityOf() });
    MG.safe = sf;
    if (st?.err) MG.err = "3D 차고를 그리지 못했어요";
    else if (st?.shown && MG.shown === key) { MG.drawn = key; host.dataset.drawn = "1"; MG.err = null; }
  } catch (e) { MG.err = "3D 차고를 그리지 못했어요"; MG.shown = null; host.dataset.fallback = "1"; }
  paintLoading();
  reframe();
}
// The car's safe area: the share of the scene's width the menu column (left) and the driver cards / sheet (right) cover,
// measured from the DOM as laid out now (they change with the window and when a sheet opens) plus a margin, so the car is
// framed in the free middle and never under text.
function safeArea(host) {
  const H = host.getBoundingClientRect(), W = H.width || innerWidth, L = $("gmLeft")?.getBoundingClientRect(), R = $("gmRight")?.getBoundingClientRect();
  return safeFrac(W, L ? L.right - H.left : 0, R && R.width ? H.right - R.left : 0);
}
function reframe() {
  const host = $("gGarage3d"), m = MG.mod; if (!host || !m?.setSafe || G.step !== "menu") return;
  const sf = safeArea(host);
  if (MG.safe && Math.abs(MG.safe.left - sf.left) < 0.004 && Math.abs(MG.safe.right - sf.right) < 0.004) return;
  MG.safe = sf; m.setSafe(sf.left, sf.right);
}
addEventListener("resize", () => { if (G.on && G.step === "menu") requestAnimationFrame(reframe); });
// the loading / error line over the scene: readable at once, with the team and the car being prepared; gone once drawn
function paintLoading() {
  const el = $("gmLoad"); if (!el) return;
  const key = garageKey(), drawn = MG.drawn === key && !MG.err;
  el.hidden = drawn;
  if (drawn) return;
  const t = teamsOf(G.season).find((x) => x.key === G.teamKey), e = menuEntries().find((x) => String(x.num) === MG.focus) || menuEntries()[0];
  el.innerHTML = MG.err ? `<b>${esc(MG.err)}</b><small>메뉴와 경기 준비는 그대로 쓸 수 있어요</small>`
    : `<i class="ui-spin" aria-hidden="true"></i><b>3D 차고 준비 중</b><small>${esc(teamKo(t?.name))}${e ? ` · #${esc(e.num)} ${esc(e.tla)}` : ""}</small>`;
}
// leaving the menu (to the strategy screen / the race): the scene stops drawing; closing the game: it is disposed
// the settings → the scene's camera drift: reduce motion → off; the slow drift on → "auto" (the OS's reduce-motion
// setting still wins); off → off
const motionOf = () => (G.settings.reduceMotion ? "off" : G.settings.garageOrbit ? "auto" : "off");
// the menu garage's own quality (its budget is separate from the circuit view's): "auto" follows the 3D view's quality
// setting (선명 → high, 균형 → medium, 부드러움 → low)
export function qualityOf(set = G.settings.garageQuality) {
  if (set === "high" || set === "medium" || set === "low") return set;
  let q = "balanced"; try { q = JSON.parse(localStorage.getItem("f1kr:geo3d") || "{}").quality || "balanced"; } catch { /* default */ }
  return q === "sharp" ? "high" : q === "smooth" ? "low" : "medium";
}
export function hideGarage(dispose = false) {
  const m = MG.mod; if (!m) return;
  try { if (dispose) m.dispose?.(); else m.hide?.(); } catch { /* the scene's own problem: the menu goes on */ }
  MG.shown = null; MG.drawn = null; MG.safe = null;
}

// the menu's DOM: the overlay (tab row + tiles / a sheet) is rewritten on every paint; the 3D host – it carries the scene's
// canvas – is there only while the garage is open (G.sheet === "garage") and stays across repaints of that view
export function mount(body, html) {
  const want = G.sheet === "garage";
  let host = $("gGarage3d");
  if (!$("gmOver") || $("gmOver").parentNode !== body || !!host !== want) {
    if (host && !want) hideGarage();
    body.innerHTML = `${want ? `<div class="gm-3d" id="gGarage3d" data-fallback="1"></div><div class="gm-load ui-state" id="gmLoad" role="status" aria-live="polite"></div>` : ""}<div class="gm-over" id="gmOver"></div>`;
    host = $("gGarage3d");
  }
  const t = teamsOf(G.season).find((x) => x.key === G.teamKey);
  body.style.setProperty("--tc", t?.colour || "#888");
  body.dataset.view = want ? "garage" : "tiles";
  $("gmOver").innerHTML = html;
  if (!want) return;
  paintLoading();
  showGarage(host);
  requestAnimationFrame(reframe);
}

// ---------- season & team ----------
export function paintTeam() {
  if (!G.list) return `<div class="ui-state"><i class="ui-spin"></i><b>준비된 경기 목록을 읽는 중</b></div>`;
  const ss = seasons();
  if (!ss.length) return `<div class="g-empty"><div class="ui-state"><b>준비된 경기가 없어요</b><span>게임은 이 컴퓨터의 세션 기록에서 준비한 경기로 열려요. 아래에서 준비하거나 시나리오 파일을 가져오세요.</span>${G.listErr ? `<span class="g-err">오류: ${esc(G.listErr)}</span>` : ""}</div>${SaveUI.paintRaces({ standalone: true })}</div>`;
  if (!ss.includes(G.season)) G.season = ss[0];
  const teams = teamsOf(G.season), cont = SaveUI.continueInfo();
  // (after a restart the game opens here: the latest save is one click away – its own team and race come with it)
  const contBar = cont.ok ? `<div class="g-cont"><button class="ui-btn primary" data-act="menu:continue">이어하기</button><span>${esc(cont.text)}</span></div>` : "";
  return `<div class="g-team-pick">${contBar}<div class="g-team-h"><h2>팀 선택</h2><label class="g-field">시즌 <select class="ui-select" data-chg="menu:season">${ss.map((y) => `<option ${y === G.season ? "selected" : ""}>${y}</option>`).join("")}</select></label>
    <span class="muted">팀과 드라이버는 그 시즌 준비된 경기의 참가 명단에서 읽어요.</span></div>
    <div class="g-grid">${teams.map((t) => `<button class="g-team ${t.key === G.teamKey ? "on" : ""}" data-act="menu:team" data-team="${esc(t.key)}" style="--tc:${esc(t.colour || "#888")}"><b>${esc(teamKo(t.name))}</b>
      <small>준비된 경기 ${t.races}개</small></button>`).join("")}</div></div>`;
}

// ---------- the main menu ----------
// The tiles' shapes: plain blocks and lines (no photographs) – a track with a marker, two lines crossing, the number of
// prepared races, a chequer, three tyre rings, four squares with the team's colour.
const ART = {
  start: `<svg class="gt-art" aria-hidden="true" width="320" height="230" viewBox="0 0 320 230" style="right:-40px;bottom:-30px"><path d="M40 170 L34 90 Q32 40 80 36 L180 24 Q214 20 226 50 L238 84 Q246 104 274 100 L300 96 L300 190 L80 196 Q44 198 40 170 Z" fill="none" stroke="#FFFFFF" stroke-width="12" stroke-linejoin="round"/><circle cx="130" cy="30" r="12" fill="#FFE500" stroke="#0D0D0F" stroke-width="3"/></svg>`,
  cont: `<svg class="gt-art" aria-hidden="true" width="420" height="200" viewBox="0 0 420 200" style="right:-20px;bottom:10px" fill="none" stroke-width="14"><path d="M0 60 L170 60 Q210 60 240 100 Q270 140 310 140 L420 140" stroke="#F2EFE6"/><path d="M0 140 L170 140 Q210 140 240 100 Q270 60 310 60 L420 60" stroke="#FFE500"/></svg>`,
  saves: `<svg class="gt-art" aria-hidden="true" width="200" height="150" viewBox="0 0 200 150" style="right:0;bottom:0" fill="#0D0D0F"><rect x="0" y="0" width="50" height="50"/><rect x="100" y="0" width="50" height="50"/><rect x="50" y="50" width="50" height="50"/><rect x="150" y="50" width="50" height="50"/><rect x="0" y="100" width="50" height="50"/><rect x="100" y="100" width="50" height="50"/></svg>`,
  garage: `<svg class="gt-art" aria-hidden="true" width="230" height="120" viewBox="0 0 230 120" style="right:-30px;bottom:-30px" fill="#131316" stroke-width="14"><circle cx="60" cy="60" r="48" stroke="#FF5A4D"/><circle cx="115" cy="60" r="48" stroke="#FFD60A"/><circle cx="170" cy="60" r="48" stroke="#F2EFE6"/></svg>`,
  team: `<svg class="gt-art" aria-hidden="true" width="150" height="150" viewBox="0 0 150 150" style="right:-16px;bottom:-16px" fill="none" stroke="#0D0D0F" stroke-width="8"><rect x="8" y="8" width="58" height="58"/><rect x="84" y="8" width="58" height="58" fill="var(--tc)"/><rect x="8" y="84" width="58" height="58" fill="#3D4DFF"/><rect x="84" y="84" width="58" height="58"/></svg>`,
};
const GEAR = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.5"/><circle cx="8" cy="17" r="2.5"/></svg>`;
const raceShort = (ev) => window.KO?.gpShort?.(ev) || raceKo(ev);
export function paintMenu() {
  const t = teamsOf(G.season).find((x) => x.key === G.teamKey); if (!t) { G.step = "team"; return paintTeam(); }
  const r = menuRace(), ents = menuEntries(r);
  const focus = MG.focus && ents.some((e) => String(e.num) === MG.focus) ? MG.focus : String(ents[0]?.num ?? "");
  const cont = SaveUI.continueInfo(), nRaces = racesOf(G.season, G.teamKey).length, sheet = G.sheet;
  const tab = (k, label) => `<button role="tab" data-act="sheet:${k}" aria-selected="${k === "home" ? !sheet : sheet === k}">${label}</button>`;
  const tabs = `<div class="gm-tabs-row">
    <div class="gm-tabs" role="tablist" aria-label="게임 메뉴">${tab("home", "홈")}${tab("history", "경기 기록")}${tab("info", "드라이버·차량")}</div>
    <span class="grow"></span>
    ${G.engine ? "" : `<p class="gm-note">${esc(G.engineErr === "checking" ? "게임 엔진을 여는 중…" : "게임 엔진을 열지 못했어요")}</p>`}
    <button class="gm-gear" data-act="sheet:settings" aria-pressed="${sheet === "settings"}" aria-label="설정" title="설정">${GEAR}</button>
  </div>`;
  // the garage: the 3D scene fills the screen under the tab row; beside the car, the race's two drivers
  if (sheet === "garage") return `${tabs}<div class="gm-garage">
    <button class="gm-back" data-act="sheet:home" title="메뉴로 돌아가요">← 메뉴</button>
    <div class="gm-right" id="gmRight">
      <div class="gm-src"><small>참가 명단 · 이 경기 기준</small><b>${r ? esc(raceKo(r.event)) : "준비된 경기 없음"}</b><span>${r ? `${esc(r.date || "")} · ${esc(r.location || "")} · ${r.laps ?? "?"}랩` : "경기를 준비하면 그 경기의 두 드라이버가 보여요"}</span></div>
      ${ents.length ? `<div class="gm-drivers" role="group" aria-label="차고 앞 차량">${ents.map((e) => driverCard(e, String(e.num) === focus, t)).join("")}</div>` : ""}
    </div></div>`;
  if (sheet) return `${tabs}<div class="gm-panel">${paintSheet(sheet, t, r, ents)}</div>`;
  // a tile: its title, one line, the shape, and its button's word (no word on a tile that cannot be pressed now)
  const tile = (cls, span, act, title, desc, go, art, off = false) => `<button class="gm-tile ${cls}" style="grid-column: span ${span}" data-act="${act}" ${off ? "disabled" : ""}>
    <span class="gt-title">${title}</span><span class="gt-desc">${desc}</span>${art}<span class="gt-go">${go}</span></button>`;
  return `${tabs}<div class="gm-mosaic">
    ${tile("blue big", 8, "menu:start", "레이스 준비", r ? `${esc(raceShort(r.event))} · ${r.laps ?? "?"}랩` : "준비된 경기가 없어요", "시작", ART.start, !(G.engine && r))}
    ${tile("big", 10, "menu:continue", "이어하기", esc(cont.text), "시작", ART.cont, !(cont.ok && G.engine))}
    ${tile("yellow", 6, "sheet:races", "경기 선택", `${nRaces}개 준비됨`, "열기", `<span class="gt-art gt-big" aria-hidden="true">${nRaces}</span>`)}
    ${tile("red", 8, "sheet:saves", "저장 슬롯", "저장 · 불러오기", "열기", ART.saves)}
    ${tile("", 10, "sheet:garage", "차고", `${esc(teamKo(t.name))} 차량 보기`, "열기", ART.garage)}
    ${tile("light", 6, "menu:changeTeam", "팀 바꾸기", `${G.season} · ${esc(teamKo(t.name))}`, "열기", ART.team)}
  </div>`;
}
function driverCard(e, on, t) {
  return `<button class="gm-drv ${on ? "on" : ""}" data-act="menu:focus" data-num="${esc(e.num)}" aria-pressed="${on}" title="${on ? "차고 앞에 있는 차량" : "이 차량을 차고 앞으로"}">
    <b class="gm-num num">${esc(e.num)}</b><span class="gm-name">${esc(e.name || e.tla)}</span><small>${esc(e.tla)} · ${esc(teamKo(e.team || t?.name))}</small><em>${on ? "차고 앞" : "보기"}</em></button>`;
}

// ---------- the side sheets ----------
function paintSheet(which, t, r, ents) {
  const head = (title) => `<div class="gm-sheet-h"><h3>${title}</h3><button class="ui-btn ghost sm icon" data-act="sheet:${which}" title="닫기" aria-label="닫기">✕</button></div>`;
  if (which === "races") return `<div class="gm-sheet">${head("경기 선택")}${SaveUI.paintRaces()}</div>`;
  if (which === "saves") return `<div class="gm-sheet">${head("저장 슬롯 · 이어하기")}${SaveUI.paintSaves()}</div>`;
  if (which === "info") return `<div class="gm-sheet">${head("드라이버·차량 정보")}${infoHtml(t, r, ents)}</div>`;
  if (which === "history") return `<div class="gm-sheet">${head("경기 기록")}${historyHtml(r)}</div>`;
  if (which === "settings") return `<div class="gm-sheet">${head("설정")}${settingsHtml()}</div>`;
  return "";
}
function infoHtml(t, r, ents) {
  return `<p class="muted">${r ? `${esc(raceKo(r.event))} (${esc(r.date || "")}) 참가 명단 기준` : "준비된 경기 없음"} · 차량 성능 수치는 엔진의 팀별 보정값(추정)이라 여기서는 숫자로 보여주지 않아요.</p>
    ${ents.map((e) => `<div class="gm-info"><b class="gm-num">${esc(e.num)}</b><div><b>${esc(e.name || e.tla)}</b> <small class="muted">${esc(e.tla)}</small><br>
      <small>${esc(teamKo(e.team || t.name))} · 이 시즌 준비된 경기 ${racesOf(G.season, G.teamKey).filter((x) => x.entries.some((y) => String(y.num) === String(e.num))).length}개 출전</small></div></div>`).join("")}
    <p class="muted">차량: ${esc(teamKo(t.name))} ${G.season} – 3D 모델은 앱의 팀·시즌별 차량, 색은 이 경기 기록의 팀 색이에요.</p>`;
}
function historyHtml(r) {
  const res = G.result || G.lastResult;
  const last = res && !res.dev ? `<div class="g-card"><h3>이번 실행의 마지막 게임 결과 <span class="ui-badge info">게임 결과 · 실제 기록 아님</span></h3>
    <p>${esc(raceKo((G.list || []).find((x) => x.id === res.scenarioId)?.event || res.scenarioId))} · 시드 ${res.seed}</p>
    <p>${res.classification.filter((c) => G.sc?.entries?.some((e) => e.teamKey === G.teamKey && String(e.num) === String(c.num))).map((c) => `${esc(c.tla)} ${c.pos}위`).join(" · ")}</p>
    <button class="ui-btn sm" data-act="go:results">결과 화면 다시 보기</button></div>` : `<p class="muted">이번 실행에서 끝낸 게임이 없어요.</p>`;
  const H = SaveUI.historyFor(r?.id);
  return `${last}<div class="g-card"><h3>저장된 게임 결과 ${r ? `<small>${esc(raceKo(r.event))}</small>` : ""}</h3>${H}</div>
    <p class="muted">게임 결과는 앱 데이터의 게임 폴더(game/results)에 저장돼요 – 실제 경기 기록과 섞이지 않아요.</p>`;
}
function settingsHtml() {
  const S = G.settings, chk = (k, label, help) => `<label class="gm-set"><input type="checkbox" data-chg="menu:set" data-k="${k}" ${S[k] ? "checked" : ""}><span><b>${label}</b><small>${help}</small></span></label>`;
  const sel = (k, label, help, opts) => `<label class="gm-set"><span><b>${label}</b><small>${help}</small></span><select class="ui-select" data-chg="menu:setSel" data-k="${k}">${opts.map(([v, t]) => `<option value="${v}" ${String(S[k]) === String(v) ? "selected" : ""}>${t}</option>`).join("")}</select></label>`;
  const q = qualityOf();
  return `<h4 class="g-sub">저장</h4>
    ${chk("autosave", "자동 저장", `${S.autosaveLaps}랩마다 '자동' 슬롯에 저장 (경기 계산에는 영향 없음)`)}
    ${sel("autosaveLaps", "자동 저장 간격", "선두 기준 랩 수", [1, 3, 5, 10].map((n) => [n, n + "랩"]))}
    <h4 class="g-sub">중요한 순간 알림</h4>
    ${alertsSettings ? alertsSettings() : ""}
    <h4 class="g-sub">경기 화면</h4>
    ${chk("autoPitCam", "피트 자동 연출", "내 차가 피트에 들어오면 피트 카메라가 장면을 골라요 (다른 시점을 직접 고르면 그게 우선)")}
    <h4 class="g-sub">차고 메뉴</h4>
    ${sel("garageQuality", "차고 화질", `지금: ${{ high: "높음 – 바닥 반사 켜짐", medium: "보통", low: "낮음 – 반사·고해상도 끔" }[q]} · 레이스 화면과 따로 계산`, [["auto", "자동 (3D 화질 설정 따름)"], ["high", "높음 (바닥 반사)"], ["medium", "보통"], ["low", "낮음"]])}
    ${chk("garageOrbit", "차고 카메라 천천히 회전", "메뉴 화면의 감상용 움직임")}
    ${chk("reduceMotion", "움직임 줄이기", "차고 회전과 화면 전환 효과를 끔")}
    <p class="muted">설정은 이 컴퓨터의 이 앱에만 저장돼요.</p>`;
}
// the alert settings (alertsui.js) – set by that module when it loads
let alertsSettings = null;
export const setAlertsSettings = (f) => { alertsSettings = f; };

// ---------- actions ----------
export function onClick(act, b) {
  if (act === "team") { G.teamKey = b.dataset.team; G.sid = null; G.sc = null; G.plans = {}; G.plansFor = null; MG.focus = null; go("menu"); return; }
  if (act === "changeTeam") { G.sheet = null; go("team"); return; }
  if (act === "focus") { MG.focus = String(b.dataset.num); MG.mod?.setFocus?.(MG.focus); paint(); return; }
  if (act === "start") { toPrerace(); return; }
  if (act === "continue") { SaveUI.continueLatest(); return; }
}
export function onChange(act, t) {
  if (act === "season") { G.season = +t.value; G.teamKey = null; paint(); return; }
  if (act === "set") {
    G.settings[t.dataset.k] = t.checked; saveSettings();
    if (t.dataset.k === "autoSlow" && G.run) G.run.autoSlow = G.settings.autoSlow ? autoSlowRule() : null;
    if ((t.dataset.k === "reduceMotion" || t.dataset.k === "garageOrbit") && MG.mod) MG.mod.setMotion?.(motionOf());
    applyRacePrefs();
    paint(); return;
  }
  if (act === "setSel") {
    const k = t.dataset.k; G.settings[k] = k === "autosaveLaps" ? +t.value || 5 : t.value; saveSettings();
    if (k === "garageQuality") MG.mod?.setQuality?.(qualityOf());
    paint(); return;
  }
}
// (used by the dev hooks / harness)
export const garageState = () => ({ module: !!MG.mod, err: MG.err, shown: MG.shown, drawn: MG.drawn, focus: MG.focus, safe: MG.safe, quality: qualityOf() });
window.GameMenuDev = { garageState, fmtT };
