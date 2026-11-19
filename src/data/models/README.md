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
| `bh_stand_c.glb` (1.3 MB, 31,982 triangles) | Sakhir main grandstand, 348 m: one tier of seats, a glazed suite band, a membrane roof in eight bays under eight white lattice towers | made for this app, 2026-11-18 (first pass): the map outline's size, tensinet.com's project text and Wikimedia Commons photos compared by eye – nothing copied, no outside asset, no logo or lettering; every height estimated |
| `bh_pit_upper.glb` (0.06 MB, 1,368 triangles) | Sakhir pit building, the storeys over the garages: the Paddock Club's glazed lounge under twelve tents, six blocks between them | the same (318 × 25 m – the map outline's main body) |
| `bh_tower.glb` (0.11 MB, 2,470 triangles) | Sakhir Tower: a drum of eight ringed storeys, a tent on its roof terrace, a mast (heights estimated) | the same |
| `mel_pit_upper.glb` (0.05 MB, 1,008 triangles) | Albert Park's new pit building (due 2028), the storeys over the garages: two timber-framed floors, a timber roof, a taller glazed box at the turn-1 end – used from the 2028 season | made for this app, 2026-11-18 (first pass): the published facts (14 garages, timber structure) and renderings compared by eye, nothing copied; every dimension an estimate |
| `jed_stand_c.glb` (1.5 MB, 35,032 triangles) | Jeddah, Main Grandstand A, 271 m: one tier under a flat cantilever roof | made for this app, 2026-11-19 (first pass): the published wording only – not compared with photos; rows, colours and the roof are estimates |
| `jed_pit_upper.glb` (0.07 MB, 1,620 triangles) | Jeddah pit building, the storeys over the garages: seven stepped blocks with terraces, a green light strip at night | the same (280 m, four storeys: formula1.com 2021-06) |
| `suz_stand_c.glb` (1.5 MB, 36,232 triangles) | Suzuka main grandstand: the open lower tier V1 under the roofed upper tier V2, white steel | made for this app, 2026-11-19 (first pass): the map's V1 / V2 outlines and one Wikimedia Commons photo compared by eye, nothing copied; heights and rows estimated |
| `suz_wheel.glb` (0.09 MB, 1,990 triangles) | Suzuka, the amusement park's Ferris wheel by the final corner: 50 m across, 32 gondolas (size, colours and exact place estimated) | made for this app, 2026-11-19 (first pass) |
