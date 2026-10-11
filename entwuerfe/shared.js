// Gemeinsame Helfer für die Design-Entwürfe (nur Vorschau, nicht final)

export const HAMBURG = { center: [9.99, 53.56], zoom: 11 };
export const EXAMPLE_SPOT = { name: "Niendorf, Birkengrund", lon: 9.9525, lat: 53.64 };
export const RADIUS_M = 250;

// Kartenausschnitt so verschieben, dass das Bedienfeld den Punkt nicht verdeckt
export function panelPadding() {
  return window.innerWidth > 640 ? { left: 380, top: 20, right: 20, bottom: 20 } : { bottom: Math.round(window.innerHeight * 0.48), top: 20, left: 20, right: 20 };
}

// Farben per Validator geprüft (alle Paare, auch bei Farbsehschwäche);
// zusätzlich hat jede Gattung eine eigene Form, damit Farbe nie allein trägt.
export const GENERA = [
  { id: "birke", name: "Birke", shape: "circle", light: "#2a78d6", dark: "#3987e5", season: "März–Mai" },
  { id: "erle", name: "Erle", shape: "square", light: "#eb6834", dark: "#d95926", season: "Januar–März" },
  { id: "hasel", name: "Hasel", shape: "triangle", light: "#1baf7a", dark: "#199e70", season: "Januar–März" },
  { id: "esche", name: "Esche", shape: "diamond", light: "#4a3aa7", dark: "#e3c14b", season: "März–Mai" },
];

// DWD-Stufen: 0, 0-1, 1, 1-2, 2, 2-3, 3 -> 0..6 Halbschritte
const LEVELS = {
  "0": { step: 0, label: "keine" },
  "0-1": { step: 1, label: "keine bis gering" },
  "1": { step: 2, label: "gering" },
  "1-2": { step: 3, label: "gering bis mittel" },
  "2": { step: 4, label: "mittel" },
  "2-3": { step: 5, label: "mittel bis hoch" },
  "3": { step: 6, label: "hoch" },
};
export const level = (code) => LEVELS[code] || { step: 0, label: "keine Angabe" };
export const DAYS = [
  { key: "today", label: "Heute" },
  { key: "tomorrow", label: "Morgen" },
  { key: "dayafter", label: "Übermorgen" },
];

const params = new URLSearchParams(location.search);
export const isExample = params.has("beispiel");

export async function loadPollen() {
  const res = await fetch(`data/pollen-${isExample ? "beispiel" : "live"}.json`);
  return res.json();
}

const treeCache = new Map();
export async function loadGenus(id) {
  if (!treeCache.has(id)) treeCache.set(id, fetch(`data/${id}.json`).then((r) => r.json()));
  return treeCache.get(id);
}

// Gattungen, deren Pollen heute laut DWD fliegen
export function flyingToday(pollen) {
  return new Set(GENERA.filter((g) => level(pollen.levels[g.name]?.today).step > 0).map((g) => g.id));
}

// Fliegt gerade nichts, bleiben alle Bäume voll sichtbar; sonst werden die anderen gedimmt
export function toGeoJSON(datasets, flying = new Set()) {
  const features = [];
  for (const d of datasets) {
    const aktiv = flying.size === 0 || flying.has(d.genus);
    for (const [lon, lat, s, year, crown] of d.trees) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: { g: d.genus, art: d.species[s], jahr: year, krone: crown, aktiv },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

// Entfernung in Metern (für kleine Distanzen genau genug)
function distanceM(lon1, lat1, lon2, lat2) {
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
  const coords = [];
  const dLat = radius / 111_320;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    coords.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] } };
}

// Marker-Bild pro Gattung: Form in Gattungsfarbe mit hellem/dunklem Rand
export function markerImage(shape, color, ring, size = 28) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const m = size / 2;
  const r = size * 0.32;
  ctx.beginPath();
  if (shape === "circle") ctx.arc(m, m, r, 0, 2 * Math.PI);
  if (shape === "square") ctx.rect(m - r * 0.88, m - r * 0.88, r * 1.76, r * 1.76);
  if (shape === "triangle") {
    ctx.moveTo(m, m - r * 1.1);
    ctx.lineTo(m + r * 1.05, m + r * 0.75);
    ctx.lineTo(m - r * 1.05, m + r * 0.75);
    ctx.closePath();
  }
  if (shape === "diamond") {
    ctx.moveTo(m, m - r * 1.15);
    ctx.lineTo(m + r * 1.0, m);
    ctx.lineTo(m, m + r * 1.15);
    ctx.lineTo(m - r * 1.0, m);
    ctx.closePath();
  }
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = size * 0.07;
  ctx.strokeStyle = ring;
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

// Kleines Symbol für Legenden und Chips (SVG)
export function shapeSvg(shape, color, size = 14) {
  const s = size;
  const m = s / 2;
  const r = s * 0.42;
  const paths = {
    circle: `<circle cx="${m}" cy="${m}" r="${r}"/>`,
    square: `<rect x="${m - r * 0.88}" y="${m - r * 0.88}" width="${r * 1.76}" height="${r * 1.76}"/>`,
    triangle: `<path d="M${m} ${m - r * 1.1}L${m + r * 1.05} ${m + r * 0.75}L${m - r * 1.05} ${m + r * 0.75}Z"/>`,
    diamond: `<path d="M${m} ${m - r * 1.15}L${m + r} ${m}L${m} ${m + r * 1.15}L${m - r} ${m}Z"/>`,
  };
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true" fill="${color}">${paths[shape]}</svg>`;
}

export function addTreeLayers(map, theme, { ring, beforeId } = {}) {
  for (const g of GENERA) {
    const id = `tree-${g.id}`;
    if (!map.hasImage(id)) map.addImage(id, markerImage(g.shape, g[theme], ring), { pixelRatio: 2 });
  }
  map.addSource("trees", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer(
    {
      id: "trees",
      type: "symbol",
      source: "trees",
      minzoom: 12.5,
      layout: {
        "icon-image": ["concat", "tree-", ["get", "g"]],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12.5, 0.45, 15, 0.8, 18, 1.2],
        "icon-allow-overlap": true,
      },
      paint: { "icon-opacity": ["case", ["boolean", ["get", "aktiv"], true], 1, 0.35] },
    },
    beforeId,
  );
}

export function addRadiusLayers(map, color) {
  map.addSource("radius", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": color, "fill-opacity": 0.08 } });
  map.addLayer({ id: "radius-line", type: "line", source: "radius", paint: { "line-color": color, "line-width": 2, "line-dasharray": [2, 2] } });
}

export function showRadius(map, lon, lat) {
  map.getSource("radius")?.setData({
    type: "FeatureCollection",
    features: [circlePolygon(lon, lat), { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: {} }],
  });
}

export function treePopupHtml(p) {
  const g = GENERA.find((x) => x.id === p.g);
  const year = p.jahr ? `gepflanzt ${p.jahr}` : "Pflanzjahr unbekannt";
  const crown = p.krone ? ` · Krone ${p.krone} m` : "";
  return `<strong>${p.art}</strong><br><span>${g?.name || ""} · ${year}${crown}</span>`;
}

// Dunkle Kartenvariante: Helligkeit jeder Stilfarbe umkehren, Farbton behalten.
// Farben stecken auch in Ausdrücken (z. B. je nach Zoomstufe), daher rekursiv.
export function darkenStyle(map) {
  const props = ["background-color", "fill-color", "fill-outline-color", "line-color", "text-color", "text-halo-color", "fill-extrusion-color", "icon-color"];
  for (const layer of map.getStyle().layers) {
    // Symbole der Hintergrundkarte lassen sich nicht umfärben, nur abdimmen
    if (layer.type === "symbol") map.setPaintProperty(layer.id, "icon-opacity", 0.35);
    for (const prop of props) {
      let value;
      try {
        value = map.getPaintProperty(layer.id, prop);
      } catch {
        continue;
      }
      if (value === undefined) continue;
      try {
        map.setPaintProperty(layer.id, prop, darkenValue(value));
      } catch {}
    }
  }
}

const COLOR = /^(#|rgb|hsl)/i;
function darkenValue(value) {
  if (typeof value === "string") return COLOR.test(value) ? invertLightness(value) : value;
  if (Array.isArray(value)) return value.map(darkenValue);
  if (value && typeof value === "object" && Array.isArray(value.stops)) {
    return { ...value, stops: value.stops.map(([z, v]) => [z, darkenValue(v)]) };
  }
  return value;
}

const ctx2d = document.createElement("canvas").getContext("2d");
function invertLightness(css) {
  ctx2d.fillStyle = "#000";
  ctx2d.fillStyle = css;
  const parsed = ctx2d.fillStyle;
  const alphaMatch = /rgba\([^)]*,\s*([\d.]+)\)/.exec(parsed);
  const alpha = alphaMatch ? Number(alphaMatch[1]) : 1;
  let r, g, b;
  if (parsed.startsWith("#")) [r, g, b] = [1, 3, 5].map((i) => parseInt(parsed.slice(i, i + 2), 16) / 255);
  else [r, g, b] = parsed.match(/[\d.]+/g).slice(0, 3).map((n) => Number(n) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  }
  // Weiß wird fast schwarz, Schwarz wird mittelgrau: gedämpfter Kontrast
  const newL = 0.09 + (1 - l) * 0.42;
  return `hsla(${h.toFixed(0)}, ${(s * 40).toFixed(0)}%, ${(newL * 100).toFixed(0)}%, ${alpha})`;
}
