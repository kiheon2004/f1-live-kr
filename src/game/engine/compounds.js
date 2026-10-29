// The tyres a team may fit at this event – ONE answer for the engine (which C-number a race name is), the team AI's
// estimator and the screens (request v0.49 §5). Pure.
//
// Known before the race: Pirelli's nomination for the event (data/tyres/nominations.js – which C-number is HARD / MEDIUM /
// SOFT; est false) and the two wet tyres every event has (INTERMEDIATE, WET). Missing nomination: S/M/H mapped to the
// commonly used C2/C3/C4 – est true, said so. NOT used: the compounds the real race happened to use
// (scenario.tyres.compoundsSeen) – that is what happened, not what was available (a dry race still had wet tyres).
// Limit (v0.49, stated wherever this is shown): no set inventory – every set fitted is new and there is no count of sets.
import NOMINATIONS from "../data/tyres/nominations.js";
import { DEFAULT_ALLOCATION } from "../data/params/tyres.js";

export const DRY_NAMES = ["SOFT", "MEDIUM", "HARD"];
export const WET_NAMES = ["INTERMEDIATE", "WET"];

// the nomination's key from a scenario id ("2025-08-03_Hungarian_Grand_Prix_2025-08-03_Race" → "2025-08-03_Hungarian_Grand_Prix")
export const nominationKey = (id) => String(id || "").replace(/_\d{4}-\d{2}-\d{2}_Race$/, "");

// → { list: [{ name, code, kind: "dry"|"inter"|"wet" }], dry: [names], wet: [names], alloc: { NAME: code }, est, source,
//     inventory: false }
export function availableCompounds(scenario) {
  const nom = NOMINATIONS.races[nominationKey(scenario?.meta?.id)];
  const alloc = nom ? { HARD: nom.H, MEDIUM: nom.M, SOFT: nom.S } : { HARD: DEFAULT_ALLOCATION.HARD, MEDIUM: DEFAULT_ALLOCATION.MEDIUM, SOFT: DEFAULT_ALLOCATION.SOFT };
  alloc.INTERMEDIATE = "INTERMEDIATE"; alloc.WET = "WET";
  const list = [...DRY_NAMES.map((name) => ({ name, code: alloc[name], kind: "dry" })), { name: "INTERMEDIATE", code: "INTERMEDIATE", kind: "inter" }, { name: "WET", code: "WET", kind: "wet" }];
  return { list, dry: DRY_NAMES.slice(), wet: WET_NAMES.slice(), alloc, est: !nom,
    source: nom ? `Pirelli nomination (research data, accessed ${NOMINATIONS.accessed})` : "no nomination in the research data: S/M/H = C4/C3/C2 assumed (est)",
    inventory: false };
}
export const isCompound = (scenario, name) => availableCompounds(scenario).list.some((c) => c.name === name);
