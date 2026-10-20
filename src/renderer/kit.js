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
const KIT_BLACK = "#2a2c30", KIT_ANTHRACITE = "#3a3d42", PALM_GREY = "#4a4c50", BUCKLE = "#b9bec4", WEB_BLACK = "#26272a";
// The styles. Fields: fabric (the glove's body), back (back-of-hand panel), knuckle, seam (stitching rings), palm (the
// silicone print), band (the wrist band), gauntlet (the cuff), hem (the cuff's open end), suit, suitSeam, suitCuff (the
// knitted cuff under the gauntlet), webbing (harness straps), webEdge (their edges), buckle, buckleCap, adjuster;
// src: where it comes from and how sure (H/M/L or "visual": a choice for legibility, not a photo of the real kit).
// Matched on the feed's team name, the season and (where a kit changed mid-season) the event's date, as liveryFor.
// Missing fields fall back to the base rules in kitStyle().
export const KITS = [];
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
    webbing: o.webbing || WEB_BLACK, webEdge: o.webEdge || shade(o.webbing || WEB_BLACK, 0.7), buckle: o.buckle || BUCKLE, buckleCap: o.buckleCap || o.buckle || BUCKLE, adjuster: o.adjuster || "#8d9298",
    src: o.src || "base rules from the livery (no photo of this kit)",
  };
}
// the team's own kit entry for a season / date (as liveryFor's windows)
export function kitEntry(teamName, season = null, date = null) {
  const y = +season || null, d = typeof date === "string" ? date.slice(0, 10) : null;
  const ok = (w) => { if (!w) return true;
    const lo = w.from, hi = w.until;
    if (typeof lo === "number" && y && y < lo) return false; if (typeof hi === "number" && y && y > hi) return false;
    if (typeof lo === "string") { if (!d) return y ? y > +lo.slice(0, 4) : true; if (d < lo) return false; }
    if (typeof hi === "string") { if (!d) return y ? y <= +hi.slice(0, 4) : true; if (d >= hi) return false; }
    return true; };
  for (const [re, k, w] of KITS) if (re.test(teamName || "") && ok(w)) return k;
  return null;
}
// a dark colour raised to the fabric's albedo floor; others as they are
function floorBlack(c) {
  const v = new THREE.Color(c), hsl = {}; v.getHSL(hsl);
  return hsl.l < 0.16 ? "#" + new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, 0.12), 0.165).getHexString() : c;
}
const shade = (c, k) => "#" + new THREE.Color(c).multiplyScalar(k).getHexString();

// the zones' finish: roughness (G) and metalness (B), linear – fabric knit, the palm's silicone print (smoother), the
// harness' polyester webbing (a little sheen), the buckle's machined aluminium and anodised cap (H: photos of Sabelt /
// Schroth F1 buckles – brushed alloy)
const FINISH = { fabric: [0.86, 0], back: [0.8, 0], knuckle: [0.84, 0], seam: [0.9, 0], palm: [0.55, 0], band: [0.7, 0], gauntlet: [0.84, 0], hem: [0.88, 0],
  suitSeam: [0.9, 0], suit: [0.86, 0], suitCuff: [0.93, 0], webbing: [0.66, 0], webEdge: [0.7, 0], buckle: [0.32, 0.9], buckleCap: [0.4, 0.75], adjuster: [0.38, 0.85] };
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
// the style's palette (sRGB colours per zone)
export function kitPalette(style) {
  const a = new Uint8Array(KIT_TEXELS * 4), c = new THREE.Color();
  for (const [k, z] of Object.entries(KIT_ZONE)) { c.set(style[k] || "#808080"); a.set([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255], z * 4); }
  return a;
}
// One material per style, shared by the cars wearing it (MeshPhysicalMaterial for the fabric's sheen; the colour, the
// roughness and the metalness from the zone textures; the vertex colours white – kept for shading a part might want).
const KIT_MATS = new Map();
export function kitMaterial(style) {
  const key = JSON.stringify(Object.keys(KIT_ZONE).map((k) => style[k]));
  let m = KIT_MATS.get(key);
  if (m) return m;
  // (the sheen: a pale grey of the fabric – the knit's fibres catching grazing light; sheenRoughness high, a soft glow
  // round the fingers and knuckles, not a gloss)
  // (v0.44 first try 0.7 towards white read as grey gloves in the Monza noon light – a black knit's sheen is faint)
  const sheen = new THREE.Color(style.fabric).lerp(new THREE.Color(0xffffff), 0.3);
  m = new THREE.MeshPhysicalMaterial({ map: texel(kitPalette(style), THREE.SRGBColorSpace), roughnessMap: finishTexture(), metalnessMap: finishTexture(), roughness: 1, metalness: 1,
    vertexColors: true, sheen: 0.35, sheenRoughness: 0.8, sheenColor: sheen });
  m.userData.shared = true; m.userData.kit = key;
  KIT_MATS.set(key, m);
  return m;
}
export const kitStats = () => ({ materials: KIT_MATS.size });
