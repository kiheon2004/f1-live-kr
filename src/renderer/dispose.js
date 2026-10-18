// Freeing what a part of the 3D world owns on the GPU, each thing once.
//   geometries, materials and the textures a material holds (map, emissive, normal, … as model files bring, and those
//   it owns through shader uniforms: material.userData.ownedTextures); a group can list materials it swaps its meshes
//   between (userData.materials: the buildings' near and far ones, of which only one may be on a mesh right now)
//   instanced meshes themselves: their per-instance buffers (matrices, colours) are the mesh's, not its geometry's –
//   three.js frees them only when the mesh is disposed
//   anything marked userData.shared is left alone: it's used by other objects that live on (the cars' common parts, the
//   facilities' drawn textures, the garage equipment, model files held by the model cache)
//   userData.onDispose(): what an object holds elsewhere is given back (a facility's lease on a model file), once
// Plain objects (groups, meshes, sprites, points) have nothing of their own to free and aren't called.
// done: a Set shared between calls that free overlapping things (nothing is freed twice).
export function disposeGroup(root, done = new Set()) {
  // (not a 3D object – a helper table kept beside the world's parts: nothing to free, and no error that would stop a
  // world from being swapped for the next session's, as one did in the v0.34 work)
  if (!root?.isObject3D) return done;
  const once = (x) => { if (x && !done.has(x) && !x.userData?.shared) { done.add(x); x.dispose(); } };
  root.traverse((o) => {
    if (typeof o.userData?.onDispose === "function" && !done.has(o.userData.onDispose)) { done.add(o.userData.onDispose); o.userData.onDispose(); }
    if ((o.isInstancedMesh || o.isBatchedMesh) && !done.has(o)) { done.add(o); o.dispose(); }
    if (o.isSkinnedMesh && o.skeleton) once(o.skeleton);
    if (o.geometry?.isBufferGeometry) once(o.geometry);
    const mats = [].concat(o.material || [], Array.isArray(o.userData?.materials) ? o.userData.materials : []);
    for (const m of mats) {
      if (!m?.isMaterial) continue;
      if (!m.userData?.shared) {
        for (const k in m) if (m[k]?.isTexture) once(m[k]);
        for (const t of m.userData?.ownedTextures || []) if (t?.isTexture) once(t);
      }
      once(m);
    }
  });
  return done;
}

// The shadow pass draws each caster with one depth material three.js shares between them (WebGLShadowMap), handing it
// the caster's map each time – and when the next caster has none, its uniform keeps the last one: a freed world's texture
// went back onto the GPU at the next shadow redraw (a barrier's, 2 per circuit switch – traced in v0.36 with the dev
// texture log). The depth materials in use are noted (three passes them to onBeforeShadow) and let go of any map when a
// world or a car is freed: the uniform is rebuilt without it on their next use.
// The watch wraps Object3D.prototype.onBeforeShadow once: whatever was there before (three's no-op, or another wrapper –
// the dev texture log's) is still called with the same `this` and arguments (v0.36 replaced it outright – review of v0.36,
// C). Only three's own shared depth / distance materials are noted – an object's customDepthMaterial /
// customDistanceMaterial is its owner's, left alone. Not seen: an object with its own onBeforeShadow (BatchedMesh's
// class method, an instance's own) – the shared material is noted from any other caster in the same pass; this app has no
// BatchedMesh and no shadow-casting point light. unwatchShadowDepth() puts the previous function back (tests).
const DEPTH_MATS = new Set();
let WATCH = null;
export function watchShadowDepth(THREE) {
  const P = THREE.Object3D.prototype;
  if (WATCH && P.onBeforeShadow === WATCH.f) return;
  const prev = P.onBeforeShadow;
  const f = function (r, o, cam, scam, geo, depthMaterial) {
    if (depthMaterial && depthMaterial !== this.customDepthMaterial && depthMaterial !== this.customDistanceMaterial) DEPTH_MATS.add(depthMaterial);
    return prev.apply(this, arguments);
  };
  WATCH = { P, f, prev };
  P.onBeforeShadow = f;
}
export function unwatchShadowDepth() {
  if (WATCH && WATCH.P.onBeforeShadow === WATCH.f) WATCH.P.onBeforeShadow = WATCH.prev;
  WATCH = null;
}
export function releaseShadowRefs() {
  let n = 0;
  for (const m of DEPTH_MATS) if (m.map || m.alphaMap) { m.map = null; m.alphaMap = null; m.needsUpdate = true; n++; }
  DEPTH_MATS.clear();
  return n;
}
