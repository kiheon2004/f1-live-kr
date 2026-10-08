// Teams at their garages, from the session's own data.
//
// Where each team works isn't in the timing feed, but the cars' positions show it: in a race a car's pit stop
// (standing 1.5–8 s in the pit lane) is at its team's box, right in front of the team's garages (both drivers use the
// same box); in practice and qualifying a car standing a long while in the pit lane, at the same spot again and
// again, is at its own garage. (Measured at Silverstone 2025: the race's stops group by team, ~28 m apart, in the
// previous season's constructors' order; qualifying gives each driver's own garage.) So the garage allocation comes
// from the session itself – never from the standings or the order of the driver list – and a team without such data
// gets no garage: those stay neutral.
//
// The pit building's garages (facilities.js: userData.garages – slots with their position, direction, size, and
// project(x, z) → { u along the garages, off in front of them }) carry the layer built here: team-coloured back
// panels, a sign with the team's name over its garages, each driver's board, and equipment inside (tyre stacks,
// tool cabinets, a jack) – all inside the garages, nothing in the pit lane.
import * as THREE from "./vendor/three.module.js";

const STOP_MIN = 1500, STOP_MAX = 8000, LONG = 20000, STILL = 0.8;

// Standstills of every car in front of the garages. cars: { num: { t, x, y, n } } (F1 decimetres, as CarTracks);
// toScene([X, Y] metres) → [x, z]; project(x, z) → { u, off } for the pit building. Only points 0–16 m in front of the
// garages and along them count (the pit lane). Returns { num: { stops: [{ u, t }], long: [{ u, t }] } } (t: when the
// standstill began – the same one seen twice, as a live feed is looked at again, is one).
// pitIn: { num: [ms the car entered the pit lane] } (TimingData's InPit) – when given, a short standstill counts as a
// pit stop only within 60 s of entering (a queue at the pit exit before the start, or one held up there, doesn't).
export function standstills(cars, toScene, project, span, pitIn = null) {
  const out = {};
  for (const [num, c] of Object.entries(cars || {})) {
    const n = c.n ?? c.t.length; if (!n) continue;
    const res = { stops: [], long: [] };
    let k = 0;
    while (k < n) {
      let e = k;
      const x0 = c.x[k], y0 = c.y[k];
      while (e + 1 < n && Math.hypot(c.x[e + 1] - x0, c.y[e + 1] - y0) < STILL * 10) e++;
      const dur = c.t[e] - c.t[k];
      if (dur >= STOP_MIN) {
        const [x, z] = toScene([x0 / 10, y0 / 10]), p = project(x, z);
        if (p.off > -2 && p.off < 16 && p.u >= span[0] - 5 && p.u <= span[1] + 5) {
          const t0 = c.t[k], afterEntry = !pitIn || (pitIn[num] || []).some((ms) => t0 >= ms - 2000 && t0 <= ms + 60000);
          if (dur <= STOP_MAX) { if (afterEntry) res.stops.push({ u: p.u, t: t0 }); } else if (dur >= LONG) res.long.push({ u: p.u, t: t0 });
        }
      }
      k = e + 1;
    }
    if (res.stops.length || res.long.length) out[num] = res;
  }
  return out;
}

const median = (a) => { const b = a.slice().sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[n >> 1] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; };
// the biggest group of values within `tol` of each other (repeated visits to one place), or null if seen < `min` times
function mode(vals, tol, min) {
  let best = null;
  for (const v of vals) { const g = vals.filter((w) => Math.abs(w - v) <= tol); if (g.length >= min && (!best || g.length > best.length)) best = g; }
  return best ? median(best) : null;
}

// Standstills gathered over time (a live feed keeps only the last minutes of positions): merged, each once.
export function mergeStandstills(into, add) {
  for (const [num, s] of Object.entries(add)) {
    const m = into[num] || (into[num] = { stops: [], long: [] });
    for (const kind of ["stops", "long"]) for (const x of s[kind]) if (!m[kind].some((y) => Math.abs(y.t - x.t) < 1000)) m[kind].push(x);
  }
  return into;
}

// Each driver's work position (u) and how it's known. In a race both drivers stop at the team's one box, so the stops
// are pooled per team and the place most of them agree on (within 4 m) is the box – one odd stop (held up in the
// pit lane, a queue at its exit) doesn't move it; a driver of that team without a stop of their own works there too.
// Without stops (practice, qualifying) a driver's own garage is where they stood a long while twice or more.
// drivers: DriverList (for the teams). Returns { num: { u, from: "box" | "garage" } }.
export function workPositions(still, drivers = {}) {
  const out = {}, team = (num) => drivers[num]?.TeamName || "#" + num, boxes = new Map();
  for (const [num, s] of Object.entries(still)) { const t = team(num); if (!boxes.has(t)) boxes.set(t, []); boxes.get(t).push(...s.stops.map((x) => x.u)); }
  for (const [t, us] of boxes) boxes.set(t, mode(us, 4, us.length >= 3 ? 2 : 1));
  const nums = new Set([...Object.keys(still), ...Object.keys(drivers)]);
  for (const num of nums) {
    const box = boxes.get(team(num));
    if (box != null && (still[num] || drivers[num])) { out[num] = { u: box, from: "box" }; continue; }
    const g = still[num] ? mode(still[num].long.map((x) => x.u), 4, 2) : null;
    if (g != null) out[num] = { u: g, from: "garage" };
  }
  return out;
}

// Garages per team: each team's centre is where its drivers work; its garages are the slots within half the way to
// the next team (at most 2.5 garages either side). drivers: DriverList ({ num: { TeamName, TeamColour, Tla, … } }).
// Returns [{ team, colour, centre, slots: [k], drivers: [{ num, tla, u, from }] }], sorted along the garages.
export function allocate(slots, pitch, drivers, positions) {
  const teams = new Map();
  for (const [num, p] of Object.entries(positions)) {
    const d = drivers?.[num]; if (!d?.TeamName) continue;
    if (!teams.has(d.TeamName)) teams.set(d.TeamName, { team: d.TeamName, colour: /^[0-9a-f]{6}$/i.test(d.TeamColour || "") ? "#" + d.TeamColour : "#9aa0a6", drivers: [] });
    teams.get(d.TeamName).drivers.push({ num, tla: d.Tla || num, u: p.u, from: p.from });
  }
  const list = [...teams.values()].map((t) => ({ ...t, centre: median(t.drivers.map((d) => d.u)) })).sort((a, b) => a.centre - b.centre);
  const used = new Set();
  for (let i = 0; i < list.length; i++) {
    const t = list[i], prev = list[i - 1], next = list[i + 1];
    const lo = Math.max(t.centre - pitch * 2.5, prev ? (prev.centre + t.centre) / 2 : -Infinity);
    const hi = Math.min(t.centre + pitch * 2.5, next ? (next.centre + t.centre) / 2 : Infinity);
    t.slots = slots.filter((s) => s.uc >= lo && s.uc < hi && !used.has(s.k)).map((s) => s.k);
    t.slots.forEach((k) => used.add(k));
    t.drivers.sort((a, b) => a.u - b.u || a.num.localeCompare(b.num));
  }
  return list.filter((t) => t.slots.length);
}

// ---------- the layer ----------
// Shared geometry for the equipment (made once; never freed with a layer)
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const mark = (g) => { g.userData.shared = true; return g; };
  const merge = (parts) => {
    // a simple merge of non-indexed geometries
    const pos = [], nor = [];
    for (const g0 of parts) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); return g;
  };
  // a stack of four tyres (~0.72 m across, 0.38 m wide, 2026 sizes) standing on the floor
  const tyre = (y) => { const c = new THREE.CylinderGeometry(0.36, 0.36, 0.36, 18, 1); c.translate(0, y, 0); return c; };
  const tyres = merge([0, 1, 2, 3].map((i) => tyre(0.19 + i * 0.38)));
  // its blanket's band round the middle of each tyre
  const band = (y) => { const c = new THREE.CylinderGeometry(0.368, 0.368, 0.16, 18, 1, true); c.translate(0, y, 0); return c; };
  const blankets = merge([0, 1, 2, 3].map((i) => band(0.19 + i * 0.38)));
  // a tool cabinet (on castors) and a pit jack
  const cabinet = new THREE.BoxGeometry(1.5, 1.05, 0.6); cabinet.translate(0, 0.6, 0);
  const jackParts = [new THREE.BoxGeometry(0.5, 0.18, 1.2), new THREE.BoxGeometry(0.08, 0.08, 1.4)]; jackParts[0].translate(0, 0.12, 0); jackParts[1].rotateX(-0.6); jackParts[1].translate(0, 0.62, -1.0);
  const jack = merge(jackParts);
  const sign = new THREE.PlaneGeometry(1, 1);
  SHARED = { tyres: mark(tyres), blankets: mark(blankets), cabinet: mark(cabinet), jack: mark(jack), sign: mark(sign),
    rubber: Object.assign(new THREE.MeshStandardMaterial({ color: "#1a1b1d", roughness: 0.85 }), { userData: { shared: true } }),
    grey: Object.assign(new THREE.MeshStandardMaterial({ color: "#7a8086", roughness: 0.5, metalness: 0.4 }), { userData: { shared: true } }) };
  return SHARED;
}

// The labels of one layer in one texture: a row per team (its name on its colour) and per driver (code and number).
function atlas(rows) {
  const W = 512, R = 64, cv = document.createElement("canvas"); cv.width = W; cv.height = R * rows.length;
  const g = cv.getContext("2d");
  rows.forEach((r, i) => {
    g.fillStyle = r.bg; g.fillRect(0, i * R, W, R);
    g.fillStyle = r.fg; g.font = `700 ${r.size || 40}px Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(r.text, W / 2, i * R + R / 2 + 2);
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, uv: (i) => [0, 1 - (i + 1) / rows.length, 1, 1 - i / rows.length] };
}
const textOn = (hex) => { const n = parseInt(hex.slice(1), 16), l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); return l > 150 ? "#111111" : "#ffffff"; };

// The layer for one allocation: returns a THREE.Group owning its geometry, materials and label texture.
export function teamLayer(garages, teams, drivers) {
  const S = shared(), group = new THREE.Group(); group.name = "pitTeams";
  if (!teams.length) return group;
  const bySlot = new Map(garages.slots.map((s) => [s.k, s]));
  // frame of a slot: a point d m inside from the front, w m along from the opening's centre, y over the floor
  const at = (s, d, w, y) => new THREE.Vector3(s.front[0] + s.inward[0] * d + s.along[0] * w, s.floor + y, s.front[1] + s.inward[1] * d + s.along[1] * w);
  const yawIn = (s) => Math.atan2(-s.inward[0], -s.inward[1]);   // a plane facing out of the garage (to the pit lane)
  // labels
  const rows = [];
  for (const t of teams) { t.row = rows.length; rows.push({ text: t.team.toUpperCase(), bg: t.colour, fg: textOn(t.colour), size: 34 }); }
  for (const t of teams) for (const d of t.drivers) { d.row = rows.length; const dl = drivers?.[d.num]; rows.push({ text: `${d.tla}  ${dl?.RacingNumber || d.num}`, bg: "#111316", fg: "#ffffff", size: 40 }); }
  const lab = atlas(rows);
  const labelMat = new THREE.MeshStandardMaterial({ map: lab.tex, roughness: 0.6, emissive: "#ffffff", emissiveMap: lab.tex, emissiveIntensity: 0.25 });
  labelMat.userData.ownedTextures = [lab.tex];
  // quads (panels and labels) merged per material
  const panels = { pos: [], col: [], nor: [] }, labels = { pos: [], uv: [], nor: [] };
  const quad = (store, c, ax, ay, n, uv, colour) => {
    // (wound to face n: a label then reads the right way round from the pit lane)
    if (new THREE.Vector3().crossVectors(ax, ay).dot(n) < 0) ax = ax.clone().negate();
    const P = [c.clone().addScaledVector(ax, -0.5).addScaledVector(ay, -0.5), c.clone().addScaledVector(ax, 0.5).addScaledVector(ay, -0.5), c.clone().addScaledVector(ax, 0.5).addScaledVector(ay, 0.5), c.clone().addScaledVector(ax, -0.5).addScaledVector(ay, 0.5)];
    const UV = uv ? [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]] : null;
    for (const k of [0, 1, 2, 0, 2, 3]) { store.pos.push(P[k].x, P[k].y, P[k].z); store.nor.push(n.x, n.y, n.z); if (UV) store.uv.push(...UV[k]); if (colour) store.col.push(colour.r, colour.g, colour.b); }
  };
  const inst = { tyres: [], cabinet: [], jack: [] };
  const col = new THREE.Color();
  for (const t of teams) {
    col.set(t.colour);
    const ss = t.slots.map((k) => bySlot.get(k)).filter(Boolean).sort((a, b) => a.uc - b.uc);
    for (const s of ss) {
      const along = new THREE.Vector3(s.along[0], 0, s.along[1]), up = new THREE.Vector3(0, 1, 0), out = new THREE.Vector3(-s.inward[0], 0, -s.inward[1]);
      // the team's colour on the back wall (lower two thirds) and a stripe along the ceiling's edge
      quad(panels, at(s, s.depth - 0.03, 0, s.ceil * 0.36), along.clone().multiplyScalar(s.width - 0.2), up.clone().multiplyScalar(s.ceil * 0.66), out, null, col);
      // the side walls panelled in the team's colour up to 2.4 m (teams line their garages), a dark skirting under it
      const inw = new THREE.Vector3(s.inward[0], 0, s.inward[1]), dark = col.clone().multiplyScalar(0.35);
      for (const side of [-1, 1]) {
        const n = along.clone().multiplyScalar(-side), w = side * (s.width / 2 - 0.03), len = s.depth - 0.6;
        quad(panels, at(s, 0.3 + len / 2, w, 1.35), inw.clone().multiplyScalar(len), up.clone().multiplyScalar(2.1), n, null, col);
        quad(panels, at(s, 0.3 + len / 2, w, 0.15), inw.clone().multiplyScalar(len), up.clone().multiplyScalar(0.3), n, null, dark);
      }
      // a light rig hanging under the ceiling across the garage
      quad(panels, at(s, s.depth * 0.55, 0, s.ceil - 0.6), along.clone().multiplyScalar(s.width - 0.6), inw.clone().multiplyScalar(0.35), new THREE.Vector3(0, -1, 0), null, new THREE.Color("#2b2f33"));
      // equipment: tyre stacks along both side walls, a cabinet at the back, the jack by the door
      const tc = col.clone();
      for (const side of [-1, 1]) for (const d of [2.0, 3.0, 4.0]) if (d < s.depth - 1.2) inst.tyres.push([at(s, d, side * (s.width / 2 - 0.55), 0), 0, tc]);
      inst.cabinet.push([at(s, s.depth - 0.5, -s.width * 0.18, 0), yawIn(s), tc]);
      inst.cabinet.push([at(s, s.depth - 0.5, s.width * 0.18, 0), yawIn(s), tc]);
      inst.jack.push([at(s, 1.4, s.width * 0.25, 0), yawIn(s), null]);
    }
    // the team's name over its garages (on the front, just under the band above the openings)
    const a = ss[0], b = ss[ss.length - 1], mid = at(a, -0.06, 0, 0).add(at(b, -0.06, 0, 0)).multiplyScalar(0.5);
    const along = new THREE.Vector3(a.along[0], 0, a.along[1]), out = new THREE.Vector3(-a.inward[0], 0, -a.inward[1]);
    const span = Math.min(14, (b.uc - a.uc) + a.width * 0.8);
    mid.y = Math.max(a.floor, b.floor) + a.height + 0.28;
    // (the band in the team's colour over all its garages; the name on it at the atlas row's own 8:1 proportions)
    quad(panels, mid.clone().addScaledVector(out, -0.01), along.clone().multiplyScalar(span), new THREE.Vector3(0, 0.6, 0), out, null, col);
    const lw = Math.min(span, 4.8);
    quad(labels, mid, along.clone().multiplyScalar(lw), new THREE.Vector3(0, lw / 8, 0), out, lab.uv(t.row));
    // each driver's board, hanging inside at the front of the garage nearest where they work
    t.drivers.forEach((d, i) => {
      const s = ss.reduce((p, q) => (Math.abs(q.uc - d.u) < Math.abs(p.uc - d.u) ? q : p));
      const shift = t.drivers.length > 1 && t.drivers.every((x) => x.from === "box") ? (i - (t.drivers.length - 1) / 2) * 1.9 : 0;
      quad(labels, at(s, 0.9, shift, s.height - 0.55), along.clone().multiplyScalar(1.76), new THREE.Vector3(0, 0.22, 0), out, lab.uv(d.row));
    });
  }
  const mesh = (store, mat, name) => {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(store.pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(store.nor, 3));
    if (store.uv?.length) g.setAttribute("uv", new THREE.Float32BufferAttribute(store.uv, 2));
    if (store.col?.length) g.setAttribute("color", new THREE.Float32BufferAttribute(store.col, 3));
    const m = new THREE.Mesh(g, mat); m.name = name; group.add(m);
  };
  if (panels.pos.length) mesh(panels, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide }), "teamPanels");
  if (labels.pos.length) mesh(labels, labelMat, "teamLabels");
  // instanced equipment
  const instanced = (geo, mat, list, name, coloured) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    const grey = new THREE.Color("#9aa0a6");
    list.forEach(([p, yaw, c], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); m4.compose(p, q, sc); im.setMatrixAt(i, m4); if (coloured) im.setColorAt(i, c || grey); });
    im.computeBoundingSphere();
    im.name = name; group.add(im);
  };
  instanced(S.tyres, S.rubber, inst.tyres, "tyres");
  instanced(S.blankets, new THREE.MeshStandardMaterial({ roughness: 0.8 }), inst.tyres, "blankets", true);
  instanced(S.cabinet, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 }), inst.cabinet, "cabinets", true);
  instanced(S.jack, S.grey, inst.jack, "jacks");
  return group;
}

// A key for an allocation (to rebuild only when it changes)
export const allocationKey = (teams) => teams.map((t) => `${t.team}:${t.colour}:${t.slots.join(",")}:${t.drivers.map((d) => `${d.num}@${Math.round(d.u)}`).join("+")}`).join("|");
