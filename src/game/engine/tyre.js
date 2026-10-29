// Tyre state of one car (DESIGN §7) – the engine's core resource. Pure.
//
// State: compound, age (laps, km), wear w ∈ [0, 1] (irreversible tread loss), Ts / Tc (surface / core °C, two nodes –
// why two: params/tyres.js), used (a set that has run before).
// Grip (relative factor that multiplies the car's mu_mech in profile.js):
//   μ_tyre = muRel(compound) · S(compound, water) · W(T_w) · Gw(w)
//     S  water suitability (slick/inter/wet curves) vs the water depth on the car's line (mm, weather.js waterAt) – the ONLY
//        place the water film acts on grip. The track's rubber factor (weather.js rubberAt, 0.955–1.0) is NOT a tyre
//        term: it goes into profile.js as muTrack, once (no double counting).
//     W  temperature window, T_w = wSurf·Ts + (1 − wSurf)·Tc, Gaussian loss outside [lo, hi] – REVERSIBLE (cools → back)
//     Gw grip vs wear (linear + cliff) – IRREVERSIBLE (w never decreases)
// Heat input  Q = (|a_lat| + |a_long|)·v · heat   (heat = car C_tyre_heat × driver tyreMgmt × pace-mode factor, from the
//             caller) × dryHeat(compound, water)  – specific tyre work, m²/s³ (W/kg of car)
//   dTs/dt = kq·Q − (ha0 + ha1·v)(Ts − Tair) − hr(Ts − Ttrack) − hsc(Ts − Tc) − hw·h·(Ts − Tair)
//   dTc/dt = hcs(Ts − Tc) − hcl(Tc − Tair)
// Wear       dw/dt = kw · abrasion · Q · H(T_w) · dryWear,  H = 1 + kH·max(0, T_w − hi)/10   (overheat ⇒ faster irreversible wear)
// So: a short overheat costs grip only while hot (W); a long one also leaves wear (H). SC running (low v, low a) cools
// (Q small, convection still there). Out-lap: starts at the blanket temperature (or ambient) and warms through Q.
import { TYRE_THERMAL as TH, COMPOUNDS, blanketTemp } from "../data/params/tyres.js";

export const compoundParams = (name) => COMPOUNDS[name] || null;

// a fresh (or used: wear0 > 0) set fitted now. T0: start temperature (°C) – pass the blanket temperature for an out-lap
// (fitTemp(season, compound, Tair)) or the ambient for a cold set.
// kwScale: wear-rate multiplier from the stint calibration (tyres-<season>.js, by the race name SOFT/MEDIUM/HARD), default 1
export function createTyre(compound, { T0 = 25, wear0 = 0, laps0 = 0, km0 = 0, kwScale = 1 } = {}) {
  if (!COMPOUNDS[compound]) throw new Error("unknown compound " + compound);
  const w = Math.min(1, Math.max(0, wear0));
  return { compound, wear: w, Ts: T0, Tc: T0, laps: laps0, km: km0, used: w > 0 || laps0 > 0, overheatS: 0, Q: 0, kwScale };
}

// the temperature a set starts its out-lap at: blanket limit for its kind (season data), else ambient
export function fitTemp(season, compound, Tair) {
  const kind = COMPOUNDS[compound]?.kind || "slick", b = blanketTemp(season, kind);
  return b == null ? Tair : Math.max(b, Tair);
}

// water suitability S(h) ∈ (0, 1]
export function waterFactor(cp, h) {
  if (!(h > 0)) return 1;
  return cp.floor + (1 - cp.floor) / (1 + Math.pow(h / cp.h0, cp.n));
}
// how dry the surface is for a grooved tyre (1 = dry) – scales dryHeat/dryWear; 0.3 mm of water already lets tread blocks cool
const dryness = (h) => (h > 0 ? Math.exp(-h / 0.3) : 1);

export function windowFactor(cp, Tw) {
  if (Tw < cp.winLo) { const x = (cp.winLo - Tw) / 30; return Math.max(0.5, 1 - cp.cold * x * x); }
  if (Tw > cp.winHi) { const x = (Tw - cp.winHi) / 30; return Math.max(0.5, 1 - cp.hot * x * x); }
  return 1;
}
export const wearFactor = (cp, w) => { const e = w > cp.wc ? w - cp.wc : 0; return Math.max(0.5, 1 - cp.d1 * w - cp.d2 * e * e); };
export const windowTemp = (ty) => TH.wSurf * ty.Ts + (1 - TH.wSurf) * ty.Tc;

// μ_tyre (finite, > 0); water in mm on the car's line
export function tyreGrip(ty, water = 0) {
  const cp = COMPOUNDS[ty.compound];
  return cp.muRel * waterFactor(cp, water) * windowFactor(cp, windowTemp(ty)) * wearFactor(cp, ty.wear);
}

// one step. inp: { v, aLat, aLong, heat (car×driver×pace factor), Tair, Ttrack, water (mm), abrasion (track factor, 1 = typical) }
export function stepTyre(ty, inp, dt) {
  const cp = COMPOUNDS[ty.compound], v = inp.v > 0 ? inp.v : 0, h = inp.water > 0 ? inp.water : 0;
  const dry = dryness(h), dh = 1 + (cp.dryHeat - 1) * dry, dwm = 1 + (cp.dryWear - 1) * dry;
  const Q = (Math.abs(inp.aLat) + Math.abs(inp.aLong)) * v * (inp.heat ?? 1) * dh;
  const Ta = inp.Tair ?? 25, Tt = inp.Ttrack ?? Ta;
  const Ts = ty.Ts, Tc = ty.Tc;
  // explicit Euler is stable here: the largest rate (ha0+ha1·v+hr+hsc+hw·h ≈ 0.3–0.6 /s) × DT 0.05 ≪ 1; also safe at the
  // DT/2 of the convergence tests. Clamped to physical range afterwards.
  const dTs = TH.kq * Q - (TH.ha0 + TH.ha1 * v + TH.hw * h) * (Ts - Ta) - TH.hr * (Ts - Tt) - TH.hsc * (Ts - Tc);
  const dTc = TH.hcs * (Ts - Tc) - TH.hcl * (Tc - Ta);
  ty.Ts = clamp(Ts + dTs * dt, TH.Tlo, TH.Thi);
  ty.Tc = clamp(Tc + dTc * dt, TH.Tlo, TH.Thi);
  const Tw = windowTemp(ty), over = Tw > cp.winHi ? Tw - cp.winHi : 0;
  const H = 1 + cp.kH * over / 10;
  const dw = cp.kw * (ty.kwScale ?? 1) * (inp.abrasion ?? 1) * Q * H * dwm * dt;
  ty.wear = Math.min(1, ty.wear + (dw > 0 ? dw : 0));
  if (over > 0) ty.overheatS += dt;
  ty.km += v * dt / 1000;
  ty.Q = Q;
  return ty;
}
export const tyreLap = (ty) => { ty.laps++; ty.used = true; return ty; };

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
