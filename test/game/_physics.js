// shared helpers for the physics tests (not a test file: no ".test" in the name)
const path = require("node:path");
const ROOT = path.join(__dirname, "../..");
const imp = (p) => import(path.join(ROOT, p));
// a small seeded stream with the engine's Stream interface (next, normal) – the engine never creates its own generator
function stream(seed = 1) {
  let a = 0x9e3779b9 ^ seed, b = 0x243f6a88 + seed, c = 0xb7e15162, d = seed | 0, spare = null;
  const u32 = () => { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0; return t >>> 0; };
  for (let i = 0; i < 12; i++) u32();
  const next = () => u32() / 4294967296;
  return { next, normal() { if (spare != null) { const s = spare; spare = null; return s; } let u, v, q; do { u = next() * 2 - 1; v = next() * 2 - 1; q = u * u + v * v; } while (q >= 1 || q === 0); const f = Math.sqrt(-2 * Math.log(q) / q); spare = v * f; return u * f; } };
}
async function physics() {
  const [profile, car, tyre, energy, driver, lapline, solo, carsBase, energyP, tyresP, driversP, phys, param] = await Promise.all([
    "src/game/engine/profile.js", "src/game/engine/car.js", "src/game/engine/tyre.js", "src/game/engine/energy.js", "src/game/engine/driver.js",
    "src/game/tools/lapline.mjs", "src/game/tools/solo.mjs", "src/game/data/params/cars-base.js", "src/game/data/params/energy.js",
    "src/game/data/params/tyres.js", "src/game/data/params/drivers.js", "src/game/data/params/physics.js", "src/game/data/params/param.js"].map(imp));
  return { profile, car, tyre, energy, driver, lapline, solo, carsBase, energyP, tyresP, driversP, phys, param };
}
// a real lap line from the read-only session cache (null when the cache or the session is absent)
async function realTrack(sess = "2025/2025-07-06_British_Grand_Prix/2025-07-06_Race/") {
  const fs = require("node:fs"), CACHE = path.join(process.env.HOME || "", "Library/Application Support/f1-live-kr/cache");
  if (!fs.existsSync(CACHE)) return null;
  try {
    const { Archive } = require(path.join(ROOT, "src/main/archive.js")), RK = require(path.join(ROOT, "src/renderer/replay.js"));
    const r = new RK.Replay(await new Archive(CACHE).loadSession(sess));
    const lap = r.lapShape(); if (!lap || lap.length < 50) return null;
    const { trackFromXYZ } = await imp("src/game/tools/lapline.mjs");
    return trackFromXYZ(lap.map((p) => [p[0] / 10, p[1] / 10, p[2] / 10]));
  } catch (e) { return null; }
}
module.exports = { ROOT, imp, stream, physics, realTrack };
