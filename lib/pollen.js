"use strict";

// Pollen forecast of the Deutscher Wetterdienst (DWD) for Hamburg.
// Source: https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json
// (updated daily around 11:00, free to use with attribution "Deutscher Wetterdienst")

const DWD_URL = "https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json";
const HAMBURG_PARTREGION = 12; // "Geest, Schleswig-Holstein und Hamburg"
const CACHE_TTL_MS = 60 * 60_000;

const ATTRIBUTION = {
  name: "Pollenflug-Gefahrenindex",
  publisher: "Deutscher Wetterdienst",
  url: "https://www.dwd.de/pollenflug",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.de",
  termsUrl: "https://www.dwd.de/copyright",
};

// DWD codes in half steps; "-1" or anything unknown means "no forecast"
const LEVELS = {
  "0": { step: 0, label: "keine" },
  "0-1": { step: 1, label: "keine bis gering" },
  "1": { step: 2, label: "gering" },
  "1-2": { step: 3, label: "gering bis mittel" },
  "2": { step: 4, label: "mittel" },
  "2-3": { step: 5, label: "mittel bis hoch" },
  "3": { step: 6, label: "hoch" },
};

function parseLevel(code) {
  const level = LEVELS[String(code ?? "").trim()];
  return level ? { code: String(code).trim(), ...level } : null;
}

// "2026-10-11 11:00 Uhr" (German local time) -> "2026-10-11"
function parseDwdDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text || ""));
  if (!match) throw new Error(`Unexpected DWD date: ${text}`);
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Turns the DWD file into { updated, nextUpdate, region, days: [{ date, levels: { Birke: {code, step, label} | null, ... } }] }.
 * DWD's "today" means the day of the last update, so each forecast gets a real date;
 * the app then picks the entry for the actual current day.
 */
function parsePollen(data, partregionId = HAMBURG_PARTREGION) {
  const region = data?.content?.find((c) => c.partregion_id === partregionId);
  if (!region?.Pollen) throw new Error(`DWD data has no partregion ${partregionId}`);

  const issued = parseDwdDate(data.last_update);
  const keys = [
    ["today", 0],
    ["tomorrow", 1],
    ["dayafter_to", 2],
  ];
  const days = keys.map(([key, offset]) => ({
    date: addDays(issued, offset),
    levels: Object.fromEntries(Object.entries(region.Pollen).map(([plant, values]) => [plant, parseLevel(values?.[key])])),
  }));

  return {
    updated: data.last_update,
    nextUpdate: data.next_update || null,
    region: region.partregion_name.replace(",", ", "),
    days,
    source: ATTRIBUTION,
  };
}

let cache = null; // { data, fetchedAt }
let inflight = null;

async function getPollen({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return { ...cache.data, stale: false };

  inflight ??= (async () => {
    const res = await fetchImpl(DWD_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`DWD HTTP ${res.status}`);
    cache = { data: parsePollen(await res.json()), fetchedAt: now };
  })().finally(() => (inflight = null));

  try {
    await inflight;
    return { ...cache.data, stale: false };
  } catch (err) {
    if (cache) return { ...cache.data, stale: true };
    throw err;
  }
}

function resetCache() {
  cache = null;
  inflight = null;
}

// GET /api/pollen (shared by the local dev server and the Vercel function)
async function handlePollenRequest(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const data = await getPollen();
    res.setHeader("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=7200");
    res.statusCode = 200;
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error("Pollen fetch failed:", err.message);
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "Pollenvorhersage gerade nicht erreichbar" }));
  }
}

module.exports = { parsePollen, parseLevel, getPollen, resetCache, handlePollenRequest, DWD_URL };
