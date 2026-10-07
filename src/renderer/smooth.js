// Steadier car motion for the 3D view.
// F1's positions come four times a second and are a metre or two off; a curve through every one of them makes
// a car weave on the straights and surge and check along them. Here each car's positions are put into the
// track's own frame – distance along the lap line (s) and offset across it (d) – and the two are treated
// separately, the way a car really moves:
//   d (across)  changes slowly: outliers dropped (median of 5), then a Gaussian of ±0.5 s.
//   s (along)   follows the car's own speed from its telemetry (CarData, ~4 Hz): s = ∫speed dt + a correction
//               that ties it to the positions, smoothed over ±1.5 s (it only absorbs the slow drift between
//               the car's path and the lap line). Without telemetry, a Gaussian of ±0.35 s on s.
// In the pit lane, off the circuit or under a bridge the positions are used as they are.
// Replays are smoothed both ways in time (the whole session is known); live, the last 30 s are redone once
// a second, so the newest moments are smoothed one-sidedly.
// The result has the same interface as ReplayKit's CarTracks: all(t, into, vels) in F1 decimetres.

const DM = 0.1;
const STEP_OUT = 125;          // ms between output samples

// Gaussian smoothing of values v at (uneven) times t, sigma in ms, in place into `out`.
function gauss(t, v, sigma, out = new Float64Array(v.length), weight = null) {
  const n = v.length, w3 = sigma * 3;
  let lo = 0;
  for (let i = 0; i < n; i++) {
    while (t[lo] < t[i] - w3) lo++;
    let sw = 0, sv = 0;
    for (let j = lo; j < n && t[j] <= t[i] + w3; j++) {
      const dt = (t[j] - t[i]) / sigma, w = Math.exp(-0.5 * dt * dt) * (weight ? weight[j] : 1);
      sw += w; sv += w * v[j];
    }
    out[i] = sw > 0 ? sv / sw : v[i];
  }
  return out;
}
const median5 = (v) => { const n = v.length, out = new Float64Array(n), a = new Float64Array(5); for (let i = 0; i < n; i++) { for (let k = -2; k <= 2; k++) a[k + 2] = v[Math.max(0, Math.min(n - 1, i + k))]; a.sort(); out[i] = a[2]; } return out; };

// The lap line as a frame: project (x, z) → { s, d, dist, i } and back.
// The line's samples aren't evenly spaced (0.5–3.7 m apart), so s is the real distance along it.
function trackFrame(world) {
  const S = world.samples, n = S.length, cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { const a = S[i].p, b = S[(i + 1) % n].p; cum[i + 1] = cum[i] + Math.hypot(b.x - a.x, b.z - a.z); }
  const L = cum[n];
  return {
    L,
    project(x, z, hint) {
      let s0 = null, dd = Infinity;
      if (hint != null) {   // search near the last sample first (cheap, and right at crossings like Suzuka's)
        for (let k = -6; k <= 6; k++) { const q = S[(((hint + k) % n) + n) % n], d = (q.p.x - x) ** 2 + (q.p.z - z) ** 2; if (d < dd) { dd = d; s0 = q; } }
        if (dd > 400) s0 = null;
      }
      if (!s0) { const r = world.grid.nearest(x, z, 3); s0 = r[0]; if (!s0) return null; }
      const a = (x - s0.p.x) * s0.tan.x + (z - s0.p.z) * s0.tan.z, d = (x - s0.p.x) * s0.nor.x + (z - s0.p.z) * s0.nor.z;
      return { s: cum[s0.i] + a, d, i: s0.i, sample: s0 };
    },
    // position at s (any real, wraps) and offset d: [x, y, z] in scene metres
    at(s, d, out) {
      const u = ((s % L) + L) % L;
      let lo = 0, hi = n;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= u) lo = m; else hi = m; }
      const i0 = lo, t = (u - cum[i0]) / (cum[i0 + 1] - cum[i0] || 1), a = S[i0], b = S[(i0 + 1) % n];
      const nx = a.nor.x + (b.nor.x - a.nor.x) * t, nz = a.nor.z + (b.nor.z - a.nor.z) * t, nl = Math.hypot(nx, nz) || 1;
      out[0] = a.p.x + (b.p.x - a.p.x) * t + (nx / nl) * d;
      out[1] = a.p.y + (b.p.y - a.p.y) * t;
      out[2] = a.p.z + (b.p.z - a.p.z) * t + (nz / nl) * d;
      return out;
    },
  };
}

// Distance travelled from the speed telemetry: returns S(t) (metres since the first sample), or null.
function speedIntegral(car, lag = 0) {
  if (!car || !car.t || car.t.length < 20) return null;
  const n = car.t.length, V = car.v, S = new Float64Array(n), T = Float64Array.from(car.t, (t) => t - lag);
  for (let i = 1; i < n; i++) { const dt = (T[i] - T[i - 1]) / 1000; S[i] = S[i - 1] + (dt > 0 && dt < 3 ? ((V[i] + V[i - 1]) / 2 / 3.6) * dt : 0); }
  return (t) => {
    if (t <= T[0]) return S[0];
    if (t >= T[n - 1]) return S[n - 1] + (V[n - 1] / 3.6) * Math.min(3, (t - T[n - 1]) / 1000);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
    const dt = (t - T[lo]) / 1000, a = V[lo] / 3.6, b = V[hi] / 3.6, h = (T[hi] - T[lo]) / 1000 || 1;
    return S[lo] + a * dt + ((b - a) / h) * dt * dt / 2;
  };
}

// CarData and Position are stamped separately: telemetry can run a few hundred ms ahead of or behind the
// positions. The lag (ms) that best lines up the speed from the positions with the telemetry speed, over a
// sample of cars and moments (median error), is applied to the telemetry.
function telemetryLag(src) {
  const pairs = [];
  for (const [num, c] of Object.entries(src.tracks.cars)) {
    const car = src.car?.[num];
    if (!car || !car.t || car.t.length < 100 || c.n < 200) continue;
    for (let k = 2; k < c.n - 2; k += 7) {
      const dt = c.t[k + 2] - c.t[k - 2];
      if (dt <= 0 || dt > 2500) continue;
      const v = (Math.hypot(c.x[k + 2] - c.x[k - 2], c.y[k + 2] - c.y[k - 2]) * DM) / (dt / 1000) * 3.6;
      if (v > 60 && v < 360) pairs.push([c.t[k], v, car]);
    }
    if (pairs.length > 6000) break;
  }
  if (pairs.length < 300) return 0;
  const speedAt = (car, t) => { const T = car.t; let lo = 0, hi = T.length - 1; if (t <= T[0] || t >= T[hi]) return null; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; } const f = (t - T[lo]) / (T[hi] - T[lo] || 1); return car.v[lo] + (car.v[hi] - car.v[lo]) * f; };
  let best = 0, bestErr = Infinity;
  for (let lag = -2500; lag <= 2500; lag += 50) {
    const err = [];
    for (const [t, v, car] of pairs) { const w = speedAt(car, t + lag); if (w != null) err.push(Math.abs(w - v)); }
    err.sort((a, b) => a - b);
    const med = err[Math.floor(err.length / 2)];
    if (med < bestErr) { bestErr = med; best = lag; }
  }
  return best;
}

// Smooths one car's samples (arrays t, x, y, z in dm, n of them, from index `from`) into output arrays.
function smoothCar(c, from, frame, world, car, out, lag) {
  const n = c.n, c0 = world.center, T = c.t;
  const half = (s) => Math.max(s.L ?? 7, -(s.R ?? -7));
  // project every sample; on track = near the lap line (within its edges + 6 m) and at its height
  const P = [];
  let hint = null;
  for (let k = from; k < n; k++) {
    const x = c.x[k] * DM - c0.x, z = -(c.y[k] * DM - c0.z), y = (c.z[k] || 0) * DM - c0.y;
    const pr = frame.project(x, z, hint);
    const on = !!pr && Math.abs(pr.d) <= half(pr.sample) + 6 && Math.abs(y - pr.sample.p.y) < 4;
    if (pr) hint = pr.i;
    P.push({ t: T[k], x: c.x[k], y: c.y[k], z: c.z[k], on, s: pr?.s, d: pr?.d });
  }
  const Sv = speedIntegral(car, lag);
  const tmp = [0, 0, 0];
  const emit = (t, x, y, z) => { out.t.push(t); out.x.push(x); out.y.push(y); out.z.push(z); };
  let k = 0;
  while (k < P.length) {
    if (!P[k].on) { emit(P[k].t, P[k].x, P[k].y, P[k].z); k++; continue; }
    // a run of on-track samples without gaps
    let e = k;
    while (e + 1 < P.length && P[e + 1].on && P[e + 1].t - P[e].t < 4000) e++;
    const m = e - k + 1;
    if (m < 8) { for (let q = k; q <= e; q++) emit(P[q].t, P[q].x, P[q].y, P[q].z); k = e + 1; continue; }
    const t = new Float64Array(m), s = new Float64Array(m), d = new Float64Array(m);
    for (let q = 0; q < m; q++) { t[q] = P[k + q].t; s[q] = P[k + q].s; d[q] = P[k + q].d; }
    // unwrap s over the lap (cars go forward; a jump back of more than half a lap is the line being crossed)
    for (let q = 1; q < m; q++) { let ds = s[q] - s[q - 1]; while (ds < -frame.L / 2) { s[q] += frame.L; ds += frame.L; } while (ds > frame.L / 2) { s[q] -= frame.L; ds -= frame.L; } }
    const dS = gauss(t, median5(d), 500);
    // along the track: speed-integrated distance + a slow correction (robust: big misfits weigh less)
    let sAt;
    if (Sv) {
      const bias = new Float64Array(m); for (let q = 0; q < m; q++) bias[q] = s[q] - Sv(t[q]);
      let bS = gauss(t, bias, 1500);
      const w = new Float64Array(m);
      for (let it = 0; it < 2; it++) { for (let q = 0; q < m; q++) { const r = Math.abs(bias[q] - bS[q]); w[q] = r < 3 ? 1 : 3 / r; } bS = gauss(t, bias, 1500, undefined, w); }
      sAt = (tt, q) => { const f = q + 1 < m ? (tt - t[q]) / (t[q + 1] - t[q] || 1) : 0; return Sv(tt) + bS[q] + (q + 1 < m ? (bS[q + 1] - bS[q]) * f : 0); };
    } else {
      const sS = gauss(t, s, 350);
      sAt = (tt, q) => { const f = q + 1 < m ? (tt - t[q]) / (t[q + 1] - t[q] || 1) : 0; return sS[q] + (q + 1 < m ? (sS[q + 1] - sS[q]) * f : 0); };
    }
    // dense output every STEP_OUT ms
    let q = 0;
    for (let tt = t[0]; tt <= t[m - 1]; tt += STEP_OUT) {
      while (q + 1 < m && t[q + 1] <= tt) q++;
      const f = q + 1 < m ? (tt - t[q]) / (t[q + 1] - t[q] || 1) : 0, dd = dS[q] + (q + 1 < m ? (dS[q + 1] - dS[q]) * f : 0);
      frame.at(sAt(tt, q), dd, tmp);
      emit(tt, (tmp[0] + c0.x) / DM, (c0.z - tmp[2]) / DM, (tmp[1] + c0.y) / DM);
    }
    k = e + 1;
  }
}

// src: a Replay or LiveSource (tracks: CarTracks, car: telemetry); world: map3d's world.
// Returns { all(t, into, vels), update(now) } or null when the lap line isn't there.
export function smoothedTracks(src, world, CarTracks) {
  if (!world?.samples?.length || !src?.tracks?.cars) return null;
  const frame = trackFrame(world);
  let lag = null;
  const build = (fromTime) => {
    if (lag == null) lag = telemetryLag(src);
    const tr = new CarTracks();
    for (const [num, c] of Object.entries(src.tracks.cars)) {
      if (!c.n) continue;
      let from = 0;
      if (fromTime != null) { while (from < c.n && c.t[from] < fromTime) from++; }
      const out = { t: [], x: [], y: [], z: [] };
      smoothCar(c, from, frame, world, src.car?.[num], out, lag);
      const k = out.t.length;
      tr.cars[num] = { t: Float64Array.from(out.t), x: Float32Array.from(out.x), y: Float32Array.from(out.y), z: Float32Array.from(out.z), n: k };
    }
    return tr;
  };
  if (!src.isLive) {
    const tr = build(null);
    return { all: (t, into, vels) => tr.all(t, into, vels), update() {}, lag };
  }
  // live: redo the last 30 s once a second
  let tr = null, last = 0;
  return {
    all(t, into, vels) { return (tr || src.tracks).all(t - 600, into, vels); },
    update(now) { if (now - last < 1000) return; last = now; const latest = Math.max(0, ...Object.values(src.tracks.cars).map((c) => (c.n ? c.t[c.n - 1] : 0))); tr = build(latest - 30000); },
  };
}

// Development: how steady the cars are over [t0, t1] – for every car on the track every 50 ms:
//   lateral: RMS of the across-track position minus its own 2 s average (weaving), metres
//   heading: RMS of (heading − lap line direction) minus its 2 s average (wobble), degrees
//   speed:   RMS of (speed along the track − telemetry speed), km/h
export function steadiness(tracks, src, world, t0, t1, lag = 0) {
  const frame = trackFrame(world), c0 = world.center, res = { lateral: [], heading: [], speed: [] };
  const into = {}, vels = {};
  const series = {};
  for (let t = t0; t <= t1; t += 50) {
    const pos = tracks.all(t, into, vels);
    for (const [num, p] of Object.entries(pos)) {
      const x = p[0] * DM - c0.x, z = -(p[1] * DM - c0.z), pr = frame.project(x, z);
      if (!pr || Math.abs(pr.d) > 15) continue;
      const v = vels[num], vx = v[0] * 100, vz = -v[1] * 100, sp = Math.hypot(vx, vz);
      if (sp < 15) continue;
      const head = Math.atan2(vx, vz) - Math.atan2(pr.sample.tan.x, pr.sample.tan.z), hw = Math.atan2(Math.sin(head), Math.cos(head));
      const tel = src.carAt ? src.carAt(num, t + lag) : null;
      (series[num] || (series[num] = [])).push([t, pr.d, hw, tel ? sp * 3.6 - tel.speed : null]);
    }
  }
  for (const list of Object.values(series)) {
    const t = list.map((r) => r[0]), dS = gauss(t, list.map((r) => r[1]), 700), hS = gauss(t, list.map((r) => r[2]), 700);
    list.forEach((r, i) => { res.lateral.push(r[1] - dS[i]); res.heading.push((r[2] - hS[i]) * 57.3); if (r[3] != null && Math.abs(r[3]) < 80) res.speed.push(r[3]); });
  }
  const rms = (a) => +Math.sqrt(a.reduce((x, y) => x + y * y, 0) / Math.max(1, a.length)).toFixed(3);
  return { lateralM: rms(res.lateral), headingDeg: rms(res.heading), speedKmh: rms(res.speed), samples: res.lateral.length };
}
