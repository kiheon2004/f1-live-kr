// The game screens' one door to the main process (preload.js api.game – main/gamestore.js, main/gameprep.js): a thin
// wrapper so the screens don't care about the bridge's exact names. v0.49 bridge (the lead's): scenarios / scenario /
// prepList / prepare (→ jobId; progress and the end through onPrep) / prepCancel(jobId) / importScenario (a file dialog)
// / saves / save(slot, { meta, … }) / load / removeSave / saveResult / results. A function the bridge lacks answers
// { ok: false, missing: true } – the screen says "연결 전", never pretends.
//
// Saves go out one at a time from this page (a newer save of a slot that is still waiting replaces the waiting one –
// the newest state is what matters); the store also serialises writes per slot.
const g = () => window.api?.game || {};
const missing = (what) => ({ ok: false, missing: true, why: `${what}: 앱에 아직 연결되지 않은 기능` });
const has = (name) => typeof g()[name] === "function";

export const caps = () => ({
  list: has("scenarios"), prepare: has("prepare") && has("onPrep"), cancelPrepare: has("prepCancel"), importScenario: has("importScenario"),
  saves: has("saves") && has("save") && has("load"), savesRemove: has("removeSave"), preparable: has("prepList"), saveResult: has("saveResult"), results: has("results"),
});

// prepared races: [{ id, metaId, season, event, date, location, laps, lapLength, entries, version, error? }]
export async function listScenarios() { const G = g(); return G.scenarios ? G.scenarios() : []; }
export async function loadScenario(id) { return g().scenario(id); }

// the race sessions in the local cache that could be prepared: [{ path, id, season, name, date, prepared }] (the main
// process lists the cache's own files – read only)
export async function preparable() {
  const G = g(); if (!G.prepList) return [];
  return (await G.prepList()).map((s) => ({ path: s.sessionPath, id: s.id, season: s.season, name: s.event, date: s.date, prepared: !!s.prepared }));
}
// the scenario id a session path gives ("2025/2025-08-03_Hungarian_Grand_Prix/2025-08-03_Race/" → "2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race")
export const scenarioIdOf = (path) => String(path || "").split("/").filter(Boolean).slice(1).join("_");

// prepare a race from the cache. onProgress({ stage, text }) while it runs; resolves { ok, sid?, why?, cancelled? } when
// the job ends. Messages of any other job (an older one, one cancelled) are dropped by their job id.
const STAGE_KO = { start: "준비 시작", read: "세션 기록 읽는 중", build: "경기 데이터 만드는 중" };
let job = null;
export function prepare(sessionPath, onProgress) {
  const G = g(); if (!G.prepare || !G.onPrep) return Promise.resolve(missing("경기 준비"));
  return new Promise((resolve) => {
    let me = null; const early = [];
    const finish = (r) => { off?.(); if (job === me) job = null; resolve(r); };
    const handle = (m) => {
      if (m.kind === "progress") onProgress?.({ stage: m.stage, text: STAGE_KO[m.stage] || m.stage });
      else if (m.kind === "done") finish({ ok: true, sid: m.sid });
      else if (m.kind === "cancelled") finish({ ok: false, cancelled: true, why: "취소됨" });
      else if (m.kind === "error") finish({ ok: false, why: m.why || "알 수 없는 오류" });
    };
    const off = G.onPrep((m) => { if (!m) return; if (!me) { early.push(m); return; } if (m.jobId === me.id) handle(m); });
    Promise.resolve().then(() => G.prepare(sessionPath)).then((r) => {
      if (!r?.ok) { finish({ ok: false, why: r?.why || "시작하지 못했어요" }); return; }
      me = job = { id: r.jobId, sid: r.sid };
      for (const m of early.splice(0)) if (m.jobId === me.id) handle(m);
    }, (e) => finish({ ok: false, why: String(e?.message || e) }));
  });
}
export async function cancelPrepare() { const G = g(); if (!G.prepCancel) return missing("준비 취소"); if (!job) return { ok: false, why: "준비 중인 경기가 없어요" }; return G.prepCancel(job.id); }
export async function importScenario() {
  const G = g(); if (!G.importScenario) return missing("시나리오 가져오기");
  try { const r = await G.importScenario(); return r && typeof r === "object" ? r : { ok: false, cancelled: true }; }
  catch (e) { return { ok: false, why: String(e?.message || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, "") }; }
}

// ---------- saves ----------
// slot list: [{ slot, savedAt, …the meta the save carried (scenarioId, team, lap, totalLaps, engine, stateVersion, label…) }]
export async function listSaves() { const G = g(); return G.saves ? G.saves() : null; }
let saving = false;
const queue = [];   // [{ slot, job, promise, resolve }] – waiting saves, one per slot
function pump() {
  if (saving || !queue.length) return;
  const w = queue.shift(); saving = true;
  w.job().then((r) => { saving = false; w.resolve(r); pump(); });
}
export function save(slot, data) {
  const G = g(), fn = G.save; if (!fn) return Promise.resolve(missing("저장"));
  const job = () => Promise.resolve().then(() => fn(slot, data)).then((r) => (r && typeof r === "object" ? r : { ok: true }), (e) => ({ ok: false, why: String(e?.message || e) }));
  // a save of a slot that is already waiting replaces that one (both callers get the newer one's answer)
  const w = queue.find((x) => x.slot === slot);
  if (w) { w.job = job; return w.promise; }
  let resolve; const promise = new Promise((r) => { resolve = r; });
  queue.push({ slot, job, promise, resolve }); pump();
  return promise;
}
export const savesPending = () => saving || queue.length > 0;
export async function load(slot) { const G = g(); if (!G.load) return missing("불러오기"); return G.load(slot); }
export async function removeSave(slot) { const G = g(); return G.removeSave ? G.removeSave(slot) : missing("저장 삭제"); }
export async function saveResult(sid, result) { const G = g(); return G.saveResult ? G.saveResult(sid, result) : missing("결과 저장"); }
export async function listResults(sid) { const G = g(); return G.results ? G.results(sid) : []; }

// a save file's header against this engine and the prepared races – pure (tested)
export function checkSave(d, E, list) {
  if (!d || d.kind !== "f1kr-game-save") return { ok: false, why: "게임 저장 파일이 아니에요" };
  if (d.stateVersion !== E.STATE_VERSION) return { ok: false, why: `저장 형식(v${d.stateVersion})이 이 엔진의 형식(v${E.STATE_VERSION})과 달라 불러올 수 없어요` };
  if (typeof d.race !== "string" && typeof d.race !== "object") return { ok: false, why: "저장에 경기 상태가 없어요" };
  if (!list.some((s) => s.id === d.scenarioId)) return { ok: false, why: `이 저장의 경기(${d.scenarioId})가 준비된 경기 목록에 없어요 – 경기 선택에서 먼저 준비하세요` };
  // (v0.52 §7: the format decides whether a save can be read; the model and its parameters only whether the race will
  // run on exactly as it would have – said plainly, never blocking, never guessing an identity the save doesn't carry)
  const warn = [];
  if (!d.engine) warn.push("저장에 계산 모델 정보가 없어요 (이전 버전 저장) – 이어서 진행은 되지만 저장 당시와 결과가 다를 수 있어요");
  else if (d.engine !== E.ENGINE_VERSION) warn.push(`계산 모델이 바뀌었어요 (저장 ${d.engine} → 지금 ${E.ENGINE_VERSION}) – 이어서 진행은 되지만 결과가 저장 당시 모델과 다를 수 있어요`);
  if (d.engine && E.PARAMS_VERSION && d.params !== E.PARAMS_VERSION) warn.push(d.params ? `밸런스 파라미터가 바뀌었어요 (저장 ${d.params} → 지금 ${E.PARAMS_VERSION})` : "저장에 밸런스 파라미터 정보가 없어요 (이전 버전 저장)");
  return { ok: true, warn };
}
