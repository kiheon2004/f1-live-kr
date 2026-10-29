#!/usr/bin/env node
// Every cached race → scenario + calibration extract + track checks (node tools only; the cache is read, never written).
//
//   node src/game/tools/build-all.mjs [outDir] [--only <substring>]
//
// One child process per race (a race's replay is ~0.8 GB in memory; one at a time keeps the machine usable). Writes
// <outDir>/<id>.scenario.json, <id>.calib.json, <id>.check.json and <outDir>/summary.json (built / failed with reasons).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { cachedRaces, loadReplay, normPath } from "./session.mjs";

const here = new URL(import.meta.url).pathname;
const args = process.argv.slice(2);

if (args[0] === "--one") {
  const [, p, outDir] = args;
  const { buildScenario } = await import("./build-scenario.mjs");
  const { extractCalib } = await import("./extract-calib.mjs");
  const { validateTrack } = await import("./validate-track.mjs");
  const t0 = Date.now();
  const r = loadReplay(p), built = buildScenario(r, normPath(p));
  const { calib, validation: cv } = extractCalib(r, built);
  const sc = built.scenario, check = validateTrack(sc, calib);
  const base = path.join(outDir, sc.meta.id);
  fs.writeFileSync(`${base}.scenario.json`, JSON.stringify(sc));
  fs.writeFileSync(`${base}.calib.json`, JSON.stringify(calib));
  fs.writeFileSync(`${base}.check.json`, JSON.stringify(check, null, 1));
  const neutral = calib.periods.reduce((a, q) => { a[q.kind] = (a[q.kind] || 0) + 1; return a; }, {});
  const rain = sc.weather.cols.rain.some((v) => v === 1);
  process.stdout.write(JSON.stringify({ path: p, id: sc.meta.id, ok: built.validation.ok && cv.ok, errors: [...built.validation.errors, ...cv.errors].slice(0, 8), warnings: built.validation.warnings,
    ms: Date.now() - t0, bytes: fs.statSync(`${base}.scenario.json`).size, L: check.L, lenDiffPct: check.lenDiffPct, laps: sc.race.laps, cars: sc.entries.length, neutral, rain, drs: check.drs, straight: check.straight, pit: !!sc.track.pit, check }));
  process.exit(0);
}

const outDir = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--only") || path.join(process.env.HOME, "projects/f1kr-work/v048/scenarios");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
fs.mkdirSync(outDir, { recursive: true });
const list = cachedRaces().filter((p) => !only || p.includes(only));
const rows = [];
for (const p of list) {
  try {
    const out = execFileSync(process.execPath, ["--max-old-space-size=3000", here, "--one", p, outDir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
    const row = JSON.parse(out.trim().split("\n").pop());
    rows.push(row);
    console.log(`${row.ok ? "ok  " : "BAD "} ${p} L=${row.L} (${row.lenDiffPct}%) ${row.ms} ms${row.errors.length ? " " + row.errors.join("; ") : ""}`);
  } catch (e) {
    const why = String(e.stderr || e.message).split("\n").filter((l) => l && !/Warning|Reparsing|trace-warnings|eliminate this/.test(l)).slice(0, 4).join(" | ");
    rows.push({ path: p, ok: false, failed: true, why });
    console.log(`FAIL ${p}: ${why}`);
  }
}
const summary = { builtAt: new Date().toISOString(), outDir, races: rows.length, ok: rows.filter((r) => r.ok).length, failed: rows.filter((r) => !r.ok).map((r) => ({ path: r.path, why: r.why || r.errors })), rows };
fs.writeFileSync(path.join(outDir, only ? `summary-${only.replace(/\W+/g, "_")}.json` : "summary.json"), JSON.stringify(summary, null, 1));
console.log(`${summary.ok}/${summary.races} built → ${outDir}`);
