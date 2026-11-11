// The starting grid (grid.js): slots fitted to where the cars stood (the rules' 8 m pitch, robust to the feed's metre-
// scale misfits), the slot each car is in (the published grid before the start, the order at a standing restart),
// and how far a car is drawn into its slot – only from what is known at that moment, never holding a car back.
const test = require("node:test");
const assert = require("node:assert");

// a deterministic "random" for noise
const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };

test("grid fit: one slot per 8 m from the rules, pole's place from the median – the feed's misfits don't move it", async () => {
  const G = await import("../src/renderer/grid.js");
  const r = rnd(7), L = 5000, s1 = 1234;
  // 20 cars standing, each up to ±2 m off (as in the data: RMS 0.4–3.5 m), one car 8 m off
  const obs = Array.from({ length: 20 }, (_, i) => ({ g: i + 1, s: s1 - 8 * i + r() * 4 }));
  obs[7].s += 8;
  const f = G.fitGrid(obs, L);
  assert.ok(f.ok);
  assert.strictEqual(f.pitch, 8);
  assert.strictEqual(f.pitchFrom, "rules");
  assert.ok(Math.abs(f.s1 - s1) < 0.8, `pole within 0.8 m (${f.s1})`);
  assert.ok(Math.abs(f.pitchData - 8) < 0.3);
  // slots: pole and every one 8 m further back
  assert.ok(Math.abs(G.slotS(f, 1, L) - f.s1) < 1e-9);
  assert.ok(Math.abs(G.slotS(f, 11, L) - (f.s1 - 80)) < 1e-9);
});

test("grid fit: across the lap line's start, and the data's own pitch only when it is well determined and different", async () => {
  const G = await import("../src/renderer/grid.js");
  const L = 4000;
  // pole 20 m past the line's start: the field stands across it
  const obs = Array.from({ length: 16 }, (_, i) => ({ g: i + 1, s: (((20 - 8 * i) % L) + L) % L }));
  const f = G.fitGrid(obs, L);
  assert.ok(f.ok);
  assert.ok(Math.abs(f.s1 - 20) < 1e-6);
  assert.ok(Math.abs(G.slotS(f, 4, L) - (L - 4)) < 1e-6, "slot 4 is 4 m before the line's start");
  // a grid 7.45 m a slot (as measured at Catalunya in 2025 and 2026), 20 cars, little noise: the data's pitch is used
  const r = rnd(3);
  const cat = G.fitGrid(Array.from({ length: 20 }, (_, i) => ({ g: i + 1, s: 900 - 7.45 * i + r() * 0.6 })), L);
  assert.strictEqual(cat.pitchFrom, "data");
  assert.ok(Math.abs(cat.pitch - 7.45) < 0.05);
  // close to the rules (8.2 m: Hungaroring 2026 measured 8.22) or poorly determined (±8 m misfits): the rules' pitch
  const r2 = rnd(5);
  assert.strictEqual(G.fitGrid(Array.from({ length: 22 }, (_, i) => ({ g: i + 1, s: 900 - 8.2 * i + r2() * 3 })), L).pitchFrom, "rules");
  assert.strictEqual(G.fitGrid(Array.from({ length: 20 }, (_, i) => ({ g: i + 1, s: 900 - 7.4 * i + r2() * 16 })), L).pitchFrom, "rules");
});

test("grid fit: a queue that isn't a grid is refused", async () => {
  const G = await import("../src/renderer/grid.js");
  // cars queued nose to tail every 5.5 m behind the safety car: the fit doesn't hold
  assert.strictEqual(G.fitGrid(Array.from({ length: 18 }, (_, i) => ({ g: i + 1, s: 1000 - 5.5 * i * 3 })), 5000).ok, false);
  assert.strictEqual(G.fitGrid([{ g: 1, s: 10 }, { g: 2, s: 2 }], 5000).ok, false, "too few cars");
});

test("grid columns: pole's column on its side, the other in the middle of the other half", async () => {
  const G = await import("../src/renderer/grid.js");
  // tarmac from 6 m left to 8 m right of the lap line (centre −1 m, 14 m wide)
  assert.strictEqual(G.slotLat(1, 6, -8, 1), 2.5);
  assert.strictEqual(G.slotLat(2, 6, -8, 1), -4.5);
  assert.strictEqual(G.slotLat(1, 6, -8, -1), -4.5);
  assert.strictEqual(G.slotLat(3, 6, -8, -1), -4.5);
  // the source-backed pole side: Sepang 2026 on the right; nothing claimed elsewhere
  assert.strictEqual(G.poleSideFor(12, 2026).side, -1);
  assert.strictEqual(G.poleSideFor(12, 2017), null);
  assert.strictEqual(G.poleSideFor(63, 2026), null);
});

test("grid weight: standing in its slot – drawn there; leaving – let go with the distance driven, never held back", async () => {
  const G = await import("../src/renderer/grid.js");
  const W = (o) => G.gridWeight({ delta: 0, standing: false, preStart: true, speed: 0, driven: null, ...o });
  assert.strictEqual(W({ standing: true, delta: 3 }).state, "standing");
  assert.strictEqual(W({ standing: true, delta: 3 }).along, 1);
  // leaving: the slot offset fades along over 40 m and across over 300 m (v0.55; it was 120), starting with zero slope –
  // the car is drawn at (its place now + the offset it had standing × weight), so it moves the moment its data does
  const Lv = (driven) => W({ driven, delta: NaN }), l0 = Lv(0), l1 = Lv(1), l20 = Lv(20), l40 = Lv(40), l119 = Lv(G.BLEND.leaveAcross - 1), l121 = Lv(G.BLEND.leaveAcross + 1);
  assert.strictEqual(G.BLEND.leaveAcross, 300);
  assert.ok(Lv(120).across > 0.6, "120 m from its slot a car is still most of the way out in its column");
  assert.strictEqual(l0.state, "leaving");
  assert.ok(l0.along === 1 && l0.across === 1);
  assert.ok(l1.along > 0.99 && l1.along < 1, "smoothly from 1");
  assert.ok(l20.along > 0.4 && l20.along < 0.6 && l20.across > l20.along);
  assert.strictEqual(l40.along, 0);
  assert.ok(l119.across > 0 && l119.across < 0.001);
  assert.strictEqual(l121.state, "free");
  // arriving: only before the start, slowly, from behind its slot
  assert.strictEqual(W({ delta: -20, speed: 8 }).state, "arriving");
  assert.ok(W({ delta: -4, speed: 5 }).along === 1);
  assert.strictEqual(W({ delta: -20, speed: 8, preStart: false }).state, "free");
  assert.strictEqual(W({ delta: -20, speed: 30 }).state, "free", "passing at speed");
  assert.strictEqual(W({ delta: -60, speed: 5 }).state, "free", "too far back");
});

test("grid slots: before the start the published grid position, up to 1.5 slots off; at a restart the order", async () => {
  const G = await import("../src/renderer/grid.js");
  const L = 5000, model = { s1: 1000, pitch: 8, slots: 22 };
  // before the start: GridPos decides even when the feed has the car 7 m off (Zandvoort 2026: three cars 6–7 m off)
  const pre = G.assignSlots([{ num: "1", s: 1000.5, gridPos: 1 }, { num: "16", s: 999, gridPos: 2 }, { num: "44", s: 975, gridPos: 3 }], model, L, true);
  assert.deepStrictEqual([...pre].map(([n, a]) => [n, a.g, a.by]), [["1", 1, "gridPos"], ["16", 2, "gridPos"], ["44", 3, "gridPos"]]);
  assert.ok(Math.abs(pre.get("16").delta - 7) < 1e-9);
  // a restart: the standing cars by race position, one per slot (a missing car closes the grid up)
  const cars = Array.from({ length: 10 }, (_, i) => ({ num: "c" + i, s: 1000 - 8 * i + (i === 4 ? 2.5 : 0), position: i + 1, standing: true, onTrack: true }));
  const re = G.assignSlots(cars, model, L, false);
  assert.strictEqual(re.size, 10);
  assert.ok([...re.values()].every((a, k) => a.g === k + 1 && a.by === "position"));
  // a car moved down the order by a penalty but standing in its old slot: by where they stand instead
  const pen = cars.map((c) => (c.num === "c2" ? { ...c, position: 20 } : c));
  const rp = G.assignSlots(pen, model, L, false);
  assert.strictEqual(rp.get("c2").g, 3);
  assert.strictEqual(rp.get("c2").by, "order");
  // fewer than six standing: no restart grid
  assert.strictEqual(G.assignSlots(cars.slice(0, 5), model, L, false).size, 0);
  // moving cars don't count
  assert.strictEqual(G.assignSlots(cars.map((c) => ({ ...c, standing: false })), model, L, false).size, 0);
});

test("grid fit: a car standing elsewhere (two slots or more off) is left out of the grid, not fitted", async () => {
  const G = await import("../src/renderer/grid.js");
  const r = rnd(11), obs = Array.from({ length: 22 }, (_, i) => ({ g: i + 1, s: 2000 - 8 * i + r() * 3 }));
  obs[21].s = 3800;   // P22 standing far up the lap (as in the Hungaroring 2026 data, 470 m from the grid)
  const f = G.fitGrid(obs, 4380);
  assert.ok(f.ok);
  assert.deepStrictEqual(f.dropped, [22]);
  assert.ok(Math.abs(f.s1 - 2000) < 1);
});

test("grid slots after the clock started: the published grid when it fits best (a delayed standing start with empty slots)", async () => {
  const G = await import("../src/renderer/grid.js");
  const L = 5600, model = { s1: 4054, pitch: 8, slots: 22 };
  // Sepang 2026, 2:32:28: the cars standing by their published grid position, slots 6, 10, 11, 14, 15, 20 empty
  // (pit-lane starters, one car elsewhere) – s as in the data
  const data = [[1, 4054], [2, 4041], [3, 4039], [4, 4030], [5, 4018], [7, 4001], [8, 4000], [9, 3986], [12, 3962], [13, 3960], [16, 3931], [17, 3926], [18, 3921], [19, 3907], [21, 3890], [22, 3881]];
  const cars = data.map(([g, s], i) => ({ num: "n" + g, s, gridPos: g, position: i + 3, standing: true, onTrack: true }));
  const a = G.assignSlots(cars, model, L, false);
  assert.strictEqual(a.size, 16);
  assert.ok([...a].every(([n, x]) => x.by === "gridPos" && "n" + x.g === n));
});
