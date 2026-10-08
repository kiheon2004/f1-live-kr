// Real-world surroundings for the 3D circuit.
// F1 position data uses a local, per-circuit frame (decimetres, unknown rotation). OpenStreetMap maps every
// circuit as "highway=raceway" lines, so the F1 lap is fitted onto those (rotation, mirror, shift, scale) and
// everything else – buildings, grandstands, water, woods, roads, barriers, terrain height and satellite
// imagery – can then be placed around the track where it really is.
const { tileArgs, inside } = require("./validate");
const fs = require("node:fs");
const path = require("node:path");

const UA = { "User-Agent": "f1-live-kr/0.6 (personal, non-commercial desktop app)" };
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

// Sea surface where it isn't 0 m (the Caspian at Baku).
const SEA_LEVEL = { Baku: -28 };

// Circuit centres (lat, lon), keyed by the "Location" F1 uses in its session index.
const CIRCUITS = {
  "Melbourne": [-37.8497, 144.968], "Shanghai": [31.3389, 121.22], "Suzuka": [34.8431, 136.541],
  "Sakhir": [26.0325, 50.5106], "Bahrain": [26.0325, 50.5106], "Jeddah": [21.6319, 39.1044],
  "Miami": [25.9581, -80.2389], "Miami Gardens": [25.9581, -80.2389], "Montréal": [45.5, -73.5228], "Montreal": [45.5, -73.5228],
  "Monaco": [43.7347, 7.42056], "Monte Carlo": [43.7347, 7.42056], "Barcelona": [41.57, 2.26111], "Madrid": [40.46528, -3.61528],
  "Spielberg": [47.2197, 14.7647], "Silverstone": [52.0786, -1.01694], "Spa-Francorchamps": [50.4372, 5.97139],
  "Budapest": [47.5789, 19.2486], "Zandvoort": [52.3888, 4.54092], "Monza": [45.6156, 9.28111], "Imola": [44.3439, 11.7167],
  "Baku": [40.3725, 49.8533], "Marina Bay": [1.2914, 103.864], "Singapore": [1.2914, 103.864], "Austin": [30.1328, -97.6411],
  "Mexico City": [19.4042, -99.0907], "São Paulo": [-23.7036, -46.6997], "Sao Paulo": [-23.7036, -46.6997],
  "Las Vegas": [36.1147, -115.173], "Lusail": [25.49, 51.4542], "Yas Island": [24.4672, 54.6031], "Yas Marina": [24.4672, 54.6031],
  "Abu Dhabi": [24.4672, 54.6031], "Kuala Lumpur": [2.76083, 101.738], "Sepang": [2.76083, 101.738],
  "Portimão": [37.227, -8.6267], "Istanbul": [40.9517, 29.405], "Le Castellet": [43.2506, 5.79167], "Mugello": [43.9975, 11.3719],
  "Nürburg": [50.3356, 6.9475], "Sochi": [43.4057, 39.9578], "Hockenheim": [49.3278, 8.56583],
};

// ---------- F1 circuit centrelines (bacinger/f1-circuits, MIT) ----------
// One hand-traced line per circuit in exactly the F1 layout, shipped with the app: the first choice for
// placing the F1 lap (no other layouts or roads to confuse it, and no download).
const CIRCUIT_IDS = {
  "Austin": "us-2012", "Baku": "az-2016", "Barcelona": "es-1991", "Budapest": "hu-1986", "Imola": "it-1953", "Jeddah": "sa-2021",
  "Las Vegas": "us-2023", "Lusail": "qa-2004", "Madrid": "es-2026", "Melbourne": "au-1953", "Mexico City": "mx-1962",
  "Miami": "us-2022", "Miami Gardens": "us-2022", "Monaco": "mc-1929", "Monte Carlo": "mc-1929", "Montréal": "ca-1978", "Montreal": "ca-1978",
  "Monza": "it-1922", "Sakhir": "bh-2002", "Bahrain": "bh-2002", "São Paulo": "br-1940", "Sao Paulo": "br-1940",
  "Kuala Lumpur": "my-1999", "Sepang": "my-1999", "Shanghai": "cn-2004", "Silverstone": "gb-1948", "Marina Bay": "sg-2008",
  "Singapore": "sg-2008", "Spa-Francorchamps": "be-1925", "Spielberg": "at-1969", "Suzuka": "jp-1962", "Yas Island": "ae-2009",
  "Yas Marina": "ae-2009", "Abu Dhabi": "ae-2009", "Zandvoort": "nl-1948", "Portimão": "pt-2008", "Istanbul": "tr-2005",
  "Le Castellet": "fr-1969", "Mugello": "it-1914", "Nürburg": "de-1927", "Sochi": "ru-2014", "Hockenheim": "de-1932",
};
let _lines = null;
function circuitInfo(location) {
  if (!_lines) { try { _lines = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "f1-circuits.json"), "utf8")); } catch { _lines = []; } }
  const id = CIRCUIT_IDS[location];
  const norm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  return _lines.find((c) => c.id === id) || _lines.find((c) => norm(c.location) === norm(location)) || null;
}

// ---------- local metric frame around a centre (accurate to centimetres over a few km) ----------
function frame([lat0, lon0]) {
  const R = 6378137, la = (lat0 * Math.PI) / 180;
  const my = (Math.PI / 180) * R * (1 - 0.00669438) / Math.pow(1 - 0.00669438 * Math.sin(la) ** 2, 1.5);
  const mx = (Math.PI / 180) * R * Math.cos(la) / Math.sqrt(1 - 0.00669438 * Math.sin(la) ** 2);
  return {
    toXY: (lat, lon) => [(lon - lon0) * mx, (lat - lat0) * my],
    toLL: (x, y) => [lat0 + y / my, lon0 + x / mx],
  };
}

// ---------- fitting the F1 lap onto the mapped raceways ----------
class Grid {
  constructor(pts, cell = 20) {
    this.cell = cell; this.map = new Map();
    for (const p of pts) { const k = this.key(p[0], p[1]); let a = this.map.get(k); if (!a) this.map.set(k, (a = [])); a.push(p); }
  }
  key(x, y) { return Math.floor(x / this.cell) * 100003 + Math.floor(y / this.cell); }
  // Nearest point within `reach` metres (searched ring by ring), or null.
  nearest(x, y, reach = 200) {
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    let best = null, bd = Infinity;
    const rings = Math.ceil(reach / this.cell);
    for (let r = 0; r <= rings; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        for (const p of this.map.get((cx + i) * 100003 + (cy + j)) || []) {
          const d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
          if (d < bd) { bd = d; best = p; }
        }
      }
      if (best && Math.sqrt(bd) < r * this.cell) break;   // nothing closer can be further out
    }
    return best && Math.sqrt(bd) <= reach ? [best, Math.sqrt(bd)] : null;
  }
}

// Points every `step` metres along polylines.
function densify(lines, step) {
  const out = [];
  for (const l of lines) {
    for (let i = 1; i < l.length; i++) {
      const [ax, ay] = l[i - 1], [bx, by] = l[i], d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / step));
      for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
    }
    if (l.length) out.push(l[l.length - 1]);
  }
  return out;
}

// Best rotation (+ uniform scale when allowed) and shift taking a → b for paired points (Umeyama, 2D).
function similarity(a, b, withScale) {
  const n = a.length;
  let ax = 0, ay = 0, bx = 0, by = 0;
  for (let i = 0; i < n; i++) { ax += a[i][0]; ay += a[i][1]; bx += b[i][0]; by += b[i][1]; }
  ax /= n; ay /= n; bx /= n; by /= n;
  let sxx = 0, sxy = 0, va = 0;
  for (let i = 0; i < n; i++) {
    const px = a[i][0] - ax, py = a[i][1] - ay, qx = b[i][0] - bx, qy = b[i][1] - by;
    sxx += px * qx + py * qy; sxy += px * qy - py * qx; va += px * px + py * py;
  }
  const th = Math.atan2(sxy, sxx);
  const s = withScale ? Math.hypot(sxx, sxy) / va : 1;
  const c = Math.cos(th) * s, si = Math.sin(th) * s;
  return { c, s: si, tx: bx - (c * ax - si * ay), ty: by - (si * ax + c * ay) };
}
const apply = (T, [x, y]) => [T.c * x - T.s * y + T.tx, T.s * x + T.c * y + T.ty];
const compose = (B, A) => ({ c: B.c * A.c - B.s * A.s, s: B.s * A.c + B.c * A.s, tx: B.c * A.tx - B.s * A.ty + B.tx, ty: B.s * A.tx + B.c * A.ty + B.ty });

// Iterative closest point with the worst matches left out (other layouts, pit lane, map errors).
function icp(src, grid, T, { iters = 20, keep = 0.8, reach = 150, withScale = false } = {}) {
  let err = Infinity;
  for (let it = 0; it < iters; it++) {
    const pairs = [];
    for (const p of src) {
      const q = apply(T, p), hit = grid.nearest(q[0], q[1], reach);
      if (hit) pairs.push([q, hit[0], hit[1]]);
    }
    if (pairs.length < src.length * 0.5) return { T, err: Infinity, inliers: pairs.length / src.length };
    pairs.sort((x, y) => x[2] - y[2]);
    const use = pairs.slice(0, Math.max(10, Math.floor(pairs.length * keep)));
    const step = similarity(use.map((x) => x[0]), use.map((x) => x[1]), withScale);
    T = compose(step, T);
    const e = Math.sqrt(use.reduce((a, x) => a + x[2] * x[2], 0) / use.length);
    if (Math.abs(err - e) < 0.01) { err = e; break; }
    err = e;
  }
  return { T, err };
}

// Distance (in cells, capped) from every cell of a square raster to the nearest mapped line.
// Two-pass chamfer transform; cell = 4 m, the raster spans ±half metres around the centre.
function distanceRaster(lines, half, cell = 4) {
  const n = Math.ceil((2 * half) / cell), INF = 255, d = new Uint8Array(n * n).fill(INF);
  for (const [x, y] of densify(lines, cell / 2)) {
    const i = Math.floor((x + half) / cell), j = Math.floor((y + half) / cell);
    if (i >= 0 && j >= 0 && i < n && j < n) d[j * n + i] = 0;
  }
  const at = (i, j) => d[j * n + i];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let v = at(i, j);
    if (i > 0) v = Math.min(v, at(i - 1, j) + 2);
    if (j > 0) v = Math.min(v, at(i, j - 1) + 2);
    if (i > 0 && j > 0) v = Math.min(v, at(i - 1, j - 1) + 3);
    if (i < n - 1 && j > 0) v = Math.min(v, at(i + 1, j - 1) + 3);
    d[j * n + i] = v;
  }
  for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
    let v = at(i, j);
    if (i < n - 1) v = Math.min(v, at(i + 1, j) + 2);
    if (j < n - 1) v = Math.min(v, at(i, j + 1) + 2);
    if (i < n - 1 && j < n - 1) v = Math.min(v, at(i + 1, j + 1) + 3);
    if (i > 0 && j < n - 1) v = Math.min(v, at(i - 1, j + 1) + 3);
    d[j * n + i] = v;
  }
  // value / 2 ≈ distance in cells
  return { n, cell, half, dist: (x, y) => { const i = Math.floor((x + half) / cell), j = Math.floor((y + half) / cell); return i < 0 || j < 0 || i >= n || j >= n ? Infinity : (d[j * n + i] / 2) * cell; } };
}

// Fit F1 lap points (decimetres, [x, y, z]) onto the mapped circuit (local metres around the circuit centre).
// F1's frame is east/north at 0.1 m per unit, so the offset is what is mostly unknown: it is searched on a
// distance raster (raceway lines first; street circuits are ordinary roads in OSM), then refined by ICP,
// which also absorbs the small rotation of F1's projection. A full rotation/mirror search is the last resort.
// Returns { T, cs, mirror, rms, inliers, scale, ok, against } or null.
function fitTrack(f1pts, raceways, roads = []) {
  if (!f1pts?.length) return null;
  const all = [];
  for (const p of f1pts) { const q = [p[0] * 0.1, p[1] * 0.1]; if (!all.length || Math.hypot(q[0] - all[all.length - 1][0], q[1] - all[all.length - 1][1]) > 6) all.push(q); }
  if (all.length < 40) return null;
  const coarse = all.filter((_, i) => i % Math.max(1, Math.floor(all.length / 200)) === 0);
  const boxC = (ps) => { let a = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of ps) { a = [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])]; } return [(a[0] + a[2]) / 2, (a[1] + a[3]) / 2]; };
  const cs = boxC(all);
  const src = all.map(([x, y]) => [x - cs[0], y - cs[1]]), srcC = coarse.map(([x, y]) => [x - cs[0], y - cs[1]]);
  let best = null;
  const sets = [];
  if (raceways.length) sets.push(["raceway", raceways]);
  if (roads.length) sets.push(["road", raceways.concat(roads)]);
  for (const [against, lines] of sets) {
    const target = densify(lines, 2);
    if (target.length < 50) continue;
    const grid = new Grid(target, 20);
    const onShare = (ps, T, tol) => { let on = 0; for (const p of ps) { const q = apply(T, p); if (grid.nearest(q[0], q[1], tol)) on++; } return on / ps.length; };
    // 1) offset search: every 12 m within ±1.6 km, counting lap points within 12 m of a line
    const R = distanceRaster(lines, 3400, 4);
    const score = (tx, ty, tol) => { let on = 0; for (const [x, y] of srcC) if (R.dist(x + tx, y + ty) <= tol) on++; return on / srcC.length; };
    const peaks = [];
    for (let ty = -1600; ty <= 1600; ty += 12) for (let tx = -1600; tx <= 1600; tx += 12) {
      const sc = score(tx, ty, 12);
      if (sc > 0.45) peaks.push([sc, tx, ty]);
    }
    peaks.sort((a, b) => b[0] - a[0]);
    const tried = [];
    for (const [, px, py] of peaks) {
      if (tried.length >= 6) break;
      if (tried.some(([x, y]) => Math.hypot(x - px, y - py) < 40)) continue;
      tried.push([px, py]);
      // 2) finer offset, then ICP (rotation and a hair of scale allowed)
      let fb = [0, px, py];
      for (let ty = py - 12; ty <= py + 12; ty += 2) for (let tx = px - 12; tx <= px + 12; tx += 2) { const sc = score(tx, ty, 6); if (sc > fb[0]) fb = [sc, tx, ty]; }
      let r = icp(src, grid, { c: 1, s: 0, tx: fb[1], ty: fb[2] }, { iters: 30, keep: 0.85, reach: 40 });
      if (r.err === Infinity) continue;
      r = icp(src, grid, r.T, { iters: 30, keep: 0.9, reach: 20, withScale: true });
      if (r.err === Infinity) continue;
      const cand = { mirror: 1, T: r.T, rms: r.err, inliers: onShare(src, r.T, 6), against };
      if (!best || cand.inliers > best.inliers + 0.01 || (Math.abs(cand.inliers - best.inliers) <= 0.01 && cand.rms < best.rms)) best = cand;
    }
    if (best && best.inliers > 0.9) break;   // raceways matched: roads not needed
  }
  if (!best || best.inliers < 0.7) {
    const slow = raceways.length ? sweep(all, cs, raceways) : null;
    if (slow && (!best || slow.inliers > best.inliers)) best = { ...slow, against: "raceway" };
  }
  if (!best) return null;
  const scale = Math.hypot(best.T.c, best.T.s);
  const ok = best.inliers >= 0.75 && scale > 0.97 && scale < 1.03;
  return { ...best, cs, ok, scale };
}

// Last resort when the east/north assumption fails: try every rotation and the mirror image on raceways.
function sweep(all, cs, raceways) {
  const target = densify(raceways, 2);
  if (target.length < 50) return null;
  const grid = new Grid(target, 20);
  const onShare = (ps, T, tol) => { let on = 0; for (const p of ps) { const q = apply(T, p); if (grid.nearest(q[0], q[1], tol)) on++; } return on / ps.length; };
  const coarse = all.filter((_, i) => i % Math.max(1, Math.floor(all.length / 150)) === 0);
  const boxC = (ps) => { let a = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of ps) { a = [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])]; } return [(a[0] + a[2]) / 2, (a[1] + a[3]) / 2]; };
  const near = target.filter((p) => Math.hypot(p[0], p[1]) < 1800);
  const starts = [boxC(near.length > 100 ? near : target), [0, 0]];
  const cands = [];
  for (const mirror of [1, -1]) {
    const s0 = coarse.map(([x, y]) => [x - cs[0], (y - cs[1]) * mirror]);
    for (let deg = 0; deg < 360; deg += 3) {
      const th = (deg * Math.PI) / 180;
      for (const ct of starts) {
        const r = icp(s0, grid, { c: Math.cos(th), s: Math.sin(th), tx: ct[0], ty: ct[1] }, { iters: 15, keep: 0.8, reach: 300 });
        if (r.err !== Infinity) cands.push({ mirror, T: r.T, share: onShare(s0, r.T, 10), err: r.err });
      }
    }
  }
  cands.sort((a, b) => b.share - a.share || a.err - b.err);
  let best = null;
  for (const cand of cands.slice(0, 6)) {
    const s1 = all.map(([x, y]) => [x - cs[0], (y - cs[1]) * cand.mirror]);
    let r = icp(s1, grid, cand.T, { iters: 30, keep: 0.85, reach: 60 });
    if (r.err === Infinity) continue;
    r = icp(s1, grid, r.T, { iters: 30, keep: 0.9, reach: 25, withScale: true });
    if (r.err === Infinity) continue;
    const sc = { mirror: cand.mirror, T: r.T, rms: r.err, inliers: onShare(s1, r.T, 6) };
    if (!best || sc.inliers > best.inliers) best = sc;
  }
  return best;
}

// F1 decimetres → local metres, and back, from a fit.
function toLocal(fit, [x, y]) { return apply(fit.T, [x * 0.1 - fit.cs[0], (y * 0.1 - fit.cs[1]) * fit.mirror]); }
function toF1(fit, [ex, ey]) {
  const { c, s, tx, ty } = fit.T, k = c * c + s * s;
  const x = ex - tx, y = ey - ty;
  const ux = (c * x + s * y) / k, uy = (-s * x + c * y) / k;
  return [(ux + fit.cs[0]) * 10, (uy * fit.mirror + fit.cs[1]) * 10];
}

// ---------- OpenStreetMap ----------
async function overpass(query) {
  let last;
  // The public servers are often busy (429/504): main server, mirror, then the main server again after a pause.
  for (const [i, url] of [OVERPASS[0], OVERPASS[1], OVERPASS[0]].entries()) {
    if (i === 2) await new Promise((r) => setTimeout(r, 4000));
    try {
      const res = await fetch(url, { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query), signal: AbortSignal.timeout(i === 1 ? 30000 : 120000) });
      if (res.ok) return await res.json();
      last = new Error(`Overpass HTTP ${res.status}`);
    } catch (e) { last = e; }
  }
  throw last;
}

const bbox = ([lat, lon], r) => {
  const dLat = r / 111000, dLon = r / (111000 * Math.cos((lat * Math.PI) / 180));
  return `${(lat - dLat).toFixed(5)},${(lon - dLon).toFixed(5)},${(lat + dLat).toFixed(5)},${(lon + dLon).toFixed(5)}`;
};
// What the fit needs: raceways and roads (street circuits run on ordinary roads), and railways.
function coreQuery(center, r) {
  return `[out:json][timeout:60][bbox:${bbox(center, r)}];
(
  way["highway"="raceway"];
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"];
  way["railway"~"^(rail|light_rail|monorail|tram)$"];
);
out tags geom qt;`;
}
// Scenery: raceways and roads, buildings, grandstands, land cover, water.
function sceneryQuery(center, r) {
  return `[out:json][timeout:90][bbox:${bbox(center, r)}];
(
  way["highway"="raceway"];
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"];
  way["railway"~"^(rail|light_rail|monorail|tram)$"];
  way["building"];
  relation["building"];
  way["building:part"];
  way["leisure"~"^(stadium|grandstand|pitch|park|golf_course|marina|garden|track)$"];
  way["landuse"~"^(forest|grass|meadow|farmland|orchard|vineyard|recreation_ground|village_green|residential|commercial|industrial|retail|construction|brownfield|railway|flowerbed|plant_nursery)$"];
  relation["landuse"~"^(forest|grass|meadow|farmland|residential|industrial)$"];
  way["natural"~"^(wood|scrub|water|beach|sand|bare_rock|grassland|heath|wetland|tree_row)$"];
  relation["natural"~"^(wood|water|scrub)$"];
  way["water"];
  way["waterway"~"^(river|canal|riverbank|stream)$"];
  way["amenity"="parking"];
  way["highway"~"^(footway|path|track|cycleway)$"];
  way["area:highway"];
  way["man_made"~"^(bridge|pier|breakwater|tower)$"];
  way["barrier"~"^(wall|fence|guard_rail|retaining_wall|jersey_barrier)$"];
  way["natural"="coastline"];
  node["natural"="tree"];
);
out tags geom qt;`;
}
// Turns the raw answer into compact local-metre features: lines (roads, raceways, barriers, rivers),
// areas (closed outlines: buildings, land cover, water) and points (single trees).
const LINE_TAGS = (t) => (t.highway && t.area !== "yes") || t.natural === "coastline" || t.barrier || t.railway || t.waterway === "river" || t.waterway === "stream" || t.waterway === "canal" && !t.area || t.natural === "tree_row";
function parseOsm(json, fr) {
  const lines = [], areas = [], points = [];
  const conv = (g) => g.map((p) => fr.toXY(p.lat, p.lon).map((v) => Math.round(v * 10) / 10));
  for (const e of json.elements || []) {
    const tags = e.tags || {};
    if (e.type === "node") { if (e.lat != null) points.push({ tags, pt: fr.toXY(e.lat, e.lon).map((v) => Math.round(v * 10) / 10) }); continue; }
    if (e.type === "way" && e.geometry) {
      const pts = conv(e.geometry.filter(Boolean));
      if (pts.length < 2) continue;
      const closed = pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
      (closed && !LINE_TAGS(tags) ? areas : lines).push({ tags, pts });
    } else if (e.type === "relation" && e.members) {
      // Multipolygons: outer rings only (holes are rare around circuits and harmless to fill).
      const rings = joinRings(e.members.filter((m) => m.type === "way" && m.role !== "inner" && m.geometry).map((m) => conv(m.geometry.filter(Boolean))));
      for (const r of rings) areas.push({ tags, pts: r });
    }
  }
  return { lines, areas, points };
}

// Joins way pieces of a multipolygon into closed rings.
function joinRings(parts) {
  const rings = [], open = parts.map((p) => p.slice());
  const same = (a, b) => a && b && Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
  while (open.length) {
    let ring = open.shift();
    let grew = true;
    while (!same(ring[0], ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const p = open[i], end = ring[ring.length - 1];
        if (same(p[0], end)) { ring = ring.concat(p.slice(1)); open.splice(i, 1); grew = true; break; }
        if (same(p[p.length - 1], end)) { ring = ring.concat(p.slice(0, -1).reverse()); open.splice(i, 1); grew = true; break; }
      }
    }
    if (ring.length > 3) rings.push(ring);
  }
  return rings;
}

// Cached OSM features ("core" for fitting, "scenery" for the surroundings) around a centre, in metres
// relative to `origin` (the circuit's reference point). OSM changes slowly: refreshed after 60 days.
async function getOsm(cacheDir, name, kind, center, r, origin = center) {
  const file = path.join(cacheDir, `osm${kind === "core" ? 2 : 4}_${kind}_${name.replace(/[^A-Za-z0-9]+/g, "_")}.json`);
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < 60 * 864e5) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  try {
    const json = await overpass(kind === "core" ? coreQuery(center, r) : sceneryQuery(center, r));
    const out = parseOsm(json, frame(origin));
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(out));
    return out;
  } catch (e) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch {}   // stale copy when offline
    throw e;
  }
}

// ---------- tiles (terrain heights and imagery) ----------
const TILE_SOURCES = {
  // Sentinel-2 cloudless by EOX (CC BY-NC-SA 4.0, non-commercial use with attribution); about 10 m per pixel.
  eox: { url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/${z}/${y}/${x}.jpg`, maxZoom: 15, cache: true },
  // Mapzen / AWS Terrain Tiles (elevation encoded in RGB, "terrarium").
  terrain: { url: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, maxZoom: 14, cache: true },
};

// One map tile as bytes (cached on disk when the source allows it). Google tiles go through google.js instead.
// (z, x, y are checked to be a real tile, and the cache file to be inside the cache)
async function getTile(cacheDir, source, z, x, y) {
  const src = Object.prototype.hasOwnProperty.call(TILE_SOURCES, source) ? TILE_SOURCES[source] : null;
  if (!src) throw new Error("unknown tile source");
  [z, x, y] = tileArgs(z, x, y);
  const root = path.join(cacheDir, "tiles"), dir = inside(root, path.join(source, String(z)));
  const file = inside(root, path.join(source, String(z), `${x}_${y}`));
  if (src.cache) { try { return fs.readFileSync(file); } catch {} }
  const res = await fetch(src.url(z, x, y), { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`tile HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (src.cache) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, buf); }
  return buf;
}

// Where a circuit is: the table above, else the Jolpica circuit list (matched by town name).
async function locate(cacheDir, location) {
  if (CIRCUITS[location]) return CIRCUITS[location];
  const file = path.join(cacheDir, "jolpica_circuits.json");
  let list;
  try { list = JSON.parse(fs.readFileSync(file, "utf8")); } catch {
    const res = await fetch("https://api.jolpi.ca/ergast/f1/circuits.json?limit=200", { signal: AbortSignal.timeout(15000) });
    list = (await res.json()).MRData.CircuitTable.Circuits;
    fs.writeFileSync(file, JSON.stringify(list));
  }
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const hit = list.find((c) => norm(c.Location.locality) === norm(location)) || list.find((c) => norm(c.circuitName).includes(norm(location)));
  return hit ? [+hit.Location.lat, +hit.Location.long] : null;
}

module.exports = { CIRCUITS, SEA_LEVEL, circuitInfo, frame, fitTrack, toLocal, toF1, getOsm, getTile, locate, parseOsm, coreQuery, sceneryQuery, densify, joinRings, distanceRaster, TILE_SOURCES };
