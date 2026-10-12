// Fixed settings of the app

export const HAMBURG = { center: [9.99, 53.56], zoom: 11 };
export const EXAMPLE_SPOT = { name: "Niendorf, Birkengrund", lon: 9.9525, lat: 53.64 };
export const RADIUS_M = 250;
export const DENSITY_UNTIL = 13.5; // zoomed out: density; zoomed in: single trees
export const BASEMAP = "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json";
export const DEFAULT_SELECTION = ["birke", "esche"];

// Colours checked with the palette validator (all pairs, incl. colour vision deficiency).
// Each genus also has its own marker shape, so colour never carries identity alone.
export const GENERA = [
  { id: "birke", name: "Birke", shape: "circle", color: "#2a78d6" },
  { id: "erle", name: "Erle", shape: "square", color: "#eb6834" },
  { id: "hasel", name: "Hasel", shape: "triangle", color: "#1baf7a" },
  { id: "esche", name: "Esche", shape: "diamond", color: "#4a3aa7" },
];

// Typical flowering in northern Germany, January–June: 0 none, 1 possible, 2 main season
export const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun"];
export const SEASON = {
  hasel: [2, 2, 1, 0, 0, 0],
  erle: [1, 2, 2, 0, 0, 0],
  birke: [0, 0, 1, 2, 2, 0],
  esche: [0, 0, 1, 2, 1, 0],
};

// Density as a classic heatmap, from few (blue) to many trees (red): [density, colour]
export const DENSITY_STOPS = [
  [0, "rgba(33,102,172,0)"],
  [0.1, "rgba(65,105,225,0.55)"],
  [0.3, "#00bcd4"],
  [0.5, "#4caf50"],
  [0.7, "#ffeb3b"],
  [0.85, "#ff9800"],
  [1, "#e53935"],
];
