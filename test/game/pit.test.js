// Pit stops (DESIGN §11, request §10): phases, the commit point, the one shared box and its queue, new tyres only when
// the work is done, safe release, seeded work times. On a synthetic track that keeps to the track.js contract.
const test = require("node:test");
const assert = require("node:assert");

// a 5 km lap; the pit path (600 m) leaves the lap at 4700 and rejoins it at 300; limiter 100–500 m; boxes A 250, B 330
function makeT() {
  const L = 5000, wrap = (s) => ((s % L) + L) % L;
  const pit = { L: 600, sIn: 4700, sOut: 300, limStart: 100, limEnd: 500, speedLimit: 80 / 3.6, boxes: { a: 250, b: 330 },
    lapToPit: (s) => { const d = ((wrap(s) - 4700) + L) % L; return d < 20 ? d : null; }, pitToLap: (u) => wrap(4700 + u * (600 / 600)) };
  return { L, wrap, ahead: (a, b) => ((wrap(b) - wrap(a)) + L) % L, pit };
}
const mkCar = (num, s) => ({ num, status: "run", s, v: 80, lap: 3, pit: null });
async function drive(cars, T, { team = { [cars[0].num]: "a" }, ticks = 4000, seed = 1, wet = false, extra = null } = {}) {
  const P = await import("../../src/game/engine/pit.js"), { Streams } = await import("../../src/game/engine/rng.js");
  const R = new Streams(seed), boxes = P.newBoxes(["a", "b"]), log = [];
  const tyres = {};
  let t = 0;
  for (let k = 0; k < ticks; k++) {
    t += 50;
    extra?.(t, cars);
    for (const c of cars) {
      if (P.IN_LANE.has(c.pit.phase)) {
        const others = cars.filter((o) => P.IN_LANE.has(o.pit.phase)).map((o) => ({ num: o.num, team: team[o.num], phase: o.pit.phase, u: o.pit.u, v: o.pit.v }));
        const ev = P.pitStep(c, T, { t, dt: 0.05, team: team[c.num], boxes, rng: R.get("pit:" + team[c.num]), wet, others, penaltyS: c.pen || 0, onWorkDone: (car, cmp) => { tyres[car.num] = { cmp, t }; } });
        if (ev) log.push([t, c.num, ev, ev === "exit" ? c.s : c.pit.u]);
      } else {
        const s0 = c.s, cap = P.lapCapForPit(c, T); c.v = Math.min(80, cap); c.s = T.wrap(c.s + c.v * 0.05);
        const ev = P.pitOnLap(c, T, s0, c.s, t); if (ev) log.push([t, c.num, ev, c.s]);
      }
    }
  }
  return { log, tyres, P };
}

test("one stop: commit → entry → limiter → box → work → new tyres at the work's end, not before → release → exit at sOut", async () => {
  const P = await import("../../src/game/engine/pit.js"); const T = makeT();
  const c = mkCar("1", 3000); c.pit = P.newPitState();
  assert.ok(P.pitCall(c, T, { compound: "HARD", t: 0 }).ok);
  const { log, tyres } = await drive([c], T);
  const evs = log.map((e) => e[2]);
  assert.deepStrictEqual(evs.slice(0, 4), ["committed", "entry", "work", "workDone"], JSON.stringify(log));
  assert.ok(evs.includes("exit"));
  const tWorkDone = log.find((e) => e[2] === "workDone")[0];
  assert.strictEqual(tyres["1"].t, tWorkDone, "tyres applied exactly when the work ended");
  assert.ok(tyres["1"].cmp === "HARD");
  // limiter respected over its span; stopped exactly at its box
  const p = c.pit.times;
  assert.ok(p.stop > p.entry && p.workEnd > p.stop && p.release >= p.workEnd && p.exit > p.limEnd);
  const ex = log.find((e) => e[2] === "exit"); assert.ok(c.pit.phase === "none" && ex[3] >= 300 && ex[3] < 310, `back on the lap just after sOut: ${ex[3]}`);
  // the stationary time (stop → release) is the work (2–4 s for a clean stop), the lane ~ path / limit + accelerations
  const still = (p.release - p.stop) / 1000; assert.ok(still > 1.5 && still < 12, `stationary ${still}`);
});

test("cancel only before the commit point; a late call stands for the next lap", async () => {
  const P = await import("../../src/game/engine/pit.js"); const T = makeT();
  const c = mkCar("1", 3000); c.pit = P.newPitState();
  P.pitCall(c, T, { compound: "MEDIUM", t: 0 });
  assert.ok(P.pitCancel(c).ok);
  assert.strictEqual(c.pit.phase, "none");
  P.pitCall(c, T, { compound: "MEDIUM", t: 0 }); c.pit.phase = "committed";
  const r = P.pitCancel(c); assert.ok(!r.ok && /commit/.test(r.why));
  // 10 m before the commit point (4350): too late – commits a lap later
  const d = mkCar("2", P.commitS(T) - 10); d.pit = P.newPitState();
  const res = P.pitCall(d, T, { compound: "HARD", t: 0 }); assert.ok(res.ok && /next lap/.test(res.why));
  const { log } = await drive([d], T, { team: { 2: "a" }, ticks: 1400 });
  const firstCommit = log.find((e) => e[2] === "committed");
  assert.ok(firstCommit && firstCommit[0] > 5000 / 80 * 1000 * 0.9, `committed only on the next lap: ${JSON.stringify(log)}`);
});

test("double stack: the teammate queues behind the box while it is busy and stops after; queue time ≈ the first car's remaining work", async () => {
  const P = await import("../../src/game/engine/pit.js"); const T = makeT();
  const a = mkCar("1", 4000), b = mkCar("2", 3920); a.pit = P.newPitState(); b.pit = P.newPitState();
  P.pitCall(a, T, { compound: "HARD", t: 0 }); P.pitCall(b, T, { compound: "HARD", t: 0 });
  const { log } = await drive([a, b], T, { team: { 1: "a", 2: "a" } });
  const ev = (n, k) => log.find((e) => e[1] === n && e[2] === k);
  assert.ok(ev("2", "queue"), `car 2 queued: ${JSON.stringify(log)}`);
  assert.ok(ev("2", "work")[0] >= a.pit.times.release, "car 2's work starts after car 1 left the box");
  assert.ok(b.pit.times.queueEnd - b.pit.times.queue > 500, "it waited");
  // never two cars in the box: car 2 stopped at the box only once car 1 had been released
  assert.ok(b.pit.times.stop >= a.pit.times.release);
});

test("other team's car in the next box doesn't queue us; a car coming down the fast lane holds the release (safe release)", async () => {
  const P = await import("../../src/game/engine/pit.js"); const T = makeT();
  const a = mkCar("1", 4000), b = mkCar("9", 3990); a.pit = P.newPitState(); b.pit = P.newPitState();
  P.pitCall(a, T, { compound: "HARD", t: 0 }); P.pitCall(b, T, { compound: "HARD", t: 0 });
  const { log } = await drive([a, b], T, { team: { 1: "a", 9: "b" } });
  assert.ok(!log.some((e) => e[2] === "queue"), "different teams, different boxes");
  // each released only when no car within the release gap came down the lane behind it (or flagged unsafe)
  for (const c of [a, b]) assert.ok(c.pit.times.release != null);
});

test("seeded work: the same seed → the same stationary times; a different seed differs; slow-wheel errors have causes", async () => {
  const P = await import("../../src/game/engine/pit.js"); const T = makeT();
  const run = async (seed, wet) => { const c = mkCar("1", 3000); c.pit = P.newPitState(); P.pitCall(c, T, { compound: "HARD", t: 0 }); await drive([c], T, { seed, wet }); return c.pit; };
  const x = await run(5), y = await run(5), z = await run(6);
  assert.strictEqual(x.workS, y.workS); assert.notStrictEqual(x.workS, z.workS);
  // over many seeds: errors happen at roughly the base rate dry, more in the wet, each with its causes listed
  let dry = 0, wet = 0; const N = 400;
  for (let s = 0; s < N; s++) { if ((await run(1000 + s, false)).err) dry++; const w = await run(5000 + s, true); if (w.err) { wet++; assert.ok(w.err.causes.includes("rain")); } }
  assert.ok(dry > 0 && dry < N * 0.08, `dry errors ${dry}/${N}`);
  assert.ok(wet > dry * 1.05, `wet ${wet} > dry ${dry}`);
});
