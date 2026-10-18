# Research behind the 3D view's data

Each file records, per item: the source URL, its title and date, the season/event it applies to, what it shows, and
what was estimated (H/M/L confidence). Photos and pages were consulted only – none is part of the app. Aerial imagery
(Esri World Imagery, Wayback) was used to trace and check outlines; the app holds only the coordinates and the
picture's date (grandstands.json `img`).

| file | used by |
|---|---|
| cars2025.md, cars2026.md | src/renderer/carshapes.js `CAR_SHAPES` (each entry's `src`) |
| wheels.md | carshapes.js `wheel` (steering wheels) |
| wheels_cars_update.md | v0.36 check of wheels.md / cars202x.md against race-weekend sources: corrections, render-only claims, what changed in carshapes.js |
| monaco_start_boards.md | facilities.js `PIT_LAYOUTS[22]`; startplan.js `startLights`; boards.js `BOARDS` |
| halo.md | car3d.js `halo` (pillar width, hoop section), `PROFILES` eye positions (v0.37) |
| monaco_pit.md | facilities.js `PIT_LAYOUTS[22]`, `genericPitSpec` (the garages' side; the v0.36 check) |
| pitbuildings.md | facilities.js `PIT_HEIGHTS`; venues.js `STATUS_2026` notes (19 circuits' pit buildings, paddocks, landmarks) |
| pitwall.md | garages.js `PIT_WALL_SEATS`, `pitWallStand` |
| escape_fia_notes.txt | venues.js `WALL_OPENINGS`; auxroads.js (FIA race directors' notes 2025/2026, 102 items) |
| grandstands_*.md | src/data/grandstands.json (`note`, `src2`, `missing`) |
