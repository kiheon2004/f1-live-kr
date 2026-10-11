// Teams at their garages, from the session's own data.
//
// Where each team works isn't in the timing feed, but the cars' positions show it: in a race a car's pit stop
// (standing 1.5–8 s in the pit lane) is at its team's box, right in front of the team's garages (both drivers use the
// same box); in practice and qualifying a car standing a long while in the pit lane, at the same spot again and
// again, is at its own garage. (Measured at Silverstone 2025: the race's stops group by team, ~28 m apart, in the
// previous season's constructors' order; qualifying gives each driver's own garage.) So the garage allocation comes
// from the session itself – never from the standings or the order of the driver list – and a team without such data
// gets no garage: those stay neutral.
//
// The pit building's garages (facilities.js: userData.garages – slots with their position, direction, size, and
// project(x, z) → { u along the garages, off in front of them }) carry the layer built here: team-coloured back
// panels, a sign with the team's name over its garages, each driver's board, and equipment inside (tyre stacks,
// tool cabinets, a jack) – all inside the garages, nothing in the pit lane.
import * as THREE from "./vendor/three.module.js";

const STOP_MIN = 1500, STOP_MAX = 8000, LONG = 20000, STILL = 0.8;
// (a standstill cut in two by a small move – a nudge, the data jumping a little – is one: runs that follow each other
// within 0.6 s and stand within 1.5 m of the first are joined; seen in the real data, ~1 in 5 standstills at
// Silverstone 2025)
const JOIN_GAP = 600, JOIN_R = 1.5, HOLE = 2000;

// Every car's standstills as events, from its position samples (no frame needed: F1 decimetres as CarTracks).
// cars: { num: { t, x, y, n } }; upTo: only samples up to this time (a replay: what has happened by the moment shown).
// Each event: { num, t0, t1 (first and last still sample), X, Y (decimetres, where it stood), open (still standing at
// the last sample: it may go on), startKnown (a moving sample before it: it didn't start before the data did), hole
// (a gap of over 2 s in the samples during it), holeAfter (a gap right after it: when it ended isn't known) }.
export function standstillEvents(cars, upTo = Infinity) {
  const out = [];
  for (const [num, c] of Object.entries(cars || {})) {
    let n = c.n ?? c.t.length; if (!n) continue;
    if (upTo < Infinity) { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (c.t[m] <= upTo) lo = m + 1; else hi = m; } n = lo; if (!n) continue; }
    // runs of samples within STILL of the run's first one, joined into one standstill as above (a run of a single
    // sample can join: data jumping back and forth is still standing)
    let k = 0, a = -1, z = -1, ax = 0, ay = 0, hole = false;   // the standstill so far: samples a..z, standing at (ax, ay)
    const flush = () => {
      if (a >= 0 && c.t[z] - c.t[a] >= STOP_MIN) {
        out.push({ num, t0: c.t[a], t1: c.t[z], X: ax, Y: ay, hole, startKnown: a > 0 && c.t[a] - c.t[a - 1] <= HOLE,
          open: z === n - 1, holeAfter: z + 1 < n && c.t[z + 1] - c.t[z] > HOLE });
      }
      a = -1;
    };
    while (k < n) {
      let e = k, h = false;
      const x0 = c.x[k], y0 = c.y[k];
      while (e + 1 < n && Math.hypot(c.x[e + 1] - x0, c.y[e + 1] - y0) < STILL * 10) { if (c.t[e + 1] - c.t[e] > HOLE) h = true; e++; }
      if (a >= 0 && c.t[k] - c.t[z] <= JOIN_GAP && Math.hypot(x0 - ax, y0 - ay) <= JOIN_R * 10) { z = e; hole = hole || h; }
      else { flush(); a = k; z = e; ax = x0; ay = y0; hole = h; }
      k = e + 1;
    }
    flush();
  }
  return out;
}

// What an event counts as: "stop" (a pit stop: 1.5–8 s, finished, its start and end seen, within 60 s of entering the
// pit lane when that's known), "long" (20 s or more: a garage stay – also while still going on), "uncertain" (it
// could be a stop but the data doesn't say how long), else "other".
export function kindOf(e) {
  if (!e.inLane) return "other";
  const dur = e.t1 - e.t0;
  if (e.hole) return "uncertain";
  if (dur >= LONG) return "long";
  if (e.open || !e.startKnown || e.holeAfter) return dur <= STOP_MAX ? "uncertain" : "other";
  if (dur <= STOP_MAX) return e.afterEntry ? "stop" : "other";
  return "other";
}
// Where an event is in a pit building's frame ({ toScene([X, Y] metres) → [x, z], project(x, z) → { u, off }, span:
// [first, last garage u] }): along the garages (u) and out in front of them (off); only 0–16 m in front and along them
// is the pit lane.
function place(e, frame) {
  const [x, z] = frame.toScene([e.X / 10, e.Y / 10]), p = frame.project(x, z);
  e.u = p.u; e.off = p.off;
  e.inLane = p.off > -2 && p.off < 16 && p.u >= frame.span[0] - 5 && p.u <= frame.span[1] + 5;
}
// pitIn: { num: [ms the car entered the pit lane] } (TimingData's InPit) – a short standstill counts as a pit stop only
// within 60 s of entering (a queue at the pit exit before the start, or one held up there, doesn't).
const afterEntry = (e, pitIn) => !pitIn || (pitIn[e.num] || []).some((ms) => e.t0 >= ms - 2000 && e.t0 <= ms + 60000);
// Events per car in the shape the inference reads: { num: { stops: [{ u, t, dur, off, id }], long: [...], events } }
// (only cars with a stop or a long stay; events: all of the car's).
function byCar(events) {
  const out = {};
  for (const e of events) {
    const k = kindOf(e);
    const o = out[e.num] || (out[e.num] = { stops: [], long: [], events: [] });
    o.events.push(e);
    if (k === "stop" || k === "long") o[k === "stop" ? "stops" : "long"].push({ u: e.u, t: e.t0, dur: e.t1 - e.t0, off: e.off, id: e.id });
  }
  for (const [num, o] of Object.entries(out)) if (!o.stops.length && !o.long.length) delete out[num];
  return out;
}
const idOf = (e) => `${e.num}@${Math.round(e.t0)}`;

// Standstills of every car in front of the garages. cars: as standstillEvents; toScene([X, Y] metres) → [x, z];
// project(x, z) → { u, off } for the pit building; span: its garages' first and last u. Returns
// { num: { stops: [{ u, t, dur, off, id }], long: [...], events } } (t: when the standstill began).
export function standstills(cars, toScene, project, span, pitIn = null, upTo = Infinity) {
  const frame = { toScene, project, span }, ev = standstillEvents(cars, upTo);
  for (const e of ev) { place(e, frame); e.afterEntry = afterEntry(e, pitIn); e.id = idOf(e); }
  // (every event, also the uncertain ones, for merging with later looks: not enumerated with the cars)
  return Object.defineProperty(byCar(ev), "events", { value: ev, enumerable: false });
}

const median = (a) => { const b = a.slice().sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[n >> 1] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; };
// the biggest group of values within `tol` of each other (repeated visits to one place), or null if seen < `min` times
function mode(vals, tol, min) {
  let best = null;
  for (const v of vals) { const g = vals.filter((w) => Math.abs(w - v) <= tol); if (g.length >= min && (!best || g.length > best.length)) best = g; }
  return best ? median(best) : null;
}

// The same standstill seen twice (a live feed keeps only the last two minutes of positions, looked at again and
// again): the same car within 2 m, at times that meet (within 2 s). It's merged into one – its whole length, the end
// as last seen – and classified anew: one first seen 3 s in and later found to have lasted 40 s is a long stay, not
// a pit stop. A car leaving and coming back later is another one.
// (also when the looks didn't meet – the 3D view was closed in between – but one ended still standing there and the
// later one began with the car already standing there: nothing says it left)
function sameEvent(a, b) {
  if (a.num !== b.num || Math.abs(a.X - b.X) > 20 || Math.abs(a.Y - b.Y) > 20) return false;
  if (a.t0 <= b.t1 + HOLE && b.t0 <= a.t1 + HOLE) return true;
  const [p, n] = a.t0 <= b.t0 ? [a, b] : [b, a];
  return p.open && !n.startKnown;
}
function joinEvent(a, b) {
  const first = a.t0 <= b.t0 ? a : b, last = a.t1 >= b.t1 ? a : b;
  return { ...a, t0: first.t0, startKnown: first.startKnown, afterEntry: first.afterEntry, id: first.id, X: first.X, Y: first.Y, u: first.u, off: first.off, inLane: first.inLane,
    t1: last.t1, open: last.open, holeAfter: last.holeAfter, hole: a.hole || b.hole };
}
export function mergeEvents(into, add) {
  for (const e of add) {
    const i = into.findIndex((x) => sameEvent(x, e));
    if (i < 0) into.push({ ...e }); else into[i] = joinEvent(into[i], e);
  }
  // (two kept ones bridged by a longer look are one too)
  for (let i = 0; i < into.length; i++) for (let j = into.length - 1; j > i; j--) if (sameEvent(into[i], into[j])) { into[i] = joinEvent(into[i], into[j]); into.splice(j, 1); }
  return into;
}
// Standstills gathered over time ({ num: { stops, long, events } } as standstills returns), merged as above. (Results
// without events – an older caller – are merged by start time, each once.)
export function mergeStandstills(into, add) {
  for (const [num, s] of Object.entries(add)) {
    const m = into[num] || (into[num] = { stops: [], long: [] });
    if (s.events && (m.events || !m.stops.length && !m.long.length)) { m.events = mergeEvents(m.events || [], s.events); Object.assign(m, byCar(m.events)[num] || { stops: [], long: [] }); continue; }
    for (const kind of ["stops", "long"]) for (const x of s[kind]) if (!m[kind].some((y) => Math.abs(y.t - x.t) < 1000)) m[kind].push(x);
  }
  return into;
}

// Each driver's work position (u) and how it's known. In a race both drivers stop at the team's one box, so the stops
// are pooled per team and the place most of them agree on (within 4 m) is the box – one odd stop (held up in the
// pit lane, a queue at its exit) doesn't move it; a driver of that team without a stop of their own works there too.
// Without stops (practice, qualifying) a driver's own garage is where they stood a long while twice or more.
// drivers: DriverList (for the teams). Returns { num: { u, from: "box" | "garage" } }.
export function workPositions(still, drivers = {}) {
  const out = {}, team = (num) => drivers[num]?.TeamName || "#" + num, boxes = new Map();
  for (const [num, s] of Object.entries(still)) { const t = team(num); if (!boxes.has(t)) boxes.set(t, []); boxes.get(t).push(...s.stops.map((x) => x.u)); }
  for (const [t, us] of boxes) boxes.set(t, mode(us, 4, us.length >= 3 ? 2 : 1));
  const nums = new Set([...Object.keys(still), ...Object.keys(drivers)]);
  for (const num of nums) {
    const box = boxes.get(team(num));
    if (box != null && (still[num] || drivers[num])) { out[num] = { u: box, from: "box" }; continue; }
    const g = still[num] ? mode(still[num].long.map((x) => x.u), 4, 2) : null;
    if (g != null) out[num] = { u: g, from: "garage" };
  }
  return out;
}

// Garages per team: each team's centre is where its drivers work; its garages are the slots within half the way to
// the next team (at most 2.5 garages either side). drivers: DriverList ({ num: { TeamName, TeamColour, Tla, … } }).
// Returns [{ team, colour, centre, slots: [k], drivers: [{ num, tla, u, from }] }], sorted along the garages.
export function allocate(slots, pitch, drivers, positions) {
  const teams = new Map();
  for (const [num, p] of Object.entries(positions)) {
    const d = drivers?.[num]; if (!d?.TeamName) continue;
    if (!teams.has(d.TeamName)) teams.set(d.TeamName, { team: d.TeamName, colour: /^[0-9a-f]{6}$/i.test(d.TeamColour || "") ? "#" + d.TeamColour : "#9aa0a6", drivers: [] });
    teams.get(d.TeamName).drivers.push({ num, tla: d.Tla || num, u: p.u, from: p.from });
  }
  const list = [...teams.values()].map((t) => ({ ...t, centre: median(t.drivers.map((d) => d.u)) })).sort((a, b) => a.centre - b.centre);
  const used = new Set();
  for (let i = 0; i < list.length; i++) {
    const t = list[i], prev = list[i - 1], next = list[i + 1];
    const lo = Math.max(t.centre - pitch * 2.5, prev ? (prev.centre + t.centre) / 2 : -Infinity);
    const hi = Math.min(t.centre + pitch * 2.5, next ? (next.centre + t.centre) / 2 : Infinity);
    t.slots = slots.filter((s) => s.uc >= lo && s.uc < hi && !used.has(s.k)).map((s) => s.k);
    t.slots.forEach((k) => used.add(k));
    t.drivers.sort((a, b) => a.u - b.u || a.num.localeCompare(b.num));
  }
  return list.filter((t) => t.slots.length);
}

// ---------- confidence ----------
// A team's box is taken as known only when the evidence agrees: at least two pit stops (of either driver) within
// ±1.5 m of each other along the pit lane, the stops 1.8–6 s long (a working stop), and no other team's box within
// 5 m (a mix-up). A practice / qualifying garage needs three long stays of the driver within ±2 m, and the team's
// other driver's within two garages of it. Anything less: no place (the garages stay neutral). Each team's result
// says why: { team, u, from, n, spread, ok, reason }.
const spreadOf = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
function cluster(vals, tol) { let best = []; for (const v of vals) { const g = vals.filter((w) => Math.abs(w.u - v.u) <= tol); if (g.length > best.length) best = g; } return best; }
export function teamEvidence(still, drivers, pitch = 8) {
  const teams = new Map(), team = (num) => drivers?.[num]?.TeamName;
  for (const [num, s] of Object.entries(still)) {
    const t = team(num); if (!t) continue;
    if (!teams.has(t)) teams.set(t, { team: t, stops: [], long: {} });
    const e = teams.get(t);
    e.stops.push(...s.stops.filter((x) => x.dur == null || (x.dur >= 1800 && x.dur <= 6000)).map((x) => ({ ...x, num })));
    e.long[num] = s.long;
  }
  const out = [];
  for (const e of teams.values()) {
    const c = cluster(e.stops, 1.5);
    if (c.length >= 2) {
      const us = c.map((x) => x.u);
      out.push({ team: e.team, u: median(us), off: median(c.map((x) => x.off ?? 6)), from: "box", n: c.length, spread: +spreadOf(us).toFixed(2), drivers: [...new Set(c.map((x) => x.num))], support: c.map((x) => x.id).filter(Boolean), ok: true, reason: "stops agree" });
      continue;
    }
    // garages from long stays: each driver's own place, the two of the team close together
    const own = {}, support = [];
    for (const [num, l] of Object.entries(e.long)) { const g = cluster(l, 2); if (g.length >= 3) { own[num] = { u: median(g.map((x) => x.u)), n: g.length, spread: spreadOf(g.map((x) => x.u)) }; support.push(...g.map((x) => x.id).filter(Boolean)); } }
    const nums = Object.keys(own);
    if (nums.length >= 2 && Math.abs(own[nums[0]].u - own[nums[1]].u) <= pitch * 2.2) {
      out.push({ team: e.team, u: median(nums.map((n) => own[n].u)), from: "garage", n: nums.reduce((a, n) => a + own[n].n, 0), spread: +Math.max(...nums.map((n) => own[n].spread)).toFixed(2), drivers: nums, own, support, ok: true, reason: "both drivers' long stays agree" });
      continue;
    }
    out.push({ team: e.team, u: c.length ? c[0].u : null, from: null, n: c.length + nums.length, ok: false, reason: c.length === 1 ? "one stop only" : nums.length === 1 ? "one driver's garage only" : "no repeated place" });
  }
  // a mix-up: two teams' places within 5 m – neither is trusted
  const clash = out.map((a) => out.find((b) => a !== b && a.ok && b.ok && Math.abs(a.u - b.u) < 5));
  out.forEach((a, i) => { if (clash[i]) { a.ok = false; a.conflict = true; a.reason = "too close to " + clash[i].team; } });
  return out.sort((a, b) => (a.u ?? 1e9) - (b.u ?? 1e9));
}

// The places the garages are drawn for.
//   Replay: exactly what the session shows by the moment seen (observe(found, false) with everything up to then) –
//   nothing carried over, so seeking back takes a place away again and jumping to a moment gives what playing to it
//   gives.
//   Live (observe(found, true), each look at the last two minutes merged in): a team's place, once trusted, stays put
//   through small changes – it moves only when new trusted evidence puts it more than a garage away with at least
//   three observations – and it stays while there's simply no information (the driver list missing for a moment). It
//   is withdrawn when the evidence turns against it: two teams' places within 5 m (a conflict), the standstills it
//   stood on no longer counting as such (seen again, a "stop" was a long stay), its drivers in another team now (the
//   list corrected), the team no longer in the session; a new session starts over (reset).
//   frame (update's third argument: { rev, toScene, project, span } of the pit building): the events are placed in it
//   each time, so a rebuilt or moved building re-projects what was seen; places kept from another frame are dropped
//   and found again in the new one.
export class PitInference {
  constructor() { this.reset(); }
  reset() { this.still = {}; this.events = null; this.places = new Map(); this.live = false; this.frameRev = undefined; }
  observe(found, merge) {
    this.live = !!merge;
    const evs = found?.events;
    if (!evs) { if (merge) mergeStandstills(this.still, found); else this.still = found; return; }   // (results without events)
    this.events = merge ? mergeEvents(this.events || [], evs) : evs.slice();
    this.still = byCar(this.events);
  }
  update(drivers, pitch, frame = null) {
    if (frame && this.events) { for (const e of this.events) place(e, frame); this.still = byCar(this.events); }
    if (frame && frame.rev !== this.frameRev) { if (this.frameRev !== undefined) this.places.clear(); this.frameRev = frame.rev; }
    const ev = teamEvidence(this.still, drivers, pitch);
    if (!this.live) {
      this.places = new Map(ev.filter((e) => e.ok).map((e) => [e.team, { ...e }]));
      return { evidence: ev, places: [...this.places.values()] };
    }
    const list = Object.entries(drivers || {}), noInfo = !list.length;
    if (!noInfo) {
      const valid = new Set(Object.values(this.still).flatMap((s) => [...s.stops, ...s.long].map((x) => x.id)));
      const byTeam = new Map(ev.map((e) => [e.team, e]));
      for (const [team, cur] of [...this.places]) {
        const e = byTeam.get(team);
        const gone = !list.some(([, d]) => d?.TeamName === team);
        const corrected = (cur.support || []).some((id) => !valid.has(id)) || (cur.drivers || []).some((num) => drivers[num]?.TeamName !== team);
        if (gone || e?.conflict || corrected) this.places.delete(team);
      }
      for (const e of ev) {
        if (!e.ok) continue;
        const cur = this.places.get(e.team);
        if (!cur || (Math.abs(cur.u - e.u) > pitch && e.n >= 3)) this.places.set(e.team, { ...e });
        else this.places.set(e.team, { ...cur, n: e.n, spread: e.spread, support: e.support, drivers: e.drivers, own: e.own ?? cur.own });
      }
    }
    return { evidence: ev, places: [...this.places.values()] };
  }
}

// Garages for the trusted places. A race's place is the team's pit box in the pit lane – where the cars stop, not a
// garage: it's linked to the garages in front of which it lies (the box is 2–14 m out from their openings along the
// pit lane's direction, checked when the standstill was found), and that link is an inference, marked so (link:
// "inferred"). Each team gets the garages within half the way to its neighbours (at most 2.5 garages either side) –
// how many garages a team really has, and which is whose, isn't in the data: estimated: true. Each driver's board
// goes on the garage nearest their own place (a garage) or, at a shared box, side by side.
// What's drawn is fixed to 0.5 m (the box, its distance out, each place), so a place moving by a few centimetres
// draws – and keys – the same; the key (allocationKey) holds every value the layer is drawn from.
// overrides: confirmed garages for the session ([{ team, slots: [k], source }]) – drawn as given, not estimated.
// Returns [{ team, colour, centre, box, boxOff, from, link, estimated, slots: [k], drivers: [{ num, tla, label, u,
// slot, from }] }], sorted along the garages.
const Q = 0.5, q = (v) => (v == null ? null : Math.round(v / Q) * Q);
export function allocatePlaces(slots, pitch, drivers, places, overrides = []) {
  const members = (team) => Object.entries(drivers || {}).filter(([, d]) => d?.TeamName === team).map(([num, d]) => ({ num, tla: d.Tla || num, label: `${d.Tla || num}  ${d.RacingNumber || num}` }));
  const colourOf = (team) => { const d0 = Object.values(drivers || {}).find((d) => d?.TeamName === team); return /^[0-9a-f]{6}$/i.test(d0?.TeamColour || "") ? "#" + d0.TeamColour : "#9aa0a6"; };
  const fixed = new Map((overrides || []).filter((o) => o?.team && o.slots?.length).map((o) => [o.team, o]));
  const list = places.filter((p) => p.ok && !fixed.has(p.team)).map((p) => {
    const ds = members(p.team).map((m) => ({ ...m, u: q(p.from === "garage" && p.own?.[m.num] ? p.own[m.num].u : p.u), from: p.from }));
    return { team: p.team, colour: colourOf(p.team), centre: q(p.u), box: p.from === "box" ? q(p.u) : null, boxOff: p.from === "box" ? q(p.off ?? 6) : null, from: p.from, link: p.from === "box" ? "inferred" : "own", estimated: true, drivers: ds };
  }).sort((a, b) => a.centre - b.centre);
  const used = new Set(), bySlot = new Map(slots.map((s) => [s.k, s]));
  for (const o of fixed.values()) {
    const ss = o.slots.filter((k) => bySlot.has(k)); ss.forEach((k) => used.add(k));
    const uc = ss.length ? ss.reduce((a, k) => a + bySlot.get(k).uc, 0) / ss.length : 0;
    list.push({ team: o.team, colour: colourOf(o.team), centre: uc, box: null, boxOff: null, from: "confirmed", link: "confirmed", estimated: false, source: o.source || null, slots: ss,
      drivers: members(o.team).map((m) => ({ ...m, u: q(uc), from: "confirmed" })) });
  }
  const inferred = list.filter((t) => !t.slots);
  for (let i = 0; i < inferred.length; i++) {
    const t = inferred[i], prev = inferred[i - 1], next = inferred[i + 1];
    const lo = Math.max(t.centre - pitch * 2.5, prev ? (prev.centre + t.centre) / 2 : -Infinity), hi = Math.min(t.centre + pitch * 2.5, next ? (next.centre + t.centre) / 2 : Infinity);
    t.slots = slots.filter((s) => s.uc >= lo && s.uc < hi && !used.has(s.k)).map((s) => s.k);
    t.slots.forEach((k) => used.add(k));
  }
  for (const t of list) {
    t.drivers.sort((a, b) => a.u - b.u || a.num.localeCompare(b.num));
    const own = t.slots.map((k) => bySlot.get(k)).filter(Boolean);
    for (const d of t.drivers) d.slot = own.length ? own.reduce((p, s) => (Math.abs(s.uc - d.u) < Math.abs(p.uc - d.u) ? s : p)).k : null;
  }
  return list.filter((t) => t.slots.length).sort((a, b) => a.centre - b.centre);
}

// Confirmed garage allocations, kept apart from the inference: where a session's real allocation is published (the
// FIA's or a team's garage plan), it's recorded here with its source and drawn as given (link: "confirmed"), never
// estimated from stops. None is recorded yet: every allocation drawn is an estimate.
//   { facility: "silverstone-wing", year: 2026, session: "<path>" | null (the whole event), source, teams: [{ team, slots: [k] }] }
export const GARAGE_OVERRIDES = [];
export const overridesFor = (facility, year, session = null, list = GARAGE_OVERRIDES) =>
  list.filter((o) => o.facility === facility && o.year === year && (!o.session || o.session === session)).flatMap((o) => o.teams.map((t) => ({ ...t, source: o.source })));

// ---------- the layer ----------
// Shared geometry for the equipment (made once; never freed with a layer)
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const mark = (g) => { g.userData.shared = true; return g; };
  const merge = (parts) => {
    // a simple merge of non-indexed geometries
    const pos = [], nor = [];
    for (const g0 of parts) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); return g;
  };
  // a stack of four tyres (~0.72 m across, 0.38 m wide, 2026 sizes) standing on the floor
  const tyre = (y) => { const c = new THREE.CylinderGeometry(0.36, 0.36, 0.36, 18, 1); c.translate(0, y, 0); return c; };
  const tyres = merge([0, 1, 2, 3].map((i) => tyre(0.19 + i * 0.38)));
  // its blanket's band round the middle of each tyre
  const band = (y) => { const c = new THREE.CylinderGeometry(0.368, 0.368, 0.16, 18, 1, true); c.translate(0, y, 0); return c; };
  const blankets = merge([0, 1, 2, 3].map((i) => band(0.19 + i * 0.38)));
  // a tool cabinet (on castors) and a pit jack
  const cabinet = new THREE.BoxGeometry(1.5, 1.05, 0.6); cabinet.translate(0, 0.6, 0);
  const jackParts = [new THREE.BoxGeometry(0.5, 0.18, 1.2), new THREE.BoxGeometry(0.08, 0.08, 1.4)]; jackParts[0].translate(0, 0.12, 0); jackParts[1].rotateX(-0.6); jackParts[1].translate(0, 0.62, -1.0);
  const jack = merge(jackParts);
  const sign = new THREE.PlaneGeometry(1, 1);
  SHARED = { tyres: mark(tyres), blankets: mark(blankets), cabinet: mark(cabinet), jack: mark(jack), sign: mark(sign),
    rubber: Object.assign(new THREE.MeshStandardMaterial({ color: "#1a1b1d", roughness: 0.85 }), { userData: { shared: true } }),
    grey: Object.assign(new THREE.MeshStandardMaterial({ color: "#7a8086", roughness: 0.5, metalness: 0.4 }), { userData: { shared: true } }) };
  return SHARED;
}

// The labels of one layer in one texture: a row per team (its name on its colour) and per driver (code and number).
function atlas(rows) {
  const W = 512, R = 64, cv = document.createElement("canvas"); cv.width = W; cv.height = R * rows.length;
  const g = cv.getContext("2d");
  rows.forEach((r, i) => {
    g.fillStyle = r.bg; g.fillRect(0, i * R, W, R);
    g.fillStyle = r.fg; g.font = `700 ${r.size || 40}px Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(r.text, W / 2, i * R + R / 2 + 2);
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, uv: (i) => [0, 1 - (i + 1) / rows.length, 1, 1 - i / rows.length] };
}
const textOn = (hex) => { const n = parseInt(hex.slice(1), 16), l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); return l > 150 ? "#111111" : "#ffffff"; };

// The layer for one allocation: returns a THREE.Group owning its geometry, materials and label texture.
export function teamLayer(garages, teams, drivers) {
  const S = shared(), group = new THREE.Group(); group.name = "pitTeams";
  if (!teams.length) return group;
  const bySlot = new Map(garages.slots.map((s) => [s.k, s]));
  // frame of a slot: a point d m inside from the front, w m along from the opening's centre, y over the floor
  const at = (s, d, w, y) => new THREE.Vector3(s.front[0] + s.inward[0] * d + s.along[0] * w, s.floor + y, s.front[1] + s.inward[1] * d + s.along[1] * w);
  const yawIn = (s) => Math.atan2(-s.inward[0], -s.inward[1]);   // a plane facing out of the garage (to the pit lane)
  // labels
  const rows = [];
  for (const t of teams) { t.row = rows.length; rows.push({ text: t.team.toUpperCase(), bg: t.colour, fg: textOn(t.colour), size: 34 }); }
  for (const t of teams) for (const d of t.drivers) { d.row = rows.length; const dl = drivers?.[d.num]; rows.push({ text: d.label ?? `${d.tla}  ${dl?.RacingNumber || d.num}`, bg: "#111316", fg: "#ffffff", size: 40 }); }
  const lab = atlas(rows);
  const labelMat = new THREE.MeshStandardMaterial({ map: lab.tex, roughness: 0.6, emissive: "#ffffff", emissiveMap: lab.tex, emissiveIntensity: 0.25 });
  labelMat.userData.ownedTextures = [lab.tex];
  // quads (panels and labels) merged per material
  const panels = { pos: [], col: [], nor: [] }, labels = { pos: [], uv: [], nor: [] };
  const quad = (store, c, ax, ay, n, uv, colour) => {
    // (wound to face n: a label then reads the right way round from the pit lane)
    if (new THREE.Vector3().crossVectors(ax, ay).dot(n) < 0) ax = ax.clone().negate();
    const P = [c.clone().addScaledVector(ax, -0.5).addScaledVector(ay, -0.5), c.clone().addScaledVector(ax, 0.5).addScaledVector(ay, -0.5), c.clone().addScaledVector(ax, 0.5).addScaledVector(ay, 0.5), c.clone().addScaledVector(ax, -0.5).addScaledVector(ay, 0.5)];
    const UV = uv ? [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]] : null;
    for (const k of [0, 1, 2, 0, 2, 3]) { store.pos.push(P[k].x, P[k].y, P[k].z); store.nor.push(n.x, n.y, n.z); if (UV) store.uv.push(...UV[k]); if (colour) store.col.push(colour.r, colour.g, colour.b); }
  };
  const inst = { tyres: [], cabinet: [], jack: [] };
  const col = new THREE.Color();
  for (const t of teams) {
    col.set(t.colour);
    const ss = t.slots.map((k) => bySlot.get(k)).filter(Boolean).sort((a, b) => a.uc - b.uc);
    for (const s of ss) {
      const along = new THREE.Vector3(s.along[0], 0, s.along[1]), up = new THREE.Vector3(0, 1, 0), out = new THREE.Vector3(-s.inward[0], 0, -s.inward[1]);
      // the team's colour on the back wall (lower two thirds) and a stripe along the ceiling's edge
      quad(panels, at(s, s.depth - 0.03, 0, s.ceil * 0.36), along.clone().multiplyScalar(s.width - 0.2), up.clone().multiplyScalar(s.ceil * 0.66), out, null, col);
      // the side walls panelled in the team's colour up to 2.4 m (teams line their garages), a dark skirting under it
      const inw = new THREE.Vector3(s.inward[0], 0, s.inward[1]), dark = col.clone().multiplyScalar(0.35);
      for (const side of [-1, 1]) {
        const n = along.clone().multiplyScalar(-side), w = side * (s.width / 2 - 0.03), len = s.depth - 0.6;
        quad(panels, at(s, 0.3 + len / 2, w, 1.35), inw.clone().multiplyScalar(len), up.clone().multiplyScalar(2.1), n, null, col);
        quad(panels, at(s, 0.3 + len / 2, w, 0.15), inw.clone().multiplyScalar(len), up.clone().multiplyScalar(0.3), n, null, dark);
      }
      // a light rig hanging under the ceiling across the garage
      quad(panels, at(s, s.depth * 0.55, 0, s.ceil - 0.6), along.clone().multiplyScalar(s.width - 0.6), inw.clone().multiplyScalar(0.35), new THREE.Vector3(0, -1, 0), null, new THREE.Color("#2b2f33"));
      // equipment: tyre stacks along both side walls, a cabinet at the back, the jack by the door
      const tc = col.clone();
      for (const side of [-1, 1]) for (const d of [2.0, 3.0, 4.0]) if (d < s.depth - 1.2) inst.tyres.push([at(s, d, side * (s.width / 2 - 0.55), 0), 0, tc]);
      inst.cabinet.push([at(s, s.depth - 0.5, -s.width * 0.18, 0), yawIn(s), tc]);
      inst.cabinet.push([at(s, s.depth - 0.5, s.width * 0.18, 0), yawIn(s), tc]);
      inst.jack.push([at(s, 1.4, s.width * 0.25, 0), yawIn(s), null]);
    }
    // the team's name over its garages (on the front, just under the band above the openings)
    const a = ss[0], b = ss[ss.length - 1], mid = at(a, -0.06, 0, 0).add(at(b, -0.06, 0, 0)).multiplyScalar(0.5);
    const along = new THREE.Vector3(a.along[0], 0, a.along[1]), out = new THREE.Vector3(-a.inward[0], 0, -a.inward[1]);
    const span = Math.min(14, (b.uc - a.uc) + a.width * 0.8);
    mid.y = Math.max(a.floor, b.floor) + a.height + 0.28;
    // (the band in the team's colour over all its garages; the name on it at the atlas row's own 8:1 proportions)
    quad(panels, mid.clone().addScaledVector(out, -0.01), along.clone().multiplyScalar(span), new THREE.Vector3(0, 0.6, 0), out, null, col);
    const lw = Math.min(span, 4.8);
    quad(labels, mid, along.clone().multiplyScalar(lw), new THREE.Vector3(0, lw / 8, 0), out, lab.uv(t.row));
    // each driver's board, hanging inside at the front of the garage nearest where they work
    t.drivers.forEach((d, i) => {
      const s = (d.slot != null && bySlot.get(d.slot)) || ss.reduce((p, q) => (Math.abs(q.uc - d.u) < Math.abs(p.uc - d.u) ? q : p));
      const shift = t.drivers.length > 1 && t.drivers.every((x) => x.from === "box") ? (i - (t.drivers.length - 1) / 2) * 1.9 : 0;
      quad(labels, at(s, 0.9, shift, s.height - 0.55), along.clone().multiplyScalar(1.76), new THREE.Vector3(0, 0.22, 0), out, lab.uv(d.row));
    });
  }
  // the team's box painted in the pit lane where its cars stopped (yellow, as in the photos), and its stand on the
  // pit wall walkway opposite (a roofed desk with screens) – both only where the box is known
  const marks = { pos: [], col: [], nor: [] }, yellow = new THREE.Color("#f2c200");
  for (const t of teams) {
    if (t.box == null) continue;
    const s = garages.slots.reduce((p, q) => (Math.abs(q.uc - t.box) < Math.abs(p.uc - t.box) ? q : p));
    const along = new THREE.Vector3(s.along[0], 0, s.along[1]), out = new THREE.Vector3(-s.inward[0], 0, -s.inward[1]), up = new THREE.Vector3(0, 1, 0);
    const c0 = new THREE.Vector3(s.front[0], s.floor + 0.03, s.front[1]).addScaledVector(along, t.box - s.uc).addScaledVector(out, t.boxOff);
    for (const [da, dw, la, lw] of [[0, -1.1, 5.6, 0.14], [0, 1.1, 5.6, 0.14], [-2.8, 0, 0.14, 2.3], [2.8, 0, 0.14, 2.3]]) {
      const c = c0.clone().addScaledVector(along, da).addScaledVector(out, dw);
      quad(marks, c, along.clone().multiplyScalar(la), out.clone().multiplyScalar(lw), up, null, yellow);
    }
    const w = garages.wallAt?.(t.box);
    if (w) {
      col.set(t.colour);
      const p = new THREE.Vector3(...w.p), A = new THREE.Vector3(w.along[0], 0, w.along[1]), O = new THREE.Vector3(w.out[0], 0, w.out[1]);
      // desk (front panel in the team's colour), the roof over it, the screens' dark band
      quad(panels, p.clone().addScaledVector(up, 0.55).addScaledVector(O, 1.2), A.clone().multiplyScalar(4.5), up.clone().multiplyScalar(1.1), O, null, col);
      quad(panels, p.clone().addScaledVector(up, 2.6), A.clone().multiplyScalar(4.8), O.clone().multiplyScalar(3.2), up, null, col.clone().multiplyScalar(0.55));
      quad(panels, p.clone().addScaledVector(up, 1.5).addScaledVector(O, 0.9), A.clone().multiplyScalar(4.2), up.clone().multiplyScalar(0.6), O, null, new THREE.Color("#15181b"));
      quad(labels, p.clone().addScaledVector(up, 2.2).addScaledVector(O, 1.62), A.clone().multiplyScalar(3.2), up.clone().multiplyScalar(0.4), O, lab.uv(t.row));
    }
  }
  const mesh = (store, mat, name) => {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(store.pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(store.nor, 3));
    if (store.uv?.length) g.setAttribute("uv", new THREE.Float32BufferAttribute(store.uv, 2));
    if (store.col?.length) g.setAttribute("color", new THREE.Float32BufferAttribute(store.col, 3));
    const m = new THREE.Mesh(g, mat); m.name = name; group.add(m);
  };
  if (panels.pos.length) mesh(panels, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide }), "teamPanels");
  if (labels.pos.length) mesh(labels, labelMat, "teamLabels");
  if (marks.pos.length) mesh(marks, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }), "boxMarks");
  // instanced equipment
  const instanced = (geo, mat, list, name, coloured) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    const grey = new THREE.Color("#9aa0a6");
    list.forEach(([p, yaw, c], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); m4.compose(p, q, sc); im.setMatrixAt(i, m4); if (coloured) im.setColorAt(i, c || grey); });
    im.computeBoundingSphere();
    im.name = name; group.add(im);
  };
  instanced(S.tyres, S.rubber, inst.tyres, "tyres");
  instanced(S.blankets, new THREE.MeshStandardMaterial({ roughness: 0.8 }), inst.tyres, "blankets", true);
  instanced(S.cabinet, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 }), inst.cabinet, "cabinets", true);
  instanced(S.jack, S.grey, inst.jack, "jacks");
  return group;
}

// A key for an allocation (to rebuild only when it changes)
// (garage indices only – a place moving within its garage doesn't rebuild anything)
// (every value teamLayer draws from: the team, its colour and garages, where its box is drawn and how far out, each
// driver's board – its text and garage)
export const allocationKey = (teams) => teams.map((t) => [t.team, t.colour, t.from, t.link, t.slots.join(","), t.box ?? "", t.boxOff ?? "",
  t.drivers.map((d) => `${d.num}=${d.label ?? d.tla}@${d.slot ?? ""}`).join("+")].join(":")).join("|");
