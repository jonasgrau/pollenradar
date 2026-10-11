const test = require("node:test");
const assert = require("node:assert/strict");
const { GENERA, genusUrl, fetchAllFeatures, compactGenus, checkPlausible } = require("../lib/trees");

const page = require("./fixtures/trees-page.json");
const erle = GENERA.find((g) => g.id === "erle");

const feature = (lon, lat, props = {}) => ({
  type: "Feature",
  geometry: { type: "MultiPoint", coordinates: [[lon, lat]] },
  properties: { art_deutsch: "Schwarz-Erle", pflanzjahr: 1990, kronendurchmesser: 6, ...props },
});

// Fake fetch that serves a fixed list of responses in order
function fakeFetch(responses) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { ok: next.status === 200, status: next.status, json: async () => next.body };
  };
  return { impl, calls };
}

test("genusUrl requests only the needed fields including the geometry", () => {
  const url = new URL(genusUrl("Betula"));
  assert.equal(url.searchParams.get("gattung_latein"), "Betula");
  assert.deepEqual(url.searchParams.get("properties").split(","), ["geom", "art_deutsch", "pflanzjahr", "kronendurchmesser"]);
});

test("compactGenus turns a real API page into the compact format", () => {
  const data = compactGenus(erle, page.features);
  assert.equal(data.genus, "erle");
  assert.equal(data.trees.length, page.features.length);
  for (const [lon, lat, s, year, crown] of data.trees) {
    assert.ok(lon > 9.7 && lon < 10.4, "lon in Hamburg");
    assert.ok(lat > 53.3 && lat < 53.8, "lat in Hamburg");
    assert.ok(data.species[s], "species index valid");
    assert.ok(year === 0 || year > 1700);
    assert.ok(crown >= 0);
  }
});

test("compactGenus rounds coordinates to 6 decimals", () => {
  const [[lon, lat]] = compactGenus(erle, [feature(9.8498614712, 53.5282515136)]).trees;
  assert.equal(lon, 9.849861);
  assert.equal(lat, 53.528252);
});

test("compactGenus sorts species and trees for stable output", () => {
  const a = compactGenus(erle, [
    feature(10.0, 53.6, { art_deutsch: "Schwarz-Erle" }),
    feature(10.1, 53.5, { art_deutsch: "Grau-Erle" }),
  ]);
  const b = compactGenus(erle, [
    feature(10.1, 53.5, { art_deutsch: "Grau-Erle" }),
    feature(10.0, 53.6, { art_deutsch: "Schwarz-Erle" }),
  ]);
  assert.deepEqual(a, b);
  assert.deepEqual(a.species, ["Grau-Erle", "Schwarz-Erle"]);
  assert.equal(a.trees[0][1], 53.5);
});

test("compactGenus handles missing or implausible values", () => {
  const data = compactGenus(erle, [
    feature(10.0, 53.6, { art_deutsch: null, pflanzjahr: 0, kronendurchmesser: null }),
    feature(10.0, 53.6, { pflanzjahr: 205, kronendurchmesser: -3 }),
    { type: "Feature", geometry: { type: "Point", coordinates: [10.2, 53.55] }, properties: {} },
  ]);
  assert.equal(data.trees.length, 3);
  assert.ok(data.species.includes("Erle, Art unbekannt"));
  for (const [, , , year, crown] of data.trees) {
    assert.equal(year, 0);
    assert.equal(crown, 0);
  }
});

test("compactGenus skips features without usable coordinates", () => {
  const data = compactGenus(erle, [feature(10, 53.6), { type: "Feature", geometry: { type: "MultiPoint", coordinates: [] }, properties: {} }]);
  assert.equal(data.trees.length, 1);
});

test("fetchAllFeatures follows next links across pages", async () => {
  const { impl, calls } = fakeFetch([
    { status: 200, body: { numberMatched: 3, features: [feature(10, 53.6), feature(10.1, 53.6)], links: [{ rel: "next", href: "https://x/page2" }] } },
    { status: 200, body: { numberMatched: 3, features: [feature(10.2, 53.6)], links: [] } },
  ]);
  const features = await fetchAllFeatures("https://x/page1", { fetchImpl: impl, delayMs: 0 });
  assert.equal(features.length, 3);
  assert.deepEqual(calls, ["https://x/page1", "https://x/page2"]);
});

test("fetchAllFeatures retries temporary server errors", async () => {
  const { impl, calls } = fakeFetch([
    { status: 503, body: {} },
    new Error("socket hang up"),
    { status: 200, body: { numberMatched: 1, features: [feature(10, 53.6)], links: [] } },
  ]);
  const features = await fetchAllFeatures("https://x/items", { fetchImpl: impl, delayMs: 0 });
  assert.equal(features.length, 1);
  assert.equal(calls.length, 3);
});

test("fetchAllFeatures gives up after the last retry", async () => {
  const { impl } = fakeFetch([{ status: 503, body: {} }, { status: 503, body: {} }, { status: 503, body: {} }]);
  await assert.rejects(fetchAllFeatures("https://x/items", { fetchImpl: impl, delayMs: 0 }), /HTTP 503/);
});

test("fetchAllFeatures does not retry client errors", async () => {
  const { impl, calls } = fakeFetch([{ status: 400, body: {} }]);
  await assert.rejects(fetchAllFeatures("https://x/items", { fetchImpl: impl, delayMs: 0 }), /HTTP 400/);
  assert.equal(calls.length, 1);
});

test("fetchAllFeatures rejects features without geometry", async () => {
  const { impl } = fakeFetch([{ status: 200, body: { features: [{ type: "Feature", geometry: null, properties: {} }], links: [] } }]);
  await assert.rejects(fetchAllFeatures("https://x/items", { fetchImpl: impl, delayMs: 0 }), /without geometry/);
});

test("fetchAllFeatures rejects incomplete downloads", async () => {
  const { impl } = fakeFetch([{ status: 200, body: { numberMatched: 5, features: [feature(10, 53.6)], links: [] } }]);
  await assert.rejects(fetchAllFeatures("https://x/items", { fetchImpl: impl, delayMs: 0 }), /Expected 5 features, got 1/);
});

test("checkPlausible accepts normal changes and rejects suspicious ones", () => {
  assert.doesNotThrow(() => checkPlausible(erle, 3600, 3655));
  assert.doesNotThrow(() => checkPlausible(erle, 3655, undefined));
  assert.throws(() => checkPlausible(erle, 0, undefined), /no trees/);
  assert.throws(() => checkPlausible(erle, 2000, 3655), /more than 20 % fewer/);
});
