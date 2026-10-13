// Builds the real-world surroundings of a circuit for the 3D view, in F1's own frame (metres).
//   1. where the circuit is (geo.locate), 2. raceways and roads around it (OSM "core"),
//   3. fit the F1 lap onto them, 4. buildings, land cover, water, barriers, trees around the fitted track
//      (OSM "scenery"), 5. classify everything into a compact list the renderer can draw directly.
// The renderer gets affine maps between F1 metres and latitude/longitude for terrain and imagery tiles.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const geo = require("./geo");
const overture = require("./overture");

const ROADS = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$/;
const ROAD_W = { motorway: 15, trunk: 13, primary: 11, secondary: 9, tertiary: 8, unclassified: 6, residential: 6, living_street: 5,
  service: 4.5, pedestrian: 6, motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 6, tertiary_link: 6,
  footway: 2, path: 1.5, cycleway: 2, track: 3 };

// Height of a building from its tags (metres), with sensible defaults by kind.
function buildingHeight(t) {
  const num = (v) => { const m = /^\s*(-?\d+(?:\.\d+)?)/.exec(String(v ?? "")); return m ? +m[1] : null; };
  const h = num(t.height) ?? num(t["building:height"]);
  if (h != null && h > 0 && h < 700) return h;
  const lv = num(t["building:levels"]);
  if (lv != null && lv > 0 && lv < 200) return lv * 3.2 + (num(t["roof:levels"]) || 0) * 2;
  const kind = t.building || t["building:part"] || "";
  return { grandstand: 14, stadium: 18, house: 7, detached: 7, residential: 12, apartments: 24, commercial: 14, office: 24,
    industrial: 9, warehouse: 10, retail: 8, hangar: 12, garage: 3.5, garages: 3.5, shed: 3, roof: 6, hotel: 30, tower: 40,
    church: 15, hospital: 18, school: 10, university: 14, train_station: 10, parking: 10, construction: 6, service: 4, kiosk: 3 }[kind] || 8;
}

// Land cover kinds the renderer knows how to paint and plant.
function areaKind(t) {
  if (t.building || t["building:part"]) return null;
  if (t.natural === "water" || t.water || t.waterway === "riverbank" || t.leisure === "marina" || t.landuse === "basin" || t.landuse === "reservoir") return "water";
  if (t.natural === "wood" || t.landuse === "forest") return "wood";
  if (t.natural === "scrub" || t.natural === "heath") return "scrub";
  if (t.natural === "beach" || t.natural === "sand") return "sand";
  if (t.natural === "bare_rock") return "rock";
  if (t.natural === "wetland") return "wetland";
  if (t.leisure === "park" || t.leisure === "garden" || t.landuse === "village_green" || t.landuse === "recreation_ground") return "park";
  if (t.leisure === "golf_course") return "golf";
  if (t.leisure === "pitch" || t.leisure === "track") return "pitch";
  if (t.leisure === "stadium" || t.leisure === "grandstand") return "stadium";
  if (/^(grass|meadow|grassland|flowerbed)$/.test(t.landuse || t.natural || "")) return "grass";
  if (/^(farmland|orchard|vineyard|plant_nursery)$/.test(t.landuse || "")) return "farm";
  if (t.amenity === "parking" || t["area:highway"] || t.highway) return "paved";
  if (/^(residential)$/.test(t.landuse || "")) return "residential";
  if (/^(commercial|retail|industrial|railway|construction|brownfield)$/.test(t.landuse || "")) return "urban";
  if (t.man_made === "pier" || t.man_made === "breakwater" || t.man_made === "bridge") return "pier";
  return null;
}

// Each circuit's grandstands as its spectator map shows them, with the circuit's capacity (src/data/grandstands.json).
let _stands;
function standsFor(location) {
  if (_stands === undefined) { try { _stands = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "grandstands.json"), "utf8")).circuits; } catch { _stands = null; } }
  if (!_stands) return null;
  return _stands[location] || Object.values(_stands).find((c) => c.aliases?.includes(location)) || null;
}

// Point in polygon (even-odd).
function inside(x, y, pts) {
  let r = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
}

const centroidOf = (pts) => { let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length]; };
const bboxOf = (pts) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
// a lookup of polygons by 100 m cells of their bounding boxes
function cellIndex(items, pts = (a) => a.pts) {
  const cells = new Map();
  for (const a of items) {
    const [x0, y0, x1, y1] = (a._bb = bboxOf(pts(a)));
    for (let i = Math.floor(x0 / 100); i <= Math.floor(x1 / 100); i++) for (let j = Math.floor(y0 / 100); j <= Math.floor(y1 / 100); j++) { const k = i + "," + j; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(a); }
  }
  return (bb) => { const out = new Set(); for (let i = Math.floor(bb[0] / 100); i <= Math.floor(bb[2] / 100); i++) for (let j = Math.floor(bb[1] / 100); j <= Math.floor(bb[3] / 100); j++) for (const a of cells.get(i + "," + j) || []) if (a._bb[0] <= bb[2] && a._bb[2] >= bb[0] && a._bb[1] <= bb[3] && a._bb[3] >= bb[1]) out.add(a); return [...out]; };
}
const isBuilding = (t) => !!(t.building || (t["building:part"] && t["building:part"] !== "no"));
const isStand = (t) => t.building === "grandstand" || t.leisure === "grandstand";

// How much of polygon `pts` the polygons `by` cover (0–1): a grid of points over it (n × n over its bounding box),
// stopping as soon as the answer against `at` is known.
function coverage(pts, by, at = 0.5, n = 10) {
  if (!by.length) return 0;
  const bb = bboxOf(pts), inPts = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = bb[0] + ((i + 0.5) / n) * (bb[2] - bb[0]), y = bb[1] + ((j + 0.5) / n) * (bb[3] - bb[1]);
    if (inside(x, y, pts)) inPts.push([x, y]);
  }
  if (!inPts.length) return 0;
  let hit = 0;
  for (let k = 0; k < inPts.length; k++) {
    if (by.some((p) => inside(inPts[k][0], inPts[k][1], p))) hit++;
    if (hit >= at * inPts.length || hit + inPts.length - k - 1 < at * inPts.length) break;   // (decided)
  }
  return hit / inPts.length;
}
// (an OSM building goes when Overture's buildings on its spot cover this much of it; measured over 28 circuits'
// cached data: ~99.6 % of the OSM buildings with an Overture one on the spot are covered 80 % or more – the same
// building – and the rest mostly a few %: a shed inside a big hall, an annex, one tile's piece of a building)
const SAME = 0.6;

// OSM's areas and Overture's buildings as one list. Overture (OSM's buildings plus Microsoft's and Google's footprints,
// with more heights and roofs) stands for a building where it has one: an OSM building goes only when Overture's
// buildings on the same spot (either's centre inside the other: candidates) cover most of it – so OSM's buildings stay
// wherever Overture has nothing or only something smaller (a tile that failed or was damaged, a building only OSM has,
// a shed or annex inside a big hall Overture lacks), and none is drawn twice: an Overture building standing inside one
// kept that way, no taller, isn't drawn (it adds nothing). A grandstand is OSM's – also one mapped only as an area
// (leisure=grandstand): its seats are built from that outline, and an Overture block on it goes instead. OSM's names
// (Overture often leaves them out; the facilities find their buildings by name) go to the Overture buildings that stand
// for that OSM building – not to a smaller one inside a building OSM keeps; a stadium's or sports centre's area names
// the buildings in it.
function mergeBuildings(osmAreas, ob) {
  const near = cellIndex(ob), gone = new Set(), kept = new Set(), heir = new Map(), stands = [];
  for (const o of ob) o._c = centroidOf(o.pts);
  const sameAs = (a) => { const [cx, cy] = centroidOf(a.pts); return near(bboxOf(a.pts)).filter((o) => inside(cx, cy, o.pts) || inside(...o._c, a.pts)); };
  for (const a of osmAreas) {
    if (isStand(a.tags)) { stands.push(a); kept.add(a); continue; }
    if (!isBuilding(a.tags)) { kept.add(a); continue; }
    const same = sameAs(a);
    if (same.length && coverage(a.pts, same.map((o) => o.pts), SAME) >= SAME) {
      // Overture's stand for it: those whose centre is in it take its name
      if (a.tags.name && a.pts.length > 3) for (const o of same) if (!heir.has(o) && inside(...o._c, a.pts)) heir.set(o, a.tags.name);
      continue;
    }
    kept.add(a);
    // Overture's buildings inside it (most of their footprint), no taller: nothing they'd add
    if (same.length) {
      const h = buildingHeight(a.tags);
      for (const o of same) if (buildingHeight(o.tags) <= h + 0.5 && coverage(o.pts, [a.pts], 0.8) >= 0.8) gone.add(o);
    }
  }
  const areas = osmAreas.filter((a) => /^(stadium|sports_centre)$/.test(a.tags.leisure || "") && a.tags.name && a.pts.length > 3);
  for (const o of ob) {
    if (o.tags.name) continue;
    const n = heir.get(o) ?? (areas.length ? areas.find((a) => inside(...o._c, a.pts))?.tags.name : null);
    if (n) o.tags.name = n;
  }
  for (const a of stands) {
    const same = sameAs(a);
    // (its name, if only the other had one – e.g. from the stadium area around it)
    if (!a.tags.name) { const n = same.find((o) => o.tags.name)?.tags.name; if (n) a.tags = { ...a.tags, name: n }; }
    same.forEach((o) => gone.add(o));
  }
  for (const o of ob) { delete o._bb; delete o._c; }
  return osmAreas.filter((a) => kept.has(a)).concat(ob.filter((o) => !gone.has(o)));
}

// Outlines drawn in detail as building parts: the parts stand in for the outline where they cover it (half of it or
// more) – as 3D map renderers do. A part starting at or above the outline's roof doesn't count when the outline's
// height is known (tagged): a roof, canopy or link on top covers the plan, not the building under it. Where they cover
// less (one tower part in a long hall, parts lost with a failed tile, only the roof mapped as a part), the outline stays
// and its parts are fitted to it so no two walls stand in each other: a part reaching above the outline's roof starts
// at that roof, one inside its volume isn't drawn. A grandstand's outline always stays (its seats are built from it).
// Returns { drop: Set of areas left out, minOf: Map of parts → their new min height }.
function resolveParts(areas) {
  const parts = areas.filter((a) => a.tags["building:part"] && a.tags["building:part"] !== "no");
  const drop = new Set(), minOf = new Map();
  if (!parts.length) return { drop, minOf };
  const near = cellIndex(parts);
  const num = (v) => { const m = /^\s*(\d+(?:\.\d+)?)/.exec(String(v ?? "")); return m ? +m[1] : 0; };
  for (const o of areas) {
    const t = o.tags;
    if (!t.building || t["building:part"] || isStand(t)) continue;
    const bb = bboxOf(o.pts);
    const mine = near(bb).filter((p) => inside(...centroidOf(p.pts), o.pts));
    if (!mine.length) continue;
    const oh = buildingHeight(t);   // (heights are from the ground: the outline's roof)
    // how much of the outline the parts cover: a grid of points over it (with its height a guess, any part may be
    // the building itself)
    const known = !!(t.height || t["building:height"] || t["building:levels"]);
    const low = known ? mine.filter((p) => num(p.tags.min_height) < oh - 0.3) : mine;
    let n = 0, hit = 0;
    for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) {
      const x = bb[0] + ((i + 0.5) / 14) * (bb[2] - bb[0]), y = bb[1] + ((j + 0.5) / 14) * (bb[3] - bb[1]);
      if (!inside(x, y, o.pts)) continue;
      n++; if (low.some((p) => inside(x, y, p.pts))) hit++;
    }
    if (n && hit / n >= 0.5) { drop.add(o); continue; }
    for (const p of mine) {
      const pmin = num(p.tags.min_height), ph = buildingHeight(p.tags);
      if (pmin >= oh - 0.3) continue;
      if (ph > oh + 0.5) minOf.set(p, oh); else drop.add(p);
    }
  }
  for (const p of parts) delete p._bb;
  return { drop, minOf };
}

const MEM_SCENES = 4;
class Scenes {
  constructor(cacheDir) { this.cacheDir = cacheDir; this.mem = new Map(); }

  // lap: one clean F1 lap ([x, y, z] decimetres). Returns the scene or { ok: false, reason }.
  async build(location, lap, onStep = () => {}) {
    const sig = crypto.createHash("md5").update(JSON.stringify(lap.filter((_, i) => i % 10 === 0).map((p) => [Math.round(p[0] / 50), Math.round(p[1] / 50)]))).digest("hex").slice(0, 10);
    const key = `${location}|${sig}`;
    if (this.mem.has(key)) { const j = this.mem.get(key); this.mem.delete(key); this.mem.set(key, j); return j; }
    const job = this.make(location, lap, sig, onStep).catch((e) => ({ ok: false, reason: e.message }));
    this.mem.set(key, job);
    // (a scene is tens of MB: only the last few circuits stay in memory; older ones rebuild from the disk cache)
    while (this.mem.size > MEM_SCENES) this.mem.delete(this.mem.keys().next().value);
    const out = await job;
    // try again next time (e.g. after coming back online) – also when some building tiles failed: the tiles that came
    // are on disk, the missing ones are asked for again (meanwhile OSM's buildings stand there)
    if ((!out.ok || out.buildingsPartial) && this.mem.get(key) === job) this.mem.delete(key);
    return out;
  }

  async make(location, lap, sig, onStep) {
    onStep("위치 찾는 중");
    const info = geo.circuitInfo(location);
    const center = await geo.locate(this.cacheDir, location) || info?.center;
    if (!center) return { ok: false, reason: "서킷 위치를 찾지 못했어요" };
    const fr = geo.frame(center);

    // Fit (cached per circuit and lap shape).
    const fitFile = path.join(this.cacheDir, `fit2_${location.replace(/[^A-Za-z0-9]+/g, "_")}_${sig}.json`);
    let fit = null;
    try { fit = JSON.parse(fs.readFileSync(fitFile, "utf8")); } catch {}
    // 1) the circuit's own centreline (bundled), 2) OpenStreetMap raceways and roads.
    if (!fit && info?.line?.length) {
      onStep("트랙 위치 맞추는 중");
      const line = info.line.map(([lat, lon]) => fr.toXY(lat, lon));
      const f = geo.fitTrack(lap, [line.concat([line[0]])], []);
      if (f?.ok) { fit = { ...f, against: "centreline" }; fs.writeFileSync(fitFile, JSON.stringify(fit)); }
    }
    if (!fit) {
      onStep("지도 데이터(도로·트랙) 받는 중");
      const core = await geo.getOsm(this.cacheDir, location, "core", center, 3400);
      onStep("트랙 위치 맞추는 중");
      const race = core.lines.filter((l) => l.tags.highway === "raceway").map((l) => l.pts);
      const roads = core.lines.filter((l) => ROADS.test(l.tags.highway || "")).map((l) => l.pts);
      fit = geo.fitTrack(lap, race, roads);
      if (!fit) return { ok: false, reason: "지도에서 이 트랙을 찾지 못했어요" };
      fs.writeFileSync(fitFile, JSON.stringify(fit));
    }
    if (!fit.ok) return { ok: false, reason: `지도와 트랙이 충분히 맞지 않아요 (일치 ${(fit.inliers * 100).toFixed(0)}%)` };

    // F1 metres ↔ local metres ↔ lat/lon. Both maps are affine (the local frame is linear around the centre).
    const f1ToLocal = (fx, fy) => geo.toLocal(fit, [fx * 10, fy * 10]);
    const localToF1 = (ex, ey) => geo.toF1(fit, [ex, ey]).map((v) => v / 10);
    const f1ToLL = (fx, fy) => { const [ex, ey] = f1ToLocal(fx, fy); return fr.toLL(ex, ey); };
    // fn(u, v) → [a, b]; returns coefficient rows so that a = r0[0] + r0[1]·u + r0[2]·v (sampled `step` apart).
    const affine = (fn, step) => {
      const o = fn(0, 0), ux = fn(step, 0), vy = fn(0, step);
      return [[o[0], (ux[0] - o[0]) / step, (vy[0] - o[0]) / step], [o[1], (ux[1] - o[1]) / step, (vy[1] - o[1]) / step]];
    };
    const [latRow, lonRow] = affine(f1ToLL, 1000);
    const [fxRow, fyRow] = affine((dLat, dLon) => { const [ex, ey] = fr.toXY(dLat + center[0], dLon + center[1]); return localToF1(ex, ey); }, 0.01);
    // (the inverse rows take lat/lon relative to the centre, which keeps the numbers well conditioned)

    // Area of interest: the lap's box plus a margin, in local metres.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of lap) { const [ex, ey] = f1ToLocal(p[0] / 10, p[1] / 10); minX = Math.min(minX, ex); maxX = Math.max(maxX, ex); minY = Math.min(minY, ey); maxY = Math.max(maxY, ey); }
    const mid = fr.toLL((minX + maxX) / 2, (minY + maxY) / 2);
    const reach = Math.max(maxX - minX, maxY - minY) / 2 + 900;

    onStep("주변 건물·지형 받는 중");
    let scenery = { lines: [], areas: [], points: [] };
    try { scenery = await geo.getOsm(this.cacheDir, location, "scenery", mid, Math.min(reach, 3600), center); }
    catch (e) { scenery.error = e.message; }
    const core = { lines: [] };   // roads and raceways are part of the scenery answer
    // Buildings: Overture Maps (OSM's plus Microsoft/Google footprints, more heights and roof data) when it
    // can be had, else OSM's own. Grandstands mapped only as an area (leisure=grandstand) always come from OSM.
    onStep("건물 정보 받는 중");
    try {
      const ob = await overture.buildings(this.cacheDir, mid, Math.min(reach, 3600), fr, (d, n) => onStep(`건물 정보 받는 중 ${d}/${n}`));
      if (ob.areas.length || ob.tiles.some((t) => t.status === "ok")) {
        scenery = { ...scenery, areas: mergeBuildings(scenery.areas, ob.areas) };
        scenery.buildingsFrom = ob.partial ? "overture+osm" : "overture";
      }
      if (ob.partial) scenery.buildingsPartial = ob.tiles.filter((t) => t.status === "failed" || t.status === "damaged").length;
    } catch (e) { scenery.overtureError = e.message; }

    const inBox = (pts) => pts.some(([x, y]) => x > minX - 1000 && x < maxX + 1000 && y > minY - 1000 && y < maxY + 1000);
    const conv = (pts) => pts.map(([x, y]) => localToF1(x, y).map((v) => Math.round(v * 10) / 10));
    const buildings = [], areas = [], lines = [], trees = [];
    // Outlines drawn in detail as building:parts: the parts stand in for them where they cover them (resolveParts)
    const parts = resolveParts(scenery.areas);
    for (const a of scenery.areas) {
      if (!inBox(a.pts)) continue;
      const t = a.tags;
      // grandstands mapped only as an area (leisure=grandstand, no building tag) are still grandstands
      if (t.leisure === "grandstand" && !t.building) { buildings.push({ h: 12, min: 0, kind: "grandstand", est: 1, roof: null, colour: null, roofColour: null, name: t.name || null, pts: conv(a.pts) }); continue; }
      if (parts.drop.has(a)) continue;
      if (t.building || t["building:part"]) {
        if (t.building === "roof" && !t.height && !t["building:levels"]) continue;   // canopies over fuel stations etc.
        const h = buildingHeight(t);
        const minH = parts.minOf.get(a) ?? +(/^\d+(\.\d+)?/.exec(t.min_height || "")?.[0] || 0);
        const kind = t.building === "grandstand" || t.leisure === "grandstand" ? "grandstand" : /^(house|detached|residential|apartments|terrace|semidetached_house)$/.test(t.building || "") ? "home" : /^(industrial|warehouse|hangar|garage|garages|shed|service)$/.test(t.building || "") ? "shed" : "block";
        const est = !(t.height || t["building:height"] || t["building:levels"]);   // height guessed from the kind
        const num = (v) => { const m = /^\s*(\d+(?:\.\d+)?)/.exec(String(v ?? "")); return m ? +m[1] : null; };
        buildings.push({ h: Math.round(h * 10) / 10, min: minH, kind, est: est ? 1 : 0, roof: t["roof:shape"] || null,
          colour: t["building:colour"] || null, roofColour: t["roof:colour"] || null, name: t.name || null,
          // what the renderer picks the look from: the kind of building, floors, materials, roof details
          cls: t.building || t["building:part"] || null, part: t["building:part"] ? 1 : 0, lv: num(t["building:levels"]),
          mat: t["building:material"] || null, rmat: t["roof:material"] || null, rh: num(t["roof:height"]), rd: num(t["roof:direction"]),
          ro: t["roof:orientation"] || null, ml: /ML|Open Buildings/.test(t["overture:source"] || "") ? 1 : 0, pts: conv(a.pts) });
        continue;
      }
      const k = areaKind(t);
      if (k) areas.push({ k, ...(t.landuse ? { lu: t.landuse } : {}), pts: conv(a.pts) });
    }
    for (const l of [...core.lines, ...scenery.lines]) {
      if (!inBox(l.pts)) continue;
      const t = l.tags;
      let k = null, w = 0;
      if (t.highway === "raceway") { k = "raceway"; w = +t.width || 12; }
      else if (t.highway && ROAD_W[t.highway] != null && t.area !== "yes") { k = /^(footway|path|cycleway|track)$/.test(t.highway) ? "path" : "road"; w = +t.width || ROAD_W[t.highway]; if (t.tunnel === "yes" || t.layer < 0) continue; }
      else if (t.railway) { k = "rail"; w = 3; if (t.tunnel === "yes") continue; }
      else if (t.waterway) { k = "river"; w = +t.width || (t.waterway === "river" ? 25 : t.waterway === "canal" ? 15 : 4); }
      else if (t.barrier) { k = "barrier"; w = { wall: 0.4, retaining_wall: 0.6, fence: 0.1, guard_rail: 0.2, jersey_barrier: 0.6 }[t.barrier] || 0.3; }
      else if (t.natural === "coastline") { k = "coast"; w = 0; }
      else if (t.natural === "tree_row") { for (const p of geo.densify([l.pts], 9)) trees.push(localToF1(p[0], p[1]).map((v) => Math.round(v * 10) / 10)); continue; }
      if (!k) continue;
      lines.push({ k, w, sub: t.barrier || t.highway || t.railway || t.waterway, bridge: t.bridge === "yes" || +t.layer > 0 ? 1 : 0, pts: conv(l.pts) });
    }
    for (const p of scenery.points) if (p.tags.natural === "tree") trees.push(localToF1(p.pt[0], p.pt[1]).map((v) => Math.round(v * 10) / 10));

    // Listed grandstands: ends from latitude/longitude into F1 metres.
    const sd = standsFor(location);
    const toF1m = ([lat, lon]) => localToF1(...fr.toXY(lat, lon)).map((v) => Math.round(v * 10) / 10);
    const stands = sd ? { name: sd.name, total: sd.total || null, seats: sd.seats || null, est: !!sd.est, src: sd.src || null,
      list: (sd.stands || []).map((st) => ({ ...st, a: toF1m(st.a), b: toF1m(st.b) })) } : null;

    return {
      circuit: info ? { name: info.name, length: info.length, opened: info.opened, firstgp: info.firstgp, altitude: info.altitude } : null,
      ok: true, location, center, sea: geo.SEA_LEVEL[location] ?? 0, rms: fit.rms, inliers: fit.inliers, against: fit.against,
      ll: { lat: latRow, lon: lonRow },          // F1 metres → lat/lon
      f1: { x: fxRow, y: fyRow },                // (lat − centre, lon − centre) → F1 metres
      buildings, areas, lines, trees, stands,
      sceneryError: scenery.error || null, buildingsFrom: scenery.buildingsFrom || "osm", buildingsPartial: scenery.buildingsPartial || 0,
    };
  }
}

module.exports = { Scenes, buildingHeight, areaKind, mergeBuildings, resolveParts };
