// Incident coefficients (DESIGN §12, request §12): driver errors, contact, mechanical failures, and race control's
// response. All game estimates (est: true) unless a source is given: there is no public per-corner error rate for F1.
// The SHAPE is causal – every hazard is exactly 0 without its cause (no driver over the grip, no overlap in a braking
// zone, a team reliability of 0) – and the LEVEL is set so that a dry race shows about what real races show (see "why").
// Calibration targets, from the FIA's messages in the cached races (f1kr-work/v048/logs/control_rcm_probe.log, 41 races):
// ~15 lap times deleted for track limits per race, 29 SC + 33 VSC periods (≈ 1.5 neutralisations per race), 21 "causing a
// collision" penalties (≈ 0.5 per race).
export const INCIDENTS = {
  // ---- driver error: hazard λ (1/s) = errRate · x² · tyre · water, x = (u − errU0)/(1 − errU0) when u > errU0
  // u = the grip the driver is trying to use / the grip that is there (the driver model's utilisation × the grip he
  // expects ÷ the grip the tyre and the surface give now). Consistency enters through u (the driver model's AR(1)), not
  // here again; wet skill scales the water term.
  errU0: { v: 0.97, unit: "u", est: true, range: [0.9, 0.99], why: "below this grip use the driver has margin: no errors" },
  errRate: { v: 0.012, unit: "1/s at u = 1", est: true, range: [0.003, 0.05], why: "hazard at the limit; with typical racing u this gives a few small errors per car per race (lock-ups, snaps), ~0.5–1 off-track excursions and rare spins / crashes" },
  errTyre: { v: 3.0, unit: "× per unit out of window", est: true, range: [1, 6], why: "a tyre out of its temperature window (0 = in, 1 = far out) multiplies the hazard by 1 + this × out – the grip is less predictable" },
  errWater: { v: 1.5, unit: "× per mm", est: true, range: [0.5, 4], why: "water on the line (mm) multiplies the hazard by 1 + this × h × tyre-mismatch × (wet-skill factor)" },
  errWetSkill: { v: 4.0, unit: "per unit of wet skill", est: true, range: [1, 8], why: "the water term × exp(this × (1 − wet)): a better wet driver (wet > 1) less, a worse one more" },
  errSevere: { v: 2.0, unit: "per unit of x", est: true, range: [0, 5], why: "a bigger overshoot (x) makes spins and crashes more likely (their weights × (1 + this · x))" },
  // what an error becomes, by what is beside the track (scenario.track.runoff / scenario.circuit.street; default paved)
  severity: { v: {
      paved: { moment: 0.70, wide: 0.24, spin: 0.055, crash: 0.005 },
      grass: { moment: 0.70, wide: 0.22, spin: 0.07, crash: 0.01 },
      gravel: { moment: 0.70, wide: 0.18, spin: 0.08, crash: 0.04 },
      wall: { moment: 0.75, wide: 0.10, spin: 0.05, crash: 0.10 } },
    unit: "weights", est: true, range: null, why: "an error is a slow moment (lift / correction), running wide (off the track: track limits), a spin, or a crash; walls turn more of them into crashes" },
  moment: { v: { util: 0.75, s: [0.6, 1.5] }, unit: "grip-use × for s", est: true, range: null, why: "a lift / correction: the driver uses less grip for a moment" },
  wide: { v: { paved: [0.75, 2.0], grass: [0.6, 2.5], gravel: [0.45, 3.5], wall: [0.8, 1.5] }, unit: "[speed-cap × onset speed, s]", est: true, range: null, why: "off the track: slower until back on" },
  spin: { v: { stopS: [3, 7], flatSpot: 0.6, beach: { gravel: 0.25, grass: 0.05 }, stall: 0.05 }, unit: "s / probabilities", est: true, range: null, why: "a spin stops the car (facing the wrong way) for a few seconds; a flat spot is likely; in the gravel it may be beached (out), the engine may stall (out)" },
  crash: { v: { impact: { wall: 0.85, gravel: 0.45, grass: 0.6, paved: 0.6 }, outAbove: 22, barrierAbove: 45, damage: [0.08, 0.35] }, unit: "× speed, m/s, m/s, fraction", est: true, range: null, why: "impact speed = the car's speed × the run-off factor (gravel slows it); above outAbove the car is out, above barrierAbove the barrier needs repair (red flag); below: damaged (downforce lost, may continue to the pits)" },
  // ---- contact in a braking zone (reported by traffic for an alongside battle)
  contactP: { v: 0.03, unit: "per event", est: true, range: [0.005, 0.1], why: "chance of contact for a typical half-overlap, 3 m/s closing, average racecraft, dry, touching distance" },
  contactDv: { v: 3, unit: "m/s", est: true, range: [1, 8], why: "closing speed scale: × (1 + dv / this) / 2" },
  contactLat: { v: 0.5, unit: "m", est: true, range: [0.2, 1.5], why: "lateral clearance scale: × exp(−clearance / this)" },
  contactWet: { v: 1.0, unit: "× per mm", est: true, range: [0, 3], why: "water raises it: × (1 + this × h)" },
  racecraftRef: { v: 0.8, unit: "racecraft", est: true, range: [0.5, 0.95], why: "the average racecraft (0–1): × (1 − mean racecraft)/(1 − this)" },
  contactOut: { v: { none: 0.5, wing: 0.3, puncture: 0.12, out: 0.08 }, unit: "weights", est: true, range: null, why: "what a contact does (the hit car); faster closing shifts weight to the worse outcomes" },
  // ---- mechanical failure: hazard per hour of running
  mechPerHour: { v: 0.045, unit: "1/h at reliab 1", est: true, range: [0.01, 0.15], why: "≈ 0.07 failures per car per 1.5 h race: about 1–1.5 mechanical retirements per 20-car race (2024–25 typical)" },
  mechAttack: { v: 0.6, unit: "× per share", est: true, range: [0, 2], why: "attack pace share raises it: × (1 + this × share)" },
  mechPush: { v: 0.8, unit: "× per share", est: true, range: [0, 2], why: "energy push / overtake share raises it: × (1 + this × share)" },
  mechHot: { v: 0.04, unit: "× per °C over 30", est: true, range: [0, 0.1], why: "hot air: × (1 + this × (T − 30))" },
  mechKind: { v: { pu: 0.35, gearbox: 0.15, hydraulics: 0.15, brakes: 0.10, powerLoss: 0.25 }, unit: "weights", est: true, range: null, why: "what fails: the first four stop the car, a power loss leaves it running slower (power × 0.85–0.95)" },
  coastToPit: { v: 1500, unit: "m", est: true, range: [500, 3000], why: "a car that fails this close before the pit entry coasts in and retires in the garage (no neutralisation)" },
  // ---- race control's response (rule of thumb; clearing times drawn uniformly, seeded)
  clear: { v: { yellow: [30, 60], double: [60, 180], vsc: [90, 240], sc: [240, 480], red: [1200, 2400] }, unit: "s", est: true, range: null,
    why: "how long clearing takes: a spun car rejoining (yellow), a car pushed behind the barrier (double yellow), a recovery vehicle near the track (VSC), a crane / truck on the track or debris on the line (SC), barrier repair (red). SC deployed → 'IN THIS LAP' in the cached races: median 7.8 min, 2–15.7 (RCM probe)" },
};
export const INCIDENTS_PARAMS_VERSION = 1;
