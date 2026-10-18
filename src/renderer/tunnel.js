// Covered stretches of the lap – Monaco's tunnel under the Fairmont hotel (Boulevard Louis II) and the short passage
// after Portier – built along the track as the app draws it (its samples and measured edges, so the walls stand at the
// drawn road's edges and the ceiling follows its height), not a generic tube on a centre line. What the map has over
// them (the hotel, the block over the exit) is drawn above the slab by buildings.js (raised: buildingsOver picks the
// map outlines that sit over the roofed corridor; nothing is deleted round it); under a raised building on the sea side
// the hotel's piles stand, on the hill side its podium walls. The light under the roof: the mask (tunnelMask) read by
// every lit material (nightlights.js TN) – the sky's light mostly shut out, the sun's kept off, the lamps' added.
//
// Sources (research notes: v039/research/monaco_tunnel.md, 2026-10-18):
//  – line, ends, length: OpenStreetMap ways 4230891 + 1230247123 (Boulevard Louis II, tunnel=yes, layer −1; data
//    2026-10-18): entry 43.740362, 7.430326 (under the hotel's northern corner), exit 43.737778, 7.427973, ≈ 362 m of
//    road under a roof, one steady right-hander (R ≈ 300–345 m, computed). H. The 18 m passage after Portier: raceway
//    way 1470365907 (tunnel=yes) 43.741073, 7.430032 → 43.741087, 7.430253. H.
//  – section (Wikimedia Commons photos, CC0/CC BY-SA: "Dans le tunnel Louis II" 2021-06-02, "Circuit de Monaco – Tunnel"
//    54783464831 / 54776961819 / 54777078500 / 54783705933, 2022-05-23 – GP set-up week): flat bare concrete slab, cream
//    tiled walls in large panels with dark joints, triple armco at the wall bases; on the sea side (the driver's left, the
//    outside of the curve) an open row of square pillars with daylight between them for about the first third, the
//    public pavement behind concrete blocks with a debris fence, then a solid tiled wall; on the hill side a tiled wall
//    with a narrow service walkway, concrete blocks with a tall catch fence and TV camera posts through the middle;
//    floodlights in a row along the top of both walls, alternating warm and cool white. M.
//  – clear height ≈ 4.2–4.6 m and carriageway ≈ 8.5–10 m: scaled from the photos (no posted limit – OSM maxheight
//    =default); slab ≈ 1–1.5 m; pillar pitch ≈ 6–8 m, 0.8–1.0 m square: estimates, L. The tunnel lighting was changed in
//    2016 "to reduce the 'black hole' effect upon entry and the glare … when exiting" (FIA/ACM media kit 2026 p. 26). H.
//  – over it: the Fairmont Monte Carlo (opened 1975 as Loews; 7 hotel floors over the podium that roofs the tunnel –
//    Wikipedia, venue listings: M; the map says 3 levels, which undercounts), over the first ≈ 200 m; then a landscaped
//    slab (Jardin d'acclimatation, Promenade des Champions – OSM) and the block over the exit portal. Storey ≈ 3.1 m: L.
import * as THREE from "./vendor/three.module.js";
import { TN } from "./nightlights.js";

// Per venue (venues.js key), in race order. Offsets are metres beyond the drawn road's edge on that side.
export const TUNNELS = {
  22: [
    { id: "louis-ii", name: "Tunnel Louis II", entry: [43.740362, 7.430326], exit: [43.737778, 7.427973], len: 362, sea: "left",
      height: 4.4, slab: 1.3, wall: 0.6,
      inland: { walk: 0.9 },                                  // service walkway + armco along the hill-side wall
      seaWall: 0.9,                                           // the solid sea-side wall's face beyond the road edge
      colonnade: { from: 0, to: 125, walk: 2.4, pitch: 7, size: 0.9, beam: 0.6 },   // open pillars, pavement behind blocks
      fence: { from: 115, to: 255, h: 3.6, cams: [150, 205, 245] },                  // blocks + catch fence + TV posts (hill side)
      lamps: { pitch: 3.5 },
      // the hotel's two map outlines (Overture splits it on a tile edge): a point inside each – 7 floors (Wikipedia) over
      // the podium, beige precast facade (photos)
      above: [{ at: [43.73985, 7.43005], storeys: 7, storey: 3.1, cls: "hotel", colour: "#d9ccb4", facade: "balcony", est: "7 floors (Wikipedia), 3.1 m storey (L)" },
        { at: [43.73885, 7.42950], storeys: 7, storey: 3.1, cls: "hotel", colour: "#d9ccb4", facade: "balcony", est: "7 floors (Wikipedia), 3.1 m storey (L)" }],
      exitBeam: 0.35 },                                       // the exit portal's deep beam (Commons 54783705933)
    { id: "portier", name: "Portier passage", entry: [43.741073, 7.430032], exit: [43.741087, 7.430253], len: 18, sea: "left",
      height: 4.6, slab: 1.0, wall: 0.6, inland: { walk: 0.6 }, seaWall: 0.8, lamps: { pitch: 4 } },
  ],
};
export const tunnelsFor = (venueKey) => TUNNELS[venueKey] || [];

// ---------- pure geometry (tested in node) ----------
// The lap's samples ({ p: {x,y,z}, tan, nor (right of travel), L, R (edges along nor: L > 0 right, R < 0 left) }) from
// the one nearest `a` forward to the one nearest `b` (both [x, z]). null when the two are more than half a lap apart
// going forward (the wrong way round), or the stretch is far off the length the spec gives (a bad fit).
export function lapStretch(samples, a, b, len = null) {
  const n = samples.length; if (n < 3) return null;
  const near = ([x, z]) => { let bi = -1, bd = Infinity; for (let i = 0; i < n; i++) { const d = (samples[i].p.x - x) ** 2 + (samples[i].p.z - z) ** 2; if (d < bd) { bd = d; bi = i; } } return [bi, Math.sqrt(bd)]; };
  const [i0, d0] = near(a), [i1, d1] = near(b);
  if (d0 > 25 || d1 > 25 || i0 === i1) return null;
  const idx = [i0]; let L = 0, lap = 0;
  for (let i = 0; i < n; i++) { const p = samples[i].p, q = samples[(i + 1) % n].p; lap += Math.hypot(q.x - p.x, q.z - p.z); }
  for (let i = i0; i !== i1; i = (i + 1) % n) { const p = samples[i].p, q = samples[(i + 1) % n].p; L += Math.hypot(q.x - p.x, q.z - p.z); idx.push((i + 1) % n); }
  if (L > lap / 2) return null;
  if (len && Math.abs(L - len) > Math.max(12, len * 0.35)) return null;
  return { i0, i1, idx, len: L, off: [d0, d1] };
}

const movingMax = (a, k) => a.map((_, i) => { let m = -Infinity; for (let j = Math.max(0, i - k); j <= Math.min(a.length - 1, i + k); j++) m = Math.max(m, a[j]); return m; });
const movingAvg = (a, k) => a.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - k); j <= Math.min(a.length - 1, i + k); j++) { s += a[j]; c++; } return s / c; });
const ease = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

// Stations along a covered stretch: per lap sample, its distance from the entry (s), the road there (x, floor y, z), the
// travel direction (tx, tz) and the side vector towards the sea (ox, oz), the road edge on each side (sea, hill – metres
// from the line, positive towards that side; the drawn edges, smoothed – never inside them), the inner faces of the
// two sides (seaIn: the pillar line on the colonnade, else the wall; hillIn), the outer faces, the ceiling's underside
// and the slab's top, and how open the sea side is there (0 solid … 1 the colonnade).
export function tunnelStations(samples, stretch, spec, lift = 0.06) {
  if (!stretch) return null;
  const sea = spec.sea === "right" ? 1 : -1;      // the sea side along the samples' nor (right of travel)
  const edge = (s, side) => (side > 0 ? s.L ?? 7 : -(s.R ?? -7));   // metres from the line to that side's edge
  const S = stretch.idx.map((i) => samples[i]);
  const seaE = movingAvg(movingMax(S.map((s) => edge(s, sea)), 8), 8), hillE = movingAvg(movingMax(S.map((s) => edge(s, -sea)), 8), 8);
  const col = spec.colonnade, wall = spec.wall ?? 0.6, walk = spec.inland?.walk ?? 0.8;
  let dist = 0;
  return S.map((s, k) => {
    if (k) dist += Math.hypot(s.p.x - S[k - 1].p.x, s.p.z - S[k - 1].p.z);
    const open = col ? ease((dist - col.from + 3) / 6) * ease((col.to - dist + 3) / 6) : 0;
    const colon = col && dist >= col.from && dist < col.to;
    const seaIn = seaE[k] + (colon ? col.walk + 0.3 : spec.seaWall ?? 0.9), hillIn = hillE[k] + walk;
    const floor = s.p.y + lift, ceil = floor + spec.height;
    return { k, i: s.i ?? stretch.idx[k], s: dist, x: s.p.x, y: floor, z: s.p.z, tx: s.tan.x, tz: s.tan.z, ox: s.nor.x * sea, oz: s.nor.z * sea,
      sea: seaE[k], hill: hillE[k], seaIn, hillIn, seaOut: seaIn + (colon ? 1.2 : wall), hillOut: hillIn + wall, colon: !!colon, open, ceil, top: ceil + spec.slab };
  });
}

// A point at `o` metres towards the sea (negative: towards the hill) from a station, at height y → [x, y, z].
export const at = (st, o, y) => [st.x + st.ox * o, y, st.z + st.oz * o];

// The roofed footprint (outer faces of both sides, entry to exit) as a closed outline [[x, z]…].
export function tunnelFootprint(stations, pad = 0) {
  const a = stations.map((st) => { const p = at(st, st.seaOut + pad, 0); return [p[0], p[2]]; });
  const b = stations.map((st) => { const p = at(st, -(st.hillOut + pad), 0); return [p[0], p[2]]; }).reverse();
  return a.concat(b);
}

// Where (x, z) is relative to a covered stretch: the nearest station, metres along from the entry (s, may be < 0 or
// > len beyond the mouths) and towards the sea (o) – or null when further than 40 m from it. A grid of 10 m cells.
export function stationLocator(stations) {
  const cells = new Map(), C = 10, key = (i, j) => i * 100003 + j;
  for (const st of stations) { const k = key(Math.floor(st.x / C), Math.floor(st.z / C)); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(st); }
  const len = stations[stations.length - 1].s;
  return (x, z) => {
    let best = null, bd = Infinity;
    const i0 = Math.floor(x / C), j0 = Math.floor(z / C);
    for (let i = i0 - 4; i <= i0 + 4; i++) for (let j = j0 - 4; j <= j0 + 4; j++) for (const st of cells.get(key(i, j)) || []) { const d = (st.x - x) ** 2 + (st.z - z) ** 2; if (d < bd) { bd = d; best = st; } }
    if (!best || bd > 1600) return null;
    const dx = x - best.x, dz = z - best.z, a = dx * best.tx + dz * best.tz;
    // (inside the stretch the along-offset from the nearest station is under a step; beyond a mouth it's the distance out)
    const s = best.k === 0 && a < 0 ? a : best.k === stations.length - 1 && a > 0 ? len + a : best.s;
    return { st: best, s, o: dx * best.ox + dz * best.oz, len };
  };
}

// Point in polygon ([[x, z]…], closed or not).
export function inPoly(x, z, pts) { let r = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r; } return r; }
const polyArea = (pts) => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return Math.abs(a / 2); };
const bbox = (pts) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { x0, z0, x1, z1 }; };

// The map's building outlines that sit over a roofed footprint: the area they share with it (sampled on a 1 m grid)
// at least `minArea` m² and `minShare` of the building – a building beside the tunnel that only touches its wall line
// isn't one. list: [{ pts: [[x, z]…], ref }] → [{ ref, overlap (m²), share, area }].
export function buildingsOver(list, foot, { minArea = 40, minShare = 0.05, step = 1 } = {}) {
  const F = bbox(foot), out = [];
  for (const b of list) {
    if (!b?.pts || b.pts.length < 3) continue;
    const B = bbox(b.pts);
    const x0 = Math.max(F.x0, B.x0), x1 = Math.min(F.x1, B.x1), z0 = Math.max(F.z0, B.z0), z1 = Math.min(F.z1, B.z1);
    if (x1 <= x0 || z1 <= z0) continue;
    let n = 0;
    for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) if (inPoly(x, z, b.pts) && inPoly(x, z, foot)) n++;
    const overlap = n * step * step, area = polyArea(b.pts);
    if (overlap >= minArea && overlap >= minShare * area) out.push({ ref: b.ref, overlap, share: overlap / Math.max(1, area), area });
  }
  return out;
}

// The light mask over a covered stretch (see nightlights.js TN): a grid of `mpp` m cells over the footprint plus a
// margin → { data: Float32Array RGBA, W, H, ext: { x0, z0, w, d } }. r: how covered (1 under the roof between the inner
// faces, eased over the first `spill` m in from each mouth – daylight reaches in –, 0 outside and beyond the outer
// faces); g: the ceiling's height; b: daylight through the open side (the colonnade: most by the pillars); a: the lamps'
// light (rows on both walls: more near them).
export function tunnelMask(stations, { mpp = 0.5, spill = 9, margin = 6 } = {}) {
  const foot = tunnelFootprint(stations, margin), F = bbox(foot);
  const W = Math.ceil((F.x1 - F.x0) / mpp), H = Math.ceil((F.z1 - F.z0) / mpp);
  const data = new Float32Array(W * H * 4), loc = stationLocator(stations);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = F.x0 + (i + 0.5) * mpp, z = F.z0 + (j + 0.5) * mpp, q = loc(x, z), o4 = (j * W + i) * 4;
    if (!q) { data[o4 + 1] = -1e4; continue; }
    const st = q.st, inner = q.o < st.seaIn + 0.15 && q.o > -(st.hillIn + 0.15), wallPart = q.o < st.seaOut && q.o > -st.hillOut;
    const along = ease((q.s + 1) / spill) * ease((q.len - q.s + 1) / spill);
    const cover = inner ? along : wallPart ? along * 0.6 : 0;
    data[o4] = cover; data[o4 + 1] = st.ceil;
    // daylight through the colonnade: most by the pillar line, some across the road
    data[o4 + 2] = cover > 0 ? st.open * (0.12 + 0.28 * ease((q.o + st.hill) / (st.seaIn + st.hill))) : 0;
    const dWall = Math.min(Math.abs(st.seaIn - q.o), Math.abs(st.hillIn + q.o));
    data[o4 + 3] = cover > 0 ? 0.7 + 0.55 * Math.exp(-dWall / 2.2) : 0;
  }
  return { data, W, H, ext: { x0: F.x0, z0: F.z0, w: W * mpp, d: H * mpp }, foot };
}

// ---------- the meshes ----------
// A bin of flat faces: positions, normals, colours, uvs (metres) – one mesh each at the end.
function bin() { return { pos: [], nor: [], col: [], uv: [] }; }
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();
// one flat face (fan) of [x, y, z] corners; out: the side it faces ([x, y, z]); uvs per corner (or none); colour
function face(B, vs, out, colour, uvs = null) {
  _e1.set(vs[1][0] - vs[0][0], vs[1][1] - vs[0][1], vs[1][2] - vs[0][2]);
  _e2.set(vs[2][0] - vs[0][0], vs[2][1] - vs[0][1], vs[2][2] - vs[0][2]);
  _n.crossVectors(_e1, _e2); if (_n.lengthSq() < 1e-10) return; _n.normalize();
  let order = vs.map((_, i) => i);
  if (out && _n.x * out[0] + _n.y * out[1] + _n.z * out[2] < 0) { order = order.reverse(); _n.negate(); }
  _c.set(colour);
  for (let i = 1; i < order.length - 1; i++) for (const k of [order[0], order[i], order[i + 1]]) {
    B.pos.push(...vs[k]); B.nor.push(_n.x, _n.y, _n.z); B.col.push(_c.r, _c.g, _c.b); B.uv.push(...(uvs ? uvs[k] : [0, 0]));
  }
}
// a box standing at (x, y0, z): `a` along the unit (ux, uz), `b` across, `h` high (no bottom)
function box(B, x, y0, z, ux, uz, a, b, h, colour) {
  const vx = -uz, vz = ux, c = (sa, sb, y) => [x + ux * sa * a / 2 + vx * sb * b / 2, y, z + uz * sa * a / 2 + vz * sb * b / 2];
  const y1 = y0 + h;
  face(B, [c(-1, -1, y1), c(1, -1, y1), c(1, 1, y1), c(-1, 1, y1)], [0, 1, 0], colour);
  for (const [s0, t0, s1, t1, o] of [[-1, -1, 1, -1, [-vx, 0, -vz]], [1, 1, -1, 1, [vx, 0, vz]], [1, -1, 1, 1, [ux, 0, uz]], [-1, 1, -1, -1, [-ux, 0, -uz]]]) face(B, [c(s0, t0, y0), c(s1, t1, y0), c(s1, t1, y1), c(s0, t0, y1)], o, colour);
}
// a strip along stations k0..k1: between (o1, y1) and (o2, y2) at each (functions of the station, or numbers), facing
// `side` ("sea" / "hill" / "up" / "down"); tiles: uvs in metres (along, up)
function strip(B, ST, k0, k1, o1, y1, o2, y2, side, colour, tiles = false) {
  const f = (v, st) => (typeof v === "function" ? v(st) : v);
  for (let k = k0; k < k1; k++) {
    const a = ST[k], b = ST[k + 1];
    if (a.ox * b.ox + a.oz * b.oz < 0.5) continue;
    const oA = [a.ox, 0, a.oz], out = side === "up" ? [0, 1, 0] : side === "down" ? [0, -1, 0] : side === "sea" ? oA : [-oA[0], 0, -oA[2]];
    const p = [at(a, f(o1, a), f(y1, a)), at(b, f(o1, b), f(y1, b)), at(b, f(o2, b), f(y2, b)), at(a, f(o2, a), f(y2, a))];
    const c = typeof colour === "function" ? colour(a) : colour;
    face(B, p, out, c, tiles ? [[a.s, f(y1, a) - a.y], [b.s, f(y1, b) - b.y], [b.s, f(y2, b) - b.y], [a.s, f(y2, a) - a.y]] : null);
  }
}
// stations at distance s (interpolated)
function stationAt(ST, s) {
  let k = 0; while (k < ST.length - 2 && ST[k + 1].s < s) k++;
  const a = ST[k], b = ST[k + 1], t = Math.max(0, Math.min(1, (s - a.s) / Math.max(1e-6, b.s - a.s))), m = (u, v) => u + (v - u) * t;
  return { ...a, s, x: m(a.x, b.x), y: m(a.y, b.y), z: m(a.z, b.z), tx: m(a.tx, b.tx), tz: m(a.tz, b.tz), ox: m(a.ox, b.ox), oz: m(a.oz, b.oz),
    sea: m(a.sea, b.sea), hill: m(a.hill, b.hill), seaIn: m(a.seaIn, b.seaIn), hillIn: m(a.hillIn, b.hillIn), seaOut: m(a.seaOut, b.seaOut), hillOut: m(a.hillOut, b.hillOut), ceil: m(a.ceil, b.ceil), top: m(a.top, b.top) };
}

// Colours (sRGB): bare cast concrete (photos: grey-beige soffit), cream wall tiles, pale pavement, galvanised armco,
// concrete blocks, the hill-side stone (the rubble-stone wall by the exit portal, Commons 54783705933), garden, beam
// banner (plain – no sponsor marks)
const COL = { slab: "#a9a49a", soffit: "#a8a39a", concrete: "#b9b4aa", tile: "#ffffff", walk: "#c4bfb4", kerb: "#9d9a93", armco: "#c9ced2", post: "#6d7378",
  block: "#d7d4cc", stone: "#bfae8e", garden: "#6f8f4e", beam: "#2b2e33", cam: "#2a2d31", pile: "#cfc7b8", rail: "#7c8288" };

// The wall tiles: large cream panels with dark joints (photos), a 2 × 1.2 m repeat – drawn once, shared.
let TILE_TEX = null;
function tileTexture() {
  if (TILE_TEX) return TILE_TEX;
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 256;
  const g = cv.getContext("2d");
  g.fillStyle = "#e9dfc6"; g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},0.035)`; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
  // small tiles inside each panel (≈ 20 cm), the panels' wider dark joints
  g.strokeStyle = "rgba(90,80,64,0.25)"; g.lineWidth = 1;
  for (let x = 0; x <= 256; x += 25.6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  for (let y = 0; y <= 256; y += 42.7) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.fillStyle = "#4a443a"; g.fillRect(0, 0, 4, 256); g.fillRect(0, 0, 256, 3);
  TILE_TEX = new THREE.CanvasTexture(cv); TILE_TEX.colorSpace = THREE.SRGBColorSpace; TILE_TEX.wrapS = TILE_TEX.wrapT = THREE.RepeatWrapping;
  TILE_TEX.repeat.set(1 / 2, 1 / 1.2); TILE_TEX.anisotropy = 8; TILE_TEX.userData.shared = true;
  return TILE_TEX;
}

// One covered stretch's structure. ST: stations; raised: [{ bottom, pts }] (the buildings over it, raised – for the
// slab's edge up to them); groundAt(x, z). Bins filled: C concrete/stone (vertex colours), T tiles, M metal and blocks,
// F fence (see-through), L lamps (lit).
function buildStretch(spec, ST, bins, raised, groundAt, sides) {
  const { C, T, M, F, L } = bins, n = ST.length - 1, col = spec.colonnade;
  const so = (st) => st.seaOut, hi = (st) => -st.hillOut;
  // the top at each station: the slab, or the bottom of a building raised over it (no gap between them)
  for (const st of ST) {
    let top = st.top;
    for (const r of raised) for (const o of [0, st.seaOut, -st.hillOut]) { const p = at(st, o, 0); if (inPoly(p[0], p[2], r.pts)) top = Math.max(top, r.bottom); }
    st.topUp = top;
    st.garden = !raised.some((r) => [0, st.seaIn, -st.hillIn].some((o) => { const p = at(st, o, 0); return inPoly(p[0], p[2], r.pts); }));
  }
  // ceiling's underside (bare concrete), slab top (garden where nothing stands on it), outer faces
  strip(C, ST, 0, n, (st) => st.seaOut, (st) => st.ceil, hi, (st) => st.ceil, "down", COL.soffit);
  strip(C, ST, 0, n, so, (st) => st.topUp, hi, (st) => st.topUp, "up", (st) => (st.garden ? COL.garden : COL.slab));
  strip(C, ST, 0, n, hi, (st) => st.y - 0.6, hi, (st) => st.topUp, "hill", COL.stone);
  strip(C, ST, 0, n, so, (st) => (st.colon ? st.ceil : st.y - 0.6), so, (st) => st.topUp, "sea", COL.concrete);
  // the hill-side wall: tiles from the walkway up; the walkway and its kerb
  strip(T, ST, 0, n, (st) => -st.hillIn, (st) => st.y + 0.18, (st) => -st.hillIn, (st) => st.ceil, "sea", COL.tile, true);
  strip(C, ST, 0, n, (st) => -st.hill - 0.05, (st) => st.y + 0.18, (st) => -st.hillIn, (st) => st.y + 0.18, "up", COL.walk);
  strip(C, ST, 0, n, (st) => -st.hill - 0.05, (st) => st.y - 0.1, (st) => -st.hill - 0.05, (st) => st.y + 0.18, "sea", COL.kerb);
  // the sea side: the solid wall (tiles), or the colonnade – pavement, edge beam, pillars, blocks with a debris fence
  const runs = []; for (let k = 0; k < n; k++) { const c = ST[k].colon; if (!runs.length || runs[runs.length - 1].c !== c) runs.push({ c, k0: k, k1: k + 1 }); else runs[runs.length - 1].k1 = k + 1; }
  for (const r of runs) {
    if (!r.c) {
      strip(T, ST, r.k0, r.k1, (st) => st.seaIn, (st) => st.y - 0.05, (st) => st.seaIn, (st) => st.ceil, "hill", COL.tile, true);
      strip(C, ST, r.k0, r.k1, (st) => st.sea + 0.05, (st) => st.y - 0.05, (st) => st.seaIn, (st) => st.y - 0.04, "up", COL.kerb);
      continue;
    }
    strip(C, ST, r.k0, r.k1, (st) => st.sea + 0.05, (st) => st.y + 0.15, so, (st) => st.y + 0.15, "up", COL.walk);
    strip(C, ST, r.k0, r.k1, (st) => st.sea + 0.05, (st) => st.y - 0.1, (st) => st.sea + 0.05, (st) => st.y + 0.15, "hill", COL.kerb);
    // the edge beam over the pillars (both faces and its underside)
    const bIn = (st) => st.seaIn - 0.3, bOut = (st) => st.seaIn + 0.3, bY = (st) => st.ceil - col.beam;
    strip(C, ST, r.k0, r.k1, bIn, bY, bIn, (st) => st.ceil, "hill", COL.concrete);
    strip(C, ST, r.k0, r.k1, bOut, bY, bOut, (st) => st.ceil, "sea", COL.concrete);
    strip(C, ST, r.k0, r.k1, bIn, bY, bOut, bY, "down", COL.soffit);
    // concrete blocks along the road edge with a debris fence on them (GP set-up, photo 2021)
    strip(M, ST, r.k0, r.k1, (st) => st.sea + 0.35, (st) => st.y, (st) => st.sea + 0.35, (st) => st.y + 0.85, "hill", COL.block);
    strip(M, ST, r.k0, r.k1, (st) => st.sea + 0.35, (st) => st.y + 0.85, (st) => st.sea + 0.95, (st) => st.y + 0.85, "up", COL.block);
    strip(F, ST, r.k0, r.k1, (st) => st.sea + 0.65, (st) => st.y + 0.85, (st) => st.sea + 0.65, (st) => st.y + 2.2, "hill", "#9aa3ab");
    for (let s = Math.max(col.from, ST[r.k0].s) + col.pitch / 2; s < Math.min(col.to, ST[r.k1].s); s += col.pitch) {
      const st = stationAt(ST, s), p = at(st, st.seaIn, 0);
      box(C, p[0], st.y + 0.15, p[2], st.tx, st.tz, col.size, col.size, st.ceil - col.beam - st.y - 0.15 + 0.02, COL.concrete);
    }
    // the return wall where the colonnade meets the solid wall (and at the mouth if it starts there)
    for (const k of [r.k0, r.k1]) {
      if (k === 0 || k === n) continue;
      const st = ST[k], solid = ST[k === r.k0 ? k - 1 : k + 1] || st;
      face(T, [at(st, solid.seaIn, st.y), at(st, st.seaIn + 0.3, st.y), at(st, st.seaIn + 0.3, st.ceil), at(st, solid.seaIn, st.ceil)], k === r.k0 ? [st.tx, 0, st.tz] : [-st.tx, 0, -st.tz], COL.tile, [[0, 0], [st.seaIn - solid.seaIn, 0], [st.seaIn - solid.seaIn, spec.height], [0, spec.height]]);
    }
  }
  // armco: triple rail on posts at both road edges where there are no blocks
  const fence = spec.fence;
  const inFence = (st) => fence && st.s >= fence.from && st.s < fence.to;
  for (const side of [1, -1]) {
    const off = (st) => (side > 0 ? st.sea + 0.2 : -st.hill - 0.2);
    let k = 0;
    while (k < n) {
      const skip = (st) => (side > 0 ? st.colon : inFence(st));
      if (skip(ST[k])) { k++; continue; }
      let k1 = k; while (k1 < n && !skip(ST[k1])) k1++;
      for (const [y0, y1] of [[0.3, 0.5], [0.52, 0.72], [0.74, 0.94]]) strip(M, ST, k, k1, off, (st) => st.y + y0, off, (st) => st.y + y1, side > 0 ? "hill" : "sea", COL.armco);
      k = k1;
    }
  }
  // the hill side through the middle: blocks, a tall catch fence, TV camera posts on them
  if (fence) {
    const k0 = ST.findIndex((st) => st.s >= fence.from), k1 = Math.max(k0, ST.findIndex((st) => st.s >= fence.to) < 0 ? n : ST.findIndex((st) => st.s >= fence.to));
    if (k0 >= 0 && k1 > k0) {
      strip(M, ST, k0, k1, (st) => -st.hill - 0.35, (st) => st.y, (st) => -st.hill - 0.35, (st) => st.y + 0.85, "sea", COL.block);
      strip(M, ST, k0, k1, (st) => -st.hill - 0.35, (st) => st.y + 0.85, (st) => -st.hill - 0.95, (st) => st.y + 0.85, "up", COL.block);
      strip(F, ST, k0, k1, (st) => -st.hill - 0.65, (st) => st.y + 0.85, (st) => -st.hill - 0.65, (st) => Math.min(st.ceil - 0.5, st.y + fence.h), "sea", "#9aa3ab");
      for (let s = fence.from + 4; s < fence.to; s += 4) { const st = stationAt(ST, s), p = at(st, -st.hill - 0.65, 0); box(M, p[0], st.y + 0.85, p[2], st.tx, st.tz, 0.08, 0.08, Math.min(st.ceil - 0.5, st.y + fence.h) - st.y - 0.85, COL.post); }
      for (const s of fence.cams || []) {
        const st = stationAt(ST, s), p = at(st, -st.hill - 0.8, 0), q = at(st, -st.hill - 0.55, 0);
        box(M, p[0], st.y + 0.85, p[2], st.tx, st.tz, 0.12, 0.12, 2.3, COL.cam);
        box(M, q[0], st.y + 3.0, q[2], st.tx, st.tz, 0.6, 0.35, 0.4, COL.cam);
      }
    }
  }
  // the lamps: a row along the top of each side, every `pitch` m, alternating warm and cool white (photos), on a rail
  const pitch = spec.lamps?.pitch || 3.5;
  for (const side of [1, -1]) {
    const face0 = (st) => (side > 0 ? (st.colon ? st.seaIn - 0.3 : st.seaIn) : -st.hillIn);
    strip(M, ST, 0, n, (st) => face0(st) - side * 0.06, (st) => st.ceil - 0.62, (st) => face0(st) - side * 0.06, (st) => st.ceil - 0.55, side > 0 ? "hill" : "sea", COL.rail);
    let w = side > 0 ? 0 : 1;
    for (let s = pitch / 2; s < ST[n].s - 0.5; s += pitch, w++) {
      const st = stationAt(ST, s), y = st.colon && side > 0 ? st.ceil - 0.6 - 0.32 : st.ceil - 0.5, p = at(st, face0(st) - side * 0.2, 0);
      box(L, p[0], y, p[2], st.tx, st.tz, 0.42, 0.22, 0.24, w % 2 ? "#ffd9a0" : "#eef3ff");
    }
  }
  // the mouths: the face over each (the hotel's podium edge at the entry; the deep beam at the exit, a plain dark banner
  // panel on it); a parapet round the slab where it is a garden terrace
  for (const [k, outDir] of [[0, -1], [n, 1]]) {
    const st = ST[k], out = [st.tx * outDir, 0, st.tz * outDir];
    const low = k === n && spec.exitBeam ? spec.exitBeam : 0;
    face(C, [at(st, st.seaOut, st.ceil - low), at(st, -st.hillOut, st.ceil - low), at(st, -st.hillOut, st.topUp), at(st, st.seaOut, st.topUp)], out, COL.concrete);
    if (low) {
      // the beam's underside and inner face
      const back = 1.2, b = { ...st, x: st.x - st.tx * outDir * back, z: st.z - st.tz * outDir * back };
      face(C, [at(st, st.seaOut, st.ceil - low), at(st, -st.hillOut, st.ceil - low), at(b, -st.hillOut, st.ceil - low), at(b, st.seaOut, st.ceil - low)], [0, -1, 0], COL.soffit);
      face(C, [at(b, st.seaOut, st.ceil - low), at(b, -st.hillOut, st.ceil - low), at(b, -st.hillOut, st.ceil), at(b, st.seaOut, st.ceil)], [-out[0], 0, -out[2]], COL.concrete);
      const f = { ...st, x: st.x + st.tx * outDir * 0.08, z: st.z + st.tz * outDir * 0.08 }, w0 = -st.hill * 0.75, w1 = st.sea * 0.75;
      face(M, [at(f, w1, st.ceil + 0.15), at(f, w0, st.ceil + 0.15), at(f, w0, Math.min(st.topUp - 0.1, st.ceil + 1.25)), at(f, w1, Math.min(st.topUp - 0.1, st.ceil + 1.25))], out, COL.beam);
    }
    if (st.garden) {
      const g = { ...st, x: st.x - st.tx * outDir * 0.15, z: st.z - st.tz * outDir * 0.15 };
      face(C, [at(g, st.seaOut, st.topUp), at(g, -st.hillOut, st.topUp), at(g, -st.hillOut, st.topUp + 1.0), at(g, st.seaOut, st.topUp + 1.0)], out, COL.concrete);
    }
  }
  // parapets along the garden terrace's long edges
  const gk = []; for (let k = 0; k < n; k++) if (ST[k].garden && ST[k + 1].garden) gk.push(k);
  for (let a = 0; a < gk.length;) { let b = a; while (b + 1 < gk.length && gk[b + 1] === gk[b] + 1) b++; const k0 = gk[a], k1 = gk[b] + 1;
    strip(C, ST, k0, k1, (st) => st.seaOut - 0.15, (st) => st.topUp, (st) => st.seaOut - 0.15, (st) => st.topUp + 1.0, "sea", COL.concrete);
    strip(C, ST, k0, k1, (st) => -st.hillOut + 0.15, (st) => st.topUp, (st) => -st.hillOut + 0.15, (st) => st.topUp + 1.0, "hill", COL.concrete);
    a = b + 1; }
  // what holds up the raised buildings beyond the tunnel: the hotel's piles on the sea side (it stands out over the
  // shore – research §1/§3: "on piles", the 2011 photo's round columns), its podium walls on the hill side
  for (const r of raised) {
    const B = bbox(r.pts), pitchP = 8;
    for (let x = B.x0 + pitchP / 2; x < B.x1; x += pitchP) for (let z = B.z0 + pitchP / 2; z < B.z1; z += pitchP) {
      if (!inPoly(x, z, r.pts)) continue;
      const q = sides(x, z); if (!q || q.inside || q.o < 0) continue;     // (sea side only, outside the structure)
      const g = groundAt(x, z); if (!(r.bottom - g > 2)) continue;
      box(C, x, g - 0.5, z, 1, 0, 1.1, 1.1, r.bottom - g + 0.5, COL.pile);
    }
    // (each outline edge in pieces of ≤ 2 m: a piece in the tunnel or on its sea side isn't walled – an edge crossing the
    // tunnel stood across the road)
    const area2 = r.pts.reduce((a, p, i) => { const q = r.pts[(i + 1) % r.pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
    for (let i = 0; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[(i + 1) % r.pts.length], len = Math.hypot(bx - ax, bz - az); if (len < 0.5) continue;
      // facing out of the outline (by its winding)
      const sgn = area2 > 0 ? 1 : -1, nx = (sgn * (bz - az)) / len, nz = (-sgn * (bx - ax)) / len;
      const m = Math.ceil(len / 2);
      for (let k = 0; k < m; k++) {
        const x0 = ax + ((bx - ax) * k) / m, z0 = az + ((bz - az) * k) / m, x1 = ax + ((bx - ax) * (k + 1)) / m, z1 = az + ((bz - az) * (k + 1)) / m;
        const q = sides((x0 + x1) / 2, (z0 + z1) / 2); if (q && (q.inside || q.o >= 0)) continue;   // (hill side, or away from the tunnel)
        const g0 = groundAt(x0, z0), g1 = groundAt(x1, z1);
        if (!(r.bottom - Math.min(g0, g1) > 0.3)) continue;
        face(C, [[x0, Math.min(g0, r.bottom) - 0.5, z0], [x1, Math.min(g1, r.bottom) - 0.5, z1], [x1, r.bottom + 0.05, z1], [x0, r.bottom + 0.05, z0]], [nx, 0, nz], COL.stone);
      }
    }
  }
}

function meshOf(B, mat, name, opts = {}) {
  if (!B.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(B.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(B.nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(B.col, 3));
  if (opts.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(B.uv, 2));
  g.computeBoundingSphere(); g.computeBoundingBox();
  const m = new THREE.Mesh(g, mat); m.name = name;
  m.castShadow = opts.cast !== false; m.receiveShadow = opts.receive !== false;
  return m;
}

// ---------- the whole thing ----------
// Plans the covered stretches of a venue before the buildings are drawn: where each runs (stations), its footprint, and
// which map buildings stand over it (raised – buildings.js draws them from the slab's top up). ctx: { venueKey, samples,
// geo (fromLL, xz), buildings (scene.buildings), lift }. Returns null (no tunnel here, or it can't be placed) or
// { list: [{ spec, stations, foot, raised }], raise: Map(building record → { y0, y1, storeys, cls, colour }), inside(x, z) }.
export function planTunnels(ctx) {
  const specs = tunnelsFor(ctx.venueKey); if (!specs.length || !ctx.samples?.length) return null;
  const list = [], raise = new Map(), info = [];
  const outlines = (ctx.buildings || []).filter((b) => b.kind !== "grandstand" && b.pts?.length > 2).map((b) => ({ ref: b, pts: b.pts.map(ctx.geo.xz) }));
  for (const spec of specs) {
    const st = lapStretch(ctx.samples, ctx.geo.fromLL(...spec.entry), ctx.geo.fromLL(...spec.exit), spec.len);
    if (!st) { info.push({ id: spec.id, placed: false }); continue; }
    const stations = tunnelStations(ctx.samples, st, spec, ctx.lift ?? 0.06);
    const foot = tunnelFootprint(stations), over = buildingsOver(outlines, foot);
    const raised = [];
    for (const o of over) {
      const pts = outlines.find((x) => x.ref === o.ref).pts;
      // the slab's top under it (the highest: the road falls along the tunnel; the slab's edge rises to meet it lower down)
      let bottom = -Infinity;
      for (const s of stations) for (const off of [0, s.seaOut, -s.hillOut]) { const p = at(s, off, 0); if (inPoly(p[0], p[2], pts)) bottom = Math.max(bottom, s.top); }
      if (!Number.isFinite(bottom)) bottom = Math.max(...stations.map((s) => s.top));
      const hint = (spec.above || []).find((a) => { const [x, z] = ctx.geo.fromLL(...a.at); return inPoly(x, z, pts); });
      const storeys = hint?.storeys ?? o.ref.lv ?? null;
      const height = hint ? hint.storeys * hint.storey : Math.max(3, (o.ref.h || 6) - (o.ref.min || 0));
      raise.set(o.ref, { y0: bottom, y1: bottom + height, storeys, cls: hint?.cls || null, colour: hint?.colour || null, facade: hint?.facade || null, est: hint?.est || "map height, over the slab" });
      raised.push({ ref: o.ref, pts, bottom, overlap: Math.round(o.overlap), share: +o.share.toFixed(2), hint: !!hint });
    }
    list.push({ spec, stations, foot, raised, loc: stationLocator(stations) });
    info.push({ id: spec.id, placed: true, len: +st.len.toFixed(1), off: st.off.map((v) => +v.toFixed(1)), from: st.i0, to: st.i1,
      raised: raised.map((r) => ({ name: r.ref.name || null, kind: r.ref.kind || null, h: r.ref.h, area: Math.round(polyArea(r.pts)), overlap: r.overlap, share: r.share, bottom: +r.bottom.toFixed(1), hint: r.hint })) });
  }
  if (!list.length) return { list, raise, inside: () => false, info };
  // within the structure (outer faces, mouths) – plus `pad` m round it
  const where = (x, z) => { for (const t of list) { const q = t.loc(x, z); if (q && q.s > -0.5 && q.s < q.len + 0.5) return { t, q }; } return null; };
  const inside = (x, z, pad = 1) => { for (const t of list) { const q = t.loc(x, z); if (q && q.s > -pad && q.s < q.len + pad && q.o < q.st.seaOut + pad && q.o > -q.st.hillOut - pad) return true; } return false; };
  return { list, raise, inside, where, info };
}

// The meshes of the planned stretches and their light mask. groundAt(x, z): the terrain's height. Returns
// { group, occluders, mask: { tex, ext } | null } – the group owns its geometries, materials and the mask texture
// (disposeGroup; onDispose lets go of the shared uniforms if they still show this mask).
export function buildTunnels(plan, groundAt) {
  if (!plan?.list.length) return null;
  const bins = { C: bin(), T: bin(), M: bin(), F: bin(), L: bin() };
  for (const t of plan.list) {
    // (where a point is: in the structure, or over the road beyond a mouth – nothing stands there – or to which side)
    const sides = (x, z) => {
      const q = t.loc(x, z); if (!q) return null;
      const road = q.o < q.st.sea + 1 && q.o > -q.st.hill - 1, inS = q.s > -1 && q.s < q.len + 1;
      if (!inS && !road) return null;
      return { o: q.o, inside: road || (q.o < q.st.seaOut + 0.5 && q.o > -q.st.hillOut - 0.5) };
    };
    buildStretch(t.spec, t.stations, bins, t.raised, groundAt, sides);
  }
  const group = new THREE.Group(); group.name = "tunnels";
  // (both sides drawn: the camera can be on either side of a wall, and los.js then counts both faces)
  const concrete = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  const tiles = new THREE.MeshStandardMaterial({ vertexColors: true, map: tileTexture(), roughness: 0.45, metalness: 0, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide });
  const fence = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.5, metalness: 0.5, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  // (the lamps' lenses: lit by themselves, not over-bright – the tone mapping keeps them below white; their light on the
  // surfaces is the mask's)
  const lamps = new THREE.MeshBasicMaterial({ vertexColors: true });
  const C = meshOf(bins.C, concrete, "tunnelConcrete"), T = meshOf(bins.T, tiles, "tunnelTiles", { uv: true }), M = meshOf(bins.M, metal, "tunnelMetal"),
    F = meshOf(bins.F, fence, "tunnelFence", { cast: false }), L = meshOf(bins.L, lamps, "tunnelLamps", { cast: false, receive: false });
  for (const m of [C, T, M, F, L]) if (m) group.add(m);
  // the mask over every stretch (one texture: the union of their boxes)
  let mask = null;
  const parts = plan.list.map((t) => tunnelMask(t.stations));
  if (parts.length) {
    const mpp = 0.5, x0 = Math.min(...parts.map((p) => p.ext.x0)), z0 = Math.min(...parts.map((p) => p.ext.z0));
    const x1 = Math.max(...parts.map((p) => p.ext.x0 + p.ext.w)), z1 = Math.max(...parts.map((p) => p.ext.z0 + p.ext.d));
    const W = Math.ceil((x1 - x0) / mpp), H = Math.ceil((z1 - z0) / mpp);
    const half = new Uint16Array(W * H * 4), toH = THREE.DataUtils.toHalfFloat;
    const g0 = toH(-1e4); for (let i = 0; i < W * H; i++) half[i * 4 + 1] = g0;
    for (const p of parts) {
      const di = Math.round((p.ext.x0 - x0) / mpp), dj = Math.round((p.ext.z0 - z0) / mpp);
      for (let j = 0; j < p.H; j++) for (let i = 0; i < p.W; i++) {
        const s = (j * p.W + i) * 4, d = ((j + dj) * W + i + di) * 4; if (i + di >= W || j + dj >= H) continue;
        if (p.data[s] <= 0 && half[d] !== 0) continue;   // (where two overlap, the covered one wins)
        if (p.data[s] <= 0 && p.data[s + 1] < -1e3) continue;
        for (let c = 0; c < 4; c++) half[d + c] = toH(p.data[s + c]);
      }
    }
    const tex = new THREE.DataTexture(half, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    mask = { tex, ext: new THREE.Vector4(x0, z0, W * mpp, H * mpp) };
    // (the mask is the group's: freed with it, and the shared uniforms pointed back at the blank one if they still show it)
    group.userData.onDispose = () => { if (TN.tex.value === tex) { TN.tex.value = TN.blank; TN.on.value = 0; } tex.dispose(); };
  }
  const occluders = [C, T, M].filter(Boolean);   // (the blocks, armco and camera posts too: the chase camera keeps off them)
  return { group, occluders, mask, stations: plan.list.map((t) => t.stations), info: plan.info };
}

// The shared uniforms pointed at this world's tunnel (or off): called with the lighting. Night: the lamps a little
// lower (the tunnel is lit day and night – OSM lit=24/7 –; by night the eye needs less, and the outside is dark).
export function tunnelLight(tun, night) {
  if (!tun?.mask) { TN.on.value = 0; TN.tex.value = TN.blank; return; }
  TN.tex.value = tun.mask.tex; TN.ext.value.copy(tun.mask.ext); TN.on.value = 1;
  // (linear irradiance; the warm/cool mix of the fittings – a slightly warm white)
  const k = night ? 1.0 : 1.7;
  TN.lamp.value.set(1.0 * k, 0.9 * k, 0.76 * k);
  TN.amb.value = night ? 0.3 : 0.1;
}
