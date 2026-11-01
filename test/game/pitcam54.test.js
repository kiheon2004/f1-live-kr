// v0.54 (request §1): the game's pit camera shows the team's garage boards with the stop. The wide / idle shots (the box's
// framing for the stop) must hold, from every spot, the car, the whole crew round it AND the boards over the garage
// openings behind the box (garages.js teamLayer: the team's name and each driver's number and name, 0.98 m under the
// opening's top, 0.68 m in) – v0.53 looked at the car's middle and left the boards above the picture.
const test = require("node:test");
const assert = require("node:assert");
const PCAM = () => import("../../src/renderer/game/pitcam.js");

// the box frame (pitcam.js toWorld): a along the car, b across (+ the garages' side), h up; boxes LANES.box = 4 m out
const BOX_C = 4, OPEN_H = 4.8, BOARD = { b: BOX_C + 0.68, h: OPEN_H - 0.7 }, ASPECT = 1365 / 655;
// the angle (deg) of point q off the view axis spot → look, vertically and horizontally (a pinhole camera, up = +h)
function offAxis(spot, look, q) {
  const sub = (x, y) => x.map((v, i) => v - y[i]), dot = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0), n = (x) => { const l = Math.hypot(...x); return x.map((v) => v / l); };
  const cross = (x, y) => [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const f = n(sub(look, spot)), r = n(cross(f, [0, 0, 1])), u = cross(r, f), d = sub(q, spot);
  const z = dot(d, f); return { v: (Math.atan2(dot(d, u), z) * 180) / Math.PI, h: (Math.atan2(dot(d, r), z) * 180) / Math.PI, ahead: z > 0 };
}

test("wide / idle pit shots: the car, the crew round it and the garage boards behind the box are all in the picture", async () => {
  const { SHOTS } = await PCAM();
  // what must be seen: the car (its nose, tail, middle), the crew's outer people (≈ 1.1 m beside the wheels, 1.2 m beyond
  // nose and tail, crouched or standing), the boards over the two bays either side of the box (the drivers' bays) and the
  // team's board in the middle
  const car = [[0, 0, 0.45], [2.8, 0, 0.3], [-2.8, 0, 0.3]];
  const crew = [];
  for (const a of [-3.6, -1.7, 1.7, 3.6]) for (const b of [-2.1, 2.1]) for (const h of [0, 1.8]) crew.push([a, b, h]);
  const boards = [[-3.5, BOARD.b, BOARD.h], [0, BOARD.b, BOARD.h], [3.5, BOARD.b, BOARD.h], [-3.5, BOARD.b, BOARD.h + 0.6], [3.5, BOARD.b, BOARD.h + 0.6]];
  for (const name of ["wide", "idle"]) {
    const S = SHOTS[name], vHalf = S.fov / 2, hHalf = (Math.atan(Math.tan((vHalf * Math.PI) / 180) * ASPECT) * 180) / Math.PI;
    for (const spot of S.spots) {
      for (const [what, pts] of [["car", car], ["crew", crew], ["garage boards", boards]]) for (const q of pts) {
        const o = offAxis(spot, S.look, q);
        assert.ok(o.ahead && Math.abs(o.v) < vHalf - 1 && Math.abs(o.h) < hHalf - 1, `${name} from ${spot}: ${what} at ${q} is outside the picture (${o.v.toFixed(1)}°, ${o.h.toFixed(1)}° of ±${vHalf}°, ±${hHalf.toFixed(0)}°)`);
      }
    }
  }
});

// The stop's 1× (pitSlow, on by default from v0.54): at 30× a stop's ~2.4 s of work was 80 ms on screen (3 frames – the
// v0.54 measurement, Hungary 2025, NOR's stop at lap 19), the crew never seen. The director slows the SCREEN to 1× from
// 150 m before the box and puts the speed back once the car has gone – in the pit view and, v0.54, in whatever view
// follows the car (auto-direction off, or the viewer took another view during the visit). Never the engine.
test("pit scene slow-down: in the pit view and in a view the viewer chose; speed put back after; nothing without pitSlow", async () => {
  const { createPitCam, PITCAM } = await PCAM();
  const BOXU = 300;
  const row = (phase, u, extra = {}) => ({ num: "4", teamKey: "mcl", team: "McLaren", u, v: 20, pit: { phase, times: { entry: 0, ...extra.times }, workT0: extra.w0 ?? null, workT1: extra.w1 ?? null } });
  const run = ({ auto, slow, cam }) => {
    let mode = cam;
    const K = { camMode: () => mode, focus: () => "4", setCamByDirector: (m) => { mode = m; }, world: () => null, pitTeamsGroup: () => null };
    const src = { speed: 30, paused: false, setSpeed(x) { this.speed = x; } };
    const A = { ctx: { rate: 30 }, source: src, scenario: { track: { pit: { boxes: { mcl: BOXU } } } } };
    const P = createPitCam(K); P.S.auto = auto; P.S.slow = slow;
    const seen = [];
    const frame = (g, T) => { P.direct(A, { t: T, cars: [g] }, T); seen.push([T, src.speed, mode]); };
    frame(row("none", null), 0);
    frame(row("lane", BOXU - 200), 1000);
    frame(row("lane", BOXU - 100), 2000);                         // within 150 m: slowed
    frame(row("work", BOXU, { times: { stop: 5000 }, w0: 5000, w1: 7400 }), 6000);
    frame(row("laneOut", BOXU + 20, { times: { stop: 5000, release: 7500 }, w0: 5000, w1: 7400 }), 8000);
    frame(row("exit", BOXU + PITCAM.releaseGone + 5, { times: { stop: 5000, release: 7500 }, w0: 5000, w1: 7400 }), 9500);
    frame(row("none", null), 10000);
    return seen;
  };
  for (const [auto, cam] of [[true, "chase"], [false, "chase"], [false, "heli"]]) {
    const s = run({ auto, slow: true, cam });
    assert.strictEqual(s[1][1], 30, `auto ${auto} ${cam}: not yet slowed 200 m out`);
    assert.strictEqual(s[2][1], 1, `auto ${auto} ${cam}: 1× from 150 m before the box`);
    assert.strictEqual(s[3][1], 1, `auto ${auto} ${cam}: 1× while the crew works`);
    assert.strictEqual(s[s.length - 1][1], 30, `auto ${auto} ${cam}: the speed put back after`);
    if (!auto) assert.ok(s.every((x) => x[2] === cam), "auto-direction off: the chosen view stays");
  }
  const off = run({ auto: false, slow: false, cam: "chase" });
  assert.ok(off.every((x) => x[1] === 30), "pitSlow off: the speed is never touched");
});
