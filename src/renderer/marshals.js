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
  return { red: status === "5", sc: status === "4", vsc: status === "6" || status === "7", sectors };
}

// Posts and panels in lap order: items [{ id, i }] with i their sample index along the lap (n samples) → each post's
// sector: the panel at or before it (cyclic). panels: [{ n, i }]
export function sectorOf(postI, panels, n) {
  if (!panels.length) return null;
  let best = null, bd = Infinity;
  for (const p of panels) { const d = ((postI - p.i) % n + n) % n; if (d < bd) { bd = d; best = p; } }
  return best ? +best.n : null;
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
