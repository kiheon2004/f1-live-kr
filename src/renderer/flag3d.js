// Hand-held flags for marshals and the start's rear-of-grid official: a pole in the hand and a small cloth on it,
// waved – the cloth bent by a few travelling waves (no cloth simulation), all from the session's time shown, so a paused
// or sought moment shows the same flag (never the wall clock). Shared pole geometry; each flag's cloth its own (its
// vertices move); a flag is freed with its group (dispose.js) – its colour material is shared per colour.
import * as THREE from "./vendor/three.module.js";

export const FLAG_COLOURS = { yellow: "#ffd200", green: "#19b04b", red: "#e10600", blue: "#1f5fd6", white: "#f4f4f4" };
const POLE = 1.0, CLOTH = [0.75, 0.55], SEG = [6, 4];
const GRIP = 0.1;   // the hand this far up the pole from its lower end (marshals hold it near the end – photos)
let SHARED = null;
const _a = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function shared() {
  if (SHARED) return SHARED;
  const pole = new THREE.CylinderGeometry(0.012, 0.012, POLE, 6).translate(0, POLE / 2 - GRIP, 0); pole.userData.shared = true;
  const poleMat = new THREE.MeshStandardMaterial({ color: "#d8d8d8", roughness: 0.4, metalness: 0.6 }); poleMat.userData.shared = true;
  const mats = {}; for (const [k, c] of Object.entries(FLAG_COLOURS)) { mats[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide }); mats[k].userData.shared = true; }
  return (SHARED = { pole, poleMat, mats });
}

// A flag: { group, set(colour), pose(at {x,y,z} (the hand), dir {x,z} (the way the cloth streams, horizontal), t (s),
// waving 0–1, seed, axis) }. The pole goes up through the hand (its lower end just below it), tilted with the wave –
// or along axis {x,y,z} (the held pole's direction from the arm: crew.js flagHold, so pole and arm swing as one);
// the cloth on its upper end.
export function makeFlag(colour = "yellow") {
  const S = shared(), group = new THREE.Group(); group.name = "flag";
  const pole = new THREE.Mesh(S.pole, S.poleMat);
  const geo = new THREE.PlaneGeometry(CLOTH[0], CLOTH[1], SEG[0], SEG[1]).translate(CLOTH[0] / 2, -CLOTH[1] / 2, 0);
  const base = Float32Array.from(geo.attributes.position.array);
  const cloth = new THREE.Mesh(geo, S.mats[colour] || S.mats.yellow);
  pole.add(cloth); cloth.position.set(0, POLE - GRIP - 0.02, 0);
  group.add(pole);
  // (no shadow in the sun's map: it is drawn again only when the area it covers moves – map3d.js updateSun –, so a waved
  // or raised flag would leave a frozen pole and cloth on the ground (v0.40); a 1 m flag's shadow isn't missed)
  pole.castShadow = cloth.castShadow = false;
  let shown = null;
  return {
    group,
    set(c) { if (S.mats[c] && cloth.material !== S.mats[c]) cloth.material = S.mats[c]; },
    // waving: 0 held still (hanging), 1 waved hard. The arm's swing (the pole's tilt about the dir's normal) and the
    // cloth's ripple come from t and seed alone.
    pose(at, dir, t, waving = 1, seed = 0, axis = null) {
      const key = `${at.x.toFixed(3)},${at.y.toFixed(3)},${at.z.toFixed(3)},${dir.x.toFixed(3)},${dir.z.toFixed(3)},${t.toFixed(3)},${waving},${axis ? axis.x.toFixed(3) + axis.y.toFixed(3) + axis.z.toFixed(3) : ""}`;
      if (key === shown) return; shown = key;
      group.position.set(at.x, at.y, at.z);
      const gy = Math.atan2(-dir.z, dir.x); group.rotation.set(0, gy, 0);
      const sw = waving * 0.75 * Math.sin(t * 2 * Math.PI * 1.4 + seed);
      if (axis) { const c = Math.cos(gy), s = Math.sin(gy); _a.set(axis.x * c - axis.z * s, axis.y, axis.x * s + axis.z * c).normalize(); pole.quaternion.setFromUnitVectors(_up, _a); }
      else pole.rotation.set(sw * 0.35, 0, -0.25 - sw * 0.4);
      const p = geo.attributes.position.array, w = 2 * Math.PI * (1.8 + 0.6 * waving);
      for (let i = 0; i < p.length; i += 3) {
        const x = base[i], y = base[i + 1], k = x / CLOTH[0];
        p[i] = x * (1 - 0.12 * (1 - waving));
        p[i + 1] = y - (1 - waving) * k * 0.25;
        p[i + 2] = k * (0.06 + 0.12 * waving) * Math.sin(w * t - 7 * k + seed) + k * k * 0.05 * Math.sin(1.7 * w * t - 11 * k);
      }
      geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
    },
  };
}
