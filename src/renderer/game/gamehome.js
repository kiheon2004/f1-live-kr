// The strategy game's flow and state (request §10, §12, §13, §16): globe home → 전략 게임 → season & team → main menu
// (over the 3D garage) → pre-race strategy → race → results → menu; 라이브 타이밍으로 leaves cleanly (the 3D view detached,
// the live / replay app as it was). This file keeps the state and moves between the screens; each screen is its own
// module:
//   menu.js     season & team, the main menu over the 3D menu garage, the driver cards, driver/car info, settings
//   saveui.js   prepared races (refresh, import, prepare from the cache), save slots, continue, the leave prompt
//   prerace.js  the pre-race strategy editor (plans, timeline, checks, the estimator's numbers)
//   racehud.js  the race HUD (top bar, standings tower, the two driver cards, the pit-work slot, events)
//   results.js  the game result
// Korean, plain. Every number shown comes from a prepared scenario or from the engine; a field the engine can't give is
// left out or greyed, never filled with a made-up value. Game results / saves are the game's own (userData/game).
//
// Separation: this touches the live app only through its public hooks – F1KRApp.homeOn / setHome (the home screen stays
// "on" underneath while the game is up, so the timing screen stays paused and hidden), Map3D.show / hide and
// Map3D.game.attach / detach, and the #map3d element, which is lent to the race screen and put back where it was.
import { createGameAdapter } from "./adapter3d.js";
import { GameRunner, orderId } from "./runner.js";
import { TYPES as CMD_TYPES } from "../../game/engine/commands.js";
import { $, esc, loadCompounds, hudSnap } from "./ui.js";
import { checkAlerts, clockAction, newAlertState, defaultAlertSettings } from "./alerts.js";
import { OrderBook } from "./orders.js";
import { unsaved } from "./saverev.js";
import { spaceAllowed } from "./keys.js";
import * as API from "./gameapi.js";
import * as Menu from "./menu.js";
import * as SaveUI from "./saveui.js";
import * as Pre from "./prerace.js";
import * as Hud from "./racehud.js";
import * as Res from "./results.js";
import * as AlertsUI from "./alertsui.js";

const SETTINGS_KEY = "f1kr:game:settings";
const DEFAULT_SETTINGS = { autoSlow: false, autosave: true, autosaveLaps: 5, reduceMotion: false, garageOrbit: true, autoPitCam: true, pitSlow: false, garageQuality: "auto", alerts: defaultAlertSettings() };
function loadSettings() { try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}) }; } catch { return { ...DEFAULT_SETTINGS }; } }

export const G = {
  on: false, step: "team", sheet: null, list: null, listErr: null, season: null, teamKey: null, sid: null, sc: null, scErr: null, seed: 1,
  plans: {}, plansFor: null, engine: null, engineErr: null, strat: null,
  run: null, adapter: null, raf: 0, dev: false, events: [], book: new OrderBook(), result: null, mapHome: null, lastPaint: 0,
  sel: null, settings: loadSettings(), dirtyT: null, savedT: null, lastAutoLap: 0, modal: null, saveNote: null, loadedFrom: null,
  // v0.50 §3-3: the race on screen (a new generation per race started / loaded) and its change counter (steps run, orders
  // sent); savedRev: the revision the last successful save of THIS race holds
  raceGen: 0, rev: 0, savedRev: -1, alerts: null, notices: [], pendingEv: [],
};
export const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(G.settings)); } catch { /* per-viewer convenience only */ } };

// ---------- the engine (src/game/engine/engine.js) ----------
async function loadEngine() {
  if (G.engine || G.engineErr === "checking") return;
  G.engineErr = "checking";
  loadCompounds().then(() => paint());
  try {
    const m = await import("../../game/engine/engine.js");
    if (["createRace", "step", "snapshot", "command", "events", "results"].every((k) => typeof m[k] === "function")) {
      G.engine = m; G.engineErr = null;
      try { G.strat = await import("../../game/engine/strategy.js"); } catch { G.strat = null; }
    } else G.engineErr = "engine.js에 createRace / step / snapshot / command / events / results가 아직 없어요";
  } catch { G.engineErr = "엔진 연결 전"; }
  paint();
}

// ---------- open / close ----------
async function open() {
  if (G.on) return;
  if (!window.F1KRApp?.homeOn) window.F1KRApp?.setHome(true);
  G.on = true; document.body.classList.add("game-on"); $("game").hidden = false;
  dispatchEvent(new CustomEvent("f1kr-game", { detail: { on: true } }));
  loadEngine();
  if (!G.list) await refreshList();
  if (G.teamKey && G.step === "team") G.step = "menu";
  paint();
}
// leaving the game: a race in progress asks first (save / leave / stay)
function close({ force = false } = {}) {
  if (!G.on) return;
  if (!force && needsLeavePrompt()) { SaveUI.leavePrompt("live"); return; }
  stopRace(); Menu.hideGarage(true);
  G.on = false; document.body.classList.remove("game-on"); $("game").hidden = true;
  dispatchEvent(new CustomEvent("f1kr-game", { detail: { on: false } }));
}
// (the app leaving its home screen while the game is up – the top bar's buttons: the game closes first, cleanly; an
// unsaved race is auto-saved to the "auto" slot when autosave is on – there is no way to ask before the app moves on)
addEventListener("f1kr-home", (e) => { if (!e.detail.on && G.on) { if (needsLeavePrompt() && G.settings.autosave) SaveUI.saveNow("auto", { quiet: true }); close({ force: true }); } });

export async function refreshList() {
  try { G.list = await API.listScenarios(); G.listErr = null; } catch (e) { G.listErr = String(e.message || e); G.list = G.list || []; }
  paint();
}

// ---------- data from the scenarios ----------
export const okList = () => (G.list || []).filter((s) => !s.error);
export const seasons = () => [...new Set(okList().map((s) => s.season))].filter(Boolean).sort((a, b) => b - a);
// the season's teams as its prepared races list them (teamKey → name, colour, the drivers seen) – no team list in code
export function teamsOf(season) {
  const m = new Map();
  for (const s of okList().filter((x) => x.season === season)) for (const e of s.entries) {
    if (!e.teamKey) continue;
    const t = m.get(e.teamKey) || { key: e.teamKey, name: e.team, colour: e.colour, drivers: new Map(), races: 0 };
    t.drivers.set(e.num, e); m.set(e.teamKey, t);
  }
  for (const t of m.values()) t.races = okList().filter((x) => x.season === season && x.entries.some((e) => e.teamKey === t.key)).length;
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export const racesOf = (season, teamKey) => okList().filter((s) => s.season === season && s.entries.some((e) => e.teamKey === teamKey)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
// the race whose entry list the menu shows: the one chosen, else the team's latest prepared race of the season
export const menuRace = () => { const rs = racesOf(G.season, G.teamKey); return rs.find((r) => r.id === G.sid) || rs[rs.length - 1] || null; };
export const myCars = (sc = G.sc) => (sc?.entries || []).filter((e) => e.teamKey === G.teamKey);
export const isMine = (num) => myCars().some((e) => String(e.num) === String(num));

// ---------- painting ----------
export function go(step) {
  if (G.step === "menu" && step !== "menu") Menu.hideGarage();
  G.step = step; if (step !== "menu") G.sheet = null;
  paint();
}
export function paint() {
  if (!G.on) return;
  const crumbs = [["team", "시즌·팀"], ["menu", "차고"], ["prerace", "출발 전 전략"], ["race", "레이스"], ["results", "게임 결과"]];
  $("gameCrumbs").innerHTML = crumbs.map(([k, t]) => `<span class="${k === G.step ? "on" : ""}">${t}</span>`).join("<i>›</i>");
  // (nothing to say while the engine works; only a problem is shown – no "connected" jargon)
  $("gameEngine").textContent = G.engine ? "" : G.engineErr === "checking" ? "게임 엔진 여는 중…" : "게임 엔진을 열지 못했어요";
  $("gameEngine").title = G.engine ? "" : String(G.engineErr || "");
  $("gameEngine").classList.toggle("bad", !G.engine);
  const body = $("gameBody");
  body.dataset.step = G.step;
  if (G.step === "race") { Hud.paint(); SaveUI.paintModal(); return; }
  const html = ({ team: Menu.paintTeam, menu: Menu.paintMenu, prerace: Pre.paint, results: Res.paint }[G.step] || (() => ""))();
  // (the menu keeps its 3D host element across repaints: only the overlay parts are rewritten)
  if (G.step === "menu") Menu.mount(body, html); else body.innerHTML = html;
  if (G.step === "prerace") Pre.afterPaint();
  SaveUI.paintModal();
}

// ---------- scenario / race selection ----------
export async function pickRace(sid) {
  if (G.sid !== sid) { G.sid = sid; G.sc = null; G.scErr = null; }
  paint();
}
export async function ensureScenario() {
  if (G.sc && G.sc.meta?.id && (G.sc._sid === G.sid)) return G.sc;
  G.scErr = null;
  try { const sc = await API.loadScenario(G.sid); if (!sc) throw new Error("시나리오 파일을 찾을 수 없어요"); sc._sid = G.sid; G.sc = sc; }
  catch (e) { G.sc = null; G.scErr = String(e.message || e); }
  return G.sc;
}
export async function toPrerace() {
  const r = menuRace(); if (!r) { G.sheet = "races"; paint(); return; }
  G.sid = r.id; go("prerace");
  await ensureScenario();
  paint();
}

// ---------- the race ----------
// opts.race: a race already made (a loaded save); else a new one from the pre-race plans
export async function startRace({ dev = false, devOpts = {}, race = null, runOpts = null, initialOrders = [], ui = null } = {}) {
  const sc = G.sc; if (!sc) return;
  let engine;
  if (dev) {
    const D = await import("./devsnap.js");
    race = D.createDevRace(sc, devOpts); engine = { step: D.devStep, snapshot: D.devSnapshot, command: () => ({ ok: false, why: "개발용 스냅샷: 명령을 받지 않아요" }) };
  } else {
    const E = G.engine; if (!E) return;
    if (!race) {
      // every team on the team AI (ai.js); the player's cars start on the plans made here; the AI hands each kind of
      // decision to the player once the player orders it (the t = 0 orders below: the assist choice and the first modes)
      G.runOpts = runOpts; race = E.createRace({ scenario: sc, ...runOpts });
    } else G.runOpts = runOpts;
    engine = { step: E.step, snapshot: E.snapshot, command: E.command, events: E.events, results: E.results, commandStatus: E.commandStatus };
  }
  G.dev = dev; G.events = []; G.book = new OrderBook(); G.result = null; G.lastAutoLap = race.state?.leaderLap || 0;
  G.raceGen++; G.rev = 0; G.savedRev = ui ? 0 : -1; G.alerts = newAlertState(); G.notices = []; G.pendingEv = [];
  // (a loaded save: the orders it was given, as the screen last knew them – a queued one is re-read from the engine's state)
  if (Array.isArray(ui?.orders)) { G.book.list = ui.orders.map((o) => ({ ...o })); G.book.update(race, null); }
  G.run = new GameRunner(race, engine, { autoSlow: null });   // (alerts.js decides automatic slowing – loop below)
  G.run.listeners.add((ev) => { G.events.push(...ev); if (G.events.length > 400) G.events.splice(0, G.events.length - 400); G.pendingEv.push(...ev); if (G.pendingEv.length > 400) G.pendingEv.splice(0, G.pendingEv.length - 400); });
  G.adapter = createGameAdapter({ scenario: sc, source: G.run, label: dev ? "개발용" : "게임" });
  applyRacePrefs();
  const mine = myCars(sc);
  G.sel = ui?.sel && mine.some((e) => String(e.num) === String(ui.sel)) ? String(ui.sel) : String(mine[0]?.num ?? "");
  G.adapter.ctx.setFocus(ui?.focus || G.sel || null);
  for (const o of initialOrders) sendOrder(o.type, o.car, o.args, o.text || null);
  G.dirtyT = race.state.t; G.savedT = ui ? race.state.t : null;   // (kept for the dev hooks; saved state is G.rev / G.savedRev)
  go("race");
  Hud.build();
  lendMap();
  window.Map3D?.game.attach(G.adapter);
  applyRacePrefs();
  if (ui?.cam) window.Map3D?.game.setCam?.(ui.cam);
  // (a loaded race waits paused at the speed it was saved with: resume continues at that speed – v0.50 §3-4)
  if (ui) { if (ui.speed > 0) G.run.speed = ui.speed; G.run.pause(); } else G.run.setSpeed(1);
  loop();
}
// the settings the race's view takes: the pit camera's auto-direction and auto-slow, the team's cars it follows (the
// selected car first) – Map3D.game.pitcam (the pit helper's game/pitcam.js); absent: nothing to set
export function applyRacePrefs() {
  if (G.adapter) G.adapter.prefs = { autoPitCam: G.settings.autoPitCam, reduceMotion: G.settings.reduceMotion, pitSlow: G.settings.pitSlow };
  const pc = window.Map3D?.game?.pitcam; if (!pc || !G.adapter) return;
  try { pc.auto?.(!!G.settings.autoPitCam); pc.slow?.(!!G.settings.pitSlow); pc.cars?.([G.sel, ...myCars().map((e) => String(e.num))].filter((x, i, a) => x && a.indexOf(x) === i)); } catch { /* the view's own problem */ }
}
// the engine's events that may slow the clock (screen only; the engine is told nothing)
// (v0.49's single auto-slow rule – replaced by alerts.js in the loop; kept so older callers set nothing)
export const autoSlowRule = () => null;
function loop() {
  cancelAnimationFrame(G.raf);
  const tick = () => {
    if (!G.run) return;
    const n = G.run.frame();
    if (n) { G.dirtyT = G.run.race.state.t; G.rev++; }
    const now = performance.now();
    if (now - G.lastPaint > 200) { G.lastPaint = now; runAlerts(); if (G.book.update(G.run.race, G.run.engine)) Hud.markOrders(); Hud.paint(); }
    autosaveCheck();
    if (G.run.race.state.finished && !G.result && !G.dev) finishRace();   // (the chequered flag is the leader's: the rest still run)
    G.raf = requestAnimationFrame(tick);
  };
  G.raf = requestAnimationFrame(tick);
}
// autosave every N leader laps into the "auto" slot (the save is read from the race, never written to it – tested:
// a race saved along the way finishes exactly like one never saved)
function autosaveCheck() {
  if (!G.settings.autosave || G.dev || !G.run) return;
  const L = G.run.race.state.leaderLap || 0;
  if (L >= G.lastAutoLap + Math.max(1, G.settings.autosaveLaps | 0)) { G.lastAutoLap = L; SaveUI.saveNow("auto", { quiet: true }); }
}
export function stopRace() {
  cancelAnimationFrame(G.raf); G.raf = 0;
  if (G.adapter) { window.Map3D?.game.detach(); returnMap(); }
  Hud.teardown();
  G.run = null; G.adapter = null;
}
// a race running (not finished) with steps run since the last save
export const needsLeavePrompt = () => !!G.run && !G.dev && !G.result && unsaved(G) && (G.run.race.state.t > 0 || G.rev > 0);
// the chosen alerts (alerts.js) on the events that the render time has reached and the render-time picture; the clock is
// only ever slowed / paused by them (manual speed wins: an alert doesn't fire again within its cooldown)
function runAlerts() {
  const R = G.run; if (!R || G.dev) return;
  const T = R.renderT, due = G.pendingEv.filter((e) => (e.t ?? 0) <= T); if (due.length) G.pendingEv = G.pendingEv.filter((e) => (e.t ?? 0) > T);
  const on = G.settings.autoSlow, settings = on ? { ...defaultAlertSettings(), ...(G.settings.alerts || {}) } : Object.fromEntries(Object.keys(defaultAlertSettings()).map((k) => [k, (G.settings.alerts || {})[k] === "off" ? "off" : "note"]));
  let fc = null; try { fc = G.engine?.forecast ? G.engine.forecast(R.race) : null; } catch { fc = null; }
  const list = checkAlerts(G.alerts, { events: due, snap: hudSnap(R, G.adapter), forecast: fc, mine: myCars().map((e) => String(e.num)), settings, t: T });
  if (!list.length) return;
  for (const a of list) { G.notices.push(a); } if (G.notices.length > 20) G.notices.splice(0, G.notices.length - 20);
  const act = clockAction(list, R.speed), top = list[0];
  if (act.pause || act.slowTo != null) R.auto(act, { t: top.t, type: top.rule, why: top.text, action: act.pause ? "pause" : "slow" });
}
// leave the race for the menu (asked first when unsaved)
export function leaveRace({ force = false } = {}) {
  if (!force && needsLeavePrompt()) { SaveUI.leavePrompt("menu"); return; }
  stopRace(); go("menu");
}
export { close as closeGame };

// #map3d lent to the race screen and put back exactly where it was (its hidden state too)
function lendMap() {
  const m = $("map3d"); if (!m || G.mapHome) return;
  G.mapHome = { parent: m.parentNode, next: m.nextSibling, hidden: m.hidden };
  $("gameView").appendChild(m); m.hidden = false;
  window.Map3D?.show();
}
function returnMap() {
  const m = $("map3d"), h = G.mapHome; if (!m || !h) return;
  h.parent.insertBefore(m, h.next); m.hidden = h.hidden; G.mapHome = null;
  if (window.F1KRApp?.homeOn) window.Map3D?.hide();
}

// an order to the engine: { type, car, args } with this player's team and a fresh id; tracked by the order book
// (queued → applied / refused) – `by` is set here, never taken from the screen
export function sendOrder(type, car, args, text) {
  if (!G.run || !CMD_TYPES.includes(type)) return null;
  const cmd = { id: orderId(type), type, car: car == null ? null : String(car), team: G.teamKey, args: args || {}, by: "player" };
  const r = G.run.command(cmd) || { ok: false, why: "응답 없음" };
  const o = G.book.add({ id: cmd.id, type, car: cmd.car, args: cmd.args, text: text || "", t: G.run.race.state.t }, r);
  G.dirtyT = (G.dirtyT ?? 0) + 0.001; G.rev++;   // (an order is a change to save even while paused)
  Hud.markOrders(); Hud.paint();
  return o;
}
function finishRace() {
  const R = G.run, snap = R.latest();
  const res = R.engine.results ? R.engine.results(R.race) : null;
  const classification = res?.rows ? res.rows.map((r) => ({ pos: r.pos, num: r.num, tla: r.tla, team: r.team, laps: r.laps, gap: r.gap, lapsDown: r.lapsDown, status: r.status, stops: r.stops }))
    : [...snap.cars].sort((a, b) => a.pos - b.pos).map((c) => ({ pos: c.pos, num: c.num, tla: c.tla, team: c.team, laps: c.lap, status: c.status }));
  const accounts = res?.rows ? { cars: Object.fromEntries(res.rows.filter((r) => isMine(r.num) || (r.pos && r.pos <= 10)).map((r) => [r.tla || r.num, r.acct || {}])), by: res.by || null } : null;
  G.result = { dev: G.dev, scenarioId: G.sid, seed: G.seed, team: G.teamKey, t: snap.t, engine: G.dev ? null : G.engine?.ENGINE_VERSION || null, classification,
    accounts, events: (R.engine.events ? R.engine.events(R.race, -1) : G.events).slice(-300), orders: G.book.list, commandLog: R.race.state.commands?.log || null,
    runOpts: G.dev ? null : G.runOpts, stints: res?.rows ? Object.fromEntries(res.rows.map((r) => [r.tla || r.num, r.stints || null])) : null, points: res?.rows ? Object.fromEntries(res.rows.map((r) => [r.tla || r.num, r.points ?? null])) : null,
    weather: (() => { try { return Res.weatherSeries(R, G.wxLog?.run === R ? G.wxLog.s : null); } catch { return null; } })(),
    loadedFrom: G.loadedFrom, analysis: (() => { try { return !G.dev && G.engine?.analysis ? G.engine.analysis(R.race) : null; } catch { return null; } })() };
  G.lastResult = G.result;
  if (!G.dev) API.saveResult(G.sid, { kind: "game-result", label: "게임 결과 (실제 기록 아님)", ...G.result }).then((r) => { G.result.saved = r?.file || (r?.ok === false ? null : "ok"); if (r?.ok === false) G.result.saveErr = r.why; paint(); }, (e) => { G.result.saveErr = String(e.message || e); paint(); });
  stopRace();
  go("results");
}

// ---------- events: each screen's module gets its own actions (data-act="<module>:<what>") ----------
$("homeGameBtn")?.addEventListener("click", open);
$("gameExit").addEventListener("click", () => close());
const MODS = { menu: Menu, save: SaveUI, pre: Pre, hud: Hud, res: Res, alerts: AlertsUI };
$("game").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const [mod, act] = b.dataset.act.split(":");
  if (mod === "go") { if (act === "menu" && G.step === "race") leaveRace(); else go(act); return; }
  if (mod === "sheet") { G.sheet = G.sheet === act ? null : act; if (G.sheet === "saves" || G.sheet === "races") SaveUI.onSheet(G.sheet); paint(); return; }
  if (mod === "game" && act === "exit") { close(); return; }
  MODS[mod]?.onClick?.(act, b, e);
});
$("game").addEventListener("change", (e) => { const t = e.target.closest("[data-chg]"); if (!t) return; const [mod, act] = t.dataset.chg.split(":"); MODS[mod]?.onChange?.(act, t, e); });
$("game").addEventListener("input", (e) => { const t = e.target.closest("[data-inp]"); if (!t) return; const [mod, act] = t.dataset.inp.split(":"); MODS[mod]?.onInput?.(act, t, e); });
// Space: pause / resume in the race (v0.50 §3-4). Not while typing (input / textarea / select / contenteditable, IME
// composition), not while a dialog is open, not on key repeat (a held key toggles once), and not when a button or other
// control has the focus – there Space is that control's own key (its click), never a second, global toggle.
addEventListener("keydown", (e) => {
  if (!G.on || G.step !== "race" || !G.run) return;
  if (e.code === "Space" && e.repeat && !e.target?.closest?.("input, select, textarea, [contenteditable]")) { e.preventDefault(); return; }
  if (!spaceAllowed(e, !!G.modal || !!document.querySelector(".ui-scrim:not([hidden])"))) return;
  e.preventDefault(); G.run.slowNote = null; G.run.toggle(); Hud.paint();
});

// development hooks (console / screenshot harness): the dev race is reachable only from here – never from the screens
window.GameDev = {
  open, close: () => close({ force: true }), G,
  state: () => JSON.stringify({ on: G.on, step: G.step, sheet: G.sheet, season: G.season, team: G.teamKey, sid: G.sid, engine: !!G.engine, engineErr: G.engineErr, scenarios: (G.list || []).length, sel: G.sel,
    run: G.run ? { t: G.run.race.state.t, lap: G.run.race.state.leaderLap, renderT: G.run.renderT, speed: G.run.speed, paused: G.run.paused, achieved: +G.run.achieved.toFixed(2), behind: G.run.behind, costs: G.run.costs(), finished: G.run.race.state.finished } : null,
    orders: G.book.recent(8).map((o) => ({ type: o.type, car: o.car, state: o.state, why: o.why })), result: !!G.result, modal: G.modal?.kind || null }),
  pick: async (season, teamKey, sid) => { await open(); G.season = season; G.teamKey = teamKey; G.sid = sid; G.step = "menu"; await toPrerace(); return "ok"; },
  go, paint,
  devRace: async (opts = {}) => { if (!G.sc) return "pick a scenario first"; await startRace({ dev: true, devOpts: opts }); return "dev race (개발용 스냅샷)"; },
  speed: (x) => { G.run?.setSpeed(x); return String(x); },
  focus: (n) => { G.adapter?.ctx.setFocus(String(n)); return String(n); },
  select: (n) => { G.sel = String(n); Hud.paint(); return String(n); },
  order: (type, car, args) => JSON.stringify(sendOrder(type, car, args, "dev")),
  // (development only: the result screen without a full race – NEVER evidence of a finished race; see reports/ui.md)
  finish: () => { if (G.run) finishRace(); return "finished (forced)"; },
  get runner() { return G.run; },
  hud: () => JSON.stringify(Hud.hudCosts?.() || null),
  workerProbe: (n = 200) => import("./devprobe.js").then((m) => m.workerProbe(G, n)),
};
