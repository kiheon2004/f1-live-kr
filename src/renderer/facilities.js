// Circuit facilities – pit buildings, paddock buildings, control towers, grandstands – modelled after the real ones
// where the map data alone draws them as a pile of blocks.
//
// Each facility is a registry entry (FACILITIES): where it is (circuit, years), which map buildings it stands for,
// and how it is made – a model file (GLB, self-contained, in src/data/models, read through the main process) or a
// builder here that turns the facility's own map data (footprint, part heights, roof shapes) plus published facts
// (dimensions, number of garages, materials seen in photos) into a model. The real building's map records are
// hidden only once its model stands; if a model can't be loaded or built, the map's own buildings stay.
//
//   status "trial"     – built only while the "정밀 시설 모델" setting is on; off, the map's buildings come back
//   status "permanent" – verified against the real building (see `checked`): always built; a failure leaves the
//                        map's buildings as the fallback
//
// buildFacilities() returns the same contract as landmarks.js ({ group, skip, restyle, keepOut, spots }), and
// combine() joins the two, so buildingsMesh, the trees and the grandstands handle facilities like landmarks.
import * as THREE from "./vendor/three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { disposeGroup } from "./dispose.js";
import { entryAt } from "./venues.js";
import { pathFrame, garageLine, garageRun, genericOutline, fitLine, rayRing, GENERIC, PICK } from "./pitlane.js";

// ---------- registry ----------
export const FACILITIES = [
  {
    id: "suzuka-pit-building", name: "鈴鹿サーキット ピットビル (Paddock Grandstand)", kind: "pit-building",
    venue: [46], loc: ["Suzuka"], years: [2009, null],
    status: "trial",
    // OSM's outline (one footprint, its height only guessed: 8 m)
    replaces: { names: /^ピットビル$/ },
    builder: "pitBuilding",
    params: {
      // three floors above ground (Takenaka): garages, then two floors of balcony seating under a large thin roof;
      // ~16.5 m to the roof is read off photos (garage floor ~5.6 m, two seating floors ~4.4 m, the roof) – an estimate
      height: 16.5, garagePitch: 9,
      balconies: [{ y: 6.8, depth: 2.4 }, { y: 11.4, depth: 1.2 }],
      plate: 0.9, overhang: { pit: 8, paddock: 1.5, end: 3 }, columns: { spacing: 12, size: 0.45, from: 5.6 },
      // the silver capsule at the upstream (final-chicane) end: the rounded white end in aerial imagery (Esri World
      // Imagery, z17), and at the near end in photo 2, taken from the hill there looking down the straight with the
      // pit building on its right; its size read off the photos – an estimate
      pod: { end: "upstream", length: 46, y0: 4, y1: 13.5, width: 0.7, out: 6 },
      facade: { pit: "pitStand", paddock: "paddockPanels" },
      roofTop: "#d6d8d8", fascia: "fasciaWhite",
    },
    sources: [
      "Takenaka Corporation, Suzuka Circuit Paddock Grandstand (2009): steel frame, three floors above ground, 40,687 m², 350 m long; pits on the ground floor, spectator seating on the 2nd and 3rd; the building, its balconies and large roof follow the straight's 2.8 % fall",
      "Photos (Wikimedia Commons, CC BY-SA 4.0): 'Suzuka Circuit Pit Building' (Tokumeigakarinoaoshima); 'Suzukacircuit main-straight' (Wata0929)",
      "Aerial imagery (Esri World Imagery) for the capsule's end – looked at for checking only, nothing of it is shipped",
    ],
    // compared with the real building: three floors (Takenaka) for the map's guessed 8 m; the ground along it falls
    // 9.7 m (published: 2.8 % over 350 m ≈ 9.8 m); balconies, the thin canopy and the capsule at the upstream end as
    // in the photos and aerial imagery. The 16.5 m height and the capsule's size are read off photos (estimates), so
    // it stays a trial: the "정밀 시설" setting turns it off and the map's building comes back
    checked: "2026-10-08: trial (estimated height)",
    // what the model's numbers rest on (registry test): published / confirmed, read off photos, from the map, inferred
    evidence: {
      confirmed: ["three floors above ground, 40,687 m², 350 m long; pits on the ground floor, seating on the 2nd and 3rd (Takenaka, 2009)", "the straight's 2.8 % fall"],
      photo: ["~16.5 m to the roof (estimate)", "the silver capsule at the upstream end: its size (estimate; photo 2, aerial imagery checked only)"],
      map: ["the footprint (OSM's outline; its 8 m height only guessed)"],
      inferred: [],
    },
  },
  {
    id: "imola-box", name: "Autodromo Enzo e Dino Ferrari – corpo box", kind: "pit-building",
    venue: [6], loc: ["Imola"], years: [2007, null],
    status: "trial",
    // the map's "Box" record by the pits (238 × 18 m; 3.2 m – one level's worth, not a measured height)
    replaces: { names: /^Box$/, near: [44.344357, 11.717614], within: 40 },
    builder: "pitBuilding",
    params: {
      // confirmed: 32 modular garages of 100 m² facing paddock 1 and the straight, ~250 m together; their roof is a
      // terrace (for 5,500 people) – xzonextreme 2009, Tesori d'Italia 2019; the roof terrace and a canopy along
      // the paddock side, red garage doors under a red / white band – photo 2018.
      // estimated (photo): ~6.2 m to the terrace, the canopies' depth
      garages: 32, height: 6.2, roofRail: 1.1,
      balconies: [{ y: 5.0, depth: 4.5, side: "paddock", rail: false, thick: 0.4 }, { y: 5.0, depth: 2.5, rail: false, thick: 0.4 }],
      plate: 0.5, overhang: { pit: 0.3, paddock: 0.3, end: 0.3 },
      facade: { pit: "imolaBox", paddock: "imolaBox" }, roofTop: "#8e9196", fascia: "fasciaWhite",
    },
    sources: [
      "https://xzonextreme.altervista.org/2009/06/circuiti-imola/ – 'I 32 nuovi box, autorimesse modulari di 100 mq ciascuna', ~250 m; the Terrazza roofs the boxes; Direzione Gara on 3 levels",
      "https://www.tesoriditaliamagazine.it/2019/02/autodromo-enzo-e-dino-ferrari-di-imola/ – 32 box (previously 18); Tilke, completed September 2007",
      "https://www.ilrestodelcarlino.it/imola/cronaca/autodromo-nuova-terrazza-dxaop99a (23.10.2024) – a building planned on the box roof terrace, first lot 2026",
      "Photo: 'Paddock Autodromo Imola' (Danysan1, Wikimedia Commons, CC BY-SA 3.0, 2018)",
    ],
    checked: "2026-10-09: trial (height estimated from a photo; a building on the terrace is planned from 2026)",
    evidence: {
      confirmed: ["32 modular garages of 100 m², ~250 m (2009, 2019 articles)", "a roof terrace over the garages"],
      photo: ["~6.2 m to the terrace, the canopies' depth (2018 photo, CC BY-SA 3.0)"],
      map: ["the footprint: the map's 'Box' record (238 × 18 m)"],
      inferred: [],
    },
  },
  {
    id: "red-bull-ring-pits", name: "Red Bull Ring – Boxengebäude", kind: "pit-building",
    venue: [19], loc: ["Spielberg"], years: [2011, null],
    status: "trial",
    // the map's two "Box" records along the pit lane (190 m + 117 m; heights only guessed: 8 m)
    replaces: { names: /^Box$/, near: [47.220102, 14.764084], within: 220 },
    builder: "pitBuilding",
    params: {
      // confirmed: an elongated building, workshop boxes on the ground floor with lift gates to the pit lane, VIP
      // lounges on the 1st floor with inclined glazing and loggias, aluminium-glass facade – nextroom (Domenig &
      // Wallner, 2011); 30 boxes – auto motor und sport (2025); the glazing leaning out over the pit lane under a
      // white roof – photo 2021. estimated (photo): ~12 m to the roof, the glazing's lean, the roof's overhang.
      // (the 2025/26 extension east and the 2027 roof terrace aren't in the map data: not modelled)
      garages: 30, height: 12, slopedGlass: { y0: 5.8, y1: 10.4, lean: 2.6 },
      plate: 0.9, overhang: { pit: 5, paddock: 1.5, end: 2 },
      facade: { pit: "pitGlass", paddock: "paddockPanels" }, roofTop: "#e9ecee", fascia: "fasciaWhite",
    },
    sources: [
      "https://www.nextroom.at/building.php?id=36412&inc=datenblatt – Domenig & Wallner 2011: Werkstättengebäude, EG boxes with lift gates to the pit lane, 1. OG VIP lounges with inclined glazing and loggias; aluminium-glass facade",
      "https://www.auto-motor-und-sport.de/formel-1/umbau-red-bull-ring-spielberg-boxengebaeude/ – 30 boxes (2025), extension east",
      "Photo: '2021 4 Hours of Red Bull Ring – Paddock' (United Autosports, Wikimedia Commons, CC BY-SA 2.0)",
    ],
    checked: "2026-10-09: trial (height and the glazing's lean estimated from a photo)",
    evidence: {
      confirmed: ["workshop boxes with lift gates, VIP lounges with inclined glazing (nextroom, 2011)", "30 boxes (auto motor und sport, 2025)"],
      photo: ["~12 m to the roof, the glazing's lean, the roof's overhang (2021 photo, CC BY-SA 2.0)"],
      map: ["the footprint: the map's two 'Box' records"],
      inferred: [],
    },
  },
  {
    id: "yas-marina-pits", name: "Yas Marina Circuit – pit building", kind: "pit-building",
    venue: [70], loc: ["Yas Island", "Yas Marina", "Abu Dhabi"], years: [2009, null],
    status: "trial",
    // the map's pit building record (375 × 30 m, no name; height only guessed: 8 m) – the one at this point
    replaces: { near: [24.469576, 54.605952], within: 20 },
    builder: "pitBuilding",
    params: {
      // confirmed: 40 air-conditioned garages (published). seen in photos: garages under a canopy on the pit lane,
      // glazed floors above (2021); from the paddock, two floors of windows in light stone-coloured walls behind the
      // domed team buildings, a row of white peaked fabric canopies on the roof (2010).
      // estimated (photos): ~14 m to the roof, the canopies' size and spacing
      garages: 40, height: 14,
      balconies: [{ y: 5.4, depth: 4, rail: false, thick: 0.5 }],
      tents: { spacing: 25, peak: 9, lift: 1.5, cover: 0.9 },
      plate: 0.7, overhang: { pit: 1, paddock: 1, end: 1 },
      facade: { pit: "pitGlass", paddock: "yasPaddock" }, roofTop: "#c9c6bf", fascia: "fasciaWhite",
    },
    sources: [
      "https://www.formula1.com/en/racing/2017/United_Arab_Emirates.html – 'the state-of-the-art pit building boasts 40 air-conditioned garages'",
      "https://en.wikipedia.org/wiki/Yas_Marina_Circuit – 'a team building behind the pit building, Media Center, Dragster Track and VIP Tower'",
      "https://www.cebarco.com.bh/project/yas-marina-circuit/ – pit building and paddock club, Tilke & Partners, December 2008",
      "Photos (for comparison only): Alexander Yee, Flickr 4531657341 / 4532275554 (CC BY-NC-ND 2.0, 2010); 'Asian Le Mans Series 2021 – Race 4 – Pitlane exit before start' (Wikimedia Commons, CC BY-SA 2.0)",
    ],
    checked: "2026-10-09: trial (height and the roof canopies estimated from photos)",
    evidence: {
      confirmed: ["40 air-conditioned garages (formula1.com)"],
      photo: ["~14 m to the roof; the roof canopies' size and spacing (2010 photos CC BY-NC-ND 2.0, compared only; 2021 photo CC BY-SA 2.0)"],
      map: ["the footprint: the pit building record at its position (375 × 30 m)"],
      inferred: [],
    },
  },
  {
    id: "hungaroring-paddock-2025", name: "Hungaroring – paddock building (2025)", kind: "pit-building",
    venue: [4], loc: ["Budapest"], years: [2025, null],
    status: "trial",
    // the map's record of it: OSM's unnamed outline along the pit lane (311.5 × 18.3 m; no height – guessed), at
    // this point; the new main grandstand across the track is a separate record (kept).
    // Why 311.5 m against the published "more than 340 m" (checked 2026-10-14 in the OSM history of way 123905481): the
    // outline is the old pit building's – its nodes were last moved in 2014–2017; it was tagged demolished in Nov 2024 and
    // re-tagged a building in July 2025 without being redrawn. The new building's own footprint isn't mapped, and which end
    // it grew at isn't published either, so the old outline is used as it is (not stretched to 340 m).
    replaces: { near: [47.57949, 19.24803], within: 10 },
    builder: "pitBuilding",
    params: {
      // confirmed (DVM Group): a five-storey paddock building, more than 340 m long, 25,000 m², pit boxes and
      // technical garages; handed over June 2025 (in use from the 2025 Hungarian GP, 1–3 August 2025).
      // seen in the builder's photos (Hungaroring Media, © DVM – compared only): garages on the ground floor with
      // numbered doors, a glazed floor over them under a continuous white cantilevered band, a glazed upper floor set
      // back, a white flat roof (solar panels, red rooftop boxes).
      // estimated (photos): ~19 m to the roof (five storeys: ~5.5 m garages + ~3.4 m floors), the band's depth, the
      // garages' pitch (~10 m) – the number of garages isn't published
      height: 19, garagePitch: 10,
      balconies: [{ y: 5.6, depth: 3.2 }, { y: 12.4, depth: 1.4 }],
      plate: 0.9, overhang: { pit: 2.5, paddock: 1.2, end: 1.5 },
      facade: { pit: "pitGlass", paddock: "paddockPanels" }, roofTop: "#dfe2e4", fascia: "fasciaWhite",
    },
    sources: [
      "https://www.dvmgroup.com/en/references/projects/hungaroring – 'Hungaroring Renewal (Paddock and Main Grandstand)': paddock 25,000 m², more than 340 m, five storeys, pit boxes and technical garages; handed over June 2025; DVM Group Kft. and S.A.M.O. Építésziroda Kft.",
      "Photos on that page ('Photos: Hungaroring Media', © 2026 DVM, all rights reserved) – compared only, nothing shipped",
    ],
    checked: "2026-10-14: trial (length, floors and use published; height, band depth and garage pitch estimated from photos)",
    evidence: {
      confirmed: ["five storeys, more than 340 m, 25,000 m², pit boxes and technical garages; handed over June 2025 (DVM Group)"],
      photo: ["~19 m to the roof; the cantilevered white band over the garages; the set-back upper floor; the garages' pitch ~10 m (estimates)"],
      map: ["the footprint: OSM's outline along the pit lane (311.5 × 18.3 m; its height not tagged)"],
      inferred: [],
    },
  },
  {
    id: "lusail-pit-building", name: "Lusail International Circuit – pit building (2023)", kind: "pit-building",
    venue: [150], loc: ["Lusail"], years: [2023, null],
    status: "trial",
    // the map's record of it: the unnamed building along the pit lane (404.5 m – the published 402 m), at this point
    replaces: { near: [25.48872, 51.45058], within: 15 },
    builder: "pitBuilding",
    params: {
      // confirmed (Tilke; Guinness World Records): 402 m along the pit lane – the longest pit building –, fifty team
      // garages on the ground floor, the race control tower at its southern end, the Paddock Club at its northern end;
      // rebuilt 2022–23 for the 2023 Qatar GP. seen in Tilke's photos (compared only, no licence stated): light stone
      // cladding, white ceiling edges over the ground and first floors as horizontal bands, glass balustrades.
      // estimated (photos): ~15 m to the roof (ground floor and two upper levels), the bands' depth
      garages: 50, height: 15,
      balconies: [{ y: 6.0, depth: 2.4, rail: true }, { y: 10.6, depth: 1.6, rail: true }],
      plate: 0.8, overhang: { pit: 1.6, paddock: 1.6, end: 1 },
      facade: { pit: "pitGlass", paddock: "yasPaddock" }, roofTop: "#d9d2c4", fascia: "fasciaWhite",
    },
    sources: [
      "https://tilke.de/portfolio/lusail-race-track-qatar/ – pit building 402 m (Guinness World Record), fifty team garages on the ground floor, race control tower at the southern end, Paddock Club at the northern end; white ceiling edges as horizontal bands; 2022–2023",
      "https://marhaba.qa/lusail-international-circuit-sets-new-guinness-world-records-for-longest-motorsport-pitlane-building/ – 402.1 m",
      "Photos on Tilke's page – compared only (no licence stated), nothing shipped",
    ],
    checked: "2026-10-14: trial (length and garages published; height and bands estimated from photos)",
    evidence: {
      confirmed: ["402 m long, fifty garages on the ground floor, race control tower at the south end (Tilke; Guinness)"],
      photo: ["~15 m to the roof; white bands over the ground and first floors; stone cladding (estimates)"],
      map: ["the footprint: the map's unnamed building along the pit lane (404.5 m)"],
      inferred: [],
    },
  },
  {
    id: "silverstone-wing", name: "Silverstone Wing", kind: "pit-building",
    venue: [2], loc: ["Silverstone"], years: [2011, null],
    status: "permanent",
    // the map's records of the building: Overture's 21 building parts named so (from OSM), with their heights
    replaces: { names: /^Silverstone Wing$/i },
    builder: "pitBuilding",
    params: {
      garages: 41,                    // pit garages along the pit lane (BRDC, Motor Sport)
      // the "blade" at the Club end: a 16.5 m fin jutting out at 40°, its tip 30 m above the ground, from four
      // 2.18 m deep trusses (New Steel Construction, 2011)
      blade: { length: 16.5, angle: 40, tip: 30, depth: 2.18 },
      plate: 1.6, overhang: { pit: 3, paddock: 2, end: 2 },
      facade: { pit: "pitGlass", paddock: "paddockPanels" },
      roofTop: "#565b61", fascia: "fasciaRedWhite",
      // the pit wall at the track's edge (data); a raised walkway behind it with a railing to the pit lane and the
      // catch fence over the wall (photo 2011, geograph 2542970); the walkway ~8 m wide (the mapped footway band,
      // 26.6–36 m out from the Wing's axis). Heights estimated from the photo.
      pitWall: { height: 1.1, thick: 0.5, fence: 3.0, walk: 8, deck: 1.0 },
      // the paddock at the 2026 British GP (photos 3 July 2026): black awnings along the garages' back, two-storey
      // hospitality units across the paddock street. Their sizes and spacing are estimates; which team's is where isn't
      // known, so they're neutral.
      paddock: { years: [2026, 2026], margin: 6, street: 20, awning: { d: 4, h: 3.6 }, unit: { w: 18, d: 14, h: 8.5, gap: 4 },
        basis: { kind: "photo estimate", seen: "2026-07-03", event: "British Grand Prix 2026", licence: "CC BY-SA 4.0",
          sources: ["Flickr 55383877828", "Flickr 55382810457", "Flickr 55382810427"],
          uncertain: "the units' size, spacing and count are read off photos (±30 %); which team's unit is where isn't known (drawn neutral); no team's vehicles, motorhomes, equipment or logos are reproduced" } },
    },
    sources: [
      "New Steel Construction, 'Wing heralds new era for famous circuit' (2011): 390 m long; blade 16.5 m at 40°, tip 30 m; 41 garages",
      "Motor Sport magazine, August 2011, 'A Wing-win situation': 390 m long, 30 m high",
      "WikiArquitectura, Silverstone Wing: garages on the ground floor, hospitality and media on the two floors above, glass facade",
      "Photos (Wikimedia Commons): Ian S, geograph 4590068 (CC BY-SA 2.0); Supermac1961 (CC BY 2.0); 'Endurance Legends in front of the Wing' (CC BY 2.0)",
      "Pit wall: 'View of the new pits at Silverstone from the pit wall' (geograph 2542970, CC BY-SA 2.0, 2011)",
      "Paddock 2026: 'F1 Paddock at British Grand Prix 2026 Silverstone' (Flickr 55383877828, 55382810457, 55382810427 via Wikimedia Commons, CC BY-SA 4.0, 3 July 2026)",
    ],
    // compared with the real building: the footprint and heights are the map's (21 parts, 377 × 29 m against a
    // published 390 m); the blade's 30 m tip, 40° and 16.5 m from the published figures; the roofline (blade, a low
    // stretch, the peak about 40 % along, the long low end) and the facades match photos 1–3 from the same viewpoints;
    // the map's parts drew it as blocks of different heights with office windows and a black wedge
    checked: "2026-10-08: permanent",
    evidence: {
      confirmed: ["390 m long, 30 m high; the blade 16.5 m at 40°, its tip 30 m; 41 garages (New Steel Construction 2011, Motor Sport 2011)"],
      photo: ["the roofline and facades (photos 1–3)", "the pit wall's and walkway's heights (2011 photo)", "the 2026 paddock: awnings and hospitality units – sizes, spacing and count (3 July 2026 photos)"],
      map: ["the footprint and the parts' heights (the map's 21 'Silverstone Wing' parts)", "the walkway's width (the mapped footway band)"],
      inferred: ["the pit wall's line, from the track's measured edge in the session's position data"],
    },
  },
];

// Model files (GLB) are read through the main process (geo:model) from src/data/models. Conventions for an entry
// with `model`: { file: "name.glb", anchor: [lat, lon] (where the model's origin stands), heading: degrees from north
// (clockwise) that the model's +Z axis points to, units: "m" | "cm" | "mm" | "ft", scale: 1, origin: "base-centre"
// (the origin is on the ground at the model's centre) | "bbox" (place the bounding box's bottom centre at the anchor),
// ground: "anchor" (terrain height at the anchor) | "lowest" (lowest terrain under the footprint), lift: metres }.
// The model is never tilted to the terrain. `replaces` then also needs `within` (metres around the anchor) so only
// map buildings at the model's spot go.
const UNITS = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048 };

// ---------- small geometry helpers ----------
const polyArea = (pts) => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return a / 2; };
export function inPoly(x, y, pts) { let r = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r; } return r; }
const centroid = (pts) => { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; };
const ring = (b, gf) => { let pts = b.pts.map(gf.xz); if (pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1); return pts; };

// Principal axes of a point set: { c, u, v } (u along the longest spread)
export function axes(pts) {
  const [cx, cz] = centroid(pts);
  let sxx = 0, szz = 0, sxz = 0;
  for (const [x, z] of pts) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
  const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), u = [Math.cos(th), Math.sin(th)];
  return { c: [cx, cz], u, v: [-u[1], u[0]] };
}
// The span [vmin, vmax] of polygon `uv` (points in axis coordinates) across the line u = const, or null
function slice(uv, u) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0, j = uv.length - 1; i < uv.length; j = i++) {
    const [ua, va] = uv[j], [ub, vb] = uv[i];
    if ((ua <= u && ub >= u) || (ub <= u && ua >= u)) {
      if (ua === ub) { lo = Math.min(lo, va, vb); hi = Math.max(hi, va, vb); continue; }
      const v = va + ((u - ua) / (ub - ua)) * (vb - va); lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

// Roof profile along a building from its parts' heights. Each stretch of the top layer is flat at its height, or –
// for a skillion part (roof height rh) – a slope between h − rh and h; which way each slope runs isn't in the data,
// so the directions are chosen to make the roofline as continuous as possible (fewest metres of steps), as on a
// folded-plate roof. runs: [{ u0, u1, h, rh }] sorted along u; start: the height the profile must meet at u0 of the
// first run (or null). Returns points [[u, y]] (with ±3 m blends at the remaining steps).
export function foldedProfile(runs, start = null) {
  if (!runs.length) return [];
  const opts = runs.map((r) => (r.rh > 0.3 ? [[r.h - r.rh, r.h], [r.h, r.h - r.rh]] : [[r.h, r.h]]));
  // DP over the choices: cost = sum of |end of one − start of the next|
  let best = opts[0].map((o) => ({ cost: start == null ? 0 : Math.abs(o[0] - start), path: [o] }));
  for (let i = 1; i < runs.length; i++) {
    best = opts[i].map((o) => {
      let m = null;
      for (const b of best) { const c = b.cost + Math.abs(b.path[b.path.length - 1][1] - o[0]); if (!m || c < m.cost - 1e-9) m = { cost: c, path: [...b.path, o] }; }
      return m;
    });
  }
  const path = best.reduce((a, b) => (b.cost < a.cost - 1e-9 ? b : a)).path;
  const out = [];
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i], [a, b] = path[i], len = r.u1 - r.u0;
    const prevEnd = i > 0 ? path[i - 1][1] : start;   // (the first run blends into the start height too)
    const blendL = prevEnd != null && Math.abs(prevEnd - a) > 0.05 ? Math.min(3, len * 0.25) : 0;
    const blendR = i < runs.length - 1 && Math.abs(path[i + 1][0] - b) > 0.05 ? Math.min(3, len * 0.25) : 0;
    const y = (u) => a + ((u - r.u0) / (len || 1)) * (b - a);
    if (blendL) out.push([r.u0, i > 0 ? (a + prevEnd) / 2 : prevEnd]); else out.push([r.u0, a]);
    if (blendL) out.push([r.u0 + blendL, y(r.u0 + blendL)]);
    if (blendR) out.push([r.u1 - blendR, y(r.u1 - blendR)]);
    if (blendR) out.push([r.u1, (b + path[i + 1][0]) / 2]); else out.push([r.u1, b]);
  }
  // drop duplicates at shared boundaries
  return out.filter((p, i) => i === 0 || Math.abs(p[0] - out[i - 1][0]) > 1e-6 || Math.abs(p[1] - out[i - 1][1]) > 1e-6);
}
const lerpProfile = (prof, u) => {
  if (!prof.length) return 0;
  if (u <= prof[0][0]) return prof[0][1];
  for (let i = 1; i < prof.length; i++) if (u <= prof[i][0]) { const [ua, ya] = prof[i - 1], [ub, yb] = prof[i]; return ub === ua ? yb : ya + ((u - ua) / (ub - ua)) * (yb - ya); }
  return prof[prof.length - 1][1];
};

// Collects flat faces per material into one BufferGeometry each.
class Faces {
  constructor() { this.m = new Map(); }
  arr(key) { if (!this.m.has(key)) this.m.set(key, { pos: [], uv: [] }); return this.m.get(key); }
  // a planar polygon (3+ points, [x, y, z]) with uvs; `out`: a direction the face must face (front side)
  poly(key, vs, uvs, out) {
    const A = this.arr(key);
    const e1 = new THREE.Vector3().subVectors(new THREE.Vector3(...vs[1]), new THREE.Vector3(...vs[0]));
    const e2 = new THREE.Vector3().subVectors(new THREE.Vector3(...vs[2]), new THREE.Vector3(...vs[0]));
    const n = new THREE.Vector3().crossVectors(e1, e2);
    let order = vs.map((_, i) => i);
    if (out && n.x * out[0] + n.y * out[1] + n.z * out[2] < 0) order = order.reverse();
    for (let i = 1; i < order.length - 1; i++) for (const k of [order[0], order[i], order[i + 1]]) { A.pos.push(...vs[k]); A.uv.push(...(uvs ? uvs[k] : [0, 0])); }
  }
  meshes(materials) {
    const out = [];
    for (const [key, A] of this.m) {
      if (!A.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(A.pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(A.uv, 2));
      g.computeVertexNormals(); g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, materials(key)); mesh.name = key; mesh.castShadow = true; mesh.receiveShadow = true;
      out.push(mesh);
    }
    return out;
  }
}

// ---------- textures (drawn once, shared by every model that uses them) ----------
// Each facade texture is one bay wide and 30 m high (v = height above the ground / 30): bands sit at real heights.
const TEX = new Map();
const H_TEX = 30;
function canvasTex(key, w, h, draw, opts = {}) {
  if (TEX.has(key)) return TEX.get(key);
  if (typeof document === "undefined") return null;   // (tests: no canvas; materials go without maps)
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.userData.shared = true;
  TEX.set(key, t);
  return t;
}
// y in metres (from the ground) → canvas row
const yPx = (h, y) => h - (y / H_TEX) * h;
function glassBand(g, w, h, y0, y1, col, mull, transom, lit) {
  const a = yPx(h, y1), b = yPx(h, y0);
  const gr = g.createLinearGradient(0, a, 0, b); gr.addColorStop(0, lit ? "#ffe2a8" : col[0]); gr.addColorStop(1, lit ? "#f3c780" : col[1]);
  g.fillStyle = gr; g.fillRect(0, a, w, b - a);
  if (lit) return;
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(0, a, w, (b - a) * 0.18);   // sky reflection
  g.fillStyle = "#2a2f33";
  for (let x = 0; x <= w; x += mull) g.fillRect(x - 2, a, 4, b - a);
  if (transom) for (let y = y0 + transom; y < y1 - 0.2; y += transom) g.fillRect(0, yPx(h, y) - 2, w, 4);
}
const FACADES = {
  // pit-lane side: garages, a glazed hospitality band, the media / hospitality floors fully glazed above
  pitGlass: { width: (p) => p.pitch, draw(g, w, h, lit) {
    g.fillStyle = lit ? "#000" : "#a9afb5"; g.fillRect(0, 0, w, h);
    if (!lit) {
      // garage: a dark frame and a roller door (horizontal slats), name board above it
      g.fillStyle = "#2f3438"; g.fillRect(0, yPx(h, 4.8), w, yPx(h, 0) - yPx(h, 4.8));
      g.fillStyle = "#6d747b"; g.fillRect(w * 0.08, yPx(h, 4.2), w * 0.84, yPx(h, 0) - yPx(h, 4.2));
      g.fillStyle = "rgba(0,0,0,0.18)"; for (let y = 0.2; y < 4.2; y += 0.25) g.fillRect(w * 0.08, yPx(h, y), w * 0.84, 2);
      g.fillStyle = "#e9eaeb"; g.fillRect(w * 0.2, yPx(h, 4.65), w * 0.6, yPx(h, 4.3) - yPx(h, 4.65));
      g.fillStyle = "#c9cdd1"; g.fillRect(0, yPx(h, 6.2), w, yPx(h, 4.8) - yPx(h, 6.2));
      g.fillStyle = "#f2f3f3"; g.fillRect(0, yPx(h, 6.2), w, 5);
    }
    glassBand(g, w, h, 6.2, 9.4, ["#3d5966", "#22343e"], w / 4, 0, lit);
    if (!lit) { g.fillStyle = "#b7bcc1"; g.fillRect(0, yPx(h, 11.5), w, yPx(h, 9.4) - yPx(h, 11.5)); }
    glassBand(g, w, h, 11.5, H_TEX, ["#5a7b8a", "#2c4552"], w / 6, 3.75, lit);
  } },
  // paddock side: garage doors, light grey rainscreen panels with a strip of windows on the first floor (photo of
  // the low end), the upper floors glazed where the building rises above them (photo from the paddock side)
  paddockPanels: { width: () => 6, draw(g, w, h, lit) {
    g.fillStyle = lit ? "#000" : "#cfd3d6"; g.fillRect(0, 0, w, h);
    if (!lit) {
      g.fillStyle = "#3a3f44"; g.fillRect(0, yPx(h, 4.8), w, yPx(h, 0) - yPx(h, 4.8));
      g.fillStyle = "#5d646a"; g.fillRect(w * 0.06, yPx(h, 4.3), w * 0.88, yPx(h, 0) - yPx(h, 4.3));
      g.fillStyle = "rgba(0,0,0,0.16)"; for (let y = 0.2; y < 4.3; y += 0.25) g.fillRect(w * 0.06, yPx(h, y), w * 0.88, 2);
      // panel joints: 1.5 m wide, 3 m high panels
      g.fillStyle = "rgba(60,64,68,0.45)";
      for (let x = 0; x <= w; x += w / 4) g.fillRect(x - 1, 0, 3, yPx(h, 4.8));
      for (let y = 4.8; y < H_TEX; y += 3) g.fillRect(0, yPx(h, y) - 1, w, 3);
    }
    glassBand(g, w, h, 7.4, 9.6, ["#4f6b79", "#253743"], w / 4, 0, lit);
    glassBand(g, w, h, 11.8, H_TEX, ["#5a7b8a", "#2c4552"], w / 4, 3.75, lit);
  } },
};
// Suzuka: garages, a sponsor band, two floors of open balcony seating (seat rows in the shade, a glass balustrade)
FACADES.pitStand = { width: (p) => p.garagePitch || 9, draw(g, w, h, lit) {
  g.fillStyle = lit ? "#000" : "#e9ebec"; g.fillRect(0, 0, w, h);
  const band = (y0, y1, col) => { g.fillStyle = col; g.fillRect(0, yPx(h, y1), w, yPx(h, y0) - yPx(h, y1)); };
  if (!lit) {
    band(0, 5.6, "#d9dcdf"); g.fillStyle = "#7d858c"; g.fillRect(w * 0.07, yPx(h, 4.6), w * 0.86, yPx(h, 0) - yPx(h, 4.6));
    g.fillStyle = "rgba(0,0,0,0.16)"; for (let y = 0.2; y < 4.6; y += 0.25) g.fillRect(w * 0.07, yPx(h, y), w * 0.86, 2);
    // the sponsor boards over the garages
    band(5.6, 6.8, "#f6f6f4"); const cols = ["#c8102e", "#1d4f91", "#f2f2f2", "#0b7a3e", "#e8b100"];
    g.fillStyle = cols[Math.floor((w * 7.3) % cols.length)]; g.fillRect(w * 0.12, yPx(h, 6.6), w * 0.5, yPx(h, 5.8) - yPx(h, 6.6));
  }
  // the two seating floors: dark under their ceilings, seat rows rising to the back, people's colours here and there
  for (const [y0, y1] of [[6.8, 10.6], [11.4, 15.6]]) {
    if (lit) { band(y0 + 1.6, y1 - 0.4, "#ffe2b0"); continue; }
    band(y0, y1, "#3a4046");
    g.fillStyle = "#6a737b"; for (let y = y0 + 0.5; y < y1 - 0.6; y += 0.45) g.fillRect(0, yPx(h, y), w, 3);
    band(y1 - 0.3, y1, "#f2f3f3");
  }
  if (!lit) band(10.6, 11.4, "#f2f3f3");
} };
// Imola: dark grey garage block, red doors, a red / white band above them (photo, 2018)
FACADES.imolaBox = { width: (p) => p.garagePitch || 6.6, draw(g, w, h, lit) {
  g.fillStyle = lit ? "#000" : "#4b5056"; g.fillRect(0, 0, w, h);
  if (lit) return;
  const band = (y0, y1, col) => { g.fillStyle = col; g.fillRect(0, yPx(h, y1), w, yPx(h, y0) - yPx(h, y1)); };
  g.fillStyle = "#c8102e"; g.fillRect(w * 0.14, yPx(h, 4.2), w * 0.72, yPx(h, 0) - yPx(h, 4.2));
  g.fillStyle = "rgba(0,0,0,0.18)"; for (let y = 0.2; y < 4.2; y += 0.3) g.fillRect(w * 0.14, yPx(h, y), w * 0.72, 2);
  band(4.6, 5.5, "#2f3337"); band(4.85, 5.0, "#c8102e"); band(5.05, 5.2, "#f2f2f2");
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(0, yPx(h, 4.6), 3, yPx(h, 0) - yPx(h, 4.6));
} };
// Yas Marina, paddock side: light stone-coloured walls with rows of windows (photo, 2010)
FACADES.yasPaddock = { width: () => 7.5, draw(g, w, h, lit) {
  g.fillStyle = lit ? "#000" : "#ddd2bd"; g.fillRect(0, 0, w, h);
  if (!lit) { g.fillStyle = "#5a5f63"; g.fillRect(w * 0.1, yPx(h, 4.4), w * 0.8, yPx(h, 0) - yPx(h, 4.4)); }
  for (const [y0, y1] of [[6.6, 8.6], [10.6, 12.6]]) glassBand(g, w, h, y0, y1, ["#4c6170", "#2a3842"], w / 2, 0, lit);
  if (!lit) { g.fillStyle = "#ddd2bd"; g.fillRect(0, yPx(h, 12.6), w * 0.08, yPx(h, 6.6) - yPx(h, 12.6)); g.fillRect(w * 0.92, yPx(h, 12.6), w * 0.08, yPx(h, 6.6) - yPx(h, 12.6)); }
} };
// height of the garage band (openings, their frames) in each pit-side facade texture
const GARAGE_TOP = { pitGlass: 4.8, pitStand: 5.6, imolaBox: 4.6 };
function facadeTex(name, p, lit) {
  const F = FACADES[name];
  return canvasTex(`${name}:${lit ? "lit" : "day"}`, 256, 1024, (g, w, h) => F.draw(g, w, h, lit));
}
// the roof's edge: a white band, a red line under it, the dark soffit edge (as in the photos)
const fasciaTex = () => canvasTex("fasciaRedWhite", 8, 64, (g, w, h) => { g.fillStyle = "#f5f5f3"; g.fillRect(0, 0, w, h); g.fillStyle = "#c8102e"; g.fillRect(0, h * 0.72, w, h * 0.13); g.fillStyle = "#3a3e42"; g.fillRect(0, h * 0.85, w, h * 0.15); });
const fasciaWhiteTex = () => canvasTex("fasciaWhite", 8, 64, (g, w, h) => { g.fillStyle = "#f6f6f4"; g.fillRect(0, 0, w, h); g.fillStyle = "#c9cccd"; g.fillRect(0, h * 0.85, w, h * 0.15); });
const roofTex = () => canvasTex("roofSeams", 64, 64, (g, w, h) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(0,0,0,0.10)"; for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 1, h); });
const checkerTex = () => canvasTex("darkChecker", 128, 128, (g, w, h) => {
  g.fillStyle = "#2b2f33"; g.fillRect(0, 0, w, h); g.fillStyle = "#3c4247";
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if ((i + j) % 2) g.fillRect((i * w) / 4, (j * h) / 4, w / 4, h / 4);
});
const panelTex = () => canvasTex("greyPanels", 128, 128, (g, w, h) => {
  g.fillStyle = "#d4d7da"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(60,64,68,0.35)";
  for (let x = 0; x < w; x += w / 2) g.fillRect(x, 0, 2, h); for (let y = 0; y < h; y += h / 4) g.fillRect(0, y, w, 2);
});

// emissive strength by day / night (switched in map3d.applyLighting, as for the landmarks)
const lit = (m, day, night) => { m.userData.nightE = [day, night]; m.emissiveIntensity = day; return m; };

// ---------- builders ----------
// A long pit building from its map parts. From the data: the footprint along its length, the ground it stands on
// (followed along its length: a long building on a slope steps with the ground), the parts' heights as the roofline
// (folded where they're skillions, see foldedProfile), which side the track is on and which way the cars run. From
// the facility's published facts (p): the garages, a height where the data only guessed one (p.height, metres to
// the roof), the facades seen in photos, the roof plate and how far it overhangs, balconies, columns, a blade at
// the high end (Silverstone), a pod at one end (Suzuka).
// ctx: { parts (building records), gf, groundAt, toTrack, alongTrack }. Returns { meshes, footprint, top, info }.
function pitBuilding(ctx, p) {
  const recs = ctx.parts.map((b) => ({ b, pts: ring(b, ctx.gf) })).filter((r) => r.pts.length >= 3);
  if (!recs.length) throw new Error("no parts");
  const all = recs.flatMap((r) => r.pts);
  const ax = axes(all);
  let u = ax.u, v = ax.v;
  const toUV = ([x, z]) => [(x - ax.c[0]) * u[0] + (z - ax.c[1]) * u[1], (x - ax.c[0]) * v[0] + (z - ax.c[1]) * v[1]];
  // heights: the data's, except where it only guessed one and the facility's height is known
  // (a height worked out from a number of floors – levels × 3.2 m in scene.js – is no measured height either)
  const fromLevels = (b) => b.lv != null && Math.abs(b.h - b.lv * 3.2) < 0.06;
  let parts = recs.map((r) => {
    const guessed = (!!r.b.est || fromLevels(r.b)) && p.height;
    return { ...r, uv: r.pts.map(toUV), min: r.b.min || 0, h: guessed ? p.height : r.b.h, rh: !guessed && r.b.roof && r.b.roof !== "flat" ? r.b.rh || 0 : 0, guessed };
  });
  const flip = () => { u = [-u[0], -u[1]]; v = [-v[0], -v[1]]; parts = parts.map((q) => ({ ...q, uv: q.uv.map(([a, b]) => [-a, -b]) })); };
  const meanU = (sel) => { const xs = sel.flatMap((q) => q.uv.map((w) => w[0])); return xs.reduce((a, b) => a + b, 0) / xs.length; };
  // u runs the way the cars do (the upstream end at u < 0); with a blade, the blade's end (the tallest parts) first
  const [dx, dz] = ctx.alongTrack ? ctx.alongTrack(ax.c[0], ax.c[1]) : [u[0], u[1]];
  if (p.blade) { const top = Math.max(...parts.map((q) => q.h)); if (meanU(parts.filter((q) => q.h >= top - 0.5)) > meanU(parts)) flip(); }
  else if (dx * u[0] + dz * u[1] < 0) flip();
  const upstreamFirst = dx * u[0] + dz * u[1] >= 0;
  const [tx, tz] = ctx.toTrack(ax.c[0], ax.c[1]);
  const vTrack = tx * v[0] + tz * v[1] >= 0 ? 1 : -1;
  const P = (uu, vv) => [ax.c[0] + u[0] * uu + v[0] * vv, ax.c[1] + u[1] * uu + v[1] * vv];
  const uMin = Math.min(...parts.flatMap((q) => q.uv.map((w) => w[0]))), uMax = Math.max(...parts.flatMap((q) => q.uv.map((w) => w[0])));

  // blade zone: parts standing well above the ground at the high end (the data's blade block)
  const bl = p.blade;
  let uRoot = uMin, uTip = uMin, rootH = null;
  const bladeParts = bl ? parts.filter((q) => q.min >= 14 && Math.max(...q.uv.map((w) => w[0])) < uMin + (uMax - uMin) * 0.15) : [];
  if (bl) {
    const run = bl.length * Math.cos((bl.angle * Math.PI) / 180), rise = bl.length * Math.sin((bl.angle * Math.PI) / 180);
    uRoot = bladeParts.length ? Math.max(...bladeParts.flatMap((q) => q.uv.map((w) => w[0]))) : uMin + run;
    uTip = uRoot - run; rootH = bl.tip - rise;
  }
  const inBlade = (q) => bladeParts.includes(q);
  // a dark slab: a part coloured (near) black at the high end (the data's dark element under the blade)
  const darkParts = bl ? parts.filter((q) => !inBlade(q) && /^#[0-2][0-9a-f][0-2][0-9a-f][0-2][0-9a-f]$/i.test(q.b.colour || "") && Math.max(...q.uv.map((w) => w[0])) < uRoot + 1) : [];

  // stations along the building: the footprint's span, the ground, the base block's height and the top layer
  const STEP = 1.5, stations = [];
  for (let s = uMin; s <= uMax + 1e-6; s += STEP) {
    const spans = [], tops = [];
    let baseTop = 0;
    for (const q of parts) {
      if (darkParts.includes(q)) continue;
      const sp = slice(q.uv, s); if (!sp) continue;
      if (q.min < 1) { spans.push(sp); baseTop = Math.max(baseTop, inBlade(q) ? 0 : q.h); }
      if (!inBlade(q)) tops.push(q);
    }
    if (!spans.length) continue;
    spans.sort((a, b) => a[0] - b[0]);
    let cur = [...spans[0]], best = [...cur];
    for (const sp of spans.slice(1)) { if (sp[0] <= cur[1] + 1) cur[1] = Math.max(cur[1], sp[1]); else cur = [...sp]; if (cur[1] - cur[0] > best[1] - best[0]) best = [...cur]; }
    const t = tops.reduce((a, q) => (!a || q.h > a.h ? q : a), null);
    // the ground: the lowest of a few points across the span
    let g = Infinity; for (let k = 0; k <= 4; k++) { const [x, z] = P(s, best[0] + ((best[1] - best[0]) * k) / 4); g = Math.min(g, ctx.groundAt(x, z)); }
    stations.push({ u: s, v0: best[0], v1: best[1], g, baseTop: baseTop || (t ? t.h : 0), top: t ? t.h : baseTop, rh: t ? t.rh : 0 });
  }
  if (stations.length < 4) throw new Error("no footprint");
  if (!stations.every((st) => Number.isFinite(st.g))) throw new Error("no ground");
  // the ground along the building, smoothed over ±12 m (a floor steps gently, it doesn't follow every bump)
  const gs = stations.map((st, i) => { let a = 0, n = 0; for (const o of stations) if (Math.abs(o.u - st.u) <= 12) { a += o.g; n++; } return a / n; });
  const baseAt = (uu) => {
    if (uu <= stations[0].u) return gs[0];
    for (let i = 1; i < stations.length; i++) if (uu <= stations[i].u) { const f = (uu - stations[i - 1].u) / (stations[i].u - stations[i - 1].u); return gs[i - 1] + (gs[i] - gs[i - 1]) * f; }
    return gs[gs.length - 1];
  };
  // the top layer as runs (beyond the blade root), then the folded roofline
  const runs = [];
  for (const st of stations) {
    if (st.u < uRoot) continue;
    const last = runs[runs.length - 1];
    if (last && Math.abs(last.h - st.top) < 0.05 && Math.abs(last.rh - st.rh) < 0.05) last.u1 = st.u;
    else runs.push({ u0: st.u, u1: st.u, h: st.top, rh: st.rh });
  }
  for (let i = 0; i < runs.length - 1; i++) runs[i].u1 = runs[i + 1].u0;
  const merged = runs.filter((r) => r.u1 - r.u0 >= 3 || runs.length === 1);
  const prof = foldedProfile(merged, rootH);
  if (bl && prof.length) prof.unshift([uRoot, rootH]);
  const roofAt = (uu) => baseAt(uu) + lerpProfile(prof, uu);

  const F = new Faces(), t = p.plate, ov = p.overhang;
  // side +1: the pit-lane (track) side, −1: the paddock side
  const sideV = (st, side) => ((side > 0) === (vTrack > 0) ? st.v1 : st.v0);
  const outV = (side) => [v[0] * side * vTrack, 0, v[1] * side * vTrack];
  const pitch = p.garages ? Math.max(5, (uMax - Math.max(uMin, uRoot)) / p.garages) : p.garagePitch || 9;
  const facadeKey = (side) => "facade:" + (side > 0 ? p.facade.pit : p.facade.paddock);
  const facW = (side) => (side > 0 ? pitch : FACADES[p.facade.paddock].width(p));
  const wallTop = (st) => (st.u >= uRoot ? roofAt(st.u) - t : baseAt(st.u) + st.baseTop);
  // The garages: a run along the pit side, one bay every `gp` m (the published count over the building's length,
  // else the facility's pitch). Each has a real opening – pillars, a lintel, the rolled-up shutter – and an inside as
  // deep as can be seen from the pit lane (floor, walls, ceiling and its lights), its floor level with the pit lane
  // (ctx.surfaceAt: the tarmac's height there), so a car stopping at its box stands on the same surface.
  // (p.garageRange: two scene points – the run's ends where the teams' boxes are, genericPitSpec –: garages only between
  // them; the rest of a long outline is building without openings (Sakhir: a 400 m outline curving away from the lane))
  let gStart = Math.max(uMin, uRoot), gEnd = uMax;
  if (p.garageRange) { const [ra, rb] = p.garageRange.map(([x, z]) => toUV([x, z])[0]); gStart = Math.max(gStart, Math.min(ra, rb)); gEnd = Math.min(gEnd, Math.max(ra, rb)); if (gEnd - gStart < 20) { gStart = Math.max(uMin, uRoot); gEnd = uMax; } }
  const G = p.garageBay !== false ? (GARAGE_TOP[p.facade.pit] || 4.8) : 0;
  const nGar = Math.max(1, Math.round((gEnd - gStart) / pitch)), gp = (gEnd - gStart) / nGar;
  const stationAt = (uu) => { let i = 0; while (i + 1 < stations.length && stations[i + 1].u < uu) i++; const a = stations[i], b = stations[Math.min(i + 1, stations.length - 1)]; const f = b.u > a.u ? Math.max(0, Math.min(1, (uu - a.u) / (b.u - a.u))) : 0; return [a, b, f]; };
  const frontV = (uu) => { const [a, b, f] = stationAt(uu); return sideV(a, 1) + (sideV(b, 1) - sideV(a, 1)) * f; };
  const floorAt = (uu) => { const g = baseAt(uu); if (!ctx.surfaceAt) return g; const [x, z] = P(uu, frontV(uu) + vTrack * 1.5); const sy = ctx.surfaceAt(x, z); return Number.isFinite(sy) ? Math.max(g, sy) : g; };
  const inGarages = (uu) => G > 0 && uu >= gStart - 1e-6 && uu <= gEnd + 1e-6;
  // walls along both long sides, station to station
  for (let i = 0; i + 1 < stations.length; i++) {
    const a = stations[i], b = stations[i + 1], ga = baseAt(a.u), gb = baseAt(b.u);
    for (const side of [1, -1]) {
      const [x0, z0] = P(a.u, sideV(a, side)), [x1, z1] = P(b.u, sideV(b, side)), ya = wallTop(a), yb = wallTop(b);
      const block = a.u < uRoot, key = block ? "panels" : facadeKey(side), w = block ? 6 : facW(side), u0 = (a.u - uRoot) / w, u1 = (b.u - uRoot) / w, H = block ? 6 : H_TEX;
      if (side > 0 && !block && inGarages(a.u) && inGarages(b.u)) {
        // over the garages: the facade from the top of their openings (its texture's bands kept at their heights over
        // the garage floor); under the floor, the plinth
        const fa = floorAt(a.u), fb = floorAt(b.u);
        F.poly(key, [[x0, fa + G, z0], [x1, fb + G, z1], [x1, yb, z1], [x0, ya, z0]], [[u0, G / H], [u1, G / H], [u1, (yb - fb) / H], [u0, (ya - fa) / H]], outV(side));
        if (fa > ga + 0.02 || fb > gb + 0.02) F.poly("panels", [[x0, ga, z0], [x1, gb, z1], [x1, fb, z1], [x0, fa, z0]], null, outV(side));
        continue;
      }
      F.poly(key, [[x0, ga, z0], [x1, gb, z1], [x1, yb, z1], [x0, ya, z0]], [[u0, 0], [u1, 0], [u1, (yb - gb) / H], [u0, (ya - ga) / H]], outV(side));
    }
  }
  // end walls
  for (const [st, dir] of [[stations[0], -1], [stations[stations.length - 1], 1]]) {
    const g = baseAt(st.u), y = wallTop(st), [x0, z0] = P(st.u, st.v0), [x1, z1] = P(st.u, st.v1), L = st.v1 - st.v0;
    F.poly("panels", [[x0, g, z0], [x1, g, z1], [x1, y, z1], [x0, y, z0]], [[0, 0], [L / 6, 0], [L / 6, (y - g) / 6], [0, (y - g) / 6]], [u[0] * dir, 0, u[1] * dir]);
  }
  // flat roof of the base block under / beyond the blade
  for (let i = 0; i + 1 < stations.length; i++) {
    const a = stations[i], b = stations[i + 1];
    if (a.u >= uRoot) break;
    const y = baseAt(a.u) + a.baseTop + 0.02;
    F.poly("roofFlat", [P(a.u, a.v0), P(b.u, b.v0), P(b.u, b.v1), P(a.u, a.v1)].map(([x, z]) => [x, y, z]), null, [0, 1, 0]);
  }
  // roof plate: top, underside, fascia round its edge (overhanging the facades)
  const roofSt = stations.filter((st) => st.u >= uRoot);
  const ext = (st, side) => sideV(st, side) + side * vTrack * (side > 0 ? ov.pit : ov.paddock);
  const R = roofSt.map((st) => ({ u: st.u, a: ext(st, 1), b: ext(st, -1) }));
  R.push({ u: roofSt[roofSt.length - 1].u + ov.end, a: R[R.length - 1].a, b: R[R.length - 1].b });
  if (!bl && ov.end) R.unshift({ u: roofSt[0].u - ov.end, a: R[0].a, b: R[0].b });
  const roofY = (uu) => roofAt(Math.max(uMin, Math.min(uMax, uu)));
  for (let i = 0; i + 1 < R.length; i++) {
    const a = R[i], b = R[i + 1], ya = roofY(a.u), yb = roofY(b.u);
    const A1 = P(a.u, a.a), A2 = P(a.u, a.b), B1 = P(b.u, b.a), B2 = P(b.u, b.b);
    F.poly("roofTop", [[A1[0], ya, A1[1]], [B1[0], yb, B1[1]], [B2[0], yb, B2[1]], [A2[0], ya, A2[1]]], [[0, a.u / 8], [0, b.u / 8], [4, b.u / 8], [4, a.u / 8]], [0, 1, 0]);
    F.poly("underside", [[A1[0], ya - t, A1[1]], [B1[0], yb - t, B1[1]], [B2[0], yb - t, B2[1]], [A2[0], ya - t, A2[1]]], null, [0, -1, 0]);
    for (const [Pa, Pb, side] of [[A1, B1, 1], [A2, B2, -1]]) {
      const len = Math.hypot(Pb[0] - Pa[0], Pb[1] - Pa[1]);
      F.poly("fascia", [[Pa[0], ya - t, Pa[1]], [Pb[0], yb - t, Pb[1]], [Pb[0], yb, Pb[1]], [Pa[0], ya, Pa[1]]], [[0, 0], [len, 0], [len, 1], [0, 1]], outV(side));
    }
  }
  for (const [e, dir] of [[R[R.length - 1], 1], ...(bl ? [] : [[R[0], -1]])]) {   // the ends' fascia
    const y = roofY(e.u), A = P(e.u, e.a), B = P(e.u, e.b);
    F.poly("fascia", [[A[0], y - t, A[1]], [B[0], y - t, B[1]], [B[0], y, B[1]], [A[0], y, A[1]]], [[0, 0], [1, 0], [1, 1], [0, 1]], [u[0] * dir, 0, u[1] * dir]);
  }
  // balconies / canopies: slabs projecting from a facade (side "pit", the default, or "paddock"), with a balustrade
  // along their edge unless rail: false (a canopy)
  for (const bc of p.balconies || []) {
    const side = bc.side === "paddock" ? -1 : 1, sv = side * vTrack;
    for (let i = 0; i + 1 < roofSt.length; i++) {
      const a = roofSt[i], b = roofSt[i + 1], ya = baseAt(a.u) + bc.y, yb = baseAt(b.u) + bc.y;
      const va = sideV(a, side), vb = sideV(b, side), fa = va + sv * bc.depth, fb = vb + sv * bc.depth;
      const A0 = P(a.u, va), B0 = P(b.u, vb), A1 = P(a.u, fa), B1 = P(b.u, fb), th = bc.thick || 0.35;
      F.poly("slab", [[A0[0], ya, A0[1]], [B0[0], yb, B0[1]], [B1[0], yb, B1[1]], [A1[0], ya, A1[1]]], null, [0, 1, 0]);
      F.poly("slab", [[A0[0], ya - th, A0[1]], [B0[0], yb - th, B0[1]], [B1[0], yb - th, B1[1]], [A1[0], ya - th, A1[1]]], null, [0, -1, 0]);
      if (bc.rail === false) F.poly("slab", [[A1[0], ya - th, A1[1]], [B1[0], yb - th, B1[1]], [B1[0], yb, B1[1]], [A1[0], ya, A1[1]]], null, outV(side));
      else F.poly("rail", [[A1[0], ya - th, A1[1]], [B1[0], yb - th, B1[1]], [B1[0], yb + 1.1, B1[1]], [A1[0], ya + 1.1, A1[1]]], [[0, 0], [1, 0], [1, 1], [0, 1]], outV(side));
    }
  }
  // a railing round the roof's edge (a roof terrace)
  if (p.roofRail) {
    for (let i = 0; i + 1 < roofSt.length; i++) {
      const a = roofSt[i], b = roofSt[i + 1];
      for (const side of [1, -1]) {
        const ex = side > 0 ? ov.pit : ov.paddock, A = P(a.u, sideV(a, side) + side * vTrack * ex), B = P(b.u, sideV(b, side) + side * vTrack * ex), ya = roofAt(a.u), yb = roofAt(b.u);
        F.poly("rail", [[A[0], ya, A[1]], [B[0], yb, B[1]], [B[0], yb + p.roofRail, B[1]], [A[0], ya + p.roofRail, A[1]]], [[0, 0], [1, 0], [1, 1], [0, 1]], outV(side));
      }
    }
  }
  // glazing leaning out over the pit lane (Red Bull Ring: the VIP lounges' inclined glass), y0 → y1, `lean` m out
  if (p.slopedGlass) {
    const sg = p.slopedGlass;
    for (let i = 0; i + 1 < roofSt.length; i++) {
      const a = roofSt[i], b = roofSt[i + 1], va = sideV(a, 1), vb = sideV(b, 1);
      const A0 = P(a.u, va), B0 = P(b.u, vb), A1 = P(a.u, va + vTrack * sg.lean), B1 = P(b.u, vb + vTrack * sg.lean);
      const ga = baseAt(a.u), gb = baseAt(b.u), u0 = (a.u - uRoot) / pitch, u1 = (b.u - uRoot) / pitch;
      F.poly("slopedGlass", [[A0[0], ga + sg.y0, A0[1]], [B0[0], gb + sg.y0, B0[1]], [B1[0], gb + sg.y1, B1[1]], [A1[0], ga + sg.y1, A1[1]]], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], [v[0] * vTrack, 0.6, v[1] * vTrack]);
      F.poly("slab", [[A1[0], ga + sg.y1, A1[1]], [B1[0], gb + sg.y1, B1[1]], [B0[0], gb + sg.y1, B0[1]], [A0[0], ga + sg.y1, A0[1]]], null, [0, 1, 0]);
    }
  }
  // peaked fabric canopies along the roof (Yas Marina): four-sided tents, one every `spacing` m
  if (p.tents) {
    const tn = p.tents, run = (roofSt[roofSt.length - 1].u - roofSt[0].u), n = Math.max(1, Math.round(run / tn.spacing)), w = run / n;
    for (let k = 0; k < n; k++) {
      const uc = roofSt[0].u + w * (k + 0.5), st = roofSt.reduce((a, s2) => (Math.abs(s2.u - uc) < Math.abs(a.u - uc) ? s2 : a));
      const v0 = st.v0 + (st.v1 - st.v0) * (1 - (tn.cover || 0.9)) / 2, v1 = st.v1 - (st.v1 - st.v0) * (1 - (tn.cover || 0.9)) / 2, vc = (v0 + v1) / 2;
      const y0 = roofAt(uc) + (tn.lift || 2.5), apex = [...P(uc, vc)], top = [apex[0], y0 + tn.peak, apex[1]];
      const C = [P(uc - w / 2 + 0.3, v0), P(uc + w / 2 - 0.3, v0), P(uc + w / 2 - 0.3, v1), P(uc - w / 2 + 0.3, v1)].map(([x, z]) => [x, y0, z]);
      for (let e = 0; e < 4; e++) { const A = C[e], B = C[(e + 1) % 4], mx = (A[0] + B[0]) / 2 - apex[0], mz = (A[2] + B[2]) / 2 - apex[1]; F.poly("tent", [A, B, top], [[0, 0], [1, 0], [0.5, 1]], [mx, 1, mz]); }   // (fabric: double-sided)
      // its mast
      const [mx0, mz0] = P(uc, vc); F.poly("column", [[mx0 - 0.2, roofAt(uc), mz0], [mx0 + 0.2, roofAt(uc), mz0], [mx0 + 0.2, top[1], mz0], [mx0 - 0.2, top[1], mz0]], null, [u[0], 0, u[1]]);
    }
  }
  // columns under the roof's pit-side edge (from the top of the garages up)
  if (p.columns) {
    const c = p.columns, r = (c.size || 0.45) / 2;
    for (let uu = Math.max(uMin, uRoot) + c.spacing / 2; uu < uMax; uu += c.spacing) {
      const st = roofSt.reduce((a, s2) => (Math.abs(s2.u - uu) < Math.abs(a.u - uu) ? s2 : a));
      const vv = sideV(st, 1) + vTrack * (ov.pit - 0.8), y0 = baseAt(uu) + (c.from || 0), y1 = roofAt(uu) - t;
      for (const [du, dv] of [[-r, -r], [r, -r], [r, r], [-r, r]].map((q, k, A) => [q, A[(k + 1) % 4]])) {
        const [ax0, az0] = P(uu + du[0], vv + du[1]), [ax1, az1] = P(uu + dv[0], vv + dv[1]);
        F.poly("column", [[ax0, y0, az0], [ax1, y0, az1], [ax1, y1, az1], [ax0, y1, az0]], null, [u[0] * (du[0] + dv[0]) + v[0] * (du[1] + dv[1]), 0, u[1] * (du[0] + dv[0]) + v[1] * (du[1] + dv[1])]);
      }
    }
  }
  // the blade: its top rising at the given angle from the roof to the tip; under it, clad down to the base block
  if (bl) {
    const st0 = stations.reduce((a, s2) => (Math.abs(s2.u - uRoot) < Math.abs(a.u - uRoot) ? s2 : a)), lo = st0.v0 - 0.5, hi = st0.v1 + 0.5;
    const g0 = baseAt(uRoot), baseB = g0 + (stations.find((s2) => s2.u >= uTip)?.baseTop || 11.5);
    const yRoot = g0 + rootH, yTip = g0 + bl.tip, d = bl.depth, run = uRoot - uTip;
    const S = (uu, vv, y) => { const [x, z] = P(uu, vv); return [x, y, z]; };
    F.poly("bladeTop", [S(uRoot, lo, yRoot), S(uTip, lo, yTip), S(uTip, hi, yTip), S(uRoot, hi, yRoot)], [[0, 0], [1, 0], [1, 4], [0, 4]], [0, 1, 0]);
    for (const vv of [lo, hi]) {
      const side = vv === lo ? -1 : 1, out = [v[0] * side, 0, v[1] * side];
      F.poly("fascia", [S(uRoot, vv, yRoot - t), S(uTip, vv, yTip - d), S(uTip, vv, yTip), S(uRoot, vv, yRoot)], [[0, 0], [bl.length, 0], [bl.length, 1], [0, 1]], out);
      F.poly("bladeSide", [S(uRoot, vv, baseB), S(uTip, vv, baseB), S(uTip, vv, yTip - d), S(uRoot, vv, yRoot - t)],
        [[run / 6, 0], [0, 0], [0, (yTip - d - baseB) / 6], [run / 6, (yRoot - t - baseB) / 6]], out);
    }
    F.poly("checker", [S(uTip, lo, baseB), S(uTip, hi, baseB), S(uTip, hi, yTip), S(uTip, lo, yTip)], [[0, 0], [(hi - lo) / 6, 0], [(hi - lo) / 6, (yTip - baseB) / 6], [0, (yTip - baseB) / 6]], [-u[0], 0, -u[1]]);
  }
  // the dark slab(s) from the data: a wedge (its roof slopes down away from the blade), checkered cladding
  for (const q of darkParts) {
    const us = q.uv.map((w) => w[0]), vs = q.uv.map((w) => w[1]), u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
    const g = baseAt(u0), yHi = g + q.h, yLo = g + Math.max(q.min + 4, q.h - (q.rh || 0) * 0.5);
    const S = (uu, vv, y) => { const [x, z] = P(uu, vv); return [x, y, z]; };
    const y = (uu) => yLo + ((uu - u0) / (u1 - u0 || 1)) * (yHi - yLo);
    const wall = (pa, pb, ua, ub, out, L) => F.poly("checker", [S(...pa, g), S(...pb, g), S(...pb, y(ub)), S(...pa, y(ua))], [[0, 0], [L / 6, 0], [L / 6, (y(ub) - g) / 6], [0, (y(ua) - g) / 6]], out);
    wall([u0, v0], [u1, v0], u0, u1, [-v[0], 0, -v[1]], u1 - u0); wall([u0, v1], [u1, v1], u0, u1, [v[0], 0, v[1]], u1 - u0);
    wall([u0, v0], [u0, v1], u0, u0, [-u[0], 0, -u[1]], v1 - v0); wall([u1, v0], [u1, v1], u1, u1, [u[0], 0, u[1]], v1 - v0);
    F.poly("roofTop", [S(u0, v0, y(u0)), S(u1, v0, y(u1)), S(u1, v1, y(u1)), S(u0, v1, y(u0))], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0]);
  }
  // the garages themselves: openings in front (with the facade), their insides apart (seen only from close by)
  const FI = new Faces(), slots = [], inward = [-v[0] * vTrack, -v[1] * vTrack], depth = Math.min(p.garageDepth || 9, Math.max(4, Math.min(...stations.map((s2) => s2.v1 - s2.v0)) * 0.45));
  if (G > 0) {
    const fw = 0.5, hO = G - 0.55, ceil = hO + 0.35, out = outV(1), inv = [inward[0], 0, inward[1]];
    const at = (uu, d, y) => { const [x, z] = P(uu, frontV(uu) - vTrack * d); return [x, y, z]; };
    for (let k = 0; k < nGar; k++) {
      const u0 = gStart + k * gp, u1 = u0 + gp, a0 = u0 + fw / 2, a1 = u1 - fw / 2, fl = floorAt((u0 + u1) / 2);
      // front: the pillar at its start (and the last one at the run's end), the lintel over the opening
      for (const [b0, b1] of k === nGar - 1 ? [[u0 - fw / 2, a0], [a1, u1 + fw / 2]] : [[u0 - fw / 2, a0]]) F.poly("garFrame", [at(b0, 0, fl), at(b1, 0, fl), at(b1, 0, fl + G), at(b0, 0, fl + G)], null, out);
      F.poly("garFrame", [at(a0, 0, fl + hO), at(a1, 0, fl + hO), at(a1, 0, fl + G), at(a0, 0, fl + G)], null, out);
      F.poly("garFrame", [at(a0, 0, fl + hO), at(a1, 0, fl + hO), at(a1, 0.6, fl + hO), at(a0, 0.6, fl + hO)], null, [0, -1, 0]);
      // the rolled-up shutter in its box under the lintel
      F.poly("garShutter", [at(a0, 0.6, fl + hO - 0.4), at(a1, 0.6, fl + hO - 0.4), at(a1, 0.6, fl + hO), at(a0, 0.6, fl + hO)], null, out);
      F.poly("garShutter", [at(a0, 0.25, fl + hO - 0.4), at(a1, 0.25, fl + hO - 0.4), at(a1, 0.6, fl + hO - 0.4), at(a0, 0.6, fl + hO - 0.4)], null, [0, -1, 0]);
      // inside: floor, side walls, back wall, ceiling with two light strips
      FI.poly("garFloor", [at(a0, 0, fl + 0.01), at(a1, 0, fl + 0.01), at(a1, depth, fl + 0.01), at(a0, depth, fl + 0.01)], [[0, 0], [1, 0], [1, depth / 3], [0, depth / 3]], [0, 1, 0]);
      FI.poly("garWall", [at(a0, 0, fl), at(a0, depth, fl), at(a0, depth, fl + ceil), at(a0, 0, fl + ceil)], null, [u[0], 0, u[1]]);
      FI.poly("garWall", [at(a1, 0, fl), at(a1, depth, fl), at(a1, depth, fl + ceil), at(a1, 0, fl + ceil)], null, [-u[0], 0, -u[1]]);
      FI.poly("garBack", [at(a0, depth, fl), at(a1, depth, fl), at(a1, depth, fl + ceil), at(a0, depth, fl + ceil)], null, out);
      FI.poly("garCeil", [at(a0, 0.6, fl + ceil), at(a1, 0.6, fl + ceil), at(a1, depth, fl + ceil), at(a0, depth, fl + ceil)], null, [0, -1, 0]);
      // the fittings any F1 garage has, whoever's it is (a team's panels and equipment are the team layer's, garages.js,
      // in front of these): service panels along the back wall and a dark kick panel along the side walls up to
      // 1.2 m, steel beams across the ceiling. No equipment: which garages are in use isn't known
      FI.poly("garPanel", [at(a0, depth - 0.01, fl + 0.15), at(a1, depth - 0.01, fl + 0.15), at(a1, depth - 0.01, fl + 2.6), at(a0, depth - 0.01, fl + 2.6)], [[0, 0], [(a1 - a0) / 1.2, 0], [(a1 - a0) / 1.2, 1], [0, 1]], out);
      for (const [x, n] of [[a0 + 0.01, [u[0], 0, u[1]]], [a1 - 0.01, [-u[0], 0, -u[1]]]]) FI.poly("garKick", [at(x, 0.3, fl), at(x, depth - 0.02, fl), at(x, depth - 0.02, fl + 1.2), at(x, 0.3, fl + 1.2)], null, n);
      for (const d of [depth * 0.35, depth * 0.72]) FI.poly("garBeam", [at(a0, d - 0.15, fl + ceil - 0.02), at(a1, d - 0.15, fl + ceil - 0.02), at(a1, d + 0.15, fl + ceil - 0.02), at(a0, d + 0.15, fl + ceil - 0.02)], null, [0, -1, 0]);
      for (const q of [0.3, 0.7]) { const c0 = a0 + (a1 - a0) * q - 0.25, c1 = c0 + 0.5; FI.poly("garLight", [at(c0, 1.2, fl + ceil - 0.03), at(c1, 1.2, fl + ceil - 0.03), at(c1, depth - 0.8, fl + ceil - 0.03), at(c0, depth - 0.8, fl + ceil - 0.03)], null, [0, -1, 0]); }
      const [fx, fz] = P((u0 + u1) / 2, frontV((u0 + u1) / 2));
      slots.push({ k, u0, u1, uc: (u0 + u1) / 2, floor: fl, front: [fx, fz], along: [u[0], u[1]], inward, width: a1 - a0, height: hO, ceil, depth });
    }
  }
  // The pit wall (p.pitWall): along the garages, where the track's measured edge is (ctx.trackEdge: metres from a
  // point to the edge of the tarmac) – a concrete wall with the catch fence over it on the track side, and behind it a
  // raised walkway with a railing on the pit lane side (the mapped footway band; photo). Stands for the teams on it are
  // added with the teams (garages.js: wallAt).
  let wallAt = null, wallDbg = null, wallFace = null, wallFrom = null;
  const occupancy = [];   // what the wall and the paddock stand on (scene x, z): trees keep off it – it isn't the building replaced
  if (p.pitWall && ctx.trackEdge && G > 0) {
    const pw = p.pitWall, W = [];
    for (let uu = gStart; uu <= gEnd + 1e-6; uu += 3) {
      // out from the garages towards the track until the tarmac's edge – or a wall the map has before it (that is the
      // pit wall: Suzuka's mapped wall stands 2.5 m short of the edge; a second one drawn at the edge had stood behind it)
      let d = 4;
      while (d < 60) { const [x, z] = P(uu, frontV(uu) + vTrack * d); if (ctx.trackEdge(x, z) <= 0.3) break; d += 0.5; }
      if (d >= 60) continue;
      const [x0, z0] = P(uu, frontV(uu)), [x1, z1] = P(uu, frontV(uu) + vTrack), db = ctx.barrierRay ? ctx.barrierRay(x0, z0, x1 - x0, z1 - z0, d) : Infinity;
      W.push(db > 5 && db < d - 0.5 ? { u: uu, d: db - pw.thick / 2, mapped: true, edge: d } : { u: uu, d, edge: d });
    }
    // (mapped along most of the run: the map's wall is the pit wall – none is drawn over it; the lane's model and the
    // teams' stands use it)
    const mappedWall = W.length > 3 && W.filter((w) => w.mapped).length >= W.length * 0.6;
    if (mappedWall) for (const w of W) if (!w.mapped) w.d = NaN;
    if (mappedWall) { const keep = W.filter((w) => Number.isFinite(w.d)); W.length = 0; W.push(...keep); }
    if (W.length > 3) {
      // the wall's line smoothed (a wall is straight where the edge wobbles in the data), as a line across the lane – the
      // building's front plus the distance –, not the distance alone: where the front steps in or out, the wall doesn't
      // (a local straight-line fit, outliers dropped – pitlane.js fitLine: an earlier median with a bend limit dragged the
      // wall 6 m into the lane where the track runs at an angle to the building – Barcelona)
      const vS = fitLine(W.map((w) => [w.u, frontV(w.u) + vTrack * w.d]));
      const ptAt = (i, dd, y) => { const [x, z] = P(W[i].u, vS[i] - vTrack * dd); return [x, floorAt(W[i].u) + y, z]; };
      wallDbg = W.filter((_, i) => i % 8 === 0).map((w, k) => { const i = k * 8; return [Math.round(w.u), w.d, +((vS[i] - frontV(w.u)) * vTrack).toFixed(1)]; });
      for (let i = 0; i + 1 < W.length && !mappedWall; i++) {
        const o = [v[0] * vTrack, 0, v[1] * vTrack], io = [-o[0], 0, -o[2]];
        // wall (track face, top, pit face), fence above it
        F.poly("pitWall", [ptAt(i, 0, 0), ptAt(i + 1, 0, 0), ptAt(i + 1, 0, pw.height), ptAt(i, 0, pw.height)], null, o);
        F.poly("pitWall", [ptAt(i, 0, pw.height), ptAt(i + 1, 0, pw.height), ptAt(i + 1, pw.thick, pw.height), ptAt(i, pw.thick, pw.height)], null, [0, 1, 0]);
        F.poly("fence", [ptAt(i, 0.05, pw.height), ptAt(i + 1, 0.05, pw.height), ptAt(i + 1, 0.05, pw.height + pw.fence), ptAt(i, 0.05, pw.height + pw.fence)], [[W[i].u / 2, 0], [W[i + 1].u / 2, 0], [W[i + 1].u / 2, pw.fence / 2], [W[i].u / 2, pw.fence / 2]], o);
        // the walkway: deck, its edge to the pit lane, the railing
        const w0 = pw.thick, w1 = pw.thick + pw.walk;
        F.poly("walkway", [ptAt(i, w0, pw.deck), ptAt(i + 1, w0, pw.deck), ptAt(i + 1, w1, pw.deck), ptAt(i, w1, pw.deck)], null, [0, 1, 0]);
        F.poly("pitWall", [ptAt(i, w1, 0), ptAt(i + 1, w1, 0), ptAt(i + 1, w1, pw.deck), ptAt(i, w1, pw.deck)], null, io);
        F.poly("rail", [ptAt(i, w1, pw.deck), ptAt(i + 1, w1, pw.deck), ptAt(i + 1, w1, pw.deck + 1.1), ptAt(i, w1, pw.deck + 1.1)], [[0, 0], [1, 0], [1, 1], [0, 1]], io);
      }
      // the walkway's centre at u (for the teams' stands): [x, y, z], facing the pit lane – between two samples, between
      // their points (a team's box is anywhere along the wall, not only every 3 m)
      // (the face to the pit lane: thick + walk in from the track side)
      wallFace = (uu) => {
        let i = 0; while (i + 2 < W.length && W[i + 1].u < uu) i++;
        // (a mapped wall: its own thickness only – no walkway of ours behind it)
        const f = Math.max(0, Math.min(1, (uu - W[i].u) / (W[i + 1].u - W[i].u))), at = (k) => (vS[k] - vTrack * (pw.thick + (mappedWall ? 0 : pw.walk)) - frontV(W[k].u)) * vTrack;
        return at(i) + (at(i + 1) - at(i)) * f;
      };
      wallAt = (uu) => {
        let i = 0; while (i + 2 < W.length && W[i + 1].u < uu) i++;
        // (a mapped wall: the stand behind it, on its track side, where 2.4 m are left before the tarmac – else none)
        if (mappedWall) { const room = Math.min(W[i].edge - W[i].d, W[i + 1].edge - W[i + 1].d); if (!(room >= 2.4)) return null; }
        const back = mappedWall ? -1.3 : pw.thick + pw.walk / 2, deck = mappedWall ? 0 : pw.deck;
        const f = Math.max(0, Math.min(1, (uu - W[i].u) / (W[i + 1].u - W[i].u))), a = ptAt(i, back, deck), b = ptAt(i + 1, back, deck);
        return { p: a.map((x, k) => x + (b[k] - x) * f), out: [-v[0] * vTrack, -v[1] * vTrack], along: [u[0], u[1]] };
      };
      // (what the wall and its walkway stand on)
      if (!mappedWall) { const strip = [...W.map((_, i) => ptAt(i, -0.3, 0)), ...W.map((_, i) => ptAt(i, pw.thick + pw.walk + 0.3, 0)).reverse()].map(([x, , z]) => [x, z]); occupancy.push(strip); }
      wallFrom = mappedWall ? "the map's wall" : p.pitWallFrom || "drawn at the track's edge";
    }
  }
  // The paddock behind the garages (p.paddock, for the years it was seen): awnings along the garages' back and a row
  // of hospitality units across the paddock street – neutral (which team's unit stands where isn't known). Each unit
  // stands level on its own ground (its floor at the highest point under it, a footing down to the lowest – a paddock
  // is rarely flat), not at the pit building's floor. One that would stand in a building of the map that stays, or
  // across a mapped road or path, isn't built (and said so in info): the map's neighbour stays, nothing is hidden to make
  // room for an estimate.
  let paddockInfo = null;
  // (estimated: only with the trial setting on, even on a permanent facility)
  if (p.paddock && ctx.trial !== false && (!p.paddock.years || (ctx.year && ctx.year >= p.paddock.years[0] && ctx.year <= (p.paddock.years[1] ?? 9999)))) {
    const pd = p.paddock, run0 = Math.max(uMin, uRoot) + pd.margin, run1 = uMax - pd.margin;
    const backV = (uu) => { const [a, b, f] = stationAt(uu); return sideV(a, -1) + (sideV(b, -1) - sideV(a, -1)) * f; };
    const XZ = (uu, d) => P(uu, backV(uu) - vTrack * d);
    const PB = (uu, d, y) => { const [x, z] = XZ(uu, d); return [x, baseAt(uu) + y, z]; };
    const back = [-v[0] * vTrack, 0, -v[1] * vTrack], front = [v[0] * vTrack, 0, v[1] * vTrack];
    // the map around it that stays: buildings other than the ones this facility replaces, roads and paths
    const others = (ctx.scene?.buildings || []).filter((b) => !ctx.parts.includes(b)).map((b) => ({ b, pts: ring(b, ctx.gf) })).filter((o) => o.pts.length >= 3);
    const ways = (ctx.scene?.lines || []).filter((l) => l.k === "road" || l.k === "path" || l.k === "rail").map((l) => ({ l, pts: l.pts.map(ctx.gf.xz) }));
    const clash = (poly) => {
      const o = others.find((x) => polysOverlap(poly, x.pts)); if (o) return `building ${o.b.name || o.b.cls || ""}`.trim();
      const w = ways.find((x) => lineThrough(x.pts, poly)); if (w) return `${w.l.sub || w.l.k} way`;
      return null;
    };
    const inset = (a0, a1, e0, e1, m = 0.3) => [XZ(a0 + m, e0 + m), XZ(a1 - m, e0 + m), XZ(a1 - m, e1 - m), XZ(a0 + m, e1 - m)];
    const skipped = [], placed = [];
    // awnings: a sloping canopy on posts, the length of the garages' back, its low edge at least 2.2 m over the ground
    for (let uu = run0; uu < run1 - 1; uu += 6) {
      const u1 = Math.min(run1, uu + 6);
      if (clash(inset(uu, u1, 0.1, pd.awning.d))) { skipped.push({ u: +uu.toFixed(1), what: "awning", why: clash(inset(uu, u1, 0.1, pd.awning.d)) }); continue; }
      const edge = (a) => { const [x, z] = XZ(a, pd.awning.d), y = Math.max(baseAt(a) + pd.awning.h - 0.8, ctx.groundAt(x, z) + 2.2); return [x, y, z]; };
      const e0 = edge(uu), e1 = edge(u1), lip = (q) => [q[0], q[1] - 0.6, q[2]];
      F.poly("awning", [PB(uu, 0, pd.awning.h), PB(u1, 0, pd.awning.h), e1, e0], null, [0, 1, 0]);
      F.poly("awning", [e0, e1, lip(e1), lip(e0)], null, back);
      occupancy.push([XZ(uu, 0), XZ(u1, 0), XZ(u1, pd.awning.d), XZ(uu, pd.awning.d)]);
    }
    // hospitality units: two storeys, a glass band upstairs, across the street from the garages
    let n = 0, shifted = 0;
    for (let uu = run0; uu + pd.unit.w <= run1; uu += pd.unit.w + pd.unit.gap) {
      // (the street's width is an estimate: where the map has the paddock's own lane or a building there, the unit moves
      // back beyond it – up to 16 m – before it's left out)
      const h = pd.unit.h, u1 = uu + pd.unit.w;
      let d0 = pd.street, why = clash(inset(uu, u1, d0, d0 + pd.unit.d));
      for (let sh = 1; why && sh <= 16; sh++) if (!clash(inset(uu, u1, pd.street + sh, pd.street + sh + pd.unit.d))) { d0 = pd.street + sh; why = null; shifted++; }
      const d1 = d0 + pd.unit.d;
      if (why) { skipped.push({ u: +uu.toFixed(1), what: "unit", why }); continue; }
      const corners = [XZ(uu, d0), XZ(u1, d0), XZ(u1, d1), XZ(uu, d1), XZ((uu + u1) / 2, (d0 + d1) / 2)];
      const gy = corners.map(([x, z]) => ctx.groundAt(x, z)).filter(Number.isFinite);
      const floor = Math.max(...gy), low = Math.min(...gy);
      const PU = (a, d, y) => { const [x, z] = XZ(a, d); return [x, floor + y, z]; };
      const box = (key, a0, a1, e0, e1, y0, y1, roof = true) => {
        F.poly(key, [PU(a0, e0, y0), PU(a1, e0, y0), PU(a1, e0, y1), PU(a0, e0, y1)], null, front);
        F.poly(key, [PU(a0, e1, y0), PU(a1, e1, y0), PU(a1, e1, y1), PU(a0, e1, y1)], null, back);
        F.poly(key, [PU(a0, e0, y0), PU(a0, e1, y0), PU(a0, e1, y1), PU(a0, e0, y1)], null, [-u[0], 0, -u[1]]);
        F.poly(key, [PU(a1, e0, y0), PU(a1, e1, y0), PU(a1, e1, y1), PU(a1, e0, y1)], null, [u[0], 0, u[1]]);
        if (roof) F.poly("unitRoof", [PU(a0, e0, y1), PU(a1, e0, y1), PU(a1, e1, y1), PU(a0, e1, y1)], null, [0, 1, 0]);
      };
      box("unitWall", uu, u1, d0, d1, 0, h);
      if (floor - low > 0.05) box("unitFooting", uu, u1, d0, d1, low - floor - 0.1, 0, false);
      // (the street side faces the garages)
      F.poly("unitGlass", [PU(uu + 0.6, d0 - 0.02, h * 0.55), PU(u1 - 0.6, d0 - 0.02, h * 0.55), PU(u1 - 0.6, d0 - 0.02, h - 0.6), PU(uu + 0.6, d0 - 0.02, h - 0.6)], null, front);
      F.poly("unitGlass", [PU(uu + 2, d0 - 0.02, 0.2), PU(u1 - 2, d0 - 0.02, 0.2), PU(u1 - 2, d0 - 0.02, 3), PU(uu + 2, d0 - 0.02, 3)], null, front);
      occupancy.push(corners.slice(0, 4));
      // (x, z of its centre; its floor, the lowest ground under it, and the pit building's floor there – for checking)
      placed.push([...XZ((uu + u1) / 2, (d0 + d1) / 2), floor, low, baseAt((uu + u1) / 2)].map((x) => +x.toFixed(2)));
      n++;
    }
    paddockInfo = { units: n, shifted, skipped, placed, estimated: true, basis: pd.basis || null };
  }
  const meshes = F.meshes((key) => facilityMaterial(key, p));
  let interior = null;
  if (FI.m.size) { interior = new THREE.Group(); interior.name = "garageInteriors"; for (const m of FI.meshes((key) => facilityMaterial(key, p))) { m.castShadow = false; interior.add(m); } meshes.push(interior); }
  // a pod at one end (Suzuka's silver capsule): a long rounded body lying along the building, sticking out `out` m
  if (p.pod) {
    // (its width from the widest span within its length of that end: an outline can narrow right at the end)
    const pd = p.pod, down = pd.end === "downstream";
    const near = stations.filter((st) => (down ? uMax - st.u : st.u - uMin) <= pd.length);
    const st0 = near.reduce((a, st) => (st.v1 - st.v0 > a.v1 - a.v0 ? st : a)), wv = (st0.v1 - st0.v0) * (pd.width || 0.8), cv = (st0.v0 + st0.v1) / 2;
    const geo = new THREE.CapsuleGeometry(0.5, 1, 8, 24); geo.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(geo, facilityMaterial("pod", p));
    const uc = down ? uMax - pd.length / 2 + (pd.out || 0) : uMin + pd.length / 2 - (pd.out || 0), [x, z] = P(uc, cv);
    m.position.set(x, baseAt(uc) + (pd.y0 + pd.y1) / 2, z);
    m.scale.set(pd.length / 2, pd.y1 - pd.y0, wv);   // (the capsule geometry is 2 long with its rounded ends, 1 across)
    m.rotation.y = -Math.atan2(u[1], u[0]);
    m.name = "pod"; m.castShadow = true; m.receiveShadow = true;
    meshes.push(m);
    // its strip of windows along both sides
    for (const side of [1, -1]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), facilityMaterial("podWindow", p));
      const [bx, bz] = P(uc, cv + side * (wv / 2) * 0.93);
      band.position.set(bx, baseAt(uc) + pd.y0 + (pd.y1 - pd.y0) * 0.62, bz); band.scale.set(pd.length * 0.55, (pd.y1 - pd.y0) * 0.12, 0.6);
      band.rotation.y = -Math.atan2(u[1], u[0]); band.name = "podWindow";
      meshes.push(band);
    }
  }
  const footprint = [...stations.map((st) => P(st.u, st.v0)), ...stations.slice().reverse().map((st) => P(st.u, st.v1))];
  const ground = stations.map((st) => st.g);
  // where a point is along the garages (u) and how far out in front of them (off: towards the track)
  const project = (x, z) => { const uu = (x - ax.c[0]) * u[0] + (z - ax.c[1]) * u[1], vv = (x - ax.c[0]) * v[0] + (z - ax.c[1]) * v[1]; return { u: uu, off: (vv - frontV(Math.max(gStart, Math.min(gEnd, uu)))) * vTrack }; };
  // (for the pit lane across – map3d.js pitModel: the wall's face to the lane, metres out from the garages' front, and
  // the garages' floor height, both along the garages)
  const garages = slots.length ? { slots, pitch: gp, top: G, depth, gStart, gEnd, project, interior, wallAt, wallFace, floorAt } : null;
  return { meshes, footprint, occupancy, garages, top: Math.max(...stations.map((st) => roofAt(st.u))) + (bl ? bl.tip - Math.max(...prof.map((q) => q[1])) : 0),
    info: { length: +(uMax - uMin).toFixed(1), width: +Math.max(...stations.map((s2) => s2.v1 - s2.v0)).toFixed(1), garagePitch: +pitch.toFixed(2),
      profile: prof.map(([a, b2]) => [+(a - uMin).toFixed(1), +b2.toFixed(1)]), bladeRoot: rootH && +rootH.toFixed(1),
      paddock: paddockInfo, pitWall: !!wallAt, wallFrom, wallStations: wallDbg,
      heightFrom: parts.some((q) => q.guessed) ? "facility (the data only guessed it, or counted floors)" : "data", groundFall: +(Math.max(...ground) - Math.min(...ground)).toFixed(1), upstreamFirst } };
}

// Materials of the builders (per model: they're cheap; their textures are shared)
function facilityMaterial(key, p) {
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1, ...o });
  if (key.startsWith("facade:")) {
    const name = key.slice(7), map = facadeTex(name, p, false), em = facadeTex(name, p, true);
    const m = std({ color: 0xffffff, map, roughness: 0.35, metalness: 0.15, emissive: em ? 0xffffff : 0x000000, emissiveMap: em });
    return lit(m, 0, 0.9);
  }
  switch (key) {
    case "panels": return std({ color: 0xffffff, map: panelTex(), roughness: 0.55 });
    case "roofTop": return std({ color: p.roofTop || "#5a5f65", map: roofTex(), roughness: 0.5, metalness: 0.35 });
    case "roofFlat": return std({ color: "#9a9ea2", roughness: 0.9 });
    case "underside": return std({ color: "#c7c9cb", roughness: 0.7 });
    case "fascia": return std({ color: 0xffffff, map: p.fascia === "fasciaWhite" ? fasciaWhiteTex() : fasciaTex(), roughness: 0.4, metalness: 0.2 });
    case "bladeTop": return std({ color: "#d9dcdf", roughness: 0.45, metalness: 0.3 });
    case "bladeSide": return std({ color: "#c9cdd1", map: panelTex(), roughness: 0.5, metalness: 0.2 });
    case "checker": return std({ color: 0xffffff, map: checkerTex(), roughness: 0.6 });
    case "slab": return std({ color: "#e4e5e3", roughness: 0.8 });
    // the garages: dark frames, a light epoxy floor, white walls and ceiling, light strips (lit day and night)
    case "pitWall": return std({ color: "#d9d9d4", roughness: 0.85 });
    case "fence": return std({ color: "#9aa3aa", roughness: 0.5, metalness: 0.4, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    case "walkway": return std({ color: "#7d8287", roughness: 0.9 });
    case "awning": return std({ color: "#202326", roughness: 0.8, side: THREE.DoubleSide });
    case "unitWall": return std({ color: "#3f4347", roughness: 0.6, metalness: 0.2 });
    case "unitRoof": return std({ color: "#55595d", roughness: 0.8 });
    case "unitFooting": return std({ color: "#6f7174", roughness: 0.95 });
    case "unitGlass": return lit(std({ color: "#2c3b45", roughness: 0.1, metalness: 0.3, emissive: "#ffd9a0" }), 0, 0.7);
    case "garFrame": return std({ color: "#33383d", roughness: 0.5, metalness: 0.3 });
    case "garShutter": return std({ color: "#5b6168", roughness: 0.45, metalness: 0.4 });
    case "garFloor": return std({ color: "#c9ccce", roughness: 0.35, metalness: 0.05 });
    case "garWall": return std({ color: "#eceeee", roughness: 0.8 });
    case "garBack": return std({ color: "#d6d9db", roughness: 0.8 });
    case "garCeil": return std({ color: "#f2f3f3", roughness: 0.9 });
    case "garPanel": { const m = std({ color: "#ffffff", roughness: 0.6, metalness: 0.2 }); m.map = panelTexture(); if (!m.map) m.color.set("#9aa0a6"); return m; }
    case "garKick": return std({ color: "#3a3e43", roughness: 0.7, metalness: 0.2 });
    case "garBeam": return std({ color: "#8f959b", roughness: 0.5, metalness: 0.5 });
    case "garLight": return std({ color: "#ffffff", emissive: "#fff6e8", emissiveIntensity: 1.0, roughness: 0.4 });
    case "rail": return std({ color: "#c7d3d8", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55 });
    case "column": return std({ color: "#eceeee", roughness: 0.5, metalness: 0.2 });
    // (no environment map in the scene: a strongly metallic surface would show black – brushed, light silver)
    case "pod": return std({ color: "#d7dce0", roughness: 0.35, metalness: 0.3 });
    case "podWindow": return lit(std({ color: "#1f2c34", roughness: 0.1, metalness: 0.3, emissive: "#ffd9a0" }), 0, 0.8);
    // (light and only a little metallic: with no environment map a mirror-like glass would show near black)
    case "slopedGlass": return lit(std({ color: "#9fbcc8", roughness: 0.25, metalness: 0.1, emissive: "#ffd9a0", side: THREE.DoubleSide }), 0, 0.6);
    case "tent": return std({ color: "#f4f3ef", roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
    default: return std({ color: "#cccccc" });
  }
}
// A garage's service panels: grey sheets 1.2 m wide, a seam between them, a socket box low on each (one repeat)
function panelTexture() {
  if (typeof document === "undefined") return null;   // (tests: no canvas)
  const c = document.createElement("canvas"); c.width = 64; c.height = 128; const g = c.getContext("2d");
  g.fillStyle = "#9aa0a6"; g.fillRect(0, 0, 64, 128);
  g.fillStyle = "#6b7177"; g.fillRect(0, 0, 2, 128); g.fillRect(0, 0, 64, 3);
  g.fillStyle = "#5a6066"; g.fillRect(40, 96, 14, 10);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const BUILDERS = { pitBuilding };

// ---------- model files ----------
// Static building models only: a self-contained GLB (glTF 2.0 binary, buffers and images embedded), checked before
// anything is decoded – the container (header length, 4-byte aligned chunks inside the file, the JSON chunk first),
// the JSON (an object, asset.version 2.x, its lists lists, every accessor inside its bufferView inside its buffer),
// no skins (skinned/animated models aren't supported: a building doesn't move), no extension that needs a decoder
// the app doesn't include (Draco, Meshopt, Basis – no outside decoders are loaded), and what it would take decoded:
// the file is at most 64 MB, but its images decoded and its vertex data are budgeted on their own (a 2 MB JPEG can be a
// 16384² texture: 1 GB). Limits for a detailed building: textures 256 MB decoded (e.g. sixteen 2048² with mipmaps),
// vertex and index data 160 MB, 3 million triangles. Returns null if fine, else the reason.
export const MODEL_LIMITS = { file: 64 * 1024 * 1024, textures: 256 * 1024 * 1024, geometry: 160 * 1024 * 1024, triangles: 3e6 };
const NEEDS_DECODER = ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_meshopt_compression", "KHR_texture_basisu"];
const COMP = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, TYPE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
// width and height from a PNG or JPEG header (null: another format)
function imageSize(b) {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[12] === 0x49 && b[13] === 0x48) { const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); return [dv.getUint32(16), dv.getUint32(20)]; }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
      i += 2 + len;
    }
  }
  return null;
}
export function checkGlb(buf, limits = MODEL_LIMITS) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.byteLength < 20 || u8.byteLength > limits.file) return "size";
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) return "not a glTF 2 binary";
  if (dv.getUint32(8, true) !== u8.byteLength) return "header length doesn't match the file";
  let off = 12, J = null, BIN = null;
  while (off < u8.byteLength) {
    if (off + 8 > u8.byteLength) return "chunk header past the end";
    const clen = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (clen % 4) return "chunk length not 4-byte aligned";
    if (off + 8 + clen > u8.byteLength) return "chunk past the end";
    if (type === 0x4e4f534a) { if (J || off !== 12) return "JSON chunk not first / twice"; J = u8.subarray(off + 8, off + 8 + clen); }
    else if (type === 0x004e4942) { if (BIN) return "two binary chunks"; BIN = u8.subarray(off + 8, off + 8 + clen); }
    off += 8 + clen;
  }
  if (!J) return "no JSON chunk";
  let j; try { j = JSON.parse(new TextDecoder().decode(J)); } catch { return "bad JSON"; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return "JSON isn't a glTF object";
  if (typeof j.asset?.version !== "string" || !/^2\.\d+$/.test(j.asset.version)) return "asset version isn't glTF 2.x";
  if (j.asset.minVersion && j.asset.minVersion !== "2.0") return "needs a newer glTF reader";
  for (const k of ["buffers", "bufferViews", "accessors", "meshes", "nodes", "materials", "textures", "images", "scenes", "skins", "animations", "extensionsRequired"]) if (k in j && !Array.isArray(j[k])) return `JSON ${k} isn't a list`;
  if ((j.skins || []).length) return "skinned model: static models only";
  const dec = (j.extensionsRequired || []).filter((x) => NEEDS_DECODER.includes(x));
  if (dec.length) return `compressed with ${dec.join(", ")}: needs a decoder the app doesn't include`;
  if ((j.buffers || []).some((b) => b?.uri)) return "external buffer";
  if ((j.images || []).some((im) => im?.uri && !im.uri.startsWith("data:"))) return "external image";
  const bufLen = (j.buffers || []).map((b, i) => (i === 0 && BIN ? Math.min(BIN.length, b?.byteLength ?? 0) : 0));
  if ((j.buffers || []).some((b, i) => !(b?.byteLength >= 0) || (i === 0 && b.byteLength > (BIN?.length ?? 0)))) return "buffer bigger than its binary chunk";
  for (const v of j.bufferViews || []) if (!v || !(v.buffer < bufLen.length) || (v.byteOffset || 0) + v.byteLength > bufLen[v.buffer]) return "bufferView past its buffer";
  let geometry = 0;
  for (const a of j.accessors || []) {
    const el = (COMP[a?.componentType] || 0) * (TYPE[a?.type] || 0);
    if (!el || !(a.count >= 0)) return "bad accessor";
    geometry += el * a.count;
    if (a.bufferView != null) {
      const v = j.bufferViews?.[a.bufferView]; if (!v) return "accessor without its bufferView";
      const stride = v.byteStride || el;
      if (a.count && (a.byteOffset || 0) + stride * (a.count - 1) + el > v.byteLength) return "accessor reads past its bufferView";
    }
  }
  if (geometry > limits.geometry) return `vertex data too big (${Math.round(geometry / 1048576)} MB)`;
  let tris = 0;
  for (const m of j.meshes || []) for (const p of m?.primitives || []) { if ((p.mode ?? 4) !== 4) continue; const a = j.accessors?.[p.indices ?? p.attributes?.POSITION]; tris += (a?.count || 0) / 3; }
  if (tris > limits.triangles) return `too many triangles (${Math.round(tris)})`;
  let tex = 0;
  for (const im of j.images || []) {
    let bytes = null;
    if (im?.bufferView != null) { const v = j.bufferViews[im.bufferView]; bytes = v.buffer === 0 && BIN ? BIN.subarray(v.byteOffset || 0, (v.byteOffset || 0) + Math.min(v.byteLength, 65536)) : null; }
    else if (im?.uri?.startsWith("data:")) { try { bytes = Uint8Array.from(atob(im.uri.slice(im.uri.indexOf(",") + 1, im.uri.indexOf(",") + 1 + 87384)), (c) => c.charCodeAt(0)); } catch { bytes = null; } }
    const [w, h] = (bytes && imageSize(bytes)) || [4096, 4096];   // (a format whose size isn't read here counts as 4096²)
    tex += w * h * 4 * (4 / 3);
  }
  if (tex > limits.textures) return `textures too big decoded (${Math.round(tex / 1048576)} MB)`;
  return null;
}
// Parsed models, shared by every placement (their resources marked shared). Each one is held (refs) by every build
// that asked for it – from the moment it asks, while it loads – and then by each placed copy until its world is
// disposed (the copy's userData.onDispose gives it back). Past MODEL_CACHE parsed models, only ones nobody holds are
// freed, oldest first: a model in use by the world on screen or by a build under way is never freed under it (with
// every one in use the cache holds more for a while). A failed load is dropped – only that load – and tried again.
const MODEL_CACHE = 6;
const models = new Map();   // file → { job: Promise<THREE.Object3D>, refs }
function evictModels() {
  for (const [f, e] of models) {
    if (models.size <= MODEL_CACHE) break;
    if (e.refs > 0) continue;
    models.delete(f); e.job.then(freeModel, () => {});
  }
}
function holdModel(file, read) {
  let e = models.get(file);
  if (!e) {
    e = { refs: 0, job: null };
    e.job = parseModel(file, read);
    models.set(file, e);
    e.job.catch(() => { if (models.get(file) === e) models.delete(file); });   // (only this load: a newer one stays)
  } else { models.delete(file); models.set(file, e); }   // most recently used last
  e.refs++;
  evictModels();
  let held = true;
  return { job: e.job, release() { if (!held) return; held = false; e.refs--; evictModels(); } };
}
function markShared(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.userData.shared = true;
    for (const m of [].concat(o.material || [])) { m.userData.shared = true; for (const t of texturesOf(m)) t.userData.shared = true; }
  });
}
export function texturesOf(m) { return Object.values(m).filter((x) => x && x.isTexture); }
function freeModel(root) {
  // (a model's parts share geometry, materials and textures: each freed once)
  const done = new Set(), once = (x) => { if (x && !done.has(x)) { done.add(x); x.dispose(); } };
  root.traverse((o) => { once(o.geometry); for (const m of [].concat(o.material || [])) { for (const t of texturesOf(m)) once(t); once(m); } });
}
async function parseModel(file, read) {
  const buf = await read(file);
  const bad = checkGlb(buf);
  if (bad) throw new Error(`model ${file}: ${bad}`);
  const ab = buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf;
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, "", res, rej));
  const root = gltf.scene;
  let skinned = false; root.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
  if (skinned) { freeModel(root); throw new Error(`model ${file}: skinned model: static models only`); }
  markShared(root);
  return root;
}

// Where a model file goes: position, rotation and scale from the entry (see the conventions above).
export function placement(m, gf, groundAt, bbox = null) {
  const [x, z] = gf.fromLL(m.anchor[0], m.anchor[1]);
  // north in scene axes at the anchor (the fitted frame is turned a little from north)
  const [nx, nz] = gf.fromLL(m.anchor[0] + 0.001, m.anchor[1]), nl = Math.hypot(nx - x, nz - z) || 1, N = [(nx - x) / nl, (nz - z) / nl], E = [-N[1], N[0]];
  const h = ((m.heading || 0) * Math.PI) / 180, d = [N[0] * Math.cos(h) + E[0] * Math.sin(h), N[1] * Math.cos(h) + E[1] * Math.sin(h)];
  const s = (UNITS[m.units || "m"] ?? NaN) * (m.scale ?? 1);
  if (!Number.isFinite(s) || s <= 0) throw new Error("bad model units/scale");
  let y = groundAt(x, z);
  if (m.ground === "lowest" && bbox) {
    // the lowest terrain under the model's footprint (bbox corners, rotated and scaled)
    const ry = Math.atan2(d[0], d[1]), c = Math.cos(ry), sn = Math.sin(ry);
    for (const [bx, bz] of [[bbox.min.x, bbox.min.z], [bbox.max.x, bbox.min.z], [bbox.max.x, bbox.max.z], [bbox.min.x, bbox.max.z]]) {
      const wx = x + (bx * c + bz * sn) * s, wz = z + (-bx * sn + bz * c) * s; y = Math.min(y, groundAt(wx, wz));
    }
  }
  if (!Number.isFinite(y)) throw new Error("no ground at the model");
  return { position: [x, y + (m.lift || 0), z], rotationY: Math.atan2(d[0], d[1]), scale: s };
}
function placeModel(root, m, gf, groundAt) {
  const obj = root.clone(true);
  let box = new THREE.Box3().setFromObject(obj);
  if (m.origin === "bbox") { const c = box.getCenter(new THREE.Vector3()); obj.position.set(-c.x, -box.min.y, -c.z); obj.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(obj); }
  const holder = new THREE.Group();
  holder.add(obj);
  const pl = placement(m, gf, groundAt, box);
  holder.position.set(...pl.position); holder.rotation.y = pl.rotationY; holder.scale.setScalar(pl.scale);
  holder.updateMatrixWorld(true);
  holder.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // its footprint on the ground (scene x, z): a footprint given with the entry ([lat, lon] corners, checked against the
  // real building), else the model's own box turned and scaled with it – a turned building's world box would take in
  // the empty ground at its corners (and the neighbours standing there)
  const footprint = m.footprint?.length >= 3 ? m.footprint.map(([la, lo]) => gf.fromLL(la, lo))
    : [[box.min.x, box.min.z], [box.max.x, box.min.z], [box.max.x, box.max.z], [box.min.x, box.max.z]].map(([x, z]) => { const v = new THREE.Vector3(x, 0, z).applyMatrix4(holder.matrixWorld); return [v.x, v.z]; });
  const wb = new THREE.Box3().setFromObject(holder);
  return { object: holder, footprint, top: wb.max.y };
}

// ---------- the facilities of one circuit ----------
// The map records a facility stands for: named ones (and, for a model file, within `within` m of its anchor);
// plus unnamed parts whose centre lies inside the built footprint (no doubles left standing in it).
// replaces: { names (regex), near: [lat, lon] and within (m) – only records that close to the point (the point inside
// the outline, or within that many metres of its edge); with near and no names, the records at the point }.
export function selectReplaced(spec, buildings, gf, footprint = null, anchorXZ = null) {
  const r = spec.replaces || {};
  if (r.near) anchorXZ = gf.fromLL(r.near[0], r.near[1]);
  const reach = (b) => { const pts = ring(b, gf); return inPoly(anchorXZ[0], anchorXZ[1], pts) || near(anchorXZ[0], anchorXZ[1], pts, r.within || 0); };
  const named = buildings.filter((b) => b.kind !== "grandstand" && (r.names ? r.names.test(b.name || "") : !!r.near) && (!(r.within || r.near) || !anchorXZ || reach(b)));
  if (!footprint) return named;
  const set = new Set(named);
  for (const b of buildings) {
    if (set.has(b) || b.kind === "grandstand" || b.name) continue;
    const c = centroid(ring(b, gf));
    if (inPoly(c[0], c[1], footprint)) set.add(b);
  }
  return [...set];
}

// A pit building for a circuit the registry has none for (19 of the 26): the map's buildings met along the measured pit
// lane on the side away from the track (pitlane.js garageLine) – or, where the map has none there, one made up on the
// line at a typical distance – built as the registry's are (garages along the lane, the pit wall, the teams' layer).
// Its look is a plain one (glass garage fronts, a white fascia): what the real building looks like isn't known here.
//   pit – START_DATA's measured pit lane; toScene([X, Y] feed decimetres) → [x, z]; toTrack(x, z) → [dx, dz]
//   trackEdge(x, z) → metres to the track's tarmac edge (negative on it): nothing is built on the track – a building met
//   that reaches it isn't the pit building (Monaco: the lane curves between stretches of track, the "garages' side"
//   points at the start straight in places), a made-up one that would isn't made
//   boxes – the circuit's measured pit boxes (pitorder.js PIT_BOXES: metres along the pit path): the garages run along
//   them (15 m on past the first and last), not the limiter lines' middle
// the plain pit wall (estimates): a 1.1 m concrete wall with a 3 m catch fence, a 1.5 m step behind it for the stands
export const PLAIN_PIT_WALL = { height: 1.1, thick: 0.5, fence: 3.0, walk: 1.5, deck: 0.3 };
export function genericPitSpec({ venue, location, year, pit, toScene, toTrack, trackEdge = null, boxes = null, registry = FACILITIES }) {
  if (!pit?.path?.length) return null;
  const yearOk = (s) => !(year && s.years && (year < s.years[0] || (s.years[1] != null && year > s.years[1])));
  if (registry.some((s) => s.kind === "pit-building" && entryAt(s, venue, location) && yearOk(s))) return null;
  const frame = pathFrame(pit.path.map(toScene));
  const [u0, u1] = boxes?.length ? [Math.max(0, Math.min(...boxes) - 15), Math.min(frame.len, Math.max(...boxes) + 15)] : garageRun(pit.limitOn, pit.limitOff, frame.len);
  return {
    id: "generic-pits", name: "pit building (map / estimate)", kind: "pit-building", venue: venue ? [venue.key] : [], loc: location ? [location] : [], years: null,
    status: "trial", builder: "pitBuilding",
    // (picked once – before the grandstands are built: scenery.js. A "grandstand" outline met on the garages' line is
    // the pit building mapped so – a stand can't stand where the garages are, metres from the lane (Sakhir: a 400 m
    // unnamed one along the lane on the garages' side; the Main Grandstand is across the straight): built as the pit
    // building, left out of the stands (b.asPitBuilding))
    pick(buildings, gf) {
      if (this.parts) return this.parts;
      // (along a ring's edges every 4 m: off the track by more than a metre)
      const clear = (rg) => !trackEdge || rg.every((a, i) => { const b = rg[(i + 1) % rg.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4)); for (let k = 0; k < n; k++) if (trackEdge(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n) < 1) return false; return true; });
      const all = buildings.map((b) => ({ ring: ring(b, gf), ref: b })).filter((r) => r.ring.length >= 3), rings = all.filter((r) => clear(r.ring));
      const g = garageLine(frame, rings, toTrack, u0, u1);
      this.found = { front: g.front == null ? null : +g.front.toFixed(1), coverage: g.coverage, parts: g.parts.length, run: [Math.round(u0), Math.round(u1)] };
      // (diagnostics: what is beside the path on either side – the garages' side and the track's – development)
      const both = [];
      for (let uu = u0; uu <= u1 + 1e-6; uu += (u1 - u0) / 8) {
        const p0 = frame.at(uu), [gx, gz] = g.side(uu);
        for (const sgn of [1, -1]) { let best = null; for (const r of all) { const d = rayRing(p0.x, p0.z, gx * sgn, gz * sgn, r.ring); if (d < 40 && (!best || d < best.d)) best = { d, r }; } if (best) both.push([Math.round(uu), sgn > 0 ? "garage side" : "track side", +best.d.toFixed(1), best.r.ref.kind || "building", best.r.ref.name || "", best.r.ref.h ?? null, clear(best.r.ring)]); }
      }
      // (and how far the track's tarmac edge is from the path, towards it)
      const toEdge = [];
      if (trackEdge) for (let uu = u0; uu <= u1 + 1e-6; uu += (u1 - u0) / 8) { const p0 = frame.at(uu), [gx, gz] = g.side(uu); let d = null; for (let k = 0; k < 80; k++) { const x = p0.x - gx * k * 0.5, z = p0.z - gz * k * 0.5; if (trackEdge(x, z) <= 0) { d = k * 0.5; break; } } toEdge.push([Math.round(uu), d]); }
      this.found = { ...(this.found || {}), both, toEdge };
      // (diagnostics: what a longer ray meets first at a few stations – development, Map3D.debug().info)
      const far = garageLine(frame, rings, toTrack, u0, u1, { ...PICK, max: 60, step: (u1 - u0) / 6 });
      this.found.far = far.stations.map((st) => [Math.round(st.u), st.s == null ? null : +st.s.toFixed(1), st.ref ? `${st.ref.kind || "building"}:${st.ref.name || ""}` : null]);
      this.picked = g.parts;
      for (const b of g.parts) if (b.kind === "grandstand") { b.asPitBuilding = true; (this.found.stands ||= []).push(b.name || "(unnamed)"); }
      if (g.parts.length) return (this.parts = g.parts);
      // (none on the line: one made up, its outline back in the map's own metres – gf.xz turned round)
      const o = gf.xz([0, 0]), out = genericOutline(frame, g.side, u0, u1);
      if (!clear(out)) { this.found.madeUp = "not made: it would stand on the track"; return (this.parts = []); }
      this.found.madeUp = true;
      return (this.parts = [{ pts: out.map(([x, z]) => [x - o[0], o[1] - z]), h: GENERIC.height, min: 0, synthetic: true }]);
    },
    params: {
      // the garages along the run where the boxes are (the path's points at its ends)
      garageRange: [[frame.at(u0).x, frame.at(u0).z], [frame.at(u1).x, frame.at(u1).z]],
      // estimates (no source for any one circuit): garages 8.5 m wide, 8 m high where the map has no height
      height: GENERIC.height, garagePitch: GENERIC.pitch, plate: 0.6, overhang: { pit: 0.5, paddock: 0.5, end: 0.5 },
      facade: { pit: "pitGlass", paddock: "paddockPanels" }, roofTop: "#8e9196", fascia: "fasciaWhite",
      // the pit wall at the track's edge with the catch fence over it, a narrow step behind for the teams' stands
      pitWall: PLAIN_PIT_WALL,
    },
  };
}

// opts: { scene, gf, groundAt, location, year, toTrack, trial (setting on), readModel(file) → bytes,
// isCurrent() → false once the result would land in a world that's gone }. Returns the contract, plus `info`
// (one line per facility: built how, or why not), or null when no longer current (everything made is freed).
export async function buildFacilities(opts) {
  const own = { group: new THREE.Group(), holds: new Set() };
  // (whatever happens – not current any more, an error – what was made is freed and the models it holds given back)
  const free = () => { disposeGroup(own.group); for (const h of own.holds) h.release(); own.holds.clear(); };
  try { const r = await facilitiesFor(opts, own, free); if (!r) free(); return r; }
  catch (e) { free(); throw e; }
}
async function facilitiesFor({ scene, gf, groundAt, surfaceAt = null, trackEdge = null, barrierRay = null, location, venue = null, year, toTrack, alongTrack = null, trial = true, readModel = null, isCurrent = () => true, registry = FACILITIES }, own) {
  const group = own.group; group.name = "facilities";
  const skip = new Set(), zones = [], spots = [], info = [];
  for (const spec of registry) {
    // (by the session's venue – F1's circuit key –, not the Grand Prix's name; entries without venue keys by Location)
    if (!entryAt(spec, venue, location)) continue;
    if (year && spec.years && (year < spec.years[0] || (spec.years[1] != null && year > spec.years[1]))) { info.push({ id: spec.id, how: "skipped", reason: "year" }); continue; }
    if (spec.status !== "permanent" && !trial) { info.push({ id: spec.id, how: "off" }); continue; }
    let made = null, how = null, reason = null;
    // a model file first, the builder as its fallback
    if (spec.model?.file && readModel) {
      const hold = holdModel(spec.model.file, readModel);
      own.holds.add(hold);
      try {
        const root = await hold.job;
        if (!isCurrent()) return null;
        made = placeModel(root, spec.model, gf, groundAt); how = "model";
        // the placed copy holds the model from now on: given back when its world is disposed (dispose.js)
        own.holds.delete(hold); made.object.userData.onDispose = () => hold.release();
      } catch (e) { reason = e.message; own.holds.delete(hold); hold.release(); }
    }
    if (!made && spec.builder) {
      try {
        // (an entry made for this session's circuit picks its own map buildings – genericPitSpec)
        const parts = spec.pick ? spec.pick(scene.buildings, gf) : selectReplaced(spec, scene.buildings, gf);
        if (!parts.length) throw new Error("its map buildings aren't in the data");
        // (every F1 pit lane has a pit wall along the track's edge: a pit building whose entry gives none gets the plain one
        // – its line from the measured edge, its size an estimate, said so in the info)
        const params = spec.kind === "pit-building" && !spec.params?.pitWall ? { ...(spec.params || {}), pitWall: PLAIN_PIT_WALL, pitWallFrom: "estimate (plain wall)" } : spec.params || {};
        const r = BUILDERS[spec.builder]({ parts, gf, groundAt, surfaceAt, trackEdge, barrierRay, year, trial, toTrack, alongTrack, scene }, params);
        const g = new THREE.Group(); for (const m of r.meshes) g.add(m);
        if (r.garages) g.userData.garages = { ...r.garages, facility: spec.id };
        made = { object: g, footprint: r.footprint, occupancy: r.occupancy, top: r.top, info: { ...r.info, garages: r.garages?.slots.length || 0 } }; how = "builder";
      } catch (e) { reason = (reason ? reason + "; " : "") + e.message; }
    }
    if (!made) { info.push({ id: spec.id, how: "fallback", reason, ...(spec.found ? { found: spec.found } : {}) }); continue; }   // the map's buildings stay
    made.object.name = spec.id; made.object.userData.facility = spec.id;
    group.add(made.object);
    const anchorXZ = spec.model?.anchor ? gf.fromLL(spec.model.anchor[0], spec.model.anchor[1]) : null;
    // (an entry that picks its own buildings – genericPitSpec – also takes every map building standing inside what it
    // built, named or not: those are the pit complex's own parts; left, they stood in front of the garages' openings)
    // (by area: a building a third or more of which lies inside – sampled on a 2 m grid –, as the map often has the
    // same building twice, OSM's and Overture's outline, one reaching further out than the other)
    const share = (r) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const st = Math.max(2, Math.sqrt(((x1 - x0) * (z1 - z0)) / 400)); let n = 0, k = 0;
      for (let x = x0 + st / 2; x < x1; x += st) for (let z = z0 + st / 2; z < z1; z += st) if (inPoly(x, z, r)) { n++; if (inPoly(x, z, made.footprint)) k++; }
      return n ? k / n : 0; };
    const inside = spec.pick ? scene.buildings.filter((b) => b.kind !== "grandstand" && (() => { const r = ring(b, gf); return r.length >= 3 && share(r) >= 0.3; })()) : [];
    const gone = [...new Set([...(spec.picked || []), ...inside, ...selectReplaced(spec, scene.buildings, gf, made.footprint, anchorXZ)])];
    for (const b of gone) skip.add(b);
    zones.push(made.footprint.map(([x, z]) => [x, z]), ...(made.occupancy || []));
    const c = centroid(made.footprint); spots.push([c[0], c[1], Math.max(120, Math.sqrt(Math.abs(polyArea(made.footprint))) * 1.4)]);
    info.push({ id: spec.id, how, status: spec.status, replaced: gone.length, ...(spec.found ? { found: spec.found } : {}), ...(made.info || {}), ...(reason ? { modelError: reason } : {}) });
  }
  if (!isCurrent()) return null;
  // Close-by detail by the distance to the garages themselves (their fronts, not a bounding box: a long building at an
  // angle has a box far bigger than itself): the insides within 400 m (an opening 4.8 m high is ~10 px there in a
  // 1000 px view), the teams' layer (garages.js, added later as "pitTeams") within 300 m.
  const lod = [];
  group.traverse((o) => { const G = o.userData?.garages; if (G) lod.push({ o, pts: G.slots.filter((_, i) => i % 3 === 0 || i === G.slots.length - 1).map((sl) => [sl.front[0], sl.floor, sl.front[1]]) }); });
  group.userData.update = (cam) => {
    for (const { o, pts } of lod) {
      let d = Infinity; for (const [x, y, z] of pts) d = Math.min(d, Math.hypot(cam.x - x, cam.y - y, cam.z - z));
      const inside = o.getObjectByName("garageInteriors"), teams = o.getObjectByName("pitTeams");
      if (inside) inside.visible = d < 400;
      if (teams) teams.visible = d < 300;
    }
  };
  return {
    group: group.children.length ? group : null, skip: (b) => skip.has(b), restyle: () => null,
    // trees keep 4 m off a facility
    keepOut: (x, z) => zones.some((f) => inPoly(x, z, f) || near(x, z, f, 4)),
    count: group.children.length, spots, info,
  };
}
// two polygons overlap (a corner of one inside the other, or edges crossing)
function polysOverlap(a, b) {
  const bb = (p) => p.reduce((r, [x, z]) => [Math.min(r[0], x), Math.min(r[1], z), Math.max(r[2], x), Math.max(r[3], z)], [Infinity, Infinity, -Infinity, -Infinity]);
  const A = bb(a), B = bb(b);
  if (A[0] > B[2] || B[0] > A[2] || A[1] > B[3] || B[1] > A[3]) return false;
  if (a.some(([x, z]) => inPoly(x, z, b)) || b.some(([x, z]) => inPoly(x, z, a))) return true;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) if (segsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
  return false;
}
// a line (a road, a path) running through a polygon
function lineThrough(pts, poly) {
  if (pts.some(([x, z]) => inPoly(x, z, poly))) return true;
  for (let i = 0; i + 1 < pts.length; i++) for (let j = 0; j < poly.length; j++) if (segsCross(pts[i], pts[i + 1], poly[j], poly[(j + 1) % poly.length])) return true;
  return false;
}
function segsCross(p, q, r, s) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(r, s, p), d2 = d(r, s, q), d3 = d(p, q, r), d4 = d(p, q, s);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
}
function near(x, z, pts, d) {
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    if (Math.hypot(ax + dx * t - x, az + dz * t - z) < d) return true;
  }
  return false;
}

// Landmarks and facilities as one: what either replaces is skipped, either's ground is kept clear. The facility
// meshes go in the landmarks group (one group named "landmarks": its night lighting is switched there).
export function combine(lm, fac) {
  if (!fac) return lm;
  let group = lm?.group || null;
  if (fac.group) { if (!group) { group = new THREE.Group(); group.name = "landmarks"; } group.add(fac.group); }
  return {
    group, skip: (b) => !!lm?.skip(b) || fac.skip(b), restyle: (b) => lm?.restyle(b) || null,
    keepOut: (x, z) => !!lm?.keepOut(x, z) || fac.keepOut(x, z),
    count: (lm?.count || 0) + fac.count, spots: [...(lm?.spots || []), ...fac.spots], facilities: fac.info,
  };
}
