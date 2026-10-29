// The pre-race screen's strategy numbers (request §12), computed off the edit path: every edit asks for its numbers, but
// the work waits until the edits stop for a moment (debounce), is cut into pieces that each run in their own task (the
// page stays responsive), and a newer request makes an older one stale (generation counter: its results are dropped,
// never painted over newer ones). Results are cached by their inputs – back to an earlier plan is instant.
//
// Every number is the ENGINE's strategy estimator (src/game/engine/strategy.js): the team's own model of the race, with
// what the team may know before the start (no future weather truth, no real results). Nothing here steps a race.
//   recommend  preRaceStrategy(race, team) – the estimator's best plan per car, its alternatives, the pit-loss estimate,
//              the season's rule, the team's pit conflicts, the forecast (computed once per race/seed/team)
//   evalPlan   the player's own plan through the same model and the same seeded scenarios: mean race time, spread
//              (sd, 10–90 %), and per stop the window of in-laps within +2 s of the best lap for that stop (others fixed)
// A race created for the estimates (createRace without the team AI) is kept per race/seed/team; it is never stepped.
import { ranges } from "./planedit.js";

const WINDOW_S = 2, SHIFT = 8;

export function createEstimator({ engine, strat, delay = 300, later = (f) => setTimeout(f, 0), onChange = () => {} }) {
  const cache = new Map(), races = new Map();
  let gen = 0, timer = 0;
  const E = { stats: { runs: 0, stale: 0, hits: 0, ms: 0 }, status: "idle", err: null };

  const raceFor = (sc, seed, team) => {
    const k = `${sc.meta.id}|${seed}|${team}`;
    if (!races.has(k)) { if (races.size > 4) races.delete(races.keys().next().value); races.set(k, engine.createRace({ scenario: sc, seed, userTeam: team })); }
    return races.get(k);
  };
  const ctxKey = (sc, seed, team) => `${sc.meta.id}|${seed}|${team}`;

  // one plan through the team's model: { mean, sd, p10, p90, stops: [{ lap, window: [lo, hi] }] }
  function evalPlan(race, team, num, plan) {
    const S = strat, M = S.teamModel(race, team), est = { g: 1, off: {}, lane: M.lanePrior, stintLife: {} };
    const view = S.publicView(race, team); view.lapS = S.ltOfMu(M, 0.95 * M.muTrack * M.pace);
    const scns = S.scenarios(M, est, view, "pre"), total = race.state.totalLaps;
    const st = { num, lap: 0, total, cur: null, used: [], sets: 0 };
    const R = ranges(plan), mode0 = plan.pace && plan.pace !== "auto" ? plan.pace : "balanced";
    const cand = (lens) => ({ stints: R.map((r, i) => ({ compound: r.compound, laps: lens[i], mode: i === 0 ? mode0 : "balanced" })) });
    const lens = R.map((r) => r.laps);
    const [base] = S.evaluate(M, est, st, [cand(lens)], scns);
    // the window of each stop: that stop moved ±SHIFT laps (the next stint takes up the difference), others fixed
    const stops = [];
    for (let k = 0; k < R.length - 1; k++) {
      const shifted = [], ds = [];
      for (let d = -SHIFT; d <= SHIFT; d++) { const l = lens.slice(); l[k] += d; l[k + 1] -= d; if (l[k] >= 1 && l[k + 1] >= 1) { shifted.push(cand(l)); ds.push(d); } }
      const ev = S.evaluate(M, est, st, shifted, scns), best = Math.min(...ev.map((x) => x.mean));
      const okD = ds.filter((d, i) => ev[i].mean - best <= WINDOW_S), at = R[k].to;
      const bestD = ds[ev.findIndex((x) => x.mean === best)];
      stops.push({ lap: at, window: okD.length ? [at + Math.min(...okD), at + Math.max(...okD)] : null, bestLap: at + bestD, vsBest: +(base.mean - best).toFixed(1) });
    }
    return { mean: base.mean, sd: base.sd, p10: base.p10, p90: base.p90, stops, mode0 };
  }

  const piece = (g, fn) => new Promise((res, rej) => later(() => { if (g !== gen) { E.stats.stale++; return rej(STALE); } try { res(fn()); } catch (e) { rej(e); } }));

  // ask for the numbers of this situation: { sc, seed, team, plans: { num: plan } } – answers come through onChange()
  E.want = (q) => { clearTimeout(timer); const g = ++gen; E.status = "waiting"; timer = setTimeout(() => run(g, q), delay); onChange(E); };
  E.get = (sc, seed, team) => cache.get("rec|" + ctxKey(sc, seed, team)) || null;
  E.planOf = (sc, seed, team, num, plan) => cache.get(`plan|${ctxKey(sc, seed, team)}|${num}|${planSig(plan)}`) || null;
  E.cancel = () => { gen++; clearTimeout(timer); E.status = "idle"; };
  async function run(g, { sc, seed, team, plans }) {
    const t0 = performance.now(), ck = ctxKey(sc, seed, team);
    E.status = "computing"; E.err = null; onChange(E);
    try {
      const race = await piece(g, () => raceFor(sc, seed, team));
      if (!cache.has("rec|" + ck)) {
        const rec = await piece(g, () => { try { return { ok: true, v: strat.preRaceStrategy(race, team) }; } catch (e) { return { ok: false, err: String(e.message || e) }; } });
        cache.set("rec|" + ck, rec); onChange(E);
      } else E.stats.hits++;
      for (const num of Object.keys(plans)) {
        const k = `plan|${ck}|${num}|${planSig(plans[num])}`;
        if (cache.has(k)) { E.stats.hits++; continue; }
        const r = await piece(g, () => { try { return { ok: true, v: evalPlan(race, team, num, plans[num]) }; } catch (e) { return { ok: false, err: String(e.message || e) }; } });
        cache.set(k, r); if (cache.size > 400) cache.delete(cache.keys().next().value);
        onChange(E);
      }
      if (g === gen) { E.status = "done"; E.stats.runs++; E.stats.ms = Math.round(performance.now() - t0); onChange(E); }
    } catch (e) {
      if (e === STALE) return;
      if (g === gen) { E.status = "failed"; E.err = String(e?.message || e); onChange(E); }
    }
  }
  return E;
}
const STALE = { stale: true };
// what changes a plan's numbers: its stints and the first stint's pace mode (not the energy mode / assist: the model
// has no energy term – said on screen)
const planSig = (p) => `${p.stints.map((s) => `${s.compound}:${s.toLap}`).join(",")}|${p.pace || "-"}`;
