// The race screen's global keys (v0.50 §3-4), pure (tested: test/game/save50.test.js). Space toggles pause / resume
// only when nothing else owns the key: not while typing (input / textarea / select / contenteditable, IME composition),
// not with a dialog open, not on key repeat (a held key toggles once), and not when a button / link / control has the
// focus – there Space is that control's own key (its click), never a second, global toggle.
export function spaceAllowed(e, modalOpen) {
  if (e.code !== "Space" || e.repeat || e.isComposing || e.keyCode === 229 || modalOpen) return false;
  const t = e.target;
  if (t?.closest?.('input, select, textarea, [contenteditable]:not([contenteditable="false"]), button, [role=button], a[href], summary')) return false;
  return true;
}
