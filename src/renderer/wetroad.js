// The wet road under a roof (v0.45). weather3d.js sets the track's own materials (road, lines, kerbs, pit lane tarmac,
// escape roads) to the open road's estimated wetness – one value for the circuit, so Monaco's tunnel went as dark and
// glossy as the open road in the rain. Here the same materials learn, per fragment, how covered they are: the tunnel
// light mask (tunnel.js tunnelMask via nightlights.js TN – built from the same tunnel stations as weather.js
// tunnelCovers, whose raster keeps the drops off: r 1 under the roof between the inner faces, eased over the first ~9 m
// in from each mouth, g the ceiling's height so only what is under it counts). Under the roof the wetness is the open
// road's × COVERED_WET (weather.js: the water the cars carry in – an estimate, L), blended over the mouths' easing, so
// the change is gradual along the road; in time it follows the open road's wetness (itself a smooth function of the
// rain record), never a switch.
// How: the CPU values stay what weather3d.js sets for the open road (colour, roughness, envMapIntensity at wetness
// q); the shader rescales them to the local wetness q' – colour × (1 − dark·q') / (1 − dark·q), roughness × the
// ratio of the two roughness values, the sky map's light (its reflection and its diffuse part) × q'/q – and under the
// roof also cut to the share of the sky that gets in, as TN_FRAG cuts the hemisphere's (first real-app check: without
// it the covered road came out brighter wet than dry, lit by the open sky through the slab). No mask (no tunnel in the world) or a dry road: the
// open values unchanged. One more texture read per road fragment while it's wet; no per-frame allocation.
import { nightLit } from "./nightlights.js";
import { COVERED_WET } from "./weather.js";

// shared by every patched material: the open road's wetness (as drawn: rounded as weather3d.js does) and the covered share
export const WR = { open: { value: 0 }, cov: { value: COVERED_WET } };
const patched = new WeakSet();
// m: a road material; dark: how much weather3d.js darkens it at full wetness; rough0: its dry roughness. Returns its
// own uniforms ({ dark, rough0 }: weather3d.js keeps them current). Chains the existing onBeforeCompile (nightLit's –
// patched first here, its vNlPos and tunnel mask uniforms are used) and keeps its program key apart.
export function wetRoad(m, dark, rough0) {
  if (!m?.isMeshStandardMaterial) return null;
  nightLit(m);
  if (patched.has(m)) { const u = m.userData.wrU; u.dark.value = dark; u.rough0.value = rough0; return u; }
  patched.add(m);
  const u = (m.userData.wrU = { dark: { value: dark }, rough0: { value: rough0 } });
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.call(m);
  m.onBeforeCompile = function (sh, r) {
    prev?.call(this, sh, r);
    sh.uniforms.wrOpen = WR.open; sh.uniforms.wrCov = WR.cov; sh.uniforms.wrDark = u.dark; sh.uniforms.wrRough0 = u.rough0;
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float wrOpen; uniform float wrCov; uniform float wrDark; uniform float wrRough0;")
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        float wrQ = wrOpen, wrK = 0.0, wrSky = 1.0;
        if (tnOn > 0.0 && wrOpen > 0.0) {
          vec2 wrUv = (vNlPos.xz - tnExt.xy) / tnExt.zw;
          if (wrUv.x > 0.0 && wrUv.y > 0.0 && wrUv.x < 1.0 && wrUv.y < 1.0) {
            vec4 wrM = texture2D(tnTex, wrUv);
            // (as nightlights.js TN_FRAG: under the ceiling only – the slab's top and the hotel over it are open sky)
            wrK = clamp(wrM.r * (1.0 - smoothstep(wrM.g + 0.12, wrM.g + 0.45, vNlPos.y)) * step(wrM.g - 12.0, vNlPos.y), 0.0, 1.0);
            wrSky = mix(1.0, min(1.0, tnAmb + wrM.b), wrK);
            wrQ = wrOpen * mix(1.0, wrCov, wrK);
            diffuseColor.rgb *= (1.0 - wrDark * wrQ) / max(0.05, 1.0 - wrDark * wrOpen);
            roughnessFactor *= (wrRough0 + (0.3 - wrRough0) * wrQ) / max(0.02, wrRough0 + (0.3 - wrRough0) * wrOpen);
          }
        }`)
      .replace("#include <lights_fragment_maps>", `#include <lights_fragment_maps>
        #if defined( RE_IndirectSpecular )
          if (wrOpen > 0.0) radiance *= wrQ / wrOpen * wrSky;
        #endif
        // the sky's light that comes with the wet road's sky map – its diffuse part (iblIrradiance) TN_FRAG doesn't shut
        // out at all, its mirror part (radiance) only to 0.3: under the roof only the share of the sky that gets in
        // (tnAmb + the open side's daylight, as TN_FRAG's hemisphere light), else the covered road is lit by the open sky.
        // Both also × q'/q: weather3d.js sets the sky map's strength to the open road's wetness q (envMapIntensity), the
        // covered road's own wetness q' takes that share of it (second real-app check: with the colour lifted back to
        // q' but the sky's diffuse light left at q the covered road still came out a little brighter wet than dry)
        #if defined( RE_IndirectDiffuse )
          if (wrOpen > 0.0) iblIrradiance *= wrQ / wrOpen * wrSky;
        #endif`);
  };
  m.customProgramCacheKey = () => prevKey + "|wetRoad";
  m.needsUpdate = true;
  return u;
}
// the same rescaling on the CPU (for tests and the dev hook): the local wetness for a coverage k (0 open … 1 covered)
export const wetUnder = (open, k) => open * (1 + (COVERED_WET - 1) * Math.max(0, Math.min(1, k)));
