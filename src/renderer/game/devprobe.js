// Development only (GameDev.workerProbe – the v0.48 measurement behind "renderer thread or Worker", reports/ui3d.md):
// does a module Worker run from this file:// page and import the engine? its cost vs the same work here; a snapshot's
// round trip (structured clone both ways). Moved out of gamehome.js unchanged.
export function workerProbe(G, n = 200) {
  return new Promise((resolve) => {
    const out = { ok: false }, done = (x) => { try { w?.terminate(); } catch {} resolve(JSON.stringify({ ...out, ...x })); };
    let w = null; const t0 = performance.now();
    try { w = new Worker(new URL("./workerprobe.js", import.meta.url), { type: "module" }); } catch (e) { return done({ error: "new Worker: " + (e.message || e) }); }
    w.onerror = (e) => done({ error: "worker error: " + (e.message || "?") });
    const snap = G.run?.latest() || { t: 0, cars: Array.from({ length: 22 }, (_, i) => ({ num: String(i + 1), teamKey: "T" + (i >> 1), team: "Team", tla: "AAA", color: "#fff", status: "run", pos: i + 1, lap: 10, where: "lap", s: i * 100.5, u: null, d: 0.5, v: 70.1, a: 0, steer: 0.01, wheelDist: 1e5, aero: { open: 0, front: 0 }, drs: false, overtake: false, tyre: { compound: "MEDIUM", wear: 0.2, Ts: 95, Tc: 100, age: 10 }, energy: { soc: 0.5, mode: "balanced", deployKw: 120 }, fuel: 50, pit: { phase: "none", u: null, workT0: null, workT1: null, err: null } })) };
    let k = 0, rt0 = 0; const rtts = [];
    w.onmessage = async (e) => {
      const m = e.data;
      if (m.kind === "hello") { out.ok = true; out.helloMs = +(performance.now() - t0).toFixed(1); w.postMessage({ kind: "bench" }); }
      else if (m.kind === "bench") {
        out.workerBenchMs = +m.ms.toFixed(1);
        const [{ Streams }, Wm] = await Promise.all([import("../../game/engine/rng.js"), import("../../game/engine/weather.js")]);
        const b0 = performance.now(), S = new Streams(7); let acc = 0;
        for (let i = 0; i < 200000; i++) acc += S.get("driver:" + (i % 22)).normal();
        const W = Wm.weatherTruth([{ t: 0, rain: 0, airT: 20, trackT: 30, wind: 2 }, { t: 3.6e6, rain: 1, airT: 18, trackT: 22, wind: 4 }], { seed: 3 });
        for (let j = 0; j < 48; j++) acc += Wm.forecastAt(W, j * 300000, 3).blocks.length;
        out.mainBenchMs = +(performance.now() - b0).toFixed(1); out.sameResult = acc === m.acc;
        out.snapCars = snap.cars.length; out.snapBytes = JSON.stringify(snap).length;
        rt0 = performance.now(); w.postMessage({ kind: "echo", snap });
      } else if (m.kind === "echo") {
        rtts.push(performance.now() - rt0);
        if (++k < n) { rt0 = performance.now(); w.postMessage({ kind: "echo", snap }); return; }
        rtts.sort((a, b) => a - b);
        done({ echoN: n, rttMedianMs: +rtts[n >> 1].toFixed(3), rttP95Ms: +rtts[Math.floor(n * 0.95)].toFixed(3) });
      }
    };
    w.postMessage({ kind: "hello" });
    setTimeout(() => done({ error: out.ok ? "timeout during the probe" : "no answer from the worker in 15 s" }), 15000);
  });
}
