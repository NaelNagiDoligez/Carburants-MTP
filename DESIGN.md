---
name: Plein Sud
description: A rally roadbook in the pocket; every fuel station is a ruled case read at arm's length.
colors:
  frame: "#121416"
  frame-ink: "#F4F5F3"
  frame-muted: "#A9B1B7"
  frame-edge: "#2E3439"
  paper: "#EEF0EE"
  case: "#FFFFFF"
  ink: "#121416"
  ink-2: "#4A5157"
  grid: "#D3DAE0"
  grid-faint: "rgba(118, 146, 170, .16)"
  rule: "#121416"
  highlighter: "#F6E52F"
  highlighter-ink: "#121416"
  caution: "#FF6A13"
  caution-bg: "#FFE4D1"
  caution-ink: "#7A2E00"
  good: "#1C7A47"
  scrim: "rgba(5, 6, 7, .5)"
  frame-dark: "#050607"
  frame-ink-dark: "#ECEFF1"
  frame-muted-dark: "#8F9AA3"
  paper-dark: "#0F1214"
  case-dark: "#171B1E"
  ink-dark: "#ECEFF1"
  ink-2-dark: "#A3ADB5"
  grid-dark: "#283139"
  grid-faint-dark: "rgba(150, 175, 195, .07)"
  rule-dark: "#ECEFF1"
  highlighter-dark: "#EADB2C"
  highlighter-ink-dark: "#121416"
  caution-dark: "#FF7A2E"
  caution-bg-dark: "#3A1C08"
  caution-ink-dark: "#FFC7A3"
  good-dark: "#5FD39A"
typography:
  display:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "52px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 75"
    fontFeature: "'tnum' 1"
  distance-lead:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 62"
    fontFeature: "'tnum' 1"
  distance:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 62"
    fontFeature: "'tnum' 1"
  price:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 75"
    fontFeature: "'tnum' 1"
  headline:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.15
    fontVariation: "'wdth' 85"
  wordmark:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 75"
  title:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    fontVariation: "'wdth' 80"
  station:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.2
    fontVariation: "'wdth' 100"
  body:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
    fontVariation: "'wdth' 100"
    fontFeature: "'tnum' 1"
  meta:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    fontVariation: "'wdth' 100"
  label:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.1em"
    fontVariation: "'wdth' 100"
rounded:
  case-number: "3px"
  pin: "6px"
  control: "10px"
  sheet: "18px"
  pill: "999px"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  cell: "10px"
  lg: "12px"
  gutter: "16px"
  xl: "24px"
  grid: "16px"
  col-km: "58px"
  col-tulip: "64px"
  shell: "560px"
  target: "44px"
components:
  top-bar:
    backgroundColor: "{colors.frame}"
    textColor: "{colors.frame-ink}"
    padding: "10px 16px 12px"
  start-point:
    backgroundColor: "transparent"
    textColor: "{colors.frame-ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "44px"
  fuel-segment:
    backgroundColor: "{colors.case}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
    height: "44px"
  fuel-segment-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.case}"
    rounded: "{rounded.pill}"
  roadbook-head:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    padding: "8px 0 6px"
  roadbook-case:
    backgroundColor: "{colors.case}"
    textColor: "{colors.ink}"
    padding: "{spacing.cell}"
    height: "64px"
  roadbook-case-lead:
    backgroundColor: "{colors.case}"
    textColor: "{colors.ink}"
    padding: "{spacing.cell}"
    height: "150px"
  lead-highlight:
    backgroundColor: "{colors.highlighter}"
    textColor: "{colors.highlighter-ink}"
    typography: "{typography.headline}"
    padding: "0 4px"
  case-number:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.case-number}"
    padding: "0 4px"
    height: "20px"
    width: "22px"
  case-number-lead:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.case}"
    rounded: "{rounded.case-number}"
  tulip:
    textColor: "{colors.ink}"
    size: "34px"
  tulip-lead:
    textColor: "{colors.ink}"
    size: "46px"
  caution-mark:
    backgroundColor: "{colors.caution-bg}"
    textColor: "{colors.caution-ink}"
    padding: "0 4px"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.case}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "46px"
  button-highlighter:
    backgroundColor: "{colors.highlighter}"
    textColor: "{colors.highlighter-ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "46px"
  button-outline:
    backgroundColor: "{colors.case}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "46px"
  icon-button:
    backgroundColor: "{colors.case}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    size: "46px"
  choice:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "46px"
  choice-selected:
    backgroundColor: "{colors.highlighter}"
    textColor: "{colors.highlighter-ink}"
    rounded: "{rounded.control}"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "46px"
  tab:
    backgroundColor: "{colors.frame}"
    textColor: "{colors.frame-muted}"
    rounded: "{rounded.control}"
    padding: "6px 4px"
    height: "52px"
  tab-selected:
    backgroundColor: "{colors.frame}"
    textColor: "{colors.frame-ink}"
  bottom-sheet:
    backgroundColor: "{colors.case}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "8px 16px 18px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.case}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  map-pin:
    backgroundColor: "{colors.case}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pin}"
    size: "26px"
  map-pin-top:
    backgroundColor: "{colors.highlighter}"
    textColor: "{colors.highlighter-ink}"
    rounded: "{rounded.pin}"
    size: "34px"
  map-pin-origin:
    backgroundColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "16px"
---

# Design System: Plein Sud

## Overview

**Creative North Star: "The Pocket Roadbook"**

Plein Sud is a rally roll-chart clipped into an ink holder. The dark frame at top and bottom is the roadbook holder; between them runs a roll of cool white paper printed with a faint blue-grey 16px grid, and on it every station is a ruled case with three columns: KM, TULIPE, NOTES. The rider reads the next case the way a rally rider reads the next instruction: distance in big condensed figures, a drawn tulip pointing the way, then the notes. The best case is longer than the others and its station name is struck with a yellow highlighter; anything to be cautious about gets an orange highlighter. Nothing else is coloured.

Density is high but legible at arm's length: numerals are extra-condensed black Archivo so they can be large without crowding, and everything that is prose (station names, addresses, explanations) runs at normal width. Depth is paper-flat; only the things that physically float over the roll (the bottom sheet and the toast) cast a shadow. Night mode is the same roadbook under a reader's backlight: the paper goes near-black, the ink goes pale, the highlighter stays yellow with dark ink on it.

Motion is mechanical and short, like a roll advancing: cases unroll on first load, overtake each other with FLIP when the ranking changes, the tulip leg swings to its new bearing, and the highlighter redraws left to right across the new leader. Every one of those moves degrades to a plain fade or nothing under reduced motion.

**Key Characteristics:**
- Ink frame (top bar, bottom tabs) around a paper roll printed with a 16px faint grid.
- Ruled cases: 3px ink rule under the column heads, 2px ink rule between cases, 1px grid hairlines between columns.
- Two highlighters only: yellow for the best and the selected, orange for caution.
- Archivo on its width axis: 62–80% for figures, 100% for notes; tabular figures everywhere.
- Authored SVG stroke icons and a data-driven tulip per case; no glyph icons.
- Flat paper; shadows only on floating layers.

## Colors

A monochrome ink-on-paper roadbook with two highlighter pens and one quiet green for savings.

### Primary
- **Highlighter Yellow** (`highlighter`): the best and the selected. Swiped behind the leading station's name, behind the current fuel name in the station sheet, as the fill of the top map pin, the selected choice chip, the filled favourite star, the active tab icon, the settings sheet's main action, text selection, and the 3px halo around a focused field (paired with an ink border). Text on it is always `highlighter-ink`, in both themes.

### Secondary
- **Caution Orange** (`caution`, `caution-bg`, `caution-ink`): the second highlighter. Used only for the caution mark on a case whose price is more than 48 hours old: a pale orange swipe (`caution-bg`) behind dark burnt text (`caution-ink`) with an orange stroked triangle (`caution`). Also tints a negative gain in the fuel log (`caution-ink`).

### Tertiary
- **Saving Green** (`good`): only for the leading case's saving line ("−2,41 € vs la plus proche"). Never a fill, never a button.

### Neutral
- **Holder Ink** (`frame`, `frame-ink`, `frame-muted`, `frame-edge`): the roadbook holder. Top bar and bottom tab bar background, its pale text, its muted secondary text (freshness line, inactive tabs), and the 1px edge of the start-point button. Also the page background outside the 560px shell and the PWA theme colour.
- **Roll Paper** (`paper`): the app background between the frame bars, carrying the faint grid (`grid-faint`, 16px). Also the fill of inputs and unselected choice chips, and the pressed/hovered state of a case.
- **Case White** (`case`): the case surface, sheets, the fuel segments at rest, outline buttons, map pins.
- **Ink** (`ink`, `rule`): text, all rules, control borders, tulip strokes, the selected fuel segment fill, ink buttons, toast background.
- **Pencil Grey** (`ink-2`): secondary text: column heads, addresses, units, "prix affiché il y a…", form labels, legends.
- **Grid Blue-Grey** (`grid`): column hairlines inside cases, list separators, input borders at rest, the sheet grabber, skeleton blocks, the map background while tiles load.

Every role has a dark counterpart with the `-dark` suffix in the frontmatter; they are swapped wholesale under `prefers-color-scheme: dark`, and the component tokens resolve through the same names.

### Named Rules
**The Two Highlighters Rule.** Colour on the roll comes only from a highlighter pen: yellow means "best" or "selected", orange means "be careful". If an element is neither, it is ink, pencil grey or paper.

**The Highlighter Ink Rule.** Text sitting on yellow is always `highlighter-ink` (#121416), in light and in dark mode. The highlighter never carries pale text.

**The Backlight Rule.** Dark mode is not a new palette; it is the same roles relit. Add a role to both sets or not at all.

## Typography

**Display Font:** Archivo variable, width axis 62–125% (self-hosted `fonts/archivo-wdth.woff2`), falling back to Arial Narrow, then system-ui.
**Body Font:** the same Archivo at normal width (100%).

**Character:** one family on two widths. Extra-condensed black figures read like the numbers printed on a rally roll-chart; normal-width text reads like the navigator's handwritten notes beside them.

### Hierarchy
- **Display** (800, 52px, line-height 1, width 75%): the leading case's price per litre; the thousandth digit is a superscript at 0.52em.
- **Distance lead** (800, 44px, line-height 0.95, width 62%): kilometres in the leading case.
- **Distance** (800, 30px, line-height 0.95, width 62%): kilometres in ordinary cases and in the sheet's case strip.
- **Price** (800, 24px, width 75%): price per litre in ordinary cases; 22px in the sheet price list and the radius readout.
- **Headline** (800, 22px, line-height 1.15, width 85%): the leading station's name under the highlighter.
- **Wordmark** (800, 22px, width 75%, uppercase, +0.01em): "PLEIN SUD" in the top bar only.
- **Title** (800, 20px, width 80%): sheet and form headings ("Départ et véhicule", "Noter un plein"). Fill totals use the same voice at 20px width 80% (lead case) and 30px width 75% (log total).
- **Station** (700, 17px, line-height 1.2, width 100%): station names in ordinary cases, clamped to two lines. Fuel segment names use 800 / 17px / width 75%.
- **Body** (400, 16px, line-height 1.45, width 100%): base text; explanatory paragraphs cap at 46–65ch.
- **Meta** (400–600, 12–14px, width 100%): addresses, gaps in euros, ages, units, form labels, station counts in fuel segments.
- **Label** (700, 11px, +0.1em, uppercase): the roadbook column heads (KM / TULIPE / NOTES) and, at +0.14em, the fieldset legends in the settings sheet. These are table and form group labels, never decorative lines above a headline.

### Named Rules
**The Two Widths Rule.** Figures (km, prices, totals, case numbers, pins, the radius readout) are set condensed (62–85%); words that people read as sentences are set at 100%. Never condense a station name in an ordinary case or an explanatory line.

**The Tabular Figures Rule.** `tabular-nums` is set on the body; every number on the roll aligns in its column.

## Layout

A single 560px column centred on the holder-ink page (`shell`). On a phone it fills the width; on desktop the frame colour shows on both sides and nothing reflows into multiple columns. There are no breakpoints; the only media queries are colour scheme, reduced motion, and `(hover: hover) and (pointer: fine)` for hover states.

Vertical order is fixed: sticky top bar (wordmark, price freshness, start-point button), a horizontally scrolling fuel segmented control with snap, the view area on the gridded paper, and a sticky four-column tab bar. Side gutters are 16px, extended by safe-area insets on every edge.

The roadbook is a three-column grid: KM 58px, TULIPE 64px, NOTES the rest. Cells pad 10px. Ordinary cases are at least 64px tall; the leading case is at least 150px, and its action row (Y aller + star) is indented to line up with the NOTES column (58 + 64 + 10px). The station sheet repeats the same three-column strip so a station always reads as its case.

Spacing is small-step and tight: 4, 6, 8, 10, 12, 16, 24px. Every interactive target is at least 44px (buttons and fields 46px, tabs 52px).

## Elevation & Depth

Paper-flat. The roll, the cases, the fuel segments, the buttons and the map frame carry no shadow; depth on the roll is expressed by ink rules and by case white sitting on gridded paper. Only layers that float above the roll cast a shadow, and both shadows point away from their anchor.

### Shadow Vocabulary
- **Sheet lift** (`box-shadow: 0 -12px 32px -16px rgba(5, 6, 7, .35)`): the bottom sheet, casting upward onto the roll, over a 50% ink scrim.
- **Toast lift** (`box-shadow: 0 10px 24px -12px rgba(5, 6, 7, .5)`): the ink toast floating above the tab bar.

### Named Rules
**The Flat Paper Rule.** Nothing printed on the roll has a shadow. If it needs separation, give it an ink rule or a grid hairline. Leaflet's control shadows are explicitly removed and replaced with a 2px ink border.

## Shapes

The roll is square-cornered: cases, the column-head rule, the log total, the map frame have no radius. Controls the hand touches are gently rounded (10px): buttons, icon buttons, choice chips, fields, the start-point button, tab hit areas, the toast. Fuel segments are full pills (999px) to read as a separate control strip. Case numbers are tiny 3px-cornered boxes like printed instruction numbers; map pins are 6px-cornered squares carrying the same numbers. The bottom sheet rounds only its top corners (18px). The highlighter swipe has deliberately uneven corners (3px 7px 4px 8px) so it reads as a pen stroke, sized to 80% of the line height and offset to 62% so it sits slightly low like a real highlighter.

Borders are ink and deliberate: 1.5px ink on controls at rest, 2px ink between cases and around the map and pins, 3px ink under column heads and atop each sheet section.

## Components

### Top Bar (roadbook holder)
- **Style:** `frame` background, sticky, wordmark mark (yellow 30px rounded square with an ink tulip) + "PLEIN SUD" + right-aligned freshness line in `frame-muted`.
- **Start point:** a full-width 44px button with a 1px `frame-edge` border and 10px radius, pin icon, one-line summary ("Depuis ta position · 450MT · 15 km") and a sliders icon. While locating, the pin icon pulses (opacity 0.35 at mid-cycle, 1.2s).

### Fuel Segmented Control
- **Style:** a horizontally scrolling radiogroup of pills (44px, 1.5px ink border, case white). Each pill shows the fuel name (800, 17px, width 75%) and the station count in meta grey.
- **Selected:** ink fill, case-white text, count at 70% opacity.
- **Press:** scale 0.97 over 120ms. **Hover (fine pointer only):** border goes ink.

### Roadbook Case (signature)
- **Structure:** KM | TULIPE | NOTES grid on case white, 2px ink rule below, 1px grid hairlines between columns. KM holds the case number box above the condensed distance and a "km" unit. TULIPE holds the tulip and the bearing in degrees (800, 14px, width 75%). NOTES holds station name and price on the first line, town and the gap to the leader ("+0,29 €" or "même total") on the second, and the caution mark if any.
- **Column heads:** label type in pencil grey sitting on a 3px ink rule.
- **Press / hover:** the case fills with `paper` (120ms).
- **Loading:** skeleton cases keep the grid; text goes transparent and km/notes become `grid` blocks.
- **Empty:** a case-white block with a 2px rule, one sentence and an ink button to widen the radius.

### Lead Case (signature)
- **Structure:** the first case grows to at least 150px; its column hairlines are drawn as background lines so the action row can span under NOTES without breaking them.
- **Highlighter:** the station name (headline type) sits under a yellow swipe that clones across line breaks. When the leader, the fuel or the leading total changes, the swipe redraws from 0% to 100% width over 380ms ease-out.
- **Content:** display price with "€/L", total fill cost with detour ("28,28 € le plein avec détour"), the saving in `good` (or a neutral grey line when there is none), and the price age or caution mark.
- **Actions:** ink "Y aller" button and a star icon button; the star fills yellow when favourited and pops from scale 0.9 over 200ms.
- **Case number:** inverted (ink box, case-white figure).

### Tulip (signature)
- **Style:** a 48-unit SVG drawn at 34px (46px in the lead case): a filled ink start dot at the bottom, a 3px round-capped ink road up to a case-white junction circle with a 2px ink ring, and a leg with an arrowhead rotated to the station's bearing from the start point.
- **Behind:** when the bearing is between 115° and 245°, the leg is replaced by a hairpin U-turn to the left or right, as on a real roadbook; it fades in over 200ms.
- **Motion:** when the start point changes, the leg rotates by the shortest path to the new bearing over 280ms ease-in-out.

### Case Number
- **Style:** a 22×20px box, 1.5px ink border, 3px radius, 800 / 12px / width 85%. Inverted (ink fill) in the lead case. Map pins repeat the same numbers.

### Caution Mark
- **Style:** an inline label (700, 12px) in `caution-ink` with an orange-stroked 14px triangle icon, on a `caution-bg` swipe covering 70% of the line height. Text reads "prix il y a 3 j". Shown when a price is more than 48 hours old.

### Buttons
- **Shape:** gently rounded (10px), 46px tall, 10px 16px padding, 700 weight, icon + label with 8px gap.
- **Ink:** ink fill, case-white text: "Y aller", "Ajouter au carnet", "Chercher jusqu'à…". In dark mode it inverts to a pale fill with dark text.
- **Highlighter:** yellow fill and border, highlighter ink text: the settings sheet's "Voir le classement".
- **Outline:** case white with 1.5px ink border: "Noter un plein ici".
- **Icon button:** 46px square, same border and radius (close, star, share).
- **Press:** scale 0.97 over 120ms ease-out.

### Choice Chips
- **Style:** 46px, 10px radius, `paper` fill with a 1.5px `grid` border; optional meta subtitle ("14 L · 4,5 L/100").
- **Selected:** yellow fill, highlighter-ink text and border. A wide variant spans the sheet ("Ma position").
- **Hover (fine pointer):** border goes ink.

### Inputs / Fields
- **Style:** label above in meta grey (600, 13px); control 46px, 10px radius, `paper` fill, 1.5px `grid` border, 17px / 500 text. Numeric fields use `inputmode="decimal"`.
- **Focus:** border goes ink and a 3px yellow halo surrounds it (`box-shadow: 0 0 0 3px` highlighter).
- **Range:** native slider with ink accent and a condensed 22px readout ("15 km").

### Navigation (bottom tabs)
- **Style:** sticky four-column tab bar on `frame`, 52px targets, stroke icon above a 12px / 600 label in `frame-muted`.
- **Selected:** label goes `frame-ink`, icon goes yellow. **Hover (fine pointer):** label goes `frame-ink`.
- **View change:** the incoming view rises 6px and fades in over 200ms ease-out.

### Bottom Sheet
- **Style:** native `<dialog>` hosting a 50% ink scrim and a case-white sheet, max 560px wide and 90dvh tall, 18px top corners, grabber (40×5px, `grid`), header with title and close icon button, sections opened by a 3px ink rule.
- **Station sheet:** repeats the case strip (number, km, tulip, rank), then the fill total, the price list per fuel (current fuel under the yellow highlighter), optional facts (24/24 automaton, hours, services, outages), actions.
- **Motion:** slides up from 100% over 320ms with the drawer curve; scrim fades over 240ms.

### Toast
- **Style:** ink pill-ish box (10px radius), case-white 15px text, optional yellow 800-weight action ("Annuler"), centred 84px above the bottom edge.
- **Motion:** rises 12px and fades in over 220ms; stays 3.5s (5s with an action).

### Map Pins
- **Station pin:** 26px case-white square, 6px radius, 2px ink border, rank number in 800 / 14px / width 70%.
- **Top pin:** 34px, yellow fill, 17px number, stacked above the others.
- **Origin:** 16px ink dot with a case-white ring.
- **Map frame:** 2px ink border, `grid` background while loading, Leaflet zoom controls restyled as 40px case-white buttons in a 2px ink frame with no shadow, CARTO light or dark tiles following the colour scheme.

### Fuel Log
- **Total block and form:** case white opened by a 3px ink rule and closed by a 2px rule; total in condensed 30px.
- **Entries:** 1px grid separators, gain in condensed 18px (`caution-ink` when negative), 44px delete target.

## Do's and Don'ts

### Do:
- **Do** build every list of stations as roadbook cases on the 58px / 64px / rest grid, with a 2px ink rule between cases and a 3px rule under the column heads.
- **Do** set figures condensed (wdth 62–85%, weight 800) and prose at wdth 100%.
- **Do** use yellow only for the best or the selected item, always with `highlighter-ink` text on it.
- **Do** use the orange caution mark for anything the rider should doubt (stale price), and nothing else.
- **Do** draw icons as inline SVG strokes (1.8px, round caps and joins, 22px), sharing one sprite.
- **Do** keep every touch target at least 44px.
- **Do** give every motion a reduced-motion fallback: unroll and view entry become a 180ms opacity fade; the highlighter swipe, tulip rotation, FLIP reorder, locating pulse and press scale are removed; the sheet and toast only fade.
- **Do** use the three curves as built: ease-out `cubic-bezier(0.23, 1, 0.32, 1)` for entries and presses, ease-in-out `cubic-bezier(0.77, 0, 0.175, 1)` for reorder and tulip rotation, drawer `cubic-bezier(0.32, 0.72, 0, 1)` for the sheet; keep durations between 120ms and 380ms.

### Don't:
- **Don't** render stations as grey rounded cards with a pin icon; that is the category default the roadbook replaces.
- **Don't** add shadows to anything printed on the roll; only the sheet and toast float.
- **Don't** introduce a new accent colour; a role either fits ink, pencil grey, paper, yellow, orange or the saving green, or it doesn't ship.
- **Don't** put pale text on the yellow highlighter, in either theme.
- **Don't** use glyph or emoji icons, or an icon font.
- **Don't** condense station names in ordinary cases, addresses or explanatory text.
