// v0.55: game cars are never put sideways in one step, and a follower no longer arrives at a corner faster than its own
// grip allows.
//   What v0.54 did (reports/hop.md): two cars nose to tail in ONE lane that came within a body length + clearance were
//   treated as "beside" each other, and whichever was looked at first was moved a width + clearance aside at once – 2.3 m
//   in one 50 ms step, 63 times in a Hungary race (seed 3), the first two at 82.65 s and 83.55 s into the last corner of
//   lap 1. That move stood in for a rear contact. The contacts came from the look-ahead envelope: a follower planned its
//   braking with the downforce it had at that moment, the cars closed up as the field slowed (one time gap = fewer metres),
//   the wake got stronger and the envelope sank under a car already braking at its limit.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const load = (id) => JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game", id + ".scenario.json"), "utf8"));
const HUN = "2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race", MC = "2025-05-25_Monaco_Grand_Prix_2025-05-25_Race", MON = "2025-09-07_Italian_Grand_Prix_2025-09-07_Race", JPN = "2025-04-06_Japanese_Grand_Prix_2025-04-06_Race";
// a scenario with only these cars, in this order on the grid (first = ahead), `gap` m apart on the reference line (traffic.test.js)
function subset(sc, nums, gap = 12) {
  const s = JSON.parse(JSON.stringify(sc)), p0 = sc.grid.slots.find((g) => g.pos === 1);
  s.entries = s.entries.filter((e) => nums.includes(e.num));
  s.grid = { slots: nums.map((n, i) => ({ pos: i + 1, num: n, s: ((p0.s - i * gap) % sc.track.L + sc.track.L) % sc.track.L, d: 0.1 })), pitLane: [] };
  return s;
}
const live = (c) => c.status === "run" && c.where === "lap";
const DT = 0.05;

// every step: how much further a car moved across the road than its racing line's own shift plus the lateral rate allows
async function run(id, seed, untilMs) {
  const E = await import("../../src/game/engine/engine.js"), { vlimAt } = await import("../../src/game/engine/profile.js");
  const r = E.createRace({ scenario: load(id), seed }), T = r.cache.T, before = new Map();
  const out = { hop: 0, hopAt: null, over: 0, overAt: null, race: r };
  while (r.state.t < untilMs) {
    before.clear();
    for (const c of r.state.cars) if (live(c)) before.set(c.num, { d: c.d, e: c.traffic.e });
    E.step(r);
    const tc = r.cache.tc, P = tc.P;
    for (const c of r.state.cars) {
      if (!live(c)) continue;
      const b = before.get(c.num); if (!b) continue;                      // (came onto the lap this step)
      const line = T.at(T.line, c.s), lo = -T.at(T.wR, c.s) + tc.wid / 2, hi = T.at(T.wL, c.s) - tc.wid / 2;
      const dLine = Math.max(lo, Math.min(hi, line + b.e));               // where its racing line alone has it now
      const rate = Math.min(P.vLat, P.vLatFrac * Math.max(c.v, 5)) * DT;
      const extra = Math.abs(c.d - b.d) - Math.abs(dLine - b.d) - rate;
      if (extra > out.hop) { out.hop = extra; out.hopAt = `car ${c.num} t=${r.state.t} s=${c.s.toFixed(0)} d ${b.d.toFixed(2)} → ${c.d.toFixed(2)}`; }
      // above its own envelope (the free one: no wake, no lane) while following a car
      const over = c.v - vlimAt(r.cache.profiles[c.num].prof, r.cache.PT, c.s);
      if (c.traffic.capWhy === "follow" && over > out.over) { out.over = over; out.overAt = `car ${c.num} t=${r.state.t} s=${c.s.toFixed(0)} v ${c.v.toFixed(1)}`; }
    }
  }
  return out;
}

test("no car is put sideways in one step, and no follower reaches the car ahead: Hungary 2025, lights out to 6 min", async () => {
  const o = await run(HUN, 3, 6 * 60e3), ts = o.race.state.tstats;
  // (v0.54: 2.1 m beyond its line and the lateral rate at 82.65 s; what is left are cars side by side following the
  // racing line across the road a few metres apart – one waits for the other, a few tenths of a metre)
  assert.ok(o.hop < 0.5, `a car moved ${o.hop.toFixed(2)} m further across the road in one step than its line and the lateral rate allow (${o.hopAt})`);
  assert.strictEqual(ts.overlaps, 0, `${ts.overlaps} rear contacts`);
  assert.strictEqual(ts.overlaps, o.race.state.log.filter((e) => e.type === "contact").length, "every contact is logged");
});

test("a follower stays inside its own grip into the corner (it plans with the wake it will be in there)", async () => {
  const o = await run(HUN, 3, 3 * 60e3);
  // (v0.54: 5.2 m/s above its own free envelope at the apex of the last corner on lap 1 – car 43 behind 55 at 82.6 s)
  assert.ok(o.over < 1.5, `a following car was ${o.over.toFixed(1)} m/s above its own envelope (${o.overAt})`);
  // the plan is never for less wake than the car is in
  for (const c of o.race.state.cars) if (live(c)) assert.ok((c.traffic.dirtyPlan ?? 0) >= c.traffic.dirty - 1e-12, `car ${c.num}: planned wake ${c.traffic.dirtyPlan} < present ${c.traffic.dirty}`);
});

test("Monaco, lights out to 3 min: the field goes through the first lap's slow corners without a jump or a rear contact", async () => {
  // (v0.54: the queue into Mirabeau and the hairpin on lap 1 was sorted out by sideways jumps – 121 of ≥ 1 m in the race.
  // Without them, and before the follower's look-ahead: twelve rear contacts in a row at 34–37 s, closing speeds to 27 m/s)
  const o = await run(MC, 3, 3 * 60e3), ts = o.race.state.tstats;
  assert.ok(o.hop < 0.5, `a car moved ${o.hop.toFixed(2)} m further across the road in one step than its line and the lateral rate allow (${o.hopAt})`);
  assert.strictEqual(ts.overlaps, 0, `${ts.overlaps} rear contacts`);
  assert.ok(o.over < 1.5, `a following car was ${o.over.toFixed(1)} m/s above its own envelope (${o.overAt})`);
});

test("the look-ahead: none for a car alone; behind a car it holds the braking zone of the slowest corner, not only its apex", async () => {
  const E = await import("../../src/game/engine/engine.js");
  // alone: the pass is the envelope's own (same grip, same lateral load, same samples) – it sets nothing
  { const r = E.createRace({ scenario: subset(load(MC), ["16"]), seed: 1 }); let caps = 0;
    for (let i = 0; i < 100 * 20; i++) { E.step(r); if (r.cache.tc.capWin["16"]) caps++; }
    assert.strictEqual(caps, 0, `a car alone on the racing line had a look-ahead cap on ${caps} steps`); }
  // behind a car, on the way into the hairpin (the lap's slowest point): from the follower to the apex most samples are
  // capped below its free envelope. v0.54 capped the apex only: its pass took the lateral load one sample early, came out
  // above the envelope in the braking zone and was dropped there
  const r = E.createRace({ scenario: subset(load(MC), ["16", "4"], 14), seed: 1 }), T = r.cache.T, tc = r.cache.tc;
  const f = r.state.cars.find((c) => c.num === "4"), l = r.state.cars.find((c) => c.num === "16");
  const vb = r.cache.profiles["4"].prof.vb; let j0 = 0; for (let j = 0; j < T.n; j++) if (vb[j] < vb[j0]) j0 = j;
  const apex = j0 * T.ds; let seen = null;
  for (let i = 0; i < 100 * 20 && !seen; i++) {
    E.step(r);
    const d = T.ahead(f.s, apex), gap = T.ahead(f.s, l.s) - tc.len;
    if (f.status === "run" && d > 20 && d < 45 && gap > 0 && gap < 25) {
      const cap = tc.caps["4"], vbF = r.cache.profiles["4"].prof.vb; let n = 0, capped = 0;
      for (let j = T.idx(f.s) + 2; j < j0; j++) { n++; if (cap[j] < vbF[j] - 0.1) capped++; }
      seen = { n, capped, d, gap, t: r.state.t };
    }
  }
  assert.ok(seen, "the follower came to the hairpin behind the other car");
  assert.ok(seen.capped >= 0.6 * seen.n, `only ${seen.capped} of ${seen.n} samples before the apex capped (${JSON.stringify(seen)})`);
});

test("team order 'swap': nobody slows to a crawl while the place is given, and it is given once", async () => {
  // (v0.54 without the sideways jump: the car letting the other by ran 2.5 m/s slower than it while that car was held
  // behind it, or dropping back from a corner it had lost – both down to 3–5 m/s for a minute; and "the car ahead"
  // lets the other by, read every step, gave the place back as soon as the other's nose was in front)
  const E = await import("../../src/game/engine/engine.js");
  const r = E.createRace({ scenario: subset(load(MON), ["4", "81"], 14), seed: 1, driverParams: { 4: { compliance: 1 }, 81: { compliance: 1 } } });
  const a = r.state.cars.find((c) => c.num === "4"), b = r.state.cars.find((c) => c.num === "81");
  for (let i = 0; i < 40 * 20; i++) E.step(r);
  const ahead = a.dist > b.dist ? a : b, behind = ahead === a ? b : a;
  E.command(r, { id: "to1", type: "teamOrder", team: a.teamKey, args: { policy: "swap" }, by: "player" });
  let swapped = null, vMin = Infinity;
  for (let i = 0; i < 90 * 20; i++) {
    E.step(r); vMin = Math.min(vMin, a.v, b.v);
    if (swapped == null && behind.dist > ahead.dist + r.cache.tc.len) swapped = i / 20;
  }
  assert.ok(swapped != null && swapped < 60, `swapped after ${swapped} s`);
  assert.ok(vMin > 15, `a car slowed to ${vMin.toFixed(1)} m/s`);            // (Monza's slowest corner is ≈ 19 m/s)
  assert.ok(behind.dist > ahead.dist, "the place stays given");
  assert.strictEqual(r.state.log.filter((e) => e.type === "teamOrderDone").length, 1, "the order is done once");
  assert.strictEqual(r.state.teamOrders[a.teamKey].from, ahead.num, "who lets whom by was fixed when the order applied");
});

test("a car that spins in a corner is gone round by the whole train behind it – no contact, no jump, nobody stops behind it", async () => {
  // (as incidents.js sets a spin: car.inc = { kind: "spin", vCap: 0, problem: true }. v0.54 took the cars past it with
  // the sideways jump; without it the car directly behind went round it only once it was below 3 m/s, on the side its
  // racing-line rule picked – against the edge – and the next two ran into the queue: 15, 10 and 5 m/s)
  const E = await import("../../src/game/engine/engine.js");
  // (Hungary, a train of four: the last corner, Turn 1, the middle sector. Suzuka's Esses, a car 0.9 s behind: the spun
  // car keeps to its line while it stops and ends at the right-hand apex – the side with the room when it spun is not
  // the side with the room where it stands; the car behind chose once, stopped against the edge behind it or hit it)
  const train = ["10", "27", "23", "22"], pair = ["87", "22"];
  for (const [id, s0, nums, gap] of [[HUN, 3750, train, 12], [HUN, 620, train, 12], [HUN, 2300, train, 12], [JPN, 765, pair, 60], [JPN, 740, pair, 60]]) {
    const r = E.createRace({ scenario: subset(load(id), nums, gap), seed: 1 }), T = r.cache.T, tc = r.cache.tc;
    const car = (n) => r.state.cars.find((c) => c.num === n), lead = car(nums[0]), before = new Map();
    let spunAt = null, vMin = Infinity, hop = 0;
    for (let i = 0; i < 200 * 20; i++) {
      before.clear(); for (const c of r.state.cars) if (live(c)) before.set(c.num, { d: c.d, e: c.traffic.e });
      E.step(r);
      if (spunAt == null && r.state.t > 20000 && lead.s > s0 && lead.s < s0 + 12) { spunAt = r.state.t; lead.inc = { kind: "spin", until: r.state.t + 6000, vCap: 0, problem: true }; }
      if (spunAt == null) continue;
      for (const n of nums.slice(1)) {
        const c = car(n), b = before.get(n); if (c.v < vMin) vMin = c.v;
        const line = T.at(T.line, c.s), lo = -T.at(T.wR, c.s) + tc.wid / 2, hi = T.at(T.wL, c.s) - tc.wid / 2, dLine = Math.max(lo, Math.min(hi, line + b.e));
        hop = Math.max(hop, Math.abs(c.d - b.d) - Math.abs(dLine - b.d) - Math.min(tc.P.vLat, tc.P.vLatFrac * Math.max(c.v, 5)) * DT);
      }
      if (r.state.t - spunAt >= 8000) break;
    }
    const at = `${id.slice(11, 14)} s ${s0}`;
    assert.ok(spunAt != null, `${at}: the leading car came by`);
    assert.strictEqual(r.state.tstats.overlaps, 0, `${at}: ${r.state.tstats.overlaps} rear contacts`);
    assert.ok(hop < 0.5, `${at}: a car moved ${hop.toFixed(2)} m across the road in one step beyond its line and the lateral rate`);
    assert.ok(vMin > 15, `${at}: a car behind slowed to ${vMin.toFixed(1)} m/s`);
    for (const n of nums.slice(1)) assert.ok(T.delta(lead.s, car(n).s) > tc.len, `${at}: car ${n} is past the spun car 8 s on`);
  }
});
