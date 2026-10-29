const { contextBridge, ipcRenderer } = require("electron");

const listen = (channel) => (fn) => {
  const handler = (_e, ...args) => fn(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

// The only bridge between the page and the main process.
contextBridge.exposeInMainWorld("api", {
  listSessions: (year) => ipcRenderer.invoke("sessions:list", year),
  loadSession: (sessionPath, job) => ipcRenderer.invoke("session:load", sessionPath, job),
  getSchedule: (year) => ipcRenderer.invoke("schedule:get", year),
  // home screen: the season's sessions and calendar with where they came from, which sessions are on this computer,
  // whether F1 would give one now, the calendars already checked (nothing fetched)
  listSessionsMeta: (year, cacheOnly) => ipcRenderer.invoke("sessions:listMeta", year, cacheOnly),
  cachedSessions: (paths) => ipcRenderer.invoke("sessions:cached", paths),
  probeSession: (sessionPath) => ipcRenderer.invoke("session:probe", sessionPath),
  getScheduleMeta: (year) => ipcRenderer.invoke("schedule:meta", year),
  checkedSchedules: () => ipcRenderer.invoke("schedule:checked"),
  metaStats: () => ipcRenderer.invoke("meta:stats"),
  trackOutline: (location) => ipcRenderer.invoke("track:outline", location),
  trackCircuit: (key, year) => ipcRenderer.invoke("track:circuit", key, year),
  onProgress: listen("session:progress"),
  live: {
    start: () => ipcRenderer.invoke("live:start"),
    stop: () => ipcRenderer.invoke("live:stop"),
    onSnapshot: listen("live:snapshot"),
    onFeed: listen("live:feed"),
    onStatus: listen("live:status"),
  },
  auth: {
    status: () => ipcRenderer.invoke("auth:status"),
    login: () => ipcRenderer.invoke("auth:login"),
    logout: () => ipcRenderer.invoke("auth:logout"),
  },
  geo: {
    scene: (location, lap) => ipcRenderer.invoke("geo:scene", location, lap),
    tile: (source, z, x, y) => ipcRenderer.invoke("geo:tile", source, z, x, y),
    google: () => ipcRenderer.invoke("geo:google"),
    googleCheck: () => ipcRenderer.invoke("geo:googleCheck"),
    model: (file) => ipcRenderer.invoke("geo:model", file),
    setGoogleKey: (key) => ipcRenderer.invoke("geo:googleKey", key),
    googleAttribution: (zoom, n, s, e, w) => ipcRenderer.invoke("geo:googleAttribution", zoom, n, s, e, w),
    onProgress: listen("geo:progress"),
    // cloud cover at (lat, lon) round a moment (main/clouds.js) – { ok, hours: [[utcMs, 0–1]…], source } | { ok: false, reason }
    clouds: (lat, lon, utc, live) => ipcRenderer.invoke("weather:clouds", lat, lon, utc, live),
  },
  // the strategy game's files (main/gamestore.js: userData/game – apart from the session cache)
  game: {
    scenarios: () => ipcRenderer.invoke("game:scenarios"),
    scenario: (id) => ipcRenderer.invoke("game:scenario", id),
    saveResult: (id, result) => ipcRenderer.invoke("game:saveResult", id, result),
    results: (id) => ipcRenderer.invoke("game:results", id),
    save: (slot, data) => ipcRenderer.invoke("game:save", slot, data),
    load: (slot) => ipcRenderer.invoke("game:load", slot),
    saves: () => ipcRenderer.invoke("game:saves"),
    removeSave: (slot) => ipcRenderer.invoke("game:removeSave", slot),
    // preparing a race from the session cache: the list (prepared or not), start → { ok, jobId }, cancel; progress /
    // done / error / cancelled arrive through onPrep(fn) with the job id (a late answer of an older job is the page's to drop)
    prepList: () => ipcRenderer.invoke("game:prepList"),
    prepare: (sessionPath) => ipcRenderer.invoke("game:prepare", sessionPath),
    prepCancel: (jobId) => ipcRenderer.invoke("game:prepCancel", jobId),
    onPrep: (fn) => { const h = (_e, m) => fn(m); ipcRenderer.on("game:prep", h); return () => ipcRenderer.removeListener("game:prep", h); },
    importScenario: () => ipcRenderer.invoke("game:import"),
  },
  compactWindow: (on) => ipcRenderer.invoke("win:compact", on),
  pinWindow: (on) => ipcRenderer.invoke("win:pin", on),
  notify: (title, body) => ipcRenderer.invoke("notify", title, body),
});
