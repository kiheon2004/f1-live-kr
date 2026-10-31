// Prepared races, save slots, continue and the leave prompt (request §16). The game's files are its own (userData/game:
// scenarios, saves, results – gamestore.js); the session cache is only ever READ to prepare a race, by the main process.
//   races sheet  the season's prepared races for the team (pick one), refresh, import a scenario file, and the sessions on
//                this computer that could be prepared – prepare with progress, cancel, the reason when it fails
//   saves sheet  the slots (what race, which lap, when, which engine), load, delete; load failures said plainly; the
//                engine's state version and the scenario are checked before a save is used
//   leave prompt a race in progress that has changed since its last save asks: save and leave / leave / stay
// The player never has to copy files into an app folder or know a path.
import { beginSave, endSave } from "./saverev.js";
import { G, go, paint, refreshList, racesOf, okList, myCars, seasons, startRace, stopRace, closeGame, leaveRace, ensureScenario } from "./gamehome.js";
import { $, esc, raceKo, teamKo } from "./ui.js";
import * as API from "./gameapi.js";

const SLOTS = [["slot1", "슬롯 1"], ["slot2", "슬롯 2"], ["slot3", "슬롯 3"], ["auto", "자동 저장"]];
const SLOT_KO = Object.fromEntries(SLOTS);
const S = { saves: null, savesErr: null, savesAt: 0, prep: null, prepList: null, prepListErr: null, prepBusy: false, importNote: null, results: {}, loadErr: null, loadWarn: null };
const when = (iso) => { const d = new Date(iso || 0); return Number.isFinite(d.getTime()) && d.getTime() > 0 ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "?"; };

export function onSheet(which) {
  if (which === "saves") refreshSaves();
  if (which === "races" && !S.prepList && !S.prepBusy) refreshPreparable();
}

// ---------- prepared races ----------
export function paintRaces({ standalone = false } = {}) {
  const rs = standalone ? [] : racesOf(G.season, G.teamKey), caps = API.caps();
  const list = rs.length ? `<div class="g-list">${rs.map((r) => `<button class="g-race ${r.id === G.sid ? "on" : ""}" data-act="save:pick" data-sid="${esc(r.id)}"><b>${esc(raceKo(r.event))}</b><span>${esc(r.date || "")} · ${esc(r.location || "")}</span>
      <small>${r.laps ?? "?"}랩 · 랩 ${r.lapLength ? (r.lapLength / 1000).toFixed(3) + " km" : "?"}</small></button>`).join("")}</div>`
    : standalone ? "" : `<p class="muted">이 팀이 참가한 ${G.season} 시즌 준비된 경기가 없어요.</p>`;
  const bad = (G.list || []).filter((s) => s.error);
  return `${list}
    ${bad.length ? `<p class="g-warn">읽지 못한 시나리오 ${bad.length}개: ${bad.map((b) => `${esc(b.id)} (${esc(b.error)})`).join(", ")}</p>` : ""}
    <div class="g-row"><button class="ui-btn sm" data-act="save:refresh">목록 새로고침</button>
      <button class="ui-btn sm" data-act="save:import" ${caps.importScenario ? "" : "disabled"}>시나리오 파일 가져오기</button>
      ${caps.importScenario ? "" : `<small class="muted">가져오기: 앱 쪽 기능 연결 전</small>`}</div>
    ${S.importNote ? `<p class="${S.importNote.ok ? "muted" : "g-warn"}">${esc(S.importNote.text)}</p>` : ""}
    <h4 class="g-sub">이 컴퓨터의 세션 기록에서 준비</h4>${paintPrepare()}`;
}
function paintPrepare() {
  const caps = API.caps(), P = S.prep;
  const prog = P ? `<div class="g-prep ${P.state}"><b>${esc(P.name)}</b>
      ${P.state === "running" ? `<div class="g-bar-p"><i style="width:${Math.round((P.frac ?? 0) * 100)}%"></i></div><small>${esc(P.text || "준비 중…")}</small> <button class="ui-btn sm" data-act="save:cancelPrep">취소</button>` : ""}
      ${P.state === "failed" ? `<small class="bad">준비 실패: ${esc(P.why || "?")}</small>` : ""}${P.state === "cancelled" ? `<small class="muted">취소했어요</small>` : ""}${P.state === "done" ? `<small>준비됨 – 목록에 추가했어요</small>` : ""}</div>` : "";
  if (S.prepListErr) return `${prog}<p class="g-warn">세션 목록을 읽지 못했어요: ${esc(S.prepListErr)}</p>`;
  if (!S.prepList) return `${prog}<p class="muted">${S.prepBusy ? "이 컴퓨터의 세션 기록을 확인하는 중…" : ""}</p><button class="ui-btn sm" data-act="save:prepList">세션 기록 확인</button>`;
  const have = new Set(okList().flatMap((s) => [s.id, s.metaId]));
  const todo = S.prepList.filter((s) => !s.prepared && !have.has(s.id || API.scenarioIdOf(s.path)));
  return `${prog}${todo.length ? `<div class="g-list g-prep-list">${todo.slice(0, 40).map((s) => `<div class="g-prep-item"><span><b>${esc(raceKo(s.name))}</b> <small class="muted">${esc(s.season)} · ${esc(s.date || "")}</small></span>
      <button class="ui-btn sm" data-act="save:prepare" data-path="${esc(s.path)}" data-name="${esc(s.name)}" ${caps.prepare && !(P?.state === "running") ? "" : "disabled"}>준비</button></div>`).join("")}</div>`
    : `<p class="muted">이 컴퓨터에 있는 결승 세션은 모두 준비돼 있어요 (${S.prepList.length}개 확인).</p>`}
    ${caps.prepare ? "" : `<p class="muted">경기 준비(캐시에서 시나리오 만들기)는 앱 쪽 기능이 연결되면 여기서 바로 돼요. 세션 기록은 읽기만 하고 바꾸지 않아요.</p>`}`;
}
async function refreshPreparable() {
  S.prepBusy = true; S.prepListErr = null; paint();
  try { S.prepList = await API.preparable(); } catch (e) { S.prepListErr = String(e.message || e); }
  S.prepBusy = false; paint();
}
async function prepareOne(path, name) {
  const me = S.prep = { state: "running", path, name, frac: 0, text: "시작하는 중…" }; paint();
  // (the worker reports stages, not a fraction: the bar moves by stage – start, read, build)
  const r = await API.prepare(path, (p) => { if (S.prep !== me) return; me.frac = { start: 0.1, read: 0.4, build: 0.75 }[p.stage] ?? me.frac; me.text = p.text || p.stage || me.text; paint(); });
  if (S.prep !== me) return;   // (a newer prepare or a cancel: this answer is stale)
  if (r.stale) return;
  if (r.ok) { me.state = "done"; S.prepList = null; await refreshList(); refreshPreparable(); }
  else { me.state = r.cancelled ? "cancelled" : "failed"; me.why = r.why || r.error || "?"; }
  paint();
}

// ---------- saves ----------
async function refreshSaves() {
  try {
    const l = await API.listSaves();
    if (l) S.saves = l;
    else {
      // (no slot list in this bridge: each known slot is read once to say what is in it)
      const out = [];
      for (const [slot] of SLOTS) { try { const d = await API.load(slot); if (d && !d.missing) out.push(summary(slot, d)); } catch { /* empty slot */ } }
      S.saves = out;
    }
    S.savesErr = null;
  } catch (e) { S.savesErr = String(e.message || e); S.saves = S.saves || []; }
  S.savesAt = Date.now(); paint();
}
// what a slot shows (a full save → its header; a bridge listing → as given)
const summary = (slot, d) => ({ slot, ...(d.meta || {}), savedAt: d.meta?.savedAt || d.savedAt });
export function continueInfo() {
  if (!S.saves && !S.savesAt) { refreshSaves(); return { ok: false, text: "저장 확인 중…" }; }
  const s = latest(); if (!s) return { ok: false, text: S.savesErr ? "저장 목록 오류" : "저장된 경기 없음" };
  return { ok: true, text: `${raceKo(s.event || s.scenarioId)} ${s.lap ?? "?"}/${s.totalLaps ?? "?"}랩 · ${when(s.savedAt)} (${SLOT_KO[s.slot] || s.slot})` };
}
const latest = () => (S.saves || []).filter((s) => !s.error).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))[0] || null;
export function paintSaves() {
  if (!S.saves) return `<p class="muted">저장 슬롯을 읽는 중…</p>`;
  const by = new Map(S.saves.map((s) => [s.slot, s]));
  const rows = SLOTS.map(([slot, name]) => {
    const s = by.get(slot);
    if (!s) return `<div class="g-slot empty"><b>${name}</b><span class="muted">비어 있음</span></div>`;
    if (s.error) return `<div class="g-slot bad"><b>${name}</b><span>읽기 실패: ${esc(s.error)}</span>${API.caps().savesRemove ? `<button class="ui-btn sm" data-act="save:remove" data-slot="${slot}">삭제</button>` : ""}</div>`;
    const ver = G.engine && s.stateVersion != null && s.stateVersion !== G.engine.STATE_VERSION ? `<small class="bad">저장 형식 v${esc(s.stateVersion)} – 이 엔진(v${G.engine.STATE_VERSION})과 달라 불러올 수 없음</small>` : G.engine && s.engine && s.engine !== G.engine.ENGINE_VERSION ? `<small class="g-warn">다른 엔진 버전(${esc(s.engine)})에서 저장</small>` : "";
    return `<div class="g-slot"><b>${name}</b><span>${esc(raceKo(s.event || s.scenarioId))} · ${esc(teamKo(s.team))} · ${s.lap ?? "?"}/${s.totalLaps ?? "?"}랩<br><small class="muted">${when(s.savedAt)}${s.label ? " · " + esc(s.label) : ""}</small> ${ver}</span>
      <span class="g-slot-b"><button class="ui-btn sm" data-act="save:load" data-slot="${slot}" ${G.engine ? "" : "disabled"}>불러오기</button>${API.caps().savesRemove ? `<button class="ui-btn sm" data-act="save:remove" data-slot="${slot}">삭제</button>` : ""}</span></div>`;
  }).join("");
  return `${S.loadErr ? `<p class="g-err">불러오기 실패: ${esc(S.loadErr)}</p>` : ""}${S.loadWarn ? `<p class="g-warn">${esc(S.loadWarn)}</p>` : ""}${S.savesErr ? `<p class="g-warn">저장 목록 오류: ${esc(S.savesErr)}</p>` : ""}
    <div class="g-slots">${rows}</div>
    <div class="g-row"><button class="ui-btn sm" data-act="save:refreshSaves">새로고침</button></div>
    <p class="muted">경기 중 상단의 '저장'으로 슬롯 1–3에 저장해요. 자동 저장은 설정에서 켜고 끌 수 있어요. 저장은 게임 폴더(game/saves)에만 해요.</p>`;
}

// the race as a save: its engine state (engine.saveRace – read only, the race goes on unchanged) plus what the screen needs
// to put it back the way it was (selected car, camera, speed)
export function buildSave(slot) {
  const R = G.run, E = G.engine, sc = G.sc; if (!R || !E?.saveRace || G.dev) return null;
  const st = R.race.state;
  // (meta: what the slot list shows without reading the whole save – the store keeps it in a small file beside it)
  const meta = { scenarioId: G.sid, scenarioMetaId: sc.meta.id, season: G.season, event: sc.meta.event, team: G.teamKey, lap: st.leaderLap, totalLaps: st.totalLaps, t: st.t,
    engine: E.ENGINE_VERSION, params: E.PARAMS_VERSION ?? null, stateVersion: E.STATE_VERSION, label: slot === "auto" ? "자동 저장" : "" };
  return { kind: "f1kr-game-save", format: 1, slot, meta, label: meta.label, savedAt: new Date().toISOString(),
    engine: E.ENGINE_VERSION, params: E.PARAMS_VERSION ?? null, stateVersion: E.STATE_VERSION, scenarioId: G.sid, scenarioMetaId: sc.meta.id, scenarioBuiltAt: sc.meta.builtAt || null, scenarioVersion: sc.version ?? null, scenarioPrint: scenarioPrint(sc),
    season: G.season, event: sc.meta.event, team: G.teamKey, seed: G.seed, lap: st.leaderLap, totalLaps: st.totalLaps, t: st.t, runOpts: G.runOpts || null,
    ui: { sel: G.sel, focus: G.adapter?.ctx.focus || null, speed: R.speed || 1, paused: !!R.paused, cam: (() => { try { return JSON.parse(window.Map3D?.game.state?.() || "{}").cam || null; } catch { return null; } })() },
    orders: G.book.list.slice(-100), race: E.saveRace(R.race) };
}
// v0.50 §3-3: the save is taken with the race it belongs to (G.raceGen – a new race / a load starts a new generation) and
// the change counter at that moment (G.rev – every step run and every order sent adds one). A success marks saved ONLY
// that revision, and only if the same race is still on: an order sent while the file was being written stays unsaved, and
// a late answer for an earlier race neither marks the new one saved nor overwrites its notice. Same time t ≠ same state.
// Saves run one after another per file in the store (gamestore.js); a manual and an automatic save may overlap – each
// marks its own revision, the highest wins.
export async function saveNow(slot, { quiet = false } = {}) {
  const data = buildSave(slot); if (!data) { if (!quiet) { G.saveNote = { ok: false, text: "저장할 경기가 없어요" }; paint(); } return { ok: false }; }
  const tok = beginSave(G);
  if (!quiet) { G.saveNote = { ok: true, text: "저장 중…" }; paint(); }
  let r; try { r = await API.save(slot, data); } catch (e) { r = { ok: false, why: String(e?.message || e) }; }
  const m = endSave(G, tok, r?.ok !== false);
  if (m.stale) return { ...(r || {}), stale: true };   // (an earlier race's answer: nothing of this race changes)
  if (m.marked) { G.saveNote = { ok: true, text: `${SLOT_KO[slot] || slot}에 저장 · ${data.lap}/${data.totalLaps}랩${m.behind && G.run?.paused ? " · 저장 뒤 바뀐 내용은 아직 저장 안 됨" : ""}` }; S.saves = null; S.savesAt = 0; }
  else G.saveNote = { ok: false, text: `저장 실패: ${saveWhyKo(r?.why)} – 다시 저장해 주세요` };
  if (!quiet || r?.ok === false) paint();
  return r;
}
// a store failure in plain words (the IPC wrapper's English and the OS code are not for the player; the code is kept)
export function saveWhyKo(why) {
  const s = String(why || "").replace(/^Error invoking remote method '[^']+': /, "").replace(/^Error: /, "");
  const code = /\b(E[A-Z]{3,})\b/.exec(s)?.[1];
  const ko = { EACCES: "저장 폴더에 쓸 권한이 없어요", EPERM: "저장 폴더에 쓸 권한이 없어요", ENOSPC: "디스크 공간이 부족해요", EROFS: "저장 위치가 읽기 전용이에요", ENOENT: "저장 폴더를 찾을 수 없어요" }[code];
  return ko ? `${ko} (${code})` : s.slice(0, 120) || "알 수 없는 오류";
}
// the scenario's fingerprint (FNV-1a over its content without the build time): a re-prepared race with the same content
// keeps it; a different content (new data, a changed builder) changes it – checked on load, never trusted from builtAt alone
export function scenarioPrint(sc) {
  if (!sc) return null; if (sc._fp) return sc._fp;
  const str = JSON.stringify(sc, (k, v) => (k === "builtAt" || k === "_sid" || k === "_fp" ? undefined : v));
  let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (sc._fp = h.toString(16).padStart(8, "0") + ":" + str.length);
}
// a save → checks → the race running again (paused) with the screen as it was
export async function loadSlot(slot) {
  S.loadErr = null; S.loadWarn = null; paint();
  const E = G.engine; if (!E?.loadRace) { S.loadErr = "엔진에 불러오기 기능이 없어요"; paint(); return false; }
  let d;
  try { d = await API.load(slot); } catch (e) { S.loadErr = `파일을 읽지 못했어요 (${e.message || e})`; paint(); return false; }
  if (!d || d.missing) { S.loadErr = d?.why || "빈 슬롯이에요"; paint(); return false; }
  const chk = API.checkSave(d, E, okList()); if (!chk.ok) { S.loadErr = chk.why; paint(); return false; }
  G.season = d.season ?? G.season; G.teamKey = d.team; G.sid = d.scenarioId; G.seed = d.seed ?? 1; G.sc = null;
  const sc = await ensureScenario(); if (!sc) { S.loadErr = `이 저장의 경기를 읽지 못했어요: ${G.scErr || "?"}`; paint(); return false; }
  if (sc.meta.id !== d.scenarioMetaId) { S.loadErr = `저장은 ${d.scenarioMetaId} 경기인데 준비된 시나리오는 ${sc.meta.id}이에요`; paint(); return false; }
  const warn = [...chk.warn], fp = scenarioPrint(sc);
  if (d.scenarioPrint ? d.scenarioPrint !== fp : d.scenarioBuiltAt && sc.meta.builtAt && d.scenarioBuiltAt !== sc.meta.builtAt) warn.push("이 경기 자료가 저장한 뒤 다시 준비되어 내용이 달라졌어요 – 이어서 진행은 되지만 저장 당시와 다른 경기가 될 수 있어요");
  else if (!d.scenarioPrint && d.scenarioBuiltAt && sc.meta.builtAt && d.scenarioBuiltAt === sc.meta.builtAt) { /* (older save: same build) */ }
  let race;
  try { race = E.loadRace(d.race, sc); } catch (e) { S.loadErr = `저장된 경기 상태를 복원하지 못했어요 (${e.message || e})`; paint(); return false; }
  S.loadWarn = warn.join(" · ") || null;
  if (G.run) stopRace();
  G.loadedFrom = slot; G.sheet = null;
  await startRace({ race, runOpts: d.runOpts || null, ui: { ...(d.ui || {}), orders: d.orders || [] } });
  G.saveNote = { ok: true, text: `${SLOT_KO[slot] || slot}에서 불러옴 · ${d.lap}/${d.totalLaps}랩 · 일시정지${S.loadWarn ? " · " + S.loadWarn : ""}` };
  return true;
}
export async function continueLatest() {
  if (!S.saves) await refreshSaves();
  const s = latest(); if (!s) return;
  const ok = await loadSlot(s.slot);
  if (!ok) { G.sheet = "saves"; paint(); }
}
export function historyFor(sid) {
  if (!sid) return `<p class="muted">경기를 고르면 그 경기의 결과 목록이 보여요.</p>`;
  const h = S.results[sid];
  if (!h) { S.results[sid] = { busy: true }; API.listResults(sid).then((l) => { S.results[sid] = { list: l || [] }; paint(); }, (e) => { S.results[sid] = { err: String(e.message || e) }; paint(); }); return `<p class="muted">읽는 중…</p>`; }
  if (h.busy) return `<p class="muted">읽는 중…</p>`;
  if (h.err) return `<p class="g-warn">결과 목록 오류: ${esc(h.err)}</p>`;
  return h.list.length ? `<ul class="g-hist">${h.list.slice(0, 12).map((f) => `<li>${esc(String(f).replace(/\.json$/, "").replace(/T(\d\d)-(\d\d)-(\d\d).*/, " $1:$2"))}</li>`).join("")}</ul><p class="muted">${h.list.length}개 저장됨 (최근 순)</p>` : `<p class="muted">이 경기의 저장된 결과가 없어요.</p>`;
}

// ---------- the modal (leave prompt / save slots in the race) ----------
export function leavePrompt(to) { G.modal = { kind: "leave", to }; paintModal(); }
export function savePrompt() { G.modal = { kind: "save" }; if (!S.saves) refreshSaves(); paintModal(); }
// The dialog keeps the focus inside while open (Tab cycles its buttons), Escape is "계속하기 / 닫기", and the focus goes
// back to what had it before (the 저장 button, usually) when it closes.
let modalReturn = null;
function modalKeys(e) {
  const el = $("gModal"); if (!el) return;
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); G.modal = null; paintModal(); return; }
  if (e.key !== "Tab") return;
  const f = [...el.querySelectorAll("button:not(:disabled), select, input")]; if (!f.length) return;
  const i = f.indexOf(document.activeElement);
  if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
}
export function paintModal() {
  let el = $("gModal");
  if (!G.modal) { if (el) { el.remove(); const r = modalReturn; modalReturn = null; if (r?.isConnected) r.focus(); } return; }
  const fresh = !el;
  if (!el) { modalReturn = document.activeElement; el = document.createElement("div"); el.id = "gModal"; el.className = "g-modal"; el.addEventListener("keydown", modalKeys); $("game").appendChild(el); }
  queueMicrotask(() => { if (fresh || !el.contains(document.activeElement)) el.querySelector(".g-modal-box button")?.focus(); });
  const m = G.modal;
  let html = "";
  if (m.kind === "leave") {
    html = `<div class="g-modal-box" role="dialog" aria-modal="true" aria-labelledby="gModalT"><h3 id="gModalT">진행 중인 경기를 저장할까요?</h3>
      <p>마지막 저장 뒤에 진행한 내용이 있어요. ${m.to === "live" ? "라이브 타이밍으로 나가면" : "메뉴로 나가면"} 이 경기는 닫혀요.</p>
      <div class="g-row"><button class="ui-btn primary" data-act="save:leaveSave">저장하고 나가기 <small>(${SLOT_KO.auto})</small></button><button class="ui-btn" data-act="save:leaveNoSave">저장하지 않고 나가기</button><button class="ui-btn ghost" data-act="save:stay">계속하기</button></div></div>`;
  } else if (m.kind === "save") {
    const by = new Map((S.saves || []).map((s) => [s.slot, s]));
    html = `<div class="g-modal-box" role="dialog" aria-modal="true" aria-labelledby="gModalT"><h3 id="gModalT">경기 저장</h3>
      <div class="g-slots">${SLOTS.filter(([k]) => k !== "auto").map(([slot, name]) => { const s = by.get(slot); return `<button class="g-slot-pick" data-act="save:saveTo" data-slot="${slot}"><b>${name}</b><small>${s ? `덮어쓰기 – ${esc(raceKo(s.event || s.scenarioId))} ${s.lap ?? "?"}랩 · ${when(s.savedAt)}` : S.saves ? "비어 있음" : "확인 중…"}</small></button>`; }).join("")}</div>
      <div class="g-row"><button class="ui-btn ghost" data-act="save:stay">닫기</button></div></div>`;
  }
  // (rewritten only when it changed: a repaint must not take the focus off the button the player tabbed to)
  if (el._h !== html) { const had = el.contains(document.activeElement) ? document.activeElement.dataset?.slot || document.activeElement.dataset?.act : null; el._h = html; el.innerHTML = html; if (had) (el.querySelector(`[data-slot="${had}"]`) || el.querySelector(`[data-act="${had}"]`))?.focus(); }
}

// ---------- actions ----------
export async function onClick(act, b) {
  if (act === "pick") { G.sid = b.dataset.sid; G.sc = null; G.sheet = null; paint(); return; }
  if (act === "refresh") { await refreshList(); S.prepList = null; refreshPreparable(); return; }
  if (act === "import") { S.importNote = { ok: true, text: "가져오는 중…" }; paint(); const r = await API.importScenario(); S.importNote = r?.ok ? { ok: true, text: `가져왔어요${r.id ? ": " + r.id : ""}` } : r?.cancelled || r?.canceled ? null : { ok: false, text: `가져오지 못했어요: ${r?.why || "?"}` }; if (r?.ok) await refreshList(); paint(); return; }
  if (act === "prepList") { refreshPreparable(); return; }
  if (act === "prepare") { prepareOne(b.dataset.path, b.dataset.name); return; }
  if (act === "cancelPrep") { const P = S.prep; API.cancelPrepare(); if (P) { P.state = "cancelled"; S.prep = { ...P }; } paint(); return; }
  if (act === "refreshSaves") { S.saves = null; refreshSaves(); return; }
  if (act === "load") { loadSlot(b.dataset.slot); return; }
  if (act === "remove") { const r = await API.removeSave(b.dataset.slot); if (r?.ok === false) S.loadErr = r.why; S.saves = null; refreshSaves(); return; }
  if (act === "saveTo") { G.modal = null; paintModal(); await saveNow(b.dataset.slot); return; }
  if (act === "stay") { G.modal = null; paintModal(); return; }
  if (act === "leaveSave" || act === "leaveNoSave") {
    const to = G.modal?.to; G.modal = null; paintModal();
    if (act === "leaveSave") { const r = await saveNow("auto"); if (r?.ok === false) return; }
    if (to === "live") closeGame({ force: true }); else leaveRace({ force: true });
  }
}
