// The F1 garages of each pit building as the FIA allocates them, event by event – and where they physically are.
//
// Source: the FIA Race Director's "PIT LANE DRAWING" page in each event's Event / Competition Notes (fia.com decision
// documents, 2025: every event; 2026: the 17 published by 2026-10-18), read page by page (v0.39 research:
// ~/projects/f1kr-work/v039/research/garages.md). Each drawing numbers every garage of the F1 pit building, says who has
// it (a team, the FIA, FOM, Pirelli, guests, storage, a walkway) and which end the pit entry is. What they show, on every
// one: the teams in the previous season's constructors' order (pitorder.js), 3 garages a team at most circuits, 4 at
// Barcelona, Suzuka, Jeddah and Sakhir, 4–5.5 narrow ones at Monza, 2 at Interlagos and Madring, one big one at Monaco
// (drawn in three sections in 2025), some garages split between two neighbouring teams (Spa, Baku, Melbourne, …), and one
// pit box per team in front of its garages. What they don't show: the garages' real widths (the strip is schematic –
// equal boxes), which of a team's garages hold the cars and which the engineers and spares, the support series' garages.
//
// seq: the garages from the pit ENTRY end to the exit (rev: the drawing listed from the exit end – put the other way
// round here), comma separated: "MCL*3" three garages of McLaren, "MCL/FER" one garage split between two, "|" a gap
// (grey, a walkway or the building's core – no numbered garage), WALK a numbered garage used as a walkway. Codes as
// CODE below; FIA, FOM, PIR (Pirelli), VIP (F1 / FIA guests), STO (storage), LV (the promoter), CIR (the circuit), EMPTY.
// "||" (Madring) the long way between two separate garage blocks.
// sections: a garage drawn in parts (Monaco 2025: "MCLAREN | MCLAREN | MCLAREN") – each part drawn as a bay of its own.
// conf: H – read off the drawing; M – the drawing itself is unclear on something said in note.
export const CODE = { MCL: "McLaren", FER: "Ferrari", RBR: "Red Bull Racing", MER: "Mercedes", AST: "Aston Martin", ALP: "Alpine", HAA: "Haas F1 Team",
  RB: "Racing Bulls", WIL: "Williams", SAU: "Kick Sauber", AUD: "Audi", CAD: "Cadillac" };
const fia = (y, ev, v = "V1") => `FIA ${y} ${ev} – Pit Lane Drawing (${v})`;
export const GARAGE_PLANS = {
  2: { 2025: { seq: "FOM*2,FIA*4,MCL*3,FER*3,RBR*3,|,FIA,MER*3,AST*3,ALP*3,|,HAA*3,RB*3,PIR*2,|,WIL*3,SAU*3,FOM*2", src: fia(2025, "British GP", "V1, 3 Jul 2025"), conf: "H" },
    2026: { seq: "VIP*2,FIA*4,MCL*3,MER*3,RBR*3,|,FER*3,WIL*3,RB*3,AST,|,AST*2,HAA*3,AUD*3,|,ALP*3,CAD*3,FOM*2", src: fia(2026, "British GP", "V1, 2 Jul 2026"), conf: "H" } },
  4: { 2025: { seq: "VIP,FIA*3,FOM*2,|,MCL*3,FER*3,|,RBR*3,MER*3,|,AST*3,ALP*3,|,HAA*3,RB*3,|,WIL*3,SAU*3", src: fia(2025, "Hungarian GP", "V1, 30 Jul 2025"), conf: "H" },
    2026: { seq: "FIA*3,FOM,|,MCL*3,MER*3,|,RBR*3,FER*3,|,WIL*3,RB*3,|,AST*3,HAA*3,|,AUD*3,ALP*3,|,CAD*3,FOM,CIR*2", src: fia(2026, "Hungarian GP", "V1, 23 Jul 2026"), conf: "H" } },
  6: { 2025: { seq: "FIA*3,FOM*2,MCL*3,FER*3,|,RBR*3,|,MER*3,|,AST*3,ALP*3,|,HAA*3,RB*3,|,WIL*3,SAU*3", src: fia(2025, "Emilia Romagna GP", "V1, 15 May 2025"), conf: "H" } },
  7: { 2025: { seq: "FOM,FIA/FOM,|,FIA*3,MCL*3,MCL/FER,|,FER*3,RBR*2,|,RBR,MER/RBR,MER*3,WALK,AST,|,AST*2,ALP/AST,ALP*3,|,HAA*3,HAA/RB,RB*3,|,WIL*3,SAU/WIL,SAU,|,SAU*2,FOM", src: fia(2025, "Belgian GP", "V1, 24 Jul 2025"), conf: "H" },
    2026: { seq: "FOM,FIA/FOM,FIA*3,MCL*3,MER/MCL,MER*3,RBR*3,RBR/FER,FER*3,WALK,WIL*3,RB/WIL,RB*3,AST*3,HAA*3,AUD*3,ALP*3,CAD*3", src: fia(2026, "Belgian GP", "V1, 16 Jul 2026"), conf: "H" } },
  9: { 2025: { seq: "FIA*2,FOM,MCL*3,|,FER*3,RBR*3,MER*3,AST*3,|,ALP*3,HAA*3,|,RB*3,WIL*3,|,SAU*3,FOM", src: fia(2025, "United States GP", "V1, 16 Oct 2025"), conf: "H" } },
  10: { 2025: { rev: true, seq: "FOM*3,MCL*3,MCL/FER,FER*2,|,FER*2,RBR*3,MER/RBR,MER*3,|,AST*3,AST/ALP,ALP*3,HAA*2,|,HAA*2,RB/HAA,RB*2,WIL/RB,WIL*3,|,WIL/SAU,SAU*3,FIA*5", src: fia(2025, "Australian GP", "V1, 12 Mar 2025"), conf: "H" },
    2026: { rev: true, seq: "FOM*3,MCL*3,MCL/MER,MER*2,|,MER*2,RBR*3,FER/RBR,FER*3,|,WIL*3,RB*3,AST*3,|,AST/HAA,HAA*2,AUD*3,ALP*3,|,ALP/AUD,CAD*3,FIA*5", src: fia(2026, "Australian GP", "V1, 5 Mar 2026"), conf: "H" } },
  12: { 2026: { seq: "FOM,FIA*2,|,FIA*2,MCL*3,MER,|,MER,RBR/MER,RBR*2,FER*2,|,FER/WIL,WIL*2,RB*2,AST/RB,AST*2,HAA*2,HAA/AUD,AUD,|,AUD,ALP*2,CAD/ALP,CAD*2", src: fia(2026, "Bahrain GP in Malaysia", "V1, 1 Oct 2026"), conf: "M", note: "the drawing's fast-lane arrows point against its pit entry sign; the entry sign is followed" } },
  14: { 2025: { seq: "FIA,MCL*2,FER*2,RBR*2,MER*2,AST*2,|,ALP*2,HAA*2,RB*2,WIL*2,SAU*2,PIR*3", src: fia(2025, "São Paulo GP", "V1, 5 Nov 2025"), conf: "H" } },
  15: { 2025: { seq: "FOM,FIA*5,FOM,MCL*4,FER*4,RBR*4,MER*4,WALK,AST*4,ALP*4,HAA*4,RB*4,WIL*4,SAU*4,FOM", src: fia(2025, "Barcelona GP", "V1, 28 May 2025"), conf: "H" },
    2026: { seq: "FOM,FIA*4,MCL*4,MER*4,RBR*4,FER*4,WALK,WIL*4,RB*4,AST*4,HAA*3,HAA/AUD,AUD*3,ALP*3,ALP/CAD,CAD*3,FOM", src: fia(2026, "Barcelona-Catalunya GP", "V1, 11 Jun 2026"), conf: "H" } },
  19: { 2025: { seq: "FIA*3,FOM,|,MCL*3,FER*3,RBR*3,MER*3,AST*2,|,AST,ALP*2,ALP/HAA,HAA*2,RB/HAA,RB*2,WIL*2,SAU/WIL,SAU*2", src: fia(2025, "Austrian GP", "V1, 26 Jun 2025"), conf: "H" },
    2026: { seq: "FIA*3,FOM,|,MCL*3,MER,|,MER*2,RBR*3,FER*3,WIL*3,RB*3,|,AST*3,HAA*3,AUD*3,ALP*2,CAD/ALP,CAD*2", src: fia(2026, "Austrian GP", "V1, 25 Jun 2026"), conf: "H" } },
  // (Monaco: one garage per team; the 2025 drawing parts each in three, the 2026 one doesn't – the same temporary
  // building, so its three parts are kept for 2026 too: estimated, M)
  22: { 2025: { sections: 3, seq: "FIA/FOM,FIA,MCL,FER,RBR,MER,AST,ALP,HAA,|,RB,WIL,SAU,FOM", src: fia(2025, "Monaco GP", "V2, 23 May 2025"), conf: "H" },
    2026: { sections: 3, seq: "FIA/FOM,FIA,MCL,MER,RBR,FER,WIL,RB,AST,|,HAA,AUD,ALP,CAD", src: fia(2026, "Monaco GP", "V1, 4 Jun 2026"), conf: "M", note: "the 2026 drawing shows each garage undivided; its three parts are the 2025 drawing's" } },
  23: { 2025: { seq: "FIA*5,VIP*2,SAU*3,WIL*3,RB*3,RB/HAA,HAA*3,WALK,ALP*3,AST*3,MER*4,RBR*3,RBR/FER,FER*3,MCL*3,FOM/MCL,FOM", src: fia(2025, "Canadian GP", "V1, 12 Jun 2025"), conf: "H" },
    2026: { seq: "FIA*5,CAD*3,ALP*3,AUD*3,HAA*4,AST*3,WALK,RB*3,WIL*3,FER*4,RBR*3,MER*3,MCL*3,FOM/MCL,FOM", src: fia(2026, "Canadian GP", "V1, 21 May 2026"), conf: "H" } },
  39: { 2025: { seq: "FIA*4,PIR,MCL/PIR,MCL*4,FER*5,RBR*4,MER/RBR,MER*5,WALK,AST*4,ALP/AST,ALP*5,HAA*4,HAA/RB,RB*4,WIL*5,WIL/SAU,SAU*4,VIP*3", src: fia(2025, "Italian GP", "V1, 3 Sep 2025"), conf: "H" },
    2026: { seq: "FIA*4,STO,MCL/FOM,MCL*4,MER*5,RBR*4,FER/RBR,FER*5,WALK,WIL*4,RB/WIL,RB*5,AST*4,HAA*4,AUD*5,ALP*4,CAD*4,FOM", src: fia(2026, "Italian GP", "V1, 3 Sep 2026"), conf: "H" } },
  46: { 2025: { rev: true, seq: "FOM*4,|,MCL*4,FER*4,|,RBR*4,MER*4,|,AST*4,FOM*2,WALK,VIP,|,ALP*4,HAA*4,|,RB*4,WIL*4,|,SAU*4,FOM*2,FIA*5", src: fia(2025, "Japanese GP", "V1, 3 Apr 2025"), conf: "H" },
    2026: { rev: true, seq: "FOM*4,|,MCL*4,MER*4,|,RBR*4,FER*4,|,WIL*4,RB*4,|,AST*4,HAA*4,|,AUD*4,ALP*4,|,CAD*4,FOM*2,FIA*5", src: fia(2026, "Japanese GP", "V1, 26 Mar 2026"), conf: "H" } },
  49: { 2025: { seq: "FIA*3,|,FOM,MCL*3,MCL/FER,|,FER*2,RBR*3,RBR/MER,|,MER*2,AST*3,ALP*2,|,ALP,HAA*3,RB*2,|,RB/WIL,WIL*2,WIL/SAU,SAU*2,|,FOM,VIP,STO", src: fia(2025, "Chinese GP", "V1, 20 Mar 2025"), conf: "H" },
    2026: { seq: "FIA*3,|,FOM,MCL*3,MER*2,|,MER,RBR*3,FER*2,|,FER,WIL*3,RB*2,|,RB,AST*3,HAA*2,|,HAA/AUD,AUD*2,AUD/ALP,ALP*2,|,CAD*3", src: fia(2026, "Chinese GP", "V1, 12 Mar 2026"), conf: "H" } },
  55: { 2025: { seq: "FIA*3,MCL*3,FER*3,RBR*3,MER*3,FOM,AST*3,ALP*3,HAA*3,RB*3,|,WIL*3,SAU*3", src: fia(2025, "Dutch GP", "V2, 29 Aug 2025"), conf: "H" },
    2026: { seq: "FIA*3,MCL*3,MER*3,RBR*3,FER*3,WIL*3,RB*2,FOM/RB,FOM/AST,AST*2,HAA*2,HAA/AUD,AUD,|,AUD,ALP*2,ALP/CAD,CAD*2", src: fia(2026, "Dutch GP", "V1, 20 Aug 2026"), conf: "H" } },
  61: { 2025: { seq: "FOM,FIA*3,FOM,|,MCL*4,FER*4,RBR,|,RBR*2,MER/RBR,MER*3,AST*4,ALP*3,HAA*3,RB/HAA,RB,|,RB*2,WIL*3,SAU/WIL,SAU*3", src: fia(2025, "Singapore GP", "V1, 1 Oct 2025"), conf: "H" },
    2026: { seq: "FOM,FIA*4,|,MCL*3,MCL/MER,MER*3,RBR*2,|,RBR,FER/RBR,FER*3,WIL*3,WIL/RB,|,RB*3,AST*3,HAA*3,|,AUD*3,ALP*3,CAD*3", src: fia(2026, "Singapore GP", "V2, 9 Oct 2026"), conf: "H" } },
  63: { 2025: { seq: "FIA*2,FOM,|,MCL*4,FER*2,|,FER,RBR*4,MER,|,MER*2,AST*4,|,ALP*4,HAA*2,|,HAA,RB*4,WIL,|,WIL*2,SAU*4", src: fia(2025, "Bahrain GP", "V2, 13 Apr 2025"), conf: "H" } },
  65: { 2025: { seq: "FIA*2,FOM,|,MCL*3,FER*3,|,RBR*3,MER*3,|,AST*3,ALP*3,|,HAA*3,RB*3,|,WIL*3,SAU*3", src: fia(2025, "Mexico City GP", "V1, 23 Oct 2025"), conf: "H" } },
  70: { 2025: { seq: "FIA*4,FOM*2,MCL*3,FER/MCL,FER*3,RBR*3,MER*3,AST*3,|,ALP*3,HAA*3,RB*3,WIL*3,SAU*3,STO,VIP*2", src: fia(2025, "Abu Dhabi GP", "V2, 4 Dec 2025"), conf: "H" } },
  144: { 2025: { seq: "FIA*4,FOM*2,MCL*3,FER/MCL,FER*3,RBR*3,MER/RBR,MER*3,|,AST*3,ALP/AST,ALP*3,HAA*3,RB/HAA,RB*3,WIL*3,WIL/SAU,SAU*3,PIR*3", src: fia(2025, "Azerbaijan GP", "17 Sep 2025"), conf: "H" },
    2026: { seq: "FIA*4,FOM*2,MCL*3,MER/MCL,MER*3,RBR*3,FER/RBR,FER*3,|,WIL*3,RB*3,AST*3,HAA*3,AUD*3,ALP*3,CAD*3,PIR*3", src: fia(2026, "Azerbaijan GP", "V1, 23 Sep 2026"), conf: "H" } },
  149: { 2025: { seq: "FIA*4,FOM,MCL*4,FER*4,RBR*4,MER*4,|,AST*4,ALP*4,HAA*4,RB*4,WIL*4,SAU*4", src: fia(2025, "Saudi Arabian GP", "V1, 17 Apr 2025"), conf: "H" } },
  150: { 2025: { seq: "FOM*2,FIA*2,|,FIA*2,MCL*3,MCL/FER,FER*3,RBR*3,RBR/MER,MER*3,AST*2,|,AST,AST/ALP,ALP*3,HAA*3,HAA/RB,RB*3,WIL*3,WIL/SAU,SAU*2,|,SAU,VIP,WALK,VIP*3,EMPTY*4", src: fia(2025, "Qatar GP", "V1, 27 Nov 2025"), conf: "H" } },
  151: { 2025: { seq: "FIA*4,PIR,|,VIP,MCL*3,|,FER*3,RBR*3,|,MER*3,WALK,AST*3,|,ALP*3,HAA*3,|,RB*3,WIL*3,|,SAU*3", src: fia(2025, "Miami GP", "V1, 1 May 2025"), conf: "H" },
    2026: { seq: "FIA*3,MCL/FIA,MCL,|,MCL,MER*3,|,RBR*3,FER*3,|,WIL*3,WALK,RB*3,|,AST*3,HAA*3,|,AUD*3,ALP*3,|,CAD*3", src: fia(2026, "Miami GP", "V1, 30 Apr 2026"), conf: "H" } },
  // (the Las Vegas pit building's ground floor has 13 big garages – three bays each for a team, Las Vegas Review-Journal
  // 2023; the drawing numbers the 43 bays)
  152: { 2025: { seq: "FOM,LV*3,FIA*3,MCL*3,FER*3,RBR*3,MER*3,AST*3,|,ALP*3,HAA*3,RB*3,WIL*3,SAU*3,PIR,LV*5", src: fia(2025, "Las Vegas GP", "V1, 19 Nov 2025"), conf: "H" } },
  153: { 2026: { seq: "FIA*3,MCL*2,MER*2,|,FOM*2,RBR*2,|,FER*2,WIL*2,||,RB*2,AST*2,|,HAA*2,FIA,FOM,|,AUD*2,ALP*2,CAD*2", src: fia(2026, "Spanish GP (Madring)", "V1, 10 Sep 2026"), conf: "H", note: "two separate garage blocks (1–15, 16–29)" } },
};

const OTHER = { FIA: "FIA", FOM: "FOM", PIR: "Pirelli", VIP: "guests", STO: "storage", LV: "promoter", CIR: "circuit", EMPTY: "empty", WALK: "walkway" };
// A plan as its garages (entry → exit): [{ n (1-based, the drawing's order), owners: [team names (CODE) or others],
// teams: [the team names only], label, garage (the drawing's garage it's part of: sections), block (garages between gaps
// are one block), gaps, longGaps (how many of each lie before it) }]
export function planBays(plan) {
  if (!plan?.seq) return [];
  let toks = plan.seq.split(",").map((s) => s.trim()).filter(Boolean);
  if (plan.rev) toks = toks.reverse();
  const out = []; let block = 0, garage = 0, gaps = 0, longGaps = 0;
  for (const t of toks) {
    if (t === "|" || t === "||") { if (out.length) { block++; if (t === "|") gaps++; else longGaps++; } continue; }
    const [code, times] = t.split("*"), n = times ? +times : 1;
    for (let i = 0; i < n; i++) {
      const owners = code.split("/").map((c) => CODE[c] || OTHER[c] || c);
      garage++;
      for (let s = 0; s < (plan.sections || 1); s++)
        out.push({ n: out.length + 1, owners, teams: owners.filter((o) => Object.values(CODE).includes(o)), label: code, garage, block, gaps, longGaps, section: plan.sections ? s : null });
    }
  }
  return out;
}
// How many of a plan's garages a team has (a split one counts half; a garage drawn in sections is one).
export function teamGarages(bays, team) {
  const seen = new Map();
  for (const b of bays) if (b.teams.includes(team)) seen.set(b.garage, 1 / b.owners.length);
  return [...seen.values()].reduce((a, x) => a + x, 0);
}
export const planFor = (venueKey, season, plans = GARAGE_PLANS) => plans[venueKey]?.[season] || null;

// Where the plan's garages are, from where the teams' cars stopped: pitorder.js PIT_BOXES (each team's measured box,
// metres along the pit path, by its place in the constructors' order). A box lies in front of its team's garages (every
// drawing: one box per team before its garages) – taken as at their middle (estimate). The garages are taken as equally
// wide (the drawings draw them so; no source gives widths), a gap ("|") as one width of its own and a long gap between
// two separate blocks ("||", Madring) as another: bay i starts at a + i·w + (gaps before it)·g + (long gaps)·G, the four
// fitted to the boxes by least squares (a gap fitted narrower than nothing is none).
//   bays: planBays(plan); boxes: [u by rank]; how: PIT_BOXES' per-rank letters (m measured, i between – x extrapolated
//   ones aren't used); order: the season's constructors' order (team names; matched by teamKey).
// → { w, gap, longGap, bays: [{ n, u0, u1 }], resid (rms metres), teams: [[team, box u, fitted centre]], ok, why }
function solve(A, y) {
  // least squares by the normal equations (a handful of unknowns)
  const n = A[0].length, M = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  for (let r = 0; r < A.length; r++) for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) M[i][j] += A[r][i] * A[r][j]; M[i][n] += A[r][i] * y[r]; }
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => row[n] / row[i]);
}
export function fitLayout(bays, boxes, how, order, teamKey) {
  if (!bays.length || !boxes?.length || !order) return { ok: false, why: "no plan or boxes" };
  const key = (t) => teamKey(t) || t, norm = order.map(key);
  // each team's middle (split garages weigh half) as [bay units, gaps before, long gaps before], and its box
  const obs = [];
  for (const team of new Set(bays.flatMap((b) => b.teams))) {
    let r = norm.indexOf(key(team));
    if (r < 0 && key(team) === "Audi") r = norm.indexOf("Kick Sauber");
    if (r < 0 && key(team) === "Kick Sauber") r = norm.indexOf("Audi");
    if (r < 0 || r >= boxes.length || !/[mi]/.test(how?.[r] || "m")) continue;
    let s = [0, 0, 0], wsum = 0;
    bays.forEach((b, i) => { if (!b.teams.includes(team)) return; const wt = 1 / b.owners.length; s = [s[0] + (i + 0.5) * wt, s[1] + b.gaps * wt, s[2] + b.longGaps * wt]; wsum += wt; });
    if (wsum) obs.push({ team, x: s.map((v) => v / wsum), u: boxes[r] });
  }
  if (obs.length < 3) return { ok: false, why: "fewer than 3 teams with a measured box" };
  // (columns: 1, bays, gaps, long gaps – a column no team varies in is left out; a negative gap is refitted as none)
  let cols = [0, 1, 2, 3].filter((c) => c < 2 || new Set(obs.map((o) => o.x[c - 1])).size > 1), sol = null;
  for (let tries = 0; tries < 3; tries++) {
    const A = obs.map((o) => cols.map((c) => (c === 0 ? 1 : o.x[c - 1])));
    const x = solve(A, obs.map((o) => o.u)); if (!x) return { ok: false, why: "the boxes don't fix the layout" };
    sol = Object.fromEntries(cols.map((c, i) => [c, x[i]]));
    const neg = cols.find((c) => c >= 2 && sol[c] < 0); if (neg == null) break;
    cols = cols.filter((c) => c !== neg);
  }
  const a = sol[0], w = sol[1], g = sol[2] || 0, G = sol[3] || 0;
  if (!(w > 3 && w < 25)) return { ok: false, why: `fitted width ${w.toFixed(1)} m out of range` };
  const out = bays.map((b, i) => { const u0 = a + w * i + g * b.gaps + G * b.longGaps; return { n: b.n, u0, u1: u0 + w }; });
  const res = obs.map((o) => [o.team, o.u, a + w * o.x[0] + g * o.x[1] + G * o.x[2]]);
  const resid = Math.sqrt(res.reduce((s2, [, u, f]) => s2 + (u - f) ** 2, 0) / res.length), tol = Math.max(3, w * 0.6);
  return { ok: resid < tol, why: resid < tol ? "fitted" : `boxes ${resid.toFixed(1)} m off the fit`, w, gap: g, longGap: G, bays: out, resid, teams: res };
}

// The garages for a session: its season's drawing, placed by that season's measured boxes – or, where that season's boxes
// aren't measured, by another season's drawing and boxes when both drawings number the same garages (the same building:
// garage i is in the same place, only its team changes). → { plan, bays (planBays of the session's plan, each with u0,
// u1 along the pit path), w, from: { plan: season, layout: season }, fit } or { why } when there's none.
export function layoutFor(venueKey, season, pitBoxes, standings, teamKey, plans = GARAGE_PLANS) {
  const plan = planFor(venueKey, season, plans);
  if (!plan) return { why: "no FIA drawing for this event" };
  const bays = planBays(plan), garages = new Set(bays.map((b) => b.garage)).size;
  const seasons = Object.keys(pitBoxes?.[venueKey] || {}).map(Number).sort((a, b) => Math.abs(a - season) - Math.abs(b - season) || b - a);
  let why = "no measured boxes for a drawing numbering the same garages";
  for (const s of seasons) {
    const p2 = planFor(venueKey, s, plans); if (!p2) continue;
    const b2 = planBays(p2);
    if (new Set(b2.map((b) => b.garage)).size !== garages || b2.length !== bays.length) continue;
    const pb = pitBoxes[venueKey][s], fit = fitLayout(b2, pb.boxes, pb.how, standings[s], teamKey);
    // (a season whose boxes don't fit – a box between measured ones placed badly – leaves it to another's)
    if (!fit.ok) { why = `layout from ${s}: ${fit.why}`; continue; }
    return { plan, bays: bays.map((b, i) => ({ ...b, u0: fit.bays[i].u0, u1: fit.bays[i].u1 })), w: fit.w, from: { plan: season, layout: s }, fit };
  }
  return { why };
}
