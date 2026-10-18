// Night lighting for the 3D view. A night circuit has thousands of lights – floodlights along the track, street
// lights, car parks – far too many for real three.js lights. Instead:
//   – a light field: a top-down map of how much light falls where (lamp pools along the streets, the floodlit
//     band along the track, the pit lane) and a height map of the ground under it. Every lit material samples it
//     (nightLit) and takes it as light falling on its surface, so it brightens what is there by its own colour –
//     grass stays green, tarmac grey – instead of glowing over it. Walls take the light of the street in front
//     of them, fading above the height of the lamps; roofs high above the street stay dark.
//   – the lamps themselves: posts with a lit lens (instanced) and a glare point at each lens (Points, sized in
//     metres, never smaller than a couple of pixels so a far street still sparkles), red aircraft warning lights
//     on tall buildings.
// The uniforms (NL) are shared by every patched material: map3d switches them on at night and points them at the
// world's field.
import * as THREE from "./vendor/three.module.js";

const blank = (type = THREE.UnsignedByteType) => {
  const t = type === THREE.HalfFloatType
    ? new THREE.DataTexture(new Uint16Array([0]), 1, 1, THREE.RedFormat, type)
    : new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat, type);
  t.needsUpdate = true; t.userData.shared = true; return t;
};
const BLANK = { tex: blank(), hgt: blank(THREE.HalfFloatType) };
export const NL = {
  tex: { value: BLANK.tex },                               // light falling on the ground (linear RGB)
  hgt: { value: BLANK.hgt },                               // ground height (m) under the field
  ext: { value: new THREE.Vector4(0, 0, 1, 1) },           // x0, z0, width, depth (scene metres)
  gain: { value: 0 },                                      // 0 by day
  time: { value: 0 },                                      // seconds, for blinking lights and TVs
};

// A light field going away (its world rebuilt or left): its textures freed, and the shared uniforms pointed back at the
// blank ones if they still showed it – a material drawn with a freed texture in a uniform would upload it again, and
// that copy would never be freed.
export function releaseField(f) {
  if (!f) return;
  if (NL.tex.value === f.tex) { NL.tex.value = BLANK.tex; NL.gain.value = 0; }
  if (NL.hgt.value === f.hgt) NL.hgt.value = BLANK.hgt;
  f.tex?.dispose(); f.hgt?.dispose();
}

// ---------- materials ----------
// Adds the light field to a lit material (standard, physical, lambert, phong; instanced too). Chains an existing
// onBeforeCompile and keeps its program key apart. Each material once – a shared one (the cars' common parts, the
// garage equipment) however many objects use it; a copy (material.clone() doesn't carry onBeforeCompile) is a new one.
const patched = new WeakSet();
export function nightLit(m) {
  if (!m || patched.has(m) || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return;
  patched.add(m);
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.call(m);
  m.onBeforeCompile = function (sh, r) {
    prev?.call(this, sh, r);
    sh.uniforms.nlTex = NL.tex; sh.uniforms.nlHgt = NL.hgt; sh.uniforms.nlExt = NL.ext; sh.uniforms.nlGain = NL.gain;
    sh.uniforms.tnTex = TN.tex; sh.uniforms.tnExt = TN.ext; sh.uniforms.tnOn = TN.on; sh.uniforms.tnLamp = TN.lamp; sh.uniforms.tnAmb = TN.amb;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vNlPos;")
      .replace("#include <project_vertex>", `#include <project_vertex>
        { vec4 nlW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            nlW = instanceMatrix * nlW;
          #endif
          vNlPos = (modelMatrix * nlW).xyz; }`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
        ${NL_GLSL}`)
      .replace("#include <lights_fragment_maps>", `#include <lights_fragment_maps>
        #if defined( RE_IndirectDiffuse )
          if (nlGain > 0.0) irradiance += nlLight(vNlPos, normalize((vec4(normal, 0.0) * viewMatrix).xyz));
        #endif
        ${TN_FRAG}`);
  };
  m.customProgramCacheKey = () => prevKey + "|nightLit";
  m.needsUpdate = true;
}
// A covered stretch of road (tunnel.js – Monaco's tunnel under the Fairmont): under its roof the sky's light is mostly
// shut out and the sun's doesn't reach, the tunnel's own lamps light what is there. Asked per fragment by position, so a
// car driving in darkens as it goes under the roof edge (no global exposure change) and the walls and road stay lit by
// the lamps. The mask (TN.tex, over TN.ext): r how covered (0 out in the open, 1 under the roof; eased over the first
// metres in from each mouth, where daylight still reaches), g the ceiling's height (only what is under it counts – the
// slab's top and the hotel over it are outside), b the daylight still coming in through an open side (the colonnade's
// gaps), a the tunnel lamps' light there (more near the walls they hang on). TN.on 0: nothing (no tunnel in this world).
// Direct sun under the roof: a surface that takes the shadow map gets the slab's shadow from it – through the colonnade's
// gaps too –, only kept off where the sides are solid (and wherever the shadows are switched off); one that doesn't (the
// cars) is shaded by the mask alone, keeping as much as the open side lets in.
const blankHalf = () => { const t = new THREE.DataTexture(new Uint16Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType); t.needsUpdate = true; t.userData.shared = true; return t; };
export const TN = {
  tex: { value: blankHalf() }, ext: { value: new THREE.Vector4(0, 0, 1, 1) }, on: { value: 0 },
  lamp: { value: new THREE.Vector3(0, 0, 0) },   // the lamps' light (linear RGB irradiance at a = 1)
  amb: { value: 0.12 },                          // the share of the sky's light left deep inside
};
TN.blank = TN.tex.value;
const TN_FRAG = `
        if (tnOn > 0.0) {
          vec2 tnUv = (vNlPos.xz - tnExt.xy) / tnExt.zw;
          if (tnUv.x > 0.0 && tnUv.y > 0.0 && tnUv.x < 1.0 && tnUv.y < 1.0) {
            vec4 tnM = texture2D(tnTex, tnUv);
            // (the ceiling's underside itself counts as inside; the slab's top 1 m+ over it doesn't; nothing far below)
            float tnK = tnM.r * (1.0 - smoothstep(tnM.g + 0.12, tnM.g + 0.45, vNlPos.y)) * step(tnM.g - 12.0, vNlPos.y);
            if (tnK > 0.002) {
              vec3 tnN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
              #if defined( RE_IndirectDiffuse )
                irradiance *= mix(1.0, min(1.0, tnAmb + tnM.b), tnK);
                // lamps on the upper edge of both walls: the road and the walls well lit, the ceiling's underside less
                irradiance += tnLamp * (tnK * tnM.a * (tnN.y >= 0.0 ? 0.75 + 0.25 * tnN.y : 0.75 + 0.1 * tnN.y));
              #endif
              #if defined( RE_IndirectSpecular )
                radiance *= mix(1.0, 0.3, tnK);
              #endif
              #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
                float tnD = receiveShadow ? (tnM.b > 0.02 ? 0.0 : tnK) : tnK * (1.0 - min(1.0, tnM.b * 2.0));
              #else
                float tnD = tnK * (1.0 - min(1.0, tnM.b * 2.0));
              #endif
              reflectedLight.directDiffuse *= 1.0 - tnD; reflectedLight.directSpecular *= 1.0 - tnD;
            }
          }
        }`;
export const NL_GLSL = `
  uniform sampler2D nlTex; uniform sampler2D nlHgt; uniform vec4 nlExt; uniform float nlGain;
  uniform sampler2D tnTex; uniform vec4 tnExt; uniform float tnOn; uniform vec3 tnLamp; uniform float tnAmb;
  varying vec3 vNlPos;
  // light from the field falling on a surface at p facing n (world space)
  vec3 nlLight(vec3 p, vec3 n) {
    // a wall takes the light of the ground a few metres in front of it
    vec2 q = p.xz + n.xz * 3.0, uv = (q - nlExt.xy) / nlExt.zw;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
    vec3 L = texture2D(nlTex, uv).rgb;
    // the lamps hang 6–14 m up: below that a wall gets their full light, above it falls away
    float h = max(0.0, p.y - texture2D(nlHgt, uv).r);
    float fall = h < 6.0 ? 1.0 : exp(-(h - 6.0) / 8.0);
    // light comes from above: full on the ground, about half on a wall, little on the underside of things
    float facing = n.y >= 0.0 ? 0.5 + 0.5 * n.y : 0.5 + 0.35 * n.y;
    return L * (nlGain * fall * facing);
  }`;

// ---------- the light field ----------
const rand = (seed) => { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// lamp colours (sRGB 0–255): LED 4000 K on main roads, 3000 K on side streets, some old sodium lamps; floodlights ~5600 K
const C = { led: [255, 226, 190], warm: [255, 200, 140], sodium: [255, 150, 60], flood: [240, 244, 255], park: [255, 210, 160] };
// street lights by road class: post height, spacing, which sides, lit at all
const ROADS = {
  motorway: { h: 12, gap: 42, both: true, c: "led" }, trunk: { h: 12, gap: 40, both: true, c: "led" },
  primary: { h: 10, gap: 34, both: true, c: "led" }, secondary: { h: 10, gap: 34, both: true, c: "led" },
  tertiary: { h: 9, gap: 32, both: false, c: "led" }, unclassified: { h: 8, gap: 32, both: false, c: "warm" },
  residential: { h: 7, gap: 30, both: false, c: "warm" }, living_street: { h: 6, gap: 26, both: false, c: "warm" },
  service: { h: 6, gap: 34, both: false, c: "warm", share: 0.55 }, pedestrian: { h: 5, gap: 22, both: false, c: "park" },
};
const ROAD_DEFAULT = { h: 8, gap: 32, both: false, c: "warm" };

// opts: { ext: {x0,z0,x1,z1}, groundAt(x,z), track: { samples, width }, lines: [{ k, w, sub, pts: [[x,z]…] }] (scene
// metres), paved: [[x,z]…][] (car parks, plazas), buildings: [[x,z]…][] (footprints), covered(x,z): under a tunnel's roof (no
// floodlit band there), onTrack(x,z): on the
// circuit's own tarmac (it has its floodlights), urban: footpaths lit too }
// Returns { tex, hgt, ext: Vector4, lamps: [{ x, y, z, h, dx, dz, c, k }], dispose() } (dispose: releaseField).
export function lightField(opts) {
  const { ext, groundAt } = opts;
  const W = ext.x1 - ext.x0, D = ext.z1 - ext.z0;
  const mpp = Math.max(0.9, Math.max(W, D) / 4096);
  const cw = Math.ceil(W / mpp), ch = Math.ceil(D / mpp);
  const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
  const g = cv.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, cw, ch);
  g.globalCompositeOperation = "lighter";
  g.lineCap = g.lineJoin = "round";
  const S = (x, z) => [(x - ext.x0) / mpp, (z - ext.z0) / mpp];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const lamps = [];
  // (one lamp per spot: dual carriageways and roads split into pieces would put two posts in one place)
  const taken = new Map(), cell = 10;
  const free = (x, z, r) => {
    const i0 = Math.floor(x / cell), j0 = Math.floor(z / cell);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const [px, pz] of taken.get(i * 73856093 ^ j) || []) if ((px - x) ** 2 + (pz - z) ** 2 < r * r) return false;
    return true;
  };
  const take = (x, z) => { const k = Math.floor(x / cell) * 73856093 ^ Math.floor(z / cell); if (!taken.has(k)) taken.set(k, []); taken.get(k).push([x, z]); };
  const inside = (x, z) => x > ext.x0 && x < ext.x1 && z > ext.z0 && z < ext.z1;
  // a lamp's pool of light: brightest under the lamp, wider along the road than across it, about two post heights
  // across (an inverse-square fall-off, not a soft blob)
  const pool = (x, z, dx, dz, h, col, amp) => {
    const [px, py] = S(x, z), r = (h * 1.9) / mpp;
    g.save(); g.translate(px, py); g.rotate(Math.atan2(dz, dx)); g.scale(1.35, 1);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [t, k] of [[0, 1], [0.12, 0.82], [0.28, 0.48], [0.45, 0.24], [0.65, 0.09], [0.85, 0.025], [1, 0]]) gr.addColorStop(t, rgba(col, amp * k));
    g.fillStyle = gr; g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
  };
  const r = rand(77);
  // street lights along the roads
  for (const l of opts.lines) {
    const isPath = l.k === "path";
    if (l.k !== "road" && !(isPath && opts.urban)) continue;
    const spec = isPath ? { h: 4, gap: 24, both: false, c: "park" } : ROADS[l.sub] || ROAD_DEFAULT;
    const rr = rand((l.pts[0][0] * 31 + l.pts[0][1] * 17) | 0);
    if (spec.share && rr() > spec.share) continue;
    const col = C[spec.c === "warm" && rr() < 0.22 ? "sodium" : spec.c];
    const half = (l.w || 6) / 2;
    let carry = rr() * spec.gap, side = rr() < 0.5 ? 1 : -1;
    for (let i = 1; i < l.pts.length; i++) {
      const [ax, az] = l.pts[i - 1], [bx, bz] = l.pts[i], len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz, nz = tx;
      for (let d = carry; d < len; d += spec.gap) {
        for (const sd of spec.both ? [side, -side] : [side]) {
          const along = spec.both && sd !== side ? spec.gap / 2 : 0, dd = d + along;
          if (dd >= len) continue;
          const cx = ax + tx * dd, cz = az + tz * dd;
          const x = cx + nx * sd * (half + 0.8), z = cz + nz * sd * (half + 0.8);
          if (!inside(x, z) || opts.onTrack?.(cx, cz) || !free(x, z, spec.gap * 0.42)) continue;
          take(x, z);
          // the head hangs over the road on an arm (shorter for park lamps)
          const arm = isPath ? 0 : Math.min(2.2, half * 0.5);
          const hx = x - nx * sd * arm, hz = z - nz * sd * arm;
          pool(hx, hz, tx, tz, spec.h, col, isPath ? 0.2 : 0.36);
          lamps.push({ x, z, y: groundAt(x, z), h: spec.h * (0.95 + r() * 0.1), dx: -nx * sd, dz: -nz * sd, arm, c: col, k: isPath ? 1 : 0 });
        }
        if (!spec.both) side = -side;
      }
      carry = (carry - len) % spec.gap; if (carry < 0) carry += spec.gap;
    }
  }
  // car parks and plazas: lamps on a grid, a faint fill between
  for (const pts of opts.paved || []) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    if ((x1 - x0) * (z1 - z0) > 250000) continue;   // (an airfield or a whole paddock complex: its own lights are elsewhere)
    let n = 0;
    for (let x = x0 + 14; x < x1 && n < 60; x += 30) for (let z = z0 + 14; z < z1 && n < 60; z += 30) {
      if (!inPoly(x, z, pts) || !inside(x, z) || opts.onTrack?.(x, z) || !free(x, z, 14)) continue;
      take(x, z); n++;
      pool(x, z, 1, 0, 9, C.led, 0.22);
      lamps.push({ x, z, y: groundAt(x, z), h: 9, dx: 0, dz: 0, arm: 0, c: C.led, k: 2 });
    }
  }
  // light from shop windows and entrances on the pavement around buildings
  if (opts.buildings?.length) {
    g.strokeStyle = rgba(C.warm, 0.05); g.lineWidth = 7 / mpp;
    g.beginPath();
    for (const pts of opts.buildings) pts.forEach(([x, z], i) => { const [px, py] = S(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.stroke();
  }
  // the floodlit circuit: even, bright light over the tarmac and run-off, falling off quickly beyond (the
  // projectors are aimed at the track)
  const tr = opts.track;
  if (tr?.samples?.length) {
    const pts = tr.samples.map((s) => S(s.p.x, s.p.z));
    // (not under a roof: a tunnel has its own lamps – tunnel.js; the band there lit its slab's top and what stands on it)
    const cov = opts.covered ? tr.samples.map((s) => opts.covered(s.p.x, s.p.z)) : null;
    const loop = () => {
      g.beginPath();
      if (!cov?.some(Boolean)) { pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); return; }
      const n = pts.length, k0 = cov.indexOf(true);
      let pen = false;
      for (let j = 1; j <= n; j++) { const k = (k0 + j) % n; if (cov[k]) { pen = false; continue; } const [x, y] = pts[k]; if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; } }
    };
    for (const [extra, a] of [[44, 0.05], [26, 0.1], [14, 0.22], [6, 0.32], [0, 0.4]]) { g.strokeStyle = rgba(C.flood, a); g.lineWidth = (tr.width + 2 * extra) / mpp; loop(); g.stroke(); }
    // the pit lane and other venue tarmac
    for (const l of opts.lines) if (l.k === "raceway") {
      g.strokeStyle = rgba(C.flood, 0.32); g.lineWidth = ((l.w || 12) + 10) / mpp;
      g.beginPath(); l.pts.forEach(([x, z], i) => { const [px, py] = S(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke();
    }
  }
  // a light blur only: lamp pools have soft but definite edges
  g.globalCompositeOperation = "source-over";
  const out = document.createElement("canvas"); out.width = cw; out.height = ch;
  const og = out.getContext("2d"); og.filter = "blur(1.2px)"; og.drawImage(cv, 0, 0); og.filter = "none";
  cv.width = cv.height = 1;
  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  // ground heights under the field (for the height of a lit surface above the street)
  const HN = 192, hd = new Uint16Array(HN * HN);
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
    const y = groundAt(ext.x0 + ((i + 0.5) / HN) * cw * mpp, ext.z0 + ((j + 0.5) / HN) * ch * mpp);
    hd[j * HN + i] = THREE.DataUtils.toHalfFloat(Number.isFinite(y) ? y : 0);
  }
  const hgt = new THREE.DataTexture(hd, HN, HN, THREE.RedFormat, THREE.HalfFloatType);
  hgt.magFilter = hgt.minFilter = THREE.LinearFilter; hgt.wrapS = hgt.wrapT = THREE.ClampToEdgeWrapping; hgt.needsUpdate = true;
  const field = { tex, hgt, ext: new THREE.Vector4(ext.x0, ext.z0, cw * mpp, ch * mpp), lamps, dispose: () => releaseField(field) };
  return field;
}
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------- lamps and glare ----------
// Glare points: each a light seen from afar – a small bright core and a faint halo, `size` metres across, never
// less than ~2 px (dimmer then, as a far light is), fading into the haze; `blink` > 0 flashes (Hz) with `phase`.
const GLOW_VS = `
  uniform float uScale; uniform float uTime; uniform vec2 uFade;
  attribute vec3 color; attribute float size; attribute float blink; attribute float phase;
  varying vec3 vC; varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float d = max(0.1, -mv.z), px = size * uScale / d;
    vA = clamp(px / 2.2, 0.15, 1.0) * (1.0 - 0.9 * smoothstep(uFade.x, uFade.y, d));
    if (blink > 0.0) vA *= smoothstep(0.0, 0.08, fract(uTime * blink + phase)) * (1.0 - step(0.35, fract(uTime * blink + phase)));
    gl_PointSize = clamp(px, 2.2, 48.0);
    vC = color;
    gl_Position = projectionMatrix * mv;
  }`;
const GLOW_FS = `
  varying vec3 vC; varying float vA;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    float k = exp(-r2 * 45.0) * 1.8 + exp(-r2 * 9.0) * 0.3 + exp(-r2 * 2.5) * 0.06 * (1.0 - r2);
    gl_FragColor = vec4(vC * k * vA, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
// list: [{ x, y, z, c: [r,g,b] 0–255, i: intensity, s: size m, blink, phase }]
export function glowPoints(list, name = "glow") {
  const n = list.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), blink = new Float32Array(n), phase = new Float32Array(n);
  const lin = (v) => Math.pow(v / 255, 2.2);
  list.forEach((p, k) => {
    pos.set([p.x, p.y, p.z], k * 3);
    col.set([lin(p.c[0]) * p.i, lin(p.c[1]) * p.i, lin(p.c[2]) * p.i], k * 3);
    size[k] = p.s; blink[k] = p.blink || 0; phase[k] = p.phase || 0;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("blink", new THREE.BufferAttribute(blink, 1));
  geo.setAttribute("phase", new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: GLOW.scale, uTime: NL.time, uFade: GLOW.fade },
    vertexShader: GLOW_VS, fragmentShader: GLOW_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = name; pts.frustumCulled = false; pts.renderOrder = 2;
  return pts;
}
// shared by every glare point: pixels per metre at 1 m (set from the camera on resize) and the haze distances
export const GLOW = { scale: { value: 800 }, fade: { value: new THREE.Vector2(1500, 6000) } };

// Posts, arms and lit lenses for the field's lamps (instanced), with a glare point at each lens.
export function lampMeshes(lamps) {
  const group = new THREE.Group(); group.name = "streetLamps";
  if (!lamps.length) return group;
  // a 1 m tall unit post (scaled to each lamp's height) and a head on a 1-unit arm
  const post = new THREE.CylinderGeometry(0.07, 0.11, 1, 5, 1, true); post.translate(0, 0.5, 0);
  const arm = new THREE.BoxGeometry(1, 0.06, 0.06); arm.translate(0.5, 0, 0);
  const head = new THREE.BoxGeometry(0.75, 0.16, 0.32);
  const lens = new THREE.PlaneGeometry(0.62, 0.24); lens.rotateX(Math.PI / 2);
  const metal = new THREE.MeshStandardMaterial({ color: 0x5d636a, roughness: 0.55, metalness: 0.5 });
  const lit = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const n = lamps.length;
  const posts = new THREE.InstancedMesh(post, metal, n), arms = new THREE.InstancedMesh(arm, metal, n), heads = new THREE.InstancedMesh(head, metal, n), lenses = new THREE.InstancedMesh(lens, lit, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const glow = [];
  lamps.forEach((L, k) => {
    const ang = Math.atan2(-L.dz, L.dx);   // arm along (dx, dz)
    q.setFromAxisAngle(Y, ang);
    m.compose(p.set(L.x, L.y, L.z), q, s.set(1, L.h, 1)); posts.setMatrixAt(k, m);
    const arm = L.arm || 0.01, hx = L.x + L.dx * arm, hz = L.z + L.dz * arm, hy = L.y + L.h;
    m.compose(p.set(L.x, hy - 0.1, L.z), q, s.set(arm, 1, 1)); arms.setMatrixAt(k, m);
    m.compose(p.set(hx, hy - 0.12, hz), q, s.set(1, 1, 1)); heads.setMatrixAt(k, m);
    m.compose(p.set(hx, hy - 0.21, hz), q, s.set(1, 1, 1)); lenses.setMatrixAt(k, m);
    c.setRGB(L.c[0] / 255, L.c[1] / 255, L.c[2] / 255, THREE.SRGBColorSpace); lenses.setColorAt(k, c);
    glow.push({ x: hx, y: hy - 0.3, z: hz, c: L.c, i: L.k === 1 ? 2.2 : 3.2, s: L.k === 1 ? 1.4 : 2.2 });
  });
  for (const im of [posts, arms, heads, lenses]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  lenses.instanceColor.needsUpdate = true;
  posts.castShadow = true;
  group.add(posts, arms, heads, lenses, glowPoints(glow, "lampGlow"));
  return group;
}
