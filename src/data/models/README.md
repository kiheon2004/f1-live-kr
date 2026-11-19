# Facility model files

Self-contained GLB files (glTF 2.0 binary, buffers and images embedded) for `src/renderer/facilities.js` and
`src/renderer/stands.js`. They are read through the main process (`geo:model`), so they work inside the packaged app
(app.asar).

- File names: lower case letters, digits, `-` / `_`, ending in `.glb` (at most 64 MB).
- A whole facility: register it in `FACILITIES` with `model: { file, anchor: [lat, lon], heading, units, scale, origin, ground, lift }`
  and `replaces: { names, within }` (see the comments in facilities.js).
- A pit building's upper storeys over the builder's own garages: `upper: { file, garageTop, front, length, depth }` on a
  `builder: "pitBuilding"` entry (model axes: +Z into the building from the garage fronts, +X along it, origin on the
  ground at the plan's middle).
- A listed grandstand's own model: `"model": { "file", "from", "frontAt", "frontFromEdge" }` on its entry in
  `src/data/grandstands.json` (model axes: +Z towards the track, origin on the ground at the plan's middle).
- Record each file's source and licence in the entry (`sources` / `src`) and below.
- A venue without a pit building entry of its own: `PIT_UPPERS[venue key]` in facilities.js.
- Materials named `…_lit` glow at night only (their emissive colour carries strengths up to 1; `extras.nightStrength` above 1 is a lamp's extra strength).
- A model that is missing or fails to load leaves what the app builds itself in place.

## Files

| File | What | Source |
|---|---|---|
| `hun_stand_b.glb` (3.0 MB, 70,508 triangles) | Hungaroring main grandstand (2025) | made for this app, 2026-11-12: published figures (10,296 seats, 9,600 m² roof) and the builder's published photos compared by eye – nothing copied, no outside asset, no logo or lettering |
| `hun_pit_upper_v2.glb` (0.4 MB, 9,850 triangles) | Hungaroring paddock building (2025), the storeys over the garages and the ground floor's closed ends | the same |
| `lv_stand_c.glb` (2.6 MB, 61,710 triangles) | Las Vegas main grandstand (2025) with its lighting truss | made for this app, 2026-11-13: published figures (1,066 ft long, 78 ft high) and Wikimedia Commons photos of the 2025 race compared by eye – nothing copied, no outside asset, no logo or lettering |
| `lv_pit_upper.glb` (0.25 MB, 5,684 triangles) | Las Vegas Grand Prix Plaza pit building, the storeys over the garages with a terrace behind | the same (1,000 × 100 ft, four levels, the roof screen), sized to the building as this app builds it |
| `lus_stand_c.glb` (1.1 MB, 26,246 triangles) | Lusail main grandstand (2023), 417 m, the roof over its back half | made for this app, 2026-11-13: the map outline's size, published descriptions and photos compared by eye – nothing copied, no outside asset, no logo or lettering |
| `lus_pit_upper.glb` (0.17 MB, 3,790 triangles) | Lusail pit building (2023), the storeys over the garages with the race control tower and the Paddock Club's terrace | the same (402 m, fifty garages – Tilke's published text and photos) |
| `lus_villas.glb` (0.06 MB, 1,164 triangles) | Lusail team villas, one group of four (71.8 × 24 m) with two tree-shaped canopies – placed four times behind the pit building | made for this app, 2026-11-17: Tilke's published text (sixteen villas in four groups) and photos compared by eye – nothing copied, no outside asset, no logo or lettering |
| `yas_stand_c.glb` (1.2 MB, 28,908 triangles) | Yas Marina main grandstand, 381 m: one tier of seats, glazed suites over its middle, fifteen fabric canopies | made for this app, 2026-11-17: the map outline's size, published descriptions (gpdestinations.com) and Wikimedia Commons photos compared by eye – nothing copied, no outside asset, no logo or lettering |
| `yas_pit_upper.glb` (0.09 MB, 1,902 triangles) | Yas Marina pit building, the storeys over the garages with the roof canopies and closed ends down to the ground | the same (374 × 36 m, 40 garages – formula1.com) |
| `yas_tower.glb` (0.01 MB, 186 triangles) | Yas Marina Shams control tower (height estimated, 63 m) | the same |
| `bh_dome_big.glb` (0.03 MB, 588 triangles) | Sakhir, The Dome Lounge: a white membrane dome 61 m across on a grey base (height estimated, 22 m) | made for this app, 2026-11-18: its place and width read off aerial imagery (looked at only), its height an estimate – nothing copied, no outside asset, no logo or lettering |
| `bh_dome_small.glb` (0.03 MB, 588 triangles) | Sakhir, the smaller dome beside it, 31 m across (height estimated, 11.2 m) | the same |
| `bh_stand_c.glb` (1.6 MB, 37,198 triangles) | Sakhir main grandstand, 348 m: one tier of seats, a glazed suite band, a membrane roof in eight bays under eight open towers of pointed arches, a back of arched doorways and galleries | made for this app, 2026-11-18 / 19 (second pass): the map outline's size, tensinet.com's project text and Wikimedia Commons photos compared by eye, nothing copied; every height estimated |
| `bh_pit_upper.glb` (0.06 MB, 1,368 triangles) | Sakhir pit building, the storeys over the garages: the Paddock Club's glazed lounge under twelve tents, six blocks between them | the same (318 × 25 m – the map outline's main body) |
| `bh_tower.glb` (0.11 MB, 2,470 triangles) | Sakhir Tower: a drum of eight ringed storeys, a tent on its roof terrace, a mast (heights estimated) | the same |
| `mel_pit_upper.glb` (0.13 MB, 2,892 triangles) | Albert Park's new pit building (due 2028), the storeys over the garages: two timber-framed floors under a roof of light grey metal sheets on a deep timber grid, a taller glazed box at the turn-1 end – used from the 2028 season | made for this app, 2026-11-19 (second pass: the roof): the published facts (14 garages, timber structure) and the architect's renderings compared by eye, nothing copied; every dimension an estimate |
| `jed_stand_c.glb` (1.0 MB, 23,416 triangles) | Jeddah, Main Grandstand A, 271 m: one tier of 18 rows under a flat white roof as deep as the stand | made for this app, 2026-11-19 (second pass): aerial imagery compared by eye, nothing copied; rows, colours and heights estimated |
| `jed_pit_upper.glb` (0.09 MB, 1,856 triangles) | Jeddah pit building, the storeys over the garages: two glazed floors behind balconies, a roof terrace with pergolas, eight cream blocks on the paddock side, the slab fronts lit at night | made for this app, 2026-11-19 (second pass): the promoter's 2021 renderings and aerial imagery compared by eye, nothing copied (280 m, four storeys published; heights estimated) |
| `jed_team.glb` (0.07 MB, 1,438 triangles) | Jeddah, the team building across the paddock street from the pit building (217 × 27 m, three storeys, pergolas, cream blocks) | made for this app, 2026-11-19: the promoter's 2021 renderings and aerial imagery compared by eye, nothing copied; heights estimated |
| `suz_stand_c.glb` (1.8 MB, 42,802 triangles) | Suzuka main grandstand: the open lower tier V1 (294 m) under the roofed upper tier V2 (188 m, over V1's final-corner end), white steel, a back of columns and window bands | made for this app, 2026-11-19 (second pass): the map's V1 / V2 outlines and one Wikimedia Commons photo compared by eye, nothing copied; heights and rows estimated |
| `suz_wheel.glb` (0.09 MB, 1,990 triangles) | Suzuka, the amusement park's Ferris wheel by the final corner: 50 m across, 32 gondolas (size and colours estimated; place and facing from one aerial picture) | made for this app, 2026-11-19 (first pass) |
| `sha_stand_c.glb` (2.5 MB, 59,478 triangles) | Shanghai, Grandstand A, 327 m: two tiers of seats in yellow, orange, red and white, a wedge-shaped cantilever roof | made for this app, 2026-11-19 (first pass): the published figures and Wikimedia Commons photos / a 2018 satellite picture compared by eye, nothing copied; rows and roof thickness estimated |
| `sha_pit_upper.glb` (0.02 MB, 432 triangles) | Shanghai pit building, the storeys over the garages: one glazed floor behind a balcony, a roof terrace with planted squares | the same (337 × 30 m; heights estimated) |
| `sha_wing.glb` (0.10 MB, 2,306 triangles) | Shanghai, one wing over the main straight (140 × 38 m, its axis 38.4 m up) with its round glass tower and two red drums – stands twice, at each end of Grandstand A | the same (one height published, the rest estimated) |
| `sha_pavilion.glb` (0.01 MB, 136 triangles) | Shanghai, one team pavilion on the lake – stands 26 times | the same (26 pavilions published; sizes estimated, places from a satellite picture ± 5 m) |
| `sha_lotus_row.glb` (0.15 MB, 3,562 triangles) | Shanghai, one row of thirteen round membrane canopies (317 m) – stands twice, over Grandstands H and K | made for this app, 2026-11-19: the number published, the diameter from aerial imagery (looked at only); heights and shape estimated |
| `mia_pit_upper.glb` (0.06 MB, 1,346 triangles) | Miami, the Paddock Club over the team garages (2023): three club floors behind deep balconies, a roof club over the turn-1 end, an entrance frame and stair on the stadium side | made for this app, 2026-11-19: hok.com's project text and renderings and aerial imagery compared by eye, nothing copied; heights estimated |
| `mia_pit_ext.glb` (0.08 MB, 1,930 triangles) | Miami, the Paddock Club extension towards turn 1, announced for 2027 – used from the 2027 season | the same (place and size estimated from the published floor area) |
| `mtl_pit_upper.glb` (0.10 MB, 2,280 triangles) | Montréal, the Espace Paddock over the garages: a loge level open to the pit lane, a terrace and glazed loges above, 21 white roof modules on timber beams, V-shaped white columns | made for this app, 2026-11-19: the published facts and Wikimedia Commons photos / aerial imagery compared by eye, nothing copied; heights estimated |
| `mtl_stand_c.glb` (1.1 MB, 27,004 triangles) | Montréal, Grandstand 1 opposite the pits, 180 m: one tier of 32 rows under a corrugated roof on a steel frame | the same (rows, colours and the roof estimated) |
| `mtl_biosphere.glb` (0.05 MB, 1,044 triangles) | Montréal, the Biosphère: a faceted sphere 76 m across, 62 m high (published) – an opaque shell | made for this app, 2026-11-19 |
| `mon_stand_k_c.glb` (0.39 MB, 9,236 triangles) | Monaco, Grandstand K on Quai Albert Ier, 100 m: three tiers on concrete supports, hospitality cabins on top | made for this app, 2026-11-19: the ACM's description; rows, colours and the cabins estimated |
