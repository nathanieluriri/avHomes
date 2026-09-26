---
format: 1920x1080
fps: 60
duration: 18s
message: "Buyers ask on the website; the team sees it in the console."
arc: Listing → Option → Question → Request → Inbox → One system → Listing
audience: a stranger on a portfolio, silent, first look
mode: autonomous
music: none
---

# AV Homes: one-take storyboard

One composition (`index.html`), one world, one camera. No cuts. `world-map.png` shows the board,
the frame at every station, the camera path (colored by speed) and the request's route.

## The world (world px = CSS px × 2.5)

| Plate | Position | Size | Source |
|---|---|---|---|
| Site page (live listing, scrollY 0, cropped at 1990 CSS) | 0, 0 | 3840 × 4975 | `assets/plates/site-page.png` + 5 levels |
| Sidebar after "Ask about this" | 2460, 3452 | 970 × 918 | `assets/plates/site-sidebar-after.png` + 5 levels |
| "Ask about this" hover | 1866, 3986 | 436 × 132 | `assets/plates/site-ask-hover.png` |
| Focus dim over the page | 0, 0 | 3840 × 4975 | built (plum-950) |
| Chat panel + launcher (fixed overlay, page at scrollY 900) | 2860, 2820 | 920 × 1530 | `assets/plates/site-dock.png` + 5 levels |
| "Start the conversation" hover | 2896, 3981 | 848 × 116 | `assets/plates/site-start-hover.png` |
| Console (harness, Enquiries, New tab) | 4800, 1700 | 3840 × 2160 | `assets/plates/console.png` + 5 levels |
| The list before the question lands | 5400, 2331.75 | 3240 × 917 | `assets/plates/console-rows-before.png` + 5 levels |
| Request route (cubic Bezier) | Start button (3320, 4038.8) to the row slot (7080, 2407.5) | 4132 long | built |

Every box the camera, cursor and pill aim at comes from `capture/layout.json`
(`capture/tools/plates.py` writes both the plates and the boxes).

## Frame 1: Hero, the listing

- scene: The live Futuless Manor page on a gently tilted plane: title, "FROM ₦87,000,000", the render
- duration: 2.2s hold (17.1 to 18.0, then 0.0 to 1.3)
- poster: 0.5
- transition_in: camera (one take)
- status: animated
- src: index.html

A slow push-in and drift right. At 0.7 s the cursor fades in low on the right and settles; the
page starts to travel under it. (The gallery rail's thin strips are the live page's own layout.)

## Frame 2: Options

- scene: The 3 bedroom apartment row and the payment plan below it; the cursor presses "Ask about this"
- duration: 1.4s hold (2.95 to 4.35)
- poster: 3.65
- status: animated
- src: index.html

"3 bedroom apartment, ₦97,000,000, ₦48,500,000 deposit, then ₦8,083,333 a month for 6 months" and
"50% DEPOSIT / 6 months TO PAY THE BALANCE". Hover at 3.65 (the button's own wine border), press at 4.25.

## Frame 3: Chat panel

- scene: The site's chat panel, the question already written by the site, "Start the conversation" pressed
- duration: 1.75s hold (5.8 to 7.55)
- poster: 6.6
- status: animated
- src: index.html

The panel rises with the site's own `chat-rise` as it slides into frame (4.7), and the page behind
it dims to 45% (4.7 to 5.0). The frame opens on the Email field and ends below the button. The
cursor rests below the button, moves onto it (6.95 to 7.35), hover darkens it, press at 7.45.

## Frame 4: The request, and the inbox

- scene: The button lifts off as `POST /api/enquiries/chat`, flies to the console, and unfolds into the New row
- duration: 2.05s hold (9.45 to 11.5) after a 1.9s journey
- poster: 10.4
- status: animated
- src: index.html

The page's dim lets go as the pill leaves (7.8); the camera leads the pill by 400 world px so the
destination is always ahead of it. The list drops one row to make room (8.95), the pill lands in
the empty slot (9.4) and unfolds into the row; its tint fades out over 1.4 s. The frame holds the
tabs (the active New among them), the table header and the row: Chidinma Okafor, New, "I would like
to know more about the 3 bedroom apartment.", futuless-manor-life-camp. The row's 13 px text sets
the zoom at 0.8615 (28 px), which is exactly wide enough for the tabs and the longest slug with no
cut text; "just now" reads in the pull-back.

## Frame 5: Console, wide

- scene: The whole console: wine topbar, console wordmark, rail with Enquiries, the new row on top
- duration: 0.7s hold (12.45 to 13.15)
- poster: 12.8
- status: animated
- src: index.html

## Frame 6: One system

- scene: Site and console side by side on the board, joined by the request's line
- duration: 1.7s hold (14.2 to 15.9)
- poster: 15.0
- status: animated
- src: index.html

The chat panel, raised by its shadow, still sits open over the listing. The drift leans left toward
the listing, then the camera eases into the exact hero pose.

## Station table

| # | Station | World centre (in → out) | Zoom (in → out) | Tilt rx/ry | Arrives | Hold | The viewer reads |
|---|---|---|---|---|---|---|---|
| 1 | Hero | (1900, 1300) → (1950, 1300) | 0.360 → 0.372 | 7/-6 → 6.5/-5.5 | 17.10 | 2.20 s (wraps the seam) | Futuless Manor, Life Camp; FROM ₦87,000,000; the render |
| 2 | Options | (1440, 4380) → (1466, 4386) | 0.860 → 0.872 | 0 | 2.95 | 1.40 s | 3 bedroom apartment, ₦97,000,000, the deposit line; 50% / 6 months |
| 3 | Chat panel | (3380, 3912) → (3404, 3904) | 0.900 → 0.914 | 0 | 5.80 | 1.75 s | I would like to know more about the 3 bedroom apartment.; Start the conversation |
| 4 | Console row | (6905.5, 2702) → (6905.5, 2732) | 0.8615 | 0 | 9.45 | 2.05 s | the New tab · Chidinma Okafor · New · the question · futuless-manor-life-camp |
| 5 | Console wide | (6720, 2780) → (6690, 2758) | 0.420 → 0.408 | 2/-2 → 2.5/-2.5 | 12.45 | 0.70 s | the console chrome around the new row |
| 6 | Overview | (4180, 2740) → (4100, 2690) | 0.170 → 0.175 | 7/-6 | 14.20 | 1.70 s | site and console, one line between them |

Holds are linear drifts (8 to 22 px/s on screen, most with 1 to 3% zoom; the console row drifts at a fixed zoom so its edges stay clean); `freezedetect` finds no still stretch.

## Seam table

| Move | Time | Cause on screen | What carries the eye | Zoom change | Peak speed |
|---|---|---|---|---|---|
| M1 hero → options | 1.30 to 2.95 (1.65 s) | the cursor enters and settles low; the page scrolls up under it | the cursor, fixed on screen like a real pointer | 0.372 → 0.86 (2.31×), zoom starts at 30% of the move | 1645 px/s |
| M2 options → panel | 4.35 to 5.80 (1.45 s) | the press on "Ask about this" opens the chat panel | the cursor glides toward the panel and leads the camera; the panel rises as it enters (4.7) and the page dims | 0.872 → dips to 0.62 → 0.90 | 1600 px/s |
| M3 panel → console row | 7.55 to 9.45 (1.90 s) | the press on "Start the conversation" | the request pill, at constant speed on the route (7.8 to 9.4), the line drawing behind it; the camera rides 400 px ahead of it at 0.42 (8.55) | 0.914 → 0.42 → 0.8615 | 1599 px/s |
| M4 row → console wide | 11.50 to 12.45 (0.95 s) | the row has settled and its tint has faded | the new row, which stays in frame and shows its "just now" | 0.8615 → 0.42 (2.05×) | 229 px/s (mostly zoom) |
| M5 wide → overview | 13.15 to 14.20 (1.05 s) | the pull-back continues | the route line, leading left to the site | 0.408 → 0.170 (2.40×) | 1254 px/s |
| M6 overview → hero | 15.90 to 17.10 (1.20 s) | the overview's drift leans toward the listing | the listing's render, growing into frame | 0.175 → 0.360 (2.06×) | 1070 px/s |

No move changes zoom by more than 2.5× end to end. Moves take 8.2 s (46%) and holds 9.8 s (54%):
above the 25 to 35% target, spent on purpose. Six stations and the 2.5× rule, taken at the brief's
18 s, left the choice between that ratio and whip-pan speeds. Speed wins.

## Loop closure

- The camera is one closed curve. The hero hold runs 17.1 → 19.3, so the seam at 18.0 = 0.0 lies
  inside a linear drift: position, zoom, tilt and velocity are identical on both sides
  (`pose(0) == pose(18)`, checked in `review/geometry.json`).
- Everything that changed is put back at 17.5, while off frame: the chat panel (last visible
  16.92), the sidebar's "Asking about" patch (16.62), the console rows, slot and tint (console last
  visible 16.82), the route line (16.75), the pill. The page dim is back at 0 from 8.1. The cursor
  is gone from 7.9 until it fades in at 0.7 of the next loop.
- Nothing animates at frame 0 except the camera drift, the tilt drift, the board and the plate
  levels (a function of zoom), all part of the same curve.

## Timing sheet (every tween, seconds)

| Start | Duration | Target | What | Ease |
|---|---|---|---|---|
| 0.000 | 18.000 | #camera | x, y, scale and the plate level weights per frame from the curve | none |
| 0.000 | 18.000 | #tilt | rotationX, rotationY per frame | none |
| 0.000 | 18.000 | #dots | board parallax, 0.85× pan, zoom^0.85 | none |
| 0.650 | 7.300 | #cursor | position, size, press, opacity per frame (appears 0.70, settles 1.30, to Ask 3.05 to 3.65, press 4.25, to rest 4.45 to 5.75, to Start 6.95 to 7.35, press 7.45, fades 7.60 to 7.90) | power2.inOut arcs |
| 3.650 | 0.150 | #askHover | the button's hover colors on | none |
| 4.250 | 0.420 | #ringAsk | click ring (after an instant set) | power2.out |
| 4.270 | 0.100 | #sidebarAfter | "Asking about 3 bedroom apartment" appears | none |
| 4.450 | 0.150 | #askHover | hover off | none |
| 4.700 | 0.400 | #dock | chat-rise: opacity, y 30 → 0, scale 0.98 → 1 | expo.out |
| 4.700 | 0.300 | #siteDim | the page behind the panel dims to 45% | power2.out |
| 7.350 | 0.150 | #startHover | hover on | none |
| 7.450 | 0.420 | #ringStart | click ring | power2.out |
| 7.500 | 0.300 | #pill | appears on the button, lifts (scale 1.045), turns wine-600 | power2.out |
| 7.500 | 0.080 | #pillA | "Start the conversation" out | none |
| 7.600 | 0.160 | #pillB | "POST /api/enquiries/chat" in | none |
| 7.800 | 1.600 | #pill, #trail, #routeLine | travel at constant speed with smooth ends; trail follows heading; line draws | none per frame |
| 7.800 | 0.300 | #siteDim | the dim lets go | power2.in |
| 8.000 | 0.150 | #startHover | hover off | none |
| 8.950 | 0.450 | #rowsBefore | the list drops one row | power3.inOut |
| 9.140 | 0.260 | #pill | settles back to scale 1 | power2.inOut |
| 9.400 | 0.400 | #rowFlash | pill swaps to the slot and unfolds to the full row (clip-path) | power3.out |
| 9.400 | 0.200 | #flashLabel | label fades | none |
| 9.450 | 0.000 | #rowsBefore | hidden (now identical to the plate) | set |
| 9.740 | 0.300 | #rowFlash | opacity 1 → 0.16 | power2.out |
| 9.820 | 0.000 | #slotCover | hidden under the flash | set |
| 10.140 | 1.400 | #rowFlash | tint fades out | sine.inOut |
| 17.500 | 0.000 | all state | reset off frame | set |
| 18.000 | | | end = start | |

## Render

The master is rendered at 3840×2160 (device scale 2) as a lossless PNG sequence, reduced to
1920×1080 with an area filter and encoded once (`review/tools/deliver.sh`). See `frame.md`, Rendering, for the plate levels and why every frame is
composited in 3D.
