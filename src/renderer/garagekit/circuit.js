// The kit in a circuit's garages (v0.49) – for the lead's merge into map3d.js: one call that builds the interiors of the
// teams' bays from the garage helper's zones (garages.js garageZones), at a detail level per zone, and checks every car
// spot against what it placed (garagecheck.js checkCar – the same test Map3D.garageCheck runs on the team layer).
//   zones: garageZones(G, teams); G: its facilities.js garages (for the bays' structure in the check)
//   opts: { lib (createKitLibrary – one per world, freed with it), colourOf(team) → "#rrggbb", season, shareTeam,
//           lodOf(zone) → 0 | 1 | 2 | null (null: not built – far or unused bays), signs: true }
// → { group (every bay; add to the world, disposeGroup with it), bays: [{ zone, group, plan }], report: [{ team, slot,
//     kind, num, lod, items, dropped, hits (kit boxes inside the car's box – should be none), headroom }] }
// Not wired here: map3d.js would also switch off the team layer's own simple equipment in the bays the kit fills (both
// would draw), and light only the bay the pit camera looks into (lights.js mode "key", no second shadow).
import * as THREE from "../vendor/three.module.js";
import { buildBayInterior } from "./bay.js";
import { teamMaterials } from "./materials.js";
import { teamGarageStyle } from "./style.js";
import { planBoxes, normZone } from "./layout.js";
import { carBox, checkCar } from "../garagecheck.js";
import { CAR_ENVELOPE } from "../carbounds.js";

export function buildTeamBays(zones, G, opts = {}) {
  const { lib } = opts; if (!lib) throw new Error("buildTeamBays: opts.lib required");
  const group = new THREE.Group(); group.name = "garageKit";
  const bays = [], report = [], styles = new Map(), tms = new Map();
  for (const z of zones || []) {
    if (z.kind === "box" || normZone(z).error) continue;
    const lod = opts.lodOf ? opts.lodOf(z) : 1;
    if (lod == null) continue;
    const team = z.team || "-";
    if (!styles.has(team)) styles.set(team, teamGarageStyle(team, opts.colourOf?.(team) || "#8a9096", { season: opts.season ?? null }));
    const signs = opts.signs !== false && lod < 2 && z.kind !== "bay";
    // (one set of the team's materials for all its bays – opts.shareTeam: the caller may merge them per material)
    let tm = null;
    if (opts.shareTeam) { const k = team + (signs ? "|s" : ""); tm = tms.get(k) || tms.set(k, teamMaterials(lib, styles.get(team), { signs: signs ? [{ slot: "sign", text: styles.get(team).name }] : [], wall: false })).get(k); }
    const g = buildBayInterior(z, styles.get(team), { lib, lod, signs, tm });
    const plan = g.userData.plan, s = G?.slots?.[z.slot];
    let hits = [], headroom = null;
    if (z.kind === "car" && z.carSpot && s) {
      const r = checkCar(s, carBox(z.w || 0, z.carSpot.d, 0, CAR_ENVELOPE, "out"), planBoxes(plan, z));
      hits = r.hits.filter((h) => h.with.startsWith("kit")); headroom = plan.overhead ? +(plan.overhead.y0 - CAR_ENVELOPE.height).toFixed(2) : null;
    }
    group.add(g); bays.push({ zone: z, group: g, plan });
    report.push({ team: z.team, slot: z.slot, kind: z.kind, num: z.num ?? null, lod, items: plan.items.map((i) => i.kind), dropped: plan.dropped.map((d) => `${d.kind}: ${d.why}`), hits, headroom, stats: g.userData.stats });
  }
  return { group, bays, report };
}
