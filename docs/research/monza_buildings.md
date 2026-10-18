# Monza (Autodromo Nazionale Monza) – main buildings around the F1 circuit (2025–2026)

Research date: 2026-10-18. Status: complete (2026-10-18).
Confidence: H = official/primary or measured from OSM geometry; M = consistent secondary sources / photo reasoning; L = estimate.

## 0. Orientation (from OSM geometry, H)

- Main straight ("Rettifilo di partenza", OSM way 19842206) runs almost exactly N–S (long axis ~5 deg west of north; at lat 45.6165 lon 9.28081, at 45.6190 lon 9.28118).
- Cars run **northwards** on the main straight: from Curva Alboreto (ex-Parabolica, south end, ~45.6125) towards the Variante del Rettifilo / Prima Variante (north end, ~45.625).
- Pit lane (OSM way 38168747, ~741 m long) runs on the **east** side of the straight (right-hand side of the cars), ~18 m east of the track centreline.
- Pit building ("Palazzina Box") is **east** of the pit lane; Tribuna Centrale + Tribune Laterali are on the **west** side, opposite.
- Note: the requested centre point 45.6206, 9.2811 is ~400 m NORTH of the pit building (it is on the straight by Tribuna Piscina). The pit building centre is ~45.6170, 9.2813. Second OSM query was centred on 45.6165, 9.2813 (r=500 m).

Local metric frame used below: origin 45.6206 N, 9.2811 E; x = east (m), y = north (m). Bearings: "long axis deg from E ccw"; 84–85 deg = nearly N–S (track parallel).

## 1. Big picture: what changed 2024–2026 (and what did NOT)

- **2024 works (lot 1, ~EUR 21 M, Jan–Aug 2024):** full track resurfacing (~78,000 m2), new drainage, 3 underpasses demolished and rebuilt wider, a **new vehicle underpass Porta Vedano -> Parabolica**, Prima Variante widened. No change to the pit building, podium or Tribuna Centrale massing. (dilei.it; AGI 2024-01-08; ilgiorno; sky.it — H)
- **2025 GP:** extra temporary/modular seating (+4,000 seats), new "Ultimate Hospitality" grandstand (1,500 seats) between Ascari and Parabolica (on the back straight, far from the pits), enlarged hospitality on top of the box building (still temporary tents). (ilgiorno 2025 guide; monzanet brochure — M)
- **2026 GP (4–6 Sep 2026):** buildings around the pits still the "old" configuration. FIA 2026 media kit maps show pit building, Hospitality Building at the north end, Media Centre in a small building north of the pits near the circuit offices, podium at the south end. (FIA media kit 2026 — H)
- **Lot 2 (~EUR 40 M, architects Gau Arena / Simone De Feo, Rome; earlier coverage cites Sportium / Progetto CMR for grandstands): starts mid-Nov 2026, finish by July 2027** (for the 2027 GP). Content: extra floor on the box building (aluminium cladding, ~240 m glass wall, boomerang roof cantilevering towards the track, PV roof forming a chequered-flag pattern, Paddock Club +5,021 m2), new race-direction building (~600 m2 per ilgiorno 2026-02-09; 846 m2 per another source) behind the Centro Medico with a portico for parc fermé, new press building 70 x 14 m on the site of the disused old Direzione Autodromo, linked by a footbridge to the building overlooking the pit-lane exit, new Prima Variante grandstands with "bird-wing" roofs. (ilgiorno 2026-02-09 & 2026-09-06; sportefinanza 2026-06-25; hdmotori 2026-06-26 — H on plan, but **NOT BUILT as of Oct 2026**)
- => For a "2025–2026 as raced" model: use the existing 1989 pit building + temporary terrace tents; do NOT model the extra floor yet. Keep the 2027 version as an optional future variant.

## 2. OSM inventory (Overpass, queried 2026-10-18; data timestamp 2026-10-18T09:27Z)

Queries: (a) building/building:part/man_made=tower within 600 m of 45.6206,9.2811 (188 elements, mostly residential in Vedano/Biassono to the W/NW); (b) same + raceway/tunnel/bridge within 500 m of 45.6165,9.2813; (c) bbox west of the straight for towers; (d) named/amenity features in the paddock.

**Height tags: NONE of the circuit buildings has `height`, `min_height`, `roof:shape` or `building:levels`.** The only `building:levels` tags in the 600 m radius are on off-site residential/school/industrial buildings in Vedano al Lambro / Biassono (2–5 levels). Only height-like tags on circuit objects: guard rails `height=1.2`, chain-link fences `height=3`, an underpass `maxheight=3` / `maxheight=2.8`. Palazzina Box outline last edited 2014 (v7, 2014-09-05) — pre-2024 but the building is unchanged.

Dimensions = minimum-area bounding rectangle of the OSM polygon (H for footprint as mapped; mapping accuracy itself ~±2–3 m, M). x/y = metres from 45.6206 N 9.2811 E (x east, y north).

| OSM id | name / tags | rect L x W (m) | area m2 | centre lat,lon | x,y (m) | side of track |
|---|---|---|---|---|---|---|
| way 34404652 | **Palazzina Box** (building=commercial) | 230 x 25 | 5779 | 45.61697, 9.28134 | +19, -404 | E, behind pit lane; lat 45.61623–45.61831 |
| way 194458105 | **Hospitality Building** (building=commercial) | 90 x 29 | 2636 | 45.61897, 9.28161 | +40, -182 | E, immediately N of box building (gap ~11 m), at pit-lane exit side |
| way 219396377 | **Podio** (building=tower, bridge=yes, layer=1, lit, surface=concrete) | circle Ø ~11 (45-node polygon) | 92 | 45.61649, 9.28099 | -8, -456 | over pit wall / pit lane, S end of box building |
| way 219396384 | footbridge (bridge, layer=1) to podium | ~7 long | – | 45.61649, 9.28111 | | links podium <-> pit building over pit lane |
| way 194458108 | **Centro Medico** (building=hospital) | 38 x 15 | 486 | 45.61596, 9.28164 | +42, -516 | E, just S of box building |
| way 194458106 | building=roof, layer=1 (canopy) | 16 x 12 | 196 | 45.61588, 9.28120 | +8, -524 | E, S end of pits (pit entry side canopy) |
| way 194742580 | "tribune" (grandstand) = probably **Tribuna Garden** (1955, 68.5 m, 833 seats, pit-exit) | 72 x 11 | 794 | 45.61984, 9.28162 | +41, -85 | E, N of Hospitality Building |
| way 193647796 | **Tribuna Centrale** | 67 x 24 | 1583 | 45.61907, 9.28068 | -33, -171 | W, opposite Hospitality Building / N end of pits |
| way 34404645 | **Tribuna Laterale Destra** (grandstand 26 A-B-C) | 220 x 25 | 5470 | 45.61737, 9.28049 | -48, -359 | W, directly opposite the box building |
| way 193647795 | Tribuna Laterale Sinistra (grandstand 4) | 74 x 22 | 1598 | 45.61982, 9.28085 | -19, -86 | W, N of Tribuna Centrale |
| way 231257063 | Tribuna Piscina (grandstand 5) | 83 x 11 | 899 | 45.62070, 9.28109 | -1, +12 | W |
| way 231026020 | Tribuna Vedano | 145 x 15 | 2145 | 45.61494, 9.28017 | -72, -630 | W, S of finish line |
| node 2396630532 | **Torre Sud** (man_made=tower) | point | – | 45.61620, 9.28064 | -36, -489 | W, at the finish line |
| node 2396630508 | **Torre Nord** (man_made=tower) | point | – | 45.62144, 9.28133 | +18, +93 | W edge of track, towards Prima Variante |
| way 193647799 | building=commercial (unnamed; probably circuit offices/catering block in paddock) | 52 x 51 | 2680 | 45.61846, 9.28348 | +185, -238 | paddock, E |
| way 193647797 | Vecchie rimesse (old garages, service) | 65 x 12 | 807 | 45.61939, 9.28242 | +102, -134 | paddock N; long axis E–W |
| way 193647800 | building=yes | 72 x 7 | 497 | 45.61902, 9.28233 | +95, -175 | paddock N, E–W |
| way 193647798 | Padiglione Esposizioni (public) | 49 x 29 | 960 | 45.61910, 9.28389 | +217, -167 | paddock NE |
| ways 194739930–35, 194751178 | small building=yes 50–400 m2 | 10–31 m | | ~45.619, 9.282–9.283 | | paddock N (circuit offices strip) |
| way 12648707 / 219396373 | parking "Paddock 2" / "Paddock 1" | – | – | 45.6172, 9.2834 / 9.2821 | | the F1 paddock area behind the box building |
| way 297889399 | building=industrial | 176 x 102 | 7204 | 45.61941, 9.27361 | -583, -132 | off-site (Vedano), ignore |

Track references (raceway ways): Rettifilo di partenza 19842206; Pit Lane 38168747 (741 m); back straight (unnamed) 179968257 ~270 m east, parallel; Curva Alboreto 179968234; Raccordo Junior 34404709. Banking: Sopraelevata Sud ways 19983025 / 231256009 (historic=ruins) / bridge 34404638; Sopraelevata Nord ways 34404730 / 725687994 / 19982933 / bridge 725687995. Tunnels: 34404647 (service road, cutting, 2 lanes, ~45.6164 under the straight near the podium), 38168647 (~45.6202), footway tunnel 231258063 (~45.6189, the pedestrian underpass paddock -> rear of Tribuna Centrale used by photographers), 1312085747 (~45.6138, new 2024 Porta Vedano–Parabolica link likely), 34404660/1417742279 and 42834274/1357168028 under the back straight.

Cross-section check at lat 45.6170 (H, OSM): grandstand 26 W face 9.28031 – E face 9.28063 | track centreline 9.28089 | pit-lane centreline 9.28112 | box building W face 9.28124 – E face 9.28156. In metres (1e-5 deg lon ≈ 0.78 m): grandstand 25 m wide, ~20 m gap to track centre, track->pit lane ~18 m, pit lane->building face ~9 m, building depth ~25 m.

## 3. Building-by-building (state for the 2025 and 2026 GPs)

### 3.1 Pit building – "Palazzina Box" (built 1989)
- **What:** garages on the ground floor; 1st floor = hospitality, offices, current press room, and (until 2026) race-direction offices; roof = open **terrace** facing the start straight, covered with temporary tents/tensile canopies on GP weekends (F1 Paddock Club). (ilgiorno 2026-02-09 — H; dilei.it — H for 1989 and inclined glass)
- **Footprint:** OSM 230 x 25 m (H as mapped); press: "240 m long, two levels" (ilgiorno — H). Use **~235 m x 25 m**, long axis parallel to the straight (≈5 deg W of N). Lat 45.61623 to 45.61831 (S to N). West face ~9 m east of the pit-lane centreline.
- **Floors / height:** 2 floors + roof terrace (H). Heights **estimated** from photos (Commons "Circuito de Monza03.jpg", "Monza pitlane.jpg"): ground floor garage storey ~5 m (garage doors ~4 m high); 1st floor glazed storey ~4.5 m; terrace deck at **~10 m** (L–M), parapet/railing +1.1 m; the GP tents on the terrace are white membrane roofs on steel frames, ridge ~5–6 m above the deck → **~16 m overall on race weekend** (L). Monzanet event pages give 2.85 m clear room height for its rooms (H, but suspended-ceiling height, not storey height).
- **Roof:** flat roof used as terrace (H). Temporary: long, continuous white tensile canopy on a row of steel columns along the whole length (photo, H for existence; dimensions L). A thin white steel cantilever frame / brise-soleil projects over the glazing on the pit-lane side (photo "Monza pitlane.jpg", M).
- **Pit-lane facade (west):** ground floor = continuous row of grey/silver **roller shutters**, numbered (at least 48 doors visible, numbers increase southwards; pairs of doors per structural bay), between light-grey concrete/metal pilasters. Above them a light-grey **sloped aluminium spandrel band**, then a **continuous ribbon of glazing leaning outwards** (top edge further out towards the pit lane — the "inclined glass wall" designed against glare, dilei.it H), in silver aluminium mullions on a ~2.5–3 m module, two stacked glazing rows, dark/reflective grey glass. Overall colour: silver-grey metal + dark-tinted glass; sponsor banners on the terrace railing. (photos — H for look, M for module)
- **Paddock facade (east):** not well documented; assume plainer grey metal-panel facade with service doors on the ground floor and windows on the 1st floor (L). Team hospitality motorhomes stand in "Paddock 1/2" east of it.
- **Ground relation:** flat, same level as the pit lane (H, photos). Underpasses: service-road tunnel (OSM 34404647, layer -1, "cutting") crossing under the straight near the podium/S end; pedestrian underpass near the N end (231258063) to the rear of Tribuna Centrale (FIA 2026 photographers' route — H).
- **Race control:** race direction currently inside the box building (ilgiorno 2026-02-09 says the offices move out *from* the box building — H). Exact position not published; a rounded glazed drum at the S end of the building next to the podium is visible in photos (Podio Monza 2011.jpg, right) — possibly race control (L).
- **Future (from Nov 2026, not in 2025–26):** +1 floor (aluminium cladding, 240 m glass wall, boomerang-section roof cantilevered over the pit lane, PV roof). Height would rise roughly +5 m (L).

### 3.2 Podium (since 2002)
- **What:** circular podium platform that "projects over the track like an open hand" (ACI/monzanet 2023 poster text — H), crowd fills the straight below. Replaced in 2002 the old art-deco gateway podium with two towers (grandprix.com 2002-01-09 — H).
- **Footprint/position:** OSM: circle **Ø ~11 m**, centre 45.61649, 9.28099, building=tower + bridge=yes, layer 1 (H as mapped), i.e. over the pit wall/pit lane at the **south end** of the box building, next to the finish line; connected to the pit building by a **footbridge ~7–8 m** over the pit lane (OSM 219396384 — H). FIA 2026 map calls it "Podium tower" (torretta podio).
- **Shape/height:** round deck with a thick **red tubular ring** edge and steel-tube railing, carried on a central column/tower (photo 2011 — H for shape). Deck height **~9–10 m** above the pit lane, about level with the box-building terrace (L, from photos). Backdrop wall (sponsor panels ~3–4 m high) on the deck; flag poles ~8 m above the deck (L).

### 3.3 Hospitality Building (N end of the pits, overlooking grid / pit exit)
- **What:** multi-storey hospitality block; Monza "Race Club" uses its **1st and 2nd floors "overlooking the grid and the pitlane"** (monzanet 2026 brochure — H). Will be linked by a bridge to the future press building (ilgiorno 2026-09-06 — H).
- **Footprint:** OSM 90 x 29 m (H), lat 45.61841–45.61924, ~11 m north of the box building, same alignment.
- **Floors/height:** ground + 1st + 2nd floor (H) + roof terrace. **~13–15 m** to the roof slab (L). Photos (Circuito de Monza03, c5 crowd photo) show glazed storeys and a **thin, wide flat roof cantilevering** beyond the facade (M).
- **Facade:** full-height glass ribbons with silver frames, white/grey slab edges (M).

### 3.4 Tribuna Centrale and the grandstands opposite (west side)
- Tribuna Centrale = grandstand 1 (monzanet circuit page — H). OSM 67 x 24 m centre 45.61907, 9.28068 — opposite the Hospitality Building / N end of the pits. Tribuna Laterale Destra (stand 26 A-B-C) 220 x 25 m directly opposite the box building; Tribuna Laterale Sinistra (4) 74 x 22 m and Piscina (5) to the north; "Ristorante Tribuna d'Onore" node at 45.61905, 9.28049 (behind/under the Centrale).
- **Form:** stepped concrete/steel seating rake with **blue seats**, covered by a **long flat (slightly sloping) cantilever roof** on a row of rear columns, roof fascia white/grey carrying sponsor lettering (photo "Monza pitlane.jpg" — H for look). Rear height of the rake **~12–15 m**, roof edge **~15–17 m** (L). The FIA map draws the Centrale with a distinct central pavilion/projection (M).
- Ground: flat, at track level; pedestrian access by the underpass from the paddock (H).
- Not affected by the 2024 works; the planned 2026–27 stadium-style grandstands are at the **Prima Variante**, not here (H).

### 3.5 Timing towers "Torre Nord" / "Torre Sud" (1955)
- **What:** two towers on the main straight built in 1955 with the high-speed ring, originally carrying the illuminated results board; converted to hospitality since 1997 (ACI/monzanet 2023 — H). Sold today as the "Tower" hospitality package: "private tower for 50 guests, private garden", one near the finish line, one at the first chicane (monzanet 2026 — H).
- **Positions:** OSM Torre Sud 45.61620, 9.28064 (W side, at the finish line, ~35 m W of the track centre); Torre Nord 45.62144, 9.28133 (W side close to the track, towards the Prima Variante) (H as mapped, points only).
- **Form (photos — brochure "Tower" page, Commons 2022 pit-lane photo):** compact **square tower with rounded corners**, ~5 storeys: concrete pier/core with external stair at the base, a grey metal-clad band, three storeys of **continuous curtain-wall glazing** (blue-green glass, silver grid), a recessed glazed top floor, flat roof. Plan **~9 x 9 m** (L), height **~20–22 m** (L).

### 3.6 Media centre / circuit offices / paddock
- **2025–2026:** Media Centre in a small building N of the pits next to the circuit offices and a round plaza/fountain, west part of the paddock (FIA 2026 media-kit map — H for location; size not published). OSM buildings in that strip are small 1-storey blocks (10–30 m). The press room itself is also on the box building 1st floor (ilgiorno — H).
- **Old Direzione Autodromo:** disused, containers next to it; to be demolished for the new press building 70 x 14 m (400 workstations) from Nov 2026 (H).
- Paddock: flat asphalt between the box building and the back straight (~270 m E); "Main paddock" behind the box building, "Support event paddock" NE of it; Fangio statue 45.61875, 9.28312 (OSM). Other OSM blocks: unnamed 52 x 51 m commercial (45.61846, 9.28348), Vecchie rimesse 65 x 12 m, Padiglione Esposizioni 49 x 29 m — heights unknown, assume 1–2 storeys (L).
- Centro Medico 38 x 15 m, S of the box building (H); new race-direction building (~600 m2) will stand behind it (future).

### 3.7 Old banking (Sopraelevata, 1955)
- High-speed ring 4,250 m: two banked curves, radius 320 m, joined by two 857 m straights; the west straight is the F1 main straight. Banking slope up to **80%** in the upper band; curves stand on **reinforced-concrete beams and pillars, not on an earth embankment** (dilei.it, moto.it — H). Height of the top edge not found; **~8–10 m** (L).
- **Location:** NOT next to the pits. Sopraelevata Sud starts ~45.614 behind the Parabolica, S of Tribuna Vedano (OSM 1313098145/19983025) and curves E/S (crossed by the road on bridge 34404638). Sopraelevata Nord branches from the straight near 45.622 (Raccordo/1313097098), N of Tribuna Piscina, and curves NE past the Prima Variante. Mapped historic=ruins / note=draft (shape M). Lombardy region funded restoration (EUR 4 M, Dec 2025; more approved July 2026) — not done yet.

## 4. Modelling summary (recommended values)

| building | footprint (m) | height (m) | roof | confidence |
|---|---|---|---|---|
| Palazzina Box | 235 x 25 (OSM 230x25; press 240) | terrace 10; with GP tents ~16 | flat terrace + white tensile canopy | footprint H, heights L–M |
| Podium | Ø 11 deck, ~8 m footbridge to box | deck ~9–10 | open deck, red ring edge | position H, height L |
| Hospitality Building | 90 x 29 | ~14 | flat, thin cantilever | footprint H, height L |
| Tribuna Centrale | 67 x 24 | ~15–17 at roof edge | flat cantilever roof | footprint H, height L |
| Trib. Laterale Destra (26) | 220 x 25 | ~12–15 | flat cantilever roof | footprint H, height L |
| Torre Sud / Nord | ~9 x 9 | ~20–22 | flat | position H, size L |
| Centro Medico | 38 x 15 | ~5 (1 storey) | flat | footprint H, height L |
| Tribuna Garden | 72 x 11 (OSM; press 68.5) | ~8 + pagoda tents | open stand, white pagodas on top in GP | M |
| Banking (Sud/Nord) | R 320 m curves | top edge ~8–10 | concrete deck on piers | geometry H, height L |

All circuit ground is essentially flat at ~180–185 m a.s.l. (L); only the banking (elevated on piers) and the underpasses/cuttings break the flat ground. No building sits on a plinth or embankment as far as found.

## 5. Sources
- OpenStreetMap via https://overpass-api.de/api/interpreter (queried 2026-10-18), ways/nodes listed above; OSM history API for way 34404652.
- https://www.monzanet.it/en/circuit/ (grandstand numbers); https://www.monzanet.it/en/corporate-events/ (room areas, 2.85 m heights, no PDFs); https://www.monzanet.it/en/hospitality/ and Brochure_Hospitality_GP_2026.pdf (Race Club in Hospitality Building 1st/2nd floor; Tower; Garden Lounge).
- ACI poster text 2023: https://infomobility.aci.it/wp-content/uploads/2023/07/ACI-CS-POSTER-GP-F1-MONZA-2023.pdf (podium since 2002; towers 1955, hospitality since 1997).
- FIA media kit Italian GP 2026: https://www.fia.com/sites/default/files/media_kit_-_2026_italian_gp.pdf (media centre / podium / garages maps, underpass).
- Il Giorno 2024-09-10, 2026-02-09 (5 projects, 240 m box building, 600 m2 race direction, 70x14 m press building), 2026-09-06 (Gau Arena, aluminium + 240 m glass, timeline).
- sportefinanza.it 2026-06-25; hdmotori.it 2026-06-26 (works end-2026 to July 2027).
- dilei.it (1989 box building ~200 m with inclined glass wall; 1955 ring data; 2024 works).
- grandprix.com 2002-01-09 (old podium gateway replaced).
- Wikimedia Commons photos: "Monza pitlane.jpg", "Circuito de Monza03.jpg", "Podio Monza 2011.jpg", "Tifosi podio Monza 2011.jpg", "2022 6 Hours of Monza - Pit lane.jpg" (facade reading).

Not found: official building heights, architect of the 1989 pit building, podium engineering data, banking height, monzanet floor-plan PDFs (none linked on corporate-events page).
