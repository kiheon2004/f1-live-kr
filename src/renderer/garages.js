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
import { peopleMeshes } from "./crew.js";
import { driverPanel, paintPanel } from "./pitscreens.js";
import { teamKey } from "./pitorder.js";
import { CAR_ENVELOPE } from "./carbounds.js";
import { carSpotDepth } from "./garagespace.js";

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
    // (also kept, for cutting the event at an earlier moment – eventsUpTo: its samples' indices a..z, the time of the
    // sample after it, and the first sample after a hole)
    let k = 0, a = -1, z = -1, ax = 0, ay = 0, holeAt = null;   // the standstill so far: samples a..z, standing at (ax, ay)
    const flush = () => {
      if (a >= 0 && c.t[z] - c.t[a] >= STOP_MIN) {
        out.push({ num, t0: c.t[a], t1: c.t[z], X: ax, Y: ay, hole: holeAt != null, startKnown: a > 0 && c.t[a] - c.t[a - 1] <= HOLE,
          open: z === n - 1, holeAfter: z + 1 < n && c.t[z + 1] - c.t[z] > HOLE, a, z, holeAt, nextT: z + 1 < n ? c.t[z + 1] : null });
      }
      a = -1;
    };
    while (k < n) {
      let e = k, h = null;
      const x0 = c.x[k], y0 = c.y[k];
      while (e + 1 < n && Math.hypot(c.x[e + 1] - x0, c.y[e + 1] - y0) < STILL * 10) { if (h == null && c.t[e + 1] - c.t[e] > HOLE) h = c.t[e + 1]; e++; }
      if (a >= 0 && c.t[k] - c.t[z] <= JOIN_GAP && Math.hypot(x0 - ax, y0 - ay) <= JOIN_R * 10) { z = e; if (holeAt == null) holeAt = h; }
      else { flush(); a = k; z = e; ax = x0; ay = y0; holeAt = h; }
      k = e + 1;
    }
    flush();
  }
  return out;
}

// The events standstillEvents(cars, t) would give, from those of the whole recording (a replay's samples don't change):
// the ones begun by t, cut at the last sample by t – still standing there as far as t shows (open), and without a hole
// or end not seen by then. The same result, without going over every sample up to t again.
export function eventsUpTo(all, cars, t) {
  const out = [];
  for (const e of all) {
    if (e.t0 > t) continue;
    let f;
    if (e.t1 <= t) {
      f = { ...e };
      if (e.nextT == null || e.nextT > t) { f.open = true; f.holeAfter = false; }
    } else {
      const T = cars[e.num].t;
      let lo = e.a, hi = e.z;   // the last sample of a..z at or before t
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= t) lo = m; else hi = m - 1; }
      if (T[lo] - e.t0 < STOP_MIN) continue;
      f = { ...e, z: lo, t1: T[lo], open: true, holeAfter: false, nextT: null };
    }
    f.holeAt = e.holeAt != null && e.holeAt <= f.t1 ? e.holeAt : null; f.hole = f.holeAt != null;
    out.push(f);
  }
  return out;
}
// (a replay's whole-recording events, per positions object)
const wholeEvents = new WeakMap();

// How long an event was seen standing: its whole length – or, for one joined from looks with time unseen in between
// (obs: the stretches seen), the longest stretch seen (the time between isn't known to be standing).
export const seenOf = (e) => (e.obs ? Math.max(...e.obs.map(([a, b]) => b - a)) : e.t1 - e.t0);
// What an event counts as: "stop" (a pit stop: 1.5–8 s, finished, its start and end seen, within 60 s of entering the
// pit lane when that's known), "long" (20 s or more seen standing: a garage stay – also while still going on),
// "uncertain" (it could be a stop but the data doesn't say how long; also one joined across time unseen, unless one
// stretch seen is a long stay by itself), else "other".
export function kindOf(e) {
  if (!e.inLane) return "other";
  const dur = seenOf(e);
  if (e.hole) return "uncertain";
  if (dur >= LONG) return "long";
  if (e.obs) return "uncertain";
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
    if (k === "stop" || k === "long") o[k === "stop" ? "stops" : "long"].push({ u: e.u, t: e.t0, dur: seenOf(e), off: e.off, id: e.id });
  }
  for (const [num, o] of Object.entries(out)) if (!o.stops.length && !o.long.length) delete out[num];
  return out;
}
const idOf = (e) => `${e.num}@${Math.round(e.t0)}`;

// Standstills of every car in front of the garages. cars: as standstillEvents; toScene([X, Y] metres) → [x, z];
// project(x, z) → { u, off } for the pit building; span: its garages' first and last u. Returns
// { num: { stops: [{ u, t, dur, off, id }], long: [...], events } } (t: when the standstill began).
export function standstills(cars, toScene, project, span, pitIn = null, upTo = Infinity) {
  // (a recording – samples that never grow, as a replay's – is gone over once; a live window every time)
  const fixed = cars && Object.values(cars).every((c) => !c.grow);
  let ev;
  if (fixed && upTo < Infinity) {
    let all = wholeEvents.get(cars);
    if (!all) wholeEvents.set(cars, (all = standstillEvents(cars)));
    ev = eventsUpTo(all, cars, upTo);
  } else ev = standstillEvents(cars, upTo);
  const frame = { toScene, project, span };
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
// (also when the looks didn't meet – the 3D view was closed in between, the feed dropped – but one ended still standing
// there and the later one began with the car already standing there: nothing says it left – nor that it stayed, so
// the time between isn't counted as standing: the event keeps the stretches seen, obs, and is classified by those)
function sameEvent(a, b) {
  if (a.num !== b.num || Math.abs(a.X - b.X) > 20 || Math.abs(a.Y - b.Y) > 20) return false;
  if (a.t0 <= b.t1 + HOLE && b.t0 <= a.t1 + HOLE) return true;
  const [p, n] = a.t0 <= b.t0 ? [a, b] : [b, a];
  return p.open && !n.startKnown;
}
// (the stretches seen of both, those that meet – within 2 s – as one)
function seenStretches(a, b) {
  const all = [...(a.obs || [[a.t0, a.t1]]), ...(b.obs || [[b.t0, b.t1]])].sort((x, y) => x[0] - y[0]), out = [];
  for (const [s, e] of all) { const p = out[out.length - 1]; if (p && s <= p[1] + HOLE) p[1] = Math.max(p[1], e); else out.push([s, e]); }
  return out;
}
function joinEvent(a, b) {
  const first = a.t0 <= b.t0 ? a : b, last = a.t1 >= b.t1 ? a : b, obs = seenStretches(a, b);
  const j = { ...a, t0: first.t0, startKnown: first.startKnown, afterEntry: first.afterEntry, id: first.id, X: first.X, Y: first.Y, u: first.u, off: first.off, inLane: first.inLane,
    t1: last.t1, open: last.open, holeAfter: last.holeAfter, hole: a.hole || b.hole };
  if (obs.length > 1) j.obs = obs; else delete j.obs;
  return j;
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
// (a working stop: 1.8–6 s – what a box is found from)
const working = (x) => x.dur == null || (x.dur >= 1800 && x.dur <= 6000);
export function teamEvidence(still, drivers, pitch = 8) {
  const teams = new Map(), team = (num) => drivers?.[num]?.TeamName;
  for (const [num, s] of Object.entries(still)) {
    const t = team(num); if (!t) continue;
    if (!teams.has(t)) teams.set(t, { team: t, stops: [], long: {} });
    const e = teams.get(t);
    e.stops.push(...s.stops.filter(working).map((x) => ({ ...x, num })));
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
//   stood on no longer counting as such (seen again, a "stop" was a long stay: a box stands on working stops, a garage
//   on long stays), its drivers in another team now (the list corrected), the team no longer in the session – unless
//   what's left still puts the team's place there (trusted, within a garage of it: kept, standing on that now); a new
//   session starts over (reset).
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
      // (what each kind of place stands on: a box on working stops, a garage on long stays)
      const valid = { box: new Set(), garage: new Set() };
      for (const s of Object.values(this.still)) { for (const x of s.stops) if (working(x)) valid.box.add(x.id); for (const x of s.long) valid.garage.add(x.id); }
      const byTeam = new Map(ev.map((e) => [e.team, e]));
      for (const [team, cur] of [...this.places]) {
        const e = byTeam.get(team), ok = valid[cur.from] || valid.box;
        const gone = !list.some(([, d]) => d?.TeamName === team);
        const corrected = (cur.support || []).some((id) => !ok.has(id)) || (cur.drivers || []).some((num) => drivers[num]?.TeamName !== team);
        const holds = e?.ok && e.from === cur.from && Math.abs(e.u - cur.u) <= pitch;
        if (gone || e?.conflict || (corrected && !holds)) this.places.delete(team);
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
// A driver's board: the car's number and the surname as the session's driver list gives them (Latin letters, up to 11 –
// else the three-letter code), e.g. "4  NORRIS"
export const boardLabel = (num, d) => { const n = d?.RacingNumber || num, ln = String(d?.LastName || "").toUpperCase(); return `${n}  ${/^[A-Z' .-]{2,11}$/.test(ln) ? ln : d?.Tla || n}`; };
const Q = 0.5, q = (v) => (v == null ? null : Math.round(v / Q) * Q);
export function allocatePlaces(slots, pitch, drivers, places, overrides = []) {
  const members = (team) => Object.entries(drivers || {}).filter(([, d]) => d?.TeamName === team).map(([num, d]) => ({ num, tla: d.Tla || num, label: boardLabel(num, d) }));
  const colourOf = (team) => { const d0 = Object.values(drivers || {}).find((d) => d?.TeamName === team); return /^[0-9a-f]{6}$/i.test(d0?.TeamColour || "") ? "#" + d0.TeamColour : "#9aa0a6"; };
  const fixed = new Map((overrides || []).filter((o) => o?.team && o.slots?.length).map((o) => [o.team, o]));
  const list = places.filter((p) => p.ok && !fixed.has(p.team)).map((p) => {
    const ds = members(p.team).map((m) => ({ ...m, u: q(p.from === "garage" && p.own?.[m.num] ? p.own[m.num].u : p.u), from: p.from }));
    return { team: p.team, colour: colourOf(p.team), centre: q(p.u), box: p.from === "box" ? q(p.u) : null, boxOff: p.from === "box" ? q(p.off ?? 6) : null, from: p.from, link: p.published ? "order" : p.from === "box" ? "inferred" : "own", estimated: true, drivers: ds };
  }).sort((a, b) => a.centre - b.centre);
  const used = new Set(), bySlot = new Map(slots.map((s) => [s.k, s]));
  for (const o of fixed.values()) {
    const ss = o.slots.filter((k) => bySlot.has(k)); ss.forEach((k) => used.add(k));
    const uc = ss.length ? ss.reduce((a, k) => a + bySlot.get(k).uc, 0) / ss.length : 0;
    // (the garages are the drawing's; the box in the lane is still where the cars stop – the session's stops or the
    // order's measured box –, and a driver seen working in their own garage keeps it)
    // (a box known only from the order – another season's measured boxes, or between them – is put in front of the
    // drawing's garages: the drawings put each team's box there; a box seen in the session's own stops stays where it was)
    const p = places.find((x) => x.ok && x.team === o.team), boxU = p?.from !== "box" ? null : p.published && ss.length ? uc : p.u;
    list.push({ team: o.team, colour: colourOf(o.team), centre: uc, box: boxU == null ? null : q(boxU), boxOff: p?.from === "box" ? q(p.off ?? 6) : null, from: "confirmed", link: "confirmed", estimated: false, source: o.source || null, slots: ss,
      drivers: members(o.team).map((m) => (p?.from === "garage" && p.own?.[m.num] ? { ...m, u: q(p.own[m.num].u), from: "garage" } : { ...m, u: q(uc), from: "confirmed" })) });
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
    t.spaces = workSpaces(t.slots.map((k) => bySlot.get(k)).filter(Boolean), t.drivers);
    for (const d of t.drivers) { const w = t.spaces.find((x) => x.num === d.num); d.slot = w ? w.slot : null; d.w = w ? w.w : 0; }
  }
  return list.filter((t) => t.slots.length).sort((a, b) => a.centre - b.centre);
}

// Each driver's own car work space in the team's garages – exactly one each, never two drivers in one (v0.37: at a race
// both drivers' boards went on the garage nearest the shared box, and every outer garage looked like a car's). The
// building's bays, the team's area, a driver's work space and the team's pit box are different things: the bays are the
// building's (never cut to the number of drivers – the Silverstone Wing keeps its 41), the area is the team's estimated
// share of them, and a work space is where one car is worked on – a whole bay, or half of one where the team has fewer
// bays than drivers (Monaco's narrow garages). The pit box in the lane stays one per team.
//   slots: the team's bays (sorted along the garages, { k, uc, width }); drivers: [{ num, u (where seen working, or the
//   shared box), from }]. Who works in which space isn't in the data: drivers seen in their own garage (practice,
//   qualifying: from "garage") get the nearest free space; otherwise – a race's shared box – the spaces go to the drivers
//   in their racing numbers' order from one end of the area to the other (stable: positions never move them), the outer
//   bays first (the cars' garages; any bays between are engineering and spares, unnamed). → [{ num, slot, w (m along
//   the bay from its centre), est: true }]
export function workSpaces(slots, drivers) {
  const ss = [...slots].sort((a, b) => a.uc - b.uc), n = drivers.length;
  if (!ss.length || !n) return [];
  // the spaces: whole bays (any of them, for a driver seen in their own; the outer ones first for the rest), or – fewer
  // bays than drivers – bays split in two
  let spaces;
  if (ss.length >= n) { const order = []; for (let i = 0, j = ss.length - 1; i <= j; i++, j--) { order.push(ss[i]); if (j !== i) order.push(ss[j]); } spaces = order.map((s, rank) => ({ slot: s.k, uc: s.uc, w: 0, rank })); }
  else { const per = Math.ceil(n / ss.length); spaces = []; for (const s of ss) for (let i = 0; i < per; i++) spaces.push({ slot: s.k, uc: s.uc + (i - (per - 1) / 2) * (s.width / per), w: (i - (per - 1) / 2) * (s.width / per), rank: spaces.length }); }
  const out = [], taken = new Set(), placed = new Set();
  const byNum = (a, b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true });
  // (seen in their own garage: the nearest pairs first)
  const pairs = []; for (const d of drivers) if (d.from === "garage" && Number.isFinite(d.u)) spaces.forEach((sp, i) => pairs.push([Math.abs(sp.uc - d.u), d, i]));
  pairs.sort((a, b) => a[0] - b[0] || byNum(a[1], b[1]));
  for (const [, d, i] of pairs) { if (placed.has(d.num) || taken.has(i)) continue; placed.add(d.num); taken.add(i); out.push({ num: d.num, slot: spaces[i].slot, w: spaces[i].w, est: true }); }
  // (the rest – a shared box, no own place seen: by racing number, outer bays first, then along the area)
  const rest = drivers.filter((d) => !placed.has(d.num)).sort(byNum);
  const left = spaces.map((sp, i) => i).filter((i) => !taken.has(i)).sort((a, b) => spaces[a].rank - spaces[b].rank).slice(0, rest.length).sort((a, b) => spaces[a].uc - spaces[b].uc);
  rest.forEach((d, i) => { const sp = spaces[left[i]]; if (sp) out.push({ num: d.num, slot: sp.slot, w: sp.w, est: true }); });
  return out;
}

// A driver's board across their work space: 1.76 m at most, 0.42 of the bay, and – a bay shared by `parts` drivers – 0.9 of
// their own part (v0.38: three in one 5 m bay had 1.67 m apart and 1.76 m boards, overlapping)
// v0.39: on the bay's header across the opening – 3.6 m at most (0.45 m high at the atlas row's 8:1), 0.8 of the bay
export const boardWidth = (bayWidth, parts = 1) => Math.min(3.6, bayWidth * 0.8, (bayWidth / Math.max(1, parts)) * 0.9);

// Confirmed garage allocations, kept apart from the inference: where a session's real allocation is published (the
// FIA's or a team's garage plan), it's recorded here with its source and drawn as given (link: "confirmed"), never
// estimated from stops. None is recorded yet: every allocation drawn is an estimate.
//   { facility: "silverstone-wing", year: 2026, session: "<path>" | null (the whole event), source, teams: [{ team, slots: [k] }] }
export const GARAGE_OVERRIDES = [];
// The garages the FIA's drawing gives each team of the session (the pit building's bays carry the drawing's owners –
// facilities.js / garageplans.js): [{ team (the session's name), slots: [k], source }]. A garage split between two teams
// is neither's here (it stays neutral: which half is whose isn't drawn); a team the drawing doesn't name gets nothing.
export function planOverrides(G, drivers) {
  if (!G?.plan || !G.slots.some((s) => s.bay)) return [];
  const names = [...new Set(Object.values(drivers || {}).map((d) => d?.TeamName).filter(Boolean))], out = [];
  for (const team of names) {
    const k = teamKey(team), alt = k === "Audi" ? "Kick Sauber" : k === "Kick Sauber" ? "Audi" : null;
    const own = (b) => b?.teams?.length === 1 && b.owners.length === 1 && (teamKey(b.teams[0]) === k || (alt && teamKey(b.teams[0]) === alt && !names.some((n) => teamKey(n) === alt)));
    const slots = G.slots.filter((s) => own(s.bay)).map((s) => s.k);
    if (slots.length) out.push({ team, slots, source: G.plan.src || "FIA pit lane drawing" });
  }
  return out;
}
export const overridesFor = (facility, year, session = null, list = GARAGE_OVERRIDES) =>
  list.filter((o) => o.facility === facility && o.year === year && (!o.session || o.session === session)).flatMap((o) => o.teams.map((t) => ({ ...t, source: o.source })));

// ---------- the zones (v0.49) ----------
// The garages as spaces, apart from how they're drawn – what a car, a crew or the interior kit is placed by. Four
// different things, never forced into one another: the building's physical bays (G.slots – the FIA drawing's, never cut to
// the number of drivers), a driver's car work space (workSpaces: a whole bay, or half of one at a narrow garage), the
// team's engineering bays (its other bays: nobody's car), and the team's ONE pit box in the lane, which both its drivers
// share. A team with two drivers doesn't get two doors: a work space is wherever workSpaces put it.
//   G: facilities.js garages ({ slots: [{ k, front, along, inward, width, height, ceil, depth, back, floor, depthFrom, … }] });
//   teams: allocatePlaces' result (or null: the bays alone, kind "bay"). Every zone in its bay's frame: front (the
//   opening's middle at the floor), along (+ to the pit exit), inward (+ into the garage), metres.
// → [{ team (null: no team's), kind: "car" | "eng" | "bay" | "box", slot (bay k; null for the box), num (the driver of a
//   car space), est (who works where is estimated – workSpaces), centre: [x, z] (the zone's middle on the floor), along,
//   inward, w (its middle, m along from the bay's), width (of the zone), depth (the race bay's – built), back (the back
//   area behind the partition, not built), doorW, doorH (the opening between the pillars, under the lintel), ceilingH,
//   floorY, lowest (the lowest fixed thing over the race bay's floor beyond the door line: the boom's beam – its lines
//   hang to the car by design), walk: [m clear beside the car, either side] | null, depthFrom ("map footprint" |
//   "made-up outline" | "facility"), carSpot: { x, z, y, yaw, d, fits, why } | null (car spaces only: where its car
//   stands – garagespace.js carSpotDepth, facing out of the garage), box: { u, off } (kind "box": along the garages, out
//   from their front) }]
// Stable for the interior kit (feat/v0.49-kit): fields are only ever added.
export function garageZones(G, teams = null, E = CAR_ENVELOPE) {
  if (!G?.slots?.length) return [];
  const out = [], owner = new Map();
  for (const t of teams || []) for (const k of t.slots || []) owner.set(k, t);
  const P = (s, d, w) => [s.front[0] + s.inward[0] * d + s.along[0] * w, s.front[1] + s.inward[1] * d + s.along[1] * w];
  const yawOut = (s) => Math.atan2(-s.inward[0], -s.inward[1]);
  const base = (s, t, kind, w, width) => ({ team: t?.team ?? null, kind, slot: s.k, num: null, est: !!t?.estimated || kind === "car", centre: P(s, s.depth / 2, w), along: [...s.along], inward: [...s.inward], w, width,
    depth: s.depth, back: s.back ?? 0, doorW: s.width, doorH: s.height, ceilingH: s.ceil, floorY: s.floor, lowest: +(s.ceil - 0.55 - 0.07).toFixed(2), walk: null, depthFrom: s.depthFrom || null, carSpot: null });
  for (const s of G.slots) {
    const t = owner.get(s.k), spaces = (t?.spaces || []).filter((x) => x.slot === s.k);
    if (!t) { out.push(base(s, null, "bay", 0, s.width)); continue; }
    if (!spaces.length) { out.push(base(s, t, "eng", 0, s.width)); continue; }
    const part = s.width / spaces.length;
    for (const sp of spaces) {
      const z = base(s, t, "car", sp.w || 0, part); z.num = sp.num;
      const cs = carSpotDepth(s.depth, E), side = (part - E.width) / 2;
      const [x, zz] = P(s, cs.d, z.w);
      // (too narrow for the car between its walls – a split bay – is no fit either)
      const fits = cs.fits && side >= 0.1;
      z.walk = [+side.toFixed(2), +side.toFixed(2)];
      z.carSpot = { x, z: zz, y: s.floor + 0.017, yaw: yawOut(s), d: +cs.d.toFixed(3), fits, why: fits ? cs.why : side < 0.1 ? `work space ${part.toFixed(2)} m wide for a ${E.width} m car` : cs.why };
      out.push(z);
    }
  }
  for (const t of teams || []) {
    if (t.box == null) continue;
    const s = G.slots.reduce((p, q) => (Math.abs(q.uc - t.box) < Math.abs(p.uc - t.box) ? q : p));
    const off = t.boxOff ?? 6, w = t.box - s.uc, c = P(s, -off, w);
    out.push({ ...base(s, t, "box", w, 2.3), slot: null, centre: c, depth: 5.6, back: 0, doorW: null, doorH: null, ceilingH: null, lowest: null, depthFrom: null, est: t.link !== "confirmed" && t.from !== "box", box: { u: t.box, off } });
  }
  return out;
}

// ---------- the layer ----------
// Shared geometry for the equipment (made once; never freed with a layer)
// a small deterministic random sequence from a string (the same garage gets the same things)
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = (seed) => { let a = seed | 0 || 1; return () => ((a = Math.imul(a ^ (a >>> 15), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909), (a >>>= 0) / 4294967296)); };
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
  // a workbench (top and legs' box) and an engineers' desk with two screens on a stand
  const bench = merge([Object.assign(new THREE.BoxGeometry(1.8, 0.06, 0.7)).translate(0, 0.92, 0), new THREE.BoxGeometry(1.7, 0.85, 0.6).translate(0, 0.45, 0)]);
  const screens = merge([new THREE.BoxGeometry(1.4, 0.75, 0.7).translate(0, 0.375, 0), new THREE.BoxGeometry(0.62, 0.38, 0.04).translate(-0.33, 1.15, 0.1), new THREE.BoxGeometry(0.62, 0.38, 0.04).translate(0.33, 1.15, 0.1), new THREE.BoxGeometry(0.05, 0.3, 0.05).translate(0, 0.9, 0.1)]);
  // (v0.39) the car's overhead boom: a beam out from the back wall (+z: towards the opening) with its coiled lines
  // hanging from the far end; a tyre trolley (deck on castors, a handle); a wheel gun in its wall bracket; a screen
  const cyl = (r, h, x, y, z) => { const c = new THREE.CylinderGeometry(r, r, h, 6, 1); c.translate(x, y, z); return c; };
  const boom = merge([new THREE.BoxGeometry(0.14, 0.14, 4.2).translate(0, 0, 2.1), new THREE.BoxGeometry(0.5, 0.3, 0.12).translate(0, 0, 0.06),
    cyl(0.035, 2.2, -0.12, -1.1, 3.6), cyl(0.035, 2.0, 0.1, -1.0, 4.0), cyl(0.05, 0.5, 0, -0.25, 4.15), cyl(0.025, 1.6, 0.18, -0.8, 2.6)]);
  const trolley = merge([new THREE.BoxGeometry(0.82, 0.06, 0.82).translate(0, 0.13, 0), ...[[-0.33, -0.33], [0.33, -0.33], [-0.33, 0.33], [0.33, 0.33]].map(([x, z]) => new THREE.BoxGeometry(0.07, 0.1, 0.07).translate(x, 0.05, z)),
    new THREE.BoxGeometry(0.04, 0.9, 0.04).translate(-0.38, 0.6, -0.38), new THREE.BoxGeometry(0.04, 0.9, 0.04).translate(0.38, 0.6, -0.38), new THREE.BoxGeometry(0.8, 0.04, 0.04).translate(0, 1.05, -0.38)]);
  const gun = merge([new THREE.BoxGeometry(0.1, 0.16, 0.32).translate(0, 0, 0), cyl(0.045, 0.16, 0, 0, 0.22).rotateX(Math.PI / 2), new THREE.BoxGeometry(0.05, 0.16, 0.06).translate(0, -0.14, -0.05), new THREE.BoxGeometry(0.3, 0.04, 0.1).translate(0, 0.12, -0.12)]);
  const monitor = merge([new THREE.BoxGeometry(1.0, 0.6, 0.05)]);
  SHARED = { boom: mark(boom), trolley: mark(trolley), gun: mark(gun), monitor: mark(monitor), tyres: mark(tyres), blankets: mark(blankets), cabinet: mark(cabinet), jack: mark(jack), sign: mark(sign), bench: mark(bench), screens: mark(screens),
    screen: Object.assign(new THREE.MeshStandardMaterial({ color: "#15181c", roughness: 0.3, metalness: 0.2 }), { userData: { shared: true } }),
    rubber: Object.assign(new THREE.MeshStandardMaterial({ color: "#1a1b1d", roughness: 0.85 }), { userData: { shared: true } }),
    grey: Object.assign(new THREE.MeshStandardMaterial({ color: "#7a8086", roughness: 0.5, metalness: 0.4 }), { userData: { shared: true } }) };
  return SHARED;
}

// (which way they face: the track in front, the garages behind – mclaren.com 2026, above)
// Seats on a team's pit wall stand, where a source gives them: { team, seasons: [from, to], seats, enclosed, src }.
// Otherwise the usual estimate – the stands seat 3 to 8 in one row (the sources found: Haas 3 in 2023–24, 6 in 2025;
// Ferrari 7 in 2020 – too old to stand for today's) – 6, drawn the same for every team without a source (said so).
export const PIT_WALL_SEATS = [
  { team: /mclaren/i, seasons: [2026, 2026], seats: 7, enclosed: false, src: "McLaren, \"Who sits on McLaren's pit wall\" (mclaren.com, 2026): seven seats, a window over the track at each, the garages behind" },
  { team: /haas/i, seasons: [2025, 2025], seats: 6, enclosed: true, src: "Haas F1 Team 2025 (pit wall back to six seats; an enclosure against the weather) – team/press articles, 2025" },
  { team: /haas/i, seasons: [2023, 2024], seats: 3, enclosed: true, src: "Haas F1 Team 2023–24 three-seat stand (400 kg less freight) – team/press articles" },
];
export function pitWallSeats(team, season, list = PIT_WALL_SEATS) {
  const r = list.find((x) => x.team.test(team || "") && season != null && season >= x.seasons[0] && season <= x.seasons[1]);
  return r ? { seats: r.seats, enclosed: !!r.enclosed, from: r.src } : { seats: 6, enclosed: false, from: "estimate: the usual 3–8 seats, no source for this team and season" };
}
// The pit wall screens: one picture for all of them – the session's public timing as this app shows it (positions,
// drivers, gaps; painted by map3d.js paintPitScreens), never a team's own data. Shared; never freed with a layer.
let SCREEN = null;
export function pitScreenTexture() {
  if (SCREEN) return SCREEN.tex;
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 168;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.userData.shared = true;
  SCREEN = { cv, tex, key: "" }; paintPitScreens([], null);
  return tex;
}
// rows: [[position, code, gap text, team colour]] (the first 10), lap: "LAP 23/66" or null
export function paintPitScreens(rows, lap) {
  if (!SCREEN) return;
  const key = JSON.stringify([rows, lap]); if (key === SCREEN.key) return; SCREEN.key = key;
  const g = SCREEN.cv.getContext("2d"), W = 256, H = 168;
  g.fillStyle = "#0b0e13"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#1c2430"; g.fillRect(0, 0, W, 20);
  g.fillStyle = "#e8edf3"; g.font = "700 13px Arial, sans-serif"; g.textBaseline = "middle"; g.fillText(lap || "TIMING", 8, 10);
  rows.slice(0, 10).forEach(([pos, code, gap, colour], i) => {
    const y = 26 + i * 14;
    g.fillStyle = i % 2 ? "#121820" : "#0f141b"; g.fillRect(0, y - 1, W, 14);
    g.fillStyle = colour || "#888"; g.fillRect(28, y + 1, 3, 10);
    g.fillStyle = "#cfd6dd"; g.font = "600 11px Arial, sans-serif"; g.fillText(String(pos), 8, y + 6); g.fillText(code || "", 36, y + 6);
    g.textAlign = "right"; g.fillText(gap || "", W - 8, y + 6); g.textAlign = "left";
  });
  SCREEN.tex.needsUpdate = true;
}

// A team's garage lining (v0.39): a light or dark base, its colour as a band – low, high, the middle of the wall or as
// upright stripes – and the panels' joints at a spacing of its own, so no two teams' garages are one copy recoloured.
// Mercedes: dark (photos – Commons: Mercedes garage, Austrian GP 2018; British GP 2021: black walls, coloured light strips).
// The others: chosen from the team's name (the same every time) – an estimate; no source per team and season was found.
const STYLE_BASES = ["#e4e6e8", "#c7cbcf", "#8d939a", "#26292d"], STYLE_BANDS = ["low", "high", "split", "stripes"];
export function garageStyle(team) {
  const k = teamKey(team) || String(team || ""), h = hashStr(k);
  if (k === "Mercedes") return { base: "#1b1d20", dark: true, band: "high", seams: 1.2, from: "photo (2018, 2021)" };
  const bi = h % STYLE_BASES.length;
  return { base: STYLE_BASES[bi], dark: bi === 3, band: STYLE_BANDS[(h >>> 4) % STYLE_BANDS.length], seams: [0.9, 1.2, 1.5][(h >>> 8) % 3], from: "estimate" };
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

// A team's stand upstairs (Monaco – facilities.js wallAt with `room`: the first-floor room over the garages, glazed to
// the lane): no deck, posts, canopy, railings or step of its own – it stands on the room's floor, the console along the
// glazing (its lane face 0.14 m behind the glass), the screens on it, the stools behind it, the people on them facing the
// lane through the glass; the team's name on the balcony's railing over the room (as on the photos' banners). In the
// stand's frame: a along it, o from wallAt's point (0.05 m inside the glass) into the room, y over the room's floor.
// Pure (node-tested: test/monaco53.test.js – inside the room, on its floor, under its ceiling).
export function upperStandLayout(room, L, N) {
  const seats = [];
  for (let i = 0; i < N; i++) seats.push({ a: -L / 2 + 0.3 + 0.8 * (i + 0.5), o: 1.1 });
  return {
    console: { o: 0.3, depth: 0.42, h: 1.04, front: 0.53 },   // (its top 0.04 thick over it: 1.08 m – as the wall's stands)
    screens: { o: 0.2, y: 1.36 }, seats, stool: { o: 1.1, foot: 0.94 },
    label: { o: -(room.balcony + 0.03), y: room.balconyY + 0.55, h: 0.6 },
    // (what it takes up: from the glass to behind the stools, and its top – the screens')
    span: [-room.glass, 1.1 + 0.25], top: 1.36 + 0.135,
  };
}

// The layer for one allocation: returns a THREE.Group owning its geometry, materials and label texture.
// opts.kit (v0.49): the garage interior kit (garagekit/pitkit.js) furnishes the team bays – this layer then leaves out its
// own simple equipment and booms (both would draw); its lining, floors, ceiling strips, boards and pit wall stay.
export function teamLayer(garages, teams, drivers, season = null, opts = {}) {
  const S = shared(), group = new THREE.Group(); group.name = "pitTeams";
  group.userData.covers = [];   // (the pit wall stands' canopies: no rain under them – weather3d.js)
  group.userData.wallStands = [];   // (each team's stand as built: standcheck.js)
  group.userData.standSpans = [];   // (along the garages, each stand with its step: the walkway's railing opens there – facilities.js openRail)
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
  // A team's stand on the pit wall (wall: facilities.js wallAt – the walkway's centre opposite its box, `out` towards the
  // pit lane): a raised deck, a console along the debris fence with the screens on it, a stool per seat, the team's
  // people seated on them facing the track (their backs to the pit lane), a canopy on four posts with the team's name on
  // its front, railings at the ends and a step up at one. Its size from its seats (PIT_WALL_SEATS: what a source says
  // for that team and season, else the usual estimate) – each 0.8 m along the console.
  const boxQ = (store, c, A, U, O, la, lu, lo, colour, faces = 63) => {
    const n = [O.clone().negate(), O, A.clone().negate(), A, U, U.clone().negate()];
    const ctr = [c.clone().addScaledVector(O, -lo / 2), c.clone().addScaledVector(O, lo / 2), c.clone().addScaledVector(A, -la / 2), c.clone().addScaledVector(A, la / 2), c.clone().addScaledVector(U, lu / 2), c.clone().addScaledVector(U, -lu / 2)];
    const ax = [[A, la, U, lu], [A, la, U, lu], [O, lo, U, lu], [O, lo, U, lu], [A, la, O, lo], [A, la, O, lo]];
    for (let f = 0; f < 6; f++) if (faces & (1 << f)) quad(store, ctr[f], ax[f][0].clone().multiplyScalar(ax[f][1]), ax[f][2].clone().multiplyScalar(ax[f][3]), n[f], null, colour);
  };
  const people = [], screenQuads = { pos: [], uv: [], nor: [] }, teamQuads = new Map();
  // (upstairs – upperStandLayout: the same console, screens, stools and people, in the room)
  const roomStand = (w, t, seat, N, L, { p, A, O, up, at, team, dark, steel, black }) => {
    const S = upperStandLayout(w.room, L, N), c = S.console;
    boxQ(panels, at(0, c.o, c.h / 2), A, up, O, L - 0.2, c.h, c.depth, dark);                            // the console
    boxQ(panels, at(0, c.front, c.h / 2), A, up, O, L - 0.2, 0.9, 0.02, team, 2);                        // its face to the seats in the team's colour
    boxQ(panels, at(0, c.o, c.h + 0.02), A, up, O, L - 0.1, 0.04, 0.5, black, 16);                       // its top
    const tq = teamQuads.get(t.team) || { pos: [], uv: [], nor: [], t }; teamQuads.set(t.team, tq);
    const two = (t.drivers || []).length > 1;
    for (let i = 0; i < N; i++) for (const k of [-1, 1]) {
      const a = S.seats[i].a + k * 0.2, sc = at(a, S.screens.o, S.screens.y);
      boxQ(panels, sc, A, up, O, 0.4, 0.27, 0.035, black, 63);
      const half = two && i % 2 ? [0.5, 0, 1, 1] : [0, 0, 0.5, 1];
      quad(k < 0 ? screenQuads : tq, sc.clone().addScaledVector(O, 0.019), A.clone().multiplyScalar(0.37), up.clone().multiplyScalar(0.24), O, k < 0 ? [0, 0, 1, 1] : half);
    }
    const f = O.clone().negate(), yaw = Math.atan2(f.x, f.z) - Math.PI / 2;
    for (let i = 0; i < N; i++) {
      const { a, o } = S.seats[i];
      boxQ(panels, at(a, o, 0.37), A, up, O, 0.05, 0.74, 0.05, steel);
      boxQ(panels, at(a, o, 0.745), A, up, O, 0.38, 0.05, 0.36, black);
      boxQ(panels, at(a, S.stool.foot, 0.3), A, up, O, 0.34, 0.025, 0.03, steel);
      const q = at(a, o, 0), sd = hashStr(t.team + i), lean = i % 3 === 1, hz = (sd % 5) * 0.012;
      people.push({ x: q.x, y: q.y, z: q.z, yaw, shirt: t.colour, pose: lean ? "sitLean" : "sit", seed: sd, hands: [[0.6, 1.11, 0.21 + hz, 1, 0, 0, 1], [lean ? 0.68 : 0.6, 1.11, -0.2 - hz, 1, 0, 0, 1]] });
    }
    // the team's banner on the balcony's railing over the room, facing the lane
    const lb = S.label, bw = Math.min(L, 3.6);
    boxQ(panels, at(0, lb.o + 0.012, lb.y), A, up, O, L + 0.3, lb.h, 0.02, team, 3);
    quad(labels, at(0, lb.o, lb.y), A.clone().multiplyScalar(bw), up.clone().multiplyScalar(bw / 8), f, lab.uv(t.row));
    // (no rain in the room – weather.js coverRaster: its floor plan from the glass in, under its ceiling)
    { const cv = (da, o) => { const v = at(da, o, 0); return [v.x, v.z]; }, h = L / 2 + 0.2; group.userData.covers.push({ pts: [cv(-h, -w.room.glass), cv(h, -w.room.glass), cv(h, S.span[1]), cv(-h, S.span[1])], y: p.y + w.room.ceil, kind: "pit wall room" }); }
    t.wallStand = { seats: N, from: seat.from };
    group.userData.wallStands.push({ team: t.team, box: t.box, boxOff: t.boxOff, p: [p.x, p.z], y: p.y, along: [...w.along], out: [...w.out], L, enclosed: true, upper: true, room: { ...w.room }, span: S.span, top: S.top, people: S.seats.map(({ a, o }) => { const v = at(a, o, 0); return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; }) });
  };
  const pitWallStand = (w, t, season) => {
    const seat = pitWallSeats(t.team, season), N = seat.seats, up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3(...w.p), A = new THREE.Vector3(w.along[0], 0, w.along[1]), O = new THREE.Vector3(w.out[0], 0, w.out[1]);
    const L = N * 0.8 + 0.6, team = new THREE.Color(t.colour), dark = team.clone().multiplyScalar(0.3).lerp(new THREE.Color("#1d2024"), 0.5), steel = new THREE.Color("#8d949b"), black = new THREE.Color("#15171a");
    const at = (a, o, y) => p.clone().addScaledVector(A, a).addScaledVector(O, o).addScaledVector(up, y);
    if (w.room) { roomStand(w, t, seat, N, L, { p, A, O, up, at, team, dark, steel, black }); return; }
    const deck = 0.22;
    boxQ(panels, at(0, 0.05, deck / 2), A, up, O, L, deck, 1.6, dark);                                   // the deck
    boxQ(panels, at(0, -0.52, deck + 0.52), A, up, O, L - 0.2, 1.04, 0.42, dark);                        // the console
    boxQ(panels, at(0, -0.3, deck + 0.52), A, up, O, L - 0.2, 0.9, 0.02, team, 2);                      // its front in the team's colour
    boxQ(panels, at(0, -0.52, deck + 1.06), A, up, O, L - 0.1, 0.04, 0.5, black, 16);                    // its top
    // screens: two to a seat, side by side on the console, tilted back a little, facing the seats (+O) – the left one the
    // session's timing (shared), the right one the team's own panel for one of its drivers (seats alternate A, B)
    const tq = teamQuads.get(t.team) || { pos: [], uv: [], nor: [], t }; teamQuads.set(t.team, tq);
    const two = (t.drivers || []).length > 1;
    for (let i = 0; i < N; i++) for (const k of [-1, 1]) {
      const a = -L / 2 + 0.3 + 0.8 * (i + 0.5) + k * 0.2, c = at(a, -0.62, deck + 1.36);
      boxQ(panels, c, A, up, O, 0.4, 0.27, 0.035, black, 63);
      const half = two && i % 2 ? [0.5, 0, 1, 1] : [0, 0, 0.5, 1];
      quad(k < 0 ? screenQuads : tq, c.clone().addScaledVector(O, 0.019), A.clone().multiplyScalar(0.37), up.clone().multiplyScalar(0.24), O, k < 0 ? [0, 0, 1, 1] : half);
    }
    // stools and the people on them (their seat's height the sit pose's hips over the deck)
    for (let i = 0; i < N; i++) {
      const a = -L / 2 + 0.3 + 0.8 * (i + 0.5);
      // (high stools with a footrest – the console stands at a bar's height, 1.08 m: seated at it, the elbows come to the
      // desk; the seat ~0.77 m – an estimate from photos of team pit walls, M)
      boxQ(panels, at(a, 0.28, deck + 0.37), A, up, O, 0.05, 0.74, 0.05, steel);
      boxQ(panels, at(a, 0.28, deck + 0.745), A, up, O, 0.38, 0.05, 0.36, black);
      boxQ(panels, at(a, 0.12, deck + 0.3), A, up, O, 0.34, 0.025, 0.03, steel);
      // (facing the track: the figures' +x along −O; crewAt's convention: yaw = atan2 of the facing, less 90°)
      const f = O.clone().negate(), yaw = Math.atan2(f.x, f.z) - Math.PI / 2;
      // (on the stool – the hips over its middle, the seat height and the feet on the footrest the pose's –, the hands on
      // the console's top near its front edge: 0.55 m ahead, 1.08 m over the deck; the figure's frame: x ahead, z to its
      // right)
      const q = at(a, 0.28, deck), seed = hashStr(t.team + i), lean = i % 3 === 1, hz = (seed % 5) * 0.012;
      people.push({ x: q.x, y: q.y, z: q.z, yaw, shirt: t.colour, pose: lean ? "sitLean" : "sit", seed, hands: [[0.6, 1.11, 0.21 + hz, 1, 0, 0, 1], [lean ? 0.68 : 0.6, 1.11, -0.2 - hz, 1, 0, 0, 1]] });
    }
    // canopy: posts at the corners, the roof in the team's colour, its front fascia carrying the name
    for (const a of [-L / 2 + 0.05, L / 2 - 0.05]) for (const o of [-0.72, 0.82]) boxQ(panels, at(a, o, 1.35), A, up, O, 0.07, 2.7, 0.07, steel);
    boxQ(panels, at(0, 0.1, 2.72), A, up, O, L + 0.3, 0.08, 2.0, team.clone().multiplyScalar(0.8));
    // (where rain can't fall – weather.js coverRaster: the canopy's outline at its underside)
    { const c = (da, dn) => { const v = at(da, 0.1 + dn, 0); return [v.x, v.z]; }, h = (L + 0.3) / 2; group.userData.covers.push({ pts: [c(-h, -1), c(h, -1), c(h, 1), c(-h, 1)], y: p.y + 2.68, kind: "pit wall canopy" }); }
    boxQ(panels, at(0, 1.1, 2.55), A, up, O, L + 0.3, 0.42, 0.04, team, 3);
    quad(labels, at(0, 1.13, 2.55), A.clone().multiplyScalar(Math.min(L, 3.6)), up.clone().multiplyScalar(Math.min(L, 3.6) / 8), O, lab.uv(t.row));
    // railings at both ends, a step up onto the deck at the far end
    for (const a of [-L / 2, L / 2]) { boxQ(panels, at(a, 0.05, deck + 1.0), A, up, O, 0.04, 0.04, 1.6, steel); boxQ(panels, at(a, 0.05, deck + 0.5), A, up, O, 0.04, 0.04, 1.6, steel); }
    boxQ(panels, at(L / 2 + 0.25, 0.4, 0.06), A, up, O, 0.5, 0.12, 0.7, steel);
    // an enclosure against the weather where the team's stand has one (Haas: a source says so)
    if (seat.enclosed) for (const a of [-L / 2 - 0.02, L / 2 + 0.02]) boxQ(panels, at(a, 0.05, deck + 1.5), A, up, O, 0.03, 2.4, 1.7, dark, 12);
    if (!w.upper) { const uc = garages.project(p.x, p.z).u; group.userData.standSpans.push([uc - L / 2 - 0.3, uc + L / 2 + 0.6]); }
    t.wallStand = { seats: N, from: seat.from };
    // (where it stands, as built – map3d.js standCheck measures the neighbours against each other: standcheck.js)
    group.userData.wallStands.push({ team: t.team, box: t.box, boxOff: t.boxOff, p: [p.x, p.z], y: p.y, along: [...w.along], out: [...w.out], L, enclosed: !!seat.enclosed, upper: !!w.upper });
  };
  const inst = { tyres: [], cabinet: [], jack: [], bench: [], screens: [], boom: [], trolley: [], gun: [], monitor: [] }, boards = [];
  const floor = { pos: [], col: [], nor: [] }, lights = { pos: [], nor: [] };
  const col = new THREE.Color();
  for (const t of teams) {
    col.set(t.colour);
    const ss = t.slots.map((k) => bySlot.get(k)).filter(Boolean).sort((a, b) => a.uc - b.uc);
    const st = garageStyle(t.team);
    for (const s of ss) {
      const along = new THREE.Vector3(s.along[0], 0, s.along[1]), up = new THREE.Vector3(0, 1, 0), out = new THREE.Vector3(-s.inward[0], 0, -s.inward[1]);
      const inw = new THREE.Vector3(s.inward[0], 0, s.inward[1]), down = new THREE.Vector3(0, -1, 0);
      // What the garage is for – a depiction (which bay holds what isn't in any drawing): a bay with a driver's work space
      // is that car's, the others the team's engineering and spares (nobody's name on them).
      const space = (t.spaces || []).find((w) => w.slot === s.k), role = space ? "car" : "engineering";
      const r = rng(hashStr(t.team + ":" + s.k)), tc = col.clone();
      // The walls: the team's panelling (garageStyle: a light or dark base, the team's colour as a band – low, high or as
      // upright stripes –, panel joints at the team's spacing), a dark skirting; over the facility's own back wall and
      // kick panels. Lower 2.9 m: teams line their garages to about head height and leave the building above (photos).
      const base = new THREE.Color(st.base), seam = base.clone().multiplyScalar(st.dark ? 1.6 : 0.78), skirt = new THREE.Color(st.dark ? "#0d0f11" : "#3a3f45");
      const H = Math.min(2.9, s.ceil - 0.4), wallQ = (c, ax, n, w2, ye, hgt, colr) => quad(panels, c, ax.clone().multiplyScalar(w2), up.clone().multiplyScalar(hgt), n, null, colr);
      // (the band and stripes stand 1 cm proud of the base, the joints 2 cm: coplanar quads flickered – v0.39 screenshots)
      const lining = (centreAt0, ax, n, len) => {
        const centreAt = (y) => centreAt0(y).addScaledVector(n, 0.01);
        wallQ(centreAt0(H / 2 + 0.15), ax, n, len, 0, H - 0.3, base);
        wallQ(centreAt(0.15), ax, n, len, 0, 0.3, skirt);
        if (st.band === "low") wallQ(centreAt(0.95), ax, n, len, 0, 0.5, col);
        else if (st.band === "high") { wallQ(centreAt(H - 0.25), ax, n, len, 0, 0.5, col); wallQ(centreAt(H - 0.6), ax, n, len, 0, 0.06, col); }
        else if (st.band === "split") wallQ(centreAt(0.3 + (H - 0.3) * 0.3), ax, n, len, 0, (H - 0.3) * 0.6, col);
      };
      // (back wall)
      const back = (y) => at(s, s.depth - 0.035, 0, y);
      lining(back, along, out, s.width - 0.12);
      if (st.band === "stripes") for (const f of [-0.3, 0.3]) quad(panels, at(s, s.depth - 0.05, f * s.width, H / 2 + 0.15), along.clone().multiplyScalar(0.35), up.clone().multiplyScalar(H - 0.3), out, null, col);
      for (let x = -s.width / 2 + st.seams; x < s.width / 2 - 0.2; x += st.seams) quad(panels, at(s, s.depth - 0.055, x, H / 2 + 0.15), along.clone().multiplyScalar(0.025), up.clone().multiplyScalar(H - 0.3), out, null, seam);
      // (side walls, from just inside the opening to the back)
      for (const side of [-1, 1]) {
        const n = along.clone().multiplyScalar(-side), w = side * (s.width / 2 - 0.035), len = s.depth - 0.7;
        lining((y) => at(s, 0.6 + len / 2, w, y), inw, n, len);
        for (let d = 0.6 + st.seams; d < s.depth - 0.2; d += st.seams) quad(panels, at(s, d, w - side * 0.02, H / 2 + 0.15), inw.clone().multiplyScalar(0.025), up.clone().multiplyScalar(H - 0.3), n, null, seam);
      }
      // The floor: sealed epoxy (light grey, a dark one for a dark garage), on a car's bay its work position marked out –
      // a box of lines the size of a car (5.7 × 2.1 m; 2026: 3.4 m wheelbase, 1.9 m wide) with the team's colour along
      // both sides (Mercedes, Austrian GP 2018: a stripe along the bay) – kept clear: the car is the session's own, shown
      // where it is, never a copy parked here.
      const fy = 0.016, floorCol = new THREE.Color(st.dark ? "#3b3f44" : "#c9ccce");
      quad(floor, at(s, s.depth / 2 + 0.1, 0, fy), along.clone().multiplyScalar(s.width - 0.08), inw.clone().multiplyScalar(s.depth - 0.25), up, null, floorCol);
      // (v0.49: centred on where its car stands – garagespace.js carSpotDepth, the car facing out: the box from its nose to
      // its tail with 0.05 m to spare; v0.48 squeezed it to the 4 m bay, 2.4 m long)
      const spot = carSpotDepth(s.depth), carL = CAR_ENVELOPE.length + 0.1, cw = 2.1, cd = spot.d + (CAR_ENVELOPE.back - CAR_ENVELOPE.front) / 2, cx = space ? space.w || 0 : 0;
      const line = (c, ax, ay, colr) => quad(floor, c, ax, ay, up, null, colr), white = new THREE.Color(st.dark ? "#d8dadc" : "#f4f4f2"), yel = new THREE.Color("#e2b100");
      if (role === "car" && spot.fits && s.width / ((t.drivers.filter((d) => d.slot === s.k).length) || 1) >= cw + 0.3) {
        for (const sd of [-1, 1]) line(at(s, cd, cx + sd * cw / 2, fy + 0.008), inw.clone().multiplyScalar(carL), along.clone().multiplyScalar(0.06), white);
        for (const dd of [-1, 1]) line(at(s, cd + dd * carL / 2, cx, fy + 0.008), along.clone().multiplyScalar(cw), inw.clone().multiplyScalar(0.06), white);
        for (const sd of [-1, 1]) line(at(s, cd, cx + sd * (cw / 2 + 0.22), fy + 0.008), inw.clone().multiplyScalar(carL), along.clone().multiplyScalar(0.12), col);
      }
      // (the opening's edge: a yellow line along the front, where the garage meets the pit lane – photos)
      line(at(s, 0.35, 0, fy + 0.008), along.clone().multiplyScalar(s.width - 0.1), inw.clone().multiplyScalar(0.08), yel);
      // The ceiling: the team's dark ceiling panel and lit strips across it (the building's own lights are behind it)
      quad(panels, at(s, s.depth / 2 + 0.4, 0, s.ceil - 0.08), along.clone().multiplyScalar(s.width - 0.1), inw.clone().multiplyScalar(s.depth - 0.9), down, null, new THREE.Color(st.dark ? "#121417" : "#5d636a"));
      for (let d = 1.4; d < s.depth - 0.5; d += 1.8) quad(lights, at(s, d, 0, s.ceil - 0.1), along.clone().multiplyScalar(s.width * 0.7), inw.clone().multiplyScalar(0.12), down, null, null);
      const yaw = yawIn(s), sideRoom = (s.width - (role === "car" ? cw + 0.3 : 0)) / 2;
      if (opts.kit) { /* the kit furnishes this bay */ }
      else if (role === "car") {
        // A car's bay. Overhead: the boom carrying the car's air, power and data lines out over it from the back wall,
        // its coiled lines hanging to the car (photos 2018, 2021: spiral lines from the ceiling to the car). By the walls:
        // tyre sets on their trolleys under blankets, the wheel guns on the wall, the front and rear jacks by the door,
        // a bench and the tool cabinets at the back, a screen on the back wall (dark: no team data is shown).
        inst.boom.push([at(s, s.depth - 0.1, cx, s.ceil - 0.55), yaw, null, [1, 1, Math.min(1.2, (s.depth - cd + 0.6) / 4.2)]]);
        // tyres: along a wall where there's room beside the car, else in a row across the back
        const stacks = 2 + Math.floor(r() * 2);
        if (sideRoom >= 0.8) for (let i = 0; i < stacks * 2; i++) { const sd = i % 2 ? 1 : -1, d = 1.7 + Math.floor(i / 2) * 0.95 + r() * 0.1; if (d < s.depth - 1.4) { const p = at(s, d, sd * (s.width / 2 - 0.45), 0); inst.trolley.push([p, yaw, null]); inst.tyres.push([p.clone().setY(p.y + 0.16), r() * 3, tc]); } }
        else for (let i = 0; i < stacks; i++) { const x = (i - (stacks - 1) / 2) * 0.95; const p = at(s, s.depth - 1.55, x, 0); inst.trolley.push([p, yaw, null]); inst.tyres.push([p.clone().setY(p.y + 0.16), r() * 3, tc]); }
        inst.bench.push([at(s, s.depth - 0.42, (r() - 0.5) * 0.4 - s.width * 0.18, 0), yaw, tc]);
        inst.cabinet.push([at(s, s.depth - 0.36, s.width * 0.26, 0), yaw, tc, [Math.min(1, (s.width * 0.42) / 1.5), 1, 1]]);
        inst.monitor.push([at(s, s.depth - 0.08, 0, 1.95), yaw, null]);
        if (sideRoom >= 0.35) for (const sd of [-1, 1]) inst.gun.push([at(s, 2.6 + r() * 0.4, sd * (s.width / 2 - 0.12), 1.15), yaw + sd * Math.PI / 2, null]);
        // jacks by the door, either side of the car's way in and out
        if (sideRoom >= 0.45) inst.jack.push([at(s, 1.0, (r() < 0.5 ? -1 : 1) * (s.width / 2 - 0.35), 0), yaw + Math.PI / 2, null]);
      } else {
        // Engineering and spares: engineers' desks of screens (dark), cabinets along the back, a parts trolley
        const n = Math.max(1, Math.min(3, Math.floor((s.width - 0.4) / 1.6)));
        for (let i = 0; i < n; i++) inst.cabinet.push([at(s, s.depth - 0.36, (i - (n - 1) / 2) * 1.6, 0), yaw, tc]);
        inst.screens.push([at(s, s.depth * 0.5, (r() - 0.5) * Math.max(0, s.width - 2) * 0.4, 0), yaw + Math.PI, tc]);
        if (s.depth > 6) inst.screens.push([at(s, s.depth * 0.5 - 1.4, (r() - 0.5) * Math.max(0, s.width - 2) * 0.4, 0), yaw + Math.PI, tc]);
        inst.monitor.push([at(s, s.depth - 0.08, -s.width * 0.22, 1.95), yaw, null]); inst.monitor.push([at(s, s.depth - 0.08, s.width * 0.22, 1.95), yaw, null]);
        if (s.width > 3.2) inst.trolley.push([at(s, 1.9 + r(), (r() < 0.5 ? -1 : 1) * (s.width / 2 - 0.55), 0), yaw, null]);
      }
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
    // Each bay's header: a panel hung across the top of the opening, just inside it (behind the rolled-up shutter's box,
    // under the lintel) – where the photos show a team's header board (Commons: AlphaTauri and Mercedes garages, British
    // GP 2021; Mercedes, Austrian GP 2018). On a car's bay it carries that driver's number and name (one board each –
    // workSpaces; a bay split between drivers: each within its own part – boardWidth), on the others the team's name. Its
    // lower edge 0.98 m under the opening's top: seen under the lintel from 7 m out in the pit lane at 9 m up, and from
    // the helicopter. A driver without a work space (no bay for the team) gets no board.
    // (v0.38's boards were 0.22 m high, 0.9 m in and 0.55 m under the opening's top: a few pixels from the pit lane,
    // behind the lintel from above – Map3D.boardsDiag)
    for (const s of ss) {
      const hy = s.height - 0.7, hd = 0.68, dark = col.clone().multiplyScalar(0.22).lerp(new THREE.Color("#121417"), 0.55);
      quad(panels, at(s, hd + 0.02, 0, hy), along.clone().multiplyScalar(s.width - 0.1), new THREE.Vector3(0, 0.6, 0), out, null, dark);
      quad(panels, at(s, hd + 0.015, 0, hy - 0.33), along.clone().multiplyScalar(s.width - 0.1), new THREE.Vector3(0, 0.06, 0), out, null, col);
      if (!t.drivers.some((d) => d.slot === s.k)) { const lw = Math.min(s.width * 0.6, 2.6); quad(labels, at(s, hd, 0, hy), along.clone().multiplyScalar(lw), new THREE.Vector3(0, lw / 8, 0), out, lab.uv(t.row)); }
    }
    for (const d of t.drivers) {
      const s = d.slot != null ? bySlot.get(d.slot) : null; if (!s) continue;
      const bw = boardWidth(s.width, t.drivers.filter((x) => x.slot === d.slot).length), c = at(s, 0.68, d.w || 0, s.height - 0.7);
      quad(labels, c, along.clone().multiplyScalar(bw), new THREE.Vector3(0, bw / 8, 0), out, lab.uv(d.row));
      boards.push({ num: d.num, team: t.team, slot: s.k, p: [c.x, c.y, c.z], n: [out.x, out.y, out.z], w: bw, h: bw / 8, label: rows[d.row]?.text });
    }
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
    // (with the stand's half length: it lies along the walkway over its whole length – facilities.js wallAt)
    const w = garages.wallAt?.(t.box, (pitWallSeats(t.team, season).seats * 0.8 + 0.6) / 2);
    if (w) pitWallStand(w, t, season);
  }
  const mesh = (store, mat, name) => {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(store.pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(store.nor, 3));
    if (store.uv?.length) g.setAttribute("uv", new THREE.Float32BufferAttribute(store.uv, 2));
    if (store.col?.length) g.setAttribute("color", new THREE.Float32BufferAttribute(store.col, 3));
    const m = new THREE.Mesh(g, mat); m.name = name; group.add(m);
  };
  if (panels.pos.length) mesh(panels, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide }), "teamPanels");
  if (labels.pos.length) mesh(labels, labelMat, "teamLabels");
  if (screenQuads.pos.length) { const sm = new THREE.MeshBasicMaterial({ map: pitScreenTexture(), toneMapped: false }); mesh(screenQuads, sm, "pitWallScreens"); }
  // each team's own panels: a texture of the layer's own (freed with it), painted by updateTeamScreens
  const teamScreens = [];
  for (const [team, tq] of teamQuads) {
    if (!tq.pos.length) continue;
    const cv = document.createElement("canvas"); cv.width = 384; cv.height = 128;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    mesh(tq, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), "pitWallTeamScreens");
    teamScreens.push({ team, colour: tq.t.colour, drivers: (tq.t.drivers || []).slice(0, 2).map((d) => ({ num: d.num, tla: d.tla })), cv, tex, key: null, at: -1e9 });
  }
  group.userData.teamScreens = teamScreens;
  group.userData.boards = boards;
  if (people.length) group.add(peopleMeshes(people));
  if (marks.pos.length) mesh(marks, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }), "boxMarks");
  // instanced equipment
  // (the small things – floor markings, ceiling strips, booms, guns, trolleys, screens – in a group of their own shown only
  // close by: facilities.js hides "pitTeamsNear" beyond 120 m, the rest of the layer beyond 300 m)
  const near = new THREE.Group(); near.name = "pitTeamsNear";
  const instanced = (geo, mat, list, name, coloured, into = group) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    const grey = new THREE.Color("#9aa0a6");
    list.forEach(([p, yaw, c, k], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); sc.set(...(k || [1, 1, 1])); m4.compose(p, q, sc); im.setMatrixAt(i, m4); if (coloured) im.setColorAt(i, c || grey); });
    im.computeBoundingSphere();
    im.name = name; into.add(im);
  };
  instanced(S.tyres, S.rubber, inst.tyres, "tyres");
  instanced(S.blankets, new THREE.MeshStandardMaterial({ roughness: 0.8 }), inst.tyres, "blankets", true);
  instanced(S.cabinet, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 }), inst.cabinet, "cabinets", true);
  instanced(S.jack, S.grey, inst.jack, "jacks");
  instanced(S.bench, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35 }), inst.bench, "benches", true);
  instanced(S.screens, S.screen, inst.screens, "screens");
  instanced(S.boom, S.grey, inst.boom, "booms", false, near);
  instanced(S.trolley, S.grey, inst.trolley, "trolleys", false, near);
  instanced(S.gun, S.rubber, inst.gun, "wheelGuns", false, near);
  instanced(S.monitor, S.screen, inst.monitor, "wallScreens", false, near);
  if (floor.pos.length) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(floor.pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(floor.nor, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(floor.col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.name = "garageFloors"; m.receiveShadow = true; near.add(m); }
  if (lights.pos.length) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(lights.pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(lights.nor, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: "#eef2f7" })); m.name = "garageLights"; near.add(m); }
  if (near.children.length) group.add(near);
  return group;
}

// Why each driver's name board is or isn't made (Map3D.boardsDiag; pure – tested): G the pit building's garages (or
// null), hasPositions (the session's position data), drivers (DriverList), nums (every car number the session names),
// teams (allocatePlaces' result), evidence (PitInference's per team), layerKey / keyNow (the key the drawn layer was
// made for / the allocation's now), boards (Map num → the layer's board). → [{ num, code, team, status: "created" |
// "excluded", reason, slot }]
export function boardStatus({ G, hasPositions, drivers, nums, teams, evidence = [], layerKey = null, keyNow = null, boards = new Map() }) {
  return nums.map((num) => {
    const d = drivers?.[num], r = { num, code: d?.Tla || null, team: d?.TeamName || null, status: "excluded", reason: null, slot: null };
    const t = teams.find((x) => x.team === d?.TeamName), td = t?.drivers.find((x) => x.num === num);
    if (!G) r.reason = "no pit building with garages in this world (map buildings only, or the facilities setting off)";
    else if (!G.slots?.length) r.reason = "the pit building has no garages";
    else if (!hasPositions) r.reason = "no position data yet";
    else if (!d) r.reason = "not in the session's driver list";
    else if (!d.TeamName) r.reason = "no team in the driver list";
    else if (!t) { const e = evidence.find((x) => x.team === d.TeamName); r.reason = "team not allocated" + (e ? `: ${e.reason}` : ": no stops or long stays of the team seen yet, no drawing or order for it"); }
    else if (!td) r.reason = "not among the team's drivers in the allocation (driver list changed – the next check rebuilds)";
    else if (td.slot == null) r.reason = "no work space (the team has no bay)";
    else if (!G.slots.some((s) => s.k === td.slot)) r.reason = "its bay isn't in this pit building (stale allocation)";
    else if (layerKey !== keyNow) r.reason = "allocation key stale: the layer is from an older allocation";
    else if (!boards.has(num)) r.reason = "the layer has no board for it (atlas row / layer missing)";
    else { r.status = "created"; r.reason = "on bay " + td.slot + (t.link === "confirmed" ? " (FIA drawing's garages)" : " (estimated garages)"); }
    r.slot = td?.slot ?? null;
    return r;
  });
}

// Whether a hit of the diagnostic's ray doesn't hide a board: a see-through surface (the street circuits' catch fence,
// 28 % opaque – map3d.js streetWalls) or one not drawn. (v0.40: at Monaco boardsDiag said "occluded: behind
// syntheticWalls" for boards plainly readable through the fence.)
export const seeThrough = (material) => !!material && [].concat(material).every((m) => m.visible === false || m.colorWrite === false || (m.transparent && m.opacity < 0.5));

// A key for an allocation (to rebuild only when it changes)
// (garage indices only – a place moving within its garage doesn't rebuild anything)
// (every value teamLayer draws from: the team, its colour and garages, where its box is drawn and how far out, each
// driver's board – its text and garage)
export const allocationKey = (teams) => teams.map((t) => [t.team, t.colour, t.from, t.link, t.slots.join(","), t.box ?? "", t.boxOff ?? "",
  t.drivers.map((d) => `${d.num}=${d.label ?? d.tla}@${d.slot ?? ""}${d.w ? "/" + d.w.toFixed(2) : ""}`).join("+")].join(":")).join("|");

// The teams' own pit wall panels of a layer (teamLayer's group): get(num) → { line, app, car } for that driver now.
// Repainted when what they show changed, at most every `every` ms; returns how many were painted.
export function updateTeamScreens(group, get, now = performance.now(), every = 500) {
  let n = 0;
  for (const s of group?.userData?.teamScreens || []) {
    if (now - s.at < every) continue;
    const ms = s.drivers.map((d) => driverPanel({ d, colour: s.colour, ...get(d.num) }));
    const key = ms.map((m) => m.key).join("|");
    if (key === s.key) continue;
    const g = s.cv.getContext("2d");
    ms.forEach((m, i) => paintPanel(g, i * 192, m));
    if (ms.length < 2) { g.fillStyle = "#0b0e13"; g.fillRect(192, 0, 192, 128); }
    s.tex.needsUpdate = true; s.key = key; s.at = now; n++;
  }
  return n;
}
