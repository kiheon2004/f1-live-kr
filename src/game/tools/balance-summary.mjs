// Summarise balance.mjs output (one or more .jsonl files) as Markdown: per case the stops, stint patterns, why stops came
// within 4 laps, laps on unsuitable tyres, plan flip-flops, SC stops, refused AI orders, and the box releases (all /
// with a car coming = a draw / unsafe / held), split dry vs wet vs crowded lane (4+ cars in the lane).
//   node src/game/tools/balance-summary.mjs <file.jsonl> …
import fs from "node:fs";
const rows = process.argv.slice(2).flatMap((f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
const by = new Map(); for (const r of rows) { const k = `${r.id.slice(0, 30)} (${r.wmode})`; (by.get(k) || by.set(k, []).get(k)).push(r); }
const ids = new Set(rows.map((r) => `${r.commit} · ${r.engine} · ${r.params}`));
console.log(`Runs: ${rows.length} · code/model: ${[...ids].join(" | ")}\n`);
console.log("| case | races (status) | stops per car | top stint patterns | stops ≤4 laps apart, by reason | laps on unsuitable tyres (episodes 3+ laps) | AI flip-flops / plan orders | SC/VSC: stopped/cars | refused AI orders | stop without set |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const rel = { all: [0, 0, 0, 0, 0], dry: [0, 0, 0, 0, 0], wet: [0, 0, 0, 0, 0], crowd: [0, 0, 0, 0, 0] };
for (const [k, rs] of [...by].sort()) {
  const st = {}, stops = {}, why = {}, refused = {}; let bad = 0, ep = 0, flips = 0, orders = 0, nf = 0; const sc = [];
  for (const r of rs) {
    if (r.status !== "finished" && r.status !== "stopped (time cap)") continue;
    for (const c of r.cars) {
      if (c.status === "fin" || c.status === "run") { st[c.stints.replace(/\d+/g, "")] = (st[c.stints.replace(/\d+/g, "")] || 0) + 1; stops[c.stops.length] = (stops[c.stops.length] || 0) + 1; }
      for (const x of c.restops) why[x.why] = (why[x.why] || 0) + 1;
      bad += c.unsuitedLaps; ep += c.unsuitedEpisodes; flips += c.flips; orders += c.aiPlanOrders;
      for (const x of c.releases) for (const key of ["all", x.wet ? "wet" : "dry", ...(x.inLane >= 4 ? ["crowd"] : [])]) { const a = rel[key]; a[0]++; a[1] += x.threat ? 1 : 0; a[2] += x.draw ? 1 : 0; a[3] += x.unsafe ? 1 : 0; a[4] += x.holdMs; }
    }
    for (const p of r.periods || []) sc.push(`${p.f}:${p.stopped}/${p.of}`);
    for (const w of r.refusedAi || []) { const key = w.replace(/\d+/g, "#").slice(0, 36); refused[key] = (refused[key] || 0) + 1; }
    nf += r.tyreNotFitted || 0;
  }
  const status = Object.entries(rs.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {})).map(([s, n]) => `${n} ${s}`).join(", ");
  const tot = Object.values(st).reduce((a, b) => a + b, 0) || 1, top = Object.entries(st).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, n]) => `${s} ${Math.round((n * 100) / tot)}%`).join(", ");
  console.log(`| ${k} | ${status} | ${JSON.stringify(stops)} | ${top} | ${JSON.stringify(why)} | ${bad} (${ep}) | ${flips}/${orders} | ${sc.join(" ") || "–"} | ${JSON.stringify(refused)} | ${nf} |`);
}
console.log("\nBox releases (a draw happens once per release with a car coming down the fast lane):\n");
console.log("| releases | count | car coming (= draws) | unsafe | unsafe per draw | mean hold, ms |\n|---|---|---|---|---|---|");
for (const [k, a] of Object.entries(rel)) console.log(`| ${k} | ${a[0]} | ${a[2]} | ${a[3]} | ${a[2] ? (a[3] / a[2]).toFixed(3) : "–"} | ${a[0] ? Math.round(a[4] / a[0]) : "–"} |`);
const errs = rows.filter((r) => r.status === "error"); if (errs.length) { console.log("\nErrors:"); for (const r of errs) console.log(`- ${r.id} seed ${r.seed}: ${r.error.split("\n")[0]}`); }
