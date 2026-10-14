// Development tool (not shipped): turns tools/grid-survey.out.json (grid-survey.js) into src/renderer/startdata.js.
//   node tools/grid-build.js
// Per venue (F1's circuit key):
//   grid – every session's measured pole point and direction (feed dm), how well it fitted, and how far the sessions
//          agree with each other (spread: the largest distance of a session's pole from the venue's median, m);
//          the slot pitch: the rules' 8 m unless the sessions' own slopes agree on another (well determined:
//          inverse-variance mean with an error < 0.05 m, more than 0.3 m from 8 – Catalunya's 7.4–7.5 m);
//   pit  – the pit lane path of the most recent session with passes through it (feed dm, every 4 m), its speed limit,
//          where the limiter goes on and off (m along the path, with the passes' spread), and cars seen waiting at
//          its exit at a start.
const fs = require("node:fs");
const path = require("node:path");
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, "grid-survey.out.json"), "utf8"));
const median = (a) => { const b = [...a].sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[n >> 1] : (b[n / 2 - 1] + b[n / 2]) / 2) : NaN; };
const venues = {};
for (const r of rows) if (r.venue) (venues[r.venue] ||= []).push(r);
const out = {};
for (const [venue, list] of Object.entries(venues)) {
  const g = list.filter((r) => r.grid && r.grid.rms < 4).sort((a, b) => a.session.localeCompare(b.session));
  const v = { location: list[list.length - 1].location, grid: null, pit: null, fails: list.filter((r) => !r.grid).map((r) => ({ session: r.session, why: r.gridError?.reason || r.error })) };
  if (g.length) {
    const mx = median(g.map((r) => r.grid.pole[0])), my = median(g.map((r) => r.grid.pole[1]));
    const sessions = g.map((r) => ({ session: r.session.replace(/_Grand_Prix/, "").replace(/^\d{4}_/, ""), year: r.year, kind: r.kind, pole: r.grid.pole, dir: r.grid.dir, n: r.grid.n, rms: r.grid.rms, at: r.grid.at, lastSeen: r.grid.lastSeen, pitchData: r.grid.pitchData, pitchSE: r.grid.pitchSE, ref: r.grid.ref,
      off: +(Math.hypot(r.grid.pole[0] - mx, r.grid.pole[1] - my) / 10).toFixed(1) }));
    // pitch: the inverse-variance mean of the sessions' slopes
    const ok = sessions.filter((s) => s.pitchSE > 0 && s.pitchSE < 0.3 && s.pitchData > 7 && s.pitchData < 9);
    const wsum = ok.reduce((a, s) => a + 1 / s.pitchSE ** 2, 0), mean = ok.reduce((a, s) => a + s.pitchData / s.pitchSE ** 2, 0) / (wsum || 1), se = wsum ? Math.sqrt(1 / wsum) : Infinity;
    const pitch = ok.length >= 2 && se < 0.05 && Math.abs(mean - 8) > 0.3 ? +mean.toFixed(2) : 8;
    v.grid = { pitch, pitchFrom: pitch === 8 ? "rules (FIA B5.1.2)" : `measured (${ok.length} sessions, ${mean.toFixed(2)} ± ${se.toFixed(2)} m)`, pitchMean: +mean.toFixed(3), pitchSE: +se.toFixed(3),
      spread: Math.max(...sessions.map((s) => s.off)), sessions };
  }
  const p = list.filter((r) => r.pit && r.pit.used >= 3).sort((a, b) => a.session.localeCompare(b.session));
  if (p.length) {
    // the representative session: of the latest two seasons with passes, the one with the most (a race run mostly
    // behind the safety car queues slowly through the pit lane)
    const lastYear = Math.max(...p.map((r) => r.year)), recent = p.filter((r) => r.year >= lastYear - 1);
    const r = recent.reduce((a, b) => (b.pit.used > a.pit.used ? b : a));
    v.pit = { session: r.session.replace(/_Grand_Prix/, "").replace(/^\d{4}_/, ""), limit: r.pit.limit, path: r.pit.path, limitOn: r.pit.limitOn / 10, limitOff: r.pit.limitOff / 10, onMAD: r.pit.onMAD, offMAD: r.pit.offMAD, passes: r.pit.used, laneOffset: r.pit.laneOffset,
      others: p.filter((o) => o !== r).map((o) => ({ session: o.session.replace(/_Grand_Prix/, "").replace(/^\d{4}_/, ""), limitOn: o.pit.limitOn / 10, limitOff: o.pit.limitOff / 10, path0: o.pit.path[0], pathN: o.pit.path[o.pit.path.length - 1] })) };
  }
  // pit-lane starters seen waiting at the pit exit 2 s before lights out (sessions with at most 4 such cars: more is
  // the whole field queued after a red flag or a delayed start, not pit-lane starters)
  const waits = list.filter((r) => r.pitWaits && r.pitWaits.length <= 4).map((r) => ({ session: r.session.replace(/_Grand_Prix/, "").replace(/^\d{4}_/, ""), cars: r.pitWaits }));
  if (waits.length) v.pitWaits = waits;
  if (v.pit && waits.length) {
    // where on the pit path they waited: the front car's distance along it, per session; the queue's head is their median
    const P = v.pit.path, cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) / 10);
    const along = ([x, y]) => { let best = null; for (let i = 1; i < P.length; i++) { const [x0, y0] = P[i - 1], [x1, y1] = P[i], dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2)), d = Math.hypot(x - x0 - dx * t, y - y0 - dy * t) / 10; if (!best || d < best.d) best = { u: cum[i - 1] + t * (cum[i] - cum[i - 1]), d }; } return best; };
    const heads = [];
    for (const w of waits) { const us = w.cars.map((c) => along(c.p)).filter((a) => a && a.d < 6).map((a) => a.u); if (us.length) heads.push({ session: w.session, head: +Math.max(...us).toFixed(1), cars: us.length }); }
    if (heads.length) v.pit.queue = { head: median(heads.map((h) => h.head)), seen: heads };
  }
  out[venue] = v;
}
const head = `// Generated by tools/grid-build.js from tools/grid-survey.js – do not edit by hand.
// Each venue's starting grid and pit lane as measured from F1's own position data (decimetres, the feed's coordinates:
// the same at a venue from year to year – the sessions' pole points agree within the spread given), with where every
// value came from. Used by the 3D view when a session doesn't show its own standing grid (map3d.js addGrid) and for the
// pit lane (pit-lane starts, the pit exit). Measured ${new Date().toISOString().slice(0, 10)} from ${rows.length} race and sprint sessions (2023–2026).
`;
fs.writeFileSync(path.join(__dirname, "../src/renderer/startdata.js"), head + "export const START_DATA = " + JSON.stringify(out) + ";\n");
for (const [k, v] of Object.entries(out)) console.log(k.padStart(4), (v.location || "").padEnd(16), "grid:", v.grid ? `${v.grid.sessions.length} sessions spread ${v.grid.spread} m pitch ${v.grid.pitch}` : "NONE", "| pit:", v.pit ? `${v.pit.session} ${v.pit.passes} passes limit ${v.pit.limit} on ${v.pit.limitOn}±${v.pit.onMAD} off ${v.pit.limitOff}±${v.pit.offMAD}` + (v.pit.queue ? ` queue ${v.pit.queue.head} (${v.pit.queue.seen.map((q) => q.head).join("/")})` : "") : "NONE", v.fails.length ? "| fails " + v.fails.map((f) => f.session.slice(0, 4) + ":" + f.why).join(",") : "");
