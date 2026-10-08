// Buildings from Overture Maps (buildings theme, ODbL/CDLA: OpenStreetMap plus Microsoft and Google footprints)
// read straight from its public PMTiles archive with HTTP range requests: the z14 tiles over the circuit only.
// Overture gives what OSM often lacks – footprints everywhere, and per building (or building part) a height,
// floors, roof shape/height/direction, facade and roof colour and material, and the kind of building.
// Returns local-metre features like geo.getOsm's areas: [{ tags, pts }] with OSM-style tags, so the scene code
// treats both sources alike.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const URL = "https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-09-23.1/buildings.pmtiles";
const UA = { "User-Agent": "f1-live-kr/0.8 (personal, non-commercial desktop app)" };

// ---------- bytes ----------
// Only a real partial answer for exactly these bytes is taken: 206 with a Content-Range starting at `off` and the
// body `len` long (or shorter at the end of the file). A server ignoring Range answers 200 with the whole archive –
// hundreds of GB here – which would be read as if it were these bytes: refused without reading the body.
async function range(url, off, len, fetchImpl = fetch) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetchImpl(url, { headers: { ...UA, Range: `bytes=${off}-${off + len - 1}` }, signal: AbortSignal.timeout(30000) });
      if (res.status === 206) {
        const m = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(res.headers.get("content-range") || "");
        if (!m || +m[1] !== off || +m[2] - +m[1] + 1 > len) { await res.body?.cancel?.(); throw new Error("range answer for other bytes"); }
        const b = Buffer.from(await res.arrayBuffer());
        if (b.length !== +m[2] - +m[1] + 1) throw new Error("range answer cut short");
        return b;
      }
      await res.body?.cancel?.();
      last = new Error(res.status === 200 ? "server ignored the byte range" : `HTTP ${res.status}`);
      if (res.status === 200) break;
    } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  throw last;
}
// (a directory or tile is at most a few MB unpacked; more is refused)
const gunzip = (b) => (b[0] === 0x1f && b[1] === 0x8b ? zlib.gunzipSync(b, { maxOutputLength: 64 * 1024 * 1024 }) : b);

// ---------- protobuf ----------
// (reads past the end, varints over 10 bytes and unknown wire types throw: a damaged tile is skipped, not misread)
class Pbf {
  constructor(buf) { this.buf = buf; this.pos = 0; this.len = buf.length; }
  varint() {
    let v = 0, s = 0, b;
    do {
      if (this.pos >= this.len) throw new Error("pbf: truncated varint");
      if (s > 63) throw new Error("pbf: varint too long");
      b = this.buf[this.pos++]; v += (b & 0x7f) * 2 ** s; s += 7;
    } while (b >= 0x80);
    return v;
  }
  svarint() { const v = this.varint(); return v % 2 === 1 ? (v + 1) / -2 : v / 2; }
  advance(n) { if (n < 0 || this.pos + n > this.len) throw new Error("pbf: read past the end"); this.pos += n; }
  bytes() { const n = this.varint(), at = this.pos; this.advance(n); return this.buf.subarray(at, at + n); }
  // (the length is read first: `this.pos += this.varint()` would add it to the position from before the length)
  skip(t) {
    if (t === 0) this.varint();
    else if (t === 1) this.advance(8);
    else if (t === 2) { const n = this.varint(); this.advance(n); }
    else if (t === 5) this.advance(4);
    else throw new Error(`pbf: unknown wire type ${t}`);
  }
  fields(fn, end = this.len) {
    if (end > this.len) throw new Error("pbf: message past the end");
    while (this.pos < end) { const k = this.varint(), f = k >> 3, t = k & 7, p = this.pos; fn(f, t, this); if (this.pos === p) this.skip(t); }
    if (this.pos > end) throw new Error("pbf: field past the message end");
  }
}

// ---------- PMTiles v3 ----------
function zxyToId(z, x, y) {
  let acc = 0;
  for (let t = 0; t < z; t++) acc += 4 ** t;
  const n = 2 ** z;
  let d = 0, rx, ry;
  for (let s = n / 2; s >= 1; s /= 2) {
    rx = (x & s) > 0 ? 1 : 0; ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } [x, y] = [y, x]; }
  }
  return acc + d;
}
function readDir(buf) {
  const p = new Pbf(buf), n = p.varint(), e = [];
  if (n > buf.length) throw new Error("PMTiles directory: more entries than bytes");   // (each entry takes ≥ 4 bytes)
  let id = 0;
  for (let i = 0; i < n; i++) { id += p.varint(); e.push({ id, run: 0, len: 0, off: 0 }); }
  for (const x of e) x.run = p.varint();
  for (const x of e) x.len = p.varint();
  for (let i = 0; i < n; i++) { const v = p.varint(); e[i].off = v === 0 && i > 0 ? e[i - 1].off + e[i - 1].len : v - 1; }
  return e;
}
function findEntry(dir, id) {
  let lo = 0, hi = dir.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dir[m].id < id) lo = m + 1; else if (dir[m].id > id) hi = m - 1; else return dir[m]; }
  if (hi >= 0 && (dir[hi].run === 0 || id - dir[hi].id < dir[hi].run)) return dir[hi];
  return null;
}
class PMTiles {
  constructor(url, cacheDir) { this.url = url; this.cacheDir = cacheDir; this.dirs = new Map(); }
  async header() {
    if (this.h) return this.h;
    const b = await range(this.url, 0, 16384), r = (o) => Number(b.readBigUInt64LE(o));
    if (b.length < 127 || b.toString("latin1", 0, 7) !== "PMTiles" || b[7] !== 3) throw new Error("not a PMTiles v3 archive");
    const h = { rootOff: r(8), rootLen: r(16), leafOff: r(40), dataOff: r(56), minZ: b[100], maxZ: b[101] };
    if (h.rootOff + h.rootLen > b.length) throw new Error("PMTiles root directory out of range");
    this.root = readDir(gunzip(b.subarray(h.rootOff, h.rootOff + h.rootLen)));
    this.h = h;
    return this.h;
  }
  async dir(off, len) {
    const k = `${off}:${len}`;
    if (!this.dirs.has(k)) this.dirs.set(k, range(this.url, this.h.leafOff + off, len).then((b) => readDir(gunzip(b))));
    return this.dirs.get(k);
  }
  async tile(z, x, y) {
    const file = path.join(this.cacheDir, "overture", `${z}_${x}_${y}.mvt`);
    try { return fs.readFileSync(file); } catch {}
    await this.header();
    const id = zxyToId(z, x, y);
    let dir = this.root;
    for (let depth = 0; depth < 4; depth++) {
      const e = findEntry(dir, id);
      if (!e) return null;
      if (e.run > 0) {
        const b = gunzip(await range(this.url, this.h.dataOff + e.off, e.len));
        fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, b);
        return b;
      }
      dir = await this.dir(e.off, e.len);
    }
    return null;
  }
}

// ---------- Mapbox Vector Tile ----------
function decodeMvt(buf) {
  const layers = {};
  new Pbf(buf).fields((f, t, p) => {
    if (f !== 3) return;
    const end = p.varint() + p.pos, L = { name: "", extent: 4096, keys: [], values: [], features: [] };
    p.fields((f2, t2, q) => {
      if (f2 === 1) L.name = q.bytes().toString("utf8");
      else if (f2 === 5) L.extent = q.varint();
      else if (f2 === 3) L.keys.push(q.bytes().toString("utf8"));
      else if (f2 === 4) {
        const e2 = q.varint() + q.pos; let v = null;
        q.fields((f3, t3, r) => {
          if (f3 === 1) v = r.bytes().toString("utf8");
          else if (f3 === 2) { v = r.buf.readFloatLE(r.pos); r.pos += 4; }
          else if (f3 === 3) { v = r.buf.readDoubleLE(r.pos); r.pos += 8; }
          else if (f3 === 4) v = r.varint();
          else if (f3 === 5) v = r.varint();
          else if (f3 === 6) v = r.svarint();
          else if (f3 === 7) v = !!r.varint();
        }, e2);
        L.values.push(v);
      } else if (f2 === 2) {
        const e2 = q.varint() + q.pos, F = { tags: [], type: 0, geom: null };
        q.fields((f3, t3, r) => {
          if (f3 === 2) { const e3 = r.varint() + r.pos; while (r.pos < e3) F.tags.push(r.varint()); }
          else if (f3 === 3) F.type = r.varint();
          else if (f3 === 4) { const e3 = r.varint() + r.pos; F.geom = r.buf.subarray(r.pos, e3); r.pos = e3; }
        }, e2);
        L.features.push(F);
      }
    }, end);
    layers[L.name] = L;
  });
  return layers;
}
// Polygon rings (tile pixel coordinates) of a feature, grouped into polygons: [[outer, ...holes], ...].
function rings(geom) {
  const p = new Pbf(geom), out = [];
  let x = 0, y = 0, ring = null;
  while (p.pos < p.len) {
    const ci = p.varint(), cmd = ci & 7, n = ci >> 3;
    if (cmd === 1 || cmd === 2) for (let k = 0; k < n; k++) {
      x += p.svarint(); y += p.svarint();
      if (cmd === 1) { ring = [[x, y]]; out.push(ring); } else ring.push([x, y]);
    } else if (cmd === 7) { /* close */ }
  }
  const polys = [];
  for (const r of out) {
    let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
    if (a > 0 || !polys.length) polys.push([r]); else polys[polys.length - 1].push(r);   // MVT: outer rings clockwise in tile space
  }
  return polys;
}

// Clips a ring to the tile square [0, e]² (tiles carry a buffer: without this a building on a tile edge
// would be drawn twice, overlapping).
function clipRing(ring, e) {
  let pts = ring;
  const edges = [[(p) => p[0] >= 0, (a, b) => { const t = (0 - a[0]) / (b[0] - a[0]); return [0, a[1] + (b[1] - a[1]) * t]; }],
    [(p) => p[0] <= e, (a, b) => { const t = (e - a[0]) / (b[0] - a[0]); return [e, a[1] + (b[1] - a[1]) * t]; }],
    [(p) => p[1] >= 0, (a, b) => { const t = (0 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, 0]; }],
    [(p) => p[1] <= e, (a, b) => { const t = (e - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, e]; }]];
  for (const [inside, cut] of edges) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) out.push(cut(a, b));
    }
    pts = out;
    if (pts.length < 3) return null;
  }
  return pts;
}

// ---------- to OSM-style tags ----------
const COLOUR = (v) => (typeof v === "string" && /^#?[0-9a-f]{6}$/i.test(v) ? (v[0] === "#" ? v : "#" + v) : typeof v === "string" ? v : null);
function tagsOf(props, part) {
  const t = {};
  t[part ? "building:part" : "building"] = props.class || props.subtype || "yes";
  if (props.height != null) t.height = String(props.height);
  if (props.min_height != null) t.min_height = String(props.min_height);
  if (props.num_floors != null) t["building:levels"] = String(props.num_floors);
  if (props.min_floor != null) t["building:min_level"] = String(props.min_floor);
  if (props.roof_shape) t["roof:shape"] = props.roof_shape;
  if (props.roof_height != null) t["roof:height"] = String(props.roof_height);
  if (props.roof_direction != null) t["roof:direction"] = String(props.roof_direction);
  if (props.roof_orientation) t["roof:orientation"] = props.roof_orientation;
  if (props.facade_color) t["building:colour"] = COLOUR(props.facade_color);
  if (props.roof_color) t["roof:colour"] = COLOUR(props.roof_color);
  if (props.facade_material) t["building:material"] = props.facade_material;
  if (props.roof_material) t["roof:material"] = props.roof_material;
  if (props.subtype) t["overture:subtype"] = props.subtype;
  const name = props["@name"] || props.name || props["names.primary"] || props["names"];
  if (typeof name === "string") t.name = name;
  if (props.is_underground) t.location = "underground";
  t.source = "overture";
  return t;
}

// Buildings around a centre (lat, lon), r metres; fr: geo.frame (lat/lon → local metres). Cached per tile.
async function buildings(cacheDir, center, r, fr, onProgress) {
  const pm = new PMTiles(URL, cacheDir);
  const z = 14, n = 2 ** z, deg = Math.PI / 180;
  const lon2x = (lon) => ((lon + 180) / 360) * n, lat2y = (lat) => ((1 - Math.log(Math.tan(lat * deg) + 1 / Math.cos(lat * deg)) / Math.PI) / 2) * n;
  const dLat = r / 111000, dLon = r / (111000 * Math.cos(center[0] * deg));
  const x0 = Math.floor(lon2x(center[1] - dLon)), x1 = Math.floor(lon2x(center[1] + dLon)), y0 = Math.floor(lat2y(center[0] + dLat)), y1 = Math.floor(lat2y(center[0] - dLat));
  const jobs = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push([x, y]);
  const areas = [];
  let done = 0, i = 0;
  const work = async () => {
    while (i < jobs.length) {
      const [tx, ty] = jobs[i++];
      let buf = null;
      try { buf = await pm.tile(z, tx, ty); } catch { /* a missing tile: OSM still has the area */ }
      onProgress?.(++done, jobs.length);
      if (!buf) continue;
      let layers;
      try { layers = decodeMvt(buf); } catch { continue; }   // (a damaged tile: the rest still come)
      for (const [name, L] of Object.entries(layers)) {
        const part = /part/.test(name);
        if (!/building/.test(name)) continue;
        for (const F of L.features) {
          if (F.type !== 3 || !F.geom) continue;
          const props = {};
          for (let k = 0; k + 1 < F.tags.length; k += 2) props[L.keys[F.tags[k]]] = L.values[F.tags[k + 1]];
          if (props.is_underground) continue;
          const tags = tagsOf(props, part);
          // an outline drawn in detail as parts: the parts stand in for it, if they came along (below)
          if (props.has_parts && !part && props.class !== "grandstand") tags["overture:hasParts"] = "1";
          tags["overture:source"] = props["@geometry_source"] || null;
          for (const poly of rings(F.geom)) {
            const ring = clipRing(poly[0], L.extent);
            if (!ring) continue;
            const pts = ring.map(([px, py]) => {
              const lon = ((tx + px / L.extent) / n) * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + py / L.extent)) / n))) / deg;
              return fr.toXY(lat, lon).map((v) => Math.round(v * 10) / 10);
            });
            if (pts.length >= 3) areas.push({ tags, pts, tile: `${tx}/${ty}` });
          }
        }
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, work));
  // outlines whose parts are here give way to them; ones whose parts are missing stay
  const partC = areas.filter((a) => a.tags["building:part"]).map((a) => { let x = 0, y = 0; for (const p of a.pts) { x += p[0]; y += p[1]; } return [x / a.pts.length, y / a.pts.length]; });
  const inside = (x, y, pts) => { let r = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r; } return r; };
  // (a building cut by tile edges appears in each tile: the pieces are kept, they fit edge to edge)
  return areas.filter((a) => {
    if (!a.tags["overture:hasParts"]) return true;
    delete a.tags["overture:hasParts"];
    return !partC.some(([x, y]) => inside(x, y, a.pts));
  });
}

module.exports = { buildings, decodeMvt, zxyToId, PMTiles, URL, Pbf, range };
