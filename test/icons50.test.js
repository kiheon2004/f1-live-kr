// v0.50: every icon the live screen names (index.html data-icon="…", app.js / home.js ico("…")) is in the bundled Lucide
// subset (src/renderer/icons.js), the subset is plain SVG shapes only, and its license file is there.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const I = require("../src/renderer/icons.js");
const R = path.join(__dirname, "../src/renderer");

test("icons v0.50: every icon name used by the page exists", () => {
  const html = fs.readFileSync(path.join(R, "index.html"), "utf8"), js = fs.readFileSync(path.join(R, "app.js"), "utf8");
  const used = new Set([...html.matchAll(/data-icon="([a-z0-9-]+)"/g)].map((m) => m[1]).concat([...js.matchAll(/ico\("([a-z0-9-]+)"/g)].map((m) => m[1])));
  assert.ok(used.size >= 10, `found ${used.size}`);
  for (const n of used) assert.ok(I.has(n), `missing icon ${n}`);
});
test("icons v0.50: svg() – decorative by default, labelled when asked; unknown names give nothing; shapes only", () => {
  assert.match(I.svg("play"), /^<svg class="ui-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path /);
  assert.match(I.svg("play", { label: "재생 \"A\"" }), /role="img" aria-label="재생 &quot;A&quot;"/);
  assert.match(I.svg("pin", { size: 14, cls: "x" }), /class="ui-ico x" viewBox="0 0 24 24" width="14" height="14"/);
  assert.strictEqual(I.svg("no-such-icon"), "");
  for (const n of I.names()) assert.doesNotMatch(I.svg(n), /<script|on\w+=|href=/i, n);
  assert.match(fs.readFileSync(path.join(R, "ICONS-LICENSE.txt"), "utf8"), /ISC License/);
});
