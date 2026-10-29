// The game's pit camera (request §14): a fifth view next to heli / chase / onboard / eye – map3d's camMode "pit", posed
// here – and the director that cuts between its shots through a car's pit visit:
//   approach  a fixed camera ahead of the box over the fast lane, panning with the car down the lane to its box
//   wide      high and oblique from the fast lane's side: the car and its whole crew (the reference photo's framing –
//             its camera height and angle, nothing of its art)
//   close     low front-quarter / side at the working wheels (after the first moments of the work)
//   release   down the lane from the pit wall's side: the car pulled out and away
//   then back to the view the viewer had before (auto-direction), or the box's wide shot (the pit view chosen by hand)
// Which shot is wanted is a pure function of the subject car's pit state at RENDER time (shotFor: phase, the stop's times,
// distance to the box) – never of frame counts, never of the engine's future (workT1 only once reached). A cut needs the
// shot on screen for SHOT_HOLD s of wall time and the race not paused (a pause keeps the shot as it is; at high speed
// shots are skipped rather than flashed). A manual camera choice wins: picking another view during a visit ends the
// direction for that visit (no switching back); picking 피트 by hand keeps the pit view until another is picked.
// Two cars of the team in the lane: the selected car first; the subject is kept until its visit is over (no switching
// back and forth), then the other one if it is still in the lane.
// Auto-slow (optional): from 150 m before the box at more than 2× the race is slowed to 1× for the stop and put back to
// the speed it had once the release shot ends – unless the speed was changed meanwhile by anyone else (the viewer, the
// event auto-slow): then that choice stands. Never while paused (it would unpause). The race itself is never touched –
// the runner's speed is the screen's (the engine computes the same steps at any speed).
// Camera placement: each shot has several spots (box frame: a along the car, b across – + the garages' side –, h up);
// the first that holds is used: the line from it to what it looks at clear of the world's buildings / garages / pit
// building (los.js clearReach on map3d's occluders + the teams' garage layer), room round it (clearAround), not inside or
// on a car (3.2 m clear of every drawn car unless 1.6 m above it), not among the crew (0.9 m clear of every figure unless
// 2.3 m up), above the ground. None holds: straight over the box as high as the line allows, else the last good spot.
import { clearReach, clearAround } from "../los.js";
import { teamBox } from "./pitcrew.js";

export const SHOT_HOLD = 1.6;   // s of wall time a shot stays at least
export const PITCAM = { closeAfter: 0.6, wideAt: 25, releaseFor: 4000, releaseGone: 45, slowFrom: 150, slowAbove: 2, slowTo: 1, startAt: 220 };
const IN_LANE = new Set(["entry", "lane", "approach", "queue", "penalty", "work", "release", "laneOut", "exit"]);
// spots [a, b, h] (b: + the garages' side) and the look ([a, b, h] in the box's frame, or "car": the car itself)
export const SHOTS = {
  approach: { spots: [[17, -7.5, 5.5], [17, -5, 7.5], [24, -9, 9], [11, -9.5, 4.2]], look: "car", fov: 38 },
  wide: { spots: [[6.8, -8.2, 7.6], [-6.8, -8.2, 7.6], [0.5, -10.5, 9.5], [8.5, -6, 10.5]], look: [-0.2, 0, 0.45], fov: 42 },
  close: { spots: [[2.9, -4.4, 2.0], [-2.2, -4.4, 2.0], [4.2, -3.8, 2.6], [0.4, -4.8, 2.8]], look: [0.7, -0.7, 0.42], fov: 36 },
  release: { spots: [[15, -9, 3.4], [13, -7, 5], [19, -10, 6.5]], look: "car", fov: 40 },
  idle: { spots: [[6.8, -8.2, 7.6], [-6.8, -8.2, 7.6], [0.5, -10.5, 9.5]], look: [-0.2, 0, 0.45], fov: 42 },
};
export const SHOT_KO = { approach: "피트 진입", wide: "정비 전경", close: "정비 근접", release: "출발", idle: "피트 박스" };

// The shot wanted for car g (a frameCars row: u, pit) at render time T (ms), its box at boxU (m on the pit path): a shot
// name, "end" (the visit is over for the camera) or null (not in the lane).
export function shotFor(g, T, boxU) {
  const p = g?.pit; if (!p || !IN_LANE.has(p.phase)) return null;
  const tm = p.times || {}, ph = p.phase;
  const stood = tm.stop != null && T >= tm.stop, rel = tm.release != null && T >= tm.release;
  if (rel || ph === "laneOut" || ph === "exit") {
    const t0 = tm.release ?? T;
    return (g.u != null && boxU != null && g.u - boxU > PITCAM.releaseGone) || T - t0 > PITCAM.releaseFor ? "end" : "release";
  }
  if (stood) {
    if (p.noWork || ph === "penalty" || p.workT0 == null || T < p.workT0) return "wide";
    if (p.workT1 != null && T >= p.workT1) return p.held ? "wide" : "release";   // (held for a car in the fast lane: the wide shot shows it coming)
    return T - p.workT0 >= PITCAM.closeAfter * 1000 ? "close" : "wide";
  }
  if (ph === "queue") return "wide";
  const d = g.u != null && boxU != null ? boxU - g.u : Infinity;
  return d <= PITCAM.wideAt ? "wide" : "approach";
}

// The subject: the car the camera follows through the lane – kept while its visit lasts; else the first of `order` (the
// selected car first, then the team's other cars) that is in the lane within PITCAM.startAt m of its box or past it.
export function pickSubject(cur, rows, order, boxOf, T) {
  if (cur) { const g = rows.find((r) => r.num === cur); const s = g && shotFor(g, T, boxOf(g)); if (s && s !== "end") return cur; }
  for (const num of order) {
    if (num === cur) continue;
    const g = rows.find((r) => r.num === num); if (!g) continue;
    const s = shotFor(g, T, boxOf(g)); if (!s || s === "end") continue;
    const b = boxOf(g); if (g.pit.phase === "entry" || g.pit.phase === "lane") { if (g.u == null || b == null || b - g.u > PITCAM.startAt) continue; }
    return num;
  }
  return null;
}

const v3 = (K) => new K.THREE.Vector3();
// The director and the pit view's camera. K: map3d's game kit; A: the adapter.
export function createPitCam(K) {
  const S = { auto: true, slow: false, cars: null, subject: null, shot: null, shotWall: -1e9, took: false, prev: null, manual: false, pinned: false, done: new Set(),
    spot: null, spotWall: -1e9, look: null, lookVel: null, note: "", slowSet: null, stats: { cuts: 0, evalMs: 0, evals: 0, fallbacks: 0, lastCut: null, cutsLog: [] } };
  let occ = null, occFor = null;
  const occluders = () => {
    const w = K.world(), g = K.pitTeamsGroup?.();
    if (occFor && occFor.w === w && occFor.g === g) return occ;
    occ = (w?.occluders || []).slice(); g?.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) occ.push(o); });
    occFor = { w, g }; return occ;
  };
  const boxOfRow = (A, g) => A.scenario.track.pit?.boxes?.[g.teamKey];
  const toWorld = (B, [a, b, h], out) => { const c = Math.cos(B.yaw), s = Math.sin(B.yaw), bb = b * B.left; return out.set(B.x + s * a + c * bb, B.y + h, B.z + c * a - s * bb); };

  // ---------- the director (each frame, before the camera is placed) ----------
  function direct(A, fr, now) {
    const T = fr.t, paused = !(A.ctx.rate > 0), mode = K.camMode(), focus = K.focus();
    if (!S.auto && mode !== "pit") { endSlow(A); S.subject = null; S.took = false; return; }
    const order = [focus, ...(S.cars || [])].filter((x, i, a) => x && a.indexOf(x) === i);
    const sub = pickSubject(S.subject, fr.cars, order, (g) => boxOfRow(A, g), T);
    if (sub !== S.subject) {
      // (a visit over, or the first one: the next subject starts fresh – the shot is cut only after the hold)
      if (S.subject && !sub) finish(A);
      S.subject = sub; if (sub) { S.manual = false; }
    }
    const g = sub ? fr.cars.find((r) => r.num === sub) : null;
    let want = g ? shotFor(g, T, boxOfRow(A, g)) : null;
    if (want === "end") { finish(A); want = null; }
    // auto-direction: a visit takes the camera over (once), unless the viewer chose another view during it
    if (want && S.auto && !S.manual && mode !== "pit" && !S.took && !paused) { S.prev = mode; S.took = true; K.setCamByDirector("pit"); S.shot = null; }
    if (K.camMode() !== "pit") return;
    if (!want) want = "idle";
    // auto-slow for the stop (screen speed only)
    if (S.slow && g && want !== "idle") maybeSlow(A, g, T);
    if (want !== S.shot && (S.shot == null || (!paused && (now - S.shotWall) / 1000 >= SHOT_HOLD))) cut(want, now, T, sub);
  }
  function cut(shot, now, T, sub) {
    S.shot = shot; S.shotWall = now; S.spot = null; S.look = null; S.stats.cuts++; S.stats.lastCut = { shot, t: Math.round(T), car: sub };
    S.stats.cutsLog.push([Math.round(T), shot, sub, Math.round(now)]); if (S.stats.cutsLog.length > 40) S.stats.cutsLog.shift();
  }
  function finish(A) {
    if (S.took && !S.manual && !S.pinned && K.camMode() === "pit") K.setCamByDirector(S.prev || "chase");
    S.took = false; S.subject = null; S.shot = null; endSlow(A, true);
  }
  // the viewer picked a view (map3d's buttons / keys): it wins
  function userCam(mode) {
    if (mode === "pit") { S.pinned = true; S.manual = false; S.shot = null; return; }
    S.pinned = false; if (S.subject) S.manual = true; S.took = false;
  }
  function maybeSlow(A, g, T) {
    const R = A.source; if (!R || R.paused) return;
    const b = boxOfRow(A, g), d = g.u != null && b != null ? b - g.u : 0;
    if (!S.slowSet && R.speed > PITCAM.slowAbove && (d <= PITCAM.slowFrom || g.pit.phase !== "entry" && g.pit.phase !== "lane")) {
      S.slowSet = { prev: R.speed, to: PITCAM.slowTo, car: g.num, t: T }; R.setSpeed(PITCAM.slowTo); R.slowNote = { t: T, type: "pitcam", why: `피트 연출 감속 #${g.num}` };
    }
  }
  function endSlow(A, restore = false) {
    const R = A.source, s = S.slowSet; if (!s || !R) return;
    if (R.speed !== s.to) { S.slowSet = null; return; }   // (changed by someone else meanwhile: theirs stands)
    if (!restore) return;
    if (R.paused) { S.slowPending = s; S.slowSet = null; return; }
    R.setSpeed(s.prev); R.slowNote = null; S.slowSet = null;
  }

  // ---------- the camera (map3d's updateCamera in camMode "pit") ----------
  // returns { pos, look, fov, note } or null (nothing to show: map3d keeps the camera where it is)
  function pose(A, fr, now, camera) {
    if (S.slowPending && A.source && !A.source.paused) { const s = S.slowPending; S.slowPending = null; if (A.source.speed === s.to) { A.source.setSpeed(s.prev); A.source.slowNote = null; } }
    const teams = K.pitTeams(); if (!teams || !K.pitG() || !fr) return null;
    const num = S.subject || K.focus(), g = fr.cars.find((r) => r.num === num) || null;
    const team = g?.team ?? A.driverOf(num)?.TeamName, tm = teams.find((q) => q.team === team); if (!tm || tm.box == null) return null;
    const boxU = g ? boxOfRow(A, g) : A.scenario.track.pit?.boxes?.[A.scenario.entries?.find((e) => String(e.num) === String(num))?.teamKey];
    const ci = K.crewInfo?.[team], B0 = teamBox(K, A, tm, boxU), B = ci?.where && ci.num === num ? { ...B0, x: ci.where.x, z: ci.where.z, yaw: ci.where.yaw } : B0;
    const shot = SHOTS[S.shot || "idle"], car = K.cars.get(num);
    // what it looks at: a point of the box's frame, or the car (its middle, a little up)
    const target = shot.look === "car" && car?.obj.visible ? v3(K).copy(car.pos).setY(car.pos.y + 0.5) : toWorld(B, shot.look === "car" ? [0, 0, 0.45] : shot.look, v3(K));
    // the spot: re-checked on a cut and every 0.3 s (cars and crew move), kept while it holds
    if (!S.spot || now - S.spotWall > 300) {
      const t0 = performance.now();
      const sp = place(B, shot, target, team, num, camera);
      S.stats.evalMs += performance.now() - t0; S.stats.evals++;
      if (sp) { if (!S.spot || !S.spot.pos.equals(sp.pos)) S.spot = sp; } else if (!S.spot) { S.spot = { pos: camera.position.clone(), i: -1 }; S.stats.fallbacks++; }
      S.spotWall = now;
    }
    // the look follows its target critically damped (a pan, not a jump) – none while paused (dt 0)
    if (!S.look) S.look = target.clone(); else { const k = 1 - Math.exp(-Math.max(0, fr.dtWall || 0.016) * 6); S.look.lerp(target, k); }
    const label = `피트 카메라 · ${SHOT_KO[S.shot || "idle"]}${num ? ` · ${A.driverOf(num)?.Tla || num}` : ""}${S.took ? " · 자동 연출" : ""}${S.spot?.i > 0 ? " · 가림 회피 각도" : ""}`;
    return { pos: S.spot.pos, look: S.look, fov: shot.fov, note: label };
  }
  // the first spot of the shot that holds (see the header); null if none
  function place(B, shot, target, team, num, camera) {
    const occ = occluders(), ground = (x, z) => K.groundAt(x, z), info = K.crewInfo || {};
    const figs = []; for (const t of Object.values(info)) for (const f of t.figs || []) figs.push(f);
    const room = 0.35, tries = shot.spots.concat([[0, 0, 14], [0, -3, 11]]);
    for (let i = 0; i < tries.length; i++) {
      const p = toWorld(B, tries[i], v3(K));
      if (p.y - ground(p.x, p.z) < 1.2) continue;
      let bad = false;
      for (const c of K.cars.values()) { if (!c.obj.visible) continue; const dh = Math.hypot(p.x - c.pos.x, p.z - c.pos.z); if (dh < 3.2 && p.y - c.pos.y < 1.6) { bad = true; break; } }
      if (bad) continue;
      for (const [x, z] of figs) if (Math.hypot(p.x - x, p.z - z) < 0.9 && p.y - B.y < 2.3) { bad = true; break; }
      if (bad) continue;
      const len = p.distanceTo(target); if (clearReach(occ, target, p, 0.3, 0.2) < len - 0.25) continue;
      if (!clearAround(occ, p, room)) continue;
      return { pos: p, i };
    }
    return null;
  }
  return { S, direct, pose, userCam, finish, state: () => ({ auto: S.auto, slow: S.slow, subject: S.subject, shot: S.shot, took: S.took, prev: S.prev, manual: S.manual, pinned: S.pinned, spot: S.spot ? { i: S.spot.i, pos: S.spot.pos.toArray().map((v) => +v.toFixed(2)) } : null, slowSet: S.slowSet, stats: { ...S.stats, evalMs: +S.stats.evalMs.toFixed(2), msPerEval: S.stats.evals ? +(S.stats.evalMs / S.stats.evals).toFixed(3) : null } }) };
}
