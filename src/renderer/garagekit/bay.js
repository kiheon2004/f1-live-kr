// One garage bay's interior (v0.49 garage kit): buildBayInterior(zone, style, opts) → a THREE.Group that fits the zone.
//
// Contract (the "garage" helper's garageZones(G) gives the zones; the menu garage makes its own):
//   zone  – layout.js normZone: { width, depth, ceilingH, floorY, doorW, doorH, centre | front, along, inward, kind }
//   style – style.js teamGarageStyle(team, colour, { season })
//   opts  – { lib (materials.js createKitLibrary – shared; one per world/scene), lod: 0 | 1 | 2, car: { length, width,
//             height } (the real car's bounds: car3d.js userData.bounds), carZ0 (nose from the door line, m),
//             shell: false | true | { floor, walls: ["left", "right", "back"], ceiling, header, openings: [{ wall, z0, z1, h }] }
//             (the room itself – the circuit garages have their own floor / walls / ceiling, so the default is none),
//             signs: true (the team name on the back or side wall), shadows: true (equipment casts / receives),
//             keep: [{ x0, x1, z0, z1 }] (bay-frame floor kept free – layout.js planBay) }
// Returns a Group positioned in the world by the zone's frame (x across, y up, z inward from the door line); its
// userData: { plan (layout.js planBay: the car's place, the items, what was dropped and why), fixtures (where the
// ceiling's and the gantry's lamps are – lights.js puts the real lights there), lod, stats: { draws, triangles } }.
// Owns its merged geometries, the team's materials and their canvas textures (dispose.js disposeGroup frees them); the
// library's shared materials and module pieces are not freed with it.
import * as THREE from "../vendor/three.module.js";
import { Parts } from "./parts.js";
import { normZone, planBay, frameMatrix, footprint } from "./layout.js";
import { teamMaterials } from "./materials.js";

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const place = (x, y, z, ry) => _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _one).clone();
// the slots that cast shadows (big, solid things) – thin pieces, screens and lamps don't
const CASTS = new Set(["steel", "dark", "cab", "drawer", "light", "tyre", "rim", "fabric", "fabricAccent", "plastic", "accent", "carbon", "rubber", "hose"]);

export function buildBayInterior(zone, style, opts = {}) {
  const n = normZone(zone);
  if (n.error) throw new Error("buildBayInterior: " + n.error);
  const lib = opts.lib; if (!lib) throw new Error("buildBayInterior: opts.lib (createKitLibrary) required");
  const lod = Math.max(0, Math.min(2, opts.lod ?? 0)), plan = planBay(n, style, { car: opts.car, carZ0: opts.carZ0, noCar: opts.noCar, keep: opts.keep });
  const W = n.width, D = n.depth, H = n.ceilingH, shell = opts.shell === true ? { floor: true, walls: ["left", "right", "back"], ceiling: true, header: true } : opts.shell || null;
  const signs = opts.signs === false ? [] : [{ slot: "sign", text: style.name, sub: opts.signSub || "" }];
  // (opts.tm: the team's materials made once for all its bays – circuit.js – so its bays can be merged per material)
  const TM = opts.tm || teamMaterials(lib, style, { floor: shell?.floor ? { w: W, d: D, car: plan.car } : null, signs, wall: !!shell });
  const P = new Parts(), fixtures = [];
  // the equipment, each module's pieces (shared, per lod) cloned into place
  for (const it of plan.items) {
    const variant = it.kind === "bench" || it.kind === "desk" ? String(it.monitors) : "";
    P.merge(lib.module(it.kind, lod, it.kind === "bench" || it.kind === "desk" ? { monitors: it.monitors } : {}, variant), place(it.x, 0, it.z, it.ry));
    // its contact shadow (an ambient-occlusion stand-in: the floor darkens under and round what stands on it)
    // (its footprint grown 12 cm, kept inside the bay: never past a wall)
    if (lod < 2) {
      const f = footprint(it), x0 = Math.max(-W / 2, f.x0 - 0.12), x1 = Math.min(W / 2, f.x1 + 0.12), z0 = Math.max(0, f.z0 - 0.12), z1 = Math.min(D, f.z1 + 0.12);
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); P.add("contact", g, (x0 + x1) / 2, 0.004, (z0 + z1) / 2);
    }
  }
  if (plan.overhead) { const o = plan.overhead; P.merge(lib.boom(lod, o), new THREE.Matrix4().makeTranslation(0, 0, o.z0)); for (const x of o.kind === "twin" ? [-0.55, 0.55] : [0]) fixtures.push({ kind: "boom", x, y: o.y1 - 0.53, z: (o.z0 + o.z1) / 2, len: (o.z1 - o.z0) * 0.62 }); }
  // the floor's tape: the car's work place outlined (lines 5 cm wide), the door line
  if (plan.car?.fits && lod < 2) {
    const c = plan.car, x = c.width / 2 + 0.35, z0 = c.z0 - 0.35, z1 = c.z1 + 0.35, t = 0.05, y = 0.003;
    const strip = (w, d, cx, cz) => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); P.add("tape", g, cx, y, cz); };
    strip(t, z1 - z0, -x, (z0 + z1) / 2); strip(t, z1 - z0, x, (z0 + z1) / 2); strip(2 * x + t, t, 0, z0); strip(2 * x + t, t, 0, z1);
  }
  if (shell) shellParts(P, n, style, shell, lod, fixtures);
  else { // no room of the kit's own: still the ceiling's lamps' positions for lights.js (the circuit garage's own strips)
    for (const q of [0.3, 0.7]) fixtures.push({ kind: "ceiling", x: -W / 2 + W * q, y: H - 0.05, z: D / 2, len: D * 0.7, along: "z" });
  }
  // the team's sign, a plate on the back wall's top (or the left wall's)
  if (signs.length) {
    const sw = Math.min(3.6, W * 0.62), sh = sw / 4, y = Math.min(H - sh / 2 - 0.25, 2.9);
    const g = new THREE.PlaneGeometry(sw, sh);
    if (style.signage === "side" && plan.strips.side > 0.2) P.add("sign", g, -W / 2 + 0.02, y, Math.min(D - sw / 2 - 0.3, D * 0.62), 0, Math.PI / 2);
    else P.add("sign", g, 0, y, D - 0.025, 0, Math.PI);
  }
  const tris = Math.round(P.triangles), geos = P.bake();
  const group = new THREE.Group(); group.name = "garageBay";
  let draws = 0;
  for (const [slot, geo] of geos) {
    const mat = TM.M[slot] || lib.M[slot];
    if (!mat) { geo.dispose(); continue; }
    const mesh = new THREE.Mesh(geo, mat); mesh.name = "bay:" + slot;
    mesh.receiveShadow = opts.shadows !== false && slot !== "contact" && slot !== "glow" && slot !== "screen";
    mesh.castShadow = opts.shadows !== false && CASTS.has(slot);
    if (slot === "contact") mesh.renderOrder = 1;
    group.add(mesh); draws++;
  }
  new THREE.Matrix4().fromArray(frameMatrix(n)).decompose(group.position, group.quaternion, group.scale);
  group.userData = { plan, fixtures, lod, zone: n, style: { key: style.key, seed: style.seed }, stats: { draws, triangles: tris }, materials: TM.own };
  return group;
}

// The room: floor, lined walls (with openings), ceiling with beams and the lamps' fittings, the header over the door
// with its rolled-up shutter. In the bay frame.
function shellParts(P, n, style, S, lod, fixtures) {
  const W = n.width, D = n.depth, H = n.ceilingH, walls = S.walls || [], open = S.openings || [];
  if (S.floor) { const g = new THREE.PlaneGeometry(W, D); g.rotateX(-Math.PI / 2); P.add("floor", g, 0, 0, D / 2); }
  // a wall from a to b (bay-frame x, z at floor) facing inward (its normal), minus its openings: pieces left, right, above
  const wall = (name, a, b, nrm) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ry = Math.atan2(nrm[0], nrm[1]);
    const holes = open.filter((o) => o.wall === name).map((o) => [o.z0, o.z1, o.h]).sort((p, q) => p[0] - q[0]);
    let s = 0;
    const panel = (s0, s1, y0, y1) => {
      if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
      const g = new THREE.PlaneGeometry(s1 - s0, y1 - y0), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (s0 + uv.getX(i) * (s1 - s0)) / 2.4, (y0 + uv.getY(i) * (y1 - y0)) / H);
      const f = (s0 + s1) / 2 / L, x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
      // (the plane faces +z; turned to face the wall's normal; its own +x then runs from a to b or b to a – the uv's s
      // flips with it, which only mirrors the lining's texture along the wall)
      P.add("wall", g, x, (y0 + y1) / 2, z, 0, ry);
    };
    for (const [h0, h1, hh] of holes) { panel(s, h0, 0, H); panel(h0, h1, hh, H); s = h1; }
    panel(s, L, 0, H);
    // joints between the lining's panels and the skirting (lod 0–1)
    if (lod < 2) {
      const step = (style.wall?.seams || 1.2) * 2;
      for (let d = step; d < L - 0.1; d += step) {
        if (holes.some(([h0, h1]) => d > h0 - 0.05 && d < h1 + 0.05)) continue;
        const f = d / L; P.box("dark", 0.014, H - 0.14, 0.008, a[0] + (b[0] - a[0]) * f + nrm[0] * 0.004, (H + 0.14) / 2, a[1] + (b[1] - a[1]) * f + nrm[1] * 0.004, 0, ry);
      }
      let s2 = 0;
      for (const [h0, h1] of [...holes, [L, L]]) { if (h0 - s2 > 0.02) { const f = (s2 + h0) / 2 / L; P.box("dark", h0 - s2, 0.12, 0.02, a[0] + (b[0] - a[0]) * f + nrm[0] * 0.01, 0.06, a[1] + (b[1] - a[1]) * f + nrm[1] * 0.01, 0, ry); } s2 = h1; }
    }
  };
  const hw = W / 2;
  // (each wall's run follows the z or x it is named by: the openings' z0 / z1 are along the side walls from the door)
  if (walls.includes("left")) wall("left", [-hw, 0], [-hw, D], [1, 0]);
  if (walls.includes("right")) wall("right", [hw, 0], [hw, D], [-1, 0]);
  if (walls.includes("back")) wall("back", [-hw, D], [hw, D], [0, -1]);
  if (S.ceiling) {
    const g = new THREE.PlaneGeometry(W, D); g.rotateX(Math.PI / 2); P.add("ceiling", g, 0, H, D / 2);
    // steel beams across the room (every ~2.4 m) and the lamps' fittings: long diffusers in dark housings – along the
    // room in two rows, or across it (the team's style); each fitting is where lights.js may put a real light
    if (lod < 2) for (let z = 1.2; z < D - 0.3; z += 2.4) P.box("dark", W, 0.22, 0.16, 0, H - 0.11, z);
    const strips = style.lights === "across" ? Array.from({ length: Math.max(2, Math.floor(D / 2.6)) }, (_, i) => ({ x: 0, z: (D * (i + 0.5)) / Math.max(2, Math.floor(D / 2.6)), len: W * 0.7, along: "x" }))
      : [-W / 4, W / 4].map((x) => ({ x, z: D / 2, len: D * 0.78, along: "z" }));
    for (const s of strips) {
      const [w, d] = s.along === "x" ? [s.len, 0.2] : [0.2, s.len];
      P.box("dark", w + 0.06, 0.07, d + 0.06, s.x, H - 0.26, s.z);
      P.box("glow", w, 0.01, d, s.x, H - 0.3, s.z);
      fixtures.push({ kind: "ceiling", x: s.x, y: H - 0.31, z: s.z, len: s.len, along: s.along });
    }
  }
  if (S.header) {
    // the wall over the door (door height to the ceiling) and its sides if the door is narrower than the room; the
    // shutter rolled up in its box just inside, over the opening
    const dw = n.doorW, dh = n.doorH;
    const g = new THREE.PlaneGeometry(W, H - dh); P.add("wallPlain", g, 0, (H + dh) / 2, 0.01);
    if (W - dw > 0.02) for (const sx of [-1, 1]) { const w = (W - dw) / 2, g2 = new THREE.PlaneGeometry(w, dh); P.add("wallPlain", g2, sx * (dw / 2 + w / 2), dh / 2, 0.01); }
    const yd = Math.min(dh + 0.2, H - 0.19);
    P.box("dark", dw, 0.36, 0.4, 0, yd, 0.22);
    if (lod < 2) P.cyl("steel", 0.06, 0.06, dw - 0.1, 10, 0, yd, 0.22, 0, 0, Math.PI / 2);
  }
  // shutters in the side openings (a partition's roller shutter, part raised): corrugated slats, the drum's box
  for (const o of open) {
    if (!o.shutter) continue;
    const L = o.z1 - o.z0, x = o.wall === "left" ? -hw + 0.06 : hw - 0.06, yb = o.shutter;
    const slats = Math.max(1, Math.round((o.h - yb) / 0.09));
    for (let i = 0; i < slats; i++) P.box("alu", 0.03 + (i % 2) * 0.012, (o.h - yb) / slats - 0.006, L, x, yb + ((o.h - yb) * (i + 0.5)) / slats, (o.z0 + o.z1) / 2);
    P.box("dark", 0.4, 0.4, L + 0.2, x + (o.wall === "left" ? 0.15 : -0.15), o.h + 0.2, (o.z0 + o.z1) / 2);
    P.box("steel", 0.06, yb, 0.06, x, yb / 2, o.z0 - 0.03); P.box("steel", 0.06, yb, 0.06, x, yb / 2, o.z1 + 0.03);
    P.box("accent", 0.05, 0.05, L, x, yb + 0.02, (o.z0 + o.z1) / 2);
  }
}
