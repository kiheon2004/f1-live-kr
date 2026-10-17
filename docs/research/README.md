# Research behind the 3D view's data

Each file records, per item: the source URL, its title and date, the season/event it applies to, what it shows, and
what was estimated (H/M/L confidence). Photos and pages were consulted only – none is part of the app. Aerial imagery
(Esri World Imagery, Wayback) was used to trace and check outlines; the app holds only the coordinates and the
picture's date (grandstands.json `img`).

| file | used by |
|---|---|
| cars2025.md, cars2026.md | src/renderer/carshapes.js `CAR_SHAPES` (each entry's `src`) |
| wheels.md | carshapes.js `wheel` (steering wheels) |
| monaco_start_boards.md | facilities.js `PIT_LAYOUTS[22]`; startplan.js `startLights`; boards.js `BOARDS` |
| pitwall.md | garages.js `PIT_WALL_SEATS`, `pitWallStand` |
| escape_fia_notes.txt | venues.js `WALL_OPENINGS`; auxroads.js (FIA race directors' notes 2025/2026, 102 items) |
| grandstands_*.md | src/data/grandstands.json (`note`, `src2`, `missing`) |
