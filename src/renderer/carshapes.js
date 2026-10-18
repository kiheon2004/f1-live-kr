// Each team's car, as raced that season, in the few shape features photos and technical articles agree on – applied to
// the era's car (car3d.js body2022 / body2026) as changes to its sections and parts. Photo-based approximations: no
// team publishes its car's shape; the proportions stay the era's (wheelbase, width, wheels, cockpit, camera mounts –
// the model contract of car3d.js is unchanged). "unknown" in the research keeps the era's neutral shape for that part.
// Launch renders and show cars were not used. Research: docs/research/cars2025.md, cars2026.md, wheels.md
// (each item with its source, date and confidence).
//
// nose:  len  long | medium | short (where the tip ends: on the front wing's main plane or on its second element)
//        tip  high | mid | low · w narrow | medium | wide
// pod:   inlet  letterbox (low, wide slot) | p (P-shaped) | vertical (tall, narrow, by the chassis) | wide (big)
//        undercut deep | medium | shallow · top ramp (downwash ramp) | halframp | gully (waterslide / bathtub)
// airbox: triangle | oval | rect (big, boxy) · cooling: cannon | louvres | bulge | split
// fsusp / rsusp: push | pull (rods) · blade: the horizontal blade atop the front wing's endplates (2026 Cadillac, Haas)
// wheel: the steering wheel where a source shows it – style rect | sculpted, ratio (width / height), leds (top-row
//   shift lights), rotaries, buttons; else the era's neutral wheel (the 4.3" FIA-standard Motion Applied display in
//   the middle, as every team has)
// from / until: ISO dates of the events between which the entry applies (a car's upgrade), else the whole season
export const CAR_SHAPES = [
  // ---- 2025 (FIA 2025 Technical Regulations Issue 03; the research's H/M items) ----
  { season: 2025, team: /red bull racing/i, id: "rb21", nose: { len: "short", tip: "high", w: "wide" }, pod: { inlet: "letterbox", undercut: "deep", top: "ramp" }, airbox: "triangle", cooling: "cannon", fsusp: "pull", rsusp: "push",
    src: "F1.com tech (Piola/Hughes) 2025: the raced nose short, its tip on the second element (from Bahrain test day 3); letterbox inlet, steep downwash ramp, pull-rod front" },
  { season: 2025, team: /racing bulls|rb f1|visa/i, id: "vcarb02", nose: { len: "long", tip: "low", w: "medium" }, pod: { inlet: "letterbox", undercut: "deep", top: "ramp" }, airbox: "rect", fsusp: "pull", rsusp: "push",
    src: "2025 tech coverage: letterbox inlet with a vertical slot, boxy airbox, pull-rod front (Red Bull-derived rear)" },
  { season: 2025, team: /mclaren/i, id: "mcl39", nose: { len: "medium", tip: "mid", w: "narrow" }, pod: { inlet: "p", undercut: "deep", top: "ramp" }, fsusp: "pull", rsusp: "push", cooling: "bulge",
    src: "F1.com Hughes 2025: P-shaped inlet, downwash ramp, pull-rod front, push-rod rear" },
  { season: 2025, team: /ferrari/i, id: "sf25", nose: { len: "medium", tip: "mid", w: "wide" }, pod: { inlet: "p", undercut: "deep", top: "gully" }, fsusp: "pull", rsusp: "pull",
    src: "Ferrari SF-25: pull-rod front new for 2025, pull-rod rear; P-shaped inlet, gully top (F1.com tech 2025)" },
  { season: 2025, team: /mercedes/i, id: "w16", nose: { len: "medium", tip: "low", w: "medium" }, pod: { inlet: "vertical", undercut: "deep", top: "ramp" }, cooling: "cannon", fsusp: "push", rsusp: "push",
    src: "Mercedes W16: wide vertical inlet, long nose, push-rod front and rear (F1.com tech 2025) – nose length: two noses tested in Bahrain (PlanetF1 2025-02-26), the raced one not found: medium (neutral)" },
  { season: 2025, team: /aston martin/i, id: "amr25", nose: { len: "medium", tip: "mid", w: "wide" }, pod: { inlet: "p", undercut: "medium", top: "gully" }, cooling: "split", fsusp: "push", rsusp: "push",
    src: "AMR25: wide boxy nose, P-shaped inlet, gully top (F1.com tech 2025)" },
  { season: 2025, team: /alpine/i, id: "a525", wheel: { style: "rect", ratio: 1.5, leds: 15, rotaries: 8, buttons: 12, src: "Alpine 2025: replica from the team's CAD (284 × 190 mm, TPE grips, 12 buttons, 4 + 4 rotaries, 15 top LEDs) – may differ from the race wheel" }, nose: { len: "medium", tip: "mid", w: "medium" }, pod: { inlet: "p", undercut: "medium", top: "ramp" }, fsusp: "push", rsusp: "push",
    src: "A525: push-rod front (Mercedes-like for 2025), P-shaped inlet, downwash ramp" },
  { season: 2025, team: /haas/i, id: "vf25", nose: { len: "long", tip: "mid", w: "wide" }, pod: { inlet: "wide", undercut: "deep", top: "ramp" }, fsusp: "push", rsusp: "pull",
    src: "VF-25: Ferrari-supplied rear (pull-rod), push-rod front, long nose, hooped inlet" },
  { season: 2025, team: /williams/i, id: "fw47", nose: { len: "long", tip: "low", w: "medium" }, pod: { inlet: "wide", undercut: "medium", top: "gully" }, fsusp: "push", rsusp: "push",
    src: "FW47: push-rod rear new with the Mercedes gearbox; hooped inlet, gully top" },
  { season: 2025, team: /sauber|kick/i, id: "c45", nose: { len: "medium", tip: "mid", w: "medium" }, pod: { inlet: "wide", undercut: "medium", top: "gully" }, fsusp: "pull", rsusp: "pull",
    src: "C45: pull-rod front; rear contested (F1.com: pull) – medium confidence" },
  // ---- 2026 (FIA 2026 Technical Regulations Section C Issue 17; the research's H/M items) ----
  { season: 2026, team: /aston martin/i, id: "amr26", nose: { len: "short", tip: "high", w: "wide" }, pod: { inlet: "letterbox", undercut: "deep", top: "ramp" }, cooling: "bulge", fsusp: "push", rsusp: "push",
    src: "AMR26: wide 'pelican' nose on the second element, tiny letterbox inlet, tube-like down-ramped pods (F1.com Hughes/Piola 9 Feb 2026; The Race 30 Jan 2026)" },
  { season: 2026, team: /audi|sauber/i, id: "audi26", nose: { len: "medium", tip: "low" }, pod: { inlet: "vertical", undercut: "shallow", top: "ramp" }, airbox: "oval", fsusp: "push", rsusp: "push",
    src: "Audi R26: narrow vertical inlet by the chassis, oval airbox (race spec from Bahrain)" },
  { season: 2026, team: /ferrari/i, id: "sf26", wheel: { style: "sculpted", leds: 0, rotaries: 3, buttons: 10, src: "Ferrari 2026 wheel (Abu Dhabi FP1 2025-12-08 prototype; italpassion 2026-01-02): slimmer, wavy sculpted top, smaller lower section, lower rotaries 6 → 3" }, pod: { inlet: "p", undercut: "medium", top: "halframp" }, airbox: "triangle", cooling: "bulge", fin: "serrated", fsusp: "push", rsusp: "push",
    src: "SF-26: triangular airbox, serrated shark fin (The Race 23 Jan 2026), P-shaped inlet" },
  { season: 2026, team: /mercedes/i, id: "w17", nose: { len: "short", w: "narrow" }, pod: { inlet: "wide", undercut: "medium", top: "ramp" }, fsusp: "push", rsusp: "push",
    src: "W17: nose on the second front-wing element (F1.com tech 2026)" },
  { season: 2026, team: /mclaren/i, id: "mcl40", nose: { tip: "high", w: "narrow" }, pod: { inlet: "vertical", undercut: "deep", top: "halframp" }, airbox: "triangle", fsusp: "push", rsusp: "push",
    src: "MCL40: vertical inlet (squarer from Baku), triangular airbox; narrow nose, high tip (motorsport.tech 2026-03-03, test images; M)" },
  { season: 2026, team: /red bull racing/i, id: "rb22", nose: { len: "long", tip: "mid", w: "wide" }, pod: { inlet: "wide", undercut: "shallow", top: "ramp" }, fsusp: "push", rsusp: "push",
    src: "RB22: shrink-wrapped pods with a full downwash ramp from Japan; wide nose (Hughes: AMR26's 'about RB22's width'; motorsport.tech 'wide flat tipped', M); its length from renders only (L); v0.40: the tip not low – a side photo of the race car (Austrian GP 2026-06-26, FIA F1 Austria 2026 Nr. 3, hub-aligned with a fitted camera) has it ~6 cm over the model's low tip: mid (M)" },
  { season: 2026, team: /racing bulls|visa/i, id: "vcarb03", nose: { len: "short", tip: "high" }, pod: { inlet: "vertical", top: "halframp" }, airbox: "rect", fsusp: "push", rsusp: "push", until: "2026-07-25",
    src: "VCARB 03: huge boxy 'shoebox' airbox – made much smaller from Spa (one car) and Hungary 2026 (both cars)" },
  { season: 2026, team: /racing bulls|visa/i, id: "vcarb03b", nose: { len: "short", tip: "high" }, pod: { inlet: "vertical", top: "halframp" }, airbox: "oval", fsusp: "push", rsusp: "push", from: "2026-07-25",
    src: "VCARB 03 from the Hungarian GP 2026: the smaller airbox (its shape an estimate)" },
  { season: 2026, team: /haas/i, id: "vf26", wheel: { style: "sculpted", leds: 0, rotaries: 3, buttons: 10, src: "Haas: Ferrari-supplied wheel – the SF-26's shape assumed (inference, not sourced)" }, nose: { len: "long", tip: "low" }, pod: { inlet: "wide", undercut: "medium", top: "gully" }, blade: true, fsusp: "push", rsusp: "push", until: "2026-05-22",
    src: "VF-26 to Miami: waterslide / gully top, medium undercut (PlanetF1 2026-04-18; motorsport.tech; M); blade atop the front wing's endplate; long nose from renders only (L)" },
  { season: 2026, team: /haas/i, id: "vf26b", wheel: { style: "sculpted", leds: 0, rotaries: 3, buttons: 10, src: "Haas: Ferrari-supplied wheel – the SF-26's shape assumed (inference, not sourced)" }, nose: { len: "long", tip: "low" }, pod: { inlet: "wide", undercut: "deep", top: "ramp" }, blade: true, fsusp: "push", rsusp: "push", from: "2026-05-22",
    src: "VF-26 from the Canadian GP 2026: deep undercut and downwash ramp (FIA car presentation submissions, Canadian GP 2026; H); long nose from renders only (L)" },
  { season: 2026, team: /cadillac/i, id: "cad26", wheel: { style: "rect", leds: 15, rotaries: 3, buttons: 12, src: "Cadillac 2026: a refaced Motion Applied TSW-700 – 12 buttons, 3 rotaries, 15 RGB shift LEDs in a top row" }, pod: { inlet: "letterbox", undercut: "deep", top: "ramp" }, blade: true, fsusp: "pull", rsusp: "push",
    src: "Cadillac 2026: pull-rod front, blade atop the front wing's endplate" },
  { season: 2026, team: /alpine/i, id: "a526", pod: { inlet: "wide", undercut: "deep", top: "gully" }, fsusp: "pull", rsusp: "push",
    src: "A526: pull-rod front (high confidence), wide inlet, gully top" },
  { season: 2026, team: /williams/i, id: "fw48", nose: { tip: "low", w: "wide" }, pod: { inlet: "wide", undercut: "medium", top: "halframp" }, cooling: "bulge", fsusp: "pull", rsusp: "push",
    src: "FW48: pull-rod front; the nose 'sits low and also forms a chin' (motorsport.tech 2026 previews, M)" },
];
// The team's shape for a season (and the event's date, for a car changed during it), or null (the era's neutral car)
// The date: the session's local date (YYYY-MM-DD, the track's) – an entry with from / until applies from its first day,
// up to the day before `until`. Without a valid date, an entry limited to part of the season is never taken for the car
// (v0.35 took the first one: Racing Bulls' early airbox for any 2026 session without a date) – the team's whole-season
// entry if it has one, else the era's neutral car.
export function shapeFor(season, teamName, date = null, list = CAR_SHAPES) {
  const d = typeof date === "string" && /^\d{4}-\d\d-\d\d/.test(date) ? date.slice(0, 10) : null;
  const mine = list.filter((s) => s.season === +season && s.team.test(teamName || ""));
  if (!d) return mine.find((s) => !s.from && !s.until) || null;
  return mine.find((s) => (!s.from || d >= s.from) && (!s.until || d < s.until)) || null;
}
