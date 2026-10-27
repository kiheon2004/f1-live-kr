// The support cars and the start's rear-of-grid official – what each is doing at the moment shown (pure; map3d.js
// draws it). Research: docs/research/support_cars_start.md.
//
// Safety car (SC): its own place comes in the timing feed while it is on the track (Position "241"–"243" – replay.js
// supportAt; none while it waits): drawn there, "data". Otherwise, in a race, it waits at the end of the pit lane
// (Mayländer; 2025 Art. 55.2 / 2026 B5.2.1: to its standby place before the start) – drawn parked there, an estimate of
// the spot. Never two: the parked one only while the feed has none on track. Out (TrackStatus 4) with no place in the
// feed: not drawn ("unseen"). Its place ended by the pit lane (it comes in as the status turns green): on through the
// lane to its parking place – a reproduction. A virtual safety car (TrackStatus 6 / 7) sends no car out – none is made up.
// Medical car: no data at all – a reproduction, said so: behind the last row while the field stands on the grid, after
// the start following the last car on the road round the first lap (followTarget), through the pit lane from its entry
// at the lap's end (medicalLap1 – found in the positions; live: provisional until they have it), parked at the pit exit
// after. No lap end in the data: not followed past 150 s and not parked on a guess – not shown until lap 3.
// The rear-of-grid official: once the field stands, a marshal at the back of the grid – on the track, on the medical
// car's side, by the medical car behind the last row (the user's observation of F1 starts; flagSpot) – waves the green
// flag to tell the starter all cars are stationary; then steps off the track before the lights (never into the pit
// lane). FIA Appendix H 2026 2.5.5 g has the marshal behind a barrier opening or far from the edge: kept for the step
// off only (flagSpot). No time in the data: a reproduction of the order only, ahead of the lights' own estimate; it
// never moves the start.
// None of them is a competitor: not in the standings, lap counts, grid or driver counts (they never enter those paths).

export const SUPPORT = {
  medLag: 2500,          // ms behind the car it follows (that car's path at t − lag)
  medLap: 150000,        // a first lap followed this long without its end in the data – then the medical car isn't shown
                         // (not taken for the lap's end) until the race is on lap 3 (parked by then)
  gridWait: 120000,      // the medical car is seen behind the grid this long before the lights at most
  flag: [-21000, -15000], // the official's green flag, ms from lights out (estimate: before the pre-start and the lights)
  leave: [-15000, -12000], // walking off the track, ms from lights out
  laneSpeed: 16.7,       // m/s through the pit lane to its parking place (60 km/h, under the limiter – a reproduction)
  trackSpeed: 22,        // m/s from its last place on the track to the pit entry (~80 km/h – a reproduction)
  fresh: 1500,           // ms: a support car's sample older than this is no longer "where it is" (the feed ~4 a second)
};

// Which support car the feed's places are: in 55 cached sessions 2024–26 (v0.38 audit, ~/projects/f1kr-work/v038/
// sc_audit.jsonl) exactly one of 241–243 had a place at a time, from the moment TrackStatus turned "4" to the moment it
// left it (within 1 s, 29 periods) – never during a VSC, never two at once, and which number varies by event (the
// research: three safety car units, the number not the make). So a place while the status is (or just was) "4" is the
// safety car's; one at any other time is a support car whose role isn't known – drawn as such, never called the SC.
// Several at once (not seen yet): the freshest sample, then the lowest number – the others reported, not drawn.
//   sc: { num: [x, y, z] } · ages: { num: ms since its last sample } → { num, pos, others: [num] } | null
export function pickSupport(sc = {}, ages = {}) {
  const on = Object.entries(sc || {}).filter(([n, p]) => p && (p[0] || p[1]) && (ages[n] ?? 0) <= SUPPORT.fresh);
  if (!on.length) return null;
  on.sort(([a], [b]) => (ages[a] ?? 0) - (ages[b] ?? 0) || +a - +b);
  return { num: on[0][0], pos: on[0][1], others: on.slice(1).map(([n]) => n) };
}

// t: the moment shown; status: TrackStatus.Status at t ("1" green, "2" yellow, "4" SC, "5" red, "6" VSC, "7" VSC
// ending); sc / ages: the support cars' places at t and the age of each one's last sample (supportAt); scRecent: the
// status was "4" within the last few seconds; scLast: the last support-car sample before t when none is fresh –
// { num, t, laneU (m along the pit lane of the nearest point, null: not by the pit lane), toEntry (m along the track to
// the pit entry, ≤ 800; null: not on the way) } –; parkU: the pit lane's end (the SC parks 4 m short of it, the medical
// car 14 m); start: the race's first standing start as shown ({ t, standing }) or null;
// lap1: when the medical car reached the pit entry after lap 1 – { t (ms) | null, final } (final: the data has said –
// t null then means not found); lap: the race's lap count at t; race: a race or sprint session.
// → { sc: { mode: "track" | "returning" | "parked" | "unseen", role?, num?, pos?, u?, from } | null, vsc,
//     medical: { mode: "parked" | "gridRear" | "following" | "entering" | "unknown", u?, from } | null,
//     official: { phase: "flag" | "leave", f (0–1) } | null }
export function supportPlan({ t, status = null, sc = {}, ages = {}, scRecent = false, scLast = null, parkU = null, start = null, lap1 = null, lap1End, lap = null, race = false } = {}) {
  const S = SUPPORT, out = { sc: null, vsc: status === "6" || status === "7", medical: null, official: null };
  const pick = pickSupport(sc, ages);
  if (pick) out.sc = { mode: "track", role: status === "4" || scRecent ? "sc" : "unknown", num: pick.num, pos: pick.pos, others: pick.others, from: "data" };
  // (the safety car out but its place not in the feed – Monaco 2026: three SC periods, no place at all: not drawn – not
  // parked at the pit exit while it leads the field)
  else if (status === "4") out.sc = { mode: "unseen", from: "status" };
  // (its place ended – the status turned green as it came in: in 15 SC periods checked the last place was in the pit lane
  // or up to ~330 m before its entry – on along the track to the entry (toEntry m, ≤ 800) and through the lane to its
  // parking place: a reproduction; ended anywhere else: parked, no path made up)
  else if (race && scLast && parkU != null && (scLast.laneU != null || scLast.toEntry != null)) {
    const dt = Math.max(0, t - scLast.t) / 1000, onTrack = scLast.laneU != null ? 0 : scLast.toEntry / S.trackSpeed;
    const u = dt < onTrack ? null : (scLast.laneU ?? 0) + S.laneSpeed * (dt - onTrack);
    out.sc = u == null ? { mode: "returning", leg: "track", num: scLast.num, s: S.trackSpeed * dt, from: "reproduction" }
      : u < parkU - 4 ? { mode: "returning", leg: "lane", num: scLast.num, u, from: "reproduction" } : { mode: "parked", from: "estimate" };
  } else if (race) out.sc = { mode: "parked", from: "estimate" };
  if (!race) return out;
  const L = start && start.standing === true ? start.t : null;
  if (L == null) { out.medical = { mode: "parked", from: "reproduction" }; return out; }
  // (v0.37's form: lap1End, a number taken as final)
  const L1 = lap1 || (lap1End !== undefined ? { t: lap1End, final: true } : { t: null, final: false });
  if (t < L) out.medical = { mode: t >= L - S.gridWait ? "gridRear" : "parked", from: "reproduction" };
  else if (L1.t != null) {
    if (t < L1.t) out.medical = { mode: "following", lag: S.medLag, from: "reproduction" };
    else { const u = S.laneSpeed * (t - L1.t) / 1000; out.medical = parkU != null && u < Math.max(0, parkU - 14) ? { mode: "entering", u, from: "reproduction" } : { mode: "parked", from: "reproduction" }; }
  } else if (t < L + S.medLap) out.medical = { mode: "following", lag: S.medLag, provisional: !L1.final, from: "reproduction" };
  // (no lap end in the data by then – a long first lap, the data cut off: not shown rather than parked on a guess, until
  // the race is on lap 3 – the medical car is long back by then)
  else out.medical = lap != null && lap >= 3 ? { mode: "parked", from: "reproduction" } : { mode: "unknown", from: "reproduction" };
  const d = t - L;
  if (d >= S.flag[0] && d < S.flag[1]) out.official = { phase: "flag", f: (d - S.flag[0]) / (S.flag[1] - S.flag[0]) };
  else if (d >= S.leave[0] && d < S.leave[1]) out.official = { phase: "leave", f: (d - S.leave[0]) / (S.leave[1] - S.leave[0]) };
  return out;
}

// The car the medical car follows at moment τ (its own path is that car's at τ − lag): the last starter on the road –
// down the grid order from the back (order: the starters, last grid place first), the first one still running: a place
// at τ, moving (≥ 3 m in the second before – after the first 15 s; at the start they all stand), not in the pit lane. A
// car that stopped (retired, crashed), went into the pits or whose data stopped hands over to the next one.
//   pos(num, τ) → { x, z } (m) | null · inLane({ x, z }) → bool
export function followTarget({ L, order = [], pos, inLane = () => false }, tau) {
  for (const num of order) {
    const p = pos(num, tau); if (!p) continue;
    if (tau - L > 15000) { const q = pos(num, tau - 1000); if (!q || Math.hypot(p.x - q.x, p.z - q.z) < 3) continue; }
    if (inLane(p)) continue;
    return { num, p };
  }
  return null;
}
// The grid box the medical car and the rear-of-grid official line up behind: the last painted box, not the last
// starter's – a pit-lane starter's or a non-starter's box stays empty (v0.40: at Monza 2026, two pit-lane starters,
// and Singapore 2025 the medical car stood inside the empty last box, like a car on the grid). lastG: the last starter's
// box; slots: the grid's Map(box → place) (grid.js) → the box number (lastG when there's no grid model)
export function gridRearSlot(lastG, slots) {
  if (!slots?.size) return lastG;
  let n = 0; for (const k of slots.keys()) if (+k > n) n = +k;
  return lastG == null || !Number.isFinite(+lastG) ? n || null : Math.max(+lastG, n);
}
// When the medical car reaches the pit entry after lap 1: the first moment τ (from 40 s after the start, every ½ s) at
// which the car it follows was, lag earlier, within 30 m of the pit entry. dataEnd: the latest moment the positions are
// in for (live: grows; a replay: Infinity) – a τ whose followed moment is past it isn't decided yet.
//   → { t: ms | null, final } – final false: not seen yet, the data may still bring it (live); final with t null: the data
//     covers the whole window (400 s) and has no such moment (positions cut off, a red flag in the pit lane …)
export function medicalLap1({ L, order, pos, inLane, nearEntry, dataEnd = Infinity, lag = SUPPORT.medLag, step = 500, from = 40000, to = 400000 }) {
  for (let tau = L + from; tau <= L + to; tau += step) {
    if (tau - lag > dataEnd) return { t: null, final: false };
    const f = followTarget({ L, order, pos, inLane }, tau - lag);
    if (f && nearEntry(f.p)) return { t: tau, final: true };
  }
  return { t: null, final: true };
}

// Where the rear-of-grid official stands, in the lap line's frame at the back of the grid (u m along the track, + towards
// the grid; v m across, + left). Sources (docs/research/support_cars_start.md): the user's observation of the start
// (v0.46): on the track, on the medical car's side, by the medical car behind the last row – waving, then stepping away
// before the lights; Kym Illman, 31 Mar 2025 ("with the medical car positioned at the rear, a marshal waves a green
// flag"); Red Bull's flag guide (a marshal behind the grid crosses the track with it). FIA Appendix H 2026 2.5.5 g (FIA
// Safety Bulletin 56, "2026 Regulatory Changes": "behind a barrier opening at the back of the grid, if available … if
// no barrier is present, as far from the track edge as possible") puts the waving itself off the track – that differs
// from what the user sees at F1 starts, so the waving follows the user; the barrier opening is kept only for the step
// off: a barrier right at the edge on that side is passed at an opening, never one that has the pit lane behind it.
//   g: { med: { u, v, L, W } (the medical car's centre and size) | null, gbV (the grid's rear point across), edges(u) →
//   { L, R } (the asphalt's edges, R < 0), wall: { L, R } (the first barrier past that edge, m; null: none within 40 m),
//   inPit(u, v) → in the pit lane (its building's lane or near its measured path, off the asphalt) }
//   → { flag: { u, v }, exit: { u, v }, side (the medical car's: +1 left, −1 right), via: "edge" | "opening" (its own
//     side) | "across …" (the other side: none to stand on by the medical car) | "none" (no side: stays at the edge) }
export const FLAG = {
  ahead: 1.2,        // m in front of the medical car's nose (close by, clear of it – estimate, L)
  beside: 0.6,       // m out past the line of its side, towards its own edge (estimate, L)
  inside: 0.8,       // m inside the asphalt's edge at least while waving (on the track)
  out: 2.0,          // m past the edge it walks to (off the asphalt – estimate, L)
  min: 0.8,          // m past the edge at least for a place off the track to count
  barrierBack: 0.8,  // m short of a barrier past the edge
  near: 1.6,         // a barrier this close to the edge (a street circuit's walls: 1.4 m) – no room to stand in front:
                     // stepped through at an opening (Appendix H 2026 2.5.5 g; where the opening is isn't known) …
  opening: 1.2,      // … to this far behind it
  pitClear: 1.5,     // m short of the pit lane at least
  look: 14,          // m past the edge searched for the pit lane
};
export function flagSpot(g, F = FLAG) {
  const m = g.med, ms = Math.sign(m ? m.v : g.gbV) || 1;
  const u = m ? m.u + m.L / 2 + F.ahead : 0, e = g.edges(u);
  const v = Math.max(e.R + F.inside, Math.min(e.L - F.inside, m ? m.v + ms * (m.W / 2 + F.beside) : g.gbV));
  // (a way off on side sg: how far past the edge – short of a barrier and the pit lane, or behind a barrier at the edge)
  const off = (sg) => {
    const E = sg > 0 ? e.L : e.R, w = g.wall?.[sg > 0 ? "L" : "R"] ?? null;
    let pit = Infinity; for (let k = 0; k <= F.look; k += 0.25) if (g.inPit(u, E + sg * k)) { pit = k; break; }
    if (w != null && w <= F.near) { const d = w + F.opening; return pit >= d + F.pitClear ? { d, via: "opening" } : null; }
    const d = Math.min(F.out, w != null ? w - F.barrierBack : Infinity, pit - F.pitClear);
    return d >= F.min ? { d, via: "edge" } : null;
  };
  for (const sg of [ms, -ms]) {
    const r = off(sg); if (!r) continue;
    return { flag: { u, v }, exit: { u, v: (sg > 0 ? e.L : e.R) + sg * r.d }, side: ms, via: sg === ms ? r.via : "across " + r.via };
  }
  return { flag: { u, v }, exit: { u, v: ms > 0 ? e.L : e.R }, side: ms, via: "none" };
}
// The official at a moment of the plan (supportPlan's official): waving at the flag spot, facing the grid; then walking
// from it to the exit (walked: m so far – the feet in step)
export function flagAt(spot, phase, f) {
  if (phase === "flag") return { u: spot.flag.u, v: spot.flag.v, walked: 0, facing: "grid" };
  const du = spot.exit.u - spot.flag.u, dv = spot.exit.v - spot.flag.v, k = Math.max(0, Math.min(1, f));
  return { u: spot.flag.u + du * k, v: spot.flag.v + dv * k, walked: Math.hypot(du, dv) * k, facing: "walk" };
}

// The support cars' models by season and event – what a source shows (docs/research/support_cars_start.md); null where
// the maker isn't known for that event (2025's rotation was never published race by race: only Saudi Arabia, Spain and
// the Netherlands are sourced) – then a neutral car, said so, never another year's or event's model.
//   venueKey: F1's circuit key; date: the session's local date (YYYY-MM-DD)
export function supportModels(season, venueKey, date = null) {
  if (season >= 2026) return { sc: date && date >= "2026-07-24" ? "amgGt63Pro" : "amgGtBlack", medical: "amgGt63s", from: "Mercedes-AMG at every 2026 round (Mercedes, Jan 2026); the GT 63 PRO safety car from the Hungarian GP" };
  if (season === 2025) {
    if (venueKey === 15) return { sc: "amgGtBlack", medical: "amgGt63s", from: "2025 Spanish GP: Mercedes (race photos)" };
    if (venueKey === 46) return { sc: "amgGtBlack", medical: "amgGt63s", from: "2025 Japanese GP: the AMG GT Black Series in the race (Wikimedia Commons photo, 6 Apr 2025); the medical car assumed Mercedes's (paired)" };
    if (venueKey === 149) return { sc: "vantage", medical: "dbx707", from: "2025 Saudi Arabian GP: Aston Martin (race photos)" };
    if (venueKey === 55) return { sc: "vantageS", medical: "dbx707", from: "2025 Dutch GP: the Vantage S's debut (Aston Martin, 29 Aug 2025)" };
  }
  return { sc: null, medical: null, from: "which maker's cars ran at this event isn't sourced – a neutral car" };
}
