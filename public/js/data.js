// Loading and preparing data; no DOM access, so it can be tested in Node

import { GENERA, RADIUS_M } from "./config.js";

// "2026-10-11" for the current day in Hamburg
export function berlinDate(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now);
}

/**
 * Picks today, tomorrow and the day after from the API's dated forecasts.
 * Days the DWD did not cover stay null, e.g. early in the morning before
 * the daily update the newest file still starts with yesterday.
 */
export function forecastFromToday(pollen, today = berlinDate()) {
  const byDate = new Map((pollen?.days || []).map((d) => [d.date, d.levels]));
  const dates = [0, 1, 2].map((offset) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  });
  return dates.map((date) => ({ date, levels: byDate.get(date) || null }));
}

export function levelOf(day, genus) {
  return day?.levels?.[genus.name] ?? null;
}

// Genera whose pollen is in the air today according to the DWD
export function flyingToday(forecast) {
  return new Set(GENERA.filter((g) => (levelOf(forecast[0], g)?.step ?? 0) > 0).map((g) => g.id));
}

export async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const genusCache = new Map();
export function loadGenus(id) {
  if (!genusCache.has(id)) {
    const promise = fetchJson(`/data/trees/${id}.json`);
    promise.catch(() => genusCache.delete(id)); // retry on the next call
    genusCache.set(id, promise);
  }
  return genusCache.get(id);
}

// While nothing is flying, all trees stay fully visible; otherwise the others are dimmed
export function toGeoJSON(datasets, flying = new Set()) {
  const features = [];
  for (const d of datasets) {
    const active = flying.size === 0 || flying.has(d.genus);
    for (const [lon, lat, s, year, crown] of d.trees) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: { g: d.genus, art: d.species[s], jahr: year, krone: crown, aktiv: active },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

// Distance in metres, accurate enough for a few hundred metres
export function distanceM(lon1, lat1, lon2, lat2) {
  const k = Math.PI / 180;
  const x = (lon2 - lon1) * k * Math.cos(((lat1 + lat2) / 2) * k);
  const y = (lat2 - lat1) * k;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

export function countAround(datasets, lon, lat, radius = RADIUS_M) {
  const counts = {};
  let nearest = null;
  for (const d of datasets) {
    counts[d.genus] = 0;
    for (const [tlon, tlat, s] of d.trees) {
      const dist = distanceM(lon, lat, tlon, tlat);
      if (dist <= radius) counts[d.genus]++;
      if (!nearest || dist < nearest.dist) nearest = { dist, genus: d.genus, art: d.species[s] };
    }
  }
  return { counts, nearest };
}

export function circlePolygon(lon, lat, radius = RADIUS_M, steps = 64) {
  const dLat = radius / 111_320;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const ring = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} };
}
