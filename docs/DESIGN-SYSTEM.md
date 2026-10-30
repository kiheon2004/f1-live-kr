# LiveTimingKR design system (v0.50)

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
| `src/renderer/icons.js` | `window.UIIcons` – inline Lucide subset |
| `src/renderer/ui/kit.js` | `window.UIKit` – dialog, focus trap, menu, toast, tooltip behaviour |
| `src/renderer/ui/keys.js` | `window.UIKeys` – global keyboard shortcut policy |
| `src/renderer/ui/livestatus.js` | `window.LiveStatus` – stale data, race-control kinds/unread, late-answer guard |

Load order in `index.html`: `tokens.css → components.css → styles.css → live.css (→ spectator.css, game.css)`, then
`icons.js, ui/kit.js, ui/keys.js, ui/livestatus.js` before `app.js`. All are classic scripts (no modules, no framework).

---

## 1. Principles

* **Data first.** Neutral dark charcoal surfaces in three steps; numbers are the brightest thing on screen.
* **One accent.** `--accent` (red-orange) marks the single primary action of a view (불러오기, 연결, 재생 in the game's
  start screen …) and the live dot – never every button. Selected states are light (`--text-1` underline / bar), not
  accent-coloured.
* **Meanings are fixed** across live, spectator and game (table below). A colour never means two things.
* **Colour is never the only signal.** Tyres carry their letter, flags their word, overall best is a *filled* chip while
  personal best is coloured *text*, the compared driver row says "비교".
* **Team colours identify a team only** – a 3–4 px bar or a dot beside the name, never a state, never a background.
* **Avoid:** blue neon, repeated purple gradients, glass cards everywhere, big radii, decorative shadows (only floating
  layers – menus, dialogs, toasts – get `--shadow-float`), full-screen backdrop blur, red buttons everywhere, grids of
  same-size cards, long explanations always on screen (put them in `title` / `data-tip`).

## 2. Tokens (`css/tokens.css`)

**Never redefine a token in an area file.** Add a token in `tokens.css` (owner: live/design helper) when a new meaning
or size is needed.

### Surfaces and text
| Token | Use |
|---|---|
| `--bg-0` | page, timing table rows, the map |
| `--bg-1` | panels, app bar, alternate table rows |
| `--bg-2` | raised: inputs, table head, menus, hover |
| `--bg-3` | pressed / selected (segmented control, selected row) |
| `--line`, `--line-soft` | borders; separators inside a panel |
| `--scrim`, `--hud-bg` | behind a dialog; a HUD panel over 3D (opaque enough, no blur) |
| `--text-1`, `--text-2`, `--text-3` | primary, secondary, tertiary (labels, units, "–") |

### State meanings
| Token | Meaning | Examples |
|---|---|---|
| `--best` (purple) | overall best | fastest lap / sector of everyone (filled chip) |
| `--ok` (green) | personal best · OK · gaining | PB lap/sector (text), connected, places gained, interval < 1 s |
| `--warn` (yellow) | caution · pending | yellow flag, an order sent but not in force, stale data notice |
| `--sc` (orange) | safety car / VSC | SC/VSC flag, SC shading in charts |
| `--bad` (red) | danger · red flag · refused · losing | red flag, retired, connection error, places lost |
| `--info` (blue) | neutral information | estimates, pit lane, "자료 없음" notes, the **compared** driver, sprint weekends |
| `--sel` / `--sel-bg` | the selected driver | light bar + raised row |
| `--cmp-bg` | the compared driver | blue-tinted row |

Purple is reserved for "overall best": the compared driver is **blue**, never purple (v0.49 used purple for it).

### Tyres
`--tyre-s` red · `--tyre-m` yellow · `--tyre-h` white · `--tyre-i` green · `--tyre-w` blue – always with the letter
(`.ui-tyre.S` …). A set that started used has a **dashed** ring / hatched stint.

### Type, space, shape, layers, motion
* Font `--font` = Pretendard Variable (bundled), fallbacks Apple SD Gothic Neo / Malgun Gothic. `--mono` only for ids
  and code, **not** for times.
* Sizes `--fs-2xs 10.5 · xs 11 · sm 12 · md 13 · lg 15 · xl 18 · 2xl 24 px`; weights `--fw-reg 450 · med 560 · bold 680`.
  Nothing smaller than 10.5 px; body text 13 px.
* Space `--s-1..8` = 2 4 6 8 12 16 24 32 px. Radius `--r-1..3` = 3 5 8 px (small: this is a data UI).
* Controls `--ctl-h 28`, `--ctl-h-sm 24`, minimum target `--hit 24` px.
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
| Gaps / intervals | sign + 3 decimals as sent; lapped = `+1랩`; leader = `선두` | `+4.608`, `+1랩` |
| Relative to a driver | `+` behind, `−` ahead, 3 decimals | `−0.412` |
| Estimates | words "약" / "예상", whole seconds or a range – never more precision than the model has | `약 22초`, `약 8위` |
| Speed | km/h | `303km/h` |
| Temperatures | ° with one decimal as sent | `기온 22.1°`, `노면 31.8°` |
| Delay | seconds, minutes above 60 s | `30초`, `1분 5초` |
| Laps | `랩 n / N`, stint `M28` (letter + laps) | `랩 30 / 70` |
| Session clock | `HH:MM:SS` "남은 시간"; "(멈춤)" when the clock is stopped | `남은 시간 01:19:56` |
| **No data** | `–` in `--text-3` (`.t-none`) – never `0` | gap before the first timing line |
| **Real zero** | `0` (a race car with no pit stop reported yet shows a faint `0`, the protocol's zero) | pits `0` |
| **Stale (live)** | values greyed and italic (`.board.stale`) + one line saying since when and why | "45초째 새 데이터가 오지 않아요" |
| DNF / DSQ / stopped / knocked out | row dimmed in place + state badge (`리타이어`, `정지`, `탈락`) | |
| PIT | `피트` / `피트 아웃` badge (`--info`) | |
| Session end | chequered flag word + pattern; session status chip | `체커기 · 종료` |

Korean UI text: short and plain; English feed text only as secondary (race control shows Korean, then the original).

## 5. Selection rules (live timing)

* Click a row = **selected driver** (light bar, raised row; the 2D map rings it white). Click again = clear.
* Shift+click another = **compared driver** (blue bar, tint, the word "비교"; the 2D map rings it blue).
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
| Pretendard Variable font | github.com/orioncactus/pretendard | SIL Open Font License 1.1 (`src/renderer/fonts/PRETENDARD-LICENSE.txt`) | bundled woff2 |
| Icons (63) | Lucide, package `lucide-static` 1.54.0 via cdn.jsdelivr.net (fetched once, 2026-10-30) | ISC; a few icons derive from Feather (MIT) – both in `src/renderer/ICONS-LICENSE.txt` | inlined in `icons.js` |
| Colours, components, layout | own work | – | – |
