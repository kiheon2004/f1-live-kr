const { app, BrowserWindow, ipcMain, shell, Notification, powerMonitor } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { Archive } = require("./archive");
const { ScheduleStore } = require("./schedule");
const { LiveClient } = require("./live");
const { Auth } = require("./auth");
const { getCircuit } = require("./circuit");
const { Scenes } = require("./scene");
const { GoogleTiles } = require("./google");
const { Clouds } = require("./clouds");
const { GameStore } = require("./gamestore");
const geo = require("./geo");
const V = require("./validate");
const { pathToFileURL } = require("node:url");

// Same data folder in development and in the packaged app; the bundle uses an ASCII name
// (Electron can't start from a Korean bundle name) but menus show the Korean one.
// (development only: F1KR_USERDATA gives an automated run – dev-snapshot clears the page's storage – a folder of its
// own, so the everyday app's settings and sign-ins aren't touched; F1KR_CACHE can point it at an existing data cache)
const DEV_DATA = !app.isPackaged && process.env.F1KR_USERDATA;
app.setPath("userData", DEV_DATA || path.join(app.getPath("appData"), "f1-live-kr"));
app.setName("라이브 타이밍 KR");

let archive, auth, live, mainWin, scenes, google, schedules;
const PAGE = path.join(__dirname, "..", "renderer", "index.html"), PAGE_URL = pathToFileURL(PAGE).href;

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1520, height: 940, minWidth: 1180, minHeight: 720,
    title: "라이브 타이밍 KR",
    backgroundColor: "#0e1013",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  mainWin.loadFile(PAGE);
  // External links open in the browser, never inside the app – and only web pages (http/https). The window itself
  // never navigates away from the app's page.
  mainWin.webContents.setWindowOpenHandler(({ url }) => { if (V.externalUrl(url)) shell.openExternal(url); return { action: "deny" }; });
  mainWin.webContents.on("will-navigate", (e, url) => { if (url !== PAGE_URL) { e.preventDefault(); if (V.externalUrl(url)) shell.openExternal(url); } });
  // (development only: the packaged app doesn't ship dev-snapshot.js – package.json build.files – so it's never asked for there)
  if (process.env.F1KR_SNAPSHOT && !app.isPackaged) require("./dev-snapshot")(mainWin, process.env.F1KR_SNAPSHOT);
}

const send = (channel, ...args) => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, ...args); };

// (development only: F1KR_OFFLINE=1 – the main process gets no answer from any server, as on a plane: the home screen,
// cached calendars and cached sessions are checked that way. The page itself never fetches (its CSP allows only 'self').)
if (!app.isPackaged && process.env.F1KR_OFFLINE) global.fetch = async () => { throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND (F1KR_OFFLINE)" } }); };

app.whenReady().then(() => {
  const data = app.getPath("userData"), cacheDir = (DEV_DATA && process.env.F1KR_CACHE) || path.join(data, "cache");
  // season calendars (Jolpica) are kept in the app's own data folder, apart from the session cache
  schedules = new ScheduleStore(path.join(data, "meta"));
  archive = new Archive(cacheDir);
  setTimeout(() => archive.prune(), 5000);   // (old session recordings, past 3 GB)
  auth = new Auth(data);
  // (the archive tries the F1 TV sign-in when F1 refuses an anonymous request – archive.js fetchAuthed)
  archive.tokenProvider = () => auth.getToken();
  // (development only: F1KR_LIVEFILE plays a cached session's recorded messages through the live path – not packaged)
  live = !app.isPackaged && process.env.F1KR_LIVEFILE ? new (require("./dev-livefile").LiveFile)(cacheDir, process.env.F1KR_LIVEFILE) : new LiveClient({ getToken: () => auth.getToken() });
  scenes = new Scenes(cacheDir);
  google = new GoogleTiles(data);
  // (cloud cover for the 3D sky – clouds.js: Open-Meteo, anonymous; kept in the app's own data folder)
  // (development only: F1KR_CLOUDS_FETCH=fail | http:503 | delay:<ms> | garbage – the cloud requests fail, are refused,
  // answer late or answer nonsense, for checking the neutral sky's fallback in the real app; not packaged)
  const cf = !app.isPackaged && process.env.F1KR_CLOUDS_FETCH, cm = cf && /^(fail|http:(\d+)|delay:(\d+)|garbage)$/.exec(cf);
  const cloudFetch = !cm ? undefined : async (...a) => {
    console.log("[F1KR_CLOUDS_FETCH]", cf, String(a[0]).replace(/\?.*/, ""));
    if (cm[1] === "fail") throw new TypeError("fetch failed (F1KR_CLOUDS_FETCH)");
    if (cm[2]) return { ok: false, status: +cm[2], json: async () => ({}) };
    if (cm[1] === "garbage") return { ok: true, status: 200, json: async () => ({ hourly: { time: ["x"], cloud_cover_low: [-999], cloud_cover_mid: [120], cloud_cover_high: [null] } }) };
    await new Promise((r) => setTimeout(r, +cm[3]));
    return fetch(...a);
  };
  const clouds = new Clouds(path.join(data, "weather"), cloudFetch);
  // After sleep the socket is usually dead without noticing; reconnect straight away.
  powerMonitor.on("resume", () => { if (!live.stopped) { live.retry = 0; live.connect(); } });
  live.on("snapshot", (snap) => send("live:snapshot", snap));
  live.on("feed", (topic, d, ts) => send("live:feed", topic, d, ts));
  live.on("status", (s) => send("live:status", s));

  // Every IPC call is answered only for the app's own page (main window, top frame), and its arguments are checked
  // before they reach a URL or a file path.
  const handle = (channel, fn) => ipcMain.handle(channel, (e, ...args) => {
    if (!V.trustedSender(e.senderFrame, mainWin, PAGE_URL)) throw new Error("IPC from an untrusted sender");
    return fn(e, ...args);
  });
  const num = (v) => { if (!Number.isFinite(v)) throw new Error("bad number"); return v; };
  handle("sessions:list", (_e, year) => archive.listSessions(V.year(year)));
  // the same list with where it came from (fresh / cached copy while offline or refused) – the home screen's states
  handle("sessions:listMeta", (_e, year, cacheOnly) => archive.listSessionsMeta(V.year(year), { cacheOnly: cacheOnly === true }));
  handle("sessions:cached", (_e, paths) => archive.cachedSessions(V.sessionPaths(paths)));
  handle("session:probe", (_e, sessionPath) => archive.probeSession(V.sessionPath(sessionPath)));
  // (each progress message carries the page's number for that load: an earlier load still downloading never moves the
  // bar of a newer one)
  handle("session:load", (e, sessionPath, job) => {
    const id = V.jobId(job);
    return archive.loadSession(V.sessionPath(sessionPath), (p) => { if (!e.sender.isDestroyed()) e.sender.send("session:progress", id == null ? p : { ...p, job: id }); });
  });
  handle("schedule:get", async (_e, year) => (await schedules.get(V.year(year))).races);
  handle("schedule:meta", async (_e, year) => ({ ...(await schedules.get(V.season(year))), stats: { ...schedules.stats } }));
  handle("schedule:checked", () => schedules.checked());
  handle("meta:stats", () => ({ schedule: { ...schedules.stats }, archive: { ...(archive.stats || {}) } }));
  handle("track:outline", (_e, location) => { const y = new Date().getFullYear(); return archive.findOutline(V.text(location, 80), [y, y - 1, y - 2]); });
  handle("track:circuit", (_e, key, year) => getCircuit(cacheDir, key, year));
  // Real-world 3D surroundings: fitted scene, map tiles (terrain heights, imagery), optional Google imagery.
  handle("geo:scene", (e, location, lap) => {
    if (!Array.isArray(lap) || lap.length < 2 || lap.length > 50000 || !lap.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))) throw new Error("bad lap");
    return scenes.build(V.text(location, 80), lap, (step) => { if (!e.sender.isDestroyed()) e.sender.send("geo:progress", step); });
  });
  handle("geo:tile", (_e, source, z, x, y) => {
    [z, x, y] = V.tileArgs(z, x, y);
    if (source === "google") return google.tile(z, x, y);
    if (source !== "eox" && source !== "terrain") throw new Error("unknown tile source");
    return geo.getTile(cacheDir, source, z, x, y);
  });
  // facility models (facilities.js): self-contained GLB files shipped in src/data/models (also inside app.asar)
  const MODELS = path.join(__dirname, "..", "data", "models");
  handle("geo:model", async (_e, file) => {
    const p = V.inside(MODELS, V.modelFile(file));
    const st = await fs.promises.stat(p).catch(() => null);
    if (!st) throw new Error("모델 파일이 없어요: " + file);
    if (st.size > 64 * 1024 * 1024) throw new Error("모델 파일이 너무 커요");
    return fs.promises.readFile(p);
  });
  handle("geo:google", () => ({ hasKey: google.hasKey() }));
  handle("geo:googleCheck", () => google.check());
  handle("geo:googleKey", (_e, key) => { if (typeof key !== "string" || key.length > 300) throw new Error("bad key"); return google.setKey(key); });
  handle("weather:clouds", (_e, lat, lon, utc, live) => clouds.get(lat, lon, utc, live === true));
  handle("geo:googleAttribution", (_e, zoom, n, s, eLon, w) => google.attribution(V.tileArgs(zoom, 0, 0)[0], num(n), num(s), num(eLon), num(w)).catch(() => "Google"));
  // the strategy game's own folder (gamestore.js: userData/game – scenarios, results, saves; never the session cache)
  const games = new GameStore(path.join(data, "game"));
  handle("game:scenarios", () => games.listScenarios());
  handle("game:scenario", (_e, sid) => games.loadScenario(sid));
  handle("game:saveResult", (_e, sid, result) => games.saveResult(sid, result));
  handle("game:results", (_e, sid) => games.listResults(sid));
  handle("game:save", (_e, slot, d) => games.saveGame(slot, d));
  handle("game:load", (_e, slot) => games.loadGame(slot));
  handle("live:start", () => { live.start(); });
  handle("live:stop", () => { live.stop(); });
  handle("auth:status", () => auth.status());
  handle("auth:login", () => auth.login(mainWin));
  handle("auth:logout", () => auth.logout());
  // Keep the window above a full-screen stream (Coupang Play, F1 TV) while watching.
  handle("win:pin", (_e, on) => { if (mainWin && !mainWin.isDestroyed()) { mainWin.setAlwaysOnTop(!!on, "floating"); mainWin.setVisibleOnAllWorkspaces(!!on, { visibleOnFullScreen: true, skipTransformProcessType: true }); } return !!on; });
  // Compact timing tower: a narrow window; the previous size comes back when it is switched off.
  let fullBounds = null;
  handle("win:compact", (_e, on) => {
    if (!mainWin || mainWin.isDestroyed()) return;
    if (on) {
      if (!fullBounds) fullBounds = mainWin.getBounds();
      mainWin.setMinimumSize(380, 420);
      const b = mainWin.getBounds();
      mainWin.setBounds({ x: b.x + b.width - 460, y: b.y, width: 460, height: Math.max(720, Math.min(b.height, 980)) }, true);
    } else {
      mainWin.setMinimumSize(1180, 720);
      if (fullBounds) mainWin.setBounds(fullBounds, true);
      fullBounds = null;
    }
  });
  handle("notify", (_e, title, body) => { if (Notification.isSupported()) new Notification({ title: V.text(title, 200), body: V.text(body, 2000), silent: false }).show(); });

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { live?.stop(); if (process.platform !== "darwin") app.quit(); });
