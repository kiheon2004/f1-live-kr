# Monaco: the teams' pit wall upstairs – what the app builds and why (v0.53, 2026-11-01)

Code: `src/renderer/facilities.js` (`PIT_LOOKS[22]` / `MONACO_ROOM`, `FACADES.monacoPit`, `GARAGE_TOP.monacoPit`, the
`upperRoom` block of `pitBuilding`, `wallAt` for `stands: "upper"`, `garages.upperRoom`), `src/renderer/garages.js`
(`upperStandLayout`, `roomStand`), `src/renderer/pitwallcheck.js` (`upperStandCheck`), `src/renderer/map3d.js`
(`Map3D.upperCheck`, `pitWallOrder`'s footprint for a stand upstairs). Test: `test/monaco53.test.js`.

## The user's report

"Monaco's pit wall (the teams' stands) looks like it floats in the air." Monaco is a real exception (the stands are
upstairs), so the fix keeps them upstairs and gives them something real to stand in.

## What v0.36–v0.52 drew

`wallAt` for Monaco returned a point 0.9 m out from the garages' front at `floorAt(u) + 3.4`. `garages.js
pitWallStand` built the usual open stand there: a 1.6 m deck 0.22 m thick, from 0.05 to 1.65 m out, a canopy on four
posts that stopped at the deck, railings and a step 3.4 m up with nothing under it. The building's pit facade
(`pitGlass`) put the top of the garage openings at 4.8 m (openings 4.25 m) and the first floor's glazing at 6.2–9.4 m. So
the deck hung **in front of the garage openings, about 0.85 m below their top**, under a first floor that did not stick
out. Nothing touched it: no floor, no beam, no wall behind it (a 0.05 m gap to the facade), no support. The team's name
on its fascia faced into the building, so the lane couldn't read it. (Screenshots `monaco_b1_5/6/7`.)

Checked from the list in the request:

| Question | v0.52 |
|---|---|
| Upper floor and deck connected? | No. The building had no first-floor slab at the front. The deck stood in front of the facade texture with a 0.05 m gap. |
| Real storey height vs the fixed 3.4 m? | Not linked. 3.4 m was a constant. The building's garage storey was 4.8 m (the generic `pitGlass` facade), so the deck sat below the first floor. |
| Supports lost after garage modules / landmark swap? | None ever existed: the stand had no posts down to the ground or into the building. The garage kit (v0.49) doesn't touch the stand. |
| Local/world coordinates applied twice? | No. `wallAt` gives world x, z and an absolute y, and `pitWallStand` adds only local offsets. Checked in `pitWallOrder` (standY 3.4 = floor + 3.4). |
| `floorAt` and the building floor on one height reference? | Yes. The facade over the garages, the openings and `wallAt` all use `floorAt(u)`. The `balconies` feature uses `baseAt` instead, which is why the new room doesn't use it. |
| LOD hiding only supports? | No supports to hide. The people's small parts follow `PEOPLE_NEAR`. That is unchanged and doesn't move them. |
| Sticking out past the facade? | 1.65 m out from the garages' front, over the boxes' working area, below the first floor. |
| Staff/chairs touching the floor? | They touched the deck, but the deck touched nothing. |
| Visible gaps? | 0.05 m to the facade, plus the whole underside. |

## Sources

| What | Source | Applies to | Kind |
|---|---|---|---|
| "There is no genuine pit wall … the pit stand is built inside, directly above the garage", with a view of the pit box ("not ideal") | Red Bull Racing, "Bulls' Guide To: Monaco", 2021-05-21, https://www.redbullracing.com/int-en/bulls-guide-to-monaco (fetched 2026-11-01) | 2021 | confirmed (team) |
| Garages "roughly half the width"; ground floor car bays, tyres, bodywork; first floor spares, IT, "also shared with the pit wall gantry", which "goes up a floor and overlooks the pit box"; third floor for guests | Williams Racing, "Five things to know ahead of the Monaco Grand Prix", https://www.williamsf1.com/posts/e7337645-01a7-4416-bf23-28005c89f6d6/five-things-to-know-ahead-of-the-monaco-grand-prix (fetched 2026-11-01) | 2023 | confirmed (team) |
| "all of the spares are stored upstairs, above the garage … Though we've also got the 'pit wall' up there as well"; "the pitbox gantry right outside the garage" (the boom, at ground level) | McLaren, "Question time", https://www.mclaren.com/racing/latest-news/mclarenracing/article/question-time/ (fetched 2026-11-01) | (undated Q&A) | confirmed (team) |
| Red Bull "Bull's guide to the pit wall – communications" | https://www.redbullracing.com/int-en/projects/bulls-guide-to-the-pit-wall/bulls-guide-to-the-pit-wall-communications | – | **not read**: the page is rendered by script and an anonymous GET returns an empty shell. A search snippet of Red Bull's pit-wall guide calls Monaco's arrangement "utterly bizarre" and gives only a limited view of the box from above. That snippet is not quoted as a source. |
| The building's form: garage storey; first floor fully glazed, standing out over the lane on a slab with a white soffit and a black-and-white checkered edge; second floor behind a balcony with a railing carrying the team's banner; a white/red roof band over it | Wikimedia Commons, "Circuit de Monaco - Pit Lane" (54799715330, 54798540117, 54799950430, 54784875208), CC0, photos taken 2022-05-23 | 2022 | photo (H for the form, M for sizes) |
| Older layout notes (three floors since ~2021, the pit stand upstairs) | docs/research/pitbuildings.md §Monaco, docs/research/pitwall.md §S | 2016–2024 | as recorded there |

**2025 / 2026:** No freely licensed photo of the 2025 or 2026 pit building turned up (Commons searches for "Monaco 2025
pit/garages", "Monaco Grand Prix 2025 pit", "Monaco 2024/2023 pit lane"). The team texts (2021, 2023) and the 2022
photos agree, and nothing found says the modules changed. The 2025/2026 form is **assumed** from them, not confirmed.
The sessions themselves (2025 and 2026 race replays) were used to check that the build fits the measured lane and the
FIA garage plan. They can't say what the building looks like.

## What v0.53 builds (all sizes estimates from the photos – M)

Heights are over the garages' floor (`floorAt`); "out" is metres from the garages' front towards the lane.

| Part | Size | How estimated |
|---|---|---|
| Garage storey (top of the openings = underside of the first floor's slab) | 4.0 m (openings 3.45 m) | p4/p2: forklifts (~2.2–2.3 m to the guard) parked at the fronts reach about 2/3 of the opening, with the name band over it |
| First floor's slab | 0.30 m, cantilevered 1.0 m out over the lane | p1: soffit and checkered edge visible from below, about a third of the storey's depth past the opening |
| First-floor room (the teams' pit wall) | 2.7 m clear, glazed at 1.0 m out, back wall 3.0 m behind the garages' front | p2/p4: the glazed band about as tall as the opening. Depth: room for a console and a row of stools (3 m is a minimum, not measured) |
| Second floor's slab + balcony | 0.30 m, balcony 2.0 m out, railing 1.1 m | p2: the balcony stands about a metre past the first floor's glass. Railing at the usual height |
| Second floor | glazed at the garages' front from 7.3 to 10.0 m | p2/p4 |
| Roof | 11 m (was 12), its pit-side edge 2.2 m out over the balcony | p3: white roofs, the front band (red canopies on the photo, not modelled: a plain white fascia) |

The stand (`upperStandLayout`) has no deck, posts, canopy, railings or step of its own. It stands on the room's floor:
the console along the glass (its lane face 0.14 m behind it), screens on the console, stools 1.1 m behind the glass, and
the people seated on them facing the lane. The team's banner sits on the balcony railing above, facing the lane. Its
length still comes from `PIT_WALL_SEATS`. It is kept inside the room end to end (`wallAt` clamps it with its half
length).

Not invented: no columns or beams that the photos don't show (the slabs are cantilevers, as the soffit on p1 shows), no
partitions between teams (the photos show modules, but which team has which module in 2025/2026 isn't known
from a source; the boxes come from the session's stops / the FIA plan).

## Other circuits

Unchanged. The room exists only where a venue's look has `upperRoom` (Monaco, key 22). `wallAt` for `stands: "upper"`
without a room returns no stand rather than one in the air. Every other venue keeps the v0.46/v0.47 rule (stands on
the walkway between the pit lane and the track, with the wall and fence on the track side): `test/monaco53.test.js`
"Monaco's room is Monaco's", plus the existing `pitwall45` / `stands47` tests.

## Checks

- `test/monaco53.test.js`: rays through the built geometry. The slab's soffit sits right on the openings' top (no gap);
  inside the room there is floor under, ceiling over, glazing out and back wall behind, at the stated distances; the
  second-floor facade starts on the slab, not through the room; the balcony slab is in place. All 10 stands pass
  `upperStandCheck` (on the room's floor to 0.02 m, every person to 1 mm, inside the glass, in front of the back wall,
  under the ceiling, within the run, including stands at the run's very ends). The v0.52 stand's numbers fail the same
  check.
- In the app: `Map3D.upperCheck()` (the same check on the stands as built, plus rays through the drawn facility:
  floor, ceiling, glass, slab over the lane), `Map3D.pitWallOrder`, `Map3D.standCheck`, `Map3D.garageCheck`, and fixed
  cameras (`Map3D.viewPits` / `viewLane` / `viewPitWall` – placed from the garage slots and the track's edge, the same in
  both builds) for 2025 and 2026. Results: reports/monaco.md (work folder).
