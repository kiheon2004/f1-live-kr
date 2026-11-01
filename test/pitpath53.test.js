// v0.53 §8: the pit lane's ways across (pitpath.js) – into the box, standing, back out into the fast lane – continuous in
// place, heading and curvature, their length this circuit's; the replay's per-visit plan (pitstate.js visitState) and the
// game's contract on the engine's own phases (gameLaneW), a double stack driven by the real engine.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const SC = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/game/2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race.scenario.json"), "utf8"));
const PP = () => import("../src/renderer/pitpath.js"), PS = () => import("../src/renderer/pitstate.js");

test("quintic way: place, slope and curvature continuous, flat at both ends; its steepest slope and curvature as stated", async () => {
  const { q5, dq5, ddq5, Q5_SLOPE, Q5_CURV } = await PP();
  assert.strictEqual(q5(0), 0); assert.strictEqual(q5(1), 1); assert.strictEqual(dq5(0), 0); assert.strictEqual(dq5(1), 0);
  assert.ok(Math.abs(ddq5(1e-9)) < 1e-6 && Math.abs(ddq5(1 - 1e-9)) < 1e-6, "curvature 0 at the ends: no kink entering or leaving the way");
  let mS = 0, mC = 0;
  for (let t = 0; t <= 1; t += 1e-4) { mS = Math.max(mS, dq5(t)); mC = Math.max(mC, Math.abs(ddq5(t))); }
  assert.ok(Math.abs(mS - Q5_SLOPE) < 1e-3 && Math.abs(mC - Q5_CURV) < 1e-2, `${mS} ${mC}`);
});

test("the ways' length is the circuit's: the distance across and the room to the neighbouring boxes – not one fixed length", async () => {
  const { boxWays, PATH, Q5_SLOPE } = await PP();
  // a wide lane, boxes 25 m apart (Hungaroring-like) against a narrow one with boxes 17 m apart (Monaco-like)
  const wide = boxWays(400, [375, 400, 425], 6.5), tight = boxWays(400, [383, 400, 417], 3.2), far = boxWays(400, [340, 400, 470], 9);
  assert.notStrictEqual(wide.inLen, tight.inLen); assert.notStrictEqual(wide.outLen, far.outLen);
  for (const w of [wide, tight, far]) {
    // never starts across before the previous team's box, always back in the fast lane by the next one's
    assert.ok(w.inFrom >= 400 - w.roomIn - 1e-9, `in from ${w.inFrom} room ${w.roomIn}`);
    assert.ok(w.outTo <= 400 + w.roomOut - PATH.margin + 1e-9, `out to ${w.outTo} room ${w.roomOut}`);
    assert.ok(w.inLen >= PATH.min && w.outLen >= PATH.min);
  }
  // with room, the steepest heading is the stated one (30° in, 28° out)
  assert.ok(Math.abs(Math.atan((Q5_SLOPE * 9) / far.inLen) - (30 * Math.PI) / 180) < 1e-9 || far.inLen === PATH.max);
  // the first box of the run (no neighbour behind it): the default room
  assert.strictEqual(boxWays(400, [400, 425], 6).roomIn, PATH.roomDefault);
});

// a car's drawn offset (m out from the garages) along a replay visit: positions every 0.25 s, the feed's line at 8 m out
// (where the data has every car), boxes 25 m apart; the lane: fast lane centre 10.5 m, box 4.5 m
function replayVisit({ boxAt = 400, standAt = 401, queueAt = null, standS = 2.4, waitS = 3, v = 22, live = false, teammateInBox = () => false } = {}) {
  const T = [], X = [], add = (t, u) => { T.push(Math.round(t * 1000)); X.push(u); };
  let t = 0, u = 250;
  const drive = (to, vv) => { while (u < to - 1e-9) { const d = Math.min(vv * 0.25, to - u); u += d; t += 0.25; add(t, u); } };
  const stand = (s) => { for (let k = 0; k < s / 0.25; k++) { t += 0.25; add(t, u); } };
  add(0, u);
  // (braking from the limit into the stop: the speed down to walking pace over the last 25 m)
  const brakeTo = (to) => { while (u < to - 1e-9) { const vv = Math.max(1.5, Math.min(v, Math.sqrt(2 * 8 * (to - u)))); const d = Math.min(vv * 0.25, to - u); u += d; t += 0.25; add(t, u); } };
  if (queueAt != null) { brakeTo(queueAt); stand(waitS); drive(standAt, 2); }
  else brakeTo(standAt);
  stand(standS);
  // launch out
  let vv = 0; while (u < 560) { vv = Math.min(v, vv + 8 * 0.25); u += vv * 0.25; t += 0.25; add(t, u); }
  return { trk: { t: T, x: X.map((q) => q * 10), y: X.map(() => 0), n: T.length }, end: t };
}

async function drawnOffsets(V, o = {}) {
  const { pitState, visitStands, visitPlan, laneOffsetOf, posSpeed, standingForPos } = await PS(), { boxWays } = await PP();
  const boxes = [375, 400, 425], ways = boxWays(400, boxes, 6), cs = { ok: true, fastC: 10.5, boxC: 4.5 }, uOf = (i) => V.trk.x[i] / 10;
  const out = [];
  for (let ms = 0; ms <= V.end * 1000; ms += 1000 / 30) {
    const u = (() => { const T = V.trk.t; let i = 0; while (i + 1 < T.length && T[i + 1] <= ms) i++; if (i + 1 >= T.length) return V.trk.x[i] / 10; const f = (ms - T[i]) / (T[i + 1] - T[i]); return (V.trk.x[i] + (V.trk.x[i + 1] - V.trk.x[i]) * f) / 10; })();
    const stands = visitStands(V.trk, 0, o.live ? ms : Infinity, uOf), plan = visitPlan(stands, 400, 10);
    const s = pitState({ u, gStart: 300, gEnd: 600, inPit: true, onLane: true, speed: posSpeed(V.trk, ms), stillFor: standingForPos(V.trk, ms), boxU: 400, boxFrom: "order", race: true, teammateInBox: o.teammateInBox ? o.teammateInBox(ms) : false, boxTol: 10, t: ms, visit: { ways, first: plan.first, box: plan.box, live: !!o.live, vMin: null } });
    out.push({ ms, u, state: s.state, off: laneOffsetOf(s, cs, 8, u, 300, 600), w: s.w });
  }
  return { out, ways };
}
const steps = (out) => { let lat = 0, slide = 0; for (let i = 1; i < out.length; i++) { const dl = Math.abs(out[i].off - out[i - 1].off), du = Math.abs(out[i].u - out[i - 1].u); lat = Math.max(lat, dl); slide = Math.max(slide, dl - 1.5 * du - 1e-9); } return { lat, slide }; };

test("replay: into its box, the stop, back out – no sideways jump or slide, back in the fast lane by the next team's box, the record's times untouched", async () => {
  const V = replayVisit(), { out, ways } = await drawnOffsets(V);
  const st = steps(out);
  assert.ok(st.slide <= 0, `never across faster than 1.5 × along: ${st.slide}`);
  assert.ok(st.lat < 0.6, `largest step across per frame ${st.lat}`);
  const box = out.filter((q) => q.state === "in box");
  assert.ok(box.length > 30 && box.every((q) => Math.abs(q.off - 4.5) < 1e-9), "in its box: at the box's offset");
  // after the stop: in the inner lane (centre on the garages' side of 7.5 m) only over the way out, never on along the boxes
  const after = out.filter((q) => q.ms > box[box.length - 1].ms && q.off < 7.5);
  const back = 425 - 1.5;   // (the next team's box less the margin: the way out from where it really stood, 1 m past its box)
  assert.ok(after.length && Math.max(...after.map((q) => q.u)) <= back + 1e-6, `inner lane after the stop to ${Math.max(...after.map((q) => q.u))}, next box 425`);
  assert.ok(out.filter((q) => q.u > back + 0.01).every((q) => Math.abs(q.off - 10.5) < 1e-9), "then the fast lane");
  // the way in began no earlier than abreast of the previous team's box
  const first = out.find((q) => q.u >= 300 && q.off < 10.5 - 1e-6);
  assert.ok(first.u >= 375, `went across from ${first.u}`);
});

test("replay: a double stack – waits behind its teammate in the inner lane, creeps up, stops, leaves: one continuous way", async () => {
  const V = replayVisit({ queueAt: 388, waitS: 3, standAt: 400.5 }), { out } = await drawnOffsets(V, { teammateInBox: (ms) => ms < 9000 });
  const st = steps(out);
  assert.ok(st.slide <= 0 && st.lat < 0.6, JSON.stringify(st));
  const wait = out.filter((q) => q.state === "waiting (double stack)");
  assert.ok(wait.length > 20 && wait.every((q) => Math.abs(q.off - 4.5) < 1e-9), "waiting in the box lane behind the box");
  assert.ok(out.some((q) => q.state === "in box"));
});

test("replay: per visit – a car's second visit doesn't take the first visit's stop; a drive-through never goes across", async () => {
  const { visitStands, visitPlan } = await PS();
  const V = replayVisit(), uOf = (i) => V.trk.x[i] / 10;
  // the visit window is the caller's: a later window (the next visit) holds none of this one's stands
  assert.strictEqual(visitPlan(visitStands(V.trk, V.end * 1000 + 1, Infinity, uOf), 400, 10).box, null);
  assert.ok(visitPlan(visitStands(V.trk, 0, Infinity, uOf), 400, 10).box);
  // a stand away from its box isn't its box (the fast lane – a queue)
  assert.strictEqual(visitPlan(visitStands(V.trk, 0, Infinity, uOf), 470, 10).box, null);
  // passing at the limit with no stop: the fast lane throughout
  const T = [], X = []; for (let k = 0; k <= 60; k++) { T.push(k * 250); X.push((250 + k * 22 * 0.25) * 10); }
  const D = { trk: { t: T, x: X, y: X.map(() => 0), n: T.length }, end: 15 }, { out } = await drawnOffsets(D);
  assert.ok(out.every((q) => q.off === 8 || Math.abs(q.off - 10.5) < 1e-9 || q.u < 340), "fast lane (or the feed's line past the run's start)");
});

test("live: the way in only once it slows near its box (nothing known ahead), then the same way out", async () => {
  const V = replayVisit(), { out } = await drawnOffsets(V, { live: true });
  const st = steps(out);
  assert.ok(st.slide <= 0.5, `live: the way in starts where it is seen slowing – ${st.slide}`);
  assert.ok(out.some((q) => q.state === "in box") && out.some((q) => q.state === "leaving box"));
});

// ---------- the game ----------
test("game: release → laneOut is continuous; a pit-lane starter's laneOut stays in the fast lane", async () => {
  const { boxWays, gameLaneW } = await PP();
  const ways = boxWays(363.5, Object.values(SC.track.pit.boxes), 6.4);
  const rel = gameLaneW({ phase: "release", times: { release: null } }, 363.5, ways, 363.5).w;
  const out = gameLaneW({ phase: "laneOut", times: { release: 1000 } }, 363.6, ways, 363.5).w;
  assert.strictEqual(rel, 1); assert.ok(out > 0.999, `${out}`);
  assert.strictEqual(gameLaneW({ phase: "laneOut", times: { release: null } }, 560, ways, 363.5).w, 0, "no release this visit: the fast lane");
  assert.strictEqual(gameLaneW({ phase: "lane", times: {} }, 360, ways, 363.5).w, 0);
});

test("game engine: a double stack (both McLarens called together) drawn by the contract – continuous, queue in the box lane, out by the next box", async () => {
  const E = await import("../src/game/engine/engine.js"), { boxWays, gameLaneW } = await PP();
  const race = E.createRace({ scenario: SC, seed: 11 }), P = SC.track.pit, dLat = 6.4;
  const ways = boxWays(P.boxes.McLaren, Object.values(P.boxes), dLat);
  let called = false; const tr = { "4": [], "81": [] };
  for (let i = 0; i < 20 * 60 * 30 && !(tr["4"].done && tr["81"].done); i++) {
    E.step(race);
    if (!called && race.state.t > 120000) { for (const n of ["4", "81"]) E.command(race, { id: "p" + n, type: "pit", car: n, args: { compound: "HARD" }, by: "player" }); called = true; }
    // (the snapshot's fields – where, pit.u, pit.phase, pit.times.release: engine.js snapPit – read off the state for speed)
    for (const n of ["4", "81"]) {
      const g = race.state.cars.find((c) => c.num === n), L = tr[n];
      if (g.where === "pit") { const lw = gameLaneW({ phase: g.pit.phase, times: { release: g.pit.times?.release ?? null } }, g.pit.u, ways, P.boxes.McLaren); L.push({ t: race.state.t, u: g.pit.u, ph: g.pit.phase, w: lw.w, v: g.v }); }
      else if (L.length && g.where === "lap") L.done = true;
    }
  }
  assert.ok(tr["4"].done && tr["81"].done, "both went through");
  const phases = new Set([...tr["4"], ...tr["81"]].map((q) => q.ph));
  assert.ok(phases.has("queue"), `one of them queued behind the other: ${[...phases]}`);
  for (const n of ["4", "81"]) {
    const L = tr[n]; let worst = 0, slide = 0;
    for (let i = 1; i < L.length; i++) { const dl = Math.abs(L[i].w - L[i - 1].w) * dLat, du = Math.abs(L[i].u - L[i - 1].u); worst = Math.max(worst, dl); slide = Math.max(slide, dl - 1.5 * du - 1e-9); }
    assert.ok(slide <= 0, `car ${n}: never across faster than 1.5 × along (${slide})`);
    assert.ok(worst < 0.6, `car ${n}: step across ${worst} m per 50 ms step`);
    // from its stop (queue or box) to the release: in the box lane
    const held = L.filter((q) => ["queue", "work", "release", "penalty"].includes(q.ph));
    assert.ok(held.length && held.every((q) => q.w === 1), `car ${n} held in the box lane`);
    // after the release: back in the fast lane by the next team's box
    const out = L.filter((q) => q.ph === "laneOut" && q.w > 0);
    assert.ok(out.length && Math.max(...out.map((q) => q.u)) <= ways.outTo + 1e-6, `car ${n} out by ${ways.outTo}`);
  }
});

test("the check itself (pitcheck.js): a sideways jump, a 180° flip and two cars on top of each other are caught; a clean way is not", async () => {
  const { createPitTrace } = await import("../src/renderer/pitcheck.js"), { q5 } = await PP();
  const geo = { project: (x, z) => ({ u: x, off: z }), inner: () => 7.5, boxes: [400], run: [300, 600] };
  const run = (offAt, yawAt = () => Math.PI / 2) => { const T = createPitTrace(geo); for (let i = 0; i <= 600; i++) { const u = 330 + i * 0.4; T.frame(i / 30, 1 / 30, [{ num: "1", x: u, z: offAt(u, i), yaw: yawAt(u, i), speed: 12, state: "x", boxU: 400 }]); } return T.report(); };
  const clean = run((u) => 10.5 - 6 * q5((u - 380) / 18), (u) => Math.PI / 2 - Math.atan(-6 * 30 * ((u - 380) / 18) ** 2 * (1 - (u - 380) / 18) ** 2 / 18 * ((u >= 380 && u <= 398) ? 1 : 0)));
  assert.ok(clean.worst.slideMs <= 0 && clean.worst.latStepM < 0.6 && clean.worst.yawStepDeg < 8, JSON.stringify(clean.worst));
  const jump = run((u) => (u < 400 ? 10.5 : 4.5));
  assert.ok(jump.worst.latStepM >= 6 && jump.worst.slideMs > 100, JSON.stringify(jump.worst));
  const flip = run(() => 10.5, (u, i) => (i === 300 ? -Math.PI / 2 : Math.PI / 2));
  assert.ok(flip.worst.yawStepDeg > 179, JSON.stringify(flip.worst));
  const T = createPitTrace(geo); T.frame(0, 1 / 30, [{ num: "1", x: 400, z: 10.5, yaw: 0, speed: 10, state: "a" }, { num: "2", x: 403, z: 10, yaw: 0, speed: 10, state: "b" }]);
  assert.strictEqual(T.report().overlap.frames, 1);
});

test("the lane's directions turn smoothly from one garage's to the next (a curved pit building: no heading step at a garage's edge)", async () => {
  const { laneSectionAt } = await import("../src/renderer/pitlane.js");
  const a = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  const mk = (uc, deg) => ({ s: { uc, along: a(deg), inward: a(deg + 90) }, cs: { ok: true, fastC: 10, boxC: 4, inner: 7, wall: 12 }, floor: 1 });
  const st = [mk(0, 0), mk(10, 4), mk(20, 8)], us = [0, 10, 20];
  let prev = null, worst = 0;
  for (let u = 0; u <= 20; u += 0.05) { const s = laneSectionAt(st, us, u), ang = (Math.atan2(s.along[1], s.along[0]) * 180) / Math.PI; if (prev != null) worst = Math.max(worst, Math.abs(ang - prev)); prev = ang; }
  assert.ok(worst < 0.05, `largest step in direction ${worst}°`);
  const m = laneSectionAt(st, us, 5);
  assert.ok(Math.abs(Math.hypot(...m.along) - 1) < 1e-12 && Math.abs((Math.atan2(m.along[1], m.along[0]) * 180) / Math.PI - 2) < 0.01);
});

test("an entry road coming in at an angle: the drawn line eases from the feed's line to the fast lane – no step where the feed's line is 40 m out", async () => {
  const { laneOffsetOf } = await PS();
  const cs = { ok: true, fastC: 10.5, boxC: 4.5, wall: 12.5 };
  // the feed's line coming in steeply: 40 m out 5 m before the run, 9 m out 15 m into it, into the garages' run at u = 0 (ends 40 m)
  let prev = null, worst = 0;
  for (let u = -120; u <= 20; u += 0.25) {
    const feed = Math.max(9, 9 + ((15 - u) / 20) * 31), off = laneOffsetOf({ lane: "fast", w: 0 }, cs, feed, u, 0, 300);
    // (a car more than 40 m out isn't in front of the garages at all: the caller draws the feed's line)
    const drawn = feed >= 40 ? feed : off;
    if (prev != null) worst = Math.max(worst, Math.abs(drawn - prev)); prev = drawn;
  }
  // (the feed's own line moves 0.39 m across per 0.25 m here – a 57° entry; v0.52's blend by u alone: a 29 m step)
  assert.ok(worst < 1, `largest step ${worst} m per 0.25 m along`);
});
