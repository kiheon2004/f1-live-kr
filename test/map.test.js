// The real map's buildings (v0.14 review): Overture tiles that fail don't take OSM's buildings with them, each
// building is merged with its counterpart only, a building's parts replace its outline only where they cover it, and
// a result with failed tiles isn't kept as if it were complete.
const test = require("node:test");
const assert = require("node:assert");
const overture = require("../src/main/overture.js");
const { mergeBuildings, resolveParts, buildingOf, Scenes } = require("../src/main/scene.js");

// ---------- a minimal vector tile writer (Mapbox Vector Tile 2.1) ----------
const varint = (n) => { const o = []; do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 128; o.push(b); } while (n); return Buffer.from(o); };
const key = (f, w) => varint(f * 8 + w);
const bytes = (f, b) => Buffer.concat([key(f, 2), varint(b.length), b]);
const str = (f, s) => bytes(f, Buffer.from(s, "utf8"));
const zz = (n) => (n << 1) ^ (n >> 31);
function feature(ring, tags) {
  const g = [9, zz(ring[0][0]), zz(ring[0][1]), 2 + ((ring.length - 1) << 3)];
  for (let i = 1; i < ring.length; i++) g.push(zz(ring[i][0] - ring[i - 1][0]), zz(ring[i][1] - ring[i - 1][1]));
  g.push(15);
  return Buffer.concat([bytes(2, Buffer.concat(tags.map(varint))), key(3, 0), varint(3), bytes(4, Buffer.concat(g.map(varint)))]);
}
function tile(layers) {
  return Buffer.concat(layers.map(({ name, features }) => {
    const keys = [], values = [], feats = [];
    for (const { ring, props } of features) {
      const tags = [];
      for (const [k, v] of Object.entries(props)) {
        let ki = keys.indexOf(k); if (ki < 0) { keys.push(k); ki = keys.length - 1; }
        values.push(v); tags.push(ki, values.length - 1);
      }
      feats.push(feature(ring, tags));
    }
    const vals = values.map((v) => (typeof v === "string" ? str(1, v) : Buffer.concat([key(3, 1), (() => { const b = Buffer.alloc(8); b.writeDoubleLE(v); return b; })()])));
    return bytes(3, Buffer.concat([key(15, 0), varint(2), str(1, name), ...feats.map((f) => bytes(2, f)), ...keys.map((k) => str(3, k)), ...vals.map((v) => bytes(4, v)), key(5, 0), varint(4096)]));
  }));
}
// local metres ≈ (lon, lat) scaled: a plain frame for the test
const fr = { toXY: (lat, lon) => [(lon - 11) * 70000, (lat - 44) * 111000] };

test("overture: each tile is ok, empty, failed or damaged; a damaged cached tile is dropped; parts don't erase outlines here", async () => {
  const square = [[1000, 1000], [3000, 1000], [3000, 3000], [1000, 3000], [1000, 1000]];
  const good = tile([{ name: "building", features: [{ ring: square, props: { height: 12, class: "office" } }] }]);
  const forgotten = [];
  let n = 0;
  const pm = {
    async tile(z, x, y) {
      const k = n++ % 4;
      if (k === 0) return good;
      if (k === 1) throw new Error("network down");
      if (k === 2) return null;                                   // no buildings in this tile
      return Buffer.from([0x1a, 0xff, 0xff, 0x7f, 1]);            // a cached tile that's garbage
    },
    forget(z, x, y) { forgotten.push([z, x, y]); },
  };
  const r = await overture.buildings("/nonexistent", [44.344, 11.717], 2500, fr, null, { pm });
  const st = r.tiles.map((t) => t.status);
  for (const s of ["ok", "failed", "empty", "damaged"]) assert.ok(st.includes(s), `a ${s} tile is told apart`);
  assert.strictEqual(r.partial, true);
  assert.ok(r.areas.length > 0 && r.areas.every((a) => a.tile));
  assert.strictEqual(forgotten.length, st.filter((s) => s === "damaged").length, "damaged tiles are dropped from the cache");
  assert.ok(r.tiles.every((t) => t.ring.length === 4), "each tile's area in local metres");
});

const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const B = (pts, tags) => ({ pts, tags: { building: "yes", ...tags } });

test("merge: OSM's buildings stay where Overture has nothing (failed tiles, OSM-only ones), go where Overture has them", () => {
  const osm = [
    B(sq(0, 0, 20, 20), { name: "Pit Building" }),                // Overture has it (no name there): the name moves over
    B(sq(500, 500, 520, 520), { name: "Media Centre" }),          // in a tile that failed: stays
    B(sq(100, 0, 110, 10), { name: "Marshals' Hut" }),            // OSM-only, next to Overture's buildings: stays
    B(sq(200, 0, 260, 30), { building: "grandstand", name: "Main Stand" }),   // a stand: OSM's stays, never replaced
    { pts: sq(0, 50, 50, 90), tags: { landuse: "grass" } },       // not a building: untouched
  ];
  const ob = [
    B(sq(1, 1, 19, 19), { height: "14", source: "overture" }),
    B(sq(120, 0, 130, 10), { height: "5", source: "overture" }),
    B(sq(205, 2, 255, 28), { building: "yes", height: "12", source: "overture" }),   // the stand as a plain block
  ];
  const out = mergeBuildings(osm, ob);
  const names = out.filter((a) => a.tags.building).map((a) => a.tags.name || "(overture)");
  assert.ok(names.includes("Media Centre") && names.includes("Marshals' Hut") && names.includes("Main Stand"));
  assert.strictEqual(out.filter((a) => a.tags.name === "Pit Building").length, 1, "one pit building, not two");
  assert.strictEqual(out.find((a) => a.tags.name === "Pit Building").tags.source, "overture", "Overture's shape with OSM's name");
  assert.ok(!out.some((a) => a.tags.source === "overture" && a.pts[0][0] === 205), "a plain block isn't drawn in the stand");
  assert.ok(out.some((a) => a.tags.landuse === "grass"));
});

test("parts: they replace the outline only where they cover it; a part inside a kept outline doesn't fight its walls", () => {
  // a 60 × 40 m hall with one 10 × 10 m tower part (14 % of it): the hall stays, the tower rises out of its roof
  const hall = B(sq(0, 0, 60, 40), { height: "10" });
  const tower = { pts: sq(5, 5, 15, 15), tags: { "building:part": "yes", height: "30" } };
  const low = { pts: sq(30, 10, 40, 20), tags: { "building:part": "yes", height: "6" } };     // inside the hall's volume
  const r = resolveParts([hall, tower, low]);
  assert.ok(!r.drop.has(hall), "the hall isn't left out for one small part");
  assert.strictEqual(r.minOf.get(tower), 10, "the tower starts at the hall's roof (no walls in walls)");
  assert.ok(r.drop.has(low), "a part hidden inside the hall isn't drawn into its walls");
  // parts covering the whole outline stand in for it
  const parts = [sq(0, 0, 30, 40), sq(30, 0, 60, 40)].map((p, i) => ({ pts: p, tags: { "building:part": "yes", height: String(10 + i * 5) } }));
  const r2 = resolveParts([hall, ...parts]);
  assert.ok(r2.drop.has(hall)); assert.ok(!parts.some((p) => r2.drop.has(p)));
  // a stand's outline is never replaced by parts (its seats are built from it)
  const stand = B(sq(0, 100, 60, 140), { building: "grandstand" });
  const r3 = resolveParts([stand, { pts: sq(0, 100, 60, 140), tags: { "building:part": "roof", height: "15", min_height: "10" } }]);
  assert.ok(!r3.drop.has(stand));
});

test("scene cache: a result with failed building tiles isn't kept as if it were complete – the next build tries again", async () => {
  const s = new Scenes("/nonexistent");
  let made = 0;
  s.make = async () => { made++; return { ok: true, buildingsPartial: 2 }; };
  const lap = [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0]];
  await s.build("Imola", lap); await s.build("Imola", lap);
  assert.strictEqual(made, 2);
  s.make = async () => { made++; return { ok: true }; };
  await s.build("Imola", lap); await s.build("Imola", lap);
  assert.strictEqual(made, 3, "a complete result is reused");
});

// v0.14 optimisation review: an Overture building on the spot replaces OSM's only when it covers most of it (measured
// on 28 circuits: ~99.6 % of the replaced are covered 80 %+); a small one inside a big hall doesn't take the hall – or
// its name; a stand mapped only as an area keeps Overture's block out too; a roof part on top of a body of known height
// doesn't replace the body.
test("merge: a small Overture building inside a big OSM one doesn't replace it – by how much of it Overture covers", () => {
  const main = () => B(sq(0, 0, 100, 100), { name: "Main", height: "8" });
  // 1 % (a 10 × 10 m shed in the middle): the hall stays, the shed (no taller, inside it) adds nothing and goes
  let out = mergeBuildings([main()], [B(sq(45, 45, 55, 55), { height: "6" })]);
  assert.deepStrictEqual(out.map((a) => [a.tags.name ?? null, a.pts[2][0]]), [["Main", 100]]);
  // the same but taller (a tower Overture has): both stay – and it doesn't take the hall's name
  out = mergeBuildings([main()], [B(sq(45, 45, 55, 55), { height: "30" })]);
  assert.strictEqual(out.length, 2); assert.strictEqual(out.find((a) => a.pts[2][0] === 55).tags.name, undefined);
  // 30 %: still OSM's hall
  out = mergeBuildings([main()], [B(sq(20, 20, 75, 75), { height: "8" })]);
  assert.ok(out.some((a) => a.tags.name === "Main" && a.pts[2][0] === 100));
  // 90 %: Overture's (the same building traced a little differently), with OSM's name
  out = mergeBuildings([main()], [B(sq(2, 2, 97, 97), { height: "9" })]);
  assert.deepStrictEqual(out.map((a) => [a.tags.name, a.pts[2][0]]), [["Main", 97]]);
  // cut in two by a tile edge, both pieces there: together they're the building, both named
  out = mergeBuildings([main()], [B(sq(0, 0, 50, 100), {}), B(sq(50, 0, 100, 100), {})]);
  assert.deepStrictEqual(out.map((a) => a.tags.name), ["Main", "Main"]); assert.ok(out.every((a) => a.pts[2][0] !== 100 || a.pts[0][0] === 50));
  // only one piece came (the other tile failed): the hall stays whole, the piece inside it isn't drawn twice
  out = mergeBuildings([main()], [B(sq(0, 0, 50, 100), {})]);
  assert.deepStrictEqual(out.map((a) => [a.tags.name, a.pts[2][0]]), [["Main", 100]]);
  // an annex beside the hall, its centre outside: nothing to do with it
  out = mergeBuildings([main()], [B(sq(100, 40, 110, 60), {})]);
  assert.strictEqual(out.length, 2); assert.strictEqual(out[1].tags.name, undefined);
  // a stadium's area (not a building) names the buildings in it, as before
  out = mergeBuildings([{ pts: sq(-50, -50, 150, 150), tags: { leisure: "stadium", name: "Stadio" } }], [B(sq(10, 10, 20, 20), {})]);
  assert.strictEqual(out[1].tags.name, "Stadio");
});

test("merge: a stand mapped only as an area (leisure=grandstand) keeps Overture's block off it, as a building stand does", () => {
  const out = mergeBuildings([{ pts: sq(0, 0, 50, 20), tags: { leisure: "grandstand" } }], [B(sq(2, 2, 48, 18), { name: "Stand A" })]);
  assert.strictEqual(out.length, 1, "no block drawn in the stand");
  assert.deepStrictEqual(out[0].tags, { leisure: "grandstand", name: "Stand A" }, "the stand's, with the block's name");
});

test("parts: a roof or canopy part on top of a body of known height doesn't replace the body under it", () => {
  const body = B(sq(0, 0, 20, 20), { height: "10" });
  const roof = { pts: sq(0, 0, 20, 20), tags: { "building:part": "roof", min_height: "10", height: "12" } };
  let r = resolveParts([body, roof]);
  assert.ok(!r.drop.has(body) && !r.drop.has(roof), "the body stays, the roof sits on it");
  // a canopy high over part of a 4 m building, and a link at 6–8 m over a 6 m one: the same
  const shed = B(sq(0, 0, 20, 20), { height: "4" }), canopy = { pts: sq(0, 0, 20, 15), tags: { "building:part": "yes", min_height: "8", height: "9" } };
  r = resolveParts([shed, canopy]); assert.ok(!r.drop.has(shed) && !r.drop.has(canopy));
  // a podium (30 m) with towers from its roof up covering 40 % of it: the podium stays, the towers on it
  const podium = B(sq(0, 0, 100, 50), { height: "30" });
  const towers = [sq(0, 0, 20, 50), sq(60, 0, 80, 50)].map((p) => ({ pts: p, tags: { "building:part": "yes", min_height: "30", height: "180" } }));
  r = resolveParts([podium, ...towers]); assert.ok(!r.drop.has(podium) && towers.every((t) => !r.drop.has(t) && !r.minOf.has(t)));
  // parts from the ground up covering it still stand in for it – also with a roof part on top
  const lower = { pts: sq(0, 0, 20, 20), tags: { "building:part": "yes", height: "10" } };
  r = resolveParts([body, lower, roof]); assert.ok(r.drop.has(body) && !r.drop.has(lower) && !r.drop.has(roof));
  // the body's height a guess (no tag): what's on top can't be told from the body – the parts stand in, as before
  const guess = B(sq(0, 0, 20, 20), {});
  r = resolveParts([guess, { pts: sq(0, 0, 20, 20), tags: { "building:part": "yes", min_height: "10", height: "12" } }]);
  assert.ok(r.drop.has(guess));
  // 45 / 55 % covered by parts from the ground: kept / replaced (half is the line; measured on a 14 × 14 grid)
  for (const [x, drop] of [[9, false], [11, true]]) {
    r = resolveParts([body, { pts: sq(0, 0, x, 20), tags: { "building:part": "yes", height: "10" } }]);
    assert.strictEqual(r.drop.has(body), drop, `${x * 5} %`);
  }
});

// v0.15 review: OSM's height is to the top of the roof, roof:height the roof's own – a roof part starting where the
// walls stop (under the very top) is the roof, not a building over the body; the body is drawn up to it, flat, and the
// part stays (not two roofs in each other). Real parts from the ground still stand in for the body.
test("parts: a roof part from under the very top (height includes the roof) is the body's roof – the body stays, walls up to it", () => {
  const body = B(sq(0, 0, 100, 100), { height: "12", "roof:height": "2" });
  const roof = { pts: sq(0, 0, 100, 100), tags: { "building:part": "roof", min_height: "10", height: "12", "roof:shape": "gabled" } };
  let r = resolveParts([body, roof]);
  assert.ok(!r.drop.has(body) && !r.drop.has(roof), "both drawn");
  assert.strictEqual(r.topOf.get(body), 10, "the body's walls stop where the roof part starts");
  // what the renderer gets: the body to 10 m, flat (its own roof is the part), height known; the roof from 10 to 12
  const b = buildingOf(body, r), p = buildingOf(roof, r);
  assert.deepStrictEqual([b.h, b.min, b.roof, b.rh, b.est], [10, 0, "flat", null, 0]);
  assert.deepStrictEqual([p.h, p.min, p.roof], [12, 10, "gabled"]);
  // a pitched roof without roof:height: the same (any part starting over the ground and under the top that is a roof)
  const pitched = B(sq(0, 0, 100, 100), { height: "12", "roof:shape": "gabled" });
  r = resolveParts([pitched, roof]); assert.ok(!r.drop.has(pitched) && r.topOf.get(pitched) === 10);
  // a roof part without a min_height (starting at the ground by its tags): never the building – the body stays, the
  // part inside it isn't drawn into its walls
  const flatRoof = { pts: sq(0, 0, 100, 100), tags: { "building:part": "roof", height: "12" } };
  r = resolveParts([body, flatRoof]); assert.ok(!r.drop.has(body) && r.drop.has(flatRoof) && !r.topOf.has(body));
  // a canopy part high up on 60 % of it: the same
  const canopy = { pts: sq(0, 0, 60, 100), tags: { "building:part": "canopy", min_height: "10", height: "11" } };
  r = resolveParts([body, canopy]); assert.ok(!r.drop.has(body) && !r.drop.has(canopy) && r.topOf.get(body) === 10);
  // a real part from the ground covering it, with the roof part on top: the parts stand in for the body, as before
  const lower = { pts: sq(0, 0, 100, 100), tags: { "building:part": "yes", height: "10" } };
  r = resolveParts([body, lower, roof]); assert.ok(r.drop.has(body) && !r.drop.has(lower) && !r.drop.has(roof));
  // roof:height that can't be (as tall as the building, or none): the walls taken to the top – a part from 10 m on a
  // 12 m body is then inside its roof space, and still the roof, not a building in its place
  for (const rh of ["12", "15", "0", "x"]) {
    const odd = B(sq(0, 0, 100, 100), { height: "12", "roof:height": rh });
    r = resolveParts([odd, roof]); assert.ok(!r.drop.has(odd), `roof:height ${rh}: the body stays`);
  }
  // the body's height unknown: a roof part (tagged so) doesn't replace it; its walls go up to where the roof starts
  const guess = B(sq(0, 0, 100, 100), {});
  r = resolveParts([guess, roof]); assert.ok(!r.drop.has(guess) && r.topOf.get(guess) === 10);
  assert.deepStrictEqual([buildingOf(guess, r).h, buildingOf(guess, r).est], [10, 0], "the walls from the roof, not a guess");
  // a roof part on less than half of it: the body keeps its own roof; the part inside the body's roof space isn't drawn
  const small = { pts: sq(0, 0, 30, 100), tags: { "building:part": "roof", min_height: "10", height: "12" } };
  r = resolveParts([body, small]); assert.ok(!r.drop.has(body) && !r.topOf.has(body) && r.drop.has(small));
  // a tower part rising out of a body under roof parts starts at the walls' top
  const tower = { pts: sq(80, 80, 95, 95), tags: { "building:part": "yes", height: "40" } };
  r = resolveParts([body, roof, tower]); assert.ok(r.topOf.get(body) === 10 && r.minOf.get(tower) === 10 && !r.drop.has(tower));
});

// v0.15 review: an Overture building inside a kept OSM one goes only when it's the same building a little off – no
// more than a sliver (1 m) outside; an annex reaching out of it is drawn (its part outside is nobody else's).
test("merge: an annex reaching out of the OSM building it's mostly inside is kept; the same building a little off isn't drawn twice", () => {
  const main = B(sq(0, 0, 100, 100), { height: "10" });
  const annex = B(sq(82, 40, 102, 50), { height: "8", name: "Annex" });   // 90 % inside, 2 m out
  let out = mergeBuildings([main], [annex]);
  assert.ok(out.includes(main) && out.includes(annex), "both: the annex's 2 m outside is only its own");
  // the same building a little off (all 83 absorbed over 28 circuits reach out under 1 m): one only
  const hall = B(sq(0, 0, 100, 100), { height: "10" }), shed = B(sq(60.5, -0.6, 80, 20), { height: "6", name: "Shed" });
  out = mergeBuildings([hall], [shed]);
  assert.ok(out.includes(hall) && !out.includes(shed), "a shed 0.6 m over the hall's edge is the hall's");
  assert.strictEqual(hall.tags.name, "Shed", "its name goes to the hall that had none");
  // reaching out 1.5 m: kept
  const shed2 = B(sq(60, -1.5, 80, 20), { height: "6" });
  out = mergeBuildings([B(sq(0, 0, 100, 100), { height: "10" })], [shed2]);
  assert.ok(out.includes(shed2));
  // an Overture building bridging a notch of a U-shaped OSM building (all its corners inside): the notch is outside
  const U = B([[0, 0], [100, 0], [100, 100], [60, 100], [60, 40], [40, 40], [40, 100], [0, 100]], { height: "10" });
  const bridge = B(sq(10, 50, 90, 70), { height: "6" });
  out = mergeBuildings([U], [bridge]);
  assert.ok(out.includes(bridge), "the part over the notch is its own");
});

// v0.15 review: coverage is the exact area (the plan cut into strips), not a 10 × 10 grid of points – which counted a
// 55.1 %-covered building as 60 % and replaced it (14 such decisions over 28 circuits, both ways).
test("merge: the 60 % rule on exact areas – 55.1 % stays, 61 % goes, wherever the shapes sit", () => {
  const run = (ow, shift = 0) => { const osm = B(sq(shift, 0, 100 + shift, 100), {}); return mergeBuildings([osm], [B(sq(shift, 0, ow + shift, 100), {})]).includes(osm); };
  for (const [w, kept] of [[55.1, true], [59, true], [59.9, true], [60.1, false], [61, false], [65, false]]) {
    for (const shift of [0, 1, 2.5, 7, 13.3]) assert.strictEqual(run(w, shift), kept, `${w} % (moved ${shift} m)`);
  }
  // a thin L (two arms 8 m wide, 1,536 m²): covered by one arm (800 m², 52 %) – stays; by both – goes
  const L = B([[0, 0], [100, 0], [100, 8], [8, 8], [8, 100], [0, 100]], {});
  assert.ok(mergeBuildings([L], [B(sq(0, 0, 100, 8), {})]).includes(L), "one arm: 52 %");
  assert.ok(!mergeBuildings([L], [B(sq(0, 0, 100, 8), {}), B(sq(0, 8, 8, 100), {})]).includes(L), "both arms");
  // overlapping Overture pieces count once (their union): 35 % and 35 % overlapping by 30 % cover 40 %, not 70 %
  const o = B(sq(0, 0, 100, 100), {});
  assert.ok(mergeBuildings([o], [B(sq(0, 0, 35, 100), {}), B(sq(5, 0, 40, 100), {})]).includes(o), "40 %: stays");
  assert.ok(!mergeBuildings([o], [B(sq(0, 0, 35, 100), {}), B(sq(30, 0, 65, 100), {})]).includes(o), "65 %: goes");
});
