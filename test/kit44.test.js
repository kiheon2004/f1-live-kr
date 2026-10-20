// v0.44: the driver's kit (kit.js – gloves, sleeves, torso, harness in zones, one shared material per kit style) and the
// six-point harness (harness.js) laid on the torso as drawn. Cars are built from the app's own car3d.js.
const test = require("node:test");
const assert = require("node:assert");

const load = async () => ({ THREE: await import("../src/renderer/vendor/three.module.js"), C: await import("../src/renderer/car3d.js"), K: await import("../src/renderer/kit.js"), B: await import("../src/renderer/body3d.js"), G: await import("../src/renderer/meshgeo.js"), D: await import("../src/renderer/dispose.js") });
const named = (car, name) => { const out = []; car.traverse((o) => { if (o.name === name) out.push(o); }); return out; };
// a zone's sRGB colour in a material's palette
const zoneColour = (m, z) => { const a = m.map.image.data; return [a[z * 4], a[z * 4 + 1], a[z * 4 + 2]]; };
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const zonesOf = (g) => { const uv = g.attributes.uv.array, s = new Set(); for (let i = 0; i < uv.length; i += 2) s.add(Math.round(uv[i] * 16 - 0.5)); return s; };

test("kit v0.44: no glove takes the car's body colour whole – Mercedes' near-black car, black-knit gloves with zones of their own", async () => {
  const { C, B } = await load();
  for (const season of [2025, 2026]) {
    const car = C.makeCar({ teamName: "Mercedes", teamColour: "27F4D2", number: 63, season }), m = car.userData.kitMat, Z = B.KIT_ZONE;
    // (v0.43: the glove material's colour was the livery's base, #111214 – luminance 0.07 on the 0–1 sRGB scale)
    const fabric = zoneColour(m, Z.fabric);
    assert.notDeepStrictEqual(fabric, [0x11, 0x12, 0x14], `${season}: the glove's fabric is the car's gloss black`);
    assert.ok(lum(fabric) >= 0.15, `${season}: the fabric darker than a black knit's albedo (${lum(fabric).toFixed(3)})`);
    // the fabric, the palm print and the wrist band are not all the same colour: the glove reads in parts
    const parts = new Set([Z.fabric, Z.back, Z.palm, Z.band, Z.knuckle].map((z) => zoneColour(m, z).join()));
    assert.ok(parts.size >= 3, `${season}: ${parts.size} colours over the glove's zones`);
    // no zone lit: no emissive, no glove light (the scene's own light draws it)
    assert.strictEqual(m.emissive.getHex(), 0, "an emissive glove");
  }
});

test("kit v0.44: one material per kit style – the team's cars share it, other teams have their own; freeing a car leaves it to the others", async () => {
  const { C, D } = await load();
  const a = C.makeCar({ teamName: "Mercedes", teamColour: "27F4D2", number: 63, season: 2026 }), b = C.makeCar({ teamName: "Mercedes", teamColour: "27F4D2", number: 12, season: 2026 });
  const f = C.makeCar({ teamName: "Ferrari", teamColour: "E80020", number: 16, season: 2026 });
  assert.strictEqual(a.userData.kitMat, b.userData.kitMat, "two Mercedes, two kit materials");
  assert.notStrictEqual(a.userData.kitMat, f.userData.kitMat, "Mercedes and Ferrari share a kit material");
  assert.notStrictEqual(a.userData.kitMat.map, f.userData.kitMat.map, "and their palettes");
  // the gloves, gauntlets, sleeves and the torso (with the harness) all on the kit's material
  for (const name of ["glove", "gloveLo", "gauntlet", "arm", "torso"]) for (const o of named(a, name)) assert.strictEqual(o.material, a.userData.kitMat, name);
  // freeing one car: the shared material and its palette stay usable for the other
  let freed = 0; const m = a.userData.kitMat, onDispose = () => freed++; m.addEventListener("dispose", onDispose); m.map.addEventListener("dispose", onDispose);
  D.disposeGroup(a);
  assert.strictEqual(freed, 0, "the shared kit material or its palette freed with one car");
  m.removeEventListener("dispose", onDispose); m.map.removeEventListener("dispose", onDispose);
});

test("kit v0.44: the fine and the light glove in the same zones and colours (no colour jump when the detail changes); both hands alike", async () => {
  const { C, B } = await load();
  const car = C.makeCar({ teamName: "McLaren", teamColour: "FF8000", number: 4, season: 2025 }), u = car.userData, Z = B.KIT_ZONE;
  for (let i = 0; i < 2; i++) {
    const fine = zonesOf(u.gloveFine[i].geometry), lo = zonesOf(u.gloveLo[i].geometry);
    for (const z of lo) assert.ok(fine.has(z), `hand ${i}: the light glove's zone ${z} not on the fine one`);
    for (const z of [Z.fabric, Z.back, Z.knuckle]) assert.ok(lo.has(z) && fine.has(z), `hand ${i}: zone ${z} missing`);
    assert.strictEqual(u.gloveFine[i].material, u.gloveLo[i].material);
  }
  assert.deepStrictEqual([...zonesOf(u.gloveFine[0].geometry)].sort(), [...zonesOf(u.gloveFine[1].geometry)].sort(), "left and right hands' zones");
  // the cuff band on the gauntlet, the knitted cuff and the seam on the sleeve
  const gz = zonesOf(u.arms[0].gauntlet.geometry), az = zonesOf(u.arms[0].mesh.geometry);
  assert.ok(gz.has(Z.band) && gz.has(Z.gauntlet) && gz.has(Z.hem), "the gauntlet's zones");
  assert.ok(az.has(Z.suit) && az.has(Z.suitSeam) && az.has(Z.suitCuff), "the sleeve's zones");
});

test("kit v0.44: every team of the 2024, 2025 and 2026 grids gets a kit; the base rules work for a team the app doesn't know", async () => {
  const { C, K } = await load();
  const grids = {
    2024: ["Red Bull Racing", "Ferrari", "Mercedes", "McLaren", "Aston Martin", "Alpine", "Williams", "RB", "Kick Sauber", "Haas F1 Team"],
    2025: ["Red Bull Racing", "Ferrari", "Mercedes", "McLaren", "Aston Martin", "Alpine", "Williams", "Racing Bulls", "Kick Sauber", "Haas F1 Team"],
    2026: ["Red Bull Racing", "Ferrari", "Mercedes", "McLaren", "Aston Martin", "Alpine", "Williams", "Racing Bulls", "Audi", "Haas F1 Team", "Cadillac"],
  };
  for (const [season, teams] of Object.entries(grids)) for (const team of teams) {
    const st = K.kitStyle(C.liveryFor(team, "888888", +season), K.kitEntry(team, +season));
    for (const k of ["fabric", "back", "palm", "band", "suit", "webbing", "buckle"]) assert.match(st[k], /^#[0-9a-f]{6}$/i, `${season} ${team}: ${k} = ${st[k]}`);
    assert.ok(st.src, `${season} ${team}: no source note`);
  }
  const unk = K.kitStyle(C.liveryFor("Unknown Racing", "3355ff", 2027), K.kitEntry("Unknown Racing", 2027));
  assert.strictEqual(unk.src.startsWith("base rules"), true);
});

test("harness v0.44: six straps and a buckle on the torso as drawn – not buried in it, not floating off it, nothing in the chassis or the HANS collar", async () => {
  const { C, B, G } = await load();
  const CC = await import("../src/renderer/cockpitcheck.js");
  for (const [season, team] of [[2025, "Mercedes"], [2026, "Ferrari"], [2022, "Williams"]]) {
    const car = C.makeCar({ teamName: team, teamColour: "888888", number: 7, season }), torso = named(car, "torso")[0], g = torso.geometry, P = g.attributes.position.array, uv = g.attributes.uv.array, Z = B.KIT_ZONE;
    const body = [], belt = [];
    for (let i = 0; i < P.length; i += 9) { const z = Math.round(uv[(i / 3) * 2] * 16 - 0.5), t = Array.from(P.slice(i, i + 9)); (z === Z.suit ? body : belt).push({ t, z }); }
    assert.ok(belt.length > 400, `${season} ${team}: ${belt.length} harness triangles`);

    const pieces = G.components(belt.map((x) => x.t));
    assert.ok(pieces.length >= 7, `${season} ${team}: ${pieces.length} harness pieces`);   // (6 straps, the buckle with its cap – one piece: they share the axis point)
    for (const pc of pieces) assert.strictEqual(G.openEdges(pc), 0, `${season} ${team}: a harness piece is open`);
    // each torso piece (chest, pelvis, thighs – overlapping solids, judged apart) against every harness vertex
    const solids = G.components(body.map((x) => x.t)).map((tr) => G.solidOf("torso", tr));
    let deepest = 0, far = 0, n = 0;
    const under = new Set();
    for (const { t } of belt) for (let k = 0; k < 9; k += 3) {
      const x = t[k], y = t[k + 1], z = t[k + 2];
      for (const S of solids) deepest = Math.max(deepest, G.insideDepth(S, x, y, z));
      let d = Infinity; for (const S of solids) for (const tt of S.tris) d = Math.min(d, G.triDistance(tt, x, y, z));
      under.add(d); n++; if (d > 0.012) far++;
    }
    assert.ok(deepest < 0.0005, `${season} ${team}: a harness point ${(deepest * 1000).toFixed(1)} mm inside the torso`);
    // (the buckle stands 13 + 5 mm off the belly and the straps bridge the hollow between chest and pelvis a little: most
    // points within 12 mm of the torso's skin – none of it hovering over the shoulders)
    assert.ok(far / n < 0.2, `${season} ${team}: ${(100 * far / n).toFixed(0)} % of the harness more than 12 mm off the torso`);
    // nothing of it in the car's body, the tub, the rim or the head pads / HANS collar – except where a real harness goes
    // into them: behind the shoulders (the shoulder straps through the headrest / seat back to their anchorage on the
    // chassis behind the seat) and at the seat's floor by the hips (the lap straps' anchorages) – there the straps end
    // inside, unseen
    const P0 = car.userData.profile, shoulderZ = P0.helmet[2] - (P0.helmetSize?.[2] ?? 0.155), others = CC.cockpitSolids(car, ["chassis", "rim", "headrest"]);
    let worst = 0, where = null;
    for (const { t } of belt) for (let k = 0; k < 9; k += 3) {
      const x = t[k], y = t[k + 1], z = t[k + 2];
      if (z < shoulderZ + 0.03 || y < 0.2) continue;
      for (const S of others) { const d = G.insideDepth(S, x, y, z); if (d > worst) { worst = d; where = [x, y, z]; } }
    }
    assert.ok(worst < 0.001, `${season} ${team}: a harness point ${(worst * 1000).toFixed(1)} mm inside the car's body or pads at ${where}`);
  }
});
