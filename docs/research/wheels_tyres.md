# F1 road wheels & tyres – 2025 / 2026 (research for 3D rotating wheels)

Researched 2026-10-18. Confidence: H = read in primary/official source text, M = reputable secondary or consistent across several sources, L = inference / single unverified source.

Primary sources downloaded and read in full text:
- [FIA25] FIA 2025 Formula 1 Technical Regulations, Issue 03, 07 Apr 2025 – https://www.fia.com/sites/default/files/documents/fia_2025_formula_1_technical_regulations_-_issue_03_-_2025-04-07.pdf
- [FIA26] FIA 2026 F1 Regulations Section C Technical, Issue 17, 28 Apr 2026 – https://api.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_17_-_2026-04-28.pdf

---

## 1. Dimensions

### 2025 (FIA25, H)
| Item | Front | Rear | Article |
|---|---|---|---|
| Rim nominal | 18 in | 18 in | (BBS standard rim, Art. 10.7.4) |
| Rim tyre-mounting width | 335.3 ± 0.5 mm | 429.3 ± 0.5 mm | 10.7.2 |
| Rim outer lip diameter | 490.6 ± 1 mm | 490.6 ± 1 mm | 10.7.2 |
| Tyre width (new, 1.4 bar) | 345–375 mm | 440–470 mm | 10.8.1(b) |
| Tyre diameter max | 725 mm dry / 735 mm wet | same | 10.8.1(c) |
| Rigid set-up wheel for kinematics CAD | sphere Ø710 mm | – | 10.3.x |
- 2025 rims are a single FIA standard-supply part (drawings FIA-000000664 front RE2016, FIA-000003062 rear RE2069) – Art. 10.7.4 (H). Supplier is BBS (see §3).
- Pirelli nominal 2022–2025 sizes commonly quoted: front 305/720-18, rear 405/720-18 (tread width) – see §1b for source. Outer diameter ~720 mm (M).

### 2026 (FIA26, H)
FIA26 no longer states tyre width/diameter limits in the text: Art. C10.8.2 says "Tyre specifications will be determined by the tyre supplier, in agreement with the FIA" (H). Rim dimensions ARE given (C10.7.2.a):
| Rim item (mm) | Front | Rear |
|---|---|---|
| Rim diameter | 462.5 / 463 | 462.5 / 463 |
| Tyre mounting width | 315 ± 0.5 | 401.3 ± 0.5 |
| Lip external diameter | 496 ± 0.5 | 496 ± 0.5 |
| Overall width | 334 ref. | 420.3 ref. |
| Outboard lip thickness | 8.5 ± 0.2 | 8.5 ± 0.2 |
| Inboard lip thickness | 10.5 ± 0.2 | 10.5 ± 0.2 |
- Front mounting width 335.3 -> 315 (-20.3 mm); rear 429.3 -> 401.3 (-28 mm) (H, computed from FIA25 vs FIA26).
- C10.7.2.c.iv: material may be removed on the outer flanges between r = 238 mm and r = 246 mm, up to 1 mm deep, "for wheel branding, logo, or part numbers" -> i.e. the visible engraved BBS/part-number band on the rim lip sits at r 238–246 mm (H). Useful for a rotating-texture cue.
- C10.7.2.j: rim design cannot be handed left/right (H). C10.7.2.k: no heat-transfer features; teams submit designs to FIA (H) – i.e. 2026 rims are no longer a single FIA standard drawing as in 2025 Art 10.7.4 (the text no longer contains the "standard supplier" clause in C10.7) (M – supplier status: see §3).
- Tyre sizes 2026 (secondary): front 25 mm narrower, rear 30 mm narrower; diameter 720 -> ~705 front / ~710 rear (see §1b).

### 1b. Tyre sizes – secondary sources
| Season | Front | Rear | Source | Conf |
|---|---|---|---|---|
| 2022–2025 | ~305 mm tread / ~720 mm OD | ~405 mm tread / ~720 mm OD | widely quoted Pirelli 18" figures; consistent with FIA25 10.8.1 limits (345–375 / 440–470 section width incl. bulge, OD <= 725) | M |
| 2026 | tread -25 mm (=> ~280 mm), OD -15 mm (=> ~705 mm) | tread -30 mm (=> ~375 mm), OD -10 mm (=> ~710 mm) | Pirelli presentation as reported by GrandPrix247, 2025-12-09 (https://www.grandprix247.com/2025/12/09/f1-news-pirelli-reveal-2026-f1-tyre-compounds-along-with-a-new-logo-abu-dhabi-gp-tyre-test-formula-1-2026-regulations/), GPBlog 2025-12-09 (https://www.gpblog.com/en/news/2026-pirelli-tyres-ditch-wheel-covers-in-fresh-f1-design-reveal), Motorbox (IT) 2025-12 (https://www.motorbox.com/auto/sport/f1/news/pirelli-svela-le-gomme-2026-nuovo-look-nuove-misure-strategie-piu-aperte); Mercedes F1 race previews list 705 mm front / 710 mm rear (https://www.mercedesamgf1.com/news/what-are-the-tyre-options-for-the-2026-british-gp) | H (consistent across Pirelli-derived reports; Pirelli's own pirelli.com page not retrieved) |
| 2026 | size code on a 2026 show tyre sidewall reads approx. "280/705-18" (front) | – | Wikimedia Commons photo, 2026-08-01, CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:Pirelli_P_Zero_Formula_1_Medium_Slick_Tyre_2026.jpg | M (small text, read from photo) |
- Weight saving 2026 ~0.3 kg per front slick, ~0.5 kg per rear (motorsport.com via search summary, https://www.motorsport.com/f1/news/the-challenges-pirelli-faces-to-meet-f1s-2026-rules-targets/10623997/) – M.
- 18" rim retained for 2026 (16" option dropped) – H (all sources).
- Compounds 2026: five slicks C1 (hardest) – C5 (softest), C6 dropped; 3 nominated per race (F1.com 2025-11-25, https://www.formula1.com/en/latest/article/pirelli-confirm-2026-tyre-compounds-as-f1-gets-set-for-a-new-era-of.6la0zKVsCYwWk9AAISz4Yw) – H. 2025 used C1–C6 – H (common knowledge, same article).

**Modelling suggestion** (proportions, mm): 2025: OD 720, rim lip Ø 490.6 (r 245), tyre section front ~ 360 wide / rear ~ 455 wide at bulge. 2026: OD 705 F / 710 R, rim lip Ø 496 (r 248), section ~ 335 F / ~ 425 R. Sidewall height ≈ (705−496)/2 ≈ 105 mm in 2026 vs (720−490)/2 ≈ 115 mm in 2025.

---

## 2. Rim covers / outboard discs / wheel bodywork

### 2025 (2022–2025 rules) – "Wheel Cover"
- FIA25 Art. 3.13.7 (H): "A single Wheel Cover per wheel, must be rigidly secured to the wheel rim such that it has the **same rotational velocity as the wheel** it is connected to and forms an aerodynamic seal to the wheel rim. The outboard surface ... must be made to the geometry defined by RS-FWH-COV (front) / RS-RWH-COV (rear)." Classed SSC (standard specification). Mandatory front AND rear (Art. 3.13.1 says Wheel Bodywork must comprise all components 3.13.2–3.13.7). => **rotates with the wheel**.
- FIA25 Art. 10.1.2 (H): "Complete wheel: wheel, inflated tyre, wheel rim covers ..." ; Art 10.7.3 lists wheel covers among the only parts attached to the rim.
- Look on track (H, from photos):
  - Williams FW47 pit-stop, Zandvoort 2025-08-30 (Getty via F1.com): https://media.formula1.com/image/upload/c_lfill,w_3392/q_auto/v1740000001/fom-website/2025/Miscellaneous/GettyImages-2232833995.webp – cover is a **flat matte-black disc** filling the rim face out to the lip; **ring of ~10 small fastener holes** near its outer edge (r ≈ 0.9 × cover radius); a **central circular opening** (Ø ≈ 30–35 % of cover diameter) through which the hub, the coloured wheel nut and glowing brake parts are visible; team sponsor text printed on the cover (here "bw SCORES" ×2, point-symmetric). One small hole for valve access; small corner-ID sticker ("FRONT RIGHT") and red FIA corner mark on rim lip.
  - Alpine A525, Las Vegas 2025-11-22 (F1.com): https://media.formula1.com/image/upload/c_lfill,w_3392/q_auto/v1740000001/trackside-images/2025/F1_Grand_Prix_of_Las_Vegas/2248012793.webp – cover printed with a pink/blue roulette-wheel ring graphic ("CASINO" text) – i.e. teams DO decorate covers with livery graphics that rotate (H).
  - Generic look: black disc, often with team logo/colour accents; many teams run plain black. BBS lettering on the cover itself is NOT typical; BBS branding is on the rim (lip/spokes, mostly hidden) (M).
- **Over-wheel "wake deflector" (2022–2025)**: FIA25 Art 3.13.5 "Front Drum Deflector must be made to the geometry defined by RS-FWH-DEFL" – this is the small winglet arching over the top-front of the front tyre, mounted to the brake drum/upright (non-rotating). Rear Drum Deflector (3.13.6, RS-RWH-DEFL) is a small inboard fence. All Wheel Bodywork "rigidly secured to the suspension uprights" (3.13.1) => **does not rotate**, does not steer separately (it steers with the upright at the front) (H).
- Brake drum (Art 3.13.2, RS-FWH-DRUM) sits inboard of the rim; with the cover on, only a glimpse of it is visible through the central opening (H from photo).

### 2026 – covers abolished, but an "annular outboard disc" is mandatory
- Rule intent/press: "the wheel covers have gone" – teams choose own rims; covers removed mainly for weight. The Race (early 2026, https://www.the-race.com/formula-1/what-to-watch-for-in-2026-f1-launches/ and https://www.the-race.com/formula-1/six-things-audi-shakedown-told-us-about-f1-2026-designs/); GPBlog 2025-12-09 (look "more reminiscent of what was seen up to 2021") – H for the fact that the 2022-style full SSC cover is gone.
- BUT FIA26 Art. C10.7.5 "Outboard Disc" (H): "An annular disc must be fitted to all wheels. ... With minimal exceptions for fasteners and access to the inflation valve, the disc must fully enclose RS-F-RIM-DISC (front) / RS-R-RIM-DISC (rear) to within 2 mm radially of the wheel rim. The outboard disc may only be made from polymer composites or polymers (C15.2.3/C15.2.4)." Issue 14 (16 Oct 2025, https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_14_-_2025-10-16.pdf) worded it: "An annular disc **with an internal diameter of 310 mm** must be fitted to all wheels" (H). Issue 17 dropped the explicit 310 mm (geometry now in the RS-*-RIM-DISC CAD surfaces, FIA-LEG-0185/0186) (H).
  - => 2026 visual: a **black ring (annulus)** from r ≈ 155 mm out to the rim (r ≈ 246 mm), i.e. covering roughly the outer 37 % of the rim face radius; the **inner Ø ~310 mm is open**, showing spokes, hub and wheel nut. The disc is attached to the rim (listed in C10.7.6 "Parts attached to the wheel rim") => **rotates with the wheel** (H).
  - Confirmed visually: 2026 show-car photo (Commons, 2026-08-01) https://commons.wikimedia.org/wiki/File:Pirelli_P_Zero_Formula_1_Medium_Slick_Tyre_2026.jpg – smooth black annulus between tyre bead and a ring of ~14 black Y/twin spokes, red centre-lock nut (H for this car; it is a show car).
  - Plus "closing panels" (C10.7.2.e) – no air passage between inboard and outboard rim cavities; panels may bridge spokes (H). So between spokes you often see dark panels rather than see-through gaps (M, forum/photo).
  - Team variation: Ferrari's rear rims (BBS Japan) from Barcelona 2026: "a circumferential ring (which appears to be in carbon fibre) affixed at the outer edges of the rim's face" and "the previous spokes have been deleted" – F1.com Tech Weekly, June 2026 (https://www.formula1.com/en/latest/article/tech-weekly-the-significant-way-ferrari-have-looked-to-tackle-tyre-degradation.4sk8syijHIc3umynlSc7uK.4sk8syijHIc3umynlSc7uK) (H). Race photo in that article (Ferrari SF-26, Barcelona 2026): wheel faces read as **dark/black discs** with a small bright (yellow) nut at the centre (H).
- Over-wheel winglet in 2026: the 2022–25 RS-FWH-DEFL over-tyre deflector no longer exists. 2026 wheel bodywork list (C3.14): Drum, Lip, Scoop, Rear Drum Deflector (optional), Front Drum Front Deflector (optional, must lie **below ZW = 0 i.e. below axle height**, within 150×45×25 mm box, not visible from inboard – C3.14.6), Front Drum Rear Deflector (inboard fence, mandatory – C3.14.7), stays, hangers, debris guards. All rigidly fixed to the upright (C3.14.1.g) – non-rotating (H). The Ferrari 2026 race photo shows no winglet above the front tyre (H). => **Remove the over-tyre winglet for 2026**; keep it for 2025.

### Rims / supplier
- 2022–2025: single standard rim, BBS sole supplier (FIA25 10.7.4 "FIA will appoint a standard supplier for wheel rims"; f1technical.net news https://f1technical.net/news/23575) – H.
- 2026: teams choose rim suppliers again (f1technical.net https://f1technical.net/news/25264; The Race). Ferrari: BBS Japan multi-year exclusive partner from 2026, announced 2026-02-02 (BBS USA news https://www.bbs-usa.com/news/article/73973/Scuderia_Ferrari_HP_welcomes_BBS_as_Technical_Partner) – H. Other teams' suppliers not confirmed here (L). Material AZ70/AZ80 magnesium both years (H).
- Rim finish: black/very dark grey is near-universal (M, photos).

---

## 3. Wheel nut / hub / spokes
- Single central fastener both years; outer diameter <= 105 mm, axial length <= 75 mm (FIA25 10.9.1; FIA26 C10.9.1) – H. Relative to rim lip Ø ~490 mm the nut is ~ 21 % of rim diameter.
- Dual-stage retention + visual indicator of incorrectly fitted nut (C10.9.3–C10.9.5) – H.
- Nut colour: anodised colours visible in photos – Williams 2025 green-toothed nut with orange-red outer ring (Zandvoort photo above), Ferrari 2026 yellow, 2026 show car red (H from photos). Teams commonly colour-code nuts per axle/side for pit crews (M – general knowledge; FIA requires corner colour/label scheme for rims and TPMS sensors, FIA-F1-DOC-024 / FIA25 10.7.3 – H for rims, not nuts).
- Spokes: 2022–25 BBS standard rim has ~10–14 spokes, but they were **hidden by the cover** on track; only seen on exhibition wheels (Commons photo 2025-02-20, London F1 Exhibition, https://commons.wikimedia.org/wiki/File:Pirelli_Tyre_Sets_at_Formula_1_Exhibition,_London_03.jpg – twin/Y spokes, black) – M. 2026: spokes visible inside the ~310 mm opening of the annular disc (show car ~14 Y-spokes) but design is now team-specific (some, e.g. Ferrari rear, deleted spokes) – M.
- Drawing advice: for rotation readability at low speed draw 5–7 distinct features on the rotating part (valve hole, a sponsor arc, fastener-hole ring, or spoke pattern) plus the tyre band interruptions (§4).

---

## 4. Pirelli sidewall markings (layout only – no logos to be drawn)

Angles below are measured clockwise from 12 o'clock on the sidewall as seen from outside the wheel; r is a fraction of tyre outer radius R. Measured by me from the photos listed (frontal or near-frontal views; ±5–10°). Each sidewall carries ONE "PIRELLI" and ONE "P ZERO" (wets: "CINTURATO"), **diametrically opposite** each other, separated by **two coloured arcs**. Both sidewalls are printed; viewed from the other side of the car the pattern is mirrored (runs counter-clockwise).

### 2022–2025 (18" design) – H for counts/structure, M for angles
Sources: London F1 Exhibition photo 2025-02-20 (inter/wet + a white hard) https://commons.wikimedia.org/wiki/File:Pirelli_Tyre_Sets_at_Formula_1_Exhibition,_London_03.jpg ; Williams Zandvoort 2025-08-30 (medium) F1.com/Getty link in §2; Shanghai 2025-03-22 compounds line-up https://media.formula1.com/image/upload/t_16by9South/c_lfill,w_3392/q_auto/v1740000001/fom-website/2025/Miscellaneous/GettyImages-2206311952.webp ; fan-made icon matching the layout https://commons.wikimedia.org/wiki/File:F1_tire_Pirelli_PZero_Red_18.svg (L by itself, consistent with photos).
- Layout around the circle (logo at top as reference):
  - "PIRELLI" centred at 0°, spanning about −28°…+28° (~55°), letters large: radial span ≈ r 0.74–0.88.
  - Right arc: **one continuous, uninterrupted colour stripe** from ≈ +32° to ≈ +140° (~108°).
  - "P ZERO" (or "CINTURATO" on wets) centred at 180°, spanning ~ 145°…215° (~70°; CINTURATO a bit longer, ~80°).
  - Left arc: mirror, ≈ 220°…328°.
  - Small gaps (~4–6°) between arcs and lettering.
- Stripe radial position ≈ r 0.86–0.90 (outer part of the sidewall, close to the shoulder), stripe width ≈ 10–15 mm (≈ 0.03–0.04 R) (M).
- Small black/white extras: FSC tree logo + barcode sticker near the lower end of one arc; tiny moulded size text; on the 2025 Dutch GP the "500 GP" logo (special) – ignore.
- 2025 colours: C1–C6 on the day: Hard = white, Medium = yellow, Soft = red (whatever C-number is nominated). Inter = green, Wet = blue. Lettering is the same colour as the stripes. (H)
- Rotation readability: the two logo gaps break the ring twice per revolution (≈ 2 × 55–80° gaps) => at slow speed the coloured ring visibly "blinks" twice per turn; draw as two coloured arcs of ~108° plus two coloured letter blocks (rendered as abstract blocks/hatching, not logos).

### 2026 (new design, first since 2011) – H for "new design with chequered flag", M for geometry
Sources: Pirelli presentation Yas Marina 2025-12-09 as reported by GrandPrix247 / GPBlog / Motorbox (links §1b): "completely new sidewall graphics", "chequered flag logo integrated into the traditional P Zero markings", "the historic side brackets [parentesi laterali] ... reworked with a chequered-flag motif"; colours unchanged (white H / yellow M / red S, green Inter, blue Wet). Geometry measured on: 2026 medium on show car, Commons 2026-08-01 https://commons.wikimedia.org/wiki/File:Pirelli_P_Zero_Formula_1_Medium_Slick_Tyre_2026.jpg ; confirmed on race tyres in F1.com Ferrari SF-26 Barcelona 2026 photo (hard/white; chequer blocks visible) https://media.formula1.com/image/upload/c_lfill,w_3200/q_auto/v1740000001/fom-website/2026/Technical/TECH%20WEEKLY%20V1%20%20(10).webp
- Still ONE "P ZERO" and ONE "PIRELLI" per sidewall, ~180° apart (H).
- The two side "brackets" are no longer solid stripes; each is a **graduated train**: short dashes → longer dashes / a thin solid line → a **chequered-flag block (2 rows of alternating squares, ~5–6 squares long)** right before the next logo. Clockwise order (outside view), with "P ZERO" centred at ≈ +18°:
  | Zone | Angle (deg, clockwise from top) | Content |
  |---|---|---|
  | P ZERO | ≈ −20 … +55 (~75°) | lettering, r ≈ 0.74–0.84 |
  | gap | +55 … +60 | – |
  | right bracket, part 1 | +60 … +140 | dash train (short dashes, getting longer; a thin continuous segment near 3 o'clock) at r ≈ 0.87 |
  | right bracket, part 2 | +140 … +165 | chequered block, r ≈ 0.81–0.91 |
  | gap | +165 … +185 | – |
  | PIRELLI | ≈ +185 … +222 (~37°, compact bold letters) | lettering, r ≈ 0.74–0.86 |
  | gap | +222 … +225 | – |
  | left bracket, part 1 | +225 … +280 | dash train then thin solid line |
  | left bracket, part 2 | +280 … +318 | chequered block |
  | gap | +318 … +340 | – |
  Result: ~180° (2-fold) rotational near-symmetry; chequer blocks are the best high-contrast "rotation markers" (2 per revolution). Line/dash radius ≈ 0.87 R ≈ 305 mm (front tyre R ≈ 352 mm); dash thickness ≈ 6–8 mm; chequer squares ≈ 12–15 mm.
- Pre-season test 2026 only (NOT race weekends): C1 & C2 white, C3 & C4 yellow, C5 red; C1/C3/C5 had the chequered flag in the banding, C2/C4 only PIRELLI + P ZERO logos – GPFans 2026-02-11 quoting Pirelli (https://www.gpfans.com/en/f1-news/1075771/f1-tyres-bahrain-test-pre-season-pirelli/) – H.
- 2026 race weekends: 3 nominated compounds from C1–C5 shown as Hard white / Medium yellow / Soft red (H).

## 5. Wet / intermediate
- 2022–2025: same layout as slicks (PIRELLI + two continuous arcs + "CINTURATO" opposite); Intermediate **green**, Full Wet **blue**; plus tread pattern visible on the tread face (H – London exhibition photo above, Shanghai 2025 photo).
- 2026: colours unchanged green/blue (H, Pirelli presentation via GrandPrix247/GPBlog). Whether wets carry the new chequered/dash bracket graphics: not verified (L – assume same new design family as slicks). Inter/Wet tread patterns reported unchanged from 2025 (Motorbox, M).
- Wet tyre diameter limit 2025: <= 735 mm (FIA25 10.8.1.c) vs 725 mm dry (H) – i.e. wets ~10 mm larger OD.

## 6. Wheel speed & TV appearance
- Rolling circumference (unloaded OD): 2025 π·0.720 = 2.262 m; 2026 front π·0.705 = 2.215 m, rear π·0.710 = 2.231 m (H arithmetic). Loaded/effective rolling radius is a few mm smaller (~0.35 m) under downforce (M, general vehicle dynamics; no official figure found).
- At 300 km/h (83.33 m/s): 2025 ≈ 36.8 rev/s ≈ **2,210 rpm**; 2026 rear ≈ 37.3 rev/s ≈ 2,240 rpm, front ≈ 37.6 rev/s ≈ 2,260 rpm. With r_eff 0.35 m: 37.9 rev/s ≈ 2,270 rpm. Rule of thumb: **rpm ≈ 7.4 × km/h**; rev/s ≈ km/h / 8.1.
- Pit-lane speed 80 km/h ≈ 9.8 rev/s (≈ 590 rpm); 60 km/h ≈ 7.4 rev/s.
- TV look (M, reasoning from frame rates; broadcast is 50 fps in F1's international feed (M)): above ≈ 50–80 km/h the wheel turns > 90° per frame, so individual features alias (wagon-wheel effect – features appear to stand still or turn backwards) unless smeared by shutter blur. On TV at racing speed the sidewall reads as a **continuous coloured ring** (the arcs/brackets and the white/yellow lettering blur into one ring at r ≈ 0.85 R), and the rim face as a uniform dark disc with a blurred bright nut at the centre. Recommendation for the app: rotate textures physically up to ≈ 6–8 rev/s (≈ 50–65 km/h), then cross-fade to a radially blurred "continuous ring" texture (and optionally clamp the visible rotation rate to avoid strobing), as games/TV do.

## 7. Safety / medical cars – wheels (brief)
Fleet: 2025 = Mercedes-AMG GT Black Series & Aston Martin Vantage (safety); Mercedes-AMG GT 63 S 4MATIC+ 4-door & Aston Martin DBX707 (medical). 2026 = Mercedes-AMG only: Aston deal ended after 2025 (The Race https://www.the-race.com/formula-1/aston-martin-ends-f1-safety-car-deal/; Mercedes-AMG F1 news https://www.mercedesamgf1.com/news/mercedes-amg-to-provide-official-f1-safety-and-medical-cars-at-every-race-in-2026) – H. Mercedes-AMG site states GT 63 PRO 4MATIC+ replaces the GT Black Series from the 2026 Hungarian GP (https://www.mercedes-amg.com/en/safety-and-medical-car, per search summary; page timed out on fetch) – M. Medical car: AMG GT 63 S 4MATIC+ 4-door since 2022 (same page) – M.
| Car | Wheel design (observed) | Source / date | Conf |
|---|---|---|---|
| AMG GT Black Series (SC 2022–mid 2026) | black forged **10-spoke** (thin straight spokes), red calipers on the 2026 red SC | Commons "F1セーフティカー 鈴鹿2026.jpg" (Suzuka 2026) https://commons.wikimedia.org/wiki/File:F1%E3%82%BB%E3%83%BC%E3%83%95%E3%83%86%E3%82%A3%E3%82%AB%E3%83%BC_%E9%88%B4%E9%B9%BF2026.jpg ; dealer listings "AMG 10-spoke forged wheels" (e.g. https://www.romansinternational.com/used/cars/mercedes-benz/amg-gt/gt-black-series-2738) | M |
| Aston Martin Vantage (2024 SC) | **10 twin-spoke** (10 split/Y spokes = 20 arms), dark/black face with machined edges | Commons "2024 Aston Martin Vantage V8 F1 Safety Car 1.jpg" https://commons.wikimedia.org/wiki/File:2024_Aston_Martin_Vantage_V8_F1_Safety_Car_1.jpg | M |
| AMG GT 63 S 4MATIC+ 4-door (medical) | not verified from photo (standard AMG multi-spoke; assume 5 twin-spoke/10-spoke) | – | L |
| Aston Martin DBX707 (medical 2023–25) | 22" multi-spoke: **~10 twin (split) spokes = ~20 thin spokes**, black/gloss-black | Commons "2023 Aston Martin DBX 707 F1 Medical Car.jpg" https://commons.wikimedia.org/wiki/File:2023_Aston_Martin_DBX_707_F1_Medical_Car.jpg | M |
| AMG GT 63 PRO (SC from Hungary 2026) | black forged **5 double-Y / 10-spoke** design (road car photo) | Commons "Mercedes-AMG C192 GT 63 PRO 4MATIC+ (1).jpg" https://commons.wikimedia.org/wiki/File:Mercedes-AMG_C192_GT_63_PRO_4MATIC%2B_(1).jpg | L–M |
For a low-poly app a 10-spoke black wheel serves all of them adequately.

---

## Open items / caveats
- Pirelli's own pages (pirelli.com/tyres/en-ww/motorsport/f1, press.pirelli.com) were not reachable via search; Pirelli facts are from consistent reports of the 9 Dec 2025 presentation.
- FIA26 rim-disc exact geometry is in CAD files FIA-LEG-0185/0186 (not public); the 310 mm inner diameter is from Issue 14 text.
- Sidewall angles come from single photos; treat ±10°.
- Images I inspected were only fetched anonymously for measurement; none are redistributed here.
