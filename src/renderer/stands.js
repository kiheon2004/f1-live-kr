// Grandstands with real seats. Two sources (both prepared in src/main/scene.js):
//   mapped – OpenStreetMap grandstand outlines: the exact footprint, rows parallel to its side facing the track
//   listed – src/data/grandstands.json: the circuit's grandstands as its spectator map shows them (name, both ends,
//            rows, covered or not), for the many stands OSM doesn't have (temporary stands, street circuits)
// A listed stand follows the curve of the track between its two ends, set back from the measured edge of the
// tarmac; one away from the track (or across two stretches of it) stands straight between its ends.
// Rows are scaled per circuit so the seats add up to the circuit's known grandstand capacity.
// Every seat is drawn (instanced); far away the seats fade into seat-coloured rows, so the many thousands of
// them only cost something close up.
import * as THREE from "./vendor/three.module.js";

const ROW_D = 0.8;          // row depth (m): seat and legroom
const SEAT_W = 0.5;         // seat pitch along a row
const WALK = 1.6;           // cross aisle along the front
const FRONT_H = 1.8;        // front wall: the first row looks over the fence and the people in front
const AISLE_EVERY = 14;     // a stepped aisle every ~28 seats
const AISLE_W = 1.2;
const SEATS_NEAR = 520;     // seats are drawn within this distance of the camera; beyond, the treads take their colour
const SECTION = 48;         // metres of stand per instanced seat batch (for the distance cut-off and culling)

function rand(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function inPoly(x, y, pts) {
  let r = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
}
const polyArea = (pts) => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return a / 2; };
function obb(pts) {
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x; cz += z; }
  cx /= pts.length; cz /= pts.length;
  let sxx = 0, szz = 0, sxz = 0;
  for (const [x, z] of pts) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
  const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), u = [Math.cos(th), Math.sin(th)], v = [-u[1], u[0]];
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of pts) { const a = (x - cx) * u[0] + (z - cz) * u[1], b = (x - cx) * v[0] + (z - cz) * v[1]; u0 = Math.min(u0, a); u1 = Math.max(u1, a); v0 = Math.min(v0, b); v1 = Math.max(v1, b); }
  return { c: [cx, cz], u, v, u0, u1, v0, v1 };
}

// Seat colours: one main colour per stand (plastic seats fade a little, a few are replaced in another shade).
const SEAT_COLOURS = ["#2c63c4", "#d1333b", "#2e9a5e", "#f0bf1e", "#7d8794", "#f07a22", "#3aa6e0", "#9a3fb0", "#e2e4e7", "#3c5a9a", "#1b9a9a", "#c42f45"];
// Advertising boards along the front wall.
const BOARDS = ["#d6001c", "#00205b", "#ffcd00", "#e10600", "#0a7a3d", "#111418", "#f0f0f0", "#ff6a00"];

// One seat, facing +z, standing on y = 0: a moulded pan, a slightly reclined back and a pedestal.
let SEAT = null;
function seatGeometry() {
  if (SEAT) return SEAT;
  const pos = [], nor = [], col = [];
  const box = (cx, cy, cz, w, h, d, tilt, shade) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.rotateX(tilt); g.translate(cx, cy, cz);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      if (n.getY(i) < -0.9) continue;              // bottoms are never seen
      pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(shade, shade, shade);
    }
  };
  box(0, 0.43, 0.02, 0.44, 0.06, 0.40, -0.05, 1);          // pan
  box(0, 0.70, -0.19, 0.44, 0.42, 0.05, -0.2, 0.92);       // back
  box(0, 0.2, -0.05, 0.07, 0.4, 0.07, 0, 0.3);             // pedestal
  // the triangles skipped above were whole faces (two each), so the arrays still hold whole triangles
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  SEAT = g;
  return g;
}

// Scaffolding of a temporary stand (back and ends): standards, ledgers and a diagonal brace, one bay 2.5 m wide
// and 2 m high, see-through between the tubes.
let LATTICE = null;
function latticeTexture() {
  if (LATTICE) return LATTICE;
  const n = 256, cv = document.createElement("canvas"); cv.width = cv.height = n;
  const g = cv.getContext("2d");
  g.clearRect(0, 0, n, n);
  g.strokeStyle = "#ffffff"; g.lineCap = "square";
  g.lineWidth = 16; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, n); g.moveTo(n, 0); g.lineTo(n, n); g.stroke();   // standards
  g.lineWidth = 12; g.beginPath(); g.moveTo(0, 0); g.lineTo(n, 0); g.moveTo(0, n); g.lineTo(n, n); g.moveTo(0, n / 2); g.lineTo(n, n / 2); g.stroke();   // ledgers
  g.lineWidth = 9; g.beginPath(); g.moveTo(0, n); g.lineTo(n, 0); g.stroke();   // brace
  LATTICE = new THREE.CanvasTexture(cv);
  LATTICE.wrapS = LATTICE.wrapT = THREE.RepeatWrapping; LATTICE.anisotropy = 8;
  return LATTICE;
}

// Concrete and steel take the seat colour with distance (the attribute seatTint), so a stand still reads as
// seated once the individual seats are no longer drawn.
function standMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, ...opts });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.seatFar = { value: new THREE.Vector2(SEATS_NEAR * 0.55, SEATS_NEAR * 1.05) };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec4 seatTint;\nvarying vec4 vSeatTint;\nvarying vec3 vStandPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvSeatTint = seatTint;\nvStandPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec2 seatFar;\nvarying vec4 vSeatTint;\nvarying vec3 vStandPos;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float sf = smoothstep(seatFar.x, seatFar.y, distance(vStandPos, cameraPosition)) * vSeatTint.a;
        // a seat row seen from afar: mostly seat colour, the concrete of the tread showing between the rows
        diffuseColor.rgb = mix(diffuseColor.rgb, vSeatTint.rgb, sf * 0.85);`);
  };
  return mat;
}

// scene: the fitted scene (buildings with kind "grandstand", stands: { seats, total, list }), gf: geo frame of
// scenery.js, world: map3d's world (samples, grid), groundAt(x, z), corridor: trackCorridor(), street: bool.
export function buildStands({ scene, gf, world, groundAt, corridor, street }) {
  const samples = world.samples, n = samples.length;
  const step = n > 1 ? samples[0].p.distanceTo(samples[1].p) : 2;
  const edge = (s, side) => (side > 0 ? s.L ?? 7 : s.R ?? -7);
  const nearestSample = (x, z) => {
    const [s, d] = world.grid.nearest(x, z, 3);
    if (s && d < 110) return [s, d];
    let best = null, bd = Infinity;
    for (const q of samples) { const dd = (q.p.x - x) ** 2 + (q.p.z - z) ** 2; if (dd < bd) { bd = dd; best = q; } }
    return [best, Math.sqrt(bd)];
  };
  const lateral = (s, x, z) => (x - s.p.x) * s.nor.x + (z - s.p.z) * s.nor.z;

  // ---- where a stand can't go: other stretches of track, water, large buildings, other tarmac, big roads ----
  const blockers = [];   // { box: [x0, z0, x1, z1], test(x, z) }
  const CELL = 100, cells = new Map();
  const addBlocker = (b) => {
    for (let i = Math.floor(b.box[0] / CELL); i <= Math.floor(b.box[2] / CELL); i++)
      for (let j = Math.floor(b.box[1] / CELL); j <= Math.floor(b.box[3] / CELL); j++) { const k = `${i},${j}`; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(b); }
  };
  const polyBlocker = (pts, why = "b") => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    addBlocker({ why, box: [x0, z0, x1, z1], test: (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1 && inPoly(x, z, pts) });
  };
  const lineBlocker = (pts, half, why = "r") => {
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
      addBlocker({ why, box: [Math.min(ax, bx) - half, Math.min(az, bz) - half, Math.max(ax, bx) + half, Math.max(az, bz) + half],
        test: (x, z) => { const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)); return Math.hypot(ax + dx * t - x, az + dz * t - z) < half; } });
    }
  };
  for (const a of scene.areas) if (a.k === "water") polyBlocker(a.pts.map(gf.xz), "w");
  for (const b of scene.buildings) {
    if (b.kind === "grandstand") continue;
    const pts = b.pts.map(gf.xz);
    if (Math.abs(polyArea(pts)) > 900 || b.h > 14) polyBlocker(pts);   // small huts and kiosks may sit under a stand
  }
  // Roads and other tarmac block, except the circuit's own: the mapped raceway under the F1 track, and on a
  // street circuit the closed roads alongside it (the other carriageway, service roads), where the temporary
  // stands are actually built. Only stretches near the track are let through.
  const trackDist = (x, z) => { const [s, d] = world.grid.nearest(x, z, 2); return s ? d : Infinity; };
  for (const l of scene.lines) {
    const pts = l.pts.map(gf.xz);
    if (l.k === "raceway") {
      // pieces of the F1 track itself are left out (the corridor already keeps stands off it)
      for (let i = 1; i < pts.length; i++) if (trackDist(pts[i][0], pts[i][1]) > 12 || trackDist(pts[i - 1][0], pts[i - 1][1]) > 12) lineBlocker([pts[i - 1], pts[i]], 5, "p");
    } else if (l.k === "road" && l.w >= 9 && !l.bridge) {
      for (let i = 1; i < pts.length; i++) {
        const mx = (pts[i - 1][0] + pts[i][0]) / 2, mz = (pts[i - 1][1] + pts[i][1]) / 2;
        if (trackDist(mx, mz) < (street ? 40 : 25)) continue;
        lineBlocker([pts[i - 1], pts[i]], l.w / 2 + 1);
      }
    } else if (l.k === "rail") lineBlocker(pts, 3, "l");
  }
  // own: { i, span } – the stand's own stretch of track (sample index of its middle, half length in samples),
  // which may come close (the stand is set back from it already); any other stretch blocks.
  const blocked = (x, z, own) => {
    if (corridor.on(x, z, street ? 1.2 : 4)) {
      const q = corridor.local(x, z);
      if (!own || !q) return "t";
      // its own stretch may come close, but never onto the tarmac (plus a metre)
      if (q.l < (q.s.L ?? 7) + 1 && q.l > (q.s.R ?? -7) - 1) return "t";
      const cd = Math.abs(((q.s.i - own.i) % n + n + n / 2) % n - n / 2);
      if (cd > own.span + 25) return "t";
    }
    for (const b of cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) if (b.test(x, z)) return b.why;
    return null;
  };

  // smoothed normals along a front line (a curved stand's rows must not fold over on the inside of a corner)
  const smoothNormals = (front) => {
    for (let it = 0; it < 3; it++) front = front.map((p, i) => { const a = front[Math.max(0, i - 1)], b = front[Math.min(front.length - 1, i + 1)]; const x = a.nx + p.nx * 2 + b.nx, z = a.nz + p.nz * 2 + b.nz, l = Math.hypot(x, z) || 1; return { ...p, nx: x / l, nz: z / l }; });
    return front;
  };

  // ---- stand outlines: a front line (scene x, z) with outward normals, rows going back from it ----
  const stands = [], curved = [];
  // mapped stands
  for (const b of scene.buildings) {
    if (b.kind !== "grandstand") continue;
    let pts = b.pts.map(gf.xz);
    if (pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
    if (pts.length < 3) continue;
    // an outline mapped across the track (a stand drawn together with the pit building, say) is no use:
    // a listed stand takes its place
    let left = 0, right = 0;
    for (const [x, z] of pts) { const [q, d] = nearestSample(x, z); if (d > 80) continue; const l = lateral(q, x, z); if (l > (q.L ?? 7) + 2) left++; else if (l < (q.R ?? -7) - 2) right++; }
    if (left && right) continue;
    const fixed = corridor.clearPolygon(pts);
    if (!fixed) continue;
    pts = fixed;
    const area = Math.abs(polyArea(pts));
    if (area < 40) continue;
    const o = obb(pts);
    const [s, sd] = nearestSample(o.c[0], o.c[1]);
    if (sd > 150 + Math.max(o.u1 - o.u0, o.v1 - o.v0) / 2) continue;   // a stadium nearby, not a stand for the circuit
    // the depth axis is the box axis pointing most towards the track; the front is the side nearer to it
    let du = o.u, dv = o.v, a0 = o.u0, a1 = o.u1, b0 = o.v0, b1 = o.v1;
    const tx = s.p.x - o.c[0], tz = s.p.z - o.c[1];
    if (Math.abs(tx * o.u[0] + tz * o.u[1]) > Math.abs(tx * o.v[0] + tz * o.v[1])) { du = o.v; dv = o.u; a0 = o.v0; a1 = o.v1; b0 = o.u0; b1 = o.u1; }
    if (tx * dv[0] + tz * dv[1] > 0) { dv = [-dv[0], -dv[1]]; [b0, b1] = [-b1, -b0]; }
    const len = a1 - a0, depth = b1 - b0;
    if (len < 4 || depth < 3) continue;
    // A curved outline (a stand around a corner) is far from its box: it is built like a listed stand instead,
    // following the track between its two ends, as deep as the outline is on average.
    if (area / (len * depth) < 0.72 && len > 30) {
      const ends = [0, 1].map((e) => pts.reduce((best, p) => { const a = (p[0] - o.c[0]) * du[0] + (p[1] - o.c[1]) * du[1]; return (e ? a > best[0] : a < best[0]) ? [a, p] : best; }, [e ? -Infinity : Infinity, null])[1]);
      let off = Infinity, side = 0;
      for (const [x, z] of pts) { const [q] = nearestSample(x, z); const l = lateral(q, x, z); side += Math.sign(l); off = Math.min(off, l > 0 ? l - (q.L ?? 7) : (q.R ?? -7) - l); }
      curved.push({ n: b.name || null, A: ends[0], B: ends[1], side: side >= 0 ? "L" : "R", off: Math.max(street ? 2 : 3, off), rows: Math.max(6, Math.min(45, Math.round(area / len / ROW_D))), roof: depth > 14 && area > 1500, perm: true, curve: 1, outline: pts });
      continue;
    }
    const k = Math.max(2, Math.ceil(len / 6)), front = [];
    for (let i = 0; i <= k; i++) {
      const a = a0 + (len * i) / k;
      front.push({ x: o.c[0] + du[0] * a + dv[0] * b0, z: o.c[1] + du[1] * a + dv[1] * b0, nx: dv[0], nz: dv[1] });
    }
    const rows = Math.max(3, Math.min(40, Math.floor((depth - WALK) / ROW_D)));
    // a tagged height sets the rake; otherwise a usual 0.45 m per row
    const rise = b.est ? 0.45 : Math.max(0.3, Math.min(0.62, (b.h - FRONT_H - 3) / rows));
    stands.push({ kind: "mapped", name: b.name || null, front, rows, rise, maxRows: rows, roof: depth > 14 && area > 1500, perm: true, outline: pts, s });
  }
  // listed stands (skipped where a mapped outline already is the same stand: that one takes its name and roof)
  const list = (scene.stands?.list || []).map((L) => ({ ...L, A: gf.xz(L.a), B: gf.xz(L.b) }));
  for (const L of curved.concat(list)) {
    const { A, B } = L;
    const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const twin = stands.find((m) => (m.kind === "mapped" || m.curvedFrom) && (inPoly(mid[0], mid[1], m.outline || m.curvedFrom) || segDist(m.front, A, B) < 18));
    if (twin && !L.outline) { twin.name = twin.name || L.n; if (L.roof) twin.roof = true; twin.listed = true; continue; }
    let [sa] = nearestSample(A[0], A[1]), [sb] = nearestSample(B[0], B[1]);
    const la = lateral(sa, A[0], A[1]), lb = lateral(sb, B[0], B[1]);
    const side = L.side ? (L.side === "L" ? 1 : -1) : Math.sign(la + lb) || 1;
    const off = L.off ?? (street ? 3 : 14);
    let d = (sb.i - sa.i + n) % n;
    if (d > n / 2) { [sa, sb] = [sb, sa]; d = n - d; }
    const chord = Math.hypot(B[0] - A[0], B[1] - A[1]);
    let front = [], own = null, alt = null;
    if (L.straight || Math.min(Math.abs(la), Math.abs(lb)) > 90 || d * step < 15 || (!L.curve && d * step > 1.6 * chord + 30) || (!L.side && Math.sign(la) !== Math.sign(lb))) {
      // straight between its ends, the back away from the track
      const [sm] = nearestSample(mid[0], mid[1]);
      let nx = -(B[1] - A[1]) / (chord || 1), nz = (B[0] - A[0]) / (chord || 1);
      if (nx * (sm.p.x - mid[0]) + nz * (sm.p.z - mid[1]) > 0) { nx = -nx; nz = -nz; }
      const k = Math.max(2, Math.ceil(chord / 6));
      for (let i = 0; i <= k; i++) front.push({ x: A[0] + ((B[0] - A[0]) * i) / k, z: A[1] + ((B[1] - A[1]) * i) / k, nx, nz });
      own = { i: sm.i, span: chord / step / 2 + 20 };
    } else {
      // along the track at `off` metres beyond its edge, every other sample
      for (let k = 0; k <= d; k += 2) {
        const s = samples[(sa.i + k) % n], o = edge(s, side) + side * off;
        front.push({ x: s.p.x + s.nor.x * o, z: s.p.z + s.nor.z * o, nx: s.nor.x * side, nz: s.nor.z * side });
      }
      own = { i: samples[(sa.i + Math.floor(d / 2)) % n].i, span: d / 2 };
      front = smoothNormals(front);
      // the same stretch on the other side of the track: tried when this side turns out to be taken (the side
      // read off a spectator map can be the pit lane's)
      if (!L.outline) {
        const other = [];
        for (let k = 0; k <= d; k += 2) {
          const s = samples[(sa.i + k) % n], o = edge(s, -side) - side * off;
          other.push({ x: s.p.x + s.nor.x * o, z: s.p.z + s.nor.z * o, nx: -s.nor.x * side, nz: -s.nor.z * side });
        }
        alt = smoothNormals(other);
      }
    }
    if (front.length < 2) continue;
    stands.push({ kind: "listed", name: L.n, front, rows: L.rows || 20, rise: L.roof || L.perm ? 0.5 : 0.44, roof: !!L.roof, perm: !!(L.roof || L.perm), own, s: sa, alt, curvedFrom: L.outline || null });
  }
  if (!stands.length) return null;

  // ---- fit: trim fronts that run onto the track or into obstacles, and find the deepest clear rows ----
  const footprint = (st, rows) => {
    const d = WALK + rows * ROW_D + 0.8;
    return st.front.map((p) => [p.x - p.nx * 0.8, p.z - p.nz * 0.8]).concat(st.front.slice().reverse().map((p) => [p.x + p.nx * d, p.z + p.nz * d]));
  };
  // how deep a mapped stand could go (before the outlines themselves become obstacles): room to grow when the
  // circuit's seats aren't reached, up to 1.6× its mapped depth
  for (const st of stands) {
    if (st.kind !== "mapped") continue;
    let deep = Math.min(40, Math.round(st.rows * 1.6));
    for (const p of st.front) for (let k = st.rows + 1; k <= deep; k++) { const b = WALK + k * ROW_D; if (blocked(p.x + p.nx * b, p.z + p.nz * b, null)) { deep = k - 1; break; } }
    st.maxRows = Math.max(st.rows, deep);
  }
  for (const st of stands) if (st.kind === "mapped") polyBlocker(st.outline, "s");
  const fitListed = (st) => {
    // how deep each column of the stand can go before it meets something (in rows; -1 = the front itself is blocked)
    const cap = st.perm ? 40 : 32;   // temporary stands rarely go past ~32 rows, permanent ones ~40
    const why = [];
    const colRows = st.front.map((p) => {
      const w = blocked(p.x, p.z, st.own) || blocked(p.x + p.nx * WALK, p.z + p.nz * WALK, st.own);
      if (w) { why.push(w); return -1; }
      for (let k = 1; k <= cap; k++) { const b = WALK + k * ROW_D; if (blocked(p.x + p.nx * b, p.z + p.nz * b, st.own)) return k - 1; }
      return cap;
    });
    // trim ends that are blocked or much shallower than the rest; the stand is as deep as its shallowest column
    const sorted = colRows.filter((v) => v >= 0).sort((x, y) => x - y), med = sorted[Math.floor(sorted.length / 2)] ?? -1;
    let i0 = 0, i1 = st.front.length - 1;
    while (i0 < i1 && colRows[i0] < Math.max(4, med * 0.6)) i0++;
    while (i1 > i0 && colRows[i1] < Math.max(4, med * 0.6)) i1--;
    const kept = colRows.slice(i0, i1 + 1);
    if (i1 - i0 < 1 || kept.length < colRows.length * 0.4 || Math.min(...kept) < 4) return `blocked (${[...new Set(why)].join("")}): ${colRows.map((v) => (v < 0 ? "x" : v)).join(" ")}`;
    st.front = st.front.slice(i0, i1 + 1);
    st.maxRows = Math.min(...kept);
    return null;
  };
  for (const st of stands) {
    if (st.kind !== "listed") continue;
    const full = st.front;
    let fail = fitListed(st);
    if (fail && st.alt) { st.front = st.alt; const f2 = fitListed(st); if (f2) { st.front = full; fail += ` | other side ${f2}`; } else fail = null; }
    if (fail) { st.dead = fail; continue; }
    polyBlocker(footprint(st, st.maxRows), "s");
  }
  const alive = stands.filter((s) => !s.dead);
  const frontLen = (st) => { let L = 0; for (let i = 1; i < st.front.length; i++) L += Math.hypot(st.front[i].x - st.front[i - 1].x, st.front[i].z - st.front[i - 1].z); return L; };
  const seatsOf = (st, rows) => Math.floor((frontLen(st) * (1 - AISLE_W / AISLE_EVERY)) / SEAT_W) * rows;
  // ---- the circuit's grandstand capacity: listed stands get the seats the mapped ones don't have ----
  const target = scene.stands?.seats || 0;
  if (target) {
    const mapped = alive.filter((s) => s.kind === "mapped").reduce((a, s) => a + seatsOf(s, s.rows), 0);
    const listed = alive.filter((s) => s.kind === "listed");
    // a few passes: stands that can't grow (obstacles behind) leave the rest to the others
    // outlines mapped deeper than the circuit's seats allow (a stand drawn with its concourse) lose rows
    if (mapped > target * 1.1) {
      const f = (target * (listed.length ? 0.85 : 1)) / mapped;
      for (const s of alive) if (s.kind === "mapped") s.rows = Math.max(6, Math.round(s.rows * f));
    }
    const mappedNow = alive.filter((s) => s.kind === "mapped").reduce((a, s) => a + seatsOf(s, s.rows), 0);
    let need = target - mappedNow;
    for (let pass = 0; pass < 4 && listed.length && need > 0; pass++) {
      const flexible = listed.filter((s) => s.rows < s.maxRows), fixedSeats = listed.filter((s) => s.rows >= s.maxRows).reduce((a, s) => a + seatsOf(s, s.rows), 0);
      const flexSeats = flexible.reduce((a, s) => a + seatsOf(s, s.rows), 0);
      if (!flexSeats) break;
      const f = Math.max(0.35, Math.min(2.5, (need - fixedSeats) / flexSeats));
      for (const s of flexible) s.rows = Math.max(5, Math.min(s.maxRows, Math.round(s.rows * f)));
      const now = listed.reduce((a, s) => a + seatsOf(s, s.rows), 0);
      if (Math.abs(now - need) < need * 0.02) break;
    }
    // still short: mapped stands grow into the room behind them
    const total = () => alive.reduce((a, s) => a + seatsOf(s, s.rows), 0);
    const short = target - total();
    const grow = alive.filter((s) => s.kind === "mapped" && s.rows < s.maxRows);
    const growSeats = grow.reduce((a, s) => a + seatsOf(s, s.rows), 0);
    if (short > target * 0.03 && growSeats) {
      const f = Math.min(1.6, 1 + short / growSeats);
      for (const s of grow) s.rows = Math.min(s.maxRows, Math.round(s.rows * f));
    }
  }
  for (const s of alive) s.rows = Math.min(s.rows, s.maxRows ?? s.rows);

  // ---- geometry ----
  const r = rand(17);
  const pos = [], nor = [], col = [], tint = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3();
  const C = (h) => new THREE.Color(h);
  const NOTINT = [0, 0, 0, 0];
  // a flat face (fan), turned to face `out`
  const face = (vs, colour, out, t = NOTINT) => {
    e1.set(vs[1][0] - vs[0][0], vs[1][1] - vs[0][1], vs[1][2] - vs[0][2]);
    e2.set(vs[2][0] - vs[0][0], vs[2][1] - vs[0][1], vs[2][2] - vs[0][2]);
    nn.crossVectors(e1, e2);
    if (nn.lengthSq() < 1e-10) return;
    nn.normalize();
    let order = vs.map((_, i) => i);
    if (out && nn.x * out[0] + nn.y * out[1] + nn.z * out[2] < 0) { order = order.reverse(); nn.negate(); }
    for (let i = 1; i < order.length - 1; i++) for (const k of [order[0], order[i], order[i + 1]]) {
      pos.push(...vs[k]); nor.push(nn.x, nn.y, nn.z); col.push(colour.r, colour.g, colour.b); tint.push(...t);
    }
  };
  // scaffolding faces (temporary stands): uv in bays (2.5 m × 2 m), on the world height so ledgers line up
  const spos = [], snor = [], suv = [];
  const sface = (vs, out) => {
    e1.set(vs[1][0] - vs[0][0], vs[1][1] - vs[0][1], vs[1][2] - vs[0][2]);
    e2.set(vs[3][0] - vs[0][0], vs[3][1] - vs[0][1], vs[3][2] - vs[0][2]);
    nn.crossVectors(e1, e2);
    if (nn.lengthSq() < 1e-10) return;
    nn.normalize();
    if (out && nn.x * out[0] + nn.y * out[1] + nn.z * out[2] < 0) nn.negate();
    const w = Math.hypot(vs[1][0] - vs[0][0], vs[1][2] - vs[0][2]) / 2.5;
    const uvs = [[0, vs[0][1] / 2], [w, vs[1][1] / 2], [w, vs[2][1] / 2], [0, vs[3][1] / 2]];
    for (const k of [0, 1, 2, 0, 2, 3]) { spos.push(...vs[k]); snor.push(nn.x, nn.y, nn.z); suv.push(...uvs[k]); }
  };
  const seatGroups = [];   // { centre, matrices, colours }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  let seatTotal = 0;
  const report = [];
  for (const st of alive) {
    const F = st.front, rows = st.rows, rise = st.rise;
    const seed = hash(st.name || `${F[0].x | 0},${F[0].z | 0}`), rr = rand(seed);
    const seatC = C(SEAT_COLOURS[seed % SEAT_COLOURS.length]);
    const concrete = st.perm ? C("#bdb9b1") : C("#9aa0a6"), tread = st.perm ? C("#c9c5bd") : C("#8d949b");
    const steel = C("#5d646c"), backC = st.perm ? C("#a7a39b") : C("#4a5058"), rail = C("#2b2f34");
    // ground under the front, smoothed along the stand
    let gy = F.map((p) => groundAt(p.x, p.z));
    gy = gy.map((_, i) => { let s = 0, c = 0; for (let k = -3; k <= 3; k++) { const v = gy[i + k]; if (v != null && Number.isFinite(v)) { s += v; c++; } } return s / c; });
    const depth = WALK + rows * ROW_D;
    const P = (i, b, y) => [F[i].x + F[i].nx * b, y, F[i].z + F[i].nz * b];
    const yw = (i) => gy[i] + FRONT_H;                    // front walkway
    const yr = (i, k) => yw(i) + rise * (k + 1);          // top of row k's tread
    const top = (i) => yr(i, rows - 1);
    const tintC = [seatC.r * 0.9, seatC.g * 0.9, seatC.b * 0.9, 1];
    const len = frontLen(st);
    // aisle positions along the front (fractions), the same in every row so the aisles run straight up
    const nA = Math.max(0, Math.floor(len / AISLE_EVERY));
    const aisles = Array.from({ length: nA }, (_, k) => (k + 0.5) / nA);
    const cum = [0]; for (let i = 1; i < F.length; i++) cum.push(cum[i - 1] + Math.hypot(F[i].x - F[i - 1].x, F[i].z - F[i - 1].z));
    // board colours along the front wall, one per ~10 m
    for (let i = 0; i < F.length - 1; i++) {
      const out = [-F[i].nx, 0, -F[i].nz], j = i + 1;
      const board = C(BOARDS[(hash(st.name) + Math.floor(cum[i] / 10)) % BOARDS.length]);
      // front wall: concrete plinth and an advertising board on top
      face([P(i, 0, gy[i]), P(j, 0, gy[j]), P(j, 0, gy[j] + 0.6), P(i, 0, gy[i] + 0.6)], concrete, out);
      face([P(i, 0, gy[i] + 0.6), P(j, 0, gy[j] + 0.6), P(j, 0, yw(j)), P(i, 0, yw(i))], board, out);
      // walkway
      face([P(i, 0, yw(i)), P(j, 0, yw(j)), P(j, WALK, yw(j)), P(i, WALK, yw(i))], concrete, [0, 1, 0]);
      // front railing (a thin bar on posts)
      face([P(i, 0.05, yw(i) + 1.0), P(j, 0.05, yw(j) + 1.0), P(j, 0.05, yw(j) + 1.08), P(i, 0.05, yw(i) + 1.08)], rail, out);
      face([P(i, 0.05, yw(i)), P(i, 0.05, yw(i) + 1.0), P(i, 0.11, yw(i) + 1.0), P(i, 0.11, yw(i))], rail, out);
      // rows: riser + tread (the tread takes the seat colour far away)
      for (let k = 0; k < rows; k++) {
        const b0 = WALK + k * ROW_D, b1 = b0 + ROW_D, y0i = k ? yr(i, k - 1) : yw(i), y0j = k ? yr(j, k - 1) : yw(j);
        face([P(i, b0, y0i), P(j, b0, y0j), P(j, b0, yr(j, k)), P(i, b0, yr(i, k))], concrete, out);
        face([P(i, b0, yr(i, k)), P(j, b0, yr(j, k)), P(j, b1, yr(j, k)), P(i, b1, yr(i, k))], tread, [0, 1, 0], tintC);
      }
      // back: a parapet above the last row, a wall (concrete) or clad scaffolding (temporary) down to the ground
      const bb = depth, back = [F[i].nx, 0, F[i].nz];
      face([P(i, bb, top(i)), P(j, bb, top(j)), P(j, bb, top(j) + 1.1), P(i, bb, top(i) + 1.1)], st.perm ? concrete : steel, out);
      if (st.perm) face([P(i, bb, gy[i] - 0.5), P(j, bb, gy[j] - 0.5), P(j, bb, top(j) + 1.1), P(i, bb, top(i) + 1.1)], backC, back);
      else sface([P(i, bb, gy[i] - 0.5), P(j, bb, gy[j] - 0.5), P(j, bb, top(j)), P(i, bb, top(i))], back);
      face([P(i, bb - 0.15, top(i) + 1.1), P(j, bb - 0.15, top(j) + 1.1), P(j, bb, top(j) + 1.1), P(i, bb, top(i) + 1.1)], rail, [0, 1, 0]);
      // stepped aisles: a half step in the middle of each row where an aisle crosses this piece of the stand
      for (const a of aisles) {
        const at = a * len;
        if (at < cum[i] || at >= cum[j]) continue;
        const t = (at - cum[i]) / (cum[j] - cum[i] || 1);
        const L = (b, y) => { const x = F[i].x + (F[j].x - F[i].x) * t, z = F[i].z + (F[j].z - F[i].z) * t, nx = F[i].nx, nz = F[i].nz, tx = (F[j].x - F[i].x) / (cum[j] - cum[i] || 1), tz = (F[j].z - F[i].z) / (cum[j] - cum[i] || 1); return (s) => [x + nx * b + tx * s, y, z + nz * b + tz * s]; };
        for (let k = 0; k < rows; k++) {
          const b0 = WALK + k * ROW_D, ym = (k ? yr(i, k - 1) : yw(i)) + rise / 2 + 0.01, f0 = L(b0, ym), f1 = L(b0 + ROW_D / 2, ym);
          face([f0(-AISLE_W / 2), f0(AISLE_W / 2), f1(AISLE_W / 2), f1(-AISLE_W / 2)], C("#d9d6cf"), [0, 1, 0]);
          const r0 = L(b0, ym - rise / 2), r1 = L(b0, ym);
          face([r0(-AISLE_W / 2), r0(AISLE_W / 2), r1(AISLE_W / 2), r1(-AISLE_W / 2)], concrete, out);
          const s0 = L(b0 + ROW_D / 2, ym), s1 = L(b0 + ROW_D / 2, ym + rise / 2);
          face([s0(-AISLE_W / 2), s0(AISLE_W / 2), s1(AISLE_W / 2), s1(-AISLE_W / 2)], concrete, out);
        }
      }
    }
    // end walls: the stepped profile, one strip per row
    for (const [i, sgn] of [[0, -1], [F.length - 1, 1]]) {
      const j = sgn < 0 ? 1 : F.length - 2;
      const ax = F[i].x - F[j].x, az = F[i].z - F[j].z, al = Math.hypot(ax, az) || 1, out = [ax / al, 0, az / al];
      const wallC = st.perm ? concrete : steel;
      face([P(i, 0, gy[i]), P(i, WALK, gy[i]), P(i, WALK, yw(i)), P(i, 0, yw(i))], wallC, out);
      for (let k = 0; k < rows; k++) {
        const b0 = WALK + k * ROW_D, quad = [P(i, b0, gy[i]), P(i, b0 + ROW_D, gy[i]), P(i, b0 + ROW_D, yr(i, k)), P(i, b0, yr(i, k))];
        if (st.perm) face(quad, wallC, out); else sface(quad, out);
        face([P(i, b0, yr(i, k)), P(i, b0 + ROW_D, yr(i, k)), P(i, b0 + ROW_D, yr(i, k) + 0.12), P(i, b0, yr(i, k) + 0.12)], wallC, out);   // edge of the tread
      }
      face([P(i, depth - 0.01, gy[i]), P(i, depth, gy[i]), P(i, depth, top(i) + 1.1), P(i, depth - 0.01, top(i) + 1.1)], wallC, out);
    }
    // roof: columns along the back, a canopy reaching over most of the rows, rising slightly towards the track
    if (st.roof) {
      const white = C("#e9ecef"), under = C("#8b9299"), reach = WALK + rows * ROW_D * 0.25;
      const hb = (i) => top(i) + 3.4, hf = (i) => top(i) + 4.6;
      for (let i = 0; i < F.length - 1; i++) {
        const j = i + 1;
        face([P(i, depth + 0.6, hb(i)), P(j, depth + 0.6, hb(j)), P(j, reach, hf(j)), P(i, reach, hf(i))], white, [0, 1, 0]);
        face([P(i, depth + 0.6, hb(i) - 0.45), P(j, depth + 0.6, hb(j) - 0.45), P(j, reach, hf(j) - 0.45), P(i, reach, hf(i) - 0.45)], under, [0, -1, 0]);
        face([P(i, reach, hf(i) - 0.9), P(j, reach, hf(j) - 0.9), P(j, reach, hf(j)), P(i, reach, hf(i))], white, [-F[i].nx, 0, -F[i].nz]);
      }
      for (let i = 0; i < F.length; i += Math.max(1, Math.round(12 / ((cum[cum.length - 1] / (F.length - 1)) || 6)))) {
        const c = P(i, depth + 0.3, 0), tx = -F[i].nz, tz = F[i].nx;
        const pts = [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]].map(([a, b]) => [c[0] + tx * a + F[i].nx * b, c[2] + tz * a + F[i].nz * b]);
        for (let e = 0; e < 4; e++) { const [ax, az] = pts[e], [bx, bz] = pts[(e + 1) % 4]; face([[ax, gy[i], az], [bx, gy[i], bz], [bx, hb(i), bz], [ax, hb(i), az]], steel, [(ax + bx) / 2 - c[0], 0, (az + bz) / 2 - c[2]]); }
      }
    }
    // seats: along each row, from the front line's arc length, skipping the aisles
    let sec = null, secStart = -Infinity, nSeats = 0;
    const flush = () => { if (sec && sec.m.length) seatGroups.push(sec); sec = null; };
    const perRow = Math.floor(len / SEAT_W);
    for (let c = 0; c < perRow; c++) {
      const at = (c + 0.5) * SEAT_W, f = at / len;
      if (aisles.some((a) => Math.abs(a * len - at) < AISLE_W / 2 + SEAT_W / 2)) continue;
      if (at - secStart > SECTION) { flush(); sec = { m: [], c: [], cx: 0, cz: 0, cy: 0 }; secStart = at; }
      // position on the front line
      let i = 0; while (i < F.length - 2 && cum[i + 1] < at) i++;
      const t = Math.min(1, (at - cum[i]) / (cum[i + 1] - cum[i] || 1));
      const fx = F[i].x + (F[i + 1].x - F[i].x) * t, fz = F[i].z + (F[i + 1].z - F[i].z) * t;
      let nx = F[i].nx + (F[i + 1].nx - F[i].nx) * t, nz = F[i].nz + (F[i + 1].nz - F[i].nz) * t; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      const g0 = gy[i] + (gy[i + 1] - gy[i]) * t;
      q.setFromAxisAngle(Y, Math.atan2(-nx, -nz));
      for (let k = 0; k < rows; k++) {
        const b = WALK + k * ROW_D + ROW_D * 0.62, y = g0 + FRONT_H + rise * (k + 1);
        pv.set(fx + nx * b, y, fz + nz * b);
        m4.compose(pv, q, sc);
        sec.m.push(m4.clone());
        // faded plastic: a little variation, and now and then a seat from another batch
        const u = rr();
        const sc2 = u < 0.03 ? seatC.clone().offsetHSL(0, -0.15, 0.12) : seatC.clone().multiplyScalar(0.9 + rr() * 0.18);
        sec.c.push(sc2);
        sec.cx += pv.x; sec.cy += pv.y; sec.cz += pv.z;
        nSeats++;
      }
    }
    flush();
    seatTotal += nSeats;
    const mi = Math.floor(F.length / 2);
    report.push({ n: st.name, kind: st.kind, rows, seats: nSeats, len: Math.round(len), roof: !!st.roof,
      c: [+F[mi].x.toFixed(1), +(gy[mi] + FRONT_H).toFixed(1), +F[mi].z.toFixed(1)], nrm: [+F[mi].nx.toFixed(3), +F[mi].nz.toFixed(3)] });
  }

  const group = new THREE.Group();
  group.name = "grandstands";
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("seatTint", new THREE.Float32BufferAttribute(tint, 4));
  g.computeBoundingSphere();
  const structure = new THREE.Mesh(g, standMaterial({ side: THREE.DoubleSide }));
  structure.castShadow = true; structure.receiveShadow = true;
  group.add(structure);
  if (spos.length) {
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(spos, 3));
    sg.setAttribute("normal", new THREE.Float32BufferAttribute(snor, 3));
    sg.setAttribute("uv", new THREE.Float32BufferAttribute(suv, 2));
    sg.computeBoundingSphere();
    const scaffold = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x9aa1a8, map: latticeTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 }));
    scaffold.castShadow = true; scaffold.receiveShadow = true;
    group.add(scaffold);
  }
  const seatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.02 });
  const seats = new THREE.Group(); seats.name = "seats";
  for (const s of seatGroups) {
    const im = new THREE.InstancedMesh(seatGeometry(), seatMat, s.m.length);
    s.m.forEach((m, k) => { im.setMatrixAt(k, m); im.setColorAt(k, s.c[k]); });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.receiveShadow = true; im.castShadow = false;
    im.userData.centre = new THREE.Vector3(s.cx / s.m.length, s.cy / s.m.length, s.cz / s.m.length);
    im.visible = false;
    seats.add(im);
  }
  group.add(seats);
  // footprints, so trees and rocks keep off the stands and buildings don't stand in them
  const footprints = alive.map((st) => {
    const d = WALK + st.rows * ROW_D + 0.6;
    return st.front.map((p) => [p.x - p.nx * 0.5, p.z - p.nz * 0.5]).concat(st.front.slice().reverse().map((p) => [p.x + p.nx * d, p.z + p.nz * d]));
  });
  return {
    group, footprints, structure,
    // per frame: seats only near the camera (beyond that the treads carry their colour)
    update(cam) {
      for (const im of seats.children) {
        const c = im.userData.centre;
        im.visible = Math.hypot(c.x - cam.x, c.y - cam.y, c.z - cam.z) < SEATS_NEAR;
      }
    },
    info: { dead: stands.filter((s) => s.dead).map((s) => `${s.name}: ${s.dead}`), stands: alive.length, mapped: alive.filter((s) => s.kind === "mapped").length, seats: seatTotal, target: scene.stands?.seats || null, capacity: scene.stands?.total || null, est: !!scene.stands?.est, list: report },
  };
}

// Shortest distance from a front line (list of {x, z}) to the segment A–B.
function segDist(front, A, B) {
  let best = Infinity;
  const dx = B[0] - A[0], dz = B[1] - A[1], L = dx * dx + dz * dz || 1;
  for (const p of front) {
    const t = Math.max(0, Math.min(1, ((p.x - A[0]) * dx + (p.z - A[1]) * dz) / L));
    best = Math.min(best, Math.hypot(A[0] + dx * t - p.x, A[1] + dz * t - p.z));
  }
  return best;
}
