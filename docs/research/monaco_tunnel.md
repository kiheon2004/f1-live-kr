# Circuit de Monaco tunnel: physical description for 3D modelling

Researched 2026-10-18. Confidence: H = data or official source, M = several secondary sources or clear imagery, L = estimate or single weak source.
Coordinates are WGS84. Local metres use an equirectangular projection centred at 43.7392, 7.4295.

## 1. OpenStreetMap geometry (Overpass + OSM API, data timestamp 2026-10-18)

### Race direction and orientation (H)
In the race the car leaves Portier (Rond-Point du Portier, about 43.7410, 7.4300), runs south for about 60 m in daylight along Boulevard Louis II, then goes into the tunnel. Inside, the road curves right through about 60°, from a heading of about 183° (south) to about 243° (WSW). It comes out by the Auditorium Rainier III / Grimaldi Forum side, with the Nouvelle Chicane following downhill towards the harbour (the chicane is about 43.7373, 7.4266).
- Sea (Larvotto / Fontvieille side) = **east/south-east = the driver's LEFT** inside the tunnel. Hillside / town side = **driver's RIGHT** (the inside of the right-hand curve).

### Main tunnel way: OSM way 4230891 "Boulevard Louis II" (H)
Tags: highway=secondary, tunnel=yes, layer=-1, lanes=2, lit=24/7, maxheight=default (no posted signed value), maxspeed=50, sidewalk=left, cycleway:left=lane, surface=asphalt, wikidata=Q96215281. Version 32, edited 2026-06-09.
OSM stores the nodes SW→NE. Below they are listed in race order (NE→SW): cumulative distance from the entry mouth in m, then lat, lon, then heading of the next segment in degrees.

| m | lat | lon | heading |
|---|---|---|---|
| 0 (ENTRY mouth, node 519323656) | 43.740362 | 7.430326 | 183 |
| 7 | 43.7402961 | 7.4303209 | 183 |
| 16 | 43.7402186 | 7.4303146 | 186 |
| 32 | 43.7400758 | 7.4302935 | 189 |
| 48 | 43.739934 | 7.4302628 | 192 |
| 64 | 43.7397934 | 7.4302226 | 194 |
| 80 | 43.7396543 | 7.4301731 | 197 |
| 96 | 43.7395172 | 7.4301143 | 200 |
| 112 | 43.7393823 | 7.4300464 | 203 |
| 128 | 43.7392499 | 7.4299695 | 206 |
| 144 | 43.7391203 | 7.4298839 | 208 |
| 160 | 43.7389939 | 7.4297897 | 211 |
| 176 | 43.738871 | 7.4296871 | 214 |
| 192 | 43.7387517 | 7.4295765 | 217 |
| 208 | 43.7386365 | 7.4294579 | 219 |
| 223 | 43.7385256 | 7.4293318 | 222 |
| 239 | 43.7384192 | 7.4291984 | 225 |
| 255 | 43.7383175 | 7.429058 | 227 |
| 268 | 43.7382411 | 7.4289429 | 230 |
| 281 | 43.7381679 | 7.4288239 | 232 |
| 293 | 43.7380981 | 7.428701 | 234 |
| 306 | 43.7380316 | 7.4285746 | 236 |
| 318 | 43.7379687 | 7.4284448 | 238 |
| 331 | 43.7379094 | 7.4283118 | 241 |
| 343 | 43.7378538 | 7.4281757 | 243 |
| 356 (end of way 4230891, node 11407697331) | 43.737802 | 7.428037 | - |

Continuation: way 1230247123 (same tags, tunnel=yes, layer=-1, lit=yes, maxheight=default), nodes 11407697331 → 21914343: 43.737802,7.428037 → **43.737778, 7.427973 = EXIT mouth** (about 6 m). After that the road is open: way 160004393 runs to 43.737532, 7.427307 (the chicane approach).

- **OSM covered length (road centreline): about 362 m** (H for the OSM geometry; see section 2 for how this compares with published figures).
- Curvature: a steady 3° per 16 m, so the **radius is about 300–345 m** (computed). The curve is one constant-radius right-hander with no straight inside. The first ~15 m at the entry are almost straight (183°).
- The entry mouth node 519323656 is **also a vertex of the Fairmont hotel outline** (way 156242249). OSM therefore puts the tunnel's north portal at the hotel's northern corner.

### Approach from Portier (H)
- Raceway way 1470365906 (Portier apex, open): 43.741002,7.42977 → 43.741073,7.430032.
- Raceway way 1470365907 (highway=raceway, tunnel=yes, layer=-1, name "Circuit de Monaco"): 43.741073,7.430032 → 43.741087,7.430253, about 18 m. This is a short covered passage on the exit of Portier, under the "Neuehouse" building (way 1470365896, the new building on the corner). Road twin: way 1470365900 Boulevard Louis II, tunnel=yes.
- Raceway way 1148199871 (open): 43.741087,7.430253 → 43.740888,7.43036.
- Way 41929969 Boulevard Louis II (open, NOT tunnel): 43.740888,7.43036 → 43.740362,7.430326, about **59 m of open road** before the main portal.

### Parallel road tunnel, NOT used by F1 (H)
The Tunnel du Larvotto / Boulevard du Larvotto (ways 157719653, 254596487, 92627415, 176085754; maxheight=4.3 signed; abandoned:railway=rail, because it is the old railway alignment) runs parallel, a few tens of metres inland (west) of the Louis II tunnel, about 310 m long. Do not confuse the two. The F1 tunnel is the one on the seaward side.

### Pedestrian sidewalk inside (H for existence, M for side)
Way 450334964 (footway=sidewalk, tunnel=yes, layer=-1, lit=24/7, paving_stones) runs alongside from 43.740356,7.43039 to 43.737726,7.428075. It lies on the **east/seaward side, the driver's left**.
> Geometry check: at lat 43.73925 the road is at 7.42997 and the sidewalk at 7.43004, so the sidewalk is EAST of the road. For a car heading south, east is on the left. (OSM "sidewalk=left" refers to the way's drawn direction, SW→NE, whose left side is west. That tag is probably wrong or refers to something else. The footway geometry is the better evidence.) Confidence: M.

### What sits above the line (OSM, H for footprints)
- **0 to about 195 m from the entry: under the Fairmont Monte Carlo.** OSM multipolygon relation 2093796: building=hotel, building:levels=3 (this undercounts badly; see section 3), addr 12 Avenue des Spélugues, wikidata Q18216800. Outer way 156242249; inner courtyard way 156242258 (43.7396–43.7398 / 7.4295–7.4301); inner pool way 414005922. Hotel bbox: lat 43.73861–43.74038, lon 7.42914–7.43062. A point-in-polygon test along the centreline puts the road inside the hotel footprint from about 7 m to about 145 m, and again at about 192 m. Between 145 and 210 m the centreline runs along the hotel's western (inland) edge.
- Hotel outline vertices (way 156242249, closed, in order): (43.739896,7.429473) (43.740006,7.42958) (43.739996,7.429728) (43.739988,7.429858) (43.74003,7.429903) (43.740153,7.430034) (43.740385,7.430307) (43.740362,7.43032) (43.740362,7.430326) (43.740356,7.43039) (43.740354,7.430416) (43.740345,7.430454) (43.740089,7.430618) (43.739956,7.430487) (43.739796,7.43059) (43.739597,7.430372) (43.739433,7.430469) (43.73918,7.430188) (43.739016,7.430275) (43.73861,7.429871) (43.738642,7.429453) (43.738636,7.429303) (43.738882,7.429138) (43.739016,7.429273) (43.738824,7.429376) (43.7388,7.429651) (43.739033,7.429897) (43.73917,7.429821) (43.739208,7.429392) (43.739379,7.429492) (43.739595,7.429347) (43.739814,7.429414) (43.739877,7.429492). The hotel's seaward edge follows the coastline (OSM natural=coastline way 1424754015 runs along the hotel's east side), so **the hotel stands directly over the shore and the sea on piles. The tunnel is the hotel's ground level.**
- **About 200 to 362 m (exit third): not under the hotel.** Above the slab are the **Jardin d'acclimatation** garden (leisure=garden, way 627162482), the **Promenade des Champions** footway (way 1005539537, layer=1, the "Golden Foot" promenade) and other layer-1 footways. On the seaward side is the low **Auditorium Rainier III** (way 112689159, height 12.5 m, building:levels 2), with Vasarely's "Hexa Grace" mosaic on its roof (way 1082682031). On the inland side is the "Monte Carlo Star" residential block (way 176722821, 3 levels), whose outline runs along the tunnel's west wall from 43.7389,7.4291 to 43.7377,7.4280. Interpretation: the last ~160 m is a cut-and-cover slab with a public garden/terrace on top (the "Spélugues" complex), not a building. Confidence M.
- Lamp posts at the open approach to the chicane: nodes 11409061492 (43.7377959, 7.4275686) and 11409061493 (43.7379216, 7.4278667), lamp_mount=bent_mast.

## 2. Dimensions and cross-section

### Length (how sure we are)
| Quantity | Value | Source | Conf. |
|---|---|---|---|
| Covered road, main portal (under Fairmont) to exit portal (chicane side) | **≈ 362 m** centreline | OSM ways 4230891 + 1230247123 (computed) | H (±10 m) |
| Extra short cover just after Portier (under the Neuehouse building) | ≈ 18 m, then ≈ 59 m open | OSM ways 1470365907 / 41929969 | H |
| Section under the hotel itself | ≈ 0–200 m from the entry (first ~55 %) | OSM point-in-polygon | M-H |
| Section under the garden/promenade slab (no building) | ≈ 200–362 m | OSM | M |
| "≈ 400 m" (Tunnel Louis II, road-wiki article) | rounded, probably includes the approaches | routes.fandom.com (paywalled, quoted via search) | L |
| "430 m cycle lane in the Louis II tunnel, Yacht Club to Portier" (2023) | the lane runs past both portals | news.mc 2023-11-21 | M (it is the lane's length, not the tunnel's) |
Commonly quoted figures of 400–500 m for the covered part are **not supported** by the geometry. Use **≈ 360 m** of hard roof, plus the 18 m cover at Portier if wanted.

### Plan curve (H, computed)
One steady right-hander. Heading goes from 183° to 243° over 356 m (≈ 59°), at a constant ≈ 3° per 16 m. **R ≈ 300–345 m.** Flat out, ~260 km/h (Wikipedia; the FIA kit gives a 303 km/h top speed for the circuit, reached on the approach to the chicane). Gradient: the road descends gently from Portier towards the harbour. No gradient data was found (L, estimate about −1 to −2 %).

### Cross-section (from CC0 Commons photos taken 2022-05-23, i.e. GP setup week, plus 2021 / 2011 photos)
Directions are for a car in race direction. **Left = east = sea side = OUTSIDE of the curve; right = west = hillside = INSIDE of the curve.**
- **Ceiling (H, from photos):** flat, untreated grey cast-in-place concrete slab, no ribs or arch. Shallow transverse beams/joints at intervals (visible in c6/c3). Cable trays and conduits are fixed to the soffit. Permanent lighting is linear tube fittings on the soffit.
- **Clear height:** OSM maxheight=default, so no posted limit. Photo scaling against cars and armco gives **≈ 4.2–4.6 m** floor to soffit, a little lower under the edge beams at the portals (≈ 4–4.5 m). Estimate, L-M. For comparison, the parallel Larvotto tunnel is signed 4.3 m.
- **Width:** 2 traffic lanes; since 2023 there is also one cycle lane (Menton-bound only, "width does not allow a second", news.mc). An OSM offset of road to sidewalk centreline (≈ 5.5 m) suggests a **carriageway ≈ 8.5–10 m** between barriers, plus a 1.5–3 m pedestrian walk on the sea side. Estimate, L-M. Inside the tunnel the F1 track uses the full carriageway.
- **Left / sea / outer wall (driver's left):**
  - **Entry part (Portier end, roughly the first third):** an **open colonnade**. Square concrete pillars carry the hotel's edge beam, with daylight openings between them looking east (formerly onto the sea, now onto the Mareterra district). Between the pillars and the road runs the public sidewalk, behind a fence. For the GP, concrete blocks topped with debris fencing are placed along the road edge. (Commons "Dans le tunnel Louis II" 2021, Commons 2011 portal photo.) SGM's case study: "partly open in one side along the shoreline". M.
  - **Middle and exit part:** a **solid wall clad in cream/off-white ceramic tiles** in large panels with dark joints. It is broken by the hotel's "P Louis II" car-park entrance, service doors and louvred ventilation grilles. Large sponsor banners hang on it during the GP ("Casino de Monte-Carlo", red; "Zepter", dark blue/yellow). **Triple-rail armco** runs along its base. M-H.
- **Right / hill / inner wall (driver's right):** mostly tiled concrete wall with a narrow raised service walkway and armco. Through the middle section, F1 places **concrete blocks topped with tall catch-fencing**, with **TV camera posts** mounted on the blocks (c2, c4, c5, c7: a camera on the inside of the curve). M.
- **Track surface:** asphalt with white edge lines during the GP. In normal traffic the lines are yellow (photos 2021/2022). The FIA kit notes the road from the tunnel to the chicane was planed by up to 20 cm (2011–12 works) and is resurfaced periodically (tunnel exit to Rascasse). H.
- **TecPro:** none inside the tunnel. Barriers inside are armco and concrete blocks; TecPro is at the corners (FIA kit: 900 m of TecPro and 21 km of safety rail for the whole circuit). M.
- **Fire safety:** since 2014, a foam fire-extinguishing system along two-thirds of the tunnel's length (FIA kit, p. 25–26). Fire-extinguisher signs are posted on the inside fence. H.
- **Drainage:** nothing specific was found. Normal roadside gutters along the kerbs. L.

### Lighting
- Electric GP lighting was first added in the early 1990s at Alain Prost's request (SGM Lighting case study). M.
- The ACM installed "UBD", a reflector system that redirects outside daylight into the mouth to soften the black-hole effect (crash.net). M.
- **From 2016 the tunnel lighting was modified "to reduce the 'black hole' effect upon entry and the glare drivers experience when exiting"** (FIA/ACM media kit 2026, p. 26). H.
- **What the 2022 photos show:** a continuous row of floodlights **on a rail at the top of the outer (left/sea) wall, right under the ceiling edge**, about every 3–4 m. The fittings **alternate warm (amber, ~2700–3000 K look) and cool white (~5000–6500 K LED)**. A second similar row runs along the inner side at the entry, above the colonnade. At the TV positions there are extra large rectangular LED panel floods on trusses. SGM P-5/Q-7 RGBW LED washes have been used ("light very close to daylight"). Overall impression: brighter than an ordinary road tunnel, with a slightly warm, mixed colour temperature. Lux not published. M for layout, L for K values.

## 3. What is above
- **Fairmont Monte Carlo** (ex-Loews Monte-Carlo): developer Caroli Group; architects Jean Ginsberg, Jean & José Notari, Herbert Weisskamp; completed early 1970s, **opened August 1975** as Loews; Monte Carlo Grand Hotel from 1998; Fairmont from 2004 (Wikipedia). Built on the site of Monaco's first railway station and partly out over the sea on piles. **7 hotel floors** (Wikipedia, venue listings), above a base podium (casino, convention halls, car park) that forms the tunnel roof. 596 rooms. The facade is beige precast concrete with horizontal balcony bands and red awnings, plus a roof terrace and pool (OSM inner pool). The seaward block stands on tall round columns in the water (2011 photo). Estimated total height above the road: **≈ 30–35 m** (7 floors × ~3 m + podium ~8–10 m). L.
- **Piles:** 40 piles and foundations under the hotel and Boulevard Louis II were restructured 2020 – Feb 2024 (VINCI Construction Monaco / Triverio). This is the structure the tunnel sits in (Monaco Tribune 2024-02-13). H.
- **History:** the circuit ran through an older tunnel until 1972. For 1973 the tunnel was **extended towards Portier** as part of building the Loews (Wikipedia "Circuit de Monaco"). The old shoreline railway was put underground; its line is the Larvotto tunnel, inland. The 1986 widening at the foot of Bd Louis II created the Nouvelle Chicane (FIA kit). H.
- **Over the exit third (≈ 200–362 m):** not a building, but a landscaped slab (Jardin d'acclimatation, Promenade des Champions, layer-1 footways). The low Auditorium Rainier III (12.5 m, seaward) and the Monte Carlo Star apartments (inland) stand on either side. The **exit portal** (Commons c8) is a deep concrete beam carrying a banner. Above it is a terraced white apartment block with planting. To the left of the portal (seen from outside, i.e. the inland side) is a rubble-stone retaining wall over natural rock. M.
- **Exit to chicane (Commons c1):** a short open downhill to the chicane. On the right is a tall stone retaining wall topped by a terrace/road with lamp posts; on the left are a fence and the harbour side; red/white kerbs at the chicane entry. H.
- **Entry portal (Commons "Tunnel Louis II" 2021, c9 2011):** the portal is the underside of the hotel's podium, a flat soffit at about 4.5 m. Above the mouth are the stepped hotel facade and curved balconies. On the right (inland) is a large white smooth curved shell-shaped concrete wall. On the left are the sea/Mareterra side, a pedestrian promenade with railing and the hotel's columns. H.

## 4. Reference images and video
Official first:
1. **FORMULA1.COM, "ONBOARD: Lando Norris' 2025 Pirelli Pole Position Award lap at the Monaco Grand Prix"** – https://www.formula1.com/en/video/onboard-lando-norris-2025-pirelli-pole-position-award-lap-at-the-monaco-grand-prix.1833024466180836753 . Full 1:09.954 lap (2025 track record). It shows Portier → the short covered section → the open run → the tunnel (colonnade daylight on the left at the start, then the tiled wall and armco on the left, fences on the right) → exit glare → chicane. Not viewed frame by frame here (JS player).
2. FORMULA1.COM, "Onboard comparison 2018 v 2017 Monaco pole laps" – https://www.formula1.com/en/video/onboard-comparison-2018-v-2017-monaco-pole-laps.6060943563001 . Older lighting configuration.
3. F1 circuit guide (official), https://www.formula1.com/en/latest/article/circuit-guide-everything-you-need-to-know-about-the-circuit-de-monaco.vFsmfGHr6RWyLFtxi58wi : no tunnel data; only Palmer's quote "You flash out of the tunnel and pick a braking point for the chicane". No tunnel images.
4. **FIA/ACM Media Kit 2026** (downloaded, 63 pp.): https://www.fia.com/sites/default/files/media_kit_2026_gb_03.06_1.pdf . Circuit facts (3.337 km, 19 bends, 303 km/h top speed, 900 m TecPro, 21 km rails); the 2014 foam system along 2/3 of the tunnel; 2016 lighting modification; the marshal map labels "ENTRÉE TUNNEL / SORTIE TUNNEL", "FAIRMONT", "PORTIER" and lifts "entre tunnel et Square Massenet". No dimensions.
5. Monaco Life (2023-05), photos by Luke Entwistle: tunnel entrance https://monacolife.net/wp-content/uploads/2023/05/image00019-scaled-e1683205599192.jpeg ; exit towards the Nouvelle Chicane https://monacolife.net/wp-content/uploads/2023/05/image00022-scaled-e1683205692309.jpeg (not viewed).
6. SGM Lighting case study (F1 tunnel lighting): https://www.sgmlighting.com/projects/famous-tunnel-lit-by-sgm-fixtures-for-the-monaco-formula-1-grand-prix (images formula1_monaco_1..4.png).

Wikimedia Commons (viewed; free licences, so usable as texture/reference):
| File | Date | Shows |
|---|---|---|
| https://commons.wikimedia.org/wiki/File:Tunnel_Louis_II.jpg | 2021-06-02 | Entry portal from the Portier side: hotel above, white curved shell wall on the right, armco + sidewalk |
| https://commons.wikimedia.org/wiki/File:Dans_le_tunnel_Louis_II.jpg | 2021-06-02 | Inside the entry part, race direction: **colonnade openings on the left (sea)**, tiled wall + armco on the right, two ceiling-edge rows of floodlights, flat slab |
| https://commons.wikimedia.org/wiki/File:Circuit_de_Monaco_-_Entrance_of_the_tunnel_(54777070030).jpg | 2022-05-23 | Inside, looking back towards Portier: tiled outer wall, "P Louis II" car-park entry, triple armco, alternating warm/white lights |
| https://commons.wikimedia.org/wiki/File:Circuit_de_Monaco_-_Tunnel_(54776961819).jpg | 2022-05-23 | Race direction, middle: Zepter banner on the left tiled wall, TV camera + LED panel floods on the right (inner) side |
| https://commons.wikimedia.org/wiki/File:Circuit_de_Monaco_-_Tunnel_(54776967118).jpg | 2022-05-23 | Outer wall service doors, light rail detail, flat slab |
| https://commons.wikimedia.org/wiki/File:Circuit_de_Monaco_-_Tunnel_(54776967713).jpg and (54776971893) | 2022-05-23 | Same TV position looking towards Portier: red "Casino de Monte-Carlo" banner on the outer wall, warm far lighting |
| https://commons.wikimedia.org/wiki/File:Circuit_de_Monaco_-_Tunnel_(54777078500).jpg | 2022-05-23 | Square stone-faced pillars on the outer side with a garage plaza behind, bright portal at the far end |
| https://commons.wikimedia.org/wiki/File:Circuit_de_Monaco_-_Tunnel_(54783464831).jpg | 2022-05-23 | Race direction: long tiled outer wall, "Casino de M…" banner, armco, catch-fence on the inner side |
| https://commons.wikimedia.org/wiki/File:Circuit_de_Monaco_-_Tunnel_(54783705933).jpg | 2022-05-23 | **Exit portal from outside**: Zepter banner beam, apartments above, stone retaining wall and rock |
| https://commons.wikimedia.org/wiki/File:Circuit_de_Monaco_-_Sortie_du_Tunnel_(54783799505).jpg | 2022-05-23 | From the exit towards the chicane: stone retaining wall on the right, fence on the left, bollard cycle lane (removed for the race) |
| https://commons.wikimedia.org/wiki/File:Tunnel_stradale_sotto_l%27hotel_Fairmont,_Monaco.jpg | 2011-07-16 | Portier portal pre-Mareterra: sea + hotel piles on the left, shell wall on the right |

## 5. Modelling summary (best values)
- Centreline: use the 26-node table in section 1. Hard roof from s = 0 (43.740362, 7.430326) to s ≈ 362 m (43.737778, 7.427973). Optional 18 m cover at 43.741073,7.430032 → 43.741087,7.430253.
- Constant R ≈ 320 m right-hander; heading 183° → 243°.
- Carriageway ≈ 9 m (L-M); clear height ≈ 4.4 m (L-M); flat concrete soffit; slab thickness/podium ≈ 1–1.5 m (L).
- Left (sea) side: open pillar colonnade for the first ≈ 100–130 m (pillar spacing ≈ 6–8 m, square ≈ 0.8–1.0 m; estimate, L), then tiled solid wall with triple armco to the exit.
- Right (inland) side: tiled wall/armco; concrete blocks + 3–4 m catch-fence in the middle; TV cameras.
- Lights: one row along each upper wall edge, about every 3.5 m, alternating 3000 K / 5500 K, plus a brighter entry zone (black-hole mitigation since 2016).
- Above: hotel volume (≈ 30–35 m, 7 floors over a podium) over s = 0–200; landscaped slab with low buildings over s = 200–362.
