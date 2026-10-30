// Global keyboard shortcuts (v0.50): ONE policy for when a key press is the timing screen's shortcut and when it belongs
// to whatever has the focus. Kept free of the page so the tests can load it (test/keys50.test.js); app.js asks it on
// every keydown with a plain description of the event and the page's state.
//
// Shortcuts: replay – Space play/pause, ←/→ 5 s (Shift: 1 min); live – Space pause/resume, , . ∓1 s delay, [ ] ∓5 s.
// A key is NOT a shortcut when:
//   - an IME is composing (Korean input: e.isComposing, or the 229 key code Chromium gives during composition),
//   - the focus is in a text field, a select, a slider, a contenteditable, an audio player or a splitter (they use
//     the same keys themselves: arrows move a slider, Space types a space, …),
//   - a dialog is open (it traps the focus; its own keys only), or the home screen / the game covers the timing screen,
//   - Cmd / Ctrl / Alt is held (app and system shortcuts).
// Space:
//   - held down (key repeat) it toggles once – the repeats only stop the page from scrolling,
//   - on a button the keyboard focused (Tab: :focus-visible) it presses that button and nothing else – the button's own
//     action wins, the global one doesn't run as well,
//   - on a button the MOUSE last pressed (the focus stays there after a click, without :focus-visible) it is the global
//     shortcut, and that button loses the focus first – otherwise its keyup would press it a second time (play → pause).
// → { run: action name or null, prevent: bool (preventDefault), blur: bool (drop the focus first) }
(function (root) {
  const TEXTISH = new Set(["INPUT", "TEXTAREA", "SELECT", "AUDIO", "VIDEO"]);
  // which keys mean what in which mode (null: not a shortcut there)
  function actionFor(ev, mode) {
    if (ev.code === "Space" || ev.key === " ") return "toggle";
    if (mode === "replay") {
      if (ev.code === "ArrowRight" || ev.key === "ArrowRight") return ev.shiftKey ? "seek+60" : "seek+5";
      if (ev.code === "ArrowLeft" || ev.key === "ArrowLeft") return ev.shiftKey ? "seek-60" : "seek-5";
      return null;
    }
    if (mode === "live") return { ",": "delay-1", ".": "delay+1", "[": "delay-5", "]": "delay+5" }[ev.key] || null;
    return null;
  }
  // target: { tag, type, editable, role, inSplitter, button, focusVisible } – what the focused element is
  function isTyping(target) {
    if (!target) return false;
    if (target.editable || target.inSplitter) return true;
    if (target.role === "textbox" || target.role === "slider" || target.role === "combobox" || target.role === "spinbutton") return true;
    return TEXTISH.has(String(target.tag || "").toUpperCase());
  }
  const NONE = Object.freeze({ run: null, prevent: false, blur: false });
  function decide(ev, { mode = "replay", target = null, dialogOpen = false, covered = false } = {}) {
    if (!ev) return NONE;
    if (ev.isComposing || ev.keyCode === 229) return NONE;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return NONE;
    if (dialogOpen || covered) return NONE;
    if (isTyping(target)) return NONE;
    const run = actionFor(ev, mode);
    if (!run) return NONE;
    const space = run === "toggle";
    if (space && target?.button && target.focusVisible) return NONE;   // the focused button's own Space
    if (ev.repeat && (space || /^delay/.test(run))) return { run: null, prevent: space, blur: false };   // held: once
    return { run, prevent: true, blur: !!(space && target?.button) };
  }
  // The description decide() wants, read off a real DOM element (the page only).
  function describe(el) {
    if (!el || el.nodeType !== 1) return null;
    const btn = el.closest?.("button, [role=button], a[href], summary, label") || null;
    let focusVisible = false; try { focusVisible = !!btn && btn.matches(":focus-visible"); } catch {}
    const input = el.tagName === "INPUT" ? String(el.type || "text").toLowerCase() : "";
    return {
      tag: el.tagName, type: input, role: el.getAttribute?.("role") || "",
      // (a checkbox or radio is a button for this purpose: Space ticks it)
      editable: !!el.isContentEditable || !!el.closest?.("[contenteditable=''], [contenteditable='true']"),
      inSplitter: !!el.closest?.(".splitter"),
      button: !!btn || input === "checkbox" || input === "radio",
      focusVisible: focusVisible || ((input === "checkbox" || input === "radio") && el.matches?.(":focus-visible")),
    };
  }
  const API = { decide, actionFor, isTyping, describe };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.UIKeys = API;
})(typeof window !== "undefined" ? window : globalThis);
