// What the stewards hand out where the regulations leave the choice to them (SR 54.3: "any one of the penalties below"),
// and the thresholds of procedures the regulations don't number (track-limits ladder, blue flags ignored). Each entry:
// v, unit, est, range, why, src. Practice is read from the FIA's own race control messages in the session cache
// (f1kr-work/v048/research/control/rcm_probe.mjs → logs/control_rcm_probe.log: counts per offence over 41 races 2024–2026).
const PROBE = "FIA race control messages, 41 cached races 2024–2026: f1kr-work/v048/logs/control_rcm_probe.log";
export const STEWARDS = {
  pitSpeeding: { v: "5s", est: false, why: "speeding in the pit lane during the race", src: "SR 34.7c / B1.6.3a allow 5 s/10 s/DT/S&G; practice 16× 5 s, 2× drive-through (" + PROBE + ")" },
  pitSpeedTol: { v: 0.0, unit: "km/h", est: true, range: [0, 1], why: "tolerance over the limit before it counts (the FIA's measurement tolerance is not published)" },
  falseStart: { v: "5s", est: false, why: "moving before the start signal", src: "SR 48.1 / B5.11: 5 s/10 s/DT; practice 6× 5 s (" + PROBE + ")" },
  unsafeRelease: { v: "5s", est: false, why: "a release into the path of another car (34.14a) – the stop-and-go of 34.14d is for a car released in an unsafe CONDITION (e.g. a loose wheel)", src: "practice 2× 5 s 'UNSAFE RELEASE' (" + PROBE + "); SR 34.14a/d" },
  collision: { v: "10s", est: false, why: "causing a collision", src: "practice 17× 10 s, 4× 5 s (" + PROBE + ")" },
  vscInfringement: { v: "5s", est: false, why: "below the VSC / SC minimum time in a sector", src: "SR 55.7 / 56.5 (stewards' choice); practice 1× 5 s 'VSC INFRINGEMENT' (" + PROBE + ")" },
  vscTol: { v: 0.3, unit: "s", est: true, range: [0, 0.5], why: "how far under the minimum sector time still counts as kept (ECU resolution; not published) – v0.48: 0.1 gave ~2 penalties per SC for 0.1–0.15 s, far more than the cached races show (SC/VSC infringement penalties are rare)" },
  // track limits: each time a car leaves the track its lap is deleted (SR 33.3 + event notes); the ladder below is the
  // stewards' guideline, not a regulation – the counts are those seen in the FIA's own messages
  trackLimits: { v: { flagAt: 3, penaltyAt: 4, penalty: "5s", eachAfter: "5s" }, est: false,
    why: "the 3rd deleted lap brings the black-and-white flag, the 4th a 5 s penalty, each further one another 5 s",
    src: "practice: black-and-white flag after 3 deletions 36×, 4: 4×, 5: 1×; first track-limits penalty after 4 deletions 5/5, always 5 s; 5th / 6th offences 5 s each (" + PROBE + ")" },
  // blue flags: the marshalling system shows them inside 1.2 s (pre-warning 3.0 s – data/rules blueFlags); how long a
  // driver may take is "the first available opportunity" – these times are game estimates
  blueWarnS: { v: 12, unit: "s", est: true, range: [5, 30], why: "shown blue this long without letting the faster car by → black-and-white flag" },
  bluePenS: { v: 25, unit: "s", est: true, range: [10, 60], why: "shown blue this long → 5 s penalty", src: "the penalty kind: practice 1× 5 s 'IGNORING BLUE FLAGS' (" + PROBE + ")" },
  bluePenalty: { v: "5s", est: false, why: "ignoring blue flags", src: "practice (" + PROBE + ")" },
  unserved: { v: "dsq", est: true, why: "a drive-through / stop-and-go not served within its line crossings: SR 54.4e / B1.9 let the stewards replace it with a further penalty – the game uses disqualification (the black flag)" },
  scInfringement: { v: "10s", est: false, why: "overtaking under SC / VSC / restart, or running alongside after 'SC IN THIS LAP' (2026)", src: "practice 1× 10 s 'SAFETY CAR INFRINGEMENT' (" + PROBE + ")" },
};
export const STEWARDS_PARAMS_VERSION = 1;
