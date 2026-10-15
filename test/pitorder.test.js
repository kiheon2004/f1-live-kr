// The teams' pit boxes (pitorder.js): the previous season's constructors' order, each circuit's measured boxes.
const test = require("node:test");
const assert = require("node:assert");

test("team names across seasons and spellings", async () => {
  const { teamKey } = await import("../src/renderer/pitorder.js");
  assert.strictEqual(teamKey("Oracle Red Bull Racing"), "Red Bull Racing");
  assert.strictEqual(teamKey("RB"), "Racing Bulls");
  assert.strictEqual(teamKey("Visa Cash App RB F1 Team"), "Racing Bulls");
  assert.strictEqual(teamKey("Racing Bulls"), "Racing Bulls");
  assert.strictEqual(teamKey("Stake F1 Team Kick Sauber"), "Kick Sauber");
  assert.strictEqual(teamKey("Haas F1 Team"), "Haas F1 Team");
  assert.strictEqual(teamKey("Nobody"), null);
});

test("boxes: the champions' at the entry end (Silverstone 2026) or the exit end (Suzuka), down the order", async () => {
  const { publishedBoxes } = await import("../src/renderer/pitorder.js");
  const teams = ["Cadillac", "McLaren", "Mercedes", "Audi", "Ferrari", "Red Bull Racing"];
  const at = (key) => Object.fromEntries(publishedBoxes(key, 2026, teams).map((b) => [b.team, b]));
  const sil = at(2);
  assert.ok(sil.McLaren.u < sil.Mercedes.u && sil.Mercedes.u < sil["Red Bull Racing"].u && sil.Ferrari.u < sil.Audi.u && sil.Audi.u < sil.Cadillac.u);
  assert.deepStrictEqual([sil.McLaren.rank, sil.Audi.rank, sil.Cadillac.rank], [1, 9, 11]);
  const suz = at(46);
  assert.ok(suz.McLaren.u > suz.Mercedes.u && suz.Mercedes.u > suz.Cadillac.u, "Suzuka: the other way round");
  // 2025: Sauber in Audi's place; 2024: RB
  const s25 = Object.fromEntries(publishedBoxes(2, 2025, ["Kick Sauber", "McLaren"]).map((b) => [b.team, b.rank]));
  assert.deepStrictEqual(s25, { "Kick Sauber": 10, McLaren: 1 });
  assert.strictEqual(publishedBoxes(2, 2024, ["RB"])[0].rank, 8);
  // nothing known: no boxes
  assert.strictEqual(publishedBoxes(999, 2026, teams), null);
  assert.strictEqual(publishedBoxes(2, 2019, teams), null);
});

test("every circuit with a measured pit lane has its boxes, in the pit lane, evenly enough spaced", async () => {
  const { PIT_BOXES } = await import("../src/renderer/pitorder.js");
  const { START_DATA } = await import("../src/renderer/startdata.js");
  for (const key of Object.keys(START_DATA)) {
    const b = PIT_BOXES[key]; assert.ok(b, `circuit ${key}`);
    assert.strictEqual(b.boxes.length, 11);
    const pit = START_DATA[key].pit, lo = Math.min(...b.boxes), hi = Math.max(...b.boxes);
    assert.ok(lo > Math.max(0, pit.limitOn - 30) && hi < pit.limitOff + 30, `circuit ${key}: boxes ${lo}–${hi} inside the limiter lines ${pit.limitOn}–${pit.limitOff}`);
    for (let i = 1; i < 11; i++) assert.ok((b.boxes[i] - b.boxes[i - 1]) * b.dir > 0, `circuit ${key}: in order`);
  }
});
