// Incidents with causes (DESIGN §12, request §12): no free-floating random crashes. Three hazards, each exactly 0
// without its cause, each drawn from the race's named streams (one per car and kind – one car's luck never shifts
// another's), each logged with the inputs that made it likely:
//   driverError(race, T, car, inp)  – per step: the driver trying to use more grip than is there (inp.u > errU0), more
//                                     so on a tyre out of its window, on water (worse on the wrong tyre, scaled by wet
//                                     skill). An error is a slow moment / running wide (track limits) / a spin / a crash,
//                                     by what is beside the track at that point (scenario run-off: paved, grass, gravel,
//                                     wall – street circuits are walls).
//   contact(race, T, ev)            – per alongside battle in a braking zone (traffic reports it once): overlap,
//                                     closing speed, lateral clearance, both drivers' racecraft, water.
//   mechanical(race, T, car, inp)   – per step: the team's reliability, raised by stress (attack share, energy push,
//                                     hot air).
// Consequences act on the car physically (car.inc: a grip-use factor or a speed cap for a while – control.caps applies
// it; car.dmg: aero / power / puncture for the car model; retirement), and race control decides by where the car stopped
// and what is on the track (rcDecision: local yellow / VSC / SC / red, with a clearing time – a documented rule of thumb).
// Every incident: { t, lap, cars, type, cause: {the inputs}, effect: {…} } in race.state.log and race.state.incidents.
import { INCIDENTS } from "../data/params/incidents.js";
import { DT } from "./clock.js";
import { lapPos, lapsOf, neutralise } from "./control.js";
import { trackLimits, onCollision } from "./rules.js";

const ist = (race) => race.state.incidents || (race.state.incidents = { list: [], stopped: [] });
export const newIncidents = (race) => { race.state.incidents = { list: [], stopped: [] }; return race.state.incidents; };
const inSpan = (s, a, b, T) => T.ahead(a, s) <= T.ahead(a, b);
const U = (r, [a, b]) => a + (b - a) * r.next();
function pick(r, w) { const ks = Object.keys(w), tot = ks.reduce((a, k) => a + w[k], 0); let x = r.next() * tot; for (const k of ks) { x -= w[k]; if (x < 0) return k; } return ks[ks.length - 1]; }

function record(race, T, cars, type, cause, effect) {
  const S = race.state, lead = Math.max(0, ...S.cars.map((c) => lapsOf(c, T)));
  const e = { t: S.t, lap: lead + 1, cars, type, cause, effect };
  ist(race).list.push(e); (S.log || (S.log = [])).push(e);
  return e;
}

// What is beside the track at s: scenario.track.runoff [{ from, to, type }] (or scenario.circuit.runoff), else the
// circuit's default: street circuits (scenario.circuit.street / track.street) walls, others paved run-off (est).
export function runoffAt(race, T, s) {
  const tr = race.scenario?.track || {}, ci = race.scenario?.circuit || {};
  for (const z of tr.runoff || ci.runoff || []) if (inSpan(T.wrap(s), z.from, z.to, T)) return z.type;
  return ci.street || tr.street ? "wall" : tr.runoffDefault || ci.runoffDefault || "paved";
}

// ---------- driver error ----------
// inp: { u (grip tried / grip there), tyreOut (0 in window … 1 far out), water (mm on the line here), compound }
// drv: the driver's params ({ wet }: 1 = average, > 1 better in the wet)
export function errorHazard(inp, drv = {}, P = INCIDENTS) {
  const u = inp.u ?? 0, u0 = P.errU0.v;
  if (!(u > u0)) return { lambda: 0, x: 0, tyre: 1, water: 1 };
  const x = (u - u0) / (1 - u0);
  const tyre = 1 + P.errTyre.v * Math.min(1, Math.max(0, inp.tyreOut || 0));
  const c = String(inp.compound || "").toUpperCase(), mism = c === "WET" ? 0.2 : c.startsWith("INTER") ? 0.4 : 1;
  const water = 1 + P.errWater.v * Math.max(0, inp.water || 0) * mism * Math.exp(P.errWetSkill.v * (1 - (drv.wet ?? 1)));
  return { lambda: P.errRate.v * x * x * tyre * water, x, tyre, water };
}

export function driverError(race, T, car, inp, P = INCIDENTS) {
  if (car.status !== "run" || car.where === "pit" || (car.inc && car.inc.until > race.state.t)) return null;
  const h = errorHazard(inp, car.driver || {}, P);
  if (h.lambda <= 0) return null;
  const r = race.rng.get("incident:err:" + car.num);
  if (r.next() >= 1 - Math.exp(-h.lambda * DT)) return null;
  const pos = lapPos(car, T), ro = runoffAt(race, T, pos), w = { ...P.severity.v[ro] || P.severity.v.paved };
  w.spin *= 1 + P.errSevere.v * h.x; w.crash *= 1 + P.errSevere.v * h.x;
  const kind = pick(r, w), t = race.state.t;
  const cause = { u: +inp.u.toFixed(4), x: +h.x.toFixed(3), tyreOut: inp.tyreOut || 0, water: inp.water || 0, compound: inp.compound || null, wet: car.driver?.wet ?? 1, runoff: ro, v: +car.v.toFixed(1), s: Math.round(pos) };
  let effect;
  if (kind === "moment") {
    const s = U(r, P.moment.v.s); car.inc = { kind, until: t + Math.round(s * 1000), util: P.moment.v.util }; effect = { kind, s: +s.toFixed(2) };
  } else if (kind === "wide") {
    const [f, s] = P.wide.v[ro] || P.wide.v.paved; car.inc = { kind, until: t + Math.round(s * 1000), vCap: car.v * f };
    effect = { kind, s, vCap: +(car.v * f).toFixed(1) };
    if (ro === "wall") { if (r.chance(0.3)) { dmg(car).aero += 0.03 + 0.07 * r.next(); effect.damage = "brushed the wall"; } }
    else effect.trackLimits = trackLimits(race, T, car, { where: pos });
  } else if (kind === "spin") {
    const S = P.spin.v, s = U(r, S.stopS);
    car.inc = { kind, until: t + Math.round(s * 1000), vCap: 0, problem: true }; effect = { kind, stoppedS: +s.toFixed(1) };
    if (r.chance(S.flatSpot)) { if (car.tyre) car.tyre.flat = (car.tyre.flat || 0) + 1; effect.flatSpot = true; }
    const beached = r.chance(S.beach[ro] || 0), stalled = !beached && r.chance(S.stall);
    if (beached || stalled) { effect.out = beached ? "beached" : "stalled"; retire(race, T, car, effect.out, beached ? "offTrack" : "onTrack", { runoff: ro, debris: "none", stuck: beached }, P); }
    else applyRC(race, T, car, { place: "none", spun: true, runoff: ro, debris: "none" }, P);
  } else {
    effect = crash(race, T, car, r, ro, P);
  }
  return record(race, T, [car.num], "driver error", cause, effect);
}

function dmg(car) { return car.dmg || (car.dmg = { aero: 0, power: 1, puncture: false }); }

function crash(race, T, car, r, ro, P) {
  const C = P.crash.v, impact = car.v * (C.impact[ro] ?? 0.6), t = race.state.t;
  const effect = { kind: "crash", impact: +impact.toFixed(1) };
  if (impact > C.outAbove) {
    const barrier = impact > C.barrierAbove && (ro === "wall" || ro === "gravel");
    effect.out = "crash"; if (barrier) effect.barrier = true;
    retire(race, T, car, "crash", ro === "wall" ? "trackEdge" : "offTrack", { runoff: ro, debris: "heavy", barrier, stuck: ro === "gravel" }, P);
  } else {
    const d = U(r, C.damage); dmg(car).aero = Math.min(0.6, dmg(car).aero + d);
    car.inc = { kind: "crash", until: t + 3000, vCap: 0, problem: true };
    effect.damage = { aero: +d.toFixed(2) };
    applyRC(race, T, car, { place: "none", runoff: ro, debris: "light" }, P);
  }
  return effect;
}

// the car is out: where it stops decides what race control does
function retire(race, T, car, cause, place, info, P) {
  const S = race.state, t = S.t, pos = lapPos(car, T);
  car.status = "dnf"; car.out = { cause, t, lap: lapsOf(car, T) + 1 }; car.v = 0; car.inc = null;
  const dec = applyRC(race, T, car, { ...info, place }, P);
  ist(race).stopped.push({ num: car.num, s: pos, d: place === "offTrack" ? Math.sign(car.d || 1) * 10 : car.d || 0, onTrack: place !== "offTrack", until: t + (dec?.clearMs ?? 60e3) });
  return dec;
}

// ---------- race control's rule of thumb (est) ----------
// place: where the stopped car is – "onTrack" (on the racing surface), "trackEdge" (against a wall, no run-off: a crane /
// truck must come onto the track), "offTrack" (in the run-off), "none" (no car stopped: debris / a spin); debris: none /
// light (bits of a wing) / heavy (a crash's field); barrier: needs repair; stuck: needs a recovery vehicle near the track.
export function rcDecision(race, T, info, P = INCIDENTS) {
  const live = ist(race).stopped.filter((x) => x.until > race.state.t && x.onTrack).length;
  let kind, why;
  if (info.barrier) { kind = "red"; why = "barrier repair"; }
  else if (live >= 2 && info.place !== "none" && info.place !== "offTrack") { kind = "red"; why = "several cars stopped on the track"; }
  else if (info.place === "onTrack" || info.debris === "heavy") { kind = "sc"; why = info.place === "onTrack" ? "car stopped on the track" : "debris on the track"; }
  else if (info.place === "trackEdge") { kind = "vsc"; why = "car stopped by the barrier – recovery from the track"; }
  else if (info.place === "offTrack") { kind = info.stuck || info.runoff === "gravel" ? "vsc" : "double"; why = info.stuck || info.runoff === "gravel" ? "car stuck in the run-off – recovery vehicle" : "car stopped in the run-off – pushed behind the barrier"; }
  else if (info.debris === "light") { kind = "double"; why = "debris – marshals clear it"; }
  else if (info.spun) { kind = "yellow"; why = "car spun and rejoined"; }
  else return { kind: "none", clearMs: 0, why: "nothing on the track" };
  const r = race.rng.get("incident:rc"), cl = U(r, P.clear.v[kind]);
  return { kind, clearMs: Math.round(cl * 1000), why };
}
function applyRC(race, T, car, info, P) {
  const d = rcDecision(race, T, info, P);
  if (d.kind !== "none") neutralise(race, T, d.kind, { s: lapPos(car, T), clearMs: d.clearMs, cause: `${d.why} (car ${car.num})` });
  return d;
}

// ---------- contact ----------
// ev: { a (the attacker, behind), b (the defender), overlap (0 = nose at the rear wheels … 1 = fully alongside),
//       dv (closing speed m/s), braking (true in a braking zone), latGap (m between the cars), water (mm) }
export function contactHazard(ev, P = INCIDENTS) {
  if (!ev.braking || !(ev.overlap > 0) || ev.overlap >= 1) return { p: 0 };
  const o = ev.overlap, shape = 4 * o * (1 - o);
  const rc = ((ev.a.driver?.racecraft ?? P.racecraftRef.v) + (ev.b.driver?.racecraft ?? P.racecraftRef.v)) / 2;
  const skill = Math.max(0.1, (1 - rc) / (1 - P.racecraftRef.v));
  const p = P.contactP.v * shape * (1 + Math.max(0, ev.dv || 0) / P.contactDv.v) / 2 * Math.exp(-Math.max(0, ev.latGap ?? 0) / P.contactLat.v) * skill * (1 + P.contactWet.v * Math.max(0, ev.water || 0));
  return { p: Math.min(0.9, p), shape, skill };
}
export function contact(race, T, ev, P = INCIDENTS) {
  const h = contactHazard(ev, P);
  if (h.p <= 0) return null;
  const r = race.rng.get("incident:contact:" + ev.a.num);
  if (r.next() >= h.p) return null;
  const W = P.contactOut.v, k = 1 + Math.max(0, ev.dv || 0) / 8;
  const out = pick(r, { none: W.none / k, wing: W.wing * k, puncture: W.puncture * k, out: W.out * k });
  const cause = { overlap: +ev.overlap.toFixed(2), dv: +(ev.dv || 0).toFixed(1), latGap: ev.latGap ?? 0, racecraft: [ev.a.driver?.racecraft ?? null, ev.b.driver?.racecraft ?? null], water: ev.water || 0, p: +h.p.toFixed(4) };
  const effect = { outcome: out, hit: ev.b.num };
  const t = race.state.t;
  if (out !== "none") { dmg(ev.a).aero = Math.min(0.6, dmg(ev.a).aero + 0.05 + 0.15 * r.next()); effect.attackerWing = true; }
  if (out === "wing") { dmg(ev.b).aero = Math.min(0.6, dmg(ev.b).aero + 0.05 + 0.2 * r.next()); applyRC(race, T, ev.b, { place: "none", debris: "light" }, P); }
  if (out === "puncture") { dmg(ev.b).puncture = true; ev.b.inc = { kind: "puncture", until: t + 15 * 60e3, vCap: 30, problem: true }; applyRC(race, T, ev.b, { place: "none", debris: "light" }, P); }
  if (out === "out") retire(race, T, ev.b, "collision", "onTrack", { debris: "heavy" }, P);
  // the stewards: the attacker not far enough alongside (a dive) is to blame; a defender who closed the door on a car
  // that was alongside is; otherwise a racing incident (game rule of thumb)
  if (out !== "none") {
    const fault = ev.overlap < 0.5 ? ev.a : (ev.latGap ?? 1) < 0.3 ? ev.b : null;
    effect.fault = fault ? fault.num : "racing incident";
    if (fault && fault.status !== "dnf") onCollision(race, T, fault);
  }
  return record(race, T, [ev.a.num, ev.b.num], "contact", cause, effect);
}

// ---------- mechanical failure ----------
// inp: { reliab (team: 1 = average, 0 = never fails), attack (share of the last lap in attack pace 0–1), push (share in
// energy push / overtake 0–1), airT (°C), braking (in a braking zone now) }
export function mechHazard(inp, P = INCIDENTS) {
  const rel = Math.max(0, inp.reliab ?? 1);
  if (rel === 0) return { perS: 0 };
  const m = (1 + P.mechAttack.v * (inp.attack || 0)) * (1 + P.mechPush.v * (inp.push || 0)) * (1 + P.mechHot.v * Math.max(0, (inp.airT ?? 25) - 30));
  return { perS: (P.mechPerHour.v * rel * m) / 3600, mult: m };
}
export function mechanical(race, T, car, inp, P = INCIDENTS) {
  if (car.status !== "run") return null;
  const h = mechHazard(inp, P); if (h.perS <= 0) return null;
  const r = race.rng.get("incident:mech:" + car.num);
  if (r.next() >= 1 - Math.exp(-h.perS * DT)) return null;
  const kind = pick(r, P.mechKind.v), t = race.state.t, pos = lapPos(car, T);
  const cause = { reliab: inp.reliab ?? 1, attack: inp.attack || 0, push: inp.push || 0, airT: inp.airT ?? null, mult: +h.mult.toFixed(3) };
  let effect;
  if (kind === "powerLoss") { const f = 0.85 + 0.1 * r.next(); dmg(car).power = Math.min(dmg(car).power, f); effect = { kind, power: +f.toFixed(3) }; }
  else if (kind === "brakes" && inp.braking && r.chance(0.3)) { effect = { kind, ...crash(race, T, car, r, runoffAt(race, T, pos), P) }; }
  else if (car.where === "pit" || (T.pit && T.ahead(pos, T.pit.sIn) < P.coastToPit.v && race.state.control?.flag !== "red")) {
    // close to the pit entry: coasts in and retires in the garage
    car.inc = { kind: "limp", until: t + 10 * 60e3, vCap: 30, problem: true }; car.retireInPit = kind;
    if (car.pit && car.where !== "pit" && (car.pit.phase === "none" || car.pit.phase === "called")) { car.pit.phase = "committed"; car.pit.call = { compound: null, t, armed: true, retire: true }; }
    effect = { kind, out: kind, park: "pit" };
  } else {
    const ro = runoffAt(race, T, pos);
    effect = { kind, out: kind, park: ro === "wall" ? "trackEdge" : "offTrack" };
    retire(race, T, car, kind, effect.park, { runoff: ro, debris: "none", stuck: false }, P);
  }
  return record(race, T, [car.num], "mechanical", cause, effect);
}
// a car limping to retire in the garage: out when it enters the pit lane (the engine calls this on the pit entry)
export function pitEntry(race, T, car) {
  if (!car.retireInPit) return false;
  car.status = "dnf"; car.out = { cause: car.retireInPit, t: race.state.t, lap: lapsOf(car, T) + 1, inPit: true }; car.inc = null;
  return true;
}

// stopped cars still on / beside the track until cleared (traffic avoids them): [{ num, s, d, onTrack }]
export function obstacles(race) { const t = race.state.t; return ist(race).stopped.filter((x) => x.until > t); }
