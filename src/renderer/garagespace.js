// The space inside a circuit garage (v0.49): how deep a bay is, what part of it is the race bay a car is worked on in, and
// where in it a car stands – shared by the pit building (facilities.js: the bays' depth from the building's own footprint)
// and the teams' layer (garages.js garageZones: the teams' work spaces, engineering bays, the box in the lane).
//
// What a source says (Red Bull Racing, "Bull's guide to the garage", redbullracing.com, fetched 2026-10-30): the front
// of the garage – the race bays – has "a fixed depth", the width varies; the depth is set by the car: its nose kept out of
// the rain at the front, "a jack under the rear of the car and a starter motor" behind it; the race bays are "mirrored
// symmetrically left and right", engineers' workstations against the wall, overhead a modular gantry of "a fixed height";
// behind (and often beside) the race bays "another area – usually much larger" (spares, composites, engine room) whose
// layout varies from race to race. What no source gives: a depth in metres. So the race bay's depth here is built up from
// the car (CAR_ENVELOPE, measured from the app's models) and the clearances below – assumptions, said so – and never
// deeper than the building's footprint behind the bay (facilities.js), the rest of the footprint being the back area.
import { CAR_ENVELOPE } from "./carbounds.js";

export const GARAGE_SPACE = {
  wall: 0.3,       // the building's own back wall (assumed thickness): the bays stop inside it
  door: 0.6,       // the door line – the rolled-up shutter's box reaches 0.6 m in (facilities.js); nothing stands under it
  nose: 0.8,       // clear between the door line and the car's nose (assumed: people walk across in front of it)
  rear: 1.6,       // behind the car: the rear jack under it and the starter (the source's two; 1.6 m assumed)
  bench: 0.9,      // the work surfaces and tool cabinets along the race bay's back (garages.js: 0.6–0.7 m deep, 0.36–0.42 m off the wall)
  side: 0.9,       // a walkway either side of the car (people, tyre trolleys – assumed)
  partition: 0.15, // the race bays' back partition
  backMin: 2.5,    // a back area shallower than this isn't split off: the race bay keeps it
};
// The race bay's depth a car needs, front to back: door line, room before the nose, the car, the jack and starter behind
// it, the benches at the back (9.63 m for the 5.73 m envelope).
export const raceBayDepth = (L = CAR_ENVELOPE.length, S = GARAGE_SPACE) => S.door + S.nose + L + S.rear + S.bench;
// A bay's depths from the building's depth behind it (m from the garages' front to the footprint's back, the narrowest
// over the bay): { inner (inside the back wall), depth (the race bay: what is built and seen from the lane), back (the
// back area behind its partition, 0 if none), fits (a car of length L stands in the race bay with its clearances) }
export function bayDepths(building, L = CAR_ENVELOPE.length, S = GARAGE_SPACE) {
  const inner = Math.max(0, building - S.wall), want = raceBayDepth(L, S);
  if (inner - want >= S.backMin + S.partition) return { inner, depth: want, back: inner - want - S.partition, fits: true };
  return { inner, depth: inner, back: 0, fits: inner >= want };
}
// Where a car stands in a race bay of depth `depth` (m in from the front), facing out to the pit lane: the cars are wheeled
// in backwards, the rear jack and the starter behind them, the nose towards the door (the source's "nosebox without getting
// wet": the depth is sized from the nose at the front) – an inference from the source, M. → { d (m in from the front to the
// car's origin: the middle between its axles), facing: "out", fits, why } – where the race bay is too shallow for the car
// and its clearances, the car keeps the rear clearance and its nose comes nearer the door; where even the car and the
// door line don't fit, fits: false (the caller doesn't put a car through the back wall – it says so instead).
export function carSpotDepth(depth, E = CAR_ENVELOPE, S = GARAGE_SPACE) {
  const ideal = S.door + S.nose + E.front;   // the nose S.nose behind the door line
  const rearAt = (d) => d + E.back;           // how deep its rear reaches
  if (rearAt(ideal) + S.rear + S.bench <= depth + 1e-6) return { d: ideal, facing: "out", fits: true, why: "race bay deep enough: the nose 0.8 m behind the door line" };
  // (too shallow for every clearance: give up the benches' band, then the rear jack's room, the nose never past the door line)
  const d = Math.max(S.door + E.front, depth - S.rear - E.back);
  if (rearAt(d) <= depth - 0.2 + 1e-6) return { d, facing: "out", fits: true, why: `race bay ${depth.toFixed(2)} m: room behind the car cut to ${(depth - rearAt(d)).toFixed(2)} m` };
  // (the car can't go in whole: its tail 0.2 m off the back wall, its nose out past the door line into the working lane –
  // never through the wall; `out`: how far its nose reaches past the garage's front)
  const dd = Math.max(0, depth - 0.2 - E.back);
  return { d: dd, facing: "out", fits: false, out: +(E.front - dd).toFixed(2), why: `race bay ${depth.toFixed(2)} m < ${(S.door + E.length + 0.2).toFixed(2)} m (door line + car + 0.2 m): the car doesn't fit – parked with its tail 0.2 m off the back wall, its nose ${(E.front - dd).toFixed(2)} m out of the door` };
}
