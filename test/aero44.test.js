// v0.44 wings (aero.js, car3d.js setAero): DRS ≤ 2025 from its channel vs 2026 active aero estimated; zones on the lap
// (across its start too); locks (Monaco 2026); team mechanisms only from the race they were run; a pose that is a
// function of the session's time (seek); closed in the pit lane, stopped, braking, neutralised; joints that turn one
// way about one axis.
const test = require("node:test");
const assert = require("node:assert");
const load = () => import("../src/renderer/aero.js");

test("era: DRS up to 2025, active aero from 2026", async () => {
  const { ERA, aeroSpecFor } = await load();
  assert.strictEqual(ERA(2025), "drs"); assert.strictEqual(ERA(2026), "active"); assert.strictEqual(ERA(2027), "active"); assert.strictEqual(ERA(null), null);
  const s25 = aeroSpecFor(2025, "Ferrari", "2025-09-07"), s26 = aeroSpecFor(2026, "Mercedes", "2026-09-06");
  assert.strictEqual(s25.id, "drs"); assert.strictEqual(s25.fw.primary, 0, "2025: front flaps fixed");
  assert.ok(s26.fw.primary < 0 && s26.rw.angle < 0, "2026: both wings");
});

test("DRS from the telemetry: open from the first open sample, the same pose for the same t (seek), null without the channel", async () => {
  const { drsAt, MOVE } = await load();
  const tel = { t: [0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000], drs: [8, 8, 12, 12, 12, 12, 1, 1, 1] };
  assert.strictEqual(drsAt(tel, 250).open, 0);
  assert.strictEqual(drsAt(tel, 500).open, 0, "starts opening at the first open sample");
  const mid = drsAt(tel, 500 + MOVE.drsOpen * 500).open; assert.ok(mid > 0 && mid < 1);
  assert.strictEqual(drsAt(tel, 1200).open, 1);
  assert.deepStrictEqual(drsAt(tel, 1200), drsAt(tel, 1200), "a function of t");
  assert.ok(drsAt(tel, 1500).open === 1 && drsAt(tel, 1600).open < 1 && drsAt(tel, 2000).open === 0, "closes from the first shut sample");
  assert.ok(drsAt(tel, 1200).measured);
  // 2026: the channel isn't sent (255) → null; nothing within 3 s → null
  assert.strictEqual(drsAt({ t: [0, 250], drs: [255, 255] }, 100), null);
  assert.strictEqual(drsAt(tel, 9000), null);
  assert.strictEqual(drsAt(null, 0), null);
});

test("zones on the lap: membership, and a zone across the lap line's start", async () => {
  const { zoneSpans, zoneAt } = await load();
  const L = 5000, st = [{ n: 1, s: 400 }, { n: 2, s: 1500 }, { n: 11, s: 4600 }];
  const spans = zoneSpans([{ from: [11, 150], to: [1, -120] }, { from: [1, 200], to: [2, -100] }], st, L);
  assert.strictEqual(spans.length, 2);
  const w = spans[0]; assert.ok(w.a > w.b, "wraps"); assert.strictEqual(Math.round(w.len), 5000 - 4750 + 280);
  for (const s of [4800, 4999, 0, 100, 270]) assert.ok(zoneAt(s, spans, L).into != null, `in at ${s}`);
  assert.strictEqual(Math.round(zoneAt(100, spans, L).into), 350);
  assert.strictEqual(Math.round(zoneAt(-4900, spans, L).into), 350, "laps beyond the line wrap");
  const after = zoneAt(300, spans, L); assert.ok(after.into == null && Math.round(after.after) === 20);
  assert.strictEqual(zoneAt(3000, spans, L), null);
  // a corner the map doesn't have: no zone made up
  assert.strictEqual(zoneSpans([{ from: [9, 0], to: [1, 0] }], st, L).length, 0);
});

test("estimated zones: the long straights of a lap line, none round a bend", async () => {
  const { estimateZones } = await load();
  // a stadium: two 1000 m straights joined by half circles (r 100)
  const pts = []; for (let x = 0; x < 1000; x += 5) pts.push({ x, z: 0 });
  for (let a = 0; a < 180; a += 3) { const r = (a * Math.PI) / 180; pts.push({ x: 1000 + Math.sin(r) * 100, z: 100 - Math.cos(r) * 100 }); }
  for (let x = 1000; x > 0; x -= 5) pts.push({ x, z: 200 });
  for (let a = 0; a < 180; a += 3) { const r = (a * Math.PI) / 180; pts.push({ x: -Math.sin(r) * 100, z: 100 + Math.cos(r) * 100 }); }
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const L = cum[cum.length - 1] + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
  const z = estimateZones(pts, cum, L);
  assert.strictEqual(z.length, 2, JSON.stringify(z));
  for (const q of z) { assert.ok(q.estimated); assert.ok(q.len > 700 && q.len < 1000, `${q.len}`); }
});

test("2026 active aero, estimated: in the zone at speed; shut braking, in the pit lane, stopped, neutralised, before the start, locked", async () => {
  const { activeAeroAt, zoneSpans, MOVE } = await load();
  const L = 5000, spans = zoneSpans([{ from: [11, 150], to: [1, -120] }], [{ n: 1, s: 400 }, { n: 11, s: 4600 }], L);
  // a car at 300 km/h (83.3 m/s): 0.6 s per 50 m
  const tel = { t: [], v: [], brk: [] }; for (let k = 0; k <= 400; k++) { tel.t.push(k * 250); tel.v.push(300); tel.brk.push(k >= 360 ? 1 : 0); }
  const base = { allowed: true, spans, L, speed: 300, tel, onTrack: true, neutral: false, racing: true };
  // 200 m into the zone (2.4 s in): open, and estimated
  const a = activeAeroAt({ ...base, s: 4950, t: 60000 }); assert.strictEqual(a.open, 1); assert.ok(a.estimated);
  // just in: part way
  const b = activeAeroAt({ ...base, s: 4752, t: 60000 }); assert.ok(b.open > 0 && b.open < 1, `${b.open}`);
  // the brake at 90 s (sample 360): shut once it has had time to move
  assert.strictEqual(activeAeroAt({ ...base, s: 200, t: 90000 + MOVE.close * 1000 + 10 }).open, 0);
  assert.ok(activeAeroAt({ ...base, s: 200, t: 90100 }).open > 0, "closing, not snapped");
  // outside every zone
  assert.strictEqual(activeAeroAt({ ...base, s: 2500, t: 60000 }).open, 0);
  for (const k of [{ onTrack: false }, { allowed: false }, { mode: "disabled" }, { racing: false }, { speed: 0 }, { s: null }, { spans: [] }]) assert.strictEqual(activeAeroAt({ ...base, s: 4950, t: 60000, ...k }).open, 0, JSON.stringify(k));
  // no telemetry: by the zone alone
  assert.strictEqual(activeAeroAt({ ...base, tel: null, s: 4950, t: 60000 }).open, 1);
  // the same input, the same pose (seek / pause)
  assert.deepStrictEqual(activeAeroAt({ ...base, s: 4752, t: 60000 }), b);
});

test("mechanism hinges: the rear flap's in its back half (2026 C3.11.6 b), the DRS flap's at its trailing edge (2025 3.10.10 b)", async () => {
  const { hingeOf } = await load();
  const sec = [[0.8, -2.0], [0.82, -2.05], [0.85, -2.1], [0.88, -2.2], [0.86, -2.2], [0.83, -2.1], [0.8, -2.02]];
  const [y, z] = hingeOf(sec, 0.75); assert.ok(z < -2.1 && z > -2.2); assert.ok(y > 0.84 && y < 0.89, `${y}`);
});

test("team mechanisms only from the race they were run: Ferrari / Red Bull rotating wings from Miami 2026, Red Bull's off at Spa, McLaren's at Monza only", async () => {
  const { aeroSpecFor } = await load();
  const id = (team, d, n) => aeroSpecFor(2026, team, d, undefined, n).id;
  assert.strictEqual(id("Ferrari", "2026-03-08"), "active-generic", "not in Australia");
  assert.strictEqual(id("Ferrari", null), "active-generic", "no date: never a later design");
  assert.strictEqual(id("Ferrari", "2026-05-01"), "ferrari-rotating"); assert.strictEqual(id("Ferrari", "2026-09-06"), "ferrari-rotating");
  assert.strictEqual(id("Red Bull Racing", "2026-04-22"), "active-generic", "a filming day is not a race");
  assert.strictEqual(id("Red Bull Racing", "2026-05-03"), "redbull-rotating");
  assert.strictEqual(id("Red Bull Racing", "2026-07-19"), "active-generic", "Spa: the standard wing");
  assert.ok(/^L/.test(aeroSpecFor(2026, "Red Bull Racing", "2026-09-06").conf), "after Hungary: low confidence, labelled");
  assert.strictEqual(id("Racing Bulls", "2026-09-06"), "active-generic");
  assert.strictEqual(id("McLaren", "2026-06-28"), "active-generic", "Austria: brought, never run");
  assert.strictEqual(id("McLaren", "2026-09-04", "4"), "mclaren-hwing"); assert.strictEqual(id("McLaren", "2026-09-04", "81"), "active-generic", "FP1: Norris only");
  assert.strictEqual(id("McLaren", "2026-09-06", "81"), "mclaren-hwing"); assert.strictEqual(id("McLaren", "2026-09-26", "4"), "active-generic", "after Monza: nothing found");
  assert.strictEqual(aeroSpecFor(2025, "Ferrari", "2025-09-07").id, "drs"); assert.strictEqual(aeroSpecFor(2025, "Red Bull Racing", "2025-05-04").id, "drs");
});

test("events: Monaco 2026 locked all weekend, zones per venue and season, race control's Straight Mode word", async () => {
  const { aeroLock, zonesFor, smModeOf, activeAeroAt } = await load();
  for (const d of ["2026-06-05", "2026-06-06", "2026-06-07", null]) assert.ok(aeroLock(22, 2026, d));
  assert.ok(!aeroLock(22, 2025) && !aeroLock(39, 2026));
  assert.strictEqual(zonesFor(39, 2026).zones.length, 4); assert.strictEqual(zonesFor(46, 2026).zones.length, 2);
  assert.strictEqual(zonesFor(39, 2025), null, "no 2026 zones on a 2025 race"); assert.strictEqual(zonesFor(22, 2026), null);
  for (const v of [39, 23, 2, 46, 55]) assert.strictEqual(zonesFor(v, 2026).zones.filter((z) => z.t1).length, 1, `${v}: one zone ends at T1`);
  assert.strictEqual(smModeOf([]), "normal");
  assert.strictEqual(smModeOf([{ Message: "STRAIGHT MODE - LOW GRIP" }, { Message: "OVERTAKE ENABLED" }]), "low", "Overtake (electrical) is not the wings");
  assert.strictEqual(smModeOf([{ Message: "STRAIGHT MODE - LOW GRIP" }, { Message: "STRAIGHT MODE - DISABLED" }]), "disabled");
  assert.strictEqual(smModeOf([{ Message: "STRAIGHT MODE - DISABLED" }, { Message: "STRAIGHT MODE - NORMAL GRIP" }]), "normal");
  // low grip: the front alone, and nothing in a zone without a low-grip start
  const spans = [{ a: 100, b: 900, len: 800, z: {} }, { a: 1500, b: 2000, len: 500, z: { low: false } }];
  const base = { allowed: true, spans, L: 5000, speed: 300, tel: null, t: 1e6, onTrack: true, mode: "low" };
  const p = activeAeroAt({ ...base, s: 700 }); assert.strictEqual(p.open, 0); assert.strictEqual(p.front, 1);
  assert.strictEqual(activeAeroAt({ ...base, s: 1900 }).front, 0);
});

test("the start: Straight Mode shut in the zone ending at Turn 1 until past it (standing start), then usable", async () => {
  const { activeAeroAt } = await load();
  const spans = [{ a: 4700, b: 300, len: 600, z: { t1: true } }, { a: 1000, b: 1800, len: 800, z: {} }];
  const base = { allowed: true, spans, L: 5000, speed: 250, tel: null, onTrack: true, startGate: 100000, racing: true };
  assert.strictEqual(activeAeroAt({ ...base, s: 100, t: 104000 }).open, 0, "off the grid, before T1");
  assert.strictEqual(activeAeroAt({ ...base, s: 1500, t: 130000 }).open, 1, "the next zone after T1");
  assert.strictEqual(activeAeroAt({ ...base, s: 100, t: 190000 }).open, 1, "the main straight a lap later");
  assert.strictEqual(activeAeroAt({ ...base, racing: false, s: 1500, t: 90000 }).open, 0, "before lights out");
});

test("car joints: only the flaps move, about one axis each, monotonic from shut to open (no flip back), the DRS gap within 85 mm", async () => {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const C = await import("../src/renderer/car3d.js");
  const lePath = (car) => {
    const u = car.userData, pv = u.rwPivot, g = pv.children[0].geometry, bb = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
    // the flap's leading-edge point at the middle of the span (car coordinates)
    const p = g.attributes.position; let best = null; for (let i = 0; i < p.count; i++) { if (Math.abs(p.getX(i)) > 0.06) continue; if (!best || p.getZ(i) > best.z) best = { x: p.getX(i), y: p.getY(i), z: p.getZ(i) }; }
    const out = []; for (let k = 0; k <= 20; k++) { C.setAero(car, k / 20); car.updateMatrixWorld(true); const v = new THREE.Vector3(best.x, best.y, best.z).applyMatrix4(pv.children[0].matrixWorld); out.push(Math.atan2(v.y - pv.position.y, v.z - pv.position.z)); }
    return { out, bb };
  };
  const unwrap = (a) => { const o = [a[0]]; for (let i = 1; i < a.length; i++) { let d = a[i] - a[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; o.push(o[i - 1] + d); } return o; };
  const sweep = (team, date, season = 2026) => { const car = C.makeCar({ teamName: team, teamColour: "888888", number: 16, season, date }); const { out } = lePath(car); const u = unwrap(out); const steps = u.slice(1).map((v, i) => v - u[i]); return { car, total: u[u.length - 1] - u[0], steps }; };
  for (const [team, sign, min] of [["Ferrari", 1, 3.0], ["Red Bull Racing", -1, 2.6], ["Mercedes", 1, 0.3]]) {
    const r = sweep(team, "2026-09-06");
    // (the leading edge's angle about the hinge, seen from the left: Ferrari's goes up and over (+), Red Bull's down (−))
    assert.ok(r.steps.every((d) => Math.sign(d) === sign || Math.abs(d) < 1e-9), `${team}: one way only ${r.steps.map((d) => d.toFixed(3))}`);
    assert.ok(Math.abs(r.total) >= min && Math.abs(r.total) < 3.3, `${team}: ${r.total.toFixed(2)} rad`);
    // the main plane and the endplates are not on a joint
    const moving = new Set(); for (const j of r.car.userData.aeroJoints) j.pv.traverse((o) => o.isMesh && moving.add(o));
    r.car.traverse((o) => { if (o.isMesh && (o.name === "wing" || o.name === "painted")) assert.ok(!moving.has(o), `${team}: ${o.name} fixed`); });
  }
  // a quaternion per joint from its axis: half way is half the angle (no Euler blend)
  const f = C.makeCar({ teamName: "Ferrari", teamColour: "888888", number: 16, season: 2026, date: "2026-09-06" }); C.setAero(f, 0.5);
  const q = f.userData.rwPivot.quaternion; assert.ok(Math.abs(2 * Math.acos(Math.abs(q.w)) - Math.PI / 2) < 1e-6);
  // 2025 DRS: the leading edge rises by ~the gap allowed (≤ 85 mm − the closed gap), the front flaps never move
  const d = C.makeCar({ teamName: "Ferrari", teamColour: "888888", number: 16, season: 2025, date: "2025-09-07" }), u = d.userData;
  const g = u.rwPivot.children[0].geometry.attributes.position; let le = null; for (let i = 0; i < g.count; i++) { if (Math.abs(g.getX(i)) < 0.05 && (!le || g.getZ(i) > le.z)) le = { x: g.getX(i), y: g.getY(i), z: g.getZ(i) }; }
  C.setAero(d, 1); d.updateMatrixWorld(true); const v = new THREE.Vector3(le.x, le.y, le.z).applyMatrix4(u.rwPivot.children[0].matrixWorld);
  const rise = Math.hypot(v.y - le.y, v.z - le.z); assert.ok(rise > 0.04 && rise < 0.085, `DRS lift ${rise.toFixed(3)} m`);
  assert.strictEqual(u.aeroJoints.length, 1, "2025: the rear flap only");
  // low grip: the front alone
  const m = C.makeCar({ teamName: "Mercedes", teamColour: "888888", number: 63, season: 2026, date: "2026-09-06" }); C.setAero(m, 0, 1);
  assert.ok(m.userData.rwPivot.quaternion.w === 1 && m.userData.fwPivot.quaternion.w < 1);
});
