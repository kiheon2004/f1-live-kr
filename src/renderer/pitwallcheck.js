// The pit wall across, at a team's stand: in what order the things out from the garages come – the pit lane, the
// team's stand, the wall, the track – and whether that is the order a real pit wall has (v0.46, the user's report: a
// stand on the track's side of a wall, the wall between it and the pit lane).
//
// What it should be (FIA Appendix O 2026 §7.9: the pit lane "separated by a pit wall and signalling platform" from the
// starting straight; Autosport 2024-03-19, "Everything you need to know about the pitwall in F1": the stands are "built
// along the top of the chemin de ronde (wall-walk), against the fence between the pitlane and the main straight"):
//   garages | working lane | fast lane | stand | wall (and its debris fence) | track
// – the stand open to the pit lane (nothing standing between them), the wall between the stand and the track's tarmac.
//
// Pure (node-tested): the 3D view's dev hook (map3d.js Map3D.pitWallOrder) measures, this judges.
// A section: { stand: [s0, s1] – the stand's footprint across (metres out from the garages' front: s0 its lane side, s1
// its track side), lane – the pit lane's tarmac ends here (the facility's wall face: facilities.js wallFace), edge – the
// track's tarmac edge, hits – [{ off, name, low? }] what a level line out from the garages meets at the stand's seated
// heights (mesh names: map3d.js, scenery.js barriersMesh, facilities.js); low: met by a line at the lane's own height,
// under a raised stand (a platform's edge under its deck isn't in its way; the wall a line over it misses is the wall) }.

// a wall – solid, a car or a person doesn't pass it; a screen – a fence or a railing: no crash wall, but between a stand
// and its pit lane it shuts the stand off from the lane all the same
export const WALL = /^(barrier:(wall|retaining_wall|jersey_barrier|guard_rail)|syntheticWalls|pitWall)$/;
export const SCREEN = /^(barrier:fence|fence|rail)$/;
// (a hit within this of the stand's track-side end is the wall it stands against)
export const TOL = 0.2;

export function standSection(sec, tol = TOL) {
  const [s0, s1] = sec.stand, edge = Number.isFinite(sec.edge) ? sec.edge : null;
  // (one hit per thing: the same mesh met at several heights within 0.3 m is one)
  const hits = [];
  for (const h of [...(sec.hits || [])].filter((h) => WALL.test(h.name) || SCREEN.test(h.name)).sort((a, b) => a.off - b.off))
    if (!hits.some((q) => q.name === h.name && Math.abs(q.off - h.off) < 0.3 && q.low === !!h.low)) hits.push({ off: +h.off.toFixed(2), name: h.name, kind: WALL.test(h.name) ? "wall" : "screen", low: !!h.low });
  const problems = [];
  // between the garages and the stand's track side: in the lane, or through the stand
  const between = hits.filter((h) => !h.low && h.off > 0.3 && h.off < s1 - tol);
  for (const h of between) problems.push(`${h.name} ${h.off} m out: ${h.off < s0 ? "between the pit lane and the stand" : "through the stand"}`);
  // between the stand and the track's tarmac: a wall
  const trackWall = hits.filter((h) => h.kind === "wall" && h.off >= s1 - tol && (edge == null || h.off <= edge + 0.5));
  if (!trackWall.length) problems.push("no wall between the stand and the track");
  if (edge != null && s1 > edge) problems.push(`the stand reaches the track (${s1.toFixed(2)} > edge ${edge.toFixed(2)})`);
  if (sec.lane != null && s0 < sec.lane - 0.2 && !sec.upper) problems.push(`the stand stands ${(sec.lane - s0).toFixed(2)} m in the pit lane`);
  // the order, garages first
  const items = [[0, "garages"], ...(sec.lane != null ? [[sec.lane, "lane|"]] : []), [s0, "stand["], [s1, "]stand"], ...hits.filter((h) => !h.low || !hits.some((q) => !q.low && q.name === h.name && Math.abs(q.off - h.off) < 0.3)).map((h) => [h.off, h.name + (h.low ? "(low)" : "")]), ...(edge != null ? [[edge, "track"]] : [])];
  items.sort((a, b) => a[0] - b[0] || (a[1] === "track") - (b[1] === "track"));
  return { ok: !problems.length, order: items.map(([o, n]) => `${n}@${o.toFixed(1)}`).join(" "), problems, trackWall: trackWall[0] || null, between };
}

// a whole circuit: every stand's section → { stands, wrong (how many), problems (distinct, with how often) }
export function circuitVerdict(sections) {
  const res = sections.map((s) => ({ team: s.team, ...standSection(s) })), count = new Map();
  for (const r of res) for (const p of r.problems) { const k = p.replace(/[-\d.]+( m|\))/g, "…$1").replace(/\(\S+ > edge \S+\)/, ""); count.set(k, (count.get(k) || 0) + 1); }
  return { stands: res.length, wrong: res.filter((r) => !r.ok).length, problems: [...count].map(([p, n]) => `${n}× ${p}`), res };
}

// Between a pit building's garages and the track face of its pit wall (G: facilities.js garages – project, wallOut):
// (x, z) → true there. Nothing generated (map3d.js walls: a barrier 12 m out from a stretch of tarmac) stands in it –
// one stood in the walkway, through the teams' stands, at Jeddah (v0.46, run/pitwall).
export function pitsUpToWall(G, margin = 0.3) {
  if (!G?.wallOut || !G.project) return null;
  return (x, z) => { const p = G.project(x, z); return p.u > G.gStart - 3 && p.u < G.gEnd + 3 && p.off > -1 && p.off < G.wallOut(Math.max(G.gStart, Math.min(G.gEnd, p.u))) + margin; };
}

// The pit lane in front of the garages, short of its wall (G: facilities.js garages – project, wallFace): (x, z) → true
// there. The session's cars drive across it into their boxes and out: a mapped barrier there is not where the map has
// it (scenery.js cuts it) – the map's own pit wall is the lane's end, past `margin` (v0.46: Imola's mapped fences).
export function pitLaneOf(G, margin = 0.3) {
  if (!G?.wallFace || !G.project) return null;
  return (x, z) => { const p = G.project(x, z); return p.u > G.gStart && p.u < G.gEnd && p.off > 0.3 && p.off < G.wallFace(Math.max(G.gStart, Math.min(G.gEnd, p.u))) - margin; };
}

// The map's solid barriers (walls, jersey barriers, retaining walls, guard rails – not fences) as segments [ax, az, bx,
// bz] in scene metres – only pieces that are drawn: scenery.js barriersMesh cuts a line's points on the tarmac
// (onTarmac(x, z)), and a piece found but not drawn had been taken for the pit wall (v0.46: Silverstone 2024's end – no
// wall before the last teams' stands; run/pitwall)
// (kinds: the fences instead – the pit wall's debris fence a map may have where it has no wall: facilities.js)
export function solidBarrierSegs(lines, xz, onTarmac = () => false, kinds = /^(wall|retaining_wall|jersey_barrier|guard_rail)$/) {
  const out = [];
  for (const l of lines) if (l.k === "barrier" && kinds.test(l.sub || "")) {
    const q = l.pts.map(xz), on = q.map(([x, z]) => onTarmac(x, z));
    for (let i = 1; i < q.length; i++) {
      const [ax, az] = q[i - 1], [bx, bz] = q[i];
      if (!on[i - 1] && !on[i]) { out.push([ax, az, bx, bz]); continue; }
      // (an end on the tarmac: in 2 m pieces, the ones off it – as drawn: scenery.js cuts a line near the pits in 2 m
      // points. Whole, the piece was drawn but not found – Monza 2026: the map's wall stood through three stands, ours at
      // the edge behind it; run/pitwall)
      const m = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2)), pt = (k) => [ax + ((bx - ax) * k) / m, az + ((bz - az) * k) / m];
      for (let k = 0; k < m; k++) { const a = pt(k), b = pt(k + 1); if (!onTarmac(...a) && !onTarmac(...b)) out.push([...a, ...b]); }
    }
  }
  return out;
}
