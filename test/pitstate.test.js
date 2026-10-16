// What a car in the pit lane is doing (pitstate.js), from the data up to the moment shown.
const test = require("node:test");
const assert = require("node:assert");

const base = { u: 100, gStart: 0, gEnd: 300, inPit: true, onLane: true, speed: 20, stillFor: 0, boxU: 200, boxFrom: "order", penalty: null, pitStart: null, race: true, teammateInBox: false, lastBox: null };
const S = async () => (await import("../src/renderer/pitstate.js"));

test("a car standing where it isn't its box stays in the fast lane – slow alone never makes a box", async () => {
  const { pitState } = await S();
  const q = pitState({ ...base, u: 120, speed: 0, stillFor: 9 });
  assert.strictEqual(q.state, "queued"); assert.strictEqual(q.lane, "fast");
  const nb = pitState({ ...base, boxU: null, boxFrom: null, u: 200, speed: 0, stillFor: 3 });
  assert.strictEqual(nb.state, "standing (no box known)"); assert.strictEqual(nb.lane, "fast");
  // slow with no box known: the fast lane too
  assert.strictEqual(pitState({ ...base, boxU: null, u: 190, speed: 5 }).lane, "fast");
});

test("pulling into its box, standing in it, leaving – the way across grows with nearness and slowness, then shrinks with the distance gone", async () => {
  const { pitState } = await S();
  assert.strictEqual(pitState({ ...base, u: 150, speed: 22 }).state, "fast lane");
  const w = [180, 186, 192, 198].map((u, i) => pitState({ ...base, u, speed: [12, 9, 5, 2][i] }).w);
  for (let i = 1; i < w.length; i++) assert.ok(w[i] > w[i - 1], `growing: ${w}`);
  const box = pitState({ ...base, u: 201, speed: 0, stillFor: 2.4 });
  assert.strictEqual(box.state, "in box"); assert.strictEqual(box.w, 1);
  assert.ok(box.evidence.includes("InPit flag") && box.evidence.some((e) => /box \(order\)/.test(e)));
  const out = [203, 212, 222, 233].map((u) => pitState({ ...base, u, speed: 10, lastBox: { endU: 201, ago: 2 } }).w);
  for (let i = 1; i < out.length; i++) assert.ok(out[i] < out[i - 1], `shrinking: ${out}`);
  assert.strictEqual(out[3], 0);
  // a drive-through at the limit past its box: never across
  assert.strictEqual(pitState({ ...base, u: 199, speed: 21, penalty: "drive-through" }).lane, "fast");
  assert.strictEqual(pitState({ ...base, u: 199, speed: 4, penalty: "drive-through" }).state, "drive-through");
});

test("stop-and-go: in its box, the crew holding back; double stack: the second car waits behind the box in the inner lane", async () => {
  const { pitState, crewPhase } = await S();
  const sg = pitState({ ...base, u: 199, speed: 0, stillFor: 5, penalty: "stop-go" });
  assert.strictEqual(sg.state, "stop-go"); assert.strictEqual(sg.lane, "box");
  assert.deepStrictEqual(crewPhase([{ num: "1", state: sg, u: 199, boxU: 200 }]).phase, "hold");
  const first = pitState({ ...base, u: 200, speed: 0, stillFor: 1 });
  const second = pitState({ ...base, u: 188, speed: 0, stillFor: 1, teammateInBox: true });
  assert.strictEqual(second.state, "waiting (double stack)");
  const cp = crewPhase([{ num: "1", state: first, u: 200, boxU: 200 }, { num: "2", state: second, u: 188, boxU: 200 }]);
  assert.deepStrictEqual([cp.phase, cp.num], ["work", "1"], "one crew, at the car in the box");
});

test("pit-lane start and the exit road: the fast lane / the feed's line, no box; practice: a long stand at its box goes into the garage", async () => {
  const { pitState } = await S();
  assert.strictEqual(pitState({ ...base, u: 250, speed: 0, stillFor: 60, pitStart: "queue" }).lane, "fast");
  assert.strictEqual(pitState({ ...base, u: 360, speed: 0, stillFor: 60, pitStart: "queue" }).lane, "feed");
  assert.strictEqual(pitState({ ...base, u: 400, speed: 20 }).state, "exit");
  assert.strictEqual(pitState({ ...base, inPit: false, onLane: false }).state, "track");
  const g = pitState({ ...base, u: 200, speed: 0, stillFor: 22, race: false });
  assert.strictEqual(g.state, "garage"); assert.ok(g.w > 0 && g.w < 1);
  assert.strictEqual(pitState({ ...base, u: 200, speed: 0, stillFor: 22, race: true }).state, "in box", "a race: no garage");
});

test("across: the fast lane's centre, the box, the feed's line past the run's ends", async () => {
  const { pitState, laneOffsetOf } = await S();
  const cs = { ok: true, fastC: 10.75, boxC: 4.5 };
  assert.strictEqual(laneOffsetOf(pitState({ ...base, u: 150 }), cs, 8.2, 150, 0, 300), 10.75);
  assert.strictEqual(laneOffsetOf(pitState({ ...base, u: 200, speed: 0, stillFor: 2 }), cs, 8.2, 200, 0, 300), 4.5);
  assert.strictEqual(laneOffsetOf(pitState({ ...base, u: 350 }), cs, 8.2, 350, 0, 300), 8.2);
  // a narrow place: no box there – the fast lane
  assert.strictEqual(laneOffsetOf(pitState({ ...base, u: 200, speed: 0, stillFor: 2 }), { ok: false, fastC: 4.5, boxC: 3 }, 8, 200, 0, 300), 4.5);
});

test("penalties pending: given, then served; a stop-and-go in either wording", async () => {
  const { pendingPenalties } = await S();
  const rcm = [[100, "FIA STEWARDS: DRIVE THROUGH PENALTY FOR CAR 63 (RUS) - LEAVING THE TRACK"], [200, "FIA STEWARDS: 10 SECOND STOP/GO PENALTY FOR CAR 87 (BEA) - UNSAFE CONDITION"],
    [300, "FIA STEWARDS: PENALTY SERVED - DRIVE THROUGH PENALTY FOR CAR 63 (RUS) - LEAVING THE TRACK"], [350, "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 1 (NOR)"]];
  assert.deepStrictEqual([...pendingPenalties(rcm, 50)], []);
  assert.deepStrictEqual([...pendingPenalties(rcm, 250)], [["63", "drive-through"], ["87", "stop-go"]]);
  assert.deepStrictEqual([...pendingPenalties(rcm, 400)], [["87", "stop-go"]], "served; a time penalty is no pit penalty");
});

test("standing time and the last standstill from telemetry, the same at any moment asked", async () => {
  const { standingFor, lastStand } = await S();
  // 10 Hz: moving to 10 s, standing 10–12.5 s, moving after
  const T = [], V = []; for (let ms = 0; ms <= 20000; ms += 100) { T.push(ms); V.push(ms >= 10000 && ms <= 12500 ? 0 : 80); }
  const car = { t: T, v: V };
  assert.strictEqual(standingFor(car, 9000), 0);
  assert.ok(Math.abs(standingFor(car, 11500) - 1.5) < 0.11);
  assert.strictEqual(standingFor(car, 14000), 0);
  assert.deepStrictEqual(lastStand(car, 14000), { t0: 10000, t1: 12500 });
  assert.strictEqual(lastStand(car, 40000), null, "too long ago");
  assert.strictEqual(lastStand(car, 11000), null, "still standing: not a last standstill yet");
});

test("at its box: a car's length off the box's measured place still counts, never half the way to the next team's", async () => {
  const { pitState } = await S();
  assert.strictEqual(pitState({ ...base, u: 212, speed: 0, stillFor: 2 }).state, "queued", "12 m off: not its box");
  assert.strictEqual(pitState({ ...base, u: 209, speed: 0, stillFor: 2 }).state, "in box");
  assert.strictEqual(pitState({ ...base, u: 209, speed: 0, stillFor: 2, boxTol: 8 }).state, "queued", "the next box 16 m on");
});

test("standing from positions: a stop with centimetre jitter is one standstill; speed from them", async () => {
  const { standingForPos, lastStandPos, posSpeed } = await S();
  // 4 Hz along x: 20 m/s to 10 s, standing 10–14 s (±3 cm jitter), 20 m/s after; decimetres
  const t = [], x = [], y = []; let X = 0;
  for (let ms = 0; ms <= 20000; ms += 250) { const mv = ms < 10000 || ms > 14000; if (mv && ms > 0) X += 20 * 0.25 * 10; t.push(ms); x.push(X + (mv ? 0 : (((ms / 250) % 3) - 1) * 0.3)); y.push(0); }
  const c = { t: Float64Array.from(t), x: Float64Array.from(x), y: Float64Array.from(y), n: t.length };
  assert.ok(Math.abs(posSpeed(c, 5000) - 20) < 0.5);
  assert.ok(posSpeed(c, 12000) < 0.5);
  assert.ok(Math.abs(standingForPos(c, 13000) - 3) < 0.3, String(standingForPos(c, 13000)));
  assert.strictEqual(standingForPos(c, 16000), 0);
  const ls = lastStandPos(c, 16000); assert.ok(ls && Math.abs(ls.t0 - 10000) <= 250 && Math.abs(ls.t1 - 14000) <= 250, JSON.stringify(ls));
  assert.strictEqual(lastStandPos(c, 12000), null, "still standing");
});

test("a penalty is done once the car has made a whole pit visit after it was given, even before race control says so; a retired car gets no crew", async () => {
  const { pendingPenalties, pitVisits, pitState, crewPhase } = await S();
  const rcm = [[7103, "FIA STEWARDS: 10 SECOND STOP/GO PENALTY FOR CAR 87 (BEA) - UNSAFE CONDITION"], [7627, "FIA STEWARDS: PENALTY SERVED - 10 SECOND STOP/GO PENALTY FOR CAR 87 (BEA)"]];
  const flags = [[7231, true], [7268, false], [7351, true]];
  const at = (t) => pendingPenalties(rcm, t, () => pitVisits(flags, t)).get("87") || null;
  assert.strictEqual(at(7240), "stop-go", "the visit serving it");
  assert.strictEqual(at(7360), null, "the next visit: done");
  assert.deepStrictEqual(pitVisits(flags, 7400), [[7231, 7268], [7351, null]]);
  const r = pitState({ ...base, u: 199, speed: 0, stillFor: 120, retired: true });
  assert.strictEqual(r.state, "retired");
  assert.strictEqual(crewPhase([{ num: "87", state: r, u: 199, boxU: 200 }]).phase, "none");
});

test("crew layouts: in the inner lane on the garages' side of the car's lane-side clearance, mirrored with the garages on the right, nobody ahead of a car that has left", async () => {
  const { crewLayout } = await import("../src/renderer/crew.js");
  const boxC = 5;
  const work = crewLayout("work", 1, boxC, 1);
  assert.strictEqual(work.length, 19);
  // across (+ the garages' side): never more than boxC towards the garages, never more than 2.4 m towards the fast lane
  for (const [, b] of work) assert.ok(b <= boxC && b >= -2.4, String(b));
  const right = crewLayout("work", 1, boxC, -1);
  right.forEach(([a, b], i) => { assert.strictEqual(a, work[i][0]); assert.strictEqual(b, -work[i][1]); });
  // just after the car left: everyone ahead of where it stood is on the garages' side of its path
  for (const [a, b] of crewLayout("back", 1, boxC, 1)) if (a > 2) assert.ok(b >= 1.6 * 0.5 + (boxC - 0.7) * 0.5 - 1e-9 || b >= 1.6, `${a}, ${b}`);
  // hold (a stop-and-go): all by the garage
  for (const [, b] of crewLayout("hold", 1, boxC, 1)) assert.strictEqual(b, boxC - 0.7);
});

// v0.34 (Canada 2026 lap 31, Ferrari): the real second car of a double stack doesn't stand still behind the first –
// Leclerc crept up at 2–5 m/s, 5–11 m behind Hamilton (within the box's 10 m tolerance), so no wait was ever seen in
// 40 races; standing there it would have been a second car "in box".
test("double stack as it really happens: creeping up behind a teammate in the box, even within the box's tolerance, is waiting – never a second car in the box", async () => {
  const { pitState } = await S();
  const behind = { ...base, u: 191, teammateInBox: true };
  assert.strictEqual(pitState({ ...behind, speed: 4 }).state, "waiting (double stack)");
  assert.strictEqual(pitState({ ...behind, speed: 0, stillFor: 2 }).state, "waiting (double stack)");
  assert.strictEqual(pitState({ ...behind, speed: 15 }).state, "to box", "at a normal pace: still pulling in");
  assert.strictEqual(pitState({ ...base, u: 191, speed: 0, stillFor: 2 }).state, "in box", "no teammate there: its stop");
});
