// The steering wheel's display, per driver: what that car's own data says at the moment shown – gear, speed, revs, its
// place, lap and gap to the car ahead, DRS up to 2025 – or "no data" when nothing fresh has come. A layout of this app's
// own (no team's real screen): each team's wheel carries it on its own screen shape (car3d.js).
//
// Before (v0.34): one shared picture on every wheel – gear 7, "DELTA -0.12", "LAP 23" – the same made-up values for
// all cars. Now a small pool of screens goes to the cars drawn close up (the cockpit car first), each repainted only
// when what it shows changes and no more than ~8 times a second; the rest of the wheels show the neutral face.
import * as THREE from "./vendor/three.module.js";

// What a wheel shows (pure): car – the car's telemetry at t (replay.js carAt: null when nothing within 3 s), line – its
// TimingData line, laps – the session's LapCount ({ CurrentLap, TotalLaps }) or null, season, status – TrackStatus's
// Status at t (race control's track state: "1" green, "2" yellow, "4" safety car, "5" red, "6" VSC, "7" VSC ending).
//   gear: "N" (neutral, 0), "1"–"8", or "–" (no data; also the 2026 feed's 9–128 on a stopped car) · speed km/h or null
//   · rpm or null · rev: 0–1 (kept for older callers) · pos, lap, total, gap, last (the last lap's time, as timing has it):
//   from timing or null · drs: "open" | "armed" | null (2025 and before only, from its channel; 2026 cars send none – nor
//   anything about active aero, overtake mode or the battery: none of that is drawn) · flag: "SC" | "VSC" | "VSC END" |
//   "RED" | "YELLOW" | null · stale: no fresh telemetry (no gear, speed or revs shown – not the last values as if current)
// v0.40: the shift lights are no longer drawn in this picture (painted ≤ 8 times a second they filled in steps): the
// wheel has its own lights (shiftlights.js, lit every frame).
const FLAGS = { 2: "YELLOW", 4: "SC", 5: "RED", 6: "VSC", 7: "VSC END" };
export function screenModel({ car, line = null, laps = null, season = null, status = null }) {
  const stale = !car;
  const g = stale ? null : car.gear, gear = g == null || !Number.isFinite(g) || g < 0 || g > 8 ? "–" : g === 0 ? "N" : String(g);
  const top = season >= 2026 ? 12000 : 12500, low = top * 0.7;
  const rev = stale ? 0 : Math.max(0, Math.min(1, (car.rpm - low) / (top - low)));
  const pos = line && +line.Position > 0 ? +line.Position : null;
  const done = line && line.NumberOfLaps != null ? +line.NumberOfLaps : null;
  let lap = laps?.CurrentLap != null && done != null ? Math.min(+laps.CurrentLap, done + 1) : done != null ? done + 1 : null;
  const total = laps?.TotalLaps ? +laps.TotalLaps : null;
  if (total && lap > total) lap = total;
  // the gap to the car ahead: seconds ("+1.204"), or laps ("1 L" / "1 LAP" → "+1 LAP"); anything else (empty, partial) none
  const gs = String(line?.IntervalToPositionAhead?.Value ?? "").trim();
  const lapsG = /^\+?(\d+)\s*L(AP)?S?$/i.exec(gs), secs = /^\+?\d+(\.\d+)?$/.test(gs);
  const gap = pos === 1 ? "LEADER" : lapsG ? `+${lapsG[1]} LAP` : secs ? (gs.startsWith("+") ? gs : "+" + gs) : null;
  const out = line && (line.Retired || line.Stopped) ? "OUT" : line?.InPit ? "PIT" : null;
  const drs = !stale && season != null && season <= 2025 && car.drs != null ? (car.drs >= 10 ? "open" : car.drs === 8 ? "armed" : null) : null;
  const sp = stale ? null : Math.round(car.speed), rp = stale ? null : Math.round(car.rpm / 10) * 10;
  const lv = String(line?.LastLapTime?.Value ?? "").trim(), last = /^\d+:\d\d\.\d{3}$|^\d+\.\d{3}$/.test(lv) ? lv : null;
  const m = { gear, speed: Number.isFinite(sp) ? sp : null, rpm: Number.isFinite(rp) && rp > 0 ? rp : null, rev: Number.isFinite(rev) ? Math.round(rev * 10) / 10 : 0, pos, lap: Number.isFinite(lap) ? lap : null, total,
    gap, last, out, drs, flag: FLAGS[status] || null, stale };
  m.key = JSON.stringify(m);
  return m;
}

// The face, laid out as a grid of cells as on a race wheel's display (white rules, big gear in the middle – the layout is
// this app's own, no team's), drawn on a W × H canvas (16:9: the display's picture; wheel3d.js sizes its plane alike).
// The type sizes are for the first-person camera: the display ~0.55 m from the eyes fills ~11° of a 95° view – ~230
// px of a 1920 px wide picture – so its gear digit is ~0.6 of the picture's height and every other figure ≥ 1/8 of it.
export const SCREEN = { w: 512, h: 288 };
export function paintScreen(g, m, W = SCREEN.w, H = SCREEN.h) {
  const k = W / 512;
  g.setTransform?.(k, 0, 0, k, 0, 0);
  const w = 512, h = 288;
  g.fillStyle = "#040506"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#d9dee4"; g.lineWidth = 2;
  const cell = (x, y, cw, ch) => g.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
  // cells: top row (last lap · speed · gap), the middle (place / lap · gear · revs / state), the bottom row (flag)
  cell(4, 4, 196, 60); cell(200, 4, 112, 60); cell(312, 4, 196, 60);
  cell(4, 64, 150, 82); cell(4, 146, 150, 82); cell(154, 64, 204, 164); cell(358, 64, 150, 82); cell(358, 146, 150, 82);
  g.textBaseline = "middle"; g.textAlign = "left";
  const label = (t, x, y) => { g.font = "700 15px Arial, sans-serif"; g.fillStyle = "#8f9aa6"; g.fillText(t, x, y); };
  const val = (t, x, y, size = 38, col = "#f2f4f6", align = "right") => { g.font = `700 ${size}px Arial, sans-serif`; g.fillStyle = col; g.textAlign = align; g.fillText(t, x, y); g.textAlign = "left"; };
  const dim = m.stale ? "#59616b" : "#f2f4f6";
  label("LAST", 14, 18); val(m.last || "–", 190, 40, 32);
  label("KPH", 210, 18); val(m.speed != null ? String(m.speed) : "–", 302, 40, 34, dim);
  label("GAP", 322, 18); val(m.gap ? (m.gap.length > 8 ? m.gap.slice(0, 8) : m.gap) : "–", 498, 40, 32, m.gap === "LEADER" ? "#f2c230" : "#f2f4f6");
  label("POS", 14, 80); val(m.pos ? `P${m.pos}` : "–", 144, 112, 42);
  label("LAP", 14, 162); val(m.lap ? (m.total ? `${m.lap}/${m.total}` : String(m.lap)) : "–", 144, 194, m.total ? 34 : 42);
  // the gear: big, in the middle
  g.textAlign = "center"; g.font = "700 150px Arial, sans-serif"; g.fillStyle = m.stale ? "#59616b" : "#ffffff"; g.fillText(m.gear, 256, 152); g.textAlign = "left";
  label("RPM", 368, 80); val(m.rpm != null ? String(m.rpm) : "–", 498, 112, 36, dim);
  // the state: out / in the pit lane, else DRS (2025 and before), else nothing
  const st = m.out || (m.drs === "open" ? "DRS" : m.drs === "armed" ? "DRS ·" : null);
  label(m.out ? "STATE" : m.drs ? "DRS" : "", 368, 162);
  if (st) val(st, 498, 194, 38, m.drs === "open" ? "#23d160" : m.out === "PIT" ? "#f2c230" : m.out ? "#ff5a4e" : "#f2f4f6");
  // the bottom row: race control's track state (a coloured bar), or no data
  const fc = { SC: "#f2c230", VSC: "#f2c230", "VSC END": "#f2c230", RED: "#e8392f", YELLOW: "#f2c230" }[m.flag];
  if (fc) { g.fillStyle = fc; g.fillRect(6, 232, 500, 50); g.fillStyle = "#050505"; g.textAlign = "center"; g.font = "800 36px Arial, sans-serif"; g.fillText(m.flag, 256, 258); g.textAlign = "left"; }
  else if (m.stale) { g.fillStyle = "#7d8ea1"; g.textAlign = "center"; g.font = "700 26px Arial, sans-serif"; g.fillText("NO DATA", 256, 258); g.textAlign = "left"; }
  g.setTransform?.(1, 0, 0, 1, 0, 0);
}

// What can't wait for the screen's next allowed repaint (pure; a number, no allocation – checked every frame): its gear,
// or the data gone (−2) / an invalid gear (−1). v0.40 repainted every screen at most every 125 ms whatever changed: a
// gear change reached the screen up to 125 ms after the shift lights (lit every frame) – one more 4 Hz sample's worth
// of disagreement on top of the two samplers'. The revs, speed and the rest stay on the ~8-a-second limit.
export function screenUrgent(car) { if (!car) return -2; const g = car.gear; return g == null || !Number.isFinite(g) || g < 0 || g > 8 ? -1 : g; }

const NEUTRAL = screenModel({ car: null });
// A pool of `size` screens for the cars drawn close up. assign(list): list of { num, model } nearest first; each keeps
// its screen while it stays on the list. update(get, now, quick): get(num) → model data (screenModel); repainted when
// changed, at most every `every` ms – except when quick(num) (screenUrgent: the gear, data lost) differs from what the
// screen shows: then at once (a whole repaint of one small canvas, only on such a change – not every frame). A new owner
// is painted at once too (assign). Its textures are its own (marked shared: a car's disposal never frees them); clear() frees.
export class WheelScreens {
  constructor({ size = 4, every = 125, canvas = () => document.createElement("canvas") } = {}) {
    this.size = size; this.every = every; this.slots = []; this.mk = canvas;
    this.byNum = new Map();   // num → slot
  }
  slot() {
    const cv = this.mk(); cv.width = SCREEN.w; cv.height = SCREEN.h;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.userData.shared = true;
    const s = { cv, tex, num: null, key: null, q: null, at: -Infinity, painted: null }; this.slots.push(s); return s;
  }
  // which cars have a screen: the first `size` of the list; returns [{ num, tex }] for the caller to put on the wheels,
  // and the numbers that lost theirs
  assign(list) {
    const want = list.slice(0, this.size).map((c) => c.num), lost = [];
    for (const [num, s] of this.byNum) if (!want.includes(num)) { this.byNum.delete(num); s.num = null; s.key = null; lost.push(num); }
    for (const num of want) {
      if (this.byNum.has(num)) continue;
      const s = this.slots.find((x) => x.num == null) || (this.slots.length < this.size ? this.slot() : null);
      if (!s) continue;
      // (a new owner: the previous driver's face wiped at once and the first picture not held back by the rate limit –
      // a reused screen had shown the old driver until its next allowed repaint)
      s.num = num; this.clean(s); this.byNum.set(num, s);
    }
    return { have: [...this.byNum].map(([num, s]) => ({ num, tex: s.tex })), lost };
  }
  update(get, now = performance.now(), quick = null) {
    let painted = 0;
    for (const [num, s] of this.byNum) {
      const q = quick ? quick(num) : null;
      if (q === s.q && now - s.at < this.every) continue;
      const m = get(num); if (!m) continue;
      s.q = q; if (m.key === s.key) continue;
      paintScreen(s.cv.getContext("2d"), m, s.cv.width, s.cv.height); s.tex.needsUpdate = true; s.key = m.key; s.at = now; s.painted = num; painted++;
    }
    return painted;
  }
  // the neutral face on a screen, its rate limit cleared (the next update paints its owner straight away)
  clean(s) { paintScreen(s.cv.getContext("2d"), NEUTRAL, s.cv.width, s.cv.height); s.tex.needsUpdate = true; s.key = null; s.q = null; s.at = -Infinity; s.painted = null; }
  // forget every assignment (a new session: no screen keeps another driver's face)
  reset() { for (const s of this.slots) { s.num = null; this.clean(s); } this.byNum.clear(); }
  clear() { for (const s of this.slots) s.tex.dispose(); this.slots = []; this.byNum.clear(); }
}
