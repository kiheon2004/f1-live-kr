// Cars in traffic (v0.44): where cars drawn on the track would overlap, and the room-making that keeps them apart.
// Pure functions (no three.js), used by map3d.js (traffic(), the overlap scan Map3D.overlapScan) and the tests.
//
// Layers (kept apart so each can be looked at):
//   A raw      – the feed's positions (Position.z, ~4 Hz, every car matched to one reference line since 2023)
//   B aligned  – the steadied track coordinates (smooth.js: s along the lap line, d across it, on the racing line)
//   C rendered – what is drawn: B plus the correction below (and the grid / pit-lane placements of map3d.js)
//   D correction – per car the offset across (dOff) and along (sOff) the track, its target and the residual: an
//                  overlap the correction could not remove within its limits (inspectable: Map3D.trafficState)

// ---------- oriented boxes ----------
// A car's footprint: a rectangle around its position, `front` m ahead and `back` m behind along its heading
// (yaw: atan2(x, z) of the direction it faces – map3d's convention), `half` m to either side.
// Overlap depth: how far the two rectangles go into each other along the axis where that is least (separating
// axis test over the four edge normals); 0 = apart.
export function boxDepth(ax, az, ayaw, A, bx, bz, byaw, B) {
  const fa = [Math.sin(ayaw), Math.cos(ayaw)], fb = [Math.sin(byaw), Math.cos(byaw)];
  // (centres of the rectangles: the position plus the front/back asymmetry along the heading)
  const ca = [ax + fa[0] * (A.front - A.back) / 2, az + fa[1] * (A.front - A.back) / 2];
  const cb = [bx + fb[0] * (B.front - B.back) / 2, bz + fb[1] * (B.front - B.back) / 2];
  const hla = (A.front + A.back) / 2, hlb = (B.front + B.back) / 2;
  const axes = [fa, [fa[1], -fa[0]], fb, [fb[1], -fb[0]]];
  const dx = cb[0] - ca[0], dz = cb[1] - ca[1];
  let depth = Infinity;
  for (const [x, z] of axes) {
    const ra = hla * Math.abs(fa[0] * x + fa[1] * z) + A.half * Math.abs(fa[1] * x - fa[0] * z);
    const rb = hlb * Math.abs(fb[0] * x + fb[1] * z) + B.half * Math.abs(fb[1] * x - fb[0] * z);
    const o = ra + rb - Math.abs(dx * x + dz * z);
    if (o <= 0) return 0;
    if (o < depth) depth = o;
  }
  return depth;
}

// ---------- scan statistics ----------
// Overlap episodes: per pair, consecutive frames overlapping (a gap of up to `gapMs` joins them), with the frames'
// causes counted, the deepest overlap and where/when it was. Feed frames in time order.
export function episodeLog(gapMs = 250) {
  const open = new Map(), done = [];
  return {
    add(t, key, depth, cause, info) {
      let e = open.get(key);
      if (e && t - e.t1 > gapMs) { done.push(e); e = null; }
      if (!e) { e = { key, t0: t, t1: t, frames: 0, depth: 0, causes: {}, at: info }; open.set(key, e); }
      e.t1 = t; e.frames++; e.causes[cause] = (e.causes[cause] || 0) + 1;
      if (depth > e.depth) { e.depth = depth; e.at = info; e.worstT = t; }
    },
    finish() { done.push(...open.values()); open.clear(); for (const e of done) e.cause = Object.entries(e.causes).sort((a, b) => b[1] - a[1])[0][0]; return done; },
  };
}
const pct = (a, f) => (a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * f))].toFixed(2) : null);
// summary per cause: episodes, frames, durations (s) and depths (m) – median, 90th percentile, max
export function summarise(episodes, frameMs) {
  const by = {};
  for (const e of episodes) {
    const b = by[e.cause] || (by[e.cause] = { episodes: 0, frames: 0, dur: [], depth: [] });
    b.episodes++; b.frames += e.frames; b.dur.push((e.t1 - e.t0 + frameMs) / 1000); b.depth.push(e.depth);
  }
  const out = {};
  for (const [k, b] of Object.entries(by)) {
    b.dur.sort((x, y) => x - y); b.depth.sort((x, y) => x - y);
    out[k] = { episodes: b.episodes, frames: b.frames, durS: [pct(b.dur, 0.5), pct(b.dur, 0.9), pct(b.dur, 1)], depthM: [pct(b.depth, 0.5), pct(b.depth, 0.9), pct(b.depth, 1)] };
  }
  return out;
}

// Why two cars drawn overlapping (C) do so – the first that applies:
//   pit-lane / pit-vs-track – one or both drawn from the pit lane's placement (raw positions, not corrected)
//   off-track               – one drawn from its raw position off the steadied tracks (a short stretch, run-off)
//   estimated / grid        – a placement without position data (startplan.js) or the grid slots (grid.js)
//   feed:*                  – the feed itself has them within a car's length (A overlaps: alongside or the data's
//                             error), and the correction didn't part them across the track:
//                             narrow (no room for two cars side by side), cancel (pushed both ways at once),
//                             lag (the target parts them, the eased offset hasn't got there), short (the target
//                             doesn't part them enough), none (no correction at all)
//   smoothing               – A apart, B (the steadied tracks) together: smoothing or alignment in time
//   correction              – B apart, C together, a correction acting: the room-making moved one into the other
//   pose                    – B apart, C together, no correction: the boxes' headings in a corner (s is measured on
//                             the lap line; across a tight bend the distance at an offset differs)
export function classifyOverlap(p) {
  if (p.pitA && p.pitB) return "pit-lane";
  if (p.pitA || p.pitB) return "pit-vs-track";
  if (p.offA || p.offB) return "off-track";
  if (p.est) return "estimated";
  if (p.grid) return "grid";
  if (p.aligned > 0) {
    if (!(p.raw > 0)) return "smoothing";
    if (p.room < p.need) return "feed:narrow";
    if (p.cancel) return "feed:cancel";
    if (p.tgtSep >= p.need) return "feed:lag";
    if (p.moved) return "feed:short";
    return "feed:none";
  }
  return p.moved ? "correction" : "pose";
}
