# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML, CSS and JavaScript (no framework, no build step) in `web/`, published on GitHub Pages by `.github/workflows/pages.yml`. Data comes from `web/data/latest.json`, exported by the Python pipeline (`python -m carburants export`). Confirmed by the existing codebase.

## Users

The owner (a Montpellier motorcyclist on a CFMoto 450MT, 2026) and his friends, a mix of motorcycle, scooter and car drivers around Montpellier. Two situations, both confirmed: on the road (a quick stop, phone in one hand, possibly gloves, outdoor light) where the answer must come in seconds, and at home before leaving, where they compare stations, look at a map and decide where to go.

## Product Purpose

Tell someone where to fill up around Montpellier for the lowest **total** cost: fuel price plus the fuel burnt on the detour, for their own vehicle. Success: a friend opens the site, sees the right station within seconds, taps through to directions, and comes back next time. Secondary purpose: portfolio piece for a data engineering job application; the site is the visible end of a real data pipeline.

## Positioning

Other fuel apps sort by price per litre. This one ranks by the real cost of the trip for the user's own vehicle (tank fill, consumption, detour), from official prices collected every 6 hours by the owner's own pipeline.

## Operating Context

Phones first (iPhone and Android, in browser or added to the home screen), French language, around Montpellier (départements 34 and 30). Prices come from the official feed "Prix des carburants en France, flux instantané v2" (licence ouverte 2.0); each station's price has its own update time and some are days old.

## Capabilities and Constraints

- Existing: fuel choice, start point (GPS or preset Montpellier places), vehicle profiles (450MT 14 L at 4.5 L/100 km, scooter, car, custom), radius, ranking by total cost, directions link, offline shell.
- Requested next: location request when the site opens; favourites; savings log (fills recorded on the phone, savings vs the zone median); map view; opening hours, 24/24 automatic pump and fuel outages when the official feed provides them.
- No accounts, no server: everything personal stays in the phone's local storage. Location is computed on the device and never sent.
- SP95 is sold by far fewer stations than SP95-E10 in the area (56 vs 207 on 25 Oct 2026). E10 compatibility of the 450MT is unverified.
- Name: "Plein Sud" is provisional; the owner asked for alternatives.

## Evidence on Hand

Real prices and stations in `data/` (collected since 25 Oct 2026). No testimonials, user counts or savings claims exist; none may be invented.

## Product Principles

1. The answer first: the best station for this vehicle is readable at arm's length in seconds.
2. Total cost over price per litre, always explained in one line.
3. Honest data: show how old each price is; never present stale or missing data as current.
4. Personal without accounts: favourites, vehicle and savings live on the phone.
5. Built to be shown: every screen should make the pipeline behind it credible.

## Accessibility & Inclusion

Outdoor readability (high contrast, large numerals), touch targets of at least 44 px for gloved or hurried use, reduced-motion support.
