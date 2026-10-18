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
// The rear-of-grid official (FIA Appendix H 2026 2.5.5 g): once the field stands, a marshal at the back of the grid –
// behind a barrier opening near it, or as far from the track's edge as possible – waves the green flag to tell the
// starter all cars are stationary; then steps back before the lights. No time in the data: a reproduction of the order
// only, ahead of the lights' own estimate; it never moves the start.
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

// The support cars' models by season and event – what a source shows (docs/research/support_cars_start.md); null where
// the maker isn't known for that event (2025's rotation was never published race by race: only Saudi Arabia, Spain and
// the Netherlands are sourced) – then a neutral car, said so, never another year's or event's model.
//   venueKey: F1's circuit key; date: the session's local date (YYYY-MM-DD)
export function supportModels(season, venueKey, date = null) {
  if (season >= 2026) return { sc: date && date >= "2026-07-24" ? "amgGt63Pro" : "amgGtBlack", medical: "amgGt63s", from: "Mercedes-AMG at every 2026 round (Mercedes, Jan 2026); the GT 63 PRO safety car from the Hungarian GP" };
  if (season === 2025) {
    if (venueKey === 15) return { sc: "amgGtBlack", medical: "amgGt63s", from: "2025 Spanish GP: Mercedes (race photos)" };
    if (venueKey === 149) return { sc: "vantage", medical: "dbx707", from: "2025 Saudi Arabian GP: Aston Martin (race photos)" };
    if (venueKey === 55) return { sc: "vantageS", medical: "dbx707", from: "2025 Dutch GP: the Vantage S's debut (Aston Martin, 29 Aug 2025)" };
  }
  return { sc: null, medical: null, from: "which maker's cars ran at this event isn't sourced – a neutral car" };
}
