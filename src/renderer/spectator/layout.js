// The 3D spectator HUD's layout (v0.50 §8-1/8-2) – pure: no DOM, no three.js, so node --test runs it.
//
// What the viewer sees over the circuit is a handful of widgets (WIDGETS): the position tower, the session strip, the
// selected driver's card, the camera tools, the pit panel and the small provenance notes. Three presets place them
// (관전 = watch, 분석 = analysis, 최소 HUD = minimal); the viewer may show / hide each, move it, scale it and reset. All of
// that is a UI preference (localStorage "f1kr:spechud", read and written in try/catch) – never engine or session state.
//
// A widget's place is stored against the window edge it sits nearest to (anchor l / c / r × t / c / b plus an offset in
// px), so a tower put at the right edge stays at the right edge when the window grows, and is always clamped back into
// the view (never lost off-screen) – clampRect. Its size is a scale (0.7–1.6), never a free width: the content keeps its
// own layout and the type stays crisp (CSS zoom).
//
// Onboard and 1st person: the view's centre, the two mirrors and the steering wheel with the hands are kept clear –
// map3d measures their screen rectangles from the ridden car's model each half second (keepClearZones) and avoidZones
// moves any widget that would cover one aside (display only: the stored layout is not changed).
//
// Car tags (pickTags): limited by distance, importance and occlusion – the selected, compared and filmed cars always
// (when on screen and not hidden behind a building), then by race position, at most a few per camera; never two tags
// on one spot. The HUD editor draws no tags of its own.

export const PREF_KEY = "f1kr:spechud";
export const PREF_VERSION = 1;
export const MARGIN = 8;                 // px kept between a widget and the view's edge
export const SCALE = { min: 0.7, max: 1.6, step: 0.1 };

// id → name (Korean, shown in the editor) and whether the editor may hide it
export const WIDGETS = {
  strip: { name: "세션 상태", hide: true },
  tower: { name: "순위 타워", hide: true },
  driver: { name: "선택 드라이버", hide: true },
  cam: { name: "카메라 도구", hide: false },   // (the camera tools hold the editor's own button: never hidden)
  pit: { name: "피트 정보", hide: true },
  notes: { name: "자료 출처 메모", hide: true },
};
export const WIDGET_IDS = Object.keys(WIDGETS);

// Presets: per widget { on, ax, ay, dx, dy, scale } – ax: "l" | "c" | "r", ay: "t" | "c" | "b"; dx / dy px in from that
// edge (centre: from the centre). The top centre is the app's 2D / 3D switch, the top right corner its expand button
// (both the timing layout's), the bottom right the map settings button: the presets leave those free.
const W = (on, ax, ay, dx, dy, scale = 1, extra = {}) => ({ on, ax, ay, dx, dy, scale, ...extra });
export const PRESETS = {
  watch: {
    name: "관전",
    widgets: {
      strip: W(true, "l", "t", 10, 10),
      tower: W(true, "r", "t", 10, 54, 1, { cols: "int" }),
      driver: W(true, "c", "b", 0, 12),
      cam: W(true, "l", "b", 10, 12),
      pit: W(true, "l", "b", 10, 58),
      notes: W(true, "l", "b", 10, 150),
    },
  },
  analysis: {
    name: "분석",
    widgets: {
      strip: W(true, "l", "t", 10, 10),
      tower: W(true, "r", "t", 10, 54, 1, { cols: "full" }),
      driver: W(true, "c", "b", 0, 12, 1, { detail: true }),
      cam: W(true, "l", "b", 10, 12),
      pit: W(true, "l", "b", 10, 58),
      notes: W(true, "l", "b", 10, 150),
    },
  },
  minimal: {
    name: "최소 HUD",
    widgets: {
      strip: W(true, "l", "t", 10, 10, 0.9),
      tower: W(false, "r", "t", 10, 54, 1, { cols: "int" }),
      driver: W(true, "c", "b", 0, 12, 0.9),
      cam: W(true, "l", "b", 10, 12, 0.9),
      pit: W(true, "l", "b", 10, 58, 0.9),
      notes: W(false, "l", "b", 10, 150),
    },
  },
};
export const PRESET_IDS = Object.keys(PRESETS);
// the tower's value column (its header button cycles them): interval to the car ahead, gap to the leader, or both with
// tyre and stops
export const TOWER_COLS = ["int", "gap", "full"];
export const nextCols = (c) => TOWER_COLS[(TOWER_COLS.indexOf(c) + 1) % TOWER_COLS.length];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const clone = (o) => JSON.parse(JSON.stringify(o));

export function defaultPrefs(preset = "watch") {
  const p = PRESETS[preset] ? preset : "watch";
  return { v: PREF_VERSION, preset: p, edited: false, follow: true, widgets: clone(PRESETS[p].widgets) };
}

// Whatever was stored, made safe: unknown keys dropped, numbers bounded, a missing widget taken from the preset. A newer
// or broken record falls back to the defaults (never throws).
export function sanitizePrefs(raw) {
  if (!raw || typeof raw !== "object" || raw.v !== PREF_VERSION) return defaultPrefs();
  const out = defaultPrefs(raw.preset);
  out.edited = !!raw.edited; out.follow = raw.follow !== false;
  for (const id of WIDGET_IDS) {
    const r = raw.widgets?.[id], d = out.widgets[id];
    if (!r || typeof r !== "object") continue;
    d.on = WIDGETS[id].hide ? r.on !== false : true;
    if (["l", "c", "r"].includes(r.ax)) d.ax = r.ax;
    if (["t", "c", "b"].includes(r.ay)) d.ay = r.ay;
    d.dx = clamp(num(r.dx, d.dx), -4000, 4000); d.dy = clamp(num(r.dy, d.dy), -4000, 4000);
    d.scale = clamp(Math.round(num(r.scale, d.scale) * 100) / 100, SCALE.min, SCALE.max);
    if (id === "tower" && TOWER_COLS.includes(r.cols)) d.cols = r.cols;
  }
  return out;
}
// storage: anything with getItem / setItem (window.localStorage); a failing or missing one gives the defaults
export function loadPrefs(storage) {
  try { const s = storage?.getItem(PREF_KEY); return s ? sanitizePrefs(JSON.parse(s)) : defaultPrefs(); } catch { return defaultPrefs(); }
}
export function savePrefs(storage, prefs) {
  try { storage?.setItem(PREF_KEY, JSON.stringify(sanitizePrefs(prefs))); return true; } catch { return false; }
}
export function applyPreset(prefs, preset) {
  const d = defaultPrefs(preset); d.follow = prefs?.follow !== false; return d;
}
// the current preset's place for one widget (or all), keeping the rest and the follow switch
export function resetWidgets(prefs, id = null) {
  const out = sanitizePrefs(prefs), d = PRESETS[out.preset].widgets;
  for (const k of id ? [id] : WIDGET_IDS) out.widgets[k] = clone(d[k]);
  out.edited = !!id && WIDGET_IDS.some((k) => JSON.stringify(out.widgets[k]) !== JSON.stringify(d[k]));
  return out;
}
export function setWidget(prefs, id, patch) {
  const out = sanitizePrefs(prefs);
  if (!out.widgets[id]) return out;
  out.widgets[id] = sanitizePrefs({ v: PREF_VERSION, preset: out.preset, widgets: { [id]: { ...out.widgets[id], ...patch } } }).widgets[id];
  out.edited = true;
  return out;
}
export function stepScale(scale, dir) { return clamp(Math.round((scale + dir * SCALE.step) * 10) / 10, SCALE.min, SCALE.max); }

// Where a widget of size w × h (px, as drawn – already scaled) lands in a view of vw × vh: { x, y, w, h } (top left),
// clamped inside the view with MARGIN on every side (a widget bigger than the view sits at its top / left margin).
export function placeRect(spec, w, h, vw, vh, m = MARGIN) {
  const x = spec.ax === "l" ? spec.dx : spec.ax === "r" ? vw - spec.dx - w : (vw - w) / 2 + spec.dx;
  const y = spec.ay === "t" ? spec.dy : spec.ay === "b" ? vh - spec.dy - h : (vh - h) / 2 + spec.dy;
  return clampRect({ x, y, w, h }, vw, vh, m);
}
export function clampRect(r, vw, vh, m = MARGIN) {
  const x = r.w + 2 * m > vw ? m : clamp(r.x, m, vw - m - r.w);
  const y = r.h + 2 * m > vh ? m : clamp(r.y, m, vh - m - r.h);
  return { x: Math.round(x), y: Math.round(y), w: r.w, h: r.h };
}
// A widget dropped at (x, y) (top left, px) – stored against its nearest edges, so it keeps to them on a resize
export function anchorFor(x, y, w, h, vw, vh) {
  const cx = x + w / 2, cy = y + h / 2;
  const ax = cx < vw / 3 ? "l" : cx > (2 * vw) / 3 ? "r" : "c", ay = cy < vh / 3 ? "t" : cy > (2 * vh) / 3 ? "b" : "c";
  const dx = ax === "l" ? x : ax === "r" ? vw - x - w : x - (vw - w) / 2;
  const dy = ay === "t" ? y : ay === "b" ? vh - y - h : y - (vh - h) / 2;
  return { ax, ay, dx: Math.round(dx), dy: Math.round(dy) };
}

export const overlap = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

// Moves rects off the zones (screen areas to keep clear: the timing layout's buttons over the view; in the cockpit cameras
// the mirrors, the steering wheel and the view's centre) and off each other. rects: [{ id, x, y, w, h }] in priority
// order (an earlier one keeps its place); zones: [{ x, y, w, h }]. A rect that covers a zone or an earlier rect goes to
// the nearest free spot – beside / above / below what it covered, or along the view's edges – and, where nothing inside
// the view is free, is marked squeezed (the caller hides it). → [{ id, x, y, w, h, moved, squeezed }]
export function avoidZones(rects, zones, vw, vh, m = MARGIN, gap = 6) {
  const out = [], placed = [];
  const hits = (r) => zones.some((z) => overlap(r, z, gap - 1)) || placed.some((p) => overlap(r, p, 1));
  const inside = (r) => r.x >= m - 0.5 && r.y >= m - 0.5 && r.x + r.w <= vw - m + 0.5 && r.y + r.h <= vh - m + 0.5;
  for (const r0 of rects) {
    const r = { ...r0, moved: false, squeezed: false };
    if (!hits(r)) { out.push(r); placed.push(r); continue; }
    const xs = [r.x, m, vw - m - r.w], ys = [r.y, m, vh - m - r.h];
    for (const z of zones.concat(placed)) { xs.push(z.x - gap - r.w, z.x + z.w + gap); ys.push(z.y - gap - r.h, z.y + z.h + gap); }
    let best = null;
    for (const x of xs) for (const y of ys) {
      const t = { ...r, x: Math.round(x), y: Math.round(y) };
      if (!inside(t) || hits(t)) continue;
      const d = Math.hypot(t.x - r.x, t.y - r.y);
      if (!best || d < best.d) best = { t, d };
    }
    if (best) { best.t.moved = true; out.push(best.t); placed.push(best.t); }
    else { r.squeezed = true; out.push(r); }
  }
  return out;
}

// Tags over the cars. cands: [{ num, x, y (screen px of the tag's foot), behind (bool: behind the camera), dist (m),
// rank (race position, 99 none), sel, cmp, cam (bools), hidden (bool: occluded – a building, the terrain) }], view:
// { mode: "heli" | "chase" | "onboard" | "eye" | "inspect" | "pit", w, h, tagW, tagH }. → Set of nums to draw.
export const TAGS = {
  heli: { max: 12, far: 6000 }, chase: { max: 7, far: 450 }, onboard: { max: 5, far: 300 }, eye: { max: 5, far: 300 },
  pit: { max: 6, far: 250 }, inspect: { max: 12, far: 6000 },
};
export function pickTags(cands, view) {
  const lim = TAGS[view.mode] || TAGS.heli, tw = view.tagW || 64, th = view.tagH || 24, out = new Set(), taken = [];
  const vip = (c) => c.sel || c.cmp || c.cam;
  const list = cands.filter((c) => !c.behind && !c.hidden && c.x > -tw && c.x < view.w + tw && c.y > -th && c.y < view.h + th && (vip(c) || c.dist <= lim.far))
    .sort((a, b) => (vip(b) - vip(a)) || (b.sel - a.sel) || (b.cmp - a.cmp) || (a.rank - b.rank) || (a.dist - b.dist));
  let normal = 0;
  for (const c of list) {
    if (!vip(c) && normal >= lim.max) continue;
    if (taken.some(([x, y]) => Math.abs(x - c.x) < tw && Math.abs(y - c.y) < th)) continue;
    taken.push([c.x, c.y]); out.add(c.num);
    if (!vip(c)) normal++;
  }
  return out;
}

// The car the camera films: following on – the selected driver (or the leader); off – the camera's own pick while that car
// is still in the session, else the selection again.
export function cameraCar({ follow, camPick, focus, leader, exists }) {
  if (!follow && camPick != null && (!exists || exists(camPick))) return camPick;
  return focus || leader || null;
}
