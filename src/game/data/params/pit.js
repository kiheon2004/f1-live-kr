// Pit stop coefficients (DESIGN §11). Each: value, unit, meaning, source / estimate, range.
// The stationary time is the CREW's work (jacks, guns, wheels) – measured per team from the F1 feed's PitStopSeries
// (stationary time) in the calibration races (src/game/tools/calibrate.mjs writes params/crews-<season>.js); these are the
// defaults where a team has no measured stops.
export const PIT = {
  commit: { v: 350, unit: "m", est: true, range: [200, 600], why: "distance before the pit entry's branch past which a call can no longer be cancelled (the driver is committed to the entry line). Game estimate: real teams call before the last corner; no published figure." },
  callLate: { v: 30, unit: "m", est: true, range: [0, 100], why: "a call arriving within this of the commit point is too late for this lap – it stands for the next one (the driver must hear and act)" },
  boxApproach: { v: 0.9, unit: "g", est: true, range: [0.6, 1.2], why: "deceleration into the box from the limiter speed (a car stops in its marks on cold brakes)" },
  launch: { v: 0.8, unit: "g", est: true, range: [0.5, 1.2], why: "acceleration out of the box to the limiter speed" },
  releaseGap: { v: 2.0, unit: "s", est: true, range: [1, 3], why: "the gap to a car coming down the fast lane under which the lollipop / release light holds the car (safe release)" },
  queueGap: { v: 6, unit: "m", est: true, range: [3, 10], why: "where a queued car stops behind its box while the teammate is in it" },
  workBase: { v: 2.4, unit: "s", est: true, range: [1.9, 3.5], why: "default stationary time of a 4-tyre change (2024–25 typical; the measured per-team value replaces it)" },
  workSd: { v: 0.18, unit: "s", est: true, range: [0.08, 0.4], why: "spread of a clean stop's stationary time (per-team measured spread replaces it)" },
  // slow wheel: one of the four guns/wheels doesn't go on cleanly (cross-threaded nut, wheel not seated). Probability per
  // stop rises with the crew's pressure – a double stack (the second car's crew working against the clock), rain (wet
  // hands, gloves) – a cause, not a random delay. Size from real stops seen (several seconds).
  errBase: { v: 0.025, unit: "1/stop", est: true, range: [0.005, 0.06], why: "chance of a slow wheel at a normal stop (game estimate from how often >5 s stops show in 2024–25 PitStopSeries)" },
  errStack: { v: 2.0, unit: "×", est: true, range: [1, 3], why: "factor on errBase for the second car of a double stack" },
  errWet: { v: 1.5, unit: "×", est: true, range: [1, 2.5], why: "factor on errBase in rain" },
  errDelay: { v: [2.5, 8], unit: "s", est: true, range: [1, 20], why: "added time of a slow wheel: uniform between the two (seeded)" },
  unsafeRelease: { v: 0.06, unit: "1/release", est: true, range: [0, 0.4], why: "chance the crew releases a car although a car is within releaseGap in the fast lane (a misjudgement – only when such a car is there). v0.51: 0.15 → 0.06 – unsafe-release penalties are of the order of ten a season over ≈ 800 stops, of which perhaps one in seven has a car coming down the fast lane (both rough, est); at 0.15 a wet race's mass stop handed out 5–10 penalties (audit, Australia 2025)" },
};
export const PIT_PARAMS_VERSION = 1;
