// Marshal posts' flags (marshals.js): race control's sector flags per marshalling sector (light panel n → n+1), withdrawn
// by sector or by TRACK CLEAR; red / safety car at every post; VSC and a sector-less yellow make no flag up
const test = require("node:test");
const assert = require("node:assert");
const load = () => import("../src/renderer/marshals.js");
const msg = (Flag, Scope, Sector) => ({ Category: "Flag", Flag, Scope, ...(Sector != null ? { Sector } : {}), Message: "" });

test("flag state: sector yellows and their withdrawal; track clear; the pit exit's green isn't a flag", async () => {
  const { flagState } = await load();
  let s = flagState([msg("YELLOW", "Sector", 10), msg("DOUBLE YELLOW", "Sector", 11)], "2");
  assert.deepStrictEqual([...s.sectors], [[10, "YELLOW"], [11, "DOUBLE YELLOW"]]);
  s = flagState([msg("YELLOW", "Sector", 10), msg("DOUBLE YELLOW", "Sector", 11), msg("CLEAR", "Sector", 10)], "2");
  assert.deepStrictEqual([...s.sectors], [[11, "DOUBLE YELLOW"]]);
  s = flagState([msg("YELLOW", "Sector", 10), msg("CLEAR", "Track")], "1");
  assert.strictEqual(s.sectors.size, 0);
  s = flagState([msg("GREEN", "Track"), { Category: "Other", Message: "x" }, msg("BLUE", "Driver")], "1");
  assert.deepStrictEqual([s.sectors.size, s.red, s.sc, s.vsc], [0, false, false, false]);
  assert.deepStrictEqual([flagState([], "5").red, flagState([], "4").sc, flagState([], "6").vsc, flagState([], "7").vsc], [true, true, true, true]);
});

test("post signals: only the sector's posts; green at the first post after it; red and SC everywhere; VSC and a bare yellow none", async () => {
  const { flagState, postSignal, sectorOf } = await load();
  const panels = [{ n: 1, i: 0 }, { n: 2, i: 100 }, { n: 3, i: 200 }], N = 300;
  assert.deepStrictEqual([sectorOf(50, panels, N), sectorOf(100, panels, N), sectorOf(299, panels, N)], [1, 2, 3]);
  const posts = [{ sector: 1, first: true }, { sector: 1 }, { sector: 2, first: true }, { sector: 2 }, { sector: 3, first: true }];
  const show = (state) => posts.map((p) => postSignal(p, state, p.sector === 1 ? 3 : p.sector - 1));
  assert.deepStrictEqual(show(flagState([msg("YELLOW", "Sector", 1)], "2")), ["yellow", "yellow", "green", null, null]);
  assert.deepStrictEqual(show(flagState([msg("DOUBLE YELLOW", "Sector", 2)], "2")), [null, null, "double", "double", "green"]);
  assert.deepStrictEqual(show(flagState([], "2")), [null, null, null, null, null], "a yellow with no sector: no post");
  assert.deepStrictEqual(show(flagState([], "5")), Array(5).fill("red"));
  assert.deepStrictEqual(show(flagState([msg("DOUBLE YELLOW", "Sector", 3)], "4")), ["yellow", "yellow", "yellow", "yellow", "double"]);
  assert.deepStrictEqual(show(flagState([], "6")), Array(5).fill(null), "VSC: panels only");
});

// v0.38 (review of v0.37): the sectors came from the panels that could be DRAWN – panel 2 left out (no barrier found) put
// a post at i150 into sector 1. Now the logical map comes from the FIA data alone.
test("marshal map: a panel that can't be drawn doesn't move posts into another sector", async () => {
  const { marshalMap, sectorOf } = await load();
  const panels = [{ n: 1, i: 0 }, { n: 2, i: 100 }, { n: 3, i: 200 }], posts = [{ id: "M1.5", i: 150 }], N = 300;
  assert.strictEqual(sectorOf(150, panels.filter((p) => p.n !== 2), N), 1, "the v0.37 way (what was drawn): wrong");
  const m = marshalMap(panels, posts, N);
  assert.strictEqual(m.posts[0].sector, 2);
  assert.strictEqual(m.posts[0].prev, 1);
  assert.strictEqual(m.posts[0].first, true);
});

test("marshal map: no posts – sectors still known; no panels – posts have no sector, nothing invented", async () => {
  const { marshalMap } = await load();
  const m = marshalMap([{ n: 1, i: 10 }, { n: 2, i: 60 }], [], 100);
  assert.deepStrictEqual(m.bounds.map((b) => b.n), [1, 2]);
  assert.strictEqual(m.sectorOf(70), 2); assert.strictEqual(m.prevOf(1), 2);
  const e = marshalMap([], [{ id: "M1", i: 5 }], 100);
  assert.deepStrictEqual([e.posts[0].sector, e.posts[0].prev, e.posts[0].first], [null, null, undefined]);
});

test("marshal map: a sector's several posts, the green at the first after its panel; the lap wraps", async () => {
  const { marshalMap, flagState, postSignal } = await load();
  const N = 1000, panels = [{ n: 1, i: 950 }, { n: 2, i: 200 }, { n: 3, i: 600 }];
  const posts = [{ id: "a", i: 980 }, { id: "b", i: 20 }, { id: "c", i: 150 }, { id: "d", i: 250 }, { id: "e", i: 590 }, { id: "f", i: 700 }];
  const m = marshalMap(panels, posts, N);
  assert.deepStrictEqual(m.posts.map((p) => [p.id, p.sector, !!p.first]), [["a", 1, true], ["b", 1, false], ["c", 1, false], ["d", 2, true], ["e", 2, false], ["f", 3, true]]);
  assert.deepStrictEqual(m.posts.map((p) => p.prev), [3, 3, 3, 1, 1, 2]);
  const show = (st) => m.posts.map((p) => postSignal(p, st, p.prev));
  const msg = (Flag, Scope, Sector) => ({ Category: "Flag", Flag, Scope, Sector });
  assert.deepStrictEqual(show(flagState([msg("YELLOW", "Sector", 1)], "2")), ["yellow", "yellow", "yellow", "green", null, null]);
  assert.deepStrictEqual(show(flagState([msg("DOUBLE YELLOW", "Sector", 3)], "2")), ["green", null, null, null, null, "double"], "sector 3 wraps to panel 1");
});

test("marshal map: a panel number drawn twice (Lusail '8') starts its sector once; the copy is a mirror", async () => {
  const { marshalMap } = await load();
  const N = 1000, panels = [{ n: 7, i: 300 }, { n: 8, i: 420 }, { n: 8, i: 360 }, { n: 9, i: 500 }, { n: 1, i: 990 }];
  const m = marshalMap(panels, [{ id: "x", i: 380 }, { id: "y", i: 430 }], N);
  assert.deepStrictEqual(m.bounds.map((b) => [b.n, b.i]), [[7, 300], [8, 360], [9, 500], [1, 990]]);
  assert.deepStrictEqual(m.mirrors, [{ n: 8, i: 420 }]);
  assert.deepStrictEqual(m.posts.map((p) => [p.sector, !!p.first]), [[8, true], [8, false]]);
  assert.strictEqual(m.prevOf(9), 8);
});

test("light panels: SC and VSC are told apart; VSC ending goes green for 30 s, then dark; red over all", async () => {
  const { flagState, panelSignal, PANEL } = await load();
  const msg = (Flag, Scope, Sector) => ({ Category: "Flag", Flag, Scope, Sector });
  const ys = [msg("YELLOW", "Sector", 2), msg("DOUBLE YELLOW", "Sector", 3)];
  const at = (status, n, o) => panelSignal(n, flagState(ys, status), o);
  assert.deepStrictEqual([at("2", 1), at("2", 2), at("2", 3)], [null, "yellow", "double"]);
  assert.deepStrictEqual([at("4", 1), at("4", 3)], ["sc", "sc"]);
  assert.deepStrictEqual([at("6", 1), at("6", 3)], ["vsc", "vsc"]);
  assert.strictEqual(at("5", 1), "red");
  // VSC ending at 100 s: "VSC" for the first seconds, then green (also once back to green), then dark / the sector's own
  const E = 100000;
  assert.strictEqual(at("7", 1, { t: E + 5000, vscEnd: E }), "vsc");
  assert.strictEqual(at("7", 1, { t: E + PANEL.vscGreenAfter + 1, vscEnd: E }), "green");
  assert.strictEqual(at("1", 1, { t: E + PANEL.vscGreenAfter + 20000, vscEnd: E }), "green");
  assert.strictEqual(at("1", 2, { t: E + PANEL.vscGreenAfter + 20000, vscEnd: E }), "yellow", "the sector's own yellow is not covered by the VSC's green");
  assert.strictEqual(at("1", 2, { t: E + PANEL.vscGreenAfter + PANEL.vscGreenFor + 1, vscEnd: E }), "yellow");
  assert.strictEqual(at("7", 1, { t: E }), "vsc", "the ending's time unknown: no green made up");
  assert.strictEqual(at("4", 1, { t: E + 15000, vscEnd: E }), "sc", "a safety car after the VSC wins");
});

test("light panels: a new sector warning after a VSC ending wins over its green; real changes before the 12 s estimate", async () => {
  const { flagState, panelSignal, vscEndOf } = await load();
  const msg = (Flag, Scope, Sector) => ({ Category: "Flag", Flag, Scope, Sector });
  // the review's case: sector 4 double yellow, TrackStatus 2, the VSC ended at 1 s, shown at 14 s
  const dy = flagState([msg("DOUBLE YELLOW", "Sector", 4)], "2");
  assert.strictEqual(panelSignal(4, dy, { t: 14000, vscEnd: 1000 }), "double");
  assert.strictEqual(panelSignal(3, dy, { t: 14000, vscEnd: 1000 }), "green", "the other sectors keep the VSC's green");
  const y = flagState([msg("YELLOW", "Sector", 4)], "2");
  assert.strictEqual(panelSignal(4, y, { t: 3000, vscEnd: 1000 }), "yellow", "status back to green before the 12 s estimate: no VSC kept");
  assert.strictEqual(panelSignal(5, flagState([], "1"), { t: 3000, vscEnd: 1000 }), "green");
  // cleared again: the green until its 30 s are over, then dark
  const cl = flagState([msg("YELLOW", "Sector", 4), msg("CLEAR", "Sector", 4)], "1");
  assert.deepStrictEqual([panelSignal(4, cl, { t: 20000, vscEnd: 1000 }), panelSignal(4, cl, { t: 50000, vscEnd: 1000 })], ["green", null]);
  // a new safety car / red / VSC after the ending
  assert.strictEqual(panelSignal(4, flagState([msg("DOUBLE YELLOW", "Sector", 4)], "4"), { t: 14000, vscEnd: 1000 }), "sc");
  assert.strictEqual(panelSignal(4, flagState([], "5"), { t: 14000, vscEnd: 1000 }), "red");
  assert.strictEqual(panelSignal(4, flagState([], "6"), { t: 14000, vscEnd: 1000 }), "vsc");
  // pause / seek: the same moment always gives the same signal (the ending from the record at that moment)
  const ch = [[0, "1"], [500, "6"], [1000, "7"], [1500, "1"], [9000, "2"]];
  for (const t of [14000, 800, 14000, 3000, 14000]) {
    const st = flagState(t >= 9000 ? [msg("DOUBLE YELLOW", "Sector", 4)] : [], t < 500 ? "1" : t < 1000 ? "6" : t < 1500 ? "7" : t < 9000 ? "1" : "2");
    const want = t === 800 ? "vsc" : t === 3000 ? "green" : "double";
    assert.strictEqual(panelSignal(4, st, { t, vscEnd: vscEndOf(ch, t) }), want, "at " + t);
  }
});

test("flags from race control's list: a correction or deletion by index, never an older yellow revived", async () => {
  const { flagState } = await load();
  const { applyMessages, resetMessages } = require("../src/renderer/replay.js");
  const src = {}; resetMessages(src);
  applyMessages(src, [{ Category: "Flag", Flag: "YELLOW", Scope: "Sector", Sector: 4 }]);
  applyMessages(src, { 1: { Category: "Flag", Flag: "CLEAR", Scope: "Sector", Sector: 4 } });
  assert.strictEqual(flagState(src.messages, "1").sectors.size, 0);
  // the yellow corrected to another sector: only that one, and its clear still clears 4 only
  applyMessages(src, { 2: { Category: "Flag", Flag: "DOUBLE YELLOW", Scope: "Sector", Sector: 7 } });
  applyMessages(src, { 2: { Sector: 8 } });
  assert.deepStrictEqual([...flagState(src.messages, "2").sectors], [[8, "DOUBLE YELLOW"]]);
  // the yellow taken back: gone, nothing before it revived
  applyMessages(src, { _deleted: ["2"] });
  assert.strictEqual(flagState(src.messages, "1").sectors.size, 0);
  // a deleted CLEAR does bring its yellow back – race control withdrew the clear
  applyMessages(src, { _deleted: ["1"] });
  assert.deepStrictEqual([...flagState(src.messages, "2").sectors], [[4, "YELLOW"]]);
});

test("flags after a seek: forward, back and forward again – the same state as played, a later correction not early", async () => {
  const { flagState } = await load();
  const { Replay } = require("../src/renderer/replay.js");
  const F = (Flag, Sector) => ({ Category: "Flag", Flag, Scope: "Sector", Sector });
  const r = new Replay({ duration: 60000, topics: {
    TrackStatus: [[1000, { Status: "2" }], [30000, { Status: "1" }], [40000, { Status: "6" }], [50000, { Status: "7" }]],
    RaceControlMessages: [[1000, { Messages: [F("YELLOW", 5)] }], [10000, { Messages: { 0: { Flag: "DOUBLE YELLOW" } } }], [30000, { Messages: { 1: F("CLEAR", 5) } }]],
  } });
  const at = (t) => { r.seek(t); const s = flagState(r.messages, r.state.TrackStatus?.Status ?? null); return [[...s.sectors], s.vsc]; };
  const played = [5000, 15000, 35000, 45000].map(at);
  assert.deepStrictEqual(played, [[[[5, "YELLOW"]], false], [[[5, "DOUBLE YELLOW"]], false], [[], false], [[], true]]);
  assert.deepStrictEqual([45000, 35000, 15000, 5000].map(at), [...played].reverse(), "back: the same");
  assert.deepStrictEqual(at(5000), [[[5, "YELLOW"]], false], "the correction at 10 s isn't seen at 5 s");
});

test("VSC ending's start: only straight from a VSC; a later SC or VSC ends it", async () => {
  const { vscEndOf } = await load();
  const ch = [[0, "1"], [100, "6"], [200, "7"], [300, "1"], [400, "4"], [500, "1"], [600, "7"]];
  assert.deepStrictEqual([50, 150, 250, 350, 450, 650].map((t) => vscEndOf(ch, t)), [null, null, 200, 200, null, null]);
});
