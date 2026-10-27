// The driver's kit in the cockpit (v0.44): gloves, the suit's sleeves and torso, and the safety harness – their colours
// per team and season, and the one material that draws them all.
//
// Why: v0.43 coloured the gloves l.glove || l.base – the car's body colour all over the glove. Mercedes' near-black base
// gave black gloves on a black wheel in a dark tub: the hands vanished in the 1st-person view. Real race gloves are made
// in panels – the fabric, a back-of-hand panel, the knuckles' padding, the cuff and its band, a silicone print on the
// palm – and each team's (and often each driver's) gloves use the team's colours on some of them (research/gloves.md).
//
// How: the kit's geometry (body3d.js driverGlove, armSkin, gauntletSkin; car3d.js torso; harness.js) carries a zone per
// triangle in its uv (KIT_ZONE); a style is 16 colours, one per zone, in a 16×1 texture (cached per style, shared by
// every car using it – never freed with a car); the finish per zone (roughness, metalness: fabric, silicone, webbing,
// anodised metal) is one texture shared by every style. One material per style (shared): the cars of a team share it,
// and no team's colours can leak into another's.
//
// Colours: real black fabric is not black paint – dyed Nomex/aramid knit reflects ~3–6 % (textile reflectance tables;
// M) – so a "black" glove or suit is drawn #2a2c30-ish, not the car's #111214 gloss black. That is the material's own
// albedo, not a brightening for legibility; the sheen (fabric's grazing-angle highlight: MeshPhysicalMaterial.sheen)
// separates fabric from the wheel's lacquered carbon and rubber under the same lights. No glove light, no emissive.
import * as THREE from "./vendor/three.module.js";
import { KIT_ZONE, KIT_TEXELS } from "./body3d.js";

// fabric albedo floor for "black" kit (sRGB): see the header
// (the harness: black webbing, a black anodised buckle, a polished lever and satin ladder adjusters – both F1 harnesses'
// FIA homologation photos (Sabelt F1 2020, Schroth Formula 2x2 F1; research/harness.md – H); no team's own colours found
// for 2024–26, so every team gets these)
const KIT_BLACK = "#2a2c30", PALM_GREY = "#4a4c50", BUCKLE = "#2e3034", LEVER = "#c9ced4", ADJUSTER = "#9aa0a7", WEB_BLACK = "#26272a";
// The styles. Fields: fabric (the glove's body), back (back-of-hand panel), knuckle, seam (stitching rings), palm (the
// silicone print), band (the wrist band), gauntlet (the cuff), hem (the cuff's open end), suit, suitSeam, suitCuff (the
// knitted cuff under the gauntlet), webbing (harness straps), webEdge (their edges), buckle, buckleCap, adjuster;
// src: where it comes from and how sure (H/M/L or "visual": a choice for legibility, not a photo of the real kit).
// Matched on the feed's team name, the season and (where a kit changed mid-season) the event's date, as liveryFor.
// Missing fields fall back to the base rules in kitStyle(). drivers: a driver's own design over the team's (by car number).
// Colours are read off the photos in research/gloves.md (approximations, not measurements); sponsor and maker logos left
// out; where a stripe sits on a fingertip the knuckle or the seam rings carry it (the glove has no fingertip zone). A
// season whose gloves weren't found carries the season before ("assumed", L) or – none at all – the base rules.
const PALM = KIT_BLACK, PAPAYA = "#ff8000", MERC_TEAL = "#00a19b";
const KIT_RBR = { fabric: "#1b2340", palm: PALM, band: "#202226", gauntlet: "#1b2340", hem: "#161c33", suit: "#1b2340", suitCuff: "#161c33" };
const KIT_FER25 = { fabric: "#a3121c", palm: PALM, band: "#8a0f18", gauntlet: "#a3121c", suit: "#a3121c", suitSeam: "#f2f2f2", suitCuff: "#f2f2f2" };
const KIT_VCARB = { fabric: "#eef0f3", back: "#1f3fa0", knuckle: "#eef0f3", palm: PALM, band: "#eef0f3", gauntlet: "#eef0f3", hem: "#1a1b1e", suit: "#eef0f3", suitSeam: "#1f3fa0", suitCuff: "#eef0f3" };
const KIT_MCL = { fabric: KIT_BLACK, back: KIT_BLACK, knuckle: PAPAYA, palm: "#3a3c40", band: KIT_BLACK, suit: PAPAYA, suitSeam: KIT_BLACK, suitCuff: KIT_BLACK };
const KIT_AMR = { fabric: KIT_BLACK, back: KIT_BLACK, knuckle: "#cedc00", seam: "#cedc00", palm: PALM, band: KIT_BLACK, gauntlet: KIT_BLACK, suit: "#00483d", suitCuff: "#00483d" };
const KIT_WIL = { fabric: "#e9ebee", back: "#e9ebee", knuckle: "#e9ebee", palm: PALM, band: "#e9ebee", gauntlet: "#e9ebee", hem: "#d5d8dc", suit: "#eef0f3", suitSeam: "#0b1f4f", suitCuff: "#eef0f3" };
const KIT_HAAS = { fabric: KIT_BLACK, back: "#da291c", knuckle: KIT_BLACK, palm: PALM, band: KIT_BLACK, gauntlet: KIT_BLACK, suit: KIT_BLACK, suitCuff: "#da291c" };
const MERC_RUSSELL = { fabric: MERC_TEAL, back: MERC_TEAL, knuckle: MERC_TEAL, palm: PALM, band: "#7a7d80", gauntlet: MERC_TEAL, hem: "#7a7d80" };
export const KITS = [
  [/red bull racing/i, { ...KIT_RBR, src: "Sparco (Castore) navy, black palm – race-used, Graham Budd lot 78 (2024); Getty Baku 2025 (H Verstappen / M)" }, { until: 2025 }],
  [/red bull racing/i, { ...KIT_RBR, suitCuff: "#e8b923", src: "navy, black palm; sleeve's yellow/red band near the cuff – Getty 2026 (M)" }, { from: 2026 }],
  [/^rb$|racing bulls|\bvcarb|alphatauri|rb f1/i, { ...KIT_VCARB, src: "Alpinestars white mesh, royal-blue back panel, black binding – Getty Spain/Brazil 2024 (H Tsunoda / M)" }, { until: 2024 }],
  [/^rb$|racing bulls|\bvcarb|alphatauri|rb f1/i, { ...KIT_VCARB, suitSeam: "#2a4fb0", src: "gloves assumed as 2024 (L); sleeve white/blue – Getty Bahrain 2025 (M)" }, { from: 2025, until: 2025 }],
  [/^rb$|racing bulls|\bvcarb|alphatauri|rb f1/i, { ...KIT_VCARB, fabric: "#d9dce0", back: "#5a6f8c", knuckle: "#d9dce0", band: "#d9dce0", gauntlet: "#d9dce0", hem: "#1a2340", suit: "#f1ede4", suitSeam: "#e0502a", suitCuff: "#1a2340", src: "light grey, blue-grey back print, navy binding – Getty Singapore 2026 (M)" }, { from: 2026 }],
  [/ferrari/i, { ...KIT_FER25, fabric: "#d6001c", gauntlet: "#d6001c", band: "#b80018", seam: "#f2c200", suit: "#d6001c", suitSeam: "#f2c200", src: "Puma red, yellow/white finger stripes (on the seam rings) – Getty Bahrain test 2024 (M); palm inferred (L)" }, { until: 2024 }],
  [/ferrari/i, { ...KIT_FER25, src: "Puma deep red, black palm (white thumb not drawn) – Collector Studio race-used 2025 (H)" }, { from: 2025, until: 2025 }],
  [/ferrari/i, { ...KIT_FER25, fabric: "#d81e1e", gauntlet: "#d81e1e", band: "#c01a1a", hem: "#f2f2f2", suit: "#d81e1e", src: "Puma bright red, tricolour cuff hem (its white drawn) – Collector Studio Canada 2026 (H Hamilton / M Leclerc)" }, { from: 2026 }],
  [/mercedes/i, { ...MERC_RUSSELL, suit: KIT_BLACK, src: "Puma: Russell teal, black palm (M, dated by label); Hamilton his own fluo yellow (H)",
    drivers: { 44: { fabric: "#d8e81c", back: "#d8e81c", knuckle: "#d8e81c", band: "#d8e81c", gauntlet: "#d8e81c", hem: "#b9c816" } } }, { until: 2024 }],
  [/mercedes/i, { ...MERC_RUSSELL, hem: "#16171a", src: "Adidas/OMP: teal (Russell) / white (Antonelli) – team giveaway photo, driver split by signature only (L)",
    drivers: { 12: { fabric: "#eceef1", back: "#eceef1", knuckle: "#eceef1", band: "#eceef1", gauntlet: "#eceef1", hem: "#24234a" } } }, { from: 2025, until: 2025 }],
  [/mercedes/i, { ...MERC_RUSSELL, hem: "#16171a", suit: "#3a3d42", suitSeam: MERC_TEAL, suitCuff: KIT_BLACK, src: "gloves assumed as 2025 (L); sleeve charcoal forearm, teal at the elbow – replica suit (M)",
    drivers: { 12: { fabric: "#eceef1", back: "#eceef1", knuckle: "#eceef1", band: "#eceef1", gauntlet: "#eceef1", hem: "#24234a" } } }, { from: 2026 }],
  [/mclaren/i, { ...KIT_MCL, src: "Alpinestars black, papaya fingertip (on the knuckles) – Piastri race-used 2024 (H), Joopiter 2025 (M); sleeve Commons 2024-08-25 (H)" }, { until: 2025 }],
  [/mclaren/i, { ...KIT_MCL, src: "assumed as 2025 (L): 2026 gloves not found" }, { from: 2026 }],
  [/aston martin/i, { ...KIT_AMR, src: "OMP black, lime fingertip stripes (on knuckles and seams) – race-spec / race-used pairs 2024 (H)" }, { until: 2024 }],
  [/aston martin/i, { ...KIT_AMR, suit: "#00594c", suitCuff: "#00594c", src: "gloves assumed as 2024 (L, maker now Puma); sleeve green, green knit cuff – used suits (H)" }, { from: 2025 }],
  [/alpine/i, { fabric: KIT_BLACK, back: "#ff87bc", knuckle: "#2f6fd6", seam: "#2f6fd6", palm: PALM, band: "#e0409a", gauntlet: KIT_BLACK, src: "Alpinestars black, pink back panel, blue piping, stripe band – Gasly GP-used 2024 (H; Ocon L)" }, { until: 2024 }],
  [/alpine/i, { fabric: "#1a2448", back: "#ff87bc", knuckle: "#20b8e0", seam: "#20b8e0", palm: PALM, band: "#1a2448", gauntlet: "#1a2448", suit: "#ff87bc", suitSeam: "#1a2448", suitCuff: KIT_BLACK, src: "Alpinestars navy, pink panel, cyan piping – Alamy Jeddah / Spielberg 2025 (H); palm inferred" }, { from: 2025, until: 2025 }],
  [/alpine/i, { fabric: "#1a2448", back: "#ff87bc", knuckle: "#20b8e0", seam: "#20b8e0", palm: PALM, band: "#1a2448", gauntlet: "#1a2448", suit: "#ff87bc", suitSeam: "#1a2448", suitCuff: KIT_BLACK, src: "assumed as 2025 (L): 2026 gloves not found" }, { from: 2026 }],
  [/williams/i, { ...KIT_WIL, src: "Puma white knit, black palm, long white gauntlet – RM Sotheby's / gp-collection race-used 2024 (H); 2025 signature gloves (M)" }, { until: 2025 }],
  [/williams/i, { ...KIT_WIL, src: "assumed as 2025 (L, maker now Sparco): 2026 gloves not found; white suit (L)" }, { from: 2026 }],
  [/haas/i, { ...KIT_HAAS, seam: "#da291c", src: "Alpinestars black, red star (back panel), red finger stripes – signed replica (M-/L); sleeve photos (H)" }, { until: 2024 }],
  [/haas/i, { ...KIT_HAAS, seam: "#f2f2f2", src: "Alpinestars black, red star, white piping – signature gloves 2025 (M); 2026 assumed (L)" }, { from: 2025 }],
  [/kick sauber|sauber|stake/i, { suit: KIT_BLACK, band: "#52e252", src: "gloves not found – base rules; sleeve black/green (text report, L)" }, { until: 2025 }],
  [/audi/i, { suit: "#33363b", suitSeam: "#b5b8bc", suitCuff: KIT_BLACK, src: "gloves not found – base rules; sleeve charcoal, grey stripes – F1.com launch 2026-01-20 (H)" }, { from: 2026 }],
  [/cadillac/i, { suit: KIT_BLACK, suitSeam: "#e8e8e8", src: "gloves not found – base rules; suit black, white accents (L-M)" }, { from: 2026 }],
];
// the base rules for a team without its own entry: the glove's fabric in the suit's colour, the back panel and the band
// in the team's accent, the knuckles in the fabric, a grey palm print; black webbing with a polished buckle
export function kitStyle(livery, own = null) {
  const L = livery || {}, o = own || {};
  const fabric = o.fabric || floorBlack(L.suit || L.glove || L.base || KIT_BLACK);
  const accent = o.accent || (L.accent && L.accent !== fabric ? L.accent : L.top && L.top !== L.base ? L.top : fabric);
  const suit = o.suit || floorBlack(L.suit || L.base || KIT_BLACK);
  return {
    fabric, back: o.back || fabric, knuckle: o.knuckle || fabric, seam: o.seam || shade(fabric, 0.8), palm: o.palm || PALM_GREY,
    band: o.band || accent, gauntlet: o.gauntlet || fabric, hem: o.hem || shade(fabric, 0.85),
    suit, suitSeam: o.suitSeam || shade(suit, 0.75), suitCuff: o.suitCuff || shade(suit, 0.7),
    webbing: o.webbing || WEB_BLACK, webEdge: o.webEdge || shade(o.webbing || WEB_BLACK, 0.7), buckle: o.buckle || BUCKLE, buckleCap: o.buckleCap || LEVER, adjuster: o.adjuster || ADJUSTER,
    src: o.src || "base rules from the livery (no photo of this kit)",
  };
}
// the team's own kit entry for a season / date (as liveryFor's windows), a driver's own design over it
export function kitEntry(teamName, season = null, date = null, number = null) {
  const y = +season || null, d = typeof date === "string" ? date.slice(0, 10) : null;
  const ok = (w) => { if (!w) return true;
    const lo = w.from, hi = w.until;
    if (typeof lo === "number" && y && y < lo) return false; if (typeof hi === "number" && y && y > hi) return false;
    if (typeof lo === "string") { if (!d) return y ? y > +lo.slice(0, 4) : true; if (d < lo) return false; }
    if (typeof hi === "string") { if (!d) return y ? y <= +hi.slice(0, 4) : true; if (d >= hi) return false; }
    return true; };
  for (const [re, k, w] of KITS) if (re.test(teamName || "") && ok(w)) {
    const own = k.drivers?.[+number];
    return own ? { ...k, ...own } : k;
  }
  return null;
}
// a dark colour raised to the fabric's albedo floor; others as they are
// (v0.45: in sRGB, as the colours are written – v0.44 took the lightness of the linear colour, so a black suit's glove
// came out #6a6e77, a mid grey, and only the palette's double decoding (kitPalette) drew it dark)
function floorBlack(c) {
  const v = new THREE.Color(c), hsl = {}; v.getHSL(hsl, THREE.SRGBColorSpace);
  return hsl.l < 0.16 ? "#" + new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, 0.12), 0.165, THREE.SRGBColorSpace).getHexString() : c;
}
const shade = (c, k) => "#" + new THREE.Color(c).multiplyScalar(k).getHexString();

// the zones' finish: roughness (G) and metalness (B), linear – fabric knit, the palm's silicone print (smoother), the
// harness' polyester webbing (a little sheen), the buckle's black anodised aluminium body, its polished lever and the
// satin adjusters (the FIA forms' photos of the Sabelt / Schroth F1 harnesses – H)
const FINISH = { fabric: [0.86, 0], back: [0.8, 0], knuckle: [0.84, 0], seam: [0.9, 0], palm: [0.55, 0], band: [0.7, 0], gauntlet: [0.84, 0], hem: [0.88, 0],
  suitSeam: [0.9, 0], suit: [0.86, 0], suitCuff: [0.93, 0], webbing: [0.66, 0], webEdge: [0.7, 0], buckle: [0.4, 0.6], buckleCap: [0.22, 0.95], adjuster: [0.42, 0.85] };
let finishTex = null;
function finishTexture() {
  if (finishTex) return finishTex;
  const a = new Uint8Array(KIT_TEXELS * 4);
  for (const [k, z] of Object.entries(KIT_ZONE)) { const [r, m] = FINISH[k] || [0.85, 0]; a.set([255, Math.round(r * 255), Math.round(m * 255), 255], z * 4); }
  return (finishTex = texel(a, THREE.NoColorSpace));
}
function texel(a, space) {
  const t = new THREE.DataTexture(a, KIT_TEXELS, 1, THREE.RGBAFormat);
  t.colorSpace = space; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  t.userData.shared = true; return t;
}
// the style's palette (sRGB colours per zone: the texture is marked sRGB, the GPU decodes it once)
// (v0.45: v0.44 wrote THREE.Color's linear components here – decoded a second time on the GPU, "#2a2c30" black knit drew
// as #060608 and papaya #ff8000 as #ff3700: every kit far darker than its research; test/gloves45)
export function kitPalette(style) {
  const a = new Uint8Array(KIT_TEXELS * 4), c = new THREE.Color(), o = { r: 0, g: 0, b: 0 };
  for (const [k, z] of Object.entries(KIT_ZONE)) { c.set(style[k] || "#808080").getRGB(o, THREE.SRGBColorSpace); a.set([Math.round(o.r * 255), Math.round(o.g * 255), Math.round(o.b * 255), 255], z * 4); }
  return a;
}
// One material per style, shared by the cars wearing it (MeshPhysicalMaterial for the fabric's sheen; the colour, the
// roughness and the metalness from the zone textures; the vertex colours white – kept for shading a part might want).
// (v0.45: keyed by the look too – the real and the readable look of a kit never share a material, even where their
// colours agree; nothing writes to a kit material once made: a car changes look by taking the other one – setKitMode)
const KIT_MATS = new Map();
export function kitMaterial(style, mode = "real") {
  mode = kitMode(mode);
  const key = mode + "|" + JSON.stringify(Object.keys(KIT_ZONE).map((k) => style[k]));
  let m = KIT_MATS.get(key);
  if (m) return m;
  // (the sheen: a pale grey of the fabric – the knit's fibres catching grazing light; sheenRoughness high, a soft glow
  // round the fingers and knuckles, not a gloss)
  // (v0.44 first try 0.7 towards white read as grey gloves in the Monza noon light – a black knit's sheen is faint)
  const sheen = new THREE.Color(style.fabric).lerp(new THREE.Color(0xffffff), 0.3);
  m = new THREE.MeshPhysicalMaterial({ map: texel(kitPalette(style), THREE.SRGBColorSpace), roughnessMap: finishTexture(), metalnessMap: finishTexture(), roughness: 1, metalness: 1,
    vertexColors: true, sheen: 0.35, sheenRoughness: 0.8, sheenColor: sheen });
  m.userData.shared = true; m.userData.kit = key; m.userData.kitMode = mode;
  KIT_MATS.set(key, m);
  return m;
}
export const kitStats = () => ({ materials: KIT_MATS.size });

// ---------- v0.45: the two looks ----------
// "real": the kit as researched (KITS / the base rules above). "readable" (the default): a restrained readability aid
// for the 1st-person view – the user asked that in every team the hands read apart from the dark cockpit, in the team's
// colour applied with restraint; v0.44 drew the real black / navy gloves as they are, and on a black wheel in a dark tub
// they vanished (screenshots: v045/reports/gloves.md). It is NOT an exact copy of any real glove: only a dark glove
// (fabric's relative luminance under KIT_DARK – Red Bull and Alpine navy, McLaren, Aston Martin, Haas black, Ferrari
// 2025's deep red) changes, and only so far:
//  - its knit stays a dark knit: the fabric (and the gauntlet, back panel, hem where they are as dark) raised to KNIT_LIFT
//    relative luminance, inside the 3–6 % reflectance of dyed black aramid knit cited in the header – not brightened past
//    a black fabric; its hue kept (navy stays navy);
//  - the wrist band, the knuckle ridge and the finger seams – where they are not already an accent of the real glove –
//    in the team's signature colour; those zones exist on the fine and the light glove alike (body3d), so the look is
//    the same at every detail level; the real accents (Alpine's pink panel, Haas' red star panel and white piping) stay;
//  - the palm print, the suit, the sleeves and the harness untouched; no emissive, no glove light – the scene's light.
// The signature colour: the first chromatic accent the real glove already has (McLaren papaya, Aston Martin lime, Alpine
// cyan, Haas red), else the livery's accent (Red Bull red, Ferrari 2025 white – its real glove has a white thumb), else
// the feed's team colour – the first that stands out from the knit (contrast ≥ SIG_CONTRAST: red or blue on a dark knit reads by its hue as much as its lightness).
export const KIT_MODES = ["readable", "real"], KIT_MODE_DEFAULT = "readable";
export const KIT_DARK = 0.1, KNIT_LIFT = 0.045, SIG_CONTRAST = 2;
export const kitMode = (m) => (KIT_MODES.includes(m) ? m : KIT_MODE_DEFAULT);
// relative luminance (THREE.Color holds linear components) and the WCAG-style contrast of two colours
const relLum = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
const contrastOf = (a, b) => { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const chromatic = (hex) => { const h = {}; new THREE.Color(hex).getHSL(h, THREE.SRGBColorSpace); return h.s >= 0.35 && h.l >= 0.2 && h.l <= 0.85; };
// a dark colour raised to luminance y, its hue and saturation kept (linear scale; a near-black one with grey added)
function liftTo(hex, y) {
  const c = new THREE.Color(hex), l = relLum(hex);
  if (l >= y) return hex;
  if (l < 1e-4) c.setRGB(y, y, y); else c.multiplyScalar(y / l);
  return "#" + c.getHexString();
}
export function kitReadable(style, livery = null, teamColour = null) {
  const L = livery || {}, S = { ...style };
  if (relLum(style.fabric) >= KIT_DARK) return { ...S, src: `readable look = the real kit (a light glove; not an exact copy of the real design) – ${style.src}` };
  for (const k of ["fabric", "gauntlet", "back", "hem"]) if (relLum(style[k]) < KNIT_LIFT) S[k] = liftTo(style[k], KNIT_LIFT);
  const stands = (c) => c && /^#[0-9a-f]{6}$/i.test(c) && contrastOf(c, S.fabric) >= SIG_CONTRAST;
  let sig = ["knuckle", "seam", "back", "band", "hem"].map((k) => style[k]).find((c) => stands(c) && chromatic(c)), from = "an accent the kit already has";
  if (!sig) { sig = [L.accent, L.nose, L.top, L.side, L.base].find(stands); from = "the livery's accent"; }
  if (!sig && teamColour) { const t = "#" + String(teamColour).replace(/^#/, ""); if (stands(t)) { sig = t; from = "the feed's team colour"; } }
  if (!sig) { sig = "#c8cbd0"; from = "a light grey (no team colour stands out)"; }
  const zones = [];
  for (const k of ["band", "knuckle", "seam"]) if (contrastOf(style[k], S.fabric) < SIG_CONTRAST) { S[k] = sig; zones.push(k); }
  return { ...S, signature: sig, src: `readable look – a readability aid, not an exact copy of the real design: ${zones.join(", ") || "no zone"} in ${sig} (${from}), the knit raised to ${KNIT_LIFT * 100} % luminance – real kit: ${style.src}` };
}
