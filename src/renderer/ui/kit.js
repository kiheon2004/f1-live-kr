// UI kit (v0.50): the behaviour behind the shared components in css/components.css – one implementation for the live
// screen, the 3D view's HUD and the game. A classic script (window.UIKit); no framework, no dependencies.
//   UIKit.dialog({ title, body, actions, dismissable, onClose }) → { el, close(value), result: Promise }
//       a modal .ui-scrim > .ui-dialog: the focus moves into it, Tab / Shift+Tab stay inside, Escape (and a click on the
//       scrim when dismissable) closes it, and the focus goes back to where it was. body: a string (text, escaped) or a
//       Node. actions: [{ label, value, kind: "primary" | "danger" | "ghost", autofocus }]; result resolves to the value
//       of the action pressed (null when dismissed).
//   UIKit.confirm(text, { title, ok, cancel, danger }) → Promise<boolean>
//   UIKit.trap(el, { onEscape, restore }) → release()     focus trap for an existing element (drawers, popovers)
//   UIKit.isDialogOpen()                                   a modal is up: global shortcuts stay off (ui/keys.js)
//   UIKit.menu(button, menu, { onOpen, onClose })          a popover menu: the button toggles it (aria-expanded),
//       ↑/↓/Home/End move between its items, Escape or Tab closes it (Escape returns the focus to the button), a click
//       outside closes it, pressing an item (not a checkbox) closes it.
//   UIKit.toast(text, { kind: "ok" | "warn" | "bad" | "sc" | "info", ms, host }) → element   (host: a container;
//       default a fixed stack at the top right)
//   UIKit.tips(root = document)   [data-tip] elements get a styled tooltip on hover (after 450 ms) and keyboard focus;
//       Escape hides it. The tip text is also the element's aria-label when it has none.
(function () {
  const doc = document;
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), audio[controls]';
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== "hidden";
  const focusables = (el) => [...el.querySelectorAll(FOCUSABLE)].filter(visible);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- focus trap ----------
  const traps = [];   // (stacked: the newest one owns Tab and Escape)
  function trap(el, { onEscape = null, restore = true, initial = null } = {}) {
    const before = doc.activeElement;
    const t = { el, onEscape, before, restore };
    traps.push(t);
    const first = initial || el.querySelector("[autofocus]") || focusables(el)[0] || el;
    if (first === el && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    requestAnimationFrame(() => first.focus({ preventScroll: true }));
    return function release() {
      const i = traps.indexOf(t); if (i < 0) return;
      traps.splice(i, 1);
      if (t.restore && before && before.isConnected && typeof before.focus === "function") before.focus({ preventScroll: true });
    };
  }
  doc.addEventListener("keydown", (e) => {
    const t = traps[traps.length - 1]; if (!t) return;
    if (e.key === "Escape" && t.onEscape && !e.isComposing) { e.preventDefault(); e.stopPropagation(); t.onEscape(e); return; }
    if (e.key !== "Tab") return;
    const list = focusables(t.el);
    if (!list.length) { e.preventDefault(); t.el.focus(); return; }
    const i = list.indexOf(doc.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); list[list.length - 1].focus(); }
    else if (!e.shiftKey && (i === list.length - 1 || i < 0)) { e.preventDefault(); list[0].focus(); }
  }, true);
  // (a focus that escapes the trap – a click on the page behind a non-modal popover is handled by its owner – is
  // brought back for modals only)
  doc.addEventListener("focusin", (e) => {
    const t = traps[traps.length - 1];
    if (!t || !t.modal || t.el.contains(e.target)) return;
    (focusables(t.el)[0] || t.el).focus({ preventScroll: true });
  });

  // ---------- dialog ----------
  let openDialogs = 0;
  function dialog({ title = "", body = "", actions = [{ label: "확인", value: true, kind: "primary" }], dismissable = true, onClose = null, cls = "" } = {}) {
    const scrim = doc.createElement("div");
    scrim.className = "ui-scrim";
    const id = "uid" + Math.random().toString(36).slice(2, 8);
    scrim.innerHTML = `<div class="ui-dialog ${esc(cls)}" role="dialog" aria-modal="true" aria-labelledby="${id}"><header id="${id}">${esc(title)}</header><div class="body"></div><footer></footer></div>`;
    const box = scrim.firstElementChild, bodyEl = box.querySelector(".body"), foot = box.querySelector("footer");
    if (body instanceof Node) bodyEl.appendChild(body); else bodyEl.innerHTML = String(body).split("\n").map((l) => `<p>${esc(l)}</p>`).join("");
    let resolve;
    const result = new Promise((r) => (resolve = r));
    let done = false, release = null;
    const close = (value = null) => {
      if (done) return; done = true; openDialogs--;
      scrim.remove(); release?.(); resolve(value); onClose?.(value);
    };
    for (const a of actions) {
      const b = doc.createElement("button");
      b.className = `ui-btn ${a.kind || ""}`; b.textContent = a.label;
      if (a.autofocus) b.setAttribute("autofocus", "");
      b.addEventListener("click", () => close(a.value));
      foot.appendChild(b);
    }
    if (dismissable) scrim.addEventListener("pointerdown", (e) => { if (e.target === scrim) close(null); });
    doc.body.appendChild(scrim); openDialogs++;
    release = trap(box, { onEscape: dismissable ? () => close(null) : null });
    traps[traps.length - 1].modal = true;
    return { el: box, close, result };
  }
  function confirm(text, { title = "확인", ok = "확인", cancel = "취소", danger = false } = {}) {
    return dialog({ title, body: text, actions: [{ label: cancel, value: false, kind: "ghost" }, { label: ok, value: true, kind: danger ? "danger" : "primary", autofocus: true }] }).result.then((v) => v === true);
  }
  const isDialogOpen = () => openDialogs > 0 || !!doc.querySelector('[aria-modal="true"]:not([hidden])');

  // ---------- menu ----------
  // (v0.53: the focusable control itself – a checkbox, slider or select inside a label – not the label, which can't take
  // the focus; ↑ / ↓ always move between items, ← / → and Home / End stay a slider's own keys)
  const ITEM = 'button:not([disabled]), [role="menuitem"]:not([aria-disabled="true"]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), a[href]';
  function menu(button, el, { onOpen = null, onClose = null } = {}) {
    if (!button || !el) return null;
    el.setAttribute("role", el.getAttribute("role") || "menu");
    button.setAttribute("aria-haspopup", "true"); button.setAttribute("aria-expanded", "false");
    if (el.id) button.setAttribute("aria-controls", el.id);
    const items = () => [...el.querySelectorAll(ITEM)].filter(visible);
    const isOpen = () => !el.hidden;
    function open(focusFirst = false) {
      if (isOpen()) return;
      el.hidden = false; button.setAttribute("aria-expanded", "true"); onOpen?.();
      if (focusFirst) requestAnimationFrame(() => items()[0]?.focus());
    }
    function close(returnFocus = false) {
      if (!isOpen()) return;
      el.hidden = true; button.setAttribute("aria-expanded", "false"); onClose?.();
      if (returnFocus) button.focus();
    }
    button.addEventListener("click", (e) => { e.stopPropagation(); isOpen() ? close() : open(e.detail === 0); });   // (detail 0: Enter / Space)
    button.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); open(true); } });
    el.addEventListener("keydown", (e) => {
      const list = items(), i = list.indexOf(doc.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = list.length; if (n) list[(i + (e.key === "ArrowDown" ? 1 : -1) + n) % n].focus(); }
      else if ((e.key === "Home" || e.key === "End") && !e.target.matches?.('input[type="range"], select')) { e.preventDefault(); list[e.key === "Home" ? 0 : list.length - 1]?.focus(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === "Tab") close(false);
    });
    el.addEventListener("click", (e) => {
      const it = e.target.closest(ITEM);
      if (!it || it.tagName === "LABEL" || e.target.closest("input, select, [data-keep-open]")) return;
      close(false);
    });
    doc.addEventListener("pointerdown", (e) => { if (isOpen() && !el.contains(e.target) && !button.contains(e.target)) close(false); });
    return { open, close, isOpen };
  }

  // ---------- toast ----------
  let stack = null;
  function toast(text, { kind = "", ms = 6000, host = null } = {}) {
    let box = host;
    if (!box) { if (!stack) { stack = doc.createElement("div"); stack.className = "ui-toasts"; stack.setAttribute("aria-live", "polite"); doc.body.appendChild(stack); } box = stack; }
    const el = doc.createElement("div");
    el.className = `ui-toast ${kind}`; el.setAttribute("role", kind === "bad" || kind === "sc" ? "alert" : "status");
    el.textContent = text;
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    if (ms) setTimeout(() => el.remove(), ms);
    return el;
  }

  // ---------- tooltip ----------
  let tipEl = null, tipFor = null, tipTimer = null;
  function showTip(el) {
    const text = el.getAttribute("data-tip"); if (!text) return;
    if (!tipEl) { tipEl = doc.createElement("div"); tipEl.className = "ui-tip"; tipEl.setAttribute("role", "tooltip"); tipEl.id = "uiTip"; doc.body.appendChild(tipEl); }
    tipEl.textContent = text; tipEl.hidden = false; tipFor = el;
    el.setAttribute("aria-describedby", "uiTip");
    const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = Math.min(innerWidth - w - 6, Math.max(6, r.left + r.width / 2 - w / 2)), y = r.bottom + 6;
    if (y + h > innerHeight - 6) y = r.top - h - 6;
    tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
  }
  function hideTip() { clearTimeout(tipTimer); if (tipEl) tipEl.hidden = true; tipFor?.removeAttribute("aria-describedby"); tipFor = null; }
  let tipsOn = false;
  function tips(rootEl = doc) {
    for (const el of rootEl.querySelectorAll("[data-tip]")) if (!el.hasAttribute("aria-label") && !el.textContent.trim()) el.setAttribute("aria-label", el.getAttribute("data-tip"));
    if (tipsOn) return; tipsOn = true;
    doc.addEventListener("pointerover", (e) => {
      const el = e.target.closest?.("[data-tip]");
      if (el === tipFor) return;
      hideTip(); if (!el) return;
      tipTimer = setTimeout(() => showTip(el), 450);
    });
    doc.addEventListener("focusin", (e) => { const el = e.target.closest?.("[data-tip]"); hideTip(); if (el && el.matches(":focus-visible")) showTip(el); });
    doc.addEventListener("focusout", hideTip);
    doc.addEventListener("pointerdown", hideTip);
    doc.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });
  }

  window.UIKit = { dialog, confirm, trap, isDialogOpen, menu, toast, tips, focusables };
})();
