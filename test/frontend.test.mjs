// Tests for the browser modules that do not touch the DOM
import test from "node:test";
import assert from "node:assert/strict";
import { berlinDate, forecastFromToday, flyingToday, toGeoJSON, countAround, distanceM, circlePolygon, nextSeason } from "../public/js/data.js";
import { heroContent, shapePath, esc, seasonText, untilText } from "../public/js/ui.js";
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
  const calm = forecastFromToday({ days: [{ ...pollen.days[0], levels: { ...pollen.days[0].levels, Birke: lvl(0, "keine") } }] }, "2027-04-14");
  assert.equal(heroContent(calm, new Set(["birke"]), false).title, "Kein Pollenflug");
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

const byId = (...ids) => GENERA.filter((g) => ids.includes(g.id));

test("nextSeason finds the next start outside the season", () => {
  const s = nextSeason(byId("birke", "esche", "hasel", "erle"), "2026-10-12");
  assert.deepEqual(s.genera.map((g) => g.id), ["erle", "hasel"]);
  assert.equal(s.month, 0);
  assert.equal(s.days, 81);
  // Birch and ash start in March of the same year
  const spring = nextSeason(byId("birke", "esche"), "2027-02-10");
  assert.equal(spring.month, 2);
  assert.equal(spring.days, 19);
  // Erle has finished by April, so its next season is next January
  assert.equal(nextSeason(byId("erle"), "2027-04-14").days, 262);
});

test("nextSeason returns null while a chosen genus is in season", () => {
  assert.equal(nextSeason(byId("hasel"), "2027-01-20"), null);
  assert.equal(nextSeason(byId("erle", "birke"), "2027-05-02"), null);
  assert.equal(nextSeason([], "2027-05-02"), null);
});

test("seasonText and untilText phrase the wait", () => {
  assert.equal(untilText(0), "heute");
  assert.equal(untilText(1), "morgen");
  assert.equal(untilText(5), "in 5 Tagen");
  assert.equal(untilText(19), "in rund 3 Wochen");
  assert.equal(untilText(81), "in rund 3 Monaten");
  assert.equal(seasonText(nextSeason(byId("hasel", "erle"), "2026-10-12")), "Erle und Hasel blühen meist ab Januar, in rund 3 Monaten.");
  assert.equal(seasonText(nextSeason(byId("birke"), "2027-02-25")), "Birke blüht meist ab März, in 4 Tagen.");
});

test("heroContent shows the season pause when nothing chosen is in season", () => {
  const autumn = forecastFromToday({ days: [{ date: "2026-10-12", levels: { Birke: lvl(0, "keine"), Esche: lvl(0, "keine"), Erle: lvl(0, "keine"), Hasel: lvl(0, "keine") } }] }, "2026-10-12");
  const hero = heroContent(autumn, new Set(["birke", "esche"]), false);
  assert.equal(hero.title, "Pollenpause");
  assert.equal(hero.text, "Birke und Esche blühen meist ab März, in rund 5 Monaten.");
  // Also before the forecast has loaded, and Erle in April has finished
  assert.equal(heroContent(forecastFromToday(null, "2026-10-12"), new Set(["hasel"]), false).title, "Pollenpause");
  assert.equal(heroContent(forecastFromToday(pollen, "2027-04-14"), new Set(["erle"]), false).title, "Pollenpause");
  // Hazel flying early in December beats the calendar
  const december = forecastFromToday({ days: [{ date: "2026-12-20", levels: { Hasel: lvl(2, "gering") } }] }, "2026-12-20");
  assert.equal(heroContent(december, new Set(["hasel"]), false).title, "Hasel: gering");
});

import { HERBS, POLLEN } from "../public/js/config.js";
import { chipsHtml, forecastHtml, clockSvg, dayAngle, updatedText, aroundHtml, alsoText } from "../public/js/ui.js";

test("grasses and herbs come from the DWD keys and need no tree data", () => {
  const summer = forecastFromToday({ days: [{ date: "2027-06-10", levels: { Birke: lvl(0, "keine"), Graeser: lvl(4, "mittel"), Roggen: lvl(2, "gering") } }] }, "2027-06-10");
  const hero = heroContent(summer, new Set(["birke", "graeser", "roggen"]), false);
  assert.equal(hero.title, "Gräser: mittel");
  assert.equal(hero.color, HERBS[0].color);
  assert.match(forecastHtml(summer, new Set(["roggen"])), /Roggen.*gering/s);
  // Herbs never dim or load trees
  assert.deepEqual([...flyingToday(summer)], []);
});

test("season texts for herbs", () => {
  const byId2 = (...ids) => POLLEN.filter((g) => ids.includes(g.id));
  assert.equal(seasonText(nextSeason(byId2("graeser"), "2026-10-12")), "Gräser blühen meist ab Mai, in rund 7 Monaten.");
  assert.equal(seasonText(nextSeason(byId2("beifuss"), "2027-06-20")), "Beifuß blüht meist ab Juli, in 11 Tagen.");
  assert.equal(nextSeason(byId2("ambrosia"), "2026-10-12"), null); // still possible in October
});

test("chips, calendar and icons cover all eight pollen types", () => {
  const html = chipsHtml(new Set(["graeser"]));
  assert.equal(html.match(/class="chip"/g).length, 8);
  assert.match(html, /data-id="graeser" aria-pressed="true"/);
  assert.match(shapePath("grass", 16), /^M[\d.\sQZM]+Z$/);
});

test("heroContent says the forecast is loading before anything else", () => {
  const hero = heroContent(forecastFromToday(null, "2027-04-14"), new Set(["birke"]), false, true);
  assert.equal(hero.text, "Vorhersage wird geladen …");
  // Chips carry their colour icon in both states; CSS turns it white when pressed
  assert.match(chipsHtml(new Set(["birke"])), /data-id="birke" aria-pressed="true"><svg[^>]+><path fill="#3d5a80"/);
});

test("heroContent splits name and level while pollen is flying", () => {
  const hero = heroContent(forecastFromToday(pollen, "2027-04-14"), new Set(["birke", "esche"]), false);
  assert.equal(hero.name, "Birke");
  assert.equal(hero.level, "mittel bis hoch");
  assert.equal(alsoText(forecastFromToday(pollen, "2027-04-14"), new Set(["birke", "esche"])), "Dazu Esche gering.");
  assert.match(heroContent(forecastFromToday(pollen, "2027-04-14"), new Set(["birke"]), true).text, /erneut versuchen/);
});

test("dayAngle puts dates on the year ring", () => {
  assert.equal(dayAngle("2027-01-01"), 0);
  assert.ok(Math.abs(dayAngle("2027-07-02") - 180) < 1);
  assert.ok(dayAngle("2028-12-31") < 360);
});

test("clockSvg draws one ring of twelve months per chosen pollen and a hand on today", () => {
  const svg = clockSvg(new Set(["birke", "esche"]), "2027-04-14");
  assert.equal(svg.match(/stroke-width="11"/g).length, 24);
  assert.match(svg, /stroke="#3d5a80" stroke-opacity="1"/); // birch main season
  assert.match(svg, /class="hand" style="--angle:101\.\d+deg"/);
  assert.match(svg, /<text class="face-day" y="6">14<\/text>/);
  assert.match(svg, /aria-label="Blühzeiten im Jahreslauf: Birke von März bis Mai, Esche von März bis Mai\./);
  // Without a date (still loading) there is no hand
  assert.doesNotMatch(clockSvg(new Set(["birke"]), null), /class="hand"/);
});

test("updatedText turns the DWD timestamp into words", () => {
  assert.equal(updatedText("2026-10-20 11:00 Uhr", "2026-10-20"), "heute, 11 Uhr");
  assert.equal(updatedText("2026-10-19 11:00 Uhr", "2026-10-20"), "gestern, 11 Uhr");
  assert.equal(updatedText("2026-10-17 11:30 Uhr", "2026-10-20"), "Samstag, 17. Oktober, 11.30 Uhr");
  assert.equal(updatedText("Beispielwerte", "2026-10-20"), "Beispielwerte");
});

test("aroundHtml writes the tree count as a sentence with plurals", () => {
  const html = aroundHtml({ name: "Dein Standort", phrase: "deinen Standort" }, { counts: { birke: 102, esche: 1 }, nearest: { art: "Sand-Birke", dist: 4.2 } }, new Set(["birke", "esche"]), 250);
  assert.match(html, /Im Umkreis von 250 m um deinen Standort stehen/);
  assert.match(html, /<b>102<\/b> Birken<\/span> und <span class="tally">.*<b>1<\/b> Esche/);
  assert.match(html, /Der nächste ist eine Sand-Birke, 4 m entfernt\./);
});
