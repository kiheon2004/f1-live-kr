// v0.53 (the user's §9): Monaco's teams' pit wall is upstairs – in the first-floor room over the garages (Red Bull 2021:
// "built inside, directly above the garage"; Williams 2023: the first floor "shared with the pit wall gantry"). v0.36–
// v0.52 drew a free deck 3.4 m up in front of the garages' openings, under the building's first floor, with nothing under
// or behind it: "the pit wall looks like it floats in the air". Now the building has the room (facilities.js upperRoom:
// its slab on the openings' top, cantilevered over the lane, glazed, a back wall and a ceiling) and the stands stand in
// it (wallAt → room, garages.js upperStandLayout). These check the geometry as built, not a description of it.
const test = require("node:test");
const assert = require("node:assert");

// (no canvas in node: a 2D context that draws nothing – the label atlas, the screens and the facades' textures)
function stubDocument() {
  if (globalThis.document) return;
  const ctx = new Proxy({}, { get: (_, k) => (k === "createLinearGradient" ? () => ({ addColorStop() {} }) : k === "measureText" ? () => ({ width: 10 }) : k === "getImageData" ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}), set: () => true });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) };
}

// a lane along +x (the measured pit path, in decimetres → scene metres), the straight 27 m to the cars' right (z = −27),
// the swimming pool's tarmac 9 m to their left – as the earlier Monaco layout tests (facilities.test.js)
const pit = { path: [[0, 0], [1000, 0], [2000, 0], [3000, 0]], limitOn: 0, limitOff: 300 };
const toScene = ([X, Y]) => [X / 10, Y / 10];
const edge = (x, z) => Math.min(Math.abs(z + 27), Math.abs(z - 9)) - 0.5;
// (bent: the lane curving 6 m off its chord over 300 m and the ground falling 1 in 100 – as the measured lane does a little:
// the garages' front bends from one garage to the next, the floor slopes under a stand)
const bentPit = { path: [0, 500, 1000, 1500, 2000, 2500, 3000].map((X) => [X, 60 * Math.sin((Math.PI * X) / 3000)]), limitOn: 0, limitOff: 300 };
const bentEdge = (x, z) => { const c = 6 * Math.sin((Math.PI * x) / 300); return Math.min(Math.abs(z - c + 27), Math.abs(z - c - 9)) - 0.5; };
async function monaco(key = 22, bent = false) {
  const F = await import("../src/renderer/facilities.js");
  const toTrack = () => [0, -1], edge0 = bent ? bentEdge : edge;
  const spec = F.genericPitSpec({ venue: { key }, location: "Monte Carlo", year: 2025, pit: bent ? bentPit : pit, toScene, toTrack, trackEdge: edge0, registry: [] });
  const r = await F.buildFacilities({ scene: { location: "Monte Carlo", buildings: [] }, gf: { xz: ([x, y]) => [x, -y] }, groundAt: bent ? (x) => -0.01 * x : () => 0, trackEdge: edge0, location: "Monte Carlo", year: 2025, toTrack, registry: [spec] });
  return { F, spec, group: r.group, G: r.group.children[0].userData.garages };
}
const named = (group, name) => { const out = []; group.traverse((o) => { if (o.isMesh && o.name === name) out.push(o); }); return out; };

test("Monaco: the first-floor room – its slab on the garages' openings, cantilevered over the lane, glazed, closed behind and above", async () => {
  const { G, group } = await monaco(), THREE = await import("../src/renderer/vendor/three.module.js");
  assert.ok(G.upperRoom, "a room upstairs");
  assert.strictEqual(G.top, 4.0, "the garage storey (estimate from the photos)");
  group.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(), first = (o, d, far = 10) => { rc.set(o, d); rc.far = far; const h = rc.intersectObject(group, true).filter((x) => x.object.isMesh)[0]; return h ? [h.object.name, +h.distance.toFixed(3)] : null; };
  const some = G.slots.filter((_, k) => k % 7 === 3); assert.ok(some.length >= 3, `garages to look at: ${some.length}`);
  for (const s of some) {
    const r = G.upperRoom(s.uc), out = [-s.inward[0], -s.inward[1]];
    const at = (d, y) => new THREE.Vector3(s.front[0] + out[0] * d, y, s.front[1] + out[1] * d);
    // the slab's underside: right on the openings' top (the garage storey's height over the same floor) – no gap
    assert.ok(Math.abs(r.under - (s.floor + G.top)) < 1e-6, `slab on the openings: ${r.under} vs ${s.floor + G.top}`);
    // from the lane 0.5 m out, straight up: the slab's soffit at the openings' top
    const up = first(at(0.5, s.floor + 1), new THREE.Vector3(0, 1, 0));
    assert.deepStrictEqual(up && up[0], "slab"); assert.ok(Math.abs(up[1] - (G.top - 1)) < 0.01, JSON.stringify(up));
    // in the room (1 m behind the garages' front, 1 m over its floor): the floor under, the ceiling over, the glazing out
    const c = at(-1, r.floor + 1);
    assert.deepStrictEqual(first(c, new THREE.Vector3(0, -1, 0)), ["garFloor", 0.99]);
    const ce = first(c, new THREE.Vector3(0, 1, 0)); assert.strictEqual(ce[0], "garCeil"); assert.ok(Math.abs(ce[1] - (r.ceil - r.floor - 1)) < 0.01);
    const gl = first(c, new THREE.Vector3(out[0], 0, out[1])); assert.strictEqual(gl[0], "roomGlass"); assert.ok(Math.abs(gl[1] - (1 + r.glass)) < 0.01, JSON.stringify(gl));
    const bk = first(c, new THREE.Vector3(-out[0], 0, -out[1])); assert.strictEqual(bk[0], "garPanel"); assert.ok(Math.abs(bk[1] - (-1 - r.back)) < 0.01, JSON.stringify(bk));
    // over the room's slab, the second floor's facade from the slab's top (not through the room)
    const fc = first(at(0.5, r.ceil + 0.6), new THREE.Vector3(-out[0], 0, -out[1])); assert.ok(fc && /^facade:monacoPit$/.test(fc[0]) && Math.abs(fc[1] - 0.5) < 0.01, JSON.stringify(fc));
    // the balcony: its slab over the lane past the glazing, a railing on its edge
    const bal = first(at(r.balcony - 0.2, r.ceil - 1), new THREE.Vector3(0, 1, 0)); assert.ok(bal && bal[0] === "slab" && Math.abs(bal[1] - 1) < 0.01, JSON.stringify(bal));
  }
});

test("Monaco: each team's stand stands in the room – on its floor, the people on it, inside the glazing, under the ceiling", async () => {
  stubDocument();
  for (const bent of [false, true]) {
  const { G } = await monaco(22, bent), Gar = await import("../src/renderer/garages.js"), { upperStandCheck } = await import("../src/renderer/pitwallcheck.js");
  const names = ["McLaren", "Ferrari", "Red Bull Racing", "Mercedes", "Aston Martin", "Alpine", "Haas F1 Team", "Racing Bulls", "Williams", "Kick Sauber"];
  const colours = ["#ff8000", "#e8002d", "#3671c6", "#27f4d2", "#229971", "#0093cc", "#b6babd", "#6692ff", "#64c4ff", "#52e252"];
  // (boxes along the run, the first and the last at its very ends: a stand is kept inside the room end to end)
  const n = G.slots.length, teams = names.map((team, i) => { const k = Math.min(n - 1, Math.round((i * (n - 1)) / 9)); return { team, colour: colours[i], slots: [k], drivers: [{ num: String(i + 1), tla: "D" + i, slot: k }], box: i === 0 ? G.gStart : i === 9 ? G.gEnd : G.slots[k].uc, boxOff: 3 }; });
  const layer = Gar.teamLayer(G, teams, null, 2025, { kit: true });
  const built = layer.userData.wallStands;
  assert.strictEqual(built.length, 10);
  for (const st of built) {
    assert.ok(st.upper && st.room, `${st.team}: in a room`);
    const r = upperStandCheck(st, G.upperRoom, G.project);
    assert.ok(r.ok, (bent ? "bent: " : "") + r.problems.join("; "));
    // the people's feet on the room's floor (to the millimetre), facing the lane
    // (bent: the floor is straight between the building's stations, a stand straight over its length – within 1 cm)
    for (const [x, y, z] of st.people) { const d = y - G.upperRoom(G.project(x, z).u).floor; assert.ok(Math.abs(d) < (bent ? 0.01 : 1e-3), `${st.team}: a person ${d.toFixed(4)} m off the floor`); }
  }
  // v0.52's stand as it stood (3.4 m over the garages' floor, 0.05–1.65 m out, 0.4 m under the openings' top): found
  { const st = built[3], pr = G.project(st.p[0], st.p[1]), fl = G.upperRoom(pr.u).floor - G.top - 0.3, old = { ...st, y: fl + 3.4, people: st.people.map(([x, , z]) => [x, fl + 3.4, z]), room: { ...st.room, glass: 0.75 }, span: [-0.75, 0.85] };
    const r = upperStandCheck(old, G.upperRoom, G.project); assert.ok(!r.ok && r.problems.some((q) => /off the room's floor/.test(q)) && r.problems.some((q) => /a person/.test(q)), r.problems.join("; ")); }
  // no railing opened for them (that is the walkway's, at the wall: none here) – and no canopy over a stand in a room
  assert.deepStrictEqual(layer.userData.standSpans, []);
  assert.ok(layer.userData.covers.every((c) => c.kind === "pit wall room"));
  if (bent) assert.ok(built.some((st) => Math.abs(st.slope) > 0.005), "the floor slopes under them");
  }
});

test("Monaco's room is Monaco's: other venues' pit walls keep their stands between the lane and the track", async () => {
  const F = await import("../src/renderer/facilities.js");
  for (const [key, v] of Object.entries(F.PIT_LOOKS)) if (+key !== 22) assert.ok(!v.upperRoom, `venue ${key}: no room upstairs`);
  for (const [key, v] of Object.entries(F.PIT_LAYOUTS)) assert.strictEqual(v.pitWall.stands === "upper", +key === 22);
  // a venue without a layout: a pit wall at the track's edge, stands on its walkway – not upstairs, no room
  const spec = F.genericPitSpec({ venue: { key: 2 }, location: "Silverstone", year: 2025, pit, toScene, toTrack: () => [0, -1], trackEdge: (x, z) => z + 40, registry: [] });
  assert.ok(!spec.params.upperRoom);
  const r = await F.buildFacilities({ scene: { location: "Silverstone", buildings: [] }, gf: { xz: ([x, y]) => [x, -y] }, groundAt: () => 0, trackEdge: (x, z) => z + 40, location: "Silverstone", year: 2025, toTrack: () => [0, -1], registry: [spec] });
  const G = r.group.children[0].userData.garages;
  assert.ok(G?.wallAt, "a pit wall with stands");
  { const w = G.wallAt((G.gStart + G.gEnd) / 2, 2.7); assert.ok(w && !w.upper && !w.room); assert.ok(G.project(w.p[0], w.p[2]).off > 5, "out at the wall"); }
  assert.ok(!G || !G.upperRoom);
});

test("Monaco without a room (a layout with stands upstairs but no upperRoom): no stand at all, rather than one in the air", async () => {
  const F = await import("../src/renderer/facilities.js");
  const save = F.PIT_LOOKS[22]; const lay = { ...save }; delete lay.upperRoom;
  F.PIT_LOOKS[22] = lay;
  try { const { G } = await monaco(); assert.ok(!G.upperRoom); assert.strictEqual(G.wallAt?.(G.slots[3].uc, 2.7) ?? null, null); } finally { F.PIT_LOOKS[22] = save; }
});
