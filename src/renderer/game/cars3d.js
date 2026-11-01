// The game mode's cars, crews and screens in the 3D view (DESIGN §13, request §17): every car posed from the engine's
// snapshot only (adapter3d.js frameCars – interpolated between the last two by render time), with map3d's own car
// models, wheels, wings, compounds and pit crews. Nothing of the live path is used here: no smoothed tracks, no traffic
// separation, no grid placement, no pit inference, no telemetry. K: the small kit map3d hands over in game mode (its
// world, cars, camera and a few of its drawing helpers – map3d.js `gameKit`).
import { setCompound, setAero, setWheels, setCockpit, setSmear, setFlagLights, wheelParts, TYRE_COLOURS, lockFor, STEER_RATIO } from "../car3d.js";
import { rollAngle, smearOf } from "../wheelspin.js";
import { CHANGE } from "../crew.js";
import { updateGameCrews } from "./pitcrew.js";
import { boxWays, gameLaneW } from "../pitpath.js";
import { rideStep } from "../ride.js";

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const P0 = [0, 0, 0], PA = [0, 0, 0], PB = [0, 0, 0], DIR = [0, 0];
const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// v0.53: where across the lane the engine's pit state is drawn – pitpath.js gameLaneW (the engine decides the phases, the
// box, the queue and the release; this only draws them): the fast lane, the way in to the box (to the queue place, then
// the box lane), the box lane while queued / held / worked on / released, the way out from the box after a release –
// continuous in place, heading and curvature, its length this circuit's (the distance across at the box, the room to the
// next boxes). v0.52 drew every phase but approach / penalty / work / release on the engine's path – the feed's one line,
// 1–15 m from the garages by circuit: where it lies in the working lane the cars drove along the boxes – and at release →
// laneOut put the car back on that line in one frame.
// the ways at each team's box, in the ENGINE's pit-path u (its boxes P.boxes), the distance across from the building's
// lane model at the box (per pit path and pit building)
const waysMemo = { P: null, G: null, map: new Map() };
function waysFor(K, P, team, c0) {
  const G = K.pitG?.(); if (!G || !P?.boxes) return null;
  if (waysMemo.P !== P || waysMemo.G !== G) Object.assign(waysMemo, { P, G, map: new Map() });
  if (waysMemo.map.has(team)) return waysMemo.map.get(team);
  const bu = P.boxes[team]; let w = null;
  if (bu != null) { const q = pitPoint(P, bu, c0), d = K.pitAcrossAt?.(q.x, q.z); if (d != null) w = boxWays(bu, Object.values(P.boxes).filter((x) => x != null), d); }
  waysMemo.map.set(team, w); return w;
}
// the engine's pit state at u drawn: { x, z, y, yaw, inRun, w } – the engine path's point moved across in the building's frame
function pitPose(K, P, g, u, c0, out = {}) {
  const q = pitPoint(P, u, c0), L = K.pitLane?.(q.x, q.z);
  out.x = q.x; out.z = q.z; out.yaw = q.yaw; out.inRun = 0; out.w = 0; out.L = L; out.off = null;
  if (!L) return out;
  const ways = waysFor(K, P, g.teamKey, c0), lw = gameLaneW(g.pit, u, ways, P.boxes?.[g.teamKey] ?? null);
  const want = L.fastC + (L.boxC - L.fastC) * lw.w, off = L.off + (want - L.off) * L.inRun, d = off - L.off;
  out.x = q.x - L.inward[0] * d; out.z = q.z - L.inward[1] * d; out.inRun = L.inRun; out.w = lw.w; out.off = off;
  return out;
}
const PA0 = {}, PA1 = {}, PA2 = {};
const SC_DRIVER = { TeamName: "", TeamColour: "C8C8C8", Tla: "SC", LastName: "Safety Car" };

// a point of the engine's pit path at u (m): scene x, z, the path's heading as a scene yaw, and the lap s it lies by
export function pitPoint(P, u, c0) {
  const C = P.columns, f = Math.max(0, Math.min(P.n - 1, u / P.ds)), i = Math.min(P.n - 2, Math.floor(f)), w = f - i;
  const X = C.x[i] + (C.x[i + 1] - C.x[i]) * w, Y = C.y[i] + (C.y[i + 1] - C.y[i]) * w;
  const h = C.hdg[i] + wrap(C.hdg[i + 1] - C.hdg[i]) * w;
  // (F1 frame heading atan2(dy, dx) → the scene's yaw atan2(dx, dz) with z = −y)
  return { x: X - c0.x, z: -(Y - c0.z), yaw: Math.atan2(Math.cos(h), -Math.sin(h)) };
}

export function updateGameCars(K, A, dt) {
  const fr = A.frameCars(), world = K.world(), F = world?.frame, map = A.map;
  const seen = new Set();
  if (!fr || !F || !map) { for (const c of K.cars.values()) c.obj.visible = false; return null; }
  const P = A.scenario.track.pit, focusNum = K.focus(), cam = K.camMode(), kBody = 1 - Math.exp(-dt * 12), kYaw = 1 - Math.exp(-dt * 30);
  // (the cars' flag lights from the engine's flag: red for a red flag, amber under yellow / SC / VSC – race control's, the game's)
  const fl = fr.snap.flag, flagCol = fl === "red" ? "#ff2414" : fl === "yellow" || fl === "sc" || fl === "vsc" ? "#ffb21a" : null;
  const jumped = A.lastT != null && (fr.t < A.lastT - 50 || fr.t - A.lastT > 5000); A.lastT = fr.t;
  for (const g of fr.cars) {
    const d = A.driverOf(g.num); if (!d) continue;
    // (retired into its garage – the engine's where: "garage", s null: off the track –, drawn parked at its own work space's
    // car spot, facing out, on the garage's floor (garages.js garageZones); v0.48 hid it. Only a placement: the engine
    // says the car is in the garage, not how it got there – no move is drawn. No work space: not drawn, as before.)
    const spot = g.where === "garage" ? K.pitZones?.()?.find((z) => z.kind === "car" && z.num === g.num)?.carSpot : null;
    if ((g.status === "dnf" || g.status === "fin") && g.where !== "pit" && g.s == null && !spot) continue;   // (out of the race / past the flag: not drawn)
    const c = K.carFor(g.num, d); seen.add(g.num);
    if (spot) {
      c.game = g; c.pos.set(spot.x, spot.y, spot.z); c.yaw = spot.yaw; c.pathYaw = spot.yaw; c.pitch = 0; c.roll = 0; c.speed = 0; c.acc = 0; c.onTrack = false; c.sample = null; c.worldS = null; c.pit = null; c.est = null; c.grid = null;
      c.obj.position.copy(c.pos); c.model.rotation.set(0, spot.yaw, 0, "YXZ"); c.has = true; c.obj.visible = true; c.stab = null;
      setAero(c.model, 0, 0); setFlagLights(c.model, null);
      K.paintLabel(c.label, `${d.Tla}`, "#" + (d.TeamColour || "888"), g.num === focusNum); c.label.sp.material.opacity = 0.5;
      continue;
    }
    c.game = g;
    const v = c.pos;
    let yaw, slope = 0, aLat = 0, onTrack = g.where === "lap" && g.s != null;
    if (onTrack) {
      const w = map.sd(g.s, g.d);
      F.at(w.s, w.d, P0, DIR);
      const ds = Math.max(3, Math.min(10, Math.abs(g.v) * 0.1));
      F.at(w.s - ds, w.d, PA); F.at(w.s + ds, w.d, PB);
      yaw = Math.atan2(PB[0] - PA[0], PB[2] - PA[2]);
      slope = -Math.atan2(PB[1] - PA[1], 2 * ds);
      v.set(P0[0], P0[1] + K.ROAD_LIFT - 0.01 - 0.012 * Math.min(1, (g.v / 90) ** 2), P0[2]);
      c.sample = F.sampleAt(w.s);
      c.worldS = w.s;
    } else if (g.where === "pit" && P && g.u != null) {
      const p = pitPose(K, P, g, g.u, world.center, PA0);
      let y = K.groundAt(p.x, p.z) + K.ROAD_LIFT - 0.02;
      yaw = p.yaw;
      if (p.L) {
        // on the lane's floor in the garages' run; the heading the drawn way's own (a metre either side on the same state):
        // along the lane, turned by the way across – eased to the engine path's heading over the run's ends
        y = K.pitSurfaceY ? K.pitSurfaceY(p.x, p.z, y, p.L.floor - 0.004, p.inRun) : y + (p.L.floor - y) * p.inRun;
        const a = pitPose(K, P, g, g.u - 0.5, world.center, PA1), b = pitPose(K, P, g, g.u + 0.5, world.center, PA2);
        const [ax, az] = p.L.along, [ix, iz] = p.L.inward, sl = a.off != null && b.off != null ? b.off - a.off : 0;
        const laneYaw = Math.atan2(ax - ix * sl, az - iz * sl);
        yaw = wrap(p.yaw + wrap(laneYaw - p.yaw) * p.inRun);
      }
      const x = p.x, z = p.z;
      v.set(x, y, z);
      c.sample = null; c.worldS = null;
    } else { c.obj.visible = false; continue; }
    // heading, pitch and roll (the snapshot's acceleration: nose down under braking; lean with the turning rate)
    const dy = wrap(yaw - c.yaw);
    if (!c.has || jumped || Math.abs(dy) > 1.2) c.yaw = yaw; else c.yaw += dy * kYaw;
    const yawRate = c.has && dt > 0 && !jumped ? wrap(yaw - (c.pathYaw ?? yaw)) / dt : 0;
    c.pathYaw = yaw; c.yawRate = yawRate; aLat = g.v * yawRate;
    const pitchT = slope + Math.max(-0.006, Math.min(0.02, -(g.a || 0) * 0.00032)), rollT = Math.max(-0.012, Math.min(0.012, -aLat * 0.0002));
    if (!c.has || jumped) { c.pitch = pitchT; c.roll = rollT; }
    c.pitch += (pitchT - c.pitch) * kBody; c.roll += (rollT - c.roll) * kBody;
    c.speed = Math.abs(g.v); c.acc = g.a || 0; c.onTrack = onTrack; c.slide = 0; c.onKerb = false; c.bump = 0; c.est = null; c.grid = null; c.pit = null;
    c.obj.position.copy(v); c.has = true; c.obj.visible = true;
    const ride = (cam === "onboard" || cam === "eye") && g.num === focusNum;
    if (ride) {
      // (ride.js, v0.54: the dip and the lean steadied, the height and the road's slope as they are – eased, the car sank
      // under the road on a climb and the ground showed through the cockpit floor)
      const S = (c.stab = rideStep(jumped ? null : c.stab, { y: v.y, pitch: c.pitch, roll: c.roll, slope }, dt));
      c.obj.position.y = S.y; c.model.rotation.set(S.p, c.yaw, S.r, "YXZ");
    } else { c.stab = null; c.model.rotation.set(c.pitch, c.yaw, c.roll, "YXZ"); }
    // wheels: rolled the engine's own distance over each axle's radius (wheelspin.js rollAngle) – a pause, any speed, a
    // camera change: the same angle at the same sim moment; steering: the engine's front-wheel angle (rad, + left)
    const Pf = c.model.userData.profile;
    c.spinW = c.spinW || [0, 0]; c.spinW[0] = rollAngle(g.wheelDist || 0, Pf.FR); c.spinW[1] = rollAngle(g.wheelDist || 0, Pf.RR);
    const L = lockFor(c.speed);
    c.steer = Math.max(-0.4, Math.min(0.4, g.steer || 0)); if (Math.abs(c.steer * STEER_RATIO) > L) c.steer = Math.sign(c.steer) * L / STEER_RATIO;
    setWheels(c.model, c.spinW, c.steer, fr.t, c.speed, null);
    setSmear(c.model, smearOf(c.speed / Pf.RR, A.ctx.rate, jumped));
    // wings: the game's own DRS / active aero state (game data, not telemetry)
    c.aero = g.aero?.open ?? 0; c.aeroState = { open: c.aero, front: g.aero?.front ?? 0, estimated: false, measured: false, why: "game state" };
    setAero(c.model, c.aero, g.aero?.front ?? c.aero);
    if (!c.lifted) setCompound(c.model, g.tyre?.compound || null);
    setFlagLights(c.model, flagCol);
    const inCockpit = (cam === "onboard" || cam === "eye") && g.num === focusNum;
    setCockpit(c.model, (inCockpit && cam === "eye") || (cam === "inspect" && g.num === focusNum));
    c.model.userData.helmet.visible = !(cam === "eye" && g.num === focusNum);
    c.label.sp.userData.own = inCockpit;
    K.paintLabel(c.label, `${g.pos || ""} ${d.Tla}`.trim(), "#" + (d.TeamColour || "888"), g.num === focusNum);
    c.label.sp.material.opacity = g.status === "dnf" || g.status === "fin" ? 0.5 : 1;
  }
  // the safety car: race control's object on the track (snapshot.sc – control.js drives it), drawn as a car labelled SC
  // (a placeholder model: the car model in a plain livery, amber lights while they are on)
  const sc = fr.snap.sc;
  if (sc && sc.s != null) {
    const c = K.carFor("SC", SC_DRIVER); seen.add("SC");
    c.game = { num: "SC", status: "run", where: "lap", s: sc.s, d: sc.d || 0, v: sc.v, pos: null };
    const w = map.sd(sc.s, sc.d || 0); F.at(w.s, w.d, P0, DIR); F.at(w.s - 3, w.d, PA); F.at(w.s + 3, w.d, PB);
    c.yaw = Math.atan2(PB[0] - PA[0], PB[2] - PA[2]); c.pitch = 0; c.roll = 0;
    c.pos.set(P0[0], P0[1] + K.ROAD_LIFT - 0.01, P0[2]); c.obj.position.copy(c.pos); c.model.rotation.set(0, c.yaw, 0, "YXZ");
    c.speed = sc.v; c.onTrack = true; c.sample = F.sampleAt(w.s); c.worldS = w.s; c.has = true; c.obj.visible = true;
    setFlagLights(c.model, sc.lights ? "#ffb21a" : null);
    K.paintLabel(c.label, "SC", "#ffb21a", false);
  }
  for (const [num, c] of K.cars) if (!seen.has(num)) { c.obj.visible = false; c.has = false; }
  K.scaleForView();
  updateGameCrews(K, A, fr);
  return fr;
}

// the chase / onboard bar: the focused car's GAME state (labelled – none of it is telemetry)
export function paintGameHud(hud, game, num) {
  const snap = game.snapshot(), g = snap?.cars.find((c) => c.num === num), d = game.driverOf(num);
  if (!g || !d) { hud.hidden = true; return; }
  hud.hidden = false;
  const e = (x) => String(x ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const colour = /^[0-9a-f]{6}$/i.test(d.TeamColour || "") ? d.TeamColour : "888", KO = window.KO;
  const tyre = g.tyre ? `${e(g.tyre.compound || "?")} ${g.tyre.age ?? 0}랩 · 마모 ${Math.round((g.tyre.wear || 0) * 100)}%` : "";
  const html = `<span class="bar" style="background:#${colour}"></span><b class="p">P${e(g.pos)}</b><b>${e(KO?.surname ? KO.surname(d.Tla, d.LastName) : d.Tla)}</b><span class="t">${e(d.Tla)} · ${e(KO?.TEAMS?.[d.TeamName] || d.TeamName)}</span>
    <span class="g">랩 ${e(g.lap)}/${e(snap.totalLaps ?? "?")}</span>${tyre ? `<span class="g">${tyre}</span>` : ""}${g.energy?.soc != null ? `<span class="g">배터리 ${Math.round(g.energy.soc * 100)}%</span>` : ""}${g.pit?.phase && g.pit.phase !== "none" ? `<span class="g">피트: ${e(g.pit.phase)}</span>` : ""}
    <span class="tel"><b>${Math.round((g.v || 0) * 3.6)}</b><small>km/h</small></span><span class="g">게임 데이터</span>`;
  if (hud.dataset.html !== html) { hud.innerHTML = html; hud.dataset.html = html; }
}
const pitPointYaw = (P, u) => pitPoint(P, u, { x: 0, z: 0 }).yaw;
export { CHANGE, updateGameCrews };
