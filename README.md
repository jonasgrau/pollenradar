# Pollenkarte Hamburg

Shows today's tree pollen forecast for Hamburg together with the allergy-relevant street trees (birch, alder, hazel, ash) around you.

- **Pollen forecast:** Deutscher Wetterdienst (DWD), region "Geest, Schleswig-Holstein und Hamburg"
- **Trees:** Straßenbaumkataster Hamburg (Urban Data Platform, `api.hamburg.de`)

Only street trees are included; trees in parks, gardens and forests are missing. This is orientation, not medical advice.

## Status

Work in progress. `entwuerfe/` contains the design drafts; draft D (`d-kombination.html`) is the chosen direction.

```bash
node scripts/serve.js entwuerfe 8080   # http://localhost:8080
```
