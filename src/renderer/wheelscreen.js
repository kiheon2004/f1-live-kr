// The steering wheel's display, per driver: what that car's own data says at the moment shown – gear, speed, revs, its
// place, lap and gap to the car ahead, DRS up to 2025 – or "no data" when nothing fresh has come. A layout of this app's
// own (no team's real screen): each team's wheel carries it on its own screen shape (car3d.js).
//
// Before (v0.34): one shared picture on every wheel – gear 7, "DELTA -0.12", "LAP 23" – the same made-up values for
// all cars. Now a small pool of screens goes to the cars drawn close up (the cockpit car first), each repainted only
// when what it shows changes and no more than ~8 times a second; the rest of the wheels show the neutral face.
import * as THREE from "./vendor/three.module.js";

// What a wheel shows (pure): car – the car's telemetry at t (replay.js carAt: null when nothing within 3 s), line – its
// TimingData line, laps – the session's LapCount ({ CurrentLap, TotalLaps }) or null, season.
//   gear: "N" (neutral, 0), "1"–"8", or "–" (no data) · speed km/h or null · rev: 0–1 of the shift lights (the revs
//   against the era's usual range – a light display, not a real team's shift points) · pos, lap, gap: from timing or
//   null · drs: "open" | "armed" | null (2025 and before only, from its channel; 2026 cars send none) · stale: no fresh
//   telemetry (no gear or speed shown – not the last values as if current)
export function screenModel({ car, line = null, laps = null, season = null }) {
  const stale = !car;
  const gear = stale ? "–" : car.gear === 0 ? "N" : String(car.gear);
  const top = season >= 2026 ? 12000 : 12500, low = top * 0.7;
  const rev = stale ? 0 : Math.max(0, Math.min(1, (car.rpm - low) / (top - low)));
  const pos = line && +line.Position > 0 ? +line.Position : null;
  const done = line && line.NumberOfLaps != null ? +line.NumberOfLaps : null;
  let lap = laps?.CurrentLap != null && done != null ? Math.min(+laps.CurrentLap, done + 1) : done != null ? done + 1 : null;
  if (laps?.TotalLaps && lap > +laps.TotalLaps) lap = +laps.TotalLaps;
  // the gap to the car ahead: seconds ("+1.204"), or laps ("1 L" / "1 LAP" → "+1 LAP"); anything else (empty, partial) none
  const g = String(line?.IntervalToPositionAhead?.Value ?? "").trim();
  const lapsG = /^\+?(\d+)\s*L(AP)?S?$/i.exec(g), secs = /^\+?\d+(\.\d+)?$/.test(g);
  const gap = pos === 1 ? "LEADER" : lapsG ? `+${lapsG[1]} LAP` : secs ? (g.startsWith("+") ? g : "+" + g) : null;
  const out = line && (line.Retired || line.Stopped) ? "OUT" : line?.InPit ? "PIT" : null;
  const drs = !stale && season != null && season <= 2025 && car.drs != null ? (car.drs >= 10 ? "open" : car.drs === 8 ? "armed" : null) : null;
  const sp = stale ? null : Math.round(car.speed);
  const m = { gear: !stale && !Number.isFinite(car.gear) ? "–" : gear, speed: Number.isFinite(sp) ? sp : null, rev: Number.isFinite(rev) ? Math.round(rev * 10) / 10 : 0, pos, lap: Number.isFinite(lap) ? lap : null, gap, out, drs, stale };
  m.key = JSON.stringify(m);
  return m;
}

// The face drawn on a 256 × 128 canvas (the wheel's screen UVs span it)
export function paintScreen(g, m) {
  const W = 256, H = 128;
  g.fillStyle = "#050607"; g.fillRect(0, 0, W, H);
  // shift lights: 10, lit from the left with the revs (green, red, blue)
  const cols = ["#23d160", "#23d160", "#23d160", "#23d160", "#ff3b30", "#ff3b30", "#ff3b30", "#4aa3ff", "#4aa3ff", "#4aa3ff"];
  const lit = Math.round(m.rev * 10);
  cols.forEach((c, i) => { g.fillStyle = i < lit ? c : "#16191c"; g.beginPath(); g.arc(28 + i * 22, 13, 7, 0, Math.PI * 2); g.fill(); });
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = m.stale ? "#59616b" : "#e9edf2"; g.font = "700 60px Arial, sans-serif"; g.fillText(m.gear, 128, 72);
  g.font = "600 15px Arial, sans-serif"; g.fillStyle = "#7d8ea1";
  g.fillText(m.stale ? "NO DATA" : `${m.speed} KM/H`, 128, 114);
  // left: place and lap; right: the gap to the car ahead, or the car's state
  g.fillStyle = "#1d2f45"; g.fillRect(10, 34, 66, 70); g.fillRect(180, 34, 66, 70);
  g.fillStyle = "#9fb3c8"; g.font = "600 14px Arial, sans-serif";
  g.fillText(m.pos ? `P${m.pos}` : "P –", 43, 54); g.fillText(m.lap ? `L${m.lap}` : "L –", 43, 84);
  const right = m.out || (m.drs === "open" ? "DRS" : m.drs === "armed" ? "DRS ·" : null);
  g.fillStyle = m.drs === "open" ? "#23d160" : "#9fb3c8";
  if (right) g.fillText(right, 213, 54);
  g.fillStyle = "#9fb3c8"; g.font = "600 12px Arial, sans-serif";
  g.fillText(m.gap ? (m.gap.length > 8 ? m.gap.slice(0, 8) : m.gap) : "GAP –", 213, right ? 84 : 69);
}

const NEUTRAL = screenModel({ car: null });
// A pool of `size` screens for the cars drawn close up. assign(list): list of { num, model } nearest first; each keeps
// its screen while it stays on the list. update(get): get(num) → model data (screenModel); repainted when changed, at
// most every `every` ms. Its textures are its own (marked shared: a car's disposal never frees them); clear() frees.
export class WheelScreens {
  constructor({ size = 4, every = 125, canvas = () => document.createElement("canvas") } = {}) {
    this.size = size; this.every = every; this.slots = []; this.mk = canvas;
    this.byNum = new Map();   // num → slot
  }
  slot() {
    const cv = this.mk(); cv.width = 256; cv.height = 128;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.userData.shared = true;
    const s = { cv, tex, num: null, key: null, at: -Infinity, painted: null }; this.slots.push(s); return s;
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
  update(get, now = performance.now()) {
    let painted = 0;
    for (const [num, s] of this.byNum) {
      if (now - s.at < this.every) continue;
      const m = get(num); if (!m || m.key === s.key) continue;
      paintScreen(s.cv.getContext("2d"), m); s.tex.needsUpdate = true; s.key = m.key; s.at = now; s.painted = num; painted++;
    }
    return painted;
  }
  // the neutral face on a screen, its rate limit cleared (the next update paints its owner straight away)
  clean(s) { paintScreen(s.cv.getContext("2d"), NEUTRAL); s.tex.needsUpdate = true; s.key = null; s.at = -Infinity; s.painted = null; }
  // forget every assignment (a new session: no screen keeps another driver's face)
  reset() { for (const s of this.slots) { s.num = null; this.clean(s); } this.byNum.clear(); }
  clear() { for (const s of this.slots) s.tex.dispose(); this.slots = []; this.byNum.clear(); }
}
