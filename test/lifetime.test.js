// What the 3D world owns is freed once, and only what it owns (v0.14 review): instanced meshes' own buffers, the night
// light field's textures (and the shared uniforms pointing at them), and the night patch on materials – checked with
// the vendored three.js r186 (the GPU side itself is measured in the running app).
const test = require("node:test");
const assert = require("node:assert");

const three = () => import("../src/renderer/vendor/three.module.js");
const counted = (o) => { let n = 0; o.addEventListener("dispose", () => n++); return () => n; };

test("dispose: an instanced mesh's own buffers are freed; shared parts are not; nothing twice; hooks once", async () => {
  const THREE = await three(), { disposeGroup } = await import("../src/renderer/dispose.js");
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(), mat = new THREE.MeshStandardMaterial(), tex = new THREE.Texture();
  mat.map = tex;
  const im = new THREE.InstancedMesh(geo, mat, 10); im.setColorAt(0, new THREE.Color(1, 0, 0));
  const twin = new THREE.Mesh(geo, mat);               // the same geometry and material on a second mesh
  const sharedGeo = new THREE.BoxGeometry(); sharedGeo.userData.shared = true;
  const sharedMat = new THREE.MeshStandardMaterial({ map: new THREE.Texture() }); sharedMat.userData.shared = true;
  const keep = new THREE.InstancedMesh(sharedGeo, sharedMat, 4);   // a per-build instancing of shared parts
  let hook = 0; const holder = new THREE.Group(); holder.userData.onDispose = () => hook++;
  holder.add(new THREE.Mesh(sharedGeo, sharedMat));
  g.add(im, twin, keep, holder, new THREE.Object3D());
  const imN = counted(im), keepN = counted(keep), geoN = counted(geo), matN = counted(mat), texN = counted(tex);
  const sgN = counted(sharedGeo), smN = counted(sharedMat), stN = counted(sharedMat.map);
  const done = disposeGroup(g);
  disposeGroup(g, done);                               // a second pass over overlapping parts frees nothing again
  assert.strictEqual(imN(), 1, "the instanced mesh itself (its instance buffers)");
  assert.strictEqual(keepN(), 1, "an instanced mesh of shared parts still owns its instance buffers");
  assert.deepStrictEqual([geoN(), matN(), texN()], [1, 1, 1], "each once");
  assert.deepStrictEqual([sgN(), smN(), stN()], [0, 0, 0], "shared parts live on");
  assert.strictEqual(hook, 1);
});

test("night field: released, its textures are freed and the shared uniforms no longer point at them", async () => {
  const { NL, releaseField } = await import("../src/renderer/nightlights.js");
  const THREE = await three();
  const f = { tex: new THREE.Texture(), hgt: new THREE.Texture() }, texN = counted(f.tex), hgtN = counted(f.hgt);
  const other = { tex: new THREE.Texture(), hgt: new THREE.Texture() };
  NL.tex.value = f.tex; NL.hgt.value = f.hgt; NL.gain.value = 5;
  releaseField(f);
  assert.deepStrictEqual([texN(), hgtN()], [1, 1]);
  assert.notStrictEqual(NL.tex.value, f.tex); assert.notStrictEqual(NL.hgt.value, f.hgt);
  assert.strictEqual(NL.gain.value, 0, "no light from a field that's gone");
  NL.tex.value = other.tex; NL.hgt.value = other.hgt;
  releaseField({ tex: new THREE.Texture(), hgt: new THREE.Texture() });
  assert.strictEqual(NL.tex.value, other.tex, "another field in use is left alone");
  releaseField(null);
});

test("night patch: standard, lambert and phong (also instanced) get the light field once; a copy gets it too", async () => {
  const THREE = await three(), { nightLit } = await import("../src/renderer/nightlights.js");
  const compile = (m, lib) => { const sh = { uniforms: {}, vertexShader: THREE.ShaderLib[lib].vertexShader, fragmentShader: THREE.ShaderLib[lib].fragmentShader }; m.onBeforeCompile(sh, null); return sh; };
  const count = (s, x) => s.split(x).length - 1;
  for (const [Cls, lib] of [[THREE.MeshStandardMaterial, "standard"], [THREE.MeshLambertMaterial, "lambert"], [THREE.MeshPhongMaterial, "phong"]]) {
    const m = new Cls();
    nightLit(m); nightLit(m);                          // (shared by many objects: patched once)
    const sh = compile(m, lib);
    assert.strictEqual(count(sh.fragmentShader, "irradiance += nlLight("), 1, `${lib}: the field added once`);
    assert.strictEqual(count(sh.vertexShader, "vNlPos = "), 1, `${lib}: world position once`);
    assert.match(sh.vertexShader, /USE_INSTANCING[\s\S]*instanceMatrix \* nlW/, `${lib}: instances placed by their own matrix`);
    assert.ok(sh.uniforms.nlTex && sh.uniforms.nlGain, `${lib}: uniforms`);
    assert.match(m.customProgramCacheKey(), /nightLit$/);
    // a copy (material.clone() copies userData but not onBeforeCompile) is patched as its own material
    const c = m.clone(); nightLit(c);
    assert.strictEqual(count(compile(c, lib).fragmentShader, "irradiance += nlLight("), 1, `${lib}: the copy too`);
  }
  // an existing patch (the buildings' facades) is kept and chained
  const b = new THREE.MeshStandardMaterial(); b.onBeforeCompile = (sh) => { sh.fragmentShader = "// facades\n" + sh.fragmentShader; };
  b.customProgramCacheKey = () => "facadeArray2";
  nightLit(b);
  const sh = compile(b, "standard");
  assert.ok(sh.fragmentShader.startsWith("// facades")); assert.strictEqual(b.customProgramCacheKey(), "facadeArray2|nightLit");
  // unlit materials are left alone
  const basic = new THREE.MeshBasicMaterial(); nightLit(basic); assert.strictEqual(basic.customProgramCacheKey(), new THREE.MeshBasicMaterial().customProgramCacheKey());
});

// v0.34 work: a world's table of generic parts held a non-3D value (the pit lane's cells); freeing it on a session
// switch threw, and the 3D world stayed on the previous circuit for every race loaded after the first.
test("dispose: something that isn't a 3D object is skipped, not an error", async () => {
  const { disposeGroup } = await import("../src/renderer/dispose.js");
  assert.doesNotThrow(() => { disposeGroup({ has: () => false }); disposeGroup(new Map()); disposeGroup(null); });
});
