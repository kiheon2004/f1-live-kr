// v0.44: a retired car standing in the pit lane is wheeled into the garage where it stands (pitstate.js) – not left in
// the lane the others drive and stop in. (2025 Monaco: Gasly's car, retired at 1:10:41, stood – by the feed's frozen
// position – in Williams' box for the rest of the race, where both Williams stopped.) Inputs are SYNTHETIC, in the form
// map3d.js pitFrame passes them.
const test = require("node:test");
const assert = require("node:assert");

const base = { u: 168, gStart: 0, gEnd: 300, inPit: true, onLane: true, speed: 0, stillFor: 90, boxU: 114, boxFrom: "stops", penalty: null, pitStart: null, race: true, teammateInBox: false, lastBox: null, retired: true };
const S = async () => (await import("../src/renderer/pitstate.js"));
const cs = { ok: true, fastC: 9, boxC: 5 };

test("retired v0.44: standing away from its box – into the garage there, eased in from the flag; not the fast lane", async () => {
  const { pitState, laneOffsetOf } = await S();
  const at = (retiredFor) => pitState({ ...base, retiredFor });
  assert.strictEqual(at(0).lane, "garage"); assert.strictEqual(at(0).state, "retired");
  assert.strictEqual(at(0).w, 0, "at the flag: where it stood");
  assert.ok(at(2).w > 0 && at(2).w < 1, "going in");
  assert.strictEqual(at(30).w, 1);
  assert.ok(at(30).evidence.some((e) => /estimate/.test(e)), "marked as an estimate");
  // across: from the fast lane's centre at w 0 (laneOffsetOf's garage: the box lane, then 2.5 m inside the garage front)
  const off = (w) => laneOffsetOf({ lane: "garage", w }, cs, 9, 150, 0, 300);
  assert.strictEqual(off(1), -2.5); assert.ok(off(0) > off(1));
  // retired in its own box (standing): the garage too – its teammate's later stops need the box
  assert.strictEqual(pitState({ ...base, u: 114, retiredFor: 60 }).lane, "garage");
});

test("retired v0.44: the standstill after the flag sets the pace in; still moving – the fast lane (or its box), as before", async () => {
  const { pitState } = await S();
  // retired while rolling in: stood only 1 s now, the flag 50 s ago – just beginning to go in
  const r = pitState({ ...base, stillFor: 1, retiredFor: 50 });
  assert.strictEqual(r.lane, "garage"); assert.ok(r.w > 0 && r.w < 0.5, String(r.w));
  assert.strictEqual(pitState({ ...base, speed: 8, stillFor: 0, retiredFor: 5 }).lane, "fast");
  assert.strictEqual(pitState({ ...base, speed: 3, stillFor: 0, u: 116, retiredFor: 5 }).lane, "box");
  // without retiredFor (an older caller): by its standstill
  assert.strictEqual(pitState({ ...base, retiredFor: undefined }).w, 1);
  // not retired: a car standing 90 s away from its box stays queued in the fast lane (a red-flag wait, a queue)
  assert.strictEqual(pitState({ ...base, retired: false }).lane, "fast");
});
