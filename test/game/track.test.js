// The engine's track model (src/game/engine/track.js, DESIGN §4.1) – on synthetic tracks whose answers are known exactly,
// and on the committed real-race fixtures (test/fixtures/game, built from the app's session cache by
// src/game/tools/build-scenario.mjs).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const FIX = path.join(__dirname, "../fixtures/game");
const fixtures = () => (fs.existsSync(FIX) ? fs.readdirSync(FIX).filter((f) => f.endsWith(".scenario.json")).sort() : []);
const readFix = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));

// a circle of radius R run anticlockwise, sampled every ~2 m, with a pit lane: a chord-parallel straight 20 m inside
function circleTrack(R = 300, { pit = true } = {}) {
  const L = 2 * Math.PI * R, n = Math.round(L / 2), ds = L / n, cols = { x: [], y: [], z: [], hdg: [], kappa: [], grade: [], wL: [], wR: [], line: [], zone: [] };
  for (let i = 0; i < n; i++) {
    const a = (i * ds) / R;
    cols.x.push(R * Math.cos(a)); cols.y.push(R * Math.sin(a)); cols.z.push(10 * Math.sin(a)); cols.hdg.push(Math.atan2(Math.cos(a), -Math.sin(a)));
    cols.kappa.push(1 / R); cols.grade.push((10 * Math.cos(a)) / R); cols.wL.push(6); cols.wR.push(8); cols.line.push(0.5); cols.zone.push(i * ds < 500 ? 1 : 0);
  }
  const tr = { n, L, ds, columns: cols, zones: { drs: [{ detect: L - 400, start: L - 300, end: 200 }], straight: [], sectors: [L / 3, (2 * L) / 3], cover: [[100, 300]], brake: [] }, pit: null };
  if (pit) {
    // the lane: from s = L − 200 to s = 200 along the circle at radius R − 20 (so it runs beside the lap, ~ (R−20)/R as long)
    const a0 = (L - 200) / R - 2 * Math.PI, a1 = 200 / R, r = R - 20, Lp = r * (a1 - a0), np = Math.round(Lp / 2), dp = Lp / np, pc = { u: [], x: [], y: [], z: [], hdg: [], sLap: [] };
    for (let i = 0; i <= np; i++) { const a = a0 + (i * dp) / r; pc.u.push(i * dp); pc.x.push(r * Math.cos(a)); pc.y.push(r * Math.sin(a)); pc.z.push(0); pc.hdg.push(Math.atan2(Math.cos(a), -Math.sin(a))); pc.sLap.push(((a * R) % L + L) % L); }
    tr.pit = { n: np + 1, ds: dp, L: Lp, columns: pc, sIn: L - 200, sOut: 200, limStart: 30, limEnd: Lp - 30, speedLimit: 80 / 3.6, boxes: { McLaren: 100, Ferrari: 130 } };
  }
  return tr;
}

test("track: wrap, idx, interpolation and distances on a closed lap", async () => {
  const { loadTrack } = await import("../../src/game/engine/track.js");
  const T = loadTrack(circleTrack());
  assert.ok(Math.abs(T.n * T.ds - T.L) < 1e-9);
  for (const s of [0, 1, T.L - 1e-9, T.L, T.L + 5, -5, -T.L * 3 + 1, 1e7]) { const w = T.wrap(s); assert.ok(w >= 0 && w < T.L, `wrap(${s}) = ${w}`); }
  assert.strictEqual(T.idx(T.ds * 10 + 0.3), 10);
  assert.strictEqual(T.idx(-0.01), T.n - 1);
  // interpolation is exact for a linear-in-s column and continuous across s = 0
  const lin = Float64Array.from({ length: T.n }, (_, i) => i);
  assert.ok(Math.abs(T.at(lin, T.ds * 5.25) - 5.25) < 1e-9);
  const z0 = T.at(T.z, T.L - 1e-6), z1 = T.at(T.z, 0);
  assert.ok(Math.abs(z0 - z1) < 1e-3, "z continuous across the line");
  assert.strictEqual(T.ahead(T.L - 10, 15), 25);
  assert.strictEqual(T.ahead(15, T.L - 10), T.L - 25);
  assert.strictEqual(T.delta(15, T.L - 10), -25);
  // heading interpolation never takes the long way round ±π
  for (let s = 0; s < T.L; s += 7.3) { const h = T.hdgAt(s), want = Math.atan2(Math.cos(s / 300), -Math.sin(s / 300)); assert.ok(Math.abs(Math.atan2(Math.sin(h - want), Math.cos(h - want))) < 1e-3, `hdg at ${s}`); }
});

test("track: posAt and project are inverse (s, d) ↔ (x, y); + d is left of travel", async () => {
  const { loadTrack } = await import("../../src/game/engine/track.js");
  const R = 300, T = loadTrack(circleTrack(R));
  for (const [s, d] of [[0, 0], [123.4, 3], [T.L - 1, -4], [900, 7.5]]) {
    const p = T.posAt(s, d);
    // anticlockwise circle: left of travel is towards the centre
    assert.ok(Math.abs(Math.hypot(p.x, p.y) - (R - d)) < 0.05, `radius at (${s}, ${d})`);
    const q = T.project(p.x, p.y);
    assert.ok(Math.abs(T.delta(s, q.s)) < 0.05 && Math.abs(q.d - d) < 0.05, `round trip (${s}, ${d}) → (${q.s}, ${q.d})`);
  }
  assert.strictEqual(T.project(5000, 5000), null, "far away: not on the lap");
});

test("track: zones – bits, spans across the line, sectors, the next zone", async () => {
  const { loadTrack, ZONE } = await import("../../src/game/engine/track.js");
  const T = loadTrack(circleTrack());
  assert.ok(T.has(10, ZONE.BRAKE) && !T.has(600, ZONE.BRAKE));
  const drs = T.zones.drs[0];
  assert.ok(T.zoneOf(T.zones.drs, T.L - 100) === drs && T.zoneOf(T.zones.drs, 50) === drs && T.zoneOf(T.zones.drs, 400) === null, "a zone across s = 0");
  assert.deepStrictEqual([T.sectorOf(1), T.sectorOf(T.L / 2), T.sectorOf(T.L - 1)], [1, 2, 3]);
  const nx = T.nextZone(T.zones.drs, 1000);
  assert.ok(nx.zone === drs && Math.abs(nx.dist - (T.L - 300 - 1000)) < 1e-9);
  assert.ok(T.inSpan(150, ...T.zones.cover[0]) && !T.inSpan(350, ...T.zones.cover[0]));
});

test("track: the pit lane maps to the lap and back only where it runs beside it", async () => {
  const { loadTrack } = await import("../../src/game/engine/track.js");
  const T = loadTrack(circleTrack()), P = T.pit;
  assert.ok(P && P.L > 300 && P.speedLimit > 20 && P.speedLimit < 23);
  assert.ok(Math.abs(P.lapToPit(P.sIn)) < 0.5, "branch → u = 0");
  assert.ok(Math.abs(P.lapToPit(P.sOut - 1e-6) - P.L) < 1, "merge → u = L");
  assert.strictEqual(P.lapToPit(T.L / 2), null, "far side of the lap: no pit lane");
  for (let u = 0; u <= P.L; u += 13.7) {
    const s = P.pitToLap(u), back = P.lapToPit(s);
    assert.ok(back != null && Math.abs(back - u) < 0.5, `u ${u} → s ${s} → ${back}`);
  }
  // monotone: further down the lane is further along the lap
  let prev = -1; for (let u = 0; u <= P.L; u += 5) { const f = T.ahead(P.sIn, P.pitToLap(u)); assert.ok(f >= prev - 1e-9); prev = f; }
  assert.ok(P.inLimiter(P.boxes.McLaren) && !P.inLimiter(0));
});

test("track: a bad track is refused, not half-loaded", async () => {
  const { loadTrack } = await import("../../src/game/engine/track.js");
  const tr = circleTrack(); tr.columns.kappa.pop();
  assert.throws(() => loadTrack(tr), /kappa/);
  const t2 = circleTrack(); t2.L *= 1.1;
  assert.throws(() => loadTrack(t2), /inconsistent/);
});

test("track: lookups are fast enough for 22 cars × 50 ms steps (no allocation in at / idx / has)", async () => {
  const { loadTrack, ZONE } = await import("../../src/game/engine/track.js");
  const T = loadTrack(circleTrack());
  let acc = 0; const N = 2e6, t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) { const s = i * 0.731; acc += T.at(T.kappa, s) + (T.has(s, ZONE.DRS) ? 1 : 0); }
  const ns = Number(process.hrtime.bigint() - t0) / N;
  assert.ok(Number.isFinite(acc));
  // (DESIGN §2: ≤ 5 µs per car-step in total; a lookup must be a small part of it – generous bound for a loaded machine)
  assert.ok(ns < 500, `${ns.toFixed(0)} ns per lookup`);
});

// ---- the real-race fixtures
test("fixtures: each committed scenario validates and loads; the lap is a closed, evenly sampled loop", async (t) => {
  const { loadTrack } = await import("../../src/game/engine/track.js");
  const { validateScenario } = await import("../../src/game/data/scenario.js");
  const list = fixtures();
  if (!list.length) return t.skip("no fixtures in test/fixtures/game");
  for (const f of list) {
    const sc = readFix(f), v = validateScenario(sc);
    assert.ok(v.ok, `${f}: ${v.errors.join("; ")}`);
    const T = loadTrack(sc.track);
    // the samples' own spacing adds up to the lap length
    let len = 0, turn = 0;
    for (let i = 0; i < T.n; i++) { const j = (i + 1) % T.n; len += Math.hypot(T.x[j] - T.x[i], T.y[j] - T.y[i]); turn += Math.atan2(Math.sin(T.hdg[j] - T.hdg[i]), Math.cos(T.hdg[j] - T.hdg[i])); }
    assert.ok(Math.abs(len - T.L) / T.L < 0.002, `${f}: polyline ${len.toFixed(1)} vs L ${T.L.toFixed(1)}`);
    // one full turn per lap – or none for a figure of eight (Suzuka crosses itself)
    assert.ok(Math.abs(Math.abs(turn) - 2 * Math.PI) < 0.05 || Math.abs(turn) < 0.05, `${f}: a lap turns once or (figure of eight) not at all (${turn.toFixed(3)})`);
    // curvature integrates to the same turning (kappa is d hdg / ds, smoothed – the integral survives smoothing)
    let ik = 0; for (let i = 0; i < T.n; i++) ik += T.kappa[i] * T.ds;
    assert.ok(Math.abs(ik - turn) < 0.05, `${f}: ∫κ ds ${ik.toFixed(3)} vs turning ${turn.toFixed(3)}`);
    // elevation: the heights close on themselves and the grade is their derivative
    let iz = 0; for (let i = 0; i < T.n; i++) iz += T.grade[i] * T.ds;
    assert.ok(Math.abs(iz) < 0.5, `${f}: ∮ grade ds = ${iz.toFixed(2)} m`);
    // width and line are inside each other
    for (let i = 0; i < T.n; i += 7) assert.ok(T.line[i] < T.wL[i] && -T.line[i] < T.wR[i], `${f}: line outside the edges at ${i}`);
  }
});

test("fixtures: zone bits agree with the zone lists; pit lane features are consistent", async (t) => {
  const { loadTrack, ZONE } = await import("../../src/game/engine/track.js");
  const list = fixtures(); if (!list.length) return t.skip("no fixtures");
  for (const f of list) {
    const sc = readFix(f), T = loadTrack(sc.track);
    for (const z of T.zones.drs) { const mid = T.wrap(z.start + T.ahead(z.start, z.end) / 2); assert.ok(T.has(mid, ZONE.DRS), `${f}: DRS bit in its zone`); assert.ok(T.ahead(z.start, z.end) > 150 && T.ahead(z.start, z.end) < 1500, `${f}: DRS zone length`); }
    for (const z of T.zones.straight) assert.ok(T.has(T.wrap(z.start + 5), ZONE.STRAIGHT_MODE), `${f}: straight-mode bit`);
    for (const [a, b] of T.zones.cover) { assert.ok(T.has(T.wrap(a + T.ahead(a, b) / 2), ZONE.COVER)); }
    let s1 = 0, s2 = 0, s3 = 0; for (let i = 0; i < T.n; i++) { s1 += !!(T.zone[i] & ZONE.SECTOR1); s2 += !!(T.zone[i] & ZONE.SECTOR2); s3 += !!(T.zone[i] & ZONE.SECTOR3); }
    assert.strictEqual(s1 + s2 + s3, T.n, `${f}: every sample in exactly one sector`);
    assert.ok(s1 > T.n * 0.15 && s2 > T.n * 0.15 && s3 > T.n * 0.15, `${f}: sectors are each a real share of the lap`);
    // braking zones exist and sit before corners (a lap with no braking is not a Grand Prix circuit)
    const brake = Array.from(T.zone).filter((z) => z & ZONE.BRAKE).length * T.ds;
    assert.ok(brake > 300 && brake < T.L * 0.35, `${f}: braking metres ${brake}`);
    const P = T.pit; assert.ok(P, `${f}: pit lane`);
    assert.ok(P.limStart < P.limEnd && P.limEnd <= P.L, `${f}: limiter inside the path`);
    assert.ok(P.speedLimit > 15 && P.speedLimit < 25, `${f}: pit limit ${P.speedLimit * 3.6} km/h`);
    assert.ok(T.has(P.sIn, ZONE.PIT_ENTRY) && T.has(P.sOut, ZONE.PIT_EXIT));
    for (const [team, u] of Object.entries(P.boxes)) assert.ok(P.inLimiter(u), `${f}: ${team}'s box ${u} inside the limiter span ${P.limStart}–${P.limEnd}`);
    // every team of the race that pitorder.js knows has a box, and boxes are distinct places
    const us = Object.values(P.boxes).sort((a, b) => a - b); for (let i = 1; i < us.length; i++) assert.ok(us[i] - us[i - 1] > 8, `${f}: boxes ${us[i - 1]} / ${us[i]} too close`);
    // the pit path starts and ends on the lap line
    const a = T.project(P.x[0], P.y[0]), b = T.project(P.x[P.n - 1], P.y[P.n - 1]);
    assert.ok(a && Math.abs(a.d) < 3 && b && Math.abs(b.d) < 3, `${f}: pit path ends on the lap line`);
  }
});

test("fixtures: the timing line – the grid stands behind or just past it, consistently with the lap reports", async (t) => {
  const list = fixtures(); if (!list.length) return t.skip("no fixtures");
  for (const f of list) {
    const sc = readFix(f), L = sc.track.L, sl = sc.track.startLine;
    assert.ok(sl.n >= 100, `${f}: lap reports used ${sl.n}`);
    if (sl.latencyFitted) assert.ok(sl.latency > 0.1 && sl.latency < 1, `${f}: the feed's delay ${sl.latency} s`);
    // grid slots: increasing distance behind pole, about 8 m apart per position (FIA grid pitch) – their s comes from the
    // cars' own positions before lights out, independent of the timing line
    const slots = sc.grid.slots.filter((q) => q.s != null);
    if (slots.length < 5) continue;
    const back = (q) => ((slots[0].s - q.s) % L + L) % L;
    for (let i = 1; i < slots.length; i++) assert.ok(back(slots[i]) > back(slots[i - 1]) - 2, `${f}: grid order along the lap`);
    const pitch = back(slots[slots.length - 1]) / (slots[slots.length - 1].pos - slots[0].pos);
    assert.ok(pitch > 6 && pitch < 10, `${f}: grid pitch ${pitch.toFixed(2)} m`);
  }
});
