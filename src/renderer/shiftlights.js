// The steering wheel's shift lights (pure; car3d.js draws them, map3d.js feeds them each frame).
//
// v0.39 drew ten dots inside the wheel's screen picture (a canvas repainted at most 8 times a second – a fill that
// moved in steps of 125 ms) and a row of grey "LEDs" on the wheel's top made of the buttons' own shape and material,
// never lit. Now the lights are their own parts (a row on the wheel's top edge, or over the display's top where the
// team's wheel has them there), lit every frame from the driver's own revs and gear at the moment shown.
//
// What the lights say: how near the revs are to the point where THIS driver shifts up in THIS gear – taken from their
// own telemetry (the revs just before each full-throttle upshift seen so far in the session; the median of the last
// few in that gear), not the engine's allowed maximum (15,000 rpm on paper – no car shifts there) and not a fixed
// number. Before any upshift in a gear has been seen, the driver's shifts in the other gears, else the era's usual
// figure. A visualisation of the data: no team's real shift-light calibration is public, so the thresholds below are
// an approximation and say so (SHIFT.note); a team's lighting ORDER and colours are used only where a source shows them
// (none yet for 2025–26 in moving footage – research wheels40.md; the neutral row's green/red/blue in fives is what a
// lit SF-25 launch photo and McLaren's 2017 description show)
// (wheel profiles in car3d.js / carshapes.js: leds { count, colours, pattern, flash, src }).
//
// Timing: the feed's telemetry comes ~4 times a second. The lights read the gear and revs at t from replay.js carAt –
// the same reading the wheel's screen, the 3D view's bottom bar and the telemetry panel show (v0.41: until then the lights
// had their own sampler here, revsAt, which took the next gear from half-way while the screen held the earlier one – the
// two disagreed for up to a quarter of a second at every shift). Its policy (carAt's comment): over a gear change both
// gear and revs from the nearer sample, switching half-way; revs blended only within a gear; no blend over a gap. When a
// shift really happened between two samples is not known – the half-way switch is a drawing, not a measured time.
export const SHIFT = {
  // the revs below the shift point where the first light comes on – no team's calibration is public (research
  // wheels40.md: no 2025–26 source describes a sequence); a design choice: the row filling over the last ~1,000 rpm
  // (the measured upshifts spread over ~11,100–12,150 rpm across the grid, so a wider span would light most of a lap)
  span: 1000,
  // the era's shift point when the driver's own isn't known yet: the grid's median upshift revs measured from the cached
  // telemetry of 27 races of 2025 (team medians 11,626–11,796) and 26 of 2026 (11,444–11,748) – research
  // upshift_rpm_races_2025_2026.json (H; the 4 Hz samples read the peaks ~100–300 rpm low). Not the rules' limit (15,000
  // rpm to 2025; the 2026 rules set none) – no car shifts there
  fallback: { 2022: 11700, 2026: 11600 },
  minRpm: 8000,         // an upshift below this is a lift / a slow corner's shift, not a shift-light shift
  minThr: 90,           // full throttle (%) for an upshift to count
  keep: 7,              // the last upshifts in a gear the median is taken from
  scan: 160,            // how many of the last upshifts are looked through for them (~3 laps' worth)
  flashHz: 8,           // the row flashing at the shift point, where the profile has it (a source shows it)
  note: "변속등: 이 드라이버의 실제 업시프트 RPM(텔레메트리)을 기준으로 한 근사 표시 – 팀의 실제 점등 설정은 공개되지 않음",
};

// A car's upshifts (cached on the telemetry object like the wheels' odometer: car.ups { n, list: [t, gear from, rpm] }),
// extended as samples arrive (a live feed) – each from the sample before the gear went up: its revs, the higher of the
// two samples before it (the revs peak between samples), at full throttle above SHIFT.minRpm.
export function upshifts(car) {
  if (!car?.t || !car.gear || !car.rpm) return null;
  const n = car.t.length;
  let u = car.ups;
  if (!u || u.n > n || (u.t0 != null && u.t0 !== car.t[0])) u = car.ups = { n: 0, list: [], t0: car.t[0] };
  for (let j = Math.max(1, u.n); j < n; j++) {
    const i = j - 1, g0 = car.gear[i], g1 = car.gear[j];
    if (!(g0 >= 1 && g1 === g0 + 1 && g1 <= 8) || car.t[j] - car.t[i] > 1000) continue;   // (the 2026 feed's 9–128 on a stopped car: no gear)
    const thr = car.thr ? car.thr[i] : 100;
    if (thr < SHIFT.minThr) continue;
    const rpm = Math.max(car.rpm[i], i > 0 && car.gear[i - 1] === g0 ? car.rpm[i - 1] : 0);
    if (rpm >= SHIFT.minRpm) u.list.push([car.t[j], g0, rpm]);
  }
  u.n = n;
  return u;
}
// the driver's shift point in `gear` at session time t (rpm): the median of the last SHIFT.keep upshifts out of that
// gear before t; else of all gears; else the era's figure. { rpm, from: "gear" | "driver" | "era" }
export function shiftPoint(car, gear, t, era = "2026") {
  const u = upshifts(car), list = u?.list || [];
  let k = list.length; while (k > 0 && list[k - 1][0] > t) k--;
  const mine = [], any = [];
  // (looked back over the last SHIFT.scan upshifts at most: 8th gear has none out of it, and this runs every frame)
  for (let i = k - 1; i >= Math.max(0, k - SHIFT.scan) && (mine.length < SHIFT.keep || any.length < SHIFT.keep); i--) {
    if (list[i][1] === gear && mine.length < SHIFT.keep) mine.push(list[i][2]);
    if (any.length < SHIFT.keep) any.push(list[i][2]);
  }
  if (mine.length >= 2) return { rpm: median(mine), from: "gear" };
  if (any.length >= 3) return { rpm: median(any), from: "driver" };
  return { rpm: SHIFT.fallback[era] || SHIFT.fallback[2026], from: "era" };
}
function median(a) { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

// Light profiles: how a row lights up. count – lights in the row; colours – each light's colour when lit (left to
// right); pattern – "left-right" (filling from the left), "ends-in" (from both ends to the middle); flash – the whole row
// flashing at the shift point (true only where a source shows it; null: not known – not flashed); top – the colour the
// row takes at the shift point (null: each light its own). `src` and `basis` say where it comes from.
export const LED_PROFILES = {
  // the app's neutral row where the team's isn't known: 15 lights (the FIA-standard Motion Applied wheels' usual top
  // row – Cadillac 2026's refaced TSW-700, the Alpine CAD replica), green / red / blue in fives, left to right – the
  // most common layout in onboard footage of 2022–25 cars (M); not flashed (not known per team)
  neutral: { count: 15, colours: [..."GGGGGRRRRRBBBBB"].map((c) => ({ G: "#1fd65f", R: "#ff2b1c", B: "#2f7bff" })[c]), pattern: "left-right", flash: null, top: null,
    basis: "an approximation: the usual green–red–blue row of 2022–26 wheels; the team's own order and colours not known" },
  // the user's preferred look (a choice in the settings, not any team's): blue lights filling left to right, the right
  // end lighting red at the shift point
  fillRed: { count: 15, colours: Array(15).fill("#2f8bff"), pattern: "left-right", flash: null, top: null, endRed: true,
    basis: "the viewer's chosen look (fill, right end red at the shift point) – not a team's calibration" },
};

// The row's state (pure): each light's colour (a hex string) or null (off), from the revs, the shift point and the
// profile; t (ms) for the flash's phase (the session's time: the same picture after a seek)
//   lit: how many lights (0..count) – the share of the way from (shift − span) to the shift point
export function ledState(profile, rpm, shiftRpm, t = 0, span = SHIFT.span) {
  const n = profile.count, out = new Array(n).fill(null);
  if (!(rpm > 0) || !(shiftRpm > 0)) return { lit: 0, at: false, colours: out };
  const f = (rpm - (shiftRpm - span)) / span, at = f >= 1;
  const lit = Math.max(0, Math.min(n, Math.floor(f * n + 1e-9)));
  const order = profile.pattern === "ends-in" ? endsIn(n) : [...Array(n).keys()];
  if (at && profile.flash && Math.floor((t / 1000) * SHIFT.flashHz * 2) % 2 === 1) return { lit: 0, at, colours: out };
  for (let k = 0; k < lit; k++) { const i = order[k]; out[i] = at && profile.top ? profile.top : profile.colours[i]; }
  if (at && profile.endRed) { out[n - 1] = "#ff1e12"; if (n > 8) out[n - 2] = "#ff1e12"; }
  return { lit, at, colours: out };
}
// both ends towards the middle: 0, n−1, 1, n−2, …
function endsIn(n) { const o = []; for (let a = 0, b = n - 1; a <= b; a++, b--) { o.push(a); if (b !== a) o.push(b); } return o; }

// One car's lights now: car – its telemetry (replay.js src.car[num]: the upshifts the thresholds come from); now – its
// reading at t (replay.js carAt(car, t): { gear, rpm } – the one the screen shows), null when no data (all off – never
// the last values as if current)
export function carLeds(car, t, profile, era = "2026", now = null) {
  const r = car ? now : null;
  if (!r || !(r.gear >= 1 && r.gear <= 8)) return { ...ledState(profile, 0, 1), rpm: r?.rpm ?? null, gear: r?.gear ?? null, shift: null };
  const sp = shiftPoint(car, r.gear, t, era);
  return { ...ledState(profile, r.rpm, sp.rpm, t), rpm: r.rpm, gear: r.gear, shift: sp };
}

// The profile for a car's lights: its wheel's row (car3d.js wheelSpec leds: count, and where a source shows them
// colours / pattern / flash) in the viewer's chosen look – "team" (the row's own colours where known, else the neutral
// green–red–blue) or "fill" (LED_PROFILES.fillRed) – always as many lights as the wheel has
export function profileForWheel(leds, look = "team") {
  const n = leds?.count || 0;
  if (!n) return null;
  const base = look === "fill" ? LED_PROFILES.fillRed : LED_PROFILES.neutral;
  const own = look === "team" && Array.isArray(leds.colours) && leds.colours.length === n ? leds.colours : null;
  const colours = own || Array.from({ length: n }, (_, i) => base.colours[Math.min(base.colours.length - 1, Math.floor((i * base.colours.length) / n))]);
  return { ...base, count: n, colours, pattern: look === "team" && leds.pattern ? leds.pattern : base.pattern, flash: look === "team" ? leds.flash ?? null : null, top: look === "team" ? leds.top ?? null : null,
    basis: own ? leds.src || base.basis : base.basis };
}
