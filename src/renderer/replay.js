// Session sources. Replay rebuilds a recorded session at any moment; LiveSource follows the live feed
// (optionally held back to match a TV broadcast). Both expose the same surface to the UI:
//   state, messages, positionsAt(t), laps(num, t), pits(num, t), now(), isLive
(function (root) {
  const isIndexObject = (o) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).every((k) => /^\d+$/.test(k));

  // F1 feeds send partial updates. Objects merge recursively; an index-keyed object patches an array.
  // (keys that would reach an object's prototype are never merged: the feed is outside data)
  const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);
  const own = (o, k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
  function merge(target, src) {
    if (src === null || typeof src !== "object") return src;
    if (Array.isArray(src)) return src.map((v) => merge(undefined, v));
    if (Array.isArray(target) && isIndexObject(src)) {
      for (const [k, v] of Object.entries(src)) target[+k] = merge(own(target, +k), v);
      return target;
    }
    const out = target && typeof target === "object" && !Array.isArray(target) ? target : {};
    for (const [k, v] of Object.entries(src)) {
      if (UNSAFE.has(k)) continue;
      if (k === "_deleted") {
        if (Array.isArray(v)) for (const d of v) if ((typeof d === "string" || typeof d === "number") && !UNSAFE.has(String(d))) delete out[d];
        continue;
      }
      out[k] = merge(own(out, k), v);
    }
    return out;
  }

  const parseUtc = (v) => Date.parse(/Z$|[+-]\d\d:\d\d$/.test(v || "") ? v : v + "Z");
  // "01:02:03" or "45:12" (session clock) → ms
  const clockMs = (v) => {
    const p = String(v || "").trim().split(":").map(Number);
    if (!p.length || p.some((x) => !Number.isFinite(x))) return null;
    return p.reduce((acc, x) => acc * 60 + x, 0) * 1000;
  };
  const toSec = (v) => {
    const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(v || "").trim());
    return m ? (+(m[1] || 0)) * 60 + +m[2] : null;
  };

  // Builds each driver's lap list (time, position) and pit-entry laps from TimingData deltas.
  class LapTracker {
    constructor() { this.cur = {}; this.lapList = {}; this.pitList = {}; this.fixed = {}; }
    feed(ms, lines) {
      for (const [num, l] of Object.entries(lines || {})) {
        const c = this.cur[num] || (this.cur[num] = {});
        if (l.NumberOfLaps != null) c.n = l.NumberOfLaps;
        if (l.Position) c.pos = +l.Position;
        if (typeof l.GapToLeader === "string") c.gap = l.GapToLeader;
        if (l.InPit === true && !c.inPit) (this.pitList[num] || (this.pitList[num] = [])).push({ lap: (c.n || 0) + 1, ms });
        if (l.InPit != null) c.inPit = l.InPit;
        const v = l.LastLapTime?.Value;
        if (!v) continue;
        const list = this.lapList[num] || (this.lapList[num] = []);
        const last = list[list.length - 1], prev = last ? last.lap : 0;
        // Which lap a time belongs to. The lap counter decides when it's known (F1 sends it with the time; it can
        // also come a message earlier): a counter past the last recorded lap is a new lap even with the same time as
        // before (two laps can be timed identically to the thousandth); the counter on the last recorded lap with a
        // different time is that lap corrected – kept with when it was corrected, not a lap more. Without a
        // counter, a new time is the next lap.
        const n = l.NumberOfLaps != null ? l.NumberOfLaps : c.n;
        if (n != null && n > prev) {
          list.push({ lap: n, time: v, sec: toSec(v), pos: c.pos, ms, gap: gapSec(c.gap) });
        } else if (l.NumberOfLaps != null) {
          // (a counter behind the last recorded lap – an older picture – changes nothing)
          if (last && n === prev && v !== last.time) { (last.fix || (last.fix = [[last.ms, last.time]])).push([ms, v]); last.time = v; last.sec = toSec(v); this.fixed[num] = true; }
        } else if (v !== c.last) {
          list.push({ lap: prev + 1, time: v, sec: toSec(v), pos: c.pos, ms, gap: gapSec(c.gap) });
        }
        c.last = v;
      }
    }
    laps(num, t = Infinity) {
      const list = (this.lapList[num] || []).filter((x) => x.ms <= t);
      if (!this.fixed[num]) return list;
      return list.map((x) => {
        if (!x.fix || x.fix[x.fix.length - 1][0] <= t) return x;
        let time = x.fix[0][1]; for (const [m, v] of x.fix) { if (m > t) break; time = v; }
        return { ...x, time, sec: toSec(time) };
      });
    }
    pits(num, t = Infinity) { return (this.pitList[num] || []).filter((x) => x.ms <= t); }
  }

  // Pit stops gathered from two feeds: PitLaneTimeCollection (time through the pit lane, shown briefly then
  // deleted) and PitStopSeries (also the stationary time, but not sent for every stop). Keyed by car and lap.
  class PitLog {
    constructor() { this.stops = {}; }
    feed(ms, topic, data) {
      const times = data?.PitTimes;
      if (!times || (topic !== "PitLaneTimeCollection" && topic !== "PitStopSeries")) return;
      for (const [num, v] of Object.entries(times)) {
        if (num === "_deleted" || !v) continue;
        const entries = topic === "PitStopSeries" ? (Array.isArray(v) ? v : Object.values(v)).map((x) => x?.PitStop) : [v];
        for (const e of entries) {
          if (!e?.Lap) continue;
          const list = this.stops[num] || (this.stops[num] = []);
          let rec = list.find((x) => x.lap === +e.Lap);
          if (!rec) { rec = { lap: +e.Lap, ms, hist: [] }; list.push(rec); list.sort((a, b) => a.lap - b.lap); }
          // (each value is kept with the time it arrived: a time corrected later doesn't show before it was sent)
          if (e.Duration || e.PitLaneTime) { rec.lane = +(e.PitLaneTime || e.Duration); rec.hist.push([ms, "lane", rec.lane]); }
          if (e.PitStopTime) { rec.stop = +e.PitStopTime; rec.hist.push([ms, "stop", rec.stop]); }
        }
      }
    }
    list(num, t = Infinity) {
      return (this.stops[num] || []).filter((x) => x.ms <= t).map((x) => {
        if (!x.hist.length || x.hist[x.hist.length - 1][0] <= t) return x;
        const o = { lap: x.lap, ms: x.ms, hist: x.hist };
        for (const [m, k, v] of x.hist) { if (m > t) break; o[k] = v; }
        return o;
      });
    }
    all(t = Infinity) { return Object.keys(this.stops).flatMap((n) => this.list(n, t)); }
  }

  // Time a pit stop costs at this circuit. The pit lane time (entry to exit, median of this session's stops)
  // also contains the time the car would have needed for that stretch at racing speed, about a fifth of it,
  // so the loss is ~80 % of it; with fewer than two stops a typical 22 s. Under a safety car or VSC the
  // field is slow, so a stop costs roughly half.
  function pitLoss(stops, trackStatus) {
    const lanes = stops.map((p) => p.lane).filter((x) => x > 10 && x < 45).sort((a, b) => a - b);
    const base = lanes.length >= 2 ? lanes[Math.floor(lanes.length / 2)] * 0.8 : 22;
    const neutral = ["4", "6", "7"].includes(String(trackStatus || ""));
    return { sec: neutral ? base * 0.55 : base, base, measured: lanes.length >= 2, neutral };
  }

  // Seconds behind the leader from a race "GapToLeader" ("+1.234", "LAP 5" for the leader); lapped cars → null.
  const gapSec = (v) => {
    const s = String(v ?? "").trim();
    if (/^LAP \d+$/.test(s) || s === "") return s ? 0 : null;
    const m = /^\+?(\d+(?:\.\d+)?)$/.exec(s);
    return m ? +m[1] : null;
  };

  // Where a driver would rejoin after a stop now: everyone (still running, on the lead lap) whose gap to the
  // leader is smaller than ours plus the pit loss stays ahead. rows: [{ num, gap }] in race order.
  function pitRejoin(rows, num, loss) {
    const me = rows.find((r) => r.num === num);
    if (!me || me.gap == null) return null;
    const after = me.gap + loss;
    const others = rows.filter((r) => r.num !== num && r.gap != null);
    const ahead = others.filter((r) => r.gap <= after).sort((a, b) => b.gap - a.gap);
    const behind = others.filter((r) => r.gap > after).sort((a, b) => a.gap - b.gap);
    return { pos: ahead.length + 1, after, ahead: ahead[0] || null, behind: behind[0] || null };
  }

  // Lap times deleted by race control (track limits and so on), per car, from the messages so far.
  // "CAR 44 (HAM) TIME 1:23.456 DELETED - TRACK LIMITS AT TURN 4 LAP 7 15:04:05" / "CAR 1 (NOR) LAP DELETED - …";
  // "CAR 44 (HAM) TIME 1:23.456 WILL BE REINSTATED" takes one back.
  // Some messages name the car by code only ("CAR BEA TIME 1:39.643 DELETED - … (NEXT LAP) (Q2)"): the driver
  // list (racing number → { Tla }) maps those back to the number.
  function deletedLaps(messages, drivers = {}) {
    const out = {}, byTla = {};
    for (const [n, d] of Object.entries(drivers || {})) if (d?.Tla) byTla[d.Tla] = n;
    const car = (num, tla) => num || byTla[tla] || tla;
    for (const m of messages) {
      const text = String(m?.Message || "");
      let x = /^CAR (?:(\d+) \(([A-Z0-9]{3})\)|([A-Z]{3})) (?:TIME (?:(\d+:\d\d\.\d+) )?|LAP )DELETED - (.*)$/.exec(text);
      if (x) {
        // Reason first, then optional "LAP 7", a time of day and bracketed notes.
        const r = /^(.*?)(?: LAP (\d+))?(?: \d\d:\d\d:\d\d)?((?: \([^)]*\))*)$/.exec(x[5]);
        const key = car(x[1], x[3]);
        (out[key] || (out[key] = [])).push({ time: x[4] || null, why: r[1], lap: r[2] ? +r[2] : m.Lap || null, limits: /TRACK LIMITS/.test(r[1]), msg: text });
        continue;
      }
      x = /^CAR (?:(\d+) \(([A-Z0-9]{3})\)|([A-Z]{3})) (?:TIME (\d+:\d\d\.\d+)|LAP (\d+)) WILL BE REINSTATED/.exec(text);
      const key = x && car(x[1], x[3]);
      if (x && out[key]) {
        const i = out[key].findIndex((d) => (x[4] ? d.time === x[4] : d.lap === +x[5]));
        if (i >= 0) out[key].splice(i, 1);
      }
    }
    return out;
  }

  // Race lap (the leader's lap shown on TV) in progress at stream time ms, from LapCount changes [[ms, lap], …].
  function lapAtMs(marks, ms) {
    let lap = null;
    for (const [at, l] of marks) { if (at <= ms) lap = l; else break; }
    return lap;
  }

  // Laps run under safety car, virtual safety car or red flag, from TrackStatus and the leader's lap count.
  const NEUTRAL = { 4: "SC", 6: "VSC", 7: "VSC", 5: "RED" };
  // (a period's last lap grows as laps go by under it; every step is kept with its time, so a replay seeking back
  // sees the period as it stood then, not how far it ran later)
  class StatusLog {
    constructor() { this.lap = 0; this.kind = null; this.list = []; }
    feed(ms, topic, data) {
      if (topic === "LapCount" && data.CurrentLap) {
        this.lap = data.CurrentLap;
        if (this.kind) { const p = this.list[this.list.length - 1]; p.to = this.lap; p.ends.push([ms, this.lap]); }
      }
      if (topic !== "TrackStatus" || !data.Status) return;
      const kind = NEUTRAL[data.Status] || null;
      if (kind === this.kind) return;
      this.kind = kind;
      if (kind) this.list.push({ kind, from: this.lap, to: this.lap, ms, ends: [[ms, this.lap]] });
    }
    periods(t = Infinity) {
      return this.list.filter((p) => p.ms <= t).map((p) => {
        if (p.ends[p.ends.length - 1][0] <= t) return p;
        let to = p.from; for (const [m, l] of p.ends) { if (m > t) break; to = l; }
        return { ...p, to };
      });
    }
  }

  // F1 sometimes rewrites a driver's stint list in place, shifted down ({"0":…,"1":…} after a cleanup),
  // without removing the old entries at the end. The stint that was written last (with its lap count) is the
  // current one; anything after it is left over until a new stint overwrites it.
  function noteStints(src, data) {
    for (const [num, l] of Object.entries(data?.Lines || {})) {
      const st = l?.Stints;
      if (!st || typeof st !== "object") continue;
      if (Array.isArray(st)) { src.stintEnd[num] = st.length - 1; continue; }
      const idx = Object.keys(st).filter((k) => /^\d+$/.test(k)).map(Number);
      if (!idx.length) continue;
      const top = Math.max(...idx);
      src.stintEnd[num] = st[top]?.TotalLaps != null ? top : Math.max(src.stintEnd[num] ?? -1, top);
    }
  }
  function stintsOf(src, num) {
    const raw = src.state.TimingAppData?.Lines?.[num]?.Stints;
    const all = (Array.isArray(raw) ? raw : Object.values(raw || {})).filter(Boolean);
    const end = src.stintEnd[num];
    const list = end == null ? all : all.slice(0, end + 1);
    // Tyres swapped on the grid leave ghost stints that F1 keeps counting alongside the real one (with empty
    // placeholders in between) until it tidies the list up. While the stints add up to more laps than the car
    // has done, drop earlier stints that count in step with the next or the current one, and empty ones.
    const done = +src.state.TimingData?.Lines?.[num]?.NumberOfLaps || 0;
    const laps = (x) => Math.max(0, (x.TotalLaps || 0) - (x.StartLaps || 0));
    const sum = () => list.reduce((a, x) => a + laps(x), 0);
    let ref = list.length - 1;
    while (ref > 0 && !laps(list[ref])) ref--;                     // the stint being counted now
    for (let i = ref - 1; i >= 0 && done && sum() > done + 1; i--) {
      const n = laps(list[i]);
      if (n === 0 || n === laps(list[i + 1]) || n === laps(list[ref])) { list.splice(i, 1); ref--; }
    }
    return list;
  }

  // ---------- car telemetry ----------
  // A car's samples: { t, v, rpm, gear, thr, brk, drs } parallel arrays (typed in replays, plain when live).
  // Index of the last sample at or before t (−1 when none).
  function sampleAt(c, t) {
    let lo = 0, hi = c.t.length - 1;
    if (hi < 0 || c.t[0] > t) return -1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (c.t[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }
  // Values at time t (speed and rpm interpolated); null when there's nothing within 3 s.
  function carAt(c, t) {
    if (!c) return null;
    const i = sampleAt(c, t);
    if (i < 0 || t - c.t[i] > 3000) return null;
    const j = Math.min(i + 1, c.t.length - 1), f = c.t[j] > c.t[i] ? Math.min(1, (t - c.t[i]) / (c.t[j] - c.t[i])) : 0;
    return { speed: c.v[i] + (c.v[j] - c.v[i]) * f, rpm: c.rpm[i] + (c.rpm[j] - c.rpm[i]) * f, gear: c.gear[i], thr: c.thr[i], brk: c.brk[i], drs: c.drs[i] };
  }
  // Samples between t0 and t1 with distance (m) from t0, integrated from speed.
  function carTrace(c, t0, t1) {
    if (!c) return null;
    let i = Math.max(0, sampleAt(c, t0));
    const out = { t: [], d: [], v: [], thr: [], brk: [], gear: [] };
    let d = 0, prevT = null, prevV = 0;
    for (; i < c.t.length && c.t[i] <= t1; i++) {
      if (c.t[i] < t0) continue;
      if (prevT != null) d += ((prevV + c.v[i]) / 2 / 3.6) * ((c.t[i] - prevT) / 1000);
      out.t.push(c.t[i] - t0); out.d.push(d); out.v.push(c.v[i]); out.thr.push(c.thr[i]); out.brk.push(c.brk[i]); out.gear.push(c.gear[i]);
      prevT = c.t[i]; prevV = c.v[i];
    }
    return out.t.length > 10 ? out : null;
  }
  // Time (ms) at distance d along a trace (linear between samples).
  function timeAtDistance(tr, d) {
    const D = tr.d;
    if (d <= 0) return 0;
    let lo = 0, hi = D.length - 1;
    if (d >= D[hi]) return tr.t[hi];
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (D[mid] <= d) lo = mid; else hi = mid; }
    const f = D[hi] > D[lo] ? (d - D[lo]) / (D[hi] - D[lo]) : 0;
    return tr.t[lo] + (tr.t[hi] - tr.t[lo]) * f;
  }
  // A lap's telemetry for a driver: lap list entry k (from LapTracker) runs from the previous entry's
  // time to its own. Returns the trace or null.
  function lapTrace(src, num, lapNo) {
    const laps = src.laps(num, Infinity), k = laps.findIndex((x) => x.lap === lapNo);
    if (k <= 0) return null;
    const c = src.car?.[num];
    const tr = carTrace(c, laps[k - 1].ms, laps[k].ms);
    if (tr) { tr.lap = lapNo; tr.time = laps[k].time; tr.sec = laps[k].sec; }
    return tr;
  }

  function applyTo(src, topic, data) {
    if (topic === "TimingAppData") noteStints(src, data);
    if (topic === "RaceControlMessages") {
      const m = data.Messages;
      for (const msg of Array.isArray(m) ? m : Object.values(m || {})) src.messages.push(msg);
      return;
    }
    src.state[topic] = merge(src.state[topic], data);
  }

  class Replay {
    constructor({ topics, duration }) {
      this.isLive = false;
      this.duration = duration;
      this.positions = topics.Position || [];
      this.tracks = CarTracks.fromSamples(this.positions);
      this.events = [];
      this.car = topics.CarData || {};
      for (const [topic, list] of Object.entries(topics)) {
        if (topic === "Position" || topic === "CarData") continue;
        for (const [ms, data] of list) this.events.push({ ms, topic, data });
      }
      this.events.sort((a, b) => a.ms - b.ms);
      // Lap history is computed once for the whole session and filtered by time when read.
      this.tracker = new LapTracker();
      this.pitLog = new PitLog(); this.statusLog = new StatusLog();
      for (const e of this.events) {
        if (e.topic === "TimingData") this.tracker.feed(e.ms, e.data.Lines);
        else { this.pitLog.feed(e.ms, e.topic, e.data); this.statusLog.feed(e.ms, e.topic, e.data); }
      }
      this.heartbeats = this.events.filter((e) => e.topic === "Heartbeat" && e.data.Utc).map((e) => [e.ms, Date.parse(e.data.Utc)]);
      this.lapMarks = this.events.filter((e) => e.topic === "LapCount" && e.data.CurrentLap).map((e) => [e.ms, e.data.CurrentLap]);
      this.reset();
    }

    reset() { this.state = {}; this.messages = []; this.stintEnd = {}; this.i = 0; this.t = -1; }

    seek(t) {
      if (t < this.t) this.reset();
      while (this.i < this.events.length && this.events[this.i].ms <= t) { const e = this.events[this.i++]; applyTo(this, e.topic, e.data); }
      this.t = t;
    }

    // Wall-clock UTC at stream time t, from the nearest heartbeat.
    utcAt(t) {
      const h = this.heartbeats;
      if (!h.length) return null;
      let best = h[0];
      for (const x of h) { if (x[0] <= t) best = x; else break; }
      return best[1] + (t - best[0]);
    }
    // Stream time for a wall-clock UTC (the inverse of utcAt), e.g. when a team radio clip was recorded.
    msAt(utc) {
      const h = this.heartbeats;
      if (!h.length) return utc;
      let best = h[0];
      for (const x of h) { if (x[1] <= utc) best = x; else break; }
      return best[0] + (utc - best[1]);
    }
    raceLapAt(ms) { return lapAtMs(this.lapMarks, ms); }
    stints(num) { return stintsOf(this, num); }
    carAt(num, t = this.t) { return carAt(this.car[num], t); }
    lapTrace(num, lap) { return lapTrace(this, num, lap); }
    hasTelemetry() { return Object.keys(this.car).length > 0; }
    now() { return this.t; }

    positionsAt(t) { return this.tracks.all(t); }
    // the same into reused arrays, with velocities (dm/ms) – for drawing every frame without garbage
    positionsInto(t, into, vels) { return this.tracks.all(t, into, vels); }
    laps(num, t = this.t) { return this.tracker.laps(num, t); }
    pits(num, t = this.t) { return this.tracker.pits(num, t); }
    pitStops(num, t = this.t) { return this.pitLog.list(num, t); }
    allPitStops(t = this.t) { return this.pitLog.all(t); }
    neutralPeriods(t = this.t) { return this.statusLog.periods(t); }

    // Moment the session clock starts running (skips the pre-session wait).
    startTime() {
      for (const e of this.events) if (e.topic === "ExtrapolatedClock" && e.data.Extrapolating) return e.ms;
      return 0;
    }

    // Results are confirmed ("Finalised") a few minutes after the flag; what follows is only podium time.
    endTime() {
      for (const e of this.events) if (e.topic === "SessionStatus" && e.data.Status === "Finalised") return e.ms;
      return this.duration;
    }

    trackOutline() { return outlineFrom(this.positions); }
    // One clean lap for drawing the circuit: tries the cars that drove furthest until one gives a closed lap.
    lapShape() {
      if (this._lap !== undefined) return this._lap;
      const dist = {}, last = {};
      for (const [, cars] of this.positions) for (const [n, p] of Object.entries(cars)) {
        const q = last[n];
        if (q) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d > 5 && d < 5000) dist[n] = (dist[n] || 0) + d; }
        last[n] = p;
      }
      this._lap = null;
      for (const [n] of Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
        const pts = []; for (const [, cars] of this.positions) if (cars[n]) pts.push(cars[n]);
        const lap = findLap(pts);
        if (lap) { this._lap = lap; break; }
      }
      return this._lap;
    }
  }

  // Every car's own position track: times (stream ms) and X/Y/Z (decimetres), only where the car was
  // actually sampled. Position at any time comes from a cubic Hermite curve whose tangents respect the
  // uneven gaps between samples, so speed and heading change smoothly – no hesitation at each sample, no
  // holding still when a sample leaves a car out. Gaps over 4 s (garage, data holes) are not bridged.
  class CarTracks {
    constructor() { this.cars = {}; }
    static fromSamples(samples) {
      const tr = new CarTracks(), count = {};
      for (const [, cars] of samples) for (const n of Object.keys(cars)) count[n] = (count[n] || 0) + 1;
      for (const [n, c] of Object.entries(count)) tr.cars[n] = { t: new Float64Array(c), x: new Float32Array(c), y: new Float32Array(c), z: new Float32Array(c), n: 0 };
      for (const [t, cars] of samples) for (const [n, p] of Object.entries(cars)) tr.push(n, t, p);
      return tr;
    }
    push(num, t, p) {
      let c = this.cars[num];
      if (!c) c = this.cars[num] = { t: [], x: [], y: [], z: [], n: 0, grow: true };
      if (c.n && t <= c.t[c.n - 1] + 1) return;                     // same moment twice: keep the first
      if (c.grow) { c.t.push(t); c.x.push(p[0]); c.y.push(p[1]); c.z.push(p[2] || 0); c.n = c.t.length; return; }
      if (c.n >= c.t.length) return;
      c.t[c.n] = t; c.x[c.n] = p[0]; c.y[c.n] = p[1]; c.z[c.n] = p[2] || 0; c.n++;
    }
    // drop samples older than `cutoff` (live)
    trim(cutoff) {
      for (const c of Object.values(this.cars)) {
        if (!c.grow) continue;
        let k = 0; while (k < c.n && c.t[k] < cutoff) k++;
        if (k > 50) { for (const a of [c.t, c.x, c.y, c.z]) a.splice(0, k); c.n = c.t.length; }
      }
    }
    // Writes the position (and, if `vel` is given, the velocity in dm/ms) of car `num` at time t.
    // Returns false when there's no sample within 4 s.
    at(num, t, out, vel) {
      const c = this.cars[num];
      if (!c || !c.n) return false;
      const T = c.t, n = c.n;
      if (t <= T[0]) { if (T[0] - t > 4000) return false; out[0] = c.x[0]; out[1] = c.y[0]; out[2] = c.z[0]; if (vel) vel[0] = vel[1] = vel[2] = 0; return true; }
      if (t >= T[n - 1]) { if (t - T[n - 1] > 4000) return false; const k = n - 1; out[0] = c.x[k]; out[1] = c.y[k]; out[2] = c.z[k]; if (vel) vel[0] = vel[1] = vel[2] = 0; return true; }
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= t) lo = mid; else hi = mid; }
      const t0 = T[lo], t1 = T[hi], h = t1 - t0;
      // a gap in the data: the last position for 4 s (as after the last sample), then no car until data comes back –
      // a car that stopped being sent (retired, data lost) doesn't stand there as a ghost
      if (h > 4000) { if (t - t0 > 4000) return false; out[0] = c.x[lo]; out[1] = c.y[lo]; out[2] = c.z[lo]; if (vel) vel[0] = vel[1] = vel[2] = 0; return true; }
      const s = (t - t0) / h, s2 = s * s, s3 = s2 * s;
      const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
      const d00 = (6 * s2 - 6 * s) / h, d10 = (3 * s2 - 4 * s + 1), d01 = (-6 * s2 + 6 * s) / h, d11 = (3 * s2 - 2 * s);
      // tangents from the neighbours (non-uniform Catmull-Rom); one-sided at gaps
      const okPrev = lo > 0 && t0 - T[lo - 1] < h * 3 + 400, okNext = hi < n - 1 && T[hi + 1] - t1 < h * 3 + 400;
      for (let a = 0; a < 3; a++) {
        const A = a === 0 ? c.x : a === 1 ? c.y : c.z, p0 = A[lo], p1 = A[hi], chord = (p1 - p0) / h;
        const m0 = okPrev ? (p1 - A[lo - 1]) / (t1 - T[lo - 1]) : chord;
        const m1 = okNext ? (A[hi + 1] - p0) / (T[hi + 1] - t0) : chord;
        out[a] = h00 * p0 + h10 * h * m0 + h01 * p1 + h11 * h * m1;
        if (vel) vel[a] = d00 * p0 + d10 * m0 + d01 * p1 + d11 * m1;
      }
      return true;
    }
    // All cars at time t into `into` ({num: [x, y, z]}, arrays reused); with `vels`, velocities too.
    all(t, into = {}, vels) {
      const out = {};
      for (const num of Object.keys(this.cars)) {
        const o = into[num] || (into[num] = [0, 0, 0]);
        const v = vels ? vels[num] || (vels[num] = [0, 0, 0]) : null;
        if (this.at(num, t, o, v)) out[num] = o;
      }
      return out;
    }
  }

  // Keeps cars from passing through each other. Position data is ~4 Hz and good to a metre or two, so when
  // cars run side by side or one overtakes another, their recorded positions overlap. Cars are treated as
  // rectangles (length × width) aligned with their shared direction of travel; an overlapping pair is moved
  // apart by the smallest amount:
  //   side by side (sideways gap ≥ 0.9 m) → sideways, each keeping the side it is on (remembered per pair,
  //   so a pair doesn't swap sides from one frame to the next);
  //   nose to tail → along the track, keeping who's ahead.
  // cars: [{ id, x, z, hx, hz }] in metres with unit heading (hx, hz); returns { id: [dx, dz] } offsets.
  // `memory` (an object kept between calls) holds each pair's side.
  const CAR_LEN = 5.5, CAR_WID = 2.05;
  function separateCars(cars, memory = {}, iterations = 16, maxShift = 5) {
    const off = {}, P = cars.map((c) => ({ ...c, ox: 0, oz: 0 }));
    for (const c of P) off[c.id] = [0, 0];
    for (let it = 0; it < iterations; it++) {
      let moved = false;
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const a = P[i], b = P[j];
        const dx = b.x + b.ox - (a.x + a.ox), dz = b.z + b.oz - (a.z + a.oz);
        if (dx * dx + dz * dz > CAR_LEN * CAR_LEN + CAR_WID * CAR_WID) continue;
        let hx = a.hx + b.hx, hz = a.hz + b.hz, hl = Math.hypot(hx, hz);
        if (hl < 0.5) { hx = a.hx; hz = a.hz; hl = 1; }            // facing opposite ways (a spin): use one of them
        hx /= hl; hz /= hl;
        const along = dx * hx + dz * hz, side = dx * -hz + dz * hx;
        const pa = CAR_LEN - Math.abs(along), ps = CAR_WID - Math.abs(side);
        if (pa <= 0 || ps <= 0) continue;
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`, flip = a.id < b.id ? 1 : -1;
        if (Math.abs(side) >= 0.9 || (memory[key] && Math.abs(along) < CAR_LEN * 0.8)) {
          // side by side: keep the side each car is on
          let sgn = Math.sign(side) || 1;
          if (Math.abs(side) < 0.9 && memory[key]) sgn = memory[key] * flip; else memory[key] = sgn * flip;
          const m = (ps / 2) * sgn;
          a.ox -= -hz * m; a.oz -= hx * m; b.ox += -hz * m; b.oz += hx * m;
        } else {
          // nose to tail: keep the order
          const m = (pa / 2) * (Math.sign(along) || 1);
          a.ox -= hx * m; a.oz -= hz * m; b.ox += hx * m; b.oz += hz * m;
        }
        moved = true;
      }
      if (!moved) break;
    }
    // never move a car far from where the data puts it (a pile-up in the data is better left than invented)
    for (const c of P) { const l = Math.hypot(c.ox, c.oz), k = l > maxShift ? maxShift / l : 1; off[c.id] = [c.ox * k, c.oz * k]; }
    return off;
  }

  // Car positions at time t. Samples come every ~250 ms; a Catmull-Rom curve through them (instead of
  // straight lines) keeps speed and heading smooth between samples, so cars and the cameras following
  // them don't jerk four times a second. Falls back to straight lines at gaps (pit, garage, data holes).
  function interpolate(p, t) {
    if (!p.length) return {};
    let lo = 0, hi = p.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (p[mid][0] <= t) lo = mid; else hi = mid - 1; }
    const a = p[lo], b = p[Math.min(lo + 1, p.length - 1)];
    const f = b[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : 0;
    const a0 = p[Math.max(0, lo - 1)], b1 = p[Math.min(p.length - 1, lo + 2)];
    const out = {};
    for (const [num, A] of Object.entries(a[1])) {
      const B = b[1][num];
      if (!B) { out[num] = [A[0], A[1], A[2] || 0]; continue; }
      let P0 = a0[1][num], P3 = b1[1][num];
      const seg = Math.hypot(B[0] - A[0], B[1] - A[1]);
      // a big jump means a gap in the data: no curve through it
      if (!P0 || Math.hypot(A[0] - P0[0], A[1] - P0[1]) > seg * 3 + 200) P0 = [2 * A[0] - B[0], 2 * A[1] - B[1], 2 * (A[2] || 0) - (B[2] || 0)];
      if (!P3 || Math.hypot(P3[0] - B[0], P3[1] - B[1]) > seg * 3 + 200) P3 = [2 * B[0] - A[0], 2 * B[1] - A[1], 2 * (B[2] || 0) - (A[2] || 0)];
      const f2 = f * f, f3 = f2 * f;
      const cr = (q0, q1, q2, q3) => 0.5 * (2 * q1 + (q2 - q0) * f + (2 * q0 - 5 * q1 + 4 * q2 - q3) * f2 + (3 * q1 - q0 - 3 * q2 + q3) * f3);
      out[num] = [cr(P0[0], A[0], B[0], P3[0]), cr(P0[1], A[1], B[1], P3[1]), cr(P0[2] || 0, A[2] || 0, B[2] || 0, P3[2] || 0)];
    }
    return out;
  }

  // Outline of the circuit traced by the car that drove the furthest (in practice the car with the most
  // samples can be one parked in its garage all session).
  function outlineFrom(positions) {
    const dist = {}, last = {};
    for (const [, cars] of positions) for (const [n, p] of Object.entries(cars)) {
      const q = last[n];
      if (q) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d > 5 && d < 5000) dist[n] = (dist[n] || 0) + d; }
      last[n] = p;
    }
    const best = Object.entries(dist).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!best) return [];
    const pts = [];
    for (const [, cars] of positions) if (cars[best]) pts.push(cars[best]);
    return pts;
  }

  // One clean lap out of a car's position trace (which covers many laps, pit visits and the grid).
  // Tries start points across the trace, follows each until the car comes back to it, and keeps the
  // loop that took the fewest samples – the quickest lap, so no pit stop or safety car in it.
  function extractLap(pts) { return findLap(pts) || pts || []; }
  // The same, but null when the trace holds no complete lap yet.
  function findLap(pts) {
    if (!pts || pts.length < 60) return null;
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    // Typical distance between samples while moving (cars parked in the garage would drag this to zero).
    const moving = [];
    for (let i = 1; i < pts.length; i++) { const st = d(pts[i - 1], pts[i]); if (st > 5) moving.push(st); }
    if (moving.length < 50) return null;
    const med = moving.sort((a, b) => a - b)[Math.floor(moving.length / 2)];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const minLen = Math.hypot(maxX - minX, maxY - minY) * 1.5;      // a lap is well over the circuit's diagonal
    const close = med * 0.75 + 100;                                 // back within ~10 m of the start …
    const dir = (i) => { const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)]; const l = d(a, b) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    const tries = 120, stride = Math.max(1, Math.floor(pts.length / tries));
    let best = null;
    for (let s = 0; s < pts.length; s += stride) {
      if (s > 0 && d(pts[s - 1], pts[s]) < 5) continue;             // start only while the car is moving
      const ds = dir(s);
      let len = 0;
      for (let j = s + 1; j < pts.length; j++) {
        const step = d(pts[j - 1], pts[j]);
        if (step > med * 20 || step < 1) break;                     // data gap or the car stopped: not a flying lap
        len += step;
        if (len > minLen && d(pts[j], pts[s]) < close) {
          const dj = dir(j);
          if (ds[0] * dj[0] + ds[1] * dj[1] < 0.9) continue;        // … and heading the same way
          if (!best || j - s < best[1] - best[0]) best = [s, j];
          break;
        }
        if (best && j - s > (best[1] - best[0]) * 1.5) break;     // already slower than the best lap found
      }
    }
    return best ? pts.slice(best[0], best[1] + 1) : null;
  }

  // Live feed with an optional delay so the screen matches a delayed TV broadcast.
  class LiveSource {
    constructor() {
      this.isLive = true; this.state = {}; this.messages = []; this.stintEnd = {}; this.queue = []; this.delayMs = 0;
      this.skew = 0;        // server clock − this computer's clock (ms), from heartbeats
      this.epoch = 0;       // goes up whenever a full snapshot replaces the state (the UI resets its lists)
      this.held = null;     // when paused: the moment the pause began
      this.shownAt = -Infinity;      // receive time of the newest update applied (the screen never shows a moment before it)
      this.maxDelayMs = Infinity;    // the longest delay (and pause) the app supports; set by the app
      this.resetHistory(); this.t = Date.now();
    }
    resetHistory() {
      this.tracker = new LapTracker(); this.pitLog = new PitLog(); this.statusLog = new StatusLog();
      this.positions = []; this.lapMarks = []; this.trail = {}; this.lapShape = null; this.lapShapeAt = 0;
      this.tracks = new CarTracks();
      this.car = {};
    }
    // A full picture from the server (on connect and every reconnect). It goes through the delay queue
    // like every update, so reconnecting never shows the screen ahead of the TV.
    snapshot(snap, at = Date.now()) {
      for (const [topic, data] of Object.entries(snap)) this.noteRaw(topic, data, at);
      this.queue.push({ at, snap });
    }
    push(topic, data, immediate = false) {
      const item = { at: Date.now(), topic, data };
      this.noteRaw(topic, data, item.at);
      if (immediate) this.apply(item); else this.queue.push(item);
    }
    // Undelayed copies used to line the delay up with a TV broadcast, and the server clock offset.
    noteRaw(topic, data, at) {
      if (topic === "ExtrapolatedClock") this.rawClock = merge(this.rawClock, data);
      if (topic === "LapCount" && data.CurrentLap && data.CurrentLap !== this.rawLap?.lap) this.rawLap = { lap: data.CurrentLap, at };
      if (topic === "Heartbeat" && data.Utc) { const u = parseUtc(data.Utc); if (Number.isFinite(u)) this.skew = u - at; }
    }
    apply(item) {
      if (item.snap) {
        const key = item.snap.SessionInfo?.Key;
        if (key && this.state.SessionInfo?.Key && key !== this.state.SessionInfo.Key) this.resetHistory();
        this.state = {}; this.messages = []; this.stintEnd = {};
        for (const [topic, data] of Object.entries(item.snap)) this.applyOne(item.at, topic, data);
        this.epoch++;
        return;
      }
      this.applyOne(item.at, item.topic, item.data);
    }
    applyOne(at, topic, data) {
      if (topic === "SessionInfo" && data.Key && this.state.SessionInfo?.Key && data.Key !== this.state.SessionInfo.Key) {
        this.state = {}; this.messages = []; this.stintEnd = {}; this.resetHistory();
      }
      if (topic === "Position") {
        const list = data.Position || [];
        const last = list.length ? Date.parse(list[list.length - 1].Timestamp) : 0;
        for (const p of list) {
          const cars = {};
          for (const [n, e] of Object.entries(p.Entries || {})) {
            if (!(e.X || e.Y)) continue;
            cars[n] = [e.X, e.Y, e.Z || 0];
            // Longer per-car trail (only while moving) so the circuit can be traced once a full lap is in.
            const tr = this.trail[n] || (this.trail[n] = []), prev = tr[tr.length - 1];
            if (!prev || Math.hypot(prev[0] - e.X, prev[1] - e.Y) > 5) { tr.push(cars[n]); if (tr.length > 6000) tr.splice(0, 1000); }
          }
          const ts = at - (last - Date.parse(p.Timestamp));
          this.positions.push([ts, cars]);
          for (const [n, q] of Object.entries(cars)) this.tracks.push(n, ts, q);
        }
        this.tracks.trim(at - 120e3);
        const cutoff = at - 120e3;   // keep two minutes of samples
        while (this.positions.length && this.positions[0][0] < cutoff) this.positions.shift();
        return;
      }
      if (topic === "CarData") {
        // keep about four minutes (two laps or so) per car
        const list = data.Entries || [];
        const last = list.length ? Date.parse(list[list.length - 1].Utc) : 0;
        for (const e of list) {
          const t = at - (last - Date.parse(e.Utc));
          for (const [n, car] of Object.entries(e.Cars || {})) {
            const ch = car.Channels || {}, c = this.car[n] || (this.car[n] = { t: [], v: [], rpm: [], gear: [], thr: [], brk: [], drs: [] });
            if (c.t.length && t <= c.t[c.t.length - 1]) continue;
            c.t.push(t); c.v.push(ch[2] || 0); c.rpm.push(ch[0] || 0); c.gear.push(ch[3] || 0); c.thr.push(ch[4] || 0); c.brk.push(ch[5] ? 1 : 0); c.drs.push(ch[45] || 0);
            if (c.t.length > 1400) for (const k of Object.keys(c)) c[k].splice(0, 200);
          }
        }
        return;
      }
      if (topic === "TimingData") this.tracker.feed(at, data.Lines);
      this.pitLog.feed(at, topic, data); this.statusLog.feed(at, topic, data);
      if (topic === "LapCount" && data.CurrentLap) this.lapMarks.push([at, data.CurrentLap]);
      applyTo(this, topic, data);
    }
    // Apply everything older than the chosen delay. While paused nothing moves.
    // Applied updates can't be taken back (the live state isn't rewound), so when the delay is raised the clock
    // holds at the moment already shown until the delayed time passes it – like pausing for the extra seconds –
    // instead of going back with the standings left ahead. A pause longer than the longest supported delay moves
    // on at that delay (what resuming would give anyway), so the queue never holds more than that.
    tick(now = Date.now()) {
      const due = this.held != null ? now - this.maxDelayMs : now - this.delayMs;
      let k = 0;
      while (k < this.queue.length && this.queue[k].at <= due) { const item = this.queue[k++]; this.apply(item); if (item.at > this.shownAt) this.shownAt = item.at; }
      if (k) this.queue.splice(0, k);   // (one splice per tick: shift() per item is slow on a long queue)
      if (this.held != null) { if (k) this.t = Math.max(this.t, due); return; }
      this.t = Math.max(due, this.shownAt);
    }
    // Pause / resume (e.g. when the TV stream is paused): resuming adds the paused time to the delay.
    pause(now = Date.now()) { if (this.held == null) this.held = now; }
    resume(now = Date.now()) {
      if (this.held == null) return 0;
      const extra = now - this.held; this.held = null; this.delayMs += extra;
      return extra;
    }
    get paused() { return this.held != null; }
    // Milliseconds until the first data shows up (the snapshot is still waiting out the delay), else 0.
    waitingMs(now = Date.now()) {
      if (this.state.DriverList || !this.queue.length) return 0;
      const first = this.queue.find((x) => x.snap) || this.queue[0];
      return Math.max(0, first.at + this.delayMs - now);
    }
    // Session time remaining right now, without the broadcast delay.
    remainingNow(now = Date.now()) {
      const c = this.rawClock, rem = clockMs(c?.Remaining);
      if (rem == null) return null;
      return c.Extrapolating ? rem - (now + this.skew - parseUtc(c.Utc)) : rem;
    }
    // Delay (s) that makes our clock match the one on TV, e.g. "23:45" read off the broadcast.
    delayFromTvClock(tv, now = Date.now()) {
      const tvMs = clockMs(tv), ours = this.remainingNow(now);
      if (tvMs == null || ours == null || !this.rawClock?.Extrapolating) return null;
      return Math.round((tvMs - ours) / 1000);
    }
    // Delay (s) from pressing a button the moment the TV shows the leader starting a new lap.
    delayFromLapPress(now = Date.now()) {
      return this.rawLap ? Math.round((now - this.rawLap.at) / 1000) : null;
    }
    now() { return this.t; }
    // Live stream time is this computer's clock; UTC is the server's.
    utcAt(t = this.t) { return t + this.skew; }
    msAt(utc) { return utc - this.skew; }
    // a small lag so we interpolate between real samples
    positionsAt(t = this.t) { return this.tracks.all(t - 600); }
    positionsInto(t, into, vels) { return this.tracks.all(t - 600, into, vels); }
    laps(num, t = this.t) { return this.tracker.laps(num, t); }
    raceLapAt(ms) { return lapAtMs(this.lapMarks, ms); }
    stints(num) { return stintsOf(this, num); }
    carAt(num, t = this.t) { return carAt(this.car[num], t); }
    lapTrace(num, lap) { return lapTrace(this, num, lap); }
    hasTelemetry() { return Object.keys(this.car).length > 0; }
    pits(num) { return this.tracker.pits(num, this.t); }
    pitStops(num) { return this.pitLog.list(num, this.t); }
    allPitStops() { return this.pitLog.all(this.t); }
    neutralPeriods() { return this.statusLog.periods(this.t); }
    // One clean lap from the car trails, once some car has driven a full lap (re-checked every 10 s).
    trackOutline(now = Date.now()) {
      if (this.lapShape?.length || now - this.lapShapeAt < 10e3) return this.lapShape || [];
      this.lapShapeAt = now;
      const cars = Object.values(this.trail).sort((a, b) => b.length - a.length).slice(0, 3);
      for (const tr of cars) { const lap = findLap(tr); if (lap) { this.lapShape = lap; break; } }
      return this.lapShape || [];
    }
  }

  const API = { Replay, LiveSource, CarTracks, LapTracker, PitLog, StatusLog, merge, toSec, clockMs, parseUtc, extractLap, findLap, outlineFrom,
    pitLoss, pitRejoin, gapSec, deletedLaps, separateCars, CAR_LEN, CAR_WID, carAt, carTrace, timeAtDistance, sampleAt };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.ReplayKit = API;
})(typeof window !== "undefined" ? window : globalThis);
