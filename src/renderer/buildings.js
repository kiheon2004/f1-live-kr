// Buildings for the 3D view, each looking like the kind of building it is and where it stands.
// Footprints, heights, floors, roof shapes, colours and materials come from Overture Maps / OpenStreetMap
// (src/main/scene.js). What the data doesn't say is chosen the way the place is actually built:
//   – the kind of building: from its tags, else its size, height and the land use around it
//     (house, apartments, office tower, hotel, shop/big box, industrial shed, civic, sports, car park)
//   – the region's architecture: Gulf (flat roofs, sand-coloured stucco, lattice screens), Mediterranean
//     (pastel stucco, shutters, terracotta hipped roofs), northern Europe (brick, steep slate gables),
//     North America (siding, shingle roofs, big-box retail, glass towers), Latin America (painted concrete,
//     grilles, flat roofs with water tanks), Japan (light panel walls, grey tiled hipped roofs), China, South-East
//     Asia (towers, balconies, terracotta), Australia (brick, terracotta or metal hipped roofs), Caucasus.
// Every building gets its own storey height, window bay width, colour and lit windows; tall ones get a podium
// and a set-back crown. Facades and roofs are layers of one texture array (drawn once), so all buildings still
// render in a handful of draw calls.
import * as THREE from "./vendor/three.module.js";

// ---------- texture layers ----------
export const LAYER = { GLASS_BLUE: 0, GLASS_GREEN: 1, GLASS_DARK: 2, RIBBON: 3, PUNCHED: 4, BRICK: 5, STUCCO: 6, BALCONY: 7, GULF: 8, CLAD: 9, RETAIL: 10,
  HOUSE: 11, JAPAN: 12, HOTEL: 13, LATAM: 14, PLAIN: 15, SHOP: 16, R_TERRACOTTA: 17, R_SLATE: 18, R_METAL: 19, R_FLAT: 20, R_JTILE: 21, R_SHINGLE: 22, PARKING: 23 };
const N_LAYERS = 24, TS = 512;

function rand(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Every facade tile is 2 bays × 2 storeys (TS px square); the alpha channel marks glass (windows), which the
// shader keeps untinted, makes glossy, varies per window and lights at night.
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const data = new Uint8Array(TS * TS * 4 * N_LAYERS);
  const cv = document.createElement("canvas"); cv.width = cv.height = TS;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const mk = document.createElement("canvas"); mk.width = mk.height = TS;
  const m = mk.getContext("2d", { willReadFrequently: true });   // window mask, white = glass
  const r = rand(4242);
  const C = TS / 2;   // one bay / one storey
  const noise = (amt, n = 3000, sz = 2) => { for (let k = 0; k < n; k++) { g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${r() * amt})`; g.fillRect(r() * TS, r() * TS, sz, sz); } };
  const win = (x, y, w, h, frame = "#e8e6e0", glass = "#4d5c6b", fw = 5) => {
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x - fw - 2, y - fw - 2, w + 2 * fw + 4, h + 2 * fw + 4);   // reveal shadow
    g.fillStyle = frame; g.fillRect(x - fw, y - fw, w + 2 * fw, h + 2 * fw);
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, glass); gr.addColorStop(1, shadeHex(glass, -0.35));
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    m.fillStyle = "#fff"; m.fillRect(x, y, w, h);
  };
  const layer = (idx, draw) => {
    g.globalAlpha = 1; g.clearRect(0, 0, TS, TS); m.fillStyle = "#000"; m.fillRect(0, 0, TS, TS);
    draw();
    const px = g.getImageData(0, 0, TS, TS).data, mx = m.getImageData(0, 0, TS, TS).data, o = idx * TS * TS * 4;
    for (let i = 0; i < TS * TS; i++) { data[o + i * 4] = px[i * 4]; data[o + i * 4 + 1] = px[i * 4 + 1]; data[o + i * 4 + 2] = px[i * 4 + 2]; data[o + i * 4 + 3] = mx[i * 4]; }
  };
  const fill = (c) => { g.fillStyle = c; g.fillRect(0, 0, TS, TS); };
  // glass curtain walls: panes with mullions, a spandrel at each floor, the sky reflected
  const glass = (top, bottom, mull) => () => {
    const gr = g.createLinearGradient(0, 0, 0, TS); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, TS, TS);
    for (let k = 0; k < 5; k++) { g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.07})`; g.fillRect(r() * TS, 0, 10 + r() * 40, TS); }
    m.fillStyle = "#fff"; m.fillRect(0, 0, TS, TS);
    for (let j = 0; j < 2; j++) { g.fillStyle = shadeHex(bottom, -0.3); g.fillRect(0, j * C + C * 0.84, TS, C * 0.16); m.fillStyle = "#000"; m.fillRect(0, j * C + C * 0.84, TS, C * 0.16); }
    for (let i = 0; i <= 6; i++) { const x = (i * TS) / 6; g.fillStyle = mull; g.fillRect(x - 2, 0, 4, TS); m.fillStyle = "#000"; m.fillRect(x - 2, 0, 4, TS); }
  };
  layer(LAYER.GLASS_BLUE, glass("#a9c2d6", "#3f5f7a", "#1f2a33"));
  layer(LAYER.GLASS_GREEN, glass("#a8cbc4", "#3c6a63", "#1d2e2b"));
  layer(LAYER.GLASS_DARK, glass("#7d858c", "#2a3036", "#121518"));
  // ribbon windows: a continuous glass band per floor between concrete spandrels
  layer(LAYER.RIBBON, () => { fill("#ffffff"); noise(0.05);
    for (let j = 0; j < 2; j++) { const y = j * C + C * 0.3, h = C * 0.42; g.fillStyle = "#3e4c58"; g.fillRect(0, y, TS, h); m.fillStyle = "#fff"; m.fillRect(0, y, TS, h);
      for (let i = 0; i <= 8; i++) { g.fillStyle = "#cfd2d4"; g.fillRect((i * TS) / 8 - 2, y, 4, h); m.fillStyle = "#000"; m.fillRect((i * TS) / 8 - 2, y, 4, h); } } });
  // punched windows in a rendered wall
  layer(LAYER.PUNCHED, () => { fill("#ffffff"); noise(0.05);
    for (let j = 0; j < 2; j++) { g.fillStyle = "rgba(0,0,0,0.07)"; g.fillRect(0, j * C + C - 6, TS, 6);
      for (let i = 0; i < 2; i++) { win(i * C + C * 0.24, j * C + C * 0.24, C * 0.52, C * 0.5); g.fillStyle = "#d8d5ce"; g.fillRect(i * C + C * 0.2, j * C + C * 0.76, C * 0.6, 8); } } });
  // brick with white sash windows
  layer(LAYER.BRICK, () => { fill("#9a5844");
    for (let y = 0, row = 0; y < TS; y += 12, row++) for (let x = (row % 2) * -14; x < TS; x += 28) { const k = 0.82 + r() * 0.3; g.fillStyle = `rgb(${154 * k | 0},${88 * k | 0},${68 * k | 0})`; g.fillRect(x + 1, y + 1, 26, 10); }
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const x = i * C + C * 0.28, y = j * C + C * 0.2; win(x, y, C * 0.44, C * 0.56, "#f2f0ea", "#3d4a55", 6);
      g.fillStyle = "#f2f0ea"; g.fillRect(x, y + C * 0.27, C * 0.44, 5); g.fillRect(x + C * 0.22 - 2, y, 4, C * 0.56); g.fillStyle = "#cfc6b6"; g.fillRect(x - 10, y + C * 0.56 + 6, C * 0.44 + 20, 9); } });
  // Mediterranean stucco: tall windows with open louvred shutters, a small balcony on alternate floors
  layer(LAYER.STUCCO, () => { fill("#ffffff"); noise(0.06, 4000, 3);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const x = i * C + C * 0.32, y = j * C + C * 0.16, w = C * 0.36, h = C * 0.66;
      win(x, y, w, h, "#efe9dc", "#3b3f44", 4);
      for (const sx of [x - w * 0.5 - 6, x + w + 6]) { g.fillStyle = j ? "#4f7a52" : "#7a5236"; g.fillRect(sx, y, w * 0.5, h); g.fillStyle = "rgba(0,0,0,0.25)"; for (let k = 0; k < h; k += 7) g.fillRect(sx, y + k, w * 0.5, 2); }
      if (j === 0) { g.fillStyle = "#d8d2c4"; g.fillRect(x - 14, y + h, w + 28, 8); g.fillStyle = "#2b2b2b"; for (let k = 0; k <= w + 28; k += 8) g.fillRect(x - 14 + k, y + h - 26, 2, 26); g.fillRect(x - 14, y + h - 28, w + 28, 3); }
    } });
  // modern apartments: a balcony slab and glass balustrade along each floor, sliding doors behind
  layer(LAYER.BALCONY, () => { fill("#ffffff"); noise(0.04);
    for (let j = 0; j < 2; j++) { const y = j * C;
      for (let i = 0; i < 2; i++) win(i * C + C * 0.12, y + C * 0.18, C * 0.76, C * 0.62, "#d9dcdf", "#56677a", 3);
      g.fillStyle = "rgba(170,200,215,0.55)"; g.fillRect(0, y + C * 0.56, TS, C * 0.26); g.fillStyle = "#cfd3d6"; g.fillRect(0, y + C * 0.82, TS, C * 0.1);
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, y + C * 0.92, TS, 6); } });
  // Gulf: small deep windows in light stucco, a mashrabiya lattice on alternate bays
  layer(LAYER.GULF, () => { fill("#ffffff"); noise(0.05, 3000, 3);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const x = i * C + C * 0.3, y = j * C + C * 0.24, w = C * 0.4, h = C * 0.5;
      if ((i + j) % 2) { g.fillStyle = "#8a6a4a"; g.fillRect(x - 6, y - 6, w + 12, h + 12); g.fillStyle = "#5e4630"; for (let a = 0; a < w; a += 10) for (let b = 0; b < h; b += 10) if ((a + b) % 20 === 0) g.fillRect(x + a, y + b, 6, 6); m.fillStyle = "#808080"; m.fillRect(x, y, w, h); }
      else { win(x, y, w, h, "#e3dccd", "#3c434a", 8); g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(x - 8, y - 14, w + 16, 6); }
    } });
  // industrial cladding: vertical ribs, no windows
  layer(LAYER.CLAD, () => { fill("#ffffff"); for (let x = 0; x < TS; x += 16) { g.fillStyle = "rgba(0,0,0,0.13)"; g.fillRect(x, 0, 5, TS); g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(x + 6, 0, 2, TS); } noise(0.04); });
  // retail / big box: plain panels with joints and a fascia band at the top
  layer(LAYER.RETAIL, () => { fill("#ffffff"); noise(0.03); g.fillStyle = "rgba(0,0,0,0.12)"; for (let x = 0; x < TS; x += 64) g.fillRect(x, 0, 2, TS); for (let y = 0; y < TS; y += 128) g.fillRect(0, y, TS, 2); });
  // houses: horizontal siding / render, one window per bay with trim
  layer(LAYER.HOUSE, () => { fill("#ffffff"); for (let y = 0; y < TS; y += 10) { g.fillStyle = "rgba(0,0,0,0.08)"; g.fillRect(0, y, TS, 2); }
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const x = i * C + C * 0.3, y = j * C + C * 0.28, w = C * 0.4, h = C * 0.44; win(x, y, w, h, "#f6f4ee", "#4a5866", 7); g.fillStyle = "#f6f4ee"; g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h / 2 - 2, w, 4); } });
  // Japan: light panels with joints, small windows, an air-conditioner box beside some
  layer(LAYER.JAPAN, () => { fill("#ffffff"); g.fillStyle = "rgba(0,0,0,0.08)"; for (let x = 0; x < TS; x += 42) g.fillRect(x, 0, 2, TS); for (let y = 0; y < TS; y += 85) g.fillRect(0, y, TS, 2);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const x = i * C + C * 0.22, y = j * C + C * 0.3; win(x, y, C * 0.42, C * 0.36, "#c9ccce", "#55606a", 3); if (r() < 0.6) { g.fillStyle = "#d6d6d2"; g.fillRect(x + C * 0.5, y + C * 0.32, C * 0.2, C * 0.14); g.fillStyle = "#9a9a96"; g.fillRect(x + C * 0.52, y + C * 0.34, C * 0.16, 3); } } });
  // hotel: balconies with glass balustrades, full-height doors
  layer(LAYER.HOTEL, () => { fill("#ffffff"); noise(0.03);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const x = i * C + C * 0.08, y = j * C + C * 0.1; win(x, y, C * 0.84, C * 0.72, "#e5e5e2", "#4e6a80", 3); g.fillStyle = "rgba(190,215,225,0.6)"; g.fillRect(x - 8, y + C * 0.48, C * 0.84 + 16, C * 0.3); g.fillStyle = "#e5e5e2"; g.fillRect(i * C, j * C + C * 0.86, C, C * 0.1); g.fillRect(i * C + C - 6, j * C, 6, C); } });
  // Latin America: painted rough concrete, windows with iron grilles
  layer(LAYER.LATAM, () => { fill("#ffffff"); noise(0.1, 6000, 3);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const x = i * C + C * 0.25, y = j * C + C * 0.28, w = C * 0.5, h = C * 0.42; win(x, y, w, h, "#d6d0c4", "#3f4448", 4); g.fillStyle = "#1e1e1e"; for (let k = 0; k <= w; k += 14) g.fillRect(x + k, y, 3, h); g.fillRect(x, y + h / 2, w, 3); } g.fillStyle = "rgba(60,40,20,0.15)"; for (let k = 0; k < 6; k++) g.fillRect(r() * TS, 0, 3 + r() * 6, TS); });
  layer(LAYER.PLAIN, () => { fill("#ffffff"); noise(0.06, 4000, 3); });
  // shopfronts (one storey, 2 bays): glass, frames, a sign fascia and an awning line
  layer(LAYER.SHOP, () => { fill("#ffffff");
    for (let i = 0; i < 2; i++) { const x = i * C + 14, w = C - 28; g.fillStyle = "#2f3438"; g.fillRect(x - 6, TS * 0.3, w + 12, TS * 0.7); const gr = g.createLinearGradient(0, TS * 0.32, 0, TS); gr.addColorStop(0, "#7f95a6"); gr.addColorStop(1, "#2f3c47"); g.fillStyle = gr; g.fillRect(x, TS * 0.32, w, TS * 0.68); m.fillStyle = "#fff"; m.fillRect(x, TS * 0.32, w, TS * 0.68);
      g.fillStyle = ["#b23a32", "#2c5d8a", "#2f7a4b", "#c48a1c", "#3a3a3a"][Math.floor(r() * 5)]; g.fillRect(i * C, TS * 0.12, C, TS * 0.14); g.fillStyle = "rgba(255,255,255,0.8)"; g.fillRect(i * C + C * 0.2, TS * 0.17, C * 0.6, TS * 0.04); } });
  // roofs (tile = 4 m square)
  layer(LAYER.R_TERRACOTTA, () => { fill("#b5653f"); for (let y = 0; y < TS; y += 32) for (let x = 0; x < TS; x += 26) { const k = 0.8 + r() * 0.35; g.fillStyle = `rgb(${181 * k | 0},${101 * k | 0},${63 * k | 0})`; g.beginPath(); g.ellipse(x + 13, y + 16, 12, 17, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x, y + 28, 26, 4); } });
  layer(LAYER.R_SLATE, () => { fill("#4c5257"); for (let y = 0, row = 0; y < TS; y += 22, row++) for (let x = (row % 2) * -16; x < TS; x += 32) { const k = 0.8 + r() * 0.3; g.fillStyle = `rgb(${76 * k | 0},${82 * k | 0},${87 * k | 0})`; g.fillRect(x + 1, y + 1, 30, 20); g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x, y + 19, 32, 3); } });
  layer(LAYER.R_METAL, () => { fill("#ffffff"); for (let x = 0; x < TS; x += 32) { g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x, 0, 4, TS); g.fillStyle = "rgba(255,255,255,0.4)"; g.fillRect(x + 4, 0, 2, TS); } noise(0.03); });
  layer(LAYER.R_FLAT, () => { fill("#ffffff"); noise(0.12, 9000, 2); g.fillStyle = "rgba(0,0,0,0.08)"; for (let x = 0; x < TS; x += 128) g.fillRect(x, 0, 3, TS); for (let y = 0; y < TS; y += 128) g.fillRect(0, y, TS, 3); });
  layer(LAYER.R_JTILE, () => { fill("#5d6670"); for (let x = 0; x < TS; x += 20) { const gr = g.createLinearGradient(x, 0, x + 20, 0); gr.addColorStop(0, "#47505a"); gr.addColorStop(0.5, "#78828c"); gr.addColorStop(1, "#47505a"); g.fillStyle = gr; g.fillRect(x, 0, 20, TS); } for (let y = 0; y < TS; y += 40) { g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, y, TS, 3); } });
  layer(LAYER.R_SHINGLE, () => { fill("#5a5550"); for (let y = 0, row = 0; y < TS; y += 16, row++) for (let x = (row % 2) * -12; x < TS; x += 24) { const k = 0.75 + r() * 0.4; g.fillStyle = `rgb(${90 * k | 0},${85 * k | 0},${80 * k | 0})`; g.fillRect(x + 1, y + 1, 22, 14); } });
  // multi-storey car park: open slots between slabs, a dark interior
  layer(LAYER.PARKING, () => { fill("#ffffff"); noise(0.05);
    for (let j = 0; j < 2; j++) { g.fillStyle = "#26292c"; g.fillRect(0, j * C + C * 0.25, TS, C * 0.55); for (let i = 0; i <= 4; i++) { g.fillStyle = "#d4d4d0"; g.fillRect((i * TS) / 4 - 8, j * C + C * 0.25, 16, C * 0.55); } g.fillStyle = "#bdbdb8"; g.fillRect(0, j * C + C * 0.72, TS, 6); } });
  const tex = new THREE.DataArrayTexture(data, TS, TS, N_LAYERS);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType; tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 8; tex.needsUpdate = true;
  TEX = tex;
  return tex;
}
function shadeHex(hex, k) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k * 0.5); return `#${c.getHexString()}`; }

// ---------- material ----------
function material(night) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.03,
    emissive: new THREE.Color(night ? 0xffffff : 0x000000), emissiveIntensity: night ? 0.9 : 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.facades = { value: textures() };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>
      attribute vec3 aTint; attribute float aLayer; attribute float aShade; attribute float aSeed; attribute vec2 aUv;
      varying vec3 vTint; varying float vLayer; varying float vShade; varying float vSeed; varying vec2 vFUv;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
      vTint = aTint; vLayer = aLayer; vShade = aShade; vSeed = aSeed; vFUv = aUv;`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      precision highp sampler2DArray;
      uniform sampler2DArray facades;
      varying vec3 vTint; varying float vLayer; varying float vShade; varying float vSeed; varying vec2 vFUv;
      float bHash(vec2 p) { return fract(sin(dot(p, vec2(41.31, 289.17))) * 43758.5453); }
      float glassMask = 0.0; vec2 winCell;`)
      .replace("#include <map_fragment>", `
      vec4 fx = texture(facades, vec3(vFUv, floor(vLayer + 0.5)));
      glassMask = fx.a;
      winCell = floor(vFUv * 2.0) + vec2(vSeed * 17.0, vSeed * 3.0);
      float wv = bHash(winCell);
      // walls take the building's colour; glass stays glass, a little different window to window
      vec3 wallC = fx.rgb * vTint;
      vec3 glassC = fx.rgb * (0.78 + 0.4 * wv) * mix(vec3(1.0), vTint, 0.15);
      diffuseColor.rgb *= mix(wallC, glassC, glassMask) * vShade;`)
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = mix(roughness, 0.16, glassMask);")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = mix(metalness, 0.3, glassMask);")
      .replace("#include <emissivemap_fragment>", `
      // at night some windows are lit, warm or cool, decided per window
      // about a quarter of the windows, dimmer on glass towers (offices empty in the evening)
      float lit = step(0.74, bHash(winCell + 7.7)) * (0.55 + 0.45 * bHash(winCell + 1.3));
      vec3 warm = mix(vec3(1.0, 0.82, 0.55), vec3(0.78, 0.88, 1.0), step(0.7, bHash(winCell + 3.1)));
      totalEmissiveRadiance *= glassMask * lit * warm;`);
  };
  mat.customProgramCacheKey = () => "facadeArray";
  return mat;
}

// The far material: the building's colour (glass a little darker), no facade texture; lit windows at night
// are a soft glow over the walls of the glass and window layers.
function farMaterial(night) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.03,
    emissive: new THREE.Color(night ? 0xffffff : 0x000000), emissiveIntensity: night ? 0.9 : 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>
      attribute vec3 aTint; attribute float aLayer; attribute float aShade; varying vec3 vTint; varying float vGlassy; varying float vShade;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
      vTint = aTint; vShade = aShade; vGlassy = aLayer < 2.5 ? 1.0 : (aLayer < 16.5 && aLayer != 9.0 && aLayer != 10.0 && aLayer != 15.0 ? 0.35 : 0.0);`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vTint; varying float vGlassy; varying float vShade;`)
      .replace("#include <map_fragment>", "diffuseColor.rgb *= mix(vTint, vec3(0.32, 0.4, 0.48), vGlassy * 0.8) * vShade;")
      .replace("#include <emissivemap_fragment>", "totalEmissiveRadiance *= vec3(1.0, 0.85, 0.6) * vGlassy * 0.18;");
  };
  mat.customProgramCacheKey = () => "facadeFar";
  return mat;
}

// ---------- region and kind ----------
const REGIONS = {
  gulf: ["Sakhir", "Bahrain", "Jeddah", "Lusail", "Yas Island", "Yas Marina", "Abu Dhabi"],
  med: ["Monaco", "Monte Carlo", "Barcelona", "Madrid", "Monza", "Imola", "Portimão", "Le Castellet", "Mugello"],
  north: ["Silverstone", "Zandvoort", "Spa-Francorchamps", "Spielberg", "Budapest", "Nürburg", "Hockenheim"],
  na: ["Austin", "Miami", "Miami Gardens", "Las Vegas", "Montréal", "Montreal"],
  latam: ["Mexico City", "São Paulo", "Sao Paulo"],
  japan: ["Suzuka"], china: ["Shanghai"], sea: ["Marina Bay", "Singapore", "Kuala Lumpur", "Sepang"],
  aus: ["Melbourne"], cauc: ["Baku", "Sochi", "Istanbul"],
};
export function regionOf(location) { for (const [k, list] of Object.entries(REGIONS)) if (list.includes(location)) return k; return "north"; }

// wall colours by region (applied to light textures), roof looks by region
const WALLS = {
  gulf: ["#efe6d2", "#e8dcc4", "#f4efe4", "#dccbaa", "#e9e2d4", "#d8c8a8"],
  med: ["#f0d9b5", "#e9c49a", "#f3e6c8", "#dba57c", "#ead6b6", "#f2eee6", "#e7b98f", "#d9c3a0", "#f1dfc4"],
  north: ["#f1efe9", "#e4e1da", "#d9d4c9", "#c9c4b8", "#ece6da"],
  na: ["#ece7dc", "#d9d4c6", "#c7c0ae", "#aab4b9", "#efe9df", "#d6cfc1", "#b9b2a4"],
  latam: ["#e0d4c0", "#cfc3a9", "#e8c9a0", "#b9c4c9", "#f0e0c0", "#d8b4a0", "#c9d6b8", "#e8d8d0"],
  japan: ["#ececea", "#dedcd6", "#d8d2c4", "#e4e6e6", "#cfcfcb"],
  china: ["#dcdcd4", "#cac6ba", "#e2ddd2", "#bdbdb6"],
  sea: ["#f2f0ea", "#e9e3d6", "#efe6d6", "#dfe3e4", "#f3eee2"],
  aus: ["#e8e0d0", "#d9cdb8", "#efe9de", "#cfc6b4"],
  cauc: ["#ddcfb2", "#cfbf9e", "#e6dcc6", "#d4c7ab"],
};
const BRICKS = ["#ffffff", "#e6d0c8", "#d6b8a8", "#f0dcd0", "#c8a898"];   // tints over the brick texture
const METALS = ["#c8cbce", "#b7bcc1", "#d4d6d8", "#9ea6ad", "#c2c6b9", "#a9b6c2", "#d9d6cc", "#8e9aa6"];

function kindOf(b, area, H, lu, region) {
  const c = String(b.cls || "").toLowerCase();
  if (/^(house|detached|semidetached_house|terrace|bungalow|cabin|hut|farm|villa|semi)$/.test(c)) return "house";
  if (/^(apartments|residential|dormitory)$/.test(c)) return H > 30 ? "tower_res" : area < 220 && H < 10 ? "house" : "apartments";
  if (/^(hotel)$/.test(c)) return "hotel";
  if (/^(office)$/.test(c)) return H > 30 ? "tower" : "office";
  if (/^(commercial)$/.test(c)) return H > 35 ? "tower" : area > 2500 && H < 16 ? "retail" : "office";
  if (/^(retail|supermarket|kiosk|mall|shop)$/.test(c)) return "retail";
  if (/^(industrial|warehouse|factory|manufacture|storage|hangar|agricultural|barn|greenhouse)$/.test(c)) return "industrial";
  if (/^(garage|garages|carport|shed|roof|service|transformer_tower|toilets|shelter|kiosk)$/.test(c)) return "shed";
  if (/^(parking)$/.test(c)) return "parking";
  if (/^(church|cathedral|chapel)$/.test(c)) return "church";
  if (/^(mosque)$/.test(c)) return "mosque";
  if (/^(temple|shrine)$/.test(c)) return region === "japan" || region === "china" ? "temple" : "civic";
  if (/^(school|university|college|hospital|civic|government|public|train_station|transportation|fire_station|police|library|museum|kindergarten)$/.test(c)) return "civic";
  if (/^(stadium|sports_hall|sports_centre|grandstand|pavilion|riding_hall)$/.test(c)) return "sports";
  if (b.kind === "home") return "house";
  if (b.kind === "shed") return "industrial";
  // untagged ("yes"): size, height and the land use around it
  if (H >= 35) return lu === "residential" ? "tower_res" : "tower";
  if (area < 220 && H < 11) return lu === "industrial" ? "shed" : "house";
  if (area > 3000 && H < 16) return lu === "residential" ? "apartments" : lu === "retail" || lu === "commercial" ? "retail" : "industrial";
  if (lu === "industrial" || lu === "railway") return "industrial";
  if (lu === "retail") return "retail";
  if (lu === "commercial") return "office";
  if (lu === "residential") return area < 400 && H < 12 ? "house" : "apartments";
  return area < 600 && H < 12 ? "house" : "office";
}

// The look of one building. r: its own random stream.
function styleOf(b, area, H, lu, region, r) {
  const kind = kindOf(b, area, H, lu, region);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const wallsOf = () => WALLS[region] || WALLS.north;
  const s = { kind, layer: LAYER.PUNCHED, tint: pick(wallsOf()), storey: 3.1, bay: 3 + r() * 1.4, shop: false, roof: "flat", roofLayer: LAYER.R_FLAT, roofTint: "#b8b6b0",
    pitch: 0.5, parapet: 0, plant: false, tanks: false, crown: false, podium: false };
  const mat = String(b.mat || "").toLowerCase();
  const pitchedRoofOf = () => {
    switch (region) {
      case "north": return [r() < 0.7 ? "gabled" : "hipped", LAYER.R_SLATE, pick(["#ffffff", "#e0d6d0", "#c9b2a6", "#9a6a5a"]), 0.85 + r() * 0.25];
      case "med": return ["hipped", LAYER.R_TERRACOTTA, pick(["#ffffff", "#f0d8c8", "#e0b8a0"]), 0.42 + r() * 0.12];
      case "na": return [r() < 0.6 ? "gabled" : "hipped", LAYER.R_SHINGLE, pick(["#ffffff", "#c8bba8", "#8a7d70", "#b0b8c0"]), 0.55 + r() * 0.2];
      case "japan": case "china": return [r() < 0.7 ? "hipped" : "gabled", LAYER.R_JTILE, pick(["#ffffff", "#c8d0dc", "#a8b4c4", "#d8d0c8"]), 0.5 + r() * 0.12];
      case "aus": return ["hipped", r() < 0.5 ? LAYER.R_TERRACOTTA : LAYER.R_METAL, pick(["#ffffff", "#9aa4ac", "#6b7278", "#c0a088"]), 0.42 + r() * 0.1];
      case "sea": return ["hipped", LAYER.R_TERRACOTTA, pick(["#ffffff", "#e8c8b0"]), 0.45];
      case "cauc": return ["hipped", LAYER.R_METAL, pick(["#9aa6b0", "#7b8a94", "#a05a4a", "#6f8a6a"]), 0.45];
      default: return ["flat", LAYER.R_FLAT, "#d9d4c8", 0];
    }
  };
  const flatRoof = (light) => { s.roof = "flat"; s.roofLayer = LAYER.R_FLAT; s.roofTint = light ? pick(["#ece8de", "#e2ddd2", "#f2efe8"]) : pick(["#a8a6a0", "#8e8c88", "#b8b4ac", "#9a9690"]); };
  switch (kind) {
    case "house": {
      s.storey = 2.9; s.bay = 3.2 + r() * 1.2;
      s.layer = { north: r() < 0.7 ? LAYER.BRICK : LAYER.HOUSE, med: LAYER.STUCCO, gulf: LAYER.GULF, latam: LAYER.LATAM, japan: LAYER.JAPAN, na: LAYER.HOUSE, aus: r() < 0.6 ? LAYER.BRICK : LAYER.HOUSE, sea: LAYER.STUCCO, china: LAYER.JAPAN, cauc: LAYER.PUNCHED }[region] ?? LAYER.HOUSE;
      if (s.layer === LAYER.BRICK) s.tint = pick(BRICKS);
      if (region === "gulf" || region === "latam") { flatRoof(region === "gulf"); s.parapet = 0.8; s.tanks = region === "latam" && r() < 0.6; }
      else [s.roof, s.roofLayer, s.roofTint, s.pitch] = pitchedRoofOf();
      break;
    }
    case "apartments": {
      s.storey = 3.0;
      const low = H <= 14;
      s.layer = { north: r() < 0.55 ? LAYER.BRICK : LAYER.PUNCHED, med: r() < 0.55 ? LAYER.STUCCO : LAYER.BALCONY, gulf: r() < 0.6 ? LAYER.GULF : LAYER.BALCONY, latam: r() < 0.6 ? LAYER.LATAM : LAYER.BALCONY,
        japan: r() < 0.6 ? LAYER.JAPAN : LAYER.BALCONY, na: r() < 0.5 ? LAYER.BRICK : LAYER.PUNCHED, sea: r() < 0.6 ? LAYER.BALCONY : LAYER.STUCCO, china: r() < 0.5 ? LAYER.BALCONY : LAYER.PUNCHED, aus: r() < 0.5 ? LAYER.BRICK : LAYER.BALCONY, cauc: LAYER.PUNCHED }[region] ?? LAYER.PUNCHED;
      if (s.layer === LAYER.BRICK) s.tint = pick(BRICKS);
      if (low && area < 1400 && (region === "north" || region === "med" || region === "aus" || region === "cauc") && r() < 0.75) [s.roof, s.roofLayer, s.roofTint, s.pitch] = pitchedRoofOf();
      else { flatRoof(region === "gulf" || region === "med"); s.parapet = 1; s.plant = area > 400; s.tanks = region === "latam"; }
      s.shop = (lu === "commercial" || lu === "retail" || region === "med" || region === "latam" || region === "cauc") && H > 10 && r() < 0.6;
      break;
    }
    case "tower_res": case "hotel": {
      s.storey = 3.1; s.layer = r() < 0.55 ? LAYER.HOTEL : r() < 0.5 ? LAYER.BALCONY : pick([LAYER.GLASS_BLUE, LAYER.GLASS_GREEN]);
      s.tint = pick(["#f2f0ea", "#e8e4dc", "#dfe3e6", ...wallsOf()]); flatRoof(true); s.parapet = 1.2; s.plant = true; s.crown = H > 50; s.podium = area > 1800 && H > 45;
      break;
    }
    case "tower": {
      s.storey = 3.8; s.bay = 3 + r(); s.layer = pick([LAYER.GLASS_BLUE, LAYER.GLASS_BLUE, LAYER.GLASS_GREEN, LAYER.GLASS_DARK, LAYER.RIBBON, region === "gulf" || region === "sea" ? LAYER.GLASS_GREEN : LAYER.RIBBON]);
      s.tint = s.layer === LAYER.RIBBON ? pick(["#e8e6e0", "#d4d2cc", "#c0c4c8", "#e0d8c8"]) : "#ffffff"; flatRoof(false); s.parapet = 1.4; s.plant = true; s.crown = H > 55; s.podium = area > 2000 && H > 50;
      break;
    }
    case "office": {
      s.storey = 3.6; s.layer = pick([LAYER.RIBBON, LAYER.PUNCHED, LAYER.PUNCHED, H > 18 ? LAYER.GLASS_BLUE : LAYER.RIBBON, region === "gulf" ? LAYER.GULF : LAYER.PUNCHED]);
      s.tint = pick(wallsOf()); flatRoof(region === "gulf"); s.parapet = 1; s.plant = area > 300; s.shop = (lu === "commercial" || lu === "retail") && r() < 0.5;
      break;
    }
    case "retail": {
      s.storey = 5; s.bay = 5 + r() * 3; s.layer = LAYER.RETAIL; s.tint = pick(["#e8e4dc", "#d8d4cc", "#c8ccd0", "#e0d0b8", "#d0c4b0", ...wallsOf()]); s.shop = true;
      flatRoof(true); s.parapet = 1.2; s.plant = area > 600;
      break;
    }
    case "industrial": case "shed": {
      s.storey = 4.5; s.bay = 6; s.layer = LAYER.CLAD; s.tint = pick(METALS);
      if (kind === "shed" && area < 120 && (region === "north" || region === "na" || region === "aus")) { s.layer = region === "north" ? LAYER.BRICK : LAYER.HOUSE; s.tint = s.layer === LAYER.BRICK ? pick(BRICKS) : pick(wallsOf()); [s.roof, s.roofLayer, s.roofTint, s.pitch] = pitchedRoofOf(); }
      else if (area > 600 && r() < 0.25) { s.roof = "round"; s.roofLayer = LAYER.R_METAL; s.roofTint = pick(METALS); s.pitch = 0.18; }
      else if (area > 300 && r() < 0.45) { s.roof = "gabled"; s.roofLayer = LAYER.R_METAL; s.roofTint = pick(METALS); s.pitch = 0.16; }
      else { s.roof = "flat"; s.roofLayer = LAYER.R_METAL; s.roofTint = pick(METALS); s.parapet = 0.6; }
      break;
    }
    case "parking": { s.storey = 3; s.bay = 8; s.layer = LAYER.PARKING; s.tint = pick(["#d8d6d0", "#c8c6c0"]); flatRoof(false); s.parapet = 1.1; break; }
    case "church": { s.storey = 4; s.layer = LAYER.PLAIN; s.tint = pick(["#e8e0cc", "#d8ccb4", "#c8b89c", ...BRICKS.slice(1)]); s.roof = "gabled"; s.roofLayer = region === "med" || region === "latam" ? LAYER.R_TERRACOTTA : LAYER.R_SLATE; s.roofTint = "#ffffff"; s.pitch = 1.0; break; }
    case "mosque": { s.storey = 4; s.layer = LAYER.GULF; s.tint = pick(["#f4efe4", "#efe6d2"]); s.roof = "dome"; s.roofLayer = LAYER.R_METAL; s.roofTint = pick(["#e8e4dc", "#c8b070", "#4a8a9a"]); break; }
    case "temple": { s.storey = 3.5; s.layer = LAYER.PLAIN; s.tint = "#d8c8a8"; s.roof = "hipped"; s.roofLayer = LAYER.R_JTILE; s.roofTint = "#ffffff"; s.pitch = 0.75; break; }
    case "civic": { s.storey = 3.8; s.layer = pick([LAYER.PUNCHED, LAYER.RIBBON, region === "north" ? LAYER.BRICK : LAYER.PUNCHED]); s.tint = s.layer === LAYER.BRICK ? pick(BRICKS) : pick(wallsOf()); flatRoof(region === "gulf"); s.parapet = 1; s.plant = true; break; }
    case "sports": { s.storey = 6; s.bay = 8; s.layer = LAYER.CLAD; s.tint = pick(["#e8eaec", "#d0d6dc", ...METALS]); s.roof = area > 1500 && r() < 0.4 ? "round" : "flat"; s.roofLayer = LAYER.R_METAL; s.roofTint = pick(["#eceeef", "#d8dde2"]); s.pitch = 0.12; break; }
  }
  // tags win over the guesses
  if (/brick/.test(mat)) { s.layer = LAYER.BRICK; s.tint = pick(BRICKS); }
  else if (/glass/.test(mat)) { s.layer = pick([LAYER.GLASS_BLUE, LAYER.GLASS_GREEN, LAYER.GLASS_DARK]); s.tint = "#ffffff"; }
  else if (/metal|steel|aluminium/.test(mat)) { s.layer = s.kind === "tower" ? LAYER.RIBBON : LAYER.CLAD; }
  else if (/wood|timber/.test(mat)) { s.layer = LAYER.HOUSE; s.tint = pick(["#b08a64", "#9a7454", "#c8a880"]); }
  else if (/stone|sandstone|limestone|marble/.test(mat)) { s.layer = LAYER.PUNCHED; s.tint = pick(["#e2d6bc", "#d6c8a8", "#cfc2a6"]); }
  else if (/plaster|stucco/.test(mat)) { s.layer = region === "med" ? LAYER.STUCCO : LAYER.PUNCHED; }
  else if (/concrete/.test(mat) && s.layer === LAYER.STUCCO) s.layer = LAYER.PUNCHED;
  if (/^#[0-9a-f]{6}$/i.test(b.colour || "")) s.tint = b.colour;
  const rm = String(b.rmat || "").toLowerCase();
  if (/tile/.test(rm)) s.roofLayer = region === "japan" || region === "china" ? LAYER.R_JTILE : LAYER.R_TERRACOTTA;
  else if (/slate/.test(rm)) s.roofLayer = LAYER.R_SLATE;
  else if (/metal|tin|copper|zinc/.test(rm)) s.roofLayer = LAYER.R_METAL;
  else if (/shingle|asphalt/.test(rm)) s.roofLayer = LAYER.R_SHINGLE;
  else if (/concrete|gravel|tar|roof_tiles/.test(rm)) s.roofLayer = LAYER.R_FLAT;
  if (/^#[0-9a-f]{6}$/i.test(b.roofColour || "")) s.roofTint = b.roofColour;
  const tag = String(b.roof || "").toLowerCase().replace(/-/g, "_");
  const MAP = { gabled: "gabled", hipped: "hipped", half_hipped: "hipped", pyramidal: "pyramidal", skillion: "skillion", lean_to: "skillion", dome: "dome", onion: "onion", round: "round", gambrel: "gambrel", mansard: "mansard", saltbox: "gabled", flat: "flat", cone: "pyramidal", side_hipped: "hipped" };
  if (MAP[tag]) {
    s.roof = MAP[tag];
    if (s.roof !== "flat" && s.roofLayer === LAYER.R_FLAT) s.roofLayer = region === "med" || region === "sea" || region === "latam" ? LAYER.R_TERRACOTTA : region === "japan" || region === "china" ? LAYER.R_JTILE : LAYER.R_METAL;
    if (s.roof !== "flat" && !s.pitch) s.pitch = 0.5;
  }
  return s;
}

// ---------- geometry helpers ----------
function inPoly(x, y, pts) { let r = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r; } return r; }
const polyArea = (pts) => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return a / 2; };
function obb(pts, dirDeg = null) {
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x; cz += z; }
  cx /= pts.length; cz /= pts.length;
  // the box's axes: the longest edge's direction fits buildings better than principal axes
  let best = 0, th = 0;
  for (let i = 0; i < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], L = Math.hypot(bx - ax, bz - az); if (L > best) { best = L; th = Math.atan2(bz - az, bx - ax); } }
  const u = [Math.cos(th), Math.sin(th)], v = [-u[1], u[0]];
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of pts) { const a = (x - cx) * u[0] + (z - cz) * u[1], b = (x - cx) * v[0] + (z - cz) * v[1]; u0 = Math.min(u0, a); u1 = Math.max(u1, a); v0 = Math.min(v0, b); v1 = Math.max(v1, b); }
  return u1 - u0 >= v1 - v0 ? { c: [cx, cz], u, v, u0, u1, v0, v1 } : { c: [cx, cz], u: v, v: [-u[0], -u[1]], u0: v0, u1: v1, v0: -u1, v1: -u0 };
}
const at = (o, a, b) => [o.c[0] + o.u[0] * a + o.v[0] * b, o.c[1] + o.u[1] * a + o.v[1] * b];
// a polygon shrunk towards its centre (podium → tower, crowns); fine for the convex-ish footprints it's used on
function shrink(pts, k) { let cx = 0, cz = 0; for (const [x, z] of pts) { cx += x; cz += z; } cx /= pts.length; cz /= pts.length; return pts.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]); }

// ---------- the mesh ----------
// scene: fitted scene; gf: geo frame; groundAt(x, z); track: trackCorridor (clearPolygon); inStand(x, z);
// opts: { night, location }. Returns a THREE.Group of chunk meshes (userData: materials, dropped, moved, count).
export function buildingsMesh(scene, gf, groundAt, opts, track, inStand) {
  const region = regionOf(scene.location || opts.location);
  // land use around each building (from mapped areas), by a 50 m lookup grid of the area outlines
  const luCells = new Map();
  for (const a of scene.areas) {
    if (!a.lu) continue;
    const pts = a.pts.map(gf.xz); let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    if ((x1 - x0) * (z1 - z0) > 4e7) continue;
    for (let i = Math.floor(x0 / 50); i <= Math.floor(x1 / 50); i++) for (let j = Math.floor(z0 / 50); j <= Math.floor(z1 / 50); j++) { const k = `${i},${j}`; if (!luCells.has(k)) luCells.set(k, []); luCells.get(k).push([a.lu, pts]); }
  }
  const luAt = (x, z) => { for (const [lu, pts] of luCells.get(`${Math.floor(x / 50)},${Math.floor(z / 50)}`) || []) if (inPoly(x, z, pts)) return lu; return null; };

  const chunks = new Map();
  let A = null;
  const useChunk = (x, z) => {
    const key = `${Math.floor(x / 350)},${Math.floor(z / 350)}`;
    if (!chunks.has(key)) chunks.set(key, { pos: [], nor: [], tint: [], layer: [], shade: [], seed: [], uv: [] });
    A = chunks.get(key);
  };
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3(), tc = new THREE.Color();
  let seed = 0;
  // one flat face (fan): vs [x, y, z][], out: side to face, uvs per vertex, layer, tint, shade per vertex (or one)
  function face(vs, out, uvs, layer, tint, shade = 1) {
    e1.set(vs[1][0] - vs[0][0], vs[1][1] - vs[0][1], vs[1][2] - vs[0][2]);
    e2.set(vs[2][0] - vs[0][0], vs[2][1] - vs[0][1], vs[2][2] - vs[0][2]);
    nn.crossVectors(e1, e2);
    if (nn.lengthSq() < 1e-10) return;
    nn.normalize();
    let order = vs.map((_, i) => i);
    if (out && nn.x * out[0] + nn.y * out[1] + nn.z * out[2] < 0) { order = order.reverse(); nn.negate(); }
    tc.set(tint);
    for (let i = 1; i < order.length - 1; i++) for (const k of [order[0], order[i], order[i + 1]]) {
      A.pos.push(...vs[k]); A.nor.push(nn.x, nn.y, nn.z); A.tint.push(tc.r, tc.g, tc.b); A.layer.push(layer);
      A.shade.push(Array.isArray(shade) ? shade[k] : shade); A.seed.push(seed); A.uv.push(...(uvs ? uvs[k] : [0.5, 0.5]));
    }
  }
  // a roof face: uv in 4 m tiles laid along `dir` (the slope's horizontal direction)
  function roofFace(vs, out, layer, tint, dir = [1, 0]) {
    const uvs = vs.map(([x, , z]) => [(x * dir[1] - z * dir[0]) / 4, (x * dir[0] + z * dir[1]) / 4]);
    face(vs, out, uvs, layer, tint);
  }
  // walls of an outline between y0 and y1; u runs on round the outline so windows line up at corners
  function walls(pts, base, y0, y1, st, gx, gz) {
    let u = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], len = Math.hypot(bx - ax, bz - az);
      if (len < 0.15) continue;
      let nx = (bz - az) / len, nz = -(bx - ax) / len;
      if (inPoly((ax + bx) / 2 + nx * 0.3, (az + bz) / 2 + nz * 0.3, pts)) { nx = -nx; nz = -nz; }
      // a wall too short for a window bay is plain
      const u0 = u, u1 = u + len / (2 * st.bay);
      u = u1;
      const out = [nx, 0, nz], foot = 0.7, top = 1;
      const band = (ya, yb, layer, va, vb) => {
        if (yb - ya < 0.05) return;
        const sa = foot + (top - foot) * Math.min(1, (ya - base) / 10), sb = foot + (top - foot) * Math.min(1, (yb - base) / 10);
        face([[ax, ya, az], [bx, ya, bz], [bx, yb, bz], [ax, yb, az]], out, [[u0, va], [u1, va], [u1, vb], [u0, vb]], layer, st.tint, [sa, sa, sb, sb]);
      };
      const gH = st.shop ? 4.6 : 0;
      if (gH && y0 <= base + 0.5 && y1 - base > gH + 2) {
        band(y0, base + gH, LAYER.SHOP, (y0 - base) / gH, 1);
        band(base + gH, y1, st.layer, 0, (y1 - base - gH) / (2 * st.storey));
      } else band(y0, y1, st.layer, (y0 - base) / (2 * st.storey), (y1 - base) / (2 * st.storey));
    }
  }
  function flatTop(pts, y, layer, tint) {
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []); } catch { tris = []; }
    for (const [i, j, k] of tris) roofFace([[pts[i][0], y, pts[i][1]], [pts[j][0], y, pts[j][1]], [pts[k][0], y, pts[k][1]]], [0, 1, 0], layer, tint);
  }
  const box = (cx, cz, y, w, d, h, ang, layer, tint) => {
    const cu = Math.cos(ang), su = Math.sin(ang), P = (a, b, yy) => [cx + cu * a - su * b, yy, cz + su * a + cu * b];
    const xs = [-w / 2, w / 2], zs = [-d / 2, d / 2];
    const top = [P(xs[0], zs[0], y + h), P(xs[1], zs[0], y + h), P(xs[1], zs[1], y + h), P(xs[0], zs[1], y + h)];
    face(top, [0, 1, 0], null, layer, tint);
    const bot = [P(xs[0], zs[0], y), P(xs[1], zs[0], y), P(xs[1], zs[1], y), P(xs[0], zs[1], y)];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, mx = (bot[i][0] + bot[j][0]) / 2 - cx, mz = (bot[i][2] + bot[j][2]) / 2 - cz; face([bot[i], bot[j], top[j], top[i]], [mx, 0, mz], null, layer, tint, 0.85); }
  };
  const cyl = (cx, cz, y, rad, h, seg, layer, tint, capTint) => {
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * rad, cz + Math.sin(a0) * rad], p1 = [cx + Math.cos(a1) * rad, cz + Math.sin(a1) * rad];
      face([[p0[0], y, p0[1]], [p1[0], y, p1[1]], [p1[0], y + h, p1[1]], [p0[0], y + h, p0[1]]], [(p0[0] + p1[0]) / 2 - cx, 0, (p0[1] + p1[1]) / 2 - cz], null, layer, tint);
      face([[cx, y + h, cz], [p0[0], y + h, p0[1]], [p1[0], y + h, p1[1]]], [0, 1, 0], null, layer, capTint || tint);
    }
  };
  // pitched roofs on the footprint's box: gabled, hipped, gambrel, mansard, skillion, round (barrel)
  function pitched(pts, o, y1, st, wallTint) {
    const ov = st.roof === "round" ? 0.2 : 0.45, lenU = o.u1 - o.u0, lenV = o.v1 - o.v0;
    const half = lenV / 2, rise = Math.min(14, Math.max(1.2, (st.rh || st.pitch * half)));
    const A0 = at(o, o.u0 - ov, o.v0 - ov), B0 = at(o, o.u1 + ov, o.v0 - ov), C0 = at(o, o.u1 + ov, o.v1 + ov), D0 = at(o, o.u0 - ov, o.v1 + ov);
    const e = y1 - 0.12, P3 = (p, y) => [p[0], y, p[1]];
    const dirV = [o.v[0], o.v[1]], lt = st.roofTint, dk = shadeHex(st.roofTint, -0.2);
    const mid = (o.v0 + o.v1) / 2;
    if (st.roof === "skillion") {
      const hiA = at(o, o.u0 - ov, o.v1 + ov), hiB = at(o, o.u1 + ov, o.v1 + ov);
      roofFace([P3(A0, e), P3(B0, e), P3(hiB, e + rise), P3(hiA, e + rise)], [0, 1, 0], st.roofLayer, lt, dirV);
      // the high side's wall and the two triangles
      const wA = at(o, o.u0, o.v1), wB = at(o, o.u1, o.v1), wA0 = at(o, o.u0, o.v0), wB0 = at(o, o.u1, o.v0);
      face([P3(wA, e), P3(wB, e), P3(wB, e + rise), P3(wA, e + rise)], [o.v[0], 0, o.v[1]], null, st.layer === LAYER.CLAD ? LAYER.CLAD : LAYER.PLAIN, wallTint);
      face([P3(wA0, e), P3(wA, e), P3(wA, e + rise)], [-o.u[0], 0, -o.u[1]], null, LAYER.PLAIN, wallTint);
      face([P3(wB0, e), P3(wB, e), P3(wB, e + rise)], [o.u[0], 0, o.u[1]], null, LAYER.PLAIN, wallTint);
      return e + rise;
    }
    if (st.roof === "round") {
      const seg = 8;
      let prev = null;
      for (let k = 0; k <= seg; k++) {
        const t = k / seg, b = o.v0 - ov + (lenV + 2 * ov) * t, y = e + Math.sin(Math.PI * t) * rise;
        const cur = [P3(at(o, o.u0 - ov, b), y), P3(at(o, o.u1 + ov, b), y)];
        if (prev) roofFace([prev[0], prev[1], cur[1], cur[0]], [0, 1, 0], st.roofLayer, k <= seg / 2 ? lt : dk, [o.u[0], o.u[1]]);
        prev = cur;
      }
      // end walls (arched)
      for (const [ua, sgn] of [[o.u0, -1], [o.u1, 1]]) {
        const arc = [];
        for (let k = 0; k <= seg; k++) { const t = k / seg, b = o.v0 + lenV * t; arc.push(P3(at(o, ua, b), e + Math.sin(Math.PI * t) * rise)); }
        for (let k = 1; k < arc.length - 1; k++) face([arc[0], arc[k], arc[k + 1]], [o.u[0] * sgn, 0, o.u[1] * sgn], null, LAYER.PLAIN, wallTint);
      }
      return e + rise;
    }
    if (st.roof === "gambrel" || st.roof === "mansard") {
      // two pitches each side: steep lower, shallow upper
      const k1 = 0.32, h1 = rise * 0.7;
      const L1 = at(o, o.u0 - (st.roof === "mansard" ? -lenV * k1 : ov), o.v0 + lenV * k1), R1 = at(o, o.u1 + (st.roof === "mansard" ? -lenV * k1 : ov), o.v0 + lenV * k1);
      const L2 = at(o, o.u0 - (st.roof === "mansard" ? -lenV * k1 : ov), o.v1 - lenV * k1), R2 = at(o, o.u1 + (st.roof === "mansard" ? -lenV * k1 : ov), o.v1 - lenV * k1);
      const T1 = at(o, o.u0 - (st.roof === "mansard" ? -lenV * 0.5 : ov), mid), T2 = at(o, o.u1 + (st.roof === "mansard" ? -lenV * 0.5 : ov), mid);
      roofFace([P3(A0, e), P3(B0, e), P3(R1, e + h1), P3(L1, e + h1)], [-o.v[0], 1, -o.v[1]], st.roofLayer, lt, dirV);
      roofFace([P3(L1, e + h1), P3(R1, e + h1), P3(T2, e + rise), P3(T1, e + rise)], [-o.v[0], 1, -o.v[1]], st.roofLayer, lt, dirV);
      roofFace([P3(C0, e), P3(D0, e), P3(L2, e + h1), P3(R2, e + h1)], [o.v[0], 1, o.v[1]], st.roofLayer, dk, dirV);
      roofFace([P3(L2, e + h1), P3(R2, e + h1), P3(T2, e + rise), P3(T1, e + rise)], [o.v[0], 1, o.v[1]], st.roofLayer, dk, dirV);
      if (st.roof === "mansard") {
        roofFace([P3(D0, e), P3(A0, e), P3(L1, e + h1), P3(L2, e + h1)], [-o.u[0], 1, -o.u[1]], st.roofLayer, lt, [o.u[0], o.u[1]]);
        roofFace([P3(L1, e + h1), P3(L2, e + h1), P3(T1, e + rise)], [-o.u[0], 1, -o.u[1]], st.roofLayer, lt, [o.u[0], o.u[1]]);
        roofFace([P3(B0, e), P3(C0, e), P3(R2, e + h1), P3(R1, e + h1)], [o.u[0], 1, o.u[1]], st.roofLayer, dk, [o.u[0], o.u[1]]);
        roofFace([P3(R1, e + h1), P3(R2, e + h1), P3(T2, e + rise)], [o.u[0], 1, o.u[1]], st.roofLayer, dk, [o.u[0], o.u[1]]);
      } else for (const [ua, sgn] of [[o.u0, -1], [o.u1, 1]]) {
        const p = [P3(at(o, ua, o.v0), e), P3(at(o, ua, o.v0 + lenV * k1), e + h1), P3(at(o, ua, mid), e + rise), P3(at(o, ua, o.v1 - lenV * k1), e + h1), P3(at(o, ua, o.v1), e)];
        for (let k = 1; k < p.length - 1; k++) face([p[0], p[k], p[k + 1]], [o.u[0] * sgn, 0, o.u[1] * sgn], null, LAYER.PLAIN, wallTint);
      }
      return e + rise;
    }
    // gabled / hipped
    const inset = st.roof === "hipped" ? Math.min(lenV / 2, lenU / 2) : -ov;
    const R1 = at(o, o.u0 + inset, mid), R2 = at(o, o.u1 - inset, mid);
    roofFace([P3(A0, e), P3(B0, e), P3(R2, e + rise), P3(R1, e + rise)], [-o.v[0], 1, -o.v[1]], st.roofLayer, lt, dirV);
    roofFace([P3(C0, e), P3(D0, e), P3(R1, e + rise), P3(R2, e + rise)], [o.v[0], 1, o.v[1]], st.roofLayer, dk, dirV);
    if (st.roof === "hipped") {
      roofFace([P3(D0, e), P3(A0, e), P3(R1, e + rise)], [-o.u[0], 0.5, -o.u[1]], st.roofLayer, lt, [o.u[0], o.u[1]]);
      roofFace([P3(B0, e), P3(C0, e), P3(R2, e + rise)], [o.u[0], 0.5, o.u[1]], st.roofLayer, dk, [o.u[0], o.u[1]]);
    } else for (const [ua, sgn] of [[o.u0, -1], [o.u1, 1]]) {
      // gable end: wall to the ridge (its windows continue, the triangle is plain above the top floor)
      face([P3(at(o, ua, o.v0), e), P3(at(o, ua, o.v1), e), P3(at(o, ua, mid), e + rise)], [o.u[0] * sgn, 0, o.u[1] * sgn], null, LAYER.PLAIN, wallTint);
    }
    // a chimney on some houses
    if (st.kind === "house" && st.roofLayer !== LAYER.R_FLAT && Math.abs(Math.sin(seed * 12.9898)) < 0.4) { const [x, z] = at(o, o.u0 + lenU * 0.72, mid + lenV * 0.18); box(x, z, e + rise * 0.55, 0.6, 0.6, rise * 0.7 + 0.6, Math.atan2(o.u[1], o.u[0]), LAYER.BRICK, "#ffffff"); }
    return e + rise;
  }
  function pyramid(pts, gx, gz, y1, st) {
    const lenMin = Math.sqrt(Math.abs(polyArea(pts))), rise = st.rh || Math.max(1.2, Math.min(10, lenMin * st.pitch * 0.5)), apex = [gx, y1 + rise, gz];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], mx = (p[0] + q[0]) / 2 - gx, mz = (p[1] + q[1]) / 2 - gz, ml = Math.hypot(mx, mz) || 1;
      roofFace([[p[0], y1, p[1]], [q[0], y1, q[1]], apex], [mx, 1, mz], st.roofLayer, i % 2 ? st.roofTint : shadeHex(st.roofTint, -0.15), [mx / ml, mz / ml]);
    }
    return y1 + rise;
  }
  function dome(pts, gx, gz, y1, st, onion) {
    let rad = 0; for (const [x, z] of pts) rad = Math.max(rad, Math.hypot(x - gx, z - gz));
    rad = Math.min(rad, Math.sqrt(Math.abs(polyArea(pts)) / Math.PI) * 1.05);
    const rings = 7, seg = 14, prof = [];
    for (let k = 0; k <= rings; k++) {
      const t = k / rings;
      if (onion) { const a = t * Math.PI; prof.push([rad * (0.9 * Math.sin(a * 0.85 + 0.25) + 0.12 * Math.sin(a * 2)) * (1 - t * t * 0.85), y1 + rad * 1.5 * t]); }
      else prof.push([rad * Math.cos((t * Math.PI) / 2), y1 + rad * 0.85 * Math.sin((t * Math.PI) / 2)]);
    }
    for (let k = 0; k < rings; k++) for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2, [r0, y0] = prof[k], [r1, yy] = prof[k + 1];
      const P = (rr, y, a) => [gx + Math.cos(a) * rr, y, gz + Math.sin(a) * rr];
      const vs = r1 < 0.01 ? [P(r0, y0, a0), P(r0, y0, a1), P(0, yy, 0)] : [P(r0, y0, a0), P(r0, y0, a1), P(r1, yy, a1), P(r1, yy, a0)];
      roofFace(vs, [Math.cos((a0 + a1) / 2), 0.5, Math.sin((a0 + a1) / 2)], st.roofLayer, st.roofTint, [Math.cos(a0), Math.sin(a0)]);
    }
    return y1 + rad;
  }
  // flat roof: the deck, a parapet, rooftop plant, water tanks (Latin America), a crown on towers
  function flatRoof(pts, o, y1, st, area, r) {
    const par = st.parapet;
    flatTop(pts, y1, LAYER.R_FLAT, st.roofTint);
    if (par) for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], len = Math.hypot(bx - ax, bz - az);
      if (len < 0.2) continue;
      let nx = (bz - az) / len, nz = -(bx - ax) / len;
      if (inPoly((ax + bx) / 2 + nx * 0.3, (az + bz) / 2 + nz * 0.3, pts)) { nx = -nx; nz = -nz; }
      // (the outer face is the wall itself, carried up – see walls(); here the inside face and the coping)
      const ix = -nx * 0.3, iz = -nz * 0.3;
      if (area > 300) face([[ax + ix, y1, az + iz], [bx + ix, y1, bz + iz], [bx + ix, y1 + par, bz + iz], [ax + ix, y1 + par, az + iz]], [-nx, 0, -nz], null, LAYER.PLAIN, st.tint, 0.8);
      face([[ax, y1 + par, az], [bx, y1 + par, bz], [bx + ix, y1 + par, bz + iz], [ax + ix, y1 + par, az + iz]], [0, 1, 0], null, LAYER.PLAIN, "#d8d6d0");
    }
    const lenU = o.u1 - o.u0, lenV = o.v1 - o.v0, ang = Math.atan2(o.u[1], o.u[0]);
    if (st.plant && area > 250) {
      const n = Math.min(4, Math.floor(area / 700));
      for (let k = 0, tries = 0; k < n && tries < 40; tries++) {
        const a = o.u0 + r() * lenU, b = o.v0 + r() * lenV, [x, z] = at(o, a, b), w = 2 + r() * 5, d = 1.5 + r() * 3.5;
        if (!inPoly(x, z, pts) || !inPoly(...at(o, a + w / 2, b + d / 2), pts) || !inPoly(...at(o, a - w / 2, b - d / 2), pts)) continue;
        box(x, z, y1, w, d, 1 + r() * 2.2, ang, LAYER.R_METAL, r() < 0.5 ? "#a8acb0" : "#c4c8cc"); k++;
      }
    }
    if (st.tanks) {
      const n = Math.max(1, Math.min(4, Math.floor(area / 120)));
      for (let k = 0, tries = 0; k < n && tries < 20; tries++) { const [x, z] = at(o, o.u0 + r() * lenU, o.v0 + r() * lenV); if (!inPoly(x, z, pts)) continue; cyl(x, z, y1, 0.75, 1.3, 8, LAYER.PLAIN, r() < 0.6 ? "#2c4f86" : "#2a2a2a"); k++; }
    }
    return y1 + par;
  }

  let dropped = 0, moved = 0, count = 0;
  for (const b of scene.buildings) {
    if (b.kind === "grandstand") continue;   // stands.js builds these, with their seats
    if (opts.landmarks?.skip(b)) continue;   // modelled as the real building (landmarks.js)
    let pts = b.pts.map(gf.xz);
    if (pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
    if (pts.length < 3) continue;
    if (inStand) { let cx = 0, cz = 0; for (const [x, z] of pts) { cx += x; cz += z; } if (inStand(cx / pts.length, cz / pts.length)) { dropped++; continue; } }
    if (track && !(b.min >= 5)) {
      const fixed = track.clearPolygon(pts);
      if (!fixed) { dropped++; continue; }
      if (fixed !== pts) { moved++; pts = fixed; }
    }
    const area = Math.abs(polyArea(pts));
    if (area < 6) continue;
    let gx = 0, gz = 0; for (const [x, z] of pts) { gx += x; gz += z; } gx /= pts.length; gz /= pts.length;
    // a stable random stream per building (its position), so it looks the same every time
    const r = rand(Math.floor(gx * 7.31) * 73856093 ^ Math.floor(gz * 3.17) * 19349663);
    seed = r();
    useChunk(gx, gz);
    let base = Infinity;
    for (const [x, z] of pts) base = Math.min(base, groundAt(x, z));
    if (!Number.isFinite(base)) continue;
    // guessed heights vary so a district isn't one flat slab; floors given → their height
    let H = b.h;
    if (b.est) H *= 0.75 + r() * 0.6;
    if (b.est && area > 300 && H < 9) H = Math.max(H, 6 + Math.floor(r() * 4) * 3.1);
    const st = styleOf(b, area, H, luAt(gx, gz), region, r);
    if (opts.landmarks?.restyle(b)?.glass) { st.layer = H > 60 ? LAYER.HOTEL : LAYER.GLASS_BLUE; st.tint = "#f2f2ee"; st.roof = "flat"; st.plant = false; st.crown = false; st.podium = false; }
    if (b.lv && !b.est) st.storey = Math.max(2.6, Math.min(6, (H - (st.roof !== "flat" && b.rh ? b.rh : 0)) / b.lv));
    st.rh = b.rh || null;
    // the walls stop below a pitched roof's height when the total height is tagged
    const pitchedRoof = !["flat", "dome", "onion"].includes(st.roof);
    const o = obb(pts), lenU = o.u1 - o.u0, lenV = o.v1 - o.v0, rect = area / Math.max(1, lenU * lenV);
    let roof = st.roof;
    if (pitchedRoof && roof !== "pyramidal" && (rect < 0.72 || area > 4000)) roof = rect > 0.55 && area < 900 ? "pyramidal" : "flat";
    if (roof === "flat" && pitchedRoof) { st.roofLayer = st.roofLayer === LAYER.R_METAL ? LAYER.R_METAL : LAYER.R_FLAT; st.parapet = st.parapet || 0.6; }
    st.roof = roof;
    const roofH = roof === "flat" ? 0 : roof === "dome" || roof === "onion" ? 0 : st.rh || (roof === "pyramidal" ? Math.min(10, Math.sqrt(area) * st.pitch * 0.5) : Math.min(14, st.pitch * lenV / 2));
    const y0 = base + (b.min || 0);
    let y1 = base + Math.max(H - (b.est ? 0 : Math.min(roofH, H * 0.45)), (b.min || 0) + 2.5);
    // massing for tall buildings: a podium under the tower, a set-back crown at the top
    if (st.podium && rect > 0.7) {
      const podH = Math.min(18, Math.max(9, H * 0.18)), tower = shrink(pts, 0.68);
      walls(pts, base, y0, base + podH + 1, { ...st, layer: st.kind === "tower" ? LAYER.RIBBON : LAYER.PUNCHED, tint: st.tint === "#ffffff" ? "#d8d6d0" : st.tint }, gx, gz);
      flatRoof(pts, o, base + podH, { ...st, plant: true, parapet: 1 }, area, r);
      pts = tower;
    }
    const crownH = st.crown && rect > 0.75 ? Math.min(12, H * 0.08) : 0;
    const parTop = roof === "flat" && !crownH ? st.parapet || 0 : 0;
    walls(pts, base, st.podium && rect > 0.7 ? base + Math.min(18, Math.max(9, H * 0.18)) : y0, y1 - crownH + parTop, st, gx, gz);
    let top = y1;
    if (crownH) {
      const crown = shrink(pts, 0.86);
      flatTop(pts, y1 - crownH, LAYER.R_FLAT, st.roofTint);
      walls(crown, base, y1 - crownH, y1 + (st.parapet || 0), { ...st, layer: st.layer === LAYER.RIBBON ? LAYER.GLASS_DARK : st.layer }, gx, gz);
      pts = crown;
    }
    const oo = crownH ? obb(pts) : o;
    if (roof === "flat") top = flatRoof(pts, oo, y1, st, Math.abs(polyArea(pts)), r);
    else if (roof === "pyramidal") top = pyramid(pts, gx, gz, y1, st);
    else if (roof === "dome" || roof === "onion") { flatTop(pts, y1, LAYER.R_FLAT, st.roofTint); top = dome(pts, gx, gz, y1, st, roof === "onion"); }
    else top = pitched(pts, oo, y1, st, st.layer === LAYER.BRICK || st.layer === LAYER.CLAD ? st.tint : st.tint);
    // church tower
    if (st.kind === "church" && area > 150) { const [x, z] = at(o, o.u0 + 2.5, (o.v0 + o.v1) / 2); box(x, z, base, 4.5, 4.5, H + 9, Math.atan2(o.u[1], o.u[0]), LAYER.PLAIN, st.tint); }
    if (st.kind === "mosque" && area > 200) { const [x, z] = at(o, o.u1 - 2, o.v0 + 2); cyl(x, z, base, 1.4, H + 18, 10, LAYER.PLAIN, st.tint, st.roofTint); }
    count++;
  }
  if (!count) return null;
  const mat = material(opts.night);
  // far away (beyond ~900 m) windows can't be seen: those chunks use a plain material, much cheaper to draw
  const far = farMaterial(opts.night);
  const group = new THREE.Group();
  group.name = "buildings";
  for (const ch of chunks.values()) {
    if (!ch.pos.length) continue;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(ch.pos, 3));
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(ch.nor, 3));
    geom.setAttribute("aTint", new THREE.Float32BufferAttribute(ch.tint, 3));
    geom.setAttribute("aLayer", new THREE.Float32BufferAttribute(ch.layer, 1));
    geom.setAttribute("aShade", new THREE.Float32BufferAttribute(ch.shade, 1));
    geom.setAttribute("aSeed", new THREE.Float32BufferAttribute(ch.seed, 1));
    geom.setAttribute("aUv", new THREE.Float32BufferAttribute(ch.uv, 2));
    geom.computeBoundingSphere(); geom.computeBoundingBox();
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.userData = { material: mat, materials: [mat, far], dropped, moved, count, region,
    update(cam) {
      for (const m of group.children) {
        const c = m.geometry.boundingSphere, d = Math.hypot(c.center.x - cam.x, c.center.y - cam.y, c.center.z - cam.z) - c.radius;
        m.material = d > 900 ? far : mat;
      }
    } };
  return group;
}
