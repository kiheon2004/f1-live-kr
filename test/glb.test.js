// Facility model files (v0.14 review; no real GLB ships yet – these use generated fixtures): the file is checked before
// it's decoded (structure, version, what it would take decoded, static models only); a turned model's footprint is
// its own outline, not its world box; models in use by a world or a build in progress are never freed under them; an
// old failed load doesn't remove a newer one.
const test = require("node:test");
const assert = require("node:assert");
const { boxGlb } = require("./glb.js");

const load = () => import("../src/renderer/facilities.js");
const LAT0 = 52, LON0 = -1, M_LAT = 111320, M_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const gf = { xz: ([X, Y]) => [X, -Y], fromLL: (lat, lon) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT], toLL: (x, z) => [LAT0 - z / M_LAT, LON0 + x / M_LON] };
// a GLB's JSON chunk replaced (same binary chunk)
function withJson(glb, edit) {
  const jlen = glb.readUInt32LE(12), json = JSON.parse(glb.subarray(20, 20 + jlen).toString()), bin = glb.subarray(20 + jlen);
  edit(json);
  let jb = Buffer.from(JSON.stringify(json)); jb = Buffer.concat([jb, Buffer.alloc((4 - (jb.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(20); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + jb.length + bin.length, 8); head.writeUInt32LE(jb.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, jb, bin]);
}

test("GLB check: the container, the JSON, the version and what it takes decoded – before anything is decoded", async () => {
  const F = await load();
  const ok = boxGlb({ texture: true });
  assert.strictEqual(F.checkGlb(ok), null);
  const bad = (b) => F.checkGlb(b) || "";
  const len = Buffer.from(ok); len.writeUInt32LE(ok.length + 8, 8);
  assert.match(bad(len), /length/, "the header's total length must be the file's");
  const odd = Buffer.from(ok); odd.writeUInt32LE(odd.readUInt32LE(12) + 1, 12);
  assert.match(bad(odd), /align|chunk/, "chunks are 4-byte aligned and inside the file");
  assert.match(bad(withJson(ok, (j) => { delete j.asset; })), /asset|version/);
  assert.match(bad(withJson(ok, (j) => { j.asset.version = "1.0"; })), /version/);
  assert.match(bad(withJson(ok, (j) => { j.skins = [{ joints: [0] }]; })), /skinned|static/, "static models only");
  assert.match(bad(withJson(ok, (j) => { j.extensionsRequired = ["KHR_draco_mesh_compression"]; j.extensionsUsed = ["KHR_draco_mesh_compression"]; })), /decoder|compress/);
  assert.match(bad(withJson(ok, (j) => { j.accessors[0].count = 1e6; })), /bufferView|past|range/, "an accessor reading past its data");
  // a texture that is small in the file but huge decoded: its PNG says 30000 × 30000
  const big = Buffer.from(ok), at = big.indexOf(Buffer.from("IHDR"));
  big.writeUInt32BE(30000, at + 4); big.writeUInt32BE(30000, at + 8);
  assert.match(bad(big), /decoded|texture/);
  // a structure that isn't a glTF object at all
  assert.match(bad(withJson(ok, (j) => { for (const k of Object.keys(j)) delete j[k]; j.asset = { version: "2.0" }; j.meshes = "x"; })), /meshes|JSON/);
});

const spec = (f, extra = {}) => ({ id: f, loc: ["T"], status: "trial", replaces: { names: /^Nope$/ }, model: { file: f, anchor: [LAT0, LON0], heading: 0, ...extra } });
const run = (F, registry, readModel, more = {}) => F.buildFacilities({ scene: { buildings: [] }, gf, groundAt: () => 0, location: "T", year: 2026, toTrack: () => [1, 0], registry, readModel, ...more });

test("GLB placement: a turned model's footprint is its own outline – the empty corners of its world box stay free", async () => {
  const F = await load();
  const r = await run(F, [spec("long.glb", { heading: 45 })], async () => boxGlb({ w: 40, h: 5, d: 4 }));
  assert.strictEqual(r.info[0].how, "model");
  assert.ok(r.keepOut(0, 0), "inside");
  // a 40 × 4 m slab turned 45°: of the four points 14 m out along both axes (all inside its world box), the two on
  // its length are under it, the two across it are open ground
  const under = [[14, 14], [-14, -14], [14, -14], [-14, 14]].filter(([x, z]) => r.keepOut(x, z));
  assert.strictEqual(under.length, 2, `only along its own length (${JSON.stringify(under)})`);
});

test("GLB cache: models in use – by a standing world or a build under way – are never freed under it", async () => {
  const F = await load(), { disposeGroup } = await import("../src/renderer/dispose.js");
  const disposed = new Set(), THREE = await import("../src/renderer/vendor/three.module.js");
  const orig = THREE.BufferGeometry.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function () { disposed.add(this); return orig.call(this); };
  try {
    const read = async () => boxGlb();
    // one build using seven models (more than the cache's six)
    const a = await run(F, Array.from({ length: 7 }, (_, i) => spec(`a${i}.glb`)), read);
    const ga = []; a.group.traverse((o) => { if (o.isMesh) ga.push(o.geometry); });
    assert.strictEqual(ga.length, 7);
    assert.ok(ga.every((g) => !disposed.has(g)), "none of the build's own models freed while it was being made");
    // the next build with seven others while the first world still stands
    await run(F, Array.from({ length: 7 }, (_, i) => spec(`b${i}.glb`)), read);
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(ga.every((g) => !disposed.has(g)), "the standing world keeps its models");
    // the first world goes: its models can go once the cache needs the room
    disposeGroup(a.group);
    await run(F, [spec("c0.glb")], read);
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(ga.some((g) => disposed.has(g)), "freed after the world that used them is gone");
  } finally { THREE.BufferGeometry.prototype.dispose = orig; }
});

test("GLB cache: a load in progress is shared; when it fails only it is dropped, and the next load of the file is kept", async () => {
  const F = await load();
  let fail; const first = new Promise((_, rej) => { fail = rej; });
  let reads = 0;
  const read = async () => { reads++; return reads === 1 ? first : boxGlb(); };
  const a = run(F, [spec("y.glb")], read), b = run(F, [spec("y.glb")], read);   // two builds want it while it loads
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(reads, 1, "one load for both");
  fail(new Error("network"));
  assert.deepStrictEqual([(await a).info[0].how, (await b).info[0].how], ["fallback", "fallback"], "the map's buildings stay");
  const again = await run(F, [spec("y.glb")], read);
  assert.strictEqual(again.info[0].how, "model"); assert.strictEqual(reads, 2, "tried again");
  const third = await run(F, [spec("y.glb")], read);
  assert.strictEqual(third.info[0].how, "model"); assert.strictEqual(reads, 2, "the newer load stays cached (the old failure took only its own entry)");
});
