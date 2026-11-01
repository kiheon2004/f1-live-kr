// v0.54 §2: the game car's pose from its own path (renderer/game/gamepose.js) – heading along the path the engine drives
// (racing line + offset + lane change), at the rear axle, slip into the corner, lean / steer from the path's curvature,
// a pure function of the state at one moment.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const R = (p) => import(path.join(__dirname, "../../src", p));
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b} (±${tol})`);

// a straight road along +z; d + left = +x (a car facing +z has its left at +x)
const straight = (lineAt = () => 0) => ({ at: (s, d, P) => { P[0] = d; P[1] = 0; P[2] = s; return P; }, lineAt });
// a right-hand circle of radius R (the centre on the car's right): position angle s/R, the left side outwards
const circle = (Rr) => ({ at: (s, d, P) => { const th = s / Rr, r = Rr + d; P[0] = r * Math.cos(th); P[1] = 0; P[2] = r * Math.sin(th); return P; }, lineAt: () => 0 });

test("crossing the road on the racing line: the car points where it goes (v0.53: along the lap line, sliding sideways)", async () => {
  const { lapPose } = await R("renderer/game/gamepose.js");
  // the line moves 0.1 m across per m along (an out → apex move): heading atan(0.1) to the left
  const p = lapPose(straight((s) => 0.1 * s), 100, 10, 0, 60, 0);
  near(p.pathYaw, Math.atan(0.1), 1e-6, "path heading");
  near(p.kappa, 0, 1e-9, "no curvature on a straight crossing");
  near(p.yaw, p.pathYaw, 1e-9, "no slip without cornering");
  // a lane change of 2 m/s at 50 m/s: atan(0.04)
  near(lapPose(straight(), 100, 0, 2, 50, 0).yaw, Math.atan(0.04), 1e-6, "lane change heading");
  // capped: no more than 0.1 across per metre along, whatever the data say
  near(lapPose(straight(), 100, 0, 30, 50, 0).yaw, Math.atan(0.1), 1e-6, "cap");
  // standing still: the line's bend is not followed (a grid slot) – along the road
  near(lapPose(straight((s) => 0.1 * s), 100, 3, 0, 0, 0).yaw, 0, 1e-9, "standing");
});

test("on a bend: heading at the rear axle, slip into the corner, lean out, steer = curvature over the wheelbase", async () => {
  const { lapPose, SLIP_MAX, ROLL_MAX } = await R("renderer/game/gamepose.js");
  const Rr = 60, v = 30, s = 200, p = lapPose(circle(Rr), s, 0, 0, v, 0, { lr: 1.8, wb: 3.6 });
  const tangentAt = (x) => Math.atan2(-Math.sin(x / Rr), Math.cos(x / Rr));
  near(p.pathYaw, tangentAt(s - 1.8), 2e-3, "path heading = the tangent at the rear axle");
  near(p.kappa, -1 / Rr, 2e-4, "curvature (right turn: −)");
  near(p.yawRate, -v / Rr, 5e-3, "yaw rate = v κ");
  assert.ok(p.yaw < p.pathYaw && p.pathYaw - p.yaw <= SLIP_MAX + 1e-9, "slip turns the body into the (right) corner");
  near(p.aLat, -v * v / Rr, 0.2, "lateral acceleration");
  assert.ok(p.roll > 0 && p.roll <= ROLL_MAX, "leans out of a right turn (+ roll, the replay's sign)");
  assert.ok(p.steer < 0 && Math.abs(p.steer - Math.atan(-3.6 / Rr)) < 0.03, "steers right, ≈ atan(wb κ) + a little");
  // the body's own heading vs the middle's travel: the middle runs inside the rear axle's path (κ·lr)
  assert.ok(p.pathYaw > tangentAt(s), "nose a touch outside the middle's tangent (rear-axle kinematics)");
});

test("pure: the same state gives the same pose; braking dips the nose", async () => {
  const { lapPose } = await R("renderer/game/gamepose.js");
  const g = circle(80), a = lapPose(g, 123, 1.5, 0.8, 55, -30), b = lapPose(g, 123, 1.5, 0.8, 55, -30);
  assert.deepStrictEqual(a, b);
  assert.ok(lapPose(straight(), 0, 0, 0, 80, -40).pitch > 0.01, "nose down under braking");
  assert.ok(lapPose(straight(), 0, 0, 0, 80, 8).pitch < 0, "squat under power");
});

test("offset from the racing line and its rate from the snapshots (mean over the last W ms)", async () => {
  const { offsetAt } = await R("renderer/game/gamepose.js");
  const line = (s) => 0.01 * s, snap = (t, s, d) => ({ t, cars: [{ num: "4", where: "lap", s, d }] });
  // e rises 0 → 0.2 m per 50 ms step from t 100 (4 m/s), flat before
  const S = [snap(0, 0, 0), snap(50, 4, 0.04), snap(100, 8, 0.08), snap(150, 12, 0.12 + 0.2), snap(200, 16, 0.16 + 0.4), snap(250, 20, 0.2 + 0.6)];
  const o = offsetAt(S, "4", 225, line, 100);
  near(o.e, 0.5, 1e-9, "e at T (linear between snapshots)");
  near(o.rate, 4, 1e-6, "rate over the last 100 ms");
  near(offsetAt(S, "4", 125, line, 100).rate, 1, 1e-6, "ramping in: 25 ms of 4 m/s in the last 100 ms → 1");
  // a pit stretch breaks the history: only snapshots on the lap after it count
  const P = [snap(0, 0, 0), { t: 50, cars: [{ num: "4", where: "pit", s: null, d: 0 }] }, snap(100, 8, 0.5), snap(150, 12, 0.6)];
  const q = offsetAt(P, "4", 150, () => 0, 300);
  near(q.rate, 2, 1e-6, "from the lap snapshots after the pit stretch only");
  assert.strictEqual(offsetAt([], "4", 0, line).e, null);
});
