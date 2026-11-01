# F1 support cars: shape and dimension sheet for low-poly 3D models (v0.39 research)

Research date: 2026-10-18. Anonymous web fetches only. Builds on `docs/research/support_cars_start.md`.
Confidence: **H** = manufacturer document read today; **M** = reputable press or spec database quoting the manufacturer, or several sources agree; **L** = from memory or estimated from photos.
Section A per car = road-car spec sheet. Section B per car = race-car (SC / medical) facts from official photos and releases, with date and event.

## 0. Sources read

- Mercedes media, GT 63 PRO SC release (23 Jul 2026, Affalterbach/Budapest): https://media.mercedes-benz.com/en/article/c5020459-5fff-4f15-a1f4-8851faf1ee2b. Read today. Key points: black paint with **red** vinyl graphics; CrowdStrike lettering; 30th-anniversary logo on bonnet, roof and rear wing; signal lights built into the front section, the rear wing, and the head and tail lamps (orange = no overtaking, green = may overtake); camera in the rear wing; new front splitter, front dive planes, modified rear wing with an **active flap**; Pirelli P Zero R tyres; two cars on standby at Hungary; the Black Series' last deployment was the first 4 laps of the 2026 Belgian GP. The release gives no dimensions or wheel details.
- https://www.mercedes-amg.com/en/safety-and-medical-car timed out again (60 s).

## 1. Quick dimension table (road-car base, mm)

All figures are road-car specs, not measurements of the race cars. Sources and confidence are listed in each car's section.

| Model | L | W (no mirrors) | H | WB | Track F / R | Tyres F / R | Rims F / R | Ground clearance |
|---|---|---|---|---|---|---|---|---|
| AMG GT Black Series (C190) | 4,551 | 2,007 | 1,284 | 2,630 | 1,693 / 1,683 | 285/35 R19 / 335/30 R20 | 10J×19 / 12J×20 | 95 (AMS) |
| AMG GT 63 PRO 4MATIC+ Coupé (C192) | 4,728 | 1,984 | 1,354 | 2,700 | 1,683 / 1,686 (GT 63 on 20"); PRO on 21": 66.3 / 66.4 in ≈ 1,684 / 1,687 | 295/30 ZR21 / 305/30 ZR21 | 10.5×21 / 11.0×21 | n/a |
| AMG GT 63 S 4MATIC+ 4-Door Coupé (X290), medical car | 5,054 | 1,953 | 1,447 | 2,951 | 1,669 / 1,664 | 275/35 R21 / 315/30 R21 (21" option; 20" base is 265/40 R20 / 295/35 R20 [L]) | 21" | n/a |
| Aston Martin Vantage (2024 facelift, 665 PS) | 4,495 | 1,980 | 1,275 | 2,705 | 1,665 / 1,655 | 275/35 ZR21 / 325/30 ZR21 | 21×9.5 / 21×11.5 | ~94 (autotijd, L) |
| Aston Martin Vantage S (2025, 680 PS) | 4,495 | 1,980 | 1,275 | 2,705 | 1,665 / 1,655 | 275/35 ZR21 / 325/30 ZR21 | 21×9.5 / 21×11.5 | n/a |
| Aston Martin DBX707, medical car | 5,039 | 1,998 (body) | 1,680 | 3,060 | 1,698 / 1,664 (M) | 285/40 YR22 / 325/35 YR22 | 10J×22 / 11.5J×22 | 175 (220 at max ride height) |

---

## 2. Mercedes-AMG GT Black Series (C190): F1 SC from 2022 to the 2026 Belgian GP

### 2A. Road-car spec

| Item | Value | Source | Conf. |
|---|---|---|---|
| L × W × H | 4,551 × 2,007 × 1,284 mm | auto motor und sport Supertest data sheet: https://www.auto-motor-und-sport.de/test/mercedes-amg-gt-black-series-supertest-sport-auto/technische-daten/ | M (Germany's main car magazine; matches the EU spec) |
| Alt. length / width | 4,604 mm length; 2,075 mm width **with** mirrors; 1,280 mm height; 2,635 mm WB | Top Gear spec page and the MBUSA spec sheet as quoted in search results (MBUSA page now 404). The extra ~50 mm of length is probably the US bumper or the splitter in its extended Race setting. | M |
| Wheelbase | 2,630 mm | AMS (above) | M–H |
| Track F / R | 1,693 / 1,683 mm | AMS | M |
| Tyres | 285/35 R19 front, 335/30 R20 rear (Michelin Pilot Sport Cup 2 R MO) | AMS; also quoted from the MBUSA sheet | H |
| Rims | 10J×19 front, 12J×20 rear | AMS | M–H |
| Ground clearance | 95 mm | AMS | M |

Silhouette and body facts. Sources: AMG launch text as quoted by Top Gear, WhichCar and GTspirit (2020); the official AMG page was unreachable.
- **Layout:** front-mid V8 sits behind the front axle. Very long bonnet (about 45% of length); the cabin is set far back, with the driver close to the rear axle. 2 doors, 2 seats. Fastback that ends in a short, high tail with a hatch (tailgate). The side glass is a single teardrop with no visible B-pillar; the roof sweeps straight into the tailgate glass.
- **Front:** AMG GT3-derived grille, much larger than the GT R's. It is **Panamericana** (AMG): vertical chrome slats in a trapezoid that is wider at the bottom, with the star in the centre. The car shows ~15 slats; for low poly, use 12–15 vertical slats. Large outer intakes. Carbon front splitter, manually adjustable to "Street" or "Race" (Race extends it forward). Flics/canards on the bumper corners.
- **Bonnet:** carbon, with **two large outlets** ("double-flow outlets") side by side in the centre of the bonnet, each spanning roughly the area between the headlamp and the centreline. Louvres above the front wheels and vents behind them (front-wing gills behind the wheel arch).
- **Headlamps:** narrow, swept-back triangular LED units at the front-wing corners (C190 family shape).
- **Rear:** **two-tier rear wing**. Two stacked carbon blades sit on carbon supports mounted on the tailgate (cantilevered over it). The upper flap is electronically adjustable by up to 20°. The supports are pylons from below, not swan-neck. Wing height: the upper plane sits slightly **above** roof height in side view, about 0–50 mm above the roofline peak (L, photo estimate). Big carbon diffuser. The tail lamps are thin horizontal wrap-around LED strips at the top of the tail, not round. 4 exhaust tips: 2 per side, in pairs at the outer edges of the diffuser.
- **Wheels (road):** forged, black (Black Series standard), 10 twin spokes / cross-spoke style. **L**

### 2B. F1 Safety Car (official sources)

- Official Mercedes media history article (undated; mentions the 500th SC appearance at Austin): https://media.mercedes-benz.com/en/article/8fbb8426-76dc-4b91-bf87-f5d1d0e614dd. **H**
  - 21 LED modules **integrated** in the car, with **no roof bar**: **6 in the windscreen** (top band, inside the glass), **13 in the rear wing**, **2 on the rear number plate**. In use, 14 lights burn steady orange and 7 in the centre of the rear wing flash orange. (The existing note's "3 orange + 1 green windscreen modules, 4 green LED modules on the wing" is from other press; treat the total of 6 windscreen modules as authoritative.)
  - Siren in the front-right wheel arch; camera in the rear wing.
  - Medical car listed as "GT 63 S 4MATIC+ (X290), 2022–present".
- Goodwood (2022 launch, debut at Bahrain on 20 Mar 2022): https://goodwood.com/grr/f1/the-new-f1-safety-car-is-an-amg-gt-black-series. The SC is **red** (not silver), with CrowdStrike decals. The medical car is red without CrowdStrike decals. M
- **Livery for modelling (photo-based, L–M):** body is AMG red (bright, slightly orange-red), with gloss black on the lower bodywork: splitter, side sills, diffuser and wing in bare black/carbon. White "CROWDSTRIKE" on the doors and bonnet, a white F1 / FIA logo on the doors, and a white CrowdStrike falcon on the rear quarter. "SAFETY CAR" appears only on the black front and rear plates. The roof is black (bare carbon); see the photos in §4C. Wheels are black. A one-off special design with the number "500" ran at Austin (official media article above).

---

## 3. Mercedes-AMG GT 63 PRO 4MATIC+ Coupé (C192): F1 SC from the 2026 Hungarian GP

### 3A. Road-car spec

| Item | Value | Source | Conf. |
|---|---|---|---|
| L / H / W (no mirrors) | 4,728 / 1,354 / 1,984 mm | Mercedes-AMG press technical data for the GT 63 4MATIC+ Coupé (C192, Sept 2023 launch PDF, mirrored by autointernational.com.my): https://autointernational.com.my/WebNews/Overseas/Year%202023/Sept%2023/Mercedes-AMG%20The%20all-new%20%20GT%20Coup%C3%A9%20%20-%205%20Sept%2023/All-new%20Mercedes-AMG%20GT%20Coup%C3%A9%20specification.pdf | H (official document; PRO shares the body) |
| Width incl. mirrors | 2,100 mm | Top Gear GT 63 Pro spec page | M |
| Wheelbase | 2,700 mm | same Mercedes PDF | H |
| Track F / R | 1,683 / 1,686 mm (GT 63 on 20"); PRO (US spec, 21"): 66.3 / 66.4 in ≈ 1,684 / 1,687 mm | Mercedes PDF; https://mbusa.com/en/vehicles/model/gt/coupe/amggt63x | H |
| Tyres | **295/30 ZR21 front, 305/30 ZR21 rear** (Michelin Pilot Sport 5, or Cup 2R optional) | Mercedes press release GT 63 PRO, 11 Jul 2024: https://media.mercedes-benz.ch/download/9dc66b08-35cd-4faf-a259-6857bd1d6855/240711-eng-pi-mercedes-amg-gt63-pro.pdf | H |
| Rims | 10.5×21 front, 11.0×21 rear; forged **cross-spoke** design, Himalaya grey matt | MBUSA page and Mercedes press release (above) | H |
| Height (US) | 53.3 in ≈ 1,354 mm; width without mirrors 78.1 in ≈ 1,984 mm; length 186.1 in ≈ 4,727 mm | MBUSA | H |

Shape facts (official PRO press release, 11 Jul 2024, plus C192 photos):
- The PRO's front apron is "even more dominant", with visible carbon air deflectors around the enlarged side intakes and an AIRPANEL active louvre in the lower apron. Carbon front splitter, carbon side-sill trims, carbon diffuser. **Fixed rear wing on the tailgate**, standard on the PRO. Underbody fins at both axles (like the AMG ONE). Radiators in the front wheel arches. **H**
- **Silhouette (C192 photos, M):** still a front-mid long-bonnet layout, but the cabin is longer and taller than the Black Series' because the C192 is a 2+2. The roof is a long fastback running down to a **liftback tailgate**. The tail is rounder and higher than the C190's. Single side window line with a small fixed quarter glass behind the door glass, so the window outline is a long teardrop ending in a sharp point near the rear wheel. 2 doors.
- **Grille:** Panamericana with vertical slats, taller and more upright than the C190's, in a near-rectangular frame flaring wider at the bottom. **Headlamps:** slim, with three-element DRL "eyebrows" swept up the wing. **Bonnet:** two power domes (bulges) running lengthwise. No large Black-Series-style outlets.
- **Tail lamps:** slim horizontal **oval/elliptical LED units at the outer corners**, joined visually by a black band across the tailgate. Four round exhaust tips, two per side, at the outer bottom (AMG "quad round"). **M**
- **Rear wing:** on the PRO road car the fixed wing is mounted on the tailgate with two pylons. The wing blade sits below roof height in side view (L).

### 3B. F1 Safety Car (official, 23 Jul 2026)

- Mercedes media release: https://media.mercedes-benz.com/en/article/c5020459-5fff-4f15-a1f4-8851faf1ee2b. **H** Black paintwork with red vinyl graphics. CrowdStrike lettering. 30-year-anniversary logo on the **bonnet, roof and rear wing**. Signal LEDs in the **front section and rear wing**, plus flashing functions in the headlamps and tail-lamps. Camera in the rear wing. New front splitter, front **dive planes** (canards), modified rear wing with an **active flap**. Pirelli P Zero R tyres. Two cars on standby at Hungary.
- Speedcafe (24 Jul 2026) calls it a "**one-off** black and red anniversary livery" for the debut and notes "additional lights" on the rear wing to improve visibility for following drivers. M
- **Not confirmed:** whether the livery stayed black and red after Hungary. Recommendation: model black with red graphics as the default for the GT 63 PRO SC, and red as the Black Series default. No roof bar in either case. The official photos in §3C confirm a red-dash fade from a black front to a red rear. Light positions follow the Black Series pattern: a top-of-windscreen LED band, LEDs along the rear-wing blade, and the number plate.

---

## 4. Mercedes-AMG GT 63 S 4MATIC+ 4-Door Coupé (X290): F1 medical car 2022–2026

**Which model:** Mercedes' own SC/medical history list says **"GT 63 S 4MATIC+ (X290), 2022–present"** (media.mercedes-benz.com article above, H). The Mercedes-AMG page snippet (via search) gives **470 kW (639 hp)** and 0–100 km/h in 3.2 s. That is the pure-V8 GT 63 S 4MATIC+, **not** the 843 hp plug-in hybrid GT 63 S E PERFORMANCE. The Mercedes 2026 supply note (mercedesamgf1.com) also names the GT 63 S 4MATIC+. I found no source for a model change in 2025 or 2026. Whether the cars were swapped for the 2024 facelift body cannot be verified (the facelift mainly changed bumper and wheel details). Model the pre-facelift X290 for both 2025 and 2026. **H** on the model name, **L** on the facelift question.

### 4A. Road-car spec

| Item | Value | Source | Conf. |
|---|---|---|---|
| L × W × H | 5,054 × 1,953 × 1,447 mm | AMS test data sheet: https://www.auto-motor-und-sport.de/test/mercedes-amg-gt-63-s-4matic-4-tuerer-coupe/technische-daten/ ; paultan.org gives the same | M–H |
| Wheelbase | 2,951 mm | AMS | M–H |
| Track F / R | 1,669 / 1,664 mm | AMS | M |
| Tyres (test car) | 275/35 R21 front, 315/30 R21 rear | AMS; paultan (21" five-hole AMG alloys) | M |
| Ground clearance | n/a. Approach angle 12°, departure angle 15° | AMS | M |

Shape facts (photos, M):
- **Body:** 4-door, 4-seat fastback **liftback** (hatch tailgate). Long bonnet, but less extreme than the GT coupé. The cabin starts about 35% back from the front. 6-window side outline: front door glass, rear door glass, small rear quarter glass. B-pillar is black; the C-pillar is a long slope to the tail.
- Panamericana grille (vertical slats). Narrow swept headlamps. Two power domes on the bonnet. Thin horizontal **wraparound tail lamps** that taper to points, on a short ducktail-like tail. The road car's active rear spoiler is built into the tailgate. **4 exhausts**: AMG trapezoidal (or quad round) tips, 2 per side.

### 4B. Medical car (photos and press, M)

- Red body, with black aero and lower body (splitter, sills, diffuser) and black wheels with a red rim edge. **Roof light bar** on a low-drag carbon roof fairing. FIA and F1 emblems. "MEDICAL CAR" lettering on the sides and an illuminated rear plate. Goodwood 2022: red, no CrowdStrike decals. Bar colour is **[unverified]**; photos look amber/orange with white or blue elements. **L**

### 4C. Photo check of the race cars (Wikimedia Commons, viewed today)

Each item gives the file name, date, event, and what the photo shows. These are photos of the actual race cars.
- **"File:2025 Japan GP - Safety Car - Race.jpg"** (2025-04-06, Suzuka, race). Black Series SC in side or high 3/4 view:
  - **Body red; the roof and the area around the rear window are black** (carbon roof left black). Bonnet has **two large black outlets**. Splitter, sills, diffuser, rear apron and wing are black.
  - White "CROWDSTRIKE" on the door and a white F1 / FIA logo above it. A **large white CrowdStrike falcon graphic** spreads from the rear door edge over the rear quarter. White AMG lettering on the roof rail and the windscreen top.
  - Small black **camera/antenna pod on the front of the roof**, with a whip antenna.
  - Rear wing: two stacked elements with big flat endplates carrying white lettering. They are carried on tall curved pylons from the tailgate (swan-neck-like). The upper element sits at about roof height or slightly above it.
  - Thin horizontal tail-lamp strip. **Black wheels with 5 twin spokes (10 spokes).**
- **"File:F1セーフティカー 鈴鹿2026.jpg"** (2026-03-29, Suzuka 2026). Black Series SC from the front 3/4:
  - Windscreen top band is a black strip with white "AMG" lettering, with **orange LED modules lit at its ends** (left visible). Orange "SC" lit in the rear side window.
  - Black number plate reading "SAFETY CAR" in the lower grille, with stays.
  - Grille is Panamericana: about 15 black vertical slats in a trapezoid. Headlamps are swept, narrow triangles.
  - **2026 adds a "30" anniversary logo** on the front wing and on the wing endplate (green or white).
  - Upper wing element is marked "Black Series". The roof is black, with the camera pod and antenna at its front.
- **"File:2026 Chinese GP - Safety Car & Medical Car.jpg"** (2026-03-13, Shanghai). One Black Series SC and **two GT 63 S 4-Door medical cars** (pre-facelift X290 face):
  - Medical cars: **all-red body including the roof**. A **roof light bar at the rear edge of the roof**, a wide low bar with **orange/amber lamp segments at both ends** and a dark centre.
  - **Fixed rear wing** on the tailgate, just below and behind the bar.
  - White "MEDICAL CAR" text on the bonnet, white "F1 / FIA Formula 1 World Championship" on the front doors, and a white F1 logo on the windscreen top band.
  - Black wheels. Black front plate reading "MEDICAL CAR". Black grille surround, with the Panamericana grille.
  - So 2026 medical car = X290 GT 63 S 4-Door, red. **H** (photo)
- Supercars.net, 2022 launch text (quoting the Mercedes release): https://www.supercars.net/blog/mercedes-amg-delivers-new-fia-safety-car-and-medical-car-for-formula-one. **M–H**
  - SC windscreen: "three small orange light modules and one large green module are positioned on each side of the AMG logo" in the upper windscreen.
  - SC rear wing: "In the main upper blade of the rear spoiler are 13 orange lights", 7 of them central flashers, plus 4 wider green LED modules.
  - Orange "SC" light in the rear side windows. Plate lit orange or green.
  - Medical car: light bar "mounted on a carbon-fiber scoop designed to offer the lowest possible wind resistance". "The blade of the rear wing is fixed at the steepest possible angle". "Black AMG alloy wheels edged in red". When the tailgate is open, extra flashers show.
  - Both cars: "the aerodynamic elements are in black, as is the lower portion of the bodywork all the way around."
- Black Series road car, Commons (various owners): **4 round tailpipes in two pairs**, each pair inboard of the diffuser's outer fins. The diffuser is big, black or carbon, with vertical strakes.

### 3C. GT 63 PRO SC: official photos (Mercedes media gallery attached to the 23 Jul 2026 release, Hungaroring, 5 images; viewed today) **H**

- **Livery:** it is **not plain black**. The **front half is black**: bonnet, front wings, nose and the front of the doors. Over it runs a pattern of **short red horizontal "dash" streaks** that get denser towards the back. The **rear quarter, tail and rear bumper are solid red**, with large **white CrowdStrike falcon/feather graphics** sweeping over the rear wing (fender) and C-pillar. In effect, a black-to-red fade made of red dashes.
- **Lettering and markings:** white "CROWDSTRIKE" on the bonnet front and across the tail. A white **"30" anniversary logo** on the bonnet. A **windscreen top band** with "AMG" lettering and a row of small LED modules (shown lit amber at the centre-left). An orange (lit) rear plate reading "SAFETY CAR" in black. A black front plate reading "SAFETY CAR" in silver, under the grille.
- **Roof:** a black **camera/antenna pod at the front of the roof** with several whip antennas. **No light bar.**
- **Rear wing:** a large single main plane with a flap, on **two swan-neck pylons** that rise from the tailgate and hook over to the top of the blade. The **upper blade carries a full-width row of amber LEDs**, and a second amber LED strip runs along the trailing flap. The blade sits about at roofline height or slightly below it, behind the rear window, overhanging the tail. Endplates are black.
- **Tail and lower body:** black. Tail lamps are thin horizontal units joined by a black band. A large black diffuser with **2 + 2 round tailpipes** at the outer ends.
- **Front:** Panamericana grille with ~12 bold vertical black slats. Black splitter with **dive planes** at the bumper corners. Big black corner intakes with vertical fins.
- **Wheels:** black, 5 twin spokes / cross-spoke.
- **Medical car in the same photos (Hungary 2026):** red 4-door X290 with a red roof, **roof light bar on the rear part of the roof** (orange end lamps visible), black wheels, white "F1 / FIA Formula 1 World Championship" on the front door, black front plate.

---

## 5. Aston Martin Vantage, 2024 model (665 PS): F1 SC at Aston rounds, 2024 Saudi Arabian GP to 2025 (before Zandvoort)

### 5A. Road-car spec

| Item | Value | Source | Conf. |
|---|---|---|---|
| L × W × H | 4,495 × 1,980 × 1,275 mm | Carsales (AU) Vantage 2024/2025 research pages; Encycarpedia 2024 Vantage. Width source conflict: vehiclesizes.com gives 2,045 mm with mirrors folded and 2,124 mm with mirrors out. Treat body width as ~1,980 mm. | M |
| Wheelbase | 2,705 mm | Carsales, Encycarpedia | M |
| Track F / R | 1,665 / 1,655 mm | Carsales | M |
| Tyres | 275/35 ZR21 front, 325/30 ZR21 rear (Michelin Pilot Sport S 5, AML compound) | Carsales, Cars.com, Encycarpedia. Goodwood confirms the bespoke Michelin. | M–H |
| Rims | 21×9.5 front, 21×11.5 rear (forged, standard) | Carsales; dealer page | M |
| Ground clearance | ~94 mm | autotijd.be | L |
| Official Aston spec sheet | Not reachable: astonmartin.com/models/vantage returned 404 and media.astonmartin.com returned 404 | — | — |

Shape facts (Aston launch, Feb 2024, as reported by Businessday, Dick Lovett and Autocar India, plus Commons photos):
- **Layout:** front-mid V8 sits behind the front axle. Long bonnet; the cabin is set back; 2 doors. A short fastback ending in a **hatch tailgate** with an integrated **ducktail** lip.
- **Front:** front track 30 mm wider than the predecessor. **Grille 38% larger**: a very wide, low **horizontal-vaned** grille (about 8 bright horizontal bars) that fills most of the nose width, with a lower splitter lip. **Headlamps:** matrix LED, slim, with an angled **horizontal DRL bar** across their top, set high at the wing corners. **Bonnet:** two slim **longitudinal vents/blades** on the bonnet (on the Vantage S these are a "centrally-mounted" pair).
- **Side:** a **horizontal side strake** (gill) on the front wing behind the wheel, in black. Frameless mirrors. A single teardrop side window with no B-pillar showing.
- **Rear:** a **thin full-width LED tail-lamp line** across the ducktail edge that thickens at the outer corners. "ASTON MARTIN" lettering on the tail. A large black diffuser with **quad round tailpipes** in two closely spaced pairs near the centre.
- **Wheels (road):** forged multi-spoke, 10 twin / Y-spokes.

### 5B. SC race car (official and photos)

- Aston Martin F1 team news, **6 Mar 2024** (https://www.astonmartinf1.com/en-GB/news/announcement/fastest-ever-aston-martin-vantage-announced-as-latest-formula-one-safety-car). **H**
  - "Modifications to the underfloor, front splitter, rear wing and FIA lightbar".
  - Painted in **Aston Martin Racing Green**, the same as the F1 cars. Lime Essence interior trim.
  - Debut at the **2024 Saudi Arabian GP** together with the DBX707.
- Supercars.net (Mar 2024, quoting the release): "extended and profiled front splitter", "new rear wing in a bespoke position, with a tuned Gurney", "aero-profiled FIA lightbar". **M**
- **Commons photos** ("2024 Aston Martin Vantage V8 F1 Safety Car*.jpg", 14 Jul 2024, a UK event; "2024 British Grand Prix, safety car.jpg") **H** (photo):
  - **Paint** is a bright teal-leaning Racing Green.
  - **Lime-yellow pinstripe** edging the splitter lip and the side sills.
  - **Lettering:** white "aramco" on the doors and bonnet; white F1 / FIA logo on the doors; "ASTON MARTIN" white on the windscreen top band; "SAFETY CAR" white on the nose above the grille.
  - **Roof light bar** is a slim black aero bar on a plinth at the **front edge of the roof, just behind the windscreen header**, spanning about 80% of the roof width.
  - **Rear wing** is high-mounted on pylons from the rear deck, with **lime-edged endplates**, at about roof height, overhanging the tail.
  - **Wheels** are dark multi-spoke with machined faces.
- The 2021–2023 Vantage SC (pre-facelift, narrower grille) looks similar. The Silverstone Museum car (photo 1 Jul 2026) is that older body. Do not use its front for 2024–25.

### 5C. Light-bar logic (2021 launch text of the Aston SC, motoringresearch.com) **M**

"Light-bar sits on a carbon fibre plinth, raised above the roof line". **Two outer orange** lights come on when the SC joins. A **central amber flashing** light shows once the SC is ahead of the leader (no overtaking). **Two central green** lights mean the field may pass. A rear-facing camera on the bar feeds a second mirror in the cabin.

---

## 6. Aston Martin Vantage S (680 PS): F1 SC at Aston rounds from the 2025 Dutch GP (Zandvoort)

### 6A. Road-car spec

The body is the same as the 2024 Vantage (section 5A): 4,495 × 1,980 × 1,275 mm, WB 2,705 mm, track 1,665 / 1,655 mm, tyres 275/35 ZR21 / 325/30 ZR21, rims 21×9.5 / 21×11.5. Source: Carsales Vantage S 2025 pages, M. Differences from the base car, per the Aston release (H): **centrally-mounted bonnet blades** (a pair of raised vanes near the bonnet centreline that extract hot air from the hot-V) and a **full-width decklid spoiler** (a bigger, more pronounced ducktail lip).

### 6B. SC race car

- Aston Martin press release, **29 Aug 2025, Gaydon** (https://www.astonmartin.com/en/our-world/news/2025/8/29/the-new-aston-martin-vantage-s-assumes-fia-safety-car-duties-in-formula-1-sup-sup). **H**
  - "Painted in the same **Podium Green** as the Aston Martin Aramco Formula One® Team cars".
  - Debut at the Dutch GP. Driver Bernd Mayländer.
  - The usual additions, "such as the FIA lightbar", were engineered for stability and visibility.
  - The DBX707 continues as medical car.
- **Official photo from that release** (image a69d0e6c…jpg, 7000×3934 px, Nikon Z f, viewed today). **H**
  - Body is **teal-green** (Podium Green) with **lime-yellow edging** on the splitter and sills.
  - **Roof light bar at the front of the roof** on a black plinth, lit **orange at the outer ends and green in the centre**.
  - **Rear wing on pylons** is still fitted, with lime-edged endplates. The wing top sits at or just below roof height.
  - White "aramco" and F1 / FIA logo on the doors; "SAFETY CAR" on the nose; "ASTON MARTIN" on the windscreen band.
  - **Grey/gunmetal multi-spoke wheels.** Whip antenna on the rear deck.
- For low poly, the Vantage S SC is the 2024 Vantage SC mesh plus a central bonnet-vane pair and a slightly bigger ducktail. Livery: Podium Green, a slightly lighter, bluer teal than the 2024 Racing Green.

---

## 7. Aston Martin DBX707: F1 medical car at Aston rounds, 2023–2025

### 7A. Road-car spec (official Aston Martin DBX707 specification sheet, mirrored at https://autointernational.com.my/WebNews/News/Year%202022/Sept%2022/Aston%20Martin%20Kuala%20Lumpur%20Unleashes%20the%20DBX707%20-%207%20Sept%2022/DBX707%20specifications.pdf) **H**

| Item | Value |
|---|---|
| Length | 5,039 mm |
| Width (body) / folded mirrors / incl. mirrors | 1,998 / 2,050 / 2,220 mm |
| Height | 1,680 mm |
| Wheelbase | 3,060 mm |
| Track F / R | 1,698 / 1,664 mm (CarExpert NZ; not on the official sheet) **M** |
| Tyres | Pirelli P Zero, 285/40 YR22 front, 325/35 YR22 rear |
| Rims | 10J×22 front, 11.5J×22 rear (23" optional, **L**) |
| Ground clearance | 175 mm (220 mm at max ride height; air suspension +45 / −30 mm) |
| Approach / departure / breakover | 22.2° / 24.3° / 15.1° |

Design items listed on the official sheet: five-door SUV body; **clamshell bonnet with twin vents**; "signature **double vein DB front grille**", a big DB-shape grille with bright horizontal double vanes; "signature **horizontal DRL** light"; "signature **rear light blade**", a full-width thin tail lamp across the tailgate with a ducktail; "**rear aero wing**" (roof spoiler at the top of the tailgate); frameless doors; **dark chrome window surround and side strakes** (strake on the front wing behind the wheel); panoramic roof; roof rails; "multi-piece winged rear diffuser"; "**black quad exhausts**" (2 per side); sport front splitter and aero winglets.

### 7B. Medical car (photos) **H** (photo)

- **"File:2023 Aston Martin DBX 707 F1 Medical Car.jpg"** (2023-07-14, Goodwood FoS):
  - **Teal Racing Green** body with **lime-yellow edging** on the splitter lip, front winglets and sill.
  - Big chrome horizontal-vane grille. Black front plate reading "MEDICAL CAR".
  - White F1 / FIA logo on the front doors and "ASTON MARTIN" on the windscreen band.
  - **Roof light bar at the front of the roof** on a plinth, with a black base and amber lenses.
  - **Black multi-spoke wheels (~20 thin spokes).**
- **"File:Aston Martin 2 Safety Car F1 2022.jpg"** (2022-04-23, Imola weekend; DBX, not 707):
  - Roof bar at the **front of the roof on two legs**, **amber across its full width** (3 lit segments).
  - "MEDICAL CAR Drive Safely" in white on the bonnet front; "ASTON MARTIN" on the windscreen band.
  - Red accents visible on the side windows.
- Goodwood (2021–23): Racing Green with lime highlights and a "Medical Car" splash on the sides. Official 2024 note: the DBX707 is in the same Aston Martin Racing Green as the F1 cars.
- 4 doors plus tailgate. B-, C- and D-pillars black. The side glass ends in a D-pillar that rakes forward over the rear wheel.

---

## 8. Normalized side-profile key points (ESTIMATES)

**Method:** I measured pixels on side or near-side photos. The axle x-positions were then forced to match the official wheelbase. Overhangs were split front/rear in the ratio seen in the photo. Features between the axles were scaled linearly from the axles. Heights are fractions of the official total height, measured near each feature to limit perspective error. Expect ±0.02 L and ±0.03 H error; X290 rows are worse (see "Photo used"). x = fraction of overall length from the front bumper; z = fraction of overall height (roof = 1.0, ground = 0).

| Key point | Black Series (C190) | GT 63 PRO (C192) | GT 63 S 4-Door (X290) | Vantage 2024 / S | DBX707 |
|---|---|---|---|---|---|
| Front axle x | 0.196 | 0.18 | 0.19 (L) | 0.165 | 0.186 |
| A-pillar base (windscreen meets bonnet) x | 0.40 | 0.35 | 0.33 (L) | 0.33 | 0.31 |
| Roof peak x | 0.62 | 0.54 | 0.50 (L) | 0.55 | 0.59 (roof nearly flat 0.45–0.75) |
| Side glass rear end (C/D-pillar point) x | 0.75 | 0.74 | 0.80 (L) | 0.71 | 0.80 |
| Tail top (end of roof/hatch slope, spoiler lip) x | 0.97 | 0.97 | 0.98 (L) | 0.97 | 0.88 (roof spoiler); vertical tailgate below |
| Rear axle x | 0.774 | 0.75 | 0.774 (L) | 0.766 | 0.793 |
| Bonnet height at front axle z | 0.58 | 0.59 | 0.55 (L) | 0.60 | 0.62 |
| Beltline (window sill) z, mid-door | 0.70 | 0.72 | 0.66 (L) | 0.70 | 0.71 |
| Rear deck / tail top z | 0.68 | 0.62 | 0.64 (L) | 0.66 | 0.75 (spoiler), tail lamps ~0.62 |
| Windscreen rake (from horizontal, side view) | ~25° | ~27° | ~27° (L) | ~25° | ~33° |
| Wing / light top above roof | wing upper plane ≈ roof height, top ~1.00–1.04 H | wing ≈ 0.95–1.0 H; roof pod at front of roof ~+0.08 H | roof bar at rear of roof, ~+0.07 H | roof bar at front of roof, ~+0.08 H; wing ≈ 0.95–1.0 H | roof bar at front of roof, ~+0.10–0.13 H with plinth |
| Photo used | "2025 Japan GP - Safety Car - Race.jpg" (axle ratio matched the spec within 1%) | "Mercedes-AMG GT 63 4MATIC+ Coupé (C192) right.jpg" (Commons, 25 Oct 2024, strong wide-angle distortion) | no clean side photo found; from memory and the China 2026 3/4 photo | "Aston Martin Vantage V8 F1 Safety Car - Silverstone Museum 1-7-2026.jpg" (2017 body; the side profile is unchanged on the 2024 car) | "Aston Martin DBX F1 Medical Car at Lime Rock, side profile.jpg" (2021 DBX; same body as the 707) |

Cross-section hints for lofting (L):
- **Plan view:**
  - AMG GT coupés: the body is widest at the rear haunches (rear track ≈ front track, but rear tyres are much wider on the Black Series). The cabin greenhouse is narrow, ~0.65 of body width at the roof.
  - Vantage: strongly tapered greenhouse (~0.6 of body width at the roof). Haunches widest at the rear axle.
  - X290 and DBX: greenhouse ~0.75 of body width.
- **Nose:** AMG noses are blunt and upright, with the shark-nose grille leaning forward at the top. The Vantage nose is low and wide, with the grille leaning back.

---

## 9. Safety-car and medical-car lighting / livery cheat sheet

| Car | Paint | Lower body / aero | Roof | Lights | Wheels |
|---|---|---|---|---|---|
| AMG GT Black Series SC (2022 to 2026 Belgium) | AMG red; white CrowdStrike falcon on the rear quarter; "30" logo in 2026 | black: splitter, sills, diffuser, 2-tier wing, bonnet outlets | **black carbon** roof; camera pod and antenna at the front | windscreen-top band: 3 small orange + 1 large green each side of the AMG logo (Mercedes 2022). Mercedes media total: 6 windscreen + 13 wing + 2 plate. Wing upper blade: 13 orange (7 central flashers) + 4 green. Orange "SC" in the rear side windows. Plate lit orange or green. | black, 5 twin spokes |
| AMG GT 63 PRO SC (2026 Hungary onward) | black front half with red dash pattern fading to a red rear; white falcon graphics; "30" logo; CrowdStrike | black | roof black or red-dashed; camera pod at the front | windscreen-top LED band; full-width amber LED row on the wing blade plus a strip on the flap; head and tail lamps flash; plate lit | black, cross-spoke |
| AMG GT 63 S 4-Door medical car (2022–2026) | red, including the roof | black lower body and aero, fixed rear wing on the tailgate | **light bar on a carbon fairing at the rear of the roof**, amber ends | flashers when the tailgate is open; illuminated "MEDICAL CAR" plate | black with a red rim edge |
| Aston Vantage 2024 SC | Aston Martin Racing Green (teal), lime pinstripe on the splitter and sills | black splitter and diffuser; lime-edged wing endplates | **light bar at the front of the roof** on a carbon plinth | bar: 2 outer orange, central amber flasher, 2 central green; rear camera on the bar | dark multi-spoke |
| Aston Vantage S SC (Zandvoort 2025 onward) | Podium Green, lime edging | as the 2024 car, plus central bonnet blades and a full-width decklid spoiler; wing retained | front-of-roof light bar | orange outer / green centre (official photo) | grey multi-spoke |
| Aston DBX707 medical car | Racing Green (teal) with lime edging | black lower body, lime splitter edge | **light bar at the front of the roof** on legs or a plinth | amber lenses | black multi-spoke, 22" |

---

## 10. Open questions / not verified

- Whether the GT 63 PRO SC kept the black/red livery after Hungary 2026. It was called "one-off"; no post-Hungary photo was found.
- The exact width basis for the Vantage (1,980 vs 2,045 mm) and its ground clearance. No official Aston sheet was reachable.
- X290 side-profile points (no clean side photo). Whether the medical cars are facelift X290s; in the 2026 photos they look pre-facelift.
- Black Series wing pylon style. Photos suggest curved pylons from the tailgate; whether they attach from above (swan-neck) or below is unclear at this resolution. The GT 63 PRO SC wing is clearly swan-neck.
- Light-bar lens colours on both medical cars (amber is seen in photos; any blue or green elements are unknown).
- https://www.mercedes-amg.com/en/safety-and-medical-car timed out twice. It may hold the official light counts for the medical car.

## 11. Sources (all fetched anonymously on 2026-10-18)

- Mercedes media, GT 63 PRO SC (23 Jul 2026) and its 5 gallery images: https://media.mercedes-benz.com/en/article/c5020459-5fff-4f15-a1f4-8851faf1ee2b
- Mercedes media, SC / medical car history (Black Series lights; GT 63 S X290 medical car): https://media.mercedes-benz.com/en/article/8fbb8426-76dc-4b91-bf87-f5d1d0e614dd
- Mercedes press release, GT 63 PRO (11 Jul 2024) PDF: https://media.mercedes-benz.ch/download/9dc66b08-35cd-4faf-a259-6857bd1d6855/240711-eng-pi-mercedes-amg-gt63-pro.pdf
- Mercedes technical data, AMG GT 63 / GT 55 Coupé C192 (2023) PDF, mirrored at autointernational.com.my (URL in §3A)
- MBUSA GT 63 PRO spec page: https://mbusa.com/en/vehicles/model/gt/coupe/amggt63x
- auto motor und sport data sheets: Black Series https://www.auto-motor-und-sport.de/test/mercedes-amg-gt-black-series-supertest-sport-auto/technische-daten/ ; GT 63 S 4-door https://www.auto-motor-und-sport.de/test/mercedes-amg-gt-63-s-4matic-4-tuerer-coupe/technische-daten/
- Supercars.net 2022 SC / medical car launch: https://www.supercars.net/blog/mercedes-amg-delivers-new-fia-safety-car-and-medical-car-for-formula-one
- Goodwood 2022 SC: https://goodwood.com/grr/f1/the-new-f1-safety-car-is-an-amg-gt-black-series
- Speedcafe, Hungary 2026: https://speedcafe.com/f1-news-2026-hungarian-grand-prix-budapest-new-safety-car-mercedes-amg-gt-details-photos-info-engine-comments-reaction/
- Aston Martin, Vantage S SC (29 Aug 2025) and its photo: https://www.astonmartin.com/en/our-world/news/2025/8/29/the-new-aston-martin-vantage-s-assumes-fia-safety-car-duties-in-formula-1-sup-sup
- Aston Martin F1, Vantage SC (6 Mar 2024): https://www.astonmartinf1.com/en-GB/news/announcement/fastest-ever-aston-martin-vantage-announced-as-latest-formula-one-safety-car
- Supercars.net, Vantage SC 2024: https://www.supercars.net/blog/aston-martin-vantage-becomes-the-new-official-fia-safety-car-in-f1
- Motoring Research, 2021 Aston SC light bar: https://www.motoringresearch.com/car-news/aston-martin-f1-official-safety-medical-cars-revealed/
- Official Aston Martin DBX707 specification PDF (URL in §7A)
- Spec aggregators (M/L): Carsales Vantage 2024/2025 (https://www.carsales.com.au/research/aston-martin/vantage/2025/s), Encycarpedia, Cars.com, vehiclesizes.com, autotijd.be, CarExpert, Top Gear, paultan.org
- Wikimedia Commons photos (file names, dates and events given in §4C, §5B, §7B, §8); categories "Mercedes-AMG C190 safety car (Formula One)", "Aston Martin Vantage (2017) safety car (Formula One)", "Aston Martin DBX F1 medical car"
