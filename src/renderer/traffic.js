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

// ---------- the correction (D) ----------
// F1's positions since 2023 are matched to one reference line: every car is on it, so two cars side by side, or one
// close behind another, are drawn in the same place. What is drawn is changed as little as the data allows and only
// in how it looks – never the order, laps, sectors or timing (the timing screens don't read any of this):
//  - across the track (dOff): when the data has two cars within a car's length of each other along the lap (side by
//    side at a start, a pass), or a pass is coming (below), they are parted to a car's width and a little, on the
//    tarmac, by a few rounds of position-based constraint solving over every close pair together (each pair pushes
//    its two cars apart in turn, then every car is clamped to the road) – a car between two others ends between
//    them, not pushed both ways at once (the old pairwise maximum/minimum sum cancelled: A pushed right by B and left
//    by C stayed on the line, in both)
//  - along the track (sOff): one car close behind another in a queue that isn't a pass (braking into a hairpin,
//    behind the safety car) is not put alongside – there's no room at Monaco, and it isn't what happened: the one
//    behind is drawn up to LONG_MAX m further back (the one ahead a little forward), never more than S_MAX m off
//    its own place however long the queue (no pile-up push), never past the other (the order along the lap stays)
//  - what can't be solved within those limits is left as it is and recorded (res: the remaining overlap, m), shown
//    by Map3D.trafficState – no invented contact, no claim of zero overlaps
// Passes: a pair is a pass when its order along the lap is the other way round within a few seconds of now. Past data
// (−1…−3 s) is used live and in replays. Future data (+1…+5 s) only in replays (env.live false), to start pulling out before the cars
// meet, as the data says the pass will happen; live there is no future – a pass is assumed from the closing speed
// (the one behind faster by CLOSE_V m/s and due to reach the other within CLOSE_S s). None of it changes the order
// or the timing shown – only where the two cars are drawn across the track.
// Timing: all rates are in the session's time (t), so the result doesn't depend on the frame rate or the playback
// speed; a step back in time, or forward by more than JUMP_MS, is a seek: the memory (pair sides) is cleared and the
// offsets set to their targets at once.
export const TRAFFIC = {
  WINDOW: 32,      // m along the lap: pairs looked at
  GAP_L: 0.4,      // m nose to tail kept clear (on top of the cars' lengths)
  GAP_W: 0.6,      // m side to side kept clear (on top of their widths: a car changing lanes is turned a few degrees, its corners swing out ~0.3 m)
  EDGE: 0.1,       // m a car's side may go over the edge line (onto the kerb) when parted
  LONG_MAX: 2.5,   // m a pair may be drawn further apart along the track
  S_MAX: 2.0,      // m any car may be drawn off its place along the track
  PASS_BY: 2.5, PASS_EASE: 2.0,  // a pass: the order the other way round by 2.5 m within 3 s back (replays: 5 s on); parted over the last 2 s before they meet
  LOOK_MS: 1500,   // a pair's spacing this far ahead is looked at too (replays: the data; live: the closing speed)
  CLOSE_V: 3, CLOSE_S: 1.6,       // live: closing faster than 3 m/s, contact due within 1.6 s
  LAT_W: 5, LAT_V: 4.5,           // across: a critically damped spring of 5/s, at most 4.5 m/s sideways
  LONG_W: 8, LONG_V: 5,           // along: 8/s, at most 5 m/s
  PASS_V: 5,       // m/s of the target's own motion passed through as it is (more: eased)
  LEVELS: 2.5,     // m of height apart: different levels (a bridge over the track, the pit lane under it) – no interaction
  BOX_ROUNDS: 3, BOX_MAX: 2.5,    // boxes checked: up to 3 more solves, up to 2.5 m more asked for a pair
  JUMP_MS: 2000, ITER: 8, FORGET_MS: 3000,
};
const T = TRAFFIC;
// (the moments looked at for a pass: the last 3 s; in replays also the next 5 s)
const PASS_TAUS = [-1000, -2000, -3000, 1000, 2000, 3000, 4000, 5000];
const sstep = (e0, e1, x) => { const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
const wrapTo = (x, L) => ((x % L) + L * 1.5) % L - L / 2;

// the memory: per car its offsets and their rates, per pair the side chosen; reset by a seek or a new session
export function makeTraffic() { return { cars: new Map(), pairs: new Map(), lastT: null, cand: [], pool: [], used: 0, busy: new Set(), stats: { pairs: 0, lateral: 0, longitudinal: 0, residual: 0 } }; }
export function resetTraffic(S) { S.cars.clear(); S.pairs.clear(); S.lastT = null; }

// a critically damped spring towards `target` at rate w (1/s) with its speed held under vmax, over dt seconds in
// 10 ms steps (the same path at any frame rate)
function follow(o, k, kr, target, w, vmax, dt) {
  let x = o[k], v = o[kr];
  const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
  for (let i = 0; i < n; i++) { v += (w * w * (target - x) - 2 * w * v) * h; if (v > vmax) v = vmax; else if (v < -vmax) v = -vmax; x += v * h; }
  o[k] = x; o[kr] = v;
}

// One step at session time t (ms).
// list: the cars on the track now – { num, s, d, vs, y, held, front, back, half } (s, d: the steadied track
//   coordinates, B; front/back/half: the car's footprint; held: drawn in its grid slot – grid.js – not moved here)
// env: { L, live, edges(s) → { L, R } (m left/right of the lap line), turnAhead(s) (> 0: the next corner turns left),
//   kappa(s) (the lap line's curvature, 1/m, + left), peek(num, t) → the car's s at another time t, or null,
//   pose(s, d, out) → out.x, out.z, out.yaw: where a car at (s, d) is and faces (optional: the boxes check) }
// Returns S.cars: num → { dOff, dRate, sOff, sRate, tD, tS, res, mode }.
export function stepTraffic(S, list, env, t) {
  const L = env.L, n = list.length;
  const dtMs = S.lastT == null ? null : t - S.lastT;
  const jump = dtMs == null || dtMs < 0 || dtMs > T.JUMP_MS;
  if (jump) S.pairs.clear();
  S.lastT = t;
  // per car: its place (p across, q along: offsets being solved), the road at its s
  for (const c of list) {
    let m = S.cars.get(c.num);
    if (!m) { m = { dOff: 0, dRate: 0, sOff: 0, sRate: 0, tD: 0, tS: 0, pD: null, pS: null, eD: 0, eDr: 0, eS: 0, eSr: 0, res: 0, mode: "" }; S.cars.set(c.num, m); }
    c.m = m; c.u = ((c.s % L) + L) % L; c.p = c.d; c.q = 0; c.res = 0; c.mode = "";
    const e = env.edges(c.s); c.lo = e.R + c.half - T.EDGE; c.hi = e.L - c.half + T.EDGE;
    if (c.lo > c.hi) c.lo = c.hi = (c.lo + c.hi) / 2;
  }
  for (const [num, m] of S.cars) if (!list.some((c) => c.num === num)) S.cars.delete(num);   // (gone: off the track, pit lane)
  list.sort((a, b) => a.u - b.u);
  // candidate pairs: each car and those up to WINDOW m ahead of it along the lap (sorted: a sweep, not every pair)
  const cand = S.cand; cand.length = 0; S.used = 0; S.busy.clear();
  for (let i = 0; i < n; i++) for (let k = 1; k < n; k++) {
    const r = list[i], f = list[(i + k) % n], du = ((f.u - r.u) % L + L) % L;
    if (du > T.WINDOW) break;
    if (r.held || f.held || Math.abs(r.y - f.y) > T.LEVELS) continue;
    cand.push(pairOf(S, r, f, du, env, t));
  }
  // across, then along (solve); then the pairs checked as boxes at the poses that gives (env.pose: a tight bend turns
  // two cars a car's length apart by 30°, and a sideways gap across the lap line no longer parts their corners): what
  // still overlaps asks for that much more – across if it's being parted across, else along – and is solved again
  for (const P of cand) { P.Wx = 0; P.Lx = 0; }
  solve(cand, list, jump);
  for (let round = 0; env.pose && round < T.BOX_ROUNDS; round++) {
    let more = false;
    for (const P of cand) {
      if (P.du * P.bend > P.Lneed + 3) continue;
      const o = pairDepth(env, P.r, P.r.s + P.r.q, P.r.p, P.f, P.f.s + P.f.q, P.f.p);
      if (o <= 0.02) continue;
      if (P.wLat > 0.5 && P.Wx < T.BOX_MAX) { P.Wx = Math.min(T.BOX_MAX, P.Wx + o * 1.2); more = true; }
      else if (!P.pass && P.wLong > 0 && P.deficit + P.Lx < T.LONG_MAX) { P.Lx = Math.min(T.BOX_MAX, P.Lx + o * 1.2); more = true; }
      // (along is used up – a hairpin's inside turns a car's length of lap line into two thirds of one – and there's
      // tarmac beside: the one behind is drawn a little wide of the one ahead, as cars queue round a hairpin)
      else if (!P.pass && P.wLat <= 0.5) { P.wLat = 1; P.side = sideOf(S, P.key, P.r, P.f, P.Wneed, env, t); P.r.mode = P.f.mode = "alongside"; more = true; }
    }
    if (!more) break;
    for (const c of list) { c.p = c.d; c.q = 0; }
    solve(cand, list, jump);
  }
  // eased to the targets (session time); a seek: at once
  const dt = jump ? 0 : dtMs / 1000;
  for (const c of list) {
    const m = c.m; m.tD = c.p - c.d; m.tS = c.q;
    // (the spring is on the difference from the target (e), the target's own motion passed through up to PASS_V m/s:
    // the steadied tracks' racing line can cross the track at 3 m/s into a corner, and an offset that had to catch up
    // with that – a spring on the offset itself – trailed it by a metre, the cars meeting in the corner; only what
    // the target moves faster than that – a pair taken up or let go, a side chosen – goes into e and is eased)
    if (jump) { m.dOff = m.tD; m.sOff = m.tS; m.dRate = m.sRate = 0; m.eD = m.eDr = m.eS = m.eSr = 0; }
    else if (dt > 0) {
      const vD = T.PASS_V * dt, kD = m.pD == null ? 0 : Math.max(-vD, Math.min(vD, m.tD - m.pD)), kS = m.pS == null ? 0 : Math.max(-vD, Math.min(vD, m.tS - m.pS));
      m.eD = m.dOff - m.tD + kD; m.eS = m.sOff - m.tS + kS;
      follow(m, "eD", "eDr", 0, T.LAT_W, T.LAT_V, dt); follow(m, "eS", "eSr", 0, T.LONG_W, T.LONG_V, dt);
      m.dRate = kD / dt + m.eDr; m.sRate = kS / dt + m.eSr;
      m.dOff = m.tD + m.eD; m.sOff = m.tS + m.eS;
      // (the drawn place kept on the tarmac too, not only the target: a target let go and taken up again – a pass
      // train – comes back faster than the eased lag goes, and target + lag went up to 0.5 m past the edge allowance
      // at Monaco 2025 (v0.45 Map3D.trafficAudit); a car the data has outside the allowance keeps its own place)
      const lo = Math.min(c.lo, c.d), hi = Math.max(c.hi, c.d), x = c.d + m.dOff;
      if (x > hi || x < lo) { const y = x > hi ? hi : lo; m.dOff = y - c.d; m.eD = m.dOff - m.tD; if (m.eDr * (x - y) > 0) { m.dRate -= m.eDr; m.eDr = 0; } }
    }
    m.pD = m.tD; m.pS = m.tS;
    // (the along offset never takes a car past the one it follows, eased or not – clamped again on the drawn value)
    m.res = 0; m.mode = c.mode;
  }
  for (const P of cand) {
    const g = P.du + P.f.m.sOff - P.r.m.sOff;
    if (g < 0.1 && P.du >= 0.1) { const x = (0.1 - g) / 2; P.r.m.sOff -= x; P.f.m.sOff += x; }
  }
  // what is left: the overlap the drawn offsets leave (as boxes at the drawn poses; without env.pose: along and
  // across the lap line both short of the cars' size), per car
  let res = 0;
  for (const P of cand) {
    if (P.du * P.bend > P.Lneed + 3) continue;
    const o = env.pose ? pairDepth(env, P.r, P.r.s + P.r.m.sOff, P.r.d + P.r.m.dOff, P.f, P.f.s + P.f.m.sOff, P.f.d + P.f.m.dOff)
      : Math.min(P.Lneed - T.GAP_L - (P.du + P.f.m.sOff - P.r.m.sOff) * P.bend, P.Wneed - T.GAP_W - Math.abs(P.r.d + P.r.m.dOff - P.f.d - P.f.m.dOff));
    if (o > 0.02) { res++; if (o > P.r.m.res) P.r.m.res = o; if (o > P.f.m.res) P.f.m.res = o; }
  }
  for (const [k, v] of S.pairs) if (t - v.t > T.FORGET_MS || v.t > t) S.pairs.delete(k);
  let nl = 0, ng = 0; for (const P of cand) { if (P.wLat > 0) nl++; if (P.wLong > 0) ng++; }
  S.stats.pairs = cand.length; S.stats.lateral = nl; S.stats.longitudinal = ng; S.stats.residual = res;
  return S.cars;
}

// One solve of the targets: across – constraint rounds over every pair being parted across, all together, each car
// clamped to the road after each round; then along – pairs not side by side enough (queues, not passes) drawn apart
// nose to tail within LONG_MAX, each car within S_MAX of its place; then the order along the lap made sure of.
// (the sideways gap that decides "side by side enough" is the one drawn now, not the target: a pair handed over from
// along to across stays apart along until the cars are apart across – the lateral offset takes a moment to get there)
function solve(cand, list, jump) {
  for (let it = 0; it < T.ITER; it++) {
    for (const P of cand) {
      if (P.wLat <= 0) continue;
      const need = P.wLat * (P.Wneed + P.Wx), cur = P.side * (P.r.p - P.f.p);
      if (cur >= need) continue;
      // (the one going by moves more: the one behind while it comes, the one ahead once it's by – the same car)
      const v = need - cur, kr = P.pass === "done" ? 0.4 : P.pass ? 0.6 : 0.5;
      P.r.p += P.side * v * kr; P.f.p -= P.side * v * (1 - kr);
    }
    for (const c of list) c.p = Math.max(c.lo, Math.min(c.hi, c.p));
  }
  for (const P of cand) {
    const W = P.Wneed + P.Wx, sep = jump ? Math.abs(P.r.p - P.f.p) : Math.min(Math.abs(P.r.p - P.f.p), Math.abs(P.r.d + P.r.m.dOff - P.f.d - P.f.m.dOff));
    P.wLong = P.pass || P.deficit + P.Lx <= 0 ? 0 : 1 - sstep(W - 0.5, W, sep);
  }
  for (let it = 0; it < T.ITER; it++) {
    for (const P of cand) {
      if (P.wLong <= 0) continue;
      const need = Math.min(P.deficit + P.Lx, T.LONG_MAX) * P.wLong, cur = P.f.q - P.r.q;
      if (cur >= need) continue;
      const v = need - cur; P.r.q -= v * 0.7; P.f.q += v * 0.3;
    }
    for (const c of list) c.q = Math.max(-T.S_MAX, Math.min(T.S_MAX, c.q));
  }
  // the order along the lap stays: no car drawn past the one it is behind (with a little margin)
  for (const P of cand) { const g = P.du + P.f.q - P.r.q; if (g < 0.1 && P.du >= 0.1) { const x = (0.1 - g) / 2; P.r.q -= x; P.f.q += x; } }
}
// two cars' boxes at track coordinates (s, d) each: how far they overlap (m, 0 = apart)
const PA = { x: 0, z: 0, yaw: 0 }, PB = { x: 0, z: 0, yaw: 0 };
function pairDepth(env, a, sa, da, b, sb, db) {
  env.pose(sa, da, PA); env.pose(sb, db, PB);
  return boxDepth(PA.x, PA.z, PA.yaw, a, PB.x, PB.z, PB.yaw, b);
}

// The side each car of a pair being parted across goes to (+1: r left of f), kept while the pair is close: as they
// already are if they're apart across; else the one behind to the inside of the next corner if there's room for it,
// or to the side with more room. (A car already being parted from another keeps the order across as it is drawn – a
// choice by preference for each pair of three cars abreast could ask for A left of B, B left of C and C left of A.)
function sideOf(S, key, r, f, Wneed, env, t) {
  let mem = S.pairs.get(key);
  if (!mem) {
    const dd = (r.d + r.m.dOff) - (f.d + f.m.dOff);
    let side;
    if (Math.abs(dd) > 0.4 || (dd !== 0 && (S.busy.has(r.num) || S.busy.has(f.num)))) side = Math.sign(dd);
    else {
      const roomL = r.hi - r.p, roomR = r.p - r.lo;
      side = env.turnAhead(r.s) >= 0 ? 1 : -1;
      if ((side > 0 ? roomL : roomR) < Wneed && (side > 0 ? roomR : roomL) > (side > 0 ? roomL : roomR)) side = -side;
    }
    mem = { left: side > 0 ? r.num : f.num, t }; S.pairs.set(key, mem);   // (who is left: the same whichever is ahead)
  }
  mem.t = t; mem.lat = true; S.busy.add(r.num); S.busy.add(f.num);
  return mem.left === r.num ? 1 : -1;
}

// One close pair: r behind f by du m along the lap line (the steadied tracks). What it needs: across (Wneed: their
// half widths and a gap) and along (Lneed: the rear's front and the front's back and a gap), whether it's a pass, how
// much along is missing (deficit, with the bend: on the inside of a corner the distance at an offset is shorter),
// and the side each goes to (kept while the pair is close).
function pairOf(S, r, f, du, env, t) {
  const key = r.num < f.num ? r.num + "/" + f.num : f.num + "/" + r.num;
  const Wneed = r.half + f.half + T.GAP_W;
  // along: on a bend the boxes' inside corners meet first – the length they need, as an arc of the bend's radius
  // (straight: front + back), and the lap line's distance at the cars' offset (bend: shorter on the inside)
  const k = env.kappa ? env.kappa(r.s + du / 2) : 0, R = Math.abs(k) > 1 / 300 ? 1 / Math.abs(k) : 0, h = Math.max(r.half, f.half);
  const Lneed = (R > h + 1 ? R * (Math.atan(r.front / (R - h)) + Math.atan(f.back / (R - h))) : r.front + f.back) + T.GAP_L;
  const bend = Math.max(0.5, 1 - k * (r.d + f.d) / 2);
  const deficit = Lneed - du * bend;
  // a pass: the order the other way round – by more than PASS_BY m, not the data's metre of noise in a queue – within
  // the last 3 s (always) or the next 5 s (replays only)
  let pass = null;
  for (const tau of PASS_TAUS) {
    if (tau > 0 && env.live) break;
    const sr = env.peek(r.num, t + tau), sf = env.peek(f.num, t + tau);
    if (sr == null || sf == null) continue;
    if (wrapTo(sf - sr, env.L) < -T.PASS_BY) { pass = tau > 0 ? "coming" : "done"; break; }
  }
  // live, a pass on its way from the closing speed (no future data)
  if (!pass && env.live) { const close = r.vs - f.vs; if (close > T.CLOSE_V && (du - Lneed) / close < T.CLOSE_S) pass = "closing"; }
  // the deficit a moment ahead too (up to LOOK_MS), so cars part before they meet, not after: replays from the data
  // (0.5, 1, 1.5 s on); live from the closing speed now (no future data)
  let def2 = deficit;
  if (env.live) def2 = deficit + Math.max(0, r.vs - f.vs) * T.LOOK_MS / 1000;
  else for (let tau = 500; tau <= T.LOOK_MS; tau += 500) { const sr = env.peek(r.num, t + tau), sf = env.peek(f.num, t + tau); if (sr != null && sf != null) def2 = Math.max(def2, Lneed - wrapTo(sf - sr, env.L) * bend); }
  let mem = S.pairs.get(key);
  let wLat = 0;
  // a pass coming: eased in over the last PASS_EASE s before they'd meet (by the closing speed now – the same lead at
  // any closing speed); done: held until they're 5 m clear
  const close = r.vs - f.vs, gap = du * bend - Lneed;
  if (pass === "done") wLat = sstep(5, 1, gap);
  else if (pass) wLat = gap <= 0 ? 1 : close > 0.3 ? sstep(T.PASS_EASE, 0.4, gap / close) : sstep(4, 1, gap);
  // not a pass: along first (a queue); across only when more than LONG_MAX is missing (alongside in the data – a
  // start, a wheel-to-wheel fight) – and kept across while still overlapping, once parted
  else {
    wLat = sstep(T.LONG_MAX, T.LONG_MAX + 1.5, def2);
    if (mem && mem.lat && deficit > 0) wLat = Math.max(wLat, sstep(0, T.LONG_MAX * 0.5, deficit));
  }
  const side = wLat > 0 ? sideOf(S, key, r, f, Wneed, env, t) : mem ? (mem.left === r.num ? 1 : -1) : 0;
  if (pass) { r.mode = f.mode = "pass"; } else if (wLat > 0) { r.mode = f.mode = "alongside"; } else if (deficit > 0) { r.mode = r.mode || "queue"; f.mode = f.mode || "queue"; }
  const P = S.pool[S.used] || (S.pool[S.used] = {}); S.used++;
  P.key = key; P.r = r; P.f = f; P.du = du; P.Wneed = Wneed; P.Lneed = Lneed; P.deficit = deficit; P.bend = bend; P.pass = pass; P.wLat = wLat; P.wLong = 0; P.side = side;
  return P;
}
