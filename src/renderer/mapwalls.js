// The map's barriers (OSM barrier=wall / retaining_wall / jersey_barrier / guard_rail / fence lines) split and clipped
// once, the same way for what is drawn and what is looked for (v0.47, request §3: pitwallcheck.js solidBarrierSegs kept
// a whole piece whose two ends were off the tarmac though its middle crossed the road or the pit lane, while the drawing
// cut its points on the tarmac / in the lane – what the pit wall's search found was not what was drawn).
//
// Pure (node-tested: test/walls47.test.js). Two stages, because the pit building is placed from the map's walls and the
// pit lane it defines then cuts them (scenery.js buildReal):
//   CANDIDATE walls – before the facilities: cut by the track's tarmac only (scenery.js corridor.on(x, z, −0.3)). The
//     facilities' barrierRay looks for the pit wall among them (facilities.js: the map's wall is the pit wall, wallFace
//     from it); they can't be cut by the pit lane, which isn't known until that wall is (pitwallcheck.js pitLaneOf needs
//     the facility's wallFace) – the cycle avoided.
//   FINAL walls – after the facilities: the same lines cut by the tarmac AND the pit lane in front of the garages
//     (pitLaneOf), drawn by scenery.js barriersMesh; the 3D view's checks (map3d.js Map3D.pitWallOrder / pitWallSeen) cast
//     rays at that drawn mesh. The pit lane ends short of the map's own pit wall (wallFace − margin), so the wall the
//     facilities took from the candidates is never cut from the final walls; the lane's cut only removes pieces nearer
//     the garages than it (Imola 2025: mapped fences across the lane), which barrierRay already passes over (a hit under
//     5 m from the garages' front isn't taken for the wall – facilities.js). Both stages split each map segment on the
//     same 2 m grid (from its first point), so every final piece is a candidate piece.
//
// How a segment is cut: tested every `step` metres along it (both ends included). Nothing cut – kept as mapped (one
// piece; in `step` m points where dense(x, z) says so at either end: the drawing near the pits, as v0.46 drew it). A
// point cut – the segment in `step` m pieces, a piece kept only where neither of its ends is cut. (v0.46 drew a segment
// with a cut end only near the pits in 2 m pieces – elsewhere both pieces round a cut point were left out whole –, and
// kept a segment whose middle alone crossed the road; the search kept 2 m pieces everywhere.)

// lines: [{ k, sub, pts }] (map points), xz(p) → [x, z] scene metres; opts: cut(x, z) → falsy or a reason ("road",
// "lane"…), keep(l, q) → false leaves the line out (q: its points in scene metres), dense(x, z), step, stats (an object:
// filled with { lines, left – lines `keep` left out, segs, crossing – segments whose two ends are kept but whose middle is
// cut, endCut – segments with a cut end, crossingSparse / endCutSparse – of those, the ones away from `dense` (v0.46 drew
// those as mapped: a crossing one whole, one with a cut end not at all), cut: { reason: test points cut }; where: an array – filled with up to 40 [kind, sub, x, z, length] of those
// segments, for a look at them: Map3D.viewMapWall) }). → runs [{ ...l, pts: [[x, z]…] }] in scene metres, each ≥ 2 points.
export function clipBarrierLines(lines, xz, { cut = () => false, keep = null, dense = null, step = 2, stats = null } = {}) {
  const out = [], st = stats || {};
  st.lines ??= 0; st.left ??= 0; st.segs ??= 0; st.crossing ??= 0; st.endCut ??= 0; st.crossingSparse ??= 0; st.endCutSparse ??= 0; st.cut ??= {};
  const why = (x, z) => { const r = cut(x, z); if (r) st.cut[r === true ? "cut" : r] = (st.cut[r === true ? "cut" : r] || 0) + 1; return !!r; };
  for (const l of lines) {
    if (l.k !== "barrier") continue;
    const q = l.pts.map(xz);
    if (q.length < 2) continue;
    if (keep && !keep(l, q)) { st.left++; continue; }
    st.lines++;
    let run = [], prevCut = why(...q[0]);
    if (!prevCut) run.push(q[0]);
    const flush = () => { if (run.length > 1) out.push({ ...l, pts: run }); run = []; };
    for (let i = 1; i < q.length; i++) {
      const [ax, az] = q[i - 1], [bx, bz] = q[i], m = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
      const pt = (k) => [ax + ((bx - ax) * k) / m, az + ((bz - az) * k) / m];
      const aCut = prevCut, c = [aCut];
      for (let k = 1; k <= m; k++) c.push(why(...pt(k)));
      const dn = !!dense && (dense(ax, az) || dense(bx, bz));
      st.segs++;
      const mark = (kind) => { if (Array.isArray(st.where) && st.where.length < 40) st.where.push([kind, l.sub, +((ax + bx) / 2).toFixed(1), +((az + bz) / 2).toFixed(1), +Math.hypot(bx - ax, bz - az).toFixed(1)]); };
      if (aCut || c[m]) { st.endCut++; if (dense && !dn) { st.endCutSparse++; mark("endCut"); } } else if (c.some(Boolean)) { st.crossing++; mark(dense && !dn ? "crossingSparse" : "crossing"); if (dense && !dn) st.crossingSparse++; }
      if (!c.some(Boolean)) {
        // (nothing cut: as mapped)
        if (dn) for (let k = 1; k <= m; k++) run.push(k === m ? [bx, bz] : pt(k));
        else run.push([bx, bz]);
      } else for (let k = 1; k <= m; k++) {
        if (c[k]) flush();
        else run.push(k === m ? [bx, bz] : pt(k));   // (after a cut point: a new run from here)
      }
      prevCut = c[m];
    }
    flush();
  }
  return out;
}

// runs → segments [ax, az, bx, bz] (what barrierRay casts against)
export function runSegs(runs) {
  const out = [];
  for (const r of runs) for (let i = 1; i < r.pts.length; i++) out.push([...r.pts[i - 1], ...r.pts[i]]);
  return out;
}
