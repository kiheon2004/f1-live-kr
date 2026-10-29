// The strategy game's own files (DESIGN §0.1, §15): userData/game/ – never the session cache (that stays read-only input).
//   scenarios/<id>.scenario.json   prepared races (built offline by src/game/tools/build-scenario.mjs from the cache)
//   results/<id>/<stamp>.json      finished games (the engine's classification and time-loss accounts – game results,
//                                  never a real record)
//   saves/<slot>.json              a race saved part-way (src/game/engine/save.js format; opaque here)
// The page reaches this only through preload.js `api.game` (main.js checks the sender); every id and slot is checked
// before it becomes a file name, and every file is read or written inside its own folder.
const fs = require("node:fs");
const path = require("node:path");

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const MAX_JSON = 32 * 1024 * 1024;   // (a full scenario is ~0.2–0.5 MB; a save with its command log a few MB)
const id = (v, what = "id") => { if (typeof v !== "string" || !ID.test(v)) throw new Error(`bad game ${what}`); return v; };
function inside(dir, file) {
  const base = path.resolve(dir), full = path.resolve(base, file);
  if (!full.startsWith(base + path.sep)) throw new Error("path outside the game folder");
  return full;
}
async function readJson(file) {
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st) return null;
  if (st.size > MAX_JSON) throw new Error("게임 파일이 너무 커요");
  return JSON.parse(await fs.promises.readFile(file, "utf8"));
}
// Writes to one file go one after the other (a chain per file: two saves of a slot in quick succession end with the later
// one, never interleaved), each through its own temporary name (v0.48 used "<file>.tmp" for every write – two writes at
// once shared it) renamed over the file: a crash mid-write never leaves half a save.
const chains = new Map();
let tmpN = 0;
function writeJson(file, obj) {
  const text = JSON.stringify(obj);
  if (text.length > MAX_JSON) return Promise.reject(new Error("게임 파일이 너무 커요"));
  const prev = chains.get(file) || Promise.resolve();
  const job = prev.catch(() => {}).then(async () => {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${++tmpN}.tmp`;
    try { await fs.promises.writeFile(tmp, text); await fs.promises.rename(tmp, file); }
    catch (e) { await fs.promises.rm(tmp, { force: true }).catch(() => {}); throw e; }
  });
  chains.set(file, job); job.finally(() => { if (chains.get(file) === job) chains.delete(file); }).catch(() => {});
  return job;
}

class GameStore {
  constructor(dir) { this.dir = dir; this.sc = path.join(dir, "scenarios"); this.res = path.join(dir, "results"); this.sav = path.join(dir, "saves"); }
  // what the menus need from each prepared race – its identity, its laps and its entry list (the teams and drivers of
  // that race, from that session: no team list is kept anywhere else) – read from the files themselves
  async listScenarios() {
    const names = await fs.promises.readdir(this.sc).catch(() => []), out = [];
    for (const f of names.filter((n) => n.endsWith(".scenario.json")).sort()) {
      try {
        const s = await readJson(inside(this.sc, f)); if (!s || s.format !== "f1kr-game-scenario") continue;
        const m = s.meta || {};
        out.push({ id: f.replace(/\.scenario\.json$/, ""), metaId: m.id || null, season: m.season ?? null, round: m.round ?? null, event: m.event || null, date: m.date || null, location: m.location || null, circuitKey: m.circuitKey ?? null,
          laps: s.race?.laps ?? null, lapLength: s.track?.L ?? null, version: s.version ?? null,
          entries: (s.entries || []).map((e) => ({ num: e.num, tla: e.tla, name: e.name, last: e.last, team: e.team, teamKey: e.teamKey, colour: e.colour })),
          rain: Array.isArray(s.weather?.cols?.rain) ? s.weather.cols.rain.some((r) => r === 1) : null });
      } catch (e) { out.push({ id: f.replace(/\.scenario\.json$/, ""), error: String(e.message || e) }); }
    }
    return out;
  }
  async loadScenario(sid) { return readJson(inside(this.sc, id(sid) + ".scenario.json")); }
  // a finished game: kept under its scenario with the moment it was saved (several games of one race side by side)
  async saveResult(sid, result) {
    if (!result || typeof result !== "object") throw new Error("bad result");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = inside(this.res, path.join(id(sid), stamp + ".json"));
    await writeJson(file, { kind: "f1kr-game-result", savedAt: new Date().toISOString(), scenarioId: sid, ...result });
    return { ok: true, file: path.relative(this.dir, file) };
  }
  async listResults(sid) {
    const dir = inside(this.res, id(sid));
    const names = await fs.promises.readdir(dir).catch(() => []);
    return names.filter((n) => n.endsWith(".json")).sort().reverse().slice(0, 50);
  }
  // a prepared race written by the prepare job (main/gameprep.js) or an imported file – checked to be a scenario first
  async writeScenario(sid, scenario) {
    if (!scenario || scenario.format !== "f1kr-game-scenario" || !scenario.meta?.id) throw new Error("게임 시나리오 파일이 아니에요");
    await writeJson(inside(this.sc, id(sid) + ".scenario.json"), scenario);
    return { ok: true, id: sid };
  }
  // a file the user picked: read it, check it, store it under its own id (the file itself stays where it was)
  async importScenario(file) {
    const s = await readJson(file).catch((e) => { throw new Error("읽을 수 없는 파일이에요: " + String(e.message || e)); });
    if (!s || s.format !== "f1kr-game-scenario" || !s.meta?.id) throw new Error("게임 시나리오 파일이 아니에요");
    const sid = String(s.meta.id).replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 120);
    return this.writeScenario(sid, s);
  }
  // a race saved part-way: the save (the engine's saveRace JSON + the screen's state) and a small meta file beside it for
  // the slot list (scenario, sim time, lap, engine version, saved at) – the list never parses the saves themselves
  async saveGame(slot, data) {
    if (!data || typeof data !== "object") throw new Error("bad save");
    const sl = id(slot, "slot"), meta = { slot: sl, savedAt: new Date().toISOString(), ...(data.meta && typeof data.meta === "object" ? data.meta : {}) };
    await writeJson(inside(this.sav, sl + ".json"), data);
    await writeJson(inside(this.sav, sl + ".meta.json"), meta);
    return { ok: true, meta };
  }
  async loadGame(slot) { return readJson(inside(this.sav, id(slot, "slot") + ".json")); }
  async listSaves() {
    const names = await fs.promises.readdir(this.sav).catch(() => []), out = [];
    for (const f of names.filter((n) => n.endsWith(".meta.json"))) { try { const m = await readJson(inside(this.sav, f)); if (m) out.push(m); } catch {} }
    return out.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  }
  async removeSave(slot) {
    const sl = id(slot, "slot");
    for (const f of [sl + ".json", sl + ".meta.json"]) await fs.promises.rm(inside(this.sav, f), { force: true });
    return { ok: true };
  }
}

module.exports = { GameStore, gameId: id };
