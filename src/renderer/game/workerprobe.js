// DEVELOPMENT ONLY – does a module Worker load from this app's file:// page (CSP 'self', sandboxed renderer) and can it
// import the pure engine modules? And what does moving a snapshot across cost? Used by GameDev.workerProbe() to decide
// whether the engine runs on the renderer thread or in a Worker (reports/ui3d.md); never part of the game's flow.
import { DT_MS } from "../../game/engine/clock.js";
import { Streams } from "../../game/engine/rng.js";
import { weatherTruth, forecastAt } from "../../game/engine/weather.js";

self.onmessage = (e) => {
  const m = e.data || {};
  if (m.kind === "hello") { self.postMessage({ kind: "hello", ok: true, DT_MS, at: performance.now() }); return; }
  if (m.kind === "bench") {
    // a fixed piece of pure engine work: 200k seeded normals + a 4-hour weather truth and 48 forecasts
    const t0 = performance.now(), S = new Streams(7); let acc = 0;
    for (let i = 0; i < 200000; i++) acc += S.get("driver:" + (i % 22)).normal();
    const W = weatherTruth([{ t: 0, rain: 0, airT: 20, trackT: 30, wind: 2 }, { t: 3.6e6, rain: 1, airT: 18, trackT: 22, wind: 4 }], { seed: 3 });
    for (let k = 0; k < 48; k++) acc += forecastAt(W, k * 300000, 3).blocks.length;
    self.postMessage({ kind: "bench", ms: performance.now() - t0, acc });
    return;
  }
  // echo: a snapshot back as it came (structured clone both ways – the per-frame cost of a worker engine)
  if (m.kind === "echo") self.postMessage({ kind: "echo", snap: m.snap, at: performance.now() });
};
