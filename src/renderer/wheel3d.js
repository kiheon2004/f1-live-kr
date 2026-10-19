// The steering wheel up close (v0.40; v0.42 real layouts): built from a wheel spec – the team's where a source shows its
// wheel (TEAM_WHEELS below, carshapes.js `wheel`, docs/research/wheels40.md, wheels42.md), else the era's neutral one – as
// the parts a first-person camera half a metre away sees: a thin carbon face plate (its top bar joined to the grips,
// the centre body below the display, open hand holes between the two), rubber grips with finger grooves, the display
// in its raised black pod with the shift lights and the FIA flag lights in it, buttons with coloured caps on dark
// collars, rotaries with their scales, thumb drums, the paddles behind, the electronics housing and the quick-release
// hub behind the face.
// v0.42 (request §8): v0.40's wheel was one 35 mm thick slab out to the grips with the buttons in columns and the rotaries
// in a row laid out from the counts – a "toy plate". Real 2025–26 wheels (Mercedes W16 team graphic and photos, The Race
// 2025-07-15, H; Ferrari 2025 and 2026 drawings, Motorsport.com Italy via italpassion 2026-01-02, M; AMR26 replica
// renders, F1 Authentics 2026-06-26, L) have a ~10–15 mm face plate (the replica's side view), the display high on the
// wheel (its middle 36–68 mm above the grips' middle), the top bar 85–110 mm up, the body ending 45–65 mm below with the
// grips hanging free under the top bar, 3 + 3 buttons at the top corners, a column of buttons beside the display, the
// rotaries under it and thumb drums at the top corners. Where a source shows the layout (`layout`), each part is where
// the source has it (measured off the image at its display's 95 mm – positions ±3 mm, sizes ±1 mm); else the parts are
// laid out by that family's rule from the counts (wheelLayout) – the layout is then the app's, not the team's.
// No lettering, labels or emblems are drawn (shapes and colours only).
//
// Frame (the wheel's, as car3d.js cockpit() mounts it): origin at the grips' middle (the wheel's centre for the arms),
// +x the car's left (the driver's left), +y up the wheel's face, −z towards the driver (the face), +z towards the nose
// (paddles, hub). Metres. The grips (WHEEL_NEUTRAL.grip: x, len, r, tilt) are the arms' contract – unchanged in v0.42.
import * as THREE from "./vendor/three.module.js";

// the era's neutral wheel – the FIA-standard Motion Applied display (every team's), a flat-topped carbon plate gently
// arched, 15 shift lights in a row just above the display and 3 + 3 FIA flag lights beside it (every wheel in 2025–26
// photos, research wheels40.md), 8 buttons, 6 rotaries, two thumb drums, four paddles (shift + clutch). Heights: the
// middle of the H/M sources above (display +55 mm, top +100 mm, body −52 mm from the grips' middle); width the Alpine CAD
// replica's 284 mm (M). The family's layout rule, not a team's.
export const WHEEL_NEUTRAL = {
  id: "neutral", w: 0.28, t: 0.012,
  // the outline: top edge style and its highest point, the body's bottom and half width, how far down the top bar
  // joins the grips (below: the grips hang free), bottom open | closed (a lower rim to the grips' ends) | v (pointed)
  top: "arch", topY: 0.1, bottomY: -0.052, bodyHW: 0.086, joinY: 0.05, bottom: "open", hole: null,
  grip: { x: 0.124, len: 0.135, r: 0.0235, tilt: 0.1, grooves: 4 },
  screen: { w: 0.095, h: 0.0534, y: 0.055 },   // (16:9 – the display's picture: wheelscreen.js paints it at that shape)
  // (the lights 3.4 mm across at a 6.1 mm pitch, the row 86 mm long, 7–10 mm over the glass: W16 graphic, McLaren 2026
  // drawing (Motorsport.com 2026-02-16); M)
  leds: { count: 15, where: "above", span: 0.086 },
  flagLights: 3,   // the FIA marshalling lights beside the display, 3 a side (Mercedes' wheel diagram; FIA Technical Regulations C8.12)
  buttons: 8, rotaries: 6, thumb: 2,
  colours: { buttons: ["#2fbf5b", "#e8392f", "#2f7fe0", "#f2c230", "#e9ecef", "#ff7a1a", "#8a56e8", "#1db6c4"] },
  src: "the era's neutral wheel: the 2025–26 family (Motion Applied display, shift lights over it, open grips under a top bar) from the W16 graphic (H), Ferrari drawings (M), AMR26 replica (L); width from the Alpine replica (M) – not a team's",
};

// Layout profiles: each part where the source shows it. Rows: buttons [x, y, cap radius, colour]; rotaries [x, y,
// scale's outer radius, knob colour | null (dark), "fin" (a dark pointer blade) | "flute" (a coloured fluted knob) |
// "disc" (a flat coloured top)]; thumbs [x, y, axis ("x": rolled up/down, "y": rolled sideways), colour]. x + is the
// driver's left. Measured off the images (scale: the display's 95 mm glass): see refs/wheel in the v0.42 work folder.
// Moved from the source where the app's grips (longer than the real rubber: the arms' contract) would swallow a part:
// said per row.
// Mercedes W16 (2025): team graphic "wheel.png" and race photos of Antonelli's and Russell's wheels (The Race 2025-07-15;
// H for places, colours from the graphic – Russell's rotary colours from the photo). The four small black buttons by
// the top corners' inner buttons are the graphic's too (16 in all).
const W16 = {
  top: "pts", topPts: [[0, 0.0836], [0.058, 0.0836], [0.077, 0.0863], [0.119, 0.0889], [0.138, 0.0863], [0.1436, 0.072]],
  bottomY: -0.0486, bodyHW: 0.084, joinY: 0.0, hole: [0.077, 0.103, 0.022, 0.05], screen: { y: 0.0361 },
  layout: {
    buttons: [[0.1, 0.0705, 0.0068, "#f2c230"], [0.0855, 0.0661, 0.0061, "#2e3a8c"], [0.0692, 0.0578, 0.0065, "#1db6c4"], [-0.0695, 0.0578, 0.0065, "#f2c230"], [-0.0855, 0.0661, 0.0061, "#2e3a8c"], [-0.1, 0.0705, 0.0068, "#ff7a1a"],
      [0.0654, 0.0122, 0.0065, "#202226"], [0.0673, -0.0076, 0.0065, "#e8392f"], [0.0692, -0.0277, 0.0061, "#202226"], [-0.065, 0.0122, 0.0065, "#2f7fe0"], [-0.0669, -0.0076, 0.0065, "#202226"], [-0.0688, -0.0277, 0.0061, "#202226"],
      [0.0768, 0.0766, 0.0023, "#202226"], [0.0654, 0.0748, 0.0023, "#202226"], [-0.065, 0.0748, 0.0023, "#202226"], [-0.076, 0.0762, 0.0023, "#202226"]],
    rotaries: [[0.035, -0.0258, 0.0137, "#f2c230", "flute"], [0, -0.0258, 0.0125, "#2f7fe0", "flute"], [-0.0353, -0.0258, 0.0137, "#1db6c4", "flute"]],
    thumbs: [[0.1148, 0.0502, "y", "#e8392f"], [-0.1151, 0.0502, "y", "#2f7fe0"], [0.0635, 0.0331, "x", "#c8962e"], [-0.0657, 0.0331, "x", "#c8962e"], [0.0832, 0.0084, "x", "#b9bec4"], [-0.0809, 0.0103, "x", "#2f9e6a"]],
  },
};
// Ferrari SF-25 (2025): Motorsport.com Italy drawing "Volante Ferrari 2025" (italpassion 2026-01-02, image volant.jpg;
// an illustration made from photos – M), its lit-LED launch photo (italpassion "volant-f1-ferrari.jpg", H for the
// display/LED pod). The big lower section with six rotaries (and a small seventh). The DR button 12 mm in from the
// drawing's 0.112 – there the app's grip, longer than the real rubber, is – and OK / RADIO ~1 mm out from the pod.
const SF25 = {
  top: "pts", topPts: [[0, 0.1104], [0.0497, 0.1085], [0.1037, 0.105], [0.1226, 0.1064], [0.1388, 0.0956], [0.1428, 0.072]],
  bottomY: -0.064, bodyHW: 0.086, joinY: 0.058, screen: { y: 0.068 },
  layout: {
    buttons: [[0.1064, 0.0888, 0.0086, "#2fbf5b"], [0.0875, 0.078, 0.0059, "#f2c230"], [0.0718, 0.0713, 0.0065, "#2fbf5b"], [0.0767, 0.0991, 0.0035, "#f2c230"], [0.088, 0.095, 0.0027, "#1db6c4"], [0.074, 0.0861, 0.0027, "#f2c230"], [0.1, 0.0653, 0.0049, "#c0392b"], [0.0632, 0.0578, 0.0027, "#e8392f"], [0.0648, 0.0429, 0.0065, "#2e3a8c"],
      [-0.1056, 0.0875, 0.0086, "#e9ecef"], [-0.0867, 0.078, 0.0059, "#2f7fe0"], [-0.0718, 0.0713, 0.0065, "#e8392f"], [-0.0767, 0.0991, 0.0035, "#f2c230"], [-0.0875, 0.095, 0.0027, "#1db6c4"], [-0.0732, 0.0861, 0.0027, "#1db6c4"], [-0.1, 0.0653, 0.0041, "#f2c230"], [-0.0624, 0.0578, 0.0027, "#1db6c4"], [-0.0648, 0.0437, 0.0065, "#e8392f"]],
    rotaries: [[0, -0.0003, 0.0194, "#f2c230", "disc"], [0.0402, -0.003, 0.0122, null, "fin"], [-0.0389, -0.003, 0.0122, null, "fin"], [0.0572, -0.0327, 0.013, null, "fin"], [0, -0.0421, 0.0135, null, "fin"], [-0.0562, -0.0327, 0.013, null, "fin"], [-0.0265, -0.0367, 0.0049, null, "fin"]],
    thumbs: [[0.1293, 0.0529, "y", "#d9dcdf"], [-0.1285, 0.0529, "y", "#d9dcdf"], [0.0821, 0.0456, "x", "#d9dcdf"], [-0.0813, 0.0456, "x", "#d9dcdf"], [0.0794, 0.0078, "x", "#d8a640"], [-0.0813, 0.0078, "x", "#d8a640"]],
  },
};
// Ferrari SF-26 (2026): the Motorsport.com Italy drawing of the prototype tested in Abu Dhabi FP1 2025 (same image), the
// P. Filisetti drawing (italpassion "volant-2.jpg") agrees on the layout (M; no race photo of the race wheel found):
// the sculpted top (raised middle over the display, raised outer corners), three big rotaries in a small lower section.
// OK / KO 4 mm out from the drawing's (its pod drawn 1.5 mm narrower than the app's), the top-right white button 1.6 mm
// lower (under the edge).
const SF26 = {
  top: "pts", topPts: [[0, 0.1084], [0.0382, 0.1051], [0.0846, 0.0961], [0.1174, 0.0975], [0.1365, 0.1016], [0.1447, 0.092], [0.1425, 0.072]],
  bottomY: -0.043, bodyHW: 0.087, joinY: 0.062, screen: { y: 0.062 },
  layout: {
    buttons: [[0.1, 0.0824, 0.0055, "#e8392f"], [0.0846, 0.0797, 0.0049, "#2f7fe0"], [0.0669, 0.0743, 0.0066, "#2fbf5b"], [0.065, 0.092, 0.003, "#e8392f"],
      [-0.0704, 0.0743, 0.0066, "#e8392f"], [-0.0874, 0.0797, 0.0049, "#2f7fe0"], [-0.1035, 0.0833, 0.0055, "#f2c230"], [-0.0683, 0.092, 0.003, "#e8392f"], [-0.12, 0.094, 0.0033, "#e9ecef"],
      [0.0642, 0.0366, 0.0055, "#2e3a8c"], [-0.0642, 0.036, 0.0055, "#f2c230"]],
    rotaries: [[0.0464, -0.0131, 0.0213, null, "fin"], [0, -0.0145, 0.0213, "#f2c230", "disc"], [-0.0497, -0.0131, 0.0218, null, "fin"]],
    thumbs: [[0.1174, 0.0661, "y", "#d9dcdf"], [-0.1209, 0.0661, "y", "#d9dcdf"], [0.0819, 0.0442, "x", "#d9dcdf"], [-0.0846, 0.0442, "x", "#d9dcdf"], [0.0792, 0.0046, "x", "#d8a640"], [-0.0814, 0.0046, "x", "#d8a640"]],
  },
};

// Each team's wheel where a source shows it (research ~/projects/f1kr-work/v040/research/wheels40.md|json and v042
// reports/wheel.md, with each item's source and confidence; docs/research/wheels.md): outline (top: arch | ears (raised
// corners) | wave (sculpted) | flat | pts (the source's own edge); bottom: open | closed (a lower rim) | v), counts of
// rotaries and buttons, rotary colours where photos show them, a layout profile where a source shows every part's place.
// What no source shows stays the neutral wheel's. Replica / lineage-only items are L and say so.
export const TEAM_WHEELS = [
  { season: 2025, team: /mercedes/i, wheel: { id: "w16", ...W16, rotaries: 3, buttons: 16, thumb: 6, src: "W16 wheel: team diagram + race photos (The Race 2025-07-15; H): the layout measured off the diagram; Russell's rotary colours (yellow/blue/cyan) from the photo" } },
  // (W17: no close-up of the 2026 wheel found – "hasn't changed dramatically" (PlanetF1); the counts as the W16's, the
  // family layout – not the W16's places: L)
  { season: 2026, team: /mercedes/i, wheel: { id: "w17", top: "ears", topY: 0.089, rotaries: 3, buttons: 12, rotaryColours: ["#f2c230", "#2f7fe0", "#1db6c4"], src: "W17: counts assumed as the W16's (no 2026 close-up found; L) – family layout" } },
  { season: 2025, team: /ferrari/i, wheel: { id: "sf25", ...SF25, rotaries: 7, buttons: 18, thumb: 6, src: "SF-25 wheel: Motorsport.com Italy drawing (M) + launch photo (LED pod, H): the layout measured off the drawing" } },
  { season: 2026, team: /ferrari/i, wheel: { id: "sf26", ...SF26, rotaries: 3, buttons: 11, thumb: 6, src: "SF-26: the Abu Dhabi FP1 2025 prototype drawing (Motorsport.com Italy) and P. Filisetti's drawing agree (M): the layout measured off the first" } },
  { season: 2025, team: /mclaren/i, wheel: { id: "mcl39", top: "ears", topY: 0.1, rotaries: 3, buttons: 12, thumb: 6, rotaryColours: ["#8a56e8", "#2f7fe0", "#e9ecef"], src: "MCL39: replica (M) – 3 rotaries (purple, strategy, white), 6 thumb wheels; family layout" } },
  { season: 2026, team: /mclaren/i, wheel: { id: "mcl40", top: "ears", topY: 0.1, rotaries: 3, buttons: 12, src: "MCL40: the display pod (LED housing over the screen, 3 + 3 lights) from the Motorsport.com 2026-02-16 drawing (M); the rest assumed as the MCL39's (L)" } },
  { season: 2025, team: /red bull racing/i, wheel: { id: "rb21", top: "flat", topY: 0.095, bottom: "closed", rotaries: 5, buttons: 8, rotaryColours: ["#2f7fe0", "#e8392f", "#c9ccd1", "#f2c230", "#8a56e8"], src: "Red Bull: the 2023 wheel's replica only (closed lower rim, 5 rotaries: TYRE blue, STRAT red, ENGINE silver, DISP yellow, MODE purple) – lineage, L" } },
  { season: 2026, team: /red bull racing/i, wheel: { id: "rb22", top: "flat", topY: 0.095, bottom: "closed", rotaries: 5, buttons: 8, rotaryColours: ["#2f7fe0", "#e8392f", "#c9ccd1", "#f2c230", "#8a56e8"], src: "as 2025 (lineage, L)" } },
  { season: 2025, team: /racing bulls|visa|rb f1/i, wheel: { id: "vcarb02", top: "flat", topY: 0.095, bottom: "closed", src: "assumed Red Bull's (L)" } },
  { season: 2026, team: /racing bulls|visa/i, wheel: { id: "vcarb03", top: "flat", topY: 0.095, bottom: "closed", src: "assumed Red Bull's (L)" } },
  // (AMR26: the licensed replica's renders (F1 Authentics, listed 2026-06-26) – render-like and one dial still reading a
  // 2025 label, so L: its outline heights (top +109 mm, body −51 mm, display +66 mm) and counts, not a layout profile)
  { season: 2026, team: /aston martin/i, wheel: { id: "amr26", top: "flat", topY: 0.107, bottomY: -0.051, screen: { y: 0.064 }, rotaries: 5, buttons: 12, thumb: 4, rotaryColours: ["#9bd35a", "#f2d27a", "#2fbf5b", "#e8392f", "#c13fd0"], src: "AMR26: licensed replica (render-like; L) – outline heights and counts; family layout" } },
  { season: 2025, team: /alpine/i, wheel: { id: "a525", top: "flat", topY: 0.112, rotaries: 4, thumb: 4, buttons: 12, src: "Alpine 2025: replica from the team's CAD, 284 × 190 mm overall (the top ~112 mm over the grips' middle), 4 push + 4 thumb rotaries (M); family layout" } },
  { season: 2025, team: /haas/i, wheel: { id: "vf25", top: "ears", rotaries: 6, buttons: 11, src: "Haas: Ferrari-supplied – the SF-25's counts assumed (L); family layout, not the SF-25's places" } },
  { season: 2025, team: /williams/i, wheel: { id: "fw47", top: "arch", bottom: "v", src: "FW47: V-shaped bottom (photos, M)" } },
  { season: 2026, team: /cadillac/i, wheel: { id: "cad26", top: "flat", rotaries: 3, buttons: 12, thumb: 6, src: "Cadillac: a refaced Motion Applied TSW-700 – 12 buttons, 3 rotaries, 6 thumbwheels (maker's spec, M); family layout" } },
];
export function teamWheel(season, teamName) { return TEAM_WHEELS.find((t) => t.season === +season && t.team.test(teamName || ""))?.wheel || null; }
// a team's wheel spec over the neutral one (only what its source shows is set; the rest stays neutral)
export function wheelSpec(teamWheel) {
  if (!teamWheel) return { ...WHEEL_NEUTRAL, h: WHEEL_NEUTRAL.topY - WHEEL_NEUTRAL.bottomY };
  const W = { ...WHEEL_NEUTRAL, ...teamWheel, grip: { ...WHEEL_NEUTRAL.grip, ...(teamWheel.grip || {}) }, screen: { ...WHEEL_NEUTRAL.screen, ...(teamWheel.screen || {}) } };
  // (v0.35–0.39 entries (carshapes.js): { style, ratio (overall width / height, the grips' ends included), leds (a
  // count), rotaries, buttons })
  if (typeof teamWheel.leds === "number") W.leds = { ...WHEEL_NEUTRAL.leds, count: teamWheel.leds };
  else W.leds = teamWheel.leds === null ? null : { ...WHEEL_NEUTRAL.leds, ...(teamWheel.leds || {}) };
  if (teamWheel.ratio && teamWheel.topY == null) W.topY = Math.min(0.115, Math.max(0.085, W.w / teamWheel.ratio - W.grip.len / 2));
  if (teamWheel.style === "sculpted" && !teamWheel.top) { W.top = "wave"; if (teamWheel.topY == null) W.topY = 0.108; }
  W.colours = { ...WHEEL_NEUTRAL.colours, ...(teamWheel.colours || {}) };
  W.id = teamWheel.id || "team";
  // (the display's pod – the light housing over the glass – 7 mm under the top edge's middle)
  if (!teamWheel.screen?.y && !teamWheel.layout) W.screen = { ...W.screen, y: Math.min(W.screen.y, topPoints(W)[0][1] - W.screen.h / 2 - 0.022) };
  W.h = W.topY - W.bottomY;   // (the body's height – the arms' slab check, arms.test.js)
  return W;
}

// ---------- the outline ----------
// the grip's axis: its x at height y (the grip leans out at the top)
const gripX = (G, y) => G.x + y * Math.tan(G.tilt);
// the grip's radius at height y along it (its ends rounded – gripGeometry), 0 past its ends
function gripRadius(G, y) {
  const u = y / Math.cos(G.tilt) / G.len + 0.5; if (u < 0 || u > 1) return 0;
  const e = Math.min(u, 1 - u); return G.r * (e < 0.12 ? Math.sqrt(Math.max(0, 1 - ((0.12 - e) / 0.12) ** 2)) * 0.85 + 0.15 : 1);
}
// the top edge's points (x ≥ 0, the middle first, the outer corner last) per style; "pts": the spec's own
function topPoints(W) {
  if (W.top === "pts" && W.topPts) return W.topPts;
  const T = W.topY, xo = W.grip.x + W.grip.r * 0.85, cy = 0.072;   // (the outer corner just over the grip's top end)
  if (W.top === "flat") return [[0, T], [0.07, T], [0.112, T - 0.002], [0.132, T - 0.008], [xo, cy]];
  if (W.top === "ears") return [[0, T - 0.006], [0.058, T - 0.006], [0.078, T - 0.003], [0.118, T], [0.137, T - 0.003], [xo, cy]];
  if (W.top === "wave") return [[0, T], [0.038, T - 0.003], [0.085, T - 0.012], [0.117, T - 0.011], [0.136, T - 0.007], [0.1447, T - 0.016], [xo, cy]];
  return [[0, T], [0.05, T - 0.002], [0.09, T - 0.006], [0.122, T - 0.012], [0.137, T - 0.02], [xo, cy]];   // arch
}
// The face plate's outline: the top edge, down the grips' axes to joinY (the top bar's hold on the grips), in to the
// body's side, down to its bottom (open – the grips free below; closed – a lower rim out to the grips' ends (Red Bull);
// v – narrowing to a point (Williams 2025)), with hand holes (Mercedes' between the body and the grip; closed bottoms'
// round the hands). Returns the polygon (x, y; counter-clockwise) and the holes' polygons.
export function wheelOutline(W) {
  const G = W.grip, top = topPoints(W), xc = top[top.length - 1][0], yc = top[top.length - 1][1], bw = W.bodyHW;
  const right = [];   // (x ≥ 0 half, from the top's middle round to the bottom's middle)
  for (const [x, y] of top) right.push([x, y]);
  const closed = W.bottom === "closed", gripEnd = -G.len / 2 * Math.cos(G.tilt), yb = closed ? Math.min(W.bottomY, gripEnd - 0.002) : W.bottomY;
  const join = closed ? gripEnd + 0.012 : Math.min(W.joinY, yc - 0.006);
  // down the grip's axis (inside the rubber) to the join
  for (let k = 1; k <= 4; k++) { const y = yc + ((join - yc) * k) / 4; right.push([Math.min(xc, gripX(G, y)), y]); }
  if (closed) {
    // the lower rim: from the grip's lower end across, its corners rounded
    right.push([gripX(G, gripEnd) - 0.006, yb + 0.006], [gripX(G, gripEnd) - 0.016, yb]);
  } else {
    const rj = 0.006;
    right.push([bw + rj, join - 0.002], [bw + 0.0015, join - rj * 0.6], [bw, join - rj - 0.002]);
    if (W.bottom === "v") right.push([bw - 0.004, yb + 0.05], [0.04, yb + 0.006], [0.028, yb]);
    else { const r = 0.016; for (let i = 0; i <= 5; i++) { const a = (i / 5) * (Math.PI / 2); right.push([bw - r + Math.cos(a) * r, yb + r - Math.sin(a) * r]); } }
  }
  right.push([0, yb]);
  // the whole outline: the right half (x < 0 side: the driver's right) and the left mirrored, counter-clockwise from the
  // bottom's middle
  const half = right.map(([x, y]) => [x, y]);
  const pts = [...half.slice().reverse().map(([x, y]) => [-x, y]).slice(0, -1), ...half.slice(0, -1)];
  // (dedupe: the top's middle point is shared)
  const poly = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
  // holes: the spec's [x0, x1, y0, y1] each side; a closed bottom's hand holes between the body and the grips
  let H = W.hole;
  if (!H && closed) H = [bw, gripX(G, 0) - G.r * 0.5, gripEnd + 0.026, Math.min(W.joinY, yc - 0.02)];
  const holes = [];
  if (H) for (const k of [1, -1]) {
    const [x0, x1, y0, y1] = H, r = Math.min(0.008, (x1 - x0) / 2 - 0.001, (y1 - y0) / 2 - 0.001), h = [];
    for (const [cx, cy, a0] of [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]]) for (let i = 0; i <= 3; i++) { const a = a0 + (i / 3) * (Math.PI / 2); h.push([k * (cx + Math.cos(a) * r), cy + Math.sin(a) * r]); }
    holes.push(k > 0 ? h : h.reverse());
  }
  return { poly, holes };
}
// is (x, y) on the plate (inside the outline, not in a hole)?
const inPoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
export function onPlate(O, x, y, r = 0) {
  const ring = r ? [[0, 0], ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [Math.cos((i * Math.PI) / 4) * r, Math.sin((i * Math.PI) / 4) * r])] : [[0, 0]];
  return ring.every(([dx, dy]) => inPoly(O.poly, x + dx, y + dy) && !O.holes.some((h) => inPoly(h, x + dx, y + dy)));
}
// how far a disc (x, y, r) on the face is clear of the grips' rubber (m; < 0: into it) – the grips stand out of the face
// plane on both sides, so any overlap seen from the face is a part through a grip
export function gripClearance(W, x, y, r) {
  const G = W.grip; let best = Infinity;
  for (const k of [1, -1]) for (let i = 0; i <= 60; i++) {
    const yy = (-G.len / 2 + (G.len * i) / 60) * Math.cos(G.tilt), gr = gripRadius(G, yy); if (!gr) continue;
    best = Math.min(best, Math.hypot(x - k * gripX(G, yy), y - yy) - gr - r);
  }
  return best;
}
// where a thumb drum at (x, y) stands: on the face, or – where the grip's rubber is (the drums at the grips' tops: the
// W16's ENTRY / HI SPEED, the Ferraris' ENTRY / HS) – on the grip's front, half in it, as the real ones sit in the
// grip's top moulding. Returns the drum's centre z (−z towards the driver). On the face a drum stands 1.5 mm proud of it
// (the rest in the plate, as the photos' rollers): the gloves' thumbs rest on the face there (arms.js plan).
export function drumZ(W, x, y, face = -W.t / 2) {
  const G = W.grip, gr = Math.max(gripRadius(G, y - 0.008), gripRadius(G, y), gripRadius(G, y + 0.008)); let z = face + 0.0037;   // (the drum's length up the grip)
  if (gr) { const d = Math.abs(Math.abs(x) - gripX(G, y)) * Math.cos(G.tilt); if (d < gr + 0.004) z = Math.min(z, -Math.sqrt(Math.max(0, gr * gr - Math.min(d, gr) ** 2)) * 1.12 - 0.0012); }
  return z;
}
// the display pod's rectangle (x0, x1, y0, y1) – the glass, its side bands with the flag lights and the light housing
// over it (McLaren 2026 drawing: 8.5 mm sides, the housing 15 mm over the glass, 3.5 mm under it; M)
export function podRect(W) { const S = W.screen; return [-S.w / 2 - 0.0085, S.w / 2 + 0.0085, S.y - S.h / 2 - 0.0035, S.y + S.h / 2 + 0.015]; }

// ---------- the layout ----------
// The face's parts: the profile's (a source shows them) or laid out by the family's rule from the counts – top-corner
// buttons (3 a side, as on the W16, SF-25, SF-26, AMR26), a column beside the display, the rotaries under it (one row
// up to three, else two), thumb drums at the top corners then beside the display. Parts the rule can't fit on the plate
// clear of the grips, the display and each other are left off (counted: `dropped`).
export function wheelLayout(W, O = wheelOutline(W)) {
  if (W.layout) return { ...W.layout, from: "profile", dropped: 0 };
  const S = W.screen, pod = podRect(W), out = { buttons: [], rotaries: [], thumbs: [], from: "family", dropped: 0 };
  const nb = typeof W.buttons === "number" ? W.buttons : W.buttons?.length || 0, nr = typeof W.rotaries === "number" ? W.rotaries : W.rotaries?.length || 0, nt = W.thumb || 0;
  const cols = W.colours.buttons, placed = [];
  const fits = (x, y, r) => onPlate(O, x, y, r + 0.001) && gripClearance(W, x, y, r) > 0.001 && !(x + r > pod[0] - 0.002 && x - r < pod[1] + 0.002 && y + r > pod[2] - 0.002 && y - r < pod[3] + 0.002) && placed.every(([px, py, pr]) => Math.hypot(x - px, y - py) > r + pr + 0.002);
  const put = (list, item, r) => { if (fits(item[0], item[1], r)) { list.push(item); placed.push([item[0], item[1], r]); return true; } out.dropped++; return false; };
  // rotaries first (the biggest)
  const two = nr > 3, perRow = two ? Math.ceil(nr / 2) : nr, R = two ? 0.0118 : 0.0135;
  const rowY = two ? [Math.min(pod[2] - R - 0.004, W.bottomY + 0.064), W.bottomY + R + 0.009] : [W.bottomY + R + 0.009];
  for (let i = 0; i < nr; i++) {
    const row = two && i >= perRow ? 1 : 0, ii = row ? i - perRow : i, n = row ? nr - perRow : perRow, pitch = 2 * R + 0.009;
    const x = n === 1 ? 0 : (n - 1) * pitch / 2 - ii * pitch;
    put(out.rotaries, [x, rowY[row], R, W.rotaryColours?.[i] || null, W.rotaryColours?.[i] ? "flute" : "fin"], R);
  }
  // thumb drums: the top corners (above the grips' ends), then beside the display
  // (the first pair on the grips' tops – drumZ – as on the W16, SF-25, SF-26, AMR26: the plate check only)
  for (let i = 0; i < Math.min(2, nt); i++) { const k = i % 2 ? -1 : 1, y = Math.min(0.058, W.topY - 0.03); out.thumbs.push([k * 0.118, y, "y", "#3a3d42"]); placed.push([k * 0.118, y, 0.007]); }
  // buttons: three a side across the top corners, then down the display's sides
  const topRow = [[0.1, -0.022], [0.085, -0.025], [0.069, -0.032]], colX = S.w / 2 + 0.0085 + 0.0115;
  const spots = [...topRow.map(([x, dy]) => [x, W.topY + dy]), ...[0, 1, 2, 3, 4].map((j) => [colX, S.y - 0.022 - j * 0.02])];
  const cand = spots.flatMap(([x, y]) => [[x, y], [-x, y]]);
  let ci = 0;
  for (let i = 0; i < nb; i++) {
    while (ci < cand.length && !fits(cand[ci][0], cand[ci][1], 0.0065)) ci++;
    if (ci >= cand.length) { out.dropped += nb - i; break; }
    const [x, y] = cand[ci++]; out.buttons.push([x, y, 0.0065, cols[i % cols.length]]); placed.push([x, y, 0.0065]);
  }
  // further drums beside the display and the body's lower sides, where they fit
  const dc = [[0.081, S.y - 0.008], [0.079, S.y - 0.05], [0.077, W.bottomY + 0.014]].flatMap(([x, y]) => [[x, y], [-x, y]]);
  let di = 0;
  for (let i = 2; i < nt; i++) {
    while (di < dc.length && !fits(dc[di][0], dc[di][1], 0.0075)) di++;
    if (di >= dc.length) { out.dropped += nt - i; break; }
    const [x, y] = dc[di++]; out.thumbs.push([x, y, "x", "#c8962e"]); placed.push([x, y, 0.0075]);
  }
  return out;
}

// ---------- the parts ----------
// a grip: a rubber tube along the wheel's side, tilted out at the top, its section a rounded ellipse, the back (+z,
// where the fingers wrap) with finger grooves, its ends rounded
function gripGeometry(W, k) {
  const G = W.grip, segs = 30, ring = 16, pos = [], idx = [];   // (v0.42: 30 × 16 – the car's triangle budget; the section a polygon inside its circle: never fuller)
  const ct = Math.cos(G.tilt), st = Math.sin(G.tilt);
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, y0 = (u - 0.5) * G.len;
    // (ends rounded: the radius shrinks over the last 12 % each end)
    const e = Math.min(u, 1 - u), endK = e < 0.12 ? Math.sqrt(Math.max(0, 1 - ((0.12 - e) / 0.12) ** 2)) * 0.85 + 0.15 : 1;
    const groove = u > 0.18 && u < 0.86 ? 0.5 - 0.5 * Math.cos(2 * Math.PI * G.grooves * ((u - 0.18) / 0.68)) : 0;
    const cx = k * (G.x + y0 * st), cy = y0 * ct;
    for (let j = 0; j <= ring; j++) {
      const a = (j / ring) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      // (across x, deep z; the back (+z) half grooved and a touch fuller – the fingers' side)
      const back = Math.max(0, s), rr = G.r * endK * (1 - 0.08 * back * back * groove);   // (never fuller than its radius: the hands' fit is measured against it)
      const lx = c * rr, lz = s * rr * 1.12;
      pos.push(cx + lx * ct, cy - lx * k * st, lz);   // (across: square to the grip's tilted axis, in the wheel's plane)
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < ring; j++) { const a = i * (ring + 1) + j, b = a + ring + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// a cylinder facing the driver (its axis along z) at (x, y), its front face at z = zf, depth d, radius r; ridged:
// that many knurls round it
function knob(x, y, zf, r, d, ridges = 0, seg = 20) {
  const g = new THREE.CylinderGeometry(r, r, d, ridges ? ridges * 2 : seg, 1);
  if (ridges) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const px = p.getX(i), pz = p.getZ(i), a = Math.atan2(pz, px), k = 1 - 0.08 * (Math.round((a / (Math.PI * 2)) * ridges * 2) % 2 === 0 ? 1 : 0); if (Math.hypot(px, pz) > r * 0.5) { p.setX(i, px * k); p.setZ(i, pz * k); } } }
  g.rotateX(Math.PI / 2); g.translate(x, y, zf + d / 2);
  return g;
}
// a button's cap: a short cylinder with a rounded top edge (lathed), facing the driver, its top at zf
function cap(x, y, zf, r, d, seg = 12) {
  const e = Math.min(0.0012, r * 0.25), pts = r < 0.004 ? [new THREE.Vector2(r, 0), new THREE.Vector2(r, d), new THREE.Vector2(0, d)] : [new THREE.Vector2(r, 0), new THREE.Vector2(r, d - e), new THREE.Vector2(r - e, d), new THREE.Vector2(0, d)];
  const g = new THREE.LatheGeometry(pts, seg); g.rotateX(-Math.PI / 2); g.translate(x, y, zf + d);
  return g;
}
// a flat ring (a rotary's scale) in the face plane, its segments coloured (cols), and a white tick per segment
function scaleRing(x, y, z, r0, r1, cols) {
  const n = cols.length * 3, pos = [], col = [];
  const C = cols.map((c) => new THREE.Color(c));
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * 1.25 - (i / n) * Math.PI * 1.5, a1 = Math.PI * 1.25 - ((i + 1) / n) * Math.PI * 1.5, c = C[Math.floor(i / 3)];
    const p = (a, r) => [x + Math.cos(a) * r, y + Math.sin(a) * r, z];
    pos.push(...p(a0, r0), ...p(a0, r1), ...p(a1, r0), ...p(a1, r0), ...p(a0, r1), ...p(a1, r1));   // (v0.42: wound to face the driver (−z) – v0.40's faced the nose and was culled)
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals(); return g;
}
const colourise = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g; };
// a rounded rectangle (x0..x1, y0..y1, corner r) as a shape or path, with optional rectangular holes
function roundRect(P, x0, x1, y0, y1, r) {
  P.moveTo(x0 + r, y0); P.lineTo(x1 - r, y0); P.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false); P.lineTo(x1, y1 - r); P.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  P.lineTo(x0 + r, y1); P.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false); P.lineTo(x0, y0 + r); P.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return P;
}
// a slab of a shape in the face's plane, from z = zBack towards the driver by depth d, its edges rounded (bevel b)
function slab(shape, zBack, d, b, seg = 2, curve = 4) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.0005, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: seg, curveSegments: curve });
  g.translate(0, 0, zBack - d + b);   // (the extrusion spans −b … d − b)
  return g;
}
// The wheel's geometries from a spec: { body (carbon: with UVs in metres for the weave), rubber (grips), bezel (matte
// black: the display's pod, the buttons' collars, the drums' slots), screen (the display's plane, UV 0..1 over it), caps
// (buttons, knobs, scales, drums: vertex colours), metal (paddle pivots, the hub), paddles (carbon), leds: [[x, y, z] ×
// count] (the lights' centres), flags (the flag lights'), led: { r } (a light's radius), grips: [{ c: [x, y, z], up: [x,
// y, z] } × 2] (each grip's centre and its axis up – the hands hold these), face (z of the face), layout (the parts'
// places: wheelLayout) }
// merge(): car3d.js's merge (non-indexed, uv kept when all parts have one); metricUV(g, tile): metre UVs for the weave
export function wheelParts(W, merge, metricUV) {
  const O = wheelOutline(W), t = W.t, face = -t / 2, S = W.screen, G = W.grip;
  // the face plate: the outline with its holes, its edges rounded (a 2.5 mm radius: the plate reads as a moulding, not a
  // cut slab – the replica's side view)
  const shape = new THREE.Shape(O.poly.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of O.holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const body = slab(shape, t / 2, t, 0.0025, 2);
  // behind it: the electronics housing (behind the display and the rotaries; the face's back stays a thin plate out to
  // the grips) and the hub's boss
  const hb = Math.min(W.bodyHW - 0.012, S.w / 2 + 0.01), housing = slab(roundRect(new THREE.Shape(), -hb, hb, W.bottomY + 0.01, S.y + S.h / 2 + 0.008, 0.012), t / 2 + 0.024, 0.026, 0.004, 1, 3);
  // the display's pod: a raised black frame round the glass (the light housing over it, the flag lights in its sides),
  // the glass set 1.5 mm into it
  const pod = podRect(W), podD = 0.006, glass = new THREE.Path(); roundRect(glass, -S.w / 2, S.w / 2, S.y - S.h / 2, S.y + S.h / 2, 0.002);
  const podShape = roundRect(new THREE.Shape(), pod[0], pod[1], pod[2], pod[3], 0.007); podShape.holes.push(glass);
  const bezel = [slab(podShape, face + 0.0005, podD + 0.0005, 0.0012, 1, 3)];
  const backing = new THREE.PlaneGeometry(S.w, S.h); backing.rotateY(Math.PI); backing.translate(0, S.y, face - 0.0008); bezel.push(backing);
  const screen = new THREE.PlaneGeometry(S.w, S.h); screen.rotateY(Math.PI); screen.translate(0, S.y, face - podD + 0.0015);
  // the shift lights: a row in the pod's housing over the glass (light 0 on the driver's left: +x)
  const leds = [], L = W.leds, ledR = 0.0019, zPod = face - podD;
  if (L && L.count > 0) {
    const onDisplay = L.where === "display", span = Math.min(L.span || 0.086, S.w - 0.006);
    const y = onDisplay ? S.y + S.h / 2 - 0.004 : L.where === "top" ? Math.min(pod[3] - 0.004, S.y + S.h / 2 + 0.0085) : S.y + S.h / 2 + 0.0085;
    for (let i = 0; i < L.count; i++) leds.push([L.count === 1 ? 0 : span / 2 - (span * i) / (L.count - 1), y, onDisplay ? face - podD + 0.0012 : zPod - 0.0001]);
  }
  // the FIA flag lights: a short column in each of the pod's side bands (lit by race control's track state – map3d.js)
  const flags = [];
  for (let i = 0; i < (W.flagLights || 0) * 2; i++) { const k = i % 2 ? -1 : 1, j = Math.floor(i / 2); flags.push([k * (S.w / 2 + 0.0045), S.y + S.h / 2 - 0.004 - j * 0.007, zPod - 0.0001]); }
  // the face's parts
  const Lay = wheelLayout(W, O), caps = [];
  for (const [x, y, r, c] of Lay.buttons) {
    const small = r < 0.004, seg = small ? 8 : 10, d = small ? 0.003 : 0.0045;   // (the small ones a simpler shape: ~0.5 % of the screen)
    bezel.push(knob(x, y, face - 0.0025, r + 0.0022, 0.0028, 0, seg));   // (a dark collar: the cap's seat and its shadow on the plate)
    caps.push(colourise(cap(x, y, face - 0.0025 - d, r, d, seg), c));
  }
  const scalePal = ["#e8392f", "#ff7a1a", "#f2c230", "#2fbf5b", "#1db6c4", "#2f7fe0", "#8a56e8", "#e9ecef"];
  Lay.rotaries.forEach(([x, y, R, col, kind], i) => {
    const kr = R * 0.56, small = R < 0.008;
    // the scale: a coloured ring round the knob (the knob's own colour alternating with white where the source shows
    // one; else a spread of colours – the scales' printing is not drawn)
    const pal = small ? null : col && kind !== "disc" ? Array(6).fill(col).map((c, k) => (k % 2 ? "#e9ecef" : c)) : [0, 1, 2, 3, 4, 5].map((k) => scalePal[(i * 2 + k) % scalePal.length]);
    if (pal) caps.push(scaleRing(x, y, face - 0.0004, kr + 0.0015, R, pal));
    bezel.push(knob(x, y, face - 0.002, kr + 0.0012, 0.002, 0, 12));
    if (kind === "flute") {
      // (Mercedes: a coloured fluted knob, its pointer a white tick)
      caps.push(colourise(knob(x, y, face - 0.013, kr, 0.011, 8), col || "#2a2d31"));
      caps.push(colourise(new THREE.BoxGeometry(0.0014, kr * 0.85, 0.001).translate(x, y + kr * 0.45, face - 0.0136), "#f2f3f4"));
    } else if (kind === "disc") {
      caps.push(colourise(knob(x, y, face - 0.009, kr, 0.007, 10), "#1d1f22"), colourise(knob(x, y, face - 0.0094, kr * 0.82, 0.0004, 0, 16), col || "#f2c230"));
    } else {
      // (Ferrari / others: a dark knob with a pointer blade across it)
      caps.push(colourise(knob(x, y, face - 0.008, kr, 0.006, 8), "#1d1f22"));
      caps.push(colourise(new THREE.BoxGeometry(kr * 0.55, kr * 1.9, 0.008).translate(x, y, face - 0.012), "#2a2d31"));
    }
  });
  // thumb drums: ridged rollers half out of the face in a dark slot (axis "x": rolled up/down; "y": sideways)
  for (const [x, y, axis, c] of Lay.thumbs) {
    const along = 0.012, slot = axis === "x" ? new THREE.BoxGeometry(0.0125, along + 0.004, 0.003) : new THREE.BoxGeometry(along + 0.004, 0.0125, 0.003);
    const zd = drumZ(W, x, y, face); slot.translate(x, y, zd); bezel.push(slot);
    const d = new THREE.CylinderGeometry(0.0052, 0.0052, along, 12); { const p = d.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = Math.round((a / (Math.PI * 2)) * 12) % 2 ? 0.88 : 1; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
    if (axis === "x") d.rotateZ(Math.PI / 2);
    d.translate(x, y, zd); caps.push(colourise(d.toNonIndexed(), c));
  }
  // paddles behind the wheel: shift (upper, longer) and clutch (lower), carbon blades reaching out behind the grips
  // (seen through the hand holes – the W16 graphic's "17")
  const paddles = [], metal = [], zb = t / 2;
  for (const k of [1, -1]) {
    const up = new THREE.BoxGeometry(0.085, 0.045, 0.004); up.translate(k * 0.07, 0.03, zb + 0.01); up.rotateZ(k * -0.12); paddles.push(up);
    const lo = new THREE.BoxGeometry(0.075, 0.032, 0.004); lo.translate(k * 0.06, -0.03, zb + 0.02); lo.rotateZ(k * 0.1); paddles.push(lo);
    // (an aluminium pivot block at each paddle's root)
    const pv = new THREE.BoxGeometry(0.014, 0.022, 0.012); pv.translate(k * 0.03, 0.012, zb + 0.008); metal.push(pv);
  }
  // the quick-release hub behind the housing and the column's end (car3d.js: the column at y −0.02)
  const hub = new THREE.CylinderGeometry(0.02, 0.024, 0.03, 20); hub.rotateX(Math.PI / 2); hub.translate(0, -0.016, zb + 0.026 + 0.012); metal.push(hub);
  const grips = [1, -1].map((k) => ({ c: [k * G.x, 0, 0], up: [k * Math.sin(G.tilt), Math.cos(G.tilt), 0] }));
  return {
    body: metricUV(merge([body, housing]), 0.024), rubber: merge([gripGeometry(W, 1), gripGeometry(W, -1)]), bezel: merge(bezel), screen,
    caps: mergeColoured(caps), metal: merge(metal), paddles: metricUV(merge(paddles), 0.024), leds, flags, led: { r: ledR }, grips, face, layout: Lay, outline: O,
  };
}
// coloured geometries (position, normal, color) into one
function mergeColoured(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "color"]) {
    const total = parts.reduce((a, g) => a + g.attributes[name].count * 3, 0), arr = new Float32Array(total); let o = 0;
    for (const g of parts) { arr.set(g.attributes[name].array, o); o += g.attributes[name].count * 3; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  out.computeBoundingSphere();
  return out;
}
// a shift light: a small dome (in front of the pod), facing the driver
export function ledGeometry(r) {
  const g = new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.rotateX(-Math.PI / 2);
  g.scale(1, 1, 0.55);
  return g;
}
