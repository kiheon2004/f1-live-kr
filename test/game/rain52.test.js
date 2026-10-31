// v0.52: rain starting / stopping are logged as events (the alerts and the results' weather bands read them; before
// they were never written) and every lap record carries the line's water and the rain rate at its end.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const GBR = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game/2025-07-06_British_Grand_Prix_2025-07-06_Race.scenario.json"), "utf8"));

test("British 2025 (rain): one rainStart and one rainEnd, in order; laps carry water / rain; a restore mid-shower logs the same", async () => {
  const E = await import("../../src/game/engine/engine.js");
  const a = E.createRace({ scenario: GBR, seed: 2, userTeam: "Ferrari", ai: true });
  while (a.state.t < 25 * 60000) E.step(a);
  const b = E.loadRace(E.saveRace(a), GBR);
  for (const r of [a, b]) while (r.state.t < 40 * 60000) E.step(r);
  const ev = (r) => r.state.log.filter((e) => e.type === "rainStart" || e.type === "rainEnd").map((e) => e.type + "@" + e.t);
  assert.deepStrictEqual(ev(a).map((x) => x.split("@")[0]), ["rainStart", "rainEnd"]);
  assert.deepStrictEqual(ev(b), ev(a));
  const laps = E.analysis(a, ["16"]).cars["16"].laps;
  assert.ok(laps.every((l) => Number.isFinite(l.water) && Number.isFinite(l.rain)));
  assert.ok(laps.some((l) => l.water > 0.1) && laps.some((l) => l.rain > 1));
});
