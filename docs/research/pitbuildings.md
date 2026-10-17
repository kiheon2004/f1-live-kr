# Pit buildings: research for the 19 generically modelled F1 circuits (LiveTimingKR v0.36)

Compiled 2026-10-17. Web research only; no photos downloaded or embedded (photos are cited, not copied). Each circuit section has a field table (value, confirmed vs estimate, source number) and its own numbered source list (all accessed 2026-10-17). Source numbers apply only within their own section.

- **confirmed**: the cited source states it.
- **estimate**: inferred from photos, scale or map data; how is given.
- **OSM estimate**: measured from OpenStreetMap footprints (Overpass, 2026-10-17), taking the polygon's longest extent. These are not published dimensions, and the app may already use these footprints.
- FIA F2/F3 documents were not used for F1 values.
- Several publishers blocked WebFetch, so some pages were read with curl. Where a fact rests only on a search-engine snippet, its section says so.

Order: Albert Park, Shanghai, Bahrain, Jeddah, Miami, Montréal, Monaco, Barcelona, Madring, Baku, Spa, Zandvoort, Monza, Marina Bay, COTA, Mexico City, Interlagos, Las Vegas, Sepang.

---

## Albert Park Grand Prix Circuit (Melbourne)

**Status for modelling:** The building changes by season. The 1995 pit building (used up to and including 2026) was demolished from late March/April 2026. A new Woods Bagot mass-timber building (14 garages) is due for 2028, and 2027 uses new garages plus a temporary Paddock Club. No published length, storey count or height was found for either building, so geometry must come from OSM or photos (old) or renders (new).

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | not found (old or new). Use the OSM footprint for the 1995 building | — | — |
| Garages | Old: housed the F1 teams' garages (count not stated for the 1995 building; a Supercars article says the existing garages "play host to the 12 Formula One teams"). New: 14 garages (12 team + 2 officials) | confirmed | [3][4][6] |
| Storeys / height | not found for either building. New building has "higher ceilings" for indoor sport (no figure) | — | [7] |
| Roof | Old: not found. New: not described. A Wood Central headline calls it a "timber-waffle" pit lane building (likely roof/ceiling structure, not explained in the text) | estimate (headline only) | [5] |
| Pit-lane facade | New: hospitality terraces with cross-laminated-timber beams and floor-to-ceiling glazing overlooking circuit and lake. Old: not found | confirmed (new) | [5] |
| Paddock-side facade | not found | — | — |
| Notable features | New: race control, administration, media centre, Paddock Club for 5,000 guests/day, 7 indoor sports courts + clubrooms (community use rest of year, called "Melbourne Indoor Sports Centre"). Old: garages, race control, media, hospitality; Paddock Club was historically in a **separate structure** next to the paddock entry at the end of Melbourne Walk, not on top of the pit building | confirmed | [1][2][4][8][9] |
| Permanent / built / renovated | Old: permanent, built 1995 for the first Melbourne GP (1996); "one of the oldest and smallest" on the calendar; demolition began late March/early April 2026 (after the 2026 GP). 2027: "mix of temporary and existing infrastructure", new garages + temporary Paddock Club (2,500 capacity). New: complete for the 2028 GP. Architect Woods Bagot (design lead Bruno Mendes), landscape ASPECT Studios, builder Icon, engineer AECOM, delivered by Development Victoria; reported cost A$280m | confirmed | [1][2][3][4][6][8][9] |
| Paddock (team buildings / hospitality) | not found (no source on team hospitality type at Albert Park) | — | — |
| Paddock street layout | not found | — | — |
| Landmark 1 | Melbourne CBD / Southbank skyline across Albert Park Lake (e.g. Eureka Tower, 297 m). The view geometry from the straight is not sourced | estimate (location knowledge; height is a pointer only) | [10] |
| Landmark 2 | Melbourne Sports and Aquatic Centre / Lakeside Stadium (same precinct, State Sport Centres Trust). Sources say they are in the precinct, not where they sit relative to the straight | confirmed (precinct only) | [7] |

Notes: For a 2026-season model, use the old 1995 building (the 2026 race ran before demolition). For 2027, a transitional layout with new garages and a temporary Paddock Club. For 2028+, the new Woods Bagot building. Reported costs differ: A$350m in May 2025 media (not confirmed by government), A$200m→280m later (PlanetF1). The Woods Bagot project page gives no dimensions. Development Victoria FAQ and PDF updates returned 403 and could not be read directly; the 2,500-capacity temporary Paddock Club figure comes from a search snippet of the FAQ.

Sources (accessed 2026-10-17):
1. Demolition begins on Albert Park F1 pit building — Austadiums, 8 Apr 2026, applies to 1996–2026 (old) / 2027–28. https://www.austadiums.com/news/1700/demolition-begins-on-albert-park-f1-pit-building
2. F1 news 2026 Albert Park pit building demolition update — Speedcafe, 21 May 2026, applies to 2026–28. https://speedcafe.com/f1-news-2026-australian-grand-prix-albert-park-pit-building-demolition-update-construction-upgrades/
3. Racing to secure Project Win at Albert Park — Icon, 12 Jun 2025, applies to 2028+. https://icon.co/?p=3856
4. Elevating Motorsport, Empowering Community (Albert Park Pit Building) — Woods Bagot, undated (2025/26), applies to 2028+. https://www.woodsbagot.com/projects/elevating-motorsport-empowering-community/
5. Melbourne's new timber-waffle pit lane locks in F1 for next decade — Wood Central, 15 Feb 2026, applies to 2028+. https://woodcentral.com.au/melbournes-new-timberwaffle-pit-lane-locks-in-f1-for-next-decade/
6. First glimpse of lavish new Australian GP pit building — PlanetF1, 11 Sep 2025, applies to 2028+. https://www.planetf1.com/news/first-glimpse-of-australian-gp-pit-building-upgrade-albert-park
7. Lights Out For Brand New Melbourne Indoor Sports Centre — Premier of Victoria, 2026 (March), applies to 2027–28. https://www.premier.vic.gov.au/lights-out-brand-new-melbourne-indoor-sports-centre
8. Albert Park project FAQs — Development Victoria, undated, applies to 2027–28 (403 on fetch; seen via search snippet). https://www.development.vic.gov.au/projects/albert-park/pages/faqs
9. Demolition set for Albert Park pit building before record-breaking $280m Melbourne rebuild — PlanetF1, 2026, applies to 1996–2028 (Paddock Club location, cost; via search snippet). https://www.planetf1.com/news/demolition-set-for-albert-park-pit-building-before-record-breaking-280m-melbourne-rebuild
10. Speedcafe, Albert Park pit lane upgrade details — 13 Mar 2025, applies to 2025 (old building "one of oldest and smallest"). https://speedcafe.com/f1-news-2025-albert-park-pit-lane-melbourne-australian-gp-upgrade-details/ (Eureka Tower height: Wikipedia pointer only, https://en.wikipedia.org/wiki/Eureka_Tower)

## Shanghai International Circuit (Shanghai)

**Status for modelling:** The overall complex is well described. The main grandstand is 400 m long and up to 27 m high, with a 40 m cantilever roof. Two "wing" bridge buildings span the straight (Press Centre east, Sky Restaurant west), about 38.4 m above ground. The control tower has the Media Centre on its 9th floor, and the team buildings are pavilions on a lake. The pit building's own length, height and garage count are poorly sourced and the sources conflict.

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | not found. Estimate: roughly matches the 400 m main grandstand opposite, because the two end towers/wings connect grandstand to pit building | estimate (layout inference from [2][4]) | [2][4] |
| Garages | Conflict: 36 garages on the lower level (Baidu Baike); 41 boxes with rolling shutters and core services every 6 boxes (unattributed Scribd student presentation). Neither is authoritative | confirmed by secondary sources only, conflicting | [2][5] |
| Storeys / height | Lower level garages + upper level VIP suites (Paddock Club). Exact storeys/height not found. Estimate 2–3 storeys, ~12–15 m, based on the "lower/upper level" description | estimate | [2] |
| Roof | Pit building: not found. Main grandstand: cantilevered steel roof, 40 m span (the "wing"-like roof the brief mentions). Sub grandstand: membrane canopy of 26 lotus-flower umbrellas ("lotus leaf" roof) | confirmed (grandstands, secondary) | [1][2][3] |
| Pit-lane facade | not found. Garage doors on the lower level are implied by "rolling shutters" in [5] | estimate | [5] |
| Paddock-side facade | not found | — | — |
| Notable features | Paddock Club = upper-level VIP suites overlooking the grid. Race Control Tower (race control floor + timing floor) and a symmetrical Administration Building at either end. Media Centre on the **9th floor of the control tower**. Press Conference Room on 2nd floor of the **Podium Building**, next to the control tower. Two bridge "wings" span the track: Press Centre (east, 500 journalists) and Sky Restaurant (west, ~700 seats), "perched 38.4 m above the ground" | confirmed (FIA kit for media/podium; Baidu for the rest) | [1][2] |
| Permanent / built / renovated | Permanent. Designed by Tilke, completed/opened 2004 (18-month build on swampland, 40,000 piles). No building renovation found (track resurfaced before 2025) | confirmed | [1][3][6] |
| Paddock (team buildings / hospitality) | Permanent dedicated team buildings: pavilions on stilts above a lake, after Shanghai's Yu Yuan garden. Baidu: 26 waterside villas of ~200 m² each. Red and gold traditional detailing; blue lighting at night | confirmed | [1][2][3] |
| Paddock street layout | not found beyond "pavilions in a lake" behind the pit building | — | [3] |
| Landmark 1 | Main grandstand: 400 m long, 40.6 m deep, 2.74–27 m above ground, cantilever roof 40 m span, 30,000 seats (FIA) / 28,400 fixed (Baidu) | confirmed (secondary for dimensions) | [1][2] |
| Landmark 2 | Two bridge wings (Press Centre / Sky Restaurant) spanning the start/finish straight at either end, ~38.4 m above ground, tied to towers at the pit building. Length not reliably found (an aggregated search summary said "nearly 100 m", source unverified) | confirmed height (secondary); length not found | [2][4] |

Notes: The Tilke portfolio page gives no building data, only "team buildings like pavilions in a lake". The grandstand figures come from Baidu Baike (secondary, probably from Chinese official material). The 38.4 m wing height is probably the elevation of the wing structure, not its underside clearance. The 36 vs 41 garage numbers should not be trusted. Count garages from an aerial photo or OSM instead.

Sources (accessed 2026-10-17):
1. Media Kit — Formula 1 Heineken Chinese Grand Prix 2026 — FIA / Shanghai International Circuit, 2026, applies to 2026. https://www.fia.com/sites/default/files/media_kit-formula_1_heineken_chinese_grand_prix_2026.pdf
2. Shanghai International Circuit — Baidu Baike (English), undated, applies to 2004+. https://baike.baidu.com/en/item/Shanghai%20International%20Circuit/1559175
3. Shanghai International Circuit — Tilke GmbH portfolio, undated, applies to 2004+. https://tilke.de/portfolio/shanghai-international-circuit/
4. Shanghai International Circuit — RacingCircuits.info (via Wikipedia), undated, applies to 2004+ (wings link pit building and grandstand). https://www.racingcircuits.info/asia/china/shanghai-international-circuit.html
5. F1 Race Track Design Overview (student presentation) — Scribd, undated, low reliability. https://www.scribd.com/presentation/373186038/F1-TRACK
6. Shanghai International Circuit — Wikipedia (pointer only), accessed 2026. https://en.wikipedia.org/wiki/Shanghai_International_Circuit

## Bahrain International Circuit (Sakhir)

**Status for modelling:** The core layout is reasonably sourced. The pit building is partly 3 and partly 2 storeys with about 18,000 m² of floor area (pre-opening/academic figures). Behind it, a palm-lined lane separates the garages from permanent team hospitality buildings (18 units in 6 blocks). The Sakhir Tower is a circular, balconied tower with a sail canopy on top, but sources give its storey count as 7, 8 or 9. No published length or height for the pit building. Note that no 2026 F1 race took place here (cancelled).

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | not found. Building-length estimate from the ~18,000 m² floor area over 2–3 floors: roughly 300–400 m × 20–25 m. Prefer the OSM footprint | estimate (area ÷ floors ÷ assumed depth) | [3][4] |
| Garages | not found for F1 (an unreliable aggregator says 40 garages; not used) | — | — |
| Storeys / height | Pit garages + Paddock Club: "partly three and partly two storeys", ~18,000 m². Height not found; estimate ~12–14 m (3 × ~4–4.5 m) | confirmed storeys (pre-opening/academic); height estimate | [3][4] |
| Roof | not found | — | — |
| Pit-lane facade | not found | — | — |
| Paddock-side facade | not found. Behind the garages are team engineering offices, ordered by the previous year's constructors' standings | confirmed (layout only) | [5] |
| Notable features | Paddock Club on the pit building (part of the 3/2-storey pit+Paddock Club structure). Media centre for 500 journalists. "Second pit building" with lounges and a 3,000-seat grandstand. Main grandstand for 10,000 with hospitality suites. 2025: temporary pop-up viewing area next to the Paddock Club (+360 places); Paddock Club expansion planned from after the 2026 race, wider expansion 2027–29 | confirmed | [2][4][6] |
| Permanent / built / renovated | Permanent. Tilke & Partners (consulting engineer/designer); contractors WCT (Malaysia) and Cebarco (Bahrain); completed March 2004 in 16 months. No pit-building rebuild found; LED media facade added to the tower in 2021 | confirmed | [1][7][8][9] |
| Paddock (team buildings / hospitality) | Permanent team hospitality buildings across a palm-tree lane from the garages ("dedicated buildings for 18 international racing teams"; academic paper: 18 units in 6 buildings, ~5,000 m²). These were later found too small, and modular kitchens were added | confirmed | [2][4][5][10] |
| Paddock street layout | Garages (pit building rear) → palm-lined walkway → row of permanent team hospitality buildings | confirmed | [5] |
| Landmark 1 | Sakhir Tower (VIP tower) near Turn 1: circular plan, stacked balconies widening toward the top, sail-like canopy on top, LED bands on the balcony handrails/louvres (2021). Storeys conflict: 7 levels (LSi 2021), 8 storeys (Ferrari), 9 storeys (Crash.net). Pre-opening data: ~30 m diameter (search snippet only). Height not found; estimate ~30–35 m for 8 storeys at ~4 m | confirmed form; storeys conflicting; height estimate | [1][2][3][7] |
| Landmark 2 | Main grandstand opposite the pits (10,000 seats, hospitality suites). Roof/dimensions not found | confirmed capacity only | [2] |

Notes: No F1 race was held in 2026 (the Bahrain and Saudi GPs were cancelled on 14/15 Mar 2026 because of the Middle East conflict), so the model state is effectively 2025. The Gulf Construction pre-opening articles (the 3/2-storey and 18,000 m² figures, tower diameter) are now 404, so those figures come from search snippets. The Alnaser et al. paper (Building and Environment, 2007) repeats them but could not be fetched (403/bot wall). Zaha Hadid's later BIC masterplan (clubhouse/hotel) is a separate, unbuilt-in-this-form project; do not attribute the pit buildings to it.

Sources (accessed 2026-10-17):
1. Bahrain — Ferrari Hypercar circuit page, undated, applies to 2004+. https://www.ferrari.com/en-EN/hypercar/bahrain
2. What you may not know about the Bahrain circuit — Crash.net, 2004 (page updated 31 Mar 2022), applies to 2004. https://www.crash.net/f1/news/48131/1/what-you-may-not-know-about-the-bahrain-circuit
3. F1 on the right track — Gulf Construction, 2003/04 (now 404; via search snippet), applies to as-designed 2004. https://gulfconstructiononline.com/Article/4387/F1_on_the_right_track
4. Architectural, construction and environmental matters of Bahrain's International Formula 1 Circuit — Alnaser et al., Building and Environment, 2007 (via search snippet). https://www.academia.edu/39708144/Architectural_construction_and_environmental_matters_of_Bahrains_International_Formula_1_Circuit
5. Formule 1 : découvrez les coulisses du circuit de Sakhir au Bahreïn — RTBF, 24 Feb 2023, applies to 2023. https://www.rtbf.be/article/formule-1-decouvrez-les-coulisses-du-circuit-de-sakhir-au-bahrein-11157903
6. BIC capacity expansion plans — Gulf Daily News, 7 May 2025, applies to 2025–29. https://www.gdnonline.com:443/Details/1352428
7. WBD leads lighting upgrade at Bahrain International Circuit — LSi Online, 30 Mar 2021, applies to 2021+. https://www.lsionline.com/news/wbd-leads-lighting-upgrade-at-bahrain-international-circuit
8. Bahrain International Circuit — WCT Holdings, undated, applies to 2004. https://wct.com.my/our_businesses/engineering_and_construction/Infrastructure/details.aspx?pj=14&p=2
9. Bahrain International Circuit — Cebarco, undated, applies to 2004. https://www.cebarco.com.bh/project/bahrain-international-circuit/
10. Modular Kitchens Supplied to Bahrain International Circuit — PKL, undated. https://www.pkl.co.uk/modular-kitchens-supplied-to-bahrain-international-circuit/
11. 2026 Bahrain and Saudi Arabian Grands Prix cancelled — PlanetF1, Mar 2026. https://www.planetf1.com/news/bahrain-saudi-arabian-f1-2026-cancelled

## Jeddah Corniche Circuit (Jeddah)

**Status for modelling:** Length and storeys are well sourced. The building is 280 m long, four storeys, a "composed landscape of multi-storey staggered buildings" by Tilke (architect Ulrich Merres), and holds garages, race control and the Paddock Club above the garages. Facade, roof, height and garage count are not published. Permanence is ambiguous: the CEO said in 2022 that most buildings are due to come down when F1 leaves. No changes after 2021 found. No 2026 race (cancelled).

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | 280 m | confirmed | [1][2][3] |
| Garages | "all team garages" (count not stated) | confirmed (no count) | [1] |
| Storeys / height | 4 storeys. Height not given; estimate ~18–20 m (4 × ~4.5 m, ground garage level taller) | confirmed storeys; height estimate | [1][2] |
| Roof | not found. "Staggered" massing suggests stepped roof levels, not one flat slab | estimate (from the architect's description) | [1] |
| Pit-lane facade | not found. Paddock Club suites sit directly above the team garages, looking onto the pit lane and grid | confirmed (function only) | [1][6] |
| Paddock-side facade | not found. The building "backs onto" the Red Sea coast | confirmed (orientation only) | [1] |
| Notable features | Race control centre and Paddock Club premium suites inside. Covered Main Straight grandstand opposite the pits and grid; a second straight grandstand added in 2022 | confirmed | [1][6] |
| Permanent / built / renovated | Built 2021 in ~7 months (Tilke team on board Jan 2021; ~48% done by July 2021); first race 5 Dec 2021. Permanence: CEO Whitaker (Mar 2022) said "the majority of the buildings will come down or are due to come down after the racing is completed" (race to move to Qiddiya), while in 2021 he said it would be "as permanent as we want it to be". No later renovation found | confirmed (quotes); permanence unresolved | [3][4][5][7] |
| Paddock (team buildings / hospitality) | not found | — | — |
| Paddock street layout | not found | — | — |
| Landmark 1 | Red Sea / Corniche seafront directly behind the pit building | confirmed (orientation) | [1] |
| Landmark 2 | King Fahd's Fountain on the Corniche (jet up to 312 m). Visibility from the main straight is unconfirmed | confirmed height; view relationship estimate | [8] |

Notes: All dimension data traces back to a single Saudi Motorsport Company release (June 2021, repeated by F1.com, ME Construction News and Gulf Construction), so it is a design figure. No source was found for post-2021 changes to the pit building. The 2026 GP was cancelled (Middle East conflict), so the last F1 use was 2025. The move to Qiddiya has slipped (reports range from 2025 to 2027+).

Sources (accessed 2026-10-17):
1. REVEALED: New images of state-of-the-art Saudi Arabian pit and team building — Formula1.com, 8 Jun 2021, applies to 2021+. https://www.formula1.com/en/latest/article/revealed-new-images-of-state-of-the-art-saudi-arabian-pit-and-team-building.3XR9bIkbSNnUljmD176uzD
2. Construction of circuit for inaugural Saudi Arabia Grand Prix on track — Middle East Construction News, ~Jul 2021, applies to 2021+. https://meconstructionnews.com/48433/construction-of-circuit-for-inaugural-saudi-arabia-grand-prix-on-track/amp
3. Fastest F1 street circuit being readied in Jeddah — Gulf Construction, 1 Aug 2021, applies to 2021+. https://gulfconstructiononline.com/Article/1626155/Fastest_F1_street_circuit_being_readied_in_Jeddah
4. Designers proud of Jeddah F1 circuit — Arab News, 17 Mar 2023, applies to 2021–23. https://www.arabnews.com/node/2270566
5. RaceFans article quoting Martin Whitaker on temporary facility — RaceFans, 25 Mar 2022, applies to 2022+. https://www.racefans.net/?p=474992
6. Where to watch the action at the Saudi Arabian GP — F1 Experiences, undated (2022+), applies to 2022+. https://f1experiences.com/blog/where-to-watch-the-action-at-the-saudi-arabian-gp
7. Jeddah street circuit targets other racing after F1 stint — The Race, 1 Aug 2021, applies to 2021. https://www.the-race.com/formula-1/jeddah-street-circuit-targets-other-racing-after-f1-stint
8. Visit the World's Tallest Fountain — TravelPulse, undated. https://www.travelpulse.com/voices/blogs/visit-the-worlds-tallest-fountain
9. On track: Local media check progress of Saudi F1 street circuit site — Arab News, Jul 2021. https://www.arabnews.pk/node/1889871/sport

---

## Miami International Autodrome (Miami Gardens)

**Status for modelling:** Well sourced: the pit building and garages are permanent (built 2021–22). A permanent three-storey Paddock Club was built on top of the garages in 2023, with a rooftop club, and the team hospitality "Team Village" has been inside Hard Rock Stadium since 2023. Not sourced: length, height, facade materials and colours. Brief correction: the pit/garage building is not temporary.

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | ~280 m (OSM way 1017340353 "Paddock/Garage", 279 × 54 m extent) | estimate (OSM footprint) | [9] |
| Garages | HOK: "37 race-weekend team garages" (become member car storage off-season). 2027 extension adds "expanded race team garages" | confirmed (HOK) | [3] |
| Storeys / height | Garage level, then a three-storey Paddock Club "constructed above the team garages", then a rooftop club. Height ~18–22 m (estimate: 1 garage level ~5 m + 3 club levels ~4.5 m each + rooftop parapet; no published height) | storeys confirmed; height estimate | [1][2][3] |
| Roof | Usable flat rooftop ("luxury rooftop club"); the 2027 extension also gets a rooftop terrace | confirmed (rooftop use); shape estimate (flat) | [1][3][4] |
| Pit-lane facade | not found (garages face the pit lane; Paddock Club tiers overlook the pit lane and start/finish straight) | confirmed (orientation only) | [1][2] |
| Paddock-side facade | not found. HOK: main entry marked by "a four-storey decorative element" | confirmed (entry element only) | [3] |
| Notable features | Paddock Club, 190,000 sq ft (~17,650 m²) for 6,000+ guests (2023). Race Control Tower is a permanent structure (2022). 2027: 115,000 sq ft three-storey extension "stretching from the start/finish straight toward Turn 1", with tiered seating and a rooftop; total ~305,000 sq ft, ~9,200 guests. Design by ROSSETTI (now HOK); interiors by Rockwell Group | confirmed | [1][2][3][4][5] |
| Permanent / built / renovated | Permanent pit building, garages and race control tower. Pit Building foundations started 1 Sep 2021. 2022 hospitality was a temporary buildout. Permanent Paddock Club added 2023. Extension due for the 2027 race | confirmed | [3][6] |
| Paddock (team buildings / hospitality) | Since 2023, the "Team Village" with all ten teams' hospitality units has stood on the Miami Dolphins football field inside Hard Rock Stadium. Fans in the stadium's 300 level look down into it. This freed space in the original paddock behind the garages | confirmed (2023 announcement) | [1][2] |
| Paddock street layout | not found (the unit layout on the pitch is undocumented) | — | — |
| Landmark 1 | Hard Rock Stadium shade canopy: 14 acres (~5.7 ha), >17,000 t, on 8 concrete super-columns. Four corner masts ~350 ft (~107 m) tall (AECOM Hunt gives 357 ft). Outer sideline trusses 450 ft (~137 m), end-zone trusses 350 ft (~107 m). Renovation by HOK, engineering by Thornton Tomasetti, 2015–16 | confirmed | [7][8] |
| Landmark 2 | not found | — | — |

Notes: [1] and [2] are pre-event announcements (18 Jan 2023), while HOK [3] describes the building as built. "Three-tiered" [1][2] and "three-story" [3] refer to the club levels above the garages. Whether the rooftop club is a fourth level is not stated, so model it as garages + 3 + roof deck. The 2027 extension is announced but not yet built (as of 2026-10-17), so it should not be modelled for 2026.

Sources (accessed 2026-10-17):
1. Track to be resurfaced and paddock moved inside Hard Rock Stadium for 2023 Miami GP — Formula1.com, 18 Jan 2023, applies to 2023+. https://www.formula1.com/en/latest/article.track-to-be-resurfaced-and-paddock-moved-inside-hard-rock-stadium-for-2023.1Oei1J5s4KM2IDWY1YhTdC.html
2. Formula 1 Crypto.com Miami Grand Prix announces significant campus upgrades ahead of 2023 race — Miami GP (official), 18 Jan 2023, applies to 2023+. https://f1miamigp.com/news/press-release/formula-1-crypto-com-miami-grand-prix-announces-significant-campus-upgrades-ahead-of-2023-race/
3. Formula 1 Crypto.com Miami Grand Prix (project page) — HOK, undated (mentions 2026 announcement), applies to 2022–2027. https://www.hok.com/projects/view/formula-1-crypto-com-miami-grand-prix/
4. Miami to expand Paddock Club hospitality with new extension overlooking Turn 1 — AutoRacing1, May 2026, applies to 2027+. https://www.autoracing1.com/pl/492014/miami-to-expand-paddock-club-hospitality-with-spectacular-new-extension-overlooking-turn-1/
5. Formula 1 Miami Grand Prix Paddock Club (interiors) — Rockwell Group, undated (fetch blocked, 403; known only from the search snippet), applies to 2023+. https://www.rockwellgroup.com/index.php/projects/formula-1-miami-grand-prix-paddock-club
6. Miami International Autodrome nearing completion ahead of Formula 1 Crypto.com Miami Grand Prix 2022 — Miami GP media site, early 2022 (page timestamp 2023-04-04), applies to 2022+. https://media.f1miamigp.com/?p=5238
7. Hard Rock Stadium — STRUCTURE magazine, undated (describes 2016 works), applies to 2016+. https://www.structuremag.org/article/hard-rock-stadium/
8. Hard Rock Stadium renovations roof addition (AECOM Hunt) — The Blue Book, undated, applies to 2016+. https://thebluebook.com/iProView/1477351/aecom-hunt/general-contractors/construction-projects/hard-rock-stadium-renovations-roof-addition-396849
9. OpenStreetMap way 1017340353 "Paddock/Garage" — OSM contributors, data as of 2026-10-17. https://www.openstreetmap.org/way/1017340353

## Circuit Gilles Villeneuve (Montréal)

**Status for modelling:** Very well sourced. The "Espace Paddock" by Les Architectes FABG, opened in May 2019, is three storeys: garages on level 1, two levels of loges covered by a roof but open-sided, a wood roof structure with a white membrane, a glass curtain wall, and the podium on the 2nd storey. Not sourced: a published length or height (OSM gives ~330 m).

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | ~330 m (OSM way 42229671 "Paddocks", 331 m long; the polygon's 48 m width includes rear projections, the main bar is ~20–25 m) | estimate (OSM footprint) | [8] |
| Garages | Up to 13 teams. Each team has 2 front entrances (cars/drivers/crew) and 1 rear service entrance. No permanent partitions: the garage zone is modular, divided by temporary partitions each GP | confirmed | [1][2] |
| Storeys / height | 3 storeys. Level 1: team garages, control tower, staff offices, plus hospitality at the back. Level 2: loges, control tower, podium, media. Level 3: loges and terrace(s). Height ~15–17 m (estimate: 3 storeys at ~4.5 m plus roof structure; not published) | storeys confirmed; height estimate | [1][2][3][4] |
| Roof | Wood structure (glulam/CLT, 1,425 m³ of wood) with a ceiling grid of triangular geometry recalling Expo 67 (Biosphere / Canada Pavilion). White elastomeric membrane with white granules, 64 m² of PV panels. The roof extends over the first row of the loge grandstands. Loges are "covered by a roof but open on the sides" (no exterior walls) | confirmed | [1][2][4][5] |
| Pit-lane facade | Ground floor: garage openings, 2 per team. Above: two levels of open-sided loges with three rows of permanent grandstand seating, glass railings, and four wide screens mounted above the garages during the race. Glass: clear-anodised aluminium curtain wall (Unicel VISION800S), 32,500 sq ft (~3,020 m²) including skylights and glass railings. Saint-Gobain gives 3,600 m² of COOL-LITE glass | confirmed (materials); exact distribution between faces estimate | [1][3][6] |
| Paddock-side facade | Rear service entrance per team. Precast concrete panels (Shockbéton/SARAMAC), steel frame with Y-shaped steel members (Expo 67 logo motif), curtain walls. Panoramic glass elevator at the East entrance, F1-car-sized freight elevator at the south end, public artwork in the glass of the North entrance (2020). The Olympic Basin is directly behind | confirmed | [1][2][4][7] |
| Notable features | The race control tower is "horizontal" over two storeys within the building (not a raised tower). The media centre is integrated. The podium is on the 2nd storey. Several terraces (incl. a green-roof terrace), loge capacity 5,000 (was 1,800) | confirmed | [1][2][7] |
| Permanent / built / renovated | Permanent. Replaced the 1988 paddock building; demolition started 3 Jul 2018, inaugurated 15 May 2019, first used at the June 2019 GP. Built in 10 months from prefabricated parts. Contractor Groupe Geyser, engineer CIMA+. Cost ~C$59–60 M (C$41 M City of Montréal + C$18 M Québec) | confirmed | [1][2][7] |
| Paddock (team buildings / hospitality) | Each garage has a "completely rethought hospitality section" at the back, with a rear service entrance "for quick access to the hospitality area". The sources do not say whether teams also bring motorhomes | confirmed (in-building hospitality only) | [1][2] |
| Paddock street layout | not found | — | — |
| Landmark 1 | Casino de Montréal (former France and Québec Pavilions of Expo 67), named in the official view description. Dimensions not found | confirmed (named); dims not found | [1] |
| Landmark 2 | Olympic Basin (rowing basin) directly behind the paddock building; downtown Montréal skyline and Mount Royal in the distance. Dimensions not found | confirmed (named) | [1][7] |

Notes: An early budget of C$48 M (2017) [7] rose to ~C$59 M (2018–19) [2]. Wikipedia lists a roof "area" of 1,425 m², but the primary source [2] says 1,425 m³ of wood, so the Wikipedia figure is a unit error. Wikipedia (pointer only) also gives terrace areas: level 2 covered 3,217 m², level 3 covered 5,075 m², open green-roof terrace 485 m². These are cited to the Parc Jean-Drapeau French page, which I did not verify.

Sources (accessed 2026-10-17):
1. Espace Paddock — Société du parc Jean-Drapeau (official), undated (post-2020), applies to 2019+. https://www.parcjeandrapeau.com/en/major-projects/espace-paddock-circuit-gilles-villeneuve-montreal/
2. Inauguration of the new paddocks at Circuit Gilles-Villeneuve (press release) — Société du parc Jean-Drapeau, 15 May 2019, applies to 2019+. https://www.parcjeandrapeau.com/files/publications/communique_paddocks_an_final_erratum.pdf
3. Unicel supplies massive curtain wall for Canadian Grand Prix — Glass Canada, 28 Jun 2019, applies to 2019+. https://www.glasscanadamag.com/unicel-supplies-massive-32500-sq-ft-curtain-wall-for-canadian-grand-prix-4935/
4. Canada F1 Grand Prix New Paddock, Montréal — e-architect, updated 1 Nov 2025 (project data from FABG; commissioning May 2019), applies to 2019+. https://www.e-architect.com/montreal/canada-f1-grand-prix-montreal
5. New Paddock F1 Grand Prix du Canada (2018 Award of Excellence) — Canadian Architect, Dec 2018 (fetch blocked, 403; known only from the search snippet), applies to 2019+. https://www.canadianarchitect.com/new-paddock-f1-grand-prix-du-canada/
6. New F1 paddocks – Grand Prix of Canada (case study) — Saint-Gobain, undated, applies to 2019+. https://www.saint-gobain.co.uk/case-study/new-f1-paddocks-grand-prix-canada
7. Start of renovations to the paddocks at Circuit Gilles-Villeneuve (3 Jul 2018) and Renovation of Circuit Gilles-Villeneuve paddocks (14 Dec 2017), press releases — Société du parc Jean-Drapeau, applies to 2019+. https://www.parcjeandrapeau.com/files/publications/start_of_renovations_to_the_paddocks_at_circuit_gilles_villeneuve.pdf and https://www.parcjeandrapeau.com/files/publications/communique_en_final.pdf
8. OpenStreetMap way 42229671 "Paddocks" — OSM contributors, data as of 2026-10-17. https://www.openstreetmap.org/way/42229671

## Circuit de Monaco (Monte Carlo)

**Status for modelling:** The layout is well sourced. The pit building is temporary and sits between the start/finish straight (Bd Albert 1er) and the pit lane, which runs along the harbour side. Garages are about half the usual width, with the pit stand upstairs. The building had 2 storeys for years and gained a 3rd by 2021, with top-deck balconies. The F1 paddock is separate, on Quai Antoine 1er. Not sourced: length, height, facade and roof.

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | ~210 m (OSM way 1029383901 "Emplacement bâtiment pit lane", 209 × 23 m, i.e. the site of the temporary pit building). Pit lane "Voie des stands" in OSM ~350 m | estimate (OSM site outline) | [8] |
| Garages | One per team (B1M: 12 teams × ~450 m² each over three floors, 2021). Garage width "about half the size of the roomier units on the F1 calendar". 2002 plan for the post-2004 pits: each garage 15 m long × 10 m deep, with 15 × 5 m first-floor offices behind | confirmed (B1M/Red Bull); 2002 numbers were a plan only | [1][2][4] |
| Storeys / height | 3 floors (from ~2018–21; previously 2). Ground floor: car bays and only the essentials. 1st floor: spares, data racks, comms, and the team pit stand. Top deck: balconies (VVIP viewing and storage). Height ~11–13 m (estimate: 3 floors × ~3.5–4 m plus parapet; not published) | storeys confirmed; height estimate | [1][2][3] |
| Roof | not found (presumably flat on a modular structure) | estimate | — |
| Pit-lane facade | Garages face the pit lane on the harbour side, looking over the Swimming Pool exit and the approach to Rascasse. Materials and colours not found. The modules are prefabricated: 120 sections craned in and assembled in ~14 days | confirmed (orientation, construction); facade not found | [1][2] |
| Paddock-side facade | The back of the building faces the start/finish straight, so the team pit stand (with track view) is "built inside, directly above the garage". Red Bull notes holes cut in the upper floors for tree branches | confirmed | [2][3] |
| Notable features | No genuine pit wall: the pit stand is inside the building, upstairs (Horner 2016: "the pit wall is upstairs and the garage is downstairs"; Toyota 2008: engineers "in the building above the pit garage"). Opposite: three-tier grandstands that have overlooked the pit area since 2004, with hospitality units 13 m above ground on top | confirmed | [2][3][5][6] |
| Permanent / built / renovated | Temporary, rebuilt every year. Temporary works start ~6 weeks before the race (in 2024 circuit construction began 19 Feb). The current pit site dates from the 2004 harbour/promenade widening. ACM said in 2017 a new two-storey pit building was planned for 2018; a third storey was "recently added" by 2021 | confirmed | [1][2][4][7] |
| Paddock (team buildings / hospitality) | F1 paddock on Quai Antoine 1er (harbourside, a short walk south of Rascasse), "entirely divorced from the garages and pit lane" and fenced. Team trucks park in car parks up to ~15 km away. Red Bull's Energy Station floats: an ~800 t barge structure built in Imperia over ~3 weeks, towed (two sections, ~6 h) and moored next to the paddock. It was in the regular paddock in 2021 and was planned to return afloat for 2022. F2 is in the Chemin des Pêcheurs car park | confirmed | [2][7] |
| Paddock street layout | Single quay-side strip along Quai Antoine 1er; the order of units was not found | confirmed (location only) | [2][7] |
| Landmark 1 | Port Hercule harbour (yachts) next to the pit lane, with the Rocher / Prince's Palace across the harbour. Dimensions not found | estimate (well known; no dimensions source) | — |
| Landmark 2 | Three-tier grandstands opposite the pits (since 2004) on 36 concrete supports, with hospitality units at +13 m | confirmed | [6] |

Notes: Storey-count conflict: ACM (2017) said two storeys [4]. GPDestinations (2024) still says "split into two storeys" [7]. B1M (2021) and Red Bull (2021) say three [1][2]. Model three: two is likely the older or garage-only description. The brief's Williams 2023 quote could not be re-found; Red Bull 2021 [2] states the same layout. The ACM +13 m figure [6] comes from a Historic GP edition page (2016–17) and refers to the grandstand structure opposite, not the pit building.

Sources (accessed 2026-10-17):
1. The country that becomes a racetrack — The B1M, 19 May 2021, applies to ~2021. https://www.theb1m.com/video/the-country-that-becomes-a-racetrack
2. Bulls' Guide To: Monaco — Red Bull Racing, 21 May 2021, applies to 2021 (third storey "recently added"). https://www.redbullracing.com/int-en/bulls-guide-to-monaco
3. Horner: The pit wall is upstairs and the garage is downstairs — GrandPrix247, 31 May 2016, applies to 2016. https://www.grandprix247.com/formula-1-news/horner-the-pit-wall-is-upstairs-and-the-garage-is-downstairs
4. Monaco announces new pits by 2006 (22 May 2002) and Monaco to build new F1 pits for 2018 (5 Jun 2017) — GrandPrix.com, applies to 2004+ (plan) and 2018+. https://www.grandprix.com/news/monaco-announces-new-pits-by-2006.html and https://www.grandprix.com/news/monaco-to-build-new-f1-pits-for-2018.html
5. Grand Prix of Monaco preview (tech) — Toyota F1 archive, 2008, applies to 2008. https://toyotagazooracing.com/archive/ms/public/en/gp2008/06_monaco/preview_tech.html
6. Grand Prix de Monaco Historique edition page — Automobile Club de Monaco, 2017, applies to 2004+. https://acm.mc/en/wp-json/wp/v2/editions/6116
7. Monaco Grand Prix: The logistics behind F1's iconic race — GPDestinations, 23 May 2024, applies to 2024. https://gpdestinations.com/monaco-grand-prix-f1-logistics/
8. OpenStreetMap ways 1029383901 "Emplacement bâtiment pit lane" and 850261588 "Voie des stands" — OSM contributors, data as of 2026-10-17. https://www.openstreetmap.org/way/1029383901

## Circuit de Barcelona-Catalunya (Montmeló)

**Status for modelling:** Weakly sourced. Confirmed: the "long pit building along the main straight" houses the Paddock Club. The garages got motorised sectional doors with transparent top panels (2020), and wider mechanised doors on the paddock side (2022). In 2023–24 the pit-building terrace was given a new roof, and the control tower, press room and hospitality areas were refurbished. Not sourced: storey count, height, garage count, facade colours and podium position.

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | ~300 m (OSM way 33742578 "Boxes", 307 m long; the 101 m width is an irregular-outline artefact) | estimate (OSM footprint) | [9] |
| Garages | 40 pit boxes, each 6 × 8 m (third-party track-rental site, unverified). Official rental page: garages supplied "according to fee" | estimate (unofficial source) | [6] |
| Storeys / height | not found. The pit-building terrace (top level) was remodelled with a new roof (2024). Height not published | not found | [4] |
| Roof | The terrace on top of the pit building got a new roof (cubierta) in 2023–24 works. Shape and materials not found | confirmed (exists); shape not found | [4][5] |
| Pit-lane facade | Garage fronts replaced in 2020: automatic motorised sectional doors with a built-in pedestrian door and a transparent upper fanlight. New pit-lane fence and new debris-fence panels on the pit wall (Geobrugg, 2022, including special panels for the sliding gate and podium). Colours not found | confirmed | [2][3][8] |
| Paddock-side facade | Inner (paddock-side) garage doors replaced in 2022 with mechanised doors "slightly wider than the previous ones". The paddock surface was re-paved with new drainage (2022). The towers' toilets were refurbished in 2021 | confirmed | [3] |
| Notable features | Paddock Club is "located in the pit building", with views of the whole pit lane (2023 catalogue). The control tower was fully refurbished (2024), along with the briefing room, press room and stewards/timing offices. Hospitality/corporate areas were "enlarged and modernised" for 2023. Podium position: not found (the Main Grandstand hospitality brochure says the podium ceremony is visible from it) | confirmed / podium not found | [1][4][5][7] |
| Permanent / built / renovated | Permanent; circuit opened Sep 1991. €50 M modernisation plan from 2022, with completion of all works planned for 2026 | confirmed | [4][5] |
| Paddock (team buildings / hospitality) | not found (the sources mention only "renovated paddock facilities" for 2023 and the VIP Rooftop walkway that has linked the paddock to the Stadium section since June 2024) | — | [1][5] |
| Paddock street layout | not found | — | — |
| Landmark 1 | Main Grandstand (Tribuna Principal), opposite the pits, covered, with at least 3 floors of suites/lounges (1st-floor suites with sloping windows, 3rd-floor Sky View Lounge). OSM "Graderia principal" ~290 × 46 m. Published dimensions not found | floors confirmed; length estimate (OSM) | [7][9] |
| Landmark 2 | VIP grandstand canopy (Sorigué, 2024): rectangular, 57.10 m × 18.77 m, 300 t, metal porticos with sandwich/TPO panels, on an existing 65 m-diameter concrete frame. Its exact position relative to the main straight is not stated (likely the Stadium-section VIP stand, not visible from the main straight) | confirmed (dims); location estimate | [10] |

Notes: The F1 "Spanish GP" moved to Madrid in 2026, but Barcelona still holds an F1 race (the "Barcelona-Catalunya GP") in 2026. The works are reported as phased to 2026, so the 2025–26 state may differ from 2023 photos. GPFans (Feb 2024) and SI mention a "new pit complex and Paddock Club terrace" in the €50 M plan. The SI article returned 410 Gone, and neither source gives specifics. The 40-garage figure is from an unofficial site; check it against an aerial photo before using it.

Sources (accessed 2026-10-17):
1. Circuit de Barcelona-Catalunya to feature new configuration for 2023 Spanish GP — Formula1.com, 27 Feb 2023, applies to 2023+. https://www.formula1.com/en/latest/article/circuit-de-barcelona-catalunya-to-feature-new-configuration-for-2023-spanish.6ZQgemg7eOlAJbBtu56PHE
2. Circuit carries out complete renovation of the pit garage doors — Circuit de Barcelona-Catalunya (official), 31 Jan 2020, applies to 2020+. https://www.circuitcat.com/en/news/circuit/circuit-carries-out-complete-renovation-of-the-pit-garage-doors/
3. The Circuit carries out significant improvements to its facilities — Circuit de Barcelona-Catalunya (official), 9 Feb 2022, applies to 2022+. https://www.circuitcat.com/en/news/circuit/the-circuit-carries-out-significant-improvements-to-its-facilities/
4. El Circuit se reinventa para ser un referente mundial — The New Barcelona Post, 12 Jun 2024, applies to 2024+. https://www.thenewbarcelonapost.com/el-circuit-se-reinventa-para-ser-un-referente-mundial/
5. Plan de remodelación del Circuit de Barcelona-Catalunya — F4 Spain, 10 Apr 2024, applies to 2024–26. https://f4spain.org/2024/04/10/plan-de-remodelacion-del-circuit-de-barcelona-catalunya/
6. Circuit de Barcelona-Catalunya track profile — trackrat.wpprovider.nl (unofficial), undated, season unclear. https://trackrat.wpprovider.nl/?p=62
7. Hospitality catalogue, Season 2023 — Circuit de Barcelona-Catalunya (official PDF), 2023, applies to 2023. https://www.circuitcat.com/wp-content/uploads/2023/03/Cataleg-hospitality-2023_ANG.pdf
8. Circuit de Barcelona-Catalunya 2022 (debris fence project) — Geobrugg, 2022, applies to 2022+. https://www.geobrugg.com/en/Circuit-de-Barcelona-Catalunya-2022-195981.html
9. OpenStreetMap ways 33742578 "Boxes" and 33742643 "Graderia principal" — OSM contributors, data as of 2026-10-17. https://www.openstreetmap.org/way/33742578
10. Sorigué builds roof for Circuit de Barcelona-Catalunya — Sorigué, 9 Jul 2024, applies to 2024+. https://www.sorigue.com/en/press-room/news/sorigue-builds-roof-circuit-de-barcelona-catalunya

---

## Madring (Madrid)

**Status for modelling:** The new Pit Building is sourced for storeys (3), max height (18.5 m), garage count (14 modular: 11 teams + 3 FIA), Paddock Club on the upper floors with terraces, and its permanent link to IFEMA Halls 1–2. Its length, facade, roof and colours were not found. The garage row is split by a gap of about 100–150 m (media/TV pen) inside the IFEMA complex, so a single generic box would be wrong.

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | not found. Pit lane between the speed-limiter lines is 562 m (official figure quoted by The Race). Main straight 523 m. | confirmed (pit lane / straight only) | [3][4] |
| Garages | 14 modular garages on the ground floor: 11 for teams, 3 for the FIA. Garage row split by a gap of more than 100 m (RacingNews365) / about 150 m (The Race) between Williams and Racing Bulls, where the media/TV pen sits. | confirmed | [1][3][5] |
| Storeys / height | 3 floors, max height 18.5 m (about 6.2 m per storey on average) | confirmed (per-storey figure is arithmetic) | [1] |
| Roof | not found | — | — |
| Pit-lane facade | not found. Upper levels have "panoramic terraces overlooking the pit lane and track". | confirmed (terraces only) | [1] |
| Paddock-side facade | not found. The building connects directly to the existing IFEMA halls through internal links, stairways and lifts. | confirmed (connection only) | [1] |
| Notable features | Paddock Club on the upper levels (indoor lounges, premium hospitality, terraces). 3,500 Paddock Club places (sold out, 2026). Podium in front of IFEMA's central building, under the fair logo. Media/TV pen sits in the gap in the garage row. | confirmed | [1][4][6][3] |
| Permanent / built / renovated | Permanent. Built 2025–26 by Eiffage Construcción (construction started by Dec 2025; Eiffage/Acciona hold the design-and-build contract). After race weekends it serves the IFEMA Convention South area and Halls 1–2. Other temporary circuit structures are taken down after the race. Architect of the pit building not found. Teresa Sapey is named (single marketing article) as designer of the paddock spaces' interiors. | confirmed (architect for interiors only, weak) | [1][7][6][8] |
| Paddock (team buildings / hospitality) | Paddock and pit facilities are inside IFEMA Halls 1 and 2: garages, technical offices, logistics and hospitality are in covered, air-conditioned halls. The Race (2026) says some teams were in air-conditioned buildings while McLaren and Mercedes were "outside in the heat". Trucks and engineering offices sit behind the garages, and hospitality units have a separate area. Hospitality capacity is 15,000. | confirmed | [6][3] |
| Paddock street layout | not found as a plan. Described only as trucks/offices behind the garages and a separate hospitality zone. | confirmed (description only) | [3] |
| Landmark 1 | IFEMA central building (podium in front of it, under the IFEMA logo). A 1992 article describes the central pavilion as square in plan, with a circular central patio and a double glass facade. No dimensions found. | confirmed (form); dims not found | [4][9] |
| Landmark 2 | IFEMA exhibition Halls 1 and 2 (they house the paddock). No dimensions found. | confirmed (role) | [6] |

Notes: The 18.5 m / 3-floor / 14-garage figures come from a Dec 2025 pre-construction press release, so the as-built (Sept 2026) layout may differ. It is unclear from the sources whether all 14 garages are in the new building or the row continues into the existing halls. The 100–150 m split suggests two garage blocks. The two reports give different gap sizes (>100 m vs ~150 m). Motorsport Magazine (Sept 2026) calls the split "structural" and says it cannot be redrawn before 2027. Organisers have suggested the pit lane will be "improved next year".

Sources (accessed 2026-10-17):
1. Pit Building & Paddock Club press release — MADRING (official), 2025-12-17, applies to 2026. https://www.madring.com/en/press-releases/pit-building-paddock-club
2. An F1 circuit of two halves: What Madring can and can't easily fix — Motorsport Magazine, 2026-09-15, applies to 2026. https://www.motorsportmagazine.com/articles/single-seaters/f1/an-f1-circuit-of-two-halves-what-madring-can-and-cant-easily-fix/
3. Five first impressions of F1's new Madring circuit — The Race (Jon Noble), 2026-09-10, applies to 2026. https://www.the-race.com/formula-1/five-first-impressions-of-f1-new-madring-circuit/
4. Madring a Madrid: aggiornamenti sui lavori, asfalto e strutture — Motori Magazine, 2026-05-11, applies to 2026. https://www.motorimagazine.it/madring-a-madrid-aggiornamenti-sui-lavori-asfalto-e-strutture/
5. Five things you must know about the new Madring F1 circuit — RacingNews365, 2026-09-11, applies to 2026. https://racingnews365.com/five-things-you-must-know-about-the-new-madring-f1-circuit
6. Madrid sorprende a la Fórmula 1 ... paddock único en el mundo — ESdiario, 2026-09-10, applies to 2026. https://www.esdiario.com/deportes/260910/197408/madrid-sorprende-formula-1-organizacion-impecable-paddock-unico-mundo_amp.html
7. Eiffage Construcción F1 Madrid circuit press release (PDF) — Eiffage, 2025-04-22, applies to 2026. https://ppd-app.eiffage.com/system/files/communiques_presse/cp_eiffage_construccion_circuit_f1_madrid_20250422docx.pdf (not opened directly; contents via search summary)
8. El diseño español toma el paddock de MADRING — Marketing Directo, undated (2026), applies to 2026. https://www.marketingdirecto.com/anunciantes-general/diseno-espanol-toma-paddock-madring-mano-foro-marcas-renombradas
9. The central pavilion in the IFEMA fairground, Madrid — Informes de la Construcción (CSIC), 1992, building history. https://informesdelaconstruccion.revistas.csic.es/index.php/informesdelaconstruccion/article/view/1348 (fetch failed on a TLS error; contents via search snippet)

## Baku City Circuit (Baku)

**Status for modelling:** Location is well sourced: the pit/paddock complex is on Neftchilar Avenue directly in front of Government House, and it is temporary, assembled every year. The building was described as two-storey in 2016 with the Paddock Club above the garages. Length, garage count, roof and facade were not found.

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | not found. A Turkish report (via search snippet only, page not loadable) mentions a "300-metre pit area". Not verified. | unverified | [6] |
| Garages | not found | — | — |
| Storeys / height | 2 storeys ("two-story Pit Lane building", 2016). Height estimate about 8–10 m (2 storeys x ~4–5 m, a typical temporary-modular figure, not measured). | storeys confirmed (2016); height estimate | [3] |
| Roof | not found | — | — |
| Pit-lane facade | not found | — | — |
| Paddock-side facade | not found | — | — |
| Notable features | F1 Paddock Club on the main straight "above the F1 Team Garages", with views of grid and pit lane. Absheron grandstand (covered) overlooks the pit lane, finish line and Turn 1. Champions Club grandstand faces the main straight / pit entry. FIA, FOM, BCC and team on-site offices were built with the pit building (2016). | confirmed | [4][5] |
| Permanent / built / renovated | Temporary. The BCC CEO said all buildings and grandstands are temporary. The paddock is "reconstructed" every year (e.g. works began 6 March 2025 for the Sept 2025 race; 2022 paddock installation from 18 April). First built in 2016. | confirmed | [1][2][7][5] |
| Paddock (team buildings / hospitality) | The paddock is set up each year on Neftchilar Avenue in front of Government House. No detail found on team hospitality types. | confirmed (location only) | [2] |
| Paddock street layout | not found. Paddock occupies Neftchilar Avenue / the area in front of Government House. The pit straight runs along Neftchilar Avenue toward Government House. | confirmed (location only) | [2][8] |
| Landmark 1 | Government House (Dom Soviet), directly behind the paddock. Architects Lev Rudnev and V. Munts, built 1936–52, local limestone. Facade length about 200 m (single blog-style source). Storeys not confirmed. | architects/dates confirmed (Wikipedia secondary); 200 m unverified | [9][10] |
| Landmark 2 | Old City (Icherisheher) walls, at the T8–T11 narrow uphill section (7.6 m wide), not on the main straight. Wall height not found. | confirmed (location) | [3] |

Notes: The 2013 GT layout had its pits at Azadliq (Freedom) Square. Some secondary sites (racingcircuits.info) still describe that arrangement. For F1 (2016 on) the pits are in front of Government House on Neftchilar Avenue, next to Azadliq Square at the start. The "two-storey" description is from construction in 2016. No later source restates it, so treat it as an estimate for 2026.

Sources (accessed 2026-10-17):
1. Construction works continue around Baku City Circuit — Baku City Circuit (official), undated, applies to the season of publication. https://www.bakucitycircuit.com/news/construction-works-continue-around-baku-city-circuit (search snippet)
2. Paddock construction begins for F1 Azerbaijan Grand Prix 2025 — Report.az, 2025-03-06, applies to 2025. https://report.az/en/formula-1/paddock-construction-begins-for-f1-azerbaijan-grand-prix-2025
3. Alonso track-walk report (two-story pit lane building in front of Government Building) — Motori No Limits / F1Technical, 2016, applies to 2016. https://motorinolimits.com/?p=100415 ; https://f1technical.net/news/20373 (403; quote via search snippet)
4. Where to watch the action at the Azerbaijan GP — F1 Experiences (official F1 hospitality seller), undated (© 2026), applies to 2026. https://f1experiences.com/blog/where-to-watch-the-action-at-the-azerbaijan-gp
5. Whiting: Standards of Baku circuit are absolutely superb — GrandPrix247, 2016-06, applies to 2016. https://www.grandprix247.com/formula-1-news/whiting-standards-of-baku-built-are-absolutely-superb (fetch failed; quote via search snippet)
6. Bakü Formula 1'e hazırlanıyor — Sporx, undated (c. 2016), applies to 2016. https://www.sporx.com/baku-formula-1e-hazirlaniyor-SXHBQ549276SXQ (fetch failed; snippet only)
7. Construction work for the Formula 1 Azerbaijan Grand Prix 2022 commences — Baku City Circuit, 2022, applies to 2022. https://www.bakucitycircuit.com/news/construction-work-for-the-formula-1-azerbaijan-grand-prix-2022-commences
8. Baku City Circuit — Wikipedia (secondary), undated. https://en.wikipedia.org/wiki/Baku_City_Circuit
9. Government House, Baku — Wikipedia (secondary), undated. https://en.wikipedia.org/wiki/Government_House,_Baku
10. 15 iconic buildings in Baku — Parametric Architecture, undated. https://parametric-architecture.com/15-iconic-buildings-in-baku/

## Spa-Francorchamps (Stavelot / Francorchamps)

**Status for modelling:** The 2007 pit building is confirmed: new build, double-storey, 36 garages, architects Acte1 + bureau d'architecture Greisch, with podium, stewards, commentator rooms and a restaurant in the complex. Its length, roof and facade were not found. The 2021–22 works did not rebuild the F1 pit building. They were grandstands, run-off areas and a refit of the "red paddock".

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | not found | — | — |
| Garages | 36 garages ("new paddocks ... with 12 stands and 36 garages") | confirmed | [1] |
| Storeys / height | double-storey ("spacious double-storey and modern-looking pit buildings", May 2007). Height estimate about 9–11 m (2 storeys x ~4.5–5 m for a garage level plus an upper floor). | storeys confirmed; height estimate | [2] |
| Roof | not found | — | — |
| Pit-lane facade | not found | — | — |
| Paddock-side facade | not found | — | — |
| Notable features | Buildings in the complex hold commentator rooms, podium, stewards, reception and a restaurant. The project also had a 3-level car park (250 cars, 36 trucks), access tunnels, new covered fixed grandstands, and terracing opposite the pits for viewing. | confirmed | [1][3] |
| Permanent / built / renovated | Permanent. Built Nov 2006 – May 2007 for the 2007 Belgian GP. Client: Intercommunale du circuit de Spa-Francorchamps. Architects Acte1 and bureau d'architecture Greisch. Cost €19 m excl. VAT (Greisch). Other reports give ~$80 m (News24) or €8.85 m (Motormarques). The pit lane became straight, with entry inside the Bus Stop chicane and La Source moved ~100 m north. The 2021–22 works (~€25 m phase 1) covered grandstands and safety, not the F1 pit building. | confirmed | [1][2][4][5][6] |
| Paddock (team buildings / hospitality) | 2007: "new paddocks to the latest FIA standards". 2021: the "red Paddock" area was renovated, part of it lowered by one floor. No source found on F1 team motorhome vs permanent hospitality. | confirmed (limited) | [1][7] |
| Paddock street layout | not found | — | — |
| Landmark 1 | Raidillon grandstand at the top of Raidillon, 4,555 seats, built winter 2021–22 by Wust (BESIX). Dimensions not published. It replaced the old chalet above Eau Rouge. | confirmed (seats); dims not found | [8][9] |
| Landmark 2 | La Source hairpin with grandstands opposite the pits (terraced in 2007). The old pit grandstand opposite the "old pit lane" was demolished and replaced (2021–22). Dimensions not found. | confirmed (existence) | [3][9] |

Notes: The cost figures conflict; I treat the €19 m from Greisch (the engineer) as the most reliable. Spa has had a second pit lane (the "old pits", used for endurance racing) since 2022. Don't confuse it with the 2007 F1 pit building on the straight between the Bus Stop and La Source. A later paddock redevelopment (~€40 m over 5 years, "some buildings will be demolished or renovated to create more space for the paddock") appears only in a search summary. I could not verify it or tie it to a season, so don't model it.

Sources (accessed 2026-10-17):
1. F1 race track of Spa-Francorchamps — Greisch (engineer, project page), undated, applies to 2007 onward. https://www.greisch.com/?p=128858
2. Work continues at new Spa — News24 Wheels, 2007-05-02, applies to 2007 onward. https://www.news24.com/wheels/work-continues-at-new-spa-20070502 (403; quote via search snippet)
3. Work pushes on at Spa — GrandPrix.com, 2007-04-20, applies to 2007. https://www.grandprix.com/news/work-pushes-on-at-spa.html (429; quote via search snippet)
4. The new Spa — GrandPrix.com, 2007-03-16, applies to 2007. https://grandprix.com/news/the-new-spa.html
5. Spa 2007 — Motormarques, 2007-11-04, applies to 2007. https://www.motormarques.com/news/european-desk/item/222-spa-2007 (snippet)
6. History of the circuit Spa-Francorchamps — Belgian GP (official), undated, applies to 2007 onward. https://www.belgium.gp/en/history-of-the-circuit-spa-francorchamps
7. Renovation work on the Circuit's infrastructure have started — Circuit de Spa-Francorchamps (official), 2021-04-02, applies to 2022 onward. https://www.spa-francorchamps.be/en/news/215_renovation-work-on-the-circuits-infrastructure-have-started
8. Wust delivers a new grandstand for the Spa-Francorchamps circuit — BESIX, 2022, applies to 2022 onward. https://besix.storychief.io/wust-delivers-a-new-grandstand-for-the-spa-francorchamps-circuit
9. Large-scale renovation Spa-Francorchamps started: iconic chalet demolished — GPblog, 2021-10-14, applies to 2022 onward. https://www.gpblog.com/en/news/large-scale-renovation-spa-francorchamps-started-iconic-chalet-demolished.html
10. New-look Spa-Francorchamps for 2022 revealed — RaceFans, 2022-03-22, applies to 2022 onward. https://www.racefans.net/2022/03/22/new-look-spa-francorchamps-for-2022-revealed-after-completion-of-renovation-work/

## Zandvoort (Zandvoort)

**Status for modelling:** There are two well-sourced volumes:
- (a) A 2019–20 one-storey addition on the pit-lane side, 8 m deep x 150 m long, with its roof used as a VIP stand.
- (b) A separate pit-box building at the pit-exit/Tarzan end, built 2023–24, with 6 garages and a 650-person hospitality lounge outside the race weekend.

The main pit building (built ~1998–2001) has garages, a first-floor hospitality level and a rooftop Paddock Club. Its length, height and facades were not found.

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | 2020 addition: 150 m long x 8 m wide (one storey). The main building is presumably about as long, since the addition runs along it (estimate). 2024: pit wall extended by 55 m for the new block (Geobrugg system length 76 m). | addition confirmed; main-building length estimate | [1][4] |
| Garages | not found for the main building. 2024 new building: 6 pit boxes ("ruimte voor zes teams"). A 12th F1 team garage was being installed for 2024, and garages were spaced further apart. | confirmed (6 new / 12th garage) | [3][4][5][6] |
| Storeys / height | Main building: garages + first-floor hospitality + rooftop (formerly an open terrace, converted to F1 Paddock Club for 2020), so 2 storeys + roof deck. The 2024 works "expand the second floor". Height estimate about 9–11 m to the roof deck (2 x ~4.5–5 m). 2020 addition: one storey. 2024 block: multi-floor ("floors are multifunctional"), count not found. | storeys confirmed; heights estimate | [7][5][1][6] |
| Roof | Main building: usable flat roof deck (Paddock Club, formerly open terrace). 2020 addition: flat roof used as a VIP stand, with new stairs up to the existing stand "higher up on the existing pit complex". | confirmed | [7][1] |
| Pit-lane facade | not found (the 2020 one-storey addition with its VIP-stand roof forms the pit-lane face) | confirmed (addition only) | [1] |
| Paddock-side facade | not found | — | — |
| Notable features | Permanent bars in the pits complex: Bernie's (being expanded with a rooftop terrace, 2024) and Mickey's (next to the new pit boxes, renovated 2024). Paddock Club on the roof. Only one permanent grandstand (opposite the pits, 2019). | confirmed | [7][3] |
| Permanent / built / renovated | Permanent. New pit buildings 1998, extensions finished by the following season, GP layout 2001 (secondary sources, dates conflict). 2019–20 addition by Kondor Wessels Amsterdam (VolkerWessels), with Studio Dromo (Jarno Zaffelli) responsible for the 2019–20 renovation. 2023–24 extension: built right after the 2023 GP, completed by about April 2024, planner Studio Dromo, executed by VolkerWessels. | confirmed (2019–24); 1998–2001 secondary | [1][2][3][4][5][8][9] |
| Paddock (team buildings / hospitality) | 2019–20: "brand new paddock area". Asphalt was moved to make paddock space as F1 required. Additional temporary grandstands and hospitality suites added. 2026: circuit-organisation paddock space shrank to fit the 11th team (Cadillac in the newest building). | confirmed | [1][2][7][6] |
| Paddock street layout | not found | — | — |
| Landmark 1 | Main grandstand opposite the pits (the only permanent grandstand in 2019, "considerably enlarged" for 2020). Dimensions not found. | confirmed (existence) | [7][10] |
| Landmark 2 | Tarzan corner (Turn 1) with the 2024 pit-box building at the pit exit next to it. Dimensions not found. | confirmed (location) | [4][3] |

Notes: The VolkerWessels release (Nov 2019) is the only source with hard dimensions (8 x 150 m). "Paddock Club on the inside of Turn 1" (GP Destinations 2019) describes a different, earlier hospitality site. The 2020 conversion put the F1 Paddock Club on the pit-building roof. Seasons: the 2020 race was cancelled, so the 2019–20 works first appear in 2021. The 6-garage block first appears in 2024. 2026 is Zandvoort's final F1 race under the current deal (not verified here).

Sources (accessed 2026-10-17):
1. VolkerWessels getting Circuit Zandvoort ready for Formula 1 — VolkerWessels (builder), 2019-11-29, applies to 2021 onward. https://www.volkerwessels.com/en/news/volkerwessels-getting-circuit-zandvoort-ready-formula-1
2. Architect Zandvoort: 'Circuit heeft Formule 1 niet nodig om te overleven' — NOS, 2024-12-05, applies to 2021 onward. https://nos.nl/artikel/2547119-architect-zandvoort-circuit-heeft-formule-1-niet-nodig-om-te-overleven
3. Transformation Circuit Zandvoort — Dutch GP (official), 2024-01-16, applies to 2024 onward. https://www.dutchgp.com/en/transformation-circuit-zandvoort/
4. Circuit Zandvoort Pit Lane Extension — Geobrugg (supplier), undated (2023 install), applies to 2024 onward. https://www.geobrugg.com/de/Circuit-Zandvoort-Pit-Lane-Extension-196307.html
5. F1 upgrades underway at cramped Zandvoort — GrandPrix.com, 2024-01-17, applies to 2024 onward. https://www.grandprix.com/news/f1-upgrades-underway-at-cramped-zandvoort.html
6. Waar staat het nieuwe Formule 1-team van Cadillac eigenlijk op Zandvoort — Autoblog.nl, 2026-08-19, applies to 2026. https://www.autoblog.nl/nieuws/waar-staat-het-nieuwe-formule-1-team-van-cadillac-eigenlijk-op-zandvoort
7. Dutch GP / Zandvoort guide — GP Destinations, 2019-09-17, applies to 2019 (pre-works) / 2021 onward plans. https://gpdestinations.com/?p=22317
8. Van Overdijk over verbouwing pitcomplex Zandvoort — GPFans NL, 2024-03-31, applies to 2024 onward. https://www.gpfans.com/nl/f1-nieuws/1016897/van-overdijk-over-verbouwing-pitcomplex-zandvoort-voldoen-weer-aan-de-normen/
9. Zandvoort circuit history — RacingCircuits.info / iRacing (secondary), undated. https://racingcircuits.info/europe/netherlands/zandvoort.html
10. Verbouwing Circuit Zandvoort: zo wordt het — TopGear NL, 2019-11-29, applies to 2021 onward. https://topgear.nl/formule-1/verbouwing-circuit-zandvoort-zo-wordt-het/

---

## Autodromo Nazionale Monza (Monza)

**Status for modelling:** Length (240 m), two levels plus a roof terrace, and what each floor is used for are confirmed by local press (Il Giorno, 2025). The planned 2027 roof extension (curved "boomerang" roof, aluminium cladding, PV) is documented. Garage count, height, facade colours and podium dimensions are not sourced.

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | 240 m ("palazzina box", between paddock and pit lane) | confirmed | [1] |
| Garages | not found (ground floor is entirely garages/"box"; no count published) | — | [1] |
| Storeys / height | 2 enclosed levels + roof terrace (ground = garages; 1st = hospitality, offices, press room; terrace = Paddock Club, with a temporary structure covered in tents/sheeting for the GP). Height not published; estimate ~9–10 m to terrace level (2 storeys × ~4–5 m, garage storey is taller), ~13–15 m including the temporary Paddock Club structure on the roof | storeys confirmed; height estimate (storey count × typical storey height, no measured value) | [1][2][3] |
| Roof | Through 2026: flat roof terrace topped by a temporary tensile/scaffold structure for the Paddock Club, put up and taken down every year. 2027+ (planned): permanent mostly-glass extra floor ("edificio B2", projecting over the track) with a curved "boomerang" roof leaning towards the track, five large bays, straight rear facade, aluminium cladding, PV panels on top; 5,021 m² new floor area | confirmed (as plan) | [2][3][4] |
| Pit-lane facade | not found in text sources (garage doors at ground level, glazed first floor; colours not sourced) | estimate from general photos; colours not sourced | — |
| Paddock-side facade | not found | — | — |
| Notable features | Paddock Club on the roof terrace overlooking the start straight; race control and press room currently in the pit building (both moving out under the 2026–27 works: race control to a new building of about 600–846 m² in the Parco Chiuso area beside the medical centre; press room to a new 3-storey, 70 × 14 m media building at the paddock entrance, linked by a bridge to the pit building "B1"). The podium overhangs the start/finish straight so fans gather below it after the track invasion | confirmed (podium location from F1.com/press, dimensions not found) | [1][2][5][6] |
| Permanent / built / renovated | Permanent. A "brand new pit building with hospitality units, offices and a media center" was already in place by Jan 2002; an earlier rebuild (undated, ~US$25 m) set the garages ~71 ft (~21.6 m) deep. 2024: track/underpass works (Motorsport.com, Feb 2024, also announced a permanent roof over the pit building replacing the tensile structure). Second phase (new roof floor, media centre, race control) site handed over 22 June 2026; works run from end of 2026 season to July 2027, so the **2026 GP still used the old configuration** with temporary solutions | confirmed | [2][3][4][7][8] |
| Paddock (team buildings / hospitality) | Hospitality on the 1st floor and roof of the pit building; temporary hospitality structures ("tendoni") and containers in the paddock/Parco Chiuso area, to be demolished. No source on team motorhomes specifically | confirmed for the pit building; motorhomes not found | [1][2] |
| Paddock street layout | not found (paddock lies directly behind the pit building; underpass from the paddock) | — | [7] |
| Landmark 1 | Old high-speed banking (1955 oval): 4.250 km oval, straights 1.22 km, banking 13.8 m wide, up to 80% gradient in the outer lane; Curva Sud sunk ~3 m into the ground, Curva Nord fully above ground. Height not published. Curva Sud rises beyond Turn 1 at the end of the main straight | dimensions confirmed (secondary sources); position from layout = estimate | [9] |
| Landmark 2 | Tribuna Garden (1955): at the pit-lane exit, 68.5 m long, 833 seats, second tier planned (to 1,337 seats) | confirmed | [1] |

Notes: Il Giorno (Oct 2025) gave the race-control building as ~600 m², two levels; the March 2026 article gives 846 m² on one level with a glazed overhanging part. Use the later figure for anything built in 2027+. The Feb 2024 Motorsport.com "permanent roof replaces tensile structure" plan seems to have been folded into the 2026–27 phase; the March 2026 article still talks about temporary scaffolding being put up every year. Model the 2026 season with a flat terrace plus temporary structure. Architects for the new works: Gau Arena with Lombardi Ingegneria. Heritage catalogue (pointer only, could not be fetched) credits the box and services buildings to Valentino Benati and Angelo Cortesi.

Sources (accessed 2026-10-17):
1. Il masterplan del circuito. Dalla Tribuna Garden alla terrazza vip sulla pista — Il Giorno, 2025-10-29, applies to 2025 (current state) / 2026–27 (plans). https://www.ilgiorno.it/monza-brianza/cronaca/il-masterplan-del-circuito-dalla-07190021
2. Monza, l'Autodromo del futuro: tre varianti urbanistiche da approvare in aula — Il Giorno, 2026-03-29, applies to 2026 (current) / 2027+ (plans). https://www.ilgiorno.it/monza-brianza/cronaca/lautodromo-del-futuro-tre-varianti-1f00bd5e
3. Monza cambia nel 2027, la trasformazione del Tempio della Velocità — HDmotori.it, 2026-06-26, applies to 2026–27. https://www.hdmotori.it/monza-lavori-2027-tempio-velocita/
4. Monza guarda al futuro: come cambierà il Tempio della Velocità nel 2027 — MotorBox, June 2026, applies to 2027. https://www.motorbox.com/auto/sport/f1/news/monza-guarda-al-futuro-come-cambiera-il-tempio-della-velocita-nel-2027
5. What makes the Italian Grand Prix special – and why you should see it — Formula1.com, undated, applies to current era (podium above the straight). https://www.formula1.com/en/latest/article/what-makes-the-italian-grand-prix-special-and-why-you-should-see-it.iAdwIYmBJXcxJQlnKgGfw
6. 5 Reasons We Love... The Italian Grand Prix — Formula1.com, 2019, applies to 2019. https://www.formula1.com/en/latest/article.5-reasons-we-love-the-italian-grand-prix-2019.6OQ9oOJQkBTgHMpPm7t35X.html
7. Paddock renovation work for Monza — GrandPrix.com, 2002-01-09, applies to 2002+. https://www.grandprix.com/news/paddock-renovation-work-for-monza.html
8. Monza begins track work in hopes to secure F1 future — Motorsport.com, Feb 2024, applies to 2024. https://www.motorsport.com/f1/news/monza-begins-track-work-hopes-secure-f1-future/10563743/ ; older rebuild (71 ft garages): Monza's Thin White Line — Supercars.net, undated (pre-2002). https://www.supercars.net/blog/monzas-thin-white-line
9. The white elephant that was Italy's answer to Indianapolis — Motor Sport Magazine, Jan 1997, applies to the banking (1955–). https://www.motorsportmagazine.com/archive/article/january-1997/52/the-white-elephant-that-was-italys-answer-to-india/

## Marina Bay Street Circuit (Singapore)

**Status for modelling:** Well sourced. Length ~350 m, 3 storeys, 36 garages planned, extensive glass, and floor-by-floor dimensions including clear heights are all available (STB rental kit 2025, 2007–08 press/government). Exterior colours and total height are not sourced.

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | ~350 m | confirmed (2007 pre-construction figure) | [1][2] |
| Garages | 36 garages for 12 teams on the ground floor (2007 plan; 2026 grid is 11 teams, garage allocation not sourced). Ground floor is rentable as 4 event halls of ~54 m × 18 m (1,132–1,134 m² each), columns at 6 m intervals, so garage modules are 18 m deep | confirmed | [1][3] |
| Storeys / height | 3 storeys. Clear heights: ground 3.25 m, 2nd and 3rd 3.0 m (internal clear heights, not floor-to-floor). Estimate overall ~15–18 m (floor-to-floor ~4.5–5 m × 3 plus the 3rd-floor roof structure) | storeys and clear heights confirmed; overall height estimate | [3] |
| Roof | 3rd floor described as "a modern and aerodynamic structure housing more hospitality facilities and a roof terrace". Solar panels power the building (2023) | confirmed (shape descriptive only) | [1][4] |
| Pit-lane facade | "Extensive use of glass in the building facade" so the Paddock Club has panoramic views of the start straight and pit lane; garages at ground level | confirmed (glass); colours not found | [1][2] |
| Paddock-side facade | not found | — | — |
| Notable features | 2nd floor: media centre, hospitality lounges, race control centre, winners' podium. 3rd floor: hospitality and roof terrace. Paddock Club suites and terraces directly above the team garages. Rentable floors: 2nd floor suites 41.6 × 22.6 m; 3rd floor suites 41.6 × 22.6 m; "Singapore Suite Extension" with an open-air porch overlooking Marina Bay Sands | confirmed | [1][3][5][6] |
| Permanent / built / renovated | Permanent. Groundbreaking Sept 2007, completion ceremony 11 July 2008. Architect A61 (Architects 61); contractor Jurong Primewide; built by the Singapore Tourism Board. GFA ~18,000 m² (2007 plan) vs 24,220 m² (2025 kit); site area 20,392 m². Address 1 Republic Boulevard. Pit straight is the only permanent part of the circuit | confirmed | [1][3][6][7] |
| Paddock (team buildings / hospitality) | A paddock lies between the team garages and the "team hospitality areas" (paddock land is SLA-owned per the rental kit). No source says whether team hospitality is permanent or temporary | partly confirmed | [3][5] |
| Paddock street layout | not found | — | — |
| Landmark 1 | Singapore Flyer: 165 m tall, 150 m wheel diameter, 28 capsules, opened 2008; stands right next to the pit building / Republic Blvd | dimensions confirmed; position = estimate (map) | [8] |
| Landmark 2 | Marina Bay Sands: three 55-storey hotel towers (~200 m) topped by the 340 m long SkyPark (cantilever ~65–67 m); across the bay from the pit straight | confirmed (Arup); view position = estimate | [9] |

Notes: The 36 garages / 12 teams figure is from the 2007 launch release. The rental kit describes the ground floor as "four garages and a clerk area" in rental units, meaning four 54 m blocks rather than four team garages. 4 × 54 m ≈ 216 m of garage halls, so the rest of the ~350 m length (plus clerk area) is circulation/other. Treat the 350 m figure as approximate. GFA differs between 2007 (18,000 m²) and 2025 (24,220 m²); use 2025 for the current building. Costs reported as S$33 m / ~US$20 m.

Sources (accessed 2026-10-17):
1. Works Begin on Sin$33 million Pit Building for Formula 1 Singapore Grand Prix — TravelNewsAsia/AsiaTravelTips, 2007-09-04, applies to 2008+. https://www.asiatraveltips.com/news07/49-SingaporeGrandPrix.shtml
2. Singapore gets things underway — GrandPrix.com, 2007-09-01, applies to 2008+. https://www.grandprix.com/news/singapore-gets-things-underway.html
3. F1 Pit Building Rental Info Kit (updated 16 Sep 2025) — Singapore Tourism Board (gov.sg), 2025-09-16, applies to 2025–26. https://isomer-user-content.by.gov.sg/1/2b896ff0-e8c6-4331-940a-0b5916b24eba/F1%20Pit%20Building%20Rental%20Info%20Kit%20-%20updated%2016%20Sep%202025.pdf
4. 2023 Formula 1 Singapore Grand Prix media kit — FIA, 2023, applies to 2023. https://www.fia.com/sites/default/files/2023_formula_1_singapore_grand_prix_media_kit.pdf
5. F1 Paddock Club Singapore 2025 — Grand Prix Events, 2025, applies to 2024–25 (Paddock Club above the garages); Tatler Asia editor's diary (paddock between garages and team hospitality), undated. https://grandprixevents.com/singapore-grand-prix/2025/f1-paddock-club ; https://www.tatlerasia.com/lifestyle/sports/editors-diary-inside-formula-one-f1-paddock-club
6. F1 Pit Building — Time Out Singapore, undated, applies to 2008+. https://www.timeout.com/singapore/sport-and-fitness/f1-pit-building
7. Mr S Iswaran at the Completion Ceremony of the Pit Building — Ministry of Trade and Industry Singapore, 2008-07-11, applies to 2008+. https://www.mti.gov.sg/newsroom/mr-s-iswaran-at-the-completion-ceremony-of-the-pit-building-for-the-formula-1--singtel-singapore-grand-prix/ ; Behind the Scenes – Building the Marina Bay Street Circuit — Singapore GP, 2016. https://singaporegp.sg/en/fanzone/f1-insights/2016/behind_the_scene_building_the_marina_bay_street_circuit
8. History and milestones / facts — Singapore Flyer (official), undated, applies to 2008+. https://www.singaporeflyer.com/en/history-and-milestones
9. Marina Bay Sands Integrated Resort — Arup, undated, applies to 2010+. https://www.arup.com/projects/marina-bay-sands-integrated-resort/ ; Marina Bay Sands — Structurae, undated. https://structurae.net/en/structures/marina-bay-sands

## Circuit of the Americas (Austin)

**Status for modelling:** The Main Grandstand and Observation Tower are very well sourced (Miró Rivera, Walter P Moore, Architectural Record). The pit building is weakly sourced: 3 storeys, Tilke as designer (HKS as registered design firm), balconies on floors 2–3, red accents, limestone-clad team buildings. Length and garage count were not found from a reliable source.

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | not found | — | — |
| Garages | not found reliably (a Glassdoor company profile says "Paddock Building ... 34 garages", 270,000 sq ft; not reliable) | unreliable pointer | [6] |
| Storeys / height | 3 storeys, "mixed use", registration lists ~99,000 sq ft "per floor" (wording ambiguous). Height not found; estimate ~15 m (3 × ~5 m) | storeys confirmed; height estimate | [1] |
| Roof | not found for the pit building | — | — |
| Pit-lane facade | Seating installed on the 2nd- and 3rd-floor balconies; the circuit's signature red appears as accents on the pit building | confirmed (balconies, red accents); materials not found | [2] |
| Paddock-side facade | not found for the pit building itself. Paddock team buildings have a limestone facade | team buildings confirmed | [2] |
| Notable features | 2nd/3rd floor balconies with seating (Paddock Club / "Paddock Lofts" and "Paddock Terrace" overlooking pit lane and start/finish); used as a 500-person banquet hall outside race weekends; a members' clubhouse on the Turn 1 hill is reportedly linked to the pit building by an aerial gondola (later project, status not verified) | partly confirmed | [2][7] |
| Permanent / built / renovated | Permanent. Construction June 2011 to July 2012 (registered completion); opened for the Nov 2012 US GP. Designer per Architectural Record: Tilke (track, pit building, medical building, media and conference centre). Registered design firm: HKS Inc. Builder: Austin Commercial | confirmed | [1][3][4] |
| Paddock (team buildings / hospitality) | Permanent team buildings with limestone facades were being finished in Aug 2012 | confirmed | [2] |
| Paddock street layout | not found | — | — |
| Landmark 1 | Observation Tower (Miró Rivera): 251 ft (76.5 m) tall, viewing deck at 230 ft (70.1 m), double-helix stair plus diagrid; red steel-tube "veil" fanning down over the amphitheatre stage (ETFE canopy). Located outside Turns 16–18, visible across the infield from the straight | confirmed | [3][5][8] |
| Landmark 2 | Main Grandstand (Miró Rivera; structure by Walter P Moore), opposite the pits at the start/finish: 3 levels, 9,000+ seats (AR: 8,255), 29 suites on level 3. Roof: white PTFE tensile canopy spanning between 50 ft (15.2 m) cantilevered steel trusses; red steel pipes run over the roof parallel to the track; large vertical advertising fins; white tube canopy cantilevers 40 ft (12.2 m) over the rear concessions | confirmed | [3][4][5] |

Notes: Architect credits differ. Architectural Record says Tilke designed the pit building, while the Texas TDLR registration names HKS Inc. as design firm (probably architect of record). One search snippet credited HKS with the Main Grandstand; Miró Rivera, Walter P Moore and Architectural Record all credit Miró Rivera with design. Tower height is quoted as 250 ft by Walter P Moore and the 2012 COTA blog, and 251 ft by Miró Rivera and the COTA site; use 251 ft. No source for the pit building's roof shape, length or garage count was found; take them from OSM/photos.

Sources (accessed 2026-10-17):
1. Circuit of the Americas; Pit Building (Project EABPRJB1812962) — Texas Department of Licensing and Regulation, registered 2011-06-02, applies to 2012+. https://www.tdlr.texas.gov/TABS/Search/Print/EABPRJB1812962
2. Construction update (Aug 2012) — Circuit of The Americas (official), 2012-08-28, applies to 2012+. https://circuitoftheamericas.com/?p=8742
3. Formula for Success: Circuit of the Americas — Architectural Record, 2013-10-16, applies to 2012+. https://architecturalrecord.com/articles/7553-circuit-of-the-americas
4. Circuit of the Americas — Walter P Moore, undated, applies to 2012+. https://www.walterpmoore.com/projects/circuit-americas
5. Main Grandstand — Miró Rivera Architects (via Archello), undated, applies to 2012+. https://archello.com/project/main-grandstand ; COTA Grandstand / Observation Tower — Miró Rivera Architects, undated. https://www.mirorivera.com/cota-grandstand
6. Company profile — Glassdoor, undated (unreliable pointer only). https://www.glassdoor.com/Overview/X-EI_IE693559.htm
7. COTA Club package (Paddock Lofts / Terrace in the pit building) — MotoGP Premier, 2026, applies to 2026. https://motogppremier.motogp.com/es/2026-motogp-usa/cota-club-3-days ; Circuit of the Americas reveals plans for private members club — SI.com, undated. https://www.si.com/onsi/f1/news/circuit-of-the-americas-reveals-plans-for-groundbreaking-private-members-club
8. COTA Tower — Circuit of The Americas (official), 2024-02-20, applies to 2024+. https://circuitoftheamericas.com/?p=14297

## Autódromo Hermanos Rodríguez (Mexico City)

**Status for modelling:** The 2015 Tilke pit building is confirmed at 33 garages, >25,000 m², and includes the control tower. The podium is confirmed to be in the stadium (Foro Sol, renamed Estadio GNP Seguros, with a new orange roof in 2024), not on the pit building. Storeys, length, roof and facade are not found.

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | not found | — | — |
| Garages | 33 garages | confirmed (2015 construction reports and the 2015 inauguration list) | [2][3][4][5] |
| Storeys / height | not found (stated only as "main building" >25,000 m²; separate Media Center is 2 storeys, 470 journalists) | — | [3][4] |
| Roof | not found | — | — |
| Pit-lane facade | not found. 2026 works include "improvements to the facade and facilities of the Pit Building and Paddock" (pre-2026-GP, details not published) | confirmed that work happened, details not found | [7][8] |
| Paddock-side facade | not found | — | — |
| Notable features | New control tower integrated with or next to the pit building; "grandstands with hospitalities" in the pit building; Paddock Club and new suites building listed among 2015 works. The **podium is in the stadium section**: cars park and the trophy ceremony takes place on a stage in front of the stands | confirmed | [3][4][5][6] |
| Permanent / built / renovated | Permanent. Old pits demolished in 2014–15; new pit building by Tilke, 2015 (42% complete Mar 2015, 70% Jun 2015); complex completed Aug 2015; inaugurated 3 Oct 2015. Start/finish straight moved 15 m to the right of the old line. 2026: MXN 202 m (~US$11.7–12 m) upgrade programme (resurfacing, drains, kerbs, pit building/paddock facades and facilities) | confirmed | [1][2][3][5][7][8][9] |
| Paddock (team buildings / hospitality) | 22,720 m² of paddock resurfaced (2015); new paddock tunnel built 2015; Paddock Club and "Hospitalities" listed. No source on permanent team buildings vs motorhomes | partly confirmed | [5][9] |
| Paddock street layout | not found | — | — |
| Landmark 1 | Foro Sol / Estadio GNP Seguros (former baseball stadium; the track passes through its stands before rejoining the main straight). 2024 remodel added a large orange roof (rainwater collection), full seating, screens and panoramic lifts. Dimensions not found | confirmed (features); dimensions not found | [1][6][9] |
| Landmark 2 | Palacio de los Deportes (1968, Félix Candela with Peyri and Castañeda Tamborell): copper-clad dome of hyperbolic-paraboloid panels, ~120 m (380 ft) span, ~27,000 m² enclosed; next to the circuit | dimensions from Wikipedia/academic paper (secondary); visibility from the straight = estimate | [10] |

Notes: An F1.com piece (originally 2015, re-dated 2024 on the site) quotes Tilke's project lead on the old pit buildings being dismantled and new medical and media centres being built. The 2015 inauguration list says "Reparación de 33 garages según necesidades de FIA" (repair, not new build), which conflicts with the CIE/Motorpasión reports that the old pits were demolished and a new pit building built. The construction reports are more specific; use new-build. One secondary claim of "26,000 m² of pit garage, guest suites and press buildings" is consistent with >25,000 m². The 2026 GP (30 Oct–1 Nov 2026) is after today's date, so the post-works facade is not yet documented.

Sources (accessed 2026-10-17):
1. Autódromo Hermanos Rodríguez — Tilke Engineers & Architects, undated, applies to 2015+. https://tilke.de/?p=20749
2. A 281 días del Gran Premio de México, así van los trabajos — Motorpasión México, 2015-01-23, applies to 2015 construction. https://www.motorpasion.com.mx/formula1/a-281-dias-del-gran-premio-de-mexico-asi-van-los-trabajos-en-el-autodromo-hermanos-rodriguez
3. Siguen los avances en el Autódromo Hermanos Rodríguez a 7 meses — Motorpasión México, 2015-03-31, applies to 2015+. https://www.motorpasion.com.mx/formula1/siguen-los-avances-en-el-autodromo-hermanos-rodriguez-a-7-meses-de-recibir-el-gran-premio-de-mexico
4. A 15 semanas del Gran Premio de México, personal de la FIA visita el autódromo — Motorpasión México, 2015-07-14, applies to 2015+. https://www.motorpasion.com.mx/formula1/a-15-semanas-del-gran-premio-de-mexico-personal-de-la-fia-visita-el-autodromo-hermanos-rodriguez ; also CIE/MexicoGP "First Layer of Asphalt" release (70% progress, 33 pits and control tower), 2015. https://mexicogp.mx/wp-content/uploads/files_mf/1440801281First_Layer_of_Asphalt.pdf
5. Inauguran nuevo Autódromo Hermanos Rodríguez — Quadratín México, 2015-10-03, applies to 2015+. https://mexico.quadratin.com.mx/Inauguran-nuevo-Autodromo-Hermanos-Rodriguez/
6. GP de México: conoce las remodelaciones que le hicieron al estadio — El Universal, 2024-10-25, applies to 2024+. https://www.eluniversal.com.mx/deportes/gp-de-mexico-conoce-las-remodelaciones-que-le-hicieron-al-estadio/ ; podium in Foro Sol: Rosberg podium release — MexicoGP (official), 2015. https://www.mexicogp.mx/wp-content/uploads/files_mf/14467408531446444085ROSBERG_ALTOPODIO1.pdf
7. Fórmula 1 en México: así modernizarán el Autódromo Hermanos Rodríguez — Por Esto, 2026-05-18, applies to 2026. https://www.poresto.com/deportes/2026/5/18/formula-1-en-mexico-asi-modernizaran-el-autodromo-hermanos-rodriguez.html
8. Autódromo Hermanos Rodríguez invertirá 200 millones — TV Azteca Deportes, 2026-06-07, applies to 2026. https://www.tvazteca.com/aztecadeportes/autodromo-hermanos-rodriguez-invertira-200-millones-formula-1/ ; Mexico City's F1 track to get $12M upgrade — AP (via Messenger-Inquirer), May 2026. https://www.messenger-inquirer.com/ap/sports/mexico-citys-f1-track-to-get-12m-upgrade/article_af73742b-8a20-59fe-9f27-9c3ecd1a8cec.html
9. Mexico uncovered: the inside story of Mexico City's F1 return — Formula1.com, 2015 (page re-dated 2024-09-05), applies to 2015+. https://www.formula1.com/en/latest/article/mexico-uncovered-the-inside-story-of-mexico-city-s-f1-return.1Wn5BBp9GHS4z6AbiAZ0C7
10. Palacio de los Deportes — Wikipedia (pointer), undated; Redalyc academic paper (27,461 m²), undated. https://en.wikipedia.org/wiki/Palacio_de_los_Deportes ; https://www.redalyc.org/pdf/1276/127649578004.pdf

---


---

## Autódromo José Carlos Pace, Interlagos (São Paulo)

**Status for modelling:** Garage count, garage area and clear height, the 6-storey Operations Centre, the covered paddock and the support building behind it, and the 2025 infield Hospitality Center all have official São Paulo city sources (SPObras / Prefeitura). No source gives the pit building's overall length or height, the facade materials (apart from the glass Operations Centre), or the roof profile. Take those from OSM or photos.

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | not found. Rough check: 24 team boxes × ~9 m (216 m² ÷ ~24 m deep, the depth is assumed) ≈ 210–220 m, plus the Operations Centre at one end. Use the OSM footprint instead. | estimate (arithmetic from [6]; depth assumed) | [6] |
| Garages | 23 existing boxes + 1 new module = 24 team boxes, plus 4 new technical boxes on the ground floor of the Operations Centre = 28 in total (2015 plan, delivered 2016). The city site still says "23 boxes of 216 m² each" (undated). Since 2019 the boxes have 22 sets of removable metal partitions in place of concrete walls, can become "24 rooms", and have an epoxy floor. | confirmed | [2][3][4][6] |
| Storeys / height | Team-box block: garage level plus an upper floor (race control, podium, timing over the first boxes; hospitality "paddock" level along the rest). Garage clear height: 3.86 m in the 2015 plan, "raised by about 1 m" (2019), and "3 m free clear height" in the official 2021 text. The figures conflict and may measure different things (clear vs structural). Overall height not found. Operations Centre (next to the boxes): 6 floors, 3,500 m². That is ground floor (4 boxes), 2 upper floors (multi-use / VIP / race control) and 3 lower basement floors, so only about 3 floors stand above pit-lane level. | confirmed (floors, clear heights); overall height not found | [2][3][4][5] |
| Roof | Pit building roof shape: not found. Paddock behind the boxes: fixed tensioned-membrane roof (laminated synthetic fabric) on a steel structure with its own drainage, 8,347.3 m², completed Oct 2019 and billed as the first fully covered paddock in F1. The 2021 release gives "about 20,000 m²", which also covers the street behind the boxes and the support building (roof finished Dec 2019 / Jan 2021). The 2015 plan had "membrane and metal tile, 10,000 m²". | confirmed (paddock roof); pit roof not found | [3][4][5] |
| Pit-lane facade | Operations Centre / main building "designed mostly in glass" for views of the track, the F1 paddock and the podium (architect Effect Arquitetura). Team-box facade (doors, colours): not found. Boxes got electric doors in 2015 per press (see Notes; source not re-verified). | confirmed (Ops Centre glass); rest not found | [7] |
| Paddock-side facade | Glass guardrail along the whole paddock perimeter (2019). Seven footbridges link the paddock to the Support Building (re-levelled in 2019 when the boxes were raised), which suggests the upper paddock level is joined by bridges to the building behind. Material and colour not found. | confirmed (guardrail, footbridges) | [4] |
| Notable features | Race control, podium and timing above the first boxes. Upper floor holds the hospitality "paddock" (Paddock Club) area with kitchens. The 6-floor Operations Centre at the end of the boxes holds race control and VIP space. A new "box zero" links the Operations Centre to the old boxes. Garages are steel-framed (high ceilings, large spans), other buildings precast concrete. Some GP structures (part of the grandstands, media facilities) are temporary overlay. | confirmed | [2][3][7] |
| Permanent / built / renovated | Permanent. Original prefabricated pit building from 1990 (per SPTuris; not re-verified). Works: 2014 pit entry/exit and pit-lane pavement. 2015 Support Building and Operations Centre. 2016 Operations Centre completion work (delivered 29 Oct 2016). 2019 paddock roof, partitions, boxes raised ~1 m (done Oct 2019). Apr 2019–Jan 2021 boxes raised and roof completed (R$46m). Plan applies to 2016+ seasons; covered paddock and raised boxes to 2019+. | confirmed | [2][3][4][5] |
| Paddock (team buildings / hospitality) | Permanent "Edifício de Apoio" (team building) behind the boxes: single storey, 4,000 m², modular open plan with team offices, kitchens, toilets, auditorium and multi-use rooms. Teams' area went from 70 m² to 210 m². VIP hospitality: upper floor of the boxes and the Operations Centre. Since 2025 there is also a separate infield Hospitality Center (see Landmark 1). Team motorhomes: no source found. | confirmed | [2][3][8][9] |
| Paddock street layout | Paddock (the open area behind the boxes) widened to 10 m of free circulation (2015), for 4,000+ people. It runs between the pit building and the Support Building and is now fully roofed. | confirmed | [3][5] |
| Landmark 1 | New Hospitality Center in the infield, opposite Curva do Laranjinha: 3 storeys, ~22,000 m², 6,000 guests, also houses circuit administration. Billed as the circuit's tallest structure at 22 m (Oct 2024 report). Partly used for the 2024 GP behind a glass-skin scenographic wrap, debuted in full at the 2025 GP. It sits in the infield, not on the main straight. Applies to the 2025+ seasons. | confirmed (press: area, floors, height); timing confirmed by Prefeitura | [8][9] |
| Landmark 2 | Main-straight view: the 6-storey Operations Centre at the end of the pit row (above). A separate city-skyline landmark: not found. New permanent grandstands in sectors A (an extra tier), D and OTC are under construction, due Dec 2025/2026 (dimensions not found). | confirmed (Ops Centre floors); skyline not found | [3][8][9] |

Notes:
- Garage counts: "23" (undated city page) vs "24 + 4 = 28" (2015 plan). For 2016+ seasons, model 24 team boxes and 4 technical boxes in the Operations Centre.
- Clear height after works: 3.86 m (2015 plan) vs 3 m (2021 text). Pick ~4 m clear and add the upper storey for the overall height (likely ~9–11 m excluding roof structures). That is an estimate, unsourced.
- Paddock roof area: 8,347 m² (2019, paddock only) vs ~20,000 m² (2021, paddock, the street behind the boxes and the Support Building). Both are probably right for different scopes.
- 2024 Correio piece: the 2014–16 works were the "biggest since the paddock modernisation". The Oct 2025 Prefeitura release cites ~R$500m of investment, the Hospitality Center debut and re-roofing of grandstand sectors M, Pit Stop and B. No source mentions a new pit building in the 2020s; the pit row itself is the renovated 1990 structure.
- Electric doors and an 80 cm higher ceiling (Nov 2015, Tribuna PR) came from a search snippet only, not re-fetched.

Sources (accessed 2026-10-17):
1. Interlagos plans pit and paddock relocation — Crash.net, 2013, applies to planning only (superseded). https://www.crash.net/f1/news/180972/1/interlagos-plans-facelift-to-remain-on-schedule
2. São Paulo Obras entrega obras no Autódromo de Interlagos — Prefeitura de São Paulo / SPObras, 31 Oct 2016, applies to 2016+. https://prefeitura.sp.gov.br/web/obras/w/sp_obras/225020
3. SPObras entrega novas obras no Autódromo de Interlagos — Prefeitura de São Paulo / SPObras, 4 Nov 2015, applies to 2015–16 (plan + phase 1). https://prefeitura.sp.gov.br/web/obras/w/sp_obras/noticias/206194
4. Prefeitura conclui mais uma etapa da requalificação do Autódromo de Interlagos — Prefeitura de São Paulo (Sec. Justiça), 7 Nov 2019, applies to 2019+. https://prefeitura.sp.gov.br/web/justica/w/noticias/287746
5. Autódromo de Interlagos ganha reforma nos boxes e nova cobertura do paddock — Prefeitura de São Paulo / SPObras, 14 Dec 2021, applies to 2021+. https://prefeitura.sp.gov.br/web/obras/w/sp_obras/noticias/310317
6. Circuito — Autódromo de Interlagos portal, Prefeitura de São Paulo, undated (references 2015), applies to roughly the 2015 era. https://prefeitura.sp.gov.br/web/autodromodeinterlagos/circuito
7. Autódromo de Interlagos "José Carlos Pace" — Effect Arquitetura via Archilovers, undated (project ~2015–17), applies to 2016+. https://www.archilovers.com/projects/321138/autodromo-de-interlagos-jose-carlos-pace.html
8. Interlagos troca de asfalto e terá prédios e túneis novos a um custo de R$ 275 milhões — Jornal Correio (citing Estadão), 19 Oct 2024, applies to 2024–25. https://www.correio24horas.com.br/esportes/interlagos-troca-de-asfalto-e-tera-predios-e-tuneis-novos-a-um-custo-de-r-275-milhoes-1024
9. Prefeitura investe quase R$ 500 milhões e transforma Interlagos em palco global… — Prefeitura de São Paulo, 30 Oct 2025, applies to 2025+. https://prefeitura.sp.gov.br/w/prefeitura-investe-quase-r-500-milh%C3%B5es-e-transforma-interlagos-em-palco-global-do-automobilismo-e-da-cultura

## Las Vegas Strip Circuit (Las Vegas)

**Status for modelling:** The pit building is well sourced: length and width, height range, garage layout, floor uses, LED roof canopy, balconies, and which side faces what. Facade materials and colours are not stated anywhere (photos only). Floor count is "3 levels + roof terrace" or "4 storeys" depending on the source; these describe the same building. Sphere dimensions come from the architect.

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | 1,000 ft (~305 m) long × 100 ft (~30.5 m) wide. F1 calls it "the length of three football fields". Billed as the largest paddock structure in F1. | confirmed | [1][2][3] |
| Garages | 13 garages: one per team for 10 teams (3 bays each, holding 2 race cars), plus 3 for FIA and sponsors. "Plug and play" air, gas, power and data. Garage order follows the previous year's constructors' standings. Note: from 2026 F1 has 11 teams; the 2023 layout counted 10 teams + 3 others, and 2026 allocation is not found. | confirmed (2023) | [2][4][5] |
| Storeys / height | Ground floor garages, floors 2 and 3 Paddock Club / suites, roof terrace (called "4-level/four-storey" or "three-level with rooftop terrace"). Elevations of 54–74 ft (~16.5–22.6 m) per Clark County filings. Roof terrace area has a 17 ft (~5.2 m) ceiling under the canopy. ~300,000 sq ft. ENR gives 292,266 sq ft and "three floors", concrete (search snippet; ENR not fetchable). | confirmed | [2][3][4][6][7] |
| Roof | Rooftop terrace (hospitality, open to all pit-building ticket holders) under a ~28,000 sq ft (~2,600 m²) LED screen in the shape of the F1 logo that acts as a canopy, visible from aircraft landing at Harry Reid Airport. | confirmed | [4][5][7] |
| Pit-lane facade | East side faces the pit lane / start-finish. Balconies on both suite levels (floors 2–3) let guests step out over the pit lane. Glazing / colours not stated: a glass curtain wall behind the balconies is likely but unsourced. | confirmed (balconies, orientation); materials not found | [2][4] |
| Paddock-side facade | West side holds the paddock and team hospitality suites. A circular spectator drop-off loop (two 24 ft lanes) lies west of the building, next to Koval Lane. Planned signage: F1 logos in red-lit acrylic panels and a west-facing LED video board toward Koval. Facade material not found. | confirmed (layout, signs as planned 2022) | [2][6] |
| Notable features | Start/finish line at the building. Pedestrian tunnel from the paddock side under the track to the grandstand opposite. Escalators inside. Wynn Grid Club and Paddock Club on floor 2, shared/private suites on floor 3. Main grandstand opposite: 1,066 ft (~325 m) long, up to 78 ft (~24 m) tall (temporary, built each year). The building is F1's year-round US base / event venue ("Grand Prix Plaza"). | confirmed | [2][3][4][8] |
| Permanent / built / renovated | Permanent. Construction began Nov 2022, topped out 13 Apr 2023, temporary certificate of occupancy Oct 2023, first used for the 2023 race (Nov 16–18). Reported cost $500m (land $240m extra). Design: Klai Juba Wald (lead design firm), with PENTA Building Group as general contractor, John A. Martin (structural) and Kimley-Horn (civil), per ENR / secondary snippets. Applies to 2023+ seasons. | confirmed (dates, cost); design team confirmed only via search snippets of ENR | [4][7][8][9] |
| Paddock (team buildings / hospitality) | Team hospitality suites on the west side of the building. Other paddock-site hospitality structures are temporary (Koval zones; RJ photo caption mentions "Koval hospitality"). Team motorhomes: not found. | confirmed (west-side suites) | [2][4] |
| Paddock street layout | Building sits in the middle of a 39-acre lot at the NE corner of Harmon Ave and Koval Ln. Garages / pit lane on the south-east side. Paddock to the west. Spectator parking (1,987 spaces) to the south-east, with access from Harmon. | confirmed (2022 county filings) | [6] |
| Landmark 1 | Sphere (Venetian, north of the pit building, visible from it): 366 ft (~112 m) tall, 516 ft (~157 m) wide. Exosphere of 1.2 million LED pucks on a steel diagrid independent of the building. Opened 2023 (applies 2023+). Architect Populous. | confirmed | [10][11] |
| Landmark 2 | The STRAT (Stratosphere) tower, visible from the pit building per an RJ photo caption: 1,149 ft (~350 m), the tallest freestanding observation tower in the US. Height only from secondary / ticketing sources. | confirmed (visibility); height from secondary sources | [4][12] |

Notes:
- Floor count: the same building is called "3-level + rooftop terrace" (RJ June 2023, CDC, F1.com) and "4-storey" (RJ Aug 2023, county filings 2022, Nevada Independent). Model ground + 2 suite floors + roof terrace under the canopy.
- 54–74 ft is the 2022 planning elevation range. The higher figure probably includes the LED canopy/sign. Estimated split: ~54 ft parapet, ~74 ft canopy.
- Crash.net says "300-square-feet" (typo for 300,000) and calls the 39-acre site the building. Ignore it for dimensions.
- ENR could not be fetched (blocked). The ENR figures (292,266 sq ft, three floors, Klai Juba Wald / PENTA) come from the search engine's summary of that page.

Sources (accessed 2026-10-17):
1. 'We're creating a new legacy' – the mind-boggling logistics behind the creation of the Las Vegas Grand Prix — Formula1.com, 14 Nov 2023, applies to 2023+. https://www.formula1.com/en/latest/article/were-creating-a-new-legacy-the-mind-boggling-logistics-behind-the-las-vegas.GhNlNJbDR3wB8mwkgxZo8
2. What will be inside F1's Las Vegas paddock building? — Las Vegas Review-Journal, June 2023 (tour 2 June 2023), applies to 2023+. https://develop.reviewjournal.com/?p=2561676 (mirror: https://cdcgaming.com/brief/what-will-be-inside-f1s-las-vegas-paddock-building/)
3. F1 paddock at 80% complete; work crews race to finish line — Las Vegas Review-Journal, Aug 2023 (photos 9 Aug 2023), applies to 2023. https://develop.reviewjournal.com/?p=2596020
4. Las Vegas Grand Prix pit building nears completion — Las Vegas Review-Journal, Oct 2023 (tour 20 Oct 2023), applies to 2023+. https://develop.reviewjournal.com/?p=2638708
5. 'Larger-than-life' F1 LED screen frame up on the roof of Paddock building — KTNV, 2023, applies to 2023+. https://ktnv.com/news/larger-than-life-f1-led-screen-frame-up-on-the-roof-of-paddock-building
6. Formula One planning 300K square-foot Las Vegas paddock — Las Vegas Review-Journal, May 2022 (citing Clark County filings), applies to the design as planned. https://develop.reviewjournal.com/?p=2426963
7. Formula 1 Heineken Silver Las Vegas Grand Prix Pit Building (Best Sports/Entertainment) — ENR, 2024, applies to 2023+ (snippet only; page blocked). https://enr.com/articles/59586-best-sports-entertainment-formula-1-las-vegas
8. $500M paddock building topped off 5 months ahead of Las Vegas' F1 race weekend — The Nevada Independent, 13 Apr 2023, applies to 2023+. https://thenevadaindependent.com/article/500m-paddock-building-topped-off-5-months-ahead-of-las-vegas-f1-race-weekend
9. The staggering cost behind F1 Las Vegas Grand Prix big-money pit building — Crash.net, Nov 2023, applies to 2023 (has errors, see Notes). https://crash.net/f1/news/1040568/1/staggering-cost-behind-f1-las-vegas-grand-prix-bigmoney-pit-building
10. Sphere — Populous (architect project page), undated, applies to 2023+. https://populous.com/project/sphere
11. (secondary) Sphere 366 ft / 516 ft also reported by Crash.net [9].
12. The Strat — Wikipedia (pointer/secondary), undated, applies to all seasons. https://simple.wikipedia.com/wiki/The_Strat

## Sepang International Circuit (Kuala Lumpur)

**Status for modelling:** F1 seasons 1999–2017 only. F1 left after 2017; the circuit still hosts MotoGP. Garage dimensions, floor uses and the grandstand's length, orientation and hibiscus-inspired roof are sourced from the official circuit site. The pit building's overall length, height, roof shape and facade are not documented anywhere I found.

| Field | Value | Confirmed / estimate | Src |
|---|---|---|---|
| Pit building length | not found. Lower bound: 33 pits × 8 m = 264 m of garages alone, plus race-control and office modules. Likely ~270–300 m, but use the OSM footprint. | estimate (arithmetic from [1]) | [1] |
| Garages | Official site: 33 pits, each 8 m wide × 24 m long, air-conditioned. Each block of two pits has 3 offices, a team common room (hospitality) and a kitchen. Builder WCT (1998): 30 pit garages and 15 team rooms. The difference may be 30 team pits + 3 others. | confirmed (conflict noted) | [1][2] |
| Storeys / height | Official site: Paddock Clubs on the first floor, Perdana Suite (royal/VVIP, 250 people) on the second floor, refurbished rooftop on the "upper third floor" along the whole building, so ground + 2 floors + usable roof. WCT says "two-storey pit building" (likely counting floors above ground). Height not found. Estimate ~14–18 m to the roof deck (3 levels × ~4.5–5 m plus parapet), unsourced. | confirmed (floors); height estimate | [1][2] |
| Roof | Rooftop terrace / viewing deck along the full length (refurbished). Roof shape / canopy: not found. The 2013–14 renovation addressed water coming through the roof (search snippet, Mapei page blocked). | confirmed (rooftop use); shape not found | [1][3] |
| Pit-lane facade | not found | — | — |
| Paddock-side facade | not found. Paddock Clubs have their own parking and private access, so there are entrances on the paddock side. | confirmed (access) | [1] |
| Notable features | Pit building houses race control, timekeeping, Paddock Clubs and race management offices. WCT adds a media centre, conference room, photographers' area with 3 darkrooms and royal lounges (1998). Faces the main grandstand across the main straight. | confirmed | [1][2] |
| Permanent / built / renovated | Permanent. Construction by AZ-M&R-WCT JV, completed Dec 1998, circuit opened 7 Mar 1999. Track designer Hermann Tilke (his first circuit). No source attributes the pit building architecture specifically to Tilke. Rooftop later refurbished (date not given). 2013–14 roof-leak renovation (snippet). Applies to F1 1999–2017. | confirmed | [1][2][3][4] |
| Paddock (team buildings / hospitality) | Team rooms and kitchens are inside the pit building (per 2-pit block). Paddock Chalets: 14 chalets, 190 m² mirrored pairs and 250 m² end units, with cantilevered roofs shading dining terraces. Built from recycled steel of earlier temporary chalets, so likely post-F1; date not found. South Paddock (double-storey, 18 × 80 m² garages, its own race control) is a support/national-series facility, not the F1 paddock. | confirmed (descriptions); chalet date not found | [1] |
| Paddock street layout | not found | — | — |
| Landmark 1 | Main Grandstand opposite the pit building: 1.3 km long, double frontage (faces both the main straight and the back straight), ~30,000 seats, east–west alignment so seats are always shaded. Roof design inspired by the hibiscus, Malaysia's national flower. Roof replaced in 2019 (~RM20m, "1.8 km of grandstand seating"), after F1 left. Pre-2019 F1-era roof appearance may differ in detail. | confirmed | [1][5][6] |
| Landmark 2 | not found. The circuit sits in a former oil-palm plantation next to KLIA with no city skyline. 5,000+ palm trees were planted around it. | confirmed (setting) | [1][5] |

Notes:
- The brief called the grandstand roofs "leaf-shaped". Sources say hibiscus-flower-inspired (Repsol 2017). One secondary source mentions palm-plantation inspiration; no source says "leaf".
- Grandstand length: 1.3 km (official) vs 1.8 km of covered seating (NST 2019). The NST figure probably counts all stands.
- Pit counts: 33 (official, current) vs 30 (builder, 1998). For F1 1999–2017 either works. Use 33 × 8 m for the building's module rhythm.
- The official site is current (2026) and partly describes post-F1 facilities (chalets, South Paddock, refurbished rooftop).

Sources (accessed 2026-10-17):
1. Architecture — PETRONAS Sepang International Circuit (official), undated (current 2026 site), applies to 1999–present (some post-2017 items). https://www.sepangcircuit.com/architecture
2. Sepang International Circuit, Selangor, Malaysia (project page) — WCT Holdings (contractor), undated (project completed Dec 1998), applies to 1999+. https://www.wct.com.my/our_businesses/engineering_and_construction/Infrastructure/details.aspx?p=3&pj=15
3. PETRONAS Sepang International Race Circuit — Mapei (Realtà Mapei), undated (2013–14 works), applies to 2014+ (snippet only; page blocked). https://mapei.com/it/en/realta-mapei/detail/petronas-sepang-international-race-circuit
4. Sepang International Circuit — Wikipedia (pointer only), undated. https://en.wikipedia.org/wiki/Sepang_International_Circuit
5. Suffocating Sepang and its flower shaped stand — Repsol Media (Box Repsol), 25 Oct 2017, applies to 1999–2017+. https://media.boxrepsol.com/suffocating-sepang-and-its-flower-shaped-stand/?lang=en
6. RM30 million facelift for Sepang Circuit — New Straits Times, Oct 2019, applies to 2019+ (post-F1). https://www.nst.com.my/amp/sports/motor-sports/2019/10/533949/rm30-million-facelift-sepang-circuit
