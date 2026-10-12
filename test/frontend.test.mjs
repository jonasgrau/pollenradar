// Tests for the browser modules that do not touch the DOM
import test from "node:test";
import assert from "node:assert/strict";
import { berlinDate, forecastFromToday, flyingToday, toGeoJSON, countAround, distanceM, circlePolygon } from "../public/js/data.js";
import { heroContent, shapePath, esc } from "../public/js/ui.js";
import { GENERA } from "../public/js/config.js";

const lvl = (step, label) => ({ code: String(step), step, label });
const pollen = {
  days: [
    { date: "2027-04-14", levels: { Birke: lvl(5, "mittel bis hoch"), Esche: lvl(2, "gering"), Erle: lvl(0, "keine"), Hasel: lvl(0, "keine") } },
    { date: "2027-04-15", levels: { Birke: lvl(6, "hoch"), Esche: lvl(4, "mittel"), Erle: lvl(0, "keine"), Hasel: lvl(0, "keine") } },
    { date: "2027-04-16", levels: { Birke: null, Esche: lvl(3, "gering bis mittel"), Erle: lvl(0, "keine"), Hasel: lvl(0, "keine") } },
  ],
};

test("berlinDate uses the Hamburg calendar day", () => {
  // 23:30 UTC on 14 April is already 15 April in Hamburg (summer time)
  assert.equal(berlinDate(new Date("2027-04-14T23:30:00Z")), "2027-04-15");
  assert.equal(berlinDate(new Date("2027-01-14T22:30:00Z")), "2027-01-14");
});

test("forecastFromToday lines up the DWD days with the current day", () => {
  const f = forecastFromToday(pollen, "2027-04-14");
  assert.deepEqual(f.map((d) => d.date), ["2027-04-14", "2027-04-15", "2027-04-16"]);
  assert.equal(f[0].levels.Birke.step, 5);
});

test("forecastFromToday shifts when the newest file is from yesterday", () => {
  // Early morning before the DWD update: the file still starts with yesterday
  const f = forecastFromToday(pollen, "2027-04-15");
  assert.equal(f[0].levels.Birke.label, "hoch");
  assert.equal(f[1].levels.Birke, null);
  assert.equal(f[2].levels, null);
});

test("flyingToday lists genera with pollen today", () => {
  const f = forecastFromToday(pollen, "2027-04-14");
  assert.deepEqual([...flyingToday(f)].sort(), ["birke", "esche"]);
  assert.equal(flyingToday(forecastFromToday(null, "2027-04-14")).size, 0);
});

test("heroContent names the strongest selected pollen", () => {
  const f = forecastFromToday(pollen, "2027-04-14");
  const hero = heroContent(f, new Set(["birke", "esche"]), false);
  assert.equal(hero.title, "Birke: mittel bis hoch");
  assert.equal(hero.step, 5);
  assert.equal(hero.text, "Morgen hoch, übermorgen keine Angabe.");
});

test("heroContent covers quiet, missing and error cases", () => {
  const f = forecastFromToday(pollen, "2027-04-14");
  assert.equal(heroContent(f, new Set(["erle"]), false).title, "Keine Baumpollen");
  assert.equal(heroContent(f, new Set(), false).title, "Wähle deine Allergien");
  assert.equal(heroContent(forecastFromToday(pollen, "2027-05-01"), new Set(["birke"]), false).title, "Noch keine Vorhersage für heute");
  assert.equal(heroContent(f, new Set(["birke"]), true).title, "Vorhersage nicht erreichbar");
});

const birke = { genus: "birke", species: ["Sand-Birke"], trees: [[9.9525, 53.64, 0, 1980, 8], [9.9525, 53.6418, 0, 1990, 6], [10.0, 53.64, 0, 0, 0]] };
const esche = { genus: "esche", species: ["Gemeine Esche"], trees: [[9.9526, 53.6401, 0, 2000, 5]] };

test("toGeoJSON dims trees whose pollen is not flying", () => {
  const all = toGeoJSON([birke, esche]);
  assert.equal(all.features.length, 4);
  assert.ok(all.features.every((f) => f.properties.aktiv));
  const dimmed = toGeoJSON([birke, esche], new Set(["birke"]));
  assert.equal(dimmed.features.filter((f) => !f.properties.aktiv).length, 1);
  assert.equal(dimmed.features[0].properties.art, "Sand-Birke");
});

test("countAround counts per genus inside the radius and finds the nearest tree", () => {
  const { counts, nearest } = countAround([birke, esche], 9.9525, 53.64, 250);
  assert.equal(counts.birke, 2); // 0 m and 200 m away; the third is ~3 km away
  assert.equal(counts.esche, 1);
  assert.equal(nearest.art, "Sand-Birke");
  assert.ok(nearest.dist < 1);
});

test("distanceM is accurate for short distances", () => {
  // 0.0018° latitude ≈ 200 m
  assert.ok(Math.abs(distanceM(9.9525, 53.64, 9.9525, 53.6418) - 200) < 2);
});

test("circlePolygon returns a closed ring", () => {
  const ring = circlePolygon(10, 53.6).geometry.coordinates[0];
  assert.deepEqual(ring[0], ring[ring.length - 1]);
});

test("shapePath and esc produce safe output", () => {
  for (const g of GENERA) assert.match(shapePath(g.shape, 16), /^M[\d.\s\-LZahv]+Z$/);
  assert.equal(esc(`<b>"Birke"</b>`), "&#60;b&#62;&#34;Birke&#34;&#60;/b&#62;");
});

import { readFileSync } from "node:fs";
import { addressQuery, parseAddressHits } from "../public/js/data.js";
const addrFixture = JSON.parse(readFileSync(new URL("./fixtures/addr-search.json", import.meta.url)));

test("addressQuery builds the payload of the Hamburg address search", () => {
  assert.deepEqual(addressQuery("Birkengrund", 5), { id: "addr_search", params: { query_str: "Birkengrund", size: 5 } });
});

test("parseAddressHits reads a real response of the address search", () => {
  const results = parseAddressHits(addrFixture, "Birkengrund");
  assert.equal(results[0].name, "Birkengrund");
  assert.equal(results[0].type, "street");
  assert.ok(Math.abs(results[0].lon - 9.9533) < 0.001 && Math.abs(results[0].lat - 53.64) < 0.001);
  assert.ok(results.some((r) => r.type === "address"));
});

test("parseAddressHits puts names starting with the query first and drops duplicates or broken hits", () => {
  const hit = (name, type, coords) => ({ _source: { properties: { searchfield: name, type }, geometry: { coordinates: coords } } });
  const response = { hits: { hits: [
    hit("Am Birkengrund", "Street", [10, 53.6]),
    hit("Birkengrund 3", "Address", [9.95, 53.64]),
    hit("Birkengrund 3", "Address", [9.95, 53.64]),
    hit("", "Street", [10, 53.6]),
    hit("Kaputt", "Street", []),
  ] } };
  assert.deepEqual(parseAddressHits(response, "birkengrund").map((r) => r.name), ["Birkengrund 3", "Am Birkengrund"]);
  assert.deepEqual(parseAddressHits({}, "x"), []);
});

import { spotSummaryHtml } from "../public/js/ui.js";

test("spotSummaryHtml lists the counts of the selected genera", () => {
  const html = spotSummaryHtml({ name: "Birkengrund" }, { counts: { birke: 102, esche: 1 } }, new Set(["birke", "esche"]));
  assert.match(html, /Birkengrund:/);
  assert.match(html, /<b>102<\/b> Birke/);
  assert.match(html, /<b>1<\/b> Esche/);
  assert.equal(spotSummaryHtml({ name: "x" }, { counts: {} }, new Set()), "");
});
