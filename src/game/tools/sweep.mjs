// Many full races, many seeds: looks for runaway numbers, cars stuck for good, races that never end (request §19).
//   node src/game/tools/sweep.mjs <scenario.json …> [--seeds 1-20] [--out dir] [--maxSim min]
// Per race: finished, sim and wall time, ×real time, anomalies (first of each kind with time and car). A failing seed is
// written to <out>/failing.json with the command that reruns it (src/game/tools/run.mjs … --seed N).
import fs from "node:fs";
import path from "node:path";
import { createRace, step, results } from "../engine/engine.js";

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const files = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const [s0, s1] = String(opt("--seeds", "1-5")).split("-").map(Number), out = opt("--out", "."), maxSim = +opt("--maxSim", 240) * 60000;
fs.mkdirSync(out, { recursive: true });
const rows = [], failing = [];

// state checks every 1 s of sim time; a car "running" whose race distance hasn't grown for 120 s is stuck (a stop at its
// box, a red flag or a queue behind the SC are not: they have a phase that explains them)
function check(race, memo, anomalies) {
  const S = race.state, t = S.t;
  for (const c of S.cars) {
    const bad = (k, v) => { if (!anomalies.some((a) => a.kind === k)) anomalies.push({ kind: k, t, car: c.num, value: v }); };
    if (!Number.isFinite(c.v) || !Number.isFinite(c.s) || !Number.isFinite(c.dist)) bad("non-finite", { v: c.v, s: c.s, dist: c.dist });
    if (c.v < 0 || c.v > 110) bad("speed out of range", c.v);
    if (!(c.tyre.wear >= 0 && c.tyre.wear <= 1)) bad("tyre wear out of range", c.tyre.wear);
    if (!(c.tyre.Ts > -30 && c.tyre.Ts < 250) || !(c.tyre.Tc > -30 && c.tyre.Tc < 250)) bad("tyre temperature out of range", [c.tyre.Ts, c.tyre.Tc]);
    if (!(c.energy.fuel >= 0) || !(c.energy.soc >= 0)) bad("energy out of range", [c.energy.fuel, c.energy.soc]);
    if (c.status === "run" || c.status === "pit") {
      const m = memo.get(c.num) || { dist: c.dist, t };
      const explained = c.pit?.phase && c.pit.phase !== "none" || S.control?.flag === "red" || S.control?.flag === "sc" || (c.inc && c.inc.until > t);
      if (c.dist > m.dist + 1 || explained) memo.set(c.num, { dist: c.dist, t });
      else if (t - m.t > 120000) bad("stuck (no progress 120 s)", { dist: c.dist, phase: c.pit?.phase });
    }
  }
}

for (const f of files) {
  const scenario = JSON.parse(fs.readFileSync(f, "utf8"));
  for (let seed = s0; seed <= s1; seed++) {
    const race = createRace({ scenario, seed }), anomalies = [], memo = new Map(), w0 = process.hrtime.bigint();
    let err = null;
    try {
      while (!race.state.finished && race.state.t < maxSim) { step(race); if (race.state.t % 1000 === 0) check(race, memo, anomalies); }
    } catch (e) { err = String(e && e.stack || e).split("\n").slice(0, 3).join(" | "); }
    const wall = Number(process.hrtime.bigint() - w0) / 1e9, S = race.state;
    if (!S.finished && !err) anomalies.push({ kind: "did not finish", t: S.t });
    const R = err ? null : results(race);
    const row = { scenario: scenario.meta.id, seed, finished: S.finished, simMin: +(S.t / 60000).toFixed(1), wallS: +wall.toFixed(2), xReal: +((S.t / 1000) / wall).toFixed(0),
      winner: R?.rows[0]?.tla, classified: R?.rows.filter((r) => r.status === "fin").length, dnf: R?.rows.filter((r) => r.status === "dnf").length,
      stops: R ? +(R.rows.reduce((a, r) => a + (r.stops || 0), 0) / R.rows.length).toFixed(2) : null, events: S.log.length, anomalies, err };
    rows.push(row);
    console.log(`${row.scenario} seed ${seed}: ${row.finished ? "finished" : "NOT finished"} ${row.simMin} min, ${row.wallS} s (${row.xReal}×), winner ${row.winner}, dnf ${row.dnf}, stops/car ${row.stops}${anomalies.length ? `, ANOMALIES ${anomalies.map((a) => a.kind).join("; ")}` : ""}${err ? `, ERROR ${err}` : ""}`);
    if (anomalies.length || err) failing.push({ scenario: f, seed, anomalies, err, rerun: `node src/game/tools/run.mjs ${f} --seed ${seed}` });
  }
}
fs.writeFileSync(path.join(out, "sweep.json"), JSON.stringify(rows, null, 1));
fs.writeFileSync(path.join(out, "failing.json"), JSON.stringify(failing, null, 1));
console.log(`${rows.length} races, ${failing.length} with anomalies → ${path.join(out, "failing.json")}`);
