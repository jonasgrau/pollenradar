"use strict";

// Street trees from the Hamburg tree cadastre (OGC API Features),
// reduced to the genera whose pollen the DWD forecasts.

const API = "https://api.hamburg.de/datasets/v1/strassenbaumkataster/collections/strassenbaumkataster_hh";
const PAGE_SIZE = 10_000;
const MAX_DROP = 0.2; // a genus may shrink by at most 20 % between runs

const GENERA = [
  { id: "birke", latin: "Betula", name: "Birke" },
  { id: "erle", latin: "Alnus", name: "Erle" },
  { id: "hasel", latin: "Corylus", name: "Hasel" },
  { id: "esche", latin: "Fraxinus", name: "Esche" },
];

const SOURCE = {
  name: "Straßenbaumkataster Hamburg",
  publisher: "Freie und Hansestadt Hamburg",
  url: "https://api.hamburg.de/datasets/v1/strassenbaumkataster",
  license: "Datenlizenz Deutschland – Namensnennung – Version 2.0",
  licenseUrl: "https://www.govdata.de/dl-de/by-2-0",
};

// Only the fields the app needs; "geom" must be listed or the API drops the geometry
function genusUrl(latin) {
  return `${API}/items?f=json&limit=${PAGE_SIZE}&gattung_latein=${encodeURIComponent(latin)}&properties=geom,art_deutsch,pflanzjahr,kronendurchmesser`;
}

async function fetchJson(url, { fetchImpl = fetch, retries = 3, delayMs = 2000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { permanent: true });
      return await res.json();
    } catch (err) {
      if (err.permanent || attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}

// Follows the "next" links until all pages are loaded
async function fetchAllFeatures(url, options) {
  const features = [];
  let expected = null;
  let next = url;
  while (next) {
    const page = await fetchJson(next, options);
    expected ??= page.numberMatched ?? null;
    for (const f of page.features || []) {
      if (!f.geometry) throw new Error("API returned a feature without geometry");
      features.push(f);
    }
    next = page.links?.find((l) => l.rel === "next")?.href;
  }
  if (expected !== null && features.length !== expected) {
    throw new Error(`Expected ${expected} features, got ${features.length}`);
  }
  return features;
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * { genus, name, species: [names], trees: [[lon, lat, speciesIndex, plantYear, crownM], ...] }
 * Species are sorted by name and trees by position, so unchanged source data
 * produces an identical file (no noise in monthly updates).
 */
function compactGenus(genus, features) {
  const rows = [];
  for (const f of features) {
    const point = f.geometry?.type === "MultiPoint" ? f.geometry.coordinates?.[0] : f.geometry?.coordinates;
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    const p = f.properties || {};
    rows.push({
      lon: round6(point[0]),
      lat: round6(point[1]),
      species: (p.art_deutsch || "").trim() || `${genus.name}, Art unbekannt`,
      year: Number.isInteger(p.pflanzjahr) && p.pflanzjahr > 1700 ? p.pflanzjahr : 0,
      crown: Number.isFinite(p.kronendurchmesser) && p.kronendurchmesser > 0 ? Math.round(p.kronendurchmesser) : 0,
    });
  }

  const species = [...new Set(rows.map((r) => r.species))].sort((a, b) => a.localeCompare(b, "de"));
  const index = new Map(species.map((name, i) => [name, i]));
  rows.sort((a, b) => a.lat - b.lat || a.lon - b.lon || a.species.localeCompare(b.species, "de"));

  return {
    genus: genus.id,
    name: genus.name,
    species,
    trees: rows.map((r) => [r.lon, r.lat, index.get(r.species), r.year, r.crown]),
  };
}

// Guards against publishing a broken download (empty or heavily shrunk data)
function checkPlausible(genus, newCount, previousCount) {
  if (newCount === 0) throw new Error(`${genus.name}: no trees received`);
  if (previousCount && newCount < previousCount * (1 - MAX_DROP)) {
    throw new Error(`${genus.name}: only ${newCount} trees instead of ${previousCount} (more than ${MAX_DROP * 100} % fewer)`);
  }
}

module.exports = { GENERA, SOURCE, genusUrl, fetchJson, fetchAllFeatures, compactGenus, checkPlausible };
