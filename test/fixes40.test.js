// v0.40 review fixes, each reproduced first: the two-bone reach losing its bones' lengths (a pole along the line, the
// target on the root, a target inside the folded reach reported as reached); passed corners holding the "next corners"
// places; the wheels' angle jumping where the car's path changes (track ↔ pit lane, estimated ↔ measured).
const test = require("node:test");
const assert = require("node:assert");
const B = () => import("../src/renderer/body3d.js");
const K = () => import("../src/renderer/corners.js");
const W = () => import("../src/renderer/wheelspin.js");
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const TAU = Math.PI * 2, angDiff = (a, b) => Math.abs((((a - b) % TAU) + TAU * 1.5) % TAU - TAU / 2);

test("reach2: both bones keep their lengths for any target and pole; the residual is the end's true distance from the target", async () => {
  const { reach2 } = await B();
  const L1 = 0.33, L2 = 0.26, S = [0.1, 1.2, -0.3];
  const cases = [
    { T: [0, 0, 0.4], pole: [0, 0, 1], why: "pole along the line (the v0.39 report: 0.252 + 0.148)" },
    { T: [0, 0, 0.4], pole: [0, 0, -1], why: "pole against the line" },
    { T: [1e-9, 0, 0.4], pole: [0, 0, 1], why: "nearly parallel (float noise)" },
    { T: [0, 1e-7, -0.4], pole: [0, 0, 1], why: "nearly anti-parallel" },
    { T: [0, 0, 0], pole: [0, 0, 1], why: "target on the root" },
    { T: [0, 0, 0], pole: [0, 1, 0], why: "target on the root, pole up" },
    { T: [0.02, 0, 0], pole: [0, 1, 0], why: "inside the folded reach" },
    { T: [1, 0, 0], pole: [0, 1, 0], why: "beyond the reach" },
    { T: [0.3, 0.2, 0], pole: [0, 0, 1], why: "reachable" },
    { T: [0.3, -0.25, 0.1], pole: [0.35, -1, 0], why: "reachable, an arm's pole" },
  ];
  for (const { T: t, pole, why } of cases) {
    const T = [S[0] + t[0], S[1] + t[1], S[2] + t[2]], m = [0, 0, 0], e = [0, 0, 0];
    const r = reach2(S, T, L1, L2, pole, m, e);
    assert.ok(Math.abs(dist(S, m) - L1) < 1e-9, `${why}: upper bone ${dist(S, m).toFixed(4)}`);
    assert.ok(Math.abs(dist(m, e) - L2) < 1e-9, `${why}: lower bone ${dist(m, e).toFixed(4)}`);
    assert.ok(Math.abs(r - dist(e, T)) < 1e-9, `${why}: residual ${r} vs ${dist(e, T)}`);
    const d0 = dist(S, T), want = d0 > L1 + L2 ? d0 - (L1 + L2) : d0 < L1 - L2 ? L1 - L2 - d0 : 0;
    assert.ok(Math.abs(r - want) < 1e-9, `${why}: residual ${r} should be ${want}`);
    for (const v of [...m, ...e]) assert.ok(Number.isFinite(v), why);
  }
});

test("reach2: the elbow (knee) never flips – it moves continuously as the target passes the pole's line, and a hint keeps its side", async () => {
  const { reach2 } = await B();
  const S = [0, 0, 0], m = [0, 0, 0], e = [0, 0, 0];
  let prev = null, worst = 0;
  // a target swept through the pole's direction (z) from one side to the other, in fine steps
  for (let x = -0.05; x <= 0.05 + 1e-12; x += 0.0005) {
    reach2(S, [x, 0, 0.45], 0.33, 0.26, [0, 0, 1], m, e);
    if (prev) worst = Math.max(worst, dist(prev, m));
    prev = [...m];
  }
  assert.ok(worst < 0.01, `the joint jumped ${worst.toFixed(4)} m between targets 0.5 mm apart`);
  // the same input twice: the same joint (deterministic, no hidden state)
  const a = [0, 0, 0], b = [0, 0, 0];
  reach2(S, [0, 0, 0.45], 0.33, 0.26, [0, 0, 1], a, e); reach2(S, [0, 0, 0.45], 0.33, 0.26, [0, 0, 1], b, e);
  assert.deepStrictEqual(a, b);
  // with a hint (last frame's joint) on the −y side, a degenerate pole keeps it there
  reach2(S, [0, 0, 0.45], 0.33, 0.26, [0, 0, 1], a, e, [0, -0.2, 0.1]);
  assert.ok(a[1] < -0.1, `hinted side kept (${a[1].toFixed(3)})`);
});

test("reach2 in the crews' work: every hand on its grip through a whole tyre change stays within 3 cm (the bones unchanged)", async () => {
  const { stopChoreo, crewAt, skeleton } = await import("../src/renderer/crew.js");
  const d = { FZ: 1.7, RZ: -1.7, FR: 0.353, RR: 0.355, FW: 0.28, RW: 0.375, FX: 0.81, RX: 0.7625, W: 1.9 };
  for (let s = 0; s <= 2.6; s += 0.05) {
    const { figures } = stopChoreo({ wait: 0, D: 2.4 }, s, d, 1);
    const people = crewAt({ x: 0, y: 0, z: 0, yaw: 0 }, figures, "#fff");
    for (const f of people) if (f.hands) {
      const j = skeleton(f.pose, null, f.hands).joints;
      f.hands.forEach((h, i) => { if (h && (h[3] ?? 1) >= 0.999) assert.ok(j.short[i] < 0.03, `s ${s.toFixed(2)}: hand ${i} ${j.short[i].toFixed(3)} m off its grip`); });
    }
  }
});

test("corner numbers: corners already passed (faded out or fading) never take the places of the next ones ahead", async () => {
  const { cornerTargets, CORNERS } = await K();
  // the review's case: the car at s 1000 of 5000, corners at 965 and 980 (passed) and 1100 (100 m ahead), 1st person
  const st = [{ n: 1, s: 965, x: 0, z: 0 }, { n: 2, s: 980, x: 0, z: 0 }, { n: 3, s: 1100, x: 0, z: 0 }];
  let T = cornerTargets(st, { mode: "near", cam: "eye", carS: 1000, L: 5000 });
  assert.strictEqual(T.get(3), 1, "the corner 100 m ahead is shown");
  assert.strictEqual(T.get(1), 0); assert.strictEqual(T.get(2), 0);
  // a tight chicane: one just passed (fading), two ahead – both ahead shown, the passed one fading on top
  const ch = [{ n: 4, s: 1995, x: 0, z: 0 }, { n: 5, s: 2010, x: 0, z: 0 }, { n: 6, s: 2030, x: 0, z: 0 }, { n: 7, s: 2200, x: 0, z: 0 }];
  T = cornerTargets(ch, { mode: "near", cam: "chase", carS: 2000, L: 5000 });
  assert.ok(T.get(4) > 0 && T.get(4) < 1, "just passed: fading");
  assert.strictEqual(T.get(5), 1); assert.strictEqual(T.get(6), 1);
  assert.strictEqual(T.get(7), 0, "only CORNERS.next ahead");
  assert.strictEqual([...T.values()].filter((a, i) => a > 0 && ch[i].s > 2000).length, CORNERS.next);
  // over the lap's line: corners at the end of the lap passed, T1 ahead after the line
  const lap = [{ n: 1, s: 80, x: 0, z: 0 }, { n: 15, s: 4960, x: 0, z: 0 }, { n: 16, s: 4985, x: 0, z: 0 }];
  T = cornerTargets(lap, { mode: "near", cam: "onboard", carS: 5000 + 10, L: 5000 });
  assert.strictEqual(T.get(1), 1, "T1 70 m after the line"); assert.strictEqual(T.get(15), 0);
  // a new car followed (another place on the lap): the old car's corners' alphas in prev don't hold places
  T = cornerTargets(st, { mode: "near", cam: "eye", carS: 1050, L: 5000, prev: new Map([[1, 1], [2, 1]]) });
  assert.strictEqual(T.get(1), 0); assert.strictEqual(T.get(2), 0); assert.strictEqual(T.get(3), 1);
});

// a car's telemetry: 4 Hz, speed v(t) km/h
function telemetry(t0, t1, v, step = 250) { const c = { t: [], v: [] }; for (let t = t0; t <= t1; t += step) { c.t.push(t); c.v.push(v(t)); } return c; }

test("wheels by the telemetry's odometer: continuous where the path changes, the same angle for the same session time whatever was shown before", async () => {
  const { odometerAt, wrapAngle } = await W();
  // 100 s: 250 km/h, braking into the pit lane at 80 km/h (t 40–70 s), stopping 2.4 s in the box (t 55), out again
  const v = (t) => t < 38000 ? 250 : t < 40000 ? 250 - (170 * (t - 38000)) / 2000 : t < 54000 ? 80 : t < 55000 ? 80 * (55000 - t) / 1000 : t < 57400 ? 0 : t < 70000 ? 80 : 250;
  const car = telemetry(0, 100000, v), r = 0.353;
  const ang = (t) => wrapAngle(odometerAt(car, t) / r);
  // frame by frame at 60 Hz × the playback rate: the angle never turns more than the speed allows in one frame
  for (const rate of [0.5, 1, 2, 4]) {
    let prev = null, prevT = null;
    for (let t = 1000; t < 99000; t += (1000 / 60) * rate) {
      const a = ang(t);
      if (prev != null) { const vmax = Math.max(v(prevT - 250), v(prevT), v(t), v(t + 250)) / 3.6, allowed = (vmax * (t - prevT)) / 1000 / r + 1e-6; assert.ok(angDiff(a, prev) <= allowed, `rate ${rate}, t ${t.toFixed(0)}: turned ${angDiff(a, prev).toFixed(3)} > ${allowed.toFixed(3)}`); }
      prev = a; prevT = t;
    }
  }
  // paused: the same time, the same angle; a seek in any order: the same angle as played through
  const ref = [5000, 39000, 54500, 56000, 69999, 70001, 95000].map(ang);
  const shuffled = [95000, 5000, 70001, 54500, 39000, 69999, 56000].map((t) => [t, ang(t)]);
  for (const [t, a] of shuffled) assert.strictEqual(a, ref[[5000, 39000, 54500, 56000, 69999, 70001, 95000].indexOf(t)]);
  // standing in the box: no turning
  assert.strictEqual(ang(55500), ang(57000));
  // front and rear: their own radius (2026: 0.353 / 0.355 m) – each a steady function of the same distance
  assert.ok(angDiff(wrapAngle(odometerAt(car, 60000) / 0.355), ang(60000)) > 0);
});

test("wheels' odometer: nothing added while the car stands by its positions (the jacks up), or across a gap in the telemetry", async () => {
  const { odometer, odometerAt, stillFromTrack, ODO } = await W();
  // the wheel-speed figure jumping to 40 km/h while the car stands (positions unchanged) at t 10–13 s
  const car = telemetry(0, 20000, (t) => (t >= 10000 && t <= 13000 ? 40 : 0));
  const trk = { t: [], x: [], y: [], n: 0 }; for (let t = 0; t <= 20000; t += 250) { trk.t.push(t); trk.x.push(1000); trk.y.push(500); trk.n++; }
  odometer(car, stillFromTrack(trk));
  assert.strictEqual(odometerAt(car, 20000), 0, "standing: the wheels don't turn");
  // without positions near (a gap in them): the telemetry is trusted
  const car2 = telemetry(0, 20000, (t) => (t >= 10000 && t <= 13000 ? 40 : 0));
  odometer(car2, stillFromTrack({ t: [0], x: [0], y: [0], n: 1 }));
  assert.ok(odometerAt(car2, 20000) > 30, "no positions: rolled by the speed");
  // a 10 s hole in the telemetry: nothing integrated over it, no angle inside it (the path rules apply)
  const c3 = { t: [0, 250, 500, 10500, 10750], v: [100, 100, 100, 100, 100] };
  const d = odometerAt(c3, 10750);
  assert.ok(Math.abs(d - (100 / 3.6) * 0.75) < 1e-9, `only the covered 0.75 s counted (${d})`);
  assert.strictEqual(odometerAt(c3, 500 + ODO.gap + 1), null);
});

test("wheels' odometer on a live feed: extended as samples arrive and cut with them – the values already given never change", async () => {
  const { odometerAt } = await W();
  const car = { t: [], v: [] }, seen = [];
  for (let t = 0; t < 400000; t += 250) {
    car.t.push(t); car.v.push(200);
    if (t % 5000 === 0) seen.push([t, odometerAt(car, t)]);
    // (replay.js live: over 1400 samples, the first 200 cut from every channel and the odometer)
    if (car.t.length > 1400) { car.t.splice(0, 200); car.v.splice(0, 200); if (car.odo) { if (car.odo.n > 200 && Array.isArray(car.odo.d)) { car.odo.d.splice(0, 200); car.odo.n -= 200; } else car.odo = null; } }
  }
  for (const [t, d] of seen.slice(-20)) assert.ok(Math.abs(odometerAt(car, t) - d) < 1e-6, `t ${t}: ${odometerAt(car, t)} vs ${d}`);
  assert.ok(Math.abs(odometerAt(car, 399750) - (200 / 3.6) * 399.75) < 1e-6);
});
