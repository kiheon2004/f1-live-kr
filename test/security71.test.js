// v0.71 security pass: what comes from outside the app – an imported scenario file, the live feed's topic names, a
// download's answer – is checked before it is used as a key, a loop length, markup or a style value.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { GameStore, cleanScenario } = require("../src/main/gamestore.js");
const { decode, TOPICS } = require("../src/main/live.js");
const { Replay, merge } = require("../src/renderer/replay.js");

test("security v0.71: a scenario's season and team colours reach the page only as a year and #rrggbb", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-sec-"));
  try {
    fs.mkdirSync(path.join(dir, "scenarios"), { recursive: true });
    const bad = { format: "f1kr-game-scenario", version: 1, meta: { id: "x", season: "</select><b>hi</b>", event: "E" }, race: { laps: 3 }, track: { L: 5000 },
      entries: [{ num: "1", tla: "AAA", teamKey: "T", colour: "red;position:fixed;inset:0" }, { num: "2", tla: "BBB", teamKey: "T", colour: "#3671C6" }] };
    fs.writeFileSync(path.join(dir, "scenarios", "x.scenario.json"), JSON.stringify(bad));
    const store = new GameStore(dir);
    const [s] = await store.listScenarios();
    assert.strictEqual(s.season, null);
    assert.deepStrictEqual(s.entries.map((e) => e.colour), [null, "#3671C6"]);
    const full = await store.loadScenario("x");
    assert.strictEqual(full.meta.season, null);
    assert.deepStrictEqual(full.entries.map((e) => e.colour), [null, "#3671C6"]);
    assert.strictEqual(cleanScenario({ meta: { season: 2026 }, entries: [{ colour: "27F4D2" }] }).meta.season, 2026);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("security v0.71: the game store's own fields cannot be replaced by the page's object", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-sec-"));
  try {
    const store = new GameStore(dir);
    const r = await store.saveResult("race_1", { kind: "anything", scenarioId: "other", savedAt: "1999", seed: 7 });
    const saved = JSON.parse(fs.readFileSync(path.join(dir, r.file), "utf8"));
    assert.strictEqual(saved.kind, "f1kr-game-result"); assert.strictEqual(saved.scenarioId, "race_1"); assert.notStrictEqual(saved.savedAt, "1999"); assert.strictEqual(saved.seed, 7);
    const g = await store.saveGame("slot1", { meta: { slot: "../../x", savedAt: "1999", lap: 4 }, state: {} });
    assert.strictEqual(g.meta.slot, "slot1"); assert.notStrictEqual(g.meta.savedAt, "1999"); assert.strictEqual(g.meta.lap, 4);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("security v0.71: scenario validation – the season is a year, and the file's own sample count is not looped over blindly", async () => {
  const { validateScenario } = await import("../src/game/data/scenario.js");
  const t0 = Date.now();
  const v = validateScenario({ format: "f1kr-game-scenario", version: 1, meta: { id: "x", season: "<img>", event: "E", sessionPath: "p", builtAt: "t", sources: ["s"], estimates: [] },
    track: { n: Number.MAX_SAFE_INTEGER, L: 5000, ds: 2, columns: { x: [0], y: [0] } } });
  assert.ok(Date.now() - t0 < 2000, "returns at once");
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => /meta\.season/.test(e)), v.errors.join("; "));
  assert.ok(v.errors.some((e) => /track\.n/.test(e)), v.errors.join("; "));
});

test("security v0.71: the live feed – only subscribed topics are passed on, and a topic can never be the prototype", () => {
  assert.deepStrictEqual(decode("__proto__", { polluted: 1 }), [null, null]);
  assert.deepStrictEqual(decode("constructor", {}), [null, null]);
  assert.deepStrictEqual(decode("SomethingNew", {}), [null, null]);
  assert.deepStrictEqual(decode("TimingData", { a: 1 }), ["TimingData", { a: 1 }]);
  for (const t of TOPICS) assert.ok(decode(t.replace(/\.z$/, ""), {})[0], t);
  // (the page's side: a topic named like a prototype key leaves Object.prototype alone)
  // (a recording with a topic named like a prototype key – a file name in the cache could be made so: applied without
  // touching Object.prototype)
  const topics = JSON.parse('{"__proto__":[[10,{"polluted":"yes"}]],"SessionInfo":[[20,{"Name":"Race"}]]}');
  const r = new Replay({ duration: 1000, topics });
  r.seek(500);
  assert.strictEqual({}.polluted, undefined);
  assert.strictEqual(r.state.SessionInfo?.Name, "Race");
  assert.strictEqual(merge({}, JSON.parse('{"__proto__":{"polluted":"yes"}}')).polluted, undefined);
  assert.ok(Replay);
});

test("security v0.71: the page's policy and the windows' guards are in place", () => {
  const html = fs.readFileSync(path.join(__dirname, "../src/renderer/index.html"), "utf8");
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  for (const d of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(d), d);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe/);
  const main = fs.readFileSync(path.join(__dirname, "../src/main/main.js"), "utf8"), auth = fs.readFileSync(path.join(__dirname, "../src/main/auth.js"), "utf8");
  assert.doesNotMatch(main, /openExternal/);
  assert.match(main, /setPermissionRequestHandler/); assert.match(auth, /setPermissionRequestHandler/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: "deny" \}\)\)/);
  // the sign-in log's address cleaner: no parameter value survives, whatever its name
  const src = /const clean = \(u\) => (.+);\n/.exec(auth)[1];
  const clean = new Function("u", "return " + src);
  const out = clean("https://id.formula1.com/as/authorize?client_id=abc&refresh_token=SECRET1&foo=SECRET2#/x?redirect=SECRET3");
  assert.doesNotMatch(out, /SECRET|abc/); assert.match(out, /refresh_token=…/); assert.match(out, /^https:\/\/id\.formula1\.com\/as\/authorize/);
});
