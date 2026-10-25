---
version: 1
slug: "web-index-html"
primary_target: "web/index.html"
related_targets: []
---

# Surface brief: Plein Sud, écran principal (web/index.html)

Mode: Operate. Audience: owner (CFMoto 450MT) and friends (moto, scooter, car) around Montpellier. Job: find where to fill up for the lowest total cost, in seconds on the road or calmly before leaving. Requested: location on open, favourites, savings log, map, hours/24-24/outages when the feed has them. Code-led. Name stays "Plein Sud".

## Direction contract

THESIS: Every station is a case in a rally roadbook: distance, a tulip pointing the way, notes. The answer is read like a rider reads the next case. Refuses the category default of a grey list of price cards with a map pin icon.

OWN-WORLD: Cool white roll-chart paper, black ink, thick ruled case separators and a faint blue-grey printed grid; highlighter yellow marks the best case and the selection, highlighter orange marks caution (old price, outage). Archivo with its width axis: extra-condensed black for kilometres and prices, normal width for notes. Night mode is the same roadbook under a reader's backlight. Icons drawn as authored SVG strokes, never glyphs.

STORY: The rider sees the first case highlighted (where, how far, how much the fill costs, how much it saves), trusts the age of the price, and taps to go. Later they star stations, open the map, and log fills to see what they saved.

FIRST VIEWPORT: Standard top app bar (name, price freshness, start point), fuel segmented control, then the roadbook: column heads KM / TULIPE / NOTES; case 1 larger, highlighter-swiped, with total fill cost and saving; following cases with gap in euros. Standard bottom tab bar: Classement, Carte, Favoris, Carnet. Primary action: tap a case to open its sheet with "Y aller".

FORM: Rally roadbook (tulip notation), position 1 on the ordered list of seven; assigned by roll was position 3 (moto timing tower), user chose this one. seed:60fe7dedbaac7803. Signature move: data-driven tulip per case (bearing from the start point, rotates when the start point changes) and a highlighter swipe that redraws on the leading case when the ranking changes; rows overtake with FLIP motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

Feed column names for hours, 24/24 automaton and outages are unverified; UI shows them only when present.
