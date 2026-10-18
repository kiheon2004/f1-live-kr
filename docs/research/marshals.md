# Marshal posts, light panels, marshalling sectors and marshal kit (v0.37 research)

Researched 2026-10-18. Web research and offline PDF parsing only. No app runs and no code edits.

Companion data file: `marshal_posts_fia.json` (same folder). For every circuit with a vector FIA map, it lists each
light panel, marshal post and corner. Each entry has its lap fraction, its side of the track (L/R), and coordinates
in F1 live-timing Position units.

## 1. Source and method

**Primary source.** The circuit map that the FIA F1 Race Director publishes for each event, on the official document
board at https://www.fia.com/documents/championships/fia-formula-one-world-championship-14/season/season-2025-2071
(2025) and `.../season-2026-2072` (2026). It is called "Event Notes – Circuit Map …" in 2025 and
"Competition Notes – Circuit Map …" in 2026. Every map has a legend with these entries:
- "Marshal Post" / "M2 MARSHAL POST" (red/orange text such as `M8.6`)
- "FIA Marshal Light No." / "FIA LIGHT PANEL" (a number in a yellow box)
- "Corner Numbers" (blue)

Most of these PDFs are vector files with real text. I extracted every label and its page position with PyMuPDF. For
2025, the Australia, Bahrain, China, Japan, Miami and Saudi maps have outlined text (no extractable text). For those I
read the rendered images or used the 2026 vector map instead.

**Post naming rule.** The FIA defines it in Appendix H 2026, Art. 2.4.2:
https://www.fia.com/system/files/documents/appendix_h_2026_published_23062026.pdf
> "Commencing from the main marshal post where the Clerk of the Course signals are given, which is designated '0', each
> marshal post (MP) shall be identified by the following method: Turn 2 → MP2, the following MP would be determined by
> its relative distance to the next Turn. For example, a position halfway between T2 and T3 would be identified as
> MP2.5, one close to Turn 3 may be MP2.9. The MP sign-board shall measure 40 cm wide and 30 cm high with a white
> background and black lettering … clearly visible from the track on the approached side."

So `M8.6` sits about 60 % of the way from T8 to T9. Some circuits still use letters or sequential suffixes instead:
- letter suffixes: Monaco `M21C`, Spa `M19B`, COTA `M11D`, Sepang `M15F`, Red Bull Ring `M17A`
- sequential suffixes: Imola and Monza (`M11.1 … M11.8`)

Lusail writes the prefix as `MP`.

Appendix H 2.4.2 also says:
- no section of road may escape observation;
- each post must be able to see the previous post and the next one;
- consecutive posts should be no more than 500 m apart, not counting supplementary posts.

**Position on track.** I fitted each map to a real lap: one fast race lap from OpenF1 `/v1/location`, which uses the
same x/y units as the F1 Position.z feed (1/10 m). The fit is a similarity transform with ICP refinement against the
map's grey track pixels. The median residual is about 0.2 pt on the PDF, roughly 5–8 m. On every circuit, the light
panels then fall in exact 1…N order around the lap, which validates the fit. Each label was then snapped to the
nearest point of the lap. That gives:
- `lapFrac`: 0–1, measured from the timing line in driving direction
- `side`: L/R, the side of the drawn track the label sits on

> **Caveat on side.** The FIA map does not draw a separate post symbol, so I read the side from where the label is
> drawn. That matches physical reality at the posts I spot-checked visually (Monaco, Silverstone, Suzuka). It is still
> an inference, so confidence is medium. Where two tracks run close together (for example Silverstone T5/T10, Shanghai
> T1–T3, Suzuka around the crossover), a few labels may have snapped to the wrong stretch of track. The JSON flags
> `labelOffsetPt` for this; trust anything under about 15 pt.

**What the maps do not tell you.** The FIA maps do not distinguish post types (flag, intervention, fire or recovery).
Every `M…` is a "Marshal Post". Recovery cranes, fire points and medical cars are not drawn. Light panels are drawn
separately as numbered yellow boxes.

## 2. Light panels = marshalling sectors = `Sector` in the feed

- F1 Sporting Regulations define the sector explicitly: "a marshalling sector is defined as the section of track
  between each of the FIA light panels". Sources:
  - 2025 SR Issue 5, Art. 55.7 and 56.4:
    https://www.fia.com/system/files/documents/fia_2025_formula_1_sporting_regulations_-_issue_5_-_2025-04-30.pdf
  - 2026 Section B Issue 09, Art. B4.1.2a, B4.1.4b and B5.12.2b:
    https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_09_-_2026-10-01.pdf
- In OpenF1's copy of RaceControlMessages, the highest `sector` used at each 2026 event equals the number of FIA light
  panels on that event's map: Suzuka 29/29, Madring 26/26, Miami 21/21, Sepang 19/19, Melbourne 20/20, Montréal 15/15,
  Monaco 19/19, Barcelona 16/16, Spielberg 16/16, Silverstone 17/17, Zandvoort 18/18, Baku 21/21, Singapore 16/16.
  Where the highest value is lower, that event simply never had a flag in the last sectors.
- Location check: Silverstone 2025 race, "YELLOW/DOUBLE YELLOW IN TRACK SECTOR 10", with a T9 (Copse) incident. On the
  map, light 10 is the panel just before T9.
- The MultiViewer circuit API (`api.multiviewer.app/api/v1/circuits/{key}/{year}`, fields `marshalLights` and
  `marshalSectors`) carries the same numbering. For most circuits, FIA panel n lands within about 30–50 m of MultiViewer
  light n. However, its data is old (2019–2023 layouts) and is wrong for these renumbered circuits:
  - Suzuka 2026: 29 panels (MultiViewer has 22)
  - Yas Marina: 30 panels (MultiViewer has 20)
  - Miami 2026: 21 panels (MultiViewer has 19)
  - Zandvoort: 18 panels (MultiViewer has 19)
  - Hungaroring 2026: 20 panels (MultiViewer has 19)

  It has no Madring or Sepang data at all. **Use the FIA map numbers, not MultiViewer.**
- Panel 1 is always just before the control line, so it is the last item in lap order. Sector n runs from panel n to
  panel n+1, and sector N wraps around to panel 1.
- Lusail has two panels numbered "8" ("both panels mirror each other", Stewards doc 4, 27 Nov 2025). Madring has two
  "6" boxes. Treat the duplicate as the same signal shown twice.

## 3. Per-circuit table

The light count equals the marshalling sector count. "RCM max" is the highest `sector` seen in OpenF1 race_control
for 2025 and 2026. Confidence: H = vector map, fit validated; M = see notes; L = image read only.

| Key | Circuit | Map used (season, version) | Light panels / sectors | Marshal posts (count, ids) | RCM max 25/26 | Notes | Conf. |
|---|---|---|---|---|---|---|---|
| 2 | Silverstone | 2026 v2 (30.06.26); 2025 v2 identical | 17 | 31: M1 M1.5 M2.4 M3 M3.5 M4.5 M5.2 M5.6 M5.8 M6 M7 M7.4 M7.8 M8.2 M8.6 M8.9 M9 M9.7 M9.9 M10 M10.5 M12 M13.7 M14.2 M14.5 M14.9 M15.2 M15.7 M17.4 M18.1 M18.7 | 17/17 | M10.5 snaps near T5 (parallel stretch); check | H |
| 4 | Hungaroring | 2026 v2 (21.07.26) | **20** (2025: 19) | 26: M0…M14.7 | 18/19 | Panel added in 2026 | H |
| 6 | Imola | 2025 v3 (15.05.25), not on 2026 calendar | 19 | 66 (sequential M4.1–M4.4 style) | 19/– | Very dense posting | H |
| 7 | Spa | 2026 v4 (16.07.26); 2025 same | 21 | 31 (letter suffix B/C) | 21/19 | | H |
| 9 | COTA | 2025 v1 (17.09.25); 2026 map not yet published (GP 23 Oct) | 20 | 33 (letter suffix A–D) | 20/– | | H |
| 10 | Albert Park | 2026 v2 (03.03.26); 2025 map is image-only | 20 | 25 | 20/20 | | H |
| 12 | Sepang | 2026 "Bahrain GP in Malaysia" v4 (01.10.26) | 19 | 36 (letter suffix, M1A…M16) | –/19 | No MultiViewer data | H |
| 14 | Interlagos | 2025 v3 (06.11.25) | 16 | 19 | 16/– | Fewest posts | H |
| 15 | Barcelona | 2026 v1 (21.05.26); 2025 same | 16 | 25 | 14/16 | | H |
| 19 | Red Bull Ring | 2026 v3 (22.06.26) | 16 | 33 (M0–M27, sequential plus A/B) | 16/16 | Old sequential scheme, not corner-based | H |
| 22 | Monaco | 2026 v2 (31.05.26); 2025 v3 same | 19 | 40 (M1B … M21C, letter suffixes) | 18/19 | | H |
| 23 | Montréal | 2026 v3 (22.05.26) | 15 | 24 | 15/15 | | H |
| 39 | Monza | 2026 v2 (03.09.26) | 17 | 55 (sequential decimals) | 13/16 | | H |
| 46 | Suzuka | 2026 v3 (25.03.26); 2025 map image-only | **29** (MultiViewer 22) | 28 | 9/29 | Figure-8 crossover; check posts near T15–T17 | H/M |
| 49 | Shanghai | 2026 v4 (11.03.26) | 20 | 52 | 20/19 | | H |
| 55 | Zandvoort | 2026 v2 (17.08.26) | 18 | 25 | 18/18 | MultiViewer has 19 (outdated) | H |
| 61 | Marina Bay | 2026 v2 (07.10.26) | 16 | 35 | 16/16 | | H |
| 63 | Sakhir | 2025 v4 (11.04.25), image read; 2026 Bahrain GP moved to Sepang | 18 | 30 (read from image): M0.7 M1.1 M1.3 M2.0 M3.3 M3.5 M3.8 M4.1 M6.0 M6.3 M7.2 M8.1 M8.5 M8.7 M9.0 M10.0 M10.2 M10.5 M10.8 M11.4 M12.1 M12.5 M13.0 M13.1 M13.5 M13.6 M13.8 M14.1 M15.1 M15.2 | 11/– | No coordinates (outlined text) | L |
| 65 | Mexico City | 2025 v2 (23.10.25) | 16 | 38 | 14/– | | H |
| 70 | Yas Marina | 2025 v4 (04.12.25) | **30** (MultiViewer 20) | 31 | 28/– | Panels 01–30 | H |
| 144 | Baku | 2026 v2 (15.09.26) | 21 | 40 | 21/21 | | H |
| 149 | Jeddah | 2025 v1 (27.03.25), image only; no 2026 event documents | 22 (read from image) | "MP…" posts, about 40, too small to transcribe | 21/– | Not transcribed | L |
| 150 | Lusail | 2025 v2 (27.11.25) | 20 (21 boxes; two "8") | 45 (MP-prefix) | 19/– | | H |
| 151 | Miami | 2026 v5 (30.04.26) | **21** (MultiViewer 19) | 36 | 20/21 | | H |
| 152 | Las Vegas | 2025 v2 (19.11.25) | 21 | 37 | 21/– | | H |
| 153 | Madring | 2026 v3 (10.09.26) | 26 (27 boxes; two "6") | 38 | –/26 | No MultiViewer data | H |

Full map URLs are in the JSON as `mapUrl`. Examples:
- Silverstone 2026: https://www.fia.com/system/files/decision-document/2026_british_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf
- Monaco 2026: https://www.fia.com/system/files/decision-document/2026_monaco_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf
- Suzuka 2026: https://www.fia.com/system/files/decision-document/2026_japanese_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_battery_containment_area_and_red_zone.pdf
- Sakhir 2025: https://www.fia.com/system/files/decision-document/2025_bahrain_grand_prix_-_event_notes_-_circuit_map_v4.pdf
- Jeddah 2025: https://www.fia.com/system/files/decision-document/2025_saudi_arabian_grand_prix_-_event_notes_-_circuit_map_pit_lane_and_quarantine_zone.pdf

### What exists beyond the FIA maps
- **No public source gives post types** (flag, intervention, fire, recovery) for F1 circuits. Circuit clubs keep that
  in internal post books.
- **No ASN or marshal-club post map gives coordinates.** The FIA map is the most authoritative and up-to-date source,
  and it is versioned per event.
- **Every post shows flags.** Appendix H 2.4.3 requires each post to carry:
  - flags: 2 yellow, 1 yellow with red stripes, 1 blue, 1 white, 1 green, 1 red;
  - an "SC" board (black on white, at least 60×80 cm) and an "FCY" board;
  - at least 3 extinguishers, brooms and absorbent.

  So every `M…` post is a flag post with intervention capability. The light panels are separate FIA-installed units
  at the sector boundaries.
- **Lights versus flags.** Appendix H 2.5.3.3: "as signal lights normally show one signal at a time, the presence of
  flag marshals remains essential". Lights flash at 3–4 Hz; each flag is shown as a pair of lights flashing
  alternately or as one flashing panel (2.5.3.1 and 2.5.3.3).

## 4. Marshal clothing (Part 2)

| Item | Finding | Source | Confidence |
|---|---|---|---|
| Colour rule | Appendix H 2.4.4: "Marshals should not wear clothing similar in colour to any signalling flag, particularly yellow and red." There is no FIA rule mandating orange. | Appendix H 2026 (URL above) | H |
| Fire protection | Appendix H 2.6.1: "All intervention personnel should wear clothing which will protect all parts of the body, including head, face and eyes, from fire." Where a helmet risk assessment applies, helmets meeting one of: CPSC, ECE 22.05, JIS T8133-2015 class 2, DOT, EN443:2008 (firefighter), ASTM F1952. | Appendix H 2026 | H |
| Orange as de facto standard | F1.com (10 Oct 2025): marshals wear "bright orange jumpsuits". | https://www.formula1.com/en/latest/article/f1-explains-how-marshals-act-as-the-first-line-of-safety-for-f1-drivers.6acUVn42nBRv1OdQZnZwUU | H |
| UK (Silverstone) | BMMC "distinctive orange, fire-resistant overalls"; 2024+ Prodrive partnership branded "British Racing Orange". Marshals say the overalls are flame-retardant Proban, not fireproof. | tyrepress.com 2017; octane-magazine.com; forums.autosport.com | M |
| Monaco | ACM Corps des Commissaires; the "famous orange suit" dates from 1975 ("Il y a 50 ans, en 1975, la fameuse combinaison orange…"); about 600–700 volunteers. | Monaco Tribune, 2 May 2025: https://www.monaco-tribune.com/2025/05/les-anges-gardiens-de-monaco-le-documentaire-hommage-aux-commissaires-de-piste-avec-le-prince-albert-ii/ | H |
| Singapore | Officials "are often called the orange army, but there are some race officials who do not wear orange overalls". Roles: flag, track, recovery, fire. | SGP 2019 Annex A: https://singaporegp.sg/media/2019/press_release/20190318-race-officials-open-house/annex-a.pdf | H |
| Japan, COTA, other circuits | No written source found. From general race imagery (not verified for this note), F1 marshals worldwide appear in orange overalls with circuit or sponsor lettering, with fire and rescue crews sometimes in different fire suits. | none found | L |
| Helmets, headsets, reflective strips | Not specified for flag marshals in Appendix H. The post chief must keep verbal radio contact with race control (2.4.4), so expect one radio headset per post. Night races swap flags for 80 cm reflective discs or lights (2.11.1). | Appendix H 2026 | M (radio) / L (look) |

**Rendering suggestion.**
- Default: orange one-piece overalls, with white or black lettering on the back.
- No yellow or red garments.
- Gloves; optional open-face helmet only on intervention marshals.
- One marshal per post with a radio headset.
