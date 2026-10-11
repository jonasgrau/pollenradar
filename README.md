# Pollenkarte Hamburg

Shows today's tree pollen forecast for Hamburg together with the allergy-relevant street trees (birch, alder, hazel, ash) around you.

- **Pollen forecast:** Deutscher Wetterdienst (DWD), region "Geest, Schleswig-Holstein und Hamburg"
- **Trees:** Straßenbaumkataster Hamburg (Urban Data Platform, `api.hamburg.de`)

Only street trees are included; trees in parks, gardens and forests are missing. This is orientation, not medical advice.

## Data

`public/data/trees/` holds one compact file per genus (`birke`, `erle`, `hasel`, `esche`) plus `meta.json` with source, licence and counts. Each tree is `[lon, lat, speciesIndex, plantYear, crownDiameterM]`; `0` means unknown.

```bash
npm run data:trees   # download and rebuild the tree files
npm test             # unit tests (no network)
```

The script follows the API's paging, retries temporary errors, checks that every page was received and refuses to publish a genus that shrank by more than 20 %. Files are only rewritten when the data changed. A GitHub Action (`update-trees.yml`) runs it on the 3rd of every month and commits changes to `main`; the city updates the cadastre once a year.

Tree data: Freie und Hansestadt Hamburg, Straßenbaumkataster, [Datenlizenz Deutschland – Namensnennung – 2.0](https://www.govdata.de/dl-de/by-2-0).

## Status

Work in progress. `entwuerfe/` contains the design drafts; draft D (`d-kombination.html`) is the chosen direction.

```bash
node scripts/serve.js entwuerfe 8080   # http://localhost:8080
```
