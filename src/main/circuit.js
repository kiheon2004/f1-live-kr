// Corner numbers and a fallback track shape from the MultiViewer circuit API.
// Coordinates share F1 live timing's Position system, so they overlay the map directly.
const fs = require("node:fs");
const path = require("node:path");

const API = "https://api.multiviewer.app/api/v1/circuits";

async function fetchYear(key, year) {
  const res = await fetch(`${API}/${key}/${year}`, { headers: { "User-Agent": "f1-live-kr" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const d = await res.json();
  return {
    corners: (d.corners || []).map((c) => ({ n: c.number, x: c.trackPosition.x, y: c.trackPosition.y, angle: c.angle })),
    outline: (d.x || []).map((x, i) => [x, d.y[i]]),
  };
}

// Tries the session year, then the two before it (new layouts appear late). Results are cached on disk.
async function getCircuit(cacheDir, key, year) {
  const file = path.join(cacheDir, `circuit_${key}_${year}.json`);
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  for (const y of [year, year - 1, year - 2]) {
    const info = await fetchYear(key, y).catch(() => null);
    if (info && info.corners.length) {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(info));
      return info;
    }
  }
  return null;
}

module.exports = { getCircuit };
