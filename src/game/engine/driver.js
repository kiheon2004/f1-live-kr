// Driver: how much of the car's limit is used (DESIGN §3, §6). Pure; randomness only from the named stream passed in
// (rng.js Stream: next(), normal()) – this module never creates a generator.
//
// utilisation u = clamp(pace · mode.util · wetMul(water) + x, UTIL_MIN, 1)   → profile.js μ_eff multiplier
//   x: AR(1) variation, per step x ← ρ·x + σ·√(1−ρ²)·N(0,1), ρ = exp(−dt/τ)  (stationary σ, correlated over τ seconds:
//   a driver has a good or a scruffy sequence of corners – no independent noise per 50 ms step on the speed)
// tyre heat factor = mode.heat · tyreMgmt   → tyre.js Q multiplier (with the car's C_tyre_heat)
// The pace trade-off is not a table: attack raises μ use (faster corners NOW) and puts more work into the tyres (higher
// speeds/accelerations through the physics + the style factor) ⇒ hotter tyres (reversible window loss) and faster wear
// (irreversible); manage is slower now and keeps the tyres cooler and longer. Which wins over a stint depends on the stint
// length, track and temperatures (test/game/driver.test.js shows both directions).
import { DRIVER_DEFAULT, PACE_MODES, UTIL_MAX, UTIL_MIN } from "../data/params/drivers.js";

export function createDriver(dp = {}) {
  return { p: { ...DRIVER_DEFAULT, ...dp }, x: 0, mode: "balanced" };
}

export function setPaceMode(d, mode) { if (!PACE_MODES[mode]) throw new Error("unknown pace mode " + mode); d.mode = mode; return d; }

// one step of the AR(1) variation; rng: a stream object with normal()
export function stepDriver(d, rng, dt) {
  const rho = Math.exp(-dt / d.p.tau);
  d.x = rho * d.x + d.p.consistency * Math.sqrt(1 - rho * rho) * rng.normal();
  return d;
}

// wet adaptation acts in proportion to how wet it is (full effect from ~1 mm of water on the line)
export function utilisation(d, water = 0) {
  const wf = water > 0 ? Math.min(1, water) : 0;
  const u = d.p.pace * PACE_MODES[d.mode].util * (1 + (d.p.wet - 1) * wf) + d.x;
  return u > UTIL_MAX ? UTIL_MAX : u < UTIL_MIN ? UTIL_MIN : u;
}

export const tyreHeatFactor = (d) => PACE_MODES[d.mode].heat * d.p.tyreMgmt;
