// 2025 FIA Formula One rules the race engine needs – DATA ONLY (no logic). One object, one entry per rule; every entry has
// `src` (document + article + URL + access date) and `implemented: false` (the engine flips it to true – in this file –
// when, and only when, it really enforces that rule; the UI shows "미구현" for false). `verified: false` marks a value
// that could not be checked in a primary source (then `note` says what it rests on).
// Research notes with the full reading: docs/game/research/rules-2025.md. Read on 2026-10-29.
//
// Documents (the latest issues the FIA site lists for 2025, fetched 2026-10-29):
//   SR = 2025 F1 Sporting Regulations, Issue 5, 30 Apr 2025
//   TR = 2025 F1 Technical Regulations, Issue 3, 07 Apr 2025
//   RDN = 2025 Dutch GP Race Director's Event Notes (Doc 5, 28 Aug 2025) – event-level instructions, an example of the
//         per-event documents; values there can differ per event.
const AT = "2026-10-29";
const SR = "https://www.fia.com/system/files/documents/fia_2025_formula_1_sporting_regulations_-_issue_5_-_2025-04-30.pdf";
const TR = "https://www.fia.com/sites/default/files/documents/fia_2025_formula_1_technical_regulations_-_issue_03_-_2025-04-07.pdf";
const RDN = "https://www.fia.com/system/files/decision-document/2025_dutch_grand_prix_-_race_directors_event_notes_.pdf";
const sr = (art) => ({ doc: "FIA 2025 F1 Sporting Regulations Iss 5 (2025-04-30)", art, url: SR, accessed: AT });
const tr = (art) => ({ doc: "FIA 2025 F1 Technical Regulations Iss 3 (2025-04-07)", art, url: TR, accessed: AT });
const rdn = (art) => ({ doc: "FIA 2025 Dutch GP Race Director's Event Notes (2025-08-28)", art, url: RDN, accessed: AT });
const R = (value, src, more) => ({ value, src, implemented: false, verified: true, ...more });

export default {
  season: 2025, schema: 1,
  docs: { SR: { title: "2025 Formula 1 Sporting Regulations", issue: 5, date: "2025-04-30", url: SR },
          TR: { title: "2025 Formula 1 Technical Regulations", issue: 3, date: "2025-04-07", url: TR } },

  // ---------- points & classification ----------
  points: R({ race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], sprint: [8, 7, 6, 5, 4, 3, 2, 1], fastestLap: null }, sr("6.4"),
    { note: "no fastest-lap point in 2025 (it existed 2019–2024)" }),
  pointsShortened: R({ minLeaderLaps: 2, minGreenLapsForReducedScale: 2, // laps by the leader without SC/VSC (6.5 b)
      bands: [{ fracMin: 0, scale: [6, 4, 3, 2, 1] }, { fracMin: 0.25, scale: [13, 10, 8, 6, 5, 4, 3, 2, 1] },
              { fracMin: 0.5, scale: [19, 14, 12, 10, 8, 6, 4, 3, 2, 1] }, { fracMin: 0.75, scale: "full" }] }, sr("6.5"),
    { note: "fraction = leader's distance / scheduled race distance at the end-of-session signal" }),
  classification: R({ order: "laps completed desc, then order of crossing the Line", minFracOfWinnerLaps: 0.9, round: "down" },
    sr("62.1–62.2"), { note: "unclassified if < 90 % of the winner's laps, the 90 % figure rounded DOWN to whole laps" }),
  resultIfNotResumed: R({ takeAt: "end of the penultimate lap before the lap in which the suspension signal was given" }, sr("58.14")),
  finishSignal: R({ rule: "chequered flag when the leader has covered the full distance; if shown early the race ends at the leader's last crossing before it; if late, when it should have ended" }, sr("59.1–59.2")),

  // ---------- distance & time ----------
  distance: R({ raceMinKm: 305, monacoMinKm: 260, sprintMinKm: 100, laps: "least number of complete laps exceeding the distance" },
    sr("5.3a, 5.4, 5.4a")),
  timeLimit: R({ raceMs: 2 * 3600e3, raceMaxWithSuspensionMs: 3 * 3600e3, sprintMs: 3600e3, sprintMaxWithSuspensionMs: 1.5 * 3600e3,
      endRule: "leader shown the flag at the end of the lap FOLLOWING the lap in which the period ended (never beyond the scheduled laps)",
      suspensionAddsToPeriod: true, scStartClockFrom: "green lights when the SC leaves the grid (formation behind SC)" },
    sr("5.3a ii–iii, 5.4c–d")),
  scStartLapReduction: R({ rule: "laps reduced by (laps behind the safety car − 1) when the formation lap starts behind the SC" }, sr("5.4b, 49.1")),

  // ---------- tyres ----------
  tyreSpecsPerEvent: R({ dry: 3, intermediate: 1, wet: 1 }, sr("30.1a i")),
  tyreAllocation: R({ standard: { dry: 13, hard: 2, medium: 3, soft: 8, inter: 5, wet: 2 },
      sprint: { dry: 12, hard: 2, medium: 4, soft: 6, inter: 5, wet: 2 }, monacoWetSets: 3 }, sr("30.2a, 30.2d"),
    { note: "game: a race-only scenario needs only which sets are left for the race – the scenario builder decides that (estimate unless known)" }),
  mandatoryDryCompounds: R({ minDistinctDrySpecs: 2, atLeastOneMandatorySpec: true, exemptIfInterOrWetUsed: true,
      penalty: "disqualification", ifSuspendedAndNotRestarted: "+30 s to elapsed time",
      monaco: { minSetsAnySpec: 3, ifSuspendedNotRestarted: "+30 s (only 2 sets used), +60 s (1 set)" } }, sr("30.5m"),
    { note: "Monaco 3-set rule is NEW in 2025 (not in 2024)" }),
  tyreUsedWhen: R({ pitLane: "when the transponder shows the car left the pit lane with them", grid: "when the car leaves its grid slot under its own power" }, sr("30.5c")),
  wrongTyres: R({ maxLineCrossings: 2, penalty: "stop-go 10 s (54.3d)" }, sr("30.5b")),
  wetTyresBehindSc: R({ rule: "wet-weather tyres compulsory until the SC orange lights go out and it returns to the pits when the start/resumption is behind the SC with wets mandated; changing spec meanwhile = stop-go" },
    sr("30.5n, 49.1a, 58.1")),
  tyreBlankets: R({ permitted: "blankets only, ≤3 zones, homologated (TR 10.8.4d, 10.8.5)", inPitLaneDuringRace: false,
      removeBefore: "tyres carried to the pit-stop area", grid: "disconnected from power at the 5-min signal" },
    { ...sr("26.17, 44.4b"), also: tr("10.8.4d, 10.8.5") },
    { note: "temperature limits are in the per-event Pirelli/FIA prescription sheets (SR 30.5a), not the SR: 2025 sheets read: slicks 70 °C, intermediates 60 °C (max 2 h per range), wets no blankets; tread/sidewall temperature (see tyres.md)", blanketMaxC: { slick: 70, inter: 60, wet: null } }),
  compoundRange: R({ dry: ["C1", "C2", "C3", "C4", "C5", "C6"], hardest: "C1" },
    { doc: "formula1.com, 'What tyres … 2025 Emilia-Romagna GP' (C6 debut)", art: "–", accessed: AT,
      url: "https://www.formula1.com/en/latest/article/what-tyres-will-the-teams-and-drivers-have-for-the-2025-emilia-romagna-grand.2zbwVinaEBPAb8YLDslZ8n" },
    { verified: false, note: "Pirelli's own 2025 range release not fetched; C1–C6 from F1.com + press (see tyres.md)" }),
  refuelling: R({ duringRace: false }, sr("36.2"), { note: "fuel may not be added/removed after the car leaves for the reconnaissance lap until the flag" }),

  // ---------- pit lane & pit stops ----------
  pitSpeedLimit: R({ defaultKmh: 80, perEvent: "Race Director may amend (Safety Delegate recommendation)",
      penaltyInRace: "5 s / 10 s / drive-through / stop-go (54.3a–d) at the stewards' choice" }, sr("34.7"),
    { note: "per-event values MEASURED from the read-only session cache (CarData speed plateaus ≥3 s within ±1 km/h, 50–100 km/h: f1kr-work/v048/research/pitspeed_probe.py → pitspeed_probe.log); races not cached: default unless an event note says otherwise",
      measuredKmh: { default: 80, "Monaco": 60 } /* all 24 cached 2025 races: 80 except Monaco (Melbourne, Zandvoort, Singapore = 80) */ }),
  pitLaneLayout: R({ fastLaneMaxWidthM: 3.5, workOnlyIn: "inner lane", noPoweredLifting: true, noReversingUnderPower: true,
      pitStopPositionsPerTeam: 1 }, sr("34.4, 34.5, 34.6, 34.3")),
  doubleStack: R({ rule: "one pit-stop position per team (34.5) → a team-mate arriving while the first car is in the box must wait; no rule forbids it" },
    sr("34.5"), { note: "the queueing is a CONSEQUENCE of 34.5, not an explicit article" }),
  unsafeRelease: R({ releasedWhen: "car has completely cleared its pit stop position", forbidden: "endangering personnel / another driver, or likely to damage another car",
      penaltyInRace: "stop-go 10 s (54.3d)", continuingKnowinglyUnsafe: "additional penalty" }, sr("34.14")),
  pitEntryClosed: R({ allowed: "only essential, evident repairs", penalty: "stop-go 10 s" }, sr("34.15")),
  pitExit: R({ rule: "leave only on green light; blue flag/light at the exit warns of cars on track" }, sr("53.1")),
  pitEntryUnderSc: R({ rule: "no car may enter the pits under SC unless to change tyres (except when all cars are routed through the pit lane)" }, sr("55.12")),
  pitEntryUnderVsc: R({ rule: "no car may enter the pits under VSC unless to change tyres" }, sr("56.4")),

  // ---------- penalties ----------
  penalties: R({
      fiveSec: { serve: "stop ≥5 s in pit stop position at the NEXT pit entry (incl. under SC/VSC); no work until served", orAdd: "+5 s if no further stop" },
      tenSec: { serve: "same as 5 s with 10 s", orAdd: "+10 s if no further stop" },
      driveThrough: { serve: "enter pit lane, rejoin without stopping", maxLineCrossings: 2 },
      stopGo: { stopS: 10, workAllowed: false, maxLineCrossings: 2 },
      notUnderScVsc: "drive-through / stop-go may not be served under VSC or after SC deployed (unless already in pit entry); laps behind SC/VSC added to the 2 crossings",
      lastThreeLapsOrAfter: { fiveSec: 5, tenSec: 10, driveThrough: 20, stopGo: 30, unit: "s added to elapsed time" },
      unservable: "grid penalty at next race (stewards' discretion)" }, sr("54.3a–d, 54.4b–d")),

  // ---------- safety car ----------
  safetyCar: R({ deploy: "SC joins with orange lights regardless of the leader's position", queueMaxGap: "10 car lengths",
      minTime: "stay above the FIA ECU minimum time in each marshalling sector and at SC lines until crossing SC line 1 for the 2nd time",
      overtaking: "none on track until the Line after the SC has returned to the pits, except: SC green light; entering the pits after SC line 1; leaving the pits before SC line 2; SC returning may be passed after SC line 1; within pit entry/lane/exit; car with obvious problem",
      carsBetweenScAndLeader: "may be waved past (green light) and rejoin the queue at the back without overtaking",
      lappedCars: "when 'LAPPED CARS MAY NOW OVERTAKE' – cars lapped at the Line after the lap in which they passed SC line 1 a 2nd time pass the lead-lap cars and the SC; SC comes in at the end of the FOLLOWING lap",
      scIn: "'SAFETY CAR IN THIS LAP', lights out; leader dictates pace, may fall back >10 lengths; no erratic acceleration/braking; green at the Line",
      lapsCount: true, lastLap: "SC still out at the start of / deployed in the last lap → SC enters pits at end of lap, cars take the flag without overtaking",
      pitLaneUse: "RD may route all cars + SC through the pit lane (drive-through penalty if a car does not)" },
    sr("55.3–55.17")),
  virtualSafetyCar: R({ minTime: "above the FIA ECU minimum time once in each marshalling sector and at both SC lines; also when panels turn green",
      overtaking: "none, except pit entry after SC line 1 / pit exit before SC line 2 / within pit lane / car with obvious problem",
      ending: "'VSC ENDING' then 10–15 s later panels turn green and racing resumes immediately (green extinguished after 30 s)", lapsCount: true },
    sr("56.1–56.8")),

  // ---------- red flag ----------
  redFlag: R({ onSignal: "no overtaking, pit exit closed, all cars slowly to the pit lane; first car to the pit exit in the fast lane, others queue behind (or on the grid if pit entry closed)",
      order: "order at the last point it was possible to determine the position of all cars; cars in their garage at the back",
      clock: "session and timekeeping do NOT stop; suspension time is added to the 2 h period (max 3 h total)",
      workAllowed: ["start engine", "compressed gases", "cooling/heating devices", "brake & radiator ducts", "driver comfort", "change wheels and tyres", "genuine accident damage repair", "front wing adjustment (existing parts)", "heat-hazard coolant"],
      tyreChange: "free (permitted work) – but wheels must be fitted at the 5-min signal; changing them before leaving after resumption = stop-go",
      resume: "≥10 min notice; SC leads out when pit exit opens; lapped cars + cars between SC and leader may do an extra lap to rejoin the back; then STANDING START PROCEDURE (grid) or ROLLING START PROCEDURE (SC in, green at the Line) chosen by RD (message by the 1-min signal); SC may stay in the pit lane for a standing restart",
      noOvertakeUntil: "rolling: the Line after the SC returns to the pits" },
    sr("57.1–57.5, 58.1–58.14")),

  // ---------- flags / lapping ----------
  blueFlags: R({ preWarningGapS: 3.0, blueGapS: 1.2, rule: "lapped driver must let the faster car past at the first available opportunity (ISC)" },
    rdn("3"), { verified: true, note: "values from ONE event's notes (Zandvoort 2025); assumed the same at other 2025 events – check per event" }),
  trackLimits: R({ trackEdge: "white lines are track, kerbs are not; a car has left the track when no part touches it", lapTimeDeleted: "each failure → lap time invalidated (qualifying & race)",
      raceSanction: "stewards' penalty guidelines (warning/black-and-white flag, then time penalties) – not in the regulations" },
    { ...sr("33.3"), also: rdn("21") },
    { verified: false, note: "the count → penalty ladder (e.g. 3rd = black-and-white flag, 4th = 5 s) is from press explainers, not a fetched FIA document" }),

  // ---------- start ----------
  start: R({ grid: "staggered 1×1, rows 16 m apart", formation: "pole leads; pit-lane speed limit until past pole; no practice starts; keep tight; overtaking only to restore order",
      lights: "once all cars have stopped: the 5-, 4-, 3-, 2- and 1-second lights appear in turn; lights out at any time after the 1-second light (44.10b) – the light interval itself is not stated in the SR", pitLaneStart: "join once all cars on track have passed the pit exit after the start",
      falseStart: "moved after the 4-second light and before lights out → 5 s / 10 s / drive-through", abortedStart: "restart from 10-min signal; race shortened by 1 lap; the cause starts from the pit lane",
      extraFormationLap: "race shortened by 1 lap each time", scStart: "formation behind SC; standing or rolling start chosen by RD; laps reduced by SC laps − 1",
      mguKAtStart: "MGU-K only after 100 km/h at a standing start (TR energy-flow diagram)" },
    { ...sr("42.5, 44.1–44.13, 45, 47, 48, 49–52"), also: tr("5.3.2 (energy-flow diagram)") }),

  // ---------- DRS (2011–2025) ----------
  drs: R({ zones: "pre-determined activation zones per circuit (event notes)", enabledAfterLaps: 1, enabledAfterSc: "1 lap after the SC period",
      detectionGapS: 1.0, at: "detection points", disabledOn: "first brake application after activation",
      rdMayDisable: "at absolute discretion; poor visibility; yellow flags in the activation zone", flapGapMaxMm: 85 },
    { ...sr("22.1a–i"), also: tr("3.10.10g") },
    { note: "'completed one lap after the start' – so usable from lap 2 at the earliest (RD enables it by message: RaceControlMessages 'DRS ENABLED')" }),

  // ---------- power unit / energy ----------
  ers: R({ mguKMaxKw: 120, mguKMaxNm: 200, esToMguKPerLapMJ: 4, mguKToEsPerLapMJ: 2, mguH: "unlimited (MGU-H ↔ ES/MGU-K)",
      socWindowMJ: 4, lap: "lap measured line to line; on pit entry the lap ends at the pit-lane start" },
    tr("5.3.2 (energy-flow diagram p.53), 5.3.3")),
  fuel: R({ maxMassFlowKgH: 100, below10500rpm: "Q(kg/h) = 0.009·N(rpm) + 5.5", partLoad: "Q = 10 below −50 kW, else 0.257·P(kW) + 22.85",
      raceFuelCapKg: null, refuelInRace: false }, tr("5.2.3–5.2.5"),
    { note: "no race fuel-quantity cap found in the 2025 TR text (a 110 kg cap is widely quoted – NOT verified, raceFuelCapKg left null)" }),

  // ---------- car ----------
  minMass: R({ kg: 800, includes: "driver in racing apparel, without fuel", heatHazardKg: { race: 5, quali: 2 } }, tr("2.4, 4.1, 4.7")),
  dimensions: R({ maxHalfWidthMm: 1000, widthNote: "no part outboard of Y=1000 except tyres, rims, wheel covers", maxWheelbaseMm: 3600,
      tyreWidthMm: { front: [345, 375], rear: [440, 470] }, tyreDiaMaxMm: { dry: 725, wet: 735 } }, tr("3.4.1, 3.4.2, 10.8.1")),
};
