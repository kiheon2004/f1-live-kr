// Real surroundings for the 3D circuit, built from the fitted map data (see src/main/scene.js):
//   terrain   – elevation tiles (Mapzen/AWS terrarium) levelled to F1's own track heights
//   ground    – satellite imagery (Sentinel-2 cloudless by EOX, or Google with the user's key) with crisp
//               OpenStreetMap roads, car parks and water painted over the free imagery
//   buildings – OSM footprints extruded to their tagged height, windowed walls, grandstands
//   nature    – trees in mapped woods, parks and tree rows; water surfaces
//   circuit   – other mapped tarmac (pit lane, other layouts) and the real barriers along the track
// Everything is in the scene frame of map3d.js: x = F1 east (m) − centre, z = −(F1 north − centre), y = up.
import * as THREE from "./vendor/three.module.js";

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
  paintOsm(g, scene, P, mpp, provider !== "google");
  // Street circuits: pavement and kerbstones beside the track (the 10 m imagery can't show them).
  if (track?.street) {
    const pts = track.samples.map((s) => S(s.p.x, s.p.z));
    const line = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    g.lineJoin = "round"; g.globalAlpha = 0.95;
    g.strokeStyle = "#a19d95"; g.lineWidth = (track.width + 14) / mpp; line(); g.stroke();
    g.strokeStyle = "#8a867f"; g.lineWidth = (track.width + 4) / mpp; line(); g.stroke();
    g.globalAlpha = 1;
  }
  // Night: a light map – floodlights along the circuit, street lights along roads, glow from built-up areas.
  let light = null;
  if (track?.night) {
    light = document.createElement("canvas"); light.width = cw; light.height = ch;
    const l = light.getContext("2d");
    l.fillStyle = "#000"; l.fillRect(0, 0, cw, ch);
    l.lineCap = l.lineJoin = "round";
    l.globalCompositeOperation = "lighter";
    // built-up glow
    l.fillStyle = "rgba(255,190,120,0.10)";
    for (const a of scene.areas) if (a.k === "urban" || a.k === "residential" || a.k === "paved" || a.k === "stadium") { l.beginPath(); a.pts.forEach((p, i) => { const [x, y] = P(p); i ? l.lineTo(x, y) : l.moveTo(x, y); }); l.closePath(); l.fill(); }
    // street lights (sodium orange for ordinary roads, whiter on big ones)
    for (const r of scene.lines) {
      if (r.k !== "road") continue;
      l.strokeStyle = r.w >= 9 ? "rgba(255,220,170,0.55)" : "rgba(255,170,90,0.45)";
      l.lineWidth = Math.max(1, (r.w + 10) / mpp);
      l.beginPath(); r.pts.forEach((p, i) => { const [x, y] = P(p); i ? l.lineTo(x, y) : l.moveTo(x, y); }); l.stroke();
    }
    // floodlit circuit: a wide soft band and a bright core
    const pts = track.samples.map((s) => S(s.p.x, s.p.z));
    const loop = () => { l.beginPath(); pts.forEach(([x, y], i) => (i ? l.lineTo(x, y) : l.moveTo(x, y))); l.closePath(); };
    for (const [w, a] of [[90, 0.12], [50, 0.2], [26, 0.45]]) { l.strokeStyle = `rgba(255,246,225,${a})`; l.lineWidth = w / mpp; loop(); l.stroke(); }
    l.filter = "blur(6px)"; l.globalCompositeOperation = "source-over"; l.drawImage(light, 0, 0); l.filter = "none";
  }
  return {
    light, canvas: cv, mpp, zoom: z, failed, tiles: tiles.length };
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

// Window texture: the upper-left 7/8 is a wall with windows (repeats per storey and bay), the last column is
// plain wall used for roofs. Returns { map, emissive } (emissive: some windows lit, for night).
// Wall textures, one tile = 4 bays (14 m) × 4 storeys (12.8 m); the last eighth of the width is plain wall,
// used for roofs and windowless walls. "facade": rendered walls with framed windows, sills and floor slabs;
// "glass": curtain walls for tall buildings – mullions, dark spandrels and sky reflected in the panes.
// Each comes with an emissive map (some windows lit) that switches on at night.
function facadeTextures(style = "facade") {
  const n = 512, cv = document.createElement("canvas"); cv.width = cv.height = n;
  const g = cv.getContext("2d");
  const e = document.createElement("canvas"); e.width = e.height = n;
  const ge = e.getContext("2d"); ge.fillStyle = "#000"; ge.fillRect(0, 0, n, n);
  const r = rand(style === "glass" ? 13 : 11);
  const cols = 4, rows = 4, cw = (n * 7) / 8 / cols, rh = n / rows;
  if (style === "glass") {
    const sky = g.createLinearGradient(0, 0, 0, n);
    sky.addColorStop(0, "#9fb6c9"); sky.addColorStop(0.5, "#6f8aa1"); sky.addColorStop(1, "#4d6478");
    g.fillStyle = sky; g.fillRect(0, 0, n, n);
    for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.06})`; g.fillRect(r() * n, 0, 8 + r() * 30, n); }   // reflections
    for (let j = 0; j < rows; j++) {
      g.fillStyle = "#3a4450"; g.fillRect(0, j * rh + rh * 0.82, n, rh * 0.18);                           // spandrel at each floor
      for (let i = 0; i < cols * 3; i++) { const x = (i * (n * 7) / 8) / (cols * 3); g.fillStyle = "#2c333b"; g.fillRect(x, j * rh, 3, rh); }   // mullions
      for (let i = 0; i < cols * 3; i++) if (r() < 0.35) { const x = (i * (n * 7) / 8) / (cols * 3); ge.fillStyle = r() < 0.6 ? "#fff1d6" : "#d7e8ff"; ge.fillRect(x + 3, j * rh + 4, (n * 7) / 8 / (cols * 3) - 6, rh * 0.74); }
    }
  } else {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, n, n);
    for (let k = 0; k < 2500; k++) { g.fillStyle = `rgba(0,0,0,${r() * 0.035})`; g.fillRect(r() * n, r() * n, 2, 2); }   // render grain
    for (let j = 0; j < rows; j++) {
      g.fillStyle = "rgba(0,0,0,0.10)"; g.fillRect(0, j * rh + rh - 7, n, 7);                                   // floor slab line
      for (let i = 0; i < cols; i++) {
        const x = i * cw + cw * 0.2, y = j * rh + rh * 0.24, w = cw * 0.6, h = rh * 0.52;
        g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x - 4, y - 4, w + 8, h + 8);                               // reveal / frame shadow
        g.fillStyle = "#e9e6df"; g.fillRect(x - 2, y - 2, w + 4, h + 4);                                         // frame
        const gl = g.createLinearGradient(0, y, 0, y + h); const sh = 80 + Math.floor(r() * 40);
        gl.addColorStop(0, `rgb(${sh + 40},${sh + 55},${sh + 75})`); gl.addColorStop(1, `rgb(${sh - 25},${sh - 15},${sh})`);
        g.fillStyle = gl; g.fillRect(x, y, w, h);
        if (r() < 0.25) { g.fillStyle = "rgba(235,225,200,0.85)"; g.fillRect(x, y, w, h * (0.3 + r() * 0.6)); }  // blinds
        g.fillStyle = "#4a4a4a"; g.fillRect(x + w / 2 - 1, y, 2, h);                                              // mullion
        g.fillStyle = "#d8d4cc"; g.fillRect(x - 6, y + h + 2, w + 12, 6);                                         // sill
        if (r() < 0.45) { ge.fillStyle = r() < 0.7 ? "#ffd9a0" : "#cfe4ff"; ge.fillRect(x, y, w, h); }
      }
    }
  }
  // the plain strip (roofs, windowless walls)
  g.fillStyle = "#ffffff"; g.fillRect((n * 7) / 8, 0, n / 8, n); ge.fillStyle = "#000"; ge.fillRect((n * 7) / 8, 0, n / 8, n);
  const map = new THREE.CanvasTexture(cv), emissive = new THREE.CanvasTexture(e);
  for (const t of [map, emissive]) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, emissive };
}

// Oriented box of a footprint (principal axes): { c, u, v, u0, u1, v0, v1 } with u the long axis.
function obb(pts) {
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x; cz += z; }
  cx /= pts.length; cz /= pts.length;
  let sxx = 0, szz = 0, sxz = 0;
  for (const [x, z] of pts) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
  const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), u = [Math.cos(th), Math.sin(th)], v = [-u[1], u[0]];
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of pts) { const a = (x - cx) * u[0] + (z - cz) * u[1], b = (x - cx) * v[0] + (z - cz) * v[1]; u0 = Math.min(u0, a); u1 = Math.max(u1, a); v0 = Math.min(v0, b); v1 = Math.max(v1, b); }
  return u1 - u0 >= v1 - v0 ? { c: [cx, cz], u, v, u0, u1, v0, v1 } : { c: [cx, cz], u: v, v: [-u[0], -u[1]], u0: v0, u1: v1, v0: -u1, v1: -u0 };
}
const at = (o, a, b) => [o.c[0] + o.u[0] * a + o.v[0] * b, o.c[1] + o.u[1] * a + o.v[1] * b];

// All buildings in one geometry: walls with facade UVs (windows) shaded darker towards the ground, and roofs by
// kind – pitched for houses and small buildings, flat with a parapet and rooftop plant for big blocks – plus
// tiered grandstands with a canopy, facing the track. Faces carry their own normals (flat shading).
function buildingsMesh(scene, gf, groundAt, night, trackNear, track) {
  // geometry goes into ~350 m chunks: off-screen chunks are skipped and line-of-sight tests stay cheap
  const chunks = new Map();
  let pos, nor, uv, col;
  const useChunk = (x, z, style = "facade") => {
    const key = `${style}|${Math.floor(x / 350)},${Math.floor(z / 350)}`;
    let ch = chunks.get(key);
    if (!ch) chunks.set(key, (ch = { pos: [], nor: [], uv: [], col: [] }));
    ({ pos, nor, uv, col } = ch);
  };
  let dropped = 0, moved = 0;
  const c = new THREE.Color();
  const r = rand(5);
  const palette = {
    block: ["#d6d3cb", "#c4c8cc", "#b9c2c9", "#d9cfbd", "#a7b1ba", "#e2e0da", "#cfc6b8", "#bfc9cf"],
    home: ["#e8ddc8", "#efe7d6", "#d9c8ad", "#f1ece2", "#e3d2bd"],
    shed: ["#c8cbce", "#b7bcc1", "#d4d6d8", "#9ea6ad", "#c2c6b9"],
    grandstand: ["#4a5563", "#3f4a57", "#56606d"],
  };
  const roofPal = { block: ["#8f9296", "#9a9da1", "#7f8489"], home: ["#8e5a44", "#9b4f3a", "#6f6a66", "#7d4b3c", "#5b5f66"], shed: ["#a5abb1", "#93999f", "#b4b8bc"] };
  const seatPal = [["#1f4e9c", "#2a62bd"], ["#9a1f24", "#b9282e"], ["#6d737b", "#878d95"], ["#1f6e4a", "#278a5c"], ["#c79a16", "#d9ad22"]];
  const PLAIN = [0.97, 0.5];   // a plain strip of the facade texture (no windows)
  const tmp = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  // A flat-shaded face (triangle fan); `out` is the side it should face; colours per vertex or one colour.
  function face(vs, color, out, uvs) {
    e1.set(vs[1][0] - vs[0][0], vs[1][1] - vs[0][1], vs[1][2] - vs[0][2]);
    e2.set(vs[2][0] - vs[0][0], vs[2][1] - vs[0][1], vs[2][2] - vs[0][2]);
    tmp.crossVectors(e1, e2);
    if (tmp.lengthSq() < 1e-8) return;
    tmp.normalize();
    let order = vs.map((_, i) => i);
    if (out && tmp.x * out[0] + tmp.y * out[1] + tmp.z * out[2] < 0) { order = order.reverse(); tmp.negate(); }
    const cols = Array.isArray(color) ? color : vs.map(() => color);
    for (let i = 1; i < order.length - 1; i++) for (const k of [order[0], order[i], order[i + 1]]) {
      pos.push(...vs[k]); nor.push(tmp.x, tmp.y, tmp.z); col.push(cols[k].r, cols[k].g, cols[k].b);
      uv.push(...(uvs ? uvs[k] : PLAIN));
    }
  }
  const box = (cx, cz, y, w, d, h, ang, color) => {
    const cu = Math.cos(ang), su = Math.sin(ang), P = (a, b, yy) => [cx + cu * a - su * b, yy, cz + su * a + cu * b];
    const xs = [-w / 2, w / 2], zs = [-d / 2, d / 2];
    const top = [P(xs[0], zs[0], y + h), P(xs[1], zs[0], y + h), P(xs[1], zs[1], y + h), P(xs[0], zs[1], y + h)];
    face(top, color, [0, 1, 0]);
    const bot = [P(xs[0], zs[0], y), P(xs[1], zs[0], y), P(xs[1], zs[1], y), P(xs[0], zs[1], y)];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, mx = (bot[i][0] + bot[j][0]) / 2 - cx, mz = (bot[i][2] + bot[j][2]) / 2 - cz; face([bot[i], bot[j], top[j], top[i]], color, [mx, 0, mz]); }
  };
  const shade = (base, k) => base.clone().multiplyScalar(k);
  let count = 0;
  for (const b of scene.buildings) {
    let pts = b.pts.map(gf.xz);
    if (pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
    if (pts.length < 3) continue;
    // Keep the tarmac clear: corners on the track are pushed back to the edge; a building still over the
    // road after that (or mostly on it) is left out. Overpasses (raised on columns) may stay.
    if (track && !(b.min >= 5)) {
      const fixed = track.clearPolygon(pts);
      if (!fixed) { dropped++; continue; }
      if (fixed !== pts) { moved++; pts = fixed; }
    }
    const area = Math.abs(polyArea(pts));
    if (area < 6) continue;
    // tall office blocks get glass curtain walls
    const glass = b.kind === "block" && b.h > 30 && r() < 0.7;
    { let cx = 0, cz = 0; for (const [x, z] of pts) { cx += x; cz += z; } useChunk(cx / pts.length, cz / pts.length, glass ? "glass" : "facade"); }
    let base = Infinity;
    for (const [x, z] of pts) base = Math.min(base, groundAt(x, z));
    if (!Number.isFinite(base)) continue;
    // guessed heights vary a little so a district isn't one flat slab
    let H = b.h;
    if (b.est) H *= 0.75 + r() * 0.6;
    if (b.est && b.kind === "block" && area > 300) H = Math.max(H, 9 + Math.floor(r() * 4) * 3.2);
    const y0 = base + (b.min || 0), y1 = base + Math.max(H, (b.min || 0) + 2.5);
    const kind = b.kind;
    if (kind === "grandstand" && trackNear) { grandstand(pts, base, Math.max(8, H)); count++; continue; }
    const wall = glass ? new THREE.Color("#eef2f6") : new THREE.Color(/^#[0-9a-f]{6}$/i.test(b.colour || "") ? b.colour : palette[kind][Math.floor(r() * palette[kind].length)]);
    const rp = roofPal[kind === "block" && area < 260 && H <= 13 ? "home" : kind] || roofPal.block;   // small buildings mostly have tiled roofs
    const roofC = new THREE.Color(/^#[0-9a-f]{6}$/i.test(b.roofColour || "") ? b.roofColour : rp[Math.floor(r() * rp.length)]);
    const windows = kind === "block" || (kind === "home" && H > 9);
    const o = obb(pts), lenU = o.u1 - o.u0, lenV = o.v1 - o.v0, rect = area / Math.max(1, lenU * lenV);
    // roof type
    let roof = "flat";
    const tag = b.roof;
    if (tag === "gabled" || tag === "hipped" || tag === "pyramidal") roof = tag;
    else if (tag === "flat") roof = "flat";
    else if ((kind === "home" || (b.est && kind !== "shed" && area < 260)) && H <= 13 && area < 450) roof = rect > 0.72 ? (lenU / Math.max(1, lenV) < 1.3 ? "pyramidal" : "gabled") : "flat";
    const parapet = roof === "flat" && kind === "block" && area > 80 ? 0.9 : 0;
    // walls (darker at the foot: a cheap stand-in for ambient occlusion)
    const foot = shade(wall, 0.62), top = wall;
    let gx = 0, gz = 0; for (const [x, z] of pts) { gx += x; gz += z; } gx /= pts.length; gz /= pts.length;
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], len = Math.hypot(bx - ax, bz - az);
      if (len < 0.2) continue;
      let nx = (bz - az) / len, nz = -(bx - ax) / len;
      if (inPoly((ax + bx) / 2 + nx * 0.3, (az + bz) / 2 + nz * 0.3, pts)) { nx = -nx; nz = -nz; }   // point outwards
      const yt = y1 + parapet;
      const u1 = windows ? (len / 14) * 0.875 : PLAIN[0], v0 = windows ? (y0 - base) / 12.8 : PLAIN[1], v1 = windows ? (yt - base) / 12.8 : PLAIN[1];
      const quad = [[ax, y0, az], [bx, y0, bz], [bx, yt, bz], [ax, yt, az]];
      face(quad, [foot, foot, top, top], [nx, 0, nz], windows ? [[0, v0], [u1, v0], [u1, v1], [0, v1]] : null);
      if (parapet) {
        // inner face and cap of the parapet, 0.35 m thick
        const ix = -nx * 0.35, iz = -nz * 0.35, cap = shade(wall, 0.9);
        face([[ax + ix, y1, az + iz], [bx + ix, y1, bz + iz], [bx + ix, yt, bz + iz], [ax + ix, yt, az + iz]], shade(wall, 0.8), [-nx, 0, -nz]);
        face([[ax, yt, az], [bx, yt, bz], [bx + ix, yt, bz + iz], [ax + ix, yt, az + iz]], cap, [0, 1, 0]);
      }
    }
    // roof
    if (roof === "gabled" || roof === "hipped") {
      const ov = 0.45, rh = Math.min(4.5, Math.max(1.6, lenV * 0.42));
      const A = at(o, o.u0 - ov, o.v0 - ov), B = at(o, o.u1 + ov, o.v0 - ov), C = at(o, o.u1 + ov, o.v1 + ov), D = at(o, o.u0 - ov, o.v1 + ov);
      const inset = roof === "hipped" ? lenV / 2 : -ov;   // a gable ridge runs out over the overhang
      const R1 = at(o, o.u0 + inset, (o.v0 + o.v1) / 2), R2 = at(o, o.u1 - inset, (o.v0 + o.v1) / 2);
      const e = y1 - 0.15, ry = y1 + rh, lc = roofC, dc = shade(roofC, 0.82);
      const P3 = (p, y) => [p[0], y, p[1]];
      face([P3(A, e), P3(B, e), P3(R2, ry), P3(R1, ry)], lc, [-o.v[0], 1, -o.v[1]]);
      face([P3(C, e), P3(D, e), P3(R1, ry), P3(R2, ry)], dc, [o.v[0], 1, o.v[1]]);
      face([P3(D, e), P3(A, e), P3(R1, ry)], roof === "hipped" ? lc : wall, [-o.u[0], 0.3, -o.u[1]]);   // gable ends are wall
      face([P3(B, e), P3(C, e), P3(R2, ry)], roof === "hipped" ? dc : wall, [o.u[0], 0.3, o.u[1]]);
    } else if (roof === "pyramidal") {
      const rh = Math.min(4, Math.max(1.5, Math.min(lenU, lenV) * 0.38)), apex = [gx, y1 + rh, gz];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        const k = 0.78 + 0.22 * ((i % 2) ? 1 : 0.85);
        face([[p[0], y1, p[1]], [q[0], y1, q[1]], apex], shade(roofC, k), [(p[0] + q[0]) / 2 - gx, 1, (p[1] + q[1]) / 2 - gz]);
      }
    } else {
      let tris;
      try { tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []); } catch { tris = []; }
      for (const [i, j, k] of tris) face([[pts[i][0], y1, pts[i][1]], [pts[j][0], y1, pts[j][1]], [pts[k][0], y1, pts[k][1]]], roofC, [0, 1, 0]);
      // rooftop plant on big flat roofs
      if (area > 350 && kind !== "home") {
        const n = Math.min(5, 1 + Math.floor(area / 600));
        for (let k = 0, tries = 0; k < n && tries < 30; tries++) {
          const a = o.u0 + r() * lenU, bb = o.v0 + r() * lenV, [x, z] = at(o, a, bb);
          const w = 2 + r() * 4, d = 2 + r() * 3;
          if (!inPoly(x, z, pts) || !inPoly(x + o.u[0] * w / 2, z + o.u[1] * w / 2, pts) || !inPoly(x - o.u[0] * w / 2, z - o.u[1] * w / 2, pts)) continue;
          box(x, z, y1, w, d, 1.2 + r() * 2, Math.atan2(o.u[1], o.u[0]), new THREE.Color(r() < 0.5 ? "#9fa4a9" : "#b8bcc0"));
          k++;
        }
      }
    }
    count++;
  }
  // Grandstand: rows of seats rising away from the track, a back wall, and a roof over the upper rows.
  function grandstand(pts, base, H) {
    const o = obb(pts);
    const [s] = trackNear(o.c[0], o.c[1]);
    // depth axis = the box axis pointing most towards the track; the front is the side nearer the track
    let du = o.u, dv = o.v, a0 = o.u0, a1 = o.u1, b0 = o.v0, b1 = o.v1;
    if (s) {
      const tx = s.p.x - o.c[0], tz = s.p.z - o.c[1];
      const alongU = Math.abs(tx * o.u[0] + tz * o.u[1]) > Math.abs(tx * o.v[0] + tz * o.v[1]);
      if (alongU) { du = o.v; dv = o.u; a0 = o.v0; a1 = o.v1; b0 = o.u0; b1 = o.u1; }
      // make b run from the front (near the track) to the back
      if (tx * dv[0] + tz * dv[1] > 0) { dv = [-dv[0], -dv[1]]; [b0, b1] = [-b1, -b0]; }
    }
    const P = (a, b, y) => [o.c[0] + du[0] * a + dv[0] * b, y, o.c[1] + du[1] * a + dv[1] * b];
    const depth = b1 - b0, rows = Math.max(4, Math.min(24, Math.round(depth / 1.4))), rise = (H - 3) / rows;
    const seats = seatPal[Math.floor(r() * seatPal.length)].map((h) => new THREE.Color(h));
    const concrete = new THREE.Color("#c9c6bf"), dark = new THREE.Color("#5c6168"), white = new THREE.Color("#eef0f2");
    const front = [-dv[0], 0, -dv[1]];
    for (let k = 0; k < rows; k++) {
      const bA = b0 + (depth * k) / rows, bB = b0 + (depth * (k + 1)) / rows, y = base + 1.5 + rise * (k + 1);
      face([P(a0, bA, y), P(a1, bA, y), P(a1, bB, y), P(a0, bB, y)], seats[k % 2], [0, 1, 0]);                     // tread with seats
      face([P(a0, bA, y - rise), P(a1, bA, y - rise), P(a1, bA, y), P(a0, bA, y)], concrete, front);                 // riser
    }
    face([P(a0, b0, base), P(a1, b0, base), P(a1, b0, base + 1.5 + rise), P(a0, b0, base + 1.5 + rise)], concrete, front);   // front wall
    const top = base + 1.5 + rise * rows;
    face([P(a0, b1, base), P(a1, b1, base), P(a1, b1, top + 4), P(a0, b1, top + 4)], dark, [dv[0], 0, dv[1]]);      // back wall
    for (const [aa, sgn] of [[a0, -1], [a1, 1]]) {                                                                     // side walls (stepped profile)
      const prof = [P(aa, b0, base)];
      for (let k = 0; k < rows; k++) { const y = base + 1.5 + rise * (k + 1); prof.push(P(aa, b0 + (depth * k) / rows, y), P(aa, b0 + (depth * (k + 1)) / rows, y)); }
      prof.push(P(aa, b1, top + 4), P(aa, b1, base));
      for (let i = 1; i < prof.length - 1; i++) face([prof[0], prof[i], prof[i + 1]], dark, [du[0] * sgn, 0, du[1] * sgn]);
    }
    // cantilevered roof over the upper rows, tilted up towards the track
    const rb = b0 + depth * 0.55, ry0 = top + 4, ry1 = top + 5.5;
    face([P(a0 - 1, rb, ry1), P(a1 + 1, rb, ry1), P(a1 + 1, b1 + 0.5, ry0), P(a0 - 1, b1 + 0.5, ry0)], white, [0, 1, 0]);
    face([P(a0 - 1, rb, ry1 - 0.35), P(a1 + 1, rb, ry1 - 0.35), P(a1 + 1, b1 + 0.5, ry0 - 0.35), P(a0 - 1, b1 + 0.5, ry0 - 0.35)], dark, [0, -1, 0]);
  }
  if (!count) return null;
  const tex = facadeTextures(), gtex = facadeTextures("glass");
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex.map, roughness: 0.85, metalness: 0.02,
    emissiveMap: tex.emissive, emissive: new THREE.Color(night ? 0xffffff : 0x000000), emissiveIntensity: night ? 0.9 : 0 });
  const gmat = new THREE.MeshStandardMaterial({ vertexColors: true, map: gtex.map, roughness: 0.22, metalness: 0.12,
    emissiveMap: gtex.emissive, emissive: new THREE.Color(night ? 0xffffff : 0x000000), emissiveIntensity: night ? 0.9 : 0 });
  const group = new THREE.Group();
  group.name = "buildings";
  for (const [key, ch] of chunks) {
    if (!ch.pos.length) continue;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(ch.pos, 3));
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(ch.nor, 3));
    geom.setAttribute("uv", new THREE.Float32BufferAttribute(ch.uv, 2));
    geom.setAttribute("color", new THREE.Float32BufferAttribute(ch.col, 3));
    geom.computeBoundingSphere(); geom.computeBoundingBox();
    const mesh = new THREE.Mesh(geom, key.startsWith("glass") ? gmat : mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.userData = { material: mat, materials: [mat, gmat], dropped, moved, count };
  return group;
}

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

// A strip of tarmac along a polyline (pit lanes, other layouts of the venue).
function tarmacMesh(lines, gf, heightAt, width = 9) {
  const pos = [], nor = [], idx = [];
  for (const l of lines) {
    const pts = l.map(gf.xz);
    if (pts.length < 2) continue;
    const v0 = pos.length / 3;
    pts.forEach(([x, z], i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
      const y = heightAt(x, z) + 0.04;
      pos.push(x + nx * width / 2, y, z + nz * width / 2, x - nx * width / 2, y, z - nz * width / 2);
      nor.push(0, 1, 0, 0, 1, 0);
      // counter-clockwise seen from above, so the up-facing normals are the front side
      if (i) { const v = v0 + i * 2; idx.push(v - 2, v, v - 1, v - 1, v, v + 1); }
    });
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1 }));
  m.receiveShadow = true;
  return m;
}

// Mapped barriers next to the track: concrete walls, tyre/guard rails and tall debris fences.
function barriersMesh(lines, gf, heightAt) {
  const kinds = {
    wall: { h: 1.1, color: 0xd9dcdf }, retaining_wall: { h: 1.4, color: 0xc9cbcd }, jersey_barrier: { h: 0.9, color: 0xdfe1e3 },
    guard_rail: { h: 0.9, color: 0xa9b0b7 }, fence: { h: 3.6, color: 0x9aa3ab, fence: true },
  };
  const groups = new THREE.Group();
  for (const [kind, spec] of Object.entries(kinds)) {
    const pos = [], idx = [];
    for (const l of lines) {
      if (l.sub !== kind) continue;
      const pts = l.pts.map(gf.xz);
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
        const ya = heightAt(ax, az), yb = heightAt(bx, bz), v = pos.length / 3;
        pos.push(ax, ya, az, bx, yb, bz, bx, yb + spec.h, bz, ax, ya + spec.h, az);
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      }
    }
    if (!idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = spec.fence
      ? new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.6, metalness: 0.4, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
      : new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.75, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = !spec.fence; mesh.receiveShadow = true;
    groups.add(mesh);
  }
  return groups.children.length ? groups : null;
}

// ---------- the whole thing ----------
// world: { samples, grid, center, box, n } from map3d; nearestTrack(x, z) → [sample, dist].
// opts: { provider: "eox" | "google", buildings, trees, night }
export async function buildScenery(api, scene, world, opts, onStep) {
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
  // The elevation tiles include the sea floor. Where OSM maps a coastline, points on its sea side (OSM draws
  // coastlines with the land on the left) sit under a sea surface at the local sea level, and land is kept
  // just above it – so harbours look like water instead of a hole, and polders don't flood.
  const coast = [];
  for (const l of scene.lines) if (l.k === "coast") { const p = l.pts.map(gf.xz); for (let i = 1; i < p.length; i++) coast.push([p[i - 1], p[i]]); }
  const coastCells = new Map();
  for (const seg of coast) {
    const [a, b] = seg, n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 100);
    for (let k = 0; k <= n; k++) {
      const key = `${Math.floor((a[0] + ((b[0] - a[0]) * k) / n) / 200)},${Math.floor((a[1] + ((b[1] - a[1]) * k) / n) / 200)}`;
      let arr = coastCells.get(key);
      if (!arr) coastCells.set(key, (arr = []));
      if (arr[arr.length - 1] !== seg) arr.push(seg);
    }
  }
  const isSea = (x, z) => {
    if (!coast.length) return false;
    const cx = Math.floor(x / 200), cz = Math.floor(z / 200);
    let best = null, bd = Infinity;
    for (let r = 0; r <= 12 && !best; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      for (const seg of coastCells.get(`${cx + i},${cz + j}`) || []) {
        const [a, b] = seg, dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L));
        const d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
        if (d < bd) { bd = d; best = seg; }
      }
    }
    if (!best) return false;
    const [a, b] = best;
    // Scene z points south, which flips the sign: land (left of the way on the map) gives a negative cross
    // product here, sea a positive one.
    return (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) > 0;
  };
  const seaLevel = demOk && coast.length ? (scene.sea ?? 0) + offset : null;
  let seaCells = 0;
  // Ground height: the elevation model far away, eased into the track's own height near the tarmac.
  const lowTrack = Math.min(...world.samples.map((s) => s.p.y));
  const groundAt = (x, z) => {
    let h = demOk ? dem(...gf.toLL(x, z)) : null, sea = false;
    if (h != null && seaLevel != null) {
      const sea0 = scene.sea ?? 0;
      sea = isSea(x, z);
      if (sea) { seaCells++; h = Math.min(h, sea0 - 3); } else h = Math.max(h, sea0 + 0.4);
    }
    const far = h != null ? h + offset : demOk ? lowTrack : lowTrack - 2.5;
    const [s, d] = nearTrack(x, z);
    const edge = Math.max(s?.L ?? 7, -(s?.R ?? -7)) + 2;      // the measured half width of the tarmac, plus a margin
    if (!s || (sea && d > edge)) return far;   // water stays water right up to the quay
    if (d < edge) return s.p.y - 0.35;                     // under and right beside the tarmac
    const k = Math.min(1, (d - edge) / 120), y = s.p.y * (1 - k) + far * k;
    return d < edge + 11 ? Math.min(y, s.p.y - 0.35) : y;   // never above the road edge
  };
  const trackDist = (x, z) => nearTrack(x, z)[1];
  const corridor = trackCorridor(world, opts.street ? 1.8 : 3.5);

  // terrain mesh
  onStep?.("지형 만드는 중");
  const nx = 240, nz = 240, W = ext.x1 - ext.x0, H = ext.z1 - ext.z0;
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3), uvs = new Float32Array((nx + 1) * (nz + 1) * 2), idx = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const k = j * (nx + 1) + i, x = ext.x0 + (W * i) / nx, z = ext.z0 + (H * j) / nz;
    pos[k * 3] = x; pos[k * 3 + 1] = groundAt(x, z); pos[k * 3 + 2] = z;
    uvs[k * 2] = i / nx; uvs[k * 2 + 1] = 1 - j / nz;
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, e = a + nx + 1, f = e + 1; idx.push(a, e, b, b, e, f); }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  tg.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  tg.setIndex(idx); tg.computeVertexNormals();

  const ground = await groundCanvas(api, scene, gf, ext, opts.provider, onStep, { street: opts.street, width: opts.trackW || 14, samples: world.samples, night: opts.night });
  const tex = new THREE.CanvasTexture(ground.canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const tmat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.97, metalness: 0 });
  if (ground.light) {
    const lt = new THREE.CanvasTexture(ground.light); lt.colorSpace = THREE.SRGBColorSpace;
    tmat.emissiveMap = lt; tmat.emissive = new THREE.Color(0xffffff); tmat.emissiveIntensity = 0;   // switched on at night
  }
  const terrain = new THREE.Mesh(tg, withDetail(tmat));
  terrain.name = "terrain"; terrain.receiveShadow = true;
  // Edge colour of the imagery, for the endless ground beyond it.
  const eg = ground.canvas.getContext("2d").getImageData(0, 0, ground.canvas.width, 4).data;
  let er = 0, egg = 0, eb = 0, en = 0;
  for (let i = 0; i < eg.length; i += 64) { er += eg[i]; egg += eg[i + 1]; eb += eg[i + 2]; en++; }
  const edge = new THREE.Color(`rgb(${Math.round(er / en)},${Math.round(egg / en)},${Math.round(eb / en)})`);

  const group = new THREE.Group();
  group.name = "scenery";
  group.add(terrain);
  if (seaLevel != null && seaCells > 200) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(W + 30000, H + 30000), new THREE.MeshStandardMaterial({ color: 0x1d4e73, roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.93 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set((ext.x0 + ext.x1) / 2, seaLevel + 0.15, (ext.z0 + ext.z1) / 2);
    sea.name = "sea";
    group.add(sea);
  }

  // Where nothing may grow or lie: roads, other tarmac, buildings, water (a 2 m raster).
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
  const maskPx = mg.getImageData(0, 0, mw, mh).data;
  const blocked = (x, z) => { const i = Math.floor((x - ext.x0) / MPX), j = Math.floor((z - ext.z0) / MPX); return i < 0 || j < 0 || i >= mw || j >= mh || maskPx[(j * mw + i) * 4 + 3] > 0; };
  let groundPx = null;   // read the big ground image once, only if something needs it
  const groundInfo = { canvas: ground.canvas, mpp: ground.mpp, ext, pixels: () => groundPx || (groundPx = ground.canvas.getContext("2d").getImageData(0, 0, ground.canvas.width, ground.canvas.height).data) };

  let bld = null;
  if (opts.buildings !== false) {
    onStep?.("건물 세우는 중");
    bld = buildingsMesh(scene, gf, groundAt, false, nearTrack, corridor);
    if (bld) group.add(bld);
  }
  const w = waterMesh(scene, gf, groundAt);
  if (w) group.add(w);
  if (opts.trees !== false) {
    onStep?.("나무 심는 중");
    const t = treesMesh(scene, gf, groundAt, corridor, blocked, scene.center[0], opts.provider === "google" ? null : groundInfo, opts.street ? 4 : 14);
    if (t) group.add(t);
    const rk = rocksMesh(scene, gf, groundAt, corridor, blocked, scene.center[0], opts.provider === "google" ? null : groundInfo);
    if (rk) group.add(rk);
  }
  // Other tarmac of the venue: mapped raceways that are not on the F1 lap (pit lane, other layouts).
  const extra = [];
  for (const l of scene.lines) {
    if (l.k !== "raceway") continue;
    let run = [];
    for (const p of l.pts) {
      const [x, z] = gf.xz(p);
      // clear of the F1 track's own tarmac (half its width plus half the lane's)
      if (trackDist(x, z) > (opts.trackW || 14) / 2 + 5.5) run.push(p); else { if (run.length > 1) extra.push(run); run = []; }
    }
    if (run.length > 1) extra.push(run);
  }
  const heightNear = (x, z) => { const [s, d] = nearTrack(x, z); return s && d < 60 ? s.p.y - 0.02 : groundAt(x, z); };
  const tm = tarmacMesh(extra, gf, heightNear);
  if (tm) group.add(tm);
  // Real barriers within 45 m of the track.
  // Mapped barriers within 45 m of the track, cut where a mapping error puts them on the tarmac.
  const near = [];
  for (const l of scene.lines) {
    if (l.k !== "barrier" || !l.pts.some((p) => { const [x, z] = gf.xz(p); return trackDist(x, z) < 45; })) continue;
    let run = [];
    for (const p of l.pts) { const [x, z] = gf.xz(p); if (corridor.on(x, z, -0.3)) { if (run.length > 1) near.push({ ...l, pts: run }); run = []; } else run.push(p); }
    if (run.length > 1) near.push({ ...l, pts: run });
  }
  let covered = 0;
  const bm = barriersMesh(near, gf, heightNear);
  if (bm) group.add(bm);
  // Share of the lap with a mapped barrier within 30 m (to decide whether the generic walls are still needed).
  if (near.length) {
    const cells = new Set();
    for (const l of near) for (const p of l.pts) { const [x, z] = gf.xz(p); cells.add(`${Math.floor(x / 30)},${Math.floor(z / 30)}`); }
    for (const s of world.samples) if (cells.has(`${Math.floor(s.p.x / 30)},${Math.floor(s.p.z / 30)}`)) covered++;
  }
  return {
    group, edge, terrainLevel: demOk ? offset : null, groundAt, sea: seaLevel != null && seaCells > 200,
    barrierShare: covered / world.samples.length,
    occluders: bld ? bld.children : [],
    info: { tiles: ground.tiles, failedTiles: ground.failed, zoom: ground.zoom, dem: demOk, buildings: bld?.userData.count ?? 0,
      clearedFromTrack: bld ? { moved: bld.userData.moved, dropped: bld.userData.dropped } : null,
      trees: group.getObjectByName("trees")?.userData.count ?? 0 },
    bounds: ext,
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
