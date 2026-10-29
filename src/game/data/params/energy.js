// Fuel and ERS coefficients by season (engine: src/game/engine/energy.js). Regulation figures below are as recalled
// from the FIA Technical/Sporting Regulations and are marked est (conf "M"/"H") until the research helper's notes
// (docs/game/research/) give fetched sources – then `source` gets the URL + date and est becomes false. The structure is
// what matters for the engine: the season decides power, store, per-lap limits and the 2026 speed cap; no lap-time offsets.
import { P, values } from "./param.js";

// regulation figures read from the FIA PDFs by the research helper (2026-10-29): docs/game/research/rules-2024.md, -2025.md,
// -2026.md (document URLs and issues there). TR24 = 2024 TR Iss 8, TR25 = 2025 TR Iss 3, C26 = 2026 Section C Iss 21.
const SRC = { 2024: "FIA 2024 F1 TR Iss 8 (2024-10-17)", 2025: "FIA 2025 F1 TR Iss 3 (2025-04-07)", 2026: "FIA 2026 F1 Regulations Section C Iss 21 (2026-10-19)" };
const rule = (v, unit, meaning, art, range, y) => P(v, unit, meaning, `${SRC[y]} ${art} – via docs/game/research/rules-${y}.md (read 2026-10-29)`, range, false);
const est = (v, unit, meaning, why, range, conf = "L") => P(v, unit, meaning, "game estimate: " + why, range, true, conf);

const modes = (is26) => ({
  // deployFrac: share of the MGU-K power used while deploying; socFloor: no deploy below this share of the store;
  // budget: share of the per-lap deploy allowance the mode plans to use (the rest is kept/harvested)
  harvest: { deployFrac: est(0.4, "1", "MGU-K power share while deploying (harvest mode)", "game policy", [0, 1]), socFloor: est(0.55, "1", "no deploy below this state of charge", "game policy", [0, 1]), budget: est(0.5, "1", "share of the per-lap deploy allowance used", "game policy", [0, 1]) },
  balanced: { deployFrac: est(0.75, "1", "MGU-K power share while deploying (balanced)", "game policy", [0, 1]), socFloor: est(0.25, "1", "no deploy below this SOC", "game policy", [0, 1]), budget: est(0.85, "1", "per-lap allowance used", "game policy", [0, 1]) },
  push: { deployFrac: est(1.0, "1", "MGU-K power share while deploying (push)", "game policy", [0, 1]), socFloor: est(0.05, "1", "no deploy below this SOC", "game policy", [0, 1]), budget: est(1.0, "1", "per-lap allowance used", "game policy", [0, 1]) },
  overtake: { deployFrac: est(1.0, "1", "MGU-K power share (overtake: everything now)", "game policy", [0, 1]), socFloor: est(0.0, "1", "no deploy below this SOC", "game policy", [0, 1]), budget: est(1.0, "1", "per-lap allowance used (+ the 2026 Overtake Mode extra when eligible)", "game policy", [0, 1]) },
});

function season(y) {
  const is26 = y >= 2026;
  return {
    fuel: {
      // no race fuel cap found in the TR text for any of the three seasons (research notes) – the cap is a game estimate
      max: is26 ? est(75, "kg", "fuel a car starts the race with at most (game cap; 2026 has no mass rule – the energy-flow limit and race length set it)", "≈ 70 kg 2026 race fuel reported in pre-season media – not a rule", [60, 110], "L")
        : est(110, "kg", "fuel a car starts the race with at most (game cap)", "the commonly quoted 110 kg was NOT found in the 2024/2025 TR text (research notes) – kept as the game's cap", [100, 110], "M"),
      LHV: est(43.0e6, "J/kg", "fuel lower heating value", "gasoline ≈ 42–44 MJ/kg; 2026 sustainable fuel of the same order", [40e6, 45e6], "M"),
      etaIce: est(is26 ? 0.47 : 0.50, "1", "fuel energy → wheel power (ICE + MGU-H effect ≤2025)", "manufacturers claim > 50 % thermal efficiency for the ≤2025 PU; 2026 without MGU-H lower", [0.4, 0.55], "M"),
      flowMax: is26 ? rule(3000e6 / 3600, "W (fuel energy)", "fuel ENERGY flow limit 3000 MJ/h", "C5.2.3–C5.2.5", [700e3, 900e3], y)
        : P(100 / 3600 * 43.0e6, "W (fuel energy)", "fuel MASS flow limit 100 kg/h (TR 5.2.3–5.2.5), expressed as energy flow at the estimated LHV", `${SRC[y]} 5.2.3–5.2.5 (100 kg/h, read 2026-10-29) × LHV estimate`, [1.0e6, 1.3e6], false),
    },
    ers: {
      pK: rule(is26 ? 350e3 : 120e3, "W", "MGU-K maximum power (deploy and harvest)", is26 ? "C5.2.7" : "5.3.2 ERS flow chart", [100e3, 400e3], y),
      socWindow: rule(4e6, "J", "usable energy store window (max SOC difference)", is26 ? "C5.2.9" : "5.3.2 ERS flow chart", [3e6, 5e6], y),
      deployLap: is26 ? est(12.5e6, "J", "per-lap deploy allowance (2026 has no ES→K per-lap limit; what can be spent is the recharge (8.5 MJ) + the 4 MJ window)", "game structure from C5.2.9/C5.2.10", [4e6, 13e6], "M")
        : rule(4e6, "J", "ES → MGU-K energy per lap", "5.3.2 ERS flow chart", [3e6, 5e6], y),
      harvestLapK: rule(is26 ? 8.5e6 : 2e6, "J", "MGU-K → ES energy per lap (harvest limit; 2026: FIA may lower to 7 MJ per event)", is26 ? "C5.2.10" : "5.3.2 ERS flow chart", [1e6, 10e6], y),
      pH: est(is26 ? 0 : 40e3, "W", "MGU-H harvest into the system while the ICE is at full power (≤2025; no MGU-H in 2026)", "unlimited by the rules; turbo energy ≈ tens of kW", [0, 120e3], "L"),
      regenEff: est(0.8, "1", "braking power → stored energy (MGU-K + inverter + battery)", "electric machine and battery chain efficiency", [0.6, 0.95], "M"),
      overtakeExtra: is26 ? rule(0.5e6, "J", "2026 Overtake: +0.5 MJ recharge allowance on a lap that starts with Overtake active", "C5.2.10 iii, B7.2.1b v", [0, 2e6], y) : est(0, "J", "no Overtake Mode before 2026", "rule did not exist", [0, 0], "H"),
      // 2026 MGU-K power cap vs speed (C5.2.8, C5.2.10): normal P ≤ 1800 − 5·v kW (v in km/h, below 340 km/h; 0 above),
      // Overtake P ≤ 7100 − 20·v kW (0 at 355 km/h). ⇒ 350 kW up to 290 km/h normally, 337.5 km/h in Overtake. ≤2025: none.
      capA: is26 ? rule(1800e3, "W", "normal MGU-K cap intercept: P ≤ capA − capB·v_kmh", "C5.2.8", [1000e3, 3000e3], y) : est(1e12, "W", "no speed cap ≤2025", "rule did not exist", [1e12, 1e12], "H"),
      capB: is26 ? rule(5e3, "W per km/h", "normal MGU-K cap slope", "C5.2.8", [0, 50e3], y) : est(0, "W per km/h", "no speed cap ≤2025", "rule did not exist", [0, 0], "H"),
      capCut: is26 ? rule(340, "km/h", "normal MGU-K cap: no deployment at or above this speed", "C5.2.8", [300, 400], y) : est(1e9, "km/h", "no speed cut ≤2025", "rule did not exist", [1e9, 1e9], "H"),
      otA: is26 ? rule(7100e3, "W", "Overtake MGU-K cap intercept: P ≤ otA − otB·v_kmh", "C5.2.10", [1000e3, 9000e3], y) : est(1e12, "W", "no Overtake ≤2025", "rule did not exist", [1e12, 1e12], "H"),
      otB: is26 ? rule(20e3, "W per km/h", "Overtake MGU-K cap slope (0 at 355 km/h)", "C5.2.10", [0, 50e3], y) : est(0, "W per km/h", "no Overtake ≤2025", "rule did not exist", [0, 0], "H"),
    },
    modes: modes(is26),
  };
}

export const ENERGY_TABLE = { 2024: season(2024), 2025: season(2025), 2026: season(2026) };
export const energyParams = (y) => values(ENERGY_TABLE[y] || ENERGY_TABLE[y >= 2026 ? 2026 : 2025]);
export const ENERGY_MODES = ["harvest", "balanced", "push", "overtake"];
