// v0.50: live timing status rules (src/renderer/ui/livestatus.js) – stale values are told apart from real zeros, the
// race control badge never hides an important message, and late async answers never overwrite a newer session.
const test = require("node:test");
const assert = require("node:assert");
const L = require("../src/renderer/ui/livestatus.js");

test("livestatus v0.50: stale – only live, with data on screen; by connection state, then by the age of the last message", () => {
  const base = { mode: "live", liveOnScreen: true, hasDrivers: true, conn: "live", now: 100e3, lastReceived: 95e3 };
  assert.strictEqual(L.stale(base), null, "fresh");
  assert.strictEqual(L.stale({ ...base, mode: "replay" }), null, "a replay is never stale");
  assert.strictEqual(L.stale({ ...base, hasDrivers: false }), null, "nothing on screen yet (waiting out the delay is not stale)");
  assert.strictEqual(L.stale({ ...base, liveOnScreen: false }), null);
  const old = L.stale({ ...base, lastReceived: 100e3 - 45e3 });
  assert.strictEqual(old.level, "warn"); assert.strictEqual(old.age, 45e3); assert.match(old.text, /45초째/); assert.match(old.text, /0이라는 뜻이 아니에요/);
  assert.strictEqual(L.stale({ ...base, lastReceived: 100e3 - 29e3 }), null, "under the 30 s threshold");
  assert.strictEqual(L.stale({ ...base, conn: "reconnecting" }).level, "bad");
  assert.strictEqual(L.stale({ ...base, conn: "error", message: "HTTP 503" }).level, "bad");
  assert.match(L.stale({ ...base, conn: "error", message: "HTTP 503" }).text, /HTTP 503/);
  assert.strictEqual(L.stale({ ...base, conn: "stopped" }).level, "warn");
  assert.strictEqual(L.stale({ ...base, lastReceived: -Infinity }), null, "no message timestamps at all: unknown, not stale");
});

test("livestatus v0.50: race control kinds and the unread badge – the most serious kind colours it", () => {
  const M = (Message, extra = {}) => ({ Message, ...extra });
  assert.strictEqual(L.rcKind(M("RED FLAG")), "red");
  assert.strictEqual(L.rcKind(M("RED FLAG - RACE SUSPENDED")), "red");
  assert.strictEqual(L.rcKind(M("CHEQUERED FLAG", { Flag: "CHEQUERED" })), "chequered", "v0.49 took the chequered flag for a red flag (its letters contain RED FLAG)");
  assert.strictEqual(L.rcKind(M("CAR 1 (VER) TIME 1:23.456 DELETED - RED FLAG INFRINGEMENT")), "", "an infringement note is not a red flag");
  assert.strictEqual(L.rcKind(M("SAFETY CAR DEPLOYED", { Category: "SafetyCar" })), "sc");
  assert.strictEqual(L.rcKind(M("VSC DEPLOYED")), "sc");
  assert.strictEqual(L.rcKind(M("5 SECOND TIME PENALTY FOR CAR 27 (HUL) - FALSE START")), "penalty");
  assert.strictEqual(L.rcKind(M("FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 27 (HUL) SERVED")), "", "a served penalty is no news");
  assert.strictEqual(L.rcKind(M("YELLOW IN TRACK SECTOR 4", { Flag: "YELLOW" })), "yellow");
  assert.strictEqual(L.rcKind(M("CHEQUERED FLAG", { Flag: "CHEQUERED" })), "chequered");
  assert.strictEqual(L.rcKind(M("GREEN LIGHT - PIT EXIT OPEN", { Flag: "GREEN" })), "green");
  const msgs = [M("GREEN LIGHT", { Flag: "GREEN" }), M("YELLOW IN TRACK SECTOR 2", { Flag: "YELLOW" }), M("SAFETY CAR DEPLOYED", { Category: "SafetyCar" })];
  // after a jump (-1): everything there is counts as seen
  assert.deepStrictEqual(L.rcUnread(msgs, -1, false), { seen: 3, count: 0, top: "" });
  // two new ones while another tab is open: badge 2, coloured by the SC
  assert.deepStrictEqual(L.rcUnread(msgs, 1, false), { seen: 1, count: 2, top: "sc" });
  // the tab opened: all seen
  assert.deepStrictEqual(L.rcUnread(msgs, 1, true), { seen: 3, count: 0, top: "" });
  // a red flag outranks the SC
  assert.strictEqual(L.rcUnread([...msgs, M("RED FLAG")], 1, false).top, "red");
  // the list got shorter (a new session / replay): seen is clamped, nothing counted
  assert.deepStrictEqual(L.rcUnread(msgs.slice(0, 1), 3, false), { seen: 1, count: 0, top: "" });
});

test("livestatus v0.50: late answers apply only to what they were asked for (session / mode / place)", () => {
  // the live outline asked in live mode, answered after a switch to replay: dropped
  assert.strictEqual(L.answerApplies({ mode: "live" }, { mode: "replay" }), false);
  assert.strictEqual(L.answerApplies({ mode: "live" }, { mode: "live" }), true);
  // a session's answer arriving after another session was loaded: dropped
  const a = L.sessionTag("replay", "2025/2025-08-03_Hungarian_Grand_Prix/2025-08-03_Race/"), b = L.sessionTag("replay", "2025/2025-05-25_Monaco_Grand_Prix/2025-05-25_Race/");
  assert.notStrictEqual(a, b);
  assert.strictEqual(L.answerApplies({ tag: a, loc: "Budapest" }, { tag: b, loc: "Monaco" }), false);
  assert.strictEqual(L.answerApplies({ tag: a, loc: "Budapest" }, { tag: a, loc: "Budapest", extra: 1 }), true, "only the fields asked for are compared");
  assert.strictEqual(L.sessionTag("live", null, 9876), "live:9876");
  assert.strictEqual(L.sessionTag("live", null, undefined), "live:");
  assert.strictEqual(L.answerApplies(null, { mode: "live" }), false);
});
