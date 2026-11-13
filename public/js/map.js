// Map: basemap, density heatmap, tree markers, radius circle

import { BASEMAP, DENSITY_QUIET_WEIGHT, DENSITY_STOPS, DENSITY_UNTIL, GENERA, HAMBURG } from "./config.js";
import { circlePolygon } from "./data.js";
import { esc, shapePath } from "./ui.js";

const EMPTY = { type: "FeatureCollection", features: [] };
const INK = "#1e2a22"; // Moor, the text colour of the panel

// MapLibre's own labels, in the language of the page
const LOCALE = {
  "Map.Title": "Karte",
  "NavigationControl.ZoomIn": "Vergrößern",
  "NavigationControl.ZoomOut": "Verkleinern",
  "AttributionControl.ToggleAttribution": "Quellenangaben zeigen oder verbergen",
  "AttributionControl.MapFeedback": "Rückmeldung zur Karte",
  "Popup.Close": "Schließen",
};

// Marker per genus: shape in the genus colour with a white ring
function markerImage(genus, size = 28) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const path = new Path2D(shapePath(genus.shape, size));
  ctx.fillStyle = genus.color;
  ctx.fill(path);
  ctx.lineWidth = size * 0.07;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke(path);
  return ctx.getImageData(0, 0, size, size);
}

function popupHtml(p) {
  const genus = GENERA.find((g) => g.id === p.g);
  const year = p.jahr ? `gepflanzt ${p.jahr}` : "Pflanzjahr unbekannt";
  const crown = p.krone ? `, Krone ${p.krone} m breit` : "";
  return `<strong>${esc(p.art)}</strong><br><span>${esc(genus?.name || "")}, ${year}${crown}</span>`;
}

export function createMap(container, { onPick, onZoom }) {
  const map = new maplibregl.Map({
    container,
    style: BASEMAP,
    center: HAMBURG.center,
    zoom: HAMBURG.zoom,
    minZoom: 9,
    maxBounds: [[9.4, 53.25], [10.6, 53.85]],
    attributionControl: { compact: true },
    locale: LOCALE,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

  const ready = new Promise((resolve) => map.once("load", resolve)).then(() => {
    // On phones the attribution starts folded into its (i) button; the full bar would sit on the sheet
    if (window.matchMedia("(max-width: 640px)").matches) {
      const attribution = map.getContainer().querySelector(".maplibregl-ctrl-attrib");
      attribution?.classList.remove("maplibregl-compact-show");
      attribution?.removeAttribute("open");
    }
    for (const g of GENERA) map.addImage(`tree-${g.id}`, markerImage(g), { pixelRatio: 2 });

    map.addSource("trees", { type: "geojson", data: EMPTY });
    map.addSource("radius", { type: "geojson", data: EMPTY });

    map.addLayer({
      id: "density",
      type: "heatmap",
      source: "trees",
      maxzoom: DENSITY_UNTIL + 0.5,
      paint: {
        // Trees whose pollen is not flying today barely count, so the city view follows today's forecast
        "heatmap-weight": ["case", ["boolean", ["get", "aktiv"], true], 1, DENSITY_QUIET_WEIGHT],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 11, 7, 13, 14],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 9, 0.3, 13, 0.8],
        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], DENSITY_UNTIL - 0.5, 0.8, DENSITY_UNTIL + 0.5, 0],
        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], ...DENSITY_STOPS.flat()],
      },
    });
    map.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": INK, "fill-opacity": 0.06 } });
    map.addLayer({
      id: "radius-line",
      type: "line",
      source: "radius",
      paint: { "line-color": INK, "line-width": 2, "line-dasharray": [2, 2] },
    });
    map.addLayer({
      id: "trees",
      type: "symbol",
      source: "trees",
      minzoom: DENSITY_UNTIL - 0.5,
      layout: {
        "icon-image": ["concat", "tree-", ["get", "g"]],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.5, 15, 0.8, 18, 1.2],
        "icon-allow-overlap": true,
      },
      paint: { "icon-opacity": ["case", ["boolean", ["get", "aktiv"], true], 1, 0.35] },
    });

    map.on("click", (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ["trees"] })[0];
      if (hit) {
        new maplibregl.Popup({ offset: 10, maxWidth: "260px" })
          .setLngLat(hit.geometry.coordinates)
          .setHTML(popupHtml(hit.properties))
          .addTo(map);
      } else {
        onPick(e.lngLat.lng, e.lngLat.lat);
      }
    });
    map.on("mouseenter", "trees", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "trees", () => (map.getCanvas().style.cursor = ""));
    map.on("zoom", () => onZoom(map.getZoom()));
    onZoom(map.getZoom());
  });

  return {
    ready,
    setTrees: (geojson) => ready.then(() => map.getSource("trees").setData(geojson)),
    showSpot: (lon, lat) =>
      ready.then(() =>
        map.getSource("radius").setData({
          type: "FeatureCollection",
          features: [circlePolygon(lon, lat), { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: {} }],
        }),
      ),
    flyTo: (lon, lat, padding) => {
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      map.flyTo({ center: [lon, lat], zoom: 15.5, padding, animate: !reduced });
    },
  };
}
