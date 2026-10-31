// The pit lane's driving paths across it (v0.53 §8) – one contract for the replay (pitstate.js / map3d.js pitDraw) and
// the game (game/cars3d.js): where across the lane a car is drawn while it goes into its box, stands in it and leaves it.
//
// The lane across (pitlane.js crossSection, measured per garage – the pit wall's face, else the track's edge): the fast
// lane by the pit wall (FIA SR 2025 Art. 34.4: no more than 3.5 m wide), the inner (working) lane by the garages, a
// team's box in the inner lane in front of its garage. Along the lane (garages.js: u + towards the pit exit): the teams'
// boxes, 17–30 m apart (the event's FIA pit lane drawing, or the session's stops – pitorder.js / garages.js).
//
// A car passing through drives the fast lane. Only the car stopping at its box leaves it: across into the inner lane,
// arriving in the box (or, a double stack, the queue place behind it) with its heading back along the lane; after the
// stop it leaves along a merge path back into the fast lane, which it reaches before it is abreast of the next team's
// box – it never drives on along the other teams' working areas as if they were the lane.
//
// The way across is a quintic in the distance along the lane (smootherstep 6t⁵ − 15t⁴ + 10t³): the place, the heading
// (its slope) and the curvature are continuous, and the heading is along the lane at both ends – no sideways jump, no
// slide, no kink. It is a function of the place along the lane only (not of the speed, not of the time): a car moving
// slowly crosses slowly, a standing car doesn't slide, and the same place gives the same pose after any seek.
//
// Its length, per circuit and box (not a fixed 14 / 30 m everywhere): what the steepest heading allows for the distance
// across at that box (the fast lane's centre to the box's, from the circuit's own cross section) – capped by the room to
// the neighbouring box along the lane, so a car going in starts across no earlier than abreast of the previous team's
// box, and a car leaving is back in the fast lane by the next one's. ESTIMATES (no published figure, no lateral position
// in the feed – the feed has every car on one line): the steepest heading (PATH.tanIn / tanOut), the shortest length.

export const PATH = {
  tanIn: Math.tan((30 * Math.PI) / 180),   // steepest heading going in: 30° off the lane (low speed, braking into the marks)
  tanOut: Math.tan((28 * Math.PI) / 180),  // steepest heading leaving: 28° (launching out of the box)
  min: 8,          // m: the shortest way across (a cramped box: Monaco) – steeper than the above where the room is less
  max: 40,         // m: the longest (a box far from the fast lane at a gentle angle never takes longer)
  margin: 1.5,     // m kept short of the neighbouring box's place
  queueGap: 6,     // m behind its box where a double stack's second car waits (engine params/pit.js queueGap – the same)
  roomDefault: 24, // m to the neighbouring box where there is none on that side (the run's first / last box)
};

// the quintic smootherstep and its first two derivatives (t in [0, 1]; flat outside)
export const q5 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));
export const dq5 = (t) => (t <= 0 || t >= 1 ? 0 : 30 * t * t * (t - 1) * (t - 1));
export const ddq5 = (t) => (t <= 0 || t >= 1 ? 0 : 60 * t * (t - 1) * (2 * t - 1));
// steepest slope and curvature of a quintic crossing of `d` m over `len` m: 1.875·d/len, 5.7735·d/len²
export const Q5_SLOPE = 1.875, Q5_CURV = 5.7735;

// The length along the lane of a crossing of dLat metres: what the steepest heading allows, within [min, max], no longer
// than the room there (m to the neighbouring box, less the margin; never under min)
export function crossLen(dLat, room = null, tanMax = PATH.tanIn, P = PATH) {
  let len = Math.max(P.min, Math.min(P.max, (Q5_SLOPE * Math.abs(dLat)) / tanMax));
  if (room != null && Number.isFinite(room)) len = Math.min(len, Math.max(P.min, room - P.margin));
  return len;
}

// A team's box ways: boxU (u along the garages), boxes (every team's box u – the neighbours), dLat (m from the fast lane's
// centre to the box's at the box) → { boxU, inLen, outLen, inFrom, outTo, queueU, roomIn, roomOut } – the way in starts
// at inFrom and ends at the queue place (queueU, `queueGap` short of the box: a car arriving behind its teammate is in the
// inner lane there, and a car going straight to its box drives the last metres in the box lane, as the real cars line up
// on their marks); the way out starts at the box and ends at outTo.
export function boxWays(boxU, boxes, dLat, P = PATH) {
  let prev = -Infinity, next = Infinity;
  for (const b of boxes || []) { if (b < boxU - 0.5 && b > prev) prev = b; if (b > boxU + 0.5 && b < next) next = b; }
  const roomIn = Number.isFinite(prev) ? boxU - prev : P.roomDefault, roomOut = Number.isFinite(next) ? next - boxU : P.roomDefault;
  const gap = Math.min(P.queueGap, Math.max(0, roomIn - P.min - P.margin));
  const inLen = crossLen(dLat, roomIn - gap, P.tanIn, P), outLen = crossLen(dLat, roomOut, P.tanOut, P);
  const queueU = boxU - gap;
  return { boxU, queueU, inLen, outLen, inFrom: queueU - inLen, outTo: boxU + outLen, roomIn: +roomIn.toFixed(1), roomOut: +roomOut.toFixed(1), dLat };
}

// The ways from / to where a car really stood (a replay: the record's stand, which can be metres off the box's place):
// still no earlier than abreast of the previous box and back in the fast lane by the next one (never under PATH.min)
export const outLenFrom = (ways, fromU, P = PATH) => Math.max(P.min, Math.min(ways.outLen, ways.boxU + ways.roomOut - P.margin - fromU));
export const inLenTo = (ways, toU, P = PATH) => Math.max(P.min, Math.min(ways.inLen, toU - (ways.boxU - ways.roomIn) - P.margin));
// w (0: the fast lane, 1: the box lane) on the way in at u: from inFrom to the queue place (then 1 to the box)
export const inW = (u, ways) => q5((u - ways.inFrom) / (ways.queueU - ways.inFrom));
// … and on the way out from the place the car stood (fromU – its box, as the data or the engine has it)
export const outW = (u, ways, fromU = ways.boxU) => 1 - q5((u - fromU) / ways.outLen);
// d w / d u of both (for the heading: the slope across is (boxC − fastC) · dw/du)
export const inDW = (u, ways) => dq5((u - ways.inFrom) / (ways.queueU - ways.inFrom)) / (ways.queueU - ways.inFrom);
export const outDW = (u, ways, fromU = ways.boxU) => -dq5((u - fromU) / ways.outLen) / ways.outLen;

// ---------- the game's contract (game/cars3d.js): the engine's pit phase → the way across ----------
// The ENGINE decides everything that matters (pit.js pitStep): the box's occupancy, the double stack's queue, the work,
// the penalty hold, the safe release (held while a car comes down the fast lane), the red-flag queue (noBox: the fast
// lane), the pit-lane start (laneOut without a release). This only says where across the lane the engine's state at its
// place u is drawn. snapPit: { phase, u, times: { release, queue, … } }; u: the engine's place mapped onto the garages'
// u; ways: boxWays at the car's team's box (in the same u); fromU: where the engine stopped it (its box) in that u.
//   lane / entry / exit, a drive-through or red-flag queue (never "approach"): the fast lane (0)
//   approach: the way in (to the queue place, then the box lane) – the same way whether the box is free or busy
//   queue, penalty, work, release: the box lane (1)
//   laneOut after a release this visit: the way out from the box; laneOut without one (a pit-lane starter): the fast lane
// → { w, dw (per m of u), why }
export function gameLaneW(pit, u, ways, fromU = null) {
  const ph = pit?.phase;
  if (!ways || u == null) return { w: 0, dw: 0, why: "no box" };
  switch (ph) {
    case "approach": return u >= ways.queueU ? { w: 1, dw: 0, why: "box lane" } : { w: inW(u, ways), dw: inDW(u, ways), why: "way in" };
    case "queue": case "penalty": case "work": case "release": return { w: 1, dw: 0, why: "box lane" };
    case "laneOut": {
      if (pit.times?.release == null) return { w: 0, dw: 0, why: "no release this visit" };
      const f = fromU ?? ways.boxU;
      return u <= f ? { w: 1, dw: 0, why: "way out" } : { w: outW(u, ways, f), dw: outDW(u, ways, f), why: "way out" };
    }
    default: return { w: 0, dw: 0, why: "fast lane" };
  }
}
