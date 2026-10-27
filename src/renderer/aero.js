// Wings that move (pure: no three.js) – what the 3D view's cars do with their wing flaps, by era, event, session and car.
//
// Two different things, kept apart:
//   DRS (2011–2025)   – the rear wing's upper flap opens; the car's telemetry says when (CarData channel 45: 10/12/14
//                       open, 8 eligible, 0/1 off). Shown as the data has it: measured.
//   Active aero (2026–) – both wings' movable flaps go from Corner Mode (closed, downforce) to Straight Mode (open, low
//                       drag) in zones the FIA marks per circuit. The feed sends NOTHING about it (no channel 45 or any
//                       other in its place – CarData 2026 has channels 0, 2, 3, 4, 5 only: checked in the cached Italian
//                       GP 2026 race), so every pose drawn is an ESTIMATE from the rules, the zones and the car's own
//                       speed and brake. Overtake Mode (2026) is electrical (extra deployment) – not the wings – and is
//                       not drawn at all.
// Every state here is a function of the session's time (and the car's place and telemetry at that time): a seek, a
// pause or another playback speed shows the same pose at once – no animation carried from frame to frame.
// Sources: docs in the comments of each table; research notes v0.44 (f1kr-work/v044/research/aero.md).

export const ERA = (season) => (!(season > 0) ? null : season >= 2026 ? "active" : season >= 2011 ? "drs" : "none");

// ---------- transition times ----------
// DRS: the flap opens within ~0.3–0.4 s of the button (an estimate from onboard footage – not measured); the feed's
// 4 Hz samples put the change somewhere within ~250 ms, so the movement starts at the first open sample.
// Active aero: the same order (an estimate; the FIA sets the positions and the triggers, not a speed the app can cite).
export const MOVE = { drsOpen: 0.35, drsClose: 0.3, open: 0.4, close: 0.3 };
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// an eased 0..1 (smoothstep) so a hinge starts and stops gently
export const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

// ---------- DRS (≤ 2025): from the telemetry's own samples ----------
// tel: { t: [...ms], drs: [...] } (replay.js car arrays; 255 = channel not sent). Returns { open 0..1, measured: true }
// or null (no channel / no data near t). The open fraction is the time since the sample that changed state, so the
// same t always gives the same pose (looked back at most `back` samples).
const isOpenCode = (v) => v >= 10 && v !== 255;
// (out: an object to fill and return – the 3D view passes one per car: no allocation per frame)
export function drsAt(tel, t, back = 160, out = {}) {
  if (!tel || !tel.t || !tel.t.length || !tel.drs) return null;
  const T = tel.t, D = tel.drs; let lo = 0, hi = T.length - 1;
  if (T[0] > t) return null;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= t) lo = m; else hi = m - 1; }
  const i = lo; if (t - T[i] > 3000 || D[i] === 255) return null;
  const open = isOpenCode(D[i]);
  // the start of this run of samples (open or shut)
  let j = i; for (let k = 0; k < back && j > 0 && isOpenCode(D[j - 1]) === open && D[j - 1] !== 255; k++) j--;
  const since = (t - T[j]) / 1000, runStartKnown = j > 0 && D[j - 1] !== 255;
  out.open = open ? (runStartKnown ? ease(since / MOVE.drsOpen) : 1) : runStartKnown ? 1 - ease(since / MOVE.drsClose) : 0;
  out.front = 0; out.measured = true; out.estimated = false; out.code = D[i]; out.why = "DRS (CarData channel 45)";
  return out;
}

// ---------- zones along the lap ----------
// A zone on the lap: [a, b] metres along the app's lap line (0 ≤ a, b < L); b < a is a zone across the line's start
// (wherever the lap line begins – often not the finish line). The tables give zones relative to the corners F1's
// circuit map numbers (corners.js cornerStations: each corner's s), so they follow the app's own lap line:
//   { from: [corner, metres after it], to: [corner, metres after it (− before)] }.
export const wrapS = (s, L) => ((s % L) + L) % L;
export function zoneSpans(zones, stations, L) {
  const at = (ref) => { const k = stations.find((q) => q.n === ref[0]); return k ? wrapS(k.s + ref[1], L) : null; };
  const out = [];
  for (const z of zones || []) { const a = at(z.from), b = at(z.to); if (a != null && b != null && a !== b) out.push({ a, b, len: wrapS(b - a, L), z }); }
  return out;
}
// The zone the place s is in → { span, into (m since its start), left (m to its end) }, else the one just behind it
// → { span, after (m past its end) } (within `behind` m), else null.
export function zoneAt(s, spans, L, behind = 400, out = {}) {
  s = wrapS(s, L); let best = null, bestAfter = Infinity;
  for (const sp of spans) {
    const into = wrapS(s - sp.a, L);
    if (into <= sp.len) { out.span = sp; out.into = into; out.left = sp.len - into; out.after = null; return out; }
    const after = wrapS(s - sp.b, L);
    if (after <= behind && after < bestAfter) { best = sp; bestAfter = after; }
  }
  if (!best) return null;
  out.span = best; out.into = null; out.left = null; out.after = bestAfter; return out;
}
// Estimated zones where no official ones are known: the lap line's long, nearly straight stretches (heading turning
// < `maxTurn` rad over any 100 m) of at least `minLen` m, from `startAfter` m into the stretch to `endBefore` m before
// its end (the braking for the next corner closes the flaps anyway – the car's brake telemetry). pts: [{ x, z }],
// cum (m), L. Marked estimated: a look, not the FIA's zones.
export function estimateZones(pts, cum, L, { maxTurn = 0.12, minLen = 450, startAfter = 40, endBefore = 60 } = {}) {
  const n = pts.length; if (n < 10) return [];
  const head = new Float64Array(n);
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; head[i] = Math.atan2(b.x - a.x, b.z - a.z); }
  // per sample: does the heading over the next 100 m stay within maxTurn?
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const straight = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let j = i, d = 0, lo = 0, hi = 0, acc = 0;
    while (d < 100 && j < i + n) { const k = j % n, k1 = (j + 1) % n; acc += wrapA(head[k1] - head[k]); lo = Math.min(lo, acc); hi = Math.max(hi, acc); d += k1 ? cum[k1] - cum[k] : L - cum[k]; j++; }
    straight[i] = hi - lo < maxTurn ? 1 : 0;
  }
  if (straight.every((v) => v)) return [];
  // runs of straight samples (cyclic): start at a non-straight sample
  let i0 = straight.indexOf(0); const out = [];
  for (let k = 1; k <= n; k++) {
    const i = (i0 + k) % n; if (!straight[i]) continue;
    let j = i, len = 0; while (straight[(j + 1) % n] && len < L) { const a = j % n, b = (j + 1) % n; len += b ? cum[b] - cum[a] : L - cum[a]; j++; k++; }
    len += 100;   // (the last straight sample looks 100 m on)
    if (len >= minLen) out.push({ a: wrapS(cum[i] + startAfter, L), b: wrapS(cum[i] + len - endBefore, L), len: len - startAfter - endBefore, estimated: true });
  }
  return out;
}

// ---------- 2026 active aero: the estimated state at t ----------
// in: { allowed (the event / session lets the cars use Straight Mode at all – not locked, the viewer's setting on),
//       spans, L, s (the car's place on the lap line, m), speed (km/h now), tel ({ t, v, brk } arrays or null), t (ms),
//       onTrack (false: the pit lane, a car placed without positions, off the lap line), racing (false: before the
//       race's start), startGate (the race's lights-out time: Straight Mode only once past Turn 1 – see below), t1 (the
//       zone end that is Turn 1's braking, s m), mode ("normal" | "low" | "disabled": race control's word, smModeOf),
//       hist (v0.45: the car's position history – smooth.js track coordinates { t, s (m, continuous within a run), run
//       (0 off the lap line) } – t is a time on ITS clock), lag (the telemetry's stamp minus the positions', ms:
//       smooth.js telemetryLag), now (live: the newest moment received – no telemetry later than it is read) }
// Not applied, as nothing citable says so: Safety Car / VSC (B7.1 Issue 07 has no rule for them – the slow speed then
// keeps most cars under ACTIVE.minSpeed anyway), yellow flags.
// → { open 0..1, estimated: true, why, tEntry (the zone's entry, ms), entryKnown }. Open from the zone's start while
// the car is at speed; closed again – over MOVE.close – at the first touch of the brake after the zone's start or at its
// end, whichever comes first, and then shut for the rest of that pass of the zone (until the next zone's start).
// The policy, and what it rests on (checked 2026-10-27):
//   - FIA 2026 F1 Sporting Regulations Section B Issue 07 (2026-06-25) B7.1.1 / B7.1.2: the driver activates, only in
//     the published Activation Zones, only when the Control Electronics say it is enabled; low grip: partial only.
//     Nothing there on how it ends or on activating again within a zone.
//   - Technical Regulations Section C Issue 20 (2026-08-05): "State of Deployment" (C1 definitions) starts on "direct
//     driver input" and ends when the bodywork is back in Corner Mode "having been disabled by the FIA Standard ECU";
//     C3.10.10 (w) / C3.11.6: deployed only fully inside an Activation Zone; C8.2.1: the ECU and its software are the
//     FIA's (FIA-F1-DOC-033 – not public). So the regulations leave the trigger to the ECU's (unpublished) software.
//   - Press (not the FIA): Corner Mode comes back when the driver brakes (The Race; Red Bull's 2026 explainer;
//     silverstone.co.uk 2026 "brakes or lifts off the throttle"). No source found says Straight Mode can be activated
//     again in the same zone after it closed, nor that it can't. 2011–2025 DRS (2025 Sporting Regulations Art. 22.1
//     (e)): "disabled the first time the driver brakes after activating" – no re-activation in that zone.
//   So: one activation per pass, ended by the first brake after it in THAT pass (or the zone's end) – confidence M. Not
//   a timer: the pass is the car's own crossing of the zone's start, from its position history.
// The entry: the time this pass crossed the zone's start in `hist` (binary search in the current run, bridged over a
// gap of ≤ ENTRY.bridge ms that split the run). Without a crossing in the data (the data begins in the zone: a replay
// or a live connection starting there, a car rejoining from the pit exit inside a zone, a longer gap) the entry is not
// known: the first sample of the history is taken instead (entryKnown false, labelled in `why`) – the brake is looked
// for from there, nothing earlier is assumed. Without `hist` at all (the old input): t − (metres in) / (speed now) – an
// approximation kept for callers without positions only.
// The brake: the telemetry's (CarData channel 5) samples from the entry to t (on the telemetry's clock: + lag), never
// later than `now`; the corner's braking carried across the zone's start delays the activation to its release
// (passBrakes) – the first brake after that ends it.
export const ACTIVE = { minSpeed: 100 };   // km/h – below it the flaps are drawn shut (an estimate: a crawling car, the formation)
export const ENTRY = { bridge: 15000 };    // ms – a hole in the positions bridged when looking for the entry (4 s and more split a run: smooth.js)
// This pass's brake samples over [t0, t1] (the telemetry's clock): PB.act – when Straight Mode is taken as activated
// (t0; or, when the car is braking across the zone's start – the corner's braking still on as it crosses the line,
// the sample before t0 within 1 s braking too – its first sample off the brake after it; null: still braking from
// before), PB.brake – the first brake sample after that (null: none). "After activating", as the 2025 DRS rule said
// (Sporting Regulations 2025 Art. 22.1 (e)): a brake before the driver could activate is not the one that ends it.
const PB = { act: null, brake: null };
function passBrakes(tel, t0, t1) {
  PB.act = t0; PB.brake = null;
  if (!tel || !tel.t || !tel.brk) return PB;
  const T = tel.t, B = tel.brk; let lo = 0, hi = T.length - 1;
  if (hi < 0 || T[hi] < t0) return PB;
  while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] < t0) lo = m + 1; else hi = m; }
  let i = lo;
  if (i > 0 && B[i - 1] && i < T.length && B[i] && T[i] - T[i - 1] <= 1000) {
    while (i < T.length && T[i] <= t1 && B[i]) i++;
    if (i >= T.length || T[i] > t1) { PB.act = null; return PB; }
    PB.act = T[i];
  }
  for (; i < T.length && T[i] <= t1; i++) if (B[i] && realBrake(tel, i, t1)) { PB.brake = T[i]; break; }
  return PB;
}
// A brake sample that counts: the next sample braking too, or the speed falling ≥ BRAKE.fall km/h within BRAKE.ms after
// it, or no speed channel to tell (the sample stands). A lone sample with the speed level or rising is taken as a flicker
// of the channel or a touch that didn't slow the car, not the brake that ends Straight Mode – v0.45, the user's call
// after car 10 (Italian GP 2026, A3): one sample at 188 km/h while accelerating (188 → 188 → 192 …) shut a 300+ km/h
// zone (estimate, L: the F1 brake channel is on/off at ~4 Hz, no published debounce). Only samples up to t1 are read, so
// a lone newest sample waits for the next one (live never looks ahead; replay reads the same data at the same t).
export const BRAKE = { fall: 3, ms: 1000 };
function realBrake(tel, i, t1) {
  const T = tel.t, B = tel.brk, V = tel.v;
  if (i + 1 < T.length && T[i + 1] <= t1 && B[i + 1]) return true;
  if (!V || V.length !== T.length) return true;
  for (let j = i + 1; j < T.length && T[j] <= t1 && T[j] - T[i] <= BRAKE.ms; j++) if (V[j] <= V[i] - BRAKE.fall) return true;
  return false;
}
// the history's index at t: the last sample at or before t (−1: none)
function histIndex(H, t) {
  const T = H.t, n = T.length; if (!n || T[0] > t) return -1;
  let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= t) lo = m; else hi = m - 1; }
  return lo;
}
// the first index of the run that index i is in – cached per history array and run (a live rebuild makes new arrays,
// so a stale entry is never used; the same result as the scan, which runs once per run)
const RUN0 = new WeakMap();
function runStart(H, i) {
  let m = RUN0.get(H.run); if (!m) RUN0.set(H.run, (m = new Map()));
  const r = H.run[i]; let k = m.get(r);
  if (k == null || k > i || H.run[k] !== r) { k = i; while (k > 0 && H.run[k - 1] === r) k--; m.set(r, k); }
  return k;
}
// When the car passed `target` (m, on run i's s) – at or before t, where it is at sNow (run i's s). Sets CROSS.t (ms)
// and CROSS.known (false: not in the data – CROSS.t is then the earliest sample searched).
const CROSS = { t: 0, known: false };
function crossTime(H, i, t, sNow, target, L) {
  const T = H.t, S = H.s;
  let hiT = t, hiS = sNow, shift = 0;
  for (let hop = 0; hop < 4; hop++) {
    const lo = runStart(H, i);
    if (S[lo] + shift <= target) {
      // the last sample of the run at or below the target (the s of a run goes forward: smooth.js speed-integrated)
      let a = lo, b = i; while (a < b) { const m = (a + b + 1) >> 1; if (S[m] + shift <= target) a = m; else b = m - 1; }
      const t0 = T[a], s0 = S[a] + shift, t1 = a < i ? T[a + 1] : hiT, s1 = a < i ? S[a + 1] + shift : hiS;
      CROSS.t = s1 > s0 ? t0 + ((target - s0) / (s1 - s0)) * (t1 - t0) : t0; CROSS.known = true; return CROSS;
    }
    // before this run: across a hole in the positions to the run before, if it's short and that run is on the lap
    const p = lo - 1;
    if (p < 0 || !H.run[p] || T[lo] - T[p] > ENTRY.bridge) break;
    const ds = wrapS(S[lo] - S[p], L); if (ds > L / 2) break;
    const sh = S[lo] + shift - ds - S[p];   // the earlier run's s → this one's
    if (S[p] + sh < target) { CROSS.t = T[p] + ((target - S[p] - sh) / ds) * (T[lo] - T[p]); CROSS.known = true; return CROSS; }
    hiT = T[lo]; hiS = S[p] + sh + ds; shift = sh; i = p;   // (the earlier run's last sample, then the hole up to this run)
  }
  CROSS.t = T[runStart(H, i)]; CROSS.known = false; return CROSS;
}
const ZTMP = {};
export function activeAeroAt(inp, out = {}) {
  out.measured = false; out.estimated = true; out.code = null; out.tEntry = null; out.entryKnown = null;
  const shut = (why) => { out.open = 0; out.front = 0; out.why = why; return out; };
  if (!inp || !inp.allowed) return shut("not allowed");
  if (!inp.onTrack) return shut("off the lap (pit lane / no position)");
  if (inp.racing === false) return shut("not racing");
  if (inp.mode === "disabled") return shut("disabled by race control");
  if (!inp.spans?.length || !(inp.L > 0) || inp.s == null) return shut("no zone");
  const z = zoneAt(inp.s, inp.spans, inp.L, 400, ZTMP);
  const v = Math.max(1, (inp.speed || 0) / 3.6), t = inp.t, L = inp.L;
  if (!z) return shut("outside the zones");
  if (inp.mode === "low" && z.span.z?.low === false) return shut("no low-grip zone here");
  const inZone = z.into != null;
  let tStart, tEnd, known = true;
  const H = inp.hist, hi = H && H.t && H.run ? histIndex(H, t) : -1;
  if (hi >= 0 && H.run[hi]) {
    // the place on the run's own s (the drawn s, unwrapped next to the history's last sample at or before t – nothing
    // later is read: live has nothing later)
    let sNow = H.s[hi] + wrapS(inp.s - H.s[hi], L); if (sNow - H.s[hi] > L / 2) sNow -= L;
    const c = crossTime(H, hi, t, sNow, sNow - (inZone ? z.into : z.span.len + z.after), L); tStart = c.t; known = c.known;
    if (!inZone) { const e = crossTime(H, hi, t, sNow, sNow - z.after, L); if (!e.known) return shut("zone end"); tEnd = e.t; }   // (past the zone's end: shut once there)
  } else {
    // (no history: from the car's speed now – an approximation, kept for callers without positions)
    tStart = t - ((inZone ? z.into : z.span.len + z.after) / v) * 1000; tEnd = inZone ? null : t - (z.after / v) * 1000;
  }
  out.tEntry = tStart; out.entryKnown = known;
  if (inZone && (inp.speed || 0) < ACTIVE.minSpeed) return shut("slow");
  // (after a standing start Straight Mode is enabled only once past Turn 1 – FIA Race Director's competition notes 2026,
  // e.g. Japanese GP item 9: the zone that ends at T1, entered before or just after lights out, stays shut)
  if (inp.startGate != null && z.span.z?.t1 && tStart < inp.startGate + 20000 && t >= inp.startGate - 60000) return shut("start: not past Turn 1 yet");
  // the brake of this pass, on the telemetry's clock (lag) and never past `now`
  const lag = inp.hist ? inp.lag || 0 : 0, tTo = Math.min(t + lag, inp.now ?? Infinity);
  const pb = passBrakes(inp.tel, tStart + lag, tTo);
  if (pb.act == null) return shut("braking (not yet activated)");
  const tAct = pb.act - lag, tb = pb.brake == null ? null : pb.brake - lag;
  if (tEnd != null && tAct >= tEnd) return shut("zone end");
  let trigger = tb != null ? tb : tEnd;
  if (tEnd != null && tb != null && tb > tEnd) trigger = tEnd;
  const k = trigger == null ? ease((t - tAct) / 1000 / MOVE.open) : ease((trigger - tAct) / 1000 / MOVE.open) * (1 - ease((t - trigger) / 1000 / MOVE.close));
  const why = trigger == null ? (known ? "straight mode (estimated)" : "straight mode (estimated; zone entry not in the data – from its first sample)") : tb != null && tb === trigger ? "braking" : "zone end";
  // (low grip: the front wing alone – B7.1.1 / B7.1.2 (b), Issue 07: "partially activated")
  out.open = inp.mode === "low" ? 0 : k; out.front = k; out.why = why; return out;
}

// ---------- the mechanisms: which parts move, about what, how far ----------
// rw.at: the rear flap's hinge as a fraction of the flap's length along the car at Y 50 (0 its leading edge, 1 its
// trailing edge), inside the flap's section there; rw.angle: rad about +X (the car's left; negative lifts the leading
// edge – less incidence). fw.primary / fw.secondary (2026): rad about each half's own axis (negative: less incidence).
// conf: H / M / L; kind: "regulation" (a place or limit the rules fix), "estimate" (an angle the app chose within them),
// "photo-estimate". The rules fix WHERE a hinge may be and that the move lowers incidence – not by how much: the
// angles are the app's estimates (labelled).
export const ERA_SPECS = {
  // 2025 Technical Regulations Issue 03 (7 Apr 2025), Art. 3.10.10: the DRS flap about a fixed axis ≤ 20 mm under the
  // top and ≤ 20 mm ahead of the rear of RV-RW-PROFILES (so at its trailing edge); the slot gap ≤ 85 mm open (g); < 400 ms
  drs: { id: "drs", rw: { at: 0.93, angle: -0.38 }, fw: null,
    src: "FIA 2025 F1 Technical Regulations Issue 03 (2025-04-07) Art. 3.10.10 (a) (b) (g)", conf: "H (hinge) / M (angle: the 85 mm gap)", kind: "regulation" },
  // 2026 Technical Regulations Section C Issue 17 (28 Apr 2026): C3.11.6 (b) the RW Flap's axis along Y, at Y 50 between
  // the flap's mid-point and its rearmost point and hidden by it from below; (c) Straight Mode lowers its incidence by a
  // fixed amount; (d) ≤ 400 ms. C3.10.10: the front flaps about axes by their leading edges (≤ 25 mm), (n) Straight Mode
  // lowers the incidence of the primary and/or secondary flap, (o) ≤ 400 ms. The generic car: the hinge at ¾ of the
  // flap, both rear flaps turned ~23° (about level – "flattens into one flat wing", motorsport.com 2026), the front
  // primary flaps (both flaps behind the main plane) ~14°, the secondary not on its own (estimates: no figures published;
  // the rules allow "primary and/or secondary", C3.10.10 (n) (ii))
  active: { id: "active-generic", rw: { at: 0.75, angle: -0.4 }, fw: { primary: -0.25, secondary: 0 },
    src: "FIA 2026 F1 Technical Regulations Section C Issue 17 (2026-04-28) C3.10.10, C3.11.6", conf: "H (hinge, which parts) / L (angles)", kind: "regulation + estimate" },
};
// Team mechanisms that differ from the generic one, from the event they were first RUN (bringing a part is not running
// it) to the event they were last seen (until: the day after, exclusive). Research: v044/research/aero.md.
// Angles: the rules set none (C3.11.6 (c): only "a decrease in incidence", always the same); the reports differ –
// Ferrari 180° (F1.com 2 May 2026: "flips completely upside down"), > 200° (F1Technical), 270° (The Race 9 Oct 2026); a
// 270° turn from a flap ~20° off level would leave it near upright – not a low-drag pose –, so the app draws F1.com's
// 180°. Red Bull / McLaren 150–160° (The Race 9 Oct 2026), "just under 180°" (McLaren, RacingNews365 6 Sep 2026): 160°.
// Directions (M–L: the reports use "up and over" for both): Ferrari's leading edge up and back over the top ("front to
// back", The Race 10 May 2026) – negative; Red Bull's / McLaren's leading edge down, the trailing edge up and forward
// over the top (a link from a central actuator pushes the leading edge back – The Race 10 May, RacingNews365 6 Sep
// 2026) – positive, the inverted element standing above the endplates (F1.com 2 May 2026). The hinge: Ferrari "a
// central pivot between the two upper elements" (PlanetF1 19 Feb 2026) – 0.6 of the flap; the others not reported –
// the generic ¾ (inside the rules' back half). Main plane and endplates fixed in every design (all sources).
const RB_ROT = { at: 0.75, angle: 2.79 }, FERRARI_ROT = { at: 0.6, angle: -Math.PI };
export const TEAM_SPECS = [
  // Ferrari: Bahrain test day 2; not in Australia; China FP1 only (Friday – its date can't tell FP1 from Sprint
  // Qualifying, so not drawn there); raced from Miami (2026-05-01 on, Sprint Qualifying included) and on the car since
  // (PlanetF1 23 Jul, GPBlog Aug, The Race 9 Oct); a revised one (stacked mini-winglets) from Hungary – not modelled.
  // Monza 2026: probably on – not confirmed by any source found (M)
  { season: 2026, team: /ferrari/i, id: "ferrari-rotating", from: "2026-05-01", rw: FERRARI_ROT, conf: "M (dates H to Miami; Monza and later unconfirmed; angle 180–270° reported)", kind: "press / photo-estimate",
    src: "formula1.com 2026-05-02 (upside-down wings compare), 2026-05-13 (Tech Weekly, Miami); PlanetF1 2026-02-19; The Race 2026-05-10, 2026-10-09" },
  // Red Bull: first seen at a Silverstone filming day (22 Apr); raced from Miami FP1; back to the "more standard
  // arrangement" at Spa (F1.com 17 Jul 2026) after the Austria Q3 and Silverstone failures
  { season: 2026, team: /red bull racing/i, id: "redbull-rotating", from: "2026-05-01", until: "2026-07-17", rw: RB_ROT, conf: "H (dates) / M–L (direction, angle)", kind: "press / photo-estimate",
    src: "formula1.com 2026-05-02, 2026-05-13, 2026-07-17; The Race 2026-05-10, 2026-10-09" },
  // … and from Hungary, as Verstappen said it would be back (PlanetF1 24 Jul 2026) – its use there and since (Monza
  // included) NOT confirmed: low confidence
  { season: 2026, team: /red bull racing/i, id: "redbull-rotating", from: "2026-07-24", rw: RB_ROT, conf: "L (announced back for Hungary; later running unconfirmed)", kind: "press (announcement)",
    src: "PlanetF1 2026-07-24; The Race 2026-10-09 ('modified to continue racing')" },
  // McLaren's "H-wing": brought to Austria but never run (F1.com 30 Jun 2026); Hungary FP1 only (Norris – not drawn: the
  // date can't tell FP1 from FP2); Monza: Norris in FP1, both cars from FP2, raced (RacingNews365 4/6 Sep, Crash.net
  // 4 Sep 2026). After Monza: nothing found – the generic wing
  { season: 2026, team: /mclaren/i, id: "mclaren-hwing", from: "2026-09-04", until: "2026-09-05", drivers: ["4"], rw: RB_ROT, conf: "H (Monza use) / M–L (motion)", kind: "press",
    src: "formula1.com 2026-06-30; RacingNews365 2026-09-04, 2026-09-06; Crash.net 2026-09-04" },
  { season: 2026, team: /mclaren/i, id: "mclaren-hwing", from: "2026-09-05", until: "2026-09-07", rw: RB_ROT, conf: "H (Monza use) / M–L (motion)", kind: "press",
    src: "formula1.com 2026-06-30; RacingNews365 2026-09-04, 2026-09-06; Crash.net 2026-09-04" },
  // (Alpine's "reverse-opening" wing whose two flaps "collapse" – R1–R3 and Monza (Autosport 6 Sep 2026): how it moves
  // is not described well enough to draw – the generic wing; Audi, Racing Bulls: unconfirmed – generic)
];
// The car's mechanism: season, team, the session's local date (YYYY-MM-DD) → a spec (never null)
export function aeroSpecFor(season, teamName, date = null, list = TEAM_SPECS, number = null) {
  const era = ERA(+season);
  if (era !== "active") return { ...ERA_SPECS.drs, fw: { primary: 0, secondary: 0 } };
  const d = typeof date === "string" && /^\d{4}-\d\d-\d\d/.test(date) ? date.slice(0, 10) : null;
  // (a team's own design only with a date inside its span: without a date the generic one – never a later design on an
  // earlier race)
  const own = d ? list.find((x) => x.season === +season && x.team.test(teamName || "") && (!x.from || d >= x.from) && (!x.until || d < x.until) && (!x.drivers || x.drivers.includes(String(number)))) : null;
  return own ? { ...ERA_SPECS.active, ...own, rw: { ...ERA_SPECS.active.rw, ...own.rw }, fw: { ...ERA_SPECS.active.fw, ...(own.fw || {}) } } : ERA_SPECS.active;
}
// The hinge (y, z) in a flap's section at Y 50 ([y, z] points, both elements'): at fraction f of its length along the car
// from its leading edge (largest z) to its trailing edge (smallest z), half way through the material there.
export function hingeOf(section, f) {
  let zMax = -Infinity, zMin = Infinity; for (const [, z] of section) { if (z > zMax) zMax = z; if (z < zMin) zMin = z; }
  const zh = zMax + (zMin - zMax) * f;
  // the section's points near that z (within 1.5 cm; the nearest few otherwise)
  let near = section.filter(([, z]) => Math.abs(z - zh) < 0.015);
  if (near.length < 2) near = [...section].sort((a, b) => Math.abs(a[1] - zh) - Math.abs(b[1] - zh)).slice(0, 3);
  const ys = near.map(([y]) => y);
  return [(Math.min(...ys) + Math.max(...ys)) / 2, zh];
}

// ---------- events: zones, locks, race control ----------
// Straight Mode zones per venue and season, from the FIA's event documents (2026: the "Power Unit Information" circuit
// maps – red "SM A#" the start of a zone, its stripe running to the next corner's braking; the Canadian "Circuit Map V3"
// with written distances). Where they start is given from a corner (F1's map numbers, the FIA's), in metres after it;
// where they end, metres before the next corner (the maps: "just before the braking zone" – the app's estimate of how
// far, the car's own brake closing the flaps anyway). t1: the zone that ends at Turn 1 (the start rule); low: false –
// no low-grip zone there. conf: H the zones and their corners, M the metres (read off image maps), H where written.
// Zones that are not here: the estimated straights (estimateZones), labelled.
export const ZONES = [
  { venue: 39, season: 2026, conf: "zones H, metres M", src: "FIA Italian GP 2026 Power Unit Information (doc 8, 2026-09-03) map; PlanetF1 2026-09-04", zones: [
    { id: "A1", from: [11, 120], to: [1, -150], t1: true }, { id: "A2", from: [3, 150], to: [4, -140] },
    { id: "A3", from: [7, 60], to: [8, -130] }, { id: "A4", from: [10, 60], to: [11, -110] }] },
  { venue: 23, season: 2026, conf: "starts H (written), ends M", src: "FIA Canadian GP 2026 Competition Notes – Circuit Map V3 (2026-05-22)", zones: [
    { id: "A1", from: [14, 100], to: [1, -110], t1: true }, { id: "A2", from: [7, 50], to: [8, -100] },
    { id: "A3", from: [9, 60], to: [10, -110], low: false }, { id: "A4", from: [11, 30], to: [13, -130] }] },
  { venue: 2, season: 2026, conf: "zones H, metres M", src: "FIA British GP 2026 Power Unit Information map (2026-07-02); Williams 2026-07-01 (A3 dry only)", zones: [
    { id: "A1", from: [18, 60], to: [1, -100], t1: true }, { id: "A2", from: [5, 60], to: [6, -100] },
    { id: "A3", from: [7, 60], to: [9, -110], low: false }, { id: "A4", from: [14, 60], to: [15, -110] }] },
  { venue: 46, season: 2026, conf: "zones H, metres M", src: "FIA Japanese GP 2026 Power Unit Information map (2026-03-26); PlanetF1 2026-03-25", zones: [
    { id: "A1", from: [18, 60], to: [1, -120], t1: true }, { id: "A2", from: [14, 60], to: [15, -120] }] },
  { venue: 55, season: 2026, conf: "zones M (PlanetF1's description), metres L", src: "PlanetF1 2026-08-20 (Dutch GP preview)", zones: [
    { id: "A1", from: [14, 80], to: [1, -120], t1: true }, { id: "A2", from: [10, 50], to: [11, -100] }] },
];
export function zonesFor(venueKey, season, date = null, list = ZONES) { return list.find((x) => x.venue === venueKey && x.season === +season) || null; }
// Events where Straight Mode is not used at all: Monaco 2026 – "effectively locked in Corner Mode for the entire Monte
// Carlo weekend" (formula1.com, 4 June 2026); no zones on the FIA's map (Power Unit Information, 3 June 2026)
export const LOCKS = [{ venue: 22, season: 2026, src: "formula1.com 2026-06-04; FIA Monaco GP 2026 Power Unit Information map" }];
export function aeroLock(venueKey, season, date = null, list = LOCKS) { return list.some((x) => x.venue === venueKey && x.season === +season && (!x.from || !date || date >= x.from) && (!x.until || !date || date < x.until)); }
// Race control's word on Straight Mode up to now (messages: the session's race-control messages so far, in order):
// "STRAIGHT MODE - DISABLED" / "- LOW GRIP" (B7.1.2 (b): the front wing only) / "- NORMAL GRIP". Seen in the 2026
// pre-season tests' records (Bahrain, 12/13/20 Feb 2026); none in the cached 2026 races so far – "normal" then.
export function smModeOf(messages) {
  for (let i = (messages?.length || 0) - 1; i >= 0; i--) {
    const m = /^STRAIGHT MODE\s*-\s*(DISABLED|LOW GRIP|NORMAL GRIP)/i.exec(messages[i]?.Message || "");
    if (m) return m[1].toUpperCase() === "DISABLED" ? "disabled" : m[1].toUpperCase() === "LOW GRIP" ? "low" : "normal";
  }
  return "normal";
}
