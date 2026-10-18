// Marshal posts and their flags from the session's own data (pure; map3d.js places and draws them).
// Research: docs/research/marshals.md, flags.md (FIA Appendix H 2026; F1 Sporting Regulations 2025 / 2026).
//
// Where: the FIA circuit map's posts and light panels (marshaldata.js). Which marshalling sector a post is in: the light
// panel at or before it along the lap – race control's "Sector n" is the stretch from panel n to panel n+1 (2025 Art.
// 55.7 / 56.4, 2026 B4.1.4) – not one of the three timing sectors.
// What: race control's flag messages as the session has them at the moment shown (src.messages – the replay's state at
// that moment; live: as delayed) and TrackStatus:
//   - Scope "Sector", Flag YELLOW / DOUBLE YELLOW: that sector's posts wave it (F1 applies yellows per marshalling sector,
//     2026 B1.8.4); CLEAR: withdrawn. The first post after a yellow sector waves green (App. H 2.5.5 g: green at the post
//     after the incident) – unless that sector is yellow too.
//   - Scope "Track", Flag CLEAR ("TRACK CLEAR"): every sector's flags withdrawn. Flag GREEN with scope Track is the pit
//     exit's light ("GREEN LIGHT - PIT EXIT OPEN"), not a flag round the track: ignored here.
//   - TrackStatus 5 (red): every post waves red. 4 (safety car): every post a single yellow (with the SC board), double
//     where race control has a sector double. 6 / 7 (VSC): the F1 rules only light the panels "VSC" – no flag is made up.
//   - Scope "Driver" (blue, black and white …): one car's – not shown at the posts.
// A global yellow with no sector (TrackStatus 2 alone) is not shown at any post: where it is isn't known.

// The messages' flag events in their order: [{ scope, sector, flag }]
export function flagEvents(messages = []) {
  const out = [];
  for (const m of messages) {
    if (!m || m.Category !== "Flag") continue;
    const flag = String(m.Flag || "").toUpperCase(), scope = m.Scope || null;
    out.push({ scope, sector: m.Sector != null ? +m.Sector : null, flag });
  }
  return out;
}
// The flags in force: { red, sc, vsc, sectors: Map(n → "YELLOW" | "DOUBLE YELLOW") }
export function flagState(messages = [], status = null) {
  const sectors = new Map();
  for (const e of flagEvents(messages)) {
    if (e.scope === "Sector" && e.sector != null) {
      if (e.flag === "YELLOW" || e.flag === "DOUBLE YELLOW") sectors.set(e.sector, e.flag);
      else if (e.flag === "CLEAR" || e.flag === "GREEN") sectors.delete(e.sector);
    } else if (e.scope === "Track" && e.flag === "CLEAR") sectors.clear();
  }
  return { red: status === "5", sc: status === "4", vsc: status === "6" || status === "7", vscDeployed: status === "6", sectors };
}

// Posts and panels in lap order: items [{ id, i }] with i their sample index along the lap (n samples) → each post's
// sector: the panel at or before it (cyclic). panels: [{ n, i }]
export function sectorOf(postI, panels, n) {
  if (!panels.length) return null;
  let best = null, bd = Infinity;
  for (const p of panels) { const d = ((postI - p.i) % n + n) % n; if (d < bd) { bd = d; best = p; } }
  return best ? +best.n : null;
}
// The marshalling map of the circuit – from the FIA map's data alone, every panel and post at its point on the lap (i of
// N samples), never from which of them could be drawn (v0.38: a panel left undrawn – no barrier found – moved its posts
// into the sector before; a post that can't be stood somewhere is still in its sector).
// A panel number on the map twice (Lusail 2025 "8", Madring 2026 "6": the same signal shown twice – "both panels mirror
// each other", Lusail stewards' doc 4, 27 Nov 2025) starts its sector once – at the copy that comes first after the panel
// before it – the other copy is a mirror: lit as the sector, no boundary.
//   panels [{ n, i }] · posts [{ id, i }] → { bounds: [{ n, i }] (lap order), mirrors: [{ n, i }], sectorOf(i),
//   prevOf(n), posts: [{ id, i, sector, prev, first }] }
export function marshalMap(panels = [], posts = [], N = 1) {
  const fwd = (from, to) => ((to - from) % N + N) % N;
  const byN = new Map();
  for (const p of panels) { if (p == null || !Number.isFinite(+p.n) || !Number.isFinite(p.i)) continue; const n = +p.n; if (!byN.has(n)) byN.set(n, []); byN.get(n).push({ n, i: p.i }); }
  const nums = [...byN.keys()].sort((a, b) => a - b), bounds = [], mirrors = [];
  for (const [k, n] of nums.entries()) {
    const at = byN.get(n);
    if (at.length === 1) { bounds.push(at[0]); continue; }
    // (the copy nearest after the panel numbered before it – any copy of that one)
    const prev = byN.get(nums[(k - 1 + nums.length) % nums.length]) || [];
    const score = (q) => prev.length && nums.length > 1 ? Math.min(...prev.map((r) => fwd(r.i, q.i))) : q.i;
    const sorted = [...at].sort((a, b) => score(a) - score(b));
    bounds.push(sorted[0]); mirrors.push(...sorted.slice(1));
  }
  bounds.sort((a, b) => a.i - b.i);
  const sector = (i) => sectorOf(i, bounds, N);
  const prevOf = (n) => { const k = bounds.findIndex((b) => b.n === n); return k < 0 || bounds.length < 2 ? null : bounds[(k - 1 + bounds.length) % bounds.length].n; };
  const out = posts.filter((p) => p && Number.isFinite(p.i)).map((p) => ({ id: p.id, i: p.i, sector: sector(p.i) }));
  for (const p of out) p.prev = p.sector != null ? prevOf(p.sector) : null;
  // the first post of each sector (the green goes there): the nearest after its panel
  const first = new Map();
  for (const p of out) { if (p.sector == null) continue; const b = bounds.find((q) => q.n === p.sector), d = fwd(b.i, p.i), f = first.get(p.sector); if (!f || d < f.d) first.set(p.sector, { p, d }); }
  for (const { p } of first.values()) p.first = true;
  return { bounds, mirrors, sectorOf: sector, prevOf, posts: out };
}
// What a post shows: "red" | "yellow" | "double" | "green" | null (flags furled). post: { sector }; next: the sector
// after the post's (by the panels' order); first: is it the first post of its sector (the green goes there)
export function postSignal(post, state, prevSector = null) {
  if (state.red) return "red";
  const here = state.sectors.get(post.sector);
  if (here === "DOUBLE YELLOW") return "double";
  if (here === "YELLOW" || state.sc) return "yellow";
  if (post.first && prevSector != null && state.sectors.has(prevSector)) return "green";
  return null;
}

// What a light panel shows (FIA light panels, F1 Sporting Regulations 2025 Art. 55.4 / 56.2 / 56.7, 2026 B5.12 / B5.13;
// docs/research/flags.md): one signal at a time –
//   red: TrackStatus 5 · "SC": every panel while the safety car is out (TrackStatus 4) · "VSC": every panel during a VSC
//   (6, and 7 – "VSC ENDING" – until the panels go green "10–15 s" later: 12 s here, an estimate) · green: every panel for
//   30 s after that (2025 Art. 56.7: then dark) · "double" / "yellow": its own sector's double / single yellow · null: dark.
// vscEnd: { t (ms), since } – when TrackStatus turned 7 (null: not known – then no green is made up); t: the moment shown
export const PANEL = { vscGreenAfter: 12000, vscGreenFor: 30000 };
export function panelSignal(n, state, { t = 0, vscEnd = null } = {}) {
  if (state.red) return "red";
  if (state.sc) return "sc";
  if (state.vscDeployed) return "vsc";
  // (after "VSC ENDING": "VSC" until the panels turn green, green for 30 s – also once the status is back to green –, then
  // dark; the ending's time not known: "VSC" while the status says so, nothing made up after. The 12 s is an estimate:
  // a real change seen first – the status back to green – ends the "VSC" at once. v0.39: a yellow / double yellow in
  // force in the panel's own sector is never covered by that green – the green is the VSC's end, not the sector's)
  const here = state.sectors.get(n), local = here === "DOUBLE YELLOW" ? "double" : here === "YELLOW" ? "yellow" : null;
  const since = vscEnd != null && t >= vscEnd ? t - vscEnd : null;
  if (since != null && since < PANEL.vscGreenAfter && state.vsc) return "vsc";
  if (local) return local;
  if (since != null && since < PANEL.vscGreenAfter + PANEL.vscGreenFor) return "green";
  if (state.vsc && since == null) return "vsc";
  return null;
}
// When the VSC ending in force at t began: the last change of TrackStatus to "7" straight from "6", at or before t (null:
// none, or a safety car / red / new VSC since). changes: [[ms, status]] in time order, one per change
export function vscEndOf(changes, t) {
  let end = null, prev = null;
  for (const [m, s] of changes) { if (m > t) break; if (s === "7" && prev === "6") end = m; else if (s === "6" || s === "4" || s === "5") end = null; prev = s; }
  return end;
}
