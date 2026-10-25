---
name: Plein Sud
description: An embroidered floral tee instead of a fuel app; one answer stitched large on cream cloth by day, night flowers by night.
colors:
  ground: "#F3EDE0"
  cloth: "#FBF7EE"
  ink: "#2A2420"
  ink-2: "#6A5F55"
  seam: "#DCD1BC"
  stitch: "#C4B392"
  rose: "#A8506A"
  rose-thread: "#C2617F"
  lavender: "#5E5FB3"
  lavender-fill: "#D6D5F1"
  coral: "#D86A4A"
  ochre: "#C98F22"
  sage: "#6F8769"
  sky: "#8FB0C6"
  accent: "#2A2420"
  accent-ink: "#FBF7EE"
  accent-stitch: "rgba(251, 247, 238, .55)"
  good: "#46653F"
  warn-bg: "#F8DFD3"
  warn-ink: "#8A3A1E"
  scrim: "rgba(42, 36, 32, .42)"
  ground-dark: "#0E1430"
  cloth-dark: "#151D40"
  ink-dark: "#EFE8D8"
  ink-2-dark: "#A8AECB"
  seam-dark: "#2A3462"
  stitch-dark: "#46528A"
  rose-dark: "#E8A3B8"
  rose-thread-dark: "#E08FA9"
  lavender-dark: "#A4A6EC"
  lavender-fill-dark: "#2E336B"
  coral-dark: "#E89A7E"
  ochre-dark: "#D8B25A"
  sage-dark: "#C3CAD9"
  sky-dark: "#C9D1E0"
  accent-dark: "#D8B25A"
  accent-ink-dark: "#1A1606"
  accent-stitch-dark: "rgba(26, 22, 6, .45)"
  good-dark: "#A3D6A6"
  warn-bg-dark: "#3D2433"
  warn-ink-dark: "#F3B9A6"
  scrim-dark: "rgba(4, 6, 18, .6)"
typography:
  display:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "clamp(76px, 23vw, 100px)"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 68"
    fontFeature: "'tnum' 1"
  figure:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 72"
    fontFeature: "'tnum' 1"
  figure-row:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 72"
    fontFeature: "'tnum' 1"
  headline:
    fontFamily: "Young Serif, Georgia, serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.12
  title:
    fontFamily: "Young Serif, Georgia, serif"
    fontSize: "26px"
    fontWeight: 400
    lineHeight: 1.1
  section:
    fontFamily: "Young Serif, Georgia, serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.15
  row-name:
    fontFamily: "Young Serif, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.2
  brand:
    fontFamily: "Young Serif, Georgia, serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.005em"
  action:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 90"
  chip:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    fontVariation: "'wdth' 80"
  body:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "'tnum' 1"
  label:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
rounded:
  flag: "8px"
  field: "12px"
  control: "14px"
  row: "16px"
  panel: "18px"
  card: "22px"
  patch: "24px"
  pill: "999px"
spacing:
  gutter: "16px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "22px"
  stitch-inset: "-7px"
components:
  button-go:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.panel}"
    height: "62px"
    width: "100%"
  button-go-dark:
    backgroundColor: "{colors.accent-dark}"
    textColor: "{colors.accent-ink-dark}"
  button-main:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.cloth}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "48px"
  icon-button:
    backgroundColor: "{colors.cloth}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    size: "46px"
  fuel-chip:
    backgroundColor: "{colors.cloth}"
    textColor: "{colors.ink}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    padding: "8px 15px"
    height: "44px"
  fuel-chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
  answer-patch:
    backgroundColor: "{colors.cloth}"
    textColor: "{colors.ink}"
    rounded: "{rounded.patch}"
    padding: "22px 20px 20px 22px"
  station-row:
    backgroundColor: "{colors.cloth}"
    textColor: "{colors.ink}"
    rounded: "{rounded.row}"
    padding: "12px 14px"
  input-field:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "8px 12px"
    height: "48px"
  bottom-tabs:
    backgroundColor: "{colors.cloth}"
    textColor: "{colors.ink-2}"
    height: "52px"
  sheet:
    backgroundColor: "{colors.cloth}"
    textColor: "{colors.ink}"
    rounded: "{rounded.patch}"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  flag:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn-ink}"
    rounded: "{rounded.flag}"
    padding: "2px 8px"
---

# Design System: Plein Sud

## Overview

**Creative North Star: "The Embroidered Tee"**

Plein Sud looks like nothing from the fuel world. The phone is a piece of cloth: cream cotton by day, deep night-blue "fleurs de nuit" by night, and every surface on it is a patch sewn onto that cloth. The one answer that matters (where to fill up, at what price per litre, how far, for how much) is stitched large on a single patch, and a hand-embroidered bouquet climbs that patch's right edge. Everything else (alternatives, the map, favourites, the Carnet) is quieter cloth with the same seams.

The world is carried by three materials only: thread colour, stitch line, and type. Thread colours (dusty rose, lavender blue, coral, ochre, sage, pale sky) belong to the embroidery and to small sewn details; information is set in a warm dark-thread ink (cream thread at night). The stitch line is a dashed 1.5px outline set just inside a patch's edge, the way a running stitch sits inside a hem. Type pairs Young Serif, a soft, ink-trapped display serif for names and headings, with Archivo at condensed widths for every figure, so prices read as hard numerals at arm's length on a soft ground.

Density is low and the hierarchy is steep: one giant price, two side-by-side facts, one full-width button, two compact rows. Motion behaves like sewing: the bouquet stitches itself upward on load and re-stitches when the answer changes; rows slide to their new rank rather than reappearing. The header mark (an eight-petal compass flower in rose thread) is a **provisional logo**, pending the owner's choice; do not build further identity on it.

**Key Characteristics:**
- Cream cloth ground (light) and night-blue cloth (dark), with patches one step lighter than the ground.
- Dashed stitch outlines inset inside patch edges; dashed rings on rank badges and map pins.
- Hand-authored SVG line embroidery: running-stitch dashes, satin hatching, French knots.
- Young Serif for station names and headings; condensed Archivo for every number.
- One ink-thread primary action per view, which turns gold thread at night.
- Motion as sewing: clip-path stitch-in from the bottom, FLIP reorders, drawer sheets.

## Colors

A warm cream cloth carrying soft thread colours by day, inverted into night-blue cloth with cream, silver and gold threads by night; colour lives in the embroidery and small sewn details, never in large fills.

### Primary
- **Dark Thread Ink** (`accent` / `ink`, light): the primary action ("Y aller", "Ajouter au carnet", "Voir les stations") is filled with the same warm near-black as the text, so the button reads as a dense satin-stitched block. Selected fuel chips and selected choices invert to this ink too.
- **Gold Thread** (`accent-dark`): at night the primary action becomes gold thread on night cloth with near-black lettering (`accent-ink-dark`). Gold is also the night satin hatching on leaves and petals.

### Secondary
- **Dusty Rose Thread** (`rose-thread`): the signature sewn detail: header mark, start-point pin icon, active tab icon, dashed rank rings, map pin stitching, the best station's filled pin. `rose` (deeper) is the text colour inside rank badges and the current fuel name in the station sheet, chosen for legibility on cloth.

### Tertiary
- **Lavender Blue** (`lavender`) with **Lavender Fill** (`lavender-fill`): embroidery thread (lavender sprig, French knots) and the selection / focus halo colour (`::selection`, input focus ring).
- **Coral**, **Ochre**, **Sage**, **Pale Sky**: embroidery threads only (coral blossoms, ochre flower hearts and the filled favourite star, sage stems and leaves, sky running-stitch curls). At night sage and sky shift to silver threads (`sage-dark`, `sky-dark`).

### Neutral
- **Cream Ground** (`ground`) / **Night Cloth Ground** (`ground-dark`): page background, theme-color, map background, input wells and choice chips inside sheets.
- **Cloth Patch** (`cloth`) / `cloth-dark`: every raised surface: answer patch, rows, chips at rest, tabs bar, sheets, fill card.
- **Warm Ink** (`ink`) / **Cream Thread** (`ink-dark`): all primary text and figures.
- **Faded Ink** (`ink-2`): secondary text, units, captions, inactive tabs.
- **Seam** (`seam`): solid 1.5px borders on rows, chips, buttons, inputs; grabber; dashed separators in price lists.
- **Stitch** (`stitch`): dashed stitch outlines (answer patch, map, Carnet total, fill card, tab bar top edge, "Voir toutes les stations").
- **Good** (`good`): savings figures only ("2,41 € de moins", Carnet totals). **Warn** (`warn-bg` / `warn-ink`): stale-price and outage flags, negative savings.

### Named Rules
**The Threads-Are-Embroidery Rule.** Rose, lavender, coral, ochre, sage and sky are thread colours: they draw the bouquet and small sewn marks (rings, pins, active icon, mark). They never fill a card, a section or a background.

**The One Satin Block Rule.** Exactly one filled `accent` action per view. Everything else is cloth with a seam.

**The Day-and-Night Pair Rule.** Every colour token exists as a light and a `-dark` pair, switched by `prefers-color-scheme`; the map basemap is recoloured to the same cloth palette in both modes.

## Typography

**Display Font:** Archivo variable, width axis 62–125% (with Arial Narrow, system-ui)
**Name Font:** Young Serif 400 (with Georgia)

**Character:** A soft, old-style serif with ink traps for names, like an embroidered label, against a condensed grotesque for numbers, like a printed price tag. The serif carries warmth; the condensed Archivo carries legibility at arm's length. Tabular numerals are on globally.

### Hierarchy
- **Display** (Archivo 800, width 68%, clamp(76px, 23vw, 100px), line-height 0.86, -0.02em): the answer's price per litre only. The third decimal is a superscript at 0.45em; "€/L" is 15px 600 faded ink beside it.
- **Figure** (Archivo 800, width 72%, 30px, line-height 1): distance and full-tank cost side by side under the price; Carnet total (width 75%, good colour).
- **Figure Row** (Archivo 800, width 72%, 26px): price in alternative rows; 24px in the station sheet price list.
- **Brand** (Young Serif 22px/1): "Plein Sud" in the header.
- **Title** (Young Serif 26px/1.1): view titles ("Tes stations", "Carnet").
- **Headline** (Young Serif 24px/1.12, balanced): the answer's station name.
- **Section** (Young Serif 20–21px): "Ensuite", sheet titles, "Noter un plein", fill card title.
- **Row Name** (Young Serif 17px/1.2, single line, ellipsis): station names in rows.
- **Action** (Archivo 800, width 90%, 21px): "Y aller" (19px inside the station sheet).
- **Chip** (Archivo 700, width 80%, 16px): fuel names in the segmented control; rank numerals 15px 800 width 80%.
- **Body** (Archivo 400, 16px/1.45): running text; explanatory paragraphs capped at 65ch.
- **Label** (Archivo 600, 12–13px): tab labels, field labels, legends (700), captions under figures.

### Named Rules
**The Serif-Names, Condensed-Numbers Rule.** Words that name a place or a section are Young Serif; every quantity (price, km, €, rank, litres) is condensed Archivo 800. Never set a figure in Young Serif or a station name in Archivo.

**The Single-Weight Serif Rule.** Young Serif ships one weight (400). Hierarchy among names comes from size only; never fake-bold it.

## Layout

A single phone column, max 560px wide, centred, full dynamic viewport height. Side gutters are 16px, extended by safe-area insets. Vertical order: slim header (mark, brand, start-point pill on the right), horizontally scrolling fuel chip rail (snap, hidden scrollbar), the active view, and a sticky bottom tab bar (four equal columns: Stations, Carte, Favoris, Carnet).

On the Stations view the answer patch is at least 420px tall; its text block is limited to ~62% width so the bouquet (absolute, right edge, 60% of the patch height, max 50% width) climbs beside it. Facts sit in a row with a 26px gap. Rows are a 3-column grid (30px rank badge, flexible name/meta, right-aligned price/gap). Spacing steps are small and repeated: 6, 8, 10, 12, 14, 16, 22px. Overlays (fill card, toast) sit above the tab bar at bottom offsets of 76px and 84px plus safe area. The map is `min(64dvh, 560px)` tall.

Touch targets are at least 44px everywhere (chips 44, rows ~60, buttons 48, primary 62, tabs 52, icon buttons 46). Hover tints apply only under `(hover: hover) and (pointer: fine)`.

## Elevation & Depth

Depth is cloth on cloth: a patch is one tone lighter than the ground, edged by a seam or an inset stitch, and lifted by a soft, low-spread shadow pulled in with a negative spread so it reads as fabric thickness, not a floating card. Rows and chips are flat (seam border only). Shadows appear on the answer patch and on overlays that genuinely sit above the cloth.

### Shadow Vocabulary
- **Patch lift** (`box-shadow: 0 1px 0 rgba(255,255,255,.4) inset, 0 14px 30px -22px rgba(42, 36, 32, .45)`): the answer patch only.
- **Sheet** (`box-shadow: 0 -14px 34px -18px rgba(14, 10, 8, .45)`): bottom sheets, upward.
- **Fill card** (`box-shadow: 0 18px 40px -18px rgba(14, 10, 8, .55)`): the floating "Tu fais le plein ?" card.
- **Toast** (`box-shadow: 0 10px 24px -12px rgba(14, 10, 8, .5)`).
- **Pin** (`box-shadow: 0 4px 10px -6px rgba(14, 10, 8, .5)`): map pins.

### Named Rules
**The Flat-Rows Rule.** Lists, chips and form wells never carry shadows; only the answer patch and true overlays lift.

## Shapes

Soft, generously rounded, textile corners, growing with the surface: flags 8px, inputs and tabs 12px, buttons / icon buttons / choices / toast 14px, rows 16px, the primary action and panels 18px, the map and fill card 22px, the answer patch and sheet tops 24px. Fuel chips and the start-point pill are full pills (999px). Rank badges and map pins are circles.

The recurring silhouette is the **inset stitch**: a 1.5px dashed outline drawn with `outline` and a negative `outline-offset` (-9px on the answer patch, -7px on map / Carnet total / fill card, -6px on the primary button), so the running stitch sits inside the hem. Dashed rings (1.5–2px dashed rose thread) mark ranks and pins. Separators are dashed seams (tab bar top edge, price list rows).

## Components

### Buttons
Dense and tactile, like a satin-stitched block.
- **Primary "Y aller":** full width, 62px tall, 18px radius, `accent` fill with `accent-ink` text, Archivo 800 width 90% 21px, 24px send icon, optional nav-app suffix in 14px 500. An inner dashed stitch in `accent-stitch` sits 6px inside the edge. Gold with dark lettering at night.
- **Main (`btn-main`):** same fill on a 48px, 14px-radius button for form submits and the fill card's quick action.
- **Secondary:** cloth with a 1.5px seam border, 48px, 14px radius, 700 ink. **Text button:** transparent, faded ink, 44px.
- **Icon button:** 46px square, 14px radius, cloth with seam border; the favourite star fills ochre when pressed.
- **Press:** `scale(0.97)` (0.95 icon buttons, 0.985 rows) over 120ms ease-out; no hover lift. Focus: 3px solid `accent` outline, 2px offset.

### Chips (fuel segmented control and choices)
- **Style:** pill, 44px, cloth with seam border, Archivo 700 width 80%. Selected: inverted to ink fill with ground-coloured text (`aria-checked`). Choices in sheets are 14px-radius, ground-filled, same inversion when pressed.

### Answer Patch (signature)
The single stitched answer. Cloth, 24px radius, dashed `stitch` outline inset 9px, patch-lift shadow, min 420px. Contents: station name (Young Serif headline, tappable to open the station sheet), town, giant display price, two figures (distance, "plein + détour"), the primary button, a footer with the saving in `good` or a stale-price flag and the favourite icon button. The embroidered bouquet climbs the right edge.

### Embroidered Bouquet (signature art)
Hand-authored inline SVG (viewBox 200×380, copy in `web/art/bouquet.svg`). Vocabulary: solid stems (2px sage) doubled by a 1px running-stitch line (`stroke-dasharray: 3.2 1.8`); leaves and the rose's back petals in **satin hatching** (pattern fills of fine lines at 35° and -20°); lavender sprig of paired ellipse **French knots** filled with `lavender-fill`; coral five-petal blossoms with ochre knot hearts; pale-sky running-stitch spiral curls; an ochre French-knot crown at the rose's centre. Strokes 1–2px, round caps and joins, no fills except knots and satin. At night satin hatching switches to ochre (gold) thread.

### Station Rows
Cloth, 16px radius, 1.5px seam border, 12×14px padding. Rank badge: 30px circle with 1.5px dashed rose-thread ring, rose numeral. Name in Young Serif 17px; meta (km · town · stale age) 13px faded; right column price (figure-row) over the gap to the best ("+0,29 €" or "même total"). "Voir toutes les stations" is a 48px transparent button with a dashed stitch border and a chevron that rotates 180° when expanded.

### Inputs / Fields
- **Style:** 48px, 12px radius, ground well inside a cloth form, 1.5px seam border, 17px 500 text; labels 13px 600 faded above.
- **Focus:** border turns `accent`, plus a 3px `lavender-fill` halo.

### Navigation
- **Header:** mark (28px rose compass flower, provisional), "Plein Sud" in Young Serif 22px, start-point pill (pin icon in rose thread, vehicle · radius text, sliders icon) opening the settings sheet; the pin icon breathes (opacity 1.4s) while locating.
- **Bottom tabs:** sticky, cloth, dashed stitch top edge, four 52px columns of icon + 12px 600 label. Inactive faded ink; active ink text with the icon in rose thread. View switch fades in from 6px below over 200ms.

### Bottom Sheets
Native `<dialog>` hosts with a scrim (`scrim`, 240ms fade) and a cloth sheet, 24px top corners, max 90dvh, 40×5px seam grabber, Young Serif title and a close icon button. Slides from `translateY(100%)` over 320ms `cubic-bezier(0.32, 0.72, 0, 1)`; drag down from the grabber or header beyond 90px to dismiss. Used for station details (price list with dashed seams, facts, actions), nav-app choice and Départ et véhicule settings.

### Map Pins
Stitched patches: 30px cloth circles with a 2px dashed rose-thread ring and a condensed rank numeral; the best station is a 40px rose-filled pin with a dashed cloth stitch and a solid rose outline. Overlapping pins fan out by 30px. The user is a 18px accent dot with a cloth ring. Basemap is recoloured to the cloth palette (cream / night blue, pale water, ochre major roads). The map frame carries the inset stitch.

### Fill-Up Card
"Tu fais le plein ?" floats bottom right above the tab bar (max 330px), cloth with inset stitch and fill-card shadow. It grows out of the Carnet tab corner: `transform-origin: 85% 110%`, from `translateY(14px) scale(.6)` and transparent, over 340ms ease-out (opacity 260ms). Actions: quick-log main button, secondary "Modifier…", text "Pas maintenant".

### Toast
Inverted ink pill (14px radius) above the tab bar, 15px text, optional ochre action ("Annuler"); rises 12px and fades in over 220ms; 3.5s, or 5s with an action.

### Flag
Small 8px-radius warn tag with a caution icon for stale prices and reported outages.

### Motion Grammar (applies across components)

Easing tokens: `ease-out` `cubic-bezier(0.23, 1, 0.32, 1)`, `ease-in-out` `cubic-bezier(0.77, 0, 0.175, 1)`, `ease-drawer` `cubic-bezier(0.32, 0.72, 0, 1)`.

- **Stitch-in (load):** the bouquet's stitch group is revealed bottom-to-top by `clip-path: inset(100% 0 0 0)` → `inset(0)` over 1100ms ease-out; it is held hidden by a `pending` class until first data render.
- **Re-stitch:** when the best station (or fuel) changes, the same reveal runs in 600ms and the answer text rises from 6px at 25% opacity over 240ms.
- **Unroll (first render):** alternative rows rise 8px from 30% opacity, 260ms, staggered 50ms.
- **FLIP reorder:** existing rows slide from their old position over 260ms ease-in-out; new rows rise 8px, 220ms, staggered 30ms (max 6).
- **Sheets:** 320ms drawer curve; scrim 240ms.
- **Fill card:** 340ms scale-and-rise from the Carnet corner.
- **Toast:** 220ms. **Favourite toggle:** star pops from 0.88 over 220ms. **Press:** 120ms scale.
- **Reduced motion:** stitch-in becomes a 300ms opacity fade; rows and views fade 180ms with no stagger; sheets, fill card and toast fade (200ms) without translation; press scales and the locating pulse are disabled; FLIP is skipped.

## Do's and Don'ts

### Do:
- **Do** set every station name and heading in Young Serif 400 and every figure in condensed Archivo 800 with tabular numerals.
- **Do** mark patches with a 1.5px dashed `stitch` outline inset 6–9px inside the edge.
- **Do** keep thread colours (rose, lavender, coral, ochre, sage, sky) for embroidery, rings, pins and the active icon.
- **Do** keep exactly one filled `accent` action per view: ink thread by day, gold thread by night.
- **Do** draw new decorative art as SVG line embroidery: running-stitch dashes `3.2 1.8`, satin hatching patterns, French knots, 1–2px round-capped strokes.
- **Do** define every new colour as a light / `-dark` pair and check it on both cloths.
- **Do** give every animation a reduced-motion fallback (fade, no translation).

### Don't:
- **Don't** fill cards, sections or backgrounds with thread colours; the cloth stays cream or night blue.
- **Don't** add shadows to rows, chips or inputs; only the answer patch and overlays lift.
- **Don't** fake a bold Young Serif or set prices in the serif.
- **Don't** treat the compass-flower mark as final identity; it is provisional pending the owner's choice.
- **Don't** reintroduce the previous roadbook vocabulary (ruled cases, highlighter yellow, tulip diagrams, hard frames).
