// Where the sea is, as a raster over the 3D extent (scene x, z).
// OpenStreetMap draws coastlines as ways with the land on their left. The side of a point is read off the
// nearest coastline: off a segment's middle it's that segment's side; at a corner shared by two segments it's
// the side of their averaged ("pseudo") normal – picking just one of the two segments puts whole wedges behind
// every corner on the wrong side. Mapped land (buildings, roads, land use, the track) always stays land, the
// raster is smoothed, and isolated specks are cleared.
const CELL = 6;

// Joins coastline ways into chains (end of one = start of the next) and returns segments with neighbours.
function coastSegments(lines) {
  const key = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const segs = [];
  const startAt = new Map(), endAt = new Map();
  for (const pts of lines) {
    const first = segs.length;
    for (let i = 1; i < pts.length; i++) segs.push({ a: pts[i - 1], b: pts[i], prev: null, next: null });
    for (let i = first; i < segs.length; i++) { if (i > first) segs[i].prev = segs[i - 1]; if (i < segs.length - 1) segs[i].next = segs[i + 1]; }
    if (segs.length > first) { startAt.set(key(pts[0]), segs[first]); endAt.set(key(pts[pts.length - 1]), segs[segs.length - 1]); }
  }
  // link chain ends to chain starts (closed ways link to themselves)
  for (const [k, last] of endAt) { const nxt = startAt.get(k); if (nxt && !last.next) { last.next = nxt; nxt.prev = last; } }
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz) || 1;
    // "left of the way on the map" in scene coordinates (z points south): normal (dz, -dx)/L points to the land
    s.nl = [dz / L, -dx / L];
  }
  return segs;
}

// Signed side of point p for its nearest segment s at parameter t: > 0 land, < 0 sea.
function side(s, t, x, z) {
  let n = s.nl, o = s.a;
  if (t <= 0 && s.prev) { n = [s.nl[0] + s.prev.nl[0], s.nl[1] + s.prev.nl[1]]; o = s.a; }
  else if (t >= 1 && s.next) { n = [s.nl[0] + s.next.nl[0], s.nl[1] + s.next.nl[1]]; o = s.b; }
  else if (t > 0 && t < 1) o = [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
  return (x - o[0]) * n[0] + (z - o[1]) * n[1];
}

// coast: polylines (scene x, z); ext: { x0, z0, x1, z1 }; land(mask, W, H, toPx): paints mapped land into a
// Uint8Array mask (1 = land). Returns { at(x, z) → true for sea, share } or null without a coastline.
export function seaRaster(coast, ext, paintLand) {
  if (!coast.length) return null;
  const segs = coastSegments(coast);
  if (!segs.length) return null;
  const W = Math.ceil((ext.x1 - ext.x0) / CELL), H = Math.ceil((ext.z1 - ext.z0) / CELL);
  // buckets of segments, 120 m
  const B = 120, buckets = new Map();
  for (const s of segs) {
    const n = Math.ceil(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) / (B / 2)) + 1;
    for (let k = 0; k <= n; k++) {
      const x = s.a[0] + ((s.b[0] - s.a[0]) * k) / n, z = s.a[1] + ((s.b[1] - s.a[1]) * k) / n;
      const key = `${Math.floor(x / B)},${Math.floor(z / B)}`;
      let arr = buckets.get(key); if (!arr) buckets.set(key, (arr = []));
      if (arr[arr.length - 1] !== s) arr.push(s);
    }
  }
  const nearest = (x, z, maxRings) => {
    const cx = Math.floor(x / B), cz = Math.floor(z / B);
    let best = null, bt = 0, bd = Infinity;
    for (let r = 0; r <= maxRings; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        for (const s of buckets.get(`${cx + i},${cz + j}`) || []) {
          const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / L));
          const d = Math.hypot(s.a[0] + dx * t - x, s.a[1] + dz * t - z);
          // equal distances (a shared corner): keep the first, the pseudo normal covers both
          if (d < bd - 1e-6) { bd = d; best = s; bt = t; }
        }
      }
      if (best && bd < r * B) break;
    }
    return best ? [best, bt, bd] : null;
  };
  // coarse pass (every 8th cell), then full resolution only near the coast
  const raw = new Uint8Array(W * H);   // 1 = sea
  const C = 8, cw = Math.ceil(W / C) + 1, chh = Math.ceil(H / C) + 1;
  const coarse = new Int8Array(cw * chh), cdist = new Float32Array(cw * chh);
  for (let j = 0; j < chh; j++) for (let i = 0; i < cw; i++) {
    const x = ext.x0 + (i * C + 0.5) * CELL, z = ext.z0 + (j * C + 0.5) * CELL;
    const hit = nearest(x, z, 60);
    if (!hit) { coarse[j * cw + i] = 0; cdist[j * cw + i] = Infinity; continue; }
    coarse[j * cw + i] = side(hit[0], hit[1], x, z) < 0 ? 1 : -1;
    cdist[j * cw + i] = hit[2];
  }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const ci = Math.round(i / C), cj = Math.round(j / C), k = cj * cw + ci;
    if (cdist[k] > C * CELL * 1.6 && coarse[k] !== 0) { raw[j * W + i] = coarse[k] > 0 ? 1 : 0; continue; }
    const x = ext.x0 + (i + 0.5) * CELL, z = ext.z0 + (j + 0.5) * CELL;
    const hit = nearest(x, z, 60);
    raw[j * W + i] = hit && side(hit[0], hit[1], x, z) < 0 ? 1 : 0;
  }
  // mapped land wins
  const land = new Uint8Array(W * H);
  paintLand(land, W, H, (x, z) => [(x - ext.x0) / CELL, (z - ext.z0) / CELL], CELL);
  for (let i = 0; i < W * H; i++) if (land[i]) raw[i] = 0;
  // smooth (3×3 majority, twice) and drop specks of sea smaller than ~15 cells inland
  let a = raw, b = new Uint8Array(W * H);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue; s += a[jj * W + ii]; n++; }
      b[j * W + i] = land[j * W + i] ? 0 : s * 2 > n ? 1 : 0;
    }
    [a, b] = [b, a];
  }
  const out = a;
  // connected sea regions: tiny ones (puddles between buildings) become land
  const seen = new Uint8Array(W * H), stack = [];
  for (let start = 0; start < W * H; start++) {
    if (!out[start] || seen[start]) continue;
    const region = [];
    stack.push(start); seen[start] = 1;
    while (stack.length) {
      const c = stack.pop(); region.push(c);
      const i = c % W, j = (c - i) / W;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        const q = jj * W + ii; if (out[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (region.length < 15) for (const c of region) out[c] = 0;
  }
  let sea = 0; for (let i = 0; i < W * H; i++) sea += out[i];
  return {
    share: sea / (W * H),
    // mapped land (buildings, roads, land use, the track)
    landAt(x, z) { const i = Math.floor((x - ext.x0) / CELL), j = Math.floor((z - ext.z0) / CELL); return i >= 0 && j >= 0 && i < W && j < H && land[j * W + i] === 1; },
    // nearest cell; outside the raster, the coastline's side directly
    at(x, z) {
      const i = Math.floor((x - ext.x0) / CELL), j = Math.floor((z - ext.z0) / CELL);
      if (i >= 0 && j >= 0 && i < W && j < H) return out[j * W + i] === 1;
      const hit = nearest(x, z, 60);
      return !!hit && side(hit[0], hit[1], x, z) < 0;
    },
  };
}
