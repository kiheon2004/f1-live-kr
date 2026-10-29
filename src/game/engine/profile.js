// Speed-limit envelope of one car over a closed lap (DESIGN §5). Pure: typed arrays in, typed arrays out.
//
// Point-mass, quasi-static model (what public data can identify):
//   lateral limit   a_lat(v) = μ_eff·(g + ClA·ρ·v²/(2m))
//   corner cap      v_c² ·|κ| = a_lat(v_c)  ⇒  v_c² = μ_eff·g / (|κ| − μ_eff·ClA·ρ/(2m))   (closed form of the fixed point;
//                   denominator ≤ 0 ⇒ downforce grows faster than the needed lateral force: flat out, capped at vMax)
//   braking         backward pass from the slowest point: v_i² = v_{i+1}² + 2·ds·(a_brake + drag/m + Crr·g + g·grade),
//                   a_brake = min(k_brake·a_tot·√(1 − (a_lat/a_tot)²), a_brake_max)   (friction ellipse)
//   acceleration    forward pass (only for the reference lap time – the car step integrates its own acceleration):
//                   a = min(P/(m·v), k_trac·a_tot·√(1 − (a_lat/a_tot)²)) − drag/m − Crr·g − g·grade
// The closed form replaces the design's "fixed-point iteration": with μ independent of speed the fixed point has an exact
// solution (no iteration error, no iteration cost). If a speed-dependent μ is ever added (load sensitivity, the k_low/mid/
// high factors), solveCorner() is where the iteration goes.
// Not modelled (documented limits): vertical curvature (crests/compressions change the normal load), banking, camber,
// the grade's cos(θ) on the normal load (< 0.5 % for 10 % grades).
import { PHYS } from "../data/params/physics.js";

const G = PHYS.g;

// buffers for one track length (reused between recomputations – no garbage in the race loop)
export function makeProfile(n) {
  return { n, vc: new Float64Array(n), vb: new Float64Array(n), vf: new Float64Array(n), lapTime: NaN, j0: 0, mu: NaN, m: NaN };
}


// track: { n, ds (m), kappa (1/m), grade (dz/ds) } – closed loop (sample n wraps to 0), ds uniform.
// car: plain numbers from cars-base / cars-<season> (CdA, ClA, mu_mech, a_brake_max, k_brake, k_trac, P_ice).
// st: the car's present state as multipliers/values:
//   muTyre (tyre.js grip incl. compound/window/wear/water), muTrack (rubber/surface), util (driver ≤ 1), fDirty (traffic),
//   m (kg, total incl. fuel), P (W at the wheels available now: ICE + ERS deploy), rho (kg/m³),
//   cdaMul / claMul (number or per-sample array: DRS / Straight Mode / slipstream), forward (bool: compute vf + lapTime)
export function computeProfile(track, car, st, out = makeProfile(track.n)) {
  const n = track.n, ds = track.ds, kap = track.kappa, grade = track.grade;
  const mu = car.mu_mech * (st.muTyre ?? 1) * (st.muTrack ?? 1) * (st.util ?? 1) * (st.fDirty ?? 1);
  const m = st.m, rho = st.rho ?? 1.18, vMax = PHYS.vMax, Crr = PHYS.Crr;
  const cdaMul = st.cdaMul ?? 1, claMul = st.claMul ?? 1;
  const kd = 0.5 * rho * car.CdA / m, kl = 0.5 * rho * car.ClA / m; // drag and downforce per unit mass per v²
  const vc = out.vc, vb = out.vb, vf = out.vf;
  out.mu = mu; out.m = m;
  // 1. corner cap
  let j0 = 0, vmin = Infinity;
  const claArr = typeof claMul !== "number", cdaArr = typeof cdaMul !== "number";
  for (let i = 0; i < n; i++) {
    const k = Math.abs(kap[i]), den = k - mu * kl * (claArr ? claMul[i] : claMul);
    let v = den > 1e-9 ? Math.sqrt(mu * G / den) : vMax;
    if (v > vMax) v = vMax;
    vc[i] = v;
    if (v < vmin) { vmin = v; j0 = i; }
  }
  out.j0 = j0;
  // 2. braking envelope: backward from the slowest point (it can't be limited by anything downstream), once round
  const kB = car.k_brake, aBmax = car.a_brake_max, fMin = car.f_comb ?? 0;
  vb[j0] = vc[j0];
  for (let c = 1; c < n; c++) {
    const i = (j0 - c + n) % n, nx = i + 1 === n ? 0 : i + 1;
    const v = vb[nx], v2 = v * v;
    const aTot = mu * (G + kl * (claArr ? claMul[nx] : claMul) * v2), aLat = v2 * Math.abs(kap[nx]);
    const r = aLat / aTot, f = comb(r, fMin);
    let aB = kB * aTot * f; if (aB > aBmax) aB = aBmax;
    let dec = aB + kd * (cdaArr ? cdaMul[nx] : cdaMul) * v2 + Crr * G + G * grade[i];
    if (dec < 0) dec = 0;
    const vi = Math.sqrt(v2 + 2 * ds * dec);
    vb[i] = vi < vc[i] ? vi : vc[i];
  }
  // 3. forward (acceleration) pass → reference lap time (flying lap, free air)
  out.lapTime = NaN;
  if (st.forward !== false) {
    const P = st.P, kT = car.k_trac;

    let v = vb[j0], tLap = 0;
    vf[j0] = v;
    // Heun on w = v² over each 2 m piece – the same integration car.js uses, so the reference lap and a car's free lap agree
    const pArr = typeof P !== "number", dArr = typeof cdaMul !== "number", lArr = typeof claMul !== "number";
    for (let c = 0; c < n; c++) {
      const i = (j0 + c) % n, nx = i + 1 === n ? 0 : i + 1;
      const k = Math.abs(kap[i]), Pi = pArr ? P[i] : P, kdi = kd * (dArr ? cdaMul[i] : cdaMul), kli = kl * (lArr ? claMul[i] : claMul), gi = Crr * G + G * grade[i];
      let v2 = v * v, aTot = mu * (G + kli * v2), aP = Pi / (m * (v > 1 ? v : 1)), aT = kT * aTot * comb(v2 * k / aTot, fMin);
      const a0 = (aP < aT ? aP : aT) - kdi * v2 - gi;
      let w = v2 + 2 * ds * a0; if (w < 1e-4) w = 1e-4;
      const vp = Math.sqrt(w); v2 = w; aTot = mu * (G + kli * v2); aP = Pi / (m * (vp > 1 ? vp : 1)); aT = kT * aTot * comb(v2 * k / aTot, fMin);
      w = v * v + ds * (a0 + (aP < aT ? aP : aT) - kdi * v2 - gi); if (w < 1e-4) w = 1e-4;
      let vn = Math.sqrt(w); if (vn > vb[nx]) vn = vb[nx];
      if (nx !== j0) vf[nx] = vn;
      tLap += 2 * ds / (v + vn);
      v = vn;
    }
    out.lapTime = tLap;
  }
  return out;
}

// share of the longitudinal grip left at lateral use r = a_lat/a_tot: the friction ellipse √(1 − r²), optionally floored at
// fMin (cars-base f_comb, default 0 = the plain ellipse). A floor would say "some drive/braking is still available at the
// lateral limit" (combined slip); the speed traces (calibrate.mjs) decide whether it is needed. (It is not needed for the
// integration: car.js marches the 2 m samples, so the √ near r = 1 no longer makes the lap time depend on DT.)
export const comb = (r, fMin) => { const f = r < 1 ? Math.sqrt(1 - r * r) : 0; return f > fMin ? f : fMin; };

// the envelope's speed limit at lap distance s (linear between samples; s wraps)
export function vlimAt(prof, track, s) {
  const n = track.n, x = s / track.ds;
  let i = Math.floor(x); const f = x - i;
  i %= n; if (i < 0) i += n;
  const j = i + 1 === n ? 0 : i + 1, vb = prof.vb;
  return vb[i] + (vb[j] - vb[i]) * f;
}

// when to recompute (DESIGN §5: grip change ≥ 0.3 %, mass ≥ 5 kg, or every 2 s – the caller tracks the time)
export const REPROFILE = { dMu: 0.003, dM: 5, everyMs: 2000 };
export const needsReprofile = (prof, mu, m) => !(Math.abs(mu / prof.mu - 1) < REPROFILE.dMu && Math.abs(m - prof.m) < REPROFILE.dM);
