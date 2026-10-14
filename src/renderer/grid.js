// The starting grid in the 3D view: where the slots are, which car stands in which, and when a car is drawn in its
// slot instead of where the position feed puts it. Pure functions (no three.js) – map3d.js feeds them.
//
// What the data says (measured on 37 cached races 2024–2026, position at lights out − 1.5 s, cars standing):
//   - F1's position feed matches every car to one reference line: on the grid all cars are on it, in single file
//     (sideways spread 0.02–0.10 m), although they really stand in two staggered columns.
//   - Along the track the cars come out one slot per 7.8–8.1 m on average (fitted slope; Catalunya 7.4–7.5), but each
//     car is 0.4–3.5 m (RMS per race) off that line, up to 8 m: neighbours 0–19 m apart, now and then the wrong way
//     round (2023 Bahrain: P2 "1.6 m ahead" of pole). The irregular grid seen in the view is this, drawn as it is.
// What the rules say: FIA 2026 F1 Sporting Regulations (Issue 07, 25 June 2026) B5.1.2 – "The layout of the Grid will
// be in a staggered 1 x 1 formation and the rows on the Grid will be separated by 16 metres": two slots per row, the
// second 8 m behind the first, so one slot every 8 m along the track, alternately left and right. The start line is
// one metre ahead of the first slot (FIA minimum, reported when Sepang's 2026 grid was repainted). Boxes have been
// 2.7 m wide since 2023 (FIA, reported by Motorsport.com). Drivers stop with their front wheels at the box's front line.
// Not known from any source found: how far from the track's middle each column is – drawn in the middle of its half
// of the tarmac (estimate) – and, at most circuits, which side pole is on (see POLE_SIDE).
//
// Coordinates: s – metres along the lap line (smooth.js trackFrame), d – metres across it (+ = left of travel).

export const GRID_RULES = {
  pitch: 8,             // m between consecutive slots (B5.1.2: rows of two 16 m apart, staggered)
  startLine: 1.0,       // m from the first slot's front line to the start line
  boxWidth: 2.7,        // m (2023 on)
  frontGap: 0.5,        // m from the box's front line back to the front axle (the tyre just behind the line)
  src: "FIA 2026 F1 Sporting Regulations Iss. 07 (2026-06-25) B5.1.2; start-line gap and box width as reported (the-race.com 2026-10-01, motorsport.com 2023-03)",
};

// Which side pole is on, where a source says so (side seen in the direction of travel). Elsewhere: an estimate.
export const POLE_SIDE = [
  { venue: 12, from: 2026, side: "right", src: "the-race.com / GPFans 2026-10-01: Sepang's grid repainted with pole on the right, as at past Malaysian GPs" },
];
export function poleSideFor(venue, year) {
  const e = POLE_SIDE.find((p) => p.venue === venue && (!p.from || (year || 0) >= p.from) && (!p.to || (year || 9999) <= p.to));
  return e ? { side: e.side === "left" ? 1 : -1, src: e.src, verified: true } : null;
}

const median = (a) => { const b = [...a].sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[n >> 1] : (b[n / 2 - 1] + b[n / 2]) / 2) : NaN; };

// Fit the grid to cars standing in it: obs [{ g (slot), s (m along the lap, the car's reference point) }], L the lap
// length (s wraps). Returns where slot 1's car stands (s1), the slot pitch used, and how well the cars fit:
//   - s1 is the median of s + pitch·(g − 1) – one far-off car doesn't move it (the feed's misfits are metres);
//   - the pitch is the rules' 8 m; the data's own slope is reported (pitchData, with its standard error) and used
//     instead only when it is well determined (14+ cars, error < 0.08 m) and disagrees by more than 0.3 m.
export function fitGrid(obs, L, { pitch = GRID_RULES.pitch } = {}) {
  let list = obs.filter((o) => o.g > 0 && Number.isFinite(o.s)).sort((a, b) => a.g - b.g);
  if (list.length < 3) return { ok: false, reason: "few", n: list.length };
  // unwrap round the median car's place projected to pole (the grid may straddle the lap line's start)
  const wrapD = (d) => (L ? ((d % L) + L * 1.5) % L - L / 2 : d);
  const ref = median(list.map((o) => o.s + pitch * (o.g - 1))), un = (s) => ref + wrapD(s - ref);
  // a car standing somewhere else altogether (stopped out on the circuit, in the pit lane's exit) is no part of the
  // grid: more than two slots off the median, left out (and listed)
  const dropped = list.filter((o) => Math.abs(wrapD(un(o.s) + pitch * (o.g - 1) - ref)) > 2 * pitch).map((o) => o.g);
  list = list.filter((o) => !dropped.includes(o.g));
  if (list.length < 3) return { ok: false, reason: "few", n: list.length, dropped };
  const xs = list.map((o) => o.g - 1), ys = list.map((o) => un(o.s));
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = sxx > 0 ? -xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx : NaN;
  const fitRes = ys.map((y, i) => y - (my - slope * (xs[i] - mx)));
  const se = n > 2 && sxx > 0 ? Math.sqrt(fitRes.reduce((a, r) => a + r * r, 0) / (n - 2) / sxx) : Infinity;
  let used = pitch, pitchFrom = "rules";
  if (n >= 14 && se < 0.08 && Math.abs(slope - pitch) > 0.3 && slope > 7 && slope < 9) { used = slope; pitchFrom = "data"; }
  const s1 = median(ys.map((y, i) => y + used * xs[i]));
  const res = list.map((o, i) => ({ g: o.g, r: ys[i] - (s1 - used * xs[i]) }));
  const rms = Math.sqrt(res.reduce((a, x) => a + x.r * x.r, 0) / n), maxRes = Math.max(...res.map((x) => Math.abs(x.r)));
  // a grid at all: the cars in slot order along the track at about the pitch (a queue behind the safety car, or cars
  // parked anywhere, has them far off)
  const ok = n >= 6 && Math.abs(slope - used) < 1.5 && rms < 4;
  return { ok, reason: ok ? "fit" : "poor fit", n, dropped, s1: L ? ((s1 % L) + L) % L : s1, pitch: used, pitchFrom, pitchData: +slope.toFixed(3), pitchSE: +se.toFixed(3), rms: +rms.toFixed(2), maxRes: +maxRes.toFixed(2), res };
}

// Where slot g's car stands along the lap (its reference point, between the axles)
export const slotS = (model, g, L) => { const s = model.s1 - model.pitch * (g - 1); return L ? ((s % L) + L) % L : s; };
// Across: the two columns in the middle of each half of the tarmac between the edges (left > right); `side` +1 when the
// odd slots (pole) are on the left
export function slotLat(g, left, right, side) {
  const c = (left + right) / 2, half = Math.max(1.6, (left - right) / 4);
  return c + (g % 2 ? side : -side) * half;
}

const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// smoothstep's slope (for the heading of a car easing across)
const smoothD = (e0, e1, x) => { if (x <= Math.min(e0, e1) || x >= Math.max(e0, e1)) return 0; const t = (x - e0) / (e1 - e0); return (6 * t * (1 - t)) / (e1 - e0); };

// How much of the way to its slot a car is drawn (0 = where the feed has it, 1 = in its slot), from what is known at
// that moment only:
//   standing   – stopped (telemetry speed, or the positions not moving) in its slot (assignSlots: within 1–1.5 slots): 1
//   arriving   – before the start, rolling slowly (< 15 m/s) up to its slot from behind: eased in over the last 40 m
//   leaving    – it stood in its slot (at τ) and has moved off: the offset it had there is let go with the distance it
//                has driven since – along the track over 40 m, across over 120 m (a car keeps to its side to the first
//                corner and drifts across) – so it starts moving the very moment the data has it moving
// Returns { along, across, dAcross (d across-weight / d metre driven), state }.
export const BLEND = { tol: 12, arrive: 40, arriveFull: 4, leaveAlong: 40, leaveAcross: 120, slow: 15 };
export function gridWeight({ delta, standing, preStart, speed, driven }) {
  if (standing && Math.abs(delta) <= BLEND.tol) return { along: 1, across: 1, dAcross: 0, state: "standing" };
  if (driven != null && driven >= 0 && driven < BLEND.leaveAcross) {
    const a = 1 - smooth(0, BLEND.leaveAlong, driven), c = 1 - smooth(0, BLEND.leaveAcross, driven);
    if (c > 0) return { along: a, across: c, dAcross: -smoothD(0, BLEND.leaveAcross, driven), state: "leaving" };
  }
  if (preStart && delta < BLEND.tol && delta > -BLEND.arrive && speed < BLEND.slow) {
    const w = smooth(-BLEND.arrive, -BLEND.arriveFull, delta) * (1 - smooth(BLEND.slow * 0.66, BLEND.slow, speed));
    if (w > 0) return { along: w, across: w, dAcross: smoothD(-BLEND.arrive, -BLEND.arriveFull, delta), state: "arriving" };
  }
  return { along: 0, across: 0, dAcross: 0, state: "free" };
}

// Which slot each standing car is in. Before the start: the published grid position (TimingAppData GridPos) – the
// car is known to be in that slot, so it is taken up to 1.5 slots off (the feed's misfits reach 8 m). After the clock
// has started, when 6+ cars stand still within the grid's length (a standing start after laps behind the safety car, or
// a standing restart after a red flag): whichever ranking fits where they stand best – the published grid (the start
// delayed: Sepang 2026, its pit-lane starters' slots left empty), the race order (a restart), or the order they stand
// in (a penalty moves a car in the order, not on the grid) – up to 1.5 slots off for the published grid, one slot for
// the others. A car further off is not put anywhere. cars: [{ num, s, gridPos, position, standing, onTrack }]
export const ASSIGN_TOL = { gridPos: 12, order: 8 };
export function assignSlots(cars, model, L, preStart) {
  const out = new Map();
  const near = (g, s) => { let d = s - slotS(model, g, L); if (L) d = ((d % L) + L * 1.5) % L - L / 2; return d; };
  if (preStart) {
    for (const c of cars) if (c.gridPos > 0) out.set(c.num, { g: c.gridPos, delta: near(c.gridPos, c.s), by: "gridPos" });
    return out;
  }
  const span = model.pitch * (model.slots + 1);
  const st = cars.filter((c) => c.standing && c.onTrack).map((c) => ({ c, u: near(1, c.s) })).filter((x) => x.u <= ASSIGN_TOL.gridPos && x.u > -span);
  if (st.length < 6) return out;
  const ranked = (list, by) => ({ by, r: list.map((x, k) => ({ x, g: k + 1, d: near(k + 1, x.c.s) })) });
  // (on a tie: the race order, then the order they stand in)
  const cands = [];
  if (st.every((x) => x.c.position > 0)) cands.push(ranked([...st].sort((a, b) => a.c.position - b.c.position), "position"));
  cands.push(ranked([...st].sort((a, b) => b.u - a.u), "order"));
  if (st.every((x) => x.c.gridPos > 0) && new Set(st.map((x) => x.c.gridPos)).size === st.length) cands.push({ by: "gridPos", r: st.map((x) => ({ x, g: x.c.gridPos, d: near(x.c.gridPos, x.c.s) })) });
  // (how badly a ranking fits: squared misfits, each capped at two slots)
  const cost = (c) => c.r.reduce((a, y) => a + Math.min(y.d * y.d, 256), 0);
  const best = cands.reduce((a, b) => (cost(b) < cost(a) ? b : a));
  const tol = ASSIGN_TOL[best.by === "gridPos" ? "gridPos" : "order"];
  for (const y of best.r) if (Math.abs(y.d) <= tol) out.set(y.x.c.num, { g: y.g, delta: y.d, by: best.by });
  return out;
}

// ---------- the circuit's own grid (startdata.js) ----------
// The grid as measured at this venue from F1's position data (tools/grid-survey.js), placed on this session's lap line.
// F1's coordinates are the same at a venue from year to year as a rule, but not always (Suzuka moved ~21 m between 2023
// and 2025), so a measurement is used only where its own lap line lies on this session's: its reference strip (the
// lap line around the grid, every 10 m) within 1.5 m (median) and 3 m (90 %), running the same way. Of those, the
// nearest year's (the later on a tie), pole's place their median along this lap line.
//   venueData – START_DATA[venue]; project([x, y] feed dm) → { s, d } on this session's lap line, or null
export function surveyedGrid(venueData, year, project, L) {
  const g = venueData?.grid;
  if (!g?.sessions?.length) return { ok: false, reason: "no measured grid for this venue" };
  const wrapD = (d) => (L ? ((d % L) + L * 1.5) % L - L / 2 : d);
  const fits = g.sessions.map((s) => {
    const ds = (s.ref || []).map((p) => { const pr = project(p); return pr ? Math.abs(pr.d) : Infinity; }).sort((a, b) => a - b);
    const med = ds.length ? ds[ds.length >> 1] : Infinity, p90 = ds.length ? ds[Math.floor(ds.length * 0.9)] : Infinity;
    const pr = project(s.pole), ahead = project([s.pole[0] + s.dir[0] * 200, s.pole[1] + s.dir[1] * 200]);
    const sameWay = pr && ahead ? wrapD(ahead.s - pr.s) > 10 : false;
    return { session: s.session, year: s.year, s1: pr?.s ?? null, med: +med.toFixed(2), p90: +p90.toFixed(2), sameWay, aligned: med < 1.5 && p90 < 3 && sameWay && !!pr };
  });
  const ok = fits.filter((f) => f.aligned);
  if (!ok.length) return { ok: false, reason: "the measured grids' lap lines don't lie on this session's", fits };
  const near = Math.min(...ok.map((f) => Math.abs(f.year - (year || 0))));
  const pickYear = Math.max(...ok.filter((f) => Math.abs(f.year - (year || 0)) === near).map((f) => f.year));
  const pick = ok.filter((f) => f.year === pickYear), ref = pick[0].s1;
  const rel = pick.map((f) => wrapD(f.s1 - ref)).sort((a, b) => a - b), mid = rel.length % 2 ? rel[rel.length >> 1] : (rel[rel.length / 2 - 1] + rel[rel.length / 2]) / 2;
  const s1 = L ? (((ref + mid) % L) + L) % L : ref + mid;
  // (how far the other years' grids are from this one, along the lap: a repainted grid would show here)
  const others = ok.filter((f) => f.year !== pickYear).map((f) => ({ session: f.session, along: +wrapD(f.s1 - s1).toFixed(1) }));
  return { ok: true, s1, pitch: g.pitch, pitchFrom: g.pitchFrom, sessions: pick.map((f) => f.session), others, fits };
}

// How many slots to draw: one per entrant of this session (its driver list, or the highest grid position if that is
// more); without either yet, the season's usual field (22 from 2026, 20 before) – an estimate, said so.
export function slotCount({ drivers = 0, maxGridPos = 0, year = null } = {}) {
  const n = Math.max(drivers, maxGridPos);
  if (n > 0) return { n: Math.min(26, n), from: drivers >= maxGridPos ? "driver list" : "grid positions" };
  return { n: (year || 0) >= 2026 ? 22 : 20, from: "estimate: the season's usual field" };
}
