// Pirelli dry-compound nominations (which C-number was HARD / MEDIUM / SOFT) for the races in the app's session cache –
// DATA ONLY. The cache's TimingAppData says SOFT/MEDIUM/HARD/INTERMEDIATE/WET; this table maps those to the C-number
// Pirelli nominated, so the tyre model can use the compound itself (C1 hardest … C5/C6 softest) rather than the label.
// Keys: cache session folder date + name as in the cache ("YYYY-MM-DD_Name_Grand_Prix"). Read 2026-10-29.
// Sources (`s`): index into SRC. "F" = the FIA "Pirelli Preview" prescription PDF of that event (also gives minimum
// starting pressures psi front/rear `p`, camber limits deg front/rear `cam`); copies kept in
// f1kr-work/v048/research/pirelli_previews/. Camber order in the 2025 sheets is unlabelled: the larger magnitude is
// taken as front (as labelled in the 2026 sheets). `sprint`: sprint weekend (affects the allocation, rules B6.2.4/30.2).
const FIA = "https://www.fia.com/system/files/decision-document/";
const F1 = "https://www.formula1.com/en/latest/article/";
export const SRC = {
  F: { doc: "FIA/Pirelli 'Pirelli Preview' event notes PDF (per event, filename in `pdf`)", base: FIA },
  pr25: { doc: "Pirelli release (Aug 2025) reprinted by f1technical.net: Belgium + last 10 races of 2025", url: "https://www.f1technical.net/news/27628" },
  pr26mm: { doc: "Pirelli release reprinted by f1technical.net: Miami and Montréal 2026", url: "https://www.f1technical.net/news/28436" },
  f1: { doc: "formula1.com 'What tyres will the teams and drivers have for the … Grand Prix' (quotes Pirelli)", base: F1 },
  merc: { doc: "mercedesamgf1.com 'What are the tyre options for the … GP'", base: "https://www.mercedesamgf1.com/news/" },
};
const N = (H, M, S, more) => ({ H, M, S, ...more });

export default {
  accessed: "2026-10-29",
  range: { 2024: ["C1", "C2", "C3", "C4", "C5"], 2025: ["C1", "C2", "C3", "C4", "C5", "C6"], 2026: ["C1", "C2", "C3", "C4", "C5"] },
  races: {
    "2024-07-07_British_Grand_Prix": N("C1", "C2", "C3", { s: ["f1"], url: F1 + "what-tyres-will-the-teams-and-drivers-have-for-the-2024-british-grand-prix.3vzK0q1kbEOjzwGClOCXoF" }),
    "2025-03-16_Australian_Grand_Prix": N("C3", "C4", "C5", { s: ["f1", "F"], pdf: "2025_australian_grand_prix_-_event_notes_-_pirelli_preview_v2.pdf", p: [26.5, 22.0], cam: [-3.25, -1.75] }),
    "2025-03-23_Chinese_Grand_Prix": N("C2", "C3", "C4", { s: ["f1", "F"], sprint: true, pdf: "2025_chinese_grand_prix_-_event_notes_-_pirelli_preview_v2.pdf", p: [27.5, 24.0], cam: [-3.0, -1.75] }),
    "2025-04-06_Japanese_Grand_Prix": N("C1", "C2", "C3", { s: ["f1", "F"], pdf: "2025_japanese_grand_prix_-_event_notes_-_pirelli_preview.pdf", p: [24.5, 23.5], cam: [-2.75, -1.5] }),
    "2025-04-13_Bahrain_Grand_Prix": N("C1", "C2", "C3", { s: ["f1", "F"], pdf: "2025_bahrain_grand_prix_-_event_notes_-_pirelli_preview_v2.pdf", p: [23.0, 20.0], cam: [-3.25, -2.0] }),
    "2025-04-20_Saudi_Arabian_Grand_Prix": N("C3", "C4", "C5", { s: ["f1", "F"], pdf: "2025_saudi_arabian_grand_prix_-_event_notes_-_pirelli_preview.pdf", p: [25.5, 21.5], cam: [-3.25, -1.75] }),
    "2025-05-04_Miami_Grand_Prix": N("C3", "C4", "C5", { s: ["f1", "F"], sprint: true, pdf: "2025_miami_grand_prix_-_event_notes_-_pirelli_preview_v2.pdf", p: [25.5, 21.5], cam: [-3.0, -1.75] }),
    "2025-05-18_Emilia_Romagna_Grand_Prix": N("C4", "C5", "C6", { s: ["f1", "F"], pdf: "2025_emilia_romagna_grand_prix_-_event_notes_-_pirelli_preview_v2.pdf", p: [24.5, 21.5], cam: [-3.0, -1.75] }),
    "2025-05-25_Monaco_Grand_Prix": N("C4", "C5", "C6", { s: ["f1", "F"], pdf: "2025_monaco_grand_prix_-_event_notes_-_pirelli_preview.pdf", p: [20.0, 19.0], cam: [-3.25, -2.25] }),
    "2025-06-01_Spanish_Grand_Prix": N("C1", "C2", "C3", { s: ["f1", "F"], pdf: "2025_spanish_grand_prix_-_event_notes_-_pirelli_preview.pdf", p: [26.0, 22.0], cam: [-3.0, -1.75] }),
    "2025-06-15_Canadian_Grand_Prix": N("C4", "C5", "C6", { s: ["f1", "F"], pdf: "2025_canadian_grand_prix_-_event_notes_-_pirelli_preview.pdf", p: [23.5, 20.5], cam: [-3.25, -2.0] }),
    "2025-06-29_Austrian_Grand_Prix": N("C3", "C4", "C5", { s: ["f1", "F"], pdf: "2025_austrian_grand_prix_-_event_notes_-_pirelli_preview.pdf", p: [22.5, 20.0], cam: [-3.0, -1.75] }),
    "2025-07-06_British_Grand_Prix": N("C2", "C3", "C4", { s: ["f1", "F"], pdf: "2025_british_grand_prix_-_event_notes_-_pirelli_preview.pdf", p: [26.5, 23.5], cam: [-2.75, -1.5] }),
    "2025-07-27_Belgian_Grand_Prix": N("C1", "C3", "C4", { s: ["pr25", "F"], sprint: true, pdf: "2025_belgian_grand_prix_-_event_notes_-_pirelli_preview.pdf", p: [26.5, 24.5], cam: [-2.75, -1.5] }),
    "2025-08-03_Hungarian_Grand_Prix": N("C3", "C4", "C5", { s: ["f1", "F"], pdf: "2025_hungarian_grand_prix_-_event_notes_-_pirelli_preview.pdf", p: [22.0, 20.0], cam: [-3.25, -2.0] }),
    "2025-08-31_Dutch_Grand_Prix": N("C2", "C3", "C4", { s: ["pr25", "F"], pdf: "2025_dutch_grand_prix_-_event_notes_-_pirelli_preview.pdf", p: [25.0, 22.5], cam: [-3.0, -1.75] }),
    "2025-09-07_Italian_Grand_Prix": N("C3", "C4", "C5", { s: ["pr25", "F"], pdf: "2025_italian_grand_prix_-_event_notes_-_pirelli_preview.pdf", p: [25.5, 23.5], cam: [-3.0, -2.0] }),
    "2025-09-21_Azerbaijan_Grand_Prix": N("C4", "C5", "C6", { s: ["pr25", "F"], pdf: "2025_azerbaijan_grand_prix_-_event_notes_-_pirelli_preview.pdf", p: [27.0, 26.0], cam: [-3.0, -1.75] }),
    "2025-10-05_Singapore_Grand_Prix": N("C3", "C4", "C5", { s: ["pr25", "F"], pdf: "2025_singapore_grand_prix_-_event_notes_-_pirelli_preview.pdf", p: [22.0, 20.0], cam: [-3.25, -2.0] }),
    "2025-10-19_United_States_Grand_Prix": N("C1", "C3", "C4", { s: ["pr25", "F"], sprint: true, pdf: "2025_united_states_grand_prix_-_event_notes_-_pirelli_preview_v2.pdf", p: [25.0, 23.0], cam: [-3.0, -1.75] }),
    "2025-10-26_Mexico_City_Grand_Prix": N("C2", "C4", "C5", { s: ["pr25", "F"], pdf: "2025_mexico_city_grand_prix_-_event_notes_-_pirelli_preview.pdf", p: [23.5, 21.0], cam: [-3.0, -1.75] }),
    "2025-11-09_S_o_Paulo_Grand_Prix": N("C2", "C3", "C4", { s: ["pr25", "F"], sprint: true, pdf: "2025_sao_paulo_grand_prix_-_event_notes_-_pirelli_preview.pdf", p: [25.0, 23.0], cam: [-3.0, -1.75] }),
    "2025-11-22_Las_Vegas_Grand_Prix": N("C3", "C4", "C5", { s: ["pr25"] }),
    "2025-11-30_Qatar_Grand_Prix": N("C1", "C2", "C3", { s: ["pr25", "F"], sprint: true, pdf: "2025_qatar_grand_prix_-_event_notes_-_pirelli_preview_v3.pdf", p: [29.0, 24.5], cam: [-2.75, -1.5],
      note: "the sheet has a per-set maximum-laps clause; the lap number was not in the extracted text" }),
    "2025-12-07_Abu_Dhabi_Grand_Prix": N("C3", "C4", "C5", { s: ["pr25", "F"], pdf: "2025_abu_dhabi_grand_prix_-_event_notes_-_pirelli_preview_v2.pdf", p: [24.5, 21.5], cam: [-3.0, -2.0] }),
    "2026-03-08_Australian_Grand_Prix": N("C3", "C4", "C5", { s: ["merc"], url: "https://www.mercedesamgf1.com/news/what-are-the-tyre-options-for-the-2026-australian-gp", p: [28.5, 26.0], cam: [-3.25, -1.75], pNote: "p/cam from the FIA sheet as read by a helper (copy not kept)" }),
    "2026-03-15_Chinese_Grand_Prix": N("C2", "C3", "C4", { s: ["merc", "F"], sprint: true, pdf: "2026_chinese_grand_prix_-_competition_notes_-_pirelli_preview.pdf", p: [26.5, 24.5], cam: [-3.0, -1.75] }),
    "2026-03-29_Japanese_Grand_Prix": N("C1", "C2", "C3", { s: ["merc", "F"], pdf: "2026_japanese_grand_prix_-_competition_notes_-_pirelli_preview_v2.pdf", p: [28.0, 26.0], cam: [-2.75, -1.5] }),
    "2026-05-03_Miami_Grand_Prix": N("C3", "C4", "C5", { s: ["pr26mm"], sprint: true, p: [26.5, 26.5], cam: [-3.0, -1.75], pNote: "p/cam from the FIA sheet as read by a helper (copy not kept)" }),
    "2026-05-24_Canadian_Grand_Prix": N("C3", "C4", "C5", { s: ["pr26mm", "merc"], sprint: true, url: "https://www.mercedesamgf1.com/news/what-are-the-tyre-options-for-the-2026-canadian-gp" }),
    "2026-06-07_Monaco_Grand_Prix": N("C3", "C4", "C5", { s: ["merc"], url: "https://www.mercedesamgf1.com/news/what-are-the-tyre-options-for-the-2026-monaco-gp", p: [24.0, 23.0], cam: [-3.25, -2.25], pNote: "p/cam from the FIA sheet as read by a helper (copy not kept)" }),
    "2026-06-14_Barcelona_Grand_Prix": N("C2", "C3", "C4", { s: ["f1", "F"], pdf: "2026_barcelona-catalunya_grand_prix_-_competition_notes_-_pirelli_preview_v2.pdf", p: [25.0, 24.0], cam: [-3.0, -1.75] }),
    "2026-06-28_Austrian_Grand_Prix": N("C3", "C4", "C5", { s: ["f1"], url: F1 + "what-tyres-will-the-teams-and-drivers-have-for-the-2026-austrian-grand-prix.2bhUStvp9xxGLpN2gvTeib" }),
    "2026-07-05_British_Grand_Prix": N("C1", "C2", "C3", { s: ["f1", "F"], sprint: true, pdf: "2026_british_grand_prix_-_competition_notes_-_pirelli_preview.pdf", p: [28.0, 26.0], cam: [-2.75, -1.5] }),
    "2026-07-26_Hungarian_Grand_Prix": N("C3", "C4", "C5", { s: ["f1", "merc"], url: F1 + "what-tyres-will-the-teams-and-drivers-have-for-the-2026-hungarian-grand-prix.RikSxOCPXMkPloK0RRmqQ" }),
    "2026-08-23_Dutch_Grand_Prix": N("C2", "C3", "C4", { s: ["f1"], sprint: true, url: "https://formula1.com/en/latest/article/what-tyres-will-the-teams-and-drivers-have-for-the-2026-dutch-grand-prix.402ufleb78rXrqaispof9U" }),
    "2026-09-06_Italian_Grand_Prix": N("C3", "C4", "C5", { s: ["f1", "F"], pdf: "2026_italian_grand_prix_-_competition_notes_-_pirelli_preview.pdf", p: [26.0, 26.0], cam: [-3.0, -2.0] }),
    "2026-09-13_Spanish_Grand_Prix": N("C2", "C3", "C4", { s: ["f1"], url: F1 + "what-tyres-will-the-teams-and-drivers-have-for-the-2026-spanish-grand-prix.2vlcVOBnZUFRCooVcqWG7n", note: "Madrid (Madring)" }),
    "2026-09-26_Azerbaijan_Grand_Prix": N("C3", "C4", "C5", { s: ["f1"], url: F1 + "what-tyres-will-the-teams-and-drivers-have-for-the-2026-azerbaijan-grand-prix.1UFiasleBnLs9s0hyRCpS0" }),
    "2026-10-04_Bahrain_Grand_Prix": N("C2", "C3", "C4", { s: ["f1"], url: F1 + "what-tyres-will-the-teams-and-drivers-have-for-the-2026-bahrain-grand-prix-in-malaysia.4vcrMxYY9DWg7PwyiNMrEV",
      note: "the 2026 'Bahrain GP' was held at Sepang, Malaysia (per this article) – the scenario must use the cached track shape, not Sakhir" }),
    "2026-10-11_Singapore_Grand_Prix": N("C3", "C4", "C5", { s: ["f1", "F"], sprint: true, pdf: "2026_singapore_grand_prix_-_competition_notes_-_pirelli_preview.pdf", p: [24.0, 23.0], cam: [-3.25, -2.0] }),
  },
};
