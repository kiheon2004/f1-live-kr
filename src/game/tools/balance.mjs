// The AI / balance audit (v0.52 §9): whole races with every team on the AI, one JSON line per race – reproducible from the
// line alone (code commit, engine, parameters, scenario id + content fingerprint, seed, weather mode). Failed and
// stopped races are written too. Nothing here touches a session cache: it reads prepared scenario files only.
//
//   node src/game/tools/balance.mjs --scenarios <dir> --out <file.jsonl> --case <scenarioId>[:<weatherMode>] … [--seeds 1,2,3,4]
//                                  [--repo <repo root, default: this file's>] [--maxMin 240]
//
// Per race: per car the stints (compound, laps, how it started), the class sequence (D / I / W), each stop and why the
// next one came within 4 laps (classified – see classify()), the laps run on a tyre that didn't suit the water then
// (unsuitable: slick with ≥ 0.5 mm, intermediate ≥ 2.0 mm or ≤ 0.03 mm for 2+ laps after the first, wet ≤ 0.8 mm), the
// releases from the box (with a car coming / a draw / unsafe / held ms / cars in the lane / wet), penalties, the AI's
// plan flip-flops, refused AI orders (e.g. no set left), SC / VSC periods with who stopped in them.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2), opt = (k, d = null) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const cases = []; for (let i = 0; i < args.length; i++) if (args[i] === "--case") cases.push(args[i + 1]);
const repo = path.resolve(opt("repo") || path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.."));
const scDir = opt("scenarios"), out = opt("out"), seeds = (opt("seeds", "1,2,3,4")).split(",").map(Number), maxMin = +opt("maxMin", 240);
if (!scDir || !out || !cases.length) { console.error("usage: balance.mjs --scenarios <dir> --out <file> --case <id>[:<weatherMode>] … [--seeds 1,2,3,4]"); process.exit(2); }

const E = await import(path.join(repo, "src/game/engine/engine.js"));
let commit = null; try { commit = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); const dirty = execFileSync("git", ["-C", repo, "status", "--porcelain", "src"], { encoding: "utf8" }).trim(); if (dirty) commit += "+dirty"; } catch { commit = null; }
const cls = (c) => (c === "INTERMEDIATE" ? "I" : c === "WET" ? "W" : "D");
const unsuited = (c, w, ageLaps) => (cls(c) === "D" ? w >= 0.5 : cls(c) === "I" ? w >= 2.0 || (w <= 0.03 && ageLaps > 2) : w <= 0.8);

for (const spec of cases) for (const seed of seeds) {
  const [id, wmode = "real"] = spec.split(":"), file = path.join(scDir, id + ".scenario.json");
  const rec = { id, seed, wmode, commit, engine: E.ENGINE_VERSION, params: E.PARAMS_VERSION ?? null, status: "running" };
  const t0 = Date.now();
  try {
    const raw = fs.readFileSync(file, "utf8"), SC = JSON.parse(raw);
    rec.scenarioPrint = crypto.createHash("sha1").update(raw).digest("hex").slice(0, 12);
    const r = E.createRace({ scenario: SC, seed, ai: true, weatherMode: wmode });
    const S = r.state, waterAt = {}, flags = []; let lastFlag = "green";
    const lapSeen = Object.fromEntries(S.cars.map((c) => [c.num, 0])), lapWater = Object.fromEntries(S.cars.map((c) => [c.num, []]));
    // each stop with the car's OWN completed laps then (the log's lap is the leader's)
    const where = Object.fromEntries(S.cars.map((c) => [c.num, c.where])), stopsBy = Object.fromEntries(S.cars.map((c) => [c.num, []]));
    const wNow = () => { const h = r.cache.surface.hLine; let s = 0; for (const x of h) s += x; return s / h.length; };
    while (!S.finished && S.t < maxMin * 60000) {
      E.step(r);
      const f = S.control?.flag || "green"; if (f !== lastFlag) { flags.push({ t: S.t, lap: S.leaderLap, f }); lastFlag = f; }
      for (const c of S.cars) {
        if (c.lap > lapSeen[c.num]) { lapSeen[c.num] = c.lap; lapWater[c.num].push(+wNow().toFixed(3)); }
        if (c.where === "pit" && where[c.num] === "lap" && S.phase !== "grid") stopsBy[c.num].push({ t: S.t, lap: c.lap, under: f === "sc" || f === "vsc" ? f : null, water: +wNow().toFixed(3) });
        where[c.num] = c.where;
      }
    }
    rec.status = S.finished ? "finished" : "stopped (time cap)"; rec.simMin = Math.round(S.t / 60000); rec.laps = S.totalLaps;
    const res = E.results(r), periods = [];
    for (let i = 0; i < flags.length; i++) if (flags[i].f === "sc" || flags[i].f === "vsc") periods.push({ f: flags[i].f, t0: flags[i].t, t1: flags[i + 1]?.t ?? S.t, lap0: flags[i].lap });
    const entries = S.log.filter((e) => e.type === "pitEntry");
    rec.cars = S.cars.map((c) => {
      const st = []; let prev = null; for (const l of c.laps) { const last = st[st.length - 1]; if (last && !prev?.pit && last.c === l.compound) last.n++; else st.push({ c: l.compound, from: l.n, n: 1 }); prev = l; }
      const stops = stopsBy[c.num];
      const w = lapWater[c.num]; let bad = 0, run = 0, episodes = 0, age = 0, prevC = null;
      c.laps.forEach((l, i) => { age = l.compound === prevC && !c.laps[i - 1]?.pit ? age + 1 : 1; prevC = l.compound; const u = unsuited(l.compound, w[i] ?? 0, age); if (u) { bad++; run++; if (run === 3) episodes++; } else run = 0; });
      const aiPlans = S.commands.log.filter((o) => o.car === c.num && o.type === "plan" && o.ok && o.by.startsWith("ai:")).map((o) => o.args.stints.map((x) => x.compound[0] + x.toLap).join("-"));
      let flips = 0; for (let i = 2; i < aiPlans.length; i++) if (aiPlans[i] === aiPlans[i - 2] && aiPlans[i] !== aiPlans[i - 1]) flips++;
      const row = res.rows.find((x) => x.num === c.num);
      return { num: c.num, team: c.teamKey, pos: row?.pos ?? null, status: c.status, classes: st.map((x) => cls(x.c)).join(""), stints: st.map((x) => x.c[0] + x.n).join("-"), stops,
        unsuitedLaps: bad, unsuitedEpisodes: episodes, flips, aiPlanOrders: aiPlans.length, penS: row?.penS || 0, releases: c.pit.relLog || [],
        dmg: !!c.dmg, restops: classify(c, st, stops, S) };
    });
    rec.periods = periods.map((p) => ({ ...p, stopped: new Set(entries.filter((e) => e.t >= p.t0 && e.t <= p.t1 + 20000).map((e) => e.car)).size, of: S.cars.length }));
    rec.refusedAi = S.commands.log.filter((o) => !o.ok && o.by.startsWith("ai:")).map((o) => o.why);
    rec.tyreNotFitted = S.log.filter((e) => e.type === "tyreNotFitted").length;
  } catch (e) { rec.status = "error"; rec.error = String(e?.stack || e).slice(0, 600); }
  rec.ms = Date.now() - t0;
  fs.appendFileSync(out, JSON.stringify(rec) + "\n");
  console.log(`${id.slice(0, 32)} seed ${seed} ${wmode}: ${rec.status} (${Math.round(rec.ms / 1000)} s)`);
}

// why the next stop came within 4 laps of this one (each pair of stops ≤ 4 laps apart gets one reason):
//   rainBack      a change of class back to wet-weather tyres after going to slicks (the rain came again)
//   interWet      intermediate ↔ wet
//   wetToDry / dryToWet   a class change (the conditions changed)
//   sc            the second stop under SC / VSC
//   damage        the car had damage / an incident between the stops
//   dryRepeat     slick → slick again without SC or damage (the planner re-pitting – the failure case)
//   other
function classify(c, st, stops, S) {
  const out = [];
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].lap - stops[i - 1].lap > 4) continue;
    const before = st.find((x) => x.from > stops[i - 1].lap) || null, after = st.find((x) => x.from > stops[i].lap) || null;
    const a = before ? cls(before.c) : "?", b = after ? cls(after.c) : "?", prevCls = (st.filter((x) => x.from <= stops[i - 1].lap).pop() || {}).c;
    const inc = S.log.some((e) => (e.car === c.num || (e.cars || []).includes(c.num)) && /contact|mechanical|driver error/.test(e.type) && e.t >= stops[i - 1].t && e.t <= stops[i].t);
    let why = "other";
    if (stops[i].under) why = "sc";
    else if (inc) why = "damage";
    else if ((a === "I" || a === "W") && (b === "I" || b === "W") && a !== b) why = "interWet";
    else if (a === "D" && b !== "D" && prevCls && cls(prevCls) !== "D") why = "rainBack";
    else if (a !== b) why = a === "D" ? "dryToWet" : "wetToDry";
    else if (a === "D" && b === "D") why = "dryRepeat";
    out.push({ laps: [stops[i - 1].lap, stops[i].lap], why });
  }
  return out;
}
