// A stretch of a circuit with a width of its own. The track's width is measured from where the field drives, with the
// circuit's usual width as its floor (map3d.js measureWidth) – one figure per circuit. Where the real road is narrower
// than that for a short way and something stands right beside it, the stretch is listed here: a straight corridor
// given by its centre line (two points in the feed's own metres – the frame the cars' positions come in, the same
// every session) and its width. Inside it the edges are the corridor's, whatever way the lap line wanders in it;
// beyond its ends they ease back to the measured ones over `ease` metres.
//   Marina Bay, Anderson Bridge (venue 61): the carriageway between the bridge's north-east and middle trusses is
//   about 9 m wide (the trusses' inner faces are 11.3 m apart – aerial imagery, ± 1.5 m); the field crosses it on
//   one line (seen 2.2 m wide, half a car each side included – 2025 race), and the circuit's 12 m put the track's
//   edges where the real trusses stand. The centre line is the real carriageway's: 6.1 m north-east of the middle
//   truss, from 38 m before the bridge's middle to 38 m past it (the end pylons stand at ± 33.5 … 37 m).
//   Mexico City, the stadium's west gap (venue 65): the track leaves the stadium through a 27.4 m gap between the two
//   stands' ends. The field passes it on one line 7 m from the south stand's corner (setting up for the right-hander
//   after it), and a 14 m ribbon centred on that line reached the corner itself (0.05 m – 2025 race). The corridor is
//   the gap's own middle line (from 7 m inside the stadium to 39 m outside it), the circuit's usual 14 m wide: both
//   corners about 6 m from the track's edges, the field still inside it on its south side.
export const LOCAL_WIDTHS = {
  65: [{ name: "the stadium's west gap", a: [-173.88, -5.05], b: [-219.95, -0.12], w: 14, ease: 25 }],
  61: [{ name: "Anderson Bridge", a: [-1189.94, -385.95], b: [-1130.98, -434.45], w: 9, ease: 25 }],
};

const smooth = (k) => k * k * (3 - 2 * k);

// samples: [{ p: { x, z }, nor: { x, z }, L, R, M? }] (scene metres; L the edge on the normal's side, R the other, both
// measured from the lap line along the normal); list: LOCAL_WIDTHS entries; toScene([X, Y] feed metres) → [x, z];
// seen(sample) → [R, L] where the field was seen there, or null. Changes L and R (and keeps M between them) of the
// samples in each corridor and its run-outs; returns how many samples it changed.
export function applyLocalWidths(samples, list, toScene, seen = null) {
  let changed = 0;
  for (const W of list || []) {
    if (!W?.a || !W?.b || !(W.w > 0)) continue;
    const A = toScene(W.a), B = toScene(W.b), len = Math.hypot(B[0] - A[0], B[1] - A[1]); if (!(len > 1)) continue;
    const u = [(B[0] - A[0]) / len, (B[1] - A[1]) / len], ease = Math.max(1, W.ease ?? 25), reach = W.reach ?? 20;
    for (const s of samples) {
      const dx = s.p.x - A[0], dz = s.p.z - A[1], t = dx * u[0] + dz * u[1];
      if (t < -ease || t > len + ease) continue;
      // the centre line's offset from the sample, along the sample's own normal (the lap line runs nearly along the corridor)
      const fx = A[0] + u[0] * t - s.p.x, fz = A[1] + u[1] * t - s.p.z;
      if (Math.hypot(fx, fz) > reach) continue;                       // another part of the track passing near the corridor's line
      if (Math.abs(s.nor.x * u[0] + s.nor.z * u[1]) > 0.5) continue;   // …or crossing it
      const d = fx * s.nor.x + fz * s.nor.z;
      const k = t < 0 ? smooth(1 + t / ease) : t > len ? smooth(1 - (t - len) / ease) : 1;
      let L = s.L + (d + W.w / 2 - s.L) * k, R = s.R + (d - W.w / 2 - s.R) * k;
      const f = seen ? seen(s) : null;
      if (f) { L = Math.max(L, f[1]); R = Math.min(R, f[0]); }        // never inside where the field was seen
      s.L = L; s.R = R;
      if (Number.isFinite(s.M)) s.M = Math.max(Math.min(R + 2, (L + R) / 2), Math.min(Math.max(L - 2, (L + R) / 2), s.M));
      changed++;
    }
  }
  return changed;
}
