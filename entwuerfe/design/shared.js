// Shared wiring for the three design drafts: data, map, chips, search, sheet.
// Each draft only supplies its own hero renderer and stylesheet.
// Served from the project root: node scripts/serve.js . 8090

import { DENSITY_UNTIL, EXAMPLE_SPOT, GENERA, HERBS, POLLEN, RADIUS_M, SEASON, MONTHS } from "/public/js/config.js";
import { berlinDate, countAround, flyingToday, forecastFromToday, levelOf, nextSeason, toGeoJSON } from "/public/js/data.js";
import { heroContent, meter, shapeIcon } from "/public/js/ui.js";
import { setupSearch } from "/public/js/search.js";

export { GENERA, HERBS, POLLEN, SEASON, MONTHS, levelOf, meter, shapeIcon };

// Drafts only: keep a handle on the map so hidden preview panes can be redrawn for screenshots
const OriginalMap = maplibregl.Map;
maplibregl.Map = class extends OriginalMap {
  constructor(options) {
    super(options);
    window.__draftMap = this;
  }
};
const { createMap } = await import("/public/js/map.js");

const $ = (id) => document.getElementById(id);

// Plural names for sentences like "102 Birken und 1 Esche"
const PLURAL = { birke: "Birken", erle: "Erlen", hasel: "Haseln", esche: "Eschen" };
export const countName = (g, n) => (n === 1 ? g.name : PLURAL[g.id] || g.name);

const LABELS = ["keine", "keine bis gering", "gering", "gering bis mittel", "mittel", "mittel bis hoch", "hoch"];
const lvl = (step) => ({ code: String(step), step, label: LABELS[step] });

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Example days so the drafts can be judged with pollen in the air, not only in the autumn pause
const SCENARIOS = {
  heute: { label: "Heute (echt)" },
  fruehling: {
    label: "Frühlingstag",
    date: "2027-04-14",
    days: [
      { Birke: 5, Esche: 3, Erle: 1, Hasel: 0, Graeser: 0, Roggen: 0, Beifuss: 0, Ambrosia: 0 },
      { Birke: 6, Esche: 4, Erle: 0, Hasel: 0, Graeser: 1, Roggen: 0, Beifuss: 0, Ambrosia: 0 },
      { Birke: 4, Esche: 4, Erle: 0, Hasel: 0, Graeser: 1, Roggen: 0, Beifuss: 0, Ambrosia: 0 },
    ],
  },
  sommer: {
    label: "Sommertag",
    date: "2027-06-18",
    days: [
      { Birke: 0, Esche: 0, Erle: 0, Hasel: 0, Graeser: 6, Roggen: 4, Beifuss: 0, Ambrosia: 0 },
      { Birke: 0, Esche: 0, Erle: 0, Hasel: 0, Graeser: 5, Roggen: 3, Beifuss: 0, Ambrosia: 0 },
      { Birke: 0, Esche: 0, Erle: 0, Hasel: 0, Graeser: 4, Roggen: 3, Beifuss: 1, Ambrosia: 0 },
    ],
  },
};

function scenarioPollen(id) {
  const s = SCENARIOS[id];
  return {
    updated: `${s.date} 11:00 Uhr`,
    region: "Geest, Schleswig-Holstein und Hamburg",
    days: s.days.map((levels, i) => ({
      date: addDays(s.date, i),
      levels: Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, lvl(v)])),
    })),
  };
}

// "2026-10-20 11:00 Uhr" -> "heute, 11 Uhr" / "Montag, 19. Oktober, 11 Uhr"
export function updatedText(updated, today) {
  const m = /^(\d{4}-\d{2}-\d{2})\D+(\d{1,2}):(\d{2})/.exec(updated || "");
  if (!m) return updated || "";
  const hour = m[3] === "00" ? `${Number(m[2])} Uhr` : `${Number(m[2])}.${m[3]} Uhr`;
  if (m[1] === today) return `heute, ${hour}`;
  if (m[1] === addDays(today, -1)) return `gestern, ${hour}`;
  const day = new Date(`${m[1]}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return `${day}, ${hour}`;
}

export function longDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/**
 * Everything a hero needs: the ranked chosen pollen for today, the state and the copy.
 * kind: loading | error | empty | pause | missing | quiet | flying
 */
export function heroModel(state) {
  const { forecast, selected, pollenError, pollenLoading } = state;
  const copy = heroContent(forecast, selected, pollenError, pollenLoading);
  const chosen = POLLEN.filter((g) => selected.has(g.id));
  const ranked = chosen
    .map((g) => ({ g, level: levelOf(forecast[0], g) }))
    .sort((a, b) => (b.level?.step ?? -1) - (a.level?.step ?? -1));
  const top = ranked[0];
  const quiet = !top?.level || top.level.step === 0;
  let kind = "flying";
  if (pollenLoading) kind = "loading";
  else if (pollenError) kind = "error";
  else if (!chosen.length) kind = "empty";
  else if (quiet && nextSeason(chosen, forecast[0].date)) kind = "pause";
  else if (!forecast[0].levels) kind = "missing";
  else if (quiet) kind = "quiet";
  return { kind, title: copy.title, text: copy.text, ranked, top, date: forecast[0].date, chosen };
}

// Forecast for the next days as rows of meters; text never carries the colour
function forecastHtml(forecast, selected) {
  const chosen = POLLEN.filter((g) => selected.has(g.id));
  if (!chosen.length) return `<p class="hint">Wähle oben, worauf du reagierst.</p>`;
  const days = ["Heute", "Morgen", "Übermorgen"];
  const head = `<span></span>${days.map((d) => `<span class="head">${d}</span>`).join("")}`;
  const rows = chosen.map((g) => {
    const cells = forecast.map((day) => {
      const level = levelOf(day, g);
      return `<div>${meter(level?.step ?? 0, g.color)}<small>${level ? level.label : "keine Angabe"}</small></div>`;
    });
    return `<span class="gen">${shapeIcon(g)}${g.name}</span>${cells.join("")}`;
  });
  return `<div class="days">${head}${rows.join("")}</div>`;
}

function aroundHtml(spot, result, selected) {
  const trees = GENERA.filter((g) => selected.has(g.id));
  if (!trees.length) return `<p class="hint">Wähle eine Baumart, um die Bäume in der Nähe zu zählen.</p>`;
  const parts = trees.map((g) => {
    const n = result.counts[g.id] ?? 0;
    return `<span class="tally">${shapeIcon(g)}<b>${n}</b> ${countName(g, n)}</span>`;
  });
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} und ${parts.at(-1)}` : parts[0];
  const nearest = result.nearest && result.nearest.dist < 1000
    ? ` Der nächste Baum ist eine ${result.nearest.art}, ${Math.round(result.nearest.dist)} m entfernt.`
    : "";
  return `<p class="around-text">Im Umkreis von ${RADIUS_M} m um ${spot.name} stehen ${list}.${nearest}</p>`;
}

function calendarHtml() {
  const head = `<span></span>${MONTHS.map((m) => `<span class="m" title="${m}">${m[0]}</span>`).join("")}`;
  const rows = POLLEN.map((g) => `<span class="gen">${shapeIcon(g)}${g.name}</span>${SEASON[g.id]
    .map((v, i) => `<i title="${MONTHS[i]}: ${["keine Blüte", "Blüte möglich", "Hauptblüte"][v]}"${v ? ` style="background:${g.color};opacity:${v === 2 ? 1 : 0.45}"` : ""}></i>`)
    .join("")}`);
  return head + rows.join("");
}

function chipsHtml(selected) {
  const chip = (g) => `<button class="chip" type="button" data-id="${g.id}" aria-pressed="${selected.has(g.id)}">${shapeIcon(g)}${g.name}</button>`;
  return `<span class="chips-label">Bäume, auch auf der Karte</span>${GENERA.map(chip).join("")}<span class="chips-label">Gräser und Kräuter, nur Vorhersage</span>${HERBS.map(chip).join("")}`;
}

async function loadTrees(ids) {
  return Promise.all(ids.map((id) => fetch(`/public/data/trees/${id}.json`).then((r) => r.json())));
}

export async function startDraft({ renderHero }) {
  const params = new URLSearchParams(location.search);
  const state = {
    scenario: SCENARIOS[params.get("szenario")] ? params.get("szenario") : "heute",
    selected: new Set(["birke", "esche"]),
    pollen: null,
    pollenError: false,
    pollenLoading: true,
    forecast: forecastFromToday(null),
    datasets: [],
    spot: null,
    firstHero: true,
  };

  const mapPadding = () => (window.innerWidth > 640
    ? { left: 420, top: 40, right: 40, bottom: 40 }
    : { bottom: Math.round(window.innerHeight * 0.4), top: 40, left: 20, right: 20 });
  const map = createMap("map", {
    onPick: (lon, lat) => setSpot(lon, lat, "den gewählten Punkt", false),
    onZoom: (zoom) => $("density").classList.toggle("is-hidden", zoom >= DENSITY_UNTIL),
  });

  function hero() {
    renderHero($("hero"), heroModel(state), { first: state.firstHero && !state.pollenLoading, state });
    if (!state.pollenLoading) state.firstHero = false;
  }

  function forecastSection() {
    $("forecast").innerHTML = state.pollenError
      ? `<p class="hint">Die Vorhersage des DWD ist gerade nicht erreichbar. Lade die Seite in ein paar Minuten neu.</p>`
      : forecastHtml(state.forecast, state.selected);
    const p = state.pollen;
    $("forecast-meta").textContent = p ? `Vorhersage des DWD für ${p.region}, Stand: ${updatedText(p.updated, state.forecast[0].date)}.` : "";
  }

  function around() {
    if (!state.spot) return;
    const result = countAround(state.datasets, state.spot.lon, state.spot.lat, RADIUS_M);
    $("around").innerHTML = aroundHtml(state.spot, result, state.selected);
  }

  function renderAll() {
    for (const chip of $("chips").querySelectorAll(".chip")) chip.setAttribute("aria-pressed", String(state.selected.has(chip.dataset.id)));
    hero();
    forecastSection();
    around();
  }

  async function refreshTrees() {
    const ids = GENERA.filter((g) => state.selected.has(g.id)).map((g) => g.id);
    $("density").classList.toggle("no-trees", !ids.length);
    state.datasets = await loadTrees(ids);
    map.setTrees(toGeoJSON(state.datasets, flyingToday(state.forecast)));
    around();
  }

  async function loadPollen() {
    state.pollenLoading = true;
    hero();
    try {
      if (state.scenario === "heute") {
        state.pollen = await fetch("/api/pollen").then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))));
        state.forecast = forecastFromToday(state.pollen);
      } else {
        state.pollen = scenarioPollen(state.scenario);
        state.forecast = forecastFromToday(state.pollen, SCENARIOS[state.scenario].date);
      }
      state.pollenError = false;
    } catch {
      state.pollenError = true;
    }
    state.pollenLoading = false;
    state.firstHero = true;
    renderAll();
  }

  function setSpot(lon, lat, name, fly) {
    state.spot = { lon, lat, name };
    map.showSpot(lon, lat);
    if (fly) map.flyTo(lon, lat, mapPadding());
    around();
  }

  // Draft bar: switch scenarios
  $("scenarios").innerHTML = Object.entries(SCENARIOS)
    .map(([id, s]) => `<button type="button" data-scenario="${id}" aria-pressed="${id === state.scenario}">${s.label}</button>`)
    .join("");
  $("scenarios").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-scenario]");
    if (!b) return;
    state.scenario = b.dataset.scenario;
    for (const x of $("scenarios").children) x.setAttribute("aria-pressed", String(x === b));
    history.replaceState(null, "", `?szenario=${state.scenario}`);
    await loadPollen();
    refreshTrees();
  });

  $("chips").innerHTML = chipsHtml(state.selected);
  $("chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const id = chip.dataset.id;
    state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
    renderAll();
    refreshTrees();
  });

  const fades = () => {
    const row = $("chips");
    const scrollable = row.scrollWidth > row.clientWidth + 1;
    row.classList.toggle("fade-start", scrollable && row.scrollLeft > 1);
    row.classList.toggle("fade-end", scrollable && row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
  };
  $("chips").addEventListener("scroll", fades, { passive: true });
  window.addEventListener("resize", fades);
  fades();

  const locate = () => navigator.geolocation?.getCurrentPosition(
    (p) => setSpot(p.coords.longitude, p.coords.latitude, "deinen Standort", true),
    () => {},
    { enableHighAccuracy: true, timeout: 10_000 },
  );
  $("locate").addEventListener("click", locate);
  $("locate-panel").addEventListener("click", locate);
  $("example").addEventListener("click", () => setSpot(EXAMPLE_SPOT.lon, EXAMPLE_SPOT.lat, "den Birkengrund in Niendorf", true));
  setupSearch({ input: $("search-input"), list: $("search-results"), onSelect: (p) => setSpot(p.lon, p.lat, p.name, true) });
  $("grip").addEventListener("click", () => {
    const open = $("panel").classList.toggle("is-open");
    $("grip").setAttribute("aria-expanded", open);
  });
  document.addEventListener("touchstart", () => {}, { passive: true });

  const calendar = $("calendar");
  if (calendar) calendar.innerHTML = calendarHtml();

  renderAll();
  await loadPollen();
  await refreshTrees();
  return state;
}

export { berlinDate };
