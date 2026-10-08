const { app, BrowserWindow, ipcMain, shell, Notification, powerMonitor } = require("electron");
const path = require("node:path");
const { Archive } = require("./archive");
const { getSchedule } = require("./schedule");
const { LiveClient } = require("./live");
const { Auth } = require("./auth");
const { getCircuit } = require("./circuit");
const { Scenes } = require("./scene");
const { GoogleTiles } = require("./google");
const geo = require("./geo");

// Same data folder in development and in the packaged app; the bundle uses an ASCII name
// (Electron can't start from a Korean bundle name) but menus show the Korean one.
app.setPath("userData", path.join(app.getPath("appData"), "f1-live-kr"));
app.setName("라이브 타이밍 KR");

let archive, auth, live, mainWin, scenes, google;

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
  mainWin.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  // External links open in the browser, never inside the app.
  mainWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  if (process.env.F1KR_SNAPSHOT) require("./dev-snapshot")(mainWin, process.env.F1KR_SNAPSHOT);
}

const send = (channel, ...args) => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, ...args); };

app.whenReady().then(() => {
  const data = app.getPath("userData");
  archive = new Archive(path.join(data, "cache"));
  auth = new Auth(data);
  live = new LiveClient({ getToken: () => auth.getToken() });
  scenes = new Scenes(path.join(data, "cache"));
  google = new GoogleTiles(data);
  // After sleep the socket is usually dead without noticing; reconnect straight away.
  powerMonitor.on("resume", () => { if (!live.stopped) { live.retry = 0; live.connect(); } });
  live.on("snapshot", (snap) => send("live:snapshot", snap));
  live.on("feed", (topic, d, ts) => send("live:feed", topic, d, ts));
  live.on("status", (s) => send("live:status", s));

  ipcMain.handle("sessions:list", (_e, year) => archive.listSessions(year));
  ipcMain.handle("session:load", (e, sessionPath) =>
    archive.loadSession(sessionPath, (p) => e.sender.send("session:progress", p)));
  ipcMain.handle("schedule:get", (_e, year) => getSchedule(year));
  ipcMain.handle("track:outline", (_e, location) => { const y = new Date().getFullYear(); return archive.findOutline(location, [y, y - 1, y - 2]); });
  ipcMain.handle("track:circuit", (_e, key, year) => getCircuit(path.join(data, "cache"), key, year));
  // Real-world 3D surroundings: fitted scene, map tiles (terrain heights, imagery), optional Google imagery.
  ipcMain.handle("geo:scene", (e, location, lap) => scenes.build(location, lap, (step) => { if (!e.sender.isDestroyed()) e.sender.send("geo:progress", step); }));
  ipcMain.handle("geo:tile", (_e, source, z, x, y) => (source === "google" ? google.tile(z, x, y) : geo.getTile(path.join(data, "cache"), source, z, x, y)));
  ipcMain.handle("geo:google", () => ({ hasKey: google.hasKey() }));
  ipcMain.handle("geo:googleCheck", () => google.check());
  ipcMain.handle("geo:googleKey", (_e, key) => google.setKey(key));
  ipcMain.handle("geo:googleAttribution", (_e, zoom, n, s, eLon, w) => google.attribution(zoom, n, s, eLon, w).catch(() => "Google"));
  ipcMain.handle("live:start", () => { live.start(); });
  ipcMain.handle("live:stop", () => { live.stop(); });
  ipcMain.handle("auth:status", () => auth.status());
  ipcMain.handle("auth:login", () => auth.login(mainWin));
  ipcMain.handle("auth:logout", () => auth.logout());
  // Keep the window above a full-screen stream (Coupang Play, F1 TV) while watching.
  ipcMain.handle("win:pin", (_e, on) => { if (mainWin && !mainWin.isDestroyed()) { mainWin.setAlwaysOnTop(!!on, "floating"); mainWin.setVisibleOnAllWorkspaces(!!on, { visibleOnFullScreen: true, skipTransformProcessType: true }); } return !!on; });
  // Compact timing tower: a narrow window; the previous size comes back when it is switched off.
  let fullBounds = null;
  ipcMain.handle("win:compact", (_e, on) => {
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
  ipcMain.handle("notify", (_e, title, body) => { if (Notification.isSupported()) new Notification({ title, body, silent: false }).show(); });

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { live?.stop(); if (process.platform !== "darwin") app.quit(); });
