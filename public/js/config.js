// Fixed settings of the app

export const HAMBURG = { center: [9.99, 53.56], zoom: 11 };
export const EXAMPLE_SPOT = { name: "Niendorf, Birkengrund", phrase: "den Birkengrund in Niendorf", lon: 9.9525, lat: 53.64 };
export const RADIUS_M = 250;
export const DENSITY_UNTIL = 13.5; // zoomed out: density; zoomed in: single trees
export const BASEMAP = "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json";
export const DEFAULT_SELECTION = ["birke", "esche"];

// Natural inks: birch slate blue, alder rust, hazel ochre, ash plum. Checked pairwise in CIELAB,
// also under simulated protan, deutan and tritan vision; 3:1 or more against the panel.
// Each genus also has its own marker shape, so colour never carries identity alone.
export const GENERA = [
  { id: "birke", name: "Birke", shape: "circle", color: "#3d5a80" },
  { id: "erle", name: "Erle", shape: "square", color: "#a8452c" },
  { id: "hasel", name: "Hasel", shape: "triangle", color: "#a37a12" },
  { id: "esche", name: "Esche", shape: "diamond", color: "#6a3d5a" },
];

// Pollen the DWD forecasts but the tree register does not contain: forecast only, no map layer.
// They share one colour; the label and the grass icon tell them apart.
export const HERB_COLOR = "#7a6a3a";
export const HERBS = [
  { id: "graeser", name: "Gräser", dwd: "Graeser", plural: true },
  { id: "roggen", name: "Roggen", dwd: "Roggen" },
  { id: "beifuss", name: "Beifuß", dwd: "Beifuss" },
  { id: "ambrosia", name: "Ambrosia", dwd: "Ambrosia" },
].map((h) => ({ ...h, shape: "grass", color: HERB_COLOR }));

// Everything that can be chosen, trees first
export const POLLEN = [...GENERA, ...HERBS];

// Typical flowering in northern Germany per month: 0 none, 1 possible, 2 main season
export const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
export const SEASON = {
  hasel: [2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  erle: [1, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  birke: [0, 0, 1, 2, 2, 0, 0, 0, 0, 0, 0, 0],
  esche: [0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0],
  graeser: [0, 0, 0, 0, 1, 2, 2, 1, 0, 0, 0, 0],
  roggen: [0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0],
  beifuss: [0, 0, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0],
  ambrosia: [0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0, 0],
};

// Density in one calm hue, from faint to full Laub. No ochre or rust: those read
// as pollen severity, and density says where trees stand, not how much is flying: [density, colour]
export const DENSITY_STOPS = [
  [0, "rgba(63,107,78,0)"],
  [0.1, "rgba(63,107,78,0.22)"],
  [0.4, "rgba(63,107,78,0.45)"],
  [0.75, "rgba(63,107,78,0.7)"],
  [1, "#3f6b4e"],
];
// Weight in the density of trees whose pollen is not in the air today
export const DENSITY_QUIET_WEIGHT = 0.12;
