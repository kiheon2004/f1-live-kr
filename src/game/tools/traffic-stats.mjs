// Traffic validation (request §15, DESIGN §16): full headless races → passes by place and cause, contacts, traffic loss,
// trains; compared with the real race on ONE metric both sides can compute the same way: pairs of cars whose order at
// the line changes between consecutive lap ends (both on the same lap number, neither pitting in either lap, green lap,
// laps ≥ 3). The calibration extract (<id>.calib.json, the real race's laps) is used ONLY here – never by the engine.
//   node src/game/tools/traffic-stats.mjs <scenario.json …> [--seeds 1,2,3] [--json out.json]
import fs from "node:fs";
import { createRace, step } from "../engine/engine.js";
import { TRAFFIC } from "../data/params/traffic.js";
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const files = args.filter((a, i) => a.endsWith(".scenario.json") && !["--seeds", "--json", "--set"].includes(args[i - 1]));
const seeds = opt("--seeds", "1").split(",").map(Number), realPlans = args.includes("--real-plans");
// --real-plans (VALIDATION ONLY): each car gets the stint plan it really ran (from the calibration extract) instead of the
// engine's default one-stop – so the traffic model is judged with the real race's strategy spread (tyre offsets drive many
// real passes). Never used by the game: the engine takes plans from the player / ai.js.
export function plansFromCalib(calib, laps) {
  const out = {};
  for (const [num, d] of Object.entries(calib.drivers || {})) {
    let at = 0; const st = (d.stints || []).map((x) => { at += Math.max(1, x.totalLaps - (x.startLaps || 0)); return { compound: x.compound, toLap: Math.min(laps, at) }; });
    if (st.length) { st[st.length - 1].toLap = laps; out[num] = { stints: st, by: "real (validation)" }; }
  }
  return out;
}
// --set key=value,… : a sensitivity run with traffic coefficients changed (never written back to the params file)
for (const kv of (opt("--set", "") || "").split(",").filter(Boolean)) { const [k, v] = kv.split("="); if (!(k in TRAFFIC)) throw new Error("no traffic param " + k); TRAFFIC[k] = +v; }

// pair swaps per lap from lap-end times: laps[num] = [{ n, tEnd, pit (in-lap), out (out-lap), green }]
export function pairSwaps(laps) {
  const nums = Object.keys(laps), at = {};
  for (const n of nums) { at[n] = new Map(); for (const l of laps[n]) at[n].set(l.n, l); }
  const maxLap = Math.max(...nums.map((n) => Math.max(0, ...laps[n].map((l) => l.n))));
  let swaps = 0, pairsSeen = 0; const perLap = [];
  for (let k = 3; k <= maxLap; k++) {
    let sw = 0;
    const ok = (n) => { const a = at[n].get(k - 1), b = at[n].get(k); return a && b && !a.pit && !a.out && !b.pit && !b.out && b.green !== false; };
    const ns = nums.filter(ok);
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
      const x = ns[i], y = ns[j], o0 = at[x].get(k - 1).tEnd - at[y].get(k - 1).tEnd, o1 = at[x].get(k).tEnd - at[y].get(k).tEnd;
      pairsSeen++; if (o0 * o1 < 0) sw++;
    }
    swaps += sw; perLap.push(sw);
  }
  // how often a car crosses the line within 1 s of the car ahead (same lap, no pit laps): the 'train density'
  let close = 0, all = 0;
  for (let k = 3; k <= maxLap; k++) {
    const ts = nums.map((n) => at[n].get(k)).filter((l) => l && !l.pit && !l.out).map((l) => l.tEnd).sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) { all++; if (ts[i] - ts[i - 1] < 1.0) close++; }
  }
  return { swaps, perLap, laps: perLap.length, perLapMean: perLap.length ? swaps / perLap.length : 0, pairsSeen, within1s: all ? close / all : 0 };
}
export function realLaps(calib) {
  const C = calib.lapCols, I = (k) => C.indexOf(k), out = {};
  for (const [num, d] of Object.entries(calib.drivers)) out[num] = d.laps.map((l) => ({ n: l[I("lap")], tEnd: l[I("tEnd")], pit: !!l[I("pitIn")], out: !!l[I("pitOut")], green: l[I("status")] === "green" })).filter((l) => l.tEnd != null);
  return out;
}
export function engineLaps(race) {
  const out = {};
  for (const c of race.state.cars) {
    // absolute crossing times: back from the last crossing (car.lapT0, ms) – a sum from 0 would start each car's clock at
    // its own first crossing (grid offsets)
    const L = []; let t = c.lapT0 / 1000;
    for (let i = c.laps.length - 1; i >= 0; i--) { const l = c.laps[i]; L.unshift({ n: l.n, tEnd: t, pit: !!l.pit, out: i > 0 && !!c.laps[i - 1].pit, green: true }); t -= l.t; }
    out[c.num] = L;
  }
  return out;
}

if (files.length) {
  const all = [];
  for (const f of files) {
    const sc = JSON.parse(fs.readFileSync(f, "utf8")), cf = f.replace(".scenario.json", ".calib.json");
    const real = fs.existsSync(cf) ? pairSwaps(realLaps(JSON.parse(fs.readFileSync(cf, "utf8")))) : null;
    for (const seed of seeds) {
      const plans = realPlans && fs.existsSync(cf) ? plansFromCalib(JSON.parse(fs.readFileSync(cf, "utf8")), sc.race.laps) : null;
      const t0 = process.hrtime.bigint(), race = createRace({ scenario: sc, seed, plans });
      let n = 0; while (!race.state.finished && race.state.t < 4 * 3600e3) { step(race); n++; }
      const ms = Number(process.hrtime.bigint() - t0) / 1e6, S = race.state, ts = S.tstats || {};
      const eng = pairSwaps(engineLaps(race));
      const mech = {}; for (const e of S.log) if (e.type === "overtake") mech[e.mech] = (mech[e.mech] || 0) + 1;
      const corners = race.cache.tc.corners.map((c) => ({ id: `T${c.id + 1}`, s: Math.round(c.brake0), apex: Math.round(c.apex), pass: c.pass, straight: Math.round(c.straight), dv: +(c.vIn - c.vApex).toFixed(1) }));
      const loss = S.cars.map((c) => c.acct.traffic), lapsRun = S.cars.reduce((a, c) => a + c.lap, 0);
      const row = { id: sc.meta.id, seed, plans: plans ? "real (validation only)" : "engine default", finished: S.finished, simMin: +(S.t / 60000).toFixed(1), wallS: +(ms / 1000).toFixed(2), xReal: Math.round(S.t / ms),
        passes: ts.passes, lapping: ts.lapping, aborts: ts.aborts, defends: ts.defends, blue: ts.blue, contacts: ts.byKind || {}, rearContacts: ts.overlaps,
        byPlace: ts.byCorner, byCause: mech, swapsEngine: eng.swaps, swapsEnginePerLap: +eng.perLapMean.toFixed(2), swapsReal: real?.swaps ?? null, within1sEngine: +eng.within1s.toFixed(3), within1sReal: real ? +real.within1s.toFixed(3) : null, swapsRealPerLap: real ? +real.perLapMean.toFixed(2) : null,
        trafficLossMeanPerLap: +(loss.reduce((a, b) => a + b, 0) / Math.max(1, lapsRun)).toFixed(3), trafficLossMax: +Math.max(...loss).toFixed(1), corners };
      all.push(row);
      console.log(`${row.id} seed ${seed} [plans: ${row.plans}]: ${row.finished ? "finished" : "NOT FINISHED"} ${row.simMin} min, ${row.wallS} s wall (${row.xReal}× real time)`);
      console.log(`  passes ${row.passes} (lapping ${row.lapping}), aborted attempts ${row.aborts}, defensive moves ${row.defends}, blue-flag yields ${row.blue}, contacts ${row.rearContacts} rear, risks ${JSON.stringify(row.contacts)}`);
      console.log(`  pair swaps at the line per lap: engine ${row.swapsEnginePerLap} vs real ${row.swapsRealPerLap} (total ${row.swapsEngine} vs ${row.swapsReal})`);
      console.log(`  share of line crossings within 1 s of the car ahead: engine ${row.within1sEngine} vs real ${row.within1sReal}`);
      console.log(`  by place ${JSON.stringify(row.byPlace)}  by cause ${JSON.stringify(row.byCause)}`);
      console.log(`  passing places: ${corners.filter((c) => c.pass).map((c) => c.id).join(" ")} of ${corners.length} corners; traffic loss ${row.trafficLossMeanPerLap} s/lap mean, max ${row.trafficLossMax} s`);
    }
  }
  if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify(all, null, 1));
}
