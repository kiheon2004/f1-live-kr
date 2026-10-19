// Development and test check of the cockpit (v0.42): is anything the driver handles – the steering wheel's parts, the
// gloves, the gauntlets, the skinned sleeves – inside the car's body as it is actually built (the chassis' painted
// skin and its tub, the padded rim, the headrest), at any angle of the wheel? Not a model of the body: the generated
// triangles themselves. A point is inside a closed skin when a ray from it crosses the skin an odd number of times
// (here straight up, through a grid of the skin's triangles over the cockpit). Never used by the app at run time.
import * as THREE from "./vendor/three.module.js";

// The solids (car frame) round the cockpit: each closed mesh's triangles over the opening's stretch, bucketed by x / z
// (the chassis' skin: its outer surface and the tub together – one closed surface, userData.bodySkin –, not the painted
// mesh, which has other parts merged in: the halo's open tube on 2022–25 cars broke the count)
export function cockpitSolids(car, names = ["chassis", "rim", "headrest", "torso"]) {
  car.updateMatrixWorld(true);
  const inv = car.matrixWorld.clone().invert(), u = car.userData, z0 = u.wheel.position.z - 0.9, z1 = u.wheel.position.z + 0.6;
  const solids = [], meshes = [];
  if (names.includes("chassis")) meshes.push({ name: "chassis", geos: u.bodySkin || [], M: new THREE.Matrix4() });
  car.traverse((o) => { if (o.isMesh && names.includes(o.name)) meshes.push({ name: o.name, geos: [o.geometry], M: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) }); });
  for (const { name, geos, M } of meshes) {
    const tris = [], A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    for (const g of geos) { const P = g.attributes.position, I = g.index, n = I ? I.count : P.count;
    for (let i = 0; i < n; i += 3) {
      const ia = I ? I.getX(i) : i, ib = I ? I.getX(i + 1) : i + 1, ic = I ? I.getX(i + 2) : i + 2;
      A.fromBufferAttribute(P, ia).applyMatrix4(M); B.fromBufferAttribute(P, ib).applyMatrix4(M); C.fromBufferAttribute(P, ic).applyMatrix4(M);
      if (Math.max(A.z, B.z, C.z) < z0 || Math.min(A.z, B.z, C.z) > z1 || Math.min(Math.abs(A.x), Math.abs(B.x), Math.abs(C.x)) > 0.6) continue;
      tris.push([A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z]);
    } }
    // a grid over x / z (2 cm): each cell lists the triangles over it
    const cell = 0.02, grid = new Map(), key = (i, j) => i * 100000 + j;
    tris.forEach((t, k) => {
      const i0 = Math.floor(Math.min(t[0], t[3], t[6]) / cell), i1 = Math.floor(Math.max(t[0], t[3], t[6]) / cell), j0 = Math.floor(Math.min(t[2], t[5], t[8]) / cell), j1 = Math.floor(Math.max(t[2], t[5], t[8]) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const kk = key(i, j); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(k); }
    });
    solids.push({ name, tris, grid, cell, key });
  }
  return solids;
}
// how deep (m, measured straight up or down to the skin – an upper bound of the true distance) a point is inside a
// solid; 0 when outside. The point is in the car's frame.
export function insideDepth(S, x, y, z) {
  const ids = S.grid.get(S.key(Math.floor(x / S.cell), Math.floor(z / S.cell)));
  if (!ids) return 0;
  let above = 0, nearest = Infinity;
  for (const k of ids) {
    const t = S.tris[k];
    // (the vertical line through (x, z) against the triangle's projection on the x / z plane: barycentric)
    const x1 = t[0], z1 = t[2], x2 = t[3], z2 = t[5], x3 = t[6], z3 = t[8], d = (z2 - z3) * (x1 - x3) + (x3 - x2) * (z1 - z3);
    if (Math.abs(d) < 1e-14) continue;
    const a = ((z2 - z3) * (x - x3) + (x3 - x2) * (z - z3)) / d, b = ((z3 - z1) * (x - x3) + (x1 - x3) * (z - z3)) / d, c = 1 - a - b;
    if (a < 0 || b < 0 || c < 0) continue;
    const yh = a * t[1] + b * t[4] + c * t[7];
    if (yh > y) above++;
    nearest = Math.min(nearest, Math.abs(yh - y));
  }
  return above % 2 === 1 ? nearest : 0;
}
// The driver's things at the wheel's present angle: points (car frame) of every mesh under the steering wheel (its
// parts, the gloves shown), the gauntlets and sleeves (skinned), each tagged
export function handledPoints(car, step = 3) {
  car.updateMatrixWorld(true);
  const inv = car.matrixWorld.clone().invert(), u = car.userData, out = [], v = new THREE.Vector3(), w = new THREE.Vector3(), toWheel = u.wheel.matrixWorld.clone().invert();
  u.wheel.traverse((o) => {
    if (!o.isMesh || !o.visible || (o.parent && !o.parent.visible)) return;
    const P = o.geometry.attributes.position, tag = o.name || (o.parent?.name?.startsWith("hand") ? "glove" : "wheel");
    if (o.isInstancedMesh) { const m = new THREE.Matrix4(); for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); v.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld).applyMatrix4(inv); out.push([v.x, v.y, v.z, tag]); } return; }
    // (the column behind the hub goes into the bulkhead – it is mounted there: points over 6 cm behind the face skipped)
    for (let i = 0; i < P.count; i += step) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); if (w.copy(v).applyMatrix4(toWheel).z > 0.06) continue; v.applyMatrix4(inv); out.push([v.x, v.y, v.z, tag]); }
  });
  for (const a of u.arms || []) for (const [m, tag] of [[a.mesh, "sleeve"], [a.gauntlet, "gauntlet"]]) {
    const P = m.geometry.attributes.position;
    for (let i = 0; i < P.count; i += step) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld).applyMatrix4(inv); out.push([v.x, v.y, v.z, tag, P.getY(i)]); }
  }
  return out;
}
// the worst point of each kind inside each solid, at this angle: { "gauntlet in painted": depth, … }
export function cockpitClash(car, solids, step = 3) {
  const worst = {};
  for (const [x, y, z, tag, along] of handledPoints(car, step)) for (const S of solids) {
    // (the sleeve's first 14 cm grows out of the torso at the shoulder: not a clash with it)
    if (S.name === "torso" && tag === "sleeve" && along < 0.14) continue;
    const d = insideDepth(S, x, y, z); if (d > 0) { const k = `${tag} in ${S.name}`; worst[k] = Math.max(worst[k] || 0, d); }
  }
  return worst;
}
