// v0.71: the page's shared helpers (src/shared/fmt.js) – one copy for the timing screen, the home screen, the dialog kit
// and the 3D view's HUD.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const Fmt = require("../src/shared/fmt.js");

test("fmt v0.71: esc makes text safe for markup and quoted attributes", () => {
  assert.strictEqual(Fmt.esc(`<b a="1" b='2'>&</b>`), "&lt;b a=&quot;1&quot; b=&#39;2&#39;&gt;&amp;&lt;/b&gt;");
  assert.strictEqual(Fmt.esc(null), ""); assert.strictEqual(Fmt.esc(undefined), ""); assert.strictEqual(Fmt.esc(0), "0");
});
test("fmt v0.71: hms, toOffset, KST", () => {
  assert.strictEqual(Fmt.hms(3723000), "01:02:03"); assert.strictEqual(Fmt.hms(-5), "00:00:00");
  assert.strictEqual(Fmt.toOffset("-03:00:00"), "-03:00"); assert.strictEqual(Fmt.toOffset("08:00:00"), "+08:00"); assert.strictEqual(Fmt.toOffset(""), "+00:00");
  assert.match(Fmt.KST({ hour: "2-digit", minute: "2-digit", hour12: false }).format(Date.UTC(2026, 0, 1, 0, 30)), /09:30/);
});
test("fmt v0.71: the store and the tokens answer with the default where there is no page", () => {
  assert.strictEqual(Fmt.store.get("nothing", 7), 7); Fmt.store.set("nothing", 1);
  assert.strictEqual(Fmt.token("--c-blue", "#3d4dff"), "#3d4dff");
});
test("fmt v0.71: the page loads it first, and the screens carry no copy of esc of their own", () => {
  const R = path.join(__dirname, "../src/renderer"), html = fs.readFileSync(path.join(R, "index.html"), "utf8");
  assert.ok(html.indexOf("shared/fmt.js") > 0 && html.indexOf("shared/fmt.js") < html.indexOf("ui/kit.js"));
  for (const f of ["app.js", "home.js", "ui/kit.js", "spectator/hud.js", "game/pitpanel.js"]) assert.doesNotMatch(fs.readFileSync(path.join(R, f), "utf8"), /const esc = \([a-z]\) => String/, f);
});
