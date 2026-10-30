// What the screens show at the RENDER time T, between the engine's last two snapshots a (taken at a.t ≤ T) and b (b.t ≥ T)
// – one picture for the 3D cars, the tower, the driver cards, the camera's subject, the weather, the crew, the tyres, the
// events and the orders (v0.50 request §3-2). Pure (tested: test/game/present50.test.js).
//
// The field contract (what each kind of value is, and how it is taken at T):
//   continuous   position (s / u / d), speed, steer, wheel distance, wings, battery (SoC), fuel, tyre wear / life /
//                temperatures, the weather's rain / temperatures / water – interpolated a → b, EXCEPT across a discrete
//                change that breaks them: lap ↔ pit (the car follows the side it is on at T), a tyre change (the old set's
//                values until the change, the new set's after)
//   discrete     where, status, pit phase, the tyre fitted (compound / set), lap, position, the pace and energy modes in
//                force; race-wide: flag, phase, the leader's lap – a's values, then each change the engine recorded with its
//                sim time (snapshot trans / rtrans) applied once T has reached it, never b's early. When the engine's kept
//                list doesn't reach back to a (transCut > a.t: more changes than it keeps, or a very long gap between
//                snapshots) the stretch before the cut is unknown: a's state is shown until T passes the cut – no change is
//                given a made-up time.
//   estimates    gaps, last / best lap, penalties, incidents, damage, the VSC delta, ERS power, the player's plan / sets /
//                ownership / goal – a's (the older snapshot): at most one snapshot interval behind, never ahead.
//   pit times    the phase start times of b only where ≤ T; workT1 (the engine's planned end of the work: the crew's
//                animation is timed by it) is kept for the 3D crew but is not a number any screen may show.
export function discreteAt(ca, cb, ta, T) {
  const D = { where: ca.where, status: rawStatus(ca), phase: ca.pit?.phase ?? "none", tyre: ca.tyre?.compound, code: ca.tyre?.code, setId: ca.tyre?.setId ?? null,
    lap: ca.lap, pos: ca.pos, pace: ca.mode?.pace, emode: ca.mode?.energy ?? ca.energy?.mode };
  const cut = cb.transCut || 0;
  if (cut > ta && T < cut) return D;   // (the kept list doesn't reach back to a: a's state until the cut)
  for (const e of cb.trans || []) {
    if (e.t <= ta || e.t > T) continue;
    for (const k in e.set) D[k] = e.set[k];
  }
  return D;
}
export function raceAt(a, b, T) {
  const D = { flag: a.flag, phase: a.phase, leaderLap: a.leaderLap };
  if ((b.rtransCut || 0) > a.t && T < b.rtransCut) return D;
  for (const e of b.rtrans || []) { if (e.t <= a.t || e.t > T) continue; for (const k in e.set) D[k] = e.set[k]; }
  return D;
}
const rawStatus = (c) => (c.status === "pit" ? "run" : c.status);
const lerp = (x, y, f) => (Number.isFinite(x) && Number.isFinite(y) ? x + (y - x) * f : Number.isFinite(x) ? x : y);
const wrapTo = (x, L) => ((x % L) + L) % L;
const PIT_TIMES = ["entry", "stop", "queue", "queueEnd", "penEnd", "work", "workEnd", "release"];

// the cars at T. L: the lap length (m) for wrapping s. Returns new objects (the snapshots are never written).
export function presentCars(a, b, T, L) {
  if (!b) return [];
  if (!a || !(b.t > a.t)) return b.cars.map((c) => ({ ...c }));
  const f = Math.max(0, Math.min(1, (T - a.t) / (b.t - a.t)));
  const prev = new Map(a.cars.map((c) => [c.num, c]));
  return b.cars.map((cb) => {
    const ca = prev.get(cb.num); if (!ca) return { ...cb };
    if (f >= 1) return { ...cb };
    const D = discreteAt(ca, cb, a.t, T), c = { ...ca };   // (estimates and everything else: a's)
    // position: interpolated on the side the car is on at T
    if (D.where === ca.where && D.where === cb.where) {
      if (cb.where === "lap" && cb.s != null && ca.s != null) { let ds = cb.s - ca.s; if (ds < -L / 2) ds += L; if (ds > L / 2) ds -= L; c.s = wrapTo(ca.s + ds * f, L); }
      else if (cb.u != null && ca.u != null) c.u = lerp(ca.u, cb.u, f);
      else { c.s = cb.s; c.u = cb.u; }
    } else if (D.where === ca.where) {   // (still on a's side: a's place moved on at a's speed)
      c.s = ca.s != null ? wrapTo(ca.s + (ca.v || 0) * (T - a.t) / 1000, L) : ca.s; c.u = ca.u != null ? ca.u + (ca.v || 0) * (T - a.t) / 1000 : ca.u;
    } else {   // (already on b's side: b's place moved back at b's speed)
      c.s = cb.s != null ? wrapTo(cb.s - (cb.v || 0) * (b.t - T) / 1000, L) : cb.s; c.u = cb.u != null ? Math.max(0, cb.u - (cb.v || 0) * (b.t - T) / 1000) : cb.u;
    }
    if (cb.s == null && D.where === cb.where) c.s = null;   // (left the picture: retired in the garage / finished)
    c.d = lerp(ca.d ?? 0, cb.d ?? 0, f); c.v = lerp(ca.v, cb.v, f); c.a = lerp(ca.a, cb.a, f); c.steer = lerp(ca.steer ?? 0, cb.steer ?? 0, f);
    c.wheelDist = lerp(ca.wheelDist ?? 0, cb.wheelDist ?? 0, f);
    if (ca.aero && cb.aero) c.aero = { ...cb.aero, open: lerp(ca.aero.open || 0, cb.aero.open || 0, f), front: lerp(ca.aero.front || 0, cb.aero.front || 0, f) };
    // discrete
    c.where = D.where; c.status = D.where === "pit" && D.status === "run" ? "pit" : D.status; c.lap = D.lap; c.pos = D.pos;
    c.mode = { pace: D.pace, energy: D.emode };
    // the tyre: the same set on both sides → interpolated; changed and applied by T → b's (the new set); not yet → a's
    const sameSet = (ca.tyre?.setId ?? ca.tyre?.compound) === (cb.tyre?.setId ?? cb.tyre?.compound) && ca.tyre?.code === cb.tyre?.code;
    if (sameSet) c.tyre = { ...cb.tyre, wear: lerp(ca.tyre.wear, cb.tyre.wear, f), life: lerp(ca.tyre.life, cb.tyre.life, f), Ts: lerp(ca.tyre.Ts, cb.tyre.Ts, f), Tc: lerp(ca.tyre.Tc, cb.tyre.Tc, f), Tw: lerp(ca.tyre.Tw, cb.tyre.Tw, f), age: ca.tyre.age };
    else c.tyre = D.code === cb.tyre?.code && (D.setId ?? null) === (cb.tyre?.setId ?? null) && D.tyre === cb.tyre?.compound ? { ...cb.tyre } : { ...ca.tyre };
    c.energy = { ...ca.energy, soc: lerp(ca.energy?.soc, cb.energy?.soc, f), mode: D.emode };
    c.fuel = lerp(ca.fuel, cb.fuel, f);
    // the pit: b's phase-start times that have happened by T, the phase at T
    const tb = cb.pit?.times || {}, times = {}; for (const k of PIT_TIMES) times[k] = tb[k] != null && tb[k] <= T ? tb[k] : null;
    c.pit = { ...(cb.pit || {}), phase: D.phase, times, workT0: times.work, holdT1: D.phase === "penalty" ? cb.pit?.holdT1 ?? null : null };
    // the sets: b's list once the fitted set at T is b's fitted one
    if (cb.sets) c.sets = (D.setId ?? null) === (cb.tyre?.setId ?? null) ? cb.sets : ca.sets;
    c.trans = cb.trans; c.transCut = cb.transCut;
    return c;
  });
}
// the race-wide fields at T (flag / phase / leader lap discrete; weather interpolated)
export function presentRace(a, b, T) {
  if (!b) return null;
  if (!a || !(b.t > a.t)) return { ...b };
  const f = Math.max(0, Math.min(1, (T - a.t) / (b.t - a.t))), R = raceAt(a, b, T), wa = a.weather || {}, wb = b.weather || {};
  return { ...a, t: T, flag: R.flag, phase: R.phase, leaderLap: R.leaderLap,
    weather: { ...wa, rain: lerp(wa.rain, wb.rain, f), airT: lerp(wa.airT, wb.airT, f), trackT: lerp(wa.trackT, wb.trackT, f), wind: lerp(wa.wind, wb.wind, f), water: lerp(wa.water, wb.water, f) } };
}
// the whole picture at T: race-wide fields + the cars
export function presentAt(a, b, T, L) {
  const r = presentRace(a, b, T); if (!r) return null;
  r.cars = presentCars(a, b, T, L); r.t = T;
  return r;
}
