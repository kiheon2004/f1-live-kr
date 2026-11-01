// The car the cockpit cameras ride in (onboard T-cam, the driver's eyes): how it is drawn (v0.54). Shared by the replay
// (map3d.js updateCars) and the game (game/cars3d.js updateGameCars).
//
// v0.42–0.53 steadied the ridden car by easing its whole pose – its height over the scene and its pitch – towards where
// the car was (height ~0.2 s, pitch ~0.4 s of the WALL's time). A height or a pitch that follows the road is not
// shake: easing it only left the car behind the road. Up a 5 % grade at 250 km/h the road rises 3.5 m/s and the eased
// car sat ~0.7 m under it (at 10× ten times that): the road showed through the cockpit floor (0.16 m over the road) and
// rose round the driver – request v0.54 §3 – and the camera bolted to the car went down and up with every change of
// grade (§4). Now only what is not the road is steadied: the nose's dip under braking and the lean in the corner (the
// part of the pitch over the road's slope, and the roll), which came from 4 Hz positions and could twitch; the height
// and the road's slope are taken as they are (both smooth functions of the place on the track), less the kerb's ridges.
//
// pose: { y, pitch, roll, slope } – the car's height (kerb bump left out), pitch, roll and the road's slope under it
// (rad, the pitch's own sense); dt: the wall's seconds since the last frame. S: the state from the frame before (null:
// start over – a seek, another car). Returns S: { y, p, r } – the height, pitch and roll to draw.
export const RIDE = { rate: 2.5 };   // (1/s: the dip and the lean followed over ~0.4 s, as before)
export function rideStep(S, pose, dt) {
  const dip = pose.pitch - (pose.slope || 0);
  if (!S) S = { dip, r: pose.roll, y: pose.y, p: pose.pitch };
  else { const k = 1 - Math.exp(-Math.max(0, dt) * RIDE.rate); S.dip += (dip - S.dip) * k; S.r += (pose.roll - S.r) * k; }
  S.y = pose.y; S.p = (pose.slope || 0) + S.dip;
  return S;
}
