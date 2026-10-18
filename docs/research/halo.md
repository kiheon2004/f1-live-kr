# Halo: real dimensions vs the LiveTimingKR model (v0.37 research)

Researched 2026-10-18. This is web research only: no app run, no code changed.
Model numbers come from `src/renderer/car3d.js` (`halo()`, `sweep()`, `loft()`/`smoothSections()`, `PROFILES`) and `src/renderer/map3d.js` (onboard/eye camera). Model units are metres; I re-evaluated the pillar loft with the same Catmull-Rom smoothing.
Confidence: **H** = regulation text or a primary/technical source; **M** = credible secondary source or two estimates that agree; **L** = single photo or geometry estimate.

## 0. Coordinate bridge (regs → model)

- FIA X_C = 0 is "the X-plane at the rear of the Cockpit" (2022 and 2026 regs). The rearmost point of the helmet must be at X_C −50…−125 (C12.5.2).
  - Model: cockpit rim rear z = −0.32 and helmet rear z = −0.05 − 0.16 = −0.21. That gives X_C −110, which is inside the window.
  - So **X_C = 0 ≈ model z −0.32**, with +z forward.
- FIA Z = 0 is the reference plane (floor/plank).
  - Model 2026 floor: the extrude spans y 0.035–0.085, so **reference plane ≈ model y 0.035**. 2022 is the same (0.035).
- Model regs-point check (2026 model):

| FIA point (2022–2026 regs) | → model coords | model halo there | Δ |
|---|---|---|---|
| Front fixing axis X_C −975, Z 660 (C12.4.2) | z 0.655, y 0.695 | pillar foot section centre z 0.64, y 0.64 | foot ~55 mm low (it sinks into the chassis; harmless) |
| Centreline load point on pillar/junction surface [X_C −785, 0, 830] (C13.3.2) | z 0.465, surface y 0.865 | pillar centre y≈0.82, top surface ≈0.85 | ≈ −15 mm (OK) |
| Lateral load point on hoop outer surface [X_C −590, Y 233.5, Z 810] (C13.3.2) | z 0.27, x 0.2335, y 0.845 | hoop centreline at x≈0.20 → y≈0.88–0.89 (surface ≈0.90) | hoop sides ≈ **40–55 mm too high** |
| Rear mounting faces Z 695 | y 0.73 | rear legs end at y 0.60 inside the body | n/a |

## 1. Model measurements (verified from code)

### Top hoop (`sweep`, elliptical section `a` × `b`)

- `a` lies in the hoop's plane, sideways to the curve. At the front of the hoop that is fore-aft (radial); `b` is vertical.
- **2026:** a = 0.045 and b = 0.0225, so the section is **90 mm radial × 45 mm vertical**. Hoop centre top y = 0.91 at z = 0.33; top surface y = 0.9325.
- **2022:** a = 0.046 and b = 0.034, so the section is **92 × 68 mm**. Top y = 0.935.
- The 2026 section is only 45 mm high, which is **thinner than the 50 mm titanium tube** it would have to enclose.

### Centre pillar (`loft` of superellipse rings at constant z; same for both eras apart from `top`)

All rows below are 2026 values.

| z (m) | centre y (2026) | full width | vertical thickness of the ring |
|---|---|---|---|
| 0.355 (hoop junction) | 0.900 | **56 mm** | 60 mm |
| 0.414 | 0.862 | 64 mm | 60 mm |
| 0.450 | 0.835 | 68 mm | 60 mm |
| 0.483 | 0.804 | 72 mm | 59 mm |
| 0.550 | 0.735 | 80 mm | 56 mm |
| 0.617 | 0.664 | 95 mm | 59 mm |
| 0.640 (foot) | 0.640 | **100 mm** | 60 mm |

- The pillar slopes at about 43°: dy/dz ≈ 0.93 at eye height. A 60 mm vertical ring therefore gives a blade about **44 mm thick perpendicular to its axis**, and a horizontal slice through it is about 64 mm deep fore-aft.
- So the "56–100 mm" figure in the brief is confirmed.

### Eye, cameras, onboard setup

- **2026 eye:** [0, 0.81, 0.0].
  - Helmet centre is [0, 0.755, −0.05], half-sizes 0.14 / 0.145 / 0.16, so the helmet top is at y 0.90.
  - The eye is **100 mm below the hoop's centre-top** and only 90 mm below the helmet top.
- **2022 eye:** [0, 0.79, −0.06], which is 145 mm below the hoop top.
- **T-cam (TCAM):** 2026 [0.08, 1.10, −0.46] (Ferrari 0, …), pitch 15.5° down, hfov 72°.
- **Eye mode in map3d.js:**
  - Camera at `mounts.eye`, pitched −0.06 rad (3.4° down).
  - **hfov 95°**, converted to a vertical fov for the window aspect and clamped to 35–100°.
  - near = 0.03 m (T-cam 0.05). Helmet hidden.
  - A single camera on the **car centreline**.
- **Pillar at eye height (2026):**
  - Crosses y 0.81 at z = 0.477, where it is **71 mm wide**.
  - Eye→pillar is **477 mm**, so it subtends **8.5°**.
  - In a 95° rectilinear frame that is **6.8 % of the frame width**, dead centre.
- **Pillar at eye height (2022):** 76 mm wide at 583 mm, 7.5°, 6.0 % of the frame.
- The hoop's front-top is 16.9° above the eye (2026).

## 2. Sourced real-world data

| Item | Value | Structure / fairing | Season | Source | Conf. |
|---|---|---|---|---|---|
| Standard | Secondary Roll Structure "must be made to standard **FIA8869-2018**", supplied by an FIA-designated manufacturer; geometry in FIA-F1-DOC-115 (not public) | structure | 2022–2026 (2026: C12.4.2) | FIA 2026 F1 Regs Section C, Iss 20, 2026-08-05, C12.4.2 – https://api.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_20_-_2026-08-05.pdf ; FIA 2022 Tech Regs Iss 5, 2021-07-08, 12.4.2 – https://api.fia.com/sites/default/files/2022_formula_1_technical_regulations_-_iss_5_-_2021-07-08.pdf | H |
| Note on 8869 | 8869 is a structural-load standard; geometry sits in a separate FIA document | structure | – | f1technical forum (user post) – https://f1technical.net/forum/viewtopic.php?p=1002162 | L |
| Position | Front fixing axis **X_C −975, Z 660**; rear mounting faces on **Z 695**; symmetric about centreline | structure | 2022–2026 (identical text) | same FIA docs | H |
| Position (old) | Front fixing 975 mm ahead of C-C, **640** mm above ref plane; rear faces **675** | structure | 2018–2021 | FIA 2021 Tech Regs Iss 9, 2021-03-05, 15.2.1 – https://www.fia.com/sites/default/files/2021_formula_1_technical_regulations_-_iss_9_-_2021-03-05.pdf | H |
| Hoop tube | **50 mm OD, 4 mm wall** Grade 5 Ti (Ti-6Al-4V) "C" hoop | structure | 2018– | Pat Symonds, GP Racing / Autosport, 2021-12-12 – https://www.autosport.com/f1/news/the-17k-investment-proving-its-enduring-f1-worth/6871257/ | M-H |
| Overall size | **835 mm long × 580 mm wide**; ~7 kg (bare Ti) | structure | 2018– | same (Symonds) | M-H |
| Assembly mass / stiffness | 13.5 ± 0.5 kg assembly (per FIA supplementary doc); ≤17.5 mm deflection under 125 kN | structure | 2018– | Engineering.com (T. Austin-Morgan, post-Nov 2020) – https://www.engineering.com/halo-around-the-head-protects-formula-one-driver-in-fiery-crash/ | M |
| Centre pillar (strut) | "The central strut is currently **20mm**"; FIA to test "as low as **16mm**" (aim: better forward view). Final production width not published | structure | 2017 prototype (pre-2018) | ESPN, 2017-08-03 (Mekies, FIA) – https://www.espn.com/f1/story/_/id/20233682/mercedes-tests-thinner-halo-fia-plans-push-design ; Autosport (A. Cooper) 2017-08-03 – https://www.autosport.com/f1/news/f1s-halo-cockpit-protection-device-six-key-myths-and-rumours-busted-4997937/4997937/ | M (for 2018+ width) |
| Bare Ti pillar, photo | Exhibition chassis with **bare titanium halo**, viewed from the rear-left 3/4. The pillar's visible face is ≈ 0.8–0.9× the hoop tube's apparent diameter, i.e. ≈ **40–45 mm**, mostly its fore-aft depth (blade). Lateral width not measurable from this angle; consistent with ~20–25 mm wide × ~40–45 mm deep | structure | 2024–25 Sauber/Stake chassis | **Photo-based estimate**: Commons "F1 Carbon Fibre Halo at Formula 1 Exhibition, London.jpg" (CC BY-SA 4.0); scale = hoop tube 50 mm, measured in pixels on a 1280 px copy | L |
| Fairing envelope 2018–21 | Bonded fairing, prescribed laminate, **no part more than 20 mm from the structure** (or HS camera), outside helmet free volume, not below Z 675. Extra front-mount/camera fairing between 1066 and 835 mm ahead of C-C, below Z 685, "minimum width" | fairing | 2018–2021 | FIA 2021 Tech Regs Iss 9, Art. 15.2.6 | H |
| Fairing envelope 2022–25 | **3.12.3a: "entirely within a 20mm offset from the secondary roll structure"**, above Z 695, outside RV-COCKPIT-HELMET, convex radii ≥ 2 mm. **3.12.3b**: front-mount/camera fairing inside cuboid [X_C −1066, −25, 600]–[X_C −835, 25, 705], i.e. **≤ 50 mm wide**, Z 600–705 | fairing | 2022–2025 | FIA 2022 Tech Regs Iss 5, Art. 3.12.3; PL-HALO laminate 3.16.3 | H |
| Fairing envelope 2026 | **C3.13.3: fairing "must lie in RV-HALO"** (CAD volume FIA-LEG-0237 rev B at [X_C=0,0,0]; size not in the text), convex radius ≥ 2 mm, fillet to front bodywork ≤ 10 mm; laminate PL-HALO (C3.19.2). Ferrari's transparent 2026 "halo wings" were within RV-HALO; the 2027 rules are expected to close this | fairing | 2026 | FIA 2026 Section C Iss 20, C3.13.3 / C3.19.2 / App. C2 list; The Race (J. Noble) 2026-03-17 – https://www.the-race.com/formula-1/ferrari-halo-wing-f1-legality-questions-removal/ ; https://www.the-race.com/formula-1/ferrari-halo-wing-miami-gp-f1-legal-2027-ban/ | H (text) / M (envelope size unknown) |
| Attachment tests 2026 | Centreline: 130.1 kN down + 51.6 kN rearward at **[X_C −785, 0, 830]**. Lateral: 104.5 kN in + 93.2 kN rearward at **[X_C −590, 233.5, 810]** (physical 140 kN, calc 168 kN). Calcs: 75 kN up on each rear mount; 99 kN up + 99 kN rearward at the front mount (2021: 88 + 88) | attachments | 2026 (same points in 2022 regs) | FIA 2026 C13.3.2–C13.3.3; FIA 2022 Iss 5 | H |
| 2026 change | **No geometry change** to the halo itself (same standard, same fixing axes as 2022). What changed for 2026 is the *principal* roll hoop (higher loads, ~141→167 kN per FIA summaries) and the halo front-mount calc load (88→99 kN) | – | 2026 | FIA 2026 regs; GPFans – https://www.gpfans.com/en/f1-news/1077462/f1-2026-regulations-roll-hoop/ ; f1technical analysis – https://f1technical.net/news/24818 | H (text) / M (summaries) |
| Helmet height rule | Helmet must lie **below a line from the halo's front fixing axis to 75 mm below the top of the principal roll structure**. Roll structure must have structure at **[X_C 55, 0, 968]** (2026) | driver position | 2022–2026 (2018–21: hoop ≥ 940 mm at 30 mm behind C-C) | FIA 2026 C12.5.2, C12.4.1 | H |
| Onboard cameras 2026 | Six positions. Positions 4 and 5 mandatory, 1 and 2 camera or housing. **Helmet camera "pointing forward"** and position 6 if the CRH requests. Position 1: above the survival cell, ahead of the cockpit, behind the halo front mount, facing the driver. Positions 2–4: axis within 1° of Z=0 | cameras | 2026 | FIA 2026 C8.16.1–C8.16.8 | H |
| Driver's Eye cam | Racing Force (Bell/Zeronoise) micro camera, **8 mm dia., 2.5 g → ~1.4 g**, "positioned at **eye-level on the protective padding** inside the helmet". Trialled 2021 (Alonso, Spa); races from 2022; all drivers from 2023. FOV not published; described as "narrow, focused" | camera | 2021–2023+ | The Race (S. Mitchell-Malm) 2021-09-18 – https://the-race.com/formula-1/f1s-plan-to-use-new-helmet-camera-in-races-explained/ ; Motorsport.com 2021-12-10 – https://www.motorsport.com/f1/news/f1-set-for-more-driver-eye-cams-in-2022-after-new-deal/6873705/ ; DigitalCameraWorld – https://digitalcameraworld.com/news/formula-1-tv-coverage-to-get-new-helmet-cam-and-drone-footage-for-2022-season ; AVIXA – https://xchange.avixa.org/posts/how-formula-1-s-new-driver-s-eye-camera-embraces-av-s-potential | M |
| Driver: camera ≠ eye | Bottas: visor-cam footage "doesn't really look like how we see it from the inside"; "only see the centre pillar and a small part…", "a small thing in the middle"; start lights "you can always see them with one eye" | perception | 2018 | Formula1.com 2018-02-28 – https://www.formula1.com/en/latest/article/halo-has-less-impact-than-cameras-show-bottas.UCKGm8Lx4YQEcaigmWQg0 | H (quote) |
| Binocular vision | Pat Symonds: with two working eyes the brain fuses the two images (retinal disparity), so "the driver is not aware of the presence of the central pillar". The 2018 Kubica photo caption says the camera captures a different view than the eye | perception | 2025 column | Autosport 2025-07-07 – https://www.autosport.com/f1/news/why-the-halos-central-pillar-is-so-integral-to-the-concept-and-why-it-doesnt-hinder-driver-vision/10734595/ | M-H |
| FIA visibility | 2016 tests: "very large majority of drivers were satisfied with visibility"; no significant obstruction from the central strut | perception | 2016–17 | Autosport 2017-08-03 (above); RaceFans 2017-07-23 – https://www.racefans.net/2017/07/23/f1-fanatic-round-up-2307-4/ | M |
| Counter-view | Hamilton: some visibility is lost, most noticeably for a car far down a straight. Vettel (2016): "something in the middle" | perception | 2016–18 | ESPN 2018 – https://www.espn.com/f1/story/_/id/22625531/halo-reactions-one-week-f1-testing ; RACER 2016-07-09 – https://racer.com/2016/07/09/vettel-raises-halo-visibility-concerns | M |

### Derived real-world geometry (estimates, how they were made)

- **Eye height.** These are two independent estimates, and they agree.
  1. **Regs.** The helmet line runs from (X_C −975, Z 660) to (X_C ≈ 55, Z ≈ 893–925, i.e. roll hoop top 968–1000 minus 75). At the helmet crown (X_C ≈ −250) the line is at Z ≈ 825–845. Model y ≈ **0.86–0.88** is therefore the maximum helmet top. The eye is ~130–150 mm below the helmet top (head plus shell; side photos below), so **eye Z ≈ 690–715, model y ≈ 0.72–0.75**. Conf. M-L.
  2. **Side photos** (Commons: Williams FW46 Spain 2024; Haas VF-22 Britain 2022; scale = helmet length ~300 mm / tyre 720 mm). The helmet top is roughly level with the hoop top at the helmet's X (±20 mm). The visor slit is **~120–140 mm below the helmet top**, so the eye is about **110–150 mm below the hoop top**. Conf. L (photo-based).
- **Eye fore-aft.** Helmet rear is at X_C −50…−125. Helmet length is ~300 mm and the eye is ~70 mm behind the visor face, so the eye is at **X_C ≈ −310…−330, model z ≈ 0.0** (model OK). Conf. M-L.
- **Pillar line.** It passes through the front fixing (X_C −975, Z 660) and roughly 20 mm below the centreline load point (X_C −785, surface Z 830), at a slope of ≈ 0.8–0.9 (≈ 40°). Model slope 0.93 is OK.
  - At a real eye height of Z ≈ 700, the pillar is crossed at X_C ≈ −890…−920. **Eye→pillar ≈ 560–600 mm horizontal.** Conf. L-M.
- **Hoop height.** The lateral load point implies the hoop side centre is at Z ≈ 810 (model y ≈ 0.845) at X_C −590. The real hoop top is plausibly **Z ≈ 830–860 at the front (model y ≈ 0.865–0.895)**. Conf. L.
- **Angular size of a real pillar.** A 25–35 mm visible width at 0.55–0.6 m subtends **≈ 2.5–3.5°**. In a 95° frame that is ≈ 2–3 % of the width; in a ~75–80° frame, ≈ 3–4 %. The model's pillar subtends 8.5° (6.8 % at 95°). Conf. L (geometry).
- **Binocular check.** IPD is ≈ 63 mm (adult mean). For an occluder narrower than the IPD (w < e), the zone hidden from **both** eyes ends at d·e/(e − w):
  - Real pillar, 30 mm at 0.55 m: everything beyond **≈ 1.05 m** is seen by at least one eye, so the pillar effectively vanishes against the road (consistent with Bottas and Symonds).
  - Model pillar, 71 mm > 63 mm IPD: the doubly hidden zone **never closes**, so even a real pair of eyes could not see past it. Conf. H (geometry), using a typical IPD.
- **Broadcast onboard frames.**
  - The T-cam is already fitted to footage in the code, so no new work is needed there.
  - I could not get a Driver's Eye still to measure the pillar's share of the frame width. **Not measured.** Treat any % figure for the helmet cam as unknown.
  - Bottas's remark implies the helmet cam (one lens, behind the visor) shows the pillar more prominently than a driver perceives it.

## 3. Side-by-side: model vs real

| Quantity | Model now (2026) | Model now (2022) | Real (best value) | Basis |
|---|---|---|---|---|
| Pillar width at eye height | **71 mm** | 76 mm | **~25–35 mm visible** (Ti ~20 mm + thin fairing; regs max 2022–25 = Ti + 2×20 mm ≈ 60 mm) | strut 20 mm (FIA 2017, M) + 20 mm offset rule (H) + photo (L) |
| Pillar width at foot | **100 mm** | 100 mm | **≤ 50 mm** (front-mount fairing cuboid Y ±25, 2022–25) | FIA 3.12.3b (H) |
| Pillar width at hoop junction | 56 mm | 56 mm | ~35–50 mm (blends into the vee) | photo (L) |
| Pillar thickness ⟂ axis (fore-aft) | ≈ 44 mm (60 mm vertical ring) | same | ~40–45 mm Ti blade; with fairing ≤ ~60–80 mm | photo (L) + 20 mm rule (H) |
| Top hoop section | **90 radial × 45 vertical** | 92 × 68 | Ti **50 mm round**; with fairing ≤ 90 × 90 (2022–25); typically ~70–85 radial × ~52–60 vertical | Symonds (M-H) + 20 mm rule (H); typical = photo (L) |
| Hoop top height (centre) | y 0.91 | y 0.935 | y ≈ 0.865–0.895 | regs load points (L-M) |
| Eye height | y **0.81** (100 mm below hoop top) | y 0.79 (145 mm) | y ≈ **0.73–0.76**, 110–150 mm below hoop top | regs helmet line + photos (M-L) |
| Eye→pillar at eye height | 477 mm | 583 mm | **≈ 550–600 mm** | regs + geometry (L-M) |
| Pillar angular width from eye | **8.5°** | 7.5° | ≈ 2.5–3.5° | derived |
| Camera | 1 centred lens, hfov 95°, near 0.03 | – | driver: 2 eyes 63 mm apart; helmet cam: 1 lens beside an eye, FOV unpublished | – |

## 4. Why the pillar looks wide in the app (ranked)

1. **The pillar is modelled about 2–3× too wide.** It is 56→100 mm, and 71 mm at eye height. Even the 2022–25 legal maximum (Ti + 2×20 mm) is about 60 mm, and real pillars look about 25–35 mm wide. The flare to 100 mm at the foot is twice the 50 mm front-mount fairing box. This is the main cause.
2. **A single centred camera has no binocular vision.** The app's eye camera sits exactly behind the pillar on the centreline. A driver's two eyes, 63 mm apart, see around a pillar narrower than 63 mm, so it all but disappears beyond about 1 m (Symonds, Bottas). Because the model pillar (71 mm) is wider than the IPD, it would block even binocular vision.
3. **The eye is too high and too close.**
   - The eye sits 100 mm below the hoop (real ≈ 110–150) and about 60–80 mm above the regs-derived height.
   - At that height the line of sight meets the pillar only 477 mm ahead (real ≈ 550–600). The pillar subtends 8.5° instead of about 3°.
   - Do not simply lower the eye with the current pillar. The pillar widens downward, so a lower eye would meet a wider section. Fix the widths first.
4. **The hoop is too high and flat.** It is 45 mm thick, which is thinner than the 50 mm tube, and about 3–5 cm too high. This mainly changes how the top bar frames the view and does little to the pillar. It is secondary.
5. **FOV and near plane are not the cause.**
   - A 95° hfov makes the pillar *smaller* on screen. A narrower zoom (`look.fov`) enlarges it in the same way it enlarges everything else.
   - near = 0.03 m clips nothing here, because the pillar is ≥ 0.36 m away.
   - Portrait or narrow windows: the vertical fov clamp at 100° lowers the effective hfov a little. This is minor.

## 5. Recommended targets

Model units are metres in brackets. S = sourced, E = estimated.

| Target | Value | Basis |
|---|---|---|
| **Pillar width at eye height** | **30 mm** (hw 0.015); acceptable 25–40 | E. Ti strut ~20 mm (S, FIA 2017) plus a thin fairing; must be < 60 mm (S, 20 mm offset rule) and < 63 mm IPD |
| Pillar width at hoop junction | 36–40 mm (hw 0.018–0.02) | E (photo) |
| Pillar width at foot | **≤ 50 mm** (hw ≤ 0.025); 44 mm is a good value | S: 2022–25 front-mount fairing cuboid Y ±25 mm |
| **Pillar fore-aft depth** (⟂ to its axis) | **45 mm**. In the current loft (vertical ring height at ~43° slope) keep hh ≈ 0.03 (60 mm vertical ≈ 44 mm ⟂) | E (photo L); the current value is fine |
| **Top hoop section** | **55 mm vertical × 75 mm radial** (2026; b 0.0275, a 0.0375). 2022: 55 × 70 (b 0.0275, a 0.035). Never < 50 mm in either axis | S: 50 mm Ti tube; S: ≤ 90 mm with 2×20 mm fairing (2022–25); proportions E |
| Hoop top height | Centre y ≈ 0.88 (2026); drop by ~3 cm if the T-cam refit allows | E (regs load points, L-M). The T-cam fit used the halo's top, so re-check the footage before moving it |
| **Eye position** | **[0, 0.75, 0.0]** (2026) and [0, 0.745, −0.03] (2022). That is ~130 mm below the hoop's centre-top and ≥ ~110 mm below the helmet top | E (regs helmet line + side photos, M-L). Only the `eye` mount needs to change: the helmet is hidden in eye mode, so the T-cam footage fit is unaffected. Lowering the helmet itself would need a T-cam refit |
| **Eye→pillar distance** at eye height | **≈ 0.55–0.60 m** | E (regs pillar line, L-M). This follows from the lower eye plus the existing pillar line (foot z 0.64, junction z 0.355) |
| Pillar angle seen from the eye | ≈ 3° (≈ 2.5 % of a 95° frame) | derived |
| Optional: binocular effect | In eye mode, fade the pillar (and lower hoop) to ~35–50 % opacity, or render it from two eye positions ±0.0315 m and keep only pixels hidden in both. This mimics how drivers "see through" it | design suggestion. Basis: Symonds/Bottas (S), IPD geometry |
| Keep | hfov 95° and near 0.03 m in eye mode | S/E: not causes |

Sanity check after the change: with a 30 mm pillar at about 0.57 m, the subtended angle is about 3.0°, roughly a third of today's 8.5°.
