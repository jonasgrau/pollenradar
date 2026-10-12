// Checks the deployed site and the services the browser relies on.
// Exits non-zero on problems; a failed GitHub Actions run sends an e-mail.
//
//   node scripts/healthcheck.js <base-url>     (or HEALTHCHECK_URL)

const { DWD_URL } = require("../lib/pollen");

const BASE_URL = (process.argv[2] || process.env.HEALTHCHECK_URL || "").replace(/\/$/, "");
const TIMEOUT_MS = 20_000;
const GENERA = ["birke", "erle", "hasel", "esche"];

// Unique query parameter so a CDN cache does not hide a broken function
const bust = () => `_=${Date.now()}`;

async function get(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url.split("?")[0]}`);
  return res;
}

const checks = [
  {
    name: "Startseite lädt",
    async run() {
      const html = await (await get(`${BASE_URL}/`)).text();
      if (!html.includes("Pollenkarte Hamburg") || !html.includes("/js/app.js")) throw new Error("unerwarteter Inhalt");
    },
  },
  {
    name: "Pollenvorhersage (/api/pollen)",
    async run() {
      const data = await (await get(`${BASE_URL}/api/pollen?${bust()}`)).json();
      if (!Array.isArray(data.days) || data.days.length !== 3) throw new Error("keine drei Vorhersagetage");
      if (!/Hamburg/.test(data.region || "")) throw new Error(`falsche Region: ${data.region}`);
      if (data.stale) throw new Error("nur veraltete Daten, DWD-Abfrage schlägt fehl");
      return `Stand ${data.updated}`;
    },
  },
  {
    name: "Baumdaten",
    async run() {
      const meta = await (await get(`${BASE_URL}/data/trees/meta.json?${bust()}`)).json();
      for (const id of GENERA) {
        const count = meta.genera?.[id]?.count;
        if (!(count > 1000)) throw new Error(`${id}: unplausible Anzahl ${count}`);
      }
      const birke = await (await get(`${BASE_URL}/data/trees/birke.json?${bust()}`)).json();
      if (birke.trees?.length !== meta.genera.birke.count) throw new Error("birke.json passt nicht zu meta.json");
      return `${GENERA.reduce((sum, id) => sum + meta.genera[id].count, 0)} Bäume, Stand ${meta.updated}`;
    },
  },
  {
    name: "Hintergrundkarte (basemap.de)",
    async run() {
      const style = await (await get("https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json")).json();
      if (!style.layers?.length) throw new Error("Kartenstil ohne Ebenen");
    },
  },
  {
    name: "Adresssuche (api.hamburg.de)",
    async run() {
      const res = await get("https://api.hamburg.de/addr_search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "addr_search", params: { query_str: "Jungfernstieg", size: 3 } }),
      });
      const hits = (await res.json()).hits?.hits || [];
      if (!hits.length) throw new Error("keine Treffer für „Jungfernstieg“");
    },
  },
];

async function diagnoseDwd() {
  try {
    await get(DWD_URL);
    return "DWD direkt abgefragt: erreichbar.";
  } catch (err) {
    return `DWD direkt abgefragt: nicht erreichbar (${err.message}).`;
  }
}

async function main() {
  if (!BASE_URL) {
    console.error("Keine Adresse angegeben: node scripts/healthcheck.js <url> oder HEALTHCHECK_URL setzen.");
    process.exit(2);
  }
  console.log(`Prüfe ${BASE_URL}\n`);
  let failed = 0;
  for (const check of checks) {
    try {
      const detail = await check.run();
      console.log(`✓ ${check.name}${detail ? ` (${detail})` : ""}`);
    } catch (err) {
      failed++;
      console.log(`✗ ${check.name}: ${err.message}`);
    }
  }
  if (failed) {
    console.log(`\n${await diagnoseDwd()}`);
    console.log(`\n${failed} von ${checks.length} Prüfungen fehlgeschlagen.`);
    process.exit(1);
  }
  console.log("\nAlles in Ordnung.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
