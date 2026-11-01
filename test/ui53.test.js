// v0.53 §12 (UI: less complicated, natural) – the pure parts behind the restructured screens:
//   - the 3D tower's keyboard (spectator/layout.js towerKey – what hud.js does on a key in the tower): the rows ON SCREEN
//     in their order, ↑↓ / Home / End, Enter / Space select, Shift compares, a held key selects once, an IME composing or a
//     modifier is never the tower's key (v0.52 §3 asked for this automated check),
//   - the HUD preference v1 → v2 (the provenance notes closed by default; places, scales, presets and follow kept),
//   - the camera note in two words for the driver card, the game card's status badge only when the car isn't plainly running.
const test = require("node:test");
const assert = require("node:assert");
const L = () => import("../src/renderer/spectator/layout.js");
const T = () => import("../src/renderer/spectator/hudtext.js");
const HM = () => import("../src/renderer/game/hudmodel.js");

const key = (k, o = {}) => ({ key: k, ...o });

test("tower keys: ↑↓ move through the rows on screen in screen order, stopping at the ends; Home / End the ends shown", async () => {
  const { towerKey } = await L();
  const rows = ["4", "81", "16", "63"];   // (the short view's rows, top to bottom – not the DOM order)
  assert.deepStrictEqual(towerKey(key("ArrowDown"), rows, "4"), { focus: "81" });
  assert.deepStrictEqual(towerKey(key("ArrowDown"), rows, "16"), { focus: "63" });
  assert.deepStrictEqual(towerKey(key("ArrowUp"), rows, "16"), { focus: "81" });
  assert.deepStrictEqual(towerKey(key("ArrowUp"), rows, "4"), { prevent: true }, "top: the key is the tower's, nothing moves");
  assert.deepStrictEqual(towerKey(key("ArrowDown"), rows, "63"), { prevent: true });
  assert.deepStrictEqual(towerKey(key("Home"), rows, "16"), { focus: "4" });
  assert.deepStrictEqual(towerKey(key("End"), rows, "81"), { focus: "63" });
  // a focused row that is no longer on screen (the short view moved): the arrows start from the first row shown
  assert.deepStrictEqual(towerKey(key("ArrowDown"), rows, "1"), { focus: "4" });
  // other keys are not the tower's (Tab, letters, the play shortcut's arrows with nothing to move do not get here)
  assert.strictEqual(towerKey(key("Tab"), rows, "4"), null);
  assert.strictEqual(towerKey(key("a"), rows, "4"), null);
  assert.strictEqual(towerKey(key("ArrowDown"), [], "4"), null);
});

test("tower keys: Enter / Space select, Shift compares, a held key once; IME composition and Cmd / Ctrl / Alt are never the tower's", async () => {
  const { towerKey } = await L();
  const rows = ["4", "81", "16"];
  assert.deepStrictEqual(towerKey(key("Enter"), rows, "81"), { select: "81", compare: false });
  assert.deepStrictEqual(towerKey(key(" "), rows, "16"), { select: "16", compare: false });
  assert.deepStrictEqual(towerKey(key("Enter", { shiftKey: true }), rows, "16"), { select: "16", compare: true });
  assert.deepStrictEqual(towerKey(key("Enter", { repeat: true }), rows, "16"), { prevent: true });
  assert.deepStrictEqual(towerKey(key(" ", { repeat: true }), rows, "16"), { prevent: true });
  // Korean input: the IME's own Enter / keyCode 229 pass through untouched
  assert.strictEqual(towerKey(key("Enter", { isComposing: true }), rows, "16"), null);
  assert.strictEqual(towerKey(key("ArrowDown", { keyCode: 229 }), rows, "16"), null);
  for (const m of ["metaKey", "ctrlKey", "altKey"]) assert.strictEqual(towerKey(key("ArrowDown", { [m]: true }), rows, "4"), null, m);
  assert.strictEqual(towerKey(null, rows, "4"), null);
});

test("HUD preference v1 → v2: the provenance notes close once; places, scales, the tower's column, presets and follow are kept", async () => {
  const { loadPrefs, sanitizePrefs, defaultPrefs, PRESETS, PREF_KEY, PREF_VERSION, setWidget } = await L();
  assert.strictEqual(PREF_VERSION, 2);
  for (const p of Object.keys(PRESETS)) assert.strictEqual(PRESETS[p].widgets.notes.on, false, `${p}: notes are detail on demand`);
  assert.strictEqual(defaultPrefs().widgets.notes.on, false);
  const v1 = { v: 1, preset: "analysis", edited: true, follow: false, widgets: { tower: { on: true, ax: "l", ay: "t", dx: 30, dy: 40, scale: 1.2, cols: "gap" }, notes: { on: true, ax: "l", ay: "b", dx: 10, dy: 150, scale: 1 }, driver: { on: false } } };
  const m = new Map([[PREF_KEY, JSON.stringify(v1)]]);
  const p = loadPrefs({ getItem: (k) => m.get(k) ?? null });
  assert.strictEqual(p.v, 2); assert.strictEqual(p.preset, "analysis"); assert.strictEqual(p.follow, false); assert.strictEqual(p.edited, true);
  assert.deepStrictEqual([p.widgets.tower.ax, p.widgets.tower.dx, p.widgets.tower.dy, p.widgets.tower.scale, p.widgets.tower.cols], ["l", 30, 40, 1.2, "gap"]);
  assert.strictEqual(p.widgets.driver.on, false);
  assert.strictEqual(p.widgets.notes.on, false, "v1's always-on notes are closed once");
  // in v2 the switch is the viewer's: opened notes stay open
  const opened = setWidget(p, "notes", { on: true });
  assert.strictEqual(sanitizePrefs(JSON.parse(JSON.stringify(opened))).widgets.notes.on, true);
  // a record from the future is still refused (defaults)
  assert.deepStrictEqual(sanitizePrefs({ v: 3, preset: "minimal" }), defaultPrefs());
});

test("camera note in two words for the driver card (the sentence stays in the notes and the tooltip)", async () => {
  const { camNoteShort } = await T();
  assert.strictEqual(camNoteShort(""), null);
  assert.strictEqual(camNoteShort(null), null);
  assert.deepStrictEqual(camNoteShort("NOR: 이 시점의 위치 자료가 없어 차를 그릴 수 없어요 (출발 상태로도 위치를 정할 수 없음)."), { ko: "위치 자료 없음", cls: "warn" });
  assert.deepStrictEqual(camNoteShort("TSU: 피트레인 출발 · 이 시점 위치 자료가 없어 피트 출구 대기 위치로 표시 (대기 순서는 추정)"), { ko: "위치 추정", cls: "info" });
  assert.deepStrictEqual(camNoteShort("VER: 이 시점 위치 자료가 없어 3번 칸에서 텔레메트리 속도로 출발 위치를 추정"), { ko: "위치 추정", cls: "info" });
  assert.strictEqual(camNoteShort("헬기: NOR 추적 중 · 끌어서 옮기면 자유 시점"), null, "a camera hint is not a data note");
});

test("game card: a status badge only when the car isn't plainly running", async () => {
  const { plainRunning } = await HM();
  assert.strictEqual(plainRunning({ status: "run", pit: { phase: "none" } }), true);
  assert.strictEqual(plainRunning({ status: "run" }), true);
  assert.strictEqual(plainRunning({ status: "run", pit: { phase: "called" } }), false);
  assert.strictEqual(plainRunning({ status: "pit", pit: { phase: "work" } }), false);
  assert.strictEqual(plainRunning({ status: "run", pit: { phase: "none" }, inc: { kind: "spin" } }), false);
  assert.strictEqual(plainRunning({ status: "dnf" }), false);
  assert.strictEqual(plainRunning({ status: "fin" }), false);
  assert.strictEqual(plainRunning(null), false);
});

test("game card: an incident says what it is (not '주행 중' in yellow)", async () => {
  const { incKo } = await HM();
  assert.strictEqual(incKo("spin"), "스핀"); assert.strictEqual(incKo("puncture"), "펑크"); assert.strictEqual(incKo("wide"), "코스 이탈");
  assert.strictEqual(incKo("something-new"), "사고 처리 중"); assert.strictEqual(incKo(null), "");
});

test("round 2 – cockpit motion controls: percent steps, the patch Map3D.motion stores, and back through motionprefs.js", async () => {
  const { motionUi, motionPatch } = await T();
  const { readMotionPrefs, MOTION_KEYS } = await import("../src/renderer/motionprefs.js");
  // defaults: head 100 %, vibration 0, auto
  assert.deepStrictEqual(motionUi(readMotionPrefs(() => null, false)), { headPct: 100, vibPct: 0, mode: "auto", note: "" });
  assert.deepStrictEqual(motionUi(null), { headPct: 100, vibPct: 0, mode: "auto", note: "" });
  // a change from the menu, stored the way Map3D.motion stores it, reads back the same
  const store = new Map(), put = (p) => { for (const [k, key] of [["head", MOTION_KEYS.head], ["vib", MOTION_KEYS.vib], ["reduce", MOTION_KEYS.reduce]]) if (k in p) store.set(key, String(p[k])); };
  put(motionPatch("head", "40")); put(motionPatch("vib", 70)); put(motionPatch("reduce", "off"));
  const st = readMotionPrefs((k) => store.get(k) ?? null, true);
  assert.deepStrictEqual([st.head, st.vib, st.mode, st.reduce], [0.4, 0.7, "off", false]);
  assert.deepStrictEqual(motionUi(st), { headPct: 40, vibPct: 70, mode: "off", note: "" });
  // reduced motion: on by choice, or auto with the system asking – the line says why the sliders do nothing
  assert.match(motionUi(readMotionPrefs((k) => (k === MOTION_KEYS.reduce ? "on" : null))).note, /움직임 줄이기 켬/);
  assert.match(motionUi(readMotionPrefs(() => null, true)).note, /시스템/);
  // bounds and nonsense
  assert.deepStrictEqual(motionPatch("head", 250), { head: 1 }); assert.deepStrictEqual(motionPatch("vib", -5), { vib: 0 });
  assert.strictEqual(motionPatch("head", "x"), null); assert.strictEqual(motionPatch("reduce", "maybe"), null); assert.strictEqual(motionPatch("other", 1), null);
  assert.strictEqual(motionUi({ head: 0.37, vib: 0.04 }).headPct, 40); assert.strictEqual(motionUi({ head: 0.37, vib: 0.04 }).vibPct, 0);
});

test("round 2 – feed trouble note: read defensively (absent, string, numbers or { num }), names the cars, says nothing when fine", async () => {
  const { feedNote } = await T();
  const tla = (n) => ({ 1: "VER", 44: "HAM", 16: "LEC" }[n]);
  assert.strictEqual(feedNote(undefined), null); assert.strictEqual(feedNote(null), null); assert.strictEqual(feedNote("{oops"), null);
  assert.strictEqual(feedNote({ held: 0, rewound: 0, degradedCars: [] }), null);
  const a = feedNote({ held: 0, rewound: 0, degradedCars: ["1", { num: "44" }, 1] }, tla);
  assert.match(a.text, /위치 자료 불안정 – 텔레메트리로 보정: VER, HAM/); assert.deepStrictEqual([...a.nums], ["1", "44"]);
  const b = feedNote(JSON.stringify({ held: [1, 2], rewound: 3 }), tla);
  assert.match(b.text, /멈춘 위치 자료 2건 제외/); assert.match(b.text, /3건 무시/); assert.strictEqual(b.nums.size, 0);
  // the real hook's shape: held / rewound are sample counts (not cars), leapFrames frames
  const r = feedNote({ held: 355012, rewound: 7800, degradedCars: ["16"], degradedNow: [], leapFrames: 12 }, tla);
  assert.match(r.text, /멈춘 위치 자료 355,012건 제외/); assert.doesNotMatch(r.text, /\d+대 잠시/); assert.match(r.text, /크게 튄 위치는 잠시 숨김/);
  const many = feedNote({ degradedCars: Array.from({ length: 9 }, (_, i) => String(i + 100)) });
  assert.match(many.text, /외 3대/);
});
