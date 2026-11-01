// v0.53 motion pipeline: held positions in the feed (replay.js dropHeld / CarTracks.dropHeldTail), which positions are
// the pit lane's (lanemember.js), and the steadied tracks easing onto raw positions at a stretch's ends (smooth.js).
const test = require("node:test");
const assert = require("node:assert");
const RK = require("../src/renderer/replay.js");

// a car on a straight along x at v m/s, positions every 250 ms (decimetres), telemetry every 250 ms (km/h)
function drive({ secs = 20, v = 40, hold = null, telHold = false, stand = null }) {
  const N = Math.round(secs * 4), t = new Float64Array(N), x = new Float32Array(N), y = new Float32Array(N), z = new Float32Array(N);
  const tel = { t: [], v: [] };
  let pos = 0;
  for (let k = 0; k < N; k++) {
    t[k] = 1000 + k * 250;
    const s = (t[k] - 1000) / 1000;
    const standing = stand && s >= stand[0] && s < stand[1];
    if (!standing) pos += v * 0.25;
    const held = hold && s > hold[0] && s < hold[1];
    x[k] = held ? x[k - 1] : Math.round(pos * 10); y[k] = held ? y[k - 1] : 0; z[k] = 100 + k;
    tel.t.push(t[k]); tel.v.push(standing ? (stand[2] ?? 0) : telHold && held ? tel.v[k - 1] : v * 3.6);
  }
  return { c: { t, x, y, z, n: N }, tel };
}

test("held positions: a run of the same X/Y while the car drives on is dropped (2026 Hungary pattern)", () => {
  const { c, tel } = drive({ hold: [5, 8] });
  const r = RK.dropHeld(c, tel);
  assert.ok(r.dropped >= 10 && r.runs === 1, `dropped ${r.dropped} in ${r.runs} runs`);
  // what is left moves on at every sample – no standstill, no leap bigger than the gap's driving
  const o = r.track;
  for (let k = 1; k < o.n; k++) assert.ok(o.x[k] > o.x[k - 1], "never standing");
});

test("held positions: X/Y and telemetry frozen, then a leap no car makes – the stale samples before it go too (2025 Hungary, Norris)", () => {
  const { c, tel } = drive({ secs: 30, v: 40, hold: [5, 19], telHold: true });
  // three stale samples on from the frozen point at a plausible speed, then the real position (the leap)
  const k0 = c.t.findIndex((t) => t >= 1000 + 19000);
  for (let q = 0; q < 3; q++) c.x[k0 + q] = c.x[k0 - 1] + (q + 1) * 100;
  const r = RK.dropHeld(c, tel);
  const o = r.track, kept = Array.from(o.t).filter((t) => t > 1000 + 5000 && t < 1000 + 19000 + 1000);
  assert.ok(kept.length <= 1, `kept ${kept.length} samples in the frozen stretch`);
});

test("held positions: a box stop (wheel speed jumping on the jacks) and a parked car are standstills – kept", () => {
  const box = drive({ secs: 20, v: 22, stand: [6, 9, 60] });   // 3 s standing, the telemetry says 60 km/h meanwhile
  assert.strictEqual(RK.dropHeld(box.c, box.tel).dropped, 0, "box stop kept");
  const park = drive({ secs: 60, v: 20, stand: [2, 58, 1] });   // parked, the wheel speed twitching at 1 km/h
  assert.strictEqual(RK.dropHeld(park.c, park.tel).dropped, 0, "parked car kept");
});

test("held positions live: the repeats are taken out once the next real sample comes", () => {
  const { c, tel } = drive({ hold: [5, 8] });
  const tr = new RK.CarTracks();
  let dropped = 0;
  for (let k = 0; k < c.n; k++) { tr.push("1", c.t[k], [c.x[k], c.y[k], c.z[k]]); dropped += tr.dropHeldTail("1", tel); }
  assert.strictEqual(dropped, RK.dropHeld(c, tel).dropped, "the same samples as the replay's");
});

test("levels: the height only tells roads apart where the lap line crosses itself (lanemember.js crossings)", async () => {
  const { crossings, offLevel } = await import("../src/renderer/lanemember.js");
  // a figure-of-eight: two loops of 300 m radius meeting at the origin, one end 8 m up (a bridge over the other)
  const S = [], n = 800;
  for (let i = 0; i < n; i++) { const a = (i / n) * 4 * Math.PI, loop = i < n / 2 ? 1 : -1, x = loop * 300 * (1 - Math.cos(a)), z = 300 * Math.sin(a); S.push({ i, p: { x, y: i > n * 0.4 && i < n * 0.6 ? 8 : 0, z } }); }
  const m = crossings({ samples: S });
  assert.ok(m[0] === 1 || m[n - 1] === 1 || m[n / 2] === 1, "the crossing found");
  assert.strictEqual(m[n / 4], 0, "away from it: none");
  assert.strictEqual(offLevel({ samples: S }, S[n / 4], 20), false, "a height 20 m off away from a crossing is not another road");
});

test("pit lane membership: on the measured path but on the track's tarmac is the track's (Hungary's pit exit)", async () => {
  const { pitLaneTest, onTarmac } = await import("../src/renderer/lanemember.js");
  // the lap line along x at z = 0, 12 m wide (L 6, R −6); the pit lane along z = −10 joining the track at x > 100
  const samples = []; for (let i = 0; i < 200; i++) samples.push({ i, p: { x: i * 2, y: 0, z: 0 }, tan: { x: 1, z: 0 }, nor: { x: 0, z: -1 }, L: 6, R: -6 });
  const grid = { nearest: (x, z) => { const s = samples[Math.max(0, Math.min(199, Math.round(x / 2)))]; return [s, Math.hypot(x - s.p.x, z - s.p.z)]; } };
  const pts = []; for (let x = 0; x <= 160; x += 2) pts.push({ x, z: x < 100 ? 10 : 10 - (x - 100) / 6 });   // (+nor is −z: the lane at z = +10 is left… on the R side)
  const world = { grid, pitLane: { pts } };
  const test = pitLaneTest(world);
  assert.strictEqual(test(50, 10), true, "beside the track: the lane");
  assert.strictEqual(test(150, 1.7), false, "where the exit road runs onto the tarmac: the track");
  assert.strictEqual(onTarmac(grid, 150, 1.7), true);
  assert.strictEqual(test(50, 10, 8), true, "the lane's own level");
});

test("steadied tracks: a stretch begins and ends on the raw positions next to it – no jump at the handover", async () => {
  const { smoothedTracks } = await import("../src/renderer/smooth.js");
  // a circle of 1 km; the car drives at 50 m/s; its telemetry reads 3 % fast (the steadied s drifts off the positions'),
  // and for 6 s mid-way its positions are off the track (12 m out: a trip over the run-off) – raw there
  const R = 1000 / (2 * Math.PI), n = 1000, samples = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; samples.push({ i, p: { x: R * Math.cos(a), y: 0, z: R * Math.sin(a) }, tan: { x: -Math.sin(a), z: Math.cos(a) }, nor: { x: -Math.cos(a), z: -Math.sin(a) }, L: 6, R: -6 }); }
  const world = { samples, center: { x: 0, y: 0, z: 0 }, grid: { nearest: (x, z) => { const a = Math.atan2(z, x), i = ((Math.round((a / (2 * Math.PI)) * n) % n) + n) % n, s = samples[i]; return [s, Math.hypot(x - s.p.x, z - s.p.z)]; } } };
  const N = 160, t = new Float64Array(N), x = new Float32Array(N), y = new Float32Array(N), z = new Float32Array(N), tel = { t: [], v: [], rpm: [], gear: [], thr: [], brk: [], drs: [] };
  for (let k = 0; k < N; k++) {
    // (the second before it leaves the track the positions run 10 m ahead of the speed's distance – the data catching up)
    t[k] = 10000 + k * 250; const s = 50 * k * 0.25 + (k >= 56 && k < 60 ? 10 : 0), a = (s / 1000) * 2 * Math.PI, off = k >= 60 && k < 84 ? 14 : 0;
    x[k] = ((R + off) * Math.cos(a)) / 0.1; y[k] = -((R + off) * Math.sin(a)) / 0.1;
  }
  for (let q = 0; q < 200; q++) { tel.t.push(9000 + q * 250); tel.v.push(50 * 3.6 * 1.03); tel.rpm.push(0); tel.gear.push(7); tel.thr.push(100); tel.brk.push(0); tel.drs.push(0); }
  const src = { isLive: false, car: { 1: tel }, tracks: { cars: { 1: { t, x, y, z, n: N } } } };
  const sm = smoothedTracks(src, world, RK.CarTracks);
  const P = [0, 0, 0];
  let worst = 0, prev = null;
  for (let tt = 12000; tt < 48000; tt += 1000 / 60) {
    const pos = sm.all(tt, {}); const p = pos["1"]; if (!p) continue;
    const q = [p[0] * 0.1, p[1] * 0.1];
    if (prev) worst = Math.max(worst, Math.hypot(q[0] - prev[0], q[1] - prev[1]));
    prev = q;
  }
  // 50 m/s at 60 frames a second: 0.83 m a frame; the handover may add a little, never metres
  assert.ok(worst < 1.6, `largest step ${worst.toFixed(2)} m`);
  // and at the stretch's last on-track sample the drawn car is where that sample is (the raw positions take over there)
  const p59 = sm.all(t[59] - 1, {})["1"], miss = Math.hypot(p59[0] - x[59], p59[1] - y[59]) * 0.1;
  assert.ok(miss < 1.5, `at the handover ${miss.toFixed(2)} m off the raw position`);
});

test("re-sent positions: a leap back onto ground covered seconds before, then over it again, is dropped; a hairpin is kept", () => {
  // forward at 50 m/s along x; at 10 s the feed jumps back 150 m and replays the last 3 s (other numbers, same places)
  const N = 120, t = new Float64Array(N), x = new Float32Array(N), y = new Float32Array(N), z = new Float32Array(N), tel = { t: [], v: [] };
  for (let k = 0; k < N; k++) {
    t[k] = 1000 + k * 250; const s = (t[k] - 1000) / 1000;
    const shown = s >= 10 && s < 13 ? s - 3 : s;
    x[k] = Math.round(shown * 50 * 10) + (k % 3); tel.t.push(t[k]); tel.v.push(180);
  }
  const r = RK.dropHeld({ t, x, y, z, n: N }, tel);
  assert.ok(r.rewound >= 10, `rewound ${r.rewound}`);
  for (let k = 1; k < r.track.n; k++) assert.ok(r.track.x[k] >= r.track.x[k - 1] - 5, "never back");
  // a hairpin: 15 m/s round a 10 m radius – the exit passes within 8 m of the entry a few seconds later; no leap
  const M = 80, t2 = new Float64Array(M), x2 = new Float32Array(M), y2 = new Float32Array(M), tel2 = { t: [], v: [] };
  for (let k = 0; k < M; k++) { t2[k] = k * 250; const s = 15 * k * 0.25; let px, py; if (s < 100) { px = s; py = 0; } else if (s < 100 + Math.PI * 10) { const a = (s - 100) / 10; px = 100 + 10 * Math.sin(a); py = 10 - 10 * Math.cos(a); } else { px = 100 - (s - 100 - Math.PI * 10); py = 20; } x2[k] = px * 10; y2[k] = py * 3; tel2.t.push(t2[k]); tel2.v.push(54); }
  assert.strictEqual(RK.dropHeld({ t: t2, x: x2, y: y2, z: new Float32Array(M), n: M }, tel2).rewound, 0, "hairpin kept");
});

test("steadied tracks: a feed that falls 10 s behind and catches up – drawn from the telemetry, no surge (2026 Hungary pattern)", async () => {
  const { smoothedTracks } = await import("../src/renderer/smooth.js");
  const R = 3000 / (2 * Math.PI), n = 3000, samples = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; samples.push({ i, p: { x: R * Math.cos(a), y: 0, z: R * Math.sin(a) }, tan: { x: -Math.sin(a), z: Math.cos(a) }, nor: { x: -Math.cos(a), z: -Math.sin(a) }, L: 6, R: -6 }); }
  const world = { samples, center: { x: 0, y: 0, z: 0 }, grid: { nearest: (x, z) => { const a = Math.atan2(z, x), i = ((Math.round((a / (2 * Math.PI)) * n) % n) + n) % n, s = samples[i]; return [s, Math.hypot(x - s.p.x, z - s.p.z)]; } } };
  // 50 m/s; from 20 s to 50 s the positions are those of 10 s earlier (500 m behind), 1 s apart; then on time again
  const T = [], X = [], Y = [];
  for (let tt = 0; tt <= 80000; tt += 250) {
    const late = tt > 20000 && tt < 50000; if (late && tt % 1000) continue;
    const s = 50 * (late ? tt - 10000 : tt) / 1000, a = (s / 3000) * 2 * Math.PI;
    T.push(10000 + tt); X.push((R * Math.cos(a)) / 0.1); Y.push(-(R * Math.sin(a)) / 0.1);
  }
  const N = T.length, tel = { t: [], v: [], rpm: [], gear: [], thr: [], brk: [], drs: [] };
  for (let q = 0; q < 400; q++) { tel.t.push(9000 + q * 250); tel.v.push(180); tel.rpm.push(0); tel.gear.push(7); tel.thr.push(100); tel.brk.push(0); tel.drs.push(0); }
  const src = { isLive: false, car: { 1: tel }, tracks: { cars: { 1: { t: Float64Array.from(T), x: Float32Array.from(X), y: Float32Array.from(Y), z: new Float32Array(N), n: N } } } };
  const sm = smoothedTracks(src, world, RK.CarTracks);
  let worstErr = 0, worstV = 0;
  for (let tt = 12000; tt < 88000; tt += 100) {
    const st = sm.state("1", tt); if (!st) continue;
    const truth = 50 * (tt - 10000) / 1000, err = Math.abs(((st.s - truth) % 3000 + 4500) % 3000 - 1500);
    worstErr = Math.max(worstErr, err); worstV = Math.max(worstV, Math.abs(st.vs));
  }
  assert.ok(worstErr < 40, `the drawn place ${worstErr.toFixed(1)} m off the truth at worst`);
  assert.ok(worstV < 50 * 1.3, `speed along up to ${worstV.toFixed(1)} m/s (the car does 50)`);
});
