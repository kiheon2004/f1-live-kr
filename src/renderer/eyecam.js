// The driver's-eye camera's lens and aim (v0.52: out of map3d.js, so the measuring tools and tests use the very numbers
// the app draws with – tools/eyeview.mjs, test/eyeview52.test.js).
//
// v0.42: the eyes' lens 80° wide (it was 95°: the steering wheel ~30 % of the picture's width against ~45 % in the
// helmet camera's frames – research/cockpit.md: that camera ~75–85° wide, L) and looking down 8° (it was 3.4°) – the
// horizon a third of the way down, the wheel's top a little under it, as in those frames (the eyes 2 cm lower too, the
// profiles' eye: ~3.5 cm over the wheel's top, Z 0.70–0.76 m in the research – L)
import * as THREE from "./vendor/three.module.js";

export const EYE_HFOV = 80, EYE_PITCH = -0.14;
// the cockpit cameras' vertical angle (deg) for a window of this shape: the lens' horizontal angle kept (the T-cam's as
// the car's profile has it, the eyes' EYE_HFOV), as tall as the shape makes it, within 35–100°
export function cockpitFov(eye, aspect, tcamHfov = 72) {
  const h = eye ? EYE_HFOV : tcamHfov;
  return Math.max(35, Math.min(100, (2 * Math.atan(Math.tan((h * Math.PI) / 360) / (aspect || 1.6)) * 180) / Math.PI));
}
// A camera placed as map3d.js places the eye camera in a car standing where it is (look: { yaw, pitch } the free look's
// turn, head: the driver's head's turn into the bend – rad)
export function eyeCamera(car, aspect, near = 0.03, look = null) {
  const u = car.userData, cam = new THREE.PerspectiveCamera(cockpitFov(true, aspect), aspect, near, 3000);
  car.updateMatrixWorld(true);
  const e = eyeTurned(u.mounts.eye.toArray(), look?.head || 0);
  cam.position.set(e[0], e[1], e[2]).applyMatrix4(car.matrixWorld);
  const q = new THREE.Quaternion(); car.getWorldQuaternion(q);
  cam.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(EYE_PITCH, Math.PI, 0, "YXZ")));
  if (look) cam.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(look.pitch || 0, (look.yaw || 0) + (look.head || 0), 0, "YXZ")));
  cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  return cam;
}

// v0.52 (request §11): the driver's head turns into the corner. A racing driver points his head along the bend – at an
// angle that follows the car's rate of turning about 1 s ahead (Land & Tatler 2001, Current Biology 11:1215, an F3
// driver at Knockhill: the head-in-car angle and the car's rotation rate "nearly identical" traces, the head leading
// by ~1 s; through the hairpin 45° into the bend; the eyes within ~5° of the head – H for that driver). The eye camera
// rides on the head (the Driver's Eye camera is in the helmet's padding), so it turns with it. In a Formula 1 cockpit
// the head is held by the headrest's side pads and the HANS: the turn is kept smaller – HEAD.gain (s) half the F3
// trace's and a soft limit of HEAD.max (both estimates, L: no F1 measurement found). Measured effect (eyeview.js, the
// 2025 Ferrari, 16:9): at 90° of lock the arms' share of the picture 18 % → ~10 %, at 60° 14 % → ~6 %.
// kappas: the path's curvature (1/m, + = turning left) at moments ahead (the bend the driver looks into); v (m/s).
// Returns the head's turn (rad, + = to the left – map3d's free-look yaw), a pure function of its inputs.
// neck: the head turns about an upright axis through the top of the neck, ~9 cm behind the eyes (an estimate, L) – the
// eyes move a little sideways with the turn, not round their own point
export const HEAD = { gain: 0.45, max: (20 * Math.PI) / 180, ahead: [0.5, 1.0, 1.5], neck: 0.09 };
// the eyes' place (the car's frame) with the head turned by yaw (rad, + = left): out = [x, y, z] from eye = [x, y, z]
export function eyeTurned(eye, yaw, out = [0, 0, 0]) {
  out[0] = eye[0] + Math.sin(yaw) * HEAD.neck; out[1] = eye[1]; out[2] = eye[2] - HEAD.neck * (1 - Math.cos(yaw));
  return out;
}
export function headYawFor(kappas, v) {
  let k = 0, n = 0; for (const x of kappas) if (Number.isFinite(x)) { k += x; n++; }
  if (!n || !(v > 0)) return 0;
  const w = (v * k) / n;   // (the car's rate of turning there, rad/s)
  return HEAD.max * Math.tanh((HEAD.gain * w) / HEAD.max);
}
