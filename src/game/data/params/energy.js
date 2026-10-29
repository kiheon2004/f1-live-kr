// Fuel and ERS coefficients by season (engine: src/game/engine/energy.js). Regulation figures below are as recalled
// from the FIA Technical/Sporting Regulations and are marked est (conf "M"/"H") until the research helper's notes
// (docs/game/research/) give fetched sources – then `source` gets the URL + date and est becomes false. The structure is
// what matters for the engine: the season decides power, store, per-lap limits and the speed taper; no lap-time offsets.
import { P, values } from "./param.js";

const rule = (v, unit, meaning, art, range, conf = "M") => P(v, unit, meaning, "FIA regulations (recalled, " + art + ") – not yet verified against a fetched copy", range, true, conf);
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
      max: is26 ? est(75, "kg", "fuel a car may start with (2026: set by the energy-flow limit and race length, not a mass rule here)", "teams' ≈ 70 kg race fuel reported pre-season – verify", [60, 110], "L")
        : rule(110, "kg", "maximum fuel on board for the race", "TR Art. 6 / SR fuel quantity", [100, 110]),
      LHV: est(43.0e6, "J/kg", "fuel lower heating value", "gasoline ≈ 42–44 MJ/kg; 2026 sustainable fuel of the same order", [40e6, 45e6], "M"),
      etaIce: est(is26 ? 0.47 : 0.50, "1", "fuel energy → wheel power (ICE + MGU-H effect ≤2025)", "manufacturers claim > 50 % thermal efficiency for the ≤2025 PU; 2026 without MGU-H lower", [0.4, 0.55], "M"),
      flowMax: is26 ? rule(3000e6 / 3600, "W (fuel energy)", "fuel ENERGY flow limit 3000 MJ/h", "2026 PU regulations, fuel energy flow", [700e3, 900e3])
        : rule(100 / 3600 * 43.0e6, "W (fuel energy)", "fuel MASS flow limit 100 kg/h (expressed as energy flow at LHV)", "TR Art. 5.1.4", [1.0e6, 1.3e6]),
    },
    ers: {
      pK: rule(is26 ? 350e3 : 120e3, "W", "MGU-K maximum power (deploy and harvest)", is26 ? "2026 PU regs" : "TR Art. 5.2", [100e3, 400e3], "H"),
      socWindow: rule(4e6, "J", "usable energy store window (max SOC difference)", is26 ? "2026 PU regs" : "TR Art. 5.2", [3e6, 5e6], "H"),
      deployLap: is26 ? est(9e6, "J", "per-lap deploy allowance (2026: no ES→K per-lap limit like ≤2025; bounded by harvest)", "game structure – verify", [4e6, 12e6], "L")
        : rule(4e6, "J", "ES → MGU-K energy per lap", "TR Art. 5.2", [3e6, 5e6], "H"),
      harvestLapK: rule(is26 ? 8.5e6 : 2e6, "J", "MGU-K → ES energy per lap (harvest limit)", is26 ? "2026 PU regs (value under revision during 2026 – verify)" : "TR Art. 5.2", [1e6, 10e6], is26 ? "L" : "H"),
      pH: est(is26 ? 0 : 40e3, "W", "MGU-H harvest into the system while the ICE is at full power (≤2025; no MGU-H in 2026)", "unlimited by the rules; turbo energy ≈ tens of kW", [0, 120e3], "L"),
      regenEff: est(0.8, "1", "braking power → stored energy (MGU-K + inverter + battery)", "electric machine and battery chain efficiency", [0.6, 0.95], "M"),
      overtakeExtra: is26 ? est(0.5e6, "J", "2026 Overtake Mode: extra deploy allowance per lap when eligible (within 1 s)", "recalled 2026 concept – verify", [0, 2e6], "L") : est(0, "J", "no Overtake Mode before 2026", "rule did not exist", [0, 0], "H"),
      // 2026 MGU-K power taper with speed (normal deploy): full up to v1, linear to 0 at v2. ≤2025: none.
      taperV1: is26 ? est(290 / 3.6, "m/s", "speed above which MGU-K power starts to taper (2026)", "recalled 290 km/h – verify", [70, 100], "L") : est(1e9, "m/s", "no MGU-K speed taper ≤2025", "rule did not exist", [1e9, 1e9], "H"),
      taperV2: is26 ? est(355 / 3.6, "m/s", "speed where MGU-K power reaches 0 (2026)", "recalled 355 km/h – verify", [85, 110], "L") : est(1e9, "m/s", "no MGU-K speed taper ≤2025", "rule did not exist", [1e9, 1e9], "H"),
      taperV2ot: is26 ? est(337 / 3.6, "m/s", "Overtake Mode keeps full MGU-K power up to this speed, then tapers to taperV2 (2026)", "recalled 337 km/h – verify", [85, 110], "L") : est(1e9, "m/s", "no Overtake Mode taper before 2026", "rule did not exist", [1e9, 1e9], "H"),
    },
    modes: modes(is26),
  };
}

export const ENERGY_TABLE = { 2024: season(2024), 2025: season(2025), 2026: season(2026) };
export const energyParams = (y) => values(ENERGY_TABLE[y] || ENERGY_TABLE[y >= 2026 ? 2026 : 2025]);
export const ENERGY_MODES = ["harvest", "balanced", "push", "overtake"];
