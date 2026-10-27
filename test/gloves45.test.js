// v0.45 gloves: the kit palette in the colours the kit writes (v0.44 decoded them twice), the same colours on the fine
// and the light glove, and two looks – "real" (the researched kit) and "readable" (the default: a restrained readability
// aid – a dark glove keeps its dark knit, the team's colour on the wrist band, knuckle ridge and seams; not a copy of the
// real design) – their materials kept apart per kit and look. Cars are built from the app's own car3d.js.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const load = async () => ({ THREE: await import("../src/renderer/vendor/three.module.js"), C: await import("../src/renderer/car3d.js"), K: await import("../src/renderer/kit.js"), B: await import("../src/renderer/body3d.js") });
const GRIDS = {
  2024: [["Red Bull Racing", 1], ["Ferrari", 16], ["Mercedes", 63], ["Mercedes", 44], ["McLaren", 4], ["Aston Martin", 14], ["Alpine", 10], ["Williams", 23], ["RB", 22], ["Kick Sauber", 77], ["Haas F1 Team", 20]],
  2025: [["Red Bull Racing", 1], ["Ferrari", 16], ["Mercedes", 63], ["Mercedes", 12], ["McLaren", 4], ["Aston Martin", 14], ["Alpine", 10], ["Williams", 23], ["Racing Bulls", 30], ["Kick Sauber", 27], ["Haas F1 Team", 31]],
  2026: [["Red Bull Racing", 3], ["Ferrari", 16], ["Mercedes", 63], ["Mercedes", 12], ["McLaren", 1], ["Aston Martin", 14], ["Alpine", 10], ["Williams", 23], ["Racing Bulls", 30], ["Audi", 27], ["Haas F1 Team", 31], ["Cadillac", 11]],
};
const zonesOf = (g) => { const uv = g.attributes.uv.array, s = new Set(); for (let i = 0; i < uv.length; i += 2) s.add(Math.round(uv[i] * 16 - 0.5)); return s; };
const colourOf = (m, z) => { const a = m.map.image.data; return [a[z * 4], a[z * 4 + 1], a[z * 4 + 2]].join(","); };
// relative luminance (linear) of an "r,g,b" / #hex sRGB colour
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (c) => { const [r, g, b] = typeof c === "string" && c[0] === "#" ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : String(c).split(",").map(Number); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const modes = (K) => K.KIT_MODES || [null];
const setMode = (C, car, m) => { if (m && C.setKitMode) C.setKitMode(car, m); };

test("gloves v0.45: the light glove (other cars, the chase view) shows every colour the fine one does – the seams' colour too", async () => {
  const { C, K } = await load();
  for (const [season, grid] of Object.entries(GRIDS)) for (const [team, num] of grid) for (const mode of modes(K)) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: num, season: +season }), u = car.userData; setMode(C, car, mode);
    const m = u.gloveFine[0].material;
    assert.strictEqual(u.gloveLo[0].material, m, `${season} ${team} ${mode}: the two gloves on different materials`);
    // what the hand shows: the glove plus its gauntlet (one mesh on every LOD)
    const shown = (g) => new Set([...zonesOf(g), ...zonesOf(u.arms[0].gauntlet.geometry)].map((z) => colourOf(m, z)));
    const fine = shown(u.gloveFine[0].geometry), lo = shown(u.gloveLo[0].geometry);
    for (const c of fine) assert.ok(lo.has(c), `${season} ${team} #${num} ${mode || ""}: colour ${c} on the fine glove only (zones fine ${[...zonesOf(u.gloveFine[0].geometry)]} / light ${[...zonesOf(u.gloveLo[0].geometry)]})`);
  }
});

// (v0.44's kitPalette wrote THREE.Color's LINEAR components into a texture marked sRGB: the GPU decoded them a second
// time – "#2a2c30" black knit drew as #060608, papaya #ff8000 as #ff3700: every kit far darker than its research)
test("gloves v0.45: the kit palette holds each zone's sRGB colour as written in the kit (decoded once, not twice)", async () => {
  const { C, K, B, THREE } = await load();
  for (const [season, grid] of Object.entries(GRIDS)) for (const [team, num] of grid) {
    const st = K.kitStyle(C.liveryFor(team, "888888", +season), K.kitEntry(team, +season, null, num)), a = K.kitPalette(st);
    for (const [k, z] of Object.entries(B.KIT_ZONE)) {
      const hex = st[k], want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      assert.deepStrictEqual([a[z * 4], a[z * 4 + 1], a[z * 4 + 2]], want, `${season} ${team} ${k} ${hex}`);
    }
    const m = C.makeCar({ teamName: team, teamColour: "888888", number: num, season: +season }).userData.kitMat;
    assert.strictEqual(m.map.colorSpace, THREE.SRGBColorSpace);
  }
});

// (v0.44's floorBlack took the HSL lightness of the LINEAR colour: a black suit's base-rule glove came out #6a6e77 – a
// mid grey, hidden only by the palette's double decoding above)
test("gloves v0.45: the base rules' black knit is the black-knit albedo, not a mid grey", async () => {
  const { C, K } = await load();
  for (const [team, season] of [["Kick Sauber", 2025], ["Cadillac", 2026], ["Unknown Racing", 2026]]) {
    const st = K.kitStyle(C.liveryFor(team, team === "Unknown Racing" ? "101010" : "888888", season), K.kitEntry(team, season));
    assert.ok(lum(st.fabric) < 0.04, `${team}: base-rule fabric ${st.fabric} (luminance ${lum(st.fabric).toFixed(3)})`);
  }
});

test("gloves v0.45: two looks – readable (default) and real; the real look is the researched kit (KITS / base rules) unchanged", async () => {
  const { C, K } = await load();
  assert.deepStrictEqual(K.KIT_MODES, ["readable", "real"]);
  assert.strictEqual(K.KIT_MODE_DEFAULT, "readable");
  assert.strictEqual(K.kitMode("real"), "real"); assert.strictEqual(K.kitMode("readable"), "readable");
  for (const v of [undefined, null, "", "glow", 3]) assert.strictEqual(K.kitMode(v), "readable", `kitMode(${v})`);
  for (const [season, grid] of Object.entries(GRIDS)) for (const [team, num] of grid) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: num, season: +season }), u = car.userData;
    assert.strictEqual(u.kitMode, "readable", "a car built without a look is not in the default one");
    assert.strictEqual(u.kitMat, u.kitMats.readable);
    const real = K.kitPalette(K.kitStyle(C.liveryFor(team, "888888", +season), K.kitEntry(team, +season, null, num)));
    assert.deepStrictEqual([...u.kitMats.real.map.image.data], [...real], `${season} ${team}: the real look is not the researched kit`);
    const r = C.makeCar({ teamName: team, teamColour: "888888", number: num, season: +season, kit: "real" });
    assert.strictEqual(r.userData.kitMat, r.userData.kitMats.real); assert.strictEqual(r.userData.kitMode, "real");
  }
});

test("gloves v0.45: readable look – a dark glove keeps its dark knit, the team's colour on band, knuckles and seams only; light gloves as they are; nothing lit", async () => {
  const { C, K, B } = await load(), Z = B.KIT_ZONE, GLOVE = ["fabric", "back", "knuckle", "seam", "palm", "band", "gauntlet", "hem"];
  let dark = 0;
  for (const [season, grid] of Object.entries(GRIDS)) for (const [team, num] of grid) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: num, season: +season }), { real, readable } = car.userData.kitMats;
    const R = (k) => colourOf(real, Z[k]), A = (k) => colourOf(readable, Z[k]), tag = `${season} ${team} #${num}`;
    for (const m of [real, readable]) { assert.strictEqual(m.emissive.getHex(), 0, `${tag}: emissive`); assert.ok(!m.emissiveMap && m.emissiveIntensity <= 1, `${tag}: emissive`); }
    // the suit, the sleeves and the harness never change with the look
    for (const k of Object.keys(Z)) if (!GLOVE.includes(k)) assert.strictEqual(A(k), R(k), `${tag}: ${k} changed by the glove look`);
    const st = K.kitReadable(K.kitStyle(C.liveryFor(team, "888888", +season), K.kitEntry(team, +season, null, num)), C.liveryFor(team, "888888", +season), "888888");
    assert.match(st.src, /not (an exact copy|the real design)/i, `${tag}: the readable look's note`);
    if (lum(R("fabric")) >= K.KIT_DARK) {
      for (const k of GLOVE) assert.strictEqual(A(k), R(k), `${tag}: a light glove (${R("fabric")}) changed`);
      assert.strictEqual(readable.map.image.data.join(), real.map.image.data.join(), `${tag}: palettes`);
      continue;
    }
    dark++;
    // the knit stays black / dark: within the black-knit albedo range (3–6 %, kit.js), the same hue family
    assert.ok(lum(A("fabric")) <= Math.max(0.06, lum(R("fabric")) + 1e-6) && lum(A("fabric")) >= lum(R("fabric")) - 1e-6, `${tag}: fabric ${A("fabric")} not a dark knit (${lum(A("fabric")).toFixed(3)})`);
    assert.strictEqual(A("gauntlet") === A("fabric"), R("gauntlet") === R("fabric"), `${tag}: the gauntlet's fabric`);
    assert.ok(lum(A("back")) <= 0.06 || A("back") === R("back"), `${tag}: the back of the hand filled with colour (${A("back")})`);
    // the team's colour, readable against the knit, on the band and the knuckle ridge (both LODs) and the seams
    const sig = A("band");
    assert.ok(contrast(sig, A("fabric")) >= 2, `${tag}: band ${sig} on fabric ${A("fabric")}: contrast ${contrast(sig, A("fabric")).toFixed(2)}`);
    assert.ok(contrast(A("knuckle"), A("fabric")) >= 2, `${tag}: knuckles ${A("knuckle")}`);
    assert.ok(contrast(A("seam"), A("fabric")) >= 2, `${tag}: seams ${A("seam")}`);
    // restraint: at most those three zones (and real accents already there) carry colour; most of the glove is the knit
    const loud = GLOVE.filter((k) => k !== "palm" && k !== "hem" && contrast(A(k), A("fabric")) >= 2);
    assert.ok(loud.length <= 4, `${tag}: ${loud.join(",")} all in colour`);
    for (const k of ["fabric", "gauntlet"]) assert.ok(!loud.includes(k));
  }
  assert.ok(dark >= 10, `only ${dark} dark gloves seen`);
});

test("gloves v0.45: one material per kit and look, never shared across looks; switching cars, teams and looks recolours no other car's hands", async () => {
  const { C, K } = await load();
  const cars = [["Mercedes", 63, 2026], ["Mercedes", 12, 2026], ["McLaren", 1, 2026], ["Haas F1 Team", 31, 2026], ["Red Bull Racing", 1, 2025], ["Red Bull Racing", 3, 2026], ["Aston Martin", 14, 2025], ["Alpine", 10, 2026], ["Ferrari", 16, 2025], ["Williams", 23, 2026]]
    .map(([team, number, season]) => C.makeCar({ teamName: team, teamColour: "888888", number, season }));
  const snap = () => cars.map((c) => { const u = c.userData; return { mats: ["glove", "gloveLo"].map((n) => u[n === "glove" ? "gloveFine" : n][0].material), arm: u.arms[0].mesh.material, ga: u.arms[0].gauntlet.material,
    data: Object.fromEntries(Object.entries(u.kitMats).map(([k, m]) => [k, m.map.image.data.join()])) }; });
  for (const c of cars) for (const k of K.KIT_MODES) assert.strictEqual(c.userData.kitMats[k].userData.kitMode, k);
  for (const c of cars) assert.notStrictEqual(c.userData.kitMats.real, c.userData.kitMats.readable, "one material for both looks");
  const before = snap();
  // a run of switches: one car at a time to real and back, two of them left in real
  for (const [i, c] of cars.entries()) {
    C.setKitMode(c, "real");
    for (const [j, d] of cars.entries()) {
      const want = j <= i ? "real" : "readable", u = d.userData;
      for (const o of [u.gloveFine[0], u.gloveFine[1], u.gloveLo[0], u.gloveLo[1], u.arms[0].gauntlet, u.arms[1].mesh]) assert.strictEqual(o.material, u.kitMats[want], `after car ${i}: car ${j}'s ${o.name} not in ${want}`);
    }
  }
  for (const c of cars) C.setKitMode(c, "readable");
  C.setKitMode(cars[3], "real"); C.setKitMode(cars[3], "readable");
  const after = snap();
  // no palette written over, every car back on its own materials
  for (let i = 0; i < cars.length; i++) {
    assert.deepStrictEqual(after[i].data, before[i].data, `car ${i}: a kit palette changed`);
    assert.strictEqual(after[i].mats[0], before[i].mats[0]); assert.strictEqual(after[i].ga, before[i].ga);
  }
  // kits apart: no two different palettes on one material
  const byMat = new Map();
  for (const c of cars) for (const m of Object.values(c.userData.kitMats)) { const d = m.map.image.data.join() + m.userData.kitMode; assert.ok(!byMat.has(m) || byMat.get(m) === d); byMat.set(m, d); }
  // another team's car built after the switches gets its own material, not the last one switched
  const late = C.makeCar({ teamName: "McLaren", teamColour: "888888", number: 1, season: 2026, kit: "real" });
  assert.strictEqual(late.userData.kitMat, cars[2].userData.kitMats.real, "the same kit and look: shared");
  assert.notStrictEqual(late.userData.kitMat, cars[3].userData.kitMats.real);
});

