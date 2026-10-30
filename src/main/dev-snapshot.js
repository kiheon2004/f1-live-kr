// Development helper:  F1KR_SNAPSHOT=out.png npm start
// Replay: loads the latest race, jumps 30 min past the start, saves a screenshot and quits.
//   F1KR_FOCUS=1     also opens the driver panel (P3, compared with P4)
//   F1KR_SCHEDULE=1  also opens the KST schedule
//   F1KR_BIGMAP=1    enlarges the map (wide side panel, tall map)
//   F1KR_MAPTOOLS=1  zooms the map in twice and rotates it once
//   F1KR_BEST=1      switches the lap column to personal bests
//   F1KR_TRACE=1     opens the gap chart tab
//   F1KR_CHAMP=1     opens the championship tab
//   F1KR_STRAT=1     opens the tyre strategy tab
//   F1KR_GAP=1       switches the gap column to the focused driver
//   F1KR_3D=chase    switches the map to 3D with that camera (F1KR_EXPAND=1 for full window)
//   F1KR_RADIO=1     also opens the team radio tab (F1KR_RADIO=all: grouped by lap)
//   F1KR_SYNC=1      (live) opens the TV sync box and tries a clock sync
//   F1KR_SIZE=1180x720  window size
//   F1KR_ZOOM=1.5    page zoom (as ⌘+ does: 125 % / 150 % checks)
//   F1KR_SHOTS="js;;js" runs each and saves out_1.png, out_2.png, … after it
//   F1KR_JS="…"      runs this in the page just before the capture (F1KR_JS_WAIT ms afterwards, default 3000)
//   F1KR_YEAR=2025   (replay) season to pick the session from
//   F1KR_DELAY=30    (live) broadcast delay in seconds before connecting
//   F1KR_SWEEP=…     runs the 3D occlusion check on a list of races (see below)
//   F1KR_GRIDSWEEP=… loads each race at its grid (see below); F1KR_ITEM_JS / F1KR_ITEM_SHOTS run on each
//   F1KR_LIVE=1      instead connects in live mode and captures after a few seconds
//   F1KR_HOME=1      stays on the season globe home screen (shown at launch): waits until its list is usable, logs
//                    HOMEREADY with its timings, then runs F1KR_SHOTS there (every other mode leaves the home screen first)
//   F1KR_KEEP=1      keeps the page's storage of the last run (recent sessions, 이어보기 across launches)
const fs = require("node:fs");
const { app } = require("electron");

module.exports = function snapshot(win, outFile) {
  // (a snapshot window behind other windows would get no animation frames: loading waits for one)
  win.webContents.setBackgroundThrottling(false);
  const run = (js) => win.webContents.executeJavaScript(js);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  win.webContents.on("console-message", (...a) => { const e = a[0]?.message !== undefined ? a[0] : { level: a[1], message: a[2] }; if (e.level === "error" || e.level >= 2) console.log("RENDERER", e.message); });
  win.webContents.once("did-finish-load", async () => {
    if (!process.env.F1KR_KEEP) await run(`localStorage.clear()`);
    if (!process.env.F1KR_HOME) await run(`window.F1KRApp?.setHome(false)`);
    if (process.env.F1KR_SIZE) { const [w, h] = process.env.F1KR_SIZE.split("x").map(Number); win.setSize(w, h); await wait(300); }
    if (+process.env.F1KR_ZOOM > 0) { win.webContents.setZoomFactor(+process.env.F1KR_ZOOM); await wait(300); }
    if (process.env.F1KR_BIGMAP) await run(`localStorage.setItem("f1kr:sideW","900"); localStorage.setItem("f1kr:mapH","640"); dispatchEvent(new Event("resize"))`);
    if (process.env.F1KR_HOME) {
      let m = {};
      for (let i = 0; i < 120; i++) { m = JSON.parse(await run(`window.HomeDev?.metrics() || "{}"`)); if (m.tListReady != null) break; await wait(250); }
      console.log("HOMEREADY", JSON.stringify(m));
    } else if (process.env.F1KR_GRIDSWEEP) {
      // F1KR_GRIDSWEEP="2026:모나코 그랑프리 · 결승,…" – per race: load it (it opens at the standing grid), the 3D view with
      // its real surroundings, Map3D.gridCheck(), the cameras on the first and last car on the grid before play, and
      // two pictures (down the grid from behind; the last slots) next to the output file
      await run(`document.getElementById("modeReplay").click(); localStorage.setItem("f1kr:mapView", JSON.stringify("3d"));`);
      for (const item of process.env.F1KR_GRIDSWEEP.split(",")) {
        const [year, pick] = item.split(":");
        await run(`(() => { const y = document.getElementById("year"); y.value = ${+year}; y.dispatchEvent(new Event("change")); })()`);
        // (picked by the option's text or its session path, e.g. "Monaco_Grand_Prix/2026-06-07_Race")
        for (let i = 0; i < 60 && !(await run(`[...document.getElementById("session").options].some((o) => o.text.includes(${JSON.stringify(pick)}) || o.value.includes(${JSON.stringify(pick)}))`)); i++) await wait(500);
        const found = await run(`(() => { const s = document.getElementById("session"); const o = [...s.options].find((x) => x.text.includes(${JSON.stringify(pick)}) || x.value.includes(${JSON.stringify(pick)})); if (!o) return false; s.value = o.value; document.getElementById("load").click(); return true; })()`);
        if (!found) { console.log("GRIDSWEEP", JSON.stringify({ item, error: "no session" })); continue; }
        console.log("GSTEP load", item);
        await wait(1500);
        for (let i = 0; i < 400 && (await run(`document.getElementById("load").disabled`)); i++) await wait(500);
        console.log("GSTEP loaded", await run(`document.getElementById("progress").textContent`));
        await run(`document.querySelector('.view-switch [data-view="3d"]').click(); document.querySelector('[data-cam="heli"]').click()`);
        if (process.env.F1KR_EXPAND && !(await run(`document.getElementById("mapCard").classList.contains("expanded")`))) await run(`document.getElementById("expandMap").click()`);
        const path = await run(`document.getElementById("session").value`);
        let dbg = null;
        for (let i = 0; i < 120; i++) { await wait(1000); dbg = JSON.parse(await run(`window.Map3D?.debug?.() || "{}"`)); if (dbg.real && String(dbg.key || "").includes(path)) break; }
        console.log("GSTEP world", dbg.key, dbg.real);
        await wait(2500);
        const t = await run(`F1KR.t - +document.getElementById("seek").min`), lights = await run(`F1KR.src.startTime() - F1KR.t`);
        const check = JSON.parse(await run(`window.Map3D.gridCheck()`));
        // the cameras before play: the first and the last car on the grid, onboard and chase – is the car on screen, and what does the view say
        const cams = [];
        const order = await run(`JSON.stringify(Object.entries(F1KR.src.state.TimingAppData?.Lines || {}).filter(([, l]) => +l.GridPos > 0).sort((a, b) => a[1].GridPos - b[1].GridPos).map(([n]) => n))`);
        const nums = JSON.parse(order);
        for (const num of [nums[0], nums[nums.length - 1]].filter(Boolean)) for (const cam of ["onboard", "chase"]) {
          await run(`F1KR.setFocus(${JSON.stringify(num)}); document.querySelector('[data-cam="${cam}"]').click()`);
          await wait(1200);
          const f = JSON.parse(await run(`JSON.stringify({ follow: JSON.parse(Map3D.debug()).follow, note: (document.getElementById("camNote3d")?.hidden === false ? document.getElementById("camNote3d").textContent : "") })`));
          // (onboard: the camera rides on the car – within 2 m of it; chase: the car in the picture)
          const ok = !!f.follow?.visible && (cam === "onboard" ? f.follow.camDist < 2 : Math.abs(f.follow.screen[0]) < 1 && Math.abs(f.follow.screen[1]) < 1 && f.follow.screen[2] < 1);
          cams.push({ num, cam, ok, camDist: f.follow?.camDist, screen: f.follow?.screen, note: f.note });
        }
        await run(`document.querySelector('[data-cam="heli"]').click(); Map3D.viewGrid(30, 80, 16)`);
        await wait(1500);
        const tag = outFile.replace(/\.png$/, "") + "_" + item.replace(/[^A-Za-z0-9]+/g, "_").replace(/_+$/, "") + "_" + (dbg.loc || "").replace(/[^A-Za-z0-9]+/g, "_");
        fs.writeFileSync(tag + "_grid.png", (await win.webContents.capturePage()).resize({ width: 1200 }).toPNG());
        await run(`(() => { const n = JSON.parse(Map3D.gridCheck()).last?.g; return Map3D.viewSlot(n, 30, 12, 0, 70, 55); })()`);
        await wait(1500);
        fs.writeFileSync(tag + "_last.png", (await win.webContents.capturePage()).resize({ width: 1200 }).toPNG());
        console.log("GRIDSWEEP", JSON.stringify({ item, loc: dbg.loc, key: dbg.key, t, lights, real: !!dbg.real, check, cams }));
        // F1KR_ITEM_JS: run on every race of the sweep (its result logged with the race)
        if (process.env.F1KR_ITEM_JS) console.log("ITEMJS", item, await run(process.env.F1KR_ITEM_JS).catch((e) => "error " + e.message));
        // F1KR_ITEM_SHOTS="js1;;js2;;…": on every race of the sweep, each run, F1KR_SHOT_WAIT ms, then a picture <tag>_sN.png
        // ("burst:N:ms[:width]" as in F1KR_SHOTS: N frames ms apart, <tag>_sN_fNN.png)
        if (process.env.F1KR_ITEM_SHOTS) for (const [i, js] of process.env.F1KR_ITEM_SHOTS.split(";;").entries()) {
          const r = await run(js).catch((e) => "error " + e.message);
          console.log("ITEMSHOT", item, i + 1, typeof r === "string" ? r : JSON.stringify(r));
          await wait(+process.env.F1KR_SHOT_WAIT || 2500);
          const b = typeof r === "string" && /^burst:(\d+):(\d+)(?::(\d+))?/.exec(r);
          if (b) { for (let f = 0; f < +b[1]; f++) { const t0 = Date.now(); fs.writeFileSync(`${tag}_s${i + 1}_f${String(f + 1).padStart(2, "0")}.png`, (await win.webContents.capturePage()).resize({ width: +(b[3] || 960) }).toPNG()); await wait(Math.max(0, +b[2] - (Date.now() - t0))); } }
          else fs.writeFileSync(`${tag}_s${i + 1}.png`, (await win.webContents.capturePage()).resize({ width: 1600 }).toPNG());
        }
      }
    } else if (process.env.F1KR_SWEEP) {
      // F1KR_SWEEP="2026:바레인 그랑프리 · 결승,2025:모나코 그랑프리 · 결승" – loads each race, builds the real 3D
      // surroundings, runs Map3D.occlusionTest() and saves a helicopter shot next to the output file.
      await run(`document.getElementById("modeReplay").click(); localStorage.setItem("f1kr:mapView", JSON.stringify("3d"));`);
      for (const item of process.env.F1KR_SWEEP.split(",")) {
        const [year, pick] = item.split(":");
        await run(`(() => { const y = document.getElementById("year"); y.value = ${+year}; y.dispatchEvent(new Event("change")); })()`);
        for (let i = 0; i < 60 && !(await run(`[...document.getElementById("session").options].some((o) => o.text.includes(${JSON.stringify(pick)}))`)); i++) await wait(500);
        const found = await run(`(() => { const s = document.getElementById("session"); const o = [...s.options].find((x) => x.text.includes(${JSON.stringify(pick)})); if (!o) return false; s.value = o.value; document.getElementById("load").click(); return true; })()`);
        if (!found) { console.log("SWEEP", JSON.stringify({ item, error: "no session" })); continue; }
        await wait(1500);
        for (let i = 0; i < 400 && (await run(`document.getElementById("load").disabled`)); i++) await wait(500);
        await run(`(() => { const k = document.getElementById("seek"); k.value = +k.min + 20 * 60e3; k.dispatchEvent(new Event("input")); })()`);
        await run(`document.querySelector('.view-switch [data-view="3d"]').click()`);
        // wait for this session's own 3D world (not the previous circuit's) with its real surroundings
        const path = await run(`document.getElementById("session").value`);
        console.log("SWEEPSTEP", item, "loaded:", await run(`document.getElementById("progress").textContent + " | " + document.getElementById("title").textContent`));
        let dbg = null;
        for (let i = 0; i < 300; i++) { await wait(1000); dbg = JSON.parse(await run(`window.Map3D?.debug?.() || "{}"`)); if (dbg.real && String(dbg.key || "").includes(path)) break; }
        if (!String(dbg.key || "").includes(path)) { console.log("SWEEP", JSON.stringify({ item, error: "3D world not built", dbg })); continue; }
        await wait(3500);   // let the frame-rate meter settle
        dbg = JSON.parse(await run(`window.Map3D.debug()`));
        await wait(1500);
        const test = await run(`JSON.stringify(window.Map3D.occlusionTest())`);
        console.log("FLOOD", JSON.stringify({ item, loc: dbg.loc, flood: JSON.parse(await run(`JSON.stringify(window.Map3D.floodTest())`)) }));
        console.log("SWEEP", JSON.stringify({ item, loc: dbg.loc, real: dbg.real, info: dbg.info, fps: dbg.fps, mem: dbg.mem, test: JSON.parse(test) }));
        fs.writeFileSync(outFile.replace(/\.png$/, "") + "_" + (dbg.loc || year).replace(/[^A-Za-z0-9]+/g, "_") + ".png", (await win.webContents.capturePage()).resize({ width: 1000 }).toPNG());
      }
    } else if (process.env.F1KR_LIVE) {
      await run(`document.getElementById("modeLive").click()`);
      if (process.env.F1KR_DELAY) await run(`(() => { const d = document.getElementById("delay"); d.value = ${+process.env.F1KR_DELAY}; d.dispatchEvent(new Event("input")); })()`);
      await run(`document.getElementById("liveToggle").click();`);
      await wait(+process.env.F1KR_LIVE_WAIT || 9000);
      if (process.env.F1KR_FOCUS) { await run(`document.querySelectorAll("#board tbody tr")[0]?.click()`); await wait(800); }
      if (process.env.F1KR_3D) {
        await run(`document.querySelector('.view-switch [data-view="3d"]').click()`); await wait(4000);
        await run(`document.querySelector('[data-cam="${process.env.F1KR_3D}"]')?.click()`);
        if (process.env.F1KR_EXPAND) await run(`document.getElementById("expandMap").click()`);
        await wait(2500);
        console.log("MAP3D", await run(`window.Map3D?.debug?.()`));
      }
      if (process.env.F1KR_SYNC) { await run(`document.getElementById("syncBtn").click(); document.getElementById("syncClock").value = "45:00"; document.getElementById("syncClockBtn").click()`); await wait(500); }
    } else {
      await run(`document.getElementById("modeReplay").click()`);
      if (process.env.F1KR_YEAR) { await run(`(() => { const y = document.getElementById("year"); y.value = ${+process.env.F1KR_YEAR}; y.dispatchEvent(new Event("change")); })()`); await wait(1500); }
      for (let i = 0; i < 60 && !(await run(`document.getElementById("session").options.length`)); i++) await wait(500);
      await run(`(() => { const s = document.getElementById("session");
        const o = [...s.options].find((x) => x.text.includes(${JSON.stringify(process.env.F1KR_PICK || "결승")})); if (o) s.value = o.value;
        document.getElementById("load").click(); })()`);
      for (let i = 0; i < 720 && (await run(`document.getElementById("seek").disabled`)); i++) await wait(500);
      await run(`(() => { const k = document.getElementById("seek"); k.value = +k.value + (+(${JSON.stringify(process.env.F1KR_AT || "30")}) * 60e3); k.dispatchEvent(new Event("input")); })()`);
      await wait(800);
      if (process.env.F1KR_FOCUS) {
        await run(`document.querySelectorAll("#board tbody tr")[2].click()`); await wait(300);
        await run(`document.querySelectorAll("#board tbody tr")[3].dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }))`);
        await wait(800);
      }
      if (process.env.F1KR_BEST) { await run(`document.getElementById("lapToggle").click()`); await wait(400); }
      if (process.env.F1KR_MAPTOOLS) { await run(`["mapZoomIn","mapZoomIn","mapRotate"].forEach((id) => document.getElementById(id).click())`); await wait(500); }
      if (process.env.F1KR_TRACE) { await run(`document.getElementById("tabTrace").click()`); await wait(800); }
      if (process.env.F1KR_STRAT) { await run(`document.getElementById("tabStrat").click()`); await wait(800); }
      if (process.env.F1KR_GAP) { await run(`document.getElementById("gapToggle").click()`); await wait(400); }
      if (process.env.F1KR_CHAMP) { await run(`document.getElementById("tabChamp").click()`); await wait(800); }
      if (process.env.F1KR_3D) {
        // F1KR_3D=heli|chase|onboard, optional F1KR_EXPAND=1
        await run(`document.querySelector('.view-switch [data-view="3d"]').click()`); await wait(2500);
        await run(`document.querySelector('[data-cam="${process.env.F1KR_3D}"]')?.click()`);
        if (process.env.F1KR_EXPAND) await run(`document.getElementById("expandMap").click()`);
        await wait(+process.env.F1KR_3D_WAIT || 2500);
        console.log("MAP3D", await run(`window.Map3D?.debug?.()`));
        if (process.env.F1KR_FPS) {
          await run(`document.getElementById("play").click()`);
          console.log("FPS", await run(`new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r((n / 3).toFixed(1)); }; requestAnimationFrame(f); })`));
        }
      }
      if (process.env.F1KR_RADIO) {
        await run(`document.getElementById("tabRadio").click()`); await wait(800);
        if (process.env.F1KR_RADIO === "all") { await run(`document.querySelector('#radioBar [data-rv="all"]').click()`); await wait(500); }
      }
      if (process.env.F1KR_SCHEDULE) { await run(`document.getElementById("scheduleBtn").click()`); await wait(3000); }
    }
    // F1KR_PROFILE=secs: plays the replay (F1KR_SPEED, default 1) and records the page's JavaScript CPU profile for
    // that long into <out>.cpuprofile (Chrome DevTools format); F1KR_PROFILE_JS runs first (e.g. a camera)
    if (process.env.F1KR_PROFILE) {
      if (process.env.F1KR_PROFILE_JS) await run(process.env.F1KR_PROFILE_JS).catch(() => {});
      await run(`(() => { const s = document.getElementById("speed"); s.value = ${JSON.stringify(process.env.F1KR_SPEED || "1")}; s.dispatchEvent(new Event("change")); if (document.getElementById("play").textContent.includes("재생")) document.getElementById("play").click(); })()`);
      await wait(3000);
      const dbg = win.webContents.debugger;
      dbg.attach("1.3");
      await dbg.sendCommand("Profiler.enable");
      await dbg.sendCommand("Profiler.setSamplingInterval", { interval: 200 });
      await dbg.sendCommand("Profiler.start");
      await wait(+process.env.F1KR_PROFILE * 1000);
      const { profile } = await dbg.sendCommand("Profiler.stop");
      dbg.detach();
      fs.writeFileSync(outFile.replace(/\.png$/, "") + ".cpuprofile", JSON.stringify(profile));
      console.log("PROFILE", await run(`JSON.stringify({ ui: window.F1KR.uiCost(), map3d: window.Map3D?.debug ? JSON.parse(window.Map3D.debug()).mem : null })`));
    }
    if (process.env.F1KR_JS) { const r = await run(process.env.F1KR_JS).catch((e) => "error " + e.message); console.log("JSRESULT", typeof r === "string" ? r : JSON.stringify(r)); await wait(+process.env.F1KR_JS_WAIT || 3000); }
    // F1KR_SHOTS="js1;;js2;;…" – runs each, waits, and saves out_1.png, out_2.png, …
    if (process.env.F1KR_SHOTS) {
      const list = process.env.F1KR_SHOTS.split(";;");
      for (const [i, js] of list.entries()) {
        const r = await run(js).catch((e) => "error " + e.message);
        console.log("SHOT", i + 1, typeof r === "string" ? r : JSON.stringify(r));
        await wait(+process.env.F1KR_SHOT_WAIT || 2500);
        // (a shot whose script returns "burst:N:ms[:width]" saves N frames ms apart – out_i_f01.png …; a moving picture)
        const b = typeof r === "string" && /^burst:(\d+):(\d+)(?::(\d+))?/.exec(r);
        if (b) { for (let f = 0; f < +b[1]; f++) { const t0 = Date.now(); fs.writeFileSync(outFile.replace(/\.png$/, `_${i + 1}_f${String(f + 1).padStart(2, "0")}.png`), (await win.webContents.capturePage()).resize({ width: +(b[3] || 960) }).toPNG()); await wait(Math.max(0, +b[2] - (Date.now() - t0))); } continue; }
        fs.writeFileSync(outFile.replace(/\.png$/, `_${i + 1}.png`), (await win.webContents.capturePage()).resize({ width: 1600 }).toPNG());
      }
    }
    if (process.env.F1KR_JS_AFTER) console.log("JSAFTER", await run(process.env.F1KR_JS_AFTER).catch((e) => "error " + e.message));
    fs.writeFileSync(outFile, (await win.webContents.capturePage()).toPNG());
    app.quit();
  });
};
