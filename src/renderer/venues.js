// Venues: the circuits themselves, apart from the Grand Prix held there. A race's name says nothing certain about where
// it runs (2026's "Bahrain Grand Prix" was held at Sepang, Malaysia – "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX IN
// MALAYSIA 2026"; Spain had two races at two circuits, Barcelona-Catalunya in June and Madring in September), so what
// the 3D world puts where is chosen by the venue of the session: F1's own circuit key (SessionInfo.Meeting.Circuit.Key,
// also in the season's Index.json), with the meeting's Location as the fallback for data without it. The keys below are
// the ones F1's live timing data uses – read off the sessions' own SessionInfo (2024–2026), not assumed.
//
// Also kept here: what is known of each 2026 venue's pit, paddock and surroundings (STATUS_2026) and the references
// looked at (REFERENCES) – with their dates, authors, licences and what each can and can't show. A reference is never
// shipped with the app unless its licence allows it (none are, so far: they are compared against, not drawn).

// key → { short: F1's ShortName, name, locations: the Location strings F1 has used for it }
export const VENUES = {
  2: { short: "Silverstone", name: "Silverstone Circuit", locations: ["Silverstone"] },
  4: { short: "Hungaroring", name: "Hungaroring", locations: ["Budapest"] },
  6: { short: "Imola", name: "Autodromo Enzo e Dino Ferrari", locations: ["Imola"] },
  7: { short: "Spa-Francorchamps", name: "Circuit de Spa-Francorchamps", locations: ["Spa-Francorchamps"] },
  9: { short: "Austin", name: "Circuit of the Americas", locations: ["Austin"] },
  10: { short: "Melbourne", name: "Albert Park Circuit", locations: ["Melbourne"] },
  12: { short: "Kuala Lumpur", name: "Sepang International Circuit", locations: ["Kuala Lumpur", "Sepang"] },
  14: { short: "Interlagos", name: "Autódromo José Carlos Pace", locations: ["São Paulo", "Sao Paulo"] },
  15: { short: "Catalunya", name: "Circuit de Barcelona-Catalunya", locations: ["Barcelona"] },
  19: { short: "Spielberg", name: "Red Bull Ring", locations: ["Spielberg"] },
  22: { short: "Monte Carlo", name: "Circuit de Monaco", locations: ["Monte Carlo", "Monaco"] },
  23: { short: "Montreal", name: "Circuit Gilles Villeneuve", locations: ["Montréal", "Montreal"] },
  39: { short: "Monza", name: "Autodromo Nazionale Monza", locations: ["Monza"] },
  46: { short: "Suzuka", name: "Suzuka International Racing Course", locations: ["Suzuka"] },
  49: { short: "Shanghai", name: "Shanghai International Circuit", locations: ["Shanghai"] },
  55: { short: "Zandvoort", name: "Circuit Zandvoort", locations: ["Zandvoort"] },
  61: { short: "Singapore", name: "Marina Bay Street Circuit", locations: ["Marina Bay", "Singapore"] },
  63: { short: "Sakhir", name: "Bahrain International Circuit", locations: ["Sakhir", "Bahrain"] },
  65: { short: "Mexico City", name: "Autódromo Hermanos Rodríguez", locations: ["Mexico City"] },
  70: { short: "Yas Marina Circuit", name: "Yas Marina Circuit", locations: ["Yas Island", "Yas Marina", "Abu Dhabi"] },
  144: { short: "Baku", name: "Baku City Circuit", locations: ["Baku"] },
  149: { short: "Jeddah", name: "Jeddah Corniche Circuit", locations: ["Jeddah"] },
  150: { short: "Lusail", name: "Lusail International Circuit", locations: ["Lusail"] },
  151: { short: "Miami", name: "Miami International Autodrome", locations: ["Miami", "Miami Gardens"] },
  152: { short: "Las Vegas", name: "Las Vegas Strip Circuit", locations: ["Las Vegas"] },
  153: { short: "Madring", name: "Madring", locations: ["Madrid"] },
};

// The venue of a session: { key, short, name } from F1's circuit key when the data has it, else from its Location
// (only where one Location means one venue), else null. A Grand Prix's name is never used.
export function venueOf({ circuitKey = null, location = null } = {}) {
  const k = circuitKey == null ? null : +circuitKey;
  if (k != null && VENUES[k]) return { key: k, ...VENUES[k] };
  if (k != null && Number.isFinite(k)) return { key: k, short: null, name: null, locations: location ? [location] : [] };   // (a venue this table doesn't know yet: its key still tells it apart)
  if (!location) return null;
  const hits = Object.entries(VENUES).filter(([, v]) => v.locations.includes(location));
  return hits.length === 1 ? { key: +hits[0][0], ...hits[0][1] } : null;
}
// Whether a registry entry (facilities, landmarks) belongs to this venue: by its venue keys when it has them and the
// venue is known, else by its Location strings – but a venue known by key that the entry doesn't list never matches by
// name.
export function entryAt(entry, venue, location) {
  // (no venue known – data without the circuit key and a Location shared or unknown: the entry's Locations decide)
  if (entry.venue?.length && venue) return entry.venue.includes(venue.key);
  return !!location && (entry.loc || []).includes(location) && (!venue || !VENUES[venue.key] || VENUES[venue.key].locations.includes(location));
}

// ---------- 2026 venues: what is known of the pits, paddock and surroundings ----------
// state:
//   verified   – a facility checked against published dimensions and photos (drawn always)
//   partial    – a facility drawn from some published figures and photos, the rest estimated (a trial: the "정밀 시설"
//                setting)
//   historical – only material about an earlier state of the buildings (may not be what stood in 2026)
//   missing    – not enough material: the map's own buildings are drawn
//   unconfirmed– the 2026 layout (temporary pits, team areas) not confirmed: the map's buildings, neutral
// facility: the registry id(s) in facilities.js; note: why.
export const STATUS_2026 = [
  { key: 10, state: "missing", note: "Albert Park: temporary pit and paddock buildings each year; no published plan found" },
  { key: 49, state: "missing", note: "Shanghai: permanent pit building; no dimensions found yet" },
  { key: 46, state: "partial", facility: ["suzuka-pit-building"], note: "Suzuka pit building: Takenaka figures (350 m, three floors) + photos; height estimated" },
  { key: 151, state: "unconfirmed", note: "Miami: temporary paddock and Paddock Club (architects' pages, year and team areas not confirmed; Rockwell page not reachable 2026-10-13)" },
  { key: 23, state: "missing", note: "Montreal: permanent pit building (2019); no dimensions found yet" },
  { key: 22, state: "unconfirmed", note: "Monaco: temporary pits and grandstands each year; a 5 June 2026 photo (Pirelli via Formula1-Data, all rights reserved) shows the harbour pits, compared only" },
  { key: 15, state: "missing", note: "Barcelona-Catalunya: permanent pit building; no dimensions found yet" },
  { key: 19, state: "partial", facility: ["red-bull-ring-pits"], note: "Red Bull Ring: nextroom (2011) + 30 boxes (2025); the 2025/26 extension east isn't in the map data" },
  { key: 2, state: "verified", facility: ["silverstone-wing"], note: "Silverstone Wing: published dimensions + photos; the 2026 paddock from 3 July 2026 photos (CC BY-SA 4.0), team places neutral" },
  { key: 7, state: "missing", note: "Spa: pit building (2007); no dimensions found yet" },
  { key: 4, state: "partial", facility: ["hungaroring-paddock-2025"], note: "Hungaroring: new five-storey paddock building, >340 m, handed over June 2025 (DVM Group); height and facade estimated" },
  { key: 55, state: "missing", note: "Zandvoort: pit building; no dimensions found yet" },
  { key: 39, state: "missing", note: "Monza: pit building (renovated 2022–24); no dimensions found yet" },
  { key: 153, state: "unconfirmed", note: "Madring: a pit building with a Paddock Club floor and roof terrace stood by 9 Sep 2026 (McLaren photo via Formula1-Data, all rights reserved; compared only) – the map data has no footprint for it yet, so nothing is placed" },
  { key: 144, state: "missing", note: "Baku: temporary pits by the old city; no plan found" },
  { key: 12, state: "unconfirmed", note: "Sepang (2026 'Bahrain GP in Malaysia'): the map's 'Paddock / Pit Building' (3 levels) stands; the Paddock Club is four halls on the pit building's upper entrance (sepangcircuit.com) – VIP space, not the teams' paddock; the 2026 team areas unknown" },
  { key: 61, state: "missing", note: "Marina Bay: permanent pit building; no dimensions found yet" },
  { key: 9, state: "missing", note: "COTA: pit building; no dimensions found yet" },
  { key: 65, state: "missing", note: "Hermanos Rodríguez: pit building; no dimensions found yet" },
  { key: 14, state: "missing", note: "Interlagos: new pit building (2023/24); no dimensions found yet" },
  { key: 152, state: "missing", note: "Las Vegas: Grand Prix Plaza pit building (2023); no dimensions found yet" },
  { key: 150, state: "partial", facility: ["lusail-pit-building"], note: "Lusail: pit building 402 m with fifty garages (Tilke, Guinness); height and facade bands estimated from Tilke's photos" },
  { key: 70, state: "partial", facility: ["yas-marina-pits"], note: "Yas Marina pit building: 40 garages (formula1.com) + photos; height estimated" },
];

// ---------- references looked at ----------
// kind: pit | team-paddock | vip-hospitality | onboard | car; taken / published: as stated by the source (null: not
// stated); use: how the app uses it – "compared" (looked at, nothing of it shipped)
export const REFERENCES = [
  { id: "silverstone-paddock-2026-a", venue: 2, facility: "silverstone-wing", season: 2026, kind: "team-paddock",
    page: "https://commons.wikimedia.org/wiki/File:F1_Paddock_at_British_Grand_Prix_2026_Silverstone_(55383877828).jpg",
    image: "https://upload.wikimedia.org/wikipedia/commons/d/d7/F1_Paddock_at_British_Grand_Prix_2026_Silverstone_%2855383877828%29.jpg",
    taken: "2026-07-03 12:54 (EXIF)", published: "2026-09-02 (Commons upload; Flickr earlier)", author: "Jason Puddephatt (Flickr puddy73)", licence: "CC BY-SA 4.0", use: "compared",
    shows: ["black awnings along the garages' back", "two-storey team units across the paddock street", "spiral stairs to the units' upper floors"],
    estimated: ["units' size and spacing (±30 %)", "which team's unit is where: not shown – kept neutral"] },
  { id: "silverstone-paddock-2026-b", venue: 2, facility: "silverstone-wing", season: 2026, kind: "team-paddock",
    page: "https://commons.wikimedia.org/wiki/File:F1_Paddock_at_British_Grand_Prix_2026_Silverstone_(55382810427).jpg",
    image: "https://upload.wikimedia.org/wikipedia/commons/3/32/F1_Paddock_at_British_Grand_Prix_2026_Silverstone_%2855382810427%29.jpg",
    taken: "2026-07-03 12:31 (EXIF)", published: "2026-09-02 (Commons upload)", author: "Jason Puddephatt (Flickr puddy73)", licence: "CC BY-SA 4.0", use: "compared",
    shows: ["the paddock street between garages and units"], estimated: ["depth of the street"] },
  { id: "madring-pits-2026", venue: 153, facility: null, season: 2026, kind: "pit",
    page: "https://formula1-data.com/media/67175", image: "https://formula1-data.com/assets/img/uploads/2026/09/madrid-f1-madring-19-red-flags-2026-5.jpg",
    taken: "2026-09-09", published: "2026-09-10 07:39", author: "McLaren (supplied); no photographer named", licence: "all rights reserved (Formula1-Data)", use: "compared",
    shows: ["a three/four-storey pit building with garages under a canopy at first-floor level", "a Paddock Club floor above with a glazed front", "red shade sails on the roof terrace", "team garage fronts (McLaren) being set up"],
    estimated: ["the building's length, depth and height", "its position: the map data has no footprint for it"] },
  { id: "monaco-harbour-2026", venue: 22, facility: null, season: 2026, kind: "pit",
    page: "https://formula1-data.com/media/65348", image: "https://formula1-data.com/assets/img/uploads/2026/06/leclerc-impeding-warning-after-monaco-radio-mix-up.jpg",
    taken: "2026-06-05 (FP2)", published: "2026-06-06 02:35", author: "Pirelli & C. S.p.A. (supplied)", licence: "all rights reserved (Formula1-Data)", use: "compared",
    shows: ["the harbour with the temporary pit buildings and grandstands from high up"], estimated: ["everything's size (one distant view)"] },
  { id: "hungaroring-renewal-2025", venue: 4, facility: "hungaroring-paddock-2025", season: 2025, kind: "pit",
    page: "https://www.dvmgroup.com/en/references/projects/hungaroring", image: null,
    taken: null, published: "handed over June 2025 (as stated)", author: "DVM Group; photos 'Hungaroring Media'", licence: "© DVM, all rights reserved", use: "compared",
    shows: ["paddock building: five storeys, more than 340 m, 25,000 m², pit boxes and technical garages", "new main grandstand, 10,000+ seats"],
    estimated: ["height (not stated)", "number of garages (not stated)", "facade"] },
  { id: "miami-paddock-club", venue: 151, facility: null, season: null, kind: "vip-hospitality",
    page: "https://www.rockwellgroup.com/projects/formula-1-miami-grand-prix-paddock-club", image: null,
    taken: null, published: null, author: "Rockwell Group", licence: "not readable (HTTP 403 on 2026-10-13)", use: "not used",
    shows: [], estimated: ["the page couldn't be read: year and whether it is the teams' paddock unknown"] },
  { id: "sepang-paddock-club", venue: 12, facility: null, season: null, kind: "vip-hospitality",
    page: "https://www.sepangcircuit.com/facilities-paddock-club", image: "https://www.sepangcircuit.com/media/wysiwyg/Paddock_Club_1.jpg",
    taken: null, published: null, author: "Sepang International Circuit", licence: "© 2026 Sepang International Circuit, all rights reserved", use: "compared",
    shows: ["four air-conditioned halls on the main pit building's upper entrance: 21 × 50, 21 × 32, 21 × 50, 21 × 16 (× 4 high, units not stated)"],
    estimated: ["which floor; the halls are VIP space, not the teams' paddock"] },
  { id: "lusail-pit-2023", venue: 150, facility: "lusail-pit-building", season: 2023, kind: "pit",
    page: "https://tilke.de/portfolio/lusail-race-track-qatar/", image: "https://tilke.de/wp-content/uploads/2023/12/IMG_4428-Kopie-scaled.jpg",
    taken: null, published: "2023-12 (upload path)", author: "Tilke GmbH", licence: "not stated (all rights reserved assumed)", use: "compared",
    shows: ["402 m pit building, fifty garages, race control tower south, Paddock Club north (text)", "the paddock side: stone cladding, white bands, glass balustrades (photo)"],
    estimated: ["height, the bands' depth"] },
  { id: "f1-calendar-2026", venue: null, facility: null, season: 2026, kind: "calendar",
    page: "https://www.formula1.com/en/racing/2026", image: null, taken: null, published: "read 2026-10-13", author: "Formula 1", licence: "© Formula 1", use: "checked",
    shows: ["23 rounds; round 16 'Bahrain Grand Prix' (official name: '… BAHRAIN GRAND PRIX IN MALAYSIA 2026'); round 7 Barcelona-Catalunya, round 14 Spanish GP (Madring by the session data)"], estimated: [] },
  ...[["ver-singapore-2026", 61, "Red Bull", "Verstappen", "https://www.formula1.com/en/video/onboard-max-verstappens-2026-pirelli-pole-position-award-lap-at-the-singapore-grand-prix.1878677458343183007", "2026-10-10", "the T-cam frame: horizon, halo, front tyres, helmet, mirrors (thumbnail)"],
    ["nor-hungary-2026", 4, "McLaren", "Norris", "https://www.formula1.com/en/video/onboard-norris-2026-pirelli-pole-position-award-lap-at-the-hungarian-gp.1871708350996459213", "2026-07-26", "the left half of the T-cam frame (thumbnail half covered by a portrait)"],
    ["rus-austria-2026", 19, "Mercedes", "Russell", "https://www.formula1.com/en/video/onboard-russells-2026-pirelli-pole-position-award-lap-at-the-austrian-gp.1869171069828990729", "2026-06-27", "the left half of the T-cam frame, hands on the wheel (thumbnail half covered)"],
    ["lec-australia-2026", 10, "Ferrari", "Leclerc", "https://www.formula1.com/en/video/2026-australian-grand-prix-onboard-as-leclerc-takes-the-lead-at-the-start-from-p4.1859070382285570221", "2026-03-08", "the whole T-cam frame on the straight: horizon, halo, both front tyres, mirrors, steering wheel, helmet"]]
    .map(([id, venue, team, driver, page, published, shows]) => ({ id, venue, facility: null, season: 2026, kind: "onboard", team, driver, page, image: "video thumbnail (og:image)",
      taken: null, published, author: "Formula 1", licence: "© Formula 1, all rights reserved", use: "compared", shows: [shows],
      estimated: ["the camera's height, distance and angles are fitted from a few points of one frame (see car3d.js T-cam profile)"] })),
  ...[["rb22-austria-2026", 19, "FIA F1 Austria 2026 Nr. 3 Verstappen (1).jpg", "2026-06-26 13:49", "CC BY-SA 4.0"],
    ["rb22-china-2026", 49, "2026 Chinese GP - Red Bull - Max Verstappen - Qualifying.jpg", "2026-03-14 15:21", "CC BY 4.0"],
    ["mcl40-w17-silverstone-2026", 2, "Lando Norris McLaren and George Russell Mercedes (55383745796).jpg", "2026-07-03 15:40", "CC BY-SA 4.0"],
    ["sf26-show-car", null, "Ferrari SF-26.jpg", "2026-07-05 14:16", "CC BY-SA 4.0"]]
    .map(([id, venue, file, taken, licence]) => ({ id, venue, facility: null, season: 2026, kind: "car",
      page: "https://commons.wikimedia.org/wiki/File:" + file.replace(/ /g, "_"), image: null, taken, published: null, author: "see the Commons page", licence, use: "compared",
      shows: id === "sf26-show-car" ? ["a show car at an exhibition, labelled SF-26 – not confirmed as the raced 2026 car: not used for shapes"]
        : ["the 2026 car in profile: airbox and T-cam pod over the helmet, halo, sidepods, wheels"],
      estimated: ["proportions from photos taken at an angle (perspective): heights relative to the tyres only"] })),
];
