// Race control (DESIGN §10, request §12): start, SC as a car with a queue, VSC as per-car minimum sector times, red flag
// into the pit lane and the restart, overtaking permissions, DRS / Overtake availability, the finish and the time limit.
// On a synthetic track (track.js contract) with point-mass cars (test/game/harness-control.cjs).
const test = require("node:test");
const assert = require("node:assert/strict");
const H0 = require("./harness-control.cjs");

const spread = (S) => { const d = S.cars.filter((c) => c.status === "run").map((c) => c.dist); return Math.max(...d) - Math.min(...d); };
const runTo = (H, pred, maxMs = 60 * 60e3, opt = {}) => H0.run(H, maxMs, { ...opt, until: pred });

test("start: lights 1 s apart, nobody moves before their own reaction after lights out, grid slots 8 m apart behind the line, seeded reactions", async () => {
  const H = await H0.makeRace({ n: 8, seed: 3 }), S = H.race.state, st = S.control.start;
  assert.deepEqual(st.lights.map((x, i) => i ? x - st.lights[i - 1] : 0).slice(1), [1000, 1000, 1000, 1000]);
  assert.ok(st.out - st.lights[4] >= 400 && st.out - st.lights[4] <= 3000, "lights out within the starter's window");
  const g = S.cars.map((c) => c.dist); assert.ok(g[0] < 0 && g.every((x, i) => !i || Math.abs(g[i - 1] - x - 8) < 1e-9), `slots ${g}`);
  assert.ok(S.cars.every((c, i) => Math.sign(c.d) === (i % 2 ? -1 : 1)), "staggered left / right");
  const moved = {};
  H0.run(H, 12000, { hooks: { afterCars: (H) => { for (const c of S.cars) if (c.v > 0 && moved[c.num] == null) moved[c.num] = S.t; } } });
  for (const c of S.cars) {
    assert.ok(moved[c.num] >= st.go[c.num], `car ${c.num} moved at ${moved[c.num]}, its go ${st.go[c.num]}`);
    const r = (st.go[c.num] - st.out) / 1000; assert.ok(r >= 0.12 && r <= 0.35, `reaction ${r}`);
  }
  // same seed → same reactions; another seed → different
  const H2 = await H0.makeRace({ n: 8, seed: 3 }), H3 = await H0.makeRace({ n: 8, seed: 4 });
  assert.deepEqual(H2.race.state.control.start.go, st.go);
  assert.notDeepEqual(H3.race.state.control.start.go, st.go);
  // launch inputs for the car model: the season's MGU-K speed at a standing start
  assert.equal(st.launch["1"].mguKFromKmh, 100);
  const H26 = await H0.makeRace({ n: 4, season: 2026 }); assert.equal(H26.race.state.control.start.launch["1"].mguKFromKmh, 50);
  assert.equal(H26.race.state.control.start.lights[0], 5000 + 1000, "2026: 5 s blue Pre-Start before the first red light");
});

test("start: an anticipating driver is reported to the stewards (false start); pit-lane starters wait until the field passed the pit exit", async () => {
  const { CONTROL } = await H0.imp("data/params/control.js");
  const P = { ...CONTROL, falseStartP: { v: 1 } };
  const H = await H0.makeRace({ n: 6, P, pitStart: ["6"] }), S = H.race.state;
  H0.run(H, 9000);
  const fs = S.control.infr.filter((x) => x.kind === "falseStart").map((x) => x.num).sort();
  assert.deepEqual(fs, ["1", "2", "3", "4", "5"], "everyone on the grid anticipated (p = 1)");
  // the pit starter: still in the lane until all grid cars passed sOut + a car length
  const ps = S.cars.find((c) => c.num === "6"); let leftAt = null, lastPassed = null;
  H0.run(H, 60000, { hooks: { afterCars: () => {
    if (lastPassed == null && S.cars.filter((c) => c.num !== "6").every((c) => c.dist > H.T.pit.sOut + 5.6)) lastPassed = S.t;
    if (leftAt == null && ps.pit.phase === "exit") leftAt = S.t;
  } } });
  assert.ok(lastPassed != null && leftAt != null && leftAt >= lastPassed, `pit starter left at ${leftAt}, field passed at ${lastPassed}`);
});

test("SC: a car on the track; the leader closes up to it, the field queues and the gaps compress; no overtaking; SC in → green at the Line", async () => {
  const H = await H0.makeRace({ n: 10, totalLaps: 30, paces: Array.from({ length: 10 }, (_, i) => 1 - i * 0.006) }), S = H.race.state;
  H0.run(H, 5 * 60e3);
  const before = spread(S), ord0 = H0.trackOrder(H).join(","), lap0 = Math.max(...S.cars.map((c) => c.dist));
  assert.ok(before > 800, `field spread before the SC: ${before}`);
  H.C.neutralise(H.race, H.T, "sc", { clearMs: 150e3, cause: "test: car stopped" });
  let minSpread = Infinity, changes = 0, scSeen = false, leadGapMin = Infinity, inMsgT = null;
  runTo(H, () => {
    const sc = S.control.sc;
    if (S.control.flag === "sc") {
      minSpread = Math.min(minSpread, spread(S));
      if (H0.trackOrder(H).join(",") !== ord0) changes++;
      if (sc && sc.st === "out") { scSeen = true; const l = S.cars.find((c) => c.num === S.order[0]); leadGapMin = Math.min(leadGapMin, H.T.ahead(l.s, sc.s)); }
    }
    if (inMsgT == null && H0.msgs(H).includes("SAFETY CAR IN THIS LAP")) inMsgT = S.t;
    return S.control.flag === "green";
  });
  assert.ok(scSeen, "the SC drove on the track");
  assert.equal(changes, 0, "no position changed under the SC");
  assert.ok(minSpread < 10 * (18 + 5.6), `queue compressed: ${before.toFixed(0)} m → ${minSpread.toFixed(0)} m`);
  assert.ok(leadGapMin <= 10 * 5.6, `leader within ten car lengths of the SC (${leadGapMin.toFixed(1)} m)`);
  assert.ok(inMsgT && inMsgT >= S.control.clearAt, "SC in only after the track was clear");
  assert.ok(Math.max(...S.cars.map((c) => c.dist)) > lap0 + 5000, "laps count under the SC");
  assert.deepEqual(S.control.infr, [], "everyone kept the minimum sector times");
  // overtaking is allowed again for a car that has passed the Line after the SC came in
  const [a, b] = [S.cars.find((c) => c.num === S.order[1]), S.cars.find((c) => c.num === S.order[0])];
  assert.ok(H.C.mayOvertake(H.race, H.T, a, b).ok);
});

test("SC: pit entry only to change tyres; the exit light holds a car while the queue passes; entering the pits after SC line 1 may pass", async () => {
  const H = await H0.makeRace({ n: 6, totalLaps: 30 }), S = H.race.state;
  H0.run(H, 3 * 60e3);
  H.C.neutralise(H.race, H.T, "sc", { clearMs: 200e3 });
  H0.run(H, 5000);
  const c = S.cars[3];
  assert.ok(H.C.pitOpen(H.race, H.T, c, "tyres").entry.ok);
  assert.ok(!H.C.pitOpen(H.race, H.T, c, "dt").entry.ok, "no drive-through service under the SC");
  // a committed car past SC line 1 may pass the car ahead on the lap
  c.pit.phase = "committed"; const s0 = c.s; c.s = H.T.wrap(H.T.pit.sIn + 5);
  assert.ok(H.C.mayOvertake(H.race, H.T, c, S.cars[2]).ok);
  c.s = s0; c.pit.phase = "none";
  // the exit light: a car at the end of the lane is held when the SC is just before the exit
  const sc = S.control.sc; sc.st = "out"; sc.s = H.T.wrap(H.T.pit.sOut - 50);
  const pc = { ...c, where: "pit", pit: { ...c.pit, phase: "laneOut", u: 400, v: 10 } };
  const ctx = H.C.pitCtx(H.race, H.T, pc);
  assert.ok(ctx.holdU != null && ctx.holdU <= H.T.pit.limEnd, `held: ${JSON.stringify(ctx)}`);
});

test("SC: lapped cars unlap past the queue and the SC, the SC comes in only after they passed (end of the following lap)", async () => {
  // car 6 is slow and a lap down
  const H = await H0.makeRace({ n: 6, totalLaps: 40, paces: [1, 0.995, 0.99, 0.985, 0.98, 0.80] }), S = H.race.state;
  runTo(H, () => { const l = S.cars[0], s6 = S.cars[5]; return l.dist - s6.dist > 5000 + 600; }, 30 * 60e3);
  const slow = S.cars[5], lapsBehind0 = Math.floor((S.cars[0].dist - slow.dist) / 5000);
  assert.ok(lapsBehind0 >= 1, "car 6 is lapped");
  H.C.neutralise(H.race, H.T, "sc", { clearMs: 60e3 });
  let unlapT = null, passedT = null, inT = null;
  runTo(H, () => {
    const m = H0.msgs(H);
    if (unlapT == null && m.some((x) => x.startsWith("LAPPED CARS MAY NOW OVERTAKE"))) unlapT = S.t;
    if (passedT == null && m.includes("CAR 6 PASSED THE SAFETY CAR")) passedT = S.t;
    if (inT == null && m.includes("SAFETY CAR IN THIS LAP")) inT = S.t;
    return S.control.flag === "green";
  }, 30 * 60e3);
  assert.ok(unlapT && passedT && inT, `unlap ${unlapT}, passed ${passedT}, in ${inT}`);
  assert.ok(unlapT < passedT && passedT < inT, "message → car passes the SC → SC in");
  assert.ok(H0.msgs(H).find((x) => x.startsWith("LAPPED CARS")).includes("6"));
  const lapsBehind1 = Math.floor((S.cars[0].dist - slow.dist) / 5000);
  assert.equal(lapsBehind1, lapsBehind0 - 1, "one lap regained");
  assert.equal(H0.trackOrder(H).at(-1), "6", "it rejoined at the back");
});

test("SC: cars between the SC and the leader are waved past and the leader then closes up", async () => {
  const H = await H0.makeRace({ n: 8, totalLaps: 40, paces: Array.from({ length: 8 }, (_, i) => 1 - i * 0.01) }), S = H.race.state;
  // deploy when the leader has just passed the pit exit: the SC comes out behind it
  runTo(H, () => { const l = S.cars[0]; return S.t > 3 * 60e3 && H.T.ahead(H.T.pit.sOut, l.s) > 20 && H.T.ahead(H.T.pit.sOut, l.s) < 200; });
  H.C.neutralise(H.race, H.T, "sc", { clearMs: 120e3 });
  let waved = new Set();
  runTo(H, () => { for (const c of S.cars) if (S.control.cars[c.num].perm === "wave") waved.add(c.num); return S.control.sc?.caught; }, 10 * 60e3);
  assert.ok(waved.size > 0, "some cars were between the SC and the leader");
  assert.ok(!waved.has("1"), "not the leader");
  assert.ok(S.control.sc.caught, "the leader caught the SC");
  runTo(H, () => S.control.flag === "green", 20 * 60e3);
  assert.equal(H0.trackOrder(H)[0], "1");
});

test("VSC: every car keeps (just above) its own minimum sector time; time gaps survive the VSC; green 10–15 s after VSC ENDING", async () => {
  const H = await H0.makeRace({ n: 6, totalLaps: 40, paces: [1, 0.998, 0.996, 0.994, 0.992, 0.99] }), S = H.race.state;
  H0.run(H, 4 * 60e3);
  // racing time gaps before: line-crossing time differences on the last completed lap
  const gaps = () => { const C = S.control.cross; let k = C.length - 1; while (k >= 0 && C[k].length < S.cars.length) k--; const r = C[k]; return r.slice(1).map((x, i) => (x[1] - r[i][1]) / 1000); };
  const g0 = gaps(); const vRace = S.cars.map((c) => c.v);
  H.C.neutralise(H.race, H.T, "vsc", { clearMs: 100e3 });
  const sectorT = []; let endT = null, greenT = null, maxRatio = 0;
  const K = H.race.cache.ctl, P = (await H0.imp("data/params/control.js")).CONTROL;
  runTo(H, () => {
    if (S.control.flag === "vsc") for (const c of S.cars) { const r = c.v / (K.ref[H.T.idx(c.s)] / K.slow); if (S.t - S.control.vsc.t0 > 20000) maxRatio = Math.max(maxRatio, r); }
    const m = H0.msgs(H); if (endT == null && m.includes("VSC ENDING")) endT = S.t; if (greenT == null && m.includes("GREEN – VSC ENDED")) greenT = S.t;
    return greenT != null;
  });
  assert.deepEqual(S.control.infr, [], "no car under its minimum time in any checked sector");
  assert.ok((greenT - endT) >= 10000 && greenT - endT <= 15000, `VSC ENDING → green ${greenT - endT} ms`);
  assert.ok(maxRatio < 1.6, `speeds near the minimum-time pace (max ratio ${maxRatio.toFixed(2)}) – not free running`);
  // a whole lap under the VSC took about (1 + minTimeSlow) × the reference lap
  H0.run(H, 3 * 60e3);
  const g1 = gaps();
  for (let i = 0; i < g0.length; i++) assert.ok(Math.abs(g1[i] - g0[i]) < 0.35 * g0[i] + 0.4, `gap ${i}: ${g0[i].toFixed(2)} s → ${g1[i].toFixed(2)} s`);
});

test("VSC: the cap is a delta per car – a car that fell behind its ghost may catch up, a car ahead of it is held (not one global speed ratio)", async () => {
  const H = await H0.makeRace({ n: 2, totalLaps: 40 }), S = H.race.state;
  H0.run(H, 3 * 60e3);
  H.C.neutralise(H.race, H.T, "vsc", { clearMs: 300e3 });
  H0.run(H, 30e3);
  const c = S.cars[0], cc = S.control.cars[c.num];
  const capNow = H.C.caps(H.race, H.T, c).v;
  const sec = { ...cc.sec };
  cc.sec = { ...sec, t0: sec.t0 - 3000 }; const capBehind = H.C.caps(H.race, H.T, c).v;
  cc.sec = { ...sec, t0: sec.t0 + 1500 }; const capAhead = H.C.caps(H.race, H.T, c).v;
  cc.sec = sec;
  assert.ok(capBehind > capNow && capAhead < capNow, `behind ${capBehind.toFixed(1)} > now ${capNow.toFixed(1)} > ahead ${capAhead.toFixed(1)}`);
  assert.ok(H.C.vscDelta(H.race, H.T, c) > -0.3);
  assert.ok(!H.C.mayOvertake(H.race, H.T, S.cars[1], c).ok, "no overtaking under the VSC");
});

test("red flag: the field drives into the pit lane and stops in the fast lane in resumption order; free tyre change until the 5-min signal; resumption; time limit extended", async () => {
  const H = await H0.makeRace({ n: 8, totalLaps: 40, paces: Array.from({ length: 8 }, (_, i) => 1 - i * 0.004) }), S = H.race.state;
  H0.run(H, 5 * 60e3);
  const order = S.order.slice();
  H.C.neutralise(H.race, H.T, "red", { clearMs: 5 * 60e3, cause: "barrier repair" });
  const R = S.control.red;
  assert.deepEqual(R.order, order, "resumption order = the order at the signal");
  let overt = 0; const o0 = H0.trackOrder(H).join(",");
  runTo(H, () => { if (S.cars.every((c) => c.where === "lap") && H0.trackOrder(H).join(",") !== o0) overt++; return R.phase === "stopped"; }, 10 * 60e3);
  assert.equal(R.phase, "stopped");
  assert.equal(overt, 0, "no overtaking on the way in");
  const byU = S.cars.slice().sort((a, b) => b.pit.u - a.pit.u).map((c) => c.num);
  assert.deepEqual(byU, order, `queued from the exit in order: ${byU}`);
  assert.ok(S.cars.every((c) => c.where === "pit" && c.pit.v < 0.2 && c.pit.u <= H.T.pit.limEnd));
  // tyres: allowed now, refused after the 5-minute signal
  const fitted = [];
  assert.ok(H.C.redTyreChange(H.race, H.T, S.cars[0], "HARD", (car, cmp) => fitted.push([car.num, cmp])).ok);
  assert.deepEqual(fitted, [["1", "HARD"]]);
  runTo(H, () => S.t > R.resumeAt - 4 * 60e3, 60 * 60e3);
  assert.ok(!H.C.redTyreChange(H.race, H.T, S.cars[1], "HARD").ok, "after the 5-minute signal");
  assert.ok(!H.C.pitOpen(H.race, H.T, S.cars[1]).exit.ok, "pit exit closed while suspended");
  const t0 = R.t0;
  runTo(H, () => H0.msgs(H).some((m) => m.startsWith("PIT EXIT OPEN")), 60 * 60e3);
  assert.ok(S.control.suspMs >= S.t - t0 - 100, "suspension time counted");
  const TL = H.race.rules.timeLimit.value; H0.step(H);
  assert.equal(S.control.timeLimitAt, S.control.t0 + TL.raceMs + S.control.suspMs, "2 h period extended by the suspension");
  // the restart (2025 dry: standing) – behind the SC, then onto the grid, lights, racing
  runTo(H, () => H0.msgs(H).includes("LIGHTS OUT – RACE RESUMED"), 30 * 60e3);
  assert.ok(H0.msgs(H).includes("STANDING START – SAFETY CAR IN THIS LAP"));
  assert.deepEqual(S.cars.slice().sort((a, b) => b.dist - a.dist).map((c) => c.num), order, "restart grid in the resumption order");
  assert.ok(S.cars.every((c) => c.dist < Math.ceil(S.cars[0].dist / 5000) * 5000), "all behind the line");
  assert.equal(S.control.flag, "green");
});

test("red flag 2026: the SC waits at the end of sector 1; cars leave the pit lane and queue behind it", async () => {
  const H = await H0.makeRace({ n: 5, season: 2026, totalLaps: 40 }), S = H.race.state;
  H0.run(H, 4 * 60e3);
  H.C.neutralise(H.race, H.T, "red", { clearMs: 60e3 });
  const R = S.control.red;
  runTo(H, () => S.control.sc && S.control.sc.st === "hold" && S.control.sc.v < 0.1, 60 * 60e3);
  assert.ok(S.t < R.resumeAt, "the SC is out before the resumption");
  assert.ok(Math.abs(H.T.ahead(S.control.sc.s, H.T.zones.sectors[0])) < 8 || H.T.ahead(H.T.zones.sectors[0], S.control.sc.s) < 8, `SC at the end of sector 1: ${S.control.sc.s}`);
  runTo(H, () => S.control.sc?.st === "out" || S.control.flag === "green", 20 * 60e3);
  assert.ok(S.cars.every((c) => c.where === "lap"), "everyone left the pit lane to meet the SC");
});

test("red flag not resumed: result at the end of the penultimate lap before the suspension lap", async () => {
  const H = await H0.makeRace({ n: 4, totalLaps: 40 }), S = H.race.state;
  runTo(H, () => S.control.cross.length >= 5 && H.T.ahead(0, S.cars[0].s) > 2500);
  const lapsAt = Math.floor(Math.max(...S.cars.map((c) => c.dist)) / 5000);
  H.C.neutralise(H.race, H.T, "red", { clearMs: 3600e3 });
  H0.run(H, 60e3);
  const r = H.C.endUnderRed(H.race, H.T, "rain");
  assert.ok(r.ok && r.lap === lapsAt - 1, `lap ${r.lap} (leader had ${lapsAt} at the signal)`);
  assert.ok(S.finished);
});

test("DRS (2025): enabled after the leader's first lap, off under the SC, back one lap after; off when wet. 2026: no DRS; Overtake separate", async () => {
  const H = await H0.makeRace({ n: 4, totalLaps: 40 }), S = H.race.state;
  let firstOn = null;
  runTo(H, () => { if (firstOn == null && S.control.drs.on) firstOn = Math.floor(S.cars[0].dist / 5000); return firstOn != null; });
  assert.equal(firstOn, 1, "enabled when the leader completed one lap (FIA messages: 'DRS ENABLED' on lap 2)");
  const c2 = S.cars[1];
  assert.equal(H.C.drsAllowed(H.race, H.T, c2).ok, Math.floor(c2.dist / 5000) >= 1);
  H.C.neutralise(H.race, H.T, "sc", { clearMs: 30e3 }); H0.step(H);
  assert.ok(!S.control.drs.on && !H.C.drsAllowed(H.race, H.T, S.cars[0]).ok);
  let greenLap = null, onLap = null;
  runTo(H, () => { if (greenLap == null && S.control.flag === "green") greenLap = Math.floor(S.cars[0].dist / 5000); if (greenLap != null && S.control.drs.on) { onLap = Math.floor(S.cars[0].dist / 5000); return true; } return false; });
  assert.equal(onLap, greenLap + 1, "one lap after the SC period");
  H0.step(H, { env: { wet: true } }); assert.ok(!S.control.drs.on, "wet: disabled");
  // 2026
  const H6 = await H0.makeRace({ n: 4, season: 2026, totalLaps: 40 }), S6 = H6.race.state;
  assert.equal(H6.C.drsAllowed(H6.race, H6.T, S6.cars[0]).ok, false);
  assert.ok(!H6.C.overtakeModeAllowed(H6.race, H6.T, S6.cars[0]).ok, "Overtake off before the start");
  runTo(H6, () => S6.control.ot.on, 5 * 60e3);
  assert.ok(S6.cars[0].dist >= H6.race.cache.ctl.otDet, "enabled when the leader crossed the Detection Line");
  H6.C.neutralise(H6.race, H6.T, "sc", { clearMs: 30e3 }); H0.step(H6);
  assert.ok(!S6.control.ot.on, "off under the SC");
  runTo(H6, () => S6.control.ot.on, 20 * 60e3);
  assert.ok(S6.cars.every((c) => S6.control.cars[c.num].ok), "back on once all cars crossed the Line after the SC came in");
  H0.step(H6, { env: { lowGrip: true } }); assert.ok(!S6.control.ot.on, "low grip: off");
  assert.equal(H6.C.activeAeroAllowed(H6.race, H6.T, S6.cars[0]).mode, "partial", "Active Aero partial in low grip – a different system from Overtake");
});

test("2026: after SAFETY CAR IN THIS LAP no running alongside; overtaking only after the Line", async () => {
  const H = await H0.makeRace({ n: 4, season: 2026, totalLaps: 40 }), S = H.race.state;
  H0.run(H, 3 * 60e3);
  H.C.neutralise(H.race, H.T, "sc", { clearMs: 20e3 });
  runTo(H, () => S.control.sc?.st === "in", 20 * 60e3);
  const [a, b] = [S.cars.find((c) => c.num === S.order[1]), S.cars.find((c) => c.num === S.order[0])];
  const al = H.C.alongsideOk(H.race, H.T, a, b); assert.ok(!al.ok && /alongside/.test(al.why));
  const H5 = await H0.makeRace({ n: 4, season: 2025, totalLaps: 40 }), S5 = H5.race.state;
  H0.run(H5, 3 * 60e3); H5.C.neutralise(H5.race, H5.T, "sc", { clearMs: 20e3 });
  runTo(H5, () => S5.control.sc?.st === "in", 20 * 60e3);
  const r5 = H5.C.alongsideOk(H5.race, H5.T, S5.cars[1], S5.cars[0]); assert.ok(!/alongside/.test(r5.why || ""), "2025: no such rule (but no overtaking before the Line)");
  assert.ok(!r5.ok);
});

test("local yellow: no overtaking inside the zone, drivers lift (grip use < 1); outside it racing", async () => {
  const H = await H0.makeRace({ n: 3, totalLaps: 40 }), S = H.race.state;
  H0.run(H, 2 * 60e3);
  const a = S.cars[1], b = S.cars[0];
  H.C.neutralise(H.race, H.T, "double", { s: b.s, clearMs: 30e3 });
  assert.ok(!H.C.mayOvertake(H.race, H.T, a, b).ok);
  assert.ok(H.C.caps(H.race, H.T, b).util < 0.95);
  const far = { ...a, s: H.T.wrap(b.s + 2000) }, far2 = { ...b, s: H.T.wrap(b.s + 2050) };
  assert.ok(H.C.mayOvertake(H.race, H.T, far, far2).ok);
  H0.run(H, 31e3);
  assert.equal(S.control.yellows.length, 0, "cleared");
});

test("finish: chequered when the leader completes the distance, the others at their next crossing; the time limit brings the flag forward", async () => {
  const H = await H0.makeRace({ n: 5, totalLaps: 4 }), S = H.race.state;
  runTo(H, () => S.finished, 20 * 60e3);
  assert.equal(S.control.phase, "finished");
  const lead = S.cars.find((c) => c.fin && c.fin.laps === 4 && c.fin.t === S.control.fin.flagT);
  assert.ok(lead, "the leader took the flag at the end of lap 4");
  assert.ok(S.cars.every((c) => c.status === "fin" && c.fin.t >= S.control.fin.flagT));
  // time limit 3 min: the flag comes at the end of the lap after the one in which it expired
  const H2 = await H0.makeRace({ n: 3, totalLaps: 50, rulesPatch: (r) => { r.timeLimit.value.raceMs = 180e3; } }), S2 = H2.race.state;
  let lapsAtLimit = null;
  runTo(H2, () => { if (lapsAtLimit == null && S2.t >= S2.control.t0 + 180e3) lapsAtLimit = Math.floor(S2.cars[0].dist / 5000); return S2.finished; }, 30 * 60e3);
  assert.equal(S2.control.fin.reason, "time");
  assert.equal(S2.control.fin.target, lapsAtLimit + 2, `flag after lap ${S2.control.fin.target} (leader had ${lapsAtLimit} at the limit)`);
});

test("last lap: an SC on the final lap goes in at its end; the cars take the flag without overtaking (no restart)", async () => {
  const H = await H0.makeRace({ n: 5, totalLaps: 5, paces: [1, 0.99, 0.98, 0.97, 0.96] }), S = H.race.state;
  runTo(H, () => Math.floor(S.cars[0].dist / 5000) === 4 && H.T.ahead(0, S.cars[0].s) > 200);
  const ord = H0.trackOrder(H).join(",");
  H.C.neutralise(H.race, H.T, "sc", { clearMs: 10e3 });
  runTo(H, () => S.finished, 20 * 60e3);
  assert.ok(!H0.msgs(H).includes("SAFETY CAR IN THIS LAP"));
  assert.ok(S.control.sc.lastLap);
  const finOrder = S.cars.slice().sort((a, b) => a.fin.t - b.fin.t).map((c) => c.num).join(",");
  assert.equal(finOrder, ord, "no overtaking to the flag");
});

test("determinism: the same seed and inputs → the same control state; a save/load round trip of the state continues identically", async () => {
  const go = async (seed) => { const H = await H0.makeRace({ n: 6, seed, totalLaps: 30 }); H0.run(H, 3 * 60e3); H.C.neutralise(H.race, H.T, "sc", { clearMs: 60e3 }); H0.run(H, 4 * 60e3); H.C.neutralise(H.race, H.T, "vsc", { clearMs: 30e3 }); H0.run(H, 2 * 60e3); return H; };
  const a = await go(11), b = await go(11), c = await go(12);
  assert.equal(JSON.stringify(a.race.state), JSON.stringify(b.race.state));
  assert.notEqual(JSON.stringify(a.race.state.control.start), JSON.stringify(c.race.state.control.start));
  // restore: state through JSON, streams saved / loaded, cache rebuilt
  const { Streams } = await H0.imp("engine/rng.js");
  const saved = JSON.stringify({ s: a.race.state, r: a.race.rng.save() });
  const z = JSON.parse(saved), r2 = { ...a, race: { ...a.race, state: z.s, rng: Streams.load(z.r), cache: { prof: a.race.cache.prof, boxes: JSON.parse(JSON.stringify(a.race.cache.boxes)) } } };
  H0.run(a, 3 * 60e3); H0.run(r2, 3 * 60e3);
  assert.equal(JSON.stringify(r2.race.state), JSON.stringify(a.race.state));
});
