# Flag rules and timing-feed flag fields (v0.37 research)

Researched 2026-10-18.

## Sources
- **ISC Appendix H 2026** (published 23/06/2026):
  https://www.fia.com/system/files/documents/appendix_h_2026_published_23062026.pdf
  - Appendix H 2025 (republished 12/03/2026) has the same wording for every clause cited here:
    https://www.fia.com/system/files/documents/appendix_h_2025_published_12032026.pdf
- **F1 Sporting Regulations 2025**, Issue 5 (30 Apr 2025):
  https://www.fia.com/system/files/documents/fia_2025_formula_1_sporting_regulations_-_issue_5_-_2025-04-30.pdf
- **F1 Regulations 2026, Section B Sporting**, Issue 09 (01 Oct 2026):
  https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_09_-_2026-10-01.pdf
- **FastF1** source docstrings (`fastf1/_api.py`, `track_status_data` and `race_control_messages`):
  https://github.com/theOehrly/Fast-F1/blob/master/fastf1/_api.py
- **OpenF1** race_control docs: https://openf1.org/docs/
  - data: `https://api.openf1.org/v1/race_control?meeting_key=…`, all 2025 meetings and 2026 meetings up to Singapore.

## 1. Flag rules for animation

| Signal | Rule (quote or summary) | Where shown | Clause |
|---|---|---|---|
| Single waved yellow | "Reduce your speed, do not overtake, and be prepared to change direction. There is a hazard beside or partly on the track." | "Yellow flags should normally be shown only at the marshal post immediately preceding the hazard. In some cases, however, the Clerk of the Course may order them to be shown at more than one marshal post preceding an incident. Overtaking is not permitted between the first yellow flag and the green flag displayed after the incident." | App H 2.5.5 b); F1: 2025 Art. 26.1a, 2026 B1.8.4a |
| Double waved yellow | "Reduce your speed significantly, do not overtake, and be prepared to change direction or stop. There is a hazard wholly or partly blocking the track and/or marshals working on or beside the track." In practice and qualifying the lap must be abandoned; F1 deletes the lap time in qualifying. | Same posts as single yellow. How the two flags are held is not specified: each post carries **2 yellow flags** (2.4.3 b), so one marshal can wave two or two marshals can wave one each. Both are seen; for animation, one marshal waving two flags is fine. | App H 2.5.5 b), 2.4.3 b); 2025 Art. 26.1b; 2026 B1.8.4b |
| Double yellow under SC/VSC | The driver must also stay above the ECU minimum time in each marshalling sector concerned. | — | 2025 Art. 26.1c; 2026 B1.8.4c |
| Green | "should be waved at the marshal post immediately after the incident that necessitated the use of one or more yellow flags." | The first post after the hazard. In the feed, that is the start of sector n+1. | App H 2.5.5 g) |
| Red | "waved at the start line … Simultaneously, each marshal post around the circuit should also wave a red flag." F1: "red flags will be shown at all marshal posts and at the Control Line", orange gantry lights on. Red lights or panels are operated only from race control. | **All posts** plus the line | App H 2.5.4.1 b), 2.5.5 a), 2.5.3.3; 2025 Art. 57; 2026 B4.1.2, B5.14.1, B5.14.2 |
| Safety Car | "all FIA light panels will display 'SC', all marshal's posts will display waved yellow flags and 'SC' boards". The double waved yellow continues at the post before the incident (App H 2.10.8). At the end, the SC boards are withdrawn as the SC nears pit entry; the yellows are withdrawn and a green flag and/or green light is shown **at the Control Line** as the leader approaches. | **All posts**: single waved yellow plus SC board; panels show "SC" | 2025 Art. 55.4, 55.15; 2026 B5.13.1, B5.13.6; App H 2.10.8 |
| VSC | F1 regulations: "all FIA light panels will display 'VSC'". No marshal flag is specified in the F1 regulations. VSC is used "when double waved yellow flags are needed on any section of track". At "VSC ENDING", 10–15 s later the panels change to **green**, then go dark after 30 s. Generic App H note: "single yellow flag and a board indicating VSC … double waved yellow flags will continue to be displayed at the post prior to the incident". | Panels: "VSC" on all. Posts (App H generic): single yellow plus VSC board; double yellow at the incident post. Ending: all panels green for 30 s. | 2025 Art. 56.1, 56.2, 56.7; 2026 B5.12, B5.12.1, B5.12.4, B4.1.4; App H 2.5.5 b) note |
| FCY / Code 60 / SLOW | Not used in F1. FCY board, Code 60 purple flag, SLOW zones. | — | App H 2.5.5 b), c) |
| Yellow with red stripes | Shown motionless; slippery surface ahead; for about 4 laps; no green needed after it. | Single post | App H 2.5.5 d) |
| Blue | Waved; car about to be lapped (race) or a faster car behind (practice); shown stationary at pit exit when traffic approaches. | Posts, per driver | App H 2.5.5 e) |
| White | Waved; much slower vehicle in the sector. | Post | App H 2.5.5 f) |
| Chequered | "waved from behind the first line of protection until all competing cars have crossed the control line". | Control line only | App H 2.5.4.1 c) |
| Black, black with orange disc, black/white | Shown motionless with the car-number board, normally at the line. | Line | App H 2.5.4.1 d)–f) |
| Lights versus flags | "light signals displayed on the Trackside Light Panels have the same meaning as flag signals. Any signals displayed on the Grid Light Panels are for information only." The steering-wheel display has the same value as flags. Lights flash at 3–4 Hz; one flag is shown as a pair of alternating lights or one flashing panel. "As signal lights normally show one signal at a time, the presence of flag marshals remains essential." | Panels at sector starts plus flag marshals | 2026 B1.8.4; 2025 Art. 26.1; App H 2.5.3.1, 2.5.3.3, 2.5.5.2 |
| Start: back-of-grid green flag | App H: the green flag "may also be used … to indicate to the starter that all cars within their field of vision are stationary at the end of the formation lap of a race. The marshal responsible for waving the green flag from the back of the grid must be positioned behind a barrier opening located in close proximity to the back of the grid. If no such barrier opening is available, the marshal must stand as far from the track edge as possible …" | One marshal at the rear of the grid, behind a barrier opening (or as far from the edge as possible) | App H 2026 2.5.5 g) |
| Start (F1 specific) | 2026: "Once all the F1 Cars have come to a halt, the Grid Light Panels will be illuminated blue (flashing) for five (5) seconds and the message 'Pre-Start' will be displayed on the start gantry", then 5 red lights at 1 s intervals. 2025: "Once all the cars have come to a halt the five (5) second light will appear …". A car stalled on the grid gets waved yellow flags by the row marshals and/or the yellow grid light panel. | Grid light panels along the grid; row marshals | 2026 B5.7.1 a) ii, B5.7.2 b); 2025 Art. 44.10 (race) / 43.11 (sprint) |
| Standing or rolling restart after a red flag | Panels show "SS" or "RS". | All panels | 2025 Art. 58; 2026 B5.15 |

### Animation recipe derived from the rules and the feed

Let `L[n]` be FIA light panel n and `S(n)` the track from `L[n]` to `L[n+1]`. The positions are in
`marshal_posts_fia.json`.

1. **`Flag:"YELLOW"` or `"DOUBLE YELLOW"`, Scope Sector n.**
   - Panel `L[n]` flashes yellow.
   - Posts inside `S(n)` wave one or two yellows. Strictly, it is the post before the hazard, which the feed does not
     give, so use every post in `S(n)`, or the first post of `S(n)` if you want fewer.
   - Optionally, the first post of `S(n+1)` waves green while the yellow is active (App H 2.5.5 g).
2. **`Flag:"CLEAR"`, Scope Sector n.** Withdraw the flags in `S(n)` and switch panel `L[n]` off.
3. **`SAFETY CAR DEPLOYED`** (Category SafetyCar, or TrackStatus 4).
   - All panels show "SC".
   - All posts wave a single yellow plus an SC board.
   - Sector double yellows still apply on top.
4. **`VSC DEPLOYED`** (TrackStatus 6).
   - All panels show "VSC". Optionally, posts show a VSC board plus a single yellow (App H generic).
   - **`VSC ENDING`** (TrackStatus 7): 10–15 s later all panels turn green for 30 s.
5. **`Flag:"RED"`, Scope Track** (TrackStatus 5). All posts and panels show waved red.
6. **`Flag:"CLEAR"`, Scope Track** ("TRACK CLEAR"). All flags are withdrawn. After an SC, the green is shown at the line
   only.
7. **`Flag:"GREEN"`, Scope Track.** This is almost always "GREEN LIGHT - PIT EXIT OPEN" (427 of 427 cases in the
   2025–26 sample). It is a **pit-exit** light, **not** a track-wide green.
8. **`CHEQUERED`.** Flag at the control line only.
9. **`Flag:"BLUE"` (Scope Driver)** and **`"BLACK AND WHITE"` (Scope Driver).** These are driver-specific: blue at
   posts near that car; black/white at the line.

The feed can also flag every sector at once. Suzuka 2026, a 03:37:55 burst: 29 "DOUBLE YELLOW IN TRACK SECTOR n"
messages within about 60 s, with no SC or red flag. That is a full-course double yellow in practice. Handle it as
the ordinary per-sector case.

## 2. Feed fields

### RaceControlMessages (live topic `RaceControlMessages`, also `SessionData`/archive)

FastF1 documents the fields as:
- `Utc`
- `Category`: "Other", "Flag", "Drs", "CarEvent"; also seen: "SafetyCar", "SessionStatus"
- `Message`
- `Status`: for example DRS "DISABLED"
- `Flag`: "GREEN", "RED", "YELLOW", "CLEAR", "CHEQUERED"; also seen: "DOUBLE YELLOW", "BLUE", "BLACK AND WHITE"
- `Scope`: "Track", "Sector", "Driver"
- `Sector`: "Affected track sector for sector-scoped messages"
- `RacingNumber`
- `Lap`

OpenF1 race_control 2025 plus 2026 to date, counts by (Category, Flag, Scope):
- Flag CLEAR Sector: 2315
- Flag BLUE Driver: 1634
- Flag DOUBLE YELLOW Sector: 1494
- Flag YELLOW Sector: 1393
- Flag GREEN Track: 427
- Flag CHEQUERED Track: 316
- SafetyCar: 201 (texts "SAFETY CAR DEPLOYED", "SAFETY CAR IN THIS LAP", "VSC DEPLOYED", "VSC ENDING", "VIRTUAL SAFETY CAR DEPLOYED/ENDING", "SAFETY CAR THROUGH THE PIT LANE")
- Flag CLEAR Track: 186 ("TRACK CLEAR")
- Flag RED Track: 87
- Flag BLACK AND WHITE Driver: 77

Message text for the sector flags is "YELLOW IN TRACK SECTOR n", "DOUBLE YELLOW IN TRACK SECTOR n" and
"CLEAR IN TRACK SECTOR n".

**Meaning of `Sector`.** It is the **marshalling sector (FIA light panel) number**. It is not the 3 timing sectors and
not the timing mini-sectors.

OpenF1's own docs hedge ("Segment ('mini-sector') of the track …?"), but the evidence below contradicts that.
- The F1 regulations define "marshalling sector … the section of track between each of the FIA light panels" (2025
  Art. 55.7 and 56.4; 2026 B4.1.4b and B5.12.2b), and the yellow rules are written per "marshalling sector" (B1.8.4).
- At 13 venues in 2026, the highest `Sector` in the feed exactly equals the number of FIA light panels on that event's
  circuit map: Suzuka 29, Madring 26, Miami 21, Baku 21, Melbourne 20, Sepang 19, Monaco 19, Zandvoort 18,
  Silverstone 17, Barcelona 16, Spielberg 16, Singapore 16, Montréal 15. Abu Dhabi 2025 reached 28 of its 30 panels;
  MultiViewer's outdated data has only 20 there.
- Location check: Silverstone 2025, an incident at T9 gave "TRACK SECTOR 10"; FIA panel 10 is the one just before T9.

Numbering starts at 1. Panel 1 sits just before the control line, so sector 1 covers the line and runs to panel 2.

### TrackStatus (topic `TrackStatus`: `{Status, Message}`)

FastF1 docstring, quoted:
- '1': Track clear (beginning of session or to indicate the end of another status)
- '2': Yellow flag (sectors are unknown)
- '3': ??? Never seen so far, does not exist?
- '4': Safety Car
- '5': Red Flag
- '6': Virtual Safety Car deployed
- '7': Virtual Safety Car ending (… status '1' will mark the actual end)

`Message` carries the same information in words, for example 'Yellow' and 'AllClear'. FastF1 confirms those two.
'SCDeployed', 'Red', 'VSCDeployed' and 'VSCEnding' are commonly seen but are not documented by FastF1 (medium
confidence). TrackStatus 2 has no sector information, so take sectors from RaceControlMessages.

## 3. Confidence
- High: the Appendix H and F1 SR quotes above, the FastF1 field list, and Sector = light-panel number (regulation
  definition plus count match at 13 venues plus a location check).
- Medium: the TrackStatus message words beyond Yellow/AllClear; whether F1 posts actually hold VSC boards (the F1
  regulations only require panels).
