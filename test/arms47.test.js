// v0.47 (request §2): the lowered arm's swing across the chest (armswap.js) for a moment of the session must be a function
// of the session's steering history only – the same arms for continuous play at any frame rate, any replay speed, a
// pause, the car out of close-up for a while (LOD / visibility / camera) and a direct seek to that moment. On c37334f
// the swing was a per-frame state (stepSwap: the goal and q carried from the previous frame, q advanced by
// max(dt / SWAP.ms, |Δdeg| / SPAN)): 60° then back to 46° gave q 1, a seek straight to 46° gave q 0, and a 49° → 55°
// ramp over 100 ms ended at a different q at 60 and 120 Hz. These tests fail there.
const test = require("node:test");
const assert = require("node:assert");

const D = Math.PI / 180;
async function rig(season = 2025, team = "Mercedes") {
  const C = await import("../src/renderer/car3d.js"), S = await import("../src/renderer/armswap.js"), A = await import("../src/renderer/arms.js");
  const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), u = car.userData;
  // deg(ms): the wheel's angle over the session (deg, + = its left grip up – arms[0] is lowered by −, arms[1] by +);
  // hist: the same as the steering wheel's turn (rad, car3d's u.wheel.rotation.z) – what map3d hands setWheels
  const histOf = (deg) => (ms) => deg(ms) * D;
  const at = (deg, t, hist = histOf(deg)) => C.setWheels(car, 0, -(deg(t) * D) / C.STEER_RATIO, t, 13, hist);
  const pose = () => u.arms.map((a) => [...a.pose.S, ...a.pose.E, ...a.pose.W].map((v) => +v.toFixed(9)).join()).join("|");
  // (q: what placeArms drew with – a.q; c37334f kept it only in the per-frame state, a.swap.q before its easing)
  const qs = () => u.arms.map((a) => (a.q !== undefined ? a.q : A.swapEase(a.swap.q)));
  return { C, S, A, car, u, at, pose, qs, histOf };
}
// a piecewise-linear steering trace: [[ms, deg], …], held before the first and after the last point
const trace = (pts) => (ms) => {
  if (ms <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (ms <= pts[i][0]) { const [t0, d0] = pts[i - 1], [t1, d1] = pts[i]; return d0 + ((d1 - d0) * (ms - t0)) / (t1 - t0); }
  return pts[pts.length - 1][1];
};
// frames from t0 to t1 every `dt` ms of the session, plus the moments asked for (so every schedule shows them)
const frames = (t0, t1, dt, want = []) => [...new Set([...Array.from({ length: Math.floor((t1 - t0) / dt) + 1 }, (_, i) => t0 + i * dt), ...want])].sort((a, b) => a - b);

test("arms v0.47: 60° and back to 46° – continuous play and a direct seek to the same moment give the same arms, both crossed (the history went past SWAP.on and never back inside SWAP.off)", async () => {
  const R = await rig();
  for (const sign of [-1, 1]) {
    const deg = trace([[1000, 0], [1600, 60 * sign], [2500, 60 * sign], [2800, 46 * sign], [9000, 46 * sign]]);
    const T = 4000; let cont = null, contQ = null;
    for (const t of frames(0, T, 1000 / 60, [T])) { R.at(deg, t); if (t === T) { cont = R.pose(); contQ = R.qs(); } }
    // a fresh car: no frame before the seek
    const F = await rig(); F.at(deg, T);
    assert.strictEqual(F.pose(), cont, `wheel ${46 * sign}° after ${60 * sign}°: the seek's arms (q ${F.qs()}) differ from continuous play's (q ${contQ})`);
    const low = sign < 0 ? 0 : 1;
    assert.ok(Math.abs(F.qs()[low] - 1) < 1e-9 && F.qs()[1 - low] === 0, `the lowered arm crossed after a seek to ${46 * sign}° (q ${F.qs()})`);
    // and the same car, seeking back and forth to the same moment
    R.at(deg, 500); R.at(deg, T); assert.strictEqual(R.pose(), cont, "a seek back and forward again: the same arms");
    // without that history (straight to 46°, never past 50°): beside the body
    const G = await rig(); G.at(trace([[0, 46 * sign]]), T); assert.deepStrictEqual(G.qs(), [0, 0], "46° held from the start: not crossed");
  }
});

test("arms v0.47: a 49° → 55° ramp over 100 ms evaluated at 30 / 60 / 120 / 144 Hz – the same q at the same moments of the session, and the same as a direct seek", async () => {
  for (const sign of [-1, 1]) {
    const deg = trace([[0, 0], [1000, 49 * sign], [2000, 49 * sign], [2100, 55 * sign], [9000, 55 * sign]]);
    // the moments every rate's frames hit (multiples of 1/6 s from 1 s), and some others put in each schedule
    const want = [...Array.from({ length: 10 }, (_, k) => 1000 + (k * 1000) / 6), 2020, 2050, 2075, 2100, 2150, 2250, 2400, 2600];
    const runs = {};
    for (const hz of [30, 60, 120, 144]) {
      const R = await rig(), out = {};
      for (const t of frames(0, 2700, 1000 / hz, want)) { R.at(deg, t); if (want.includes(t)) out[t] = R.qs(); }
      runs[hz] = out;
    }
    const S = await rig();
    for (const t of want) {
      S.at(deg, t); const seek = S.qs();
      for (const hz of [30, 60, 120, 144]) for (const k of [0, 1]) assert.ok(Math.abs(runs[hz][t][k] - seek[k]) < 1e-9, `${sign > 0 ? "+" : "−"} ${(t - 2000).toFixed(1)} ms after the ramp's start, arm ${k}: q ${runs[hz][t][k]} at ${hz} Hz, ${seek[k]} on a seek`);
    }
    // the swing starts when the wheel passes SWAP.on (2000 + 100 · 1/6 ms) and is done within SWAP.ms of it
    const low = sign < 0 ? 0 : 1, t50 = 2000 + 100 / 6;
    assert.strictEqual(runs[60][2000][low], 0, "before the crossing: beside the body");
    assert.ok(runs[60][2050][low] > 0 && runs[60][2050][low] < 1, `in the swing at 2050 ms (q ${runs[60][2050][low]})`);
    assert.ok(runs[60][2600][low] === 1 && 2600 - t50 >= 0, "crossed by 2600 ms");
  }
});

test("arms v0.47: a pause, 2× and 4× replay, the car out of close-up for a while (frames not drawn) – the same arms at the same moments as continuous 60 Hz play", async () => {
  const deg = trace([[0, 0], [1000, 0], [1400, -70], [2600, -70], [2900, -30], [3600, -30], [3800, 65], [4600, 65], [5000, 0]]);
  // moments in and around the swings (1.21 s across, 2.84 s back, 3.7 s the other arm)
  const want = [1250, 1300, 1350, 1450, 1600, 2700, 2800, 2850, 2950, 3100, 3750, 3800, 3900, 4100, 4800, 5200];
  const play = async (schedule, hide = () => false) => {
    const R = await rig(), out = {};
    for (const t of schedule) {
      R.C.setDetail(R.car, hide(t) ? "mid" : "near");   // (setWheels places the arms only while the cockpit is drawn)
      R.at(deg, t); if (want.includes(t) && !hide(t)) out[t] = R.pose();
    }
    return out;
  };
  const ref = await play(frames(0, 5300, 1000 / 60, want));
  const check = (got, what) => { for (const t of Object.keys(got)) assert.strictEqual(got[t], ref[t], `${what}: the arms at ${t} ms differ from continuous play's`); };
  // a pause in the middle of the swing across (the session's time standing at 1300 ms for 50 frames), then on
  const paused = frames(0, 5300, 1000 / 60, want); const i = paused.indexOf(1300); paused.splice(i, 0, ...Array(50).fill(1300));
  check(await play(paused), "paused at 1300 ms");
  check(await play(frames(0, 5300, 2000 / 60, want)), "2× replay");
  check(await play(frames(0, 5300, 4000 / 60, want)), "4× replay");
  // out of close-up (LOD mid: the cockpit not drawn) across each swing's start – 1.15–1.32 s, 2.7–2.83 s, 3.6–3.78 s
  const away = (t) => (t > 1150 && t < 1320) || (t > 2700 && t < 2830) || (t > 3600 && t < 3780);
  const got = await play(frames(0, 5300, 1000 / 60, want), away);
  assert.ok(Object.keys(got).length >= 12, "the moments checked"); check(got, "out of close-up for a while");
  // and out of close-up for longer than a second (v0.46: the steady pose after JUMP_MS)
  check(await play(frames(0, 5300, 1000 / 60, want), (t) => t > 1100 && t < 2840), "out of close-up 1.1–2.84 s");
});

test("arms v0.47: armswap swapAt – a pure function of the steering history: hysteresis (past SWAP.on across, back inside SWAP.off), the swing timed from the crossing, gaps in the history, a grid of fixed steps", async () => {
  const { swapAt, STEP } = await import("../src/renderer/armswap.js"), { SWAP, swapEase } = await import("../src/renderer/arms.js");
  // (deg here is the arm's own: − lowers its hand)
  const hold = (d) => () => d;
  assert.strictEqual(swapAt(hold(-46), 10000), 0, "46° held: beside the body");
  assert.strictEqual(swapAt(hold(-60), 10000), 1, "60° held: across");
  const back = trace([[1000, 0], [1600, -60], [2500, -60], [2800, -46]]);
  assert.strictEqual(swapAt(back, 5000), 1, "60° then 46°: still across (inside SWAP.off it would swing back)");
  assert.strictEqual(swapAt(trace([[1000, 0], [1600, -60], [2500, -60], [2800, -40]]), 5000), 0, "60° then 40°: back beside the body");
  // the swing's progress from the moment it passes SWAP.on, at SWAP.ms of the session's time (a slow ramp: the wheel's
  // own travel, SPAN° for the whole swing, is the slower measure here)
  const ramp = trace([[0, 0], [10000, -100]]), tOn = (SWAP.on / 100) * 10000;
  assert.strictEqual(swapAt(ramp, tOn - 1), 0, "just before SWAP.on");
  for (const dt of [50, 100, 200, 300]) { const q = swapAt(ramp, tOn + dt); assert.ok(Math.abs(q - swapEase(dt / SWAP.ms)) < 0.02, `${dt} ms after the crossing: q ${q.toFixed(4)} vs ${swapEase(dt / SWAP.ms).toFixed(4)}`); }
  assert.strictEqual(swapAt(ramp, tOn + SWAP.ms + STEP), 1, "done SWAP.ms after it");
  // a gap in the history (null: the car's steering not known then): the swing starts over from the steady pose for the
  // angle after it – 60° then a gap then 46°: beside the body (nothing known says it crossed)
  const gap = (ms) => (ms > 3000 && ms < 3500 ? null : back(ms));
  assert.strictEqual(swapAt(gap, 5000), 0, "a gap in the history: the steady pose for the angle after it");
  assert.strictEqual(swapAt((ms) => (ms > 3000 && ms < 3500 ? null : -60), 5000), 1, "60° after the gap: across");
  // the same moment, any number of times, any order: the same q
  const a = [5000, 2600, 1650, 5000, 1700].map((t) => swapAt(back, t)), b = [1700, 5000, 1650, 2600, 5000].map((t) => swapAt(back, t));
  assert.deepStrictEqual([a[0], a[1], a[2], a[4]], [b[1], b[3], b[2], b[0]]);
});

test("arms v0.47: armswap gridMemo – the steering history's samples kept by their step of the session (computed once), cleared with a new key", async () => {
  const { gridMemo, STEP } = await import("../src/renderer/armswap.js");
  let calls = 0; const f = (ms) => { calls++; return ms > 50000 ? null : ms / 1000; };
  const m = gridMemo(f, 64);
  assert.strictEqual(m(10 * STEP), (10 * STEP) / 1000); assert.strictEqual(m(10 * STEP), (10 * STEP) / 1000); assert.strictEqual(calls, 1, "kept");
  assert.strictEqual(m(60000), null); assert.strictEqual(m(60000), null); assert.strictEqual(calls, 2, "an unknown sample kept as unknown");
  assert.strictEqual(m(10 * STEP + 3), (10 * STEP + 3) / 1000, "between the steps: computed, not kept"); m(10 * STEP + 3); assert.strictEqual(calls, 4);
  m(74 * STEP); assert.strictEqual(m(10 * STEP), (10 * STEP) / 1000); assert.strictEqual(calls, 6, "a ring: the slot taken by a later step");
  m.key("a"); m(20 * STEP); m.key("a"); m(20 * STEP); assert.strictEqual(calls, 7, "the same key: kept"); m.key("b"); m(20 * STEP); assert.strictEqual(calls, 8, "a new key: cleared");
});

// The app's path (v0.47: the swing from the history) through v0.46's hairpin sweep – the same mesh checks and limits as
// arms46.test.js's (both hands on their grips, the wrists in range, the torso, the pads and the other arm), so the new
// timing of the swing keeps what v0.46 measured. No geometry or plan changed (arms.js, the baked plans untouched).
test("arms v0.47: through the hairpin to the 140° lock and back with the swing read from the history – v0.46's checks: hands on the grips, wrists in range, torso / pads / the other arm within v0.46's limits", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js"), K = await import("../src/renderer/cockpitcheck.js"), A = await import("../src/renderer/arms.js"), { BODY } = await import("../src/renderer/body3d.js");
  const WRIST_DAILY = { flex: [-60, 54], rad: [-40, 17], pron: 80 }, WRIST_ACTIVE = { flex: [-72, 66], rad: [-42, 20], pron: [-87, 82] };
  const TORSO_LOCK = 0.010, TORSO_SWING = 0.080, SWING_PADS = 0.025, ARMS_MM = 0.004;
  const wristOk = (m, deg, swing) => (Math.abs(deg) <= 55 && !swing ? m.flex > WRIST_DAILY.flex[0] && m.flex < WRIST_DAILY.flex[1] && m.rad > WRIST_DAILY.rad[0] && m.rad < WRIST_DAILY.rad[1] && Math.abs(m.pron) < WRIST_DAILY.pron
    : m.flex > WRIST_ACTIVE.flex[0] && m.flex < WRIST_ACTIVE.flex[1] && m.rad > WRIST_ACTIVE.rad[0] && m.rad < WRIST_ACTIVE.rad[1] && m.pron > WRIST_ACTIVE.pron[0] && m.pron < WRIST_ACTIVE.pron[1]);
  const sweep = (s) => (t) => s * (t < 300 ? 0 : t < 1800 ? 140 * (t - 300) / 1500 : t < 3300 ? 140 : t < 4800 ? 140 - 140 * (t - 3300) / 1500 : 0);
  const all = []; let failed = false;
  for (const [season, team, side] of [[2025, "Mercedes", -1], [2025, "Mercedes", 1], [2026, "Ferrari", -1], [2022, "Red Bull Racing", -1]]) {
    const R = await rig(season, team), car = R.car, u = R.u, solids = K.cockpitSolids(car, ["chassis", "rim", "headrest"]), torso = K.cockpitSolids(car, ["torso"]), bad = [];
    const V = () => new THREE.Vector3(), wp = (o) => o.getWorldPosition(V());
    const arm = (a) => {
      const k = a.k, [b0, b1, , b3] = a.bones, S = wp(b0), E = wp(b1), W = wp(b3), G = u.armPlan.geo, m = new THREE.Matrix3().setFromMatrix4(a.hand.matrixWorld);
      const ax = (v) => new THREE.Vector3(v[0] * k, v[1], v[2]).applyMatrix3(m).normalize(), L = (v) => [v.x * k, v.y, v.z];
      const hx = ax(G.hand[0]), hy = ax(G.hand[1]), hz = ax(G.hand[2]), f = W.clone().sub(E).normalize(), up = E.clone().sub(S).normalize(), bend = A.wristBend(L(f), L(hx), L(hy), L(hz));
      const H = L(new THREE.Vector3().crossVectors(up, f).normalize().multiplyScalar(k)), pron = ((A.twistOf(H, L(f), L(hx)) - 90 + 540) % 360) - 180;
      const gw = new THREE.Vector3(G.wrist[0] - G.grip.c[0], G.wrist[1] - G.grip.c[1], G.wrist[2] - G.grip.c[2]); gw.x *= k; gw.applyMatrix4(a.hand.matrixWorld);
      const pv = a.hand.position, gc = G.grip.c;
      return { S, E, W, flex: bend.flex, rad: bend.rad, pron, gw, onGrip: Math.hypot(pv.x - k * gc[0], pv.y - gc[1], pv.z - gc[2]) };
    };
    const torsoMm = () => Object.entries(K.cockpitClash(car, torso, 1, { nearest: true, dense: 0.006 })).filter(([k]) => / in /.test(k)).reduce((m, [, v]) => Math.max(m, v), 0);
    let maxDeg = 0, worstT = 0, worstA = 0, worstS = 0, swung = 0;
    for (let t = 0; t <= 5400; t += 1000 / 60) {
      R.at(sweep(side), t); car.updateMatrixWorld(true); const deg = u.wheel.rotation.z / D; maxDeg = Math.max(maxDeg, Math.abs(deg));
      for (const a of u.arms) {
        const m = arm(a);
        if (a.pose.free || m.onGrip > 1e-6 || m.gw.distanceTo(m.W) > 1e-4) bad.push(`${t.toFixed(0)} ms ${deg.toFixed(0)}° arm ${a.k}: the hand off its grip`);
        if (Math.abs(m.S.distanceTo(m.E) - BODY.uarm) > 1e-4 || Math.abs(m.E.distanceTo(m.W) - BODY.farm) > 1e-4) bad.push(`${t.toFixed(0)} ms: a bone's length`);
        if (!wristOk(m, deg, a.pose.swing)) bad.push(`${t.toFixed(0)} ms ${deg.toFixed(0)}° arm ${a.k}: wrist ${m.flex.toFixed(0)} / ${m.rad.toFixed(0)} / forearm ${m.pron.toFixed(0)}`);
      }
      const swinging = u.arms.some((a) => a.pose.swing); if (swinging) swung++;
      if (Math.round(t) % 200 < 17 || swinging) {
        const tm = torsoMm(), lim = Math.abs(deg) <= 55 && !swinging ? 0.006 : swinging ? TORSO_SWING : TORSO_LOCK;
        worstT = Math.max(worstT, tm); if (swinging) worstS = Math.max(worstS, tm); if (tm > lim) bad.push(`${t.toFixed(0)} ms ${deg.toFixed(0)}°${swinging ? " (swing)" : ""}: ${(tm * 1000).toFixed(1)} mm into the torso`);
        for (const [k, d] of Object.entries(K.cockpitClash(car, solids, 2, { nearest: true }))) if (/ in /.test(k) && d > (/^(sleeve|gauntlet)/.test(k) ? (swinging && /headrest/.test(k) ? SWING_PADS : 0.01) : 0.002)) bad.push(`${t.toFixed(0)} ms ${deg.toFixed(0)}°: ${k} ${(d * 1000).toFixed(1)} mm`);
        const am = K.armsOverlap(car); worstA = Math.max(worstA, am.depth); if (am.depth > ARMS_MM) bad.push(`${t.toFixed(0)} ms ${deg.toFixed(0)}°: the arms ${(am.depth * 1000).toFixed(1)} mm into each other (${am.what})`);
      }
    }
    if (!(maxDeg > 139.9)) bad.unshift(`the wheel reached only ${maxDeg.toFixed(1)}°`);
    if (!swung) bad.unshift("no swing seen");
    all.push(`${season} ${team} side ${side}: torso worst ${(worstT * 1000).toFixed(1)} mm (swing ${(worstS * 1000).toFixed(1)}, ${swung} frames in the swing), arms ${(worstA * 1000).toFixed(1)} mm, ${bad.length} faults`, ...bad.slice(0, 12));
    if (bad.length) failed = true;
  }
  console.log(all.join("\n"));
  assert.ok(!failed, all.join("\n"));
});
