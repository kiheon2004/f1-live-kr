(() => {
  const $ = (id) => document.getElementById(id);
  // a team colour as F1 sends it ("3671C6"), else the fallback – never anything that could end a style attribute
  const hexColour = (c, fallback) => (/^[0-9a-f]{6}$/i.test(c || "") ? c : fallback);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KST = (opts) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...opts });
  const kstFull = KST({ month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const kstTime = KST({ hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const hms = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return [s / 3600, (s % 3600) / 60, s % 60].map((v) => String(Math.floor(v)).padStart(2, "0")).join(":"); };
  const at = (arrOrObj, i) => (Array.isArray(arrOrObj) ? arrOrObj[i] : arrOrObj?.[i]);
  const lastOf = (arrOrObj) => { const a = Array.isArray(arrOrObj) ? arrOrObj : Object.values(arrOrObj || {}); return a[a.length - 1]; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem("f1kr:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("f1kr:" + k, JSON.stringify(v)); } catch {} },
  };

  // ---------- state ----------
  let mode = "replay", replay = null, src = null;
  let t0 = 0, t1 = 0, tStart = 0;   // replay range: session start (a race: the grid formed) → results confirmed; tStart: the clock starts
  // A race's clock starts at lights out. The bar starts a little earlier, 15 s before the last car stops on the
  // grid, so the start is seen from the standing grid (capped at 2 minutes before the start).
  function gridFormedAt(r, start) {
    if (!/Race/.test(r.state?.SessionInfo?.Type || "")) return start;
    const moving = (t) => { const a = r.positionsAt(t), b = r.positionsAt(t - 1000); let n = 0, all = 0; for (const [k, p] of Object.entries(a)) { const q = b[k]; if (!q) continue; all++; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 15) n++; } return [n, all]; };
    // back from lights out: the grid has formed while (almost) nobody moves
    let formed = null;
    for (let t = start - 1500; t > start - 120000; t -= 1000) {
      const [n, all] = moving(t);
      if (all < 5) break;
      if (n <= Math.max(2, all * 0.15)) formed = t; else if (formed != null) break;   // (pit-lane starters may still be rolling)
    }
    return formed == null ? start : Math.max(start - 120000, formed - 15000);
  }
  let schedule = null, schedulePromise = null;   // season calendar, loaded on first use
  const live = new ReplayKit.LiveSource();
  let liveStatus = { state: "stopped" };
  let sessions = [], replayInfo = null, playing = false, speed = 1, t = 0, lastFrame = 0, lastHeavy = 0;
  let outline = [], outlineFor = null;
  let focus = store.get("focus", null), compare = null, panel = "rc";
  let seenMsgs = 0, prevPos = {};
  let notifyOn = store.get("notify", false);
  let liveKey = null, liveEpoch = 0;

  // ---------- modes ----------
  function setMode(m) {
    mode = m; store.set("mode", m);
    $("modeReplay").setAttribute("aria-selected", String(m === "replay"));
    $("modeLive").setAttribute("aria-selected", String(m === "live"));
    $("replayBar").hidden = m !== "replay"; $("liveBar").hidden = m !== "live"; $("player").hidden = m !== "replay";
    pause();
    src = m === "live" ? (liveStatus.state === "live" || live.state.DriverList || live.queue.length ? live : null) : replay;
    rcCount = -1; seenMsgs = src ? src.messages.length : 0; prevPos = {}; outline = []; outlineFor = null;
    refreshOutline(); refreshTitle(); renderAll(true);
  }
  $("modeReplay").addEventListener("click", () => setMode("replay"));
  $("modeLive").addEventListener("click", () => setMode("live"));

  // ---------- replay picker ----------
  const thisYear = new Date().getFullYear();
  for (let y = thisYear; y >= 2023; y--) $("year").add(new Option(`${y}년`, y));
  $("year").value = store.get("year", thisYear);
  // StartDate is local track time; GmtOffset turns it into UTC.
  const toOffset = (off) => { const m = /^(-?)(\d\d):(\d\d)/.exec(off || "00:00"); return `${m[1] ? "-" : "+"}${m[2]}:${m[3]}`; };

  // (each request numbered: a slow answer for a year since changed doesn't replace the newer list)
  let listReq = 0, loadJob = 0;
  async function loadSessionList() {
    const req = ++listReq;
    store.set("year", +$("year").value);
    $("session").innerHTML = ""; $("loadBar").hidden = true; $("progress").textContent = "목록 불러오는 중…";
    try {
      const list = (await window.api.listSessions(+$("year").value)).reverse();
      if (req !== listReq) return;
      sessions = list;
      for (const s of sessions) {
        const label = `${KO.gpName(s.meeting)} · ${KO.sessionName(s.name)} — ${kstFull.format(new Date(s.start + toOffset(s.gmtOffset)))}`;
        $("session").add(new Option(label, s.path));
      }
      $("progress").textContent = "";
    } catch (e) { if (req === listReq) $("progress").textContent = `목록을 불러오지 못했어요 (${e.message})`; }
  }
  $("year").addEventListener("change", loadSessionList);
  // Loading runs in stages; the bar maps them onto one 0–100%:
  //   download 0–85% (by bytes) → read data 85–93% → hand over to the screen and rebuild 93–100%.
  let loadHideTimer = null;
  function showLoad(pct, text) {
    clearTimeout(loadHideTimer);
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    const bar = $("loadBar");
    bar.hidden = false; bar.classList.toggle("done", pct >= 100);
    bar.firstElementChild.style.width = pct + "%"; bar.setAttribute("aria-valuenow", pct);
    $("progress").textContent = `${text} ${pct}%`;
  }
  const mb = (b) => (b / 1048576).toFixed(1);
  window.api.onProgress((p) => {
    if (p.phase === "download") {
      // Until every file's size is known the total is still growing, so hold the bar near the start.
      const frac = p.total ? p.received / p.total : 0;
      const pct = p.known < p.files ? Math.min(5, frac * 5) : frac * 85;
      showLoad(pct, p.total ? `데이터 받는 중 ${mb(p.received)}/${mb(p.total)}MB ·` : "데이터 받는 중 ·");
    } else if (p.phase === "parse") {
      showLoad(85 + 8 * (p.done / p.total), "데이터 읽는 중 ·");
    }
  });

  $("load").addEventListener("click", async () => {
    const path = $("session").value; if (!path) return;
    const info = sessions.find((s) => s.path === path), job = ++loadJob;   // (what was picked, kept as it was at the click)
    pause(); $("load").disabled = true;
    showLoad(0, "연결 중 ·");
    try {
      const data = await window.api.loadSession(path);
      if (job !== loadJob) return;
      showLoad(95, "화면 준비 중 ·");
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));   // paint 95% before the rebuild
      replay = new ReplayKit.Replay(data);
      replayInfo = info;
      // (switched to live while it downloaded: the replay is ready for when replay is picked again, but the screen
      // stays on live)
      if (mode === "replay") src = replay;
      prevPos = {};
      rcCount = -1; radioKey = ""; traceKey = ""; champKey = ""; stratKey = ""; trendKey = "";
      outline = replay.lapShape() || replayFallbackLap(); if (!outline.length) outline = replay.trackOutline(); outlineFor = "replay";
      // The recording starts long before the session (an hour before a race); the bar covers the session itself.
      tStart = replay.startTime(); replay.seek(tStart);   // (seek first: that reads the session info)
      t0 = gridFormedAt(replay, tStart); t1 = Math.max(tStart + 1000, replay.endTime());
      $("seek").min = t0; $("seek").max = t1;
      for (const id of ["play", "speed", "toStart", "seek"]) $(id).disabled = false;
      refreshTitle();
      seekTo(t0);
      showLoad(100, "준비 완료 ·");
      loadHideTimer = setTimeout(() => { $("loadBar").hidden = true; $("progress").textContent = "준비 완료"; }, 2500);
    } catch (e) { $("loadBar").hidden = true; $("progress").textContent = `불러오지 못했어요 (${e.message})`; }
    finally { $("load").disabled = false; }
  });

  // ---------- replay playback ----------
  function play() { if (!replay || mode !== "replay") return; playing = true; $("play").textContent = "❚❚ 일시정지"; lastFrame = performance.now(); }
  function pause() { playing = false; $("play").textContent = "▶ 재생"; }
  function seekTo(ms) {
    t = Math.max(t0, Math.min(ms, t1)); replay.seek(t);
    seenMsgs = replay.messages.length; prevPos = {}; radioKey = "";   // jumping shouldn't fire alerts
    renderAll(true);
  }
  $("play").addEventListener("click", () => (playing ? pause() : play()));
  $("speed").addEventListener("change", () => { speed = +$("speed").value; });
  $("toStart").addEventListener("click", () => seekTo(t0));   // (a race: the standing grid)
  $("seek").addEventListener("input", () => seekTo(+$("seek").value));
  // Shortcuts. A clicked button keeps the focus, and Space would also press it a second time (play → pause
  // straight away), so the focus is dropped first.
  const typing = (el) => el.closest?.("select, input, textarea, audio, [contenteditable], .splitter");
  document.addEventListener("keydown", (e) => {
    if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "Space" && e.target.closest("button")) e.target.blur();
    if (mode === "live") {
      if (e.code === "Space") { e.preventDefault(); toggleLivePause(); }
      else if (e.key === ",") nudgeDelay(-1); else if (e.key === ".") nudgeDelay(1);
      else if (e.key === "[") nudgeDelay(-5); else if (e.key === "]") nudgeDelay(5);
      return;
    }
    if (mode !== "replay" || !replay) return;
    if (e.code === "Space") { e.preventDefault(); playing ? pause() : play(); }
    else if (e.code === "ArrowRight") { e.preventDefault(); seekTo(t + (e.shiftKey ? 60e3 : 5e3)); }
    else if (e.code === "ArrowLeft") { e.preventDefault(); seekTo(t - (e.shiftKey ? 60e3 : 5e3)); }
  });

  // ---------- live ----------
  live.delayMs = store.get("delay", 0) * 1000;
  $("delay").value = live.delayMs / 1000;
  const MAX_DELAY = 600;
  live.maxDelayMs = MAX_DELAY * 1000;
  const delayText = (s) => (s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`);
  const paintDelay = () => { $("delayOut").textContent = delayText(Math.round(live.delayMs / 1000)); };
  const setDelay = (s) => { s = Math.max(0, Math.min(MAX_DELAY, Math.round(s))); live.delayMs = s * 1000; $("delay").value = s; store.set("delay", s); paintDelay(); };
  const nudgeDelay = (d) => setDelay(live.delayMs / 1000 + d);
  paintDelay();
  $("delay").addEventListener("input", () => setDelay(+$("delay").value));
  for (const [id, d] of [["delayMinus5", -5], ["delayMinus", -1], ["delayPlus", 1], ["delayPlus5", 5]]) $(id).addEventListener("click", () => nudgeDelay(d));
  // Pause along with a paused stream; resuming adds the paused time to the delay so the two stay in step.
  function paintLivePause() {
    $("livePause").textContent = live.paused ? "▶ 이어서" : "❚❚ 멈춤";
    $("livePause").setAttribute("aria-pressed", String(live.paused));
    $("livePause").classList.toggle("primary", live.paused);
  }
  function toggleLivePause() {
    if (!live.paused) { live.pause(); toast("실시간 화면을 멈췄어요. TV를 다시 재생할 때 이어서를 누르세요.", ""); }
    else {
      const extra = live.resume();
      if (live.delayMs > MAX_DELAY * 1000) { live.delayMs = MAX_DELAY * 1000; toast(`지연은 최대 ${MAX_DELAY / 60}분이라 그 이상은 따라잡았어요.`, "red"); }
      setDelay(live.delayMs / 1000);
      if (extra > 1000) toast(`멈춘 ${Math.round(extra / 1000)}초만큼 지연을 늘렸어요 (지금 ${$("delayOut").textContent}).`, "good");
    }
    paintLivePause();
  }
  $("livePause").addEventListener("click", toggleLivePause);
  // Window stays on top of a full-screen stream when pinned.
  let pinned = store.get("pin", false);
  const paintPin = () => { $("pinBtn").setAttribute("aria-pressed", String(pinned)); $("pinBtn").classList.toggle("signed", pinned); };
  $("pinBtn").addEventListener("click", () => { pinned = !pinned; store.set("pin", pinned); window.api.pinWindow(pinned); paintPin(); });
  if (pinned) window.api.pinWindow(true);
  paintPin();
  // Compact timing tower beside a full-screen stream.
  let compactOn = false;
  function setCompact(on) {
    compactOn = on;
    document.body.classList.toggle("compact", on);
    $("compactBtn").setAttribute("aria-pressed", String(on)); $("compactBtn").classList.toggle("signed", on);
    window.api.compactWindow(on);
    if (on && !pinned) toast("📌 위에 고정도 함께 켜면 중계 화면 위에 계속 떠 있어요.", "");
    setTimeout(() => { applySizes(); renderAll(true); }, 250);
  }
  $("compactBtn").addEventListener("click", () => setCompact(!compactOn));

  // ---------- sync with the TV broadcast ----------
  const syncMsg = (text, bad = false) => { $("syncMsg").textContent = text; $("syncMsg").classList.toggle("bad", bad); };
  function applySync(sec, how) {
    if (sec == null) return;
    if (sec < 0) return syncMsg("TV가 실시간 데이터보다 빨라요. 입력한 시간을 다시 확인해 주세요.", true);
    if (sec > MAX_DELAY) return syncMsg(`계산된 지연이 ${sec}초예요. 최대 ${MAX_DELAY / 60}분까지만 맞출 수 있어요.`, true);
    setDelay(sec); syncMsg(`${how} 기준으로 지연을 ${$("delayOut").textContent}로 맞췄어요.`);
  }
  $("syncBtn").addEventListener("click", () => {
    const open = $("syncPop").hidden;
    $("syncPop").hidden = !open; $("syncBtn").setAttribute("aria-expanded", String(open));
    if (open) { syncMsg(""); $("syncClock").focus(); }
  });
  $("syncClockBtn").addEventListener("click", () => {
    if (liveStatus.state !== "live") return syncMsg("먼저 실시간에 연결해 주세요.", true);
    const v = $("syncClock").value.trim();
    if (!/^\d{1,2}(:\d{1,2}){1,2}$/.test(v)) return syncMsg("TV 화면의 남은 시간을 '23:45'처럼 입력해 주세요.", true);
    const sec = live.delayFromTvClock(v);
    if (sec == null) return syncMsg("지금은 세션 시계가 멈춰 있어요. 시계가 흐를 때 다시 해 주세요.", true);
    applySync(sec, "TV 시계");
  });
  $("syncClock").addEventListener("keydown", (e) => { if (e.key === "Enter") $("syncClockBtn").click(); });
  $("syncLapBtn").addEventListener("click", () => {
    if (liveStatus.state !== "live") return syncMsg("먼저 실시간에 연결해 주세요.", true);
    const sec = live.delayFromLapPress();
    if (sec == null) return syncMsg("아직 랩 정보가 들어오지 않았어요. 레이스 중에 써 주세요.", true);
    applySync(sec, `${live.rawLap.lap}랩 시작`);
  });
  document.addEventListener("click", (e) => {
    if (!$("syncPop").hidden && !e.target.closest("#syncPop, #syncBtn")) { $("syncPop").hidden = true; $("syncBtn").setAttribute("aria-expanded", "false"); }
  });

  const LIVE_LABEL = { stopped: ["연결 안 됨", ""], connecting: ["연결 중…", "warn"], reconnecting: ["다시 연결 중…", "warn"], error: ["오류", "bad"], live: ["실시간 수신 중", "ok"] };
  window.api.live.onStatus((s) => {
    liveStatus = s;
    const [text, cls] = LIVE_LABEL[s.state] || [s.state, ""];
    $("liveState").textContent = s.state === "live" ? `${text}${s.positions ? " · 차량 위치 포함" : ""}` : s.state === "error" ? `${text}: ${s.message || ""}` : text;
    $("liveState").className = "chip " + cls;
    $("liveDot").classList.toggle("on", s.state === "live");
    $("liveToggle").textContent = s.state === "stopped" ? "연결" : "연결 끊기";
    if (mode === "live") { src = s.state === "live" ? live : src; refreshOutline(); renderAll(true); }
  });
  window.api.live.onSnapshot((snap) => {
    live.snapshot(snap);
    if (mode === "live") { src = live; refreshOutline(); renderAll(true); }
  });
  window.api.live.onFeed((topic, data) => live.push(topic, data));
  $("liveToggle").addEventListener("click", () => (liveStatus.state === "stopped" ? window.api.live.start() : window.api.live.stop()));

  // Live circuit shape, best first: one clean lap from an earlier session here (it has elevation for 3D),
  // then the MultiViewer outline, then a lap traced from the live car positions once one is complete.
  // (A couple of minutes of live samples is only part of a lap, so it is never used on its own.)
  let outlineLoading = false, liveLap = [], liveLapFor = null;
  async function refreshOutline() {
    if (mode === "replay") { outline = replay ? replay.lapShape() || replay.trackOutline() : []; return; }
    if (!src) return;
    const loc = live.state.SessionInfo?.Meeting?.Location;
    if (loc && liveLapFor !== loc) {
      liveLapFor = loc; liveLap = []; outline = []; outlineLoading = true;
      const got = await window.api.trackOutline(loc).catch(() => []);
      if (liveLapFor !== loc) return;
      liveLap = got; outlineLoading = false;
    }
    outline = liveLap;
  }
  const liveShape = () => (liveLap.length ? liveLap : circuit?.outline?.length ? circuit.outline : live.trackOutline());
  // The note under the live map explains what's missing; worked out from the current state every frame.
  function paintMapNote(hasShape) {
    let note = "";
    if (mode === "live" && src === live && live.state.SessionInfo) {
      if (!hasShape && !outlineLoading) note = liveStatus.positions ? "서킷 모양을 그리는 중이에요. 차가 한 바퀴를 돌면 맵이 나타나요." : "이 서킷은 아직 주행 기록이 없어 맵을 그릴 수 없어요. 첫 세션이 끝나면 표시돼요.";
      else if (hasShape && !liveStatus.positions) note = "차량 위치는 F1 TV로 로그인하면 표시돼요.";
    }
    if ($("mapNote").textContent !== note) $("mapNote").textContent = note;
    $("mapNote").hidden = !note;
  }

  // ---------- frame loop ----------
  function frame(now) {
    // (a live connection keeps its state current while a replay is on screen, so its queue doesn't pile up)
    if (mode !== "live" && live.queue.length) live.tick();
    if (mode === "replay" && playing && replay) {
      t += (now - lastFrame) * speed; lastFrame = now;
      if (t >= t1) { t = t1; pause(); }
      replay.seek(t);
      renderAll(now - lastHeavy > 250);
    } else if (mode === "live" && src === live) {
      live.tick();
      // A new session, or a fresh snapshot after a reconnect: lists start over and old messages don't alert again.
      const key = live.state.SessionInfo?.Key;
      if (key !== liveKey || live.epoch !== liveEpoch) {
        const newSession = key !== liveKey;
        liveKey = key; liveEpoch = live.epoch;
        rcCount = -1; radioKey = ""; traceKey = ""; champKey = ""; stratKey = ""; trendKey = ""; seenMsgs = live.messages.length; prevPos = {};
        if (newSession) { circuitFor = null; refreshOutline(); }
        refreshTitle(); renderAll(true);
      }
      renderAll(now - lastHeavy > 250);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const uiCost = {};   // development: time spent per panel (window.F1KR.uiCost)
  function renderAll(heavy) {
    if (window.F1KR_NOUI && heavy) heavy = false;
    if (mode === "replay") { $("seek").value = t; $("elapsed").textContent = `${t < tStart ? `출발 전 ${hms(tStart - t + 999).slice(3)}` : hms(t - tStart)} / ${hms(t1 - tStart)}`; }
    drawMap();
    if (!heavy) return;
    lastHeavy = performance.now();
    paintIdle();
    if (!src) { $("board").tBodies[0].innerHTML = ""; $("rc").innerHTML = ""; renderDriver(); return; }
    const T = (name, fn) => { const a = performance.now(); fn(); const d = performance.now() - a; const s = uiCost[name] || (uiCost[name] = { n: 0, total: 0, max: 0 }); s.n++; s.total += d; s.max = Math.max(s.max, d); };
    T("status", renderStatus); T("board", renderBoard); T("rc", renderRC); T("driver", renderDriver); T("radio", renderRadio); T("strat", renderStrat); T("trace", renderTrace); T("champ", renderChamp); T("mini", renderMiniBoard); T("alerts", checkAlerts);
  }

  // ---------- titles & status strip ----------
  const sessionType = () => src?.state.SessionInfo?.Type || "";
  const isSprint = () => /Sprint/.test(src?.state.SessionInfo?.Name || "");
  function refreshTitle() {
    if (!src) { $("title").textContent = mode === "live" ? "실시간: 연결하면 지금 진행 중인 세션이 표시돼요" : "세션을 골라 불러오세요"; return; }
    const si = src.state.SessionInfo || {};
    if (src.isLive && !si.Name) { $("title").textContent = "실시간: 세션 정보를 기다리는 중…"; return; }
    const meeting = si.Meeting?.Name || (src.isLive ? "" : replayInfo?.meeting), name = si.Name || (src.isLive ? "" : replayInfo?.name);
    $("title").textContent = `${KO.gpName(meeting)} · ${KO.sessionName(name)}`;
  }
  const parseClock = (s) => { const m = /^(\d+):(\d\d):(\d\d)/.exec(s || ""); return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 : null; };
  function renderStatus() {
    const s = src.state;
    const ts = KO.TRACK_STATUS[s.TrackStatus?.Status] || { ko: "—", cls: "" };
    $("trackStatus").textContent = ts.ko; $("trackStatus").className = "pill " + ts.cls;
    const part = s.TimingData?.SessionPart;
    $("part").hidden = !(sessionType() === "Qualifying" && part);
    $("part").textContent = `${isSprint() ? "SQ" : "Q"}${part}`;
    const lc = s.LapCount;
    $("lap").innerHTML = lc?.CurrentLap ? `랩 <b>${esc(lc.CurrentLap)}</b> / ${esc(lc.TotalLaps || "?")}` : "";
    const clk = s.ExtrapolatedClock;
    let rem = parseClock(clk?.Remaining);
    if (rem != null && clk.Extrapolating) { const nowUtc = src.utcAt(src.now()); if (nowUtc) rem -= nowUtc - ReplayKit.parseUtc(clk.Utc); }
    $("clock").innerHTML = rem != null ? `남은 시간 <b>${hms(Math.max(0, rem))}</b>` : "";
    // In qualifying "Finished"/"Inactive" also happen between Q1, Q2 and Q3, so name the part.
    const st = s.SessionStatus?.Status, qp = sessionType() === "Qualifying" ? s.TimingData?.SessionPart : null, qn = `${isSprint() ? "SQ" : "Q"}${qp}`;
    const ss = qp && st === "Finished" && qp < 3 ? `${qn} 종료` : qp && st === "Inactive" && qp > 1 ? `${qn} 시작 전` : qp && st === "Started" ? `${qn} 진행 중`
      : { Inactive: "시작 전", Started: "진행 중", Aborted: "중단", Finished: "종료", Finalised: "결과 확정", Ends: "세션 종료" }[st];
    $("sessStatus").hidden = !ss; $("sessStatus").textContent = ss || "";
    $("sessStatus").className = "chip " + (s.SessionStatus?.Status === "Started" ? "ok" : "");
    const w = s.WeatherData;
    $("weather").innerHTML = w ? `기온 <b>${esc(w.AirTemp)}°</b> 노면 <b>${esc(w.TrackTemp)}°</b> 습도 ${esc(w.Humidity)}% 풍속 ${esc(w.WindSpeed)}m/s${w.Rainfall === "1" ? " · <b>비</b>" : ""}` : "";
  }

  // ---------- leaderboard ----------
  const koGap = (v) => String(v ?? "").replace(/^LAP (\d+)$/, "$1랩").replace(/^\+?(\d+) LAPS?$/, "+$1랩").replace(/^\+?(\d+) ?L$/, "+$1랩");
  // Mini-sectors: F1 marks each timing segment 2048 yellow, 2049 personal best, 2051 overall best, 2064 pit lane.
  const SEG = { 2048: "y", 2049: "g", 2051: "p", 2064: "pit" };
  const miniSectors = (sec) => {
    const segs = Array.isArray(sec?.Segments) ? sec.Segments : Object.values(sec?.Segments || {});
    return segs.length ? `<div class="segs">${segs.map((g) => `<i class="${SEG[g?.Status] || ""}"></i>`).join("")}</div>` : "";
  };
  const sectorCls = (s) => (s?.OverallFastest ? "s-purple" : s?.PersonalFastest ? "s-green" : s?.Value ? "s-yellow" : "");
  const HEADERS = {
    Race: ["리더와 차이", "선두와의 시간 차이(초). '1랩'은 선두에게 한 바퀴 뒤처졌다는 뜻이에요", "앞 차와 간격", "바로 앞 차와의 시간 차이(초). 1초 이내는 추월 사정권이라 초록으로 표시해요"],
    Qualifying: ["1위와 차이", "이번 단계(Q1·Q2·Q3)에서 가장 빠른 기록과의 차이", "앞 순위와 차이", "바로 앞 순위 드라이버 기록과의 차이"],
    Practice: ["1위와 차이", "이 세션 가장 빠른 기록과의 차이", "앞 순위와 차이", "바로 앞 순위 드라이버 기록과의 차이"],
  };
  const lines0 = () => src?.state.TimingData?.Lines || {};
  function rowsNow() {
    const s = src.state, lines = s.TimingData?.Lines || {}, drivers = s.DriverList || {};
    return Object.entries(lines).filter(([n]) => drivers[n]?.Tla)
      .sort((a, b) => (+a[1].Position || 99) - (+b[1].Position || 99) || (+a[1].Line || 99) - (+b[1].Line || 99));
  }
  // Lap column shows the last lap, or (toggled from the header) each driver's personal best.
  let lapMode = store.get("lapMode", "last");
  function paintLapToggle() {
    $("lapLabel").textContent = lapMode === "best" ? "개인 최고 랩" : "랩타임";
    $("lapToggle").setAttribute("aria-pressed", String(lapMode === "best"));
  }
  $("lapToggle").addEventListener("click", () => { lapMode = lapMode === "best" ? "last" : "best"; store.set("lapMode", lapMode); paintLapToggle(); renderAll(true); });
  paintLapToggle();
  const pill = (v, cls) => (v ? `<span class="lap ${cls}">${esc(v)}</span>` : "");
  // Out-laps, in-laps and laps that include time in the pits read like "6:15.879": shown dimmed.
  const slowLap = (v, fastest) => { const x = ReplayKit.toSec(v); return x && Number.isFinite(fastest) && x > fastest * 1.3; };

  // Gap column basis (races): the leader, or the focused driver ("내 드라이버 기준" – how far everyone is from them).
  let gapMode = store.get("gapMode", "leader");
  $("gapToggle").addEventListener("click", () => {
    gapMode = gapMode === "focus" ? "leader" : "focus"; store.set("gapMode", gapMode);
    if (gapMode === "focus" && !focus) toast("순위표에서 기준이 될 드라이버를 먼저 눌러 주세요.", "");
    renderAll(true);
  });
  const fmtRel = (d) => (Math.abs(d) < 0.0005 ? "0.000" : `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(3)}`);

  // Interval trend: how the gap to the car ahead changed over the last 3 laps (from both cars' lap times).
  // Negative = closing in. Worked out once per new lap.
  const TREND_LAPS = 3;
  let trendKey = "", trends = {};
  function intervalTrends(rows) {
    const key = rows.map(([n]) => n).join(",") + "|" + rows.reduce((a, [n]) => a + src.laps(n).length, 0);
    if (key === trendKey) return trends;
    trendKey = key; trends = {};
    const cum = {};
    for (const [n] of rows) {
      const m = new Map(); let total = 0, expect = null;
      for (const x of src.laps(n)) { if (!x.sec || (expect != null && x.lap !== expect)) break; total += x.sec; m.set(x.lap, total); expect = x.lap + 1; }
      cum[n] = m;
    }
    for (let i = 1; i < rows.length; i++) {
      const me = cum[rows[i][0]], ahead = cum[rows[i - 1][0]];
      const lap = Math.min(Math.max(0, ...me.keys()), Math.max(0, ...ahead.keys()));
      const was = lap - TREND_LAPS;
      if (!me.has(lap) || !ahead.has(lap) || !me.has(was) || !ahead.has(was)) continue;
      // A pit stop by either car in the window moves the gap by ~20 s: that isn't a fight on track.
      const pitted = (n) => src.pits(n).some((p) => p.lap > was && p.lap <= lap + 1) || src.pitStops(n).some((p) => p.lap > was && p.lap <= lap + 1);
      if (pitted(rows[i][0]) || pitted(rows[i - 1][0])) continue;
      const nowGap = me.get(lap) - ahead.get(lap), thenGap = me.get(was) - ahead.get(was);
      if (Math.abs(nowGap - thenGap) > 8) continue;   // neutralised laps or missing data, not pace
      trends[rows[i][0]] = nowGap - thenGap;
    }
    return trends;
  }
  const trendTag = (d) => (d == null || Math.abs(d) < 0.1 ? ""
    : `<small class="trend ${d < 0 ? "closing" : "falling"}" title="최근 ${TREND_LAPS}랩 동안 앞 차와 간격이 ${Math.abs(d).toFixed(1)}초 ${d < 0 ? "줄었어요 (추격 중)" : "늘었어요"}">${d < 0 ? "▼" : "▲"}${Math.abs(d).toFixed(1)}</small>`);

  // Places that go through: Q1 drops (cars − 10) / 2 (6 of 22, 5 of 20), Q2 leaves 10 for Q3, Q3 has no line.
  function qualiCutoff(cars, part) {
    if (part === 1) return cars - Math.max(0, Math.round((cars - 10) / 2));
    if (part === 2) return 10;
    return null;
  }

  function renderBoard() {
    const s = src.state, drivers = s.DriverList || {}, app = s.TimingAppData?.Lines || {};
    const type = sessionType() || "Race", part = (s.TimingData?.SessionPart || 1) - 1;
    const h = HEADERS[type] || HEADERS.Race;
    // (A lapped focus driver has no time gap to compare with, so the column stays on the leader.)
    const rel = type === "Race" && gapMode === "focus" && focus && ReplayKit.gapSec(lines0()[focus]?.GapToLeader) != null;
    const focusD = rel ? drivers[focus] : null;
    $("hGap").textContent = rel ? `${KO.surname(focusD?.Tla, focusD?.LastName)} 기준` : h[0];
    $("gapToggle").title = type === "Race" ? (rel ? "집중 드라이버와의 시간 차이(초) · + 는 뒤, − 는 앞 · 누르면 선두 기준으로 바꿔요" : `${h[1]} · 누르면 집중 드라이버 기준으로 바꿔요`) : h[1];
    $("gapToggle").setAttribute("aria-pressed", String(!!rel)); $("gapToggle").disabled = type !== "Race";
    $("hInt").textContent = h[2]; $("hInt").title = h[3];
    const rows = rowsNow();
    const trend = type === "Race" ? intervalTrends(rows) : {};
    const focusGap = rel ? ReplayKit.gapSec(lines0()[focus].GapToLeader) : null;
    const deleted = ReplayKit.deletedLaps(src.messages, drivers);
    // Qualifying elimination line: drawn once, under the last place that goes through to the next part.
    // (F1's own per-driver "Cutoff" flag marks everyone without a time early in Q1, so it can't be used.)
    const cutAfter = type === "Qualifying" ? qualiCutoff(Object.keys(drivers).length, part + 1) : null;
    // Personal best per driver (in qualifying: for the current Q part), and the fastest of them all.
    const bestOf = (l) => (type === "Qualifying" ? at(l.BestLapTimes, part)?.Value : "") || l.BestLapTime?.Value || "";
    let fastest = Infinity;
    for (const [, l] of rows) { const v = ReplayKit.toSec(bestOf(l)); if (v) fastest = Math.min(fastest, v); }
    $("board").tBodies[0].innerHTML = rows.map(([num, l]) => {
      const d = drivers[num], a = app[num] || {};
      const stint = lastOf(src.stints(num)), ty = KO.TYRES[stint?.Compound];
      const sectors = Array.isArray(l.Sectors) ? l.Sectors : Object.values(l.Sectors || {});
      let gap, interval;
      const best = bestOf(l);
      if (type === "Qualifying") {
        const st = at(l.Stats, part) || {};
        gap = st.TimeDiffToFastest || ""; interval = st.TimeDifftoPositionAhead || "";
      } else if (type === "Practice") {
        gap = l.TimeDiffToFastest || ""; interval = l.TimeDiffToPositionAhead || "";
      } else {
        gap = /^LAP \d+$/.test(l.GapToLeader || "") ? "선두" : koGap(l.GapToLeader);
        interval = /^LAP \d+$/.test(l.IntervalToPositionAhead?.Value || "") ? "" : koGap(l.IntervalToPositionAhead?.Value);
      }
      if (rel) {
        const g = ReplayKit.gapSec(l.GapToLeader);
        gap = num === focus ? "기준" : g != null && focusGap != null ? fmtRel(g - focusGap) : gap;
      }
      const close = type === "Race" && /^\+?0\.\d+$/.test(interval);
      const grid = +a.GridPos, pos = +l.Position;
      const chg = type === "Race" && grid && pos ? grid - pos : 0;
      const state = l.Retired ? "리타이어" : l.Stopped ? "정지" : l.KnockedOut ? "탈락" : l.InPit ? "피트" : l.PitOut ? "피트 아웃" : "";
      // Deleted laps: in races every track limits deletion is a strike (the 4th brings a penalty).
      const del = deleted[num] || [];
      const strikes = del.filter((x) => x.limits).length;
      const delTag = !del.length ? "" : `<span class="del${type === "Race" && strikes >= 3 ? " warn" : ""}" title="${esc((type === "Race" ? `트랙 리밋 위반 ${strikes}회 (3회째 흑백기, 그 뒤로는 페널티)\n` : `삭제된 기록 ${del.length}개\n`) + del.map((x) => KO.translate(x.msg) || x.msg).join("\n"))}">${type === "Race" && strikes ? `TL ${strikes}` : `삭제 ${del.length}`}</span>`;
      const cls = [l.Retired || l.Stopped || l.KnockedOut ? "out" : "", num === focus ? "focus" : num === compare ? "compare" : "", +l.Position === cutAfter ? "cutoff" : ""].join(" ");
      return `<tr class="${cls}" data-num="${esc(num)}">
        <td class="pos">${esc(l.Position || "")}</td>
        <td class="chg">${chg > 0 ? `<span class="up"><b>↑</b>${chg}</span>` : chg < 0 ? `<span class="down"><b>↓</b>${-chg}</span>` : type === "Race" && grid ? `<span class="same">–</span>` : ""}</td>
        <td class="drv" title="${esc(`${KO.DRIVERS[d.Tla] || d.FullName} · ${num}번 · ${KO.TEAMS[d.TeamName] || d.TeamName}`)}"><div class="drv-in"><span class="team-bar" style="background:#${esc(hexColour(d?.TeamColour, "888"))}"></span>
          <span class="name">${esc(KO.surname(d.Tla, d.LastName))}</span><span class="tla">${esc(d.Tla)}</span><span class="team">${esc(KO.TEAMS[d.TeamName] || d.TeamName)}</span></div></td>
        <td class="time c">${esc(gap)}</td>
        <td class="time c ${close ? "close" : ""}">${esc(interval)}${trendTag(trend[num])}</td>
        <td class="c">${lapMode === "best"
          ? pill(best, ReplayKit.toSec(best) === fastest ? "purple" : "green")
          : pill(l.LastLapTime?.Value, l.LastLapTime?.OverallFastest ? "purple" : l.LastLapTime?.PersonalFastest ? "green" : slowLap(l.LastLapTime?.Value, fastest) ? "slow" : "")}</td>
        ${[0, 1, 2].map((i) => `<td class="time c sec ${sectorCls(sectors[i])}"><span>${esc(sectors[i]?.Value || "")}</span>${miniSectors(sectors[i])}</td>`).join("")}
        <td class="c">${ty ? `<span class="tyre" title="${esc(ty.ko)}${stint.New === "true" ? " (새 타이어)" : " (중고 타이어)"} · 이 타이어로 ${esc(stint.TotalLaps ?? 0)}랩"><i style="border-color:${ty.color};color:${ty.color}">${ty.short}</i><span style="color:${ty.color}">${esc(stint.TotalLaps ?? "")}</span></span>` : ""}</td>
        <td class="c">${esc(l.NumberOfPitStops ?? (type === "Race" && l.Position ? 0 : ""))}</td>
        <td class="state">${state}${delTag}</td></tr>`;
    }).join("");
  }
  // Click: focus a driver. Shift+click: add a second driver to compare.
  $("board").tBodies[0].addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-num]"); if (!tr) return;
    const n = tr.dataset.num;
    if (e.shiftKey && focus && n !== focus) compare = compare === n ? null : n;
    else { focus = focus === n ? null : n; if (compare === focus) compare = null; store.set("focus", focus); }
    if (focus) setPanel("driver");
    renderAll(true);
  });

  // ---------- race control ----------
  let rcCount = -1;
  function rcClass(m) {
    return /RED FLAG/.test(m.Message) ? "flag-red" : m.Category === "SafetyCar" ? "sc" : /YELLOW/.test(m.Flag || "") ? "flag-yellow" : /PENALTY/.test(m.Message) ? "penalty" : "";
  }
  // Message kinds for the filter chips above the list.
  const RC_KINDS = [
    ["all", "전체", () => true],
    ["flag", "깃발", (m) => m.Category === "Flag" && !/TRACK LIMITS/.test(m.Message)],
    ["sc", "세이프티카", (m) => m.Category === "SafetyCar" || /SAFETY CAR|\bVSC\b/.test(m.Message)],
    ["steward", "조사·페널티", (m) => /PENALTY|INVESTIGAT|STEWARDS|NOTED|NO FURTHER|INCIDENT/.test(m.Message)],
    ["limits", "트랙 리밋", (m) => /TRACK LIMITS|DELETED/.test(m.Message)],
  ];
  let rcKind = store.get("rcKind", "all");
  $("rcFilter").addEventListener("click", (e) => {
    const k = e.target.closest("button[data-kind]")?.dataset.kind; if (!k) return;
    rcKind = k; store.set("rcKind", k); rcCount = -1; renderRC();
  });
  function renderRC() {
    const msgs = src.messages;
    if (msgs.length === rcCount) return; rcCount = msgs.length;
    $("rcFilter").innerHTML = RC_KINDS.map(([k, label, fn]) => {
      const n = k === "all" ? msgs.length : msgs.filter(fn).length;
      return `<button data-kind="${k}" aria-pressed="${k === rcKind}"${n || k === "all" ? "" : " disabled"}>${label} <span>${n}</span></button>`;
    }).join("");
    const keep = (RC_KINDS.find(([k]) => k === rcKind) || RC_KINDS[0])[2];
    const shown = msgs.filter(keep);
    if (!shown.length) { $("rc").innerHTML = `<li class="empty-li">${msgs.length ? "이 종류의 메시지는 아직 없어요." : "레이스 컨트롤 메시지가 오면 여기에 한국어로 보여 줘요."}</li>`; return; }
    $("rc").innerHTML = shown.slice().reverse().map((m) => {
      const ko = KO.translate(m.Message);
      const time = m.Utc ? kstTime.format(new Date(m.Utc + (/Z$/.test(m.Utc) ? "" : "Z"))) : "";
      return `<li class="${rcClass(m)}"><div class="meta"><span>${time} KST</span>${m.Lap ? `<span>${m.Lap}랩</span>` : ""}</div>
        <div class="ko">${esc(ko || m.Message)}</div>${ko ? `<div class="en">${esc(m.Message)}</div>` : ""}</li>`;
    }).join("");
  }

  // ---------- alerts ----------
  function toast(text, cls = "") {
    const el = document.createElement("div");
    el.className = "toast " + cls; el.textContent = text;
    const box = $("toasts"); box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => el.remove(), 7000);
  }
  function alertOut(text, cls) {
    toast(text, cls);
    if (notifyOn && mode === "live") window.api.notify("라이브 타이밍 KR", text);
  }
  function checkAlerts() {
    const msgs = src.messages;
    for (let i = seenMsgs; i < msgs.length; i++) {
      const m = msgs[i], ko = KO.translate(m.Message) || m.Message;
      if (/RED FLAG/.test(m.Message)) alertOut("🟥 " + ko, "red");
      else if (m.Category === "SafetyCar" && /DEPLOYED|ENDING|IN THIS LAP/.test(m.Message)) alertOut("🟧 " + ko, "sc");
      else if (/PENALTY FOR CAR|CHEQUERED FLAG/.test(m.Message) && !/SERVED/.test(m.Message)) alertOut(ko, "");
    }
    seenMsgs = msgs.length;
    // Position changes of the drivers you follow.
    const lines = src.state.TimingData?.Lines || {}, drivers = src.state.DriverList || {};
    for (const n of [focus, compare].filter(Boolean)) {
      const p = +lines[n]?.Position, before = prevPos[n];
      if (p && before && p !== before && drivers[n]) {
        const name = KO.DRIVERS[drivers[n].Tla] || drivers[n].Tla;
        toast(`${name} ${before}위 → ${p}위`, p < before ? "good" : "red");
      }
      if (p) prevPos[n] = p;
    }
  }
  $("notify").checked = notifyOn;
  $("notify").addEventListener("change", () => { notifyOn = $("notify").checked; store.set("notify", notifyOn); });

  // ---------- right panel tabs ----------
  function setPanel(p) {
    panel = p;
    for (const [id, key] of [["tabRC", "rc"], ["tabDriver", "driver"], ["tabRadio", "radio"], ["tabStrat", "strat"], ["tabTrace", "trace"], ["tabChamp", "champ"]]) $(id).setAttribute("aria-selected", String(p === key));
    $("rc").hidden = $("rcFilter").hidden = p !== "rc"; $("driver").hidden = p !== "driver"; $("radio").hidden = $("radioBar").hidden = p !== "radio"; $("trace").hidden = p !== "trace"; $("champ").hidden = p !== "champ";
    $("strat").hidden = p !== "strat";
    radioKey = ""; traceKey = ""; champKey = ""; stratKey = ""; renderDriver(); if (src) { renderRadio(); renderTrace(); renderChamp(); renderStrat(); }
  }
  $("tabRC").addEventListener("click", () => setPanel("rc"));
  $("tabDriver").addEventListener("click", () => setPanel("driver"));
  $("tabRadio").addEventListener("click", () => setPanel("radio"));
  $("tabTrace").addEventListener("click", () => setPanel("trace"));
  $("tabStrat").addEventListener("click", () => setPanel("strat"));
  $("tabChamp").addEventListener("click", () => setPanel("champ"));

  // ---------- tyre strategy: every driver's stints on one lap axis ----------
  // Stint laps come from TimingAppData (TotalLaps = tyre age now, StartLaps = age when fitted), so used tyres
  // count only the laps run in this session. Hatched = used set when fitted.
  let stratKey = "";
  function renderStrat() {
    if (panel !== "strat" || !src) return;
    const box = $("strat"), drivers = src.state.DriverList || {}, app = src.state.TimingAppData?.Lines || {};
    const rows = rowsNow();
    const key = JSON.stringify([rows.map(([n, l]) => [n, l.Position, l.Retired]), app, focus, src.state.LapCount]);
    if (key === stratKey) return; stratKey = key;
    const list = rows.map(([n, l]) => {
      const stints = src.stints(n);
      let from = 0;
      const parts = stints.map((x) => { const laps = Math.max(0, (x.TotalLaps || 0) - (x.StartLaps || 0)); const p = { x, from, laps }; from += laps; return p; });
      return { n, l, parts, run: from };
    });
    const race = /Race/.test(sessionType());
    const total = Math.max(1, race ? +src.state.LapCount?.TotalLaps || 0 : 0, ...list.map((r) => r.run));
    const now = race ? +src.state.LapCount?.CurrentLap || 0 : 0;
    if (!list.some((r) => r.parts.length)) { box.innerHTML = `<p class="empty">타이어 정보가 들어오면 드라이버별 스틴트를 보여 줘요.</p>`; return; }
    const pct = (v) => `${(v / total) * 100}%`;
    const ticks = [];
    const step = total > 40 ? 10 : 5;
    for (let k = step; k < total; k += step) ticks.push(`<i style="left:${pct(k)}"><span>${k}</span></i>`);
    box.innerHTML = `<div class="strat-head"><span class="muted">${race ? `랩 ${now || "–"} / ${total}` : `최대 ${total}랩`} · 빗금: 중고 타이어로 시작</span>
      <span class="legend">${Object.values(KO.TYRES).map((t) => `<span><i style="background:${t.color}"></i>${t.ko}</span>`).join("")}</span></div>
      <ol class="strat-list">${list.map(({ n, l, parts }) => {
        const d = drivers[n] || {};
        return `<li class="${n === focus ? "focus" : ""}${l.Retired || l.Stopped ? " out" : ""}" data-num="${esc(n)}">
          <span class="p">${esc(l.Position || "")}</span><span class="b" style="background:#${esc(hexColour(d?.TeamColour, "888"))}"></span><b>${esc(d.Tla || n)}</b>
          <div class="lane">${ticks.join("")}${race && now ? `<em class="now" style="left:${pct(Math.min(total, now))}"></em>` : ""}${parts.map(({ x, from, laps }) => {
            const ty = KO.TYRES[x.Compound] || { short: "?", color: "#666", ko: x.Compound || "알 수 없음" };
            return `<div class="st${x.New === "false" ? " used" : ""}" style="left:${pct(from)};width:${pct(Math.max(laps, 0.6))};--c:${ty.color}" title="${esc(`${ty.ko} · ${from + 1}~${from + laps}랩 (${laps}랩)${x.New === "false" ? ` · 중고 타이어 (${x.StartLaps}랩 사용)` : " · 새 타이어"}`)}">${laps >= 3 ? `${ty.short}${laps}` : ""}</div>`;
          }).join("")}</div></li>`;
      }).join("")}</ol>`;
  }
  $("strat").addEventListener("click", (e) => {
    const n = e.target.closest("[data-num]")?.dataset.num; if (!n) return;
    focus = n; store.set("focus", focus); renderAll(true);
  });

  // ---------- championship as it would stand if the race ended now ----------
  let champKey = "", champKind = store.get("champKind", "drivers");
  const paintChampKind = () => document.querySelectorAll("#champ .seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cs === champKind)));
  document.querySelectorAll("#champ .seg button").forEach((b) => b.addEventListener("click", () => { champKind = b.dataset.cs; store.set("champKind", champKind); paintChampKind(); champKey = ""; renderChamp(); }));
  paintChampKind();
  // Feed team names are full entries ("Atlassian Williams Mercedes", "Haas Ferrari"); the team's own name comes
  // first and the engine maker last, so take the Korean name whose key appears earliest.
  const teamKo = (name) => {
    if (KO.TEAMS[name]) return KO.TEAMS[name];
    const hits = Object.entries(KO.TEAMS).map(([k, ko]) => [name.indexOf(k.replace(/ F1 Team$/, "")), ko]).filter(([i]) => i >= 0);
    return hits.sort((a, b) => a[0] - b[0])[0]?.[1] || name;
  };
  function renderChamp() {
    if (panel !== "champ" || !src) return;
    const cp = src.state.ChampionshipPrediction, box = $("champTable");
    const key = JSON.stringify([cp, champKind, focus]);
    if (key === champKey) return; champKey = key;
    const rows = Object.entries((champKind === "drivers" ? cp?.Drivers : cp?.Teams) || {}).filter(([, r]) => r.PredictedPosition);
    if (!rows.length) { box.innerHTML = `<p class="empty">결승·스프린트 중에 실시간 챔피언십 예상 순위를 보여 줘요.</p>`; return; }
    rows.sort((a, b) => a[1].PredictedPosition - b[1].PredictedPosition);
    const drivers = src.state.DriverList || {};
    box.innerHTML = `<table class="champ"><thead><tr><th class="c">예상</th><th class="c">변동</th><th>${champKind === "drivers" ? "드라이버" : "팀"}</th><th class="c">현재</th><th class="c">예상 점수</th></tr></thead><tbody>${rows.map(([k, r]) => {
      const move = (r.CurrentPosition || 0) - r.PredictedPosition, gain = (r.PredictedPoints || 0) - (r.CurrentPoints || 0);
      const d = drivers[k];
      const who = champKind === "drivers"
        ? `<span class="team-bar" style="background:#${esc(hexColour(d?.TeamColour, "888"))}"></span><b>${esc(d ? KO.surname(d.Tla, d.LastName) : k + "번")}</b>${d ? `<span class="tla">${esc(d.Tla)}</span>` : ""}`
        : `<b>${esc(teamKo(k))}</b>`;
      return `<tr class="${champKind === "drivers" && k === focus ? "focus" : ""}" ${champKind === "drivers" ? `data-num="${esc(k)}"` : ""}>
        <td class="c pos">${r.PredictedPosition}</td>
        <td class="c chg">${move > 0 ? `<span class="up"><b>↑</b>${move}</span>` : move < 0 ? `<span class="down"><b>↓</b>${-move}</span>` : `<span class="same">–</span>`}</td>
        <td><div class="drv-in">${who}</div></td>
        <td class="c muted">${r.CurrentPosition ?? "–"}위 · ${r.CurrentPoints ?? 0}</td>
        <td class="c"><b>${r.PredictedPoints ?? 0}</b>${gain > 0 ? ` <span class="up">+${gain}</span>` : ""}</td></tr>`;
    }).join("")}</tbody></table>`;
  }
  $("champTable").addEventListener("click", (e) => {
    const n = e.target.closest("tr[data-num]")?.dataset.num; if (!n) return;
    focus = n; store.set("focus", focus); renderAll(true);
  });

  // ---------- race trace: gap to the leader, lap by lap, for every driver ----------
  let traceKey = "", traceRange = store.get("traceRange", 45);
  const paintRange = () => document.querySelectorAll("#trace .seg button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.range === traceRange)));
  document.querySelectorAll("#trace .seg button").forEach((b) => b.addEventListener("click", () => {
    traceRange = +b.dataset.range; store.set("traceRange", traceRange); paintRange(); traceKey = ""; renderTrace();
  }));
  paintRange();
  // Gap per lap from cumulative race time (sum of lap times): steady through pit stops, unlike the
  // live "gap to leader" value which jumps around when the leader pits. A driver's line stops at a missing lap.
  // Gap to the leader at the end of each lap: F1's own gap as it stood when the lap was completed, else (lapped cars,
  // whose gap F1 gives as "1L") the difference between when this car and the first car crossed the line on that lap.
  // Each lap stands on its own – not a sum of lap times, which has no lap 1 (F1 sends no time for it) and drifts
  // from any lap missing in the history.
  function traceSeries(nums) {
    const laps = {}, first = new Map();
    for (const n of nums) { laps[n] = src.laps(n); for (const x of laps[n]) if (!(first.get(x.lap) <= x.ms)) first.set(x.lap, x.ms); }
    return nums.map((n) => ({ n, pts: laps[n].map((x) => ({ lap: x.lap, gap: x.gap != null ? x.gap : (x.ms - first.get(x.lap)) / 1000 })) }));
  }
  function renderTrace() {
    if (panel !== "trace" || !src) return;
    const box = $("traceChart"), drivers = src.state.DriverList || {};
    if (!/Race/.test(sessionType() || "")) { box.innerHTML = `<p class="empty">갭 차트는 결승과 스프린트에서 볼 수 있어요.</p>`; traceKey = "x"; return; }
    const nums = Object.keys(drivers);
    const W = Math.max(280, box.clientWidth), H = Math.max(220, $("trace").clientHeight - 90);
    // Redraw only when something visible changed (new laps, focus, range, size).
    const lapTotal = nums.reduce((a, n) => a + src.laps(n).length, 0);
    const key = [lapTotal, src.neutralPeriods().map((p) => `${p.from}-${p.to}`).join(","), focus, compare, traceRange, W, H].join("|");
    if (key === traceKey) return; traceKey = key;
    const series = traceSeries(nums).map((s) => ({ ...s, d: drivers[s.n] }));
    const all = series.flatMap((s) => s.pts);
    if (all.length < 4) { box.innerHTML = `<p class="empty">랩이 쌓이면 선두와의 차이를 그려요.</p>`; return; }
    const L = 34, R = 40, T = 8, B = 20;
    const minLap = Math.min(...all.map((x) => x.lap)), maxLap = Math.max(...all.map((x) => x.lap));
    const top = traceRange || Math.max(10, Math.ceil(Math.max(...all.map((x) => x.gap)) / 10) * 10);
    const X = (lap) => L + ((lap - minLap) / Math.max(1, maxLap - minLap)) * (W - L - R);
    const Y = (g) => T + (g / top) * (H - T - B);
    let out = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="갭 차트">
      <defs><clipPath id="traceClip"><rect x="${L}" y="${T - 4}" width="${W - L - R + 2}" height="${H - T - B + 4}"/></clipPath></defs>`;
    // Shade safety car / VSC / red flag laps: the field bunches up there, so gaps shrink for a reason.
    const SHADE = { SC: ["#f29a30", 0.13, "SC"], VSC: ["#f2c230", 0.09, "VSC"], RED: ["#e8392f", 0.14, "적색기"] };
    for (const p of src.neutralPeriods()) {
      const [c, op, label] = SHADE[p.kind], x1 = X(Math.max(minLap, p.from)), x2 = X(Math.min(maxLap, Math.max(p.to, p.from + 1)));
      if (x2 <= x1) continue;
      out += `<rect x="${x1}" y="${T}" width="${x2 - x1}" height="${H - T - B}" fill="${c}" fill-opacity="${op}"/><text x="${x1 + 3}" y="${H - B - 4}" style="fill:${c}">${label}</text>`;
    }
    const step = top <= 15 ? 5 : top <= 45 ? 15 : Math.ceil(top / 4 / 10) * 10;
    for (let g = 0; g <= top; g += step) out += `<line x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}" stroke="#2a3038"/><text x="4" y="${Y(g) + 3}">${g ? "+" + g : "선두"}</text>`;
    out += `<text x="${L}" y="${H - 5}">${minLap}랩</text><text x="${W - R}" y="${H - 5}" text-anchor="end">${maxLap}랩</text>`;
    // Others first, then the compared and focused drivers on top.
    const rank = (s) => (s.n === focus ? 2 : s.n === compare ? 1 : 0);
    const labels = [];
    out += `<g clip-path="url(#traceClip)">`;
    for (const s of series.sort((a, b) => rank(a) - rank(b))) {
      if (s.pts.length < 2 || !s.d) continue;
      const hl = rank(s) > 0, dim = (focus || compare) && !hl, color = "#" + esc(hexColour(s.d?.TeamColour, "888"));
      out += `<polyline fill="none" stroke="${color}" stroke-width="${hl ? 2.6 : 1.4}" stroke-opacity="${dim ? 0.3 : 0.9}" stroke-linejoin="round"
        points="${s.pts.map((x) => `${X(x.lap).toFixed(1)},${Y(x.gap).toFixed(1)}`).join(" ")}"/>`;
      const last = s.pts[s.pts.length - 1];
      if (last.gap <= top) labels.push({ n: s.n, tla: s.d.Tla, color, hl, dim, x: X(last.lap) + 4, y: Y(last.gap) + 3 });
    }
    out += `</g>`;
    // Labels at the line ends, nudged apart so they don't overlap.
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 11) labels[i].y = labels[i - 1].y + 11;
    for (const lb of labels) out += `<text class="lbl${lb.hl ? " hl" : ""}" data-num="${esc(lb.n)}" x="${lb.x}" y="${lb.y}" fill="${lb.color}" fill-opacity="${lb.dim ? 0.5 : 1}">${esc(lb.tla)}</text>`;
    box.innerHTML = out + "</svg>";
  }
  $("traceChart").addEventListener("click", (e) => {
    const n = e.target.closest("[data-num]")?.dataset.num; if (!n) return;
    focus = n; store.set("focus", focus); traceKey = ""; renderAll(true);
  });
  new ResizeObserver(() => { traceKey = ""; renderTrace(); }).observe($("trace"));

  // ---------- team radio ----------
  // Clips are mp3 files next to the session data; the list only re-renders when new clips arrive so playback isn't cut.
  // Each clip is placed on the lap it was recorded in: the race lap (as shown on TV) in races and sprints,
  // otherwise the driver's own lap. "이번 랩" shows only the current lap; "랩별 전체" groups every clip by lap.
  let radioKey = "", radioView = store.get("radioView", "lap");
  const paintRadioView = () => document.querySelectorAll("#radioBar .seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.rv === radioView)));
  document.querySelectorAll("#radioBar .seg button").forEach((b) => b.addEventListener("click", () => {
    radioView = b.dataset.rv; store.set("radioView", radioView); paintRadioView(); radioKey = ""; renderRadio(true);
  }));
  paintRadioView();
  const isRaceLike = () => /Race/.test(sessionType());
  const ownLapAt = (num, ms) => { const done = src.laps(num, ms); return done.length ? done[done.length - 1].lap + 1 : 1; };
  function clipInfo(c) {
    const utc = c.Utc ? ReplayKit.parseUtc(c.Utc) : null;
    const ms = utc != null ? src.msAt(utc) : null;
    const lap = ms == null ? null : (isRaceLike() && src.raceLapAt(ms)) || ownLapAt(c.RacingNumber, ms);
    return { c, utc, ms, lap };
  }
  const currentLapFor = (num) => (isRaceLike() ? src.state.LapCount?.CurrentLap : null) || ownLapAt(num, src.now());
  function renderRadio(force) {
    if (panel !== "radio") return;
    const caps = src.state.TeamRadio?.Captures;
    const list = (Array.isArray(caps) ? caps : Object.values(caps || {})).filter(Boolean);
    const raceLap = isRaceLike() ? src.state.LapCount?.CurrentLap : null;
    $("radioLap").innerHTML = raceLap ? `지금 <b>${raceLap}랩</b>` : isRaceLike() ? "" : "드라이버마다 자기 랩 기준";
    const key = [list.length, raceLap, radioView, focus, isRaceLike() ? "" : Math.floor(src.now() / 5000)].join("|");
    if (key === radioKey && !force) return;
    // Don't rebuild the list under a clip that is playing; try again on the next update.
    if (!force && [...document.querySelectorAll("#radio audio")].some((a) => !a.paused)) return;
    radioKey = key;
    const base = src.isLive ? src.state.SessionInfo?.Path : replayInfo?.path;
    const drivers = src.state.DriverList || {};
    if (!list.length || !base) { $("radio").innerHTML = `<li class="empty-li">아직 공개된 팀 라디오가 없어요.</li>`; return; }
    const clips = list.map(clipInfo).sort((a, b) => (b.utc || 0) - (a.utc || 0));
    const item = (x) => {
      const d = drivers[x.c.RacingNumber] || {};
      return `<li class="${x.c.RacingNumber === focus ? "mine" : ""}"><span class="team-bar" style="background:#${esc(hexColour(d?.TeamColour, "888"))}"></span>
        <div class="who">${esc(KO.DRIVERS[d.Tla] || d.Tla || x.c.RacingNumber)}${x.lap ? `<span class="lap-tag">${x.lap}랩</span>` : ""}<small>${x.utc ? kstTime.format(x.utc) + " KST" : ""}</small>
          ${!src.isLive && x.ms != null ? `<button class="jump" data-ms="${Math.round(x.ms)}" title="이 무전이 나온 순간으로 재생 위치를 옮겨요">이 장면으로</button>` : ""}</div>
        <audio controls preload="none" src="https://livetiming.formula1.com/static/${esc(base)}${esc(x.c.Path)}"></audio></li>`;
    };
    if (radioView === "lap") {
      // Current lap, plus a clip from the previous lap that only just came out as the lap ticked over.
      const now = clips.filter((x) => x.lap != null && (x.lap === currentLapFor(x.c.RacingNumber) || (x.ms != null && src.now() - x.ms < 15000)));
      if (now.length) { $("radio").innerHTML = now.map(item).join(""); return; }
      const last = clips[0], d = drivers[last.c.RacingNumber] || {};
      $("radio").innerHTML = `<li class="empty-li">이번 랩에는 아직 공개된 팀 라디오가 없어요.<br>가장 최근 무전: <b>${last.lap ? last.lap + "랩" : ""} ${esc(KO.surname(d.Tla, d.LastName))}</b>
        <button class="link" data-rv-go="all">랩별 전체 보기</button></li>`;
      return;
    }
    // Grouped by lap, newest lap first; the current race lap is marked.
    const groups = new Map();
    for (const x of clips) { const k = x.lap ?? "?"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
    $("radio").innerHTML = [...groups].map(([lap, xs]) => `<li class="lap-head${lap === raceLap ? " now" : ""}">${lap === "?" ? "랩 정보 없음" : `${lap}랩`}${lap === raceLap ? " · 지금" : ""}<span>${xs.length}개</span></li>${xs.map(item).join("")}`).join("");
  }
  $("radio").addEventListener("click", (e) => {
    const jump = e.target.closest("button.jump");
    if (jump && replay && mode === "replay") { seekTo(+jump.dataset.ms); return; }
    if (e.target.closest("[data-rv-go]")) { radioView = "all"; store.set("radioView", radioView); paintRadioView(); renderRadio(true); }
  });

  // ---------- driver panel ----------
  const fmtLap = (sec) => { if (sec == null) return ""; const m = Math.floor(sec / 60), s = sec - m * 60; return `${m}:${s.toFixed(1).padStart(4, "0")}`; };
  function lapChart(series, pits) {
    const W = 420, H = 150, L = 46, R = 8, T = 8, B = 20;
    const all = series.flatMap((s) => s.laps.filter((x) => x.sec));
    if (all.length < 2) return `<p class="muted">랩 기록이 쌓이면 그래프가 그려져요.</p>`;
    const sorted = all.map((x) => x.sec).sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
    const lo = sorted[0], hi = Math.min(sorted[sorted.length - 1], med * 1.12);      // SC and pit laps are clipped
    const maxLap = Math.max(...all.map((x) => x.lap)), minLap = Math.min(...all.map((x) => x.lap));
    const X = (lap) => L + ((lap - minLap) / Math.max(1, maxLap - minLap)) * (W - L - R);
    const Y = (sec) => T + ((Math.min(sec, hi) - lo) / Math.max(0.1, hi - lo)) * (H - T - B);
    let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="랩타임 그래프">`;
    for (let k = 0; k <= 3; k++) { const v = lo + ((hi - lo) * k) / 3, y = Y(v); out += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#2a3038"/><text x="4" y="${y + 3}">${fmtLap(v)}</text>`; }
    for (const p of pits) out += `<line x1="${X(p.lap)}" x2="${X(p.lap)}" y1="${T}" y2="${H - B}" stroke="#f29a30" stroke-dasharray="3 3"/>`;
    out += `<text x="${L}" y="${H - 5}">${minLap}랩</text><text x="${W - R - 30}" y="${H - 5}">${maxLap}랩</text>`;
    for (const s of series) {
      const pts = s.laps.filter((x) => x.sec);
      out += `<polyline fill="none" stroke="${s.color}" stroke-width="1.8" points="${pts.map((x) => `${X(x.lap).toFixed(1)},${Y(x.sec).toFixed(1)}`).join(" ")}"/>`;
      const fastest = pts.reduce((a, b) => (b.sec < a.sec ? b : a), pts[0]);
      if (fastest) out += `<circle cx="${X(fastest.lap)}" cy="${Y(fastest.sec)}" r="3.5" fill="#b46cff"/>`;
    }
    return out + "</svg>";
  }
  function posChart(series) {
    const W = 420, H = 110, L = 24, R = 8, T = 6, B = 16;
    const all = series.flatMap((s) => s.laps.filter((x) => x.pos));
    if (all.length < 2) return "";
    const maxLap = Math.max(...all.map((x) => x.lap)), minLap = Math.min(...all.map((x) => x.lap));
    const maxPos = Math.max(10, ...all.map((x) => x.pos));
    const X = (lap) => L + ((lap - minLap) / Math.max(1, maxLap - minLap)) * (W - L - R), Y = (p) => T + ((p - 1) / (maxPos - 1)) * (H - T - B);
    let out = `<svg class="chart" style="height:110px" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="순위 변화">`;
    for (const p of [1, Math.round(maxPos / 2), maxPos]) out += `<line x1="${L}" x2="${W - R}" y1="${Y(p)}" y2="${Y(p)}" stroke="#2a3038"/><text x="2" y="${Y(p) + 3}">${p}</text>`;
    for (const s of series) out += `<polyline fill="none" stroke="${s.color}" stroke-width="1.8" points="${s.laps.filter((x) => x.pos).map((x) => `${X(x.lap).toFixed(1)},${Y(x.pos).toFixed(1)}`).join(" ")}"/>`;
    return out + "</svg>";
  }
  // Sum of the driver's best three sectors, as a lap time.
  function idealLap(num) {
    const b = src.state.TimingStats?.Lines?.[num]?.BestSectors;
    const secs = [0, 1, 2].map((i) => ReplayKit.toSec(at(b, i)?.Value));
    if (secs.some((x) => !x)) return "";
    const total = secs.reduce((a, x) => a + x, 0);
    return `${Math.floor(total / 60)}:${(total % 60).toFixed(3).padStart(6, "0")}`;
  }
  function topSpeed(num) {
    const sp = src.state.TimingStats?.Lines?.[num]?.BestSpeeds || {};
    const v = +sp.ST?.Value || Math.max(0, ...["I1", "I2", "FL"].map((k) => +sp[k]?.Value || 0));
    return v ? `${v}km/h` : "";
  }
  // Pit stops: time through the pit lane and, when F1 sends it, the stationary time.
  // The quickest stationary stop so far in the session gets a badge.
  function pitStopList(num) {
    const mine = src.pitStops(num);
    if (!mine.length) return "";
    // Practice and qualifying: a "stop" is a visit to the garage, so only the count of runs matters.
    if (!/Race/.test(sessionType())) {
      return `<div class="d-section"><h4>피트 출입</h4><p class="muted note" style="margin:0">${mine.length}번 들어왔어요 (${mine.map((p) => `${p.lap}랩`).join(", ")}) · 연습·예선에서는 차고에 머문 시간까지 섞여 있어 시간은 보여 주지 않아요.</p></div>`;
    }
    const fastest = Math.min(...src.allPitStops().map((p) => p.stop || Infinity));
    // A red flag stop (cars wait in the pit lane) shows a lane time of minutes: not a normal stop.
    const lane = (p) => (p.lane && p.lane < 60 ? `피트 레인 ${p.lane.toFixed(1)}초` : p.lane ? "적색기 등으로 피트 레인에서 대기" : "");
    return `<div class="d-section"><h4>피트 스톱</h4><ul class="pitstops">${mine.map((p) => `
      <li><span>${p.lap}랩</span>${p.stop ? `<b>정차 ${p.stop.toFixed(1)}초</b>` : `<b class="na" title="F1이 이 피트 스톱의 정차 시간을 보내지 않았어요">정차 —</b>`}${p.stop && p.stop === fastest ? `<em>이번 세션 최단</em>` : ""}<span class="muted">${lane(p)}</span></li>`).join("")}</ul></div>`;
  }

  // ---------- stint pace and tyre wear ----------
  // Per stint: representative laps (no pit laps, no safety car laps, nothing slower than 107 % of the stint's
  // median) → average lap and the trend in s/lap from a least-squares line (positive = getting slower).
  function stintPace(num) {
    const stints = src.stints(num), laps = src.laps(num, src.now());
    if (!stints.length || laps.length < 3) return [];
    const pitLaps = new Set(); for (const p of src.pits(num, src.now())) { pitLaps.add(p.lap); pitLaps.add(p.lap + 1); }
    const neutral = src.neutralPeriods().flatMap((p) => Array.from({ length: Math.max(1, p.to - p.from + 1) }, (_, i) => p.from + i));
    const slow = new Set(neutral);
    let from = 0;
    return stints.map((x) => {
      const n = Math.max(0, (x.TotalLaps || 0) - (x.StartLaps || 0)), lo = from + 1, hi = from + n;
      from += n;
      let pts = laps.filter((l) => l.lap >= lo && l.lap <= hi && l.sec && l.lap > 1 && !pitLaps.has(l.lap) && !slow.has(l.lap));
      if (pts.length) { const med = pts.map((l) => l.sec).sort((a, b) => a - b)[Math.floor(pts.length / 2)]; pts = pts.filter((l) => l.sec < med * 1.07); }
      let avg = null, slope = null;
      if (pts.length >= 2) {
        avg = pts.reduce((a, l) => a + l.sec, 0) / pts.length;
        const mx = pts.reduce((a, l) => a + l.lap, 0) / pts.length;
        let sxy = 0, sxx = 0; for (const l of pts) { sxy += (l.lap - mx) * (l.sec - avg); sxx += (l.lap - mx) ** 2; }
        slope = sxx ? sxy / sxx : null;
      }
      return { x, lo, hi, n, avg, slope, used: pts.length };
    });
  }
  const lapStr = (sec) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(3).padStart(6, "0")}`;
  function stintTable(num) {
    const rows = stintPace(num).filter((r) => r.n > 0);
    if (!rows.length) return "";
    return `<table class="stint-pace"><tbody>${rows.map((r) => {
      const ty = KO.TYRES[r.x.Compound] || { short: "?", color: "#666" };
      const trend = r.slope == null || r.used < 4 ? "–" : `${r.slope >= 0 ? "+" : "−"}${Math.abs(r.slope).toFixed(3)}초/랩`;
      return `<tr><td><i class="tyre-dot" style="border-color:${ty.color};color:${ty.color}">${ty.short}</i></td><td class="muted">${r.lo}–${r.hi}랩</td>
        <td>${r.avg ? `평균 <b>${lapStr(r.avg)}</b>` : ""}</td>
        <td class="${r.slope > 0.08 ? "deg-high" : r.slope != null && r.slope < 0 ? "deg-neg" : ""}" title="대표 랩 ${r.used}개로 계산 · 피트·세이프티카 랩과 느린 랩은 빼요 · 연료가 줄어드는 효과도 섞여 있어요">${trend}</td></tr>`;
    }).join("")}</tbody></table>`;
  }

  // ---------- telemetry ----------
  // Gauges for a driver right now, and the last lap's speed trace against a reference lap
  // (the compared driver's last lap, or the driver's own best), with the running time difference.
  let telemRef = store.get("telemRef", "best");
  function gauge(num, color) {
    const c = src.carAt?.(num, src.now()), d = src.state.DriverList?.[num];
    if (!c || !d) return "";
    const drsOpen = c.drs >= 10;
    return `<div class="gauge"><span class="who" style="border-color:${color}">${esc(d.Tla)}</span>
      <b class="spd">${Math.round(c.speed)}<small>km/h</small></b><b class="gear">${c.gear || "N"}<small>단</small></b>
      <span class="bars"><i class="rpm" style="width:${Math.min(100, (c.rpm / 13000) * 100)}%"></i><i class="thr" style="width:${Math.min(100, c.thr)}%"></i><i class="brk" style="width:${c.brk ? 100 : 0}%"></i></span>
      <span class="muted mono">${Math.round(c.rpm)} rpm</span>${drsOpen ? `<em class="drs">DRS</em>` : ""}</div>`;
  }
  function bestLapNo(num) {
    const laps = src.laps(num, src.now()).filter((x) => x.sec);
    if (!laps.length) return null;
    return laps.reduce((a, b) => (b.sec < a.sec ? b : a)).lap;
  }
  function telemetry(num) {
    if (!src.hasTelemetry?.()) {
      return src.isLive ? `<div class="d-section"><h4>텔레메트리</h4><p class="muted note" style="margin:0">실시간 속도·스로틀·브레이크는 F1 TV로 로그인하면 볼 수 있어요.</p></div>` : "";
    }
    const now = src.laps(num, src.now());
    const last = now[now.length - 1];
    const cmpOn = compare && src.state.DriverList?.[compare];
    let refNum = num, refLap = bestLapNo(num), refLabel = "개인 최고 랩";
    if (telemRef === "compare" && cmpOn) { const cl = src.laps(compare, src.now()); refNum = compare; refLap = cl[cl.length - 1]?.lap; refLabel = `${src.state.DriverList[compare].Tla} 최근 랩`; }
    const a = last ? src.lapTrace(num, last.lap) : null;
    const b = refLap && !(refNum === num && refLap === last?.lap) ? src.lapTrace(refNum, refLap) : null;
    const focusColor = "#ffffff", cmpColor = cmpOn ? "#" + (hexColour(src.state.DriverList[compare]?.TeamColour, "b46cff")) : "#b46cff";
    return `<div class="d-section"><h4>텔레메트리 <span class="seg mini" role="group" aria-label="비교 기준"><button data-tref="best" aria-pressed="${telemRef === "best"}">개인 최고 랩과</button><button data-tref="compare" aria-pressed="${telemRef === "compare"}"${cmpOn ? "" : " disabled title=\"Shift+클릭으로 비교할 드라이버를 고르세요\""}>비교 드라이버와</button></span></h4>
      <div class="gauges">${gauge(num, focusColor)}${cmpOn ? gauge(compare, cmpColor) : ""}</div>
      ${a ? traceChart(a, b, focusColor, b ? (refNum === num ? "#b46cff" : cmpColor) : null, `${last.lap}랩 ${last.time || ""}`, b ? `${refLabel} ${b.lap}랩 ${b.time || ""}` : "") : `<p class="muted note">한 랩을 마치면 속도 그래프를 그려요.</p>`}</div>`;
  }
  function traceChart(a, b, ca, cb, la, lb) {
    const W = 420, H = 230, L = 34, R = 8, T = 16, sp = 120, dt = 50, pd = 22;   // speed / delta / pedals bands
    const len = a.d[a.d.length - 1] || 1;
    const vmax = Math.max(340, ...a.v, ...(b ? b.v : []));
    const X = (f) => L + f * (W - L - R);
    const Ys = (v) => T + sp - (v / vmax) * sp;
    const line = (tr, color, w) => {
      const n = tr.d[tr.d.length - 1] || 1, pts = [];
      for (let i = 0; i < tr.d.length; i += 2) pts.push(`${X(tr.d[i] / n).toFixed(1)},${Ys(tr.v[i]).toFixed(1)}`);
      return `<polyline fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" points="${pts.join(" ")}"/>`;
    };
    let out = `<svg class="chart trace-tel" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="속도 그래프">`;
    for (const v of [100, 200, 300]) if (v < vmax) out += `<line x1="${L}" x2="${W - R}" y1="${Ys(v)}" y2="${Ys(v)}" stroke="#2a3038"/><text x="2" y="${Ys(v) + 3}">${v}</text>`;
    out += `<text x="${L}" y="11" fill="${ca}">${esc(la)}</text>${b ? `<text x="${W - R}" y="11" text-anchor="end" fill="${cb}">${esc(lb)}</text>` : ""}`;
    if (b) out += line(b, cb, 1.4);
    out += line(a, ca, 1.8);
    // running time difference (positive: slower than the reference)
    const y0 = T + sp + 8 + dt / 2;
    out += `<line x1="${L}" x2="${W - R}" y1="${y0}" y2="${y0}" stroke="#39414b"/><text x="2" y="${y0 + 3}">Δ</text><text x="${L + 2}" y="${y0 + dt / 2 - 1}" style="fill:#6b7682">아래: 기준보다 느림</text>`;
    if (b) {
      const nb = b.d[b.d.length - 1] || 1, steps = 120, ds = [];
      for (let k = 0; k <= steps; k++) { const f = k / steps; ds.push((ReplayKit.timeAtDistance(a, f * len) - ReplayKit.timeAtDistance(b, f * nb)) / 1000); }
      // Lap ends are when the timing message arrived, a little late or early: spread the error over the lap so
      // the line finishes at the official lap time difference.
      if (a.sec && b.sec) { const err = a.sec - b.sec - ds[steps]; for (let k = 0; k <= steps; k++) ds[k] += (err * k) / steps; }
      const m = Math.max(0.3, ...ds.map(Math.abs)), Yd = (v) => y0 + (v / m) * (dt / 2);
      out += `<polyline fill="none" stroke="#f2c230" stroke-width="1.6" points="${ds.map((v, k) => `${X(k / steps).toFixed(1)},${Yd(v).toFixed(1)}`).join(" ")}"/>`;
      const end = ds[ds.length - 1];
      out += `<text x="${W - R}" y="${y0 - dt / 2 + 8}" text-anchor="end" fill="${end > 0 ? "#e87b72" : "#3ccf6e"}">${end > 0 ? "+" : "−"}${Math.abs(end).toFixed(3)}초</text><text x="2" y="${y0 - dt / 2 + 8}">±${m.toFixed(1)}</text>`;
    }
    // pedals: throttle (green) and brake (red) of the driver's lap
    const yp = T + sp + 8 + dt + 6;
    out += `<text x="2" y="${yp + 8}">페달</text>`;
    for (let i = 1; i < a.d.length; i++) {
      const x1 = X(a.d[i - 1] / len), x2 = X(a.d[i] / len), w = Math.max(0.6, x2 - x1);
      out += `<rect x="${x1.toFixed(1)}" y="${yp}" width="${w.toFixed(1)}" height="${(pd / 2 - 1).toFixed(1)}" fill="#3ccf6e" fill-opacity="${(a.thr[i] / 100).toFixed(2)}"/>`;
      if (a.brk[i]) out += `<rect x="${x1.toFixed(1)}" y="${yp + pd / 2}" width="${w.toFixed(1)}" height="${(pd / 2 - 1).toFixed(1)}" fill="#e8392f"/>`;
    }
    out += `<text x="${L}" y="${H - 2}">0m</text><text x="${W - R}" y="${H - 2}" text-anchor="end">${Math.round(len)}m</text>`;
    return out + "</svg>";
  }
  $("driver").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tref]"); if (!b || b.disabled) return;
    telemRef = b.dataset.tref; store.set("telemRef", telemRef); renderDriver();
  });

  // "If they pitted now": where the driver would come out, from the gaps to the leader and this circuit's pit loss.
  function pitWindow(num) {
    if (sessionType() !== "Race") return "";
    const lines = lines0(), drivers = src.state.DriverList || {}, l = lines[num];
    if (!l || l.Retired || l.Stopped || l.InPit || ReplayKit.gapSec(l.GapToLeader) == null) return "";
    const rows = rowsNow().filter(([, x]) => !x.Retired && !x.Stopped).map(([n, x]) => ({ num: n, gap: ReplayKit.gapSec(x.GapToLeader) }));
    const loss = ReplayKit.pitLoss(src.allPitStops(), src.state.TrackStatus?.Status);
    const r = ReplayKit.pitRejoin(rows, num, loss.sec);
    if (!r) return "";
    const who = (x) => { const d = drivers[x.num] || {}; return esc(KO.surname(d.Tla, d.LastName)); };
    const cur = +l.Position || 0, diff = cur && r.pos - cur;
    return `<div class="d-section"><h4>지금 피트인하면 <span class="muted" title="${loss.measured ? `이번 세션 피트 레인 통과 시간 중앙값 ${(loss.base / 0.8).toFixed(1)}초에서 그 구간을 정상 속도로 달렸을 시간을 뺀 값` : "아직 이번 세션 피트 스톱이 적어 보통 값으로 계산"}">· 피트 손실 약 ${loss.sec.toFixed(0)}초${loss.neutral ? " (SC·VSC라 줄어듦)" : loss.measured ? "" : " (예상)"}</span></h4>
      <div class="pitwin"><b>약 ${r.pos}위</b>로 복귀${diff > 0 ? ` <span class="down">↓${diff}</span>` : ""}
        <span class="muted">${r.ahead ? `앞: ${who(r.ahead)} ${(r.after - r.ahead.gap).toFixed(1)}초 뒤` : "선두"}${r.behind ? ` · 뒤: ${who(r.behind)} ${(r.behind.gap - r.after).toFixed(1)}초 앞` : ""}</span></div>
      <p class="muted note">선두와의 차이에 피트 손실을 더해 계산한 대략적인 값이에요. 랩 다운된 차는 빼고 계산해요.</p></div>`;
  }

  function renderDriver() {
    if (panel !== "driver") return;
    const box = $("driver");
    const drivers = src?.state.DriverList || {};
    if (!src || !focus || !drivers[focus]) {
      box.innerHTML = `<p class="empty">순위표에서 드라이버를 누르면 랩타임 그래프, 타이어 기록, 순위 변화를 보여 줘요.<br>Shift를 누른 채 다른 드라이버를 누르면 두 명을 비교할 수 있어요.</p>`;
      return;
    }
    const d = drivers[focus], l = src.state.TimingData?.Lines?.[focus] || {}, a = src.state.TimingAppData?.Lines?.[focus] || {};
    const name = KO.DRIVERS[d.Tla] || d.FullName, color = "#" + (hexColour(d?.TeamColour, "888"));
    const stints = src.stints(focus);
    const tNow = src.now();
    const series = [{ laps: src.laps(focus, tNow), color: "#ffffff", label: name }];
    let cmpName = "";
    if (compare && drivers[compare]) {
      const cd = drivers[compare]; cmpName = KO.DRIVERS[cd.Tla] || cd.Tla;
      series.push({ laps: src.laps(compare, tNow), color: "#" + (hexColour(cd?.TeamColour, "b46cff")), label: cmpName });
    }
    box.innerHTML = `
      <div class="d-head"><span class="team-bar" style="background:${color}"></span>
        <div><h3>${esc(name)}</h3><p>${esc(focus)}번 · ${esc(KO.TEAMS[d.TeamName] || d.TeamName)}${a.GridPos ? ` · 출발 ${esc(a.GridPos)}번 그리드` : ""}</p></div></div>
      <div class="d-stats">
        <div><span>순위</span><b>${esc(l.Position || "—")}</b></div>
        <div><span>최고 랩</span><b>${esc(l.BestLapTime?.Value || "—")}</b></div>
        <div><span>최근 랩</span><b>${esc(l.LastLapTime?.Value || "—")}</b></div>
        <div><span>피트</span><b>${esc(l.NumberOfPitStops ?? 0)}회</b></div>
        <div title="세 섹터의 개인 최고 기록을 더한 값 · 모든 구간을 최고로 달렸다면 나올 수 있었던 랩"><span>이론상 최고 랩</span><b>${esc(idealLap(focus) || "—")}</b></div>
        <div title="스피드 트랩에서 잰 최고 속도"><span>최고 속도</span><b>${esc(topSpeed(focus) || "—")}</b></div>
      </div>
      ${telemetry(focus)}
      ${pitWindow(focus)}
      ${pitStopList(focus)}
      <div class="d-section"><h4>타이어 스틴트</h4><div class="stints">${stints.map((x) => {
        const ty = KO.TYRES[x.Compound] || { short: "?", color: "#666", ko: x.Compound };
        const laps = Math.max(1, (x.TotalLaps || 0) - (x.StartLaps || 0));
        return `<div style="flex:${laps};background:${ty.color}" title="${esc(ty.ko)} ${laps}랩${x.New === "true" ? " (새 타이어)" : ""}">${ty.short}${laps}</div>`;
      }).join("") || `<div style="flex:1;background:#2a3038;color:#8b96a3">기록 없음</div>`}</div>${stintTable(focus)}</div>
      <div class="d-section"><h4>랩타임 ${cmpName ? `<span class="legend"><span><i style="background:#fff"></i>${esc(name)}</span><span><i style="background:${series[1].color}"></i>${esc(cmpName)}</span></span>` : ""}</h4>
        ${lapChart(series, src.pits(focus, tNow))}
        <p class="muted" style="margin:4px 0 0;font-size:11px">보라 점: 최고 랩 · 주황 점선: 피트 진입 · 세이프티카·피트 랩은 위쪽에서 잘려요</p></div>
      ${sessionType() === "Race" ? `<div class="d-section"><h4>순위 변화</h4>${posChart(series)}</div>` : ""}`;
  }

  // ---------- track map ----------
  const canvas = $("map"), ctx = canvas.getContext("2d");
  let lastMapPts = {};
  // Corner numbers (and a fallback shape for circuits we have no previous data for), per circuit key.
  let circuit = null, circuitFor = null;
  // Map view: zoom and pan last for the session; rotation is remembered per circuit.
  const view = { zoom: 1, panX: 0, panY: 0, rot: 0 };
  function ensureCircuit() {
    const si = src.state.SessionInfo, key = si?.Meeting?.Circuit?.Key;
    if (!key) return;
    // (per circuit and year: a layout can change between seasons)
    const year = +(si.Path || replayInfo?.path || "").slice(0, 4) || thisYear, want = `${year}:${key}`;
    if (circuitFor === want) return;
    const sameCircuit = circuitFor?.split(":")[1] === String(key);
    circuitFor = want; circuit = null;
    if (!sameCircuit) { Object.assign(view, { zoom: 1, panX: 0, panY: 0, rot: store.get("mapRot:" + key, 0) }); paintMapTools(); }
    window.api.trackCircuit(key, year).then((c) => {
      if (circuitFor !== want) return;
      circuit = c; drawMap();   // corners (and maybe the shape) arrived: draw now even when paused
    }).catch(() => {});
  }

  function drawMap() {
    if (mapView === "3d") { if (src) { ensureCircuit(); paintMapNote(true); } return; }
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = devicePixelRatio || 1;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    if (!src) { paintMapNote(true); return; }
    ensureCircuit();
    const shape = mode === "live" ? liveShape() : outline.length ? outline : circuit?.outline || [];
    paintMapNote(shape.length > 0);
    if (!shape.length) return;
    // Everything on the map grows with it: 1× at the default size, up to 2.2× when enlarged.
    const k = Math.min(2.2, Math.max(1, Math.min(w, h) / 380));
    // Rotate (clockwise on screen), fit to the canvas, then apply zoom around the centre plus pan.
    const th = view.rot * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
    const R = ([x, y]) => [x * cs + y * sn, -x * sn + y * cs];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of shape) { const [x, y] = R(pt); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    // Margins keep the track clear of the buttons: 2D/3D switch on top, map tools on the left.
    const padT = 56, padL = 64, pad = 30 * k;
    const sc = Math.min((w - padL - pad) / (maxX - minX || 1), (h - padT - pad) / (maxY - minY || 1));
    const ox = padL + (w - padL - pad - (maxX - minX) * sc) / 2, oy = pad + (h - padT - pad - (maxY - minY) * sc) / 2, z = view.zoom;
    const P = (pt) => {
      const [rx, ry] = R(pt), bx = ox + (rx - minX) * sc, by = h - (oy + (ry - minY) * sc);
      return [w / 2 + (bx - w / 2) * z + view.panX, h / 2 + (by - h / 2) * z + view.panY];
    };
    // Satellite ground under everything (canvas row 0 is the north edge of its box, in F1 metres).
    const sat = satFor(shape);
    if (sat) {
      const e = sat.ext, cw = sat.canvas.width, chh = sat.canvas.height;
      const tl = P([e.x0 * 10, e.y1 * 10]), tr = P([e.x1 * 10, e.y1 * 10]), bl = P([e.x0 * 10, e.y0 * 10]);
      ctx.save();
      ctx.transform((tr[0] - tl[0]) / cw, (tr[1] - tl[1]) / cw, (bl[0] - tl[0]) / chh, (bl[1] - tl[1]) / chh, tl[0], tl[1]);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sat.canvas, 0, 0);
      ctx.restore();
      ctx.fillStyle = "rgba(14,16,19,0.32)"; ctx.fillRect(0, 0, w, h);   // keeps cars and labels readable
    }
    ctx.lineWidth = 7 * Math.sqrt(k) * Math.min(2, Math.sqrt(z)); ctx.lineJoin = ctx.lineCap = "round"; ctx.strokeStyle = sat ? "rgba(20,22,26,0.85)" : "#2a3038"; ctx.beginPath();
    let prev = null;
    for (const pt of shape) {
      const [x, y] = P(pt);
      if (!prev || Math.hypot(x - prev[0], y - prev[1]) > 40 * k * z) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      prev = [x, y];
    }
    ctx.stroke();

    // Corner numbers sit just off the track, on the outside of the bend.
    if (circuit?.corners.length) {
      const off = 16 * k / (sc * z);   // label distance stays the same on screen at any zoom
      ctx.font = `600 ${Math.round(9 * k)}px -apple-system, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const c of circuit.corners) {
        const a = c.angle * Math.PI / 180;
        const [x, y] = P([c.x + Math.cos(a) * off, c.y + Math.sin(a) * off]);
        ctx.fillStyle = "rgba(14,16,19,.75)"; ctx.beginPath(); ctx.arc(x, y, 7.5 * k, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#8b96a3"; ctx.fillText(String(c.n), x, y + 0.5);
      }
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
    }

    const drivers = src.state.DriverList || {}, pos = src.positionsAt(src.now());
    lastMapPts = {};
    ctx.font = `600 ${Math.round(10 * k)}px -apple-system, sans-serif`;
    const lines = lines0();
    // Retired cars sit in the garage or by the track: drawn faint and without a name.
    const gone = (n) => lines[n]?.Retired || lines[n]?.Stopped;
    // Back to front: retired, then by race order (leader on top), then compared and focused drivers.
    const rank = (n) => (n === focus ? 1e4 : n === compare ? 1e3 : gone(n) ? -1e3 : 100 - (+lines[n]?.Position || 99));
    const order = Object.keys(pos).filter((n) => drivers[n]).sort((a, b) => rank(a) - rank(b));
    const dots = [];
    for (const num of order) {
      const d = drivers[num];
      const [x, y] = P(pos[num]); lastMapPts[num] = [x, y];
      const hl = num === focus || num === compare, r = (hl ? 6 : 4.6) * k;   // a touch smaller so the track shows
      ctx.globalAlpha = gone(num) ? 0.25 : focus && !hl ? 0.55 : 1;
      if (hl) { ctx.strokeStyle = num === focus ? "#ffffff" : "#b46cff"; ctx.lineWidth = 2.5 * k; ctx.beginPath(); ctx.arc(x, y, r + 3 * k, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = "#" + (hexColour(d?.TeamColour, "888")); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#0e1013"; ctx.lineWidth = 1.5 * k; ctx.stroke();
      if (!gone(num)) dots.push({ num, d, x, y, r, hl });
    }
    // Name tags, most important first (focus, compare, then race order); a tag that would land on one
    // already placed tries the other side, then is left out – the dot is still there to hover or click.
    const fs = Math.round(10 * k), lh = fs + 2;
    const placed = [];
    const hit = (bx, by, bw) => placed.some((p) => bx < p[0] + p[2] && bx + bw > p[0] && by < p[1] + lh && by + lh > p[1]);
    dots.sort((a, b) => rank(b.num) - rank(a.num));
    for (const o of dots) {
      const label = o.d.Tla, bw = ctx.measureText(label).width + 2;
      const spots = [[o.x + o.r + 3.5 * k, o.y - lh / 2], [o.x - o.r - 3.5 * k - bw, o.y - lh / 2], [o.x - bw / 2, o.y - o.r - lh - 2], [o.x - bw / 2, o.y + o.r + 2]];
      const spot = spots.find(([bx, by]) => !hit(bx, by, bw)) || (o.hl ? spots[0] : null);
      if (!spot) continue;
      placed.push([spot[0], spot[1], bw]);
      ctx.globalAlpha = focus && !o.hl ? 0.7 : 1;
      ctx.fillStyle = o.hl ? "#ffffff" : "#e8ecf0"; ctx.fillText(label, spot[0] + 1, spot[1] + lh / 2 + fs * 0.35);
    }
    ctx.globalAlpha = 1;
    // Map credits are listed in the 🛰 지도 panel; Google's terms ask for its logo on the imagery itself.
    if (sat?.provider === "google") {
      ctx.font = "700 11px Arial, sans-serif"; ctx.textAlign = "right"; ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText("Google", w - 8, h - 6);
      ctx.textAlign = "start";
    }
  }

  // ---------- satellite background for the 2D map ----------
  // Built once per circuit from the same fitted map data as the 3D view (src/renderer/scenery.js).
  let satOn = store.get("mapSat", false), sat2d = null, satKey = null, satBusy = false;
  const paintSat = () => { $("mapSat").setAttribute("aria-pressed", String(satOn)); };
  $("mapSat").addEventListener("click", () => { satOn = !satOn; store.set("mapSat", satOn); satFail = null; paintSat(); drawMap(); });
  paintSat();
  // (satKey: what the picture on screen was made for; the request in flight has its own key, and only the newest
  // one's result is shown. A failure is tried again after 30 s, or at once when the button is pressed again. The key
  // has the imagery setting and the outline's shape in it, not only its length.)
  let satFail = null, satWant = null;
  function satFor(shape) {
    if (!satOn || !src) return null;
    const loc = window.F1KR.location();
    if (!loc || shape.length < 60) return null;
    let geoOpts = {}; try { geoOpts = JSON.parse(localStorage.getItem("f1kr:geo3d") || "{}"); } catch {}
    const pick = (i) => shape[Math.floor(i)].map((v) => Math.round(v / 10)).join(",");
    const key = `${loc}|${geoOpts.provider || "eox"}|${shape.length}|${pick(0)}|${pick(shape.length / 2)}|${pick(shape.length - 1)}`;
    if (satKey === key) return sat2d;
    const shown = sat2d && satKey?.split("|")[0] === loc ? sat2d : null;   // (the old picture stays while a new one for the same place is made)
    if (satBusy || (satFail && satFail.key === key && Date.now() - satFail.at < 30e3)) return shown;
    satBusy = true; satWant = key;
    const lap = ReplayKit.extractLap(shape);
    (async () => {
      try {
        const scene = await window.api.geo.scene(loc, lap);
        if (!scene.ok) throw new Error(scene.reason);
        const mod = await import("./scenery.js");
        const provider = geoOpts.provider === "google" && (await window.api.geo.googleCheck()).ok ? "google" : "eox";
        const g = await mod.buildGround2D(window.api, scene, lap, { provider });
        if (satWant === key) { sat2d = { ...g, provider }; satKey = key; satFail = null; drawMap(); }
      } catch (e) { satFail = { key, at: Date.now() }; toast(`위성 사진을 못 깔았어요 (${e.message})`, ""); }
      finally { satBusy = false; }
    })();
    return shown;
  }

  // ---------- resizable layout ----------
  // Drag the divider between the board and the side panel (width), or between map and tabs (map height).
  // Sizes are remembered; double-click a divider to go back to the default.
  const root = document.documentElement, sideEl = document.querySelector(".side");
  function applySizes() {
    const sw = store.get("sideW", null), mh = store.get("mapH", null);
    const maxW = Math.max(320, innerWidth - 480);
    if (sw) root.style.setProperty("--side-w", Math.min(maxW, Math.max(320, sw)) + "px"); else root.style.removeProperty("--side-w");
    if (mh) root.style.setProperty("--map-h", Math.min(sideEl.clientHeight - 140, Math.max(160, mh)) + "px"); else root.style.removeProperty("--map-h");
  }
  function splitter(el, axis, keyName, measure) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      const start = axis === "v" ? e.clientX : e.clientY, base = measure();
      el.classList.add("dragging"); document.body.classList.add("resizing", axis);
      const move = (ev) => {
        const d = (axis === "v" ? ev.clientX : ev.clientY) - start;
        store.set(keyName, Math.round(axis === "v" ? base - d : base + d)); applySizes();
      };
      const up = () => {
        el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up);
        el.classList.remove("dragging"); document.body.classList.remove("resizing", axis);
      };
      el.addEventListener("pointermove", move); el.addEventListener("pointerup", up);
    });
    el.addEventListener("dblclick", () => { store.set(keyName, null); applySizes(); });
    // Keyboard: arrow keys move the divider 20px (Shift: 80px).
    el.addEventListener("keydown", (e) => {
      const keys = axis === "v" ? { ArrowLeft: 1, ArrowRight: -1 } : { ArrowUp: -1, ArrowDown: 1 };
      if (!(e.key in keys)) return;
      e.preventDefault(); store.set(keyName, measure() + keys[e.key] * (e.shiftKey ? 80 : 20)); applySizes();
    });
  }
  splitter($("splitV"), "v", "sideW", () => sideEl.clientWidth);
  splitter($("splitH"), "h", "mapH", () => canvas.parentElement.clientHeight);
  addEventListener("resize", applySizes);
  applySizes();
  new ResizeObserver(() => drawMap()).observe(canvas);
  // A real grid: at least 10 cars, pole among them, and cars standing in their own slots (a wet or
  // safety-car start has them queued nose to tail, and the position feed can stack cars on one spot).
  function gridOk(spots) {
    if (!Array.isArray(spots) || spots.length < 10 || !spots.some((x) => x.grid === 1)) return false;
    let close = 0;
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) if (Math.hypot(spots[i].p[0] - spots[j].p[0], spots[i].p[1] - spots[j].p[1]) < 30) close++;
    return close <= 2;
  }
  // When no clean lap can be cut from the loaded session (red flags, a car parked, data gaps), the circuit
  // comes from an earlier session there – the same one live mode uses.
  let fbLap = [], fbFor = null;
  function replayFallbackLap() {
    const loc = replayInfo?.location;
    if (!loc) return [];
    if (fbFor !== loc) {
      fbFor = loc; fbLap = [];
      window.api.trackOutline(loc).then((l) => { if (fbFor === loc) { fbLap = l || []; outline = outline.length ? outline : fbLap; drawMap(); } }).catch(() => {});
    }
    return fbLap;
  }
  // ---------- 2D / 3D view and full-window map ----------
  // map3d.js (an ES module) reads the app's state through this bridge.
  window.F1KR = {
    get src() { return src; }, get t() { return mode === "replay" ? t : live.now(); }, get mode() { return mode; },
    get focus() { return focus; }, get circuit() { return circuit; },
    // Circuit location as F1 names it ("Monte Carlo", "Kuala Lumpur") and the local start hour of the session.
    utcNow: () => (src ? src.utcAt(src.now()) : null),
    uiCost: () => Object.fromEntries(Object.entries(uiCost).map(([k, v]) => [k, { avg: +(v.total / v.n).toFixed(2), max: +v.max.toFixed(1) }])),
    // Car positions across the session (decimetres), thinned to ~150k points: the 3D view measures how wide
    // the track really is from where the cars drove.
    carPoints: () => {
      const out = [];
      if (!src) return out;
      if (src.isLive) { for (const tr of Object.values(live.trail)) for (let i = 0; i < tr.length; i += 2) out.push(tr[i]); return out; }
      const P = replay.positions, step = Math.max(1, Math.ceil((P.length * 20) / 150000));
      for (let i = 0; i < P.length; i += step) for (const p of Object.values(P[i][1])) out.push(p);
      return out;
    },
    // Grid slots: where each car stood just before a race start (race replays), remembered per circuit so
    // practice, qualifying and live sessions there can show them too. [{ grid, p: [x, y, z] }] or null.
    gridSpots: () => {
      const loc = window.F1KR.location();
      if (!loc) return null;
      const key = "grid:" + loc;
      if (mode === "replay" && replay && /Race/.test(sessionType())) {
        const t0s = replay.startTime(), a = replay.positionsAt(t0s - 1500), b = replay.positionsAt(t0s - 4500);
        const app = replay.state.TimingAppData?.Lines || {};
        const spots = Object.entries(a).filter(([n, p]) => b[n] && Math.hypot(p[0] - b[n][0], p[1] - b[n][1]) < 15 && +app[n]?.GridPos > 0)
          .map(([n, p]) => ({ grid: +app[n].GridPos, p: p.map((v) => Math.round(v)) }));
        if (gridOk(spots)) { store.set(key, spots); return spots; }
      }
      const saved = store.get(key, null);
      return gridOk(saved) ? saved : null;
    },
    location: () => src?.state.SessionInfo?.Meeting?.Location || (mode === "replay" ? replayInfo?.location : null),
    sessionYear: () => +(src?.state.SessionInfo?.Path || (mode === "replay" ? replayInfo?.path : "") || "").slice(0, 4) || null,
    sessionHour: () => { const m = /T(\d\d):(\d\d)/.exec(src?.state.SessionInfo?.StartDate || (mode === "replay" ? replayInfo?.start : "") || ""); return m ? +m[1] + +m[2] / 60 : null; },
    sourceKey: () => (mode === "replay" ? `replay:${replayInfo?.path || ""}` : `live:${live.state.SessionInfo?.Key || ""}:${liveShape().length}`),
    trackPoints: () => (mode === "replay" ? (replay ? replay.lapShape() || replayFallbackLap() : []) : liveShape()),
    setFocus(n) { focus = n; store.set("focus", n); if (panel !== "driver" && !$("mapCard").classList.contains("expanded")) setPanel("driver"); renderAll(true); },
  };
  let mapView = store.get("mapView", "2d");
  function setView(v) {
    mapView = v; store.set("mapView", v);
    $("mapCard").dataset.view = v;
    $("map3d").hidden = v !== "3d";
    document.querySelectorAll(".view-switch button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
    const go = () => (v === "3d" ? window.Map3D.show() : window.Map3D.hide());
    if (window.Map3D) go(); else if (v === "3d") addEventListener("map3d-ready", go, { once: true });
  }
  document.querySelectorAll(".view-switch button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  setView(mapView);
  function setExpanded(on) {
    $("mapCard").classList.toggle("expanded", on);
    $("expandMap").setAttribute("aria-pressed", String(on));
    document.querySelector(".expand-hint").hidden = !on; $("miniBoard").hidden = !on;
    renderMiniBoard(true);
  }
  $("expandMap").addEventListener("click", () => setExpanded(!$("mapCard").classList.contains("expanded")));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && $("mapCard").classList.contains("expanded")) setExpanded(false); });
  // Compact standings shown over the full-window map.
  let miniKey = "";
  function renderMiniBoard(force) {
    if (!$("mapCard").classList.contains("expanded") || !src) return;
    const drivers = src.state.DriverList || {};
    const rows = rowsNow().map(([num, l]) => {
      const d = drivers[num] || {}, gap = l.Position === "1" ? "" : koGap(l.IntervalToPositionAhead?.Value || l.TimeDiffToPositionAhead || "");
      return `<li class="${num === focus ? "focus" : ""}" data-num="${esc(num)}"><span class="n">${esc(l.Position || "")}</span><span class="b" style="background:#${esc(hexColour(d?.TeamColour, "888"))}"></span><b>${esc(KO.surname(d.Tla, d.LastName))}</b><span class="g">${esc(gap)}</span></li>`;
    }).join("");
    if (rows === miniKey && !force) return;
    miniKey = rows; $("miniBoard").innerHTML = rows;
  }
  $("miniBoard").addEventListener("click", (e) => { const n = e.target.closest("[data-num]")?.dataset.num; if (n) window.F1KR.setFocus(n); });

  // ---------- map controls: zoom, pan, rotate, reset ----------
  const ZMAX = 8;
  function clampPan() {
    const mx = (view.zoom - 1) * canvas.clientWidth / 2 + 40, my = (view.zoom - 1) * canvas.clientHeight / 2 + 40;
    if (view.zoom === 1) { view.panX = view.panY = 0; return; }
    view.panX = Math.max(-mx, Math.min(mx, view.panX)); view.panY = Math.max(-my, Math.min(my, view.panY));
  }
  // Zoom by factor f keeping the point (px, py) under the cursor in place.
  function zoomBy(f, px = canvas.clientWidth / 2, py = canvas.clientHeight / 2) {
    const nz = Math.max(1, Math.min(ZMAX, view.zoom * f)), cx = canvas.clientWidth / 2, cy = canvas.clientHeight / 2;
    view.panX = px - cx - (px - cx - view.panX) * nz / view.zoom;
    view.panY = py - cy - (py - cy - view.panY) * nz / view.zoom;
    view.zoom = nz; clampPan(); paintMapTools(); drawMap();
  }
  function paintMapTools() {
    $("mapZoomIn").disabled = view.zoom >= ZMAX; $("mapZoomOut").disabled = view.zoom <= 1;
    $("mapReset").disabled = view.zoom === 1 && view.rot === 0;
    canvas.classList.toggle("pannable", view.zoom > 1);
  }
  $("mapZoomIn").addEventListener("click", () => zoomBy(1.5));
  $("mapZoomOut").addEventListener("click", () => zoomBy(1 / 1.5));
  $("mapRotate").addEventListener("click", () => {
    view.rot = (view.rot + 90) % 360; view.panX = view.panY = 0;
    if (circuitFor) store.set("mapRot:" + circuitFor.split(":")[1], view.rot);
    paintMapTools(); drawMap();
  });
  $("mapReset").addEventListener("click", () => {
    Object.assign(view, { zoom: 1, panX: 0, panY: 0, rot: 0 });
    if (circuitFor) store.set("mapRot:" + circuitFor.split(":")[1], 0);
    paintMapTools(); drawMap();
  });
  // Trackpad: pinch zooms at the cursor, two-finger scroll moves a zoomed map. Mouse: drag to move.
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    if (e.ctrlKey) zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    else if (view.zoom > 1) { view.panX -= e.deltaX; view.panY -= e.deltaY; clampPan(); drawMap(); }
  }, { passive: false });
  let drag = null, dragged = false;
  canvas.addEventListener("pointerdown", (e) => {
    if (view.zoom <= 1) return;
    drag = { x: e.clientX, y: e.clientY, px: view.panX, py: view.panY }; dragged = false;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!dragged && Math.hypot(dx, dy) < 4) return;
    dragged = true; canvas.classList.add("panning");
    view.panX = drag.px + dx; view.panY = drag.py + dy; clampPan(); drawMap();
  });
  const endDrag = () => { drag = null; canvas.classList.remove("panning"); };
  canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);
  paintMapTools();

  canvas.addEventListener("click", (e) => {
    if (dragged) { dragged = false; return; }   // the end of a drag isn't a car pick
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 14;
    for (const [n, [px, py]] of Object.entries(lastMapPts)) { const dd = Math.hypot(px - x, py - y); if (dd < bd) { bd = dd; best = n; } }
    if (best) { focus = best; store.set("focus", focus); setPanel("driver"); renderAll(true); }
  });

  // ---------- F1 TV sign-in ----------
  async function paintAuth() {
    const s = await window.api.auth.status();
    $("authBtn").textContent = s.signedIn ? "F1 TV 연결됨" : s.expired ? "F1 TV 다시 로그인" : "F1 TV 로그인";
    $("authBtn").classList.toggle("signed", !!s.signedIn);
    $("authBtn").title = s.signedIn ? `실시간 차량 위치를 받아요${s.expires ? ` · 만료 ${kstFull.format(s.expires)}` : ""} · 누르면 로그아웃` : "F1 TV 구독 계정으로 로그인하면 실시간 차량 위치까지 받아요";
    return s;
  }
  $("authBtn").addEventListener("click", async () => {
    const s = await window.api.auth.status();
    if (s.signedIn) { if (confirm("F1 TV에서 로그아웃할까요?")) await window.api.auth.logout(); }
    else await window.api.auth.login();
    await paintAuth();
    if (liveStatus.state !== "stopped") { await window.api.live.stop(); await window.api.live.start(); }
  });

  // ---------- schedule (KST) ----------
  const loadSchedule = () => (schedulePromise ||= window.api.getSchedule(thisYear).then((s) => (schedule = s)).catch((e) => { schedulePromise = null; throw e; }));
  function nextSession(now = Date.now()) {
    if (!schedule) return null;
    return schedule.flatMap((r) => r.sessions.map((s) => ({ r, s, at: Date.parse(s.utc) }))).find((x) => x.at > now) || null;
  }
  const untilText = (d) => {
    const days = Math.floor(d / 864e5), hrs = Math.floor((d % 864e5) / 36e5), mins = Math.floor((d % 36e5) / 6e4);
    return d < 6e4 ? "곧 시작" : `${days ? days + "일 " : ""}${days || hrs ? hrs + "시간 " : ""}${mins}분 후`;
  };
  const nextLabel = (n) => `${KO.gpName(n.r.name)} ${KO.sessionName(n.s.name)}`;

  // Live mode with nothing running: say so, and when the next session starts.
  function paintIdle() {
    const liveIdle = mode === "live" && (!live.state.DriverList || liveStatus.state === "stopped");
    const over = mode === "live" && /Finalised|Ends/.test(live.state.SessionStatus?.Status || "");
    if (mode === "live" && !schedule) loadSchedule().catch(() => {});
    const next = nextSession();
    const nextHtml = next ? `<br>다음 세션은 <b>${esc(nextLabel(next))}</b>, ${esc(kstFull.format(next.at))} (${untilText(next.at - Date.now())})이에요.` : "";
    $("boardEmpty").hidden = mode === "live" ? !liveIdle : !!src;
    const wait = mode === "live" && liveStatus.state !== "stopped" ? live.waitingMs() : 0;
    if (mode === "live" && liveIdle) {
      $("boardEmpty").innerHTML = liveStatus.state === "stopped"
        ? `실시간 연결 전이에요. 위의 <b>연결</b>을 누르면 지금 진행 중인 세션을 받아요.${nextHtml}`
        : wait > 0 ? `데이터를 받았어요. 중계 지연 <b>${esc(delayText(Math.round(live.delayMs / 1000)))}</b>에 맞춰 <b>${Math.ceil(wait / 1000)}초 뒤</b>에 보여 줘요.<br><span class="muted">TV보다 먼저 결과가 보이지 않도록 기다리는 중이에요. 바로 보려면 지연을 줄이세요.</span>`
        : live.paused ? `실시간 화면을 멈춘 상태예요. <b>이어서</b>를 누르세요.`
        : /connecting|reconnecting/.test(liveStatus.state) ? `실시간 서버에 연결하는 중이에요…`
        : `지금은 진행 중인 세션이 없어요.${nextHtml}`;
    } else if (mode === "replay") {
      $("boardEmpty").innerHTML = `불러온 세션이 없어요. <b>다시보기</b>에서 세션을 고르거나, 경기 중이라면 <b>실시간</b>에서 연결하세요.`;
    }
    $("nextChip").hidden = !(over && next);
    if (over && next) $("nextChip").textContent = `다음: ${KO.sessionName(next.s.name)} · ${untilText(next.at - Date.now())}`;
  }

  async function openSchedule() {
    $("glossary").hidden = true; $("schedule").hidden = false;
    if (!schedule) {
      $("scheduleList").innerHTML = `<p class="empty">일정을 불러오는 중…</p>`;
      try { await loadSchedule(); }
      catch (e) { $("scheduleList").innerHTML = `<p class="empty">일정을 불러오지 못했어요 (${esc(e.message)})</p>`; return; }
    }
    const now = Date.now();
    const next = nextSession(now);
    if (next) $("nextUp").innerHTML = `다음 세션: <b>${esc(nextLabel(next))}</b> — ${kstFull.format(next.at)} (${untilText(next.at - now)})`;
    else $("nextUp").textContent = "남은 세션이 없어요.";
    $("scheduleList").innerHTML = schedule.map((r) => {
      const past = Date.parse(r.sessions[r.sessions.length - 1].utc) < now;
      return `<div class="race ${past ? "past" : ""}"><h3>${r.round}라운드 · ${esc(KO.gpName(r.name))}<small>${esc(r.locality || "")}</small></h3><ul>
        ${r.sessions.map((s) => `<li class="${s.name === "Race" ? "main" : ""} ${Date.parse(s.utc) < now ? "done" : ""}"><span>${esc(KO.sessionName(s.name))}</span><span>${kstFull.format(Date.parse(s.utc))}</span></li>`).join("")}
      </ul></div>`;
    }).join("");
    document.querySelector(".race:not(.past)")?.scrollIntoView({ block: "start" });
  }
  $("scheduleBtn").addEventListener("click", openSchedule);
  $("scheduleClose").addEventListener("click", () => { $("schedule").hidden = true; });

  // ---------- glossary ----------
  $("glossaryList").innerHTML = KO.GLOSSARY.map(([term, text]) => `<dt>${esc(term)}</dt><dd>${esc(text)}</dd>`).join("");
  $("glossaryBtn").addEventListener("click", () => { $("schedule").hidden = true; $("glossary").hidden = !$("glossary").hidden; });
  $("glossaryClose").addEventListener("click", () => { $("glossary").hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { $("schedule").hidden = true; $("glossary").hidden = true; $("syncPop").hidden = true; } });

  // ---------- boot ----------
  paintAuth();
  loadSessionList();
  setMode(store.get("mode", "replay") === "live" ? "live" : "replay");
  setPanel("rc");
})();
