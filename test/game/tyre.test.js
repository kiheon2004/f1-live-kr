// tyre.js – causality (heat in → temperature → reversible window loss; overheat → faster irreversible wear; SC cools;
// out-lap warms from the blanket; water decides the compound), conservation/ranges.
const test = require("node:test");
const assert = require("node:assert");
const { physics } = require("./_physics.js");

let T, X;
test.before(async () => { X = await physics(); T = X.tyre; });
const DT = 0.05;
// constant running conditions for t seconds
function run(ty, s, inp) { for (let k = 0; k < Math.round(s / DT); k++) T.stepTyre(ty, inp, DT); return ty; }
const racing = { v: 55, aLat: 11, aLong: 4, heat: 1, Tair: 25, Ttrack: 35, water: 0 }; // ≈ a dry racing lap's mean tyre work (Q ≈ 800 m²/s³, measured in solo runs)

test("racing load heats a set from the blanket into the window; grip rises as it warms (out-lap)", () => {
  const ty = T.createTyre("C3", { T0: T.fitTemp(2025, "C3", 25) });
  const g0 = T.tyreGrip(ty);
  run(ty, 60, racing);
  const Tw = T.windowTemp(ty), cp = T.compoundParams("C3");
  assert.ok(Tw > cp.winLo && Tw < cp.winHi + 10, "window temperature after a minute of racing: " + Tw);
  assert.ok(T.tyreGrip(ty) > g0, "warm tyre grips more than the blanket-temperature tyre");
  // a cold (no blanket) set starts lower and takes longer
  const cold = T.createTyre("C3", { T0: 25 }), warm = T.createTyre("C3", { T0: 70 });
  run(cold, 20, racing); run(warm, 20, racing);
  assert.ok(T.tyreGrip(cold) < T.tyreGrip(warm), "cold set still behind after 20 s");
});

test("overheating loses grip REVERSIBLY: after cooling the grip comes back (minus only the wear done)", () => {
  const ty = T.createTyre("C4", { T0: 90 });
  run(ty, 60, racing);
  const gWin = T.tyreGrip(ty), wWin = ty.wear;
  run(ty, 40, { ...racing, heat: 1.7 }); // a long hard push / sliding
  const gHot = T.tyreGrip(ty);
  assert.ok(T.windowTemp(ty) > T.compoundParams("C4").winHi, "overheated: " + T.windowTemp(ty));
  assert.ok(gHot < gWin - 0.004, `hot grip ${gHot} < window grip ${gWin}`);
  run(ty, 90, racing); // back to normal load: cools to the window
  const gBack = T.tyreGrip(ty);
  const wearOnly = T.compoundParams("C4").muRel * T.wearFactor(T.compoundParams("C4"), ty.wear);
  assert.ok(Math.abs(gBack - wearOnly) < 0.002, `recovered to the wear-limited grip (${gBack} vs ${wearOnly})`);
  assert.ok(gBack > gHot, "recovered");
  assert.ok(ty.wear > wWin, "but the wear done is kept");
});

test("overheating accelerates irreversible wear (same tyre work, hotter track ⇒ more wear)", () => {
  const a = T.createTyre("C3", { T0: 100 }), b = T.createTyre("C3", { T0: 100 });
  run(a, 300, racing); run(b, 300, { ...racing, Ttrack: 60, Tair: 38 });
  assert.ok(T.windowTemp(b) > T.compoundParams("C3").winHi, "hot day overheats: " + T.windowTemp(b));
  assert.ok(b.wear > a.wear * 1.05, `hot ${b.wear} vs normal ${a.wear}`);
});

test("more tyre heat input (driver/car factor) ⇒ hotter and more wear", () => {
  const a = T.createTyre("C3", { T0: 90 }), b = T.createTyre("C3", { T0: 90 });
  run(a, 200, racing); run(b, 200, { ...racing, heat: 1.15 });
  assert.ok(b.Ts > a.Ts && b.wear > a.wear);
});

test("safety-car running cools the tyres and they lose grip; racing again warms them back", () => {
  const ty = T.createTyre("C3", { T0: 90 }); run(ty, 120, racing);
  const Ts0 = ty.Ts, g0 = T.tyreGrip(ty);
  run(ty, 180, { ...racing, v: 35, aLat: 5, aLong: 1.5 }); // SC pace: lower speed, gentle loads
  assert.ok(ty.Ts < Ts0 - 15, `SC cooled ${Ts0} → ${ty.Ts}`);
  assert.ok(T.tyreGrip(ty) < g0, "cold after SC");
  run(ty, 60, racing);
  assert.ok(T.tyreGrip(ty) > g0 - 0.003, "warm again after a minute of racing");
});

test("water decides the compound: slick best dry, intermediate in between, full wet in deep water", () => {
  const best = (h) => ["C3", "INTERMEDIATE", "WET"].map((c) => [c, T.compoundParams(c).muRel * T.waterFactor(T.compoundParams(c), h)]).sort((a, b) => b[1] - a[1])[0][0];
  assert.strictEqual(best(0), "C3");
  assert.strictEqual(best(1.0), "INTERMEDIATE");
  assert.strictEqual(best(4.0), "WET");
  // grip only falls with more water for every compound
  for (const c of ["C3", "INTERMEDIATE", "WET"]) { let p = 2; for (let h = 0; h <= 6; h += 0.25) { const f = T.waterFactor(T.compoundParams(c), h); assert.ok(f <= p && f > 0); p = f; } }
});

test("wet-weather tyres on a dry track overheat and wear much faster than on a damp one; slicks in the wet go cold", () => {
  const dry = T.createTyre("INTERMEDIATE", { T0: 60 }), damp = T.createTyre("INTERMEDIATE", { T0: 60 });
  run(dry, 240, racing); run(damp, 240, { ...racing, water: 0.8 });
  assert.ok(dry.Ts > damp.Ts + 10, `inter dry ${dry.Ts} vs damp ${damp.Ts}`);
  assert.ok(dry.wear > damp.wear * 2, `inter wear dry ${dry.wear} vs damp ${damp.wear}`);
  assert.ok(T.windowTemp(dry) > T.compoundParams("INTERMEDIATE").winHi, "inter overheated on dry");
  const slick = T.createTyre("C3", { T0: 70 }); run(slick, 240, { ...racing, v: 45, aLat: 9, aLong: 4, water: 1.5 });
  assert.ok(T.windowTemp(slick) < T.compoundParams("C3").winLo, "slick below its window in the wet: " + T.windowTemp(slick));
});

test("ranges: wear stays in [0, 1] and never decreases; temperatures clamped; grip finite and positive under abuse", () => {
  const ty = T.createTyre("C5", { T0: 25, wear0: 0.2 });
  let prev = ty.wear;
  const inputs = [{ ...racing, heat: 50 }, { ...racing, v: -5, aLat: -40 }, { v: 0, aLat: 0, aLong: 0, Tair: -5, Ttrack: -5, water: 10 }, { ...racing, heat: 0 }, { v: 100, aLat: 60, aLong: 60, heat: 5, Tair: 45, Ttrack: 65, water: 0 }];
  for (let r = 0; r < 4; r++) for (const inp of inputs) for (let k = 0; k < 400; k++) {
    T.stepTyre(ty, inp, DT);
    assert.ok(ty.wear >= prev && ty.wear <= 1, "wear " + ty.wear); prev = ty.wear;
    assert.ok(ty.Ts >= -10 && ty.Ts <= 160 && ty.Tc >= -10 && ty.Tc <= 160);
    const g = T.tyreGrip(ty, inp.water); assert.ok(Number.isFinite(g) && g > 0 && g < 1.2, "grip " + g);
  }
  assert.strictEqual(ty.wear, 1, "abused to the end of the tread");
  assert.throws(() => T.createTyre("C9"));
  assert.strictEqual(T.createTyre("C3", { wear0: -1 }).wear, 0);
});

test("older tyre: less grip at the same temperature and less margin (closer to the cliff)", () => {
  const cp = T.compoundParams("C3");
  assert.ok(T.wearFactor(cp, 0.5) < T.wearFactor(cp, 0.1));
  const slope = (w) => T.wearFactor(cp, w) - T.wearFactor(cp, w + 0.05);
  assert.ok(slope(0.85) > 2 * slope(0.2), "grip falls faster near the end of the tread");
});

test("blanket rule from season data: slicks start at the blanket temperature, full wets at ambient", () => {
  assert.ok(T.fitTemp(2025, "C3", 20) > 20);
  assert.strictEqual(T.fitTemp(2025, "WET", 20), 20);
});
