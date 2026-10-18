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
