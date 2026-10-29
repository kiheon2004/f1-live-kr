// Physical constants and environment-model coefficients (not car- or team-specific).
import { P, values } from "./param.js";

export const PHYS_TABLE = {
  g: P(9.80665, "m/s²", "standard gravity", "ISO 80000-3 standard value (definition)", [9.80665, 9.80665], false),
  Rair: P(287.05, "J/(kg·K)", "specific gas constant of dry air (ρ = p / (R·T))", "standard thermodynamic value", [287.0, 287.1], false),
  pStd: P(101325, "Pa", "air pressure when the scenario has none (sea level)", "ISA sea-level standard (definition)", [70000, 105000], false),
  Crr: P(0.015, "1", "rolling resistance coefficient of a racing slick on asphalt (F_rr = Crr·m·g, load from weight only)",
    "game estimate: road-car tyres 0.008–0.012; a hot slick at racing slip is higher. Small next to drag (≈120 N vs ≈10 kN at 90 m/s), so lap time is insensitive to it", [0.008, 0.03], true, "L"),
  vMax: P(110, "m/s", "numerical cap on the corner speed limit where downforce makes the corner flat-out (|κ| below the aero limit)",
    "game choice: above any F1 top speed (≈ 100 m/s); the drive/drag balance sets the real top speed", [100, 130], true, "H"),
};
export const PHYS = values(PHYS_TABLE);

// air density from temperature (°C) and pressure (Pa; the feed's WeatherData gives mbar → ×100). Dry air: humidity
// lowers ρ by < 1 % at race temperatures (ignored, inside the calibration error).
export const airDensity = (tC = 25, pPa = PHYS.pStd) => pPa / (PHYS.Rair * (273.15 + tC));
