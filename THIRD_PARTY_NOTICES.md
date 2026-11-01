# Third-party notices

The components and data below are not this project's own: each stays under its own license. Where you use them,
their terms apply.

## Bundled in the repository and the app

| Component | Where | License | License text |
|---|---|---|---|
| three.js r186 (and the addons in `vendor/`: OrbitControls, GLTFLoader, BufferGeometryUtils, SkeletonUtils) | `src/renderer/vendor/` | MIT | `src/renderer/vendor/THREE_LICENSE` |
| Pretendard Variable 1.3.9 (font) | `src/renderer/fonts/` | SIL Open Font License 1.1 | `src/renderer/fonts/PRETENDARD-LICENSE.txt` |
| Lucide icons (subset, lucide-static 1.54.0) | `src/renderer/icons.js` | ISC | `src/renderer/ICONS-LICENSE.txt` |
| bacinger/f1-circuits (circuit centre lines, lengths, opening years) | `src/data/f1-circuits.json` | MIT, © Tomislav Bacinger | `src/data/f1-circuits-LICENSE.md` |
| NASA Blue Marble: Next Generation (globe texture) | `src/renderer/assets/earth-bluemarble-200407-4096.jpg` | NASA imagery, public use (see file) | `src/renderer/assets/EARTH-LICENSE.md` |
| ws (WebSocket client) | runtime dependency (`node_modules`) | MIT | in its package |
| Electron (app runtime, in built apps) | `node_modules` / the built app | MIT (Chromium and Node.js components under their own licenses) | in the built app (`LICENSES.chromium.html`) |

## Data derived from or referring to open map data

Parts of the hand-made circuit data in `src/data/` (e.g. grandstand outlines and the map objects they refer to) and the
generated tables in `src/renderer/*data.js` were identified with the help of OpenStreetMap. Where such data is a
substantial extract of the OpenStreetMap database it is © OpenStreetMap contributors and available under the Open Data
Commons Open Database License (ODbL) 1.0 – https://www.openstreetmap.org/copyright – not under this project's terms.

## Fetched at run time (not in the repository)

Map data and imagery the app downloads while running – OpenStreetMap (ODbL), Overture Maps (ODbL / CDLA), Sentinel-2
cloudless by EOX (CC BY-NC-SA 4.0), Mapzen / AWS Terrain Tiles, Open-Meteo (CC BY 4.0), Google Map Tiles (the user's
own key, Google's terms), Jolpica F1 API, MultiViewer circuit API, F1 live timing – stay under their providers' terms.
The app shows their attributions on screen.

## Trademarks

F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP, GRAND PRIX and related marks are trademarks of Formula
One Licensing B.V. Team names and logos belong to their owners. This project is unofficial and not associated with the
Formula 1 companies; no license here grants any right in those marks.
