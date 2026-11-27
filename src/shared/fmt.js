// Small helpers every screen of the page uses – ONE copy (before v0.71 the timing screen, the home screen, the dialog kit
// and the 3D view's HUD each carried their own): escaping text for markup, clock formatting, Korean-time formatters,
// the page's settings store, and the design tokens' colours for what is drawn on a canvas or in chart markup.
// A classic script (window.Fmt) and a CommonJS module (tests). The game's own modules (src/renderer/game/ui.js) keep an
// `esc` of their own: they are ES modules that also run under Node's test runner, where no page exists.
(function (root) {
  // text → safe inside element content and inside a quoted attribute
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // milliseconds → "HH:MM:SS" (never negative)
  const hms = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return [s / 3600, (s % 3600) / 60, s % 60].map((v) => String(Math.floor(v)).padStart(2, "0")).join(":"); };
  // a date formatter in Korean, in Korean time
  const KST = (opts) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...opts });
  // F1's archive gives a session's start in the track's local time with its GmtOffset ("-03:00:00" …) → "+HH:MM" for Date.parse
  const toOffset = (off) => { const m = /^(-?)(\d\d):(\d\d)/.exec(off || "00:00"); return m ? `${m[1] ? "-" : "+"}${m[2]}:${m[3]}` : "+00:00"; };
  // the page's settings (localStorage "f1kr:<key>", JSON): a broken or blocked store reads as the default and writes nothing
  const store = {
    get(k, d) { try { const v = root.localStorage.getItem("f1kr:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { root.localStorage.setItem("f1kr:" + k, JSON.stringify(v)); } catch { /* a per-viewer convenience only */ } },
  };
  // a design token's value (css/tokens.css) for canvas drawing and chart markup, read once; `fallback` where no page is
  const seen = new Map();
  const token = (name, fallback = "") => {
    if (seen.has(name)) return seen.get(name);
    let v = "";
    try { v = root.getComputedStyle(root.document.documentElement).getPropertyValue(name).trim(); } catch { /* no page (tests) */ }
    if (v) seen.set(name, v);
    return v || fallback;
  };
  const API = { esc, hms, KST, toOffset, store, token };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.Fmt = API;
})(typeof window !== "undefined" ? window : globalThis);
