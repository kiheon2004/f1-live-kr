// The venue's other tarmac next to the F1 track – escape roads, rejoin routes, the other layouts' raceways, service
// roads that meet the track – as continuous strips: at the map's width, carried right up to the track's edge where they
// join it (no gap at the junction, nothing laid on the track's own tarmac), mitred at bends, on a height that blends
// from the track's to the terrain's. Pure geometry here (tested); scenery.js turns the strips into a mesh.
//
// Before (v0.33): such raceways were cut wherever they came within the track's half width + 5.5 m of its centre line –
// Monza's first-chicane escape road runs that close beside the track for 150 m, so it was left in pieces – and drawn
// 9 m wide over a 12 m asphalt stroke in the ground, on a height that stepped 60 m from the track.

// lines: scene lines (pts in scene x, z already); T: { local(x, z) → { s, l, a } | null (the track's nearest sample,
// lateral and along offsets), edge(s, side) → lateral of that side's tarmac edge (+ left) }.
// Returns runs: [{ pts: [[x, z]…] (every ≤ 2 m), w, k, sub, joins: [start, end] (meets the track there) }].
// (street: a street circuit – its service roads are the town's streets, already in the ground's paint: not drawn again)
// (skip(x, z): ground already drawn otherwise – the app's own pit lane: a raceway mapped there isn't laid again.
// A run that doesn't meet the track is kept only if short and close to it (another layout's bend beside the F1 one) –
// v0.34 laid kart tracks, drag strips and old roads 12 m wide wherever the map had them)
export function auxRuns(lines, T, { step = 2, minLen = 8, street = false, skip = null, looseLen = 300, looseNear = 30 } = {}) {
  const runs = [];
  const onTarmac = (q, m = 0) => q && Math.abs(q.a) < 3 && q.l < T.edge(q.s, 1) + m && q.l > T.edge(q.s, -1) - m;
  for (const l of lines) {
    // (a bridge's or a tunnel's piece isn't laid on the ground under or over it)
    if (l.bridge || l.tunnel) continue;
    // (the map's highway=track – a marshal or recovery track – comes as a path with sub "track": scene.js)
    const isRace = l.k === "raceway", isService = !street && ((l.k === "road" && l.sub === "service") || (l.k === "path" && l.sub === "track") || (l.k === "road" && l.sub === "track"));
    if (!isRace && !isService) continue;
    const pts = densify(l.pts, step);
    if (pts.length < 2) continue;
    // a point on the F1 lap itself: on its tarmac (a metre's slack) and running along it
    const lap = pts.map((p, i) => {
      if (skip?.(p[0], p[1])) return true;
      const q = T.local(p[0], p[1]);
      if (!onTarmac(q, 1)) return false;
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
      return Math.abs((dx * q.s.tan.x + dz * q.s.tan.z) / L) > 0.85;
    });
    // a service road only where it meets the track (a marshal or recovery road) – the rest of the map's roads stay
    // in the ground's paint
    if (isService && !pts.some((p) => onTarmac(T.local(p[0], p[1]), 4))) continue;
    let i = 0;
    while (i < pts.length) {
      if (lap[i]) { i++; continue; }
      let j = i;
      while (j + 1 < pts.length && !lap[j + 1]) j++;
      // (the lap point either side is where it joins the track)
      const a = i > 0 ? i - 1 : i, b = j < pts.length - 1 ? j + 1 : j;
      const run = pts.slice(a, b + 1);
      let len = 0; for (let k = 1; k < run.length; k++) len += Math.hypot(run[k][0] - run[k - 1][0], run[k][1] - run[k - 1][1]);
      const touch = (p) => onTarmac(T.local(p[0], p[1]), 2);
      const joins = [a < i || touch(run[0]), b > j || touch(run[run.length - 1])];
      const near = () => run.some((p) => { const q = T.local(p[0], p[1]); return q && Math.abs(q.a) < 3 && Math.abs(q.l) < looseNear; });
      if (len >= minLen && (joins[0] || joins[1] || (len <= looseLen && near()))) runs.push({ pts: run, w: l.w, k: l.k, sub: l.sub, joins });
      i = j + 1;
    }
  }
  return runs;
}

// The strip's two edges for a run: mitred offsets (limited to twice the half width at sharp bends), each edge point that
// falls on the F1 track's tarmac moved out to that edge (so the strip meets the track there and is never laid over it).
// → { left: [[x, z]…], right: [[x, z]…] }
export function ribbonEdges(run, T, { miterLimit = 2 } = {}) {
  const P = run.pts, n = P.length, h = run.w / 2, left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[i], c = P[Math.min(n - 1, i + 1)];
    const d1 = norm(b[0] - a[0], b[1] - a[1]) || norm(c[0] - b[0], c[1] - b[1]), d2 = norm(c[0] - b[0], c[1] - b[1]) || d1;
    // the bisector's normal, scaled so the strip keeps its width through the bend (miter), limited
    let tx = d1[0] + d2[0], tz = d1[1] + d2[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx, cos = nx * -d1[1] + nz * d1[0], m = Math.min(miterLimit, 1 / Math.max(0.2, Math.abs(cos)));
    for (const [side, out] of [[1, left], [-1, right]]) {
      let x = b[0] + nx * h * m * side, z = b[1] + nz * h * m * side;
      const q = T.local(x, z);
      if (q && Math.abs(q.a) < 3) {
        const L = T.edge(q.s, 1), R = T.edge(q.s, -1);
        if (q.l < L + 0.1 && q.l > R - 0.1) {
          // onto the nearer edge, on the side where the road's own centre is
          const qc = T.local(b[0], b[1]), mid = (L + R) / 2, toL = qc ? qc.l >= mid : q.l >= mid, nl = toL ? L + 0.1 : R - 0.1;
          x = q.s.p.x + q.s.tan.x * q.a + q.s.nor.x * nl; z = q.s.p.z + q.s.tan.z * q.a + q.s.nor.z * nl;
        }
      }
      out.push([x, z]);
    }
  }
  return { left, right };
}

// Height for the strip: the track's (a little under its surface) close to it, the terrain's beyond, blended between
// `near` and `far` metres from the track's centre line – never under the terrain.
export function blendHeight(trackY, terrainY, dist, near = 20, far = 60) {
  const t = Math.min(1, Math.max(0, (dist - near) / (far - near))), k = t * t * (3 - 2 * t);
  const y = (trackY - 0.03) * (1 - k) + terrainY * k;
  return Math.max(y, terrainY + 0.05);
}

// Is (x, z) at the mouth of a run that meets the track – within its half width + pad of the first or last `mouth` metres
// of it, at an end that joins? Only there may a generated barrier be left open: a road running long beside the track
// opened the barrier along all of it (v0.34).
export function onJoiningRun(runs, pad = 1.5, mouth = 30) {
  const segs = [];
  for (const r of runs) {
    const P = r.pts, cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = cum[cum.length - 1];
    for (let i = 1; i < P.length; i++) if ((r.joins[0] && cum[i - 1] <= mouth) || (r.joins[1] && L - cum[i] <= mouth)) segs.push([P[i - 1], P[i], r.w / 2 + pad]);
  }
  return (x, z) => segs.some(([a, b, h]) => {
    if (x < Math.min(a[0], b[0]) - h || x > Math.max(a[0], b[0]) + h || z < Math.min(a[1], b[1]) - h || z > Math.max(a[1], b[1]) + h) return false;
    const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L));
    return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z) < h;
  });
}

function norm(x, z) { const l = Math.hypot(x, z); return l > 1e-6 ? [x / l, z / l] : null; }
function densify(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > 0.05) {
      if (out.length) { const q = out[out.length - 1], d = Math.hypot(p[0] - q[0], p[1] - q[1]), k = Math.ceil(d / step); for (let j = 1; j < k; j++) out.push([q[0] + ((p[0] - q[0]) * j) / k, q[1] + ((p[1] - q[1]) * j) / k]); }
      out.push([p[0], p[1]]);
    }
  }
  return out;
}
