// Which positions are IN THE PIT LANE (v0.53) – one test for the steadied tracks (smooth.js: a sample there is the pit
// lane's, never smoothed onto the racing line) and the pit lane's drawing (map3d.js pitFrame: a car there is drawn from
// its raw position by the lane model).
//
// Until v0.52 both asked only whether the position fell in the measured pit path's 2 m cells (pitlane.js laneCells). Where
// the lane runs into the track – its entry leaving the racing line, its exit road merging back – those cells lie on the
// track's own tarmac, and every car going by at full speed was taken for a car in the pit lane for the samples it spent
// there: 2025 Hungary race, every car on every lap at the pit exit (s ≈ 3450 m, 290–315 km/h) was drawn for a frame at
// its raw position as "pit: exit" – ~18 m off where the steadied track had it, and back (Map3D.poseScan: 61 such jumps,
// 75 switches) – and at the pit entry the steadied track broke off into raw positions (74 switches, headings swinging
// 20–100°).
// Now a position is the pit lane's only where it is on the measured path AND off the track's tarmac (outside the lap
// line's measured edges, s.L / s.R, by more than EDGE m, or on another level – a lane under or over the track): on the
// tarmac it is the track's, whatever path the cells say runs there. A car the timing has in the pit lane (InPit) is the
// pit lane's wherever it is – the callers keep that flag's own rule.
import { laneCells } from "./pitlane.js";

export const EDGE = 0.5;      // m past the track's edge before a point can be the lane's (the edges are where cars drove ± half a car)
export const LEVEL = 4;       // m of height: a lane this far over / under the lap line is on another level

// Where the lap line runs over or under itself (Suzuka's crossover): its samples with another sample of the line within
// CROSS_R m across the ground, more than CROSS_GAP m further round the lap and more than LEVEL m higher or lower – only
// there does a position's height tell which road it is on (v0.53). Elsewhere the height is not asked: the feed's Z can be
// metres off – 2026 Hungary race: X/Y updated only every 4–5 s while Z ran on by itself, 10–24 m off the road at the real
// updates –, and v0.52 took those for another level: off the steadied tracks (the car drawn by raw jumps cutting across
// the infield) and, at the pit entry, in the pit lane. → Uint8Array per lap-line sample (1: where levels cross)
export const CROSS_R = 30, CROSS_GAP = 200;
const crossMemo = new WeakMap();
export function crossings(world) {
  const S = world?.samples; if (!S?.length) return new Uint8Array(0);
  let m = crossMemo.get(S); if (m) return m;
  const n = S.length; m = new Uint8Array(n);
  const cum = new Float64Array(n); for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(S[i].p.x - S[i - 1].p.x, S[i].p.z - S[i - 1].p.z);
  const L = cum[n - 1] + Math.hypot(S[0].p.x - S[n - 1].p.x, S[0].p.z - S[n - 1].p.z);
  // (a coarse grid of the samples, CROSS_R cells)
  const cell = new Map(), key = (x, z) => Math.floor(x / CROSS_R) + "," + Math.floor(z / CROSS_R);
  S.forEach((q, i) => { const k = key(q.p.x, q.p.z); (cell.get(k) || cell.set(k, []).get(k)).push(i); });
  for (let i = 0; i < n; i++) {
    const a = S[i].p, cx = Math.floor(a.x / CROSS_R), cz = Math.floor(a.z / CROSS_R);
    for (let dx = -1; dx <= 1 && !m[i]; dx++) for (let dz = -1; dz <= 1 && !m[i]; dz++) for (const j of cell.get(cx + dx + "," + (cz + dz)) || []) {
      const b = S[j].p, along = Math.abs(cum[i] - cum[j]), round = Math.min(along, L - along);
      if (round > CROSS_GAP && Math.hypot(a.x - b.x, a.z - b.z) < CROSS_R && Math.abs(a.y - b.y) > LEVEL) { m[i] = 1; break; }
    }
  }
  crossMemo.set(S, m);
  return m;
}
// is the height y at lap-line sample s another level? Only where levels cross (crossings); elsewhere never
export function offLevel(world, s, y) {
  if (y == null || !s) return false;
  return crossings(world)[s.i] === 1 && Math.abs(y - s.p.y) > LEVEL;
}

const memo = new WeakMap();
// world: map3d's world ({ grid, pitLane: { pts: [{ x, z }] } }) → test(x, z, y?) → bool
export function pitLaneTest(world) {
  const lane = world?.pitLane; if (!lane?.pts?.length) return () => false;
  let f = memo.get(lane);
  if (f && f.grid === world.grid) return f.test;
  const cells = laneCells(lane.pts.map((p) => [p.x, p.z]));
  const test = (x, z, y = null) => {
    if (!cells(x, z)) return false;
    return !onTarmac(world.grid, x, z, y, world);
  };
  memo.set(lane, f = { grid: world.grid, test });
  return test;
}
// is (x, z) on the track's tarmac (within the lap line's edges + EDGE, at its level)? grid: the lap line's SpatialGrid
// (world: with it the height is asked only where levels cross – crossings; without, everywhere)
export function onTarmac(grid, x, z, y = null, world = null) {
  const [s] = grid.nearest(x, z, 2); if (!s) return false;
  if (y != null && (world ? offLevel(world, s, y) : Math.abs(y - s.p.y) > LEVEL)) return false;
  const lat = (x - s.p.x) * s.nor.x + (z - s.p.z) * s.nor.z;
  return lat <= (s.L ?? 7) + EDGE && lat >= (s.R ?? -7) - EDGE;
}
