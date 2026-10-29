// Headless race: node src/game/tools/run.mjs <scenario.json> [--seed N] [--team KEY] [--until ms] [--save file] [--load file]
// [--json out] – runs the engine to the end (or --until), prints the classification, timing and anomalies.
import fs from "node:fs";
import { createRace, step, results, saveRace, loadRace, events } from "../engine/engine.js";
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const scenario = JSON.parse(fs.readFileSync(args[0], "utf8"));
let race = opt("--load") ? loadRace(fs.readFileSync(opt("--load"), "utf8"), scenario) : createRace({ scenario, seed: +opt("--seed", 1), userTeam: opt("--team", null) });
const until = +opt("--until", Infinity), t0 = process.hrtime.bigint();
let steps = 0, worst = 0;
while (!race.state.finished && race.state.t < until) {
  step(race); steps++;
  if (steps % 2000 === 0) for (const c of race.state.cars) { if (!Number.isFinite(c.v) || !Number.isFinite(c.s) || c.v < 0 || c.v > 120) throw new Error(`anomaly t=${race.state.t} car ${c.num}: v ${c.v} s ${c.s}`); }
  if (race.state.t > 4 * 3600e3) throw new Error("race did not finish in 4 h of sim time");
}
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
if (opt("--save")) fs.writeFileSync(opt("--save"), saveRace(race));
const R = results(race);
console.log(`${scenario.meta.id}  seed ${race.state.seed}  sim ${(race.state.t / 60000).toFixed(1)} min  steps ${steps}  wall ${(ms / 1000).toFixed(2)} s  (${((race.state.t / 1000) / (ms / 1000)).toFixed(0)}× real time)  finished ${race.state.finished}`);
for (const r of R.rows) console.log(`${String(r.pos).padStart(2)} ${r.tla.padEnd(4)} ${r.team.padEnd(18)} laps ${r.laps}  ${r.gap != null ? "+" + r.gap.toFixed(3) : r.lapsDown ? `+${r.lapsDown} lap` : r.status}  stops ${r.stops}  traffic ${r.acct.traffic.toFixed(1)} s`);
if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify({ results: R, events: events(race), laps: Object.fromEntries(race.state.cars.map((c) => [c.num, c.laps])) }));
