# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
People in Hamburg with a pollen allergy who open the app daily, mostly on their phone, to check today's pollen forecast and the allergy-relevant trees on their street before they head out.

## Product Purpose
Pollenkarte Hamburg puts today's DWD pollen forecast and the city's street-tree register on one map, so an allergic person can see at a glance what is flying today and where the trees that release it stand around them.

It is a portfolio piece: success means it shows craft with open data and design, and it holds up as a genuinely useful daily tool.

## Positioning
It combines the regional forecast (what is in the air) with the trees on your street (birch, alder, hazel, ash from the Straßenbaumkataster). Forecast apps only show the region and tree maps only show trees. Trees whose pollen is not flying today are dimmed.

## Operating Context
- Quick daily check, phone first, often outdoors or just before leaving the house.
- The DWD updates once a day around 11:00 for the region "Geest, Schleswig-Holstein und Hamburg"; the app picks the entry for the current day and flags stale data.
- The address search uses Hamburg's official address service; "Mein Standort" uses device location.
- There is an off-season state ("Pollenpause") that names the next usual flowering start.

## Capabilities and Constraints
- Forecast for trees, grasses, rye, mugwort and ragweed on a 0–6 scale in half steps. Only the four tree genera have a map layer, because no register records the herbs.
- Map: density heatmap when zoomed out, then one marker per tree in its genus colour and shape at street level; radius counts around a point.
- Only street trees are included. Trees in parks, gardens and forests are missing.
- The user declared no binding constraints. The current choices (no build step, vendored MapLibre, self-hosted fonts, German-only UI, cookieless analytics, no third-party search) describe the implementation and may change.
- The data licences require attribution to Deutscher Wetterdienst (CC BY 4.0) and Freie und Hansestadt Hamburg (dl-de/by-2-0).

## Brand Commitments
Name: "Pollenkarte Hamburg" (short: "Pollenkarte"). The UI copy is German and uses informal "du".

## Evidence on Hand
- Live DWD forecast via `/api/pollen`; spring demo values via `npm run dev:demo`.
- Tree data in `public/data/trees/` (counts and licence in `meta.json`).
- Icons in `public/icons/`; OG image at `public/og.jpg`.
- Earlier explorations in `entwuerfe/`.
- There are no user testimonials, usage figures or press. Do not invent them.

## Product Principles
1. **Today first.** The answer to "what is flying today, and near me?" comes before anything else.
2. **Honest data.** Show the source and date, flag stale or missing forecasts, say what the tree data leaves out, and frame it as orientation, not medical advice.
3. **Glanceable on a phone.** A daily check should take seconds, one-handed.
4. **Craft is the point.** As a portfolio piece, details are held to a high standard.
