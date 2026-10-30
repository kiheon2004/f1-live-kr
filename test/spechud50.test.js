// v0.50 §8: the 3D spectator HUD's pure parts – layout clamping and anchoring (spectator/layout.js), the stored UI
// preference (presets, edits, broken / failing storage), keeping the cockpit's mirrors / wheel / centre clear, the car
// tag limit, camera vs selection, and what the HUD says (spectator/hudtext.js) – the pit panel never tells the future.
const test = require("node:test");
const assert = require("node:assert");
const L = () => import("../src/renderer/spectator/layout.js");
const T = () => import("../src/renderer/spectator/hudtext.js");

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

test("placeRect: anchored to its edge and always clamped inside the view", async () => {
  const { placeRect, MARGIN } = await L();
  // right / top: 10 px in from the right edge
  assert.deepStrictEqual(placeRect({ ax: "r", ay: "t", dx: 10, dy: 54 }, 150, 400, 1280, 688), { x: 1120, y: 54, w: 150, h: 400 });
  // the same at 1920 wide: still at the right edge
  assert.strictEqual(placeRect({ ax: "r", ay: "t", dx: 10, dy: 54 }, 150, 400, 1920, 1050).x, 1760);
  // centre / bottom
  const c = placeRect({ ax: "c", ay: "b", dx: 0, dy: 12 }, 500, 44, 1280, 688);
  assert.deepStrictEqual([c.x, c.y], [390, 632]);
  // an offset that would put it off-screen (stored on a big window, shown on a small one) is pulled back in
  for (const spec of [{ ax: "l", ay: "t", dx: 1800, dy: 900 }, { ax: "r", ay: "b", dx: -500, dy: -300 }, { ax: "c", ay: "c", dx: 4000, dy: -4000 }]) {
    const r = placeRect(spec, 200, 100, 800, 500);
    assert.ok(r.x >= MARGIN && r.x + r.w <= 800 - MARGIN && r.y >= MARGIN && r.y + r.h <= 500 - MARGIN, JSON.stringify([spec, r]));
  }
  // bigger than the view: at the top left margin, never at a negative place
  const big = placeRect({ ax: "r", ay: "b", dx: 0, dy: 0 }, 900, 600, 640, 360);
  assert.deepStrictEqual([big.x, big.y], [MARGIN, MARGIN]);
});

test("anchorFor: a dropped widget keeps to its nearest edges across a resize", async () => {
  const { anchorFor, placeRect } = await L();
  const a = anchorFor(1100, 600, 160, 60, 1280, 688);
  assert.deepStrictEqual([a.ax, a.ay], ["r", "b"]);
  assert.deepStrictEqual(placeRect(a, 160, 60, 1280, 688), { x: 1100, y: 600, w: 160, h: 60 });   // round trip
  const bigger = placeRect(a, 160, 60, 1920, 1050);
  assert.strictEqual(1920 - bigger.x - 160, 1280 - 1100 - 160);                                    // same distance from the right
  const mid = anchorFor(560, 300, 160, 60, 1280, 688);
  assert.deepStrictEqual([mid.ax, mid.ay], ["c", "c"]);
  assert.deepStrictEqual(placeRect(mid, 160, 60, 1280, 688), { x: 560, y: 300, w: 160, h: 60 });
});

test("prefs: presets, edits and reset as a UI preference; broken or failing storage gives the defaults", async () => {
  const { loadPrefs, savePrefs, defaultPrefs, applyPreset, setWidget, resetWidgets, PRESETS, PREF_KEY, sanitizePrefs, stepScale, SCALE } = await L();
  const st = mem();
  assert.deepStrictEqual(loadPrefs(st), defaultPrefs());
  let p = applyPreset(defaultPrefs(), "analysis");
  assert.strictEqual(p.preset, "analysis"); assert.strictEqual(p.widgets.tower.cols, "full");
  p = setWidget(p, "tower", { on: false }); p = setWidget(p, "driver", { ax: "l", ay: "b", dx: 20, dy: 30, scale: 1.3 });
  p.follow = false;
  assert.ok(savePrefs(st, p));
  const back = loadPrefs(st);
  assert.strictEqual(back.widgets.tower.on, false); assert.deepStrictEqual([back.widgets.driver.ax, back.widgets.driver.dx, back.widgets.driver.scale], ["l", 20, 1.3]);
  assert.strictEqual(back.edited, true); assert.strictEqual(back.follow, false);
  // reset: the preset's places again, the follow switch kept
  const r = resetWidgets(back);
  assert.deepStrictEqual(r.widgets, PRESETS.analysis.widgets); assert.strictEqual(r.edited, false); assert.strictEqual(r.follow, false);
  // another preset keeps the follow switch
  assert.strictEqual(applyPreset(back, "minimal").follow, false);
  // the camera tools (they hold the editor's button) can't be hidden
  assert.strictEqual(setWidget(defaultPrefs(), "cam", { on: false }).widgets.cam.on, true);
  // broken JSON, an old / newer version, junk values, a throwing storage
  st.m.set(PREF_KEY, "{oops"); assert.deepStrictEqual(loadPrefs(st), defaultPrefs());
  st.m.set(PREF_KEY, JSON.stringify({ v: 99, preset: "minimal" })); assert.deepStrictEqual(loadPrefs(st), defaultPrefs());
  const junk = sanitizePrefs({ v: 1, preset: "nope", widgets: { tower: { ax: "x", dx: "NaN", scale: 9 }, evil: { on: 1 } } });
  assert.strictEqual(junk.preset, "watch"); assert.strictEqual(junk.widgets.tower.ax, "r"); assert.strictEqual(junk.widgets.tower.scale, SCALE.max); assert.ok(!("evil" in junk.widgets));
  const bad = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("full"); } };
  assert.deepStrictEqual(loadPrefs(bad), defaultPrefs()); assert.strictEqual(savePrefs(bad, p), false);
  assert.deepStrictEqual(loadPrefs(null), defaultPrefs());
  assert.strictEqual(stepScale(1.55, 1), SCALE.max); assert.strictEqual(stepScale(0.7, -1), SCALE.min); assert.strictEqual(stepScale(1, 1), 1.1);
});

test("avoidZones: widgets leave the cockpit's mirrors, wheel and centre, and each other; squeezed when nothing is free", async () => {
  const { avoidZones, overlap } = await L();
  const vw = 1280, vh = 688;
  // the eye camera at 1280×688 (measured: shots/spec_*): mirrors ~21–28 % and 72–79 % across at 34–45 % down, the wheel
  // 30–72 % across from 43 % down, the centre 34–66 % × 16–48 %
  const zones = [{ x: 269, y: 234, w: 90, h: 76 }, { x: 922, y: 234, w: 90, h: 76 }, { x: 384, y: 296, w: 538, h: 392 }, { x: 435, y: 110, w: 410, h: 220 }];
  const rects = [{ id: "cam", x: 10, y: 620, w: 270, h: 60 }, { id: "driver", x: 490, y: 620, w: 300, h: 56 }, { id: "strip", x: 10, y: 10, w: 330, h: 30 }, { id: "tower", x: 1120, y: 54, w: 150, h: 420 }];
  const out = avoidZones(rects, zones, vw, vh);
  for (const r of out) {
    assert.ok(!r.squeezed, r.id);
    for (const z of zones) assert.ok(!overlap(r, z), `${r.id} over ${JSON.stringify(z)}`);
    assert.ok(r.x >= 8 && r.y >= 8 && r.x + r.w <= vw - 8 && r.y + r.h <= vh - 8, r.id);
  }
  for (const a of out) for (const b of out) if (a !== b) assert.ok(!overlap(a, b), `${a.id}/${b.id}`);
  assert.strictEqual(out.find((r) => r.id === "driver").moved, true);
  assert.strictEqual(out.find((r) => r.id === "strip").moved, false);   // nothing to avoid: left where it was
  // nowhere free: squeezed (the HUD hides it)
  const sq = avoidZones([{ id: "x", x: 10, y: 10, w: 300, h: 300 }], [{ x: 0, y: 0, w: 400, h: 400 }], 400, 400);
  assert.strictEqual(sq[0].squeezed, true);
});

test("pickTags: selected / compared / filmed always, then by position, a few per camera, never two on one spot, never hidden ones", async () => {
  const { pickTags, TAGS } = await L();
  const cands = Array.from({ length: 20 }, (_, i) => ({ num: String(i + 1), x: 40 + i * 70, y: 300, behind: false, dist: 50 + i * 30, rank: i + 1, sel: false, cmp: false, cam: false, hidden: false }));
  cands[17].sel = true; cands[18].cmp = true; cands[19].cam = true;
  const heli = pickTags(cands, { mode: "heli", w: 1600, h: 900 });
  assert.ok(heli.has("18") && heli.has("19") && heli.has("20"));
  assert.ok(heli.size <= TAGS.heli.max + 3);
  const chase = pickTags(cands, { mode: "chase", w: 1600, h: 900 });
  assert.ok(chase.has("18") && chase.has("19") && chase.has("20"));
  for (const n of chase) { const c = cands[+n - 1]; assert.ok(c.sel || c.cmp || c.cam || c.dist <= TAGS.chase.far, n); }
  assert.ok([...chase].filter((n) => +n <= 17).length <= TAGS.chase.max);
  // overlapping tags: only the more important one
  const two = pickTags([{ num: "a", x: 100, y: 100, dist: 10, rank: 5, sel: false, cmp: false, cam: false }, { num: "b", x: 120, y: 105, dist: 10, rank: 2, sel: false, cmp: false, cam: false }], { mode: "chase", w: 800, h: 600 });
  assert.deepStrictEqual([...two], ["b"]);
  // hidden behind a building or behind the camera: not drawn, even when selected
  const hid = pickTags([{ num: "s", x: 100, y: 100, dist: 80, rank: 1, sel: true, hidden: true }, { num: "t", x: 300, y: 100, dist: 80, rank: 2, behind: true }], { mode: "chase", w: 800, h: 600 });
  assert.strictEqual(hid.size, 0);
  // the editor / presets never add tags: the same input gives the same set
  assert.deepStrictEqual([...pickTags(cands, { mode: "heli", w: 1600, h: 900 })], [...heli]);
});

test("cameraCar: following – the selection; not following – the camera's own pick while that car exists", async () => {
  const { cameraCar } = await L();
  const has = new Set(["1", "4", "16"]), exists = (n) => has.has(n);
  assert.strictEqual(cameraCar({ follow: true, camPick: "4", focus: "16", leader: "1", exists }), "16");
  assert.strictEqual(cameraCar({ follow: true, camPick: null, focus: null, leader: "1", exists }), "1");
  assert.strictEqual(cameraCar({ follow: false, camPick: "4", focus: "16", leader: "1", exists }), "4");
  assert.strictEqual(cameraCar({ follow: false, camPick: "99", focus: "16", leader: "1", exists }), "16");   // (a car of another session)
  assert.strictEqual(cameraCar({ follow: false, camPick: null, focus: null, leader: null, exists }), null);
});

test("hudtext: gaps, flags, playback state", async () => {
  const { gapText, gapSec, flagOf, playText, tyreLetter, hms } = await T();
  assert.strictEqual(gapText("+1.234"), "+1.234"); assert.strictEqual(gapText("1 L"), "+1랩"); assert.strictEqual(gapText("+2 LAPS"), "+2랩");
  assert.strictEqual(gapText("LAP 23"), "선두"); assert.strictEqual(gapText(""), ""); assert.strictEqual(gapText(null), "");
  assert.strictEqual(gapSec("+12.5"), 12.5); assert.strictEqual(gapSec("1 L"), null);
  assert.strictEqual(flagOf("4").cls, "sc"); assert.strictEqual(flagOf("6").cls, "vsc"); assert.strictEqual(flagOf("1", "Finished").cls, "chequered"); assert.strictEqual(flagOf(undefined), null);
  assert.match(playText({ mode: "replay", rate: 4 }).ko, /4배/); assert.match(playText({ mode: "replay", rate: 0 }).ko, /일시정지/);
  assert.match(playText({ mode: "live", rate: 1, delayMs: 30000 }).ko, /지연 30초/); assert.strictEqual(playText({ mode: "live", rate: 1, delayMs: 0 }).ko, "실시간");
  assert.strictEqual(tyreLetter("INTERMEDIATE"), "I"); assert.strictEqual(tyreLetter("UNKNOWN"), null);
  assert.strictEqual(hms(3723000), "1:02:03"); assert.strictEqual(hms(65000), "1:05");
});

test("pitText: the stop as it is now – elapsed, penalty wait, work stage, long stop, released – never a time to come", async () => {
  const { pitText, PIT_SLOW } = await T();
  const flat = (r) => r ? [r.title, ...r.rows.map((x) => `${x.k} ${x.v}`)].join(" | ") : "";
  // in the box, wheels coming off: elapsed counts up, the stage drawn
  const a = pitText({ state: "in box", stillFor: 1.2, timePen: 0, work: { kind: "tyres", from: "record", off: 3, fitted: 1, done: 0, lifted: true } });
  assert.match(flat(a), /정차 1\.2초/); assert.match(flat(a), /1\/4 장착/); assert.match(flat(a), /재현/);
  // a 5 s time penalty being served: the wait shown with what has passed, no work
  const p = pitText({ state: "in box", stillFor: 2.1, timePen: 5, work: { kind: "tyres", from: "record", off: 0, fitted: 0, done: 0, lifted: false } });
  assert.match(flat(p), /5초 대기 중 · 2\.1초 경과/); assert.doesNotMatch(flat(p), /작업/);
  // a long stop (observed, no wheel named) – only once it has been long
  assert.doesNotMatch(flat(pitText({ state: "in box", stillFor: PIT_SLOW - 0.5, work: null })), /지연/);
  assert.match(flat(pitText({ state: "in box", stillFor: PIT_SLOW + 1, work: null })), /평소보다 긴 정차 · 바퀴별 자료 없음/);
  // live: the work isn't known while it stands
  assert.match(flat(pitText({ state: "in box", stillFor: 1, work: { kind: "work", from: null } })), /자료 없음/);
  // work done, still standing: the safe-release wait
  assert.match(flat(pitText({ state: "in box", stillFor: 3, work: { kind: "tyres", from: "observed", off: 0, fitted: 4, done: 4, lifted: true } })), /출발 대기/);
  assert.match(flat(pitText({ state: "stop-go", stillFor: 4 })), /스톱 앤 고/);
  assert.match(flat(pitText({ state: "waiting (double stack)", stillFor: 1 })), /더블 스택/);
  // released: the stationary time of the stop that is over (known), for a while
  assert.match(flat(pitText({ state: "fast lane", lastStop: { dur: 2.4, ago: 3 } })), /출발 완료 \| 정차 2\.4초/);
  assert.strictEqual(pitText({ state: "track", lastStop: { dur: 2.4, ago: 40 } }), null);
  // never a time to come: no countdown words or clock times in any stage
  const all = [a, p, pitText({ state: "to box", timePen: 5 }), pitText({ state: "in box", stillFor: 8, timePen: 5, work: { kind: "tyres", from: "record", off: 0, fitted: 4, done: 4, lifted: true } })];
  for (const r of all) assert.doesNotMatch(flat(r), /남은|후 출발|뒤 출발|예상|종료 시각|초 뒤|\d+:\d\d/, flat(r));
  assert.strictEqual(pitText(null), null);
});
