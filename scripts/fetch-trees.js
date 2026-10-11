// Downloads the street trees of the allergy-relevant genera from the Hamburg
// tree cadastre (OGC API Features) and writes one compact file per genus.
//
//   node scripts/fetch-trees.js [output-dir]
//
// Output per genus: { genus, species: [...names], trees: [[lon, lat, speciesIndex, plantYear, crownM], ...] }
// Coordinates are rounded to 6 decimals (about 10 cm).

const fs = require("fs/promises");
const path = require("path");

const API = "https://api.hamburg.de/datasets/v1/strassenbaumkataster/collections/strassenbaumkataster_hh/items";
const PAGE_SIZE = 10_000;

const GENERA = [
  { id: "birke", latin: "Betula", name: "Birke" },
  { id: "erle", latin: "Alnus", name: "Erle" },
  { id: "hasel", latin: "Corylus", name: "Hasel" },
  { id: "esche", latin: "Fraxinus", name: "Esche" },
];

const round = (n) => Math.round(n * 1e6) / 1e6;

async function fetchGenus(latin) {
  const features = [];
  let url = `${API}?f=json&limit=${PAGE_SIZE}&gattung_latein=${latin}&properties=geom,art_deutsch,pflanzjahr,kronendurchmesser`;
  while (url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const page = await res.json();
    features.push(...page.features);
    url = page.links?.find((l) => l.rel === "next")?.href;
    // Without "geom" in the properties list the API drops the geometry
    if (features.length && !features[0].geometry) throw new Error("API returned features without geometry");
  }
  return features;
}

function compact(genus, features) {
  const species = [];
  const speciesIndex = new Map();
  const trees = [];

  for (const f of features) {
    const [lon, lat] = f.geometry?.coordinates?.[0] || [];
    if (lon === undefined) continue;
    const name = f.properties.art_deutsch || genus.name;
    if (!speciesIndex.has(name)) {
      speciesIndex.set(name, species.length);
      species.push(name);
    }
    trees.push([
      round(lon),
      round(lat),
      speciesIndex.get(name),
      f.properties.pflanzjahr || 0,
      f.properties.kronendurchmesser || 0,
    ]);
  }
  return { genus: genus.id, name: genus.name, species, trees };
}

async function main() {
  const outDir = process.argv[2] || path.join(__dirname, "..", "data");
  await fs.mkdir(outDir, { recursive: true });

  for (const genus of GENERA) {
    const features = await fetchGenus(genus.latin);
    const data = compact(genus, features);
    const file = path.join(outDir, `${genus.id}.json`);
    await fs.writeFile(file, JSON.stringify(data));
    const { size } = await fs.stat(file);
    console.log(`${genus.name}: ${data.trees.length} Bäume, ${data.species.length} Arten, ${(size / 1024).toFixed(0)} KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
