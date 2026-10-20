// The driver's safety harness (v0.44): a six-point racing harness laid on the driver's torso as drawn (car3d.js
// driverTorso / torsoGeometry) and over the HANS collar – not a road car's diagonal belt.
//
// What it is (research/harness.md): F1 cars carry an FIA 8853-2016 six-point harness – two shoulder straps over the
// shoulders (over the FHR/HANS device's tails) down to a single central rotary quick-release buckle on the lower belly,
// two lap straps from anchorages at the sides of the seat across the pelvis to the buckle, and two crotch (leg) straps
// up from the seat between the thighs to it (2022–25 Technical Regulations Art. 14.4 / 2026 Section C C14.4: the
// harness as the FIA list of homologated belts, "two shoulder straps, one abdominal strap and two straps between the
// legs" at least – H; 8853-2016: shoulder straps 75 mm, or 50 mm where used with an FHR device; lap straps 75 mm;
// crotch straps 50 mm – H). Colours vary by team (the webbing is often black or grey, some team-coloured – kit.js).
//
// How: each strap is a guide line drawn round the torso (points a little off the body), densified, and every point
// ray-cast onto the torso's own triangles and the HANS collar – the strap lies on the surface the arms are planned
// against (arms.js torsoField), never floating over it or buried in it: a ribbon 2 mm off the surface, ~2 mm thick, its
// edges each cast on their own (it bends over the chest's curve), its ends closed. The buckle: an anodised disc
// Ø 86 mm, 13 mm thick with a raised rotary cap (photos of Sabelt / Schroth F1 buckles; M), on the belly at the
// straps' meeting point, over them. Where the straps go behind the
// shoulders and into the seat (to their anchorages on the chassis behind the seat back and at its sides) they end
// inside the seat's back / the tub – unseen from any camera, so not drawn further. Not drawn: the strap adjusters (their
// shape and place differ by maker and team; a plate of a guessed shape read worse than none).
// Every triangle carries its kit zone (body3d KIT_ZONE: webbing, its edges, buckle, cap): it is merged into the
// torso's mesh and drawn with the kit's material – no extra draw call.
import * as THREE from "./vendor/three.module.js";
import { KIT_ZONE, kitU } from "./body3d.js";

export const HARNESS = {
  shoulderW: 0.05,   // with an FHR device (8853-2016: 50 mm allowed with FHR; F1 cars use FHR – H)
  lapW: 0.075, crotchW: 0.05,
  thick: 0.0022,     // webbing ~1.5–2 mm plus the stitched layers (M)
  gap: 0.0018,       // off the surface: the suit's give under it
  buckleR: 0.043, buckleT: 0.013, capR: 0.027, capT: 0.005,
  // the buckle's place on the torso's front: below the low back's bending point (L0) – the lower belly (M: photos)
  buckleH: -0.075,
};
// torso: driverTorso(...) (frame: L0, up, front); solids: geometries the straps lie on (the torso mesh, the HANS collar)
export function harnessGeometry(torso, solids) {
  const H = HARNESS, L0 = torso.L0.clone(), U = torso.up.clone().normalize(), F = torso.front.clone().normalize(), S = new THREE.Vector3().crossVectors(F, U).normalize();
  const mats = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), meshes = solids.map((g) => new THREE.Mesh(g, mats));
  for (const m of meshes) m.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(); rc.firstHitOnly = false;
  const at = (h, s, f) => L0.clone().addScaledVector(U, h).addScaledVector(S, s).addScaledVector(F, f);
  // cast from o along d: the outermost hit (the first along d) and its face normal (out of the body: towards o)
  const cast = (o, d) => {
    rc.set(o, d.clone().normalize()); rc.far = 1;
    const hits = rc.intersectObjects(meshes, false); if (!hits.length) return null;
    const h = hits[0], n = h.face.normal.clone(); if (n.dot(d) > 0) n.negate();
    return { p: h.point.clone(), n };
  };
  // a strap: guide points off the body (car frame) and how each is aimed at the body: "plane" – along −F and −U in its
  // own across-place (keeps the strap's line across the chest), "radial" – at the torso's axis at its height (round the
  // hips' sides)
  // (layer: the straps lie on each other at the buckle – crotch straps under the lap straps under the shoulder straps, as
  // they're threaded into it – each a strap's thickness further out, so no two share a surface; v0.44 first try had
  // them all at one height: they flickered through each other there)
  const strap = (guide, width, mode, n0, layer = 0, z = KIT_ZONE.webbing) => {
    const curve = new THREE.CatmullRomCurve3(guide, false, "centripetal"), pts = curve.getSpacedPoints(n0), C = [];
    for (const g of pts) {
      const rel = g.clone().sub(L0), h = Math.max(-0.21, Math.min(0.43, rel.dot(U)));
      const tgt = mode === "radial" ? L0.clone().addScaledVector(U, h) : L0.clone().addScaledVector(U, Math.min(h, 0.38)).addScaledVector(S, rel.dot(S));
      // (from well outside along the same line: a point of the spline between two guides can dip inside the body, and a
      // ray started there hits the inner faces of the torso's overlapping pieces – v0.44 first try: lap straps 42 mm deep)
      const dir = tgt.clone().sub(g).normalize(), hit = cast(tgt.clone().addScaledVector(dir, -0.5), dir);
      if (hit) C.push(hit);
    }
    // the ribbon: along the hits, across their normal × the line's tangent; each edge cast on its own
    const L = [], R = [], NL = [], NR = [];
    for (let i = 0; i < C.length; i++) {
      const a = C[Math.max(0, i - 1)].p, b = C[Math.min(C.length - 1, i + 1)].p, T = b.clone().sub(a).normalize();
      const B = new THREE.Vector3().crossVectors(C[i].n, T).normalize();
      for (const [k, P, N] of [[1, L, NL], [-1, R, NR]]) {
        // (cast from well out: the outermost surface over the edge – at a crease (thigh into pelvis) the tangent plane's
        // edge point is inside the other piece, and a cast from just over it found that piece's inner face)
        const e = C[i].p.clone().addScaledVector(B, (k * width) / 2), hit = cast(e.clone().addScaledVector(C[i].n, 0.3), C[i].n.clone().negate());
        // (an edge off the body – past the shoulder's or the hip's side, over a hollow: the strap bridges, flat with its
        // middle)
        const on = hit && hit.p.clone().sub(e).dot(C[i].n) > -0.03;
        P.push(on ? hit.p : e); N.push(on ? hit.n.clone().lerp(C[i].n, 0.5).normalize() : C[i].n);
      }
    }
    return ribbon(L, R, NL, NR, z, KIT_ZONE.webEdge, layer);
  };
  const parts = [];
  // the buckle on the belly
  const bk = cast(at(H.buckleH, 0, 0.4), F.clone().negate()), bn = bk.n, bp = bk.p.clone().addScaledVector(bn, H.gap + 3 * H.thick);
  // shoulder straps (k: each side): up the chest from beside the buckle, over the shoulder by the neck and over the HANS'
  // tail, back down behind the shoulder into the seat's back
  for (const k of [1, -1]) {
    parts.push(strap([at(H.buckleH + 0.02, k * 0.026, 0.3), at(0.05, k * 0.052, 0.3), at(0.2, k * 0.078, 0.3), at(0.33, k * 0.092, 0.25), at(0.42, k * 0.1, 0.12), at(0.5, k * 0.1, -0.04), at(0.44, k * 0.1, -0.16)], H.shoulderW, "plane", 24, 2));
    // lap straps: from beside the buckle across the pelvis and round the hip to the seat's side
    parts.push(strap([at(H.buckleH - 0.012, k * 0.03, 0.3), at(-0.11, k * 0.09, 0.3), at(-0.135, k * 0.17, 0.12), at(-0.145, k * 0.22, -0.05)], H.lapW, "radial", 14, 1));
    // crotch straps: from under the buckle down the lower belly to the crotch, where they go into the seat's base between
    // the thighs (the torso is reclined: "down" its front is forward and down in the car – they end at the pelvis' foot,
    // not along the thighs)
    parts.push(strap([at(H.buckleH - 0.03, k * 0.014, 0.3), at(-0.15, k * 0.016, 0.3), at(-0.2, k * 0.018, 0.2)], H.crotchW, "plane", 7, 0));
  }
  // the buckle and its rotary cap
  parts.push(disc(bp, bn, H.buckleR, H.buckleT, KIT_ZONE.buckle, 24), disc(bp.clone().addScaledVector(bn, H.buckleT), bn, H.capR, H.capT, KIT_ZONE.buckleCap, 16));
  mats.dispose();
  const g = mergeParts(parts); g.userData.buckle = bp.toArray(); return g;
}
// a closed ribbon: left/right edge points on the body, their normals; webbing zone on top and bottom, edge zone on the sides
function ribbon(L, R, NL, NR, z, ze, layer = 0) {
  const H = HARNESS, pos = [], uv = [], n = L.length;
  const lift = (P, N, k) => P.clone().addScaledVector(N, H.gap + (layer + k) * H.thick);
  const quad = (a, b, c, d, zone) => { for (const v of [a, b, c, a, c, d]) pos.push(v.x, v.y, v.z); for (let i = 0; i < 6; i++) uv.push(kitU(zone), 0.5); };
  for (let i = 0; i < n - 1; i++) {
    const l0 = lift(L[i], NL[i], 0), l1 = lift(L[i + 1], NL[i + 1], 0), r0 = lift(R[i], NR[i], 0), r1 = lift(R[i + 1], NR[i + 1], 0);
    const L0 = lift(L[i], NL[i], 1), L1 = lift(L[i + 1], NL[i + 1], 1), R0 = lift(R[i], NR[i], 1), R1 = lift(R[i + 1], NR[i + 1], 1);
    quad(L0, R0, R1, L1, z); quad(l0, l1, r1, r0, z); quad(l0, L0, L1, l1, ze); quad(r0, r1, R1, R0, ze);
  }
  // (the ends closed: a solid strap for the cockpit checker)
  for (const [i, s] of [[0, 1], [n - 1, -1]]) { const l = lift(L[i], NL[i], 0), r = lift(R[i], NR[i], 0), Lt = lift(L[i], NL[i], 1), Rt = lift(R[i], NR[i], 1); s > 0 ? quad(l, r, Rt, Lt, ze) : quad(l, Lt, Rt, r, ze); }
  // (wound outward by construction: across = normal × along, so the top faces face along the normal, the underside into
  // the body, the sides and ends out – flat normals)
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); return g;
}
// a disc (or, with scale, an oblong plate) on a surface: centre c, normal n, radius r, thickness t
function disc(c, n, r, t, zone, seg = 24, scale = [1, 1]) {
  const g = new THREE.CylinderGeometry(r, r, t, seg, 1, false); g.scale(scale[0], 1, scale[1]);
  g.translate(0, t / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize())); g.translate(c.x, c.y, c.z);
  const out = g.toNonIndexed(); g.dispose();
  const k = out.attributes.position.count; out.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(k * 2).map((_, i) => (i & 1 ? 0.5 : kitU(zone))), 2));
  return out;
}
function mergeParts(parts) {
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3).fill(1);
  let o = 0; for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere(); return g;
}
