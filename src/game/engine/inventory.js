// Tyre sets (v0.50 request §5-4): each car has its own sets for the race; the engine, the team AI, the strategy screens and
// the pit-order checks all read the SAME list (car.sets, race state – saved and restored with the race).
//
// No source for the sets each driver really had left on race day is in the data (F1's timing feed has the stints run,
// not the allocation still in hand) – so the allocation is a GAME ASSUMPTION (ALLOC below, est: true), shown as such:
// per driver, of each nominated dry compound 2 new sets (+ 1 used soft from qualifying), 4 new intermediates, 3 new wets.
// It is never presented as the real weekend's inventory.
//
// A set: { id, compound (race name), used, laps, km, wear, state }
//   state  "fitted"   on the car now (its wear/laps are the car's tyre's – read back when it comes off)
//          "free"     in the garage, can be fitted (new, or used and returned)
//          "reserved" promised to the car's standing pit call (call.setId) – fitted when the work ENDS, freed when the call
//                     is cancelled, or the stop ends without a tyre change (stop-and-go, a penalty hold, a red-flag queue)
// One policy for every path: a pit call (player, AI, the plan's own call) reserves; a change of tyre on a standing call
// moves the reservation; the work's end fits the reserved set and returns the old one (free, used, with its wear);
// a cancel or a stop without work frees it. A refused order reserves nothing.
export const ALLOC = {
  est: true,
  source: "게임용 가정 배정 – 실제 주말 재고 자료 없음 (드라이 컴파운드별 새 세트 2개 + 예선에 쓴 소프트 1세트, 인터 4, 웨트 3)",
  sets: { SOFT: [{ n: 2 }, { n: 1, used: { laps: 3, wear: 0.05 } }], MEDIUM: [{ n: 2 }], HARD: [{ n: 2 }], INTERMEDIATE: [{ n: 4 }], WET: [{ n: 3 }] },
};
const LETTER = { SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W" };

// the sets of one car: the event's compounds (names), the start compound fitted (a new set when there is one)
export function newSets(num, names, start) {
  const out = [];
  for (const name of names) {
    const spec = ALLOC.sets[name] || [{ n: 1 }]; let k = 0;
    for (const g of spec) for (let i = 0; i < g.n; i++) out.push({ id: `${num}-${LETTER[name] || name[0]}${++k}`, compound: name, used: !!g.used, laps: g.used?.laps || 0, km: 0, wear: g.used?.wear || 0, state: "free" });
  }
  const s = pickFree(out, start); if (s) s.state = "fitted";
  return out;
}
// the best free set of a compound: new first, then the least worn (ties: the lowest id – deterministic)
export function pickFree(sets, name, setId = null) {
  if (setId != null) { const s = sets.find((x) => x.id === setId); return s && s.state === "free" && s.compound === name ? s : null; }
  let best = null;
  for (const s of sets) if (s.state === "free" && s.compound === name && (!best || (best.used && !s.used) || (best.used === s.used && s.wear < best.wear))) best = s;
  return best;
}
export const stockOf = (car, name, states = ["free"]) => (car.sets || []).filter((s) => s.compound === name && states.includes(s.state)).length;
// sets a plan may still use per compound: free + reserved (the standing call's set is part of the plan's next stint)
export function stockMap(car) { const m = {}; for (const s of car.sets || []) if (s.state === "free" || s.state === "reserved") m[s.compound] = (m[s.compound] || 0) + 1; return m; }

// reserve a set for the car's standing call (call.compound): an explicit setId, else the best free one. Releases a set
// reserved before for this car. { ok, set, why }
export function reserve(car, name, setId = null) {
  if (!car.sets) return { ok: true, set: null };   // (a race without sets: a pre-v0.50 save being migrated)
  const prev = car.sets.find((s) => s.state === "reserved");
  if (prev && prev.compound === name && (setId == null || prev.id === setId)) return { ok: true, set: prev };
  const s = pickFree(car.sets, name, setId);
  if (!s) return { ok: false, why: setId != null ? `set ${setId} not available` : `no set of ${name} left` };
  if (prev) prev.state = "free";
  s.state = "reserved";
  return { ok: true, set: s };
}
// free a reservation that no standing call holds any more
export function releaseStale(car) {
  if (!car.sets) return;
  const keep = car.pit?.call?.setId ?? null;
  for (const s of car.sets) if (s.state === "reserved" && s.id !== keep) s.state = "free";
}
// The one check every fitting path uses (v0.52 §3 – the red-flag change skipped it): the set to fit for compound `name`
// – the named one (it must be THIS car's, of that compound, free or reserved by this car's call), else this car's set
// reserved for that compound, else its best free one. { ok, set } or { ok: false, why }. Reads only.
export function canFit(car, name, setId = null) {
  if (!car.sets) return { ok: false, why: "no tyre sets" };
  if (setId != null) {
    const s = car.sets.find((x) => x.id === setId);
    if (!s) return { ok: false, why: `set ${setId} not available` };   // (another car's id, or none: not in this car's list)
    if (s.compound !== name) return { ok: false, why: `set ${setId} is ${s.compound}, not ${name}` };
    if (s.state !== "free" && s.state !== "reserved") return { ok: false, why: `set ${setId} not available` };
    return { ok: true, set: s };
  }
  const s = car.sets.find((x) => x.state === "reserved" && x.compound === name) || pickFree(car.sets, name);
  return s ? { ok: true, set: s } : { ok: false, why: `no set of ${name} left` };
}
// the work is over (or the red-flag change is made): the set canFit names goes on, the old one comes back to the garage
// with what it has run. ATOMIC: when no set can be fitted nothing changes (no set handed back, no tyre made) and
// { ok: false, why } is returned – the caller keeps the car's tyre. make(set) → the tyre object for that set.
export function fit(car, name, setId, make) {
  const c = canFit(car, name, setId); if (!c.ok) return c;
  const s = c.set, old = car.sets.find((x) => x.state === "fitted");
  const tyre = make(s);
  if (old) { old.state = "free"; old.used = true; old.laps = car.tyre.laps; old.km = +car.tyre.km.toFixed(2); old.wear = +car.tyre.wear.toFixed(4); }
  s.state = "fitted";
  return { ok: true, tyre, set: s };
}
// the invariant (tests, migration checks): a car with sets has exactly one fitted set, the tyre names it, compounds agree
export function checkSets(car) {
  if (!car.sets) return { ok: true, problems: [] };
  const f = car.sets.filter((x) => x.state === "fitted"), p = [];
  if (f.length !== 1) p.push(`${f.length} fitted sets`);
  else { if (car.tyre?.setId !== f[0].id) p.push(`tyre set ${car.tyre?.setId} ≠ fitted ${f[0].id}`); if (car.tyre?.name !== f[0].compound) p.push(`tyre ${car.tyre?.name} ≠ set ${f[0].compound}`); }
  for (const x of car.sets) if (!String(x.id).startsWith(car.num + "-")) p.push(`foreign set ${x.id}`);
  return { ok: !p.length, problems: p };
}
// a save from before v0.50 has no sets: the assumed allocation, less one set per stint already run (used, with the
// stint's last known wear), the current tyre fitted
export function migrateSets(car, names) {
  const sets = newSets(car.num, names, null);
  const stints = []; let prev = null;
  for (const l of car.laps || []) { const last = stints[stints.length - 1]; if (last && !prev?.pit && last.compound === l.compound) { last.laps++; last.wear = l.wear; } else stints.push({ compound: l.compound, laps: 1, wear: l.wear }); prev = l; }
  for (const st of stints.slice(0, -1)) { const s = pickFree(sets, st.compound); if (s) { s.used = true; s.laps = st.laps; s.wear = st.wear ?? 0.3; } }
  const cur = pickFree(sets, car.tyre?.name); if (cur) { cur.state = "fitted"; if (car.tyre) car.tyre.setId = cur.id; }
  return sets;
}
