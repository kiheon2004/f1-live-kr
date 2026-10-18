// The support cars and the start's rear-of-grid official – what each is doing at the moment shown (pure; map3d.js
// draws it). Research: docs/research/support_cars_start.md.
//
// Safety car (SC): its own place comes in the timing feed while it is on the track (Position "241"–"243" – replay.js
// supportAt; none while it waits): drawn there, "data". Otherwise, in a race, it waits at the end of the pit lane
// (Mayländer; 2025 Art. 55.2 / 2026 B5.2.1: to its standby place before the start) – drawn parked there, an estimate of
// the spot. Never two: the parked one only while the feed has none on track. A virtual safety car (TrackStatus 6 / 7)
// sends no car out – none is made up.
// Medical car: no data at all – a reproduction, said so: behind the last row while the field stands on the grid, after
// the start following the last car round the first lap, into the pit lane at its end, parked at the pit exit after.
// The rear-of-grid official: not in the regulations (marshal practice in flag guides): once the field stands, a marshal
// behind the last row waves a green flag to the starter and leaves the track before the lights – no time in the data:
// a reproduction of the order only, ahead of the lights' own estimate; it never moves the start.
// None of them is a competitor: not in the standings, lap counts, grid or driver counts (they never enter those paths).

export const SUPPORT = {
  medLag: 2500,          // ms behind the last car (its path at t − lag)
  medLap: 150000,        // the longest a first lap is followed without its end in the data
  gridWait: 120000,      // the medical car is seen behind the grid this long before the lights at most
  flag: [-21000, -15000], // the official's green flag, ms from lights out (estimate: before the pre-start and the lights)
  leave: [-15000, -12000], // walking off the track, ms from lights out
};

// t: the moment shown; status: TrackStatus.Status at t ("1" green, "2" yellow, "4" SC, "5" red, "6" VSC, "7" VSC
// ending); sc: supportAt(t) ({ num: [x, y, z] }); start: the race's first standing start as shown ({ t, standing }) or
// null; lap1End: when the last starter completed lap 1 (ms) or null; race: a race or sprint session.
// → { sc: { mode: "track" | "parked", num?, pos?, from } | null, vsc: bool, medical: { mode, from } | null,
//     official: { phase: "flag" | "leave", f (0–1) } | null }
export function supportPlan({ t, status = null, sc = {}, start = null, lap1End = null, race = false } = {}) {
  const S = SUPPORT, out = { sc: null, vsc: status === "6" || status === "7", medical: null, official: null };
  const on = Object.entries(sc || {}).find(([, p]) => p && (p[0] || p[1]));
  if (on) out.sc = { mode: "track", num: on[0], pos: on[1], from: "data" };
  else if (race) out.sc = { mode: "parked", from: "estimate" };
  if (!race) return out;
  const L = start && start.standing === true ? start.t : null;
  if (L == null) { out.medical = { mode: "parked", from: "reproduction" }; return out; }
  if (t < L) out.medical = { mode: t >= L - S.gridWait ? "gridRear" : "parked", from: "reproduction" };
  else if (t < (lap1End ?? L + S.medLap) && t < L + S.medLap) out.medical = { mode: "following", lag: S.medLag, from: "reproduction" };
  else out.medical = { mode: "parked", from: "reproduction" };
  const d = t - L;
  if (d >= S.flag[0] && d < S.flag[1]) out.official = { phase: "flag", f: (d - S.flag[0]) / (S.flag[1] - S.flag[0]) };
  else if (d >= S.leave[0] && d < S.leave[1]) out.official = { phase: "leave", f: (d - S.leave[0]) / (S.leave[1] - S.leave[0]) };
  return out;
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
