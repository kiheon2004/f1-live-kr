// The game's pit crews (request §15): crew.js's people and kit, driven ONLY by the engine's pit state at render time –
// the phase, the stop's times (snapshot pit.times: stop, work, release …), the penalty hold's end (holdT1), the work's
// end (workT1), a stop-and-go (noWork), a release held for a car in the fast lane (held) and a slow wheel (err.wheel).
// The engine decides; nothing here decides anything about the race or reads anything but the snapshot.
//
// Per team, at render time T, one of (crewPlan – a pure function, tested):
//   out      a car of the team coming down the lane to the box (160 → 60 m): the crew walks out with the new set, the
//            guns and the jacks; a car queued behind its teammate gets nobody of its own (the crew stays at the box)
//   penalty  the car in its box serving a time penalty: everyone at his place, crouched ready, nobody touching the car
//            (the hands come onto the car only once the hold has run: wait = the hold + CREW.lead)
//   sg       a stop-and-go: no work at all – the crew stands back by the garage until the car has gone
//   work     workT0 ≤ T < workT1: the tyre change (crew.js stopChoreo), fitted to the engine's stationary time; a slow
//            wheel only when the engine names it (err.wheel) – that wheel's nut won't do up
//   done     T ≥ workT1, the car released: the jacks down, the crew stepping back as the car goes
//   held     T ≥ workT1, the car held for a car coming down the fast lane: everyone clear and still, the release man's
//            arm out across the car's way – a different picture from "done"
//   back     the car gone (released): back to the garage with the old wheels (8 s); a teammate queued or coming in the
//            same visit: the crew stays out ready for it instead
// The new wheels are the crew's until the engine's work ends: once fitted they stay drawn as the crew's kit on the hubs
// (the car's own wheels hidden there) and become the car's – its compound from the engine's tyre state – when the engine
// changes the tyres (T ≥ workT1), so no wheel changes colour or jumps when the engine's tyres change.
import { crewMeshes, crewAt, crewLayout, stopChoreo, stopClock, changeWalk, kitAt, stopSeed, hubsOf, blendPose, POSES } from "../crew.js";
import { wheelParts, TYRE_COLOURS } from "../car3d.js";

export const CREW = { outFrom: 160, outTo: 60, backS: 8, lead: 0.12, heldAt: 0.6 };
const BOX = new Set(["penalty", "work", "release"]), LANE = new Set(["entry", "lane", "approach"]), GONE = new Set(["laneOut", "exit"]);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// the release man's "hold": his near arm straight out across the car's way, palm towards it (held release)
const HALT = { ...POSES.stand, arm: [[1.5, 0.45, 0.02], [0.15, 0.1, 0.25]] };

// What a team's crew does at render time T (ms). cars: the team's cars as drawn (frameCars rows: num, u, v, tyre, pen,
// pit); boxU: the team's box on the engine's pit path (m); mem: this team's memory across frames (the last stop: its car,
// times and plan – the crew finishes its moves and walks back after the car has gone; forgotten on a seek back).
// Returns null (nobody out) or { mode, num, s (s since the car stood – stopChoreo's clock), plan (stopChoreo's), f (walk:
// 0 at the garage → 1 in place) }.
export function crewPlan(cars, T, boxU, mem = {}) {
  if (mem.last && T < mem.last.st) mem.last = null;
  const inBox = (c) => { const p = c.pit, st = p?.times?.stop; if (st == null || T < st) return false; return BOX.has(p.phase) || (p.times.release != null && T < p.times.release); };
  const box = cars.find(inBox);
  if (box) {
    const p = box.pit, tm = p.times, st = tm.stop, s = (T - st) / 1000;
    if (p.noWork) { mem.last = { num: box.num, st, plan: null, rel: tm.release ?? null, settle: tm.release ?? Infinity }; return { mode: "sg", num: box.num, s, plan: null, f: 0 }; }
    const plan = stopPlan(box);
    mem.last = { num: box.num, st, plan, rel: tm.release ?? null, settle: settleT(plan, st) };
    if (p.workT0 == null || T < p.workT0) return { mode: "penalty", num: box.num, s: Math.min(s, plan.wait - 0.01), plan, f: 1 };
    if (p.workT1 != null && T < p.workT1) return { mode: "work", num: box.num, s, plan, f: 1 };
    if (p.held && !(tm.release != null && T >= tm.release)) return { mode: "held", num: box.num, s: Math.min(s, (plan.D ?? s) + CREW.heldAt), plan, f: 1, since: (T - p.workT1) / 1000 };
    return { mode: "done", num: box.num, s, plan, f: 1, since: tm.release != null ? (T - tm.release) / 1000 : 0 };
  }
  // the car gone from its box: the crew's last moves (the jacks clear, the gunners up) played out, then the walk back
  const gone = cars.find((c) => GONE.has(c.pit?.phase) && c.pit.times?.release != null && T >= c.pit.times.release);
  if (gone && mem.last?.num === gone.num) mem.last.rel = gone.pit.times.release;
  const L = mem.last && mem.last.rel != null ? mem.last : null;
  if (L && L.plan && T < L.settle) return { mode: "done", num: L.num, s: (T - L.st) / 1000, plan: L.plan, f: 1, since: (T - L.rel) / 1000 };
  const backFrom = L ? Math.max(L.rel, L.plan ? L.settle : L.rel) : null, backing = L && T - backFrom < CREW.backS * 1000 ? L : null;
  // a car of the team queued behind the box, or coming in on this visit while the crew is out: they stay out for it;
  // queued, it gets nobody of its own – the crew waits at the box
  const queued = cars.find((c) => c.pit?.phase === "queue");
  const coming = cars.filter((c) => LANE.has(c.pit?.phase) && c.u != null && boxU != null && boxU - c.u > -2).sort((a, b) => b.u - a.u)[0] || null;
  if (queued) return { mode: "out", num: queued.num, s: null, plan: null, f: 1, queued: true };
  if (backing && !coming) return { mode: "back", num: backing.num, s: null, plan: null, f: 1 - ss(0, CREW.backS, (T - backFrom) / 1000) };
  if (!coming) return null;
  const d = boxU - coming.u, f = backing ? 1 : ss(CREW.outFrom, CREW.outTo, d);
  if (d >= CREW.outFrom && !backing) return null;
  // the last seconds before it stands (approaching its own box, no penalty to serve first): the gunners, the jacks and the
  // stabilisers move in as it comes to rest – stopChoreo's clock run from the time it will take to stop (constant
  // braking: 2·d / v), so there's no jump when the car stands and the work's clock takes over at 0
  if (f >= 1 && coming.pit.phase === "approach" && !(coming.pen?.open?.length > 0)) {
    const pre = -2 * Math.max(0, d) / Math.max(0.3, coming.v || 0);
    if (pre > -1) return { mode: "out", num: coming.num, s: pre, plan: { kind: "tyres", from: "game", D: null, wait: 0, compound: coming.pit.compound || null, seed: seedOf(coming) }, f: 1 };
  }
  return { mode: "out", num: coming.num, s: null, plan: null, f };
}
// a stop's plan for stopChoreo: its stationary time (D: stop → the engine's work end), the wait before anyone touches the
// car (a time penalty's hold, then CREW.lead), the new compound, its own small differences (seeded by the car and the
// time it entered the lane – known before it stands, so the last metres and the work are one motion) and a slow wheel
// only when the engine names one
export function stopPlan(g) {
  const p = g.pit, tm = p.times, st = tm.stop, pen = p.holdT1 != null || (tm.penEnd != null && tm.work != null && tm.work > st);
  const t0 = p.workT0 ?? p.holdT1 ?? null;
  return { kind: "tyres", from: "game", D: p.workT1 != null ? (p.workT1 - st) / 1000 : null, wait: t0 != null ? (t0 - st) / 1000 + (pen ? CREW.lead : 0) : 0,
    compound: p.compound || null, seed: seedOf(g), slow: p.err && Number.isInteger(p.err.wheel) ? { wheel: p.err.wheel, add: p.err.add || 0 } : null };
}
const seedOf = (g) => stopSeed(g.num, g.pit?.times?.entry ?? 0);
// when the crew's moves after the stop are over (the jacks pulled clear: stopChoreo's dropAt + 0.35 s) – sim ms
const settleT = (plan, st) => plan.D == null ? Infinity : st + (stopClock(plan, 0).dropAt + 0.4) * 1000;

// Whether the car's own wheels show the engine's new tyres yet: from the engine's work end, once the snapshot's tyre is the
// new compound (the engine changes it at the first 50 ms step at or after workT1) – at the latest 60 ms after workT1
export const swappedAt = (g, T) => g.pit?.workT1 != null && T >= g.pit.workT1 && (!g.pit.compound || g.tyre?.compound === g.pit.compound || T >= g.pit.workT1 + 60);

// The crews into the scene for this frame (map3d's game kit K, the adapter A, frameCars' fr) – replaces v0.48's
// cars3d.updateGameCrews. Records what was drawn in K.crewInfo (per team: mode, car, figures' places – the pit camera
// keeps off them) for the camera and the checks.
export function updateGameCrews(K, A, fr) {
  const t0 = performance.now(), c = K.crewCost || (K.crewCost = { ms: 0, frames: 0, worst: 0 });
  try { crews(K, A, fr); } finally { const d = performance.now() - t0; c.ms += d; c.frames++; if (d > c.worst) c.worst = d; }
}
function crews(K, A, fr) {
  const G = K.pitG(), world = K.world(), teams = K.pitTeams();
  const was = K.lifted, now = new Set(), mem = K.crewMem || (K.crewMem = {}), info = (K.crewInfo = {});
  const done = () => { for (const num of was) if (!now.has(num)) { const c = K.cars.get(num); if (c) K.restoreCar(c); } was.clear(); for (const n of now) was.add(n); };
  if (!G || !world || !teams) { world?.crews?.clear(); done(); return; }
  if (!world.crews) { world.crews = crewMeshes(); world.group.add(world.crews.group); world.crews.group.traverse((o) => K.nightLit?.(o.material)); }
  const m = K.pitModelFor(G), list = [], loose = [], T = fr.t, byTeam = new Map(), P = A.scenario.track.pit;
  if (mem.lastT != null && T < mem.lastT - 50) for (const k of Object.keys(mem)) if (k !== "lastT") delete mem[k];   // (a seek back: start over)
  mem.lastT = T;
  for (const g of fr.cars) { const ph = g.pit?.phase; if (!ph || ph === "none" || ph === "called" || ph === "committed") continue; const a = byTeam.get(g.team) || []; a.push(g); byTeam.set(g.team, a); }
  // (a team whose car has just left the lane is still finishing its moves or walking back: keep it in the loop)
  for (const [team, tm] of Object.entries(mem)) if (tm?.last?.rel != null && !byTeam.has(team) && T - tm.last.rel < (CREW.backS + 3) * 1000) byTeam.set(team, []);
  const old = mem.cmp || (mem.cmp = {});
  for (const g of fr.cars) if (!swappedAt(g, T) && g.pit?.phase !== "release" && g.pit?.phase !== "laneOut") old[g.num] = g.tyre?.compound || null;
  for (const [team, cs] of byTeam) {
    const tm = teams.find((q) => q.team === team); if (tm?.box == null) continue;
    const teamKey = cs[0]?.teamKey ?? A.scenario.entries?.find((e) => e.team === team)?.teamKey, boxU = P?.boxes?.[teamKey];
    const tmem = mem[team] || (mem[team] = {});
    const plan = crewPlan(cs, T, boxU, tmem); if (!plan) continue;
    const who = cs.find((g) => g.num === plan.num) || fr.cars.find((g) => g.num === plan.num), car = K.cars.get(plan.num);
    const B = teamBox(K, A, tm, boxU), { at, s } = B, bx = B.x, bz = B.z, boxYaw = B.yaw;
    // the frame: the car's own while it stands in the box (the guns meet its hubs), kept from then until the crew is back
    // in the garage (the car has gone); the box's before the car stands
    const inBox = car?.obj.visible && who && BOX.has(who.pit?.phase) && plan.s != null && plan.s >= 0;
    if (inBox) tmem.where = { x: car.pos.x, y: at.floor + 0.004, z: car.pos.z, yaw: car.yaw, num: plan.num, boxOff: +Math.hypot(car.pos.x - bx, car.pos.z - bz).toFixed(3) };
    else if (plan.mode === "out" && plan.s == null) tmem.where = null;
    const where = tmem.where && tmem.where.num === plan.num ? tmem.where : { x: bx, y: at.floor + 0.004, z: bz, yaw: boxYaw };
    const left = Math.sign(Math.cos(where.yaw) * s.inward[0] - Math.sin(where.yaw) * s.inward[1]) || 1;
    const dims = wheelParts(A.ctx.sessionYear(), team);
    world.crews.wheels(dims);
    const newC = who?.pit?.compound || null, oldC = old[plan.num] ?? who?.tyre?.compound ?? null;
    const L = crewFrame(plan, who, T, dims, left, at.boxC, tmem);
    if (car && inBox && L.car) { K.applyLift(car, L.car, dims); now.add(plan.num); }
    const colour = "#" + (A.driverOf(plan.num)?.TeamColour || "9aa0a6"), figs = crewAt(where, L.figures, colour);
    list.push(...figs);
    loose.push(...kitAt(where, L.kits, { old: TYRE_COLOURS[oldC] || null, new: TYRE_COLOURS[newC] || null }));
    info[team] = { mode: plan.mode, num: plan.num, s: plan.s, where: { x: where.x, y: where.y, z: where.z, yaw: where.yaw }, boxOff: tmem.where?.boxOff ?? null, left, figs: figs.map((f) => [f.x, f.z]) };
  }
  K.crewDrawn = world.crews.place(list, loose, K.camera.position);
  done();
}

// A team's box in the world: where the ENGINE stops its cars (its pit path at the box u → the pit building's frame; the
// painted box – garages.js – may sit a few metres off it: K.boxDiag records by how much). tm: the team's row of
// K.pitTeams(); boxU: its box on the engine's pit path. { x, z, y (the floor), yaw (the way the cars go), left (+1: the
// garages on the car's left), boxC, at, s (the pit model's slot) }
export function teamBox(K, A, tm, boxU) {
  const G = K.pitG(), world = K.world(), P = A.scenario.track.pit, m = K.pitModelFor(G);
  let bu = tm.box;
  if (P && boxU != null) { const pp = pitPointOf(P, boxU, world.center), pr = G.project(pp.x, pp.z); if (pr && Number.isFinite(pr.u)) { bu = pr.u; (K.boxDiag || (K.boxDiag = {}))[tm.team] = { engine: +pr.u.toFixed(2), painted: +tm.box.toFixed(2), off: +pr.off.toFixed(2) }; } }
  const at = m.at(bu), s = at.slot;
  const x = s.front[0] + s.along[0] * (bu - s.uc) - s.inward[0] * at.boxC, z = s.front[1] + s.along[1] * (bu - s.uc) - s.inward[1] * at.boxC;
  const yaw = P && boxU != null ? pitPointOf(P, boxU, { x: 0, z: 0 }).yaw : Math.atan2(s.along[0], s.along[1]);
  const left = Math.sign(Math.cos(yaw) * s.inward[0] - Math.sin(yaw) * s.inward[1]) || 1;
  return { x, z, y: at.floor + 0.004, yaw, left, boxC: at.boxC, at, s };
}

// The figures, the kit and the car's lift / wheels for a crew plan (crewPlan) – in the box's frame (crew.js: a along the
// car, b across, + the car's left; left: +1 with the garages on the car's left). who: the car's frameCars row; tmem: the
// team's memory (the held release's arm). Pure but for tmem.held.
export function crewFrame(plan, who, T, dims, left, boxC, tmem = {}) {
  if (plan.mode === "sg") return { figures: crewLayout("hold", 1, boxC, left), kits: [], car: null };
  if (!plan.plan) return changeWalk(plan.mode === "back" ? "back" : "ready", plan.f, dims, boxC, left);
  const L = stopChoreo(plan.plan, plan.s, dims, left);
  // the fitted new wheels stay the crew's until the engine's work ends (then the car's own, in the engine's compound)
  if (who && plan.mode !== "out" && !swappedAt(who, T) && L.car) {
    const H = hubsOf(dims);
    L.car.fitted.forEach((f, i) => { if (!f) return; L.car.off[i] = true; const h = H[i], lift = L.car.lift[h.axle === "front" ? 0 : 1]; L.kits.push({ kind: "new", axle: h.axle, a: h.a, b: h.b, h: h.r + lift, yaw: 0, flip: h.side < 0, by: null, fitted: i }); });
  }
  // held: the release man (stopChoreo's second last figure) turns to the car's nose with his arm out across its way;
  // once it's released he drops the arm and turns back (each over 0.3–0.4 s)
  if (plan.mode === "held") tmem.held = plan.num;
  const k = plan.mode === "held" ? ss(0, 0.3, plan.since) : plan.mode === "done" && tmem.held === plan.num ? 1 - ss(0, 0.4, plan.since) : 0;
  if (k > 0) { const r = L.figures.length - 2, [ra, rb, rf] = L.figures[r], hf = Math.atan2(-rb, dims.FZ + 0.9 - ra); L.figures[r] = [ra, rb, rf + wrapPi(hf - rf) * k, blendPose("stand", HALT, k), null, null]; }
  if (plan.mode === "out") L.car = null;   // (the car isn't at the box yet: nothing to lift)
  return L;
}

// a point of the engine's pit path at u (cars3d.js pitPoint – repeated here to keep this module free of cars3d)
function pitPointOf(P, u, c0) {
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const C = P.columns, f = Math.max(0, Math.min(P.n - 1, u / P.ds)), i = Math.min(P.n - 2, Math.floor(f)), w = f - i;
  const X = C.x[i] + (C.x[i + 1] - C.x[i]) * w, Y = C.y[i] + (C.y[i + 1] - C.y[i]) * w, h = C.hdg[i] + wrap(C.hdg[i + 1] - C.hdg[i]) * w;
  return { x: X - c0.x, z: -(Y - c0.z), yaw: Math.atan2(Math.cos(h), -Math.sin(h)) };
}
