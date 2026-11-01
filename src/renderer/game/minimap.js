// The game race screen's small 2D track map (v0.54 user request): the circuit seen from above in the scenario's own
// F1 position frame (track.columns x, y – metres, + left of the direction of travel), and every car where the GAME has it
// at render time (hudSnap → present.js: lap place s and offset d, or the pit lane's u) – the engine's cars, not the
// session's real ones. Pure geometry here (tested); racehud.js draws it in the empty foot of the standings tower.

// the lap line as [x, y] points every `step` m (closed), and the pit lane's if the scenario has one
export function trackOutline(track, step = 10) {
  const X = track?.columns?.x, Y = track?.columns?.y; if (!X?.length) return null;
  const k = Math.max(1, Math.round(step / (track.ds || 1))), lap = [];
  for (let i = 0; i < X.length; i += k) lap.push([X[i], Y[i]]);
  const P = track.pit?.columns, pit = [];
  const kp = Math.max(1, Math.round(step / (track.pit?.ds || 1)));
  if (P?.x?.length) { for (let i = 0; i < P.x.length; i += kp) pit.push([P.x[i], P.y[i]]); const e = P.x.length - 1; if ((e % kp) !== 0) pit.push([P.x[e], P.y[e]]); }
  return { lap, pit };
}

// a value of column `col` at fractional index f (wrapping on a closed lap)
const at = (col, f, closed) => {
  const n = col.length; if (!n) return null;
  if (closed) { f = ((f % n) + n) % n; const i = Math.floor(f), j = (i + 1) % n, w = f - i; return col[i] + (col[j] - col[i]) * w; }
  f = Math.max(0, Math.min(n - 1, f)); const i = Math.floor(f), j = Math.min(n - 1, i + 1), w = f - i; return col[i] + (col[j] - col[i]) * w;
};
const angAt = (col, f) => { const n = col.length, i = ((Math.floor(f) % n) + n) % n, j = (i + 1) % n, w = f - Math.floor(f); let d = col[j] - col[i]; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return col[i] + d * w; };

// where a presented car is in the track's frame: on the lap at s (offset d to the left of travel), in the pit lane at u
export function carPoint(track, c) {
  const C = track?.columns; if (!C?.x?.length || !c) return null;
  if (c.where === "pit" && c.u != null && track.pit?.columns?.x?.length) {
    const P = track.pit.columns, f = c.u / (track.pit.ds || 1);
    return [at(P.x, f, false), at(P.y, f, false)];
  }
  if (c.s == null) return null;
  const f = c.s / (track.ds || 1), x = at(C.x, f, true), y = at(C.y, f, true), d = c.d || 0;
  if (!d || !C.hdg?.length) return [x, y];
  const h = angAt(C.hdg, f);
  return [x - Math.sin(h) * d, y + Math.cos(h) * d];
}

// a box (w × h px, pad px) → the scale and offset that fit the outline in it, north (+y) up
export function fitTransform(outline, w, h, pad = 8) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const pts of [outline.lap, outline.pit]) for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const k = Math.min((w - 2 * pad) / Math.max(1, x1 - x0), (h - 2 * pad) / Math.max(1, y1 - y0));
  const ox = (w - (x1 - x0) * k) / 2 - x0 * k, oy = (h - (y1 - y0) * k) / 2 + y1 * k;
  return { k, map: (x, y) => [ox + x * k, oy - y * k] };
}
