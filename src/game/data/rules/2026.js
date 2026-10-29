// 2026 FIA Formula One rules the race engine needs – DATA ONLY (no logic). Same keys as 2024.js / 2025.js where the rule
// exists in both eras; DRS is gone (drs: null) and activeAero / overtakeMode / ers are new. Every entry has `src`
// (document + article + URL + access date) and `implemented: false` (the engine flips it in this file when it really
// enforces the rule; the UI shows "미구현" for false). `verified: false` = not checked in a primary source (see `note`).
// Research notes with the full reading: docs/game/research/rules-2026.md. Read on 2026-10-29.
//
// Documents (latest issues listed on fia.com/regulation/category/110 on 2026-10-29):
//   A = 2026 F1 Regulations Section A [General Regulatory Provisions], Issue 03, 25 Jun 2026 (points)
//   B = 2026 F1 Regulations Section B [Sporting], Issue 09, 01 Oct 2026 (WMSC 30 Sep 2026)
//   C = 2026 F1 Regulations Section C [Technical], Issue 21, 19 Oct 2026
// Event-level values (activation zones, Overtake detection gap/lines, recharge limit per event) are set per circuit by
// the FIA (B7.1.1e, B7.2.1b); values below marked "per event" come from earlier research notes on FIA event documents
// (f1kr-work/v044/research/aero_web.md, sources inside it, not re-fetched this round).
const AT = "2026-10-29";
const A = "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_a_general_provisions_-_iss_03_-_2026-06-25.pdf";
const B = "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_09_-_2026-10-01.pdf";
const C = "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_21_-_2026-10-19.pdf";
const a = (art) => ({ doc: "FIA 2026 F1 Regulations Section A Iss 03 (2026-06-25)", art, url: A, accessed: AT });
const b = (art) => ({ doc: "FIA 2026 F1 Regulations Section B [Sporting] Iss 09 (2026-10-01)", art, url: B, accessed: AT });
const c = (art) => ({ doc: "FIA 2026 F1 Regulations Section C [Technical] Iss 21 (2026-10-19)", art, url: C, accessed: AT });
const V044 = { doc: "LiveTimingKR v0.44 research notes on FIA 2026 event documents (aero_web.md)", art: "B/C sections", url: null, accessed: AT };
const R = (value, src, more) => ({ value, src, implemented: false, verified: true, ...more });

export default {
  season: 2026, schema: 1,
  docs: { A: { title: "2026 F1 Regulations – Section A General Regulatory Provisions", issue: 3, date: "2026-06-25", url: A },
          B: { title: "2026 F1 Regulations – Section B Sporting", issue: 9, date: "2026-10-01", url: B },
          C: { title: "2026 F1 Regulations – Section C Technical", issue: 21, date: "2026-10-19", url: C } },

  // ---------- points & classification ----------
  points: R({ race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], sprint: [8, 7, 6, 5, 4, 3, 2, 1], fastestLap: null }, a("A2.2.1, A2.2.2")),
  pointsShortened: R({ minLeaderLaps: 2, minGreenLapsForReducedScale: 2, greenLapsMustBeConsecutive: true,
      bands: [{ fracMin: 0, scale: [6, 4, 3, 2, 1] }, { fracMin: 0.25, scale: [13, 10, 8, 6, 5, 4, 3, 2, 1] },
              { fracMin: 0.5, scale: [19, 14, 12, 10, 8, 6, 4, 3, 2, 1] }, { fracMin: 0.75, scale: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] }],
      sprintMinFrac: 0.5 }, a("A2.2.1a–d, A2.2.2"),
    { note: "2026 wording: no points unless 'two complete and consecutive laps' by the leader without SC/VSC" }),
  classification: R({ order: "laps completed desc, then order of crossing the Control Line", minFracOfWinnerLaps: 0.9, round: "down" }, b("B2.5.5")),
  resultIfNotResumed: R({ takeAt: "end of the penultimate lap before the lap in which the suspension signal was given" }, b("B5.14.2")),
  finishSignal: R({ rule: "chequered flag at the Control Line ON THE TRACK (not the pit lane) when the leader has covered the distance; early flag → last crossing before it; late flag → when it should have ended" }, b("B5.16.1–B5.16.2")),

  // ---------- distance & time ----------
  distance: R({ raceMinKm: 305, monacoMinKm: 260, sprintMinKm: 100, laps: "least number of complete laps exceeding the distance" }, b("B2.5.2, B2.3.2")),
  timeLimit: R({ raceMs: 2 * 3600e3, raceMaxWithSuspensionMs: 3 * 3600e3,
      endRule: "leader shown the flag at the end of the lap FOLLOWING the lap in which the period ended (never beyond the scheduled laps)", suspensionAddsToPeriod: true },
    b("B2.5.3a–b")),
  scStartLapReduction: R({ rule: "laps reduced by (laps behind the safety car − 1) when the formation lap starts behind the SC" }, b("B2.5.2a, B5.10.7")),

  // ---------- tyres ----------
  tyreSpecsPerEvent: R({ dry: 3, intermediate: 1, wet: 1 }, b("B6.1.1a")),
  tyreAllocation: R({ standard: { hard: 2, medium: 3, soft: 8, inter: 5, wet: 2, maxDryUsable: 13 },
      sprint: { hard: 2, medium: 4, soft: 6, inter: 6, wet: 2, maxDryUsable: 12 }, ictt: { hard: 2, medium: 3, soft: 7, inter: 5, wet: 2, maxDryUsable: 12 } },
    b("B6.2.4, B6.3.4"), { note: "'Alternative Format' = sprint weekend; ICTT = in-competition tyre testing weekend" }),
  mandatoryDryCompounds: R({ minDistinctDrySpecs: 2, atLeastOneMandatorySpec: true, exemptIfInterOrWetUsed: true,
      penalty: "disqualification", ifSuspendedAndNotRestarted: "+30 s to elapsed time", monaco: null }, b("B6.3.6"),
    { note: "the 2025 Monaco 3-set rule is NOT in Section B Iss 09 (B6.3.6 has no Monaco clause)" }),
  tyreUsedWhen: R({ pitLane: "when the transponder shows the car left the pit lane with them", grid: "when the car leaves its grid slot under its own power" }, b("B6.3.2")),
  wrongTyres: R({ maxLineCrossings: 2, penalty: "stop-and-go" }, b("B6.3.1")),
  wetTyresBehindSc: R({ rule: "wet-weather tyres compulsory until the SC orange lights go out and it returns to the pit lane, when the formation (B5.10.1a) or resumption (B5.15.2a) behind the SC is declared 'WET WEATHER TYRES MUST BE USED'; other spec meanwhile = stop-and-go" },
    b("B6.3.7, B5.10.1a, B5.15.2a")),
  tyreBlankets: R({ permitted: "blankets only, ≤3 zones, homologated (C10.8.3d, C10.8.4)", inPitLaneDuringRace: false,
      removeBefore: "tyres carried to the pit-stop area", grid: "disconnected from power at the 5-min signal" },
    { ...b("B5.1.5, B5.5.3b"), also: c("C10.8.3d, C10.8.4") },
    { note: "blanket temperature limits are in FIA/Pirelli prescriptions (FIA-F1-DOC-062, B6.1.3a) – not fetched" }),
  compoundRange: R({ dry: ["C1", "C2", "C3", "C4", "C5"], hardest: "C1", note: "C6 dropped; 18-inch tyres, narrower than 2025" },
    { doc: "Pirelli press release 'The range of compounds for the 2026 season has been set' (24 Nov 2025)", art: "–", accessed: AT,
      url: "https://press.pirelli.com/the-range-of-compounds-for-the-2026-season-has-been-set/" }),
  refuelling: R({ duringRace: false }, b("B5.1.4"), { note: "no fuel added/removed after leaving for the reconnaissance lap until the flag" }),

  // ---------- pit lane & pit stops ----------
  pitSpeedLimit: R({ defaultKmh: 80, perEvent: "Race Director may amend", penaltyInRace: "5 s / 10 s / drive-through / stop-and-go" }, b("B1.6.3a"),
    { note: "Monaco 2026 amended to 60 km/h per a stewards' document quoting the RD note (press summary, not fetched) – measure per race from cached pit-lane CarData" }),
  pitLaneLayout: R({ workOnlyIn: "inner lane (fast lane only at the end of the pit lane for pit-lane starters / suspensions)", noPoweredLifting: true,
      noReversingUnderPower: true, pitStopPositionsPerTeam: 1, pitStopCamera: "one per team above the pit stop position" }, b("B1.6.1, B1.6.3b–c")),
  doubleStack: R({ rule: "one Designated Pit Stop Position per team (B1.6.1) → the second car waits; no article forbids it" }, b("B1.6.1"),
    { note: "a CONSEQUENCE of B1.6.1, not an explicit article" }),
  unsafeRelease: R({ releasedWhen: "rear axle has passed the position the front axle occupied while stationary in the pit stop position (or out of the garage area)",
      forbidden: "unsafe situation, endangering personnel or another driver, clear and immediate risk of contact, likely damage; also releasing in an unsafe CONDITION",
      penaltyInRace: "stop-and-go", continuingKnowinglyUnsafe: "additional penalty" }, b("B1.6.2"),
    { note: "release point is NEW in 2026 (2024/25: 'completely cleared its pit stop position')" }),
  pitEntryClosed: R({ allowed: "only essential, evident repairs", penalty: "stop-and-go" }, b("B1.6.4")),
  pitExit: R({ rule: "leave only on the green light; blue flag/flashing blue light in the pit exit road warns of cars on track" }, b("B1.6.3e")),
  pitEntryUnderSc: R({ rule: "no car may enter the pits under SC unless to change tyres (except when all cars are routed through the pit lane)" }, b("B5.13.3")),
  pitEntryUnderVsc: R({ rule: "no car may enter the pits under VSC unless to change tyres" }, b("B5.12.3")),

  // ---------- penalties ----------
  penalties: R({
      fiveSec: { serve: "stop ≥5 s in the pit stop position the next time the driver enters the pit lane (not when only following the SC through the pit lane or entering under the red flag; YES if stopping at the garage area under SC/VSC); no work until served", orAdd: "+5 s if no further stop" },
      tenSec: { serve: "same with 10 s", orAdd: "+10 s if no further stop" },
      driveThrough: { serve: "enter pit lane, rejoin without stopping", maxLineCrossings: 2 },
      stopGo: { stopS: 10, workAllowed: false, maxLineCrossings: 2 },
      notUnderScVsc: "drive-through / stop-and-go may not be served under VSC or after SC deployed (unless already in pit entry road/pit lane); laps behind SC/VSC added to the crossings",
      lastThreeLaps: { driveThrough: 20, stopGo: 30, maxLineCrossings: 3, unit: "s added", note: "2026: only DT/S&G convert in the last 3 laps (5/10 s are served or added as usual)" },
      afterSession: { fiveSec: 5, tenSec: 10, driveThrough: 20, stopGo: 30, unit: "s added" },
      unservable: "grid penalty at next race (stewards' discretion)" }, b("B1.9.5a–d, B1.9.6")),

  // ---------- safety car ----------
  safetyCar: R({ deploy: "SC joins with orange lights regardless of the leader's position", queueMaxGap: "10 car lengths (RD may set 20 in low visibility)",
      minTime: "stay above the FIA ECU minimum time in each marshalling sector and at SC lines until crossing SC line 1 for the 2nd time",
      overtaking: "none on track until the Control Line after the SC has ENTERED THE PIT ENTRY ROAD, except: SC green light; entering the pits after SC line 1; leaving the pits before SC line 2; SC returning may be passed after SC line 1; within pit entry/lane/exit; car with obvious problem",
      carsBetweenScAndLeader: "green light on the SC: required to pass, then rejoin the queue without overtaking",
      lappedCars: "'LAPPED CARS MAY NOW OVERTAKE' – cars lapped at the Line after the lap in which they passed SC line 1 a 2nd time pass the lead-lap cars and the SC; SC in at the end of the FOLLOWING lap",
      scIn: "'SAFETY CAR IN THIS LAP', lights out; leader dictates pace and may fall back; no erratic acceleration/braking; NO part of a car alongside any part of the car ahead until the SC enters the pit entry road (NEW 2026)",
      lapsCount: true, lastLap: "SC enters the pit lane at the end of the last lap, cars take the flag without overtaking (boards/yellows stay) – or RD keeps the SC out and it leads across the line",
      pitLaneUse: "RD may route all cars + SC through the pit lane (drive-through if a car does not)" },
    b("B5.13.1–B5.13.8")),
  virtualSafetyCar: R({ minTime: "above the FIA ECU minimum time once in each marshalling sector and at both SC lines; also when panels turn green",
      overtaking: "none, except pit entry after SC line 1 / pit exit before SC line 2 / within pit lane / car with obvious problem",
      ending: "'VSC ENDING' then 10–15 s later panels turn green, racing resumes immediately (green extinguished after 30 s)", lapsCount: true },
    b("B5.12.1–B5.12.5")),

  // ---------- red flag ----------
  redFlag: R({ onSignal: "'RED FLAG – RACE SUSPENDED'; no overtaking; pit exit closed; all cars slowly into the pit lane, first car to the pit exit (or another point set by the RD) in the fast lane, others queue in order of pit entry",
      order: "Resumption Order = order at the last point it was possible to determine the position of all cars; cars in the garage or moved from the fast lane at the back",
      clock: "session and timekeeping do NOT stop; suspension time added to the 2 h (max 3 h)",
      workAllowed: ["start engine / gear shifting", "compressed gases", "cooling/heating devices", "brake & radiator ducts", "driver comfort", "change wheels and tyres", "genuine accident damage repair", "front wing profile adjustment (non-ECU part)", "heat-hazard coolant"],
      tyreChange: "free (permitted work); wheels fitted at the 5-min signal; changing them before first leaving after resumption = stop-and-go",
      resume: "≥10 min notice; lapped cars + cars between SC and leader leave 2 min early for an extra lap; SC goes out BEFORE the 1-min signal to a resumption position (default: end of the first timing sector); at resumption the pit exit opens and cars drive round to meet it; then STANDING START RESUMPTION (grid) or ROLLING START RESUMPTION by RD decision",
      noOvertakeUntil: "rolling: the Control Line after the SC entered the pit entry road; no car alongside the car ahead from SC lights out until then" },
    b("B5.14.2–B5.14.4, B5.15.1–B5.15.5")),

  // ---------- flags / lapping ----------
  blueFlags: R({ preWarningGapS: 3.0, blueGapS: 1.2, rule: "lapped driver must allow the faster car past at the first available opportunity (ISC)" },
    { doc: "2025 Dutch GP Race Director's Event Notes (2025 value)", art: "3", accessed: AT,
      url: "https://www.fia.com/system/files/decision-document/2025_dutch_grand_prix_-_race_directors_event_notes_.pdf" },
    { verified: false, note: "no 2026 event notes fetched; the 3.0 s / 1.2 s marshalling thresholds are the 2025 figures" }),
  trackLimits: R({ trackEdge: "white lines are track, kerbs are not; a car has left the track when no part touches it",
      raceSanction: "stewards' penalty guidelines – not in the regulations" }, b("B1.8.6"),
    { verified: false, note: "count → penalty ladder not verified in an FIA document (see rules-2026.md)" }),

  // ---------- start ----------
  start: R({ grid: "staggered 1×1, rows 16 m apart", formation: "pole leads; pit-lane speed limit until past pole; no practice starts; overtaking only to restore order",
      lights: "grid panels flash blue 5 s ('Pre-Start'), then five red lights at 1 s intervals; lights out at the starter's discretion after the fifth",
      pitLaneStart: "join once all cars on track have passed the end of the pit lane after the start",
      falseStart: "must be stationary from the THIRD red light until lights out → 5 s / 10 s / drive-through / stop-and-go",
      abortedStart: "cars stay in their grid slots; restart from the 10-min signal; race shortened by 1 lap; the cause starts from the pit lane",
      extraFormationLap: "race shortened by 1 lap each time", scStart: "formation behind SC (wets mandatory if declared at the 10-min signal); standing or rolling start; laps reduced by SC laps − 1",
      mguKAtStart: "MGU-K may propel only after 50 km/h at a standing start (FIA-ECU safety net excepted)" },
    { ...b("B5.1.2, B5.5–B5.11"), also: c("C5.2.12") }),

  // ---------- DRS ----------
  drs: null, // DRS no longer exists in 2026 – replaced by Active Aero (wings) and Overtake (electrical): different systems.

  // ---------- Active Aero (wings) ----------
  activeAero: R({ modes: { corner: "both FW flaps and RW flap at Corner Mode (deactivated, the design downforce position)", straight: "FW profiles and RW flap at reduced incidence (fully activated)",
        partial: "FW at Straight Mode, RW at Corner Mode – the only activation allowed in Low Grip Conditions, in Low Grip Activation Zones" },
      whoMayUse: "any driver, any lap, no gap condition – only fully inside an FIA Activation Zone and only when the control electronics show it enabled",
      zones: "per circuit, published ≥4 weeks before the event (Monaco 2026: none); start of each zone marked by signage",
      transitionMaxMs: 400, failSafe: "returns to Corner Mode", deployOnlyIn: "Activation Zone or stationary",
      afterStandingStart: "enabled after Turn 1 (per event notes)" },
    { ...b("B7.1.1–B7.1.2, B1.5.11"), also: c("C3.10.10 n–w, C3.11.6 c–k") },
    { note: "'after Turn 1' and per-circuit zones come from FIA event documents summarised in the v0.44 notes (not re-fetched)" }),

  // ---------- Overtake (electrical) ----------
  overtakeMode: R({ detection: "car less than the Detection Gap behind ANOTHER car at the Detection Line → Overtake activated at the Activation Line; deactivated at the next Activation Line if not",
      detectionGapS: 1.0, detectionGapNote: "per event (B7.2.1b vii); 1.0 s at every event checked in the v0.44 notes",
      enabled: "disabled before the start/resumption, enabled when the LEADER first crosses the Detection Line; disabled when the SC is deployed until all cars have crossed the Control Line after the SC entered the pit entry road; disabled in Low Grip Conditions; RD may disable",
      effect: { powerCapKw: "ERS-K ≤ 7100 − 20·v(km/h), 0 at ≥355 km/h (vs 1800 − 5·v below 340 km/h without Overtake)", extraRechargeMJ: 0.5,
                fullPowerUpToKmh: { withOvertake: 337.5, without: 290 } },
      notTheWings: true },
    { ...b("B7.2.1b ii/v/vii–ix, B7.2.2, B7.2.3"), also: c("C5.2.8 ii, C5.2.10 iii") },
    { note: "fullPowerUpToKmh is arithmetic on C5.2.8 (350 kW cap): 1800−5v=350 → v=290; 7100−20v=350 → v=337.5. The FIA may adjust the curves per circuit (B7.2.1b i–ii)." }),

  // ---------- power unit / energy ----------
  ers: R({ mguKMaxKw: 350, mguKMaxNm: 500, mguH: null, socWindowMJ: 4,
      rechargePerLapMJ: { default: 8.5, reducedEvents: 7, qualiMin: 4, overtakeExtra: 0.5, behindScLowGrip: "no limit" },
      deployCapKw: "1800 − 5·v below 340 km/h; 6900 − 20·v at 340–345; 0 at ≥345 (Overtake curve: overtakeMode)",
      powerRampDown: "driver max power demand may not drop >150 kW at the start of a power-limited period (fixed ≥1 s), nor faster than 50 kW/s (power-limited distance >3500 m) or 100 kW/s, total ≤700 kW (exceptions per circuit)",
      lap: "lap line to line; on pit entry the lap ends at the start of the pit lane", efficiencyCorrection: 0.97 },
    c("C5.2.7–C5.2.10, C5.2.21, C5.12.4–C5.12.7, energy-flow diagram p.63"),
    { note: "per-event recharge limits and power-curve adjustments come in the FIA's per-competition document (B7.2.1b, B7.2.1d)" }),
  fuel: R({ maxEnergyFlowMJh: 3000, perCylinderMaxMJh: 550, below10500rpm: "EF(MJ/h) = 0.27·N(rpm) + 165",
      partLoad: "EF = 380 at ≤ −50 kW, else 9.78·P(kW) + 869", sustainable: "advanced sustainable components; GHG savings ≥ EU RED transport threshold (C16)",
      raceFuelCapKg: null, refuelInRace: false }, c("C5.2.3–C5.2.6, C16.1–C16.3"),
    { note: "fuel is limited by ENERGY flow (MJ/h) in 2026, not mass flow; no race fuel-quantity cap in Section C" }),

  // ---------- car ----------
  minMass: R({ kg: "724 + Nominal Tyre Mass (726 + NTM in qualifying)", publishedApproxKg: 768, includes: "car incl. tyres + driver (+ballast, ≥82 kg), without fuel",
      heatHazardKg: { declared: 5, otherwise: 2 } }, c("C4.1, C4.5.2, C4.6, Appendix C1 'Car Mass'"),
    { note: "768 kg is F1.com's figure for the 2026 rules announcement (6 Jun 2024), not a regulation value" }),
  dimensions: R({ maxHalfWidthMm: 950, widthNote: "no part > 950 mm from Y=0 except tyres, rims and rim-attached parts", maxWheelbaseMm: 3400,
      tyreWidthChangeMm: { front: -25, rear: -30 }, rimInch: 18 }, c("C2.3.1, C2.3.3"),
    { note: "tyre width change from F1.com (6 Jun 2024); the 2026 tyre dimensions were not found in Section C text (Pirelli/FIA doc)" }),
};
