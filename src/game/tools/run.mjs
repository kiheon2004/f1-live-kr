// Headless race: node src/game/tools/run.mjs <scenario.json> [--seed N] [--team KEY] [--until ms] [--save file] [--load file]
// [--json out] [--ai] (every team run by ai.js) [--wear k] (tyre wear ×k, sensitivity) – runs the engine to the end (or --until), prints the classification, timing and anomalies.
// --replay <game-result.json>: the race of a saved game result (userData/game/results – its runOpts: seed, team, plans,
// AI) with the player's orders from its command log submitted at the sim times they were given; prints whether the
// classification comes out the same (the command-log replay of request §16).
import fs from "node:fs";
import { createRace, step, results, saveRace, loadRace, events, command } from "../engine/engine.js";
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const scenario = JSON.parse(fs.readFileSync(args[0], "utf8"));
const rep = opt("--replay") ? JSON.parse(fs.readFileSync(opt("--replay"), "utf8")) : null;
if (rep && !rep.runOpts) throw new Error("this result has no runOpts (saved before v0.48 replay support, or a dev snapshot)");
let race = opt("--load") ? loadRace(fs.readFileSync(opt("--load"), "utf8"), scenario)
  : rep ? createRace({ scenario, ...rep.runOpts })
  : createRace({ scenario, seed: +opt("--seed", 1), userTeam: opt("--team", null), ai: args.includes("--ai"), tyreWear: +opt("--wear", 1) });
// the player's orders (the AI's come again from the AI itself), each submitted when the state reaches its sim time
const pending = rep ? (rep.commandLog || []).filter((c) => !String(c.by).startsWith("ai:")).sort((a, b) => a.tAt - b.tAt) : [];
const feed = () => { while (pending.length && pending[0].tAt <= race.state.t) { const c = pending.shift(); command(race, { id: c.id, type: c.type, car: c.car, team: c.team, args: c.args, by: c.by }); } };
const until = +opt("--until", Infinity), t0 = process.hrtime.bigint();
let steps = 0, worst = 0;
while (!race.state.finished && race.state.t < until) {
  if (pending.length) feed();
  step(race); steps++;
  if (steps % 2000 === 0) for (const c of race.state.cars) { if (!Number.isFinite(c.v) || !Number.isFinite(c.s) || c.v < 0 || c.v > 120) throw new Error(`anomaly t=${race.state.t} car ${c.num}: v ${c.v} s ${c.s}`); }
  if (race.state.t > 4 * 3600e3) throw new Error("race did not finish in 4 h of sim time");
}
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
if (opt("--save")) fs.writeFileSync(opt("--save"), saveRace(race));
const R = results(race);
console.log(`${scenario.meta.id}  seed ${race.state.seed}  sim ${(race.state.t / 60000).toFixed(1)} min  steps ${steps}  wall ${(ms / 1000).toFixed(2)} s  (${((race.state.t / 1000) / (ms / 1000)).toFixed(0)}× real time)  finished ${race.state.finished}`);
if (race.state.ai) console.log(`ai work: ${race.state.ai.work.decisions} plans, ${race.state.ai.work.events} event re-plans`);
for (const r of R.rows) console.log(`${String(r.pos).padStart(2)} ${r.tla.padEnd(4)} ${r.team.padEnd(18)} laps ${r.laps}  ${r.gap != null ? "+" + r.gap.toFixed(3) : r.lapsDown ? `+${r.lapsDown} lap` : r.status}  stops ${r.stops}  ${(r.stints || []).map((x) => x.compound[0] + x.laps).join("-")}  traffic ${r.acct.traffic.toFixed(1)} s  pit ${(r.acct.pit ?? 0).toFixed(1)} s${r.penS ? `  pen +${r.penS} s` : ""}${r.points ? `  ${r.points} pts` : ""}`);
if (rep) { const a = (rep.classification || []).map((c) => `${c.pos}:${c.tla}`).join(","), b = R.rows.map((r) => `${r.pos}:${r.tla}`).join(","); console.log(`replay: classification ${a === b ? "IDENTICAL to the saved result" : "DIFFERS from the saved result"}`); if (a !== b) process.exitCode = 1; }
if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify({ results: R, events: events(race), laps: Object.fromEntries(race.state.cars.map((c) => [c.num, c.laps])) }));
