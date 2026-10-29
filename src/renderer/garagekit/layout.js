// Where a garage bay's things go (v0.49 garage kit) – pure: no three.js, no DOM, so it is tested on its own.
//
// Input: a zone – a rectangle of floor with a door on one side – as the circuit garages describe one (the "garage"
// helper's garageZones(G)) or the menu garage builds one:
//   { width, depth, ceilingH, floorY, doorW, doorH, centre, along, inward, kind, front? }
//   width: across the bay (m, between the side walls / pillars), depth: from the door line to the back wall (m),
//   ceilingH: floor to ceiling (m), floorY: the floor's height in the world (m), doorW / doorH: the opening (m),
//   centre: the floor rectangle's centre ([x, z], [x, y, z] or {x, z}), inward: the direction from the door into the
//   bay ([x, z]), along: across the bay ([x, z]; its sign only says which side is "left"), front (optional): the door
//   line's middle instead of centre, kind: "car" (a driver's work space – the default), "eng" / "engineering" (no car:
//   benches, monitors, spares), "bay" (a garage no team is known to use: treated as "eng"), "menu" (car + the room's own
//   walls: the menu garage); "box" (the team's pit box in the lane) is not a room – refused.
//   carSpot (optional, the garage helper's): { d } – the car's origin (the middle between its axles) d m in from the door
//   line, facing out; the plan then puts the car's nose at d − car.front instead of its own default.
//   (feat/v0.49-garage garages.js garageZones gives all of these; its other fields – team, num, slot, w, back, lowest,
//   walk, depthFrom, est – are passed through untouched.)
// The bay's own frame (zoneFrame): x across (−width/2…width/2), y up from the floor, z inward (0 at the door line, depth at
// the back wall). Everything the kit builds is in that frame; the frame's matrix puts it in the world.
//
// The plan keeps the car's work area clear – the car (its real bounds, nose to the door) plus an aisle round it for the
// crew – and lines the side walls and the back with equipment that fits the strips left over; what doesn't fit is
// dropped and listed (never squeezed through a wall). Sizes of the equipment are estimates (reports/kit.md).

// footprints (m): w along the wall, d out from it, h – estimates from garage photos and tool-maker catalogues' common
// sizes (roll cabinets ~1.0–1.4 m wide, ~0.5–0.7 deep), not measured on a team's own kit
export const MODULES = {
  cabinet: { w: 1.25, d: 0.62, h: 1.02 },     // roll cabinet with a worktop
  tallCab: { w: 0.92, d: 0.6, h: 1.95 },      // tall locker
  tyreRack: { w: 1.62, d: 0.82, h: 1.98 },    // two shelves of two wheels standing
  trolley: { w: 0.95, d: 0.95, h: 1.72 },     // a set's stack in blankets on a castor trolley
  guns: { w: 1.1, d: 0.34, h: 1.75 },         // wall board: wheel guns, hoses
  cooling: { w: 0.72, d: 0.66, h: 1.18 },     // a cooling unit on castors, its duct
  wingStand: { w: 1.95, d: 0.72, h: 1.2 },    // A-frame trolley holding a spare front wing
  bins: { w: 1.45, d: 0.5, h: 1.9 },          // shelving with parts bins
  bench: { w: 2.5, d: 0.82, h: 0.95 },        // work bench (monitors above, to ~1.75)
  desk: { w: 2.8, d: 0.9, h: 0.76 },          // engineers' desk with monitors
  jackF: { w: 0.55, d: 1.75, h: 0.42 },       // front jack lying on the floor (long handle)
  jackR: { w: 0.55, d: 1.45, h: 0.42 },
};
// the car's work area: clearances round the car (m) – estimates: the crew works on both sides and at both ends
export const CLEAR = { side: 1.0, front: 1.1, rear: 0.85, gap: 0.12, minStrip: 0.32 };
// the car if the caller gives none: the app's 2025 model's measured box (v0.48 garage audit: 5.68 × 2.03 × 1.17 m)
// (front: the nose's distance ahead of the model's origin, the middle between the axles – the 2025 model's 3.03 m)
export const CAR_DEFAULT = { length: 5.68, width: 2.03, height: 1.17, front: 3.03 };

const v2 = (a) => (Array.isArray(a) ? [a[0], a.length > 2 ? a[2] : a[1]] : a && typeof a === "object" ? [a.x, a.z] : null);
const unit = (a) => { const l = Math.hypot(a[0], a[1]); return l > 1e-9 ? [a[0] / l, a[1] / l] : null; };
const fin = (x) => typeof x === "number" && Number.isFinite(x);

// a zone checked and completed – or { error } (a zone of zero or negative size is refused, not clamped: request §7)
export function normZone(z) {
  if (!z || typeof z !== "object") return { error: "no zone" };
  const width = +z.width, depth = +z.depth, ceilingH = +(z.ceilingH ?? z.ceil ?? 4.6);
  if (z.kind === "box") return { error: "a pit box is not a room" };
  if (!fin(width) || width <= 0 || !fin(depth) || depth <= 0 || !fin(ceilingH) || ceilingH <= 0) return { error: `bad size ${z.width} × ${z.depth} × ${z.ceilingH}` };
  const inward = unit(v2(z.inward) || [0, 1]);
  if (!inward) return { error: "inward has no direction" };
  const x = [inward[1], -inward[0]];                     // up × inward (a right-handed frame: x × y = z)
  const al = z.along ? unit(v2(z.along)) : null, mirrored = !!al && al[0] * x[0] + al[1] * x[1] < 0;
  const c = v2(z.centre ?? z.center ?? [0, 0]) || [0, 0], f = z.front ? v2(z.front) : null;
  const door = f || [c[0] - inward[0] * depth / 2, c[1] - inward[1] * depth / 2];
  return { width, depth, ceilingH, floorY: +(z.floorY ?? 0) || 0, doorW: Math.min(width, +(z.doorW ?? width) || width), doorH: Math.min(ceilingH, +(z.doorH ?? ceilingH - 0.35) || ceilingH),
    inward, x, mirrored, door, kind: ["eng", "engineering", "bay"].includes(z.kind) ? "engineering" : z.kind || "car", id: z.id ?? z.slot ?? null,
    carSpotD: fin(z.carSpot?.d) ? z.carSpot.d : null };
}
// the bay frame as a column-major 4×4 (three.js Matrix4.fromArray / elements): columns x, y, z, position
export function frameMatrix(n) {
  const [xx, xz] = n.x, [ix, iz] = n.inward;
  return [xx, 0, xz, 0, 0, 1, 0, 0, ix, 0, iz, 0, n.door[0], n.floorY, n.door[1], 1];
}
// a point of the bay's frame in the world ([x, y, z])
export const toWorld = (n, p) => [n.door[0] + n.x[0] * p[0] + n.inward[0] * p[2], n.floorY + p[1], n.door[1] + n.x[1] * p[0] + n.inward[1] * p[2]];

// The plan for one bay. style: garagekit/style.js teamGarageStyle (its order, bench); opts: { car: { length, width,
// height }, carZ0 (the nose's distance from the door line; default CLEAR.front), noCar, keep: [{ x0, x1, z0, z1 }]
// (floor kept free – the menu garage's camera stands there: side modules start behind it, a jack moves to the other side) }.
// → { zone, car: { x, z0, z1, width, fits } | null, area: { x0, x1, z0, z1 }, items: [{ kind, x, z, ry, w, d, h, side }],
//     overhead: { kind, z0, z1, y0 (lowest part above the floor), y1 } | null, dropped: [{ kind, why }], strips }
// ry: the module's turn about y (its front, +z in its own frame, faces the car area); x, z: its footprint's centre.
export function planBay(zone, style = {}, opts = {}) {
  const n = zone?.inward && zone.x ? zone : normZone(zone);
  if (n.error) return { error: n.error };
  const W = n.width, D = n.depth, H = n.ceilingH, half = W / 2, dropped = [], items = [];
  const car = { ...CAR_DEFAULT, ...(opts.car || {}) }, noCar = opts.noCar || n.kind === "engineering";
  const z0 = opts.carZ0 ?? (n.carSpotD != null ? Math.max(0, n.carSpotD - car.front) : CLEAR.front);
  // the car's place: centred across the bay, nose z0 from the door line
  let C = null, area;
  if (!noCar) {
    const fits = car.width + 2 * 0.3 <= W && z0 + car.length + 0.3 <= D && car.height + 0.3 <= Math.min(H, n.doorH);
    C = { x: 0, z0, z1: z0 + car.length, width: car.width, length: car.length, height: car.height, fits };
    if (!fits) dropped.push({ kind: "car", why: `bay ${W.toFixed(2)} × ${D.toFixed(2)} m (door ${n.doorH.toFixed(2)} m) is smaller than the car ${car.length.toFixed(2)} × ${car.width.toFixed(2)} m with 0.3 m round it` });
    const ax = Math.min(half, car.width / 2 + CLEAR.side);
    area = { x0: -ax, x1: ax, z0: 0, z1: Math.min(D, C.z1 + CLEAR.rear) };
  } else area = { x0: -Math.min(half, 1.2), x1: Math.min(half, 1.2), z0: 0, z1: Math.min(D, D * 0.45) };
  // (a narrow bay – Monaco's ~4.6 m: the full aisle leaves no strip for anything: the aisle narrows to 0.7 m so the
  // slim wall boards and shelving still fit – a crew member passes sideways; estimate)
  if (C && half - area.x1 < 0.5) area.x1 = Math.min(half, car.width / 2 + 0.7), area.x0 = -area.x1;
  const strip = half - area.x1;                       // each side wall's strip (m)
  const backD = D - area.z1;                          // the strip along the back wall (m)
  const strips = { side: +strip.toFixed(3), back: +backD.toFixed(3) };
  // the back: a bench (or the engineers' desk) and, beside it, what fits
  const benchKind = noCar ? "desk" : style.bench?.kind === "desk" ? "desk" : "bench";
  const backOK = (m) => backD >= m.d + CLEAR.gap && m.h <= H - 0.2;
  let backX0 = -half + CLEAR.gap, backX1 = half - CLEAR.gap;
  if (backD >= CLEAR.minStrip) {
    const m = MODULES[benchKind];
    if (backOK(m) && W - 2 * CLEAR.gap >= m.w) {
      const off = ((style.seed ?? 0) % 3 - 1) * Math.max(0, (W - m.w) / 2 - 0.4) * 0.6;   // the bench left, centre or right
      items.push({ kind: benchKind, x: off, z: D - m.d / 2 - 0.05, ry: Math.PI, w: m.w, d: m.d, h: m.h, side: "back", monitors: style.bench?.monitors ?? 2 });
      // either side of it along the back: bins / a tall locker, if the back strip is deep enough
      for (const [kind, sgn] of [["bins", -1], ["tallCab", 1]]) {
        const k = MODULES[kind], room = sgn < 0 ? off - m.w / 2 - backX0 : backX1 - (off + m.w / 2);
        if (backOK(k) && room >= k.w + CLEAR.gap) items.push({ kind, x: sgn < 0 ? off - m.w / 2 - CLEAR.gap - k.w / 2 : off + m.w / 2 + CLEAR.gap + k.w / 2, z: D - k.d / 2 - 0.05, ry: Math.PI, w: k.w, d: k.d, h: k.h, side: "back" });
      }
    } else dropped.push({ kind: benchKind, why: `back strip ${backD.toFixed(2)} m` });
  } else dropped.push({ kind: benchKind, why: `back strip ${backD.toFixed(2)} m` });
  // the sides: each side's list in the team's order, front (door) to back; a module goes in if its depth fits the strip
  // and its length fits what is left of the wall; else the next one is tried
  const order = style.order || [["cabinet", "tyreRack", "guns", "cooling"], ["trolley", "wingStand", "tallCab", "bins"]];
  const zEnd = backD >= CLEAR.minStrip ? D - Math.max(...items.filter((i) => i.side === "back").map((i) => i.d), 0) - CLEAR.gap : D - CLEAR.gap;
  const keep = opts.keep || [], hits = (r) => keep.find((k) => r.x0 < k.x1 && k.x0 < r.x1 && r.z0 < k.z1 && k.z0 < r.z1);
  [-1, 1].forEach((sgn, si) => {
    let z = Math.max(0.55, Math.min(1.2, D * 0.1));                  // (the opening's first half metre left free)
    const list = order[si] || [];
    if (strip < CLEAR.minStrip) { for (const kind of list) dropped.push({ kind, why: `side strip ${strip.toFixed(2)} m` }); return; }
    for (const kind of list) {
      const m = MODULES[kind];
      if (!m) continue;
      if (m.d + CLEAR.gap > strip) { dropped.push({ kind, why: `${m.d} m deep, strip ${strip.toFixed(2)} m` }); continue; }
      if (m.h > H - 0.15) { dropped.push({ kind, why: `${m.h} m tall, ceiling ${H.toFixed(2)} m` }); continue; }
      const x0 = sgn < 0 ? -half + 0.05 : half - 0.05 - m.d, k = hits({ x0, x1: x0 + m.d, z0: z, z1: z + m.w });
      if (k) z = Math.max(z, k.z1 + CLEAR.gap);
      if (z + m.w > zEnd) { dropped.push({ kind, why: "no wall length left" }); continue; }
      items.push({ kind, x: sgn * (half - m.d / 2 - 0.05), z: z + m.w / 2, ry: -sgn * Math.PI / 2, w: m.w, d: m.d, h: m.h, side: sgn < 0 ? "left" : "right" });
      z += m.w + CLEAR.gap + 0.1;
    }
  });
  // the jacks on the floor beside the car's nose and tail, in the aisle (low: 0.42 m – the crew steps round them)
  if (C?.fits) {
    let s = (style.seed ?? 0) & 1 ? 1 : -1; const ax = C.width / 2 + 0.45, zF = Math.max(MODULES.jackF.d / 2 + 0.05, C.z0 + 0.3);
    if (hits({ x0: s * ax - 0.3, x1: s * ax + 0.3, z0: zF - MODULES.jackF.d / 2, z1: zF + MODULES.jackF.d / 2 })) s = -s;
    if (ax + MODULES.jackF.w / 2 <= half - 0.05) {
      items.push({ kind: "jackF", x: s * ax, z: zF, ry: 0, ...dims("jackF"), side: "aisle" });
      if (C.z1 - 0.2 + MODULES.jackR.d / 2 <= D - 0.05) items.push({ kind: "jackR", x: -s * ax, z: C.z1 - 0.6, ry: Math.PI, ...dims("jackR"), side: "aisle" });
    } else dropped.push({ kind: "jacks", why: "no aisle beside the car" });
  }
  // the overhead boom (gantry) along the car, under the ceiling: its lowest part (hoses' loops, the driver monitor) kept
  // ≥ 2.3 m above the floor – the crew walks under it (estimate); none when the ceiling is too low for it
  let overhead = null;
  if (C?.fits || noCar) {
    const y1 = H - 0.05, y0 = Math.max(2.3, H - 1.35);
    if (y1 - y0 >= 0.45) overhead = { kind: style.boom || "single", z0: C ? Math.max(0.3, C.z0 - 0.2) : D * 0.2, z1: C ? Math.min(D - 0.3, C.z1 - 0.4) : D * 0.6, y0, y1 };
    else dropped.push({ kind: "boom", why: `ceiling ${H.toFixed(2)} m` });
  }
  return { zone: n, car: C, area, items, overhead, dropped, strips };
}
const dims = (k) => ({ w: MODULES[k].w, d: MODULES[k].d, h: MODULES[k].h });

// the plan's footprints as rectangles in the bay frame (x0, x1, z0, z1) – ry a quarter turn swaps w and d
export function footprint(it) {
  const q = Math.abs(Math.round(it.ry / (Math.PI / 2))) % 2 === 1, a = q ? it.d : it.w, b = q ? it.w : it.d;
  return { x0: it.x - a / 2, x1: it.x + a / 2, z0: it.z - b / 2, z1: it.z + b / 2 };
}
// what of the plan overlaps (each pair of items, each item and the car's work area) or leaves the bay – the dev check
export function planClashes(plan) {
  const { zone: n, items, area, car } = plan, out = [], half = n.width / 2, eps = 1e-6;
  const fp = items.map(footprint);
  fp.forEach((r, i) => {
    if (r.x0 < -half - eps || r.x1 > half + eps || r.z0 < -eps || r.z1 > n.depth + eps) out.push({ a: items[i].kind, b: "bay", what: "outside" });
    if (items[i].h > n.ceilingH + eps) out.push({ a: items[i].kind, b: "ceiling", what: "too tall" });
    for (let j = i + 1; j < fp.length; j++) { const q = fp[j]; if (r.x0 < q.x1 - eps && q.x0 < r.x1 - eps && r.z0 < q.z1 - eps && q.z0 < r.z1 - eps) out.push({ a: items[i].kind, b: items[j].kind, what: "overlap" }); }
    if (car && items[i].side !== "aisle" && r.x0 < area.x1 - eps && area.x0 < r.x1 - eps && r.z0 < area.z1 - eps && area.z0 < r.z1 - eps) out.push({ a: items[i].kind, b: "work area", what: "overlap" });
    if (car && items[i].side === "aisle" && r.x0 < car.width / 2 && -car.width / 2 < r.x1 && r.z0 < car.z1 && car.z0 < r.z1) out.push({ a: items[i].kind, b: "car", what: "overlap" });
  });
  return out;
}
