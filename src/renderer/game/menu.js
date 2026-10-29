// The game's main menu (request §10): the player's team in its garage – the 3D menu garage (menugarage.js, the kit's
// scene) fills the screen; the menu sits in a narrow column on the left and the two drivers' cards on the right, so the
// car in the middle is never behind a button. Landscape desktop layout; no currency, boxes or passes.
//
// Which drivers: the entry list of ONE prepared race (the chosen one, else the team's latest prepared race of the
// season) – said on screen ("참가 명단 기준"), since a team's drivers change during a season.
//
// The 3D garage: the kit's menugarage.js – show({ season, teamKey, team, colour, entries, focusNum, date, host, safeLeft })
// / setFocus(num) / setMotion("auto"|"on"|"off") / setSafeLeft(f) / hide() / dispose(). Until that module is in this
// build (or if it fails) the menu works over a flat team-colour backdrop – the hook below is the only place that knows
// about the scene. safeLeft: the share of the width the menu column covers (the scene frames the car in the rest);
// safeRight (the driver cards' column) is passed too, for when the scene takes it.
import { G, go, paint, seasons, teamsOf, racesOf, menuRace, toPrerace, saveSettings, autoSlowRule, applyRacePrefs } from "./gamehome.js";
import { $, esc, teamKo, raceKo, fmtT } from "./ui.js";
import * as API from "./gameapi.js";
import * as SaveUI from "./saveui.js";

// ---------- the 3D garage hook ----------
const MG = { mod: null, tried: false, err: null, shown: null, focus: null };
async function garageModule() {
  if (MG.tried) return MG.mod; MG.tried = true;
  try { const m = await import("./menugarage.js"); if (typeof m.show === "function") MG.mod = m; else MG.err = "menugarage.js에 show()가 없어요"; }
  catch (e) { MG.mod = null; MG.err = "3D 차고 모듈 연결 전"; }
  return MG.mod;
}
// what the scene is asked to show (a new team / race / focus → show again; the same → nothing)
async function showGarage(host) {
  const r = menuRace(), t = teamsOf(G.season).find((x) => x.key === G.teamKey); if (!t || !host) return;
  const entries = (r?.entries || [...t.drivers.values()]).filter((e) => e.teamKey === G.teamKey).slice(0, 2);
  const focusNum = MG.focus && entries.some((e) => String(e.num) === MG.focus) ? MG.focus : String(entries[0]?.num ?? "");
  MG.focus = focusNum;
  const key = `${G.season}|${G.teamKey}|${r?.id || ""}`;
  const m = await garageModule();
  if (!m) { host.dataset.fallback = "1"; return; }
  if (MG.shown === key) { m.setFocus?.(focusNum); return; }
  MG.shown = key; host.dataset.fallback = "";
  try {
    const W = host.offsetWidth || innerWidth, left = ($("gmLeft")?.offsetWidth || 300) + 36, right = ($("gmRight")?.offsetWidth || 320) + 36;
    m.setMotion?.(motionOf());
    const st = await m.show({ host, season: G.season, teamKey: G.teamKey, team: t.name, colour: t.colour, entries: entries.map((e) => ({ num: e.num, tla: e.tla, name: e.name })), focusNum, date: r?.date || null,
      safeLeft: Math.min(0.6, left / W), safeRight: Math.min(0.6, right / W) });
    if (st?.err) { MG.err = `3D 차고: ${st.err}`; }
  } catch (e) { MG.err = String(e.message || e); MG.shown = null; host.dataset.fallback = "1"; }
}
// leaving the menu (to the strategy screen / the race): the scene stops drawing; closing the game: it is disposed
// the settings → the scene's camera drift: reduce motion → off; the slow drift on → "auto" (the OS's reduce-motion
// setting still wins); off → off
const motionOf = () => (G.settings.reduceMotion ? "off" : G.settings.garageOrbit ? "auto" : "off");
export function hideGarage(dispose = false) {
  const m = MG.mod; if (!m) return;
  try { if (dispose) { m.dispose?.(); MG.shown = null; } else { m.hide?.(); MG.shown = null; } } catch { /* the scene's own problem: the menu goes on */ }
}

// the menu's DOM: the 3D host stays (it carries the scene's canvas); the overlay is rewritten
export function mount(body, html) {
  let host = $("gGarage3d");
  if (!host || host.parentNode !== body) { body.innerHTML = `<div class="gm-3d" id="gGarage3d" data-fallback="1"></div><div class="gm-over" id="gmOver"></div>`; host = $("gGarage3d"); }
  const t = teamsOf(G.season).find((x) => x.key === G.teamKey);
  body.style.setProperty("--tc", t?.colour || "#888");
  $("gmOver").innerHTML = html;
  showGarage(host);
}

// ---------- season & team ----------
export function paintTeam() {
  if (!G.list) return `<p class="muted">준비된 경기 목록을 읽는 중…</p>`;
  const ss = seasons();
  if (!ss.length) return `<div class="g-empty"><h3>준비된 경기가 없어요</h3><p class="muted">게임은 이 컴퓨터의 세션 기록에서 준비한 경기로 열려요. 아래에서 준비하거나 시나리오 파일을 가져오세요.${G.listErr ? " 오류: " + esc(G.listErr) : ""}</p>${SaveUI.paintRaces({ standalone: true })}</div>`;
  if (!ss.includes(G.season)) G.season = ss[0];
  const teams = teamsOf(G.season);
  return `<div class="g-team-pick"><div class="g-row"><h2>팀 선택</h2><label>시즌 <select data-chg="menu:season">${ss.map((y) => `<option ${y === G.season ? "selected" : ""}>${y}</option>`).join("")}</select></label>
    <span class="muted">팀과 드라이버는 그 시즌의 준비된 경기 참가 명단에서 읽어요.</span></div>
    <div class="g-grid">${teams.map((t) => `<button class="g-team ${t.key === G.teamKey ? "on" : ""}" data-act="menu:team" data-team="${esc(t.key)}" style="--tc:${esc(t.colour || "#888")}"><b>${esc(teamKo(t.name))}</b>
      <span>${[...t.drivers.values()].map((d) => `#${esc(d.num)} ${esc(d.tla)}`).join(" · ")}</span><small>준비된 경기 ${t.races}개</small></button>`).join("")}</div></div>`;
}

// ---------- the main menu ----------
export function paintMenu() {
  const t = teamsOf(G.season).find((x) => x.key === G.teamKey); if (!t) { G.step = "team"; return paintTeam(); }
  const r = menuRace(), ents = (r?.entries || [...t.drivers.values()]).filter((e) => e.teamKey === G.teamKey).slice(0, 2);
  const focus = MG.focus && ents.some((e) => String(e.num) === MG.focus) ? MG.focus : String(ents[0]?.num ?? "");
  const cont = SaveUI.continueInfo();
  const fallback = !MG.mod ? `<div class="gm-fallback" aria-hidden="true"><b>${esc(ents.find((e) => String(e.num) === focus)?.num ?? "")}</b><span>${esc(MG.err || "3D 차고 준비 중…")}</span></div>` : "";
  return `${fallback}
  <div class="gm-left" id="gmLeft">
    <div class="gm-team"><small>${G.season} 시즌 · 내 팀</small><h2>${esc(teamKo(t.name))}</h2><button class="gm-link" data-act="menu:changeTeam">팀 바꾸기</button></div>
    <nav class="gm-nav" aria-label="게임 메뉴">
      <button class="gm-primary" data-act="menu:start" ${G.engine ? "" : "disabled"}><span>경기 시작</span><small>${r ? `${esc(raceKo(r.event))} · ${r.laps ?? "?"}랩 → 출발 전 전략` : "경기를 먼저 고르세요"}</small></button>
      <button data-act="menu:continue" ${cont.ok ? "" : "disabled"}><span>이어하기</span><small>${esc(cont.text)}</small></button>
      <div class="gm-group">
        <button data-act="sheet:races" aria-pressed="${G.sheet === "races"}"><span>경기 선택</span><small>준비된 경기 ${racesOf(G.season, G.teamKey).length}개 · 준비·가져오기</small></button>
        <button data-act="sheet:info" aria-pressed="${G.sheet === "info"}"><span>드라이버·차량 정보</span></button>
        <button data-act="sheet:history" aria-pressed="${G.sheet === "history"}"><span>전략·경기 기록</span></button>
        <button data-act="sheet:saves" aria-pressed="${G.sheet === "saves"}"><span>저장 슬롯</span></button>
        <button data-act="sheet:settings" aria-pressed="${G.sheet === "settings"}"><span>설정</span></button>
      </div>
      <button class="gm-exit" data-act="game:exit"><span>← 라이브 타이밍으로</span></button>
    </nav>
    ${G.engine ? "" : `<p class="gm-note">${esc(G.engineErr === "checking" ? "엔진 확인 중…" : G.engineErr || "엔진 연결 전")}</p>`}
  </div>
  <div class="gm-right" id="gmRight">
    ${G.sheet ? paintSheet(G.sheet, t, r, ents) : `
    <div class="gm-src"><small>참가 명단 기준</small><b>${r ? `${esc(raceKo(r.event))} ${esc(r.date || "")}` : "준비된 경기 없음"}</b><span>${r ? `${esc(r.location || "")} · 이 경기의 출전 드라이버` : "경기를 준비하면 그 경기의 드라이버가 보여요"}</span></div>
    <div class="gm-drivers">${ents.map((e) => driverCard(e, String(e.num) === focus, r)).join("")}</div>
    ${ents.length > 1 ? `<p class="gm-hint">카드를 누르면 차고의 주 차량이 바뀌어요 (경기에서는 두 대 모두 운영)</p>` : ""}`}
  </div>`;
}
function driverCard(e, on, r) {
  return `<button class="gm-drv ${on ? "on" : ""}" data-act="menu:focus" data-num="${esc(e.num)}" aria-pressed="${on}">
    <b class="gm-num">${esc(e.num)}</b><span class="gm-name">${esc(e.name || e.tla)}</span><small>${esc(e.tla)} · ${on ? "차고의 주 차량" : "두 번째 차량 – 눌러서 보기"}</small></button>`;
}

// ---------- the side sheets ----------
function paintSheet(which, t, r, ents) {
  const head = (title) => `<div class="gm-sheet-h"><h3>${title}</h3><button class="gm-x" data-act="sheet:${which}" title="닫기">✕</button></div>`;
  if (which === "races") return `<div class="gm-sheet">${head("경기 선택")}${SaveUI.paintRaces()}</div>`;
  if (which === "saves") return `<div class="gm-sheet">${head("저장 슬롯 · 이어하기")}${SaveUI.paintSaves()}</div>`;
  if (which === "info") return `<div class="gm-sheet">${head("드라이버·차량 정보")}${infoHtml(t, r, ents)}</div>`;
  if (which === "history") return `<div class="gm-sheet">${head("전략·경기 기록")}${historyHtml(r)}</div>`;
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
  const last = res && !res.dev ? `<div class="g-card"><h3>이번 실행의 마지막 게임 결과 <small>엔진 계산 – 실제 기록 아님</small></h3>
    <p>${esc(raceKo((G.list || []).find((x) => x.id === res.scenarioId)?.event || res.scenarioId))} · 시드 ${res.seed}</p>
    <p>${res.classification.filter((c) => G.sc?.entries?.some((e) => e.teamKey === G.teamKey && String(e.num) === String(c.num))).map((c) => `${esc(c.tla)} ${c.pos}위`).join(" · ")}</p>
    <button class="ghost small" data-act="go:results">결과 화면 다시 보기</button></div>` : `<p class="muted">이번 실행에서 끝낸 게임이 없어요.</p>`;
  const H = SaveUI.historyFor(r?.id);
  return `${last}<div class="g-card"><h3>저장된 게임 결과 ${r ? `<small>${esc(raceKo(r.event))}</small>` : ""}</h3>${H}</div>
    <p class="muted">게임 결과는 앱 데이터의 게임 폴더(game/results)에 저장돼요 – 실제 경기 기록과 섞이지 않아요.</p>`;
}
function settingsHtml() {
  const S = G.settings, chk = (k, label, help) => `<label class="gm-set"><input type="checkbox" data-chg="menu:set" data-k="${k}" ${S[k] ? "checked" : ""}><span><b>${label}</b><small>${help}</small></span></label>`;
  return `${chk("autosave", "자동 저장", `${S.autosaveLaps}랩마다 '자동' 슬롯에 저장 (경기 계산에는 영향 없음)`)}
    <label class="gm-set"><span><b>자동 저장 간격</b><small>선두 기준 랩 수</small></span><select data-chg="menu:setLaps">${[1, 3, 5, 10].map((n) => `<option value="${n}" ${S.autosaveLaps === n ? "selected" : ""}>${n}랩</option>`).join("")}</select></label>
    ${chk("autoSlow", "중요 상황 자동 감속", "세이프티카·비·내 차 사고·피트 진입 때 1배속으로 (화면만 – 경기 결과는 같음)")}
    ${chk("autoPitCam", "피트 자동 연출", "내 차가 피트에 들어오면 피트 카메라가 장면을 골라요 (다른 시점을 직접 고르면 그게 우선)")}
    ${chk("pitSlow", "피트 장면 자동 감속", "내 차의 정비 장면에서 잠시 1배속으로 – 끝나면 원래 배속 (경기 결과는 같음)")}
    ${chk("garageOrbit", "차고 카메라 천천히 회전", "메뉴 화면의 감상용 움직임")}
    ${chk("reduceMotion", "움직임 줄이기", "차고 회전과 화면 전환 효과를 끔")}
    <p class="muted">설정은 이 컴퓨터의 이 앱에만 저장돼요.</p>`;
}

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
  if (act === "setLaps") { G.settings.autosaveLaps = +t.value || 5; saveSettings(); paint(); return; }
}
// (used by the dev hooks / harness)
export const garageState = () => ({ module: !!MG.mod, err: MG.err, shown: MG.shown, focus: MG.focus });
window.GameMenuDev = { garageState, fmtT };
