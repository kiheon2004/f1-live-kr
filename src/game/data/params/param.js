// The PARAM table shape (DESIGN §0.5): every coefficient the engine uses is one entry with its unit, meaning, source,
// plausible range and whether it is a game estimate. The engine itself reads plain numbers (values()), so the hot loop
// never touches the metadata; the screens and the report read the full entries.
//   v       value (SI unless the unit says otherwise)
//   unit    "m/s²", "kg", "1" (dimensionless) …
//   meaning plain English
//   source  URL + date fetched, a calibration record, or "game estimate" (with the reasoning)
//   range   [lo, hi] – what the value may be set to (calibration bounds, sensitivity sweeps)
//   est     true = not a published/measured figure (shown as an estimate on screen)
//   conf    for estimates: "H" | "M" | "L" confidence
export const P = (v, unit, meaning, source, range, est = true, conf = "L") => ({ v, unit, meaning, source, range, est, conf });

// { key: P(...) } → { key: value } (nested tables are walked; arrays of P stay arrays of numbers)
export function values(table) {
  const out = {};
  for (const [k, e] of Object.entries(table)) {
    if (e && typeof e === "object" && "v" in e && "unit" in e) out[k] = e.v;
    else if (e && typeof e === "object" && !Array.isArray(e)) out[k] = values(e);
    else out[k] = e;
  }
  return out;
}

// every entry of a table as a flat list [{ key, ...entry }] – for checks (each has unit/source/range) and the report
export function entries(table, prefix = "") {
  const out = [];
  for (const [k, e] of Object.entries(table)) {
    if (e && typeof e === "object" && "v" in e && "unit" in e) out.push({ key: prefix + k, ...e });
    else if (e && typeof e === "object" && !Array.isArray(e)) out.push(...entries(e, prefix + k + "."));
  }
  return out;
}
