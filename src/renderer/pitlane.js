// The pit lane across, at circuits without a modelled pit building (facilities.js has seven): where its garages are.
//
// What the data gives: the pit lane's path (startdata.js – where the cars drove in it, measured at all 26 circuits)
// and which side the track is on. What it doesn't: how far the garages are from that path. The feed puts every car in
// the pit lane on one line – a car stopped at its box too (41 races, 2024–26: the median sideways offset of a stop from
// the path is 0.0 m) – and that line is not in the same place across the lane everywhere: the modelled buildings'
// garage fronts are 1.1 m (Silverstone) to 14.5 m (Lusail) from it. So the garages' line is taken from the map: the
// buildings met first on the side away from the track, along the lane, at the same distance again and again (a level
// ray out from the path; their median) – those are the pit building. Where the map has none, a building is made up on
// the line at a typical distance (GENERIC.front), said so.
//
// Points are scene metres [x, z]; a building's outline is its ring of points (facilities.js ring()).

// estimates, not measured: a pit building's garages are ~8–9 m wide (Silverstone: 41 over ~370 m), a generic one is
// 8 m high (one garage level and a floor over it), set 11 m from the path (the median of the map's pit buildings
// met at 15 circuits: 5.6–14.6 m), its run of garages 340 m at most (ten teams, three garages each)
export const GENERIC = { front: 11, depth: 18, height: 8, pitch: 8.5, maxRun: 340, ends: 40 };
export const PICK = { step: 10, min: 3, max: 25, near: 4, share: 0.4, minHits: 2 };

// a frame along a polyline: at(u) → { x, z, tx, tz, nx, nz } (n: the left normal, t turned +90°)
export function pathFrame(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1];
  const at = (u) => {
    u = Math.max(0, Math.min(len, u));
    let i = 1; while (i < pts.length - 1 && cum[i] < u) i++;
    const a = pts[i - 1], b = pts[i], l = cum[i] - cum[i - 1] || 1, f = (u - cum[i - 1]) / l, tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l;
    return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, tx, tz, nx: -tz, nz: tx };
  };
  return { pts, cum, len, at };
}

// where a ray from (x, z) along (dx, dz) first crosses a ring's edges: the distance, or Infinity
export function rayRing(x, z, dx, dz, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], ex = b[0] - a[0], ez = b[1] - a[1];
    const den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
    const s = ((a[0] - x) * ez - (a[1] - z) * ex) / den, t = ((a[0] - x) * dz - (a[1] - z) * dx) / den;
    if (s > 0 && t >= 0 && t <= 1 && s < best) best = s;
  }
  return best;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

// The garages' side of the lane and the map's pit building along [u0, u1]:
//   frame – pathFrame of the pit path; rings – [{ ring, ref }] the map's buildings (ref: whatever the caller needs back)
//   toTrack(x, z) → [dx, dz] towards the track
// → { front (m from the path, null without a building met often enough), coverage (share of the stations that met
//   one near that line), parts (refs of the buildings met there), side(u) → the garages' direction [gx, gz] }
export function garageLine(frame, rings, toTrack, u0, u1, opt = PICK) {
  const side = (u) => { const p = frame.at(u), [tx, tz] = toTrack(p.x, p.z), s = p.nx * tx + p.nz * tz >= 0 ? -1 : 1; return [p.nx * s, p.nz * s]; };
  // (only buildings that come near the lane at all)
  const box = (r) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x0, x1, z0, z1]; };
  const cand = rings.map((r) => ({ ...r, box: box(r.ring) }));
  const stations = [];
  for (let u = u0; u <= u1 + 1e-6; u += opt.step) {
    const p = frame.at(u), [gx, gz] = side(u), R = opt.max + 1;
    let best = Infinity, who = null;
    for (const c of cand) {
      const [x0, x1, z0, z1] = c.box;
      if (p.x + R < x0 || p.x - R > x1 || p.z + R < z0 || p.z - R > z1) continue;
      const s = rayRing(p.x, p.z, gx, gz, c.ring);
      if (s >= opt.min && s <= opt.max && s < best) { best = s; who = c.ref; }
    }
    stations.push({ u, s: who ? best : null, ref: who });
  }
  const hits = stations.filter((s) => s.ref != null), front = median(hits.map((s) => s.s));
  if (front == null) return { front: null, coverage: 0, parts: [], side, stations };
  const onLine = hits.filter((s) => Math.abs(s.s - front) <= opt.near);
  const count = new Map(); for (const s of onLine) count.set(s.ref, (count.get(s.ref) || 0) + 1);
  const parts = [...count].filter(([, n]) => n >= opt.minHits).map(([r]) => r);
  const coverage = stations.length ? onLine.filter((s) => parts.includes(s.ref)).length / stations.length : 0;
  return { front: coverage >= opt.share ? front : null, coverage: +coverage.toFixed(2), parts: coverage >= opt.share ? parts : [], side, stations };
}

// The run of garages along the lane: between the limiter lines less GENERIC.ends at each end, at most GENERIC.maxRun
// long, centred (where the boxes are isn't known before the session's stops show it – an estimate)
export function garageRun(limitOn, limitOff, len, g = GENERIC) {
  let a = Math.max(0, limitOn) + g.ends, b = Math.min(len, limitOff) - g.ends;
  if (b - a < 60) { a = Math.max(0, (limitOn + limitOff) / 2 - 30); b = a + 60; }
  if (b - a > g.maxRun) { const c = (a + b) / 2; a = c - g.maxRun / 2; b = c + g.maxRun / 2; }
  return [a, b];
}

// A made-up pit building's outline on the line: from u0 to u1, `front` m from the path towards the garages, `depth` deep
// (scene points, closed ring without the repeated first point)
export function genericOutline(frame, side, u0, u1, front = GENERIC.front, depth = GENERIC.depth, step = 10) {
  const near = [], far = [];
  for (let u = u0; ; u = Math.min(u1, u + step)) {
    const p = frame.at(u), [gx, gz] = side(u);
    near.push([p.x + gx * front, p.z + gz * front]); far.push([p.x + gx * (front + depth), p.z + gz * (front + depth)]);
    if (u >= u1) break;
  }
  return [...near, ...far.reverse()];
}

// Across the lane in front of the garages (metres out from their fronts) – estimates on the FIA's layout of a working
// lane by the garages and a fast lane by the pit wall (no circuit's own widths are in the data): a car stands in its
// box 4 m out, the line between the lanes is painted 7.5 m out, the cars drive 10.5 m out.
export const LANES = { box: 4, divider: 7.5, fast: 10.5, ends: 40, near: 25, slow: 14 };

// Where a car in the pit lane is drawn across it: the feed has every car on one line, wherever that runs (1–15 m from
// the garages). In front of the garages a car driving is put in the fast lane and one slowing at its own team's box
// swings into the box – its place along the lane stays the feed's (a stop is where the data has it). Towards the ends
// of the garages' run it goes back to the feed's line (the entry and exit). → the offset to draw it at (m out from the
// garages) – the feed's own where nothing applies.
//   off, u – the feed's place in front of the garages (G.project); gStart, gEnd – the run; speed (m/s); boxU – its box
export function laneOffset({ off, u, gStart, gEnd, speed, boxU = null }, L = LANES) {
  if (!(off > -3 && off < 30) || u < gStart - L.ends || u > gEnd + L.ends) return off;
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // in the run (1) – back to the feed's line over `ends` m past either end (0)
  const inRun = Math.min(ss(gStart - L.ends, gStart, u), 1 - ss(gEnd, gEnd + L.ends, u));
  // at its box: within `near` m of it along the lane and slow (a drive-through at the limit stays in the fast lane).
  // Its box not known yet (no stop of its team seen so far – the race's first stops): slowing well under the limit in
  // front of the garages is a car pulling into its box (nobody else slows there)
  const slow = 1 - ss(L.slow * 0.5, L.slow, speed);
  const atBox = boxU == null ? slow : (1 - ss(0, L.near, Math.abs(u - boxU))) * slow;
  const lane = L.fast + (L.box - L.fast) * atBox;
  return off + (lane - off) * inRun;
}

// The pit lane's path (points [x, z], scene metres) as 2 m cells: within `tol` m of it, `ends` m clear of its ends
// (where it runs into the lap line) – (x, z) → on the pit lane. Made once; one lookup a test (the precise segment test
// over every position of a session would be millions of tests).
export function laneCells(pts, tol = 3, ends = 40, C = 2) {
  if (!pts || pts.length < 2) return () => false;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1], set = new Set(), key = (i, j) => i * 100003 + j;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = cum[i] - cum[i - 1];
    for (let t = 0; t <= l; t += C / 2) {
      const u = cum[i - 1] + t; if (u < ends || u > len - ends) continue;
      const x = a[0] + ((b[0] - a[0]) * t) / (l || 1), z = a[1] + ((b[1] - a[1]) * t) / (l || 1);
      // every cell whose centre lies within tol of this point
      for (let ci = Math.floor((x - tol) / C); ci <= Math.floor((x + tol) / C); ci++) for (let cj = Math.floor((z - tol) / C); cj <= Math.floor((z + tol) / C); cj++)
        if (Math.hypot((ci + 0.5) * C - x, (cj + 0.5) * C - z) <= tol) set.add(key(ci, cj));
    }
  }
  return (x, z) => set.has(key(Math.floor(x / C), Math.floor(z / C)));
}

// A wall's line across, smoothed: at each station a straight line fitted to its neighbours within ±`half` m (least
// squares), the points more than `tol` m off it dropped and the line fitted again – a wall follows a slope exactly (the
// track running at an angle to a building's axis: Barcelona) and ignores a jump of the measured edge (Sakhir's zigzag).
//   pts: [[u, v]] sorted by u → [v] smoothed
export function fitLine(pts, half = 30, tol = 1) {
  const fit = (sel) => {
    const n = sel.length; let su = 0, sv = 0, suu = 0, suv = 0;
    for (const [u, v] of sel) { su += u; sv += v; suu += u * u; suv += u * v; }
    const den = n * suu - su * su;
    const b = Math.abs(den) < 1e-9 ? 0 : (n * suv - su * sv) / den, a = (sv - b * su) / n;
    return (u) => a + b * u;
  };
  return pts.map(([u]) => {
    const sel = pts.filter(([w]) => Math.abs(w - u) <= half);
    if (sel.length < 2) return pts.find(([w]) => w === u)[1];
    // (first the points near the window's median – a jump can't tilt the start –, then every point near that line)
    const vs = sel.map(([, v]) => v).sort((a, b) => a - b), med = vs[Math.floor(vs.length / 2)];
    const core = sel.filter(([, v]) => Math.abs(v - med) <= 2 * tol);
    let f = fit(core.length >= 2 ? core : sel);
    const keep = sel.filter(([w, v]) => Math.abs(v - f(w)) <= tol);
    if (keep.length >= 2) f = fit(keep);
    return f(u);
  });
}

// ---------- the pit lane across, from what is measured at a place along it ----------
// The FIA's rules (2025 Sporting Regulations, Art. 34.4, 34.12; Appendix O): the lane by the pit wall is the fast lane,
// no more than 3.5 m wide; the lane by the garages is the inner lane, the only place work is done on a car; no equipment
// is left in the fast lane; a pit lane is at least 12 m wide. What isn't in the rules or the data – estimates: a car is
// 2 m wide, its crew needs 1.6 m between it and the garages and 1.4 m on the lane side, all inside the inner lane.
export const FIA = { fastMax: 3.5, laneMin: 12 };
export const CREW_ROOM = { carHalf: 1, garageSide: 1.6, laneSide: 1.4, wallThick: 0.5 };

// st: { wall – the pit wall's face to the lane, metres out from the garages' fronts (null: no wall known), edge – the
// track's tarmac edge, same metres (a wall assumed there, its thickness in: an estimate), path – the feed's pit line }
// → { ok (room for a car in a box and the fast lane), wall, wallFrom, fast: [a, b], fastC, inner, boxC, narrow }
export function crossSection(st, R = CREW_ROOM) {
  const wall = st.wall != null ? st.wall : st.edge != null ? st.edge - R.wallThick : null;
  const wallFrom = st.wall != null ? "facility wall" : st.edge != null ? "track edge (wall assumed there)" : null;
  if (wall == null || !(wall > 0)) return { ok: false, wall: null, wallFrom, why: "no wall or track edge" };
  const fastW = Math.min(FIA.fastMax, wall / 2), inner = wall - fastW;
  const lo = R.carHalf + R.garageSide, hi = inner - R.carHalf - R.laneSide;
  const narrow = hi < lo;
  const boxC = narrow ? inner / 2 : Math.max(lo, Math.min(hi, inner / 2));
  return { ok: !narrow, wall, wallFrom, fast: [inner, wall], fastC: inner + fastW / 2, inner, boxC, narrow, lane: wall };
}

// Between which two garages' cross sections a place u along the run lies, by the garages' own centres (us: ascending) –
// → { i, t }: station i, t of the way to i + 1 (clamped at the run's ends). Not by u's distance from the run's start in
// garage pitches: a run's garages aren't always evenly spaced – Madrid 2026 has a 116 m gap between two blocks, and
// counting pitches from the start put every place past it 9½ garages too far on, on the last garage's section (the
// track turning away there: its wall 17.3 m out against 10.7 m at Haas) – the fast lane's cars were drawn 5 m beyond the
// pit wall, through the stands (v0.47, run/stands). Evenly spaced garages: the same as counting pitches.
export function laneStationAt(us, u) {
  const n = us.length; if (n < 2) return { i: 0, t: 0 };
  if (u <= us[0]) return { i: 0, t: 0 };
  if (u >= us[n - 1]) return { i: n - 2, t: 1 };
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (us[m] <= u) lo = m; else hi = m; }
  return { i: lo, t: (u - us[lo]) / (us[lo + 1] - us[lo] || 1) };
}
