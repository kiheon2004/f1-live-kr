// The screen's side of the game clock (DESIGN §2, request §4): wall time → sim time through the engine's own fixed-step
// Runner (src/game/engine/clock.js – it alone advances the race, in whole 50 ms steps, at any speed), a snapshot buffer
// for the 3D view's interpolation, the speed actually achieved, and optional slowing down on the engine's events.
//
//   wall time   performance.now() – only here (the engine never sees it)
//   sim time    race.state.t (integer ms) – advanced only by step(race)
//   render time what the 3D view and the tower draw: behind sim time by about one frame's worth of sim time, inside the
//               buffered snapshots, never past the newest one; paused, it stops where it is
//
// Speed: pause / 1× / 2× / 5× / 10× / 30× / 60×. A frame may run many steps (60× at 60 fps: 20 steps a frame); if the
// steps don't fit the frame's budget the runner stops short (clock.js: "behind") and what is shown is the speed really
// achieved over the last second – never the asked-for one when the machine can't keep up. The race computed is the same
// at every speed (the steps are the same steps).
import { Runner, DT_MS } from "../../game/engine/clock.js";

export const SPEEDS = [0, 1, 2, 5, 10, 30, 60];

export class GameRunner {
  // engine: { step(race), snapshot(race), command?(race, cmd), events?(race, sinceT) } – the engine's public API, or the
  // dev stand-in (devsnap.js) in development only
  constructor(race, engine, { now = () => performance.now(), budgetMs = 8, keep = 6, autoSlow = null } = {}) {
    this.race = race; this.engine = engine; this.now = now;
    this.clock = new Runner(race, (r) => engine.step(r), { now, speed: 1, budgetMs });
    this.buf = []; this.keep = keep; this.renderT = race.state.t; this.lagMs = DT_MS; this.speed = 1;
    this.autoSlow = autoSlow;   // null, or { match(event) → bool, to: speed } – screen only, never the engine
    this.slowNote = null; this.evAt = race.state.t; this.listeners = new Set();
    this.stats = { frames: 0, steps: 0, stepMs: 0, worstFrameStepMs: 0, snapMs: 0 };
    this.push();
  }
  get paused() { return this.clock.paused; }
  get achieved() { return this.clock.achieved; }
  get behind() { return this.clock.behind; }
  setSpeed(x) {
    if (!(x > 0)) { this.clock.pause(); this.speed = 0; return; }
    this.speed = x; this.clock.setSpeed(x); if (this.clock.paused) this.clock.play();
  }
  pause() { this.clock.pause(); }
  play() { this.clock.play(); if (!this.speed) this.speed = 1; this.clock.setSpeed(this.speed); }
  push() {
    const s0 = this.now(), snap = this.engine.snapshot(this.race);
    this.stats.snapMs += this.now() - s0;
    const b = this.buf; if (b.length && b[b.length - 1].t === snap.t) b[b.length - 1] = snap; else b.push(snap);
    while (b.length > this.keep) b.shift();
  }
  // one screen frame: steps (the engine's), one snapshot if anything ran, the render time moved on
  frame() {
    const w0 = this.now(), t0 = this.race.state.t;
    const n = this.clock.frame();
    const ms = this.now() - w0;
    this.stats.frames++; this.stats.steps += n; this.stats.stepMs += ms; if (ms > this.stats.worstFrameStepMs) this.stats.worstFrameStepMs = ms;
    if (n) this.push();
    const tNew = this.race.state.t, newest = this.buf[this.buf.length - 1].t, oldest = this.buf[0].t;
    if (!this.clock.paused && n) this.lagMs += ((tNew - t0) - this.lagMs) * 0.2;   // (≈ the sim time one frame covers now)
    if (!this.clock.paused) {
      // the render time follows the clock's target one frame's worth behind – smooth between snapshots at any speed
      const want = this.clock.target - Math.max(DT_MS, this.lagMs);
      this.renderT = Math.max(oldest, Math.min(newest, Math.max(this.renderT, want)));
    }
    if (this.engine.events && tNew > this.evAt) { const ev = this.engine.events(this.race, this.evAt) || []; this.evAt = tNew; if (ev.length) this.onEvents(ev); }
    return n;
  }
  onEvents(ev) {
    for (const f of this.listeners) f(ev);
    if (!this.autoSlow || this.speed <= this.autoSlow.to) return;
    const hit = ev.find((e) => this.autoSlow.match(e));
    if (hit) { this.setSpeed(this.autoSlow.to); this.slowNote = { t: hit.t ?? this.race.state.t, type: hit.type, why: [hit.type, hit.car ? "#" + hit.car : "", typeof hit.effect === "string" ? hit.effect : typeof hit.cause === "string" ? hit.cause : hit.effect?.kind || ""].filter(Boolean).join(" ") }; }
  }
  // the two snapshots around the render time (for adapter3d.frameCars)
  pair() {
    const b = this.buf, T = this.renderT;
    if (!b.length) return null;
    let i = b.length - 1; while (i > 0 && b[i - 1].t > T) i--;
    const hi = b[i], lo = i > 0 ? b[i - 1] : null;
    return lo && T >= lo.t ? { a: lo, b: hi, renderT: T } : { a: null, b: hi, renderT: hi.t };
  }
  latest() { return this.buf[this.buf.length - 1]; }
  // an order to the engine (an id is the caller's – engine commands.js makes it idempotent)
  command(cmd) { return this.engine.command ? this.engine.command(this.race, cmd) : { ok: false, why: "엔진 연결 전" }; }
  costs() { const s = this.stats; return { frames: s.frames, steps: s.steps, msPerStep: s.steps ? +(s.stepMs / s.steps).toFixed(4) : null, worstFrameStepMs: +s.worstFrameStepMs.toFixed(2), snapMsAvg: s.frames ? +(s.snapMs / Math.max(1, s.frames)).toFixed(3) : null }; }
}

// A unique id for a player order (commands.js: the same id twice is one order) – the session's counter and the wall
// clock's moment, so a double click sends two DIFFERENT ids only when it is two clicks; a held key is debounced by the UI
let seq = 0;
export const orderId = (kind) => `p-${kind}-${Date.now().toString(36)}-${(++seq).toString(36)}`;
