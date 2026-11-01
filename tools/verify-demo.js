// npm run verify:demo – checks the offline demo's synthetic session (src/main/demo.js) through the replay's own code
// (archive.js parsers → ReplayKit.Replay → its position tracks, timing state and stints). No network, no Electron.
//
// What it shows: the demo runs the real replay path with sane results – a fixed session every run, no NaN/Infinity
// in any car's place, a seek back in time gives the same state as a fresh load, the grid stands still before the lights,
// the pit car stays on its pit lane while InPit, stops at its box and leaves on new tyres, and no two cars are drawn
// closer than a car length on track. What it does not show: anything about real F1 data or the 3D view's final pose
// (docs/VERIFICATION.md – the 47-race scans and Map3D.poseScan run in the app).
const crypto = require("node:crypto");
const RK = require("../src/renderer/replay.js");
const demo = require("../src/main/demo.js");

function verifyDemo() {
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  const digest = (d) => {
    const h = crypto.createHash("sha256");
    for (const [num, c] of Object.entries(d.topics.PositionTracks.cars).sort()) h.update(num + Buffer.from(c.t.buffer).toString("hex") + Buffer.from(c.x.buffer).toString("hex") + Buffer.from(c.y.buffer).toString("hex"));
    for (const k of Object.keys(d.topics).sort()) if (Array.isArray(d.topics[k])) h.update(k + JSON.stringify(d.topics[k]));
    return h.digest("hex").slice(0, 16);
  };
  const d1 = demo.loadDemo(), d2 = demo.loadDemo();
  check("same session every run (fixed seed)", digest(d1) === digest(d2), `digest ${digest(d1)}`);

  const r = new RK.Replay(d1), start = r.startTime(), end = r.endTime(), nums = demo.DRIVERS.map((x) => x[0]);
  check("6 cars, lights out and a finalised end found", Object.keys(r.tracks.cars).length === 6 && start > 0 && end > start, `${Object.keys(r.tracks.cars).length} cars, lights out ${start} ms, end ${end} ms`);

  // every car's place, every 100 ms from a minute before the lights to the end
  let samples = 0, bad = 0, minGap = Infinity, gapAt = null;
  const C = demo._internal.circuit();
  for (let t = start - 60000; t <= end; t += 100) {
    const pos = r.positionsAt(t), list = [];
    for (const n of nums) {
      const p = pos[n]; samples++;
      if (!p || !p.every(Number.isFinite)) { bad++; continue; }
      list.push([n, p[0] / 10, p[1] / 10]);
    }
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const g = Math.hypot(list[i][1] - list[j][1], list[i][2] - list[j][2]);
      if (g < minGap) { minGap = g; gapAt = [t - start, list[i][0], list[j][0]]; }
    }
  }
  check("every place finite (no NaN / Infinity)", bad === 0, `${samples} car-samples, ${bad} not finite`);
  check("no two cars closer than a car length (5.6 m)", minGap >= 5.6, `closest ${minGap.toFixed(2)} m (${(gapAt[0] / 1000).toFixed(1)} s, cars ${gapAt[1]} / ${gapAt[2]})`);

  // the grid: standing still before the lights
  let gridMove = 0;
  const g0 = r.positionsAt(start - 50000);
  for (let t = start - 50000; t < start; t += 250) { const p = r.positionsAt(t); for (const n of nums) gridMove = Math.max(gridMove, Math.hypot(p[n][0] - g0[n][0], p[n][1] - g0[n][1]) / 10); }
  // (the synthetic samples carry ±0.3 m of noise on x and y, as a feed does: two samples of a standing car may differ by up to 0.85 m)
  check("grid stands still before the lights", gridMove <= 0.85, `largest move ${gridMove.toFixed(2)} m over 50 s (noise bound 0.85 m)`);

  // seeking back: the same timing state as a fresh load at that moment
  const keys = ["TimingData", "TimingAppData", "LapCount", "TrackStatus", "SessionStatus", "ExtrapolatedClock"];
  const pick = (rep) => JSON.stringify(keys.map((k) => rep.state[k] ?? null));
  const tA = start + 95000, tB = start + 30000;
  r.seek(tA); r.seek(tB);
  const fresh = new RK.Replay(demo.loadDemo()); fresh.seek(tB);
  check("seek back = fresh load (no state left over)", pick(r) === pick(fresh), `seek ${(tA - start) / 1000} s → ${(tB - start) / 1000} s`);

  // the pit car: InPit only on the pit lane, a stop at its box, new tyres after
  const pitNum = demo.DRIVERS[demo.PIT.car][0], P = demo.PIT, lane = [];
  for (let u = P.lane; u <= P.laneEnd; u++) lane.push(demo._internal.placeAt(C, (u + C.N) % C.N, P.side));
  const rp = new RK.Replay(demo.loadDemo());
  let inPit = 0, offLane = 0, still = 0, spot = null, spread = 0;
  for (let t = start; t <= end; t += 250) {
    rp.seek(t);
    if (!rp.state.TimingData?.Lines?.[pitNum]?.InPit) continue;
    inPit++;
    const p = rp.positionsAt(t)[pitNum], x = p[0] / 10, y = p[1] / 10;
    let dmin = Infinity; for (const q of lane) dmin = Math.min(dmin, Math.hypot(q[0] - x, q[1] - y));
    if (dmin > 2) offLane++;
    // standing: the telemetry says 0 km/h; the place then stays within the samples' noise
    if (rp.carAt(pitNum, t)?.speed === 0) { still += 0.25; if (!spot) spot = [x, y]; spread = Math.max(spread, Math.hypot(x - spot[0], y - spot[1])); }
  }
  check("pit car on its pit lane while InPit (within 2 m)", inPit > 0 && offLane === 0, `${inPit} samples InPit, ${offLane} off the lane`);
  check("pit car stops at its box", still >= 2 && spread <= 0.85, `0 km/h for ${still.toFixed(2)} s, place within ${spread.toFixed(2)} m`);
  const comps = rp.stints(pitNum).map((s) => s.compound || s.Compound);
  check("pit car leaves on a new stint (MEDIUM → HARD)", comps.join(",") === "MEDIUM,HARD", `stints ${comps.join(" → ")}`);

  return { ok: checks.every((c) => c.ok), checks };
}

if (require.main === module) {
  const res = verifyDemo();
  for (const c of res.checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name} – ${c.detail}`);
  console.log(res.ok ? "demo: all checks passed" : "demo: CHECK FAILED");
  process.exit(res.ok ? 0 : 1);
}
module.exports = { verifyDemo };
