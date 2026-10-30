// Which corners' numbers the 3D view shows, and how strongly (pure; map3d.js draws them).
// v0.39: every corner's number was drawn at all times, the same size near or far and over buildings – a hairpin across
// the circuit floated in front of a car on another straight. Now:
//   - each corner has its place on the lap (s, m) – matched in lap order, so a corner next to a parallel stretch is
//     never put on that stretch (cornerStations);
//   - riding with a car (chase, onboard, 1st person): the corners coming next along its own lap (≤ CORNERS.ahead m,
//     at most CORNERS.next of them ahead – one just passed fades out on top and holds no place), gone once it has
//     passed them; never one on another part of the lap, however near;
//   - from the helicopter: the corners near what it looks at (a radius growing with its height); all of them only if
//     the viewer asks for all;
//   - off: none.
// The alpha eases to its target (CORNERS.fade s) and the ranges have a margin both ways (hysteresis), so a number at
// the edge doesn't blink. What is in front of a number (a building, a tunnel's roof, a hill) hides it: map3d draws
// them with the depth test (except "all", the old map-like view).
export const CORNERS = { ahead: 420, fadeIn: 60, passed: 12, next: 2, heliR: 500, heliK: 1.4, heliMax: 8, fade: 0.35, margin: 40 };
// v0.50 §8-6: from the helicopter at most heliMax numbers – the nearest to where it looks (one already shown keeps its place
// against a newcomer up to `margin` m nearer: no swapping at the edge); a high view over a whole circuit showed every one

// corners [{ n, x, z }] (scene metres), the lap line's points pts [{ x, z }] with cum[i] the distance to point i, lap
// length L → [{ n, s, i }] (s: m along the lap). Each corner: the point of the lap line within `near` m of it that lies
// furthest on from the corner before (cyclic: the first is the nearest) – corners are numbered in lap order.
export function cornerStations(corners, pts, cum, L, near = 45) {
  const out = [], n = pts.length; let prevS = null;
  const order = [...corners].sort((a, b) => a.n - b.n);
  for (const k of order) {
    let best = null;
    const cand = [];
    for (let i = 0; i < n; i++) { const d = Math.hypot(pts[i].x - k.x, pts[i].z - k.z); if (d < near) cand.push({ i, d }); }
    if (!cand.length) { let bi = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = Math.hypot(pts[i].x - k.x, pts[i].z - k.z); if (d < bd) { bd = d; bi = i; } } cand.push({ i: bi, d: bd }); }
    // (several stretches within reach: the one on from the corner before – its forward gap smallest – among those
    // within 15 m of the nearest one's distance; a lone stretch: the nearest point)
    const dMin = Math.min(...cand.map((c) => c.d));
    const ok = cand.filter((c) => c.d <= dMin + 15);
    const gap = (i) => prevS == null ? 0 : ((cum[i] - prevS) % L + L) % L;
    for (const c of ok) { const g = gap(c.i); if (!best || g < best.g - 1 || (Math.abs(g - best.g) <= 1 && c.d < best.d)) best = { ...c, g }; }
    out.push({ n: k.n, s: cum[best.i], i: best.i });
    prevS = cum[best.i];
  }
  return out;
}
// metres from s to a corner at cs along the lap: + ahead, − behind (within half a lap)
export function aheadOf(cs, s, L) { let d = ((cs - s) % L + L) % L; if (d > L / 2) d -= L; return d; }

// The target alpha (0..1) of each station. view: { mode: "near" | "all" | "off", cam: "heli" | "chase" | "onboard" |
// "eye" | "inspect", carS (m, the ridden / followed car's place on the lap; null: none), L, look: { x, z } (where the
// helicopter looks), height (m above it), prev: Map(n → alpha, last frame's – for the margins) }
// stations: [{ n, s, x, z }] → Map(n → target)
export function cornerTargets(stations, view) {
  const out = new Map(), prev = view.prev || new Map();
  if (view.mode === "off") { for (const k of stations) out.set(k.n, 0); return out; }
  if (view.mode === "all") { for (const k of stations) out.set(k.n, 1); return out; }
  if (view.cam === "heli" || view.cam === "inspect" || view.carS == null) {
    const look = view.look || { x: 0, z: 0 }, R = Math.max(CORNERS.heliR, (view.height || 0) * CORNERS.heliK);
    const ranked = stations.map((k) => { const d = Math.hypot(k.x - look.x, k.z - look.z), was = (prev.get(k.n) || 0) > 0.01; return { k, d, was, key: d - (was ? CORNERS.margin : 0) }; })
      .sort((a, b) => a.key - b.key);
    ranked.forEach(({ k, d, was }, i) => {
      const r = was ? R + CORNERS.margin : R;
      out.set(k.n, i < (view.max ?? CORNERS.heliMax) && d <= r ? 1 - smooth01((d - (r - 120)) / 120) : 0);
    });
    return out;
  }
  // riding: the next corners along the car's own lap. The limit (CORNERS.next) counts only the corners still ahead
  // (a ≥ 0); one just passed fades out over CORNERS.passed m on top of them and never holds a place – v0.39 counted
  // every corner within the passed margin, faded or not, so two corners 20–35 m behind (a chicane's) used both places
  // and the next corner 100 m ahead never showed.
  const ahead = stations.map((k) => ({ k, a: aheadOf(k.s, view.carS, view.L) })).filter((o) => o.a > -CORNERS.passed).sort((x, y) => x.a - y.a);
  let shown = 0;
  for (const k of stations) out.set(k.n, 0);
  for (const { k, a } of ahead) {
    if (a < 0) { out.set(k.n, 1 - smooth01(-a / CORNERS.passed)); continue; }   // (passed: fading out over CORNERS.passed m)
    if (shown >= CORNERS.next) break;
    const was = (prev.get(k.n) || 0) > 0.01, far = CORNERS.ahead + (was ? CORNERS.margin : 0);
    if (a > far) break;
    // (fading in over its last CORNERS.fadeIn m of range)
    out.set(k.n, Math.max(0, 1 - smooth01((a - (far - CORNERS.fadeIn)) / CORNERS.fadeIn)));
    shown++;
  }
  return out;
}
const smooth01 = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
// alpha eased toward its target over CORNERS.fade s (dt: the frame's seconds)
export function easeAlpha(a, target, dt) { const k = 1 - Math.exp(-Math.max(0, dt) / CORNERS.fade); return a + (target - a) * k; }
// on-screen size (the sprite's scale) at distance d (m): ~4 m across, kept between 0.026 and 0.05 (the old fixed size
// was 0.032; v0.39's first 0.018 read as a dot on screen)
export const CORNER_SIZE = { m: 4, min: 0.026, max: 0.05 };
export function cornerScale(d, fovDeg) { const h = 2 * Math.max(1, d) * Math.tan((fovDeg * Math.PI) / 360); return Math.max(CORNER_SIZE.min, Math.min(CORNER_SIZE.max, CORNER_SIZE.m / h)); }
