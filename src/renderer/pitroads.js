// A pit lane's roads from surveyed lines – where the map and the feed give only a path: the road that leaves the track
// for the pit lane, the lane's own paint, the road back to the track. PIT_ROADS[venue key] holds the lines ([lat, lon]);
// pitRoads() turns them into the surfaces map3d.js draws with the lane's own tarmac (pitLaneMeshes), so that a car in
// the pits rides on them as it rides on the lane.
//
// Why not a model file: a road is not a building. The lane lies on the garages' floors and the ground beside the track
// follows the track's own height – a flat slab stood on the terrain ends up 0.3 m under both, or flickers against them.
// Built here, each point takes the height an auxiliary road has there (auxroads.js blendHeight) and joins the lane.
import { blendHeight } from "./auxroads.js";

// lane: doors – the garage door line's two ends; width – from the doors to the wall;
//       span – the door line's length as surveyed (lengths along it below are in those metres; default: as measured here);
//       u – [from, to] along the door line, the lane's own ends (default: the door line's: [0, span]);
//       bands – paint along the lane: [metres from the door line, to, colour, from u, to u] (the last two optional);
//       cross – lines across it: [u, from v, to v, width, colour].
// entry / exit: the road's two edges, section by section (left[i] and right[i] face each other), in the cars' direction;
//       the entry's last section and the exit's first are joined to the lane's ends.
// edgeLine: a white line that wide just inside each edge of the entry and exit roads (0: none – see lines).
// tarmac: more strips of the same surface ({ left, right } as above) – no lines, not joined to the lane.
// lines: painted lines – { pts: [[lat, lon] …], width, colour, dash: [painted, bare] metres, onTrack: true – drawn on the
//       track's own surface where it runs there (a pit exit line that runs on inside the track's edge) }.
// hatch: a painted field in stripes – { poly: [[lat, lon] …] (convex), c: [cu, cv] – a stripe is where cu·u + cv·v lies
//       in a range, u and v the lane's own metres –, period, stripes: [[from, to, colour] …] within a period, rest: colour }.
// Colours: "white", "red", "green", "concrete" (a pale working lane).
export const PIT_ROADS = {
  // Spa-Francorchamps: read off Esri World Imagery of 2025-06-22 at 0.19 m a pixel by the chat-side session (2026-11-26), the
  // lane's red band checked in a 2022 photograph – the lane good to 0.5 m, the entry and exit roads to 1.5 m. From the
  // garage doors: a working lane of 6 m, a white – red – white band (6.0 … 7.9 m), the fast lane (7.9 … 11.0 m), the wall;
  // a thin white line 2.4 m before the doors. The entry road leaves the track before the Bus Stop's last corner, runs
  // round its outside and beside the straight; the exit road turns right inside La Source and joins the descent.
  7: {
    src: "the chat-side session's survey of Esri World Imagery 2025-06-22 (looked at only) and one 2022 photograph (Wikimedia Commons, '2022 Le Mans Cup – Pit lane at Spa'): carpilot venue/stands/spa_pitlane.json, 2026-11-26",
    lane: { doors: [[50.4430209, 5.9665199], [50.4453564, 5.9644085]], width: 11.0, bands: [[2.4, 2.55, "white"], [6.0, 6.2, "white"], [6.2, 7.7, "red"], [7.7, 7.9, "white"]] },
    edgeLine: 0.15,
    entry: {
      left: [[50.441569, 5.9669446], [50.4415652, 5.9669794], [50.4415613, 5.9670141], [50.4415575, 5.967049], [50.4415537, 5.9670837], [50.4415498, 5.9671185], [50.441546, 5.9671525], [50.4415433, 5.9671818], [50.4415457, 5.967212], [50.4415483, 5.9672471], [50.4415508, 5.9672821], [50.4415534, 5.9673172], [50.441556, 5.9673523], [50.4415581, 5.9673831], [50.4415626, 5.9674045], [50.4415745, 5.9674259], [50.4415888, 5.967453], [50.4416033, 5.9674801], [50.4416177, 5.9675071], [50.4416321, 5.9675342], [50.4416416, 5.9675543], [50.4416522, 5.9675573], [50.4416717, 5.9675577], [50.4416942, 5.9675589], [50.4417167, 5.9675599], [50.4417345, 5.967561], [50.4417485, 5.9675535], [50.4417667, 5.9675397], [50.4417869, 5.9675245], [50.4418073, 5.9675094], [50.4418276, 5.9674943], [50.4418478, 5.9674791], [50.4418667, 5.967465], [50.4418848, 5.9674486], [50.4419043, 5.9674311], [50.4419238, 5.9674136], [50.4419434, 5.9673963], [50.4419629, 5.9673788], [50.4419824, 5.9673613], [50.442002, 5.9673438], [50.4420215, 5.9673263], [50.442041, 5.9673088], [50.4420605, 5.9672914], [50.4420801, 5.967274], [50.4420996, 5.9672565], [50.442119, 5.9672391], [50.4421382, 5.9672218], [50.4421577, 5.9672042], [50.4421772, 5.9671866], [50.4421967, 5.9671689], [50.4422162, 5.9671513], [50.4422356, 5.9671337], [50.4422551, 5.9671161], [50.4422745, 5.9670985], [50.442294, 5.9670809], [50.4423135, 5.9670633], [50.442333, 5.9670457], [50.4423525, 5.9670281], [50.4423717, 5.9670107], [50.4423906, 5.966993], [50.4424097, 5.9669747], [50.4424289, 5.9669564], [50.4424481, 5.966938], [50.4424673, 5.9669197], [50.4424865, 5.9669014], [50.4425057, 5.9668831], [50.4425249, 5.9668647], [50.4425441, 5.9668464], [50.4425633, 5.9668281], [50.4425825, 5.9668098], [50.4426017, 5.9667914], [50.4426207, 5.9667732], [50.4426391, 5.9667547], [50.4426571, 5.9667346], [50.4426755, 5.9667144], [50.4426939, 5.9666941], [50.4427123, 5.9666737], [50.4427307, 5.9666534], [50.442749, 5.9666331], [50.4427674, 5.9666128], [50.4427858, 5.9665926], [50.4428041, 5.9665721], [50.4428223, 5.9665517], [50.4428407, 5.9665312], [50.442859, 5.9665107], [50.4428773, 5.9664903], [50.4428957, 5.9664698], [50.442914, 5.9664493], [50.4429323, 5.9664289], [50.4429506, 5.9664084], [50.442969, 5.9663879]],
      right: [[50.4415204, 5.9669313], [50.4415166, 5.966966], [50.4415126, 5.9670008], [50.4415088, 5.9670357], [50.441505, 5.9670704], [50.4415011, 5.9671052], [50.4414972, 5.9671406], [50.4414939, 5.967181], [50.4414966, 5.9672209], [50.4414992, 5.9672559], [50.4415018, 5.967291], [50.4415043, 5.9673261], [50.4415068, 5.9673611], [50.4415099, 5.9674003], [50.4415196, 5.9674429], [50.4415365, 5.9674757], [50.4415509, 5.9675027], [50.4415654, 5.9675298], [50.4415798, 5.9675569], [50.4415942, 5.967584], [50.4416135, 5.967618], [50.4416427, 5.9676354], [50.441668, 5.9676398], [50.4416904, 5.9676437], [50.4417127, 5.9676476], [50.4417398, 5.9676515], [50.4417681, 5.9676415], [50.4417911, 5.9676269], [50.441812, 5.9676137], [50.4418327, 5.9676005], [50.4418536, 5.9675873], [50.4418745, 5.9675741], [50.4418968, 5.9675596], [50.4419178, 5.9675415], [50.4419376, 5.9675244], [50.4419573, 5.9675074], [50.441977, 5.9674904], [50.4419967, 5.9674735], [50.4420163, 5.9674565], [50.442036, 5.9674395], [50.4420557, 5.9674224], [50.4420754, 5.9674053], [50.4420951, 5.9673883], [50.4421148, 5.9673714], [50.4421345, 5.9673544], [50.4421543, 5.9673372], [50.4421741, 5.9673196], [50.4421935, 5.967302], [50.442213, 5.9672844], [50.4422326, 5.9672667], [50.442252, 5.9672491], [50.4422715, 5.9672315], [50.4422909, 5.9672139], [50.4423104, 5.9671963], [50.4423299, 5.9671787], [50.4423494, 5.9671611], [50.4423689, 5.9671435], [50.4423883, 5.9671259], [50.442408, 5.9671081], [50.4424277, 5.9670896], [50.442447, 5.9670712], [50.4424662, 5.9670528], [50.4424854, 5.9670345], [50.4425046, 5.9670162], [50.4425238, 5.9669979], [50.442543, 5.9669795], [50.4425623, 5.9669611], [50.4425815, 5.9669428], [50.4426007, 5.9669245], [50.4426199, 5.9669061], [50.4426391, 5.9668878], [50.4426585, 5.9668693], [50.4426782, 5.9668503], [50.4426976, 5.9668316], [50.4427168, 5.9668131], [50.442736, 5.9667946], [50.4427552, 5.9667762], [50.4427744, 5.9667578], [50.4427935, 5.9667394], [50.4428127, 5.9667209], [50.4428319, 5.9667024], [50.4428511, 5.9666839], [50.4428703, 5.9666654], [50.4428894, 5.9666468], [50.4429086, 5.9666284], [50.4429277, 5.9666099], [50.4429469, 5.9665913], [50.4429661, 5.9665728], [50.4429852, 5.9665544], [50.4430043, 5.9665358], [50.4430235, 5.9665173]] },
    exit: {
      left: [[50.4453038, 5.9642773], [50.4453225, 5.9642577], [50.4453411, 5.964238], [50.4453597, 5.9642184], [50.4453784, 5.9641988], [50.445397, 5.9641792], [50.4454157, 5.9641596], [50.4454344, 5.9641399], [50.445453, 5.9641203], [50.4454717, 5.9641006], [50.4454913, 5.96408], [50.4455119, 5.9640615], [50.4455315, 5.9640442], [50.4455511, 5.9640269], [50.4455707, 5.9640096], [50.4455902, 5.9639923], [50.4456098, 5.9639749], [50.4456294, 5.9639577], [50.4456489, 5.9639404], [50.4456685, 5.963923], [50.4456902, 5.9639039], [50.4457163, 5.9638876], [50.4457419, 5.9638804], [50.4457642, 5.9638749], [50.4457924, 5.963868], [50.4458227, 5.963876], [50.4458463, 5.9638894], [50.4458701, 5.9639033], [50.4458957, 5.9639279], [50.4459135, 5.9639608], [50.4459278, 5.9639879], [50.4459451, 5.9640219], [50.4459547, 5.9640645], [50.4459603, 5.9641008], [50.4459657, 5.9641363], [50.4459703, 5.9641807], [50.4459651, 5.9642239], [50.4459605, 5.9642585], [50.445956, 5.964293], [50.4459514, 5.9643274], [50.4459466, 5.964364], [50.4459397, 5.9644], [50.4459328, 5.964434], [50.4459259, 5.9644675], [50.4459191, 5.9645011], [50.4459123, 5.9645347], [50.4459054, 5.9645683], [50.4458986, 5.9646017], [50.4458919, 5.9646352], [50.4458851, 5.9646688], [50.4458785, 5.9647024], [50.4458717, 5.964736], [50.4458651, 5.9647697], [50.4458584, 5.9648034], [50.4458521, 5.9648351], [50.445848, 5.9648647], [50.4458461, 5.9648973], [50.4458438, 5.9649324], [50.4458411, 5.9649728], [50.4458317, 5.965013], [50.4458202, 5.9650465], [50.4458094, 5.9650774], [50.4457986, 5.9651084], [50.4457879, 5.9651394], [50.445777, 5.9651703], [50.4457663, 5.9652012]],
      right: [[50.4453597, 5.9644051], [50.4453781, 5.9643848], [50.4453964, 5.9643644], [50.4454148, 5.9643442], [50.4454331, 5.964324], [50.4454515, 5.9643036], [50.4454698, 5.9642833], [50.4454882, 5.964263], [50.4455065, 5.9642426], [50.4455249, 5.9642223], [50.4455422, 5.9642031], [50.4455599, 5.9641846], [50.4455786, 5.9641651], [50.4455974, 5.9641457], [50.4456161, 5.9641261], [50.4456348, 5.9641067], [50.4456536, 5.9640872], [50.4456722, 5.9640678], [50.445691, 5.9640482], [50.4457098, 5.9640288], [50.4457264, 5.9640111], [50.4457406, 5.9639988], [50.4457587, 5.9639893], [50.4457801, 5.9639782], [50.4457954, 5.9639684], [50.4458082, 5.9639706], [50.4458271, 5.9639796], [50.4458459, 5.9639881], [50.4458577, 5.9639977], [50.4458685, 5.9640192], [50.4458828, 5.9640464], [50.4458942, 5.9640667], [50.4458986, 5.9640898], [50.4459035, 5.9641222], [50.4459086, 5.9641552], [50.4459119, 5.9641794], [50.4459079, 5.9642053], [50.4459034, 5.9642399], [50.4458988, 5.9642744], [50.4458943, 5.9643089], [50.44589, 5.9643414], [50.445884, 5.9643728], [50.4458772, 5.9644059], [50.4458703, 5.9644396], [50.4458635, 5.9644732], [50.4458566, 5.9645067], [50.4458497, 5.9645403], [50.4458429, 5.964574], [50.4458361, 5.9646078], [50.4458294, 5.9646415], [50.4458227, 5.964675], [50.445816, 5.9647088], [50.4458093, 5.9647425], [50.4458027, 5.964776], [50.4457956, 5.9648117], [50.4457903, 5.9648507], [50.4457879, 5.9648883], [50.4457857, 5.9649234], [50.4457841, 5.9649532], [50.4457791, 5.9649785], [50.4457708, 5.9650085], [50.4457618, 5.9650409], [50.4457528, 5.9650732], [50.4457438, 5.9651056], [50.4457349, 5.9651379], [50.4457259, 5.9651703]] },
  },
};

// The height of a road laid there: the track's own (a little under its surface) right by the track, the terrain's from
// 10–25 m out – an auxiliary road's height (scenery.js auxY), 2 cm over it: a mapped service road under one of these
// must not show through. (Where the scene gives that height itself – `roadAt` – map3d.js takes it from there.)
export const ROAD_LIFT = 0.02;
export const roadHeight = (trackY, terrainY, dist) => (trackY == null ? terrainY + 0.05 : blendHeight(trackY, terrainY, dist, 10, 25)) + ROAD_LIFT;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
// plan: PIT_ROADS[key]; toXZ([lat, lon]) → scene [x, z]; roadY(x, z) → the height of a road on the ground there;
// slots: the garages along the lane, in order – [{ front: [x, z], inward: [dx, dz], width, floor, w (the lane's width
// there, garage front to the wall's face) }]. The app's own lane surface lies between the first and the last garage's
// middle, on their floors; this adds what lies beyond: the lane from its start to the first garage and from the last to
// its end (easing from the road's height to the garages' floor), the entry and the exit road, and the paint.
// trackY(x, z) (optional): the track's surface height where (x, z) is on the track's tarmac, else null – for `onTrack` lines.
// → { tarmac: { pos, uv, idx }, skirt: { pos, idx } – the strips' sides, 0.5 m down: beside the track the ground lies under
// the track's height –, paint: { white, red, … : { pos, idx } }, white, red (the same two), info }
export function pitRoads(plan, toXZ, roadY, slots, trackY = null) {
  const D0 = toXZ(plan.lane.doors[0]), D1 = toXZ(plan.lane.doors[1]), L = Math.hypot(D1[0] - D0[0], D1[1] - D0[1]), a = [(D1[0] - D0[0]) / L, (D1[1] - D0[1]) / L];
  let n = [-a[1], a[0]]; if (dot(n, slots[0].inward) > 0) n = [-n[0], -n[1]];   // (across, to the track: away from the garages)
  const uOf = (p) => dot(sub(p, D0), a), vOf = (p) => dot(sub(p, D0), n), at = (u, v) => [D0[0] + a[0] * u + n[0] * v, D0[1] + a[1] * u + n[1] * v];
  // (the survey's metres along the door line → this scene's: the two measure the door line a few decimetres apart)
  const k = plan.lane.span ? L / plan.lane.span : 1, U0 = plan.lane.u ? plan.lane.u[0] * k : 0, U1 = plan.lane.u ? plan.lane.u[1] * k : L;
  const S = slots.map((s) => { const u = uOf(s.front); return { u, u0: u - s.width / 2, u1: u + s.width / 2, v: vOf(s.front), floor: s.floor, w: s.w }; }).sort((p, q) => p.u - q.u);
  const runA = S[0].u, runB = S[S.length - 1].u, LIFT = 0.004, W = plan.lane.width;
  const floorAt = (u) => { if (u <= S[0].u) return S[0].floor; for (let i = 1; i < S.length; i++) if (u <= S[i].u) { const f = (u - S[i - 1].u) / (S[i].u - S[i - 1].u || 1); return S[i - 1].floor + (S[i].floor - S[i - 1].floor) * f; } return S[S.length - 1].floor; };
  // (how far out the garage front stands at u – the map's outline can stand further out than the door line in places)
  const frontV = (u) => { if (u < S[0].u0 || u > S[S.length - 1].u1) return -Infinity; let b = S[0]; for (const s of S) if (Math.abs(s.u - u) < Math.abs(b.u - u)) b = s; return b.v; };
  // the lane's surface height at (u, v): the garages' floor within the run; beyond it, eased to the road's height at the lane's end
  const laneY = (u, v) => {
    const [x, z] = at(u, v);
    if (u < runA) { const t = runA > U0 ? Math.max(0, Math.min(1, (u - U0) / (runA - U0))) : 1; return roadY(x, z) * (1 - t) + (floorAt(runA) + LIFT) * t; }
    if (u > runB) { const t = U1 > runB ? Math.max(0, Math.min(1, (U1 - u) / (U1 - runB))) : 1; return roadY(x, z) * (1 - t) + (floorAt(runB) + LIFT) * t; }
    return floorAt(u) + LIFT;
  };
  // (paint's height at a point: on the lane the lane's, elsewhere the road's)
  const onLane = (u, v) => u >= Math.min(U0, runA) - 0.01 && u <= Math.max(U1, runB) + 0.01 && v >= -0.5 && v <= W + 0.5;
  const paintAt = (x, z, lift = 0.008, track = false) => { const u = uOf([x, z]), v = vOf([x, z]); if (onLane(u, v)) return laneY(u, v) + lift; const ty = track && trackY ? trackY(x, z) : null; return ty != null ? ty + 0.006 : roadY(x, z) + lift; };
  const T = { pos: [], uv: [], idx: [] }, skirt = { pos: [], idx: [] }, paint = { white: { pos: [], idx: [] }, red: { pos: [], idx: [] } }, white = paint.white;
  const coat = (colour) => (paint[colour] ||= { pos: [], idx: [] });
  // a strip of surface through rows of three points (inner edge, middle, outer edge)
  const strip = (rows) => {
    let dist = 0;
    rows.forEach((r, i) => {
      if (i) dist += Math.hypot(r[1][0] - rows[i - 1][1][0], r[1][2] - rows[i - 1][1][2]);
      const v0 = T.pos.length / 3; r.forEach((p, k) => { T.pos.push(...p); T.uv.push(k * 0.75, dist / 6); });
      if (i) for (let k = 0; k < 2; k++) { const p = v0 - 3 + k, q = v0 + k; T.idx.push(p, q, p + 1, p + 1, q, q + 1); }
      // (its two sides)
      for (const k of [0, 2]) { const s0 = skirt.pos.length / 3, [x, y, z] = r[k]; skirt.pos.push(x, y, z, x, y - 0.5, z); if (i) skirt.idx.push(s0 - 4 + (k ? 2 : 0), s0 - 3 + (k ? 2 : 0), s0, s0 - 3 + (k ? 2 : 0), s0 + 1, s0); }
    });
  };
  const quadRun = (out, pts) => { for (let i = 0; i < pts.length; i++) { const v0 = out.pos.length / 3; out.pos.push(...pts[i][0], ...pts[i][1]); if (i && !pts[i].gap) out.idx.push(v0 - 2, v0 - 1, v0, v0 - 1, v0 + 1, v0); } };
  // ---- the lane beyond the garages: from its start to the first garage, from the last to its end
  const filler = (uFrom, uTo, sEnd, towardsRun) => {
    const k = Math.max(1, Math.ceil(Math.abs(uTo - uFrom) / 6)), rows = [];
    for (let i = 0; i <= k; i++) { const u = uFrom + ((uTo - uFrom) * i) / k, t = towardsRun ? i / k : 1 - i / k, w = W * (1 - t) + (sEnd.v + sEnd.w) * t; rows.push([-0.3, w / 2, w].map((v) => { const [x, z] = at(u, v); return [x, laneY(u, v), z]; })); }
    strip(rows);
  };
  if (runA > U0 + 0.5) filler(U0, runA, S[0], true);
  if (runB < U1 - 0.5) filler(runB, U1, S[S.length - 1], false);
  // ---- the entry and the exit road: the surveyed edges, each section at the ground's height – none of it inside the run
  // (join: the road meets the lane there – "end": its last section, at the lane's start; "start": its first, at the lane's
  // end. The surveyed sections stop a metre or two short of the lane's own first row: one more row, the lane's width)
  const laneRow = (u, like) => { const r = [W, W / 2, -0.3].map((v) => { const [x, z] = at(u, v); return [x, laneY(u, v), z]; }), d = (p, q) => Math.hypot(p[0] - q[0], p[2] - q[2]); return d(like[0], r[0]) <= d(like[0], r[2]) ? r : r.reverse(); };
  const road = (R, join) => {
    if (!R?.left?.length) return 0;
    const rows = [], lineL = [], lineR = [], e = join ? plan.edgeLine || 0 : 0;
    for (let i = 0; i < Math.min(R.left.length, R.right.length); i++) {
      const l = toXZ(R.left[i]), r = toXZ(R.right[i]), m = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2], u = uOf(m);
      if (join && u > Math.min(U0, runA) + 0.01 && u < Math.max(U1, runB) - 0.01 && Math.abs(vOf(m)) < 40) continue;   // (the lane itself: the surfaces above)
      rows.push([l, m, r].map(([x, z]) => [x, roadY(x, z), z]));
      if (e) { const w = Math.hypot(r[0] - l[0], r[1] - l[1]) || 1, d = [(r[0] - l[0]) / w, (r[1] - l[1]) / w], P = (o) => { const x = l[0] + d[0] * o, z = l[1] + d[1] * o; return [x, roadY(x, z) + 0.008, z]; }; lineL.push([P(0.05), P(0.05 + e)]); lineR.push([P(w - 0.05 - e), P(w - 0.05)]); }
    }
    const n = rows.length;
    if (n && join === "end") rows.push(laneRow(U0, rows[n - 1])); else if (n && join === "start") rows.unshift(laneRow(U1, rows[0]));
    if (rows.length > 1) { strip(rows); quadRun(white, lineL); quadRun(white, lineR); }
    return n;
  };
  const nIn = road(plan.entry, "end"), nOut = road(plan.exit, "start");
  let nMore = 0; for (const R of plan.tarmac || []) nMore += road(R, null);
  // ---- the lane's paint: along the door line, at its surveyed distance from the doors – not where a garage's front stands in it
  // (a line is left out where a front stands within 0.4 m of it; a band a metre wide or more begins at the front)
  for (const [v0, v1, colour, ua = null, ub = null] of plan.lane.bands || []) {
    const A0 = ua == null ? U0 : ua * k, B0 = ub == null ? U1 : ub * k, K = Math.max(1, Math.round((B0 - A0) / 5)), wide = v1 - v0 >= 1, lift = colour === "concrete" ? 0.005 : 0.008, pts = []; let gap = true;
    for (let i = 0; i <= K; i++) {
      const u = A0 + ((B0 - A0) * i) / K, f = frontV(u), lo = wide ? Math.max(v0, f + 0.05) : v0;
      if (wide ? lo > v1 - 0.3 : v0 < f + 0.4) { gap = true; continue; }
      const p = [lo, v1].map((v) => { const [x, z] = at(u, v); return [x, laneY(u, v) + lift, z]; }); if (gap) p.gap = true; gap = false; pts.push(p);
    }
    quadRun(coat(colour), pts);
  }
  for (const [uc, v0, v1, w, colour] of plan.lane.cross || []) {
    const pts = []; for (let i = 0; i <= 4; i++) { const v = v0 + ((v1 - v0) * i) / 4; pts.push([uc * k - w / 2, uc * k + w / 2].map((u) => { const [x, z] = at(u, v); return [x, laneY(u, v) + 0.009, z]; })); }
    pts[0].gap = true; quadRun(coat(colour || "white"), pts);
  }
  // ---- painted lines: along their points, a point every 3 m or less; broken ones in pieces
  for (const ln of plan.lines || []) {
    const P = ln.pts.map(toXZ), cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = cum[cum.length - 1], hw = (ln.width || 0.15) / 2; if (!(total > 0)) continue;
    const pointAt = (s) => { let i = 1; while (i < P.length - 1 && cum[i] < s) i++; const f = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), l = cum[i] - cum[i - 1] || 1, d = [(P[i][0] - P[i - 1][0]) / l, (P[i][1] - P[i - 1][1]) / l], c = [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f]; return [-1, 1].map((q) => { const x = c[0] - d[1] * hw * q, z = c[1] + d[0] * hw * q; return [x, paintAt(x, z, 0.008, !!ln.onTrack), z]; }); };
    const piece = (s0, s1, out) => { const stops = [s0, ...cum.filter((c) => c > s0 + 0.01 && c < s1 - 0.01), s1], pts = []; for (let i = 0; i < stops.length; i++) { if (i) { const m = Math.ceil((stops[i] - stops[i - 1]) / 3); for (let j = 1; j < m; j++) pts.push(pointAt(stops[i - 1] + ((stops[i] - stops[i - 1]) * j) / m)); } pts.push(pointAt(stops[i])); } pts[0].gap = true; quadRun(out, pts); };
    const out = coat(ln.colour || "white");
    if (ln.dash) { const per = ln.dash[0] + ln.dash[1]; for (let s = 0; s < total - 0.05; s += per) piece(s, Math.min(total, s + ln.dash[0]), out); } else piece(0, total, out);
  }
  // ---- painted fields in stripes: the field cut into its stripes (each a convex piece), every piece a fan
  for (const h of plan.hatch || []) {
    const poly = h.poly.map(toXZ).map((p) => [uOf(p) / k, vOf(p) / k]), cOf = (p) => h.c[0] * p[0] + h.c[1] * p[1], cs = poly.map(cOf), lo = Math.min(...cs), hi = Math.max(...cs);
    const clip = (pg, c0, keepAbove) => { const o = []; for (let i = 0; i < pg.length; i++) { const p = pg[i], q = pg[(i + 1) % pg.length], cp = cOf(p) - c0, cq = cOf(q) - c0, ip = keepAbove ? cp >= 0 : cp <= 0, iq = keepAbove ? cq >= 0 : cq <= 0; if (ip) o.push(p); if (ip !== iq) { const f = cp / (cp - cq); o.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]); } } return o; };
    const bands = []; for (let b = Math.floor(lo / h.period) * h.period; b < hi; b += h.period) { let c = 0; for (const [f, t2, colour] of [...h.stripes].sort((p, q) => p[0] - q[0])) { if (f > c) bands.push([b + c, b + f, h.rest]); bands.push([b + f, b + t2, colour]); c = t2; } if (c < h.period) bands.push([b + c, b + h.period, h.rest]); }
    for (const [c0, c1, colour] of bands) {
      if (!colour || c1 <= lo || c0 >= hi) continue;
      const pg = clip(clip(poly, c0, true), c1, false); if (pg.length < 3) continue;
      const out = coat(colour), v0 = out.pos.length / 3;
      for (const [u, v] of pg) { const [x, z] = at(u * k, v * k); out.pos.push(x, paintAt(x, z, 0.007), z); }
      for (let i = 1; i < pg.length - 1; i++) out.idx.push(v0, v0 + i, v0 + i + 1);
    }
  }
  return { tarmac: T, skirt, paint, white, red: paint.red, info: { lane: +L.toFixed(1), ends: [+U0.toFixed(1), +U1.toFixed(1)], run: [+runA.toFixed(1), +runB.toFixed(1)], entry: nIn, exit: nOut, more: nMore, fronts: [+Math.min(...S.map((s) => s.v)).toFixed(2), +Math.max(...S.map((s) => s.v)).toFixed(2)] } };
}

// Is (x, z) on a surveyed entry or exit road, `inset` metres or more inside its edges? A mapped barrier standing there is
// a mapping error – as on the track's own tarmac (scenery.js: the barriers' final cut).
export function onPitRoads(plan, toXZ) {
  const quads = []; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const R of [plan.entry, plan.exit, ...(plan.tarmac || [])]) {
    if (!R?.left?.length) continue;
    const n = Math.min(R.left.length, R.right.length), A = R.left.slice(0, n).map(toXZ), B = R.right.slice(0, n).map(toXZ);
    for (let i = 1; i < n; i++) { const q = [A[i - 1], B[i - 1], B[i], A[i]]; quads.push(q); for (const [x, z] of q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } }
  }
  const dSeg = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * k, z - a[1] - dz * k); };
  const inside = (x, z, q) => { let s = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]); if (Math.abs(c) < 1e-9) continue; if (s && Math.sign(c) !== s) return false; s = Math.sign(c); } return true; };
  return (x, z, inset = 0) => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return false;
    for (const q of quads) if (inside(x, z, q)) return dSeg(x, z, q[0], q[3]) >= inset && dSeg(x, z, q[1], q[2]) >= inset;
    return false;
  };
}
