// The game's explicit boundary into the 3D view (DESIGN §13, request §17): engine snapshots (DESIGN §13.1) → what
// map3d's game mode draws. map3d.js enters game mode only through Map3D.game.attach(adapter) and leaves it with detach();
// while attached the view's live paths (smooth.js tracks, traffic.js separation, the measured grid placement, pit
// inference from the feed, marshals from race control, start lights, telemetry wheel screens) are not run at all – the
// cars are posed from this adapter's snapshots only (cars3d.js). Nothing here pretends to be a live / replay source:
// ctx.src is null, and ctx carries only what identifies the circuit and the moment drawn (for the sun, the venue's
// models, the corner numbers, the camera's focus).
//
// Mapping engine → world (documented in reports/ui3d.md, measured by Map3D.game.mapping()):
//   The world is built by map3d's own buildWorld from the scenario's lap (the same session's positions the engine's track
//   was made from: track.columns x, y, z in m → the feed's decimetres). buildWorld resamples and smooths that line, so the
//   engine's s (m from the start line along its 2 m samples) and the world's s (m from the world's first sample along
//   its own smoothed line) differ by an offset and a small stretch that varies along the lap. Every 25 m of engine s the
//   engine's lap point is projected onto the world's line (trackFrame.project) → (world s, the engine line's lateral
//   offset there); between those knots both are interpolated linearly. A car at engine (s, d) is drawn at world
//   (S(s), D(s) + σ·d), σ = ±1 the side convention (engine: + left of travel; found by comparing the engine's left normal
//   with the world frame's d direction). The error of a plain ratio (s0 + s·Lw/Le) against the knots is reported too.
//   Pit lane: the engine's own pit path points (track.pit.columns x, y; the same session's pit passes) are drawn as they
//   are, moved across into the team's box by the pit building's lane model when the car is at its box (cars3d.js).
const wrapTo = (x, L) => ((x % L) + L) % L;
const lerp = (a, b, f) => a + (b - a) * f;

// the render-time picture (field contract, discrete changes at their sim times): present.js – shared with the HUD
import { presentCars, presentRace, discreteAt } from "./present.js";
const presentRaceWeather = (p) => (p.a ? presentRace(p.a, p.b, p.renderT).weather : p.b.weather) || {};
export { discreteAt };

export function createGameAdapter({ scenario, source, label = "게임" }) {
  const m = scenario.meta || {}, tr = scenario.track, C = tr.columns;
  // the lap as the feed's points (decimetres, [x, y, z]) – buildWorld's input, closed by its first point
  const lapPts = []; for (let i = 0; i < tr.n; i++) lapPts.push([C.x[i] * 10, C.y[i] * 10, C.z[i] * 10]);
  lapPts.push(lapPts[0].slice());
  // the circuit's corner numbers where the scenario has them (their s on the engine's lap → points)
  const corners = (tr.corners || []).map((k) => { const i = Math.round(wrapTo(k.s, tr.L) / tr.ds) % tr.n; return { n: k.n, x: C.x[i] * 10, y: C.y[i] * 10 }; });
  const entries = new Map((scenario.entries || []).map((e) => [String(e.num), e]));
  const startUtc = Date.parse(m.startUtc || "") || null;
  let focus = null, renderT = 0, map = null, widthPts = null;

  const A = {
    label, scenario, source, entries,
    // what map3d's app() reads in game mode (see map3d.js `app`): the circuit's identity and the moment drawn – no source
    ctx: {
      mode: "game", src: null, game: true,
      get t() { return renderT; },
      get focus() { return focus; },
      get rate() { return source.paused ? 0 : source.speed; },
      get circuit() { return corners.length ? { corners } : null; },
      setFocus(n) { focus = n == null ? null : String(n); A.onFocus?.(focus); },
      location: () => m.location || null,
      circuitKey: () => (Number.isFinite(+m.circuitKey) && m.circuitKey !== null ? +m.circuitKey : null),
      sessionYear: () => m.season || null,
      sessionHour: () => null,
      // the real sun for this race's start plus the race's own sim time (t 0 = lights out in the scenario's clock)
      utcNow: () => (startUtc != null ? startUtc + renderT : null),
      sourceKey: () => `game:${m.id || "?"}`,
      trackPoints: () => lapPts,
      // the road's width as the ENGINE drives it (track.columns wL / wR: m left / right of the lap line) – map3d's measureWidth
      // takes the tarmac's edges from a cloud of points across the road; here those points span the engine's drivable width
      // (1 m in from each edge: measureWidth adds a metre for half a car), so the road drawn is the road raced on. Not car
      // positions – the scenario has none.
      carPoints: () => widthPts || (widthPts = edgePoints(tr)),
      gridSpots: () => null,
    },
    // the drivers as the car models need them (team name and colour: the scenario's entry list, that race's own)
    driverOf(num) { const e = entries.get(String(num)); return e ? { TeamName: e.team || "", TeamColour: String(e.colour || "#888888").replace(/^#/, ""), Tla: e.tla || String(num), LastName: e.last || "" } : null; },
    drivers() { const o = {}; for (const k of entries.keys()) o[k] = A.driverOf(k); return o; },
    // engine → world, from the world map3d just built (frame = smooth.js trackFrame; pitLane = world.pitLane or null)
    bind(world, F) { map = buildMapping(tr, world, F); A.mappingInfo = map.info; return map.info; },
    unbind() { map = null; },
    get map() { return map; },
    // the cars to draw at render time T between the last two snapshots a, b (nothing is written back to the engine):
    // continuous values (s, u, d, v, steer, wheel distance, wings) interpolated; DISCRETE state (lap / pit, status, pit
    // phase, the tyre fitted) is a's, then each change the engine recorded with its sim time (snapshot car.trans) applied
    // once T has reached it, in order – never b's early (v0.49 §4: new tyres drawn before the work had ended). While a
    // change of lap ↔ pit is due, the position follows the side the car is on at T (extrapolated from that snapshot).
    frameCars() {
      const pr = source.pair(); if (!pr?.b) return null;
      const { a, b } = pr, T = pr.renderT; renderT = T;
      const f = a && b.t > a.t ? Math.max(0, Math.min(1, (T - a.t) / (b.t - a.t))) : 1;
      return { t: T, snap: b, cars: presentCars(a, b, T, tr.L), f };
    },
    // the order at render time (the tower's, the camera's ◀ ▶, the leader): positions as presented, never the newer snapshot's
    order() { const fr = A.frameCars(); return fr ? [...fr.cars].sort((x, y) => (x.pos ?? 99) - (y.pos ?? 99)).map((c) => c.num) : []; },
    leader() { return A.order()[0] || null; },
    snapshot() { return source.pair()?.b || null; },
    // weather3d's environment from the engine's truth now (screen rain = engine rain; DESIGN §9, §13). Presentation
    // mappings (not measurements): drops drawn ∝ rain up to 4 mm/h ("moderate"), the road's wet look 1 − e^(−water/0.6 mm)
    // (a 0.1 mm film ≈ 0.15: damp, 1 mm ≈ 0.8: wet), overcast while raining
    weather() {
      const p = source.pair(); if (!p?.b) return null;
      const w = presentRaceWeather(p);
      const rain = Math.max(0, +w.rain || 0), water = Math.max(0, +w.water || 0);
      return { rain, water, rainShare: Math.min(1, rain / 4), wet: 1 - Math.exp(-water / 0.6), cloud: rain > 0 ? 0.92 : null, airT: w.airT ?? null, trackT: w.trackT ?? null, wind: w.wind ?? null, est: !!w.est };
    },
    // world pose inputs for a car on the lap: world s and d
    worldSD(s, d) { return map ? map.sd(s, d) : null; },
  };
  return A;
}

// points across the engine's road ([x, y, z] decimetres, the feed's frame): every sample, from 1 m inside the right edge to
// 1 m inside the left one, 1 m apart (left normal of heading h: (−sin h, cos h))
function edgePoints(tr) {
  const C = tr.columns, out = [];
  if (!C.wL || !C.wR) return out;
  for (let i = 0; i < tr.n; i++) {
    const nx = -Math.sin(C.hdg[i]), ny = Math.cos(C.hdg[i]), a = -(C.wR[i] - 1), b = C.wL[i] - 1;
    for (let o = a; o <= b + 1e-9; o += 1) out.push([(C.x[i] + nx * o) * 10, (C.y[i] + ny * o) * 10, C.z[i] * 10]);
  }
  return out;
}
// knots every `step` m of engine s: the engine's lap point projected onto the world's line
export function buildMapping(tr, world, F, step = 25) {
  const C = tr.columns, Le = tr.L, Lw = F.L, c = world.center, n = tr.n;
  const toScene = (x, y) => [x - c.x, -(y - c.z)];
  // knots on the engine's own samples (every `every` samples ≈ step m), the last one the start line again (s = L)
  const every = Math.max(1, Math.round(step / tr.ds)), idx = []; for (let i = 0; i < n; i += every) idx.push(i); idx.push(n);
  const K = idx.length - 1, ks = new Float64Array(K + 1), ws = new Float64Array(K + 1), wd = new Float64Array(K + 1);
  let hint = null, sideVotes = 0, worstLat = 0; const wsp = Lw / world.samples.length;
  for (let k = 0; k <= K; k++) {
    const i = idx[k] % n, s = idx[k] * tr.ds;
    const [x, z] = toScene(C.x[i], C.y[i]), pr = F.project(x, z, hint);
    // (the search starts where this knot should be – the last one's sample plus a knot's length of world samples: at a
    // crossing (Suzuka) the plain nearest point could be the other level's)
    ks[k] = Math.min(s, Le); ws[k] = pr ? pr.s : NaN; wd[k] = pr ? pr.d : 0; hint = pr ? pr.i + Math.round((every * tr.ds) / wsp) : null;
    worstLat = Math.max(worstLat, Math.abs(wd[k]));
    // the side convention: the engine's left normal (F1 frame (−sin h, cos h) → scene (−sin h, −cos h)) against the world's
    // +d direction at that point (trackFrame.at: (−tz, tx) of the chord)
    if (pr && k % 4 === 0) { const h = C.hdg[i], P0 = [0, 0, 0], D = [0, 0]; F.at(pr.s, 0, P0, D); sideVotes += Math.sign(-Math.sin(h) * -D[1] + -Math.cos(h) * D[0]); }
  }
  ks[K] = Le;
  // unwrap the world s along the knots (it wraps once where the world's first sample is)
  for (let k = 1; k <= K; k++) { while (ws[k] - ws[k - 1] < -Lw / 2) ws[k] += Lw; while (ws[k] - ws[k - 1] > Lw / 2) ws[k] -= Lw; }
  const sigma = sideVotes >= 0 ? 1 : -1;
  // the plain ratio's error against the knots (what a single offset + stretch would get wrong)
  const s0 = ws[0], ratio = (ws[K] - ws[0]) / Le; let worstRatio = 0;
  for (let k = 0; k <= K; k++) worstRatio = Math.max(worstRatio, Math.abs(s0 + ks[k] * ratio - ws[k]));
  const sd = (s, d) => {
    const u = wrapTo(s, Le); let k = Math.min(K - 1, Math.floor(u / (every * tr.ds)));
    while (k > 0 && ks[k] > u) k--; while (k < K - 1 && ks[k + 1] <= u) k++;
    const f = (u - ks[k]) / (ks[k + 1] - ks[k] || 1);
    return { s: wrapTo(ws[k] + (ws[k + 1] - ws[k]) * f, Lw), d: wd[k] + (wd[k + 1] - wd[k]) * f + sigma * (d || 0) };
  };
  const info = { knots: K + 1, stepM: +(every * tr.ds).toFixed(2), engineL: +Le.toFixed(1), worldL: +Lw.toFixed(1), stretch: +((ws[K] - ws[0]) / Le).toFixed(5), s0: +wrapTo(s0, Lw).toFixed(2), sigma,
    worstLineOffsetM: +worstLat.toFixed(2), plainRatioWorstErrM: +worstRatio.toFixed(2), sideVotes };
  return { sd, info, sigma };
}
