// The teams' pit boxes along the pit lane, circuit by circuit – measured from F1's own data, and the rule behind them.
//
// The rule (formula1.com, 'The beginner's guide to the F1 Constructors' Championship'): the teams' garages are in the
// order of the previous season's constructors' championship – the champions' nearest the pit lane entrance, on down
// to the last team's nearest the exit. Checked on 39 races (2025–26) in the app's cache, each team's box where its
// cars made their official stops (PitStopSeries – driver and stationary time – matched to a standstill in the
// position data, between the limiter lines): the order is the rule's exactly (Spearman ±1.00) at every one – the other
// way round (the champions nearest the exit) at Suzuka (2025, 2026), Montréal (2025) and Melbourne (2026).
//
// PIT_BOXES[circuit key]: dir – 1: the champions at the entry end, −1: at the exit end; boxes – where the box of the
// team placed 1st, 2nd, … in the order stands, metres along the measured pit lane path (startdata.js pit.path, from
// its start); measured – the places seen in that race (the rest between them, or on at its median spacing: estimates);
// from – the race it was measured in. The 11th place (2026: a new team) is extrapolated where only ten ran.
// STANDINGS[season]: the previous season's constructors' order, used for that season's garages (formula1.com final
// standings 2023, 2024; 2025: Lando Norris / McLaren champions – lightsoutblog.com's final table, the same order as
// this data shows at every 2026 race measured). A new team (Cadillac, 2026) is last.

export const STANDINGS = {
  2024: ["Red Bull Racing", "Mercedes", "Ferrari", "McLaren", "Aston Martin", "Alpine", "Williams", "RB", "Kick Sauber", "Haas F1 Team"],
  2025: ["McLaren", "Ferrari", "Red Bull Racing", "Mercedes", "Aston Martin", "Alpine", "Haas F1 Team", "Racing Bulls", "Williams", "Kick Sauber"],
  2026: ["McLaren", "Mercedes", "Red Bull Racing", "Ferrari", "Williams", "Racing Bulls", "Aston Martin", "Haas F1 Team", "Audi", "Alpine", "Cadillac"],
};
export const PIT_BOXES = {
  2: {"dir": 1, "boxes": [471, 499, 525, 551, 577, 602, 628, 655, 681, 707, 731], "measured": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "from": "2026-07-05_ Silverstone"},
  4: {"dir": 1, "boxes": [369, 394, 420, 444, 469, 494, 520, 545, 569, 594, 619], "measured": [1, 2, 3, 4, 5, 6, 8, 9], "from": "2025-08-03_ Budapest"},
  6: {"dir": 1, "boxes": [277, 300, 331, 348, 375, 399, 422, 446, 468, 491, 514], "measured": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "from": "2025-05-18_ Imola"},
  7: {"dir": 1, "boxes": [240, 268, 294, 317, 344, 371, 398, 425, 447, 475, 502], "measured": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "from": "2025-07-27_ Spa-Francorchamps"},
  9: {"dir": 1, "boxes": [250, 274, 301, 325, 350, 374, 401, 426, 453, 475, 500], "measured": [1, 2, 3, 4, 6, 7, 8, 9, 10], "from": "2025-10-19_ Austin"},
  10: {"dir": -1, "boxes": [384, 368, 352, 336, 318, 303, 287, 271, 254, 242, 221], "measured": [2, 4, 5, 6, 8, 9, 10, 11], "from": "2026-03-08_ Melbourne"},
  12: {"dir": 1, "boxes": [518, 543, 568, 591, 615, 640, 663, 687, 710, 735, 758], "measured": [1, 3, 4, 5, 6, 7, 8, 9, 10, 11], "from": "2026-10-04_ Kuala Lumpur"},
  14: {"dir": 1, "boxes": [368, 392, 416, 440, 464, 488, 512, 536, 561, 585, 609], "measured": [1, 3, 4, 5, 6, 7, 8, 9], "from": "2025-11-09_ S\u00e3o Paulo"},
  15: {"dir": 1, "boxes": [327, 350, 375, 398, 421, 446, 470, 494, 519, 542, 567], "measured": [1, 2, 3, 4, 5, 6, 8, 9, 10, 11], "from": "2026-06-14_ Barcelona"},
  19: {"dir": 1, "boxes": [353, 377, 401, 422, 446, 469, 492, 515, 538, 560, 583], "measured": [1, 2, 3, 4, 6, 8, 9, 10], "from": "2026-06-28_ Spielberg"},
  22: {"dir": 1, "boxes": [102, 118, 138, 152, 169, 183, 202, 221, 238, 250, 267], "measured": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "from": "2025-05-25_ Monaco"},
  23: {"dir": -1, "boxes": [516, 486, 473, 451, 427, 406, 384, 361, 339, 317, 295], "measured": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "from": "2025-06-15_ Montr\u00e9al"},
  39: {"dir": 1, "boxes": [159, 181, 202, 222, 244, 265, 286, 307, 321, 342, 363], "measured": [1, 2, 3, 4, 6, 7, 8, 9], "from": "2025-09-07_ Monza"},
  46: {"dir": -1, "boxes": [520, 497, 473, 449, 425, 401, 377, 353, 328, 304, 280], "measured": [1, 2, 3, 4, 5, 7, 10, 11], "from": "2026-03-29_ Suzuka"},
  49: {"dir": 1, "boxes": [430, 456, 483, 507, 531, 555, 582, 607, 631, 656, 681], "measured": [1, 2, 3, 4, 6, 7, 8, 9, 10], "from": "2025-03-23_ Shanghai"},
  55: {"dir": 1, "boxes": [238, 259, 274, 290, 308, 323, 338, 354, 371, 387, 403], "measured": [1, 2, 4, 5, 6, 7, 10], "from": "2026-08-23_ Zandvoort"},
  61: {"dir": 1, "boxes": [259, 281, 304, 325, 346, 369, 391, 413, 435, 456, 478], "measured": [1, 2, 3, 4, 5, 6, 7, 8, 11], "from": "2026-10-11_ Marina Bay"},
  63: {"dir": 1, "boxes": [165, 198, 230, 258, 289, 319, 348, 378, 409, 439, 469], "measured": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "from": "2025-04-13_ Sakhir"},
  65: {"dir": 1, "boxes": [233, 258, 283, 308, 333, 358, 383, 408, 433, 458, 483], "measured": [1, 2, 4, 5, 6, 7], "from": "2025-10-26_ Mexico City"},
  70: {"dir": 1, "boxes": [255, 277, 300, 322, 344, 366, 387, 411, 434, 458, 480], "measured": [1, 2, 4, 5, 6, 7, 10], "from": "2025-12-07_ Yas Island"},
  144: {"dir": 1, "boxes": [217, 236, 255, 274, 293, 311, 330, 349, 369, 388, 406], "measured": [1, 2, 5, 6, 8, 9, 10, 11], "from": "2026-09-26_ Baku"},
  149: {"dir": 1, "boxes": [309, 337, 360, 382, 403, 424, 448, 469, 492, 514, 536], "measured": [1, 2, 4, 6, 7, 8, 10], "from": "2025-04-20_ Jeddah"},
  150: {"dir": 1, "boxes": [243, 270, 297, 323, 349, 374, 400, 427, 453, 479, 505], "measured": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "from": "2025-11-30_ Lusail"},
  151: {"dir": 1, "boxes": [273, 292, 319, 340, 361, 384, 406, 429, 450, 474, 497], "measured": [1, 2, 3, 5, 8, 9, 10], "from": "2025-05-04_ Miami"},
  152: {"dir": 1, "boxes": [217, 238, 259, 286, 308, 329, 349, 371, 392, 414, 436], "measured": [1, 3, 4, 6, 7, 8], "from": "2025-11-22_ Las Vegas"},
  153: {"dir": 1, "boxes": [246, 279, 312, 345, 378, 495, 526, 558, 591, 620, 649], "measured": [2, 5, 6, 8, 9, 10, 11], "from": "2026-09-13_ Madrid"},
};

// the teams as the feed names them, across seasons and names (RB → Racing Bulls, Sauber / Kick Sauber → Audi in 2026)
const KEYS = [["red bull", "Red Bull Racing"], ["racing bulls", "Racing Bulls"], ["visa cash app", "Racing Bulls"], [/^rb\b/, "Racing Bulls"], ["mclaren", "McLaren"], ["ferrari", "Ferrari"], ["mercedes", "Mercedes"],
  ["aston", "Aston Martin"], ["alpine", "Alpine"], ["williams", "Williams"], ["haas", "Haas F1 Team"], ["audi", "Audi"], ["sauber", "Kick Sauber"], ["cadillac", "Cadillac"]];
export function teamKey(name) {
  const s = String(name || "").toLowerCase();
  for (const [k, v] of KEYS) if (typeof k === "string" ? s.includes(k) : k.test(s)) return v;
  return null;
}
// The teams' boxes for a session: [{ team (the feed's name), u (m along the pit path), rank }] – from the circuit's
// measured boxes and the season's order; null where either isn't known. teams: the feed's team names.
export function publishedBoxes(circuitKey, season, teams) {
  const v = PIT_BOXES[circuitKey], order = STANDINGS[season];
  if (!v || !order) return null;
  const norm = order.map((t) => teamKey(t));
  const out = [];
  for (const team of new Set(teams)) {
    let r = norm.indexOf(teamKey(team));
    // (2026: Sauber became Audi – the same entry and place)
    if (r < 0 && teamKey(team) === "Audi") r = norm.indexOf("Kick Sauber");
    if (r < 0 && teamKey(team) === "Kick Sauber") r = norm.indexOf("Audi");
    if (r < 0 || r >= v.boxes.length) continue;
    out.push({ team, u: v.boxes[r], rank: r + 1 });
  }
  return out.length ? out : null;
}
