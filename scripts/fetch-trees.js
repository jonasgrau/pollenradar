// Downloads the allergy-relevant street trees and writes one compact file
// per genus plus meta.json. Files are only rewritten when the data changed.
//
//   node scripts/fetch-trees.js [output-dir]     (default: public/data/trees)

const fs = require("fs/promises");
const path = require("path");
const { GENERA, SOURCE, genusUrl, fetchAllFeatures, compactGenus, checkPlausible } = require("../lib/trees");

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const outDir = path.resolve(process.argv[2] || path.join(__dirname, "..", "public", "data", "trees"));
  await fs.mkdir(outDir, { recursive: true });

  const results = [];
  for (const genus of GENERA) {
    const features = await fetchAllFeatures(genusUrl(genus.latin));
    const data = compactGenus(genus, features);
    const file = path.join(outDir, `${genus.id}.json`);
    const previous = await readJson(file);
    checkPlausible(genus, data.trees.length, previous?.trees?.length);
    results.push({ genus, data, file, changed: JSON.stringify(previous) !== JSON.stringify(data) });
  }

  // Only write after every genus passed the checks, so a run never leaves a half-updated set
  for (const r of results) {
    if (r.changed) await fs.writeFile(r.file, JSON.stringify(r.data));
    const { size } = await fs.stat(r.file);
    console.log(`${r.changed ? "aktualisiert" : "unverändert "}  ${r.genus.name.padEnd(6)} ${String(r.data.trees.length).padStart(6)} Bäume, ${r.data.species.length} Arten, ${(size / 1024).toFixed(0)} KB`);
  }

  const metaFile = path.join(outDir, "meta.json");
  const oldMeta = await readJson(metaFile);
  if (results.some((r) => r.changed) || !oldMeta) {
    const meta = {
      updated: new Date().toISOString().slice(0, 10),
      source: SOURCE,
      genera: Object.fromEntries(results.map((r) => [r.genus.id, { name: r.genus.name, count: r.data.trees.length }])),
    };
    await fs.writeFile(metaFile, JSON.stringify(meta, null, 2) + "\n");
    console.log(`meta.json geschrieben (Stand ${meta.updated})`);
  } else {
    console.log("Keine Änderungen.");
  }
}

main().catch((err) => {
  console.error(`Fehler: ${err.message}`);
  process.exit(1);
});
