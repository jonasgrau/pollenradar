// Entwurf D: Pollen-Feldbuch. Reuses the app's data modules; layout, map styling and copy are its own.
// Served from the project root: npm run drafts:design -> http://localhost:8090/entwuerfe/feldbuch/

import { BASEMAP, DEFAULT_SELECTION, DENSITY_UNTIL, EXAMPLE_SPOT, GENERA, HAMBURG, HERBS, POLLEN, RADIUS_M } from "/public/js/config.js";
import { berlinDate, circlePolygon, countAround, flyingToday, forecastFromToday, levelOf } from "/public/js/data.js";
import { alsoText, esc, heroContent, shapePath, updatedText } from "/public/js/ui.js";
import { setupSearch } from "/public/js/search.js";

const $ = (id) => document.getElementById(id);

// Ink per genus, like coloured inks in an old flora; the shapes from the app stay
const INK = { birke: "#3d5a80", erle: "#9a3b22", hasel: "#9a720e", esche: "#2e3a28" };
const LATIN = {
  birke: "Betula", erle: "Alnus", hasel: "Corylus", esche: "Fraxinus",
  graeser: "Poaceae", roggen: "Secale cereale", beifuss: "Artemisia vulgaris", ambrosia: "Ambrosia artemisiifolia",
};
const ROMAN = ["I", "II", "III", "IV"];
const PLURAL = { birke: "Birken", erle: "Erlen", hasel: "Haseln", esche: "Eschen" };
const TICK = `<svg class="tick" viewBox="0 0 34 34" aria-hidden="true"><path d="M5 18c3 2 6 6 8 10 4-9 9-17 17-24"/></svg>`;
const BOX_TICK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13c2 1 4 4 5 7 3-7 7-13 13-17"/></svg>`;

const state = {
  selected: new Set(DEFAULT_SELECTION),
  pollen: null,
  pollenError: false,
  forecast: forecastFromToday(null),
  datasets: [],
  spot: null,
};

// --- Masthead and today's entry -------------------------------------------------------------

function dayOfYear(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
}

function renderStamp() {
  const iso = state.forecast[0].date;
  const d = new Date(`${iso}T12:00:00Z`);
  const month = d.toLocaleDateString("de-DE", { month: "short", timeZone: "UTC" }).replace(".", "");
  $("stamp").innerHTML = `<b>${d.getUTCDate()}. ${month}</b>${d.getUTCFullYear()}`;
  const weekday = d.toLocaleDateString("de-DE", { weekday: "long", timeZone: "UTC" });
  $("entry-no").textContent = `Eintrag ${dayOfYear(iso)} · ${weekday}`;
}

// A pencil note in the margin, derived from the forecast: does it get better or worse tomorrow?
function pencilNote() {
  const chosen = POLLEN.filter((g) => state.selected.has(g.id));
  const top = chosen
    .map((g) => ({ g, today: levelOf(state.forecast[0], g)?.step ?? 0, tomorrow: levelOf(state.forecast[1], g)?.step }))
    .sort((a, b) => b.today - a.today)[0];
  if (!top || top.tomorrow == null) return "";
  if (top.today === 0 && top.tomorrow === 0) return "";
  if (top.tomorrow > top.today) return "morgen noch mehr!";
  if (top.tomorrow < top.today) return top.tomorrow === 0 ? "ab morgen Ruhe" : "morgen etwas besser";
  return "bleibt so";
}

function renderEntry() {
  const loading = !state.pollen && !state.pollenError;
  const hero = heroContent(state.forecast, state.selected, state.pollenError, loading);
  $("verdict").textContent = hero.level ? `${hero.name}, ${hero.level}.` : `${hero.title}.`;
  $("entry-text").textContent = hero.text;
  $("entry-also").textContent = hero.level ? alsoText(state.forecast, state.selected) : "";
  $("pencil").textContent = hero.level ? pencilNote() : "";
}

// --- Plates I to IV: distribution maps drawn from the tree register ----------------------------

const BOUNDS = { w: 9.72, e: 10.33, s: 53.39, n: 53.74 };
const COS = Math.cos((53.56 * Math.PI) / 180);

function drawPlate(canvas, data, color) {
  const ratio = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 180;
  const h = canvas.clientHeight || 135;
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const spanX = (BOUNDS.e - BOUNDS.w) * COS;
  const spanY = BOUNDS.n - BOUNDS.s;
  const k = Math.min(w / spanX, h / spanY);
  const ox = (w - spanX * k) / 2;
  const oy = (h - spanY * k) / 2;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.55;
  for (const [lon, lat] of data.trees) {
    const x = ox + (lon - BOUNDS.w) * COS * k;
    const y = oy + (BOUNDS.n - lat) * k;
    ctx.fillRect(x, y, 0.9, 0.9);
  }
}

function renderPlates() {
  $("plates").innerHTML = GENERA.map((g, i) => {
    const d = state.datasets.find((x) => x.genus === g.id);
    const count = d ? d.trees.length.toLocaleString("de-DE") : "…";
    return `<button class="plate" type="button" data-id="${g.id}" aria-pressed="${state.selected.has(g.id)}">
      <canvas aria-hidden="true"></canvas>${TICK}
      <span class="cap"><span class="typed">Tafel ${ROMAN[i]}</span><i>${LATIN[g.id]}</i> · ${g.name}<span class="typed">${count} Straßenbäume</span></span>
    </button>`;
  }).join("");
  $("plates").querySelectorAll(".plate").forEach((el) => {
    const d = state.datasets.find((x) => x.genus === el.dataset.id);
    if (d) drawPlate(el.querySelector("canvas"), d, INK[el.dataset.id]);
  });

  $("herbs").innerHTML = HERBS.map((h) => `<li><button type="button" data-id="${h.id}" aria-pressed="${state.selected.has(h.id)}">
      <span class="box">${BOX_TICK}</span><span class="herb-name">${h.name}</span><i>${LATIN[h.id]}</i></button></li>`).join("");
}

function toggle(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  render();
  updateMapTrees();
}
document.addEventListener("click", (e) => {
  const el = e.target.closest(".plate, .herbs button");
  if (el) toggle(el.dataset.id);
});

// --- Forecast table -------------------------------------------------------------------------

function dots(step) {
  // DWD steps 0..6 in half steps: one dot per half step
  return `<span class="dots" aria-hidden="true">${Array.from({ length: 6 }, (_, i) => `<i class="${i < step ? "on" : ""}"></i>`).join("")}</span>`;
}

function renderForecast() {
  const chosen = POLLEN.filter((g) => state.selected.has(g.id));
  if (state.pollenError) {
    $("forecast").innerHTML = `<tr><td>Der DWD ist gerade nicht erreichbar.</td></tr>`;
  } else if (!chosen.length) {
    $("forecast").innerHTML = `<tr><td>Oben eine Tafel ankreuzen.</td></tr>`;
  } else {
    const head = `<tr><th></th><th>heute</th><th>morgen</th><th>übermorgen</th></tr>`;
    const rows = chosen.map((g) => `<tr><td>${g.name}</td>${state.forecast
      .map((day) => {
        const l = levelOf(day, g);
        return `<td>${dots(l?.step ?? 0)}<small>${l ? l.label : "k. A."}</small></td>`;
      })
      .join("")}</tr>`);
    $("forecast").innerHTML = head + rows.join("");
  }
  const p = state.pollen;
  $("forecast-meta").textContent = p ? `DWD, ${p.region}. Stand ${updatedText(p.updated, state.forecast[0].date)}.` : "";
}

// --- Around a spot --------------------------------------------------------------------------

function renderAround() {
  if (!state.spot) return;
  const trees = GENERA.filter((g) => state.selected.has(g.id));
  if (!trees.length) {
    $("around").innerHTML = `<p>Kreuz oben eine Baumart an, dann zähle ich nach.</p>`;
    return;
  }
  const result = countAround(state.datasets, state.spot.lon, state.spot.lat, RADIUS_M);
  const parts = trees.map((g) => {
    const n = result.counts[g.id] ?? 0;
    return `<b>${n}</b> ${n === 1 ? g.name : PLURAL[g.id]}`;
  });
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} und ${parts.at(-1)}` : parts[0];
  const nearest = result.nearest && result.nearest.dist < 1000
    ? ` Am nächsten: eine ${esc(result.nearest.art)}, ${Math.round(result.nearest.dist)} m.`
    : "";
  $("around").innerHTML = `<p>${RADIUS_M} m um ${esc(state.spot.name)}: ${list}.${nearest}</p>`;
}

function render() {
  renderStamp();
  renderEntry();
  renderPlates();
  renderForecast();
  renderAround();
}

// --- Map: basemap.de redrawn in sepia, trees in ink -------------------------------------------

const PAPER = [239, 232, 214];
const SEPIA = [58, 50, 38];
const probe = document.createElement("canvas").getContext("2d");

function toSepia(color) {
  probe.fillStyle = "#000";
  probe.fillStyle = color;
  const v = probe.fillStyle; // "#rrggbb" or "rgba(r, g, b, a)"
  let r, g, b, a = 1;
  if (v.startsWith("#")) [r, g, b] = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
  else [r, g, b, a = 1] = v.match(/[\d.]+/g).map(Number);
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const t = Math.pow(l, 0.7); // keep light areas light so the trees carry the colour
  const mix = PAPER.map((p, i) => Math.round(SEPIA[i] + (p - SEPIA[i]) * t));
  return `rgba(${mix.join(",")},${a})`;
}

const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i;
function recolor(value) {
  if (typeof value === "string") return COLOR_RE.test(value) ? toSepia(value) : value;
  if (Array.isArray(value)) return value.map(recolor);
  return value;
}

async function sepiaStyle() {
  try {
    const style = await fetch(BASEMAP).then((r) => r.json());
    for (const layer of style.layers) {
      for (const [key, val] of Object.entries(layer.paint || {})) {
        if (key.endsWith("-color")) layer.paint[key] = recolor(val);
      }
      if (/wasser|water|gewaesser/i.test(layer.id) && layer.type === "fill") layer.paint["fill-color"] = "#d8d6c4";
    }
    return style;
  } catch {
    return { version: 8, sources: {}, layers: [{ id: "paper", type: "background", paint: { "background-color": "#efe8d6" } }] };
  }
}

function markerImage(genus, size = 26) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const path = new Path2D(shapePath(genus.shape, size));
  ctx.fillStyle = INK[genus.id];
  ctx.fill(path);
  ctx.lineWidth = size * 0.08;
  ctx.strokeStyle = "#f3ecda";
  ctx.stroke(path);
  return ctx.getImageData(0, 0, size, size);
}

const map = new maplibregl.Map({
  container: "map",
  style: await sepiaStyle(),
  center: HAMBURG.center,
  zoom: HAMBURG.zoom,
  minZoom: 9,
  maxBounds: [[9.4, 53.25], [10.6, 53.85]],
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
const mapReady = new Promise((resolve) => map.once("load", resolve));

mapReady.then(() => {
  for (const g of GENERA) map.addImage(`tree-${g.id}`, markerImage(g), { pixelRatio: 2 });
  map.addSource("trees", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource("spot", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  // Density as an ink wash instead of a rainbow
  map.addLayer({
    id: "density", type: "heatmap", source: "trees", maxzoom: DENSITY_UNTIL + 0.5,
    paint: {
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 11, 7, 13, 14],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 9, 0.3, 13, 0.8],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], DENSITY_UNTIL - 0.5, 0.9, DENSITY_UNTIL + 0.5, 0],
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(60,45,30,0)", 0.12, "rgba(60,45,30,0.12)", 0.4, "rgba(80,55,30,0.26)", 0.7, "rgba(110,62,28,0.42)", 1, "rgba(92,46,20,0.6)"],
    },
  });
  map.addLayer({ id: "spot-line", type: "line", source: "spot", paint: { "line-color": "#a3362c", "line-width": 1.6, "line-dasharray": [3, 2] } });
  map.addLayer({
    id: "trees", type: "symbol", source: "trees", minzoom: DENSITY_UNTIL - 0.5,
    layout: { "icon-image": ["concat", "tree-", ["get", "g"]], "icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.5, 15, 0.8, 18, 1.2], "icon-allow-overlap": true },
    paint: { "icon-opacity": ["case", ["boolean", ["get", "aktiv"], true], 1, 0.35] },
  });
  map.on("click", (e) => {
    const hit = map.queryRenderedFeatures(e.point, { layers: ["trees"] })[0];
    if (hit) {
      const p = hit.properties;
      new maplibregl.Popup({ offset: 10, maxWidth: "240px" })
        .setLngLat(hit.geometry.coordinates)
        .setHTML(`<i>${esc(p.art)}</i><br>${p.jahr ? `gepflanzt ${p.jahr}` : "Pflanzjahr unbekannt"}${p.krone ? `, Krone ${p.krone} m` : ""}`)
        .addTo(map);
    } else setSpot(e.lngLat.lng, e.lngLat.lat, "den gewählten Punkt", false);
  });
});

function updateMapTrees() {
  const flying = flyingToday(state.forecast);
  const features = [];
  for (const d of state.datasets) {
    if (!state.selected.has(d.genus)) continue;
    const aktiv = flying.size === 0 || flying.has(d.genus);
    for (const [lon, lat, s, jahr, krone] of d.trees) {
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { g: d.genus, art: d.species[s], jahr, krone, aktiv } });
    }
  }
  mapReady.then(() => map.getSource("trees").setData({ type: "FeatureCollection", features }));
  const names = GENERA.filter((g) => state.selected.has(g.id)).map((g) => PLURAL[g.id]);
  $("caption").textContent = names.length
    ? `${names.length > 1 ? `${names.slice(0, -1).join(", ")} und ${names.at(-1)}` : names[0]} an Hamburgs Straßen.`
    : "Hamburgs Straßen, noch ohne Bäume.";
}

function setSpot(lon, lat, name, fly = true) {
  state.spot = { lon, lat, name };
  renderAround();
  mapReady.then(() => {
    map.getSource("spot").setData({ type: "FeatureCollection", features: [circlePolygon(lon, lat)] });
    if (fly) map.flyTo({ center: [lon, lat], zoom: 15.5 });
  });
}

$("example").addEventListener("click", () => setSpot(EXAMPLE_SPOT.lon, EXAMPLE_SPOT.lat, "den Birkengrund"));
$("locate").addEventListener("click", () =>
  navigator.geolocation?.getCurrentPosition((p) => setSpot(p.coords.longitude, p.coords.latitude, "deinen Standort")));
setupSearch({ input: $("search-input"), list: $("search-results"), onSelect: (p) => setSpot(p.lon, p.lat, p.name) });

// --- Loading --------------------------------------------------------------------------------

render();

Promise.all(GENERA.map((g) => fetch(`/public/data/trees/${g.id}.json`).then((r) => r.json()).then((d) => ({ ...d, genus: d.genus || g.id }))))
  .then((datasets) => {
    state.datasets = datasets;
    renderPlates();
    updateMapTrees();
    renderAround();
  });
fetch("/public/data/trees/meta.json").then((r) => r.json()).then((m) => ($("trees-updated").textContent = `(Stand ${m.updated})`)).catch(() => {});

fetch("/api/pollen")
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
  .then((pollen) => {
    state.pollen = pollen;
    state.forecast = forecastFromToday(pollen, berlinDate());
  })
  .catch(() => (state.pollenError = true))
  .finally(() => {
    render();
    updateMapTrees();
  });
