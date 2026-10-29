// The game's three clocks (DESIGN §2) and the fixed-step runner.
//   wall time   – the player's: only the caller knows it (the renderer passes performance.now(); tools pass nothing);
//   sim time    – the race's: integer milliseconds, advanced ONLY in whole steps of DT_MS (state.t);
//   render time – the moment the screen draws: between the last two steps (interpolation), never past sim time.
// Playback speed only moves the target sim time faster; the step stays DT_MS, so 1× and 30× (and 3D on or off, any FPS,
// any camera) compute exactly the same race. When the steps for a frame don't fit the frame's budget the runner stops
// short and says so (the speed actually achieved is reported – a speed the machine can't keep up with is not shown as
// working; request §4).
export const DT_MS = 50;
export const DT = DT_MS / 1000;

// run whole steps until state.t + DT_MS > targetT, or maxSteps (a budget by count – deterministic; a wall-time budget is
// the caller's, checked through `more()` between steps). step(race) advances race.state.t by DT_MS.
export function advanceTo(race, step, targetT, { maxSteps = Infinity, more = null } = {}) {
  let n = 0;
  while (race.state.t + DT_MS <= targetT && n < maxSteps && !race.state.finished) {
    step(race); n++;
    if (more && (n & 7) === 0 && !more()) break;
  }
  return n;
}

// The screen's runner: wall time → target sim time at the chosen speed; paused: no steps (the state does not change).
// now: () => wall ms (injected). budgetMs: wall time the steps may take per call (the rest of the frame is the renderer's).
export class Runner {
  constructor(race, step, { now, speed = 1, budgetMs = 6 } = {}) {
    this.race = race; this.step = step; this.now = now; this.speed = speed; this.paused = true; this.budgetMs = budgetMs;
    this.target = race.state.t; this.achieved = 0; this.behind = false; this.lastWall = null; this.hist = [];
  }
  setSpeed(x) { this.speed = Math.max(0, x); }
  pause() { this.paused = true; this.lastWall = null; }
  play() { this.paused = false; this.lastWall = null; this.target = this.race.state.t; }
  // one frame: returns how many steps ran
  frame() {
    const w = this.now();
    if (this.paused || this.race.state.finished) { this.lastWall = w; this.achieved = 0; return 0; }
    const dw = this.lastWall == null ? 0 : Math.min(250, w - this.lastWall);   // (a stalled tab doesn't make a 10 s jump)
    this.lastWall = w;
    this.target += dw * this.speed;
    const t0 = this.race.state.t, deadline = w + this.budgetMs;
    const n = advanceTo(this.race, this.step, this.target, { more: () => this.now() < deadline });
    // behind: the target ran ahead by more than a step – don't let it run away (the race is computed, never skipped)
    this.behind = this.target - this.race.state.t > DT_MS * 2;
    if (this.behind) this.target = this.race.state.t + DT_MS;
    // achieved speed over the last ~1 s of wall time
    this.hist.push([w, this.race.state.t - t0, dw]); while (this.hist.length > 1 && w - this.hist[0][0] > 1000) this.hist.shift();
    const sim = this.hist.reduce((a, h) => a + h[1], 0), wall = this.hist.reduce((a, h) => a + h[2], 0);
    this.achieved = wall > 0 ? sim / wall : 0;
    return n;
  }
}
