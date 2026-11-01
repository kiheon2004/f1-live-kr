// The pit lane as drawn, frame by frame (v0.53 §8 check – Map3D.pitPathScan for a replay, Map3D.pitTrace in the game):
// every car in front of the garages, its FINAL drawn place and heading (after everything that moves it), in the pit
// building's own frame (garages.js project: u along the garages, + towards the pit exit; off m out from their fronts).
// What no car can do, measured per frame and per stop:
//   lateral step   – m across the lane in one frame; and the lateral speed against the speed along (a car moving across
//                    faster than it moves along – or across while it stands – is sliding sideways)
//   heading step   – degrees in one frame; slip – the drawn heading against the way the car actually moved
//   curvature      – heading change per metre driven (1/m; an F1 car's tightest is ~1/4.5 m at walking pace)
//   working lane   – metres along the lane a moving car spent with its centre on the garages' side of the line between
//                    the lanes (pitlane.js crossSection inner): before its stop (the way in) and after it (the way out) –
//                    and how far past its stop place it still was in there
// Pure: the caller hands each frame's cars; nothing here reads the scene.
//   geo: { project(x, z) → { u, off }, inner(u) → the line between the lanes (m out), boxes: [u] (every team's box),
//   run: [u0, u1] the garages' run }

const D = 180 / Math.PI, wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createPitTrace(geo, o = {}) {
  const still = o.still ?? 0.4, slipMin = o.slipMin ?? 0.05;
  const overlap = { frames: 0, pairs: new Map() };
  const cars = new Map(), stops = [], top = { lat: [], yaw: [], slip: [], curv: [], slide: [] };
  const keep = (arr, v, extra) => { arr.push([v, extra]); if (arr.length > 40) { arr.sort((a, b) => b[0] - a[0]); arr.length = 20; } };
  const close = (num, c) => {
    if (!c.visit) return;
    const v = c.visit; v.innerAfter = +v.innerAfter.toFixed(1); v.innerBefore = +v.innerBefore.toFixed(1); v.pastStand = +v.pastStand.toFixed(1); v.innerAfterS = +v.innerAfterS.toFixed(2);
    for (const k of ["maxLat", "maxYaw", "maxSlip", "maxCurv", "maxSlide"]) v[k] = +v[k].toFixed(3);
    stops.push({ num, ...v }); c.visit = null;
  };
  return {
    // t: s (session clock), dt: s since the last frame; list: [{ num, x, z, yaw (scene yaw: atan2(dx, dz)), speed (m/s,
    // the data's / engine's), state (string), team, boxU (its box, garages' u; null unknown), inPit (bool) }]
    frame(t, dt, list) {
      const here = new Set(), placed = [];
      for (const q of list) {
        here.add(q.num);
        const pr = geo.project(q.x, q.z), inner = geo.inner(pr.u);
        placed.push([q, pr]);
        let c = cars.get(q.num);
        if (!c || t - c.t > 1.5 * dt + 0.5) { if (c) close(q.num, c); c = { t, u: pr.u, off: pr.off, x: q.x, z: q.z, yaw: q.yaw, standing: 0, visit: null }; cars.set(q.num, c); }
        if (!c.visit) c.visit = { t0: +t.toFixed(2), boxU: q.boxU == null ? null : +q.boxU.toFixed(1), team: q.team || null, states: [], stand: null, innerBefore: 0, innerAfter: 0, innerAfterS: 0, pastStand: 0, maxLat: 0, maxYaw: 0, maxSlip: 0, maxCurv: 0, maxSlide: 0 };
        const v = c.visit;
        if (v.states[v.states.length - 1] !== q.state) { v.states.push(q.state); if (v.states.length > 14) v.states.splice(1, 1); }
        const du = pr.u - c.u, doff = pr.off - c.off, step = Math.hypot(q.x - c.x, q.z - c.z), dyaw = Math.abs(wrap(q.yaw - c.yaw));
        const lat = Math.abs(doff), moving = q.speed > still;
        if (dt > 0 && c.t < t) {
          if (lat > v.maxLat) v.maxLat = lat;
          if (dyaw * D > v.maxYaw) v.maxYaw = dyaw * D;
          // sliding: across faster than 1.5 × its speed along + 0.15 m/s (the steepest way in, 30°, is 0.58 ×; a cramped one ~1.4 ×), or across standing
          const latV = lat / dt, alongV = Math.abs(du) / dt, slide = latV - (1.5 * alongV + 0.15);
          if (slide > v.maxSlide) v.maxSlide = slide;
          keep(top.lat, lat, { num: q.num, t: +t.toFixed(2), u: +pr.u.toFixed(1), off: +pr.off.toFixed(2), state: q.state });
          keep(top.yaw, dyaw * D, { num: q.num, t: +t.toFixed(2), u: +pr.u.toFixed(1), state: q.state });
          if (slide > 0) keep(top.slide, slide, { num: q.num, t: +t.toFixed(2), u: +pr.u.toFixed(1), latV: +latV.toFixed(2), alongV: +alongV.toFixed(2), state: q.state });
          if (step > slipMin) {
            const slip = Math.abs(wrap(Math.atan2(q.x - c.x, q.z - c.z) - q.yaw)) * D, s2 = Math.min(slip, 180 - slip);   // (a car rolled backwards: its own axis)
            if (s2 > v.maxSlip) v.maxSlip = s2;
            keep(top.slip, s2, { num: q.num, t: +t.toFixed(2), u: +pr.u.toFixed(1), state: q.state });
            const curv = dyaw / step; if (step > 0.2 && curv > v.maxCurv) v.maxCurv = curv;
            if (step > 0.2) keep(top.curv, curv, { num: q.num, t: +t.toFixed(2), u: +pr.u.toFixed(1), state: q.state });
          }
          // standing on the garages' side: its stop (the longest); moving there before / after it
          // (in front of the garages only: past the run's ends there is no working lane – the entry / exit roads)
          const inIn = pr.off < inner && (!geo.run || (pr.u >= geo.run[0] && pr.u <= geo.run[1]));
          if (!moving) { c.standing += dt; if (inIn && c.standing > 1 && (!v.stand || c.standing > v.stand.s)) v.stand = { u: +pr.u.toFixed(1), off: +pr.off.toFixed(2), s: +c.standing.toFixed(1), t: +t.toFixed(1) }; }
          else {
            c.standing = 0;
            if (inIn && Math.abs(du) > 0) { if (v.stand) { v.innerAfter += Math.abs(du); v.innerAfterS += dt; v.pastStand = Math.max(v.pastStand, pr.u - v.stand.u); } else v.innerBefore += Math.abs(du); }
          }
        }
        Object.assign(c, { t, u: pr.u, off: pr.off, x: q.x, z: q.z, yaw: q.yaw });
      }
      for (const [num, c] of cars) if (!here.has(num) && t - c.t > 0.5) { close(num, c); cars.delete(num); }
      // two cars drawn on top of each other (a car ~5.6 m long, 2 m wide: closer than 5 m along and 1.9 m across)
      for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
        const [a, pa] = placed[i], [b, pb] = placed[j], du = Math.abs(pa.u - pb.u), dof = Math.abs(pa.off - pb.off);
        if (du < 5 && dof < 1.9) { overlap.frames++; const k = a.num + "-" + b.num; if (!overlap.pairs.has(k)) overlap.pairs.set(k, { a: a.num, b: b.num, t: +t.toFixed(1), u: +pa.u.toFixed(1), du: +du.toFixed(2), doff: +dof.toFixed(2), states: [a.state, b.state] }); }
      }
    },
    report() {
      for (const [num, c] of cars) close(num, c);
      cars.clear();
      const worst = (k) => +Math.max(0, ...stops.map((s) => s[k])).toFixed(3), sorted = (a) => a.sort((x, y) => y[0] - x[0]).slice(0, 8).map(([v, e]) => ({ v: +v.toFixed(3), ...e }));
      const withStop = stops.filter((s) => s.stand);
      return {
        visits: stops.length, stops: withStop.length,
        worst: { latStepM: worst("maxLat"), yawStepDeg: worst("maxYaw"), slipDeg: worst("maxSlip"), curv: worst("maxCurv"), slideMs: worst("maxSlide"),
          innerAfterM: worst("innerAfter"), innerAfterS: worst("innerAfterS"), pastStandM: worst("pastStand"), innerBeforeM: worst("innerBefore") },
        median: (() => { const m = (k) => { const a = withStop.map((s) => s[k]).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; }; return { innerAfterM: m("innerAfter"), pastStandM: m("pastStand"), innerBeforeM: m("innerBefore") }; })(),
        overlap: { frames: overlap.frames, pairs: [...overlap.pairs.values()].slice(0, 12) },
        top: { lat: sorted(top.lat), yaw: sorted(top.yaw), slip: sorted(top.slip), curv: sorted(top.curv), slide: sorted(top.slide) },
        list: stops,
      };
    },
  };
}
