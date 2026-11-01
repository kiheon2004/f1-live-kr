// The cockpit cameras' motion settings (v0.53, request §10: "provide head-turn and vibration strength settings and a
// reduced-motion setting"). The keys and the rule live here; the controls belong to the settings UI (the ui helper's),
// map3d.js reads the values through motionPrefs() each frame from a cache refreshed when a key changes.
//
//   f1kr:eyeHeadGain  the driver's-eye camera's head turn into bends, 0–1 of eyecam.js's (HEAD.gain / HEAD.max) – 1 by
//                     default. The v0.52 switch f1kr:eyeHead "off" still reads as 0 (kept for those who turned it off).
//   f1kr:camVibration the cockpit cameras' vibration over kerbs, 0–1 – 0 by default: the onboard and eye cameras stay
//                     steady (v0.41 decision: a steady picture to watch the race by). At 1 the kerb's ridge pattern
//                     (map3d.js c.bump, fixed to the kerb – the same kerb always feels the same) moves the camera at most
//                     VIB.lift m up / down and VIB.pitch rad, faded in with speed. Never on the car, never on its pose.
//   f1kr:reduceMotion "on" | "off" | "auto" (default): on – no head turn, no vibration, whatever the two above say;
//                     auto – on when the system asks for reduced motion (prefers-reduced-motion), the app's own flag
//                     (<html data-reduce-motion="1">) or the game's 움직임 줄이기 is set.
// Nothing here writes engine state or reads the race: a camera's look only.
export const MOTION_KEYS = { head: "f1kr:eyeHeadGain", vib: "f1kr:camVibration", reduce: "f1kr:reduceMotion", legacyHead: "f1kr:eyeHead" };
export const VIB = { lift: 0.006, pitch: 0.0021, fullAt: 40 };   // (m, rad ≈ 0.12°, m/s – full strength from ~145 km/h)

const unit = (v, d) => { const x = v == null || v === "" ? NaN : +v; return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : d; };
// get(key) → the stored string or null; systemReduce: the system's / app's / game's reduced-motion wish (boolean)
export function readMotionPrefs(get, systemReduce = false) {
  const g = (k) => { try { return get(k); } catch { return null; } };
  const legacyOff = g(MOTION_KEYS.legacyHead) === "off";
  const head = unit(g(MOTION_KEYS.head), legacyOff ? 0 : 1), vib = unit(g(MOTION_KEYS.vib), 0);
  const r = g(MOTION_KEYS.reduce), mode = r === "on" || r === "off" ? r : "auto";
  const reduce = mode === "on" || (mode === "auto" && !!systemReduce);
  return { head, vib, mode, reduce, headGain: reduce ? 0 : head, vibration: reduce ? 0 : vib };
}
// The camera's vibration this frame from the kerb's ridge pattern `bump` (−1…1, 0 off a kerb) at `speed` (m/s), with
// strength `vib` (0–1) → [lift m, pitch rad]; 0 / 0 when off, standing or off a kerb (a pure function: the same place,
// the same shake – a seek or a pause shows the same picture)
export function vibrationAt(bump, speed, vib) {
  if (!(vib > 0) || !bump || !(speed > 0)) return [0, 0];
  const k = vib * Math.min(1, speed / VIB.fullAt);
  return [VIB.lift * k * bump, VIB.pitch * k * bump];
}
