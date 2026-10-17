// Braking distance boards – only the ones a source names: FIA race directors' event / competition notes (and one press
// report), per circuit, corner and season. No FIA rule sets their values (Appendix O 2026 Art. 10: trackside panels
// frangible, non-metallic, at least 3 m from the track's edge, not on the outside of corners), and they vary corner by
// corner – so nothing is copied to the corners no source covers. Where a board stands along the approach is the
// corner's marker (F1's corner data) less its distance – an estimate (a board measures to the braking reference, not to
// the marker); the side as the source says, or noted as estimated.
// Research: docs/research/monaco_start_boards.md part C.
export const BOARDS = [
  { venue: 7, seasons: [2025, 2025], turn: 1, values: [50], side: null, src: "2025 Belgian GP RD event notes (24 Jul 2025): '50 m brake marker board before Turn 1'" },
  { venue: 39, seasons: [2026, 2026], turn: 1, values: [100], side: "L", src: "2026 Italian GP RD competition notes (3 Sep 2026): 100 m brake marker before T1 (LHS kerb reference)" },
  { venue: 39, seasons: [2026, 2026], turn: 4, values: [100], side: "R", src: "2026 Italian GP RD competition notes: 100 m brake marker before T4 (RHS)" },
  { venue: 39, seasons: [2026, 2026], turn: 8, values: [100], side: "R", src: "2026 Italian GP RD competition notes: 100 m brake marker before T8 (RHS)" },
  { venue: 65, seasons: [2025, 2025], turn: 12, values: [150], side: null, src: "2025 Mexico City GP RD event notes (23 Oct 2025): '150 meters brake marker' at T12" },
  { venue: 61, seasons: [2026, 2026], turn: 1, values: [150, 100], side: "R", src: "Motorsport.com, Oct 2026 (Singapore GP T1): 150 m and 100 m boards on the right-hand side" },
];
// the boards for this venue and season
export function boardsFor(venueKey, season, list = BOARDS) {
  return list.filter((b) => b.venue === venueKey && season >= b.seasons[0] && season <= b.seasons[1]);
}
// Where each board of an entry stands: samples – the lap's (p, nor, L, R, every `step` m); at – the corner's sample index;
// side "L" / "R" in the race's direction (the samples' normal points to the cars' right) or null (estimated: the right).
// → [{ value, x, z, face: [x, z] (towards the oncoming cars), side, sideEstimated, i }]
export function boardPlaces(samples, at, b, step, out = 3.5) {
  const n = samples.length, sideEst = !b.side, sg = (b.side || "R") === "R" ? 1 : -1;
  return b.values.map((value) => {
    const i = ((at - Math.round(value / step)) % n + n) % n, s = samples[i];
    const edge = sg > 0 ? (s.L ?? 7) : (s.R ?? -7), o = edge + sg * out;
    return { value, i, x: s.p.x + s.nor.x * o, z: s.p.z + s.nor.z * o, face: [-s.tan.x, -s.tan.z], side: sg > 0 ? "R" : "L", sideEstimated: sideEst };
  });
}
