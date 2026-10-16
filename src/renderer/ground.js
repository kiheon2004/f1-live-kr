// Sharp ground for the free imagery. Sentinel-2 is 10 m per pixel: close up (and even from the helicopter) it
// smears into blotches. Instead every ~1 m of ground gets a surface class – from OpenStreetMap where it is mapped
// (roads, car parks, parks, woods, sand, buildings, water) and from the satellite colour elsewhere – and the
// terrain shader paints each class with its own tiling detail texture (mown grass, rough grass, forest floor,
// sand, gravel trap, asphalt, concrete, soil, farmland, water). The satellite image only tints them at large
// scale, so a parched field stays parched and a lush one green, without its blur.
import * as THREE from "./vendor/three.module.js";

export const CLASS = { grass: 0, meadow: 1, forest: 2, sand: 3, gravel: 4, asphalt: 5, concrete: 6, soil: 7, farm: 8, water: 9 };
const N_CLASS = 10;
// metres per texture tile, and how much the satellite colour tints each class
const SCALE = [5, 7, 6, 6, 2.6, 4, 8, 6, 9, 12];
const TINT = [0.8, 0.85, 0.6, 0.45, 0.3, 0.25, 0.3, 0.6, 0.95, 0.5];
const TEX = 512;

// ---------- small helpers ----------
function rand(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Tileable value noise: a lattice of `period` cells that wraps around the texture.
function noiseField(period, seed) {
  const r = rand(seed), v = new Float32Array(period * period).map(() => r());
  return (x, y) => {   // x, y in [0, 1)
    const fx = x * period, fy = y * period, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (i, j) => v[((j % period + period) % period) * period + ((i % period + period) % period)];
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
}
function fbm(seed, periods, weights) {
  const fs = periods.map((p, i) => noiseField(p, seed + i * 101));
  const tot = weights.reduce((a, b) => a + b, 0);
  return (x, y) => { let s = 0; for (let i = 0; i < fs.length; i++) s += fs[i](x, y) * weights[i]; return s / tot; };
}
const clamp = (v, a = 0, b = 255) => Math.max(a, Math.min(b, v));

// ---------- detail textures (sRGB, tileable), drawn once ----------
let LAYERS = null;
function detailLayers() {
  if (LAYERS) return LAYERS;
  const n = TEX, data = new Uint8Array(n * n * 4 * N_CLASS);
  const cv = document.createElement("canvas"); cv.width = cv.height = n;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const put = (layer, fn) => {
    const img = g.getImageData(0, 0, n, n).data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const o = (y * n + x) * 4, [r, gg, b] = fn(x / n, y / n, img[o], img[o + 1], img[o + 2]);
      const d = layer * n * n * 4 + o;
      data[d] = clamp(r); data[d + 1] = clamp(gg); data[d + 2] = clamp(b); data[d + 3] = 255;
    }
  };
  // strokes and dots drawn with wrap-around, so the tile repeats seamlessly
  const wrapDraw = (fn) => { for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) { g.save(); g.translate(dx, dy); fn(); g.restore(); } };
  const clear = (c) => { g.fillStyle = c; g.fillRect(0, 0, n, n); };
  const r = rand(77);

  // 0 mown grass: fine blades in two shades over a soft mottle
  clear("#808080");
  for (let k = 0; k < 9000; k++) {
    const x = r() * n, y = r() * n, a = r() * Math.PI, l = 3 + r() * 5, v = 100 + r() * 70 | 0;
    wrapDraw(() => { g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); });
  }
  { const m = fbm(1, [4, 9, 23], [0.5, 0.3, 0.2]); put(0, (x, y, v) => { const t = m(x, y), k = 0.78 + (v / 255 - 0.5) * 0.45 + (t - 0.5) * 0.35; return [92 * k, 128 * k, 56 * k]; }); }
  // 1 rough grass / meadow: tufts, straw and green patches
  clear("#808080");
  for (let k = 0; k < 7000; k++) {
    const x = r() * n, y = r() * n, v = 70 + r() * 120 | 0, l = 4 + r() * 8, a = -Math.PI / 2 + (r() - 0.5) * 1.2;
    wrapDraw(() => { g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); });
  }
  { const m = fbm(2, [3, 7, 16], [0.5, 0.3, 0.2]); put(1, (x, y, v) => { const t = m(x, y), dry = Math.max(0, Math.min(1, (t - 0.45) * 3)), k = 0.75 + (v / 255 - 0.5) * 0.6; return [(98 + 62 * dry) * k, (118 + 22 * dry) * k, (58 + 26 * dry) * k]; }); }
  // 2 forest floor: dark soil, leaf litter, moss
  clear("#606060");
  for (let k = 0; k < 6000; k++) {
    const x = r() * n, y = r() * n, s = 1 + r() * 3, v = 40 + r() * 140 | 0;
    wrapDraw(() => { g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.ellipse(x, y, s * 1.6, s, r() * 3, 0, Math.PI * 2); g.fill(); });
  }
  { const m = fbm(3, [4, 11], [0.6, 0.4]); put(2, (x, y, v) => { const t = m(x, y), moss = Math.max(0, (t - 0.55) * 2.5), k = 0.6 + v / 255 * 0.7; return [(70 - 22 * moss) * k, (62 + 18 * moss) * k, (40 - 6 * moss) * k]; }); }
  // 3 sand: fine grain and faint ripples
  clear("#808080");
  { const m = fbm(4, [6, 19, 64], [0.3, 0.3, 0.4]), rr = rand(5); put(3, (x, y) => { const rip = Math.sin((y + m(x, y) * 0.08) * Math.PI * 2 * 24) * 0.03, k = 0.9 + (m(x, y) - 0.5) * 0.25 + rip + (rr() - 0.5) * 0.08; return [214 * k, 194 * k, 152 * k]; }); }
  // 4 gravel trap: rounded pebbles, light and dark
  clear("#9a9488");
  for (let k = 0; k < 14000; k++) {
    const x = r() * n, y = r() * n, s = 1.2 + r() * 2.6, v = 120 + r() * 120 | 0;
    wrapDraw(() => { g.fillStyle = `rgba(40,36,30,0.35)`; g.beginPath(); g.ellipse(x + 0.7, y + 0.9, s, s * 0.8, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = `rgb(${v},${v - 6},${v - 16})`; g.beginPath(); g.ellipse(x, y, s, s * 0.8, r() * 3, 0, Math.PI * 2); g.fill(); });
  }
  put(4, (x, y, rr, gg, bb) => [rr * 0.98, gg * 0.96, bb * 0.92]);
  // 5 asphalt: dark aggregate, patched repairs and a few cracks
  clear("#4a4c50");
  for (let k = 0; k < 2; k++) { const x = r() * n, y = r() * n, w = 60 + r() * 120, h = 40 + r() * 90; wrapDraw(() => { g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(x, y, w, h); }); }
  for (let k = 0; k < 6; k++) { let x = r() * n, y = r() * n; const pts = [[x, y]]; for (let s = 0; s < 8; s++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; pts.push([x, y]); } wrapDraw(() => { g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1; g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.stroke(); }); }
  { const rr = rand(6), m = fbm(6, [8, 32], [0.5, 0.5]); put(5, (x, y, v) => { const k = 0.85 + (m(x, y) - 0.5) * 0.25 + (rr() - 0.5) * 0.28; return [v * k * 1.0, v * k * 1.02, v * k * 1.06]; }); }
  // 6 concrete / paving: slabs with joints (2 per tile each way), stains
  clear("#a8a59e");
  g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 2;
  for (const t of [0, n / 2]) { g.beginPath(); g.moveTo(t + 1, 0); g.lineTo(t + 1, n); g.moveTo(0, t + 1); g.lineTo(n, t + 1); g.stroke(); }
  { const rr = rand(7), m = fbm(7, [5, 17], [0.6, 0.4]); put(6, (x, y, v) => { const k = 0.95 + (m(x, y) - 0.5) * 0.18 + (rr() - 0.5) * 0.08; return [v * k * 1.04, v * k * 1.02, v * k]; }); }
  // 7 bare soil
  clear("#808080");
  for (let k = 0; k < 5000; k++) { const x = r() * n, y = r() * n, s = 1 + r() * 4, v = 60 + r() * 130 | 0; wrapDraw(() => { g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); }); }
  { const m = fbm(8, [4, 13], [0.6, 0.4]); put(7, (x, y, v) => { const k = 0.7 + v / 255 * 0.5 + (m(x, y) - 0.5) * 0.25; return [128 * k, 100 * k, 72 * k]; }); }
  // 8 farmland: crop rows (the satellite tint decides green crop or brown field)
  { const m = fbm(9, [5, 21], [0.6, 0.4]), rr = rand(9); put(8, (x, y) => { const row = 0.5 + 0.5 * Math.sin(x * Math.PI * 2 * 32), k = 0.78 + row * 0.3 + (m(x, y) - 0.5) * 0.2 + (rr() - 0.5) * 0.1; return [118 * k, 122 * k, 70 * k]; }); }
  // 9 water bed (under the water surface)
  { const m = fbm(10, [4, 12], [0.5, 0.5]); put(9, (x, y) => { const k = 0.8 + m(x, y) * 0.3; return [42 * k, 72 * k, 86 * k]; }); }

  const tex = new THREE.DataArrayTexture(data, n, n, N_CLASS);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType; tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 8; tex.needsUpdate = true;
  // average colour of each layer (linear), to turn the satellite colour into a relative tint
  const mean = [];
  for (let l = 0; l < N_CLASS; l++) {
    let a = 0, b = 0, c = 0, k = 0;
    for (let i = l * n * n * 4; i < (l + 1) * n * n * 4; i += 64) { a += srgbToLin(data[i]); b += srgbToLin(data[i + 1]); c += srgbToLin(data[i + 2]); k++; }
    mean.push([a / k, b / k, c / k]);
  }
  LAYERS = { tex, mean };
  return LAYERS;
}
const srgbToLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };

// ---------- the class raster ----------
// Rasterizers without anti-aliasing (a class is a label, not a colour).
export function fillPolygon(R, W, H, pts, v) {
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  y0 = Math.max(0, Math.ceil(y0 - 0.5)); y1 = Math.min(H - 1, Math.floor(y1 - 0.5));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5; xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > cy) !== (yj > cy)) xs.push(xi + ((cy - yi) / (yj - yi)) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = a; x <= b; x++) R[y * W + x] = v;
    }
  }
}
export function strokeLine(R, W, H, pts, half, v) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - half)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + half));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - half)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + half));
    const h2 = half * half;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - ax, py = y + 0.5 - ay, t = Math.max(0, Math.min(1, (px * dx + py * dy) / L)), ex = px - dx * t, ey = py - dy * t;
      if (ex * ex + ey * ey <= h2) R[y * W + x] = v;
    }
  }
}

const AREA_CLASS = { farm: CLASS.farm, golf: CLASS.grass, park: CLASS.grass, grass: CLASS.grass, pitch: CLASS.grass, scrub: CLASS.meadow, wetland: CLASS.meadow,
  wood: CLASS.forest, sand: CLASS.sand, rock: CLASS.gravel, paved: CLASS.asphalt, stadium: CLASS.concrete, pier: CLASS.concrete, water: CLASS.water };
const AREA_ORDER = ["farm", "golf", "park", "grass", "pitch", "scrub", "wetland", "wood", "sand", "rock", "paved", "stadium", "pier", "water"];

// The satellite colour of one pixel → a class (0–255 sRGB). `near`: within reach of the track (run-off),
// `dry`: a desert circuit (bare ground is sand rather than soil).
function classify(r, g, b, near, dry) {
  const lum = 0.3 * r + 0.59 * g + 0.11 * b, mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx - mn, exg = 2 * g - r - b;
  if (exg > 14 && g >= r) {
    // (dark canopy without a mapped wood: the trees stand on rough grass)
    if (lum < 70) return CLASS.meadow;
    return r > g * 0.9 ? CLASS.meadow : CLASS.grass;
  }
  if (exg > 5 && lum < 125) return near ? CLASS.grass : CLASS.meadow;
  if (sat < 20 || (b >= r && b >= g)) {
    if (lum < 92) return CLASS.asphalt;
    return CLASS.concrete;
  }
  if (r >= g && g >= b) {
    if (near) return lum > 95 ? CLASS.gravel : CLASS.soil;
    if (lum > 150 || (dry && lum > 105)) return CLASS.sand;
    return dry ? CLASS.sand : CLASS.soil;
  }
  return CLASS.meadow;
}

// Builds the class raster (one byte per ground-canvas pixel) for the scene.
//   sat: { canvas, mpp, ext } – the satellite-only ground canvas; P(pt) → canvas px for F1 metres;
//   track: { samples, width, street }, pavedPolys: outlines to pave (scene x, z; e.g. under grandstands)
//   grid (optional): a finer raster over part of the canvas – { W, H, mpp, src: [sx, sy, sw, sh] canvas px it covers };
//   P and S then map to that raster's pixels
export function classRaster(sat, scene, P, S, track, pavedPolys = [], grid = null) {
  const W = grid ? grid.W : sat.canvas.width, H = grid ? grid.H : sat.canvas.height, mpp = grid ? grid.mpp : sat.mpp;
  const R = new Uint8Array(W * H).fill(255);
  for (const k of AREA_ORDER) {
    const v = AREA_CLASS[k];
    for (const a of scene.areas) if (a.k === k) fillPolygon(R, W, H, a.pts.map(P), v);
  }
  // lines: paths, rails, rivers, roads (wider ones last)
  for (const l of scene.lines) {
    if (l.k === "path") strokeLine(R, W, H, l.pts.map(P), Math.max(0.6, l.w / 2 / mpp), /^(footway|cycleway|pedestrian)$/.test(l.sub) ? CLASS.concrete : CLASS.soil);
    else if (l.k === "rail") strokeLine(R, W, H, l.pts.map(P), 2.2 / mpp, CLASS.gravel);
    else if (l.k === "river") strokeLine(R, W, H, l.pts.map(P), l.w / 2 / mpp, CLASS.water);
  }
  for (const l of scene.lines.filter((x) => (x.k === "road" || x.k === "raceway") && !x.tunnel).sort((a, b) => a.w - b.w)) strokeLine(R, W, H, l.pts.map(P), Math.max(0.8, l.w / 2 / mpp), CLASS.asphalt);
  for (const b of scene.buildings) fillPolygon(R, W, H, b.pts.map(P), CLASS.concrete);
  for (const f of pavedPolys) fillPolygon(R, W, H, f.map(([x, z]) => S(x, z)), CLASS.concrete);
  // street circuits: pavements along the track (the imagery can't show them)
  const tp = track.samples.map((s) => S(s.p.x, s.p.z));
  if (track.street) strokeLine(R, W, H, tp.concat([tp[0]]), (track.width / 2 + 7) / mpp, CLASS.concrete);
  // the run-off zone: within ~60 m beyond the edges, bare ground is a gravel trap and grey is tarmac run-off
  const NEAR = new Uint8Array(W * H);
  strokeLine(NEAR, W, H, tp.concat([tp[0]]), (track.width / 2 + 55) / mpp, 1);
  // everything else from the satellite colour, lightly blurred first so class edges follow smooth contours
  const blur = document.createElement("canvas"); blur.width = W; blur.height = H;
  const bg = blur.getContext("2d", { willReadFrequently: true });
  // (the free imagery is 10 m per pixel: blurred less, its pixels' squares show in the class outlines)
  bg.filter = `blur(${Math.max(1, 7 / mpp).toFixed(1)}px)`;
  if (grid) bg.drawImage(sat.canvas, ...grid.src, 0, 0, W, H); else bg.drawImage(sat.canvas, 0, 0);
  bg.filter = "none";
  const px = bg.getImageData(0, 0, W, H).data;
  // a desert circuit: little vegetation anywhere in the picture (bare ground there is sand, not soil)
  let veg = 0, tot = 0;
  for (let i = 0; i < W * H; i += 97) { const o = i * 4; tot++; if (2 * px[o + 1] - px[o] - px[o + 2] > 14) veg++; }
  const dry = veg / tot < 0.12;
  const free = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (R[i] === 255) { free[i] = 1; R[i] = classify(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], NEAR[i] === 1, dry); }
  // classified pixel by pixel, the satellite areas have blocky, ragged outlines: rounded off by a majority
  // filter (only those pixels change, so the mapped roads and paths keep their exact lines)
  const mr = Math.max(2, Math.round(1.5 / mpp));   // (~3 m either way)
  majority(R, free, W, H, mr); majority(R, free, W, H, mr);
  if (!track.street) cleanShoulders(R, W, H, track.samples, S, mpp);
  return R;
}

// Every pixel with free[i] takes the most common class within ±r pixels (box counts per class, separable).
function majority(R, free, W, H, r) {
  const n = W * H, best = new Uint8Array(n), bestN = new Uint8Array(n), row = new Uint8Array(n), seen = new Uint8Array(N_CLASS);
  for (let i = 0; i < n; i += 7) if (R[i] < N_CLASS) seen[R[i]] = 1;
  for (let k = 0; k < N_CLASS; k++) {
    if (!seen[k]) continue;
    // horizontal counts
    for (let y = 0; y < H; y++) {
      const o = y * W; let c = 0;
      for (let x = 0; x <= Math.min(r, W - 1); x++) c += R[o + x] === k;
      for (let x = 0; x < W; x++) {
        row[o + x] = c;
        if (x + r + 1 < W) c += R[o + x + r + 1] === k;
        if (x - r >= 0) c -= R[o + x - r] === k;
      }
    }
    // vertical sums of those → counts in the box; keep the best class per pixel
    for (let x = 0; x < W; x++) {
      let c = 0;
      for (let y = 0; y <= Math.min(r, H - 1); y++) c += row[y * W + x];
      for (let y = 0; y < H; y++) {
        const i = y * W + x;
        if (c > bestN[i]) { bestN[i] = c; best[i] = k; }
        if (y + r + 1 < H) c += row[(y + r + 1) * W + x];
        if (y - r >= 0) c -= row[(y - r) * W + x];
      }
    }
  }
  for (let i = 0; i < n; i++) if (free[i] && bestN[i]) R[i] = best[i];
}

// The mapped / photographed tarmac never lines up exactly with the track drawn from the cars' positions, so a
// ragged dark fringe showed beyond the white lines. Within 3 m of each edge the ground takes the surface found
// 5 m out, unless that is tarmac or concrete as well (a paved run-off, which carries on up to the edge).
function cleanShoulders(R, W, H, samples, S, mpp) {
  const at = (x, z) => { const [i, j] = S(x, z), a = Math.floor(i), b = Math.floor(j); return a >= 0 && b >= 0 && a < W && b < H ? b * W + a : -1; };
  const paved = (c) => c === CLASS.asphalt || c === CLASS.concrete;
  const step = Math.min(0.5, mpp / 2), n = samples.length;
  for (let i = 0; i < n; i++) {
    const s = samples[i], t = samples[(i + 1) % n];
    for (const side of [1, -1]) {
      const edge = side > 0 ? s.L ?? 7 : s.R ?? -7, k = at(s.p.x + s.nor.x * (edge + side * 5), s.p.z + s.nor.z * (edge + side * 5));
      if (k < 0 || paved(R[k])) continue;
      const fill = R[k];
      // the 2 m to the next sample, across 0–3 m beyond the edge
      for (let f = 0; f < 1; f += step / 2) {
        const px = s.p.x + (t.p.x - s.p.x) * f, pz = s.p.z + (t.p.z - s.p.z) * f;
        const nx = s.nor.x + (t.nor.x - s.nor.x) * f, nz = s.nor.z + (t.nor.z - s.nor.z) * f;
        const e = edge + ((side > 0 ? t.L ?? 7 : t.R ?? -7) - edge) * f;
        for (let o = -0.5; o <= 3; o += step) { const q = at(px + nx * (e + side * o), pz + nz * (e + side * o)); if (q >= 0) R[q] = fill; }
      }
    }
  }
}

// ---------- material ----------
// Terrain material painting classes. tintCanvas: the satellite image (any size, covering ext); R: class raster
// W×H covering ext; ext: { x0, z0, x1, z1 } scene metres of the raster/canvas.
// fine (optional): { R, W, H, ext, mpp } – a finer class raster near the track, used where it covers
export function groundMaterial({ R, W, H, ext, mpp, tintCanvas, fine = null }) {
  const L = detailLayers();
  const cls = new THREE.DataTexture(R, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  cls.magFilter = cls.minFilter = THREE.NearestFilter; cls.generateMipmaps = false; cls.flipY = false; cls.needsUpdate = true;
  cls.unpackAlignment = 1;
  const F = fine || { R: new Uint8Array(1).fill(255), W: 1, H: 1, ext: { x0: 0, z0: 0 }, mpp: 1 };
  const cls2 = new THREE.DataTexture(F.R, F.W, F.H, THREE.RedFormat, THREE.UnsignedByteType);
  cls2.magFilter = cls2.minFilter = THREE.NearestFilter; cls2.generateMipmaps = false; cls2.flipY = false; cls2.needsUpdate = true;
  cls2.unpackAlignment = 1;
  // satellite tint: small and soft (its job is the large-scale colour only)
  const tw = 1024, th = Math.max(1, Math.round((tw * tintCanvas.height) / tintCanvas.width));
  const tc = document.createElement("canvas"); tc.width = tw; tc.height = th;
  const tg = tc.getContext("2d", { willReadFrequently: true });
  tg.filter = "blur(2px)"; tg.drawImage(tintCanvas, 0, 0, tw, th); tg.filter = "none";
  const tint = new THREE.CanvasTexture(tc); tint.colorSpace = THREE.SRGBColorSpace; tint.generateMipmaps = true; tint.minFilter = THREE.LinearMipmapLinearFilter;
  // average satellite colour per class (linear), so the tint is relative: brighter or greener than usual for that class
  const tp = tg.getImageData(0, 0, tw, th).data, sum = Array.from({ length: N_CLASS }, () => [0, 0, 0, 0]);
  for (let y = 0; y < th; y += 2) for (let x = 0; x < tw; x += 2) {
    const c = R[Math.min(H - 1, Math.floor((y / th) * H)) * W + Math.min(W - 1, Math.floor((x / tw) * W))];
    if (c >= N_CLASS) continue;
    const o = (y * tw + x) * 4, s = sum[c];
    s[0] += srgbToLin(tp[o]); s[1] += srgbToLin(tp[o + 1]); s[2] += srgbToLin(tp[o + 2]); s[3]++;
  }
  const satMean = sum.map((s, i) => (s[3] > 50 ? new THREE.Vector3(s[0] / s[3], s[1] / s[3], s[2] / s[3]) : new THREE.Vector3(...L.mean[i])));

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      gCls: { value: cls }, gClsSize: { value: new THREE.Vector2(W, H) }, gExt: { value: new THREE.Vector4(ext.x0, ext.z0, W * mpp, H * mpp) },
      gCls2: { value: cls2 }, gCls2Size: { value: new THREE.Vector2(F.W, F.H) }, gExt2: { value: new THREE.Vector4(F.ext.x0, F.ext.z0, F.W * F.mpp, F.H * F.mpp) }, gFine: { value: fine ? 1 : 0 },
      gDetail: { value: L.tex }, gTint: { value: tint }, gScale: { value: SCALE }, gTintAmt: { value: TINT }, gSatMean: { value: satMean },
    });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vGPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvGPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      precision highp sampler2DArray;
      uniform sampler2D gCls; uniform vec2 gClsSize; uniform vec4 gExt;
      uniform sampler2D gCls2; uniform vec2 gCls2Size; uniform vec4 gExt2; uniform float gFine;
      bool gUseFine = false; ivec2 gMx = ivec2(0);
      // the class at texel i of the raster in use (the fine one near the track, else the whole-area one)
      int gClass(ivec2 i) {
        float v = gUseFine ? texelFetch(gCls2, clamp(i, ivec2(0), gMx), 0).r : texelFetch(gCls, clamp(i, ivec2(0), gMx), 0).r;
        return min(int(v * 255.0 + 0.5), ${N_CLASS - 1});
      }
      uniform sampler2DArray gDetail; uniform sampler2D gTint;
      uniform float gScale[${N_CLASS}]; uniform float gTintAmt[${N_CLASS}]; uniform vec3 gSatMean[${N_CLASS}];
      varying vec3 vGPos;
      float gHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float gNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y); }
      // one class's surface here: its detail texture, a second larger-scale sample against tiling, the satellite tint
      // (lod: 1 close – a second, larger sample breaks up the tiling; 0 further out, one sample is enough)
      float gLod = 1.0;
      vec3 gSurface(int c, vec2 w, vec3 sat) {
        float s = gScale[c];
        vec3 a = texture(gDetail, vec3(w / s, float(c))).rgb;
        vec3 col = a;
        if (gLod > 0.0) { vec3 b = texture(gDetail, vec3(w / (s * 6.7) + 0.37, float(c))).rgb; col = a * mix(vec3(1.0), b / max(vec3(0.02), gSatMeanDetail(c)), 0.35 * gLod); }
        vec3 t = clamp(sat / max(gSatMean[c], vec3(0.004)), vec3(0.55), vec3(1.6));
        return col * mix(vec3(1.0), t, gTintAmt[c]);
      }
      // a class's plain colour (far away: no texture reads)
      vec3 gFlat(int c, vec3 sat) { return gDetailMean[c] * mix(vec3(1.0), clamp(sat / max(gSatMean[c], vec3(0.004)), vec3(0.55), vec3(1.6)), gTintAmt[c]); }
      // corner weights from each class's bilinear share of the four texels, sharpened (share⁸): boundaries follow
      // the share's ½ contour, not the texel staircase (cheap version of the close-up blend)
      vec4 gShare2(int c00, int c10, int c01, int c11, vec2 f) {
        vec4 b = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
        ivec4 c = ivec4(c00, c10, c01, c11);
        vec4 s = vec4(dot(b, vec4(equal(c, ivec4(c00))))), t = vec4(0.0);
        s.y = dot(b, vec4(equal(c, ivec4(c10)))); s.z = dot(b, vec4(equal(c, ivec4(c01)))); s.w = dot(b, vec4(equal(c, ivec4(c11))));
        t = b / max(s, vec4(1e-4)) * pow(s, vec4(8.0));
        return t / max(t.x + t.y + t.z + t.w, 1e-12);
      }`).replace("#include <map_fragment>", `#include <map_fragment>
      {
        vec2 w = vGPos.xz;
        vec2 uv = (w - gExt.xy) / gExt.zw;
        vec3 sat = texture(gTint, vec2(uv.x, 1.0 - uv.y)).rgb;
        // class boundaries: a little noise so they wander like real edges, then smooth contours between texels
        // detail by distance: full close up, lighter further out, the plain colours far away (cheap on big views)
        float gd = distance(vGPos, cameraPosition);
        gLod = 1.0 - smoothstep(300.0, 500.0, gd);
        vec2 jit = vec2(0.0);   // metres
        if (gd < 900.0) {
          // (gentle and long: with the sharp contours below, short wiggles read as torn edges)
          jit = (vec2(gNoise(w * 0.06), gNoise(w * 0.06 + 17.3)) - 0.5) * 2.0;
        }
        // near the track the finer raster (a few texels in from its border, so the 3×3 reads stay inside)
        vec2 uv2 = (w - gExt2.xy) / gExt2.zw, m2 = 3.0 / gCls2Size;
        gUseFine = gFine > 0.5 && all(greaterThan(uv2, m2)) && all(lessThan(uv2, 1.0 - m2));
        vec2 gSize = gUseFine ? gCls2Size : gClsSize;
        vec2 tc = (gUseFine ? uv2 : uv) * gSize + jit * gSize / (gUseFine ? gExt2.zw : gExt.zw) - 0.5;
        gMx = ivec2(gSize) - 1;
        ivec2 i0 = ivec2(floor(tc)); vec2 f = fract(tc);
        int c00 = gClass(i0), c10 = gClass(i0 + ivec2(1, 0)), c01 = gClass(i0 + ivec2(0, 1)), c11 = gClass(i0 + ivec2(1, 1));
        vec3 col;
        if (gd > 1500.0) {
          // far: each class's mean colour, tinted by the satellite – no texture reads
          vec4 wf = gShare2(c00, c10, c01, c11, f);
          col = gFlat(c00, sat) * wf.x + gFlat(c10, sat) * wf.y + gFlat(c01, sat) * wf.z + gFlat(c11, sat) * wf.w;
        }
        else if (c00 == c10 && c00 == c01 && c00 == c11) col = gSurface(c00, w, sat);
        else if (gd > 700.0) {
          // (further out the cheaper 2×2 blend; the texels are too coarse there for more to show)
          vec4 wf = gShare2(c00, c10, c01, c11, f);
          col = vec3(0.0);
          if (wf.x > 0.001) col += gSurface(c00, w, sat) * wf.x;
          if (wf.y > 0.001) col += gSurface(c10, w, sat) * wf.y;
          if (wf.z > 0.001) col += gSurface(c01, w, sat) * wf.z;
          if (wf.w > 0.001) col += gSurface(c11, w, sat) * wf.w;
          col /= max(0.001, dot(wf, vec4(greaterThan(wf, vec4(0.001)))));
        }
        else {
          // Each of the (up to four) classes here gets its share of the 3×3 texels around, weighted by a quadratic
          // B-spline (a smooth bump, so the share changes smoothly across texels), then sharpened (share⁸): two
          // classes meet along the smooth ½ contour of their shares, not along the texels' staircase.
          vec2 tq = tc, cq = floor(tq + 0.5), u = tq - cq;
          vec3 wx = vec3(0.5 * (0.5 - u.x) * (0.5 - u.x), 0.75 - u.x * u.x, 0.5 * (0.5 + u.x) * (0.5 + u.x));
          vec3 wy = vec3(0.5 * (0.5 - u.y) * (0.5 - u.y), 0.75 - u.y * u.y, 0.5 * (0.5 + u.y) * (0.5 + u.y));
          ivec4 cand = ivec4(c00, c10, c01, c11);
          vec4 share = vec4(0.0);
          for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) {
            int c = gClass(ivec2(cq) + ivec2(i - 1, j - 1));
            float wgt = wx[i] * wy[j];
            share += wgt * vec4(equal(cand, ivec4(c)));
          }
          // a class listed twice counts once
          if (cand.y == cand.x) share.y = 0.0;
          if (cand.z == cand.x || cand.z == cand.y) share.z = 0.0;
          if (cand.w == cand.x || cand.w == cand.y || cand.w == cand.z) share.w = 0.0;
          vec4 wv = pow(share, vec4(8.0));
          float wt = max(wv.x + wv.y + wv.z + wv.w, 1e-12);
          col = vec3(0.0);
          if (wv.x > 1e-4 * wt) col += gSurface(cand.x, w, sat) * wv.x;
          if (wv.y > 1e-4 * wt) col += gSurface(cand.y, w, sat) * wv.y;
          if (wv.z > 1e-4 * wt) col += gSurface(cand.z, w, sat) * wv.z;
          if (wv.w > 1e-4 * wt) col += gSurface(cand.w, w, sat) * wv.w;
          col /= wt;
        }
        // mown stripes on grass
        float grassW = (c00 == 0 ? (1.0 - f.x) * (1.0 - f.y) : 0.0) + (c10 == 0 ? f.x * (1.0 - f.y) : 0.0) + (c01 == 0 ? (1.0 - f.x) * f.y : 0.0) + (c11 == 0 ? f.x * f.y : 0.0);
        col *= 1.0 + grassW * 0.07 * sign(sin(w.x * 0.39 + w.y * 0.12));
        diffuseColor.rgb *= col;   // (the material colour dims the ground at night)
      }`);
    // the mean detail colour of each layer, for the anti-tiling ratio
    sh.fragmentShader = sh.fragmentShader.replace("vec3 gSurface(int c", `vec3 gSatMeanDetail(int c) { return gDetailMean[c]; }
      vec3 gSurface(int c`).replace("uniform vec3 gSatMean[", `uniform vec3 gDetailMean[${N_CLASS}]; uniform vec3 gSatMean[`);
    sh.uniforms.gDetailMean = { value: L.mean.map((m) => new THREE.Vector3(...m)) };
  };
  mat.customProgramCacheKey = () => "classGround";
  // the per-circuit textures this material owns (only reachable through shader uniforms, which a generic dispose
  // doesn't see); the shared detail textures stay for the app's lifetime
  mat.userData.ownedTextures = [cls, cls2, tint].filter(Boolean);
  return { material: mat, textures: mat.userData.ownedTextures };
}
