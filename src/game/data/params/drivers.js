// Driver model coefficients (DESIGN §6; engine: src/game/engine/driver.js). ALL game estimates (est: true): no public
// source quantifies a driver's "utilisation" of the car. Per-driver tables (drivers-<season>.js, scenario/lead) override
// pace/consistency/tyreMgmt/wet within the ranges here. The car sets the limits (μ, ClA, power); the driver only sets how
// much of them is used – the two never scale the same term twice.
import { P, values } from "./param.js";

const est = (v, unit, meaning, why, range, conf = "L") => P(v, unit, meaning, "game estimate: " + why, range, true, conf);

export const DRIVER_DEFAULT_TABLE = {
  pace: est(0.993, "1", "mean utilisation of the car's grip (μ_eff multiplier) in balanced mode", "0.985–1.000 spread ≈ 0.3–0.6 s/lap between drivers in the same car", [0.985, 1.0]),
  consistency: est(0.002, "1", "σ of the AR(1) utilisation variation", "lap-to-lap σ of clean race laps ≈ 0.1–0.3 s", [0.0005, 0.006]),
  tau: est(8, "s", "AR(1) time constant of the utilisation variation (ρ = exp(−DT/τ))", "variation persists over a corner sequence, not per step (요청 §6)", [2, 40]),
  tyreMgmt: est(1.0, "1", "tyre heat factor of the driving style (1 = typical; < 1 kinder to tyres)", "per-driver estimate", [0.85, 1.15]),
  wet: est(1.0, "1", "utilisation multiplier in the wet (scaled by water depth)", "per-driver estimate", [0.97, 1.01]),
  racecraft: est(0.5, "1", "overtaking/defending judgement (traffic.js)", "per-driver estimate", [0, 1]),
  compliance: est(0.8, "1", "tendency to follow team orders (ai.js / commands)", "per-driver estimate", [0, 1]),
};

// pace modes (요청 §8). util: multiplier on the driver's utilisation (attack pushes μ use toward the limit; manage backs
// off), heat: extra tyre work factor of the style (sliding/aggressive kerbs beyond what the higher speeds already put in –
// the higher accelerations of attack already raise Q through the physics). Energy is a SEPARATE command (energy.js modes).
export const PACE_MODE_TABLE = {
  attack: { util: est(1.008, "1", "utilisation multiplier (attack)", "≈ +0.2–0.3 s/lap vs balanced", [1.0, 1.015]), heat: est(1.08, "1", "tyre heat factor (attack)", "sliding/aggression", [1.0, 1.5]) },
  balanced: { util: est(1.0, "1", "utilisation multiplier (balanced)", "reference", [1, 1]), heat: est(1.0, "1", "tyre heat factor (balanced)", "reference", [1, 1]) },
  manage: { util: est(0.992, "1", "utilisation multiplier (manage)", "≈ 0.3–0.4 s/lap slower than balanced", [0.98, 1.0]), heat: est(0.90, "1", "tyre heat factor (manage)", "smoother inputs, less sliding", [0.6, 1.0]) },
};
export const DRIVER_DEFAULT = values(DRIVER_DEFAULT_TABLE);
export const PACE_MODES = values(PACE_MODE_TABLE);
// utilisation can't exceed 1 (the car's limit) – the hard cap; and never below this floor (numerical safety)
export const UTIL_MAX = 1.0, UTIL_MIN = 0.9;
