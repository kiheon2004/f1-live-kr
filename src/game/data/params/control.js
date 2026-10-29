// Race control coefficients (DESIGN §10): the safety car as a car, the VSC / SC minimum sector times, queueing, the start,
// restarts. Each: v (value), unit, est (true = game estimate), range, why (+ src when sourced). The RULES (what is
// allowed, when) come from data/rules/<season>.js; these are the physical / procedural numbers the rules leave open.
// "RCM probe" = f1kr-work/v048/research/control/rcm_probe.mjs over the 41 cached races' RaceControlMessages + TrackStatus
// (read-only) → f1kr-work/v048/logs/control_rcm_probe.log (2026-10-29).
const PROBE = "f1kr-work/v048/logs/control_rcm_probe.log (FIA race control messages of the 41 cached races, 2024–2026)";
export const CONTROL = {
  carLen: { v: 5.6, unit: "m", est: true, range: [5.4, 5.75], why: "car length for 'ten car lengths' and queue gaps (DESIGN §8 traffic uses the same)" },
  // ---- the safety car (a road car on the race track: Mercedes-AMG GT / Aston Martin Vantage class). Its pace is what it
  // can do through each corner and down each straight – computed from the track like any car, with road-car numbers.
  scALat: { v: 1.35, unit: "g", est: true, range: [1.1, 1.6], why: "safety car lateral grip (road-legal performance tyres on a rubbered track)" },
  scVMax: { v: 72, unit: "m/s", est: true, range: [60, 85], why: "safety car top speed on the straights while leading the field (~260 km/h)" },
  scABrake: { v: 1.1, unit: "g", est: true, range: [0.9, 1.4], why: "safety car braking" },
  scAAcc: { v: 0.5, unit: "g", est: true, range: [0.3, 0.7], why: "safety car acceleration at low speed (falls to 0 at scVMax)" },
  scCollect: { v: 0.75, unit: "×", est: true, range: [0.5, 0.95], why: "fraction of its pace the SC drives until the leader has caught it (race control tells it to slow and pick up the leader)" },
  scJoinS: { v: 4, unit: "s", est: true, range: [0, 15], why: "from 'SAFETY CAR DEPLOYED' to the SC leaving the pit exit (it waits at the exit ready)" },
  // the reference the minimum sector times are built on when the engine doesn't pass its own envelope (race.cache.refV):
  // a point-mass F1 car, a_lat = aLat·(1 + kDown·v²). Only the SHAPE matters much (slow corners slow, straights fast);
  // the level is set by minTimeSlow.
  refCar: { v: { aLat: 1.4, kDown: 0.0005, vMax: 85, aBrake: 4.0, aAcc: 1.0 }, unit: "g, 1/(m/s)², m/s, g, g", est: true, range: null, why: "reference car for the minimum-time profile when the engine passes none (race.cache.refV – a real car envelope is better). Fitted (grid search) so its lap ≈ 0.98 × the median green-flag race lap of the 2025 Suzuka / Monaco / Hungaroring / Monza fixture tracks: 1.045 / 0.954 / 0.991 / 0.940 – a calibration of the reference's level only (research/control/sc_pace_check.mjs → logs/control_sc_pace.log)" },
  // ---- queueing behind the SC / under red
  queueGap: { v: 18, unit: "m", est: true, range: [8, 56], why: "the gap drivers keep in the queue (rules: no more than ten car lengths – drivers weave and keep closer)" },
  queueMax: { v: 10, unit: "car lengths", est: false, range: [10, 20], why: "rules maximum gap in the SC queue", src: "SR 55.7 / 55.10 (2024–25), B5.13 / B5.15.2f (2026): ten car lengths (twenty in low visibility)" },
  queueBrake: { v: 1.2, unit: "g", est: true, range: [0.6, 2.0], why: "deceleration a queued driver plans with when closing on the car ahead (comfortable, not a stop)" },
  // ---- minimum sector times (VSC, and SC until a car crosses SC line 1 the second time)
  marshalSector: { v: 250, unit: "m", est: true, range: [150, 400], why: "length of a marshalling sector (between FIA light panels) – circuits have ~20–30 panels; the real panel positions are not in the scenario, so the lap is cut in equal sectors of about this length" },
  minTimeSlow: { v: 0.35, unit: "fraction", est: true, range: [0.28, 0.42], why: "the ECU minimum time of a sector = reference racing time × (1 + this). The FIA's per-circuit values are not public; measured instead: laps run entirely under the VSC are 1.34× the race's median green lap (8 races with ≥3 such laps, p10–p90 1.28–1.41: f1kr-work/v048/logs/control_neutral_laps.log, research/control/neutral_laps_probe.mjs over the read-only cache)" },
  ghostGain: { v: 25, unit: "m", est: true, range: [10, 60], why: "a driver keeping the delta: speed = the minimum-time pace × (1 + metres behind the delta ghost / this) – catches up after a slow corner, backs off when ahead" },
  vscGraceSectors: { v: 1, unit: "sectors", est: true, range: [0, 2], why: "the sector in which the VSC / SC is declared is not checked (the driver needs it to slow down)" },
  vscEndDelay: { v: [10, 15], unit: "s", est: false, range: [10, 15], why: "'VSC ENDING' → green: drawn uniformly (seeded) in the rules' window", src: "SR 56.7 / B5.12: 10–15 s; RCM probe: 32 VSC endings 10.1–14.9 s, " + PROBE },
  passPace: { v: 1.3, unit: "× SC pace", est: true, range: [1.1, 1.6], why: "cars unlapping or driving round to the back of the SC queue: 'an appropriate speed' (SR 55.14 / B5.13) – quicker than the queue" },
  // ---- restarts
  restartGo: { v: [150, 700], unit: "m before the line", est: true, range: [50, 1500], why: "where the leader chooses to accelerate when the SC has gone in (seeded per restart within this window)" },
  restartPace: { v: 1.0, unit: "× SC pace", est: true, range: [0.7, 1.2], why: "the leader's pace before he goes (backs the field up at about the SC's speed)" },
  // ---- red flag
  redScOutMs: { v: 110e3, unit: "ms before the resumption", est: true, range: [61e3, 120e3], why: "2026: the SC leaves for its resumption position after the lapped cars' release (2 min) and before the 1-min signal (B5.15.2d)" },
  redSlotGap: { v: 8, unit: "m", est: true, range: [6, 12], why: "spacing of the cars queued in the fast lane" },
  redHead: { v: 12, unit: "m", est: true, range: [0, 40], why: "first car's stop point before the end of the pit lane (the exit light)" },
  redMinMs: { v: 15 * 60e3, unit: "ms", est: true, range: [10 * 60e3, 60 * 60e3], why: "a red flag lasts at least this (barrier work, the 10-min notice; RCM probe: resume announced 17–63 min after the 4 red flags)" },
  redNoticeMs: { v: 10 * 60e3, unit: "ms", est: false, range: [10 * 60e3, 10 * 60e3], why: "resumption announced at least 10 min ahead", src: "SR 58.2 (2024–25), B5.15.2 (2026)" },
  redLappedEarlyMs: { v: 2 * 60e3, unit: "ms", est: false, range: [2 * 60e3, 2 * 60e3], why: "lapped cars (and cars between SC and leader) leave 2 min before the resumption for an extra lap", src: "B5.15.2c (2026); SR 58 (2024–25) – the same 2 min used (est for 2024–25 timing)" },
  redWheelsMs: { v: 5 * 60e3, unit: "ms", est: false, range: [5 * 60e3, 5 * 60e3], why: "wheels fitted at the 5-min signal: free tyre changes end there", src: "SR 58 / B5.15.2b" },
  // ---- the start (grid behind the line, lights, reactions)
  gridRow: { v: 16, unit: "m", est: false, range: [16, 16], why: "rows 16 m apart, staggered 1×1 → consecutive slots 8 m apart", src: "SR 42.5 (2024–25), B5.1.2 (2026) via data/rules start.value.grid" },
  gridPole: { v: 3, unit: "m behind the line", est: true, range: [0, 15], why: "pole slot behind the start line (circuit-specific; scenario.track.grid.pole overrides)" },
  gridSide: { v: 2.0, unit: "m", est: true, range: [1.5, 3.5], why: "lateral offset of a grid slot from the lap line (left/right alternate)" },
  lightGap: { v: 1.0, unit: "s", est: false, range: [1, 1], why: "red lights come on 1 s apart", src: "B5.7.2 (2026); 2024–25 SR 44.10b does not state the interval – the same 1 s used (est for 2024–25)" },
  lightsOut: { v: [0.4, 3.0], unit: "s after the fifth light", est: true, range: [0.2, 4], why: "the starter's hold after the fifth light (at his discretion – drawn uniformly, seeded)" },
  preStartS: { v: 5, unit: "s", est: false, range: [5, 5], why: "2026 grid panels flash blue 5 s ('Pre-Start') before the first red light", src: "B5.7.2 (2026); none in 2024–25" },
  reaction: { v: { mean: 0.20, sd: 0.035, min: 0.12, max: 0.35 }, unit: "s", est: true, range: [0.12, 0.4], why: "driver reaction lights-out → moving (seeded per driver, normal truncated)" },
  falseStartP: { v: 0.0085, unit: "1/driver-start", est: false, range: [0.002, 0.02], why: "chance a driver moves before lights out (anticipation)", src: "RCM probe: 7 'FALSE START – MOVING BEFORE SIGNAL' notes in 41 races × ~20 cars, " + PROBE },
  falseStartBy: { v: [0.05, 0.25], unit: "s before lights out", est: true, range: [0, 0.5], why: "how early an anticipating driver moves" },
  launchQ: { v: [0.92, 1.0], unit: "fraction", est: true, range: [0.85, 1.0], why: "launch quality (clutch / wheelspin) – a multiplier on the traction the car model can use for the launch, seeded per driver" },
  // ---- pit exit, DRS, flags
  pitExitHold: { v: 150, unit: "m", est: true, range: [50, 400], why: "under the SC the pit exit light is red while the SC or the queue is this close before the exit" },
  mergeClear: { v: 30, unit: "m", est: true, range: [10, 80], why: "behind the SC a car leaves the pit lane only when the SC / the car ahead is this far past the merge (one at a time, no pile-up at the exit)" },
  wetDrsWater: { v: 0.5, unit: "mm", est: true, range: [0.2, 1.5], why: "mean water on the racing line above which race control keeps DRS disabled (rules: RD may disable in poor visibility / wet)" },
  yellowUtil: { v: { single: 0.97, double: 0.90 }, unit: "× grip use", est: true, range: [0.85, 1.0], why: "drivers lift under a local yellow (single: reduce speed, double: be prepared to stop) – applied to the driver's grip utilisation inside the zone, not to a lap time" },
  yellowLen: { v: 350, unit: "m", est: true, range: [150, 800], why: "length of a local yellow zone around an incident (the marshalling sector(s) concerned)" },
  unlapMinLapsLeft: { v: 3, unit: "laps", est: true, range: [1, 6], why: "race control lets lapped cars unlap only if at least this many laps remain (RCM probe: lapped-cars message in 8 of 29 SC periods)" },
  drsAfterVscLaps: { v: 1, unit: "laps", est: true, range: [0, 2], why: "DRS re-enabled after this many laps after a VSC (rules state it for the SC only)" },
  cooldown: { v: 0.6, unit: "× minimum-time pace", est: true, range: [0.4, 1.0], why: "pace on the slowing-down lap after the flag" },
};
export const CONTROL_PARAMS_VERSION = 1;
