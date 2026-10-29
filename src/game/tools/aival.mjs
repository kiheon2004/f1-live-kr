// AI validation (request §13, §15): automatic scenarios on the race fixtures – distributions, not one run.
//   node src/game/tools/aival.mjs ab   [--races a,b] [--seeds 1,2] [--teams 3] [--out dir]
//        per race × seed: the fixed default plan for every car (base), every team on the AI (all), and k teams one at a
//        time on the AI while the rest keep the default plan (A/B: that team's cars vs themselves in the base run).
//   node src/game/tools/aival.mjs sens [--races a,b] [--seeds 1,2] [--out dir]
//        sensitivity with every team on the AI: tyre wear ×0.6/1/1.6 → stops; pit-lane limit 60/80/100 km/h (bigger /
//        smaller pit loss) → stops; a rain spell with the real forecast vs a forecast forced dry → when inters go on; a short
//        shower with a dry forecast → slicks kept?; one team on attack all race vs balanced (default plan) → its cost.
//   node src/game/tools/aival.mjs solo [--races a,b] [--seeds 1,2] [--teams 3] [--out dir]
//        the same sensitivities with ONE team alone on the track (its two cars – clean air, so the strategy's causality is
//        seen without the follow-only traffic of the base engine): wear, pit-lane limit, attack all race, rain forecast.
// Writes <out>/<mode>.json and prints a summary (the log is the console output: tee it).
import fs from "node:fs";
import path from "node:path";
import { createRace, step } from "../engine/engine.js";
import * as CMD from "../engine/commands.js";

const args = process.argv.slice(2), mode = args[0], opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const FIX = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../test/fixtures/game");
const ALL = fs.readdirSync(FIX).filter((f) => f.endsWith(".scenario.json")).map((f) => f.replace(".scenario.json", ""));
const races = (opt("--races") ? opt("--races").split(",") : ALL).map((r) => ALL.find((x) => x.includes(r)) || r);
const seeds = (opt("--seeds") || "1,2").split(",").map(Number), out = opt("--out", "."), K = +opt("--teams", 3);
fs.mkdirSync(out, { recursive: true });
const load = (id) => JSON.parse(fs.readFileSync(path.join(FIX, id + ".scenario.json"), "utf8"));

// race time of a car over the full distance: its finish time; a lapped car's missing laps at its last laps' pace
function carTime(race, c) {
  const S = race.state, laps = c.laps.filter((l) => !l.pit).slice(-3).map((l) => l.t).sort((a, b) => a - b), lastLap = laps[1] ?? laps[0] ?? 90;
  if (c.status === "dnf" || c.finT == null) return null;
  return c.finT / 1000 + Math.max(0, S.totalLaps - c.lap) * lastLap;
}
function run(sc, seed, opts = {}, hook = null) {
  const t0 = process.hrtime.bigint(), race = createRace({ scenario: sc, seed, ...opts });
  if (hook?.init) hook.init(race);
  // (a race that hasn't finished after 4 h of sim time is recorded as stuck – an engine matter, reported – and skipped)
  let stuck = false;
  while (!race.state.finished) { step(race); hook?.step?.(race); if (race.state.t > 4 * 3600e3) { stuck = true; break; } }
  if (stuck) { console.log(`STUCK ${sc.meta.id} seed ${seed} ai ${JSON.stringify(opts.ai ?? false)} flag ${race.state.control?.flag} leaderLap ${race.state.leaderLap}`); return { ms: 0, stuck: true, cars: race.state.cars.map((c) => ({ num: c.num, team: c.teamKey, time: null, pos: null, stops: c.pit.stops, compounds: [], interLap: null })), ai: null }; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const pos = new Map((race.state.results?.rows || []).map((r) => [r.num, r.pos]));
  const cars = race.state.cars.map((c) => ({ num: c.num, team: c.teamKey, time: carTime(race, c), pos: pos.get(c.num), stops: c.pit.stops,
    compounds: [...new Set(c.laps.map((l) => l.compound))], interLap: c.laps.find((l) => l.compound === "INTERMEDIATE" || l.compound === "WET")?.n ?? null }));
  return { ms, cars, ai: race.state.ai ? race.state.ai.work : null };
}
const stats = (xs) => { const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q), n = a.length; if (!n) return null; const m = a.reduce((s, x) => s + x, 0) / n; return { n, mean: +m.toFixed(2), sd: +Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1)).toFixed(2), min: +a[0].toFixed(2), p25: +a[Math.floor((n - 1) / 4)].toFixed(2), med: +a[Math.floor((n - 1) / 2)].toFixed(2), p75: +a[Math.ceil(3 * (n - 1) / 4)].toFixed(2), max: +a[n - 1].toFixed(2) }; };
const fmt = (s) => (s ? `mean ${s.mean} sd ${s.sd} [min ${s.min} p25 ${s.p25} med ${s.med} p75 ${s.p75} max ${s.max}] n ${s.n}` : "–");
const log = (...a) => console.log(...a);

if (mode === "ab") {
  const res = [];
  for (const id of races) {
    const sc = load(id), teams = [...new Set(sc.entries.map((e) => e.teamKey))];
    for (const [si, seed] of seeds.entries()) {
      const base = run(sc, seed), all = run(sc, seed, { ai: true });
      const rec = { race: id, seed, baseMs: base.ms, allMs: all.ms, base: base.cars, all: all.cars, aiWork: all.ai, ab: [] };
      // the k teams of this seed (rotating, so over the seeds different teams take part)
      for (let j = 0; j < Math.min(K, teams.length); j++) {
        const team = teams[(si * K + j) % teams.length], r = run(sc, seed, { ai: { teams: [team] } });
        for (const c of r.cars.filter((x) => x.team === team)) { const b = base.cars.find((x) => x.num === c.num); rec.ab.push({ team, num: c.num, dTime: c.time != null && b.time != null ? +(c.time - b.time).toFixed(2) : null, dPos: c.pos - b.pos, stops: c.stops, baseStops: b.stops }); }
      }
      res.push(rec);
      const dAll = all.cars.map((c) => { const b = base.cars.find((x) => x.num === c.num); return c.time != null && b.time != null ? c.time - b.time : null; });
      log(`${id} seed ${seed}: base ${(base.ms / 1000).toFixed(1)} s wall, all-AI ${(all.ms / 1000).toFixed(1)} s wall; all-AI vs base race time per car: ${fmt(stats(dAll))}; stops base ${fmt(stats(base.cars.map((c) => c.stops)))} AI ${fmt(stats(all.cars.map((c) => c.stops)))}`);
      for (const a of rec.ab) log(`   A/B ${a.team.padEnd(16)} #${a.num.padEnd(3)} Δtime ${a.dTime} s  Δpos ${a.dPos}  stops ${a.baseStops}→${a.stops}`);
      fs.writeFileSync(path.join(out, "ab.json"), JSON.stringify(res));
    }
  }
  const ab = res.flatMap((r) => r.ab);
  log(`\nA/B (one team on the AI, the rest on the default plan), per car, AI − default:\n  Δ race time s: ${fmt(stats(ab.map((a) => a.dTime)))}\n  Δ position:    ${fmt(stats(ab.map((a) => a.dPos)))}\n  share of cars faster: ${(ab.filter((a) => a.dTime < 0).length / ab.length).toFixed(2)}`);
  for (const id of races) { const x = res.filter((r) => r.race === id).flatMap((r) => r.ab); log(`  ${id}: Δtime ${fmt(stats(x.map((a) => a.dTime)))}`); }
  const allD = res.flatMap((r) => r.all.map((c) => { const b = r.base.find((x) => x.num === c.num); return c.time != null && b.time != null ? c.time - b.time : null; }));
  log(`All teams on the AI vs all on the default plan, per car race time: ${fmt(stats(allD))}`);
  log(`Wall time per race: base ${fmt(stats(res.map((r) => r.baseMs / 1000)))}; all-AI ${fmt(stats(res.map((r) => r.allMs / 1000)))}`);
}

// a scenario with only this team's cars (grid slots kept: the same start places)
function alone(sc, team) {
  const s = JSON.parse(JSON.stringify(sc)), keep = new Set(s.entries.filter((e) => e.teamKey === team).map((e) => e.num));
  s.entries = s.entries.filter((e) => keep.has(e.num));
  if (s.grid) { s.grid.slots = (s.grid.slots || []).filter((g) => keep.has(g.num)); s.grid.order = (s.grid.order || []).filter((n) => keep.has(n)); s.grid.pitLane = (s.grid.pitLane || []).filter((x) => keep.has(typeof x === "object" ? x.num : x)); }
  return s;
}
if (mode === "solo") {
  const res = { wear: [], pit: [], attack: [], rain: [] }, dryFc = (race) => { const t0 = Math.floor(race.state.t / 300000) * 300000; return { issued: t0, blocks: Array.from({ length: 8 }, (_, j) => ({ from: t0 + j * 900000, to: t0 + (j + 1) * 900000, pRain: 0.05 })) }; };
  for (const id of races) {
    const sc = load(id), teams = [...new Set(sc.entries.map((e) => e.teamKey))].slice(0, K);
    for (const team of teams) for (const seed of seeds) {
      const s1 = alone(sc, team), st = (r) => r.cars.map((c) => c.stops);
      for (const k of [0.6, 1, 1.6]) { const r = run(s1, seed, { ai: true, tyreWear: k }); res.wear.push({ race: id, team, seed, k, stops: st(r), time: r.cars.map((c) => c.time) }); }
      for (const kmh of [60, 80, 100]) { const s2 = JSON.parse(JSON.stringify(s1)); s2.track.pit.speedLimit = kmh / 3.6; const r = run(s2, seed, { ai: true }); res.pit.push({ race: id, team, seed, kmh, stops: st(r) }); }
      const nums = s1.entries.map((e) => e.num);
      const atk = run(s1, seed, { userTeam: team }, { init: (race) => { for (const n of nums) CMD.submit(race.state.commands, 0, { id: "atk" + n, type: "pace", car: n, args: { mode: "attack" }, by: "player" }); } });
      const bal = run(s1, seed, { userTeam: team });
      for (const n of nums) res.attack.push({ race: id, team, seed, num: n, dTime: +(atk.cars.find((c) => c.num === n).time - bal.cars.find((c) => c.num === n).time).toFixed(2) });
      // A/B in clean air: the AI vs the fixed default plan for the same two cars
      const ai = run(s1, seed, { ai: true });
      for (const n of nums) (res.ab ||= []).push({ race: id, team, seed, num: n, dTime: +(ai.cars.find((c) => c.num === n).time - bal.cars.find((c) => c.num === n).time).toFixed(2), stops: ai.cars.find((c) => c.num === n).stops });
      // rain spell 40–75 min written into the record; the real forecast vs one forced dry – the same truth
      const wet = JSON.parse(JSON.stringify(s1)); { const c = wet.weather.cols; c.rain = c.t.map((t) => (t >= 2400 && t < 4500 ? 1 : 0)); }
      for (const fc of ["real", "dry"]) {
        let rainLap = null; const r = run(wet, seed, { ai: true }, { init: (race) => { if (fc === "dry") race.cache.forecastFn = dryFc; }, step: (race) => { if (rainLap == null && race.state.t >= 2400000) rainLap = race.state.leaderLap; } });
        res.rain.push({ race: id, team, seed, forecast: fc, rainLap, interLaps: r.cars.map((c) => (c.interLap == null ? null : c.interLap - rainLap)), time: r.cars.map((c) => c.time) });
      }
      log(`${id} ${team} seed ${seed} done`);
      fs.writeFileSync(path.join(out, "solo.json"), JSON.stringify(res));
    }
  }
  const flat = (a, f) => a.flatMap(f);
  log("\nSolo (one team alone – clean air), per car:");
  for (const k of [0.6, 1, 1.6]) log(`  wear ×${k}: stops ${fmt(stats(flat(res.wear.filter((w) => w.k === k), (w) => w.stops)))}`);
  for (const kmh of [60, 80, 100]) log(`  pit limit ${kmh} km/h: stops ${fmt(stats(flat(res.pit.filter((w) => w.kmh === kmh), (w) => w.stops)))}`);
  log(`  attack all race − balanced, race time s: ${fmt(stats(res.attack.map((a) => a.dTime)))}`);
  log(`  AI − default plan (clean air), race time s: ${fmt(stats(res.ab.map((a) => a.dTime)))}; AI stops ${fmt(stats(res.ab.map((a) => a.stops)))}`);
  for (const fc of ["real", "dry"]) { const x = res.rain.filter((r) => r.forecast === fc); log(`  rain spell, forecast ${fc}: first wet-tyre lap − rain lap ${fmt(stats(flat(x, (r) => r.interLaps)))}; cars never on wet tyres ${flat(x, (r) => r.interLaps).filter((v) => v == null).length}/${flat(x, (r) => r.interLaps).length}; race time ${fmt(stats(flat(x, (r) => r.time)))}`); }
}

if (mode === "sens") {
  const res = { wear: [], pit: [], rain: [], attack: [] };
  for (const id of races) {
    const sc = load(id);
    for (const seed of seeds) {
      for (const k of [0.6, 1, 1.6]) { const r = run(sc, seed, { ai: true, tyreWear: k }); const s = stats(r.cars.map((c) => c.stops)); res.wear.push({ race: id, seed, k, stops: s }); log(`wear ×${k} ${id} seed ${seed}: stops ${fmt(s)}`); }
      for (const kmh of [60, 80, 100]) {
        const s2 = JSON.parse(JSON.stringify(sc)); s2.track.pit.speedLimit = kmh / 3.6;
        const r = run(s2, seed, { ai: true }); const s = stats(r.cars.map((c) => c.stops)); res.pit.push({ race: id, seed, kmh, stops: s }); log(`pit limit ${kmh} km/h ${id} seed ${seed}: stops ${fmt(s)}`);
      }
      // one team on attack all race (orders by the player) vs balanced – both on the default plan, the AI off for it
      const team = sc.entries[0].teamKey, nums = sc.entries.filter((e) => e.teamKey === team).map((e) => e.num);
      const atk = run(sc, seed, { userTeam: team }, { init: (race) => { for (const n of nums) CMD.submit(race.state.commands, 0, { id: "atk" + n, type: "pace", car: n, args: { mode: "attack" }, by: "player" }); } });
      const bal = run(sc, seed, { userTeam: team });
      for (const n of nums) { const a = atk.cars.find((c) => c.num === n), b = bal.cars.find((c) => c.num === n); res.attack.push({ race: id, seed, num: n, dTime: +(a.time - b.time).toFixed(2), dPos: a.pos - b.pos }); log(`attack all race #${n} ${id} seed ${seed}: Δtime ${(a.time - b.time).toFixed(1)} s, Δpos ${a.pos - b.pos}`); }
    }
  }
  // rain: Hungary (dry record) with a rain spell 40–75 min written into the record; the teams' forecast real (it sees the
  // spell coming, with its errors) vs forced dry (pRain 5 %) – the same truth both times
  const hun = load(races.find((r) => /Hungar/.test(r)) || ALL.find((r) => /Hungar/.test(r)));
  const wetSc = (from, to) => { const s = JSON.parse(JSON.stringify(hun)); const c = s.weather.cols; c.rain = c.t.map((t, i) => (t >= from * 60 && t < to * 60 ? 1 : 0)); return s; };
  const dryFc = (race) => { const t0 = Math.floor(race.state.t / 300000) * 300000; return { issued: t0, blocks: Array.from({ length: 8 }, (_, j) => ({ from: t0 + j * 900000, to: t0 + (j + 1) * 900000, pRain: 0.05 })) }; };
  for (const seed of seeds) {
    for (const [label, from, to] of [["spell 40–75 min", 40, 75], ["shower 40–44 min", 40, 44]]) {
      const s = wetSc(from, to);
      for (const fc of ["real", "dry"]) {
        let rainLap = null;
        const r = run(s, seed, { ai: true }, { init: (race) => { if (fc === "dry") race.cache.forecastFn = dryFc; }, step: (race) => { if (rainLap == null && race.state.t >= from * 60000) rainLap = race.state.leaderLap; } });
        const inter = r.cars.filter((c) => c.interLap != null);
        const rec = { seed, label, forecast: fc, rainLap, carsOnInters: inter.length, interLap: stats(inter.map((c) => c.interLap - rainLap)), time: stats(r.cars.map((c) => c.time)), stops: stats(r.cars.map((c) => c.stops)) };
        res.rain.push(rec); log(`rain ${label} forecast ${fc} seed ${seed}: rain from leader lap ${rainLap}; cars on inters/wets ${inter.length}; first wet-tyre lap − rain lap ${fmt(rec.interLap)}; race time ${fmt(rec.time)}`);
      }
    }
  }
  fs.writeFileSync(path.join(out, "sens.json"), JSON.stringify(res));
  log("\nSummary");
  for (const k of [0.6, 1, 1.6]) log(`  wear ×${k}: mean stops per car ${fmt(stats(res.wear.filter((w) => w.k === k).map((w) => w.stops.mean)))}`);
  for (const kmh of [60, 80, 100]) log(`  pit limit ${kmh} km/h: mean stops per car ${fmt(stats(res.pit.filter((w) => w.kmh === kmh).map((w) => w.stops.mean)))}`);
  log(`  attack all race vs balanced, Δ race time per car: ${fmt(stats(res.attack.map((a) => a.dTime)))}`);
}
