import { DEFAULT_SELECTION, DENSITY_UNTIL, EXAMPLE_SPOT, GENERA, POLLEN, RADIUS_M } from "./config.js";
import { countAround, fetchJson, flyingToday, forecastFromToday, loadGenus, toGeoJSON } from "./data.js";
import { createMap } from "./map.js";
import { setupSearch } from "./search.js";
import { alsoText, aroundHtml, chipsHtml, clockSvg, forecastHtml, heroContent, spotSummaryHtml, updatedText } from "./ui.js";

const STORAGE_KEY = "pollenkarte.auswahl";
const SPOT_KEY = "pollenkarte.ort"; // the last chosen spot, so a daily visit opens on your street
const $ = (id) => document.getElementById(id);
const phone = window.matchMedia("(max-width: 640px)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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

function readSpot() {
  try {
    const s = JSON.parse(localStorage.getItem(SPOT_KEY));
    if (s && Number.isFinite(s.lon) && Number.isFinite(s.lat) && typeof s.name === "string" && typeof s.phrase === "string") return s;
  } catch {}
  return null;
}

function saveSpot(spot) {
  try {
    if (spot) localStorage.setItem(SPOT_KEY, JSON.stringify({ ...spot, lon: +spot.lon.toFixed(5), lat: +spot.lat.toFixed(5) }));
    else localStorage.removeItem(SPOT_KEY);
  } catch {}
}

const map = createMap("map", {
  onPick: (lon, lat) => setSpot(lon, lat, "Gewählter Punkt", "den gewählten Punkt"),
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
  if (hand && !handSwept && !reducedMotion.matches) {
    hand.classList.add("from-jan");
    requestAnimationFrame(() => requestAnimationFrame(() => hand.classList.remove("from-jan")));
  }
  if (hand) handSwept = true;
}

function renderForecast() {
  $("forecast").innerHTML = state.pollenError
    ? `<p class="hint">Die Vorhersage des DWD ist gerade nicht erreichbar.</p><button class="btn retry-btn" id="pollen-retry" type="button">Erneut versuchen</button>`
    : forecastHtml(state.forecast, state.selected);
  const p = state.pollen;
  $("forecast-meta").textContent = p
    ? `Vorhersage des DWD für ${p.region}, Stand: ${updatedText(p.updated, state.forecast[0].date)}.${p.stale ? " Der DWD ist gerade nicht erreichbar, das ist der letzte bekannte Stand." : ""}`
    : "";
}

function renderAround() {
  if (!state.spot) return;
  const result = countAround(state.datasets, state.spot.lon, state.spot.lat, RADIUS_M);
  $("around").innerHTML = `${aroundHtml(state.spot, result, state.selected, RADIUS_M)}<button class="text-btn clear-spot" id="clear-spot" type="button">Ort entfernen</button>`;
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
  const flying = flyingToday(state.forecast);
  const partly = trees.some((g) => flying.has(g.id)) && trees.some((g) => !flying.has(g.id));
  $("density").querySelector("strong").textContent = partly ? "Bäume, die heute blühen" : "Baumdichte";
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
  state.pollenLoading = true;
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

// name labels the spot on its own, phrase fits into "Im Umkreis von 250 m um …".
// fly: move the map there; restore: the remembered spot on page load (jump, keep the panel at the top)
function setSpot(lon, lat, name, phrase, { fly = false, restore = false } = {}) {
  state.spot = { lon, lat, name, phrase };
  saveSpot(state.spot);
  map.showSpot(lon, lat);
  if (fly || restore) map.flyTo(lon, lat, mapPadding(), restore);
  renderAround();
  if (restore) return;
  // The answer must not hide behind the control that asked for it: the phone sheet folds down to its
  // summary line over the map, the desktop panel scrolls the count into view
  if (phone.matches) setSheet(false);
  else $("around").scrollIntoView({ block: "nearest", behavior: reducedMotion.matches ? "auto" : "smooth" });
}

const AROUND_HINT = $("around").innerHTML;
function clearSpot() {
  state.spot = null;
  saveSpot(null);
  map.clearSpot();
  $("around").innerHTML = AROUND_HINT;
  $("spot-summary").hidden = true;
  $("locate-panel").focus(); // the removed button took the focus with it
}

function setSheet(open) {
  $("panel").classList.toggle("is-open", open);
  $("grip").setAttribute("aria-expanded", String(open));
  if (!open) $("panel").scrollTop = 0; // folded, it always shows the top: clock, reading, summary
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
    (p) => setSpot(p.coords.longitude, p.coords.latitude, "Dein Standort", "deinen Standort", { fly: true }),
    () => ($("locate-error").hidden = false),
    { enableHighAccuracy: true, timeout: 10_000 },
  );
}
$("locate").addEventListener("click", locate);
$("locate-panel").addEventListener("click", locate);
// On phones the search floats at the top of the screen. The glass panel's backdrop-filter would
// pin a fixed child to the panel instead, so the search moves out of the panel there.
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
  status: $("search-status"),
  onSelect: (place) => setSpot(place.lon, place.lat, place.name, place.name, { fly: true }),
});
$("example").addEventListener("click", () => setSpot(EXAMPLE_SPOT.lon, EXAMPLE_SPOT.lat, EXAMPLE_SPOT.name, EXAMPLE_SPOT.phrase, { fly: true }));
$("around").addEventListener("click", (e) => e.target.closest("#clear-spot") && clearSpot());

$("trees-retry").addEventListener("click", refreshTrees);
$("forecast").addEventListener("click", async (e) => {
  if (!e.target.closest("#pollen-retry")) return;
  renderHero();
  renderForecast();
  await loadPollen();
  refreshTrees(); // the dimming of trees follows the forecast
});

// Phone sheet: tap the grip to toggle, or drag it between folded and open. The height follows the
// finger; on release it settles on the nearer state, or on the one a quick flick points to.
let drag = null;
let dragged = false;
$("grip").addEventListener("pointerdown", (e) => {
  if (!phone.matches) return;
  drag = { y: e.clientY, t: e.timeStamp, height: $("panel").getBoundingClientRect().height, moved: false };
  $("grip").setPointerCapture(e.pointerId);
});
$("grip").addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dy = drag.y - e.clientY;
  if (!drag.moved && Math.abs(dy) < 6) return;
  drag.moved = true;
  const min = window.innerHeight * 0.2;
  const max = window.innerHeight * 0.85;
  $("panel").style.transition = "none";
  $("panel").style.maxHeight = `${Math.min(max, Math.max(min, drag.height + dy))}px`;
});
function endDrag(e) {
  if (!drag) return;
  const { moved, y, t } = drag;
  drag = null;
  if (!moved) return;
  dragged = true; // the click that follows this pointerup is not a tap
  const height = $("panel").getBoundingClientRect().height;
  const velocity = (y - e.clientY) / Math.max(1, e.timeStamp - t); // px per ms, up is positive
  const open = Math.abs(velocity) > 0.5 ? velocity > 0 : height > window.innerHeight * 0.6;
  $("panel").style.transition = "";
  $("panel").style.maxHeight = "";
  setSheet(open);
}
$("grip").addEventListener("pointerup", endDrag);
$("grip").addEventListener("pointercancel", endDrag);
$("grip").addEventListener("click", () => {
  if (dragged) return void (dragged = false);
  setSheet(!$("panel").classList.contains("is-open"));
});
// Folded, the sheet does not scroll; keyboard focus moving into it opens it (a tap on a chip does not)
$("panel").addEventListener("focusin", (e) => {
  if (phone.matches && !$("panel").classList.contains("is-open") && e.target !== $("grip") && e.target.matches(":focus-visible")) setSheet(true);
});

$("chips").innerHTML = chipsHtml(state.selected);
// iOS Safari only applies :active (the press feedback) when a touch listener exists
document.addEventListener("touchstart", () => {}, { passive: true });
fetchJson("/data/trees/meta.json")
  .then((meta) => ($("trees-updated").textContent = `(Stand der Daten: ${new Date(meta.updated).toLocaleDateString("de-DE")})`))
  .catch(() => {});
renderAll();
const remembered = readSpot();
if (remembered) setSpot(remembered.lon, remembered.lat, remembered.name, remembered.phrase, { restore: true });
await loadPollen();
await refreshTrees();
