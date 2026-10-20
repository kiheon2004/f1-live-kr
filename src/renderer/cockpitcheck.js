// Development and test check of the cockpit (v0.42): is anything the driver handles – the steering wheel's parts, the
// gloves, the gauntlets, the skinned sleeves – inside the car's body as it is actually built (the chassis' painted
// skin and its tub, the padded rim, the headrest), at any angle of the wheel? Not a model of the body: the generated
// triangles themselves. A point is inside a closed skin when a ray from it crosses the skin an odd number of times
// (here straight up, through a grid of the skin's triangles over the cockpit). Never used by the app at run time.
//
// v0.43 (review: a unit cube said its own centre was outside): the vertical line through (x, z) met the cube's top face
// exactly on the diagonal both its triangles share, and each counted it – two crossings, "outside". The line is now
// moved by an infinitesimal (x + ε, z + ε²) – symbolic, never a number added (Edelsbrunner & Mücke's simulation of
// simplicity) –, and each edge's side of it is worked out once from the edge's two ends in a fixed order, so the
// triangles either side of a shared edge or round a shared corner always agree: exactly one of them is crossed. A
// face seen edge on (vertical) is never crossed by the moved line. A point on the skin itself is not inside (depth 0).
// A mesh that isn't closed (an edge not shared by exactly two triangles after joining equal corners) has no inside for
// the count: its solid is marked open and never judged by it (insideDepth 0, open: true) – the generalised winding
// number (Jacobson et al. 2013) judges it instead where asked (penetration).
import * as THREE from "./vendor/three.module.js";
import { components, solidOf, openEdges, insideDepth, penetration, windingNumber, surfaceCrossings } from "./meshgeo.js";
export { components, solidOf, openEdges, insideDepth, penetration, windingNumber, surfaceCrossings };

// The solids (car frame) round the cockpit: each closed mesh's triangles over the opening's stretch, bucketed by x / z
// (the chassis' skin: its outer surface and the tub together – one closed surface, userData.bodySkin –, not the painted
// mesh, which has other parts merged in: the halo's open tube on 2022–25 cars broke the count). Each solid also says
// whether it is closed (closed / openEdges): the stretch kept is cut out of the whole mesh, so closedness is judged on
// the whole mesh, before the cut.
export function cockpitSolids(car, names = ["chassis", "rim", "headrest", "torso"], range = null) {
  car.updateMatrixWorld(true);
  const inv = car.matrixWorld.clone().invert(), u = car.userData;
  const z0 = range ? range[0] : u.wheel.position.z - 0.9, z1 = range ? range[1] : u.wheel.position.z + 0.6;
  const solids = [], meshes = [];
  if (names.includes("chassis")) meshes.push({ name: "chassis", geos: u.bodySkin || [], M: new THREE.Matrix4() });
  car.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && names.includes(o.name)) meshes.push({ name: o.name, geos: [o.geometry], M: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) }); });
  for (const { name, geos, M } of meshes) {
    // (v0.43: one solid per connected piece – a mesh merged from overlapping closed skins (the torso: chest, pelvis and
    // thighs) crosses twice where two overlap, and the count called a point inside both "outside")
    for (const all of components(trianglesOf(geos, M))) {
      const tris = all.filter((t) => !(Math.max(t[2], t[5], t[8]) < z0 || Math.min(t[2], t[5], t[8]) > z1 || Math.min(Math.abs(t[0]), Math.abs(t[3]), Math.abs(t[6])) > 0.6));
      if (!tris.length) continue;
      const S = solidOf(name, tris); S.openEdges = openEdges(all); S.closed = S.openEdges === 0;
      solids.push(S);
    }
  }
  return solids;
}
// every triangle of the geometries (positions through M) as [ax, ay, az, bx, by, bz, cx, cy, cz]
export function trianglesOf(geos, M = null) {
  const tris = [], A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (const g of geos) {
    const P = g.attributes.position, I = g.index, n = I ? I.count : P.count;
    for (let i = 0; i + 2 < n; i += 3) {
      const ia = I ? I.getX(i) : i, ib = I ? I.getX(i + 1) : i + 1, ic = I ? I.getX(i + 2) : i + 2;
      A.fromBufferAttribute(P, ia); B.fromBufferAttribute(P, ib); C.fromBufferAttribute(P, ic);
      if (M) { A.applyMatrix4(M); B.applyMatrix4(M); C.applyMatrix4(M); }
      tris.push([A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z]);
    }
  }
  return tris;
}
// The driver's things at the wheel's present angle: points (car frame) of every mesh under the steering wheel (its
// parts, the gloves shown), the gauntlets and sleeves (skinned), each tagged. An instanced mesh (shift and flag
// lights): every vertex of every instance – not the instances' centres. dense (m, v0.43): points over the triangles'
// faces too, no further apart than that – a thin part crossing a face between the vertices is measured, not missed.
export function handledPoints(car, step = 3, dense = 0) {
  if (dense > 0) {
    const out = [], H = handledTriangles(car);
    for (const [tag, T] of Object.entries(H)) T.tris.forEach((t, k) => {
      if (T.back[k]) return;
      const n = Math.max(1, Math.ceil(Math.max(Math.hypot(t[3] - t[0], t[4] - t[1], t[5] - t[2]), Math.hypot(t[6] - t[3], t[7] - t[4], t[8] - t[5]), Math.hypot(t[0] - t[6], t[1] - t[7], t[2] - t[8])) / dense));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) { const a = i / n, b = j / n, c = 1 - a - b; out.push([a * t[0] + b * t[3] + c * t[6], a * t[1] + b * t[4] + c * t[7], a * t[2] + b * t[5] + c * t[8], tag, T.along ? a * T.along[k][0] + b * T.along[k][1] + c * T.along[k][2] : 1]); }
    });
    return out;
  }
  car.updateMatrixWorld(true);
  const inv = car.matrixWorld.clone().invert(), u = car.userData, out = [], v = new THREE.Vector3(), w = new THREE.Vector3(), toWheel = u.wheel.matrixWorld.clone().invert();
  const m = new THREE.Matrix4();
  u.wheel.traverse((o) => {
    if (!o.isMesh || !shown(o, u.wheel)) return;
    const P = o.geometry.attributes.position, tag = o.name || (o.parent?.name?.startsWith("hand") ? "glove" : "wheel");
    const n = o.isInstancedMesh ? o.count : 1;
    for (let c = 0; c < n; c++) {
      if (o.isInstancedMesh) o.getMatrixAt(c, m);
      // (the column behind the hub goes into the bulkhead – it is mounted there: points over 6 cm behind the face skipped)
      for (let i = 0; i < P.count; i += o.isInstancedMesh ? 1 : step) {
        v.fromBufferAttribute(P, i); if (o.isInstancedMesh) v.applyMatrix4(m); v.applyMatrix4(o.matrixWorld);
        if (w.copy(v).applyMatrix4(toWheel).z > 0.06) continue; v.applyMatrix4(inv); out.push([v.x, v.y, v.z, tag]);
      }
    }
  });
  for (const a of u.arms || []) for (const [mm, tag] of [[a.mesh, "sleeve"], [a.gauntlet, "gauntlet"]]) {
    const P = mm.geometry.attributes.position;
    for (let i = 0; i < P.count; i += step) { mm.getVertexPosition(i, v); v.applyMatrix4(mm.matrixWorld).applyMatrix4(inv); out.push([v.x, v.y, v.z, tag, P.getY(i)]); }
  }
  return out;
}
// shown: the object and every parent up to (not including) the root visible
function shown(o, root) { for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false; return root.visible !== false; }
// The driver's things as triangles (car frame), tagged, for surfaceCrossings: { tag: { tris, skip } } – the column's
// triangles behind the face and the sleeve's first 14 cm (it grows out of the torso) marked to skip
export function handledTriangles(car) {
  car.updateMatrixWorld(true);
  const inv = car.matrixWorld.clone().invert(), u = car.userData, out = {}, toWheel = u.wheel.matrixWorld.clone().invert();
  const v = new THREE.Vector3(), w = new THREE.Vector3(), m = new THREE.Matrix4();
  const put = (tag) => (out[tag] ||= { tris: [], back: [], root: [], along: null });
  u.wheel.traverse((o) => {
    if (!o.isMesh || !shown(o, u.wheel)) return;
    const P = o.geometry.attributes.position, I = o.geometry.index, cnt = I ? I.count : P.count, tag = o.name || (o.parent?.name?.startsWith("hand") ? "glove" : "wheel"), T = put(tag);
    for (let c = 0; c < (o.isInstancedMesh ? o.count : 1); c++) {
      if (o.isInstancedMesh) o.getMatrixAt(c, m);
      for (let i = 0; i + 2 < cnt; i += 3) {
        const t = [], back = [];
        for (let j = 0; j < 3; j++) { v.fromBufferAttribute(P, I ? I.getX(i + j) : i + j); if (o.isInstancedMesh) v.applyMatrix4(m); v.applyMatrix4(o.matrixWorld); back.push(w.copy(v).applyMatrix4(toWheel).z > 0.06); v.applyMatrix4(inv); t.push(v.x, v.y, v.z); }
        T.tris.push(t); T.back.push(back.some(Boolean)); T.root.push(false);
      }
    }
  });
  for (const a of u.arms || []) for (const [mm, tag] of [[a.mesh, "sleeve"], [a.gauntlet, "gauntlet"]]) {
    const P = mm.geometry.attributes.position, I = mm.geometry.index, cnt = I ? I.count : P.count, T = put(tag);
    T.along ||= [];
    for (let i = 0; i + 2 < cnt; i += 3) {
      const t = [], al = []; let root = false;
      for (let j = 0; j < 3; j++) { const ix = I ? I.getX(i + j) : i + j; mm.getVertexPosition(ix, v); v.applyMatrix4(mm.matrixWorld).applyMatrix4(inv); t.push(v.x, v.y, v.z); al.push(P.getY(ix)); if (P.getY(ix) < 0.14) root = true; }
      T.tris.push(t); T.back.push(false); T.root.push(root); T.along.push(al);
    }
  }
  return out;
}
// the worst point of each kind inside each solid, at this angle: { "gauntlet in painted": depth, … } – the depth the
// straight up/down one (an upper bound), or with { nearest: true } the true shortest distance to the skin. With
// { edges: true } also the triangles' crossings ("glove x rim": count) – what the vertices alone can miss; with
// { dense: m } the points spread over the faces (handledPoints) – how deep such a crossing goes.
export function cockpitClash(car, solids, step = 3, opt = {}) {
  const worst = {};
  for (const [x, y, z, tag, along] of handledPoints(car, step, opt.dense || 0)) for (const S of solids) {
    // (the sleeve's first 14 cm grows out of the torso at the shoulder: not a clash with it)
    if (S.name === "torso" && tag === "sleeve" && along < 0.14) continue;
    // (an open solid: never by the count – by the winding number, its depth the true distance, the key marked "open")
    let d;
    if (opt.nearest || !S.closed) { const r = penetration(S, x, y, z); d = r.inside ? r.nearest : 0; } else d = insideDepth(S, x, y, z);
    if (d > 0) { const k = `${tag} in ${S.name}${S.closed ? "" : " (open)"}`; worst[k] = Math.max(worst[k] || 0, d); }
  }
  if (opt.edges) {
    const H = handledTriangles(car);
    for (const [tag, T] of Object.entries(H)) for (const S of solids) {
      const skip = (k) => T.back[k] || (S.name === "torso" && tag === "sleeve" && T.root[k]);
      const r = surfaceCrossings(T.tris, S, skip);
      if (r.count) worst[`${tag} x ${S.name}`] = r.count;
    }
  }
  return worst;
}
