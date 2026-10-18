// The support cars and the rear-of-grid official (support.js): the safety car from its own feed or parked – never two;
// a VSC sends no car; the medical car and the official reproductions around a standing start only; models by event.
const test = require("node:test");
const assert = require("node:assert");
const load = () => import("../src/renderer/support.js");

test("safety car: on track from its feed, else parked in a race; never both; a VSC makes no car", async () => {
  const { supportPlan } = await load();
  const on = supportPlan({ t: 5000, status: "4", sc: { 243: [100, 200, 0], 241: [0, 0, 0] }, race: true });
  assert.deepStrictEqual([on.sc.mode, on.sc.num, on.sc.from], ["track", "243", "data"]);
  const vsc = supportPlan({ t: 5000, status: "6", sc: {}, race: true });
  assert.deepStrictEqual([vsc.sc.mode, vsc.vsc], ["parked", true], "VSC: the car stays parked");
  assert.strictEqual(supportPlan({ t: 5000, status: "1", sc: {}, race: false }).sc, null, "not a race: none drawn");
  assert.strictEqual(supportPlan({ t: 5000, sc: { 242: [0, 0, 0] }, race: true }).sc.mode, "parked", "zeros are no place");
});

test("medical car and official: around the race's standing start only, the order kept; replayable at any moment", async () => {
  const { supportPlan, SUPPORT } = await load();
  const L = 300000, start = { t: L, standing: true }, at = (t, x = {}) => supportPlan({ t, start, race: true, ...x });
  assert.strictEqual(at(10000).medical.mode, "parked");
  assert.strictEqual(at(L - 10000).medical.mode, "gridRear");
  assert.strictEqual(at(L).medical.mode, "following");
  assert.strictEqual(at(L + 60000, { lap1End: L + 90000 }).medical.mode, "following");
  assert.strictEqual(at(L + 95000, { lap1End: L + 90000 }).medical.mode, "parked", "into the pits at the lap's end");
  assert.strictEqual(at(L + SUPPORT.medLap + 1).medical.mode, "unknown", "no lap end in the data: not followed forever, not parked on a guess");
  assert.strictEqual(at(L + SUPPORT.medLap + 1, { lap: 3 }).medical.mode, "parked", "by lap 3 it is back");
  assert.ok([at(10000), at(L + 50000)].every((p) => p.medical.from === "reproduction"));
  // the official: the flag, then off the track – gone before the lights (≥ 6 s before lights out) and after
  assert.strictEqual(at(L - 18000).official.phase, "flag");
  assert.strictEqual(at(L - 13000).official.phase, "leave");
  assert.strictEqual(at(L - 11000).official, null);
  assert.strictEqual(at(L + 1).official, null);
  assert.ok(-SUPPORT.leave[1] > 6000, "off the track before the first light");
  // a start that isn't a standing one (behind the safety car, unknown): no official, the medical car parked
  const roll = supportPlan({ t: 99000, start: { t: 100000, standing: null }, race: true });
  assert.deepStrictEqual([roll.official, roll.medical.mode], [null, "parked"]);
  // the same moment gives the same answer whatever was shown before (seek, speed)
  assert.deepStrictEqual(at(L + 50000), at(L + 50000));
});

test("support models: by season and event from sources; unknown events neutral, never another year's model", async () => {
  const { supportModels } = await load();
  assert.deepStrictEqual([supportModels(2026, 2, "2026-07-05").sc, supportModels(2026, 4, "2026-07-26").sc], ["amgGtBlack", "amgGt63Pro"]);
  assert.strictEqual(supportModels(2026, 2, null).sc, "amgGtBlack");
  assert.strictEqual(supportModels(2025, 15).sc, "amgGtBlack");
  assert.deepStrictEqual([supportModels(2025, 149).sc, supportModels(2025, 149).medical], ["vantage", "dbx707"]);
  assert.strictEqual(supportModels(2025, 55).sc, "vantageS");
  assert.deepStrictEqual([supportModels(2025, 2).sc, supportModels(2024, 2).sc], [null, null]);
});

// v0.38 (review of v0.37): the support cars' places checked against 55 cached sessions – one number at a time, exactly
// while TrackStatus is "4"; Monaco 2026 had three SC periods and no place at all
test("safety car: out but no place → not drawn (not parked); a stale place isn't 'where it is'; others' roles unknown", async () => {
  const { supportPlan, pickSupport, SUPPORT } = await load();
  assert.strictEqual(supportPlan({ t: 1, status: "4", sc: {}, race: true }).sc.mode, "unseen");
  // the last sample 3 s old (CarTracks holds it 4 s): no longer on track
  const stale = supportPlan({ t: 1, status: "1", sc: { 241: [5, 5, 0] }, ages: { 241: 3000 }, race: true });
  assert.strictEqual(stale.sc.mode, "parked");
  // a place while the status isn't SC (never seen in the data): a support car, role not known
  const odd = supportPlan({ t: 1, status: "1", sc: { 242: [5, 5, 0] }, ages: { 242: 100 }, race: true });
  assert.deepStrictEqual([odd.sc.mode, odd.sc.role], ["track", "unknown"]);
  assert.strictEqual(supportPlan({ t: 1, status: "1", scRecent: true, sc: { 242: [5, 5, 0] }, ages: { 242: 100 }, race: true }).sc.role, "sc", "just after the SC period: still the SC");
  // several at once: the freshest, then the lowest number – not the first key
  assert.deepStrictEqual(pickSupport({ 243: [1, 1], 241: [2, 2], 242: [3, 3] }, { 243: 100, 241: 400, 242: 100 }), { num: "242", pos: [3, 3], others: ["243", "241"] });
  assert.strictEqual(pickSupport({ 243: [1, 1] }, { 243: SUPPORT.fresh + 1 }), null);
});

test("safety car: from its last place by the pit lane on to its parking place, then parked – not a jump", async () => {
  const { supportPlan, SUPPORT } = await load();
  const last = { num: "243", t: 100000, laneU: 40 }, at = (t) => supportPlan({ t, status: "1", scLast: last, parkU: 340, race: true }).sc;
  assert.deepStrictEqual([at(100000).mode, at(100000).leg, at(100000).u], ["returning", "lane", 40]);
  const mid = at(110000); assert.strictEqual(mid.mode, "returning"); assert.ok(Math.abs(mid.u - (40 + SUPPORT.laneSpeed * 10)) < 1e-6);
  assert.strictEqual(at(100000 + 300 / SUPPORT.laneSpeed * 1000 + 1).mode, "parked");
  // its place ended away from the pit lane (data cut off, a red flag): parked, an estimate – no path made up
  assert.strictEqual(supportPlan({ t: 100500, status: "5", scLast: { num: "241", t: 100000, laneU: null, toEntry: null }, parkU: 340, race: true }).sc.mode, "parked");
  // ended on the track 220 m before the pit entry (Suzuka, Baku…): along the track, then the lane, then parked
  const tr = { num: "243", t: 0, laneU: null, toEntry: 220 }, on = (t) => supportPlan({ t, status: "1", scLast: tr, parkU: 340, race: true }).sc;
  assert.deepStrictEqual([on(5000).mode, on(5000).leg, on(5000).s], ["returning", "track", SUPPORT.trackSpeed * 5]);
  const k = 220 / SUPPORT.trackSpeed * 1000;
  assert.deepStrictEqual([on(k + 2000).leg, Math.round(on(k + 2000).u)], ["lane", Math.round(SUPPORT.laneSpeed * 2)]);
  assert.strictEqual(on(k + 336 / SUPPORT.laneSpeed * 1000 + 1).mode, "parked");
});

test("medical car, live: the first lap's end comes in later – provisional, then final; into the pit lane, then parked", async () => {
  const { supportPlan, SUPPORT } = await load();
  const L = 300000, start = { t: L, standing: true }, base = { start, race: true, parkU: 300 };
  // live, 60 s after the start: the lap's end not in yet – following, provisional
  let p = supportPlan({ ...base, t: L + 60000, lap1: { t: null, final: false } });
  assert.deepStrictEqual([p.medical.mode, p.medical.provisional], ["following", true]);
  // 100 s: the data now has the end at 95 s – entering the pit lane from there (not stuck as unknown)
  p = supportPlan({ ...base, t: L + 100000, lap1: { t: L + 95000, final: true } });
  assert.strictEqual(p.medical.mode, "entering"); assert.ok(Math.abs(p.medical.u - SUPPORT.laneSpeed * 5) < 1e-6);
  p = supportPlan({ ...base, t: L + 95000 + 300 / SUPPORT.laneSpeed * 1000, lap1: { t: L + 95000, final: true } });
  assert.strictEqual(p.medical.mode, "parked");
  // a long first lap (an SC on lap 1): the cap is no fact – past it, unknown until lap 3; the lap's end when it comes wins
  assert.strictEqual(supportPlan({ ...base, t: L + 170000, lap1: { t: null, final: false }, lap: 1 }).medical.mode, "unknown");
  assert.strictEqual(supportPlan({ ...base, t: L + 170000, lap1: { t: L + 180000, final: true }, lap: 1 }).medical.mode, "following");
});

// the medical car's lap: found in positions that come in bit by bit (live) – not only from a whole record at once
test("medical car's lap 1 end from positions arriving bit by bit; the last car retiring hands over to the next", async () => {
  const { medicalLap1, followTarget } = await load();
  const L = 100000, entry = { x: 0, z: 0 };
  // two starters on a 1 km loop: 20 (last on the grid) retires at 60 s; 7 runs on, at the pit entry at 95 s after the start
  const loop = (frac) => ({ x: Math.cos(frac * 2 * Math.PI) * 159 - 159, z: Math.sin(frac * 2 * Math.PI) * 159 });
  const track = { 7: (tau) => loop(((tau - L) / 95000) % 1), 20: (tau) => (tau < L + 60000 ? loop(((tau - L - 1500) / 95000 + 1) % 1) : loop((58500 / 95000) % 1)) };
  const mk = (dataEnd) => ({ L, order: ["20", "7"], dataEnd, pos: (num, tau) => (tau > dataEnd || tau < L - 5000 ? null : track[num](tau)), inLane: () => false, nearEntry: (p) => Math.hypot(p.x - entry.x, p.z - entry.z) < 30 });
  // after 20 retired the medical car follows 7
  assert.strictEqual(followTarget(mk(Infinity), L + 30000).num, "20");
  assert.strictEqual(followTarget(mk(Infinity), L + 70000).num, "7", "20 stopped: the next one up");
  // live: positions in up to 60 s – not decided yet (provisional), then in up to 100 s – found, final
  const steps = [L + 60000, L + 80000, L + 100000, L + 400000].map((e) => medicalLap1(mk(e)));
  assert.deepStrictEqual(steps.slice(0, 2).map((r) => r.final), [false, false]);
  assert.strictEqual(steps[2].final, true);
  assert.ok(steps[2].t > L + 94000 && steps[2].t < L + 100000, "the lap's end, lag after 7 passed the entry: " + steps[2].t);
  assert.deepStrictEqual(steps[3], steps[2], "more data later: the same answer");
  // no car reaches the entry within the window (positions stop at 30 s, a replay): final, no time
  assert.deepStrictEqual(medicalLap1({ ...mk(Infinity), pos: (num, tau) => (tau > L + 30000 ? null : track[num](tau)) }), { t: null, final: true });
});

test("support car models (v0.39): each its own outline, the wheels in arches at the spec's wheelbase, separate turning pivots", async () => {
  const { makeSupportCar, SUPPORT_CARS, bodyBottom, wheelPlaces } = await import("../src/renderer/support3d.js");
  const THREE = await import("../src/renderer/vendor/three.module.js");
  for (const id of Object.keys(SUPPORT_CARS)) {
    const s = SUPPORT_CARS[id], car = makeSupportCar(id), u = car.userData;
    assert.strictEqual(u.wheels.length, 4, id);
    const W = wheelPlaces(s);
    assert.ok(Math.abs(W.zf - W.zr - s.WB) < 1e-9, id + " wheelbase");
    // the body's box: the spec's length and width (±4 cm: bevels, mirrors not drawn), height ≤ spec + light bar
    const box = new THREE.Box3(); car.children.filter((o) => o.isMesh).forEach((m) => box.expandByObject(m));
    assert.ok(Math.abs(box.max.z - box.min.z - s.L) < 0.12, id + " length " + (box.max.z - box.min.z));
    assert.ok(box.max.x - box.min.x <= s.W + 0.06 && box.max.x - box.min.x > s.W * 0.9, id + " width " + (box.max.x - box.min.x));
    assert.ok(box.max.y < s.H + 0.16, id + " height " + box.max.y);
    // an arch over each wheel: the outline's points over the axle sit above the tyre
    const over = (z) => bodyBottom(s, (s.L / 2 - z) / s.L);
    assert.ok(over(W.zf) > s.RF * 2, id + " front arch"); assert.ok(over(W.zr) > s.RR * 2, id + " rear arch");
    u.setSpin(1.2, 0.7);
    assert.deepStrictEqual(u.wheels.map((w) => +w.rotation.x.toFixed(2)), [1.2, 1.2, 0.7, 0.7]);
  }
  // models differ: the SUV is tall, the 4-door long, the coupés short and low
  assert.ok(SUPPORT_CARS.dbx707.H > 1.6 && SUPPORT_CARS.amgGt63s.L > 5 && SUPPORT_CARS.amgGtBlack.H < 1.3);
});
