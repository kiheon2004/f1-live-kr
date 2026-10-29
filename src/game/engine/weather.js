// The game's weather (DESIGN §9, request §11): what really happens (the truth – the engine knows it), what the teams are
// told (a forecast with errors – the player and the AI see only this), and the water on the track, segment by segment.
// Separate from the live view's weather.js (that one reads the real feed): nothing here is shown as a real record.
//
// Truth: a rain intensity (mm/h), air and track temperature (°C), wind (m/s) per minute of the race.
//   – "real": built from the race's WeatherData record (scenario.weather). The feed says only rain yes/no: the intensity
//     is an estimate (WEATHER.rainOn), and minutes the record doesn't cover are filled and marked estimated;
//   – "generated": a seeded Markov chain of dry / light / heavy rain (WEATHER.genP), temperatures from the record if any.
// Forecast: a probability of rain per 15-min block ahead, re-issued every 5 min; its error grows with how far ahead the
// block is – a logit error and a timing error (when the rain comes), each drawn for that issue and block from the race
// seed (random access: the same forecast however often it is asked for). It never contains the truth's exact start.
// Surface: per segment (WEATHER.seg m) the water depth on the racing line and off it (mm), and the rubber laid down:
//   dh/dt = rain·(not covered) − drain·h − evaporation(track temp, wind) − cars clearing the line; rain stopping leaves
//   the water to drain and dry over minutes; a tunnel / roof keeps its segments dry (their cover fraction).
import { WEATHER } from "../data/params/weather.js";
import { streamFor } from "./rng.js";

const MIN = 60000;

// rec: [{ t (ms from the race's start), rain (0/1), airT, trackT, wind }] (scenario.weather, may be empty);
// returns { mode, step: MIN, n, rain: Float64Array (mm/h), airT, trackT, wind, est: Uint8Array (1 = estimated minute) }
export function weatherTruth(rec, { mode = "real", seed = 1, minutes = 240, P = WEATHER } = {}) {
  const n = minutes + 1, rain = new Float64Array(n), airT = new Float64Array(n), trackT = new Float64Array(n), wind = new Float64Array(n), est = new Uint8Array(n);
  const pts = (rec || []).filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t);
  const near = (i) => { // the record at minute i: the last point at or before it, and how old it is
    const t = i * MIN; let k = -1; for (let j = 0; j < pts.length && pts[j].t <= t; j++) k = j;
    return k < 0 ? (pts.length ? { p: pts[0], age: pts[0].t - t } : null) : { p: pts[k], age: t - pts[k].t };
  };
  const g = streamFor(seed, "weather:gen");
  let state = 0; // generated: 0 dry, 1 light, 2 heavy
  for (let i = 0; i < n; i++) {
    const q = near(i), p = q?.p;
    airT[i] = Number.isFinite(p?.airT) ? p.airT : 22; trackT[i] = Number.isFinite(p?.trackT) ? p.trackT : 32; wind[i] = Number.isFinite(p?.wind) ? p.wind : 2;
    if (mode === "generated") {
      const T = P.genP.v, u = g.next();
      if (state === 0 && u < T.dryToLight) state = 1;
      else if (state === 1) { if (u < T.lightToDry) state = 0; else if (u < T.lightToDry + T.lightToHeavy) state = 2; }
      else if (state === 2 && u < T.heavyToLight) state = 1;
      rain[i] = state === 0 ? 0 : state === 1 ? P.genRate.v.light : P.genRate.v.heavy; est[i] = 1;
    } else {
      rain[i] = p && +p.rain ? P.rainOn.v : 0;
      // (no record within 3 min of this minute: the nearest kept, marked estimated – also the intensity is always an estimate
      // when it rains, est 1 for those minutes too)
      est[i] = !q || Math.abs(q.age) > 3 * MIN || rain[i] > 0 ? 1 : 0;
      if (!q) { airT[i] = 22; trackT[i] = 32; }
    }
  }
  return { mode, step: MIN, n, rain, airT, trackT, wind, est };
}

// the truth at sim time t (ms): linear between minutes
export function truthAt(W, t, out = {}) {
  const x = Math.max(0, Math.min(W.n - 1, t / W.step)), i = Math.min(W.n - 2, Math.floor(x)), f = x - i;
  out.rain = W.rain[i] + (W.rain[i + 1] - W.rain[i]) * f; out.airT = W.airT[i] + (W.airT[i + 1] - W.airT[i]) * f;
  out.trackT = W.trackT[i] + (W.trackT[i + 1] - W.trackT[i]) * f; out.wind = W.wind[i] + (W.wind[i + 1] - W.wind[i]) * f;
  out.est = !!(W.est[i] || W.est[i + 1]);
  return out;
}

// The forecast issued at or before t: blocks of fcBlock minutes over the next `hours`; pRain per block. Errors drawn per
// (issue, block) from the race seed – the same forecast however often it is asked for, never the truth itself.
export function forecastAt(W, t, seed, { hours = 2, P = WEATHER } = {}) {
  const every = P.fcEvery.v * MIN, issue = Math.floor(t / every), t0 = issue * every, blk = P.fcBlock.v * MIN, out = [];
  const nb = Math.round((hours * 60) / P.fcBlock.v);
  for (let j = 0; j < nb; j++) {
    const a = t0 + j * blk, aheadH = (a - t0 + blk / 2) / 3600000, r = streamFor(seed, `weather:fc:${issue}:${j}`);
    // timing error: the block looks at the truth shifted by a seeded offset growing with the lead time
    const shift = r.normal() * P.fcShiftPerH.v * Math.max(0, aheadH) * MIN;
    let wet = 0, k = 0; for (let m = 0; m < P.fcBlock.v; m++, k++) wet += truthAt(W, a + m * MIN + shift).rain > 0.1 ? 1 : 0;
    const frac = wet / k, base = Math.log((frac * 0.9 + 0.05) / (1 - (frac * 0.9 + 0.05)));   // (0.05–0.95: a forecast is never certain)
    const sd = P.fcSdNear.v + P.fcSdPerH.v * Math.max(0, aheadH), z = base + r.normal() * sd;
    out.push({ from: a, to: a + blk, pRain: +(1 / (1 + Math.exp(-z))).toFixed(3) });
  }
  return { issued: t0, blocks: out };
}

// the track surface: segments, their cover fraction (T.zones.cover spans), water on and off the line, rubber
export function newSurface(T, P = WEATHER) {
  const segL = P.seg.v, n = Math.max(1, Math.round(T.L / segL)), L = T.L / n;
  const cover = new Float64Array(n);
  for (const [a, b] of T.zones?.cover || []) for (let i = 0; i < n; i++) {
    const s0 = i * L, s1 = s0 + L, lo = Math.max(s0, a), hi = Math.min(s1, b);
    if (hi > lo) cover[i] = Math.min(1, cover[i] + (hi - lo) / L);
  }
  const rubber = new Float64Array(n).fill(P.rubberMin.v);
  return { n, segL: L, cover, hLine: new Float64Array(n), hOff: new Float64Array(n), rubber, passes: new Float64Array(n) };
}
export const segOf = (S, s) => Math.min(S.n - 1, Math.max(0, Math.floor(s / S.segL)));

// one surface update over dtS seconds (the engine calls it once a second): w = truthAt(...) now; passes accumulated by the
// engine (cars entering each segment since the last update) are used and cleared
export function surfaceStep(S, w, dtS, P = WEATHER) {
  const h = dtS / 3600, evap = Math.max(0, P.evap.v * (1 + P.evapT.v * (w.trackT - 25)) * (1 + P.evapWind.v * w.wind));
  for (let i = 0; i < S.n; i++) {
    const rainIn = w.rain * (1 - S.cover[i]) * h, carN = S.passes[i];
    for (const key of ["hLine", "hOff"]) {
      let x = S[key][i] + rainIn;
      if (x > P.hMax.v) x = P.hMax.v + (x - P.hMax.v) * 0.2;           // (deep water runs off)
      x -= x * (1 - Math.exp(-P.drain.v * h));                           // drainage
      x -= evap * h * (1 - S.cover[i] * 0.8);                            // evaporation (less under a roof: no sun, no wind)
      const clear = key === "hLine" ? P.carClear.v : P.carClear.v * P.offLine.v;
      x *= Math.pow(1 - clear, carN);                                     // the cars' tyres clear the line
      S[key][i] = Math.max(0, x);
    }
    // rubber: laid by the cars, washed by the rain
    S.rubber[i] = Math.min(P.rubberMax.v, S.rubber[i] + carN * P.rubberGain.v) - Math.min(0.02, rainIn * P.rubberWash.v * (S.rubber[i] - P.rubberMin.v));
    S.rubber[i] = Math.max(P.rubberMin.v - 0.02, S.rubber[i]);
    S.passes[i] = 0;
  }
}
// water depth (mm) where a car is: on the racing line or off it (d m from the line, w half the road)
export function waterAt(S, s, offLine = false) { const i = segOf(S, s); return offLine ? S.hOff[i] : S.hLine[i]; }
export function rubberAt(S, s) { return S.rubber[segOf(S, s)]; }
export function saveSurface(S) { return { n: S.n, segL: S.segL, cover: [...S.cover], hLine: [...S.hLine], hOff: [...S.hOff], rubber: [...S.rubber], passes: [...S.passes] }; }
export function loadSurface(o) { return { n: o.n, segL: o.segL, cover: Float64Array.from(o.cover), hLine: Float64Array.from(o.hLine), hOff: Float64Array.from(o.hOff), rubber: Float64Array.from(o.rubber), passes: Float64Array.from(o.passes) }; }
