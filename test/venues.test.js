// Venues apart from Grand Prix names (venues.js): what the 3D world puts where is chosen by F1's circuit key of the
// session (2026's "Bahrain Grand Prix" ran at Sepang; Barcelona and Madring are two venues), with the Location as the
// fallback; the 2026 status covers every venue of the season; references keep their dates and licences.
const test = require("node:test");
const assert = require("node:assert");

test("venues: the circuit key decides, not the Grand Prix's name; Location only as a fallback", async () => {
  const { venueOf, entryAt } = await import("../src/renderer/venues.js");
  // as in the data: 2026 round 16 "Bahrain Grand Prix", Location "Kuala Lumpur", Circuit 12; 2025's at Sakhir (63)
  assert.strictEqual(venueOf({ circuitKey: 12, location: "Kuala Lumpur" }).short, "Kuala Lumpur");
  assert.strictEqual(venueOf({ circuitKey: 63, location: "Sakhir" }).key, 63);
  assert.strictEqual(venueOf({ location: "Bahrain" }).key, 63, "pre-season testing's Location");
  assert.strictEqual(venueOf({ circuitKey: 153, location: "Madrid" }).short, "Madring");
  assert.strictEqual(venueOf({ circuitKey: 15, location: "Barcelona" }).short, "Catalunya");
  assert.strictEqual(venueOf({ location: "Madrid" }).key, 153);
  assert.strictEqual(venueOf({ circuitKey: 999, location: "Somewhere" }).key, 999, "an unknown key still tells the venue apart");
  assert.strictEqual(venueOf({ location: "Nowhere" }), null);
  // a Sakhir entry is never placed at Sepang – whatever the Grand Prix is called
  const sakhir = { venue: [63], loc: ["Sakhir", "Bahrain"] }, byName = { loc: ["Sakhir", "Bahrain"] };
  assert.strictEqual(entryAt(sakhir, venueOf({ circuitKey: 12, location: "Kuala Lumpur" }), "Kuala Lumpur"), false);
  assert.strictEqual(entryAt(sakhir, venueOf({ circuitKey: 63, location: "Sakhir" }), "Sakhir"), true);
  // an entry known only by Location: at a venue known by key whose Locations don't include it, no
  assert.strictEqual(entryAt(byName, venueOf({ circuitKey: 12 }), "Bahrain"), false);
  assert.strictEqual(entryAt(byName, venueOf({ circuitKey: 63 }), "Bahrain"), true);
  assert.strictEqual(entryAt(byName, null, "Sakhir"), true, "no venue known: by Location as before");
  assert.strictEqual(entryAt(sakhir, null, "Sakhir"), true, "an entry with keys, no venue known: by its Locations");
  assert.strictEqual(entryAt(sakhir, null, "Kuala Lumpur"), false);
  // Barcelona's entries never at Madring and back
  const cat = { venue: [15], loc: ["Barcelona"] };
  assert.strictEqual(entryAt(cat, venueOf({ circuitKey: 153, location: "Madrid" }), "Madrid"), false);
  assert.strictEqual(entryAt(cat, venueOf({ circuitKey: 15, location: "Barcelona" }), "Barcelona"), true);
});

test("venues: the 2026 status lists every venue of the season once; facilities named there exist; references keep dates and licences", async () => {
  const { STATUS_2026, REFERENCES, VENUES } = await import("../src/renderer/venues.js"), { FACILITIES } = await import("../src/renderer/facilities.js");
  const season = [10, 49, 46, 151, 23, 22, 15, 19, 2, 7, 4, 55, 39, 153, 144, 12, 61, 9, 65, 14, 152, 150, 70];
  assert.deepStrictEqual(STATUS_2026.map((s) => s.key).sort((a, b) => a - b), season.slice().sort((a, b) => a - b));
  for (const s of STATUS_2026) {
    assert.ok(VENUES[s.key], `venue ${s.key} known`);
    assert.ok(["verified", "partial", "historical", "missing", "unconfirmed"].includes(s.state), s.note);
    for (const id of s.facility || []) {
      const f = FACILITIES.find((x) => x.id === id);
      assert.ok(f, `${id} registered`);
      assert.ok(f.venue?.includes(s.key), `${id} at venue ${s.key}`);
      assert.strictEqual(s.state === "verified", f.status === "permanent", `${id}: verified ↔ permanent`);
    }
  }
  for (const r of REFERENCES) {
    assert.ok(r.page && r.licence && r.use && r.kind, r.id);
    assert.ok("taken" in r && "published" in r, `${r.id}: dates recorded (null when not stated)`);
    // nothing all-rights-reserved is drawn or shipped
    if (/all rights reserved|not readable/i.test(r.licence)) assert.ok(["compared", "checked", "not used"].includes(r.use), r.id);
  }
});

test("venues: the facilities chosen by venue and year – Hungaroring's 2025 building from 2025 on, never at another venue", async () => {
  const F = await import("../src/renderer/facilities.js"), { venueOf } = await import("../src/renderer/venues.js");
  const gf = { fromLL: () => [0, 0], xz: (p) => p };
  const run = async (year, venue, location) => (await F.buildFacilities({ scene: { buildings: [] }, gf, groundAt: () => 0, location, venue, year, toTrack: () => [1, 0], trial: true }))?.info || [];
  const hun = (info) => info.find((i) => i.id === "hungaroring-paddock-2025");
  // chosen at the Hungaroring from 2025 (here without map data: it falls back to the map's buildings, no gap)
  assert.strictEqual(hun(await run(2026, venueOf({ circuitKey: 4, location: "Budapest" }), "Budapest")).how, "fallback");
  assert.strictEqual(hun(await run(2024, venueOf({ circuitKey: 4, location: "Budapest" }), "Budapest")).reason, "year");
  assert.strictEqual(hun(await run(2026, null, "Budapest")).how, "fallback", "Location only: still found");
  assert.strictEqual(hun(await run(2026, venueOf({ circuitKey: 12, location: "Kuala Lumpur" }), "Kuala Lumpur")), undefined);
  // 2026's 'Bahrain Grand Prix' at Sepang picks nothing registered for Sakhir or anywhere else
  assert.deepStrictEqual(await run(2026, venueOf({ circuitKey: 12, location: "Kuala Lumpur" }), "Kuala Lumpur"), []);
});

// v0.35: 2026 active aero is an estimate (the feed has no channel for it) and never opens where the FIA locked the cars
// in corner mode for the weekend – Monaco 2026; other circuits and other seasons aren't locked by this list.
test("2026 active aero: locked at Monaco 2026 only", async () => {
  const { aeroLocked, venueOf } = await import("../src/renderer/venues.js");
  const monaco = venueOf({ location: "Monte Carlo" })?.key;
  assert.strictEqual(monaco, 22);
  assert.ok(aeroLocked(monaco, 2026));
  assert.ok(!aeroLocked(monaco, 2025) && !aeroLocked(monaco, 2027));
  assert.ok(!aeroLocked(venueOf({ location: "Monza" })?.key, 2026));
});
