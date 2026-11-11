import { DEFAULT_SELECTION, DENSITY_UNTIL, EXAMPLE_SPOT, GENERA, POLLEN, RADIUS_M } from "./config.js";
import { countAround, fetchJson, flyingToday, forecastFromToday, loadGenus, toGeoJSON } from "./data.js";
import { createMap } from "./map.js";
import { setupSearch } from "./search.js";
import { alsoText, aroundHtml, chipsHtml, clockSvg, forecastHtml, heroContent, spotSummaryHtml, updatedText } from "./ui.js";

const STORAGE_KEY = "pollenkarte.auswahl";
const $ = (id) => document.getElementById(id);

function readSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return new Set(saved.filter((id) => POLLEN.some((g) => g.id === id)));
  } catch {}
  return new Set(DEFAULT_SELECTION);
}

const state = {
  selected: readSelection(),
  pollen: null,
  pollenError: false,
  pollenLoading: true,
  forecast: forecastFromToday(null),
  datasets: [],
  spot: null,
};

// Keeps the chosen spot visible next to the panel (desktop) or above the sheet (phone)
function mapPadding() {
  return window.innerWidth > 640
    ? { left: 420, top: 40, right: 40, bottom: 40 }
    : { bottom: Math.round(window.innerHeight * 0.4), top: 40, left: 20, right: 20 };
}

const map = createMap("map", {
  onPick: (lon, lat) => setSpot(lon, lat, "Gewählter Punkt", "den gewählten Punkt", false),
  onZoom: (zoom) => $("density").classList.toggle("is-hidden", zoom >= DENSITY_UNTIL),
});

// Rendering

let handSwept = false;

function renderHero() {
  const hero = heroContent(state.forecast, state.selected, state.pollenError, state.pollenLoading);
  $("hero-title").textContent = hero.name || hero.title;
  $("hero-level").textContent = hero.level || "";
  $("hero-level").hidden = !hero.level;
  $("hero-text").textContent = hero.text;
  const also = hero.level ? alsoText(state.forecast, state.selected) : "";
  $("hero-also").textContent = also;
  $("hero-also").hidden = !also;

  $("dial").querySelector(".clock")?.remove();
  $("dial").insertAdjacentHTML("afterbegin", clockSvg(state.selected, state.pollenLoading ? null : state.forecast[0].date));
  // The hand sweeps from January to today once, when the forecast first arrives
  const hand = $("dial").querySelector(".hand");
  if (hand && !handSwept && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    hand.classList.add("from-jan");
    requestAnimationFrame(() => requestAnimationFrame(() => hand.classList.remove("from-jan")));
  }
  if (hand) handSwept = true;
}

function renderForecast() {
  $("forecast").innerHTML = state.pollenError
    ? `<p class="hint">Die Vorhersage des DWD ist gerade nicht erreichbar. Lade die Seite in ein paar Minuten neu.</p>`
    : forecastHtml(state.forecast, state.selected);
  const p = state.pollen;
  $("forecast-meta").textContent = p
    ? `Vorhersage des DWD für ${p.region}, Stand: ${updatedText(p.updated, state.forecast[0].date)}.${p.stale ? " Der DWD ist gerade nicht erreichbar, das ist der letzte bekannte Stand." : ""}`
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
  for (const chip of $("chips").querySelectorAll(".chip")) {
    chip.setAttribute("aria-pressed", String(state.selected.has(chip.dataset.id)));
  }
  renderHero();
  renderForecast();
  renderAround();
}

// Data

// Shown only when loading takes noticeably long, so cached data never flickers a message
const STATUS_DELAY_MS = 150;
let treeRequest = 0;

async function refreshTrees() {
  const request = ++treeRequest;
  const trees = GENERA.filter((g) => state.selected.has(g.id));
  $("density").classList.toggle("no-trees", !trees.length);
  const status = setTimeout(() => ($("map-status").hidden = false), STATUS_DELAY_MS);
  try {
    const datasets = await Promise.all(trees.map((g) => loadGenus(g.id)));
    if (request !== treeRequest) return; // a newer selection is already loading
    state.datasets = datasets;
    $("trees-error").hidden = true;
  } catch {
    if (request !== treeRequest) return;
    $("trees-error").hidden = false;
  } finally {
    clearTimeout(status);
    if (request === treeRequest) $("map-status").hidden = true;
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
  state.pollenLoading = false;
  renderHero();
  renderForecast();
}

// name labels the spot on its own, phrase fits into "Im Umkreis von 250 m um …"
function setSpot(lon, lat, name, phrase, fly) {
  state.spot = { lon, lat, name, phrase };
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
    (p) => setSpot(p.coords.longitude, p.coords.latitude, "Dein Standort", "deinen Standort", true),
    () => ($("locate-error").hidden = false),
    { enableHighAccuracy: true, timeout: 10_000 },
  );
}
$("locate").addEventListener("click", locate);
$("locate-panel").addEventListener("click", locate);
// On phones the search floats at the top of the screen. The glass panel's backdrop-filter would
// pin a fixed child to the panel instead, so the search moves out of the panel there.
const phone = window.matchMedia("(max-width: 640px)");
function placeSearch() {
  const search = document.querySelector(".search");
  if (phone.matches) document.body.prepend(search);
  else $("panel").insertBefore(search, document.querySelector(".hero"));
}
phone.addEventListener("change", placeSearch);
placeSearch();
setupSearch({
  input: $("search-input"),
  list: $("search-results"),
  onSelect: (place) => setSpot(place.lon, place.lat, place.name, place.name, true),
});
$("example").addEventListener("click", () => setSpot(EXAMPLE_SPOT.lon, EXAMPLE_SPOT.lat, EXAMPLE_SPOT.name, EXAMPLE_SPOT.phrase, true));

$("grip").addEventListener("click", () => {
  const open = $("panel").classList.toggle("is-open");
  $("grip").setAttribute("aria-expanded", open);
});

$("chips").innerHTML = chipsHtml(state.selected);
// iOS Safari only applies :active (the press feedback) when a touch listener exists
document.addEventListener("touchstart", () => {}, { passive: true });
fetchJson("/data/trees/meta.json")
  .then((meta) => ($("trees-updated").textContent = `(Stand der Daten: ${new Date(meta.updated).toLocaleDateString("de-DE")})`))
  .catch(() => {});
renderAll();
await loadPollen();
await refreshTrees();
