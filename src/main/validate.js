// Checks for what crosses from the renderer into the main process (IPC arguments) and for links the app opens.
// Kept free of Electron so the tests can load it.
const path = require("node:path");

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// Map tile coordinates: whole numbers, zoom 0–22, x and y within the zoom's 2^z grid. Returns [z, x, y] or throws.
function tileArgs(z, x, y) {
  if (!isInt(z, 0, 22)) throw new Error("bad tile zoom");
  const n = 2 ** z;
  if (!isInt(x, 0, n - 1) || !isInt(y, 0, n - 1)) throw new Error("bad tile coordinates");
  return [z, x, y];
}

// `file` resolved inside `dir` (no "..", no absolute path out of it), else throws.
function inside(dir, file) {
  const base = path.resolve(dir), full = path.resolve(base, file);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error("path outside the cache");
  return full;
}

const year = (v) => { if (!isInt(v, 2018, 2100)) throw new Error("bad year"); return v; };
// a calendar season (the home screen shows calendars from before the archive's first season, 2018, as out of its range)
const season = (v) => { if (!isInt(v, 1950, 2100)) throw new Error("bad season"); return v; };
// MultiViewer circuit keys are small integers
const circuitKey = (v) => { const k = typeof v === "string" && /^\d{1,4}$/.test(v) ? +v : v; if (!isInt(k, 0, 9999)) throw new Error("bad circuit key"); return k; };
// a short plain string (location names, session paths), else throws
const text = (v, max = 300) => { if (typeof v !== "string" || !v || v.length > max || /[\0]/.test(v)) throw new Error("bad text argument"); return v; };
// archive session paths look like "2025/2025-09-07_Italian_Grand_Prix/2025-09-07_Race/"
const sessionPath = (v) => { text(v); if (!/^\d{4}\/[^/]+\/[^/]+\/$/.test(v) || v.includes("..")) throw new Error("bad session path"); return v; };

// a loading job's number (the page numbers its loads; progress messages carry it back): a positive whole number
const jobId = (v) => { if (v === undefined || v === null) return null; if (!isInt(v, 1, 2 ** 31 - 1)) throw new Error("bad job id"); return v; };
// a list of session paths (the home screen asks which of a season's sessions are on this computer)
const sessionPaths = (v) => { if (!Array.isArray(v) || v.length > 400) throw new Error("bad session list"); return v.map(sessionPath); };

// Links the app hands to the system browser: web pages only (no file:, javascript:, custom app schemes).
function externalUrl(url) {
  try { const u = new URL(url); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
}

// IPC is answered only for the app's own page: the main window's top frame, loaded from the app's own files.
function trustedSender(frame, win, pageUrl) {
  if (!frame || !win || win.isDestroyed?.()) return false;
  if (frame !== win.webContents.mainFrame) return false;
  // (compared without hash or query and with percent-encoding undone: the packaged app's page sits in app.asar)
  const norm = (u) => { try { const x = new URL(u); return x.protocol === "file:" ? decodeURIComponent(x.pathname) : null; } catch { return null; } };
  const a = norm(frame.url);
  return a != null && a === norm(pageUrl);
}

// a facility model file name (src/data/models): "silverstone-wing.glb"
const modelFile = (v) => { if (typeof v !== "string" || !/^[a-z0-9][a-z0-9_-]{0,80}\.glb$/.test(v)) throw new Error("bad model file"); return v; };

module.exports = { modelFile, tileArgs, inside, year, season, circuitKey, text, sessionPath, jobId, sessionPaths, externalUrl, trustedSender };
