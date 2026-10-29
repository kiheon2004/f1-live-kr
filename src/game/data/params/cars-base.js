// Generic (season-wide) car coefficients for the point-mass model (DESIGN §5). They are the starting point of the
// per-team calibration (src/game/tools/calibrate.mjs writes cars-<season>.js with per-team values and provenance);
// a team without a calibrated entry uses these. Teams do not publish any of these numbers: everything that is not a
// regulation figure is a game estimate, shown as such.
//
// Units: CdA, ClA in m² (drag force ½ρ·CdA·v², downforce ½ρ·ClA·v²); mu_mech dimensionless (peak friction of a fresh
// tyre in its window on dry rubbered asphalt: lateral a = μ·(g + downforce/m)); power at the wheels (W).
import { P, values } from "./param.js";

const est = (v, unit, meaning, why, range, conf = "L") => P(v, unit, meaning, "game estimate: " + why, range, true, conf);

function base(season) {
  const is26 = season >= 2026;
  return {
    // minimum car mass incl. driver, without fuel: 2024 798 kg (TR Art. 4.1, Issue 8), 2025 800 kg (TR Art. 4.1, Issue 3),
    // 2026 724 kg + nominal tyre mass (C4.1) = 768 kg as F1.com announced (2024-06-06). Read from the FIA PDFs by the research
    // helper on 2026-10-29: docs/game/research/rules-2024.md, rules-2025.md, rules-2026.md (URLs there).
    m_min: P(is26 ? 768 : season >= 2025 ? 800 : 798, "kg", "minimum mass of car + driver without fuel (the car runs at this mass + fuel)",
      is26 ? "FIA 2026 F1 Regulations Section C Iss 21 (2026-10-19) C4.1: 724 kg + nominal tyre mass; 768 kg per F1.com 2024-06-06 – via docs/game/research/rules-2026.md (2026-10-29)"
        : season >= 2025 ? "FIA 2025 F1 Technical Regulations Iss 3 (2025-04-07) Art. 4.1 – https://www.fia.com/sites/default/files/documents/fia_2025_formula_1_technical_regulations_-_issue_03_-_2025-04-07.pdf (read 2026-10-29, docs/game/research/rules-2025.md)"
        : "FIA 2024 F1 Technical Regulations Iss 8 (2024-10-17) Art. 4.1 – https://www.fia.com/sites/default/files/fia_2024_formula_1_technical_regulations_-_issue_8_-_2024-10-17.pdf (read 2026-10-29, docs/game/research/rules-2024.md)",
      [740, 820], false),
    CdA: est(is26 ? 1.05 : 1.25, "m²", "drag area, wings in their normal (corner) setting",
      "F1 Cd ≈ 0.7–1.0 × frontal area ≈ 1.4–1.5 m²; fit to top speeds by calibrate.mjs. 2026 lower (FIA stated a drag reduction aim for the 2026 cars)", [0.8, 1.7], "M"),
    ClA: est(is26 ? 3.3 : 4.2, "m²", "downforce area (negative lift), wings closed",
      "L/D ≈ 3–4 for a race setup ⇒ ClA ≈ 3.5–5 m²; fit to fast-corner minimum speeds. 2026 ≈ 20–30 % less (FIA aim, not a measured figure)", [2.0, 6.5], "M"),
    mu_mech: est(1.70, "1", "peak tyre–road friction of a fresh dry tyre in its window (the C3-equivalent; compounds scale it in tyres.js)",
      "slow-corner lateral 1.6–2 g in F1 telemetry-derived analyses; fit to slow-corner minimum speeds", [1.3, 2.1], "M"),
    a_brake_max: est(52, "m/s²", "cap on braking deceleration (brake system / driver), on top of the grip limit",
      "peak F1 decelerations ≈ 5–6 g at high speed are widely reported; the cap matters only at the top of the speed range", [35, 65], "M"),
    k_brake: est(1.0, "1", "longitudinal-to-lateral grip ratio in braking (friction ellipse axis)",
      "tyres give similar peak longitudinal and lateral μ; 4-wheel braking uses all of it", [0.8, 1.2], "M"),
    k_trac: est(0.58, "1", "share of the total grip available for traction (rear axle load share, RWD)",
      "rear weight distribution ≈ 54–56 % + rear downforce share; sets low-speed acceleration (fit to corner-exit acceleration)", [0.45, 0.7], "M"),
    f_comb: est(0.25, "1", "longitudinal grip share still available at the lateral limit (floor of the friction ellipse)",
      "combined-slip: peak lateral and longitudinal forces occur at different slips, so a tyre at peak lateral still gives some drive/braking; also makes the integration step-size independent (profile.js comb)", [0, 0.4], "L"),
    P_ice: est(is26 ? 400e3 : 590e3, "W", "ICE power at the wheels at full throttle (fuel-flow limited)",
      "≈ η·ṁ·LHV: ≤2025 100 kg/h × 43 MJ/kg × η≈0.5 ≈ 600 kW; 2026 3000 MJ/h fuel energy × η ≈ 0.48 ≈ 400 kW; minus drivetrain loss; fit to straights", [300e3, 700e3], "M"),
    C_tyre_heat: est(1.0, "1", "car's tyre heat input factor (suspension/aero platform: how hard the car works its tyres)",
      "no public figure; differences between teams appear in stint trends (fit per team when data allow)", [0.8, 1.25], "L"),
    // straight-line wing states (DESIGN §5 + aero.js state). Multipliers on CdA/ClA while the state is active.
    drs: { // 2011–2025 DRS: rear wing upper flap open
      cdaMul: est(0.86, "1", "CdA multiplier with DRS open", "commonly quoted DRS gain 10–15 km/h at the end of a straight ⇒ ≈ 12–18 % drag cut", [0.75, 0.95], "M"),
      claMul: est(0.80, "1", "ClA multiplier with DRS open", "the rear wing gives ≈ 1/3 of downforce; opening the flap removes a large part of it", [0.65, 0.95], "L"),
    },
    straightMode: { // 2026 Active Aero Straight Mode: both wings' flaps open in the marked zones
      cdaMul: est(0.70, "1", "CdA multiplier in Straight Mode (2026)", "front + rear flaps open – larger cut than DRS; FIA quoted a large drag reduction in X/Z-mode discussions; not a measured figure", [0.55, 0.9], "L"),
      claMul: est(0.65, "1", "ClA multiplier in Straight Mode (2026)", "both wings unloaded", [0.45, 0.9], "L"),
    },
  };
}

export const CAR_BASE_TABLE = { 2024: base(2024), 2025: base(2025), 2026: base(2026) };
export const carBase = (season) => values(CAR_BASE_TABLE[season] || CAR_BASE_TABLE[season >= 2026 ? 2026 : 2025]);
