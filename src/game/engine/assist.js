// The player's goal assist (v0.50 request §5-1): the player sets a GOAL for a car (keep the pace / attack the car ahead /
// defend from the car behind / manage the tyres to a lap / bank energy) instead of switching modes every lap; this module
// turns it into the same pace / energy orders the player could send, through the engine's order door with the actor
// "goal:<team>" (validated like any order; never another team's car; never the player's name – an assist order doesn't
// take the control away from the assist). No lap-time bonus and no forced pass: the orders are the existing modes, and
// what they do is the car / tyre / energy models' (attack wears the tyres, push empties the battery…).
//
// Inputs: the car's own state (tyre wear and temperatures, battery, its plan), the public gaps (timing-line passes:
// engine.js lineGapOf), the flag. Never rivals' tyres / fuel / modes, never the weather truth ahead.
//
// Per goal (cadence: looked at every EVAL_MS of sim time; an order of a kind at most every MIN_GAP_MS; bands with
// hysteresis so a value on a border doesn't flip the mode every look):
//   keep    pace balanced, energy balanced                                                      – stays active
//   attack  the car ahead within ATT.near s: pace attack (tyre life > ATT.lifeMin), within ATT.push s and battery above
//           ATT.socOn: energy push (off below ATT.socOff); farther than ATT.far s: balanced, "following"
//           blocked: no car ahead (leading), no gap data yet, tyres at their limit, battery low
//   defend  the car behind within DEF.near s: energy push (battery above DEF.socOn), pace attack when within DEF.close
//           and tyre life allows; farther than DEF.far: balanced (and harvest when the battery is under DEF.bank)
//   tyre    to the target lap (the goal's toLap, else the plan's next stop, else the finish): the wear projected there at
//           the car's own recent wear per lap; above the compound's cliff start less a margin → manage; well below →
//           balanced; overheating (window temperature above the window) → manage. "done" once the lap is reached
//   save    energy harvest until the battery reaches SAVE.target, then balanced
// Under SC / VSC / red flag or in the pit lane the goal waits (no orders) and carries on after.
// State: car.goal (engine state, saved): { kind, toLap, state: active|waiting|blocked|done, why: { code, … }, since, at,
// sent: { pace: t, energy: t } }.
import { commandAs, lineGapOf } from "./engine.js";   // (a cycle engine ↔ assist: called at run time only)
import { COMPOUNDS } from "../data/params/tyres.js";
import { windowTemp } from "./tyre.js";

export const EVAL_MS = 2000, MIN_GAP_MS = 8000;
export const ATT = { near: 3.0, push: 1.2, far: 4.0, lifeMin: 0.25, socOn: 0.45, socOff: 0.25 };
export const DEF = { near: 1.2, close: 0.8, far: 2.0, socOn: 0.35, bank: 0.6, lifeMin: 0.3 };
export const SAVE = { target: 0.85, low: 0.75 };
export const TYRE = { margin: 0.05, band: 0.12, hot: 5 };

export function assistStep(race) {
  const S = race.state; if (!S.own || S.finished || S.phase === "grid") return;
  for (const num in S.own) {
    const car = S.cars.find((c) => c.num === num), g = car?.goal; if (!g || car.status !== "run") continue;
    if (S.t - g.at < EVAL_MS) continue;
    g.at = S.t;
    const want = decide(race, car, g);
    for (const k of ["pace", "energy"]) {
      const m = want[k]; if (!m || S.own[num][k] !== "goal") continue;
      const cur = k === "pace" ? car.mode.pace : car.mode.energy;
      if (m === cur || S.t - (g.sent[k] ?? -1e9) < MIN_GAP_MS) continue;
      g.sent[k] = S.t;
      commandAs(race, { id: `goal:${num}:${k}:${S.t}`, type: k, car: num, args: { mode: m } }, "goal:" + car.teamKey);
    }
  }
}

// { pace?, energy? } for now, and the goal's state / reason set on g
function decide(race, car, g) {
  const S = race.state, flag = S.control?.flag || "green";
  const set = (state, why, out = {}) => { g.state = state; g.why = why; return out; };
  if (flag === "sc" || flag === "vsc" || flag === "red") return set("waiting", { code: "flag", flag });
  if (car.where !== "lap") return set("waiting", { code: "inPit" });
  const soc = car.energy.soc / race.cache.ep.ers.socWindow, life = 1 - car.tyre.wear;
  const order = S.order.filter((n) => S.cars.find((c) => c.num === n).status !== "dnf"), i = order.indexOf(car.num);
  const ahead = i > 0 ? S.cars.find((c) => c.num === order[i - 1]) : null, behind = i >= 0 && i < order.length - 1 ? S.cars.find((c) => c.num === order[i + 1]) : null;
  const curE = car.mode.energy, curP = car.mode.pace;
  switch (g.kind) {
    case "keep": return set("active", { code: "keep" }, { pace: "balanced", energy: "balanced" });
    case "attack": {
      if (!ahead) return set("blocked", { code: "leading" }, { pace: "balanced", energy: "balanced" });
      const gap = lineGapOf(car, ahead);
      if (gap == null) return set("waiting", { code: "noGap" });
      if (gap > ATT.far) return set("waiting", { code: "far", gap: +gap.toFixed(1), car: ahead.num }, { pace: "balanced", energy: soc < ATT.socOn ? "harvest" : "balanced" });
      const pace = life > ATT.lifeMin && gap <= ATT.near ? "attack" : "balanced";
      const pushOk = curE === "push" ? soc > ATT.socOff : soc > ATT.socOn;
      const energy = gap <= ATT.push && pushOk ? "push" : soc < ATT.socOff ? "harvest" : "balanced";
      const why = life <= ATT.lifeMin ? { code: "tyreLimit", life: +life.toFixed(2) } : gap <= ATT.push && !pushOk ? { code: "lowBattery", soc: +soc.toFixed(2) } : { code: "attack", gap: +gap.toFixed(1), car: ahead.num };
      return set(why.code === "attack" ? "active" : "blocked", why, { pace, energy });
    }
    case "defend": {
      if (!behind) return set("blocked", { code: "last" }, { pace: "balanced", energy: "balanced" });
      const gap = lineGapOf(behind, car);
      if (gap == null) return set("waiting", { code: "noGap" });
      if (gap > DEF.far) return set("waiting", { code: "far", gap: +gap.toFixed(1), car: behind.num }, { pace: "balanced", energy: soc < DEF.bank ? "harvest" : "balanced" });
      const pushOk = curE === "push" ? soc > DEF.socOn - 0.1 : soc > DEF.socOn;
      const energy = gap <= DEF.near && pushOk ? "push" : "balanced";
      const pace = gap <= DEF.close && life > DEF.lifeMin ? "attack" : "balanced";
      return set(gap <= DEF.near && !pushOk ? "blocked" : "active", gap <= DEF.near && !pushOk ? { code: "lowBattery", soc: +soc.toFixed(2) } : { code: "defend", gap: +gap.toFixed(1), car: behind.num }, { pace, energy });
    }
    case "tyre": {
      const ns = (car.plan?.stints || []).find((x, k, a) => x.toLap > car.lap && k < a.length - 1), target = g.toLap ?? ns?.toLap ?? S.totalLaps;
      if (car.lap >= target) return set("done", { code: "reached", lap: target });
      const rate = wearRate(car), cp = COMPOUNDS[car.tyre.compound], cliff = (cp?.wc ?? 0.7) - TYRE.margin, n = target - car.lap;
      const Tw = windowTemp(car.tyre), hot = cp && Tw > cp.winHi + TYRE.hot;
      if (rate == null && !hot) return set("waiting", { code: "learning", toLap: target }, {});
      const proj = car.tyre.wear + (rate ?? 0) * n;
      const pace = hot || proj > cliff ? "manage" : proj < cliff - TYRE.band ? "balanced" : curP === "attack" ? "balanced" : curP;
      return set("active", { code: hot ? "hot" : "tyre", toLap: target, proj: +proj.toFixed(2), cliff: +cliff.toFixed(2), laps: n }, { pace });
    }
    case "save": {
      const energy = soc >= SAVE.target ? "balanced" : curE === "balanced" && soc >= SAVE.low ? "balanced" : "harvest";
      return set("active", { code: soc >= SAVE.target ? "saved" : "saving", soc: +soc.toFixed(2), target: SAVE.target }, { energy, pace: curP });
    }
  }
  return set("blocked", { code: "unknown" });
}
// the car's own wear per lap over its last clean laps (lap records: wear at each line); null before two clean laps
function wearRate(car) {
  const L = car.laps, xs = [];
  for (let i = L.length - 1; i > 0 && xs.length < 3; i--) { if (L[i].pit || L[i - 1].pit || L[i].compound !== car.tyre.name || L[i - 1].compound !== car.tyre.name) break; xs.push(L[i].wear - L[i - 1].wear); }
  if (xs.length < 2) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
