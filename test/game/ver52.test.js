// v0.52 §7: format vs model vs parameters – saves carry the engine and the parameter fingerprint, a restored race knows
// which model wrote it and records a change of model, the load check warns (never blocks) and never invents an identity.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const SC = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/game/2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), "utf8"));

test("model identity: the parameter fingerprint has its form; saves carry engine + params; a restored race records a change of model", async () => {
  const V = await import("../../src/game/data/params/version.js"), E = await import("../../src/game/engine/engine.js");
  assert.match(V.PARAMS_HASH, /^[0-9a-f]{8}$/); assert.strictEqual(E.MODEL.params, V.PARAMS_VERSION); assert.strictEqual(E.MODEL.engine, E.ENGINE_VERSION);
  const r = E.createRace({ scenario: SC, seed: 1 }); for (let i = 0; i < 100; i++) E.step(r);
  const o = JSON.parse(E.saveRace(r)); assert.strictEqual(o.engine, E.ENGINE_VERSION); assert.strictEqual(o.params, V.PARAMS_VERSION);
  const b = E.loadRace(o, SC); assert.deepStrictEqual([b.loadInfo.sameEngine, b.loadInfo.sameParams], [true, true]); assert.strictEqual(b.state.models.length, 1);
  // another model wrote it: continued, and the race records from when it ran on this model
  const old = { ...o, engine: "0.50.0-engine.1", params: "0.50.0-params+deadbeef" }; old.state = { ...o.state, models: [{ t: 0, engine: "0.50.0-engine.1", params: "0.50.0-params+deadbeef" }] };
  const c = E.loadRace(old, SC); assert.strictEqual(c.loadInfo.sameEngine, false); assert.strictEqual(c.state.models.length, 2); assert.strictEqual(c.state.models[1].engine, E.ENGINE_VERSION);
  // before v0.52: no identity – unknown, not guessed
  const pre = { ...o }; delete pre.engine; delete pre.params; pre.state = { ...o.state }; delete pre.state.models;
  const d = E.loadRace(pre, SC); assert.strictEqual(d.loadInfo.engine, null); assert.strictEqual(d.state.models[0].engine, null); assert.match(d.state.models[0].note, /unknown/);
});

test("load check: a readable save of another model or without identity is allowed with plain warnings; another format is refused", async () => {
  const A = await import("../../src/renderer/game/gameapi.js");
  const E = { STATE_VERSION: 1, ENGINE_VERSION: "0.52.0-engine.1", PARAMS_VERSION: "0.52.0-params.1+aaaa" }, list = [{ id: "x" }];
  const base = { kind: "f1kr-game-save", stateVersion: 1, race: "{}", scenarioId: "x" };
  let r = A.checkSave({ ...base, engine: E.ENGINE_VERSION, params: E.PARAMS_VERSION }, E, list); assert.ok(r.ok); assert.strictEqual(r.warn.length, 0);
  r = A.checkSave({ ...base, engine: "0.50.0-engine.1", params: "p" }, E, list); assert.ok(r.ok); assert.ok(r.warn.some((w) => /계산 모델이 바뀌었어요/.test(w)) && r.warn.some((w) => /밸런스 파라미터/.test(w)));
  r = A.checkSave({ ...base }, E, list); assert.ok(r.ok); assert.ok(r.warn.some((w) => /모델 정보가 없어요/.test(w)));
  r = A.checkSave({ ...base, stateVersion: 2 }, E, list); assert.strictEqual(r.ok, false);
});
