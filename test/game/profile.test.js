// profile.js – the speed-limit envelope: causality (what each coefficient changes and what it must not), feasibility of
// the braking envelope, ranges and speed.
const test = require("node:test");
const assert = require("node:assert");
const { physics } = require("./_physics.js");

let X, tr, car, st;
test.before(async () => {
  X = await physics();
  tr = X.lapline.genericTrack(); car = X.carsBase.carBase(2025);
  st = { m: car.m_min + 50, P: car.P_ice + 120e3, rho: 1.18 };
});
const prof = (c = car, s = st, t = tr) => X.profile.computeProfile(t, c, s);
// indices of the generic layout's features: the sample of max |κ| inside a segment range (metres)
function apexIn(t, a, b) { let best = -1, k = -1; for (let i = Math.round(a / t.ds); i < Math.round(b / t.ds); i++) if (Math.abs(t.kappa[i]) > best) { best = Math.abs(t.kappa[i]); k = i; } return k; }

test("envelope: v_b ≤ v_c everywhere, all finite and positive, flying lap time finite", () => {
  const p = prof();
  for (let i = 0; i < tr.n; i++) { assert.ok(Number.isFinite(p.vb[i]) && p.vb[i] > 0); assert.ok(p.vb[i] <= p.vc[i] + 1e-9); assert.ok(p.vf[i] <= p.vb[i] + 1e-9); }
  assert.ok(p.lapTime > 50 && p.lapTime < 120, "generic 4.6 km lap: " + p.lapTime);
});

test("braking envelope is reachable: between samples the speed drop never needs more than the car's braking capacity", () => {
  const p = prof(), G = X.phys.PHYS.g, kd = 0.5 * st.rho * car.CdA / st.m, kl = 0.5 * st.rho * car.ClA / st.m;
  for (let i = 0; i < tr.n; i++) {
    const j = (i + 1) % tr.n, v = p.vb[j];
    const dec = (p.vb[i] ** 2 - v * v) / (2 * tr.ds); if (dec <= 0) continue;
    const aTot = p.mu * (G + kl * v * v), r = v * v * Math.abs(tr.kappa[j]) / aTot;
    const cap = Math.min(car.k_brake * aTot * X.profile.comb(r, car.f_comb), car.a_brake_max) + kd * v * v + X.phys.PHYS.Crr * G + G * tr.grade[i];
    assert.ok(dec <= cap + 1e-6, `sample ${i}: needs ${dec.toFixed(2)} m/s², has ${cap.toFixed(2)}`);
  }
});

test("more downforce: faster in fast corners (a lot), in slow corners (a little), not on the straights' top speed", () => {
  const p0 = prof(), p1 = prof({ ...car, ClA: car.ClA * 1.15 });
  const fast = apexIn(tr, 1245, 1405), slow = apexIn(tr, 900, 945); // the R = 120 m corner, the R = 18 m hairpin
  const gFast = p1.vc[fast] / p0.vc[fast] - 1, gSlow = p1.vc[slow] / p0.vc[slow] - 1;
  assert.ok(gFast > 0.03, "fast corner gain " + gFast);
  assert.ok(gSlow > 0 && gSlow < gFast / 3, `slow corner gain ${gSlow} should be well below the fast corner's ${gFast}`);
  const top0 = Math.max(...p0.vf), top1 = Math.max(...p1.vf);
  assert.ok(Math.abs(top1 / top0 - 1) < 0.003, "top speed must not change with downforce alone (drag is CdA): " + top0 + " → " + top1);
  assert.ok(p1.lapTime < p0.lapTime);
});

test("more drag: lower top speed and slower lap; corner caps unchanged", () => {
  const p0 = prof(), p1 = prof({ ...car, CdA: car.CdA * 1.15 });
  assert.ok(Math.max(...p1.vf) < Math.max(...p0.vf) - 2, "top speed drop");
  assert.ok(p1.lapTime > p0.lapTime);
  for (let i = 0; i < tr.n; i += 37) assert.strictEqual(p1.vc[i], p0.vc[i]);
});

test("grade: the same straight is climbed slower uphill than on the flat, and descended faster", () => {
  const seg = (g) => [{ len: 300 }, { len: 40, R: 25 }, { len: 1200, grade: g }, { len: 40, R: 25 }, { len: 300 }];
  const mk = (g) => X.lapline.synthTrack(seg(g), { sigma: 4 });
  const flat = prof(car, st, mk(0)), up = prof(car, st, mk(0.05)), down = prof(car, st, mk(-0.05));
  const i = Math.round(1000 / 2); // mid-way along the long straight (still accelerating)
  assert.ok(up.vf[i] < flat.vf[i] - 0.5, `uphill ${up.vf[i]} vs flat ${flat.vf[i]}`);
  assert.ok(down.vf[i] > flat.vf[i] + 0.5, `downhill ${down.vf[i]} vs flat ${flat.vf[i]}`);
});

test("mass, grip, power: heavier → slower; more grip → faster; more power → faster on the straights", () => {
  const p0 = prof();
  assert.ok(prof(car, { ...st, m: st.m + 30 }).lapTime > p0.lapTime);
  assert.ok(prof(car, { ...st, muTyre: 1.02 }).lapTime < p0.lapTime);
  const pp = prof(car, { ...st, P: st.P * 1.1 });
  assert.ok(pp.lapTime < p0.lapTime && Math.max(...pp.vf) > Math.max(...p0.vf));
  // the per-sample forms (DRS/Straight Mode arrays) agree with the scalar forms when uniform
  const u = new Float64Array(tr.n).fill(1), pa = prof(car, { ...st, cdaMul: u, claMul: u, P: new Float64Array(tr.n).fill(st.P) });
  assert.ok(Math.abs(pa.lapTime - p0.lapTime) < 1e-9);
});

test("DRS-like drag cut on one straight only raises the speed there (array form)", () => {
  const cda = new Float64Array(tr.n).fill(1); for (let i = 0; i < 450; i++) cda[i] = 0.86; // the first 900 m straight
  const p0 = prof(), p1 = prof(car, { ...st, cdaMul: cda });
  const top = (p) => Math.max(...p.vf.subarray(0, 450));
  assert.ok(top(p1) > top(p0) + 1, `DRS straight top speed ${top(p0)} → ${top(p1)}`);
  assert.ok(Math.abs(p1.vf[1000] - p0.vf[1000]) < 0.5, "elsewhere unchanged (± the different entry speed)");
  assert.ok(p1.lapTime < p0.lapTime);
});

test("flat-out corner (downforce beats the needed lateral force) is capped finite at vMax; no NaN for zero curvature", () => {
  const t = X.lapline.synthTrack([{ len: 2000 }, { len: 600, R: 900 }, { len: 1000 }, { len: 60, R: 20 }]);
  const p = prof(car, st, t);
  for (let i = 0; i < t.n; i++) assert.ok(Number.isFinite(p.vc[i]) && p.vc[i] <= X.phys.PHYS.vMax);
  assert.ok(Number.isFinite(p.lapTime));
});

test("re-profile trigger: 0.3 % grip or 5 kg mass", () => {
  const p = prof();
  assert.strictEqual(X.profile.needsReprofile(p, p.mu * 1.001, p.m + 1), false);
  assert.strictEqual(X.profile.needsReprofile(p, p.mu * 1.004, p.m), true);
  assert.strictEqual(X.profile.needsReprofile(p, p.mu, p.m - 6), true);
});

test("speed: 2500-sample envelope (corner + braking, as recomputed in the race loop) – measured, generous bound", () => {
  const t = X.lapline.synthTrack(X.lapline.GENERIC_SEGMENTS.map((g) => ({ ...g, len: g.len * 2500 / 2300 })));
  assert.ok(Math.abs(t.n - 2500) < 5);
  const out = X.profile.makeProfile(t.n), s0 = { ...st, forward: false }, s1 = { ...st, forward: true };
  for (let i = 0; i < 300; i++) X.profile.computeProfile(t, car, s0, out);
  const time = (s, N) => { const a = process.hrtime.bigint(); for (let i = 0; i < N; i++) X.profile.computeProfile(t, car, s, out); return Number(process.hrtime.bigint() - a) / N / 1e6; };
  const msEnv = time(s0, 2000), msFull = time(s1, 1000);
  console.log(`# profile 2500 samples: envelope ${(msEnv * 1000).toFixed(1)} µs, with forward pass ${(msFull * 1000).toFixed(1)} µs`);
  assert.ok(msEnv < 2.0, "envelope " + msEnv + " ms (target 0.2 ms on an idle M3; the bound is loose for a shared, loaded machine)");
});

test("corner-speed band factors (k_low / k_mid): only the corners of that speed change; the fixed point is converged", () => {
  const p0 = prof(), p1 = prof({ ...car, k_low: 0.8 }), p2 = prof({ ...car, k_mid: 0.9 });
  const slow = apexIn(tr, 900, 945), fast = apexIn(tr, 1245, 1405);
  assert.ok(p1.vc[slow] < p0.vc[slow] * 0.92, "hairpin slower with k_low 0.8");
  assert.ok(Math.abs(p1.vc[fast] / p0.vc[fast] - 1) < 0.01, "fast corner (≈ 250 km/h) untouched by k_low");
  const mid = apexIn(tr, 2835, 2955); // R = 70 m: ≈ 45–60 m/s
  assert.ok(p2.vc[mid] < p0.vc[mid] * 0.99, `k_mid acts on the 70 m corner (${p0.vc[mid]} m/s)`);
  // converged: the band factor at the solved speed reproduces the speed (v² = μk·g/(|κ| − μk·kl))
  const G = 9.80665, kl = 0.5 * st.rho * car.ClA / st.m, v = p1.vc[slow], mu = p1.mu * 0.8; // slow apex is below vb_low ⇒ factor k_low
  const vv = Math.sqrt(mu * G / (Math.abs(tr.kappa[slow]) - mu * kl));
  assert.ok(Math.abs(vv - v) < 0.03, `${vv} vs ${v}`);
});
