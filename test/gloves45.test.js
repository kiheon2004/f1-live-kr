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
