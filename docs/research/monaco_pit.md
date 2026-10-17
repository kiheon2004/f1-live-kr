# Monaco pit lane – what the app draws and how it was checked (v0.36, 2026-10-17)

Code: `src/renderer/facilities.js` `PIT_LAYOUTS[22]`, `layoutOutline`, `genericPitSpec` (its `toTrack`), `facilitiesFor`.

## Sources

| What | Source | Date | Season | Kind |
|---|---|---|---|---|
| Pit lane on the harbour side of the start/finish straight, entry between T17 and T18, exit road along the straight to T1 | FIA, Monaco GP pit lane drawings, 2025 V2 and 2026 V1 (event documents) | 2025 / 2026 | 2025, 2026 | confirmed (drawing) |
| Garages "sit between the pit straight and pit lane", roughly half the width of other circuits', ground floor + first floor with the pit wall gantry + top floor | Williams Racing, Monaco feature, 2023-05-23 | 2023 | 2023 (temporary building put up each year) | confirmed (team) – widths/heights not given |
| "The pitwall is upstairs" | Autosport, 2016-05-29 (Horner) | 2016 | 2016 | confirmed (quote) |
| Lane, garages and Piscine section seen from above | Esri World Imagery, capture 2025-08-07 (no race build-up) | 2025 | – | check only, not in the app |

FIA F2/F3 Monaco sheets give a 6.8 m working area; they are not F1 values and are used only as an order of size, marked estimate.

## Estimates (no source gives them)

Garage pitch 5.5 m, building 12 m high, front 8 m from the measured pit path, depth up to 14 m (short of the straight's tarmac by 2 m), a wall along the fast lane's far side 11 m out, the teams' stands on the first floor.

## The v0.35 regression and its fix

v0.35 gave the venue a fixed side for the building's outline, but the builder still decided which face is the garages' front from the global "direction to the nearest track". Along most of this lane the nearest track is the straight right behind the building, so the garage openings faced the straight. Every car in the lane was 22 m in front of the garages (projection `off = -22`), outside the garage run, and never reached "in box":

- 2025 race, full scan every 1 s: `entry` 7014, `fast lane` 32, `in box` 0.
- Tsunoda (#22), lap-1 stop, t = 3 466 000 ms: v0.35 `state: entry, off: -22`.

v0.36: the spec built for a venue's layout carries its own side (`genericPitSpec` → `toTrack`), and `facilitiesFor` passes it to the builder.

- Same moment: `state: in box, off: 3.6 (feed 8.0)`, box u = -33 (team box from the order, marked estimate), crew working.
- Stop sequence #22: fast lane → to box (u -45) → in box (u -33, standing 2.2 s) → leaving box → fast lane → exit.
- 2026 race: Bortoleto (#5) standing at the restart, t = 3 428 739 ms: `pit start: waiting` on the fast lane (u 66.8).
- Regression test: `test/facilities.test.js` "Monaco pit layout: the garages open onto the lane" (fails on v0.35 with off -22).

Images (work folder, not in the app): `monaco2025_pit_top_before_v035.png` / `monaco2025_pit_top_after.png` (same camera), `monaco2025_stop_before_v035.png` / `monaco2025_stop_after.png`, `monaco2026_pitstart_after.png`, `monaco_imagery_2025-08.png`.

## Not verified

- 2026: the measured pit path comes from the session data of each season, but the 2026 race archive has almost no car positions, so only the one pit-start moment above was checked. No 2026 stop was seen. The 2025 result is not assumed for 2026.
- Garage count per team and which garage belongs to which team are not in the data. The team box comes from stops when there are any, otherwise from the previous constructors' order (marked so on screen).
