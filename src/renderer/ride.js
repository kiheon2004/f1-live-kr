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
// is taken as it is (a smooth function of the place on the track), less the kerb's ridges; the road's slope is followed
// over a few metres of road.
//
// pose: { y, pitch, roll, slope } – the car's height (kerb bump left out), pitch, roll and the road's slope under it
// (rad, the pitch's own sense); dt: the wall's seconds since the last frame. S: the state from the frame before (null:
// start over – a seek, another car). Returns S: { y, p, r } – the height, pitch and roll to draw.
export const RIDE = { rate: 2.5, slopeM: 8 };   // (1/s: the dip and the lean followed over ~0.4 s, as before; m: see below)
// (the road's slope: followed over SLOPE_M metres of the road – not seconds: the same at 1× and 10× – the lap line's
// slope comes in short straight pieces, and at 10× their corners went through to the camera's pitch as a flutter; 8 m
// leaves the tub's floor within ~1 cm of the road over any crest a track has. pose.x, pose.z: the car's place)
export function rideStep(S, pose, dt) {
  const slope = pose.slope || 0, dip = pose.pitch - slope;
  if (!S) S = { dip, r: pose.roll, y: pose.y, p: pose.pitch, slope, x: pose.x, z: pose.z };
  else {
    const k = 1 - Math.exp(-Math.max(0, dt) * RIDE.rate); S.dip += (dip - S.dip) * k; S.r += (pose.roll - S.r) * k;
    const ds = pose.x != null && S.x != null ? Math.min(50, Math.hypot(pose.x - S.x, pose.z - S.z)) : 0;
    S.slope += (slope - S.slope) * (1 - Math.exp(-ds / RIDE.slopeM));
    S.x = pose.x; S.z = pose.z;
  }
  S.y = pose.y; S.p = S.slope + S.dip;
  return S;
}
