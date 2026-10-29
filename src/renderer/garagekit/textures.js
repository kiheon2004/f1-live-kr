// The garage kit's small procedural textures (v0.49): drawn on a canvas once, no image files, no photos, no logos.
//
// Sizes are kept small (64–1024 px) – a repeated tile only where the real surface repeats (carbon weave, a blanket's
// quilting, brushed grain); the floor is ONE texture stretched over the whole floor (no tile: a painted floor's mottling
// and scuffs don't repeat, and a repeat is the first thing the eye finds on a big flat surface). Colours are sRGB; data
// textures (roughness) are linear. Without a DOM (tests) every function returns null and the materials go untextured.
import * as THREE from "../vendor/three.module.js";
import { rng, hex, lum } from "./style.js";

const hasDom = typeof document !== "undefined";
const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const tex = (c, { srgb = true, repeat = false, aniso = 4 } = {}) => {
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
// value noise on a lattice (seeded), smooth-stepped – fBm of a few octaves; v in 0…1
function noise2(seed) {
  const r = rng(seed), N = 256, P = new Float32Array(N * N); for (let i = 0; i < P.length; i++) P[i] = r();
  const at = (x, y) => P[((y & (N - 1)) * N) + (x & (N - 1))], s = (t) => t * t * (3 - 2 * t);
  const v = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = s(x - xi), fy = s(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
  return (x, y, oct = 4) => { let f = 1, a = 0.5, t = 0, n = 0; for (let o = 0; o < oct; o++) { t += a * v(x * f, y * f); n += a; f *= 2.03; a *= 0.5; } return t / n; };
}
const rgbOf = (c) => { const n = parseInt(hex(c).slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

// The painted floor (one texture over the whole floor, w × d m): the colour – the paint's tone with a slow mottling
// (±3 %), the flake of an epoxy floor (fine speckle), and a few faint tyre scuffs and drips round the car's place –
// and its roughness map (G channel: three.js reads roughness from G) – satin paint 0.5–0.7, the scuffs and the walked
// lanes a touch smoother. Never below 0.42: a painted floor is not a wet mirror (request §11).
export function floorTextures(tone, w, d, seed = 1, car = null) {
  if (!hasDom) return { map: null, rough: null };
  const k = Math.max(w, d), S = 1024, cw = Math.round(S * Math.min(1, w / k)), ch = Math.round(S * Math.min(1, d / k));
  const col = canvas(cw, ch), rough = canvas(cw, ch), gc = col.getContext("2d"), gr = rough.getContext("2d");
  const n = noise2(seed), n2 = noise2(seed + 7), r = rng(seed + 3), [R, G, B] = rgbOf(tone), dark = lum(tone) < 0.45;
  const ci = gc.createImageData(cw, ch), ri = gr.createImageData(cw, ch), px = w / cw;   // (m per pixel)
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const mx = x * px, my = y * px, slow = n(mx / 3.5, my / 3.5, 3) - 0.5, grain = n2(mx * 9, my * 9, 2) - 0.5;
    const flake = r() < 0.012 ? (r() - 0.5) * 0.16 : 0;
    const f = 1 + slow * 0.07 + grain * 0.025 + flake, i = (y * cw + x) * 4;
    ci.data[i] = Math.min(255, R * f); ci.data[i + 1] = Math.min(255, G * f); ci.data[i + 2] = Math.min(255, B * f); ci.data[i + 3] = 255;
    const ro = 0.6 + slow * 0.12 + grain * 0.06; ri.data[i] = 0; ri.data[i + 1] = Math.round(255 * Math.max(0.42, Math.min(0.85, ro))); ri.data[i + 2] = 0; ri.data[i + 3] = 255;
  }
  gc.putImageData(ci, 0, 0); gr.putImageData(ri, 0, 0);
  // the scuffs: a few faint tyre arcs and drips where the car stands (restrained: ≤ 6 % darker, request §11)
  if (car) {
    const toPx = (m) => m / px, cx = cw / 2;
    gc.globalCompositeOperation = "multiply"; gr.globalCompositeOperation = "source-over";
    for (let i = 0; i < 7; i++) {
      const x0 = cx + toPx((r() - 0.5) * (car.width + 0.6)), z0 = toPx(car.z0 + r() * car.length), len = toPx(0.8 + r() * 2.2), bend = (r() - 0.5) * 0.6;
      gc.strokeStyle = `rgba(${dark ? 40 : 120},${dark ? 42 : 122},${dark ? 44 : 126},${0.05 + r() * 0.05})`; gc.lineWidth = toPx(0.18 + r() * 0.12); gc.lineCap = "round";
      gc.beginPath(); gc.moveTo(x0, z0); gc.quadraticCurveTo(x0 + len * bend, z0 + len / 2, x0 + len * bend * 0.4, z0 + len); gc.stroke();
      gr.strokeStyle = "rgba(0,120,0,0.18)"; gr.lineWidth = gc.lineWidth; gr.beginPath(); gr.moveTo(x0, z0); gr.quadraticCurveTo(x0 + len * bend, z0 + len / 2, x0 + len * bend * 0.4, z0 + len); gr.stroke();
    }
    for (let i = 0; i < 5; i++) { const x0 = cx + toPx((r() - 0.5) * car.width), z0 = toPx(car.z0 + r() * car.length), rr = toPx(0.05 + r() * 0.12);
      gc.fillStyle = `rgba(90,90,96,${0.06 + r() * 0.05})`; gc.beginPath(); gc.ellipse(x0, z0, rr * 1.4, rr, r() * 3, 0, Math.PI * 2); gc.fill(); }
    gc.globalCompositeOperation = "source-over";
  }
  return { map: tex(col, { aniso: 8 }), rough: tex(rough, { srgb: false, aniso: 8 }) };
}

// brushed metal / powder coat grain as a roughness map (G), a repeating tile – 256²; streaks along u
export function brushedRough(seed = 11, base = 0.34, spread = 0.12) {
  if (!hasDom) return null;
  const N = 256, c = canvas(N, N), g = c.getContext("2d"), im = g.createImageData(N, N), n = noise2(seed);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = n(x / 64, y * 0.9, 2) - 0.5, i = (y * N + x) * 4;
    im.data[i + 1] = Math.round(255 * Math.max(0.05, Math.min(1, base + v * spread * 2))); im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return tex(c, { srgb: false, repeat: true });
}
// rubber: a fine grain (colour), a tile
export function rubberMap(seed = 21) {
  if (!hasDom) return null;
  const N = 128, c = canvas(N, N), g = c.getContext("2d"), im = g.createImageData(N, N), n = noise2(seed);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = 225 + (n(x / 6, y / 6, 2) - 0.5) * 50, i = (y * N + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0);
  return tex(c, { repeat: true });
}
// a blanket's quilting (white on grey – multiplied by the material's colour): diamond stitch lines, a tile of ~12 cm
export function quiltMap() {
  if (!hasDom) return null;
  const N = 128, c = canvas(N, N), g = c.getContext("2d");
  g.fillStyle = "#ececec"; g.fillRect(0, 0, N, N);
  const gr = g.createRadialGradient(N / 2, N / 2, 4, N / 2, N / 2, N * 0.7); gr.addColorStop(0, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(0,0,0,0.18)");
  g.fillStyle = gr; g.fillRect(0, 0, N, N);
  g.strokeStyle = "rgba(40,40,40,0.55)"; g.lineWidth = 2; g.setLineDash([5, 3]);
  for (const [a, b, c2, d] of [[0, 0, N, N], [N, 0, 0, N], [-N / 2, N / 2, N / 2, -N / 2], [N / 2, N * 1.5, N * 1.5, N / 2], [N / 2, -N / 2, N * 1.5, N / 2], [-N / 2, N / 2, N / 2, N * 1.5]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke(); }
  return tex(c, { repeat: true });
}
// 2×2 twill carbon, the car's own scale (5 mm tows) – a repeating tile
export function carbonMap() {
  if (!hasDom) return null;
  const N = 64, c = canvas(N, N), g = c.getContext("2d"), tow = N / 8;
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const warp = ((i + j) >> 1) % 2 === 0, gr = warp ? g.createLinearGradient(i * tow, 0, (i + 1) * tow, 0) : g.createLinearGradient(0, j * tow, 0, (j + 1) * tow), v = warp ? 36 : 25;
    gr.addColorStop(0, `rgb(${v - 6},${v - 5},${v - 3})`); gr.addColorStop(0.5, `rgb(${v + 7},${v + 8},${v + 10})`); gr.addColorStop(1, `rgb(${v - 6},${v - 5},${v - 3})`);
    g.fillStyle = gr; g.fillRect(i * tow, j * tow, tow, tow);
  }
  return tex(c, { repeat: true });
}
// The monitors' pictures (one atlas of four screens, shared by every bay): timing-like rows and telemetry traces in
// dim colours – made-up data, never readable as a real team's numbers; no text that claims to be real.
export function screensAtlas(seed = 5) {
  if (!hasDom) return null;
  const W = 512, H = 512, c = canvas(W, H), g = c.getContext("2d"), r = rng(seed);
  for (let q = 0; q < 4; q++) {
    const ox = (q % 2) * 256, oy = Math.floor(q / 2) * 256;
    g.fillStyle = "#0b1016"; g.fillRect(ox, oy, 256, 256);
    g.fillStyle = "#141c26"; g.fillRect(ox + 6, oy + 6, 244, 18);
    if (q % 2 === 0) {
      for (let k = 0; k < 4; k++) {
        const y0 = oy + 34 + k * 54; g.strokeStyle = "#1f2a36"; g.strokeRect(ox + 8, y0, 240, 46);
        g.strokeStyle = ["#46c2ff", "#ffcc33", "#5be37d", "#ff5d5d"][(k + q) % 4]; g.lineWidth = 1.6; g.beginPath();
        let v = 0.5; for (let x = 0; x <= 240; x += 3) { v = Math.max(0.05, Math.min(0.95, v + (r() - 0.5) * 0.2)); g.lineTo(ox + 8 + x, y0 + 46 - v * 46); } g.stroke();
      }
    } else {
      for (let k = 0; k < 12; k++) { const y0 = oy + 32 + k * 18; g.fillStyle = k % 2 ? "#101721" : "#0d131b"; g.fillRect(ox + 6, y0, 244, 16);
        g.fillStyle = "#9fb0c2"; g.fillRect(ox + 12, y0 + 5, 14 + r() * 10, 6); g.fillRect(ox + 60, y0 + 5, 40 + r() * 50, 6); g.fillStyle = ["#7c4dff", "#5be37d", "#ffcc33"][k % 3]; g.fillRect(ox + 200, y0 + 5, 30 * r() + 10, 6); }
    }
  }
  return tex(c, {});
}
// The team's sign: its name in large type on its colour band (text only – no logo; the name is what the feed calls the
// team). Wide (aspect 4:1). And a driver board: number and name.
export function signTexture(name, colour, dark = false, sub = "") {
  if (!hasDom) return null;
  const W = 1024, H = 256, c = canvas(W, H), g = c.getContext("2d"), col = hex(colour), onCol = lum(col) > 0.6 ? "#111317" : "#ffffff";
  g.fillStyle = dark ? "#16181b" : "#f4f5f6"; g.fillRect(0, 0, W, H);
  g.fillStyle = col; g.fillRect(0, H - 46, W, 46); g.fillRect(0, 0, 18, H - 46);
  g.fillStyle = dark ? "#f2f3f5" : "#15171a"; g.textBaseline = "middle"; g.textAlign = "left";
  let size = 112; const txt = String(name || "").toUpperCase();
  do { g.font = `800 ${size}px "Helvetica Neue", Arial, sans-serif`; size -= 4; } while (g.measureText(txt).width > W - 90 && size > 30);
  g.fillText(txt, 52, (H - 46) / 2 + 4);
  if (sub) { g.fillStyle = onCol; g.font = `600 28px "Helvetica Neue", Arial, sans-serif`; g.fillText(sub, 52, H - 23); }
  return tex(c, { aniso: 8 });
}
export function boardTexture(num, label, colour) {
  if (!hasDom) return null;
  const W = 512, H = 128, c = canvas(W, H), g = c.getContext("2d"), col = hex(colour);
  g.fillStyle = "#111316"; g.fillRect(0, 0, W, H); g.fillStyle = col; g.fillRect(0, 0, 128, H);
  g.fillStyle = lum(col) > 0.6 ? "#111316" : "#ffffff"; g.font = `800 76px "Helvetica Neue", Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(num ?? ""), 64, H / 2 + 4);
  g.fillStyle = "#f2f3f5"; g.textAlign = "left"; g.font = `700 54px "Helvetica Neue", Arial, sans-serif`; g.fillText(String(label || "").toUpperCase().slice(0, 14), 150, H / 2 + 3);
  return tex(c, {});
}
// soft dark blob under a car / a module (contact shadow, an ambient-occlusion stand-in): a rounded rectangle blurred –
// one shared 128×256 texture stretched to the footprint
export function contactTexture() {
  if (!hasDom) return null;
  const W = 128, H = 256, c = canvas(W, H), g = c.getContext("2d"), im = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = Math.abs(x / (W - 1) * 2 - 1), v = Math.abs(y / (H - 1) * 2 - 1);
    const dx = Math.max(0, u - 0.55) / 0.45, dy = Math.max(0, v - 0.72) / 0.28, d = Math.min(1, Math.hypot(dx, dy));
    const a = Math.pow(1 - d, 1.8) * (0.75 + 0.25 * (1 - Math.max(u, v) ** 4)), i = (y * W + x) * 4;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = 0; im.data[i + 3] = Math.round(255 * a);
  }
  g.putImageData(im, 0, 0);
  return tex(c, { srgb: false });
}
// wall lining panels: a soft vertical gradient (lighter near the top, a dirtier skirting band) – one per bay, sRGB
export function panelTexture(base, accent, band = "low", dark = false, seed = 3) {
  if (!hasDom) return null;
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext("2d"), n = noise2(seed), im = g.createImageData(W, H), [R, G, B] = rgbOf(base), [aR, aG, aB] = rgbOf(accent);
  const bandAt = band === "high" ? [0.62, 0.68] : band === "split" ? [0.42, 0.47] : band === "stripes" ? null : [0.12, 0.18];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = 1 - y / (H - 1), f = 0.94 + v * 0.06 + (n(x / 30, y / 30, 2) - 0.5) * 0.03, i = (y * W + x) * 4;
    let rgb = [R * f, G * f, B * f];
    const inBand = bandAt ? v >= bandAt[0] && v <= bandAt[1] : (x % 128) < 10 && v > 0.08;
    if (inBand) rgb = [aR, aG, aB];
    if (v < 0.04) rgb = rgb.map((q) => q * (dark ? 0.7 : 0.55));
    im.data[i] = Math.min(255, rgb[0]); im.data[i + 1] = Math.min(255, rgb[1]); im.data[i + 2] = Math.min(255, rgb[2]); im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const t = tex(c, {}); t.wrapS = THREE.RepeatWrapping; return t;
}
