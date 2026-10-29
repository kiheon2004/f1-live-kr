// v0.47 active aero: nothing after the query's limit (min(t + lag, now)) is read – not the brake samples, not for the
// state at the zone's entry or its continuity either. The same past with any future added or changed gives the same
// result (review of v0.46.0, §1: a future sample's brake value decided whether the brake carried across the entry).
const test = require("node:test");
const assert = require("node:assert");
const load = () => import("../src/renderer/aero.js");

function hist(points, step = 125) {
  const t = [], s = [], r = [], t0 = points[0][0], t1 = points[points.length - 1][0];
  for (let tt = t0; tt <= t1; tt += step) {
    let k = 0; while (k + 2 < points.length && points[k + 1][0] <= tt) k++;
    const [ta, sa] = points[k], [tb, sb] = points[k + 1], f = (tt - ta) / (tb - ta);
    t.push(tt); s.push(sa + (sb - sa) * f); r.push(1);
  }
  return { t: Float64Array.from(t), s: Float64Array.from(s), run: Int32Array.from(r) };
}
const base = (o) => ({ allowed: true, onTrack: true, racing: true, mode: "normal", L: 5000, ...o });

test("the review's repro: t = now = 750 ms, entry 500 ms, samples [0, 1000], braking at 0 – the 1000 ms sample (future) changes nothing", async () => {
  const { activeAeroAt } = await load();
  const spans = [{ a: 1000, b: 2000, len: 1000, z: {} }];
  const H = hist([[0, 950], [1000, 1050]]);   // 100 m/s: the zone's start (s 1000) crossed at 500 ms
  const run = (future) => activeAeroAt(base({ spans, hist: H, t: 750, now: 750, s: 1025, speed: 360, tel: { t: [0, 1000], brk: [1, future] } }));
  const a = run(0), b = run(1);
  assert.strictEqual(Math.round(a.tEntry), 500);
  assert.strictEqual(a.open, b.open, `future brake 0 → open ${a.open} (${a.why}), 1 → open ${b.open} (${b.why})`);
  // braking 500 ms before the entry and no sample since: still braking (HOLD) – not yet activated
  assert.strictEqual(a.open, 0); assert.strictEqual(a.why, "braking (not yet activated)");
});

test("no sample at or after the entry yet: the brake carried across it is judged from the past alone", async () => {
  const { activeAeroAt, HOLD } = await load();
  const spans = [{ a: 1000, b: 2000, len: 1000, z: {} }];
  const H = hist([[0, 950], [3000, 1250]]);
  // braking at 0, entry at 500; at t 750 there is nothing newer – with or without a later (future) sample
  const only = activeAeroAt(base({ spans, hist: H, t: 750, now: 750, s: 1025, speed: 360, tel: { t: [0], brk: [1] } }));
  const more = activeAeroAt(base({ spans, hist: H, t: 750, now: 750, s: 1025, speed: 360, tel: { t: [0, 2000], brk: [1, 0] } }));
  assert.deepStrictEqual([only.open, only.why], [more.open, more.why]);
  // the previous brake state lasts HOLD ms past its sample: with no sample since, released at 0 + HOLD
  const late = activeAeroAt(base({ spans, hist: H, t: HOLD + 200, now: HOLD + 200, s: 950 + (HOLD + 200) / 10, speed: 360, tel: { t: [0], brk: [1] } }));
  assert.ok(late.open > 0 && late.open < 1, `released at HOLD: ${JSON.stringify(late)}`);
});

test("prefix property: random telemetry and positions – the result at t is the same with the samples after t dropped, flipped or added", async () => {
  const { activeAeroAt } = await load();
  let seed = 47; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const spans = [{ a: 1000, b: 2200, len: 1200, z: {} }];
  for (let k = 0; k < 300; k++) {
    const s0 = 700 + rnd() * 200, H = hist([[0, s0], [30000, 2600]]), tE = ((1000 - s0) / (2600 - s0)) * 30000;
    // (brake samples bunched around the zone's entry, gaps up to 1.4 s: the carried brake and its continuity in play)
    const tel = { t: [], brk: [], v: [] }; let tt = rnd() * 200;
    while (tt < 30000) { const near = Math.abs(tt - tE) < 1500; tel.t.push(tt); tel.brk.push(rnd() < (near ? 0.6 : 0.15) ? 1 : 0); tel.v.push(200 + rnd() * 100); tt += 150 + rnd() * (rnd() < 0.3 ? 1200 : 300); }
    const t = rnd() < 0.7 ? tE + rnd() * 1500 : 2000 + rnd() * 20000, lag = rnd() < 0.5 ? 0 : Math.round(rnd() * 400), lim = t + lag;
    const sAt = (() => { let i = 0; while (i + 1 < H.t.length && H.t[i + 1] <= t) i++; return H.s[i] + (H.s[Math.min(i + 1, H.s.length - 1)] - H.s[i]) * ((t - H.t[i]) / 125); })();
    const inp = (tl) => base({ spans, hist: H, lag, t, now: lim, s: sAt % 5000, speed: 300, tel: tl });
    const ref = activeAeroAt(inp(tel), {});
    const n = tel.t.filter((x) => x <= lim).length;
    const cut = { t: tel.t.slice(0, n), brk: tel.brk.slice(0, n), v: tel.v.slice(0, n) };
    const flip = { t: tel.t, brk: tel.brk.map((b, i) => (i >= n ? 1 - b : b)), v: tel.v.map((v, i) => (i >= n ? 400 - v : v)) };
    const add = { t: [...cut.t, lim + 1, lim + 50], brk: [...cut.brk, 1, 1], v: [...cut.v, 100, 50] };
    for (const [name, tl] of [["dropped", cut], ["flipped", flip], ["added", add]]) {
      const r = activeAeroAt(inp(tl), {});
      assert.deepStrictEqual([r.open, r.why], [ref.open, ref.why], `case ${k} (${name}) t ${t.toFixed(0)} lag ${lag}`);
    }
  }
});
