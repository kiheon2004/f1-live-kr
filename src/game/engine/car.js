// One fixed step of a car's longitudinal dynamics (DESIGN §5). Pure; no noise (the driver's variation enters through the
// utilisation in the envelope's μ_eff – driver.js – never as a random term on the speed).
//
//   m·a = F_drive − ½ρ·CdA·v² − Crr·m·g − m·g·grade,  F_drive = min(P/v, k_trac·m·a_tot·comb(a_lat/a_tot))
// and the speed never exceeds the envelope v_lim(s) = min(v_b, v_c) from profile.js (braking = following the braking
// envelope, which already holds the friction ellipse and a_brake_max).
//
// How a time step is integrated – in DISTANCE, over the track's own 2 m samples: within a step of dt seconds the car
// marches sample to sample, w = v² with Heun's rule (dw/ds = 2a, 2nd order), capped by v_lim at every sample boundary,
// and spends 2·len/(v_a + v_b) seconds on each piece until dt is used up (the last piece is cut at constant acceleration).
// Why not a plain RK step in time: the envelope has kinks (apexes, braking points) inside a 4–5 m step; a time step
// checked only at its end jumps over an apex, and the traction limit changes steeply with v near the corner cap. Both made
// the lap time depend on DT (≈ 0.02–0.04 s/lap at 50 ms on Silverstone). Marching the samples the envelope is defined on
// makes the path the same whatever DT is – only the cut of the last piece depends on it (car.test.js: 50 vs 25 ms).
// A car above the envelope (its grip just dropped: a recompute with less μ) brakes at its capacity until it is under it.
// Outputs: the accelerations the tyres feel (aLong = Δv/dt, aLat = v²κ) and the power flows the energy model needs:
//   pDrive (W, tractive power used at the wheels, mean over the step), pBrake (W, power removed by braking beyond the
//   resistances – what regeneration can harvest).
import { PHYS } from "../data/params/physics.js";
import { vlimAt, comb } from "./profile.js";

const G = PHYS.g;
export const DT = 0.05; // s – the engine clock's fixed step (DESIGN §2); the caller may pass another dt (convergence tests)

export const makeCarState = (s = 0, v = 0) => ({ s, v, lap: 0, aLong: 0, aLat: 0, pDrive: 0, pBrake: 0, crossed: false, tCross: 0, limited: false, over: 0 });

// env: { m, P (W available: ICE + ERS cap), rho, mu (the same μ_eff the envelope used), cdaMul, claMul (numbers) }
// track: { n, ds, L, kappa, grade }; prof: from computeProfile (vb is the limit).
export function stepCar(c, track, prof, car, env, dt = DT) {
  const m = env.m, rho = env.rho ?? 1.18, mu = env.mu, n = track.n, ds = track.ds, L = track.L, vb = prof.vb;
  const kd = 0.5 * rho * car.CdA * (env.cdaMul ?? 1) / m, kl = 0.5 * rho * car.ClA * (env.claMul ?? 1) / m;
  const P = env.P, kT = car.k_trac, fC = car.f_comb ?? 0, kB = car.k_brake, aBmax = car.a_brake_max, Crr = PHYS.Crr;
  const v0 = c.v;
  let s = c.s, v = v0, tLeft = dt, eDrive = 0, eBrake = 0, limited = false, over = 0;
  c.crossed = false;
  let guard = 0;
  while (tLeft > 1e-12 && guard++ < 10000) {
    // the piece from s to the next sample boundary
    let k = Math.floor(s / ds); if (k >= n) k = n - 1;
    const sb = (k + 1) * ds, len = sb - s > 1e-9 ? sb - s : ds;
    const i = k, j = k + 1 === n ? 0 : k + 1;
    const kap = Math.abs(track.kappa[i]), gr = track.grade[i];
    // Heun on w = v²: a at the start, predicted end, a at the end, mean
    const a0 = accel(v, kap, gr, mu, kl, kd, P, m, kT, fC, Crr), d0 = _aDrive;
    let w1 = v * v + 2 * len * a0;
    if (w1 <= 0) { // decelerating to a stop inside this piece (no drive: out of fuel and energy, or a climb it can't make)
      const x = a0 < 0 ? v * v / (-2 * a0) : 0, tStop = a0 < 0 ? v / -a0 : 0;
      if (tStop <= tLeft) { s += x; v = 0; break; }
      const vE = v + a0 * tLeft; s += v * tLeft + 0.5 * a0 * tLeft * tLeft; v = vE; break;
    }
    const a1 = accel(Math.sqrt(w1), kap, gr, mu, kl, kd, P, m, kT, fC, Crr), d1 = _aDrive;
    w1 = v * v + len * (a0 + a1); if (w1 < 1e-4) w1 = 1e-4;
    let v1 = Math.sqrt(w1), aDrive = 0.5 * (d0 + d1), lim = j === 0 && sb >= L ? vb[0] : vb[j];
    let capped = false;
    if (v1 > lim) {
      // above the envelope: follow it if it is reachable from here; else brake at capacity (car above the envelope)
      const v2 = v * v, aTot = mu * (G + kl * v2), f = comb(v2 * kap / aTot, fC);
      const aB = Math.min(kB * aTot * f, aBmax) + kd * v2 + Crr * G + G * gr;
      const vMinB = Math.sqrt(Math.max(0, v2 - 2 * len * aB));
      const vAtS = vlimAt(prof, track, s);
      v1 = v <= vAtS + 0.05 || lim >= vMinB ? lim : vMinB;
      if (v1 > lim) over = v1 - lim;
      capped = true; limited = true;
    }
    // time on this piece (constant acceleration over it)
    const tSeg = 2 * len / Math.max(1e-6, v + v1);
    if (tSeg <= tLeft) {
      accountEnergy(capped, v, v1, len, aDrive, kd, Crr, gr, m);
      eDrive += _eD; eBrake += _eB;
      s = sb; v = v1; tLeft -= tSeg;
      if (s >= L - 1e-9) { c.tCross = dt - tLeft; s -= L; if (s < 0) s = 0; c.lap++; c.crossed = true; }
    } else {
      // cut the piece at constant acceleration: x(τ) = v·τ + ½aτ²
      const aS = (v1 * v1 - v * v) / (2 * len), tau = tLeft;
      let x = v * tau + 0.5 * aS * tau * tau; if (x > len) x = len; if (x < 0) x = 0;
      const vE = Math.max(0, v + aS * tau);
      accountEnergy(capped, v, vE, x, aDrive, kd, Crr, gr, m);
      eDrive += _eD; eBrake += _eB;
      s += x; v = vE; tLeft = 0;
    }
  }
  c.s = s; c.v = v; c.aLong = (v - v0) / dt;
  let ki = Math.floor(s / ds) % n; if (ki < 0) ki += n;
  c.aLat = v * v * track.kappa[ki];
  c.pDrive = eDrive / dt; c.pBrake = eBrake / dt; c.limited = limited;
  c.over = over; // m/s above the envelope at the end of a braking-at-capacity piece (> 0: the car is over the limit – incidents.js may use it)
  return c;
}

let _aDrive = 0, _eD = 0, _eB = 0; // module scratch (no closure/allocation per step)

// free acceleration at speed v on a piece with |κ| and grade: drive (power or traction, whichever is lower) − resistances
function accel(v, kap, gr, mu, kl, kd, P, m, kT, fC, Crr) {
  const v2 = v * v, aTot = mu * (G + kl * v2), f = comb(v2 * kap / aTot, fC);
  const aP = P / (m * (v > 1 ? v : 1)), aT = kT * aTot * f;
  _aDrive = aP < aT ? aP : aT;
  return _aDrive - kd * v2 - Crr * G - G * gr;
}

// energy over a piece of length x from va to vb: work = m·(Δ½v² + resistance work); drive if positive, brake if negative.
// Free pieces drive with the computed drive acceleration; capped pieces use only what the speed change needs.
function accountEnergy(capped, va, vb_, x, aDrive, kd, Crr, gr, m) {
  _eD = 0; _eB = 0;
  if (x <= 0) return;
  if (!capped) { _eD = m * aDrive * x; return; }
  const vm = 0.5 * (va + vb_), need = m * (0.5 * (vb_ * vb_ - va * va) + (kd * vm * vm + Crr * G + G * gr) * x);
  if (need > 0) _eD = need; else _eB = -need;
}
