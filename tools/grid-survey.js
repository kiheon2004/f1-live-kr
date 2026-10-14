// Development tool (not shipped): measures each circuit's starting grid and pit lane from race data, in F1's own
// position coordinates (decimetres – the system the live feed and every session at a circuit share), and writes
// src/renderer/startdata.js: the fixed grid and pit-lane geometry the 3D view uses when a session doesn't show its
// own standing grid (Monaco 2026: the feed has no positions from 27 minutes before the start to a few seconds after).
//
//   node tools/grid-survey.js <cacheDir> [<cacheDir> …] [--write] [--only <substring>]
//
// Grid, per race or sprint: the moment the field stands before lights out (cars with a grid position still for 3 s,
// 1.5 s before the race clock starts – or later, when the start was delayed), each car's distance along one lap of the
// reference line (the feed snaps cars to it), the grid fitted (grid.js fitGrid: the rules' 8 m pitch, pole's place as
// the median) and pole's point and the direction of travel there.
// Pit lane, per race: every pass through it (TimingData InPit) – the car's positions from where they leave the lap
// line to where they join it again (the feed snaps pit-lane positions to a line of its own), the speed limit and where
// the limiter goes on and off (CarData speed), where cars stood (pit stops), and cars waiting there at the start.
const fs = require("node:fs");
const path = require("node:path");
const { Archive } = require("../src/main/archive.js");
const RK = require("../src/renderer/replay.js");

const args = process.argv.slice(2), WRITE = args.includes("--write");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const caches = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--only");

// a polyline (feed dm) as a lap: arc length, projection, point and direction at s (metres)
function lapLine(pts) {
  const P = pts.map((p) => [p[0] / 10, p[1] / 10]), n = P.length, cum = [0];
  for (let i = 1; i <= n; i++) { const a = P[i - 1], b = P[i % n]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = cum[n];
  const project = (x, y) => {
    let best = null;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)), qx = a[0] + dx * t, qy = a[1] + dy * t, d = Math.hypot(x - qx, y - qy);
      if (!best || d < best.d) best = { s: cum[i] + t * Math.sqrt(l2), d, i, side: Math.sign(dx * (y - a[1]) - dy * (x - a[0])) };
    }
    return best;
  };
  const at = (s) => {
    const u = ((s % L) + L) % L; let i = 0; while (cum[i + 1] < u) i++;
    const a = P[i], b = P[(i + 1) % n], l = cum[i + 1] - cum[i] || 1, t = (u - cum[i]) / l;
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t };
  };
  // the direction over ±10 m (the reference line is made of short straight pieces)
  const dirAt = (s) => { const a = at(s - 10), b = at(s + 10), l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return [(b.x - a.x) / l, (b.y - a.y) / l]; };
  return { L, project, at, dirAt };
}
const median = (a) => { const b = [...a].sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[n >> 1] : (b[n / 2 - 1] + b[n / 2]) / 2) : NaN; };
const R = (v) => Math.round(v);

// a pass through the pit lane: from the last on-line sample before the car leaves the lap line to the first one back
function pitPasses(r, line) {
  const passes = [];
  for (const [num, c] of Object.entries(r.tracks.cars)) {
    const ins = r.tracker.pits(num);
    for (const { ms } of ins) {
      let k0 = 0; while (k0 < c.n && c.t[k0] < ms - 30000) k0++;
      const pts = [];
      for (let k = k0; k < c.n && c.t[k] < ms + 120000; k++) {
        const pr = line.project(c.x[k] / 10, c.y[k] / 10), tel = r.carAt(num, c.t[k]);
        pts.push({ t: c.t[k], x: c.x[k], y: c.y[k], d: pr.d, v: tel ? tel.speed : null });
      }
      // the block off the line that holds the pit-in moment
      let a = pts.findIndex((p) => p.t >= ms - 12000 && p.d > 2.5);
      if (a < 1) continue;
      let b = a; while (b + 1 < pts.length && (pts[b + 1].d > 1.5 || pts[b + 2]?.d > 1.5) && pts[b + 1].t - pts[b].t < 4000) b++;
      if (b + 1 >= pts.length || pts[b + 1].t - pts[b].t > 4000) continue;
      const seg = pts.slice(a - 1, b + 2);
      if (seg.length < 12 || seg[seg.length - 1].t - seg[0].t > 110000) continue;
      passes.push({ num, ms, seg });
    }
  }
  return passes;
}
// along a polyline of points [x, y]: resampled every `step` dm
function resample(pts, step) {
  const out = [pts[0]]; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], l = Math.hypot(x1 - x0, y1 - y0);
    let s = step - carry;
    while (s <= l) { out.push([x0 + ((x1 - x0) * s) / l, y0 + ((y1 - y0) * s) / l]); s += step; }
    carry = l - (s - step);
  }
  out.push(pts[pts.length - 1]);
  return out.map(([x, y]) => [R(x), R(y)]);
}

async function survey(cache, name, G) {
  const m = /^(\d{4})_(\d{4}-\d\d-\d\d_.+?)_(\d{4}-\d\d-\d\d_(?:Race|Sprint))$/.exec(name);
  if (!m) return null;
  let r;
  try { r = new RK.Replay(await new Archive(cache).loadSession(`${m[1]}/${m[2]}/${m[3]}/`)); } catch (e) { return { session: name, error: e.message }; }
  const ts = r.startTime(); r.seek(ts);
  const info = r.state.SessionInfo || {}, app = r.state.TimingAppData?.Lines || {};
  const row = { session: name, year: +m[1], kind: /Sprint/.test(name) ? "sprint" : "race", venue: +info.Meeting?.Circuit?.Key || null, location: info.Meeting?.Location, drivers: Object.keys(r.state.DriverList || {}).length };
  const lap = r.lapShape();
  if (!lap) return { ...row, error: "no lap" };
  const line = lapLine(lap);
  // ---- grid
  const standingAt = (t) => {
    const a = r.positionsAt(t), b = r.positionsAt(t - 3000);
    return Object.entries(a).filter(([n, p]) => b[n] && Math.hypot(p[0] - b[n][0], p[1] - b[n][1]) < 15 && +app[n]?.GridPos > 0).map(([n, p]) => ({ num: n, g: +app[n].GridPos, p }));
  };
  const tryFit = (list) => { const obs = []; for (const c of list) { const pr = line.project(c.p[0] / 10, c.p[1] / 10); if (pr && pr.d < 12) obs.push({ g: c.g, s: pr.s, num: c.num, d: pr.d }); } return { f: G.fitGrid(obs, line.L), obs }; };
  let when = ts - 1500, tf = tryFit(standingAt(when));
  for (let t = ts; !tf.f.ok && t < ts + 20 * 60e3; t += 2000) { const l = standingAt(t); if (l.length >= 10) { const x = tryFit(l); if (x.f.ok) { tf = x; when = t; } } }
  const fit = tf.f;
  if (fit.ok) {
    const p1 = line.at(fit.s1), dir = line.dirAt(fit.s1), lastG = Math.max(...tf.obs.map((o) => o.g)), pl = line.at(fit.s1 - fit.pitch * (lastG - 1));
    row.grid = { at: R((when - ts) / 1000), n: fit.n, dropped: fit.dropped, rms: fit.rms, maxRes: fit.maxRes, pitch: +fit.pitch.toFixed(3), pitchData: fit.pitchData, pitchSE: fit.pitchSE,
      pole: [R(p1.x * 10), R(p1.y * 10)], dir: dir.map((v) => +v.toFixed(4)), lastSeen: lastG, last: [R(pl.x * 10), R(pl.y * 10)],
      // the lap line from 200 m past pole to 40 m behind the 26th slot, every 10 m: a session's own lap line must lie on
      // it for these numbers to be used there (F1's coordinates moved by ~21 m at Suzuka between 2023 and 2025)
      ref: Array.from({ length: Math.round((200 + fit.pitch * 25 + 40) / 10) + 1 }, (_, i) => { const q = line.at(fit.s1 + 200 - i * 10); return [R(q.x * 10), R(q.y * 10)]; }) };
  } else row.gridError = { reason: fit.reason, n: fit.n, rms: fit.rms };
  // ---- pit lane
  const passes = pitPasses(r, line);
  if (passes.length) {
    const lim = []; for (const p of passes) for (const q of p.seg) if (q.v > 40 && q.v < 95) lim.push(Math.round(q.v / 5) * 5);
    const counts = {}; for (const v of lim) counts[v] = (counts[v] || 0) + 1;
    const limit = +Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    // per pass: where the limiter goes on (first sample at ≤ limit + 3 after leaving the line) and off (the last)
    const ends = passes.map((p) => {
      // (on: the first sample at the limit after leaving the line; off: after the car's slowest moment – its stop – the
      // first sample clearly over the limit, the car accelerating past the pit exit line – not the last one under it,
      // which behind a safety car is far out on the track)
      const s = p.seg, on = s.findIndex((q) => q.v != null && q.v <= limit + 3);
      let iMin = -1; for (let i = 0; i < s.length; i++) if (s[i].v != null && (iMin < 0 || s[i].v <= s[iMin].v)) iMin = i;
      let off = -1; for (let i = Math.max(0, iMin); i < s.length; i++) if (s[i].v != null && s[i].v > limit + 8) { off = i - 1; break; }
      const stops = []; for (let i = 1; i < s.length; i++) if (s[i].v === 0 && s[i - 1].v > 0) stops.push([R(s[i].x), R(s[i].y)]);
      return { p, on: on >= 0 ? s[on] : null, off: off >= 0 ? s[off] : null, dur: s[s.length - 1].t - s[0].t, stops };
    }).filter((e) => e.on && e.off);
    if (ends.length) {
      const durs = ends.map((e) => e.dur), mid = median(durs), rep = ends.reduce((a, b) => (Math.abs(b.dur - mid) < Math.abs(a.dur - mid) ? b : a));
      const pathPts = resample(rep.p.seg.map((q) => [q.x, q.y]), 40);
      // the limiter lines: medians over the passes, as distances along the representative path
      const along = (pt) => { let best = 0, bd = Infinity, acc = 0; for (let i = 1; i < pathPts.length; i++) { const [x0, y0] = pathPts[i - 1], [x1, y1] = pathPts[i], dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, t = Math.max(0, Math.min(1, ((pt.x - x0) * dx + (pt.y - y0) * dy) / (l * l))), d = Math.hypot(pt.x - x0 - dx * t, pt.y - y0 - dy * t); if (d < bd) { bd = d; best = acc + l * t; } acc += l; } return { u: best, off: bd }; };
      const onU = median(ends.map((e) => along(e.on).u)), offU = median(ends.map((e) => along(e.off).u));
      const spread = (k) => { const v = ends.map((e) => along(e[k]).u); const md = median(v); return +(median(v.map((x) => Math.abs(x - md))) / 10).toFixed(1); };
      const lane = Math.max(...ends.map((e) => median(e.p.seg.map((q) => q.d))));
      row.pit = { passes: passes.length, used: ends.length, limit, path: pathPts, limitOn: R(onU), limitOff: R(offU), onMAD: spread("on"), offMAD: spread("off"), laneOffset: +median(ends.map((e) => median(e.p.seg.slice(2, -2).map((q) => q.d)))).toFixed(1), maxOffset: +lane.toFixed(1),
        stops: ends.flatMap((e) => e.stops).length };
    }
  }
  // ---- cars waiting in the pit lane at the start (2 s before lights out): off the line, standing still
  const a = r.positionsAt(ts - 2000), b = r.positionsAt(ts - 5000), waits = [];
  for (const [n, p] of Object.entries(a)) {
    const pr = line.project(p[0] / 10, p[1] / 10), tel = r.carAt(n, ts - 2000), still = b[n] && Math.hypot(p[0] - b[n][0], p[1] - b[n][1]) < 10;
    if (pr.d > 2.5 && still && (!tel || tel.speed < 3)) waits.push({ num: n, g: +app[n]?.GridPos || null, p: [R(p[0]), R(p[1])], d: +pr.d.toFixed(1) });
  }
  if (waits.length) row.pitWaits = waits;
  return row;
}

async function main() {
  const G = await import("../src/renderer/grid.js");
  const out = [];
  for (const cache of caches) {
    const files = fs.readdirSync(cache).filter((f) => /_(Race|Sprint)_SessionInfo\.jsonStream$/.test(f)).sort();
    for (const f of files) {
      const name = f.replace(/_SessionInfo\.jsonStream$/, "");
      if (only && !name.includes(only)) continue;
      if (out.some((o) => o.session === name)) continue;
      const row = await survey(cache, name, G);
      if (!row) continue;
      out.push(row);
      const { pit, ...brief } = row;
      console.log(JSON.stringify({ ...brief, pit: pit && { ...pit, path: pit.path.length } }));
    }
  }
  if (WRITE) fs.writeFileSync(path.join(__dirname, "grid-survey.out.json"), JSON.stringify(out));
}
main();
