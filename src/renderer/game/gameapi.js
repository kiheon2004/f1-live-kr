// The game screens' one door to the main process (preload.js api.game – main/gamestore.js): a thin wrapper so the screens
// don't care which names the bridge has. v0.49 (the lead's backend): list / scenario / prepare (+ progress events) /
// cancelPrepare / importScenario / saves.{list, save, load, remove}; v0.48: scenarios / scenario / save / load / saveResult.
// A function the bridge lacks answers { ok: false, missing: true } – the screen says "준비 중인 기능", never pretends.
//
// Saves go out one at a time (a second save while one is being written waits; a third replaces the waiting second – the
// newest state is what matters), so two writes never race on the same file from this page.
const g = () => window.api?.game || {};
const missing = (what) => ({ ok: false, missing: true, why: `${what}: 앱에 아직 연결되지 않은 기능` });
const has = (path) => { let o = g(); for (const k of path.split(".")) { o = o?.[k]; if (o == null) return false; } return typeof o === "function"; };

export const caps = () => ({
  list: has("list") || has("scenarios"), prepare: has("prepare"), cancelPrepare: has("cancelPrepare"), importScenario: has("importScenario"),
  saves: has("saves.list") && has("saves.save") && has("saves.load"), savesRemove: has("saves.remove"), legacySave: has("save") && has("load"),
  preparable: has("preparable"), saveResult: has("saveResult"), results: has("results"),
});

// prepared races: [{ id, metaId, season, event, date, location, laps, lapLength, entries, rain, version, error? }]
export async function listScenarios() { const G = g(); return G.list ? G.list() : G.scenarios ? G.scenarios() : []; }
export async function loadScenario(id) { return g().scenario(id); }

// the sessions in the local cache that could be prepared (read-only listing: the app's own archive index and the cache's
// files – nothing is fetched or written): [{ path, season, name, cached }] – the bridge's own list when it has one
export async function preparable(seasons) {
  if (has("preparable")) return g().preparable();
  const A = window.api, out = [];
  if (!A?.listSessionsMeta || !A?.cachedSessions) return out;
  for (const y of seasons) {
    const m = await A.listSessionsMeta(y, true).catch(() => null);
    const races = (m?.sessions || []).filter((s) => /_Race\/?$/.test(s.path || ""));
    if (!races.length) continue;
    const c = await A.cachedSessions(races.map((s) => s.path)).catch(() => ({}));
    for (const s of races) if (c[s.path]?.core) out.push({ path: s.path, season: y, name: s.meeting || s.name || s.path, date: s.date || null, cached: true });
  }
  return out;
}
// the scenario id a session path gives ("2025/2025-08-03_Hungarian_Grand_Prix/2025-08-03_Race/" → "2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race")
export const scenarioIdOf = (path) => String(path || "").split("/").filter(Boolean).slice(1).join("_");

// prepare a race from the cache. onProgress({ stage, done, total, text }) while it runs; resolves { ok, id?, why? }.
// A later call or cancelPrepare() makes an earlier answer stale: its result is dropped (gen).
let prepGen = 0;
export async function prepare(sessionPath, onProgress) {
  const G = g(); if (!G.prepare) return missing("경기 준비");
  const gen = ++prepGen;
  const off = typeof G.onPrepareProgress === "function" ? G.onPrepareProgress((p) => { if (gen === prepGen) onProgress?.(p); }) : null;
  try {
    const r = await G.prepare(sessionPath);
    if (gen !== prepGen) return { ok: false, stale: true, why: "취소됨" };
    return r && typeof r === "object" ? r : { ok: !!r };
  } catch (e) { return gen === prepGen ? { ok: false, why: String(e?.message || e) } : { ok: false, stale: true, why: "취소됨" }; }
  finally { if (typeof off === "function") off(); }
}
export async function cancelPrepare() { prepGen++; const G = g(); return G.cancelPrepare ? G.cancelPrepare() : missing("준비 취소"); }
export async function importScenario() { const G = g(); return G.importScenario ? G.importScenario() : missing("시나리오 가져오기"); }

// ---------- saves ----------
// slot list: [{ slot, savedAt, label, scenarioId, team, lap, totalLaps, engine, bytes, error? }]
export async function listSaves() {
  const G = g();
  if (G.saves?.list) return G.saves.list();
  return null;   // (v0.48 bridge: no list – the screen shows the one known slot it can try to load)
}
let saving = false;
const queue = [];   // [{ slot, job, promise, resolve }] – waiting saves, one per slot
function pump() {
  if (saving || !queue.length) return;
  const w = queue.shift(); saving = true;
  w.job().then((r) => { saving = false; w.resolve(r); pump(); });
}
export function save(slot, data) {
  const G = g(), fn = G.saves?.save || G.save; if (!fn) return Promise.resolve(missing("저장"));
  const job = () => Promise.resolve().then(() => fn.call(G.saves?.save ? G.saves : G, slot, data)).then((r) => (r && typeof r === "object" ? r : { ok: true }), (e) => ({ ok: false, why: String(e?.message || e) }));
  // a save of a slot that is already waiting replaces that one (both callers get the newer one's answer)
  const w = queue.find((x) => x.slot === slot);
  if (w) { w.job = job; return w.promise; }
  let resolve; const promise = new Promise((r) => { resolve = r; });
  queue.push({ slot, job, promise, resolve }); pump();
  return promise;
}
export const savesPending = () => saving || queue.length > 0;
export async function load(slot) { const G = g(), fn = G.saves?.load || G.load; if (!fn) return missing("불러오기"); return fn.call(G.saves?.load ? G.saves : G, slot); }
export async function removeSave(slot) { const G = g(); return G.saves?.remove ? G.saves.remove(slot) : missing("저장 삭제"); }
export async function saveResult(sid, result) { const G = g(); return G.saveResult ? G.saveResult(sid, result) : missing("결과 저장"); }
export async function listResults(sid) { const G = g(); return G.results ? G.results(sid) : []; }

// a save file's header against this engine and the prepared races – pure (tested)
export function checkSave(d, E, list) {
  if (!d || d.kind !== "f1kr-game-save") return { ok: false, why: "게임 저장 파일이 아니에요" };
  if (d.stateVersion !== E.STATE_VERSION) return { ok: false, why: `저장 형식(v${d.stateVersion})이 이 엔진의 형식(v${E.STATE_VERSION})과 달라 불러올 수 없어요` };
  if (typeof d.race !== "string" && typeof d.race !== "object") return { ok: false, why: "저장에 경기 상태가 없어요" };
  if (!list.some((s) => s.id === d.scenarioId)) return { ok: false, why: `이 저장의 경기(${d.scenarioId})가 준비된 경기 목록에 없어요 – 경기 선택에서 먼저 준비하세요` };
  const warn = [];
  if (d.engine !== E.ENGINE_VERSION) warn.push(`다른 엔진 버전(${d.engine})에서 저장 – 이어서 진행은 되지만 결과가 그 버전과 다를 수 있어요`);
  return { ok: true, warn };
}
