// driver.js – AR(1) utilisation (statistics, determinism, only the stream passed in), and the pace trade-off emerging from
// the physics: attack faster now but costs tyres; manage keeps tyres but is slower – neither is always best.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { physics, stream, ROOT } = require("./_physics.js");

let X, D;
test.before(async () => { X = await physics(); D = X.driver; });

test("AR(1): stationary σ ≈ consistency, lag correlation ≈ exp(−DT/τ), no step-to-step jitter", () => {
  const d = D.createDriver({ consistency: 0.003, tau: 6 }), rng = stream(7), xs = [];
  for (let k = 0; k < 200000; k++) { D.stepDriver(d, rng, 0.05); xs.push(d.x); }
  const mean = xs.reduce((a, b) => a + b) / xs.length, sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  assert.ok(Math.abs(sd / 0.003 - 1) < 0.15, "σ " + sd);
  let c = 0; for (let k = 1; k < xs.length; k++) c += (xs[k] - mean) * (xs[k - 1] - mean);
  const r1 = c / xs.length / (sd * sd);
  assert.ok(Math.abs(r1 - Math.exp(-0.05 / 6)) < 0.005, "lag-1 correlation " + r1);
  let maxJump = 0; for (let k = 1; k < xs.length; k++) maxJump = Math.max(maxJump, Math.abs(xs[k] - xs[k - 1]));
  assert.ok(maxJump < 0.003, "per-step change ≪ σ·few: " + maxJump);
});

test("deterministic: the same stream state gives the same path; the module never makes its own randomness", () => {
  const run = () => { const d = D.createDriver(), r = stream(42), o = []; for (let k = 0; k < 500; k++) { D.stepDriver(d, r, 0.05); o.push(D.utilisation(d)); } return o; };
  assert.deepStrictEqual(run(), run());
  for (const f of ["profile", "car", "tyre", "energy", "driver"]) {
    const src = fs.readFileSync(path.join(ROOT, "src/game/engine", f + ".js"), "utf8").replace(/\/\/.*$/gm, "");
    assert.ok(!/Math\.random|Date\.now|performance\.now|\bwindow\.|\bdocument\.|three/i.test(src), f + ".js must stay pure");
  }
});

test("utilisation ≤ 1 always; pace modes order it attack > balanced > manage; the wet scales it with water", () => {
  const d = D.createDriver({ consistency: 0.01 }), r = stream(3);
  for (let k = 0; k < 20000; k++) { D.stepDriver(d, r, 0.05); assert.ok(D.utilisation(d) <= 1 && D.utilisation(d) >= 0.9); }
  const z = D.createDriver({ consistency: 0 }), u = (m) => { D.setPaceMode(z, m); return D.utilisation(z); };
  assert.ok(u("attack") > u("balanced") && u("balanced") > u("manage"));
  const w = D.createDriver({ consistency: 0, wet: 0.98 });
  assert.ok(D.utilisation(w, 2) < D.utilisation(w, 0));
  assert.throws(() => D.setPaceMode(z, "flat-out"));
  D.setPaceMode(z, "attack"); const hA = D.tyreHeatFactor(z); D.setPaceMode(z, "manage");
  assert.ok(hA > D.tyreHeatFactor(z));
});

// the trade-off over a stint (C3, generic 4.6 km track, 60 kg fuel, the same conditions for each mode)
const stint = (laps, pace, o = {}) => X.solo.runSolo({ track: X.lapline.genericTrack(), car: X.carsBase.carBase(2025), compound: "C3", laps, pace, v0: 60, fuel: 60, ...o });

test("attack vs manage over a stint: attack wins a short stint, loses a long one; manage is never free", () => {
  const short = Object.fromEntries(["attack", "balanced", "manage"].map((m) => [m, stint(5, m)]));
  assert.ok(short.attack.total < short.balanced.total && short.balanced.total < short.manage.total,
    `5 laps: attack ${short.attack.total.toFixed(2)} balanced ${short.balanced.total.toFixed(2)} manage ${short.manage.total.toFixed(2)}`);
  // costs of attack: hotter, more wear
  assert.ok(short.attack.tyre.wear > short.balanced.tyre.wear && short.balanced.tyre.wear > short.manage.tyre.wear);
  const long = Object.fromEntries(["attack", "balanced", "manage"].map((m) => [m, stint(32, m)]));
  console.log(`# stint totals – 5 laps: A ${short.attack.total.toFixed(2)} B ${short.balanced.total.toFixed(2)} M ${short.manage.total.toFixed(2)} | 32 laps: A ${long.attack.total.toFixed(2)} B ${long.balanced.total.toFixed(2)} M ${long.manage.total.toFixed(2)} (wear ${long.attack.tyre.wear.toFixed(2)}/${long.balanced.tyre.wear.toFixed(2)}/${long.manage.tyre.wear.toFixed(2)})`);
  assert.ok(long.attack.total > long.balanced.total, "over 32 laps attack is not best (it reached the wear cliff)");
  assert.ok(long.attack.total > long.manage.total, "and manage beats it");
  // manage is not free: each of its early laps is slower than balanced
  for (let k = 0; k < 5; k++) assert.ok(long.manage.laps[k] > long.balanced.laps[k] + 0.05, "manage lap " + k + " slower");
  // and the reason is the tyre: attack's last laps are slower than its first, by more than manage's
  const fade = (r) => r.laps.slice(-3).reduce((a, b) => a + b) / 3 - r.laps.slice(1, 4).reduce((a, b) => a + b) / 3;
  assert.ok(fade(long.attack) > fade(long.manage) + 0.5, `fade attack ${fade(long.attack)} vs manage ${fade(long.manage)}`);
});

test("a hot track makes attack overheat sooner – its advantage over a 15-lap stint shrinks or reverses", () => {
  const gain = (o) => stint(15, "balanced", o).total - stint(15, "attack", o).total;
  const gNorm = gain({ Ttrack: 35, Tair: 25 }), gHot = gain({ Ttrack: 55, Tair: 35 });
  assert.ok(gHot < gNorm, `attack gain normal ${gNorm.toFixed(2)} s, hot ${gHot.toFixed(2)} s`);
});
