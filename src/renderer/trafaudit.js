// v0.45 regression checks (development only, never shown to users): does the traffic correction (traffic.js) keep its
// own promises frame by frame on real sessions, and does a seek / rewind / pause show a moment the same way as playing
// up to it. Pure functions (no three.js): map3d.js's Map3D.trafficAudit / Map3D.seekCheck feed them, the tests use them.

// The promises traffic.js makes (its header and TRAFFIC), checked on one frame:
//   sMax   – no car drawn more than S_MAX m off its own place along the lap
//   order  – no car drawn past the one it is behind (pairs ≥ 0.1 m apart along the lap in the data, same level)
//   road   – no car the data has on the tarmac pushed off it across (lo/hi: the tarmac minus the car's half width,
//            plus the kerb allowance EDGE – as stepTraffic clamps it; a car the data already has outside isn't counted)
//   pairLong – how much further apart along a pair is drawn than in the data (a statistic: LONG_MAX is what one pair
//            asks for, a car in two pairs can be moved by both, each within S_MAX)
// list: stepTraffic's list after the step (num, s, d, y, held, lo, hi); cars: its result (num → { dOff, sOff, res })
export function makeAudit() { return { frames: 0, carFrames: 0, pairs: 0, sMax: { n: 0, worst: 0, at: null }, order: { n: 0, worst: 0, at: null }, road: { n: 0, worst: 0, at: null }, pairLong: { worst: 0, over: 0, at: null }, res: { carFrames: 0, worst: 0 } }; }
export function auditFrame(A, list, cars, T, L, t) {
  A.frames++;
  const on = [];
  for (const c of list) {
    const m = cars.get(c.num); if (!m) continue;
    A.carFrames++; on.push([((c.s % L) + L) % L, c, m]);
    const a = Math.abs(m.sOff);
    if (a > T.S_MAX + 1e-6) { A.sMax.n++; if (a > A.sMax.worst) { A.sMax.worst = a; A.sMax.at = { t, num: c.num, sOff: m.sOff }; } }
    if (!c.held && c.lo != null && c.lo < c.hi && c.d >= c.lo - 1e-6 && c.d <= c.hi + 1e-6) {
      const x = c.d + m.dOff, o = Math.max(c.lo - x, x - c.hi);
      if (o > 0.01) { A.road.n++; if (o > A.road.worst) { A.road.worst = o; A.road.at = { t, num: c.num, d: c.d, dOff: m.dOff, lo: c.lo, hi: c.hi }; } }
    }
    if (m.res > 0.02) { A.res.carFrames++; if (m.res > A.res.worst) A.res.worst = m.res; }
  }
  on.sort((x, y) => x[0] - y[0]);
  const n = on.length;
  for (let i = 0; i < n; i++) for (let k = 1; k < n; k++) {
    const [ur, r, mr] = on[i], [uf, f, mf] = on[(i + k) % n], du = ((uf - ur) % L + L) % L;
    if (du > T.WINDOW) break;
    if (r.held || f.held || Math.abs(r.y - f.y) > T.LEVELS || du < 0.1) continue;
    A.pairs++;
    const g = du + mf.sOff - mr.sOff;
    if (g < 0) { A.order.n++; if (-g > A.order.worst) { A.order.worst = -g; A.order.at = { t, r: r.num, f: f.num, du, g }; } }
    const more = mf.sOff - mr.sOff;
    if (more > A.pairLong.worst) { A.pairLong.worst = more; A.pairLong.at = { t, r: r.num, f: f.num, du }; }
    if (more > T.LONG_MAX + 1e-6) A.pairLong.over++;
  }
  return A;
}
export function auditSummary(A) {
  const r = (v) => +v.toFixed(3);
  return { frames: A.frames, carFrames: A.carFrames, pairs: A.pairs, sMax: { ...A.sMax, worst: r(A.sMax.worst) }, order: { ...A.order, worst: r(A.order.worst) }, road: { ...A.road, worst: r(A.road.worst) }, pairLong: { ...A.pairLong, worst: r(A.pairLong.worst) }, res: { carFrames: A.res.carFrames, worst: r(A.res.worst) } };
}

// Two pictures of the same moment (per car: x, y, z, yaw and the parts that make them – traffic offsets, separate()'s
// push), compared: the largest difference per quantity and the car it is on.
export function diffSnaps(a, b) {
  const out = { cars: 0, onlyOne: [], pos: { m: 0, num: null }, yaw: { m: 0, num: null }, trafD: { m: 0, num: null }, trafS: { m: 0, num: null }, sep: { m: 0, num: null } };
  for (const [num, p] of Object.entries(a)) {
    const q = b[num]; if (!q) { out.onlyOne.push(num); continue; }
    if (p.vis !== q.vis) out.onlyOne.push(num + (p.vis ? "(vis A)" : "(vis B)"));
    if (!p.vis || !q.vis) continue;
    out.cars++;
    const put = (k, v) => { if (v > out[k].m) { out[k].m = v; out[k].num = num; } };
    put("pos", Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
    put("yaw", Math.abs(((p.yaw - q.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
    put("trafD", Math.abs(p.trafD - q.trafD)); put("trafS", Math.abs(p.trafS - q.trafS));
    put("sep", Math.hypot(p.sepX - q.sepX, p.sepZ - q.sepZ));
  }
  for (const num of Object.keys(b)) if (!a[num]) out.onlyOne.push(num);
  for (const k of ["pos", "yaw", "trafD", "trafS", "sep"]) out[k].m = +out[k].m.toFixed(3);
  return out;
}
