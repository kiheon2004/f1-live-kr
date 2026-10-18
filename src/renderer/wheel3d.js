// The steering wheel up close (v0.40): built from a wheel spec – the team's where a source shows its wheel (carshapes.js
// `wheel`, docs/research/wheels40.md), else the era's neutral one – as the parts a first-person camera half a metre away
// sees: the carbon body (its outline and top edge per team, a bevelled plate with the weave at its real size), rubber
// grips with finger grooves, the display in its bezel, buttons with coloured caps, knurled rotaries with their scales,
// thumb wheels, the paddles behind, the quick-release hub, and the shift lights – their own small lights in a black
// strip (lit each frame by shiftlights.js; car3d.js draws them as an instanced mesh), not the buttons' shape and
// material as in v0.39.
// v0.39's wheel was one rounded box with a flat plane for its screen and every button, rotary and "LED" the same grey
// cylinder. The specs below say what each team's wheel has; positions on the face are laid out from those counts (no
// source gives every button's place: the layout is the app's, the counts, colours and outline the team's where known).
//
// Frame (the wheel's, as car3d.js cockpit() mounts it): origin at the wheel's centre, +x the car's left, +y up the
// wheel's face, −z towards the driver (the face), +z towards the nose (paddles, hub). Metres.
import * as THREE from "./vendor/three.module.js";

// the era's neutral wheel – the FIA-standard Motion Applied display in the middle (every team's), a rectangular body
// with a gently arched top, 15 shift lights in a row just above the display (every wheel in 2025–26 photos, research
// wheels40.md), 3 + 3 FIA flag lights beside it, 4 + 4 buttons beside the display, 6 rotaries below, two
// thumb wheels, four paddles (shift + clutch) – the usual 2022–26 layout in race photos; sizes from the Alpine CAD
// replica's 284 × 190 mm (a replica of the team's wheel; M) and race photos (M)
export const WHEEL_NEUTRAL = {
  id: "neutral", w: 0.28, h: 0.17, t: 0.03, top: "arch", topRise: 0.008, bottomW: 0.17, waist: 0.0,
  grip: { x: 0.124, len: 0.135, r: 0.0235, tilt: 0.1, grooves: 4 },
  screen: { w: 0.095, h: 0.0534, y: 0.02 },   // (16:9 – the display's picture: wheelscreen.js paints it at that shape)
  leds: { count: 15, where: "above", span: 0.1 },
  flagLights: 3,   // the FIA marshalling lights beside the display, 3 a side (Mercedes' wheel diagram; FIA Technical Regulations C8.12)
  buttons: 8, rotaries: 6, thumb: 2,
  colours: { buttons: ["#2fbf5b", "#e8392f", "#2f7fe0", "#f2c230", "#e9ecef", "#ff7a1a", "#8a56e8", "#1db6c4"] },
  src: "the era's neutral wheel: the usual 2022–26 layout in race photos (Motion Applied display, top shift-light strip); sizes from the Alpine replica (M) – not a team's",
};
// Each team's wheel where a source shows it (research ~/projects/f1kr-work/v040/research/wheels40.md|json, with each
// item's source and confidence; docs/research/wheels.md): outline (top: arch | ears (raised corners) | wave (sculpted) |
// flat; bottom: open | closed (a lower rim) | v), counts of rotaries and buttons, rotary colours where photos show them,
// width / height. What no source shows stays the neutral wheel's. Shift lights: 15 above the display on every wheel seen
// (their sequence unknown – shiftlights.js). Replica / lineage-only items are L and say so.
export const TEAM_WHEELS = [
  { season: 2025, team: /mercedes/i, wheel: { id: "w16", top: "ears", h: 0.16, rotaries: 3, buttons: 12, rotaryColours: ["#f2c230", "#2f7fe0", "#1db6c4"], src: "W16 wheel: team diagram + race photos (H): raised top corners, 3 lower rotaries (colours per driver – Russell's yellow/blue/cyan used), 12 buttons" } },
  { season: 2026, team: /mercedes/i, wheel: { id: "w17", top: "ears", h: 0.16, rotaries: 3, buttons: 12, rotaryColours: ["#f2c230", "#2f7fe0", "#1db6c4"], src: "W17: assumed as the W16's (no 2026 close-up found; L)" } },
  { season: 2025, team: /ferrari/i, wheel: { id: "sf25", top: "ears", rotaries: 6, buttons: 11, src: "SF-25 wheel: launch photos (M): 6 lower rotaries in two rows, 11 buttons" } },
  { season: 2025, team: /mclaren/i, wheel: { id: "mcl39", top: "ears", rotaries: 3, buttons: 12, rotaryColours: ["#8a56e8", "#2f7fe0", "#e9ecef"], src: "MCL39: replica (M) – 3 rotaries (purple C, STRAT, white H)" } },
  { season: 2026, team: /mclaren/i, wheel: { id: "mcl40", top: "ears", rotaries: 3, buttons: 12, src: "MCL40: assumed as the MCL39's (L)" } },
  { season: 2025, team: /red bull racing/i, wheel: { id: "rb21", top: "flat", bottom: "closed", rotaries: 5, buttons: 8, rotaryColours: ["#2f7fe0", "#e8392f", "#c9ccd1", "#f2c230", "#e9ecef"], src: "Red Bull: the 2023 wheel's replica only (closed lower rim, 5 rotaries: TYRE blue, STRAT red, ENGINE silver, DISP yellow) – lineage, L" } },
  { season: 2026, team: /red bull racing/i, wheel: { id: "rb22", top: "flat", bottom: "closed", rotaries: 5, buttons: 8, rotaryColours: ["#2f7fe0", "#e8392f", "#c9ccd1", "#f2c230", "#e9ecef"], src: "as 2025 (lineage, L)" } },
  { season: 2025, team: /racing bulls|visa|rb f1/i, wheel: { id: "vcarb02", top: "flat", bottom: "closed", src: "assumed Red Bull's (L)" } },
  { season: 2026, team: /racing bulls|visa/i, wheel: { id: "vcarb03", top: "flat", bottom: "closed", src: "assumed Red Bull's (L)" } },
  { season: 2026, team: /aston martin/i, wheel: { id: "amr26", top: "ears", rotaries: 5, buttons: 12, src: "AMR26: licensed replica (looks like a render; L)" } },
  { season: 2025, team: /alpine/i, wheel: { id: "a525", top: "flat", w: 0.284, h: 0.19, rotaries: 4, thumb: 4, buttons: 12, src: "Alpine 2025: replica from the team's CAD, 284 × 190 mm, 4 push + 4 thumb rotaries (M)" } },
  { season: 2025, team: /haas/i, wheel: { id: "vf25", top: "ears", rotaries: 6, buttons: 11, src: "Haas: Ferrari-supplied – the SF-25's assumed (L)" } },
  { season: 2025, team: /williams/i, wheel: { id: "fw47", top: "arch", bottom: "v", src: "FW47: V-shaped bottom (photos, M)" } },
  { season: 2026, team: /cadillac/i, wheel: { id: "cad26", top: "flat", rotaries: 3, buttons: 12, src: "Cadillac: a refaced Motion Applied wheel – 12 buttons, 3 rotaries (M)" } },
];
export function teamWheel(season, teamName) { return TEAM_WHEELS.find((t) => t.season === +season && t.team.test(teamName || ""))?.wheel || null; }
// a team's wheel spec over the neutral one (only what its source shows is set; the rest stays neutral)
export function wheelSpec(teamWheel) {
  if (!teamWheel) return WHEEL_NEUTRAL;
  const W = { ...WHEEL_NEUTRAL, ...teamWheel, grip: { ...WHEEL_NEUTRAL.grip, ...(teamWheel.grip || {}) }, screen: { ...WHEEL_NEUTRAL.screen, ...(teamWheel.screen || {}) } };
  // (v0.35–0.39 entries: { style, ratio, leds (a count), rotaries, buttons })
  if (typeof teamWheel.leds === "number") W.leds = { ...WHEEL_NEUTRAL.leds, count: teamWheel.leds };
  else W.leds = teamWheel.leds === null ? null : { ...WHEEL_NEUTRAL.leds, ...(teamWheel.leds || {}) };
  if (teamWheel.ratio && !teamWheel.h) W.h = W.w / teamWheel.ratio;
  if (teamWheel.style === "sculpted" && !teamWheel.top) W.top = "wave";
  W.colours = { ...WHEEL_NEUTRAL.colours, ...(teamWheel.colours || {}) };
  W.id = teamWheel.id || "team";
  if (teamWheel.style === "sculpted") { W.top = "wave"; W.leds = W.leds && { ...W.leds, where: "above" }; }
  return W;
}

// ---------- the parts ----------
// the body's outline (x, y) – the bottom narrower, the sides up to the grips, the top edge per spec:
// "flat", "arch" (rising to the middle), "wave" (sculpted: a raised middle with shoulders, Ferrari 2026)
function outline(W) {
  // (bottom: "open" – narrower than the grips, the grips' lower ends free; "closed" – a lower rim joining the grips'
  // ends (Red Bull); "v" – narrowing to a point (Williams 2025))
  const hw = W.w / 2 - W.grip.r * 0.7, hh = W.h / 2, bw = W.bottom === "closed" ? hw - 0.004 : W.bottom === "v" ? 0.035 : W.bottomW / 2, s = new THREE.Shape(), pts = [];
  const topY = (x) => {
    const u = x / hw;
    if (W.top === "arch") return hh + W.topRise * (1 - u * u);
    if (W.top === "wave") return hh + W.topRise * 1.6 * Math.exp(-((u / 0.42) ** 2)) - 0.012 * Math.exp(-(((Math.abs(u) - 0.62) / 0.16) ** 2));
    if (W.top === "ears") return hh - 0.006 + 0.018 * Math.pow(Math.max(0, Math.abs(u) - 0.55) / 0.45, 1.5);   // (raised top corners)
    return hh;
  };
  // bottom (left to right in x: −bw … bw), the lower corners rounded
  const r = 0.02;
  pts.push([-bw + r, -hh], [bw - r, -hh]);
  for (let i = 1; i <= 4; i++) { const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2); pts.push([bw - r + Math.cos(a) * r, -hh + r + Math.sin(a) * r]); }
  // the right side out to the grip's root and up
  if (W.bottom === "closed") pts.push([hw, -hh * 0.6], [hw, hh * 0.55]);
  else pts.push([hw - 0.004, -hh * 0.55], [hw, -hh * 0.1], [hw, hh * 0.55]);
  // top edge from right to left
  for (let i = 0; i <= 24; i++) { const x = hw - (2 * hw * i) / 24; pts.push([x, topY(x) - (Math.abs(x) > hw - 0.012 ? (Math.abs(x) - (hw - 0.012)) * 0.9 : 0)]); }
  if (W.bottom === "closed") pts.push([-hw, hh * 0.55], [-hw, -hh * 0.6]);
  else pts.push([-hw, hh * 0.55], [-hw, -hh * 0.1], [-hw + 0.004, -hh * 0.55]);
  for (let i = 1; i <= 4; i++) { const a = Math.PI + (i / 4) * (Math.PI / 2); pts.push([-bw + r + Math.cos(a) * r, -hh + r + Math.sin(a) * r]); }
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  return { shape: s, topY, hw, hh };
}
// a grip: a rubber tube along the wheel's side, tilted out at the top, its section a rounded ellipse, the back (+z,
// where the fingers wrap) with finger grooves, its ends rounded
function gripGeometry(W, k) {
  const G = W.grip, segs = 36, ring = 20, pos = [], idx = [];
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
// a flat ring (a rotary's scale) in the face plane, its segments coloured (cols), and a white tick per segment
function scaleRing(x, y, z, r0, r1, cols) {
  const n = cols.length * 3, pos = [], col = [];
  const C = cols.map((c) => new THREE.Color(c));
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * 1.25 - (i / n) * Math.PI * 1.5, a1 = Math.PI * 1.25 - ((i + 1) / n) * Math.PI * 1.5, c = C[Math.floor(i / 3)];
    const p = (a, r) => [x + Math.cos(a) * r, y + Math.sin(a) * r, z];
    pos.push(...p(a0, r0), ...p(a1, r0), ...p(a0, r1), ...p(a1, r0), ...p(a1, r1), ...p(a0, r1));
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals(); return g;
}
const colourise = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g; };

// The wheel's geometries from a spec: { body (carbon: with UVs in metres for the weave), rubber (grips), bezel (matte
// black: the display's frame, the light strip, thumb wheels), screen (the display's plane, UV 0..1 over it), caps
// (buttons, knob tops, scales: vertex colours), metal (paddle tips, the hub), paddles (carbon), leds: [[x, y, z] ×
// count] (the lights' centres), led: { r } (a light's radius), grips: [{ c: [x, y, z], up: [x, y, z] } × 2] (each
// grip's centre and its axis up – the hands hold these), face (z of the face) }
// merge(): car3d.js's merge (non-indexed, uv kept when all parts have one)
export function wheelParts(W, merge, metricUV) {
  const { shape, topY, hw, hh } = outline(W), t = W.t, face = -t / 2 - 0.002;
  const body = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.003, bevelSegments: 2, curveSegments: 4 });
  body.translate(0, 0, -t / 2);
  // (the back: a raised spine behind the display holding the electronics and the hub)
  const spine = new THREE.CylinderGeometry(0.035, 0.042, 0.04, 24); spine.rotateX(Math.PI / 2); spine.translate(0, -0.005, t / 2 + 0.018);
  // the display: its bezel a frame round the screen, the screen just in front of the face
  const S = W.screen, bz = 0.006;
  const bezel = [];
  const frame = (w, h, x, y, z, d) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  bezel.push(frame(S.w + 2 * bz, bz, 0, S.y + S.h / 2 + bz / 2, face - 0.003, 0.008), frame(S.w + 2 * bz, bz, 0, S.y - S.h / 2 - bz / 2, face - 0.003, 0.008),
    frame(bz, S.h, S.w / 2 + bz / 2, S.y, face - 0.003, 0.008), frame(bz, S.h, -S.w / 2 - bz / 2, S.y, face - 0.003, 0.008), frame(S.w, S.h, 0, S.y, face + 0.001, 0.004));
  const screen = new THREE.PlaneGeometry(S.w, S.h); screen.rotateY(Math.PI); screen.translate(0, S.y, face - 0.0045);
  // the shift lights: a black strip along the top edge (or over the display's top, inside its bezel) with the lights in it
  const leds = [], L = W.leds, ledR = 0.0032;
  if (L && L.count > 0) {
    // ("above": a row in the face just over the display's bezel – where 2025–26 wheels have it; "top": along the top
    // edge; "display": inside the display's frame)
    const onDisplay = L.where === "display", above = L.where !== "top" && !onDisplay;
    const span = onDisplay ? S.w - 0.012 : above ? Math.min(L.span || S.w, S.w + 0.01) : Math.min(L.span, 2 * hw - 0.05);
    const y = onDisplay ? S.y + S.h / 2 - 0.006 : above ? S.y + S.h / 2 + bz + 0.009 : Math.min(L.y ?? hh, topY(0) - 0.009);
    const zf = onDisplay ? face - 0.0055 : face - 0.0035;
    if (!onDisplay) bezel.push(frame(span + 0.012, 0.011, 0, y, face - 0.001, 0.006));
    for (let i = 0; i < L.count; i++) {
      // (light 0 on the driver's left: +x – the wheel's frame has +x on the car's left, the driver facing +z)
      const x = L.count === 1 ? 0 : span / 2 - (span * i) / (L.count - 1);
      // (an arched top: the strip follows the edge)
      const yy = L.where === "top" ? y + (topY(x) - topY(0)) : y;
      leds.push([x, yy, zf]);
    }
  }
  // the FIA flag lights: a short column each side of the display (lit by race control's track state – map3d.js)
  const flags = [];
  for (let i = 0; i < (W.flagLights || 0) * 2; i++) {
    const k = i % 2 ? -1 : 1, j = Math.floor(i / 2), x = k * (S.w / 2 + bz + 0.0045), y = S.y + S.h / 2 - 0.009 - j * 0.013;
    bezel.push(frame(0.007, 0.01, x, y, face - 0.001, 0.005)); flags.push([x, y, face - 0.004]);
  }
  // buttons: in columns either side of the display (and two under it when there are many), coloured caps on dark bases
  const caps = [], nb = typeof W.buttons === "number" ? W.buttons : W.buttons?.length || 0, cols = W.colours.buttons;
  const bx0 = S.w / 2 + 0.03, rows = Math.max(1, Math.ceil(nb / 4));
  for (let i = 0; i < nb; i++) {
    const side = i % 2 ? -1 : 1, j = Math.floor(i / 2), col = j % 2, row = Math.floor(j / 2);
    const x = side * (bx0 + col * 0.019), y = S.y + S.h / 2 - 0.008 - row * Math.min(0.022, (S.h + 0.03) / rows) - col * 0.006;
    if (Math.abs(x) > hw - 0.012) continue;
    bezel.push(knob(x, y, face - 0.002, 0.0095, 0.004, 0, 16));
    caps.push(colourise(knob(x, y, face - 0.0075, 0.0072, 0.006, 0, 16), cols[i % cols.length]));
  }
  // rotaries: along the bottom under the display (two rows when more than four), knurled, each with a coloured scale
  const nr = typeof W.rotaries === "number" ? W.rotaries : W.rotaries?.length || 0, scalePal = ["#e8392f", "#ff7a1a", "#f2c230", "#2fbf5b", "#1db6c4", "#2f7fe0", "#8a56e8", "#e9ecef"];
  const perRow = nr > 4 ? Math.ceil(nr / 2) : nr, bottomY = -hh + 0.02, rowGap = Math.min(0.034, Math.max(0.026, (S.y - S.h / 2 - bz - 0.014) - (-hh + 0.02)));
  for (let i = 0; i < nr; i++) {
    const row = nr > 4 && i >= perRow ? 1 : 0, ii = row ? i - perRow : i, n = row ? nr - perRow : perRow;
    const spread = Math.min(0.19, (n - 1) * 0.046), x = n === 1 ? 0 : -spread / 2 + (spread * ii) / (n - 1), y = row ? bottomY + 0.004 : bottomY + (nr > 4 ? rowGap : 0.004);
    if (Math.abs(x) > hw - 0.02) continue;
    const r = 0.0105;
    bezel.push(knob(x, y, face - 0.006, r, 0.012, 14));
    caps.push(colourise(knob(x, y, face - 0.0185, r * 0.55, 0.001, 0, 12), "#2a2d31"));
    caps.push(colourise(new THREE.BoxGeometry(0.0016, r * 0.9, 0.0012).translate(x, y + r * 0.45, face - 0.0186), "#f2f3f4"));   // the pointer
    const own = W.rotaryColours?.[i], pal = own ? Array(6).fill(own).map((c, k) => (k % 2 ? "#e9ecef" : c)) : [0, 1, 2, 3, 4, 5].map((k) => scalePal[(i * 2 + k) % scalePal.length]);
    caps.push(scaleRing(x, y, face - 0.0005, r + 0.002, r + 0.0075, pal));
  }
  // thumb wheels: small ridged drums standing out of the face where the thumbs rest, above the grips' inner side
  const nt = W.thumb || 0;
  for (let i = 0; i < nt; i++) {
    const k = i % 2 ? -1 : 1, x = k * (hw - 0.03), y = S.y + S.h / 2 - 0.004;
    const g = new THREE.CylinderGeometry(0.009, 0.009, 0.007, 16); g.rotateZ(Math.PI / 2); g.translate(x, y, face - 0.004); bezel.push(g);
  }
  // paddles behind the wheel: shift (upper, longer) and clutch (lower), carbon blades reaching out past the grips' backs
  const paddles = [], metal = [];
  for (const k of [1, -1]) {
    const up = new THREE.BoxGeometry(0.085, 0.05, 0.004); up.translate(k * 0.07, 0.012, t / 2 + 0.012); up.rotateZ(k * -0.12); paddles.push(up);
    const lo = new THREE.BoxGeometry(0.075, 0.034, 0.004); lo.translate(k * 0.06, -0.045, t / 2 + 0.022); lo.rotateZ(k * 0.1); paddles.push(lo);
    // (an aluminium pivot block at each paddle's root)
    const pv = new THREE.BoxGeometry(0.014, 0.022, 0.012); pv.translate(k * 0.03, 0.0, t / 2 + 0.008); metal.push(pv);
  }
  // the quick-release hub and the column's end behind
  const hub = new THREE.CylinderGeometry(0.022, 0.026, 0.03, 20); hub.rotateX(Math.PI / 2); hub.translate(0, -0.005, t / 2 + 0.05); metal.push(hub);
  const grips = [1, -1].map((k) => ({ c: [k * W.grip.x, 0, 0], up: [k * Math.sin(W.grip.tilt), Math.cos(W.grip.tilt), 0] }));
  return {
    body: metricUV(merge([body, spine]), 0.04), rubber: merge([gripGeometry(W, 1), gripGeometry(W, -1)]), bezel: merge(bezel), screen,
    caps: mergeColoured(caps), metal: merge(metal), paddles: metricUV(merge(paddles), 0.04), leds, flags, led: { r: ledR }, grips, face,
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
// a shift light: a small dome (in front of the strip), facing the driver
export function ledGeometry(r) {
  const g = new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.rotateX(-Math.PI / 2);
  g.scale(1, 1, 0.55);
  return g;
}
