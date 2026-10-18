// The covered stretches of the lap (tunnel.js – Monaco's tunnel): placed along the track's own samples and edges, the
// roofed footprint, the map buildings over it picked (and only those), the light mask, the meshes, and the chase camera
// kept under the ceiling inside.
const test = require("node:test");
const assert = require("node:assert");

// A lap: a circle of radius 320 m driven clockwise seen from above (x east, z south) – a steady right-hander, as the
// tunnel is – samples 2 m apart, the road 5 m each side of the line (L right, R left, as map3d measures them).
async function lap(R = 320, half = 5, y = (th) => 0) {
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const n = Math.round((2 * Math.PI * R) / 2), out = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * 2 * Math.PI, p = new THREE.Vector3(R * Math.cos(th), y(th), R * Math.sin(th));
    const tan = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th)), nor = new THREE.Vector3(-tan.z, 0, tan.x);   // right of travel
    out.push({ i, p, tan, nor, L: half, R: -half });
  }
  return out;
}
const along = (S, i) => [S[i].p.x, S[i].p.z];
const SPEC = { id: "t", entry: null, exit: null, len: 362, sea: "left", height: 4.4, slab: 1.3, wall: 0.6, inland: { walk: 0.9 }, seaWall: 0.9,
  colonnade: { from: 0, to: 125, walk: 2.4, pitch: 7, size: 0.9, beam: 0.6 }, fence: { from: 115, to: 255, h: 3.6, cams: [150] }, lamps: { pitch: 3.5 }, exitBeam: 0.35 };

test("tunnel: the stretch between its two mouths, in race order, along the lap's own samples", async () => {
  const { lapStretch } = await import("../src/renderer/tunnel.js");
  const S = await lap();
  const st = lapStretch(S, along(S, 100), along(S, 281), 362);
  assert.ok(st && Math.abs(st.len - 362) < 2, `≈ 362 m (${st?.len})`);
  assert.strictEqual(st.idx[0], 100); assert.strictEqual(st.idx[st.idx.length - 1], 281);
  // the wrong way round (exit before entry): more than half a lap forward – not placed
  assert.strictEqual(lapStretch(S, along(S, 281), along(S, 100), 362), null);
  // a fit far off the length the data gives (a bad match) – not placed; a point far from the track – not placed
  assert.strictEqual(lapStretch(S, along(S, 100), along(S, 140), 362), null);
  assert.strictEqual(lapStretch(S, [5000, 5000], along(S, 281), 362), null);
  // across the lap's start (indices wrapping round)
  const w = lapStretch(S, along(S, S.length - 50), along(S, 131), 362);
  assert.ok(w && Math.abs(w.len - 362) < 2 && w.idx.length === 182);
});

test("tunnel: stations – walls beyond the drawn edges, the sea side on the outside of the curve, colonnade then solid wall, ceiling over the road", async () => {
  const { lapStretch, tunnelStations, at, tunnelFootprint, inPoly } = await import("../src/renderer/tunnel.js");
  // a road falling 1.5 % along the lap, wider on the left in places (the walls follow the drawn edges, never inside them)
  const S = await lap(320, 5, (th) => -0.015 * th * 320);
  for (const s of S) if (s.i > 150 && s.i < 170) s.R = -6.5;
  const st = lapStretch(S, along(S, 100), along(S, 281), 362), ST = tunnelStations(S, st, SPEC, 0.06);
  assert.strictEqual(ST.length, 182);
  for (const x of ST) {
    assert.ok(Math.abs(x.ceil - x.y - 4.4) < 1e-9 && Math.abs(x.top - x.ceil - 1.3) < 1e-9, "ceiling 4.4 m over the floor, slab 1.3 m");
    assert.ok(Math.abs(x.y - (S[x.i].p.y + 0.06)) < 1e-9, "the floor is the drawn road's height (not lowered)");
    assert.ok(x.seaIn > x.sea && x.hillIn > x.hill && x.seaOut > x.seaIn && x.hillOut > x.hillIn);
    // the sea side (driver's left) is the outside of this right-hander: further from the circle's centre
    const p = at(x, x.seaIn, 0), q = at(x, -x.hillIn, 0);
    assert.ok(Math.hypot(p[0], p[2]) > 320 + x.sea && Math.hypot(q[0], q[2]) < 320 - x.hill);
    assert.strictEqual(x.colon, x.s < 125, `colonnade for the first 125 m only (s ${x.s.toFixed(1)})`);
    if (x.colon) assert.ok(Math.abs(x.seaIn - x.sea - 2.7) < 1e-9, "pillar line behind the pavement");
    else assert.ok(Math.abs(x.seaIn - x.sea - 0.9) < 1e-9);
  }
  // where the road is drawn wider, the wall stands beyond that edge
  for (const x of ST) if (x.i > 152 && x.i < 168) assert.ok(x.sea >= 6.5 - 1e-6, `edge kept (${x.sea.toFixed(2)})`);
  const foot = tunnelFootprint(ST);
  assert.ok(ST.slice(1, -1).every((x) => inPoly(x.x, x.z, foot)), "the road inside the footprint (the end stations lie on its mouth lines)");
  const mid = ST[90], out = at(mid, mid.seaOut + 3, 0);
  assert.ok(!inPoly(out[0], out[2], foot), "3 m beyond the outer face: outside");
});

test("tunnel: the map buildings over it – only those sharing enough of the roofed footprint", async () => {
  const { lapStretch, tunnelStations, tunnelFootprint, buildingsOver, at } = await import("../src/renderer/tunnel.js");
  const S = await lap(), ST = tunnelStations(S, lapStretch(S, along(S, 100), along(S, 281), 362), SPEC), foot = tunnelFootprint(ST);
  const rect = (st, o0, o1, a0, a1) => [[o0, a0], [o1, a0], [o1, a1], [o0, a1]].map(([o, a]) => { const p = at(st, o, 0); return [p[0] + st.tx * a, p[2] + st.tz * a]; });
  const mid = ST[60];
  const hotel = { ref: "hotel", pts: rect(mid, -40, 25, -60, 60) };              // across the tunnel: over it
  const beside = { ref: "beside", pts: rect(mid, mid.seaOut + 0.5, mid.seaOut + 30, -30, 30) };   // next to the sea wall
  const touch = { ref: "touch", pts: rect(mid, mid.seaOut - 0.4, mid.seaOut + 30, -30, 30) };     // its wall line only
  const far = { ref: "far", pts: rect(ST[0], 60, 90, -200, -170) };
  const got = buildingsOver([hotel, beside, touch, far], foot);
  assert.deepStrictEqual(got.map((g) => g.ref), ["hotel"]);
  assert.ok(got[0].overlap > 120 * 9 && got[0].share > 0.2, JSON.stringify(got[0]));
});

test("tunnel: the light mask – covered between the inner faces, eased in from each mouth, the colonnade's daylight, the ceiling's height", async () => {
  const { lapStretch, tunnelStations, tunnelMask, at } = await import("../src/renderer/tunnel.js");
  const S = await lap(), ST = tunnelStations(S, lapStretch(S, along(S, 100), along(S, 281), 362), SPEC);
  const M = tunnelMask(ST, { mpp: 0.5 });
  const px = (x, z) => { const i = Math.floor((x - M.ext.x0) / 0.5), j = Math.floor((z - M.ext.z0) / 0.5), o = (j * M.W + i) * 4; return [M.data[o], M.data[o + 1], M.data[o + 2], M.data[o + 3]]; };
  const deep = ST[90], mouth = ST[0], last = ST[ST.length - 1];
  let v = px(deep.x, deep.z);
  assert.ok(v[0] > 0.99 && Math.abs(v[1] - deep.ceil) < 0.01 && v[2] === 0 && v[3] > 0.7, `deep inside ${v}`);
  v = px(mouth.x - mouth.tx * 6, mouth.z - mouth.tz * 6); assert.ok(v[0] === 0, "6 m before the entry: open");
  v = px(last.x + last.tx * 6, last.z + last.tz * 6); assert.ok(v[0] === 0, "6 m past the exit: open");
  v = px(ST[2].x, ST[2].z); assert.ok(v[0] > 0 && v[0] < 0.6, `4 m in: still some daylight (${v[0]})`);
  const c = ST[40], pp = at(c, c.seaIn - 0.5, 0); v = px(pp[0], pp[2]);
  assert.ok(v[0] > 0.99 && v[2] > 0.2, `by the pillars: covered, daylight through them (${v})`);
  const o = at(deep, deep.seaOut + 2, 0); v = px(o[0], o[2]); assert.ok(v[0] === 0, "outside the walls: not covered");
});

// a minimal canvas for the tile texture (node has no DOM)
function fakeDocument() {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  return { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

test("tunnel: planned at a venue – the building over it raised to the slab's top with its storeys, the meshes, the chase camera kept under the ceiling", async () => {
  globalThis.document ??= fakeDocument();
  const THREE = await import("../src/renderer/vendor/three.module.js");
  const T = await import("../src/renderer/tunnel.js"), { chasePlace } = await import("../src/renderer/los.js"), { disposeGroup } = await import("../src/renderer/dispose.js");
  const S = await lap();
  // a geo frame: "lat/lon" are scene x/z here
  const geo = { fromLL: (a, b) => [a, b], xz: (p) => p };
  T.TUNNELS[9999] = [{ ...SPEC, entry: along(S, 100), exit: along(S, 281), above: [{ at: along(S, 150), storeys: 7, storey: 3.1, cls: "hotel" }] }];
  try {
    const st = S[150], o = (k, a) => [st.p.x + st.nor.x * k + st.tan.x * a, st.p.z + st.nor.z * k + st.tan.z * a];
    const hotel = { kind: "block", h: 9.6, lv: 3, pts: [o(-30, -50), o(-30, 50), o(40, 50), o(40, -50)] };
    const other = { kind: "block", h: 12, pts: [o(30, -20), o(30, 20), o(60, 20), o(60, -20)] };        // inland, clear of it
    const plan = T.planTunnels({ venueKey: 9999, samples: S, geo, buildings: [hotel, other] });
    assert.strictEqual(plan.list.length, 1);
    assert.ok(plan.raise.has(hotel) && !plan.raise.has(other), "only the one over the tunnel");
    const up = plan.raise.get(hotel), ST = plan.list[0].stations;
    const tops = ST.filter((x) => Math.abs(x.s - 100) < 60).map((x) => x.top);
    assert.ok(Math.abs(up.y0 - Math.max(...tops)) < 0.5, `from the slab's top (${up.y0})`);
    assert.ok(Math.abs(up.y1 - up.y0 - 7 * 3.1) < 1e-9 && up.storeys === 7 && up.cls === "hotel", "7 floors over the podium (the hint), not the map's 3");
    assert.ok(plan.inside(st.p.x, st.p.z) && !plan.inside(...o(-80, 0)));
    assert.ok(T.TUNNELS[22]?.length && T.tunnelsFor(22)[0].id === "louis-ii" && T.tunnelsFor(1).length === 0);

    const built = T.buildTunnels(plan, () => -0.35);
    assert.ok(built.group.children.length >= 4 && built.occluders.length === 3, "concrete, tiles, metal, fence, lamps; walls, slab, blocks as occluders");
    assert.ok(built.mask.tex.image.width > 100 && built.mask.ext.z > 100);
    built.group.updateMatrixWorld(true);
    // the chase camera behind a car in the tunnel: under the ceiling, never above the slab (los.js against the meshes)
    for (const k of [40, 90, 150]) {
      const s = ST[k], head = new THREE.Vector3(s.x, s.y + 1.1, s.z), az = Math.atan2(s.tx, s.tz) + Math.PI;
      const p = chasePlace(built.occluders, head, az, Math.atan2(2.4, 10.5), Math.hypot(2.4, 10.5), { groundAt: () => s.y - 0.4, room: 0.35 });
      assert.ok(p.safe && p.pos.y < s.ceil - 0.3 && p.pos.y > s.y + 1.4, `station ${k}: camera at ${p.pos.y.toFixed(2)} (ceiling ${s.ceil.toFixed(2)})`);
      assert.ok(p.pos.distanceTo(head) > 5, `and well back from the car (${p.pos.distanceTo(head).toFixed(1)} m)`);
    }
    // freed with its group: the mask too (onDispose), each geometry/material once
    let freed = 0; built.mask.tex.addEventListener("dispose", () => freed++);
    disposeGroup(built.group);
    assert.strictEqual(freed, 1);
  } finally { delete T.TUNNELS[9999]; }
});
