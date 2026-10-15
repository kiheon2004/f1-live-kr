// The starts of a race and where each car is in them – the middle layer between the circuit's fixed grid (grid.js,
// startdata.js) and what is drawn at a moment (map3d.js). Pure functions and a small history (no three.js).
//
// What a start is, from the data (only what has happened by the moment asked about – a replay never looks ahead):
//   - the race clock starting to run (ExtrapolatedClock.Extrapolating false → true): lights out, or a restart;
//   - standing or rolling: the last race-control message saying so ("STANDING START", "ROLLING START", "… START BEHIND
//     THE SAFETY CAR") since the previous one; the first start is standing unless a message says otherwise;
//   - the order: the first start – the published grid (TimingAppData GridPos); a restart – race control's
//     "RESUMPTION ORDER: 12, 44, …" or "START ORDER: ORIGINAL GRID"; otherwise not known (the 3D view then matches
//     cars standing still to slots by where they are, grid.js assignSlots).
// Each car at a start:
//   grid    – it has a slot and isn't in the pit lane or out;
//   pit     – in the pit lane (TimingData InPit) at lights out: a pit-lane start, its slot left empty;
//   out     – retired or stopped;
//   none    – no slot in this start's order (not in the resumption order).
// Where a car is drawn when the feed has no position for it (Monaco 2026: none from 27 min before the start to a few
// seconds after) – only with the car's own telemetry to go by, never made up:
//   in its slot     – it drove a formation lap (or the lap to the grid at a restart: ≥ 30 % of a lap) and has stood
//                     still since, up to lights out (CarData speed ≤ 2 km/h);
//   launched        – after lights out, its slot moved on by the distance its speed telemetry adds up to, eased onto
//                     the racing line like a car leaving its column (grid.js BLEND) – up to 600 m, then not drawn;
//   pit-lane queue  – a pit-lane starter standing still: at the pit exit (startdata.js pit lane), one car length
//                     apart in its grid order (the real order isn't in the data: an estimate);
//   otherwise       – not drawn (position unknown).

export const PLAN = { still: 2, formation: 0.3, launchMax: 600, queueGap: 7.5, standMin: 2000, field: 0.6 };

// ExtrapolatedClock / race-control / TimingData flags over time: built from a replay's events, or noted as a live feed
// is applied (note()).
export class StartHistory {
  constructor() { this.clock = []; this.rcm = []; this.flags = new Map(); this.grid = new Map(); this.lastMsg = 0; this.lastClock = null; }
  static fromEvents(events) {
    const h = new StartHistory();
    for (const e of events) {
      if (e.topic === "ExtrapolatedClock") h.noteClock(e.ms, e.data);
      else if (e.topic === "RaceControlMessages") { const m = e.data?.Messages; for (const x of Array.isArray(m) ? m : Object.values(m || {})) h.noteMsg(e.ms, x?.Message); }
      else if (e.topic === "TimingData") for (const [num, l] of Object.entries(e.data?.Lines || {})) h.noteLine(e.ms, num, l);
      else if (e.topic === "TimingAppData") for (const [num, l] of Object.entries(e.data?.Lines || {})) if (l && l.GridPos != null) h.grid.set(num, +l.GridPos || 0);
    }
    return h;
  }
  noteClock(t, data) {
    if (!data || data.Extrapolating == null) return;
    const run = !!data.Extrapolating;
    if (run !== this.lastClock) { this.clock.push([t, run]); this.lastClock = run; }
  }
  noteMsg(t, msg) { if (typeof msg === "string") this.rcm.push([t, msg]); }
  noteLine(t, num, l) {
    if (!l || typeof l !== "object") return;
    for (const k of ["InPit", "Retired", "Stopped"]) if (l[k] != null) {
      const key = num + ":" + k, list = this.flags.get(key) || (this.flags.set(key, []), this.flags.get(key));
      const v = !!l[k];
      if (!list.length || list[list.length - 1][1] !== v) list.push([t, v]);
    }
  }
  // live: the state as it is now (the history keeps changes only)
  note(t, state) {
    this.noteClock(t, state.ExtrapolatedClock);
    const m = state.RaceControlMessages?.Messages, list = Array.isArray(m) ? m : Object.values(m || {});
    // (only messages not seen before: a fresh snapshot after a reconnect brings the whole list again)
    if (list.length !== this.lastMsg) {
      const seen = this.seenMsg || (this.seenMsg = new Set());
      for (const x of list) { const k = `${x?.Utc}|${x?.Message}`; if (!seen.has(k)) { seen.add(k); this.noteMsg(t, x?.Message); } }
      this.lastMsg = list.length;
    }
    for (const [num, l] of Object.entries(state.TimingData?.Lines || {})) this.noteLine(t, num, l);
    for (const [num, l] of Object.entries(state.TimingAppData?.Lines || {})) if (l?.GridPos != null) this.grid.set(num, +l.GridPos || 0);
  }
  flagAt(num, k, t) { const list = this.flags.get(num + ":" + k); let v = false; if (list) for (const [ts, x] of list) { if (ts > t) break; v = x; } return v; }
  // the starts up to time t: [{ t, n (1 = the race start), standing, order: [nums] | null, orderFrom }]
  starts(t = Infinity) {
    const out = [];
    let prev = -Infinity;
    for (const [ts, run] of this.clock) {
      if (ts > t) break;
      if (!run) { prev = ts; continue; }
      // (a clock that runs again after a pause without a red flag isn't a start: the clock stops for a red flag only)
      const msgs = this.rcm.filter(([tm]) => tm <= ts + 1000 && tm > (out.length ? out[out.length - 1].t : -Infinity));
      const first = out.length === 0;
      if (!first && !msgs.some(([, m]) => /RED FLAG|SUSPENDED|RESUM/.test(m))) { prev = ts; continue; }
      let standing = first ? true : null;
      for (const [, m] of msgs) { if (/STANDING START/.test(m)) standing = true; else if (/ROLLING START|START BEHIND THE SAFETY CAR|WILL START BEHIND/.test(m)) standing = false; }
      let order = null, orderFrom = null;
      if (first) { order = [...this.grid.entries()].filter(([, g]) => g > 0).sort((a, b) => a[1] - b[1]).map(([n]) => n); orderFrom = "GridPos"; }
      for (const [, m] of msgs) {
        const r = /RESUMPTION ORDER:?\s*([\d,\s]+)/.exec(m);
        if (r) { order = r[1].split(/[,\s]+/).filter(Boolean); orderFrom = "race control: resumption order"; }
        else if (/START ORDER:\s*ORIGINAL GRID/.test(m)) { order = [...this.grid.entries()].filter(([, g]) => g > 0).sort((a, b) => a[1] - b[1]).map(([n]) => n); orderFrom = "race control: original grid"; }
      }
      out.push({ t: ts, n: out.length + 1, standing, order, orderFrom, after: prev });
      prev = ts;
    }
    return out;
  }
  // the latest pit-exit signal race control has given by t: "open" | "closed" | null
  pitExitAt(t) {
    let v = null;
    for (const [tm, m] of this.rcm) { if (tm > t) break; if (/PIT EXIT CLOSED/.test(m)) v = "closed"; else if (/PIT EXIT OPEN/.test(m)) v = "open"; }
    return v;
  }
}

// The start that matters at time t, from what is known by t (a replay never looks ahead):
//   - before the race clock first runs: the race start to come (order: the published grid);
//   - up to 15 minutes after a start's clock began to run (a standing start can follow laps behind the safety car:
//     Sepang 2026 lit its lights ~6 min after the clock started): that start;
//   - the clock stopped by a red flag: the restart to come, in race control's resumption order (or the original grid);
//   - otherwise null (racing).
const gridOrder = (hist) => [...hist.grid.entries()].filter(([, g]) => g > 0).sort((a, b) => a[1] - b[1]).map(([n]) => n);
export function startContext(hist, t) {
  const done = hist.starts(t), last = done[done.length - 1];
  const say = (msgs, base) => {
    let { standing, order, orderFrom } = base;
    for (const [, m] of msgs) {
      const r = /RESUMPTION ORDER:?\s*([\d,\s]+)/.exec(m);
      if (r) { order = r[1].split(/[,\s]+/).filter(Boolean); orderFrom = "race control: resumption order"; }
      else if (/START ORDER:\s*ORIGINAL GRID/.test(m)) { order = gridOrder(hist); orderFrom = "race control: original grid"; }
      if (/STANDING START/.test(m)) standing = true; else if (/ROLLING START|START BEHIND THE SAFETY CAR|WILL START BEHIND/.test(m)) standing = false;
    }
    return { standing, order, orderFrom };
  };
  if (!last) return { t: Infinity, n: 1, pending: true, ...say(hist.rcm.filter(([tm]) => tm <= t), { standing: true, order: gridOrder(hist), orderFrom: "GridPos" }) };
  let running = false; for (const [ts, run] of hist.clock) { if (ts > t) break; running = run; }
  if (running) return t - last.t < 900000 ? { ...last, ...say(hist.rcm.filter(([tm]) => tm <= t && tm > last.t), last) } : null;
  const msgs = hist.rcm.filter(([tm]) => tm <= t && tm > last.t);
  if (!msgs.some(([, m]) => /RED FLAG|SUSPENDED/.test(m))) return null;
  return { t: Infinity, n: done.length + 1, pending: true, ...say(msgs, { standing: null, order: null, orderFrom: null }) };
}

// A car's kind at a start, from what is known at time t (≤ lights out: now; after: as it was at lights out).
// (the race start: in the pit lane at lights out = a pit-lane start. A restart: the race clock runs again with the cars
// still in the pit lane behind the safety car – they reach the grid minutes later (Monaco 2026: clock +7729 s, the field
// standing on the grid +7990–8008 s) – so only being in the pit lane now counts)
export function carKind(hist, start, num, t) {
  const at = start.n > 1 ? t : Math.min(t, start.t), inPitNow = hist.flagAt(num, "InPit", t);
  if (hist.flagAt(num, "Retired", t) || hist.flagAt(num, "Stopped", t)) return { kind: "out" };
  // (the published grid: the car's own grid position – a pit-lane starter's slot is left empty, not filled from behind;
  // race control's resumption order: the place in it)
  const g = /GridPos|original grid/.test(start.orderFrom || "") ? (start.order?.includes(num) ? hist.grid.get(num) || 0 : 0) : start.order ? start.order.indexOf(num) + 1 : 0;
  if (hist.flagAt(num, "InPit", at)) return { kind: "pit", g: g || null, inPitNow };
  if (!g) return { kind: "none" };
  return { kind: "grid", g, inPitNow };
}

// Telemetry: the speed samples { t: [ms], v: [km/h] } of a car. When it last stood still from (stillSince) and whether
// the stretch it drove before that was long enough to be the lap to the grid (≥ need metres) – from samples ≤ t only.
export function arrivalBy(car, t, need, lag = 0) {
  if (!car?.t?.length) return null;
  const T = car.t, V = car.v;
  let i = T.length - 1;
  while (i >= 0 && T[i] - lag > t) i--;
  if (i < 0 || V[i] > PLAN.still) return { still: false };
  let j = i; while (j > 0 && V[j - 1] <= PLAN.still) j--;
  const stillSince = T[j] - lag;
  // the drive before it: back to the previous standstill of 30 s or more
  let dist = 0, k = j - 1, stillRun = 0;
  for (; k > 0; k--) {
    const dt = (T[k] - T[k - 1]) / 1000;
    if (dt > 0 && dt < 3) dist += ((V[k] + V[k - 1]) / 2 / 3.6) * dt;
    if (V[k] <= PLAN.still) { stillRun += dt; if (stillRun > 30) break; } else stillRun = 0;
  }
  return { still: true, stillSince, drove: dist, ok: dist >= need && t - stillSince >= PLAN.standMin };
}

const smooth = (e0, e1, x) => { const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };

// The moment a moving car last set off from a standstill (by its telemetry, samples ≤ t), or null.
export function departure(car, t, lag = 0) {
  if (!car?.t?.length) return null;
  const T = car.t, V = car.v;
  let i = T.length - 1;
  while (i >= 0 && T[i] - lag > t) i--;
  if (i < 1 || V[i] <= PLAN.still) return null;
  while (i > 0 && V[i - 1] > PLAN.still) i--;
  return i > 0 ? T[i] - lag : null;
}

// Is (x, z) on the pit lane's path (pts [{x, z}], cum: metres along it at each point)? Within `tol` m of it and `ends` m
// clear of its ends (where it runs into the lap line) – a car the feed places there is in the pit lane whatever its
// InPit flag says (Sepang 2026: the field queued in the pit lane behind a suspended start, InPit cleared for every car).
// Returns the metres along it, or null.
export function onPitPath(pts, cum, x, z, tol = 3, ends = 40) {
  if (!pts || pts.length < 2) return null;
  const len = cum[cum.length - 1];
  let best = Infinity, bu = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const f = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
    const d = Math.hypot(a.x + dx * f - x, a.z + dz * f - z);
    if (d < best) { best = d; bu = cum[i - 1] + (cum[i] - cum[i - 1]) * f; }
  }
  return best <= tol && bu >= ends && bu <= len - ends ? bu : null;
}

// Where a car with no position at time t is drawn, or null. In track coordinates { s, d, vs, vd, as, est } (est: why);
// in the pit lane { pit: true, u (m along the pit path), vs, est }.
//   start  – startContext; kind – carKind (with inPitNow: the car in the pit lane at t)
//   slot   – { s, lat } of its slot (grid kind)
//   car    – its telemetry { t, v }; lag – telemetry lag (ms); Sv – distance travelled from it (smooth.js
//            speedIntegral, with .v/.a); need – metres of driving before a standstill that make it an arrival on the grid
//   line(s) – the racing line's offset; L – the lap's length
//   pit    – { queueU: u of the first place in the queue, queueIndex } for a pit-lane starter
// fieldStill(t): the share of the field standing still at t by their telemetry – a car stopped on its own (a pit stop,
// a crash) isn't on the grid: the whole field stands at a start.
//   arrival(t) – arrivalBy for this car at t, cached by the caller (optional)
export function placeWithout({ start, kind, slot, car, lag = 0, Sv, t, line, L, need, pit, fieldStill, arrival }) {
  if (!start || !kind || !car) return null;
  const field = (tt) => (fieldStill ? fieldStill(tt) >= PLAN.field : true);
  const fieldDuring = (t0, t1) => { for (let tt = t1; tt >= Math.max(t0, t1 - 30000); tt -= 1000) if (field(tt)) return true; return false; };
  const arr = (tt, n) => (arrival && n === need ? arrival(tt) : arrivalBy(car, tt, n, lag));
  if (kind.kind === "grid" && slot && start.standing !== false && !kind.inPitNow) {
    const a = arr(t, need);
    if (!a) return null;
    // (standing: the field stood with it at some moment of its standstill – a slow starter is still on the grid when
    // the others have gone)
    if (a.still) return a.ok && fieldDuring(a.stillSince, t) ? { s: slot.s, d: slot.lat, vs: 0, vd: 0, as: 0, est: "slot", since: a.stillSince } : null;
    // moving: launched from its slot if it stood there (after the drive to the grid) before setting off
    const go = departure(car, t, lag);
    if (go == null || !Sv) return null;
    const before = arr(go - 1, need);
    if (!before?.ok || !field(go - 500)) return null;
    const driven = Math.max(0, Sv(t) - Sv(go));
    if (driven > PLAN.launchMax) return null;
    const w = 1 - smooth(0, 120, driven), s = slot.s + driven, ln = line ? line(s) : 0;
    return { s: L ? ((s % L) + L) % L : s, d: slot.lat * w + ln * (1 - w), vs: Sv.v ? Sv.v(t) : 0, vd: 0, as: Sv.a ? Sv.a(t) : 0, est: "launch", go, driven };
  }
  if (kind.kind === "pit" && pit) {
    const a = arrivalBy(car, t, 0, lag);
    if (!a) return null;
    const u0 = pit.queueU - pit.queueIndex * PLAN.queueGap;
    if (a.still) return fieldDuring(a.stillSince, t) ? { pit: true, u: u0, vs: 0, est: "pit queue", since: a.stillSince } : null;
    const go = departure(car, t, lag);
    if (go == null || !Sv) return null;
    // (it waited there while the field stood on the grid – it sets off only once the field has passed the pit exit)
    const w = arrivalBy(car, go - 1, 0, lag);
    let queued = false; if (w?.still) for (let tt = go - 500; tt >= Math.max(w.stillSince, go - 60000); tt -= 2000) if (field(tt)) { queued = true; break; }
    if (!queued) return null;
    const driven = Math.max(0, Sv(t) - Sv(go));
    if (driven > PLAN.launchMax) return null;
    return { pit: true, u: u0 + driven, vs: Sv.v ? Sv.v(t) : 0, est: "pit exit", go, driven };
  }
  return null;
}
