# Facility model files

Self-contained GLB files (glTF 2.0 binary, buffers and images embedded) for `src/renderer/facilities.js` and
`src/renderer/stands.js`. They are read through the main process (`geo:model`), so they work inside the packaged app
(app.asar).

- File names: lower case letters, digits, `-` / `_`, ending in `.glb` (at most 64 MB).
- A whole facility: register it in `FACILITIES` with `model: { file, anchor: [lat, lon], heading, units, scale, origin, ground, lift }`
  and `replaces: { names, within }` (see the comments in facilities.js).
- A pit building's upper storeys over the builder's own garages: `upper: { file, garageTop, front, length, depth }` on a
  `builder: "pitBuilding"` entry (model axes: +Z into the building from the garage fronts, +X along it, origin on the
  ground at the plan's middle).
- A listed grandstand's own model: `"model": { "file", "from", "frontAt", "frontFromEdge" }` on its entry in
  `src/data/grandstands.json` (model axes: +Z towards the track, origin on the ground at the plan's middle).
- Record each file's source and licence in the entry (`sources` / `src`) and below.
- A model that is missing or fails to load leaves what the app builds itself in place.

## Files

| File | What | Source |
|---|---|---|
| `hun_stand_b.glb` (3.0 MB, 70,508 triangles) | Hungaroring main grandstand (2025) | made for this app, 2026-11-12: published figures (10,296 seats, 9,600 m² roof) and the builder's published photos compared by eye – nothing copied, no outside asset, no logo or lettering |
| `hun_pit_upper.glb` (0.4 MB, 8,936 triangles) | Hungaroring paddock building (2025), the storeys over the garages | the same |
