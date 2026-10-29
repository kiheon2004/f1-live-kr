// Car-to-car interaction (src/game/engine/traffic.js; request §9, §15, §19): body geometry invariants every step,
// positions change only by moving, passing depends on pace and circuit, the three straight-line systems (DRS / Active
// Aero / Overtake) stay separate and appear only where the rules allow, the wake acts where its cause acts, blue flags,
// team orders, the pit-exit merge, the traffic time account against a solo counterfactual, order independence.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const FIX = path.join(__dirname, "../fixtures/game");
const load = (id) => JSON.parse(fs.readFileSync(path.join(FIX, id + ".scenario.json"), "utf8"));
const HUN = "2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race", MON = "2025-09-07_Italian_Grand_Prix_2025-09-07_Race", MC = "2025-05-25_Monaco_Grand_Prix_2025-05-25_Race";
const GB = "2025-07-06_British_Grand_Prix_2025-07-06_Race", GB26 = "2026-07-05_British_Grand_Prix_2026-07-05_Race";
const eng = () => import("../../src/game/engine/engine.js");
const trf = () => import("../../src/game/engine/traffic.js");

// a scenario with only these cars, in this order on the grid (first = ahead), `gap` m apart on the reference line
function subset(sc, nums, gap = 12) {
  const s = JSON.parse(JSON.stringify(sc)), p0 = sc.grid.slots.find((g) => g.pos === 1);
  s.entries = s.entries.filter((e) => nums.includes(e.num));
  s.grid = { slots: nums.map((n, i) => ({ pos: i + 1, num: n, s: ((p0.s - i * gap) % sc.track.L + sc.track.L) % sc.track.L, d: 0.1 })), pitLane: [] };
  return s;
}
const live = (c) => c.status === "run" && c.where === "lap";
// the body-rectangle and road invariants on the field as it is now
function checkBodies(race, T, where) {
  const tc = race.cache.tc, L = race.state.cars.filter(live);
  for (const c of L) {
    const lo = -T.at(T.wR, c.s) + tc.wid / 2 - 1e-6, hi = T.at(T.wL, c.s) - tc.wid / 2 + 1e-6;
    assert.ok(c.d >= lo && c.d <= hi, `${where}: car ${c.num} off the road: d ${c.d.toFixed(3)} not in [${lo.toFixed(2)}, ${hi.toFixed(2)}]`);
    for (const o of L) if (o !== c && Math.abs(T.delta(o.s, c.s)) < tc.len && Math.abs(o.d - c.d) < tc.wid)
      assert.fail(`${where}: bodies of ${c.num} and ${o.num} overlap (Δs ${T.delta(o.s, c.s).toFixed(2)} m, Δd ${(o.d - c.d).toFixed(2)} m)`);
  }
}

test("invariants every step through the start and 8 minutes of racing (Hungary, Monaco): no two bodies overlap, every car on the road, nobody jumps", async () => {
  const E = await eng();
  for (const id of [HUN, MC]) {
    const r = E.createRace({ scenario: load(id), seed: 3 }), T = r.cache.T;
    for (let i = 0; i < 8 * 60 * 20; i++) {
      const before = new Map(r.state.cars.filter(live).map((c) => [c.num, c.s]));
      E.step(r);
      checkBodies(r, T, `${id} t=${r.state.t}`);
      for (const c of r.state.cars.filter(live)) {
        const s0 = before.get(c.num); if (s0 == null) continue;
        const moved = T.delta(s0, c.s);
        assert.ok(moved >= -r.cache.tc.len && moved <= 100 * 0.05 + 0.5, `${id} car ${c.num} moved ${moved} m in one step`);
      }
    }
    // contacts (a car that could not slow at the lateral limit) are events with causes – and rare
    const ts = r.state.tstats;
    assert.ok(ts.overlaps <= 3, `${id}: ${ts.overlaps} contacts in 8 min`);
    assert.strictEqual(ts.overlaps, r.state.log.filter((e) => e.type === "contact").length, "every contact is logged");
  }
});

test("the order changes only where cars actually move past each other on the road (no swapping)", async () => {
  const E = await eng();
  const r = E.createRace({ scenario: load(HUN), seed: 5 }), T = r.cache.T;
  let changes = 0;
  for (let i = 0; i < 6 * 60 * 20; i++) {
    const prev = new Map(r.state.cars.map((c) => [c.num, { s: c.s, dist: c.dist, lap: live(c) }]));
    E.step(r);
    const L = r.state.cars.filter((c) => live(c) && prev.get(c.num).lap);
    for (const a of L) for (const b of L) {
      if (a === b) continue; const pa = prev.get(a.num), pb = prev.get(b.num);
      if (pa.dist < pb.dist && a.dist > b.dist) {
        changes++;
        // a went past b: on the road, within a step's travel of each other – not a jump in the order
        assert.ok(Math.abs(T.delta(pb.s, pa.s)) < 15 && Math.abs(T.delta(b.s, a.s)) < 15, `order change ${a.num}/${b.num} without passing on the road`);
      }
    }
  }
  assert.ok(changes > 0, "some cars passed in 6 minutes of Hungary");
});

// two cars: a slower car ahead, a faster one 12 m behind; seconds until the faster one is ahead (Infinity = never in `laps`)
// (the advantage: less drag and a little more grip – power alone is capped by the fuel-flow limit, so "+x % power" would
// change nothing)
async function duel(id, nums, { power = 1, laps = 6, seed = 1 } = {}) {
  const E = await eng(), sc = subset(load(id), nums);
  const back = sc.entries.find((e) => e.num === nums[1]).teamKey, front = sc.entries.find((e) => e.num === nums[0]).teamKey;
  const base = (await import("../../src/game/data/params/cars-base.js")).carBase(sc.meta.season);
  const fitted = await import(`../../src/game/data/params/cars-${sc.meta.season}.js`), V = (await import("../../src/game/data/params/param.js")).values;
  const tb = sc.meta.season === 2026 ? fitted.CARS_2026_TABLE : fitted.CARS_2025_TABLE;
  const car = (k) => ({ ...base, ...V(tb[k] || {}) });
  // both cars get the SAME car (the front team's), then the one behind gets less drag and a bit more grip: the only difference
  const same = car(front), carParams = { [front]: same, [back]: { ...same, CdA: same.CdA / power, mu_mech: same.mu_mech * (1 + (power - 1) / 4) } };
  const r = E.createRace({ scenario: sc, seed, carParams, driverParams: { [nums[0]]: { consistency: 1e-6 }, [nums[1]]: { consistency: 1e-6 } } });
  const T = r.cache.T, A = r.state.cars.find((c) => c.num === nums[0]), B = r.state.cars.find((c) => c.num === nums[1]);
  const acctAt = {};
  while (r.state.t < laps * 100000 && A.lap < laps) {
    E.step(r); checkBodies(r, T, `${id} duel t=${r.state.t}`);
    if (acctAt[B.lap] == null) acctAt[B.lap] = B.acct.traffic;
    if (B.dist > A.dist + r.cache.tc.len) return { t: r.state.t / 1000, race: r, A, B, acctAt };
  }
  return { t: Infinity, race: r, A, B, acctAt };
}

test("passing follows pace: a faster car gets by no later than a less fast one, an equal car latest (Monza duels)", async () => {
  const big = await duel(MON, ["10", "31"], { power: 1.12 }), small = await duel(MON, ["10", "31"], { power: 1.03 }), same = await duel(MON, ["10", "31"], { power: 1.0, laps: 4 });
  assert.ok(Number.isFinite(big.t), "12 % less drag passes at Monza");
  assert.ok(big.t <= small.t && small.t <= same.t && big.t < same.t, `passing time falls with the advantage: 12 % ${big.t} s, 3 % ${small.t} s, equal ${same.t} s`);
  // where: on the road the pass completes near a braking zone / straight – the log says where and why
  const ev = big.race.state.log.find((e) => e.type === "overtake"); assert.ok(ev && ev.where && ev.mech, JSON.stringify(ev));
});

test("circuit matters: the same advantage passes at Monza, not (or much later) at Monaco", async () => {
  const mon = await duel(MON, ["10", "31"], { power: 1.06, laps: 6 }), mc = await duel(MC, ["10", "31"], { power: 1.06, laps: 6 });
  assert.ok(Number.isFinite(mon.t), `Monza: passes (${mon.t})`);
  assert.ok(mc.t > mon.t * 1.5, `Monaco later or never: ${mc.t} vs Monza ${mon.t}`);
});

test("traffic account vs a solo run: a car held 5 laps behind a slower team-mate ('hold') – the account matches the real loss", async () => {
  // The account's ghost carries its own tyre / energy state and envelope, so the loss that following causes through the
  // tyres (heat in the wake) and the battery counts too – the comparison with a real solo run of the same car is fair.
  const E = await eng();
  const dp = { 4: { consistency: 1e-6, pace: 0.975 }, 81: { consistency: 1e-6, pace: 0.995 } };
  for (const id of [MC, HUN]) {
    const r = E.createRace({ scenario: subset(load(id), ["4", "81"]), seed: 1, driverParams: dp });
    E.command(r, { id: "h", type: "teamOrder", team: "McLaren", args: { policy: "hold" }, by: "ai" });
    const A = r.state.cars.find((c) => c.num === "4"), B = r.state.cars.find((c) => c.num === "81"), at = {};
    while (B.lap < 6) { E.step(r); if (at[B.lap] == null) at[B.lap] = B.acct.traffic; }
    assert.ok(A.dist > B.dist, "held: no attack on the team-mate");
    const solo = E.createRace({ scenario: subset(load(id), ["81"]), seed: 1, driverParams: dp }), S = solo.state.cars[0];
    while (S.lap < 6) E.step(solo);
    const real = B.laps.slice(1, 6).reduce((a, l) => a + l.t, 0) - S.laps.slice(1, 6).reduce((a, l) => a + l.t, 0), acct = at[6] - at[1];
    assert.ok(real > 1, `${id}: held behind a slower car costs time: ${real.toFixed(2)} s over 5 laps`);
    assert.ok(Math.abs(acct - real) <= 0.1 * real + 0.2, `${id}: account ${acct.toFixed(2)} s vs real ${real.toFixed(2)} s`);
  }
});

test("the wake acts where its cause acts: dirty air (lost downforce) slows a follower more in fast corners than in slow ones", async () => {
  const E = await eng(), T_ = await trf();
  const r = E.createRace({ scenario: subset(load(GB), ["16", "44"], 15), seed: 1 });
  for (let i = 0; i < 400; i++) E.step(r);     // (envelopes computed, cars running)
  const A = r.state.cars.find((c) => c.num === "16"), B = r.state.cars.find((c) => c.num === "44"), T = r.cache.T, tc = r.cache.tc;
  const prof = r.cache.profiles["44"].prof;
  // sweep the pair round the lap: B 12 m behind A on the line; the window's cap vs B's own corner speed at the next apex
  let fast = [], slow = [];
  for (const k of tc.corners) {
    const sB = T.wrap(k.apex - 150);
    A.s = T.wrap(sB + 12 + tc.len); B.s = sB; A.v = B.v = Math.min(80, prof.vb[T.idx(sB)]); A.d = T.at(T.line, A.s); B.d = T.at(T.line, B.s); A.traffic.e = B.traffic.e = 0;
    T_.trafficPre(r, r.state.t);
    const cap = tc.caps["44"], i = T.idx(k.apex), v0 = prof.vb[i], v1 = Number.isFinite(cap[i]) ? cap[i] : v0;
    (v0 > 55 ? fast : v0 < 30 ? slow : []).push(1 - v1 / v0);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(fast.length && slow.length, `fast ${fast.length} slow ${slow.length} corners`);
  assert.ok(mean(fast) > mean(slow), `speed loss fast corners ${mean(fast).toFixed(4)} > slow ${mean(slow).toFixed(4)}`);
  assert.ok(mean(fast) > 0 && mean(fast) < 0.1, "a few per cent, not a wall");
});

test("DRS (2025), Active Aero and Overtake (2026) are separate and appear only where the rules allow", async () => {
  const E = await eng();
  // 2025: a lone leader never has DRS; a follower within 1 s at the detection point opens it in the zone; no Active Aero, no Overtake
  const r = E.createRace({ scenario: subset(load(MON), ["4", "81"], 15), seed: 2 });
  const lead = r.state.cars.find((c) => c.num === "4"), fol = r.state.cars.find((c) => c.num === "81");
  let drsF = 0, drsL = 0, aero25 = 0, ot25 = 0, drsAlone = 0;
  const T5 = r.cache.T;
  while (Math.max(lead.lap, fol.lap) < 4) { E.step(r); const s = E.snapshot(r); for (const c of s.cars) { if (c.drs) { drsF++; const me = r.state.cars.find((x) => x.num === c.num), o = r.state.cars.find((x) => x !== me); if (T5.ahead(me.s, o.s) / Math.max(me.v, 10) > 2.5 || (!T5.zoneOf(T5.zones.drs, me.s) && !T5.zoneOf(T5.zones.drs, me.s - 6))) drsAlone++; /* (state set at the step start) */ } if (c.aero.front) aero25++; if (c.overtake) ot25++; } }
  assert.ok(drsF > 0, "a follower within 1 s used DRS");
  assert.strictEqual(drsAlone, 0, "DRS only inside a DRS zone with the car ahead within reach (detected < 1 s)");
  assert.strictEqual(aero25, 0, "no front-flap (Active Aero) in 2025"); assert.strictEqual(ot25, 0, "no Overtake Mode in 2025");
  // DRS opened only inside a DRS zone
  // 2026: every car gets Straight Mode in the zones (no gap condition), never DRS
  const r6 = E.createRace({ scenario: subset(load(GB26), [load(GB26).entries[0].num]), seed: 2 }), T6 = r6.cache.T;
  let open = 0, outside = 0, drs6 = 0;
  while (r6.state.cars[0].lap < 2) { E.step(r6); const c = E.snapshot(r6).cars[0]; if (c.drs) drs6++; if (c.aero.open) { open++; if (!T6.zoneOf(T6.zones.straight, c.s) && !T6.zoneOf(T6.zones.straight, c.s - 6)) outside++; } }   // (the flap state is set at the step start: up to one step's travel past the zone end)
  assert.ok(open > 0, "a lone 2026 car opens Straight Mode"); assert.strictEqual(outside, 0, "only inside the activation zones"); assert.strictEqual(drs6, 0, "no DRS in 2026");
});

test("blue flags: a lapped car moves aside and lets the leader by; it is logged and the lapping car passes", async () => {
  const E = await eng(), sc = subset(load(MON), ["10", "1"], 40);
  const r = E.createRace({ scenario: sc, seed: 4 }), T = r.cache.T;
  const slow = r.state.cars.find((c) => c.num === "10"), fast = r.state.cars.find((c) => c.num === "1");
  // the car behind is a lap ahead (it has lapped once already)
  for (let i = 0; i < 20; i++) E.step(r);
  fast.lap += 1; fast.dist += T.L;
  let yielded = false, passed = false;
  for (let i = 0; i < 3 * 60 * 20 && !passed; i++) {
    E.step(r); if (slow.traffic.role === "yield" && slow.traffic.kind === "blue") yielded = true;
    if (T.delta(slow.s, fast.s) > r.cache.tc.len && yielded) passed = true;
  }
  assert.ok(yielded, "the lapped car yielded under blue flags");
  assert.ok(r.state.log.some((e) => e.type === "blueFlag" && e.car === "10"), "logged");
  assert.ok(passed, "the leader got by");
});

test("team orders: 'swap' makes the car ahead let its team-mate by (driver obeys); 'hold' stops team-mates attacking each other", async () => {
  const E = await eng(), sc = subset(load(MON), ["4", "81"], 14);   // McLaren team-mates
  const r = E.createRace({ scenario: sc, seed: 1, driverParams: { 4: { compliance: 1 }, 81: { compliance: 1 } } });
  const a = r.state.cars.find((c) => c.num === "4"), b = r.state.cars.find((c) => c.num === "81");
  for (let i = 0; i < 40 * 20; i++) E.step(r);
  const ahead = a.dist > b.dist ? a : b, behind = ahead === a ? b : a;
  E.command(r, { id: "to1", type: "teamOrder", team: a.teamKey, args: { policy: "swap" }, by: "player" });
  let swapped = false;
  for (let i = 0; i < 2 * 60 * 20 && !swapped; i++) { E.step(r); swapped = behind.dist > ahead.dist + r.cache.tc.len; }
  assert.ok(swapped, "positions swapped by the cars moving");
  assert.ok(r.state.log.some((e) => e.type === "teamOrder" && /lets/.test(e.effect)), "the order and its execution are logged");
});

test("pit exit merge: the exit is not clear while a car comes by on the exit side; clear when it has gone", async () => {
  const E = await eng(), T_ = await trf();
  const r = E.createRace({ scenario: subset(load(HUN), ["16", "81"]), seed: 1 }), T = r.cache.T, tc = r.cache.tc;
  for (let i = 0; i < 10; i++) E.step(r);
  const pitCar = r.state.cars.find((c) => c.num === "16"), o = r.state.cars.find((c) => c.num === "81");
  pitCar.where = "pit"; pitCar.pit.phase = "exit"; pitCar.pit.v = 20; pitCar.pit.u = T.pit.L;
  const dExit = (tc.exitSide > 0 ? T.at(T.wL, T.pit.sOut) : -T.at(T.wR, T.pit.sOut)) - Math.sign(tc.exitSide) * tc.wid / 2;
  o.s = T.wrap(T.pit.sOut - 40); o.v = 75; o.d = dExit; o.traffic.e = o.d - T.at(T.line, o.s);
  assert.strictEqual(T_.mergeClear(r, pitCar), false, "a car 40 m back at 75 m/s on the exit side: wait");
  o.s = T.wrap(T.pit.sOut + 200);
  assert.strictEqual(T_.mergeClear(r, pitCar), true, "gone: join");
  o.s = T.wrap(T.pit.sOut - 40); o.d = -dExit; o.traffic.e = o.d - T.at(T.line, o.s);
  assert.strictEqual(T_.mergeClear(r, pitCar), true, "a car on the far side of the road does not block the merge");
});

test("order independence: the cars' order in the state array does not change the race", async () => {
  const E = await eng();
  const fp = (r) => JSON.stringify(r.state.cars.slice().sort((a, b) => (a.num < b.num ? -1 : 1)).map((c) => [c.num, c.s.toFixed(6), c.d.toFixed(6), c.v.toFixed(6), c.traffic.state]));
  const a = E.createRace({ scenario: load(HUN), seed: 7 }), b = E.createRace({ scenario: load(HUN), seed: 7 });
  b.state.cars.reverse();
  for (let i = 0; i < 2400; i++) { E.step(a); E.step(b); }
  assert.strictEqual(fp(a), fp(b));
});
