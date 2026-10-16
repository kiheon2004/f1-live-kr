// The teams' pit boxes along the pit lane, circuit by circuit – measured from F1's own data, and the rule behind them.
//
// The rule (formula1.com, 'The beginner's guide to the F1 Constructors' Championship'): the teams' garages are in the
// order of the previous season's constructors' championship – the champions' nearest the pit lane entrance, on down
// to the last team's nearest the exit. Checked on 39 races (2025–26) in the app's cache, each team's box where its
// cars made their official stops (PitStopSeries – driver and stationary time – matched to a standstill in the
// position data, between the limiter lines): the order is the rule's exactly (Spearman ±1.00) at every one – the other
// way round (the champions nearest the exit) at Suzuka (2025, 2026), Montréal (2025) and Melbourne (2026).
//
// PIT_BOXES[circuit key][season]: measured in that season's race (a box's place moves from one season to the next –
// Barcelona's first box 339 m along the path in 2025, 327 m in 2026, as the garages are shared out again): dir – 1:
// the champions at the entry end, −1: at the exit end; boxes – where the box of the team placed 1st, 2nd, … in that
// season's order stands, metres along the measured pit lane path (startdata.js pit.path, from its start); how – per
// place: m measured (the team's official stops in that race), i between two measured boxes, x on at the race's median
// spacing (both estimates); stops – how many stops measured each; from – the race; gap – the median spacing.
// STANDINGS[season]: the previous season's constructors' order, used for that season's garages (formula1.com final
// standings 2023, 2024; 2025: Lando Norris / McLaren champions – lightsoutblog.com's final table, the same order as
// this data shows at every 2026 race measured). A new team (Cadillac, 2026) is last.

export const STANDINGS = {
  2024: ["Red Bull Racing", "Mercedes", "Ferrari", "McLaren", "Aston Martin", "Alpine", "Williams", "RB", "Kick Sauber", "Haas F1 Team"],
  2025: ["McLaren", "Ferrari", "Red Bull Racing", "Mercedes", "Aston Martin", "Alpine", "Haas F1 Team", "Racing Bulls", "Williams", "Kick Sauber"],
  2026: ["McLaren", "Mercedes", "Red Bull Racing", "Ferrari", "Williams", "Racing Bulls", "Aston Martin", "Haas F1 Team", "Audi", "Alpine", "Cadillac"],
};
export const PIT_BOXES = {
  2: { 2025: {"dir": 1, "boxes": [472, 500, 530, 556, 585, 612, 640, 670, 699, 726], "how": "mmmmmimimm", "stops": [2, 3, 2, 4, 4, 3, 2, 2], "from": "2025-07-06_ Silverstone", "gap": 28.0}, 2026: {"dir": 1, "boxes": [471, 499, 525, 551, 577, 602, 628, 655, 681, 707, 731], "how": "mmmmmmmmmmm", "stops": [5, 4, 3, 3, 3, 4, 3, 3, 4, 3, 4], "from": "2026-07-05_ Silverstone", "gap": 26.0} },
  4: { 2025: {"dir": 1, "boxes": [369, 394, 420, 444, 469, 494, 520, 545, 569, 594], "how": "mmmmmmimmx", "stops": [3, 2, 3, 3, 2, 2, 2, 4], "from": "2025-08-03_ Budapest", "gap": 25.0} },
  6: { 2025: {"dir": 1, "boxes": [277, 300, 331, 348, 375, 399, 422, 446, 468, 491], "how": "mmmmmmmmmm", "stops": [4, 3, 3, 3, 3, 4, 2, 4, 4, 4], "from": "2025-05-18_ Imola", "gap": 23.0} },
  7: { 2025: {"dir": 1, "boxes": [240, 268, 294, 317, 344, 371, 398, 425, 447, 475], "how": "mmmmmmmmmm", "stops": [2, 2, 2, 3, 3, 2, 2, 2, 3, 3], "from": "2025-07-27_ Spa-Francorchamps", "gap": 27.0} },
  9: { 2025: {"dir": 1, "boxes": [250, 274, 301, 325, 350, 374, 401, 426, 453, 475], "how": "mmmmimmmmm", "stops": [2, 2, 2, 2, 2, 2, 2, 2, 3], "from": "2025-10-19_ Austin", "gap": 25.0} },
  10: { 2026: {"dir": -1, "boxes": [384, 368, 352, 336, 318, 303, 287, 271, 254, 242, 221], "how": "xmimmmimmmm", "stops": [2, 2, 4, 3, 2, 2, 2, 2], "from": "2026-03-08_ Melbourne", "gap": -16.0} },
  12: { 2026: {"dir": 1, "boxes": [518, 543, 568, 591, 615, 640, 663, 687, 710, 735, 758], "how": "mimmmmmmmmm", "stops": [3, 4, 5, 5, 5, 3, 4, 7, 7, 6], "from": "2026-10-04_ Kuala Lumpur", "gap": 24.0} },
  14: { 2025: {"dir": 1, "boxes": [368, 392, 416, 440, 464, 488, 512, 536, 561, 585], "how": "mimmmmmmmx", "stops": [2, 4, 4, 2, 4, 4, 2, 4], "from": "2025-11-09_ São Paulo", "gap": 24.0} },
  15: { 2025: {"dir": 1, "boxes": [339, 365, 390, 414, 439, 464, 489, 515, 540, 563], "how": "mmmmmmmmmm", "stops": [6, 6, 7, 5, 3, 6, 5, 4, 2, 5], "from": "2025-06-01_ Barcelona", "gap": 25.0}, 2026: {"dir": 1, "boxes": [327, 350, 375, 398, 421, 446, 470, 494, 519, 542, 567], "how": "mmmmmmimmmm", "stops": [2, 4, 6, 5, 6, 4, 3, 4, 4, 4], "from": "2026-06-14_ Barcelona", "gap": 24.0} },
  19: { 2025: {"dir": 1, "boxes": [393, 414, 436, 459, 477, 498, 519, 542, 562, 583], "how": "mmimmmmmim", "stops": [3, 4, 2, 3, 3, 2, 3, 4], "from": "2025-06-29_ Spielberg", "gap": 21.0}, 2026: {"dir": 1, "boxes": [353, 377, 401, 422, 446, 469, 492, 515, 538, 560, 583], "how": "mmmmimimmmx", "stops": [3, 3, 4, 6, 4, 4, 4, 5], "from": "2026-06-28_ Spielberg", "gap": 23.0} },
  22: { 2025: {"dir": 1, "boxes": [102, 118, 138, 152, 169, 183, 202, 221, 238, 250], "how": "mmmmmmmmmm", "stops": [4, 4, 4, 4, 3, 3, 3, 4, 4, 3], "from": "2025-05-25_ Monaco", "gap": 17.0} },
  23: { 2025: {"dir": -1, "boxes": [516, 486, 473, 451, 427, 406, 384, 361, 339, 317], "how": "mmmmmmmmmm", "stops": [5, 3, 3, 4, 4, 2, 2, 4, 2, 2], "from": "2025-06-15_ Montréal", "gap": -22.0} },
  39: { 2025: {"dir": 1, "boxes": [159, 181, 202, 222, 244, 265, 286, 307, 321, 342], "how": "mmmmimmmmx", "stops": [2, 2, 2, 2, 2, 2, 2, 2], "from": "2025-09-07_ Monza", "gap": 21.0} },
  46: { 2025: {"dir": -1, "boxes": [521, 495, 469, 444, 417, 391, 365, 340, 314, 289], "how": "mimmmimiim", "stops": [2, 2, 2, 3, 2, 2], "from": "2025-04-06_ Suzuka", "gap": -26.0}, 2026: {"dir": -1, "boxes": [520, 497, 473, 449, 425, 401, 377, 353, 328, 304, 280], "how": "mmmmmimiimm", "stops": [2, 2, 2, 2, 5, 3, 2, 2], "from": "2026-03-29_ Suzuka", "gap": -24.0} },
  49: { 2025: {"dir": 1, "boxes": [430, 456, 483, 507, 531, 555, 582, 607, 631, 656], "how": "mmmmimmmmm", "stops": [2, 2, 3, 2, 2, 2, 4, 3, 3], "from": "2025-03-23_ Shanghai", "gap": 25.0} },
  55: { 2025: {"dir": 1, "boxes": [243, 263, 282, 299, 317, 335, 354, 371, 391, 406], "how": "mmmmmmmmmm", "stops": [4, 2, 4, 4, 4, 4, 2, 4, 4, 3], "from": "2025-08-31_ Zandvoort", "gap": 18.0}, 2026: {"dir": 1, "boxes": [238, 259, 274, 290, 308, 323, 338, 354, 371, 387, 403], "how": "mmimmmmiimx", "stops": [4, 2, 5, 2, 2, 2, 3], "from": "2026-08-23_ Zandvoort", "gap": 16.3} },
  61: { 2025: {"dir": 1, "boxes": [257, 282, 307, 330, 354, 378, 403, 429, 451, 476], "how": "mmmmimmmmx", "stops": [2, 3, 2, 2, 3, 2, 2, 2], "from": "2025-10-05_ Marina Bay", "gap": 25.0}, 2026: {"dir": 1, "boxes": [259, 281, 304, 325, 346, 369, 391, 413, 435, 456, 478], "how": "mmmmmmmmiim", "stops": [3, 3, 2, 3, 3, 2, 2, 2, 3], "from": "2026-10-11_ Marina Bay", "gap": 22.0} },
  63: { 2025: {"dir": 1, "boxes": [165, 198, 230, 258, 289, 319, 348, 378, 409, 439], "how": "mmmmmmmmmm", "stops": [3, 4, 4, 5, 4, 4, 4, 3, 4, 2], "from": "2025-04-13_ Sakhir", "gap": 30.0} },
  65: { 2025: {"dir": 1, "boxes": [233, 258, 283, 308, 333, 358, 383, 408, 433, 458], "how": "mmimmmmxxx", "stops": [2, 2, 4, 2, 2, 3], "from": "2025-10-26_ Mexico City", "gap": 25.0} },
  70: { 2025: {"dir": 1, "boxes": [255, 277, 300, 322, 344, 366, 387, 411, 434, 458], "how": "mmimmmmiim", "stops": [2, 4, 2, 2, 2, 2, 2], "from": "2025-12-07_ Yas Island", "gap": 22.0} },
  144: { 2025: {"dir": 1, "boxes": [204, 228, 251, 275, 298, 321, 343, 366, 390, 414], "how": "xxmmimmimm", "stops": [2, 2, 2, 3, 3, 2], "from": "2025-09-21_ Baku", "gap": 23.5}, 2026: {"dir": 1, "boxes": [217, 236, 255, 274, 293, 311, 330, 349, 369, 388, 406], "how": "mmiimmimmmm", "stops": [2, 2, 2, 3, 2, 2, 2, 2], "from": "2026-09-26_ Baku", "gap": 19.0} },
  149: { 2025: {"dir": 1, "boxes": [309, 337, 360, 382, 403, 424, 448, 469, 492, 514], "how": "mmimimmmim", "stops": [2, 2, 2, 2, 2, 2, 2], "from": "2025-04-20_ Jeddah", "gap": 22.5} },
  150: { 2025: {"dir": 1, "boxes": [243, 270, 297, 323, 349, 374, 400, 427, 453, 479], "how": "mmmmmmmmmm", "stops": [4, 4, 5, 2, 4, 4, 2, 4, 3, 2], "from": "2025-11-30_ Lusail", "gap": 26.0} },
  151: { 2025: {"dir": 1, "boxes": [273, 292, 319, 340, 361, 384, 406, 429, 450, 474], "how": "mmmimiimmm", "stops": [2, 2, 2, 2, 2, 2, 2], "from": "2025-05-04_ Miami", "gap": 22.7} },
  152: { 2025: {"dir": 1, "boxes": [217, 238, 259, 286, 308, 329, 349, 371, 392, 414], "how": "mimmimmmxx", "stops": [2, 3, 2, 2, 2, 2], "from": "2025-11-22_ Las Vegas", "gap": 21.5} },
  153: { 2026: {"dir": 1, "boxes": [246, 279, 312, 345, 378, 495, 526, 558, 591, 620, 649], "how": "xmiimmimmmm", "stops": [3, 2, 3, 3, 2, 2, 3], "from": "2026-09-13_ Madrid", "gap": 33.0} },
};

// the teams as the feed names them, across seasons and names (RB → Racing Bulls, Sauber / Kick Sauber → Audi in 2026)
const KEYS = [["red bull", "Red Bull Racing"], ["racing bulls", "Racing Bulls"], ["visa cash app", "Racing Bulls"], [/^rb\b/, "Racing Bulls"], ["mclaren", "McLaren"], ["ferrari", "Ferrari"], ["mercedes", "Mercedes"],
  ["aston", "Aston Martin"], ["alpine", "Alpine"], ["williams", "Williams"], ["haas", "Haas F1 Team"], ["audi", "Audi"], ["sauber", "Kick Sauber"], ["cadillac", "Cadillac"]];
export function teamKey(name) {
  const s = String(name || "").toLowerCase();
  for (const [k, v] of KEYS) if (typeof k === "string" ? s.includes(k) : k.test(s)) return v;
  return null;
}
// The teams' boxes for a session, from the order and a circuit's measured boxes – an allocation rule checked against the
// data, not a published plan: each box says how its place is known. [{ team (the feed's name), u (m along the pit path),
// rank, how: "measured" | "between measured" | "extrapolated", season (whose measurement), sameSeason }] – the
// session's own season's measurement, else the nearest one's (a box then may be off by a car's length or more); null
// where the circuit or the season's order isn't known. teams: the feed's team names.
const HOW = { m: "measured", i: "between measured", x: "extrapolated" };
export function orderedBoxes(circuitKey, season, teams) {
  const bySeason = PIT_BOXES[circuitKey], order = STANDINGS[season];
  if (!bySeason || !order) return null;
  const seasons = Object.keys(bySeason).map(Number), near = seasons.sort((a, b) => Math.abs(a - season) - Math.abs(b - season) || b - a)[0];
  const v = bySeason[near];
  const norm = order.map((t) => teamKey(t)), out = [];
  for (const team of new Set(teams)) {
    let r = norm.indexOf(teamKey(team));
    // (2026: Sauber became Audi – the same entry and place)
    if (r < 0 && teamKey(team) === "Audi") r = norm.indexOf("Kick Sauber");
    if (r < 0 && teamKey(team) === "Kick Sauber") r = norm.indexOf("Audi");
    if (r < 0 || r >= v.boxes.length) continue;
    out.push({ team, u: v.boxes[r], rank: r + 1, how: HOW[v.how[r]] || "extrapolated", season: near, sameSeason: near === season, from: v.from });
  }
  return out.length ? out : null;
}
