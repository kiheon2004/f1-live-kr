// The app's "prepare a race from the cache" job (v0.49 §16): runs in an Electron utility process (main/gameprep.js forks
// it – a session's replay is ~0.8 GB in memory, never in the app's own processes). Reads the session cache ONLY through
// session.mjs's plain reader (no writes, no mtimes – F1KR_GAME_CACHE is the folder the app uses); builds the scenario
// with the same builder the tools use and hands it back – the game store writes it, in the game's own folder.
// Messages: in { sessionPath } · out { kind: "progress", stage } … then { kind: "done", scenario, validation } or
// { kind: "error", why }.
import { loadReplay, hasSession, normPath } from "./session.mjs";
import { buildScenario } from "./build-scenario.mjs";

const port = process.parentPort;
const post = (m) => port.postMessage(m);
port.on("message", (e) => {
  const sessionPath = normPath(e.data?.sessionPath || "");
  try {
    if (!hasSession(sessionPath)) { post({ kind: "error", why: "이 세션의 타이밍 자료가 캐시에 없어요 (다시보기로 한 번 열면 받아져요)" }); return; }
    post({ kind: "progress", stage: "read" });
    const r = loadReplay(sessionPath);
    if (r.missingTopics?.length) post({ kind: "progress", stage: "read", missing: r.missingTopics });
    post({ kind: "progress", stage: "build" });
    const { scenario, validation } = buildScenario(r, sessionPath);
    if (!validation.ok) { post({ kind: "error", why: "시나리오 검사 실패: " + validation.errors.slice(0, 3).join("; ") }); return; }
    post({ kind: "done", scenario, validation: { ok: true, warnings: validation.warnings.slice(0, 20) } });
  } catch (err) { post({ kind: "error", why: String(err?.message || err).slice(0, 300) }); }
});
