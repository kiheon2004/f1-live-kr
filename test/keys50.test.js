// v0.50: the global shortcut policy (src/renderer/ui/keys.js) – when Space / arrows / , . [ ] are the timing screen's
// shortcuts and when they belong to the focused control, an IME, a dialog or the screen on top. The events and targets
// below are plain descriptions (no DOM), as app.js builds them with UIKeys.describe().
const test = require("node:test");
const assert = require("node:assert");
const K = require("../src/renderer/ui/keys.js");

const ev = (o) => ({ key: "", code: "", repeat: false, isComposing: false, keyCode: 0, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...o });
const SPACE = ev({ key: " ", code: "Space" });
const body = { tag: "BODY", type: "", role: "", editable: false, inSplitter: false, button: false, focusVisible: false };

test("keys v0.50: Space toggles, arrows seek in replay; , . [ ] nudge the delay in live", () => {
  assert.deepStrictEqual(K.decide(SPACE, { mode: "replay", target: body }), { run: "toggle", prevent: true, blur: false });
  assert.strictEqual(K.decide(ev({ key: "ArrowRight", code: "ArrowRight" }), { mode: "replay", target: body }).run, "seek+5");
  assert.strictEqual(K.decide(ev({ key: "ArrowLeft", code: "ArrowLeft", shiftKey: true }), { mode: "replay", target: body }).run, "seek-60");
  assert.strictEqual(K.decide(SPACE, { mode: "live", target: body }).run, "toggle");
  for (const [key, run] of [[",", "delay-1"], [".", "delay+1"], ["[", "delay-5"], ["]", "delay+5"]]) assert.strictEqual(K.decide(ev({ key }), { mode: "live", target: body }).run, run);
  assert.strictEqual(K.decide(ev({ key: "," }), { mode: "replay", target: body }).run, null, "the delay keys are live only");
  assert.strictEqual(K.decide(ev({ key: "ArrowRight", code: "ArrowRight" }), { mode: "live", target: body }).run, null, "no seeking live");
  assert.strictEqual(K.decide(ev({ key: "a", code: "KeyA" }), { mode: "replay", target: body }).run, null);
});

test("keys v0.50: never while typing – input, textarea, select, slider, contenteditable, audio, splitter", () => {
  for (const t of [{ ...body, tag: "INPUT", type: "text" }, { ...body, tag: "TEXTAREA" }, { ...body, tag: "SELECT" }, { ...body, tag: "INPUT", type: "range" },
    { ...body, tag: "DIV", editable: true }, { ...body, tag: "AUDIO" }, { ...body, tag: "DIV", inSplitter: true }, { ...body, tag: "DIV", role: "slider" }, { ...body, tag: "INPUT", type: "checkbox" }]) {
    const d = K.decide(SPACE, { mode: "replay", target: t });
    assert.deepStrictEqual(d, { run: null, prevent: false, blur: false }, JSON.stringify(t));
    assert.strictEqual(K.decide(ev({ key: "ArrowLeft", code: "ArrowLeft" }), { mode: "replay", target: t }).run, null);
    assert.strictEqual(K.decide(ev({ key: "]" }), { mode: "live", target: t }).run, null);
  }
});

test("keys v0.50: IME composition (Korean input) is never a shortcut – isComposing or key code 229", () => {
  assert.strictEqual(K.decide({ ...SPACE, isComposing: true }, { mode: "replay", target: body }).run, null);
  assert.strictEqual(K.decide(ev({ key: "Process", code: "Space", keyCode: 229 }), { mode: "replay", target: body }).run, null);
  assert.strictEqual(K.decide(ev({ key: ".", isComposing: true }), { mode: "live", target: body }).run, null);
});

test("keys v0.50: a dialog open, the home screen or the game on top, or a modifier held – no shortcut", () => {
  assert.strictEqual(K.decide(SPACE, { mode: "replay", target: body, dialogOpen: true }).run, null);
  assert.strictEqual(K.decide(SPACE, { mode: "replay", target: body, covered: true }).run, null);
  for (const m of ["metaKey", "ctrlKey", "altKey"]) assert.strictEqual(K.decide({ ...SPACE, [m]: true }, { mode: "replay", target: body }).run, null, m);
  // (nothing prevented either: the dialog / the game / the system gets the key as it is)
  assert.strictEqual(K.decide(SPACE, { mode: "replay", target: body, dialogOpen: true }).prevent, false);
});

test("keys v0.50: Space held down (key repeat) toggles once – repeats only stop the page from scrolling", () => {
  const first = K.decide(SPACE, { mode: "replay", target: body });
  const held = K.decide({ ...SPACE, repeat: true }, { mode: "replay", target: body });
  assert.strictEqual(first.run, "toggle");
  assert.deepStrictEqual(held, { run: null, prevent: true, blur: false });
  // simulate: down, 10 repeats → state flipped exactly once
  let playing = false;
  for (const e of [SPACE, ...Array.from({ length: 10 }, () => ({ ...SPACE, repeat: true }))]) if (K.decide(e, { mode: "live", target: body }).run === "toggle") playing = !playing;
  assert.strictEqual(playing, true);
  // (the delay nudges don't run away either when a key is held)
  assert.strictEqual(K.decide(ev({ key: "]", repeat: true }), { mode: "live", target: body }).run, null);
  // (arrow seeking may repeat: holding → keeps seeking, as before)
  assert.strictEqual(K.decide(ev({ key: "ArrowRight", code: "ArrowRight", repeat: true }), { mode: "replay", target: body }).run, "seek+5");
});

test("keys v0.50: a focused button – keyboard focus keeps its own Space; a mouse-clicked one hands Space over and is blurred", () => {
  const kbdButton = { ...body, tag: "BUTTON", button: true, focusVisible: true };
  const mouseButton = { ...body, tag: "BUTTON", button: true, focusVisible: false };
  assert.deepStrictEqual(K.decide(SPACE, { mode: "replay", target: kbdButton }), { run: null, prevent: false, blur: false }, "the button's own press, no global toggle as well");
  assert.deepStrictEqual(K.decide(SPACE, { mode: "replay", target: mouseButton }), { run: "toggle", prevent: true, blur: true }, "global toggle; the button loses focus so its keyup doesn't press it again");
  // other shortcuts are unaffected by a focused button
  assert.strictEqual(K.decide(ev({ key: "ArrowRight", code: "ArrowRight" }), { mode: "replay", target: kbdButton }).run, "seek+5");
  assert.strictEqual(K.decide(ev({ key: "." }), { mode: "live", target: kbdButton }).run, "delay+1");
});

test("keys v0.50: no target description (detached element) still works; isTyping reads roles", () => {
  assert.strictEqual(K.decide(SPACE, { mode: "replay", target: null }).run, "toggle");
  assert.strictEqual(K.isTyping({ tag: "DIV", role: "textbox" }), true);
  assert.strictEqual(K.isTyping({ tag: "DIV" }), false);
  assert.deepStrictEqual(K.decide(null, {}), { run: null, prevent: false, blur: false });
});
