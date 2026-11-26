// Famous buildings around the circuits, modelled after the real ones (published dimensions; positions from the
// map data or their coordinates). Each replaces the generic block the map data would give.
//   Las Vegas: Sphere (157 m across, 112 m high, LED skin)      Singapore: Marina Bay Sands SkyPark (340 m),
//   Singapore Flyer (150 m wheel, 165 m high)                    Baku: Flame Towers (182 / 165 / 161 m)
//   Abu Dhabi: W hotel's LED gridshell over the track, Ferrari World's red roof
//   (Bahrain's Sakhir Tower: a model, facilities.js)             (Austin's tower: a model, facilities.js)
//   Miami: Hard Rock Stadium (bowl, canopy, four masts)
// (Circuit facilities – Silverstone's Wing, Suzuka's pit building – are in facilities.js.)
import * as THREE from "./vendor/three.module.js";
import { entryAt } from "./venues.js";

const polyArea = (pts) => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return a / 2; };
function inPoly(x, y, pts) { let r = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r; } return r; }
const centroid = (pts) => { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; };
function edgeDist(x, z, pts) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}
// oriented box of a footprint by its principal axes
function obb(pts) {
  const [cx, cz] = centroid(pts);
  let sxx = 0, szz = 0, sxz = 0;
  for (const [x, z] of pts) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
  const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), u = [Math.cos(th), Math.sin(th)], v = [-u[1], u[0]];
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of pts) { const a = (x - cx) * u[0] + (z - cz) * u[1], b = (x - cx) * v[0] + (z - cz) * v[1]; u0 = Math.min(u0, a); u1 = Math.max(u1, a); v0 = Math.min(v0, b); v1 = Math.max(v1, b); }
  return u1 - u0 >= v1 - v0 ? { c: [cx, cz], u, v, u0, u1, v0, v1 } : { c: [cx, cz], u: v, v: [-u[0], -u[1]], u0: v0, u1: v1, v0: -u1, v1: -u0 };
}
// The convex outline round a set of points (monotone chain) – several pieces of one mapped outline taken as one.
export function hull(points) {
  const P = points.map(([x, z]) => [x, z]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 4) return P;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (pts) => { const h = []; for (const p of pts) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
  return half(P).concat(half(P.slice().reverse()));
}
// The smallest box round an outline (the best of its edges' directions) in obb()'s form, its centre the box's own
// middle. obb() takes the outline's main direction from its corner points: a nearly square outline whose corners
// crowd two of its sides (Hard Rock Stadium's grounds, 261 × 275 m) came out turned 46° and 369 × 366 m, its middle
// 40 m off – and the stadium built from it stood through the pit building into the pit lane (v0.63).
export function minBox(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], l = Math.hypot(bx - ax, bz - az); if (l < 1) continue;
    const u = [(bx - ax) / l, (bz - az) / l], v = [-u[1], u[0]];
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of pts) { const a = x * u[0] + z * u[1], b = x * v[0] + z * v[1]; u0 = Math.min(u0, a); u1 = Math.max(u1, a); v0 = Math.min(v0, b); v1 = Math.max(v1, b); }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, u, v, u0, u1, v0, v1 };
  }
  if (!best) return obb(pts);
  const { u, v, u0, u1, v0, v1 } = best, mu = (u0 + u1) / 2, mv = (v0 + v1) / 2, c = [u[0] * mu + v[0] * mv, u[1] * mu + v[1] * mv], hu = (u1 - u0) / 2, hv = (v1 - v0) / 2;
  return hu >= hv ? { c, u, v, u0: -hu, u1: hu, v0: -hv, v1: hv } : { c, u: v, v: [-u[0], -u[1]], u0: -hv, u1: hv, v0: -hu, v1: hu };
}
// vertical wall strips along an outline, h high from y0, as one mesh
function wallStrip(pts, y0, h, mat) {
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], v = pos.length / 3; pos.push(ax, y0, az, bx, y0, bz, bx, y0 + h, bz, ax, y0 + h, az); idx.push(v, v + 1, v + 2, v, v + 2, v + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  mat.side = THREE.DoubleSide; return new THREE.Mesh(g, mat);
}
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1, ...o });
// emissive strength by day / night (switched in map3d.applyLighting)
const lit = (m, day, night) => { m.userData.nightE = [day, night]; m.emissiveIntensity = day; return m; };
function canvasTex(w, h, draw, srgb = true) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function rand(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const tube = (pts, r, mat, seg = 24) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 6, false), mat);
const cylBetween = (a, b, r, mat) => {
  const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6, 1), mat);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
};

// ---------- the landmarks ----------
const SPECS = [
  // Sphere: a 157 m ball standing 112 m high; its skin is 1.2 million LED pucks (here: the Earth at night)
  { loc: ["Las Vegas"], match: (b) => /^sphere$/i.test(b.name || ""), build({ b, pts, base, add }) {
    const [cx, cz] = centroid(pts), r = 78.5, cy = base + 112 - r;
    const tex = canvasTex(2048, 1024, (g, w, h) => {
      const rr = rand(7); g.fillStyle = "#0b2a5a"; g.fillRect(0, 0, w, h);
      // continents: blobs of noise, lit cities as dots
      for (let k = 0; k < 900; k++) { const x = rr() * w, y = h * (0.15 + rr() * 0.7), s = 8 + rr() * 60; if (Math.sin(x * 0.006) * Math.cos(y * 0.011) + rr() * 0.4 < 0.25) continue; g.fillStyle = `rgba(${40 + rr() * 60 | 0},${110 + rr() * 60 | 0},${50 + rr() * 30 | 0},0.6)`; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); }
      for (let k = 0; k < 3000; k++) { g.fillStyle = `rgba(255,${200 + rr() * 55 | 0},140,${0.4 + rr() * 0.6})`; g.fillRect(rr() * w, h * (0.2 + rr() * 0.6), 2, 2); }
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(255,255,255,0.35)"); gr.addColorStop(0.12, "rgba(255,255,255,0)"); gr.addColorStop(0.88, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(255,255,255,0.35)"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const m = lit(std({ color: 0x15181c, roughness: 0.35, metalness: 0.4, emissive: 0xffffff, emissiveMap: tex }), 0.55, 1.6);
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 64), m); s.position.set(cx, cy, cz); s.rotation.y = 1.1; add(s);
  } },
  // Marina Bay Sands: the three 193 m hotel towers (drawn as buildings) carry the SkyPark, a 340 m long, 38 m wide
  // deck shaped like a ship's hull that overhangs the north tower by 67 m
  { loc: ["Marina Bay", "Singapore"], group: (bs) => bs.filter((b) => /Marina Bay Sands Tower/i.test(b.name || "")), keep: true, build({ items, groundAt, add }) {
    if (items.length < 2) return;
    const cs = items.map((it) => ({ n: +(/(\d)/.exec(it.b.name)?.[1] || 0), c: centroid(it.pts), h: it.b.h, base: Math.min(...it.pts.map(([x, z]) => groundAt(x, z))) })).sort((a, b) => a.n - b.n);
    const a = cs[0].c, z = cs[cs.length - 1].c, L0 = Math.hypot(z[0] - a[0], z[1] - a[1]), d = [(z[0] - a[0]) / L0, (z[1] - a[1]) / L0], n = [-d[1], d[0]];
    const top = Math.max(...cs.map((c) => c.base + c.h)), s0 = -47, s1 = L0 + 67, W = 19;
    // hull outline (plan): pointed ends, widest at the middle tower
    const outline = [];
    for (let k = 0; k <= 24; k++) { const t = k / 24, s = s0 + (s1 - s0) * t, w = W * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t * 1.08 - 0.02))), 0.35); outline.push([a[0] + d[0] * s + n[0] * w, a[1] + d[1] * s + n[1] * w]); }
    for (let k = 24; k >= 0; k--) { const t = k / 24, s = s0 + (s1 - s0) * t, w = W * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t * 1.08 - 0.02))), 0.35); outline.push([a[0] + d[0] * s - n[0] * w, a[1] + d[1] * s - n[1] * w]); }
    const shape = new THREE.Shape(outline.map(([x, zz]) => new THREE.Vector2(x, -zz)));
    const hull = new THREE.ExtrudeGeometry(shape, { depth: 7, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.2, bevelSegments: 2 });
    hull.rotateX(-Math.PI / 2); hull.translate(0, top - 7, 0);
    add(new THREE.Mesh(hull, std({ color: 0xe9ecef, roughness: 0.45, metalness: 0.25 })));
    // the infinity pool along the north half, palms and a deck
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(150, 14), std({ color: 0x2b9ccf, roughness: 0.05, metalness: 0.3, emissive: 0x0a3a50 }));
    pool.rotation.x = -Math.PI / 2; pool.rotation.z = -Math.atan2(d[1], d[0]); const pm = [a[0] + d[0] * (L0 * 0.55 + 30), a[1] + d[1] * (L0 * 0.55 + 30)];
    pool.position.set(pm[0], top + 1.6, pm[1]); add(pool);
  } },
  // Singapore Flyer: a 150 m wheel whose top is 165 m up, 28 capsules, on an A-frame over the terminal
  { loc: ["Marina Bay", "Singapore"], at: [1.28941, 103.86313], clear: 45, build({ x, z, base, add }) {
    const R = 75, hub = base + 165 - R, ang = (135 * Math.PI) / 180, dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)), axis = new THREE.Vector3(-dir.z, 0, dir.x);
    const steel = std({ color: 0xf2f4f5, roughness: 0.4, metalness: 0.5 }), cable = std({ color: 0xc8ccd0, metalness: 0.6 });
    const g = new THREE.Group(); g.position.set(x, hub, z); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis); add(g);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(R, 1.4, 8, 160), steel), new THREE.Mesh(new THREE.TorusGeometry(R - 4, 0.8, 6, 160), steel));
    for (let k = 0; k < 56; k++) { const t = (k / 56) * Math.PI * 2; g.add(cylBetween(new THREE.Vector3(0, 0, k % 2 ? 2.5 : -2.5), new THREE.Vector3(Math.cos(t) * (R - 4), Math.sin(t) * (R - 4), 0), 0.12, cable)); }
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 9, 16).rotateX(Math.PI / 2), steel));
    const pod = lit(std({ color: 0xbfd7e6, roughness: 0.15, metalness: 0.3, emissive: 0xffe6b0 }), 0, 0.8);
    for (let k = 0; k < 28; k++) { const t = (k / 28) * Math.PI * 2, p = new THREE.Mesh(new THREE.CapsuleGeometry(2, 9, 4, 10).rotateZ(Math.PI / 2), pod); p.position.set(Math.cos(t) * (R + 3), Math.sin(t) * (R + 3), 0); g.add(p); }
    // A-frame legs and the terminal under them
    for (const s of [-1, 1]) for (const f of [-1, 1]) add(cylBetween(new THREE.Vector3(x + dir.x * f * 32 + axis.x * s * 12, base + 18, z + dir.z * f * 32 + axis.z * s * 12), new THREE.Vector3(x + axis.x * s * 5, hub, z + axis.z * s * 5), 1.8, steel));
    const term = new THREE.Mesh(new THREE.BoxGeometry(110, 18, 70), std({ color: 0xd9dee2, roughness: 0.3, metalness: 0.2 })); term.position.set(x, base + 9, z); term.rotation.y = -ang; add(term);
  } },
  // Flame Towers: three glass towers shaped like flames (182, 165, 161 m), LED flames on their skin at night
  { loc: ["Baku"], at: [40.36036, 49.82635], clear: 120, build({ x, z, groundAt, add }) {
    const flames = canvasTex(512, 1024, (g, w, h) => {
      const rr = rand(3); g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 60; k++) { const cx = rr() * w, wd = 30 + rr() * 80; const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, "rgba(255,80,0,0.9)"); gr.addColorStop(0.5, "rgba(255,170,30,0.7)"); gr.addColorStop(1, "rgba(255,230,120,0)"); g.fillStyle = gr; g.beginPath(); g.moveTo(cx - wd, h); g.quadraticCurveTo(cx - wd * 0.2, h * (0.3 + rr() * 0.4), cx + (rr() - 0.5) * wd, h * (rr() * 0.3)); g.quadraticCurveTo(cx + wd * 0.2, h * 0.5, cx + wd, h); g.fill(); }
    });
    // by day: blue glass with the floor lines showing
    const floors = canvasTex(64, 1024, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, "#7d9fbb"); gr.addColorStop(1, "#b8d0e2"); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(30,45,60,0.35)"; for (let y = 0; y < h; y += 22) g.fillRect(0, y, w, 3); });
    const glass = lit(std({ color: 0xffffff, map: floors, roughness: 0.18, metalness: 0.35, emissive: 0xffffff, emissiveMap: flames }), 0, 1.3);
    for (const [bear, H, Wd] of [[150, 182, 56], [270, 165, 50], [30, 161, 50]]) {
      const b = (bear * Math.PI) / 180, px = x + Math.sin(b) * 52, pz = z - Math.cos(b) * 52, base = groundAt(px, pz);
      // the flame's plan: a lens with a sharp edge facing out; it narrows and leans in towards the top
      const pos = [], idx = [], uvs = [], rings = 40, seg = 36;
      for (let i = 0; i <= rings; i++) {
        // a flame: full and round low down, swelling a little, then curling in to a point that leans to the middle
        const t = i / rings, w = Wd * (1 + 0.12 * Math.sin(Math.PI * t * 1.2)) * Math.pow(Math.max(0, 1 - Math.pow(t, 2.4)), 0.6) + 0.3, lean = -Wd * 0.55 * Math.pow(t, 2.2);
        for (let j = 0; j <= seg; j++) {
          const a = (j / seg) * Math.PI * 2, lens = Math.pow(Math.abs(Math.cos(a)), 0.6) * Math.sign(Math.cos(a));
          const lx = lens * w * 0.5 + lean, lz = Math.sin(a) * w * 0.42;
          pos.push(px + Math.sin(b) * lx + Math.cos(b) * lz, base + H * t, pz - Math.cos(b) * lx + Math.sin(b) * lz); uvs.push(j / seg, t);
        }
      }
      for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const p = i * (seg + 1) + j; idx.push(p, p + seg + 1, p + 1, p + 1, p + seg + 1, p + seg + 2); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, glass); m.castShadow = true; add(m);
    }
  } },
  // W Abu Dhabi – Yas Island: two hotel blocks either side of the track joined by a bridge, under a 217 m
  // freeform gridshell of 5,389 glass diamonds that glow in colours at night
  { loc: ["Yas Island", "Yas Marina", "Abu Dhabi"], group: (bs) => bs.filter((b) => /W Hotel|Yas (Viceroy|Hotel)/i.test(b.name || "")), keep: true, build({ items, groundAt, add }) {
    if (!items.length) return;
    const all = items.flatMap((it) => it.pts), o = obb(all), top = Math.max(...items.map((it) => it.b.h)) + Math.min(...all.map(([x, z]) => groundAt(x, z)));
    const L = Math.max(217, o.u1 - o.u0 + 30), W = Math.max(85, o.v1 - o.v0 + 24), cu = (o.u0 + o.u1) / 2, cv = (o.v0 + o.v1) / 2;
    const lattice = canvasTex(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = "rgba(170,200,222,0.42)"; g.fillRect(0, 0, w, h); g.strokeStyle = "#f4f6f8"; g.lineWidth = 18; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath(); g.stroke(); });
    lattice.wrapS = lattice.wrapT = THREE.RepeatWrapping;
    const glow = canvasTex(256, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); for (const [t, c] of [[0, "#3a6cff"], [0.35, "#b23cff"], [0.6, "#ff3c9a"], [0.8, "#3cd2ff"], [1, "#3a6cff"]]) gr.addColorStop(t, c); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const mat = lit(std({ color: 0xffffff, map: lattice, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.3, metalness: 0.5, emissive: 0xffffff, emissiveMap: glow }), 0, 1.1);
    // the shell: a smooth wave rising over each block, dipping over the track between them
    const nu = 72, nv = 28, pos = [], uv = [], idx = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const s = i / nu, t = j / nv, uu = cu + (s - 0.5) * L, vv = cv + (t - 0.5) * W;
      const edge = Math.sin(Math.PI * t) ** 0.8 * Math.sin(Math.PI * s) ** 0.35, wave = 0.85 + 0.15 * Math.cos(s * Math.PI * 4);
      const y = top - 18 + 26 * edge * wave;
      pos.push(o.c[0] + o.u[0] * uu + o.v[0] * vv, y, o.c[1] + o.u[1] * uu + o.v[1] * vv); uv.push(s * L / 9, t * W / 9);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const p = i * (nv + 1) + j; idx.push(p, p + nv + 1, p + 1, p + 1, p + nv + 1, p + nv + 2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 2; add(m);
  } },
  // Ferrari World: the 200,000 m² red roof (its outline is in the map data as a red-roofed building part),
  // a low shell rising to 48 m, with the glass funnel at its heart
  { loc: ["Yas Island", "Yas Marina", "Abu Dhabi"], match: (b, area) => /^#?ed1b24$/i.test(b.roofColour || "") && area > 60000, build({ pts, base, add }) {
    const o = obb(pts), [cx, cz] = centroid(pts);
    let maxD = 0; for (let x = o.u0; x < o.u1; x += 15) for (let v = o.v0; v < o.v1; v += 15) { const px = o.c[0] + o.u[0] * x + o.v[0] * v, pz = o.c[1] + o.u[1] * x + o.v[1] * v; if (inPoly(px, pz, pts)) maxD = Math.max(maxD, edgeDist(px, pz, pts)); }
    const step = 6, nu = Math.ceil((o.u1 - o.u0) / step), nv = Math.ceil((o.v1 - o.v0) / step), pos = [], uv = [], idx = [], id = new Int32Array((nu + 1) * (nv + 1)).fill(-1);
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const uu = o.u0 + i * step, vv = o.v0 + j * step, px = o.c[0] + o.u[0] * uu + o.v[0] * vv, pz = o.c[1] + o.u[1] * uu + o.v[1] * vv;
      if (!inPoly(px, pz, pts) && edgeDist(px, pz, pts) > step * 0.8) continue;
      const k = Math.min(1, edgeDist(px, pz, pts) / maxD) * (inPoly(px, pz, pts) ? 1 : 0), y = base + 10 + 38 * Math.pow(Math.sin((k * Math.PI) / 2), 0.7);
      id[i * (nv + 1) + j] = pos.length / 3; pos.push(px, y, pz); uv.push(uu / 20, vv / 20);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = id[i * (nv + 1) + j], b = id[(i + 1) * (nv + 1) + j], c = id[i * (nv + 1) + j + 1], d = id[(i + 1) * (nv + 1) + j + 1]; if (a < 0 || b < 0 || c < 0 || d < 0) continue; idx.push(a, c, b, b, c, d); }
    const ribs = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#d7141f"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(0,0,0,0.12)"; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 4, h); });
    ribs.wrapS = ribs.wrapT = THREE.RepeatWrapping;
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const roof = new THREE.Mesh(geo, std({ color: 0xffffff, map: ribs, roughness: 0.35, metalness: 0.25, side: THREE.DoubleSide })); roof.castShadow = roof.receiveShadow = true; add(roof);
    // glazed walls under the eaves and the funnel
    const wall = std({ color: 0x2c3a44, roughness: 0.15, metalness: 0.4 });
    add(wallStrip(pts, base, 10, wall));
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(42, 8, 34, 32, 1, true), std({ color: 0x9fc3d8, roughness: 0.1, metalness: 0.6, side: THREE.DoubleSide }));
    funnel.position.set(cx, base + 48 - 15, cz); add(funnel);
  } },
  // (Sakhir Tower: since v0.63 a model of its own – facilities.js `sakhir-tower`; the stem-and-cap drawn here until then
  // was unlike the real tower, a drum of ringed storeys from the ground up)
  // (COTA's observation tower: since v0.67 a model of its own – facilities.js `austin-tower`; the core in a cone of
  // tubes drawn here until then was unlike the real one, a square shaft with the tubes down one side and out over the stage)
  // Hard Rock Stadium: the seating bowl inside a 14-acre canopy held by four corner masts
  // (v0.63: ONE stadium from every piece of the grounds' outline – the map data has it in two halves, and one stadium
  // was built per half: the northern one stood through the pit building into the pit lane. And minBox, not obb: the
  // whole outline is nearly square – see minBox.)
  { loc: ["Miami", "Miami Gardens"], group: (bs) => bs.filter((b) => /Hard Rock Stadium/i.test(b.name || "")), build({ items, groundAt, add }) {
    const pts = hull(items.flatMap((it) => it.pts)), base = Math.min(...pts.map(([x, z]) => groundAt(x, z)));
    if (!Number.isFinite(base)) return;
    const o = minBox(pts), [cx, cz] = o.c, ang = Math.atan2(o.u[1], o.u[0]), L = o.u1 - o.u0, W = o.v1 - o.v0;
    // the bowl is an oval inside the mapped outline (which takes in the concourse and plaza)
    const ring = (k) => Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2, ex = Math.cos(a) * L * 0.42 * k, ey = Math.sin(a) * W * 0.44 * k; return [cx + o.u[0] * ex + o.v[0] * ey, cz + o.u[1] * ex + o.v[1] * ey]; });
    const outer = ring(1), inner = ring(0.6);
    const wallM = std({ color: 0xe8ecef, roughness: 0.6 }), seatM = std({ color: 0x0f6f73, roughness: 0.7 });
    add(wallStrip(outer, base, 30, wallM));
    // the bowl: a sloped band from the field up to the rim
    const pos = [], idx = [];
    for (let i = 0; i < outer.length; i++) { pos.push(inner[i][0], base + 2, inner[i][1], outer[i][0], base + 28, outer[i][1]); }
    for (let i = 0; i < outer.length; i++) { const a = i * 2, b = ((i + 1) % outer.length) * 2; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const bowl = new THREE.BufferGeometry(); bowl.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); bowl.setIndex(idx); bowl.computeVertexNormals();
    add(new THREE.Mesh(bowl, Object.assign(seatM, { side: THREE.DoubleSide })));
    const field = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.42, W * 0.36), std({ color: 0x3f8a3a, roughness: 0.9 })); field.rotation.x = -Math.PI / 2; field.rotation.z = -ang; field.position.set(cx, base + 2.1, cz); add(field);
    // canopy over the seats, masts at the corners
    const cpos = [], cidx = [], c1 = ring(1.04), c2 = ring(0.74);
    for (let i = 0; i < c1.length; i++) cpos.push(c1[i][0], base + 46, c1[i][1], c2[i][0], base + 49, c2[i][1]);
    for (let i = 0; i < c1.length; i++) { const a = i * 2, b = ((i + 1) % c1.length) * 2; cidx.push(a, b, a + 1, b, b + 1, a + 1); }
    const can = new THREE.BufferGeometry(); can.setAttribute("position", new THREE.Float32BufferAttribute(cpos, 3)); can.setIndex(cidx); can.computeVertexNormals();
    add(new THREE.Mesh(can, std({ color: 0xf6f7f8, roughness: 0.5, side: THREE.DoubleSide })));
    const mastM = std({ color: 0xdfe3e6, metalness: 0.5 });
    for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const mx = cx + o.u[0] * su * L * 0.36 + o.v[0] * sv * W * 0.4, mz = cz + o.u[1] * su * L * 0.36 + o.v[1] * sv * W * 0.4;
      add(cylBetween(new THREE.Vector3(mx, base, mz), new THREE.Vector3(mx, base + 88, mz), 1.2, mastM));
      add(cylBetween(new THREE.Vector3(mx, base + 88, mz), new THREE.Vector3(cx + (mx - cx) * 0.75, base + 49, cz + (mz - cz) * 0.75), 0.25, mastM));
    }
  } },

  // ---------- Monza (research: v039/research/monza_buildings.md, 2026-10-18) ----------
  // The podium (since 2002): a round deck "projecting over the track like an open hand" (ACI poster, 2023), on a
  // central column over the pit wall at the south end of the pit building, joined to it by a footbridge over the pit
  // lane (OSM ways 219396377 "Podio" – circle Ø ~11 m – and 219396384, the bridge, ~7 m, both layer 1 – H); a thick red
  // tubular ring round the deck's edge and a steel railing (Commons "Podio Monza 2011.jpg" – H for the shape). The
  // deck's height, ~9.5 m (about level with the pit building's terrace), the column and the backdrop are read off
  // photos – L. (No sponsor panels: a plain backdrop.)
  // (givesWayTo: built as below only where the facility of that id has not come as a model – facilities.js combine.
  // No such model stands yet: the one made in 2026-11 had its deck at 6.0 m; Commons 'Podio Monza 2011.jpg' shows the deck
  // about level with the pit building's roof terrace – people behind its glass rail under the canopy –, as the 9.5 m here.
  // It was held back; one at 9–10 m takes this one's place under the id below.)
  { venue: [39], loc: ["Monza"], givesWayTo: "monza-podium", match: (b) => /^podio$/i.test(b.name || ""), build({ pts, base, groundAt, add, toTrack }) {
    const [cx, cz] = centroid(pts); let rad = 0; for (const [x, z] of pts) rad = Math.max(rad, Math.hypot(x - cx, z - cz));
    rad = Math.min(7, Math.max(4.5, rad));
    const [tx, tz] = toTrack(cx, cz), g = Math.max(base, groundAt(cx, cz)), deck = g + 9.5;
    const grey = std({ color: 0xc9cbcd, roughness: 0.55 }), red = std({ color: 0xc8102e, roughness: 0.45, metalness: 0.2 }), steel = std({ color: 0x8d9296, roughness: 0.4, metalness: 0.6 });
    // the column under the deck's middle: the OSM circle's centre is ~8 m off the track's centre line, on the pit wall
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, deck - g, 16), grey); col.position.set(cx, g + (deck - g) / 2, cz); add(col);
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 0.92, 0.7, 40), grey); slab.position.set(cx, deck - 0.35, cz); add(slab);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.32, 10, 48), red); ring.rotation.x = Math.PI / 2; ring.position.set(cx, deck - 0.1, cz); add(ring);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(rad - 0.2, 0.05, 6, 48), steel); rail.rotation.x = Math.PI / 2; rail.position.set(cx, deck + 1.1, cz); add(rail);
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; add(cylBetween(new THREE.Vector3(cx + Math.cos(a) * (rad - 0.2), deck, cz + Math.sin(a) * (rad - 0.2)), new THREE.Vector3(cx + Math.cos(a) * (rad - 0.2), deck + 1.1, cz + Math.sin(a) * (rad - 0.2)), 0.04, steel)); }
    // the backdrop on the deck's pit-building half, and the footbridge to the building (away from the track)
    const ang = Math.atan2(-tz, -tx), back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.6, rad * 1.5), grey);
    back.position.set(cx - tx * rad * 0.55, deck + 1.8, cz - tz * rad * 0.55); back.rotation.y = -ang; add(back);
    // three flag poles behind the backdrop (~8 m – photo 2011, L)
    for (const o of [-0.45, 0, 0.45]) { const px = cx - tx * rad * 0.7 + tz * rad * o * 1.5, pz = cz - tz * rad * 0.7 - tx * rad * o * 1.5; add(cylBetween(new THREE.Vector3(px, deck, pz), new THREE.Vector3(px, deck + 8, pz), 0.06, steel)); }
    const br = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 2.6), grey); br.position.set(cx - tx * (rad + 3.6), deck - 0.3, cz - tz * (rad + 3.6)); br.rotation.y = -ang; add(br);
  } },
  // The Hospitality Building at the pit exit (OSM way 194458105, 90 × 29 m – H): ground + 1st + 2nd floor ("Race
  // Club" on the 1st and 2nd floors overlooking the grid and the pit lane – monzanet hospitality brochure 2026 – H),
  // glazed storeys in silver frames under a thin flat roof (photos – M): the map's block, drawn with ribbon glazing
  { venue: [39], loc: ["Monza"], group: (bs) => bs.filter((b) => /^hospitality building$/i.test(b.name || "")), keep: true, look: { ribbon: true }, build() {} },
  // The two 1955 timing towers on the main straight, hospitality since 1997 (ACI poster 2023; monzanet "Tower" package
  // 2026 – H): Torre Sud by the finish line, Torre Nord towards the first chicane (OSM nodes 2396630532 / 2396630508 –
  // points only). A square tower with rounded corners: a concrete pier at the foot, a grey metal band, three storeys of
  // continuous blue-green curtain wall, a recessed glazed top floor, a flat roof (photos – M); ~9 × 9 m, ~21 m high – L.
  ...[["sud", [45.6162, 9.28064]], ["nord", [45.62144, 9.28133]]].map(([k, at]) => ({ venue: [39], loc: ["Monza"], at, clear: 6, givesWayTo: "monza-torre-" + k, build({ x, z, base, add }) {
    const glass = std({ color: 0x5f8f8c, roughness: 0.15, metalness: 0.5 }), conc = std({ color: 0xbdb9b1, roughness: 0.8 }), band = std({ color: 0x8e9398, roughness: 0.5, metalness: 0.4 });
    const block = (y0, h, w, m, r = 1.6) => { const sh = new THREE.Shape(), a = w / 2 - r; sh.moveTo(-a, -w / 2); sh.lineTo(a, -w / 2); sh.absarc(a, -a, r, -Math.PI / 2, 0); sh.lineTo(w / 2, a); sh.absarc(a, a, r, 0, Math.PI / 2); sh.lineTo(-a, w / 2); sh.absarc(-a, a, r, Math.PI / 2, Math.PI); sh.lineTo(-w / 2, -a); sh.absarc(-a, -a, r, Math.PI, Math.PI * 1.5);
      const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 4 }); g.rotateX(-Math.PI / 2); const m3 = new THREE.Mesh(g, m); m3.position.set(x, y0, z); add(m3); };
    block(base, 4.2, 4.5, conc, 0.8);          // the pier with its stair
    block(base + 4.2, 2.2, 9, band);           // metal-clad band
    block(base + 6.4, 10.2, 9, glass);         // three glazed storeys
    for (const y of [9.8, 13.2, 16.6]) block(base + y, 0.25, 9.1, band);   // floor edges
    block(base + 16.6, 3.6, 7.6, glass);       // recessed top floor
    block(base + 20.2, 0.5, 8, band);          // the roof
  } })),
];

// scene, gf, groundAt, location, toTrack(x, z) → unit direction to the nearest track point.
// Returns { group, skip(b) → true for buildings a landmark replaces, restyle(b) → style overrides, keepOut(x, z) }.
export function buildLandmarks({ scene, gf, groundAt, location, venue = null, toTrack }) {
  const group = new THREE.Group(); group.name = "landmarks";
  const skip = new Set(), restyle = new Map(), zones = [], spots = [];
  const add = (m) => { m.castShadow = true; m.receiveShadow = true; group.add(m); };
  const item = (b) => { let pts = b.pts.map(gf.xz); if (pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1); return { b, pts, area: Math.abs(polyArea(pts)) }; };
  for (const spec of SPECS) {
    if (!entryAt(spec, venue, location)) continue;
    const n0 = group.children.length;
    try {
      if (spec.at) {
        const [x, z] = gf.fromLL(spec.at[0], spec.at[1]), base = groundAt(x, z);
        if (!Number.isFinite(base)) continue;
        for (const b of scene.buildings) { const ps = b.pts.map(gf.xz); if (ps.some(([px, pz]) => Math.hypot(px - x, pz - z) < spec.clear) || inPoly(x, z, ps)) skip.add(b); }
        zones.push([x, z, spec.clear]); spots.push([x, z, 160]);
        spec.build({ x, z, base, groundAt, add });
      } else if (spec.group) {
        const items = spec.group(scene.buildings).map(item);
        if (!items.length) continue;
        const look = spec.look || { glass: true };
        for (const it of items) { if (!spec.keep) skip.add(it.b); else restyle.set(it.b, look); }
        // unnamed parts of the same building (inside its outline) take the same look
        if (spec.keep) for (const b of scene.buildings) { if (restyle.has(b)) continue; const c = centroid(b.pts.map(gf.xz)); if (items.some((it) => inPoly(c[0], c[1], it.pts) || edgeDist(c[0], c[1], it.pts) < 6)) restyle.set(b, look); }
        const c = centroid(items.flatMap((it) => it.pts)); spots.push([c[0], c[1], 160]);
        spec.build({ items, groundAt, add });
      } else {
        for (const b of scene.buildings) {
          const it = item(b);
          if (!spec.match(b, it.area)) continue;
          const base = Math.min(...it.pts.map(([x, z]) => groundAt(x, z)));
          if (!Number.isFinite(base)) continue;
          if (!spec.keep) skip.add(b);
          const [cx, cz] = centroid(it.pts); zones.push([cx, cz, Math.sqrt(it.area / Math.PI) + 10]); spots.push([cx, cz, Math.max(120, Math.sqrt(it.area) * 1.6)]);
          spec.build({ b, pts: it.pts, base, groundAt, add, toTrack, scene, gf, skipB: (x) => skip.add(x) });
          break;
        }
      }
    } catch (e) { console.warn("landmark", e); }
    // (a landmark that gives way to a facility's model – spec.givesWayTo: its meshes marked, taken out by giveWay)
    if (spec.givesWayTo) for (const m of group.children.slice(n0)) m.userData.givesWayTo = spec.givesWayTo;
  }
  return {
    // giveWay(ids): the landmarks built here that a facility model now stands for (ids: the facilities placed as models)
    // are taken out again – what they replaced on the map stays replaced. → how many meshes went
    giveWay: (ids) => { let n = 0; for (const m of [...group.children]) if (m.userData.givesWayTo && ids.has(m.userData.givesWayTo)) { group.remove(m); m.geometry?.dispose(); for (const mt of [].concat(m.material || [])) mt.dispose?.(); n++; } return n; },
    group: group.children.length ? group : null, skip: (b) => skip.has(b), restyle: (b) => restyle.get(b) || null,
    keepOut: (x, z) => zones.some(([zx, zz, r]) => Math.hypot(x - zx, z - zz) < r),
    count: group.children.length, spots,
  };
}
