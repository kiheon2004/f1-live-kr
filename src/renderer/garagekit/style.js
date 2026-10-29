// A team's garage interior style (v0.49 garage kit): the wall lining the circuit garages already use (garages.js
// garageStyle – light or dark base, the team colour as a band, the panels' joint spacing) plus the choices the interior
// kit makes per team – floor tone, which equipment goes where, the bench, the ceiling's light pattern, the boom.
//
// Why: every team builds its garage from the same kind of modular parts (cabinets, racks, gantries – research in
// reports/kit.md), but no two look like one room recoloured. The choices here come from the team's key through a small
// seeded generator, so a team's room is the same every time (deterministic: no Math.random) and two teams differ in more
// than colour. Nothing here is a team's real layout – no source per team was found; it is a styling estimate.
import { garageStyle } from "../garages.js";
import { teamKey } from "../pitorder.js";

// FNV-1a over the string; mulberry32 from it – small, fast and the same on every machine
export const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
export function shuffle(r, list) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// a colour as "#rrggbb" (the feed gives "FF8000" or "#FF8000"); anything else → grey
export const hex = (c) => { const s = String(c ?? "").trim().replace(/^#/, ""); return /^[0-9a-f]{6}$/i.test(s) ? "#" + s.toLowerCase() : /^[0-9a-f]{3}$/i.test(s) ? "#" + s.split("").map((x) => x + x).join("").toLowerCase() : "#8a9096"; };
export const lum = (c) => { const n = parseInt(hex(c).slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
export const mix = (a, b, t) => { const p = parseInt(hex(a).slice(1), 16), q = parseInt(hex(b).slice(1), 16), f = (s) => Math.round(((p >> s) & 255) * (1 - t) + ((q >> s) & 255) * t); return "#" + [16, 8, 0].map((s) => f(s).toString(16).padStart(2, "0")).join(""); };

// Painted garage floors: epoxy greys (light to graphite). The floor is poured or painted fresh for each event and chosen
// to show stray fasteners and drips (motorsport.com, Red Bull – reports/kit.md); the tones are estimates.
export const FLOOR_TONES = ["#a4a7aa", "#8c9094", "#99948c", "#56595d", "#b9bab8"];
// side-wall equipment the planner may place (garagekit/layout.js MODULES), shuffled per team
export const SIDE_KINDS = ["cabinet", "tallCab", "tyreRack", "trolley", "guns", "cooling", "wingStand", "bins"];

// style for a team: { key, name, colour, accent, wall (garages.js lining), floor, dark, order: [left side, right side],
// bench: { monitors, kind }, lights: "along" | "across", boom: "single" | "twin", drawer: "accent" | "steel" | "light",
// blanket: "accent" | "black", seed, from }. season only labels it (the layout is the team's, kept across seasons).
export function teamGarageStyle(team, colour, opts = {}) {
  const key = teamKey(team) || String(team || "team"), seed = hashStr("kit:" + key), r = rng(seed);
  const wall = garageStyle(team), accent = hex(colour);
  // (a near-black or near-white team colour as the only accent disappears on a dark or light wall: lift or deepen it a
  // little – the accent is the team's colour, not a new one)
  const acc = wall.dark && lum(accent) < 0.18 ? mix(accent, "#ffffff", 0.25) : !wall.dark && lum(accent) > 0.9 ? mix(accent, "#000000", 0.2) : accent;
  const floor = wall.dark ? pick(r, ["#5b5f63", "#7a7e82", "#9da1a5"]) : pick(r, FLOOR_TONES);
  const kinds = shuffle(r, SIDE_KINDS), half = Math.ceil(kinds.length / 2);
  return {
    key, name: String(team || key), colour: accent, accent: acc, wall, dark: !!wall.dark, floor, seed, season: opts.season ?? null,
    order: [kinds.slice(0, half), kinds.slice(half)],
    bench: { monitors: 2 + Math.floor(r() * 3), kind: pick(r, ["bench", "desk", "bench"]) },
    lights: pick(r, ["along", "across"]), boom: pick(r, ["single", "twin"]),
    drawer: pick(r, ["accent", "steel", "light", "steel"]), blanket: pick(r, ["tinted", "black", "tinted"]),
    cabinetTone: wall.dark ? pick(r, ["#2a2d31", "#3a3e43"]) : pick(r, ["#2a2d31", "#d9dcdf", "#4a4f55"]),
    signage: pick(r, ["back", "side", "back"]),
    from: wall.from === "estimate" ? "estimate (team key → seeded choices)" : `wall: ${wall.from}; rest estimate`,
  };
}
