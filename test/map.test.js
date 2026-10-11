// The real map's buildings (v0.14 review): Overture tiles that fail don't take OSM's buildings with them, each
// building is merged with its counterpart only, a building's parts replace its outline only where they cover it, and
// a result with failed tiles isn't kept as if it were complete.
const test = require("node:test");
const assert = require("node:assert");
const overture = require("../src/main/overture.js");
const { mergeBuildings, resolveParts, Scenes } = require("../src/main/scene.js");

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
