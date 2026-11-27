# LiveTimingKR design system (v0.50 structure · v0.71 look)

One look for the three areas of the app – **live timing** (timing screen + season globe home), the **3D spectator
view** (HUD over the circuit) and the **strategy game** – with the same font, icons, colour meanings, units, buttons and
selection rules. Layout and interaction were informed by public material of Nitrous (live timing), ReHUD (HUD) and
F1 Manager 2024 (race operations); **no code, image, icon, font or colour set was taken from them**
(see `~/projects/f1kr-work/v050/research/refs.md`).

Files:

| File | What |
|---|---|
| `src/renderer/css/tokens.css` | design tokens (custom properties), the font face, base element rules |
| `src/renderer/css/components.css` | shared components, class prefix `ui-` |
| `src/renderer/css/live.css` | live area layout (timing screen, panels, player, drawers, globe home) |
| `src/renderer/css/spectator.css` | 3D view HUD (`#map3d …`) – spectator area |
| `src/renderer/css/game.css` | strategy game (`#game …`) – game area |
| `src/renderer/styles.css` | legacy base + blocks not yet moved (shrinking; no new rules) |
| `src/shared/fmt.js` | `window.Fmt` – the one copy of `esc`, `hms`, the Korean-time formatters, the settings `store`, and `token()` (a design token's value for canvas drawing and chart markup) |
| `src/renderer/icons.js` | `window.UIIcons` – inline Lucide subset |
| `src/renderer/ui/kit.js` | `window.UIKit` – dialog, focus trap, menu, toast, tooltip behaviour |
| `src/renderer/ui/keys.js` | `window.UIKeys` – global keyboard shortcut policy |
| `src/renderer/ui/livestatus.js` | `window.LiveStatus` – stale data, race-control kinds/unread, late-answer guard |

Load order in `index.html`: `tokens.css → components.css → styles.css → live.css (→ spectator.css, game.css)`, then
`shared/fmt.js, shared/ko.js, icons.js, ui/kit.js, ui/keys.js, ui/livestatus.js` before `app.js`. All are classic scripts (no modules, no framework).

---

## 1. Principles

The structure (tokens → shared components → one stylesheet per area) is v0.50's; the look is v0.71's redesign
(mock-ups: a Claude design canvas, three screens – home, timing, game menu):

* **Fewer words.** A state the viewer does not need to watch the session (cached, listed, refreshed, paused, humidity …)
  is not on screen: it moves to the ⋯ menu or to a tooltip (`title`) – never deleted.
* **Square, heavy, flat.** Every box and control has a 2 px solid light edge (`--line`) and square corners; inside a
  panel, separators are 1 px (`--line-soft`). A shadow is a flat block offset by 3–6 px (`--shadow-*`), never blurred.
  Numbers are heavy (Anton); a chosen item is a filled light block with dark text.
* **Three point colours, outside the data.** Blue (`--c-blue`) = the app bar, a selected list row, the globe, the 2D
  track board. Yellow (`--c-yellow`) = sticker labels (KR, 스프린트, a tile's button), the selected position block, the
  focus ring. Red (`--c-red`, = `--accent`) = the ONE main action of a view (결승, 재생, 연결, 레이스 시작).
* **In the timing table colour is data only**: purple block = overall best, green text = personal best (and a car
  within a second), the tyre compound, the team's bar. No point colour there except the selected row's yellow position.
* **Meanings are fixed** across live, spectator and game (table below). A colour never means two things.
* **Colour is never the only signal.** Tyres carry their letter, flags their word, overall best is a *filled* block while
  personal best is coloured *text*, the compared driver row says "비교".
* **Team colours identify a team only** – a bar beside the name or a block carrying the car's position on the 2D map.
* **The 2D track is a blue board** with a grid, a filled light road with a dark edge, and square team-colour blocks with
  the position – not a dark map with an outlined track and coloured dots (timing screen `app.js drawMap`, game
  `racehud.js drawMini`).
* **Avoid:** rounded corners, blurred shadows, gradients, glass, long explanations always on screen.
* **No palette in scripts.** What a script draws (the 2D board, the minimap, chart markup, the globe, the tiles' shapes)
  takes its colours from the tokens – `Fmt.token("--ok")` for canvas and SVG attributes, `style="fill:var(--c-blue)"`
  for page SVG. Only data colours that come from the feed (a team's colour) are written as they arrive, after
  `hexColour()` / the game store's check.
* **A chosen control stays readable under the pointer:** hover rules exclude `[aria-pressed="true"]`,
  `[aria-selected="true"]` and `[aria-current="true"]` (a pressed control is a light block with dark text).

## 2. Tokens (`css/tokens.css`)

**Never redefine a token in an area file.** Add a token in `tokens.css` when a new meaning or size is needed.

### Surfaces, text, edges
| Token | Use |
|---|---|
| `--bg-0` `#0d0d0f` | page, timing table |
| `--bg-1` `#131316` | panels, the player, the globe's board |
| `--bg-2`, `--bg-3` | raised / hover, the selected row |
| `--line` `#f2efe6` (2 px = `--bw`) | the edge of a box, a control, a bar |
| `--line-soft` | 1 px separators inside a panel |
| `--text-1` `#f2efe6`, `--text-2` `#a3a199`, `--text-3`, `--text-inv` | text; dark text on a light or coloured block |
| `--c-blue` `#3d4dff`, `--c-yellow` `#ffe500`, `--c-red` `#ff4b33` | the point colours (see above) |
| `--scrim`, `--hud-bg` | behind a dialog; a HUD panel over 3D (no blur) |

### State meanings (data colours)
| Token | Meaning | Examples |
|---|---|---|
| `--best` `#c77dff` | overall best | fastest lap / sector of everyone (filled block, dark digits) |
| `--ok` `#3ddc84` | personal best · OK · gaining | PB lap/sector (text), green flag, places gained, interval < 1 s |
| `--warn` `#ffd60a` | caution · pending | yellow flag, an order sent but not in force, the stale-data line |
| `--sc` | safety car / VSC | SC/VSC flag block, SC shading in charts |
| `--bad` | danger · red flag · refused · losing | red flag, retired, connection error, places lost |
| `--info` | neutral information | estimates, pit lane, the **compared** driver |
| `--sel-bg` | the selected driver's row | (its position is the yellow block) |

Purple is reserved for "overall best": the compared driver is **blue-grey** (`--info`), never purple.

### Tyres
`--tyre-s` red · `--tyre-m` yellow · `--tyre-h` light · `--tyre-i` green · `--tyre-w` blue – always with the letter
(`.ui-tyre.S` …) in a round ring. A set that started used has a **dashed** ring / hatched stint.

### Type, space, shape, layers, motion
* Four bundled families (SIL OFL 1.1, `src/renderer/fonts/`): `--font-title` Black Han Sans (Korean titles),
  `--font-num` Anton (numbers, Latin titles), `--font` IBM Plex Sans KR 400 / 500 / 700 (text),
  `--mono` IBM Plex Mono 500 / 600 (times and values – the timing table's figures).
* Sizes `--fs-2xs 10.5 · xs 11 · sm 12 · md 13 · lg 15 · xl 18 · 2xl 24 px`; weights `--fw-reg 400 · med 500 · bold 700`.
* Space `--s-1..8` = 2 4 6 8 12 16 24 32 px. Radius `--r-1..3` = 0 (square). Edge `--bw` = 2 px.
* Controls `--ctl-h 30`, `--ctl-h-sm 26`, `--ctl-h-lg 44` (the app bar, the map bar, the player, tabs), min target `--hit 24`.
* Shadows `--shadow-float` 4 px blue (menus, toasts), `--shadow-panel` 6 px blue (the chosen panel), `--shadow-sticker`
  3 px dark (a yellow sticker).
* Layers `--z-hud 10 · panel 20 · menu 40 · toast 60 · modal 80 · tip 90`.
* Motion `--t-fast 120 ms`, `--t-med 200 ms`, `--ease`; both become 0 under `prefers-reduced-motion` (and
  `html[data-reduce-motion="1"]`).

## 3. Components (`css/components.css`, `ui-` prefix)

| Class | Notes |
|---|---|
| `.ui-btn` + `.primary / .ghost / .quiet / .danger / .sm / .icon` | one `.primary` per view at most; icon-only buttons need `aria-label` (and `data-tip`) |
| `.ui-seg` | one of a few (mode, speed, 2D/3D/…); state via `aria-pressed` / `aria-selected`; `.pending` = sent, not yet in force |
| `.ui-tabs` | tab strip; selected = light underline; a count goes in `.ui-count` |
| `.ui-count` | small count badge on a tab (`.red .sc .yellow .penalty` colour the most serious unread item) |
| `.ui-badge` + `.ok .warn .bad .sc .best .info .live` | short state words |
| `.ui-table` + `tr.sel / tr.cmp / tr.out` | dense data table, tabular figures, sticky head |
| `.t-best .t-pb .t-gain .t-lose .t-stale .t-none` | time classes; `.t-stale` = delayed (not a zero), `.t-none` = "–" no data |
| `.ui-drv` | team bar + TLA + name |
| `.ui-tyre.S/.M/.H/.I/.W` (+`.used`, `.sm`) | letter in a ring of the compound colour |
| `.ui-flag.green/.yellow/.sc/.vsc/.red/.chequered` | word + colour square (chequered: pattern) |
| `.ui-kv`, `.ui-meter` | label/value stat; a share bar whose label says which way it reads (wear ↔ life) |
| `.ui-panel` (+ `header`/`.ui-ph`) | panel with a header row |
| `.ui-menu` | popover list – behaviour from `UIKit.menu` |
| `.ui-tip` | tooltip – `UIKit.tips()` shows it for `[data-tip]` |
| `.ui-scrim` + `.ui-dialog` | modal – `UIKit.dialog` / `UIKit.confirm` |
| `.ui-toasts` + `.ui-toast` (+ state) | transient notice |
| `.ui-state` + `.ui-spin` + `.ui-skel` | loading / empty / error / partial state blocks |
| `.ui-input`, `.ui-select`, `.ui-check`, `.ui-kbd` | form controls, key hint |

### Behaviour (`ui/kit.js`)
* `UIKit.dialog({ title, body, actions, dismissable })` → focus moves in, Tab/Shift+Tab stay inside, Escape (and a scrim
  click when dismissable) closes, focus returns to where it was. `UIKit.confirm(text, opts)` → `Promise<boolean>`.
* `UIKit.trap(el, { onEscape })` – the same trap for an existing element (the schedule and glossary drawers).
* `UIKit.menu(button, menu)` – `aria-expanded`, ↑/↓/Home/End between items, Escape closes and returns focus, Tab and an
  outside click close, choosing an item closes (checkbox labels keep it open).
* `UIKit.toast(text, { kind })`, `UIKit.tips()`, `UIKit.isDialogOpen()`.

### Icons (`icons.js`)
`UIIcons.svg(name, { label, size, cls })` returns an inline `<svg class="ui-ico">` (decorative unless `label` is given);
`<i data-icon="name"></i>` placeholders are filled by `UIIcons.fill(root)`. Icons take the text colour
(`currentColor`, 2 px round strokes). The subset (63 icons) is listed in `icons.js`; add a name by fetching its SVG from
the same lucide-static version and appending the inner shapes (tests check every name the page uses exists).

## 4. Numbers, units and states

| What | Rule | Example |
|---|---|---|
| Lap / sector times | as F1 sends them, tabular, right-aligned | `1:22.533`, `29.866` |
| Gaps / intervals | sign + 3 decimals as sent; lapped = `+1랩`; the leader's cell is blank | `+4.608`, `+1랩` |
| Relative to a driver | `+` behind, `−` ahead, 3 decimals | `−0.412` |
| Estimates | words "약" / "예상", whole seconds or a range – never more precision than the model has | `약 22초`, `약 8위` |
| Speed | km/h | `303km/h` |
| Temperatures | whole degrees in the bar, air then track (as sent, with humidity and wind, in the tooltip) | `30° · 노면 44°` |
| Delay | seconds, minutes above 60 s | `30초`, `1분 5초` |
| Laps | `LAP n /N`, stint `M28` (letter + laps) | `LAP 30 /62` |
| Session clock | only where there is no lap count (practice, qualifying), in the lap's place; dimmed when stopped | `남은 시간 12:56` |
| **No data** | a blank cell – never `0`, no `–` | gap before the first timing line |
| **Pit stops** | the count once there is one; blank before (no `0`) | pits `1` |
| Places gained / lost | `▲n` / `▼n` only when the place changed | `▲3` |
| **Stale (live)** | values greyed and italic (`.board.stale`) + one line saying since when and why | "45초째 새 데이터가 오지 않아요" |
| DNF / DSQ / stopped / knocked out | row dimmed in place + state badge (`리타이어`, `정지`, `탈락`) | |
| PIT | `피트` / `피트 아웃` badge (a light block) | |
| Session end | chequered flag word + pattern; session status chip | `체커기 · 종료` |

Korean UI text: short and plain; a race control row is the lap, a colour square and the Korean words – the time and the
original English are its tooltip.

## 5. Selection rules (live timing)

* Click a row = **selected driver** (raised row, its position a yellow block; on the 2D map a larger yellow block). Click
  again = clear.
* Shift+click another = **compared driver** (tinted row, the word "비교"; on the 2D map its block has a light edge).
* Selection is kept across the work-area views (2D · 3D · 텔레메트리 · 랩 비교) and the side tabs. Opening an analysis view
  never moves the 3D camera (the 3D view is only hidden, its camera state untouched).
* The selected and the compared driver are the inputs of the telemetry and lap comparison views; with none selected
  they show an empty state that says how to select.

## 6. Keyboard (`ui/keys.js`)

Replay: Space play/pause, ←/→ 5 s (Shift 1 min). Live: Space pause/resume, `,` `.` ∓1 s delay, `[` `]` ∓5 s.
Not a shortcut when: an IME is composing (`isComposing`, keyCode 229); the focus is in an input, textarea, select,
slider, contenteditable, audio player or splitter; a modal dialog is open; the home screen or the game covers the timing
screen; Cmd/Ctrl/Alt is held. Space held down toggles once. A button focused **by keyboard** keeps its own Space; a button
the **mouse** last pressed hands Space to the shortcut and loses focus (so its keyup doesn't press it again).
Escape closes, in order: the open popover/menu, a dialog, a drawer, the full-window map. Focus is always visible
(`:focus-visible` ring in `--focus`).

## 7. CSS scoping rules

* Area files only style their area: live → selectors under `body`, `.top`, `.status-bar`, `.layout`, `.player`,
  `#home`, `.drawer`; spectator → under `#map3d`; game → under `#game`. Shared things go to `components.css` (ask the
  owner) – an area may keep a local class in its own file.
* No new `!important` piles; no new rules at the end of `styles.css`. When a rule is reworked, move it out of
  `styles.css` into the area file.
* Legacy global selectors still in `styles.css` that leak across areas (e.g. `.cmp`, `.bad` in the game block) are to be
  scoped by their owners when they move.
* Responsive: must hold at 1280×720, 1440×900, 1920×1080 and at 125 % / 150 % zoom without the main actions moving behind
  a horizontal scroll; long names ellipsize; the header drops labels it can live without before wrapping.

## 8. Sources and licences

| Asset | Source | Licence | Offline |
|---|---|---|---|
| IBM Plex Sans KR, IBM Plex Mono, Black Han Sans, Anton (fonts) | npm packages `@fontsource/*` 5.3.0 (Google Fonts builds) via cdn.jsdelivr.net (fetched once, 2026-11-27) | SIL Open Font License 1.1 (`src/renderer/fonts/*-LICENSE.txt`) | bundled woff2 |
| Icons (63) | Lucide, package `lucide-static` 1.54.0 via cdn.jsdelivr.net (fetched once, 2026-10-30) | ISC; a few icons derive from Feather (MIT) – both in `src/renderer/ICONS-LICENSE.txt` | inlined in `icons.js` |
| Colours, components, layout | own work | – | – |
