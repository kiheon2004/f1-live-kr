// Strategy estimator and team AI coefficients (DESIGN §1 ai.js, request §13). Every number here is a GAME ESTIMATE
// (est: true): no team publishes how its strategists weigh risk, how fast they react or how wrong their tyre model is.
// They set how the AI behaves, not what the cars can do – the cars' physics is in the other params files.
import { P, values } from "./param.js";

const est = (v, unit, meaning, why, range, conf = "L") => P(v, unit, meaning, "game estimate: " + why, range, true, conf);

export const AI_TABLE = {
  // ---- the team's own tyre model: physics defaults + an error the team doesn't know (seeded per race and team) ----
  kwErrSd: est(0.25, "ln", "σ of the team's prior error on each compound's wear rate (log scale)", "pre-race simulations miss the real degradation by tens of percent – that is why teams watch the first laps closely", [0.05, 0.5]),
  muErrSd: est(0.004, "1", "σ of the team's prior error on each compound's relative grip", "≈ 0.3 s/lap compound offset uncertainty before the race", [0, 0.01]),
  priorLaps: est(3, "laps", "weight of the prior wear estimate, in laps of own observation", "after ~3 laps of a stint a team trusts its own data as much as its model", [1, 10]),
  wearObsSd: est(0.02, "1", "σ of the team's reading of its own tyre wear per lap (tread estimate from its sensors and models)", "own-car telemetry is good but not perfect", [0, 0.05]),
  lapOffGain: est(0.25, "1", "EWMA gain of the lap-time offset (model vs own clean laps)", "a few laps to learn the track/driver offset", [0.05, 0.6]),
  vsAgeLaps: est(60, "laps", "length of the team's virtual stint tables", "longer than any stint", [30, 90]),
  // ---- pit loss ----
  laneErrSd: est(1.0, "s", "σ of the team's prior error on the pit-lane time before it sees a stop", "the lane geometry is public; the box approach/launch is not", [0, 3]),
  laneObsW: est(0.5, "1", "weight of each observed stop (any car's: lane times are public) in the lane-time estimate", "a few stops settle it", [0.1, 1]),
  scLossK: est(0.45, "×", "pit loss under a safety car as a share of the green loss", "the field crawls behind the SC while the lane time is the same: real SC stops cost ≈ 40–55 % of a green stop", [0.3, 0.7]),
  vscLossK: est(0.65, "×", "pit loss under a VSC as a share of the green loss", "VSC slows the field ≈ 30–40 % (delta times)", [0.5, 0.85]),
  queueMargin: est(2.0, "s", "extra time a queued second car loses beyond the first car's stationary time (stop behind, roll in)", "double stacks typically cost the second car 3–5 s", [0.5, 4]),
  // ---- safety car chance (prior, not this race's history) ----
  pSc: est(0.45, "1/race", "chance of at least one SC in a race at a typical circuit", "roughly half of recent races had one (order of magnitude, not this race's record)", [0.1, 0.9]),
  pScStreet: est(0.75, "1/race", "the same at a street circuit (walls)", "street circuits see more SCs", [0.3, 0.95]),
  scLaps: est(4, "laps", "typical SC duration", "3–5 laps", [2, 7]),
  scWindow: est(0.45, "×stint", "how much of the planned stint may be cut to stop under an SC", "teams take a cheap stop when the planned stop was not far off", [0.2, 0.8]),
  // ---- weather ----
  hRain: est(1.2, "mm", "water on the racing line the team expects in steady light rain", "WEATHER.rainOn against drainage and the cars' clearing", [0.3, 3]),
  dryTau: est(12, "min", "time constant of the line drying once the rain stops", "the line dries in 10–20 min", [5, 30]),
  switchDelta: est(2.0, "s/lap", "lap-time gain of the other tyre over the current one at which a team switches (reactive rule in the scenarios)", "teams wait for clear evidence", [0.5, 5]),
  wetPersist: est(0.6, "1", "chance a wet forecast block stays wet into the next one in the scenario draws", "rain comes in spells, not in independent 15-min pieces", [0, 0.9]),
  // ---- traffic (lap-level forecast of the field) ----
  passDelta: est(0.9, "s/lap", "pace advantage a car needs to pass in the lap-level traffic forecast (start value)", "DRS-era passing needs ~0.5–1 s/lap", [0.3, 3]),
  passDeltaStreet: est(2.5, "s/lap", "the same at a street circuit", "Monaco/Singapore: nearly impossible", [1, 6]),
  passLearn: est(5, "laps", "laps of observed on-track passes after which the team trusts its own count", "learned from the public order", [3, 30]),
  minGapS: est(0.6, "s", "how close a held car runs behind the car ahead in the lap-level forecast", "dirty air", [0.3, 1.2]),
  horizon: est(40, "laps", "laps the traffic forecast looks ahead (every stop of a candidate inside it counts)", "bounded work per decision (pace tables cached: ≈ 20 cars × 40 laps per candidate)", [5, 80]),
  // ---- decisions ----
  mc: est(16, "scenarios", "Monte-Carlo scenarios per evaluation (forecast × wear error × SC)", "bounded work (≈ 1 ms)", [4, 64]),
  window: est(4, "laps", "a stop this many laps ahead or closer is 'in the window' (lap-by-lap timing check with traffic)", "", [2, 8]),
  replanEvery: est(5, "laps", "full re-plan cadence outside the window (and on events)", "", [1, 10]),
  maxEvents: est(2, "1/lap", "event-triggered re-evaluations per team per lap at most", "bounded work", [1, 5]),
  fcJump: est(0.2, "1", "rise of the next hour's max rain probability that triggers a re-evaluation", "", [0.05, 0.5]),
  rivalWin: est(6, "s", "a rival stopping within this gap (ahead or behind, after pit loss) triggers an undercut check", "", [2, 15]),
  falloff: est(0.6, "s/lap", "own clean lap times this much worse than the model (2 laps running) trigger a re-plan", "tyre falling off", [0.2, 2]),
  // ---- team tendencies: drawn per race and team around these (seeded) – never a fixed 'smart' or 'dumb' team ----
  risk: est(0.0, "s per s of σ", "risk weight: choose by mean + risk·σ (positive = risk-averse)", "centre of the per-team draw", [-0.5, 0.8]),
  riskSd: est(0.25, "1", "spread of the per-race risk draw", "", [0, 0.5]),
  delay: est(4, "s", "reaction delay to an event (SC, rival stop, forecast)", "radio + decision time", [1, 15]),
  delaySd: est(2, "s", "spread of the per-race delay draw", "", [0, 6]),
  hysteresis: est(1.5, "s", "expected gain needed to change a plan", "teams don't flip plans for noise", [0.3, 4]),
  hystSd: est(0.5, "s", "spread of the per-race hysteresis draw", "", [0, 2]),
  errScaleSd: est(0.3, "ln", "per-race spread of how good a team's estimates are (scales kwErrSd/laneErrSd)", "some weekends a team reads the tyres well, some not", [0, 0.6]),
};
export const AI = values(AI_TABLE);
// optional per-team tendency centres { teamKey: { risk, delay, hysteresis } } – EMPTY on purpose: there is no source for
// how a real team's strategists behave, so every team starts from the same centre and only the seeded draw differs.
export const TEAM_TENDENCY = {};
export const AI_PARAMS_VERSION = 1;
