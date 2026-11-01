// v0.54 (request §2): how a game car sits on its own path – a pure function of the engine's state at one render time, so
// the same moment always draws the same pose (pause, seek, any speed) and nothing is eased from frame to frame.
//
// Before v0.54 the game car's heading was the lap line's chord over ±3–10 m at the car's PRESENT offset across the road:
// the car crossing the road on the racing line (out → apex → out: 5–10 m across a bend) and every lane change were drawn
// as a car pointing along the lap line while it slid sideways – the "nose held by hand and turned" the user saw. Its
// turning rate, lean and slip came from frame-to-frame differences of that heading over the WALL clock's dt (at 10× the
// lean sat on its limit through every bend) and the front wheels from the engine's racing-line curvature, not the path
// drawn.
//
// Here the path is the one the engine drives: across = the racing line at s (track column `line`, what traffic.js steers
// the car to) + the car's own offset from it e (engine d − line) + e's rate along the lap (a lane change, from the
// engine's snapshots: eRate). The body points along that path at its REAR axle (a car's rear wheels follow their own
// path; the middle of the car runs a little inside it – 1.8 m × the curvature: a few degrees in a hairpin), turned a
// touch more into the corner by the replay's slip (map3d.js updateCars: ~1.5° at 5 g, a little oversteer on the power
// out of a slow corner); the turning rate is speed × the path's curvature; the lean, the dip and the front wheels'
// steer come from them as in the replay (pitch: slope + braking / acceleration, roll: the cornering force, steer: the
// path's curvature over the wheelbase plus the tyres' slip angle).
//
// geo: { at(s, d, P) → P [x, y, z] the scene point of engine (s, d), lineAt(s) → the racing line's offset (engine d, m) }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ss = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const LAT_G_MAX = 6.5;   // (car3d.js's grip limit for the drawn curvature – a few bad samples never read as 20 g)
export const SLIP_PER_ALAT = 0.0006, SLIP_MAX = 0.035, ROLL_PER_ALAT = 0.0002, ROLL_MAX = 0.012, PITCH_PER_A = 0.00032;

const PA = [0, 0, 0], PB = [0, 0, 0], PC = [0, 0, 0];
// the racing line's offset at s (track columns: n samples ds apart, linear, the lap closed)
export function lineOf(tr) {
  const C = tr?.columns?.line, n = tr?.n, ds = tr?.ds, L = tr?.L;
  if (!C || C.length !== n || !(ds > 0)) return () => 0;
  return (s) => { let u = (((s % L) + L) % L) / ds, i = Math.floor(u); if (i >= n) i = n - 1; const j = i + 1 === n ? 0 : i + 1, f = u - i; return C[i] + (C[j] - C[i]) * f; };
}

// the car's path across the road near s: d(s') = d0 + wl·(line(s') − line(s)) + slope·(s' − s) – wl fades the racing
// line's bends out below 3–10 m/s (a car standing on its grid slot points along its slot, not along a line it isn't on)
function pathD(geo, s, d0, wl, slope, s1) { return d0 + (wl ? wl * (geo.lineAt(s1) - geo.lineAt(s)) : 0) + slope * (s1 - s); }
function chordYaw(geo, s, d0, wl, slope, sa, sb) {
  geo.at(sa, pathD(geo, s, d0, wl, slope, sa), PA); geo.at(sb, pathD(geo, s, d0, wl, slope, sb), PB);
  return Math.atan2(PB[0] - PA[0], PB[2] - PA[2]);
}

// the pose on the lap: s, d (engine m), eRate (m/s across, relative to the racing line), v (m/s along), aLong (m/s²),
// o: { lr: the rear axle behind the car's origin (m), wb: wheelbase (m) }
export function lapPose(geo, s, d, eRate, v, aLong, o = {}, out = {}) {
  const lr = o.lr ?? 1.8, wb = o.wb ?? 3.6, sp = Math.abs(v), fwd = v < -0.5 ? -1 : 1;
  const wl = ss(3, 10, sp), slope = clamp(eRate / Math.max(sp, 5), -0.1, 0.1) * fwd;   // (across ≤ ~6° of the way along)
  const h = clamp(sp * 0.1, 3, 10), sR = s - fwd * lr * ss(0.5, 3, sp);
  // heading: the path's direction at the rear axle (a chord centred there – the lap line's fine wiggles averaged out)
  const pathYaw = chordYaw(geo, s, d, wl, slope, sR - fwd * h, sR + fwd * h);
  // curvature where the car is (heading change over ±hk, as map3d's pathKappa), held to what the tyres can do
  const hk = clamp(sp * 0.15, 4, 12);
  geo.at(s - fwd * hk, pathD(geo, s, d, wl, slope, s - fwd * hk), PA); geo.at(s, d, PB); geo.at(s + fwd * hk, pathD(geo, s, d, wl, slope, s + fwd * hk), PC);
  let kappa = wrap(Math.atan2(PC[0] - PB[0], PC[2] - PB[2]) - Math.atan2(PB[0] - PA[0], PB[2] - PA[2])) / hk;
  const lim = sp > 0.5 ? (LAT_G_MAX * 9.81) / (sp * sp) : Infinity; kappa = clamp(kappa, -lim, lim);
  const yawRate = sp * kappa * fwd, aLat = sp * yawRate;
  // slip (replay's): ~1.5° at 5 g; on the power out of a slow corner a little more
  const exitSlide = aLong > 4 && sp < 45 && Math.abs(aLat) > 8 ? Math.min(1, (aLong - 4) / 6) * Math.min(1, (Math.abs(aLat) - 8) / 10) * 0.035 * Math.sign(aLat) : 0;
  const beta = clamp(aLat * SLIP_PER_ALAT, -SLIP_MAX, SLIP_MAX) + exitSlide;
  // the road's slope under the car (±4 m along its way)
  geo.at(s + fwd * 4, d, PA); geo.at(s - fwd * 4, d, PB);
  const grade = -Math.atan2(PA[1] - PB[1], 8);
  out.pathYaw = wrap(pathYaw); out.yaw = wrap(pathYaw + beta); out.beta = beta; out.slide = exitSlide;
  out.kappa = kappa; out.yawRate = yawRate; out.aLat = aLat;
  out.pitch = grade + clamp(-(aLong || 0) * PITCH_PER_A, -0.006, 0.02);   // (−5 g: nose down ~0.9°; under power up a little)
  out.roll = clamp(-aLat * ROLL_PER_ALAT, -ROLL_MAX, ROLL_MAX);           // (5 g: ~0.55° out of the corner)
  // front wheels: the path's curvature over the wheelbase, plus the tyres' slip angle (~0.6° per g), a touch of
  // opposite lock when the rear steps out (as the replay's pathSteer)
  out.steer = sp > 3 ? clamp(Math.atan(wb * kappa) + (0.01 * sp * sp * kappa) / 9.81 - exitSlide * 2, -0.4, 0.4) * fwd : 0;
  return out;
}

// the car's offset from the racing line (e = d − line(s)) and its rate at render time T from the engine's buffered
// snapshots (sorted by t; only those with the car on the lap). e(T): linear between the two around T (as the
// position is); the rate: the mean over the last W ms, (e(T) − e(T − W)) / W – the engine moves the car across at a
// rate that switches on and off from one 50 ms step to the next, which as a heading would snap by degrees; its mean over
// W ramps over W instead. A pure function of the buffer and T.
export function offsetAt(snaps, num, T, lineAt, W = 300, out = {}) {
  out.e = null; out.rate = 0;
  const pts = [];
  for (const b of snaps || []) {
    const c = carIn(b, num); if (!c || c.where !== "lap" || c.s == null) { if (b.t <= T) pts.length = 0; continue; }
    pts.push(b.t, (c.d ?? 0) - lineAt(c.s));
  }
  if (!pts.length) return out;
  const eAt = (t) => {
    if (t <= pts[0]) return pts[1];
    for (let i = 2; i < pts.length; i += 2) if (t <= pts[i]) { const f = (t - pts[i - 2]) / (pts[i] - pts[i - 2] || 1); return pts[i - 1] + (pts[i + 1] - pts[i - 1]) * f; }
    return pts[pts.length - 1];
  };
  out.e = eAt(T);
  const t0 = Math.max(pts[0], T - W);
  if (T - t0 > 1) out.rate = ((out.e - eAt(t0)) / (T - t0)) * 1000;
  return out;
}
const byNum = new WeakMap();
function carIn(snap, num) {
  let m = byNum.get(snap); if (!m) { m = new Map(); for (const c of snap.cars || []) m.set(c.num, c); byNum.set(snap, m); }
  return m.get(num);
}
