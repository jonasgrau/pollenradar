import { DEFAULT_SELECTION, DENSITY_UNTIL, EXAMPLE_SPOT, GENERA, RADIUS_M } from "./config.js";
import { countAround, fetchJson, flyingToday, forecastFromToday, loadGenus, toGeoJSON } from "./data.js";
import { createMap } from "./map.js";
import { setupSearch } from "./search.js";
import { aroundHtml, calendarHtml, chipsHtml, forecastHtml, heroContent, meter, spotSummaryHtml } from "./ui.js";

const STORAGE_KEY = "pollenkarte.auswahl";
const $ = (id) => document.getElementById(id);

function readSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return new Set(saved.filter((id) => GENERA.some((g) => g.id === id)));
  } catch {}
  return new Set(DEFAULT_SELECTION);
}

const state = {
  selected: readSelection(),
  pollen: null,
  pollenError: false,
  forecast: forecastFromToday(null),
  datasets: [],
  spot: null,
};

// Keeps the chosen spot visible next to the panel (desktop) or above the sheet (phone)
function mapPadding() {
  return window.innerWidth > 640
    ? { left: 400, top: 40, right: 40, bottom: 40 }
    : { bottom: Math.round(window.innerHeight * 0.4), top: 40, left: 20, right: 20 };
}

const map = createMap("map", {
  onPick: (lon, lat) => setSpot(lon, lat, "Gewählter Punkt", false),
  onZoom: (zoom) => $("density").classList.toggle("is-hidden", zoom >= DENSITY_UNTIL),
});

// Rendering

function renderHero() {
  const hero = heroContent(state.forecast, state.selected, state.pollenError);
  $("hero-title").textContent = hero.title;
  $("hero-meter").innerHTML = meter(hero.step, hero.color);
  $("hero-text").textContent = hero.text;
}

function renderForecast() {
  $("forecast").innerHTML = state.pollenError
    ? `<p class="hint">Die DWD-Vorhersage ist gerade nicht erreichbar.</p>`
    : forecastHtml(state.forecast, state.selected);
  const p = state.pollen;
  $("forecast-meta").textContent = p
    ? `${p.region} · Stand: ${p.updated}${p.stale ? " (DWD gerade nicht erreichbar)" : ""}`
    : "";
}

function renderAround() {
  if (!state.spot) return;
  const result = countAround(state.datasets, state.spot.lon, state.spot.lat, RADIUS_M);
  $("around").innerHTML = aroundHtml(state.spot, result, state.selected, RADIUS_M);
  const summary = spotSummaryHtml(state.spot, result, state.selected);
  $("spot-summary").innerHTML = summary;
  $("spot-summary").hidden = !summary;
}

function renderAll() {
  $("chips").innerHTML = chipsHtml(state.selected);
  renderHero();
  renderForecast();
  renderAround();
}

// Data

async function refreshTrees() {
  try {
    state.datasets = await Promise.all([...state.selected].map(loadGenus));
    $("trees-error").hidden = true;
  } catch {
    $("trees-error").hidden = false;
  }
  map.setTrees(toGeoJSON(state.datasets, flyingToday(state.forecast)));
  renderAround();
}

async function loadPollen() {
  try {
    state.pollen = await fetchJson("/api/pollen");
    state.pollenError = false;
    state.forecast = forecastFromToday(state.pollen);
  } catch {
    state.pollenError = true;
  }
  renderHero();
  renderForecast();
}

function setSpot(lon, lat, name, fly) {
  state.spot = { lon, lat, name };
  map.showSpot(lon, lat);
  if (fly) map.flyTo(lon, lat, mapPadding());
  renderAround();
}

// Events

$("chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const id = chip.dataset.id;
  state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.selected]));
  } catch {}
  renderAll();
  refreshTrees();
});

function locate() {
  if (!navigator.geolocation) return;
  $("locate-error").hidden = true;
  navigator.geolocation.getCurrentPosition(
    (p) => setSpot(p.coords.longitude, p.coords.latitude, "Dein Standort", true),
    () => ($("locate-error").hidden = false),
    { enableHighAccuracy: true, timeout: 10_000 },
  );
}
$("locate").addEventListener("click", locate);
$("locate-panel").addEventListener("click", locate);
setupSearch({
  input: $("search-input"),
  list: $("search-results"),
  onSelect: (place) => setSpot(place.lon, place.lat, place.name, true),
});
$("example").addEventListener("click", () => setSpot(EXAMPLE_SPOT.lon, EXAMPLE_SPOT.lat, EXAMPLE_SPOT.name, true));

$("grip").addEventListener("click", () => {
  const open = $("panel").classList.toggle("is-open");
  $("grip").setAttribute("aria-expanded", open);
});

$("date").textContent = new Date().toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", timeZone: "Europe/Berlin" });
$("calendar").innerHTML = calendarHtml();
fetchJson("/data/trees/meta.json")
  .then((meta) => ($("trees-updated").textContent = `(Stand der Daten: ${new Date(meta.updated).toLocaleDateString("de-DE")})`))
  .catch(() => {});
renderAll();
await loadPollen();
await refreshTrees();
