// Tyre model coefficients (DESIGN §7; engine: src/game/engine/tyre.js).
// Pirelli publishes compound names (C1 hardest … C5/C6 softest), the allocation per event and blanket/pressure
// prescriptions per event, but not friction, wear or thermal coefficients. Everything numeric here is a game estimate
// (est: true) set to give the right ORDER and the right qualitative behaviour, then tuned by calibrate.mjs to the stint
// lap-time trends of the calibration races (provenance written into tyres-<season>.js when a fit exists).
import { P, values } from "./param.js";

const est = (v, unit, meaning, why, range, conf = "L") => P(v, unit, meaning, "game estimate: " + why, range, true, conf);

// ---- thermal: two nodes (surface tread, core/carcass) -------------------------------------------------------------
// Why two and not one or more: one node cannot tell a short spike (one hard lap, a slide: surface hot for seconds) from
// a sustained overheat (core hot for minutes) – the request's "overheating loses grip reversibly; long overheating wears"
// needs both time scales. A third node (rim/gas/brake heat) would need pressures and brake-duct data that no public source
// gives; it would be precision we can't identify (요청 §7: don't multiply unidentifiable coefficients).
export const TYRE_THERMAL_TABLE = {
  kq: est(0.0095, "°C/s per m²/s³", "surface heating per unit of specific tyre work Q = (|a_lat|+|a_long|)·v·factors",
    "set so that a dry racing lap on the real 2025 tracks holds the window temperature ≈ 85–108 °C, inside the race compounds' windows (v0.48: 0.016 – tuned on a generic track – held real tracks at 115–140 °C, past every window, so tyres overheated all race)", [0.004, 0.02]),
  ha0: est(0.02, "1/s", "surface→air convective cooling at standstill", "time constant of tens of seconds when parked", [0.005, 0.05]),
  ha1: est(0.0015, "1/s per m/s", "extra surface→air cooling per m/s of speed (forced convection)", "≈ 9 s surface time constant at 60 m/s", [0.0005, 0.004]),
  hr: est(0.03, "1/s", "surface→track conduction (contact patch)", "same order as convection at racing speeds", [0.01, 0.08]),
  hsc: est(0.05, "1/s", "surface→core conduction rate (surface side)", "surface follows core within ~20 s when unloaded", [0.02, 0.12]),
  hcs: est(0.02, "1/s", "core←surface conduction rate (core side; core has more heat capacity)", "core time constant ≈ 1 min", [0.008, 0.05]),
  hcl: est(0.004, "1/s", "core→ambient loss (rim, internal air)", "core cools over minutes when parked", [0.001, 0.01]),
  hw: est(0.10, "1/s per mm", "extra surface cooling per mm of water film (spray, evaporation)", "wet running cools slicks quickly (they leave the window: the known 'slicks too early' problem)", [0.03, 0.3]),
  wSurf: est(0.6, "1", "weight of the surface in the window temperature T_w = w·Ts + (1−w)·Tc", "grip is made at the tread surface, the carcass sets its stiffness", [0.3, 0.9]),
  Tlo: P(-10, "°C", "lower clamp of tyre temperatures (numerical safety)", "game choice (below any racing ambient)", [-20, 0], true, "H"),
  Thi: P(160, "°C", "upper clamp of tyre temperatures (numerical safety)", "game choice (above any reported racing tyre temperature)", [140, 200], true, "H"),
};

// ---- compounds ----------------------------------------------------------------------------------------------------
// muRel: dry peak μ relative to the car's mu_mech (which is a C3-equivalent tyre). Adjacent C-steps ≈ 1 % μ ≈ 0.3–0.4 s on
// a 90 s lap in this model (profile sensitivity measured: −0.30 s per +1 % μ on a 72 s generic lap) – the order of the
// soft/medium/hard gaps seen in race stints.
// win: [lo, hi] window temperature range °C (full grip inside); cold/hot: grip lost at 30 °C outside (fraction);
// kw: wear per unit of tyre work (1/(m²/s³·s)); d1, wc, d2: grip vs wear Gw = 1 − d1·w − d2·max(0, w − wc)²;
// water: h0 (mm), n, floor – suitability S(h) = floor + (1 − floor)/(1 + (h/h0)^n); dryHeat/dryWear: multipliers of heat and
// wear on a dry surface (tread blocks squirm and overheat) – 1 for slicks.
function compound(muRel, win, kw, opts = {}) {
  const o = { cold: 0.10, hot: 0.08, d1: 0.035, wc: 0.75, d2: 2.0, h0: 0.35, n: 2, floor: 0.45, dryHeat: 1, dryWear: 1, ...opts };
  return {
    muRel: est(muRel, "1", "dry peak μ relative to the car's mu_mech (C3 = 0.975…1.0 scale)", "ordering from Pirelli's hard→soft naming; size ≈ 1 % per step", [0.85, 1.05], "M"),
    winLo: est(win[0], "°C", "window lower edge", "softer compounds work at lower temperatures (Pirelli's low/high working-range families); values not published per compound", [40, 120]),
    winHi: est(win[1], "°C", "window upper edge (above: reversible grip loss and faster wear)", "as winLo", [70, 140]),
    cold: est(o.cold, "1", "grip lost 30 °C below the window (Gaussian side)", "cold tyres slide; out-laps are seconds slower", [0.03, 0.3]),
    hot: est(o.hot, "1", "grip lost 30 °C above the window (Gaussian side)", "overheated tread loses grip until it cools", [0.03, 0.3]),
    kw: est(kw, "1/(m²/s³·s)", "wear per unit of tyre work at window temperature", "scaled (v0.48) so the model's wear at the 90th-percentile real stint length of the 2025 dry races is ≈ 0.8 (median over 21 races, the race's medium compound; soft/hard spread compressed a little: C5/C6 ran out sooner, C1/C2 later than real) – a coarse fit, not a per-track calibration", [3e-8, 2e-6]),
    kH: est(o.kH ?? 0.6, "1 per 10 °C", "wear multiplier slope above the window (H = 1 + kH·ΔT/10): the irreversible part of overheating", "thermal degradation of the compound", [0.1, 2]),
    d1: est(o.d1, "1", "grip lost linearly from new to fully worn tread", "fit to stint lap-time trends", [0, 0.1]),
    wc: est(o.wc, "1", "wear where the 'cliff' starts", "grip falls faster when the tread is nearly gone", [0.5, 0.95]),
    d2: est(o.d2, "1", "cliff strength (quadratic beyond wc)", "v0.48: 2.0 (was 0.6) – a fully worn set loses ≈ 16 % grip, seconds a lap, so running past the cliff costs more than the stop (with 0.6 a worn tyre was only ≈ 2 s/lap slower and attacking to the end paid)", [0, 4]),
    h0: est(o.h0, "mm", "water film depth where the compound has lost half of its water-sensitive grip", "slick < inter < wet; crossovers ≈ 0.12 mm (slick/inter) and ≈ 1.5 mm (inter/wet) in this model", [0.1, 8], "L"),
    n: est(o.n, "1", "steepness of the water suitability curve", "shape choice",  [1, 4]),
    floor: est(o.floor, "1", "grip fraction left in deep water (relative to dry)", "set with h0 so the compound crossovers fall at plausible depths", [0.2, 0.8]),
    dryHeat: est(o.dryHeat, "1", "heat multiplier on a dry surface (grooved tread squirms)", "inters/wets overheat on a drying track", [1, 3]),
    dryWear: est(o.dryWear, "1", "wear multiplier on a dry surface", "inters/wets are destroyed on a dry track within laps", [1, 8]),
    kind: o.kind || "slick",
  };
}
export const COMPOUND_TABLE = {
  C1: compound(0.960, [100, 128], 1.6e-7, { hot: 0.07 }),
  C2: compound(0.968, [95, 124], 2.0e-7),
  C3: compound(0.977, [90, 118], 2.25e-7),
  C4: compound(0.986, [85, 113], 2.9e-7),
  C5: compound(0.995, [80, 108], 3.3e-7, { hot: 0.09 }),
  C6: compound(1.002, [78, 104], 3.8e-7, { hot: 0.10 }),
  INTERMEDIATE: compound(0.925, [55, 95], 2.5e-7, { h0: 2.5, floor: 0.50, dryHeat: 1.5, dryWear: 3.0, kind: "inter", cold: 0.08 }),
  WET: compound(0.88, [45, 85], 2.5e-7, { h0: 3.0, floor: 0.60, dryHeat: 1.9, dryWear: 5.0, kind: "wet", cold: 0.07 }),
};
// race names → C numbers are per event (the scenario's allocation); these are just the commonly used defaults for tests
export const DEFAULT_ALLOCATION = { HARD: "C2", MEDIUM: "C3", SOFT: "C4", INTERMEDIATE: "INTERMEDIATE", WET: "WET" };

// tyre blanket temperature limits (°C) – the out-lap starts from these (core and surface)
// 2024/2025: 70 °C front and rear for slicks; intermediates allowed blankets; full wets run without blankets since the
// 2023 non-blanket wet. These are recalled, NOT yet checked against a fetched Pirelli/FIA document → est until the
// research notes (docs/game/research/) confirm or correct them. 2026: blankets retained (the planned ban was dropped) – est.
export const BLANKET_TABLE = {
  2024: { slick: est(70, "°C", "max blanket temperature, slicks", "recalled FIA/Pirelli 2024 prescription – verify", [50, 100], "M"), inter: est(60, "°C", "blanket temperature, inters", "recalled", [40, 80], "L"), wet: est(null, "°C", "full wets: no blankets (ambient)", "recalled: non-blanket wet since 2023", [null, null], "M") },
  2025: { slick: est(70, "°C", "max blanket temperature, slicks", "recalled – verify", [50, 100], "M"), inter: est(60, "°C", "blanket temperature, inters", "recalled", [40, 80], "L"), wet: est(null, "°C", "full wets: no blankets", "recalled", [null, null], "M") },
  2026: { slick: est(70, "°C", "max blanket temperature, slicks", "recalled: blankets retained for 2026 – verify", [50, 100], "L"), inter: est(60, "°C", "blanket temperature, inters", "recalled", [40, 80], "L"), wet: est(null, "°C", "full wets: no blankets", "recalled", [null, null], "L") },
};

export const TYRE_THERMAL = values(TYRE_THERMAL_TABLE);
export const COMPOUNDS = values(COMPOUND_TABLE);
export const blanketTemp = (season, kind) => values(BLANKET_TABLE[season] || BLANKET_TABLE[2025])[kind] ?? null;
