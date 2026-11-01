// v0.53 cockpit-camera motion settings (motionprefs.js): defaults (head turn full, no vibration, reduced motion from the
// system), the v0.52 head switch still honoured, reduced motion overrides both, values clamped; vibration a pure function
// of the kerb's pattern and speed – none standing, off a kerb or at strength 0; small (≤ 6 mm, ≤ 0.12°).
const test = require("node:test");
const assert = require("node:assert");
const load = () => import("../src/renderer/motionprefs.js");
const store = (o) => (k) => (k in o ? o[k] : null);

test("defaults and keys", async () => {
  const { readMotionPrefs, MOTION_KEYS: K } = await load();
  assert.deepStrictEqual(readMotionPrefs(store({})), { head: 1, vib: 0, mode: "auto", reduce: false, headGain: 1, vibration: 0 });
  assert.strictEqual(readMotionPrefs(store({ [K.legacyHead]: "off" })).headGain, 0, "v0.52 switch off → no head turn");
  assert.strictEqual(readMotionPrefs(store({ [K.legacyHead]: "off", [K.head]: "0.5" })).headGain, 0.5, "the strength wins once set");
  assert.strictEqual(readMotionPrefs(store({ [K.head]: "7" })).headGain, 1, "clamped");
  assert.strictEqual(readMotionPrefs(store({ [K.vib]: "-1" })).vibration, 0, "clamped");
  assert.strictEqual(readMotionPrefs(store({ [K.vib]: "junk" })).vibration, 0, "junk → default");
  assert.strictEqual(readMotionPrefs(() => { throw new Error("no storage"); }).headGain, 1, "no storage → defaults");
});

test("reduced motion: on / off / auto (the system's wish)", async () => {
  const { readMotionPrefs, MOTION_KEYS: K } = await load();
  const s = { [K.head]: "1", [K.vib]: "1" };
  assert.deepStrictEqual([readMotionPrefs(store(s), true).headGain, readMotionPrefs(store(s), true).vibration], [0, 0], "auto + system → off");
  assert.deepStrictEqual([readMotionPrefs(store(s), false).headGain, readMotionPrefs(store(s), false).vibration], [1, 1]);
  assert.strictEqual(readMotionPrefs(store({ ...s, [K.reduce]: "off" }), true).vibration, 1, "off overrides the system");
  assert.strictEqual(readMotionPrefs(store({ ...s, [K.reduce]: "on" }), false).headGain, 0, "on");
});

test("vibration: small, from the kerb's pattern and speed only", async () => {
  const { vibrationAt, VIB } = await load();
  assert.deepStrictEqual(vibrationAt(0.8, 50, 0), [0, 0], "strength 0: none");
  assert.deepStrictEqual(vibrationAt(0, 50, 1), [0, 0], "off a kerb: none");
  assert.deepStrictEqual(vibrationAt(0.8, 0, 1), [0, 0], "standing: none");
  const [l, p] = vibrationAt(1, 80, 1); assert.ok(l <= 0.006 + 1e-12 && p * 180 / Math.PI <= 0.125, "≤ 6 mm, ≤ 0.12°");
  assert.ok(Math.abs(vibrationAt(1, VIB.fullAt / 2, 1)[0] - VIB.lift / 2) < 1e-12, "faded in with speed");
  assert.deepStrictEqual(vibrationAt(-0.4, 30, 0.5), vibrationAt(-0.4, 30, 0.5), "pure");
});
