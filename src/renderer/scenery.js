// Real surroundings for the 3D circuit, built from the fitted map data (see src/main/scene.js):
//   terrain   – elevation tiles (Mapzen/AWS terrarium) levelled to F1's own track heights
//   ground    – satellite imagery (Sentinel-2 cloudless by EOX, or Google with the user's key) with crisp
//               OpenStreetMap roads, car parks and water painted over the free imagery
//   buildings – OSM footprints extruded to their tagged height, windowed walls, grandstands
//   nature    – trees in mapped woods, parks and tree rows; water surfaces
//   circuit   – other mapped tarmac (pit lane, other layouts) and the real barriers along the track
// Everything is in the scene frame of map3d.js: x = F1 east (m) − centre, z = −(F1 north − centre), y = up.
import * as THREE from "./vendor/three.module.js";
import { auxRuns, ribbonEdges, blendHeight, onJoiningRun } from "./auxroads.js";
import { buildStands } from "./stands.js";
import { classRaster, groundMaterial, fillPolygon, strokeLine } from "./ground.js";
import { seaRaster } from "./sea.js";
import { buildingsMesh } from "./buildings.js";
import { padPlan, polyDist } from "./footing.js";
import { buildLandmarks } from "./landmarks.js";
import { buildFacilities, combine, genericPitSpec, FACILITIES } from "./facilities.js";
import { START_DATA } from "./startdata.js";
import { PIT_BOXES, STANDINGS, teamKey } from "./pitorder.js";
import { layoutFor } from "./garageplans.js";
import { pathFrame } from "./pitlane.js";
import { planTunnels, buildTunnels } from "./tunnel.js";
import { lightField, lampMeshes, glowPoints, releaseField } from "./nightlights.js";
import { disposeGroup } from "./dispose.js";
import { pitLaneOf, solidBarrierSegs } from "./pitwallcheck.js";
import { otherSection, joinHeight, roadProbes, clearRoads, skirtStrips, shoreCap } from "./roadground.js";

const MARGIN = 900;                     // metres of surroundings around the track
const DEM_ZOOM = 14;
const deg = Math.PI / 180;

// ---------- coordinates ----------
function geoFrame(scene, c) {
  const [la, lo] = [scene.ll.lat, scene.ll.lon], [fx, fy] = [scene.f1.x, scene.f1.y], [lat0, lon0] = scene.center;
  return {
    toLL(x, z) { const X = x + c.x, Y = -z + c.z; return [la[0] + la[1] * X + la[2] * Y, lo[0] + lo[1] * X + lo[2] * Y]; },
    fromLL(lat, lon) { const a = lat - lat0, b = lon - lon0; const X = fx[0] + fx[1] * a + fx[2] * b, Y = fy[0] + fy[1] * a + fy[2] * b; return [X - c.x, -(Y - c.z)]; },
    // F1 metres → scene
    xz: ([X, Y]) => [X - c.x, -(Y - c.z)],
  };
}
const lon2tx = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2ty = (lat, z) => { const r = lat * deg; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; };
const tx2lon = (x, z) => (x / 2 ** z) * 360 - 180;
const ty2lat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) / deg;

// Tiles covering a lat/lon box at zoom z.
function tilesFor(box, z) {
  const x0 = Math.floor(lon2tx(box.w, z)), x1 = Math.floor(lon2tx(box.e, z)), y0 = Math.floor(lat2ty(box.n, z)), y1 = Math.floor(lat2ty(box.s, z));
  const out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}

// Runs async jobs `limit` at a time.
async function pool(items, limit, fn) {
  let i = 0;
  const run = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

async function bitmap(buf, raw = false) {
  return createImageBitmap(new Blob([buf]), raw ? { colorSpaceConversion: "none", premultiplyAlpha: "none" } : {});
}

// ---------- terrain heights ----------
// Returns heightAt(lat, lon) in metres above sea level, or null when the tiles can't be had.
async function loadDem(api, box) {
  const z = DEM_ZOOM, tiles = tilesFor(box, z);
  if (tiles.length > 64) return null;
  const data = new Map();
  await pool(tiles, 6, async ([x, y]) => {
    try {
      const bmp = await bitmap(await api.geo.tile("terrain", z, x, y), true);
      const cv = new OffscreenCanvas(256, 256), g = cv.getContext("2d", { willReadFrequently: true });
      g.drawImage(bmp, 0, 0);
      const px = g.getImageData(0, 0, 256, 256).data, h = new Float32Array(256 * 256);
      for (let i = 0; i < h.length; i++) h[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
      data.set(`${x}/${y}`, h);
    } catch { /* missing tile: treated as unknown */ }
  });
  if (!data.size) return null;
  const sample = (gx, gy) => {
    const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256), h = data.get(`${tx}/${ty}`);
    if (!h) return null;
    return h[(Math.min(255, Math.max(0, Math.floor(gy - ty * 256)))) * 256 + Math.min(255, Math.max(0, Math.floor(gx - tx * 256)))];
  };
  return (lat, lon) => {
    const gx = lon2tx(lon, z) * 256 - 0.5, gy = lat2ty(lat, z) * 256 - 0.5;
    const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const a = sample(x0, y0), b = sample(x0 + 1, y0), c = sample(x0, y0 + 1), d = sample(x0 + 1, y0 + 1);
    if (a == null || b == null || c == null || d == null) return a ?? b ?? c ?? d ?? null;
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
}

// ---------- ground texture ----------
const AREA_PAINT = {   // [fill, alpha over free imagery]
  water: ["#1f5a86", 0.6], wood: ["#2f5a2a", 0.28], scrub: ["#5d6b3a", 0.2], park: ["#4f7f3a", 0.25], grass: ["#5b8a45", 0.25],
  golf: ["#5f9a48", 0.3], pitch: ["#4f8a3c", 0.35], farm: ["#8a8a52", 0.12], sand: ["#d8c9a0", 0.35], rock: ["#8d8a83", 0.2],
  paved: ["#5a5d61", 0.55], stadium: ["#6b6e72", 0.25], urban: ["#7d7c78", 0.12], residential: ["#8b867d", 0.1], pier: ["#8c8a85", 0.6],
  wetland: ["#4d6b4a", 0.2],
};
function paintOsm(g, scene, P, mpp, free) {
  // land cover (free imagery is 10 m per pixel: crisp outlines help), then water
  const order = ["farm", "residential", "urban", "golf", "park", "grass", "scrub", "wood", "wetland", "sand", "rock", "pitch", "stadium", "paved", "pier", "water"];
  for (const k of order) {
    const [fill, alpha] = AREA_PAINT[k];
    const a = free ? alpha : k === "water" ? 0.15 : 0;
    if (!a) continue;
    g.globalAlpha = a; g.fillStyle = fill; g.beginPath();
    for (const ar of scene.areas) {
      if (ar.k !== k) continue;
      ar.pts.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.closePath();
    }
    g.fill();
  }
  // roads, paths, rails
  g.lineCap = "round"; g.lineJoin = "round";
  const stroke = (pred, colour, alpha, width) => {
    g.globalAlpha = alpha; g.strokeStyle = colour;
    for (const l of scene.lines) {
      if (!pred(l)) continue;
      g.lineWidth = Math.max(1, width(l) / mpp); g.beginPath();
      l.pts.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    }
  };
  if (free) {
    stroke((l) => l.k === "river", "#1f5a86", 0.6, (l) => l.w);
    stroke((l) => l.k === "path", "#b9b2a2", 0.45, (l) => l.w);
    stroke((l) => l.k === "rail", "#6a6258", 0.7, () => 3);
    stroke((l) => l.k === "road", "#3f4246", 0.85, (l) => l.w + 1.5);   // kerb-ish edge
    stroke((l) => l.k === "road", "#4b4e52", 0.95, (l) => l.w);
    stroke((l) => l.k === "road" && l.w >= 9, "#d9d6c9", 0.5, () => 0.25);   // centre marking on big roads
  }
  // building footprints (their walls stand on them)
  g.globalAlpha = free ? 0.55 : 0.25; g.fillStyle = "#2e3034"; g.beginPath();
  for (const b of scene.buildings) { b.pts.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); }
  g.fill();
  g.globalAlpha = 1;
}

// Builds the ground canvas: imagery tiles warped into the scene frame, then OSM paint.
async function groundCanvas(api, scene, gf, ext, provider, onStep, track) {
  const W = ext.x1 - ext.x0, H = ext.z1 - ext.z0;
  const size = 4096, mpp = Math.max(W, H) / size;
  const cw = Math.ceil(W / mpp), ch = Math.ceil(H / mpp);
  const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
  const g = cv.getContext("2d");
  g.fillStyle = "#6f7a5a"; g.fillRect(0, 0, cw, ch);
  const S = (x, z) => [(x - ext.x0) / mpp, (z - ext.z0) / mpp];           // scene → canvas px
  const P = (p) => { const [x, z] = gf.xz(p); return S(x, z); };          // F1 metres → canvas px
  const box = ext.ll;
  // zoom so a tile pixel is about a canvas pixel (free imagery tops out at 15)
  const lat = (box.n + box.s) / 2, mPerPx0 = 156543.03 * Math.cos(lat * deg);
  let z = Math.round(Math.log2(mPerPx0 / mpp));
  z = Math.max(12, Math.min(provider === "google" ? 18 : 15, z));
  let tiles = tilesFor(box, z);
  while (tiles.length > 400 && z > 12) tiles = tilesFor(box, --z);
  let done = 0, failed = 0;
  onStep?.(`위성 사진 받는 중 0/${tiles.length}`);
  await pool(tiles, 8, async ([tx, ty]) => {
    try {
      const bmp = await bitmap(await api.geo.tile(provider, z, tx, ty));
      // tile corners → scene → canvas (an affine warp; F1's frame is a hair rotated from north)
      const c00 = S(...gf.fromLL(ty2lat(ty, z), tx2lon(tx, z)));
      const c10 = S(...gf.fromLL(ty2lat(ty, z), tx2lon(tx + 1, z)));
      const c01 = S(...gf.fromLL(ty2lat(ty + 1, z), tx2lon(tx, z)));
      const n = bmp.width;
      g.setTransform((c10[0] - c00[0]) / n, (c10[1] - c00[1]) / n, (c01[0] - c00[0]) / n, (c01[1] - c00[1]) / n, c00[0], c00[1]);
      g.drawImage(bmp, -0.6, -0.6, n + 1.2, n + 1.2);   // a hair of overlap hides seams
      g.setTransform(1, 0, 0, 1, 0, 0);
      bmp.close?.();
    } catch { failed++; }
    if (++done % 8 === 0) onStep?.(`위성 사진 받는 중 ${done}/${tiles.length}`);
  });
  // (the class-painted ground of ground.js wants the bare imagery: it reads the map data itself)
  if (track?.paint !== false) paintOsm(g, scene, P, mpp, provider !== "google");
  // Street circuits: pavement and kerbstones beside the track (the 10 m imagery can't show them).
  if (track?.street && track?.paint !== false) {
    const pts = track.samples.map((s) => S(s.p.x, s.p.z));
    const line = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    g.lineJoin = "round"; g.globalAlpha = 0.95;
    g.strokeStyle = "#a19d95"; g.lineWidth = (track.width + 14) / mpp; line(); g.stroke();
    g.strokeStyle = "#8a867f"; g.lineWidth = (track.width + 4) / mpp; line(); g.stroke();
    g.globalAlpha = 1;
  }
  return { canvas: cv, mpp, zoom: z, failed, tiles: tiles.length };
}

// Close up, satellite pixels (10 m) look smeared: a fine grain texture, tiled every 6 m in world space and
// fading out with distance, gives the ground some surface.
let _grain = null;
function grainTexture() {
  if (_grain) return _grain;
  const n = 128, cv = document.createElement("canvas"); cv.width = cv.height = n;
  const g = cv.getContext("2d"), img = g.createImageData(n, n), r = rand(9);
  for (let i = 0; i < n * n; i++) { const v = 128 + (r() - 0.5) * 70 + (r() - 0.5) * 30; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  // a few larger blotches
  for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},0.05)`; g.beginPath(); g.arc(r() * n, r() * n, 4 + r() * 14, 0, Math.PI * 2); g.fill(); }
  _grain = new THREE.CanvasTexture(cv);
  _grain.wrapS = _grain.wrapT = THREE.RepeatWrapping; _grain.anisotropy = 4;
  return _grain;
}
function withDetail(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.grain = { value: grainTexture() };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vGrainPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvGrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D grain;\nvarying vec3 vGrainPos;")
      .replace("#include <map_fragment>", `#include <map_fragment>
        // Detail the 10 m satellite pixels can't show, by what the ground is: grass gets blades and
        // patches with a little hue change, sand and soil get gravel grain. Fades out with distance.
        float gd = distance(vGrainPos, cameraPosition);
        float gf = 1.0 - smoothstep(25.0, 650.0, gd);
        vec3 base = diffuseColor.rgb;
        float green = smoothstep(0.0, 0.06, base.g - max(base.r, base.b));
        float fine = texture2D(grain, vGrainPos.xz / 1.7).r, mid = texture2D(grain, vGrainPos.xz / 9.0).r, big = texture2D(grain, vGrainPos.xz / 57.0).r;
        vec3 grass = base * (0.72 + fine * 0.22 + mid * 0.22 + big * 0.2) * mix(vec3(1.0), vec3(1.08, 1.05, 0.86), smoothstep(0.55, 0.8, big));
        vec3 soil = base * (0.82 + fine * 0.3 + mid * 0.1);
        diffuseColor.rgb = mix(base, mix(soil, grass, green), gf);`);
  };
  return mat;
}

// ---------- the track as an obstacle-free corridor ----------
// From the lap samples of map3d (s.p position, s.tan / s.nor directions, s.L / s.R measured edges in metres
// left (+) and right (−) of the lap line). `margin` is kept free beyond each edge: a street circuit's walls
// stand right at the edge, a permanent circuit has run-off.
export function trackCorridor(world, margin) {
  const grid = world.grid;
  const L = (s) => s.L ?? 7, R = (s) => s.R ?? -7;
  const local = (x, z) => {
    const [s, d] = grid.nearest(x, z, 1);
    if (!s || d > 50) return null;
    const dx = x - s.p.x, dz = z - s.p.z;
    return { s, l: dx * s.nor.x + dz * s.nor.z, a: dx * s.tan.x + dz * s.tan.z };
  };
  const on = (x, z, m = margin) => { const q = local(x, z); return !!q && Math.abs(q.a) < 3 && q.l < L(q.s) + m && q.l > R(q.s) - m; };
  return {
    on, local,
    // pts: closed outline (scene x, z). Returns the same array when it's clear, a new outline with the
    // corners on the track moved to the edge of the corridor, or null when it can't be kept clear.
    clearPolygon(pts) {
      let cx = 0, cz = 0, rad = 0;
      for (const [x, z] of pts) { cx += x; cz += z; }
      cx /= pts.length; cz /= pts.length;
      for (const [x, z] of pts) rad = Math.max(rad, Math.hypot(x - cx, z - cz));
      const [s0, d0] = grid.nearest(cx, cz, 2);
      if (!s0 || d0 > rad + 30) return pts;                         // nowhere near the track
      let changed = false;
      const out = pts.map(([x, z]) => {
        const q = local(x, z);
        if (!q || Math.abs(q.a) >= 3 || q.l >= L(q.s) + margin || q.l <= R(q.s) - margin) return [x, z];
        changed = true;
        const nl = q.l >= (L(q.s) + R(q.s)) / 2 ? L(q.s) + margin + 0.1 : R(q.s) - margin - 0.1;
        return [q.s.p.x + q.s.tan.x * q.a + q.s.nor.x * nl, q.s.p.z + q.s.tan.z * q.a + q.s.nor.z * nl];
      });
      // check the result: its edges (every 2 m) and inside (every 3 m) must be off the track
      const m2 = margin - 0.5;
      for (let i = 0; i < out.length; i++) {
        const [ax, az] = out[i], [bx, bz] = out[(i + 1) % out.length], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
        for (let k = 0; k < n; k++) if (on(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, m2)) return null;
      }
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of out) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
      for (let x = minX + 1.5; x < maxX; x += 3) for (let z = minZ + 1.5; z < maxZ; z += 3) if (inPoly(x, z, out) && on(x, z, m2)) return null;
      if (changed && Math.abs(polyArea(out)) < Math.abs(polyArea(pts)) * 0.35) return null;   // mostly on the road
      return changed ? out : pts;
    },
  };
}

// ---------- geometry helpers ----------
// Points every `step` metres along a polyline in F1 metres.
function densifyF1(pts, step) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  if (pts.length) out.push(pts[pts.length - 1]);
  return out;
}
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const polyArea = (pts) => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return a / 2; };
function rand(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- vegetation and rocks ----------
// Shared, merged geometries (built once): broadleaf crowns of several lobes, layered conifers, palms with
// drooping fronds, shrubs, and lumpy rocks. Placed as instances with their own size, turn and colour.
let VEG = null;
function noisy(geo, amount, seed) {
  const r = rand(seed), p = geo.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;   // keep shared corners shared
    if (!seen.has(key)) seen.set(key, 1 + (r() - 0.5) * amount);
    const k = seen.get(key); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}
function vegGeometries() {
  if (VEG) return VEG;
  const merge = (list) => {   // [geometry, x, y, z, sx, sy, sz]
    const meshes = list.map(([g, x, y, z, sx = 1, sy = sx, sz = sx]) => { const m = new THREE.Mesh(g.index ? g.toNonIndexed() : g); m.position.set(x, y, z); m.scale.set(sx, sy, sz); return m; });
    const pos = [], nor = [], v = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const m of meshes) { m.updateMatrix(); nm.getNormalMatrix(m.matrix); const P = m.geometry.attributes.position, N = m.geometry.attributes.normal;
      for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrix); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); } }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    return g;
  };
  const lobe = (seed) => noisy(new THREE.IcosahedronGeometry(1, 0), 0.3, seed);   // 20 faces each: thousands of trees stay cheap
  const trunk = new THREE.CylinderGeometry(0.22, 0.38, 4, 5, 1, true); trunk.translate(0, 2, 0);
  const broad = merge([[lobe(1), 0, 5.4, 0, 2.6, 2.2, 2.6], [lobe(2), 1.5, 4.6, 0.6, 1.8], [lobe(3), -1.3, 4.8, -0.7, 1.9], [lobe(4), 0.2, 6.6, -0.3, 1.6]]);
  const conifer = merge([[new THREE.ConeGeometry(2.6, 4.2, 7), 0, 4.2, 0], [new THREE.ConeGeometry(2.0, 3.6, 7), 0, 6.3, 0], [new THREE.ConeGeometry(1.3, 3.0, 6), 0, 8.2, 0]]);
  const conTrunk = new THREE.CylinderGeometry(0.18, 0.3, 3, 5); conTrunk.translate(0, 1.5, 0);
  // palm: a gently leaning, ringed trunk and 9 fronds arching down from the top
  const palmTrunk = new THREE.CylinderGeometry(0.17, 0.26, 9, 5, 4, true);
  { const p = palmTrunk.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 4.5; p.setX(i, p.getX(i) + 0.012 * y * y); } palmTrunk.translate(0, 4.5, 0); palmTrunk.computeVertexNormals(); }
  const fronds = [];
  for (let k = 0; k < 9; k++) {
    const f = new THREE.PlaneGeometry(0.9, 3.4, 1, 3); f.rotateX(-Math.PI / 2); f.translate(0, 0, 1.7);
    const p = f.attributes.position;
    for (let i = 0; i < p.count; i++) { const zz = p.getZ(i); p.setY(i, -0.12 * zz * zz + 0.25 * zz); p.setX(i, p.getX(i) * (1 - zz / 4)); }
    f.rotateY((k / 9) * Math.PI * 2 + (k % 2) * 0.2); f.computeVertexNormals();
    fronds.push([f, 0.97, 9, 0]);
  }
  const palmTop = merge(fronds);
  const shrub = merge([[lobe(7), 0, 0.7, 0, 1.3, 0.8, 1.3], [lobe(8), 0.7, 0.55, 0.3, 0.8]]);
  // Foliage reads as soft masses, not facets: normals point out from the crown's middle, and colour runs
  // from shadowed underneath to sunlit on top, with a little noise.
  const soften = (g, cy, rad, k = 0.85) => {
    const p = g.attributes.position, nrm = g.attributes.normal, col = [], v = new THREE.Vector3(), nn = new THREE.Vector3(), rr = rand(31);
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i) - cy, p.getZ(i)).normalize();
      nn.fromBufferAttribute(nrm, i).lerp(v, k).normalize(); nrm.setXYZ(i, nn.x, nn.y, nn.z);
      const h = Math.max(0, Math.min(1, (p.getY(i) - (cy - rad)) / (2 * rad)));
      const b = 0.52 + 0.48 * Math.pow(h, 0.8) + (rr() - 0.5) * 0.08;
      col.push(b, b, b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  };
  soften(broad, 5.4, 3.4); soften(conifer, 5.6, 4.6, 0.6); soften(shrub, 0.7, 1.1); soften(palmTop, 9, 2, 0.4);
  const rock = noisy(new THREE.IcosahedronGeometry(1, 1), 0.55, 11); rock.scale(1, 0.62, 0.9); rock.translate(0, 0.25, 0);
  VEG = { trunk, broad, conifer, conTrunk, palmTrunk, palmTop, shrub, rock };
  return VEG;
}

// Spots for trees: mapped woods/parks/tree rows and single trees, plus tree canopy seen on the satellite
// image (dark green). Everything is kept off the track corridor, roads and buildings.
function treesMesh(scene, gf, groundAt, corridor, blocked, lat, ground, clear = 14) {
  const r = rand(3), spots = [];   // [x, z, kind 0 tree | 1 shrub, size]
  const density = { wood: 1 / 110, scrub: 1 / 420, park: 1 / 650, golf: 1 / 2200, wetland: 1 / 900 };
  const MAX = 30000;
  for (const a of scene.areas) {
    const d = density[a.k];
    if (!d) continue;
    const pts = a.pts.map(gf.xz);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    let n = Math.min(5000, Math.round(Math.abs(polyArea(pts)) * d));
    for (let tries = 0; n > 0 && tries < n * 4 && spots.length < MAX; tries++) {
      const x = minX + r() * (maxX - minX), z = minZ + r() * (maxZ - minZ);
      if (!inPoly(x, z, pts)) continue;
      n--; spots.push([x, z, a.k === "scrub" ? 1 : 0, 1]);
    }
  }
  for (const t of scene.trees) { const [x, z] = gf.xz(t); spots.push([x, z, 0, 1]); }
  // canopy on the satellite image: sample every 9 m; dark, green-dominant pixels are trees
  if (ground) {
    const { canvas, mpp, ext } = ground, W = canvas.width, H = canvas.height, px = ground.pixels();
    const step = 9;
    for (let z = ext.z0 + step / 2; z < ext.z1 && spots.length < MAX; z += step) for (let x = ext.x0 + step / 2; x < ext.x1; x += step) {
      const jx = x + (r() - 0.5) * step * 0.8, jz = z + (r() - 0.5) * step * 0.8;
      const i = Math.floor((jx - ext.x0) / mpp), j = Math.floor((jz - ext.z0) / mpp);
      if (i < 1 || j < 1 || i >= W - 1 || j >= H - 1) continue;
      let R = 0, G = 0, B = 0;
      for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) { const o = ((j + dj) * W + i + di) * 4; R += px[o]; G += px[o + 1]; B += px[o + 2]; }
      R /= 5; G /= 5; B /= 5;
      const lum = 0.3 * R + 0.59 * G + 0.11 * B;
      if (ground.classAt && !/^[0-37-8]$/.test(String(ground.classAt(jx, jz)))) continue;   // only on grass, meadow, forest, sand, soil, farmland
      if (ground.isSea?.(jx, jz)) continue;
      if (G > R * 1.06 && G > B * 1.02 && lum < 100 && lum > 18) spots.push([jx, jz, lum < 60 ? 0 : (r() < 0.6 ? 0 : 1), 0.9 + (100 - lum) / 120]);
    }
  }
  // run-off, gravel and fences come first on a permanent circuit; a street circuit has trees right behind the walls
  const keep = spots.filter(([x, z]) => !corridor.on(x, z, clear) && !blocked(x, z));
  if (!keep.length) return null;
  const V = vegGeometries();
  // the mix: palms near the tropics and in the desert, more conifers away from them
  const a = Math.abs(lat), palmShare = a < 8 ? 0.22 : a < 27 ? 0.55 : a < 34 ? 0.12 : 0, coniferShare = a > 40 ? 0.4 : a > 30 ? 0.18 : 0.04;
  const kinds = keep.map(([, , k]) => (k === 1 ? "shrub" : (() => { const u = r(); return u < palmShare ? "palm" : u < palmShare + coniferShare ? "conifer" : "broad"; })()));
  const mat = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.95, ...opts });
  const leaf = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true, ...opts });
  // Instances go into ~400 m chunks, one instanced mesh per kind and chunk: chunks off-screen (and outside
  // the sun's shadow box) are skipped by three.js, which matters with tens of thousands of trees.
  const mats = {
    trunk: mat({ color: 0x5a4330 }), broad: leaf({ color: 0xffffff }), conTrunk: mat({ color: 0x4d3a2a }), conifer: leaf({ color: 0xffffff }),
    palmTrunk: mat({ color: 0x8a7458 }), palmTop: leaf({ color: 0xffffff, side: THREE.DoubleSide }), shrub: leaf({ color: 0xffffff }),
  };
  const geos = { trunk: V.trunk, broad: V.broad, conTrunk: V.conTrunk, conifer: V.conifer, palmTrunk: V.palmTrunk, palmTop: V.palmTop, shrub: V.shrub };
  const parts = { broad: ["trunk", "broad"], conifer: ["conTrunk", "conifer"], palm: ["palmTrunk", "palmTop"], shrub: ["shrub"] };
  const buckets = new Map();   // chunk → part → [matrix, colour]
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  keep.forEach(([x, z, , size], i) => {
    const k = kinds[i], s0 = (0.7 + r() * 0.6) * size * (k === "shrub" ? 0.9 : 1);
    q.setFromAxisAngle(Y, r() * Math.PI * 2); p.set(x, groundAt(x, z) - 0.15, z);
    sc.set(s0, s0 * (0.85 + r() * 0.35), s0); m.compose(p, q, sc);
    const col = new THREE.Color();
    // (the crown's own shading darkens these towards the bottom)
    if (k === "broad") col.setHSL(0.21 + r() * 0.09, 0.34 + r() * 0.22, 0.22 + r() * 0.12);
    else if (k === "conifer") col.setHSL(0.29 + r() * 0.06, 0.3 + r() * 0.18, 0.17 + r() * 0.08);
    else if (k === "palm") col.setHSL(0.23 + r() * 0.07, 0.42 + r() * 0.2, 0.26 + r() * 0.1);
    else col.setHSL(0.2 + r() * 0.1, 0.28 + r() * 0.2, 0.24 + r() * 0.1);
    const key = `${Math.floor(x / 400)},${Math.floor(z / 400)}`;
    let bk = buckets.get(key); if (!bk) buckets.set(key, (bk = {}));
    for (const part of parts[k]) (bk[part] || (bk[part] = [])).push([m.clone(), /Trunk|^trunk/.test(part) ? null : col]);
  });
  const g = new THREE.Group(); g.name = "trees";
  for (const bk of buckets.values()) {
    // same random order for every part of a chunk (so trunks and crowns thin out together)
    const n = Math.max(...Object.values(bk).map((l) => l.length)), order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (const [part, list0] of Object.entries(bk)) {
    const list = order.filter((i) => i < list0.length).map((i) => list0[i]);
    const im = new THREE.InstancedMesh(geos[part], mats[part], list.length);
    list.forEach(([mm, col], j) => { im.setMatrixAt(j, mm); if (col) im.setColorAt(j, col); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere(); im.castShadow = part !== "shrub"; im.receiveShadow = true;
    im.userData = { full: list.length, centre: im.boundingSphere.center.clone() };
    g.add(im);
    }
  }
  g.userData.count = keep.length;
  return g;
}

// Rocks: on mapped bare rock / scree / cliffs and beaches' edges, and scattered thinly on bare, sandy or
// rocky ground in the imagery near desert circuits.
function rocksMesh(scene, gf, groundAt, corridor, blocked, lat, ground) {
  const r = rand(21), spots = [];
  for (const a of scene.areas) {
    if (a.k !== "rock" && a.k !== "sand") continue;
    const pts = a.pts.map(gf.xz);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    let n = Math.min(1500, Math.round(Math.abs(polyArea(pts)) * (a.k === "rock" ? 1 / 60 : 1 / 2500)));
    for (let tries = 0; n > 0 && tries < n * 4; tries++) { const x = minX + r() * (maxX - minX), z = minZ + r() * (maxZ - minZ); if (inPoly(x, z, pts)) { n--; spots.push([x, z, a.k === "rock" ? 1.4 : 0.7]); } }
  }
  if (ground && Math.abs(lat) < 34) {
    const { canvas, mpp, ext } = ground, W = canvas.width, H = canvas.height, px = ground.pixels();
    for (let z = ext.z0 + 15; z < ext.z1 && spots.length < 4000; z += 30) for (let x = ext.x0 + 15; x < ext.x1; x += 30) {
      const jx = x + (r() - 0.5) * 24, jz = z + (r() - 0.5) * 24, i = Math.floor((jx - ext.x0) / mpp), j = Math.floor((jz - ext.z0) / mpp);
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const o = (j * W + i) * 4, R = px[o], G = px[o + 1], B = px[o + 2];
      if ((ground.classAt && !/^[0-37-8]$/.test(String(ground.classAt(jx, jz)))) || ground.isSea?.(jx, jz)) continue;
      if (R > G && G > B && R - B > 25 && R > 120 && r() < 0.5) spots.push([jx, jz, 0.5 + r() * 0.6]);   // sand / bare earth
    }
  }
  const keep = spots.filter(([x, z]) => !corridor.on(x, z, 3) && !blocked(x, z));
  if (!keep.length) return null;
  const V = vegGeometries();
  const im = new THREE.InstancedMesh(V.rock, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), keep.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  keep.forEach(([x, z, size], i) => {
    const s0 = size * (0.4 + r() * 1.1);
    q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5));
    sc.set(s0 * (0.8 + r() * 0.5), s0 * (0.6 + r() * 0.5), s0 * (0.8 + r() * 0.5)); p.set(x, groundAt(x, z) - 0.25 * s0, z);
    m.compose(p, q, sc); im.setMatrixAt(i, m);
    im.setColorAt(i, c.setHSL(0.07 + r() * 0.05, 0.12 + r() * 0.15, 0.36 + r() * 0.18));
  });
  im.castShadow = true; im.receiveShadow = true; im.name = "rocks";
  return im;
}

// Flat water surfaces (lakes, harbours, rivers mapped as areas).
function waterMesh(scene, gf, groundAt) {
  const pos = [], idx = [];
  for (const a of scene.areas) {
    if (a.k !== "water") continue;
    let pts = a.pts.map(gf.xz);
    if (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
    if (pts.length < 3) continue;
    let lvl = Infinity;
    for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 24))) lvl = Math.min(lvl, groundAt(pts[i][0], pts[i][1]));
    if (!Number.isFinite(lvl)) continue;
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []); } catch { continue; }
    const v0 = pos.length / 3;
    for (const [x, z] of pts) pos.push(x, lvl + 0.35, z);
    for (const [a1, b1, c1] of tris) idx.push(v0 + a1, v0 + b1, v0 + c1);
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2b5f86, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.88, side: THREE.DoubleSide }));
  mesh.name = "water";
  return mesh;
}

// The strips of auxroads.js as one mesh (counter-clockwise from above: the up-facing normals are the front side).
export function auxMesh(runs, T, heightAt) {
  const pos = [], nor = [], idx = [];
  for (const r of runs) {
    const { left, right } = ribbonEdges(r, T), v0 = pos.length / 3;
    for (let i = 0; i < left.length; i++) {
      for (const [x, z] of [left[i], right[i]]) { pos.push(x, heightAt(x, z), z); nor.push(0, 1, 0); }
      if (i) {
        // each triangle turned to face up (v0.34 wound them face down: back-face culled, the strips never showed – audit)
        const v = v0 + i * 2;
        for (const [a, b, c] of [[v - 2, v - 1, v], [v - 1, v + 1, v]]) {
          const ax = pos[a * 3], az = pos[a * 3 + 2], bx = pos[b * 3], bz = pos[b * 3 + 2], cx = pos[c * 3], cz = pos[c * 3 + 2];
          const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);   // the face normal's y (counter-clockwise seen from above: > 0)
          if (Math.abs(up) < 1e-6) continue;
          idx.push(...(up > 0 ? [a, b, c] : [a, c, b]));
        }
      }
    }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1 }));
  m.name = "auxTarmac"; m.receiveShadow = true; m.userData.runs = runs.length;
  return m;
}

// Mapped barriers next to the track: concrete walls, tyre/guard rails and tall debris fences – each with its surface
// in metres along it: concrete in 4 m precast panels, guard rail's two corrugated rails on posts, the fence a wire mesh
// (diamonds ~7 cm) on posts every 3 m with a top cable – see-through, mipmapped so from afar it greys as a real one does.
function barrierTexture(kind) {
  const c = document.createElement("canvas"), g = c.getContext("2d");
  let a = kind.length * 977; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  if (kind === "fence") {
    // one tile: 3 m along (a post at its end) × 1.2 m up (a third of the fence), 512 × 256
    c.width = 512; c.height = 256; g.clearRect(0, 0, 512, 256);
    g.strokeStyle = "rgba(170,178,186,0.95)"; g.lineWidth = 1.4;
    const step = 512 / 42;   // 42 diamonds per 3 m: ~7 cm
    for (let k = -24; k < 66; k++) { g.beginPath(); g.moveTo(k * step, 0); g.lineTo(k * step + 256, 256); g.stroke(); g.beginPath(); g.moveTo(k * step, 256); g.lineTo(k * step + 256, 0); g.stroke(); }
    g.fillStyle = "rgba(120,128,136,1)"; g.fillRect(500, 0, 12, 256);   // the post
  } else {
    c.width = 256; c.height = 64;
    const base = kind === "guard_rail" ? 168 : 205;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 256; x++) { const v = base + (r() - 0.5) * 22; g.fillStyle = `rgb(${v | 0},${v | 0},${(v + 3) | 0})`; g.fillRect(x, y, 1, 1); }
    if (kind === "guard_rail") {
      // two rails (light, with the corrugation's dark lines) on a dark gap; posts at each end of the 4 m tile
      g.fillStyle = "rgba(40,44,48,0.85)"; g.fillRect(0, 0, 256, 10); g.fillRect(0, 30, 256, 6); g.fillRect(0, 58, 256, 6);
      g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(0, 14, 256, 4); g.fillRect(0, 42, 256, 4);
      g.fillStyle = "rgb(70,74,78)"; g.fillRect(0, 0, 6, 64); g.fillRect(128, 0, 6, 64);
    } else {
      // a joint at the panel's end, darker weathering towards the foot
      g.fillStyle = "rgba(60,62,64,0.8)"; g.fillRect(254, 0, 2, 64);
      const gr = g.createLinearGradient(0, 40, 0, 64); gr.addColorStop(0, "rgba(70,70,60,0)"); gr.addColorStop(1, "rgba(70,70,60,0.35)"); g.fillStyle = gr; g.fillRect(0, 40, 256, 24);
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.name = "barrier:" + kind;
  return t;
}
function barriersMesh(lines, gf, heightAt) {
  const kinds = {
    wall: { h: 1.1, color: 0xd9dcdf, tile: [4, 1.1] }, retaining_wall: { h: 1.4, color: 0xc9cbcd, tile: [4, 1.4] }, jersey_barrier: { h: 0.9, color: 0xdfe1e3, tile: [4, 0.9] },
    guard_rail: { h: 0.9, color: 0xa9b0b7, tile: [4, 0.9] }, fence: { h: 3.6, color: 0x9aa3ab, fence: true, tile: [3, 1.2] },
  };
  const groups = new THREE.Group();
  for (const [kind, spec] of Object.entries(kinds)) {
    const pos = [], idx = [], uv = [];
    for (const l of lines) {
      if (l.sub !== kind) continue;
      const pts = l.pts.map(gf.xz);
      let run = 0;
      // (a piece whose ends stand at heights a metre or more apart is cut into ≤ 3 m pieces: its foot follows the ground
      // between them instead of a straight line through it)
      for (let i = pts.length - 1; i > 0; i--) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
        if (Math.abs(heightAt(ax, az) - heightAt(bx, bz)) < 1) continue;
        const m = Math.ceil(Math.hypot(bx - ax, bz - az) / 3);
        pts.splice(i, 0, ...Array.from({ length: m - 1 }, (_, k) => [ax + ((bx - ax) * (k + 1)) / m, az + ((bz - az) * (k + 1)) / m]));
      }
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
        const ya = heightAt(ax, az), yb = heightAt(bx, bz), v = pos.length / 3, len = Math.hypot(bx - ax, bz - az);
        pos.push(ax, ya, az, bx, yb, bz, bx, yb + spec.h, bz, ax, ya + spec.h, az);
        const u0 = run / spec.tile[0], u1 = (run + len) / spec.tile[0], vh = spec.h / spec.tile[1];
        uv.push(u0, 0, u1, 0, u1, vh, u0, vh);
        run += len;
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      }
    }
    if (!idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const map = barrierTexture(kind);
    const mat = spec.fence
      ? new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.5, transparent: true, side: THREE.DoubleSide, depthWrite: false })
      : new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, mat); mesh.name = "barrier:" + kind;
    mesh.castShadow = !spec.fence; mesh.receiveShadow = true;
    groups.add(mesh);
  }
  groups.name = "barriers";   // (map barriers: the pit lane's model looks for its wall among them – map3d.js pitModelFor)
  return groups.children.length ? groups : null;
}

// ---------- the whole thing ----------
// world: { samples, grid, center, box, n } from map3d; nearestTrack(x, z) → [sample, dist].
// opts: { provider: "eox" | "google", buildings, trees, night, facilities (trial facility models on), year,
//   isCurrent() → false once this build's world is gone (a facility model still loading is then dropped) }
// (a build that fails part way frees what it made – its meshes, a facility's hold on a model file, the night field –
// and the error goes on to the caller; a build that finishes hands everything over in the result)
export async function buildScenery(api, scene, world, opts, onStep) {
  const own = { group: new THREE.Group(), night: null, t0: performance.now() };
  try { return await buildReal(api, scene, world, opts, onStep, own); }
  catch (e) { disposeGroup(own.group); releaseField(own.night); throw e; }
}
async function buildReal(api, scene, world, opts, onStep, own) {
  const c = world.center, gf = geoFrame(scene, c);
  const box = world.box;
  const ext = { x0: box.min.x - MARGIN, x1: box.max.x + MARGIN, z0: box.min.z - MARGIN, z1: box.max.z + MARGIN };
  // lat/lon bounds of the extent
  const corners = [[ext.x0, ext.z0], [ext.x1, ext.z0], [ext.x0, ext.z1], [ext.x1, ext.z1]].map(([x, z]) => gf.toLL(x, z));
  ext.ll = { n: Math.max(...corners.map((p) => p[0])), s: Math.min(...corners.map((p) => p[0])), e: Math.max(...corners.map((p) => p[1])), w: Math.min(...corners.map((p) => p[1])) };

  onStep?.("지형 높이 받는 중");
  const dem = await loadDem(api, ext.ll);
  // Level the elevation model to F1's own track heights (median difference along the lap).
  let offset = 0, demOk = false;
  if (dem) {
    const diffs = [];
    for (let i = 0; i < world.samples.length; i += 5) { const s = world.samples[i], h = dem(...gf.toLL(s.p.x, s.p.z)); if (h != null) diffs.push(s.p.y - h); }
    diffs.sort((a, b) => a - b);
    if (diffs.length > 20) { offset = diffs[Math.floor(diffs.length / 2)]; demOk = true; }
  }
  const nearTrack = (x, z) => world.grid.nearest(x, z, 6);
  // metres from (x, z) to the edge of the track's tarmac on its own side (negative on it): the measured edge of that
  // side (s.L left, s.R right) – not the wider half, which put a pit wall metres short of the edge where the tarmac
  // sits off the lap line
  const sideEdge = (x, z) => { const [s] = nearTrack(x, z); if (!s) return Infinity; const l = (x - s.p.x) * s.nor.x + (z - s.p.z) * s.nor.z; return l >= 0 ? l - (s.L ?? 7) : -l + (s.R ?? -7); };
  // The elevation tiles include the sea floor. Where OSM maps a coastline, points on its sea side (OSM draws
  // coastlines with the land on the left) sit under a sea surface at the local sea level, and land is kept
  // just above it – so harbours look like water instead of a hole, and polders don't flood.
  const coastLines = scene.lines.filter((l) => l.k === "coast").map((l) => l.pts.map(gf.xz));
  const seaR = demOk ? seaRaster(coastLines, ext, (mask, W, H, toPx, cell) => {
    const P = (p) => toPx(...gf.xz(p));
    for (const a of scene.areas) if (a.k !== "water") fillPolygon(mask, W, H, a.pts.map(P), 1);
    for (const bl of scene.buildings) fillPolygon(mask, W, H, bl.pts.map(P), 1);
    for (const l of scene.lines) if ((l.k === "road" || l.k === "raceway" || l.k === "rail") && !l.bridge) strokeLine(mask, W, H, l.pts.map(P), Math.max(0.6, l.w / 2 / cell), 1);
    const tp = world.samples.map((s) => toPx(s.p.x, s.p.z));
    strokeLine(mask, W, H, tp.concat([tp[0]]), ((opts.trackW || 14) / 2 + 6) / cell, 1);
  }) : null;
  const isSea = seaR ? (x, z) => seaR.at(x, z) : () => false;
  const coast = coastLines;
  // Ground height: the elevation model far away, eased into the track's own height near the tarmac.
  const lowTrack = Math.min(...world.samples.map((s) => s.p.y));
  // The sea surface, in scene height. The elevation model is only good to a few metres on flat reclaimed land
  // (Yas Island, Monaco's port), and levelling it to the track can leave the track itself under the sea:
  // no circuit is, so the sea stays at least 1.2 m below the lowest point of the lap.
  // (v0.44) …and no higher than `freeboard` under the lap where it runs along the water: the elevation model reads high in
  // a dense town (its surface takes in the buildings – Monaco: levelled by the median over the lap, the sea came out
  // 11 m under the harbour-front road and 17 m under the tunnel; real harbour quays stand 2–3 m over the water –
  // estimate, not measured), and the land between that road and a sea so far below stood up as saw-toothed cliffs and
  // road-high peaks out of the water (roadground.js shoreCap). Never above the old rule's 1.2 m under the lowest point.
  const coastTrack = (() => {
    if (!demOk || !coast.length || !seaR) return null;
    let lo = Infinity;
    for (let i = 0; i < world.samples.length; i += 2) {
      const s = world.samples[i];
      for (const side of [1, -1]) for (let o = 0; o <= 15; o += 3) { const e = (side > 0 ? s.L ?? 7 : -(s.R ?? -7)) + o, x = s.p.x + s.nor.x * e * side, z = s.p.z + s.nor.z * e * side; if (isSea(x, z)) { lo = Math.min(lo, s.p.y); break; } }
    }
    return Number.isFinite(lo) ? lo : null;
  })();
  const freeboard = 3;
  const seaLevel0 = demOk && coast.length ? Math.min((scene.sea ?? 0) + offset, lowTrack - 1.2) : null;
  const seaLevel = seaLevel0 != null && coastTrack != null && opts.roadJoin !== false ? Math.min(Math.max(seaLevel0, coastTrack - freeboard), lowTrack - 1.2) : seaLevel0;
  let seaCells = 0;
  // the ground held by one stretch of the track d metres from its line: at the road's height (less 0.35 m) to the measured
  // half width of the tarmac plus a margin, eased into the elevation model `far` over 120 m, never above the road edge
  // within 11 m of that margin
  const edgeKept = (s) => Math.max(s?.L ?? 7, -(s?.R ?? -7)) + 2;
  const held = (s, d, far) => { const edge = edgeKept(s); if (d < edge) return s.p.y - 0.35; const k = Math.min(1, (d - edge) / 120), y = s.p.y * (1 - k) + far * k; return d < edge + 11 ? Math.min(y, s.p.y - 0.35) : y; };
  // (another stretch: 60 m or more along the lap from the nearest sample – not the same bend)
  const nSamples = world.samples.length, lapLen = world.samples.reduce((a, s, i) => a + (i ? Math.hypot(s.p.x - world.samples[i - 1].p.x, s.p.z - world.samples[i - 1].p.z) : 0), 0);
  const sectionGap = Math.max(10, Math.round(60 / Math.max(0.5, lapLen / nSamples)));
  const joinOn = opts.roadJoin !== false;   // (development: off – the ground as before v0.44, Map3D.roadJoin(false))
  // (groundBase: before the level yards round the buildings – groundAt, below, is the drawn ground with them)
  const groundBase = (x, z) => {
    let h = demOk ? dem(...gf.toLL(x, z)) : null, sea = false;
    if (h != null && seaLevel != null) {
      // (heights here are before the offset: the sea floor 3 m under the surface, land 0.4 m above it)
      sea = isSea(x, z);
      if (sea) { seaCells++; h = Math.min(h, seaLevel - offset - 3); } else h = Math.max(h, seaLevel - offset + 0.4);
    }
    const far = h != null ? h + offset : demOk ? lowTrack : lowTrack - 2.5;
    const [s, d] = nearTrack(x, z);
    const edge = edgeKept(s);
    if (!s || (sea && d > edge)) return far;   // water stays water right up to the quay
    if (d < edge) return s.p.y - 0.35;                     // under and right beside the tarmac
    const y = held(s, d, far);
    // Another stretch of the lap close by at another height (roadground.js – Monaco: the Beau Rivage climb over the
    // harbour-front road, the roads below the hairpin): from one road's height to the other's across the gap, not a
    // sheer saw-toothed face where the nearest road changes
    const o = joinOn ? otherSection(world.grid, x, z, s, nSamples, sectionGap) : null;
    if (!o || o[1] > 90 || Math.abs(o[0].p.y - s.p.y) < 0.5) return y;
    const [s1, d1] = o, e1 = d1 - edgeKept(s1);
    return e1 < 0 ? s1.p.y - 0.35 : joinHeight(y, d - edge, held(s1, d1, far), e1);
  };
  const trackDist = (x, z) => nearTrack(x, z)[1];
  const corridor = trackCorridor(world, opts.street ? 1.8 : 3.5);

  // Covered stretches of the lap (tunnel.js – Monaco's tunnel), planned before the terrain (kept out of the shore's bank)
  // and the buildings, which the map has standing over them (drawn from the slab's top up, not cleared off the road)
  const tplan = planTunnels({ venueKey: opts.venue?.key, samples: world.samples, geo: gf, buildings: scene.buildings });
  // terrain mesh
  onStep?.("지형 만드는 중");
  const nx = coast.length ? 380 : 240, nz = nx, W = ext.x1 - ext.x0, H = ext.z1 - ext.z0;   // finer near a coast: the shoreline
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3), uvs = new Float32Array((nx + 1) * (nz + 1) * 2), idx = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const k = j * (nx + 1) + i, x = ext.x0 + (W * i) / nx, z = ext.z0 + (H * j) / nz;
    pos[k * 3] = x; pos[k * 3 + 1] = groundBase(x, z); pos[k * 3 + 2] = z;
    uvs[k * 2] = i / nx; uvs[k * 2 + 1] = 1 - j / nz;
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, e = a + nx + 1, f = e + 1; idx.push(a, e, b, b, e, f); }
  // a value given per grid vertex, read across the grid's triangles (as the mesh draws them)
  const onGrid = (arr, stride, off) => (x, z) => {
    const fi = ((x - ext.x0) / W) * nx, fj = ((z - ext.z0) / H) * nz;
    const i = Math.max(0, Math.min(nx - 1, Math.floor(fi))), j = Math.max(0, Math.min(nz - 1, Math.floor(fj))), u = fi - i, v = fj - j;
    const y = (ii, jj) => arr[(jj * (nx + 1) + ii) * stride + off];
    // triangles a-e-b and b-e-f (a = i,j; b = i+1,j; e = i,j+1; f = i+1,j+1)
    return u + v <= 1 ? y(i, j) + (y(i + 1, j) - y(i, j)) * u + (y(i, j + 1) - y(i, j)) * v
      : y(i + 1, j + 1) + (y(i, j + 1) - y(i + 1, j + 1)) * (1 - u) + (y(i + 1, j) - y(i + 1, j + 1)) * (1 - v);
  };
  // height of the drawn terrain surface (the grid's triangles), for things that must lie on it
  const terrainAt = onGrid(pos, 3, 1);
  const edgeAt = (s, side) => (side > 0 ? s.L ?? 7 : s.R ?? -7);
  // The shore (roadground.js shoreCap): land beside the sea comes down to the water as a bank, not road-high peaks over it
  let shore = new Map();
  if (joinOn && seaLevel != null && seaCells > 200) {
    const N = (nx + 1) * (nz + 1), seaV = new Uint8Array(N), keep = new Uint8Array(N), far = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const x = pos[k * 3], z = pos[k * 3 + 2], [s, d] = nearTrack(x, z);
      if (isSea(x, z)) seaV[k] = 1;
      far[k] = Math.max(0, (s ? d : Infinity) - 40);
      // (kept at the road's height: the ground under the tarmac – to 0.5 m short of its edge, so the road's edge stands on
      // a wall – skirtStrips – over the bank, not on a road-high tooth sticking out over the water – and in a tunnel)
      if ((s && d < edgeKept(s) && sideEdge(x, z) < -0.5) || tplan?.inside(x, z, 2)) keep[k] = 1;
    }
    shore = shoreCap(pos, nx, nz, W / nx, H / nz, seaV, keep, seaLevel, { far });
  }
  // Level yards round the map's buildings (footing.js padPlan – why: there): the grid's vertices by a footprint levelled
  // to the middle of the ground under it, never where the yard would reach the track and its run-off (30 m beyond
  // the tarmac's measured edge), the circuit's other mapped tarmac (pit lane, escape roads), a river or the sea.
  // What lies on the ground afterwards follows: groundAt is the old ground plus the yards' change, read across the
  // same triangles.
  let pads = null, padKeepOut = null, padWhy = null;
  const dY = new Float32Array((nx + 1) * (nz + 1));
  for (const [k, y0] of shore) dY[k] = pos[k * 3 + 1] - y0;
  // (not on street circuits: there the buildings stand along the very streets the cars use, on real slopes (Monaco,
  // Baku's old town), the yards changed the ground right beside the kerbs and took seconds over thousands of buildings
  // (Baku: 4.1 s) – the footing alone stands them level there)
  if (opts.buildings !== false && !opts.groundOld && !opts.street && scene.buildings.length) {
    const t0 = performance.now(), CELL = 40, cells = new Map();
    const put = (x, z, o) => { const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; let c = cells.get(k); if (!c) cells.set(k, (c = [])); c.push(o); };
    for (const l of scene.lines) {
      if (l.k !== "raceway" && l.k !== "river") continue;
      const q = l.pts.map(gf.xz), r = (l.w || 8) / 2 + 8;
      for (let i = 1; i < q.length; i++) {
        const sg = { a: q[i - 1], b: q[i], r, water: l.k === "river" }, n = Math.max(1, Math.ceil(Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]) / (CELL / 2)));
        const seen = new Set();
        for (let k = 0; k <= n; k++) for (const dx of [-r, 0, r]) for (const dz of [-r, 0, r]) {
          const x = q[i - 1][0] + ((q[i][0] - q[i - 1][0]) * k) / n + dx, z = q[i - 1][1] + ((q[i][1] - q[i - 1][1]) * k) / n + dz, key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
          if (!seen.has(key)) { seen.add(key); put(x, z, sg); }
        }
      }
    }
    const waters = scene.areas.filter((a) => a.k === "water").map((a) => { const q = a.pts.map(gf.xz); let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { q, x0: x0 - 8, x1: x1 + 8, z0: z0 - 8, z1: z1 + 8 }; });
    // (water areas by the same cells – the big ones, over 2 km across, are asked everywhere)
    const wCells = new Map(), bigWaters = waters.filter((w) => w.x1 - w.x0 > 2000 || w.z1 - w.z0 > 2000);
    for (const w of waters) { if (bigWaters.includes(w)) continue; for (let i = Math.floor(w.x0 / CELL); i <= Math.floor(w.x1 / CELL); i++) for (let j = Math.floor(w.z0 / CELL); j <= Math.floor(w.z1 / CELL); j++) { const k = `${i},${j}`; if (!wCells.has(k)) wCells.set(k, [...bigWaters]); wCells.get(k).push(w); } }
    const segD = (x, z, a, b) => { const ex = b[0] - a[0], ez = b[1] - a[1], l = ex * ex + ez * ez, t = l ? Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l)) : 0; return Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t); };
    // (in: the point is inside a building's outline – no run-off or lane there: only the tarmac's own edge is kept)
    const keepOut = (x, z, inn = false) => {
      const [s, d] = nearTrack(x, z);
      if (isSea(x, z)) return "water";
      for (const w of wCells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || bigWaters) if (x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1 && polyDist(x, z, w.q) < 8) return "water";
      let tarmac = s && d < Math.max(s.L ?? 7, -(s.R ?? -7)) + (inn ? 4 : 30);
      for (const sg of cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) if (segD(x, z, sg.a, sg.b) < (inn ? sg.r - 6.5 : sg.r)) { if (sg.water) return "water"; tarmac = true; }
      return tarmac ? "tarmac" : false;
    };
    padKeepOut = keepOut;
    const padded = scene.buildings.filter((b) => b.kind !== "grandstand" && !(b.min > 3)), fps = padded.map((b) => b.pts.map(gf.xz));
    const plan = padPlan({ x0: ext.x0, z0: ext.z0, W, H, nx, nz }, (k) => pos[k * 3 + 1], terrainAt, fps, keepOut);
    for (const [k, t] of plan.targets) { dY[k] += t - pos[k * 3 + 1]; pos[k * 3 + 1] = t; }
    padWhy = new WeakMap(padded.map((b, i) => [b, plan.why[i] ?? null]));
    pads = { yards: plan.pads, vertices: plan.targets.size, skipped: plan.skipped, ms: Math.round(performance.now() - t0) };
  }
  // No drawn triangle above the tarmac of any stretch of the lap (roadground.js clearRoads): where two stretches at
  // different heights pass within a cell or two of each other, the upper one's vertices tilted triangles up over the
  // lower road. Those vertices come down to the lower road's ground (the upper road's edge gets a wall – below).
  // (after the yards: one standing over a road's edge – Spa, Barcelona – is lowered too)
  const cleared = !joinOn ? new Map() : clearRoads(pos, { x0: ext.x0, z0: ext.z0, W, H, nx, nz }, roadProbes(world.samples, edgeAt));
  for (const [k, y0] of cleared) dY[k] += pos[k * 3 + 1] - y0;
  let shoreDrop = 0, shoreAt = null; for (const [k, y0] of shore) if (y0 - pos[k * 3 + 1] > shoreDrop) { shoreDrop = y0 - pos[k * 3 + 1]; shoreAt = gf.toLL(pos[k * 3], pos[k * 3 + 2]).map((v) => +v.toFixed(5)); }
  const padAt = pads?.vertices || cleared.size || shore.size ? onGrid(dY, 1, 0) : () => 0;
  const groundAt = (x, z) => groundBase(x, z) + padAt(x, z);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  tg.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  tg.setIndex(idx); tg.computeVertexNormals();

  // Free imagery (10 m pixels) is only the colour reference for the class-painted ground (ground.js), which is
  // finished below once the grandstands stand; Google's sharp imagery is the ground itself.
  const classed = opts.provider !== "google";
  const ground = await groundCanvas(api, scene, gf, ext, opts.provider, onStep, { street: opts.street, width: opts.trackW || 14, samples: world.samples, paint: !classed });
  let tmat;
  if (classed) tmat = new THREE.MeshStandardMaterial({ color: 0x7d8a5c, roughness: 0.97, metalness: 0 });
  else {
    const tex = new THREE.CanvasTexture(ground.canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    tmat = withDetail(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.97, metalness: 0 }));
  }
  const terrain = new THREE.Mesh(tg, tmat);
  terrain.name = "terrain"; terrain.receiveShadow = true;
  // Edge colour of the imagery, for the endless ground beyond it.
  const eg = ground.canvas.getContext("2d").getImageData(0, 0, ground.canvas.width, 4).data;
  let er = 0, egg = 0, eb = 0, en = 0;
  for (let i = 0; i < eg.length; i += 64) { er += eg[i]; egg += eg[i + 1]; eb += eg[i + 2]; en++; }
  const edge = new THREE.Color(`rgb(${Math.round(er / en)},${Math.round(egg / en)},${Math.round(eb / en)})`);

  const group = own.group;
  group.name = "scenery";
  group.add(terrain);
  if (seaLevel != null && seaCells > 200) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(W + 30000, H + 30000), new THREE.MeshStandardMaterial({ color: 0x1d4e73, roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.93 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set((ext.x0 + ext.x1) / 2, seaLevel + 0.15, (ext.z0 + ext.z1) / 2);
    sea.name = "sea";
    group.add(sea);
  }

  // A circuit without a modelled pit building gets one from the map's buildings along the measured pit lane
  // (facilities.js genericPitSpec) – picked before the grandstands, as a "grandstand" outline on the garages' line is
  // the pit building mapped so, no stand
  const toTrack = (x, z) => { const [s] = world.grid.nearest(x, z, 8); if (!s) return [1, 0]; const dx = s.p.x - x, dz = s.p.z - z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  const edgeOfTrack = sideEdge;
  // (the FIA drawing's garages for this event, placed by the measured boxes – garageplans.js; the boxes of the session's
  // season, else the nearest season's: v0.38 keyed PIT_BOXES by season and this still read PIT_BOXES[key].boxes – always
  // nothing, so a picked pit building ran between the limiter lines less 40 m, not along the boxes)
  const pitData = START_DATA[opts.venue?.key]?.pit, layout = pitData && opts.year ? layoutFor(opts.venue?.key, opts.year, PIT_BOXES, STANDINGS, teamKey) : null;
  const bySeason = PIT_BOXES[opts.venue?.key], boxSeason = bySeason && Object.keys(bySeason).map(Number).sort((a, b) => Math.abs(a - (opts.year || 0)) - Math.abs(b - (opts.year || 0)) || b - a)[0];
  let bays = null;
  if (layout?.bays) {
    const fr = pathFrame(pitData.path.map(([X, Y]) => gf.xz([X * 0.1, Y * 0.1]))), P = (u) => { const q = fr.at(u); return [q.x, q.z]; };
    bays = { list: layout.bays.map((b) => ({ a: P(b.u0), b: P(b.u1), bay: { n: b.n, owners: b.owners, teams: b.teams, label: b.label, garage: b.garage, section: b.section } })),
      src: layout.plan.src, meta: { src: layout.plan.src, conf: layout.plan.conf, note: layout.plan.note || null, season: layout.from.plan, layoutFrom: layout.from.layout, resid: +layout.fit.resid.toFixed(2) } };
  }
  const garagePlan = layout ? (layout.why ? { why: layout.why } : bays.meta) : { why: "no pit data or season" };
  const generic = opts.buildings !== false ? genericPitSpec({ venue: opts.venue, location: scene.location, year: opts.year, pit: pitData, toScene: ([X, Y]) => gf.xz([X * 0.1, Y * 0.1]), toTrack, trackEdge: edgeOfTrack, boxes: bySeason?.[boxSeason]?.boxes, layout: layout?.bays ? layout : null }) : null;
  for (const b of scene.buildings) delete b.asPitBuilding;   // (a record reused from an earlier build starts clean)
  if (generic && opts.facilities !== false) generic.pick(scene.buildings, gf);

  // Grandstands (with every seat), before the buildings: small buildings inside a stand's footprint go.
  let stands = null;
  if (opts.buildings !== false) {
    onStep?.("관중석 세우는 중");
    stands = buildStands({ scene, gf, world, groundAt, corridor, street: opts.street, year: opts.year || null, corners: opts.corners || [] });
    if (stands) group.add(stands.group);
  }
  const inStand = stands ? (x, z) => stands.footprints.some((f) => inPoly(x, z, f)) : null;

  // Where nothing may grow or lie: roads, other tarmac, buildings, grandstands, water (a 2 m raster).
  const MPX = 2, mw = Math.ceil(W / MPX), mh = Math.ceil(H / MPX);
  const mask = new OffscreenCanvas(mw, mh), mg = mask.getContext("2d", { willReadFrequently: true });
  const MP = (pt) => { const [x, z] = gf.xz(pt); return [(x - ext.x0) / MPX, (z - ext.z0) / MPX]; };
  mg.fillStyle = mg.strokeStyle = "#fff"; mg.lineCap = mg.lineJoin = "round";
  for (const l of scene.lines) {
    if (l.k !== "road" && l.k !== "raceway" && l.k !== "rail" && l.k !== "river") continue;
    mg.lineWidth = (l.w + 3) / MPX; mg.beginPath(); l.pts.forEach((p, i) => { const [x, y] = MP(p); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.stroke();
  }
  for (const a of scene.areas) if (a.k === "water" || a.k === "paved" || a.k === "pitch") { mg.beginPath(); a.pts.forEach((p, i) => { const [x, y] = MP(p); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.closePath(); mg.fill(); }
  for (const b of scene.buildings) { mg.beginPath(); b.pts.forEach((p, i) => { const [x, y] = MP(p); i ? mg.lineTo(x, y) : mg.moveTo(x, y); }); mg.closePath(); mg.fill(); mg.lineWidth = 3 / MPX; mg.stroke(); }
  for (const f of stands?.footprints || []) { mg.beginPath(); f.forEach(([x, z], i) => { const px = (x - ext.x0) / MPX, py = (z - ext.z0) / MPX; i ? mg.lineTo(px, py) : mg.moveTo(px, py); }); mg.closePath(); mg.fill(); mg.lineWidth = 6 / MPX; mg.stroke(); }
  const maskPx = mg.getImageData(0, 0, mw, mh).data;
  const blocked = (x, z) => { const i = Math.floor((x - ext.x0) / MPX), j = Math.floor((z - ext.z0) / MPX); return i < 0 || j < 0 || i >= mw || j >= mh || maskPx[(j * mw + i) * 4 + 3] > 0; };
  let groundPx = null;   // read the big ground image once, only if something needs it
  const groundInfo = { canvas: ground.canvas, mpp: ground.mpp, ext, isSea: seaLevel != null ? isSea : null, pixels: () => groundPx || (groundPx = ground.canvas.getContext("2d").getImageData(0, 0, ground.canvas.width, ground.canvas.height).data) };

  if (classed) {
    onStep?.("땅 표면 만드는 중");
    const S = (x, z) => [(x - ext.x0) / ground.mpp, (z - ext.z0) / ground.mpp];
    const P = (p) => S(...gf.xz(p));
    const R = classRaster(ground, scene, P, S, { samples: world.samples, width: opts.trackW || 14, street: opts.street }, stands?.footprints);
    const cw = ground.canvas.width, chh = ground.canvas.height;
    groundInfo.classAt = (x, z) => { const i = Math.floor((x - ext.x0) / ground.mpp), j = Math.floor((z - ext.z0) / ground.mpp); return i < 0 || j < 0 || i >= cw || j >= chh ? 255 : R[j * cw + i]; };
    // around the circuit (120 m beyond its outline) a second, finer raster: ~0.5 m texels, so the edges of
    // run-offs, gravel traps and service roads seen from the cars and the helicopter aren't stepped
    let fine = null;
    {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const s of world.samples) { x0 = Math.min(x0, s.p.x); x1 = Math.max(x1, s.p.x); z0 = Math.min(z0, s.p.z); z1 = Math.max(z1, s.p.z); }
      x0 = Math.max(ext.x0, x0 - 120); z0 = Math.max(ext.z0, z0 - 120); x1 = Math.min(ext.x1, x1 + 120); z1 = Math.min(ext.z1, z1 + 120);
      const fmpp = Math.max(0.5, Math.max(x1 - x0, z1 - z0) / 4096);
      if (x1 > x0 && z1 > z0 && fmpp < ground.mpp * 0.75) {
        onStep?.("트랙 주변 땅 다듬는 중");
        const fW = Math.ceil((x1 - x0) / fmpp), fH = Math.ceil((z1 - z0) / fmpp);
        const FS = (x, z) => [(x - x0) / fmpp, (z - z0) / fmpp], FP = (p) => FS(...gf.xz(p));
        const src = [(x0 - ext.x0) / ground.mpp, (z0 - ext.z0) / ground.mpp, (fW * fmpp) / ground.mpp, (fH * fmpp) / ground.mpp];
        const R2 = classRaster(ground, scene, FP, FS, { samples: world.samples, width: opts.trackW || 14, street: opts.street }, stands?.footprints, { W: fW, H: fH, mpp: fmpp, src });
        fine = { R: R2, W: fW, H: fH, ext: { x0, z0 }, mpp: fmpp };
      }
    }
    const gm = groundMaterial({ R, W: ground.canvas.width, H: ground.canvas.height, ext, mpp: ground.mpp, tintCanvas: ground.canvas, fine });
    tmat.dispose();
    terrain.material = gm.material;
  }

  // (tplan, the covered stretches: planned with the terrain, above)
  let bld = null, lm = null, pitG = null;
  if (opts.buildings !== false) {
    onStep?.("건물 세우는 중");
    lm = buildLandmarks({ scene, gf, groundAt, location: scene.location, venue: opts.venue, toTrack });
    // the circuit's own facilities (facilities.js): models of the real buildings, replacing their map records
    // (the way the cars run past a point: the lap line's direction there)
    const alongTrack = (x, z) => { const [s] = world.grid.nearest(x, z, 8); return s?.tan ? [s.tan.x, s.tan.z] : [1, 0]; };
    // (the pit lane's tarmac height, for garage floors: as the other tarmac is laid below – on the terrain, at the
    // track's height near it)
    // (v0.44: toward – the way to the track from a garage's front: a nearest stretch behind the building is not the one
    // the pit lane runs beside. Monaco 2025: past Haas' garage the nearest lap was the Piscine 25 m behind the garages,
    // 2.3 m above the straight in front of them – the floors stepped 1.7 m up from one garage to the next. There the
    // nearest stretch on the track's side)
    const surfaceAt = (x, z, toward = null) => {
      let [s, d] = nearTrack(x, z);
      if (s && toward && (s.p.x - x) * toward[0] + (s.p.z - z) * toward[1] < -0.3 * d * Math.hypot(toward[0], toward[1])) {
        s = null; d = Infinity;
        for (const q of world.samples) { const dx = q.p.x - x, dz = q.p.z - z, e = Math.hypot(dx, dz); if (e < d && dx * toward[0] + dz * toward[1] > 0) { s = q; d = e; } }
      }
      const h = s && d < 60 ? s.p.y - 0.02 : groundAt(x, z); return Math.max(h, terrainAt(x, z) + 0.06);
    };
    // metres from a point to the edge of the track's tarmac (the measured half width), negative on it
    const trackEdge = sideEdge;
    // the map's solid barriers (walls, jersey barriers, retaining walls, guard rails – not fences) as segments, and the
    // distance along a ray to the first of them: a pit building's wall is the mapped one where the map has it
    const barrierSegs = [];
    // (only what is drawn – barriersMesh below cuts a piece's points on the tarmac: v0.46, Silverstone 2024's mapped wall
    // was found there, none was drawn, and the last teams' stands had no wall before the tarmac – run/pitwall)
    barrierSegs.push(...solidBarrierSegs(scene.lines, gf.xz, (x, z) => corridor.on(x, z, -0.3)));
    // (kind "fence": the mapped fences – the pit wall's debris fence where the map has no wall: facilities.js)
    const fenceSegs = solidBarrierSegs(scene.lines, gf.xz, (x, z) => corridor.on(x, z, -0.3), /^fence$/);
    const barrierRay = (x, z, dx, dz, max = 60, kind = "solid") => {
      let best = Infinity;
      for (const [ax, az, bx, bz] of kind === "fence" ? fenceSegs : barrierSegs) {
        if (Math.min(ax, bx) > x + max || Math.max(ax, bx) < x - max || Math.min(az, bz) > z + max || Math.max(az, bz) < z - max) continue;
        const ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
        const sx = ((ax - x) * ez - (az - z) * ex) / den, tx = ((ax - x) * dz - (az - z) * dx) / den;
        if (sx > 0 && tx >= 0 && tx <= 1 && sx < best) best = sx;
      }
      return best <= max ? best : Infinity;
    };
    const fac = await buildFacilities({ scene, gf, groundAt, surfaceAt, trackEdge, barrierRay, location: scene.location, venue: opts.venue, year: opts.year, toTrack, alongTrack, trial: opts.facilities !== false, registry: generic ? [...FACILITIES, generic] : FACILITIES, bays,
      readModel: api.geo.model ? (f) => api.geo.model(f) : null, isCurrent: opts.isCurrent || (() => true) });
    // (null: this build's world is gone – its facility models were freed; loadGeo frees the rest of the build)
    // The terrain under the pit building's garages and its pit lane laid under their floor: the elevation grid (~10 m
    // cells) knows nothing of a level pit complex cut into a slope, and where the ground rises behind the lane (Monaco:
    // the harbour slope, v0.39 screenshots) it stood up inside the garages and across the lane, hiding the garages and
    // the cars in them. Only vertices from the back of the garages to the lane's far side are lowered, to 0.1 m under
    // the floor there – nothing is raised, nothing else moves.
    if (fac?.group) fac.group.traverse((o) => {
      const G = o.userData?.garages; if (!G) return;
      pitG = pitG || G;
      let n = 0; const cell = Math.max(W / nx, H / nz);
      for (let k = 0; k < pos.length / 3; k++) {
        const x = pos[k * 3], z = pos[k * 3 + 2], p = G.project(x, z);
        if (p.u < G.gStart - 6 || p.u > G.gEnd + 6) continue;
        const far = (G.wallFace?.(Math.max(G.gStart, Math.min(G.gEnd, p.u))) ?? 12) + 2;
        // (to a grid cell behind the garages' back wall: a vertex left high there tilts the triangles into the garage –
        // v0.39 Monaco, a mound inside every garage; not the track's own vertices: those the ground already holds under it)
        if (p.off < -(G.depth + cell * 1.05) || p.off > far || trackDist(x, z) < (opts.trackW || 14) / 2 + 1) continue;
        const f = G.floorAt(Math.max(G.gStart, Math.min(G.gEnd, p.u))) - 0.1;
        if (pos[k * 3 + 1] > f) { pos[k * 3 + 1] = f; n++; }
      }
      if (n) { tg.attributes.position.needsUpdate = true; tg.computeVertexNormals(); tg.computeBoundingSphere(); }
      G.terrainLowered = n;
    });
    lm = combine(lm, fac);
    if (lm.group) group.add(lm.group);
    bld = buildingsMesh(scene, gf, groundAt, { night: false, location: scene.location, landmarks: lm, raise: tplan?.raise, terrainAt: opts.groundOld ? null : terrainAt }, corridor, inStand);
    if (bld) group.add(bld);
  }
  const tun = tplan?.list.length ? buildTunnels(tplan, terrainAt) : null;
  if (tun) group.add(tun.group);
  // Retaining walls where the drawn ground falls away beside a road's edge (roadground.js skirtStrips – after the
  // clearing above, and the garages' floors): from the tarmac's edge down into the ground, not a hole under the road
  let roadWalls = 0;
  {
    const overOther = (x, z, s) => { const o = otherSection(world.grid, x, z, s, nSamples, sectionGap, 1); return !!o && o[1] < edgeKept(o[0]) + 1; };
    const sk = skirtStrips(world.samples, edgeAt, terrainAt, { skip: (x, z, s) => (tplan?.list.length && tplan.inside(x, z, 2)) || overOther(x, z, s) });
    if (sk.n && joinOn) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(sk.pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(sk.nor, 3)); g.setIndex(sk.idx);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x9c978d, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));
      m.name = "roadWalls"; m.receiveShadow = true; m.castShadow = true;
      group.add(m); roadWalls = sk.n;
    }
  }
  // (nothing grows or lies in a tunnel or on its slab's edge)
  const blocked0 = tplan?.list.length ? (x, z) => blocked(x, z) || tplan.inside(x, z, 1.5) : blocked;
  const blockedTrees = lm ? (x, z) => blocked0(x, z) || lm.keepOut(x, z) : blocked0;
  const w = waterMesh(scene, gf, groundAt);
  if (w) group.add(w);
  if (opts.trees !== false) {
    onStep?.("나무 심는 중");
    const t = treesMesh(scene, gf, groundAt, corridor, blockedTrees, scene.center[0], opts.provider === "google" ? null : groundInfo, opts.street ? 4 : 14);
    if (t) group.add(t);
    const rk = rocksMesh(scene, gf, groundAt, corridor, blockedTrees, scene.center[0], opts.provider === "google" ? null : groundInfo);
    if (rk) group.add(rk);
  }
  // Other tarmac of the venue: mapped raceways that are not on the F1 lap (escape roads, rejoin routes, pit lane, other
  // layouts) and service roads that meet the track – strips at the map's width, joined to the track's edge (auxroads.js)
  // (beside two stretches of the lap at different heights the nearest one's height jumped from point to point – a mapped
  // retaining wall between Monaco's hairpin roads stood as a sloping bar from one road's height to the other's: there,
  // off the tarmac and with the other stretch about as near, things lie on the drawn ground)
  const between = (x, z, s, d) => { if (!joinOn || d < edgeKept(s)) return false; const o = otherSection(world.grid, x, z, s, nSamples, sectionGap); return !!o && o[1] - edgeKept(o[0]) < d - edgeKept(s) + 20 && Math.abs(o[0].p.y - s.p.y) >= 0.5; };
  const heightNear = (x, z) => { const [s, d] = nearTrack(x, z); return s && d < 60 ? (between(x, z, s, d) ? terrainAt(x, z) - 0.05 : s.p.y - 0.02) : groundAt(x, z); };
  const T = { local: corridor.local, edge: (s, side) => (side > 0 ? s.L ?? 7 : s.R ?? -7) };
  const aux = auxRuns(scene.lines.map((l) => ({ ...l, pts: l.pts.map(gf.xz) })), T, { street: !!opts.street, skip: world.laneZone || null });
  // (the track's height only right by it, the terrain's from 10–25 m out: held at the track's height to 60 m, strips
  // floated up to 2.3 m over lower ground beside it – Spa, audit)
  const auxY = (x, z) => { const [s, d] = nearTrack(x, z); const ty = terrainAt(x, z); return s && !between(x, z, s, d) ? blendHeight(s.p.y, ty, d, 10, 25) : ty + 0.05; };
  const tm = auxMesh(aux, T, auxY);
  if (tm) group.add(tm);
  // Real barriers within 45 m of the track.
  // Mapped barriers within 45 m of the track, cut where a mapping error puts them on the tarmac – or across the pit lane
  // in front of the garages, where the session's cars drive in and out of their boxes (v0.46: Imola 2025, two mapped
  // fences ran across the lane between the boxes and the fast lane, the teams' stands shut off from the lane behind
  // them; run/pitwall) – the pit wall a map has stays (it is the lane's end: pitwallcheck.js pitLaneOf)
  const near = [], inLane = pitLaneOf(pitG);
  let laneCut = 0;
  for (const l of scene.lines) {
    if (l.k !== "barrier" || !l.pts.some((p) => { const [x, z] = gf.xz(p); return trackDist(x, z) < 45; })) continue;
    let run = [];
    // (with a pit lane to keep clear: points every 2 m along the line – a straight piece can cross the lane between two)
    // (only near the garages: the rest as mapped)
    const nearPits = (x, z) => { const p = pitG.project(x, z); return p.u > pitG.gStart - 80 && p.u < pitG.gEnd + 80 && Math.abs(p.off) < 120; };
    const pts = inLane ? l.pts.flatMap((p, i) => { if (!i) return [p]; const q = l.pts[i - 1], [ax, az] = gf.xz(q), [bx, bz] = gf.xz(p); if (!nearPits(ax, az) && !nearPits(bx, bz)) return [p]; const m = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2)); return Array.from({ length: m }, (_, k) => q.map((c, j) => c + ((p[j] - c) * (k + 1)) / m)); }) : l.pts;
    for (const p of pts) { const [x, z] = gf.xz(p), lane = !!inLane?.(x, z); laneCut += lane; if (lane || corridor.on(x, z, -0.3)) { if (run.length > 1) near.push({ ...l, pts: run }); run = []; } else run.push(p); }
    if (run.length > 1) near.push({ ...l, pts: run });
  }
  if (pitG) pitG.mapBarrierPointsCut = laneCut;
  let covered = 0;
  const bm = barriersMesh(near, gf, heightNear);
  if (bm) group.add(bm);
  // Share of the lap with a mapped barrier within 30 m (to decide whether the generic walls are still needed).
  if (near.length) {
    const cells = new Set();
    for (const l of near) for (const p of l.pts) { const [x, z] = gf.xz(p); cells.add(`${Math.floor(x / 30)},${Math.floor(z / 30)}`); }
    for (const s of world.samples) if (cells.has(`${Math.floor(s.p.x / 30)},${Math.floor(s.p.z / 30)}`)) covered++;
  }
  // Night (the session is or runs into the night): the light field of the floodlights, street lights and car parks,
  // the lamps themselves and the aircraft warning lights on tall buildings (shown at night only, see map3d)
  let night = null, lightMs = null;
  if (opts.night) {
    onStep?.("야간 조명 켜는 중");
    const xz = (pts) => pts.map(gf.xz), t0 = performance.now();
    night = own.night = lightField({ ext, groundAt: terrainAt, track: { samples: world.samples, width: opts.trackW || 14 },
      lines: scene.lines.filter((l) => l.k === "road" || l.k === "path" || l.k === "raceway").map((l) => ({ ...l, pts: xz(l.pts) })),
      paved: scene.areas.filter((a) => a.k === "paved").map((a) => xz(a.pts)),
      buildings: opts.buildings !== false ? scene.buildings.filter((b) => b.kind !== "grandstand" && !(b.min > 3)).map((b) => xz(b.pts)) : [],
      onTrack: (x, z) => corridor.on(x, z, 4), urban: !!opts.street, covered: tplan?.list.length ? (x, z) => tplan.inside(x, z, 0) : null });
    night.group = lampMeshes(night.lamps);
    const beacons = bld?.userData.beacons || [];
    if (beacons.length) night.group.add(glowPoints(beacons, "beacons"));
    night.group.visible = false;
    group.add(night.group);
    lightMs = Math.round(performance.now() - t0);
  }
  return {
    night,
    group, edge, terrainLevel: demOk ? offset : null, groundAt, sea: seaLevel != null && seaCells > 200,
    barrierShare: covered / world.samples.length,
    // (where the venue's other tarmac meets the track – escape roads, rejoin routes: a generated barrier leaves it open)
    auxGap: aux.length ? onJoiningRun(aux, 1.5, 30, T) : null,
    aux,       // (development: the strips – Map3D.auxNear)
    // (the camera's line-of-sight test isn't recursive: the facilities' meshes themselves)
    tunnel: tun ? { mask: tun.mask, inside: tplan.inside, where: tplan.where, stations: tun.stations, info: tun.info } : null,
    occluders: (bld ? bld.children : []).concat(tun ? tun.occluders : [], stands ? [stands.structure] : [], (() => { const out = []; lm?.group?.getObjectByName("facilities")?.traverse((o) => { if (o.isMesh) out.push(o); }); return out; })()),
    satAt: (x, z) => { const px = groundInfo.pixels(), W = ground.canvas.width, i = Math.floor((x - ext.x0) / ground.mpp), j = Math.floor((z - ext.z0) / ground.mpp); if (i < 0 || j < 0 || i >= W || j >= ground.canvas.height) return null; const o = (j * W + i) * 4; return [px[o], px[o + 1], px[o + 2]]; },
    isSea: seaLevel != null ? isSea : null, landAt: seaR ? (x, z) => seaR.landAt(x, z) : null,
    geo: gf,   // the frame's maps (F1 metres / lat-lon ↔ scene), for placing things by their real position
    scene,     // (development: the map data it was built from – Map3D.mapNear)
    landmarks: lm, stands, classAt: (x, z) => groundInfo.classAt?.(x, z) ?? 255, seaLevel: seaLevel != null && seaCells > 200 ? seaLevel + 0.15 : null,
    info: { ms: { total: Math.round(performance.now() - own.t0), lightField: lightMs }, pads, footing: bld?.userData.footing ?? null, tiles: ground.tiles, failedTiles: ground.failed, zoom: ground.zoom, dem: demOk, buildings: bld?.userData.count ?? 0,
      clearedFromTrack: bld ? { moved: bld.userData.moved, dropped: bld.userData.dropped, raisedOver: bld.userData.overTrack, overTunnel: bld.userData.raised } : null,
      tunnels: tplan?.info || null, roadGround: { cleared: cleared.size, shore: shore.size, shoreDrop: +shoreDrop.toFixed(2), shoreAt, walls: roadWalls, sea: seaLevel != null ? { was: +seaLevel0.toFixed(2), now: +seaLevel.toFixed(2), coastTrack: coastTrack != null ? +coastTrack.toFixed(2) : null } : null },
      trees: group.getObjectByName("trees")?.userData.count ?? 0, landmarks: lm?.count ?? 0, facilities: lm?.facilities || [], garagePlan, region: bld?.userData.region,
      stands: stands ? { stands: stands.info.stands, mapped: stands.info.mapped, seats: stands.info.seats, target: stands.info.target, dead: stands.info.dead, between: stands.info.between, rows: stands.info.list.map((s) => `${s.n}:${s.rows}/${s.max}`).join(", ") } : null },
    bounds: ext,
    // (development: the drawn terrain's height – its grid triangles, not groundAt – and its cell size: Map3D.groundDiag)
    terrainAt, terrainCell: [W / nx, H / nz], padKeepOut, padWhy: (b) => padWhy?.get(b) ?? null, padAt,
  };
}

// Flat satellite ground for the 2D map: imagery plus map paint around a lap given in F1 decimetres.
// Returns { canvas, ext } with ext in F1 metres (x east, y north: x0..x1, y0..y1; canvas row 0 = north edge).
export async function buildGround2D(api, scene, lapDm, opts = {}, onStep) {
  const c = { x: 0, y: 0, z: 0 }, gf = geoFrame(scene, c);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of lapDm) { const x = p[0] / 10, y = p[1] / 10; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const m = 450;
  // scene frame with a zero centre: x = east, z = −north
  const ext = { x0: minX - m, x1: maxX + m, z0: -(maxY + m), z1: -(minY - m) };
  const corners = [[ext.x0, ext.z0], [ext.x1, ext.z0], [ext.x0, ext.z1], [ext.x1, ext.z1]].map(([x, z]) => gf.toLL(x, z));
  ext.ll = { n: Math.max(...corners.map((p) => p[0])), s: Math.min(...corners.map((p) => p[0])), e: Math.max(...corners.map((p) => p[1])), w: Math.min(...corners.map((p) => p[1])) };
  const samples = lapDm.map((p) => ({ p: { x: p[0] / 10, z: -p[1] / 10 } }));
  const g = await groundCanvas(api, scene, gf, ext, opts.provider || "eox", onStep, { street: opts.street, width: opts.width || 14, samples });
  return { canvas: g.canvas, ext: { x0: ext.x0, x1: ext.x1, y0: -ext.z1, y1: -ext.z0 } };
}
