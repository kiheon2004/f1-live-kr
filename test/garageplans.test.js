// v0.39: the F1 garages from the FIA's pit lane drawings (garageplans.js) – the counts per team as drawn, placed along the
// pit lane by the measured boxes, the allocation drawn from them (garages.js planOverrides), and why a driver's name
// board is or isn't made (boardStatus – Map3D.boardsDiag's pure part).
const test = require("node:test");
const assert = require("node:assert");
const load = async () => ({ P: await import("../src/renderer/garageplans.js"), O: await import("../src/renderer/pitorder.js"), G: await import("../src/renderer/garages.js") });

test("drawings: every plan's garage count and each team's share as the FIA drew them", async () => {
  const { P } = await load();
  const count = (v, y) => new Set(P.planBays(P.GARAGE_PLANS[v][y]).map((b) => b.garage)).size;
  // (research/garages.md: Silverstone 41 – also the circuit's "70 facts" –, Monza 03–60, Suzuka 55, Lusail 50, Monaco 13)
  assert.strictEqual(count(2, 2025), 41); assert.strictEqual(count(2, 2026), 41); assert.strictEqual(count(39, 2026), 58);
  assert.strictEqual(count(46, 2026), 55); assert.strictEqual(count(150, 2025), 50); assert.strictEqual(count(22, 2025), 13);
  const share = (v, y, team) => P.teamGarages(P.planBays(P.GARAGE_PLANS[v][y]), team);
  assert.strictEqual(share(2, 2026, "McLaren"), 3); assert.strictEqual(share(15, 2025, "Ferrari"), 4); assert.strictEqual(share(14, 2025, "Williams"), 2);
  assert.strictEqual(share(39, 2025, "Mercedes"), 5.5, "Monza: 5 and half a split one"); assert.strictEqual(share(22, 2025, "Ferrari"), 1, "Monaco: one garage, drawn in three parts");
  assert.strictEqual(P.planBays(P.GARAGE_PLANS[22][2025]).filter((b) => b.teams[0] === "Ferrari").length, 3);
  assert.strictEqual(share(153, 2026, "Cadillac"), 2);
  // every plan: each team named has at least 1 garage, none more than 6; the drawing listed from the exit end is turned
  for (const [v, ys] of Object.entries(P.GARAGE_PLANS)) for (const [y, plan] of Object.entries(ys)) {
    const bays = P.planBays(plan), teams = new Set(bays.flatMap((b) => b.teams));
    assert.ok(teams.size === (+y >= 2026 ? 11 : 10), `${v}/${y}: ${teams.size} teams`);
    for (const t of teams) { const n = P.teamGarages(bays, t); assert.ok(n >= 1 && n <= 6, `${v}/${y} ${t}: ${n}`); }
    assert.ok(plan.src && /FIA/.test(plan.src));
  }
  const suzuka = P.planBays(P.GARAGE_PLANS[46][2026]);
  assert.strictEqual(suzuka[0].owners[0], "FIA", "Suzuka: the FIA's garages at the entry end (the drawing numbers from the exit)");
});

test("layout: the garages placed by the measured boxes – each team's box in front of its garages", async () => {
  const { P, O } = await load();
  for (const [v, y] of [[2, 2026], [39, 2025], [15, 2025], [46, 2026], [22, 2025], [14, 2025], [153, 2026]]) {
    const L = P.layoutFor(v, y, O.PIT_BOXES, O.STANDINGS, O.teamKey);
    assert.ok(L.bays, `${v}/${y}: ${L.why}`);
    for (const [team, u, fit] of L.fit.teams) assert.ok(Math.abs(u - fit) < Math.max(4, L.w * 0.75) + 4, `${v}/${y} ${team}: box ${u}, garages' middle ${fit.toFixed(1)}`);
    for (let i = 1; i < L.bays.length; i++) assert.ok(L.bays[i].u0 >= L.bays[i - 1].u1 - 1e-6, "no two garages overlap");
  }
  // Monza: narrow garages (~4 m) – the drawing's 58 along ~240 m; Interlagos: 12 m ones, two a team
  assert.ok(Math.abs(P.layoutFor(39, 2025, O.PIT_BOXES, O.STANDINGS, O.teamKey).w - 4.1) < 0.4);
  assert.ok(Math.abs(P.layoutFor(14, 2025, O.PIT_BOXES, O.STANDINGS, O.teamKey).w - 12) < 1);
  // a season without its own measured boxes takes another's when the drawings number the same garages (Monza 2026 ← 2025)
  const m26 = P.layoutFor(39, 2026, O.PIT_BOXES, O.STANDINGS, O.teamKey);
  assert.deepStrictEqual(m26.from, { plan: 2026, layout: 2025 });
  assert.strictEqual(m26.bays.find((b) => b.teams[0] === "Cadillac") != null, true);
  // none where it can't be known: no drawing (2024), different numbering and no boxes (Hungaroring 2026)
  assert.ok(P.layoutFor(2, 2024, O.PIT_BOXES, O.STANDINGS, O.teamKey).why);
  assert.ok(P.layoutFor(4, 2026, O.PIT_BOXES, O.STANDINGS, O.teamKey).why);
});

test("allocation from the drawing: each team its own garages, split ones neutral, confirmed – and the box stays in the lane", async () => {
  const { G } = await load();
  const own = (o) => ({ n: 1, owners: [o], teams: ["McLaren", "Ferrari"].includes(o) ? [o] : [] });
  const bays = [own("FIA"), own("McLaren"), own("McLaren"), own("McLaren"), { owners: ["McLaren", "Ferrari"], teams: ["McLaren", "Ferrari"] }, own("Ferrari"), own("Ferrari"), own("Ferrari")];
  const slots = bays.map((b, k) => ({ k, uc: k * 6, width: 5.5, bay: b }));
  const Gar = { slots, plan: { src: "FIA test drawing" } };
  const D = { 4: { TeamName: "McLaren", TeamColour: "ff8000", Tla: "NOR", RacingNumber: "4", LastName: "Norris" }, 81: { TeamName: "McLaren", TeamColour: "ff8000", Tla: "PIA", RacingNumber: "81", LastName: "Piastri" },
    16: { TeamName: "Ferrari", TeamColour: "ff0000", Tla: "LEC", RacingNumber: "16", LastName: "Leclerc" }, 44: { TeamName: "Ferrari", TeamColour: "ff0000", Tla: "HAM", RacingNumber: "44", LastName: "Hamilton" } };
  const ov = G.planOverrides(Gar, D);
  assert.deepStrictEqual(ov.map((o) => [o.team, o.slots]), [["McLaren", [1, 2, 3]], ["Ferrari", [5, 6, 7]]]);
  const places = [{ team: "McLaren", u: 30, off: 6, from: "box", ok: true, published: true }, { team: "Ferrari", u: 37.2, off: 6, from: "box", ok: true }];
  const teams = G.allocatePlaces(slots, 6, D, places, ov);
  const mcl = teams.find((t) => t.team === "McLaren"), fer = teams.find((t) => t.team === "Ferrari");
  assert.strictEqual(mcl.link, "confirmed"); assert.strictEqual(mcl.estimated, false);
  assert.strictEqual(mcl.box, 12, "an order-only box goes in front of the drawing's garages");
  assert.strictEqual(fer.box, 37, "a box seen in the session's stops stays where it was");
  assert.ok(!teams.some((t) => t.slots.includes(4)) && !teams.some((t) => t.slots.includes(0)), "the split garage and the FIA's stay neutral");
  assert.deepStrictEqual(mcl.drivers.map((d) => [d.num, d.slot]), [["4", 1], ["81", 3]], "the cars in the outer bays, by number");
  assert.strictEqual(mcl.drivers[0].label, "4  NORRIS");
  // a team the drawing doesn't name (another series' entry, a list error) gets nothing from it
  assert.deepStrictEqual(G.planOverrides(Gar, { 9: { TeamName: "Nobody" } }), []);
  // 2026: the drawing's Audi is the session's Audi; in 2025 Sauber's place
  assert.deepStrictEqual(G.planOverrides({ slots: [{ k: 0, bay: { owners: ["Audi"], teams: ["Audi"] } }], plan: {} }, { 5: { TeamName: "Audi" } }).map((o) => o.slots), [[0]]);
});

test("name boards: created or excluded, with the reason, for every car the session names", async () => {
  const { G } = await load();
  const slots = [0, 1, 2, 3].map((k) => ({ k, uc: k * 8, width: 7.5 }));
  const D = { 1: { TeamName: "A", Tla: "AAA", RacingNumber: "1" }, 2: { TeamName: "A", Tla: "BBB", RacingNumber: "2" }, 3: { TeamName: "B", Tla: "CCC", RacingNumber: "3" } };
  const teams = G.allocatePlaces(slots, 8, D, [{ team: "A", u: 8, off: 6, from: "box", ok: true }]);
  const key = G.allocationKey(teams), boards = new Map([["1", {}], ["2", {}]]);
  const st = (o) => Object.fromEntries(G.boardStatus({ G: { slots }, hasPositions: true, drivers: D, nums: ["1", "2", "3", "99"], teams, evidence: [{ team: "B", reason: "one stop only" }], layerKey: key, keyNow: key, boards, ...o }).map((r) => [r.num, r]));
  const ok = st({});
  assert.strictEqual(ok["1"].status, "created"); assert.strictEqual(ok["2"].status, "created");
  assert.match(ok["3"].reason, /team not allocated: one stop only/);
  assert.match(ok["99"].reason, /not in the session's driver list/);
  assert.match(st({ G: null })["1"].reason, /no pit building/);
  assert.match(st({ hasPositions: false })["1"].reason, /no position data/);
  assert.match(st({ layerKey: "old" })["1"].reason, /key stale/);
  assert.match(st({ boards: new Map() })["1"].reason, /no board/);
  // a team with no bay left: no work space
  const none = G.allocatePlaces([], 8, D, [{ team: "A", u: 8, off: 6, from: "box", ok: true }]);
  assert.match(st({ teams: none })["1"].reason, /team not allocated/);
  const ws = teams.map((t) => ({ ...t, drivers: t.drivers.map((d) => ({ ...d, slot: d.num === "2" ? null : d.slot })) }));
  assert.match(st({ teams: ws, keyNow: G.allocationKey(ws), layerKey: G.allocationKey(ws) })["2"].reason, /no work space/);
  // the label: number and surname; a name in other letters (or too long) falls back to the code
  assert.strictEqual(G.boardLabel("12", { RacingNumber: "12", LastName: "Antonelli", Tla: "ANT" }), "12  ANTONELLI");
  assert.strictEqual(G.boardLabel("7", { RacingNumber: "7", LastName: "周", Tla: "ZHO" }), "7  ZHO");
});

test("garage styles: teams differ (base, band, joints) and stay the same from build to build", async () => {
  const { G } = await load();
  const names = ["McLaren", "Ferrari", "Red Bull Racing", "Mercedes", "Aston Martin", "Alpine", "Haas F1 Team", "Racing Bulls", "Williams", "Audi", "Cadillac"];
  const keys = names.map((n) => JSON.stringify(G.garageStyle(n)));
  assert.ok(new Set(keys).size >= 7, `only ${new Set(keys).size} different linings`);
  assert.deepStrictEqual(G.garageStyle("Mercedes").dark, true);
  assert.deepStrictEqual(G.garageStyle("Ferrari"), G.garageStyle("Ferrari"));
});

test("boardsDiag (v0.40): a see-through catch fence or an undrawn surface between the camera and a board doesn't hide it; a wall does", async () => {
  // (Monaco 2025: every board readable through the 28 %-opaque street fence was reported "occluded: behind syntheticWalls")
  const { seeThrough } = await import("../src/renderer/garages.js");
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const fence = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.28, depthWrite: false });
  const wall = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const glassy = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.88 });   // (water, tinted glass: hides)
  assert.strictEqual(seeThrough(fence), true);
  assert.strictEqual(seeThrough(Object.assign(new THREE.MeshBasicMaterial(), { colorWrite: false })), true);
  assert.strictEqual(seeThrough(wall), false);
  assert.strictEqual(seeThrough(glassy), false);
  assert.strictEqual(seeThrough([fence, wall]), false, "a mesh with any solid material hides");
  assert.strictEqual(seeThrough(null), false);
});
