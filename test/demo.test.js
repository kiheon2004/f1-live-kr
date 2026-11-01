// The offline demo (npm run demo): its synthetic session through the replay's own code – tools/verify-demo.js
const test = require("node:test");
const assert = require("node:assert");
const { verifyDemo } = require("../tools/verify-demo.js");
const demo = require("../src/main/demo.js");

test("offline demo: the synthetic session passes every check of npm run verify:demo", () => {
  const res = verifyDemo();
  for (const c of res.checks) assert.ok(c.ok, `${c.name} – ${c.detail}`);
});

test("offline demo: marked as synthetic, with no place and no circuit key (no map download, no real circuit)", () => {
  const d = demo.loadDemo(), si = d.topics.SessionInfo[0][1];
  assert.strictEqual(d.demo, true);
  assert.match(si.Meeting.OfficialName, /합성 데이터/);
  assert.ok(!si.Meeting.Location && si.Meeting.Circuit.Key == null && !si.Path);
});
