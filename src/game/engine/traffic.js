// Car-to-car interaction on the lap (DESIGN §8, request §9): bodies with length and width at (s, d), the safe-following
// cap, the wake (dirty air on downforce, slipstream on drag), DRS (2011–2025), 2026 Active Aero and Overtake Mode as
// three separate mechanisms, a per-car state machine for passing and defending, blue flags, team orders, the pit entry
// and the pit-exit merge – and the traffic time account. Pure: no DOM, no clocks, no Math.random (one named RNG stream
// per car, "traffic:<num>", for obeying a team order).
//
// What a step does (engine.js calls these in this order; every decision reads the field as it was at the step start, so
// the order of cars in the array never changes the result):
//   trafficPre(race, t)        decisions from the step-start field: state transitions, the speed caps (safe following,
//                              giving way, lifting), the constrained envelope window (dirty air / lane share / the
//                              defender's inside line), the wing states, the energy scene, effects for the time account
//   trafficEnv(race, car)      what moveLap hands the car model: { vCap, capArr, cdaMul, claMul, heatMul, mode, ot, otLap }
//   pathFactor(race, car)      progress along s per metre driven for a car off the racing line (inside shorter)
//   trafficAccount(…)          ∫(1/v − 1/v_free) ds while the car is under traffic influence
//   trafficPost(race, t, s0)   after all cars moved: the lateral moves (no overlap, on the track), detection lines (DRS /
//                              Overtake), passes on the road (logged where they happen), the body-overlap check
//   mergeClear(race, car)      may a car leave the pit exit road now without forcing anyone off?  onPitExit(race, car)
//
// The state machine (car.traffic.state – what the screen shows; the role says who the other car is):
//   free ─(a car ahead within followGapS)→ follow ─(within prepGapS, closing or DRS/Overtake eligible, a passing place
//   next)→ prepare (stays in the tow, spends energy) ─(predicted gain ≥ k·needed before the braking point)→ pull out
//   (still "prepare", moving to the side) ─(bodies overlap)→ alongside ─(at the corner's turn-in: the car more than half a
//   length ahead keeps the corner; level → the inside car keeps it)→ complete (the other car gives way) | abort (gives
//   way itself, tucks in behind). The car ahead: defend (one move to the inside of the coming corner before the braking
//   point – it then takes the corner on the inside half of the road: the cost), yield (blue flags for a lapped car, a team
//   "swap" order, or the corner lost), merge (pit exit), pitIn (moving to the pit-entry side).
//
// Positions change only because cars move (their s); nothing here swaps an order. The geometry rules that make this safe:
//   • longitudinal: behind a car in its lane (|Δd| < width + mLat) the follower's speed obeys Gipps' safe-following rule;
//   • lateral: a car moves sideways (≤ vLat) only into space no car occupies beside it (|Δs| < length + mLong), and into a
//     lane ahead of / behind another car only where the follower would still be safe without braking harder than it
//     can – so a move never forces another car off or into a crash; the edges of the road bound d.
// test/game/traffic.test.js checks the body rectangles never overlap and |d| stays on the road, every step.
import { TRAFFIC } from "../data/params/traffic.js";
import { computeProfile, makeProfile, comb, vlimAt } from "./profile.js";
import { PHYS } from "../data/params/physics.js";
import { DT, DT_MS } from "./clock.js";
import { stepCar } from "./car.js";
import { waterAt } from "./weather.js";
import RULES_2024 from "../data/rules/2024.js";
import RULES_2025 from "../data/rules/2025.js";
import RULES_2026 from "../data/rules/2026.js";

const G = PHYS.g, RULES = { 2024: RULES_2024, 2025: RULES_2025, 2026: RULES_2026 };
export const STATES = ["free", "follow", "prepare", "alongside", "complete", "abort", "defend", "yield", "merge", "pitIn", "pit"];

export function newTraffic() {
  return { state: "free", ahead: null, gap: null, gapT: null, e: 0, role: null, with: null, ph: null, side: 0, corner: -1, keep: null, since: 0,
    close: 0, lastGap: null, cool: -1, defC: -1, dirty: 0, slip: 0, inf: false, quiet: 0, kind: null, mergeS: 0,
    drs: { elig: -1, open: false, closed: -1 }, aero: { open: 0, front: 0, closed: -1 }, ot: { elig: false, active: false, lapStart: false }, det: {}, otDetT: null, obey: {} };
}

// ---------- setup (race.cache.tc – derived from the scenario, rebuilt on load) ----------
export function trafficSetup(race) {
  const C = race.cache, T = C.T, S = race.state, season = S.season, P = TRAFFIC;
  const rules = race.rules || RULES[season] || RULES[season >= 2026 ? 2026 : 2025];
  const len = P.carLen[season] ?? P.carLen[season >= 2026 ? 2026 : 2025];
  const wid = (rules.dimensions?.value?.maxHalfWidthMm ?? 1000) * 2 / 1000;
  // a reference envelope for the track's corners (first entry's car at a typical race state – geometry only: braking runs,
  // turn-in, apex; never a car's performance)
  const e0 = race.scenario.entries[0], cp = C.cars[e0.num];
  const ref = computeProfile(C.PT, cp, { muTyre: 1, muTrack: C.tau ?? 1, util: 0.993, m: cp.m_min + 50, rho: 1.18, P: cp.P_ice + 100e3, forward: true }, makeProfile(T.n));
  const corners = findCorners(T, ref, { len, wid, P });
  const n = T.n, nextC = new Int32Array(n).fill(-1), inC = new Int32Array(n).fill(-1);
  if (corners.length) for (let i = 0; i < n; i++) {
    let best = -1, bd = Infinity; for (let k = 0; k < corners.length; k++) { const d = T.ahead(i * T.ds, corners[k].brake0); if (d < bd) { bd = d; best = k; } }
    nextC[i] = best;
  }
  for (let k = 0; k < corners.length; k++) { const c = corners[k]; for (let x = 0, m = Math.round(T.ahead(c.brake0, c.apex) / T.ds); x <= m; x++) inC[(Math.round(c.brake0 / T.ds) + x) % n] = k; }
  // samples to the next point where the reference corner speed is below slowV (a corner where downforce matters): the
  // constrained window is skipped on stretches that are flat out for longer than it
  const slowV = 85, nextSlow = new Int32Array(n), big = 1 << 30;
  { let last = big; for (let k = 2 * n - 1; k >= 0; k--) { const i = k % n; if (ref.vc[i] < slowV) last = k; nextSlow[i] = last === big ? big : last - k; } }
  const tc = { P, rules, season, len, wid, corners, nextC, inC, nextSlow, refVf: ref.vf, caps: {}, capWin: {}, dec: {}, prev: {}, onLap: [], otOn: false };
  // the pit lane's sides: where the pit path lies relative to the lap line just after the branch / just before the merge
  if (T.pit) {
    const side = (u) => { const p = T.pit.posAt(u); const q = T.project(p.x, p.y, 80); return q && Math.abs(q.d) > 0.5 ? Math.sign(q.d) : 1; };
    tc.entrySide = side(Math.min(60, T.pit.L * 0.1)); tc.exitSide = side(Math.max(0, T.pit.L - 40));
  }
  // DRS zones and the 2026 Overtake lines (activation: the start of the main-straight Straight-Mode zone, or the longest one;
  // detection otDetectBefore before it – estimates, the event notes are not in the scenario)
  tc.drsZones = rules.drs ? T.zones.drs.filter((z) => z.start != null && z.end != null) : [];
  tc.smZones = rules.activeAero ? T.zones.straight : [];
  if (rules.overtakeMode && T.zones.straight.length) {
    const zs = T.zones.straight, z = zs.find((q) => q.t1) || zs.slice().sort((a, b) => T.ahead(b.start, b.end) - T.ahead(a.start, a.end))[0];
    tc.otAct = z.start; tc.otDet = T.wrap(z.start - P.otDetectBefore);
  }
  // the energy scene: a team mode's budget and SOC floor, with the deploy share of an attack/defence (not for harvest)
  for (const m of Object.keys(C.ep.modes)) if (!m.includes(":")) C.ep.modes[m + ":scene"] = { ...C.ep.modes[m], deployFrac: m === "harvest" ? C.ep.modes[m].deployFrac : Math.max(C.ep.modes[m].deployFrac, P.sceneDeploy) };
  for (const e of race.scenario.entries) tc.caps[e.num] = new Float64Array(n).fill(Infinity);
  C.tc = tc;
  return tc;
}

// Corners from the reference envelope: a braking run (the forward pass meets the braking envelope and speed falls) that
// loses ≥ cornerDv; turn-in = first point where the line's curvature reaches turnInK of its peak; side = + left turn.
// A passing place: a long enough full-throttle run before it, a real braking zone, room for two cars.
function findCorners(T, ref, { len, wid, P }) {
  const n = T.n, vb = ref.vb, vf = ref.vf, kap = T.kappaLine || T.kappa, ds = T.ds;
  const brk = (i) => vf[i] >= vb[i] - 1e-6 && vb[(i + 1) % n] < vb[i] - 1e-6;
  let st = 0; while (st < n && brk(st)) st++;
  const runs = [];
  for (let k = 0; k < n; k++) {
    const i = (st + k) % n; if (!brk(i)) continue;
    let m = 0; while (m < n && brk((i + m) % n)) m++;
    runs.push([i, (i + m) % n]); k += m;
  }
  const out = [];
  for (const [i0, ap] of runs) {
    const dv = vb[i0] - vb[ap]; if (dv < P.cornerDv) continue;
    const m = (ap - i0 + n) % n; let kmax = 0, ksum = 0;
    for (let x = 0; x <= m + 10; x++) { const k = kap[(i0 + x) % n]; if (Math.abs(k) > kmax) kmax = Math.abs(k); ksum += k; }
    let ti = ap; for (let x = 0; x <= m; x++) if (Math.abs(kap[(i0 + x) % n]) >= P.turnInK * kmax) { ti = (i0 + x) % n; break; }
    let w = Infinity; for (let x = 0; x <= m; x++) { const j = (i0 + x) % n; w = Math.min(w, T.wL[j] + T.wR[j]); }
    out.push({ brake0: i0 * ds, turnIn: ti * ds, apex: ap * ds, vIn: vb[i0], vApex: vb[ap], side: ksum >= 0 ? 1 : -1, width: w });
  }
  out.sort((a, b) => a.brake0 - b.brake0);
  for (let k = 0; k < out.length; k++) {
    const c = out[k], prev = out[(k - 1 + out.length) % out.length];
    c.id = k; c.straight = out.length > 1 ? T.ahead(prev.apex, c.brake0) : T.L;
    c.pass = c.straight >= P.passStraight && c.vIn - c.vApex >= P.passDv && c.width >= 2 * wid + P.mLat;
  }
  return out;
}

// ---------- helpers ----------
const live = (c) => c.status === "run" && c.where === "lap";
const rcOf = (car) => car.driver?.p?.racecraft ?? 0.5;
// Gipps (1981): the follower's highest safe speed behind a car at speed vA with `gap` m of road (nose to tail, minus gMin)
function gipps(vA, gap, bF, bL, tau) { const x = Math.max(0, gap) + vA * vA / (2 * bL); return bF * (-tau + Math.sqrt(tau * tau + 2 * x / bF)); }
// braking capacity of a car at speed v in a straight line (m/s²): the envelope's own formula without lateral load
function bCap(race, car, v) {
  const C = race.cache, cp = C.cars[car.num], pr = C.profiles[car.num].prof, m = pr.m > 0 ? pr.m : cp.m_min + 50, mu = pr.mu > 0 ? pr.mu : cp.mu_mech;
  return Math.min(cp.a_brake_max, cp.k_brake * mu * (G + 0.5 * 1.18 * cp.ClA * v * v / m));
}
// The follower f's safe speed behind l with `gap` m of road: Gipps' rule (both cars braking in a straight line, the leader
// assumed a little harder) AND a closing-speed rule v_f ≤ v_l + (gap − gMin)/T_c. The second one is for corners: at the
// lateral limit the friction ellipse leaves almost no braking, so a follower must not arrive close behind a slower car
// with speed to lose – it closes no faster than it could absorb by lifting over T_c.
// (speeds along s: a car off the racing line progresses at v/pathFactor – the caps are in s terms, the engine converts)
function safeV(race, f, l, gap) {
  const P = race.cache.tc.P, vl = l.traffic ? l.v / pathFactor(race, l) : l.v;
  const v1 = gipps(vl, gap - P.gMin, P.bFol * bCap(race, f, f.v), P.bLead * bCap(race, f, vl), P.tau);
  const v2 = vl + Math.max(0, gap - P.gMin) / P.closeT;
  return v1 < v2 ? v1 : v2;
}
// the wake's share at distance x (m) behind: power law through two reference points, capped
const dirtyAt = (P, x) => { if (x <= 0) return P.dirtyMax; const p = Math.log(P.dirty10 / P.dirty20) / Math.LN2; return Math.min(P.dirtyMax, P.dirty10 * Math.pow(10 / x, p)); };
const slipAt = (P, x) => (x <= 0 ? P.slipMax : Math.min(P.slipMax, P.slip10 * Math.pow(10 / x, P.slipP)));
const fade = (P, dd, wid) => { const a = Math.abs(dd) / wid; return a <= P.wakeW0 ? 1 : a >= P.wakeW1 ? 0 : (P.wakeW1 - a) / (P.wakeW1 - P.wakeW0); };
// v0.54: the lap-line distance (m of s) two bodies one behind the other need at s, both at lateral offset d (their mean):
// on a bend the cars drawn at (s, d) are on an arc of radius R = (1 − κd)/|κ| (κ: the lap line's curvature, + left; d + left),
// so a metre of s is (1 − κd) m of road there – on the inside of a hairpin 0.75 m – and two straight boxes on that arc
// meet at their inside corners first: arc 2R·atan(len/2 / (R − w/2)) (the same rule as the replay's renderer/traffic.js
// pairOf). Never less than the plain length (on the outside the plain length is kept: no car drawn closer than before).
// v0.53 kept |Δs| ≥ len on the lap line only: drawn, cars nose to tail on the inside of Hungary's T1 went 0.9 m into
// each other (21 episodes in a race, every one in a hairpin – reports/overlap.md)
export function bodyLen(T, tc, s, d) {
  const k = T.at(T.kappa, s), len = tc.len, f = 1 - k * d;
  if (!(Math.abs(k) > 1 / 400) || f <= 0.2) return len;
  const R = f / Math.abs(k), h = tc.wid / 2, arc = R > h + 1 ? 2 * R * Math.atan(len / 2 / (R - h)) : len;
  return Math.max(len, arc / f);
}
function roadAt(T, s, wid) { return [-T.at(T.wR, s) + wid / 2, T.at(T.wL, s) - wid / 2]; }

// race control's flags when control.js is wired (race.hooks.control); otherwise the season's plain rules
function ctlMay(race, T, a, b) { const h = race.hooks?.control; if (h?.mayOvertake) return h.mayOvertake(race, T, a, b).ok; return race.state.phase === "racing"; }
function ctlDrs(race, T, car) {
  const h = race.hooks?.control; if (h?.drsAllowed) return h.drsAllowed(race, T, car).ok;
  const r = race.cache.tc.rules.drs; if (!r) return false;
  return race.state.phase === "racing" && car.lap >= (r.value.enabledAfterLaps ?? 1) && (race.cache.w.rain ?? 0) < 0.1;
}
function ctlAero(race, T, car) {
  const h = race.hooks?.control; if (h?.activeAeroAllowed) return h.activeAeroAllowed(race, T, car).mode;
  if (!race.cache.tc.rules.activeAero || race.state.phase !== "racing") return "none";
  const c0 = race.cache.tc.corners[0]; if (car.lap < 1 && c0 && car.dist < c0.apex) return "none";   // (after Turn 1 at a standing start)
  return (race.cache.w.rain ?? 0) >= 0.1 ? "partial" : "full";
}
function ctlOt(race, T, car) {
  const h = race.hooks?.control; if (h?.overtakeModeAllowed) return h.overtakeModeAllowed(race, T, car).ok;
  return !!race.cache.tc.rules.overtakeMode && race.cache.tc.otOn && race.state.phase === "racing" && (race.cache.w.rain ?? 0) < 0.1;
}
// a contact candidate: counted by kind; a battle in a braking zone (the turn-in decision) and an unavoidable rear contact are
// handed to incidents.js in its event shape { a (behind), b, overlap (0 nose at the rear wheels … 1 alongside), dv,
// braking, latGap (m), water (mm) } via race.hooks.incidents.contact(race, T, ev) – once per battle; it decides
// consequences (damage, retirement, stewards). A squeeze is only counted.
function contact(race, cand, a = null, b = null) {
  const S = race.state, C = race.cache, T = C.T, tc = C.tc; (S.tstats ||= newStats()).contacts++; S.tstats.byKind = S.tstats.byKind || {}; S.tstats.byKind[cand.kind] = (S.tstats.byKind[cand.kind] || 0) + 1;
  const h = race.hooks?.incidents; if (!h?.contact || !a || !b) return;
  const rel = T.delta(b.s, a.s), overlap = Math.max(0, Math.min(1, (tc.len + rel) / tc.len));   // a behind b: rel ≤ 0
  h.contact(race, T, { a, b, overlap: cand.kind === "rearContact" ? 0.05 : overlap, dv: Math.max(0, a.v - b.v), braking: true,
    latGap: Math.max(0, Math.abs(a.d - b.d) - tc.wid), water: C.surface ? waterAt(C.surface, a.s) : 0, kind: cand.kind });
}
const newStats = () => ({ passes: 0, lapping: 0, aborts: 0, defends: 0, blue: 0, contacts: 0, overlaps: 0, byCorner: {} });
function log(race, e) { race.state.log.push({ t: e.t ?? race.state.t, lap: race.state.leaderLap, ...e }); }

// ---------- before the move ----------
export function trafficPre(race, t) {
  const S = race.state, C = race.cache, T = C.T, tc = C.tc, P = tc.P, len = tc.len, wid = tc.wid;
  S.tstats ||= newStats();
  // the field on the lap, by s (ties by number: no dependence on the array order)
  const L = S.cars.filter(live).sort((a, b) => a.s - b.s || (a.num < b.num ? -1 : 1)), n = L.length;
  tc.onLap = L;
  for (const c of S.cars) if (!live(c)) { const tr = c.traffic; tr.state = c.where === "pit" && c.status === "run" ? "pit" : tr.state; tr.dirty = 0; tr.slip = 0; tr.drs.open = false; tr.aero.open = 0; tr.aero.front = 0; }
  // last step's roles, read-only for everybody this step
  const prev = tc.prev; for (const c of L) { const tr = c.traffic; prev[c.num] = { role: tr.role, with: tr.with, ph: tr.ph, keep: tr.keep, corner: tr.corner, side: tr.side }; }
  const byNum = new Map(L.map((c) => [c.num, c]));
  const teamOrders = S.teamOrders || {};
  for (let i = 0; i < n; i++) {
    const c = L[i], tr = c.traffic, cp = C.cars[c.num], prof = C.profiles[c.num].prof;
    const vLatStep = Math.min(P.vLat, P.vLatFrac * Math.max(c.v, 5)) * DT;
    // neighbours ahead (to 400 m) and behind (to 200 m)
    let nearA = null, nearGap = Infinity, wakeD = 0, slipD = 0, cap = Infinity, why = null;
    for (let k = 1; k < n; k++) {
      const o = L[(i + k) % n], x = T.ahead(c.s, o.s); if (x > 400) break;
      const gap = x - len, dd = o.d - c.d;
      if (gap > 0 && gap < nearGap) { nearGap = gap; nearA = o; }
      // every car ahead in my lane bounds my speed (Gipps); a car beside me (gap < 0) is the lateral rules' business
      // and a car that is not attacking it (nor passing a car letting it by) stays behind it whatever its line: only the
      // overtaking state machine brings a car alongside another – no drifting past in a different lane
      const po = prev[o.num], passing = (tr.role === "att" || tr.role === "done") && tr.with === o.num, letsBy = po && po.role === "yield" && po.with === c.num;
      const inLane = Math.abs(dd) < (gap > P.mLong && !passing ? wid + P.mLat + 2 * vLatStep : wid);
      if (gap > -0.5 * len && gap < 250 && (inLane || (gap > P.mLong && !passing && !letsBy))) { const v = safeV(race, c, o, gap); if (v < cap) { cap = v; why = "follow"; tr.capBy = o.num; } }
      const gT = gap / Math.max(c.v, 10), f = fade(P, dd, wid);
      if (f > 0 && gT < P.dirtyGapS) wakeD = Math.max(wakeD, dirtyAt(P, gap) * f * Math.min(1, (P.dirtyGapS - gT) / 0.5));
      if (f > 0 && gT < P.slipGapS) slipD = Math.max(slipD, slipAt(P, gap) * f * Math.min(1, (P.slipGapS - gT) / 0.3));
    }
    tr.ahead = nearA ? nearA.num : null; tr.gap = nearA ? nearGap : null; tr.gapT = nearA ? nearGap / Math.max(c.v, 10) : null;
    tr.dirty = wakeD; tr.slip = slipD;
    // closing rate on the car ahead (EMA of −d gap/dt), for "am I faster"
    if (nearA && tr.lastGap != null && tr.lastAhead === nearA.num) { const r = (tr.lastGap - nearGap) / DT, a = DT / P.closeTau; tr.close += a * (r - tr.close); } else tr.close = 0;
    tr.lastGap = nearA ? nearGap : null; tr.lastAhead = nearA ? nearA.num : null;
    // ----- the state machine -----
    decide(race, c, tr, { L, i, byNum, prev, nearA, nearGap, teamOrders, t });
    // ----- the speed caps -----
    const w = tr.with != null ? byNum.get(tr.with) : null;
    if (w && (tr.role === "abort" || (tr.role === "yield" && tr.kind === "corner"))) {
      // giving way: drop back to a length + clearance behind it within ≈ yieldT
      const rel = T.delta(w.s, c.s), need = rel + len + P.mLong;
      if (need > 0) { const v = w.v - Math.min(Math.max(P.yieldDv, need / P.yieldT), 0.12 * w.v);   /* (gradual: a sudden drop collects the cars behind) */ if (v < cap) { cap = Math.max(0, v); why = "give way"; } }
    }
    if (w && tr.role === "yield" && (tr.kind === "blue" || tr.kind === "team")) {
      // lift on the straights while the faster car is close behind or beside (not in corners: that would be erratic)
      const rel = T.delta(w.s, c.s), k = Math.abs(T.at(T.kappaLine || T.kappa, c.s));
      if (rel > -(len + P.mLong) && rel < 1.5 * Math.max(w.v, 20) && k < 1 / 400) {
        // lift; and once it is close behind or alongside, run a little slower than it, so it does get by on this straight
        let v = P.liftFrac * vfAt(prof, T, c.s, tc);
        if (rel < 3 * len + 10 && w.v >= P.stopV) v = Math.min(v, w.v - P.yieldDv);
        if (v < cap) { cap = Math.max(P.stopV, v); why = "let by"; }
      }
    }
    tr.cap = cap; tr.capWhy = why;
    // ----- wings: DRS (≤2025) and Straight Mode (2026) – separate systems, separate states -----
    wings(race, c, tr, prof);
    // ----- the constrained envelope window: dirty air (ClA), lane share (alongside in a corner), the defender's line -----
    window(race, c, tr, prof, cp, L, i);
    // influence on the time account
    const eff = (why && cap < vlimAt(prof, C.PT, c.s + c.v * DT) + 0.5 && cap < c.v + 2) || wakeD > 0.003 || slipD > 0.003 || tr.drs.open || tc.capWin[c.num] || (tr.role === "yield");
    if (eff) { tr.inf = true; tr.quiet = 0; } else if (tr.inf) { tr.quiet += DT; if (tr.quiet >= 5) { tr.inf = false; tr.quiet = 0; } }
    tr.state = stateName(tr, why);
  }
}
const vfAt = (prof, T, s, tc) => { const v = prof.vf && prof.vf[T.idx(s)] > 0 ? T.at(prof.vf, s) : T.at(tc.refVf, s); return v; };

function stateName(tr, why) {
  switch (tr.role) {
    case "att": return tr.ph === "along" ? "alongside" : "prepare";
    case "done": return "complete";
    case "abort": return "abort";
    case "def": return tr.ph === "along" ? "alongside" : "defend";
    case "yield": return "yield";
    case "merge": return "merge";
    case "pitIn": return "pitIn";
  }
  return tr.gapT != null && tr.gapT < TRAFFIC.followGapS ? "follow" : "free";
}

function decide(race, c, tr, ctx) {
  const S = race.state, C = race.cache, T = C.T, tc = C.tc, P = tc.P, len = tc.len, wid = tc.wid, { byNum, prev, nearA, nearGap, teamOrders, t } = ctx;
  const nc = tc.nextC[T.idx(c.s)], cor = nc >= 0 ? tc.corners[nc] : null, inK = tc.inC[T.idx(c.s)];
  const setRole = (role, w, ph = null, kind = null) => { if (tr.role !== role || tr.with !== w) tr.since = t; tr.role = role; tr.with = w; tr.ph = ph; tr.kind = kind; if (role !== "att") tr.keep = null; };
  // the pit entry side / the pit exit merge come first (they are not racing)
  if (c.pit.phase === "committed" && T.pit && T.ahead(c.s, T.pit.sIn) < P.entryDist) { setRole("pitIn", null); return; }
  if (tr.role === "pitIn") setRole(null, null);
  if (tr.role === "merge") {
    const vf = vfAt(C.profiles[c.num].prof, T, c.s, tc);
    if (T.ahead(tr.mergeS, c.s) > P.mergeDist && c.v >= 0.9 * vf) setRole(null, null); else return;
  }
  const w = tr.with != null ? byNum.get(tr.with) : null;
  const rel = w ? T.delta(w.s, c.s) : 0;   // + : c ahead of w
  // ----- giving way / yielding -----
  if (tr.role === "yield" || tr.role === "abort") {
    // a yield ends when the other car has gone by, is not moving (nothing to let by – a stopped car is an obstacle to go
    // round, not a car to wait for), is itself giving way (two cars giving way to each other each cap themselves below
    // the other's speed: a spiral to standstill – the 2026 Japan deadlock), or after 20 s (8 s for a corner)
    const pw = w ? prev[w.num] : null, wYields = !!(pw && (pw.role === "yield" || pw.role === "abort"));
    const stale = t - tr.since > (tr.kind === "corner" || tr.role === "abort" ? 8000 : 20000);
    if (!w || rel < -(len + P.mLong) || stale || w.v < P.stopV || (wYields && (tr.kind === "corner" || tr.role === "abort" || pw.with === c.num)) || (rel > len / 2 && tr.kind !== "blue" && tr.kind !== "team")) {
      if (tr.role === "abort") tr.cool = tr.corner;
      if (tr.kind === "team" && w && rel < -(len + P.mLong) && teamOrders[c.teamKey]) { teamOrders[c.teamKey].done = t; log(race, { t, car: c.num, type: "teamOrderDone", cause: "swap", effect: `${w.tla} is ahead` }); }
      setRole(null, null);
    }
    else return;
  }
  // a car behind told me it keeps the corner (it is beside me): give way
  for (const o of ctx.L) {
    const p = prev[o.num]; if (!p || p.with !== c.num) continue;
    if (p.role === "att" && p.keep === o.num && o.v >= P.stopV) { setRole("yield", o.num, null, "corner"); tr.corner = p.corner; return; }
  }
  // two cars side by side that are not an attack pair (after a start, an abort, a pit exit, a lane change in a train):
  // nobody is attacking, so the car behind tucks in behind; at a corner's turn-in the car more than half a length ahead
  // keeps it, level → the inside car (the same rule as for an attack)
  {
    const k = inK >= 0 ? tc.corners[inK] : null, turnIn = k && T.inSpan(c.s, k.turnIn, k.apex);
    for (const o of ctx.L) {
      if (o === c) continue; const r = T.delta(o.s, c.s); if (Math.abs(r) >= len + P.mLong) continue;
      if (Math.abs(o.d - c.d) < wid) continue;
      const po = prev[o.num];
      if ((po && (po.role === "att" || po.role === "def") && po.with === c.num) || ((tr.role === "att" || tr.role === "def") && tr.with === o.num)) continue;   // (the pair's own rule)
      if (po && (po.role === "yield" || po.role === "abort")) continue;   // (it is giving way already – never yield to a yielding car)
      if (o.v < P.stopV) continue;                                       // (nor to a car that isn't moving)
      // not an attack: the status quo – the car that was last clear ahead of the other keeps its place (S.tclear); a pair
      // never seen clear (the start) uses the turn-in rule / the car ahead
      const key = c.num < o.num ? c.num + "|" + o.num : o.num + "|" + c.num, was = S.tclear?.[key];
      const keeper = was != null ? ((was > 0) === (c.num < o.num) ? c : o)
        : turnIn ? (r > len / 2 ? c : r < -len / 2 ? o : (c.d - o.d) * k.side > 0 ? c : o) : (r > 0 || (r === 0 && c.num < o.num) ? c : o);
      if (keeper === o) { setRole("yield", o.num, null, "corner"); tr.corner = inK; return; }
    }
  }
  // blue flags: a car a lap (or more) ahead closing behind me within the rules' gap → let it by
  const blueGap = (tc.rules.blueFlags?.value?.blueGapS ?? 1.2) + P.blueFrom;
  for (const o of ctx.L) {
    if (o === c) continue;
    const x = T.ahead(o.s, c.s) - len; if (x < -len || x > 200) continue;     // o behind me on the road
    if (o.dist - c.dist > T.L / 2 && x / Math.max(o.v, 10) < blueGap && ctlMay(race, T, o, c)) {
      if (tr.role !== "yield") { S.tstats.blue++; log(race, { t, car: c.num, type: "blueFlag", cause: `${o.tla} laps it`, effect: "yields" }); }
      setRole("yield", o.num, null, "blue"); return;
    }
  }
  // team orders: "swap" → the car ahead lets its team-mate (within 1 s behind) by – if the driver obeys (seeded, once)
  for (const o of ctx.L) {
    if (o === c || o.teamKey !== c.teamKey) continue;
    const ord = teamOrders[c.teamKey]; if (!ord || ord.policy !== "swap" || ord.done) continue;
    const x = T.ahead(o.s, c.s) - len; if (x < -len || x > 120 || x / Math.max(o.v, 10) > 1.0 || o.dist > c.dist + T.L / 2) continue;
    if (ord.t0 == null) ord.t0 = t;
    const key = `${c.teamKey}:${ord.t0}`;
    if (tr.obey[key] == null) { tr.obey[key] = race.rng.get("traffic:" + c.num).chance(c.driver?.p?.compliance ?? 0.8); log(race, { t, car: c.num, type: "teamOrder", cause: "swap", effect: tr.obey[key] ? `lets ${o.tla} by` : "ignores the order" }); }
    if (tr.obey[key]) { setRole("yield", o.num, null, "team"); return; }
  }
  // ----- attack -----
  if (tr.role === "done") { if (!w || Math.abs(tr.e) < 0.3 || t - tr.since > 4000) setRole(null, null); }
  if (tr.role === "att") {
    const p = w ? prev[w.num] : null;
    if (!w || !ctlMay(race, T, c, w)) { setRole(null, null); }
    else if (rel >= len + P.mLong) { setRole("done", w.num); }
    else {
      const k = tc.corners[tr.corner];
      if (tr.ph === "prep") {
        const dist = k ? T.ahead(c.s, k.brake0) : Infinity;
        if (nearA !== w || nearGap / Math.max(c.v, 10) > P.prepGapS * 1.3 || (k && dist > T.L / 2)) { tr.cool = tr.corner; setRole(null, null); }
        else if (dist <= P.pullS * c.v && inK < 0) {
          // will I be level by the braking point? the gain over the rest of the straight at the present closing rate (the
          // smoothed one – instantaneous accelerations differ by where each car is on the corner exit)
          const need = nearGap + len / 2, tl = dist / Math.max(c.v, 10), dv = Math.max(c.v - w.v, tr.close), da = 0;
          const gain = Math.max(0, dv) * tl;
          if (race.debugPull) race.debugPull(c, w, { need, gain, dist, dv, da, nearGap });
          // or: held back by it on the straight (the follow cap binds – on its gearbox) with the straight still ahead
          const held = tr.capWhy === "follow" && tr.cap < c.v + 0.5 && nearGap < c.v * 0.35 && dist > P.pullMinS * c.v;
          if (held || gain >= (P.commitK - P.commitR * rcOf(c)) * need || (nearGap < 3 && dv >= 0)) { tr.ph = "out"; tr.side = chooseSide(T, c, w, k, prev[w.num], tc); }
        }
      } else if (tr.ph === "out") {
        const dist = k ? T.delta(k.turnIn, c.s) : -1;   // + : past the turn-in (a move may be completed under braking)
        if (rel > -(len + P.mLong) && Math.abs(c.d - w.d) >= wid + P.mLat - 0.05) tr.ph = "along";
        else if ((!tr.easy && dist > 0) || T.ahead(c.s, w.s) - len > c.v * P.prepGapS * 1.3 || t - tr.since > 15000) { abort(race, c, tr, w, t, tr.easy ? "could not get by" : "not alongside by turn-in"); }
      }
      if (tr.role === "att" && tr.ph === "along") {
        if (rel < -(len + P.mLong) - 1) abort(race, c, tr, w, t, "dropped back");
        else if (tr.keep == null && k) {
          // at turn-in (the leading car of the pair reaches it): who keeps the corner
          const lead = rel >= 0 ? c : w;
          if (T.inSpan(lead.s, k.turnIn, T.wrap(k.apex + 30))) {
            const inside = (c.d - w.d) * k.side > 0 ? c : w;
            const keeper = rel > len / 2 ? c : rel < -len / 2 ? w : inside;
            tr.keep = keeper.num;
            if (race.debugKeep) race.debugKeep(c, w, k, rel, keeper === c, inside === c);
            const behind = rel <= 0 ? c : w, ahead = behind === c ? w : c;
            contact(race, { t, a: behind.num, b: ahead.num, s: c.s, kind: Math.abs(rel) < len / 2 ? "turnInLevel" : "turnIn", dv: behind.v - ahead.v, why: "alongside at turn-in" }, behind, ahead);
            if (keeper === w) abort(race, c, tr, w, t, rel < -len / 2 ? "more than half a length behind at turn-in" : "level on the outside at turn-in");
          }
        } else if (tr.keep == null && !k) tr.keep = null;
        // the corner passed with nobody keeping it (no corner data): re-aim at the next one
        if (tr.role === "att" && k && T.delta(T.wrap(k.apex + 40), c.s) > 0 && T.delta(T.wrap(k.apex + 40), c.s) < 300 && tr.keep !== c.num) { tr.corner = tc.nextC[T.idx(c.s)]; tr.keep = null; }
      }
    }
    if (tr.role === "att") return;
  }
  if (tr.role === "done") return;
  // ----- defend (I am the car ahead) -----
  if (tr.role === "def") {
    const a = w, pa = a ? prev[a.num] : null, k = tc.corners[tr.corner];
    const past = k ? T.delta(T.wrap(k.apex + 20), c.s) > 0 && T.delta(T.wrap(k.apex + 20), c.s) < T.L / 2 : true;
    if (!a || past || !pa || pa.with !== c.num || (pa.role !== "att" && pa.role !== "done")) setRole(null, null);
    else { tr.ph = pa.ph === "along" ? "along" : null; return; }
  }
  for (const o of ctx.L) {
    const p = prev[o.num]; if (!p || p.role !== "att" || p.with !== c.num) continue;
    const k = tc.corners[p.corner]; if (!k) continue;
    if (p.ph === "along") { setRole("def", o.num, "along"); tr.corner = p.corner; return; }
    const x = T.ahead(o.s, c.s) - len, dist = T.ahead(c.s, k.brake0);
    const hold = teamOrders[c.teamKey]?.policy === "hold" && o.teamKey === c.teamKey;
    // (one move, before the attacker has committed to a side – never toward a car already pulling out beside it)
    if (!hold && p.ph === "prep" && tr.defC !== k.id && rcOf(c) >= P.defendR && x / Math.max(o.v, 10) < P.defendGapS && dist > P.defendMinS * c.v && dist < P.defendMaxS * c.v) {
      tr.defC = k.id; setRole("def", o.num); tr.corner = k.id; tr.side = k.side; tr.defD0 = c.d; S.tstats.defends++;
      log(race, { t, car: c.num, type: "defend", cause: `${o.tla} preparing a move`, effect: `covers the inside of corner ${k.id + 1}` });
      return;
    }
  }
  // ----- start an attack on the car ahead -----
  setRole(null, null);
  const a = nearA; if (!a || nearGap / Math.max(c.v, 10) > P.prepGapS) return;
  if (a.teamKey === c.teamKey && teamOrders[c.teamKey]?.policy === "hold") return;
  if (a.dist > c.dist + T.L / 2) { /* a lap ahead: unlapping is allowed – a normal attack */ }
  if (!ctlMay(race, T, c, a)) return;
  // an easy pass (anywhere there is room): the car ahead is letting me by, merging from the pits, or going into them
  // (…or stopped: a car standing in my lane is gone round where there is room – never queued behind at v = 0)
  const pa = prev[a.num], easy = !!(pa && ((pa.role === "yield" && pa.with === c.num) || pa.role === "merge" || pa.role === "pitIn")) || a.v < P.stopV;
  if (tr.cool === nc && a.v >= P.stopV) return;               // (tried and gave up for this corner – not for a stopped car)
  tr.easy = false;
  if (easy) { tr.corner = nc; setRole("att", a.num, "out"); tr.easy = true; tr.side = chooseSide(T, c, a, cor, pa, tc, true); return; }
  if (!cor || !cor.pass) return;
  if (T.ahead(c.s, cor.brake0) > cor.straight + c.v) return;     // (the passing place is not on this straight yet)
  if (inK >= 0) return;                                           // (not while in a corner)
  if (tr.close > P.closeMin || tr.drs.open || tr.drs.elig >= 0 || tr.ot.active) { tr.corner = nc; setRole("att", a.num, "prep"); }
}

function abort(race, c, tr, w, t, why) {
  race.state.tstats.aborts++;
  log(race, { t, car: c.num, type: "attackAborted", cause: why, effect: `stays behind ${w.tla}`, wnum: w.num });
  tr.role = "abort"; tr.with = w.num; tr.ph = null; tr.since = t;
}

// the side to pass on: the inside of the coming corner unless the defender already covers it (then the outside);
// for an easy pass (a car letting it by, merging, much slower): the side away from that car
function chooseSide(T, c, w, k, pw, tc, easy = false) {
  if (easy || !k) return w.d >= T.at(T.line, w.s) ? -1 : 1;
  // the inside unless the defender leaves no room there (less than a car width + clearance to the inside edge)
  const wid = tc.wid, room = k.side > 0 ? T.at(T.wL, w.s) - (w.d + wid / 2) : (w.d - wid / 2) + T.at(T.wR, w.s);
  return room >= wid + 2 * tc.P.mLat ? k.side : -k.side;
}

// wing states for this step (DRS ≤2025: detection-eligible car in a zone; Straight Mode 2026: every car in a zone) – both
// close when the car is about to brake (DRS: the first brake application; 2026: flaps return on braking)
function wings(race, c, tr, prof) {
  const C = race.cache, T = C.T, tc = C.tc, P = tc.P;
  const braking = vlimAt(prof, C.PT, c.s + c.v * P.brakeLook) < c.v - 0.5 || (c.traffic.cap < c.v - 0.5);
  // DRS
  let open = false;
  if (tc.drsZones.length) {
    const k = tc.drsZones.findIndex((z) => T.inSpan(c.s, z.start, z.end));
    if (k >= 0 && tr.drs.elig === k && tr.drs.closed !== k && ctlDrs(race, T, c)) { if (braking) tr.drs.closed = k; else open = true; }
  }
  tr.drs.open = open;
  // Straight Mode
  let ao = 0, af = 0;
  if (tc.smZones.length) {
    const k = tc.smZones.findIndex((z) => T.inSpan(c.s, z.start, z.end));
    if (k < 0) tr.aero.closed = -1;
    else if (tr.aero.closed !== k) {
      const mode = ctlAero(race, T, c);
      if (mode !== "none") { if (braking) tr.aero.closed = k; else { af = 1; ao = mode === "full" ? 1 : 0; } }
    }
  }
  tr.aero.open = open ? 1 : ao; tr.aero.front = af;
}

// The constrained envelope over the next `window` m when something ahead changes the car's own limit:
//   dirty air: ClA × (1 − δ)  (the cause is lost downforce: it scales with v², so slow corners barely feel it);
//   lane share: a car beside another in a corner can't use the whole road. Its effective radius goes from the radius of a
//     path parallel to the reference line in the middle of its lane (share 0) to the racing line's (share 1):
//     R_eff = R_lane + (R_line − R_lane)·share, share = (lane width − car width)/(road width − car width);
//   the defender who moved inside takes the corner on the inside half of the road (its cost for the move).
// The corner limit is the car's own v_c scaled by the closed-form ratio v_c(κ_eff, ClA′)/v_c(κ_line, ClA) (so the
// envelope's band factors carry over), then a backward braking pass with the same friction-ellipse formula as profile.js.
function window(race, c, tr, prof, cp, L, i) {
  const C = race.cache, T = C.T, tc = C.tc, P = tc.P, wid = tc.wid, len = tc.len, cap = tc.caps[c.num];
  // clear the last window
  const old = tc.capWin[c.num]; if (old) { for (let x = 0; x < old[1]; x++) cap[(old[0] + x) % T.n] = Infinity; tc.capWin[c.num] = null; }
  const dirty = tr.dirty > 0.003 ? tr.dirty : 0;
  // the car's lateral path over the look-ahead: from where it is toward the racing line at vLat, inside any lane bound
  // (a car beside it up to this corner's apex; the defender's inside half up to the apex)
  let lane = null, laneTo = -1;
  const inK = tc.inC[T.idx(c.s)], k = inK >= 0 ? tc.corners[inK] : null, n = T.n, ds = T.ds, i0 = (T.idx(c.s) + 1) % n;
  if (k) {
    let lo = -Infinity, hi = Infinity, beside = false;
    for (const o of L) {
      if (o === c || Math.abs(T.delta(o.s, c.s)) >= len + P.mLong) continue;
      beside = true; if (o.d > c.d) hi = Math.min(hi, o.d - wid - P.mLat); else lo = Math.max(lo, o.d + wid + P.mLat);
    }
    const def = tr.role === "def" && tr.corner === inK && tr.ph !== "along";
    if (def) { if (k.side > 0) lo = Math.max(lo, wid / 2); else hi = Math.min(hi, -wid / 2); }
    if (beside || def) { lane = { lo: Math.min(lo, c.d), hi: Math.max(hi, c.d) }; laneTo = Math.round(T.ahead(c.s, k.apex) / ds); }
  }
  const off = Math.abs(tr.e) > 0.3;
  if (!dirty && !lane && !off) return;
  const NW = Math.ceil(P.window / ds);
  if (tc.nextSlow[i0] > NW) return;                               // (flat out beyond the look-ahead: nothing to change)
  const N = Math.min(NW, tc.nextSlow[i0] + 40), eRate = Math.min(P.vLat, P.vLatFrac * Math.max(c.v, 5)) * ds / Math.max(c.v, 10);
  const m = prof.m > 0 ? prof.m : cp.m_min + 50, mu = prof.mu > 0 ? prof.mu : cp.mu_mech, rho = c.profIn?.rho ?? 1.18;
  const kl0 = 0.5 * rho * cp.ClA / m, kl = kl0 * (1 - dirty), kd = 0.5 * rho * cp.CdA / m, kap = T.kappaLine || T.kappa;
  const vMax = PHYS.vMax, kB = cp.k_brake, aBmax = cp.a_brake_max, fMin = cp.f_comb ?? 0, Crr = PHYS.Crr;
  const vcf = (k_, kl_) => { const den = k_ - mu * kl_; return den > 1e-9 ? Math.min(vMax, Math.sqrt(mu * G / den)) : vMax; };
  let vNext = 0, any = false;
  for (let x = N - 1; x >= 0; x--) {
    const j = (i0 + x) % n, kl_ = Math.abs(kap[j]);
    // where the car can be at that sample: toward the racing line from its present d at vLat, inside its lane; its path
    // there is parallel to the racing line at offset e: curvature κ/(1 − κ·e) (inside tighter, outside wider)
    let ke = kl_;
    if (off || lane) {
      const ln = T.line[j], step = eRate * x;
      let dx = c.d + Math.max(-step, Math.min(step, ln - c.d));
      if (lane && x <= laneTo) dx = Math.max(lane.lo, Math.min(lane.hi, dx));
      const e = dx - ln;
      if (Math.abs(e) > 0.05) { const kk = kap[j], f = 1 - kk * e; ke = Math.abs(kk / (f > 0.5 ? f : 0.5)); }
    }
    let vc = prof.vc[j];
    if (ke !== kl_ || dirty) { const r = vcf(ke, kl) / vcf(kl_, kl0); vc = Math.min(vMax, vc * r); }
    let v;
    if (x === N - 1) v = Math.min(vc, prof.vb[j]);
    else {
      const v2 = vNext * vNext, aTot = mu * (G + kl * v2), aLat = v2 * ke, f = comb(aLat / aTot, fMin);
      let aB = kB * aTot * f; if (aB > aBmax) aB = aBmax;
      let dec = aB + kd * v2 + Crr * G + G * T.grade[j]; if (dec < 0) dec = 0;
      v = Math.min(vc, Math.sqrt(v2 + 2 * ds * dec));
    }
    vNext = v;
    if (v < prof.vb[j] - 1e-6) { cap[j] = v; any = true; }
  }
  if (any) tc.capWin[c.num] = [i0, N]; else for (let x = 0; x < N; x++) cap[(i0 + x) % n] = Infinity;
}

// ---------- what the car model gets ----------
export function trafficEnv(race, car) {
  const C = race.cache, tc = C.tc, tr = car.traffic, cp = C.cars[car.num], P = tc.P;
  let cda = 1 - tr.slip, cla = 1 - tr.dirty;
  if (tr.drs.open) { cda *= cp.drs?.cdaMul ?? 1; cla *= cp.drs?.claMul ?? 1; }
  if (tr.aero.open || tr.aero.front) {
    const sm = cp.straightMode || { cdaMul: 1, claMul: 1 }, k = tr.aero.open ? 1 : P.aeroPartial;
    cda *= 1 - (1 - sm.cdaMul) * k; cla *= 1 - (1 - sm.claMul) * k;
  }
  // the energy scene: attack and defence spend deploy (the team's mode sets the budget; harvest = no boost); a 2026 car
  // with Overtake active uses it in an attack (or always when the team mode is "overtake")
  const base = car.mode.energy, scene = tr.role === "att" || tr.role === "def";
  let mode = scene && base !== "harvest" ? base + ":scene" : base;
  if (tr.ot.active && ((scene && base !== "harvest") || base === "overtake")) mode = "overtake";
  return { aLift: P.aLift, vCap: tr.cap ?? Infinity, capArr: tc.capWin[car.num] ? tc.caps[car.num] : null, cdaMul: cda, claMul: cla, heatMul: 1 + P.dirtyHeat * tr.dirty, mode, ot: tr.ot.active, otLap: tr.ot.lapStart };
}

// progress along s per metre driven, for a car off the racing line: a path parallel to the racing line at offset e is
// (1 − κ_line·e) long per metre of the line (e and κ + to the left: the inside is shorter) – documented approximation
export function pathFactor(race, car) {
  const T = race.cache.T, e = car.traffic.e; if (Math.abs(e) < 0.05) return 1;
  const f = 1 - T.at(T.kappaLine || T.kappa, car.s) * e;   // (a path parallel to the racing line at offset e)
  return f < 0.7 ? 0.7 : f > 1.3 ? 1.3 : f;
}

// The traffic time account (DESIGN §12): time lost because of other cars = ∫(1/v − 1/v_free) ds. v_free is not a table or
// an envelope speed: when traffic starts to influence a car (a cap, the wake, DRS, a lane, giving way) a free "ghost" of
// it starts at its place and speed, with a COPY of its tyre and energy state, and is integrated each step with the same car,
// tyre and energy models and its own envelope (recomputed every 2 s from its own grip and mass) – only without the
// traffic. So what following does to the tyres (heat in the wake) and the battery (deploy in attack scenes, harvesting
// behind a slow car) is part of the loss, as it should be: it is caused by the car ahead. The loss is the car's time at a
// distance minus the ghost's time at the same distance (ghost crossing times every 10 m). The episode ends 5 s after the
// last influence and at the pit entry (a new ghost starts if one got further ahead than its 1.6 km history – a very long
// train). Negative = the tow / DRS made the car faster. The engine supplies the models through `G` (engine.js
// ghostModels): start(gh) copies the state, env(gh) → { env, prof, … } for stepCar, after(gh, gs, ge) steps tyre/energy.
// Exactness: test/game/traffic.test.js and reports/traffic.md compare it with real solo runs of the same car.
const BIN = 10, HMAX = 160;
export function trafficAccount(race, car, G) {
  const S = race.state, C = race.cache, T = C.T, tr = car.traffic, t = S.t + DT_MS;   // (step end time: S.t is updated after the moves)
  let gh = tr.gh;
  // (episode over; or the ghost ran further ahead than its 10 m history covers: close it and start a new one)
  if (gh && (!tr.inf || gh.x - (car.dist - gh.d0) > (HMAX - 2) * BIN)) { tr.gh = gh = null; }
  if (!gh) { if (tr.inf) { tr.gh = { s: car.s, v: car.v, x: 0, d0: car.dist, base: car.acct.traffic, h0: 0, h: [t] }; G.start(race, car, tr.gh); } return; }
  const ge = G.env(race, car, gh, t);
  const gs = { s: gh.s, v: gh.v, lap: 0, aLong: 0, aLat: 0, pDrive: 0, pBrake: 0, crossed: false, tCross: 0, limited: false, over: 0 };
  stepCar(gs, C.PT, ge.prof, C.cars[car.num], ge.env, DT);
  G.after(race, car, gh, gs, ge, t);
  const dx = T.ahead(gh.s, gs.s) + (gs.crossed && gs.s >= gh.s ? T.L : 0), x0 = gh.x;
  gh.s = gs.s; gh.v = gs.v; gh.x += dx;
  while ((gh.h0 + gh.h.length) * BIN <= gh.x && dx > 0) { const xb = (gh.h0 + gh.h.length) * BIN; gh.h.push(t - DT_MS + Math.round(DT_MS * (xb - x0) / dx)); }
  while (gh.h.length > HMAX) { gh.h.shift(); gh.h0++; }
  const xc = car.dist - gh.d0;
  let loss;
  if (xc > gh.x) loss = -(xc - gh.x) / Math.max(gh.v, 10);
  else {
    const f = xc / BIN - gh.h0;
    if (f < 0) loss = (t - gh.h[0]) / 1000 + (gh.h0 * BIN - xc) / Math.max(car.v, 10);
    else { const k = Math.floor(f), a = gh.h[k], b = k + 1 < gh.h.length ? gh.h[k + 1] : t, tg = a + (b - a) * (f - k); loss = (t - tg) / 1000; }
  }
  car.acct.traffic = gh.base + loss;
}
// the episode ends now (pit entry, retirement): the account keeps what was measured
export function trafficEnd(race, car) { car.traffic.gh = null; car.traffic.inf = false; car.traffic.quiet = 0; }

// ---------- after the move ----------
export function trafficPost(race, t, s0of) {
  const S = race.state, C = race.cache, T = C.T, tc = C.tc, P = tc.P, len = tc.len, wid = tc.wid;
  const L = S.cars.filter(live);
  // 1. lateral moves, leader first (by race distance; ties by number): each car respects the cars already moved and the
  //    present place of those not yet moved – staying where it is is always possible, so the order never forces an overlap
  const ord = L.slice().sort((a, b) => b.dist - a.dist || (a.num < b.num ? -1 : 1));
  // a car not yet moved is respected where it IS (its d at the step start): keeping that d is always open to it
  const done = new Set();
  for (const c of ord) {
    const tr = c.traffic, line = T.at(T.line, c.s), [dMin, dMax] = roadAt(T, c.s, wid);
    const step = Math.min(P.vLat, P.vLatFrac * Math.max(c.v, 5)) * DT;
    const dCur = Math.max(dMin, Math.min(dMax, line + tr.e));
    const want = targetD(race, c, tr, line, dMin, dMax);
    let dW = dCur + Math.max(-step, Math.min(step, want - dCur));
    // forbidden lateral intervals: cars beside (bodies would touch) and lanes ahead/behind that would be unsafe to enter
    const forb = [];
    for (const o of L) {
      if (o === c) continue;
      const rel = T.delta(o.s, c.s); if (rel > 150 || rel < -150) continue;
      const od = o.d, half = wid + P.mLat, bl = Math.abs(rel) < 30 ? bodyLen(T, tc, c.s + rel / 2, (c.d + od) / 2) : len;
      if (Math.abs(rel) < bl + P.mLong) { forb.push([od, half, true]); continue; }
      if (Math.abs(rel) > 150) continue;
      if (rel < 0) { // o ahead of c: entering its lane must leave c a safe following speed
        if (c.v > safeV(race, c, o, -rel - bl)) forb.push([od, half, false]);
      } else {       // o behind: cutting in front of it must not make it brake harder than it can
        if (o.v > safeV(race, o, c, rel - bl)) forb.push([od, half, false]);
      }
    }
    let dN = clampLat(c.d, dW, dMin, dMax, forb);
    if (dN == null) {   // no room from the line-following place: keep the lateral it had (the cars beside respected it)
      dN = clampLat(c.d, c.d, Math.min(dMin, c.d), Math.max(dMax, c.d), forb.filter((f) => f[2]));
      if (dN == null) { dN = c.d; if (race.debugSqueeze) race.debugSqueeze(c, forb, dMin, dMax); contact(race, { t, a: c.num, b: null, s: c.s, kind: "squeeze", why: "no room either side" }); }
    }
    c.d = dN; tr.e = dN - line; done.add(c.num);
  }
  // 2. detection lines (DRS zones, 2026 Overtake) and lap starts
  const sorted = L.slice().sort((a, b) => a.s - b.s || (a.num < b.num ? -1 : 1)), n = sorted.length;
  const aheadOf = (c) => { const i = sorted.indexOf(c); for (let k = 1; k < n; k++) { const o = sorted[(i + k) % n]; if (o !== c) return o; } return null; };
  // two passes: first every car's crossing times this step, then the eligibility – a gap measured against a car that
  // crossed the same line in the same step must see that car's new time whatever the cars' order in the array
  const cross = new Map();
  for (const c of L) {
    const s0 = s0of.get(c.num); if (s0 == null) continue;
    const tr = c.traffic, moved = T.ahead(s0, c.s); if (moved <= 0 || moved > 50) continue;
    const at = (x) => { const d = T.ahead(s0, x); return d > 0 && d <= moved ? t - DT * 1000 + Math.round((d / moved) * DT * 1000) : null; };
    const x = { det: tc.drsZones.map((z) => at(z.detect ?? z.start)), end: tc.drsZones.map((z) => at(z.end)), ot: tc.otDet != null ? at(tc.otDet) : null, act: tc.otAct != null ? at(tc.otAct) : null };
    x.det.forEach((tx, k) => { if (tx != null) tr.det[k] = tx; });
    if (x.ot != null) tr.otDetT = x.ot;
    cross.set(c.num, x);
  }
  for (const c of L) {
    const x = cross.get(c.num); if (!x) continue;
    const tr = c.traffic;
    x.det.forEach((tx, k) => {
      if (tx == null) return;
      const o = aheadOf(c), to = o?.traffic.det[k];
      tr.drs.elig = o && to != null && tx - to < (tc.rules.drs.value.detectionGapS ?? 1) * 1000 && tx - to >= 0 ? k : -1;
    });
    x.end.forEach((tx, k) => { if (tx != null) { if (tr.drs.elig === k) tr.drs.elig = -1; if (tr.drs.closed === k) tr.drs.closed = -1; } });
    if (tc.otDet != null) {
      if (x.ot != null) {
        const o = aheadOf(c), to = o?.traffic.otDetT;
        tr.ot.elig = !!(o && to != null && x.ot - to >= 0 && x.ot - to < (tc.rules.overtakeMode.value.detectionGapS ?? 1) * 1000);
        if (!tc.otOn && S.order[0] === c.num) tc.otOn = true;    // (enabled when the leader first crosses the Detection Line)
      }
      if (x.act != null) { tr.ot.active = tr.ot.elig && ctlOt(race, T, c); tr.ot.elig = false; }
    }
  }
  for (const c of L) { const tr = c.traffic; if (tr.lapSeen !== c.lap) { tr.ot.lapStart = tr.ot.active; tr.lapSeen = c.lap; } }
  // 3. passes on the road: a pair's "clear ahead by a body length" relation flips (y was clear ahead of x, now x is clear
  //    ahead of y) – two cars side by side swapping 'ahead' by centimetres, or a car that was already ahead getting clear,
  //    are not passes. The last clear relation of each pair that came close is kept in the state (saved).
  const clr = S.tclear || (S.tclear = {});
  for (let a = 0; a < n; a++) {
    const x = sorted[a];
    for (let k = 1; k < n; k++) {
      const y = sorted[(a + k) % n], ahead = T.ahead(x.s, y.s); if (ahead > 60) break;
      const key = x.num < y.num ? x.num + "|" + y.num : y.num + "|" + x.num, sgn = x.num < y.num ? 1 : -1;   // + : the first-named is ahead
      if (ahead >= len) {               // y clear ahead of x
        const now = -sgn, was = clr[key];
        if (was === -now && s0of.has(x.num) && s0of.has(y.num)) passed(race, y, x, t);
        clr[key] = now;
      }
    }
  }
  // 4. contacts. The rules above prevent overlaps in normal driving; what is left is a car that physically could not avoid
  // the car ahead (closing at the lateral limit in a corner, where the friction ellipse leaves no braking, on a car that
  // slowed). That is a collision: resolved inelastically – the car behind ends a body length behind at the speed of the
  // car it hit – logged with its closing speed and handed to incidents (race.hooks.incidents.onContact) for consequences.
  // The bodies never overlap in the state.
  // (v0.54: from the front of the queue back – a car held back is then checked against the one behind it after, not
  // before: Monaco, a car pushed back by its own contact into the car that had just been resolved behind it)
  for (let a = n - 1; a >= 0; a--) for (let k = 1; k < Math.min(n, 6); k++) {
    const x = sorted[a], y = sorted[(a + k) % n], rel = T.ahead(x.s, y.s);
    if (rel >= 2.5 * len || Math.abs(x.d - y.d) >= wid) continue;
    const bl = bodyLen(T, tc, x.s + rel / 2, (x.d + y.d) / 2); if (rel >= bl) continue;
    // (apart on the lap line but not on the road – the bend tightened faster than the follower dropped back: it is held
    // back – at most 0.25 m a step – at the other's speed; no contact: the bodies did not touch on the lap line)
    if (rel >= len) {
      // (never into a car behind it: the push ends a body length ahead of any car in its lane behind)
      let push = Math.min(0.25, bl - rel + 0.01);
      for (let q = 1; q < Math.min(n, 6); q++) { const w = sorted[(a - q + n) % n]; if (w === y) break; const g = T.ahead(w.s, x.s); if (g > len + 1) break; if (Math.abs(w.d - x.d) < wid) push = Math.min(push, Math.max(0, g - len - 0.01)); }
      if (push <= 0) continue; x.s = T.wrap(x.s - push); x.dist -= push; x.v = Math.min(x.v, y.v); S.tstats.bendHolds = (S.tstats.bendHolds || 0) + 1; continue; }
    if (race.debugOverlap) race.debugOverlap(x, y, rel);
    const dv = x.v - y.v, push = bl - rel + 0.01;
    x.s = T.wrap(x.s - push); x.dist -= push; x.v = Math.min(x.v, y.v);
    // one contact per pair per 3 s (a car still pressing on the next steps is the same contact, not a new one)
    const ck = x.num + ">" + y.num, last = (S.tcontact ||= {})[ck]; S.tcontact[ck] = t;
    if (last != null && t - last < 3000) continue;
    S.tstats.overlaps++;
    log(race, { t, car: x.num, type: "contact", cause: `closing ${dv.toFixed(1)} m/s on ${y.tla} (${x.traffic.state})`, effect: "light contact – behind it at its speed", on: y.num, s: +x.s.toFixed(1), dv: +dv.toFixed(2) });
    contact(race, { t, a: x.num, b: y.num, s: x.s, kind: "rearContact", dv, why: "could not slow in time" }, x, y);
  }
}

// where the car wants to be laterally (before the rate limit and the room checks)
function targetD(race, c, tr, line, dMin, dMax) {
  const C = race.cache, T = C.T, tc = C.tc, P = tc.P, wid = tc.wid;
  const edge = (side) => (side > 0 ? dMax : dMin);
  switch (tr.role) {
    case "pitIn": return edge(tc.entrySide ?? 1);
    case "merge": return edge(tc.exitSide ?? 1);
    case "yield": if (tr.kind !== "corner") return line > 0 ? Math.max(dMin, line - (wid + P.mLat + 0.5)) : Math.min(dMax, line + wid + P.mLat + 0.5); return line;
    case "def": {
      if (tr.ph === "along") return line + tr.e;
      const k = tc.corners[tr.corner]; if (!k) return line;
      const past = T.inSpan(c.s, k.apex, T.wrap(k.apex + 200)); if (past) return line;
      // covering the inside: one move of at most defendMove × width toward the inside edge (not a lane change across the
      // road), never closer to the edge than 0.8 width; the move's start point is fixed when it is decided (tr.defD0)
      const cover = 0.8 * wid, d0 = tr.defD0 ?? c.d, mv = P.defendMove * wid;
      return k.side > 0 ? Math.min(dMax - cover, d0 + mv) : Math.max(dMin + cover, d0 - mv);
    }
    case "att": {
      if (tr.ph === "prep") return line;
      const w = race.state.cars.find((x) => x.num === tr.with); if (!w) return line;
      if (tr.ph === "along") return line + tr.e;
      // beside the car ahead, relative to the racing line (both follow the line's shape – no weaving behind it)
      return Math.max(dMin, Math.min(dMax, line + w.traffic.e + tr.side * (wid + P.mLat + 0.3)));
    }
  }
  return line;
}

// the reachable lateral position nearest the wish, inside the road. Each other car bounds the side the car is on: a car
// beside it (hard: bodies plus clearance – a small forced step away is allowed when the line's shape squeezed them), a lane
// ahead/behind that would be unsafe to enter (soft: ignored when the car is already in it – the follow cap handles that).
// dPrev: where the car was (its side of each other car, and whether it was already in that lane, are judged from there –
// the racing line's shape must not carry a car into a lane it could not have entered by moving)
function clampLat(dPrev, dW, dMin, dMax, forb) {
  let lo = dMin, hi = dMax;
  for (const [od, half, hard] of forb) {
    if (!hard && Math.abs(dPrev - od) < half) continue;
    if (dPrev >= od) lo = Math.max(lo, od + half); else hi = Math.min(hi, od - half);
  }
  if (lo > hi + 1e-9) return null;
  return Math.max(lo, Math.min(hi, dW));
}

function passed(race, c, o, t) {
  const S = race.state, C = race.cache, T = C.T, tc = C.tc;
  const lapping = Math.abs(c.dist - o.dist) > T.L / 2;
  const k = tc.nextC[T.idx(T.wrap(c.s - 150))], cor = tc.corners[k];
  const where = cor && T.ahead(cor.brake0 - 150, c.s) < T.ahead(cor.brake0 - 150, cor.apex) + 150 ? `T${k + 1}` : "straight";
  const drsZ = tc.drsZones.findIndex((z) => T.inSpan(c.s, z.start, T.wrap(z.end + 300)));
  const tr = c.traffic, ot = o.traffic;
  const why = ot.role === "yield" ? ot.kind : ot.role === "pitIn" ? "pit entry" : ot.role === "merge" ? "pit exit" : tr.drs.open ? "DRS" : tr.ot.active ? "Overtake" : tr.slip > 0.02 ? "tow" : "pace";
  if (lapping) S.tstats.lapping++;
  else { S.tstats.passes++; const key = where; S.tstats.byCorner[key] = (S.tstats.byCorner[key] || 0) + 1; }
  log(race, { t, car: c.num, type: lapping ? "lapping" : "overtake", cause: why, effect: `passes ${o.tla} at ${where}${drsZ >= 0 ? " (DRS zone " + (drsZ + 1) + ")" : ""}`, on: o.num, s: +c.s.toFixed(1), where, mech: why, via: tr.role || tr.state, ovia: ot.role || ot.state });
}

// ---------- the pit exit ----------
// May the car on the pit exit road join the lap now? The spot at the merge must be free and a car coming on that side must
// be able to follow safely without braking hard (the merging car must not force anyone off) – else it waits at the blend.
export function mergeClear(race, car) {
  const S = race.state, C = race.cache, T = C.T, tc = C.tc, P = tc.P, len = tc.len, wid = tc.wid;
  if (!tc || !T.pit) return true;
  const s = T.pit.sOut, [dMin, dMax] = roadAt(T, s, wid), d = (tc.exitSide ?? 1) > 0 ? dMax : dMin, v = car.pit.v;
  for (const o of S.cars) {
    if (!live(o) || o === car) continue;
    const rel = T.delta(s, o.s);  // + : o ahead of the merge point
    if (Math.abs(o.d - d) >= wid + P.mLat + 1) continue;
    if (Math.abs(rel) < len + P.mLong + 2) return false;
    if (rel < 0 && rel > -400) {
      const gap = -rel - len, vs = safeV(race, o, { num: car.num, v, s }, gap);
      if (o.v > vs || (o.v > v && gap / (o.v - v) < P.mergeT)) return false;
    }
  }
  return true;
}
// a car comes onto the lap from the pit exit (or a pit-lane start): it stays on the exit side for the blend distance
export function onPitExit(race, car) {
  const C = race.cache, T = C.T, tc = C.tc, tr = car.traffic, [dMin, dMax] = roadAt(T, car.s, tc.wid);
  car.d = (tc.exitSide ?? 1) > 0 ? dMax : dMin; tr.e = car.d - T.at(T.line, car.s);
  tr.role = "merge"; tr.with = null; tr.ph = null; tr.mergeS = car.s; tr.state = "merge"; tr.inf = false;
}
// at the grid: the scenario's slots, staggered left/right when the feed snapped them onto one line (1×1 staggered grid,
// SR 42.5 / B: rows 8 m apart, alternate sides); pole on the racing line's side at the grid
export function gridLateral(race) {
  const S = race.state, C = race.cache, T = C.T, tc = C.tc, wid = tc.wid;
  const g = S.cars.filter((c) => c.grid != null && !c.pitStart).sort((a, b) => a.grid - b.grid);
  if (g.length < 2) return;
  const staggered = g.every((c, i) => i === 0 || Math.abs(c.d - g[i - 1].d) >= wid + tc.P.mLat);
  const poleSide = Math.sign(T.at(T.line, g[0].s)) || 1;
  for (const c of g) {
    if (!staggered) c.d = (c.grid % 2 === 1 ? poleSide : -poleSide) * (wid / 2 + tc.P.mLat / 2 + 0.6);
    const [dMin, dMax] = roadAt(T, c.s, wid); c.d = Math.max(dMin, Math.min(dMax, c.d));
    c.traffic.e = c.d - T.at(T.line, c.s);
  }
}

// ---------- the screen (DESIGN §13.1: game state, never real telemetry) ----------
export function snapTraffic(car) {
  const tr = car.traffic;
  return { d: car.d, aero: { open: tr.aero.open, front: tr.aero.front }, drs: !!tr.drs.open, overtake: !!tr.ot.active, traffic: tr.state, with: tr.with };
}
// the pass statistics of a race (tools / results)
export const trafficStats = (race) => race.state.tstats || newStats();
