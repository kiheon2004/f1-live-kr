// One car alone on a track for N laps: the physics modules composed exactly as the engine step should compose them
// (profile → driver → energy caps → car step → power split → energy → tyre), for tests, sensitivity sweeps and calibration.
// No traffic, no pit, no weather change. Node or engine – pure (randomness only from the stream passed in).
import { computeProfile, makeProfile, needsReprofile, REPROFILE } from "../engine/profile.js";
import { stepCar, makeCarState, DT } from "../engine/car.js";
import { createTyre, stepTyre, tyreGrip, tyreLap, fitTemp } from "../engine/tyre.js";
import { createEnergy, iceCap, ersCap, splitPower, stepEnergy, energyLap } from "../engine/energy.js";
import { createDriver, setPaceMode, stepDriver, utilisation, tyreHeatFactor } from "../engine/driver.js";
import { energyParams } from "../data/params/energy.js";
import { airDensity } from "../data/params/physics.js";

// a stream with no variation (deterministic tests that don't care about the driver noise)
export const ZERO_RNG = { next: () => 0.5, normal: () => 0 };

// opts: { track, car (values), season, compound, laps, pace ('attack'|'balanced'|'manage' or (lap)=>mode), energyMode (or fn),
//         rng, dt, Tair, Ttrack, water, rubber, abrasion, fuel, soc, tyre (existing state) | tyreT0, wear0, driver (params),
//         vCap: (lap) => m/s cap or null (SC/VSC emulation), v0 (start speed: flying start), trace (bool: per-step arrays of lap 2) }
export function runSolo(o) {
  const tr = o.track, car = o.car, season = o.season ?? 2025, dt = o.dt ?? DT, ep = energyParams(season);
  const Tair = o.Tair ?? 25, Ttrack = o.Ttrack ?? 35, water = o.water ?? 0, rubber = o.rubber ?? 1, rho = o.rho ?? airDensity(Tair);
  const rng = o.rng || ZERO_RNG;
  const ty = o.tyre || createTyre(o.compound || "C3", { T0: o.tyreT0 ?? fitTemp(season, o.compound || "C3", Tair), wear0: o.wear0 ?? 0 });
  const es = o.energy || createEnergy(ep, { fuel: o.fuel ?? ep.fuel.max, soc: o.soc ?? 1 });
  const d = createDriver(o.driver);
  const modeAt = (x, lap, dflt) => (typeof x === "function" ? x(lap) : x || dflt);
  const c = makeCarState(0, o.v0 ?? 0);
  const prof = makeProfile(tr.n);
  const laps = [], lapInfo = [];
  let t = 0, tLapStart = 0, sinceProf = Infinity, lapNow = 0, steps = 0;
  const maxT = o.maxT ?? (o.laps + 2) * 400;
  let stopped = false;
  setPaceMode(d, modeAt(o.pace, 0, "balanced"));
  while (lapNow < o.laps && t < maxT) {
    stepDriver(d, rng, dt);
    const u = utilisation(d, water), muT = tyreGrip(ty, water);
    const m = car.m_min + es.fuel;
    const mu = car.mu_mech * muT * rubber * u;
    sinceProf += dt * 1000;
    if (sinceProf >= REPROFILE.everyMs || needsReprofile(prof, mu, m)) {
      computeProfile(tr, car, { muTyre: muT, muTrack: rubber, util: u, m, rho, forward: false }, prof);
      sinceProf = 0;
    }
    const eMode = modeAt(o.energyMode, lapNow, "balanced");
    const pI = iceCap(es, car.P_ice, ep), pE = ersCap(es, ep, eMode, c.v);
    const v0 = c.v;
    stepCar(c, tr, prof, car, { m, P: pI + pE, rho, mu: prof.mu }, dt);
    const cap = o.vCap ? o.vCap(lapNow) : null;
    if (cap != null && c.v > cap) { // SC/VSC emulation: the car holds a lower speed (brakes to it)
      const vn = Math.max(cap, v0 - 30 * dt); c.aLong = (vn - v0) / dt; c.aLat = vn * vn * tr.kappa[Math.floor(c.s / tr.ds) % tr.n]; c.pDrive = Math.min(c.pDrive, m * Math.max(0, c.aLong) * vn + 0.5 * rho * car.CdA * vn ** 3); c.v = vn;
    }
    const [ice, ers] = splitPower(c.pDrive, pI, pE);
    stepEnergy(es, ep, { pIce: ice, pErs: ers, pBrake: c.pBrake, iceFull: pI > 0 && ice >= pI * 0.98 }, dt, t);
    stepTyre(ty, { v: c.v, aLat: c.aLat, aLong: c.aLong, heat: car.C_tyre_heat * tyreHeatFactor(d), Tair, Ttrack, water, abrasion: o.abrasion ?? 1 }, dt);
    if (c.crossed) {
      const tc = t + c.tCross;
      if (lapNow > 0 || o.v0 > 0) laps.push(tc - tLapStart);
      lapInfo.push({ lap: lapNow, t: tc, wear: ty.wear, Ts: ty.Ts, Tc: ty.Tc, mu: muT, fuel: es.fuel, soc: es.soc, mode: d.mode });
      tLapStart = tc; lapNow++;
      tyreLap(ty); energyLap(es);
      setPaceMode(d, modeAt(o.pace, lapNow, "balanced"));
    }
    t += dt; steps++;
    if (c.v < 0.05 && t > 30) { stopped = true; break; }
  }
  return { laps, lapInfo, total: laps.reduce((a, b) => a + b, 0), tyre: ty, energy: es, car: c, t, steps, stopped };
}
