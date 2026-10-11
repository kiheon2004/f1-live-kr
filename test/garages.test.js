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
  assert.ok(s.long[0].dur >= 39000, `whole length kept (${s.long[0].dur})`);
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
