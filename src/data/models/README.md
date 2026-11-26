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
| `mtl_pit_upper.glb` (0.10 MB, 2,280 triangles) | Montréal, the Espace Paddock over the garages (330 × 30 m): a loge level open to the pit lane, a terrace and glazed loges above, white roof modules on timber beams, V-shaped white columns | made for this app, 2026-11-19 (second pass): the published facts and Wikimedia Commons photos / aerial imagery compared by eye, nothing copied; heights estimated |
| `mtl_stand_c.glb` (1.1 MB, 27,004 triangles) | Montréal, Grandstand 1 opposite the pits, 180 m: one tier of 32 rows under a corrugated roof on a steel frame | the same (rows, colours and the roof estimated) |
| `mtl_biosphere.glb` (0.05 MB, 1,044 triangles) | Montréal, the Biosphère: a faceted sphere 76 m across, 62 m high (published) – an opaque shell | made for this app, 2026-11-19 |
| `mon_stand_k_c.glb` (0.39 MB, 9,236 triangles) | Monaco, Grandstand K on Quai Albert Ier, 100 m: three tiers on concrete supports, hospitality cabins on top | made for this app, 2026-11-19: the ACM's description; rows, colours and the cabins estimated |
| `mtl_casino.glb` (0.07 MB, 1,614 triangles) | Montréal, the Casino's main pavilion: a bowl widening upwards, white fins lit at night, a crown and a mast | made for this app, 2026-11-19: one Wikimedia Commons photo compared by eye; sizes estimated |
| `mon_pool.glb` (0.04 MB, 940 triangles) | Monaco, the Stade Nautique Rainier III: the pool, its deck (cut back on the track side), the diving tower | made for this app, 2026-11-19 (second pass): aerial imagery compared by eye; heights estimated |
| `mon_casino.glb` (0.17 MB, 4,006 triangles) | Monaco, the Casino de Monte-Carlo with the opera (163 m): the entrance front with two towers and a canopy, verdigris roofs, walls softly lit at night | made for this app, 2026-11-19 (second pass): Wikimedia Commons photos and aerial imagery compared by eye, nothing copied; heights estimated |
| `mon_hotel_paris.glb` (0.30 MB, 6,868 triangles) | Monaco, the Hôtel de Paris, the whole block: the front range on the casino square, its stepped bays, the wings round the courtyard, the round end | made for this app, 2026-11-19 (third pass): its plan after OpenStreetMap's outline, Wikimedia Commons photos and aerial imagery compared by eye, nothing copied; heights estimated |
| `cat_pit_upper.glb` (0.11 MB, 2,434 triangles) | Barcelona, the pit building over the garages: a glazed floor, the top terrace under its 2024 roof with solar panels, stair towers, the control tower and an end block | made for this app, 2026-11-19: published facts and Wikimedia Commons photos / aerial imagery compared by eye, nothing copied; heights estimated |
| `cat_stand_c.glb` (1.1 MB, 25,284 triangles) | Barcelona, the main grandstand, 290 m: two tiers with a suite level and a lounge behind leaning glass, a thick roof on leaning white struts | the same (9,576 seats – official 9,580) |
| `cat_rooftop.glb` (0.04 MB, 828 triangles) | Barcelona, the Circuit Rooftop (2024): a red truss bridge building over the track with a 30 m tower – used from the 2024 season | made for this app, 2026-11-19: published facts and its plan in aerial imagery; the side view estimated |
| `mad_pit_upper.glb` (0.07 MB, 1,524 triangles) | Madring, the four pit buildings over the garages in one model: two permanent blocks with timber terraces, two temporary ones, the gap at Puerta Sur | made for this app, 2026-11-19: the official pit box drawing, an official rendering and aerial imagery compared by eye, nothing copied; floor heights estimated |
| `mad_puerta_sur.glb` (0.07 MB, 1,580 triangles) | Madring, IFEMA's Puerta Sur building: a glass square of 88 m round a patio, a short entrance canopy towards the pit lane | made for this app, 2026-11-19 (second pass: the canopy cut to 2.5 m): its plan in aerial imagery; height and walls estimated |
| `mad_flag.glb` (0.03 MB, 518 triangles) | Madring, the flag by turn 3: a 54 m mast, a cloth of 16.66 × 25 m, lit at night (official sizes; its place an estimate) | made for this app, 2026-11-19 |
| `bak_pit_upper.glb` (0.10 MB, 2,324 triangles) | Baku, the temporary pit building over the garages: the Paddock Club under a canopy rising towards the track, end blocks, stair towers – made with its +Z to the pit lane (`turned`) | made for this app, 2026-11-19: OpenStreetMap's outline, Wikimedia Commons photos and a construction photo compared by eye, nothing copied; heights estimated |
| `bak_government_house.glb` (0.65 MB, 15,450 triangles) | Baku, Government House on its map outline: four corner towers round the forecourt, the arcaded ranges, cream stone lit at night | made for this app, 2026-11-19: Wikimedia Commons photos compared by eye, nothing copied; heights estimated |
| `bak_maiden_tower.glb` (0.14 MB, 3,192 triangles) | Baku, the Maiden Tower: 29.5 m high, 16.5 m across (published), its buttress, lit at night | made for this app, 2026-11-19 |
| `bak_stand_c.glb` (0.58 MB, 13,736 triangles) | Baku, the Absheron main grandstand, 100 m: one tier on scaffolding, a flat steel roof over the middle sector only | made for this app, 2026-11-19: BCC's ticket information and Wikimedia Commons photos compared by eye, nothing copied; depth, rows and colours estimated |
| `bak_old_city_wall_stepped.glb` (0.67 MB, 15,198 triangles) | Baku, the Old City wall from turn 8 westwards: 236 m with eight round towers, stepped up the hill with the street, lit at night | made for this app, 2026-11-21 (third version): its plan after OpenStreetMap's outlines of the wall, stepped to this app's ground heights; a Wikimedia Commons photo compared by eye, nothing copied; heights estimated |
| `sgp_pit_upper.glb` (0.14 MB, 3,242 triangles) | Marina Bay, the F1 Pit Building over the garages: two floors of leaning glass, the sage roof and its hoods, the south end block under its sweeping roof, a pavilion on stilts and a stair tower – made with its +Z to the pit lane (`turned`) | made for this app, 2026-11-20: OpenStreetMap's outline, published facts and Wikimedia Commons photos compared by eye, nothing copied; floor heights estimated |
| `sgp_stand_pit_c.glb` (0.81 MB, 19,178 triangles) | Marina Bay, the Pit grandstand, 134 m: a temporary stand on scaffolding, 24 rows | made for this app, 2026-11-20: length and rows as the app's data; depth and seat colours estimated |
| `sgp_stand_superpit_c.glb` (0.67 MB, 15,938 triangles) | Marina Bay, the Super Pit grandstand, 130 m, 22 rows | the same |
| `sgp_stand_t1_curved_c.glb` (0.54 MB, 12,848 triangles) | Marina Bay, the Turn 1 grandstand curved along the track, 71 m, 22 rows | the same, 2026-11-21: built on the front line this app lays for the stand |
| `sgp_esplanade.glb` (0.98 MB, 23,252 triangles) | Singapore, Esplanade – Theatres on the Bay: the two spiked shells on their podium | made for this app, 2026-11-20: OpenStreetMap's outlines and a Wikimedia Commons photo compared by eye, nothing copied; the shells' profile estimated |
| `sgp_fullerton.glb` (0.34 MB, 8,040 triangles) | Singapore, The Fullerton Hotel: a granite block with giant colonnades | the same |
| `sgp_national_gallery.glb` (0.61 MB, 14,530 triangles) | Singapore, National Gallery: the former Supreme Court with its dome and the former City Hall's colonnade | the same |
| `sgp_anderson_bridge_v2.glb` (0.16 MB, 3,526 triangles) | Singapore, Anderson Bridge: three steel bowstring trusses at their real spacing, arched ribs overhead, stone pylons; no deck (the track is the road) | made for this app, 2026-11-21 (second version): aerial imagery and Wikimedia Commons photos compared by eye, nothing copied; published 70 m, 1910; heights estimated |
| `cota_pit_upper_v2.glb` (0.11 MB, 2,268 triangles) | Circuit of the Americas, the pit building over the garages: a terrace with seats, dark glazing, third-floor balconies between white bays, a white roof slab with plant, the glazed south-east end block with flagpoles – made with its +Z to the pit lane (`turned`) | made for this app, 2026-11-21 (second version: as deep as the map's outline, 25.6 m): OpenStreetMap's outline, aerial imagery and Wikimedia Commons photos compared by eye, nothing copied; heights from shadows, depth estimated |
| `cota_stand_main_c.glb` (0.60 MB, 14,084 triangles) | Circuit of the Americas, the Main Grandstand's roofed building, 150.5 m: two tiers with suites between, a white fabric canopy in ten scallops under three red pipes | made for this app, 2026-11-20: published figures (Miró Rivera Architects, Walter P Moore) and Wikimedia Commons photos compared by eye, nothing copied; tier depths and heights estimated |
| `cota_stand_front_c.glb` (1.24 MB, 29,556 triangles) | Circuit of the Americas, the Main Grandstand's front bleachers, 312 m, 16 rows, no roof | made for this app, 2026-11-20: OpenStreetMap's outline and aerial imagery for the plan, Wikimedia Commons photos compared by eye, nothing copied; rows and rake estimated |
| `cota_stand_t1_c.glb` (0.53 MB, 12,502 triangles) | Circuit of the Americas, the Turn 1 grandstand, 76 m, 30 rows | the same |
| `cota_stand_t15_c.glb` (1.54 MB, 36,474 triangles) | Circuit of the Americas, the big Turn 15 grandstand, 174 m, 36 rows | the same |
| `cota_tower.glb` (0.27 MB, 6,412 triangles) | Circuit of the Americas, the Observation Tower (76.5 m) with its eighteen red tubes running out as the canopy over the amphitheatre's stage; the tubes glow at night | made for this app, 2026-11-20: published heights and Wikimedia Commons photos compared by eye, nothing copied; the canopy's plan estimated |
| `cota_amphitheatre.glb` (0.70 MB, 16,730 triangles) | Circuit of the Americas, the amphitheatre's two rings of red seats | made for this app, 2026-11-20: aerial imagery and a Wikimedia Commons photo compared by eye, nothing copied; the rake estimated |
| `cota_pylon.glb` (0.03 MB, 550 triangles) | Circuit of the Americas, the scoring pylon at the pit exit (23.5 m), lit at night | made for this app, 2026-11-20: Wikimedia Commons photos compared by eye, nothing copied; height from its shadow |
| `mex_pit_upper.glb` (0.08 MB, 1,560 triangles) | Mexico City, the pit building over the garages: terrace, glazing, the white third-floor slab, the red roof, the control tower | made for this app, 2026-11-21: OpenStreetMap's outline, aerial imagery and Wikimedia Commons photos compared by eye, nothing copied; heights estimated |
| `mex_stand_g1_c.glb` (1.18 MB, 26,618 triangles) | Mexico City, Grada 1's main body, 177 m, two tiers under a pleated white roof | the same |
| `mex_stand_g2_c.glb` (0.58 MB, 13,058 triangles) | Mexico City, Grada 2, 90 m, as Grada 1 | the same |
| `mex_stand_g1w_c.glb` (0.15 MB, 3,208 triangles) | Mexico City, the low stand west of Grada 1, 54 m, one tier under a flat roof | the same; seen from above only |
| `mex_stadium_c.glb` (0.85 MB, 19,208 triangles) | Mexico City, the stadium (Foro Sol / Estadio GNP Seguros): the C of seating round the track under the 2024 roof, from 2024 | the same; published 26,436 seats |
| `mex_palacio.glb` (0.34 MB, 7,518 triangles) | Mexico City, Palacio de los Deportes: the copper dome on white V struts, two red terraces | the same; published: a copper dome, 1968 |
| `mex_harp_helu.glb` (0.07 MB, 1,388 triangles) | Mexico City, Estadio Alfredo Harp Helú: the white trident roof beside turn 1 | the same; published: steel and PTFE roof, 2019 |
| `spo_pit_upper.glb` (0.29 MB, 6,416 triangles) | Interlagos, the pit building over the garages: terrace, glass awning, a membrane cone over each of the 23 garages, leaning white masts, the roof over the paddock street; the Operations Centre at the pit-entry end | made for this app, 2026-11-22: OpenStreetMap's outlines, aerial imagery and Wikimedia Commons photos compared by eye, nothing copied; heights estimated; published: 23 boxes of 216 m², a six-storey operations centre |
| `spo_stand_b_c.glb` (0.38 MB, 8,486 triangles) | Interlagos, sector B with the Tribuna de Honra, 101 m: blue seats, the glazed Tribuna over the top rows, a white roof on inclined trusses | the same |
| `spo_stand_ps_c.glb` (0.32 MB, 7,050 triangles) | Interlagos, the Pit Stop Club, 59 m: a concrete tier under a flat white roof on a white steel frame | the same; the upper rows and the lounge are a guess |
| `spo_stand_m_c.glb` (0.90 MB, 20,314 triangles) | Interlagos, sector M, 162 m: one concrete tier of 24 rows under a flat roof on cantilevered trusses | the same |
| `spo_stand_d_c.glb` (0.43 MB, 9,610 triangles) | Interlagos, sector D (from 2026): a curved roofed tier round the outside of the Senna S | the same; its look is a guess – no photograph of the finished stand; published 5,358 seats |
| `spo_hospitality.glb` (0.16 MB, 3,588 triangles) | Interlagos, the Hospitality Center (2025): three white-edged decks round a dark glazed body under a white vault | the same; published: three floors, 22 m |
| `spo_footbridge.glb` (0.03 MB, 688 triangles) | Interlagos, the footbridge over the track at the south end of the main straight | made for this app, 2026-11-22: its place from OpenStreetMap and aerial imagery; its look and height estimated |
| `spo_tower.glb` (0.03 MB, 720 triangles) | Interlagos, a white hourglass lattice tower (15 m) – seven stand on the infield lawn east of the Hospitality Center | made for this app, 2026-11-22: places from aerial imagery (± 6 m); height and lattice estimated |
| `rbr_pit_upper.glb` (0.06 MB, 1,152 triangles) | Red Bull Ring pit building over the garages (from 2026): the first floor behind glass leaning out over the pit lane, white fins, the roof deck, the podium, the grey wedge of race control, the 2026 section and the medical centre | made for this app, 2026-11-24: OpenStreetMap's outline, aerial imagery, press and Wikimedia Commons photos compared by eye – nothing copied, no outside asset, no logo or lettering; the 2026 section's length and every height estimated |
| `rbr_pit_tents2026.glb` (0.01 MB, 192 triangles) | Red Bull Ring, the four white marquees on the pit building's roof deck (up to 2026) | the same |
| `rbr_pit_roof2027.glb` (0.04 MB, 852 triangles) | Red Bull Ring, the glazed roof storey on the pit building (from 2027) | the same; reported for the July 2027 race – its look is a guess, no picture is published |
| `rbr_gantry.glb` (0.004 MB, 44 triangles) | Red Bull Ring, the start gantry over the main straight (blank) | made for this app, 2026-11-24: its place from aerial imagery; heights estimated |
| `rbr_sz_centre_c.glb` (0.16 MB, 3,454 triangles) | Red Bull Ring, Start-Ziel grandstand: the middle (sector K) under the wing, with the welcome centre behind | made for this app, 2026-11-24: OpenStreetMap's outline (92 × 37 m), published sizes (wing 92 × 20 m), photos compared by eye – nothing copied; its back and its heights are less sure |
| `rbr_sz_east_c.glb` (0.78 MB, 17,572 triangles) | Red Bull Ring, Start-Ziel grandstand: the east wing (208 m) – 13 rows under a saw-tooth roof with solar panels | made for this app, 2026-11-24: OpenStreetMap's outline, aerial imagery (bays of 7.5 m), photos compared by eye – nothing copied; heights estimated |
| `rbr_sz_west_c.glb` (0.44 MB, 9,932 triangles) | Red Bull Ring, Start-Ziel grandstand: the west wing (118 m) | the same |
| `rbr_nord.glb` (0.33 MB, 7,282 triangles) | Red Bull Ring, the roofed Nord stand outside turn 4 (134 m on a curve, 17 roof bays) | made for this app, 2026-11-24: OpenStreetMap's outline and aerial imagery; its section taken from the Start-Ziel wings – an estimate |
| `rbr_open_steiermark.glb` (0.19 MB, 4,306 triangles) | Red Bull Ring, open steel stand: Steiermark Tribüne (107 m, eight stepped blocks) | made for this app, 2026-11-24: its plan from the outline (OpenStreetMap, or this app's own traced one) and aerial imagery; rows and height worked out from its depth |
| `rbr_open_rb_s.glb` (0.73 MB, 16,568 triangles) | Red Bull Ring, open steel stand: Red Bull, the turn-1 end (238 m, four blocks, 38–42 rows) | the same |
| `rbr_open_rb_n.glb` (0.29 MB, 6,434 triangles) | Red Bull Ring, open steel stand: Red Bull, the turn-3 end (194 m, 21 rows) | the same |
| `rbr_open_t3.glb` (0.37 MB, 8,338 triangles) | Red Bull Ring, open steel stand: T3 (89 m, 62 rows) | the same |
| `rbr_open_t9.glb` (0.20 MB, 4,422 triangles) | Red Bull Ring, open steel stand: T9 (60 m, five blocks) | the same |
| `rbr_open_t10.glb` (0.30 MB, 6,692 triangles) | Red Bull Ring, open steel stand: T10 (141 m, seven blocks) | the same |
| `rbr_open_t8.glb` (0.11 MB, 2,396 triangles) | Red Bull Ring, open steel stand: T8 (85 m, 16 rows) | the same |
| `rbr_open_schoenberg.glb` (0.13 MB, 2,942 triangles) | Red Bull Ring, open steel stand: Schönberg (101 m, 18 rows) | the same |
| `sil_wing_upper.glb` (0.18 MB, 3,806 triangles) | Silverstone Wing over the garages: the terrace band, the hall floor behind leaning glass, the roof in four planes, the five cores, the mast, the blade, the fin and the podium terrace | made for this app, 2026-11-24: OpenStreetMap's outline and its parts with heights, aerial imagery, three Wikimedia Commons photographs compared by eye – nothing copied, no outside asset, no logo or lettering; the roof's planes, the door line and nearly every height estimated |
| `sil_hotel.glb` (0.14 MB, 2,938 triangles) | Silverstone, the Hilton Garden Inn opposite the Wing (122 × 20 m, the roof bar under white sails) | made for this app, 2026-11-24: OpenStreetMap's outline, photographs compared by eye; the track face assumed |
| `sil_skybridge.glb` (0.02 MB, 408 triangles) | Silverstone, the sky bridge from the hotel over the track to the Wing (69.6 m, deck 10 m up) | made for this app, 2026-11-24: its line from OpenStreetMap and aerial imagery; heights estimated; no banners |
| `sil_gantry.glb` (0.01 MB, 260 triangles) | Silverstone, the start lights' gantry (a dark lattice, 37.3 m, blank panel) | made for this app, 2026-11-24: its place from aerial imagery; heights estimated |
| `sil_brdc.glb` (0.02 MB, 394 triangles) | Silverstone, the BRDC clubhouse (three white floors with terraces, sails on the roof) | made for this app, 2026-11-24: OpenStreetMap's outline, 2026 photographs compared by eye; heights estimated |
| `sil_national_pits_w.glb` (0.03 MB, 510 triangles) | Silverstone, the National pits' west garage block (118 m, 19 bays) | made for this app, 2026-11-24: OpenStreetMap's outline, one photograph compared by eye; bays and look estimated |
| `sil_national_pits_e.glb` (0.03 MB, 532 triangles) | Silverstone, the National pits' east garage block (122 m, 20 bays) | the same |
| `sil_escapade_unit.glb` (0.01 MB, 162 triangles) | Silverstone, one Escapade trackside residence – stood at 14 places outside Maggotts and Becketts | made for this app, 2026-11-24: OpenStreetMap's 14 outlines (the places), the published description (RIBA Journal 2024); heights estimated |
| `sil_escapade_club.glb` (0.01 MB, 94 triangles) | Silverstone, the Escapade clubhouse beside the Becketts stand | made for this app, 2026-11-24: OpenStreetMap's outline; its look is a guess |
| `sil_bridge_wellington.glb` (0.004 MB, 56 triangles) | Silverstone, the service road bridge over the Wellington Straight (26 m, blank) | made for this app, 2026-11-24: its place from OpenStreetMap's road; look and heights estimated |
| `sil_bridge_hangar.glb` (0.004 MB, 56 triangles) | Silverstone, the service road bridge over the Hangar Straight (48 m, blank) | the same |
| `sil_stand_hamilton_a.glb` (0.34 MB, 7,630 triangles) | Silverstone, grandstand: Hamilton Straight A (117 m, 26 rows, roofed) | made for this app, 2026-11-24: its plan from OpenStreetMap's outline or one traced from aerial imagery (Esri World Imagery 2025-06-18); rows and height worked out from its depth; navy seat strips, no single seats |
| `sil_stand_hamilton_b1.glb` (0.11 MB, 2,376 triangles) | Silverstone, grandstand: Hamilton Straight B, the stand in front of the hotel (65 m, 15 rows, open) | the same |
| `sil_stand_hamilton_b2.glb` (0.15 MB, 3,316 triangles) | Silverstone, grandstand: Hamilton Straight B, the stand north of the hotel (70 m, 20 rows, open) | the same |
| `sil_stand_abbey.glb` (0.28 MB, 6,376 triangles) | Silverstone, grandstand: Abbey (141 m, 16 rows, roofed) | the same |
| `sil_stand_farm.glb` (0.21 MB, 4,720 triangles) | Silverstone, grandstand: Farm Curve (from 2027 the George Russell Grandstand) (164 m, 11 rows, open) | the same |
| `sil_stand_village_a.glb` (0.12 MB, 2,720 triangles) | Silverstone, grandstand: Village A (78 m, 13 rows, open) | the same |
| `sil_stand_village_b.glb` (0.15 MB, 3,316 triangles) | Silverstone, grandstand: Village B (73 m, 17 rows, roofed) | the same |
| `sil_stand_the_view.glb` (0.11 MB, 2,472 triangles) | Silverstone, grandstand: The View (67 m, 16 rows, open) | the same |
| `sil_stand_int_paddock.glb` (0.17 MB, 3,862 triangles) | Silverstone, grandstand: International Paddock (100 m, 12 rows, roofed) | the same |
| `sil_stand_wellington.glb` (0.06 MB, 1,210 triangles) | Silverstone, grandstand: Wellington (40 m, 11 rows, open) | the same |
| `sil_stand_luffield_corner.glb` (0.28 MB, 6,248 triangles) | Silverstone, grandstand: Luffield Corner (125 m, 18 rows, roofed) | the same |
| `sil_stand_luffield_corner_front.glb` (0.15 MB, 3,388 triangles) | Silverstone, grandstand: Luffield Corner (rows in front) (140 m, 8 rows, open) | the same |
| `sil_stand_luffield.glb` (0.34 MB, 7,684 triangles) | Silverstone, grandstand: Luffield (171 m, 17 rows, roofed) | the same |
| `sil_stand_luffield_front.glb` (0.14 MB, 3,040 triangles) | Silverstone, grandstand: Luffield (rows in front) (163 m, 6 rows, open) | the same |
| `sil_stand_woodcote_a.glb` (0.30 MB, 6,824 triangles) | Silverstone, grandstand: Woodcote A (125 m, 21 rows, roofed) | the same |
| `sil_stand_woodcote_b.glb` (0.21 MB, 4,704 triangles) | Silverstone, grandstand: Woodcote B (87 m, 21 rows, roofed) | the same |
| `sil_stand_jim_clark.glb` (0.12 MB, 2,504 triangles) | Silverstone, grandstand: Jim Clark (BRDC) (31 m, 16 rows, roofed) | the same |
| `sil_stand_national.glb` (0.17 MB, 3,832 triangles) | Silverstone, grandstand: National Pits Straight (94 m, 13 rows, roofed) | the same |
| `sil_stand_stirling_a.glb` (0.04 MB, 784 triangles) | Silverstone, grandstand: Stirling A (29 m, 8 rows, open) | the same |
| `sil_stand_stirling_b.glb` (0.09 MB, 2,008 triangles) | Silverstone, grandstand: Stirling B (61 m, 9 rows, roofed) | the same |
| `sil_stand_copse_a.glb` (0.13 MB, 2,884 triangles) | Silverstone, grandstand: Copse A (73 m, 13 rows, roofed) | the same |
| `sil_stand_copse_a_front.glb` (0.08 MB, 1,780 triangles) | Silverstone, grandstand: Copse A (rows in front) (83 m, 7 rows, open) | the same |
| `sil_stand_copse_b.glb` (0.09 MB, 2,014 triangles) | Silverstone, grandstand: Copse B (56 m, 11 rows, roofed) | the same |
| `sil_stand_copse_c.glb` (0.12 MB, 2,578 triangles) | Silverstone, grandstand: Copse C (69 m, 11 rows, roofed) | the same |
| `sil_stand_copse_c_front.glb` (0.17 MB, 3,694 triangles) | Silverstone, grandstand: Copse C / D (rows in front) (170 m, 7 rows, open) | the same |
| `sil_stand_copse_d.glb` (0.07 MB, 1,560 triangles) | Silverstone, grandstand: Copse D (38 m, 16 rows, open) | the same |
| `sil_stand_silverstone_six.glb` (0.10 MB, 2,270 triangles) | Silverstone, grandstand: Silverstone Six (BRDC) (38 m, 25 rows, open) | the same |
| `sil_stand_becketts.glb` (0.46 MB, 10,440 triangles) | Silverstone, grandstand: Becketts (208 m, 19 rows, roofed) | the same |
| `sil_stand_chapel.glb` (0.13 MB, 2,988 triangles) | Silverstone, grandstand: Chapel (86 m, 13 rows, open) | the same |
| `sil_stand_club_a.glb` (0.13 MB, 2,856 triangles) | Silverstone, grandstand: Club A (65 m, 19 rows, open) | the same |
| `sil_stand_club_corner.glb` (0.38 MB, 8,520 triangles) | Silverstone, grandstand: Club Corner (161 m, 21 rows, roofed) | the same |
| `sil_stand_vale.glb` (0.30 MB, 6,728 triangles) | Silverstone, grandstand: Vale (149 m, 19 rows, open) | the same |
| `sil_stand_landostand.glb` (1.54 MB, 34,790 triangles) | Silverstone, grandstand: the Landostand as rebuilt for 2026 (323 m, 11–40 rows, open) | the same; its plan is not published – the 2025 blocks' fronts joined: an estimate |
| `rbr_pit_upper_2025.glb` (0.05 MB, 1,032 triangles) | Red Bull Ring pit building over the garages as it stood up to 2025: the 30 boxes and the wedge of race control, before the 2026 extension | made for this app, 2026-11-24: the same sources as rbr_pit_upper.glb; the old medical centre east of it is not shown |
| `rbr_open_mitte_abc.glb` (0.17 MB, 3,842 triangles) | Red Bull Ring, open steel stand: Center (Mitte), the north-western block (sectors A–C, 56 rows) – facing south-west | made for this app, 2026-11-24 (second version): its plan from the outline and aerial imagery, rows and facing after the spectator guide (oversteer48.com); heights worked out from its depth |
| `rbr_open_mitte_def.glb` (0.14 MB, 3,050 triangles) | Red Bull Ring, open steel stand: Center (Mitte), the south-eastern block (sectors D–F, 44 rows) – facing south-west | the same |
| `spo_gantry.glb` (0.01 MB, 284 triangles) | Interlagos, the start lights' gantry over the main straight (a black truss, 17 m, blank panel) | made for this app, 2026-11-26: its place along the track from aerial imagery of April 2025; heights and length estimated |
| `spo_stand_a_1.glb` (0.16 MB, 3,494 triangles) | Interlagos, sector A, piece 1 of 5 from the south: bare concrete steps on the bank (92.7 m, 14–24 steps) | made for this app, 2026-11-26: its front line from OpenStreetMap's outline (the northern 251 m) and Esri World Imagery of April 2025 (the southern 213 m, ± 4 m); steps and heights worked out from its depth |
| `spo_stand_a_2.glb` (0.11 MB, 2,438 triangles) | Interlagos, sector A, piece 2 of 5 from the south: bare concrete steps on the bank (92.7 m, 12–14 steps) | the same |
| `spo_stand_a_3.glb` (0.10 MB, 2,258 triangles) | Interlagos, sector A, piece 3 of 5 from the south: bare concrete steps on the bank (92.7 m, 11–12 steps) | the same |
| `spo_stand_a_4.glb` (0.10 MB, 2,210 triangles) | Interlagos, sector A, piece 4 of 5 from the south: bare concrete steps on the bank (92.7 m, 11 steps) | the same |
| `spo_stand_a_5.glb` (0.10 MB, 2,210 triangles) | Interlagos, sector A, piece 5 of 5 from the south: bare concrete steps on the bank (92.7 m, 11 steps) | the same |
| `spa_pit_upper.glb` (0.07 MB, 1,416 triangles) | Spa-Francorchamps pit building over the garages: the walkway deck over the pit lane, a glazed floor under a white roof, the south block, five stair towers | made for this app, 2026-11-26: OpenStreetMap's outline, aerial imagery and one 2022 photograph compared by eye – nothing copied, no outside asset, no logo or lettering; every height and the south block estimated |
| `spa_gantry.glb` (0.01 MB, 200 triangles) | Spa-Francorchamps, the start lights' gantry (a pale lattice, 22.7 m, blank panel) | made for this app, 2026-11-26: its place from aerial imagery; heights estimated |
| `spa_stand_trib_f1.glb` (0.24 MB, 5,474 triangles) | Spa-Francorchamps, grandstand: Gold 1 : Pit (90 m, 25 rows, roofed) | made for this app, 2026-11-26: its plan from OpenStreetMap's outline or this app's traced one and aerial imagery (Esri World Imagery 2025-06-22); rows and height worked out from its depth; seat strips, no single seats |
| `spa_stand_trib_end.glb` (0.36 MB, 8,152 triangles) | Spa-Francorchamps, grandstand: Gold 2 : GP2 (101 m, 34 rows, roofed) | the same |
| `spa_stand_silver1.glb` (0.16 MB, 3,550 triangles) | Spa-Francorchamps, grandstand: Silver 1 (121 m, 11 rows, open) | the same |
| `spa_stand_raidillon.glb` (0.33 MB, 7,368 triangles) | Spa-Francorchamps, grandstand: Gold 3 : Eau-Rouge (130 m, 23 rows, roofed) | the same |
| `spa_stand_gold8.glb` (0.09 MB, 1,872 triangles) | Spa-Francorchamps, grandstand: Gold 8 (33 m, 23 rows, roofed) | the same |
| `spa_stand_gold7.glb` (0.04 MB, 864 triangles) | Spa-Francorchamps, grandstand: Gold 7 (20 m, 20 rows, roofed) | the same |
| `spa_stand_gold7bis.glb` (0.02 MB, 460 triangles) | Spa-Francorchamps, grandstand: Gold 7 Bis (17 m, 10 rows, open) | the same |
| `spa_stand_gold7ter.glb` (0.11 MB, 2,472 triangles) | Spa-Francorchamps, grandstand: Gold 7 ter : Endurance (67 m, 16 rows, open) | the same |
| `spa_stand_fanzone.glb` (0.25 MB, 5,656 triangles) | Spa-Francorchamps, grandstand: Fanzone Grandstand (190 m, 11 rows, open) | the same |
| `spa_stand_gold4a.glb` (0.06 MB, 1,270 triangles) | Spa-Francorchamps, grandstand: Gold 4 : Eau-Rouge (22 m, 23 rows, open) | the same |
| `spa_stand_gold4b.glb` (0.08 MB, 1,776 triangles) | Spa-Francorchamps, grandstand: Gold 4 : Eau-Rouge (2) (35 m, 24 rows, open) | the same |
| `spa_stand_gold6.glb` (0.12 MB, 2,578 triangles) | Spa-Francorchamps, grandstand: Gold 6 : Chicane (69 m, 11 rows, roofed) | the same |
| `spa_stand_speed_corner.glb` (0.21 MB, 4,600 triangles) | Spa-Francorchamps, grandstand: Speed Corner (120 m, 16 rows, open) | the same |
| `mza_pit_upper.glb` (0.18 MB, 3,952 triangles) | Monza, the Palazzina Box over the garages: leaning dark glass in silver mullions, a white sun-screen, the terrace, a glazed drum at either end | made for this app, 2026-11-26: OpenStreetMap's outline, aerial imagery and Commons photographs compared by eye – nothing copied, no outside asset, no logo or lettering; heights, the glass's lean, the drums' place estimated |
| `mza_pit_canopy.glb` (0.13 MB, 2,892 triangles) | Monza, the long white canopy on the pit building's terrace (21 frames, eaves 13 m, crown 15.5 m) | made for this app, 2026-11-26: aerial imagery and one photograph compared by eye; sizes estimated |
| `mza_hospitality.glb` (0.07 MB, 1,510 triangles) | Monza, the Hospitality Building: three glazed floors, a terrace, a thin white roof in three ridges | made for this app, 2026-11-26: its plan from OpenStreetMap; look and heights estimated |
| `mza_medical.glb` (0.01 MB, 158 triangles) | Monza, the Centro Medico: two low white blocks | made for this app, 2026-11-26: its plan from OpenStreetMap; look estimated |
| `mza_finish_gantry.glb` (0.10 MB, 2,190 triangles) | Monza, the lattice gantry before the control line (47 m on three legs, a blank board) | made for this app, 2026-11-26: place and span from aerial imagery; heights estimated |
| `mza_tower.glb` (0.04 MB, 736 triangles) | Monza, a 1955 tower (Torre Sud / Torre Nord: the same file at two places): glazed floors in a silver grid, 9 × 9 m, 21 m | made for this app, 2026-11-26: after this app's research note and photographs compared by eye; place from a map point |
| `mza_stand_laterale_destra.glb` (0.63 MB, 14,210 triangles) | Monza, grandstand: 26A/26B/26C Laterale Destra (220 m, 28 rows, roofed) | made for this app, 2026-11-26: its plan the map's rectangle (OpenStreetMap); rows and height worked out from its depth; blue seat strips, no single seats |
| `mza_stand_centrale.glb` (0.18 MB, 4,034 triangles) | Monza, grandstand: 1 Centrale (68 m, 27 rows, roofed) | the same |
| `mza_stand_laterale_sinistra.glb` (0.20 MB, 4,310 triangles) | Monza, grandstand: 4 Laterale Sinistra (74 m, 25 rows, roofed) | the same |
| `mza_stand_piscina.glb` (0.11 MB, 2,380 triangles) | Monza, grandstand: 5 Piscina (83 m, 11 rows, open) | the same |
| `mza_stand_vedano.glb` (0.27 MB, 5,966 triangles) | Monza, grandstand: 24 Vedano (145 m, 16 rows, roofed) | the same |
| `mza_stand_parabolica_int_a.glb` (0.07 MB, 1,510 triangles) | Monza, grandstand: 23 Parabolica Interna (59 m, 10 rows, open) | the same |
| `mza_stand_parabolica_int_b.glb` (0.05 MB, 970 triangles) | Monza, grandstand: 23 Parabolica Interna (38 m, 8 rows, open) | the same |
| `mza_stand_garden.glb` (0.10 MB, 2,146 triangles) | Monza, grandstand: Tribuna Garden (72 m, 11 rows, open) | the same |
| `mza_stand_biassono.glb` (0.06 MB, 1,300 triangles) | Monza, grandstand: 7 Biassono (50 m, 10 rows, open) | the same |
| `mza_stand_alta_a.glb` (0.12 MB, 2,746 triangles) | Monza, grandstand: 6 Alta Velocità (91 m, 12 rows, open) | the same |
| `mza_stand_alta_b.glb` (0.12 MB, 2,746 triangles) | Monza, grandstand: 6 Alta Velocità (90 m, 12 rows, open) | the same |
| `mza_stand_alta_c.glb` (0.07 MB, 1,516 triangles) | Monza, grandstand: 6 Alta Velocità (51 m, 12 rows, open) | the same |
| `mza_stand_prima_variante.glb` (0.43 MB, 9,760 triangles) | Monza, grandstand: 8A/8B Prima Variante Esterna (146 m, 31 rows, open) | the same |
| `mza_stand_parabolica.glb` (0.15 MB, 3,238 triangles) | Monza, grandstand: 22 Parabolica (82 m, 15 rows, roofed) | the same |
| `mza_stand_lat_parabolica_a.glb` (0.11 MB, 2,452 triangles) | Monza, grandstand: 21E Laterale Parabolica (71 m, 13 rows, open) | the same |
| `mza_stand_lat_parabolica_b.glb` (0.07 MB, 1,516 triangles) | Monza, grandstand: 21D Laterale Parabolica (52 m, 12 rows, open) | the same |
| `mza_stand_lat_parabolica_c.glb` (0.05 MB, 1,112 triangles) | Monza, grandstand: 21C Laterale Parabolica (34 m, 13 rows, open) | the same |
| `mza_stand_lat_parabolica_d.glb` (0.05 MB, 1,024 triangles) | Monza, grandstand: 21B Laterale Parabolica (34 m, 12 rows, open) | the same |
| `mza_stand_lat_parabolica_e.glb` (0.06 MB, 1,380 triangles) | Monza, grandstand: 21A Laterale Parabolica (37 m, 13 rows, open) | the same |
| `mza_stand_uscita_ascari_a.glb` (0.07 MB, 1,418 triangles) | Monza, grandstand: 18 Uscita Ascari A (48 m, 9 rows, roofed) | the same |
| `mza_stand_uscita_ascari_b.glb` (0.04 MB, 832 triangles) | Monza, grandstand: Uscita Ascari B (31 m, 9 rows, open) | the same |
| `mza_stand_ascari.glb` (0.07 MB, 1,624 triangles) | Monza, grandstand: 16 Ascari (60 m, 9 rows, open) | the same |
| `mza_stand_ascari_uno.glb` (0.02 MB, 412 triangles) | Monza, grandstand: Ascari Uno (20 m, 8 rows, open) | the same |
| `mza_stand_amici.glb` (0.03 MB, 634 triangles) | Monza, grandstand: Amici Autodromo (21 m, 9 rows, open) | the same |
| `mza_stand_ascari_due.glb` (0.03 MB, 544 triangles) | Monza, grandstand: 14 Ascari 2 (31 m, 4 rows, open) | the same |
| `mza_stand_ascari_tre.glb` (0.04 MB, 784 triangles) | Monza, grandstand: 12 Ascari 3 (32 m, 8 rows, open) | the same |
| `mza_stand_seconda_variante.glb` (0.04 MB, 832 triangles) | Monza, grandstand: 9 Seconda Variante (28 m, 9 rows, open) | the same |
| `mza_stand_roggia.glb` (0.03 MB, 598 triangles) | Monza, grandstand: 10 Roggia (27 m, 8 rows, open) | the same |
| `mza_stand_trib_p01.glb` (0.01 MB, 248 triangles) | Monza, grandstand: GF Gradinate Interno Parabolica (18 m, 3 rows, open) | the same |
| `mza_stand_trib_p02.glb` (0.01 MB, 224 triangles) | Monza, grandstand: GF Gradinate Interno Parabolica (15 m, 2 rows, open) | the same |
| `mza_stand_trib_p03.glb` (0.01 MB, 248 triangles) | Monza, grandstand: GF Gradinate Interno Parabolica (19 m, 3 rows, open) | the same |
| `mza_stand_trib_p04.glb` (0.01 MB, 224 triangles) | Monza, grandstand: GF Gradinate Interno Parabolica (18 m, 2 rows, open) | the same |
| `mza_stand_trib_p05.glb` (0.01 MB, 248 triangles) | Monza, grandstand: GF Gradinate Interno Parabolica (18 m, 3 rows, open) | the same |
| `mza_stand_trib_p06.glb` (0.01 MB, 224 triangles) | Monza, grandstand: GF Gradinate Interno Parabolica (17 m, 2 rows, open) | the same |
| `mza_stand_trib_p07.glb` (0.01 MB, 224 triangles) | Monza, grandstand: GF Gradinate Interno Parabolica (19 m, 2 rows, open) | the same |
| `mza_stand_trib_p08.glb` (0.01 MB, 224 triangles) | Monza, grandstand: GF Gradinate Interno Parabolica (18 m, 2 rows, open) | the same |
| `mza_stand_trib_p09.glb` (0.02 MB, 292 triangles) | Monza, grandstand: GF Gradinate Interno Parabolica (18 m, 4 rows, open) | the same |
| `mza_stand_pv_small.glb` (0.02 MB, 388 triangles) | Monza, grandstand: Prima Variante (small stand) (13 m, 7 rows, open) | the same |
| `zan_pit_upper.glb` (0.15 MB, 3,130 triangles) | Zandvoort pit building over the garages (second issue): the old block with its roof terrace and glazed upper storey, the control tower, the 2024 block with its pergola terrace, the tiled annexe, a podium frame | made for this app, 2026-11-26: OpenStreetMap's outline, the PDOK aerial picture, Commons photographs of 2018 and the circuit's two renders of 2024-01, compared by eye – nothing copied, no outside asset, no logo or lettering; the 2020 front's present look, the tower's top storey, the podium's place estimated |
| `zan_gantry.glb` (0.01 MB, 188 triangles) | Zandvoort, the start lights' gantry (a dark lattice, 21.4 m, blank panel) | made for this app, 2026-11-26: its place and span from the aerial picture; heights estimated |
| `zan_stand_tarzan_in.glb` (0.52 MB, 11,800 triangles) | Zandvoort, grandstand: Tarzan-In (159 m, 35 rows, open) | made for this app, 2026-11-26: its plan this app's own outline (the map's for Main); rows and height worked out from its depth; seat strips, no single seats |
| `zan_stand_pit.glb` (0.52 MB, 11,800 triangles) | Zandvoort, grandstand: Pit (161 m, 35 rows, open) | the same |
| `zan_stand_main.glb` (0.26 MB, 5,838 triangles) | Zandvoort, grandstand: Main (77 m, 32 rows, roofed) | the same |
| `zan_stand_ben_pon.glb` (0.50 MB, 11,212 triangles) | Zandvoort, grandstand: Ben Pon (151 m, 35 rows, open) | the same |
| `zan_stand_arena_n.glb` (0.08 MB, 1,824 triangles) | Zandvoort, grandstand: Arena (north) (31 m, 25 rows, open) | the same |
| `zan_stand_arena_ne.glb` (0.06 MB, 1,210 triangles) | Zandvoort, grandstand: Arena (north-east) (41 m, 11 rows, open) | the same |
| `zan_stand_arena_nw.glb` (0.07 MB, 1,522 triangles) | Zandvoort, grandstand: Arena (north-west) (25 m, 29 rows, open) | the same |
| `zan_stand_arena_w.glb` (0.09 MB, 1,920 triangles) | Zandvoort, grandstand: Arena (west) (30 m, 27 rows, open) | the same |
| `zan_stand_arena_t12.glb` (0.46 MB, 10,414 triangles) | Zandvoort, grandstand: Arena (T12–T13) (172 m, 29 rows, open) | the same |
| `zan_stand_arena_out.glb` (0.18 MB, 3,946 triangles) | Zandvoort, grandstand: Arena-Out (73 m, 24 rows, open) | the same |
| `zan_stand_arena_in.glb` (0.18 MB, 3,946 triangles) | Zandvoort, grandstand: Arena-In (71 m, 24 rows, open) | the same |
| `zan_stand_eastside_1.glb` (0.42 MB, 9,440 triangles) | Zandvoort, grandstand: Eastside 1 (164 m, 27 rows, open) | the same |
| `zan_stand_eastside_2.glb` (0.18 MB, 4,054 triangles) | Zandvoort, grandstand: Eastside 2 (69 m, 25 rows, open) | the same |
| `zan_stand_eastside_3.glb` (0.15 MB, 3,414 triangles) | Zandvoort, grandstand: Eastside 3 (59 m, 28 rows, open) | the same |
| `zan_stand_eastside_4.glb` (0.11 MB, 2,428 triangles) | Zandvoort, grandstand: Eastside 4 (49 m, 22 rows, open) | the same |
| `zan_stand_hairpin.glb` (0.17 MB, 3,730 triangles) | Zandvoort, grandstand: Hairpin (75 m, 23 rows, open) | the same |
