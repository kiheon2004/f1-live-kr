// Builds the real-world surroundings of a circuit for the 3D view, in F1's own frame (metres).
//   1. where the circuit is (geo.locate), 2. raceways and roads around it (OSM "core"),
//   3. fit the F1 lap onto them, 4. buildings, land cover, water, barriers, trees around the fitted track
//      (OSM "scenery"), 5. classify everything into a compact list the renderer can draw directly.
// The renderer gets affine maps between F1 metres and latitude/longitude for terrain and imagery tiles.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const geo = require("./geo");

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

// Point in polygon (even-odd).
function inside(x, y, pts) {
  let r = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
}

class Scenes {
  constructor(cacheDir) { this.cacheDir = cacheDir; this.mem = new Map(); }

  // lap: one clean F1 lap ([x, y, z] decimetres). Returns the scene or { ok: false, reason }.
  async build(location, lap, onStep = () => {}) {
    const sig = crypto.createHash("md5").update(JSON.stringify(lap.filter((_, i) => i % 10 === 0).map((p) => [Math.round(p[0] / 50), Math.round(p[1] / 50)]))).digest("hex").slice(0, 10);
    const key = `${location}|${sig}`;
    if (this.mem.has(key)) return this.mem.get(key);
    const job = this.make(location, lap, sig, onStep).catch((e) => ({ ok: false, reason: e.message }));
    this.mem.set(key, job);
    const out = await job;
    if (!out.ok) this.mem.delete(key);   // try again next time (e.g. after coming back online)
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

    const inBox = (pts) => pts.some(([x, y]) => x > minX - 1000 && x < maxX + 1000 && y > minY - 1000 && y < maxY + 1000);
    const conv = (pts) => pts.map(([x, y]) => localToF1(x, y).map((v) => Math.round(v * 10) / 10));
    const buildings = [], areas = [], lines = [], trees = [];
    // Outlines drawn in detail as building:parts: the plain outline around them is left out (it would
    // overlap the parts), as 3D map renderers do.
    const partCentres = scenery.areas.filter((a) => a.tags["building:part"] && a.tags["building:part"] !== "no").map((a) => {
      let x = 0, y = 0; for (const p of a.pts) { x += p[0]; y += p[1]; } return [x / a.pts.length, y / a.pts.length];
    });
    const hasParts = (pts) => {
      if (!partCentres.length) return false;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      return partCentres.some(([x, y]) => x > minX && x < maxX && y > minY && y < maxY && inside(x, y, pts));
    };
    for (const a of scenery.areas) {
      if (!inBox(a.pts)) continue;
      const t = a.tags;
      // grandstands mapped only as an area (leisure=grandstand, no building tag) are still grandstands
      if (t.leisure === "grandstand" && !t.building) { buildings.push({ h: 12, min: 0, kind: "grandstand", est: 1, roof: null, colour: null, roofColour: null, pts: conv(a.pts) }); continue; }
      if (t.building && !t["building:part"] && hasParts(a.pts)) continue;
      if (t.building || t["building:part"]) {
        if (t.building === "roof" && !t.height && !t["building:levels"]) continue;   // canopies over fuel stations etc.
        const h = buildingHeight(t);
        const minH = +(/^\d+(\.\d+)?/.exec(t.min_height || "")?.[0] || 0);
        const kind = t.building === "grandstand" || t.leisure === "grandstand" ? "grandstand" : /^(house|detached|residential|apartments|terrace|semidetached_house)$/.test(t.building || "") ? "home" : /^(industrial|warehouse|hangar|garage|garages|shed|service)$/.test(t.building || "") ? "shed" : "block";
        const est = !(t.height || t["building:height"] || t["building:levels"]);   // height guessed from the kind
        buildings.push({ h: Math.round(h * 10) / 10, min: minH, kind, est: est ? 1 : 0, roof: t["roof:shape"] || null,
          colour: t["building:colour"] || null, roofColour: t["roof:colour"] || null, pts: conv(a.pts) });
        continue;
      }
      const k = areaKind(t);
      if (k) areas.push({ k, pts: conv(a.pts) });
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

    return {
      circuit: info ? { name: info.name, length: info.length, opened: info.opened, firstgp: info.firstgp, altitude: info.altitude } : null,
      ok: true, location, center, sea: geo.SEA_LEVEL[location] ?? 0, rms: fit.rms, inliers: fit.inliers, against: fit.against,
      ll: { lat: latRow, lon: lonRow },          // F1 metres → lat/lon
      f1: { x: fxRow, y: fyRow },                // (lat − centre, lon − centre) → F1 metres
      buildings, areas, lines, trees,
      sceneryError: scenery.error || null,
    };
  }
}

module.exports = { Scenes, buildingHeight, areaKind };
