// What the race computation depends on, identified (v0.52 §7). Four separate things:
//   APP        the app's version (package.json) – the screens; not known here
//   STATE      the save format (engine.js STATE_VERSION) – whether a save can be read at all
//   ENGINE     the model's code version (engine.js ENGINE_VERSION) – raised by hand when the computation changes
//   PARAMS     a fingerprint of every coefficient and rule table the model reads (this file: FNV-1a over the JSON of
//              each params / rules module's exported data, in name order) – any change of a number changes it
// A scenario has its own content fingerprint (renderer saveui.js scenarioPrint). Saves and results carry ENGINE and
// PARAMS; a save from another model can still be continued when its format matches, and the screens say so.
import * as AIp from "./ai.js";
import * as CARS25 from "./cars-2025.js";
import * as CARS26 from "./cars-2026.js";
import * as CARSB from "./cars-base.js";
import * as CTLp from "./control.js";
import * as DRV from "./drivers.js";
import * as ENG from "./energy.js";
import * as INC from "./incidents.js";
import * as PHY from "./physics.js";
import * as PITp from "./pit.js";
import * as STW from "./stewards.js";
import * as TRF from "./traffic.js";
import * as TYR from "./tyres.js";
import * as WTH from "./weather.js";
import R2024 from "../rules/2024.js";
import R2025 from "../rules/2025.js";
import R2026 from "../rules/2026.js";

export const PARAMS_LABEL = "0.52.0-params.1";   // (raised by hand with a deliberate tuning round; the hash is the check)
const MODS = { ai: AIp, cars2025: CARS25, cars2026: CARS26, carsBase: CARSB, control: CTLp, drivers: DRV, energy: ENG, incidents: INC, physics: PHY, pit: PITp, stewards: STW, traffic: TRF, tyres: TYR, weather: WTH, rules2024: R2024, rules2025: R2025, rules2026: R2026 };
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : typeof x === "function" ? undefined : x));
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }
export const PARAMS_HASH = fnv(Object.keys(MODS).sort().map((k) => k + ":" + stable(MODS[k])).join("|"));
export const PARAMS_VERSION = `${PARAMS_LABEL}+${PARAMS_HASH}`;
