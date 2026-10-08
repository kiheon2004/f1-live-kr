# Facility model files

Self-contained GLB files (glTF 2.0 binary, buffers and images embedded) for `src/renderer/facilities.js`.
They are read through the main process (`geo:model`), so they work inside the packaged app (app.asar).

- File names: lower case letters, digits, `-` / `_`, ending in `.glb` (at most 64 MB).
- Register a model in `FACILITIES` with `model: { file, anchor: [lat, lon], heading, units, scale, origin, ground, lift }`
  and `replaces: { names, within }` (see the comments in facilities.js). Record its source and licence in `sources`.
- A model that is missing or fails to load leaves the map's own buildings (or the entry's builder) in place.

No model files are shipped at the moment: the facilities are built from map data and published facts.
