// Car-to-car interaction coefficients (engine: src/game/engine/traffic.js; DESIGN §8, request §9). Every number has its
// unit, meaning, source and range. Regulation figures (car width, DRS / Overtake detection gap, blue-flag gaps) are read
// from the season rules data (src/game/data/rules/<season>.js) by traffic.js – not copied here. What is here is what no
// public source fixes: wake strength, safety margins, driver judgement thresholds. Those are game estimates (est: true)
// and are shown as such; the validation (reports/traffic.md) says which ones the results are sensitive to.
import { P, values } from "./param.js";

const est = (v, unit, meaning, why, range, conf = "L") => P(v, unit, meaning, "game estimate: " + why, range, true, conf);
// the research helper's reading of F1.com (2021-07-15) on following: 2021 cars lost ≈ 35 % downforce at ≈ 20 m and ≈ 47 %
// at ≈ 10 m; the 2022 rules' DESIGN TARGET was 4 % at 20 m and 18 % at 10 m (simulation targets, not measurements) –
// docs/game/research/physics.md §4 (read 2026-10-29), URL there.
const WAKE_SRC = "docs/game/research/physics.md §4 (F1.com 2021-07-15: 2022-rules target 18 % @10 m, 4 % @20 m; real 2022–25 cars judged worse – no number) + game estimate";

export const TRAFFIC_TABLE = {
  // ---------- bodies ----------
  carLen: { // there is no length rule (TR has only width/wheelbase limits): published figures of the cars
    2024: est(5.63, "m", "car length (bumper to bumper, for overlap and the body rectangle)", "typical published 2022–25 car length 5.6–5.7 m; no regulation", [5.4, 5.75], "M"),
    2025: est(5.63, "m", "car length", "as 2024", [5.4, 5.75], "M"),
    2026: est(5.43, "m", "car length", "2025 length minus the 200 mm shorter maximum wheelbase (2026 Section C C2.3.3: 3400 vs 3600 mm – rules data dimensions)", [5.2, 5.6], "M"),
  },
  mLong: est(0.5, "m", "longitudinal clearance: cars closer than carLen + mLong are 'beside' each other (lateral moves must keep apart)", "racing room margin", [0.2, 1.5], "M"),
  mLat: est(0.3, "m", "lateral clearance kept between two cars side by side (centre distance ≥ width + mLat)", "drivers leave a few tens of cm wheel to wheel", [0.1, 1.0], "M"),
  vLat: est(4.0, "m/s", "fastest lateral move (lane change) relative to the racing line", "a 4 m lane change at racing speed takes ≈ 1 s", [2, 7], "M"),
  vLatFrac: est(0.08, "1/1", "lateral speed cap as a share of the forward speed (slow cars move sideways slowly)", "≈ 4.6° drift angle of the path", [0.04, 0.15], "M"),

  // ---------- following (the speed cap behind a car in the same lane: Gipps 1981 safe-following rule) ----------
  // v_f²/(2 b_f) + v_f·τ ≤ gap − gMin + v_a²/(2 b_a): the follower can always stop behind where the car ahead could stop.
  tau: est(0.08, "s", "reaction / update time in the safe-following rule (Gipps 1981, Transp. Res. B 15:105)", "≥ one engine step (50 ms) plus a margin", [0.05, 0.3], "M"),
  gMin: est(1.0, "m", "bumper gap kept at standstill / very low speed", "queueing cars on a grid stop ≈ 1 m apart", [0.3, 3], "M"),
  bFol: est(1.0, "1", "share of its own braking capacity the follower plans with", "same as the leader: with a margin here the tow could not get closer than ~20 m at 300 km/h (real: 5–10 m); safety comes from τ and gMin", [0.6, 1.0], "M"),
  closeT: est(1.0, "s", "closing-speed rule: a follower closes on a slower car in its lane no faster than gap/closeT (no braking left at the lateral limit in a corner)", "drivers lift early when closing in a corner", [0.5, 2.5], "M"),
  aLift: est(5.0, "m/s²", "deceleration a car gets by lifting off under a traffic cap even at the lateral limit (engine braking; slowing relieves the friction ellipse) – on top of drag", "engine braking of a racing car ≈ 0.2–0.5 g at speed; the point-mass ellipse alone gives 0 at the limit", [1, 6], "L"),
  bLead: est(1.0, "1", "braking of the car ahead assumed, as a share of the follower's capacity", "same kind of car; 1.1 forced ≈ 22 m minimum gaps at 300 km/h – real tows run 5–10 m behind", [1.0, 1.4], "M"),

  // ---------- wake: dirty air (downforce loss) and slipstream (drag cut) ----------
  // Both are a function of the wake distance x (m, nose to tail) and fade out laterally (|Δd| from wakeW0 to wakeW1 × width).
  // Dirty air acts on ClA – the cause is lost downforce – so it bites in medium/high-speed corners (∝ v²) and barely in
  // hairpins: the physics scopes it, no corner table. Power law through the two reference distances: δ(x) = d10·(10/x)^p,
  // p = ln(d10/d20)/ln 2, capped at dMax, none beyond dirtyGapS.
  dirty10: P(0.22, "1", "ClA loss of a follower 10 m behind (share)", WAKE_SRC + ": 18 % target as the lower bound, real cars worse", [0.15, 0.35], true, "L"),
  dirty20: P(0.10, "1", "ClA loss 20 m behind", WAKE_SRC + ": 4 % target as the lower bound", [0.04, 0.2], true, "L"),
  dirtyMax: est(0.30, "1", "cap of the ClA loss very close behind", "keeps the power law finite", [0.2, 0.5]),
  dirtyGapS: est(2.0, "s", "no dirty-air effect beyond this time gap", "drivers report the wake out to ≈ 1.5–2 s", [1, 3]),
  dirtyHeat: est(0.6, "1", "extra tyre heat per unit ClA loss (sliding in the wake: tyre heat factor × (1 + k·δ))", "followers report front tyres overheating", [0, 1.5]),
  slip10: P(0.15, "1", "CdA cut of a follower 10 m behind (share)", "docs/game/research/physics.md §4: prior 10–30 % at 10–20 m, no public figure (pure estimate); the lower end – with DRS on top a tow of 0.25 the field passed ~9× more than the real races (reports/traffic.md)", [0.1, 0.35], true, "L"),
  slipP: est(1.0, "1", "slipstream decay exponent δ(x) = slip10·(10/x)^p", "wake velocity deficit decays roughly ∝ 1/x behind a bluff body", [0.6, 1.6]),
  slipMax: est(0.30, "1", "cap of the CdA cut very close behind", "finite at contact", [0.2, 0.45]),
  slipGapS: est(1.0, "s", "no slipstream beyond this time gap", "the tow is felt within ≈ 1 s", [0.6, 1.5]),
  wakeW0: est(0.5, "×width", "full wake within this lateral offset", "wake about as wide as the car", [0.3, 0.8]),
  wakeW1: est(1.5, "×width", "no wake beyond this lateral offset", "", [1.0, 2.5]),

  // ---------- DRS / Active Aero partial ----------
  aeroPartial: est(0.4, "1", "2026 partial Straight Mode (front wing only, low grip): share of the full Straight Mode CdA/ClA change", "front wing ≈ 40 % of the flap effect", [0.2, 0.6]),
  brakeLook: est(0.3, "s", "the wings close (DRS / Straight Mode) when the car will be braking within this time", "DRS closes on the first brake application; the 2026 flaps return on braking (≤ 400 ms transition, C3.10.10o)", [0.1, 0.5], "M"),
  otDetectBefore: est(300, "m", "2026 Overtake Detection Line this far before the Activation Line (start of the main-straight Straight-Mode zone)", "event notes not in the scenario: the line sits before the last corner at the circuits checked in v0.44 notes", [100, 800]),

  // ---------- passing places (from the reference envelope of the track) ----------
  cornerDv: est(4, "m/s", "a braking run losing at least this much speed is a corner (turn-in/apex for the 'who keeps the corner' rule)", "", [2, 10], "M"),
  passStraight: est(250, "m", "a corner is a passing place when the full-throttle run before its braking is at least this long", "passes need a straight to use a speed advantage", [100, 500]),
  passDv: est(15, "m/s", "… and its braking loses at least this much speed (a real braking zone)", "", [8, 30]),
  turnInK: est(0.5, "1", "turn-in = first point of the braking run where the line's curvature reaches this share of the corner's peak", "", [0.3, 0.8], "M"),

  // ---------- the driver's judgement (racecraft r ∈ [0, 1] from drivers.js scales these) ----------
  followGapS: est(1.5, "s", "'follow' state within this time gap (the wake matters)", "", [1, 2.5], "M"),
  prepGapS: est(1.0, "s", "'prepare' an attack within this gap when closing or DRS/Overtake eligible and a passing place is ahead", "the 1 s DRS figure is where drivers start setting up a move", [0.5, 1.5], "M"),
  closeMin: est(0.05, "m/s", "closing rate (EMA) that counts as 'faster' for preparing", "", [0, 0.5]),
  closeTau: est(3, "s", "time constant of the closing-rate average", "", [1, 10]),
  pullS: est(4, "s", "an attacker judges from this long before the braking point whether it will be level by then (and pulls out once it will)", "DRS passes are built over the whole straight; the pull-out itself comes when the gain suffices", [1, 10], "M"),
  pullMinS: est(1.5, "s", "an attacker held back by the car ahead pulls out only while at least this long of straight remains before the braking point", "pulling out at the braking point gains nothing", [0.5, 3]),
  commitK: est(1.2, "1", "pull out when predicted gain ≥ k·needed, k = commitK − commitR·racecraft", "", [0.6, 2]),
  commitR: est(0.4, "1", "racecraft effect on commitment", "", [0, 0.8]),
  defendR: est(0.25, "1", "defends (one move to the inside) when racecraft ≥ this", "", [0, 1]),
  defendGapS: est(0.8, "s", "defend when the attacker is preparing within this gap", "", [0.3, 1.5]),
  defendMinS: est(0.6, "s", "no defensive move later than this before the braking point (moving under braking is not allowed)", "", [0.3, 1.5], "M"),
  defendMove: est(1.5, "×width", "size of the defensive move toward the inside (one move)", "a covering move is about a car width; crossing the whole road cost the defender far more than real defending does", [0.5, 3]),
  defendMaxS: est(3, "s", "the defensive move is made at most this long before the braking point (once the attacker is preparing)", "the covering move comes late on the straight", [1, 6], "M"),
  stopV: est(3, "m/s", "a car slower than this is 'not moving': nobody yields to it or waits behind it at standstill (it is passed where there is room) and a car giving way to it stops doing so", "a crawling or stopped car is an obstacle, not a car to let by", [1, 8]),
  yieldDv: est(2.5, "m/s", "a car giving way (lost the corner, abort) runs at least this much slower than the car it lets through", "", [1, 5]),
  yieldT: est(0.8, "s", "… and drops back over about this long", "", [0.3, 2]),
  liftFrac: est(0.95, "1", "a lapped car under blue flags / a team-order yield lifts to this share of its free speed on straights", "", [0.85, 0.99]),
  blueFrom: est(0.0, "s", "extra margin on the rules' blue-flag gap (0: the rules data value)", "", [0, 1]),
  mergeDist: est(250, "m", "after the pit exit a car stays on the exit side for at least this distance (blend line) before taking the racing line", "pit exit blend lines run 100–400 m", [100, 500]),
  mergeT: est(1.5, "s", "the pit exit is clear only if a car coming on the exit side is at least this long away", "", [0.5, 3]),
  entryDist: est(400, "m", "a car committed to the pits moves to the pit-entry side over this distance before the branch", "", [150, 600]),
  sceneDeploy: est(1.0, "1", "MGU-K deploy share in attack/defence scenes (on top of the team mode's budget and SOC floor; harvest mode: no scene boost)", "drivers spend energy where it buys a position", [0.75, 1.0], "M"),
  window: est(300, "m", "look-ahead of the constrained envelope (dirty air, lane share): long enough to brake from top speed", "braking 95 → 20 m/s needs ≈ 150–200 m", [200, 500], "M"),
};
export const TRAFFIC = values(TRAFFIC_TABLE);
