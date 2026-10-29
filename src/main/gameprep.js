// Preparing a game race from the app's session cache (v0.49 §16) – one job at a time, in a utility process
// (game/tools/prepare-worker.mjs: reads the cache, never writes it), the scenario written by the game store into
// userData/game/scenarios. A job has an id; progress / the end are sent to the page with it, so a page that started
// another job (or cancelled) ignores a late answer. Cancel kills the process.
const path = require("node:path");
const fs = require("node:fs");
const { utilityProcess } = require("electron");

// the cached race sessions (the cache's own file names, as the tools read them): ["2025/…/…_Race/", …]
function cachedRaces(cacheDir) {
  const set = new Set();
  let names = []; try { names = fs.readdirSync(cacheDir); } catch { return []; }
  for (const f of names) {
    const m = /^(\d{4})_(\d{4}-\d\d-\d\d_.+?)_(\d{4}-\d\d-\d\d_Race)_TimingData\.jsonStream$/.exec(f);
    if (m) set.add(`${m[1]}/${m[2]}/${m[3]}/`);
  }
  return [...set].sort();
}
// the scenario id the builder gives a session ("2025/2025-08-03_Hungarian_Grand_Prix/2025-08-03_Race/" →
// "2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race")
const idOf = (p) => p.split("/").filter(Boolean).slice(1).join("_");

class GamePrep {
  constructor({ cacheDir, store, send }) { this.cacheDir = cacheDir; this.store = store; this.send = send; this.job = null; this.n = 0; }
  async list() {
    const have = new Set((await this.store.listScenarios()).map((s) => s.id));
    return cachedRaces(this.cacheDir).map((p) => {
      const [, ev, se] = p.split("/");
      return { sessionPath: p, id: idOf(p), season: +p.slice(0, 4), event: ev.replace(/^\d{4}-\d\d-\d\d_/, "").replace(/_/g, " "), date: se.slice(0, 10), prepared: have.has(idOf(p)) };
    });
  }
  start(sessionPath) {
    if (typeof sessionPath !== "string" || !cachedRaces(this.cacheDir).includes(sessionPath)) return { ok: false, why: "캐시에 없는 경기예요" };
    if (this.job) return { ok: false, why: "다른 경기를 준비하는 중이에요", jobId: this.job.id };
    const id = ++this.n, sid = idOf(sessionPath);
    const child = utilityProcess.fork(path.join(__dirname, "../game/tools/prepare-worker.mjs"), [], {
      env: { ...process.env, F1KR_GAME_CACHE: this.cacheDir }, serviceName: "f1kr-game-prepare", stdio: "ignore" });
    const job = this.job = { id, sid, sessionPath, child, done: false };
    const end = (msg) => { if (job.done) return; job.done = true; if (this.job === job) this.job = null; try { child.kill(); } catch {} this.send({ jobId: id, sid, ...msg }); };
    child.on("message", async (m) => {
      if (job.done) return;
      if (m.kind === "progress") this.send({ jobId: id, sid, kind: "progress", stage: m.stage, missing: m.missing || null });
      else if (m.kind === "error") end({ kind: "error", why: m.why });
      else if (m.kind === "done") {
        try { await this.store.writeScenario(sid, m.scenario); end({ kind: "done", warnings: m.validation?.warnings || [] }); }
        catch (e) { end({ kind: "error", why: "저장 실패: " + String(e.message || e) }); }
      }
    });
    child.on("exit", (code) => end({ kind: "error", why: code ? `준비 작업이 끝났어요 (코드 ${code})` : "준비 작업이 결과 없이 끝났어요" }));
    child.postMessage({ sessionPath });
    this.send({ jobId: id, sid, kind: "progress", stage: "start" });
    return { ok: true, jobId: id, sid };
  }
  cancel(jobId) {
    const j = this.job; if (!j || (jobId != null && j.id !== jobId)) return { ok: false, why: "진행 중인 준비가 없어요" };
    j.done = true; this.job = null; try { j.child.kill(); } catch {}
    this.send({ jobId: j.id, sid: j.sid, kind: "cancelled" });
    return { ok: true };
  }
}

module.exports = { GamePrep, cachedRaces, idOf };
