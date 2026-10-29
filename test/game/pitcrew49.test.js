// The game's pit crew (game/pitcrew.js, request §15): the crew follows the engine's pit state at render time – nobody
// touches the car during a penalty hold, a queued teammate gets no crew of its own, a held release looks different from a
// release, the new wheels are the car's only from the engine's work end, a slow wheel only where the engine names it, and
// the same render time always gives the same picture (pause / seek / any speed).
const test = require("node:test");
const assert = require("node:assert");
const PC = () => import("../../src/renderer/game/pitcrew.js");
const CR = () => import("../../src/renderer/crew.js");
const D = { FZ: 1.7, RZ: -1.7, FR: 0.353, RR: 0.355, FW: 0.28, RW: 0.375, FX: 0.81, RX: 0.7625, W: 1.9 };
const BOXU = 300;
// a car row as frameCars gives it: in its box from stop, its work [w0, w1), released at rel (held before that if held)
function row(num, { phase, u = BOXU, v = 0, stop = 0, w0 = null, w1 = null, rel = null, hold = null, held = false, noWork = false, err = null, cmp = "MEDIUM", pen = [] }) {
  return { num, team: "T", teamKey: "t", u, v, tyre: { compound: cmp }, pen: { open: pen },
    pit: { phase, compound: "HARD", workT0: w0, workT1: w1, err, holdT1: hold, noWork, held, times: { entry: -30000, stop, work: w0, workEnd: w1 != null && rel != null ? w1 + 20 : null, release: rel, penEnd: hold != null && w0 != null ? hold : null } } };
}

test("modes from the engine's times: penalty (nobody touches the car) → work → done; a held release is its own picture; a stop-and-go keeps the crew by the garage", async () => {
  const { crewPlan, crewFrame } = await PC();
  // a 5 s time penalty: stop 0, hold to 5000, work 5000–7430
  const mem = {};
  for (let T = 0; T < 5000; T += 250) {
    const p = crewPlan([row("4", { phase: "penalty", hold: 5000 })], T, BOXU, mem);
    assert.strictEqual(p.mode, "penalty");
    const L = crewFrame(p, row("4", { phase: "penalty", hold: 5000 }), T, D, 1, 4.6, mem);
    assert.ok(L.car.lift.every((x) => x === 0) && L.car.off.every((x) => !x), `nobody touches the car at ${T}`);
    assert.ok(!L.figures.some((f) => f[5] && f[5].some((g) => g && g[0] > D.RZ - 0.5 && g[0] < D.FZ + 0.5 && Math.abs(g[1]) < D.W / 2 + 0.05)), "no hand on the car during the hold");
  }
  const w = row("4", { phase: "work", hold: null, w0: 5000, w1: 7430 }); w.pit.times.penEnd = 5000;
  assert.strictEqual(crewPlan([w], 6000, BOXU, mem).mode, "work");
  // held for a car in the fast lane: the release man's arm out; after the release, the plain "done"
  const h = row("4", { phase: "release", w0: 0, w1: 2430, held: true }), mh = {};
  const ph = crewPlan([h], 3000, BOXU, mh), Lh = crewFrame(ph, h, 3000, D, 1, 4.6, mh);
  assert.strictEqual(ph.mode, "held");
  const d = row("4", { phase: "release", w0: 0, w1: 2430, rel: 5000 }), md = {};
  const pd = crewPlan([d], 6000, BOXU, md), Ld = crewFrame(pd, d, 6000, D, 1, 4.6, md);
  assert.strictEqual(pd.mode, "done");
  const r = Lh.figures.length - 2;
  assert.notDeepStrictEqual(JSON.stringify(Lh.figures[r][3]), JSON.stringify(Ld.figures[r][3]), "held and done differ (the release man)");
  // held: nobody moves while it waits (the same picture at 3 s and 4 s)
  assert.strictEqual(JSON.stringify(crewFrame(crewPlan([h], 4000, BOXU, mh), h, 4000, D, 1, 4.6, mh).figures), JSON.stringify(crewFrame(crewPlan([h], 4500, BOXU, mh), h, 4500, D, 1, 4.6, mh).figures));
  // a stop-and-go: no work, the crew by the garage's opening, nothing in hand
  const sg = row("4", { phase: "penalty", hold: 10000, noWork: true }), ps = crewPlan([sg], 3000, BOXU, {});
  assert.strictEqual(ps.mode, "sg");
  const Ls = crewFrame(ps, sg, 3000, D, 1, 4.6, {});
  assert.ok(Ls.figures.every((f) => f[1] > 3) && Ls.kits.length === 0);
});

test("a teammate queued behind the box gets no crew; the crew stays out for it between the two cars", async () => {
  const { crewPlan } = await PC();
  const a = row("4", { phase: "work", w0: 0, w1: 2430 }), b = row("81", { phase: "queue", u: BOXU - 6, stop: null });
  const p = crewPlan([a, b], 1000, BOXU, {});
  assert.strictEqual(p.num, "4", "the crew is on the car in the box");
  // the first car gone, the second still queued: the crew waits at the box (out, f = 1) – not attached to the queued car
  const mem = {};
  crewPlan([a, b], 1000, BOXU, mem);
  const gone = row("4", { phase: "laneOut", u: BOXU + 20, w0: 0, w1: 2430, rel: 2450 }); gone.pit.times.workEnd = 2450;
  const q = crewPlan([gone, b], 4000, BOXU, mem);
  assert.strictEqual(q.mode, "out"); assert.strictEqual(q.plan, null); assert.strictEqual(q.f, 1); assert.ok(q.queued);
});

test("new tyres: the fitted wheels are the crew's (at the hubs) until the engine's work end, then the car's – never both, never none", async () => {
  const { crewPlan, crewFrame, swappedAt } = await PC(), { hubsOf } = await CR();
  const H = hubsOf(D);
  for (let T = 0; T <= 3000; T += 25) {
    const g = row("4", { phase: T < 2430 ? "work" : "release", w0: 0, w1: 2430, rel: T >= 2450 ? 2450 : null, cmp: T >= 2450 ? "HARD" : "MEDIUM" });
    const p = crewPlan([g], T, BOXU, {}); if (!p || !p.plan) continue;
    const L = crewFrame(p, g, T, D, 1, 4.6, {});
    if (!L.car) continue;
    H.forEach((h, i) => {
      const atHub = L.kits.filter((k) => (k.kind === "new" || k.kind === "old") && Math.hypot(k.a - h.a, k.b - h.b) < 0.05).length;
      if (!L.car.off[i]) assert.strictEqual(atHub, 0, `wheel ${i} on the car and at its hub at ${T}`);
      if (T < 2430 && L.car.fitted[i]) assert.ok(L.car.off[i] && atHub === 1, `a fitted wheel is the crew's until the work ends (${i} at ${T})`);
    });
    if (T >= 2450) assert.ok(swappedAt(g, T) && L.car.off.every((o) => !o), `the car's own wheels after the work end (${T})`);
  }
});

test("slow wheel: only the wheel the engine names is slow; without a wheel nothing is singled out; the jacks wait for it", async () => {
  const { crewPlan, crewFrame } = await PC();
  const gun = (L, i) => L.figures[i * 3];   // (each wheel: gun, old wheel, new wheel)
  for (const wheel of [0, 1, 2, 3]) {
    const g = row("4", { phase: "work", w0: 0, w1: 6400, err: { kind: "slow wheel", add: 4, wheel, causes: [] } });
    const L = crewFrame(crewPlan([g], 3000, BOXU, {}), g, 3000, D, 1, 4.6, {});
    // at 3 s the other gunners have signalled (arm up), the slow wheel's is still on the hub; the car is still up
    for (let i = 0; i < 4; i++) { const sig = typeof gun(L, i)[3] === "object" && gun(L, i)[3].arm?.[1]?.[0] > 2; assert.strictEqual(sig, i !== wheel, `wheel ${wheel}: gunner ${i} ${sig ? "signalling" : "working"}`); }
    assert.ok(L.car.lift.every((x) => x > 0.05), "still up");
  }
  // an error without a wheel (not named): every wheel the same – overall slowness only (the jacks stay up longer)
  const g = row("4", { phase: "work", w0: 0, w1: 6400, err: { kind: "slow wheel", add: 4, causes: [] } });
  const L = crewFrame(crewPlan([g], 3000, BOXU, {}), g, 3000, D, 1, 4.6, {});
  const sigs = [0, 1, 2, 3].map((i) => typeof gun(L, i)[3] === "object" && gun(L, i)[3].arm?.[1]?.[0] > 2);
  assert.ok(sigs.every((x) => x === sigs[0]), "no wheel singled out");
});

test("the same render time gives the same picture (pause, a seek back, any speed); a seek back forgets the stop", async () => {
  const { crewPlan, crewFrame } = await PC();
  const g = row("4", { phase: "work", w0: 0, w1: 2430 });
  const at = (T, mem) => JSON.stringify(crewFrame(crewPlan([g], T, BOXU, mem), g, T, D, 1, 4.6, mem));
  const m1 = {}, m2 = {};
  for (let T = 0; T < 1300; T += 16) at(T, m1);
  for (let T = 0; T < 1300; T += 400) at(T, m2);
  assert.strictEqual(at(1300, m1), at(1300, m2));
  assert.strictEqual(at(1300, {}), at(1300, m1));
});

test("the crew walks out as the car comes (no popping into place) and moves in as it comes to rest – no jump when the work starts", async () => {
  const { crewPlan, crewFrame } = await PC();
  const mem = {}; let prev = null, worst = 0;
  for (let T = -11000; T <= 600; T += 1000 / 60) {
    // braking evenly over the last 60 m to stand at 0
    const t = -T / 1000, a = 22.2 ** 2 / 120, tb = 22.2 / a;
    const g = T < 0 ? row("4", { phase: t < tb ? "approach" : "lane", u: t > tb ? BOXU - 60 - (t - tb) * 22.2 : BOXU - 0.5 * a * t * t, v: t > tb ? 22.2 : a * t, stop: null }) : row("4", { phase: "work", w0: 0, w1: 2430 });
    const p = crewPlan([g], T, BOXU, mem); if (!p) { prev = null; continue; }
    const L = crewFrame(p, g, T, D, 1, 4.6, mem);
    if (!prev) assert.ok(L.figures.every((f) => Math.abs(f[1] - 3.9) < 0.6), "the crew sets off from the garage's opening");
    else L.figures.forEach((f, i) => { worst = Math.max(worst, Math.hypot(f[0] - prev[i][0], f[1] - prev[i][1])); });
    prev = L.figures;
  }
  assert.ok(worst < 0.15, `no figure jumps more than 15 cm in a frame (worst ${worst.toFixed(3)} m)`);
});

test("pit panel: elapsed time, never the work's end before it comes; the hold's count-down; a slow wheel only once it shows; a held release said so", async () => {
  const { pitPanelModel } = await import("../../src/renderer/game/pitpanel.js");
  const g = row("4", { phase: "work", w0: 0, w1: 6400, err: { kind: "slow wheel", add: 4, wheel: 2, causes: ["rain"] } });
  const at = (T) => pitPanelModel(g, T);
  assert.strictEqual(at(1000).stoodS, 1);
  assert.strictEqual(at(1000).issue, null, "not shown before it shows");
  assert.ok(at(3000).issue && at(3000).issue.wheel === 2 && /왼쪽 뒤/.test(at(3000).issue.text) && /비/.test(at(3000).issue.text));
  // nothing in the model is the work's end or a remaining time
  for (const T of [500, 1500, 3000, 5000]) assert.ok(!JSON.stringify(at(T)).includes("6.4") && !JSON.stringify(at(T)).includes("6400"));
  const pen = row("4", { phase: "penalty", hold: 5000 });
  assert.deepStrictEqual(pitPanelModel(pen, 2000).hold, { leftS: 3, totalS: 5 });
  const h = row("4", { phase: "release", w0: 0, w1: 2430, held: true });
  assert.ok(/안전 출발 대기/.test(pitPanelModel(h, 3000).release));
  const clean = row("4", { phase: "work", w0: 0, w1: 2430 });
  assert.strictEqual(pitPanelModel(clean, 2000).issue, null);
  assert.strictEqual(pitPanelModel(row("4", { phase: "none" }), 0), null);
});

test("pit camera: shots from the pit state at render time (approach → wide → close → release → end), the selected car first and kept", async () => {
  const { shotFor, pickSubject, PITCAM } = await import("../../src/renderer/game/pitcam.js");
  assert.strictEqual(shotFor(row("4", { phase: "lane", u: BOXU - 100, stop: null }), -8000, BOXU), "approach");
  assert.strictEqual(shotFor(row("4", { phase: "approach", u: BOXU - 10, stop: null }), -1000, BOXU), "wide");
  const w = row("4", { phase: "work", w0: 0, w1: 2430 });
  assert.strictEqual(shotFor(w, 300, BOXU), "wide"); assert.strictEqual(shotFor(w, 1500, BOXU), "close");
  // the work's end is used only once render time reaches it
  assert.strictEqual(shotFor(w, 2400, BOXU), "close");
  assert.strictEqual(shotFor(row("4", { phase: "release", w0: 0, w1: 2430, rel: 2450 }), 2500, BOXU), "release");
  assert.strictEqual(shotFor(row("4", { phase: "release", w0: 0, w1: 2430, held: true }), 3000, BOXU), "wide");
  assert.strictEqual(shotFor(row("4", { phase: "penalty", hold: 5000 }), 2000, BOXU), "wide");
  assert.strictEqual(shotFor(row("4", { phase: "laneOut", u: BOXU + PITCAM.releaseGone + 1, w0: 0, w1: 2430, rel: 2450 }), 4000, BOXU), "end");
  // two cars: the selected (first in order) taken, kept while its visit lasts even when the other is nearer its box
  const a = row("4", { phase: "lane", u: BOXU - 150, stop: null }), b = row("81", { phase: "approach", u: BOXU - 20, stop: null });
  assert.strictEqual(pickSubject(null, [a, b], ["4", "81"], () => BOXU, -5000), "4");
  assert.strictEqual(pickSubject("4", [a, b], ["81", "4"], () => BOXU, -5000), "4", "kept – no switching back and forth");
  const aGone = row("4", { phase: "laneOut", u: BOXU + 60, w0: 0, w1: 2430, rel: 2450 });
  assert.strictEqual(pickSubject("4", [aGone, b], ["4", "81"], () => BOXU, 6000), "81", "then the other");
});
