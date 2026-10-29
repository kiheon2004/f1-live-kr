// Weather and track-surface coefficients (DESIGN §9). F1's own data (WeatherData) has rain yes/no only, no amount, no
// water on the road – everything about depth, drainage and drying here is a GAME ESTIMATE (est: true), chosen to give the
// right orders of magnitude (a wet track drying over tens of minutes, a racing line drying first) and checked against the
// cached rain races' tyre-change timing as a sanity check only (validation, not calibration input).
export const WEATHER = {
  seg: { v: 200, unit: "m", est: true, range: [100, 400], why: "length of a track segment with its own water depth" },
  rainOn: { v: 2.5, unit: "mm/h", est: true, range: [0.5, 8], why: "rain intensity assumed when the real record says only 'raining' (WeatherData Rainfall 1)" },
  drain: { v: 3.0, unit: "1/h", est: true, range: [1, 8], why: "drainage rate of standing water (exponential, per hour) – camber and drains" },
  hMax: { v: 3.0, unit: "mm", est: true, range: [2, 6], why: "water depth over which more rain runs off at once" },
  evap: { v: 0.15, unit: "mm/h", est: true, range: [0.05, 0.6], why: "evaporation at 25 °C track temperature, no wind (scaled by track temp and wind)" },
  evapT: { v: 0.04, unit: "1/°C", est: true, range: [0.02, 0.08], why: "relative change of evaporation per °C of track temperature" },
  evapWind: { v: 0.06, unit: "1/(m/s)", est: true, range: [0.02, 0.15], why: "relative change of evaporation per m/s of wind" },
  // the cars' tyres clear water off the racing line: each car passing removes a fraction of the film there
  carClear: { v: 0.004, unit: "1/car", est: true, range: [0.001, 0.01], why: "fraction of the racing line's water removed by one car passing (tyre spray)" },
  offLine: { v: 0.25, unit: "×", est: true, range: [0, 0.6], why: "how much of the cars' clearing reaches off the racing line" },
  rubberGain: { v: 0.00004, unit: "1/car", est: true, range: [0, 0.0002], why: "track rubbering-in per car pass (grip factor rises toward rubberMax)" },
  rubberMax: { v: 1.0, unit: "×", est: true, why: "fully rubbered track grip factor" },
  rubberMin: { v: 0.975, unit: "×", est: true, range: [0.95, 0.99], why: "green track grip factor at the start of the race weekend's race (some rubber from the weekend)" },
  rubberWash: { v: 0.5, unit: "1/mm", est: true, range: [0.1, 1], why: "rubber washed away per mm of rain fallen" },
  // the forecast the teams get: a probability of rain per 15-min block ahead, its error growing with how far ahead
  fcBlock: { v: 15, unit: "min", est: true, why: "forecast block" },
  fcEvery: { v: 5, unit: "min", est: true, why: "how often the forecast is re-issued" },
  fcSdNear: { v: 0.35, unit: "logit", est: true, range: [0.1, 1], why: "forecast error (logit of the probability) for the next block" },
  fcSdPerH: { v: 1.0, unit: "logit/h", est: true, range: [0.3, 2], why: "growth of the forecast error per hour ahead" },
  fcShiftPerH: { v: 12, unit: "min/h", est: true, range: [3, 30], why: "spread of the forecast's timing error per hour ahead (when the rain comes)" },
  // generated weather (no real record): a Markov chain of dry / light / heavy rain per minute
  genP: { v: { dryToLight: 0.004, lightToDry: 0.05, lightToHeavy: 0.02, heavyToLight: 0.08 }, unit: "1/min", est: true, why: "transition chances per minute of the generated rain (a moderately unsettled day)" },
  genRate: { v: { light: 2, heavy: 9 }, unit: "mm/h", est: true, why: "intensity of generated light / heavy rain" },
};
export const WEATHER_PARAMS_VERSION = 1;
