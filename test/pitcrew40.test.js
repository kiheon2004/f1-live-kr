// v0.40: the pit crew's real working order and contacts – the rear jack in only behind a car that has stood, all four
// wheels done before the car drops, each stop's wheels a little apart (the same stop always the same), feet and knees
// on the ground, hands on what they hold, wheels never through a body, no work played where none is known, right hands
// a right hand.
const test = require("node:test");
const assert = require("node:assert");
const C = () => import("../src/renderer/crew.js");
const B = () => import("../src/renderer/body3d.js");
const S = () => import("../src/renderer/pitstate.js");
const D26 = { FZ: 1.7, RZ: -1.7, FR: 0.353, RR: 0.355, FW: 0.28, RW: 0.375, FX: 0.81, RX: 0.7625, W: 1.9 };
const D25 = { FZ: 1.8, RZ: -1.8, FR: 0.36, RR: 0.36, FW: 0.305, RW: 0.405, FX: 0.85, RX: 0.8, W: 2.0 };
const SEEDS = [undefined, 1, 4242, 987654321];
async function lowAndContacts(j) {
  const { BODY, JOINT_R } = await B(), soles = [], knees = [];
  for (let i = 0; i < 2; i++) {
    const [, ay] = j.ankle[i], p = j.foot[i], c = Math.cos(p), s = Math.sin(p);
    soles.push([ay + BODY.footFront * s - BODY.ankle * c, ay - BODY.footBack * s - BODY.ankle * c]); knees.push(j.knee[i][1] - JOINT_R.knee);
  }
  return { low: Math.min(...soles.flat(), ...knees), soles, knees };
}

test("kneeling gunner: one knee on the ground, the other foot flat on it, the kneeling leg's toe down (v0.39: knee 22 cm up, on one toe)", async () => {
  const { skeleton } = await C();
  for (const name of ["kneel", "signal"]) {
    const { soles, knees } = await lowAndContacts(skeleton(name).joints);
    assert.ok(Math.abs(knees[1]) < 0.003, `${name}: the knee ${knees[1].toFixed(3)} m off the ground`);
    assert.ok(Math.abs(soles[0][0]) < 0.003 && Math.abs(soles[0][1]) < 0.003, `${name}: the front foot flat (${soles[0].map((v) => v.toFixed(3))})`);
    assert.ok(Math.min(...soles[1]) > -0.003 && Math.min(...soles[1]) < 0.003, `${name}: the back foot's toe on the ground`);
  }
  // the jack men and the wheel men: both feet on the ground (a sole's lowest point – the heel may lift, on the toes)
  for (const name of ["ready", "reach", "carry", "jack", "jackDown"]) {
    const { soles } = await lowAndContacts(skeleton(name).joints);
    for (const [i, s] of soles.entries()) assert.ok(Math.abs(Math.min(...s)) < 0.003, `${name}: foot ${i} ${Math.min(...s).toFixed(3)} m off the ground`);
  }
});

test("through a whole stop: every figure's lowest sole or knee on the ground (no floating, no sinking), hands on their grips (within 2 cm)", async () => {
  const { stopChoreo, skeleton, gripsToFigure } = await C();
  for (const d of [D26, D25]) for (const seed of SEEDS) for (const left of [1, -1]) for (const D of [1.9, 2.5, 3.6, null]) {
    for (let s = -0.4; s <= (D ?? 2.6) + 0.5; s += 0.04) {
      const L = stopChoreo({ wait: 0, D, seed }, s, d, left);
      for (const [i, [a, b, f, pose, , grips]] of L.figures.entries()) {
        const j = skeleton(pose, null, grips ? gripsToFigure(grips, a, b, f) : null).joints, { low } = await lowAndContacts(j);
        assert.ok(Math.abs(low) < 0.002, `figure ${i} at ${s.toFixed(2)} s: lowest point ${low.toFixed(4)}`);
        assert.ok(Math.max(...j.short) < 0.02, `figure ${i} at ${s.toFixed(2)} s (seed ${seed}, D ${D}): a hand ${Math.max(...j.short).toFixed(3)} m from its grip`);
      }
    }
  }
});

test("the rear jack: beside the car's tail – clear of the car coming in – until it has stood, then in behind it; lifting only once there", async () => {
  const { stopChoreo, JACKS } = await C();
  for (const d of [D26, D25]) for (const left of [1, -1]) {
    const half = d.W / 2;
    for (let s = -1; s <= 0; s += 0.05) {
      const L = stopChoreo({ wait: 0, D: 2.4 }, s, d, left), rj = L.kits.filter((k) => k.kind === "jack")[1], man = L.figures[rj.by];
      // (the jack's head 0.18 m either side of its base, the man 0.25 m round his hips)
      assert.ok(Math.abs(rj.b) - 0.18 > half + 0.05 && Math.abs(man[1]) - 0.25 > half + 0.05, `s ${s.toFixed(2)}: the rear jack (${rj.b.toFixed(2)}) or its man (${man[1].toFixed(2)}) in the car's way`);
      assert.strictEqual(L.car.lift[1], 0);
    }
    const at = (s) => { const L = stopChoreo({ wait: 0, D: 2.4 }, s, d, left); return { L, rj: L.kits.filter((k) => k.kind === "jack")[1] }; };
    const { L, rj } = at(0.5);
    assert.ok(Math.abs(rj.b) < 1e-6 && Math.abs(rj.a - (d.RZ - JACKS.rear)) < 1e-6, "under the tail by the time it lifts");
    assert.ok(L.car.lift[1] > 0.06, "rear up");
    // never lifting before it is in place
    for (let s = 0; s < 0.6; s += 0.02) { const q = at(s); if (q.L.car.lift[1] > 0) assert.ok(Math.abs(q.rj.b) < 0.02, `lifting at ${s.toFixed(2)} with the jack ${q.rj.b.toFixed(2)} m off the middle`); }
  }
});

test("all four wheels on and every gun off its nut before the car comes down; each stop's wheels apart, the same stop always alike", async () => {
  const { stopChoreo, stopClock, wheelTimes, stopSeed, hubsOf } = await C();
  for (const d of [D26, D25]) for (const seed of SEEDS) for (const D of [1.9, 2.3, 3.2, null]) {
    const plan = { wait: 0, D, seed }, { dropAt } = stopClock(plan, 0), H = hubsOf(d);
    let lastWork = -1;
    for (let s = 0; s <= (D ?? 2.6) + 0.3; s += 0.01) {
      const L = stopChoreo(plan, s, d, 1);
      const gunOnNut = L.kits.filter((k) => k.kind === "gun").some((k) => { const h = H.find((x) => Math.abs(x.a - k.a) < 0.2 && Math.sign(x.b) === Math.sign(k.b)); return Math.abs(Math.abs(k.b) - (Math.abs(h.face) + 0.06)) < 0.02; });
      if (L.car.off.some(Boolean) || gunOnNut) lastWork = s;
      if (s >= dropAt) assert.ok(!L.car.off.some(Boolean), `a wheel off as the car drops (seed ${seed}, D ${D}, s ${s.toFixed(2)})`);
    }
    assert.ok(lastWork < dropAt, `the work goes on to ${lastWork.toFixed(2)} s, the car drops at ${dropAt.toFixed(2)} (seed ${seed}, D ${D})`);
  }
  // seeded: the four wheels not in step, differently from one stop to the next; the same seed the same
  const a = wheelTimes(stopSeed("16", 6243400)), b = wheelTimes(stopSeed("16", 6243400)), c = wheelTimes(stopSeed("44", 4146700));
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a, c);
  assert.ok(new Set(a.map((x) => x.lag.toFixed(3))).size === 4, "four different lags");
  assert.strictEqual(stopSeed("16", 6243400.0000001), stopSeed("16", 6243400), "the stand time's float noise doesn't change the stop");
  assert.strictEqual(JSON.stringify(stopChoreo({ wait: 0, D: 2.4, seed: 7 }, 1.0, D26, 1)), JSON.stringify(stopChoreo({ wait: 0, D: 2.4, seed: 7 }, 1.0, D26, 1)));
});

test("wheels in hands never pass through another man's body", async () => {
  const { stopChoreo, skeleton, gripsToFigure } = await C();
  for (const d of [D26, D25]) for (const seed of SEEDS) for (const left of [1, -1]) for (const D of [2.0, 3.0]) {
    for (let s = 0; s <= D + 0.5; s += 0.02) {
      const L = stopChoreo({ wait: 0, D, seed }, s, d, left);
      const bodies = L.figures.map(([a, b, f, pose, , grips]) => {
        const j = skeleton(pose, null, grips ? gripsToFigure(grips, a, b, f) : null).joints, cf = Math.cos(f), sf = Math.sin(f);
        const P = (x, y) => [a + x * cf, b + x * sf, y];
        return [P(j.lumbar[0], j.lumbar[1]), P((j.lumbar[0] + j.head[0]) / 2, (j.lumbar[1] + j.head[1]) / 2), P(j.head[0], j.head[1])];
      });
      for (const k of L.kits.filter((x) => x.kind === "old" || x.kind === "new")) for (const [i, pts] of bodies.entries()) {
        if (i === k.by) continue;
        for (const p of pts) { const dd = Math.hypot(p[0] - k.a, p[1] - k.b, p[2] - k.h); assert.ok(dd > 0.3, `${k.kind} ${k.axle} wheel ${dd.toFixed(2)} m from figure ${i}'s trunk at ${s.toFixed(2)} s`); }
      }
    }
  }
});

test("no tyre change where none is known: a drive-through, a stop-and-go, a car queueing behind its team-mate or merely passing get no work played", async () => {
  const { crewPhase, stopPlan } = await S();
  const st = (state) => ({ state, lane: "fast", w: 0, evidence: [] });
  assert.notStrictEqual(crewPhase([{ num: "1", state: st("drive-through"), u: 10, boxU: 10, stillFor: 0 }]).phase, "work");
  assert.strictEqual(crewPhase([{ num: "1", state: st("stop-go"), u: 10, boxU: 10, stillFor: 3 }]).phase, "hold");
  assert.strictEqual(stopPlan({ t: 5000, t0: 1000, tyres: [], penalty: "stop-go", policy: "typical" }).kind, "hold");
  // the second car of a double stack, waiting: the crew is "ready" for it, working on the first
  const ph = crewPhase([{ num: "1", state: st("in box"), u: 10, boxU: 10, stillFor: 1 }, { num: "2", state: st("waiting (double stack)"), u: 2, boxU: 10, stillFor: 1 }]);
  assert.deepStrictEqual([ph.phase, ph.num], ["work", "1"]);
  // the record without a new set at this stop: no change (the crew round the car, nothing played)
  assert.strictEqual(stopPlan({ t: 5000, t0: 1000, t1: 4000, tyres: [{ ms: -500000, compound: "HARD", changed: true }], policy: "record" }).kind, "work");
});

test("right hands are right hands: the crews' right glove is the left one mirrored (thumb on the other side), wound to face out", async () => {
  const { crewMeshes } = await C();
  const cm = crewMeshes(2);
  cm.place([{ x: 0, y: 0, z: 3, yaw: 0, colour: "#ff0000", pose: "stand" }], [], { x: 0, y: 1.6, z: 0 });
  const vis = ["gloveFine", "gloveFineR"].map((n) => cm.group.getObjectByName(n));
  assert.ok(vis.every((m) => m.visible && m.count === 1), "a left and a right fine glove drawn");
  const [g1, g2] = vis.map((m) => m.geometry.attributes.position.array);
  let mirrored = g1.length === g2.length;
  for (let i = 0; mirrored && i < g1.length; i += 9) mirrored = Math.abs(g1[i] + g2[i]) < 1e-6 && Math.abs(g1[i + 3] + g2[i + 6]) < 1e-6 && Math.abs(g1[i + 1] - g2[i + 1]) < 1e-6;
  assert.ok(mirrored, "the right glove's vertices are the left's mirrored in x, each triangle wound back");
  // outward faces: the signed volume of the closed mittens keeps its sign (no inside-out hand)
  const vol = (a) => { let v = 0; for (let i = 0; i < a.length; i += 9) v += a[i] * (a[i + 4] * a[i + 8] - a[i + 5] * a[i + 7]) - a[i + 1] * (a[i + 3] * a[i + 8] - a[i + 5] * a[i + 6]) + a[i + 2] * (a[i + 3] * a[i + 7] - a[i + 4] * a[i + 6]); return v; };
  assert.ok(Math.sign(vol(g1)) === Math.sign(vol(g2)));
});

// formula1.com, "Anatomy of a pit stop" (2 Mar 2025): the front jack man "engages the swivel and steps aside" at ~0.8 s
// with the car still up, is clear by ~1.6 s and the car drops "while the jack is still swinging" (v0.39 moved him only
// from the drop on)
test("the front jack man steps aside while the car is still up – the jack's head still under the nose – and is clear before it drops", async () => {
  const { stopChoreo, stopClock, CHANGE } = await C();
  for (const d of [D26, D25]) for (const left of [1, -1]) for (const D of [2.2, 3.0, null]) {
    const plan = { wait: 0, D }, { dropAt } = stopClock(plan, 0);
    const at = (s) => { const L = stopChoreo(plan, s, d, left), fj = L.kits.find((k) => k.kind === "jack"); return { L, fj, man: L.figures[fj.by] }; };
    // before the swivel: in front of the nose, on the car's middle line
    const a = at(0.5); assert.ok(Math.abs(a.man[1]) < 0.05 && a.L.car.lift[0] > 0.06, "in front, the car up");
    // aside before the drop, the car still up, the head still under the nose
    const k = stopClock(plan, 0).k, sClear = CHANGE.swivel[1] * k + 0.02;
    assert.ok(sClear < dropAt, "clear before the drop");
    for (let s = sClear; s < dropAt; s += 0.02) {
      const q = at(s);
      assert.ok(q.L.car.lift[0] > 0.06, `the car still up at ${s.toFixed(2)}`);
      assert.ok(Math.abs(q.fj.b) < 1e-6, "the jack's head under the nose");
      assert.ok(left * q.man[1] > d.W / 2 + 0.2, `the man out of the car's way to the garages' side (${q.man[1].toFixed(2)})`);
    }
    // and after the drop, both he and the jack further out of the way
    const e = at(dropAt + 0.5); assert.ok(left * e.fj.b > 0.8 && left * e.man[1] > 1.8);
  }
});

test("marshals and officials: a bare face and a cap, no helmet or visor (marshal kit: Motorsport UK 2025); the crews keep theirs", async () => {
  const { crewMeshes } = await C();
  const cm = crewMeshes(4), seen = () => Object.fromEntries(["head", "visor", "face", "cap"].map((n) => [n, cm.group.getObjectByName(n).count]));
  cm.place([{ x: 0, y: 0, z: 3, yaw: 0, colour: "#ff6a13", pose: "stand", role: "marshal" }], [], { x: 0, y: 1.6, z: 0 });
  assert.deepStrictEqual(seen(), { head: 0, visor: 0, face: 1, cap: 1 });
  cm.place([{ x: 0, y: 0, z: 3, yaw: 0, colour: "#ff0000", pose: "stand" }], [], { x: 0, y: 1.6, z: 0 });
  assert.deepStrictEqual(seen(), { head: 1, visor: 1, face: 0, cap: 0 });
});

// Monza 2025, Leclerc's stop: position samples 1.2 s apart while the car stood – it was drawn at rest (interpolated to
// the next sample) a whole sample before the crew saw it stand, which then jumped 1.2 s into its work
test("standing as drawn: a car whose next sample is where it is stands from the last sample; moving off, it has gone", async () => {
  const { standingForPos, lastStandPos } = await S();
  // moving to 1000 ms (20 m/s, 250 ms samples), samples at 1000, 2200, 3400 standing, moving again after 3400
  const t = [0, 250, 500, 750, 1000, 2200, 3400, 3650, 3900], x = [0, 50, 100, 150, 200, 200, 200.2, 230, 280];
  const c = { t: Float64Array.from(t), x: Float64Array.from(x), y: new Float64Array(t.length), n: t.length };
  assert.ok(Math.abs(standingForPos(c, 1500) - 0.5) < 1e-9, String(standingForPos(c, 1500)));
  assert.ok(Math.abs(standingForPos(c, 3000) - 2.0) < 1e-9);
  assert.strictEqual(standingForPos(c, 3500), 0, "drawn moving off");
  const { posSpeed, pitState } = await S();
  assert.ok(posSpeed(c, 3500) > 10 && posSpeed(c, 3000) < 0.1, "the speed as drawn too: never 'standing' by its speed with no standstill (a crew restarting its work as the car pulls away)");
  assert.notStrictEqual(pitState({ inPit: true, onLane: true, u: 100, gStart: 0, gEnd: 400, speed: posSpeed(c, 3500), stillFor: standingForPos(c, 3500), boxU: 100, boxFrom: "order", race: true, lastBox: { endU: 100, ago: 0.1 } }).state, "in box");
  const ls = lastStandPos(c, 3500, 25, 1); assert.ok(ls && ls.t0 === 1000 && ls.t1 === 3400, JSON.stringify(ls));
  assert.strictEqual(lastStandPos(c, 3000, 25, 1), null, "standing");
  // live: no sample after t – only what came in
  const live = { ...c, n: 6 };
  assert.ok(Math.abs(standingForPos(live, 2300) - 1.3) < 1e-9);
});

test("a car of another shape moves its crew: the gunners at its hubs, the jacks at its axles (or its own lift points)", async () => {
  const { stopChoreo } = await C();
  const long = { ...D26, FZ: 1.9, RZ: -1.8, FX: 0.86 };
  const a = stopChoreo({ wait: 0, D: 2.4 }, 0.35, D26, 1), b = stopChoreo({ wait: 0, D: 2.4 }, 0.35, long, 1), c = stopChoreo({ wait: 0, D: 2.4 }, 0.35, { ...long, JF: 1.1, JR: 0.9 }, 1);
  assert.ok(Math.abs(b.figures[0][0] - a.figures[0][0] - 0.2) < 1e-9, "front gunner follows the front hub");
  const jacks = (L) => L.kits.filter((k) => k.kind === "jack");
  assert.ok(Math.abs(jacks(b)[0].a - jacks(a)[0].a - 0.2) < 1e-9 && Math.abs(jacks(b)[1].a - jacks(a)[1].a + 0.1) < 1e-9);
  assert.ok(Math.abs(jacks(c)[0].a - jacks(b)[0].a - 0.25) < 1e-9 && Math.abs(jacks(c)[1].a - jacks(b)[1].a + 0.1) < 1e-9, "the profile's own lift points");
});
