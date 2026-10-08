const { contextBridge, ipcRenderer } = require("electron");

const listen = (channel) => (fn) => {
  const handler = (_e, ...args) => fn(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

// The only bridge between the page and the main process.
contextBridge.exposeInMainWorld("api", {
  listSessions: (year) => ipcRenderer.invoke("sessions:list", year),
  loadSession: (sessionPath) => ipcRenderer.invoke("session:load", sessionPath),
  getSchedule: (year) => ipcRenderer.invoke("schedule:get", year),
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
  },
  compactWindow: (on) => ipcRenderer.invoke("win:compact", on),
  pinWindow: (on) => ipcRenderer.invoke("win:pin", on),
  notify: (title, body) => ipcRenderer.invoke("notify", title, body),
});
