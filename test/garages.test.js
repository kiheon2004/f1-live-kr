// Teams at their garages (garages.js), v0.14 review: standstills as events with an identity (an ongoing one isn't a
// pit stop; the same standstill seen again – longer, or with the live window cut – is the same one), a replay's
// result from what has happened by then only (seeking = playing), a live result kept steady but withdrawn on a
// conflict or a correction, a new frame of the pit building re-projecting what was seen, and a layer key that
// changes exactly when what's drawn changes.
const test = require("node:test");
const assert = require("node:assert");

const load = () => import("../src/renderer/garages.js");
// garages along scene x at z = 0, the pit lane towards −z (off = −z); F1 metres (X, Y) → scene (X, −Y)
const toScene = ([X, Y]) => [X, -Y];
const project = (x, z) => ({ u: x, off: -z });
const SPAN = [-200, 300];
// a car's samples [t ms, X m, Y m] → CarTracks-like arrays (decimetres)
const car = (pts) => ({ t: pts.map((p) => p[0]), x: pts.map((p) => p[1] * 10), y: pts.map((p) => p[2] * 10), n: pts.length });
// driving in (from 60 m back), standing at (x, y) from t0 to t1 (a sample every 250 ms, with `jit` m of jitter), driving off
function visit(t0, t1, x, y, { jit = 0, leave = true } = {}) {
  const pts = [];
  for (let k = 8; k >= 1; k--) pts.push([t0 - k * 250, x - k * 7, y]);
  for (let t = t0, i = 0; t <= t1; t += 250, i++) pts.push([t, x + (i % 2 ? jit : 0), y]);
  if (leave) for (let k = 1; k <= 8; k++) pts.push([t1 + k * 250, x + k * 7, y]);
  return pts;
}
const merge = (...runs) => run(runs.flat());
const run = (pts) => car(pts.sort((a, b) => a[0] - b[0]));
const D = { 1: { TeamName: "A", TeamColour: "ff0000", Tla: "AAA", RacingNumber: "1" }, 2: { TeamName: "A", TeamColour: "ff0000", Tla: "BBB", RacingNumber: "2" },
  3: { TeamName: "B", TeamColour: "0000ff", Tla: "CCC", RacingNumber: "3" }, 4: { TeamName: "B", TeamColour: "0000ff", Tla: "DDD", RacingNumber: "4" } };

test("standstill: one still going on at the last sample is no pit stop (yet); finished, it's classified by its whole length", async () => {
  const G = await load();
  // 3 s standing at the box so far, the data ends there
  const now = run(visit(100000, 103000, 50, 5, { leave: false }));
  const a = G.standstills({ 1: now }, toScene, project, SPAN, { 1: [80000] });
  assert.strictEqual(a[1]?.stops.length ?? 0, 0, "an ongoing standstill isn't a completed pit stop");
  // the same standstill once finished: 40 s – a long stay, not a stop
  const later = run(visit(100000, 140000, 50, 5));
  const b = G.standstills({ 1: later }, toScene, project, SPAN, { 1: [80000] });
  assert.strictEqual(b[1].stops.length, 0); assert.strictEqual(b[1].long.length, 1);
  // a standing car jittering by ~0.9 m (more than the stillness radius) is still one standstill, not short stops
  const jit = run(visit(100000, 140000, 50, 5, { jit: 0.9 }));
  const c = G.standstills({ 1: jit }, toScene, project, SPAN, { 1: [80000] });
  assert.strictEqual(c[1].stops.length, 0, "jitter doesn't cut a long stay into pit stops"); assert.strictEqual(c[1].long.length, 1);
});

test("standstill (live): the same standstill seen again – longer, or with the window's start cut – is one, classified anew", async () => {
  const G = await load();
  const inf = new G.PitInference();
  const full = visit(100000, 140000, 50, 5);
  // 1st look: 3 s in, still standing (the window ends there)
  inf.observe(G.standstills({ 1: run(full.filter((p) => p[0] <= 103000)) }, toScene, project, SPAN, { 1: [80000] }), true);
  // 2nd look, 100 s later: the window (120 s) has lost the start of it; it ended at 140 s
  inf.observe(G.standstills({ 1: run(full.filter((p) => p[0] >= 112000)) }, toScene, project, SPAN, { 1: [80000] }), true);
  const s = inf.still[1];
  assert.strictEqual(s.stops.length, 0, "the early look's 3 s isn't left behind as a pit stop");
  assert.strictEqual(s.long.length, 1, "one long stay");
  // (the looks didn't meet – 103 s to 112 s unseen: the stretch seen standing is its length, the span is kept)
  assert.ok(s.long[0].dur >= 27000 && s.long[0].dur <= 28000, `the longest stretch seen (${s.long[0].dur})`);
  assert.deepStrictEqual([s.events[0].t0, s.events[0].t1], [100000, 140000]);
  // a real departure and a later visit to the same spot are two
  const two = run([...visit(100000, 102600, 50, 5), ...visit(190000, 192700, 50, 5)]);
  const r = G.standstills({ 1: two }, toScene, project, SPAN, { 1: [95000, 185000] });
  assert.strictEqual(r[1].stops.length, 2);
  // a hole in the data inside a standstill: uncertain – neither a stop nor a long stay
  const hole = run(visit(100000, 104000, 50, 5).filter((p) => p[0] < 101000 || p[0] > 103600));
  assert.strictEqual(G.standstills({ 1: hole }, toScene, project, SPAN, { 1: [95000] })[1]?.stops.length ?? 0, 0);
});

// two working stops per team A driver, one per team B driver, at t (s)
function raceCars(times = { 1: [600, 1800], 2: [1200], 3: [700], 4: [1300] }) {
  const at = { 1: [-76, 5], 2: [-76.6, 5.2], 3: [20, 5], 4: [20.4, 5] }, cars = {}, pitIn = {};
  for (const [num, ts] of Object.entries(times)) {
    cars[num] = run(ts.flatMap((s) => visit(s * 1000, s * 1000 + 2600, at[num][0], at[num][1])));
    pitIn[num] = ts.map((s) => s * 1000 - 15000);
  }
  return { cars, pitIn };
}
const slots = Array.from({ length: 40 }, (_, k) => ({ k, uc: -170 + k * 8.4 + 4.2 }));

test("replay: the places are what the session shows by the moment seen – seeking back takes them away; seeking = playing", async () => {
  const G = await load();
  const { cars, pitIn } = raceCars();
  const at = (inf, t) => { inf.observe(G.standstills(cars, toScene, project, SPAN, pitIn, t), false); return inf.update(D, 8.4).places; };
  const inf = new G.PitInference();
  assert.deepStrictEqual(at(inf, 1500e3).map((p) => p.team).sort(), ["A", "B"]);
  // back to before team A's second stop and team B's second: one stop each – no place
  assert.deepStrictEqual(at(inf, 1000e3).map((p) => p.team), [], "rewound: only what was known then");
  // playing through to 2000 s and jumping straight to it give the same result
  const play = new G.PitInference(); let p1;
  for (let t = 0; t <= 2000e3; t += 20e3) p1 = at(play, t);
  const jump = at(new G.PitInference(), 2000e3);
  assert.deepStrictEqual(p1, jump);
  assert.strictEqual(G.allocationKey(G.allocatePlaces(slots, 8.4, D, p1)), G.allocationKey(G.allocatePlaces(slots, 8.4, D, jump)));
});

test("live: places hold through small changes and missing driver data; a conflict or a corrected team withdraws them", async () => {
  const G = await load();
  const inf = new G.PitInference();
  const { cars, pitIn } = raceCars();
  inf.observe(G.standstills(cars, toScene, project, SPAN, pitIn), true);
  let r = inf.update(D, 8.4);
  assert.deepStrictEqual(r.places.map((p) => p.team).sort(), ["A", "B"]);
  // the driver list missing for a moment (no information): nothing flickers off
  r = inf.update({}, 8.4);
  assert.deepStrictEqual(r.places.map((p) => p.team).sort(), ["A", "B"], "kept without information");
  // a correction: car 2 was team B's, not A's (the list said otherwise) – A's place came from mixed-up evidence
  const fixed = { ...D, 2: { ...D[2], TeamName: "B", TeamColour: "0000ff" } };
  r = inf.update(fixed, 8.4);
  const a = r.places.find((p) => p.team === "A");
  assert.ok(a && !a.drivers.includes("2"), "A's place no longer stands on car 2 (now B's); car 1's own two stops still give it");
  assert.ok(a.support.every((id) => id.startsWith("1@")));
  // a conflict: another team's box turns up within 5 m of A's – neither is trusted any more
  const inf2 = new G.PitInference();
  inf2.observe(G.standstills(cars, toScene, project, SPAN, pitIn), true);
  inf2.update(D, 8.4);
  const D2 = { ...D, 5: { TeamName: "C", Tla: "EEE" }, 6: { TeamName: "C", Tla: "FFF" } };
  const c2 = { 5: run([...visit(2100e3, 2102600, -73.5, 5), ...visit(2400e3, 2402600, -73.2, 5)]) };
  inf2.observe(G.standstills(c2, toScene, project, SPAN, { 5: [2085e3, 2385e3] }), true);
  r = inf2.update(D2, 8.4);
  assert.ok(!r.places.some((p) => p.team === "A" || p.team === "C"), "a conflict withdraws both");
  assert.ok(r.places.some((p) => p.team === "B"));
});

test("live: a new frame of the pit building (rebuilt, moved) re-projects what was seen – no place in the old frame's u", async () => {
  const G = await load();
  const { cars, pitIn } = raceCars();
  const inf = new G.PitInference();
  const f1 = { rev: 1, toScene, project, span: SPAN };
  inf.observe(G.standstills(cars, toScene, project, SPAN, pitIn), true);
  let r = inf.update(D, 8.4, f1);
  const a1 = r.places.find((p) => p.team === "A").u;
  // the building rebuilt with its axis starting 30 m further along: the same spots are u − 30 now
  const project2 = (x, z) => ({ u: x - 30, off: -z });
  r = inf.update(D, 8.4, { rev: 2, toScene, project: project2, span: SPAN });
  const a2 = r.places.find((p) => p.team === "A").u;
  assert.ok(Math.abs(a2 - (a1 - 30)) < 0.6, `re-projected (${a1.toFixed(1)} → ${a2.toFixed(1)})`);
});

test("layer key: changes with what's drawn (codes, numbers, a driver's own garage, the box mark) – not with a few cm", async () => {
  const G = await load();
  const place = (over = {}) => ({ team: "A", u: -76.3, off: 6, from: "box", ok: true, n: 3, ...over });
  const key = (places, drivers = D) => G.allocationKey(G.allocatePlaces(slots, 8.4, drivers, places));
  const k0 = key([place()]);
  assert.strictEqual(key([place({ u: -76.35 })]), k0, "a few cm: same layer");
  assert.notStrictEqual(key([place({ off: 9 })]), k0, "the box mark 3 m further out");
  assert.notStrictEqual(key([place()], { ...D, 1: { ...D[1], Tla: "XXX" } }), k0, "a driver's code corrected");
  assert.notStrictEqual(key([place()], { ...D, 2: { ...D[2], RacingNumber: "22" } }), k0, "a number corrected");
  // practice: each driver's own garage – one moving to the next garage changes the layer
  const own = (u2) => place({ from: "garage", own: { 1: { u: -76 }, 2: { u: u2 } } });
  assert.notStrictEqual(key([own(-67.5)]), key([own(-76)]), "a driver's board moves garage");
  // what's drawn follows the key: the box drawn where the key says
  const t = G.allocatePlaces(slots, 8.4, D, [place({ u: -76.27 })])[0];
  assert.strictEqual(t.box, -76.5, "the box at the key's resolution (0.5 m)");
  assert.strictEqual(t.estimated, true, "the team's garages are an estimate from where its cars stopped");
});

test("confirmed allocations are kept apart from the estimate: drawn as given, not estimated", async () => {
  const G = await load();
  const list = [{ facility: "f", year: 2026, session: null, source: "test plan", teams: [{ team: "B", slots: [20, 21] }] }];
  const ov = G.overridesFor("f", 2026, "any", list);
  assert.deepStrictEqual(G.overridesFor("f", 2025, "any", list), []);
  const out = G.allocatePlaces(slots, 8.4, D, [{ team: "A", u: -76.3, off: 6, from: "box", ok: true, n: 3 }, { team: "B", u: 20, off: 6, from: "box", ok: true, n: 3 }], ov);
  const a = out.find((t) => t.team === "A"), b = out.find((t) => t.team === "B");
  assert.strictEqual(a.estimated, true); assert.strictEqual(a.link, "inferred");
  assert.strictEqual(b.estimated, false); assert.strictEqual(b.link, "confirmed"); assert.deepStrictEqual(b.slots, [20, 21]); assert.strictEqual(b.source, "test plan");
  assert.ok(!a.slots.some((k) => b.slots.includes(k)));
});

test("replay: the events at a moment from the whole recording's (cut there) are exactly those computed up to it", async () => {
  const G = await load();
  // cars standing, nudged, losing data, standing at the end – at random
  let seed = 3; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cars = {};
  for (let num = 1; num <= 6; num++) {
    const pts = []; let t = 0, x = 0;
    while (t < 600000) {
      const k = r();
      if (k < 0.25) { const end = t + 500 + r() * 45000; for (; t < end; t += 250) pts.push([t, x + (r() < 0.2 ? 1.0 : 0), 5]); }   // a standstill (sometimes jittering)
      else if (k < 0.3) t += 2500 + r() * 6000;                                                                                 // a hole
      else for (let i = 0; i < 20; i++, t += 250) pts.push([t, (x += 6), 5]);                                               // driving
    }
    cars[num] = run(pts);
  }
  const all = G.standstillEvents(cars), strip = (e) => [e.num, e.t0, e.t1, e.X, e.Y, e.hole, e.startKnown, e.open, e.holeAfter].join(",");
  let compared = 0;
  for (let t = 0; t <= 620000; t += 1730) {
    const want = G.standstillEvents(cars, t).map(strip), got = G.eventsUpTo(all, cars, t).map(strip);
    assert.deepStrictEqual(got.sort(), want.sort(), `at ${t}`);
    compared += want.length;
  }
  assert.ok(compared > 1000, `enough events compared (${compared})`);
});

// v0.14 optimisation review: a place stands on the right kind of evidence (a box on working stops, a garage on long
// stays) – the same standstills seen again as long stays withdraw a box; time not seen between two looks isn't counted
// as standing.
test("live: a box whose stops turn out to be long stays (the same standstills seen again) is withdrawn", async () => {
  const G = await load();
  const inf = new G.PitInference();
  const D2 = { 1: D[1], 2: D[2] };
  const look = (d) => G.standstills({ 1: run(visit(100000, 100000 + d, 10, 5)), 2: run(visit(200000, 200000 + d, 10, 5)) }, toScene, project, SPAN, { 1: [90000], 2: [190000] });
  inf.observe(look(2600), true);
  assert.deepStrictEqual(inf.update(D2, 8.4).places.map((p) => [p.team, p.from]), [["A", "box"]]);
  // the same two standstills (same ids), seen again: they lasted 40 s
  inf.observe(look(40000), true);
  const r = inf.update(D2, 8.4);
  assert.strictEqual(r.evidence.find((e) => e.team === "A").ok, false);
  assert.deepStrictEqual(r.places, [], "no box left standing on what are now long stays");
  // the driver list missing for a moment still takes nothing away (no information isn't a correction)
  const inf2 = new G.PitInference(); inf2.observe(look(2600), true); inf2.update(D2, 8.4);
  assert.strictEqual(inf2.update({}, 8.4).places.length, 1);
});

test("live: one of a box's stops turning out otherwise keeps the box where the rest still put it – no jump, no flicker", async () => {
  const G = await load();
  const inf = new G.PitInference();
  const { cars, pitIn } = raceCars({ 1: [600, 1800], 2: [1200], 3: [700], 4: [1300] });
  inf.observe(G.standstills(cars, toScene, project, SPAN, pitIn), true);
  const a0 = inf.update(D, 8.4).places.find((p) => p.team === "A");
  assert.strictEqual(a0.support.length, 3);
  // car 1's stop at 1800 s seen again: it was a 30 s stay (a hold in the garage), the other two stops stand
  const later = { 1: run([...visit(600e3, 602600, -76, 5), ...visit(1800e3, 1830e3, -76, 5)]) };
  inf.observe(G.standstills(later, toScene, project, SPAN, { 1: pitIn[1] }), true);
  const a1 = inf.update(D, 8.4).places.find((p) => p.team === "A");
  assert.ok(a1, "still there"); assert.strictEqual(a1.u, a0.u, "where it was");
  assert.ok(!a1.support.includes("1@1800000") && a1.support.length === 2, "standing on what's left");
});

test("live: a garage found from long stays stays put on them (it doesn't need pit stops)", async () => {
  const G = await load();
  const inf = new G.PitInference();
  // practice: each of team A's drivers stands three times at their own garage (60 s each)
  const stays = (x, ts) => run(ts.flatMap((t) => visit(t * 1000, t * 1000 + 60000, x, 3)));
  inf.observe(G.standstills({ 1: stays(10, [100, 900, 1700]), 2: stays(18, [300, 1100, 1900]) }, toScene, project, SPAN), true);
  let r = inf.update({ 1: D[1], 2: D[2] }, 8.4);
  assert.deepStrictEqual(r.places.map((p) => [p.team, p.from]), [["A", "garage"]]);
  r = inf.update({ 1: D[1], 2: D[2] }, 8.4);
  assert.deepStrictEqual(r.places.map((p) => [p.team, p.from]), [["A", "garage"]], "kept on its long stays");
});

test("standstill (live): looks an hour apart aren't one hour standing – only what was seen counts", async () => {
  const G = await load();
  const ev = (t0, t1, o) => ({ num: "1", t0, t1, X: 100, Y: 50, open: false, startKnown: true, hole: false, holeAfter: false, inLane: true, afterEntry: true, u: 10, off: 5, id: `1@${t0}`, ...o });
  // still standing when one look ended (2 s seen), standing already when the next began, an hour later (40 s seen)
  let m = G.mergeEvents([ev(1000, 3000, { open: true })], [ev(3600000, 3640000, { startKnown: false })]);
  assert.strictEqual(m.length, 1, "one event (nothing says it left – it isn't counted twice)");
  assert.deepStrictEqual(m[0].obs, [[1000, 3000], [3600000, 3640000]]);
  assert.strictEqual(G.seenOf(m[0]), 40000);
  assert.strictEqual(G.kindOf(m[0]), "long", "a long stay by the 40 s seen, not by the hour between");
  // two short looks an hour apart: nothing seen for long – uncertain, not a long stay
  m = G.mergeEvents([ev(1000, 3000, { open: true })], [ev(3600000, 3605000, { startKnown: false })]);
  assert.strictEqual(G.kindOf(m[0]), "uncertain");
  // 2 s / 10 min unseen in between – the same: what's seen
  for (const gap of [10 * 60e3, 3000]) {
    m = G.mergeEvents([ev(1000, 9000, { open: true })], [ev(9000 + gap, 9000 + gap + 9000, { startKnown: false })]);
    assert.strictEqual(G.kindOf(m[0]), "uncertain", `${gap} ms unseen`);
  }
  // looks that meet (within 2 s) are one stretch seen: 1 s apart, 8 + 13 s → 22 s standing
  m = G.mergeEvents([ev(1000, 9000, { open: true })], [ev(10000, 23000, { startKnown: false })]);
  assert.strictEqual(m[0].obs, undefined); assert.strictEqual(G.kindOf(m[0]), "long");
  // a later look covering the time unseen joins the stretches into one
  m = G.mergeEvents([ev(1000, 3000, { open: true })], [ev(60000, 65000, { startKnown: false })]);
  m = G.mergeEvents(m, [ev(2500, 61000, { open: false })]);
  assert.strictEqual(m.length, 1); assert.strictEqual(m[0].obs, undefined); assert.strictEqual(G.seenOf(m[0]), 64000);
});

// v0.37: one work space per driver, never shared, never more than the drivers; the bays themselves stay the building's
test("work spaces: exactly one per driver, none shared; spare bays unnamed; split bays when there are fewer bays than drivers", async () => {
  const G = await load();
  const bays = (n, w = 8.4) => Array.from({ length: n }, (_, i) => ({ k: 100 + i, uc: i * w, width: w - 0.5 }));
  // a race: both at the shared box → the two outer bays, by racing number; bays between unnamed
  const race = G.workSpaces(bays(5), [{ num: "16", u: 17, from: "box" }, { num: "44", u: 17, from: "box" }]);
  assert.deepStrictEqual(race.map((w) => [w.num, w.slot]), [["16", 100], ["44", 104]]);
  assert.strictEqual(new Set(race.map((w) => w.slot + ":" + w.w)).size, 2, "no two drivers in one space");
  // the order doesn't follow positions: the same drivers in the other order give the same spaces
  assert.deepStrictEqual(G.workSpaces(bays(5), [{ num: "44", u: 17, from: "box" }, { num: "16", u: 17, from: "box" }]).sort((a, b) => a.slot - b.slot), race);
  // practice: each seen in their own garage keeps it, even a middle one; two seen near the same bay don't share it
  const prac = G.workSpaces(bays(5), [{ num: "1", u: 8.2, from: "garage" }, { num: "2", u: 8.6, from: "garage" }]);
  // (2 is the nearer to bay 101 – 0.2 m against 0.2 m plus a hair – so 1 takes its next nearest, 100)
  assert.deepStrictEqual(Object.fromEntries(prac.map((w) => [w.num, w.slot])), { 1: 100, 2: 101 });
  assert.notStrictEqual(prac[0].slot, prac[1].slot);
  // one bay for two drivers (narrow garages): halves of it, side by side
  const one = G.workSpaces(bays(1, 5.5), [{ num: "10", u: 0, from: "box" }, { num: "7", u: 0, from: "box" }]);
  assert.deepStrictEqual(one.map((w) => [w.num, w.slot, Math.sign(w.w)]), [["7", 100, -1], ["10", 100, 1]]);
  // a third driver (a substitute in the session's list) still gets a space of their own; none without bays
  assert.strictEqual(new Set(G.workSpaces(bays(2), [{ num: "1", from: "box" }, { num: "2", from: "box" }, { num: "3", from: "box" }]).map((w) => w.slot + ":" + w.w)).size, 3);
  assert.deepStrictEqual(G.workSpaces([], [{ num: "1" }]), []);
  assert.ok(race.every((w) => w.est === true), "an estimate: who works where isn't in the data");
});

test("team layer: a driver's name on their work space only; the box mark one per team", async () => {
  const G = await load();
  const t = G.allocatePlaces(slots, 8.4, D, [{ team: "A", u: -76.3, off: 6, from: "box", ok: true, n: 3 }])[0];
  const named = t.drivers.map((d) => d.slot);
  assert.strictEqual(new Set(named).size, t.drivers.length, "each driver in a different bay");
  assert.ok(t.slots.length > t.drivers.length, "the team's area keeps its bays");
  assert.strictEqual(t.spaces.length, t.drivers.length);
});

// v0.38: the work spaces don't depend on the list's order; a substitute changes the key; split halves never overlap
test("work spaces: the driver list's order, a substitute, ties – deterministic, and the key follows", async () => {
  const G = await load();
  const bays = (n, w = 8.4) => Array.from({ length: n }, (_, i) => ({ k: 100 + i, uc: i * w, width: w - 0.5 }));
  const slotsF = bays(4), drivers = (list) => Object.fromEntries(list.map(([n, team]) => [n, { TeamName: team, Tla: "D" + n, RacingNumber: n, TeamColour: "ff0000" }]));
  const place = { team: "A", u: 12.6, off: 6, from: "box", ok: true, n: 3 };
  const a = G.allocatePlaces(slotsF, 8.4, drivers([["16", "A"], ["44", "A"]]), [place]);
  const b = G.allocatePlaces(slotsF, 8.4, drivers([["44", "A"], ["16", "A"]]), [place]);
  assert.strictEqual(G.allocationKey(a), G.allocationKey(b), "list order: same allocation");
  const sub = G.allocatePlaces(slotsF, 8.4, drivers([["16", "A"], ["38", "A"]]), [place]);
  assert.notStrictEqual(G.allocationKey(sub), G.allocationKey(a), "a substitute: the key changes");
  assert.ok(G.allocationKey(sub).includes("38="), "the substitute's own board");
  // equal distances (seen exactly between two bays): the same answer whichever comes first
  const tie1 = G.workSpaces(bays(3), [{ num: "5", u: 4.2, from: "garage" }, { num: "6", u: 4.2, from: "garage" }]);
  const tie2 = G.workSpaces(bays(3), [{ num: "6", u: 4.2, from: "garage" }, { num: "5", u: 4.2, from: "garage" }]);
  assert.deepStrictEqual(tie1.sort((x, y) => x.num - y.num), tie2.sort((x, y) => x.num - y.num));
  // a bay split in two (and in three): the boards (0.42 of the bay's width at most, centred on each part) don't overlap
  for (const n of [2, 3, 4]) {
    const ws = G.workSpaces(bays(1, 5.5), Array.from({ length: n }, (_, i) => ({ num: String(i + 1), from: "box" }))), width = 5.0, bw = G.boardWidth(width, n);
    const xs = ws.map((w) => w.w).sort((p, q) => p - q);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= bw, `boards overlap: ${xs} (${bw} m wide)`);
    assert.ok(xs[0] - bw / 2 >= -width / 2 && xs[xs.length - 1] + bw / 2 <= width / 2, "inside the bay");
    assert.strictEqual(new Set(xs).size, n);
  }
  assert.strictEqual(G.boardWidth(8, 1), 3.6);
});
